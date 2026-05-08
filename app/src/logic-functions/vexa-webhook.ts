import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, RoutePayload } from 'twenty-sdk/define';

import { VEXA_WEBHOOK_LF } from 'src/constants/universal-identifiers';
import { verifyWebhookSignature } from 'src/lib/hmac';
import { CallStatus } from 'src/objects/call.object';

// Vexa pushes meeting.* events here. We verify the HMAC, then mutate
// the matching Call row by vexa_meeting_id. We never fetch transcript
// or media — the user clicks vexa_url for that. This is the cache
// invalidation we don't have to do.

type VexaWebhookEnvelope = {
  event_id: string;
  event_type:
    | 'meeting.scheduled'
    | 'meeting.started'
    | 'meeting.completed'
    | 'meeting.failed'
    | 'meeting.cancelled';
  api_version: string;
  created_at: string;
  data: {
    meeting: {
      id: string;
      platform: string;
      native_meeting_id: string;
      constructed_meeting_url?: string;
      status?: string;
      completion_reason?: string;
      failure_stage?: string;
      start_time?: string;
      end_time?: string;
    };
  };
};

const EVENT_TO_STATUS: Record<VexaWebhookEnvelope['event_type'], CallStatus> = {
  'meeting.scheduled': CallStatus.SCHEDULED,
  'meeting.started': CallStatus.IN_PROGRESS,
  'meeting.completed': CallStatus.COMPLETED,
  'meeting.failed': CallStatus.FAILED,
  'meeting.cancelled': CallStatus.CANCELLED,
};

const handler = async (
  payload: RoutePayload<VexaWebhookEnvelope>,
): Promise<{ ok: true } | { ok: false; reason: string }> => {
  const secret = process.env.VEXA_WEBHOOK_SECRET;
  if (!secret) {
    console.error('vexa-webhook: VEXA_WEBHOOK_SECRET unset; refusing');
    return { ok: false, reason: 'NO_SECRET' };
  }

  const signature =
    payload.headers['x-webhook-signature'] ??
    payload.headers['X-Webhook-Signature'];

  if (!verifyWebhookSignature(payload.rawBody ?? '', signature, secret)) {
    console.warn('vexa-webhook: signature mismatch');
    return { ok: false, reason: 'BAD_SIGNATURE' };
  }

  const envelope = payload.body;
  if (!envelope || !envelope.event_type || !envelope.data?.meeting?.id) {
    return { ok: false, reason: 'MALFORMED' };
  }

  const status = EVENT_TO_STATUS[envelope.event_type];
  if (!status) {
    // Unknown event types are tolerated; future Vexa versions may add new ones.
    return { ok: true };
  }

  const client = new CoreApiClient();
  const meetingId = envelope.data.meeting.id;

  // Upsert by vexaMeetingId. The cron may have created a row in
  // PENDING_SCHEDULE before Vexa knew the canonical id; in that case
  // we'd have written meetingId at dispatch time and can find it.
  const found = (await client.query({
    calls: {
      __args: {
        filter: { vexaMeetingId: { eq: meetingId } } as any,
        limit: 1,
      },
      edges: { node: { id: true, status: true } },
    },
  } as any)) as any;

  const existingId: string | undefined =
    found?.calls?.edges?.[0]?.node?.id;

  const update: Record<string, unknown> = {
    status,
  };

  if (envelope.event_type === 'meeting.failed') {
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
    // First time we see this meeting — webhook arrived before any cron
    // dispatch row. Create with what we know.
    await client.mutation({
      createCall: {
        __args: {
          data: {
            vexaMeetingId: meetingId,
            vexaUrl: dashboardUrlFor(meetingId),
            status,
            platform: mapPlatform(envelope.data.meeting.platform),
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

const dashboardUrlFor = (meetingId: string): string => {
  const base = process.env.VEXA_API_BASE ?? 'https://api.vexa.ai';
  const dashBase = base
    .replace(/^https?:\/\/api\./, 'https://dashboard.')
    .replace(/\/$/, '');
  return `${dashBase}/m/${encodeURIComponent(meetingId)}`;
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
    'Ingest Vexa meeting.* webhooks (HMAC-verified). Mutates the matching Call row.',
  timeoutSeconds: 15,
  handler,
  httpRouteTriggerSettings: {
    path: '/vexa/ingest',
    httpMethod: 'POST',
    isAuthRequired: false,
    forwardedRequestHeaders: ['x-webhook-signature'],
  },
});
