/**
 * `GET /api/config` and `GET /api/debug/metrics`.
 *
 * `/api/config` is a **read-only** projection of the active 🔶 AS-N values, for the pre-draft
 * check's display. There is deliberately no write path: overriding a parameter is an edit to
 * `config.local.json` plus a restart, the same "no in-app UI to resolve ambiguity" stance FR-4
 * already takes about unmatched snapshot entries.
 *
 * `/api/debug/metrics` surfaces AC-66/AC-67's samples. The PRD's §14 validation protocol treats
 * the p95 judgment as something a human forms while watching a mock rehearsal, so the primary
 * surface is the structured log line the orchestrator's observability sink emits per event; this
 * endpoint is the convenience view of the same buffer.
 */
import { Router } from 'express';

import type { SidekickConfig } from '../config/loadConfig';
import type { Orchestrator } from '../orchestrator';

/** How many recent samples the debug endpoint returns; the full ring buffer is larger. */
const DEBUG_SAMPLE_LIMIT = 200;

export interface ConfigRouterExtras {
  /** This process's trace file, so "where is the full record" is answerable from the browser. */
  traceFilePath?: (() => string | null) | undefined;
}

export function createConfigRouter(
  orchestrator: Orchestrator,
  config: SidekickConfig,
  extras: ConfigRouterExtras = {},
): Router {
  const router = Router();

  router.get('/api/config', (_req, res) => {
    res.json(config);
  });

  router.get('/api/debug/metrics', (_req, res) => {
    const metrics = orchestrator.metrics();
    res.json({
      pickLag: metrics.pickLag,
      burstLatency: metrics.burstLatency,
      budgets: {
        pickReflectionLatencyMs: config.pickReflectionLatencyMs,
        insightRefreshLatencyMs: config.insightRefreshLatencyMs,
      },
      traceFile: extras.traceFilePath?.() ?? null,
      samples: metrics.samples.slice(-DEBUG_SAMPLE_LIMIT),
    });
  });

  return router;
}
