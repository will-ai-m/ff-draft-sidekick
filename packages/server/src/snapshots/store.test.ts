import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  createRequestCounts,
  sleeperPlayersFixture,
  snapshotHandlers,
} from '../../test/msw/snapshotHandlers';
import { SnapshotStore } from './store';
import type { SleeperPlayerRecord } from './types';

const server = setupServer(...snapshotHandlers());
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let cacheDir: string;
beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'sidekick-store-'));
});
afterEach(() => rmSync(cacheDir, { recursive: true, force: true }));

const input = (rankingsFormat: 'half_ppr' | 'ppr' = 'half_ppr') => ({
  rankingsFormat,
  leagueTeamCount: 10,
  season: 2026,
  sleeperPlayers: sleeperPlayersFixture() as unknown as Record<string, SleeperPlayerRecord>,
  cacheDir,
});

describe('SnapshotStore — immutability for the attached draft (AC-29)', () => {
  it('fetches both snapshots exactly once and returns the same frozen bundle thereafter', async () => {
    const counts = createRequestCounts();
    server.use(...snapshotHandlers({ counts }));
    const store = new SnapshotStore();

    const first = await store.load(input());
    const second = await store.load(input());

    expect(counts.ecr).toBe(1);
    expect(counts.adp).toBe(1);
    expect(second).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(store.get()).toBe(first);
  });

  it('serves concurrent load calls from one in-flight fetch', async () => {
    const counts = createRequestCounts();
    server.use(...snapshotHandlers({ counts }));
    const store = new SnapshotStore();

    const [a, b] = await Promise.all([store.load(input()), store.load(input())]);

    expect(counts.ecr).toBe(1);
    expect(a).toBe(b);
  });

  it('re-fetches only after reset, which is what a new attach does', async () => {
    const counts = createRequestCounts();
    server.use(...snapshotHandlers({ counts }));
    const store = new SnapshotStore();

    await store.load(input());
    store.reset();
    expect(store.get()).toBeNull();

    await store.load(input());
    expect(counts.ecr).toBe(2);
    expect(counts.adp).toBe(2);
  });
});

describe('SnapshotStore — positional tiers (amended 2026-09-01)', () => {
  it('joins each player\u2019s tier from their position\u2019s own page, never the overall board', async () => {
    const counts = createRequestCounts();
    server.use(...snapshotHandlers({ counts }));
    const store = new SnapshotStore();

    const bundle = await store.load(input());
    const byName = new Map(bundle.matching.players.map((p) => [p.playerName, p]));

    // Josh Allen: overall-board tier 3 in the fixture, positional QB Tier 1 — the join must
    // surface the positional number.
    expect(byName.get('Josh Allen')?.tier).toBe(1);
    expect(byName.get('Chig Okonkwo')?.tier).toBe(3);
    // K/DST pages are never fetched for the engine (\ud83d\udd36 AS-7): their tier is null.
    expect(byName.get('Houston Texans')?.tier).toBeNull();
    expect(byName.get('Brandon Aubrey')?.tier).toBeNull();
    expect(bundle.positionalTierErrors).toEqual({});
    expect(counts.positionalTiers).toBe(4);
  });

  it('degrades a failed tier page to null tiers for that position, and records why', async () => {
    server.use(...snapshotHandlers({ positionalTierStatus: 502 }));
    const store = new SnapshotStore();

    const bundle = await store.load(input());

    expect(bundle.matching.players.length).toBeGreaterThan(0);
    expect(bundle.matching.players.every((p) => p.tier === null)).toBe(true);
    expect(Object.keys(bundle.positionalTierErrors).sort()).toEqual(['QB', 'RB', 'TE', 'WR']);
    expect(bundle.positionalTierErrors.QB).toMatch(/502/);
  });
});

describe('SnapshotStore — rankings format (2026-09-02)', () => {
  it('fetches every source in the requested format, and the bundle says which', async () => {
    const store = new SnapshotStore();
    const bundle = await store.load(input('ppr'));

    expect(bundle.rankingsFormat).toBe('ppr');
    expect(bundle.ecr?.source).toContain('/ppr-cheatsheets.php');
    expect(bundle.ecr?.scoring).toBe('PPR');
    expect(bundle.adp?.source).toContain('/adp/ppr?');
    expect(bundle.adp?.scoring).toBe('PPR');
    expect(bundle.adp?.poolDescription).toContain('Full PPR');
  });

  it('joins the PPR positional tiers, not the half-PPR ones, in ppr format', async () => {
    const half = await new SnapshotStore().load(input('half_ppr'));
    const ppr = await new SnapshotStore().load(input('ppr'));
    // The PPR tier fixture shifts every RB/WR/TE tier up by one; QB is shared and unchanged.
    const gibbsHalf = half.matching.players.find((p) => p.playerName === 'Jahmyr Gibbs');
    const gibbsPpr = ppr.matching.players.find((p) => p.playerName === 'Jahmyr Gibbs');
    expect(gibbsHalf?.tier).toBe(1);
    expect(gibbsPpr?.tier).toBe(2);
    const allenHalf = half.matching.players.find((p) => p.playerName === 'Josh Allen');
    const allenPpr = ppr.matching.players.find((p) => p.playerName === 'Josh Allen');
    expect(allenPpr?.tier).toBe(allenHalf?.tier);
  });

  it('carries the format on a degraded bundle too, so the check still knows what was asked', async () => {
    server.use(...snapshotHandlers({ ecrStatus: 503 }));
    const bundle = await new SnapshotStore().load(input('ppr'));
    expect(bundle.ecr).toBeNull();
    expect(bundle.rankingsFormat).toBe('ppr');
  });
});

describe('SnapshotStore — degraded loads (AC-28)', () => {
  it('still returns a bundle when the ECR fetch fails, recording the error', async () => {
    server.use(...snapshotHandlers({ ecrStatus: 503 }));
    const store = new SnapshotStore();

    const bundle = await store.load(input());

    expect(bundle.ecr).toBeNull();
    expect(bundle.ecrError).toMatch(/503/);
    expect(bundle.matching.players).toHaveLength(0);
    // Board sync, rosters and the pick feed do not depend on this bundle at all.
    expect(bundle.crosswalk.rows.length).toBeGreaterThan(0);
  });

  it('still returns a bundle when the ADP fetch fails, leaving every player ADP-less', async () => {
    server.use(...snapshotHandlers({ adpStatus: 500 }));
    const store = new SnapshotStore();

    const bundle = await store.load(input());

    expect(bundle.adp).toBeNull();
    expect(bundle.adpError).toMatch(/500/);
    expect(bundle.matching.players.length).toBeGreaterThan(0);
    expect(bundle.matching.players.every((p) => p.adpMissing)).toBe(true);
  });

  it('propagates a crosswalk failure, since matching cannot proceed without it', async () => {
    server.use(...snapshotHandlers({ crosswalkStatus: 500 }));
    const store = new SnapshotStore();

    await expect(store.load(input())).rejects.toThrow(/crosswalk/i);
    // A failed load must not leave a half-built bundle behind for the next caller.
    expect(store.get()).toBeNull();
  });
});
