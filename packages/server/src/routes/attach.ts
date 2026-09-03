/**
 * `POST /api/attach` (FR-1) and `POST /api/detach`.
 *
 * One route carries every half of attaching, as design.md §T10 specifies: a body with `input` is
 * the paste (optionally with the `rankingsFormat` to draft on), a body with `draftSlot` is AC-5's
 * manual-slot follow-up on the draft just attached, and a body with only `rankingsFormat` switches
 * the attached draft onto the other format's board, tiers and ADP (2026-09-02).
 * A failure answers 4xx with the *classified* failure and the user's input echoed back verbatim,
 * because AC-7 requires the screen to say which failure occurred and to retry without discarding
 * what was typed — the server therefore never swallows the input on the way to an error.
 */
import { RANKINGS_FORMATS, isRankingsFormat } from '@sidekick/shared';
import { Router } from 'express';

import type { Orchestrator } from '../orchestrator';
import type { AttachFailureKind } from '../sleeper/attach';

/**
 * Which failures are the caller's fault (400) and which are the world's (409/502).
 *
 * `already-attached` is 409 rather than 400: the request was well-formed, the instance simply
 * follows one draft at a time (AC-6) and the user's remedy is a second instance, not a fixed body.
 */
const STATUS_BY_FAILURE: Readonly<Record<AttachFailureKind, number>> = {
  'invalid-input': 400,
  'draft-not-found': 404,
  'api-unreachable': 502,
  'malformed-response': 502,
  timeout: 504,
  'already-attached': 409,
  'budget-exhausted': 429,
  unknown: 500,
};

interface AttachBody {
  input?: unknown;
  sleeperUserId?: unknown;
  sleeperUsername?: unknown;
  draftSlot?: unknown;
  rankingsFormat?: unknown;
}

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null);

export function createAttachRouter(orchestrator: Orchestrator): Router {
  const router = Router();

  router.post('/api/attach', (req, res, next) => {
    // `.catch(next)` is load-bearing: Express does not await this handler, so a rejection escaping
    // it is a floating one, and a floating rejection exits the process on Node 20+. See
    // `createSidekickApp`'s error boundary for what `next` answers with.
    void (async () => {
      const body = (req.body ?? {}) as AttachBody;

      // A format is validated up front whichever half of the route it accompanies: an unknown
      // string must never become a silent fall-through to the default board.
      if (body.rankingsFormat !== undefined && !isRankingsFormat(body.rankingsFormat)) {
        res.status(400).json({
          failure: {
            kind: 'invalid-input',
            message: `rankingsFormat must be one of ${RANKINGS_FORMATS.join(', ')}.`,
            input: asString(body.input) ?? String(body.rankingsFormat),
          },
        });
        return;
      }
      const rankingsFormat = isRankingsFormat(body.rankingsFormat) ? body.rankingsFormat : null;

      // AC-5's follow-up: a slot with no pasted input is a choice about the current attach.
      if (body.input === undefined && body.draftSlot !== undefined) {
        const draftSlot = Number(body.draftSlot);
        const outcome = orchestrator.selectSlot(draftSlot);
        if (!outcome.ok) {
          res.status(STATUS_BY_FAILURE[outcome.failure.kind]).json({ failure: outcome.failure });
          return;
        }
        res.json(outcome.snapshot);
        return;
      }

      // The format switch: a format with no pasted input re-attaches the current draft on it.
      if (body.input === undefined && rankingsFormat !== null) {
        const outcome = await orchestrator.switchRankingsFormat(rankingsFormat);
        if (!outcome.ok) {
          res.status(STATUS_BY_FAILURE[outcome.failure.kind]).json({ failure: outcome.failure });
          return;
        }
        res.json(outcome.snapshot);
        return;
      }

      const input = asString(body.input);
      if (input === null) {
        res.status(400).json({
          failure: {
            kind: 'invalid-input',
            message:
              'Paste a Sleeper draft URL or id, send a draftSlot to resolve your seat, or a ' +
              'rankingsFormat to switch the attached draft onto.',
            input: '',
          },
        });
        return;
      }

      const outcome = await orchestrator.attach({
        input,
        sleeperUserId: asString(body.sleeperUserId),
        sleeperUsername: asString(body.sleeperUsername),
        rankingsFormat,
      });

      if (!outcome.ok) {
        res.status(STATUS_BY_FAILURE[outcome.failure.kind]).json({ failure: outcome.failure });
        return;
      }
      res.json(outcome.snapshot);
    })().catch(next);
  });

  /**
   * AC-41's other trigger. A draft that ends discards its profiles on its own (the orchestrator
   * watches the draft's status); this is the explicit "I am done with this one" path, and the only
   * way to follow a different draft without restarting the process.
   */
  router.post('/api/detach', (_req, res) => {
    orchestrator.detach();
    res.json(orchestrator.snapshot());
  });

  return router;
}
