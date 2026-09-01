# Agent guide — Draft Sidekick

Operational runbooks for AI coding agents (OpenAI Codex and any other tool that reads
`AGENTS.md`). These mirror the Claude Code skills in `.claude/skills/` — those files are the
canonical versions; **when a skill there changes, update its section here in the same commit.**

## Start the app (mirrors `.claude/skills/start-app`)

Start the full app (API server + web UI) detached, from zero to healthy:

```bash
bash scripts/start-app.sh
```

Idempotent and self-daemonizing: runs `npm install` only if `node_modules/` is missing, runs
`npm run prep:nflverse` only if the game-log cache is missing (first run of a season — a
multi-minute download), starts the dev servers in the background, waits for health, prints the
URLs, and exits. Re-running against a healthy instance just reports the URLs.

Report to the user: the **Web** URL (usually http://localhost:5173/ — paste a Sleeper draft
URL/ID there), the API URL (usually http://localhost:3001), and the log path
(`.dev/dev-<port>.log`).

- On a non-zero exit it prints the last log lines; read `.dev/dev-<port>.log`, diagnose, fix,
  re-run. Never fall back to running `npm run dev` in a foreground shell.
- Second simultaneous instance: `PORT=3002 bash scripts/start-app.sh`
- Stop everything: `bash scripts/stop-app.sh`
- Every run writes a trace to `data/traces/*.jsonl`; summarize with `npm run trace:report`
  (see docs/OBSERVABILITY.md).

## Pull the latest positional tiers (mirrors `.claude/skills/positional-tiers`)

Fetch the six FantasyPros positional cheat sheets (QB/RB/WR/TE/DST/K) and write their
**positional** tier structure — where each position's run pauses — to a dated report:

```bash
npm run tiers:positional
```

Writes `research/fantasypros-positional-tiers-<date>.md` (date from the newest page's own
`last_updated` stamp; same-day re-runs overwrite with the fresher pull) and prints a digest —
per-page capture age plus each position's top two tiers. Report the path, the ages (flag a page
much older than the others: FantasyPros mid-update), and anything notable versus the previous
dated report in `research/`.

- **The engine uses these same tiers**: the app fetches the QB/RB/WR/TE tier pages itself at
  every attach for FR-10's tier urgency (K/DST are report-only — they never enter engine math).
- **Snapshots freeze at attach** (AC-29): this command never updates a running draft. To draft
  on a newer board: Detach → re-attach; the pre-draft check shows what it got and warns
  per-position if a tier page failed.
- On failure the page shape most likely changed (`No "var ecrData = ..."`); the parser is shared
  with the live app (FR-4), so fix it only together with its tests
  (`packages/server/src/snapshots/fantasypros.test.ts`).
