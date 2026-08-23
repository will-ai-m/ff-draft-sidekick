import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import realBundle from '../../test/fixtures/sleeper-real-league-draft.json';
import { SleeperScenario, TEST_BASE_URL } from '../../test/msw/sleeperHandlers';
import type { SleeperFixtureBundle } from '../../test/msw/sleeperHandlers';
import {
  RequestBudget,
  SleeperApiError,
  SleeperClient,
  sleeperDraftSchema,
} from './client';

const bundle = realBundle as unknown as SleeperFixtureBundle;

const scenario = new SleeperScenario({
  bundle,
  users: {
    willy: { user_id: '700000000000000004', username: 'willy', display_name: 'willy' },
  },
  players: {
    '9509': { player_id: '9509', position: 'RB', first_name: 'Bijan', last_name: 'Robinson' },
    DET: { player_id: 'DET', position: 'DEF', first_name: 'Detroit', last_name: 'Lions' },
  },
});

const server = setupServer(...scenario.handlers());

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  scenario.clearFailures();
  scenario.requests.length = 0;
  scenario.picksOverride = null;
  scenario.draftOverride = null;
  scenario.visiblePicks = bundle.picks.length;
  server.resetHandlers(...scenario.handlers());
});
afterAll(() => {
  server.close();
});

const makeClient = (overrides: Partial<ConstructorParameters<typeof SleeperClient>[0]> = {}) =>
  new SleeperClient({ baseUrl: TEST_BASE_URL, apiBudgetPerMin: 120, ...overrides });

describe('sleeper draft schema', () => {
  it('parses a live-shaped draft object, mapping the optional per-position slot keys', () => {
    const draft = sleeperDraftSchema.parse(bundle.draft);
    expect(draft.settings.teams).toBe(10);
    expect(draft.settings.slots_def).toBe(1);
    expect(draft.metadata?.scoring_type).toBe('half_ppr');
  });

  it('accepts a draft whose settings omit a slot key entirely', () => {
    // Verified live: draft 289646328508579840 carries no `slots_k` at all.
    const settings = { ...(bundle.draft['settings'] as Record<string, unknown>) };
    delete settings['slots_k'];
    const draft = sleeperDraftSchema.parse({ ...bundle.draft, settings });
    expect(draft.settings.slots_k).toBeUndefined();
  });

  it('accepts a mock draft object whose league_id, draft_order and slot map are null', () => {
    const draft = sleeperDraftSchema.parse({
      ...bundle.draft,
      league_id: null,
      draft_order: null,
      slot_to_roster_id: null,
    });
    expect(draft.league_id).toBeNull();
    expect(draft.draft_order).toBeNull();
  });
});

describe('SleeperClient error classification', () => {
  it('fetches a draft, its picks and its traded picks', async () => {
    const client = makeClient();
    const draft = await client.getDraft(String(bundle.draft['draft_id']));
    const picks = await client.getDraftPicks(draft.draft_id);
    const traded = await client.getTradedPicks(draft.draft_id);

    expect(draft.status).toBe('drafting');
    expect(picks).toHaveLength(22);
    expect(traded).toHaveLength(1);
  });

  it('treats a null body from /v1/draft as not-found (a purged or bogus draft id)', async () => {
    const client = makeClient();
    await expect(client.getDraft('999')).rejects.toMatchObject({
      name: 'SleeperApiError',
      kind: 'not-found',
    });
  });

  it.each([
    [404, 'not-found'],
    [429, 'rate-limited'],
    [500, 'http-error'],
  ])('maps HTTP %i to kind %s', async (status, kind) => {
    scenario.failNextPicks({ kind: 'http', status });
    const client = makeClient();
    await expect(client.getDraftPicks(String(bundle.draft['draft_id']))).rejects.toMatchObject({
      kind,
      status,
    });
  });

  it('maps a transport failure to kind network', async () => {
    scenario.failNextPicks({ kind: 'network' });
    const client = makeClient();
    await expect(client.getDraftPicks(String(bundle.draft['draft_id']))).rejects.toMatchObject({
      kind: 'network',
    });
  });

  it('maps a payload that fails schema validation to kind malformed', async () => {
    scenario.failNextPicks({ kind: 'malformed' });
    const client = makeClient();
    await expect(client.getDraftPicks(String(bundle.draft['draft_id']))).rejects.toMatchObject({
      kind: 'malformed',
    });
  });

  it('maps a request that outlives its timeout to kind timeout', async () => {
    const client = new SleeperClient({
      baseUrl: TEST_BASE_URL,
      apiBudgetPerMin: 120,
      fetchImpl: (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    });
    await expect(client.getDraftPicks('1', { timeoutMs: 5 })).rejects.toMatchObject({
      kind: 'timeout',
    });
  });

  it('notifies its rate-limit callback on a 429', async () => {
    let rateLimited = 0;
    scenario.failNextPicks({ kind: 'http', status: 429 });
    const client = makeClient({
      onRateLimited: () => {
        rateLimited += 1;
      },
    });
    await expect(client.getDraftPicks(String(bundle.draft['draft_id']))).rejects.toBeInstanceOf(
      SleeperApiError,
    );
    expect(rateLimited).toBe(1);
  });
});

describe('RequestBudget (AC-10)', () => {
  it('allows exactly the configured number of requests inside a rolling minute', () => {
    let clock = 0;
    const budget = new RequestBudget(3, () => clock);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(true);
    expect(budget.tryConsume()).toBe(false);

    clock += 60_001;
    expect(budget.tryConsume()).toBe(true);
  });

  it('refuses a request that would exceed the per-minute budget rather than making it', async () => {
    const client = makeClient({ apiBudgetPerMin: 2 });
    const draftId = String(bundle.draft['draft_id']);
    await client.getDraftPicks(draftId);
    await client.getDraftPicks(draftId);
    await expect(client.getDraftPicks(draftId)).rejects.toMatchObject({
      kind: 'budget-exhausted',
    });
    expect(scenario.requests.filter((r) => r.startsWith('picks:'))).toHaveLength(2);
  });
});

describe('player dump caching', () => {
  it('fetches /v1/players/nfl once and serves later calls from memory', async () => {
    const client = makeClient();
    const first = await client.getPlayers();
    const second = await client.getPlayers();

    expect(first['9509']?.position).toBe('RB');
    expect(second).toBe(first);
    expect(scenario.requests.filter((r) => r === 'players')).toHaveLength(1);
  });
});
