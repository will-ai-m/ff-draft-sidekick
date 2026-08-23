---
gate: spec_review
verdict: pass
by: spec-reviewer
at: "2026-08-23T09:02:20Z"
---

## Evidence

Re-run of the spec_review gate after repair commit `5e25747` ("Repair (spec_review pass 1)").
Diff under review: `46000ab..HEAD` (`5e25747`), 165 files, 46 756 insertions / 9 deletions.
Working tree carries no uncommitted code (`git status --porcelain` → `M .work/…/status.yaml` only).

This pass re-derives **only** the two blocking issues from the prior verdict plus a regression sweep
over what the repair touched. The prior verdict's other rulings — every other AC met, five accepted
deviations, the recorded spec defects — stand unchanged; the repair disturbs none of them (see the
regression bullets below).

### Gate commands (re-run by me; dev-notes claims not relied on)

- `npm test` → exit 0 — `Test Files 40 passed (40) / Tests 655 passed (655)`, 8.33 s. (Prior pass:
  634. The +21 are the repair's new cases; no test count went down anywhere.)
- `npm run lint` → exit 0 (`eslint .`, no output).
- `npm run typecheck` → exit 0 (all three `tsc --noEmit` projects: shared, server, web).
- `npx vitest run --project server src/orchestrator.test.ts --reporter=verbose` → exit 0, 23 passed;
  all four `AC-50 — the K/DST filter…` and all four `AC-27 — the scoring warning…` cases green.
- `npx vitest run --project server src/snapshots/match.test.ts src/snapshots/predraftCheck.test.ts
  src/recommend/candidates.test.ts --reporter=verbose` → exit 0; the four
  `matchSnapshots — ADP-only rows (AC-50's K/DST fallback)` cases and the eleven
  `scoring format (AC-27)` cases green.
- `grep -rnE "it\.only|describe\.only|test\.only|it\.skip|describe\.skip|test\.skip|xit\(|\.todo\("`
  over every `*.test.ts(x)` → exit 1, no matches. Nothing focused, skipped, or stubbed.

### Blocking issue 1 — AC-50's ADP-order K/DST fallback: **resolved**

AC-50: "…the K/DST filter shows positional ECR order without survival math, **falling back to ADP
order when the snapshot carries no K/DST rankings**."

- **The supply now exists in the real pipeline.** `packages/server/src/snapshots/match.ts:347-368`
  adds an ADP-only pass: `resolveAdpEntry` (`:228`) now returns a `Resolution` instead of a bare id,
  and every ADP entry that reached a Sleeper player which no ECR row took is emitted as an
  `AdpOnlyPlayer` (`ecrRank: null`, `fantasyProsId: null`, `matchedBy` recorded). Ordered by ADP
  within position at `:385-393`. Verified by reading the hunk, not the note.
- **The ECR board keeps its guarantee.** `packages/server/src/snapshots/types.ts:170`
  `EcrMatchedPlayer = MatchedPlayer & { ecrRank: number; fantasyProsId: number }` is what
  `MatchResult.players` and `byPlayerId` are typed as (`types.ts:206-207`); the widening of
  `MatchedPlayer.ecrRank` to `number | null` is absorbed by the two aliases.
  `grep -rn "MatchedPlayer" packages` shows no module consumes the bare interface as a value type —
  FR-6/FR-7/FR-8 declare structural `{ecrRank: number}` inputs and still receive `EcrMatchedPlayer`.
- **Wired for K/DST only.** `orchestrator.ts:418-422` builds `kdstAdpFallback` =
  `bundle.matching.adpOnlyPlayers.filter(p => !isSkillPosition(p.position) && !rankedPositions.has(p.position))`,
  where `rankedPositions` comes from the ECR board. `rowsByPosition` (`:707-724`) is the only
  consumer (`grep -n "kdstAdpFallback" orchestrator.ts` → declaration `:109`, assignment `:421,430`,
  read `:714` — nowhere else). Asymmetry is per position, so an ECR snapshot with K but no DST keeps
  ECR order for K.
- **Never in the ECR list, the simulation universe, or the highlight.** `recompute()`
  (`orchestrator.ts:579-590,604-618`) destructures `players` from `active` — which is
  `bundle.matching.players`, `EcrMatchedPlayer[]` — and hands exactly that to `computeOpponentPanel`,
  `candidateSimulationIds`, `simulateSurvival`, and `computeCandidateList`/`seatUnresolvedList`.
  Sampling ranks (AC-26) are still computed from `staged` alone (`match.ts:372-378`), so the ADP-only
  rows' own `samplingRank` is inert.
- **Covering test drives the real pipeline, not hand-built rows.**
  `orchestrator.test.ts:239-273` (`AC-50 — the K/DST filter when the ECR snapshot ranks no K or DST`)
  goes through `standUp` → `createHarness` → real `Orchestrator.attach` → `SnapshotStore.load` →
  MSW-served feeds → `matchSnapshots`. I verified the fixtures make the scenario real:
  `ecrData-slice.json` genuinely carries 1 DST (Houston, ECR 184) and 1 K (Aubrey, ECR 211), both
  stripped by `skillOnlyEcrData()`; `ffc-slice.json` carries Houston Defense at ADP 100.5 and Aubrey
  at 130, and the test appends SF at 90.2 plus an `SF` Sleeper record. The assertion
  `rowsByPosition.DST → ['SF','HOU']` is discriminating: 90.2 < 100.5 inverts the name order
  ("Houston…" < "San Francisco…"), so a name sort cannot produce it. `ecrRank` comes back
  `[null, null]`, `adp` `[90.2, 100.5]`, `survival` all null (🔶 AS-7), and `rowsByPosition.K` →
  `['11533']`.
- **Sensitivity is established by an internal control, not by trusting the note.** The sibling case
  `leaves the filter empty when neither feed carries K or DST` runs the *same* stripped ECR feed with
  a stripped ADP feed and gets `DST: []`, `K: []`. Same ECR input, differing only in the ADP feed →
  `['SF','HOU']` vs `[]`. That is exactly the pre-repair behaviour the blocking issue described, so
  the new assertion could not have passed against the old code.
- **Guards on the surrounding ACs.** `keeps the ADP-only rows out of the ECR-ordered list, the
  highlight and the simulation` asserts `list.rows` holds no K/DST, `highlightPlayerId` is none of
  `SF`/`HOU`/`11533`, and every shown row has a non-null `ecrRank` (AC-42/AC-47/AC-49, 🔶 AS-8
  intact). `still ranks K and DST by ECR when the snapshot does carry them` pins the unchanged path
  (`DST → ['HOU']`, `ecrRank 184`). At the unit level, `match.test.ts:272-352` adds
  `keeps the ADP-only rows out of the ECR-ordered board and its id index (AS-8)` (`byPlayerId` has
  neither id; Houston is not reported unmatched, so AC-25's meaning is unchanged) and
  `emits nothing extra when the ECR snapshot ranks the K and DST itself` (`adpOnlyPlayers` length 0
  on the full fixture — no double emission).
- **AC-23's message no longer promises what the data cannot keep.** `predraftCheck.ts:153-166` counts
  the ADP-only K/DST rows and either names the fallback with a count or states the filter will be
  empty. Two new tests pin both branches (`promises the ADP fallback only when the ADP snapshot can
  actually supply it (AC-50)`, `says the filter will be empty when the ADP snapshot has no K/DST
  either`). AC-23's own requirement — warn when K/DST rows are absent — is unchanged and still
  covered by the original assertion.
- **No stale-shape hazard from the new `MatchResult` field.** `snapshots/store.ts:114` computes
  `matching: matchSnapshots({…})` fresh inside `load()`; the disk cache holds raw payloads, never a
  serialized `MatchResult`, so `adpOnlyPlayers` can never be missing at runtime.

### Blocking issue 2 — AC-27 compares the granular settings: **resolved**

AC-27: "When the attached league's **scoring settings** differ from half-PPR, the pre-draft check
warns that rankings are for a different scoring format."

- **The dict now reaches the check.** `predraftCheck.ts:83-93` adds optional
  `scoring?: { source: ScoringSource; settings: ScoringSettings }` to `LeagueSummary`;
  `orchestrator.ts:465-469` passes `league.scoring.source` / `.settings` — the dict FR-5 already read
  at attach and AC-64 already consumes, so no new fetch.
- **The comparison is per-stat.** `halfPprDivergences` (`predraftCheck.ts:53-65`) walks
  `HALF_PPR_COMPARED_KEYS` = the 13 keys of `SCORING_DEFAULTS.half_ppr` plus `bonus_rec_te` /
  `bonus_rec_rb` / `bonus_rec_wr`, treats an absent key as 0, and compares at 1e-9. The warning
  (`:189-198`) names the divergent keys (`pass_td 6 vs 4`) and keeps the label in the text.
- **The label branch is now the mock-only fallback.** `:187` takes the settings path only when
  `league.scoring?.source === 'league-settings'`; otherwise `:199` falls through to
  `scoringFormatFromLabel`. `resolveScoring` (`roster/leagueSettings.ts:95-102,150`) sets
  `'league-settings'` only when `/v1/league/<id>` actually returned a dict, so a mock
  (`league_id: null`) and the named fallback tables take the label branch, as the criterion's intent
  requires — a fallback table would only ever match itself.
- **The end-to-end tests isolate the settings as the sole variable.** All four
  `AC-27 — the scoring warning reads the league's settings, not its label` cases in
  `orchestrator.test.ts:275-337` attach to the same fixture, whose draft metadata I confirmed is
  labelled `scoring_type: "half_ppr"` (`sleeper-real-league-draft.json`; its `league` key is absent
  by default, which is why the other suites still take the label path). Only the injected
  `scoring_settings` dict differs: `rec: 1` → warns naming `rec`; `pass_td: 6, pass_int: -2` → warns
  naming both; `bonus_rec_te: 0.5` → warns naming it; the plain half-PPR dict → silent. Under the old
  label-only check every one of these would have been silent — that is precisely the false negative
  the blocking issue named, and it is now caught.
- **Both directions, and the edges, at unit level.** `predraftCheck.test.ts:189-281` adds
  `lets the settings outrank the label in both directions` (label `ppr`, dict genuinely half-PPR → no
  warning), `treats a key absent from the dict as zero, never as a match` (`rec 0 vs 0.5`),
  `ignores the keys half-PPR rankings do not depend on` (`fgm_40_49`, `idp_sack`, `def_st_td` → no
  warning), `ignores a fallback scoring table, which would only ever match itself`, and
  `falls back to the coarse label when there is no dict to read (a mock)`.
- **The lesser defect the prior verdict flagged is fixed.** `HALF_PPR_SCORING_TYPES` /
  `isHalfPprScoring` are removed; `grep -rn "isHalfPprScoring\|HALF_PPR_SCORING_TYPES" packages` → no
  matches. The label branch now uses shared `scoringFormatFromLabel`, so `dynasty_half_ppr` resolves
  to half-PPR in both places (pinned by an assertion in the mock-fallback test). The `'(none)'` mock
  label still warns, which is the honest reading and unchanged.
- **The dict does not ride the wire.** `predraftCheck.ts:224-227` projects `leagueSummary` to
  `{teamCount, scoringType, rounds}`; `echoes the league summary read from the draft API, without the
  scoring dict` now passes a league that *does* carry a dict and asserts the trio comes back — a
  strictly stronger assertion than the one it replaced. The shared `PreDraftCheckData` type is
  untouched (no `packages/shared` file appears in the repair diff).

### Regression sweep over what the repair touched

- **AC-25** — `unmatched` / `counts` logic in `match.ts` is unchanged (`counts.` sites at
  `:304,316,322-324` only). An ADP entry that resolves to a Sleeper player was never "unmatched"
  before and is not now; one that resolves to nothing still increments `unmatchedAdp`.
- **AC-26** — sampling ranks still come from `staged` (ECR rows) alone, `match.ts:372-378`.
- **AC-42 / AC-47 / AC-49 / AS-8** — verified by code path (`recompute` reads ECR-only `players`) and
  by the dedicated orchestrator guard test.
- **AC-53** — the filter still drops drafted players by board membership
  (`candidates.ts:189-192`, `isDrafted`), which is keyed on Sleeper id, so a drafted ADP-only kicker
  is removed from the K filter too.
- **AC-64** — `orchestrator.ts`'s game-log scoring read of `league.scoring.settings` is outside every
  hunk in the repair diff; the dict is now *also* passed to the pre-draft check, not moved.
- **Web** — no `packages/web` file is in the diff, and `CandidateList.tsx:176` already renders
  `row.ecrRank ?? DASH`, so a fallback row has an honest blank rather than a fabricated rank.
- **`claimed` mutation** — the ADP-only loop adds to `claimed` (`match.ts:354`) after the ECR pass has
  finished; `claimed`'s only other readers are inside `resolveEcrEntry` (`:168-221`), so nothing
  observes the late additions.

### Scope sweep

No creep. The repair commit touches exactly 12 files: three `.work/` pipeline artifacts
(`dev-notes-repairs.md`, the prior `review-spec.md`, `status.yaml`) and nine under `packages/server`,
each traceable to one of the two blocking issues — `snapshots/types.ts`, `snapshots/match.ts`,
`snapshots/predraftCheck.ts`, `orchestrator.ts` and their four test files, plus
`test/msw/snapshotHandlers.ts`. I read every hunk in all nine. No unrelated cleanup, no drive-by
refactor, no new product surface. Nothing in the diff implements a declared non-goal: detecting and
*warning about* a TE-premium bonus is the opposite of supporting the format, and matches AC-27's
purpose.

### Test-change audit

Every existing test file the repair modifies or deletes from is flagged with justification in
`dev-notes-repairs.md` §"Test-file changes", and I verified each claim against the diff:

- `recommend/candidates.test.ts` — one test **deleted** (`falls back to ADP order when the snapshot
  carries no K/DST rankings`, the synthetic-input unit test the prior verdict rejected as evidence).
  Flagged, justified, and — the point the brief asked me to confirm — **replaced, not dropped**: the
  covering test is `orchestrator.test.ts` > `AC-50 — the K/DST filter when the ECR snapshot ranks no
  K or DST`, which exists, runs, drives the real ingest, and passes. A comment at the deletion site
  points to it. The two surviving `position filter (AC-50)` cases (ECR order for a skill position; K
  in positional ECR order with no survival) are untouched.
- `snapshots/predraftCheck.test.ts` — flagged. Verified: the AC-23 case now calls a `skillOnlyEcr()`
  helper with a character-identical assertion; the leagueSummary case is strengthened as described
  above; the old label-only case is repurposed into the `source: 'scoring-type-default'` fallback
  branch with its coverage preserved and extended by the new mock-fallback case.
- `test/msw/snapshotHandlers.ts` — flagged. Additive `adpData?` option only, defaulted
  `options.adpData ?? ffcFixture()`; no existing behaviour changed.
- `orchestrator.test.ts` — flagged. `standUp` gains four optional pass-throughs, each defaulted to
  today's fixture (`options.bundle ?? realBundle`, `options.players ?? sleeperPlayersFixture()`, and
  conditional spreads for `ecrData`/`adpData`); no existing test body changed.
- `snapshots/match.test.ts` — purely additive (one new `describe`, no deletions), so nothing to flag.

## Non-blocking observations

Recorded for the record; neither affects this verdict, and neither is a regression.

- The AC-23 fallback count in `predraftCheck.ts:153-156` counts ADP-only K *and* DST rows whenever
  `snapshotHasKickersAndDefenses` is false. In the asymmetric case (ECR ranks DST but not K, and the
  ADP feed carries an unranked DST) the count can be non-zero while no filter actually falls back, so
  the message could overstate by naming a fallback that applies to neither position. Strictly more
  accurate than the message it replaces, which promised the fallback unconditionally.
- `setMatchedPlayerIds` (`orchestrator.ts:394`) is still built from the ECR board alone, so a drafted
  ADP-only kicker is still badged "Unmatched" in the pick feed. Behaviour is byte-identical to
  pre-repair, the prior verdict scoped the fix to `rowsByPosition` explicitly, and widening it would
  change AC-20 — correctly left alone.
- `dev-notes-repairs.md` records one AC-27 case (`lets the settings outrank the label in both
  directions`) as written after the implementation rather than test-first. Disclosed by the maker
  rather than quietly counted; the case is present and passing.
