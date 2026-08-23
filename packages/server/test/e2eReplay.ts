/**
 * T15's replay driver — the whole server, driven through one complete draft.
 *
 * Nothing here mocks Sidekick. The real `Orchestrator` is stood up over the real `BoardSync`,
 * `SnapshotStore`, tendency tracker, Monte Carlo engine and recommendation modules; only the
 * *outside world* is fixtures (msw over the Sleeper, FantasyPros, FFC and crosswalk endpoints).
 * Determinism comes from two places: msw always answers from the same static board, and FR-8's
 * sampling is seeded off the board itself (T7's `deriveSeed`), so an unchanged board always
 * produces an unchanged projection.
 *
 * The driver's real job is the {@link InvariantChecker}. Every broadcast the orchestrator makes
 * during the replay — a few hundred of them — is checked against the PRD's cross-cutting rules
 * before the next step runs, so a violation is caught at the snapshot that broke it rather than
 * inferred from a wrong final answer:
 *
 *  - **Convergence (SC-1's counter-metric).** The board is always exactly some prefix of the
 *    fixture's pick script, and that prefix never shrinks. A board that is not a prefix, or that
 *    went backwards, is a non-converging board state.
 *  - **Never stale-as-current (AC-21).** An insight's `recomputing` flag is exactly
 *    `boardVersion < sync.boardVersion`, and all three insights always carry the same version —
 *    no snapshot can mix two boards.
 *  - **Never a drafted player recommended (AC-53).** On any snapshot where the candidate list is
 *    *not* flagged recomputing, no row, no per-position filter row and no highlight names a player
 *    the board has drafted.
 *  - **Unmatched stays out of the rankings (AC-20).** The one drafted player neither snapshot
 *    carries appears in the pick feed under his raw Sleeper name with `matchedToSnapshot: false`,
 *    and never appears in any rankings-driven output at any point.
 *  - **Attribution follows the trade (AC-12).** Every pick-feed entry is attributed to the seat the
 *    fixture says owns that pick, which for two rounds is not the seat that is on the clock.
 *  - **Suppression after the last pick (AC-45).** Once the user's final pick has landed there is no
 *    next turn, so no row may carry a survival number.
 */
import { setupServer } from 'msw/node';
import type { SetupServer } from 'msw/node';
import { HttpResponse, http } from 'msw';
import type { HttpHandler } from 'msw';

import type { AppStateSnapshot, ParameterValues } from '@sidekick/shared';

import { CROSSWALK_URL } from '../src/snapshots/crosswalk';
import { FANTASYPROS_HALF_PPR_URL } from '../src/snapshots/fantasypros';
import { FFC_ADP_BASE_URL } from '../src/snapshots/ffc';
import { createHarness, delay, waitForRecompute } from './harness';
import type { Harness } from './harness';
import {
  USER_ID,
  USER_SLOT,
  completedDraft,
  e2eBoard,
  e2eCrosswalkCsv,
  e2eEcrHtml,
  e2eFfcAdp,
  e2eLeagueBundle,
  e2eMockBundle,
  e2eSleeperPlayers,
  expectedOwnerSlot,
  slotForPick,
  userPickNumbers,
} from './fixtures/e2eDraft';
import type { E2eBundle } from './fixtures/e2eDraft';
import type { SleeperFixtureBundle } from './msw/sleeperHandlers';

// ---------------------------------------------------------------------------------------------
// The outside world
// ---------------------------------------------------------------------------------------------

/** FR-4's three sources, answering from the e2e board rather than T3's ten-row slice. */
export const e2eSnapshotHandlers = (): HttpHandler[] => [
  http.get(FANTASYPROS_HALF_PPR_URL, () => HttpResponse.text(e2eEcrHtml())),
  http.get(`${FFC_ADP_BASE_URL}/:format`, ({ request }) => {
    const teams = Number(new URL(request.url).searchParams.get('teams'));
    return HttpResponse.json(e2eFfcAdp(Number.isFinite(teams) ? teams : e2eBoard.teams));
  }),
  http.get(CROSSWALK_URL, () => HttpResponse.text(e2eCrosswalkCsv())),
];

/** Which seat the fixture says owns each pick. The mock bundle has no trades to apply. */
export type OwnerSlotResolver = (pickNo: number) => number;

export interface E2eSetupOptions {
  variant: 'mock' | 'league';
  server: SetupServer;
  visiblePicks?: number;
  config?: Partial<ParameterValues>;
}

export interface E2eSetup {
  harness: Harness;
  bundle: E2eBundle;
  ownerSlotFor: OwnerSlotResolver;
}

const bundleFor = (variant: 'mock' | 'league'): E2eBundle =>
  variant === 'mock' ? e2eMockBundle() : e2eLeagueBundle();

/** Stands the whole server up over the e2e fixtures, without attaching yet. */
export function createE2eSetup(options: E2eSetupOptions): E2eSetup {
  const bundle = bundleFor(options.variant);
  const harness = createHarness({
    bundle: bundle as unknown as SleeperFixtureBundle,
    visiblePicks: options.visiblePicks ?? 0,
    players: e2eSleeperPlayers(),
    config: { burstDebounceMs: 100, monteCarloRunCount: 200, ...options.config },
  });

  options.server.use(...harness.scenario.handlers(), ...e2eSnapshotHandlers());

  return {
    harness,
    bundle,
    ownerSlotFor: options.variant === 'mock' ? slotForPick : expectedOwnerSlot,
  };
}

/** A fresh msw server for a suite that drives these fixtures. */
export const createE2eMswServer = (): SetupServer => setupServer();

// ---------------------------------------------------------------------------------------------
// The invariants
// ---------------------------------------------------------------------------------------------

export interface InvariantCheckerOptions {
  ownerSlotFor: OwnerSlotResolver;
  /** The pick number after which the user has no further turn (AC-45). */
  lastUserPickNo: number;
}

/**
 * Checks one snapshot against every cross-cutting rule, recording a description of anything that
 * fails rather than throwing — a replay should report *all* the states that broke, and the pick
 * number they broke at, not just the first.
 */
export class InvariantChecker {
  readonly violations: string[] = [];
  /** Snapshots inspected, so a replay can prove the checker actually ran. */
  checked = 0;
  /** How many picks the largest board seen so far carried — convergence must never go backwards. */
  private highWaterMark = 0;

  private readonly ownerSlotFor: OwnerSlotResolver;
  private readonly lastUserPickNo: number;
  private readonly scriptIndex: Map<string, number>;
  private readonly unmatchedId: string;

  constructor(options: InvariantCheckerOptions) {
    this.ownerSlotFor = options.ownerSlotFor;
    this.lastUserPickNo = options.lastUserPickNo;
    this.scriptIndex = new Map(e2eBoard.pickScript.map((playerId, index) => [playerId, index + 1]));
    this.unmatchedId = e2eBoard.unmatchedPlayer.id;
  }

  private fail(label: string, snapshot: AppStateSnapshot, detail: string): void {
    this.violations.push(
      `[${label} @ board v${snapshot.sync.boardVersion}, ${snapshot.pickFeed.length} picks] ${detail}`,
    );
  }

  check(label: string, snapshot: AppStateSnapshot): void {
    this.checked += 1;
    if (snapshot.attach.status === 'not-attached') return;

    this.checkConvergence(label, snapshot);
    this.checkInsightFreshness(label, snapshot);
    this.checkNoDraftedRecommended(label, snapshot);
    this.checkUnmatchedStaysOut(label, snapshot);
    this.checkFinalPickSuppression(label, snapshot);
  }

  /** SC-1's counter-metric: the board is always a prefix of the script, and never shrinks. */
  private checkConvergence(label: string, snapshot: AppStateSnapshot): void {
    const drafted = Object.entries(snapshot.board.players).filter(([, state]) => state.drafted);
    const count = drafted.length;

    if (count < this.highWaterMark) {
      this.fail(label, snapshot, `board shrank from ${this.highWaterMark} to ${count} picks`);
    }
    this.highWaterMark = Math.max(this.highWaterMark, count);

    for (const [playerId] of drafted) {
      const scriptPosition = this.scriptIndex.get(playerId);
      if (scriptPosition === undefined) {
        this.fail(label, snapshot, `board drafted ${playerId}, who the fixture never picked`);
      } else if (scriptPosition > count) {
        this.fail(
          label,
          snapshot,
          `board drafted ${playerId} (fixture pick ${scriptPosition}) with only ${count} picks in`,
        );
      }
    }

    if (snapshot.pickFeed.length !== count) {
      this.fail(label, snapshot, `pick feed has ${snapshot.pickFeed.length} of ${count} picks`);
    }

    for (const [index, entry] of snapshot.pickFeed.entries()) {
      const expectedPickNo = index + 1;
      if (entry.pickNo !== expectedPickNo) {
        this.fail(label, snapshot, `pick feed entry ${index} is pick ${entry.pickNo}`);
        continue;
      }
      if (entry.playerId !== e2eBoard.pickScript[index]) {
        this.fail(
          label,
          snapshot,
          `pick ${entry.pickNo} is ${entry.playerId}, not the scripted one`,
        );
      }
      // AC-12: attribution follows the traded-picks endpoint, not the seat on the clock.
      const expectedTeam = `slot-${this.ownerSlotFor(entry.pickNo)}`;
      if (entry.teamId !== expectedTeam) {
        this.fail(
          label,
          snapshot,
          `pick ${entry.pickNo} attributed to ${entry.teamId}, not ${expectedTeam}`,
        );
      }
      const shouldBeUser = this.ownerSlotFor(entry.pickNo) === USER_SLOT;
      if (snapshot.attach.status === 'attached' && entry.isUserPick !== shouldBeUser) {
        this.fail(
          label,
          snapshot,
          `pick ${entry.pickNo} mine-vs-opponent flag is ${entry.isUserPick}`,
        );
      }
    }
  }

  /** AC-21: an insight is flagged recomputing exactly while its board version is behind. */
  private checkInsightFreshness(label: string, snapshot: AppStateSnapshot): void {
    const insights = {
      userRoster: snapshot.userRoster,
      opponentPanel: snapshot.opponentPanel,
      candidateList: snapshot.candidateList,
    };
    const versions = new Set(Object.values(insights).map((insight) => insight.boardVersion));
    if (versions.size > 1) {
      this.fail(label, snapshot, `snapshot mixes board versions ${[...versions].join(', ')}`);
    }

    for (const [name, insight] of Object.entries(insights)) {
      if (insight.boardVersion > snapshot.sync.boardVersion) {
        this.fail(label, snapshot, `${name} claims board v${insight.boardVersion}, ahead of sync`);
      }
      const behind = insight.boardVersion < snapshot.sync.boardVersion;
      if (insight.recomputing !== behind) {
        this.fail(
          label,
          snapshot,
          `${name} at v${insight.boardVersion} is recomputing=${insight.recomputing}`,
        );
      }
      if (insight.degraded !== (snapshot.sync.status === 'degraded')) {
        this.fail(
          label,
          snapshot,
          `${name} degraded=${insight.degraded} vs sync ${snapshot.sync.status}`,
        );
      }
    }
  }

  /**
   * AC-53: a drafted player is never named as a candidate or a recommendation.
   *
   * Only checked on snapshots the candidate list is *not* flagged recomputing on — a flagged one is
   * showing the previous board's answer on purpose, which is what AC-21 exists to make honest.
   */
  private checkNoDraftedRecommended(label: string, snapshot: AppStateSnapshot): void {
    if (snapshot.candidateList.recomputing) return;
    const list = snapshot.candidateList.data;
    const isDrafted = (playerId: string): boolean =>
      snapshot.board.players[playerId]?.drafted === true;

    for (const row of list.rows) {
      if (isDrafted(row.playerId)) {
        this.fail(label, snapshot, `candidate row names drafted ${row.playerName}`);
      }
    }
    for (const [position, rows] of Object.entries(list.rowsByPosition ?? {})) {
      for (const row of rows ?? []) {
        if (isDrafted(row.playerId)) {
          this.fail(label, snapshot, `${position} filter row names drafted ${row.playerName}`);
        }
      }
    }
    if (list.highlightPlayerId !== null && isDrafted(list.highlightPlayerId)) {
      this.fail(label, snapshot, `highlight names drafted ${list.highlightPlayerId}`);
    }
    if (!snapshot.opponentPanel.recomputing) {
      for (const entry of snapshot.opponentPanel.data.entries) {
        for (const example of entry.examplePlayers) {
          if (isDrafted(example.playerId)) {
            this.fail(label, snapshot, `opponent panel offers drafted ${example.playerName}`);
          }
        }
      }
    }
  }

  /** AC-20: the unmatched player is visible in the feed, invisible to everything rankings-driven. */
  private checkUnmatchedStaysOut(label: string, snapshot: AppStateSnapshot): void {
    const list = snapshot.candidateList.data;
    const named = [
      ...list.rows.map((row) => row.playerId),
      ...Object.values(list.rowsByPosition ?? {}).flatMap((rows) =>
        (rows ?? []).map((r) => r.playerId),
      ),
      ...(list.highlightPlayerId === null ? [] : [list.highlightPlayerId]),
    ];
    if (named.includes(this.unmatchedId)) {
      this.fail(label, snapshot, 'the unmatched player reached a rankings-driven output');
    }

    const entry = snapshot.pickFeed.find((pick) => pick.playerId === this.unmatchedId);
    if (entry === undefined) return;
    if (entry.matchedToSnapshot) {
      this.fail(label, snapshot, 'the unmatched player is flagged as matched');
    }
    if (entry.playerName !== e2eBoard.unmatchedPlayer.name) {
      this.fail(
        label,
        snapshot,
        `unmatched pick shows "${entry.playerName}", not the raw Sleeper name`,
      );
    }
  }

  /** AC-45: no next pick, no survival number — not a zero, and not a stale one. */
  private checkFinalPickSuppression(label: string, snapshot: AppStateSnapshot): void {
    if (snapshot.candidateList.recomputing) return;
    if (snapshot.pickFeed.length < this.lastUserPickNo) return;
    if (snapshot.attach.status !== 'attached') return;

    const withSurvival = snapshot.candidateList.data.rows.filter((row) => row.survival !== null);
    if (withSurvival.length > 0) {
      this.fail(
        label,
        snapshot,
        `${withSurvival.length} rows still carry survival after the user's last pick`,
      );
    }
    if (snapshot.opponentPanel.data.window.nextUserPickNo !== null) {
      this.fail(label, snapshot, 'the window still claims a next user pick');
    }
  }
}

// ---------------------------------------------------------------------------------------------
// The replay
// ---------------------------------------------------------------------------------------------

export interface ReplayEvent {
  label: string;
  picksOnBoard: number;
  boardVersion: number;
  recomputes: number;
  syncStatus: 'healthy' | 'degraded';
  /** AC-21's marker as it actually went out on the wire, not as the test hoped it would. */
  recomputing: boolean;
  highlightPlayerId: string | null;
}

export interface ReplayResult {
  harness: Harness;
  checker: InvariantChecker;
  /** Every broadcast the orchestrator made, in order, one line each. */
  timeline: ReplayEvent[];
  /** Named snapshots the assertions want to look at directly. */
  marks: Record<string, AppStateSnapshot>;
  /** Recompute counts around the deliberate three-pick burst (AC-46/AC-53). */
  burst: {
    picks: number[];
    beforeCount: number;
    insideWindowCount: number;
    afterSettleCount: number;
  };
  broadcasts: number;
  degradedEpisodes: number;
  resyncMs: number;
}

export interface ReplayOptions {
  variant: 'mock' | 'league';
  server: SetupServer;
  config?: Partial<ParameterValues>;
}

/** The pick the burst assertion uses: seat 7's traded round-5 pick, inside the user's own window. */
const BURST_PICKS = [45, 46, 47];

/** Debounce window used for the burst step alone — see the comment at its call site. */
const BURST_WINDOW_MS = 600;

/**
 * Replays the whole fixture draft through the real orchestrator.
 *
 * The shape of the run is UJ-2's: attach and confirm, picks arriving in ordinary polls and in one
 * deliberate burst, an integrity failure and its automatic recovery, a manual Re-sync, then the
 * draft running out to its last pick and closing.
 */
export async function replayDraft(options: ReplayOptions): Promise<ReplayResult> {
  const setup = createE2eSetup({
    variant: options.variant,
    server: options.server,
    visiblePicks: 0,
    ...(options.config === undefined ? {} : { config: options.config }),
  });
  const { harness, ownerSlotFor } = setup;
  const { orchestrator, scenario } = harness;

  const userPicks = userPickNumbers();
  const checker = new InvariantChecker({
    ownerSlotFor,
    lastUserPickNo: userPicks.at(-1) ?? e2eBoard.pickScript.length,
  });
  const timeline: ReplayEvent[] = [];
  const marks: Record<string, AppStateSnapshot> = {};
  let currentLabel = 'attach';
  let broadcasts = 0;

  orchestrator.subscribe((snapshot) => {
    broadcasts += 1;
    checker.check(currentLabel, snapshot);
    timeline.push({
      label: currentLabel,
      picksOnBoard: snapshot.pickFeed.length,
      boardVersion: snapshot.sync.boardVersion,
      recomputes: orchestrator.recomputeCount,
      syncStatus: snapshot.sync.status,
      recomputing: snapshot.candidateList.recomputing,
      highlightPlayerId: snapshot.candidateList.data.highlightPlayerId,
    });
  });

  const step = async (label: string, body: () => Promise<void>): Promise<void> => {
    currentLabel = label;
    await body();
    checker.check(`${label}:settled`, orchestrator.snapshot());
  };

  /** Reveal `count` picks in one poll, then wait for the debounced cascade to publish. */
  const pollThrough = async (count: number): Promise<void> => {
    const before = orchestrator.recomputeCount;
    scenario.advance(count);
    await orchestrator.pollOnce();
    await waitForRecompute(orchestrator, before);
  };

  // --- attach ------------------------------------------------------------------------------
  await step('attach', async () => {
    const result = await orchestrator.attach({
      input: `https://sleeper.com/draft/nfl/${String(setup.bundle.draft['draft_id'])}`,
      sleeperUserId: USER_ID,
    });
    if (!result.ok) throw new Error(`attach failed: ${JSON.stringify(result.failure)}`);
    // UJ-1's confirmation step is the user reading this surface; the replay stands in for them.
    marks['attached'] = orchestrator.snapshot();
  });

  // --- the draft opens: picks 1..44, the user's first five turns among them ------------------
  const firstBurstPick = BURST_PICKS[0] ?? 45;
  await step('opening-rounds', async () => {
    while (scenario.visiblePicks < firstBurstPick - 1) {
      await pollThrough(Math.min(4, firstBurstPick - 1 - scenario.visiblePicks));
    }
    marks['afterUserFifthPick'] = orchestrator.snapshot();
  });

  // --- one burst: three separate polls inside a single debounce window (AC-46/AC-53) ---------
  const burstBefore = orchestrator.recomputeCount;
  const steadyDebounceMs = harness.config.burstDebounceMs;
  let insideWindowCount = burstBefore;
  let afterSettleCount = burstBefore;
  await step('burst', async () => {
    // "Three picks inside one debounce window" is only a real claim if the window comfortably
    // outlasts three fixture round trips on a loaded machine — otherwise a slow CI box turns a
    // correct implementation red. The orchestrator reads this value on every pick, so widening it
    // for the burst alone keeps the assertion honest without slowing the other ~30 settles down.
    harness.config.burstDebounceMs = BURST_WINDOW_MS;
    try {
      for (let i = 0; i < BURST_PICKS.length; i += 1) {
        scenario.advance(1);
        await orchestrator.pollOnce();
      }
      insideWindowCount = orchestrator.recomputeCount;
      marks['duringBurst'] = orchestrator.snapshot();
      await waitForRecompute(orchestrator, burstBefore);
    } finally {
      harness.config.burstDebounceMs = steadyDebounceMs;
    }
    // Long enough that a second, wrongly-armed timer would have fired by now.
    await delay(steadyDebounceMs * 3);
    afterSettleCount = orchestrator.recomputeCount;
    marks['afterBurst'] = orchestrator.snapshot();
  });

  // --- the middle rounds, including the pick no snapshot carries (AC-20) ---------------------
  await step('middle-rounds', async () => {
    while (scenario.visiblePicks < e2eBoard.unmatchedAtPickNo - 1) {
      await pollThrough(Math.min(8, e2eBoard.unmatchedAtPickNo - 1 - scenario.visiblePicks));
    }
    await pollThrough(1);
    marks['afterUnmatchedPick'] = orchestrator.snapshot();
    while (scenario.visiblePicks < 100) await pollThrough(Math.min(6, 100 - scenario.visiblePicks));
  });

  // --- a degraded episode and its automatic recovery (AC-17, AC-18, AC-48) -------------------
  let degradedEpisodes = 0;
  await step('degraded-malformed', async () => {
    scenario.failNextPicks({ kind: 'malformed' }, 1);
    await orchestrator.pollOnce();
    const degraded = orchestrator.snapshot();
    marks['degradedMalformed'] = degraded;
    if (degraded.sync.status === 'degraded') degradedEpisodes += 1;
    // The draft moved on while Sidekick was blind, so the recovering re-ingest also catches up —
    // which is what AC-17's "full re-ingest on the next successful response" is for.
    const before = orchestrator.recomputeCount;
    scenario.advance(3);
    await orchestrator.pollOnce();
    await waitForRecompute(orchestrator, before);
    marks['recoveredFromMalformed'] = orchestrator.snapshot();
  });

  await step('degraded-inconsistent', async () => {
    // A pick list that lost picks it had already reported: inconsistent, not merely late (AC-17).
    scenario.picksOverride = scenario.bundle.picks.slice(0, scenario.visiblePicks - 6);
    await orchestrator.pollOnce();
    const degraded = orchestrator.snapshot();
    marks['degradedInconsistent'] = degraded;
    if (degraded.sync.status === 'degraded') degradedEpisodes += 1;
    // Recovering with nothing new to apply: the re-ingest bumps the board version, so the
    // insights are honestly flagged behind it until the next pick (or a Re-sync) rebuilds them.
    scenario.picksOverride = null;
    await orchestrator.pollOnce();
    marks['recoveredFromInconsistent'] = orchestrator.snapshot();
  });

  // --- a manual Re-sync while several picks are outstanding (AC-19) --------------------------
  let resyncMs = 0;
  await step('resync', async () => {
    scenario.advance(7);
    const result = await orchestrator.resync();
    resyncMs = result?.durationMs ?? Number.POSITIVE_INFINITY;
    marks['afterResync'] = orchestrator.snapshot();
  });

  // --- out to the user's last pick, then the tail of the draft (AC-45) -----------------------
  const lastUserPick = userPicks.at(-1) ?? e2eBoard.pickScript.length;
  await step('late-rounds', async () => {
    while (scenario.visiblePicks < lastUserPick) {
      await pollThrough(Math.min(8, lastUserPick - scenario.visiblePicks));
    }
    marks['afterUserFinalPick'] = orchestrator.snapshot();
  });

  await step('final-picks', async () => {
    while (scenario.visiblePicks < e2eBoard.pickScript.length) {
      await pollThrough(Math.min(3, e2eBoard.pickScript.length - scenario.visiblePicks));
    }
  });

  // --- completion: the draft closes and a Re-sync re-reads the draft object (AC-14) ----------
  await step('completion', async () => {
    scenario.draftOverride = completedDraft(scenario.bundle.draft);
    await orchestrator.resync();
    marks['final'] = orchestrator.snapshot();
  });

  return {
    harness,
    checker,
    timeline,
    marks,
    burst: { picks: BURST_PICKS, beforeCount: burstBefore, insideWindowCount, afterSettleCount },
    broadcasts,
    degradedEpisodes,
    resyncMs,
  };
}

/**
 * The same fixture attached at its final board instead of replayed into it (AC-13).
 *
 * Two uses: the replay suite asserts this equals what the replay converged to — a full pick list
 * is a full pick list, however it arrived — and the web smoke test renders it, so the frontend
 * check runs against the same fixture's final `AppStateSnapshot` without paying for the replay.
 */
export async function attachAtFullBoard(options: {
  variant: 'mock' | 'league';
  server: SetupServer;
}): Promise<{ harness: Harness; snapshot: AppStateSnapshot }> {
  const setup = createE2eSetup({
    variant: options.variant,
    server: options.server,
    visiblePicks: e2eBoard.pickScript.length,
  });

  const result = await setup.harness.orchestrator.attach({
    input: String(setup.bundle.draft['draft_id']),
    sleeperUserId: USER_ID,
  });
  if (!result.ok) throw new Error(`attach failed: ${JSON.stringify(result.failure)}`);

  return { harness: setup.harness, snapshot: setup.harness.orchestrator.snapshot() };
}
