# Live-ops notes — post-release testing session, 2026-08-23 (orchestrator-authored retro input)

Observations from the first real-user session (live Sleeper mocks, user's own Chrome + local app). Written by the orchestrator as retro input; not a maker artifact.

## Environment / ops incidents
1. **Dev server tied to the preview pane died when the pane closed**; harness-managed process. Restarted detached. Later, an orchestrator `git stash/checkout` flicker killed `tsx watch` (ERR_MODULE_NOT_FOUND) mid-draft.
2. **Vite SPA fallback masks a dead backend**: with the server process down, GET `/api/*` returns index.html with HTTP 200 (fake healthy); only POSTs 404. Cost several minutes of misdiagnosis. Candidate fix: vite proxy config or a frontend heartbeat that distrusts text/html from /api.
3. **Vite bound IPv6-only** (`[::1]:5173`): `localhost` works, `127.0.0.1` refused. Documented nowhere.
4. **Frontend held the dead session's last frame** (reconnect banner easy to miss) → user saw a stale recommendation ("Gibbs" incident) and read it as an engine bug. Consider: hard-dim all panels + full-screen banner when the stream is closed/reconnecting.

## Sleeper platform behavior (new facts)
5. **Mock drafts are purged the moment the human leaves the room** — even mid-draft (404 on draft + picks). Post-draft data retrieval impossible; SC-3/SC-4 checklists must be captured live.
6. **Solo mock `draft_order` DOES carry the human's user_id** (verified live: {user_id: 8}) — AS-1's residual resolved; seat auto-detect works in mocks when a username is stored.
7. **Bots + 90s autopick blitz entire drafts** if the human idles: two mocks completed on autopilot during ops incidents. Rehearsal protocol should say: attach BEFORE starting the mock; the draft waits for no one.
8. **Perceived pick lag ~8s** (user-reported; unmeasured — draft purged before sampler ran). Our bounded share: ≤1s poll + 0.4s burst debounce + ~0.1–0.4s sim + paint ≈ ≤2s. Remainder suspected Sleeper REST propagation vs its private room websocket. Sampler exists (compare `last_picked` stamp vs first API visibility); run during next live mock.

## Product feedback (user, live)
9. **Start-drafting button was buried** below the pre-draft check's long lists → moved above (shipped b9fd5d6).
10. **Pick feed showed all 150** → now latest 10 + Show-all toggle (shipped b9fd5d6; two e2eSmoke tests updated).
11. **Recommendation reads as "just ECR"** — user expected visible roster-need weighting. Current design: need gates the plan set (only positions with unfilled starters/FLEX eligibility), ECR-rank scoring picks within it, shelf-collapse is what moves the highlight off top-ECR; early-draft plan set ≈ all positions so the highlight ≈ top ECR; bench regime is pure ECR by design (locked raw-ECR value function). Gap worth a v1.1 decision: no slot-pressure/urgency term (unfilled starters vs picks remaining) and the reason line rarely says "need", so need-awareness is invisible even when it's operating. Candidate: parameterized need-urgency weight + richer reason line, via a proper pipeline task.
12. **Latency expectations**: user checks against the Sleeper room (websocket-fresh); consider surfacing "as of Sleeper API, Xs ago" so the gap reads as upstream, not app slowness.

## Pipeline/process notes for retro
13. Two infra-killed developer spawns (stream watchdog stall; session limit) burned ~3 circuit-breaker slots; resume-from-partial-state worked well both times.
14. A checker (code-reviewer) spawned its own background sweep agent whose completion arrived after the gate verdict — orchestrator had to classify an un-dispatched notification. Sweep findings were good (dead exports, dup helpers, hardcoded display thresholds, postDetach error handling) — fold into backlog.
15. QA findings already queued: RECOMPUTING stuck after quiet recovery; no-rankings unmatched-badge noise; body background color.
