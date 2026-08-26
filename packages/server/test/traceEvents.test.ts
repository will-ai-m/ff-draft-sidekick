/**
 * The observability contract, end to end: drive a draft through the real orchestrator against
 * fixtures and assert the trace channel tells the whole story — attach, polls, picks, recompute
 * outputs (with the recommendation and why), and detach — each stamped with the draft id.
 *
 * These are the events `data/traces/*.jsonl` persists and `npm run trace:report` reads back; if
 * this suite passes, a real draft night's trace answers "what exactly happened".
 */
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Observability } from '../src/observability';
import type { AppEventSample, RecordedSample } from '../src/observability';
import { createApp } from '../src/routes/server';
import realBundleJson from './fixtures/sleeper-real-league-draft.json';
import { createHarness, waitForRecompute } from './harness';
import type { Harness } from './harness';
import { allHandlers, sleeperPlayersFixture } from './msw/handlers';
import type { SleeperFixtureBundle } from './msw/handlers';

const realBundle = realBundleJson as unknown as SleeperFixtureBundle;
const DRAFT_ID = String(realBundle.draft['draft_id']);
const USER_ID = '700000000000000004';

const msw = setupServer();
beforeAll(() => {
  msw.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => {
  msw.resetHandlers();
});
afterAll(() => {
  msw.close();
});

const harnesses: Harness[] = [];
afterEach(() => {
  while (harnesses.length > 0) harnesses.pop()?.dispose();
});

interface Collected {
  harness: Harness;
  sink: RecordedSample[];
  events: (name: string) => (AppEventSample & { draftId: string | null })[];
}

const standUp = async (options: { attach?: boolean } = {}): Promise<Collected> => {
  const sink: RecordedSample[] = [];
  const observability = new Observability({ sink: (sample) => sink.push(sample) });
  const harness = createHarness({
    bundle: realBundle,
    visiblePicks: 0,
    players: sleeperPlayersFixture(),
    observability,
  });
  harnesses.push(harness);
  msw.use(...allHandlers({ scenario: harness.scenario }));

  if (options.attach !== false) {
    const result = await harness.orchestrator.attach({ input: DRAFT_ID, sleeperUserId: USER_ID });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  }

  return {
    harness,
    sink,
    events: (name) =>
      sink.filter(
        (sample): sample is AppEventSample & { draftId: string | null } =>
          sample.type === 'app-event' && sample.event === name,
      ),
  };
};

describe('the trace tells the attach story', () => {
  it('records the request, the success with draft shape and pre-draft check, and the seat', async () => {
    const { events } = await standUp();

    expect(events('attach-requested')).toHaveLength(1);
    const attached = events('attach-succeeded');
    expect(attached).toHaveLength(1);
    expect(attached[0]!.data).toMatchObject({
      draftId: DRAFT_ID,
      isMock: false,
      teamCount: 10,
      userTeamId: 'slot-4',
      picksAlreadyMade: 0,
    });
    // The pre-draft check rides along whole — snapshot ages and warnings included.
    expect(attached[0]!.data['preDraftCheck']).toBeTruthy();
    expect(attached[0]!.data['teams']).toHaveLength(10);
    // Attribution: the success event itself is already stamped with the draft it belongs to.
    expect(attached[0]!.draftId).toBe(DRAFT_ID);
  });

  it('records a classified attach failure', async () => {
    const { harness, events } = await standUp({ attach: false });
    const result = await harness.orchestrator.attach({ input: 'not-a-draft' });

    expect(result.ok).toBe(false);
    expect(events('attach-failed')).toHaveLength(1);
    expect(events('attach-failed')[0]!.data['kind']).toBeTruthy();
    expect(events('attach-succeeded')).toHaveLength(0);
  });
});

describe('the trace tells the draft story', () => {
  it('records every recompute with phase timings and the recommendation it produced', async () => {
    const { events } = await standUp();

    const recomputes = events('recompute');
    expect(recomputes.length).toBeGreaterThanOrEqual(1); // The opening cascade at attach.
    const first = recomputes[0]!;
    expect(first.draftId).toBe(DRAFT_ID);
    expect(first.data).toMatchObject({ boardVersion: 1, picksMade: 0, degraded: false });

    const phases = first.data['phases'] as Record<string, number>;
    for (const key of ['opponentPanelMs', 'simulationMs', 'candidateListMs']) {
      expect(phases[key]).toBeGreaterThanOrEqual(0);
    }
    const output = first.data['output'] as Record<string, unknown>;
    // The heart of the record: which player was highlighted and the reason line, verbatim.
    expect(output['highlightPlayerId']).toBeTruthy();
    expect(output['reason']).toBeTruthy();
    expect(Array.isArray(output['topRows'])).toBe(true);
    expect((output['topRows'] as unknown[]).length).toBeGreaterThan(0);
    expect(first.data['needVector']).toBeTruthy();
  });

  it('records polls (unchanged ones as noise) and each observed pick with its attribution', async () => {
    const { harness, sink, events } = await standUp();
    const from = harness.orchestrator.recomputeCount;

    // An unchanged poll: traced, flagged noise.
    await harness.orchestrator.pollOnce();
    const unchanged = events('poll').filter((e) => e.data['outcome'] === 'unchanged');
    expect(unchanged).toHaveLength(1);
    expect(unchanged[0]!.noise).toBe(true);
    // Noise stays out of the ring buffer that feeds /api/debug/metrics summaries.
    expect(
      harness.observability
        .samples()
        .some((s) => s.type === 'app-event' && s.event === 'poll' && s.data['outcome'] === 'unchanged'),
    ).toBe(false);

    // Two picks land in one poll.
    harness.scenario.advance(2);
    await harness.orchestrator.pollOnce();
    await waitForRecompute(harness.orchestrator, from);

    const applied = events('poll').filter((e) => e.data['outcome'] === 'applied');
    expect(applied).toHaveLength(1);
    expect(applied[0]!.data['newPicks']).toBe(2);
    expect(applied[0]!.noise).toBe(false);

    const observed = events('picks-observed');
    expect(observed).toHaveLength(1);
    expect(observed[0]!.data).toMatchObject({ source: 'poll', count: 2 });
    const picks = observed[0]!.data['picks'] as Record<string, unknown>[];
    expect(picks).toHaveLength(2);
    expect(picks[0]).toMatchObject({ pickNo: 1 });
    expect(picks[0]!['teamId']).toBeTruthy();
    expect(picks[0]!['playerName']).toBeTruthy();

    // The settled burst also left its SC-2 sample beside the app events.
    expect(sink.some((sample) => sample.type === 'burst-refreshed')).toBe(true);
  });

  it('records detach with session totals and stops attributing to the draft afterwards', async () => {
    const { harness, events } = await standUp();
    harness.orchestrator.detach();

    const detached = events('detached');
    expect(detached).toHaveLength(1);
    expect(detached[0]!.data).toMatchObject({ draftId: DRAFT_ID, picksSeen: 0 });
    expect(detached[0]!.draftId).toBe(DRAFT_ID); // The detach itself still belongs to the draft…

    harness.observability.recordEvent('after');
    expect(events('after')[0]!.draftId).toBeNull(); // …and nothing after it does.
  });
});

describe('the trace covers the HTTP surface', () => {
  it('accepts browser error reports and traces the access log around them', async () => {
    const { harness, events } = await standUp({ attach: false });
    const app = createApp(harness.orchestrator, {
      serveWeb: false,
      observability: harness.observability,
      traceFilePath: () => '/tmp/trace-test.jsonl',
    });
    const server: Server = await new Promise((resolve) => {
      const listening = app.listen(0, () => {
        resolve(listening);
      });
    });
    const { port } = server.address() as AddressInfo;

    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/client-log`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          kind: 'unhandledrejection',
          message: 'x'.repeat(600),
          stack: 'Error: x\n  at draft.tsx:1',
          href: 'http://localhost:5173/',
        }),
      });
      expect(response.status).toBe(204);

      const clientErrors = events('client-error');
      expect(clientErrors).toHaveLength(1);
      expect(clientErrors[0]!.data).toMatchObject({ kind: 'unhandledrejection' });
      expect((clientErrors[0]!.data['message'] as string).length).toBe(500); // Truncated hard.

      // The access log traced the same request as noise (2xx)…
      const http = events('http').filter((e) => e.data['path'] === '/api/client-log');
      expect(http).toHaveLength(1);
      expect(http[0]!.noise).toBe(true);

      // …and the debug endpoint reports where the full record lives.
      const metrics = (await (await fetch(`http://127.0.0.1:${port}/api/debug/metrics`)).json()) as {
        traceFile: string | null;
      };
      expect(metrics.traceFile).toBe('/tmp/trace-test.jsonl');
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => {
        server.close(() => {
          resolve();
        });
      });
    }
  });
});
