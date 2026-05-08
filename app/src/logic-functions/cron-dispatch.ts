import { CoreApiClient } from 'twenty-client-sdk/core';
import { CronPayload, defineLogicFunction } from 'twenty-sdk/define';

import { VEXA_CRON_DISPATCH_LF } from 'src/constants/universal-identifiers';
import { resolveLinkage } from 'src/lib/attendee-linker';
import { dispatchVexaBot } from 'src/lib/dispatch-handler';
import { parseMeetingUrl } from 'src/lib/meeting-url';
import { VexaClient } from 'src/lib/vexa-client';
import { CallDispatchOutcome, CallPlatform } from 'src/objects/call.object';

// Calendar mirror + just-in-time bot dispatch.
//
// Every minute we walk the user's NEXT 20 upcoming CalendarEvents
// and ensure a Call row exists for each. dispatchOutcome reflects
// what we did about a Vexa bot:
//
//   PENDING       eligible (Meet URL + not cancelled), waiting for
//                 the dispatch window
//   SCHEDULED     bot dispatched at meeting start, vexa_url valid
//   ERROR         dispatch attempted, Vexa API error — see dispatchReason
//   NOT_ELIGIBLE  cancelled or no Meet URL — see dispatchReason
//
// Why 20: bounds rate-limit exposure (Twenty caps mutations at
// 100/min). Picks the soonest 20 — that's everything a sales rep
// cares about right now. Past events are out of scope; if a user
// wants historical Calls, they can extend later.
//
// Why polling: Twenty's calendar sync uses bulk SQL ops that bypass
// the workspace event emitter — DB-event triggers don't fire from
// imports.

const FUTURE_EVENTS_LIMIT = 20;
// Dispatch a bot only when the meeting is actually about to start.
// Vexa's bot then waits in the meeting URL for participants. Earlier
// dispatch wasted Vexa quota and reserved bots ahead of need.
const DISPATCH_LEAD_MS = 60 * 1000; //  1 min before scheduledStart
const DISPATCH_TAIL_MS = 5 * 60 * 1000; //  up to 5 min after start

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

  // 1. Pull the next N upcoming events. Single query, sorted ASC,
  //    bounded — keeps mutation count per tick well under Twenty's
  //    100/min rate limit and gives the user the most relevant
  //    rows on the Calls page.
  const eventsResp = (await client
    .query({
      calendarEvents: {
        __args: {
          filter: { startsAt: { gte: now.toISOString() } } as any,
          first: FUTURE_EVENTS_LIMIT,
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

  // 2. Pull existing Calls for exactly these N events. Filter by
  //    calendarEventId IN the batch — fits in one page since N=20.
  const eventIds = events.map((e) => e.id);
  const existingByCalEvId = new Map<string, ExistingCall>();
  if (eventIds.length > 0) {
    const r = (await client
      .query({
        calls: {
          __args: {
            filter: { calendarEventId: { in: eventIds } } as any,
            first: eventIds.length,
          } as any,
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
    for (const e of r?.calls?.edges ?? []) {
      const n = e.node;
      if (n.calendarEventId) existingByCalEvId.set(n.calendarEventId, n);
    }
  }

  let created = 0;
  let updated = 0;
  let dispatched = 0;
  let errors = 0;

  // 3. For each event, ensure a matching Call row reflects the truth.
  for (const ev of events) {
    const existing = existingByCalEvId.get(ev.id);

    // Reschedule detection: if the user moved the meeting after we
    // already dispatched a bot, the bot is for the OLD time slot.
    // Vexa's empty-room timeout may have already retired it. Flip
    // back to PENDING so the next dispatch-window check re-fires
    // POST /bots; if Vexa's bot is still alive, our 409 path reuses
    // the same meeting id.
    const wasRescheduledAfterDispatch =
      !!existing &&
      existing.dispatchOutcome === CallDispatchOutcome.SCHEDULED &&
      !!existing.scheduledStart &&
      !!ev.startsAt &&
      existing.scheduledStart !== ev.startsAt;

    const alreadyDispatched =
      !wasRescheduledAfterDispatch &&
      (existing?.dispatchOutcome === CallDispatchOutcome.SCHEDULED ||
        !!existing?.vexaMeetingId);
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

    // 4. Dispatch a bot only when the meeting is actually starting
    //    (or just started). Vexa's bot waits in the room for
    //    participants — but we still want to dispatch on the minute
    //    of start, not weeks ahead, to avoid burning Vexa quota and
    //    holding bot reservations for events that may get cancelled.
    const startMs = ev.startsAt ? Date.parse(ev.startsAt) : NaN;
    const inDispatchWindow =
      Number.isFinite(startMs) &&
      Date.now() >= startMs - DISPATCH_LEAD_MS &&
      Date.now() <= startMs + DISPATCH_TAIL_MS;

    if (
      target.outcome === CallDispatchOutcome.PENDING &&
      parsed?.vexaPlatform &&
      inDispatchWindow
    ) {
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
      let updateData: Record<string, unknown> | null = null;
      if (r.ok) {
        updateData = {
          dispatchOutcome: CallDispatchOutcome.SCHEDULED,
          dispatchReason: null,
          vexaMeetingId: String(r.meetingId),
          vexaUrl: r.url,
        };
      } else if ('conflict' in r && r.conflict) {
        // Recurring meeting — bot already scheduled for this URL.
        // Reuse the existing SCHEDULED Call's vexaMeetingId for this
        // shared meeting URL, so all instances point to one Vexa meeting.
        const peer = await findExistingMeetingIdByUrl(
          client,
          parsed.url,
        ).catch(() => null);
        updateData = peer
          ? {
              dispatchOutcome: CallDispatchOutcome.SCHEDULED,
              dispatchReason: null,
              vexaMeetingId: peer.vexaMeetingId,
              vexaUrl: peer.vexaUrl,
            }
          : {
              dispatchOutcome: CallDispatchOutcome.ERROR,
              dispatchReason:
                'Vexa conflict and no peer SCHEDULED Call found',
            };
      } else if ('rateLimited' in r && r.rateLimited) {
        updateData = null;
      } else if ('reason' in r) {
        updateData = {
          dispatchOutcome: CallDispatchOutcome.ERROR,
          dispatchReason: r.reason.slice(0, 500),
        };
      }
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

// On a 409 from Vexa (recurring meeting), find a sibling Call we
// already SCHEDULED for the same Meet URL and reuse its meeting id.
const findExistingMeetingIdByUrl = async (
  client: CoreApiClient,
  meetingUrl: string,
): Promise<{ vexaMeetingId: string; vexaUrl: string } | null> => {
  const r = (await client.query({
    calls: {
      __args: {
        filter: {
          and: [
            { meetingUrl: { eq: meetingUrl } },
            { dispatchOutcome: { eq: 'SCHEDULED' } },
          ],
        } as any,
        first: 1,
      } as any,
      edges: {
        node: { vexaMeetingId: true, vexaUrl: true },
      },
    },
  } as any).catch(() => null)) as any;
  const node = r?.calls?.edges?.[0]?.node;
  if (!node?.vexaMeetingId) return null;
  return {
    vexaMeetingId: String(node.vexaMeetingId),
    vexaUrl: node.vexaUrl ?? '',
  };
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
