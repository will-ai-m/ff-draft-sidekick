import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import { describe, expect, it } from 'vitest';

import { kdstPickChance, kdstPickLikelihoods } from './kdstTiming';

const FITTED = {
  kdstEarlyPickWindow: PARAMETER_DEFAULTS.kdstEarlyPickWindow,
  kdstEarlyPickDecay: PARAMETER_DEFAULTS.kdstEarlyPickDecay,
};

/** One team's picks from `remaining` down to its last, each with both K/DST slots still open. */
const runOut = (teamId: string, remaining: number, unfilled = 2) =>
  Array.from({ length: remaining }, (_, i) => ({
    teamId,
    unfilledKDstSlots: unfilled,
    remainingPicks: remaining - i,
  }));

describe('kdstPickChance', () => {
  it('is the uniform placement at decay 1 — the 2026-08-27 rule', () => {
    expect(kdstPickChance(2, 6, 4, 1)).toBeCloseTo(2 / 6, 12);
    expect(kdstPickChance(1, 4, 4, 1)).toBeCloseTo(1 / 4, 12);
    // …and the default argument is that rule, for a caller holding only the window.
    expect(kdstPickChance(2, 4, 4)).toBe(0.5);
  });

  it('back-weights toward the deadline below 1, keeping the deadline and the window edge', () => {
    // Weights over the last four picks at 0.5: 1, .5, .25, .125 (sum 1.875).
    expect(kdstPickChance(2, 4, 4, 0.5)).toBeCloseTo((2 * 0.125) / 1.875, 12);
    expect(kdstPickChance(2, 3, 4, 0.5)).toBeCloseTo((2 * 0.25) / 1.75, 12);
    expect(kdstPickChance(2, 2, 4, 0.5)).toBe(1);
    expect(kdstPickChance(2, 7, 4, 0.5)).toBe(0);
    expect(kdstPickChance(0, 1, 4, 0.5)).toBe(0);
  });

  it('caps at 1 and treats an out-of-range decay as its nearest bound', () => {
    expect(kdstPickChance(3, 4, 4, 0.99)).toBeLessThanOrEqual(1);
    expect(kdstPickChance(2, 5, 4, 7)).toBeCloseTo(2 / 5, 12); // clamped to 1: uniform
    expect(kdstPickChance(2, 3, 4, -1)).toBe(0); // clamped to 0: deadline-only
  });
});

describe('kdstPickLikelihoods', () => {
  it('equals the single-pick chance when a team appears once in the window', () => {
    const [only] = kdstPickLikelihoods(
      [{ teamId: 'slot-3', unfilledKDstSlots: 2, remainingPicks: 4 }],
      FITTED,
    );
    expect(only).toBeCloseTo(kdstPickChance(2, 4, 5, 0.5), 12);
  });

  it('carries a team’s first pick into its second at a snake turn, and keeps teams apart', () => {
    const [a1, b1, a2] = kdstPickLikelihoods(
      [
        { teamId: 'a', unfilledKDstSlots: 2, remainingPicks: 3 },
        { teamId: 'b', unfilledKDstSlots: 2, remainingPicks: 9 },
        { teamId: 'a', unfilledKDstSlots: 2, remainingPicks: 3 },
      ],
      { kdstEarlyPickWindow: 5, kdstEarlyPickDecay: 1 },
    );
    // Uniform placement: 2/3 now; then either one slot with two picks (1/2) or two slots with
    // two picks (certain) — the marginal is 2/3 either way, which is what uniform means.
    expect(a1).toBeCloseTo(2 / 3, 12);
    expect(a2).toBeCloseTo((2 / 3) * (1 / 2) + (1 / 3) * 1, 12);
    expect(b1).toBe(0);
  });

  it('is zero through the middle rounds and sums to the slots a team must fill', () => {
    const marginals = kdstPickLikelihoods(runOut('slot-7', 15), FITTED);
    // Picks 15..8 from the end lie outside the last unfilled + window = 7 picks.
    expect(marginals.slice(0, 8).every((value) => value === 0)).toBe(true);
    expect(marginals.reduce((sum, value) => sum + value, 0)).toBeCloseTo(2, 10);
  });

  it('reproduces the back-loaded shape the recorded rooms drafted (the 2026-09-02 fit)', () => {
    // Per-team share of K/DST picks at 1..7 picks from the end, observed across the 2026-09-02
    // league draft and two completed bot mocks (30 teams, 57 picks): .70 .70 .13 .13 .13 .07 .03.
    // Uniform placement over the last six picks predicts .33 at every one of them; the fitted
    // decay lands within a few points at each distance.
    const marginals = kdstPickLikelihoods(runOut('slot-7', 15), FITTED);
    const fromEnd = (r: number) => marginals[15 - r]!;
    expect(fromEnd(1)).toBeCloseTo(0.82, 1);
    expect(fromEnd(2)).toBeCloseTo(0.69, 1);
    expect(fromEnd(3)).toBeCloseTo(0.25, 1);
    expect(fromEnd(4)).toBeCloseTo(0.13, 1);
    expect(fromEnd(5)).toBeLessThan(0.1);
    expect(fromEnd(6)).toBeLessThan(0.05);
    expect(fromEnd(7)).toBeLessThan(0.03);
    for (let r = 2; r <= 7; r += 1) expect(fromEnd(r)).toBeLessThanOrEqual(fromEnd(r - 1));
  });
});
