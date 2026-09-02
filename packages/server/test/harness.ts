/**
 * One place to stand a whole Draft Sidekick server up against fixtures — used by T10's
 * orchestrator suite and its REST/SSE suite.
 *
 * Everything the orchestrator would build for itself at startup is injectable here, so a test
 * drives the poll loop by hand (`pollOnce`) rather than racing a timer, and nothing touches the
 * real network, the real `data/cache/` or the real instance-heartbeat file.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import type { ParameterValues } from '@sidekick/shared';

import { GameLogStore } from '../src/gamelogs/store';
import type { GameLogCache } from '../src/gamelogs/types';
import { Observability } from '../src/observability';
import { Orchestrator } from '../src/orchestrator';
import type { OrchestratorOptions } from '../src/orchestrator';
import { SleeperClient } from '../src/sleeper/client';
import { SleeperScenario, TEST_BASE_URL } from './msw/sleeperHandlers';
import type { SleeperFixtureBundle } from './msw/sleeperHandlers';

/** A tiny two-season cache so the player card has something real to answer with (FR-11). */
export const gameLogCacheFixture = (): GameLogCache => ({
  version: 1,
  builtAt: '2026-08-01T00:00:00.000Z',
  seasons: [2025, 2024],
  players: {
    // Jahmyr Gibbs — the crosswalk-verified join every fixture in this repo hangs off.
    '9221': {
      playerId: '9221',
      name: 'Jahmyr Gibbs',
      position: 'RB',
      team: 'DET',
      seasons: {
        '2025': [
          {
            week: 1,
            opponent: 'GB',
            rushing: { att: 14, yds: 82, avg: 5.9, td: 1 },
            receiving: { tgt: 5, rec: 4, yds: 31, td: 0, long: 12, ydsPerTgt: 6.2 },
            fumbles: 0,
            fumblesLost: 0,
            twoPointConversions: { passing: 0, rushing: 0, receiving: 0 },
          },
        ],
        '2024': [
          {
            week: 1,
            opponent: 'LA',
            rushing: { att: 10, yds: 41, avg: 4.1, td: 0 },
            receiving: { tgt: 3, rec: 2, yds: 20, td: 1, long: 15, ydsPerTgt: 6.7 },
            fumbles: 1,
            fumblesLost: 1,
            twoPointConversions: { passing: 0, rushing: 0, receiving: 0 },
          },
        ],
      },
    },
  },
});

/**
 * A cache with enough bodies per position to price a positional curve — the Gibbs fixture plus
 * synthetic finishers whose single-game season totals fall off by rank, shaped like the 2026
 * half-PPR cache (RB and WR interleave through the FLEX band; TE sits well below both). What the
 * FLEX share (2026-09-02) needs to say something true; the one-player fixture above prices
 * every RB at Gibbs's tail and everyone else at 0.
 */
export const curveGameLogCacheFixture = (): GameLogCache => {
  const base = gameLogCacheFixture();
  const perGame: Record<'QB' | 'RB' | 'WR' | 'TE', (rank: number) => number> = {
    QB: (rank) => Math.max(0, 24 - 0.5 * (rank - 1)),
    RB: (rank) => Math.max(0, 21 - 0.35 * (rank - 1)),
    WR: (rank) => Math.max(0, 19.5 - 0.3 * (rank - 1)),
    TE: (rank) => Math.max(0, 13 - 0.35 * (rank - 1)),
  };
  const depth = { QB: 16, RB: 40, WR: 40, TE: 20 } as const;
  for (const position of ['QB', 'RB', 'WR', 'TE'] as const) {
    for (let rank = 1; rank <= depth[position]; rank += 1) {
      // Half-PPR pays 0.1 per rushing yard, so a one-game season of `points × 17 × 10` yards
      // scores `points` per game once the store divides the season total by 17.
      const yds = Math.round(perGame[position](rank) * 170);
      const playerId = `curve-${position}-${rank}`;
      base.players[playerId] = {
        playerId,
        name: `${position} Finisher ${rank}`,
        position,
        team: null,
        seasons: {
          '2025': [
            {
              week: 1,
              opponent: 'BYE',
              rushing: { att: 1, yds, avg: yds, td: 0 },
              fumbles: 0,
              fumblesLost: 0,
              twoPointConversions: { passing: 0, rushing: 0, receiving: 0 },
            },
          ],
        },
      };
    }
  }
  return base;
};

export interface HarnessOptions {
  bundle: SleeperFixtureBundle;
  visiblePicks?: number;
  config?: Partial<ParameterValues>;
  /** Omit for a loaded store; pass null to simulate "the prep script was never run" (T9). */
  gameLogCache?: GameLogCache | null;
  observability?: Observability;
  orchestrator?: Partial<OrchestratorOptions>;
  users?: Record<string, Record<string, unknown>>;
  userDrafts?: Record<string, Record<string, unknown>[]>;
  players?: Record<string, Record<string, unknown>>;
}

export interface Harness {
  scenario: SleeperScenario;
  orchestrator: Orchestrator;
  observability: Observability;
  config: ParameterValues;
  cacheDir: string;
  draftId: string;
  dispose(): void;
}

/**
 * A whole server's worth of wiring, minus the timers.
 *
 * `pollingEnabled: false` and `syncTickMs: 0` keep every broadcast attributable to something the
 * test did; `burstDebounceMs` is short so a real (not faked) debounce window is still quick — T2
 * already established that vitest's fake timers and msw's interceptor do not mix.
 */
export function createHarness(options: HarnessOptions): Harness {
  const cacheDir = mkdtempSync(join(tmpdir(), 'sidekick-t10-'));
  const config: ParameterValues = {
    ...PARAMETER_DEFAULTS,
    burstDebounceMs: 40,
    monteCarloRunCount: 200,
    ...options.config,
  };

  const observability = options.observability ?? new Observability();
  const client = new SleeperClient({
    baseUrl: TEST_BASE_URL,
    apiBudgetPerMin: config.apiBudgetPerMin,
  });

  const scenario = new SleeperScenario({
    bundle: options.bundle,
    ...(options.visiblePicks === undefined ? {} : { visiblePicks: options.visiblePicks }),
    ...(options.users === undefined ? {} : { users: options.users }),
    ...(options.userDrafts === undefined ? {} : { userDrafts: options.userDrafts }),
    ...(options.players === undefined ? {} : { players: options.players }),
  });

  const cache = options.gameLogCache === undefined ? gameLogCacheFixture() : options.gameLogCache;
  const gameLogStore =
    cache === null
      ? GameLogStore.fromCache(null, 'No game-log cache. Run `npm run prep:nflverse`.')
      : GameLogStore.fromCache(cache);

  const orchestrator = new Orchestrator({
    config,
    client,
    gameLogStore,
    observability,
    cacheDir,
    pollingEnabled: false,
    syncTickMs: 0,
    ...options.orchestrator,
  });

  return {
    scenario,
    orchestrator,
    observability,
    config,
    cacheDir,
    draftId: String(options.bundle.draft['draft_id']),
    dispose(): void {
      orchestrator.stop();
      rmSync(cacheDir, { recursive: true, force: true });
    },
  };
}

export const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** Waits for the debounced recompute cascade to settle, without guessing at a fixed sleep. */
export async function waitForRecompute(
  orchestrator: Orchestrator,
  from: number,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (orchestrator.recomputeCount === from) {
    if (Date.now() > deadline) throw new Error('timed out waiting for a recompute');
    await delay(5);
  }
}
