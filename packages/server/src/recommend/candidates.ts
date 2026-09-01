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
 *  1. **FR-10 places the highlight.** `comparePlans` scores the plans (in shaded-curve
 *     projected points since 2026-08-31); the highlight is the best-ECR available player at the
 *     winning plan's now-position (AC-56). When the top two totals are too close to separate, the
 *     highlight falls back to the better-ECR of the two plans' current picks instead (AC-58) —
 *     the comparison the user is *shown* still reports the real winner.
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

import { NO_NEED_SIGNAL, SKILL_POSITIONS, isSkillPosition } from '@sidekick/shared';
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
  SkillPosition,
  SlotConfig,
  Survival,
} from '@sidekick/shared';

import type { SurvivalProjection } from '../simulation/montecarlo';
import { bestAvailableByPosition, comparePlans, planPositions, tierFact } from './lookahead';
import type { PlayerValueModel } from './value';

export type CandidateListConfig = Pick<
  ParameterValues,
  | 'candidateListDefaultRows'
  | 'valueThresholdAdpPicksEarlier'
  | 'nearTieSurvivalPct'
  | 'nearTieEcrRanks'
  | 'planTotalTooClosePoints'
  | 'lookaheadMaxPicks'
  | 'benchPositionHeadroom'
  | 'flexEligiblePositions'
>;

export type EndgameKdstConfig = Pick<ParameterValues, 'endgameKdstBufferPicks'>;

// ---------------------------------------------------------------------------------------------
// The bench phase (FR-9/FR-10 amendment, 2026-08-27)
// ---------------------------------------------------------------------------------------------

/** What the bench phase reads off the user's roster. Counts are totals — starters and bench. */
export interface BenchPhaseInput {
  rosterCounts: Partial<Record<Position, number>>;
  slots: SlotConfig;
  /** League size sets the waiver/replacement line for bench-value pricing. */
  teamCount?: number;
}

/**
 * First player beyond the league-wide starting demand at each skill position.
 *
 * Dedicated starters establish each position's initial demand. Every league-wide FLEX starter is
 * then assigned, one at a time, to the eligible position whose next player has the greatest value
 * on this league's scoring curve. That makes ordinary FLEX demand flow mostly to RB/WR without
 * hard-coding that tactic, while TE-premium and QB-eligible FLEX formats can earn a different
 * allocation from their actual scoring. The returned rank is the first player beyond that demand.
 */
export function benchReplacementRanks(
  bench: BenchPhaseInput,
  config: Pick<CandidateListConfig, 'flexEligiblePositions'>,
  valueModel: Pick<PlayerValueModel, 'valueAt'>,
): Partial<Record<SkillPosition, number>> | undefined {
  if (bench.teamCount === undefined || bench.teamCount <= 0) return undefined;
  const teamCount = bench.teamCount;
  const demand: Record<SkillPosition, number> = Object.fromEntries(
    SKILL_POSITIONS.map((position) => [position, teamCount * bench.slots[position]]),
  ) as Record<SkillPosition, number>;
  const eligible = config.flexEligiblePositions.filter((position) =>
    SKILL_POSITIONS.includes(position),
  );

  const flexStarters = Math.max(0, Math.trunc(teamCount * bench.slots.FLEX));
  for (let slot = 0; slot < flexStarters && eligible.length > 0; slot += 1) {
    let winner = eligible[0]!;
    let winnerValue = valueModel.valueAt(winner, demand[winner] + 1);
    for (const position of eligible.slice(1)) {
      const value = valueModel.valueAt(position, demand[position] + 1);
      if (value > winnerValue) {
        winner = position;
        winnerValue = value;
      }
    }
    demand[winner] += 1;
  }

  return Object.fromEntries(SKILL_POSITIONS.map((position) => [position, demand[position] + 1]));
}

/**
 * The positions that still add value once the starters are full — the bench phase's answer to
 * AC-54's "positions the user still needs", which runs dry at the no-need sentinel.
 *
 * A FLEX-eligible position always qualifies: its depth starts games. A non-FLEX position (QB in
 * a 1-QB league) has a weekly ceiling, so it qualifies only while the roster holds fewer than
 * `starting slots + 🔶 benchPositionHeadroom` of it **and** every FLEX-eligible position already
 * carries at least one backup (the flex-first gate, amended 2026-08-31). Born from the 08-27
 * rehearsal, where the no-need→raw-ECR regime — amplified by AS-8's QB-vs-market ECR skew
 * reading as "value" pick after pick — recommended QB3 through QB6 while the bench held two
 * running backs; the gate closes the residue rehearsal #7 exposed, where the thinnest-position
 * rule read "no backup QB" as the neediest bench hole and pitched Lawrence and Purdy while a
 * 1-QB roster's spare starts could only ever come through FLEX.
 */
export function benchPlanPositions(
  bench: BenchPhaseInput,
  config: Pick<CandidateListConfig, 'benchPositionHeadroom' | 'flexEligiblePositions'>,
  replacementRanks?: Partial<Record<SkillPosition, number>>,
): SkillPosition[] {
  const depth = (position: SkillPosition): number =>
    Math.max(0, (bench.rosterCounts[position] ?? 0) - bench.slots[position]);
  const scoringAware = replacementRanks !== undefined && bench.teamCount !== undefined;
  const corePositions = SKILL_POSITIONS.filter((position) => {
    if (!scoringAware) return config.flexEligiblePositions.includes(position);
    const dedicatedDemand = bench.teamCount! * bench.slots[position];
    const earnedFlexDemand =
      (replacementRanks[position] ?? dedicatedDemand + 1) > dedicatedDemand + 1;
    return bench.slots[position] > 1 || earnedFlexDemand;
  });
  // Ordinary single-QB/single-TE backups are insurance, not weekly lineup depth. Require two
  // usable backups at every core position before spending a bench spot on that insurance. A
  // TE-premium or QB-eligible FLEX curve can make that position core by earning FLEX demand.
  const requiredCoreDepth = scoringAware ? 2 : 1;
  const coreCovered = corePositions.every((position) => depth(position) >= requiredCoreDepth);

  return SKILL_POSITIONS.filter(
    (position) =>
      corePositions.includes(position) ||
      (coreCovered &&
        (bench.rosterCounts[position] ?? 0) < bench.slots[position] + config.benchPositionHeadroom),
  );
}

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
  /** The player's positional tier (FR-4, amended 2026-09-01); null when their position's
   *  tier page was unavailable, and always null on ADP-only and K/DST rows. */
  tier: number | null;
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
  tier: player.tier,
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
  /**
   * FR-10's value model (amended 2026-08-31), built once per attach. Null when the game-log
   * cache was never built — plans are then not scored and the best-available regime stands.
   */
  valueModel: PlayerValueModel | null;
  /** Picks the user still owns in the draft, counting the one on the clock (AC-59). */
  userRemainingPicks: number;
  config: CandidateListConfig;
  /** AC-50's active filter, or null/absent for the whole list. */
  positionFilter?: Position | null;
  /**
   * The user's roster totals and slot shape, for the bench phase. Read only while `needVector`
   * is the no-need sentinel; absent, the pre-amendment raw best-available regime applies.
   */
  benchPhase?: BenchPhaseInput | null;
  /**
   * The user's unfilled dedicated starting slots per skill position, for AC-55's fill-value term
   * and starter cap (amended 2026-08-28/31). Absent, plans score by `nowValue + nextValue`
   * alone — which is what the bench phase wants, so callers omit it once starters are full.
   */
  unfilledDedicatedSlots?: Partial<Record<SkillPosition, number>>;
  /** The user's unfilled FLEX slots, for the plan-pick starter cap (amended 2026-08-31). */
  unfilledFlexSlots?: number;
  /**
   * The user's own upcoming pick numbers, next turn first, for the fill term's horizon pricing
   * (amended 2026-08-31) — see `ComparePlansInput.futureUserPickNos`.
   */
  futureUserPickNos?: readonly number[];
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

  // The bench phase (FR-9/FR-10 amendment, 2026-08-27): starters full, so plans and the
  // highlight draw only from positions that still add bench value. The displayed rows stay raw
  // ECR order (🔶 AS-8) — the *recommendation* is constrained, never the board.
  const benchPhaseActive = input.needVector === NO_NEED_SIGNAL && input.benchPhase != null;
  const replacementRanks =
    input.benchPhase == null || input.valueModel == null
      ? undefined
      : benchReplacementRanks(input.benchPhase, config, input.valueModel);
  const benchPositions = benchPhaseActive
    ? benchPlanPositions(input.benchPhase!, config, replacementRanks)
    : null;
  const deferredStarterDepthPositions =
    !benchPhaseActive && input.benchPhase != null && replacementRanks !== undefined
      ? benchPlanPositions(input.benchPhase, config, replacementRanks).filter(
          (position) =>
            input.needVector !== NO_NEED_SIGNAL && input.needVector[position] === 0,
        )
      : undefined;
  const coreBenchPositions = new Set(
    benchPositions === null || input.benchPhase == null
      ? []
      : benchPlanPositions(input.benchPhase, config, replacementRanks).filter((position) => {
          if (replacementRanks === undefined || input.benchPhase?.teamCount === undefined) {
            return config.flexEligiblePositions.includes(position);
          }
          const dedicatedDemand = input.benchPhase.teamCount * input.benchPhase.slots[position];
          return (
            input.benchPhase.slots[position] > 1 ||
            (replacementRanks[position] ?? dedicatedDemand + 1) > dedicatedDemand + 1
          );
        }),
  );
  const benchPickCapacity =
    benchPositions === null || input.benchPhase === null || input.benchPhase === undefined
      ? undefined
      : Object.fromEntries(
          SKILL_POSITIONS.map((position) => [
            position,
            coreBenchPositions.has(position)
              ? Number.POSITIVE_INFINITY
              : Math.max(
                  0,
                  input.benchPhase!.slots[position] +
                    config.benchPositionHeadroom -
                    (input.benchPhase!.rosterCounts[position] ?? 0),
                ),
          ]),
        );
  const allowed = benchPositions === null ? null : new Set<Position>(benchPositions);
  const pool =
    allowed === null ? available : available.filter((player) => allowed.has(player.position));

  const comparison = comparePlans({
    players: input.players,
    board,
    needVector: input.needVector,
    projection: survival,
    valueModel: input.valueModel,
    userRemainingPicks: input.userRemainingPicks,
    config,
    ...(benchPositions === null ? {} : { benchPositions }),
    ...(deferredStarterDepthPositions === undefined ? {} : { deferredStarterDepthPositions }),
    ...(benchPickCapacity === undefined ? {} : { benchPickCapacity }),
    ...(replacementRanks === undefined ? {} : { replacementRanks }),
    ...(input.unfilledDedicatedSlots === undefined
      ? {}
      : { unfilledDedicatedSlots: input.unfilledDedicatedSlots }),
    ...(input.unfilledFlexSlots === undefined
      ? {}
      : { unfilledFlexSlots: input.unfilledFlexSlots }),
    ...(input.futureUserPickNos === undefined
      ? {}
      : { futureUserPickNos: input.futureUserPickNos }),
  });

  const rawTop = available[0] ?? null;
  // Every bench-eligible position empty on the board is the raw regime again, not a dead end.
  const topEcr = pool[0] ?? rawTop;
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
  /** Bench phase only: the thinnest-position rule moved the highlight; what the reason needs. */
  let benchThinnest: { depth: number; passedOver: RankedCandidate } | null = null;
  /** Bench phase with scoring data: the replacement-adjusted plan moved the highlight. */
  let benchValueChoice: { passedOver: RankedCandidate; replacementRank: number | null } | null =
    null;
  /** AC-58 only: the near-tie was separated by an unfilled dedicated slot, not by consensus. */
  let tieBrokenByNeed = false;
  /** AC-58 only: the near-tie was separated by FLEX-eligibility over a single-slot position. */
  let tieBrokenByFlex = false;
  /** AC-58 only: a safe deferred starter let the current pick add replacement-adjusted depth. */
  let tieBrokenByDepth = false;

  if (allowed !== null && input.benchPhase != null) {
    // With a value model, the league-size/scoring-adjusted plan chooses the position; without
    // one, the established thinnest-position fallback still prevents raw ECR from piling onto
    // one bench position. In either path ECR chooses the player within the chosen position.
    const rawPlannedPosition = comparison.winner?.nowPosition;
    const rawPlannedPlayer =
      rawPlannedPosition === undefined ? undefined : best.get(rawPlannedPosition);
    // Replacement value becomes flat late in ordinary drafts: once every candidate is at or
    // below the league replacement line, comparePlans can return an arbitrary position with a
    // 0–0 score. Inside the configured noise band, use the roster signal that still contains
    // information — bench depth — while retaining ECR as the within-position player choice.
    // A scoring format that creates a real edge outside the band still controls the pick.
    const balancedPosition = comparison.tooClose
      ? (benchPositions ?? [])
          .filter((position) => best.has(position))
          .map((position) => ({
            position,
            depth: Math.max(
              0,
              (input.benchPhase!.rosterCounts[position] ?? 0) -
                input.benchPhase!.slots[position],
            ),
            player: best.get(position)!,
          }))
          .sort((a, b) => a.depth - b.depth || a.player.ecrRank - b.player.ecrRank)[0]
      : undefined;
    const plannedPosition = balancedPosition?.position ?? rawPlannedPosition;
    const plannedPlayer = plannedPosition === undefined ? undefined : best.get(plannedPosition);
    if (plannedPosition !== undefined && plannedPlayer !== undefined) {
      highlight = plannedPlayer;
      if (
        balancedPosition !== undefined &&
        rawPlannedPlayer !== undefined &&
        plannedPlayer.sleeperPlayerId !== rawPlannedPlayer.sleeperPlayerId
      ) {
        benchThinnest = {
          depth: balancedPosition.depth,
          passedOver: rawPlannedPlayer,
        };
      } else if (plannedPlayer.sleeperPlayerId !== topEcr.sleeperPlayerId) {
        benchValueChoice = {
          passedOver: topEcr,
          replacementRank: replacementRanks?.[plannedPosition] ?? null,
        };
      }
    } else {
      // No league-scored value model: keep the established roster-balance fallback rather than
      // silently reverting to raw ECR, but do not claim it is replacement-adjusted.
      const counts = input.benchPhase.rosterCounts;
      const slots = input.benchPhase.slots;
      const thinnestFirst = (benchPositions ?? [])
        .filter((position) => best.has(position))
        .map((position) => ({
          position,
          depth: Math.max(0, (counts[position] ?? 0) - slots[position]),
          player: best.get(position)!,
        }))
        .sort((a, b) => a.depth - b.depth || a.player.ecrRank - b.player.ecrRank);
      const thinnest = thinnestFirst[0];
      if (thinnest !== undefined) {
        highlight = thinnest.player;
        if (thinnest.player.sleeperPlayerId !== topEcr.sleeperPlayerId) {
          benchThinnest = { depth: thinnest.depth, passedOver: topEcr };
        }
      }
    }
  } else if (comparison.winner !== null) {
    // AC-58 (amended 2026-08-31): totals this close cannot separate the plans, so present-tense
    // facts do it instead, over **every plan inside the band** — a now-pick at a FLEX-eligible
    // position beats one at a single-slot position (rehearsal #7: with the totals flat, a
    // dedicated-slot rule alone promoted Drake Maye at pick 46 — the QB slot was the only
    // dedicated hole, yet QB is the one position whose pick can never start anywhere else and
    // whose deferral the flat curve makes cheap), then a now-pick filling an unfilled dedicated
    // starting slot beats one that only flexes (the round-6 directive), then the better-ECR
    // player ("take the consensus"). The band matters: rehearsal #6's mid-rounds tied two
    // flex-RB plans at the top with the WR-need plan 0.1 behind them, invisible to a
    // top-two-only rule. The shown comparison still reports the real winner.
    let chosen = comparison.winner;
    if (comparison.tooClose && (comparison.contenders?.length ?? 0) > 1) {
      const flexEligible = (position: SkillPosition): boolean =>
        config.flexEligiblePositions.includes(position);
      const fillsDedicated = (position: SkillPosition): boolean =>
        (input.unfilledDedicatedSlots?.[position] ?? 0) > 0;
      const addsDeferredDepth = (position: SkillPosition): boolean =>
        deferredStarterDepthPositions?.includes(position) === true;
      const ranked = [...(comparison.contenders ?? [])]
        .map((plan) => ({ plan, now: best.get(plan.nowPosition) }))
        .filter((entry) => entry.now !== undefined)
        .sort(
          (a, b) =>
            Number(addsDeferredDepth(b.plan.nowPosition)) -
              Number(addsDeferredDepth(a.plan.nowPosition)) ||
            Number(flexEligible(b.plan.nowPosition)) - Number(flexEligible(a.plan.nowPosition)) ||
            Number(fillsDedicated(b.plan.nowPosition)) -
              Number(fillsDedicated(a.plan.nowPosition)) ||
            a.now!.ecrRank - b.now!.ecrRank,
        );
      const top = ranked[0];
      if (top !== undefined) {
        chosen = top.plan;
        tieBrokenByDepth =
          addsDeferredDepth(top.plan.nowPosition) &&
          ranked.some((entry) => !addsDeferredDepth(entry.plan.nowPosition));
        tieBrokenByFlex =
          !tieBrokenByDepth &&
          flexEligible(top.plan.nowPosition) &&
          ranked.some((entry) => !flexEligible(entry.plan.nowPosition));
        tieBrokenByNeed =
          !tieBrokenByFlex &&
          fillsDedicated(top.plan.nowPosition) &&
          ranked.some((entry) => !fillsDedicated(entry.plan.nowPosition));
      }
    }
    highlight = best.get(chosen.nowPosition) ?? topEcr;
  }

  // ---- 2. The single decisive factor, by AC-51's precedence ----------------------------------
  const moved = highlight.sleeperPlayerId !== topEcr.sleeperPlayerId;
  const planned = new Set(benchPositions ?? planPositions(input.needVector));
  const currentPickNo = input.window.inProgressPickNo;
  const valueGap =
    !moved && topEcr.adp !== null && currentPickNo !== null ? currentPickNo - topEcr.adp : null;

  // The bench redirect: the board's raw top sits at a capped position the roster already holds
  // enough of. That fact outranks the ladder below — it IS the single decisive factor — and the
  // reason must acknowledge the player the user can see leading the list.
  const redirected =
    allowed !== null &&
    rawTop !== null &&
    rawTop.sleeperPlayerId !== highlight.sleeperPlayerId &&
    !allowed.has(rawTop.position);

  let reasonKind: HighlightReasonKind;
  let baseClause: string;

  if (redirected) {
    const count = input.benchPhase?.rosterCounts[rawTop.position] ?? 0;
    const starts = input.benchPhase?.slots[rawTop.position] ?? 0;
    reasonKind = 'bench-depth';
    // Two ways a position leaves the bench pool: it hit its roster cap, or the flex-first gate
    // holds it back while a FLEX-eligible position still has no backup. Say which.
    const gated = count < starts + config.benchPositionHeadroom;
    baseClause = gated
      ? `Roster balance: ${rawTop.playerName} (${rawTop.position}) leads the board, but a backup ` +
        `${rawTop.position} can wait until every FLEX-eligible position has one — ` +
        `${highlight.playerName} (${highlight.position}) is the best pick that still adds ` +
        `startable depth.`
      : `Roster balance: ${rawTop.playerName} (${rawTop.position}) leads the board, but you ` +
        `already carry ${count} ${rawTop.position}${count === 1 ? '' : 's'} for ` +
        `${starts} starting slot${starts === 1 ? '' : 's'} — ` +
        `${highlight.playerName} (${highlight.position}) is the best pick that still adds depth.`;
  } else if (benchValueChoice !== null) {
    const winner = comparison.winner!;
    const runnerUp = comparison.runnerUp;
    const comparisonText =
      runnerUp === null
        ? `${formatNumber(winner.score)} points above replacement`
        : `${formatNumber(winner.score)} vs ${formatNumber(runnerUp.score)} points above replacement`;
    const replacementText =
      benchValueChoice.replacementRank === null
        ? ''
        : ` against the ${highlight.position}${benchValueChoice.replacementRank} league replacement line`;
    reasonKind = 'bench-depth';
    baseClause =
      `Bench value: ${highlight.playerName} (${highlight.position}) leads the league-scored plan ` +
      `${comparisonText}${replacementText} — over ` +
      `${benchValueChoice.passedOver.playerName} (${benchValueChoice.passedOver.position}).`;
  } else if (benchThinnest !== null) {
    const depthNote =
      benchThinnest.depth === 0
        ? 'no backup behind your starters'
        : `${benchThinnest.depth} backup${benchThinnest.depth === 1 ? '' : 's'}`;
    reasonKind = 'bench-depth';
    baseClause =
      `Bench balance: ${highlight.position} is your thinnest position (${depthNote}) — ` +
      `${highlight.playerName} (ECR ${highlight.ecrRank}) over ` +
      `${benchThinnest.passedOver.playerName} (${benchThinnest.passedOver.position}).`;
  } else if (!comparison.applicable) {
    // AC-59: no plan comparison to make, so the ECR-ordered highlight stands and says so.
    const picks = input.userRemainingPicks;
    reasonKind = 'lookahead-not-applicable';
    baseClause =
      `Lookahead does not apply with ${picks} pick${picks === 1 ? '' : 's'} left — ` +
      `best available: ${highlight.playerName} (ECR ${highlight.ecrRank}).`;
  } else if (moved && isSkillPosition(topEcr.position) && planned.has(topEcr.position)) {
    // The top-ECR candidate's position was in the plan set and the comparison still went
    // elsewhere — name the tier forcing the timing, in the same per-run terms as AC-57.
    const winner = comparison.winner;
    const totals =
      winner !== null && comparison.runnerUp !== null
        ? ` scores best (${formatNumber(winner.score)} vs ${formatNumber(comparison.runnerUp.score)} proj pts)`
        : '';
    const urgency =
      input.valueModel !== null &&
      survival !== null &&
      !survival.suppressed &&
      isSkillPosition(highlight.position)
        ? `: ${tierFact(survival, board, input.valueModel, highlight.position)}`
        : '';
    reasonKind = 'plan-survival';
    baseClause =
      `Plan ${winner?.nowPosition ?? highlight.position} now / ${winner?.nextPosition ?? highlight.position} next${totals}${urgency} — ` +
      `${highlight.playerName} over higher-ECR ${topEcr.playerName} (${topEcr.position}).`;
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
  // Skipped entirely on a bench redirect: the balance rule is the story, and the "other
  // candidate" a tie line would name must itself come from positions the bench phase allows.
  const tieClauses: string[] = [];
  const other =
    redirected || benchThinnest !== null || benchValueChoice !== null
      ? null
      : (pool.find((player) => player.position !== highlight.position) ?? null);
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

  if (
    benchValueChoice === null &&
    benchThinnest === null &&
    comparison.tooClose &&
    comparison.winner !== null &&
    comparison.runnerUp !== null
  ) {
    const separator = tieBrokenByDepth
      ? `adding depth now while the missing starter is projected to last: ${highlight.playerName} (${highlight.position}, ECR ${highlight.ecrRank})`
      : tieBrokenByFlex
        ? `keeping the pick FLEX-eligible: ${highlight.playerName} (${highlight.position}, ECR ${highlight.ecrRank})`
      : tieBrokenByNeed
        ? `taking the pick that still fills a starting slot: ${highlight.playerName} (${highlight.position}, ECR ${highlight.ecrRank})`
        : `taking the better-consensus player now: ${highlight.playerName} (ECR ${highlight.ecrRank})`;
    tieClauses.push(
      `Plan totals within ${config.planTotalTooClosePoints} proj pts ` +
        `(${formatNumber(comparison.winner.score)} vs ${formatNumber(comparison.runnerUp.score)}) — ` +
        `too close to separate, ${separator}.`,
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

// ---------------------------------------------------------------------------------------------
// The endgame K/DST guard (FR-9, amended 2026-08-27)
// ---------------------------------------------------------------------------------------------

export interface EndgameKdstOverrideInput {
  /** The list `computeCandidateList` produced. Returned untouched unless the guard fires. */
  list: CandidateListData;
  /** Picks the user still owns in the draft, counting the one on the clock. */
  userRemainingPicks: number;
  /** The user's unfilled dedicated K / DST starting slots (FR-5's roster arithmetic). */
  unfilledK: number;
  unfilledDst: number;
  /**
   * AC-50's per-position row sets for K and DST — positional ECR order, ADP order when the
   * snapshot ranks neither (AC-23's degenerate case). The guard highlights the head of one of
   * these, so what it recommends is exactly what the position filter shows first.
   */
  kdstRows: { K: readonly CandidateRow[]; DST: readonly CandidateRow[] };
  config: EndgameKdstConfig;
}

/**
 * FR-9's endgame guard: when the user's remaining picks have caught up with their unfilled K/DST
 * starting slots (plus a one-pick buffer for an ignored recommendation), the highlight moves to
 * the top available K/DST and says why.
 *
 * Exists because AS-7's falsifier fired: 🔶 AS-7 keeps K/DST out of every piece of prediction
 * math — deliberately, and this guard does not change that — but composed with FR-9's ECR-value
 * highlighting it meant a user who followed every recommendation of the 2026-08-27 mock
 * rehearsal finished with six quarterbacks and no kicker or defense. The guard is roster
 * arithmetic, not prediction: no survival number, no plan, just "you are out of road".
 *
 * The plan comparison is suppressed while the guard holds — a two-skill-pick plan beside a
 * "draft a kicker now" highlight would be two recommendations on one screen.
 */
export function applyEndgameKdstOverride(input: EndgameKdstOverrideInput): CandidateListData {
  const { list, config } = input;
  if (list.disabledReason !== null) return list;

  const unfilledK = Math.max(0, input.unfilledK);
  const unfilledDst = Math.max(0, input.unfilledDst);
  const unfilled = unfilledK + unfilledDst;
  if (unfilled === 0 || input.userRemainingPicks <= 0) return list;
  if (input.userRemainingPicks > unfilled + config.endgameKdstBufferPicks) return list;

  // The best row per open position, then the better of the two by ADP (the market's order is
  // the only cross-position signal K/DST have — 🔶 AS-7 gives them no other number), falling
  // back to ECR, then to K first for pure determinism.
  const candidates: CandidateRow[] = [];
  if (unfilledK > 0 && input.kdstRows.K.length > 0) candidates.push(input.kdstRows.K[0]!);
  if (unfilledDst > 0 && input.kdstRows.DST.length > 0) candidates.push(input.kdstRows.DST[0]!);
  if (candidates.length === 0) return list;

  const target = [...candidates].sort(
    (a, b) =>
      (a.adp ?? Infinity) - (b.adp ?? Infinity) ||
      (a.ecrRank ?? Infinity) - (b.ecrRank ?? Infinity) ||
      (a.position === 'K' ? -1 : 1),
  )[0]!;

  const openSlots = [
    ...(unfilledK > 0 ? [unfilledK > 1 ? `${unfilledK} K` : 'K'] : []),
    ...(unfilledDst > 0 ? [unfilledDst > 1 ? `${unfilledDst} DST` : 'DST'] : []),
  ].join(' and ');
  const picks = input.userRemainingPicks;
  const reason =
    `Endgame: ${picks} pick${picks === 1 ? '' : 's'} left and your ${openSlots} ` +
    `slot${unfilled === 1 ? ' is' : 's are'} still open — ` +
    `${target.playerName} is the top ${target.position} on the board.`;

  const rows = list.rows.some((row) => row.playerId === target.playerId)
    ? list.rows
    : [...list.rows, { ...target, addedForHighlight: true }];

  return {
    ...list,
    rows,
    highlightPlayerId: target.playerId,
    reason,
    reasonKind: 'endgame-kdst',
    planComparison: null,
  };
}
