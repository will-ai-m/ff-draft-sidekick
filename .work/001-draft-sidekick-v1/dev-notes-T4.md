# Dev notes — 001-draft-sidekick-v1 (T4: league settings, roster panel, need vectors)

Scope: design.md §T4 only — FR-5 (AC-30, AC-31, AC-32, AC-33), plus the `roster` half of AC-66's
timestamping that T2's dev notes handed to this task. Nothing from T5–T15 was implemented. T9's
area (`src/gamelogs/*`, `scripts/prep-nflverse-data.ts`, `test/msw/nflverseHandlers.ts`,
`test/fixtures/player_stats-*`/`pbp-*`) was not touched — a sibling developer worked it
concurrently in this tree.

## Live re-verification, before any code

design.md's Approach and §T2 both flag the scoring-settings source as "verify, don't assume", and
T2's dev notes hand the granular-dict question to T4. Checked live against `api.sleeper.app` on
2026-08-22 (same league T2 used, `/v1/draft/289646328508579840` → `league_id 289646328504385536`):

| Question | Answer found | Where it landed |
|---|---|---|
| Does `/v1/league/<id>` really carry a granular per-stat dict? | Yes — `scoring_settings` with **81 keys, all numeric** (`pass_yd, pass_td, pass_int, rush_yd, rec, rec_yd, fum_lost, st_td, pts_allow_0, …`). | `sleeperLeagueSchema` + `getLeague` (`client.ts`); `resolveLeagueSettings` prefers it always. |
| Does the coarse `metadata.scoring_type` label predict the granular values? | **No.** That league's label is `"ppr"` but it pays `pass_td: 6` and `pass_int: -2`, where the conventional table pays 4 and -1. | The reason the league dict wins over the label wherever one exists; encoded as the 12-team fixture's deliberate label/dict divergence, and asserted in a test. |
| Are dict values clean decimals? | No — float32 artifacts: `pass_yd: 0.03999999910593033`, `rec_yd: 0.10000000149011612`. | Carried verbatim into the fixture so no downstream consumer (T9's scorer) may compare exactly; the test uses `toBeCloseTo`. |
| Are all 81 keys always present? | No — `fum_rec_td` and `bonus_rec_te` are absent from that league entirely. | Documented rule: **a key absent from a dict scores zero**, never "fill in a default". |
| Does the same draft confirm T2's "absent `slots_*` key means zero"? | Yes — that live 12-team draft carries `slots_qb/rb/wr/te/flex/def/bn` and **no `slots_k`**. | The new 12-team fixture omits `slots_k` too, so AC-32 is exercised against a shape a real league actually has. |

## Changes

**`packages/shared/src/config/scoringDefaults.ts`** (new) — the named standard scoring tables
design.md's Approach calls for, keyed by Sleeper's coarse `metadata.scoring_type`. T1 (decision #8)
and T2 (decision #7) both deliberately deferred this file to "the task that consumes it"; T4 is that
task, because AC-30 puts scoring settings in FR-5's read-at-attach set. Keys are Sleeper's own
per-stat names, so a fallback table is **shape-identical** to a real league's dict and FR-11's
scorer needs one code path, not two. `scoringFormatFromLabel` matches by content rather than an
exact-string allowlist, because Sleeper qualifies the label for non-redraft formats
(`dynasty_half_ppr`, `rookie_ppr`, `2qb_ppr`); `half` is tested before `ppr` since every half-PPR
spelling contains "ppr".

**`packages/server/src/roster/leagueSettings.ts`** (new) — AC-30. Team count, rounds and slot
structure come from the draft object's own `settings` (T2's `deriveSlotConfig`, one code path for
mocks and real leagues); scoring comes from `/v1/league/<id>`'s granular dict for a real league and
from the named table for a mock, which has no league to read one from. Every resolution reports
which of the two it was (`scoring.source`) and why (`scoring.note`), so the pre-draft check and the
game-log scorer can show the user what their numbers are actually computed from.

**`packages/server/src/roster/needvectors.ts`** (new) — AC-31/AC-32/AC-33. `computeRosterPanel`
turns (slots, pick feed, team) into a `RosterPanelData`; `RosterPanelTracker` keeps the user's panel
in step with the poll loop and records the `roster` view's pick-reflection lag. The fill model is
T1's `computeUnfilledStartingSlots` — imported, not reimplemented — so the panel and the need vector
can never disagree about what "filled" means, and `computeNeedVector` is likewise T1's.

**`packages/server/test/fixtures/sleeper-12team-3wr-draft.json`** (new) — the non-default-settings
fixture §T4 asks for: **12 teams, 3 WR, 2 FLEX, no K slot, 5 bench**, 48 picks over 4 snake rounds,
plus a league object carrying a granular `scoring_settings` slice. Deliberate details, each earning
a test:

- The label says `half_ppr` while the dict pays `pass_td: 6` and `bonus_rec_te: 0.5` — reading the
  label instead of the dict would score every game wrong, exactly as the live league proves.
- Round 2 / slot 9's pick (pick 16) was **traded to slot 5, the user's seat**, so the roster panel
  has to count a player the user drafted from another board column — and slot 9 has to come up one
  player lighter.
- `slot_to_roster_id` is again not the identity map; `slots_k` is absent rather than zero; two
  owners never named their team.
- Player ids, names, teams and jersey numbers come from the live Sleeper player dump. Positions are
  assigned from per-round budgets rather than Sleeper's `search_rank` order, which is a relevance
  rank, not ADP, and produced an 11-QB first four rounds when followed literally.

**Small additive edits to existing files**, each named here because they touch another task's code:

- `packages/server/src/sleeper/client.ts` — added `sleeperLeagueSchema`, `SleeperLeague` and
  `getLeague()`. T2 left this endpoint unwritten on purpose (its own endpoint list didn't include
  it, and it had no consumer); AC-30's scoring half is that consumer.
- `packages/server/src/observability.ts` — added `lastPollResponseAt()`. T2's `onNewPicks` hands a
  listener the new `PickFeedEntry[]` but not the poll response's timestamp, and the roster view's
  lag has to be measured from that same response to mean anything (AC-31/AC-66). Recording the
  panel rebuild against the last poll-response stamp is exact here, because the rebuild happens
  synchronously inside that poll's own listener call.
- `packages/shared/src/types/roster.ts` — added `filledFlexSlots` to `RosterPanelData`. AC-31 asks
  for *filled starting slots*, and a FLEX slot filled by positional surplus is one; leaving it to be
  re-derived in the UI from `slots.FLEX - unfilledStartingSlots.flex` would put roster math in a
  React component.
- `packages/shared/src/index.ts` — one export line for `scoringDefaults`.
- `packages/server/test/msw/sleeperHandlers.ts` — a `/v1/league/:leagueId` handler, an optional
  `league` field on `SleeperFixtureBundle`, and a `failLeague` scenario option. Registered *after*
  the existing `/v1/league/:leagueId/users` handler so the more specific route still wins.

### Decisions worth a reviewer's attention

1. **Two modules, not one.** design.md's file plan lists a single `roster/needvectors.ts` for T4.
   Split into `leagueSettings.ts` (reads the API, resolves scoring — async, network-touching) and
   `needvectors.ts` (pure roster math + the tracker). The two have different dependencies and
   different consumers (T9 imports the scoring half, T5/T6 the panel half); one file would have
   made both harder to read and forced the pure half to carry a client dependency.
2. **A failed league fetch degrades, it never throws.** `resolveLeagueSettings` catches and falls
   back to the named table with the failure written into `scoring.note`. Attaching to a draft must
   not fail because an optional dict was unreachable — AC-1's ingest budget and AC-7's "say which
   failure" both belong to the draft object, not to scoring.
3. **An unrecognised scoring label is flagged, not guessed.** `source: 'unrecognised-scoring-type'`
   plus a note naming the label, and the tables fall back to `FALLBACK_SCORING_FORMAT` (half-PPR,
   the one format v1 ships per PRD §10). Returning an empty dict instead would silently zero every
   game log; claiming a format we didn't recognise would be worse. Flagging this as a judgment call:
   the ACs don't legislate this case.
4. **The panel is derived, never accumulated.** Panels are computed from the current pick feed on
   read and memoised against `(boardVersion, userTeamId)`. That second key matters: resolving the
   user's seat by hand (AC-5's `setUserSlot`) changes which seat is "mine" **without** bumping
   `boardVersion`, so a version-only cache would keep serving the wrong panel. What happens eagerly
   is only the *measurement* — the panel is rebuilt inside the new-pick listener so the recorded
   lag is real, not an artifact of when something happened to read it.
5. **`computeRosterPanel` is team-agnostic on purpose.** FR-5 needs the user's panel; FR-6 (T5)
   needs one per opponent in the window, from the same board. Parameterising by `teamId` is that
   requirement, not speculative generality — and `RosterPanelTracker.panelFor(teamId)` is the seam
   T5 should use rather than re-deriving rosters.
6. **A pick whose position the API didn't report is counted as drafted and benched**, and an
   optional `resolvePosition` (player-dump backed, wired by T10) can place it properly. Dropping it
   would silently under-report the roster; assuming a position would be worse.
7. **No new `parameters.ts` keys.** T4 needed no new tunable: slot counts and scoring come from the
   API, `flexEligiblePositions` and `pickReflectionLatencyMs` already exist. The scoring tables are
   data, not tuning knobs, and live in `scoringDefaults.ts` where design.md put them.
8. **K/DST are filled, displayed and benched like any other slot but weigh zero.** A surplus K
   cannot consume a FLEX slot (K is not in `flexEligiblePositions`), and a roster whose only open
   slots are K/DST returns the `NO_NEED_SIGNAL` sentinel while still showing those slots open —
   AC-33 and 🔶 AS-7 are two different concerns and the tests assert them separately.

## Test-first evidence

All three test files were written, and confirmed failing, before any implementation file existed.

- failing: `npm test` →
  ```
   FAIL |server|  src/roster/leagueSettings.test.ts [ packages/server/src/roster/leagueSettings.test.ts ]
  Error: Failed to load url ./leagueSettings (resolved id: ./leagueSettings) ... Does the file exist?
   FAIL |server|  src/roster/needvectors.test.ts   → Failed to load url ./needvectors
   FAIL |shared|  src/config/scoringDefaults.test.ts → Failed to load url ./scoringDefaults

   Test Files  4 failed | 15 passed (19)
        Tests  190 passed (190)
  exit: 1
  ```
  (The fourth failure in that run, `src/gamelogs/nflverse.test.ts`, was the sibling T9 developer's
  in-flight file, not T4's.)
- passing: `npx vitest run --project shared --project server src/roster src/config` →
  `Test Files  5 passed (5) / Tests  48 passed (48)`, exit 0 (T4 contributes 36). Full root
  `npm test`: `Tests  226 passed (226)` with the only failing suites being T9's two in-flight files
  — see Commands below.
- commits: none — per this spawn's instruction the developer does not run git; the orchestrator
  commits. Test-first ordering is recorded here instead of by commit order.

No test needed editing after the first green run: every expected value was hand-computed from the
fixtures before the implementation existed, and the implementation matched on the first run.

Coverage against §T4's "done when", one assertion apiece:

| Required | Test |
|---|---|
| default-fixture league → correct filled/unfilled/bench | `needvectors.test.ts`: "reports filled, unfilled and bench purely from the settings and the pick feed" |
| default-fixture league → correct need vector | "splits the unfilled FLEX slot across the eligible positions in the need vector" |
| 3-WR/12-team fixture → all four, same code path | "honours 12 teams / 3 WR / 2 FLEX / no K slot with no special-casing" |
| no branch keyed on the default shape | "handles a league shape the defaults never anticipated (2 QB, no FLEX, no K/DST, no bench)" and "reads a non-standard FLEX eligibility set from config rather than assuming RB/WR/TE" |
| AC-30 settings read from the API | `leagueSettings.test.ts`: "reads team count, slot structure and rounds…", "reads a non-default league… through the same path" |
| AC-30 scoring read from the API | "prefers the league's own granular per-stat dict over its coarse label" (+ 4 fallback cases) |
| AC-31 within `pickReflectionLatencyMs` of the user's pick | "reflects the user's own pick from the poll that carried it, and records the lag" — asserts the panel changed and the recorded `roster` lag is under the config value (not a literal 3000) |
| AC-33 K/DST tracked, zero-weight | "shows unfilled K and DST slots while giving them zero need weight", "reports no need signal when only K/DST slots are still open, yet still shows them", "fills a K/DST slot when one is drafted…" |
| traded pick lands on the acquiring roster | "counts a pick acquired by trade on the acquiring roster, not the original seat"; live-path variant "picks up a pick that arrived by trade on the user's roster" |
| AC-5 interaction | "has no panel until the user's seat is known, and produces one the moment it is" |

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. All three test files
  (`packages/shared/src/config/scoringDefaults.test.ts`,
  `packages/server/src/roster/{leagueSettings,needvectors}.test.ts`) are new in T4.
  `test/msw/sleeperHandlers.ts` (test infrastructure, not a test) gained a league handler and a
  `failLeague` option, both additive — every existing T2 test still passes untouched.

## Commands

Run from repo root.

T4 was developed alongside a sibling developer implementing T9 in the same working tree, so the
root-level gates were red on that task's in-flight files for part of this task's life. Results below
are the last runs, after T9's implementation landed.

- test: `npm test` → **exit 0** — 22 files, 269 tests passed (T4 contributes 36).
- lint: `npm run lint` → **exit 0**.
- typecheck: `npm run typecheck` → **exit 0** — all three `tsc --noEmit` invocations clean.

Scoped verification of T4's own work, for a reviewer who wants it isolated:
`npx vitest run --project shared --project server src/roster src/config` → 48 tests passed;
`npx eslint` and `npx prettier --check` over every file T4 touched → exit 0.

## Left for downstream tasks (seams T4 exposes, deliberately unwired here)

- **T10** calls `resolveLeagueSettings(session.sync.state.meta, { client, timeoutMs })` once per
  attach and constructs `new RosterPanelTracker({ sync, flexEligiblePositions: config.flexEligiblePositions,
  observability, resolvePosition })`, then `start()`s it — the tracker's `start()`/`stop()` should
  share the session lifetime the way `BoardSync`'s does. `tracker.userPanel()` is
  `AppStateSnapshot.userRoster.data` (null while AC-5's seat choice is outstanding) and
  `tracker.boardVersion` is the version to stamp its `Insight` with. `LeagueSettings` also supplies
  T3's `PreDraftCheckInput.league` summary verbatim (`teamCount`, `rounds`, and
  `scoring.scoringType` — coalesce the null for a draft that reports no label at all).
- **T5** should call `tracker.panelFor(teamId)` per team in the window rather than re-deriving
  opponent rosters; `panel.needVector` is already the `NO_NEED_SIGNAL`-or-weights union FR-6 and
  FR-8 branch on, and `panel.unfilledStartingSlots` is AC-35's count-shaped view.
- **T9** imports `scoring.settings` from `LeagueSettings` for AC-64 — it is a plain
  `Record<string, number>` in Sleeper's own key vocabulary whether it came from the league or the
  fallback table, so the scorer needs no branch. Remember that an absent key means zero, and that
  values carry float32 artifacts.
- **T13** renders `filledStartingSlots` / `filledFlexSlots` / `unfilledStartingSlots` / `benchCount`
  against `benchSlots`; K and DST appear in `filledStartingSlots`/`unfilledStartingSlots.dedicated`
  like any other position (AC-33).
