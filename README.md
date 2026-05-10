# vexa-twenty-app

A [Twenty CRM](https://twenty.com) app powered by [Vexa](https://github.com/Vexa-ai/vexa)
— open-source meeting bots + transcripts.

**Status:** running on https://crm.dev.vexa.ai (v0.6.x). Calendar
mirror + just-in-time bot dispatch live. See [TESTING.md](./TESTING.md)
for the current demo path and known gaps.

---

## Why

[Twenty](https://twenty.com) is a self-hosted, open-source CRM.
[Vexa](https://github.com/Vexa-ai/vexa) is a self-hosted, open-source
meeting bot + transcription platform. They fit together by nature:

- **Twenty** holds the structured business data — People, Companies,
  Opportunities, Calendar events.
- **Vexa** produces the unstructured high-signal data — full meeting
  transcripts, the richest fuel an AI agent can consume about a deal.

The mapping between the two is the value. A transcript on its own is
a wall of text; a transcript bound to the right Opportunity, the
right People, and the right Company is a primary input for every
later AI workload — summaries, next-step extraction, deal-health
scoring, autonomous hygiene.

Both halves are self-hostable, so this stack works where SaaS
recorders can't go: regulated industries, EU data-residency, on-prem,
air-gapped. That's the audience that has nowhere good to turn today.

## What

> **Every meeting on your calendar shows up as a Call in Twenty,
> linked to the right Opportunity. At the moment it starts, a Vexa
> bot joins. Click `Open in Vexa` for live or replay.**

Concretely, after install:

- Twenty's existing Google/Microsoft calendar sync pulls events into
  the workspace.
- Our app **mirrors the next 20 upcoming CalendarEvents** as `Call`
  rows. Future events without a Meet URL show as `NOT_ELIGIBLE`;
  future events with a Meet URL show as `PENDING`; events Vexa
  has accepted show as `SCHEDULED` with a `vexa_url`.
- Calls auto-link to **Company** and **Opportunity** via the
  attendee participants Twenty already resolved.
- **Just-in-time dispatch:** when an eligible meeting reaches its
  start time (within a 1-min lead / 5-min tail window), our cron
  POSTs to Vexa's `/bots`, the bot enters the meeting URL, and the
  Call flips to `SCHEDULED`. No bots reserved weeks in advance.

```
   ┌─ Calls list  /objects/calls ──────────────────────────────────────┐
   │ Title                                  Dispatch     Scheduled      │
   │ Acme — Discovery                       Pending      May 12 14:00   │
   │ test call                              Scheduled    May 8 17:15  ◀ Open in Vexa
   │ Bertrams 1:1                           Not eligible Apr 22 10:00   │
   │ Architecture working group             Not eligible May 14 14:30   │
   └────────────────────────────────────────────────────────────────────┘
```

**What this release is NOT:**

- Not an in-CRM transcript viewer (next release).
- Not AI summaries / autonomous deal-hygiene agent (later releases).
- Not a meeting-state mirror — Twenty doesn't track whether a call is
  live, finished, etc. Click `vexa_url` for that.

We're validating one thing: **does the calendar-bound Vexa autopilot
become something a sales team actually relies on?**

## Architecture

```
                                  ┌─────────────────────────────────────────────────┐
                                  │                  USER'S BROWSER                  │
                                  │  Google Calendar  /  Google Meet  /  Twenty UI   │
                                  └────────────────┬────────────────────┬────────────┘
                                                   │                    │
                                  calendar invite  │                    │ /settings/applications/...
                                       events      │                    │ /objects/calls
                                                   ▼                    ▼
   ┌────────────────────────┐         ┌──────────────────────┐    ┌─────────────────────┐
   │       VEXA CLOUD        │         │    GOOGLE WORKSPACE  │    │    TWENTY CRM        │
   │  (vexa-platform repo)   │         │   Calendar / Meet     │    │                      │
   │                         │         │                       │    │                      │
   │ ┌─────────────────────┐ │         │  Calendar OAuth ◀─────┼────┤ Account integration  │
   │ │ api-gateway         │ │         │  (per workspace mbr)  │    │ (per workspaceMember)│
   │ │  POST /bots         │◀┼─────────┼─── join URL bot ─────▶│    │                      │
   │ │  GET /transcripts/  │ │         │   into meeting        │    │  ┌─────────────────┐ │
   │ │  GET /bots/id/      │ │         │                       │    │  │ calendar-sync   │ │
   │ └────────┬────────────┘ │         └──────┬────────────────┘    │  │ (Twenty native) │ │
   │          │              │                │ pulls events         │  └────────┬────────┘ │
   │ ┌────────▼────────────┐ │                └─────────────────────▶│           │          │
   │ │ meeting-api         │ │                                       │           ▼          │
   │ │  meetings table     │ │                                       │  ┌─────────────────┐ │
   │ │  api_tokens         │ │                                       │  │ CalendarEvent    │ │
   │ │  transcriptions     │ │                                       │  │   (standard obj) │ │
   │ │  recordings         │ │                                       │  └────────┬────────┘ │
   │ │  users.data.webhook │ │                                       │           │          │
   │ └─────────────────────┘ │                                       └───────────┼──────────┘
   │                         │                                                   │
   │ ┌─────────────────────┐ │                                                   │
   │ │ vexa-bot            │ │            ┌──────────────────────────────────────┘
   │ │ (joins Meet/Zoom)   │ │            │
   │ └─────────────────────┘ │            ▼
   │                         │   ┌───────────────────────────────────────────────┐
   │ Postgres (Akamai)       │   │       VEXA-FOR-TWENTY APP                     │
   │  meetings.platform_     │   │       (@vexaai/twenty-app)                    │
   │  specific_id ◀──────────┼───┼─ matches ─ Call.meetingUrl native id ▶        │
   │                         │   │                                                │
   └─────────────────────────┘   │  ┌──────────────────────────────────────┐    │
                                  │  │  Logic functions (run in worker pod) │    │
                                  │  │                                       │    │
                                  │  │  vexa-cron-dispatch (cron * * * * *) │    │
                                  │  │   • scan next 20 future events       │    │
                                  │  │   • dispatch bot 1min pre-start      │    │
                                  │  │   • POST /bots, store vexaMeetingId  │    │
                                  │  │                                       │    │
                                  │  │  vexa-backfill (POST /s/backfill)    │    │
                                  │  │   • scan last N days CalendarEvents   │    │
                                  │  │   • ensure Call row + Vexa pointer    │    │
                                  │  │   • GET /transcripts/<platform>/<id> │    │
                                  │  │   • hoist duration + completion       │    │
                                  │  │                                       │    │
                                  │  │  vexa-webhook (POST /s/vexa-webhook) │    │
                                  │  │   • HMAC-verify X-Webhook-Signature   │    │
                                  │  │   • react to meeting.completed +     │    │
                                  │  │     bot.failed in near-real-time     │    │
                                  │  │   • refresh Call without cron lag    │    │
                                  │  └──────────────┬───────────────────────┘    │
                                  │                 │                              │
                                  │                 ▼                              │
                                  │  ┌──────────────────────────────────────┐    │
                                  │  │  Custom objects                       │    │
                                  │  │                                       │    │
                                  │  │  Call ──┬─→ Opportunity              │    │
                                  │  │         ├─→ Company                  │    │
                                  │  │         ├─→ CalendarEvent (1:1)      │    │
                                  │  │         └─→ CallAttendee[] ─→ Person │    │
                                  │  │                                       │    │
                                  │  │  Pointer fields:                      │    │
                                  │  │   vexaMeetingId (FK → Vexa)          │    │
                                  │  │   vexaUrl (deep link) ──────┐        │    │
                                  │  │                              │        │    │
                                  │  │  Hoisted scalars (identity,  │        │    │
                                  │  │  never content):             │        │    │
                                  │  │   durationSec                │        │    │
                                  │  │   vexaCompletionReason       │        │    │
                                  │  │   lastEnrichedAt             │        │    │
                                  │  └──────────────────────────────┼────────┘    │
                                  │                                  │             │
                                  │  applicationVariables (Settings) │             │
                                  │   • VEXA_API_KEY (req'd)         │             │
                                  │   • VEXA_API_BASE                │             │
                                  │   • VEXA_DASHBOARD_BASE          │             │
                                  │   • VEXA_WEBHOOK_SECRET (opt'l)  │             │
                                  │   • TWENTY_API_KEY (workaround   │             │
                                  │     for upstream #20423)         │             │
                                  └──────────────────────────────────┼─────────────┘
                                                                     │
                                                  user clicks vexaUrl│
                                                                     ▼
                                                        ┌──────────────────────┐
                                                        │  dashboard.vexa.ai   │
                                                        │  /meetings/<id>      │
                                                        │  (transcript, audio, │
                                                        │   participants live  │
                                                        │   in Vexa Cloud)     │
                                                        └──────────────────────┘
```

**Ownership boundary** — Twenty stores the *mapping* (which Person attended which Call, which Opportunity it belongs to, when, where, dispatch state, a pointer to Vexa, plus a few hoisted identity scalars). Vexa stores the *content* (transcript segments, audio/video, speaker diarization, summaries). To see what was said, click `Open in Vexa`. Transcript content is never copied into Twenty; the integration is pure pointer.

**Two write paths, one read path:**

| Path | Frequency | Triggered by | Purpose |
|---|---|---|---|
| `vexa-cron-dispatch` | every minute | cron `* * * * *` | scan next 20 future calendar events, dispatch bot 1min before start, mirror into Calls |
| `vexa-backfill` | manual | `POST /s/backfill { sinceDays }` | one-shot scan of past CalendarEvents → ensure each has a Call row + Vexa pointer |
| `vexa-webhook` | event-driven | `POST /s/vexa-webhook` from Vexa | HMAC-verified `meeting.completed` / `bot.failed` → reconcile Call row in seconds |
| click-through | on-demand | user clicks `vexaUrl` in a Call | direct to `dashboard.vexa.ai/meetings/<id>` for transcript / audio |

## How

Three design choices do most of the work.

### 1. Calendar mirror, not "dispatch driver"

The earlier model only wrote a Call when we successfully dispatched a
bot. That's wrong for the user experience: Calls = "what's on your
calendar, and what we did about it" is more honest. So every
upcoming CalendarEvent (next 20) gets a Call, with `dispatchOutcome`
classifying what happened:

```
   PENDING       eligible (future + Meet URL + not cancelled),
                 waiting for the dispatch window
   SCHEDULED     bot dispatched, vexa_url valid
   ERROR         dispatch attempted, Vexa API error → dispatchReason
   NOT_ELIGIBLE  cancelled or no Meet URL → dispatchReason
```

Why next-20 and not "everything": bounds rate-limit exposure
(Twenty caps mutations at 100/min) and matches what a sales rep
cares about right now. Past events and 21st+ are explicitly out of
scope — clean ladder rung to add later if needed.

### 2. Just-in-time bot dispatch

POST `/bots` fires only when *now ∈ [scheduledStart − 1min,
scheduledStart + 5min]*. Vexa's bot then waits in the meeting URL
for participants. Earlier dispatch wasted Vexa quota and held bot
reservations for events that may get cancelled.

### 3. Pull from Twenty, not Google directly

We rely on Twenty's existing Google/Microsoft calendar pipeline
rather than doing our own OAuth. The cost is ~6 minutes worst-case
latency (5-min Twenty calendar sync + 1-min our cron). The benefit
is no parallel pipeline and zero new auth surface — whatever
calendars the user connected to Twenty are automatically in scope.

```
   Google Calendar
        │  every 5 min, Twenty's CalendarFetchEventsService → calendarEvent rows
        ▼
   Twenty workspace
        │  every 1 min, our cron queries the workspace GraphQL,
        │  upserts Call rows, dispatches Vexa bots when in window
        ▼
   Twenty Calls list  +  Vexa dashboard.vexa.ai/meetings/<id>
```

Why polling and not push: Twenty's calendar import uses bulk
TypeORM `repository.insert()` / `.updateMany()`, which **bypass the
workspace event emitter**. So `calendarEvent.created` /
`calendarEvent.updated` database-event triggers never fire from
calendar sync — only from direct API mutations. This is a known
ceiling on Twenty's app surface; polling is the only reliable hook.

---

## The `Call` object

Custom object on Twenty's data model. **Pure pointer to Vexa** for
state — no transcript column, no media, no summary.

### Fields

```
   identity
     id                 uuid          twenty pk
     name               text          mirrors CalendarEvent title
     vexa_meeting_id    text          Vexa's canonical id (after dispatch)
     vexa_url           text          https://dashboard.vexa.ai/meetings/<id>
     provider           enum          vexa | meeting_baas | manual
                                      future schema convergence point

   what we did
     dispatch_outcome   enum          PENDING | SCHEDULED | ERROR | NOT_ELIGIBLE
     dispatch_reason    text          policy reason or Vexa error message

   source meeting (from CalendarEvent)
     platform           enum          google_meet | zoom | teams | other
     meeting_url        text          the join URL we dispatched to
     scheduled_start    timestamptz
     scheduled_end      timestamptz
     attendee_emails    raw_json      captured at first mirror

   audit
     created_at         timestamptz
     updated_at         timestamptz
```

### Relations

```
   Call ──many-to-one──▶ Opportunity     # exactly-one open opp w/ contact overlap
   Call ──many-to-one──▶ Company         # majority vote across attendee People
   Call ──many-to-one──▶ CalendarEvent   # 1:1 in practice
```

### Why "Call" and not "Recording" or "Meeting"

- **"Meeting"** = `CalendarEvent` in the user's head. Two things
  named Meeting in the UI = permanent confusion.
- **"Recording"** is media-centric and surveillance-y. The object
  must exist when the bot was skipped or never made it.
- **"Call"** is CRM-native (Salesforce / HubSpot / Pipedrive all use
  it), activity-centric, reads naturally in UI ("3 Calls with Felix").

---

## Install

### Configuration

The Twenty server hosting this app must have these env vars (set in
`docker-compose.yml`):

```yaml
LOGIC_FUNCTION_TYPE: LOCAL          # required to execute installed-app cron
APPLICATION_LOG_DRIVER: CONSOLE     # routes handler console.log to docker logs
```

Without `LOGIC_FUNCTION_TYPE`, Twenty silently runs `DisabledDriver`
and the cron no-ops. Without `APPLICATION_LOG_DRIVER=CONSOLE`,
handler logs are invisible (default driver discards them).

### Deploy

```bash
cd app
yarn twenty remote add --as <name> --api-url https://your-twenty.example --api-key <admin-key>
yarn twenty deploy -r <name>
yarn twenty install -r <name>
```

For local dev:

```bash
cd app
yarn twenty server start          # spins a Twenty docker via the SDK
yarn twenty dev --once             # one-shot install for the dev path
```

### Workspace settings

Open *Settings → Applications → Vexa → Settings*. Two required keys:

```
   VEXA_API_KEY    Vexa API key (X-API-Key) — get one at
                   https://dashboard.vexa.ai/profile

   TWENTY_API_KEY  Long-lived Twenty admin API key — mint at
                   Settings → APIs & Webhooks (role: Admin)

                   *Workaround.* Twenty's runtime injects an
                   application-scoped JWT but it's currently
                   rejected by /graphql workspace reads with
                   "Authentication is required" despite the role
                   having canReadAllObjectRecords:true. Until that's
                   resolved (see "Known gaps" below), the operator
                   pastes a workspace admin key here.
```

`VEXA_API_BASE` and `VEXA_DASHBOARD_BASE` default to the cloud
(`api.cloud.vexa.ai` / `dashboard.vexa.ai`); override only for
self-hosted Vexa.

---

## Lifecycle

```
   T-∞     install completes; user pastes both keys in Settings
   T+0     cron fires (every 1 min)
   T+0..1m mirror run: query the next 20 CalendarEvents
           starting at or after now → Call upsert
           (PENDING / NOT_ELIGIBLE / SCHEDULED if 409 reuses
            existing meeting id)
   T-1m    eligible Call enters dispatch window
           → POST /bots → vexa returns id → Call.dispatchOutcome
             = SCHEDULED, vexa_url populated
   T+0     meeting starts in Google Meet; Vexa bot is in the room
   T+45m   meeting ends; transcript + media live in Vexa
   user → opens Twenty Calls page → clicks the row → vexa_url →
          live Vexa dashboard
```

Cron scope: next 20 future events per tick. Idempotency: each
calendarEventId maps to exactly one Call (lookup is bounded:
`calendarEventId IN [next-20 ids]`).

---

## Known gaps & out of scope

### Gaps to close before marketplace ship

1. **Application-token rejection on /graphql.** Twenty's runtime
   injects `TWENTY_APP_ACCESS_TOKEN` for the cron handler, but
   `/graphql` reads return "Authentication is required" despite the
   token decoding cleanly in `validateApplicationToken`. Workaround
   is `TWENTY_API_KEY` paste; real fix needs root-cause investigation
   (or upstream PR).
2. **Reschedule produces duplicate Call rows.** Twenty's calendar
   sync creates a NEW `calendarEvent` row when a Google event is
   rescheduled (rather than updating in place), so we mirror both as
   separate Calls within the same next-20 window. Fix needs to
   dedupe on `iCalUid` instead of `calendarEventId`.

(Resolved in v0.7.0:)

- ~~Rate-limit on first run.~~ Cron now scans only the next 20 future
  events; per-tick mutation count is bounded ≤20, well under
  Twenty's 100/min cap.
- ~~Vexa 409 surfaces as ERROR.~~ 409 now treated as SCHEDULED with
  the sibling meeting's `vexaMeetingId` (recurring meetings share
  one bot per Meet URL).

### Out of scope for this release

- ❌ in-CRM transcript viewer (next release)
- ❌ webhook ingestion (Vexa is the state authority — click vexa_url)
- ❌ AI summaries / action items / draft emails
- ❌ ⌘K skills ("record now", "summarize last call")
- ❌ autonomous deal-hygiene agent on Opportunity
- ❌ MP4 mirroring into Twenty file storage

### Future releases (brief)

```
   next       in-CRM "Calls" tab on Person & Opportunity
              read-only viewer + media playback
   after      ⌘K skills: "Record this meeting", "Summarize last
              call with X", "Draft follow-up email"
   superproduct  autonomous agent on Opportunity:
                  ─ proposes stage transitions
                  ─ extracts tasks w/ owners + due dates
                  ─ drafts follow-up email
                  ─ flags risks ("3 calls, no exec sponsor named")
              user approves a queue. CRM hygiene becomes a review
              task, not an authoring task.
```

---

## Definition of Done (current scope)

Scope is **the next 20 future calendar events** on connected
calendars. Past events and 21st+ future events are explicitly out of
scope — they can be added later without changing the model.

```
   FUNCTIONAL — calendar mirror
     ─ each of the next 20 upcoming CalendarEvents on connected
       calendars maps to exactly one Call row (no duplicates)
     ─ Calls list (sorted by Scheduled start ASC) shows those 20
       and matches what's on the user's calendar
     ─ rescheduled CalendarEvent → Call.scheduledStart updates
     ─ cancelled CalendarEvent → Call.dispatchOutcome=NOT_ELIGIBLE
       with reason "cancelled"
     ─ event leaves the next-20 window (its start passes / earlier
       events take its slot) → Call stays as historical record but
       is no longer touched by the cron
     ─ Calls auto-link to Company + Opportunity when an attendee
       overlap is unambiguous

   FUNCTIONAL — Vexa dispatch
     ─ POST /bots fires at scheduledStart ± window only
       (lead 1 min, tail 5 min) — never weeks ahead
     ─ success → SCHEDULED with vexa_meeting_id + vexa_url
     ─ Vexa 409 (recurring meeting, bot already running for that
       Meet URL) → SCHEDULED reusing the existing meeting id
     ─ Vexa other errors → ERROR with dispatchReason populated
     ─ click vexa_url → live page on dashboard.vexa.ai

   OPERATIONAL
     ─ cron runs every minute without rate-limit errors
       (per tick: 1 calendar query + 1 calls query + ≤20
       mutations — well under Twenty's 100/min cap)
     ─ steady state: 0 mutations per tick (idempotency holds —
       lookup by calendarEventId IN [next-20 ids])
     ─ handler errors surfaced via APPLICATION_LOG_DRIVER=CONSOLE
       (not silent)

   END-TO-END DEMO (a Felix-call-ready path)
     1. operator pastes VEXA_API_KEY + TWENTY_API_KEY in Settings
     2. operator schedules a Google Meet on a connected calendar
        5+ min in the future
     3. within ~6 min (Twenty sync 5 + our cron 1), Call(PENDING)
        appears on /objects/calls — it's in the next-20 list
     4. at scheduledStart - 1 min, Call → SCHEDULED, vexa_url set
     5. operator joins the Meet; Vexa bot is in the room
     6. click "Open in Vexa" → real dashboard page with live state

   EXPLICITLY OUT OF SCOPE
     ─ events past today / events 21st+ on the future list
     ─ historical backfill (the 90d-back window we dropped)
     ─ the TWENTY_API_KEY admin-paste workaround
       (marketplace blocker — needs root-cause on the application
        token rejection)
     ─ duplicate Calls when Twenty inserts a new calendarEvent row
       on Google reschedule (idempotency keys on calendarEventId,
       not iCalUid)
     ─ in-CRM viewer, AI summaries, autonomous agent (later releases)
```

---

## Repo layout

```
   app/
     src/
       application-config.ts                  app identity + applicationVariables
       constants/universal-identifiers.ts     stable UUIDs
       default-role.ts                        logic-function role
       objects/
         call.object.ts                       Call schema (pure pointer)
       fields/
         opportunity-on-call.field.ts         Call → Opportunity (M2O)
         calls-on-opportunity.field.ts        inverse (O2M)
         company-on-call.field.ts             Call → Company
         calls-on-company.field.ts            inverse
         calendar-event-on-call.field.ts      Call → CalendarEvent
         calls-on-calendar-event.field.ts     inverse
       logic-functions/
         cron-dispatch.ts                     */1 * * * * — mirror + dispatch
       lib/
         vexa-client.ts                       POST /bots + dashboard URL
         dispatch-handler.ts                  Vexa wrapper (success/rate/err)
         attendee-linker.ts                   participants → Company/Opp
         meeting-url.ts                       Meet/Zoom/Teams URL parser
       views/
         all-calls.view.ts                    default table view (cols only)
       navigation-menu-items/
         calls.navigation-menu-item.ts        sidebar link
   scripts/
     twenty-token.sh                          mints a bearer token from
                                              local Twenty's dev creds
   .env.local                                 VEXA_API_KEY (gitignored)
   README.md
   TESTING.md
```

---

## License

MIT.
