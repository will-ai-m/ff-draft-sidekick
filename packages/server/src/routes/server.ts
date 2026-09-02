/**
 * The Express app: every route mounted onto one orchestrator, plus the built frontend.
 *
 * One process, one port, one attached draft. `/events` is the only push channel and `/api/*` the
 * only pull surface; nothing here writes to the Sleeper API. The browser can control the local
 * draft session and an isolated in-memory chat credential, but the draft state itself is read-only
 * by construction, which is what makes AC-15's "multiple tabs, no write conflicts" free.
 */
import { existsSync } from 'node:fs';

import express from 'express';
import type { ErrorRequestHandler, Express } from 'express';

import type { SidekickConfig } from '../config/loadConfig';
import type { Observability } from '../observability';
import type { Orchestrator } from '../orchestrator';
import { createAttachRouter } from './attach';
import { createChatRouter } from './chat';
import type { ChatRouteOptions } from './chat';
import { createClientLogRouter } from './clientLog';
import { createConfigRouter } from './config';
import { createEventsRouter } from './events';
import type { SseHub } from './events';
import { createPlayerGamelogRouter } from './playerGamelog';
import { createResyncRouter } from './resync';

export interface CreateAppOptions {
  /** Where the built frontend lives; skipped when absent, so the API runs without a build. */
  webDist?: string;
  /** Set false to serve the API alone (tests, and `npm run dev`, where Vite serves the frontend). */
  serveWeb?: boolean;
  /** When present: HTTP access events, SSE connect/disconnect events, `/api/client-log`. */
  observability?: Observability;
  /** Where this process's trace file lives, surfaced on `/api/debug/metrics`. */
  traceFilePath?: () => string | null;
  /** Test seams and server-side configuration for the optional grounded draft chat. */
  chat?: ChatRouteOptions;
}

export interface SidekickApp {
  app: Express;
  hub: SseHub;
}

/**
 * The app's error boundary. Anything a route rejects with, or throws, lands here.
 *
 * Two jobs, in order. It answers JSON, because every client of this API parses JSON and Express's
 * default handler answers an HTML page — a browser fetch that hits it fails on `.json()` with a
 * parse error that says nothing about what actually broke. And it answers a *fixed* sentence: the
 * default handler renders `err.stack` into the body, which on this app means absolute paths from
 * the developer's machine on the wire. The real reason goes to the log, where the operator is.
 *
 * The fourth parameter must stay in the signature whether or not it is called: Express identifies
 * an error handler by arity, and dropping it silently turns this back into ordinary middleware.
 */
const errorBoundary: ErrorRequestHandler = (error, _req, res, next) => {
  console.error('[sidekick] unhandled route error:', error);
  // Nothing to answer with once the response has started — `/events` streams, so this is reachable.
  // Express's default handler is the only thing that can close a half-written response cleanly.
  if (res.headersSent) {
    next(error);
    return;
  }
  res.status(500).json({
    error:
      'The server hit an unexpected error handling that request. The draft session is still ' +
      'attached — check the server log for what failed.',
  });
};

export function createSidekickApp(
  orchestrator: Orchestrator,
  config: SidekickConfig,
  options: CreateAppOptions = {},
): SidekickApp {
  const app = express();
  app.use(express.json());

  // The access log: every request's method, path, status and latency, traced on completion.
  // Successes are noise (on disk only); a 4xx/5xx is not, so it also reaches the console and the
  // ring buffer. `/events` is exempt — it is a stream whose "finish" is just the tab leaving, and
  // the SSE hub below records that with more meaning.
  const observability = options.observability;
  if (observability !== undefined) {
    app.use((req, res, next) => {
      if (req.path === '/events') {
        next();
        return;
      }
      const startedAt = Date.now();
      res.on('finish', () => {
        observability.recordEvent(
          'http',
          {
            method: req.method,
            path: req.path,
            status: res.statusCode,
            durationMs: Date.now() - startedAt,
          },
          { noise: res.statusCode < 400 },
        );
      });
      next();
    });
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const { router: events, hub } = createEventsRouter(orchestrator, observability);
  app.use(createAttachRouter(orchestrator));
  app.use(createChatRouter(orchestrator, options.chat));
  app.use(createResyncRouter(orchestrator));
  app.use(createPlayerGamelogRouter(orchestrator));
  app.use(createConfigRouter(orchestrator, config, { traceFilePath: options.traceFilePath }));
  app.use(createClientLogRouter(observability));
  app.use(events);

  if (options.serveWeb !== false && options.webDist !== undefined && existsSync(options.webDist)) {
    app.use(express.static(options.webDist));
  }

  // Last, so it sees everything mounted above it. Traced before it answers: the fixed sentence
  // the client receives deliberately says nothing, so the trace has to say everything.
  const tracedBoundary: ErrorRequestHandler = (error, req, res, next) => {
    observability?.recordEvent('route-error', {
      method: req.method,
      path: req.path,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? null) : null,
    });
    errorBoundary(error, req, res, next);
  };
  app.use(tracedBoundary);

  return { app, hub };
}

/** The narrow form the suites use: an app over an already-built orchestrator. */
export function createApp(
  orchestrator: Orchestrator,
  options: CreateAppOptions & { config?: SidekickConfig } = {},
): Express {
  const config = options.config ?? orchestrator.snapshot().config;
  return createSidekickApp(orchestrator, config, options).app;
}
