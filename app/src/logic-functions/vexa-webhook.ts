import { createHmac, timingSafeEqual } from 'node:crypto';
import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, RoutePayload } from 'twenty-sdk/define';

import { VEXA_WEBHOOK_LF } from 'src/constants/universal-identifiers';
import { CallDispatchOutcome } from 'src/objects/call.object';

// Vexa → Twenty webhook receiver. POST /s/vexa-webhook.
//
// Auth is HMAC, not Twenty's app-token system, because Vexa-side
// delivery has no Twenty credentials. The shared secret is set in
// the VEXA_WEBHOOK_SECRET applicationVariable and on the Vexa side
// per-meeting via the cron's dispatch headers.
//
// Signature (per services/meeting-api/webhook_delivery.py):
//   X-Webhook-Signature: sha256=<hex>
//   X-Webhook-Timestamp: <unix-seconds>
//   sig = HMAC-SHA256(secret, f"{ts}." + rawBody)
//
// Envelope (per webhook_delivery.build_envelope):
//   { event_id, event_type, api_version, created_at,
//     data: { meeting: { id, status, completion_reason, start_time,
//                         end_time, ... } } }
//
// We subscribe to meeting.completed + bot.failed in the cron dispatch
// payload — both terminal states that warrant updating the Twenty
// Call row. Other events arriving here are ack'd but ignored.

const REPLAY_WINDOW_SEC = 5 * 60;

type VexaMeetingPayload = {
  id: number;
  status?: string;
  completion_reason?: string | null;
  start_time?: string | null;
  end_time?: string | null;
};

type VexaWebhookEnvelope = {
  event_id?: string;
  event_type?: string;
  api_version?: string;
  created_at?: string;
  data?: { meeting?: VexaMeetingPayload };
};

const verifySignature = (
  secret: string,
  timestamp: string,
  rawBody: string,
  providedSig: string,
): boolean => {
  const ts = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(ts)) return false;
  const ageSec = Math.abs(Date.now() / 1000 - ts);
  if (ageSec > REPLAY_WINDOW_SEC) return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const provided = providedSig.startsWith('sha256=')
    ? providedSig.slice('sha256='.length)
    : providedSig;
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
};

const handler = async (
  payload: RoutePayload<VexaWebhookEnvelope>,
): Promise<{ ok: true; processed: boolean; reason?: string }> => {
  const secret = process.env.VEXA_WEBHOOK_SECRET ?? '';
  if (!secret) {
    // Configuration error — return 200 so Vexa doesn't retry indefinitely
    // against a deployment that hasn't enabled webhooks yet.
    console.warn(
      'vexa-webhook: VEXA_WEBHOOK_SECRET unset; rejecting (returns ok to suppress Vexa retries)',
    );
    return { ok: true, processed: false, reason: 'no_secret_configured' };
  }

  const rawBody = payload.rawBody ?? '';
  const headers = payload.headers ?? {};
  const sig =
    headers['x-webhook-signature'] ??
    headers['X-Webhook-Signature'] ??
    '';
  const ts =
    headers['x-webhook-timestamp'] ??
    headers['X-Webhook-Timestamp'] ??
    '';

  if (!sig || !ts) {
    console.warn('vexa-webhook: missing signature headers');
    return { ok: true, processed: false, reason: 'missing_signature' };
  }
  if (!verifySignature(secret, ts, rawBody, sig)) {
    console.warn('vexa-webhook: signature mismatch');
    return { ok: true, processed: false, reason: 'bad_signature' };
  }

  const envelope = payload.body;
  const meeting = envelope?.data?.meeting;
  const eventType = envelope?.event_type ?? '';
  if (!meeting || !meeting.id) {
    return { ok: true, processed: false, reason: 'no_meeting_in_payload' };
  }

  // Only the events we asked for in the dispatch subscription
  // mutate Twenty state. Others ack to keep Vexa quiet.
  const isTerminal =
    eventType === 'meeting.completed' || eventType === 'bot.failed';
  if (!isTerminal) {
    return { ok: true, processed: false, reason: `ignored:${eventType}` };
  }

  // Workspace auth — same workaround as cron-dispatch (see #20423).
  const adminKey = process.env.TWENTY_API_KEY ?? '';
  delete (process.env as Record<string, string | undefined>)
    .TWENTY_APP_ACCESS_TOKEN;
  const client = new CoreApiClient();
  if (adminKey) {
    (client as any).setAuthorizationToken?.(adminKey);
  }

  // Find the Call row that points at this Vexa meeting.
  const vexaMeetingId = String(meeting.id);
  const lookup = (await client
    .query({
      call: {
        __args: {
          filter: { vexaMeetingId: { eq: vexaMeetingId } } as any,
        } as any,
        id: true,
      },
    } as any)
    .catch((e: unknown) => {
      console.error('vexa-webhook: call lookup failed:', e);
      return null;
    })) as any;
  const callId = lookup?.call?.id;
  if (!callId) {
    return { ok: true, processed: false, reason: 'no_matching_call' };
  }

  const startMs = meeting.start_time ? Date.parse(meeting.start_time) : NaN;
  const endMs = meeting.end_time ? Date.parse(meeting.end_time) : NaN;
  const durationSec =
    Number.isFinite(startMs) && Number.isFinite(endMs)
      ? Math.max(0, Math.round((endMs - startMs) / 1000))
      : null;

  const isBotFailure = eventType === 'bot.failed';
  const updateData: Record<string, unknown> = {
    vexaCompletionReason: meeting.completion_reason ?? null,
    durationSec,
    lastEnrichedAt: new Date().toISOString(),
    ...(isBotFailure
      ? {
          dispatchOutcome: CallDispatchOutcome.ERROR,
          dispatchReason:
            `Vexa ${eventType}: ${meeting.completion_reason ?? meeting.status ?? 'unknown'}`.slice(
              0,
              500,
            ),
        }
      : {}),
  };

  try {
    await client.mutation({
      updateCall: {
        __args: { id: callId, data: updateData as any },
        id: true,
      },
    } as any);
    console.log(
      `vexa-webhook: ${eventType} processed callId=${callId} vexaMeetingId=${vexaMeetingId}`,
    );
    return { ok: true, processed: true };
  } catch (err) {
    console.error(
      `vexa-webhook: updateCall failed callId=${callId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return { ok: true, processed: false, reason: 'update_failed' };
  }
};

export default defineLogicFunction({
  universalIdentifier: VEXA_WEBHOOK_LF,
  name: 'vexa-webhook',
  description:
    'Receives meeting.completed / bot.failed callbacks from Vexa, verifies HMAC, updates the matching Call row.',
  timeoutSeconds: 30,
  handler,
  httpRouteTriggerSettings: {
    path: '/vexa-webhook',
    httpMethod: 'POST' as any,
    // Vexa-side requests have no Twenty credentials. Auth is HMAC on
    // X-Webhook-Signature using VEXA_WEBHOOK_SECRET. Don't gate this
    // endpoint on Twenty's app-token system.
    isAuthRequired: false,
    forwardedRequestHeaders: ['X-Webhook-Signature', 'X-Webhook-Timestamp'],
  },
});
