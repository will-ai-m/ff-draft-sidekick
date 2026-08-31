import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import mockBundleJson from '../../test/fixtures/sleeper-mock-draft.json';
import realBundleJson from '../../test/fixtures/sleeper-real-league-draft.json';
import { SleeperScenario, TEST_BASE_URL } from '../../test/msw/sleeperHandlers';
import type { SleeperFixtureBundle } from '../../test/msw/sleeperHandlers';
import { AttachManager, parseDraftId } from './attach';
import { SleeperClient } from './client';

const realBundle = realBundleJson as unknown as SleeperFixtureBundle;
const mockBundle = mockBundleJson as unknown as SleeperFixtureBundle;

const REAL_DRAFT_ID = String(realBundle.draft['draft_id']);
const MOCK_DRAFT_ID = String(mockBundle.draft['draft_id']);
const USER_ID = '700000000000000004';

const config = PARAMETER_DEFAULTS;

describe('parseDraftId (FR-1)', () => {
  it.each([
    ['1200000000000000002', '1200000000000000002'],
    ['  1200000000000000002  ', '1200000000000000002'],
    ['https://sleeper.com/draft/nfl/1200000000000000002', '1200000000000000002'],
    ['https://sleeper.app/draft/nfl/1200000000000000002/', '1200000000000000002'],
    ['sleeper.com/draft/nfl/1200000000000000002?tab=board', '1200000000000000002'],
    ['https://sleeper.com/draft/nfl/1200000000000000002#pick', '1200000000000000002'],
  ])('extracts the draft id from %s', (input, expected) => {
    expect(parseDraftId(input)).toBe(expected);
  });

  it.each([[''], ['   '], ['https://sleeper.com/leagues/nfl'], ['not-a-draft'], ['12ab34']])(
    'rejects %s',
    (input) => {
      expect(parseDraftId(input)).toBeNull();
    },
  );
});

describe('AttachManager (FR-1)', () => {
  let scenario: SleeperScenario;
  let server: ReturnType<typeof setupServer>;
  let manager: AttachManager;

  const newManager = () =>
    new AttachManager({
      client: new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 600 }),
      config,
    });

  beforeAll(() => {
    scenario = new SleeperScenario({
      bundle: realBundle,
      visiblePicks: 10,
      users: {
        willy: { user_id: USER_ID, username: 'willy', display_name: 'willy' },
      },
      userDrafts: {
        [USER_ID]: [realBundle.draft, mockBundle.draft],
      },
    });
    server = setupServer(...scenario.handlers());
    server.listen({ onUnhandledRequest: 'error' });
  });

  beforeEach(() => {
    scenario.visiblePicks = 10;
    scenario.clearFailures();
    scenario.requests.length = 0;
    manager = newManager();
  });

  afterEach(() => {
    manager.detach();
    server.resetHandlers(...scenario.handlers());
  });

  afterAll(() => {
    server.close();
  });

  it('attaches from a pasted draft URL and completes a full initial ingest (AC-1, AC-2)', async () => {
    const started = Date.now();
    const result = await manager.attach({
      input: `https://sleeper.com/draft/nfl/${REAL_DRAFT_ID}`,
      sleeperUserId: USER_ID,
    });

    expect(result.ok).toBe(true);
    expect(Date.now() - started).toBeLessThan(config.initialIngestTimeoutMs);
    if (!result.ok) return;

    expect(result.attach).toMatchObject({
      status: 'attached',
      draftId: REAL_DRAFT_ID,
      isMock: false,
      userTeamId: 'slot-4',
    });
    expect(result.session.sync.state.teams).toHaveLength(10);
    expect(result.session.sync.state.pickFeed).toHaveLength(10);
    expect(result.session.sync.state.meta.slots).toMatchObject({ RB: 2, WR: 2, DST: 1 });
    expect(result.session.sync.state.meta.scoringType).toBe('half_ppr');
  });

  it('attaches to a mock draft, whose only scoring signal is the coarse label', async () => {
    const mockScenario = new SleeperScenario({ bundle: mockBundle, visiblePicks: 6 });
    server.use(...mockScenario.handlers());

    const result = await manager.attach({ input: MOCK_DRAFT_ID, sleeperUserId: USER_ID });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attach).toMatchObject({ status: 'attached', isMock: true, userTeamId: 'slot-4' });
    expect(result.session.sync.state.meta.scoringType).toBe('half_ppr');
    // No league to fetch a granular per-stat dict from — the structural gap FR-11 must fall back on.
    expect(result.session.sync.state.meta.leagueId).toBeNull();
  });

  it('blocks on a manual slot choice when the user id is not in draft_order (AC-5)', async () => {
    const result = await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: null });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attach.status).toBe('needs-manual-slot');
    expect(result.attach.userTeamId).toBeUndefined();
    expect(result.session.needsManualSlot).toBe(true);
    expect(result.session.sync.state.userTeamId).toBeNull();

    const chosen = manager.selectSlot(4);
    expect(chosen.ok).toBe(true);
    expect(manager.attachState()).toMatchObject({ status: 'attached', userTeamId: 'slot-4' });
    expect(manager.session?.sync.state.pickFeed.filter((p) => p.isUserPick)).toHaveLength(1);
  });

  it('never guesses a slot from an unknown user id', async () => {
    const result = await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: 'someone-else' });
    expect(result.ok && result.attach.status).toBe('needs-manual-slot');
  });

  it('rejects a slot outside the draft', async () => {
    await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: null });
    const bad = manager.selectSlot(11);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.failure.kind).toBe('invalid-input');
  });

  it('attaches to exactly one draft per running instance (AC-6)', async () => {
    await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: USER_ID });
    const second = await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: USER_ID });

    expect(second.ok).toBe(false);
    if (second.ok) return;
    expect(second.failure.kind).toBe('already-attached');
    expect(second.failure.message).toMatch(/second/i);
    expect(manager.attachState().status).toBe('attached');
  });

  it('attaches again after an explicit detach, discarding the previous session', async () => {
    await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: USER_ID });
    manager.detach();
    expect(manager.session).toBeNull();
    expect(manager.attachState().status).toBe('not-attached');

    const again = await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: USER_ID });
    expect(again.ok).toBe(true);
  });

  it.each([
    ['an input that carries no draft id', 'https://sleeper.com/leagues/nfl', 'invalid-input'],
    ['a draft id that does not exist', '999999999999999999', 'draft-not-found'],
  ])('states which failure occurred for %s, keeping the input (AC-7)', async (_l, input, kind) => {
    const result = await manager.attach({ input, sleeperUserId: USER_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe(kind);
    expect(result.failure.input).toBe(input);
    expect(result.failure.message.length).toBeGreaterThan(0);
    expect(manager.attachState()).toMatchObject({ status: 'error' });
    expect(manager.session).toBeNull();
  });

  it('reports an unreachable API distinctly, and still allows an immediate retry (AC-7)', async () => {
    scenario.failNextPicks({ kind: 'network' });
    const failed = await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: USER_ID });

    expect(failed.ok).toBe(false);
    if (failed.ok) return;
    expect(failed.failure.kind).toBe('api-unreachable');
    expect(failed.failure.input).toBe(REAL_DRAFT_ID);

    const retried = await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: USER_ID });
    expect(retried.ok).toBe(true);
  });

  it('reports a malformed payload distinctly from an unreachable API (AC-18)', async () => {
    scenario.failNextPicks({ kind: 'malformed' });
    const result = await manager.attach({ input: REAL_DRAFT_ID, sleeperUserId: USER_ID });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.failure.kind).toBe('malformed-response');
  });
});
