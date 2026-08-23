# Dev notes — 001-draft-sidekick-v1 (T9: player game-log data prep and runtime reader, FR-11 backend)

Scope: design.md §T9 only (AC-62 … AC-65, plus the AC-64 scoring rule). Nothing under
`packages/server/src/{sleeper,snapshots,roster}/`, `observability.ts`, or any other task's
fixtures was created or edited — T4 was running concurrently in the same tree. The only file
touched outside `src/gamelogs/` is `scripts/prep-nflverse-data.ts`, the T1 scaffold §T9 exists
to fill in. No frontend work (AC-61's card UI is T14; the `/api/player/:id/gamelog` route is T10).

## Changes

All new, all under T9's own area.

**`packages/server/src/gamelogs/types.ts`** — the cache vocabulary: `CachedGame` (AC-62's stat
line plus the two scoring-only fields), `CachedPlayer`, `GameLogCache`, `PrepStats`,
`GAMELOG_CACHE_VERSION`.

**`gamelogs/nflverse.ts`** — source readers. URL builders for both nflverse assets,
`parseWeeklyStats` (regular season only, positions with an AC-62 stat line only),
`toCachedGame` (position-appropriate lines, guarded `avg`/`ydsPerTgt`), `deriveReceivingLongs`
(the play-by-play reduce that produces AC-62's receiving "long"), and the two fetchers —
`fetchPlayByPlay` gunzips in memory and returns only text.

**`gamelogs/prep.ts`** — `buildGameLogCache` (season discovery → download → derive → crosswalk
join → cache) and `writeGameLogCache`. Not on the live server's path.

**`gamelogs/scoring.ts`** — AC-64's recompute: a Sleeper-scoring-key → cached-stat table,
`scoreGame`, and `unsupportedScoringKeys` for the keys no game-log column can answer.

**`gamelogs/store.ts`** — the runtime reader: `loadGameLogCache` + `GameLogStore`, season tabs
newest-first (AC-63), explicit no-data card (AC-65), points computed per request (AC-64).

**`scripts/prep-nflverse-data.ts`** — the T1 no-op replaced by the real CLI, keeping the
"run this manually before each draft season" header §T9 asks for.

**Fixtures** (`packages/server/test/fixtures/`) — `player_stats-2025-slice.csv`,
`player_stats-2024-slice.csv`, `pbp-2025-slice.csv.gz`, `pbp-2024-slice.csv.gz`, plus
`test/msw/nflverseHandlers.ts`. Every row is a **verbatim slice of live data** downloaded during
this task. The play-by-play fixtures are real gzip, exactly like the live release asset, so the
decompression path is exercised rather than stubbed (`gunzip -c` reveals the readable slice).

### Live verification, and the one place design.md's stated source is wrong

Everything below was found by running against the real endpoints, not by reasoning.

1. **design.md §T9's `player_stats.csv` is frozen at the 2024 season.** §T9 says
   `releases/download/player_stats/player_stats.csv` is "all seasons 1999–present combined,
   33MB". The file exists and is 33MB — but the whole `player_stats` release was last published
   **2025-05-07** and its newest season is **2024** (checked directly: 0 assets in that release
   mention 2025 or 2026, and the combined file's max season is 2024). Prepping a 2026 draft from
   it would present a two-year-old log as "most recent" — silently, since the file loads fine.
   nflverse moved weekly player stats to the **`stats_player`** release (updated 2026-08-13),
   one file per season: `stats_player_week_<season>.csv`, seasons 1999–2025, with 2026 correctly
   404ing because the season has not started. This task uses that release.
   Per-season files are also the better fit for AC-63's window: three seasons is three ~8MB
   downloads instead of one 33MB file that is 90% discarded.
2. **The new schema is not the old schema.** `team` (not `recent_team`),
   `passing_interceptions` (not `interceptions`), `sacks_suffered` (not `sacks`) — and, usefully,
   `fumbles_total` / `fumbles_lost_total`, which spare the scorer summing three fumble columns
   and give AC-62's "fumbles" column and `fum_lost` scoring two correctly different numbers.
3. **The play-by-play URL in §T9 is correct** (`pbp` release, `play_by_play_<season>.csv.gz`,
   19MB gz / ~98MB expanded, seasons 1999–2025), as is the "no longest-play column in the weekly
   file" gap that makes the play-by-play pass necessary at all.
4. **Only completed passes may count toward "long".** Scanning the full 2025 play-by-play: the
   only non-completion rows carrying a receiver and positive `yards_gained` are the season's 43
   two-point conversions (every one with an empty `receiving_yards`). `complete_pass === '1'` is
   therefore the correct and sufficient filter, and one such row — Brock Bowers's real week-3
   two-point catch — is in the fixture so the filter is exercised against real data.

**Full live run** (`npm run prep:nflverse`, real network): 12,480 crosswalk rows; probed 2026
(not published), then cached 2025/2024/2023 — 17,940 regular-season rows → **863 players,
17,927 games, 3.8MB `gamelogs.json`, 22.8s**. Only 13 rows failed to join (7 with no crosswalk
row, 6 whose crosswalk row carries `sleeper_id = "NA"`), a 99.93% join rate. Spot checks against
the real cache: Gibbs 17 games in 2025, best 49.9 half-PPR points (week 12 vs NYG), longest
reception 42; Bowers has **two** season tabs, not three, because he entered the league in 2024 —
AC-63's "prior seasons where data exists" behaving correctly on real data; Squirrel White (a 2026
rookie) returns the AC-65 no-data card. 3.8MB matches design.md's "a few MB at most for 3
seasons" budget.

### Decisions worth a reviewer's attention

1. **The cache stores no fantasy-point total, contradicting §T9's literal cache shape.** §T9's
   shape bullet lists `{week, opponent, fantasyPoints, …}`, but its own scoring bullet — and
   AC-64 — require points to come from the attached league's settings, which are unknown when the
   prep script runs (it runs once before draft season, against no league). Storing a number would
   mean either a generic format leaking onto the card or a stale value shadowing the league's, so
   the cache holds the raw line and `store.ts` scores it per request. A test asserts the string
   `fantasyPoints` never appears in the serialized cache. The displayed `GameLogEntry` still
   matches AC-62 exactly, including `fantasyPoints`.
2. **`scripts/prep-nflverse-data.ts` is a thin CLI over `src/gamelogs/prep.ts`.** design.md's
   file plan lists only the script. A top-level script that downloads and writes cannot be tested
   without running it, and §T9's done-when requires testing the prep against fixture slices, so
   the logic lives in an importable module and the script does config + progress + summary.
3. **Kickers and defenses are not cached.** AC-62 defines passing/rushing/receiving column sets
   only; there is no kicking stat line to show, and design.md's own cache shape has no field for
   one. A kicker therefore lands on AC-65's "no NFL game data" card. That message is a small lie
   for a kicker (the data exists upstream — the new weekly file carries `fg_made_*`/`pat_*`),
   so this is flagged rather than hidden: if K cards are wanted, it is a follow-up that adds a
   kicking line to `types/gamelog.ts`, the scorer, and T14's card, not a change to this join.
4. **Position decides which lines appear, activity only ever adds one.** A QB always shows
   passing and rushing, a RB rushing and receiving, a WR/TE receiving — so a card's columns are
   stable week to week — plus any line the player actually produced (Chase's week-3 carry gets a
   rushing line; his week-2 game does not). Zero-activity columns beat columns that appear and
   disappear between rows of the same table.
5. **Two real divide-by-zero guards, both fixture-backed.** Jahmyr Gibbs's 2024 week 3 has 20
   receiving yards and a receiving TD on **0 targets and 0 receptions** (the yardage came on a
   lateral), which makes `ydsPerTgt` a genuine division by zero on real data, and his "long"
   correctly 0 because he has no completed pass that week. `avg` is guarded the same way.
6. **`resolveScoringSettings` was deliberately NOT written here.** T4 landed
   `roster/leagueSettings.ts`'s `resolveScoring` and `@sidekick/shared`'s `scoringDefaults` while
   this task was in flight — the league-dict-or-named-fallback decision is FR-5's, and
   duplicating it would have created two answers to "what scoring is this draft using". T9's
   scorer takes a resolved dict as a parameter (the same seam T3 used for the Sleeper dump), and
   a test proves it composes with the shared `defaultScoringSettings` fallback a mock hits.
   `packages/shared/src/config/scoringDefaults.ts` was on my list to create; T4 got there first
   and its table is live-verified, so I consumed it rather than writing a second one.
7. **An unknown scoring key is ignored, not fatal.** A real Sleeper dict carries dozens of keys
   (T4 measured 81 on a live league), most of them defensive or kicking. `scoreGame` pays out the
   27 keys a skill-position game log can answer and ignores the rest; `unsupportedScoringKeys`
   exposes what was ignored so the gap is
   inspectable rather than silent. The alternative — throwing on an unrecognised key — lets a
   perfectly valid league dict crash a player card.
8. **The dependency runs prep → store, never the reverse.** `store.ts` owns the cache path,
   filename and accepted version; `prep.ts` imports them and writes to that contract. The offline
   builder is thereby importable from the runtime reader's world but not vice versa, which is what
   "the prep script is not part of the live server's code path" has to mean in an import graph.
9. **A missing or unreadable cache is never fatal.** `GameLogStore` reports `isLoaded: false` and
   a reason, and answers every lookup with the AC-65 card. FR-11 is a convenience surface; it must
   not be able to take the draft board down if the user never ran the prep script.
10. **Season discovery, not arithmetic.** The window is "the most recent `gamelogSeasonsToCache`
   seasons that exist", probed newest-first from the current calendar year, tolerating the
   leading 404 that every January–August has (live: 2026). It stops on two consecutive misses
   after the first hit, with a hard probe cap, so a nflverse outage can't loop.
11. **`test/msw/nflverseHandlers.ts`, not the shared `test/msw/handlers.ts`** — continuing T2's
    and T3's split-by-source convention (design.md §T1 assigned one shared file; three concurrent
    tasks would have collided on it).
12. **Only the receiving "long" is derived from play-by-play.** §T9's bullet says "longest
    completed pass / longest rush"; AC-62 lists `long` for receiving only, and T1's `RushingLine`
    and `PassingLine` have no such field. Deriving a rushing long would have meant either dead
    data in the cache or widening a shared type no AC asks to widen.
13. **Rounding.** `fantasyPoints`, `avg` and `ydsPerTgt` are rounded to 2 decimals at the source.
    0.04 points per passing yard produces binary-float dust (`394 * 0.04 = 15.760000000000002`)
    that has no business reaching a player card or an equality assertion.

### Fixture provenance

| player | why they are in the fixture |
|---|---|
| Josh Allen (QB, `00-0034857`) | the QB column set; also the only fixture player with postseason rows, so the REG-only filter is exercised on real data |
| Jahmyr Gibbs (RB, `00-0039139`) | the RB column set; his 2024 week 3 is the real 0-target/20-yard/1-TD row behind the `ydsPerTgt` guard and the missing-long case |
| Ja'Marr Chase (WR, `00-0036900`) | the WR column set; carried the ball once in 2025 week 3 and not at all in week 2, which is what pins "activity adds a line" |
| Brock Bowers (TE, `00-0039338`) | the TE column set; his real week-3 two-point catch is what the "a two-point conversion is not a reception" test stands on |
| Travis Etienne (`00-0036973`) | a real stats row absent from T3's crosswalk slice → the unjoined-row count |
| Squirrel White (Sleeper `13943`) | a real crosswalk row with `gsis_id = "NA"`, so he can never have cached games → AC-65's rookie case, no synthetic data needed |

The crosswalk fixture is T3's `crosswalk-slice.csv`, unmodified and loaded through T3's own
`parseCrosswalkCsv`/`loadCrosswalk` — §T9 says to import that loader, not re-download the CSV,
and the prep tests go through `loadCrosswalk` (msw-served) so that wiring is proven, not assumed.

## Test-first evidence

All four test files (plus the msw handler module) were written and confirmed failing before any
implementation file existed.

- failing: `npx vitest run --project server src/gamelogs` →
  ```
   ❯ |server| src/gamelogs/prep.test.ts (0 test)
   ❯ |server| src/gamelogs/store.test.ts (0 test)
   ❯ |server| src/gamelogs/nflverse.test.ts (0 test)
   ❯ |server| src/gamelogs/scoring.test.ts (0 test)

  Error: Failed to load url ../../src/gamelogs/nflverse (resolved id: ../../src/gamelogs/nflverse)
  in /Users/willyu/willy-ff/packages/server/test/msw/nflverseHandlers.ts. Does the file exist?

   Test Files  4 failed (4)
        Tests  no tests
  exit: 1
  ```
- passing: `npx vitest run --project server src/gamelogs` →
  `Test Files 4 passed (4) / Tests 43 passed (43)` (nflverse 16, prep 10, scoring 10, store 7).
- commits: none — per the orchestrator's instruction for this spawn the developer does not
  commit; the orchestrator does. Test-first ordering is recorded here instead of by commit order.

Two assertions were corrected while writing, before the implementation existed — in both cases
the **test** was wrong, and neither was a pre-existing test:

- `prep.test.ts` "keys every player by their Sleeper id" first asserted Travis Etienne landed on
  `stats.rowsWithoutSleeperId`. He has no crosswalk row at all, which is the distinct
  `rowsWithoutCrosswalkRow` counter; the "crosswalk row exists but carries no Sleeper id" branch
  needed its own case, so one was added with a synthetic two-row crosswalk (no fixture of another
  task was edited to manufacture it).
- `nflverse.test.ts`'s position test initially expected a kicker row to survive parsing. It does
  not, by decision 3 above; the assertion and its comment were corrected to say why.

Coverage of §T9's three named done-when cases, each asserted individually:

| done-when case | test |
|---|---|
| prep over the fixture slices produces AC-62's shape, incl. a correctly derived "long" | `prep.test.ts` → "writes AC-62's exact stat line, with the long derived from play-by-play" (Gibbs's whole week-2 object, Allen's QB line, Chase's 41-yard 2024 long) |
| runtime reader returns season-tabbed data | `store.test.ts` → "returns the most recent season first, with prior seasons as further tabs (AC-63)" + "returns the per-game stat line AC-62 asks for" |
| runtime reader's explicit no-data state | `store.test.ts` → "states that a player has no NFL game data instead of showing an empty table (AC-65)", plus the unnamed-player and missing-cache variants |
| a custom league's scoring differing from the source file's precomputed column | `scoring.test.ts` → "produces a total the source file's precomputed columns do not contain" (49.7 vs the file's own 38.76) and "applies a positional reception bonus only to that position" |

Beyond those: an independent check that the scorer's stat mapping is right at all —
"reproduces nflverse's own precomputed columns on every fixture row" recomputes standard and PPR
points for all 28 fixture rows and compares them to `fantasy_points`/`fantasy_points_ppr` from the
source file, to the cent. (One deliberate override, commented in the test: nflverse's formula
charges −2 for an interception where Sleeper's default table charges −1, so the comparison pins
nflverse's convention rather than papering over the difference.)

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. All four T9 test files
  (`src/gamelogs/{nflverse,prep,scoring,store}.test.ts`) are new, as are the four fixtures and
  `test/msw/nflverseHandlers.ts`. T1's, T2's, T3's and T4's suites are untouched, as are their
  fixtures — `crosswalk-slice.csv` is consumed as-is.

## Commands

Run from repo root, with T4's concurrent work also present in the tree.

- test: `npm test` → **exit 0** — `Test Files 22 passed (22) / Tests 269 passed (269)`. T9
  contributes 43. Scoped: `npx vitest run --project server src/gamelogs` → 4 files, 43 tests.
- lint: `npm run lint` → **exit 0**.
- typecheck: `npm run typecheck` → **exit 0**, all three `tsc --noEmit` invocations clean.

Additional verification beyond the suite:

- `npm run prep:nflverse` → **exit 0** against the real endpoints, writing a 3.8MB
  `data/cache/gamelogs.json` (gitignored) covering 2025/2024/2023 in 22.8s; the real
  `GameLogStore` was then driven against that file (season tabs, per-game points, the AC-65
  rookie case) — numbers in "Live verification" above.

## Left for downstream tasks (seams T9 exposes, deliberately unwired here)

- **T10** constructs `GameLogStore.fromCacheDir()` once at startup and serves
  `GET /api/player/:sleeperPlayerId/gamelog` from `getPlayerCard(id, { scoring, player })`.
  The `scoring` argument is T4's `LeagueSettings.scoring.settings`; `player` is the Sleeper dump's
  name/position/team, used only to name an AC-65 card. `store.isLoaded === false` (prep never
  run) is worth surfacing on the pre-draft check alongside T3's snapshot ages.
- **T14** renders `PlayerCard` verbatim: `hasData: false` is AC-65's message, `seasons` is
  already newest-first for AC-63's tabs, and a game's present/absent `passing`/`rushing`/
  `receiving` is exactly AC-62's column set for that player.
