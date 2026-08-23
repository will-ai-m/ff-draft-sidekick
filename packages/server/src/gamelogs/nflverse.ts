/**
 * FR-11's nflverse readers — the two source files the offline prep step downloads.
 *
 * **Live-verified 2026-08-22, and design.md §T9's stated source is stale.** design.md names
 * `releases/download/player_stats/player_stats.csv` as "all seasons 1999–present combined".
 * That asset exists, but the whole `player_stats` release was last published 2025-05-07 and
 * **stops at the 2024 season** — a 2026 draft prepped from it would show a two-year-old log as
 * "most recent". nflverse moved weekly player stats to the `stats_player` release, one file per
 * season (`stats_player_week_<season>.csv`, live-verified to carry 2025 and to 404 for 2026,
 * which has not started). Per-season files are also the better fit for AC-63's
 * `gamelogSeasonsToCache` window: three seasons is three small downloads, not one 33 MB file
 * that is 90% discarded.
 *
 * The new schema differs from the legacy one in ways that matter here: `team` (not
 * `recent_team`), `passing_interceptions` (not `interceptions`), and — usefully —
 * `fumbles_total` / `fumbles_lost_total`, which spare us summing three fumble columns.
 *
 * Play-by-play is the only source of AC-62's receiving "long": the weekly file has no
 * longest-play column of any kind. Those files are ~19 MB gzipped / ~98 MB expanded per season,
 * which is exactly why this runs offline (design.md's Approach) and why nothing but the derived
 * per-game long value is kept.
 */
import { gunzipSync } from 'node:zlib';

import type { SkillPosition } from '@sidekick/shared';
import Papa from 'papaparse';

import type { CachedGame } from './types';

const NFLVERSE_RELEASES = 'https://github.com/nflverse/nflverse-data/releases/download';

export const WEEKLY_STATS_RELEASE_BASE_URL = `${NFLVERSE_RELEASES}/stats_player`;
export const PLAY_BY_PLAY_RELEASE_BASE_URL = `${NFLVERSE_RELEASES}/pbp`;

export const weeklyStatsFilename = (season: number): string => `stats_player_week_${season}.csv`;
export const playByPlayFilename = (season: number): string => `play_by_play_${season}.csv.gz`;

export const weeklyStatsUrl = (season: number): string =>
  `${WEEKLY_STATS_RELEASE_BASE_URL}/${weeklyStatsFilename(season)}`;
export const playByPlayUrl = (season: number): string =>
  `${PLAY_BY_PLAY_RELEASE_BASE_URL}/${playByPlayFilename(season)}`;

/**
 * nflverse position codes mapped onto the positions AC-62 defines a stat line for. Fullbacks
 * and halfbacks are RBs, as Sleeper itself lists them. Everything else — kickers, punters,
 * defenders — is dropped: AC-62's column sets are passing/rushing/receiving only, so there is
 * no stat line to show them, and a card of all-zero rows would be worse than AC-65's honest
 * "no NFL game data".
 */
const POSITIONS_WITH_A_STAT_LINE: Readonly<Record<string, SkillPosition>> = Object.freeze({
  QB: 'QB',
  RB: 'RB',
  FB: 'RB',
  HB: 'RB',
  WR: 'WR',
  TE: 'TE',
});

export interface WeeklyStatRow {
  /** nflverse's `player_id` is a gsis id (`00-0039139`) — the crosswalk's join key. */
  gsisId: string;
  name: string;
  position: SkillPosition;
  team: string;
  season: number;
  week: number;
  opponent: string;
  passing: { att: number; comp: number; yds: number; td: number; int: number; twoPt: number };
  rushing: { att: number; yds: number; td: number; twoPt: number };
  receiving: { tgt: number; rec: number; yds: number; td: number; twoPt: number };
  fumbles: number;
  fumblesLost: number;
}

export interface WeeklyStatCounters {
  postseasonRowsSkipped: number;
  unsupportedPositionRows: number;
  malformedRows: number;
}

export const createWeeklyStatCounters = (): WeeklyStatCounters => ({
  postseasonRowsSkipped: 0,
  unsupportedPositionRows: 0,
  malformedRows: 0,
});

const num = (value: string | undefined): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * Parses one season of weekly player stats into typed rows.
 *
 * Regular season only: a fantasy game log is the fantasy season, and postseason weeks (19+)
 * would otherwise appear as extra rows nobody's league scored.
 */
export function parseWeeklyStats(csv: string, counters?: WeeklyStatCounters): WeeklyStatRow[] {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const rows: WeeklyStatRow[] = [];

  for (const raw of parsed.data) {
    const gsisId = raw.player_id?.trim();
    if (!gsisId) {
      if (counters) counters.malformedRows += 1;
      continue;
    }

    if ((raw.season_type ?? 'REG').trim().toUpperCase() !== 'REG') {
      if (counters) counters.postseasonRowsSkipped += 1;
      continue;
    }

    const position = POSITIONS_WITH_A_STAT_LINE[(raw.position ?? '').trim().toUpperCase()];
    if (!position) {
      if (counters) counters.unsupportedPositionRows += 1;
      continue;
    }

    rows.push({
      gsisId,
      name: raw.player_display_name?.trim() || raw.player_name?.trim() || gsisId,
      position,
      team: raw.team?.trim() ?? '',
      season: num(raw.season),
      week: num(raw.week),
      opponent: raw.opponent_team?.trim() ?? '',
      passing: {
        att: num(raw.attempts),
        comp: num(raw.completions),
        yds: num(raw.passing_yards),
        td: num(raw.passing_tds),
        int: num(raw.passing_interceptions),
        twoPt: num(raw.passing_2pt_conversions),
      },
      rushing: {
        att: num(raw.carries),
        yds: num(raw.rushing_yards),
        td: num(raw.rushing_tds),
        twoPt: num(raw.rushing_2pt_conversions),
      },
      receiving: {
        tgt: num(raw.targets),
        rec: num(raw.receptions),
        yds: num(raw.receiving_yards),
        td: num(raw.receiving_tds),
        twoPt: num(raw.receiving_2pt_conversions),
      },
      fumbles: num(raw.fumbles_total),
      fumblesLost: num(raw.fumbles_lost_total),
    });
  }

  return rows;
}

/**
 * Shapes one source row into AC-62's stat line.
 *
 * Which lines appear is position-appropriate rather than activity-driven, so a QB's card has
 * stable columns across weeks: a QB always shows passing and rushing, a RB rushing and
 * receiving, a WR/TE receiving — plus any line the player actually produced in that game
 * (a WR's end-around, a RB's trick-play pass).
 */
export function toCachedGame(row: WeeklyStatRow, receivingLong: number): CachedGame {
  const game: CachedGame = {
    week: row.week,
    opponent: row.opponent,
    fumbles: row.fumbles,
    fumblesLost: row.fumblesLost,
    twoPointConversions: {
      passing: row.passing.twoPt,
      rushing: row.rushing.twoPt,
      receiving: row.receiving.twoPt,
    },
  };

  if (row.position === 'QB' || row.passing.att > 0) {
    game.passing = {
      att: row.passing.att,
      comp: row.passing.comp,
      yds: row.passing.yds,
      td: row.passing.td,
      int: row.passing.int,
    };
  }

  if (row.position === 'QB' || row.position === 'RB' || row.rushing.att > 0) {
    game.rushing = {
      att: row.rushing.att,
      yds: row.rushing.yds,
      // Guarded: a game with no carries must read 0.0, not NaN.
      avg: row.rushing.att > 0 ? round2(row.rushing.yds / row.rushing.att) : 0,
      td: row.rushing.td,
    };
  }

  const caught = row.position === 'RB' || row.position === 'WR' || row.position === 'TE';
  if (caught || row.receiving.tgt > 0 || row.receiving.rec > 0 || row.receiving.yds !== 0) {
    game.receiving = {
      tgt: row.receiving.tgt,
      rec: row.receiving.rec,
      yds: row.receiving.yds,
      td: row.receiving.td,
      long: receivingLong,
      // Guarded for real data: Jahmyr Gibbs's 2024 week 3 has 20 receiving yards on 0 targets.
      ydsPerTgt: row.receiving.tgt > 0 ? round2(row.receiving.yds / row.receiving.tgt) : 0,
    };
  }

  return game;
}

export const receivingLongKey = (gsisId: string, season: number, week: number): string =>
  `${gsisId}|${season}|${week}`;

/**
 * Reduces a season of play-by-play to one number per player-week: the longest reception.
 *
 * Only completed passes count. Two-point conversions carry a receiver and positive
 * `yards_gained` but are not receptions (live-checked: all 43 such rows in the 2025 file are
 * two-point attempts, every one with an empty `receiving_yards`), and penalty plays likewise
 * gain yards nobody caught. `receiving_yards` is preferred over `yards_gained` because the
 * latter also carries lateral and fumble-return yardage on the same play.
 */
export function deriveReceivingLongs(csv: string, season: number): Map<string, number> {
  const parsed = Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true });
  const longs = new Map<string, number>();

  for (const play of parsed.data) {
    if (play.complete_pass !== '1') continue;
    const receiver = play.receiver_player_id?.trim();
    if (!receiver) continue;
    if ((play.season_type ?? 'REG').trim().toUpperCase() !== 'REG') continue;

    const week = num(play.week);
    if (week <= 0) continue;

    const yards = play.receiving_yards?.trim() ? num(play.receiving_yards) : num(play.yards_gained);
    const key = receivingLongKey(receiver, num(play.season) || season, week);
    longs.set(key, Math.max(longs.get(key) ?? 0, yards));
  }

  return longs;
}

export interface NflverseFetchOptions {
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

const request = async (
  url: string,
  options: NflverseFetchOptions,
): Promise<Response | null> => {
  const doFetch = options.fetchImpl ?? fetch;
  const response = await doFetch(url, { signal: options.signal });

  // A 404 is the normal answer for a season nflverse has not published yet (2026, today).
  if (response.status === 404) return null;
  if (!response.ok) {
    throw new Error(`nflverse download failed: HTTP ${response.status} for ${url}`);
  }
  return response;
};

/** One season of weekly player stats as CSV text, or null when that season is not published. */
export async function fetchWeeklyStats(
  season: number,
  options: NflverseFetchOptions = {},
): Promise<string | null> {
  const response = await request(weeklyStatsUrl(season), options);
  return response === null ? null : await response.text();
}

/** One season of play-by-play, gunzipped in memory; the compressed bytes are never persisted. */
export async function fetchPlayByPlay(
  season: number,
  options: NflverseFetchOptions = {},
): Promise<string | null> {
  const response = await request(playByPlayUrl(season), options);
  if (response === null) return null;

  const gzipped = Buffer.from(await response.arrayBuffer());
  return gunzipSync(gzipped).toString('utf8');
}
