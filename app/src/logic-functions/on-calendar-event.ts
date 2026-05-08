import { CoreApiClient } from 'twenty-client-sdk/core';
import {
  DatabaseEventPayload,
  defineLogicFunction,
  ObjectRecordCreateEvent,
} from 'twenty-sdk/define';

import { VEXA_ON_CALENDAR_EVENT_LF } from 'src/constants/universal-identifiers';
import { resolveLinkage } from 'src/lib/attendee-linker';
import { parseMeetingUrl } from 'src/lib/meeting-url';
import { VexaClient, VexaRateLimitError } from 'src/lib/vexa-client';
import { CallDispatchOutcome } from 'src/objects/call.object';

// Fires on every calendarEvent.created emitted by Twenty's database.
// No cron — Twenty's calendar sync inserts the row, the row insert
// emits an event, our handler runs within milliseconds. No polling,
// no race, no horizon/lead window: react now, Vexa's bot waits in the
// meeting URL until participants arrive.
//
// Autopilot is implicit: presence of VEXA_API_KEY = consent.

type CalendarEventRecord = {
  id: string;
  title?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isCanceled?: boolean | null;
  conferenceLink?: { primaryLinkUrl?: string | null } | null;
};

const handler = async (
  payload: DatabaseEventPayload<ObjectRecordCreateEvent<CalendarEventRecord>>,
): Promise<{ skipped?: string; dispatched?: string }> => {
  const apiKey = process.env.VEXA_API_KEY;
  if (!apiKey) {
    return { skipped: 'VEXA_API_KEY unset; install incomplete' };
  }

  const event = payload.properties?.after;
  const eventId = payload.recordId ?? event?.id;
  if (!event || !eventId) {
    return { skipped: 'malformed event payload' };
  }

  if (event.isCanceled) {
    return { skipped: 'event is cancelled' };
  }

  const startMs = event.startsAt ? Date.parse(event.startsAt) : NaN;
  if (Number.isNaN(startMs) || startMs <= Date.now()) {
    return { skipped: 'event has no future start time' };
  }

  const parsed = parseMeetingUrl(event.conferenceLink?.primaryLinkUrl ?? '');
  if (!parsed || !parsed.vexaPlatform) {
    return { skipped: 'no Meet/Zoom/Teams URL' };
  }

  const client = new CoreApiClient();
  const vexa = new VexaClient(apiKey);

  // Idempotency: did a previous emission already create a Call for
  // this calendarEvent? (Twenty may re-emit .created on initial sync
  // of some channels.)
  const existing = (await client
    .query({
      call: {
        __args: { filter: { calendarEventId: { eq: eventId } } as any },
        id: true,
      },
    } as any)
    .catch(() => null)) as any;
  if (existing?.call?.id) {
    return { skipped: 'Call already exists for this calendarEvent' };
  }

  // Pull the participants Twenty already linked to People.
  const enriched = (await client
    .query({
      calendarEvent: {
        __args: { filter: { id: { eq: eventId } } as any },
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
    } as any)
    .catch(() => null)) as any;

  const participants =
    enriched?.calendarEvent?.calendarEventParticipants?.edges ?? [];
  const attendeeEmails = participants
    .map((e: any) => e.node?.handle)
    .filter(
      (h: unknown): h is string =>
        typeof h === 'string' && h.includes('@'),
    );

  const linkage = await resolveLinkage(
    client,
    participants.map((e: any) => ({
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
            calendarEventId: eventId,
            attendeeEmails,
            companyId: linkage.companyId,
            opportunityId: linkage.opportunityId,
          } as any,
        },
        id: true,
      },
    } as any);

    return { dispatched: `vexa meeting ${result.id}` };
  } catch (err) {
    if (err instanceof VexaRateLimitError) {
      return { skipped: 'rate-limited; retry on the next .updated' };
    }
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
            calendarEventId: eventId,
            attendeeEmails,
            companyId: linkage.companyId,
            opportunityId: linkage.opportunityId,
          } as any,
        },
        id: true,
      },
    } as any);
    return { skipped: `dispatch failed: ${String(err)}` };
  }
};

export default defineLogicFunction({
  universalIdentifier: VEXA_ON_CALENDAR_EVENT_LF,
  name: 'vexa-on-calendar-event',
  description:
    'Reacts to calendarEvent.created from Twenty. Dispatches a Vexa bot for any future event with a Meet/Zoom/Teams URL.',
  timeoutSeconds: 30,
  handler,
  databaseEventTriggerSettings: {
    eventName: 'calendarEvent.created',
  },
});
