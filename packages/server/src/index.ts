import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import express from 'express';

import { loadConfig } from './config/loadConfig';

/**
 * Draft Sidekick server entrypoint.
 *
 * Scaffold only at this stage: it loads the effective configuration, exposes it read-only,
 * and serves the built frontend when one exists. The attach/sync/SSE surface is wired in by
 * the server-orchestration task; nothing here writes to the Sleeper API, ever.
 *
 * PORT is a plain environment knob, not an AS-N parameter — it is a local process detail, not
 * a product default. Keep it in step with the dev proxy in `packages/web/vite.config.ts`.
 */

const PORT = Number(process.env.PORT ?? 3001);

const SERVER_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const WEB_DIST = resolve(SERVER_ROOT, '../web/dist');

export function createApp(): express.Express {
  const config = loadConfig();
  const app = express();

  app.use(express.json());

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // Read-only projection of the active AS-N values for the pre-draft check display.
  // The browser can never write config: local overrides are a file edit plus a restart.
  app.get('/api/config', (_req, res) => {
    res.json(config);
  });

  if (existsSync(WEB_DIST)) {
    app.use(express.static(WEB_DIST));
  }

  return app;
}

const entrypoint = process.argv[1] === undefined ? null : resolve(process.argv[1]);

if (entrypoint !== null && entrypoint === fileURLToPath(import.meta.url)) {
  createApp().listen(PORT, () => {
    console.log(`[sidekick] server listening on http://localhost:${PORT}`);
  });
}
