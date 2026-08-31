/**
 * The two-pick lookahead plan — FR-10 (AC-54 … AC-60), scored in projected points since the
 * 2026-08-31 amendment.
 *
 * "The recommendation optimizes the user's next two picks jointly, not the current pick in
 * isolation — and it, not a per-row rule, is what places FR-9's highlight." A **plan** is an
 * ordered pair of positions, `(now, next)`: what to take on the clock, and what to come back for
 * at the user's next turn. Every plan is scored as the starter points it expects to bank and the
 * highest total wins (AC-55, amended 2026-08-31):
 *
 * ```
 * nowValue(now)        = shaded value of the best available player at `now`, present tense
 * nextValue(next|now)  = mean over Monte Carlo runs of the best surviving shaded value at `next`
 * fillValue(rest)      = expected shaded value of every other unfilled dedicated starting slot
 * score                = nowValue + nextValue + fillValue                       (higher wins)
 * ```
 *
 * where **shaded value** is FR-10's value model (`recommend/value.ts`): the league-scored
 * historical curve for the position, priced at each player's own shaded rank (tiers time the
 * urgency; they do not price). Two properties of that currency do the work rank sums could not:
 *
 *  - **Positional dropoff is priced.** The 08-31 rehearsal recommended Josh Allen (ECR 27) at
 *    pick 1 of a 1-QB league because `27 + E[best RB rank next]` tied `1 + E[best QB rank
 *    next]` — ranks made the elite-RB cliff and the flat QB shelf the same size. In points the
 *    QB plan forfeits the cliff and banks almost nothing: the QB curve is flat precisely where
 *    the RB curve is steep, which is also why real 1-QB rooms rarely spend a top-5 pick on a
 *    quarterback. No "no early QB" rule exists here; the curve is the rule.
 *  - **Waiting inside a tier is free; missing a tier's last member is not.** `nextValue` and the
 *    tier facts below read the same survivor matrix, so "Bowers/McBride/Loveland, then a pause
 *    before Warren" (overall tiers 2/3/3 → 4 on the 2026 board) shows up as: TE urgency spikes
 *    while the last tier-3 TE is likely to vanish, and relaxes the moment the tier breaks.
 *
 * Three things this module deliberately does not do:
 *
 *  - **It does not re-run the simulation.** FR-8's per-run survivor matrix (AC-43) is the input;
 *    this module reads it with `survivors[run][player]`, never marginal percentages combined as if
 *    independent, which is the whole reason T7 retains the matrix.
 *  - **It does not place the highlight.** It reports which plan won; `recommend/candidates.ts`
 *    turns that into a highlighted row and a reason line, so the AC-51 precedence lives in exactly
 *    one place.
 *  - **It does not re-derive the window.** `userRemainingPicks` and the projection arrive already
 *    computed from FR-6's window, so the off-by-one that Terms warns about is decided once, in
 *    `opponent/window.ts`.
 *
 * ---
 *
 * **`nextValue` excludes the player `nowValue` already spends — a flagged reading of AC-55, and
 * the one that makes FR-10 do its stated job.** Read with no exclusion the score is separable and
 * the winner's now-position is always `argmax nowValue`, whatever the survival data says; an
 * RB-now/RB-next plan cannot count the same running back at both ends. The exclusion bites only
 * when `now === next`; every cross-position plan is untouched.
 *
 * **A run with no surviving universe member at a position floors at the best available player
 * *outside* the simulation universe** (present tense — the simulation cannot draft outside its
 * universe, so such a player survives every run by construction), or 0 with nobody left at all.
 * The old `worst ECR + 1` penalty was an artifact amplifier: on the 08-31 trace it put ~90% of a
 * plan's total into fill-cost noise (fillCost 272 of score 301) because deep slots kept flooring
 * at rank ~940 whenever the 40-player universe ran dry of one position.
 */

import { NO_NEED_SIGNAL, SKILL_POSITIONS, isSkillPosition } from '@sidekick/shared';
import type {
  Board,
  NeedVector,
  NoNeedSignal,
  ParameterValues,
  Plan,
  PlanComparison,
  Position,
  SkillPosition,
} from '@sidekick/shared';

import type { SurvivalProjection } from '../simulation/montecarlo';
import { valueOf, tierOutlook } from './value';
import type { PlayerValueModel } from './value';

export type LookaheadConfig = Pick<
  ParameterValues,
  'planTotalTooClosePoints' | 'lookaheadMaxPicks' | 'flexEligiblePositions'
>;

/**
 * The shape of a snapshot player this module needs. Declared structurally and narrowly, as FR-4,
 * FR-6, FR-7 and FR-8 all do: T3's `MatchedPlayer` satisfies it without this module importing the
 * ingestion layer's full vocabulary.
 */
export interface PlanPlayer {
  sleeperPlayerId: string;
  playerName: string;
  position: Position;
  /** Overall ECR rank; null only on an ADP-only row (AC-50's K/DST fallback), never on a plan. */
  ecrRank: number | null;
}

/** A player who is on the board and carries an ECR rank — the only kind a plan can be built on. */
export type RankedPlayer<T extends PlanPlayer = PlanPlayer> = T & {
  position: SkillPosition;
  ecrRank: number;
};

const positionOrder = (position: SkillPosition): number => SKILL_POSITIONS.indexOf(position);

/** ECR order, with the player id breaking a tie so an unchanged board renders unchanged. */
const byEcrThenId = (a: RankedPlayer, b: RankedPlayer): number =>
  a.ecrRank - b.ecrRank || a.sleeperPlayerId.localeCompare(b.sleeperPlayerId);

/**
 * The positions a plan may be drawn from: the ones the user still needs (AC-54).
 *
 * Read off FR-5's need vector, **never** off whichever positions happen to appear among the
 * displayed candidates. K and DST carry no need weight by construction (🔶 AS-7), so they can
 * never enter a plan even if a caller hands them one.
 */
export function planPositions(needVector: NeedVector | NoNeedSignal): SkillPosition[] {
  if (needVector === NO_NEED_SIGNAL) return [];
  return SKILL_POSITIONS.filter((position) => needVector[position] > 0);
}

/**
 * Every ordered `(now, next)` pair over those positions — `now === next` included.
 *
 * A user with two unfilled RB slots genuinely has an RB-now/RB-next plan, so it is enumerated
 * rather than special-cased out; what keeps it honest is that its `nextValue` cannot count the
 * player `nowValue` spends (see the module header).
 */
export function enumeratePlans(
  positions: readonly SkillPosition[],
): { nowPosition: SkillPosition; nextPosition: SkillPosition }[] {
  return positions.flatMap((nowPosition) =>
    positions.map((nextPosition) => ({ nowPosition, nextPosition })),
  );
}

/**
 * The best available player at each skill position — the `nowValue` spend, and AC-56's highlight.
 *
 * A present-tense lookup against the board, not a simulated one: drafted players are filtered out
 * *before* ranking (AC-53), and a position with nobody left is simply absent from the map rather
 * than mapped to a placeholder.
 */
export function bestAvailableByPosition<T extends PlanPlayer>(
  players: readonly T[],
  board: Pick<Board, 'players'>,
): Map<SkillPosition, RankedPlayer<T>> {
  const best = new Map<SkillPosition, RankedPlayer<T>>();
  for (const player of players) {
    if (!isSkillPosition(player.position)) continue;
    if (player.ecrRank === null) continue;
    if (board.players[player.sleeperPlayerId]?.drafted === true) continue;

    const ranked = player as RankedPlayer<T>;
    const incumbent = best.get(ranked.position);
    if (incumbent === undefined || byEcrThenId(ranked, incumbent) < 0) {
      best.set(ranked.position, ranked);
    }
  }
  return best;
}

/**
 * The value floor per position for a run the universe ran dry: the best available player at the
 * position **outside** the simulation universe, tier-valued — such a player survives every run
 * by construction, since the simulation only drafts universe members. 0 when the whole board is
 * out of that position.
 */
export function outOfUniverseFloors(
  players: readonly PlanPlayer[],
  board: Pick<Board, 'players'>,
  projection: SurvivalProjection,
  model: PlayerValueModel,
): Record<SkillPosition, number> {
  const floors: Record<SkillPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
  for (const player of players) {
    if (!isSkillPosition(player.position) || player.ecrRank === null) continue;
    if (board.players[player.sleeperPlayerId]?.drafted === true) continue;
    if (projection.indexByPlayerId.has(player.sleeperPlayerId)) continue;
    const value = valueOf(model, player.sleeperPlayerId);
    if (value > floors[player.position]) floors[player.position] = value;
  }
  return floors;
}

/**
 * `nextValue` generalised to the k-th best survivor — what a roster with two unfilled slots at
 * one position actually faces: the second slot eats the second-best survivor. `k = 1` is AC-55's
 * own term. Per run, this position's universe members are walked in ECR order (which tier
 * monotone shading keeps aligned with value order) and the k-th survivor's value is taken; a run
 * with fewer than k survivors scores `floorValue`. `excludePlayerId` is the player the plan's
 * now-pick already spends.
 */
export function expectedKthBestSurvivingValue(
  projection: SurvivalProjection,
  model: PlayerValueModel,
  position: SkillPosition,
  k: number,
  floorValue: number,
  excludePlayerId?: string,
): number {
  const members = projection.universe
    .filter((player) => player.position === position && player.sleeperPlayerId !== excludePlayerId)
    .sort((a, b) => a.ecrRank - b.ecrRank);

  if (members.length === 0 || projection.runCount === 0 || k < 1) return floorValue;

  const width = projection.universe.length;
  let total = 0;
  for (let run = 0; run < projection.runCount; run += 1) {
    const base = run * width;
    let found = 0;
    let kth = floorValue;
    for (const member of members) {
      if (projection.survivors[base + member.index] === 1) {
        found += 1;
        if (found === k) {
          kth = valueOf(model, member.sleeperPlayerId);
          break;
        }
      }
    }
    total += kth;
  }
  return total / projection.runCount;
}

/**
 * The probability the position's current top tier still has a member at the user's next turn —
 * the joint, per-run reading (AC-57): the fraction of runs in which at least one currently
 * available member of the tier survived. A member outside the simulation universe survives every
 * run by construction, so a tier with one makes this 1 — honest, since the simulation cannot
 * draft that player.
 */
export function tierHoldProbability(
  projection: SurvivalProjection,
  board: Pick<Board, 'players'>,
  model: PlayerValueModel,
  position: SkillPosition,
): number | null {
  const groups = model.tierGroupsByPosition[position];
  const isAvailable = (playerId: string): boolean => board.players[playerId]?.drafted !== true;
  const current = groups.find((group) => group.memberIds.some(isAvailable));
  if (current === undefined) return null;

  const members = current.memberIds.filter(isAvailable);
  const indexes: number[] = [];
  for (const member of members) {
    const index = projection.indexByPlayerId.get(member);
    if (index === undefined) return 1; // Out-of-universe member: never drafted in any run.
    indexes.push(index);
  }
  if (indexes.length === 0 || projection.runCount === 0) return null;

  const width = projection.universe.length;
  let held = 0;
  for (let run = 0; run < projection.runCount; run += 1) {
    const base = run * width;
    if (indexes.some((index) => projection.survivors[base + index] === 1)) held += 1;
  }
  return held / projection.runCount;
}

const formatPoints = (value: number): string => value.toFixed(1);
const formatPercent = (probability: number): string => `${Math.round(probability * 100)}%`;

/**
 * AC-57's separating fact, tier-shaped (amended 2026-08-31): how one position's current tier is
 * expected to look by the user's next turn. Exported for FR-9's reason line, which cites the
 * same fact for the highlight's position so the sentence and the comparison can never disagree.
 */
export function tierFact(
  projection: SurvivalProjection,
  board: Pick<Board, 'players'>,
  model: PlayerValueModel,
  position: SkillPosition,
): string {
  const outlook = tierOutlook(model, board, position);
  if (outlook === null) return `${position}: nobody ranked left`;
  const hold = tierHoldProbability(projection, board, model, position);
  const holdText = hold === null ? '' : `, ${formatPercent(hold)} chance one lasts to your next pick`;
  const dropText =
    outlook.dropPerGame > 0 ? ` (next tier −${formatPoints(outlook.dropPerGame)} pts/gm)` : '';
  return (
    `${position} ${outlook.tierLabel}: ${outlook.remaining} of ${outlook.size} left` +
    `${holdText}${dropText}`
  );
}

export interface ComparePlansInput {
  /** The matched snapshot (T3), immutable for this draft's lifetime (AC-29). */
  players: readonly PlanPlayer[];
  /** The board, read only to exclude the players it already shows drafted (AC-53). */
  board: Pick<Board, 'players'>;
  /** FR-5's need vector **for the user** — the only source of plan positions (AC-54). */
  needVector: NeedVector | NoNeedSignal;
  /** FR-8's projection; null when no simulation ran. */
  projection: SurvivalProjection | null;
  /**
   * FR-10's value model, built once per attach from the snapshot and the league-scored curves.
   * Null when the game-log cache was never built: there is then no honest currency to score
   * plans in, so no plan is scored and the caller's best-available regime stands (the pre-draft
   * check says why).
   */
  valueModel: PlayerValueModel | null;
  /** Picks the user still owns in the draft, counting the one on the clock (AC-59). */
  userRemainingPicks: number;
  config: LookaheadConfig;
  /**
   * The bench phase's plan positions (FR-9/FR-10 amendment, 2026-08-27): once the starters are
   * full, `needVector` is the no-need sentinel and AC-54's source runs dry — these are the
   * positions that still add bench value, so the same joint two-pick scoring keeps working
   * through the bench rounds. Ignored while a need vector exists.
   */
  benchPositions?: readonly SkillPosition[];
  /**
   * The user's unfilled dedicated starting slots per skill position, for the fill-value term
   * (AC-55 as amended 2026-08-28/31) and the plan-pick starter cap below. Absent, plans score
   * by `nowValue + nextValue` alone, uncapped. K/DST slots are ignored here whatever the caller
   * passes (🔶 AS-7). Callers omit this in the bench phase — bench picks fill no starting slot,
   * so a zeroed slot picture would flatten every plan to 0 instead of comparing best players.
   */
  unfilledDedicatedSlots?: Partial<Record<SkillPosition, number>>;
  /**
   * The user's unfilled FLEX slots, alongside `unfilledDedicatedSlots`: a plan pick beyond a
   * position's dedicated slots still counts in full while a FLEX slot can start it (points
   * maximisation would otherwise bank two elite same-position starters against one slot — the
   * surplus pick rides the bench and must price at 0). Default 0.
   */
  unfilledFlexSlots?: number;
}

const noComparison = (applicable: boolean): PlanComparison => ({
  winner: null,
  runnerUp: null,
  separatingFact: null,
  tooClose: false,
  applicable,
});

/**
 * Score every plan and report the winner, the closest alternative and what separates them
 * (AC-55, AC-57, AC-58, AC-59).
 *
 * The comparison is skipped outright when the user has fewer than `lookaheadMaxPicks` picks left:
 * AC-59's "fewer than two picks remaining" and AC-60's "at most two of the user's picks ahead" are
 * the same 🔶 knob seen from both ends, so the bound is read from config rather than inlined — and
 * the enumeration above stays pair-shaped, so raising that knob needs this module extended, not
 * just retuned.
 *
 * `winner` is always the highest *total*. AC-58's near-tie fallback moves the **highlight**, not
 * the plan comparison the user is shown — the caller applies it, so the displayed winner and
 * alternative stay the two plans that were actually compared.
 */
export function comparePlans(input: ComparePlansInput): PlanComparison {
  const { projection, valueModel, config } = input;

  // AC-59/AC-60. A suppressed projection means there is no next turn to look ahead to (AC-45).
  if (
    input.userRemainingPicks < config.lookaheadMaxPicks ||
    projection === null ||
    projection.suppressed
  ) {
    return noComparison(false);
  }
  // No value model (game-log cache never built): no currency to score plans in. The comparison
  // stays "applicable" — the caller renders best-available rather than AC-59's "no next pick".
  if (valueModel === null) return noComparison(true);

  const positions =
    input.needVector === NO_NEED_SIGNAL
      ? (input.benchPositions ?? [])
      : planPositions(input.needVector);
  const best = bestAvailableByPosition(input.players, input.board);
  // No position a plan may draw from that the board can still fill: the best-available regime,
  // not a plan. (Need phase: no unfilled starting slot; bench phase: every position capped.)
  if (positions.every((position) => !best.has(position))) return noComparison(true);

  const floors = outOfUniverseFloors(input.players, input.board, projection, valueModel);
  const expectations = new Map<string, number>();
  const expectation = (position: SkillPosition, k: number, excludePlayerId?: string): number => {
    const key = `${position}|${k}|${excludePlayerId ?? ''}`;
    const cached = expectations.get(key);
    if (cached !== undefined) return cached;
    const value = expectedKthBestSurvivingValue(
      projection,
      valueModel,
      position,
      k,
      floors[position],
      excludePlayerId,
    );
    expectations.set(key, value);
    return value;
  };

  /**
   * The fill-value term (AC-55 as amended 2026-08-28, revalued 2026-08-31): the expected value
   * this plan can still bank for every *other* starting slot unfilled after its two picks —
   * dedicated slots priced at the expected j-th-best survivor of their position at the next
   * turn, then each open FLEX slot at the best remaining flex-eligible survivor. This is what
   * makes two open RB slots against a collapsing RB shelf outweigh a higher-value WR pair.
   *
   * FLEX **must** be priced for every plan symmetrically. The first cut priced only dedicated
   * slots ("FLEX fills itself from surplus"), and the 08-31 follow-up mock showed the hole: a
   * same-position double whose second pick overflowed into FLEX banked those points while every
   * other plan's open FLEX counted for nothing — a free ~10-point subsidy that made TE-now/
   * TE-next the standing pick-6 recommendation over the whole RB/WR board.
   *
   * Remaining deliberate approximations, documented in the PRD: next-turn expectations bound
   * slots further out, and K/DST never enter (🔶 AS-7 — the endgame guard owns them).
   */
  const fillValue = (
    plan: { nowPosition: SkillPosition; nextPosition: SkillPosition },
    nowPlayerId: string,
  ): number => {
    const unfilled = input.unfilledDedicatedSlots;
    if (unfilled === undefined) return 0;
    let value = 0;

    // Survivors already consumed at the next turn, per position: the plan's next pick, then
    // each priced dedicated slot. The flex pricing below continues the same counters, so no
    // survivor is ever counted for two slots.
    const consumed: Record<SkillPosition, number> = { QB: 0, RB: 0, WR: 0, TE: 0 };
    consumed[plan.nextPosition] += 1;

    let planOverflow = 0;
    for (const position of SKILL_POSITIONS) {
      const dedicated = unfilled[position] ?? 0;
      let planPicks = 0;
      if (plan.nowPosition === position) planPicks += 1;
      if (plan.nextPosition === position) planPicks += 1;
      planOverflow += Math.max(0, planPicks - dedicated);

      const slots = dedicated - planPicks;
      if (slots <= 0) continue;
      const exclude = plan.nowPosition === position ? nowPlayerId : undefined;
      for (let j = 1; j <= slots; j += 1) {
        consumed[position] += 1;
        value += expectation(position, consumed[position], exclude);
      }
    }

    // Open FLEX slots the plan's own overflow has not claimed, each greedily priced at the best
    // remaining flex-eligible survivor.
    const flexOpen = Math.max(0, (input.unfilledFlexSlots ?? 0) - planOverflow);
    for (let slot = 0; slot < flexOpen; slot += 1) {
      let bestValue = 0;
      let bestPosition: SkillPosition | null = null;
      for (const position of config.flexEligiblePositions) {
        const exclude = plan.nowPosition === position ? nowPlayerId : undefined;
        const candidate = expectation(position, consumed[position] + 1, exclude);
        if (candidate > bestValue) {
          bestValue = candidate;
          bestPosition = position;
        }
      }
      if (bestPosition === null) break;
      consumed[bestPosition] += 1;
      value += bestValue;
    }
    return value;
  };

  /**
   * How many of a plan's picks at `position` can actually start: the dedicated slots plus, for a
   * FLEX-eligible position, the open FLEX slots. Uncapped with no slot picture (the caller either
   * predates the amendment or is the bench phase, where nothing starts and raw values compare).
   */
  const starterCapacity = (position: SkillPosition): number => {
    if (input.unfilledDedicatedSlots === undefined) return Number.POSITIVE_INFINITY;
    const flex = config.flexEligiblePositions.includes(position)
      ? Math.max(0, input.unfilledFlexSlots ?? 0)
      : 0;
    return (input.unfilledDedicatedSlots[position] ?? 0) + flex;
  };

  const scored: Plan[] = enumeratePlans(positions)
    .flatMap((plan) => {
      const now = best.get(plan.nowPosition);
      if (now === undefined) return [];
      // A pick past the position's startable capacity is a bench pick and prices at 0 — points
      // maximisation would otherwise double-bank an elite position against a single slot.
      const nowValue =
        starterCapacity(plan.nowPosition) >= 1 ? valueOf(valueModel, now.sleeperPlayerId) : 0;
      const nextStartable =
        starterCapacity(plan.nextPosition) >= (plan.nextPosition === plan.nowPosition ? 2 : 1);
      const nextValue = nextStartable
        ? expectation(
            plan.nextPosition,
            1,
            plan.nextPosition === plan.nowPosition ? now.sleeperPlayerId : undefined,
          )
        : 0;
      const remainder = fillValue(plan, now.sleeperPlayerId);
      return [
        { ...plan, nowValue, nextValue, fillValue: remainder, score: nowValue + nextValue + remainder },
      ];
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        positionOrder(a.nowPosition) - positionOrder(b.nowPosition) ||
        positionOrder(a.nextPosition) - positionOrder(b.nextPosition),
    );

  const winner = scored[0];
  if (winner === undefined) return noComparison(true);
  const runnerUp = scored[1] ?? null;

  const tooClose =
    runnerUp !== null && winner.score - runnerUp.score <= config.planTotalTooClosePoints;

  // AC-57. What separates the two plans is which position each defers; when they defer the same
  // one, nowValue alone separates them and there is no survival fact to name.
  let separatingFact: string | null = null;
  if (runnerUp !== null && runnerUp.nextPosition !== winner.nextPosition) {
    // The runner-up's deferred position is the tier the winner is refusing to wait on.
    separatingFact =
      `${tierFact(projection, input.board, valueModel, runnerUp.nextPosition)}. ` +
      `${tierFact(projection, input.board, valueModel, winner.nextPosition)}.`;
  }

  return { winner, runnerUp, separatingFact, tooClose, applicable: true };
}
