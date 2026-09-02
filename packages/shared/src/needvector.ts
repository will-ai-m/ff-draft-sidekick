import { PARAMETER_DEFAULTS } from './config/parameters';
import { POSITIONS, SKILL_POSITIONS, isSkillPosition } from './types/board';
import { NO_NEED_SIGNAL } from './types/roster';
import type { Position, SkillPosition } from './types/board';
import type {
  FlexEligiblePositions,
  FlexShare,
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
  /**
   * How open FLEX demand splits across the eligible positions (`FlexShare`, amended
   * 2026-09-02). Absent, every eligible position takes an equal share — the original AS-5
   * split. Production passes the share the orchestrator derived at attach from the league's own
   * scoring, which in a standard 10-team room leaves TE at 0: a second tight end is a bench
   * player there, not a FLEX candidate.
   */
  flexShare?: FlexShare;
}

const zeroByPosition = (): Record<Position, number> => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
});

const zeroBySkillPosition = (): Record<SkillPosition, number> => ({ QB: 0, RB: 0, WR: 0, TE: 0 });

/**
 * The effective FLEX split: `flexShare` restricted to the eligible positions and renormalised
 * to sum 1, or the uniform split when no share is supplied — or when the supplied one gives
 * every eligible position zero, since a FLEX slot nobody can fill is not an outcome anybody
 * intends. A position outside the eligible set never receives FLEX weight, whatever the share
 * says: eligibility is the league's rule, the share only apportions it.
 */
export function resolveFlexShare(
  flexEligible: FlexEligiblePositions,
  flexShare?: FlexShare,
): Record<SkillPosition, number> {
  const resolved = zeroBySkillPosition();
  if (flexEligible.length === 0) return resolved;

  let total = 0;
  if (flexShare !== undefined) {
    for (const position of flexEligible) {
      const weight = flexShare[position] ?? 0;
      if (Number.isFinite(weight) && weight > 0) {
        resolved[position] = weight;
        total += weight;
      }
    }
  }
  if (total > 0) {
    for (const position of flexEligible) resolved[position] /= total;
    return resolved;
  }

  for (const position of flexEligible) resolved[position] = 1 / flexEligible.length;
  return resolved;
}

/** The eligible positions that actually flex — those carrying a positive resolved share. */
export function flexingPositions(
  flexEligible: FlexEligiblePositions,
  flexShare?: FlexShare,
): SkillPosition[] {
  const share = resolveFlexShare(flexEligible, flexShare);
  return SKILL_POSITIONS.filter((position) => share[position] > 0);
}

/**
 * How many starting slots a roster still has open, in count form.
 *
 * Fill model: a position's drafted players fill that position's dedicated slots first; any
 * surplus at a position that flexes then absorbs FLEX slots (up to how many exist); anything
 * left over is bench and contributes nothing. This is the count-shaped view FR-5's roster panel
 * displays raw (AC-31) and the input `computeNeedVector` turns into weights.
 *
 * "Flexes" is the FLEX share's verdict, not the eligibility list's (amended 2026-09-02): a
 * second TE in a standard league is legally FLEX-eligible and practically a bench player, so it
 * leaves the FLEX seat open for the RB/WR that will actually hold it — the same reading the need
 * vector, the plan cap and the bench phase all take, so the four cannot disagree about what a
 * filled FLEX means.
 */
export function computeUnfilledStartingSlots(
  slots: SlotConfig,
  filled: Record<Position, number>,
  options: NeedVectorOptions = {},
): UnfilledStartingSlots {
  const flexEligible = options.flexEligiblePositions ?? PARAMETER_DEFAULTS.flexEligiblePositions;
  const share = resolveFlexShare(flexEligible, options.flexShare);

  const dedicated = zeroByPosition();
  let flexSurplus = 0;

  for (const position of POSITIONS) {
    const slotCount = slots[position];
    const filledCount = filled[position] ?? 0;
    dedicated[position] = Math.max(0, slotCount - filledCount);

    if (isSkillPosition(position) && share[position] > 0) {
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
 * - Each unfilled FLEX slot contributes its FLEX share to each eligible position — uniform
 *   1/(eligible positions) when no share is known, the league-scoring-derived split otherwise.
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
  const share = resolveFlexShare(flexEligible, options.flexShare);
  const unfilled = computeUnfilledStartingSlots(slots, filled, options);

  const weights = zeroByPosition();

  for (const position of SKILL_POSITIONS) {
    weights[position] += unfilled.dedicated[position];
  }

  if (unfilled.flex > 0) {
    for (const position of SKILL_POSITIONS) {
      weights[position] += unfilled.flex * share[position];
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
