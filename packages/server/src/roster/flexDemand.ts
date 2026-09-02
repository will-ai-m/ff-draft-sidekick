/**
 * FLEX demand and the FLEX share — how a league's FLEX starters actually split across the
 * eligible positions (amended 2026-09-02).
 *
 * The need vector's original AS-5 split handed every eligible position an equal slice of each
 * open FLEX slot. Legally right, behaviourally wrong: a 10-team half-PPR room starts RB/WR at
 * FLEX almost without exception, and treating TE as an equal third of every FLEX seat is what
 * kept a second tight end in the user's plan set after TE1 was rostered and pitched Tucker Kraft
 * "for FLEX" at picks 63–68 of the 2026-09-02 league draft.
 *
 * One allocation now serves every consumer of "who fills FLEX": the need vector's `FlexShare`
 * (FR-5, FR-6, FR-8 — via the orchestrator), the plan cap's startable positions (FR-10), and the
 * bench phase's replacement ranks and `startShare` (FR-9), which already allocated FLEX this way.
 * League-wide FLEX starters are assigned one at a time to the eligible position whose next
 * player is worth most on this league's own scoring curve, so ordinary rooms send FLEX demand to
 * RB/WR without a hardcoded tactic, while a TE-premium or QB-eligible format earns a different
 * split from its actual scoring. With the 2026 half-PPR curves a 10-team RB2/WR2/TE1/FLEX1
 * league comes out RB 40% / WR 60% / TE 0% — beside the FFC market's own answer for the same
 * pool (excess starters inside the top 70 picks by ADP): RB 36% / WR 64% / TE 0%.
 */

import { SKILL_POSITIONS } from '@sidekick/shared';
import type { FlexEligiblePositions, FlexShare, SkillPosition, SlotConfig } from '@sidekick/shared';

export interface FlexDemandInput {
  slots: Pick<SlotConfig, SkillPosition | 'FLEX'>;
  teamCount: number;
  /** 🔶 AS-5 `flexEligiblePositions` — the league's legal FLEX set; the share only apportions it. */
  flexEligiblePositions: FlexEligiblePositions;
  /** Raw curve lookup, `PlayerValueModel.valueAt`: the rank-N finisher's pts/gm on this scoring. */
  valueAt: (position: SkillPosition, positionalRank: number) => number;
}

export interface FlexDemand {
  /** League-wide starting demand per position: dedicated slots × teams plus its FLEX allocation. */
  demand: Record<SkillPosition, number>;
  /** FLEX starters allocated to each position — every seat, priced or not. */
  flexAllocated: Record<SkillPosition, number>;
  /**
   * FLEX starters whose winning marginal player priced above 0, by position. A seat nobody's
   * curve can price (an empty or exhausted curve) still goes to the first eligible position in
   * `flexAllocated`, so the bench phase keeps a complete demand picture; it is left out here so
   * a share is never manufactured from no evidence.
   */
  pricedAllocated: Record<SkillPosition, number>;
  /** FLEX starters the league seats in total. */
  flexStarters: number;
  /** How many of those seats the curves could price. */
  priced: number;
}

/** League-wide starting demand with the FLEX starters allocated greedily by curve value. */
export function allocateFlexDemand(input: FlexDemandInput): FlexDemand {
  const teamCount = Math.max(0, Math.trunc(input.teamCount));
  const demand = Object.fromEntries(
    SKILL_POSITIONS.map((position) => [position, teamCount * Math.max(0, input.slots[position])]),
  ) as Record<SkillPosition, number>;
  const flexAllocated: Record<SkillPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const pricedAllocated: Record<SkillPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  const eligible = input.flexEligiblePositions.filter((position) =>
    SKILL_POSITIONS.includes(position),
  );
  const flexStarters = Math.max(0, Math.trunc(teamCount * input.slots.FLEX));

  let priced = 0;
  for (let seat = 0; seat < flexStarters && eligible.length > 0; seat += 1) {
    let winner = eligible[0]!;
    let winnerValue = input.valueAt(winner, demand[winner] + 1);
    for (const position of eligible.slice(1)) {
      const value = input.valueAt(position, demand[position] + 1);
      if (value > winnerValue) {
        winner = position;
        winnerValue = value;
      }
    }
    demand[winner] += 1;
    flexAllocated[winner] += 1;
    if (winnerValue > 0) {
      pricedAllocated[winner] += 1;
      priced += 1;
    }
  }

  return { demand, flexAllocated, pricedAllocated, flexStarters, priced };
}

/**
 * A curve lookup that does **not** clamp to the tail — the reading the FLEX share wants.
 *
 * `PlayerValueModel.valueAt` clamps a rank past the curve's end to its last entry, which is right
 * for pricing a deep player and wrong for asking who fills FLEX: a cache holding one RB season
 * would price RB21 at RB1's value and hand every FLEX seat to running backs. Here a rank the
 * curve never reaches prices at 0, so a curve that stops short of the FLEX band cannot decide the
 * share, and `deriveFlexShare` says so with null.
 */
export const unclampedCurveLookup =
  (curves: Record<SkillPosition, readonly number[]>): FlexDemandInput['valueAt'] =>
  (position, positionalRank) =>
    curves[position][Math.trunc(positionalRank) - 1] ?? 0;

/**
 * The FLEX share for this league, or null when the curves cannot decide — no FLEX seats to
 * allocate, or nothing priceable at any eligible position's marginal rank (a game-log cache too
 * shallow to reach the FLEX band; pass {@link unclampedCurveLookup}, not the value model's
 * clamped lookup). Callers fall back to the uniform AS-5 split and say so.
 */
export function deriveFlexShare(input: FlexDemandInput): FlexShare | null {
  const { pricedAllocated, priced } = allocateFlexDemand(input);
  if (priced === 0) return null;

  const share: Partial<Record<SkillPosition, number>> = {};
  for (const position of input.flexEligiblePositions) {
    if (SKILL_POSITIONS.includes(position)) share[position] = pricedAllocated[position] / priced;
  }
  return share;
}
