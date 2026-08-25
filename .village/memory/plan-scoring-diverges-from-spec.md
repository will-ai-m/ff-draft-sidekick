# The lookahead's `term2` exclusion is deliberate — do not "fix" it back to the spec

## The divergence

`prd/draft-sidekick/prd.md` FR-10 bullet 2 and `.work/001-draft-sidekick-v1/spec.md:96` (AC-55) both
state the plan score as: rank of the best available at the plan's now-position **plus** the expected
rank of the best available at the plan's next-position. The shipped code
(`packages/server/src/recommend/lookahead.ts`) additionally **excludes the plan's own now-pick from
the `term2` lookup, but only when `nextPosition === nowPosition`.**

## Why the literal formula is dead

With `term2` a function of `next` alone, `score(now, next) = f(now) + g(next)` is separable, so
`argmin` factorises and the winning plan's now-position is always `argmin f` — the plain
best-available-at-a-needed-position pick, for **every** possible survivor matrix. Three consequences
follow from the primary sources:

- FR-9's `plan/survival` reason ("the winning plan moved the highlight off the overall top-ECR
  candidate") becomes unreachable — dead code, and a duplicate of the `need` reason.
- FR-10's own headline ("optimizes the user's next two picks jointly") is false of its own formula.
- AC-56 degenerates to "highlight the best available player at a needed position".

The exclusion encodes what "at the user's next turn" already means once the plan's own now-pick is
spent: an RB-now/RB-next plan cannot take the same back twice. Cross-position plans are bit-for-bit
identical to the literal reading. AC-55's no-survivor penalty (snapshot's last rank + 1) then
correctly prices a position whose only survivor was the one already spent.

Recorded and independently re-derived at the spec_review gate (`review-spec.md` @ `5e25747`,
ruling 1); flagged first by the developer in `dev-notes-T8.md` §1.

## What to do about it

- **The documents are still wrong.** AC-55 and PRD FR-10 bullet 2 should say `term2` is computed over
  the position's players *excluding the plan's own now-pick*. Until they are edited, a future
  maintainer reconciling code to spec will silently re-kill FR-10.
- Reachability is pinned by test: `candidates.test.ts` produces `reasonKind: 'plan-survival'` in one
  case and `'need'` in another. If both ever collapse to `'need'`, the exclusion has been reverted.

## Two sibling spec defects recorded in the same pass

- **AC-36 vs AC-40** never says which one scopes derivation and which scopes display. The shipped
  panel satisfies both by rendering `RB 50% → 60%` (need value, then tendency-bent value) rather than
  overwriting one with the other. Keep both numbers.
- **No AC covers the `recomputing` flag clearing after a content-free re-ingest.** A degraded→healthy
  recovery with no new pick bumps `boardVersion` without arming a recompute, so the header reads
  RECOMPUTING and all panels dim until the next pick or a manual Re-sync. AC-21 holds (nothing stale
  is shown as current) but a user on the clock sees dimmed panels at the worst moment. Confirmed live;
  queued as a product fix, not a spec violation.
