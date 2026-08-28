import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import mockBundleJson from '../../test/fixtures/sleeper-mock-draft.json';
import realBundleJson from '../../test/fixtures/sleeper-real-league-draft.json';
import { SleeperScenario, TEST_BASE_URL } from '../../test/msw/sleeperHandlers';
import type { SleeperFixtureBundle } from '../../test/msw/sleeperHandlers';
import { Observability } from '../observability';
import { SleeperClient } from './client';
import type { SleeperPick } from './client';
import { PollIntervalController } from './instanceHeartbeat';
import {
  BoardSync,
  checkPickListIntegrity,
  deriveDraftState,
  deriveSlotConfig,
  mapSleeperPosition,
  performFullIngest,
} from './sync';
import type { SleeperIngest } from './sync';

const realBundle = realBundleJson as unknown as SleeperFixtureBundle;
const mockBundle = mockBundleJson as unknown as SleeperFixtureBundle;

const USER_ID = '700000000000000004';
const REAL_DRAFT_ID = String(realBundle.draft['draft_id']);
const MOCK_DRAFT_ID = String(mockBundle.draft['draft_id']);

const picksOf = (bundle: SleeperFixtureBundle) => bundle.picks as unknown as SleeperPick[];

const ingestOf = (bundle: SleeperFixtureBundle, pickCount?: number): SleeperIngest =>
  ({
    draft: bundle.draft,
    picks: picksOf(bundle).slice(0, pickCount ?? bundle.picks.length),
    tradedPicks: bundle.tradedPicks,
    leagueUsers: bundle.leagueUsers,
  }) as unknown as SleeperIngest;

// ---------------------------------------------------------------------------------------------
// Pure derivation — no network involved.
// ---------------------------------------------------------------------------------------------

describe('settings and position mapping (AC-30)', () => {
  it('reads the roster slot structure from the draft object’s own settings', () => {
    const slots = deriveSlotConfig(
      realBundle.draft['settings'] as Record<string, number | undefined>,
    );
    expect(slots).toEqual({ QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 6 });
  });

  it('treats an absent slot key as zero rather than assuming a default league shape', () => {
    const settings = { ...(realBundle.draft['settings'] as Record<string, number>) };
    delete settings['slots_k'];
    expect(deriveSlotConfig(settings).K).toBe(0);
  });

  it('maps Sleeper’s DEF position onto the Terms vocabulary’s DST', () => {
    expect(mapSleeperPosition('DEF')).toBe('DST');
    expect(mapSleeperPosition('RB')).toBe('RB');
    expect(mapSleeperPosition('OL')).toBeNull();
    expect(mapSleeperPosition(null)).toBeNull();
  });
});

describe('teams (AC-2, AC-4, AC-5)', () => {
  it('names real-league seats from the league users, and shows an empty seat by slot alone', () => {
    const { teams, userTeamId } = deriveDraftState(ingestOf(realBundle), { userId: USER_ID });

    expect(teams).toHaveLength(10);
    expect(userTeamId).toBe('slot-4');

    const mine = teams.find((t) => t.teamId === 'slot-4');
    expect(mine).toMatchObject({
      draftSlot: 4,
      displayName: 'Play Action Heroes',
      ownerDisplayName: 'willy',
      isBotSeat: false,
      isUser: true,
      rosterId: 9,
    });

    // Slot 3's owner never named their team; slot 10 has no owner at all.
    expect(teams.find((t) => t.teamId === 'slot-3')).toMatchObject({
      displayName: null,
      ownerDisplayName: 'ninefingers',
      isBotSeat: false,
    });
    expect(teams.find((t) => t.teamId === 'slot-10')).toMatchObject({
      displayName: null,
      ownerDisplayName: null,
      isBotSeat: true,
      userId: null,
    });
  });

  it('produces the same Team shape for a mock, where only the human seat is known', () => {
    const real = deriveDraftState(ingestOf(realBundle), { userId: USER_ID });
    const mock = deriveDraftState(ingestOf(mockBundle), { userId: USER_ID });

    const shapeOf = (teams: typeof real.teams) =>
      teams.map((t) => ({ teamId: t.teamId, draftSlot: t.draftSlot, isUser: t.isUser }));

    expect(shapeOf(mock.teams)).toEqual(shapeOf(real.teams));
    expect(mock.userTeamId).toBe('slot-4');
    expect(mock.teams.find((t) => t.teamId === 'slot-7')?.isBotSeat).toBe(true);
    expect(mock.meta.isMock).toBe(true);
    expect(real.meta.isMock).toBe(false);
  });

  it('leaves the user slot unresolved when no stored user id appears in draft_order (AC-5)', () => {
    const state = deriveDraftState(ingestOf(realBundle), { userId: null });
    expect(state.userTeamId).toBeNull();
    expect(state.teams.every((t) => !t.isUser)).toBe(true);
    expect(state.pickFeed.every((p) => !p.isUserPick)).toBe(true);
  });

  it('accepts a manually selected slot when auto-detection could not resolve one (AC-5)', () => {
    const state = deriveDraftState(ingestOf(realBundle), { userId: null, manualSlot: 3 });
    expect(state.userTeamId).toBe('slot-3');
    expect(state.pickFeed.filter((p) => p.isUserPick).map((p) => p.pickNo)).toEqual([3, 18]);
  });
});

describe('board and pick feed (AC-4, AC-11, AC-12, AC-13, AC-20)', () => {
  it('attributes every pick by draft_slot, never picked_by/roster_id — identically for a mock', () => {
    const real = deriveDraftState(ingestOf(realBundle), { userId: USER_ID });
    const mock = deriveDraftState(ingestOf(mockBundle), { userId: USER_ID });

    // Round 1 carries no traded pick, so the two fixtures must agree exactly.
    for (let pickNo = 1; pickNo <= 10; pickNo += 1) {
      const playerId = String(realBundle.picks[pickNo - 1]!['player_id']);
      expect(real.board.players[playerId]).toEqual(mock.board.players[playerId]);
      expect(real.board.players[playerId]).toEqual({
        drafted: true,
        draftedByTeamId: `slot-${pickNo}`,
        pickNo,
      });
    }
  });

  it('attributes a traded pick to its current owner, not the original slot (AC-12)', () => {
    const real = deriveDraftState(ingestOf(realBundle), { userId: USER_ID });
    const mock = deriveDraftState(ingestOf(mockBundle), { userId: USER_ID });

    // Pick 14 is round 2, draft slot 7 — traded to the roster drafting from slot 2.
    expect(real.board.players['4881']).toEqual({
      drafted: true,
      draftedByTeamId: 'slot-2',
      pickNo: 14,
    });
    expect(real.pickFeed.find((p) => p.pickNo === 14)?.teamId).toBe('slot-2');

    // The mock has no traded picks, so the same seat keeps its own pick.
    expect(mock.board.players['4881']?.draftedByTeamId).toBe('slot-7');
  });

  it('rebuilds identical state from the complete pick list alone, mid-draft (AC-13)', () => {
    const wholesale = deriveDraftState(ingestOf(realBundle), { userId: USER_ID });

    let incremental = deriveDraftState(ingestOf(realBundle, 1), { userId: USER_ID });
    for (let n = 2; n <= realBundle.picks.length; n += 1) {
      incremental = deriveDraftState(ingestOf(realBundle, n), { userId: USER_ID });
    }

    expect(incremental.board).toEqual(wholesale.board);
    expect(incremental.pickFeed).toEqual(wholesale.pickFeed);
  });

  it('flags the user’s own picks and carries the raw Sleeper name on every entry (AC-11)', () => {
    const { pickFeed } = deriveDraftState(ingestOf(realBundle), { userId: USER_ID });

    expect(pickFeed).toHaveLength(22);
    expect(pickFeed[0]).toMatchObject({
      pickNo: 1,
      round: 1,
      draftSlot: 1,
      teamId: 'slot-1',
      playerId: '9509',
      playerName: 'Bijan Robinson',
      position: 'RB',
      isUserPick: false,
    });
    expect(pickFeed.filter((p) => p.isUserPick).map((p) => p.pickNo)).toEqual([4, 17]);
  });

  it('marks a drafted player the snapshot could not match, keeping its raw name (AC-20)', () => {
    const matched = new Set(picksOf(realBundle).map((p) => p.player_id));
    matched.delete('8138'); // James Cook, unmatched in this scenario

    const { pickFeed } = deriveDraftState(ingestOf(realBundle), {
      userId: USER_ID,
      matchedPlayerIds: matched,
    });

    const cook = pickFeed.find((p) => p.playerId === '8138');
    expect(cook).toMatchObject({ playerName: 'James Cook', matchedToSnapshot: false });
    expect(pickFeed.filter((p) => !p.matchedToSnapshot)).toHaveLength(1);
  });

  it('treats every pick as matched while no snapshot is loaded (AC-28 keeps the feed running)', () => {
    const { pickFeed } = deriveDraftState(ingestOf(realBundle), {
      userId: USER_ID,
      matchedPlayerIds: null,
    });
    expect(pickFeed.every((p) => p.matchedToSnapshot)).toBe(true);
  });
});

describe('checkPickListIntegrity (AC-17)', () => {
  const all = picksOf(realBundle);

  it('accepts a first response and a clean forward step', () => {
    expect(checkPickListIntegrity(null, all.slice(0, 5))).toBeNull();
    expect(checkPickListIntegrity(all.slice(0, 5), all.slice(0, 6))).toBeNull();
    expect(checkPickListIntegrity(all.slice(0, 5), all.slice(0, 5))).toBeNull();
  });

  it('rejects a response whose pick count decreased', () => {
    expect(checkPickListIntegrity(all.slice(0, 6), all.slice(0, 5))).toEqual({
      kind: 'pick-count-decreased',
      previous: 6,
      received: 5,
      message: expect.any(String),
    });
  });

  it('rejects a previously-seen pick whose player changed', () => {
    const tampered = all.slice(0, 5).map((p) => (p.pick_no === 3 ? { ...p, player_id: '1' } : p));
    expect(checkPickListIntegrity(all.slice(0, 5), tampered)).toMatchObject({
      kind: 'pick-changed',
      pickNo: 3,
      field: 'player',
    });
  });

  it('rejects a previously-seen pick whose team changed', () => {
    const tampered = all.slice(0, 5).map((p) => (p.pick_no === 3 ? { ...p, draft_slot: 9 } : p));
    expect(checkPickListIntegrity(all.slice(0, 5), tampered)).toMatchObject({
      kind: 'pick-changed',
      pickNo: 3,
      field: 'team',
    });
  });

  it('rejects a pick number that is out of sequence', () => {
    const gapped = [all[0]!, all[1]!, all[3]!];
    expect(checkPickListIntegrity(null, gapped)).toMatchObject({
      kind: 'pick-out-of-sequence',
      expected: 3,
      received: 4,
    });
  });
});

// ---------------------------------------------------------------------------------------------
// The poll engine — driven through mocked Sleeper endpoints.
// ---------------------------------------------------------------------------------------------

describe('BoardSync (FR-2, FR-3)', () => {
  let scenario: SleeperScenario;
  let server: ReturnType<typeof setupServer>;
  let clock: number;

  const config = PARAMETER_DEFAULTS;

  beforeAll(() => {
    scenario = new SleeperScenario({ bundle: realBundle, visiblePicks: 10 });
    server = setupServer(...scenario.handlers());
    server.listen({ onUnhandledRequest: 'error' });
  });

  beforeEach(() => {
    clock = 1_700_000_000_000;
    scenario.visiblePicks = 10;
    scenario.picksOverride = null;
    scenario.draftOverride = null;
    scenario.clearFailures();
    scenario.requests.length = 0;
  });

  afterEach(() => {
    server.resetHandlers(...scenario.handlers());
  });

  afterAll(() => {
    server.close();
  });

  const makeSync = async (extra: { observability?: Observability } = {}) => {
    const client = new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 600 });
    const ingest = await performFullIngest(client, REAL_DRAFT_ID, {
      timeoutMs: config.initialIngestTimeoutMs,
    });
    const sync = new BoardSync({
      client,
      config,
      ingest,
      userId: USER_ID,
      now: () => clock,
      ...extra,
    });
    scenario.requests.length = 0;
    return sync;
  };

  it('ingests settings, draft order, traded picks and every pick at attach (AC-1)', async () => {
    const client = new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 600 });
    const ingest = await performFullIngest(client, REAL_DRAFT_ID, {
      timeoutMs: config.initialIngestTimeoutMs,
    });

    expect(scenario.requests).toEqual(
      expect.arrayContaining([
        `draft:${REAL_DRAFT_ID}`,
        `picks:${REAL_DRAFT_ID}`,
        `traded_picks:${REAL_DRAFT_ID}`,
        'league_users:1200000000000000001',
      ]),
    );
    expect(ingest.picks).toHaveLength(10);
    expect(ingest.leagueUsers).toHaveLength(9);
  });

  it('skips the league-users call for a mock draft, which has no league', async () => {
    const mockScenario = new SleeperScenario({ bundle: mockBundle, visiblePicks: 3 });
    server.use(...mockScenario.handlers());

    const client = new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 600 });
    const ingest = await performFullIngest(client, MOCK_DRAFT_ID, { timeoutMs: 10_000 });

    expect(ingest.leagueUsers).toBeNull();
    expect(mockScenario.requests.some((r) => r.startsWith('league_users:'))).toBe(false);
  });

  it('applies a new pick wholesale and bumps the board version (AC-11, AC-21)', async () => {
    const sync = await makeSync();
    const before = sync.syncIndicator.boardVersion;
    const seen: number[] = [];
    sync.onNewPicks((picks) => seen.push(...picks.map((p) => p.pickNo)));

    scenario.advance(2);
    clock += 1000;
    const outcome = await sync.pollOnce();

    expect(outcome.status).toBe('applied');
    expect(seen).toEqual([11, 12]);
    expect(sync.syncIndicator.boardVersion).toBe(before + 1);
    expect(sync.state.board.players['8130']?.drafted).toBe(true); // pick 12
    expect(sync.state.board.players['4034']).toBeUndefined(); // pick 17, not yet made
    expect(sync.syncIndicator.lastSuccessfulSyncAt).toBe(new Date(clock).toISOString());
    expect(sync.syncIndicator.status).toBe('healthy');
  });

  it('follows a healthy poll sequence, bumping the board version once per changed poll', async () => {
    const sync = await makeSync();
    const versions = [sync.syncIndicator.boardVersion];
    const outcomes: string[] = [];

    for (const step of [1, 0, 3, 0, 2]) {
      scenario.advance(step);
      clock += 1000;
      const outcome = await sync.pollOnce();
      outcomes.push(outcome.status);
      versions.push(sync.syncIndicator.boardVersion);
    }

    expect(outcomes).toEqual(['applied', 'unchanged', 'applied', 'unchanged', 'applied']);
    expect(versions).toEqual([1, 2, 2, 3, 3, 4]);
    expect(sync.syncIndicator.status).toBe('healthy');
    expect(sync.state.pickFeed).toHaveLength(16);
    expect(sync.state.pickFeed.map((p) => p.pickNo)).toEqual(
      Array.from({ length: 16 }, (_, i) => i + 1),
    );
  });

  it('runs a mock draft through the same poll sequence and the same attribution', async () => {
    const mockScenario = new SleeperScenario({ bundle: mockBundle, visiblePicks: 8 });
    server.use(...mockScenario.handlers());

    const client = new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 600 });
    const ingest = await performFullIngest(client, MOCK_DRAFT_ID, { timeoutMs: 10_000 });
    const sync = new BoardSync({ client, config, ingest, userId: USER_ID, now: () => clock });

    expect(sync.state.meta.isMock).toBe(true);
    expect(sync.state.userTeamId).toBe('slot-4');

    mockScenario.advance(4);
    const outcome = await sync.pollOnce();

    expect(outcome.status).toBe('applied');
    expect(sync.state.pickFeed).toHaveLength(12);
    // Attribution came from draft_slot alone: every mock pick carries picked_by "" / roster_id null.
    expect(sync.state.pickFeed.find((p) => p.pickNo === 11)?.teamId).toBe('slot-10');
    expect(sync.state.board.players['4984']).toEqual({
      drafted: true,
      draftedByTeamId: 'slot-10',
      pickNo: 11,
    });
    expect(sync.syncIndicator.status).toBe('healthy');
  });

  it('leaves the board version alone when a poll brings nothing new', async () => {
    const sync = await makeSync();
    const before = sync.syncIndicator.boardVersion;

    const outcome = await sync.pollOnce();

    expect(outcome.status).toBe('unchanged');
    expect(sync.syncIndicator.boardVersion).toBe(before);
  });

  it.each([
    ['a malformed payload (AC-18)', () => scenario.failNextPicks({ kind: 'malformed' })],
    ['an unreachable API', () => scenario.failNextPicks({ kind: 'network' })],
    [
      'a decreasing pick count',
      () => {
        scenario.picksOverride = realBundle.picks.slice(0, 4);
      },
    ],
    [
      'an out-of-sequence pick number',
      () => {
        scenario.picksOverride = [
          ...realBundle.picks.slice(0, 10),
          { ...realBundle.picks[11]! }, // pick_no 12 with no 11 before it
        ];
      },
    ],
    [
      'a previously-seen pick that changed player',
      () => {
        scenario.picksOverride = realBundle.picks
          .slice(0, 10)
          .map((p) => (p['pick_no'] === 2 ? { ...p, player_id: '4034' } : p));
      },
    ],
  ])('marks the board degraded on %s, applying nothing (AC-17, AC-18)', async (_label, breakIt) => {
    const sync = await makeSync();
    const goodBoard = structuredClone(sync.state.board);
    const goodVersion = sync.syncIndicator.boardVersion;
    const lastGoodSync = sync.syncIndicator.lastSuccessfulSyncAt;

    breakIt();
    clock += 1000;
    const outcome = await sync.pollOnce();

    expect(outcome.status).toBe('degraded');
    expect(sync.syncIndicator.status).toBe('degraded');
    expect(sync.degradedReason?.message).toEqual(expect.any(String));
    expect(sync.state.board).toEqual(goodBoard);
    expect(sync.syncIndicator.boardVersion).toBe(goodVersion);
    expect(sync.syncIndicator.lastSuccessfulSyncAt).toBe(lastGoodSync);
  });

  it('recovers by full re-ingest on the next successful poll (AC-17)', async () => {
    const sync = await makeSync();
    const goodVersion = sync.syncIndicator.boardVersion;

    scenario.failNextPicks({ kind: 'malformed' });
    await sync.pollOnce();
    expect(sync.syncIndicator.status).toBe('degraded');

    scenario.advance(4);
    scenario.requests.length = 0;
    clock += 1000;
    const outcome = await sync.pollOnce();

    expect(outcome.status).toBe('reingested');
    expect(sync.syncIndicator.status).toBe('healthy');
    expect(sync.degradedReason).toBeNull();
    expect(sync.syncIndicator.boardVersion).toBeGreaterThan(goodVersion);
    // A re-ingest re-reads settings, draft order and traded picks, not just the pick list.
    expect(scenario.requests).toEqual(
      expect.arrayContaining([
        `draft:${REAL_DRAFT_ID}`,
        `picks:${REAL_DRAFT_ID}`,
        `traded_picks:${REAL_DRAFT_ID}`,
      ]),
    );
    expect(sync.state.pickFeed).toHaveLength(14);
  });

  it('keeps retrying while degraded rather than giving up', async () => {
    const sync = await makeSync();
    scenario.failNextPicks({ kind: 'network' }, 3);

    expect((await sync.pollOnce()).status).toBe('degraded');
    expect((await sync.pollOnce()).status).toBe('degraded');
    expect((await sync.pollOnce()).status).toBe('degraded');
    expect((await sync.pollOnce()).status).toBe('reingested');
    expect(sync.syncIndicator.status).toBe('healthy');
  });

  it('holds one steady degraded state on a persistently holed pick list, never flapping (AC-17)', async () => {
    // Live regression, 2026-08-27: a dissolving mock lobby served a pick list with pick 11
    // missing, poll after poll. Re-ingest used to adopt it and mark healthy, and the next poll
    // re-degraded — a 1 Hz degraded/recovered oscillation (15 flips in 32 s in the trace).
    const transitions: string[] = [];
    const observability = new Observability({
      sink: (sample) => {
        if (
          sample.type === 'app-event' &&
          (sample.event === 'sync-degraded' || sample.event === 'sync-recovered')
        ) {
          transitions.push(sample.event);
        }
      },
    });
    const sync = await makeSync({ observability });
    const goodBoard = structuredClone(sync.state.board);

    scenario.picksOverride = [
      ...realBundle.picks.slice(0, 10),
      { ...realBundle.picks[11]! }, // pick_no 12 with no 11 before it — and it stays that way
    ];

    for (let poll = 0; poll < 5; poll += 1) {
      clock += 1000;
      expect((await sync.pollOnce()).status).toBe('degraded');
      expect(sync.syncIndicator.status).toBe('degraded');
    }
    // One transition in, zero recoveries out, and the board stayed frozen at last-good.
    expect(transitions).toEqual(['sync-degraded']);
    expect(sync.state.board).toEqual(goodBoard);

    // The moment Sleeper's list is self-consistent again, one re-ingest recovers.
    scenario.picksOverride = null;
    scenario.advance(2);
    clock += 1000;
    expect((await sync.pollOnce()).status).toBe('reingested');
    expect(sync.syncIndicator.status).toBe('healthy');
    expect(transitions).toEqual(['sync-degraded', 'sync-recovered']);
  });

  it('rebuilds the whole board out of cadence on Re-sync, inside the budget (AC-19)', async () => {
    const sync = await makeSync();
    scenario.advance(6);
    scenario.requests.length = 0;

    const result = await sync.resync();

    expect(result.ok).toBe(true);
    expect(result.durationMs).toBeLessThan(config.resyncTimeoutMs);
    expect(scenario.requests).toEqual(
      expect.arrayContaining([
        `draft:${REAL_DRAFT_ID}`,
        `picks:${REAL_DRAFT_ID}`,
        `traded_picks:${REAL_DRAFT_ID}`,
        'league_users:1200000000000000001',
      ]),
    );
    expect(sync.state.pickFeed).toHaveLength(16);
  });

  it('reports a failed Re-sync as degraded instead of throwing (AC-18)', async () => {
    const sync = await makeSync();
    scenario.failNextPicks({ kind: 'http', status: 500 });

    const result = await sync.resync();

    expect(result.ok).toBe(false);
    expect(sync.syncIndicator.status).toBe('degraded');
  });

  it('surfaces the draft status and keeps polling between picks (AC-14)', async () => {
    const sync = await makeSync();
    expect(sync.state.meta.status).toBe('drafting');
    expect(sync.isComplete).toBe(false);

    scenario.draftOverride = { ...realBundle.draft, status: 'complete' };
    await sync.resync();

    expect(sync.state.meta.status).toBe('complete');
    expect(sync.isComplete).toBe(true);
  });

  it('records poll arrival and per-view reflection timestamps (AC-66)', async () => {
    const obs = new Observability({ now: () => clock });
    const sync = await makeSync({ observability: obs });

    scenario.advance(1);
    clock += 500;
    await sync.pollOnce();

    const kinds = obs.samples().map((s) => s.type);
    expect(kinds).toContain('poll-response');
    expect(kinds).toContain('pick-reflected');

    const summary = obs.pickLagSummary();
    expect(summary?.count).toBeGreaterThan(0);
    expect(summary?.maxMs).toBeGreaterThanOrEqual(0);
  });

  it('polls on the interval the controller reports, and stops when told to (AC-9)', async () => {
    // A hand-rolled fetch rather than msw: fake timers and a real interceptor do not mix, and the
    // behaviour under test is the scheduling, not the transport.
    const respond = (body: unknown): Promise<Response> =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      } as unknown as Response);

    let pickCalls = 0;
    const client = new SleeperClient({
      baseUrl: TEST_BASE_URL,
      apiBudgetPerMin: 6000,
      fetchImpl: (input) => {
        if (input.endsWith('/picks')) {
          pickCalls += 1;
          return respond(realBundle.picks.slice(0, 10));
        }
        if (input.endsWith('/traded_picks')) return respond(realBundle.tradedPicks);
        if (input.endsWith('/users')) return respond(realBundle.leagueUsers);
        return respond(realBundle.draft);
      },
    });

    const controller = new PollIntervalController({
      config,
      filePath: '/nonexistent/draft-sidekick-instances.json',
      pid: process.pid,
    });
    const ingest = await performFullIngest(client, REAL_DRAFT_ID, { timeoutMs: 10_000 });
    const sync = new BoardSync({
      client,
      config,
      ingest,
      userId: USER_ID,
      intervalController: controller,
    });
    expect(controller.effectiveIntervalMs()).toBe(config.pollIntervalMs);
    pickCalls = 0;

    vi.useFakeTimers();
    try {
      sync.start();
      await vi.advanceTimersByTimeAsync(config.pollIntervalMs * 3 + 50);
      expect(pickCalls).toBe(3);

      sync.stop();
      await vi.advanceTimersByTimeAsync(config.pollIntervalMs * 5);
      expect(pickCalls).toBe(3);
    } finally {
      vi.useRealTimers();
    }
  });
});
