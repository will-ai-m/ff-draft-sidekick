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

const input = () => ({
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
