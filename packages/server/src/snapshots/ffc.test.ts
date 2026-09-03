import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createRequestCounts, ffcFixture, snapshotHandlers } from '../../test/msw/snapshotHandlers';
import { buildAdpUrl, fetchAdpSnapshot, parseAdpResponse, selectAdpPool } from './ffc';

const server = setupServer(...snapshotHandlers());
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const POOLS = PARAMETER_DEFAULTS.adpPoolTeamSizes;

describe('selectAdpPool (AC-24)', () => {
  it('uses the exact pool when the league team count is supported', () => {
    expect(selectAdpPool(12, POOLS)).toEqual({ teamCount: 12, exact: true });
  });

  it('falls back to the nearest supported pool otherwise', () => {
    expect(selectAdpPool(11, POOLS)).toMatchObject({ exact: false });
    expect(selectAdpPool(15, POOLS).teamCount).toBe(14);
    expect(selectAdpPool(20, POOLS).teamCount).toBe(14);
    expect(selectAdpPool(4, POOLS).teamCount).toBe(8);
  });

  it('breaks an exact tie toward the larger pool', () => {
    // 9, 11 and 13 each sit exactly between two published pools.
    expect(selectAdpPool(9, POOLS).teamCount).toBe(10);
    expect(selectAdpPool(11, POOLS).teamCount).toBe(12);
    expect(selectAdpPool(13, POOLS).teamCount).toBe(14);
  });

  it('reads the supported pools from config rather than a hardcoded list', () => {
    expect(selectAdpPool(11, [10, 16]).teamCount).toBe(10);
    expect(selectAdpPool(13, [10, 16]).teamCount).toBe(16);
  });
});

describe('buildAdpUrl', () => {
  it('targets the half-PPR endpoint for the chosen pool and season', () => {
    const url = new URL(buildAdpUrl('half_ppr', 12, 2026));
    expect(url.pathname).toContain('half-ppr');
    expect(url.searchParams.get('teams')).toBe('12');
    expect(url.searchParams.get('year')).toBe('2026');
  });

  it('targets the PPR pool for the ppr format (2026-09-02)', () => {
    const url = new URL(buildAdpUrl('ppr', 10, 2026));
    expect(url.pathname.endsWith('/adp/ppr')).toBe(true);
    expect(url.pathname).not.toContain('half');
  });
});

describe('parseAdpResponse', () => {
  const ctx = {
    source: 'x',
    format: 'half_ppr' as const,
    teamCountRequested: 10,
    teamCountUsed: 10,
    exactPool: true,
  };

  it('normalizes FFC positions onto Sidekick positions (PK -> K, DEF -> DST)', () => {
    const snapshot = parseAdpResponse(ffcFixture(), ctx);
    const byName = new Map(snapshot.entries.map((e) => [e.playerName, e]));
    expect(byName.get('Brandon Aubrey')?.position).toBe('K');
    expect(byName.get('Houston Defense')?.position).toBe('DST');
    expect(byName.get('Jahmyr Gibbs')?.position).toBe('RB');
  });

  it('carries the pool parameters the pre-draft check displays (AC-24)', () => {
    const snapshot = parseAdpResponse(ffcFixture(), ctx);
    expect(snapshot.scoring).toBe('Half-PPR');
    expect(snapshot.poolDescription).toContain('Half PPR');
    expect(snapshot.rounds).toBe(15);
    expect(snapshot.totalDrafts).toBeGreaterThan(0);
    expect(snapshot.capturedAt).not.toBeNull();
  });

  it('rejects the error envelope the live API returns for an unsupported team count', () => {
    expect(() => parseAdpResponse({ status: 'Error', errors: ['Invalid teams'] }, ctx)).toThrow(
      /Invalid teams/,
    );
  });

  it('rejects a payload that fails schema validation', () => {
    expect(() => parseAdpResponse({ status: 'Success', players: 'nope' }, ctx)).toThrow(/FFC/i);
  });
});

describe('fetchAdpSnapshot', () => {
  it('fetches the exact pool for a supported team count', async () => {
    const counts = createRequestCounts();
    server.use(...snapshotHandlers({ counts }));

    const snapshot = await fetchAdpSnapshot({
      format: 'half_ppr',
      leagueTeamCount: 10,
      season: 2026,
      pools: POOLS,
    });

    expect(counts.adp).toBe(1);
    expect(snapshot.teamCountUsed).toBe(10);
    expect(snapshot.teamCountRequested).toBe(10);
    expect(snapshot.poolDescription).toContain('10-team');
    expect(snapshot.entries.length).toBe(8);
  });

  it('fetches the PPR pool in ppr format, and says so (2026-09-02)', async () => {
    server.use(...snapshotHandlers());

    const snapshot = await fetchAdpSnapshot({
      format: 'ppr',
      leagueTeamCount: 10,
      season: 2026,
      pools: POOLS,
    });

    expect(snapshot.source).toContain('/adp/ppr?');
    expect(snapshot.scoring).toBe('PPR');
    expect(snapshot.poolDescription).toContain('Full PPR');
  });

  it('names the substituted pool when the league team count has no exact match (AC-24)', async () => {
    const snapshot = await fetchAdpSnapshot({
      format: 'half_ppr',
      leagueTeamCount: 11,
      season: 2026,
      pools: POOLS,
    });

    expect(snapshot.teamCountRequested).toBe(11);
    expect(snapshot.teamCountUsed).toBe(12);
    expect(snapshot.poolDescription).toMatch(/12-team/);
    expect(snapshot.poolDescription).toMatch(/11/);
  });

  it('throws on a non-200 response', async () => {
    server.use(...snapshotHandlers({ adpStatus: 500 }));
    await expect(
      fetchAdpSnapshot({ format: 'half_ppr', leagueTeamCount: 10, season: 2026, pools: POOLS }),
    ).rejects.toThrow(/500/);
  });
});
