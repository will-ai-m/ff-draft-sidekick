import { PARAMETER_DEFAULTS, NO_NEED_SIGNAL } from '@sidekick/shared';
import type {
  Board,
  DraftWindow,
  NeedVector,
  Position,
  SkillPosition,
  Survival,
} from '@sidekick/shared';
import { describe, expect, it } from 'vitest';

import { simulateSurvival, survivalBand } from '../simulation/montecarlo';
import type { SurvivalProjection } from '../simulation/montecarlo';
import {
  availableInEcrOrder,
  candidateSimulationIds,
  computeCandidateList,
  filterCandidateRows,
} from './candidates';
import type { CandidateListConfig, CandidatePlayer } from './candidates';

// ---------------------------------------------------------------------------------------------
// Fixture. Fourteen players with hand-chosen ECR ranks and ADPs; every expected number and every
// expected reason string below is derived by eye from AC-55's arithmetic, never from a run.
// ---------------------------------------------------------------------------------------------

const player = (
  sleeperPlayerId: string,
  playerName: string,
  position: Position,
  ecrRank: number | null,
  positionalRank: number | null,
  adp: number | null,
): CandidatePlayer => ({
  sleeperPlayerId,
  playerName,
  position,
  team: 'FA',
  ecrRank,
  positionalRank,
  adp,
});

const SNAPSHOT: CandidatePlayer[] = [
  player('rb1', 'Bijan Robinson', 'RB', 1, 1, 1.5),
  player('wr1', "Ja'Marr Chase", 'WR', 2, 1, 2.4),
  player('rb2', 'Jahmyr Gibbs', 'RB', 3, 2, 3.8),
  player('wr2', 'Justin Jefferson', 'WR', 4, 2, 4.2),
  player('te1', 'Brock Bowers', 'TE', 5, 1, 12),
  player('qb1', 'Josh Allen', 'QB', 6, 1, 30),
  player('rb3', 'Saquon Barkley', 'RB', 7, 3, 8),
  player('wr3', 'CeeDee Lamb', 'WR', 8, 3, 6),
  player('te2', 'Trey McBride', 'TE', 9, 2, 38),
  player('qb2', 'Lamar Jackson', 'QB', 10, 2, 45),
  player('rb4', 'Derrick Henry', 'RB', 11, 4, 14),
  player('wr4', 'Amon-Ra St. Brown', 'WR', 12, 4, 9),
  player('k1', 'Brandon Aubrey', 'K', 150, 1, 140),
  player('dst1', 'Houston Texans', 'DST', 155, 1, 145),
];

const UNIVERSE = SNAPSHOT.filter((p) => p.position !== 'K' && p.position !== 'DST').map((p) => ({
  id: p.sleeperPlayerId,
  position: p.position as SkillPosition,
  ecrRank: p.ecrRank!,
}));

const boardOf = (drafted: readonly string[] = []): Pick<Board, 'players'> => ({
  players: Object.fromEntries(drafted.map((id) => [id, { drafted: true }])),
});

const need = (weights: Partial<Record<Position, number>>): NeedVector => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
  ...weights,
});

const config = (overrides: Partial<CandidateListConfig> = {}): CandidateListConfig => ({
  candidateListDefaultRows: PARAMETER_DEFAULTS.candidateListDefaultRows,
  valueThresholdAdpPicksEarlier: PARAMETER_DEFAULTS.valueThresholdAdpPicksEarlier,
  nearTieSurvivalPct: PARAMETER_DEFAULTS.nearTieSurvivalPct,
  nearTieEcrRanks: PARAMETER_DEFAULTS.nearTieEcrRanks,
  planTotalTooCloseEcrRanks: PARAMETER_DEFAULTS.planTotalTooCloseEcrRanks,
  lookaheadMaxPicks: PARAMETER_DEFAULTS.lookaheadMaxPicks,
  benchPositionHeadroom: PARAMETER_DEFAULTS.benchPositionHeadroom,
  flexEligiblePositions: PARAMETER_DEFAULTS.flexEligiblePositions,
  ...overrides,
});

const windowAt = (inProgressPickNo: number, nextUserPickNo: number | null): DraftWindow => ({
  picks: [],
  userOnTheClock: true,
  inProgressPickNo,
  currentUserPickNo: inProgressPickNo,
  nextUserPickNo,
});

/** AC-43's per-run survivor matrix, stated by hand so every expectation stays arithmetic. */
const projectionOf = (
  runs: readonly (readonly string[])[],
  universe: readonly { id: string; position: SkillPosition; ecrRank: number }[] = UNIVERSE,
): SurvivalProjection => {
  const size = universe.length;
  const runCount = runs.length;
  const survivors = new Uint8Array(runCount * size);
  const indexByPlayerId = new Map<string, number>();
  universe.forEach((entry, index) => indexByPlayerId.set(entry.id, index));

  runs.forEach((survivorIds, run) => {
    for (const id of survivorIds) {
      const index = indexByPlayerId.get(id);
      if (index === undefined)
        throw new Error(`fixture names a survivor outside the universe: ${id}`);
      survivors[run * size + index] = 1;
    }
  });

  const survivalByPlayerId = new Map<string, Survival>();
  universe.forEach((entry, index) => {
    let survived = 0;
    for (let run = 0; run < runCount; run += 1) survived += survivors[run * size + index]!;
    const probability = survived / runCount;
    survivalByPlayerId.set(entry.id, {
      probability,
      band: survivalBand(probability, PARAMETER_DEFAULTS),
    });
  });

  return {
    suppressed: false,
    degraded: false,
    runCount,
    universe: universe.map((entry, index) => ({
      sleeperPlayerId: entry.id,
      position: entry.position,
      ecrRank: entry.ecrRank,
      adp: null,
      index,
      samplingRank: index + 1,
      addedForDisplay: false,
    })),
    survivors,
    survivalByPlayerId,
    indexByPlayerId,
  };
};

const twice = (survivorIds: readonly string[]): SurvivalProjection =>
  projectionOf([survivorIds, survivorIds]);

/** RB deep and safe, WR thinning: rb1 and rb4 hold, wr1 and wr2 are gone. */
const RB_DEEP_WR_THIN = twice(['rb1', 'rb4', 'wr3', 'wr4', 'te1', 'te2', 'qb1', 'qb2']);
/** The mirror image: every RB is gone, wr1 survives. */
const RB_GONE_WR_SAFE = twice(['wr1', 'wr3', 'wr4', 'te1', 'te2', 'qb1', 'qb2']);
/** Both headliners hold, and their next men are far back. */
const BOTH_HOLD = twice(['rb1', 'wr1', 'rb4', 'wr4', 'te1', 'te2', 'qb1', 'qb2']);

const listOf = (overrides: Partial<Parameters<typeof computeCandidateList>[0]> = {}) =>
  computeCandidateList({
    players: SNAPSHOT,
    board: boardOf(),
    window: windowAt(12, 20),
    needVector: need({ RB: 1, WR: 1 }),
    survival: RB_DEEP_WR_THIN,
    userRemainingPicks: 4,
    config: config(),
    ...overrides,
  });

// ---------------------------------------------------------------------------------------------
// The six §T8 "done when" scenarios — one assertion of the highlighted player and one of the
// exact reason string per scenario.
// ---------------------------------------------------------------------------------------------

describe('the highlight and its one-line reason (AC-51, AC-52, AC-56, AC-58, AC-59)', () => {
  it('a plan/survival-driven pick: the winning plan moves the highlight off the top-ECR candidate', () => {
    // term1: RB 1, WR 2. term2: RB 1, RB-less-rb1 11, WR 8, WR-less-wr1 8.
    // (RB,RB) 12 | (RB,WR) 9 | (WR,RB) 3 | (WR,WR) 10 -> WR now, RB next.
    const list = listOf();
    expect(list.highlightPlayerId).toBe('wr1');
    expect(list.reasonKind).toBe('plan-survival');
    expect(list.reason).toBe(
      "Plan WR now / RB next scores best (3 vs 9) — Ja'Marr Chase over higher-ECR Bijan Robinson.",
    );
  });

  it('a need-driven pick: the top-ECR candidate’s position has no unfilled starting slot', () => {
    const list = listOf({ needVector: need({ WR: 1 }) });
    expect(list.highlightPlayerId).toBe('wr1');
    expect(list.reasonKind).toBe('need');
    expect(list.reason).toBe(
      "Bijan Robinson (RB) fills no unfilled starting slot — Ja'Marr Chase (WR) does.",
    );
  });

  it('a value-driven pick: the top-ECR candidate whose ADP is ≥10 picks earlier than this pick', () => {
    // Every RB is gone by the next turn, so (RB,WR) at 1 + 2 = 3 wins and rb1 stays highlighted.
    const list = listOf({ survival: RB_GONE_WR_SAFE, window: windowAt(12, 20) });
    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).toBe('value');
    expect(list.reason).toBe(
      'Value: Bijan Robinson is the top available player, and an ADP of 1.5 is 10.5 picks earlier than pick 12.',
    );
  });

  it('a best-available pick: the same board, one round earlier, with no value gap to name', () => {
    const list = listOf({ survival: RB_GONE_WR_SAFE, window: windowAt(5, 13) });
    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).toBe('best-available');
    expect(list.reason).toBe('Best available: Bijan Robinson (ECR 1).');
  });

  it('a roster with every starting slot filled has no plan to compare, so best available stands', () => {
    const list = listOf({ needVector: NO_NEED_SIGNAL, window: windowAt(5, 13) });
    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).toBe('best-available');
    expect(list.planComparison?.applicable).toBe(true);
    expect(list.planComparison?.winner).toBeNull();
  });

  it('a too-close-to-call pick: the highlight stays put and the reason line is replaced (AC-52)', () => {
    const list = listOf({ needVector: need({ WR: 1 }), survival: BOTH_HOLD });
    expect(list.highlightPlayerId).toBe('wr1');
    expect(list.reasonKind).toBe('too-close-to-call');
    expect(list.reason).toBe(
      "Too close to call: Ja'Marr Chase (ECR 2, 100% survival) and Bijan Robinson (RB, ECR 1, 100% survival) — staying with Ja'Marr Chase.",
    );
  });

  it('a fewer-than-two-picks pick: plan comparison is skipped and lookahead is stated (AC-59)', () => {
    const list = listOf({
      window: windowAt(150, null),
      survival: null,
      userRemainingPicks: 1,
    });
    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).toBe('lookahead-not-applicable');
    expect(list.reason).toBe(
      'Lookahead does not apply with 1 pick left — best available: Bijan Robinson (ECR 1).',
    );
    expect(list.planComparison?.applicable).toBe(false);
    expect(list.planComparison?.winner).toBeNull();
  });

  it('a plan-totals-within-3 pick: it falls back to the higher-ECR current pick and says so (AC-58)', () => {
    // Every RB survives: (RB,RB) 1 + 3 = 4 sits one rank off (WR,RB) 2 + 1 = 3.
    const list = listOf({ survival: twice(['rb1', 'rb2', 'rb3', 'rb4', 'wr3', 'wr4']) });
    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).toBe('too-close-to-call');
    expect(list.reason).toBe(
      'Plan totals within 3 ECR ranks (3 vs 4) — too close to separate, taking the higher-ECR player now: Bijan Robinson (ECR 1).',
    );
  });
});

describe('merging the two tie statements (AC-52, AC-58)', () => {
  it('renders one line carrying both, never two statements', () => {
    // (RB,WR) and (WR,RB) both score 3, and rb1/wr1 are one ECR rank and zero survival points apart.
    const list = listOf({ survival: BOTH_HOLD });
    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).toBe('too-close-to-call');
    expect(list.reason).toBe(
      "Too close to call: Bijan Robinson (ECR 1, 100% survival) and Ja'Marr Chase (WR, ECR 2, 100% survival) — staying with Bijan Robinson. " +
        'Plan totals within 3 ECR ranks (3 vs 3) — too close to separate, taking the higher-ECR player now: Bijan Robinson (ECR 1).',
    );
    expect(list.reason?.split('Too close to call').length).toBe(2);
  });

  it('does not fire the within-noise test against a candidate at the highlight’s own position', () => {
    // rb1 and rb2 are two ECR ranks apart with identical survival, but AC-52 is cross-position only.
    const list = listOf({
      needVector: need({ RB: 1 }),
      survival: twice(['rb1', 'rb2', 'te1', 'qb1']),
    });
    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).not.toBe('too-close-to-call');
  });

  it('cannot fire the within-noise test without survival for both candidates', () => {
    const list = listOf({ window: windowAt(150, null), survival: null, userRemainingPicks: 1 });
    expect(list.reasonKind).toBe('lookahead-not-applicable');
  });
});

// ---------------------------------------------------------------------------------------------
// The rows themselves
// ---------------------------------------------------------------------------------------------

describe('candidate rows (AC-49, AC-53, AC-45)', () => {
  it('shows the top `candidateListDefaultRows` available players in raw ECR order (🔶 AS-8)', () => {
    const rows = listOf().rows;
    expect(rows.map((row) => row.playerId)).toEqual([
      'rb1',
      'wr1',
      'rb2',
      'wr2',
      'te1',
      'qb1',
      'rb3',
      'wr3',
    ]);
  });

  it('carries overall ECR rank, positional rank, ADP and survival on every row', () => {
    const row = listOf().rows[1]!;
    expect(row).toMatchObject({
      playerId: 'wr1',
      playerName: "Ja'Marr Chase",
      position: 'WR',
      ecrRank: 2,
      positionalRank: 1,
      adp: 2.4,
      addedForHighlight: false,
    });
    expect(row.survival).toEqual({ probability: 0, band: 'likely-gone' });
  });

  it('extends the list to include a highlight outside the default rows (AC-49, AC-56)', () => {
    const list = listOf({
      needVector: need({ TE: 1 }),
      config: config({ candidateListDefaultRows: 4 }),
    });
    expect(list.highlightPlayerId).toBe('te1');
    expect(list.rows.map((row) => row.playerId)).toEqual(['rb1', 'wr1', 'rb2', 'wr2', 'te1']);
    expect(list.rows.at(-1)?.addedForHighlight).toBe(true);
  });

  it('drops drafted players before ranking, and never highlights one (AC-53)', () => {
    const list = listOf({
      board: boardOf(['rb1', 'wr1']),
      survival: twice(['rb2', 'rb4', 'wr3', 'wr4', 'te1', 'te2', 'qb1', 'qb2']),
    });
    expect(list.rows.map((row) => row.playerId)).toEqual([
      'rb2',
      'wr2',
      'te1',
      'qb1',
      'rb3',
      'wr3',
      'te2',
      'qb2',
    ]);
    expect(list.highlightPlayerId).toBe('wr2');
  });

  it('suppresses survival on every row when the user has no next pick (AC-45)', () => {
    const list = listOf({ window: windowAt(150, null), survival: null, userRemainingPicks: 1 });
    expect(list.rows.every((row) => row.survival === null)).toBe(true);
  });

  it('leaves survival null for a displayed player the projection never simulated', () => {
    const withoutTe1 = UNIVERSE.filter((entry) => entry.id !== 'te1');
    const partial = projectionOf([withoutTe1.map((entry) => entry.id)], withoutTe1);
    const rows = listOf({ survival: partial }).rows;
    expect(rows.find((row) => row.playerId === 'te1')?.survival).toBeNull();
    expect(rows.find((row) => row.playerId === 'rb1')?.survival).not.toBeNull();
  });

  it('orders available players by ECR, drafted ones removed', () => {
    expect(
      availableInEcrOrder(SNAPSHOT, boardOf(['rb1']))
        .slice(0, 3)
        .map((p) => p.sleeperPlayerId),
    ).toEqual(['wr1', 'rb2', 'wr2']);
  });
});

describe('the position filter (AC-50)', () => {
  it('shows one position in ECR order, with survival intact for a skill position', () => {
    const rows = filterCandidateRows({
      players: SNAPSHOT,
      board: boardOf(),
      position: 'RB',
      survival: RB_DEEP_WR_THIN,
      config: config(),
    });
    expect(rows.map((row) => row.playerId)).toEqual(['rb1', 'rb2', 'rb3', 'rb4']);
    expect(rows[0]?.survival?.band).toBe('likely-available');
  });

  it('shows K in positional ECR order with no survival math (🔶 AS-7)', () => {
    const rows = filterCandidateRows({
      players: SNAPSHOT,
      board: boardOf(),
      position: 'K',
      survival: RB_DEEP_WR_THIN,
      config: config(),
    });
    expect(rows.map((row) => row.playerId)).toEqual(['k1']);
    expect(rows[0]?.survival).toBeNull();
  });

  // AC-50's "falling back to ADP order when the snapshot carries no K/DST rankings" is covered
  // end to end instead, over the real ingest pipeline: see orchestrator.test.ts, "AC-50 — the
  // K/DST filter when the ECR snapshot ranks no K or DST". Hand-built ADP-only rows proved
  // nothing about whether the pipeline can produce them.

  it('excludes drafted players from a filtered view too (AC-53)', () => {
    const rows = filterCandidateRows({
      players: SNAPSHOT,
      board: boardOf(['rb1', 'rb3']),
      position: 'RB',
      survival: RB_DEEP_WR_THIN,
      config: config(),
    });
    expect(rows.map((row) => row.playerId)).toEqual(['rb2', 'rb4']);
  });
});

describe('the simulation universe extension (AC-42)', () => {
  it('names every default row plus the best available at each skill position', () => {
    const ids = candidateSimulationIds({
      players: SNAPSHOT,
      board: boardOf(),
      config: config({ candidateListDefaultRows: 4 }),
    });
    expect(new Set(ids)).toEqual(new Set(['rb1', 'wr1', 'rb2', 'wr2', 'te1', 'qb1']));
  });

  it('never names a drafted player or a K/DST (🔶 AS-7)', () => {
    const ids = candidateSimulationIds({
      players: SNAPSHOT,
      board: boardOf(['rb1']),
      config: config(),
    });
    expect(ids).not.toContain('rb1');
    expect(ids).not.toContain('k1');
    expect(ids).not.toContain('dst1');
  });
});

describe('the disabled state (AC-28)', () => {
  it('states why rather than rendering a silently empty list when no ECR snapshot is loaded', () => {
    const list = listOf({ players: [] });
    expect(list.rows).toEqual([]);
    expect(list.highlightPlayerId).toBeNull();
    expect(list.disabledReason).toBe(
      'No rankings snapshot loaded — candidates, survival and recommendations are unavailable.',
    );
  });
});

// ---------------------------------------------------------------------------------------------
// The seam to FR-8, exercised against the real engine rather than a hand-built matrix.
// ---------------------------------------------------------------------------------------------

describe('composed against T7’s own simulation output', () => {
  it('scores plans from a real projection whose universe was extended by the candidate rows', () => {
    const board = boardOf();
    const simulationConfig = {
      simUniverseSize: 6,
      monteCarloRunCount: 200,
      reachAdjustmentPerPick: PARAMETER_DEFAULTS.reachAdjustmentPerPick,
      kdstEarlyPickWindow: PARAMETER_DEFAULTS.kdstEarlyPickWindow,
      survivalBandLikelyGoneMax: PARAMETER_DEFAULTS.survivalBandLikelyGoneMax,
      survivalBandLikelyAvailableMin: PARAMETER_DEFAULTS.survivalBandLikelyAvailableMin,
    };
    const ensureIncluded = candidateSimulationIds({ players: SNAPSHOT, board, config: config() });

    const projection = simulateSurvival({
      window: {
        picks: [
          { pickNo: 13, round: 2, teamId: 't2' },
          { pickNo: 14, round: 2, teamId: 't3' },
        ],
        userOnTheClock: true,
        inProgressPickNo: 12,
        currentUserPickNo: 12,
        nextUserPickNo: 15,
      },
      picks: [
        { pickNo: 13, teamId: 't2', averageReach: 0, unfilledKDstSlots: 0, remainingPicks: 5 },
        { pickNo: 14, teamId: 't3', averageReach: 0, unfilledKDstSlots: 0, remainingPicks: 5 },
      ],
      players: SNAPSHOT.map((p) => ({
        sleeperPlayerId: p.sleeperPlayerId,
        position: p.position,
        ecrRank: p.ecrRank!,
        adp: p.adp,
      })),
      board,
      config: simulationConfig,
      ensureIncluded,
    });

    // Every skill row the list displays is inside the universe the projection ran over (AC-42).
    for (const id of ensureIncluded) {
      expect(projection.indexByPlayerId.has(id)).toBe(true);
    }

    const list = computeCandidateList({
      players: SNAPSHOT,
      board,
      window: windowAt(12, 15),
      needVector: need({ RB: 1, WR: 1 }),
      survival: projection,
      userRemainingPicks: 4,
      config: config(),
    });

    expect(list.highlightPlayerId).not.toBeNull();
    expect(list.planComparison?.winner).not.toBeNull();
    expect(list.rows.every((row) => row.survival !== null)).toBe(true);
  });
});
