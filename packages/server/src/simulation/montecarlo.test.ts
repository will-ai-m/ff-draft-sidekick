import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import type { Board, DraftWindow, OpponentPanelEntry, Position, SlotConfig } from '@sidekick/shared';
import { describe, expect, it } from 'vitest';

import windowBundleJson from '../../test/fixtures/sleeper-window-traded-draft.json';
import type { SleeperFixtureBundle } from '../../test/msw/sleeperHandlers';
import { computeOpponentPanel } from '../opponent/window';
import type { ExampleCandidate } from '../opponent/window';
import { computeRosterPanel } from '../roster/needvectors';
import { buildPickOwnerResolver, deriveDraftState } from '../sleeper/sync';
import type { SleeperIngest } from '../sleeper/sync';
import { applyTendencyProfiles, computeBpaDistribution, computeTendencyProfile } from '../tendencies/profiles';
import {
  buildSimulationUniverse,
  createSeededRandom,
  deriveSeed,
  kdstPickChance,
  planKDstSaturation,
  simulateSurvival,
  survivalBand,
  survivalFor,
  survivedInRun,
  toSimulatedPicks,
} from './montecarlo';
import type { SimulatedPick, SimulationCandidate, SurvivalConfig, SurvivalProjection } from './montecarlo';

// ---------------------------------------------------------------------------------------------
// Helpers. Every expected number in this file is hand-computed from the 1/rank weighting FR-8
// specifies, so each fixture below is deliberately small enough to compute by eye.
// ---------------------------------------------------------------------------------------------

const boardOf = (drafted: readonly string[] = []): Pick<Board, 'players'> => ({
  players: Object.fromEntries(drafted.map((id) => [id, { drafted: true }])),
});

const candidate = (
  sleeperPlayerId: string,
  position: Position,
  ecrRank: number,
  adp: number | null,
): SimulationCandidate => ({ sleeperPlayerId, position, ecrRank, adp });

const config = (overrides: Partial<SurvivalConfig> = {}): SurvivalConfig => ({
  simUniverseSize: PARAMETER_DEFAULTS.simUniverseSize,
  monteCarloRunCount: PARAMETER_DEFAULTS.monteCarloRunCount,
  reachAdjustmentPerPick: PARAMETER_DEFAULTS.reachAdjustmentPerPick,
  kdstEarlyPickWindow: PARAMETER_DEFAULTS.kdstEarlyPickWindow,
  survivalBandLikelyGoneMax: PARAMETER_DEFAULTS.survivalBandLikelyGoneMax,
  survivalBandLikelyAvailableMin: PARAMETER_DEFAULTS.survivalBandLikelyAvailableMin,
  ...overrides,
});

const dist = (weights: Partial<Record<Position, number>>): Record<Position, number> => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
  ...weights,
});

const simPick = (overrides: Partial<SimulatedPick> = {}): SimulatedPick => ({
  pickNo: 1,
  teamId: 'slot-1',
  averageReach: 0,
  unfilledKDstSlots: 0,
  remainingPicks: 12,
  ...overrides,
});

const windowFor = (picks: readonly SimulatedPick[], nextUserPickNo: number | null): DraftWindow => ({
  picks: picks.map((pick) => ({ pickNo: pick.pickNo, round: 1, teamId: pick.teamId })),
  userOnTheClock: true,
  inProgressPickNo: 1,
  currentUserPickNo: 1,
  nextUserPickNo,
});

interface ProjectOptions {
  picks: readonly SimulatedPick[];
  players: readonly SimulationCandidate[];
  drafted?: readonly string[];
  config?: Partial<SurvivalConfig>;
  nextUserPickNo?: number | null;
  ensureIncluded?: readonly string[];
  degraded?: boolean;
  seed?: number;
  random?: () => number;
}

const project = (options: ProjectOptions): SurvivalProjection =>
  simulateSurvival({
    window: windowFor(
      options.picks,
      options.nextUserPickNo === undefined ? 99 : options.nextUserPickNo,
    ),
    picks: options.picks,
    players: options.players,
    board: boardOf(options.drafted ?? []),
    config: config(options.config),
    ensureIncluded: options.ensureIncluded,
    degraded: options.degraded,
    seed: options.seed,
    random: options.random,
  });

const percent = (projection: SurvivalProjection, playerId: string): number =>
  survivalFor(projection, playerId)?.probability ?? Number.NaN;

const universeIds = (projection: SurvivalProjection): string[] =>
  projection.universe.map((player) => player.sleeperPlayerId);

/** Three RBs whose 1/rank weights are 1, 1/2 and 1/3 — total 11/6. */
const THREE_RBS: SimulationCandidate[] = [
  candidate('rb1', 'RB', 1, 1),
  candidate('rb2', 'RB', 2, 2),
  candidate('rb3', 'RB', 3, 3),
];

/** The same 1, 1/2, 1/3 weights spread across three positions, for the best-available regime. */
const ONE_EACH: SimulationCandidate[] = [
  candidate('rb1', 'RB', 1, 1),
  candidate('wr1', 'WR', 2, 2),
  candidate('te1', 'TE', 3, 3),
];

/** A seed fixed per test so every convergence assertion below is reproducible, never flaky. */
const SEED = 20260822;
/** 20k runs put the standard error of a ~0.5 proportion at ~0.0035. */
const CONVERGENCE_RUNS = 20_000;
/**
 * ~6 SE of margin at {@link CONVERGENCE_RUNS} — the tolerance these fixtures are sized for.
 *
 * Asserted on the absolute difference rather than through `toBeCloseTo(x, 2)`, whose tolerance is
 * ±0.005: under 1.5 SE, which a correct simulation exceeds on roughly one assertion in seven.
 */
const CONVERGENCE_TOLERANCE = 0.02;

const expectConverged = (
  projection: SurvivalProjection,
  playerId: string,
  expected: number,
): void => {
  const actual = percent(projection, playerId);
  expect(
    Math.abs(actual - expected),
    `${playerId} survived ${actual.toFixed(4)} of runs, expected ${expected.toFixed(4)}`,
  ).toBeLessThan(CONVERGENCE_TOLERANCE);
};

// ---------------------------------------------------------------------------------------------
// AC-42 — the simulation universe.
// ---------------------------------------------------------------------------------------------

describe('the simulation universe (AC-42)', () => {
  const board: SimulationCandidate[] = [
    candidate('rb1', 'RB', 1, 1.2),
    candidate('wr1', 'WR', 3, 2.4),
    candidate('te1', 'TE', 8, 5.5),
    candidate('qb1', 'QB', 12, 9.1),
    candidate('rb2', 'RB', 20, 15.0),
    candidate('k1', 'K', 2, 1.0),
    candidate('dst1', 'DST', 4, 1.5),
  ];

  it('is the top N available players in ADP order, K and DST excluded (🔶 AS-7)', () => {
    const universe = buildSimulationUniverse({
      players: board,
      board: boardOf(),
      size: 3,
    });

    expect(universe.map((player) => player.sleeperPlayerId)).toEqual(['rb1', 'wr1', 'te1']);
    expect(universe.map((player) => player.index)).toEqual([0, 1, 2]);
  });

  it('never admits a K or a DST however early they rank (🔶 AS-7)', () => {
    const universe = buildSimulationUniverse({
      players: board,
      board: boardOf(),
      size: 40,
      ensureIncluded: ['k1', 'dst1'],
    });

    expect(universe.map((player) => player.sleeperPlayerId)).toEqual([
      'rb1',
      'wr1',
      'te1',
      'qb1',
      'rb2',
    ]);
  });

  it('excludes players the board already shows drafted', () => {
    const universe = buildSimulationUniverse({
      players: board,
      board: boardOf(['rb1', 'te1']),
      size: 40,
    });

    expect(universe.map((player) => player.sleeperPlayerId)).toEqual(['wr1', 'qb1', 'rb2']);
  });

  it('slots a player with no ADP in by ECR order rather than behind the whole board (AC-26)', () => {
    const universe = buildSimulationUniverse({
      players: [
        candidate('rb1', 'RB', 1, 1.2),
        candidate('te19', 'TE', 4, null),
        candidate('wr1', 'WR', 9, 2.4),
      ],
      board: boardOf(),
      size: 40,
    });

    // The ADP-less TE ranks 2nd of 3 by ECR, so he sits between the two ADP-carrying players
    // rather than being banished behind them.
    expect(universe.map((player) => player.sleeperPlayerId)).toEqual(['rb1', 'te19', 'wr1']);
  });

  it('extends past the cutoff to cover every displayed row `ensureIncluded` names (AC-42)', () => {
    const universe = buildSimulationUniverse({
      players: board,
      board: boardOf(),
      size: 2,
      ensureIncluded: ['rb2'],
    });

    expect(universe.map((player) => player.sleeperPlayerId)).toEqual(['rb1', 'wr1', 'rb2']);
    expect(universe.map((player) => player.addedForDisplay)).toEqual([false, false, true]);
    // Indexes stay contiguous and in sampling order, since they are matrix column offsets.
    expect(universe.map((player) => player.index)).toEqual([0, 1, 2]);
  });

  it('will not resurrect a drafted player even when `ensureIncluded` names them', () => {
    const universe = buildSimulationUniverse({
      players: board,
      board: boardOf(['rb2']),
      size: 1,
      ensureIncluded: ['rb2'],
    });

    expect(universe.map((player) => player.sleeperPlayerId)).toEqual(['rb1']);
  });

  it('reads its size from config, never an inline 40', () => {
    const many = Array.from({ length: 60 }, (_, i) =>
      candidate(`p${i + 1}`, 'RB', i + 1, i + 1),
    );

    expect(buildSimulationUniverse({ players: many, board: boardOf(), size: 40 })).toHaveLength(40);
    expect(buildSimulationUniverse({ players: many, board: boardOf(), size: 7 })).toHaveLength(7);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-47 — the K/DST saturation rule.
// ---------------------------------------------------------------------------------------------

describe('the K/DST saturation rule (AC-47)', () => {
  it('spends the pick on no skill player once K/DST needs equal the picks left', () => {
    const picks = [
      simPick({ pickNo: 10, teamId: 'slot-1', unfilledKDstSlots: 2, remainingPicks: 2 }),
      simPick({ pickNo: 20, teamId: 'slot-1', unfilledKDstSlots: 2, remainingPicks: 2 }),
    ];

    expect(planKDstSaturation(picks)).toEqual([true, true]);
  });

  it('leaves a team with picks to spare drafting skill players', () => {
    const picks = [
      simPick({ pickNo: 10, teamId: 'slot-1', unfilledKDstSlots: 2, remainingPicks: 5 }),
      simPick({ pickNo: 20, teamId: 'slot-1', unfilledKDstSlots: 2, remainingPicks: 5 }),
    ];

    expect(planKDstSaturation(picks)).toEqual([false, false]);
  });

  it('counts remaining picks across the whole draft, not just the ones inside the window', () => {
    // Two rounds into a 15-round draft every seat still has an open K and DST slot, and each
    // owns exactly one pick inside a ten-pick window. Reading "remaining picks" as the window's
    // own would saturate every seat and hand back a board where nobody is ever drafted.
    const picks = [simPick({ unfilledKDstSlots: 2, remainingPicks: 13 })];

    expect(planKDstSaturation(picks)).toEqual([false]);
  });

  it('walks both counters down the window, so only a team’s last picks saturate', () => {
    const picks = [
      simPick({ pickNo: 5, teamId: 'slot-1', unfilledKDstSlots: 1, remainingPicks: 3 }),
      simPick({ pickNo: 15, teamId: 'slot-1', unfilledKDstSlots: 1, remainingPicks: 3 }),
      simPick({ pickNo: 25, teamId: 'slot-1', unfilledKDstSlots: 1, remainingPicks: 3 }),
    ];

    expect(planKDstSaturation(picks)).toEqual([false, false, true]);
  });

  it('tracks each team separately inside one window', () => {
    const picks = [
      simPick({ pickNo: 5, teamId: 'slot-1', unfilledKDstSlots: 2, remainingPicks: 2 }),
      simPick({ pickNo: 6, teamId: 'slot-2', unfilledKDstSlots: 2, remainingPicks: 9 }),
      simPick({ pickNo: 7, teamId: 'slot-1', unfilledKDstSlots: 2, remainingPicks: 2 }),
    ];

    expect(planKDstSaturation(picks)).toEqual([true, false, true]);
  });

  it('never fires for a team with no unfilled K/DST slot at all', () => {
    const picks = [simPick({ unfilledKDstSlots: 0, remainingPicks: 0 })];

    expect(planKDstSaturation(picks)).toEqual([false]);
  });

  describe('the early placement window (AC-47 amendment, 2026-08-27)', () => {
    it('is the hard deadline rule at the boundary, and silent outside the window', () => {
      expect(kdstPickChance(2, 2, 4)).toBe(1);
      expect(kdstPickChance(2, 1, 4)).toBe(1);
      expect(kdstPickChance(2, 7, 4)).toBe(0); // beyond unfilled + window
      expect(kdstPickChance(0, 1, 4)).toBe(0);
      expect(kdstPickChance(2, 5, 0)).toBe(0); // window 0 restores deadline-only
    });

    it('places K/DST uniformly across the picks the team has left', () => {
      expect(kdstPickChance(2, 4, 4)).toBe(0.5);
      expect(kdstPickChance(1, 4, 4)).toBe(0.25);
      expect(kdstPickChance(2, 6, 4)).toBeCloseTo(2 / 6);
    });

    it('spares skill players when a window team may take K/DST early, raising survival', () => {
      // One opponent pick between user turns; that team has 5 picks left draft-wide and both
      // K/DST slots open. The deadline-only model spends this pick on a skill player every run
      // (5 > 2); the placement window says 2-in-5 runs go to K/DST — the exact behaviour nine
      // seats showed in the 2026-08-27 mock trace, taking DSTs with 4-6 picks in hand.
      const players = Array.from({ length: 8 }, (_, i) =>
        candidate(`rb${i}`, 'RB', i + 1, i + 1),
      );
      const picks = [simPick({ unfilledKDstSlots: 2, remainingPicks: 5 })];
      const totalSurvival = (earlyWindow: number): number => {
        const projection = project({
          picks,
          players,
          config: { kdstEarlyPickWindow: earlyWindow, monteCarloRunCount: 400 },
          seed: 7,
        });
        let total = 0;
        for (const survival of projection.survivalByPlayerId.values()) {
          total += survival.probability;
        }
        return total;
      };

      // Deadline-only: exactly one of eight is drafted per run — 7 expected survivors.
      expect(totalSurvival(0)).toBeCloseTo(7, 5);
      // With the window, 2/5 of runs spend the pick on K/DST and everyone survives.
      const withWindow = totalSurvival(PARAMETER_DEFAULTS.kdstEarlyPickWindow);
      expect(withWindow).toBeGreaterThan(7.2);
      expect(withWindow).toBeLessThanOrEqual(8);
    });

    it('walks the counters per run — an early K/DST pick relieves the deadline behind it', () => {
      // Two picks by one team, remaining 3 with 2 K/DST slots open: chance 2/3 then, if K/DST
      // was taken, 1/2 — and if not, the second pick sits at the 2>=2 deadline and saturates.
      // Either path spends at most one skill pick, so at least 7 of 8 always survive.
      const players = Array.from({ length: 8 }, (_, i) =>
        candidate(`wr${i}`, 'WR', i + 1, i + 1),
      );
      const picks = [
        simPick({ pickNo: 5, unfilledKDstSlots: 2, remainingPicks: 3 }),
        simPick({ pickNo: 15, unfilledKDstSlots: 2, remainingPicks: 3 }),
      ];
      const projection = project({
        picks,
        players,
        config: { monteCarloRunCount: 300 },
        seed: 11,
      });

      let total = 0;
      for (const survival of projection.survivalByPlayerId.values()) {
        total += survival.probability;
      }
      expect(total).toBeGreaterThanOrEqual(7);
    });
  });

  it('consumes no skill player, so a saturated window leaves the board untouched', () => {
    const projection = project({
      picks: [
        simPick({
          pickNo: 10,
          bentDistribution: dist({ RB: 1 }),
          unfilledKDstSlots: 2,
          remainingPicks: 2,
        }),
      ],
      players: THREE_RBS,
      config: { monteCarloRunCount: 200 },
      seed: SEED,
    });

    expect(percent(projection, 'rb1')).toBe(1);
    expect(percent(projection, 'rb2')).toBe(1);
    expect(percent(projection, 'rb3')).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-42 — the position draw, and the best-available regime for a no-need-signal team.
// ---------------------------------------------------------------------------------------------

describe('the position draw (AC-42)', () => {
  it('draws the position from the team’s tendency-bent distribution', () => {
    const projection = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }) })],
      players: [candidate('rb1', 'RB', 1, 1), candidate('wr1', 'WR', 2, 2), candidate('wr2', 'WR', 3, 3)],
      config: { monteCarloRunCount: 500 },
      seed: SEED,
    });

    // All the mass is on RB and there is exactly one RB, so he is gone in every run and the two
    // WRs survive every run — no tolerance needed.
    expect(percent(projection, 'rb1')).toBe(0);
    expect(percent(projection, 'wr1')).toBe(1);
    expect(percent(projection, 'wr2')).toBe(1);
  });

  it('splits between positions in proportion to the bent weights', () => {
    const projection = project({
      picks: [simPick({ bentDistribution: dist({ RB: 0.75, WR: 0.25 }) })],
      players: [candidate('rb1', 'RB', 1, 1), candidate('wr1', 'WR', 2, 2)],
      config: { monteCarloRunCount: CONVERGENCE_RUNS },
      seed: SEED,
    });

    expectConverged(projection, 'rb1', 0.25);
    expectConverged(projection, 'wr1', 0.75);
  });

  it('samples straight from ADP order across positions when the team has no need signal', () => {
    // No `bentDistribution` is exactly the NO_NEED_SIGNAL branch: FR-6 publishes no distribution
    // for such a team, and Terms says its pick is drawn from ADP order across QB/RB/WR/TE.
    const projection = project({
      picks: [simPick()],
      players: ONE_EACH,
      config: { monteCarloRunCount: CONVERGENCE_RUNS },
      seed: SEED,
    });

    // 1, 1/2, 1/3 over 11/6 => taken 6/11, 3/11, 2/11 of the time.
    expectConverged(projection, 'rb1', 5 / 11);
    expectConverged(projection, 'wr1', 8 / 11);
    expectConverged(projection, 'te1', 9 / 11);
  });

  it('still adjusts that draw by the team’s reach, because reaching is not a need (AC-42)', () => {
    // AC-42 substitutes the ADP-order sample for the *position* draw only: "…instead of drawing a
    // position — then draws the player … from ADP order adjusted by the team's reach profile"
    // governs the player draw in both regimes. A team that habitually reaches does not turn
    // market-efficient the moment its starting slots fill up.
    const projection = project({
      picks: [simPick({ averageReach: 2 })],
      players: ONE_EACH,
      config: { monteCarloRunCount: CONVERGENCE_RUNS },
      seed: SEED,
    });

    // effectiveAdpRank = max(1, rank - 1 x 2) => 1, 1, 1: flat, not the 6/11, 3/11, 2/11 above.
    expectConverged(projection, 'rb1', 2 / 3);
    expectConverged(projection, 'wr1', 2 / 3);
    expectConverged(projection, 'te1', 2 / 3);
  });

  it('falls back to best available when the drawn position has nobody left', () => {
    const projection = project({
      picks: [simPick({ bentDistribution: dist({ TE: 1 }) })],
      players: [candidate('rb1', 'RB', 1, 1), candidate('wr1', 'WR', 2, 2)],
      config: { monteCarloRunCount: CONVERGENCE_RUNS },
      seed: SEED,
    });

    // The team wants a TE and the universe has none; it still picks somebody, from ADP order.
    expectConverged(projection, 'rb1', 1 / 3);
    expectConverged(projection, 'wr1', 2 / 3);
  });

  it('gives K and DST no mass even if a caller hands it a distribution that does', () => {
    const projection = project({
      picks: [simPick({ bentDistribution: dist({ K: 0.5, DST: 0.5 }) })],
      players: [...THREE_RBS, candidate('k1', 'K', 4, 0.5)],
      config: { monteCarloRunCount: 500 },
      seed: SEED,
    });

    // K/DST carry no mass (🔶 AS-7), so the pick falls through to best available among the RBs.
    expect(survivalFor(projection, 'k1')).toBeNull();
    expect(percent(projection, 'rb1') + percent(projection, 'rb2') + percent(projection, 'rb3')).toBeCloseTo(2, 5);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-42 — the reach-adjusted player draw within a position.
// ---------------------------------------------------------------------------------------------

describe('the reach-adjusted player draw (AC-42)', () => {
  it('weights by 1/rank over the available players when the team’s reach is neutral', () => {
    const projection = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }), averageReach: 0 })],
      players: THREE_RBS,
      config: { monteCarloRunCount: CONVERGENCE_RUNS },
      seed: SEED,
    });

    expectConverged(projection, 'rb1', 5 / 11);
    expectConverged(projection, 'rb2', 8 / 11);
    expectConverged(projection, 'rb3', 9 / 11);
  });

  it('flattens the top of the board for a team that reaches', () => {
    // effectiveAdpRank = max(1, rank - 1 x 2) => 1, 1, 1: a reaching team is as likely to take
    // the third RB as the first, which is what reaching for a player means.
    const projection = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }), averageReach: 2 })],
      players: THREE_RBS,
      config: { monteCarloRunCount: CONVERGENCE_RUNS },
      seed: SEED,
    });

    expectConverged(projection, 'rb1', 2 / 3);
    expectConverged(projection, 'rb2', 2 / 3);
    expectConverged(projection, 'rb3', 2 / 3);
  });

  it('reads `reachAdjustmentPerPick` from config, never an inline 1', () => {
    const projection = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }), averageReach: 2 })],
      players: THREE_RBS,
      config: { monteCarloRunCount: CONVERGENCE_RUNS, reachAdjustmentPerPick: 0 },
      seed: SEED,
    });

    // Zeroing the knob turns the adjustment off entirely: back to the plain 1/rank weights.
    expectConverged(projection, 'rb1', 5 / 11);
    expectConverged(projection, 'rb2', 8 / 11);
  });

  it('leaves a team whose reach was never observed exactly where a neutral prior puts it', () => {
    // T6 reports `averageReach: 0` with `reachSampleCount: 0` when no pick of theirs carried an
    // ADP. Zero reach is already the identity here, so the prior needs no damping of its own.
    const observed = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }), averageReach: 0 })],
      players: THREE_RBS,
      config: { monteCarloRunCount: 2000 },
      seed: SEED,
    });
    const prior = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }), averageReach: 0 })],
      players: THREE_RBS,
      config: { monteCarloRunCount: 2000 },
      seed: SEED,
    });

    expect(percent(prior, 'rb1')).toBe(percent(observed, 'rb1'));
  });

  it('re-ranks over what is still available as the window depletes the board', () => {
    // rb1 is already drafted, so rb2 is the top available RB and carries weight 1 — not the 1/2
    // his position on the original board would give him.
    const projection = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }) })],
      players: THREE_RBS,
      drafted: ['rb1'],
      config: { monteCarloRunCount: CONVERGENCE_RUNS },
      seed: SEED,
    });

    expect(universeIds(projection)).toEqual(['rb2', 'rb3']);
    expectConverged(projection, 'rb2', 1 / 3);
    expectConverged(projection, 'rb3', 2 / 3);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-43 — the per-run survivor sets.
// ---------------------------------------------------------------------------------------------

describe('per-run survivor sets (AC-43)', () => {
  const picks = [
    simPick({ pickNo: 10, teamId: 'slot-1', bentDistribution: dist({ RB: 1 }) }),
    simPick({ pickNo: 11, teamId: 'slot-2', bentDistribution: dist({ RB: 0.5, WR: 0.5 }) }),
  ];
  const players = [...THREE_RBS, candidate('wr1', 'WR', 4, 4), candidate('wr2', 'WR', 5, 5)];

  it('retains one survivor row per run, not only the aggregate percentages', () => {
    const projection = project({ picks, players, config: { monteCarloRunCount: 250 }, seed: SEED });

    expect(projection.runCount).toBe(250);
    expect(projection.universe).toHaveLength(5);
    expect(projection.survivors).toHaveLength(250 * 5);
  });

  it('drops exactly one player per simulated pick in every single run', () => {
    const projection = project({ picks, players, config: { monteCarloRunCount: 250 }, seed: SEED });

    for (let run = 0; run < projection.runCount; run += 1) {
      const survivors = projection.universe.filter((player) =>
        survivedInRun(projection, run, player.sleeperPlayerId),
      );
      expect(survivors).toHaveLength(5 - picks.length);
    }
  });

  it('reports each marginal percentage as the mean of that player’s own matrix column', () => {
    const projection = project({ picks, players, config: { monteCarloRunCount: 250 }, seed: SEED });

    for (const player of projection.universe) {
      let survived = 0;
      for (let run = 0; run < projection.runCount; run += 1) {
        if (survivedInRun(projection, run, player.sleeperPlayerId)) survived += 1;
      }
      expect(percent(projection, player.sleeperPlayerId)).toBeCloseTo(
        survived / projection.runCount,
        12,
      );
    }
  });

  it('records a fully determined run exactly, when the draw is not left to chance', () => {
    // `random: () => 0` always takes the first available candidate, so both picks are forced:
    // slot-1 takes the top RB, slot-2 draws RB (the first position carrying mass) and takes the
    // next RB. Every run is identical and hand-checkable.
    const projection = project({
      picks,
      players,
      config: { monteCarloRunCount: 3 },
      random: () => 0,
    });

    for (let run = 0; run < 3; run += 1) {
      expect(
        projection.universe
          .filter((player) => survivedInRun(projection, run, player.sleeperPlayerId))
          .map((player) => player.sleeperPlayerId),
      ).toEqual(['rb3', 'wr1', 'wr2']);
    }
    expect(percent(projection, 'rb1')).toBe(0);
    expect(percent(projection, 'rb3')).toBe(1);
  });

  it('answers `survivedInRun` false for a player outside the universe, never throws', () => {
    const projection = project({ picks, players, config: { monteCarloRunCount: 10 }, seed: SEED });

    expect(survivedInRun(projection, 0, 'nobody')).toBe(false);
    expect(survivalFor(projection, 'nobody')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// AC-44 — the bands.
// ---------------------------------------------------------------------------------------------

describe('survival bands (AC-44)', () => {
  const bands = config();

  it('splits at the configured thresholds, which are strict per the PRD’s <25% / >75%', () => {
    expect(survivalBand(0.0, bands)).toBe('likely-gone');
    expect(survivalBand(0.249, bands)).toBe('likely-gone');
    expect(survivalBand(0.25, bands)).toBe('coin-flip');
    expect(survivalBand(0.5, bands)).toBe('coin-flip');
    expect(survivalBand(0.75, bands)).toBe('coin-flip');
    expect(survivalBand(0.751, bands)).toBe('likely-available');
    expect(survivalBand(1, bands)).toBe('likely-available');
  });

  it('reads both thresholds from config, never inline 0.25/0.75', () => {
    const narrow = config({ survivalBandLikelyGoneMax: 0.4, survivalBandLikelyAvailableMin: 0.6 });

    expect(survivalBand(0.3, narrow)).toBe('likely-gone');
    expect(survivalBand(0.5, narrow)).toBe('coin-flip');
    expect(survivalBand(0.7, narrow)).toBe('likely-available');
  });

  it('carries a band alongside every universe player’s percentage', () => {
    const projection = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }) })],
      players: THREE_RBS,
      config: { monteCarloRunCount: 2000 },
      seed: SEED,
    });

    expect(survivalFor(projection, 'rb1')?.band).toBe('coin-flip');
    expect(survivalFor(projection, 'rb3')?.band).toBe('likely-available');
    for (const player of projection.universe) {
      expect(survivalFor(projection, player.sleeperPlayerId)).not.toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------------------------
// AC-45 / AC-48 — suppression at the user's last pick, and the degraded flag.
// ---------------------------------------------------------------------------------------------

describe('suppression and the degraded flag (AC-45, AC-48)', () => {
  it('suppresses survival entirely when the user has no pick after this one', () => {
    const projection = project({
      picks: [],
      players: THREE_RBS,
      nextUserPickNo: null,
    });

    expect(projection.suppressed).toBe(true);
    expect(projection.universe).toEqual([]);
    expect(projection.runCount).toBe(0);
    // Suppressed means absent, not zero — a 0% would read as "certainly gone" (AC-45).
    expect(survivalFor(projection, 'rb1')).toBeNull();
  });

  it('does not suppress at a snake turn, where the window is empty but a next pick exists', () => {
    const projection = project({ picks: [], players: THREE_RBS, nextUserPickNo: 21 });

    expect(projection.suppressed).toBe(false);
    expect(percent(projection, 'rb1')).toBe(1);
    expect(survivalFor(projection, 'rb1')?.band).toBe('likely-available');
  });

  it('carries the board’s degraded flag onto the projection (AC-48)', () => {
    const degraded = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }) })],
      players: THREE_RBS,
      config: { monteCarloRunCount: 50 },
      seed: SEED,
      degraded: true,
    });
    const healthy = project({
      picks: [simPick({ bentDistribution: dist({ RB: 1 }) })],
      players: THREE_RBS,
      config: { monteCarloRunCount: 50 },
      seed: SEED,
    });

    expect(degraded.degraded).toBe(true);
    expect(healthy.degraded).toBe(false);
  });

  it('refuses a picks list that does not match the window it was handed', () => {
    expect(() =>
      simulateSurvival({
        window: windowFor([simPick({ pickNo: 10 }), simPick({ pickNo: 11 })], 99),
        picks: [simPick({ pickNo: 10 })],
        players: THREE_RBS,
        board: boardOf(),
        config: config(),
      }),
    ).toThrow(/window/i);
  });
});

// ---------------------------------------------------------------------------------------------
// §T7 done-when (1) — a clearly-should-survive and a clearly-should-not-survive player.
// ---------------------------------------------------------------------------------------------

describe('a fixture window and universe (§T7 done-when 1)', () => {
  it('takes every RB and leaves every WR when three RB-needing teams pick', () => {
    const picks = [
      simPick({ pickNo: 10, teamId: 'slot-1', bentDistribution: dist({ RB: 1 }) }),
      simPick({ pickNo: 11, teamId: 'slot-2', bentDistribution: dist({ RB: 1 }) }),
      simPick({ pickNo: 12, teamId: 'slot-3', bentDistribution: dist({ RB: 1 }) }),
    ];
    const projection = project({
      picks,
      players: [...THREE_RBS, candidate('wr1', 'WR', 6, 6), candidate('wr2', 'WR', 7, 7)],
      config: { monteCarloRunCount: 1000 },
      seed: SEED,
    });

    for (const gone of ['rb1', 'rb2', 'rb3']) {
      expect(percent(projection, gone)).toBe(0);
      expect(survivalFor(projection, gone)?.band).toBe('likely-gone');
    }
    for (const safe of ['wr1', 'wr2']) {
      expect(percent(projection, safe)).toBe(1);
      expect(survivalFor(projection, safe)?.band).toBe('likely-available');
    }
  });
});

// ---------------------------------------------------------------------------------------------
// §T7 done-when (2) — SC-2's stability guardrail as an automated check.
// ---------------------------------------------------------------------------------------------

describe('simulation stability on an unchanged board (SC-2, §T7 done-when 2)', () => {
  const players: SimulationCandidate[] = Array.from({ length: 40 }, (_, i) =>
    candidate(`p${i + 1}`, (['RB', 'WR', 'QB', 'TE'] as const)[i % 4]!, i + 1, i + 1),
  );
  const picks: SimulatedPick[] = Array.from({ length: 10 }, (_, i) =>
    simPick({
      pickNo: 30 + i,
      teamId: `slot-${(i % 5) + 1}`,
      bentDistribution: dist({ RB: 0.4, WR: 0.3, TE: 0.2, QB: 0.1 }),
      averageReach: i % 3,
      remainingPicks: 12,
    }),
  );

  it('moves no player’s percentage across a band boundary between two runs', () => {
    // The production path — no `seed`, no injected generator, exactly how T10's orchestrator will
    // call it. The guardrail holds because the seed is derived from the inputs, so an unchanged
    // board replays the same stream. Sampling *independently* cannot satisfy it: on this fixture
    // p3's true survival is ≈0.7524, 0.0024 above the 0.75 boundary against a per-run standard
    // error of ≈0.0097, so two independent samples disagree on its band about half the time, and
    // no affordable run count closes a gap that small.
    const first = project({ picks, players });
    const second = project({ picks, players });

    expect(first.universe).not.toHaveLength(0);
    for (const player of first.universe) {
      const a = survivalFor(first, player.sleeperPlayerId)!;
      const b = survivalFor(second, player.sleeperPlayerId)!;
      expect(`${player.sleeperPlayerId}:${b.band}`).toBe(`${player.sleeperPlayerId}:${a.band}`);
      expect(b.probability).toBe(a.probability);
    }
  });

  it('holds that guardrail on the whole matrix, not just the aggregates', () => {
    expect(Array.from(project({ picks, players }).survivors)).toEqual(
      Array.from(project({ picks, players }).survivors),
    );
  });

  it('does not buy stability by ignoring the board — a changed input redraws the stream', () => {
    // Otherwise a hard-coded constant seed would pass the guardrail above while quietly sampling
    // the same stream for every board in the draft.
    const universeOn = (drafted: readonly string[] = []) =>
      buildSimulationUniverse({ players, board: boardOf(drafted), size: config().simUniverseSize });
    const base = deriveSeed(universeOn(), picks, config());

    // Same inputs, same stream — the property the guardrail above rests on.
    expect(deriveSeed(universeOn(), picks, config())).toBe(base);
    // One more player off the board.
    expect(deriveSeed(universeOn(['p2']), picks, config())).not.toBe(base);
    // Same universe, one team's reach profile revised by FR-7.
    const revised = picks.map((pick, i) => (i === 3 ? { ...pick, averageReach: 9 } : pick));
    expect(deriveSeed(universeOn(), revised, config())).not.toBe(base);
    // Same universe and picks, a turned-down 🔶 knob.
    expect(deriveSeed(universeOn(), picks, config({ monteCarloRunCount: 500 }))).not.toBe(base);
  });

  it('pins the derived seed to a golden value for a fixed board', () => {
    // A GOLDEN PIN, deliberately brittle. Every other assertion in this file is *relative* — the
    // same board seeds the same stream, a different board a different one — so editing
    // `deriveSeed`'s hash mixture (a separator, a field's order, a field added or dropped) moves
    // every survival percentage and plan score on the board while the whole suite stays green.
    // The FNV separators are NUL characters, which are invisible in an editor, so that edit can
    // happen by accident: a review found the module's five separators typed as literal 0x00 bytes,
    // normalised them to spaces to see what would notice, and 124/124 tests still passed while the
    // seed moved. Nothing in the suite pinned it. This does.
    //
    // If this assertion fails you have changed what the simulation samples. That is allowed — but
    // it is never incidental. Re-derive the value, update the literal below in the same commit as
    // the change that moved it, and say in the commit message why the stream had to move.
    const universe = buildSimulationUniverse({
      players,
      board: boardOf(),
      size: config().simUniverseSize,
    });
    // Re-pinned 2026-08-27: the stream moved because `kdstEarlyPickWindow` joined the seed —
    // the early K/DST placement window changes what a draw samples, so it must (AC-47 amendment).
    expect(deriveSeed(universe, picks, config())).toBe(2646130542);
  });

  it('keeps two independent samples inside a band’s width at the default run count', () => {
    // What the run count buys, stated separately from the determinism above: the *estimate* is
    // sound, not merely repeatable. Asserted on the percentages — asserting band equality across
    // independent samples is the unachievable claim the comment above explains.
    for (const [seedA, seedB] of [
      [1, 2],
      [3, 4],
      [5, 6],
    ] as const) {
      const first = project({ picks, players, seed: seedA });
      const second = project({ picks, players, seed: seedB });

      for (const player of first.universe) {
        const a = survivalFor(first, player.sleeperPlayerId)!;
        const b = survivalFor(second, player.sleeperPlayerId)!;
        expect(
          Math.abs(a.probability - b.probability),
          `${player.sleeperPlayerId}: ${a.probability} vs ${b.probability}`,
        ).toBeLessThan(0.05);
      }
    }
  });

  it('is bit-identical when the same seed is reused, so a rerun can be reasoned about', () => {
    const first = project({ picks, players, config: { monteCarloRunCount: 500 }, seed: 7 });
    const second = project({ picks, players, config: { monteCarloRunCount: 500 }, seed: 7 });

    expect(Array.from(second.survivors)).toEqual(Array.from(first.survivors));
  });
});

// ---------------------------------------------------------------------------------------------
// §T7 done-when (3) — the latency budget.
// ---------------------------------------------------------------------------------------------

describe('recompute latency (AC-46, §T7 done-when 3)', () => {
  it('completes a realistic recompute far inside the insight-refresh budget', () => {
    const players: SimulationCandidate[] = Array.from({ length: 120 }, (_, i) =>
      candidate(`p${i + 1}`, (['RB', 'WR', 'QB', 'TE'] as const)[i % 4]!, i + 1, i + 1),
    );
    const picks: SimulatedPick[] = Array.from({ length: 15 }, (_, i) =>
      simPick({
        pickNo: 40 + i,
        teamId: `slot-${(i % 8) + 1}`,
        bentDistribution: i % 4 === 3 ? undefined : dist({ RB: 0.35, WR: 0.35, TE: 0.2, QB: 0.1 }),
        averageReach: (i % 5) - 2,
        unfilledKDstSlots: 2,
        remainingPicks: 11,
      }),
    );

    const startedAt = performance.now();
    const projection = project({ picks, players, seed: SEED });
    const elapsedMs = performance.now() - startedAt;

    expect(projection.universe).toHaveLength(PARAMETER_DEFAULTS.simUniverseSize);
    expect(projection.runCount).toBe(PARAMETER_DEFAULTS.monteCarloRunCount);
    expect(projection.survivors).toHaveLength(
      PARAMETER_DEFAULTS.monteCarloRunCount * PARAMETER_DEFAULTS.simUniverseSize,
    );
    // A fifth of 🔶 insightRefreshLatencyMs — the margin §T7 asks the benchmark to prove, stated
    // against the configured budget rather than a magic millisecond count.
    expect(elapsedMs).toBeLessThan(PARAMETER_DEFAULTS.insightRefreshLatencyMs / 5);
  });
});

// ---------------------------------------------------------------------------------------------
// The seeded generator itself.
// ---------------------------------------------------------------------------------------------

describe('the seeded generator', () => {
  it('repeats exactly for one seed and differs across seeds', () => {
    const a = createSeededRandom(42);
    const b = createSeededRandom(42);
    const c = createSeededRandom(43);

    const draw = (random: () => number): number[] => Array.from({ length: 5 }, () => random());
    const first = draw(a);

    expect(draw(b)).toEqual(first);
    expect(draw(c)).not.toEqual(first);
    for (const value of first) {
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});

// ---------------------------------------------------------------------------------------------
// The seam from FR-6/FR-7's panel rows onto simulated picks.
// ---------------------------------------------------------------------------------------------

describe('reading the enriched opponent panel (the FR-7 seam)', () => {
  const row = (overrides: Partial<OpponentPanelEntry>): OpponentPanelEntry =>
    ({
      pickNo: 26,
      round: 3,
      teamId: 'slot-2',
      unfilledStartingSlots: {
        dedicated: { QB: 1, RB: 0, WR: 2, TE: 1, K: 1, DST: 1 },
        flex: 1,
      },
      needVector: { QB: 1, RB: 0, WR: 2, TE: 1, K: 0, DST: 0 },
      needDistribution: { QB: 0.25, RB: 0, WR: 0.5, TE: 0.25, K: 0, DST: 0 },
      remainingPicks: 13,
      mostLikelyPositions: [],
      examplePlayers: [],
      ...overrides,
    }) as OpponentPanelEntry;

  it('takes the bent distribution, the reach and the K/DST slots off each row', () => {
    const [pick] = toSimulatedPicks([
      row({
        bentDistribution: dist({ QB: 0.2, RB: 0.1, WR: 0.5, TE: 0.2 }),
        tendencyProfile: {
          teamId: 'slot-2',
          pickCount: 4,
          averageReach: 2.5,
          reachSampleCount: 4,
          needAdherence: 0.75,
          observedPositionalShare: { QB: 0, RB: 0.5, WR: 0.5, TE: 0, K: 0, DST: 0 },
          expectedPositionalShare: { QB: 0, RB: 0.5, WR: 0.5, TE: 0, K: 0, DST: 0 },
          confidence: 'established',
        },
      }),
    ]);

    expect(pick).toEqual({
      pickNo: 26,
      teamId: 'slot-2',
      bentDistribution: dist({ QB: 0.2, RB: 0.1, WR: 0.5, TE: 0.2 }),
      averageReach: 2.5,
      unfilledKDstSlots: 2,
      remainingPicks: 13,
    });
  });

  it('leaves the distribution absent for a no-need-signal row, which is the ADP-order regime', () => {
    const [pick] = toSimulatedPicks([row({ needDistribution: null })]);

    expect(pick?.bentDistribution).toBeUndefined();
    expect(pick?.averageReach).toBe(0);
  });
});

// ---------------------------------------------------------------------------------------------
// Composed against the real window, roster panels and tendency profiles.
// ---------------------------------------------------------------------------------------------

describe('composed against the live board (AC-42, AC-47)', () => {
  const bundle = windowBundleJson as unknown as SleeperFixtureBundle;
  const USER_ID = '700000000000000005';

  const CANDIDATES: ExampleCandidate[] = [
    { sleeperPlayerId: '9509', playerName: 'Bijan Robinson', position: 'RB', ecrRank: 1, adp: 1.2 },
    { sleeperPlayerId: '7564', playerName: "Ja'Marr Chase", position: 'WR', ecrRank: 2, adp: 1.8 },
    { sleeperPlayerId: '9226', playerName: "De'Von Achane", position: 'RB', ecrRank: 10, adp: 11.1 },
    { sleeperPlayerId: '12527', playerName: 'Ashton Jeanty', position: 'RB', ecrRank: 12, adp: 15.4 },
    { sleeperPlayerId: '11584', playerName: 'Bucky Irving', position: 'RB', ecrRank: 18, adp: null },
    { sleeperPlayerId: '9224', playerName: 'Chase Brown', position: 'RB', ecrRank: 22, adp: 20.6 },
    { sleeperPlayerId: '8112', playerName: 'Drake London', position: 'WR', ecrRank: 14, adp: 13.0 },
    { sleeperPlayerId: '8146', playerName: 'Garrett Wilson', position: 'WR', ecrRank: 16, adp: 19.9 },
    { sleeperPlayerId: '6801', playerName: 'Tee Higgins', position: 'WR', ecrRank: 20, adp: 17.2 },
    { sleeperPlayerId: '11635', playerName: 'Ladd McConkey', position: 'WR', ecrRank: 24, adp: 26.0 },
    { sleeperPlayerId: '6904', playerName: 'Jalen Hurts', position: 'QB', ecrRank: 28, adp: 35.0 },
    { sleeperPlayerId: '4046', playerName: 'Patrick Mahomes', position: 'QB', ecrRank: 34, adp: 31.5 },
    { sleeperPlayerId: '4217', playerName: 'George Kittle', position: 'TE', ecrRank: 30, adp: 33.5 },
    { sleeperPlayerId: '5012', playerName: 'Mark Andrews', position: 'TE', ecrRank: 44, adp: 41.0 },
  ];

  const compose = (visiblePicks: number) => {
    const ingest = {
      draft: bundle.draft,
      picks: bundle.picks.slice(0, visiblePicks),
      tradedPicks: bundle.tradedPicks,
      leagueUsers: bundle.leagueUsers,
    } as unknown as SleeperIngest;
    const state = deriveDraftState(ingest, { userId: USER_ID });
    const slots: SlotConfig = state.meta.slots;

    const { window: draftWindow, entries } = computeOpponentPanel({
      teamCount: state.meta.teamCount,
      rounds: state.meta.rounds,
      picksMade: state.pickFeed.length,
      userTeamId: state.userTeamId,
      ownerOf: buildPickOwnerResolver(ingest.draft, ingest.tradedPicks),
      panelFor: (teamId) => computeRosterPanel({ teamId, slots, pickFeed: state.pickFeed }),
      players: CANDIDATES,
      board: state.board,
    });

    const enriched = applyTendencyProfiles({
      entries,
      profileFor: (teamId) =>
        computeTendencyProfile({
          teamId,
          slots,
          pickFeed: state.pickFeed,
          adpFor: (id) => CANDIDATES.find((c) => c.sleeperPlayerId === id)?.adp ?? null,
          coldStartPicks: PARAMETER_DEFAULTS.tendencyColdStartPicks,
        }),
      bpaDistribution: computeBpaDistribution(CANDIDATES, state.board),
      nudgeClamp: PARAMETER_DEFAULTS.tendencyPositionalNudgeClamp,
    });

    return { state, draftWindow, enriched };
  };

  it('simulates every pick of the real ten-pick window, traded seats included', () => {
    const { state, draftWindow, enriched } = compose(24);
    const picks = toSimulatedPicks(enriched);

    expect(draftWindow.nextUserPickNo).toBe(36);
    expect(picks.map((pick) => pick.pickNo)).toEqual([26, 27, 28, 29, 30, 31, 32, 33, 34, 35]);
    // Pick 28 was traded to seat 2 (T5's fixture); the simulation inherits that, never the column.
    expect(picks[2]?.teamId).toBe('slot-2');

    const projection = simulateSurvival({
      window: draftWindow,
      picks,
      players: CANDIDATES,
      board: state.board,
      config: config(),
      seed: SEED,
    });

    // Two of the fourteen candidates are already drafted in the fixture.
    expect(projection.universe).toHaveLength(12);
    expect(universeIds(projection)).not.toContain('9509');
    expect(universeIds(projection)).not.toContain('7564');
    // Ten picks over a twelve-player universe: exactly two survive every run.
    for (let run = 0; run < projection.runCount; run += 1) {
      const alive = projection.universe.filter((player) =>
        survivedInRun(projection, run, player.sleeperPlayerId),
      );
      expect(alive).toHaveLength(2);
    }
    // The best available player is far likelier to go than the twelfth-ranked one.
    expect(percent(projection, '9226')).toBeLessThan(percent(projection, '5012'));
  });

  it('does not saturate a seat two rounds in, though it owns one window pick (AC-47)', () => {
    const { enriched } = compose(24);
    const picks = toSimulatedPicks(enriched);

    // Every seat still has its K and DST slots open at this point in the draft…
    expect(picks.every((pick) => pick.unfilledKDstSlots === 2)).toBe(true);
    // …and every one of them still owns more than two picks, so none is saturated.
    expect(picks.every((pick) => pick.remainingPicks > 2)).toBe(true);
    expect(planKDstSaturation(picks)).toEqual(picks.map(() => false));
  });
});
