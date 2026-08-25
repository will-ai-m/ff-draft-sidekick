---
id: "003"
slug: need-urgency-and-legible-reasons
type: null
size: null
status: queued
depends_on: []
created: 2026-08-24
---
# Roster-need urgency in plan scoring + legible reason lines

From retro M6 (task 001) and live user feedback (`.work/001-draft-sidekick-v1/live-ops-notes.md` #11): the recommendation reads as "just ECR" — need gates the plan set but carries no urgency, and the reason line rarely shows the need math.

Wanted (per approved retro option, user-refined design 2026-08-24): a **slack feasibility rule** on plan comparison — slack = user's picks remaining after the plan − starting slots still unfilled after the plan; slack < 0 ⇒ plan infeasible (excluded); slack = 0 ⇒ only starter-filling plans allowed; optional `needUrgencyBuffer` (default 1) engages the rule one pick early. K/DST slots count in slack, with the edge speced: when slack forces K/DST, the recommendation must say so although those rows carry no survival math. Reason lines name the math in PRD §9 vocabulary (e.g., "TE: 1 slot, 2 of 4 startable TEs likely gone by your next pick") instead of defaulting to "best available". Spec must include worked examples proving each slack branch reachable (per the new derivation-check duty). Engine scoring change ⇒ full feature-route gates.
