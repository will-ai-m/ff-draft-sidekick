/**
 * `GET /api/player/:sleeperPlayerId/gamelog` — FR-11's card data (AC-61 … AC-65).
 *
 * Served from T9's runtime reader over the local nflverse cache, scored **per request** in the
 * attached league's own settings (AC-64). That is why this refuses before an attach rather than
 * falling back to a generic format: a card scored in some other league's points would be a
 * plausible-looking wrong answer, which is worse than no answer.
 *
 * A player with no cached games comes back as an explicit `hasData: false` card, never an empty
 * table (AC-65) — that is the reader's contract, not this route's branch.
 */
import { Router } from 'express';

import type { Orchestrator } from '../orchestrator';

export function createPlayerGamelogRouter(orchestrator: Orchestrator): Router {
  const router = Router();

  router.get('/api/player/:sleeperPlayerId/gamelog', (req, res) => {
    const playerId = String(req.params['sleeperPlayerId']);
    const card = orchestrator.playerCard(playerId);

    if (card === null) {
      res.status(409).json({
        error:
          'No draft is attached. Game-log points are computed from the attached league’s own ' +
          'scoring settings, so there is nothing to score this log with yet.',
      });
      return;
    }

    res.json(card);
  });

  return router;
}
