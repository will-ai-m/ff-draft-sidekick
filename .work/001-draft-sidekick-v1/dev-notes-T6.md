# Dev notes — 001-draft-sidekick-v1 (T6: within-draft tendency profiles, FR-7)

Scope: design.md §T6 only — FR-7 (AC-38, AC-39, AC-40, AC-41). Nothing from T7–T15 was
implemented: no simulation, no reach-adjusted player draw, no UI. T5's `opponent/window.ts` was
imported and **not modified** — the two fields it deliberately left optional are filled from this
task's own module instead, per the seam its dev notes describe.

## Changes

**`packages/server/src/tendencies/profiles.ts`** (new) — the whole task, one file, as design.md's
file plan places it ("FR-7 — reach/need-adherence/positional tracking + bending"). Seven exports:

| export | job |
|---|---|
| `computeExpectedPositionalShare(slots)` | the league's starting-slot proportions — the baseline (AC-38) |
| `neutralTendencyProfile(teamId, slots, pickCount?)` | AC-39's cold-start priors |
| `computeTendencyProfile(input)` | one team's reach / need-adherence / positional share (AC-38, AC-39) |
| `computeBpaDistribution(players, board)` | the best-player-available pole the bend blends toward |
| `bendDistribution(input)` | the architect-supplied bend (AC-40) |
| `applyTendencyProfiles(input)` | fills `tendencyProfile` + `bentDistribution` on FR-6's rows (AC-40) |
| `TendencyProfileTracker` | the per-attach holder, with `discard()` (AC-41) |

**`packages/shared/src/types/opponent.ts`** — one additive field on T1's `TendencyProfile`:
`reachSampleCount`. Reach is `ADP − pick number`, and a pick whose player carries no ADP (AC-26 —
T3's `playersMissingAdp` is a real, populated list, not a rare edge) cannot be scored for reach at
all. Skipping those picks is the only honest option, but it leaves `averageReach: 0` meaning either
"drafts exactly at market" or "we have no ADP for anything they took". The count separates them,
and T13's compact summary (AC-40) needs that to avoid asserting a tendency it does not have.
Flagged here because it is a change to another task's type; nothing else in `opponent.ts` moved.

### Decisions worth a reviewer's attention

1. **The expected positional share is dedicated slots over *total* starting slots, FLEX in the
   denominator and in no numerator.** This is design.md §T6's own worked arithmetic, reproduced
   exactly: "a 10-team league with 2 starting RB slots per team out of 9 total starters has an
   expected RB share of 2/9" (QB1+RB2+WR2+TE1+FLEX1+K1+DST1 = 9). The consequence is deliberate and
   documented in the function's JSDoc: the shares sum to slightly under 1 in any league with a
   FLEX, so every δ carries the same small positive offset, which the renormalisation at the end of
   the bend absorbs. The alternative — spreading the FLEX across the eligible positions the way
   `computeNeedVector` does, giving RB 2⅓/9 — makes both sides sum to 1 but contradicts the
   design's stated number. Went literal and flagged it; it is a one-line change if the §14
   rehearsal loop says otherwise.
2. **Need-adherence is replayed pick by pick, and a K or DST pick can be need-driven.** AC-38 says
   "filled a then-unfilled *starting* slot", and AC-33 makes K/DST starting slots that a roster
   tracks. So taking your kicker while the K slot is open counts as need-driven. This does **not**
   contradict AS-7: K/DST carry no *need-vector weight* and get no mass in any distribution here
   (asserted). Bookkeeping and prediction are different jobs — T4's dev notes draw the same line.
3. **A pick whose position never resolved leaves two denominators, not three.** It cannot be judged
   for need-adherence or attributed to a positional share, so it is excluded from both; it still
   counts toward `pickCount`, which is a count of picks *made*, not of picks understood. Otherwise
   an unknown-position pick would silently delay a team's cold-start exit.
4. **A no-need-signal team gets a profile but no `bentDistribution`.** `bendDistribution` returns
   null when `needDistribution` is null, so the enriched row leaves the optional field absent —
   exactly the shape T5 established for `needDistribution` itself (its decision 3), and exactly the
   branch design.md §T7 step 1 already expects to take on the `NO_NEED_SIGNAL` sentinel. Its
   profile is still computed and still matters: the reach half of it adjusts T7's player draw in
   the best-available regime too.
5. **Average reach is deliberately absent from the bend.** Reach is a statement about *which
   player* a team takes within a position (T7's `reachAdjustmentPerPick` weighting), not about
   which position they take. §T6's done-when asks the bend to shift visibly "when fed a synthetic
   high-reach/low-need-adherence profile"; the test does feed exactly that profile, and the shift
   comes from the adherence and positional terms — the reach term is asserted to change nothing
   here, which is the honest reading rather than inventing a second use for it.
6. **A neutral profile is an exact identity on the distribution.** `a = 1` and `δ = 0` make
   `bent === needDist`, so AC-39's cold start means precisely "a team we have learned nothing about
   is predicted from its needs alone" — FR-6's displayed likelihoods, unmoved. Pinned as a test
   rather than left as an accident of the arithmetic.
7. **The nudge can scale a weight to zero but never past it.** `Math.max(0, 1 + δ)` guards a
   user-supplied `tendencyPositionalNudgeClamp > 1`, which would otherwise produce negative
   probability mass. The all-zero fallback returns the unnudged blend rather than a vector of NaNs.
8. **Profiles are derived from the pick feed, never accumulated** — the same discipline T4's roster
   panels and T5's opponent panel use, so a profile cannot drift from the picks it was built from
   and AC-38's "after each opponent pick, the system updates that team's profile" reduces to "the
   board version bumped". Memoised against `BoardSync.boardVersion`, cleared when it moves.
9. **`discard()` exists because dropping the reference cannot cover AC-41's "when a draft ends".**
   Detach and re-attach are handled structurally — the tracker is a per-attach object with no
   module-level registry and nothing on disk — but a draft that *ends* while the app is still
   attached and still rendering the panel needs an explicit act. After `discard()`, every team
   reads back as a neutral prior (profiles discarded, no bending), rather than throwing, which
   would blank a panel the user is still looking at. T10 calls it on detach, new attach, and
   `sync.isComplete`.
10. **No observability sample is recorded here**, following T5's decision 7: AC-40's refresh rides
    the same burst-settled recompute cascade as AC-35/AC-46, which §T10 instruments once for all of
    them.
11. **`applyTendencyProfiles` returns new rows; T5's file was not touched.** Bending could have
    been an optional callback threaded into `buildOpponentPanel`, but that would edit another
    task's module to do work its own dev notes hand to this one. The enrichment is a pure
    projection, asserted not to mutate its input and to leave FR-6's *unbent* `needDistribution`
    exactly as AC-36 requires it to be displayed.

## Test-first evidence

`packages/server/src/tendencies/profiles.test.ts` was written and confirmed failing before
`profiles.ts` existed.

- failing: `npx vitest run --project server src/tendencies` →
  ```
   ❯ |server| src/tendencies/profiles.test.ts (0 test)

   FAIL |server|  src/tendencies/profiles.test.ts [ packages/server/src/tendencies/profiles.test.ts ]
  Error: Failed to load url ./profiles (resolved id: ./profiles) in
  /Users/willyu/willy-ff/packages/server/src/tendencies/profiles.test.ts. Does the file exist?

   Test Files  1 failed (1)
        Tests  no tests
  ```
- first implementation run: same command → `Test Files 1 passed (1) / Tests 39 passed (39)`,
  exit 0. Every expected number below was hand-computed from the fixture before the implementation
  existed, and the implementation matched on the first run — no assertion was adjusted to fit it.
- one test was added *after* that green run: the live-board "picks up a landing pick on the next
  poll" case (AC-38), which needed msw and the `SleeperScenario.advance` seam. It passed on its
  first run too. Recording it so the reviewer is not surprised by a 39 → 40 jump.
- passing: `npx vitest run --project server src/tendencies` → `Test Files 1 passed (1) /
  Tests 40 passed (40)`, exit 0. Full root `npm test`: `Test Files 24 passed (24) /
  Tests 341 passed (341)`, exit 0 (301 before this task).
- commits: none — per this spawn's instruction the developer runs no git commands; the orchestrator
  commits. Test-first ordering is recorded here instead of by commit order.

Coverage against §T6's "done when", one assertion apiece:

| Required | Test |
|---|---|
| a fixture sequence of opponent picks produces the exact documented **reach** | "is the mean of ADP minus the pick number taken…" — slot-3's `+2, −6, +7, −13, +17` → 1.4 |
| …the exact documented **need-adherence** | "is judged against the roster as of just before each pick, not the final roster" — 4/5, where the final-roster reading would give 3/5 |
| …the exact documented **positional numbers** | "reports the team's observed share beside the league's expected share" — RB 0.6 / QB 0.4 against the 2/9 baseline |
| the cold-start label disappears exactly at the 3rd pick | "drops the early label exactly at the 3rd pick, and only then reports observations" — 2 picks `'early'` + neutral, 3 picks `'established'` + real numbers |
| the bend visibly shifts a high-reach/low-need-adherence team away from neutral | "shifts a low-need-adherence, RB-leaning team's distribution visibly away from neutral" — exact hand-computed `348/2561, 1488/2561, 525/2561, 200/2561`, plus RB > neutral + 0.15 and WR < neutral − 0.09 |
| the detach-then-reattach test shows no residual state | "carries nothing into a fresh attach of the same draft id" — every seat back to `neutralTendencyProfile` after discard + re-attach to the same draft object |

The rest of FR-7, each asserted individually:

- **AC-38** — the baseline from a league's own settings (including a 3-WR / no-kicker league and a
  zero-starter degenerate league); reach skipping ADP-less picks rather than scoring them zero, and
  reporting `reachSampleCount: 0` when nothing was scorable; need-adherence crediting a FLEX fill
  and an open K/DST slot, and refusing to credit the pick after either runs out; positional shares
  dividing by the picks whose position is known; profiles reading only their own team's picks out
  of an interleaved feed; and the live-board case where a landing pick moves the profile on the
  next poll.
- **AC-39** — neutral priors and the `'early'` label at 0, 1 and 2 picks (asserted equal to
  `neutralTendencyProfile`, not just similar); the boundary at exactly 3; the threshold read from
  config (5 and 6 both exercised) rather than a hardcoded 3; and the shared default still 3.
- **AC-40** — the BPA distribution's `1/rank` weighting hand-checked at `15:42:30:14` over 101; a
  neutral profile as an exact identity; the blended-plus-nudge arithmetic to 12 decimal places; the
  clamp binding at the configured 0.5 (RB 6/11) and releasing at 1.0 (RB 64/109); null for a
  no-need-signal team; a fall back to need alone when no BPA distribution exists; and the panel
  rows carrying both new fields while every FR-6 field is left untouched and unmutated.
- **AC-41** — neutral priors immediately after `discard()`; nothing carried into a fresh attach of
  the same draft id; and two live attaches disagreeing at once, which a module-level profile store
  could not do.
- **AS-7** — K and DST at exactly zero in the BPA distribution and in the bent distribution, even
  for a team whose entire observed share is K/DST.

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. `src/tendencies/profiles.test.ts` is
  new in T6; no existing fixture, msw handler or suite was edited. T5's
  `test/fixtures/sleeper-window-traded-draft.json` is reused as-is (read-only) for the live-board
  and AC-41 cases. Every pre-existing suite still passes untouched: 301 tests before this task,
  341 after, and the 23 pre-existing test files all still green.

## Commands

Run from repo root.

- test: `npm test` → **exit 0** — 24 files, 341 tests passed (T6 contributes 40).
- lint: `npm run lint` → **exit 0**.
- typecheck: `npm run typecheck` → **exit 0** — all three `tsc --noEmit` invocations clean,
  including the shared package after the `TendencyProfile` field addition.

Scoped verification of T6's own work: `npx vitest run --project server src/tendencies` → 40 tests,
exit 0; `npx prettier --check packages/server/src/tendencies packages/shared/src/types/opponent.ts`
→ clean.

## Left for downstream tasks (seams T6 exposes, deliberately unwired here)

- **T7** takes `entry.bentDistribution` as its position-draw distribution and branches to the
  best-available regime exactly where that field is absent (which is exactly where
  `needVector === NO_NEED_SIGNAL`). It reads `profile.averageReach` for its
  `effectiveAdpRank = max(1, adpRankWithinPosition − reachAdjustmentPerPick × avgReach)` weighting
  — `reachSampleCount === 0` means that reach is a prior, not an observation, if T7 wants to damp
  it. `tracker.profileFor(teamId)` answers for any seat, so a team appearing twice in the window
  gets the same profile at both picks, which is correct: one pick inside the window does not update
  a profile the board has not seen land.
- **T10** owns the wiring: construct one `TendencyProfileTracker` per attach beside `BoardSync` and
  `RosterPanelTracker`, then per burst-settled recompute call
  `tracker.enrichPanel(computeOpponentPanel({…}).entries)` and stamp the result with
  `tracker.boardVersion`. It also owns AC-41's trigger — call `tracker.discard()` on detach, on a
  new attach, and when `sync.isComplete` turns true. `adpFor` is
  `(id) => snapshots.matching.byPlayerId.get(id)?.adp ?? null`; `players` is
  `snapshots.matching.players` (the same immutable snapshot T5 is handed). No AC-67 sample is
  recorded here — the bend runs inside the cascade T10 already times.
- **T13** renders AC-40's "compact summary" from `entry.tendencyProfile`: `confidence === 'early'`
  is the gray-out signal (in the data, per §T6, not a UI-side rule); `averageReach` with
  `reachSampleCount` is the reach lean; `needAdherence` is the need-vs-BPA lean; and
  `observedPositionalShare` against `expectedPositionalShare` is the positional lean. The thresholds
  that turn those numbers into words ("reaches", "drafts need") are display copy the PRD gives no
  values for — left to T13 rather than invented as config here. A row with no `bentDistribution` is
  the best-available team, which has no bent badges to show either.
