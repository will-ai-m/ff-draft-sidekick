import { SCORING_DEFAULTS, defaultScoringSettings } from '@sidekick/shared';
import Papa from 'papaparse';
import { describe, expect, it } from 'vitest';

import { weeklyStatsFixture } from '../../test/msw/nflverseHandlers';
import { parseWeeklyStats, toCachedGame } from './nflverse';
import { scoreGame, unsupportedScoringKeys } from './scoring';

const game = (season: number, gsisId: string, week: number) => {
  const row = parseWeeklyStats(weeklyStatsFixture(season)).find(
    (r) => r.gsisId === gsisId && r.week === week,
  );
  if (!row) throw new Error(`fixture is missing ${gsisId} ${season} week ${week}`);
  return { game: toCachedGame(row, 0), position: row.position };
};

const ALLEN = '00-0034857';
const GIBBS = '00-0039139';
const CHASE = '00-0036900';
const BOWERS = '00-0039338';

/**
 * A real league's granular dict is nothing like a named format: 6-point passing TDs, full PPR,
 * a TE reception premium, a 300-yard passing bonus and a softer interception penalty.
 */
const CUSTOM_LEAGUE = {
  pass_yd: 0.05,
  pass_td: 6,
  pass_int: -1,
  pass_2pt: 2,
  bonus_pass_yd_300: 3,
  rush_yd: 0.1,
  rush_td: 6,
  rush_2pt: 2,
  rec: 1,
  rec_yd: 0.1,
  rec_td: 6,
  rec_2pt: 2,
  bonus_rec_te: 0.5,
  fum_lost: -2,
};

describe('scoreGame with the named default tables', () => {
  it('scores a QB game identically in every format, because he caught nothing', () => {
    const { game: allen, position } = game(2025, ALLEN, 1);

    // 394 * 0.04 + 2 * 4 + 30 * 0.1 + 2 * 6
    expect(scoreGame(allen, SCORING_DEFAULTS.standard, position)).toBe(38.76);
    expect(scoreGame(allen, SCORING_DEFAULTS.half_ppr, position)).toBe(38.76);
    expect(scoreGame(allen, SCORING_DEFAULTS.ppr, position)).toBe(38.76);
  });

  it('separates the three named formats by the reception value alone', () => {
    const { game: chase, position } = game(2025, CHASE, 2);

    // 14 receptions, 165 yards, 1 TD.
    expect(scoreGame(chase, SCORING_DEFAULTS.standard, position)).toBe(22.5);
    expect(scoreGame(chase, SCORING_DEFAULTS.half_ppr, position)).toBe(29.5);
    expect(scoreGame(chase, SCORING_DEFAULTS.ppr, position)).toBe(36.5);
  });

  it('subtracts a lost fumble but not a recovered one', () => {
    const { game: lost, position } = game(2025, CHASE, 3);
    const { game: recovered, position: qb } = game(2025, ALLEN, 3);

    expect(lost).toMatchObject({ fumbles: 1, fumblesLost: 1 });
    // 50 * 0.1 + 9 * 0.1 + 5 * 0.5 - 2
    expect(scoreGame(lost, SCORING_DEFAULTS.half_ppr, position)).toBe(6.4);

    expect(recovered).toMatchObject({ fumbles: 1, fumblesLost: 0 });
    expect(scoreGame(recovered, SCORING_DEFAULTS.half_ppr, qb)).toBe(23.02);
  });

  it('counts a two-point conversion', () => {
    const { game: bowers, position } = game(2025, BOWERS, 3);

    // 38 * 0.1 + 4 * 0.5 + 2 (the two-point catch)
    expect(scoreGame(bowers, SCORING_DEFAULTS.half_ppr, position)).toBe(7.8);
  });

  it("reproduces nflverse's own precomputed columns on every fixture row", () => {
    // An independent check on the stat-to-key mapping: nflverse computes standard and PPR points
    // itself, and this scorer must land on its numbers to the cent. The one deliberate override:
    // nflverse's formula charges -2 for an interception where Sleeper's default table charges -1,
    // so the comparison pins nflverse's convention rather than papering over the difference.
    const nflverseStandard = { ...SCORING_DEFAULTS.standard, pass_int: -2 };
    const nflversePpr = { ...SCORING_DEFAULTS.ppr, pass_int: -2 };
    let compared = 0;

    for (const season of [2025, 2024]) {
      const source = Papa.parse<Record<string, string>>(weeklyStatsFixture(season), {
        header: true,
        skipEmptyLines: true,
      }).data;

      for (const row of parseWeeklyStats(weeklyStatsFixture(season))) {
        const raw = source.find(
          (r) =>
            r.player_id === row.gsisId && Number(r.week) === row.week && r.season_type === 'REG',
        );
        const cached = toCachedGame(row, 0);
        expect(scoreGame(cached, nflverseStandard, row.position)).toBeCloseTo(
          Number(raw?.fantasy_points),
          2,
        );
        expect(scoreGame(cached, nflversePpr, row.position)).toBeCloseTo(
          Number(raw?.fantasy_points_ppr),
          2,
        );
        compared += 1;
      }
    }

    expect(compared).toBeGreaterThan(20);
  });
});

describe("scoreGame with a league's own settings (AC-64)", () => {
  it("produces a total the source file's precomputed columns do not contain", () => {
    const { game: allen, position } = game(2025, ALLEN, 1);

    // 394 * 0.05 + 2 * 6 + 3 (300-yard bonus) + 30 * 0.1 + 2 * 6
    expect(scoreGame(allen, CUSTOM_LEAGUE, position)).toBe(49.7);
    expect(scoreGame(allen, CUSTOM_LEAGUE, position)).not.toBe(
      scoreGame(allen, SCORING_DEFAULTS.half_ppr, position),
    );
  });

  it('applies a positional reception bonus only to that position', () => {
    const { game: bowers, position: te } = game(2025, BOWERS, 3);
    const { game: gibbs, position: rb } = game(2025, GIBBS, 2);

    // TE: 4 * (1 + 0.5) + 38 * 0.1 + 2
    expect(scoreGame(bowers, CUSTOM_LEAGUE, te)).toBe(11.8);
    // RB: 3 receptions at 1.0 each, no premium — 94 * 0.1 + 6 + 3 * 1 + 10 * 0.1
    expect(scoreGame(gibbs, CUSTOM_LEAGUE, rb)).toBe(19.4);
  });

  it('treats a key the league simply omits as zero, not as an error', () => {
    const { game: chase, position } = game(2025, CHASE, 2);

    // A real league dict routinely omits keys; only receiving yards should score here.
    expect(scoreGame(chase, { rec_yd: 0.1 }, position)).toBe(16.5);
    expect(scoreGame(chase, {}, position)).toBe(0);
  });

  it('ignores scoring keys no game-log column can answer, instead of throwing', () => {
    const { game: chase, position } = game(2025, CHASE, 2);
    const withDefenseAndKicking = { ...CUSTOM_LEAGUE, def_st_td: 6, sack: 1, fgm_40_49: 4, idp_tkl: 1 };

    expect(scoreGame(chase, withDefenseAndKicking, position)).toBe(
      scoreGame(chase, CUSTOM_LEAGUE, position),
    );
    expect(unsupportedScoringKeys(withDefenseAndKicking).sort()).toEqual([
      'def_st_td',
      'fgm_40_49',
      'idp_tkl',
      'sack',
    ]);
  });

  it("composes with the shared mock fallback table, so a mock's label still scores", () => {
    // A mock draft has no league object to read a granular dict from (T2's live finding), so
    // FR-11 scores it through the named table `defaultScoringSettings` resolves from the label.
    const { game: chase, position } = game(2025, CHASE, 2);

    expect(scoreGame(chase, defaultScoringSettings('half_ppr').settings, position)).toBe(29.5);
    expect(scoreGame(chase, defaultScoringSettings('ppr').settings, position)).toBe(36.5);
  });
});
