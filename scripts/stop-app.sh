#!/usr/bin/env bash
# Stop background Draft Sidekick instance(s) started by scripts/start-app.sh.
#
# Kills each recorded instance's whole process group (npm, tsx server, Vite), verifies the API
# port is actually free, and cleans up the pid files. With no pid files it falls back to whatever
# is listening on the default dev ports.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_DIR="$REPO_ROOT/.dev"

say() { printf '%s\n' "$*"; }

kill_group_of() {
  local pid="$1"
  local pgid
  pgid="$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ' || true)"
  if [ -n "$pgid" ]; then
    kill -TERM -- "-$pgid" 2>/dev/null || true
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi
}

stopped=0
for pid_file in "$DEV_DIR"/dev-*.pid; do
  [ -e "$pid_file" ] || continue
  pid="$(cat "$pid_file")"
  port="$(basename "$pid_file" .pid | sed 's/^dev-//')"
  if kill -0 "$pid" 2>/dev/null; then
    say "Stopping Draft Sidekick on port $port (pid $pid)…"
    kill_group_of "$pid"
    for _ in $(seq 1 10); do
      kill -0 "$pid" 2>/dev/null || break
      sleep 1
    done
    kill -0 "$pid" 2>/dev/null && kill -KILL -- "-$(ps -o pgid= -p "$pid" | tr -d ' ')" 2>/dev/null || true
    stopped=1
  else
    say "Instance on port $port (pid $pid) was not running."
  fi
  rm -f "$pid_file"
done

# Fallback: no pid files, but something still owns the dev ports (a survivor of a crashed shell).
if [ "$stopped" -eq 0 ]; then
  for port in 3001 5173; do
    pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
    if [ -n "$pids" ]; then
      say "No pid file, but port $port is in use — stopping pid(s): $pids"
      # shellcheck disable=SC2086
      kill -TERM $pids 2>/dev/null || true
      stopped=1
    fi
  done
fi

if [ "$stopped" -eq 1 ]; then
  say "Draft Sidekick stopped."
else
  say "Nothing to stop — no Draft Sidekick instance is running."
fi
