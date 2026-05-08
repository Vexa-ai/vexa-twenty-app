import { CoreApiClient } from 'twenty-client-sdk/core';

import { resolveLinkage } from 'src/lib/attendee-linker';
import { parseMeetingUrl } from 'src/lib/meeting-url';
import { VexaClient, VexaRateLimitError } from 'src/lib/vexa-client';
import { CallDispatchOutcome } from 'src/objects/call.object';

// Shared handler for calendarEvent.created and calendarEvent.updated.
// Idempotent — a Call already linked to this calendarEvent short-circuits.

export type CalendarEventRecord = {
  id: string;
  title?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isCanceled?: boolean | null;
  conferenceLink?: { primaryLinkUrl?: string | null } | null;
};

export type DispatchResult = {
  skipped?: string;
  dispatched?: string;
};

export const handleCalendarEvent = async (
  eventRecord: CalendarEventRecord | null | undefined,
  recordId: string | null | undefined,
): Promise<DispatchResult> => {
  const apiKey = process.env.VEXA_API_KEY;
  if (!apiKey) {
    return { skipped: 'VEXA_API_KEY unset; install incomplete' };
  }

  const eventId = recordId ?? eventRecord?.id;
  if (!eventRecord || !eventId) {
    return { skipped: 'malformed event payload' };
  }
  if (eventRecord.isCanceled) {
    return { skipped: 'event is cancelled' };
  }

  const startMs = eventRecord.startsAt
    ? Date.parse(eventRecord.startsAt)
    : NaN;
  if (Number.isNaN(startMs) || startMs <= Date.now()) {
    return { skipped: 'event has no future start time' };
  }

  const parsed = parseMeetingUrl(
    eventRecord.conferenceLink?.primaryLinkUrl ?? '',
  );
  if (!parsed || !parsed.vexaPlatform) {
    return { skipped: 'no Meet/Zoom/Teams URL' };
  }

  const client = new CoreApiClient();
  const vexa = new VexaClient(apiKey);

  // Idempotency: if a Call already exists for this calendarEvent (from
  // an earlier .created or .updated emission), don't dispatch again.
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

  let vexaResult: { id: number } | null = null;
  let vexaErr: unknown = null;
  try {
    vexaResult = await vexa.dispatchBot({
      platform: parsed.vexaPlatform,
      native_meeting_id: parsed.nativeId,
    });
    console.log(
      `dispatch-handler: vexa POST /bots ok eventId=${eventId} vexaMeetingId=${vexaResult.id}`,
    );
  } catch (err) {
    vexaErr = err;
    if (err instanceof VexaRateLimitError) {
      console.warn(`dispatch-handler: rate-limited eventId=${eventId}`);
      return { skipped: 'rate-limited; retry next tick' };
    }
    console.error(
      `dispatch-handler: vexa POST /bots failed eventId=${eventId}: ${String(err)}`,
    );
  }

  // Always try to write a Call row — SCHEDULED on success, ERROR on
  // failure. Mutations are wrapped in their own try/catch so a
  // permission / schema error doesn't swallow both paths.
  const data: Record<string, unknown> = {
    name: eventRecord.title ?? 'Untitled meeting',
    platform: parsed.platform,
    meetingUrl: parsed.url,
    scheduledStart: eventRecord.startsAt,
    scheduledEnd: eventRecord.endsAt,
    calendarEventId: eventId,
    attendeeEmails,
    companyId: linkage.companyId,
    opportunityId: linkage.opportunityId,
  };
  if (vexaResult) {
    data.vexaMeetingId = String(vexaResult.id);
    data.vexaUrl = vexa.dashboardUrl(vexaResult.id);
    data.dispatchOutcome = CallDispatchOutcome.SCHEDULED;
  } else {
    data.dispatchOutcome = CallDispatchOutcome.ERROR;
    data.dispatchReason =
      vexaErr instanceof Error ? vexaErr.message : 'dispatch error';
  }

  try {
    await client.mutation({
      createCall: {
        __args: { data: data as any },
        id: true,
      },
    } as any);
    console.log(
      `dispatch-handler: createCall ok eventId=${eventId} outcome=${data.dispatchOutcome}`,
    );
  } catch (mutErr) {
    console.error(
      `dispatch-handler: createCall FAILED eventId=${eventId}: ${
        mutErr instanceof Error ? mutErr.stack ?? mutErr.message : String(mutErr)
      }`,
    );
    return { skipped: `createCall failed: ${String(mutErr)}` };
  }

  return vexaResult
    ? { dispatched: `vexa meeting ${vexaResult.id}` }
    : { skipped: `dispatch failed: ${String(vexaErr)}` };
};
