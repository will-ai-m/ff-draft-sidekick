# nflverse data sources: verify recency, not just existence

Source: `.work/001-draft-sidekick-v1/dev-notes-T9.md` §"Live verification", confirmed again by QA's
real `npm run prep:nflverse` run.

## The `player_stats` release is frozen at 2024 — do not use it

- `releases/download/player_stats/player_stats.csv` still exists, still downloads, still parses, and
  is still 33MB. Its newest season is **2024**; the release was last published **2025-05-07**.
- This is the dangerous failure mode: nothing errors. Prepping a 2026 draft from it presents a
  two-year-old game log as "most recent", silently.
- **Use the `stats_player` release instead**: `stats_player_week_<season>.csv`, one file per season,
  1999–2025, with the not-yet-started season correctly 404ing. Three seasons is three ~8MB downloads
  instead of one 33MB file that is 90% discarded.

## The new schema is not the old schema

- `team` (not `recent_team`), `passing_interceptions` (not `interceptions`), `sacks_suffered` (not
  `sacks`). It also adds `fumbles_total` / `fumbles_lost_total`, which give the game-log "fumbles"
  column and `fum_lost` scoring two correctly different numbers.

## Play-by-play is unchanged and is the only source of "longest play"

- `pbp` release, `play_by_play_<season>.csv.gz`, real gzip. The weekly stats files carry no
  longest-reception/longest-rush column, so per-game "long" must be derived from PBP.

## Never trust precomputed fantasy points

- The source's `fantasy_points` / `fantasy_points_ppr` columns are fixed-format and cannot reflect a
  league's actual settings. Points are recomputed per request from the attached league's own scoring
  dict. (One deliberate divergence from nflverse's own formula is documented in the scoring test.)

## The general lesson

A URL that returns 200 proves the asset exists, not that it is current. For any external data
release, verify **when it was last published and what its newest partition is** before designing
around it — and prefer per-partition assets, which fail loudly (404) instead of quietly going stale.
