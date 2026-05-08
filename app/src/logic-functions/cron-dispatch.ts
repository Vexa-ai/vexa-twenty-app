import { CoreApiClient } from 'twenty-client-sdk/core';
import { CronPayload, defineLogicFunction } from 'twenty-sdk/define';

import { VEXA_CRON_DISPATCH_LF } from 'src/constants/universal-identifiers';
import { resolveLinkage } from 'src/lib/attendee-linker';
import { parseMeetingUrl } from 'src/lib/meeting-url';
import { VexaClient, VexaRateLimitError } from 'src/lib/vexa-client';
import { CallDispatchOutcome } from 'src/objects/call.object';

// Every 5 minutes: read CalendarEvents in [now, now+horizon] that
// haven't yet got a Call row, dispatch a Vexa bot ~LEAD_MINUTES
// before scheduled_start. The resulting Call records the dispatch
// outcome (SCHEDULED / ERROR) and a vexa_url. State after dispatch
// lives in Vexa — click vexa_url to see it.
//
// Autopilot is implicit: presence of VEXA_API_KEY = consent.
//
// Hardcoded defaults; promote to settings only when a user asks.
const HORIZON_MS = 24 * 60 * 60 * 1000; //  24h
const LEAD_MS = 5 * 60 * 1000; //  5min before scheduled_start

type CalendarEventRow = {
  id: string;
  title?: string;
  conferenceSolution?: string;
  conferenceLink?: { primaryLinkUrl?: string };
  startsAt?: string;
  endsAt?: string;
  calendarEventParticipants?: {
    edges: {
      node: {
        handle?: string;
        personId?: string | null;
        person?: { id?: string; companyId?: string | null } | null;
      };
    }[];
  };
};

const handler = async (_payload: CronPayload): Promise<{ scanned: number; dispatched: number }> => {
  const apiKey = process.env.VEXA_API_KEY;
  if (!apiKey) {
    console.log('cron-dispatch: VEXA_API_KEY unset; install incomplete');
    return { scanned: 0, dispatched: 0 };
  }

  const now = Date.now();

  const client = new CoreApiClient();
  const vexa = new VexaClient(apiKey);

  // Pull events in [now, now+24h]. Twenty's filter language requires
  // exactly one operator per field — gte+lte must be AND-combined.
  const eventsResp = (await client.query({
    calendarEvents: {
      __args: {
        filter: {
          and: [
            { startsAt: { gte: new Date(now).toISOString() } },
            { startsAt: { lte: new Date(now + HORIZON_MS).toISOString() } },
            { isCanceled: { eq: false } },
          ],
        } as any,
        first: 200,
      },
      edges: {
        node: {
          id: true,
          title: true,
          conferenceSolution: true,
          conferenceLink: { primaryLinkUrl: true } as any,
          startsAt: true,
          endsAt: true,
          calendarEventParticipants: {
            __args: { first: 50 } as any,
            edges: {
              node: {
                handle: true,
                personId: true,
                person: { id: true, companyId: true } as any,
              } as any,
            },
          } as any,
        },
      },
    },
  } as any).catch((e: unknown) => {
    console.warn('cron-dispatch: calendarEvents query failed:', e);
    return null;
  })) as any;

  const events: CalendarEventRow[] =
    eventsResp?.calendarEvents?.edges?.map((e: any) => e.node) ?? [];

  let scanned = 0;
  let dispatched = 0;

  for (const event of events) {
    scanned += 1;

    // Already have a Call for this event? skip.
    const existing = (await client.query({
      call: {
        __args: { filter: { calendarEventId: { eq: event.id } } as any },
        id: true,
      },
    } as any).catch(() => null)) as any;
    if (existing?.call?.id) continue;

    const parsed = parseMeetingUrl(event.conferenceLink?.primaryLinkUrl ?? '');
    if (!parsed || !parsed.vexaPlatform) {
      // Not a Meet/Zoom/Teams URL — not eligible.
      continue;
    }

    const startMs = event.startsAt ? Date.parse(event.startsAt) : NaN;
    if (Number.isNaN(startMs)) continue;
    if (startMs - now > LEAD_MS) {
      // Not within lead window yet; we'll see it again on the next tick.
      continue;
    }

    const participants = event.calendarEventParticipants?.edges ?? [];
    const attendeeEmails = participants
      .map((e) => e.node?.handle)
      .filter((h): h is string => !!h && h.includes('@'));

    // Resolve participants → Company → Opportunity by following the
    // links Twenty already populated (CalendarEventParticipant.person).
    const linkage = await resolveLinkage(
      client,
      participants.map((e) => ({
        personId: e.node?.personId ?? e.node?.person?.id ?? null,
        companyId: e.node?.person?.companyId ?? null,
      })),
    );

    try {
      const result = await vexa.dispatchBot({
        platform: parsed.vexaPlatform,
        native_meeting_id: parsed.nativeId,
      });

      await client.mutation({
        createCall: {
          __args: {
            data: {
              name: event.title ?? 'Untitled meeting',
              vexaMeetingId: String(result.id),
              vexaUrl: vexa.dashboardUrl(result.id),
              dispatchOutcome: CallDispatchOutcome.SCHEDULED,
              platform: parsed.platform,
              meetingUrl: parsed.url,
              scheduledStart: event.startsAt,
              scheduledEnd: event.endsAt,
              calendarEventId: event.id,
              attendeeEmails,
              companyId: linkage.companyId,
              opportunityId: linkage.opportunityId,
            } as any,
          },
          id: true,
        },
      } as any);
      dispatched += 1;
    } catch (err) {
      if (err instanceof VexaRateLimitError) {
        // Leave the event un-Called; next tick retries.
        console.warn(`cron-dispatch: rate-limited on ${event.id}; will retry`);
        continue;
      }
      // Persistent failure: write an ERROR Call so the user sees the miss.
      await client.mutation({
        createCall: {
          __args: {
            data: {
              name: event.title ?? 'Untitled meeting',
              dispatchOutcome: CallDispatchOutcome.ERROR,
              dispatchReason:
                err instanceof Error ? err.message : 'dispatch error',
              platform: parsed.platform,
              meetingUrl: parsed.url,
              scheduledStart: event.startsAt,
              scheduledEnd: event.endsAt,
              calendarEventId: event.id,
              attendeeEmails,
              companyId: linkage.companyId,
              opportunityId: linkage.opportunityId,
            } as any,
          },
          id: true,
        },
      } as any);
    }
  }

  return { scanned, dispatched };
};

export default defineLogicFunction({
  universalIdentifier: VEXA_CRON_DISPATCH_LF,
  name: 'vexa-cron-dispatch',
  description:
    'Every 5 min: scan CalendarEvents in horizon, dispatch Vexa bots, upsert Calls.',
  timeoutSeconds: 60,
  handler,
  cronTriggerSettings: {
    pattern: '*/5 * * * *',
  },
});
