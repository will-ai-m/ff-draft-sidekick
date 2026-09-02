/**
 * When a simulated team spends a pick on a kicker or a defense — FR-8's AC-47, as amended
 * 2026-08-27 (the early window) and 2026-09-02 (the back-weighting).
 *
 * One rule, read two ways. `simulateSurvival` applies {@link kdstPickChance} per run, so a pick
 * spent on K/DST consumes no skill player (🔶 AS-7 — there is no K/DST universe to draw from).
 * The opponent panel reads the same rule as an expectation through {@link kdstPickLikelihoods},
 * so what the panel says about an opponent's next pick is what the simulation samples, never a
 * second opinion. Keeping the rule in its own module is what lets FR-6 import it without taking
 * a dependency on the whole simulation.
 *
 * **The model.** A team with `unfilled` K/DST starting slots and `remaining` picks left in the
 * draft must spend `unfilled` of those picks on K/DST. Outside its last `unfilled +
 * kdstEarlyPickWindow` picks it never does; at the deadline (`remaining <= unfilled`) it always
 * does — AC-47's original rule. In between, its pick `r` from the deadline carries weight
 * `kdstEarlyPickDecay^(r−1)` (1 for the last pick, then decaying outward), and the chance this
 * pick is one of the K/DST picks is `unfilled × weight(r) / Σ weight(1..r)`, capped at 1. A decay
 * of 1 is the uniform placement the 08-27 amendment shipped (`unfilled / remaining`).
 *
 * **Why back-weighted.** The uniform model put a third of every team's last six picks on K/DST.
 * The rooms on record are far more back-loaded — the 2026-09-02 league draft (10 humans) and two
 * completed bot-room mocks, 30 teams and 57 K/DST picks in all, spent them 70% / 70% / 13% /
 * 13% / 13% / 7% / 3% of teams at 1..7 picks from the end, using the middle rounds for skill
 * depth (the user's own reading of their league). Decay 0.5 over a 5-pick window reproduces
 * that shape (82 / 69 / 25 / 13 / 6 / 3 / 2 %; least-squares SSE 0.036 against 0.46 for the
 * uniform model), and the per-round marginals are printed in `kdstTiming.test.ts` so a re-fit
 * after the next rehearsal has its target stated.
 */

import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import type { ParameterValues } from '@sidekick/shared';

export type KdstTimingConfig = Pick<ParameterValues, 'kdstEarlyPickWindow' | 'kdstEarlyPickDecay'>;

/**
 * The probability one simulated pick is spent on K/DST.
 *
 * `decay` defaults to 1 — the uniform placement — so a caller holding only the window still gets
 * the 2026-08-27 rule; production passes 🔶 `kdstEarlyPickDecay`.
 */
export function kdstPickChance(
  unfilled: number,
  remaining: number,
  earlyWindow: number,
  decay = 1,
): number {
  if (unfilled <= 0) return 0;
  if (remaining <= unfilled) return 1;
  if (remaining > unfilled + Math.max(0, earlyWindow)) return 0;

  const rate = Math.min(1, Math.max(0, decay));
  if (rate >= 1) return Math.min(1, unfilled / remaining);

  // Geometric weights rate^(j−1) over the team's remaining picks, j = 1 being its very last.
  let total = 0;
  for (let j = 1; j <= remaining; j += 1) total += rate ** (j - 1);
  return Math.min(1, (unfilled * rate ** (remaining - 1)) / total);
}

/** What the expectation walk needs to know about one window pick. */
export interface KdstTimingPick {
  teamId: string;
  /** Unfilled dedicated K + DST starting slots. */
  unfilledKDstSlots: number;
  /** Picks this team still owns in the draft, counting this one. */
  remainingPicks: number;
}

/**
 * The marginal chance each window pick is spent on K/DST — the expectation of the per-run walk
 * `simulateSurvival` performs, computed analytically.
 *
 * Per team, a distribution over "how many K/DST slots are still open" is carried down the
 * team's picks in window order: a pick spent on K/DST leaves one slot fewer for the next, so a
 * team picking twice at a snake turn has a second-pick chance that depends on the first — the
 * same dependency the simulation replays run by run. Counters start from the team's first
 * window pick, exactly as the simulation seeds its own.
 */
export function kdstPickLikelihoods(
  picks: readonly KdstTimingPick[],
  config: KdstTimingConfig = PARAMETER_DEFAULTS,
): number[] {
  const states = new Map<string, { remaining: number; byUnfilled: Map<number, number> }>();

  return picks.map((pick) => {
    let state = states.get(pick.teamId);
    if (state === undefined) {
      state = {
        remaining: pick.remainingPicks,
        byUnfilled: new Map([[pick.unfilledKDstSlots, 1]]),
      };
      states.set(pick.teamId, state);
    }

    const next = new Map<number, number>();
    let likelihood = 0;
    for (const [unfilled, probability] of state.byUnfilled) {
      const chance = kdstPickChance(
        unfilled,
        state.remaining,
        config.kdstEarlyPickWindow,
        config.kdstEarlyPickDecay,
      );
      likelihood += probability * chance;
      if (chance > 0) {
        next.set(unfilled - 1, (next.get(unfilled - 1) ?? 0) + probability * chance);
      }
      if (chance < 1) {
        next.set(unfilled, (next.get(unfilled) ?? 0) + probability * (1 - chance));
      }
    }
    state.byUnfilled = next;
    state.remaining -= 1;
    return likelihood;
  });
}
