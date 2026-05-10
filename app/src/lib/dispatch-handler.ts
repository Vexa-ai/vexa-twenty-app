// Vexa POST /bots wrapper. The cron-dispatch handler is the only
// caller now (the per-event handlers were a dead end — see git log).

import {
  VexaClient,
  VexaConflictError,
  VexaRateLimitError,
} from 'src/lib/vexa-client';
import type { VexaPlatform } from 'src/lib/vexa-client';

export type DispatchOk = { ok: true; meetingId: number; url: string };
export type DispatchConflict = { ok: false; conflict: true };
export type DispatchRetryable = { ok: false; rateLimited: true };
export type DispatchError = { ok: false; reason: string };
export type DispatchResult =
  | DispatchOk
  | DispatchConflict
  | DispatchRetryable
  | DispatchError;

export const dispatchVexaBot = async (
  vexa: VexaClient,
  platform: VexaPlatform,
  nativeMeetingId: string,
  webhook?: { url: string; secret: string; events: string[] },
): Promise<DispatchResult> => {
  try {
    const r = await vexa.dispatchBot({
      platform,
      native_meeting_id: nativeMeetingId,
      ...(webhook ? { webhook } : {}),
    });
    return { ok: true, meetingId: r.id, url: vexa.dashboardUrl(r.id) };
  } catch (err) {
    if (err instanceof VexaRateLimitError) {
      return { ok: false, rateLimited: true };
    }
    if (err instanceof VexaConflictError) {
      // bot already scheduled for this URL — caller resolves the
      // existing meeting id from the Twenty side
      return { ok: false, conflict: true };
    }
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
};
