import { CoreApiClient } from 'twenty-client-sdk/core';
import { defineLogicFunction, RoutePayload } from 'twenty-sdk/define';

import { VEXA_BACKFILL_LF } from 'src/constants/universal-identifiers';
import { resolveLinkage } from 'src/lib/attendee-linker';
import { parseMeetingUrl } from 'src/lib/meeting-url';
import { VexaClient } from 'src/lib/vexa-client';
import { CallDispatchOutcome, CallPlatform } from 'src/objects/call.object';

// One-shot backfill. POST /backfill { sinceDays?: number, force?: bool, batchSize?: number }
//
// What this does:
//   For each CalendarEvent in the last `sinceDays` (default 90),
//   ensure a Call row exists pointing at the right Vexa meeting (if
//   Vexa has one for that URL). Pure pointer enrichment — no
//   transcript, no segments, no recording content. Twenty owns
//   mapping; Vexa owns the content. We hoist three identity-level
//   fields (durationSec, vexaCompletionReason, lastEnrichedAt) so
//   the Calls list is useful without round-tripping to Vexa for
//   every render, but nothing beyond that.
//
// Idempotent: a Call enriched within the last 24h is skipped unless
// `force: true`. Re-runnable any time.
//
// Authentication: same TWENTY_API_KEY workaround as the cron — see
// the long comment in cron-dispatch.ts. Once twentyhq/twenty#20423
// ships a backend auth path, drop the override.

const DEFAULT_SINCE_DAYS = 90;
const DEFAULT_BATCH = 50;
const RECENT_ENRICHMENT_MS = 24 * 60 * 60 * 1000;
const VEXA_INTER_CALL_DELAY_MS = 25;

type CalEv = {
  id: string;
  title?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
  isCanceled?: boolean | null;
  conferenceLink?: { primaryLinkUrl?: string | null } | null;
  calendarEventParticipants?: {
    edges: {
      node: {
        handle?: string | null;
        displayName?: string | null;
        personId?: string | null;
        person?: {
          id?: string | null;
          companyId?: string | null;
          name?: { firstName?: string | null; lastName?: string | null } | null;
        } | null;
      };
    }[];
  } | null;
};

type ExistingCall = {
  id: string;
  calendarEventId: string | null;
  vexaMeetingId: string | null;
  lastEnrichedAt: string | null;
};

type BackfillBody = {
  sinceDays?: number;
  force?: boolean;
  batchSize?: number;
};

type BackfillResult = {
  scanned: number;
  callsCreated: number;
  callsEnriched: number;
  noVexaMeeting: number;
  notEligible: number;
  skipped: number;
  errors: number;
  sinceDays: number;
  force: boolean;
};

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

const handler = async (
  payload: RoutePayload<BackfillBody>,
): Promise<BackfillResult> => {
  const body = payload.body ?? {};
  const sinceDays = Math.max(
    1,
    Math.min(365, body.sinceDays ?? DEFAULT_SINCE_DAYS),
  );
  const force = body.force === true;
  const batchSize = Math.max(10, Math.min(200, body.batchSize ?? DEFAULT_BATCH));

  const apiKey = process.env.VEXA_API_KEY;
  if (!apiKey) {
    throw new Error('VEXA_API_KEY is not configured');
  }
  const adminKey = process.env.TWENTY_API_KEY ?? '';
  delete (process.env as Record<string, string | undefined>)
    .TWENTY_APP_ACCESS_TOKEN;
  const client = new CoreApiClient();
  if (adminKey) {
    (client as any).setAuthorizationToken?.(adminKey);
  }
  const vexa = new VexaClient(apiKey);

  const now = new Date();
  const since = new Date(now.getTime() - sinceDays * 24 * 60 * 60 * 1000);
  const recentEnrichmentCutoff = new Date(now.getTime() - RECENT_ENRICHMENT_MS);

  const result: BackfillResult = {
    scanned: 0,
    callsCreated: 0,
    callsEnriched: 0,
    noVexaMeeting: 0,
    notEligible: 0,
    skipped: 0,
    errors: 0,
    sinceDays,
    force,
  };

  // 1. Page through CalendarEvents in the window, oldest-first. We
  //    use endCursor pagination to avoid loading everything into
  //    memory; each iteration processes one batch end-to-end before
  //    fetching the next.
  let afterCursor: string | null = null;
  while (true) {
    const eventsResp = (await client
      .query({
        calendarEvents: {
          __args: {
            filter: {
              and: [
                { startsAt: { gte: since.toISOString() } },
                { startsAt: { lt: now.toISOString() } },
              ],
            } as any,
            first: batchSize,
            orderBy: [{ startsAt: 'AscNullsLast' }] as any,
            ...(afterCursor ? { after: afterCursor } : {}),
          },
          edges: {
            cursor: true,
            node: {
              id: true,
              title: true,
              startsAt: true,
              endsAt: true,
              isCanceled: true,
              conferenceLink: { primaryLinkUrl: true } as any,
              calendarEventParticipants: {
                __args: { first: 50 } as any,
                edges: {
                  node: {
                    handle: true,
                    displayName: true,
                    personId: true,
                    person: {
                      id: true,
                      companyId: true,
                      name: { firstName: true, lastName: true } as any,
                    } as any,
                  } as any,
                },
              } as any,
            },
          },
          pageInfo: { endCursor: true, hasNextPage: true } as any,
        },
      } as any)
      .catch((e: unknown) => {
        console.error('backfill: calendarEvents query failed:', e);
        return null;
      })) as any;

    const edges = eventsResp?.calendarEvents?.edges ?? [];
    if (edges.length === 0) break;

    const events: CalEv[] = edges.map((e: any) => e.node);
    result.scanned += events.length;

    // 2. Look up Calls already keyed to these CalendarEvents in one
    //    shot, so we know whether we're creating or updating.
    const eventIds = events.map((e) => e.id);
    const existingByCalEvId = new Map<string, ExistingCall>();
    if (eventIds.length > 0) {
      const r = (await client
        .query({
          calls: {
            __args: {
              filter: { calendarEventId: { in: eventIds } } as any,
              first: eventIds.length,
            } as any,
            edges: {
              node: {
                id: true,
                calendarEventId: true,
                vexaMeetingId: true,
                lastEnrichedAt: true,
              },
            },
          },
        } as any)
        .catch((e: unknown) => {
          console.error('backfill: calls query failed:', e);
          return null;
        })) as any;
      for (const e of r?.calls?.edges ?? []) {
        const n = e.node;
        if (n.calendarEventId) existingByCalEvId.set(n.calendarEventId, n);
      }
    }

    // 3. Per-event work. Sequential so we respect Vexa-side limits
    //    and stay under Twenty's 100 mutations/min by spacing out.
    for (const ev of events) {
      try {
        const existing = existingByCalEvId.get(ev.id);

        // Skip recently-enriched rows unless force=true. Cheap fast-path.
        if (
          !force &&
          existing?.lastEnrichedAt &&
          Date.parse(existing.lastEnrichedAt) >
            recentEnrichmentCutoff.getTime()
        ) {
          result.skipped += 1;
          continue;
        }

        const parsed = parseMeetingUrl(ev.conferenceLink?.primaryLinkUrl ?? '');
        const isVexaPlatform = !!parsed?.vexaPlatform;

        // 3a. Ensure the Call row exists. Mirror the calendar event
        //     just like the live cron does, minus the dispatch state
        //     (that's set below from Vexa lookup).
        let callId: string | null = existing?.id ?? null;
        if (!existing) {
          const participants =
            ev.calendarEventParticipants?.edges ?? [];
          const attendeeEmails = participants
            .map((p) => p.node?.handle)
            .filter(
              (h: unknown): h is string =>
                typeof h === 'string' && h.includes('@'),
            );
          const linkage = await resolveLinkage(
            client,
            participants.map((p) => ({
              personId: p.node?.personId ?? p.node?.person?.id ?? null,
              companyId: p.node?.person?.companyId ?? null,
            })),
          );
          const createData: Record<string, unknown> = {
            name: ev.title ?? 'Untitled meeting',
            scheduledStart: ev.startsAt ?? null,
            scheduledEnd: ev.endsAt ?? null,
            calendarEventId: ev.id,
            platform: parsed?.platform ?? CallPlatform.OTHER,
            meetingUrl:
              parsed?.url ?? ev.conferenceLink?.primaryLinkUrl ?? null,
            attendeeEmails,
            companyId: linkage.companyId,
            opportunityId: linkage.opportunityId,
            // Will be overridden below by the Vexa lookup if eligible.
            dispatchOutcome: CallDispatchOutcome.NOT_ELIGIBLE,
            dispatchReason: isVexaPlatform
              ? 'awaiting_vexa_lookup'
              : 'no_conference_link',
          };
          try {
            const createResp = (await client.mutation({
              createCall: {
                __args: { data: createData as any },
                id: true,
              },
            } as any)) as any;
            callId = createResp?.createCall?.id ?? null;
            result.callsCreated += 1;
          } catch (err) {
            result.errors += 1;
            console.error(
              `backfill: createCall failed event=${ev.id}: ${
                err instanceof Error ? err.message : String(err)
              }`,
            );
            continue;
          }
        }

        if (!callId) {
          result.errors += 1;
          continue;
        }

        // 3b. Non-Vexa-platform events are NOT_ELIGIBLE forever. Mark
        //     enriched so we don't keep retrying them.
        if (!isVexaPlatform || !parsed) {
          await client
            .mutation({
              updateCall: {
                __args: {
                  id: callId,
                  data: {
                    dispatchOutcome: CallDispatchOutcome.NOT_ELIGIBLE,
                    dispatchReason: 'no_conference_link',
                    lastEnrichedAt: now.toISOString(),
                  } as any,
                },
                id: true,
              },
            } as any)
            .catch((err: unknown) => {
              result.errors += 1;
              console.error(
                `backfill: updateCall (not eligible) failed call=${callId}: ${
                  err instanceof Error ? err.message : String(err)
                }`,
              );
            });
          result.notEligible += 1;
          continue;
        }

        // 3c. Vexa lookup. 404 → no meeting for this URL; 200 → hoist
        //     the three identity fields.
        await sleep(VEXA_INTER_CALL_DELAY_MS);
        let meta: Awaited<
          ReturnType<typeof vexa.getMeetingMetaByUrl>
        > | null = null;
        try {
          meta = await vexa.getMeetingMetaByUrl(
            parsed.vexaPlatform!,
            parsed.nativeId,
          );
        } catch (err) {
          result.errors += 1;
          console.error(
            `backfill: vexa lookup failed event=${ev.id}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
          continue;
        }

        const updateData: Record<string, unknown> = meta
          ? {
              dispatchOutcome: CallDispatchOutcome.SCHEDULED,
              dispatchReason: null,
              vexaMeetingId: String(meta.id),
              vexaUrl: vexa.dashboardUrl(meta.id),
              durationSec: meta.durationSec,
              vexaCompletionReason: meta.completionReason,
              lastEnrichedAt: now.toISOString(),
            }
          : {
              dispatchOutcome: CallDispatchOutcome.NOT_ELIGIBLE,
              dispatchReason: 'no_vexa_meeting',
              lastEnrichedAt: now.toISOString(),
            };

        try {
          await client.mutation({
            updateCall: {
              __args: { id: callId, data: updateData as any },
              id: true,
            },
          } as any);
          if (meta) result.callsEnriched += 1;
          else result.noVexaMeeting += 1;
        } catch (err) {
          result.errors += 1;
          console.error(
            `backfill: updateCall failed call=${callId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        }
      } catch (err) {
        result.errors += 1;
        console.error(
          `backfill: unexpected error event=${ev.id}: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const pageInfo = eventsResp?.calendarEvents?.pageInfo;
    if (!pageInfo?.hasNextPage) break;
    afterCursor = pageInfo.endCursor ?? null;
    if (!afterCursor) break;
  }

  console.log(
    `backfill: scanned=${result.scanned} created=${result.callsCreated} enriched=${result.callsEnriched} noVexa=${result.noVexaMeeting} notEligible=${result.notEligible} skipped=${result.skipped} errors=${result.errors} sinceDays=${result.sinceDays} force=${result.force}`,
  );
  return result;
};

export default defineLogicFunction({
  universalIdentifier: VEXA_BACKFILL_LF,
  name: 'vexa-backfill',
  description:
    'One-shot http POST /backfill: scan past CalendarEvents, ensure Call rows exist and point at the right Vexa meeting. Pointer-only — no transcript content.',
  timeoutSeconds: 300,
  handler,
  httpRouteTriggerSettings: {
    path: '/backfill',
    httpMethod: 'POST' as any,
    isAuthRequired: true,
  },
});
