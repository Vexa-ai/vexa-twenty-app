// Thin wrapper around the Vexa REST API. We hit only what MVP needs:
// dispatch a bot. Transcript / media are NOT fetched — by design.
// They live in Vexa.

const DEFAULT_API_BASE = 'https://api.cloud.vexa.ai';
const DEFAULT_DASHBOARD_BASE = 'https://dashboard.vexa.ai';

export type VexaPlatform = 'google_meet' | 'zoom' | 'teams';

export type DispatchBotInput = {
  platform: VexaPlatform;
  native_meeting_id: string;
  language?: string;
  bot_name?: string;
  // Optional per-meeting webhook override. Passed via X-User-Webhook-*
  // headers on POST /bots — Vexa persists them in meeting.data and
  // signs deliveries HMAC-SHA256("{ts}." + body, secret). Setting these
  // here overrides the user's account-default webhook for this meeting
  // only. Drop the field to leave the account default in place.
  webhook?: {
    url: string;
    secret: string;
    events: string[]; // e.g. ['meeting.completed', 'bot.failed']
  };
};

export type DispatchBotResult = {
  // Vexa returns the canonical meeting id as an integer.
  id: number;
  bot_id?: string;
  status: string;
};

// Subset of Vexa's TranscriptionResponse we hoist into Twenty. We
// intentionally ignore segments/recordings/notes — those stay in
// Vexa per ownership boundary.
type VexaTranscriptResponse = {
  id: number;
  start_time?: string | null;
  end_time?: string | null;
  data?: { completion_reason?: string | null } | null;
};

export type VexaMeetingMeta = {
  id: number;
  durationSec: number | null;
  completionReason: string | null;
};

export class VexaClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = process.env.VEXA_API_BASE ??
      DEFAULT_API_BASE,
  ) {
    if (!apiKey) {
      throw new Error('VexaClient: missing VEXA_API_KEY');
    }
  }

  // Backfill lookup. Vexa returns a TranscriptionResponse that
  // includes segments[], recordings[], notes, and the meeting's
  // identity fields. We deliberately read ONLY identity/metadata
  // — id, start_time, end_time, data.completion_reason — so the
  // transcript content stays in Vexa per the pointer-architecture
  // ownership boundary. 404 means Vexa has no meeting for this URL,
  // which is the most common case for past calendar events.
  async getMeetingMetaByUrl(
    platform: VexaPlatform,
    nativeMeetingId: string,
  ): Promise<VexaMeetingMeta | null> {
    const res = await fetch(
      `${this.baseUrl}/transcripts/${platform}/${encodeURIComponent(nativeMeetingId)}`,
      { headers: { 'X-API-Key': this.apiKey } },
    );
    if (res.status === 404) return null;
    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      throw new Error(
        `Vexa GET /transcripts failed: ${res.status} ${res.statusText} — ${body}`,
      );
    }
    const json = (await res.json()) as VexaTranscriptResponse;
    const start = json.start_time ? Date.parse(json.start_time) : NaN;
    const end = json.end_time ? Date.parse(json.end_time) : NaN;
    const durationSec =
      Number.isFinite(start) && Number.isFinite(end)
        ? Math.max(0, Math.round((end - start) / 1000))
        : null;
    return {
      id: json.id,
      durationSec,
      completionReason: json.data?.completion_reason ?? null,
    };
  }

  async dispatchBot(input: DispatchBotInput): Promise<DispatchBotResult> {
    const { webhook, ...body } = input;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-API-Key': this.apiKey,
    };
    if (webhook?.url) {
      headers['X-User-Webhook-URL'] = webhook.url;
      if (webhook.secret) {
        headers['X-User-Webhook-Secret'] = webhook.secret;
      }
      if (webhook.events?.length) {
        headers['X-User-Webhook-Events'] = webhook.events.join(',');
      }
    }
    const res = await fetch(`${this.baseUrl}/bots`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (res.status === 429) {
      throw new VexaRateLimitError(
        `Vexa rate-limited bot dispatch for ${input.platform}/${input.native_meeting_id}`,
      );
    }

    // 409 on recurring meetings — the bot is already scheduled for
    // this (platform, native_meeting_id). Caller (cron-dispatch)
    // detects this and reuses the existing Twenty Call's
    // vexaMeetingId for this meeting URL.
    if (res.status === 409) {
      throw new VexaConflictError(
        `Vexa active meeting already exists for ${input.platform}/${input.native_meeting_id}`,
      );
    }

    if (!res.ok) {
      const body = await res.text().catch(() => '<unreadable>');
      throw new Error(
        `Vexa POST /bots failed: ${res.status} ${res.statusText} — ${body}`,
      );
    }

    return (await res.json()) as DispatchBotResult;
  }

  // Deep link to the meeting in the Vexa dashboard. Convention from
  // /home/dima/dev/vexa/services/dashboard/src/app/meetings/[id]/page.tsx:
  //   /meetings/<integer meeting id>
  dashboardUrl(meetingId: number | string): string {
    return `${dashboardBase()}/meetings/${meetingId}`;
  }
}

export const dashboardBase = (): string =>
  process.env.VEXA_DASHBOARD_BASE ?? DEFAULT_DASHBOARD_BASE;

export class VexaRateLimitError extends Error {
  readonly isRateLimit = true;
}

export class VexaConflictError extends Error {
  readonly isConflict = true;
}
