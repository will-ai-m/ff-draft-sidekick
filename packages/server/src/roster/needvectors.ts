/**
 * The roster panel and need vectors — FR-5 (AC-31, AC-32, AC-33).
 *
 * "At all times, the roster panel shall display the user's roster: filled starting slots, unfilled
 * starting slots by position (their need vector), and bench count, updated within 3 s of their pick
 * appearing in a poll response."
 *
 * Three things this module deliberately does not do:
 *
 *  - **It does not reimplement the need vector.** `computeNeedVector` / `computeUnfilledStartingSlots`
 *    live once in `@sidekick/shared` (PRD §9 Terms) and are shared with FR-6, FR-7 and FR-8. This
 *    module supplies them with league settings and a per-team drafted-position count, nothing more.
 *  - **It does not know any league shape.** Every count comes from the draft object's `settings`
 *    (AC-30/AC-32); there is no branch anywhere keyed on "is this the default 10-team, 2-WR league".
 *    A slot count of zero is a perfectly ordinary answer.
 *  - **It does not accumulate.** Panels are derived from the board's current pick feed on demand,
 *    the same full-state-replace discipline FR-2 applies to the board itself, so a panel can never
 *    drift from the picks it was built from.
 *
 * K and DST are counted, displayed and filled like any other slot (AC-33) while contributing zero
 * need weight (🔶 AS-7) — bookkeeping and prediction are different jobs, and an open K slot is not
 * a reason to predict a K.
 */

import { POSITIONS, computeNeedVector, computeUnfilledStartingSlots } from '@sidekick/shared';
import type {
  FlexEligiblePositions,
  PickFeedEntry,
  Position,
  RosterPanelData,
  SlotConfig,
} from '@sidekick/shared';

import type { Observability } from '../observability';
import type { BoardSync } from '../sleeper/sync';

/** Looks a position up by Sleeper player id, for picks whose metadata carried none. */
export type PositionResolver = (playerId: string) => Position | null;

export interface DraftedPositionCounts {
  /** How many players this team has drafted at each position. */
  counts: Record<Position, number>;
  /** Every player the team has drafted, including any whose position could not be resolved. */
  draftedCount: number;
  /** Players counted in `draftedCount` but in no position bucket — they can only be bench. */
  unknownPositionCount: number;
}

const zeroByPosition = (): Record<Position, number> => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
});

/**
 * Counts one team's drafted players by position, straight from the pick feed.
 *
 * The pick feed is already traded-pick aware (T2 attributes every pick by `draft_slot` +
 * `draft_order`, then resolves trades), so a pick acquired by trade lands on the acquiring
 * roster here without this module knowing trades exist.
 *
 * Sleeper's pick metadata normally carries the position; when it does not, `resolvePosition`
 * (typically backed by the player dump) is consulted. A player whose position stays unknown is
 * still counted as drafted — dropping him would silently under-report the roster.
 */
export function countDraftedByPosition(
  pickFeed: readonly PickFeedEntry[],
  teamId: string,
  resolvePosition?: PositionResolver,
): DraftedPositionCounts {
  const counts = zeroByPosition();
  let draftedCount = 0;
  let unknownPositionCount = 0;

  for (const entry of pickFeed) {
    if (entry.teamId !== teamId) continue;
    draftedCount += 1;

    const position = entry.position ?? resolvePosition?.(entry.playerId) ?? null;
    if (position === null) {
      unknownPositionCount += 1;
      continue;
    }
    counts[position] += 1;
  }

  return { counts, draftedCount, unknownPositionCount };
}

export interface RosterPanelInput {
  teamId: string;
  /** Slot structure from the draft object's own settings — never a hardcoded shape (AC-30). */
  slots: SlotConfig;
  pickFeed: readonly PickFeedEntry[];
  /** 🔶 AS-5 `flexEligiblePositions`; callers holding a loaded config pass that config's value. */
  flexEligiblePositions?: FlexEligiblePositions;
  resolvePosition?: PositionResolver;
}

/**
 * One team's roster panel (AC-31): filled starting slots, unfilled starting slots by position
 * (the need vector in count form), and bench count.
 *
 * The fill model is `computeUnfilledStartingSlots`' — dedicated slots fill first, positional
 * surplus at FLEX-eligible positions then absorbs FLEX slots, the remainder is bench — so the
 * panel and the need vector can never disagree about what "filled" means.
 *
 * Used for the user (FR-5) and, by the same call, for any opponent seat (FR-6 needs one per team
 * in the window); nothing here is specific to "mine".
 */
export function computeRosterPanel(input: RosterPanelInput): RosterPanelData {
  const { teamId, slots } = input;
  const options =
    input.flexEligiblePositions === undefined
      ? {}
      : { flexEligiblePositions: input.flexEligiblePositions };

  const { counts, draftedCount } = countDraftedByPosition(
    input.pickFeed,
    teamId,
    input.resolvePosition,
  );

  const unfilledStartingSlots = computeUnfilledStartingSlots(slots, counts, options);

  const filledStartingSlots = zeroByPosition();
  let filledDedicated = 0;
  for (const position of POSITIONS) {
    const filled = slots[position] - unfilledStartingSlots.dedicated[position];
    filledStartingSlots[position] = filled;
    filledDedicated += filled;
  }

  const filledFlexSlots = slots.FLEX - unfilledStartingSlots.flex;

  return {
    teamId,
    slots,
    filledStartingSlots,
    unfilledStartingSlots,
    filledFlexSlots,
    // Everything past the starting lineup, including any pick whose position is unknown.
    benchCount: Math.max(0, draftedCount - filledDedicated - filledFlexSlots),
    benchSlots: slots.BN,
    needVector: computeNeedVector(slots, counts, options),
  };
}

export interface RosterPanelTrackerOptions {
  sync: BoardSync;
  /** 🔶 AS-5 `flexEligiblePositions` from the loaded config. */
  flexEligiblePositions?: FlexEligiblePositions;
  /** AC-66: where this task records the roster view's own pick-reflection lag. */
  observability?: Observability;
  resolvePosition?: PositionResolver;
  now?: () => number;
}

/**
 * Keeps the roster panel in step with the board — AC-31's "within 3 s of their pick appearing in a
 * poll response" (🔶 AS-5 `pickReflectionLatencyMs`).
 *
 * Panels are derived on read and memoised against `(boardVersion, userTeamId)`, so they are current
 * by construction: any board change invalidates them, and resolving the user's seat by hand (AC-5)
 * invalidates them too, even though that does not change the board.
 *
 * The one thing that must happen *eagerly* is the measurement: when the poll loop reports a pick
 * belonging to the user's own seat, the panel is rebuilt immediately and the lag from that poll
 * response is recorded for the `roster` view — the sample AC-66 asks for and SC-1's ≤3 s bar is
 * judged against during a mock rehearsal. T2 records the `board` and `pickFeed` views the same way.
 */
export class RosterPanelTracker {
  private readonly sync: BoardSync;
  private readonly flexEligiblePositions: FlexEligiblePositions | undefined;
  private readonly observability: Observability | undefined;
  private readonly resolvePosition: PositionResolver | undefined;
  private readonly now: () => number;

  private readonly panels = new Map<string, RosterPanelData>();
  private cacheKey: string | null = null;
  private unsubscribe: (() => void) | null = null;

  constructor(options: RosterPanelTrackerOptions) {
    this.sync = options.sync;
    this.flexEligiblePositions = options.flexEligiblePositions;
    this.observability = options.observability;
    this.resolvePosition = options.resolvePosition;
    this.now = options.now ?? Date.now;
  }

  /** Subscribes to the poll loop's new-pick events. Idempotent. */
  start(): void {
    if (this.unsubscribe !== null) return;
    this.unsubscribe = this.sync.onNewPicks((picks) => {
      this.onNewPicks(picks);
    });
  }

  /** Unsubscribes. Reads still work — the tracker derives, it does not accumulate. */
  stop(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
  }

  /** The board version panels are derived from — what T10 stamps the roster `Insight` with. */
  get boardVersion(): number {
    return this.sync.syncIndicator.boardVersion;
  }

  /**
   * The user's own roster panel, or null while their seat is unresolved — AC-5 blocks
   * mine-vs-opponent output until a slot is chosen, and a guessed seat would be worse than none.
   */
  userPanel(): RosterPanelData | null {
    const userTeamId = this.sync.state.userTeamId;
    return userTeamId === null ? null : this.panelFor(userTeamId);
  }

  /** Any seat's panel — FR-6 asks for one per team in the window. */
  panelFor(teamId: string): RosterPanelData {
    this.invalidateIfStale();
    const cached = this.panels.get(teamId);
    if (cached !== undefined) return cached;

    const panel = computeRosterPanel({
      teamId,
      slots: this.sync.state.meta.slots,
      pickFeed: this.sync.state.pickFeed,
      ...(this.flexEligiblePositions === undefined
        ? {}
        : { flexEligiblePositions: this.flexEligiblePositions }),
      ...(this.resolvePosition === undefined ? {} : { resolvePosition: this.resolvePosition }),
    });
    this.panels.set(teamId, panel);
    return panel;
  }

  /** Panels are only valid for the board version and seat assignment they were derived from. */
  private invalidateIfStale(): void {
    const key = `${this.sync.syncIndicator.boardVersion}|${this.sync.state.userTeamId ?? '-'}`;
    if (key === this.cacheKey) return;
    this.panels.clear();
    this.cacheKey = key;
  }

  private onNewPicks(picks: readonly PickFeedEntry[]): void {
    const mine = picks.filter((pick) => pick.isUserPick);
    if (mine.length === 0) return;

    const userTeamId = this.sync.state.userTeamId;
    if (userTeamId === null) return;

    // Rebuild here and now, so the lag recorded below measures an actual rebuild rather than
    // whenever something later happened to read the panel.
    this.invalidateIfStale();
    this.panels.delete(userTeamId);
    this.panelFor(userTeamId);

    // Anchor on the poll response these picks arrived in, so the recorded lag is the one AC-31
    // budgets: Sleeper's answer landing -> the roster panel showing it.
    const pollResponseAt = this.observability?.lastPollResponseAt() ?? this.now();
    for (const pick of mine) {
      this.observability?.recordPickReflected({
        pickNo: pick.pickNo,
        view: 'roster',
        pollResponseAt,
      });
    }
  }
}
