# Dev notes — 001-draft-sidekick-v1 (T7: Monte Carlo survival simulation, FR-8)

Scope: design.md §T7 only — FR-8 (AC-42 … AC-48). Nothing from T8 was implemented: no candidate
list, no highlight, no plan scoring. T3's `assignSamplingRanks`, T5's `computeWindow` and T6's
`bentDistribution` / `averageReach` are imported and **not modified**.

> **This task was resumed.** A prior attempt was terminated mid-task by an infrastructure error,
> leaving `packages/server/src/simulation/montecarlo.ts` (549 lines) and `montecarlo.test.ts`
> (941 lines, 45 tests) in the tree with **39/45 passing, 6 failing**. No dev-notes file existed.
> The section below records what I kept, what I changed, and why — the six failures turned out to
> be two unrelated defects, one in the tests and one genuinely in the design.

## What I kept vs. what I changed

**Kept, unchanged (the bulk of the prior attempt — it was sound).** The universe builder, the
K/DST saturation planner, the position draw, the reach-adjusted player draw, the per-run survivor
matrix, the band function, suppression, the degraded passthrough, the `toSimulatedPicks` seam, and
the mulberry32 generator. I verified the sampling math independently rather than trusting the
passing tests: a probe averaging the `1, 1/2, 1/3` fixture over **400 independent seeds × 2000
runs** returned 0.45542 against an expected 5/11 = 0.45455 — z ≈ 1.58, i.e. no measurable bias, in
the *opposite* direction from the failures. The draw is correct.

**Changed:**

| what | why |
|---|---|
| `montecarlo.ts` — default seeding is now derived from the board (`deriveSeed`), not `Math.random` | The prior attempt could not satisfy SC-2's guardrail. See §1 below — this is the real defect. |
| `montecarlo.ts` — module header + `createSeededRandom` JSDoc | They documented the decision §1 reverses; leaving them would have been actively misleading. |
| `montecarlo.test.ts` — 5 convergence assertions moved to the tolerance the file already documents | The assertions contradicted their own stated margin. See §2 — this is a test defect, flagged below. |
| `montecarlo.test.ts` — the stability test rewritten, 3 tests added | The old one asserted something mathematically unachievable and did not test what §T7 asks for. Flagged below. |
| `montecarlo.test.ts` — 1 test added pinning reach in the best-available regime | An AC-42 reading no test discriminated. See §3. |

## Decisions worth a reviewer's attention

### 1. The board seeds the simulation. This is the substantive change, and it is a correctness fix.

The prior attempt defaulted to `Math.random`, arguing in a JSDoc comment that a deterministic
default "would make that guardrail true by construction and prove nothing". That reasoning is
backwards, and the failing test was the evidence.

PRD SC-2's guardrail is **a claim about the product, not about the test suite**: "survival
estimates stay simulation-stable (re-running on an unchanged board moves no player's percentage
across a band boundary)". Independent sampling cannot deliver it at any run count. I measured the
failing fixture: player `p3`'s true survival is **≈0.7524**, i.e. 0.0024 above the 0.75 band
threshold, against a standard error at the default 🔶 `monteCarloRunCount` of **≈0.0097**. Two
independent samples therefore disagree on his band roughly half the time. Across the whole fixture
I measured **122 band disagreements over 200 independent seed pairs** — about 61% of reruns move
at least one player across a boundary. Closing a 0.0024 gap to even 4 σ would need ~10⁶ runs, and
on any real board *somebody* always sits arbitrarily close to a threshold. The guardrail is
unreachable by turning the run count up; it is only reachable by determinism.

So `simulateSurvival` now seeds itself with `deriveSeed(universe, picks, config)` — a 32-bit FNV-1a
over exactly the inputs a draw consumes (the universe in sampling order, each pick's
team/pickNo/reach/K-DST/remaining-picks and its bent weights over the skill positions, plus
`monteCarloRunCount` and `reachAdjustmentPerPick`). Bands are deliberately **not** hashed: they
colour a result, they do not sample it, so retuning a threshold must not re-roll the draw.

Consequences, all of them wanted:

- An unchanged board replays an identical stream, so a displayed percentage cannot move while
  nothing has happened. The guardrail holds structurally, in production, not just on average.
- The moment a pick lands the universe changes and the seed with it, so successive boards still
  draw genuinely independent samples — a hard-coded constant seed would have let one stream's
  quirks ride along the whole draft, which is why I hashed rather than picking a number.
- Any projection the user saw is reproducible from the board alone, which matters the first time a
  survival number is disputed in a rehearsal.

Alternatives rejected: **band hysteresis** (remember the last band, switch only past a margin)
would work but requires state surviving across recomputes, contradicting the module's — and FR-3's
— "nothing accumulates, a projection cannot drift from the board it was built from"; **raising the
run count** does not fix it, as measured above.

`seed` and `random` overrides are retained; T10 will pass neither.

### 2. The five "statistical" failures were a test defect: the assertion contradicted its own comment.

The test file declares its tolerance at the top: *"20k runs put the standard error at ~0.0035, so
a ±0.02 tolerance is ~6 SE of margin."* The assertions then used `toBeCloseTo(x, 2)`, whose
tolerance is **±0.005** — under 1.5 SE, which a *correct* simulation exceeds on roughly one
assertion in seven. With a single pinned seed that is not flaky, just wrong; the seed simply landed
somewhere that tripped five of them. Every failing value was within 1.6–2.2 SE of its hand-computed
expectation, comfortably inside the documented 6 SE margin.

Fixed by asserting on the absolute difference against a named `CONVERGENCE_TOLERANCE = 0.02`,
matching the file's stated intent, via an `expectConverged` helper that names the player in the
failure message. Flagged as a test-file change below.

### 3. Reach applies in the best-available regime too (an AC-42 reading, now pinned by a test).

AC-42 reads: "draws a position from the team's tendency-bent need vector — **or, when the team has
no need signal, samples directly from ADP order instead of drawing a position** — then draws the
player within that position from ADP order **adjusted by the team's reach profile**". The em-dash
clause substitutes for the *position* draw only; the reach adjustment governs the *player* draw in
both regimes. Substantively too: a team that habitually reaches does not become market-efficient
the moment its starting slots fill up. The prior attempt implemented this; **no test
discriminated** (the no-need fixture used `averageReach: 0`), so I added one rather than leave a
behavioural decision resting on nobody's reading. PRD §9 Terms' "drawn from ADP order across
QB/RB/WR/TE" defines the *pool* for such a team, not the weighting.

### 4. Flagged deviation from design.md §T7, in the PRD's favour: "remaining picks" is draft-wide.

design.md §T7 step 4 names the field `remainingPicksInWindowIncludingThis`. Taken literally that
saturates every seat in every early-round window — two rounds into a draft each seat has an open K
*and* DST slot and owns one pick inside a ten-pick window, so `2 >= 1` fires for everyone and **no
player is ever drafted in any run**, making every survival 100%. The prior attempt implemented the
draft-wide reading; I verified it against the sources and kept it. Both authorities agree with it
over design.md's gloss: PRD FR-8 says "equal or exceed its **remaining picks**", rationale "so
late-round K/DST demand does not inflate apparent skill-player scarcity", and spec.md AC-47
repeats it unqualified. It is also the field FR-6 already publishes on every panel row. Two tests
pin the reading, including one against the live fixture board.

### 5. Deterministic seeding for tests — the approach the task asked me to flag.

Three layers, deliberately separated:

- `random: () => number` injection — fully determined runs, hand-checkable by eye (`() => 0` always
  takes the top available player).
- `seed: number` — reproducible sampling for the convergence fixtures, so a ±0.02 assertion is
  never a coin flip.
- **no override** — the production path, which §1 made deterministic-by-board. This is what the
  stability tests now exercise, so the default path is covered rather than only the pinned one.

`deriveSeed` is exported and tested directly for the non-vacuity that matters: same inputs → same
seed, but a changed board, a revised FR-7 reach profile, or a turned-down 🔶 knob → a different
seed. Without that test, a hard-coded constant seed would pass the stability guardrail while
quietly sampling one stream for every board in the draft.

## Test-first evidence

This was a resumed task, so the failing run is the inherited one — 6 tests already failing against
the implementation in the tree, which is the diagnosis the task asked for.

**failing (inherited, before any change):** `npm test -- montecarlo`

```
❯ src/simulation/montecarlo.test.ts (45 tests | 6 failed)
  × the position draw (AC-42) > samples straight from ADP order across positions when the team has no need signal
    → expected 0.448 to be close to 0.45454545454545453, received difference is 0.006545…, but expected 0.005
  × the position draw (AC-42) > falls back to best available when the drawn position has nobody left
    → expected 0.3281 to be close to 0.3333333333333333, received difference is 0.005233…, but expected 0.005
  × the reach-adjusted player draw (AC-42) > weights by 1/rank over the available players when the team’s reach is neutral
    → expected 0.4486 to be close to 0.45454545454545453, received difference is 0.005945…, but expected 0.005
  × the reach-adjusted player draw (AC-42) > flattens the top of the board for a team that reaches
    → expected 0.65955 to be close to 0.6666666666666666, received difference is 0.007116…, but expected 0.005
  × the reach-adjusted player draw (AC-42) > reads `reachAdjustmentPerPick` from config, never an inline 1
    → expected 0.4486 to be close to 0.45454545454545453, received difference is 0.005945…, but expected 0.005
  × simulation stability on an unchanged board (SC-2, §T7 done-when 2) > moves no player’s percentage across a band boundary between two runs
    → expected 'p3:coin-flip' to be 'p3:likely-available'
Tests  6 failed | 39 passed (45)
```

**failing (the new stability tests, written before the implementation changed):**
`npm test -- montecarlo`

```
❯ src/simulation/montecarlo.test.ts (48 tests | 3 failed)
  × … > moves no player’s percentage across a band boundary between two runs
    → expected 0.2985 to be 0.283 // Object.is equality
  × … > holds that guardrail on the whole matrix, not just the aggregates
    → expected [ 1, +0, 1, +0, … ] to deeply equal [ 1, +0, +0, +0, … ]
  × … > does not buy stability by ignoring the board — a changed input redraws the stream
    → deriveSeed is not a function
Tests  3 failed | 45 passed (48)
```

(The five tolerance assertions pass at this point — that change alone fixed them, confirming they
were a test defect and not an implementation one.)

**passing:** `npm test -- montecarlo` → `Test Files 1 passed (1) / Tests 49 passed (49)`
**passing:** `npm test` → `Test Files 25 passed (25) / Tests 390 passed (390)`

Commits: none — the orchestrator commits this task's tree.

## §T7 "done when", item by item

1. **Hand-verified aggregates on a fixture window+universe.** `a fixture window and universe (§T7
   done-when 1)`: three RB-needing teams over three RBs and two WRs — every RB at exactly 0%
   (`likely-gone`), every WR at exactly 1.0 (`likely-available`), no tolerance needed. The
   composed live-board test adds the same claim against the real traded-pick fixture.
2. **Stability test.** Rewritten per §1; now re-runs the full simulation twice on an identical
   fixture board through the production path and asserts identical bands, identical percentages,
   and an identical survivor matrix. A separate test keeps the Monte-Carlo-noise claim the run
   count actually buys (two independent seeds stay within 0.05 — a band's width).
3. **Benchmark.** `recompute latency (AC-46, §T7 done-when 3)`: universe 40, window 15, 2000 runs
   — measured **≈10 ms**, asserted under `insightRefreshLatencyMs / 5` = 1000 ms. Roughly **500×
   headroom** under the PRD's 5 s budget, so 🔶 `monteCarloRunCount` and 🔶 `simUniverseSize` (T1's
   designated turn-down knobs) need no turning down; the assertion is written against the
   configured budget rather than a magic millisecond count.

## Test-file changes

Three changes to the inherited `montecarlo.test.ts`, all flagged per the constitution:

1. **5 convergence assertions retargeted from `toBeCloseTo(x, 2)` (±0.005) to ±0.02.** Justified in
   §2: the assertions contradicted the tolerance the same file documents four lines above them, and
   ±0.005 is under 1.5 SE at 20k runs — a correct simulation fails it about one assertion in seven.
   The implementation was independently verified unbiased (400-seed probe, z ≈ 1.58) *before* this
   change was made, so the tolerance was widened to what the fixtures were sized for, not to what
   the code happened to produce. Two further assertions in the same class (`splits between
   positions…`, `re-ranks over what is still available…`) were passing but carried the same latent
   defect; converted with them for consistency.
2. **The stability test rewritten.** The old version ran two *different* seeds and asserted their
   bands matched. It contradicts design.md §T7 done-when (2), which asks for a re-run "on an
   identical fixture board" — two seeds are two different simulations, not a re-run — and it
   asserts something unachievable, as §1 measures. Replaced by the production-path re-run, plus two
   new tests (whole-matrix identity; `deriveSeed` non-vacuity), plus the surviving noise claim as
   its own test asserting on percentages rather than band labels.
3. **1 test added** pinning reach in the best-available regime (§3). No existing test changed.

Net: 45 → 49 tests. No test was deleted or weakened in what it claims about behaviour.

## Commands

- test: `npm test` → **exit 0** — 25 files, 390 tests passed (baseline: greenfield ENOENT, so no
  pre-existing failures to net against; every other suite was green before this task and is green
  after — 386 → 390 tests, +4 net from this file's 45 → 49).
- lint: `npm run lint` → **exit 0**, no warnings.
- typecheck: `npm run typecheck` → **exit 0** (shared, server, web).

## Left for downstream tasks (seams T7 exposes, deliberately unwired here)

- **T8** consumes `SurvivalProjection.survivors` via `survivedInRun(projection, run, playerId)` —
  AC-43's per-run sets, retained in full as a `runCount × universeSize` `Uint8Array` rather than
  collapsed to marginals, because AC-55's "best surviving rank at this position in this run" is a
  joint outcome that independent marginals cannot reconstruct. T8 also passes its candidate rows to
  `ensureIncluded` (AC-42's display extension) and reads `universe[].addedForDisplay` if it wants
  to know which rows were admitted only for that reason.
- **T10** calls `simulateSurvival` with no `seed` and no `random` — the deterministic-by-board path
  — on every burst-settled pick event, and owns AC-46's timing and the `recomputing` flag. Nothing
  in this module is stateful, so there is no cache for it to invalidate.
