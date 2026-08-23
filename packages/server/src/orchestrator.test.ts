import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import realBundleJson from '../test/fixtures/sleeper-real-league-draft.json';
import { createHarness, delay, waitForRecompute } from '../test/harness';
import type { Harness } from '../test/harness';
import { allHandlers, createRequestCounts, sleeperPlayersFixture } from '../test/msw/handlers';
import type { RequestCounts, SleeperFixtureBundle } from '../test/msw/handlers';

const realBundle = realBundleJson as unknown as SleeperFixtureBundle;

/** Slot 4's owner in the real-league fixture — the same user id T2's own suite attaches as. */
const USER_ID = '700000000000000004';
const DRAFT_ID = String(realBundle.draft['draft_id']);

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const harnesses: Harness[] = [];
afterEach(() => {
  while (harnesses.length > 0) harnesses.pop()?.dispose();
});

interface StandUpOptions {
  visiblePicks?: number;
  config?: Parameters<typeof createHarness>[0]['config'];
  gameLogCache?: Parameters<typeof createHarness>[0]['gameLogCache'];
  counts?: RequestCounts;
  userId?: string | null;
  attach?: boolean;
  syncTickMs?: number;
}

/** Attaches a harness to the real-league fixture and returns it, ready to poll. */
const standUp = async (options: StandUpOptions = {}): Promise<Harness> => {
  const harness = createHarness({
    bundle: realBundle,
    visiblePicks: options.visiblePicks ?? 0,
    players: sleeperPlayersFixture(),
    ...(options.config === undefined ? {} : { config: options.config }),
    ...(options.gameLogCache === undefined ? {} : { gameLogCache: options.gameLogCache }),
    ...(options.syncTickMs === undefined
      ? {}
      : { orchestrator: { syncTickMs: options.syncTickMs } }),
  });
  harnesses.push(harness);

  server.use(
    ...allHandlers({
      scenario: harness.scenario,
      ...(options.counts === undefined ? {} : { counts: options.counts }),
    }),
  );

  if (options.attach !== false) {
    const result = await harness.orchestrator.attach({
      input: `https://sleeper.com/draft/nfl/${DRAFT_ID}`,
      sleeperUserId: options.userId === undefined ? USER_ID : options.userId,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  }

  return harness;
};

// ---------------------------------------------------------------------------------------------
// Attach — the first full snapshot (FR-1, FR-4)
// ---------------------------------------------------------------------------------------------

describe('attach and the first AppStateSnapshot', () => {
  it('publishes one complete snapshot: board, feed, roster, opponent panel and candidates', async () => {
    const harness = await standUp();
    const snapshot = harness.orchestrator.snapshot();

    expect(snapshot.attach).toMatchObject({
      status: 'attached',
      draftId: DRAFT_ID,
      isMock: false,
      userTeamId: 'slot-4',
    });
    expect(snapshot.sync.status).toBe('healthy');
    expect(snapshot.sync.draftStatus).toBe('drafting');
    expect(snapshot.sync.lastSuccessfulSyncAt).not.toBeNull();
    expect(snapshot.board.teams).toHaveLength(10);
    expect(snapshot.pickFeed).toHaveLength(0);

    // FR-5: the user's own panel, from the draft object's own settings.
    expect(snapshot.userRoster.data).not.toBeNull();
    expect(snapshot.userRoster.data?.teamId).toBe('slot-4');
    expect(snapshot.userRoster.data?.slots).toEqual({
      QB: 1,
      RB: 2,
      WR: 2,
      TE: 1,
      FLEX: 1,
      K: 1,
      DST: 1,
      BN: 6,
    });

    // FR-6: the window from the in-progress pick to the user's next turn — picks 1..3.
    expect(snapshot.opponentPanel.data.window.nextUserPickNo).toBe(4);
    expect(snapshot.opponentPanel.data.entries.map((entry) => entry.pickNo)).toEqual([1, 2, 3]);
    // FR-7 has been applied by the time the panel ships.
    expect(snapshot.opponentPanel.data.entries[0]?.tendencyProfile?.confidence).toBe('early');

    // FR-9: raw ECR order over the matched snapshot, with survival attached (FR-8).
    expect(snapshot.candidateList.data.rows[0]?.playerId).toBe('9221');
    expect(snapshot.candidateList.data.rows[1]?.playerId).toBe('7564');
    expect(snapshot.candidateList.data.rows[0]?.survival).not.toBeNull();
    expect(snapshot.candidateList.data.highlightPlayerId).not.toBeNull();
    expect(snapshot.candidateList.data.reason).toBeTruthy();

    // Every insight is fresh at the current board version, and nothing is stale or degraded.
    for (const insight of [snapshot.userRoster, snapshot.opponentPanel, snapshot.candidateList]) {
      expect(insight.boardVersion).toBe(snapshot.sync.boardVersion);
      expect(insight.recomputing).toBe(false);
      expect(insight.degraded).toBe(false);
    }

    expect(snapshot.config.burstDebounceMs).toBe(harness.config.burstDebounceMs);
  });

  it('carries the pre-draft check, and precomputes AC-50 per-position rows for the filter', async () => {
    const harness = await standUp();
    const snapshot = harness.orchestrator.snapshot();

    expect(snapshot.preDraftCheck?.ecrSnapshot?.source).toContain('fantasypros.com');
    expect(snapshot.preDraftCheck?.adpSnapshot?.poolDescription).toBeTruthy();
    expect(snapshot.preDraftCheck?.leagueSummary).toEqual({
      teamCount: 10,
      scoringType: 'half_ppr',
      rounds: 15,
    });
    // Chip Trayanum has no Sleeper id in the crosswalk slice — AC-25's excluded list.
    expect(snapshot.preDraftCheck?.unmatchedEntries.map((entry) => entry.name)).toContain(
      'Chip Trayanum',
    );

    // AC-50's transport: the browser cannot filter client-side from eight ECR-ordered rows.
    const byPosition = snapshot.candidateList.data.rowsByPosition;
    expect(byPosition?.TE?.map((row) => row.playerId)).toEqual(['11604', '8130', '8210']);
    // K/DST rows carry no survival math whatever the projection holds (🔶 AS-7).
    expect(byPosition?.DST?.[0]?.playerId).toBe('HOU');
    expect(byPosition?.DST?.[0]?.survival).toBeNull();
  });

  it('warns on the pre-draft check when the game-log cache has never been built', async () => {
    const harness = await standUp({ gameLogCache: null });
    const codes = harness.orchestrator.snapshot().preDraftCheck?.warnings.map((w) => w.code);
    expect(codes).toContain('gamelog-cache-missing');
  });

  it('fetches both snapshots exactly once for the attached draft (AC-29)', async () => {
    const counts = createRequestCounts();
    const harness = await standUp({ counts });

    harness.scenario.advance(3);
    await harness.orchestrator.pollOnce();
    await waitForRecompute(harness.orchestrator, 1);

    expect(counts.ecr).toBe(1);
    expect(counts.adp).toBe(1);
  });

  it('refuses a second attach while one draft is attached (AC-6)', async () => {
    const harness = await standUp();
    const second = await harness.orchestrator.attach({ input: DRAFT_ID });

    expect(second.ok).toBe(false);
    expect(second.ok === false && second.failure.kind).toBe('already-attached');
    // The first attach is untouched.
    expect(harness.orchestrator.snapshot().attach.status).toBe('attached');
  });

  it('names the failure and echoes the input back on a bad draft id (AC-7)', async () => {
    const harness = await standUp({ attach: false });
    const result = await harness.orchestrator.attach({ input: 'not-a-draft' });

    expect(result.ok).toBe(false);
    expect(result.ok === false && result.failure).toMatchObject({
      kind: 'invalid-input',
      input: 'not-a-draft',
    });
    expect(harness.orchestrator.snapshot().attach.status).toBe('error');
  });
});

// ---------------------------------------------------------------------------------------------
// Burst coalescing (AC-46, AC-53, AC-67) — §T10's headline "done when"
// ---------------------------------------------------------------------------------------------

describe('burst coalescing', () => {
  it('fires exactly one recompute for three picks inside one debounce window', async () => {
    const harness = await standUp({ config: { burstDebounceMs: 250 } });
    const before = harness.orchestrator.recomputeCount;

    for (let i = 0; i < 3; i += 1) {
      harness.scenario.advance(1);
      await harness.orchestrator.pollOnce();
    }

    // Still inside the debounce window: nothing has recomputed yet.
    expect(harness.orchestrator.recomputeCount).toBe(before);

    await waitForRecompute(harness.orchestrator, before);
    await delay(50);

    expect(harness.orchestrator.recomputeCount).toBe(before + 1);
    expect(harness.orchestrator.snapshot().pickFeed).toHaveLength(3);
  });

  it('marks the affected insights recomputing in the interim, keeping their prior data (AC-21)', async () => {
    const harness = await standUp({ config: { burstDebounceMs: 250 } });
    const beforeRows = harness.orchestrator
      .snapshot()
      .candidateList.data.rows.map((r) => r.playerId);
    const beforeVersion = harness.orchestrator.snapshot().sync.boardVersion;
    const before = harness.orchestrator.recomputeCount;

    harness.scenario.advance(1); // pick 1 takes Bijan Robinson (9509), who is not in the snapshot
    await harness.orchestrator.pollOnce();

    const during = harness.orchestrator.snapshot();
    expect(during.sync.boardVersion).toBeGreaterThan(beforeVersion);
    expect(during.candidateList.recomputing).toBe(true);
    expect(during.opponentPanel.recomputing).toBe(true);
    expect(during.userRoster.recomputing).toBe(true);
    // Stale data stays visible, flagged — never blanked.
    expect(during.candidateList.data.rows.map((r) => r.playerId)).toEqual(beforeRows);
    expect(during.candidateList.boardVersion).toBe(beforeVersion);
    // The board itself is current immediately: only the derived insights lag.
    expect(during.pickFeed).toHaveLength(1);

    await waitForRecompute(harness.orchestrator, before);
    const after = harness.orchestrator.snapshot();
    expect(after.candidateList.recomputing).toBe(false);
    expect(after.candidateList.boardVersion).toBe(after.sync.boardVersion);
  });

  it('records one burst-refresh latency sample per burst, not one per pick (AC-67)', async () => {
    const harness = await standUp({ config: { burstDebounceMs: 120 } });
    const before = harness.orchestrator.recomputeCount;

    for (let i = 0; i < 3; i += 1) {
      harness.scenario.advance(1);
      await harness.orchestrator.pollOnce();
    }
    await waitForRecompute(harness.orchestrator, before);

    const bursts = harness.observability
      .samples()
      .filter((sample) => sample.type === 'burst-refreshed');
    expect(bursts).toHaveLength(1);
    expect(bursts[0]).toMatchObject({ pickCount: 3 });
    expect((bursts[0] as { latencyMs: number }).latencyMs).toBeGreaterThanOrEqual(0);
    expect((bursts[0] as { latencyMs: number }).latencyMs).toBeLessThan(
      harness.config.insightRefreshLatencyMs,
    );

    // AC-66's per-pick lag is recorded too, so a rehearsal can judge both bars.
    expect(harness.observability.pickLagSummary()?.count).toBeGreaterThan(0);
    expect(harness.orchestrator.metrics().burstLatency?.count).toBe(1);
  });

  it('broadcasts the recomputing snapshot and then the settled one', async () => {
    const harness = await standUp({ config: { burstDebounceMs: 120 } });
    const seen: boolean[] = [];
    harness.orchestrator.subscribe((snapshot) => seen.push(snapshot.candidateList.recomputing));

    const before = harness.orchestrator.recomputeCount;
    harness.scenario.advance(1);
    await harness.orchestrator.pollOnce();
    await waitForRecompute(harness.orchestrator, before);

    expect(seen[0]).toBe(true);
    expect(seen.at(-1)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The sync indicator, degraded state and recovery (FR-3: AC-16, AC-17, AC-19, AC-48)
// ---------------------------------------------------------------------------------------------

describe('sync indicator and degraded state', () => {
  it('flags sync degraded and stamps the flag onto every insight', async () => {
    const harness = await standUp();

    harness.scenario.failNextPicks({ kind: 'malformed' });
    await harness.orchestrator.pollOnce();

    const snapshot = harness.orchestrator.snapshot();
    expect(snapshot.sync.status).toBe('degraded');
    expect(snapshot.sync.degradedReason).toBeTruthy();
    expect(snapshot.userRoster.degraded).toBe(true);
    expect(snapshot.opponentPanel.degraded).toBe(true);
    expect(snapshot.candidateList.degraded).toBe(true);

    harness.scenario.clearFailures();
    await harness.orchestrator.pollOnce();
    expect(harness.orchestrator.snapshot().sync.status).toBe('healthy');
  });

  it('keeps the sync indicator moving between picks, and stops when polling stalls (AC-16)', async () => {
    const harness = await standUp({ syncTickMs: 20 });
    const broadcasts: string[] = [];
    harness.orchestrator.subscribe((snapshot) =>
      broadcasts.push(snapshot.sync.lastSuccessfulSyncAt ?? '-'),
    );

    // A successful poll that changes nothing: `BoardSync` fires no change event for it, so
    // without the ticker the indicator would sit frozen at the last pick's timestamp.
    await delay(5);
    await harness.orchestrator.pollOnce();
    await delay(60);
    expect(broadcasts.length).toBeGreaterThan(0);
    const advanced = broadcasts.at(-1);

    // A stalled loop publishes nothing new — silence is the signal, not a repeated timestamp.
    const countAfterAdvance = broadcasts.length;
    await delay(60);
    expect(broadcasts.length).toBe(countAfterAdvance);
    expect(broadcasts.at(-1)).toBe(advanced);
  });

  it('rebuilds the whole board out of cadence on Re-sync (AC-19)', async () => {
    const harness = await standUp();
    harness.scenario.advance(5);

    const result = await harness.orchestrator.resync();

    expect(result?.ok).toBe(true);
    expect(result?.durationMs).toBeLessThan(harness.config.resyncTimeoutMs);
    expect(harness.orchestrator.snapshot().pickFeed).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------------------------
// AC-5 — an unresolved seat blocks mine-vs-opponent, next-pick and survival output
// ---------------------------------------------------------------------------------------------

describe('unresolved seat (AC-5)', () => {
  it('blocks the roster panel, the window and the recommendation until a slot is chosen', async () => {
    const harness = await standUp({ userId: null });

    const blocked = harness.orchestrator.snapshot();
    expect(blocked.attach.status).toBe('needs-manual-slot');
    expect(blocked.userRoster.data).toBeNull();
    expect(blocked.opponentPanel.data.entries).toHaveLength(0);
    expect(blocked.opponentPanel.data.window.nextUserPickNo).toBeNull();
    expect(blocked.candidateList.data.highlightPlayerId).toBeNull();
    expect(blocked.candidateList.data.disabledReason).toContain('slot');
    // The board, the teams and the pick feed keep running regardless.
    expect(blocked.board.teams).toHaveLength(10);

    const chosen = harness.orchestrator.selectSlot(4);
    expect(chosen.ok).toBe(true);

    const unblocked = harness.orchestrator.snapshot();
    expect(unblocked.attach).toMatchObject({ status: 'attached', userTeamId: 'slot-4' });
    expect(unblocked.userRoster.data?.teamId).toBe('slot-4');
    expect(unblocked.opponentPanel.data.entries.map((e) => e.pickNo)).toEqual([1, 2, 3]);
    expect(unblocked.candidateList.data.highlightPlayerId).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// AC-41 — nothing survives a detach
// ---------------------------------------------------------------------------------------------

describe('detach (AC-41)', () => {
  it('discards tendency profiles and returns to the not-attached snapshot', async () => {
    const harness = await standUp();
    harness.scenario.advance(12);
    await harness.orchestrator.pollOnce();
    await waitForRecompute(harness.orchestrator, 1);

    const learned = harness.orchestrator
      .snapshot()
      .opponentPanel.data.entries.map((entry) => entry.tendencyProfile?.pickCount ?? 0);
    expect(Math.max(...learned)).toBeGreaterThan(0);

    harness.orchestrator.detach();
    const after = harness.orchestrator.snapshot();
    expect(after.attach.status).toBe('not-attached');
    expect(after.pickFeed).toHaveLength(0);
    expect(after.opponentPanel.data.entries).toHaveLength(0);
    expect(after.preDraftCheck).toBeNull();

    // Re-attaching to the same draft starts from neutral priors, not from what was learned.
    const again = await harness.orchestrator.attach({ input: DRAFT_ID, sleeperUserId: USER_ID });
    expect(again.ok).toBe(true);
    const profiles = harness.orchestrator
      .snapshot()
      .opponentPanel.data.entries.map((entry) => entry.tendencyProfile);
    expect(profiles.every((profile) => profile?.confidence === 'early')).toBe(true);
  });
});
