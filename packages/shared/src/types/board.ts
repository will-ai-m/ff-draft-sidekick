/**
 * Board vocabulary — PRD §9 "Terms used by the requirements".
 *
 * The **board** is the set {player -> drafted/available, drafted-by-team} derived purely from
 * the Sleeper pick list. Rankings, survival percentages and recommendations are *insights*
 * computed downstream from the board plus the snapshots — they are never part of the board.
 */

/** Every position Sidekick tracks. K/DST are tracked on rosters but carry no prediction weight. */
export type Position = 'QB' | 'RB' | 'WR' | 'TE' | 'K' | 'DST';

/** The four positions the simulation and candidate list operate on (🔶 AS-7 excludes K/DST). */
export type SkillPosition = 'QB' | 'RB' | 'WR' | 'TE';

export const POSITIONS: readonly Position[] = ['QB', 'RB', 'WR', 'TE', 'K', 'DST'];

export const SKILL_POSITIONS: readonly SkillPosition[] = ['QB', 'RB', 'WR', 'TE'];

export const isSkillPosition = (position: Position): position is SkillPosition =>
  (SKILL_POSITIONS as readonly Position[]).includes(position);

/**
 * A **team** — the drafting entity a pick belongs to. Keyed by `draft_slot` + `draft_order`
 * rather than `roster_id`/`picked_by`, because mocks carry neither (✅ AS-1, AC-4). "Seat",
 * "owner", "manager", "opponent" and "league-mate" all mean this one entity.
 */
export interface Team {
  /** Stable Sidekick-side id derived from the draft slot, so mocks and real leagues agree. */
  teamId: string;
  /** 1-based seat number in the draft order. */
  draftSlot: number;
  /** Team name where the API provides one, else null (AC-2). */
  displayName: string | null;
  /** Owner display name where the API provides one, else null — bot/empty seats show by slot. */
  ownerDisplayName: string | null;
  /** True when the seat has no human owner (a mock bot or an empty seat). */
  isBotSeat: boolean;
  /** Sleeper user id when known — used to resolve the user's own slot (AC-5). */
  userId: string | null;
  /** Sleeper roster id, present on real-league drafts only; never used for pick attribution. */
  rosterId: number | null;
  /** True for the seat the user themselves is drafting from. */
  isUser: boolean;
}

/** Per-player board state — availability plus attribution, nothing derived. */
export interface BoardPlayerState {
  drafted: boolean;
  draftedByTeamId?: string;
  pickNo?: number;
}

/** The board itself: availability keyed by Sleeper `player_id`, plus the seats. */
export interface Board {
  players: Record<string, BoardPlayerState>;
  teams: Team[];
}

/** One entry in the **pick feed** (FR-2), chronological and attributed. */
export interface PickFeedEntry {
  /** 1-based overall pick number. */
  pickNo: number;
  round: number;
  draftSlot: number;
  teamId: string;
  /** Sleeper `player_id`. */
  playerId: string;
  /** Raw Sleeper name — shown as-is for players unmatched to the snapshot (AC-20). */
  playerName: string;
  position: Position | null;
  /** Mine-vs-opponent flag (AC-11). */
  isUserPick: boolean;
  /** False when the player could not be matched to the rankings snapshot (AC-20). */
  matchedToSnapshot: boolean;
}

/**
 * The **sync indicator** (FR-3) — last successful sync plus healthy/degraded. `boardVersion`
 * is the monotonic counter `Insight<T>` compares against to decide `recomputing` (AC-21).
 */
export interface SyncIndicator {
  lastSuccessfulSyncAt: string | null;
  status: 'healthy' | 'degraded';
  boardVersion: number;
}
