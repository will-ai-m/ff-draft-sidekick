/**
 * FR-9's endgame K/DST guard (PRD amendment 2026-08-27).
 *
 * Born from AS-7's falsifier firing in the 08-27 mock rehearsal: a user who followed every
 * highlight finished 6 QB / 0 K / 0 DST. The guard is pure roster arithmetic on top of the
 * finished list, so these tests drive `applyEndgameKdstOverride` directly.
 */
import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import type { CandidateListData, CandidateRow, Position } from '@sidekick/shared';
import { describe, expect, it } from 'vitest';

import { applyEndgameKdstOverride } from './candidates';

const row = (
  playerId: string,
  playerName: string,
  position: Position,
  overrides: Partial<CandidateRow> = {},
): CandidateRow => ({
  playerId,
  playerName,
  position,
  team: null,
  ecrRank: null,
  positionalRank: null,
  tier: null,
  adp: null,
  survival: null,
  addedForHighlight: false,
  ...overrides,
});

const skillList = (): CandidateListData => ({
  rows: [row('qb1', 'Sixth Quarterback', 'QB', { ecrRank: 110, adp: 120 })],
  highlightPlayerId: 'qb1',
  reason: 'Best available: Sixth Quarterback (ECR 110).',
  reasonKind: 'best-available',
  planComparison: null,
  disabledReason: null,
});

const kdstRows = () => ({
  K: [
    row('k1', 'Brandon Aubrey', 'K', { ecrRank: 140, positionalRank: 1, adp: 131 }),
    row('k2', 'Jake Bates', 'K', { ecrRank: 150, positionalRank: 2, adp: 140 }),
  ],
  DST: [
    row('dst1', 'Denver Broncos', 'DST', { ecrRank: 135, positionalRank: 1, adp: 128 }),
    row('dst2', 'Baltimore Ravens', 'DST', { ecrRank: 141, positionalRank: 2, adp: 133 }),
  ],
});

const config = PARAMETER_DEFAULTS; // endgameKdstBufferPicks: 1

describe('the endgame K/DST guard (FR-9 amendment)', () => {
  it('fills an open QB before reserving the final K and DST picks', () => {
    const list: CandidateListData = {
      ...skillList(),
      rows: [
        row('wr-depth', 'Depth Receiver', 'WR', { ecrRank: 80, adp: 85 }),
        row('qb1', 'Bo Nix', 'QB', { ecrRank: 96, adp: 113 }),
      ],
      highlightPlayerId: 'wr-depth',
      reason: 'Depth is valuable while QB can wait.',
      reasonKind: 'too-close-to-call',
    };
    const result = applyEndgameKdstOverride({
      list,
      userRemainingPicks: 3,
      unfilledK: 1,
      unfilledDst: 1,
      unfilledSkill: { QB: 1 },
      skillRows: { QB: [row('qb1', 'Bo Nix', 'QB', { ecrRank: 96, adp: 113 })] },
      kdstRows: kdstRows(),
      config,
    });

    expect(result.highlightPlayerId).toBe('qb1');
    expect(result.reasonKind).toBe('endgame-starter');
    expect(result.reason).toMatch(/3 picks left for 3 required roster slots/);
    expect(result.reason).toMatch(/fill QB before K\/DST: Bo Nix/);
    expect(result.planComparison).toBeNull();
  });

  it('still compares QB tier value against depth before the hard roster deadline', () => {
    const list = skillList();
    expect(
      applyEndgameKdstOverride({
        list,
        userRemainingPicks: 4,
        unfilledK: 1,
        unfilledDst: 1,
        unfilledSkill: { QB: 1 },
        skillRows: { QB: list.rows },
        kdstRows: kdstRows(),
        config,
      }),
    ).toBe(list);
  });

  it('fires exactly at remaining = unfilled + buffer, not one pick earlier', () => {
    const base = {
      list: skillList(),
      unfilledK: 1,
      unfilledDst: 1,
      kdstRows: kdstRows(),
      config,
    };

    // Default buffer 0 (since 2026-08-28 — rehearsal #3 showed the 1-pick buffer costing a
    // bench RB): 2 unfilled fires with exactly 2 picks left, and 3 left is still a free pick.
    expect(applyEndgameKdstOverride({ ...base, userRemainingPicks: 3 })).toBe(base.list);
    expect(applyEndgameKdstOverride({ ...base, userRemainingPicks: 2 }).reasonKind).toBe(
      'endgame-kdst',
    );

    // A configured buffer of 1 moves the trigger one pick earlier.
    const buffered = { ...base, config: { endgameKdstBufferPicks: 1 } };
    expect(applyEndgameKdstOverride({ ...buffered, userRemainingPicks: 4 })).toBe(base.list);
    expect(applyEndgameKdstOverride({ ...buffered, userRemainingPicks: 3 }).reasonKind).toBe(
      'endgame-kdst',
    );
  });

  it('highlights the better of the two open positions by ADP, and suppresses the plan', () => {
    const result = applyEndgameKdstOverride({
      list: skillList(),
      userRemainingPicks: 2,
      unfilledK: 1,
      unfilledDst: 1,
      kdstRows: kdstRows(),
      config,
    });

    // Broncos DST (ADP 128) beat Aubrey (ADP 131) — market order is the only K/DST signal.
    expect(result.highlightPlayerId).toBe('dst1');
    expect(result.reasonKind).toBe('endgame-kdst');
    expect(result.reason).toMatch(/2 picks left/);
    expect(result.reason).toMatch(/K and DST/);
    expect(result.reason).toMatch(/Denver Broncos is the top DST/);
    expect(result.planComparison).toBeNull();

    // The target was not among the skill rows, so it rides in flagged as added-for-highlight.
    const added = result.rows.find((r) => r.playerId === 'dst1');
    expect(added?.addedForHighlight).toBe(true);
    // The original rows are untouched, in order.
    expect(result.rows[0]?.playerId).toBe('qb1');
  });

  it('recommends the only open position when the other slot is filled', () => {
    const result = applyEndgameKdstOverride({
      list: skillList(),
      userRemainingPicks: 1,
      unfilledK: 1,
      unfilledDst: 0,
      kdstRows: kdstRows(),
      config,
    });

    expect(result.highlightPlayerId).toBe('k1');
    expect(result.reason).toMatch(/1 pick left/);
    expect(result.reason).toMatch(/your K slot is still open/);
  });

  it('does not duplicate a target already present in the rows', () => {
    const list: CandidateListData = {
      ...skillList(),
      rows: [row('dst1', 'Denver Broncos', 'DST', { adp: 128 })],
    };
    const result = applyEndgameKdstOverride({
      list,
      userRemainingPicks: 2,
      unfilledK: 1,
      unfilledDst: 1,
      kdstRows: kdstRows(),
      config,
    });

    expect(result.highlightPlayerId).toBe('dst1');
    expect(result.rows.filter((r) => r.playerId === 'dst1')).toHaveLength(1);
  });

  it.each([
    ['no unfilled K/DST slots', { unfilledK: 0, unfilledDst: 0, userRemainingPicks: 1 }],
    ['no picks remaining', { unfilledK: 2, unfilledDst: 0, userRemainingPicks: 0 }],
  ])('leaves the list alone with %s', (_label, overrides) => {
    const list = skillList();
    expect(
      applyEndgameKdstOverride({ list, kdstRows: kdstRows(), config, ...overrides }),
    ).toBe(list);
  });

  it('leaves a disabled list alone — AC-28 outranks the guard', () => {
    const list: CandidateListData = {
      ...skillList(),
      rows: [],
      highlightPlayerId: null,
      disabledReason: 'No rankings snapshot loaded.',
    };
    expect(
      applyEndgameKdstOverride({
        list,
        userRemainingPicks: 1,
        unfilledK: 1,
        unfilledDst: 1,
        kdstRows: kdstRows(),
        config,
      }),
    ).toBe(list);
  });

  it('stands down when the board holds nobody at the open positions', () => {
    const list = skillList();
    expect(
      applyEndgameKdstOverride({
        list,
        userRemainingPicks: 1,
        unfilledK: 1,
        unfilledDst: 0,
        kdstRows: { K: [], DST: kdstRows().DST },
        config,
      }),
    ).toBe(list);
  });
});
