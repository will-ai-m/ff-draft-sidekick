---
name: positional-tiers
description: Pull the latest FantasyPros positional tiers (QB/RB/WR/TE/DST/K) into a dated research report. Use when the user asks to fetch/refresh tiers, positional tiers, or a tier report ("pull the latest tiers", "get positional tiers", "/positional-tiers").
---

# Pull the latest FantasyPros positional tiers

One command fetches the six positional cheat sheets (QB / RB / WR / TE / DST / K), extracts each
page's **positional** tier structure — the grouping that answers "when does the run at this
position pause" — and writes a dated report. The overall board's cross-position tiers are not
part of this: the project dropped them (2026-09-01) in favor of positional tiers everywhere.

## Steps

1. Run from the repo root (the script resolves paths itself):

   ```bash
   npm run tiers:positional
   ```

   It fetches all six pages live (no caching), parses them with the app's own FR-4 parser, and
   writes `research/fantasypros-positional-tiers-<date>.md` — date taken from the newest page's
   own `last_updated` stamp. Re-running on the same day overwrites that day's file with the
   fresher pull; a new day gets a new file.

2. Report back to the user:
   - the report path,
   - each page's capture age (the stdout digest prints it — flag anything much older than the
     others, which usually means FantasyPros is mid-update),
   - the top two tiers per position from the digest, and anything notable versus the previous
     dated report in `research/` if one exists (tier breaks moving, players switching tiers).

3. If the script exits non-zero, the page shape most likely changed (`No "var ecrData = ..."`).
   Check whether the URLs in `packages/server/scripts/positional-tiers.ts` still render the embed
   before touching the parser — the parser is shared with the live app (FR-4), so fix it only
   with its tests (`packages/server/src/snapshots/fantasypros.test.ts`) in the same change.

## Notes

- **The engine uses these same tiers.** Since 2026-09-01 the app fetches the QB/RB/WR/TE tier
  pages itself at every attach and drives FR-10's tier-urgency facts from them (K/DST never
  enter engine math — 🔶 AS-7; they appear in this report for human draft prep only).
- **This command does not update a running draft.** Snapshots freeze at attach (AC-29). To draft
  on a newer board: Detach → re-attach; the pre-draft check shows what it got, and warns
  per-position if any tier page failed.
