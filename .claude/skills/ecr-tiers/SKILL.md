---
name: ecr-tiers
description: Pull the latest FantasyPros ECR plus every position's positional tiers into a dated research report. Use when the user asks to fetch/refresh ECR, get the latest tiers, positional tiers, or a tier report ("pull the latest ECR", "get the tiers", "/ecr-tiers").
---

# Pull the latest FantasyPros ECR and positional tiers

One command fetches the overall half-PPR cheat sheet **and** the six positional cheat sheets
(QB / RB / WR / TE / DST / K), extracts each page's tier structure, and writes a dated report.
The positional pages carry *positional* tiers — the grouping that answers "when does the run at
this position pause" — which the overall board's cross-position tiers slice differently.

## Steps

1. Run from the repo root (the script resolves paths itself):

   ```bash
   npm run ecr:tiers
   ```

   It fetches all seven pages live (no caching), parses them with the app's own FR-4 parser, and
   writes `research/fantasypros-tiers-<date>.md` — date taken from the newest page's own
   `last_updated` stamp. Re-running on the same day overwrites that day's file with the fresher
   pull; a new day gets a new file.

2. Report back to the user:
   - the report path,
   - each page's capture age (the stdout digest prints it — flag anything much older than the
     others, which usually means FantasyPros is mid-update),
   - the top two tiers per position from the digest, and anything notable versus the previous
     dated report in `research/` if one exists (tier breaks moving, players switching tiers).

3. If the script exits non-zero, the page shape most likely changed (`No "var ecrData = ..."`).
   Check whether the URLs in `packages/server/scripts/ecr-tiers.ts` still render the embed before
   touching the parser — the parser is shared with the live app (FR-4), so fix it only with its
   tests (`packages/server/src/snapshots/fantasypros.test.ts` region) in the same change.

## Notes

- **This does not update a running draft.** The app fetches its own ECR at attach and freezes it
  for that draft (AC-29). To draft on a newer board: Detach → re-attach; the pre-draft check
  shows the capture time it got.
- The recommendation engine's tier logic currently reads the **overall** board's tiers
  (FR-10's value model). This report is the human-facing view; if the user asks to drive the
  engine off positional tiers instead, that is an engine change (`recommend/value.ts`), not a
  report tweak.
