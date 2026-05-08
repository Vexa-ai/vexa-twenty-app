// Vexa POST /bots wrapper. The cron-dispatch handler is the only
// caller now (the per-event handlers were a dead end — see git log).

import { VexaClient, VexaRateLimitError } from 'src/lib/vexa-client';
import type { VexaPlatform } from 'src/lib/vexa-client';

export type DispatchOk = { ok: true; meetingId: number; url: string };
export type DispatchError = { ok: false; rateLimited: boolean; reason: string };
export type DispatchResult = DispatchOk | DispatchError;

export const dispatchVexaBot = async (
  vexa: VexaClient,
  platform: VexaPlatform,
  nativeMeetingId: string,
): Promise<DispatchResult> => {
  try {
    const r = await vexa.dispatchBot({
      platform,
      native_meeting_id: nativeMeetingId,
    });
    return { ok: true, meetingId: r.id, url: vexa.dashboardUrl(r.id) };
  } catch (err) {
    if (err instanceof VexaRateLimitError) {
      return { ok: false, rateLimited: true, reason: 'rate-limited' };
    }
    return {
      ok: false,
      rateLimited: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
};
