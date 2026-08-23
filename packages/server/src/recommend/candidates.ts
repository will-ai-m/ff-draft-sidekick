/**
 * The candidate list and its one highlighted recommendation — FR-9 (AC-49 … AC-53), composed with
 * FR-10's plan comparison.
 *
 * "The primary panel is a short ranked list of the best available players with the recommended pick
 * highlighted — the user examines, the Sidekick recommends, the user decides." The two requirements
 * are implemented together on purpose: per the PRD, "the list is the primary surface, and its
 * highlight is FR-10's output, not an independent second opinion." So there is **one** resolver
 * here, not three rules that could each print a line at the same time.
 *
 * The composed order, top to bottom:
 *
 *  1. **FR-10 places the highlight.** `comparePlans` scores the plans; the highlight is the
 *     highest-ECR available player at the winning plan's now-position (AC-56). When the top two
 *     totals are too close to separate, the highlight falls back to the higher-ECR of the two now-
 *     positions instead (AC-58) — the comparison the user is *shown* still reports the real winner.
 *  2. **The reason line names the single decisive factor**, by AC-51's precedence: plan/survival,
 *     then need, then value, else best available.
 *  3. **The cross-position within-noise test runs last**, on whatever highlight step 1 resolved. It
 *     never moves the highlight — it only rewrites the line (AC-52), merging with FR-10's near-tie
 *     statement so exactly one tie statement is ever rendered.
 *
 * Two things this module does not do:
 *
 *  - **It does not re-sort the board.** FantasyPros' overall ECR is the ordering, raw (🔶 AS-8),
 *    including the measured QB-vs-market skew; the per-row ADP column is the disclosure, and no
 *    blending is applied anywhere.
 *  - **It does not accumulate.** Like every other insight module here, the list is a pure function
 *    of the current board plus the immutable snapshot, so it cannot drift from the picks it was
 *    built from and AC-53's "re-highlight within 5 s" is the orchestrator's timing question (§T10).
 *
 * **Call order for the caller (§T10):** `candidateSimulationIds` first, pass that set to
 * `simulateSurvival`'s `ensureIncluded` (AC-42), then `computeCandidateList` with the projection
 * that comes back. Getting it backwards is not a crash — rows outside the universe simply carry no
 * survival number — but it silently costs AC-49 the survival column on some rows.
 */

import { isSkillPosition } from '@sidekick/shared';
import type {
  Board,
  CandidateListData,
  CandidateRow,
  DraftWindow,
  HighlightReasonKind,
  NeedVector,
  NoNeedSignal,
  ParameterValues,
  Position,
  Survival,
} from '@sidekick/shared';

import type { SurvivalProjection } from '../simulation/montecarlo';
import { bestAvailableByPosition, comparePlans, planPositions } from './lookahead';

export type CandidateListConfig = Pick<
  ParameterValues,
  | 'candidateListDefaultRows'
  | 'valueThresholdAdpPicksEarlier'
  | 'nearTieSurvivalPct'
  | 'nearTieEcrRanks'
  | 'planTotalTooCloseEcrRanks'
  | 'lookaheadMaxPicks'
>;

/**
 * The shape of a snapshot player this module needs. Structural and narrow, as every other insight
 * module here declares its input: T3's `MatchedPlayer` satisfies it as-is.
 */
export interface CandidatePlayer {
  sleeperPlayerId: string;
  playerName: string;
  position: Position;
  team: string | null;
  /**
   * Overall ECR rank. **Null only** on a row the ECR snapshot does not carry at all — AC-50's
   * "falling back to ADP order when the snapshot carries no K/DST rankings". Such a row can appear
   * in a K/DST filter and nowhere else: the list proper is ECR-ordered, so an unranked player has
   * no place in it.
   */
  ecrRank: number | null;
  positionalRank: number | null;
  adp: number | null;
}

/** An available player carrying an ECR rank — the only kind the ECR-ordered list can show. */
type RankedCandidate = CandidatePlayer & { ecrRank: number };

const isDrafted = (board: Pick<Board, 'players'>, playerId: string): boolean =>
  board.players[playerId]?.drafted === true;

/**
 * Available players in raw ECR order (🔶 AS-8) — drafted ones removed **before** ranking, never
 * after (AC-53), so a drafted player can never occupy a row or be named as the recommendation.
 */
export function availableInEcrOrder(
  players: readonly CandidatePlayer[],
  board: Pick<Board, 'players'>,
): RankedCandidate[] {
  return players
    .filter(
      (player): player is RankedCandidate =>
        player.ecrRank !== null && !isDrafted(board, player.sleeperPlayerId),
    )
    .sort((a, b) => a.ecrRank - b.ecrRank || a.sleeperPlayerId.localeCompare(b.sleeperPlayerId));
}

export interface CandidateSimulationIdsInput {
  players: readonly CandidatePlayer[];
  board: Pick<Board, 'players'>;
  config: Pick<CandidateListConfig, 'candidateListDefaultRows'>;
}

/**
 * The ids FR-8's universe must cover — AC-42's "extended to cover every player displayed in a
 * skill-position candidate-list row", handed to `simulateSurvival`'s `ensureIncluded`.
 *
 * Two groups, both knowable before any survival number exists (which is what breaks the
 * circularity: the rows need survival, and survival needs to know the rows):
 *
 *  - the default rows, which are pure ECR order; and
 *  - the best available player at each skill position — every player FR-10 can possibly highlight
 *    (AC-56) and every player AC-52's cross-position comparison can possibly name.
 *
 * K and DST are never named: they are excluded from the simulation by construction (🔶 AS-7).
 */
export function candidateSimulationIds(input: CandidateSimulationIdsInput): string[] {
  const available = availableInEcrOrder(input.players, input.board);
  const ids = new Set<string>();

  for (const player of available.slice(0, input.config.candidateListDefaultRows)) {
    if (isSkillPosition(player.position)) ids.add(player.sleeperPlayerId);
  }
  for (const best of bestAvailableByPosition(input.players, input.board).values()) {
    ids.add(best.sleeperPlayerId);
  }
  return [...ids];
}

/**
 * A player's survival, or null when there is none to show: K/DST carry no survival math at all
 * (🔶 AS-7), the projection is suppressed when the user has no next pick (AC-45), and a player the
 * simulation never covered has no number rather than a zero.
 */
const survivalOf = (
  projection: SurvivalProjection | null,
  player: CandidatePlayer,
): Survival | null => {
  if (projection === null || projection.suppressed) return null;
  if (!isSkillPosition(player.position)) return null;
  return projection.survivalByPlayerId.get(player.sleeperPlayerId) ?? null;
};

const toRow = (
  player: CandidatePlayer,
  projection: SurvivalProjection | null,
  addedForHighlight: boolean,
): CandidateRow => ({
  playerId: player.sleeperPlayerId,
  playerName: player.playerName,
  position: player.position,
  team: player.team,
  ecrRank: player.ecrRank,
  positionalRank: player.positionalRank,
  adp: player.adp,
  survival: survivalOf(projection, player),
  addedForHighlight,
});

export interface FilterCandidateRowsInput {
  players: readonly CandidatePlayer[];
  board: Pick<Board, 'players'>;
  position: Position;
  survival: SurvivalProjection | null;
  config: Pick<CandidateListConfig, 'candidateListDefaultRows'>;
}

/**
 * One position's rows — AC-50's one-interaction filter.
 *
 * Ordering is ECR within the position, which for a single position *is* positional ECR order, so
 * nothing is re-sorted against 🔶 AS-8. K and DST come back with `survival: null` whatever the
 * projection holds: they are outside the simulation universe by construction, and a blank column is
 * the honest rendering of "no survival math here" rather than a fabricated number.
 *
 * When the snapshot carries no ranking for the filtered position at all — the K/DST case AC-23
 * warns about — the rows fall back to ADP order.
 */
export function filterCandidateRows(input: FilterCandidateRowsInput): CandidateRow[] {
  const available = input.players.filter(
    (player) =>
      player.position === input.position && !isDrafted(input.board, player.sleeperPlayerId),
  );

  const ranked = available.some((player) => player.ecrRank !== null)
    ? [...available].sort(
        (a, b) =>
          (a.ecrRank ?? Infinity) - (b.ecrRank ?? Infinity) ||
          a.playerName.localeCompare(b.playerName),
      )
    : [...available].sort(
        (a, b) =>
          (a.adp ?? Infinity) - (b.adp ?? Infinity) || a.playerName.localeCompare(b.playerName),
      );

  return ranked
    .slice(0, input.config.candidateListDefaultRows)
    .map((player) => toRow(player, input.survival, false));
}

// ---------------------------------------------------------------------------------------------
// The reason line (AC-51, AC-52, AC-58, AC-59)
// ---------------------------------------------------------------------------------------------

const formatNumber = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatPercent = (survival: Survival): string => `${Math.round(survival.probability * 100)}%`;

export interface ComputeCandidateListInput {
  /** The matched snapshot (T3), immutable for this draft's lifetime (AC-29). */
  players: readonly CandidatePlayer[];
  board: Pick<Board, 'players'>;
  /** FR-6's window — `inProgressPickNo` is the "current pick" AC-51's value test measures against. */
  window: DraftWindow;
  /** FR-5's need vector **for the user**, the only source of plan positions (AC-54). */
  needVector: NeedVector | NoNeedSignal;
  /** FR-8's projection, built over a universe that included {@link candidateSimulationIds}. */
  survival: SurvivalProjection | null;
  /** Picks the user still owns in the draft, counting the one on the clock (AC-59). */
  userRemainingPicks: number;
  config: CandidateListConfig;
  /** AC-50's active filter, or null/absent for the whole list. */
  positionFilter?: Position | null;
}

const DISABLED_REASON =
  'No rankings snapshot loaded — candidates, survival and recommendations are unavailable.';

const disabledList = (): CandidateListData => ({
  rows: [],
  highlightPlayerId: null,
  reason: null,
  reasonKind: null,
  planComparison: null,
  disabledReason: DISABLED_REASON,
});

/**
 * The whole candidate-list payload: rows, the one highlight, its one-line reason, and the plan
 * comparison behind it.
 *
 * See the module header for the composed order. The one invariant worth stating twice: **the
 * within-noise test never moves the highlight.** AC-52 says the highlight "stays put" and only the
 * line changes, which is what keeps a coin-flip from re-shuffling the recommendation every time a
 * survival percentage wobbles by a point.
 */
export function computeCandidateList(input: ComputeCandidateListInput): CandidateListData {
  const { board, config, survival } = input;
  if (input.players.length === 0) return disabledList();

  const available = availableInEcrOrder(input.players, board);
  const comparison = comparePlans({
    players: input.players,
    board,
    needVector: input.needVector,
    projection: survival,
    userRemainingPicks: input.userRemainingPicks,
    config,
  });

  const topEcr = available[0] ?? null;
  if (topEcr === null) {
    return {
      rows: [],
      highlightPlayerId: null,
      reason: null,
      reasonKind: null,
      planComparison: comparison,
      disabledReason: null,
    };
  }

  // ---- 1. FR-10 places the highlight (AC-56, AC-58) -----------------------------------------
  const best = bestAvailableByPosition(input.players, board);
  let highlight: RankedCandidate = topEcr;
  if (comparison.winner !== null) {
    // AC-58: totals this close cannot separate the plans, so the present-tense ECR fact does it
    // instead — "the higher-ECR current pick", i.e. the lower term1 of the two.
    const chosen =
      comparison.tooClose &&
      comparison.runnerUp !== null &&
      comparison.runnerUp.term1 < comparison.winner.term1
        ? comparison.runnerUp
        : comparison.winner;
    highlight = best.get(chosen.nowPosition) ?? topEcr;
  }

  // ---- 2. The single decisive factor, by AC-51's precedence ----------------------------------
  const moved = highlight.sleeperPlayerId !== topEcr.sleeperPlayerId;
  const planned = new Set(planPositions(input.needVector));
  const currentPickNo = input.window.inProgressPickNo;
  const valueGap =
    !moved && topEcr.adp !== null && currentPickNo !== null ? currentPickNo - topEcr.adp : null;

  let reasonKind: HighlightReasonKind;
  let baseClause: string;

  if (!comparison.applicable) {
    // AC-59: no plan comparison to make, so the ECR-ordered highlight stands and says so.
    const picks = input.userRemainingPicks;
    reasonKind = 'lookahead-not-applicable';
    baseClause =
      `Lookahead does not apply with ${picks} pick${picks === 1 ? '' : 's'} left — ` +
      `best available: ${highlight.playerName} (ECR ${highlight.ecrRank}).`;
  } else if (moved && isSkillPosition(topEcr.position) && planned.has(topEcr.position)) {
    // The top-ECR candidate's position was in the plan set and the comparison still went elsewhere.
    const winner = comparison.winner;
    const totals =
      winner !== null && comparison.runnerUp !== null
        ? ` scores best (${formatNumber(winner.score)} vs ${formatNumber(comparison.runnerUp.score)})`
        : '';
    reasonKind = 'plan-survival';
    baseClause =
      `Plan ${winner?.nowPosition ?? highlight.position} now / ${winner?.nextPosition ?? highlight.position} next${totals} — ` +
      `${highlight.playerName} over higher-ECR ${topEcr.playerName}.`;
  } else if (moved) {
    // The top-ECR candidate's position has no unfilled starting slot, so no plan could reach it.
    reasonKind = 'need';
    baseClause =
      `${topEcr.playerName} (${topEcr.position}) fills no unfilled starting slot — ` +
      `${highlight.playerName} (${highlight.position}) does.`;
  } else if (valueGap !== null && valueGap >= config.valueThresholdAdpPicksEarlier) {
    reasonKind = 'value';
    baseClause =
      `Value: ${highlight.playerName} is the top available player, and an ADP of ` +
      `${formatNumber(topEcr.adp!)} is ${formatNumber(valueGap)} picks earlier than pick ${currentPickNo}.`;
  } else {
    reasonKind = 'best-available';
    baseClause = `Best available: ${highlight.playerName} (ECR ${highlight.ecrRank}).`;
  }

  // ---- 3. The within-noise test, last, on the resolved highlight (AC-52) ---------------------
  const tieClauses: string[] = [];
  const other = available.find((player) => player.position !== highlight.position) ?? null;
  const highlightSurvival = survivalOf(survival, highlight);
  const otherSurvival = other === null ? null : survivalOf(survival, other);

  if (
    other !== null &&
    highlightSurvival !== null &&
    otherSurvival !== null &&
    Math.abs(highlightSurvival.probability - otherSurvival.probability) * 100 <=
      config.nearTieSurvivalPct &&
    Math.abs(highlight.ecrRank - other.ecrRank) <= config.nearTieEcrRanks
  ) {
    tieClauses.push(
      `Too close to call: ${highlight.playerName} (ECR ${highlight.ecrRank}, ${formatPercent(highlightSurvival)} survival) ` +
        `and ${other.playerName} (${other.position}, ECR ${other.ecrRank}, ${formatPercent(otherSurvival)} survival) — ` +
        `staying with ${highlight.playerName}.`,
    );
  }

  if (comparison.tooClose && comparison.winner !== null && comparison.runnerUp !== null) {
    tieClauses.push(
      `Plan totals within ${config.planTotalTooCloseEcrRanks} ECR ranks ` +
        `(${formatNumber(comparison.winner.score)} vs ${formatNumber(comparison.runnerUp.score)}) — ` +
        `too close to separate, taking the higher-ECR player now: ${highlight.playerName} (ECR ${highlight.ecrRank}).`,
    );
  }

  // One rendered statement, never two: the two tie statements merge into a single line, and the
  // AC-59 clause rides along with them rather than being dropped when both apply.
  let reason = baseClause;
  if (tieClauses.length > 0) {
    reasonKind = 'too-close-to-call';
    reason = [...tieClauses, ...(comparison.applicable ? [] : [baseClause])].join(' ');
  }

  // ---- The rows (AC-49, AC-50) ---------------------------------------------------------------
  const filter = input.positionFilter ?? null;
  const rows =
    filter !== null
      ? filterCandidateRows({
          players: input.players,
          board,
          position: filter,
          survival,
          config,
        })
      : available
          .slice(0, config.candidateListDefaultRows)
          .map((player) => toRow(player, survival, false));

  // AC-49/AC-56: the list extends to carry the highlight when it falls outside the default rows.
  if (filter === null && !rows.some((row) => row.playerId === highlight.sleeperPlayerId)) {
    rows.push(toRow(highlight, survival, true));
  }

  return {
    rows,
    highlightPlayerId: highlight.sleeperPlayerId,
    reason,
    reasonKind,
    planComparison: comparison,
    disabledReason: null,
  };
}
