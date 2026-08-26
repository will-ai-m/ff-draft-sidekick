# Observability: the flight recorder

Draft Sidekick records everything it does, down to individual Sleeper requests and the exact
content of every recommendation it made, so a draft can be reconstructed and judged afterwards.
Three layers, all fed by one channel (`packages/server/src/observability.ts`):

| Layer | What | For |
|---|---|---|
| **Trace file** | `data/traces/trace-<timestamp>-p<pid>.jsonl`, one per server process, every event | The permanent, complete record. Read it back with `npm run trace:report`. |
| **Console** | The non-noise subset as one JSON line per event | Watching a live mock rehearsal (the PRD §14 protocol). |
| **Ring buffer** | Last ~2000 non-noise samples in memory, served by `GET /api/debug/metrics` | Live p95 summaries against the SC-1/SC-2 budgets, plus the trace file's path. |

"Noise" = routine high-frequency traffic (an unchanged 1 Hz poll, a healthy Sleeper request, a 2xx
HTTP request). Noise goes to the trace file only — full fidelity on disk, no drowning of the
console or the buffer. Trace files are pruned to the newest 50; a filesystem failure disables
tracing with one loud console line and never interrupts the draft.

## Reading a trace

```bash
npm run trace:report                     # newest trace
npm run trace:report -- path/to/trace.jsonl
```

The report answers the post-draft questions in order: server/config context (with any non-default
overrides called out), sessions (attach/detach, snapshot warnings), board-sync health (poll
outcomes, degraded episodes with measured outage lengths, re-syncs, Sleeper failures), latency vs
the SC-1/SC-2 budgets (pick-reflection and burst-refresh p50/p95/max with PASS/FAIL, plus
recompute phase timings), the recommendation timeline (every highlight change with its reason
line, verbatim), and faults (cascade failures, route errors, client errors, process faults).

For ad-hoc digging, the file is plain JSONL — every line has `ts`, `seq`, `type` (app events also
have `event`), and `draftId` (null outside an attached draft), so `jq`/`grep` slice it directly:

```bash
jq -c 'select(.event == "recompute") | {picks: .data.picksMade, rec: .data.output.highlightPlayerName, why: .data.output.reason}' data/traces/trace-*.jsonl
```

## What is recorded

**Lifecycle** — `server-started` (port, pid, node version, game-log cache status, the *entire
effective config* — latency numbers mean nothing without the budgets and Monte Carlo run count
that produced them), `server-stopped`, `process-fault` (uncaught exception / unhandled rejection,
with stack).

**Sessions** — `attach-requested` / `attach-succeeded` (draft shape, seat, teams, matched-player
counts, and the full pre-draft check: snapshot ages, sources, every warning) / `attach-failed`
(classified), `slot-selected`, `detached` (session length, picks seen, recompute count).

**Board sync** — `poll` (every poll: mode, outcome, new-pick count, duration, effective interval;
unchanged ones flagged noise), `sync-degraded` / `sync-recovered` (one per episode, with the
outage's measured length), `resync`, `picks-observed` (who took whom, attributed to which seat,
per poll/re-ingest), `sleeper-request` (every outbound call: path, status, latency, error kind —
healthy ones as noise).

**The cascade** — `recompute`, the heart of the record: board version, picks made, total and
per-phase durations (opponent panel / Monte Carlo simulation / candidate list), simulation
parameters, and the full output — highlighted player, reason kind, the reason sentence verbatim,
the winning lookahead plan, the top candidate rows with survival probabilities, and your need
vector at that moment. Plus the pre-existing latency samples `pick-reflected` (SC-1) and
`burst-refreshed` (SC-2), and `cascade-failed` with stack when a recompute threw and was
contained.

**HTTP and the browser** — `http` (access log: method, path, status, duration; 2xx as noise, so a
4xx/5xx also hits the console), `route-error` (anything the Express error boundary caught, with
stack — the client deliberately receives a fixed sentence, so the trace says everything),
`sse-connected` / `sse-disconnected` (every browser tab arriving and leaving, with connection
length), and `client-error`: the web app forwards `window.onerror` / `unhandledrejection` to
`POST /api/client-log` (`packages/web/src/errorReporter.ts`), so a broken screen mid-draft lands
in the same timeline as the polls around it. Reports are truncated, deduplicated, and capped on
both sides.

## Adding a new event

Call `observability.recordEvent('my-event', {…}, { noise: false })` from anywhere that already
holds the `Observability` instance (orchestrator, BoardSync, routes). Pass `noise: true` only for
per-second-scale routine traffic. Events are schemaless by design — the trace file and
`trace:report` tolerate unknown event names; extend `trace-report.ts` when a new event deserves
its own section. The contract is pinned by `packages/server/test/traceEvents.test.ts`.
