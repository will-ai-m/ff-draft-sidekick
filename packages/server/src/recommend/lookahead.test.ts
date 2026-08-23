import { PARAMETER_DEFAULTS, NO_NEED_SIGNAL } from '@sidekick/shared';
import type { Board, NeedVector, Position, SkillPosition, Survival } from '@sidekick/shared';
import { describe, expect, it } from 'vitest';

import { survivalBand } from '../simulation/montecarlo';
import type { SurvivalProjection } from '../simulation/montecarlo';
import {
  DEFAULT_SHELF_SIZE,
  bestAvailableByPosition,
  comparePlans,
  enumeratePlans,
  expectedBestSurvivingRank,
  planPositions,
  worstOverallEcrRank,
} from './lookahead';
import type { LookaheadConfig, PlanPlayer } from './lookahead';

// ---------------------------------------------------------------------------------------------
// Fixture. Small enough that every term below is computed by eye: the whole point of AC-55 is an
// exact arithmetic claim, so nothing here is asserted against a number the code produced.
// ---------------------------------------------------------------------------------------------

const player = (
  sleeperPlayerId: string,
  playerName: string,
  position: Position,
  ecrRank: number,
): PlanPlayer => ({ sleeperPlayerId, playerName, position, ecrRank });

const SNAPSHOT: PlanPlayer[] = [
  player('rb1', 'Bijan Robinson', 'RB', 1),
  player('wr1', "Ja'Marr Chase", 'WR', 2),
  player('rb2', 'Jahmyr Gibbs', 'RB', 3),
  player('wr2', 'Justin Jefferson', 'WR', 4),
  player('te1', 'Brock Bowers', 'TE', 5),
  player('qb1', 'Josh Allen', 'QB', 6),
  player('rb3', 'Saquon Barkley', 'RB', 7),
  player('wr3', 'CeeDee Lamb', 'WR', 8),
  player('te2', 'Trey McBride', 'TE', 9),
  player('qb2', 'Lamar Jackson', 'QB', 10),
  player('rb4', 'Derrick Henry', 'RB', 11),
  player('wr4', 'Amon-Ra St. Brown', 'WR', 12),
  player('k1', 'Brandon Aubrey', 'K', 150),
  player('dst1', 'Houston Texans', 'DST', 155),
];

/** The snapshot's last-ranked overall ECR rank + 1 — AC-55's no-survivor penalty. */
const NO_SURVIVOR_RANK = 156;

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

const config = (overrides: Partial<LookaheadConfig> = {}): LookaheadConfig => ({
  planTotalTooCloseEcrRanks: PARAMETER_DEFAULTS.planTotalTooCloseEcrRanks,
  lookaheadMaxPicks: PARAMETER_DEFAULTS.lookaheadMaxPicks,
  ...overrides,
});

/**
 * A survival projection built from an explicit per-run survivor list — AC-43's matrix, stated by
 * hand so every AC-55 expectation in this file is arithmetic rather than a sampled number.
 */
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

/** RB is deep and safe; WR is thinning. The board that makes waiting on RB correct. */
const RB_DEEP_WR_THIN = projectionOf([
  ['rb1', 'rb4', 'wr3', 'wr4', 'te1', 'te2', 'qb1', 'qb2'],
  ['rb1', 'rb4', 'wr3', 'wr4', 'te1', 'te2', 'qb1', 'qb2'],
]);

// ---------------------------------------------------------------------------------------------

describe('the plan set (AC-54)', () => {
  it('draws positions from the user’s unfilled starting slots, never from the candidate list', () => {
    expect(planPositions(need({ RB: 1, TE: 0.33 }))).toEqual(['RB', 'TE']);
  });

  it('gives a team with no need signal no plan positions at all', () => {
    expect(planPositions(NO_NEED_SIGNAL)).toEqual([]);
  });

  it('never admits K or DST, whatever weight a caller hands it (🔶 AS-7)', () => {
    expect(planPositions(need({ K: 1, DST: 1 }))).toEqual([]);
  });

  it('enumerates ordered pairs including now === next', () => {
    expect(enumeratePlans(['RB', 'WR'])).toEqual([
      { nowPosition: 'RB', nextPosition: 'RB' },
      { nowPosition: 'RB', nextPosition: 'WR' },
      { nowPosition: 'WR', nextPosition: 'RB' },
      { nowPosition: 'WR', nextPosition: 'WR' },
    ]);
  });
});

describe('term1 — the best available player at a position, present tense (AC-55)', () => {
  it('is the numerically lowest overall ECR rank still on the board', () => {
    const best = bestAvailableByPosition(SNAPSHOT, boardOf());
    expect(best.get('RB')?.sleeperPlayerId).toBe('rb1');
    expect(best.get('WR')?.ecrRank).toBe(2);
  });

  it('skips drafted players before ranking, never after (AC-53)', () => {
    const best = bestAvailableByPosition(SNAPSHOT, boardOf(['rb1', 'rb2']));
    expect(best.get('RB')?.sleeperPlayerId).toBe('rb3');
  });

  it('omits a position with nobody left rather than inventing one', () => {
    const best = bestAvailableByPosition(SNAPSHOT, boardOf(['te1', 'te2']));
    expect(best.has('TE')).toBe(false);
  });
});

describe('term2 — the expected best surviving rank at the user’s next turn (AC-55)', () => {
  it('averages the per-run best surviving rank, never marginal percentages combined', () => {
    // Run 1's best surviving RB is rb1 (rank 1); run 2's is rb3 (rank 7). Mean = 4.
    const projection = projectionOf([['rb1', 'rb3'], ['rb3']]);
    expect(expectedBestSurvivingRank(projection, 'RB', NO_SURVIVOR_RANK)).toBe(4);
  });

  it('scores a run with no survivor at that position at the snapshot’s last rank + 1', () => {
    // Run 1: best WR is wr2 (4). Run 2: no WR survives -> 156. Mean = (4 + 156) / 2 = 80.
    const projection = projectionOf([['wr2', 'rb1'], ['rb1']]);
    expect(expectedBestSurvivingRank(projection, 'WR', NO_SURVIVOR_RANK)).toBe(80);
  });

  it('excludes the player the plan already takes now, so a same-position plan cannot count him twice', () => {
    // rb1 survives both runs, but an RB-now/RB-next plan spends him now: rb4 (11) is what is left.
    const projection = projectionOf([
      ['rb1', 'rb4'],
      ['rb1', 'rb4'],
    ]);
    expect(expectedBestSurvivingRank(projection, 'RB', NO_SURVIVOR_RANK)).toBe(1);
    expect(expectedBestSurvivingRank(projection, 'RB', NO_SURVIVOR_RANK, 'rb1')).toBe(11);
  });

  it('penalises a run whose only surviving player at the position is the one taken now', () => {
    const projection = projectionOf([['rb1'], ['rb1', 'rb2']]);
    // Run 1 has nobody left after rb1 -> 156; run 2 leaves rb2 (3). Mean = (156 + 3) / 2 = 79.5.
    expect(expectedBestSurvivingRank(projection, 'RB', NO_SURVIVOR_RANK, 'rb1')).toBe(79.5);
  });
});

describe('the snapshot’s last-ranked overall ECR rank (AC-55)', () => {
  it('reads the whole snapshot, drafted players included — it is a property of the rankings', () => {
    expect(worstOverallEcrRank(SNAPSHOT)).toBe(155);
  });
});

describe('plan scoring and comparison (AC-55, AC-57, AC-58, AC-59)', () => {
  const compare = (overrides: Partial<Parameters<typeof comparePlans>[0]> = {}) =>
    comparePlans({
      players: SNAPSHOT,
      board: boardOf(),
      needVector: need({ RB: 1, WR: 1 }),
      projection: RB_DEEP_WR_THIN,
      userRemainingPicks: 4,
      config: config(),
      ...overrides,
    });

  it('scores every plan as term1 + term2 and lets the lower total win', () => {
    const comparison = compare();
    // term1: RB 1, WR 2. term2: RB 1 (rb1 survives), RB-less-rb1 11 (rb4), WR 8 (wr3), WR-less-wr1 8.
    // (RB,RB) 12 | (RB,WR) 9 | (WR,RB) 3 | (WR,WR) 10.
    expect(comparison.winner).toEqual({
      nowPosition: 'WR',
      nextPosition: 'RB',
      term1: 2,
      term2: 1,
      score: 3,
    });
    expect(comparison.runnerUp?.score).toBe(9);
    expect(comparison.tooClose).toBe(false);
    expect(comparison.applicable).toBe(true);
  });

  it('names the survival fact separating the winner from the alternative (AC-57)', () => {
    expect(compare().separatingFact).toBe(
      'WR shelf: 2 of 4 likely gone by your next pick (best back at ECR 8); RB: 2 of 4 (ECR 1).',
    );
  });

  it('reports no separating survival fact when there is no alternative plan to separate from', () => {
    // Only RB is needed, so RB-now/RB-next is the whole plan set — nothing to compare it against.
    const comparison = compare({ needVector: need({ RB: 1 }) });
    expect(comparison.runnerUp).toBeNull();
    expect(comparison.separatingFact).toBeNull();
  });

  it('flags plan totals within `planTotalTooCloseEcrRanks` of each other (AC-58)', () => {
    // rb2/rb3 back on the board: (RB,RB) is 1 + 3 = 4 against (WR,RB) 3.
    const projection = projectionOf([
      ['rb1', 'rb2', 'rb3', 'rb4', 'wr3', 'wr4'],
      ['rb1', 'rb2', 'rb3', 'rb4', 'wr3', 'wr4'],
    ]);
    const comparison = compare({ projection });
    expect(comparison.winner?.score).toBe(3);
    expect(comparison.runnerUp?.score).toBe(4);
    expect(comparison.tooClose).toBe(true);
  });

  it('skips the comparison entirely when the user has fewer than two picks left (AC-59, AC-60)', () => {
    const comparison = compare({ userRemainingPicks: 1 });
    expect(comparison.applicable).toBe(false);
    expect(comparison.winner).toBeNull();
    expect(comparison.runnerUp).toBeNull();
  });

  it('reads the fewer-than-two bound from `lookaheadMaxPicks`, never an inline 2', () => {
    expect(
      compare({ userRemainingPicks: 2, config: config({ lookaheadMaxPicks: 3 }) }).applicable,
    ).toBe(false);
    expect(
      compare({ userRemainingPicks: 3, config: config({ lookaheadMaxPicks: 3 }) }).applicable,
    ).toBe(true);
  });

  it('produces no winner — but stays applicable — for a roster with no unfilled starting slot', () => {
    const comparison = compare({ needVector: NO_NEED_SIGNAL });
    expect(comparison.applicable).toBe(true);
    expect(comparison.winner).toBeNull();
  });

  it('produces no winner when every needed position is picked clean', () => {
    const comparison = compare({
      needVector: need({ TE: 1 }),
      board: boardOf(['te1', 'te2']),
    });
    expect(comparison.winner).toBeNull();
  });

  it('cannot score a plan without survival data, so it reports lookahead as inapplicable', () => {
    expect(compare({ projection: null }).applicable).toBe(false);
    expect(compare({ projection: { ...RB_DEEP_WR_THIN, suppressed: true } }).applicable).toBe(
      false,
    );
  });

  it('orders equal-scoring plans deterministically, so an unchanged board renders unchanged', () => {
    const projection = projectionOf([
      ['rb1', 'wr1', 'rb4', 'wr4'],
      ['rb1', 'wr1', 'rb4', 'wr4'],
    ]);
    // (RB,WR) = 1 + 2 = 3 and (WR,RB) = 2 + 1 = 3 tie; QB/RB/WR/TE order breaks it toward RB-now.
    const first = compare({ projection });
    const second = compare({ projection });
    expect(first.winner?.nowPosition).toBe('RB');
    expect(second.winner).toEqual(first.winner);
    expect(second.runnerUp).toEqual(first.runnerUp);
  });

  it('exposes the shelf size as a named constant rather than an inline number', () => {
    expect(DEFAULT_SHELF_SIZE).toBe(5);
  });
});
