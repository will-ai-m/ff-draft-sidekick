# Dev notes — 001-draft-sidekick-v1 (T3: ECR/ADP snapshots and player-ID crosswalk matching, FR-4)

Scope: design.md §T3 only (AC-22 … AC-29). Nothing under `packages/server/src/sleeper/`,
`observability.ts`, `test/msw/sleeperHandlers.ts` or T2's draft fixtures was created or edited —
T2 was running concurrently in the same tree. Nothing in `packages/shared/` was edited either;
T1 had already shaped `PreDraftCheckData` / `PreDraftWarning` / `SnapshotInfo`, and this task
conforms to those shapes rather than changing them.

## Changes

All new files, all under T3's own area.

**`packages/server/src/snapshots/types.ts`** — FR-4's ingestion vocabulary: `EcrEntry`/`EcrSnapshot`,
`AdpEntry`/`AdpSnapshot`, `CrosswalkRow`/`Crosswalk`, `MatchedPlayer`/`UnmatchedEntry`/`MatchResult`,
`SnapshotBundle`, and a deliberately narrow `SleeperPlayerRecord`.

**`snapshots/fantasypros.ts`** (AC-23) — `parseEcrHtml` extracts `var ecrData = {...};` by anchored
regex and validates it with zod; `fetchEcrSnapshot` does the one fetch;
`snapshotHasKickersAndDefenses` is AC-23's K/DST check. `rank_ecr` is surfaced raw, never re-sorted
(🔶 AS-8). `capturedAt` comes from `last_updated_ts` (a unix-seconds field), not the `"8/23"`
`last_updated` string, which carries no year.

**`snapshots/ffc.ts`** (AC-24) — `selectAdpPool` (nearest supported team count, ties toward the
larger), `buildAdpUrl`, `describeAdpPool`, `parseAdpResponse` (zod), `fetchAdpSnapshot`. The
supported pool list is always passed in from `adpPoolTeamSizes`; this module has no literal
`[8,10,12,14]` anywhere.

**`snapshots/crosswalk.ts`** (AC-25) — `parseCrosswalkCsv` + `loadCrosswalk` with a TTL'd local
cache at `data/cache/crosswalk.json` (gitignored). Indexes by `fantasypros_id` (the ECR join) and by
`gsis_id` (T9's game-log join) — T9 imports this loader rather than re-downloading the CSV.

**`snapshots/match.ts`** (AC-25, AC-26) — `normalizeName`, `normalizePosition`, `normalizeTeam`,
`buildSleeperIndex`, `assignSamplingRanks`, `matchSnapshots`. Three resolution paths in order:
crosswalk `fantasypros_id → sleeper_id`, normalized name, and team abbreviation for DST.

**`snapshots/predraftCheck.ts`** (AC-22, AC-23, AC-24, AC-27, AC-28) — `buildPreDraftCheck` (a pure
function of a loaded bundle) and `rankingsDisabledReason`.

**`snapshots/store.ts`** (AC-29) — `SnapshotStore`: loads once, freezes, dedupes concurrent calls,
and only `reset()` (a new attach) permits another fetch.

**Fixtures** (`packages/server/test/fixtures/`) — `ecrData-slice.json`, `ffc-slice.json`,
`crosswalk-slice.csv`, `sleeper-players-slice.json`. Every row is a **verbatim slice of live data**
fetched from the four real sources during this task, not hand-written approximations.

**`packages/server/test/msw/snapshotHandlers.ts`** — msw handlers for the three external sources
plus fixture loaders and a per-source request counter (which is how "fetched exactly once" is
asserted rather than assumed).

### Live verification, and the two places the design's stated facts were wrong

The modules were run end-to-end against the real feeds (839-row ECR, 230-row FFC, 12,480-row
crosswalk, 12,221-player Sleeper dump), not only against fixtures. Result: **837/839 ECR rows match**
(726 crosswalk-id + 79 name + 32 team-defense), 2 unmatched, 0 unmatched ADP rows. Both design
claims below were caught by that run, not by reasoning:

1. **Sleeper spells team defenses `"DEF"`, not `"DST"`**, and keys them by team abbreviation
   (`players["HOU"]`), with no `full_name` at all. design.md §T3 says "Sleeper's team-defense
   pseudo-players (position `DST`)". `normalizePosition` maps `DEF`/`D/ST`/`DEFENSE` → `DST` (and
   FFC's `PK` → `K`), so all three feeds' spellings converge.
2. **FantasyPros ships the Jacksonville defense as `JAC`; Sleeper keys it `JAX`.** A literal
   abbreviation compare silently dropped one DST off the board — caught only because the live run
   reported 31 of 32 defenses matched. `normalizeTeam` now canonicalizes aliases (JAC→JAX, LVR/OAK→LV,
   WSH→WAS, LA/STL→LAR, SD→LAC, and the three-letter-convention franchises the crosswalk uses).
   A test was written for this **before** the fix (see Test-first evidence).

A third live finding, not contradicted by design.md but not mentioned by it either:
**`db_playerids.csv` is R-generated, so its missing-value sentinel is the literal string `"NA"`**
(7,610 rows have `fantasypros_id = "NA"`, 6,096 have `sleeper_id = "NA"`). Treating those as values
would index thousands of unrelated players under the key `"NA"`. `cell()` normalizes them to null.

### Decisions worth a reviewer's attention

1. **`match.ts` never fetches the Sleeper dump; it takes it as a parameter.** T2 owns the Sleeper
   client, and T3 is marked `[P]` against it. `SleeperPlayerRecord` declares only the ~8 fields FR-4
   reads, all optional — TypeScript's structural typing means T2's richer record satisfies it with no
   shared file and no import between the two tasks. If T2's type later wants to be the canonical one,
   swapping this alias is a one-line change.
2. **A `snapshots/store.ts` was added beyond design.md's file list.** AC-29's "fetch once, hold for
   the attached draft's lifetime, never re-fetch" is lifecycle state; `predraftCheck.ts` is a pure
   projection of an already-loaded bundle. Merging them would have made the pre-draft check
   untestable without a network double. Both files stay inside T3's own directory.
3. **AC-26's ordering rule, made concrete.** "Falls back to ECR order within their position" is
   implemented literally: within a position, players carrying an ADP are ranked by ADP; a player with
   no ADP entry takes their *ECR-within-position* rank; ties break on ECR (🔶 AS-8). This matters more
   than it sounds — FFC publishes ~230 players against ECR's 839, so **608 of the real matched board
   has no ADP number**. Appending them all behind every ADP-carrying player would have buried a
   genuinely high-ECR player (a TE19 with no FFC row) below deep bench fodder. `assignSamplingRanks`
   is exported and unit-tested standalone so T7's sampler can rely on the rule rather than re-deriving it.
4. **Ambiguous names are left unmatched, never guessed.** `resolveByName` narrows by position, then
   team, then `active`, and returns nothing if two candidates still survive. A wrong join puts a live
   player's rank on someone else's row, which is strictly worse than an entry on AC-25's unmatched
   list. Real case this protects: two Josh Allens (QB/BUF and LB/JAX) share a normalized name.
   Relatedly, a Sleeper player already claimed by an earlier ECR row cannot be claimed again.
5. **The name fallback tries the crosswalk's `merge_name` before the feed's own spelling.** When the
   crosswalk has a row but no usable `sleeper_id`, its curated name is the better probe. This is also
   why `normalizeName` mirrors `merge_name`'s convention (lowercase, punctuation and generational
   suffixes stripped) and then additionally strips whitespace, so it meets Sleeper's
   `search_full_name` ("jahmyrgibbs") from either direction.
6. **A crosswalk failure is fatal to the load; an ECR or ADP failure is not.** AC-28 requires board
   sync, rosters and the pick feed to keep running with no ECR, so `SnapshotStore` records
   `ecrError`/`adpError` and returns a bundle. The crosswalk has no such carve-out — a name-only
   board would mis-join players silently — so `loadCrosswalk` falls back to a *stale local copy*
   before it gives up, and only a total absence throws.
7. **AC-27's scoring label is an input, not a fetch.** design.md tells T3 to "reuse the FR-11/mock
   scoring-label logic from T2's context", which did not exist yet. `buildPreDraftCheck` takes
   `league: {teamCount, scoringType, rounds}` and compares against `HALF_PPR_SCORING_TYPES`. T2/T10
   supply `metadata.scoring_type` verbatim. No re-work needed when T2 lands; the seam is the argument.
8. **`test/msw/snapshotHandlers.ts`, not the shared `test/msw/handlers.ts`.** design.md §T1 assigned
   one shared handlers file, T1 did not create it, and T2 was writing concurrently. Splitting by source
   avoided a write conflict on a shared file. (T2 independently chose `sleeperHandlers.ts`, so the two
   compose cleanly — a later task can spread both arrays into one `setupServer`.)
9. **Unknown positions are dropped, malformed payloads throw.** A new position appearing in
   `ecrData` must not take the whole ranking offline; a structurally invalid embed must not silently
   yield an empty board. The latter becomes AC-28's visible "no rankings loaded" state.
10. **`data/cache/` is the crosswalk cache location** (already gitignored by T1). No `data/` directory
    is committed; tests write to `mkdtemp` directories and clean up after themselves.

## Test-first evidence

Every test file was written and confirmed failing before its implementation existed.

- failing: `npm test` →
  ```
   ❯ |server| src/snapshots/crosswalk.test.ts (0 test)
   ❯ |server| src/snapshots/store.test.ts (0 test)
   ❯ |server| src/snapshots/fantasypros.test.ts (0 test)
   ❯ |server| src/snapshots/match.test.ts (0 test)
   ❯ |server| src/snapshots/predraftCheck.test.ts (0 test)
   ❯ |server| src/snapshots/ffc.test.ts (0 test)

  Error: Failed to load url ../../src/snapshots/crosswalk (resolved id: ../../src/snapshots/crosswalk)
  in /Users/willyu/willy-ff/packages/server/test/msw/snapshotHandlers.ts. Does the file exist?

   Test Files  6 failed | 4 passed (10)
        Tests  24 passed (24)          <- T1's 24, untouched
  ```
- passing: `npx vitest run --project server` → the six T3 suites green, **74 tests**
  (`fantasypros` 10, `ffc` 12, `crosswalk` 9, `match` 23, `predraftCheck` 14, `store` 6).

Second, separate red→green cycle for the `JAC`/`JAX` defect found during live verification —
test first, then fix:

- failing: `npx vitest run --project server src/snapshots/match.test.ts` →
  ```
    × normalizeTeam > reconciles the abbreviations the feeds spell differently
    × normalizeTeam > leaves an already-canonical code and a free agent alone
    × matchSnapshots — DST by team abbreviation (AC-25) > matches a DST across a
      team-abbreviation spelling difference between feeds
  TypeError: normalizeTeam is not a function
  AssertionError: expected undefined to match object { sleeperPlayerId: 'JAX', …(1) }
   Test Files  1 failed (1)
        Tests  3 failed | 20 passed (23)
  ```
- passing: same command → `Tests 23 passed (23)`. Live re-run then reported
  `matchedByTeamDefense: 32` (was 31) and `unmatchedEcr: 2` (was 3).

Two of my own assertions were corrected during the run; in both cases the **test** was wrong and the
implementation was right, and neither was a pre-existing test:

- `predraftCheck.test.ts` "keeps matched-but-no-ADP players on a separate list" originally expected
  only Chig Okonkwo on `playersMissingAdp`. Roman Wilson (WR128) legitimately belongs there too —
  FFC's ~230-row board carries neither. Assertion widened to both, with a comment saying why.
- `ffc.test.ts` "falls back to the nearest supported pool" asserted `selectAdpPool(13) === 12`, which
  contradicts the ties-toward-larger rule the same suite asserts three lines later. Corrected to 14,
  and 13 moved into the tie test alongside 9 and 11.

- commits: none — per the orchestrator's instruction for this spawn the developer does not commit.
  Test-first ordering is recorded here instead of by commit order.

Coverage of §T3's five named done-when cases, each asserted individually:

| done-when case | test |
|---|---|
| matched set via ID | `match.test.ts` → "joins ECR rows to Sleeper ids through the crosswalk fantasypros_id" (7 players, all methods asserted) |
| name-fallback matches | "matches Roman Wilson by name, because the crosswalk carries a stale fantasypros_id for him"; plus "falls back to the name path when the crosswalk sleeper_id is absent from the live dump" |
| DST by team code | "matches the Houston DST row to Sleeper's team-defense pseudo-player, not via the crosswalk"; plus the JAC/JAX alias test |
| unmatched → pre-draft check list | `match.test.ts` "lists an ECR row that resolves through neither path…" / "…an ADP row…"; `predraftCheck.test.ts` "lists every unmatched entry from both sources" |
| ADP-missing → ECR order | `match.test.ts` "orders the position group by ADP, slotting the ADP-less player in by ECR order"; plus `assignSamplingRanks` unit tests |

The remaining FR-4 ACs are covered too: AC-22 (3 tests incl. a config-override test proving the
threshold is not an inline 24), AC-23 (4), AC-24 (9), AC-27 (3), AC-28 (4), AC-29 (3).

### Fixture provenance

Fixtures are trimmed slices of live responses, chosen so each exercises one path:

| player | why it is in the fixture |
|---|---|
| Jahmyr Gibbs (RB1) | the design's verified join: FantasyPros 22968 → crosswalk → Sleeper 9221 |
| Ja'Marr Chase, Josh Allen, Brock Bowers, Brandon Aubrey (K) | crosswalk-id path across WR/QB/TE/K |
| Trey McBride (TE2) | ADP order (38.2) inverts ECR order (Bowers 17 < McBride 24) — makes the sampling-order test meaningful rather than tautological |
| Chig Okonkwo (TE19) | matched by ID, genuinely absent from FFC's board → AC-26's missing-ADP case |
| Houston Texans (DST1) | team-abbreviation path; also the FFC `"Houston Defense"`/`DEF` spelling |
| Roman Wilson (WR128) | the crosswalk's `fantasypros_id` (26160) has drifted from the feed's (28896) → real name-fallback |
| Chip Trayanum (RB184) | real crosswalk row whose `sleeper_id` is `"NA"`, absent from the dump → real unmatched case |
| Squirrel White (crosswalk only) | a real row with `fantasypros_id = "NA"`, proving the sentinel never becomes an index key |
| Germie Bernard (FFC only) | the one deliberately synthetic choice: a real FFC row whose Sleeper record is withheld from the slice, so the ADP source has its own unmatched entry |

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. All six T3 test files are new
  (`snapshots/{fantasypros,ffc,crosswalk,match,predraftCheck,store}.test.ts`), as are the four
  fixtures and `test/msw/snapshotHandlers.ts`. T1's four suites and T2's files are untouched.

## Commands

Run from repo root.

Final run, taken once T2 had also landed in the shared tree:

- test: `npm test` → **exit 0** — `Test Files 15 passed (15) / Tests 188 passed (188)`. The six T3
  suites contribute 74. `npx vitest run --project server src/snapshots` → 6 files, 74 tests, exit 0.
- lint: `npm run lint` → **exit 0**. `npx eslint packages/server/src/snapshots packages/server/test/msw/snapshotHandlers.ts` → exit 0, clean.
- typecheck: `npm run typecheck` → **exit 0**, all three `tsc --noEmit` invocations clean. Zero
  diagnostics in any `snapshots/**` file at every point during development, including while T2's
  in-flight modules were still producing their own.

(Mid-task, before T2 finished, `npm test`/`npm run typecheck` reported failures confined to
`packages/server/src/sleeper/attach.test.ts` and `sync.test.ts` — T2's tests against modules T2 had
not yet written. No T3 file was implicated, and none of T2's files were touched.)

Additional verification beyond the suite: the real modules were driven against the four live
endpoints (throwaway script, not committed). Output — 837/839 ECR rows matched, 0 unmatched ADP
rows, an 11-team league correctly substituting the 12-team FFC pool with the AC-24 warning firing,
a 27.6 h-old ADP snapshot correctly firing the AC-22 staleness warning, and a `"ppr"` scoring label
correctly firing the AC-27 mismatch warning.
