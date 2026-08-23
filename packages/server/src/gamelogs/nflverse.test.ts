import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
  createNflverseCounts,
  nflverseHandlers,
  playByPlayFixtureGz,
  weeklyStatsFixture,
} from '../../test/msw/nflverseHandlers';
import {
  deriveReceivingLongs,
  fetchPlayByPlay,
  fetchWeeklyStats,
  parseWeeklyStats,
  playByPlayUrl,
  receivingLongKey,
  toCachedGame,
  weeklyStatsUrl,
} from './nflverse';

const server = setupServer(...nflverseHandlers());
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ALLEN = '00-0034857';
const GIBBS = '00-0039139';
const CHASE = '00-0036900';
const BOWERS = '00-0039338';

const rows2025 = () => parseWeeklyStats(weeklyStatsFixture(2025));
const rows2024 = () => parseWeeklyStats(weeklyStatsFixture(2024));

const find = (
  rows: ReturnType<typeof parseWeeklyStats>,
  gsisId: string,
  week: number,
): (typeof rows)[number] => {
  const row = rows.find((r) => r.gsisId === gsisId && r.week === week);
  if (!row) throw new Error(`fixture is missing ${gsisId} week ${week}`);
  return row;
};

describe('parseWeeklyStats', () => {
  it('reads the real weekly-stats columns into a typed row', () => {
    const allen = find(rows2025(), ALLEN, 1);

    expect(allen).toMatchObject({
      gsisId: ALLEN,
      name: 'Josh Allen',
      position: 'QB',
      team: 'BUF',
      season: 2025,
      week: 1,
      opponent: 'BAL',
      fumbles: 0,
      fumblesLost: 0,
    });
    expect(allen.passing).toEqual({ att: 46, comp: 33, yds: 394, td: 2, int: 0, twoPt: 0 });
    expect(allen.rushing).toEqual({ att: 14, yds: 30, td: 2, twoPt: 0 });
  });

  it('drops postseason rows — a fantasy game log is the regular season', () => {
    const rows = rows2025();

    // The fixture carries Josh Allen's real 2025 week-19 postseason line.
    expect(weeklyStatsFixture(2025)).toContain('POST');
    expect(rows.some((r) => r.week > 18)).toBe(false);
    expect(rows.filter((r) => r.gsisId === ALLEN).map((r) => r.week)).toEqual([1, 2, 3]);
  });

  it('keeps the positions AC-62 defines a stat line for and drops the rest', () => {
    const header = weeklyStatsFixture(2025).split('\n')[0] ?? '';
    const blank = header.split(',').map(() => '').join(',');
    const row = (id: string, position: string): string => {
      const cells = header.split(',');
      const out = blank.split(',');
      const set = (name: string, value: string): void => {
        const index = cells.indexOf(name);
        if (index >= 0) out[index] = value;
      };
      set('player_id', id);
      set('player_display_name', 'Fixture Player');
      set('position', position);
      set('position_group', position);
      set('season', '2025');
      set('week', '1');
      set('season_type', 'REG');
      set('team', 'BUF');
      set('opponent_team', 'MIA');
      return out.join(',');
    };

    const parsed = parseWeeklyStats(
      [header, row('00-0000001', 'FB'), row('00-0000002', 'LB'), row('00-0000003', 'K')].join('\n'),
    );

    // Sleeper lists fullbacks as RBs. Kickers and defenders are dropped: AC-62 defines
    // passing/rushing/receiving columns only, so there is no kicking stat line to show.
    expect(parsed.map((r) => [r.gsisId, r.position])).toEqual([['00-0000001', 'RB']]);
  });
});

describe('toCachedGame — AC-62 position-appropriate stat lines', () => {
  it('gives a QB passing and rushing, never an empty receiving line', () => {
    const game = toCachedGame(find(rows2025(), ALLEN, 1), 0);

    expect(game.passing).toEqual({ att: 46, comp: 33, yds: 394, td: 2, int: 0 });
    expect(game.rushing).toEqual({ att: 14, yds: 30, avg: 2.14, td: 2 });
    expect(game.receiving).toBeUndefined();
    expect(game).toMatchObject({ week: 1, opponent: 'BAL', fumbles: 0, fumblesLost: 0 });
  });

  it('gives a RB rushing and receiving, with the long joined in from play-by-play', () => {
    const game = toCachedGame(find(rows2025(), GIBBS, 2), 42);

    expect(game.rushing).toEqual({ att: 12, yds: 94, avg: 7.83, td: 1 });
    expect(game.receiving).toEqual({ tgt: 3, rec: 3, yds: 10, td: 0, long: 42, ydsPerTgt: 3.33 });
    expect(game.passing).toBeUndefined();
  });

  it('gives a TE receiving only, and records a two-point conversion for scoring', () => {
    const game = toCachedGame(find(rows2025(), BOWERS, 3), 18);

    expect(game.receiving).toEqual({ tgt: 5, rec: 4, yds: 38, td: 0, long: 18, ydsPerTgt: 7.6 });
    expect(game.rushing).toBeUndefined();
    // Bowers really did catch a two-point conversion in week 3 — it is worth points, not a TD.
    expect(game.twoPointConversions).toEqual({ passing: 0, rushing: 0, receiving: 1 });
  });

  it('gives a WR a rushing line only on a game they actually carried the ball', () => {
    const withCarry = toCachedGame(find(rows2025(), CHASE, 3), 28);
    const withoutCarry = toCachedGame(find(rows2025(), CHASE, 2), 25);

    expect(withCarry.rushing).toEqual({ att: 1, yds: 9, avg: 9, td: 0 });
    expect(withoutCarry.rushing).toBeUndefined();
    expect(withoutCarry.receiving).toEqual({
      tgt: 16,
      rec: 14,
      yds: 165,
      td: 1,
      long: 25,
      ydsPerTgt: 10.31,
    });
  });

  it('never divides by zero on a game with receiving yards but no targets', () => {
    // Jahmyr Gibbs, 2024 week 3: 20 receiving yards and a TD on 0 targets and 0 receptions.
    const game = toCachedGame(find(rows2024(), GIBBS, 3), 0);

    expect(game.receiving).toEqual({ tgt: 0, rec: 0, yds: 20, td: 1, long: 0, ydsPerTgt: 0 });
    expect(game.rushing).toEqual({ att: 16, yds: 83, avg: 5.19, td: 0 });
  });
});

describe('deriveReceivingLongs', () => {
  const decode = async (season: number): Promise<string> => {
    server.use(...nflverseHandlers());
    const csv = await fetchPlayByPlay(season);
    if (csv === null) throw new Error('fixture play-by-play missing');
    return csv;
  };

  it('derives the longest reception per player-week from real play-by-play', async () => {
    const longs = deriveReceivingLongs(await decode(2025), 2025);

    expect(longs.get(receivingLongKey(CHASE, 2025, 2))).toBe(25);
    expect(longs.get(receivingLongKey(BOWERS, 2025, 1))).toBe(38);
    expect(longs.get(receivingLongKey(GIBBS, 2025, 3))).toBe(9);
  });

  it('does not count a two-point conversion as a reception', async () => {
    const csv = await decode(2025);
    expect(csv).toContain('TWO-POINT CONVERSION ATTEMPT');

    // Bowers's week-3 two-point catch is in the fixture; his longest real catch was 18 yards.
    expect(deriveReceivingLongs(csv, 2025).get(receivingLongKey(BOWERS, 2025, 3))).toBe(18);
  });

  it('ignores incompletions and penalty plays that carry the receiver but no reception', () => {
    const csv = [
      'game_id,season,season_type,week,play_type,yards_gained,complete_pass,rush_attempt,receiver_player_id,receiving_yards,rusher_player_id',
      // A 45-yard defensive pass interference: real yards, but not a reception.
      '2025_01_AA_BB,2025,REG,1,no_play,45,0,0,00-0000001,,',
      '2025_01_AA_BB,2025,REG,1,pass,0,0,0,00-0000001,,',
      '2025_01_AA_BB,2025,REG,1,pass,12,1,0,00-0000001,12,',
      '2025_01_AA_BB,2025,REG,1,run,60,0,1,,,00-0000001',
    ].join('\n');

    expect(deriveReceivingLongs(csv, 2025).get(receivingLongKey('00-0000001', 2025, 1))).toBe(12);
  });

  it('reports nothing for a player-week with no completed pass', async () => {
    const longs = deriveReceivingLongs(await decode(2024), 2024);

    // Gibbs's 2024 week-3 receiving yards came on a lateral, so he has no completed pass.
    expect(longs.get(receivingLongKey(GIBBS, 2024, 3))).toBeUndefined();
    expect(longs.get(receivingLongKey(GIBBS, 2024, 2))).toBe(9);
  });
});

describe('fetching', () => {
  it('builds the verified release URLs', () => {
    expect(weeklyStatsUrl(2025)).toBe(
      'https://github.com/nflverse/nflverse-data/releases/download/stats_player/stats_player_week_2025.csv',
    );
    expect(playByPlayUrl(2025)).toBe(
      'https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_2025.csv.gz',
    );
  });

  it('gunzips the play-by-play asset, which ships gzipped', async () => {
    const counts = createNflverseCounts();
    server.use(...nflverseHandlers({ counts }));

    const csv = await fetchPlayByPlay(2025);

    expect(counts.pbp).toBe(1);
    expect(playByPlayFixtureGz(2025).subarray(0, 2)).toEqual(Buffer.from([0x1f, 0x8b]));
    expect(csv?.split('\n')[0]).toContain('receiver_player_id');
  });

  it('returns null for a season nflverse has not published yet, rather than throwing', async () => {
    // 2026 is the live case: on this date the season has not started and the asset 404s.
    expect(await fetchWeeklyStats(2026)).toBeNull();
    expect(await fetchPlayByPlay(2026)).toBeNull();
  });

  it('throws on a real transport failure, so prep cannot silently write a short cache', async () => {
    server.use(...nflverseHandlers({ weeklyStatus: 500 }));

    await expect(fetchWeeklyStats(2025)).rejects.toThrow(/500/);
  });
});
