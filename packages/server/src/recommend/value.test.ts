import { describe, expect, it } from 'vitest';
import type { Board, Position, SkillPosition } from '@sidekick/shared';

import { buildPlayerValueModel, skillTierOutlook, tierOutlook, valueOf } from './value';
import type { ValueModelPlayer } from './value';

// ---------------------------------------------------------------------------------------------
// Fixture. Curves and tiers chosen so every shaded value below is short arithmetic.
// ---------------------------------------------------------------------------------------------

const player = (
  sleeperPlayerId: string,
  position: Position,
  ecrRank: number | null,
  tier: number | null,
): ValueModelPlayer => ({
  sleeperPlayerId,
  playerName: sleeperPlayerId,
  position,
  ecrRank,
  tier,
});

const CURVES: Record<SkillPosition, number[]> = {
  QB: [22, 21],
  RB: [21, 18, 12],
  WR: [18, 16, 14, 12],
  TE: [12, 6],
};

const boardOf = (drafted: readonly string[] = []): Pick<Board, 'players'> => ({
  players: Object.fromEntries(drafted.map((id) => [id, { drafted: true }])),
});

describe('pricing — the shaded own-rank curve value (AC-55, amended 2026-08-31)', () => {
  const players = [
    player('rb1', 'RB', 1, 1),
    player('rb2', 'RB', 3, 1),
    player('rb3', 'RB', 7, 2),
  ];

  it('prices each player at the mean of the curve over [rank, rank + shading]', () => {
    const model = buildPlayerValueModel(players, CURVES, { rankShadingRanks: 2 });
    // rb1 spans ranks 1–3: mean(21, 18, 12) = 17. The peak is shaded, not taken at face value —
    // the bust discount that keeps a thin position's #1 from pricing as its best-ever season.
    expect(valueOf(model, 'rb1')).toBe(17);
    // rb2 spans 2–4; rank 4 is past the curve's end and clamps to its last entry (12).
    expect(valueOf(model, 'rb2')).toBe(14);
    expect(valueOf(model, 'rb3')).toBe(12);
  });

  it('prices at exactly the curve entry with shading 0', () => {
    const model = buildPlayerValueModel(players, CURVES, { rankShadingRanks: 0 });
    expect(valueOf(model, 'rb1')).toBe(21);
    expect(valueOf(model, 'rb2')).toBe(18);
  });

  it('never prices a deep tier’s front runner at the tier mean (the 08-31 Bowers regression)', () => {
    // The first cut assigned every member the group mean, which made the front of a deep tier
    // worth no more than waiting for its tail — the engine opened TE-now at pick 6 and put no
    // RB in three rounds of recommendations. Members of one tier must keep distinct prices.
    const model = buildPlayerValueModel(players, CURVES, { rankShadingRanks: 0 });
    expect(valueOf(model, 'rb1')).toBeGreaterThan(valueOf(model, 'rb2'));
  });

  it('derives positional rank from ECR order within the position, skipping unranked rows', () => {
    const model = buildPlayerValueModel(
      [player('wrX', 'WR', 40, 1), player('wrY', 'WR', 2, 1), player('wrZ', 'WR', null, 1)],
      CURVES,
      { rankShadingRanks: 0 },
    );
    // wrY is WR1 by ECR despite list order; the null-ranked row never enters the model.
    expect(valueOf(model, 'wrY')).toBe(18);
    expect(valueOf(model, 'wrX')).toBe(16);
    expect(valueOf(model, 'wrZ')).toBe(0);
  });

  it('answers 0 for K/DST and for ids it never saw', () => {
    const model = buildPlayerValueModel([player('k1', 'K', 5, 1)], CURVES);
    expect(valueOf(model, 'k1')).toBe(0);
    expect(valueOf(model, 'nobody')).toBe(0);
  });
});

describe('tier grouping — contiguous runs in positional order', () => {
  const players = [
    player('te1', 'TE', 5, 2),
    player('te2', 'TE', 9, 3),
    player('te3', 'TE', 12, 3),
    player('te4', 'TE', 20, null),
    player('wr1', 'WR', 2, 2),
  ];
  const model = buildPlayerValueModel(players, CURVES, { rankShadingRanks: 0 });

  it('groups same-tier neighbours and keeps positions apart', () => {
    const groups = model.tierGroupsByPosition.TE;
    expect(groups.map((group) => group.memberIds)).toEqual([['te1'], ['te2', 'te3'], ['te4']]);
    expect(groups.map((group) => group.tier)).toEqual([2, 3, null]);
    // wr1 shares te1's overall tier number but never its group.
    expect(model.tierGroupByPlayerId.get('wr1')?.position).toBe('WR');
  });

  it('values a group as the mean of its members’ shaded prices', () => {
    // te2 (TE2 → 6) and te3 (TE3, past the curve → clamps to 6): group value 6.
    expect(model.tierGroupsByPosition.TE[1]?.value).toBe(6);
  });

  it('keeps a null tier as its own singleton step, never merged', () => {
    const untiered = buildPlayerValueModel(
      [player('teA', 'TE', 1, null), player('teB', 'TE', 2, null)],
      CURVES,
      { rankShadingRanks: 0 },
    );
    expect(untiered.tierGroupsByPosition.TE.map((group) => group.memberIds)).toEqual([
      ['teA'],
      ['teB'],
    ]);
  });

  it('degrades a tier oddity (a lower tier ranked above a higher one) to smaller runs', () => {
    const odd = buildPlayerValueModel(
      [player('wA', 'WR', 1, 3), player('wB', 'WR', 2, 2), player('wC', 'WR', 3, 3)],
      CURVES,
      { rankShadingRanks: 0 },
    );
    expect(odd.tierGroupsByPosition.WR.map((group) => group.memberIds)).toEqual([
      ['wA'],
      ['wB'],
      ['wC'],
    ]);
  });
});

describe('tierOutlook — the current top tier as seen from the clock (AC-57)', () => {
  const players = [
    player('te1', 'TE', 5, 2),
    player('te2', 'TE', 9, 3),
    player('te3', 'TE', 12, 3),
    player('te4', 'TE', 20, 4),
  ];
  const model = buildPlayerValueModel(players, CURVES, { rankShadingRanks: 0 });

  it('reads the tier of the best available player, with membership counted over the whole group', () => {
    const outlook = tierOutlook(model, boardOf(['te2']), 'TE');
    expect(outlook).toMatchObject({ position: 'TE', tierLabel: 'Tier 2', remaining: 1, size: 1 });
    // The step down quotes the next group with a member left: Tier 3 (value 6), via te3.
    expect(outlook?.dropPerGame).toBe(6);
  });

  it('moves down to the next tier with a member left once the top one is drafted out', () => {
    const outlook = tierOutlook(model, boardOf(['te1', 'te2']), 'TE');
    // Tier 3 is down to te3 of its two members. Tiers 3 and 4 both price at the curve's tail
    // entry (6), so the step between them is genuinely 0.
    expect(outlook).toMatchObject({ tierLabel: 'Tier 3', remaining: 1, size: 2 });
    expect(outlook?.dropPerGame).toBe(0);
  });

  it('reports no drop below the board’s last live tier', () => {
    const outlook = tierOutlook(model, boardOf(['te1', 'te2', 'te3']), 'TE');
    expect(outlook?.tierLabel).toBe('Tier 4');
    expect(outlook?.dropPerGame).toBe(0);
  });

  it('is null once the position is picked clean', () => {
    expect(tierOutlook(model, boardOf(['te1', 'te2', 'te3', 'te4']), 'TE')).toBeNull();
  });

  it('labels an untiered group plainly and guards K/DST at the caller’s seam', () => {
    const untiered = buildPlayerValueModel([player('teA', 'TE', 1, null)], CURVES);
    expect(tierOutlook(untiered, boardOf(), 'TE')?.tierLabel).toBe('the top group');
    expect(skillTierOutlook(model, boardOf(), 'K')).toBeNull();
    expect(skillTierOutlook(model, boardOf(), 'TE')?.position).toBe('TE');
  });
});
