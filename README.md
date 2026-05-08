# vexa-twenty-app

Twenty CRM app for [Vexa](https://github.com/Vexa-ai/vexa) — open-source
meeting bots + transcripts.

**Status:** scaffold. Not yet installable. Spec lives in
`Vexa-ai/vexa` under `integrations/twenty/`:

- `README.md` — MVP0 → MVP5 roadmap
- `MVP2.md` — the `Call` object + calendar autopilot deep-dive
- `COMPARISON.md` — vs. the Meeting-BaaS Twenty PR
- `KICKOFF.md` — day-1 plan + open questions for Twenty

## What this app will do (MVP2)

Accept a meeting → its transcript shows up on the right Opportunity.

Architecture is **pure pointer**: Vexa stays the system of record for
meetings, transcripts, and media. Twenty owns the relationships
(Person / Company / Opportunity / CalendarEvent) and a deep link back to
Vexa for live + past viewing and bot management.

## Roadmap

```
   #   MVP2  calendar autopilot   ◀── current target
   #   MVP3  in-CRM Calls tab
   #   MVP4  ⌘K skills (record now / summarize last call / draft follow-up)
   #   MVP5  autonomous deal-hygiene agent on Opportunity
```

## License

MIT.
