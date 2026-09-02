/**
 * The bench phase (FR-9/FR-10 amendment, 2026-08-27).
 *
 * Born from the 08-27 mock rehearsal: once the starters filled, the no-need→raw-ECR regime —
 * with AS-8's QB-vs-market ECR skew reading as "value" pick after pick — recommended QB3
 * through QB6 while the roster held two running backs and no bench. These tests pin the
 * replacement regime: plans and the highlight draw from positions that still add bench value,
 * capped positions redirect with a reason that names the player being passed over, and the
 * displayed rows stay raw ECR order throughout.
 */
import { NO_NEED_SIGNAL, PARAMETER_DEFAULTS } from '@sidekick/shared';
import type { SkillPosition, SlotConfig } from '@sidekick/shared';
import { describe, expect, it } from 'vitest';

import {
  benchPickWorth,
  benchPlanPositions,
  benchPositionScarcity,
  benchReplacementRanks,
  computeCandidateList,
} from './candidates';
import type { BenchPhaseInput, CandidatePlayer, CandidateListConfig } from './candidates';
import type { SurvivalProjection } from '../simulation/montecarlo';
import type { PlayerValueModel } from './value';

const cfg = (overrides: Partial<CandidateListConfig> = {}): CandidateListConfig => ({
  candidateListDefaultRows: PARAMETER_DEFAULTS.candidateListDefaultRows,
  valueThresholdAdpPicksEarlier: PARAMETER_DEFAULTS.valueThresholdAdpPicksEarlier,
  nearTieSurvivalPct: PARAMETER_DEFAULTS.nearTieSurvivalPct,
  nearTieEcrRanks: PARAMETER_DEFAULTS.nearTieEcrRanks,
  planTotalTooClosePoints: PARAMETER_DEFAULTS.planTotalTooClosePoints,
  lookaheadMaxPicks: PARAMETER_DEFAULTS.lookaheadMaxPicks,
  benchPositionHeadroom: PARAMETER_DEFAULTS.benchPositionHeadroom,
  flexEligiblePositions: PARAMETER_DEFAULTS.flexEligiblePositions,
  ...overrides,
});

/** A 1-QB league's shape — the exact fixture the 08-27 rehearsal drafted in. */
const SLOTS: SlotConfig = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 2, K: 1, DST: 1, BN: 5 };

const player = (
  sleeperPlayerId: string,
  playerName: string,
  position: CandidatePlayer['position'],
  ecrRank: number,
  adp: number | null,
): CandidatePlayer => ({
  sleeperPlayerId,
  playerName,
  position,
  team: null,
  ecrRank,
  positionalRank: null,
  tier: null,
  adp,
});

// Modeled on the board at pick #108 of the rehearsal: a QB leads the ECR order (with the ADP
// gap that read as "value"), the best bench-eligible players sit behind him.
const BOARD_AT_108: CandidatePlayer[] = [
  player('qb3', 'Brock Purdy', 'QB', 91, 89.8),
  player('wr1', 'Josh Downs', 'WR', 92, 91.4),
  player('qb4', 'Bo Nix', 'QB', 99, 112.3),
  player('rb1', 'Kenny Gainwell', 'RB', 106, 100.9),
  player('qb5', 'Jared Goff', 'QB', 110, 100.1),
  player('te1', 'Spare Tightend', 'TE', 113, 118),
];

const bench = (rosterCounts: BenchPhaseInput['rosterCounts']): BenchPhaseInput => ({
  rosterCounts,
  slots: SLOTS,
  teamCount: 10,
});

const compute = (benchPhase: BenchPhaseInput | null, players = BOARD_AT_108) =>
  computeCandidateList({
    players,
    board: { players: {} },
    window: {
      picks: [],
      userOnTheClock: true,
      inProgressPickNo: 108,
      currentUserPickNo: 108,
      nextUserPickNo: null, // survival suppressed — bench rounds often have no projection
    },
    needVector: NO_NEED_SIGNAL,
    survival: null,
    valueModel: null,
    userRemainingPicks: 5,
    config: cfg(),
    benchPhase,
  });

describe('benchPlanPositions', () => {
  it('caps non-FLEX positions at slots + headroom and never caps FLEX-eligible ones', () => {
    // 2 QBs in a 1-QB league = at the cap (1 + 1); RB/WR/TE stay open at any count.
    expect(benchPlanPositions(bench({ QB: 2, RB: 2, WR: 6, TE: 1 }), cfg())).toEqual([
      'RB',
      'WR',
      'TE',
    ]);
  });

  it('gates a backup QB until every FLEX-eligible position has one (amended 2026-08-31)', () => {
    // Under the cap but RB and TE carry no backup yet: a spare QB can never start weekly in a
    // 1-QB lineup, so FLEX depth comes first — rehearsal #7's Lawrence/Purdy regression.
    expect(benchPlanPositions(bench({ QB: 1, RB: 2, WR: 6, TE: 1 }), cfg())).toEqual([
      'RB',
      'WR',
      'TE',
    ]);
    // Every FLEX position has a backup: one QB2 becomes a legitimate bench pick again.
    expect(benchPlanPositions(bench({ QB: 1, RB: 3, WR: 3, TE: 2 }), cfg())).toEqual([
      'QB',
      'RB',
      'WR',
      'TE',
    ]);
  });

  it('respects a league whose shape starts more quarterbacks', () => {
    // A 2-QB league caps at 3 — the cap is slot arithmetic, never a hardcoded league shape.
    const twoQb: SlotConfig = { ...SLOTS, QB: 2 };
    expect(
      benchPlanPositions({ rosterCounts: { QB: 2, RB: 3, WR: 3, TE: 2 }, slots: twoQb }, cfg()),
    ).toContain('QB');
  });

  it('holds ordinary QB2 and TE2 behind meaningful RB/WR resilience', () => {
    const standardRanks = { QB: 11, RB: 31, WR: 31, TE: 11 };

    // Exact LaPorta/Caleb regression: one RB and WR backup is not enough to spend scarce bench
    // space behind already-startable Bowers and Daniels.
    expect(benchPlanPositions(bench({ QB: 1, RB: 3, WR: 3, TE: 1 }), cfg(), standardRanks)).toEqual(
      ['RB', 'WR'],
    );
    // Once both core positions carry two backups, one insurance QB or TE becomes eligible.
    expect(benchPlanPositions(bench({ QB: 1, RB: 4, WR: 4, TE: 1 }), cfg(), standardRanks)).toEqual(
      ['QB', 'RB', 'WR', 'TE'],
    );
  });

  it('treats TE as core depth when TE-premium scoring earns FLEX demand', () => {
    const premiumRanks = { QB: 11, RB: 21, WR: 21, TE: 31 };

    expect(benchPlanPositions(bench({ QB: 1, RB: 3, WR: 3, TE: 1 }), cfg(), premiumRanks)).toEqual([
      'RB',
      'WR',
      'TE',
    ]);
  });
});

describe('bench replacement ranks', () => {
  const curves = (valueAt: PlayerValueModel['valueAt']): Pick<PlayerValueModel, 'valueAt'> => ({
    valueAt,
  });

  it('uses league scoring to send ordinary 10-team FLEX demand to RB/WR, not TE', () => {
    const standard = curves((position, rank) => {
      if (position === 'RB' || position === 'WR') return 100 - rank;
      if (position === 'TE') return 40 - rank;
      return 80 - rank;
    });

    expect(benchReplacementRanks(bench({}), cfg(), standard)).toEqual({
      QB: 11,
      RB: 31,
      WR: 31,
      TE: 11,
    });
  });

  it('moves the streaming line with league size in an ordinary 12-team format', () => {
    const twelveTeam: BenchPhaseInput = {
      rosterCounts: {},
      slots: { ...SLOTS, FLEX: 1 },
      teamCount: 12,
    };
    const standard = curves((position, rank) => {
      if (position === 'RB' || position === 'WR') return 100 - rank;
      if (position === 'TE') return 40 - rank;
      return 80 - rank;
    });

    expect(benchReplacementRanks(twelveTeam, cfg(), standard)).toEqual({
      QB: 13,
      RB: 31,
      WR: 31,
      TE: 13,
    });
  });

  it('lets TE-premium scoring earn FLEX demand instead of imposing an RB/WR rule', () => {
    const tePremium = curves((position, rank) => (position === 'TE' ? 200 - rank : 100 - rank));

    expect(benchReplacementRanks(bench({}), cfg(), tePremium)).toEqual({
      QB: 11,
      RB: 21,
      WR: 21,
      TE: 31,
    });
  });

  it('lets a QB-eligible FLEX format allocate its extra starters to quarterback', () => {
    const superflex = curves((position, rank) => (position === 'QB' ? 200 - rank : 100 - rank));
    const superflexConfig = cfg({ flexEligiblePositions: ['QB', 'RB', 'WR', 'TE'] });

    expect(benchReplacementRanks(bench({}), superflexConfig, superflex)).toEqual({
      QB: 31,
      RB: 21,
      WR: 21,
      TE: 11,
    });
  });
});

describe('the bench phase (FR-9/FR-10 amendment)', () => {
  it('uses scoring-aware resilience instead of recommending QB2 over shallow RB/WR depth', () => {
    const players = [
      player('qb2', 'Trevor Lawrence', 'QB', 74, 85),
      player('rb4', 'Jonathon Brooks', 'RB', 75, 92),
      player('wr4', 'Bench Receiver', 'WR', 76, 93),
      player('te3', 'Bench Tightend', 'TE', 77, 95),
    ];
    const points = new Map([
      ['qb2', 16.5],
      ['rb4', 13],
      ['wr4', 12],
      ['te3', 9],
    ]);
    const valueModel: PlayerValueModel = {
      pointsByPlayerId: points,
      tierGroupByPlayerId: new Map(),
      tierGroupsByPosition: { QB: [], RB: [], WR: [], TE: [] },
      // Declines with rank, as a real league-scored curve does. A constant-per-position stub
      // would hand every league FLEX slot to one position and make the RB/WR comparison below
      // an artifact of the stub rather than of the scarcity model.
      valueAt: (position, rank) => {
        const base = { QB: 24, RB: 20, WR: 19, TE: 13 }[position];
        const decay = { QB: 0.25, RB: 0.3, WR: 0.28, TE: 0.3 }[position];
        return Math.max(0, base - decay * (rank - 1));
      },
    };
    const universe = players.map((p, index) => ({
      sleeperPlayerId: p.sleeperPlayerId,
      position: p.position as 'QB' | 'RB' | 'WR' | 'TE',
      ecrRank: p.ecrRank!,
      adp: p.adp,
      index,
      samplingRank: index + 1,
      addedForDisplay: false,
    }));
    const survival: SurvivalProjection = {
      suppressed: false,
      degraded: false,
      runCount: 1,
      universe,
      survivors: new Uint8Array(universe.length).fill(1),
      survivalByPlayerId: new Map(
        players.map((p) => [
          p.sleeperPlayerId,
          { probability: 1, band: 'likely-available' as const },
        ]),
      ),
      indexByPlayerId: new Map(players.map((p, index) => [p.sleeperPlayerId, index])),
    };

    const list = computeCandidateList({
      players,
      board: { players: {} },
      window: {
        picks: [],
        userOnTheClock: true,
        inProgressPickNo: 74,
        currentUserPickNo: 74,
        nextUserPickNo: 94,
      },
      needVector: NO_NEED_SIGNAL,
      survival,
      valueModel,
      userRemainingPicks: 5,
      config: cfg(),
      // Mirrors the screenshot: one QB, one backup at every FLEX-eligible position.
      benchPhase: bench({ QB: 1, RB: 3, WR: 3, TE: 2 }),
    });

    expect(list.planComparison?.winner?.nowPosition).toBe('RB');
    expect(list.planComparison?.winner).not.toMatchObject({
      nowPosition: 'QB',
      nextPosition: 'QB',
    });
    expect(list.highlightPlayerId).toBe('rb4');
    expect(list.reasonKind).not.toBeNull();
  });

  it('prices a backup behind its own position, not behind a raw depth count (rehearsal #9)', () => {
    // The user's two observations, made measurable. QB and TE sit permanently at zero backups in
    // a 1-QB/1-TE league, so raw depth called them the neediest holes forever; scarcity prices
    // them at what a backup there is actually worth. A 10-team room drafts QBs and TEs so
    // shallow that the best free agent is *better* than the QB2 on offer (worth 0), while RB and
    // WR fill several lineup slots and are drafted deep enough that the wire is a real cliff.
    const valueAt = (position: SkillPosition, rank: number): number => {
      const base = { QB: 24, RB: 20, WR: 19, TE: 13 }[position];
      const decay = { QB: 0.25, RB: 0.3, WR: 0.28, TE: 0.3 }[position];
      return Math.max(0, base - decay * (rank - 1));
    };
    const scarcity = benchPositionScarcity({
      players: [],
      bench: bench({ QB: 1, RB: 3, WR: 3, TE: 2 }),
      config: cfg(),
      valueModel: { valueAt } as Pick<PlayerValueModel, 'valueAt'>,
    })!;

    // Two RB and two WR starting slots plus a shared FLEX pool: RB/WR carry several times the
    // lineup exposure of the single QB and TE slots.
    expect(scarcity.QB.startShare).toBe(1);
    expect(scarcity.TE.startShare).toBe(1);
    expect(scarcity.RB.startShare).toBeGreaterThan(2);
    expect(scarcity.WR.startShare).toBeGreaterThan(2);

    const worth = (position: SkillPosition, value: number) =>
      benchPickWorth(scarcity, { valueAt } as Pick<PlayerValueModel, 'valueAt'>, position, value);
    // The QB2 on offer is worse than the quarterback sitting on the wire: worth nothing.
    expect(worth('QB', 16.5)).toBe(0);
    // A comparable bench RB clears its own waiver line and starts far more often.
    expect(worth('RB', 13)).toBeGreaterThan(worth('TE', 9));
    expect(worth('RB', 13)).toBeGreaterThan(worth('QB', 16.5));
  });

  it('uses the thinner core position when replacement-adjusted bench plans are flat', () => {
    const players = [
      player('wr4', 'Quentin Johnston', 'WR', 85, 86.9),
      player('rb8', 'Chris Rodriguez Jr.', 'RB', 122, 151.4),
    ];
    const valueModel: PlayerValueModel = {
      pointsByPlayerId: new Map([
        ['wr4', 5],
        ['rb8', 5],
      ]),
      tierGroupByPlayerId: new Map(),
      tierGroupsByPosition: { QB: [], RB: [], WR: [], TE: [] },
      valueAt: () => 6,
    };
    const universe = players.map((p, index) => ({
      sleeperPlayerId: p.sleeperPlayerId,
      position: p.position as 'RB' | 'WR',
      ecrRank: p.ecrRank!,
      adp: p.adp,
      index,
      samplingRank: index + 1,
      addedForDisplay: false,
    }));
    const survival: SurvivalProjection = {
      suppressed: false,
      degraded: false,
      runCount: 1,
      universe,
      survivors: new Uint8Array(universe.length).fill(1),
      survivalByPlayerId: new Map(
        players.map((p) => [
          p.sleeperPlayerId,
          { probability: 1, band: 'likely-available' as const },
        ]),
      ),
      indexByPlayerId: new Map(players.map((p, index) => [p.sleeperPlayerId, index])),
    };

    const list = computeCandidateList({
      players,
      board: { players: {} },
      window: {
        picks: [],
        userOnTheClock: true,
        inProgressPickNo: 122,
        currentUserPickNo: 122,
        nextUserPickNo: 139,
      },
      needVector: NO_NEED_SIGNAL,
      survival,
      valueModel,
      userRemainingPicks: 3,
      config: cfg(),
      // Screenshot regression: seven RBs versus three WRs in a 2-RB/2-WR lineup.
      benchPhase: bench({ QB: 1, RB: 7, WR: 3, TE: 1 }),
    });

    expect(list.planComparison?.winner?.nowPosition).toBe('RB');
    expect(list.planComparison?.winner?.score).toBe(0);
    expect(list.highlightPlayerId).toBe('wr4');
    expect(list.reasonKind).toBe('bench-depth');
    expect(list.reason).toMatch(/WR is your thinnest position \(1 backup\)/);
    expect(list.reason).toMatch(/Quentin Johnston .* over Chris Rodriguez Jr\. \(RB\)/);
  });

  it('redirects off a capped-position board leader and says why — the rehearsal regression', () => {
    // Pick #108 of the 08-27 mock: two QBs already rostered, Purdy leading the board. The old
    // regime highlighted him (QB3); the bench phase must not — and among the eligible
    // positions, RB (no backup behind two starters) outranks WR (two backups) by thinness.
    const list = compute(bench({ QB: 2, RB: 2, WR: 4, TE: 1 }));

    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).toBe('bench-depth');
    expect(list.reason).toMatch(/Brock Purdy \(QB\) leads the board/);
    expect(list.reason).toMatch(/already carry 2 QBs for 1 starting slot/);
    expect(list.reason).toMatch(/Kenny Gainwell \(RB\) is the best pick that still adds depth/);
  });

  it('prefers the thinnest position even when the board leader is bench-eligible', () => {
    // No capped player on top: Josh Downs (WR) leads, but the roster holds two WR backups and
    // zero RB backups — the thinnest-position rule (2026-08-28, rehearsal #3's 8-WR/2-RB
    // regression) takes the RB and says exactly why.
    const noQbBoard = BOARD_AT_108.filter((p) => p.position !== 'QB');
    const list = compute(bench({ QB: 2, RB: 2, WR: 4, TE: 1 }), noQbBoard);

    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).toBe('bench-depth');
    expect(list.reason).toMatch(
      /Bench balance: RB is your thinnest position \(no backup behind your starters\)/,
    );
    expect(list.reason).toMatch(/Kenny Gainwell \(ECR 106\) over Josh Downs \(WR\)/);
  });

  it('holds a backup QB behind FLEX depth, and says so (amended 2026-08-31)', () => {
    // QB count 1 is under the cap, but RB and TE have no backup: the flex-first gate keeps
    // Purdy out of the pool and the redirect names the gate, not a phantom cap.
    const list = compute(bench({ QB: 1, RB: 2, WR: 4, TE: 1 }));

    expect(list.highlightPlayerId).toBe('rb1');
    expect(list.reasonKind).toBe('bench-depth');
    expect(list.reason).toMatch(/Brock Purdy \(QB\) leads the board/);
    expect(list.reason).toMatch(/a backup QB can wait until every FLEX-eligible position has one/);
  });

  it('uses the thinnest eligible fallback when no scoring model exists', () => {
    const list = compute(bench({ QB: 1, RB: 4, WR: 4, TE: 1 }));

    expect(list.highlightPlayerId).toBe('te1');
    expect(list.reasonKind).toBe('bench-depth');
  });

  it('keeps the displayed rows in raw ECR order — only the recommendation is constrained', () => {
    const list = compute(bench({ QB: 2, RB: 2, WR: 4, TE: 1 }));

    expect(list.rows.map((row) => row.playerId)).toEqual([
      'qb3',
      'wr1',
      'qb4',
      'rb1',
      'qb5',
      'te1',
    ]);
  });

  it('without bench context, the pre-amendment raw best-available regime is unchanged', () => {
    const list = compute(null);

    expect(list.highlightPlayerId).toBe('qb3');
    expect(list.reasonKind).not.toBe('bench-depth');
  });

  it('falls back to the raw board when every bench-eligible position is empty on it', () => {
    const qbOnly = [player('qb9', 'Last Quarterback', 'QB', 140, 150)];
    const list = compute(bench({ QB: 2, RB: 5, WR: 6, TE: 2 }), qbOnly);

    // Nothing bench-eligible left at all — recommending the only player beats recommending
    // nobody, and no bench-depth claim is made.
    expect(list.highlightPlayerId).toBe('qb9');
    expect(list.reasonKind).not.toBe('bench-depth');
  });

  it('the within-noise line never names a capped-position player as the alternative', () => {
    const list = compute(bench({ QB: 2, RB: 2, WR: 4, TE: 1 }));
    expect(list.reason).not.toMatch(/Bo Nix|Jared Goff/);
  });
});
