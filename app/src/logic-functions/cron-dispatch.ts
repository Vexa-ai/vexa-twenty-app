import { CoreApiClient } from 'twenty-client-sdk/core';
import { CronPayload, defineLogicFunction } from 'twenty-sdk/define';

import { VEXA_CRON_DISPATCH_LF } from 'src/constants/universal-identifiers';
import { handleCalendarEvent } from 'src/lib/dispatch-handler';

// Every minute: scan upcoming CalendarEvents and dispatch a Vexa bot
// for each one we don't already have a Call for. Twenty's calendar
// sync uses bulk SQL ops that bypass the event emitter, so we have
// no .created/.updated to subscribe to — polling is the only path.
//
// The shared handler in lib/dispatch-handler is idempotent on
// calendarEventId, so re-firing every minute over the same set is
// safe and cheap.
//
// Autopilot is implicit: presence of VEXA_API_KEY = consent.
const HORIZON_MS = 24 * 60 * 60 * 1000; //  24h ahead

const handler = async (
  _payload: CronPayload,
): Promise<{ scanned: number; dispatched: number }> => {
  if (!process.env.VEXA_API_KEY) {
    return { scanned: 0, dispatched: 0 };
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + HORIZON_MS);
  const client = new CoreApiClient();

  const eventsResp = (await client
    .query({
      calendarEvents: {
        __args: {
          filter: {
            and: [
              { startsAt: { gte: now.toISOString() } },
              { startsAt: { lte: horizon.toISOString() } },
              { isCanceled: { eq: false } },
            ],
          } as any,
          first: 200,
        },
        edges: {
          node: {
            id: true,
            title: true,
            startsAt: true,
            endsAt: true,
            isCanceled: true,
            conferenceLink: { primaryLinkUrl: true } as any,
          },
        },
      },
    } as any)
    .catch((e: unknown) => {
      console.warn('cron-dispatch: calendarEvents query failed:', e);
      return null;
    })) as any;

  const events = eventsResp?.calendarEvents?.edges ?? [];
  let dispatched = 0;
  for (const e of events) {
    const r = await handleCalendarEvent(e.node, e.node?.id);
    if (r.dispatched) dispatched += 1;
  }
  return { scanned: events.length, dispatched };
};

export default defineLogicFunction({
  universalIdentifier: VEXA_CRON_DISPATCH_LF,
  name: 'vexa-cron-dispatch',
  description:
    'Every minute: scan upcoming CalendarEvents and dispatch Vexa bots. Idempotent — Twenty does not fire DB events for calendar sync, so polling is required.',
  timeoutSeconds: 60,
  handler,
  cronTriggerSettings: {
    pattern: '* * * * *',
  },
});
