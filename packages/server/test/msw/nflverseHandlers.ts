/**
 * msw handlers for FR-11's two nflverse sources, plus loaders for the trimmed real-data
 * fixtures the T9 suites share.
 *
 * Kept separate from `sleeperHandlers.ts` (T2) and `snapshotHandlers.ts` (T3) so each task
 * owns disjoint files; a later task can compose the three arrays into one `setupServer(...)`.
 *
 * The play-by-play fixture is served as real gzip bytes — exactly the shape the live release
 * asset has — so the decompression path is exercised rather than stubbed out.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { http, HttpResponse } from 'msw';

import {
  PLAY_BY_PLAY_RELEASE_BASE_URL,
  WEEKLY_STATS_RELEASE_BASE_URL,
  playByPlayFilename,
  weeklyStatsFilename,
} from '../../src/gamelogs/nflverse';

const FIXTURES = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures');

/** Seasons the fixtures cover. 2026 is deliberately absent: the season has not started. */
export const FIXTURE_SEASONS: readonly number[] = [2025, 2024];

/** A verbatim slice of `stats_player_week_<season>.csv` (real header, real rows). */
export const weeklyStatsFixture = (season: number): string =>
  readFileSync(resolve(FIXTURES, `player_stats-${season}-slice.csv`), 'utf8');

/** A verbatim gzipped slice of `play_by_play_<season>.csv.gz`. */
export const playByPlayFixtureGz = (season: number): Buffer =>
  readFileSync(resolve(FIXTURES, `pbp-${season}-slice.csv.gz`));

export interface NflverseRequestCounts {
  weekly: number;
  pbp: number;
}

export const createNflverseCounts = (): NflverseRequestCounts => ({ weekly: 0, pbp: 0 });

export interface NflverseHandlerOptions {
  counts?: NflverseRequestCounts;
  /** Seasons that answer 200. Anything else 404s, like a season nflverse has not published. */
  seasons?: readonly number[];
  /** Seasons whose weekly stats exist but whose play-by-play does not. */
  seasonsWithoutPbp?: readonly number[];
  /** Force a non-404 failure status on the weekly-stats endpoint. */
  weeklyStatus?: number;
}

const seasonOf = (filename: string): number | null => {
  const match = /_(\d{4})\.csv(?:\.gz)?$/.exec(filename);
  return match?.[1] ? Number(match[1]) : null;
};

const toArrayBuffer = (buffer: Buffer): ArrayBuffer =>
  buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;

export const nflverseHandlers = (options: NflverseHandlerOptions = {}) => {
  const counts = options.counts ?? createNflverseCounts();
  const seasons = options.seasons ?? FIXTURE_SEASONS;
  const withoutPbp = options.seasonsWithoutPbp ?? [];

  return [
    http.get(`${WEEKLY_STATS_RELEASE_BASE_URL}/:file`, ({ params }) => {
      counts.weekly += 1;
      const season = seasonOf(String(params.file));
      if (options.weeklyStatus && options.weeklyStatus !== 200) {
        return new HttpResponse(null, { status: options.weeklyStatus });
      }
      if (season === null || !seasons.includes(season)) {
        return new HttpResponse('Not Found', { status: 404 });
      }
      if (String(params.file) !== weeklyStatsFilename(season)) {
        return new HttpResponse('Not Found', { status: 404 });
      }
      return HttpResponse.text(weeklyStatsFixture(season));
    }),

    http.get(`${PLAY_BY_PLAY_RELEASE_BASE_URL}/:file`, ({ params }) => {
      counts.pbp += 1;
      const season = seasonOf(String(params.file));
      if (
        season === null ||
        !seasons.includes(season) ||
        withoutPbp.includes(season) ||
        String(params.file) !== playByPlayFilename(season)
      ) {
        return new HttpResponse('Not Found', { status: 404 });
      }
      return HttpResponse.arrayBuffer(toArrayBuffer(playByPlayFixtureGz(season)), {
        headers: { 'content-type': 'application/octet-stream' },
      });
    }),
  ];
};
