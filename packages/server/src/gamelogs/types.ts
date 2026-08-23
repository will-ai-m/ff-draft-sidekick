/**
 * FR-11's cache vocabulary — the shapes `scripts/prep-nflverse-data.ts` writes and
 * `gamelogs/store.ts` reads.
 *
 * The cache deliberately holds **no fantasy-point total**. AC-64 requires the log's points to
 * come from the attached league's own scoring settings, which are not knowable when the prep
 * script runs (it runs once before draft season, against no particular league). Storing a
 * number here would mean either a generic format leaking onto the card or a stale value
 * shadowing the league's. So the cache stores the raw stat line, and `store.ts` scores it per
 * request through `scoring.ts`.
 */
import type { PassingLine, ReceivingLine, RushingLine, SkillPosition } from '@sidekick/shared';

/** Not displayed (AC-62 names no column for them), but they are worth points in most leagues. */
export interface TwoPointConversions {
  passing: number;
  rushing: number;
  receiving: number;
}

/** One cached regular-season game: AC-62's stat line plus the fields only scoring reads. */
export interface CachedGame {
  week: number;
  opponent: string;
  /** Present when the stat line is position-appropriate (AC-62), absent otherwise. */
  passing?: PassingLine;
  rushing?: RushingLine;
  receiving?: ReceivingLine;
  /** Total fumbles — the column AC-62 displays. */
  fumbles: number;
  /** Lost fumbles — what league scoring's `fum_lost` actually charges for. */
  fumblesLost: number;
  twoPointConversions: TwoPointConversions;
}

export interface CachedPlayer {
  /** Sleeper's player id: the app's canonical id everywhere, and this cache's key. */
  playerId: string;
  name: string;
  position: SkillPosition;
  team: string | null;
  /** Keyed by season as a string, because that is what JSON gives back. */
  seasons: Record<string, CachedGame[]>;
}

/** Bumped whenever the cache shape changes, so a stale file is rejected rather than misread. */
export const GAMELOG_CACHE_VERSION = 1;

export interface GameLogCache {
  version: number;
  builtAt: string;
  /** Newest first. */
  seasons: number[];
  players: Record<string, CachedPlayer>;
}

/** What one prep run did — printed by the CLI so a stale or short cache is visible, not silent. */
export interface PrepStats {
  seasonsProbed: number[];
  seasonsWithoutData: number[];
  seasonsWithoutPlayByPlay: number[];
  statRows: number;
  gamesCached: number;
  playersCached: number;
  /** Stats rows whose gsis_id has no crosswalk row at all. */
  rowsWithoutCrosswalkRow: number;
  /** Stats rows whose crosswalk row exists but carries no Sleeper id (the CSV's `NA`). */
  rowsWithoutSleeperId: number;
  postseasonRowsSkipped: number;
  unsupportedPositionRows: number;
  longsDerived: number;
}
