/**
 * The integration point — every module below wired into one `AppStateSnapshot` and pushed whole.
 *
 * Three rules shape everything here.
 *
 *  1. **Full-state-replace.** The server computes one snapshot after every poll or recompute and
 *     broadcasts the whole thing; the browser replaces its state wholesale. There is no field-level
 *     patching anywhere on the wire, so there is no client-side merge to get wrong and no second
 *     channel that can disagree with what is on screen.
 *  2. **Burst-final recompute, recomputing in the interim.** A poll that brings new picks arms a
 *     🔶 `burstDebounceMs` timer instead of recomputing on the spot; the T5→T6→T7→T8 cascade runs
 *     once, when the burst settles (AC-46, AC-53). Until it does, every insight whose recorded
 *     board version is behind the board's is marked `recomputing` — its stale data stays on screen,
 *     flagged, never blanked and never presented as current (AC-21).
 *  3. **Recomputing and degraded are different states.** `recomputing` says "the board is trusted,
 *     this derived view is catching up"; `degraded` says "the board itself cannot be trusted"
 *     (AC-17, AC-48). Both ride on every `Insight<T>`; neither is ever collapsed into the other.
 */
import { NO_NEED_SIGNAL, POSITIONS, freshInsight, isSkillPosition } from '@sidekick/shared';
import type {
  AppStateSnapshot,
  AttachState,
  CandidateListData,
  CandidateRow,
  Insight,
  OpponentPanelData,
  PickFeedEntry,
  PlayerCard,
  Position,
  PreDraftCheckData,
  RosterPanelData,
} from '@sidekick/shared';

import type { SidekickConfig } from './config/loadConfig';
import type { GameLogStore } from './gamelogs/store';
import { Observability } from './observability';
import type { LagSummary, ObservabilitySample } from './observability';
import { buildPickSequence, computeOpponentPanel, countRemainingPicks } from './opponent/window';
import {
  applyEndgameKdstOverride,
  candidateSimulationIds,
  computeCandidateList,
  filterCandidateRows,
} from './recommend/candidates';
import { buildPlayerValueModel } from './recommend/value';
import type { PlayerValueModel } from './recommend/value';
import { resolveLeagueSettings } from './roster/leagueSettings';
import type { LeagueSettings } from './roster/leagueSettings';
import { RosterPanelTracker } from './roster/needvectors';
import { simulateSurvival, toSimulatedPicks } from './simulation/montecarlo';
import { AttachManager } from './sleeper/attach';
import type {
  AttachFailure,
  AttachRequest,
  DraftSession,
} from './sleeper/attach';
import type { SleeperClient } from './sleeper/client';
import { PollIntervalController } from './sleeper/instanceHeartbeat';
import type { DegradedReason, PollOutcome, ResyncResult } from './sleeper/sync';
import { buildPreDraftCheck } from './snapshots/predraftCheck';
import { SnapshotStore } from './snapshots/store';
import type {
  AdpOnlyPlayer,
  EcrMatchedPlayer,
  SleeperPlayerRecord,
  SnapshotBundle,
} from './snapshots/types';
import { TendencyProfileTracker } from './tendencies/profiles';

export interface OrchestratorOptions {
  config: SidekickConfig;
  client: SleeperClient;
  /** FR-11's runtime reader, loaded once at startup (`GameLogStore.fromCacheDir()`). */
  gameLogStore: GameLogStore;
  observability?: Observability;
  snapshotStore?: SnapshotStore;
  intervalController?: PollIntervalController;
  /** Where FR-4's crosswalk cache lives; defaults to the repo's gitignored `data/cache/`. */
  cacheDir?: string;
  now?: () => number;
  /** Start the poll loop on attach. Tests turn this off and drive {@link Orchestrator.pollOnce}. */
  pollingEnabled?: boolean;
  /**
   * How often the sync indicator is re-broadcast while nothing else changes. 0 disables it.
   * See {@link Orchestrator} for why this exists at all.
   */
  syncTickMs?: number;
}

export type AttachOutcome =
  | { ok: true; snapshot: AppStateSnapshot }
  | { ok: false; failure: AttachFailure; snapshot: AppStateSnapshot };

export interface MetricsSummary {
  pickLag: LagSummary | null;
  burstLatency: LagSummary | null;
  samples: readonly ObservabilitySample[];
}

/** Everything scoped to one attached draft. Dropping this reference drops the whole draft (AC-41). */
interface ActiveSession {
  /** When the attach completed — the detach event reports the session's total length from it. */
  attachedAt: number;
  session: DraftSession;
  league: LeagueSettings;
  bundle: SnapshotBundle;
  players: readonly EcrMatchedPlayer[];
  /**
   * AC-50's K/DST fallback supply: the ADP-only rows for a position the ECR snapshot ranks not at
   * all. Resolved once per attach — the snapshot, and therefore which positions it covers, is
   * immutable for this draft's lifetime (AC-29).
   */
  kdstAdpFallback: readonly AdpOnlyPlayer[];
  /**
   * FR-10's value model (amended 2026-08-31): the snapshot's tier structure priced in the
   * league's own scoring via the game-log curves. Built once per attach (AC-29 — snapshot and
   * scoring are immutable per draft); null when the game-log cache was never built, in which
   * case plans are not scored and the pre-draft check says why.
   */
  valueModel: PlayerValueModel | null;
  sleeperPlayers: Record<string, SleeperPlayerRecord>;
  roster: RosterPanelTracker;
  tendencies: TendencyProfileTracker;
  preDraftCheck: PreDraftCheckData;
  unsubscribe: (() => void)[];
}

/** The last cascade's output, plus the board version it was computed from (AC-21's comparand). */
interface InsightCache {
  boardVersion: number;
  userRoster: RosterPanelData | null;
  opponentPanel: OpponentPanelData;
  candidateList: CandidateListData;
}

/** One burst in flight: how many picks it has coalesced and when its latest one was observed. */
interface BurstState {
  pickCount: number;
  finalPickNo: number | null;
  finalPollResponseAt: number;
}

const EMPTY_WINDOW: OpponentPanelData = {
  window: {
    picks: [],
    userOnTheClock: false,
    inProgressPickNo: null,
    currentUserPickNo: null,
    nextUserPickNo: null,
  },
  entries: [],
};

const EMPTY_CANDIDATES: CandidateListData = {
  rows: [],
  highlightPlayerId: null,
  reason: null,
  reasonKind: null,
  planComparison: null,
  disabledReason: null,
};

const SEAT_UNRESOLVED_REASON =
  'Select your draft slot to see the window, survival projections and the recommendation.';

const emptyInsights = (): InsightCache => ({
  boardVersion: 0,
  userRoster: null,
  opponentPanel: EMPTY_WINDOW,
  candidateList: EMPTY_CANDIDATES,
});

export class Orchestrator {
  private readonly options: OrchestratorOptions;
  private readonly config: SidekickConfig;
  private readonly attachManager: AttachManager;
  private readonly snapshots: SnapshotStore;
  private readonly observability: Observability;
  private readonly gameLogStore: GameLogStore;
  private readonly now: () => number;

  private active: ActiveSession | null = null;
  private insights: InsightCache = emptyInsights();
  private listeners = new Set<(snapshot: AppStateSnapshot) => void>();

  private burst: BurstState | null = null;
  /**
   * The last recompute cascade's failure, held until one succeeds — see {@link settleBurst}.
   *
   * Kept here rather than pushed into `BoardSync`'s own degraded state on purpose: the board is
   * not the thing that failed, and marking it degraded would put the poll loop into AC-17's full
   * re-ingest mode over a fault that has nothing to do with Sleeper.
   */
  private cascadeFailure: DegradedReason | null = null;
  private burstTimer: NodeJS.Timeout | null = null;
  private syncTimer: NodeJS.Timeout | null = null;
  private lastSyncSignature: string | null = null;
  private recomputes = 0;
  /** Depth of {@link Orchestrator.coalesce}; broadcasts are held while it is above zero. */
  private suspended = 0;
  private deferredBroadcast = false;

  constructor(options: OrchestratorOptions) {
    this.options = options;
    this.config = options.config;
    this.observability = options.observability ?? new Observability();
    this.gameLogStore = options.gameLogStore;
    this.snapshots = options.snapshotStore ?? new SnapshotStore();
    this.now = options.now ?? Date.now;

    this.attachManager = new AttachManager({
      client: options.client,
      config: options.config,
      observability: this.observability,
      intervalController:
        options.intervalController ?? new PollIntervalController({ config: options.config }),
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  }

  /** How many cascades have completed. A test seam, and the counter AC-46's "once per burst" is about. */
  get recomputeCount(): number {
    return this.recomputes;
  }

  // -------------------------------------------------------------------------------------------
  // Broadcast
  // -------------------------------------------------------------------------------------------

  /**
   * Registers a listener for every state change. The SSE hub is the only production caller; it
   * serializes once and writes the same bytes to every connected tab (AC-15).
   */
  subscribe(listener: (snapshot: AppStateSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private broadcast(): void {
    if (this.suspended > 0) {
      this.deferredBroadcast = true;
      return;
    }
    const snapshot = this.snapshot();
    this.lastSyncSignature = syncSignature(snapshot);
    for (const listener of this.listeners) listener(snapshot);
  }

  /**
   * Runs `work` as one atomic state change, publishing at most one snapshot at the end of it.
   *
   * Needed wherever a single user action moves two things that must agree. Choosing a seat (AC-5)
   * is the case: `BoardSync.setUserSlot` re-derives the board and fires its change event *before*
   * the cascade has rebuilt the panels for the new seat, and that intermediate state carries the
   * new seat beside the old seat's insights at an unchanged board version — so it would be
   * broadcast looking current, which is exactly the staleness the constitution forbids. Coalescing
   * means no listener ever observes it.
   */
  private coalesce(work: () => void): void {
    this.suspended += 1;
    try {
      work();
    } finally {
      this.suspended -= 1;
      if (this.suspended === 0 && this.deferredBroadcast) {
        this.deferredBroadcast = false;
        this.broadcast();
      }
    }
  }

  // -------------------------------------------------------------------------------------------
  // The snapshot
  // -------------------------------------------------------------------------------------------

  /** The whole current state, rebuilt from the live modules each time it is asked for. */
  snapshot(): AppStateSnapshot {
    const attach: AttachState = this.attachManager.attachState();
    const active = this.active;

    if (active === null) {
      return {
        attach,
        sync: {
          lastSuccessfulSyncAt: null,
          status: 'healthy',
          boardVersion: 0,
          draftStatus: null,
          degradedReason: null,
        },
        board: { players: {}, teams: [] },
        pickFeed: [],
        userRoster: freshInsight(null, 0),
        opponentPanel: freshInsight(EMPTY_WINDOW, 0),
        candidateList: freshInsight(EMPTY_CANDIDATES, 0),
        preDraftCheck: null,
        config: this.config,
      };
    }

    const sync = active.session.sync;
    const indicator = sync.syncIndicator;
    // Two independent ways the derived views stop being trustworthy: the board itself went
    // degraded (AC-17), or the cascade that builds them threw (AC-48). Either one means nothing
    // derived may be presented as current, so they collapse into one flag on the wire.
    const degraded = indicator.status === 'degraded' || this.cascadeFailure !== null;
    // AC-21, stated structurally: an insight computed from an older board is by definition not
    // current. That single comparison covers both halves of §T10's rule — a cascade still
    // debounced and a cascade in flight are both "the board moved, this view has not caught up".
    const recomputing = this.insights.boardVersion < indicator.boardVersion;
    const stamp = <T>(data: T): Insight<T> => ({
      data,
      boardVersion: this.insights.boardVersion,
      recomputing,
      degraded,
    });

    return {
      attach,
      sync: {
        lastSuccessfulSyncAt: indicator.lastSuccessfulSyncAt,
        status: degraded ? 'degraded' : 'healthy',
        boardVersion: indicator.boardVersion,
        draftStatus: sync.state.meta.status,
        degradedReason: sync.degradedReason?.message ?? this.cascadeFailure?.message ?? null,
      },
      board: sync.state.board,
      pickFeed: sync.state.pickFeed,
      userRoster: stamp(this.insights.userRoster),
      opponentPanel: stamp(this.insights.opponentPanel),
      candidateList: stamp(this.insights.candidateList),
      preDraftCheck: active.preDraftCheck,
      config: this.config,
    };
  }

  // -------------------------------------------------------------------------------------------
  // Attach (FR-1) and its one-time setup
  // -------------------------------------------------------------------------------------------

  async attach(request: AttachRequest): Promise<AttachOutcome> {
    this.observability.recordEvent('attach-requested', { input: request.input });
    const result = await this.attachManager.attach(request);
    if (!result.ok) {
      this.observability.recordEvent('attach-failed', {
        kind: result.failure.kind,
        message: result.failure.message,
      });
      this.broadcast();
      return { ok: false, failure: result.failure, snapshot: this.snapshot() };
    }

    try {
      await this.startSession(result.session);
    } catch (error) {
      // A session that cannot be stood up must not be left half-wired: tear it back down and
      // report the failure the same way a failed ingest would.
      this.attachManager.detach();
      this.active = null;
      this.insights = emptyInsights();
      this.cascadeFailure = null;
      this.observability.recordEvent('attach-failed', {
        kind: 'unknown',
        message: (error as Error).message,
        stack: (error as Error).stack ?? null,
      });
      this.observability.setDraftId(null);
      this.broadcast();
      return {
        ok: false,
        failure: {
          kind: 'unknown',
          message: (error as Error).message,
          input: request.input,
        },
        snapshot: this.snapshot(),
      };
    }

    this.recordAttachSucceeded();
    this.broadcast();
    return { ok: true, snapshot: this.snapshot() };
  }

  /** The one-per-attach trace record of what this session actually is and started from. */
  private recordAttachSucceeded(): void {
    const active = this.active;
    if (active === null) return;
    const state = active.session.sync.state;
    this.observability.recordEvent('attach-succeeded', {
      draftId: state.meta.draftId,
      isMock: state.meta.isMock,
      draftStatus: state.meta.status,
      draftType: state.meta.type,
      season: state.meta.season,
      teamCount: state.meta.teamCount,
      rounds: state.meta.rounds,
      userTeamId: state.userTeamId,
      picksAlreadyMade: state.pickFeed.length,
      matchedPlayers: active.players.length,
      adpOnlyPlayers: active.bundle.matching.adpOnlyPlayers.length,
      teams: state.teams.map((team) => ({
        teamId: team.teamId,
        draftSlot: team.draftSlot,
        name: team.displayName ?? team.ownerDisplayName,
        isBotSeat: team.isBotSeat,
      })),
      // The whole pre-draft check rides along: snapshot ages, sources, scoring divergence and
      // every warning — the exact "what did the instance know at the start" record.
      preDraftCheck: active.preDraftCheck,
    });
  }

  /** AC-5's manual slot choice, once the user's id was not found in `draft_order`. */
  selectSlot(draftSlot: number): AttachOutcome {
    let result!: ReturnType<AttachManager['selectSlot']>;
    this.coalesce(() => {
      result = this.attachManager.selectSlot(draftSlot);
      // The seat changes who "mine" is, so every derived view changes with it — recompute inside
      // the same coalesced window rather than waiting for the next pick to land.
      if (result.ok) this.recompute();
      this.observability.recordEvent('slot-selected', {
        draftSlot,
        ok: result.ok,
        ...(result.ok
          ? { userTeamId: this.active?.session.sync.state.userTeamId ?? null }
          : { failureKind: result.failure.kind }),
      });
      this.broadcast();
    });

    if (!result.ok) {
      return { ok: false, failure: result.failure, snapshot: this.snapshot() };
    }
    return { ok: true, snapshot: this.snapshot() };
  }

  private async startSession(session: DraftSession): Promise<void> {
    const { client } = this.options;
    const meta = session.sync.state.meta;

    // From here every sample belongs to this draft. Set before the first recompute so even the
    // opening cascade's trace record is attributed.
    this.observability.setDraftId(meta.draftId);

    // FR-5: read the league's own settings once per attach. Scoring resolves here too, so FR-11's
    // game-log scorer and FR-4's format warning read the one answer (AC-30, AC-64).
    const league = await resolveLeagueSettings(meta, {
      client,
      timeoutMs: this.config.initialIngestTimeoutMs,
    });

    // FR-4: both snapshots, fetched exactly once, frozen for this draft's lifetime (AC-29).
    const sleeperPlayers = (await client.getPlayers({
      timeoutMs: this.config.initialIngestTimeoutMs,
    })) as Record<string, SleeperPlayerRecord>;

    this.snapshots.reset();
    // The three snapshot hosts are third parties with no contract with us, and this runs with
    // `POST /api/attach` held open. Unbounded, they inherit undici's ~300 s defaults, so one slow
    // host hangs attach with nothing on screen to explain it. Bounded, an overrun lands in the
    // pre-draft check's existing `ecrError`/`adpError` warnings and attach completes inside AC-1's
    // budget — the crosswalk keeps its own fallback to a cached copy. One signal covers all three
    // because 🔶 `snapshotFetchTimeoutMs` budgets the load, not each request within it.
    const bundle = await this.snapshots.load({
      leagueTeamCount: league.teamCount,
      season: Number(meta.season),
      sleeperPlayers,
      config: this.config,
      signal: AbortSignal.timeout(this.config.snapshotFetchTimeoutMs),
      ...(this.options.cacheDir === undefined ? {} : { cacheDir: this.options.cacheDir }),
    });

    const players = bundle.matching.players;
    // AC-20: from here on, a drafted player the snapshot never matched is flagged in the feed.
    session.sync.setMatchedPlayerIds(new Set(players.map((player) => player.sleeperPlayerId)));

    const resolvePosition = (playerId: string): Position | null => {
      const matched = bundle.matching.byPlayerId.get(playerId);
      return matched?.position ?? null;
    };

    const roster = new RosterPanelTracker({
      sync: session.sync,
      flexEligiblePositions: this.config.flexEligiblePositions,
      observability: this.observability,
      resolvePosition,
    });
    const tendencies = new TendencyProfileTracker({
      sync: session.sync,
      players,
      adpFor: (playerId) => bundle.matching.byPlayerId.get(playerId)?.adp ?? null,
      config: this.config,
      resolvePosition,
    });

    const preDraftCheck = this.buildPreDraftCheck(bundle, league);

    // FR-10's value model: league-scored historical curves flattened over the snapshot's tiers.
    const curves = this.gameLogStore.positionalPointCurves(league.scoring.settings);
    const valueModel = curves === null ? null : buildPlayerValueModel(players, curves);

    // AC-50: when the cheat sheet ships without kickers or defenses (AC-23's warning case), the
    // K/DST filter falls back to ADP order. Skill positions never do — the list proper is
    // ECR-ordered, so an unranked skill player has no row to fall back into.
    const rankedPositions = new Set(players.map((player) => player.position));
    const kdstAdpFallback = bundle.matching.adpOnlyPlayers.filter(
      (player) => !isSkillPosition(player.position) && !rankedPositions.has(player.position),
    );

    this.active = {
      attachedAt: this.now(),
      session,
      league,
      bundle,
      players,
      kdstAdpFallback,
      valueModel,
      sleeperPlayers,
      roster,
      tendencies,
      preDraftCheck,
      unsubscribe: [
        session.sync.onNewPicks((picks) => {
          this.onNewPicks(picks);
        }),
        session.sync.onChange(() => {
          this.onBoardChange();
        }),
      ],
    };
    this.insights = emptyInsights();
    this.cascadeFailure = null;
    roster.start();

    // The first cascade runs immediately: attaching mid-draft is just "the first poll", and the
    // opening snapshot must be complete rather than a board with three empty panels beside it.
    this.recompute();

    if (this.options.pollingEnabled !== false) session.sync.start();
    this.startSyncTicker();
  }

  /**
   * FR-4's pre-draft check, plus the one line FR-11 contributes: an instance whose nflverse cache
   * was never built will answer every player card with "no NFL game data", and the pre-draft check
   * is the surface that answers "is this instance ready to draft with?" (T9's handoff).
   */
  private buildPreDraftCheck(bundle: SnapshotBundle, league: LeagueSettings): PreDraftCheckData {
    const check = buildPreDraftCheck({
      bundle,
      league: {
        teamCount: league.teamCount,
        scoringType: league.scoring.scoringType ?? '(none)',
        rounds: league.rounds,
        // AC-27 compares the settings, not the label. `resolveScoring` already says whether this
        // dict is the league's own or one of the named fallback tables (AC-30).
        scoring: { source: league.scoring.source, settings: league.scoring.settings },
      },
      config: this.config,
    });

    if (!this.gameLogStore.isLoaded) {
      check.warnings = [
        ...check.warnings,
        {
          code: 'gamelog-cache-missing',
          message:
            `${this.gameLogStore.reason ?? 'The local nflverse game-log cache is missing.'} ` +
            'Player cards will report no NFL game data, and the recommendation cannot score ' +
            'two-pick plans (tier/value lookahead) until it is built.',
        },
      ];
    }

    return check;
  }

  // -------------------------------------------------------------------------------------------
  // The poll → burst → recompute cascade
  // -------------------------------------------------------------------------------------------

  /** One out-of-loop poll. The poll loop itself is `BoardSync`'s; this is for callers driving it. */
  async pollOnce(): Promise<PollOutcome | null> {
    return this.active === null ? null : this.active.session.sync.pollOnce();
  }

  /**
   * A poll brought new picks.
   *
   * The recompute is *not* run here: it is debounced by 🔶 `burstDebounceMs`, so a run of picks
   * landing together recomputes once, timed from the burst's final pick (AC-46, AC-53). The board
   * itself is already current — only the derived insights wait, and they say so.
   */
  private onNewPicks(picks: readonly PickFeedEntry[]): void {
    if (picks.length === 0) return;

    const finalPollResponseAt = this.observability.lastPollResponseAt() ?? this.now();
    this.burst = {
      pickCount: (this.burst?.pickCount ?? 0) + picks.length,
      finalPickNo: picks.at(-1)?.pickNo ?? this.burst?.finalPickNo ?? null,
      finalPollResponseAt,
    };

    if (this.burstTimer !== null) clearTimeout(this.burstTimer);
    this.burstTimer = setTimeout(() => {
      this.burstTimer = null;
      this.settleBurst();
    }, this.config.burstDebounceMs);
    this.burstTimer.unref?.();
  }

  /**
   * The burst went quiet: run the cascade once, record AC-67's sample, and push the result.
   *
   * The try/catch is the containment `BoardSync.tick()` already established one layer down. Both
   * callers reach here from a place a throw cannot survive — the debounce `setTimeout` callback,
   * where an escaping exception reaches the event loop and exits the process, and `flushBurst()`
   * inside the Re-sync route's promise, where it becomes an unhandled rejection and does the same.
   * The cascade is genuinely fail-fast in places (`simulateSurvival` throws on a picks/window
   * mismatch rather than sampling a wrong window), so "it threw" has to mean something other than
   * "the draft is over": the board is untouched and keeps updating, and the views derived from it
   * go degraded with the reason attached until a later cascade succeeds (AC-17, AC-48).
   */
  private settleBurst(): void {
    const burst = this.burst;
    this.burst = null;
    const active = this.active;
    if (active === null) return;

    try {
      this.recompute();
      this.cascadeFailure = null;
    } catch (error) {
      const message = `The recompute cascade failed: ${(error as Error).message}`;
      this.cascadeFailure = { kind: 'recompute-failed', message };
      // Contained, not swallowed: AC-66's sink is where an operator sees this happened at all.
      this.observability.recordCascadeFailed({
        boardVersion: active.session.sync.syncIndicator.boardVersion,
        message,
        stack: (error as Error).stack ?? null,
      });
      this.broadcast();
      return;
    }

    if (burst !== null) {
      this.observability.recordBurstRefreshed({
        pickCount: burst.pickCount,
        finalPickNo: burst.finalPickNo,
        burstFinalPollResponseAt: burst.finalPollResponseAt,
      });
    }
    this.broadcast();
  }

  /**
   * Settles whatever is pending right now instead of waiting the debounce out.
   *
   * Used by Re-sync, which is an explicit "refresh this" action: leaving the user looking at a
   * `recomputing` panel after pressing it would be the wrong answer, and a re-ingest that brought
   * picks would otherwise recompute twice — once here and once when the armed timer fired.
   */
  private flushBurst(): void {
    if (this.burstTimer !== null) {
      clearTimeout(this.burstTimer);
      this.burstTimer = null;
    }
    this.settleBurst();
  }

  /**
   * Any other board change — a degraded transition, a recovery re-ingest, a manual seat choice.
   *
   * These broadcast immediately: they change what the sync indicator says, and FR-3's whole point
   * is that the user learns the board is untrustworthy the moment it becomes so. A change that
   * also brought picks has already armed the burst timer, so what goes out here is the
   * `recomputing`-flagged interim state AC-21 describes.
   */
  private onBoardChange(): void {
    const active = this.active;
    if (active === null) return;
    // AC-41: a draft that ends while still attached discards its tendency profiles.
    if (active.session.sync.isComplete) active.tendencies.discard();
    this.broadcast();
  }

  /**
   * The T5 → T6 → T7 → T8 cascade, in the one order T8's handoff fixes:
   * `candidateSimulationIds` → `simulateSurvival(ensureIncluded)` → `computeCandidateList`.
   *
   * Synchronous end to end, so a snapshot taken at any moment is internally consistent: every
   * insight in `InsightCache` is computed from the same board version, never a mix of two.
   */
  private recompute(): void {
    const active = this.active;
    if (active === null) return;

    const { session, roster, tendencies, players } = active;
    const sync = session.sync;
    const state = sync.state;
    const indicator = sync.syncIndicator;
    const degraded = indicator.status === 'degraded';
    const userTeamId = state.userTeamId;
    const picksMade = state.pickFeed.length;
    const startedAt = this.now();

    // FR-6 — the window and its rows, then FR-7's bend on top of them.
    const panel = computeOpponentPanel({
      teamCount: state.meta.teamCount,
      rounds: state.meta.rounds,
      picksMade,
      userTeamId,
      ownerOf: sync.pickOwnerResolver,
      panelFor: (teamId) => roster.panelFor(teamId),
      players,
      board: state.board,
    });
    const entries = tendencies.enrichPanel(panel.entries);
    const panelDoneAt = this.now();

    // FR-8 — the display extension is resolved before the simulation runs (AC-42).
    const ensureIncluded = candidateSimulationIds({
      players,
      board: state.board,
      config: this.config,
    });
    const survival = simulateSurvival({
      window: panel.window,
      picks: toSimulatedPicks(entries),
      players,
      board: state.board,
      config: this.config,
      ensureIncluded,
      degraded,
    });
    const simulationDoneAt = this.now();

    // FR-9/FR-10 — the user's own need vector, never an opponent's.
    const userRoster = roster.userPanel();
    const sequence = buildPickSequence(
      { teamCount: state.meta.teamCount, rounds: state.meta.rounds },
      sync.pickOwnerResolver,
    );
    const userRemainingPicks =
      userTeamId === null ? 0 : (countRemainingPicks(sequence, picksMade).get(userTeamId) ?? 0);
    // The user's own later turns, next first — the fill term's horizon (amended 2026-08-31).
    const nextUserPickNo = panel.window.nextUserPickNo;
    const futureUserPickNos =
      userTeamId === null || nextUserPickNo === null
        ? []
        : sequence
            .filter((pick) => pick.teamId === userTeamId && pick.pickNo >= nextUserPickNo)
            .map((pick) => pick.pickNo);

    // The bench phase's roster totals (FR-9/FR-10 amendment): every pick the user's seat has
    // made, by position — starters and bench together, which is what the caps count against.
    const userRosterCounts: Partial<Record<Position, number>> = {};
    if (userTeamId !== null) {
      for (const entry of state.pickFeed) {
        if (entry.teamId !== userTeamId || entry.position === null) continue;
        userRosterCounts[entry.position] = (userRosterCounts[entry.position] ?? 0) + 1;
      }
    }

    const candidateList =
      userTeamId === null
        ? this.seatUnresolvedList(players, state.board, survival)
        : this.candidateList({
            players,
            board: state.board,
            window: panel.window,
            needVector: userRoster?.needVector ?? NO_NEED_SIGNAL,
            survival,
            valueModel: active.valueModel,
            userRemainingPicks,
            futureUserPickNos,
            unfilledK: userRoster?.unfilledStartingSlots.dedicated.K ?? 0,
            unfilledDst: userRoster?.unfilledStartingSlots.dedicated.DST ?? 0,
            benchPhase: {
              rosterCounts: userRosterCounts,
              slots: state.meta.slots,
              teamCount: state.meta.teamCount,
            },
            // The slot picture rides only while starters are open. Bench picks instead use the
            // roster cap plus team-count/scoring-adjusted replacement values.
            ...(userRoster === undefined ||
            userRoster === null ||
            userRoster.needVector === NO_NEED_SIGNAL
              ? {}
              : {
                  unfilledDedicatedSlots: {
                    QB: userRoster.unfilledStartingSlots.dedicated.QB,
                    RB: userRoster.unfilledStartingSlots.dedicated.RB,
                    WR: userRoster.unfilledStartingSlots.dedicated.WR,
                    TE: userRoster.unfilledStartingSlots.dedicated.TE,
                  },
                  unfilledFlexSlots: userRoster.unfilledStartingSlots.flex,
                }),
          });

    this.insights = {
      boardVersion: indicator.boardVersion,
      userRoster,
      opponentPanel: { window: panel.window, entries },
      candidateList,
    };
    this.recomputes += 1;
    this.recordRecompute({
      boardVersion: indicator.boardVersion,
      picksMade,
      degraded,
      startedAt,
      panelDoneAt,
      simulationDoneAt,
      ensuredCandidates: ensureIncluded.length,
      candidateList,
      userRoster,
      windowLength: panel.window.picks.length,
    });
  }

  /**
   * The per-cascade trace record: how long each stage took, and — the part a post-draft "why did
   * it tell me that" reading needs — exactly what the cascade decided to recommend and from what.
   */
  private recordRecompute(args: {
    boardVersion: number;
    picksMade: number;
    degraded: boolean;
    startedAt: number;
    panelDoneAt: number;
    simulationDoneAt: number;
    ensuredCandidates: number;
    candidateList: CandidateListData;
    userRoster: RosterPanelData | null;
    windowLength: number;
  }): void {
    const finishedAt = this.now();
    const { candidateList } = args;
    const highlightRow =
      candidateList.highlightPlayerId === null
        ? null
        : (candidateList.rows.find(
            (row) => row.playerId === candidateList.highlightPlayerId,
          ) ?? null);
    const round3 = (value: number): number => Math.round(value * 1000) / 1000;

    this.observability.recordEvent('recompute', {
      recomputeSeq: this.recomputes,
      boardVersion: args.boardVersion,
      picksMade: args.picksMade,
      degraded: args.degraded,
      durationMs: finishedAt - args.startedAt,
      phases: {
        opponentPanelMs: args.panelDoneAt - args.startedAt,
        simulationMs: args.simulationDoneAt - args.panelDoneAt,
        candidateListMs: finishedAt - args.simulationDoneAt,
      },
      simulation: {
        runs: this.config.monteCarloRunCount,
        universeSize: this.config.simUniverseSize,
        ensuredCandidates: args.ensuredCandidates,
        windowLength: args.windowLength,
      },
      output: {
        highlightPlayerId: candidateList.highlightPlayerId,
        highlightPlayerName: highlightRow?.playerName ?? null,
        reasonKind: candidateList.reasonKind,
        reason: candidateList.reason,
        disabledReason: candidateList.disabledReason,
        planWinner: candidateList.planComparison?.winner ?? null,
        planTooClose: candidateList.planComparison?.tooClose ?? null,
        topRows: candidateList.rows.slice(0, 10).map((row) => ({
          playerId: row.playerId,
          playerName: row.playerName,
          position: row.position,
          ecrRank: row.ecrRank,
          adp: row.adp,
          survival:
            row.survival === null
              ? null
              : { probability: round3(row.survival.probability), band: row.survival.band },
        })),
      },
      needVector: args.userRoster?.needVector ?? null,
    });
  }

  private candidateList(input: {
    players: readonly EcrMatchedPlayer[];
    board: Parameters<typeof computeCandidateList>[0]['board'];
    window: Parameters<typeof computeCandidateList>[0]['window'];
    needVector: Parameters<typeof computeCandidateList>[0]['needVector'];
    survival: Parameters<typeof computeCandidateList>[0]['survival'];
    valueModel: Parameters<typeof computeCandidateList>[0]['valueModel'];
    userRemainingPicks: number;
    unfilledK: number;
    unfilledDst: number;
    benchPhase: Parameters<typeof computeCandidateList>[0]['benchPhase'];
    unfilledDedicatedSlots?: Parameters<typeof computeCandidateList>[0]['unfilledDedicatedSlots'];
    unfilledFlexSlots?: Parameters<typeof computeCandidateList>[0]['unfilledFlexSlots'];
    futureUserPickNos?: Parameters<typeof computeCandidateList>[0]['futureUserPickNos'];
  }): CandidateListData {
    const list = computeCandidateList({ ...input, config: this.config });
    if (list.disabledReason !== null) return list;

    const rowsByPosition = this.rowsByPosition(input.players, input.board, input.survival);
    // FR-9's endgame guard, applied over the finished list: when the user's remaining picks have
    // caught up with their unfilled K/DST slots, the highlight moves there (AS-7 amendment,
    // 2026-08-27). The guard reads the same per-position rows the AC-50 filter shows.
    return applyEndgameKdstOverride({
      list: { ...list, rowsByPosition },
      userRemainingPicks: input.userRemainingPicks,
      unfilledK: input.unfilledK,
      unfilledDst: input.unfilledDst,
      kdstRows: { K: rowsByPosition.K ?? [], DST: rowsByPosition.DST ?? [] },
      config: this.config,
    });
  }

  /**
   * AC-5 — while the seat is unresolved there is no "my next pick", so there is no window, no
   * survival to project against it, and no honest recommendation to make. The rows themselves are
   * raw ECR order over what is available, which claims nothing about whose turn it is, so they
   * still ship: FR-9's list is not one of the three outputs AC-5 blocks.
   */
  private seatUnresolvedList(
    players: readonly EcrMatchedPlayer[],
    board: Parameters<typeof computeCandidateList>[0]['board'],
    survival: Parameters<typeof computeCandidateList>[0]['survival'],
  ): CandidateListData {
    const list = computeCandidateList({
      players,
      board,
      window: EMPTY_WINDOW.window,
      needVector: NO_NEED_SIGNAL,
      survival,
      valueModel: null,
      userRemainingPicks: 0,
      config: this.config,
    });
    // AC-28's "no rankings loaded" outranks this: there is nothing to list either way.
    if (list.disabledReason !== null) return list;

    return {
      rows: list.rows,
      highlightPlayerId: null,
      reason: null,
      reasonKind: null,
      planComparison: null,
      disabledReason: SEAT_UNRESOLVED_REASON,
      rowsByPosition: this.rowsByPosition(players, board, survival),
    };
  }

  /** AC-50's per-position sets, precomputed so the filter is one interaction and no round trip. */
  private rowsByPosition(
    players: readonly EcrMatchedPlayer[],
    board: Parameters<typeof filterCandidateRows>[0]['board'],
    survival: Parameters<typeof filterCandidateRows>[0]['survival'],
  ): Partial<Record<Position, CandidateRow[]>> {
    // Resolved at attach and constant for the draft (AC-29); empty unless the ECR snapshot ranks
    // no K or DST at all, in which case `filterCandidateRows` sees ADP-only rows and orders this
    // one position by ADP (AC-50).
    const fallback = this.active?.kdstAdpFallback ?? [];
    const byPosition: Partial<Record<Position, CandidateRow[]>> = {};
    for (const position of POSITIONS) {
      const extra = fallback.filter((player) => player.position === position);
      byPosition[position] = filterCandidateRows({
        players: extra.length === 0 ? players : [...players, ...extra],
        board,
        position,
        survival,
        config: this.config,
      });
    }
    return byPosition;
  }

  // -------------------------------------------------------------------------------------------
  // Re-sync, detach, and the rest of the REST surface
  // -------------------------------------------------------------------------------------------

  /** AC-19's Re-sync: an immediate, out-of-cadence full rebuild. */
  async resync(): Promise<ResyncResult | null> {
    const active = this.active;
    if (active === null) return null;

    const result = await active.session.sync.resync();
    // A Re-sync can bring many picks at once. Settling immediately keeps the refresh the user
    // asked for from ending on a `recomputing` panel, and records AC-67's sample once rather
    // than recomputing here and again when the armed debounce fires.
    this.flushBurst();
    this.observability.recordEvent('resync', {
      ok: result.ok,
      durationMs: result.durationMs,
      boardVersion: result.boardVersion,
      ...(result.failure === undefined
        ? {}
        : { failureKind: result.failure.kind, failure: result.failure.message }),
    });
    return result;
  }

  /** AC-41 — everything scoped to the attach dies with it, tendency profiles included. */
  detach(): void {
    const active = this.active;
    if (active !== null) {
      this.observability.recordEvent('detached', {
        draftId: active.session.sync.state.meta.draftId,
        attachedForMs: this.now() - active.attachedAt,
        picksSeen: active.session.sync.state.pickFeed.length,
        recomputes: this.recomputes,
      });
      for (const unsubscribe of active.unsubscribe) unsubscribe();
      active.roster.stop();
      active.tendencies.discard();
    }
    this.attachManager.detach();
    this.snapshots.reset();
    this.active = null;
    this.insights = emptyInsights();
    this.cascadeFailure = null;
    this.clearBurst();
    this.stopSyncTicker();
    this.observability.setDraftId(null);
    this.broadcast();
  }

  /** FR-11's card, scored in the attached league's own settings (AC-64). Null before an attach. */
  playerCard(playerId: string): PlayerCard | null {
    const active = this.active;
    if (active === null) return null;

    const matched = active.bundle.matching.byPlayerId.get(playerId);
    // `playerId` comes straight off the URL, and `sleeperPlayers` is Sleeper's JSON dump — a plain
    // object, so `sleeperPlayers['constructor']` yields an inherited `Object.prototype` member
    // instead of undefined, and the `?? playerId` fallback below never fires. AC-65's contract is
    // that *any* unknown id answers a no-data card, so the read has to be own-property-only.
    const sleeper = Object.hasOwn(active.sleeperPlayers, playerId)
      ? active.sleeperPlayers[playerId]
      : undefined;
    const name = matched?.playerName ?? sleeper?.full_name ?? playerId;

    return this.gameLogStore.getPlayerCard(playerId, {
      scoring: active.league.scoring.settings,
      player: {
        name,
        ...(matched === undefined ? {} : { position: matched.position }),
        team: matched?.team ?? sleeper?.team ?? null,
      },
    });
  }

  /** AC-66/AC-67's samples, for `/api/debug/metrics` and for a rehearsal's own eyeballing. */
  metrics(): MetricsSummary {
    return {
      pickLag: this.observability.pickLagSummary(),
      burstLatency: this.observability.burstLatencySummary(),
      samples: this.observability.samples(),
    };
  }

  /** Stops every timer this instance owns. */
  stop(): void {
    this.clearBurst();
    this.stopSyncTicker();
    this.active?.session.sync.stop();
    this.active?.roster.stop();
  }

  private clearBurst(): void {
    if (this.burstTimer !== null) clearTimeout(this.burstTimer);
    this.burstTimer = null;
    this.burst = null;
  }

  // -------------------------------------------------------------------------------------------
  // AC-16's ticking sync indicator
  // -------------------------------------------------------------------------------------------

  /**
   * Re-broadcasts when a poll succeeded but changed nothing.
   *
   * `BoardSync` deliberately fires `onChange` only when the board actually changes, so between
   * picks — which on a 60-second pick clock is most of a draft — nothing would go out at all and
   * the "last successful sync" reading would sit frozen at the last pick's timestamp. A frozen
   * reading is indistinguishable from a stalled poll loop, which is precisely the state AC-16's
   * indicator exists to make visible. So the ticker compares the sync triple against what was last
   * broadcast and pushes only when it moved: one extra broadcast per otherwise-silent successful
   * poll, and none at all while the loop is stuck.
   */
  private startSyncTicker(): void {
    const intervalMs = this.options.syncTickMs ?? this.config.pollIntervalMs;
    if (intervalMs <= 0) return;

    this.stopSyncTicker();
    this.syncTimer = setInterval(() => {
      if (this.active === null) return;
      if (syncSignature(this.snapshot()) !== this.lastSyncSignature) this.broadcast();
    }, intervalMs);
    this.syncTimer.unref?.();
  }

  private stopSyncTicker(): void {
    if (this.syncTimer !== null) clearInterval(this.syncTimer);
    this.syncTimer = null;
  }
}

const syncSignature = (snapshot: AppStateSnapshot): string =>
  `${snapshot.sync.lastSuccessfulSyncAt ?? '-'}|${snapshot.sync.status}|${snapshot.sync.boardVersion}`;
