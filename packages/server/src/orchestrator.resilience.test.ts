/**
 * The orchestrator's failure modes, as automated checks.
 *
 * Everything here is about what happens when something *below* the orchestrator misbehaves — a
 * cascade that throws, a third party that never answers. The happy paths live in
 * `orchestrator.test.ts`; these are the ones a code review found could take the process down or
 * hang an attach, so each one asserts the containment rather than the feature.
 */
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import realBundleJson from '../test/fixtures/sleeper-real-league-draft.json';
import { createHarness, delay, waitForRecompute } from '../test/harness';
import type { Harness } from '../test/harness';
import { allHandlers, sleeperPlayersFixture } from '../test/msw/handlers';
import type { SleeperFixtureBundle } from '../test/msw/handlers';

/**
 * The one seam that makes "a recompute threw" reproducible.
 *
 * `simulateSurvival` genuinely throws on a picks/window length mismatch (a wiring bug it refuses
 * to paper over), and that throw is the real one this suite is about — but no fixture can produce
 * it through the orchestrator, because the orchestrator is what does the wiring. So the module is
 * passed through untouched until a test arms the flag.
 */
const seam = vi.hoisted(() => ({ survivalThrows: false }));

vi.mock('./simulation/montecarlo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./simulation/montecarlo')>();
  return {
    ...actual,
    simulateSurvival: (input: Parameters<typeof actual.simulateSurvival>[0]) => {
      if (seam.survivalThrows) {
        throw new Error('simulateSurvival: 3 simulated picks for a window of 4');
      }
      return actual.simulateSurvival(input);
    },
  };
});

const realBundle = realBundleJson as unknown as SleeperFixtureBundle;
const USER_ID = '700000000000000004';
const DRAFT_ID = String(realBundle.draft['draft_id']);

const server = setupServer();
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterEach(() => {
  server.resetHandlers();
  seam.survivalThrows = false;
});
afterAll(() => {
  server.close();
});

const harnesses: Harness[] = [];
afterEach(() => {
  while (harnesses.length > 0) harnesses.pop()?.dispose();
});

type SnapshotOptions = Omit<Parameters<typeof allHandlers>[0], 'scenario'>;

const standUp = async (
  options: {
    config?: Parameters<typeof createHarness>[0]['config'];
    snapshots?: SnapshotOptions;
    attach?: boolean;
  } = {},
): Promise<Harness> => {
  const harness = createHarness({
    bundle: realBundle,
    visiblePicks: 0,
    players: sleeperPlayersFixture(),
    ...(options.config === undefined ? {} : { config: options.config }),
  });
  harnesses.push(harness);

  server.use(...allHandlers({ ...options.snapshots, scenario: harness.scenario }));

  if (options.attach !== false) {
    const result = await harness.orchestrator.attach({
      input: `https://sleeper.com/draft/nfl/${DRAFT_ID}`,
      sleeperUserId: USER_ID,
    });
    expect(result.ok, JSON.stringify(result)).toBe(true);
  }
  return harness;
};

// ---------------------------------------------------------------------------------------------
// A throwing recompute (B2)
// ---------------------------------------------------------------------------------------------

describe('a recompute that throws', () => {
  it('degrades the insights instead of killing the process', async () => {
    const harness = await standUp();
    const { orchestrator } = harness;
    const before = orchestrator.recomputeCount;

    seam.survivalThrows = true;
    harness.scenario.advance(2);
    await orchestrator.pollOnce();
    // The burst timer is armed by the poll; its callback is where the throw would have escaped to
    // the event loop and exited the process. Waiting past the debounce is the whole test.
    await delay(harness.config.burstDebounceMs * 5);

    // It really did throw: the cascade never completed.
    expect(orchestrator.recomputeCount).toBe(before);

    const snapshot = orchestrator.snapshot();
    // The board itself is fine and current — the poll applied cleanly.
    expect(snapshot.pickFeed).toHaveLength(2);
    // …but nothing derived from it can be presented as current (AC-17/AC-48).
    expect(snapshot.sync.status).toBe('degraded');
    expect(snapshot.sync.degradedReason).toContain('simulateSurvival');
    expect(snapshot.candidateList.degraded).toBe(true);
    expect(snapshot.opponentPanel.degraded).toBe(true);
    expect(snapshot.userRoster.degraded).toBe(true);
    // And it is honest about *why* the panels are behind: the board moved, this view did not.
    expect(snapshot.candidateList.recomputing).toBe(true);

    // The reason is logged, not swallowed (AC-66's sink is where an operator sees it).
    expect(
      harness.observability.samples().filter((sample) => sample.type === 'cascade-failed'),
    ).toHaveLength(1);
  });

  it('broadcasts the degraded state rather than leaving the browser on a stale frame', async () => {
    const harness = await standUp();
    const frames: string[] = [];
    harness.orchestrator.subscribe((snapshot) => {
      frames.push(snapshot.sync.status);
    });

    seam.survivalThrows = true;
    harness.scenario.advance(1);
    await harness.orchestrator.pollOnce();
    await delay(harness.config.burstDebounceMs * 5);

    expect(frames.at(-1)).toBe('degraded');
  });

  it('recovers on the next cascade that succeeds', async () => {
    const harness = await standUp();
    const { orchestrator } = harness;

    seam.survivalThrows = true;
    harness.scenario.advance(2);
    await orchestrator.pollOnce();
    await delay(harness.config.burstDebounceMs * 5);
    expect(orchestrator.snapshot().sync.status).toBe('degraded');

    seam.survivalThrows = false;
    const before = orchestrator.recomputeCount;
    harness.scenario.advance(1);
    await orchestrator.pollOnce();
    await waitForRecompute(orchestrator, before);

    const snapshot = orchestrator.snapshot();
    expect(snapshot.sync.status).toBe('healthy');
    expect(snapshot.sync.degradedReason).toBeNull();
    expect(snapshot.candidateList.degraded).toBe(false);
    expect(snapshot.candidateList.recomputing).toBe(false);
  });

  it('contains the same throw on the Re-sync path, which flushes the burst by hand', async () => {
    const harness = await standUp();
    const { orchestrator } = harness;

    seam.survivalThrows = true;
    harness.scenario.advance(3);
    const result = await orchestrator.resync();

    // Re-sync itself succeeded — it is the cascade after it that failed.
    expect(result?.ok).toBe(true);
    expect(orchestrator.snapshot().sync.status).toBe('degraded');
    expect(orchestrator.snapshot().pickFeed).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------------------------
// Third-party snapshot fetches (B3)
// ---------------------------------------------------------------------------------------------

describe('the snapshot fetches at attach', () => {
  it('bounds the third-party fetches with 🔶 snapshotFetchTimeoutMs instead of hanging attach', async () => {
    const started = Date.now();
    const harness = await standUp({
      config: { snapshotFetchTimeoutMs: 150 },
      snapshots: { ecrDelayMs: 4000, adpDelayMs: 4000 },
    });
    const elapsed = Date.now() - started;

    // Attach still succeeds: AC-28 keeps board sync, the roster panel and the pick feed running.
    expect(harness.orchestrator.snapshot().attach.status).toBe('attached');
    // It answered inside its own budget rather than undici's ~300 s default.
    expect(elapsed).toBeLessThan(3000);

    const warnings = harness.orchestrator.snapshot().preDraftCheck?.warnings ?? [];
    expect(warnings.map((warning) => warning.code)).toContain('no-ecr-loaded');
  });

  it('leaves a responsive third party alone — the timeout is a ceiling, not a deadline to hit', async () => {
    const harness = await standUp({ config: { snapshotFetchTimeoutMs: 5000 } });
    const warnings = harness.orchestrator.snapshot().preDraftCheck?.warnings ?? [];
    expect(warnings.map((warning) => warning.code)).not.toContain('no-ecr-loaded');
  });
});

// ---------------------------------------------------------------------------------------------
// Prototype-shaped player ids (B4)
// ---------------------------------------------------------------------------------------------

describe('player ids that name an Object.prototype member', () => {
  it('answers AC-65’s no-data card rather than throwing out of the index read', async () => {
    const harness = await standUp();

    for (const playerId of ['__proto__', 'constructor', 'toString', 'valueOf', 'hasOwnProperty']) {
      const card = harness.orchestrator.playerCard(playerId);
      expect(card, playerId).not.toBeNull();
      expect(card?.hasData, playerId).toBe(false);
      expect(card?.seasons, playerId).toHaveLength(0);
      // The name falls back to the id, never to a stringified prototype member.
      expect(card?.playerName, playerId).toBe(playerId);
    }
  });
});
