/**
 * Forwards browser-side failures to the server's trace file (`POST /api/client-log`).
 *
 * The draft is watched in a browser, and a client-side crash mid-draft is otherwise invisible to
 * the on-disk record: the server would show a healthy board while the user stared at a broken
 * screen. This makes that moment part of the same timeline as the polls and recomputes around it.
 *
 * Deliberately primitive: no library, no queue, fire-and-forget `fetch` that swallows its own
 * failures (an error reporter that throws, or that reports its own transport errors, feeds back).
 * Capped per page load and deduplicated against the last message so a render-loop error cannot
 * flood the server — which caps again on its side.
 */

const MAX_REPORTS_PER_PAGE = 20;

export function installClientErrorReporter(): void {
  let sent = 0;
  let lastKey = '';

  const report = (kind: string, message: string, stack: string | undefined): void => {
    const key = `${kind}:${message}`;
    if (sent >= MAX_REPORTS_PER_PAGE || key === lastKey) return;
    lastKey = key;
    sent += 1;
    void fetch('/api/client-log', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ kind, message, stack, href: window.location.href }),
    }).catch(() => {
      // Nothing — see the header comment. The console still has the original error.
    });
  };

  window.addEventListener('error', (event) => {
    report('error', event.message || 'Unknown error', event.error?.stack);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason: unknown = event.reason;
    report(
      'unhandledrejection',
      reason instanceof Error ? reason.message : String(reason),
      reason instanceof Error ? reason.stack : undefined,
    );
  });
}
