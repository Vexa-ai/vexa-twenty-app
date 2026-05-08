# vexa-twenty-app

A [Twenty CRM](https://twenty.com) app powered by [Vexa](https://github.com/Vexa-ai/vexa)
— open-source meeting bots + transcripts.

**Status:** working scaffold. `Call` object live in a local Twenty,
cron dispatcher registered. See [TESTING.md](./TESTING.md) for what
runs today.

---

## Why

[Twenty](https://twenty.com) is a self-hosted, open-source CRM.
[Vexa](https://github.com/Vexa-ai/vexa) is a self-hosted, open-source
meeting bot + transcription platform. They fit together by nature:

- **Twenty** holds the structured business data — People, Companies,
  Opportunities, Calendar events.
- **Vexa** produces the unstructured high-signal data — full
  meeting transcripts, the richest fuel an AI agent can consume
  about a deal.

The mapping between the two is the value. A transcript on its own is
a wall of text; a transcript bound to the right Opportunity, the
right People, and the right Company is a primary input for every
later AI workload — summaries, next-step extraction, deal-health
scoring, autonomous hygiene.

Both halves are self-hostable, so this stack works where SaaS
recorders can't go: regulated industries, EU data-residency,
on-prem, air-gapped. That's the audience that has nowhere good to
turn today.

## What

> **Accept a meeting → it shows up on the right Opportunity. Click it
> → you're inside the call, live or replayed, in Vexa.**

Concretely:

- Install the app into a Twenty workspace, paste a Vexa API key once,
  pick which calendars to watch.
- Every external meeting on those calendars (Meet / Zoom / Teams) gets
  a Vexa bot dispatched automatically — no clicks, no extension, no
  remembering.
- A `Call` row appears in Twenty linked to the matching CalendarEvent
  (and, in later releases, to People / Company / Opportunity), with a
  `vexa_url` deep link.
- Click the Call → land in Vexa for live viewing, replay, transcript,
  media, bot controls, redactions.

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
   # ┌─ Opportunity: Acme — Q2 ───────────┐    auto-populated (later release)
   # │ relations: Call ×5  ───────────────┼──▶ Call detail
   # └────────────────────────────────────┘
   #
   # ┌─ Call: Acme — Discovery ───────────┐
   # │ dispatch    Scheduled              │    ← Twenty's view: what we did
   # │ scheduled   May 8, 14:00–14:45     │    ← from CalendarEvent
   # │ vexa_url    https://dashboard…     │ ◀── click: live state lives in Vexa
   # └────────────────────────────────────┘
```

**What this release is NOT** — and the discipline matters:

- Not an in-CRM transcript viewer. (Next release.)
- Not AI summaries, action items, draft emails. (Two releases out.)
- Not an autonomous deal-hygiene agent. (The endgame, not the entry.)
- **Not a meeting-state mirror.** Twenty does not track whether a call
  has started, ended, succeeded, or failed. Click `vexa_url` to find
  out. (See "Pure pointer" below — applied consistently.)

We are validating one hypothesis: **does zero-touch capture into the
right deal context change rep behavior?** If yes, the rest is worth
building. If no, no fancy viewer or agent rescues it.

## How

Two design choices do most of the work.

### 1. Pure pointer, not mirror

Vexa is the source of truth for everything with a lifecycle (live bot
state, transcript revisions, media, redactions, retention, *and
meeting status*). Twenty owns the join keys + the relationships — the
one thing Vexa doesn't have: *what this meeting means for the deal.*

```
   # Twenty                                     Vexa
   ┌─────────────────────────────┐              ┌──────────────────────┐
   │ Call                        │              │ Meeting (source of   │
   │  ─ vexa_meeting_id ─────────┼─────────────▶│  truth)              │
   │  ─ vexa_url       ──────────┼──[Open in ──▶│   • live status      │
   │  ─ relations: Person,       │   Vexa]      │   • transcript       │
   │      Company, Opportunity,  │              │   • media            │
   │      CalendarEvent          │              │   • redactions       │
   │  ─ dispatchOutcome          │              │   • bot controls     │
   │      (what we did)          │              │                      │
   └─────────────────────────────┘              └──────────────────────┘
```

```
   # why pointer, not mirror
   #
   #  ─ single source of truth: edits, redactions, AND status changes in
   #    Vexa propagate instantly. no cache invalidation, no webhook
   #    handler, no public ingestion endpoint to harden.
   #
   #  ─ GDPR erasure trivial: delete in Vexa → Twenty link dies.
   #    no transcript shards or status mirrors to chase.
   #
   #  ─ no MP4s in Twenty file storage. no GraphQL multipart upload.
   #    no storage cost. no bandwidth bill.
   #
   #  ─ bot management (kick / extend / redact / delete) lives in Vexa,
   #    not rebuilt in Twenty. one [Open in Vexa] link is enough.
```

The only state Twenty tracks is `dispatchOutcome` — what *we* did at
dispatch time, because that decision happens in our cron, not in Vexa:

```
   SCHEDULED   bot dispatched, vexa_url valid
   SKIPPED     policy rejected (blocklist / internal-only); no bot
   ERROR       dispatch failed (Vexa API error / rate-limit); no bot
```

That's it. Three values, all known at dispatch time. No FSM, no
webhook, no race conditions.

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
~5 minutes before each meeting starts. `POST /bots` returns the
canonical Vexa meeting id; we write it + the deep link into a Call
row and stop. The user does nothing. To find out what happened on
the call, click through.

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
column, no media column, no status mirror.

### Fields

```
   # identity & link
   id                 uuid          # twenty pk
   name               text          # mirrors CalendarEvent title
   vexa_meeting_id    text          # set after POST /bots returns its id;
                                    # empty for SKIPPED / ERROR rows
   vexa_url           text          # https://dashboard.vexa.ai/meetings/<id>
   provider           enum          # vexa | meeting_baas | manual
                                    #   future schema convergence point

   # what we did at dispatch time (the only state Twenty owns)
   dispatch_outcome   enum          # SCHEDULED | SKIPPED | ERROR
   dispatch_reason    text          # policy reason or error message;
                                    # empty when SCHEDULED

   # source meeting (from CalendarEvent, not Vexa)
   platform           enum          # google_meet | zoom | teams | other
   meeting_url        text          # the join URL we dispatched to
   scheduled_start    timestamptz
   scheduled_end      timestamptz

   # for the future agent
   attendee_emails    raw_json      # captured at dispatch time;
                                    # Person resolution is the agent's job

   # audit
   created_at         timestamptz
   updated_at         timestamptz
```

### Relations

```
   Call ──many-to-one ──▶ Opportunity     # nullable; set when overlap
                                          #   between attendees and the
                                          #   Opp's contacts is unambiguous
   Call ──many-to-one ──▶ Company         # majority vote across attendees
   Call ──many-to-one ──▶ CalendarEvent   # usually set
```

(Person ↔ Call is a junction object, deferred to a later release —
attendee_emails captures the raw data now.)

These relations are the **whole reason this object exists**. Without
them, transcripts are just files. With them, every later release —
viewer, skills, agent — is a single GraphQL query away.

### Why "Call" and not "Recording" or "Meeting"

- **Not "Meeting"**: that's how users refer to `CalendarEvent`. Two
  things both named Meeting in the UI = permanent confusion tax.
- **Not "Recording"**: media-centric and surveillance-y. The object
  must exist even when the bot was skipped or errored and there's no
  recording at all.
- **"Call"** is CRM-native (Salesforce, HubSpot, Pipedrive all use it),
  activity-centric, reads naturally in UI ("3 Calls with Felix"), and
  matches what reps already say.

---

## Lifecycle: end-to-end

```
   # T-∞    user installs app, sets API key, picks calendars, sets policy
   # T-24h  cron sees event in horizon → no Call yet → continue
   # T-5m   cron tick → policy passes → POST /bots
   #          Vexa returns { id: 12345 }
   #        → write Call(SCHEDULED, vexa_meeting_id=12345,
   #                     vexa_url=https://dashboard.vexa.ai/meetings/12345)
   # T+0    meeting starts; bot joins (live state visible in Vexa)
   # T+45m  meeting ends; Vexa transcribes
   #
   # User opens Twenty → sees Call linked to Opportunity → clicks
   # vexa_url → lands on the Vexa dashboard for that meeting,
   # transcript + media + status all live there.
```

```
   # cron horizon vs. dispatch lead-time
   #
   #   horizon = how far ahead we *consider* events.  proposal: 24h.
   #   lead    = how early we POST /bots.             proposal: 5m.
   #             too early = bot waits / Vexa quota.
   #             too late  = race vs. meeting start.
```

Skipped + errored cases write rows too — silent failures kill trust:

```
   # policy rejects:    Call(SKIPPED, dispatch_reason="policy:BLOCKLISTED_DOMAIN")
   # POST /bots fails:  Call(ERROR,   dispatch_reason="<error from Vexa>")
   # POST /bots 429:    no row written; next tick retries
```

---

## Hard parts (the real work)

```
   # 1. attendee → Person resolution
   #    ─ email match is easy; the value is what to do when it misses.
   #    ─ create-on-the-fly Person? behind a setting; default OFF.
   #    ─ for now we capture attendee_emails as RAW_JSON and let the
   #      agent (later release) resolve them — keeps MVP small.
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
   #    ─ Call.calendar_event_id unique; cron checks before dispatch.
   #    ─ event.updated → reconcile; don't double-dispatch.
   #
   # 5. failure surfaces
   #    ─ POST /bots fails → write Call(ERROR, dispatch_reason=...).
   #    ─ silent failures kill trust.
   #
   # 6. uninstall hygiene
   #    ─ best-effort cancel pending bots
   #    ─ optional: "export Call list to Notes before disconnect"
```

---

## What's out of scope for this release

Resist scope creep. The trap is letting this release grow features
that belong in later ones.

- ❌ in-CRM transcript viewer (next release)
- ❌ webhook ingestion (Vexa is the state authority — click through)
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
   #
   # Note: the agent (superproduct) needs an event source for
   # "meeting completed → run hygiene." Three options to pick from
   # then, not now: (a) re-add a Vexa webhook, (b) Twenty cron polls
   # Vexa for completed-since-last-tick, (c) Vexa's MCP server. The
   # decision is deferred to that release.
```

---

## Validation

```
   #   primary signal:
   #     coverage = dispatched / eligible_meetings   target ≥70%
   #     "eligible" = on a watched calendar, has meet URL, ≥1 external
   #                  attendee, not domain-blocked, not user-skipped.
   #
   #   secondary:
   #     bot dispatch success rate           ≥95%   (SCHEDULED / dispatched-attempts)
   #     accidental records (complaints)     <2% of dispatched
   #     installs that disable autopilot in <14 days  <20%
   #
   #   anti-signal: high uninstall after first surprise recording
   #                → privacy UX is wrong, not the product.
```

---

## Definition of done (ship gate)

```
   # functional
   #   ─ install flow: API key + calendar pick + policy → first
   #     SCHEDULED Call within 24h on a real meeting
   #   ─ SKIPPED rows visible w/ reason for blocked / internal-only
   #   ─ ERROR rows visible w/ reason on Vexa API failure
   #   ─ Call.vexa_url opens the right meeting in dashboard.vexa.ai
   #
   # privacy
   #   ─ domain blocklist enforced before POST /bots
   #   ─ internal-only skip enforced
   #   ─ uninstall best-effort cancels pending bots
   #
   # ops
   #   ─ structured logs per Call.id; dispatch_reason populated on
   #     SKIPPED / ERROR
   #   ─ dashboard: coverage, dispatch success rate
   #
   # measurement
   #   ─ event taxonomy in place to compute the coverage signal above
   #     before we ship to the second user
```

---

## Repo skeleton (current)

```
   app/                                     Twenty app (yarn workspace)
     src/
       application-config.ts                app identity + server vars
       constants/universal-identifiers.ts   stable UUIDs
       default-role.ts                      logic-function role
       objects/
         call.object.ts                     Call schema
       fields/
         opportunity-on-call.field.ts       Call → Opportunity (M2O)
         calls-on-opportunity.field.ts      inverse (O2M)
         company-on-call.field.ts           Call → Company
         calls-on-company.field.ts          inverse
         calendar-event-on-call.field.ts    Call → CalendarEvent
         calls-on-calendar-event.field.ts   inverse
       logic-functions/
         cron-dispatch.ts                   */5 * * * * — the autopilot
       lib/
         vexa-client.ts                     POST /bots wrapper +
                                            dashboard URL builder
         meeting-url.ts                     Meet/Zoom/Teams parser
         policy.ts                          blocklist + skip rules
       views/
         all-calls.view.ts                  default table view
       navigation-menu-items/
         calls.navigation-menu-item.ts      sidebar link
   scripts/
     twenty-token.sh                        mints a bearer token for the
                                            local Twenty (dev creds)
   .env.local                               VEXA_API_KEY (gitignored)
   README.md
   TESTING.md
```

---

## License

MIT.
