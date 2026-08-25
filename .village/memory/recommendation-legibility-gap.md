# Need-awareness is real but invisible — known gap, and what not to do about it

Source: `.work/001-draft-sidekick-v1/live-ops-notes.md` #11 (first real-user session).

## The symptom

The user read the recommendation as "just ECR" and expected to see roster-need weighting. Every
requirement shipped; the gate verdicts are correct. This is a requirements gap, not a defect.

## How need actually operates today

- Need **gates the plan set**: only positions with unfilled starters (FLEX-eligible included) can be
  a plan's now- or next-position.
- ECR rank **scores within that set**; shelf-collapse (a position's survivors thinning out) is what
  moves the highlight off the top-ECR player.
- Therefore: **early in the draft the plan set ≈ all positions**, so the highlight ≈ top ECR. And the
  **bench regime is pure ECR by design** — the locked raw-ECR value function, a PRD non-goal against
  blending or adjusting ECR.
- The reason line names the decisive factor by precedence (plan/survival → need → value → best
  available), so in the common case it reads "best available: <player> (ECR n)" and never says
  "need", even while need is operating.

## What is genuinely missing

No **slot-pressure / urgency term** anywhere in FR-5..FR-10: unfilled starters versus picks remaining
never enters the score. Need is a binary gate, never a weight.

## What to do — and not do

- **Do not** change the value function to blend or adjust ECR. That is an explicit PRD non-goal, and
  the bench-regime-is-pure-ECR behavior is intentional.
- **Do**, as a v1.1 pipeline task: a parameterized need-urgency weight (an AS-N knob, per the
  constitution's configurable-defaults rule) plus a richer reason line that states the need situation
  even when need was not the *decisive* factor.
- Related perception fix from the same session: stamp "as of Sleeper API, Xs ago" so the latency gap
  versus the websocket-fresh Sleeper room reads as upstream rather than as app slowness.

## The transferable lesson

For any feature whose output is a recommendation, ranking, or score: shipping the mechanism is not
shipping the perception. The spec needs at least one criterion for **legibility** — the output must
expose the factor that decided it, and the spec must name the regime in which the decisive factor is
invisible and say what is shown then. The PRD's only instrument here was SC-4 "felt-informedness", a
post-draft self-report with no in-pipeline proxy, so no gate could have caught this.
