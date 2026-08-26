/**
 * `POST /api/client-log` — the browser's lane into the trace file.
 *
 * Most of Sidekick's logic runs server-side, but the draft is *watched* in a browser, and a
 * client-side crash during a live draft is otherwise invisible to the on-disk record: the server
 * would show a healthy board while the user saw a white screen. `errorReporter.ts` in the web
 * package forwards `window.onerror` / `unhandledrejection` here; each report becomes a
 * `client-error` app event beside everything else that was happening at that moment.
 *
 * The body is untrusted browser input: strings only, truncated hard, capped in count so a
 * render-loop error cannot flood the trace (the reporter caps itself too — this is the backstop).
 */
import { Router } from 'express';

import type { Observability } from '../observability';

const MAX_MESSAGE_CHARS = 500;
const MAX_STACK_CHARS = 4000;
const MAX_HREF_CHARS = 300;
/** Per-process ceiling; one final `client-error-flood` event marks that the cap was hit. */
const MAX_REPORTS_PER_PROCESS = 200;

const asTruncatedString = (value: unknown, maxChars: number): string | null =>
  typeof value === 'string' && value.length > 0 ? value.slice(0, maxChars) : null;

export function createClientLogRouter(observability: Observability | undefined): Router {
  const router = Router();
  let reports = 0;

  router.post('/api/client-log', (req, res) => {
    // Always 204: the reporter is fire-and-forget, and a failure to log must never become a
    // client-visible error that itself gets reported back here.
    res.status(204).end();
    if (observability === undefined) return;

    reports += 1;
    if (reports > MAX_REPORTS_PER_PROCESS) {
      if (reports === MAX_REPORTS_PER_PROCESS + 1) {
        observability.recordEvent('client-error-flood', { dropped: 'all further client reports' });
      }
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    observability.recordEvent('client-error', {
      kind: asTruncatedString(body['kind'], 40) ?? 'error',
      message: asTruncatedString(body['message'], MAX_MESSAGE_CHARS) ?? '(no message)',
      stack: asTruncatedString(body['stack'], MAX_STACK_CHARS),
      href: asTruncatedString(body['href'], MAX_HREF_CHARS),
    });
  });

  return router;
}
