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
import { GAMELOG_CACHE_VERSION } from './types';
import type { CachedGame, GameLogCache } from './types';

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
  it("loads the prep script's cache once at startup", () => {
    expect(store.isLoaded).toBe(true);
    expect(store.seasons).toEqual([2025, 2024]);
  });

  it('returns the most recent season first, with prior seasons as further tabs (AC-63)', () => {
    const card = store.getPlayerCard(GIBBS, { scoring: half });

    expect(card).toMatchObject({
      playerId: GIBBS,
      playerName: 'Jahmyr Gibbs',
      position: 'RB',
      hasData: true,
    });
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

  it('carries the league scoring keys no game log can answer onto the card itself', () => {
    // AC-64's other half: the card says which of the league's rules it could not apply, so the
    // gap the scorer already tracks is visible to the reader instead of only to the scorer.
    const withDefense = { ...half, def_st_td: 6, fgm_40_49: 4 };

    expect(store.getPlayerCard(GIBBS, { scoring: withDefense }).unsupportedScoringKeys).toEqual([
      'def_st_td',
      'fgm_40_49',
    ]);
    expect(store.getPlayerCard(GIBBS, { scoring: half }).unsupportedScoringKeys).toEqual([]);
    // Including on a card that has no games to score at all.
    expect(store.getPlayerCard(ROOKIE, { scoring: withDefense }).unsupportedScoringKeys).toEqual([
      'def_st_td',
      'fgm_40_49',
    ]);
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

// ---------------------------------------------------------------------------------------------
// FR-10's positional value curves (amended 2026-08-31) — hand-built cache, exact arithmetic.
// ---------------------------------------------------------------------------------------------

describe('positionalPointCurves (FR-10 value model input)', () => {
  const rushGame = (yds: number, fumblesLost = 0): CachedGame => ({
    week: 1,
    opponent: 'DET',
    rushing: { att: 20, yds, avg: yds / 20, td: 0 },
    fumbles: fumblesLost,
    fumblesLost,
    twoPointConversions: { passing: 0, rushing: 0, receiving: 0 },
  });

  /** 0.1/rush yd, −2/fumble lost: every season total below is trivial arithmetic. */
  const scoring = { rush_yd: 0.1, fum_lost: -2 };

  const cache: GameLogCache = {
    version: GAMELOG_CACHE_VERSION,
    builtAt: '2026-08-31T00:00:00Z',
    seasons: [2025, 2024],
    players: {
      rbA: { playerId: 'rbA', name: 'A', position: 'RB', team: null, seasons: { 2025: [rushGame(1700)], 2024: [rushGame(170)] } },
      rbB: { playerId: 'rbB', name: 'B', position: 'RB', team: null, seasons: { 2025: [rushGame(850)], 2024: [rushGame(85)] } },
      rbC: { playerId: 'rbC', name: 'C', position: 'RB', team: null, seasons: { 2025: [rushGame(600)] } },
      rbD: { playerId: 'rbD', name: 'D', position: 'RB', team: null, seasons: { 2025: [rushGame(0, 5)] } },
      wrA: { playerId: 'wrA', name: 'W', position: 'WR', team: null, seasons: { 2025: [rushGame(3400)] } },
    },
  };
  const curveStore = GameLogStore.fromCache(cache);

  it('ranks each season’s league-scored totals and averages rank-for-rank across seasons', () => {
    const curves = curveStore.positionalPointCurves(scoring)!;
    // 2025 RB totals desc: [170, 85, 60, −10] pts; 2024: [17, 8.5].
    // Rank 1 = mean(170, 17)/17 = 5.5 pts/gm; rank 2 = mean(85, 8.5)/17 = 2.75.
    expect(curves.RB[0]).toBeCloseTo(5.5, 10);
    expect(curves.RB[1]).toBeCloseTo(2.75, 10);
  });

  it('clamps the curve monotone non-increasing when a thin season would put a bump in it', () => {
    const curves = curveStore.positionalPointCurves(scoring)!;
    // Rank 3 exists only in 2025 (60/17 ≈ 3.53 pts/gm) — above rank 2's cross-season 2.75, so
    // it clamps down rather than pricing RB3 above RB2.
    expect(curves.RB[2]).toBeCloseTo(2.75, 10);
  });

  it('floors a negative-total tail entry at zero', () => {
    const curves = curveStore.positionalPointCurves(scoring)!;
    expect(curves.RB[3]).toBe(0);
  });

  it('keeps every position’s curve to its own players', () => {
    const curves = curveStore.positionalPointCurves(scoring)!;
    expect(curves.RB).toHaveLength(4);
    expect(curves.WR).toEqual([20]); // 3400 · 0.1 / 17
    expect(curves.QB).toEqual([]);
    expect(curves.TE).toEqual([]);
  });

  it('returns null with no cache, so the caller degrades visibly instead of pricing plans', () => {
    expect(GameLogStore.fromCache(null, 'missing').positionalPointCurves(scoring)).toBeNull();
  });
});
