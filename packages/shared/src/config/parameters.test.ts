import { describe, expect, it } from 'vitest';

import { PARAMETER_DEFAULTS, PARAMETER_KEYS, isParameterKey } from './parameters';

/**
 * Guards the constitution's "configurable, not hardcoded" rule from the other side:
 * every 🔶 AS-N default the PRD states a number for must appear here with exactly that
 * number, so a later task can only change behaviour by changing config, not by inventing
 * a different constant somewhere else.
 */
describe('PARAMETER_DEFAULTS', () => {
  it('matches every PRD-cited AS-N default exactly', () => {
    expect(PARAMETER_DEFAULTS).toMatchObject({
      pollIntervalMs: 1000,
      apiBudgetPerMin: 120,
      initialIngestTimeoutMs: 10_000,
      pickReflectionLatencyMs: 3000,
      resyncTimeoutMs: 5000,
      snapshotStalenessWarningHours: 24,
      insightRefreshLatencyMs: 5000,
      tendencyColdStartPicks: 3,
      survivalBandLikelyGoneMax: 0.25,
      survivalBandLikelyAvailableMin: 0.75,
      candidateListDefaultRows: 8,
      valueThresholdAdpPicksEarlier: 10,
      nearTieSurvivalPct: 5,
      nearTieEcrRanks: 3,
      // Amended 2026-08-31: plans score in shaded-curve projected points, not ECR-rank sums.
      planTotalTooClosePoints: 0.75,
      lookaheadMaxPicks: 2,
      adpPoolTeamSizes: [8, 10, 12, 14],
      flexEligiblePositions: ['RB', 'WR', 'TE'],
    });
  });

  it('carries the architect-supplied defaults the PRD names without a number', () => {
    expect(PARAMETER_DEFAULTS).toMatchObject({
      simUniverseSize: 40,
      monteCarloRunCount: 2000,
      secondInstanceBackoffFactor: 0.5,
      gamelogSeasonsToCache: 3,
      reachAdjustmentPerPick: 1,
      // Both fitted 2026-08-31 by joint MLE on observed rehearsal-draft opponent picks.
      drawSharpness: 1.5,
      opponentNeedBlend: 0.45,
      burstDebounceMs: 400,
      rateLimitBackoffMaxMs: 10_000,
      tendencyPositionalNudgeClamp: 0.5,
      snapshotFetchTimeoutMs: 15_000,
    });
  });

  it('keeps the survival bands ordered so "coin flip" is a real band', () => {
    expect(PARAMETER_DEFAULTS.survivalBandLikelyGoneMax).toBeLessThan(
      PARAMETER_DEFAULTS.survivalBandLikelyAvailableMin,
    );
  });

  it('exposes every default as a recognised parameter key', () => {
    expect([...PARAMETER_KEYS].sort()).toEqual(Object.keys(PARAMETER_DEFAULTS).sort());
    expect(isParameterKey('pollIntervalMs')).toBe(true);
    expect(isParameterKey('nope')).toBe(false);
  });

  it('is frozen, so no module can mutate a shared default at runtime', () => {
    expect(Object.isFrozen(PARAMETER_DEFAULTS)).toBe(true);
  });
});
