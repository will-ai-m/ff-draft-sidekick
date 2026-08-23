/**
 * The Express app: every route mounted onto one orchestrator, plus the built frontend.
 *
 * One process, one port, one attached draft. `/events` is the only push channel and `/api/*` the
 * only pull surface; nothing here writes to the Sleeper API, and the browser can never write
 * anything but attach/slot/resync/detach — the draft state itself is read-only by construction,
 * which is what makes AC-15's "multiple tabs, no write conflicts" free.
 */
import { existsSync } from 'node:fs';

import express from 'express';
import type { Express } from 'express';

import type { SidekickConfig } from '../config/loadConfig';
import type { Orchestrator } from '../orchestrator';
import { createAttachRouter } from './attach';
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
}

export interface SidekickApp {
  app: Express;
  hub: SseHub;
}

export function createSidekickApp(
  orchestrator: Orchestrator,
  config: SidekickConfig,
  options: CreateAppOptions = {},
): SidekickApp {
  const app = express();
  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  const { router: events, hub } = createEventsRouter(orchestrator);
  app.use(createAttachRouter(orchestrator));
  app.use(createResyncRouter(orchestrator));
  app.use(createPlayerGamelogRouter(orchestrator));
  app.use(createConfigRouter(orchestrator, config));
  app.use(events);

  if (options.serveWeb !== false && options.webDist !== undefined && existsSync(options.webDist)) {
    app.use(express.static(options.webDist));
  }

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
