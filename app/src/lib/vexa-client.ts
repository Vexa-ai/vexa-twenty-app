// Thin wrapper around the Vexa REST API. We hit only what MVP needs:
// dispatch a bot, and (for diagnostics) fetch a meeting's status.
// Transcript / media are NOT fetched — by design. They live in Vexa.

const DEFAULT_BASE = 'https://api.vexa.ai';

export type VexaPlatform = 'google_meet' | 'zoom' | 'teams';

export type DispatchBotInput = {
  platform: VexaPlatform;
  native_meeting_id: string;
  language?: string;
  bot_name?: string;
};

export type DispatchBotResult = {
  meeting_id: string;
  bot_id?: string;
  status: string;
};

export class VexaClient {
  constructor(
    private readonly apiKey: string,
    private readonly baseUrl: string = process.env.VEXA_API_BASE ??
      DEFAULT_BASE,
  ) {
    if (!apiKey) {
      throw new Error('VexaClient: missing VEXA_API_KEY');
    }
  }

  async dispatchBot(input: DispatchBotInput): Promise<DispatchBotResult> {
    const res = await fetch(`${this.baseUrl}/bots`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
      },
      body: JSON.stringify(input),
    });

    if (res.status === 429) {
      throw new VexaRateLimitError(
        `Vexa rate-limited bot dispatch for ${input.platform}/${input.native_meeting_id}`,
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

  // Convenience: build the dashboard deep link for a Vexa meeting id.
  // The vexa_url field in Twenty stores this; users click to jump in.
  dashboardUrl(meetingId: string): string {
    const dashBase = this.baseUrl
      .replace(/^https?:\/\/api\./, 'https://dashboard.')
      .replace(/\/$/, '');
    return `${dashBase}/m/${encodeURIComponent(meetingId)}`;
  }
}

export class VexaRateLimitError extends Error {
  readonly isRateLimit = true;
}
