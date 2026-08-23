/**
 * The window and the opponent panel — FR-6 (AC-34, AC-35, AC-36, AC-37).
 *
 * The **window** (PRD §9 Terms) is the exact sequence of picks between the user's current pick
 * and their next pick, snake order and traded picks respected. Terms anchors it two ways:
 *
 *   "While the user is on the clock, 'current pick' is the in-progress one and 'next pick' is
 *    the one after it; the in-progress slot is never simulated. When the user is not on the
 *    clock, the window runs from the in-progress pick through the one before the user's next
 *    turn."
 *
 * Both branches collapse to one rule, which is how this module implements them: **the window is
 * every pick that will be made before the user's next pick**, and the only thing the branch
 * decides is whether the in-progress pick is inside it (it is not, when the in-progress pick is
 * the user's own). Getting that off-by-one wrong in either direction would propagate into every
 * downstream FR, so `computeWindow` is a pure function of
 * `(teamCount, rounds, picksMade, userTeamId, ownerOf)` and is exported for FR-7 (which teams to
 * profile), FR-8 (which picks to simulate) and FR-10 (the user's next turn) to import rather
 * than re-derive.
 *
 * Two things this module deliberately does not do:
 *
 *  - **It does not re-derive traded-pick ownership.** `ownerOf` comes from T2's
 *    `buildPickOwnerResolver` (via `BoardSync.pickOwnerResolver`), so a window pick's owner is
 *    the same answer sync gives that pick once it is made (AC-12, AC-34).
 *  - **It does not re-derive rosters.** Per-opponent need comes from T4's
 *    `RosterPanelTracker.panelFor(teamId)`, the same call that builds the user's own roster
 *    panel, so "filled" means one thing across FR-5 and FR-6.
 *
 * Nothing here accumulates: a panel is a pure projection of the current board, so it cannot
 * drift from the picks it was built from, and AC-35's "updated within 5 s of any pick" reduces
 * to "the orchestrator recomputed" rather than to any cache-invalidation rule of its own.
 */

import {
  NO_NEED_SIGNAL,
  SKILL_POSITIONS,
  isSkillPosition,
  normalizeToDistribution,
} from '@sidekick/shared';
import type {
  Board,
  DraftWindow,
  OpponentExamplePlayer,
  OpponentPanelEntry,
  Position,
  RosterPanelData,
  SkillPosition,
  WindowPick,
} from '@sidekick/shared';

import { assignSamplingRanks } from '../snapshots/match';

/** Resolves the seat owning the pick made in `round` from board column `draftSlot` (AC-12). */
export type PickOwnerResolver = (round: number, draftSlot: number) => string;

/** How many seats and rounds the draft has — both read from the draft object's own settings. */
export interface DraftShape {
  teamCount: number;
  rounds: number;
}

/**
 * How many example players to offer per likely position.
 *
 * A named, injectable module constant rather than a `parameters.ts` key: the PRD names no
 * number here (AC-36 asks only for "example likely players"), and this is a display budget, not
 * one of the 🔶 AS-N tuning knobs the constitution requires be configurable.
 */
export const DEFAULT_EXAMPLES_PER_POSITION = 2;

/** Where a pick number lands on the board: its round, and the column that would normally own it. */
function locatePick(pickNo: number, teamCount: number): { round: number; draftSlot: number } {
  const round = Math.floor((pickNo - 1) / teamCount) + 1;
  const indexInRound = pickNo - (round - 1) * teamCount;
  // Snake: odd rounds run 1..teams, even rounds run teams..1.
  const draftSlot = round % 2 === 1 ? indexInRound : teamCount + 1 - indexInRound;
  return { round, draftSlot };
}

/**
 * Every pick in the draft, in order, with ownership already resolved.
 *
 * Ownership is whatever `ownerOf` says, so a pick acquired by trade belongs to the acquiring
 * seat here exactly as it does in the pick feed — the board column it is drafted from is only an
 * input to that resolution, never the answer (AC-34).
 */
export function buildPickSequence(shape: DraftShape, ownerOf: PickOwnerResolver): WindowPick[] {
  const total = shape.teamCount * shape.rounds;
  const picks: WindowPick[] = [];
  for (let pickNo = 1; pickNo <= total; pickNo += 1) {
    const { round, draftSlot } = locatePick(pickNo, shape.teamCount);
    picks.push({ pickNo, round, teamId: ownerOf(round, draftSlot) });
  }
  return picks;
}

/**
 * How many picks each team still owns, counting from the in-progress pick onward (AC-35).
 *
 * The in-progress pick counts as remaining for whoever owns it: they have not made it yet.
 */
export function countRemainingPicks(
  sequence: readonly WindowPick[],
  picksMade: number,
): Map<string, number> {
  const remaining = new Map<string, number>();
  for (const pick of sequence) {
    const current = remaining.get(pick.teamId) ?? 0;
    remaining.set(pick.teamId, pick.pickNo > picksMade ? current + 1 : current);
  }
  return remaining;
}

export interface ComputeWindowInput extends DraftShape {
  /** How many picks the board reports as made — the pick feed's own length. */
  picksMade: number;
  /** The user's seat, or null while AC-5's manual slot choice is outstanding. */
  userTeamId: string | null;
  ownerOf: PickOwnerResolver;
}

/**
 * The window (AC-34).
 *
 * Returns an empty window — with every anchor null that has no answer — in each of the cases
 * where there is genuinely nothing between now and a turn the user will take: the draft is over,
 * the user has no pick left (AC-45's suppression trigger), or their seat is still unresolved
 * (AC-5, where a guessed seat would be worse than none).
 */
export function computeWindow(input: ComputeWindowInput): DraftWindow {
  return windowFromSequence(
    buildPickSequence(input, input.ownerOf),
    input.picksMade,
    input.userTeamId,
  );
}

function windowFromSequence(
  sequence: readonly WindowPick[],
  picksMade: number,
  userTeamId: string | null,
): DraftWindow {
  const inProgress = sequence[picksMade] ?? null;
  const inProgressPickNo = inProgress?.pickNo ?? null;

  const empty: DraftWindow = {
    picks: [],
    userOnTheClock: false,
    inProgressPickNo,
    currentUserPickNo: null,
    nextUserPickNo: null,
  };
  if (inProgress === null || userTeamId === null) return empty;

  const userOnTheClock = inProgress.teamId === userTeamId;
  // The user's own in-progress pick is never inside the window and is never simulated (Terms).
  const startIndex = userOnTheClock ? picksMade + 1 : picksMade;
  const nextUserIndex = sequence.findIndex(
    (pick, index) => index >= startIndex && pick.teamId === userTeamId,
  );
  const currentUserPickNo = userOnTheClock ? inProgress.pickNo : null;

  if (nextUserIndex === -1) return { ...empty, userOnTheClock, currentUserPickNo };

  return {
    picks: sequence.slice(startIndex, nextUserIndex),
    userOnTheClock,
    inProgressPickNo,
    currentUserPickNo,
    nextUserPickNo: sequence[nextUserIndex]!.pickNo,
  };
}

// ---------------------------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------------------------

/**
 * The shape of a snapshot player this module needs to offer them as an example.
 *
 * Declared structurally and narrowly, following FR-4's own convention: T3's `MatchedPlayer`
 * satisfies it, without this module importing the ingestion layer's full vocabulary.
 */
export interface ExampleCandidate {
  sleeperPlayerId: string;
  playerName: string;
  position: Position;
  /** Overall ECR rank — the ordering authority a missing ADP falls back to (AC-26, 🔶 AS-8). */
  ecrRank: number;
  /** FFC ADP, or null when the snapshot has no row for this player (AC-26). */
  adp: number | null;
}

export interface OpponentPanelInput {
  window: DraftWindow;
  /** T4's `RosterPanelTracker.panelFor` — one roster panel per seat, from the same board. */
  panelFor: (teamId: string) => RosterPanelData;
  /** Per-team remaining picks, from {@link countRemainingPicks} (AC-35). */
  remainingPicks: ReadonlyMap<string, number>;
  /** The matched ECR/ADP snapshot players (T3). Drafted ones are filtered out here. */
  players: readonly ExampleCandidate[];
  /** The board, read only to exclude players it already shows drafted. */
  board: Pick<Board, 'players'>;
  examplesPerPosition?: number;
}

type SkillCandidate = ExampleCandidate & { position: SkillPosition };
type RankedCandidate = SkillCandidate & { samplingRank: number };

/**
 * Available snapshot players in the order a pick would be drawn from them: ADP order within a
 * position, with a player carrying no ADP slotted in by ECR order instead (AC-26).
 *
 * The ordering is recomputed over the *available* players rather than read off the snapshot's
 * precomputed ranks, because that fallback is a position within a group: once the players ahead
 * of an ADP-less player are off the board, his place in what is left moves with them.
 */
const orderAvailable = (
  players: readonly ExampleCandidate[],
  board: Pick<Board, 'players'>,
): { byPosition: Map<SkillPosition, RankedCandidate[]>; bestAvailable: RankedCandidate[] } => {
  const available = players.filter(
    (player): player is SkillCandidate =>
      isSkillPosition(player.position) && board.players[player.sleeperPlayerId]?.drafted !== true,
  );

  const byPosition = new Map<SkillPosition, RankedCandidate[]>();
  for (const position of SKILL_POSITIONS) {
    const group = available.filter((player) => player.position === position);
    byPosition.set(position, assignSamplingRanks(group));
  }

  // The best-available regime samples across the skill positions, not within one (Terms).
  return { byPosition, bestAvailable: assignSamplingRanks(available) };
};

const asExample = (player: SkillCandidate): OpponentExamplePlayer => ({
  playerId: player.sleeperPlayerId,
  playerName: player.playerName,
  position: player.position,
  adp: player.adp,
  confidence: 'player-example',
});

/**
 * Ranks the positions a team's need vector actually points at (AC-36).
 *
 * Ties resolve in the canonical QB/RB/WR/TE order — a team needing one RB, one WR and one TE
 * has three genuinely equal likelihoods, and an unchanged board must render them in the same
 * order every time rather than reshuffling under the reader.
 */
const rankPositions = (
  distribution: Record<Position, number>,
): OpponentPanelEntry['mostLikelyPositions'] =>
  SKILL_POSITIONS.map((position, order) => ({ position, order }))
    .filter(({ position }) => distribution[position] > 0)
    .sort((a, b) => distribution[b.position] - distribution[a.position] || a.order - b.order)
    .map(({ position }) => ({
      position,
      likelihood: distribution[position],
      confidence: 'position' as const,
    }));

/**
 * One panel row per window pick (AC-34) — never deduped by team, since a team picking twice
 * before the user's next turn genuinely faces the decision twice.
 */
export function buildOpponentPanel(input: OpponentPanelInput): OpponentPanelEntry[] {
  const limit = input.examplesPerPosition ?? DEFAULT_EXAMPLES_PER_POSITION;
  const { byPosition, bestAvailable } = orderAvailable(input.players, input.board);

  return input.window.picks.map((pick) => {
    const roster = input.panelFor(pick.teamId);
    const needVector = roster.needVector;

    // A team with no unfilled starting slot has no position-level prediction to display: it
    // drafts best-available from ADP order (Terms). Publishing a zero or uniform distribution
    // would dress that regime up as a prediction it is not.
    const needDistribution =
      needVector === NO_NEED_SIGNAL ? null : normalizeToDistribution(needVector);
    const mostLikelyPositions = needDistribution === null ? [] : rankPositions(needDistribution);

    const examplePlayers =
      needDistribution === null
        ? bestAvailable.slice(0, limit).map(asExample)
        : mostLikelyPositions.flatMap(({ position }) =>
            (byPosition.get(position) ?? []).slice(0, limit).map(asExample),
          );

    return {
      pickNo: pick.pickNo,
      round: pick.round,
      teamId: pick.teamId,
      unfilledStartingSlots: roster.unfilledStartingSlots,
      needVector,
      needDistribution,
      remainingPicks: input.remainingPicks.get(pick.teamId) ?? 0,
      mostLikelyPositions,
      examplePlayers,
    };
  });
}

export interface OpponentPanelSource
  extends Omit<OpponentPanelInput, 'window' | 'remainingPicks'>, ComputeWindowInput {}

/**
 * Window and panel in one call — what the orchestrator recomputes per burst-settled pick event.
 *
 * The window comes back alongside the rows because AC-34's surface is the window itself: the
 * caller needs the anchors (whose clock it is, which pick the window closes at) to caption the
 * rows, and re-deriving them would be a second chance to get the off-by-one wrong.
 */
export function computeOpponentPanel(source: OpponentPanelSource): {
  window: DraftWindow;
  entries: OpponentPanelEntry[];
} {
  const sequence = buildPickSequence(source, source.ownerOf);
  const draftWindow = windowFromSequence(sequence, source.picksMade, source.userTeamId);

  return {
    window: draftWindow,
    entries: buildOpponentPanel({
      window: draftWindow,
      panelFor: source.panelFor,
      remainingPicks: countRemainingPicks(sequence, source.picksMade),
      players: source.players,
      board: source.board,
      ...(source.examplesPerPosition === undefined
        ? {}
        : { examplesPerPosition: source.examplesPerPosition }),
    }),
  };
}
