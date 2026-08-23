import { PARAMETER_DEFAULTS } from './config/parameters';
import { POSITIONS, SKILL_POSITIONS } from './types/board';
import { NO_NEED_SIGNAL } from './types/roster';
import type { Position } from './types/board';
import type {
  FlexEligiblePositions,
  NeedVector,
  NoNeedSignal,
  SlotConfig,
  UnfilledStartingSlots,
} from './types/roster';

/**
 * The **need vector**, PRD §9 Terms, implemented once for everybody.
 *
 * FR-5 (the user's own needs), FR-6 (opponents), FR-7 (the bending input) and FR-8 (sampling)
 * all consume this module — nobody reimplements the math.
 */

export interface NeedVectorOptions {
  /**
   * Which positions may occupy a FLEX slot. Defaults to `flexEligiblePositions` from the
   * parameter defaults; callers holding a loaded config pass that config's value instead, so
   * a league with a non-standard FLEX still flows through this one code path.
   */
  flexEligiblePositions?: FlexEligiblePositions;
}

const zeroByPosition = (): Record<Position, number> => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
});

/**
 * How many starting slots a roster still has open, in count form.
 *
 * Fill model: a position's drafted players fill that position's dedicated slots first; any
 * surplus at a FLEX-eligible position then absorbs FLEX slots (up to how many exist); anything
 * left over is bench and contributes nothing. This is the count-shaped view FR-5's roster panel
 * displays raw (AC-31) and the input `computeNeedVector` turns into weights.
 */
export function computeUnfilledStartingSlots(
  slots: SlotConfig,
  filled: Record<Position, number>,
  options: NeedVectorOptions = {},
): UnfilledStartingSlots {
  const flexEligible = options.flexEligiblePositions ?? PARAMETER_DEFAULTS.flexEligiblePositions;

  const dedicated = zeroByPosition();
  let flexSurplus = 0;

  for (const position of POSITIONS) {
    const slotCount = slots[position];
    const filledCount = filled[position] ?? 0;
    dedicated[position] = Math.max(0, slotCount - filledCount);

    if ((flexEligible as readonly Position[]).includes(position)) {
      flexSurplus += Math.max(0, filledCount - slotCount);
    }
  }

  // Surplus can only ever consume the FLEX slots that actually exist; the rest is bench.
  const flex = Math.max(0, slots.FLEX - Math.min(slots.FLEX, flexSurplus));

  return { dedicated, flex };
}

/**
 * Per-position need weights for one team.
 *
 * - Each unfilled dedicated QB/RB/WR/TE slot contributes 1 to its position.
 * - Each unfilled FLEX slot contributes 1/(eligible positions) to each eligible position.
 * - K and DST contribute nothing, ever (🔶 AS-7) — they are tracked on the roster (AC-33) but
 *   carry no prediction weight, so an open K slot is not a need signal.
 *
 * Returns the {@link NO_NEED_SIGNAL} sentinel rather than a zero vector when nothing is open:
 * per Terms, such a team's simulated pick is drawn from ADP order in the best-available regime,
 * which is a different branch, not a degenerate distribution. Callers must branch on it.
 */
export function computeNeedVector(
  slots: SlotConfig,
  filled: Record<Position, number>,
  options: NeedVectorOptions = {},
): NeedVector | NoNeedSignal {
  const flexEligible = options.flexEligiblePositions ?? PARAMETER_DEFAULTS.flexEligiblePositions;
  const unfilled = computeUnfilledStartingSlots(slots, filled, options);

  const weights = zeroByPosition();

  for (const position of SKILL_POSITIONS) {
    weights[position] += unfilled.dedicated[position];
  }

  if (unfilled.flex > 0 && flexEligible.length > 0) {
    const share = unfilled.flex / flexEligible.length;
    for (const position of flexEligible) {
      weights[position] += share;
    }
  }

  const total = POSITIONS.reduce((sum, position) => sum + weights[position], 0);
  return total === 0 ? NO_NEED_SIGNAL : weights;
}

/**
 * Turns raw need weights into a sum-1 probability distribution.
 *
 * FR-6 displays this directly as each opponent's position likelihoods, prior to FR-7 bending
 * (AC-36); FR-7 takes it as the `needDist` input to the bend (AC-40).
 *
 * Throws on an all-zero vector: `computeNeedVector` never produces one, so receiving one means
 * a caller skipped the {@link NO_NEED_SIGNAL} branch, and silently returning NaNs (or a fake
 * uniform distribution) would launder that bug into the sampling math.
 */
export function normalizeToDistribution(vector: NeedVector): Record<Position, number> {
  const total = POSITIONS.reduce((sum, position) => sum + vector[position], 0);

  if (total <= 0) {
    throw new Error(
      'normalizeToDistribution received an all-zero need vector; callers must branch on the ' +
        `'${NO_NEED_SIGNAL}' sentinel (best-available regime) instead of normalizing it.`,
    );
  }

  const distribution = zeroByPosition();
  for (const position of POSITIONS) {
    distribution[position] = vector[position] / total;
  }
  return distribution;
}
