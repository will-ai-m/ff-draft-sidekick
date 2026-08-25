# Local dev/run traps in this repo — check these before debugging the app

All four cost real debugging time during the first live session
(`.work/001-draft-sidekick-v1/live-ops-notes.md` #1–#4). None is an application bug; each one
*looks* like one.

## 1. A dead backend answers `GET /api/*` with HTTP 200

- With the server process down, `GET /api/anything` through the Vite dev server returns
  **`index.html` with HTTP 200** (SPA fallback). Only POSTs 404. Health checks look green while the
  backend is gone.
- **Diagnostic:** if an `/api/*` response has `content-type: text/html`, the backend is dead — the
  status code tells you nothing. `curl -i` and look at the content type, not the status.
- Proxy config lives in `packages/web/vite.config.ts` (`/api` and `/events` → `PORT ?? 3001`). It has
  no proxy error handler; adding one that returns 502 is the real fix.

## 2. Vite binds IPv6-only

- Vite listens on `[::1]:5173`. `localhost` resolves and works; **`127.0.0.1` is refused.** Nothing
  documents this. Pin `server.host` if you need the v4 loopback.

## 3. The dev server dies with whatever launched it

- A server started inside a harness preview pane is killed when the pane closes. Run it detached for
  anything that must outlive a UI session (a live draft, in particular).
- A `git stash` / `git checkout` on the tree kills `tsx watch` with `ERR_MODULE_NOT_FOUND` — the
  watcher reloads mid-checkout against a half-swapped tree. **Do not run git tree-mutating commands
  while a watcher or a live draft is running.** (Same hazard destroys any uncommitted work a killed
  agent left behind.)

## 4. The frontend holds the last frame of a dead session

- When the SSE stream dies, panels keep rendering the last good snapshot and the reconnect banner is
  easy to miss. A user then reads a **stale recommendation as an engine bug** — this happened, and it
  cost trust before anyone suspected the server was down.
- Until the UX is fixed (hard-dim every panel + full-screen banner on stream close), treat "the
  recommendation looks wrong" as "check whether the server is alive" first.

## Fast triage order

1. Is the server process alive? (`GET /api/health` — and check the content type, per #1.)
2. Is the frontend actually connected, or showing a frozen frame? (per #4)
3. Only then suspect the engine.
