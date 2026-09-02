import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import type { AppStateSnapshot } from '@sidekick/shared';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import realBundleJson from '../../test/fixtures/sleeper-real-league-draft.json';
import { createHarness, waitForRecompute } from '../../test/harness';
import type { Harness } from '../../test/harness';
import { allHandlers, sleeperPlayersFixture } from '../../test/msw/handlers';
import type { SleeperFixtureBundle } from '../../test/msw/handlers';
import { createApp } from './server';
import type { ChatRouteOptions } from './chat';

const realBundle = realBundleJson as unknown as SleeperFixtureBundle;
const DRAFT_ID = String(realBundle.draft['draft_id']);
const USER_ID = '700000000000000004';

const msw = setupServer();
beforeAll(() => {
  // Localhost calls to this suite's own Express instance must reach it, not msw.
  msw.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => {
  msw.resetHandlers();
});
afterAll(() => {
  msw.close();
});

interface Running {
  harness: Harness;
  origin: string;
  close(): Promise<void>;
}

const running: Running[] = [];
afterEach(async () => {
  while (running.length > 0) await running.pop()?.close();
  vi.restoreAllMocks();
});

const start = async (
  options: { attach?: boolean; chat?: ChatRouteOptions } = {},
): Promise<Running> => {
  const harness = createHarness({
    bundle: realBundle,
    visiblePicks: 0,
    players: sleeperPlayersFixture(),
    users: { willy: { user_id: USER_ID, username: 'willy', display_name: 'willy' } },
    userDrafts: {
      [USER_ID]: [{ ...(realBundle.draft as Record<string, unknown>) }],
    },
  });
  msw.use(...allHandlers({ scenario: harness.scenario }));

  const app = createApp(harness.orchestrator, { serveWeb: false, chat: options.chat });
  const server: Server = await new Promise((resolve) => {
    const listening = app.listen(0, () => {
      resolve(listening);
    });
  });
  const { port } = server.address() as AddressInfo;

  const entry: Running = {
    harness,
    origin: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve) => {
        harness.dispose();
        // SSE connections are open by design; drop them so `close` is not waiting on a live tab.
        server.closeAllConnections();
        server.close(() => {
          resolve();
        });
      }),
  };
  running.push(entry);

  if (options.attach !== false) {
    const response = await fetch(`${entry.origin}/api/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: DRAFT_ID, sleeperUserId: USER_ID }),
    });
    expect(response.status).toBe(200);
  }

  return entry;
};

/** One open SSE connection, with the handle needed to hang it up afterwards. */
interface Stream {
  response: Response;
  abort: () => void;
}

/**
 * Opens `/events`.
 *
 * Aborting the request is how the connection is closed, not `reader.cancel()`: cancelling the
 * reader on an endless stream leaves undici waiting for an end that never comes and wedges the
 * suite. The abort also reaches the server, which is what fires the route's `close` handler.
 */
const openStream = async (origin: string): Promise<Stream> => {
  const controller = new AbortController();
  const response = await fetch(`${origin}/events`, { signal: controller.signal });
  const stream: Stream = {
    response,
    abort: () => {
      controller.abort();
    },
  };
  streams.push(stream);
  return stream;
};

const streams: Stream[] = [];
afterEach(() => {
  while (streams.length > 0) streams.pop()?.abort();
});

/**
 * Collects SSE `data:` frames until `count` have arrived or the deadline passes. A deadline
 * rather than an unbounded read, so a missing broadcast fails an assertion instead of hanging.
 */
const readFrames = async (stream: Stream, count: number, timeoutMs = 3000): Promise<string[]> => {
  const reader = stream.response.body!.getReader();
  const decoder = new TextDecoder();
  const frames: string[] = [];
  let buffer = '';

  const expired = Symbol('timeout');
  const deadline = new Promise<typeof expired>((resolve) => {
    setTimeout(() => {
      resolve(expired);
    }, timeoutMs);
  });

  try {
    while (frames.length < count) {
      const next = await Promise.race([reader.read(), deadline]);
      if (next === expired || next.done) break;

      buffer += decoder.decode(next.value, { stream: true });
      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const raw = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        const payload = raw
          .split('\n')
          .filter((line) => line.startsWith('data: '))
          .map((line) => line.slice(6))
          .join('\n');
        if (payload !== '') frames.push(payload);
        boundary = buffer.indexOf('\n\n');
      }
    }
  } finally {
    reader.releaseLock();
  }

  return frames;
};

// ---------------------------------------------------------------------------------------------
// REST
// ---------------------------------------------------------------------------------------------

describe('REST endpoints', () => {
  it('POST /api/attach attaches and answers with the whole snapshot', async () => {
    const { origin } = await start({ attach: false });

    const response = await fetch(`${origin}/api/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        input: `https://sleeper.com/draft/nfl/${DRAFT_ID}`,
        sleeperUserId: USER_ID,
      }),
    });
    expect(response.status).toBe(200);

    const snapshot = (await response.json()) as AppStateSnapshot;
    expect(snapshot.attach).toMatchObject({ status: 'attached', draftId: DRAFT_ID });
    expect(snapshot.board.teams).toHaveLength(10);
  });

  it('POST /api/attach reports the failure kind and echoes the input back (AC-7)', async () => {
    const { origin } = await start({ attach: false });

    const response = await fetch(`${origin}/api/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: 'https://sleeper.com/draft/nfl/nope' }),
    });

    expect(response.status).toBe(400);
    const body = (await response.json()) as { failure: { kind: string; input: string } };
    expect(body.failure).toMatchObject({
      kind: 'invalid-input',
      input: 'https://sleeper.com/draft/nfl/nope',
    });
  });

  it('POST /api/attach with a draftSlot resolves AC-5 on the same route', async () => {
    const { origin, harness } = await start({ attach: false });

    await fetch(`${origin}/api/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: DRAFT_ID }),
    });
    expect(harness.orchestrator.snapshot().attach.status).toBe('needs-manual-slot');

    const response = await fetch(`${origin}/api/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ draftSlot: 4 }),
    });

    expect(response.status).toBe(200);
    const snapshot = (await response.json()) as AppStateSnapshot;
    expect(snapshot.attach).toMatchObject({ status: 'attached', userTeamId: 'slot-4' });
  });

  it('POST /api/resync rebuilds the board out of cadence (AC-19)', async () => {
    const { origin, harness } = await start();
    harness.scenario.advance(6);

    const response = await fetch(`${origin}/api/resync`, { method: 'POST' });
    expect(response.status).toBe(200);

    const body = (await response.json()) as { ok: boolean; durationMs: number };
    expect(body.ok).toBe(true);
    expect(harness.orchestrator.snapshot().pickFeed).toHaveLength(6);
  });

  it('POST /api/chat keeps model credentials server-side and grounds the question in live state', async () => {
    let modelRequest: { url: string; init: RequestInit } | null = null;
    const modelFetch: typeof fetch = vi.fn(async (url, init) => {
      modelRequest = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({
          output: [{ type: 'message', content: [{ type: 'output_text', text: 'Take the WR.' }] }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    });
    const { origin, harness } = await start({ chat: { fetchImpl: modelFetch } });

    const configure = await fetch(`${origin}/api/chat/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'openai', apiKey: 'server-secret', model: 'test-model' }),
    });
    expect(configure.status).toBe(201);
    expect(await configure.clone().json()).not.toHaveProperty('apiKey');
    const cookie = configure.headers.get('set-cookie')?.split(';')[0];
    expect(cookie).toMatch(/^sidekick_chat_session=/);

    const response = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ message: 'Why this player over a WR?' }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      answer: 'Take the WR.',
      provider: 'openai',
      model: 'test-model',
      boardVersion: harness.orchestrator.snapshot().sync.boardVersion,
    });
    expect(modelRequest).not.toBeNull();
    const captured = modelRequest as unknown as { url: string; init: RequestInit };
    expect(captured.url).toBe('https://api.openai.com/v1/responses');
    expect((captured.init.headers as Record<string, string>)['Authorization']).toBe(
      'Bearer server-secret',
    );
    const body = JSON.parse(String(captured.init.body)) as {
      input: string;
      instructions: string;
      model: string;
    };
    expect(body.model).toBe('test-model');
    expect(body.input).toContain('Why this player over a WR?');
    expect(body.input).toContain('"scoringSettings"');
    expect(body.input).toContain('"availableRankedPlayers"');
    expect(body.input).toContain('"teamRosters"');
    expect(body.input).toContain('"decisionInterpretation"');
    expect(body.input).toContain('"tacticalOpponentSummary"');
    expect(body.input).toContain('"highProbabilityMeaning"');
    expect(body.instructions).toMatch(/A HIGH survival\s+probability supports WAITING/);
    expect(body.instructions).toMatch(/name the actual\s+teams or slots/);
    expect(body.instructions).toContain('not a reader narrating a table');
  });

  it('POST /api/chat explains how to configure chat without affecting the draft', async () => {
    const { origin } = await start();
    const response = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: 'What should I do?' }),
    });

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'chat-not-configured',
      error: expect.stringContaining('OpenAI or Anthropic'),
    });
  });

  it('POST /api/chat supports Anthropic BYOK and forgets the in-memory session', async () => {
    let modelRequest: { url: string; init: RequestInit } | null = null;
    const modelFetch: typeof fetch = vi.fn(async (url, init) => {
      modelRequest = { url: String(url), init: init ?? {} };
      return new Response(
        JSON.stringify({ content: [{ type: 'text', text: 'Wait on tight end.' }] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    });
    const { origin } = await start({ chat: { fetchImpl: modelFetch } });
    const configure = await fetch(`${origin}/api/chat/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'anthropic', apiKey: 'sk-ant-user-secret' }),
    });
    const cookie = configure.headers.get('set-cookie')?.split(';')[0];

    const response = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ message: 'Should I draft a TE?' }),
    });
    expect(await response.json()).toMatchObject({
      answer: 'Wait on tight end.',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });
    const captured = modelRequest as unknown as { url: string; init: RequestInit };
    expect(captured.url).toBe('https://api.anthropic.com/v1/messages');
    expect((captured.init.headers as Record<string, string>)['X-Api-Key']).toBe(
      'sk-ant-user-secret',
    );
    expect((captured.init.headers as Record<string, string>)['anthropic-version']).toBe(
      '2023-06-01',
    );

    expect(
      (
        await fetch(`${origin}/api/chat/session`, {
          method: 'DELETE',
          headers: { cookie: cookie! },
        })
      ).status,
    ).toBe(204);
    const afterForget = await fetch(`${origin}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie: cookie! },
      body: JSON.stringify({ message: 'Still there?' }),
    });
    expect(afterForget.status).toBe(503);
  });

  it('GET /api/player/:id/gamelog scores the log in the league’s own settings (AC-64)', async () => {
    const { origin } = await start();

    const response = await fetch(`${origin}/api/player/9221/gamelog`);
    expect(response.status).toBe(200);

    const card = (await response.json()) as {
      playerName: string;
      hasData: boolean;
      seasons: { season: number; games: { fantasyPoints: number }[] }[];
    };
    expect(card.hasData).toBe(true);
    // Newest season first (AC-63).
    expect(card.seasons.map((season) => season.season)).toEqual([2025, 2024]);
    // 82 rush yds + 1 rush TD + 4 rec (half-PPR) + 31 rec yds = 8.2 + 6 + 2 + 3.1 = 19.3
    expect(card.seasons[0]?.games[0]?.fantasyPoints).toBeCloseTo(19.3, 5);
  });

  it('GET /api/player/:id/gamelog states the no-data case rather than an empty table (AC-65)', async () => {
    const { origin } = await start();

    const response = await fetch(`${origin}/api/player/7564/gamelog`);
    const card = (await response.json()) as { hasData: boolean; seasons: unknown[] };
    expect(card.hasData).toBe(false);
    expect(card.seasons).toHaveLength(0);
  });

  it('GET /api/player/:id/gamelog refuses before an attach, since AC-64 needs a league', async () => {
    const { origin } = await start({ attach: false });
    const response = await fetch(`${origin}/api/player/9221/gamelog`);
    expect(response.status).toBe(409);
  });

  it('GET /api/config exposes the active AS-N values read-only', async () => {
    const { origin, harness } = await start({ attach: false });

    const config = (await (await fetch(`${origin}/api/config`)).json()) as Record<string, unknown>;
    expect(config['burstDebounceMs']).toBe(harness.config.burstDebounceMs);
    expect(config['candidateListDefaultRows']).toBe(8);

    // The browser can never write config: overrides are a file edit plus a restart.
    const write = await fetch(`${origin}/api/config`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ burstDebounceMs: 9999 }),
    });
    expect(write.status).toBe(404);
  });

  it('GET /api/debug/metrics surfaces the AC-66/AC-67 samples', async () => {
    const { origin, harness } = await start();
    const before = harness.orchestrator.recomputeCount;
    harness.scenario.advance(2);
    await harness.orchestrator.pollOnce();
    await waitForRecompute(harness.orchestrator, before);

    const metrics = (await (await fetch(`${origin}/api/debug/metrics`)).json()) as {
      pickLag: { count: number } | null;
      burstLatency: { count: number } | null;
      samples: unknown[];
    };
    expect(metrics.pickLag?.count).toBeGreaterThan(0);
    expect(metrics.burstLatency?.count).toBe(1);
    expect(metrics.samples.length).toBeGreaterThan(0);
  });

  it('GET /api/player/:id/gamelog answers the no-data card for a prototype-shaped id', async () => {
    const { origin } = await start();

    // These are not hypothetical keys: they are every id a browser can send that names an
    // `Object.prototype` member, and a plain `players[id]` read returns the inherited member
    // rather than undefined — which used to reach the reader and throw a 500 with a stack.
    for (const playerId of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      const response = await fetch(`${origin}/api/player/${playerId}/gamelog`);
      expect(response.status, playerId).toBe(200);

      const card = (await response.json()) as { hasData: boolean; seasons: unknown[] };
      expect(card.hasData, playerId).toBe(false);
      expect(card.seasons, playerId).toHaveLength(0);
    }
  });

  it('answers a route that throws with a clean 500 JSON, never a stack or a path', async () => {
    const { origin, harness } = await start();
    vi.spyOn(harness.orchestrator, 'resync').mockRejectedValue(
      new Error('boom at /Users/willyu/willy-ff/packages/server/src/orchestrator.ts:742'),
    );

    const response = await fetch(`${origin}/api/resync`, { method: 'POST' });
    expect(response.status).toBe(500);
    expect(response.headers.get('content-type')).toContain('application/json');

    const raw = await response.text();
    expect((JSON.parse(raw) as { error: string }).error).toEqual(expect.any(String));
    // Nothing about this machine, and nothing about where the code lives, on the wire.
    expect(raw).not.toContain('/Users/');
    expect(raw).not.toContain('orchestrator.ts');
    expect(raw).not.toContain('    at ');

    // The point of containing it: the draft session is still attached and still answering.
    const health = (await (await fetch(`${origin}/api/health`)).json()) as { status: string };
    expect(health.status).toBe('ok');
    expect(harness.orchestrator.snapshot().attach.status).toBe('attached');
  });

  it('answers a throwing attach the same way, on the other router', async () => {
    const { origin, harness } = await start({ attach: false });
    vi.spyOn(harness.orchestrator, 'attach').mockRejectedValue(new Error('boom'));

    const response = await fetch(`${origin}/api/attach`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input: DRAFT_ID }),
    });

    expect(response.status).toBe(500);
    expect((await response.json()) as { error: string }).toEqual({ error: expect.any(String) });
  });

  it('POST /api/detach tears the session down (AC-41)', async () => {
    const { origin, harness } = await start();

    const response = await fetch(`${origin}/api/detach`, { method: 'POST' });
    expect(response.status).toBe(200);
    expect(harness.orchestrator.snapshot().attach.status).toBe('not-attached');
  });
});

// ---------------------------------------------------------------------------------------------
// SSE
// ---------------------------------------------------------------------------------------------

describe('GET /events', () => {
  it('sends the current snapshot immediately on connect', async () => {
    const { origin } = await start();

    const stream = await openStream(origin);
    expect(stream.response.headers.get('content-type')).toContain('text/event-stream');

    const [first] = await readFrames(stream, 1);
    const snapshot = JSON.parse(first!) as AppStateSnapshot;
    expect(snapshot.attach.status).toBe('attached');
    expect(snapshot.board.teams).toHaveLength(10);
  });

  it('gives every connected tab byte-identical payloads (AC-15)', async () => {
    const { origin, harness } = await start();

    // Two tabs against the one running instance.
    const [streamA, streamB] = await Promise.all([openStream(origin), openStream(origin)]);

    // Three frames each: the on-connect snapshot, the recomputing one the burst raises, and the
    // settled one the cascade publishes. Started before the picks land so nothing is missed.
    const framesA = readFrames(streamA, 3);
    const framesB = readFrames(streamB, 3);

    const before = harness.orchestrator.recomputeCount;
    harness.scenario.advance(3);
    await harness.orchestrator.pollOnce();
    await waitForRecompute(harness.orchestrator, before);

    const [a, b] = await Promise.all([framesA, framesB]);
    expect(a).toHaveLength(3);
    expect(a).toEqual(b);

    expect((JSON.parse(a[1]!) as AppStateSnapshot).candidateList.recomputing).toBe(true);
    const settled = JSON.parse(a[2]!) as AppStateSnapshot;
    expect(settled.pickFeed).toHaveLength(3);
    expect(settled.candidateList.recomputing).toBe(false);
  });
});
