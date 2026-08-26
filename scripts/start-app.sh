#!/usr/bin/env bash
# Start the full Draft Sidekick app (API server + Vite dev server) in the background, from zero.
#
# Idempotent and self-daemonizing: run it from anywhere, it installs/preps only what is missing,
# starts `npm run dev` detached from this shell, waits until both servers answer, prints the URLs,
# and exits — the app keeps running. Safe to re-run: an already-healthy instance is reported, not
# duplicated. Stop with scripts/stop-app.sh.
#
# A second simultaneous instance (two drafts, one night): PORT=3002 scripts/start-app.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

PORT="${PORT:-3001}"
DEV_DIR="$REPO_ROOT/.dev"
LOG_FILE="$DEV_DIR/dev-$PORT.log"
PID_FILE="$DEV_DIR/dev-$PORT.pid"
HEALTH_URL="http://localhost:$PORT/api/health"
STARTUP_TIMEOUT_SECS=90

say() { printf '%s\n' "$*"; }

web_url_from_log() {
  # Vite prints "Local: http://localhost:5173/" (auto-incremented if 5173 was busy).
  grep -Eo 'http://localhost:[0-9]+/' "$LOG_FILE" 2>/dev/null | head -1 || true
}

# --- Already running? -------------------------------------------------------------------------
if curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
  say "Draft Sidekick is already running."
  say "  API:  http://localhost:$PORT"
  WEB_URL="$(web_url_from_log)"
  [ -n "$WEB_URL" ] && say "  Web:  $WEB_URL"
  say "  Log:  $LOG_FILE"
  exit 0
fi

# --- From zero: install and prep only what is missing -----------------------------------------
if [ ! -d "$REPO_ROOT/node_modules" ]; then
  say "node_modules missing — running npm install (first run only)…"
  npm install
fi

if [ ! -f "$REPO_ROOT/data/cache/gamelogs.json" ]; then
  say "nflverse game-log cache missing — running npm run prep:nflverse (once per season)…"
  npm run prep:nflverse
fi

# --- Start detached ---------------------------------------------------------------------------
mkdir -p "$DEV_DIR"
: > "$LOG_FILE"
say "Starting Draft Sidekick (API :$PORT + web) in the background…"
PORT="$PORT" nohup npm run dev >>"$LOG_FILE" 2>&1 &
DEV_PID=$!
echo "$DEV_PID" > "$PID_FILE"

# --- Wait until both servers actually answer --------------------------------------------------
for _ in $(seq 1 "$STARTUP_TIMEOUT_SECS"); do
  if ! kill -0 "$DEV_PID" 2>/dev/null; then
    say "ERROR: the dev process exited during startup. Last log lines:"
    tail -20 "$LOG_FILE"
    rm -f "$PID_FILE"
    exit 1
  fi
  if curl -sf --max-time 2 "$HEALTH_URL" >/dev/null 2>&1; then
    WEB_URL="$(web_url_from_log)"
    if [ -n "$WEB_URL" ] && curl -sf --max-time 2 "$WEB_URL" >/dev/null 2>&1; then
      say "Draft Sidekick is up."
      say "  Web:  $WEB_URL   <- open this and paste your Sleeper draft URL/ID"
      say "  API:  http://localhost:$PORT"
      say "  Log:  $LOG_FILE"
      say "  Stop: scripts/stop-app.sh"
      exit 0
    fi
  fi
  sleep 1
done

say "ERROR: servers did not become healthy within ${STARTUP_TIMEOUT_SECS}s. Last log lines:"
tail -20 "$LOG_FILE"
exit 1
