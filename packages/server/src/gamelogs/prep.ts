/**
 * FR-11's offline data prep — the build half of the game-log subsystem.
 *
 * This module is **not on the live server's code path**. `scripts/prep-nflverse-data.ts` calls
 * it manually before draft season (PRD §11); the running server only reads the small JSON cache
 * it writes (`gamelogs/store.ts`). The separation is deliberate: play-by-play is ~98 MB per
 * season expanded, and nothing that size belongs near the draft-night latency budget.
 *
 * The join is design.md §T9's: nflverse keys players by gsis id, the app keys everything by
 * Sleeper's player id, and dynastyprocess's crosswalk carries both — so this imports T3's
 * `snapshots/crosswalk.ts` loader rather than downloading `db_playerids.csv` a second time.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { loadCrosswalk } from '../snapshots/crosswalk';
import type { Crosswalk } from '../snapshots/types';
import {
  createWeeklyStatCounters,
  deriveReceivingLongs,
  fetchPlayByPlay,
  fetchWeeklyStats,
  parseWeeklyStats,
  receivingLongKey,
  toCachedGame,
} from './nflverse';
// The dependency runs offline-builder -> runtime-reader, never the reverse: the reader defines
// where the cache lives and what version it accepts, and this script writes to that contract.
import { DEFAULT_GAMELOG_CACHE_DIR, GAMELOG_CACHE_FILENAME } from './store';
import { GAMELOG_CACHE_VERSION } from './types';
import type { CachedPlayer, GameLogCache, PrepStats } from './types';

export interface BuildGameLogCacheOptions {
  /** How many seasons of data to keep — `gamelogSeasonsToCache` from the config module. */
  seasonsToCache: number;
  /** An already-loaded crosswalk. Omit and it is loaded (or downloaded) through T3's loader. */
  crosswalk?: Crosswalk;
  crosswalkCacheDir?: string;
  crosswalkMaxAgeHours?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  /** Progress lines for the CLI. Silent when omitted. */
  onProgress?: (message: string) => void;
}

/**
 * How many seasons past the requested count to probe before giving up. The current calendar
 * year always fails between the new year and the season's first games (live-verified: on
 * 2026-08-22 the 2026 weekly file 404s), so probing must survive at least one leading miss.
 */
const EXTRA_SEASON_PROBES = 3;

/** Stop after this many misses in a row, once at least one season has been found. */
const MISS_STREAK_LIMIT = 2;

const emptyStats = (): PrepStats => ({
  seasonsProbed: [],
  seasonsWithoutData: [],
  seasonsWithoutPlayByPlay: [],
  statRows: 0,
  gamesCached: 0,
  playersCached: 0,
  rowsWithoutCrosswalkRow: 0,
  rowsWithoutSleeperId: 0,
  postseasonRowsSkipped: 0,
  unsupportedPositionRows: 0,
  longsDerived: 0,
});

/**
 * Downloads the most recent seasons that exist, derives AC-62's stat lines (including the
 * play-by-play-only "long"), joins them to Sleeper ids and returns the cache.
 *
 * Seasons are walked newest-first from the current calendar year, so a player's meta (name,
 * position, team) comes from their most recent appearance rather than a three-year-old row.
 */
export async function buildGameLogCache(
  options: BuildGameLogCacheOptions,
): Promise<{ cache: GameLogCache; stats: PrepStats }> {
  const now = options.now?.() ?? new Date();
  const progress = options.onProgress ?? ((): void => {});
  const stats = emptyStats();

  const crosswalk =
    options.crosswalk ??
    (await loadCrosswalk({
      cacheDir: options.crosswalkCacheDir,
      maxAgeHours: options.crosswalkMaxAgeHours ?? 24,
      fetchImpl: options.fetchImpl,
      now: options.now,
    }));
  progress(`crosswalk: ${crosswalk.rows.length} rows${crosswalk.fromStaleCache ? ' (stale cache)' : ''}`);

  const players: Record<string, CachedPlayer> = {};
  const seasons: number[] = [];
  const startYear = now.getFullYear();
  const maxProbes = options.seasonsToCache + EXTRA_SEASON_PROBES;
  let missStreak = 0;

  for (let offset = 0; offset < maxProbes && seasons.length < options.seasonsToCache; offset += 1) {
    const season = startYear - offset;
    stats.seasonsProbed.push(season);

    const statsCsv = await fetchWeeklyStats(season, { fetchImpl: options.fetchImpl });
    if (statsCsv === null) {
      stats.seasonsWithoutData.push(season);
      progress(`${season}: no weekly stats published`);
      if (seasons.length > 0 && (missStreak += 1) >= MISS_STREAK_LIMIT) break;
      continue;
    }
    missStreak = 0;

    const counters = createWeeklyStatCounters();
    const rows = parseWeeklyStats(statsCsv, counters);
    stats.statRows += rows.length;
    stats.postseasonRowsSkipped += counters.postseasonRowsSkipped;
    stats.unsupportedPositionRows += counters.unsupportedPositionRows;

    // The play-by-play pass exists solely to produce AC-62's receiving "long"; the raw rows are
    // discarded with this local when the loop iterates.
    const pbpCsv = await fetchPlayByPlay(season, { fetchImpl: options.fetchImpl });
    const longs = pbpCsv === null ? new Map<string, number>() : deriveReceivingLongs(pbpCsv, season);
    if (pbpCsv === null) {
      stats.seasonsWithoutPlayByPlay.push(season);
      progress(`${season}: no play-by-play published — receiving "long" will read 0`);
    }
    stats.longsDerived += longs.size;

    for (const row of rows) {
      const crosswalkRow = crosswalk.byGsisId.get(row.gsisId);
      if (!crosswalkRow) {
        stats.rowsWithoutCrosswalkRow += 1;
        continue;
      }
      if (!crosswalkRow.sleeperId) {
        // ~6k crosswalk rows carry sleeper_id "NA"; there is no key to store such a player under.
        stats.rowsWithoutSleeperId += 1;
        continue;
      }

      const sleeperId = crosswalkRow.sleeperId;
      const player = (players[sleeperId] ??= {
        playerId: sleeperId,
        name: row.name,
        position: row.position,
        team: row.team || null,
        seasons: {},
      });

      const games = (player.seasons[String(season)] ??= []);
      games.push(toCachedGame(row, longs.get(receivingLongKey(row.gsisId, season, row.week)) ?? 0));
      stats.gamesCached += 1;
    }

    seasons.push(season);
    progress(`${season}: ${rows.length} regular-season rows`);
  }

  for (const player of Object.values(players)) {
    for (const games of Object.values(player.seasons)) games.sort((a, b) => a.week - b.week);
  }
  stats.playersCached = Object.keys(players).length;

  return {
    cache: {
      version: GAMELOG_CACHE_VERSION,
      builtAt: now.toISOString(),
      seasons,
      players,
    },
    stats,
  };
}

/** Writes the cache the runtime reader loads. Returns the path written. */
export function writeGameLogCache(cache: GameLogCache, cacheDir?: string): string {
  const directory = cacheDir ?? DEFAULT_GAMELOG_CACHE_DIR;
  mkdirSync(directory, { recursive: true });
  const path = resolve(directory, GAMELOG_CACHE_FILENAME);
  writeFileSync(path, JSON.stringify(cache), 'utf8');
  return path;
}
