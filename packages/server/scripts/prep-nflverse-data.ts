/**
 * Offline nflverse data prep — `npm run prep:nflverse`.
 *
 * Run this MANUALLY before each draft season (PRD §11). It is deliberately NOT part of the
 * live server's code path: the nflverse play-by-play files are ~98MB uncompressed per season,
 * and nothing that large belongs anywhere near the draft-night latency budget. The running
 * server only ever reads the small derived cache this script writes.
 *
 * What it does:
 *   1. downloads `stats_player_week_<season>.csv` for the most recent `gamelogSeasonsToCache`
 *      seasons that nflverse has actually published (the current calendar year 404s until the
 *      season starts, which is expected, not an error),
 *   2. downloads `play_by_play_<season>.csv.gz` for those seasons, derives the per-game longest
 *      reception from it, then discards the raw play-by-play without persisting any of it,
 *   3. joins both to Sleeper player ids through the dynastyprocess player-id crosswalk,
 *   4. writes `data/cache/gamelogs.json` (gitignored).
 *
 * Fantasy points are NOT computed here: AC-64 requires them to come from the attached league's
 * own scoring settings, which are unknown at prep time. The server scores each game per request.
 */

import { loadConfig } from '../src/config/loadConfig';
import { buildGameLogCache, writeGameLogCache } from '../src/gamelogs/prep';

async function main(): Promise<void> {
  const config = loadConfig();
  const startedAt = Date.now();

  console.log(
    `[prep:nflverse] building a game-log cache for the ${config.gamelogSeasonsToCache} most recent season(s)…`,
  );

  const { cache, stats } = await buildGameLogCache({
    seasonsToCache: config.gamelogSeasonsToCache,
    crosswalkMaxAgeHours: config.snapshotStalenessWarningHours,
    onProgress: (message) => console.log(`[prep:nflverse] ${message}`),
  });

  if (cache.seasons.length === 0) {
    throw new Error(
      `No seasons could be downloaded (probed ${stats.seasonsProbed.join(', ')}). ` +
        'Check network access to github.com and try again.',
    );
  }

  const path = writeGameLogCache(cache);
  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1);

  console.log(
    `[prep:nflverse] wrote ${path} — seasons ${cache.seasons.join(', ')}, ` +
      `${stats.playersCached} players, ${stats.gamesCached} games, in ${elapsedSeconds}s.`,
  );
  console.log(
    `[prep:nflverse] unjoined stat rows: ${stats.rowsWithoutCrosswalkRow} with no crosswalk row, ` +
      `${stats.rowsWithoutSleeperId} with no Sleeper id.`,
  );
  if (stats.seasonsWithoutPlayByPlay.length > 0) {
    console.log(
      `[prep:nflverse] no play-by-play for ${stats.seasonsWithoutPlayByPlay.join(', ')} — ` +
        'the receiving "long" column reads 0 for those seasons.',
    );
  }
}

main().catch((error: unknown) => {
  console.error('[prep:nflverse] failed:', error);
  process.exitCode = 1;
});
