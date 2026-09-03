# zesty-fantasy

Draft Sidekick — a local, free-to-run Sleeper draft assistant. This README is just the steps to
get it running; everything else is in [docs/GUIDE.md](docs/GUIDE.md) (usage, pre-draft ritual,
mock rehearsals, troubleshooting), [docs/OBSERVABILITY.md](docs/OBSERVABILITY.md) (traces and
post-draft reports), and [prd/](prd/) (requirements and design).

## Start the app, 0 → 100

Prerequisite: Node.js ≥ 20 (with npm). Sleeper draft data needs no login or key. The optional
**Ask Sidekick** adviser is bring-your-own-key: connect either an OpenAI or Anthropic API key in
the draft screen to use your own provider tokens. The raw key is held only in server memory behind
an HttpOnly session cookie—never local/browser storage, logs, config, or the repository—and is
erased on detach, explicit removal, server restart, page exit, or 30 minutes of inactivity.

```bash
git clone git@github.com:will-ai-m/zesty-fantasy.git
cd zesty-fantasy
scripts/start-app.sh
```

`scripts/start-app.sh` does everything, in order, skipping whatever is already done:

1. `npm install` — only if `node_modules/` is missing.
2. `npm run prep:nflverse` — only if the game-log cache is missing (first run of a season;
   downloads a few hundred MB of nflverse data, several minutes). Re-run it manually each new
   season.
3. Starts the API server (`:3001`) and web app (`:5173`) **in the background**, waits until both
   answer, and prints the web URL. Re-running is safe: an already-running instance is reported,
   never duplicated.

Then, in the browser at the printed URL:

4. Pick the **Rankings format** — Half PPR or Full PPR — then paste your Sleeper draft URL or ID
   (league draft or mock). The format decides which FantasyPros rankings and positional tiers and
   which FFC ADP pool everything is computed from; it is fixed once you start drafting.
5. Confirm the teams shown are the right draft; pick your seat if it wasn't auto-detected.
6. Review the pre-draft check, then click **Start drafting**. Picks stay made in the Sleeper
   draft room — Sidekick never writes to Sleeper.

## Everything else you'll want

```bash
scripts/stop-app.sh          # stop the background app
```

```bash
PORT=3002 scripts/start-app.sh   # second simultaneous instance (two drafts, one night)
```

```bash
npm run trace:report         # post-draft report from the newest flight-recorder trace
```

```bash
npm run dev                  # foreground alternative to start-app.sh (Ctrl-C to stop)
```

- Logs: `.dev/dev-<port>.log` · full event traces: `data/traces/*.jsonl`
- Tuning: copy `config.local.json.example` → `config.local.json`, edit, restart
  ([details](docs/GUIDE.md#configuration))
- In Claude Code: the `/start-app` and `/positional-tiers` skills cover the routine ops; other
  agents (OpenAI Codex etc.) get the same runbooks from [AGENTS.md](AGENTS.md)
- Development: `npm test` · `npm run lint` · `npm run typecheck`
