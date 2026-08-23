/**
 * `POST /api/resync` — the Re-sync control (AC-19).
 *
 * Forces an immediate out-of-cadence rebuild of the entire board from the API's complete pick
 * list, re-reading league settings, draft order and traded picks rather than just the picks. The
 * response carries the observed duration so the 🔶 `resyncTimeoutMs` budget is visible to whoever
 * pressed the button, and the fresh snapshot has already gone out over SSE by the time it returns.
 */
import { Router } from 'express';

import type { Orchestrator } from '../orchestrator';

export function createResyncRouter(orchestrator: Orchestrator): Router {
  const router = Router();

  router.post('/api/resync', (_req, res, next) => {
    // Express does not await this handler, so without the `.catch` a rejection here is a floating
    // one — which on Node 20+ exits the process, taking the attached draft with it. Handing it to
    // `next` routes it to `createSidekickApp`'s error boundary and a clean 500 instead.
    void (async () => {
      const result = await orchestrator.resync();
      if (result === null) {
        res.status(409).json({ error: 'No draft is attached, so there is nothing to re-sync.' });
        return;
      }

      res.json({
        ok: result.ok,
        durationMs: result.durationMs,
        boardVersion: result.boardVersion,
        failure: result.failure ?? null,
      });
    })().catch(next);
  });

  return router;
}
