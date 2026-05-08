import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, RoutePayload } from 'twenty-sdk/define';

import { VEXA_WEBHOOK_LF } from 'src/constants/universal-identifiers';
import { verifyWebhookSignature } from 'src/lib/hmac';
import { dashboardBase } from 'src/lib/vexa-client';
import { CallStatus } from 'src/objects/call.object';

// Vexa pushes meeting.* events here. Contract from
// /home/dima/dev/vexa/services/meeting-api/meeting_api/webhook_delivery.py
// + .../webhooks.py:
//
//   event_type ∈ { meeting.completed, meeting.started, bot.failed,
//                  meeting.status_change }
//   data.meeting = {
//     id, user_id, platform, native_meeting_id, constructed_meeting_url,
//     status, completion_reason, failure_stage, start_time, end_time,
//     data, created_at, updated_at
//   }
//
// We verify HMAC, then upsert the matching Call row by vexaMeetingId.
// We never fetch transcript or media — the user clicks vexa_url for
// that. Cache invalidation we don't have to do.

type VexaEventType =
  | 'meeting.completed'
  | 'meeting.started'
  | 'bot.failed'
  | 'meeting.status_change';

type VexaWebhookEnvelope = {
  event_id: string;
  event_type: VexaEventType;
  api_version: string;
  created_at: string;
  data: {
    meeting: {
      id: number;
      user_id?: number;
      platform?: string;
      native_meeting_id?: string;
      constructed_meeting_url?: string;
      status?: string;
      completion_reason?: string;
      failure_stage?: string;
      start_time?: string | null;
      end_time?: string | null;
      data?: Record<string, unknown>;
      created_at?: string;
      updated_at?: string;
    };
  };
};

// status_change carries the meeting.status field — map that, with a
// sane fallback. event_type wins for the explicit ones.
const eventToStatus = (env: VexaWebhookEnvelope): CallStatus | null => {
  switch (env.event_type) {
    case 'meeting.completed':
      return CallStatus.COMPLETED;
    case 'meeting.started':
      return CallStatus.IN_PROGRESS;
    case 'bot.failed':
      return CallStatus.FAILED;
    case 'meeting.status_change':
      return mapMeetingStatus(env.data.meeting.status);
    default:
      return null;
  }
};

const mapMeetingStatus = (s: string | undefined): CallStatus | null => {
  switch ((s ?? '').toLowerCase()) {
    case 'active':
      return CallStatus.IN_PROGRESS;
    case 'completed':
      return CallStatus.COMPLETED;
    case 'failed':
      return CallStatus.FAILED;
    case 'cancelled':
    case 'canceled':
      return CallStatus.CANCELLED;
    default:
      return null;
  }
};

const handler = async (
  payload: RoutePayload<VexaWebhookEnvelope>,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const secret = process.env.VEXA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('vexa-webhook: VEXA_WEBHOOK_SECRET unset; refusing');
    return { ok: false, reason: 'NO_SECRET' };
  }

  const headers = payload.headers ?? {};
  const signature =
    headers['x-webhook-signature'] ?? headers['X-Webhook-Signature'];
  const timestamp =
    headers['x-webhook-timestamp'] ?? headers['X-Webhook-Timestamp'];

  if (
    !verifyWebhookSignature(
      payload.rawBody ?? '',
      signature,
      timestamp,
      secret,
    )
  ) {
    console.warn('vexa-webhook: signature mismatch or stale');
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  const envelope = payload.body;
  if (!envelope || !envelope.event_type || !envelope.data?.meeting?.id) {
    return { ok: false, reason: 'MALFORMED' };
  }

  const status = eventToStatus(envelope);
  if (!status) {
    // Unknown event_type or status_change with an irrelevant status —
    // tolerate; future Vexa versions may add new ones.
    return { ok: true };
  }

  const meetingIdNum = envelope.data.meeting.id;
  const meetingIdStr = String(meetingIdNum);

  const client = new CoreApiClient();

  // Upsert by vexaMeetingId. The cron may have created the row at
  // dispatch time; otherwise this is the first time we see this id.
  const found = (await client
    .query({
      call: {
        __args: { filter: { vexaMeetingId: { eq: meetingIdStr } } as any },
        id: true,
        status: true,
      },
    } as any)
    .catch(() => null)) as any;

  const existingId: string | undefined = found?.call?.id;

  const update: Record<string, unknown> = { status };
  if (envelope.event_type === 'bot.failed') {
    update.failureReason =
      envelope.data.meeting.failure_stage ??
      envelope.data.meeting.completion_reason ??
      'unknown';
  }

  if (existingId) {
    await client.mutation({
      updateCall: {
        __args: { id: existingId, data: update as any },
        id: true,
      },
    } as any);
  } else {
    await client.mutation({
      createCall: {
        __args: {
          data: {
            name: 'Vexa meeting',
            vexaMeetingId: meetingIdStr,
            vexaUrl: `${dashboardBase()}/meetings/${meetingIdNum}`,
            platform: mapPlatform(envelope.data.meeting.platform) as any,
            meetingUrl:
              envelope.data.meeting.constructed_meeting_url ?? undefined,
            ...update,
          } as any,
        },
        id: true,
      },
    } as any);
  }

  return { ok: true };
};

const mapPlatform = (raw: string | undefined): string => {
  switch ((raw ?? '').toLowerCase()) {
    case 'google_meet':
      return 'GOOGLE_MEET';
    case 'zoom':
      return 'ZOOM';
    case 'teams':
      return 'TEAMS';
    default:
      return 'OTHER';
  }
};

export default defineLogicFunction({
  universalIdentifier: VEXA_WEBHOOK_LF,
  name: 'vexa-webhook',
  description:
    'Ingest Vexa meeting.* webhooks (HMAC-verified, timestamped). Mutates the matching Call row.',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/vexa/ingest',
    httpMethod: 'POST',
    isAuthRequired: false,
    forwardedRequestHeaders: ['x-webhook-signature', 'x-webhook-timestamp'],
  },
});
