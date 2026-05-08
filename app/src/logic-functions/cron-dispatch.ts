import { CoreApiClient } from 'twenty-client-sdk/core';
import { CronPayload, defineLogicFunction } from 'twenty-sdk/define';

import { VEXA_CRON_DISPATCH_LF } from 'src/constants/universal-identifiers';
import { resolveLinkage } from 'src/lib/attendee-linker';
import { parseMeetingUrl } from 'src/lib/meeting-url';
import {
  evaluatePolicy,
  parseBlocklist,
  truthy,
} from 'src/lib/policy';
import { VexaClient, VexaRateLimitError } from 'src/lib/vexa-client';
import { CallDispatchOutcome } from 'src/objects/call.object';

// Every 5 minutes: read CalendarEvents in [now, now+horizon] that
// haven't yet got a Call row, evaluate the privacy policy, and
// dispatch a Vexa bot ~LEAD_MINUTES before scheduled_start. The
// resulting Call records the dispatch outcome (SCHEDULED / SKIPPED /
// ERROR) and a vexa_url pointing at the Vexa dashboard. State after
// dispatch lives in Vexa — click vexa_url to see it.
//
// AUTOPILOT_ENABLED=false short-circuits everything.

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

const handler = async (_payload: CronPayload): Promise<{ scanned: number; dispatched: number; skipped: number }> => {
  if (!truthy(process.env.AUTOPILOT_ENABLED ?? 'false')) {
    console.log('cron-dispatch: AUTOPILOT_ENABLED=false; no-op');
    return { scanned: 0, dispatched: 0, skipped: 0 };
  }

  const apiKey = process.env.VEXA_API_KEY;
  if (!apiKey) {
    console.error('cron-dispatch: VEXA_API_KEY unset; refusing');
    return { scanned: 0, dispatched: 0, skipped: 0 };
  }

  const horizonHours = Number(process.env.HORIZON_HOURS ?? '24');
  const leadMinutes = Number(process.env.LEAD_MINUTES ?? '5');
  const blocklist = parseBlocklist(process.env.DOMAIN_BLOCKLIST);
  const skipInternal = truthy(process.env.SKIP_INTERNAL_ONLY ?? 'true');

  const now = Date.now();
  const horizonMs = horizonHours * 60 * 60 * 1000;
  const leadMs = leadMinutes * 60 * 1000;

  const client = new CoreApiClient();
  const vexa = new VexaClient(apiKey);

  // Pull events in [now, now+horizon]. Twenty's CalendarEvent already
  // normalizes attendees + conference URL. Twenty's filter language
  // requires "exactly one operator per field" — gte+lte must be
  // AND-combined, not nested.
  const eventsResp = (await client.query({
    calendarEvents: {
      __args: {
        filter: {
          and: [
            { startsAt: { gte: new Date(now).toISOString() } },
            { startsAt: { lte: new Date(now + horizonMs).toISOString() } },
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
  let skipped = 0;

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
      // Not a Meet/Zoom/Teams URL — not eligible for autopilot.
      continue;
    }

    const startMs = event.startsAt ? Date.parse(event.startsAt) : NaN;
    if (Number.isNaN(startMs)) continue;
    if (startMs - now > leadMs) {
      // Not within lead window yet; we'll see it again on the next tick.
      continue;
    }

    const participants = event.calendarEventParticipants?.edges ?? [];
    const attendeeEmails = participants
      .map((e) => e.node?.handle)
      .filter((h): h is string => !!h && h.includes('@'));

    const decision = evaluatePolicy({
      attendeeEmails,
      ownerEmail: process.env.WORKSPACE_OWNER_EMAIL ?? null,
      blocklist,
      skipInternalOnly: skipInternal,
    });

    // Resolve participants → Company → Opportunity by following the
    // links Twenty already populated (CalendarEventParticipant.person).
    // No email lookup needed.
    const linkage = await resolveLinkage(
      client,
      participants.map((e) => ({
        personId: e.node?.personId ?? e.node?.person?.id ?? null,
        companyId: e.node?.person?.companyId ?? null,
      })),
    );

    if (!decision.allow) {
      await client.mutation({
        createCall: {
          __args: {
            data: {
              name: event.title ?? 'Untitled meeting',
              dispatchOutcome: CallDispatchOutcome.SKIPPED,
              dispatchReason: `policy:${decision.reason}`,
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
      skipped += 1;
      continue;
    }

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

  return { scanned, dispatched, skipped };
};

export default defineLogicFunction({
  universalIdentifier: VEXA_CRON_DISPATCH_LF,
  name: 'vexa-cron-dispatch',
  description:
    'Every 5 min: scan CalendarEvents in horizon, apply privacy policy, dispatch Vexa bots, upsert Calls.',
  timeoutSeconds: 60,
  handler,
  cronTriggerSettings: {
    pattern: '*/5 * * * *',
  },
});
