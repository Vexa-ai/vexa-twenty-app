# Testing the MVP locally

The app is deployed to a local Twenty instance (Docker) at
`http://localhost:2020`. There's no webhook ingestion to test —
Vexa is the state authority, click through `vexa_url` for any
post-dispatch state.

```
   #  Tier 1  UI inspection                                ✅ works
   #  Tier 2  manual Call creation in the UI               ✅ works
   #  Tier 3  cron dispatcher fires on schedule            ✅ works (no-op when
   #                                                          AUTOPILOT_ENABLED=false)
   #  Tier 4  end-to-end: real CalendarEvent → Vexa bot   ⚠ needs autopilot toggle
   #                                                          + Twenty Google Calendar
   #                                                          connection (or hand-
   #                                                          crafted CalendarEvent row)
```

## Prerequisites

```bash
# node 24
. "$HOME/.nvm/nvm.sh" && nvm use 24

# Twenty up?
cd app && yarn twenty server status
# → Status: running (healthy)  URL: http://localhost:2020

# app synced?
yarn twenty dev --once
```

If you re-clone this repo, you'll need to re-run the one-time setup:

```bash
cd app
npx --yes create-twenty-app@latest    # if not present
yarn twenty server start
yarn twenty remote add --as local --api-url http://localhost:2020 --api-key <token>
yarn twenty dev --once
```

The token in `.env.local` is for the real Vexa cloud and is set on
the workspace as the `VEXA_API_KEY` server variable (already done in
this checkout — see "App config" below).

## App config

Two server variables matter (injected as `process.env.<KEY>` in the
cron handler):

```
   VEXA_API_KEY        = vxa_bot_…              (from .env.local)
   VEXA_API_BASE       = https://api.vexa.ai    (default; rarely overridden)
   VEXA_DASHBOARD_BASE = https://dashboard.vexa.ai  (default; for vexa_url)
```

Plus five workspace `applicationVariables` (Settings → Applications →
Vexa for Twenty in Twenty's UI):

```
   AUTOPILOT_ENABLED   = false   ← privacy default; flip per workspace
   DOMAIN_BLOCKLIST    = ""      ← comma-separated
   SKIP_INTERNAL_ONLY  = true    ← skip all-internal-domain meetings
   HORIZON_HOURS       = 24
   LEAD_MINUTES        = 5
```

Note: at the time of writing, the cron handler reads these via
`process.env`. Twenty injects only `serverVariables` as env, not
`applicationVariables`, so the autopilot toggle currently doesn't
take effect from the UI alone. To exercise the dispatch path, see
Tier 4.

---

## Tier 1 — UI inspection (30 sec)

1. Open http://localhost:2020 → log in **`tim@apple.dev` / `tim@apple.dev`**.
2. Sidebar → **Calls**. Empty `All calls` table view, columns:
   `Title`, `Dispatch`, `Scheduled start`, `Opportunity`, `Open in Vexa`.
3. Settings → Applications → Vexa for Twenty → see the five
   workspace variables.

What this proves: object schema, view, navigation, and workspace
config registered correctly.

## Tier 2 — Manual Call creation (UI)

On the **Calls** page, click **+ Add Call**. Fill in fields. Save.
Open the row, link an Opportunity / Company / Calendar event from
the right-side relation pickers. What this proves: data model +
relations work without any Vexa or cron involvement.

## Tier 3 — Cron dispatcher fires on schedule

The cron is registered. Watch it tick:

```bash
docker logs --since 10m twenty-server-1 2>&1 | grep -i vexa
```

**You should see:** lines every 5 minutes like

```
cron-dispatch: AUTOPILOT_ENABLED=false; no-op
vexa-cron-dispatch:<uuid>
```

That's the kill-switch firing on Twenty's `*/5 * * * *` schedule.
Live tail:

```bash
docker logs -f twenty-server-1 2>&1 | grep -i vexa
```

What this proves: cron handler is wired up, env injection works for
`AUTOPILOT_ENABLED=false` (the default), and the privacy default
holds.

## Tier 4 — End-to-end dispatch (real Vexa bot)

Burns Vexa quota. Recommended only after Tier 1-3 pass.

**Step 1 — flip autopilot.** Currently `AUTOPILOT_ENABLED` is an
`applicationVariable` but the cron reads `process.env`. Two options:

- **(a) Move it to `serverVariable`** in `app/src/application-config.ts`
  and re-sync. Then set its value via the metadata API or UI.
- **(b) Bypass for testing**: edit `cron-dispatch.ts` to comment out
  the `AUTOPILOT_ENABLED` check during local testing. Don't commit.

**Step 2 — give the cron a CalendarEvent.** Twenty's local instance
has zero CalendarEvent rows. Either:

- Connect Google Calendar in **Settings → Accounts** and accept a
  meeting with a Meet URL within `LEAD_MINUTES` (default 5).
- Or insert a row via the GraphQL data API:

```bash
TOK=$(bash scripts/twenty-token.sh)
SOON=$(date -u -d '+3 minutes' +%Y-%m-%dT%H:%M:%SZ)
END=$(date -u -d '+33 minutes' +%Y-%m-%dT%H:%M:%SZ)

curl -sS http://localhost:2020/graphql -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" \
  -d "{\"query\":\"mutation{ createCalendarEvent(data:{
        title: \\\"E2E test meeting\\\",
        startsAt: \\\"$SOON\\\",
        endsAt: \\\"$END\\\",
        conferenceLink: { primaryLinkUrl: \\\"https://meet.google.com/abc-defg-hij\\\" }
      }){ id title } }\"}"
```

**Step 3 — wait for the cron tick** (or restart the container to nudge
it). Watch logs:

```bash
docker logs -f twenty-server-1 2>&1 | grep -iE "vexa|cron-dispatch"
```

**Expected outcomes:**

```
   # success path
   cron-dispatch: dispatching <event-id> (google_meet/abc-defg-hij)
   → Call(SCHEDULED) row appears in Twenty
   → Call.vexa_url = https://dashboard.vexa.ai/meetings/<real-id>
   → click vexa_url → live Vexa dashboard for that meeting
   #
   # policy rejection
   → Call(SKIPPED, dispatch_reason="policy:BLOCKLISTED_DOMAIN")
   #
   # Vexa error
   → Call(ERROR, dispatch_reason="<HTTP status + body>")
```

To use the real Vexa key from `.env.local`:

```
   ─ Settings → Applications → Vexa for Twenty
   ─ VEXA_API_KEY is already set to the value from .env.local
   ─ yarn twenty dev --once   # re-syncs after any code change
```

---

## Helper scripts

```
   scripts/twenty-token.sh         mints a bearer token from the
                                   local Twenty's dev creds
                                   (tim@apple.dev / tim@apple.dev)
```

## Triage cheatsheet

```
   # symptom                              where to look
   #
   # cron always says AUTOPILOT=false     applicationVariables aren't
   #                                      injected as process.env (Tier 4)
   # cron throws on calendarEvents       Twenty's GraphQL field shape
   #                                      changed — field names live in
   #                                      app/src/logic-functions/cron-dispatch.ts
   # POST /bots returns 401              VEXA_API_KEY wrong; check
   #                                      Settings → Applications → Vexa
   # vexa_url 404 in dashboard            real id mismatch; the cron uses
   #                                      result.id from POST /bots, so
   #                                      this should be the real one
   # "Calls" missing in sidebar           yarn twenty dev --once didn't
   #                                      sync; check yarn twenty remote status
   # local Twenty unreachable             yarn twenty server status / start
```

## Logs

```bash
docker logs --tail 100 twenty-server-1 2>&1 | grep -iE "vexa|logic"
docker logs -f twenty-server-1 2>&1 | grep -iE "vexa|logic"  # tail
```

App handlers `console.log` / `console.warn` / `console.error` show up
under the `[ConsoleApplicationLogDriver]` tag.
