---
name: start-app
description: Start the full Draft Sidekick app (API server + web UI) in the background, from zero to healthy. Use when the user asks to start, run, launch, boot, or spin up the app / draft sidekick / dev servers, or wants the app running in the background. Also covers stopping it (scripts/stop-app.sh).
---

# Start Draft Sidekick in the background

Everything is wrapped in one idempotent, self-daemonizing script. Do not run `npm run dev`
directly in a shell you have to keep open — the script starts it detached, waits for health, and
returns.

## Steps

1. Run with the shell tool (from any cwd — the script resolves the repo root itself):

   ```bash
   bash scripts/start-app.sh
   ```

   It handles "from zero" on its own: `npm install` if `node_modules/` is missing, and
   `npm run prep:nflverse` if the game-log cache is missing (first run of a season; this download
   takes a few minutes). It exits 0 only once both servers answer, and it is safe to re-run — an
   already-running instance is detected and reported, not duplicated.

2. Report back to the user exactly what the script printed:
   - the **Web** URL (usually http://localhost:5173/) — where they paste their Sleeper draft URL/ID,
   - the API URL (usually http://localhost:3001),
   - the log path (`.dev/dev-<port>.log`).

3. If the script exits non-zero, it prints the last log lines — read `.dev/dev-<port>.log` for the
   full picture, diagnose, fix, and re-run. Do not retry blindly.

## Variants

- Second simultaneous instance (two drafts in one night): `PORT=3002 bash scripts/start-app.sh`
- Stop: `bash scripts/stop-app.sh` (stops every recorded instance and verifies the ports freed)
- Server-side behaviour after the fact: every run writes a full trace to `data/traces/*.jsonl`;
  summarize it with `npm run trace:report` (see docs/OBSERVABILITY.md).

## Notes for Claude Code specifically

If this session has the Browser pane / preview tools available and the user wants to *see* the
app, you may instead use the `draft-sidekick` entry in `.claude/launch.json` via preview_start —
but for "just have it running in the background", the script above is the way.
