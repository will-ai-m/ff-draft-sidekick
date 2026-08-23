/**
 * `POST /api/attach` (FR-1), `POST /api/detach`, and `GET /api/drafts` (AC-3).
 *
 * One route carries both halves of attaching, as design.md §T10 specifies: a body with `input` is
 * the paste, a body with `draftSlot` is AC-5's manual-slot follow-up on the draft just attached.
 * A failure answers 4xx with the *classified* failure and the user's input echoed back verbatim,
 * because AC-7 requires the screen to say which failure occurred and to retry without discarding
 * what was typed — the server therefore never swallows the input on the way to an error.
 */
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

      const input = asString(body.input);
      if (input === null) {
        res.status(400).json({
          failure: {
            kind: 'invalid-input',
            message: 'Paste a Sleeper draft URL or id, or send a draftSlot to resolve your seat.',
            input: '',
          },
        });
        return;
      }

      const outcome = await orchestrator.attach({
        input,
        sleeperUserId: asString(body.sleeperUserId),
        sleeperUsername: asString(body.sleeperUsername),
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

  /**
   * AC-3's convenience list. Offered only when the browser already holds a stored username —
   * pasting stays the primary path, so nothing here is required to attach.
   */
  router.get('/api/drafts', (req, res, next) => {
    void (async () => {
      const username = asString(req.query['username']);
      if (username === null || username.trim() === '') {
        res.status(400).json({ error: 'A username is required to list drafts.' });
        return;
      }

      try {
        const season = asString(req.query['season']);
        const drafts = await orchestrator.listUserDrafts(username, season ?? undefined);
        res.json({ drafts });
      } catch (error) {
        res.status(502).json({ error: (error as Error).message });
      }
    })().catch(next);
  });

  return router;
}
