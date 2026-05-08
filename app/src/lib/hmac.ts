import { createHmac, timingSafeEqual } from 'node:crypto';

// Vexa signs webhooks per /home/dima/dev/vexa/services/meeting-api/meeting_api/webhook_delivery.py:
//   signed_content = f"{timestamp}.".encode() + body_bytes
//   sig            = hmac.sha256(secret, signed_content).hexdigest()
//   X-Webhook-Signature: sha256=<hex>
//   X-Webhook-Timestamp: <unix-ts>
//
// We verify exactly that. Reject any request that doesn't carry both
// headers and pass — silent ingestion of unsigned requests would let a
// bad actor write Calls into the workspace.

const PREFIX = 'sha256=';
const MAX_SKEW_SECONDS = 5 * 60;

export const verifyWebhookSignature = (
  rawBody: string,
  signatureHeader: string | undefined,
  timestampHeader: string | undefined,
  secret: string,
): boolean => {
  if (!signatureHeader || !timestampHeader || !secret) return false;
  const sig = signatureHeader.trim();
  if (!sig.startsWith(PREFIX)) return false;
  const provided = sig.slice(PREFIX.length);

  const ts = Number(timestampHeader.trim());
  if (!Number.isFinite(ts)) return false;
  // replay-protection: drop anything older than 5 minutes
  if (Math.abs(Date.now() / 1000 - ts) > MAX_SKEW_SECONDS) return false;

  const signedContent = Buffer.concat([
    Buffer.from(`${timestampHeader.trim()}.`, 'utf8'),
    Buffer.from(rawBody, 'utf8'),
  ]);
  const expected = createHmac('sha256', secret).update(signedContent).digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
};
