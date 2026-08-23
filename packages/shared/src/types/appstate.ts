import type { BoardPlayerState, PickFeedEntry, Team } from './board';
import type { CandidateListData } from './candidate';
import type { Insight } from './insight';
import type { DraftWindow, OpponentPanelEntry } from './opponent';
import type { RosterPanelData } from './roster';
import type { ParameterValues } from '../config/parameters';

/**
 * FR-1 attach state. `needs-manual-slot` is a first-class state, not a crash or a default
 * guess: it blocks mine-vs-opponent, next-pick and survival output until the user picks a
 * slot (AC-5). `error` keeps the failure explicit and retryable without discarding input (AC-7).
 */
export interface AttachState {
  status: 'not-attached' | 'attaching' | 'attached' | 'needs-manual-slot' | 'error';
  draftId?: string;
  /** True for a mock draft (`league_id: null`, ✅ AS-1). */
  isMock?: boolean;
  /** The user's own seat, once resolved from `draft_order` or picked manually (AC-5). */
  userTeamId?: string;
  error?: string;
}

/** One warning line on the pre-draft check surface (FR-4). */
export interface PreDraftWarning {
  code:
    | 'snapshot-stale'
    | 'kdst-missing'
    | 'adp-pool-substituted'
    | 'scoring-format-mismatch'
    | 'no-ecr-loaded'
    /**
     * FR-11's local nflverse cache was never built (`npm run prep:nflverse`), so every player
     * card will report "no NFL game data". Added by the orchestrator alongside FR-4's own
     * warnings — the pre-draft check is the one surface that answers "is this instance ready?".
     */
    | 'gamelog-cache-missing';
  message: string;
}

/** Provenance for one ingested snapshot, shown in the pre-draft check (AC-22, AC-24). */
export interface SnapshotInfo {
  source: string;
  capturedAt: string | null;
  ageHours: number | null;
  /** Whichever ADP pool was actually used, named when no exact team-count match exists (AC-24). */
  poolDescription?: string;
}

/**
 * The pre-draft check surface (FR-4): snapshot ages, matching results, league settings summary
 * and warnings — everything the user confirms before insights render.
 */
export interface PreDraftCheckData {
  ecrSnapshot: SnapshotInfo | null;
  adpSnapshot: SnapshotInfo | null;
  /** Snapshot entries that matched no Sleeper player; excluded from candidates/sim (AC-25). */
  unmatchedEntries: { name: string; position: string | null; source: 'ecr' | 'adp' }[];
  /** Matched players carrying no ADP number — a distinct case from unmatched (AC-26). */
  playersMissingAdp: { playerId: string; name: string }[];
  warnings: PreDraftWarning[];
  leagueSummary: {
    teamCount: number;
    scoringType: string;
    rounds: number;
  } | null;
}

/** Read-only projection of the active config for the pre-draft check display (`GET /api/config`). */
export type PublicConfig = ParameterValues;

/**
 * FR-6's payload: the window itself plus one row per pick in it.
 *
 * The window travels with its rows because AC-34's surface *is* the window — the caption above
 * the rows ("3 picks until your turn", "nothing between now and your next pick") is read off
 * these anchors, and re-deriving them client-side would be a second chance to get the
 * off-by-one wrong. An empty `entries` with a null `nextUserPickNo` means "no pick left"; an
 * empty `entries` while `attach.status` is `needs-manual-slot` means the seat is unresolved.
 */
export interface OpponentPanelData {
  window: DraftWindow;
  entries: OpponentPanelEntry[];
}

/** FR-2's sync surface — the sync indicator plus the draft's own status (AC-14, AC-16). */
export interface SyncState {
  lastSuccessfulSyncAt: string | null;
  status: 'healthy' | 'degraded';
  boardVersion: number;
  /** Sleeper's own `pre_draft` / `drafting` / `complete`, displayed while paused (AC-14). */
  draftStatus: string | null;
  /** What went wrong, while degraded — null while healthy (AC-17). */
  degradedReason: string | null;
}

/**
 * The one SSE payload shape. The server computes this whole object after every poll/recompute
 * and pushes it entire; the browser replaces its state wholesale, never merging field by field.
 *
 * Shape locked here in T1 so the frontend tasks can build against it; T10 finalizes the
 * per-field detail and is the source of truth if the two ever disagree.
 *
 * Every `Insight<T>` carries the board version its `data` was computed from. An insight whose
 * version is behind `sync.boardVersion` is marked `recomputing` — stale, still shown, never
 * presented as current (AC-21).
 */
export interface AppStateSnapshot {
  attach: AttachState;
  sync: SyncState;
  board: {
    players: Record<string, BoardPlayerState>;
    teams: Team[];
  };
  pickFeed: PickFeedEntry[];
  userRoster: Insight<RosterPanelData | null>;
  opponentPanel: Insight<OpponentPanelData>;
  candidateList: Insight<CandidateListData>;
  preDraftCheck: PreDraftCheckData | null;
  config: PublicConfig;
}
