# Start Draft Sidekick in the background

Start the full app (API server + web UI) detached from this conversation, from zero to healthy.

1. Run in the terminal (any cwd — the script resolves the repo root):

   ```bash
   bash scripts/start-app.sh
   ```

   The script is idempotent and self-daemonizing: it runs `npm install` only if `node_modules/`
   is missing, runs `npm run prep:nflverse` only if the game-log cache is missing (first run of a
   season — a multi-minute download), starts `npm run dev` in the background, waits until both
   servers answer, prints the URLs, and exits. The app keeps running afterwards. Re-running it
   against a healthy instance just reports the URLs — it never duplicates the app.

2. Tell the user what it printed:
   - the **Web** URL (usually http://localhost:5173/) — open it and paste a Sleeper draft URL/ID,
   - the API URL (usually http://localhost:3001),
   - the log path (`.dev/dev-<port>.log`).

3. If it exits non-zero it prints the last log lines; read `.dev/dev-<port>.log`, diagnose, fix,
   re-run. Do not retry blindly, and do not fall back to running `npm run dev` in a foreground
   shell.

Variants:

- Second simultaneous instance: `PORT=3002 bash scripts/start-app.sh`
- Stop everything: `bash scripts/stop-app.sh`
- Post-run analysis: every run writes a trace to `data/traces/*.jsonl`; summarize with
  `npm run trace:report` (see docs/OBSERVABILITY.md).
