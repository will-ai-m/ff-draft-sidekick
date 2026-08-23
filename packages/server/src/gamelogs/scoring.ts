/**
 * FR-11's fantasy-point recompute (AC-64).
 *
 * The rule this file exists to enforce: a game log's points come from **the attached league's
 * own scoring settings**, never from a generic format. nflverse ships two precomputed columns
 * (`fantasy_points`, `fantasy_points_ppr`); both are fixed-format, so neither is ever read —
 * `nflverse.ts` does not even carry them into a `CachedGame`.
 *
 * Where the settings dict comes from is FR-5's job, not this module's: `roster/leagueSettings.ts`
 * resolves the attached league's granular per-stat dict, or — for a mock, which has no league
 * object to fetch one from — the named fallback table in `@sidekick/shared`'s `scoringDefaults`.
 * This module takes whatever dict it is handed and applies it.
 *
 * Keys are Sleeper's own stat names. A key the dict omits scores zero; a key no game-log column
 * can answer (defensive, kicking, first downs) is ignored rather than throwing — the alternative
 * is a real league's perfectly valid dict crashing a player card.
 */
import type { ScoringSettings, SkillPosition } from '@sidekick/shared';

import type { CachedGame } from './types';

type StatFor = (game: CachedGame, position: SkillPosition) => number;

const over = (value: number, threshold: number): number => (value >= threshold ? 1 : 0);

const receptionsFor = (game: CachedGame, position: SkillPosition, target: SkillPosition): number =>
  position === target ? (game.receiving?.rec ?? 0) : 0;

/**
 * Every Sleeper scoring key a cached stat line can answer. Anything outside this table is
 * reported by {@link unsupportedScoringKeys} and contributes nothing.
 */
const STAT_FOR_KEY: Readonly<Record<string, StatFor>> = Object.freeze({
  // Passing
  pass_att: (g) => g.passing?.att ?? 0,
  pass_cmp: (g) => g.passing?.comp ?? 0,
  pass_inc: (g) => Math.max(0, (g.passing?.att ?? 0) - (g.passing?.comp ?? 0)),
  pass_yd: (g) => g.passing?.yds ?? 0,
  pass_td: (g) => g.passing?.td ?? 0,
  pass_int: (g) => g.passing?.int ?? 0,
  pass_2pt: (g) => g.twoPointConversions.passing,
  bonus_pass_yd_300: (g) => over(g.passing?.yds ?? 0, 300),
  bonus_pass_yd_400: (g) => over(g.passing?.yds ?? 0, 400),

  // Rushing
  rush_att: (g) => g.rushing?.att ?? 0,
  rush_yd: (g) => g.rushing?.yds ?? 0,
  rush_td: (g) => g.rushing?.td ?? 0,
  rush_2pt: (g) => g.twoPointConversions.rushing,
  bonus_rush_att_20: (g) => over(g.rushing?.att ?? 0, 20),
  bonus_rush_yd_100: (g) => over(g.rushing?.yds ?? 0, 100),
  bonus_rush_yd_200: (g) => over(g.rushing?.yds ?? 0, 200),

  // Receiving
  rec: (g) => g.receiving?.rec ?? 0,
  rec_yd: (g) => g.receiving?.yds ?? 0,
  rec_td: (g) => g.receiving?.td ?? 0,
  rec_2pt: (g) => g.twoPointConversions.receiving,
  bonus_rec_yd_100: (g) => over(g.receiving?.yds ?? 0, 100),
  bonus_rec_yd_200: (g) => over(g.receiving?.yds ?? 0, 200),
  // Positional reception premiums: points per reception, for that position only.
  bonus_rec_rb: (g, position) => receptionsFor(g, position, 'RB'),
  bonus_rec_wr: (g, position) => receptionsFor(g, position, 'WR'),
  bonus_rec_te: (g, position) => receptionsFor(g, position, 'TE'),

  // Ball security
  fum: (g) => g.fumbles,
  fum_lost: (g) => g.fumblesLost,
});

/** The scoring keys this module can actually pay out, for callers that want to show them. */
export const SUPPORTED_SCORING_KEYS: readonly string[] = Object.freeze(Object.keys(STAT_FOR_KEY));

/**
 * Keys present in a league's dict that no game-log column can answer — defensive scoring,
 * kicking, first downs, and anything else Sleeper supports that nflverse's weekly file does not
 * express per skill-position game. Surfaced so the gap is visible rather than silent.
 */
export function unsupportedScoringKeys(settings: ScoringSettings): string[] {
  return Object.keys(settings).filter((key) => !(key in STAT_FOR_KEY));
}

/**
 * Fantasy points for one game under one league's scoring dict.
 *
 * Rounded to two decimals: 0.04 points per passing yard makes binary-float dust
 * (`394 * 0.04 = 15.760000000000002`) that has no business reaching a player card.
 */
export function scoreGame(
  game: CachedGame,
  settings: ScoringSettings,
  position: SkillPosition,
): number {
  let points = 0;

  for (const [key, value] of Object.entries(settings)) {
    if (typeof value !== 'number' || value === 0) continue;
    const statFor = STAT_FOR_KEY[key];
    if (!statFor) continue;
    points += value * statFor(game, position);
  }

  return Math.round(points * 100) / 100;
}
