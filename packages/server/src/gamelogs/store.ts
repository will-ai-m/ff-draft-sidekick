/**
 * FR-11's runtime reader — the only half of the game-log subsystem on the live server's path.
 *
 * Loads the small JSON cache `scripts/prep-nflverse-data.ts` wrote (a few MB for three seasons)
 * once at startup, then answers player-card lookups by Sleeper player id. Points are computed
 * per request from the scoring settings the caller passes, never stored (AC-64).
 *
 * A missing or unreadable cache is not fatal: every lookup answers with AC-65's explicit
 * "no NFL game data" card. FR-11 is a convenience surface; it must not be able to take the
 * draft board down.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { SKILL_POSITIONS } from '@sidekick/shared';
import type {
  GameLogEntry,
  GameLogSeason,
  PlayerCard,
  ScoringSettings,
  SkillPosition,
} from '@sidekick/shared';

import { DEFAULT_CROSSWALK_CACHE_DIR } from '../snapshots/crosswalk';
import { scoreGame, unsupportedScoringKeys } from './scoring';
import { GAMELOG_CACHE_VERSION } from './types';
import type { CachedGame, CachedPlayer, GameLogCache } from './types';

export const GAMELOG_CACHE_FILENAME = 'gamelogs.json';

/** Gitignored, and the same directory T3's crosswalk cache lives in. */
export const DEFAULT_GAMELOG_CACHE_DIR = DEFAULT_CROSSWALK_CACHE_DIR;

export interface GameLogLoadResult {
  cache: GameLogCache | null;
  /** Why there is no cache — shown by the CLI/pre-draft surface rather than swallowed. */
  reason: string | null;
}

/**
 * Reads `data/cache/gamelogs.json`. Returns a reason instead of throwing when it is absent
 * (the prep script has never been run), unreadable, or written by an older cache version.
 */
export function loadGameLogCache(cacheDir?: string): GameLogLoadResult {
  const path = resolve(cacheDir ?? DEFAULT_GAMELOG_CACHE_DIR, GAMELOG_CACHE_FILENAME);

  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return { cache: null, reason: `No game-log cache at ${path}. Run \`npm run prep:nflverse\`.` };
  }

  let parsed: GameLogCache;
  try {
    parsed = JSON.parse(raw) as GameLogCache;
  } catch {
    return { cache: null, reason: `Game-log cache at ${path} is not valid JSON; rebuild it.` };
  }

  if (parsed?.version !== GAMELOG_CACHE_VERSION || typeof parsed.players !== 'object') {
    return {
      cache: null,
      reason: `Game-log cache at ${path} was written by an incompatible version; rebuild it.`,
    };
  }

  return { cache: parsed, reason: null };
}

export interface PlayerCardOptions {
  /** The attached league's resolved per-stat scoring dict (AC-64). */
  scoring: ScoringSettings;
  /** Identity for a player with no cached games, so AC-65's card still names them. */
  player?: { name?: string | null; position?: PlayerCard['position']; team?: string | null };
}

export class GameLogStore {
  private constructor(
    private readonly cache: GameLogCache | null,
    readonly reason: string | null,
  ) {}

  /** Loads once, at startup. */
  static fromCacheDir(cacheDir?: string): GameLogStore {
    const { cache, reason } = loadGameLogCache(cacheDir);
    return new GameLogStore(cache, reason);
  }

  /** For tests and callers holding an already-built cache. */
  static fromCache(cache: GameLogCache | null, reason: string | null = null): GameLogStore {
    return new GameLogStore(cache, reason);
  }

  get isLoaded(): boolean {
    return this.cache !== null;
  }

  /** Seasons the cache covers, newest first — the card's tab order (AC-63). */
  get seasons(): number[] {
    return this.cache?.seasons ?? [];
  }

  get builtAt(): string | null {
    return this.cache?.builtAt ?? null;
  }

  /**
   * Historical positional value curves for FR-10's value model (amended 2026-08-31): what the
   * rank-N player at each position was actually worth, in the attached league's own scoring.
   *
   * Per cached season, every player's games are scored under `scoring` and summed to a season
   * total (totals, not per-game averages, so missed games discount a curve entry the way they
   * discount a season); each position's totals are ranked descending, and the curve entry at
   * rank N is the mean of the rank-N totals across seasons, divided by 17 to read as points per
   * game. A rank only some seasons reach averages over the seasons that reach it, and the final
   * curve is clamped monotone non-increasing and non-negative, so a thin tail season cannot put
   * a bump in it.
   *
   * This is the standard value-based-drafting simplification — "the RB5 you draft is priced as
   * what RB5 seasons have been worth" — chosen over projections Sidekick doesn't have. It is a
   * *relative* scale: plans only ever compare sums built from the same unfilled slots, so a
   * cross-position bias shared by all plans cancels.
   *
   * Returns null when no cache is loaded — the caller degrades exactly as it does for a missing
   * player card, visibly and without prediction.
   */
  positionalPointCurves(scoring: ScoringSettings): Record<SkillPosition, number[]> | null {
    if (this.cache === null) return null;

    const perSeason = new Map<number, Record<SkillPosition, number[]>>();
    for (const season of this.cache.seasons) {
      perSeason.set(season, { QB: [], RB: [], WR: [], TE: [] });
    }

    for (const player of Object.values(this.cache.players)) {
      if (!SKILL_POSITIONS.includes(player.position)) continue;
      for (const [seasonKey, games] of Object.entries(player.seasons)) {
        const season = perSeason.get(Number(seasonKey));
        if (season === undefined || games.length === 0) continue;
        let total = 0;
        for (const game of games) total += scoreGame(game, scoring, player.position);
        season[player.position].push(total);
      }
    }

    const curves: Record<SkillPosition, number[]> = { QB: [], RB: [], WR: [], TE: [] };
    for (const position of SKILL_POSITIONS) {
      const ranked = [...perSeason.values()]
        .map((totals) => totals[position].sort((a, b) => b - a))
        .filter((totals) => totals.length > 0);
      const length = Math.max(0, ...ranked.map((totals) => totals.length));

      const curve: number[] = [];
      for (let rank = 0; rank < length; rank += 1) {
        const values = ranked.filter((totals) => rank < totals.length);
        const mean = values.reduce((sum, totals) => sum + totals[rank]!, 0) / values.length;
        const perGame = Math.max(0, mean / 17);
        curve.push(rank > 0 ? Math.min(curve[rank - 1]!, perGame) : perGame);
      }
      curves[position] = curve;
    }
    return curves;
  }

  /**
   * The player card for one Sleeper player id, scored in the league's own settings.
   *
   * `hasData: false` is the explicit no-data state AC-65 requires — a rookie, a player with no
   * cached seasons, or a lookup made before the prep script has ever run. It is never an empty
   * table.
   */
  getPlayerCard(playerId: string, options: PlayerCardOptions): PlayerCard {
    // `playerId` is browser-supplied and `players` is a plain object parsed from JSON, so a plain
    // index read answers `players['toString']` with an inherited `Object.prototype` member — truthy,
    // so it slips past the no-data branch and reaches `seasonsFor` as something with no `.seasons`.
    // Own-property-only keeps every unknown id on AC-65's "no NFL game data" path.
    const players = this.cache?.players;
    const cached =
      players !== undefined && Object.hasOwn(players, playerId) ? players[playerId] : undefined;
    if (!cached) return this.noData(playerId, options);

    const seasons = this.seasonsFor(cached, options.scoring);
    if (seasons.length === 0) return this.noData(playerId, options);

    return {
      playerId,
      playerName: cached.name,
      position: cached.position,
      team: cached.team,
      hasData: true,
      seasons,
      unsupportedScoringKeys: unsupportedScoringKeys(options.scoring),
    };
  }

  private seasonsFor(cached: CachedPlayer, scoring: ScoringSettings): GameLogSeason[] {
    return Object.entries(cached.seasons)
      .map(([season, games]) => ({ season: Number(season), games }))
      .filter((entry) => Number.isFinite(entry.season) && entry.games.length > 0)
      .sort((a, b) => b.season - a.season)
      .map(({ season, games }) => ({
        season,
        games: games.map((game) => toEntry(game, scoring, cached)),
      }));
  }

  private noData(playerId: string, options: PlayerCardOptions): PlayerCard {
    return {
      playerId,
      playerName: options.player?.name ?? '',
      position: options.player?.position ?? null,
      team: options.player?.team ?? null,
      hasData: false,
      seasons: [],
      unsupportedScoringKeys: unsupportedScoringKeys(options.scoring),
    };
  }
}

/** Cached line -> displayed line: points computed here, scoring-only fields dropped here. */
function toEntry(game: CachedGame, scoring: ScoringSettings, player: CachedPlayer): GameLogEntry {
  const entry: GameLogEntry = {
    week: game.week,
    opponent: game.opponent,
    fantasyPoints: scoreGame(game, scoring, player.position),
    fumbles: game.fumbles,
  };

  if (game.passing) entry.passing = game.passing;
  if (game.rushing) entry.rushing = game.rushing;
  if (game.receiving) entry.receiving = game.receiving;

  return entry;
}
