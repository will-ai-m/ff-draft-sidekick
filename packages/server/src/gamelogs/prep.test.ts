import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createNflverseCounts, nflverseHandlers } from '../../test/msw/nflverseHandlers';
import { snapshotHandlers } from '../../test/msw/snapshotHandlers';
import { parseCrosswalkCsv } from '../snapshots/crosswalk';
import { buildGameLogCache, writeGameLogCache } from './prep';
import { GAMELOG_CACHE_FILENAME } from './store';

const server = setupServer(...nflverseHandlers(), ...snapshotHandlers());
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

let cacheDir: string;
beforeEach(() => {
  cacheDir = mkdtempSync(join(tmpdir(), 'sidekick-gamelogs-'));
});
afterEach(() => rmSync(cacheDir, { recursive: true, force: true }));

/** The date this task was implemented: the 2026 season has not started, so 2026 assets 404. */
const now = () => new Date('2026-08-22T12:00:00Z');

const build = (overrides: Partial<Parameters<typeof buildGameLogCache>[0]> = {}) =>
  buildGameLogCache({
    seasonsToCache: 2,
    crosswalkCacheDir: cacheDir,
    crosswalkMaxAgeHours: 24,
    now,
    ...overrides,
  });

// Sleeper ids, taken from the crosswalk fixture's real rows.
const ALLEN = '4984';
const GIBBS = '9221';
const CHASE = '7564';
const BOWERS = '11604';

describe('buildGameLogCache', () => {
  it('discovers the most recent seasons that actually have data', async () => {
    const counts = createNflverseCounts();
    server.use(...nflverseHandlers({ counts }));

    const { cache, stats } = await build();

    // 2026 is probed first and 404s — the season has not started.
    expect(cache.seasons).toEqual([2025, 2024]);
    expect(stats.seasonsProbed).toEqual([2026, 2025, 2024]);
    expect(counts.weekly).toBe(3);
  });

  it('caches only the seasons that exist when fewer are published than requested', async () => {
    const { cache, stats } = await build({ seasonsToCache: 3 });

    expect(cache.seasons).toEqual([2025, 2024]);
    expect(stats.seasonsWithoutData).toContain(2023);
  });

  it('keys every player by their Sleeper id, joined through the crosswalk gsis_id', async () => {
    const { cache, stats } = await build();

    expect(Object.keys(cache.players).sort()).toEqual([ALLEN, BOWERS, CHASE, GIBBS].sort());
    expect(cache.players[GIBBS]).toMatchObject({ name: 'Jahmyr Gibbs', position: 'RB', team: 'DET' });

    // Travis Etienne is in the stats fixture but not in the crosswalk slice: dropped, and counted.
    expect(Object.values(cache.players).some((p) => p.name.includes('Etienne'))).toBe(false);
    expect(stats.rowsWithoutCrosswalkRow).toBeGreaterThan(0);
    expect(stats.rowsWithoutSleeperId).toBe(0);
  });

  it('drops a player whose crosswalk row carries no Sleeper id, rather than guessing one', async () => {
    // ~6k of the crosswalk's real rows have sleeper_id "NA"; such a player has no key to store
    // them under, since Sleeper's own player id is the app's canonical id everywhere.
    const crosswalk = parseCrosswalkCsv(
      [
        'fantasypros_id,gsis_id,sleeper_id,name,merge_name,position,team',
        '22968,00-0039139,NA,Jahmyr Gibbs,jahmyr gibbs,RB,DET',
        '17298,00-0034857,4984,Josh Allen,josh allen,QB,BUF',
      ].join('\n'),
    );

    const { cache, stats } = await build({ crosswalk });

    expect(Object.keys(cache.players)).toEqual([ALLEN]);
    expect(stats.rowsWithoutSleeperId).toBeGreaterThan(0);
  });

  it("writes AC-62's exact stat line, with the long derived from play-by-play", async () => {
    const { cache } = await build();

    const gibbs2025 = cache.players[GIBBS]?.seasons['2025'];
    expect(gibbs2025?.map((g) => g.week)).toEqual([1, 2, 3]);
    expect(gibbs2025?.[1]).toEqual({
      week: 2,
      opponent: 'CHI',
      rushing: { att: 12, yds: 94, avg: 7.83, td: 1 },
      receiving: { tgt: 3, rec: 3, yds: 10, td: 0, long: 8, ydsPerTgt: 3.33 },
      fumbles: 0,
      fumblesLost: 0,
      twoPointConversions: { passing: 0, rushing: 0, receiving: 0 },
    });

    // A QB gets passing + rushing and no receiving line at all.
    expect(cache.players[ALLEN]?.seasons['2025']?.[0]).toMatchObject({
      week: 1,
      opponent: 'BAL',
      passing: { att: 46, comp: 33, yds: 394, td: 2, int: 0 },
      rushing: { att: 14, yds: 30, avg: 2.14, td: 2 },
    });
    expect(cache.players[ALLEN]?.seasons['2025']?.[0]?.receiving).toBeUndefined();

    // Chase's longest 2024 catch was 41 yards, in week 3.
    expect(cache.players[CHASE]?.seasons['2024']?.[2]?.receiving?.long).toBe(41);
  });

  it('never stores a fantasy-point total, because the league supplies the scoring (AC-64)', async () => {
    const { cache } = await build();

    const serialized = JSON.stringify(cache);
    expect(serialized).not.toContain('fantasyPoints');
    expect(serialized).not.toContain('fantasy_points');
  });

  it('drops postseason games from the log', async () => {
    const { cache, stats } = await build();

    expect(cache.players[ALLEN]?.seasons['2025']?.every((g) => g.week <= 18)).toBe(true);
    expect(stats.postseasonRowsSkipped).toBeGreaterThan(0);
  });

  it('still caches a season whose play-by-play is unavailable, with no long values', async () => {
    server.use(...nflverseHandlers({ seasonsWithoutPbp: [2024] }));

    const { cache, stats } = await build();

    expect(cache.players[CHASE]?.seasons['2024']?.[2]?.receiving?.long).toBe(0);
    // The 2025 longs are unaffected.
    expect(cache.players[CHASE]?.seasons['2025']?.[1]?.receiving?.long).toBe(25);
    expect(stats.seasonsWithoutPlayByPlay).toEqual([2024]);
  });

  it('downloads the play-by-play once per season and keeps none of it', async () => {
    const counts = createNflverseCounts();
    server.use(...nflverseHandlers({ counts }));

    const { cache } = await build();

    expect(counts.pbp).toBe(2);
    // Only the derived per-game long survives; no play rows are carried into the cache.
    expect(JSON.stringify(cache)).not.toContain('play_id');
    expect(JSON.stringify(cache)).not.toContain('TWO-POINT');
  });
});

describe('writeGameLogCache', () => {
  it('writes the gitignored cache file the runtime reader loads', async () => {
    const { cache } = await build();

    const path = writeGameLogCache(cache, cacheDir);

    expect(path).toBe(join(cacheDir, GAMELOG_CACHE_FILENAME));
    const written = JSON.parse(readFileSync(path, 'utf8')) as typeof cache;
    expect(written.seasons).toEqual([2025, 2024]);
    expect(written.players[GIBBS]?.seasons['2025']).toHaveLength(3);
    expect(written.builtAt).toBe(now().toISOString());
  });
});
