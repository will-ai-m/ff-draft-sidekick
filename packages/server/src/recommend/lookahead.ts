/**
 * The two-pick lookahead plan — FR-10 (AC-54 … AC-60).
 *
 * "The recommendation optimizes the user's next two picks jointly, not the current pick in
 * isolation — and it, not a per-row rule, is what places FR-9's highlight." A **plan** is an
 * ordered pair of positions, `(now, next)`: what to take on the clock, and what to come back for
 * at the user's next turn. Every plan is scored as the sum of two overall-ECR-rank terms and the
 * lowest total wins (AC-55).
 *
 * ```
 * term1(now)         = the overall ECR rank of the best available player at `now`, present tense
 * term2(next | now)  = mean over Monte Carlo runs of the best surviving ECR rank at `next`
 * score              = term1 + term2                                            (lower wins)
 * ```
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
 * **`term2` excludes the player `term1` already spends — a flagged reading of AC-55, and the one
 * that makes FR-10 do its stated job.** AC-55's method clause says "per run, the best surviving
 * rank at that position", and design.md §T8 repeats it. Read with no exclusion, the score is
 * *separable*: `score(now, next) = term1(now) + term2(next)` with the two terms independent over
 * the full product of needed positions, so the winner's now-position is always `argmin term1` —
 * whatever the survival data says. Under that reading FR-10 could never move the highlight off the
 * best available player at a needed position, "optimizes the user's next two picks jointly" would
 * be false of its own implementation, and AC-51's **plan/survival** reason (defined as "the winning
 * plan moved the highlight off the overall top-ECR candidate") would be unreachable — as would
 * design.md §T8's own "done when", which requires a plan/survival-driven scenario and a
 * need-driven scenario to be *distinct* tests.
 *
 * The exclusion is the minimal repair, and it is what "the best available player at the plan's
 * next-position **at the user's next turn**" already means once the plan's own now-pick is taken
 * into account: an RB-now/RB-next plan cannot count the same running back at both ends. It bites
 * only when `now === next`; every cross-position plan is untouched, and the no-survivor rule
 * (below) then correctly penalises a run whose only survivor at that position was the one spent.
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

export type LookaheadConfig = Pick<
  ParameterValues,
  'planTotalTooCloseEcrRanks' | 'lookaheadMaxPicks'
>;

/**
 * How many of a position's available players count as its "shelf" in AC-57's separating fact
 * ("RB shelf: 2 of 5 likely gone by your next pick").
 *
 * A named module constant rather than a `parameters.ts` key, following FR-6's
 * `DEFAULT_EXAMPLES_PER_POSITION`: the PRD names no number here beyond the illustration in its own
 * example, and this is a display budget, not one of the 🔶 AS-N tuning knobs the constitution
 * requires be configurable.
 */
export const DEFAULT_SHELF_SIZE = 5;

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
 * rather than special-cased out; what keeps it honest is that its `term2` cannot count the player
 * `term1` spends (see the module header).
 */
export function enumeratePlans(
  positions: readonly SkillPosition[],
): { nowPosition: SkillPosition; nextPosition: SkillPosition }[] {
  return positions.flatMap((nowPosition) =>
    positions.map((nextPosition) => ({ nowPosition, nextPosition })),
  );
}

/**
 * The best available player at each skill position — `term1`, and AC-56's highlight.
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
 * The snapshot's last-ranked overall ECR rank (AC-55's no-survivor penalty is this + 1).
 *
 * Read over the whole snapshot including drafted players: it is a property of the rankings, not of
 * the board, so it stays put as the draft consumes players and a plan's penalty term cannot drift.
 */
export function worstOverallEcrRank(players: readonly PlanPlayer[]): number {
  let worst = 0;
  for (const player of players) {
    if (player.ecrRank !== null && player.ecrRank > worst) worst = player.ecrRank;
  }
  return worst;
}

/**
 * `term2` — the expected overall ECR rank of the best player still available at `position` when
 * the user's next turn arrives (AC-55).
 *
 * Computed from AC-43's per-run survivor sets: in each run, walk that position's universe members
 * in ECR order and take the first one that survived; average those across runs. A run in which
 * nobody at the position survived scores `noSurvivorRank` — the snapshot's last rank + 1 — which is
 * what makes an empty position a genuine penalty rather than a skipped run.
 *
 * `excludePlayerId` is the player the plan's now-pick already spends; see the module header for why
 * a same-position plan must not count him at both ends.
 */
export function expectedBestSurvivingRank(
  projection: SurvivalProjection,
  position: SkillPosition,
  noSurvivorRank: number,
  excludePlayerId?: string,
): number {
  const members = projection.universe
    .filter((player) => player.position === position && player.sleeperPlayerId !== excludePlayerId)
    .sort((a, b) => a.ecrRank - b.ecrRank);

  if (members.length === 0 || projection.runCount === 0) return noSurvivorRank;

  const width = projection.universe.length;
  let total = 0;
  for (let run = 0; run < projection.runCount; run += 1) {
    const base = run * width;
    let best = noSurvivorRank;
    for (const member of members) {
      if (projection.survivors[base + member.index] === 1) {
        best = member.ecrRank;
        break;
      }
    }
    total += best;
  }
  return total / projection.runCount;
}

const formatRank = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

interface Shelf {
  gone: number;
  size: number;
  expectation: number;
}

/**
 * How a position's shelf looks by the user's next turn — the raw material for AC-57's fact.
 *
 * Counts the top {@link DEFAULT_SHELF_SIZE} available players at the position that the simulation
 * marked `likely-gone`, and pairs it with that position's plain `term2` (no plan exclusion, since
 * the shelf is a fact about the board rather than about either plan).
 */
function readShelf(
  projection: SurvivalProjection,
  board: Pick<Board, 'players'>,
  position: SkillPosition,
  noSurvivorRank: number,
  shelfSize: number,
): Shelf {
  const shelf = projection.universe
    .filter(
      (player) =>
        player.position === position && board.players[player.sleeperPlayerId]?.drafted !== true,
    )
    .sort((a, b) => a.ecrRank - b.ecrRank)
    .slice(0, shelfSize);

  return {
    gone: shelf.filter(
      (player) => projection.survivalByPlayerId.get(player.sleeperPlayerId)?.band === 'likely-gone',
    ).length,
    size: shelf.length,
    expectation: expectedBestSurvivingRank(projection, position, noSurvivorRank),
  };
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
  /** Picks the user still owns in the draft, counting the one on the clock (AC-59). */
  userRemainingPicks: number;
  config: LookaheadConfig;
  shelfSize?: number;
  /**
   * The bench phase's plan positions (FR-9/FR-10 amendment, 2026-08-27): once the starters are
   * full, `needVector` is the no-need sentinel and AC-54's source runs dry — these are the
   * positions that still add bench value (FLEX-eligible ones, plus capped ones under their
   * roster cap), so the same joint two-pick scarcity scoring keeps working through the bench
   * rounds instead of ceding to raw-ECR best-available. Ignored while a need vector exists.
   */
  benchPositions?: readonly SkillPosition[];
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
 * `winner` is always the lowest *total*. AC-58's "fall back to the higher-ECR current pick" moves
 * the **highlight**, not the plan comparison the user is shown — the caller applies it, so the
 * displayed winner and alternative stay the two plans that were actually compared.
 */
export function comparePlans(input: ComparePlansInput): PlanComparison {
  const { projection, config } = input;

  // AC-59/AC-60. A suppressed projection means there is no next turn to look ahead to (AC-45).
  if (
    input.userRemainingPicks < config.lookaheadMaxPicks ||
    projection === null ||
    projection.suppressed
  ) {
    return noComparison(false);
  }

  const positions =
    input.needVector === NO_NEED_SIGNAL
      ? (input.benchPositions ?? [])
      : planPositions(input.needVector);
  const best = bestAvailableByPosition(input.players, input.board);
  // No position a plan may draw from that the board can still fill: the best-available regime,
  // not a plan. (Need phase: no unfilled starting slot; bench phase: every position capped.)
  if (positions.every((position) => !best.has(position))) return noComparison(true);

  const noSurvivorRank = worstOverallEcrRank(input.players) + 1;
  const expectations = new Map<string, number>();
  const expectation = (position: SkillPosition, excludePlayerId?: string): number => {
    const key = `${position}|${excludePlayerId ?? ''}`;
    const cached = expectations.get(key);
    if (cached !== undefined) return cached;
    const value = expectedBestSurvivingRank(projection, position, noSurvivorRank, excludePlayerId);
    expectations.set(key, value);
    return value;
  };

  const scored: Plan[] = enumeratePlans(positions)
    .flatMap((plan) => {
      const now = best.get(plan.nowPosition);
      if (now === undefined) return [];
      const term1 = now.ecrRank;
      const term2 = expectation(
        plan.nextPosition,
        plan.nextPosition === plan.nowPosition ? now.sleeperPlayerId : undefined,
      );
      return [{ ...plan, term1, term2, score: term1 + term2 }];
    })
    .sort(
      (a, b) =>
        a.score - b.score ||
        positionOrder(a.nowPosition) - positionOrder(b.nowPosition) ||
        positionOrder(a.nextPosition) - positionOrder(b.nextPosition),
    );

  const winner = scored[0];
  if (winner === undefined) return noComparison(true);
  const runnerUp = scored[1] ?? null;

  const tooClose =
    runnerUp !== null && runnerUp.score - winner.score <= config.planTotalTooCloseEcrRanks;

  // AC-57. What separates the two plans is which position each defers; when they defer the same
  // one, term1 alone separates them and there is no survival fact to name.
  let separatingFact: string | null = null;
  if (runnerUp !== null && runnerUp.nextPosition !== winner.nextPosition) {
    const shelfSize = input.shelfSize ?? DEFAULT_SHELF_SIZE;
    // The runner-up's deferred position is the shelf the winner is refusing to wait on.
    const thin = readShelf(
      projection,
      input.board,
      runnerUp.nextPosition,
      noSurvivorRank,
      shelfSize,
    );
    const deep = readShelf(projection, input.board, winner.nextPosition, noSurvivorRank, shelfSize);
    separatingFact =
      `${runnerUp.nextPosition} shelf: ${thin.gone} of ${thin.size} likely gone by your next pick ` +
      `(best back at ECR ${formatRank(thin.expectation)}); ` +
      `${winner.nextPosition}: ${deep.gone} of ${deep.size} (ECR ${formatRank(deep.expectation)}).`;
  }

  return { winner, runnerUp, separatingFact, tooClose, applicable: true };
}
