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
import { TraceLog } from './trace';

/**
 * Draft Sidekick server entrypoint.
 *
 * Builds the one orchestrator this process owns, wires every route onto it, and serves the built
 * frontend from the same port so there is never a CORS concern in the single-process launch.
 *
 * Observability goes to two places from one sink:
 *
 *  - **The trace file** (`data/traces/trace-*.jsonl`, one per process) receives *every* sample —
 *    polls, Sleeper requests, recompute outputs, HTTP access, client errors — the complete
 *    machine-readable record `npm run trace:report` reads back after a draft.
 *  - **The console** receives the non-noise subset as one structured JSON line each (AC-66/67):
 *    the PRD's §14 protocol judges the SC-1/SC-2 p95 bars by watching a live mock rehearsal, and
 *    a terminal of `{"type":"pick-reflected","lagMs":…}` lines is exactly what that needs.
 *
 * `/api/debug/metrics` serves the in-memory buffer plus the trace file's path.
 *
 * PORT is a plain environment knob, not an AS-N parameter — it is a local process detail, not a
 * product default. Keep it in step with the dev proxy in `packages/web/vite.config.ts`.
 */

const PORT = Number(process.env.PORT ?? 3001);

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIST = resolve(SERVER_ROOT, '../web/dist');
const TRACE_DIR = resolve(SERVER_ROOT, '../../data/traces');

export function createServer(): { listen: () => void; trace: TraceLog } {
  const trace = new TraceLog({ dir: TRACE_DIR });

  // Installed before anything else can throw: a draft in progress cannot be replayed, so the
  // process must outlive a bug on a branch nobody exercised. See `processGuards.ts` for the one
  // case that still exits. Faults go to the trace file too — the console scrolls away, the
  // post-mortem record must not.
  installProcessGuards({
    log: (fault) => {
      console.error(`[sidekick] ${fault.kind}: ${fault.message}`);
      if (fault.stack !== null) console.error(fault.stack);
      trace.write({ type: 'process-fault', ...fault });
    },
  });

  const observability = new Observability({
    sink: (sample) => {
      trace.write(sample);
      const isNoise = sample.type === 'app-event' && sample.noise;
      if (sample.type !== 'poll-response' && !isNoise) console.log(JSON.stringify(sample));
    },
  });

  const config = loadConfig();
  const intervalController = new PollIntervalController({ config });
  const client = new SleeperClient({
    apiBudgetPerMin: config.apiBudgetPerMin,
    onRateLimited: () => {
      intervalController.recordRateLimited();
    },
    // Network-level ground truth: every outbound Sleeper call with latency and outcome. Healthy
    // calls are noise (trace file only); failures — 429s included — surface on the console too.
    onRequest: (info) => {
      observability.recordEvent('sleeper-request', { ...info }, { noise: info.ok });
    },
  });

  // FR-11's cache is read once at startup. A missing one is not fatal: the pre-draft check says so
  // and every player card reports "no NFL game data" until `npm run prep:nflverse` has been run.
  const gameLogStore = GameLogStore.fromCacheDir();
  if (!gameLogStore.isLoaded) console.warn(`[sidekick] ${gameLogStore.reason ?? ''}`);

  // The trace's opening frame: everything a later reading needs to interpret the rest — the
  // effective config above all, since latency numbers mean nothing without the budgets and the
  // Monte Carlo run count that produced them.
  observability.recordEvent('server-started', {
    port: PORT,
    pid: process.pid,
    nodeVersion: process.version,
    gameLogCacheLoaded: gameLogStore.isLoaded,
    traceFile: trace.filePath,
    config,
  });

  const orchestrator = new Orchestrator({
    config,
    client,
    gameLogStore,
    observability,
    intervalController,
  });

  const { app } = createSidekickApp(orchestrator, config, {
    webDist: WEB_DIST,
    observability,
    traceFilePath: () => (trace.isDisabled ? null : trace.filePath),
  });

  return {
    trace,
    listen: () => {
      app.listen(PORT, () => {
        console.log(`[sidekick] server listening on http://localhost:${PORT}`);
        console.log(`[sidekick] trace file: ${trace.filePath}`);
      });
    },
  };
}

const entrypoint = process.argv[1] === undefined ? null : resolve(process.argv[1]);

if (entrypoint !== null && entrypoint === fileURLToPath(import.meta.url)) {
  const server = createServer();

  // The trace should end with the ending. SIGINT/SIGTERM (Ctrl-C, `concurrently`'s shutdown, the
  // stop script) get handlers so Node runs 'exit' hooks instead of dying handler-less; the 'exit'
  // hook itself writes synchronously, which is all that is allowed there.
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
      process.exit(0);
    });
  }
  process.on('exit', (code) => {
    server.trace.write({ type: 'server-stopped', exitCode: code });
  });

  server.listen();
}
