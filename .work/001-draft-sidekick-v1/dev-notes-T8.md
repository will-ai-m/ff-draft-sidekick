# Dev notes — 001-draft-sidekick-v1 (T8: candidate list, recommendation highlight, two-pick lookahead, FR-9/FR-10)

Scope: design.md §T8 only — FR-9 (AC-49 … AC-53) and FR-10 (AC-54 … AC-60), plus AC-42's
`ensureIncluded` seam and the candidate-list half of AC-28. Nothing from T10 was wired: no
orchestrator call, no SSE payload, no REST route. T3's `assignSamplingRanks`, T4's need vectors,
T5's `computeWindow` and T7's `simulateSurvival` are consumed and **not modified**.

## Changes

**New — `packages/server/src/recommend/lookahead.ts`** (FR-10). Plan positions off FR-5's need
vector (AC-54), ordered `(now, next)` pairs including `now === next`, `term1` as a present-tense
best-available ECR lookup, `term2` as the mean over T7's per-run survivor matrix of the best
surviving rank at the next-position (AC-55, no-survivor runs at the snapshot's last rank + 1),
`score = term1 + term2` with the lower total winning, the AC-58 too-close flag, and AC-57's
separating survival fact. Deterministic ordering throughout (score, then canonical QB/RB/WR/TE).

**New — `packages/server/src/recommend/candidates.ts`** (FR-9). Raw-ECR-ordered rows capped at
🔶 `candidateListDefaultRows` and extended for the highlight (AC-49/AC-56); per-row ECR rank,
positional rank, ADP and survival-with-band; AC-50's position filter including the K/DST
no-survival-math variant and its ADP-order fallback; `candidateSimulationIds` for AC-42's
`ensureIncluded`; and the **single** highlight-reason resolver composing FR-10 exactly as §T8
specifies — plan comparison places the highlight, AC-51 precedence names the decisive factor, and
the cross-position within-noise test runs last and only rewrites the line.

**New tests** — `lookahead.test.ts` (23) and `candidates.test.ts` (26). Every expected number and
every expected reason string is hand-computed from AC-55's arithmetic on a 14-player fixture; the
survivor matrices are stated run by run rather than sampled, so no assertion is a recorded output.

**Two amendments to T1's shared types** (`packages/shared/src/types/candidate.ts`), both flagged:

| change | why |
|---|---|
| `CandidateRow.ecrRank: number` → `number \| null` | AC-50's "falling back to ADP order when the snapshot carries no K/DST rankings" describes a row the ECR snapshot does not carry. With a non-null rank the type cannot represent the case its own AC names. Null is documented as reachable **only** through a K/DST filter. |
| `PlanComparison.winner: Plan` → `Plan \| null` | AC-59 requires a comparison that ran and reported "lookahead does not apply", and a no-need-signal roster produces a comparison with nothing to score. Both need a winner-less `PlanComparison`; the alternative made `applicable` vacuous (always `true` whenever the object existed). `applicable: false` + `winner: null` is AC-59; `applicable: true` + `winner: null` is the best-available regime. |

No consumer existed for either field yet (T12 is downstream), so nothing was reworked.

## Decisions worth a reviewer's attention

### 1. `term2` excludes the player `term1` spends. This is the one substantive deviation, and it is load-bearing.

**Read literally, AC-55 makes FR-10 a no-op on the highlight.** The score is
`term1(now) + term2(next)`; with `term2` depending only on `next`, the sum is *separable* over the
full product of needed positions, so `argmin` factorises and the winning plan's now-position is
**always** `argmin term1` — the best available player at a needed position, whatever the survival
data says. Three consequences, each checkable against the sources:

- FR-10's own headline ("optimizes the user's next two picks jointly, not the current pick in
  isolation — and it, not a per-row rule, is what places FR-9's highlight") would be false of its
  implementation. The joint structure would carry no information at all.
- AC-51's **plan/survival** reason — "the winning plan moved the highlight off the overall top-ECR
  candidate" — becomes unreachable. The highlight can then differ from the top-ECR candidate only
  when that candidate's position was excluded from the plan set, which is AC-51's **need** clause,
  verbatim. Exactly one of the two reasons is reachable under any precedence ordering, and the
  other is dead code.
- design.md §T8's own "done when" therefore cannot be satisfied: it requires a need-driven scenario
  **and** a plan/survival-driven scenario as distinct tests with distinct expected reason strings.

The cause is narrow: only a `now === next` plan double-counts, because it credits the same player
to both terms. An RB-now/RB-next plan cannot take Bijan Robinson twice. So `term2` takes an
`excludePlayerId` — the player `term1` names — and applies it only when `nextPosition ===
nowPosition`. Every cross-position plan is bit-for-bit unchanged, and AC-55's no-survivor rule then
does the right thing for free: a run whose only survivor at that position was the one spent scores
the snapshot's last rank + 1, which is precisely the penalty a thin position deserves.

This restores the joint comparison the PRD describes. On the §T8 fixture: RB is deep and safe
(rb1 survives every run), WR is thinning (wr1, wr2 gone). Plans score
`(RB,RB) 12 | (RB,WR) 9 | (WR,RB) 3 | (WR,WR) 10` — take the WR now, come back for the RB — and the
highlight moves off the ECR-1 running back onto the ECR-2 receiver with reason **plan/survival**.
Without the exclusion `(RB,RB)` scores 2 and wins, and the WR is never recommended.

Alternatives considered and rejected:

- **Implement literally and accept the dead reason.** Rejected: it silently ships an FR-10 that
  cannot do what FR-10 says it does, and leaves two design.md scenarios unwriteable.
- **Enumerate `(p, p)` only when the roster can absorb two at `p`** (design.md's own parenthetical
  says "a user needing 2 RB slots legitimately has an RB-now/RB-next plan"). This also restores
  jointness and touches no formula — but it fails a common case: a roster needing exactly one WR
  and nothing else would have an empty plan set, fall back to the plain top-ECR candidate, and
  recommend a running back the user has no slot for. It also has no effect at all whenever a FLEX
  slot is open, which is most of a draft.

**Flagged for the orchestrator**: my task order restated AC-55's method clause verbatim, so this is
a deliberate, argued departure from it rather than an oversight. If the literal reading is wanted,
delete the `excludePlayerId` argument in `expectedBestSurvivingRank` and its one call site; the
`plan-survival` branch of the resolver and two tests then become unreachable and should be deleted
with it, and design.md §T8's "done when" should be amended to match.

### 2. AC-51's precedence is implemented with disjoint conditions, not a first-match cascade.

The PRD lists **plan/survival** before **need**, but gives each a precise parenthetical. Taken as
written, "the winning plan moved the highlight off the overall top-ECR candidate" is a superset of
"the top-ECR candidate's position has no unfilled starting slot", so a naive cascade would make
`need` unreachable. The resolver therefore splits the move by *cause*:

- highlight moved **and** the top-ECR candidate's position **was** in the plan set → `plan-survival`
  (the comparison had the chance to pick it and did not);
- highlight moved **and** it was not → `need` (no plan could reach it).

The two are mutually exclusive, so the stated precedence order is honoured trivially and both
reasons are reachable. `value` and `best-available` follow, unchanged.

### 3. The within-noise test never moves the highlight, and the two tie statements merge into one line.

AC-52 runs last, on whatever highlight FR-10 resolved, and replaces only the reason line — the
highlight "stays put", which is what keeps a one-point wobble in a survival percentage from
re-shuffling the recommendation between polls. The comparator is the **highest-ECR available
candidate at a different position** (a same-position near-tie is not what AC-52 asks about; a test
pins that). Both conditions must hold, so a suppressed or missing survival number means the test
cannot fire rather than firing on the ECR condition alone.

AC-52's and AC-58's statements are both tie statements, so when both fire they are joined into a
**single** reason string rather than rendered twice. AC-59's "lookahead does not apply" is not a tie
statement; it rides along in the same line when a tie statement displaces it, so neither AC loses
its required statement. `reasonKind` becomes `'too-close-to-call'` whenever either fires.

### 4. AC-58 moves the highlight; it does not rewrite the comparison the user is shown.

"Falls back to the higher-ECR current pick" is implemented as: between the winner and the runner-up,
take the one with the lower `term1`, and highlight that plan's now-position player. `PlanComparison`
still reports the real scoring winner and the real alternative, because AC-57 asks for exactly those
two. When the top two plans share a now-position the fallback is a no-op on the highlight and only
the statement renders — correctly, since the sequencing really is a coin flip even though the
current pick is not.

### 5. `lookaheadMaxPicks` is wired, not assumed.

AC-59's "fewer than two picks remaining" and AC-60's "at most two of the user's picks ahead" are the
same 🔶 knob from both ends, so the skip test reads `userRemainingPicks < config.lookaheadMaxPicks`
rather than an inline 2, with a test pinning that a retuned knob moves the threshold. The
enumeration itself is still pair-shaped: raising the knob needs this module extended, which the
module header says in as many words rather than leaving it true by construction.

### 6. `userRemainingPicks` is an input, not derived from the window.

`window.nextUserPickNo === null` is AC-45's suppression trigger, but it is not AC-59's condition: a
user who is off the clock with exactly one pick left has a non-null `nextUserPickNo` and still must
skip the comparison. T10 supplies the count from T5's `countRemainingPicks(sequence,
picksMade).get(userTeamId)`, which already counts the in-progress pick for whoever owns it.

### 7. The plan is scored against the present board even while the user is off the clock.

`term1` is a present-tense lookup and `term2` is anchored at `window.nextUserPickNo`, which is the
user's *soonest* pick when they are not on the clock. The list then reads as a preview — "who I'd
take if it were my turn, and what will still be there when it is" — which is the same framing the
rest of the panel already has (rows are "available now", survival is "to your next turn"). No
branch on `userOnTheClock`: the survivor matrix supports no other anchoring, and the whole list is
recomputed by the time the user is actually on the clock.

### 8. AC-50's ADP fallback is implemented but currently unreachable through T3's output.

`MatchResult.players` is built by walking the **ECR** feed, so every matched player carries an ECR
rank and a K/DST that FantasyPros omits (AC-23's warning case) is dropped rather than surfacing
from FFC's feed. `filterCandidateRows` implements the fallback and a test pins it, but T10 will need
to pass ADP-only K/DST rows for it to fire in production — a small wiring choice for T10/T3, noted
below rather than built speculatively here.

### 9. The position filter is a pure function; its transport is T10/T12's call.

AC-50's "one interaction" is a UI affordance, but the ordering rules are algorithm and design.md
assigns them here. `filterCandidateRows` is exported and tested standalone, and
`computeCandidateList` accepts an optional `positionFilter`. The frontend cannot filter client-side
from eight ECR-ordered rows (a WR filter would yield two of them), so T10 must either recompute per
filter or precompute per-position row sets — see below.

## Test-first evidence

**failing:** `npm test -- recommend` — both suites written before either module existed.

```
 ❯ |server| src/recommend/candidates.test.ts (0 test)
 ❯ |server| src/recommend/lookahead.test.ts (0 test)

 FAIL |server|  src/recommend/candidates.test.ts
Error: Failed to load url ./candidates (resolved id: ./candidates) in
  /Users/willyu/willy-ff/packages/server/src/recommend/candidates.test.ts. Does the file exist?
 FAIL |server|  src/recommend/lookahead.test.ts
Error: Failed to load url ./lookahead (resolved id: ./lookahead) in
  /Users/willyu/willy-ff/packages/server/src/recommend/lookahead.test.ts. Does the file exist?

 Test Files  2 failed (2)
      Tests  no tests
```

**passing:** `npm test -- recommend` → `Test Files 2 passed (2) / Tests 49 passed (49)`
(`lookahead.test.ts` 23, `candidates.test.ts` 26).

**passing:** `npm test` → `Test Files 27 passed (27) / Tests 439 passed (439)` — 390 before this
task, +49 from this task's two new files, no existing test touched.

Commits: none — the orchestrator commits this task's tree (per the task order; the role's
commit-order steps were superseded there).

## §T8 "done when", scenario by scenario

Six scenarios, each asserting the exact highlighted player and the exact reason string, one
assertion per scenario, all in `candidates.test.ts` under
`the highlight and its one-line reason`:

| scenario | board | highlight | reason (verbatim) |
|---|---|---|---|
| plan/survival | RB deep and safe, WR thinning; plans `12 / 9 / 3 / 10` | `wr1` | `Plan WR now / RB next scores best (3 vs 9) — Ja'Marr Chase over higher-ECR Bijan Robinson.` |
| need | only WR unfilled; top-ECR is an RB | `wr1` | `Bijan Robinson (RB) fills no unfilled starting slot — Ja'Marr Chase (WR) does.` |
| value | top-ECR stays, ADP 1.5 against pick 12 | `rb1` | `Value: Bijan Robinson is the top available player, and an ADP of 1.5 is 10.5 picks earlier than pick 12.` |
| best available | same board at pick 5 — gap 3.5, under the 🔶 10 | `rb1` | `Best available: Bijan Robinson (ECR 1).` |
| too close to call (AC-52) | `wr1` and `rb1` one ECR rank and zero survival points apart | `wr1` (unmoved) | `Too close to call: Ja'Marr Chase (ECR 2, 100% survival) and Bijan Robinson (RB, ECR 1, 100% survival) — staying with Ja'Marr Chase.` |
| fewer than two picks (AC-59) | last pick, survival suppressed | `rb1` | `Lookahead does not apply with 1 pick left — best available: Bijan Robinson (ECR 1).` |
| plan totals within 3 (AC-58) | winner 3, runner-up 4 | `rb1` (fallback to the higher-ECR now-pick) | `Plan totals within 3 ECR ranks (3 vs 4) — too close to separate, taking the higher-ECR player now: Bijan Robinson (ECR 1).` |

A separate test drives both tie statements onto the same pick and asserts the single merged line
contains exactly one `Too close to call`.

Beyond the six: AC-49 row content and highlight extension, AC-53 drafted-player exclusion from rows
*and* highlight, AC-45 suppression, AC-50's three filter cases, AC-42's `ensureIncluded` id set,
AC-28's disabled state, AC-55's four term2 rules including the no-survivor penalty, AC-57's
separating fact and its absent case, and one test composing the whole list against **T7's real
`simulateSurvival` output** rather than a hand-built matrix, asserting every id
`candidateSimulationIds` names is inside the projection's universe.

## Test-file changes

- **none.** No pre-existing test file was modified or deleted. Both T8 test files are new. T1–T7
  and T9's suites are untouched (438 → 439 in the same run only because this task's own count grew
  by one when a no-need-signal case was added).

## Commands

Run from repo root.

- test: `npm test` → **exit 0** — `Test Files 27 passed (27) / Tests 439 passed (439)`. Baseline
  (`baseline.txt`) is a greenfield ENOENT, so there are no pre-existing failures to net against;
  every suite green before this task is green after.
- lint: `npm run lint` → **exit 0**, no warnings. `npx prettier --write` was run over this task's
  four new files only — no other task's file was reformatted.
- typecheck: `npm run typecheck` → **exit 0** (shared, server, web).

## Left for downstream tasks (seams T8 exposes, deliberately unwired here)

- **T10** must call in this order, per recompute: `candidateSimulationIds({players, board, config})`
  → `simulateSurvival({..., ensureIncluded})` → `computeCandidateList({players, board, window,
  needVector, survival, userRemainingPicks, config})`. Inputs it owns: `players` is
  `snapshots.matching.players` (satisfies `CandidatePlayer` structurally, no adapter needed);
  `needVector` is `tracker.userPanel()?.needVector` — the **user's**, never an opponent's;
  `userRemainingPicks` is `countRemainingPicks(sequence, picksMade).get(userTeamId) ?? 0`;
  `window` is what `computeOpponentPanel` already returns beside its rows. The returned
  `CandidateListData` is `AppStateSnapshot.candidateList.data`, stamped with
  `tracker.boardVersion`. AC-53's 5 s budget and the `recomputing` flag are entirely T10's.
- **T10, AC-50's transport.** The frontend cannot filter client-side from the default rows. Either
  recompute with `positionFilter` set (a REST parameter or a per-position precompute into the
  snapshot) — the algorithm is ready for both, and `filterCandidateRows` is exported for either.
  If a K/DST-less ECR snapshot must produce K/DST rows at all (decision 8), T10 also needs to hand
  `computeCandidateList` the ADP-only rows; T3 does not currently emit them.
- **T12** renders `rows` / `highlightPlayerId` / `reason` / `reasonKind` / `planComparison`
  verbatim — the reason strings are produced here and must not be reworded or re-derived.
  `reasonKind` is the stable key to style on; `reason` is the one line to print.
  `CandidateRow.ecrRank` is nullable only in a K/DST filter (decision 8), and
  `PlanComparison.winner` is null exactly when `applicable` is false (AC-59) or the roster has no
  fillable unfilled slot. `planComparison.separatingFact` is null when nothing survival-related
  separates the two plans — render nothing rather than inventing a line.
- **T15** can assert AC-53 end to end: no drafted player ever appears in `rows` or as
  `highlightPlayerId`, which this task enforces by filtering before ranking in every path.
