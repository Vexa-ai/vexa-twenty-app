# Testing the MVP locally

The app is deployed to a local Twenty instance (Docker) at
`http://localhost:2020`. This guide is split by **what works
end-to-end today** vs **what still needs setup**.

```
   #  Tier 1  UI inspection                         ✅ works
   #  Tier 2  manual Call creation in the UI        ✅ works
   #  Tier 3  webhook handler with signed payload   ✅ works  (HMAC, FSM, upsert)
   #  Tier 4  cron dispatch                         ⚠ runs, but needs CalendarEvent + autopilot toggle
   #  Tier 5  real Vexa bot end-to-end              ⚠ needs internet-reachable tunnel
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
# add a remote — see scripts/bootstrap-remote.sh below for the headless flow
yarn twenty dev --once
```

The token in `.env.local` is for the real Vexa cloud and should be set
on the workspace as the `VEXA_API_KEY` server variable (already done
in this checkout — see "App config" below).

## App config (one-time, already applied here)

The app declares three server variables. They're injected as
`process.env.<KEY>` into logic-function runtimes. Currently set:

```
   VEXA_API_KEY        = vxa_bot_…              (from .env.local)
   VEXA_WEBHOOK_SECRET = dev-secret             (use a real one in prod)
   VEXA_API_BASE       = https://api.vexa.ai
```

To change them later via the metadata API, see
`scripts/set-server-vars.sh` (referenced below) — or use the Twenty UI
**Settings → Applications → Vexa for Twenty**.

---

## Tier 1 — UI inspection (30 sec)

1. Open http://localhost:2020 → log in **`tim@apple.dev` / `tim@apple.dev`**.
2. Sidebar → **Calls**. Empty `All calls` table view, columns:
   `Title`, `Status`, `Scheduled start`, `Opportunity`, `Open in Vexa`.
3. Open one of the existing Call rows from Tier 3 below — note the
   `vexaUrl` link, the `status` enum select, the empty `Opportunity`
   relation picker.

What this proves: object schema, view, navigation registered correctly.

## Tier 2 — Manual Call creation (UI)

On the **Calls** page, click **+ Add Call** and fill in fields. Save.
Open the row, link an Opportunity / Company / Calendar event from the
right-side relation pickers. What this proves: data model + relations
work without any Vexa or cron involvement.

## Tier 3 — Webhook handler ✅

The webhook is mounted at `/s/vexa/ingest`. The helper script signs a
fake `meeting.*` payload with `VEXA_WEBHOOK_SECRET=dev-secret` (the
value set on the app):

```bash
cd /home/dima/dev/vexa-twenty-app

# happy path: meeting.completed creates a Call(COMPLETED)
PAYLOAD=$(VEXA_WEBHOOK_SECRET=dev-secret python3 scripts/sign-webhook.py \
    --event meeting.completed --meeting-id google_meet:test-001)
SIG=$(python3 -c 'import sys,json; print(json.loads(sys.argv[1])["headers"]["x-webhook-signature"])' "$PAYLOAD")
RAW=$(python3 -c 'import sys,json; print(json.loads(sys.argv[1])["rawBody"])' "$PAYLOAD")

curl -sS http://localhost:2020/s/vexa/ingest -X POST \
  -H "Content-Type: application/json" -H "x-webhook-signature: $SIG" \
  --data-binary "$RAW"
# → {"ok":true}
```

Refresh the **Calls** page in Twenty — a row with
`vexaMeetingId=google_meet:test-001`, `status=COMPLETED`, deep link in
`vexaUrl` should appear.

**Verified end-to-end** in this checkout:

```
   bad signature           → {"ok":false,"reason":"BAD_SIGNATURE"}
   meeting.completed       → creates Call(COMPLETED)
   meeting.failed (same id)→ updates same row to FAILED, totalCount=1 (no dup)
```

Lookup helper:

```bash
TOK=$(bash scripts/twenty-token.sh)
curl -sS http://localhost:2020/graphql -X POST \
  -H "Content-Type: application/json" -H "Authorization: Bearer $TOK" \
  -d '{"query":"{ call(filter:{vexaMeetingId:{eq:\"google_meet:test-001\"}}){ id name status vexaUrl platform } }"}'
```

## Tier 4 — Cron dispatch ⚠

The cron handler (`vexa-cron-dispatch`) IS running. Verify with docker
logs:

```bash
docker logs --since 5m twenty-server-1 2>&1 | grep -i vexa
# → "cron-dispatch: AUTOPILOT_ENABLED=false; no-op"
```

That's the kill-switch firing. To exercise the dispatch path:

**Step 1 — flip autopilot.** The `AUTOPILOT_ENABLED` toggle is an
`applicationVariable` (workspace-level, set via UI **Settings →
Applications → Vexa for Twenty**). Note: at the time of writing, the
local code reads it via `process.env.AUTOPILOT_ENABLED` — that's
populated for `serverVariables` only. If you want the cron's
`AUTOPILOT` gate to flip via the UI, either:

- Move `AUTOPILOT_ENABLED` to `serverVariables` in
  `app/src/application-config.ts` (and re-sync), or
- Use the SDK's application-variable accessor (TODO — not wired in
  this MVP). For now, the simplest path is the env-var move.

**Step 2 — give the cron a CalendarEvent to chew on.** Create one via
the UI (Settings → Calendar) or the GraphQL mutation. The event needs
`startsAt` within `LEAD_MINUTES` (default 5) and a Google Meet / Zoom
/ Teams URL in `conferenceLink.primaryLinkUrl`.

**Step 3 — wait or trigger.** The cron fires on `*/5 * * * *`. To
nudge it, there's no clean public mutation (`executeOneLogicFunction`
hangs for app-defined functions in this build of Twenty). Easiest path
is wait for the next tick and tail logs:

```bash
docker logs -f twenty-server-1 2>&1 | grep -iE "vexa|cron-dispatch"
```

Expected on a successful path: `scanned: N, dispatched: 1, skipped: 0`,
followed by a Call row appearing in **Calls** with status `SCHEDULED`.

If `VEXA_API_KEY` is invalid or unreachable: a `Call(FAILED)` row with
`failureReason` populated. That's the right behavior — silent failures
kill trust.

## Tier 5 — real Vexa bot end-to-end ⚠

Burns Vexa quota. Recommended only after Tier 1-4 pass.

1. Configure Vexa to deliver `meeting.*` webhooks to a public URL.
   The local Twenty isn't internet-reachable; use a tunnel
   (`cloudflared tunnel`, `ngrok http 2020`) and point Vexa's webhook
   config at `https://<tunnel>/s/vexa/ingest`.
2. Use the same `VEXA_WEBHOOK_SECRET` on both ends.
3. Resolve Tier 4 (autopilot + CalendarEvent setup).
4. Create a CalendarEvent for a Meet URL you control, ~6 min out.
5. Watch **Calls** page transition: `SCHEDULED` → `IN_PROGRESS` (when
   bot joins) → `COMPLETED` (after meeting ends).
6. Click **Open in Vexa** → land on the Vexa dashboard for that
   meeting. That's the pure-pointer thesis on screen.

---

## Helper scripts

```
   scripts/twenty-token.sh         mints a bearer token from tim@apple.dev creds
   scripts/sign-webhook.py         builds an HMAC-signed Vexa webhook payload
   scripts/exec-fn.sh              tries executeOneLogicFunction (hangs in
                                   current build for app-defined functions —
                                   left in tree for future use)
```

## Triage cheatsheet

```
   # symptom                              where to look
   #
   # webhook returns NO_SECRET            VEXA_WEBHOOK_SECRET unset on app —
   #                                      see "App config" above
   # webhook returns BAD_SIGNATURE        secret on app != secret used to sign
   # webhook returns MALFORMED            payload missing event_type / meeting.id
   # webhook 500 LOGIC_FUNCTION_ERROR     check docker logs twenty-server-1 —
   #                                      our handler logs go through
   #                                      ConsoleApplicationLogDriver
   # cron always says AUTOPILOT=false     applicationVariables aren't injected
   #                                      as process.env (see Tier 4 step 1)
   # "function not found" (exec-fn.sh)    re-run yarn twenty dev --once;
   #                                      executeOneLogicFunction is finicky
   #                                      anyway — prefer the curl /s/* path
   # Call object missing in sidebar       yarn twenty remote status; re-sync
   # Twenty unreachable                   yarn twenty server status / start
```

## Logs

```bash
docker logs --tail 100 twenty-server-1 2>&1 | grep -iE "vexa|logic"
docker logs -f twenty-server-1 2>&1 | grep -iE "vexa|logic"  # tail
```

App handlers `console.log` / `console.warn` / `console.error` show up
under the `[ConsoleApplicationLogDriver]` tag.
