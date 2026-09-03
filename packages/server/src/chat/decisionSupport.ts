import { SKILL_POSITIONS, isSkillPosition } from '@sidekick/shared';
import type {
  Board,
  CandidateListData,
  CandidateRow,
  DraftWindow,
  OpponentPanelEntry,
  Position,
  RosterPanelData,
  SkillPosition,
} from '@sidekick/shared';

import type { SidekickConfig } from '../config/loadConfig';
import { candidateSimulationIds } from '../recommend/candidates';
import { simulateSurvival, survivedInRun, toSimulatedPicks } from '../simulation/montecarlo';
import type { SimulationSelection } from '../simulation/montecarlo';
import type { EcrMatchedPlayer } from '../snapshots/types';

const MAX_FOCUS_PLAYERS = 4;
const FALLBACKS_PER_POSITION = 3;

const normalized = (value: string): string =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const questionNames = (question: string, players: readonly EcrMatchedPlayer[]): Set<string> => {
  const words = new Set(
    normalized(question)
      .split(' ')
      .filter((word) => word.length >= 4),
  );
  return new Set(
    players
      .filter((player) => {
        const name = normalized(player.playerName);
        if (name !== '' && normalized(question).includes(name)) return true;
        return name.split(' ').some((part) => part.length >= 4 && words.has(part));
      })
      .map((player) => player.sleeperPlayerId),
  );
};

const uniqueRows = (rows: readonly CandidateRow[]): CandidateRow[] => {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.playerId)) return false;
    seen.add(row.playerId);
    return true;
  });
};

const focusRows = (
  question: string,
  recommendation: CandidateListData,
  players: readonly EcrMatchedPlayer[],
): CandidateRow[] => {
  const mentioned = questionNames(question, players);
  const allRows = uniqueRows([
    ...recommendation.rows,
    ...Object.values(recommendation.rowsByPosition ?? {}).flatMap((rows) => rows ?? []),
  ]);
  const recommended = allRows.find((row) => row.playerId === recommendation.highlightPlayerId);
  const selected = uniqueRows([
    ...(recommended === undefined ? [] : [recommended]),
    ...allRows.filter((row) => mentioned.has(row.playerId)),
  ]);

  // If the question names no alternative, compare the recommendation with the best available
  // player at other positions. Four forced simulations keep question latency bounded.
  for (const row of allRows) {
    if (selected.length >= MAX_FOCUS_PLAYERS) break;
    if (!isSkillPosition(row.position)) continue;
    if (selected.some((candidate) => candidate.position === row.position)) continue;
    selected.push(row);
  }
  return selected.slice(0, MAX_FOCUS_PLAYERS);
};

const topRowsByPosition = (
  recommendation: CandidateListData,
): Record<SkillPosition, CandidateRow[]> =>
  Object.fromEntries(
    SKILL_POSITIONS.map((position) => [
      position,
      uniqueRows([
        ...(recommendation.rowsByPosition?.[position] ?? []),
        ...recommendation.rows.filter((row) => row.position === position),
      ]).slice(0, FALLBACKS_PER_POSITION),
    ]),
  ) as Record<SkillPosition, CandidateRow[]>;

const roleFor = (
  position: Position,
  roster: RosterPanelData | null,
  flexShare: Partial<Record<SkillPosition, number>>,
): string => {
  if (roster === null) return 'unknown';
  if ((roster.unfilledStartingSlots.dedicated[position] ?? 0) > 0) {
    return 'fills an open dedicated starter';
  }
  if (
    isSkillPosition(position) &&
    roster.unfilledStartingSlots.flex > 0 &&
    (flexShare[position] ?? 0) > 0
  ) {
    return 'can fill an open FLEX slot';
  }
  return 'adds bench depth';
};

export interface DecisionSupportInput {
  question: string;
  recommendation: CandidateListData;
  players: readonly EcrMatchedPlayer[];
  board: Board;
  entries: readonly OpponentPanelEntry[];
  window: DraftWindow;
  config: SidekickConfig;
  degraded: boolean;
  roster: RosterPanelData | null;
  flexShare: Partial<Record<SkillPosition, number>>;
  teamNames: Readonly<Record<string, string>>;
}

/**
 * Question-time, deterministic counterfactuals for the LLM. Each scenario removes one candidate
 * as though the user drafted them now, then reruns the same opponent window. This is deliberately
 * separate from the recommendation engine: it explains consequences without changing the pick.
 */
export function buildDecisionSupport(input: DecisionSupportInput): Record<string, unknown> {
  const focus = focusRows(input.question, input.recommendation, input.players);
  const fallbacks = topRowsByPosition(input.recommendation);
  const playerById = new Map(input.players.map((player) => [player.sleeperPlayerId, player]));
  const ensureIncluded = new Set([
    ...candidateSimulationIds({ players: input.players, board: input.board, config: input.config }),
    ...focus.map((row) => row.playerId),
    ...SKILL_POSITIONS.flatMap((position) => fallbacks[position].map((row) => row.playerId)),
  ]);

  const scenarios = focus.map((taken) => {
    const forcedBoard: Board = {
      teams: input.board.teams,
      players: {
        ...input.board.players,
        [taken.playerId]: { drafted: true },
      },
    };
    const selectionsByStep = input.window.picks.map(() => ({
      positions: new Map<string, number>(),
      players: new Map<string, number>(),
    }));
    const selectionsByTeam = new Map<
      string,
      { positions: Map<string, number>; players: Map<string, number> }
    >();
    const recordSelection = (selection: SimulationSelection): void => {
      const step = selectionsByStep[selection.step];
      if (step === undefined) return;
      step.positions.set(selection.position, (step.positions.get(selection.position) ?? 0) + 1);
      if (selection.playerId !== null) {
        step.players.set(selection.playerId, (step.players.get(selection.playerId) ?? 0) + 1);
      }
      const team = selectionsByTeam.get(selection.teamId) ?? {
        positions: new Map<string, number>(),
        players: new Map<string, number>(),
      };
      team.positions.set(selection.position, (team.positions.get(selection.position) ?? 0) + 1);
      if (selection.playerId !== null) {
        team.players.set(selection.playerId, (team.players.get(selection.playerId) ?? 0) + 1);
      }
      selectionsByTeam.set(selection.teamId, team);
    };
    const projection = simulateSurvival({
      window: input.window,
      picks: toSimulatedPicks(input.entries),
      players: input.players,
      board: forcedBoard,
      config: input.config,
      ensureIncluded: [...ensureIncluded].filter((id) => id !== taken.playerId),
      degraded: input.degraded,
      onSelection: recordSelection,
    });

    const rankedCounts = (counts: ReadonlyMap<string, number>, limit: number) =>
      [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    const opponentPickForecast = input.window.picks.map((pick, step) => {
      const counts = selectionsByStep[step]!;
      return {
        pickNo: pick.pickNo,
        team: input.teamNames[pick.teamId] ?? pick.teamId,
        teamId: pick.teamId,
        likelyPositions: rankedCounts(counts.positions, 4).map(([position, count]) => ({
          position,
          probability: projection.runCount === 0 ? null : count / projection.runCount,
        })),
        likelyPlayers: rankedCounts(counts.players, 5).map(([playerId, count]) => ({
          player: playerById.get(playerId)?.playerName ?? playerId,
          position: playerById.get(playerId)?.position ?? null,
          probability: projection.runCount === 0 ? null : count / projection.runCount,
        })),
      };
    });
    const opponentTeamForecast = [...selectionsByTeam.entries()].map(([teamId, counts]) => ({
      team: input.teamNames[teamId] ?? teamId,
      teamId,
      picksBeforeNextTurn: input.window.picks.filter((pick) => pick.teamId === teamId).length,
      expectedSelectionsByPosition: rankedCounts(counts.positions, 6).map(([position, count]) => ({
        position,
        expectedSelections: projection.runCount === 0 ? null : count / projection.runCount,
      })),
      probabilityTeamSelectsPlayerInAnyPick: rankedCounts(counts.players, 8).map(
        ([playerId, count]) => ({
          player: playerById.get(playerId)?.playerName ?? playerId,
          position: playerById.get(playerId)?.position ?? null,
          probability: projection.runCount === 0 ? null : count / projection.runCount,
        }),
      ),
    }));

    const nextTurnByPosition = Object.fromEntries(
      SKILL_POSITIONS.map((position) => {
        const candidates = fallbacks[position].filter((row) => row.playerId !== taken.playerId);
        let anyTopCandidateSurvives = 0;
        const bestSurvivorCounts = new Map<string, number>();
        for (let run = 0; run < projection.runCount; run += 1) {
          const best = candidates.find((row) => survivedInRun(projection, run, row.playerId));
          if (best === undefined) continue;
          anyTopCandidateSurvives += 1;
          bestSurvivorCounts.set(best.playerId, (bestSurvivorCounts.get(best.playerId) ?? 0) + 1);
        }
        return [
          position,
          {
            probabilityAtLeastOneTopFallbackSurvives:
              projection.runCount === 0 ? null : anyTopCandidateSurvives / projection.runCount,
            expectedBestFallbacks: candidates.map((candidate) => ({
              player: candidate.playerName,
              ecrRank: candidate.ecrRank,
              tier: candidate.tier,
              probabilityPlayerSurvives:
                projection.survivalByPlayerId.get(candidate.playerId)?.probability ?? null,
              probabilityPlayerIsBestListedSurvivor:
                projection.runCount === 0
                  ? null
                  : (bestSurvivorCounts.get(candidate.playerId) ?? 0) / projection.runCount,
            })),
          },
        ];
      }),
    );

    return {
      takeNow: {
        player: taken.playerName,
        position: taken.position,
        ecrRank: taken.ecrRank,
        tier: taken.tier,
        rosterEffect: roleFor(taken.position, input.roster, input.flexShare),
        baselineChanceLostIfUserWaits:
          taken.survival === null ? null : 1 - taken.survival.probability,
      },
      nextTurnByPosition,
      pairwiseOutcomes: focus
        .filter((other) => other.playerId !== taken.playerId)
        .map((other) => ({
          waitFor: other.playerName,
          position: other.position,
          probabilityStillAvailableNextTurn:
            projection.survivalByPlayerId.get(other.playerId)?.probability ?? null,
          probabilityLostBeforeNextTurn: projection.survivalByPlayerId.has(other.playerId)
            ? 1 - projection.survivalByPlayerId.get(other.playerId)!.probability
            : null,
        })),
      opponentPickForecast,
      opponentTeamForecast,
      forecastNote:
        "Each later pick is conditional on all earlier simulated selections. A team's second turn pick therefore reflects the position and player it took with its first pick.",
    };
  });

  const positionRunRisk = Object.fromEntries(
    SKILL_POSITIONS.map((position) => {
      const pickProbabilities = input.entries.map(
        (entry) =>
          entry.mostLikelyPositions.find((candidate) => candidate.position === position)
            ?.likelihood ?? 0,
      );
      const teams = [
        ...new Set(
          input.entries
            .filter((entry) => (entry.unfilledStartingSlots.dedicated[position] ?? 0) > 0)
            .map((entry) => input.teamNames[entry.teamId] ?? entry.teamId),
        ),
      ];
      return [
        position,
        {
          expectedSelectionsBeforeNextTurn: pickProbabilities.reduce(
            (sum, value) => sum + value,
            0,
          ),
          approximateProbabilityAtLeastOneSelection:
            1 - pickProbabilities.reduce((none, value) => none * (1 - value), 1),
          teamsWithOpenDedicatedStarter: teams,
          caveat:
            'The run probability is an independence approximation for explanation; forced-player availability above comes from the full Monte Carlo simulation.',
        },
      ];
    }),
  );

  return {
    method:
      'Each take-now scenario removes that player from the pool and reruns the full opponent window. Pairwise availability, fallbacks, and each opponent pick are recalculated consequences, not LLM estimates.',
    scenarioCount: scenarios.length,
    simulationsPerScenario: input.config.monteCarloRunCount,
    scenarios,
    positionRunRisk,
    interpretationOrder: [
      'Give direct advice.',
      'Explain the best two-pick sequence and opportunity cost.',
      'Name the opponents creating positional-run risk.',
      'State the principal downside and the best fallback.',
      'Use figures only as supporting evidence.',
    ],
  };
}
