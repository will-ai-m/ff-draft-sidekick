/**
 * FR-10's positional value model (AC-55 as amended 2026-08-31) — the currency the plan
 * comparison spends, replacing raw ECR-rank sums.
 *
 * Why rank sums had to go: on the 08-31 rehearsal board, `QB now (ECR 27) + RB next` totalled
 * within noise of `RB now (ECR 1) + QB next`, and the tiebreak sent Josh Allen out as the pick-1
 * recommendation. Rank arithmetic treats the 26 ranks between Gibbs and Allen as the same
 * quantity as the 26 between ECR 100 and 126 — but the first gap is several starter points per
 * game and the second is noise. Plans must spend points, not ranks.
 *
 * The model prices every skill player in **projected points per game**, built from two inputs
 * the app already ingests:
 *
 *  1. **Historical positional value curves** (`GameLogStore.positionalPointCurves`): what the
 *     rank-N finisher at each position has actually been worth in this league's own scoring.
 *     The curve shape is what makes a 1-QB league wait on quarterbacks with no hardcoded rule —
 *     the QB curve is flat across its first dozen ranks while the RB/WR curves fall off a
 *     cliff, so burning an early pick on a QB buys almost nothing over the QB available three
 *     rounds later. A superflex league (out of scope for the current slot model, which reads no
 *     `slots_super_flex`) would invert that automatically once its slots are ingested.
 *
 *  2. **FantasyPros positional tiers** (FR-4's `tier`, sourced from each position's own cheat
 *     sheet since 2026-09-01 — the overall board's cross-position tiers are ignored). They are
 *     the expert consensus on where each position's run pauses *this season* — the 2026 TE page
 *     holds Bowers/McBride/Loveland/Warren as one Tier 1, where the overall board sliced them
 *     2/3/3/4. Tiers govern **timing**: the hold probability and next-tier-drop facts FR-10's
 *     reason line and AC-57's separating fact cite.
 *
 * **Pricing is by a player's own positional rank, shaded down; tiers time, they do not price.**
 * The first cut of this model priced every tier member at the group's mean, and the 08-31
 * follow-up mock showed why that inverts the incentive: a deep tier's front runner (RB Tier 1,
 * five members, mean 18.05) appeared to gain nothing over waiting for the tier's tail, while a
 * singleton tier (Brock Bowers, 12.86) kept its full peak — so the engine opened TE-now at pick
 * 6 and put no RB in three rounds of recommendations. Instead each player is priced at the mean
 * of the curve over `[rank, rank + rankShadingRanks]` — their own shelf, shaded toward the
 * finishers just below them, which acknowledges that the rank-N player by draft-day consensus
 * usually finishes at or below N (the bust discount, strongest exactly at thin-position peaks
 * like TE1/QB1 whose curve entries are the best seasons anyone had).
 *
 * The model is built once per attach — snapshot and scoring are immutable per draft (AC-29) —
 * and read by every recompute. K and DST never enter it (🔶 AS-7).
 */

import { SKILL_POSITIONS, isSkillPosition } from '@sidekick/shared';
import type { Board, Position, SkillPosition } from '@sidekick/shared';

/** The snapshot fields the model reads. T3's `MatchedPlayer` satisfies it as-is. */
export interface ValueModelPlayer {
  sleeperPlayerId: string;
  playerName: string;
  position: Position;
  /** Overall ECR rank; a null-ranked row (AC-50's ADP-only case) never enters the model. */
  ecrRank: number | null;
  /** The player's positional tier (FR-4, amended 2026-09-01); null groups as a singleton tier. */
  tier: number | null;
}

/** One contiguous run of same-tier players at one position, in positional-ECR order. */
export interface TierGroup {
  position: SkillPosition;
  /** FantasyPros' tier number, or null for an untiered singleton. */
  tier: number | null;
  /** 1-based positional ranks this group spans (inclusive). */
  startRank: number;
  endRank: number;
  /** Mean of the members' shaded values, in proj pts/gm — what the next-tier drop is quoted in. */
  value: number;
  /** Member ids in positional-ECR order. */
  memberIds: string[];
}

export interface PlayerValueModel {
  /** Shaded own-rank projected pts/gm per skill player id. */
  pointsByPlayerId: Map<string, number>;
  /** The tier group each skill player belongs to. */
  tierGroupByPlayerId: Map<string, TierGroup>;
  /** Each position's tier groups, best first. */
  tierGroupsByPosition: Record<SkillPosition, TierGroup[]>;
  /** Raw curve lookup, clamped to the curve's tail (0 past the end of an empty curve). */
  valueAt(position: SkillPosition, positionalRank: number): number;
}

const curveAt = (curve: readonly number[], positionalRank: number): number => {
  if (curve.length === 0) return 0;
  const index = Math.min(curve.length - 1, Math.max(0, Math.trunc(positionalRank) - 1));
  return curve[index]!;
};

/** Mean of the curve over `[rank, rank + shading]` — the bust-shaded price of the rank-N slot. */
/**
 * Mean of the curve over `[rank, rank + shading]`, **clamped to `maxRank`** — the bust-shaded
 * price of the rank-N slot.
 *
 * The clamp is what keeps the shading from importing a cliff into the price of the player
 * standing on top of it (amended 2026-09-01). Callers pass the player's own tier's last rank:
 * within a tier consensus calls the members interchangeable, so averaging across them is the
 * honest bust discount, but averaging *across a tier boundary* prices a tier's last member as
 * though he were already partly the tier below. On the 2026 TE board that discounted Tyler
 * Warren — the last Tier 1 TE, sitting above a 1.6 pts/gm drop — from 9.9 to 9.5, erasing a
 * third of the very cliff the recommendation is supposed to notice (rehearsal #8).
 */
const shadedCurveAt = (
  curve: readonly number[],
  positionalRank: number,
  shading: number,
  maxRank = Number.POSITIVE_INFINITY,
): number => {
  if (curve.length === 0) return 0;
  const span = Math.max(
    0,
    Math.min(Math.trunc(shading), Math.max(0, maxRank - positionalRank)),
  );
  let sum = 0;
  for (let offset = 0; offset <= span; offset += 1) {
    sum += curveAt(curve, positionalRank + offset);
  }
  return sum / (span + 1);
};

export interface ValueModelOptions {
  /**
   * How many ranks below their own a player's price is averaged over (the bust discount).
   * 0 prices at the raw curve entry; the default 2 spreads TE1's one-great-season peak over
   * TE1–TE3. Not a 🔶 AS-N knob — it is the model's own shape, pinned here and in its tests.
   */
  rankShadingRanks?: number;
}

const DEFAULT_RANK_SHADING = 2;

/**
 * Builds the per-draft value model from the matched snapshot plus the league-scored curves.
 *
 * Positional order is derived from overall ECR within the position (never FantasyPros'
 * sometimes-gappy `pos_rank` strings), and tier groups are **contiguous runs** of the same tier
 * in that order — so even a snapshot with a tier oddity (a lower tier ranked above a higher
 * one) degrades to smaller groups rather than folding distant players together.
 */
export function buildPlayerValueModel(
  players: readonly ValueModelPlayer[],
  curves: Record<SkillPosition, readonly number[]>,
  options: ValueModelOptions = {},
): PlayerValueModel {
  const shading = options.rankShadingRanks ?? DEFAULT_RANK_SHADING;
  const pointsByPlayerId = new Map<string, number>();
  const tierGroupByPlayerId = new Map<string, TierGroup>();
  const tierGroupsByPosition: Record<SkillPosition, TierGroup[]> = {
    QB: [],
    RB: [],
    WR: [],
    TE: [],
  };

  for (const position of SKILL_POSITIONS) {
    const ranked = players
      .filter(
        (player): player is ValueModelPlayer & { ecrRank: number } =>
          player.position === position && player.ecrRank !== null,
      )
      .sort((a, b) => a.ecrRank - b.ecrRank || a.sleeperPlayerId.localeCompare(b.sleeperPlayerId));

    const curve = curves[position];
    let index = 0;
    while (index < ranked.length) {
      const tier = ranked[index]!.tier;
      let end = index;
      // A null tier never merges: an untiered row is its own step, not part of a run.
      while (tier !== null && end + 1 < ranked.length && ranked[end + 1]!.tier === tier) end += 1;

      const startRank = index + 1;
      const endRank = end + 1;
      let sum = 0;
      for (let rank = startRank; rank <= endRank; rank += 1) {
        sum += shadedCurveAt(curve, rank, shading, endRank);
      }
      const group: TierGroup = {
        position,
        tier,
        startRank,
        endRank,
        value: sum / (endRank - startRank + 1),
        memberIds: ranked.slice(index, end + 1).map((player) => player.sleeperPlayerId),
      };

      tierGroupsByPosition[position].push(group);
      group.memberIds.forEach((member, offset) => {
        tierGroupByPlayerId.set(member, group);
        // Priced at the member's own shaded rank — never the group mean (see the module header),
        // and never shaded past their own tier's last rank (see `shadedCurveAt`).
        pointsByPlayerId.set(
          member,
          shadedCurveAt(curve, startRank + offset, shading, endRank),
        );
      });
      index = end + 1;
    }
  }

  return {
    pointsByPlayerId,
    tierGroupByPlayerId,
    tierGroupsByPosition,
    valueAt: (position, positionalRank) => curveAt(curves[position], positionalRank),
  };
}

/** A player's shaded own-rank value, or 0 for one the model never saw (K/DST, unranked rows). */
export function valueOf(model: PlayerValueModel, playerId: string): number {
  return model.pointsByPlayerId.get(playerId) ?? 0;
}

/**
 * How one position's current top tier looks from the clock — the fact FR-10's reason line and
 * AC-57's separating fact both cite (amended 2026-08-31).
 */
export interface TierOutlook {
  position: SkillPosition;
  /** "Tier 3", or "the top group" when the snapshot left the players untiered. */
  tierLabel: string;
  /** Available members of the current top tier group, right now. */
  remaining: number;
  /** The group's total membership, drafted and not. */
  size: number;
  /** The step down to the next tier group that still has an available member, in proj pts/gm. */
  dropPerGame: number;
}

/**
 * The current top tier group at a position — the group of its best available player — plus the
 * size of the step below it. Returns null when the position has nobody left in the model.
 */
export function tierOutlook(
  model: PlayerValueModel,
  board: Pick<Board, 'players'>,
  position: SkillPosition,
): TierOutlook | null {
  const isAvailable = (playerId: string): boolean =>
    board.players[playerId]?.drafted !== true;

  const groups = model.tierGroupsByPosition[position];
  const currentIndex = groups.findIndex((group) => group.memberIds.some(isAvailable));
  if (currentIndex < 0) return null;

  const current = groups[currentIndex]!;
  const next = groups.slice(currentIndex + 1).find((group) => group.memberIds.some(isAvailable));

  return {
    position,
    tierLabel: current.tier === null ? 'the top group' : `Tier ${current.tier}`,
    remaining: current.memberIds.filter(isAvailable).length,
    size: current.memberIds.length,
    // With no live tier below there is no step to quote — 0, not the tier's whole value, so the
    // reason line's "(next tier −X pts/gm)" clause simply drops off at the bottom of the board.
    dropPerGame: next === undefined ? 0 : Math.max(0, current.value - next.value),
  };
}

/** Convenience guard for callers holding a possibly-K/DST position. */
export function skillTierOutlook(
  model: PlayerValueModel,
  board: Pick<Board, 'players'>,
  position: Position,
): TierOutlook | null {
  return isSkillPosition(position) ? tierOutlook(model, board, position) : null;
}
