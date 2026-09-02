import { describe, expect, it } from 'vitest';

import { allocateFlexDemand, deriveFlexShare, unclampedCurveLookup } from './flexDemand';
import type { FlexDemandInput } from './flexDemand';

/** A standard 10-team lineup: 1 QB, 2 RB, 2 WR, 1 TE, 1 FLEX. */
const STANDARD = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1 };

/**
 * Curves shaped like the 2026 half-PPR cache: RB and WR interleave through the 20s while TE
 * sits well below both from TE11 on, so the FLEX seats trade between RB and WR and never reach
 * a tight end.
 */
const halfPpr: FlexDemandInput['valueAt'] = (position, rank) => {
  if (position === 'RB') return Math.max(0, 21 - 0.35 * (rank - 1));
  if (position === 'WR') return Math.max(0, 19.5 - 0.3 * (rank - 1));
  if (position === 'TE') return Math.max(0, 13 - 0.35 * (rank - 1));
  return Math.max(0, 24 - 0.5 * (rank - 1));
};

const input = (overrides: Partial<FlexDemandInput> = {}): FlexDemandInput => ({
  slots: STANDARD,
  teamCount: 10,
  flexEligiblePositions: ['RB', 'WR', 'TE'],
  valueAt: halfPpr,
  ...overrides,
});

describe('allocateFlexDemand', () => {
  it('sends a standard room’s FLEX starters to RB and WR by curve value, never to TE', () => {
    const { demand, flexAllocated, flexStarters, priced } = allocateFlexDemand(input());

    expect(flexStarters).toBe(10);
    expect(priced).toBe(10);
    expect(flexAllocated.TE).toBe(0);
    expect(flexAllocated.RB + flexAllocated.WR).toBe(10);
    expect(flexAllocated.RB).toBeGreaterThan(0);
    expect(flexAllocated.WR).toBeGreaterThan(0);
    // Dedicated demand plus the FLEX seats each position earned.
    expect(demand.RB).toBe(20 + flexAllocated.RB);
    expect(demand.WR).toBe(20 + flexAllocated.WR);
    expect(demand.TE).toBe(10);
    expect(demand.QB).toBe(10);
  });

  it('lets a TE-premium curve earn FLEX seats from its scoring rather than a hardcoded tactic', () => {
    const tePremium: FlexDemandInput['valueAt'] = (position, rank) =>
      position === 'TE' ? Math.max(0, 22 - 0.3 * (rank - 1)) : halfPpr(position, rank);
    const { flexAllocated } = allocateFlexDemand(input({ valueAt: tePremium }));

    expect(flexAllocated.TE).toBeGreaterThan(0);
  });

  it('never seats a position outside the eligible set, whatever its curve says', () => {
    const { flexAllocated } = allocateFlexDemand(input({ flexEligiblePositions: ['RB', 'WR'] }));
    expect(flexAllocated.QB).toBe(0);
    expect(flexAllocated.TE).toBe(0);
  });

  it('still seats every FLEX starter when the curves price nothing, and says none were priced', () => {
    // The bench phase's replacement ranks need a complete demand picture even from a degenerate
    // cache; the share (below) must not be manufactured from the same nothing.
    const { flexAllocated, priced } = allocateFlexDemand(input({ valueAt: () => 0 }));
    expect(flexAllocated.RB).toBe(10);
    expect(priced).toBe(0);
  });
});

describe('deriveFlexShare', () => {
  it('is the priced FLEX allocation as a sum-1 share over the eligible positions', () => {
    const share = deriveFlexShare(input())!;

    expect(share.TE).toBe(0);
    expect(share.RB! + share.WR!).toBeCloseTo(1, 12);
    expect(share.QB).toBeUndefined();
  });

  it('is null when there are no FLEX seats to allocate', () => {
    expect(deriveFlexShare(input({ slots: { ...STANDARD, FLEX: 0 } }))).toBeNull();
  });

  it('is null when the curves cannot price a single seat, so the caller falls back to uniform', () => {
    expect(deriveFlexShare(input({ valueAt: () => 0 }))).toBeNull();
  });

  it('reads a curve unclamped, so one that stops short of the FLEX band decides nothing', () => {
    // A cache holding a single RB season: the value model's clamped lookup would price RB21 at
    // RB1's value and hand every FLEX seat to running backs; unclamped, rank 21 is off the end.
    const curves = { QB: [], RB: [20.5], WR: [], TE: [] };
    expect(unclampedCurveLookup(curves)('RB', 1)).toBe(20.5);
    expect(unclampedCurveLookup(curves)('RB', 21)).toBe(0);
    expect(deriveFlexShare(input({ valueAt: unclampedCurveLookup(curves) }))).toBeNull();
  });

  it('counts only the seats the curves could price when a curve runs out part-way', () => {
    // RB prices its first two FLEX seats, then nothing; WR prices nothing at all. The unpriced
    // seats still land on RB in the full allocation (first eligible), but the share is built
    // from the two priced seats alone.
    const shortCurve: FlexDemandInput['valueAt'] = (position, rank) =>
      position === 'RB' && rank <= 22 ? 10 : 0;
    const share = deriveFlexShare(input({ valueAt: shortCurve }))!;
    expect(share).toEqual({ RB: 1, WR: 0, TE: 0 });
  });
});
