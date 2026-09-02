import { describe, expect, it } from 'vitest';

import { PARAMETER_DEFAULTS } from './config/parameters';
import {
  computeNeedVector,
  computeUnfilledStartingSlots,
  flexingPositions,
  normalizeToDistribution,
  resolveFlexShare,
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

describe('the FLEX share (amended 2026-09-02)', () => {
  /** A standard 10-team room on its own scoring: RB/WR fill FLEX, TE never does. */
  const STANDARD_SHARE = { RB: 0.4, WR: 0.6, TE: 0 };

  it('weights an unfilled FLEX slot by the share instead of splitting it evenly', () => {
    const v = computeNeedVector(DEFAULT_SLOTS, filled({ QB: 1, RB: 2, WR: 2, TE: 1 }), {
      flexShare: STANDARD_SHARE,
    });

    expect(v).toEqual({ QB: 0, RB: 0.4, WR: 0.6, TE: 0, K: 0, DST: 0 });
  });

  it('gives a position at share 0 no FLEX weight, so a rostered TE1 ends TE need outright', () => {
    // The Tucker Kraft case: TE1 rostered, FLEX open. The uniform split kept TE in the plan set
    // through the open FLEX's third; the share says the FLEX is an RB/WR seat.
    const v = computeNeedVector(DEFAULT_SLOTS, filled({ QB: 0, RB: 2, WR: 2, TE: 1 }), {
      flexShare: STANDARD_SHARE,
    }) as Record<Position, number>;

    expect(v.TE).toBe(0);
    expect(v.QB).toBe(1);
    expect(v.RB + v.WR).toBeCloseTo(1, 10);
  });

  it('keeps the FLEX open behind a surplus at a position that does not flex', () => {
    // A second TE is a bench player in this league, not the FLEX starter.
    const unfilled = computeUnfilledStartingSlots(
      DEFAULT_SLOTS,
      filled({ QB: 1, RB: 2, WR: 2, TE: 2 }),
      { flexShare: STANDARD_SHARE },
    );
    expect(unfilled.flex).toBe(1);
    expect(
      computeNeedVector(DEFAULT_SLOTS, filled({ QB: 1, RB: 2, WR: 2, TE: 2 }), {
        flexShare: STANDARD_SHARE,
      }),
    ).toEqual({ QB: 0, RB: 0.4, WR: 0.6, TE: 0, K: 0, DST: 0 });

    // …while a surplus RB still takes the seat, as before.
    expect(
      computeNeedVector(DEFAULT_SLOTS, filled({ QB: 1, RB: 3, WR: 2, TE: 1 }), {
        flexShare: STANDARD_SHARE,
      }),
    ).toBe(NO_NEED_SIGNAL);
  });

  it('renormalises the share over the eligible positions and ignores positions outside them', () => {
    // QB is not FLEX-eligible here, whatever weight the share hands it; RB/WR split the rest.
    expect(resolveFlexShare(['RB', 'WR', 'TE'], { RB: 1, WR: 3, QB: 5 })).toEqual({
      QB: 0,
      RB: 0.25,
      WR: 0.75,
      TE: 0,
    });
    expect(flexingPositions(['RB', 'WR', 'TE'], { RB: 1, WR: 3, QB: 5 })).toEqual(['RB', 'WR']);
  });

  it('falls back to the uniform split when no share is given, or the share gives everyone zero', () => {
    const third = 1 / 3;
    expect(resolveFlexShare(['RB', 'WR', 'TE'])).toEqual({ QB: 0, RB: third, WR: third, TE: third });
    expect(resolveFlexShare(['RB', 'WR', 'TE'], { RB: 0, WR: 0, TE: 0 })).toEqual({
      QB: 0,
      RB: third,
      WR: third,
      TE: third,
    });
    expect(flexingPositions(['RB', 'WR', 'TE'])).toEqual(['RB', 'WR', 'TE']);
    expect(resolveFlexShare([])).toEqual({ QB: 0, RB: 0, WR: 0, TE: 0 });
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
