# vexa-twenty-app

A [Twenty CRM](https://twenty.com) app powered by [Vexa](https://github.com/Vexa-ai/vexa)
— open-source meeting bots + transcripts.

**Status:** spec, no code yet. First scaffold lands after the Twenty
kickoff call (see [Open questions](#open-questions-for-twenty)).

---

## Why

Sales reps lose deals to bad CRM hygiene. The richest signal in any
deal — what was actually said in the meeting — is the most likely
piece to be missing from the CRM. Reps either don't update the deal
after a call, or they paste a screenshot of notes nobody re-reads.

Existing meeting recorders make this worse. They build a parallel UI
where transcripts and summaries live, *next to* the CRM. The rep now
has two systems to check, and the deal record stays empty.

The CRM should be the place where the meeting lives in context — next
to the deal, the contact, and the company. Not a sibling tab in
another product.

## What

> **Accept a meeting → it shows up on the right Opportunity. Click it
> → you're inside the call, live or replayed, in Vexa.**

Concretely:

- Install the app into a Twenty workspace, paste a Vexa API key once,
  pick which calendars to watch.
- Every external meeting on those calendars (Meet / Zoom / Teams) gets
  a Vexa bot dispatched automatically — no clicks, no extension, no
  remembering.
- When the meeting ends, a `Call` row appears in Twenty, already
  linked to the People who attended, their Company, and (when
  unambiguous) the Opportunity.
- Click the Call → deep link into Vexa for live viewing, replay,
  transcript, media, bot controls, redactions.

```
   # user-visible surface
   #
   # ┌─ Twenty Settings ──────────────────┐    one-time
   # │ Vexa                               │    ─ paste API key
   # │  ▸ API key  ••••••••••••           │    ─ pick calendars
   # │  ▸ Watch    [✓] Primary            │    ─ default policy
   # │  ▸ Policy   external-only ▼        │    ─ domain blocklist
   # │  ▸ Skip     acme.com, …            │
   # │  ▸ Skip 1:1 internal   [✓]         │
   # └────────────────────────────────────┘
   #
   # ┌─ Opportunity: Acme — Q2 ───────────┐    auto-populated
   # │ relations: Call ×5  ───────────────┼──▶ Call detail
   # └────────────────────────────────────┘
   #
   # ┌─ Call: Acme — Discovery ───────────┐
   # │ status      IN_PROGRESS · 12m      │
   # │ attendees   Felix [Acme], Dmitry   │
   # │ opportunity Acme — Q2 expansion    │
   # │ vexa_url    https://dashboard…     │ ◀── click: live or past
   # └────────────────────────────────────┘
```

**What this release is NOT** — and the discipline matters:

- Not an in-CRM transcript viewer. (Next release.)
- Not AI summaries, action items, draft emails. (Two releases out.)
- Not an autonomous deal-hygiene agent. (The endgame, not the entry.)

We are validating one hypothesis: **does zero-touch capture into the
right deal context change rep behavior?** If yes, the rest is worth
building. If no, no fancy viewer or agent rescues it.

## How

Two design choices do most of the work.

### 1. Pure pointer, not mirror

Vexa is the source of truth for everything with a lifecycle (live bot
state, transcript revisions, media, redactions, retention). Twenty
owns the join keys + the relationships — the one thing Vexa doesn't
have: *what this meeting means for the deal.*

```
   # Twenty                                     Vexa
   ┌─────────────────────────────┐              ┌──────────────────────┐
   │ Call                        │              │ Meeting (source of   │
   │  ─ vexa_meeting_id ─────────┼─────────────▶│  truth)              │
   │  ─ vexa_url       ──────────┼──[Open in ──▶│   • live bot state   │
   │  ─ status (mirrored)        │   Vexa]      │   • transcript       │
   │  ─ relations: Person,       │              │   • media            │
   │      Company, Opportunity,  │              │   • redactions       │
   │      CalendarEvent          │              │   • bot controls     │
   └─────────────────────────────┘              └──────────────────────┘
```

```
   # why pointer, not mirror
   #
   #  ─ single source of truth: edits & redactions in Vexa propagate
   #    instantly. no cache invalidation.
   #
   #  ─ GDPR erasure trivial: delete in Vexa → Twenty link dies.
   #    no transcript shards to chase across two systems.
   #
   #  ─ real-time native: vexa_url works while the meeting is live —
   #    rep can jump straight from the Opportunity into a live call.
   #
   #  ─ no MP4s in Twenty file storage. no GraphQL multipart upload.
   #    no storage cost. no bandwidth bill.
   #
   #  ─ bot management (kick / extend / redact / delete) lives in Vexa,
   #    not rebuilt in Twenty. one [Manage in Vexa] link is enough.
```

Tradeoff named out loud: if the user uninstalls Vexa or churns, their
Twenty Calls become dead links. Mitigation is a one-time
"export transcripts to Notes before uninstall" button if it ever
becomes a complaint. Acceptable cost; same shape as every other
link-out integration (Slack, Linear, Notion-in-CRM).

### 2. Calendar autopilot, not "click to record"

Every recorder that requires a click to start is one a busy rep
forgets to use. The whole product hangs on **zero-touch**: if you
accept the meeting, it gets captured.

Mechanism: a cron logic function reads Twenty's built-in
`CalendarEvent` rows in a 24h horizon, applies the user's policy
(domain blocklist, internal-skip, etc.), and dispatches a Vexa bot
~5 minutes before each meeting starts. Vexa's `meeting.completed`
webhook flips the `Call` status to `COMPLETED`. The user does
nothing.

The privacy cost of zero-touch is real — recording without an
explicit click means the consent UX has to be excellent. Domain
blocklist, internal-only skip, first-recording warning, and
uninstall hygiene **all ship in the first release, before autopilot
defaults on**. This is non-negotiable: the difference between a
useful product and a creepy one is whether privacy primitives lead
or trail the recording.

---

## The `Call` object

A custom object on Twenty's data model. Pure pointer — no transcript
column, no media column, no summary column.

### Fields

```
   # identity & link
   id                 uuid          # twenty pk
   vexa_meeting_id    text  UNIQUE  # join key into vexa
   vexa_url           text          # deep link (works live + past)
   provider           enum          # vexa | meeting_baas | manual
                                    #   future schema convergence point
   status             enum          # FSM (see below) — mirrored locally
                                    #   so list views can filter w/o
                                    #   per-row API calls
   failure_reason     text nullable

   # source meeting (from CalendarEvent, not Vexa)
   platform           enum          # google_meet | zoom | teams
   meeting_url        text          # the join URL we dispatched to
   scheduled_start    timestamptz
   scheduled_end      timestamptz

   # audit
   created_at         timestamptz
   updated_at         timestamptz
```

### Relations

```
   Call ──many-to-many──▶ Person          # via attendee email match
   Call ──many-to-one ──▶ Company         # majority vote across attendees
   Call ──many-to-one ──▶ Opportunity     # nullable; set only when there
                                          #   is exactly one open Opp
                                          #   whose contacts overlap attendees
   Call ──one-to-one  ──▶ CalendarEvent   # nullable but usually set
```

These relations are the **whole reason this object exists**. Without
them, transcripts are just files. With them, every later release —
viewer, skills, agent — is a single GraphQL query away.

### Why "Call" and not "Recording" or "Meeting"

- **Not "Meeting"**: that's how users refer to `CalendarEvent`. Two
  things both named Meeting in the UI = permanent confusion tax.
- **Not "Recording"**: media-centric and surveillance-y. The object
  must exist even when the bot failed and there's no media. "Recording"
  also overlaps with "the MP4 file" if we ever split that out.
- **"Call"** is CRM-native (Salesforce, HubSpot, Pipedrive all use it),
  activity-centric, reads naturally in UI ("3 Calls with Felix"), and
  matches what reps already say.

### Status FSM

```
   #                 ┌──────────────────────────────┐
   #                 ▼                              │
   #   PENDING_SCHEDULE ──▶ SCHEDULED ──▶ IN_PROGRESS ──▶ COMPLETED
   #          │                 │                │
   #          │                 │                ├──▶ FAILED        (bot crash / no audio)
   #          │                 ├──▶ CANCELLED   (event removed/declined)
   #          │                 └──▶ RESCHEDULED (event moved → re-enter PENDING_SCHEDULE)
   #          └──▶ SKIPPED      (policy: blocked / internal-only / opt-out)
```

```
   # transition triggers
   #
   #   cron tick           : (no row | RESCHEDULED | PENDING_SCHEDULE) → SCHEDULED
   #   POST /bots ok       : PENDING_SCHEDULE → SCHEDULED   (store vexa_meeting_id)
   #   POST /bots 429/5xx  : stay PENDING_SCHEDULE, retry w/ backoff
   #   bot.joined webhook  : SCHEDULED → IN_PROGRESS        (optional)
   #   meeting.completed   : * → COMPLETED
   #   meeting.failed      : * → FAILED
   #   CalendarEvent del   : SCHEDULED → CANCELLED          (best-effort cancel bot)
   #   CalendarEvent edit  : SCHEDULED → RESCHEDULED        (cancel bot, re-enter)
   #   policy says no      : PENDING_SCHEDULE → SKIPPED
```

---

## Lifecycle: end-to-end

```
   # T-∞    user installs app, sets API key, picks calendars, sets policy
   # T-24h  cron sees event in horizon → upserts Call(PENDING_SCHEDULE)
   # T-15m  cron tick → policy passes → POST /bots → SCHEDULED
   # T+0    meeting starts; bot joins; (optional) IN_PROGRESS via webhook
   # T+45m  meeting ends; Vexa transcribes
   # T+50m  meeting.completed webhook → verify HMAC →
   #        resolve attendees to People → link Company/Opp →
   #        write Call(COMPLETED)
   # T+50m  user sees Call on Opportunity timeline
```

```
   # cron horizon vs. dispatch lead-time
   #
   #   horizon = how far ahead we *materialize* PENDING_SCHEDULE rows.
   #             wider = more visibility for opt-outs, more rows to manage.
   #             proposal: 24h.
   #
   #   lead    = how early we actually dispatch the bot.
   #             too early = bot waits / Vexa quota burn.
   #             too late  = race vs. meeting start.
   #             proposal: 5m before scheduled_start.
```

---

## Hard parts (the real work)

```
   # 1. attendee → Person resolution
   #    ─ email match is easy; the value is what to do when it misses.
   #    ─ create-on-the-fly Person? behind a setting; default OFF.
   #    ─ unmatched emails surfaced as "unknown attendees" on Call.
   #
   # 2. opportunity linking
   #    ─ heuristic: open Opp whose primary contacts ∩ attendees ≠ ∅.
   #    ─ ambiguous (>1 match) → leave null; surface manual link in MVP3.
   #    ─ this is where the agent (later release) earns its keep.
   #
   # 3. privacy / consent — must ship BEFORE autopilot defaults on
   #    ─ domain blocklist (regulated industries, ex-employers, etc.).
   #    ─ "skip internal-only" toggle (all attendees @company-domain).
   #    ─ first-recording-of-a-contact warning email (configurable).
   #    ─ legal-basis copy in install flow; jurisdictions vary.
   #
   # 4. idempotency
   #    ─ webhook retries happen. vexa_meeting_id is unique; upsert.
   #    ─ event.updated → reconcile; don't double-dispatch.
   #
   # 5. failure surfaces
   #    ─ bot didn't join, audio empty, transcript timed out → write
   #      Call(FAILED) with reason. silent failures kill trust.
   #
   # 6. uninstall hygiene
   #    ─ revoke Vexa webhook
   #    ─ best-effort cancel pending bots
   #    ─ optional: "export transcripts to Notes before disconnect"
```

---

## What's out of scope for this release

Resist scope creep. The trap is letting this release grow features that
belong in later ones.

- ❌ in-CRM transcript viewer (next release)
- ❌ AI summaries / action items / draft emails
- ❌ ⌘K skills ("record now", "summarize last call")
- ❌ autonomous deal-hygiene agent on Opportunity
- ❌ MP4 mirroring into Twenty file storage
- ❌ multi-provider switcher (the `provider` field exists for the
  future but this release is Vexa-only)

The only thing this release has to do is **prove zero-touch capture
works and people keep it on**.

### Future releases (brief)

```
   #  next       in-CRM "Calls" tab on Person & Opportunity
   #             — read-only viewer + media playback
   #
   #  after      ⌘K skills: "Record this meeting", "Summarize last
   #             call with X", "Draft follow-up email"
   #
   #  superproduct  autonomous agent on Opportunity:
   #                 ─ proposes stage transitions
   #                 ─ extracts tasks w/ owners + due dates
   #                 ─ drafts follow-up email
   #                 ─ flags risks ("3 calls, no exec sponsor named")
   #             user approves a queue. CRM hygiene becomes a review
   #             task, not an authoring task. this is why we're here.
```

---

## Validation

```
   #   primary signal:
   #     coverage = recordings_completed / eligible_meetings   target ≥70%
   #     "eligible" = on a watched calendar, has meet URL, ≥1 external
   #                  attendee, not domain-blocked, not user-skipped.
   #
   #   secondary:
   #     bot dispatch success rate           ≥95%
   #     accidental records (complaints)     <2% of recordings
   #     installs that disable autopilot in <14 days  <20%
   #
   #   anti-signal: high uninstall after first surprise recording
   #                → privacy UX is wrong, not the product.
```

---

## Definition of done (ship gate)

```
   # functional
   #   ─ install flow: API key + calendar pick + policy → first Call
   #     within 24h on a real meeting
   #   ─ all FSM transitions observable in Twenty (status field)
   #   ─ HMAC-verified webhook ingestion; no Calls written from
   #     unsigned requests
   #   ─ at least one CANCELLED and one RESCHEDULED case handled live
   #
   # privacy
   #   ─ domain blocklist enforced before POST /bots
   #   ─ internal-only skip enforced
   #   ─ uninstall revokes webhook + best-effort cancels pending bots
   #
   # ops
   #   ─ structured logs per Call.id; failure_reason populated on FAILED
   #   ─ dashboard: coverage, dispatch success, webhook lag (p50/p95)
   #
   # measurement
   #   ─ event taxonomy in place to compute the coverage signal above
   #     before we ship to the second user
```

---

## Repo skeleton (proposed)

```
   src/
     objects/
       call.ts                            # custom object schema
     logic-functions/
       cron-dispatch.ts                   # cron: scan + POST /bots
       vexa-webhook.ts                    # HTTP: /vexa/ingest
       on-uninstall.ts                    # cleanup (if Twenty supports it)
     front-components/
       settings.tsx                       # API key + policy + blocklist
     lib/
       vexa-client.ts                     # thin Vexa API wrapper
       hmac.ts                            # webhook signature verify
       attendee-match.ts                  # email → Person resolver
       opportunity-linker.ts              # attendee overlap heuristic
       policy.ts                          # blocklist + skip rules
   test/
     fixtures/                            # Vexa webhook payloads
     *.spec.ts
   application-config.ts                  # CLI-generated app identity
   package.json
   README.md
   PRIVACY.md
```

---

## Day-1 checklist (after kickoff call)

```
   #  ─ scaffold via Twenty CLI
   #      verify scaffolder name on call (`yarn create twenty-app`?)
   #
   #  ─ wire remote
   #      yarn twenty remote add <workspace-url>
   #      yarn twenty dev → confirm hello-world installs
   #
   #  ─ commit scaffold as "chore: initial scaffold"
   #
   #  ─ port the Call object schema (this README) → src/objects/call.ts
   #
   #  ─ stub two logic functions (no Vexa calls yet, just shapes)
   #      src/logic-functions/cron-dispatch.ts     (cron, every 5m)
   #      src/logic-functions/vexa-webhook.ts      (HTTP, /vexa/ingest)
   #
   #  ─ stub settings front component
   #      fields: vexa_api_key, watched_calendars[], policy, blocklist
   #
   #  ─ first deploy
   #      yarn twenty deploy
   #      verify: install flow renders, settings page saves a key
```

That's day 1. Capture not yet wired — but the app is installable, the
`Call` object exists, and the surfaces are in place. Day 2..N drives
against the ship gate above.

---

## Open questions for Twenty

```
   #  Q1  app identity / OAuth — per-workspace OAuth client, or
   #      single Vexa app server-side?                          [BLOCKS DAY 1]
   #
   #  Q2  scaffolder name & current status — `yarn twenty dev`
   #      flow working today, or still in preview?              [BLOCKS DAY 1]
   #
   #  Q3  uninstall lifecycle hook — does Twenty fire onUninstall
   #      so we can revoke webhook + cancel pending bots?       [BLOCKS DAY 1]
   #
   #  Q4  list-view custom cell renderer — extension point for
   #      a "● live" badge in Call list views?
   #
   #  Q5  schema convergence — will Twenty bless a shared `Call`
   #      object so users can swap recorders without losing
   #      history? who owns the canonical schema?
   #
   #  Q6  marketplace privacy norms — Twenty-core consent UX,
   #      or every recorder reinvents it?
   #
   #  Q7  dev workspace — Twenty provisions one for us, or do we
   #      run local Twenty for development?                     [BLOCKS DAY 1]
```

---

## License

MIT.
