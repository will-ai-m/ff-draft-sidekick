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
import type { SlotConfig } from '@sidekick/shared';
import { describe, expect, it } from 'vitest';

import { benchPlanPositions, computeCandidateList } from './candidates';
import type { BenchPhaseInput, CandidatePlayer, CandidateListConfig } from './candidates';

const cfg = (overrides: Partial<CandidateListConfig> = {}): CandidateListConfig => ({
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
    // One QB is under the cap, so a backup QB is still a legitimate bench pick.
    expect(benchPlanPositions(bench({ QB: 1, RB: 2, WR: 6, TE: 1 }), cfg())).toEqual([
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
      benchPlanPositions({ rosterCounts: { QB: 2 }, slots: twoQb }, cfg()),
    ).toContain('QB');
  });
});

describe('the bench phase (FR-9/FR-10 amendment)', () => {
  it('redirects off a capped-position board leader and says why — the rehearsal regression', () => {
    // Pick #108 of the 08-27 mock: two QBs already rostered, Purdy leading the board. The old
    // regime highlighted him (QB3); the bench phase must not.
    const list = compute(bench({ QB: 2, RB: 2, WR: 4, TE: 1 }));

    expect(list.highlightPlayerId).toBe('wr1');
    expect(list.reasonKind).toBe('bench-depth');
    expect(list.reason).toMatch(/Brock Purdy \(QB\) leads the board/);
    expect(list.reason).toMatch(/already carry 2 QBs for 1 starting slot/);
    expect(list.reason).toMatch(/Josh Downs \(WR\) is the best pick that still adds depth/);
  });

  it('still allows a backup QB while the roster is under the cap', () => {
    const list = compute(bench({ QB: 1, RB: 2, WR: 4, TE: 1 }));

    // QB count 1 < cap 2: Purdy is a legitimate QB2 recommendation, by the ordinary ladder.
    expect(list.highlightPlayerId).toBe('qb3');
    expect(list.reasonKind).not.toBe('bench-depth');
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
