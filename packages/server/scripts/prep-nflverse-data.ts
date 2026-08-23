/**
 * Offline nflverse data prep — `npm run prep:nflverse`.
 *
 * Run this MANUALLY before each draft season (PRD §11). It is deliberately NOT part of the
 * live server's code path: the nflverse play-by-play files are ~98MB uncompressed per season,
 * and nothing that large belongs anywhere near the draft-night latency budget. The running
 * server only ever reads the small derived cache this script writes.
 *
 * When implemented (game-log task) it will:
 *   1. download `player_stats.csv` from the nflverse-data release and keep the most recent
 *      `gamelogSeasonsToCache` seasons,
 *   2. download `play_by_play_<season>.csv.gz` for those seasons, derive the per-game "long"
 *      reception/rush values, then discard the raw play-by-play rows without persisting them,
 *   3. join both to Sleeper player ids through the dynastyprocess player-id crosswalk,
 *   4. write `data/cache/gamelogs.json` (gitignored).
 *
 * Today it is a runnable no-op so the scaffold's script surface is complete and callable.
 */

import { loadConfig } from '../src/config/loadConfig';

async function main(): Promise<void> {
  const config = loadConfig();

  console.log('[prep:nflverse] nothing to do yet — the data prep step is not implemented.');
  console.log(
    `[prep:nflverse] when implemented it will cache the most recent ${config.gamelogSeasonsToCache} season(s) into data/cache/gamelogs.json.`,
  );
}

main().catch((error: unknown) => {
  console.error('[prep:nflverse] failed:', error);
  process.exitCode = 1;
});
