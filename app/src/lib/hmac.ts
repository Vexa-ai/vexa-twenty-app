import { createHmac, timingSafeEqual } from 'node:crypto';

// Vexa signs webhooks with HMAC-SHA256 over the raw body and ships the
// hex digest in `X-Webhook-Signature`. Reject anything that doesn't
// pass — silent ingestion of unsigned requests would let a bad actor
// write Calls into the workspace.
export const verifyWebhookSignature = (
  rawBody: string,
  signatureHeader: string | undefined,
  secret: string,
): boolean => {
  if (!signatureHeader || !secret) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(signatureHeader.trim(), 'utf8');

  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
};
