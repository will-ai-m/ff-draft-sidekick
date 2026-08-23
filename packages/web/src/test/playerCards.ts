/**
 * `PlayerCard` fixtures for the web suite (FR-11).
 *
 * The shape is T9's, verbatim — `store.getPlayerCard` is what `GET /api/player/:id/gamelog`
 * returns and the card renders it unchanged, so these builders only spell one out compactly.
 * The numbers are real: they are the same players T9's own fixtures are built from, which is
 * what makes "a QB's column set" and "a RB's column set" mean something concrete here.
 */
import type { PlayerCard } from '@sidekick/shared';

/** Josh Allen — a QB: passing every week, rushing every week (T9's decision 4). */
export const quarterbackCard = (): PlayerCard => ({
  playerId: '4984',
  playerName: 'Josh Allen',
  position: 'QB',
  team: 'BUF',
  hasData: true,
  unsupportedScoringKeys: [],
  seasons: [
    {
      season: 2025,
      games: [
        {
          week: 1,
          opponent: 'BAL',
          fantasyPoints: 27.42,
          passing: { att: 33, comp: 18, yds: 394, td: 2, int: 1 },
          rushing: { att: 7, yds: 30, avg: 4.3, td: 0 },
          fumbles: 1,
        },
        {
          week: 2,
          opponent: 'NYJ',
          fantasyPoints: 19.1,
          passing: { att: 25, comp: 19, yds: 210, td: 1, int: 0 },
          rushing: { att: 5, yds: 41, avg: 8.2, td: 1 },
          fumbles: 0,
        },
      ],
    },
  ],
});

/**
 * Jahmyr Gibbs — a RB: rushing and receiving, and **two** seasons, which is AC-63's tab case.
 * His 2024 week 3 is the real 0-target / 20-yard / 1-TD line behind T9's `ydsPerTgt` guard.
 */
export const runningBackCard = (): PlayerCard => ({
  playerId: '9221',
  playerName: 'Jahmyr Gibbs',
  position: 'RB',
  team: 'DET',
  hasData: true,
  unsupportedScoringKeys: [],
  seasons: [
    {
      season: 2025,
      games: [
        {
          week: 1,
          opponent: 'GB',
          fantasyPoints: 19.3,
          rushing: { att: 15, yds: 82, avg: 5.5, td: 1 },
          receiving: { tgt: 5, rec: 4, yds: 31, td: 0, long: 14, ydsPerTgt: 6.2 },
          fumbles: 0,
        },
        {
          week: 2,
          opponent: 'CHI',
          fantasyPoints: 12.05,
          rushing: { att: 12, yds: 55, avg: 4.6, td: 0 },
          receiving: { tgt: 3, rec: 3, yds: 35, td: 0, long: 22, ydsPerTgt: 11.7 },
          fumbles: 1,
        },
      ],
    },
    {
      season: 2024,
      games: [
        {
          week: 3,
          opponent: 'ARI',
          fantasyPoints: 8,
          rushing: { att: 9, yds: 40, avg: 4.4, td: 0 },
          receiving: { tgt: 0, rec: 0, yds: 20, td: 1, long: 0, ydsPerTgt: 0 },
          fumbles: 0,
        },
      ],
    },
  ],
});

/**
 * Ja'Marr Chase — a WR: receiving every week, plus the single 2025 week-3 carry that makes
 * "position decides the lines, activity only ever adds one" (T9's decision 4) visible.
 */
export const wideReceiverCard = (): PlayerCard => ({
  playerId: '7564',
  playerName: "Ja'Marr Chase",
  position: 'WR',
  team: 'CIN',
  hasData: true,
  unsupportedScoringKeys: [],
  seasons: [
    {
      season: 2025,
      games: [
        {
          week: 2,
          opponent: 'JAX',
          fantasyPoints: 14.5,
          receiving: { tgt: 11, rec: 6, yds: 85, td: 0, long: 33, ydsPerTgt: 7.7 },
          fumbles: 0,
        },
        {
          week: 3,
          opponent: 'MIN',
          fantasyPoints: 21.9,
          rushing: { att: 1, yds: 6, avg: 6, td: 0 },
          receiving: { tgt: 9, rec: 7, yds: 110, td: 1, long: 41, ydsPerTgt: 12.2 },
          fumbles: 0,
        },
      ],
    },
  ],
});

/** Squirrel White — a 2026 rookie, so AC-65's explicit no-data card rather than an empty table. */
export const rookieCard = (): PlayerCard => ({
  playerId: '13943',
  playerName: 'Squirrel White',
  position: 'WR',
  team: 'TEN',
  hasData: false,
  unsupportedScoringKeys: [],
  seasons: [],
});
