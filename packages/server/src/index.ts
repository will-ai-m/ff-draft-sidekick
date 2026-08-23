import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './config/loadConfig';
import { GameLogStore } from './gamelogs/store';
import { Observability } from './observability';
import { Orchestrator } from './orchestrator';
import { installProcessGuards } from './processGuards';
import { createSidekickApp } from './routes/server';
import { SleeperClient } from './sleeper/client';
import { PollIntervalController } from './sleeper/instanceHeartbeat';

/**
 * Draft Sidekick server entrypoint.
 *
 * Builds the one orchestrator this process owns, wires every route onto it, and serves the built
 * frontend from the same port so there is never a CORS concern in the single-process launch.
 *
 * Observability samples are echoed as one structured JSON line each (AC-66/AC-67): the PRD's §14
 * protocol judges the SC-1/SC-2 p95 bars by watching a live mock rehearsal, and a terminal full of
 * `{"type":"pick-reflected","lagMs":…}` / `{"type":"burst-refreshed","latencyMs":…}` is exactly
 * what that judgment needs. `/api/debug/metrics` serves the same buffer.
 *
 * PORT is a plain environment knob, not an AS-N parameter — it is a local process detail, not a
 * product default. Keep it in step with the dev proxy in `packages/web/vite.config.ts`.
 */

const PORT = Number(process.env.PORT ?? 3001);

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIST = resolve(SERVER_ROOT, '../web/dist');

export function createServer(): { listen: () => void } {
  // Installed before anything else can throw: a draft in progress cannot be replayed, so the
  // process must outlive a bug on a branch nobody exercised. See `processGuards.ts` for the one
  // case that still exits.
  installProcessGuards({
    log: (fault) => {
      console.error(`[sidekick] ${fault.kind}: ${fault.message}`);
      if (fault.stack !== null) console.error(fault.stack);
    },
  });

  const config = loadConfig();
  const observability = new Observability({
    sink: (sample) => {
      if (sample.type !== 'poll-response') console.log(JSON.stringify(sample));
    },
  });

  const intervalController = new PollIntervalController({ config });
  const client = new SleeperClient({
    apiBudgetPerMin: config.apiBudgetPerMin,
    onRateLimited: () => {
      intervalController.recordRateLimited();
    },
  });

  // FR-11's cache is read once at startup. A missing one is not fatal: the pre-draft check says so
  // and every player card reports "no NFL game data" until `npm run prep:nflverse` has been run.
  const gameLogStore = GameLogStore.fromCacheDir();
  if (!gameLogStore.isLoaded) console.warn(`[sidekick] ${gameLogStore.reason ?? ''}`);

  const orchestrator = new Orchestrator({
    config,
    client,
    gameLogStore,
    observability,
    intervalController,
  });

  const { app } = createSidekickApp(orchestrator, config, { webDist: WEB_DIST });

  return {
    listen: () => {
      app.listen(PORT, () => {
        console.log(`[sidekick] server listening on http://localhost:${PORT}`);
      });
    },
  };
}

const entrypoint = process.argv[1] === undefined ? null : resolve(process.argv[1]);

if (entrypoint !== null && entrypoint === fileURLToPath(import.meta.url)) {
  createServer().listen();
}
