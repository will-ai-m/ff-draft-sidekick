import type { BoardPlayerState, PickFeedEntry, Team } from './board';
import type { CandidateListData } from './candidate';
import type { Insight } from './insight';
import type { OpponentPanelEntry } from './opponent';
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
    | 'no-ecr-loaded';
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
 * The one SSE payload shape. The server computes this whole object after every poll/recompute
 * and pushes it entire; the browser replaces its state wholesale, never merging field by field.
 *
 * Shape locked here in T1 so the frontend tasks can build against it; T10 finalizes the
 * per-field detail and is the source of truth if the two ever disagree.
 */
export interface AppStateSnapshot {
  attach: AttachState;
  sync: {
    lastSuccessfulSyncAt: string | null;
    status: 'healthy' | 'degraded';
    boardVersion: number;
  };
  board: {
    players: Record<string, BoardPlayerState>;
    teams: Team[];
  };
  pickFeed: PickFeedEntry[];
  userRoster: Insight<RosterPanelData | null>;
  opponentPanel: Insight<OpponentPanelEntry[]>;
  candidateList: Insight<CandidateListData>;
  preDraftCheck: PreDraftCheckData | null;
  config: PublicConfig;
}
