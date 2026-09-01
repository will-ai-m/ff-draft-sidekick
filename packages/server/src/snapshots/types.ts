/**
 * FR-4 snapshot vocabulary — the ECR and ADP snapshots, the player-ID crosswalk that joins
 * them to Sleeper, and the result of matching.
 *
 * These types live in the server package rather than `@sidekick/shared` because they are
 * ingestion-layer detail: everything the frontend sees is already projected onto the shared
 * `CandidateRow` / `PreDraftCheckData` shapes.
 */
import type { Position } from '@sidekick/shared';

// ---------------------------------------------------------------------------------------
// ECR — FantasyPros half-PPR cheat sheet
// ---------------------------------------------------------------------------------------

/** One player row from the cheat sheet's embedded `ecrData` JSON. */
export interface EcrEntry {
  /** `ecrData.players[].player_id` — the join key into the crosswalk's `fantasypros_id`. */
  fantasyProsId: number;
  playerName: string;
  position: Position;
  /** Team abbreviation, or null for a free agent. DST rows carry the team they *are*. */
  team: string | null;
  /** Overall half-PPR ECR rank. Drives ordering everywhere; never re-sorted (🔶 AS-8). */
  ecrRank: number;
  /** Numeric part of the `pos_rank` string ("RB1" -> 1). */
  positionalRank: number | null;
  tier: number | null;
  byeWeek: number | null;
}

/** One immutable-per-draft ECR snapshot (AC-29). */
export interface EcrSnapshot {
  /** The URL it came from, shown in the pre-draft check (AC-22). */
  source: string;
  /** FantasyPros' own scoring label, e.g. "HALF". */
  scoring: string;
  season: number;
  /** ISO timestamp from `last_updated_ts`; the age the staleness check measures (AC-22). */
  capturedAt: string | null;
  entries: EcrEntry[];
}

// ---------------------------------------------------------------------------------------
// ADP — Fantasy Football Calculator
// ---------------------------------------------------------------------------------------

/** One player row from FFC's ADP feed. Its `player_id` is FFC-internal and joins nothing. */
export interface AdpEntry {
  ffcPlayerId: number;
  playerName: string;
  position: Position;
  team: string | null;
  adp: number;
  timesDrafted: number;
}

/** One immutable-per-draft ADP snapshot (AC-29). */
export interface AdpSnapshot {
  source: string;
  /** FFC's own scoring label, e.g. "Half-PPR". */
  scoring: string;
  /** The attached league's real team count. */
  teamCountRequested: number;
  /** The pool actually fetched — may differ, since FFC only publishes some sizes (AC-24). */
  teamCountUsed: number;
  /** True when `teamCountUsed === teamCountRequested`. */
  exactPool: boolean;
  /** Human-readable pool summary for the pre-draft check (AC-24). */
  poolDescription: string;
  rounds: number;
  totalDrafts: number;
  /** ISO date of the draft window's last day (AC-22). */
  capturedAt: string | null;
  entries: AdpEntry[];
}

// ---------------------------------------------------------------------------------------
// Player-ID crosswalk — dynastyprocess/data db_playerids.csv
// ---------------------------------------------------------------------------------------

/** One crosswalk row, with the CSV's `"NA"` sentinel already normalized to null. */
export interface CrosswalkRow {
  fantasyProsId: string | null;
  sleeperId: string | null;
  /** nflverse's player key — T9's game-log join key. */
  gsisId: string | null;
  name: string;
  /** The file's own pre-normalized name, e.g. "jahmyr gibbs". */
  mergeName: string;
  position: string | null;
  team: string | null;
}

export interface Crosswalk {
  rows: CrosswalkRow[];
  /** ECR -> Sleeper: the verified primary join path. */
  byFantasyProsId: Map<string, CrosswalkRow>;
  /** nflverse -> Sleeper: T9 imports this loader rather than re-fetching the CSV. */
  byGsisId: Map<string, CrosswalkRow>;
  fetchedAt: string;
  /** True when the download failed and a past-TTL local copy was served instead. */
  fromStaleCache: boolean;
}

// ---------------------------------------------------------------------------------------
// Sleeper player dump — the narrowest shape matching needs
// ---------------------------------------------------------------------------------------

/**
 * The fields of a `/v1/players/nfl` record FR-4 actually reads. Declared structurally and
 * narrowly on purpose: T2 owns the Sleeper client and its richer record type, and any
 * superset of these fields satisfies this interface without the two tasks sharing a file.
 *
 * Team defenses are pseudo-players keyed by team abbreviation (`"HOU"`), carry
 * `position: "DEF"`, and have no `full_name` — hence every field below is optional.
 */
export interface SleeperPlayerRecord {
  player_id?: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  search_full_name?: string | null;
  position?: string | null;
  fantasy_positions?: string[] | null;
  team?: string | null;
  active?: boolean | null;
}

// ---------------------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------------------

/** How a snapshot entry reached its Sleeper player (AC-25). */
export type MatchMethod = 'crosswalk-id' | 'normalized-name' | 'team-defense';

/**
 * One snapshot entry successfully joined to a Sleeper player.
 *
 * Almost always an ECR row with its ADP attached — but `ecrRank` is nullable because the other
 * case is real: an ADP row for a position the ECR snapshot does not rank at all. That is AC-23's
 * degenerate cheat sheet and AC-50's K/DST fallback, and {@link AdpOnlyPlayer} is its shape.
 * Everything ECR-ordered travels as {@link EcrMatchedPlayer} instead, so the board keeps its
 * "every row has a rank" guarantee without every consumer re-checking for null.
 */
export interface MatchedPlayer {
  /** The canonical id everywhere downstream — Sleeper's own `player_id`. */
  sleeperPlayerId: string;
  playerName: string;
  position: Position;
  team: string | null;
  /** Overall ECR rank, or null on a row the ECR snapshot does not carry at all (AC-50). */
  ecrRank: number | null;
  positionalRank: number | null;
  /**
   * The player's **positional** tier, from their position's own cheat sheet (amended
   * 2026-09-01 — the overall board's cross-position tiers are ignored; the user drafts on
   * positional runs). Null when that position's tier page was unavailable, and always null
   * for K/DST (🔶 AS-7 — their pages are never fetched for the engine).
   */
  tier: number | null;
  byeWeek: number | null;
  /** FFC ADP for the pool used, or null when the ADP snapshot has no row for them (AC-26). */
  adp: number | null;
  adpMissing: boolean;
  /**
   * 1-based sampling order within this player's position (AC-26). Players with an ADP are
   * ranked by ADP; players without fall back to their ECR order within the position.
   */
  samplingRank: number;
  matchedBy: MatchMethod;
  /** The ECR row's own FantasyPros id; null on a row that came from the ADP feed alone. */
  fantasyProsId: number | null;
}

/** A matched player the ECR snapshot ranks — every row of the ECR-ordered board (🔶 AS-8). */
export type EcrMatchedPlayer = MatchedPlayer & { ecrRank: number; fantasyProsId: number };

/**
 * A matched player the ECR snapshot does not carry at all, resolved from the ADP feed alone.
 *
 * Exists for AC-50's "falling back to ADP order when the snapshot carries no K/DST rankings":
 * the K/DST filter is the one surface that may show these. They are never part of the ECR-ordered
 * list, the simulation universe or the highlight — an unranked player has no place in an order
 * FantasyPros defines.
 */
export type AdpOnlyPlayer = MatchedPlayer & {
  ecrRank: null;
  positionalRank: null;
  tier: null;
  fantasyProsId: null;
  adp: number;
};

/** A snapshot entry that reached no Sleeper player, from either source (AC-25). */
export interface UnmatchedEntry {
  name: string;
  position: string | null;
  source: 'ecr' | 'adp';
}

export interface MatchCounts {
  ecrTotal: number;
  matchedByCrosswalkId: number;
  matchedByName: number;
  matchedByTeamDefense: number;
  unmatchedEcr: number;
  unmatchedAdp: number;
}

export interface MatchResult {
  /** Matched players in raw ECR order (🔶 AS-8). */
  players: EcrMatchedPlayer[];
  byPlayerId: Map<string, EcrMatchedPlayer>;
  /**
   * Players the ADP feed carries and the ECR feed does not, grouped by position and in ADP order
   * within each — the supply for AC-50's K/DST fallback. Deliberately a separate list: adding them
   * to `players` would put unranked rows in an ECR-ordered board.
   */
  adpOnlyPlayers: AdpOnlyPlayer[];
  /** Excluded from the candidate list and the simulation (AC-25). */
  unmatched: UnmatchedEntry[];
  /** Matched but with no ADP number — deliberately a different list from `unmatched` (AC-26). */
  playersMissingAdp: { playerId: string; name: string }[];
  counts: MatchCounts;
}

// ---------------------------------------------------------------------------------------
// The per-attach bundle
// ---------------------------------------------------------------------------------------

/**
 * Everything FR-4 ingests for one attached draft, loaded once and held immutable for that
 * draft's lifetime (AC-29). `ecr`/`adp` are null when their fetch failed — board sync,
 * rosters and the pick feed keep running regardless (AC-28).
 */
export interface SnapshotBundle {
  ecr: EcrSnapshot | null;
  ecrError: string | null;
  /**
   * Positions whose positional-tier page failed, with why (amended 2026-09-01) — the pre-draft
   * check's warning source. Empty when all four skill-position pages supplied tiers.
   */
  positionalTierErrors: Partial<Record<'QB' | 'RB' | 'WR' | 'TE', string>>;
  adp: AdpSnapshot | null;
  adpError: string | null;
  crosswalk: Crosswalk;
  matching: MatchResult;
  loadedAt: string;
}
