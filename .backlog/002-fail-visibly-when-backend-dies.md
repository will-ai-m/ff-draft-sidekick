---
id: "002"
slug: fail-visibly-when-backend-dies
type: null
size: null
status: queued
depends_on: []
created: 2026-08-24
---
# Fail visibly when the Sidekick backend dies

From retro M4 (task 001, `.work/001-draft-sidekick-v1/retro.md`) and live-ops incident #2/#4: with the backend process dead, Vite's SPA fallback serves `index.html` with HTTP 200 for `GET /api/*` (fake-healthy), and the frontend silently holds the last SSE frame — the user read a stale recommendation as an engine bug ("Gibbs incident"). A dead backend must be distinguishable from a healthy quiet one within one glance.

Wanted (per approved retro option): Vite proxy answers 502 JSON on proxy error instead of falling through to the SPA shell; the web store treats a `text/html` response from `/api/*` as backend-dead; SSE `closed`/`reconnecting` hard-dims all panels behind an unmissable banner; `server.host` pinned so `localhost` vs `127.0.0.1` vs `[::1]` stops mattering; README troubleshooting documents all four traps (also: dev server must not die with the harness preview pane — run detached).
