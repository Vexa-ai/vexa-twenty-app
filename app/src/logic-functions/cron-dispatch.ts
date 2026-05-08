import { CoreApiClient } from 'twenty-client-sdk/core';
import { CronPayload, defineLogicFunction } from 'twenty-sdk/define';

import { VEXA_CRON_DISPATCH_LF } from 'src/constants/universal-identifiers';
import { resolveLinkage } from 'src/lib/attendee-linker';
import { dispatchVexaBot } from 'src/lib/dispatch-handler';
import { parseMeetingUrl } from 'src/lib/meeting-url';
import { VexaClient } from 'src/lib/vexa-client';
import { CallDispatchOutcome, CallPlatform } from 'src/objects/call.object';

// Calendar mirror.
//
// Every minute we walk the user's calendar (last 90d + future) and
// ensure a Call row exists for each CalendarEvent. The Call's
// dispatchOutcome reflects what we did about a Vexa bot:
//
//   PENDING       eligible (future + Meet URL + not cancelled),
//                 awaiting next dispatch attempt
//   SCHEDULED     bot dispatched, vexa_url valid
//   ERROR         dispatch attempted, Vexa API error — see dispatchReason
//   NOT_ELIGIBLE  past, cancelled, or no Meet URL — see dispatchReason
//
// Twenty's calendar sync uses bulk SQL ops that bypass the workspace
// event emitter, so we have no DB-level events to subscribe to —
// polling is the only reliable hook.

const PAST_WINDOW_MS = 90 * 24 * 60 * 60 * 1000; // last 90 days

type CalEv = {
  id: string;
  title?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isCanceled?: boolean | null;
  conferenceLink?: { primaryLinkUrl?: string | null } | null;
  calendarEventParticipants?: {
    edges: {
      node: {
        handle?: string | null;
        personId?: string | null;
        person?: { id?: string | null; companyId?: string | null } | null;
      };
    }[];
  } | null;
};

type ExistingCall = {
  id: string;
  dispatchOutcome: string;
  dispatchReason: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  calendarEventId: string | null;
  vexaMeetingId: string | null;
};

// Decide what dispatchOutcome / reason an event should have right now,
// given whether it's already been Vexa-dispatched.
const computeOutcome = (
  ev: CalEv,
  alreadyDispatched: boolean,
): { outcome: CallDispatchOutcome; reason: string | null } => {
  if (ev.isCanceled) return { outcome: CallDispatchOutcome.NOT_ELIGIBLE, reason: 'cancelled' };
  const startMs = ev.startsAt ? Date.parse(ev.startsAt) : NaN;
  if (Number.isNaN(startMs)) {
    return { outcome: CallDispatchOutcome.NOT_ELIGIBLE, reason: 'no_start_time' };
  }
  if (startMs <= Date.now()) {
    if (alreadyDispatched) return { outcome: CallDispatchOutcome.SCHEDULED, reason: null };
    return { outcome: CallDispatchOutcome.NOT_ELIGIBLE, reason: 'past_event' };
  }
  const meet = ev.conferenceLink?.primaryLinkUrl ?? '';
  const parsed = parseMeetingUrl(meet);
  if (!parsed || !parsed.vexaPlatform) {
    return { outcome: CallDispatchOutcome.NOT_ELIGIBLE, reason: 'no_conference_link' };
  }
  if (alreadyDispatched) return { outcome: CallDispatchOutcome.SCHEDULED, reason: null };
  return { outcome: CallDispatchOutcome.PENDING, reason: null };
};

const handler = async (
  _payload: CronPayload,
): Promise<{ scanned: number; created: number; updated: number; dispatched: number; errors: number }> => {
  const apiKey = process.env.VEXA_API_KEY;
  if (!apiKey) {
    return { scanned: 0, created: 0, updated: 0, dispatched: 0, errors: 0 };
  }

  // The runtime injects TWENTY_APP_ACCESS_TOKEN + TWENTY_API_KEY both
  // pointing at the application-scoped JWT, but it's currently
  // rejected on /graphql workspace reads with "Authentication is
  // required". Workaround: take TWENTY_API_KEY off the env if the
  // operator pasted a long-lived workspace admin key, so SDK's
  // fallback chain (TWENTY_APP_ACCESS_TOKEN → TWENTY_API_KEY) lands
  // on theirs. Hard-overwrite via setAuthorizationToken below to be
  // sure.
  const adminKey = process.env.TWENTY_API_KEY ?? '';
  delete (process.env as Record<string, string | undefined>).TWENTY_APP_ACCESS_TOKEN;
  const client = new CoreApiClient();
  if (adminKey) {
    (client as any).setAuthorizationToken?.(adminKey);
  }
  const vexa = new VexaClient(apiKey);

  const now = new Date();
  const pastEdge = new Date(now.getTime() - PAST_WINDOW_MS);

  // 1. Pull calendar events in window.
  const eventsResp = (await client
    .query({
      calendarEvents: {
        __args: {
          filter: { startsAt: { gte: pastEdge.toISOString() } } as any,
          first: 500,
          orderBy: [{ startsAt: 'AscNullsLast' }] as any,
        },
        edges: {
          node: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            isCanceled: true,
            conferenceLink: { primaryLinkUrl: true } as any,
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
    } as any)
    .catch((e: unknown) => {
      console.warn('cron-dispatch: calendarEvents query failed:', e);
      return null;
    })) as any;

  const events: CalEv[] =
    eventsResp?.calendarEvents?.edges?.map((e: any) => e.node) ?? [];

  // 2. Pull existing Calls keyed by calendarEventId. Twenty has no
  //    bulk-by-id-in filter on the workspace API for our custom field,
  //    so fetch all (typical workspace will have << 1000 Calls; we'll
  //    paginate later if it grows).
  const callsResp = (await client
    .query({
      calls: {
        __args: { first: 500 } as any,
        edges: {
          node: {
            id: true,
            dispatchOutcome: true,
            dispatchReason: true,
            scheduledStart: true,
            scheduledEnd: true,
            calendarEventId: true,
            vexaMeetingId: true,
          },
        },
      },
    } as any)
    .catch((e: unknown) => {
      console.warn('cron-dispatch: calls query failed:', e);
      return null;
    })) as any;

  const existingByCalEvId = new Map<string, ExistingCall>();
  for (const e of callsResp?.calls?.edges ?? []) {
    const n = e.node;
    if (n.calendarEventId) existingByCalEvId.set(n.calendarEventId, n);
  }

  let created = 0;
  let updated = 0;
  let dispatched = 0;
  let errors = 0;

  // 3. For each event, ensure a matching Call row reflects the truth.
  for (const ev of events) {
    const existing = existingByCalEvId.get(ev.id);
    const alreadyDispatched =
      existing?.dispatchOutcome === CallDispatchOutcome.SCHEDULED ||
      !!existing?.vexaMeetingId;
    const target = computeOutcome(ev, alreadyDispatched);

    const parsed = parseMeetingUrl(ev.conferenceLink?.primaryLinkUrl ?? '');

    const data: Record<string, unknown> = {
      name: ev.title ?? 'Untitled meeting',
      scheduledStart: ev.startsAt ?? null,
      scheduledEnd: ev.endsAt ?? null,
      calendarEventId: ev.id,
      platform: parsed?.platform ?? CallPlatform.OTHER,
      meetingUrl: parsed?.url ?? ev.conferenceLink?.primaryLinkUrl ?? null,
      dispatchOutcome: target.outcome,
      dispatchReason: target.reason,
    };

    // Linkage only on first creation (cost: ≥1 GraphQL query per
    // distinct attendee). Existing rows keep whatever we resolved
    // last time; rebuilds are a future optimization.
    if (!existing) {
      const participants = ev.calendarEventParticipants?.edges ?? [];
      data.attendeeEmails = participants
        .map((p) => p.node?.handle)
        .filter(
          (h: unknown): h is string =>
            typeof h === 'string' && h.includes('@'),
        );
      const linkage = await resolveLinkage(
        client,
        participants.map((p) => ({
          personId: p.node?.personId ?? p.node?.person?.id ?? null,
          companyId: p.node?.person?.companyId ?? null,
        })),
      );
      data.companyId = linkage.companyId;
      data.opportunityId = linkage.opportunityId;

      try {
        await client.mutation({
          createCall: {
            __args: { data: data as any },
            id: true,
          },
        } as any);
        created += 1;
      } catch (err) {
        errors += 1;
        console.error(
          `cron-dispatch: createCall failed event=${ev.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }
    } else if (
      existing.dispatchOutcome !== target.outcome ||
      existing.dispatchReason !== target.reason ||
      existing.scheduledStart !== ev.startsAt ||
      existing.scheduledEnd !== ev.endsAt
    ) {
      try {
        await client.mutation({
          updateCall: {
            __args: { id: existing.id, data: data as any },
            id: true,
          },
        } as any);
        updated += 1;
      } catch (err) {
        errors += 1;
        console.error(
          `cron-dispatch: updateCall failed call=${existing.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        continue;
      }
    }

    // 4. Dispatch a bot for any PENDING event that's still eligible.
    if (target.outcome === CallDispatchOutcome.PENDING && parsed?.vexaPlatform) {
      const r = await dispatchVexaBot(
        vexa,
        parsed.vexaPlatform,
        parsed.nativeId,
      );
      // Re-find the Call id (may have just been created above).
      const callId =
        existing?.id ??
        (await findCallIdByEvent(client, ev.id).catch(() => null));
      if (!callId) {
        errors += 1;
        continue;
      }
      const updateData: Record<string, unknown> = r.ok
        ? {
            dispatchOutcome: CallDispatchOutcome.SCHEDULED,
            dispatchReason: null,
            vexaMeetingId: String(r.meetingId),
            vexaUrl: r.url,
          }
        : r.rateLimited
        ? null
        : {
            dispatchOutcome: CallDispatchOutcome.ERROR,
            dispatchReason: r.reason.slice(0, 500),
          };
      if (updateData) {
        try {
          await client.mutation({
            updateCall: {
              __args: { id: callId, data: updateData as any },
              id: true,
            },
          } as any);
          if (r.ok) dispatched += 1;
          else errors += 1;
        } catch (err) {
          errors += 1;
          console.error(
            `cron-dispatch: post-dispatch updateCall failed call=${callId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      }
    }
  }

  console.log(
    `cron-dispatch: scanned=${events.length} created=${created} updated=${updated} dispatched=${dispatched} errors=${errors}`,
  );
  return { scanned: events.length, created, updated, dispatched, errors };
};

const findCallIdByEvent = async (
  client: CoreApiClient,
  calendarEventId: string,
): Promise<string | null> => {
  const r = (await client.query({
    call: {
      __args: { filter: { calendarEventId: { eq: calendarEventId } } as any },
      id: true,
    },
  } as any)) as any;
  return r?.call?.id ?? null;
};

export default defineLogicFunction({
  universalIdentifier: VEXA_CRON_DISPATCH_LF,
  name: 'vexa-cron-dispatch',
  description:
    'Every minute: mirror calendar (last 90d + future) into Calls and dispatch Vexa bots for eligible upcoming meetings.',
  timeoutSeconds: 120,
  handler,
  cronTriggerSettings: {
    pattern: '* * * * *',
  },
});
