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
- Our app **mirrors** every CalendarEvent in `[now-90d, future)` as a
  `Call` row, regardless of Vexa eligibility. Past events without a
  Meet URL show as `NOT_ELIGIBLE`; future events with a Meet URL
  show as `PENDING`; events Vexa already accepted show as
  `SCHEDULED` with a `vexa_url`.
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

## How

Three design choices do most of the work.

### 1. Calendar mirror, not "dispatch driver"

The earlier model only wrote a Call when we successfully dispatched a
bot. That's wrong for the user experience: Calls = "what's on your
calendar, and what we did about it" is more honest. So every
CalendarEvent in the window gets a Call, with `dispatchOutcome`
classifying what happened:

```
   PENDING       eligible (future + Meet URL + not cancelled),
                 waiting for the dispatch window
   SCHEDULED     bot dispatched, vexa_url valid
   ERROR         dispatch attempted, Vexa API error → dispatchReason
   NOT_ELIGIBLE  past, cancelled, or no Meet URL → dispatchReason
```

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
   T+0..1m mirror run: every CalendarEvent in [now-90d, future) →
           Call upsert (PENDING / NOT_ELIGIBLE / SCHEDULED if 409)
   T-1m    eligible Call enters dispatch window
           → POST /bots → vexa returns id → Call.dispatchOutcome
             = SCHEDULED, vexa_url populated
   T+0     meeting starts in Google Meet; Vexa bot is in the room
   T+45m   meeting ends; transcript + media live in Vexa
   user → opens Twenty Calls page → clicks the row → vexa_url →
          live Vexa dashboard
```

Cron horizon is 24h forward + 90d back from each tick. Idempotency:
each calendarEventId maps to exactly one Call.

---

## Known gaps & out of scope

### Gaps to close before marketplace ship

1. **Application-token rejection on /graphql.** Twenty's runtime
   injects `TWENTY_APP_ACCESS_TOKEN` for the cron handler, but
   `/graphql` reads return "Authentication is required" despite the
   token decoding cleanly in `validateApplicationToken`. Workaround
   is `TWENTY_API_KEY` paste; real fix needs root-cause investigation
   (or upstream PR).
2. **Rate-limit on first run.** Fresh install on a workspace with
   N existing calendar events fires N `createCall` mutations on the
   first cron tick; Twenty caps at 100/min. First-pass mirror takes
   several minutes to fully populate.
3. **Reschedule produces duplicate Call rows.** Twenty's calendar
   sync creates a NEW `calendarEvent` row when a Google event is
   rescheduled (rather than updating in place), so we mirror both as
   separate Calls. Idempotency fix needs to dedupe on `iCalUid`
   instead of `calendarEventId`.
4. **Vexa 409 currently surfaces as ERROR.** When we hit "active
   meeting already exists for this platform+id" (recurring meetings
   sharing one Meet URL), we should treat it as `SCHEDULED` and
   re-use the existing Vexa meeting id.

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

```
   FUNCTIONAL — calendar mirror
     ─ every CalendarEvent in [now-90d, future) maps to exactly
       one Call row (no dupes, even on reschedule)
     ─ "Scheduled start: future" filter returns every upcoming
       meeting on connected calendars
     ─ rescheduled CalendarEvent → Call.scheduledStart updates
     ─ cancelled CalendarEvent → Call.dispatchOutcome=NOT_ELIGIBLE
       with reason "cancelled"
     ─ Calls auto-link to Company + Opportunity when overlap is
       unambiguous

   FUNCTIONAL — Vexa dispatch
     ─ POST /bots fires at scheduledStart ± window only
     ─ success → SCHEDULED with vexa_meeting_id + vexa_url
     ─ Vexa 409 → SCHEDULED reusing the existing meeting id
     ─ Vexa other errors → ERROR with dispatchReason
     ─ click vexa_url → live page on dashboard.vexa.ai

   OPERATIONAL
     ─ cron runs every minute without rate-limit errors
     ─ on fresh install, mirror fully populates within ~5 min
     ─ steady state: 0 mutations per tick (idempotency holds)
     ─ handler errors surfaced via APPLICATION_LOG_DRIVER=CONSOLE
       (not silent)

   END-TO-END DEMO (a Felix-call-ready path)
     1. operator pastes VEXA_API_KEY + TWENTY_API_KEY in Settings
     2. operator schedules a Google Meet on a connected calendar
        5+ min in the future
     3. within ~6 min (Twenty sync 5 + our cron 1), Call(PENDING)
        appears on /objects/calls
     4. at scheduledStart - 1 min, Call → SCHEDULED, vexa_url set
     5. operator joins the Meet; Vexa bot is in the room
     6. click "Open in Vexa" → real dashboard page with live state
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
