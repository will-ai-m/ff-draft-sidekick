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

import type { GameLogEntry, GameLogSeason, PlayerCard, ScoringSettings } from '@sidekick/shared';

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
   * The player card for one Sleeper player id, scored in the league's own settings.
   *
   * `hasData: false` is the explicit no-data state AC-65 requires — a rookie, a player with no
   * cached seasons, or a lookup made before the prep script has ever run. It is never an empty
   * table.
   */
  getPlayerCard(playerId: string, options: PlayerCardOptions): PlayerCard {
    const cached = this.cache?.players[playerId];
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
