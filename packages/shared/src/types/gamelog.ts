import type { Position } from './board';

/** Passing line — AC-62's exact column set. */
export interface PassingLine {
  att: number;
  comp: number;
  yds: number;
  td: number;
  int: number;
}

/** Rushing line — AC-62's exact column set (`avg` is yds/att). */
export interface RushingLine {
  att: number;
  yds: number;
  avg: number;
  td: number;
}

/** Receiving line — AC-62's exact column set (`long` is derived from play-by-play). */
export interface ReceivingLine {
  tgt: number;
  rec: number;
  yds: number;
  td: number;
  long: number;
  ydsPerTgt: number;
}

/** One game in a player's per-game log (AC-62). Position-appropriate lines only. */
export interface GameLogEntry {
  week: number;
  opponent: string;
  /**
   * Recomputed from the attached league's own scoring settings (AC-64) — never the
   * nflverse file's precomputed `fantasy_points`/`fantasy_points_ppr` columns.
   */
  fantasyPoints: number;
  passing?: PassingLine;
  rushing?: RushingLine;
  receiving?: ReceivingLine;
  fumbles: number;
}

/** One season tab on a player card (AC-63). */
export interface GameLogSeason {
  season: number;
  games: GameLogEntry[];
}

/**
 * The player card payload (FR-11). `hasData: false` drives the explicit "no NFL game data"
 * message for rookies and anyone absent from the cache — never an empty table (AC-65).
 */
export interface PlayerCard {
  playerId: string;
  playerName: string;
  position: Position | null;
  team: string | null;
  hasData: boolean;
  /** Newest season first; empty when `hasData` is false. */
  seasons: GameLogSeason[];
  /**
   * AC-64's other half: the attached league's scoring keys that no game-log column can answer
   * (defensive, kicking, first downs, …). Carried on the card so the reader can see which of
   * their league's rules these points do *not* include, rather than the gap being visible only
   * to the scorer. Empty when every rule the league sets could be applied.
   */
  unsupportedScoringKeys: string[];
}
