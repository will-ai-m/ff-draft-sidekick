import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SCORING_DEFAULTS } from '@sidekick/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { nflverseHandlers } from '../../test/msw/nflverseHandlers';
import { snapshotHandlers } from '../../test/msw/snapshotHandlers';
import { buildGameLogCache, writeGameLogCache } from './prep';
import { GameLogStore } from './store';

const server = setupServer(...nflverseHandlers(), ...snapshotHandlers());
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const GIBBS = '9221';
const BOWERS = '11604';
/** Squirrel White: a real crosswalk row with no gsis_id, so he can never have cached games. */
const ROOKIE = '13943';

let cacheDir: string;
let store: GameLogStore;

beforeAll(async () => {
  cacheDir = mkdtempSync(join(tmpdir(), 'sidekick-gamelog-store-'));
  const { cache } = await buildGameLogCache({
    seasonsToCache: 2,
    crosswalkCacheDir: cacheDir,
    crosswalkMaxAgeHours: 24,
    now: () => new Date('2026-08-22T12:00:00Z'),
  });
  writeGameLogCache(cache, cacheDir);
  store = GameLogStore.fromCacheDir(cacheDir);
});

afterAll(() => rmSync(cacheDir, { recursive: true, force: true }));

const half = SCORING_DEFAULTS.half_ppr;

describe('GameLogStore', () => {
  it('loads the prep script\'s cache once at startup', () => {
    expect(store.isLoaded).toBe(true);
    expect(store.seasons).toEqual([2025, 2024]);
  });

  it('returns the most recent season first, with prior seasons as further tabs (AC-63)', () => {
    const card = store.getPlayerCard(GIBBS, { scoring: half });

    expect(card).toMatchObject({ playerId: GIBBS, playerName: 'Jahmyr Gibbs', position: 'RB', hasData: true });
    expect(card.seasons.map((s) => s.season)).toEqual([2025, 2024]);
    expect(card.seasons[0]?.games.map((g) => g.week)).toEqual([1, 2, 3]);
  });

  it('returns the per-game stat line AC-62 asks for', () => {
    const card = store.getPlayerCard(GIBBS, { scoring: half });
    const week2 = card.seasons[0]?.games[1];

    expect(week2).toEqual({
      week: 2,
      opponent: 'CHI',
      fantasyPoints: 17.9,
      rushing: { att: 12, yds: 94, avg: 7.83, td: 1 },
      receiving: { tgt: 3, rec: 3, yds: 10, td: 0, long: 8, ydsPerTgt: 3.33 },
      fumbles: 0,
    });
  });

  it("computes fantasy points from the league's own settings, not a generic format (AC-64)", () => {
    const teFriendly = { rec: 1, rec_yd: 0.1, rec_td: 6, rec_2pt: 2, bonus_rec_te: 0.5 };

    const standard = store.getPlayerCard(BOWERS, { scoring: SCORING_DEFAULTS.standard });
    const custom = store.getPlayerCard(BOWERS, { scoring: teFriendly });

    // Week 3: 4 receptions for 38 yards plus a two-point catch.
    expect(standard.seasons[0]?.games[2]?.fantasyPoints).toBe(5.8);
    expect(custom.seasons[0]?.games[2]?.fantasyPoints).toBe(11.8);
  });

  it('states that a player has no NFL game data instead of showing an empty table (AC-65)', () => {
    const card = store.getPlayerCard(ROOKIE, {
      scoring: half,
      player: { name: 'Squirrel White', position: 'WR', team: 'CHI' },
    });

    expect(card).toMatchObject({
      playerId: ROOKIE,
      playerName: 'Squirrel White',
      position: 'WR',
      hasData: false,
    });
    expect(card.seasons).toEqual([]);
  });

  it('falls back to an unnamed card when the caller supplies no player details either', () => {
    const card = store.getPlayerCard('999999', { scoring: half });

    expect(card).toMatchObject({ playerId: '999999', hasData: false, playerName: '' });
  });
});

describe('GameLogStore without a built cache', () => {
  it('reports the cache is missing and answers every lookup with the no-data state', () => {
    const empty = mkdtempSync(join(tmpdir(), 'sidekick-gamelog-empty-'));
    try {
      const missing = GameLogStore.fromCacheDir(empty);

      expect(missing.isLoaded).toBe(false);
      expect(missing.seasons).toEqual([]);
      expect(missing.getPlayerCard(GIBBS, { scoring: half }).hasData).toBe(false);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
