import { describe, expect, it } from 'vitest';

import { PARAMETER_DEFAULTS } from './config/parameters';
import {
  computeNeedVector,
  computeUnfilledStartingSlots,
  normalizeToDistribution,
} from './needvector';
import { NO_NEED_SIGNAL } from './types/roster';
import type { Position } from './types/board';
import type { SlotConfig } from './types/roster';

/** 10-team half-PPR default shape from the PRD's own worked example. */
const DEFAULT_SLOTS: SlotConfig = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 6 };

const filled = (partial: Partial<Record<Position, number>>): Record<Position, number> => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
  ...partial,
});

describe('computeNeedVector', () => {
  it('gives every unfilled dedicated starting slot weight 1 for its position', () => {
    const v = computeNeedVector(
      { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 0, K: 1, DST: 1, BN: 6 },
      filled({ QB: 1, RB: 0, WR: 1, TE: 0 }),
    );

    expect(v).not.toBe(NO_NEED_SIGNAL);
    expect(v).toEqual({ QB: 0, RB: 2, WR: 1, TE: 1, K: 0, DST: 0 });
  });

  it('splits each unfilled FLEX slot evenly across the eligible positions', () => {
    // Every dedicated skill slot is filled; only the single FLEX remains.
    const v = computeNeedVector(DEFAULT_SLOTS, filled({ QB: 1, RB: 2, WR: 2, TE: 1 }));

    const third = 1 / PARAMETER_DEFAULTS.flexEligiblePositions.length;
    expect(v).toEqual({ QB: 0, RB: third, WR: third, TE: third, K: 0, DST: 0 });
  });

  it('adds the FLEX split on top of unfilled dedicated weights', () => {
    const v = computeNeedVector(
      { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 6 },
      filled({ QB: 1, RB: 1, WR: 3, TE: 0 }),
    );

    const third = 1 / 3;
    expect(v).toEqual({ QB: 0, RB: 1 + third, WR: third, TE: 1 + third, K: 0, DST: 0 });
  });

  it('honours a non-standard FLEX eligibility set supplied from config', () => {
    const v = computeNeedVector(DEFAULT_SLOTS, filled({ QB: 1, RB: 2, WR: 2, TE: 1 }), {
      flexEligiblePositions: ['WR', 'TE'],
    });

    expect(v).toEqual({ QB: 0, RB: 0, WR: 0.5, TE: 0.5, K: 0, DST: 0 });
  });

  it('gives K and DST zero weight even when their starting slots are unfilled', () => {
    const v = computeNeedVector(
      { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 0, K: 1, DST: 1, BN: 6 },
      filled({ QB: 1, RB: 2, WR: 2, TE: 1 }),
    );

    // Dedicated skill slots all filled, K and DST both still open -> no need signal at all.
    expect(v).toBe(NO_NEED_SIGNAL);
  });

  it('returns the no-need-signal sentinel (not a zero vector) when every starting slot is filled', () => {
    // Dedicated slots all filled, the WR surplus filling FLEX, K and DST rostered too.
    const v = computeNeedVector(DEFAULT_SLOTS, filled({ QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DST: 1 }));

    expect(v).toBe(NO_NEED_SIGNAL);
  });

  it('lets a position drafted past its dedicated slots consume the FLEX slot', () => {
    const v = computeNeedVector(DEFAULT_SLOTS, filled({ QB: 1, RB: 3, WR: 2, TE: 1 }));

    // The third RB fills FLEX, so nothing is left unfilled among skill slots.
    expect(v).toBe(NO_NEED_SIGNAL);
  });

  it('never lets surplus at one position fill more than the available FLEX slots', () => {
    const v = computeNeedVector(DEFAULT_SLOTS, filled({ QB: 1, RB: 5, WR: 1, TE: 1 }));

    // Two surplus RBs, but only one FLEX slot -> WR's dedicated slot is still open.
    expect(v).toEqual({ QB: 0, RB: 0, WR: 1, TE: 0, K: 0, DST: 0 });
  });
});

describe('computeUnfilledStartingSlots', () => {
  it('reports dedicated and FLEX starting-slot counts including K and DST', () => {
    const unfilled = computeUnfilledStartingSlots(
      DEFAULT_SLOTS,
      filled({ QB: 1, RB: 1, WR: 2, TE: 0 }),
    );

    expect(unfilled).toEqual({
      dedicated: { QB: 0, RB: 1, WR: 0, TE: 1, K: 1, DST: 1 },
      flex: 1,
    });
  });
});

describe('normalizeToDistribution', () => {
  it('turns raw need weights into a sum-1 distribution', () => {
    const v = computeNeedVector(
      { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 0, K: 1, DST: 1, BN: 6 },
      filled({ QB: 1, RB: 0, WR: 1, TE: 0 }),
    );
    expect(v).not.toBe(NO_NEED_SIGNAL);

    const dist = normalizeToDistribution(v as Record<Position, number>);

    expect(dist).toEqual({ QB: 0, RB: 0.5, WR: 0.25, TE: 0.25, K: 0, DST: 0 });
    expect(Object.values(dist).reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('throws on an all-zero vector, because callers must branch on the sentinel instead', () => {
    expect(() => normalizeToDistribution(filled({}))).toThrow(/no-need-signal/);
  });
});
