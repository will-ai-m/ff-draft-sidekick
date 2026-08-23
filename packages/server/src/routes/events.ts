/**
 * `GET /events` — the one-way Server-Sent Events channel every browser tab listens on.
 *
 * On connect a tab immediately receives the current `AppStateSnapshot`; thereafter it receives a
 * new complete snapshot on every state change. There is no per-connection logic beyond "send what
 * everyone else just got", which is what makes AC-15's multiple-tab consistency true by
 * construction rather than by careful merging.
 *
 * **Serialize once, write the same bytes to everyone.** The hub subscribes to the orchestrator a
 * single time and JSON-encodes each snapshot once, so two tabs cannot receive payloads that differ
 * even by key order — and a tab that joins mid-draft gets exactly the frame the others last got,
 * not a separately-rendered lookalike.
 */
import { Router } from 'express';
import type { Response } from 'express';

import type { Orchestrator } from '../orchestrator';

/** Retry hint the browser's own `EventSource` honours if the process restarts mid-draft. */
const RECONNECT_DELAY_MS = 1000;

const frame = (payload: string): string => `data: ${payload}\n\n`;

export class SseHub {
  private readonly clients = new Set<Response>();
  private unsubscribe: (() => void) | null = null;
  private lastFrame: string;

  constructor(private readonly orchestrator: Orchestrator) {
    this.lastFrame = frame(JSON.stringify(orchestrator.snapshot()));
  }

  /** Subscribes to the orchestrator on the first connection and stays subscribed. */
  private ensureSubscribed(): void {
    this.unsubscribe ??= this.orchestrator.subscribe((snapshot) => {
      this.lastFrame = frame(JSON.stringify(snapshot));
      for (const client of this.clients) client.write(this.lastFrame);
    });
  }

  add(res: Response): void {
    this.ensureSubscribed();
    this.clients.add(res);
    // The joining tab is handed the current state, serialized here and now — every later frame
    // it receives is byte-identical to what every other tab receives.
    res.write(frame(JSON.stringify(this.orchestrator.snapshot())));
  }

  remove(res: Response): void {
    this.clients.delete(res);
  }

  get clientCount(): number {
    return this.clients.size;
  }

  /** Drops every connection and unsubscribes — used when the process is shutting down. */
  close(): void {
    for (const client of this.clients) client.end();
    this.clients.clear();
    this.unsubscribe?.();
    this.unsubscribe = null;
  }
}

export function createEventsRouter(orchestrator: Orchestrator): { router: Router; hub: SseHub } {
  const hub = new SseHub(orchestrator);
  const router = Router();

  router.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      // Belt and braces against any proxy that would otherwise buffer the stream.
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders?.();
    res.write(`retry: ${RECONNECT_DELAY_MS}\n\n`);

    hub.add(res);
    req.on('close', () => {
      hub.remove(res);
      res.end();
    });
  });

  return { router, hub };
}
