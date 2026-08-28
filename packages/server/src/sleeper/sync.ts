/**
 * Board sync, integrity and recovery — FR-2 and FR-3.
 *
 * Two rules shape everything here:
 *
 *  - **Stateless full refetch.** Every poll re-fetches the *complete* pick list and the board is
 *    rebuilt wholesale from it. The previous list is compared to the new one only to answer "what
 *    is new" for UI events; it is never the basis of the board itself. Attaching mid-draft (AC-13)
 *    is therefore just "the first poll", with no special case anywhere.
 *  - **Attribution by seat, never by roster.** A mock draft reports `picked_by: ""` and
 *    `roster_id: null`, so every pick is attributed through `draft_slot` + `draft_order`
 *    (✅ AS-1, AC-4). One code path serves mocks and real leagues; traded picks are then resolved
 *    on top of that via `slot_to_roster_id` (AC-12).
 */

import type {
  Board,
  ParameterValues,
  PickFeedEntry,
  Position,
  SlotConfig,
  SyncIndicator,
  Team,
} from '@sidekick/shared';

import type { Observability } from '../observability';
import { SleeperApiError } from './client';
import type {
  SleeperClient,
  SleeperDraft,
  SleeperLeagueUser,
  SleeperPick,
  SleeperTradedPick,
} from './client';
import type { PollIntervalController } from './instanceHeartbeat';

// ---------------------------------------------------------------------------------------------
// Ingest and derivation
// ---------------------------------------------------------------------------------------------

/** Everything one full re-ingest reads. `leagueUsers` is null for a mock: there is no league. */
export interface SleeperIngest {
  draft: SleeperDraft;
  picks: SleeperPick[];
  tradedPicks: SleeperTradedPick[];
  leagueUsers: SleeperLeagueUser[] | null;
}

/** League/draft shape, read from the API only — never from hardcoded format constants (AC-30). */
export interface DraftMeta {
  draftId: string;
  leagueId: string | null;
  /** `league_id === null` is Sleeper's own clean mock detector (✅ AS-1). */
  isMock: boolean;
  /** `pre_draft` / `drafting` / `complete` — displayed while paused or between picks (AC-14). */
  status: string;
  type: string;
  season: string;
  teamCount: number;
  rounds: number;
  slots: SlotConfig;
  /**
   * The draft object's coarse scoring label. A mock carries nothing finer — its `league_id` is
   * null, so there is no `/v1/league/<id>` holding a granular per-stat `scoring_settings` dict.
   * Verified 2026-08-22: no draft object of either kind carries one.
   */
  scoringType: string | null;
}

export interface DerivedDraftState {
  meta: DraftMeta;
  teams: Team[];
  /** The user's own seat, or null while AC-5's manual slot choice is still outstanding. */
  userTeamId: string | null;
  board: Board;
  pickFeed: PickFeedEntry[];
}

export interface DeriveOptions {
  /** Stored Sleeper user id, matched against `draft_order` to find the user's seat (AC-5). */
  userId?: string | null;
  /** A seat the user picked by hand, when auto-detection could not resolve one (AC-5). */
  manualSlot?: number | null;
  /**
   * Sleeper player ids the rankings snapshot matched. `null`/omitted means "no snapshot loaded",
   * in which case nothing is flagged unmatched — board sync, rosters and the pick feed still run
   * (AC-28), and AC-20's warning is reserved for genuine match failures.
   */
  matchedPlayerIds?: ReadonlySet<string> | null;
}

const SLOT_SETTING_KEYS: Readonly<Record<keyof SlotConfig, string>> = {
  QB: 'slots_qb',
  RB: 'slots_rb',
  WR: 'slots_wr',
  TE: 'slots_te',
  FLEX: 'slots_flex',
  K: 'slots_k',
  // Sleeper spells the team-defense slot `slots_def`; the Terms vocabulary spells it DST.
  DST: 'slots_def',
  BN: 'slots_bn',
};

const SLEEPER_POSITIONS: Readonly<Record<string, Position>> = {
  QB: 'QB',
  RB: 'RB',
  WR: 'WR',
  TE: 'TE',
  K: 'K',
  DEF: 'DST',
  DST: 'DST',
};

/** Sleeper's `DEF` is the Terms vocabulary's `DST`; anything non-fantasy maps to null. */
export const mapSleeperPosition = (raw: string | null | undefined): Position | null =>
  raw === null || raw === undefined ? null : (SLEEPER_POSITIONS[raw.toUpperCase()] ?? null);

/** A stable, seat-derived team id, identical for a mock and a real league. */
export const teamIdForSlot = (draftSlot: number): string => `slot-${draftSlot}`;

/**
 * Roster slot structure straight from the draft object's own `settings`.
 *
 * A key that is simply absent means zero slots of that kind — verified live: a real 12-team draft
 * carried no `slots_k` at all. Defaulting an absent key to anything but zero would be exactly the
 * hardcoded format assumption AC-30/AC-32 forbid.
 */
export function deriveSlotConfig(settings: Readonly<Record<string, unknown>>): SlotConfig {
  const read = (key: string): number => {
    const value = settings[key];
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
  };
  return {
    QB: read(SLOT_SETTING_KEYS.QB),
    RB: read(SLOT_SETTING_KEYS.RB),
    WR: read(SLOT_SETTING_KEYS.WR),
    TE: read(SLOT_SETTING_KEYS.TE),
    FLEX: read(SLOT_SETTING_KEYS.FLEX),
    K: read(SLOT_SETTING_KEYS.K),
    DST: read(SLOT_SETTING_KEYS.DST),
    BN: read(SLOT_SETTING_KEYS.BN),
  };
}

/** slot -> user_id, inverted from `draft_order` (which Sleeper keys the other way round). */
const userIdBySlot = (draft: SleeperDraft): Map<number, string> => {
  const map = new Map<number, string>();
  for (const [userId, slot] of Object.entries(draft.draft_order ?? {})) map.set(slot, userId);
  return map;
};

/**
 * Resolves which seat owns the pick made in `round` from board column `draftSlot`.
 *
 * Traded picks are expressed in roster ids, so the hop is
 * `draft_slot -> original roster -> traded_picks -> current roster -> draft_slot` (AC-12). With no
 * trades — or on a mock, which has no rosters to trade with — this is the identity.
 */
export function buildPickOwnerResolver(
  draft: SleeperDraft,
  tradedPicks: readonly SleeperTradedPick[],
): (round: number, draftSlot: number) => string {
  const slotToRoster = draft.slot_to_roster_id ?? null;
  if (slotToRoster === null || tradedPicks.length === 0) {
    return (_round, draftSlot) => teamIdForSlot(draftSlot);
  }

  const rosterToSlot = new Map<number, number>();
  for (const [slot, rosterId] of Object.entries(slotToRoster)) rosterToSlot.set(rosterId, Number(slot));

  return (round, draftSlot) => {
    const originalRoster = slotToRoster[String(draftSlot)];
    if (originalRoster === undefined) return teamIdForSlot(draftSlot);

    const traded = tradedPicks.find((t) => t.round === round && t.roster_id === originalRoster);
    if (traded === undefined) return teamIdForSlot(draftSlot);

    const ownerSlot = rosterToSlot.get(traded.owner_id);
    return ownerSlot === undefined ? teamIdForSlot(draftSlot) : teamIdForSlot(ownerSlot);
  };
}

/** Resolves the user's own seat, preferring an explicit manual choice over auto-detection (AC-5). */
export function resolveUserTeamId(draft: SleeperDraft, options: DeriveOptions): string | null {
  const teamCount = draft.settings.teams;
  const manualSlot = options.manualSlot ?? null;
  if (manualSlot !== null) {
    return manualSlot >= 1 && manualSlot <= teamCount ? teamIdForSlot(manualSlot) : null;
  }

  const userId = options.userId ?? null;
  if (userId === null) return null;
  const slot = (draft.draft_order ?? {})[userId];
  return slot === undefined ? null : teamIdForSlot(slot);
}

/**
 * One `Team` per seat, mocks and real leagues alike. Owner/team names come from the league's users
 * where the API provides them; a seat with no user is a bot or empty seat and is identified by its
 * slot number alone (AC-2).
 */
export function deriveTeams(
  draft: SleeperDraft,
  leagueUsers: readonly SleeperLeagueUser[] | null,
  userTeamId: string | null,
): Team[] {
  const bySlot = userIdBySlot(draft);
  const usersById = new Map((leagueUsers ?? []).map((user) => [user.user_id, user]));
  const slotToRoster = draft.slot_to_roster_id ?? null;

  const teams: Team[] = [];
  for (let draftSlot = 1; draftSlot <= draft.settings.teams; draftSlot += 1) {
    const teamId = teamIdForSlot(draftSlot);
    const userId = bySlot.get(draftSlot) ?? null;
    const leagueUser = userId === null ? undefined : usersById.get(userId);

    teams.push({
      teamId,
      draftSlot,
      displayName: leagueUser?.metadata?.team_name ?? null,
      ownerDisplayName: leagueUser?.display_name ?? null,
      isBotSeat: userId === null || leagueUser?.is_bot === true,
      userId,
      rosterId: slotToRoster?.[String(draftSlot)] ?? null,
      isUser: teamId === userTeamId,
    });
  }
  return teams;
}

const playerNameOf = (pick: SleeperPick): string => {
  const name = [pick.metadata?.first_name, pick.metadata?.last_name]
    .filter((part): part is string => typeof part === 'string' && part.length > 0)
    .join(' ');
  return name.length > 0 ? name : pick.player_id;
};

/** The whole derived picture, rebuilt from the complete pick list every time. */
export function deriveDraftState(ingest: SleeperIngest, options: DeriveOptions = {}): DerivedDraftState {
  const { draft, picks, tradedPicks, leagueUsers } = ingest;
  const userTeamId = resolveUserTeamId(draft, options);
  const ownerOf = buildPickOwnerResolver(draft, tradedPicks);
  const matched = options.matchedPlayerIds ?? null;

  const ordered = [...picks].sort((a, b) => a.pick_no - b.pick_no);
  const players: Board['players'] = {};
  const pickFeed: PickFeedEntry[] = [];

  for (const pick of ordered) {
    const teamId = ownerOf(pick.round, pick.draft_slot);
    players[pick.player_id] = { drafted: true, draftedByTeamId: teamId, pickNo: pick.pick_no };
    pickFeed.push({
      pickNo: pick.pick_no,
      round: pick.round,
      draftSlot: pick.draft_slot,
      teamId,
      playerId: pick.player_id,
      playerName: playerNameOf(pick),
      position: mapSleeperPosition(pick.metadata?.position),
      isUserPick: userTeamId !== null && teamId === userTeamId,
      matchedToSnapshot: matched === null || matched.has(pick.player_id),
    });
  }

  const teams = deriveTeams(draft, leagueUsers, userTeamId);

  return {
    meta: {
      draftId: draft.draft_id,
      leagueId: draft.league_id ?? null,
      isMock: (draft.league_id ?? null) === null,
      status: draft.status,
      type: draft.type,
      season: draft.season,
      teamCount: draft.settings.teams,
      rounds: draft.settings.rounds,
      slots: deriveSlotConfig(draft.settings),
      scoringType: draft.metadata?.scoring_type ?? null,
    },
    teams,
    userTeamId,
    board: { players, teams },
    pickFeed,
  };
}

// ---------------------------------------------------------------------------------------------
// Integrity (AC-17)
// ---------------------------------------------------------------------------------------------

export type IntegrityFailure =
  | { kind: 'pick-count-decreased'; previous: number; received: number; message: string }
  | { kind: 'pick-changed'; pickNo: number; field: 'player' | 'team'; message: string }
  | { kind: 'pick-out-of-sequence'; expected: number; received: number; message: string };

/**
 * The three data-inconsistency signals AC-17 enumerates. A response failing any of them is treated
 * exactly like a failed HTTP call: degrade, retry, apply nothing.
 */
export function checkPickListIntegrity(
  previous: readonly SleeperPick[] | null,
  received: readonly SleeperPick[],
): IntegrityFailure | null {
  if (previous !== null && received.length < previous.length) {
    return {
      kind: 'pick-count-decreased',
      previous: previous.length,
      received: received.length,
      message: `Sleeper returned ${received.length} picks after previously reporting ${previous.length}.`,
    };
  }

  const ordered = [...received].sort((a, b) => a.pick_no - b.pick_no);
  for (let index = 0; index < ordered.length; index += 1) {
    const expected = index + 1;
    const actual = ordered[index]!.pick_no;
    if (actual !== expected) {
      return {
        kind: 'pick-out-of-sequence',
        expected,
        received: actual,
        message: `Expected pick ${expected} in the pick list but found pick ${actual}.`,
      };
    }
  }

  if (previous !== null) {
    const byPickNo = new Map(ordered.map((pick) => [pick.pick_no, pick]));
    for (const before of previous) {
      const after = byPickNo.get(before.pick_no);
      if (after === undefined) continue;
      if (after.player_id !== before.player_id) {
        return {
          kind: 'pick-changed',
          pickNo: before.pick_no,
          field: 'player',
          message: `Pick ${before.pick_no} changed player after it was already reported.`,
        };
      }
      if (after.draft_slot !== before.draft_slot) {
        return {
          kind: 'pick-changed',
          pickNo: before.pick_no,
          field: 'team',
          message: `Pick ${before.pick_no} changed team after it was already reported.`,
        };
      }
    }
  }

  return null;
}

// ---------------------------------------------------------------------------------------------
// Full ingest — the one code path shared by attach, automatic recovery and Re-sync
// ---------------------------------------------------------------------------------------------

export interface FullIngestOptions {
  /** Overall budget for the whole ingest, not per request (AC-1's 10 s, AC-19's 5 s). */
  timeoutMs: number;
  now?: () => number;
}

export async function performFullIngest(
  client: SleeperClient,
  draftId: string,
  options: FullIngestOptions,
): Promise<SleeperIngest> {
  const now = options.now ?? Date.now;
  const deadline = now() + options.timeoutMs;
  const remaining = (): number => Math.max(1, deadline - now());

  const draft = await client.getDraft(draftId, { timeoutMs: remaining() });
  const [picks, tradedPicks] = await Promise.all([
    client.getDraftPicks(draftId, { timeoutMs: remaining() }),
    client.getTradedPicks(draftId, { timeoutMs: remaining() }),
  ]);
  const leagueId = draft.league_id ?? null;
  const leagueUsers =
    leagueId === null ? null : await client.getLeagueUsers(leagueId, { timeoutMs: remaining() });

  return { draft, picks, tradedPicks, leagueUsers };
}

// ---------------------------------------------------------------------------------------------
// The poll engine
// ---------------------------------------------------------------------------------------------

export interface DegradedReason {
  kind: string;
  message: string;
}

export type PollOutcome =
  | { status: 'applied'; newPicks: PickFeedEntry[]; boardVersion: number }
  | { status: 'unchanged'; boardVersion: number }
  | { status: 'reingested'; boardVersion: number }
  | { status: 'degraded'; reason: DegradedReason };

export type BoardSyncConfig = Pick<
  ParameterValues,
  'pollIntervalMs' | 'pickReflectionLatencyMs' | 'resyncTimeoutMs' | 'initialIngestTimeoutMs'
>;

export interface BoardSyncOptions {
  client: SleeperClient;
  config: BoardSyncConfig;
  /** The ingest attach already performed — the engine starts from a good board, never empty. */
  ingest: SleeperIngest;
  userId?: string | null;
  manualSlot?: number | null;
  matchedPlayerIds?: ReadonlySet<string> | null;
  intervalController?: PollIntervalController;
  observability?: Observability;
  now?: () => number;
}

export interface ResyncResult {
  ok: boolean;
  durationMs: number;
  boardVersion: number;
  failure?: DegradedReason;
}

const degradedReasonFromError = (error: unknown): DegradedReason =>
  error instanceof SleeperApiError
    ? { kind: error.kind, message: error.message }
    : { kind: 'unknown', message: (error as Error).message };

/**
 * How many picks one `picks-observed` trace event carries in full. A recovery re-ingest can
 * report a whole board's worth at once; past this the event keeps the count and drops the tail —
 * the picks themselves are still individually present in the feed and later events.
 */
const PICKS_PER_EVENT_LIMIT = 40;

/**
 * Holds the one attached draft's board and drives the poll loop.
 *
 * `boardVersion` is monotonic and bumps whenever the board actually changes — every applied poll
 * as well as every full re-ingest. AC-21 compares an insight's recorded version against this to
 * decide whether it is still current, so a bump must accompany any change an insight derives from;
 * an unchanged poll deliberately does not bump, so insights do not churn between picks.
 */
export class BoardSync {
  private readonly client: SleeperClient;
  private readonly config: BoardSyncConfig;
  private readonly intervalController: PollIntervalController | undefined;
  private readonly observability: Observability | undefined;
  private readonly now: () => number;

  private ingest: SleeperIngest;
  private lastGoodPicks: SleeperPick[];
  private deriveOptions: DeriveOptions;
  private derived: DerivedDraftState;

  private version = 1;
  private status: 'healthy' | 'degraded' = 'healthy';
  private reason: DegradedReason | null = null;
  /** When the current degraded episode began — the recovery event reports the outage's length. */
  private degradedSince: number | null = null;
  private lastSuccessAt: string;

  private timer: NodeJS.Timeout | null = null;
  private running = false;

  private readonly changeListeners = new Set<() => void>();
  private readonly newPickListeners = new Set<(picks: PickFeedEntry[]) => void>();

  constructor(options: BoardSyncOptions) {
    this.client = options.client;
    this.config = options.config;
    this.intervalController = options.intervalController;
    this.observability = options.observability;
    this.now = options.now ?? Date.now;

    this.ingest = options.ingest;
    this.lastGoodPicks = options.ingest.picks;
    this.deriveOptions = {
      userId: options.userId ?? null,
      manualSlot: options.manualSlot ?? null,
      matchedPlayerIds: options.matchedPlayerIds ?? null,
    };
    this.derived = deriveDraftState(this.ingest, this.deriveOptions);
    this.lastSuccessAt = new Date(this.now()).toISOString();
  }

  get state(): DerivedDraftState {
    return this.derived;
  }

  get syncIndicator(): SyncIndicator {
    return {
      lastSuccessfulSyncAt: this.lastSuccessAt,
      status: this.status,
      boardVersion: this.version,
    };
  }

  get degradedReason(): DegradedReason | null {
    return this.reason;
  }

  /**
   * Resolves which seat owns the pick made in a given round from a given board column, for the
   * *current* ingest — trades included.
   *
   * The pick feed can only attribute picks that have happened. FR-6's window is made of picks
   * that have not, so it needs the resolver itself; exposing it here (rather than letting a
   * caller rebuild one from a stale copy of `traded_picks`) keeps the window's ownership and
   * sync's own attribution the same answer, and keeps it correct across a mid-draft re-ingest.
   */
  get pickOwnerResolver(): (round: number, draftSlot: number) => string {
    return buildPickOwnerResolver(this.ingest.draft, this.ingest.tradedPicks);
  }

  get isComplete(): boolean {
    return this.derived.meta.status === 'complete';
  }

  onChange(listener: () => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /** Fires with the picks that were new in the poll just applied — T10's burst-debounce trigger. */
  onNewPicks(listener: (picks: PickFeedEntry[]) => void): () => void {
    this.newPickListeners.add(listener);
    return () => this.newPickListeners.delete(listener);
  }

  /** Applies a manually chosen seat (AC-5) and re-derives everything that depends on "mine". */
  setUserSlot(draftSlot: number | null): void {
    this.deriveOptions = { ...this.deriveOptions, manualSlot: draftSlot };
    this.derived = deriveDraftState(this.ingest, this.deriveOptions);
    this.emitChange();
  }

  /** Hands the engine the snapshot's matched player ids, so AC-20 can flag the rest. */
  setMatchedPlayerIds(matchedPlayerIds: ReadonlySet<string> | null): void {
    this.deriveOptions = { ...this.deriveOptions, matchedPlayerIds };
    this.derived = deriveDraftState(this.ingest, this.deriveOptions);
    this.emitChange();
  }

  private emitChange(): void {
    for (const listener of this.changeListeners) listener();
  }

  private markDegraded(reason: DegradedReason): PollOutcome {
    // The transition is traced once per episode; repeat failures while already degraded are
    // visible as the individual `poll` events, not as a fresh transition each time.
    if (this.status !== 'degraded') {
      this.degradedSince = this.now();
      this.observability?.recordEvent('sync-degraded', {
        kind: reason.kind,
        message: reason.message,
        boardVersion: this.version,
      });
    }
    this.status = 'degraded';
    this.reason = reason;
    this.emitChange();
    return { status: 'degraded', reason };
  }

  private noteApiError(error: unknown): DegradedReason {
    if (error instanceof SleeperApiError && error.kind === 'rate-limited') {
      this.intervalController?.recordRateLimited();
    }
    return degradedReasonFromError(error);
  }

  /**
   * One poll.
   *
   * While healthy this fetches only the complete pick list. While degraded it performs a full
   * re-ingest instead, which is AC-17's "full re-ingest automatically on the next successful
   * response" — the re-ingest *is* the reset, so it deliberately adopts whatever Sleeper now
   * reports rather than re-testing it against the state that went bad.
   */
  async pollOnce(): Promise<PollOutcome> {
    const startedAt = this.now();
    const mode = this.status === 'degraded' ? 're-ingest' : 'picks';
    const outcome =
      mode === 're-ingest'
        ? await this.reingest(this.config.initialIngestTimeoutMs)
        : await this.pollPicks();

    // Every poll is traced — an unchanged one as noise, so the on-disk record still shows the
    // loop's true cadence (and its effective, back-off-adjusted interval) without drowning the
    // ring buffer between picks.
    this.observability?.recordEvent(
      'poll',
      {
        mode,
        outcome: outcome.status,
        boardVersion: this.version,
        newPicks: outcome.status === 'applied' ? outcome.newPicks.length : 0,
        ...(outcome.status === 'degraded'
          ? { reasonKind: outcome.reason.kind, reason: outcome.reason.message }
          : {}),
        durationMs: this.now() - startedAt,
        intervalMs: this.intervalMs(),
      },
      { noise: outcome.status === 'unchanged' },
    );
    return outcome;
  }

  /** The healthy-path poll body: fetch the complete pick list, verify it, apply it. */
  private async pollPicks(): Promise<PollOutcome> {
    let picks: SleeperPick[];
    try {
      picks = await this.client.getDraftPicks(this.derived.meta.draftId, {
        timeoutMs: this.config.pickReflectionLatencyMs,
      });
    } catch (error) {
      return this.markDegraded(this.noteApiError(error));
    }

    const pollResponseAt = this.observability?.recordPollResponse('picks') ?? this.now();

    const failure = checkPickListIntegrity(this.lastGoodPicks, picks);
    if (failure !== null) {
      return this.markDegraded({ kind: failure.kind, message: failure.message });
    }

    this.intervalController?.recordSuccess();
    return this.applyPicks(picks, pollResponseAt);
  }

  private applyPicks(picks: SleeperPick[], pollResponseAt: number): PollOutcome {
    const seen = new Set(this.lastGoodPicks.map((pick) => pick.pick_no));
    const added = picks.filter((pick) => !seen.has(pick.pick_no));

    this.lastGoodPicks = picks;
    this.ingest = { ...this.ingest, picks };
    this.derived = deriveDraftState(this.ingest, this.deriveOptions);
    this.lastSuccessAt = new Date(this.now()).toISOString();

    if (added.length === 0) return { status: 'unchanged', boardVersion: this.version };

    this.version += 1;
    const addedNos = new Set(added.map((pick) => pick.pick_no));
    const newFeedEntries = this.derived.pickFeed.filter((entry) => addedNos.has(entry.pickNo));

    // AC-66: stamp the moment each dependent view reflected each new pick. The roster panel
    // records its own reflection, since it is rebuilt by a later stage of the cascade.
    for (const entry of newFeedEntries) {
      this.observability?.recordPickReflected({ pickNo: entry.pickNo, view: 'board', pollResponseAt });
      this.observability?.recordPickReflected({
        pickNo: entry.pickNo,
        view: 'pickFeed',
        pollResponseAt,
      });
    }
    this.recordPicksObserved('poll', newFeedEntries);

    for (const listener of this.newPickListeners) listener(newFeedEntries);
    this.emitChange();
    return { status: 'applied', newPicks: newFeedEntries, boardVersion: this.version };
  }

  /** The draft's own story, in the trace: who took whom, when, attributed to which seat. */
  private recordPicksObserved(source: 'poll' | 're-ingest', entries: readonly PickFeedEntry[]): void {
    if (this.observability === undefined || entries.length === 0) return;
    this.observability.recordEvent('picks-observed', {
      source,
      count: entries.length,
      picks: entries.slice(0, PICKS_PER_EVENT_LIMIT),
      ...(entries.length > PICKS_PER_EVENT_LIMIT
        ? { truncated: entries.length - PICKS_PER_EVENT_LIMIT }
        : {}),
    });
  }

  private async reingest(timeoutMs: number): Promise<PollOutcome> {
    let ingest: SleeperIngest;
    try {
      ingest = await performFullIngest(this.client, this.derived.meta.draftId, {
        timeoutMs,
        now: this.now,
      });
    } catch (error) {
      return this.markDegraded(this.noteApiError(error));
    }

    // AC-17's "adopts whatever Sleeper now reports rather than re-testing it against the state
    // that went bad" means no comparison against the OLD state — it does not mean adopting a
    // list that is inconsistent WITH ITSELF. Adopting one flaps: the adopted state passes for
    // healthy, and the very next poll re-fails the same absolute check, forever (observed live
    // 2026-08-27 against a dissolving mock lobby — a 1 Hz degraded/recovered oscillation).
    // Refusing it instead holds one steady degraded state, still re-ingesting every poll, and
    // recovery happens the moment Sleeper's list is self-consistent again.
    const internal = checkPickListIntegrity(null, ingest.picks);
    if (internal !== null) {
      return this.markDegraded({ kind: internal.kind, message: internal.message });
    }

    const pollResponseAt = this.observability?.recordPollResponse('re-ingest') ?? this.now();
    const seen = new Set(this.lastGoodPicks.map((pick) => pick.pick_no));

    this.ingest = ingest;
    this.lastGoodPicks = ingest.picks;
    this.derived = deriveDraftState(ingest, this.deriveOptions);
    this.lastSuccessAt = new Date(this.now()).toISOString();
    this.status = 'healthy';
    this.reason = null;
    this.version += 1;
    this.intervalController?.recordSuccess();

    // A re-ingest that ends a degraded episode is AC-17's recovery — trace it with the outage's
    // measured length, which no single poll event carries.
    if (this.degradedSince !== null) {
      this.observability?.recordEvent('sync-recovered', {
        outageMs: this.now() - this.degradedSince,
        boardVersion: this.version,
      });
      this.degradedSince = null;
    }

    const newFeedEntries = this.derived.pickFeed.filter((entry) => !seen.has(entry.pickNo));
    for (const entry of newFeedEntries) {
      this.observability?.recordPickReflected({ pickNo: entry.pickNo, view: 'board', pollResponseAt });
      this.observability?.recordPickReflected({
        pickNo: entry.pickNo,
        view: 'pickFeed',
        pollResponseAt,
      });
    }
    this.recordPicksObserved('re-ingest', newFeedEntries);

    if (newFeedEntries.length > 0) {
      for (const listener of this.newPickListeners) listener(newFeedEntries);
    }
    this.emitChange();
    return { status: 'reingested', boardVersion: this.version };
  }

  /**
   * The Re-sync control (AC-19): an immediate, out-of-cadence full rebuild that re-reads settings,
   * draft order and traded picks, not just the pick list.
   */
  async resync(): Promise<ResyncResult> {
    const wasRunning = this.running;
    this.clearTimer();

    // Wall clock deliberately, not the injectable `now`: `resyncTimeoutMs` is what actually bounds
    // the rebuild (it is the ingest's deadline), and this number is the observed latency beside it.
    const startedAt = Date.now();
    const outcome = await this.reingest(this.config.resyncTimeoutMs);
    const durationMs = Date.now() - startedAt;

    if (wasRunning) this.scheduleNext();

    return outcome.status === 'reingested'
      ? { ok: true, durationMs, boardVersion: this.version }
      : { ok: false, durationMs, boardVersion: this.version, failure: this.reason ?? undefined };
  }

  private intervalMs(): number {
    return this.intervalController?.effectiveIntervalMs() ?? this.config.pollIntervalMs;
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  private scheduleNext(): void {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, this.intervalMs());
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    if (!this.running) return;
    try {
      await this.pollOnce();
    } catch {
      // pollOnce classifies its own failures; an unexpected throw must not kill the loop.
    }
    // Keep polling while the draft is incomplete — including while it is paused (AC-14).
    if (this.running && !this.isComplete) this.scheduleNext();
  }

  /**
   * Starts polling, and with it the instance heartbeat (AC-8) — the two share a lifetime, so the
   * budget-sharing back-off can never be left unwired by a caller that forgot to start it.
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.intervalController?.start();
    this.scheduleNext();
  }

  stop(): void {
    this.running = false;
    this.clearTimer();
    this.intervalController?.stop();
  }
}
