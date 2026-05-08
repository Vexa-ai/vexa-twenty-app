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
};

export type DispatchBotResult = {
  // Vexa returns the canonical meeting id as an integer.
  id: number;
  bot_id?: string;
  status: string;
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
