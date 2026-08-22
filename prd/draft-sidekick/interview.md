# PRD interview — Draft Sidekick (+ super-consensus rankings)

- **Slug:** `draft-sidekick`  |  **Started:** 2026-08-20  |  **Updated:** 2026-08-20
- **Phase:** interview
- **PRD:** `./prd.md` *(not until drafting)*

---

## Coverage ledger

`unexplored` → `probing` → `resolved` | `parked`
`parked` = known gap, shipping anyway → becomes an `OQ-N`.

| # | Dimension | Status | Settled so far |
|---|---|---|---|
| 1 | Problem & evidence | resolved | Q1–Q2: personal tool; JTBD a–e; evidenced pain = manual dual-screen board bookkeeping during live Sleeper draft |
| 2 | Target user & JTBD | resolved | Q1+Q14: primary user = Will in his own leagues; "individuals" = anyone cloning and running locally. JTBD = goals a–e |
| 3 | Current alternative | resolved | Q2–Q3: FP rankings + Sleeper room, manual cross-off. Never tried FP Draft Wizard; won't pay — build > buy, free-to-run |
| 4 | Outcome & success metrics | parked | Q9: success = "felt given the best possible information" (subjective, skipped further probing). Objective proxies (latency, sync lag) only → OQ |
| 5 | Scope boundary & non-goals | resolved | Q4–Q8: v1 = Sleeper/10-team/half-PPR/1QB/redraft; rankings v1 = raw ECR ingest; engine v1 = layers 1–4 + lookahead (🔶 AS-2), cross-draft history deferred. No deadline |
| 6 | Core user journeys | resolved | Q10–Q13: web app alongside Sleeper room; auto-attach (🔶 AS-3); screen = candidate list w/ recommendation + survival %, per-team opponent panel, live pick feed, 1-click game logs |
| 7 | Functional requirements | resolved | Q8–Q16: sync board, need vectors, MC availability, tendencies, lookahead, ECR ingest, game logs, my-roster panel, recovery controls. Run alerts excluded (🔶 AS-4) |
| 8 | Edge cases & failure modes | resolved | Q15: staleness = cardinal sin; auto full re-ingest + manual re-sync + integrity indicator. Defaults folded: unmatched IDs excluded+warned, traded picks honored, late attach = same re-ingest |
| 9 | Constraints | resolved | Q7+Q14: no deadline; local app, localhost, zero auth, free-to-run. Sleeper API read-only, poll ≤~1000 req/min |
| 10 | Dependencies & assumptions | resolved | Sleeper API (read-only), FP ECR snapshotted fresh pre-draft (route = 🔵 OQ-2, FP-website preferred), ADP (Sleeper/FFC), nflverse weekly stats for game logs. AS-1 mock readability = v1-critical |
| 11 | Rollout, measurement & adoption | resolved | Q14+Q16: personal local use; rollout path = mock-draft dress rehearsals → real drafts. Open-source intent: non-material to PRD |
| 12 | AI-behavior evals | resolved | Q16: validation = live Sleeper mocks, user judgment as quality bar; no backtest harness in v1 (AS-1 now v1-critical; replay = fallback if mocks unreadable) |

---

## Repo context *(before Q1 — context, not answers)*

- **Product:** willy-ff — "fantasy football draft intelligence," two aspects: (1) super-consensus draft ranking (per-source variance + staleness retained, not collapsed to mean), (2) Draft Sidekick live draft assistant (game-theory layer on the value function). User pasted Draft Sidekick PRD v2 (author line "Suraj Sinha", 2026-08-20) as the starting text; prior prd/ files deleted from working tree.
- **Stack (planned, from research/fantasy-football-PLAN.md):** Python 3.12, Polars, DuckDB, LightGBM, FastAPI, React/Vite; nflverse (`nflreadpy`) as core data; Sleeper API; FFC ADP; Open-Meteo; unofficial ESPN endpoints. Eval-harness-first philosophy; snapshot discipline.
- **Already built:** nothing — research + plans only. Research corpus: data-sources.md, factors.md, position-factors.md, fantasypros-rankings-{sources,differences}.md, 2026 draft notes, coaching changes, FP draft-vs-finish HTML.
- **Constraints from conventions:** PRDs live in `prd/` (repo convention, not docs/prd/). Free data sources only, per research verdicts. FantasyPros free API is sample-only → ECR via nflverse mirror.
- **Sleeper API facts (verified 2026-08-20 via docs.sleeper.com):** read-only REST, no writes ever; drafts endpoints: `/v1/user/<id>/drafts/<sport>/<season>`, `/v1/league/<id>/drafts`, `/v1/draft/<id>`, `/v1/draft/<id>/picks`, `/v1/draft/<id>/traded_picks`; no websocket in public API → poll; stay under ~1000 req/min. Docs don't mention mock drafts; community reports mocks are ordinary draft objects with a draft_id → treat as 🔶 until spiked.
- **Read:** README.md, research/fantasy-football-PLAN.md, research/data-sources.md (grep), docs.sleeper.com (fetch), pasted PRD v2.

---

## Tags

| Tag | Statement | Raised at |
|---|---|---|
| 🔶 AS-1 | Sleeper mock drafts are ordinary draft objects readable via `/v1/draft/<id>` + `/picks` (falsifier: create a mock, curl the endpoints, get 404/empty) | Q0 |
| 🔶 AS-2 | v1 engine = layers 1–4 + 2-pick lookahead, availability via Monte Carlo sim of intervening picks; cross-draft history deferred (falsifier: tendencies add no calibration over layers 1–3 in replayed drafts, or MC misses <5s budget) | Q8 |
| 🔶 AS-3 | Attach flow: one-time Sleeper username entry → API discovers leagues/drafts → auto-attach to live draft (falsifier: user prefers pasting a draft URL/ID) | Q10 |
| 🔶 AS-4 | No explicit run/deferral alerts in v1 — runs captured implicitly by need vectors + tendencies in survival math (falsifier: user wants a visible run alert) | Q16 |
| 🔵 OQ-1 | No falsifiable success metric — success is subjective ("felt given the best possible information"); objective proxies only (sync lag, latency, zero manual bookkeeping) | Q9 |
| 🔵 OQ-2 | ECR ingestion route: FantasyPros website direct (user preference — scrape or pre-draft manual upload) vs nflverse mirror. Hard requirement either way: fresh snapshot immediately before each draft | Q17 |

---

## Open threads

Opened but not chased. Empty before drafting.

- [x] Two sides = one PRD, one system: side 1 (ECR ingest) is the value function consumed by side 2 (Sidekick) — settled Q5–Q6
- [x] Authorship: non-material, skipped (Q18)

---

## Transcript

Append-only. The `Locked:` lines are the decision set the draft is built from — on a
reversal, note the supersession in the new entry rather than editing the old one.

### Q1 — Problem & evidence
**Asked:** Most recent real draft where the absence of this tool cost you — what happened, and what would Sidekick have said differently?
**Answer:** "definitely not a commercial product PRD. this is for individuals to help them on their fantasy football draft." Goals per pick: (a) predict opponents' next picks from what they've already picked; (b) examine next few available players in rankings, pick best for my needs; (c) good UI to fluidly monitor every pick + read a player's previous-season stats; (d) my own consensus rankings instead of provider (Sleeper/ESPN/Yahoo) rankings, "which are usually pretty damn bad"; (e) assistant dynamically removes just-drafted players from board/recommendations.
**Locked:** Personal/individual tool, not commercial. Supersedes v2 doc's commercial framing (cohorts, acquisition, privacy surface). User's JTBD list = a–e.
**Opened:** No concrete incident yet (answered with goals, not evidence). Current draft-day workflow unknown. Scope gap: v2's behavioral fingerprint engine (§6.3) vs. user's stated a–e (need-based prediction + own rankings + live board UI). (e) implies today's alternative may be a static list crossed off by hand.
**Tagged:** none

### Q2 — Problem & evidence / current alternative
**Asked:** Walk me through your last live draft — what was on screen, and where did the setup fail you?
**Answer:** "i had the fantasypros ranking on one screen and the sleeper draft website on another. the worst part was as each player was drafted, i had to manually mark it on the fantasypros website and mark whether it was my team or the other team. this should frankly be automated."
**Locked:** The concrete incident: dual-screen FantasyPros rankings + Sleeper draft room; core pain = manual board bookkeeping (crossing off drafted players, tagging mine-vs-theirs) under the clock. Board sync automation is the non-negotiable MVP core.
**Opened:** Why not FantasyPros' own Draft Wizard live-sync (their paid product does exactly this)? Notable: the named pain is bookkeeping, NOT failed opponent prediction — v2's behavioral engine is aspiration, not the evidenced pain.
**Tagged:** none

### Q3 — Current alternative
**Asked:** FantasyPros Draft Wizard live-sync does the auto-cross-off — tried it? What made/would make you not use it?
**Answer:** "well, the other HUGE pain is that i want to know the best pick not just based on the ranking but based on what i need, predict what my opponents are likely to draft next based on what they need and how they have drafted so far, and the best value remaining on the board." + "i have never tried it. i don't want to buy it lol i would rather build it myself for free"
**Locked:** Two pains now, both first-class: (P1) manual board bookkeeping, (P2) rankings aren't decisions — wants need-aware recommendation + opponent prediction (from needs + within-draft behavior) + best value remaining. Build-vs-buy: never tried FP Draft Wizard; won't pay; building it himself is part of the point. Free-to-run is a constraint.
**Opened:** "how they have drafted so far" = within-draft behavior only — does cross-draft history matter to him at all? "Best value remaining" — value measured how (vs own consensus rank? vs ADP? VOR)?
**Tagged:** none

### Q4 — Scope (formats/leagues)
**Asked:** Which leagues will this actually run against this season — platform, team count, scoring, roster format, redraft/dynasty?
**Answer:** "platform (let's start with Sleeper but potentially we want espn later as well.) team count should support 10man, can we support 12 later. let's do half PPR to start with, maybe PPR later. typical roster format with 1 QB, but potentially a 3 WR setup. redraft."
**Locked:** v1 = Sleeper, 10-team, half-PPR, 1QB typical roster, redraft. Later ladder: ESPN, 12-team, full PPR, 3WR. v2 doc's §7 format matrix (best ball, survival, dynasty, superflex, IDP, TE premium) collapses to non-goals. Aligns with PLAN.md's half-PPR focus.
**Opened:** Team count / roster slots / scoring should be read from Sleeper league settings anyway (makes 12-team & 3WR nearly free) — confirm engine reads settings rather than hardcoding. Two-sides boundary: what exactly is "consensus rankings" v1?
**Tagged:** none

### Q5 — Scope (rankings side)
**Asked:** Is v1's value function an aggregation of published expert rankings, or your own model-driven projections per PLAN.md?
**Answer:** "i would like to leverage FantasyPros ECR as the pillar of truth."
**Locked:** Rankings side v1 anchors on FantasyPros ECR — not the PLAN.md projection engine. PLAN.md's model build is out of scope for this PRD.
**Opened:** "Pillar of truth" ambiguity: is v1 literally ECR ingested+displayed, or ECR plus adjustments (other sources, variance, staleness, personal overrides)? README promises "super-consensus... ECR and beyond, retaining per-source variance." Which is it for v1?
**Tagged:** none

### Q6 — Scope (rankings side, edge)
**Asked:** Literally ECR ingested/displayed, or ECR plus something — and if plus, first adjustment?
**Answer:** "let's start with just fantasypros ECR, later we might adjust."
**Locked:** Side 1 v1 = FantasyPros ECR (half-PPR), ingested as-is. No blending, no overrides, no variance model in v1 — "super-consensus" (README ambition) deferred. Side 1 v1 is an ingestion/refresh pipeline + the data spine the Sidekick consumes.
**Opened:** ECR ingestion route (nflverse mirror `load_ff_rankings()` vs scrape — research says FP free API is sample-only): propose mirror, confirm at constraints. ECR refresh cadence needed (daily? pre-draft snapshot?). Does he still want std-dev/min/max columns *displayed* (FP publishes them) even if not modeled?
**Tagged:** none

### Q7 — Constraints (timeline)
**Asked:** When is your actual draft this season (as forcing function for v1)?
**Answer:** "draft time doesn't matter." + counter-question: "how do you intend on making predictions as the draft proceeds?"
**Locked:** No deadline constraint — v1 is not racing a 2026 draft date; build it right over build it by a date.
**Opened:** User asked for the prediction mechanism → I proposed the layer stack (structure → need vector → ADP survival → within-draft tendencies → lookahead) and turned it into the v1 cut-line question.
**Tagged:** none

### Q8 — Scope (engine v1 cut line)
**Asked:** Where does v1 stop on the ladder: (A) layers 1–3, (B) +within-draft tendencies, (C) +2-pick lookahead, (D) +cross-draft history?
**Answer:** "what do you think and recommend? are there other strategies out there?" → escape hatch: I decide. Survey of alternative strategies given (ADP-only survival, VBD/VONA rules, Monte Carlo draft sim, MCTS/RL, roster-construction heuristics, Bayesian opponent typing).
**Locked:** 🔶 AS-2 — v1 engine = layers 1–4 (snake window, need vectors, ADP survival, within-draft tendencies) + two-pick lookahead via plan comparison (VONA-style now-vs-next EV), with availability computed by Monte Carlo simulation of the intervening picks rather than closed-form products. Cross-draft history deferred to v-later (unproven predictive value; user's own words were "how they have drafted so far").
**Opened:** none
**Tagged:** 🔶 AS-2 (falsifier: if within-draft tendency adjustment shows no calibration gain over layers 1–3 in replayed drafts, demote layer 4; if MC sim can't hit the <5s recommendation budget, fall back to closed-form)

### Q9 — Outcome & success metrics
**Asked:** Morning after a real draft, how do you judge whether the Sidekick worked vs misled you?
**Answer:** "skip this question. success is if the user felt like i was given the best possible information including predictions of what other people need and will draft, who is best available for me to draft and what do i need, easy access to previous season data for players, etc."
**Locked:** Success is defined subjectively — "user felt given the best possible information" (opponent need/pick predictions, best-available-for-me + my needs, easy access to prior-season data). No quantitative outcome metric wanted; user skipped further probing.
**Opened:** PARKED → OQ: no falsifiable success metric; draft PRD will carry objective proxies (latency, sync lag, zero manual bookkeeping) as SCs and flag win/quality measurement as an open question.
**Tagged:** none (row 4 parked)

### Q10 — Core user journeys (draft day)
**Asked:** Draft day with the finished tool — how does it get connected/ready 20 min before, and what's on screen while the draft runs (one screen or alongside Sleeper)?
**Answer:** "sidekick should already be connected through api to the league and draft data. we can have sidekick alongside the sleeper room, but it must be able to see the draft picks in real time and be able to generate useful information as it goes."
**Locked:** Form factor = web app running alongside the Sleeper draft room (Sidekick replaces the FantasyPros screen + all manual bookkeeping; picks are still made in Sleeper — API is read-only anyway). Hard requirement: picks visible in Sidekick in real time, insights regenerate continuously as picks land.
**Opened:** "Already connected" is agentless — proposed 🔶 AS-3: one-time setup = enter Sleeper username → tool discovers leagues/drafts via API → auto-attaches to the live draft. Real time = polling `/v1/draft/<id>/picks` (~1s cadence; no public websocket). Contradiction to resolve: v2 §9 "one name, not a ranked list of fifteen" vs user's goal (b) "examine the next few players in rankings... pick the best option".
**Tagged:** 🔶 AS-3 (falsifier: user wants a different attach flow, e.g. paste a draft URL)

### Q11 — Core user journeys (output shape)
**Asked:** Contradiction: v2 §9 "one name… not a ranked list of fifteen" vs goal (b) "examine the next few players… pick the best option." Which wins?
**Answer:** "short ranked list of candidates with recommendation"
**Locked:** Primary output = short ranked list of available candidates with the recommendation highlighted within it. Supersedes v2 §9's one-name-only philosophy. User examines and decides; Sidekick recommends within the list.
**Opened:** "Short" = how many rows? (default to be proposed at draft, ~8, configurable). List columns TBD via next question (stats, survival band, value).
**Tagged:** none

### Q12 — Core user journeys / FRs (player stats)
**Asked:** Which previous-season numbers do you actually compare on the clock — name the visible columns per player?
**Answer:** "i would like to see a breakdown all their games. for each game, a bunch of statistics like the one here: https://fantasydata.com/nfl/amon-ra-st-brown-fantasy/22587/."
**Locked:** Per-player game log, fantasydata.com-style: per game — week/date, opponent, fantasy points, position-appropriate stat line (receiving: rec/tgt/yds/TD/long/yds-per-tgt; rushing: att/yds/avg/TD; passing equiv for QB; fumbles), season tabs for prior seasons. Reachable in ≤1 click from the candidate list. Data route: nflverse weekly stats (covers all columns, all seasons, free — per research verdict); fantasy points recomputed as half-PPR (league scoring), not fantasydata's.
**Opened:** none material (multi-season tabs are free via nflverse; v1 ships 2025 season minimum + prior seasons where loaded).
**Tagged:** none

### Q13 — Core user journeys (opponent prediction display)
**Asked:** Options: survival % inline on candidates only, per-team prediction panel only, or both?
**Answer:** "Both" — inline survival on every candidate row + expandable per-team panel showing needs/tendencies/likely picks for teams before my next turn.
**Locked:** Draft screen = candidate list (rank, ECR, survival %) + per-team opponent panel (upcoming picks, needs, observed tendencies, likely players) + live pick feed + 1-click player game logs.
**Opened:** none
**Tagged:** none

### Q14 — Constraints (hosting)
**Asked:** Local app you start before a draft, or deployed/always-up (shareable)?
**Answer:** "yeah local app you start on your machine."
**Locked:** Local web app, launched on demand, localhost, zero auth, zero hosting cost. "Already connected" (Q10) = launches and reattaches to the live draft via stored Sleeper username/league. No multi-user hosted product → rollout = personal use; "individuals" (Q1) = anyone may clone and run their own instance.
**Opened:** Is the repo intended to be public/open-source? (minor, fold into wrap-up)
**Tagged:** none

### Q15 — Edge cases & failure modes
**Asked:** When Sidekick can't trust its board (polling hiccup, unmatchable player ID) on the clock: freeze with loud warning, advise off stale board flagged, or something else?
**Answer:** "very bad to be stale. better have a self-recovery mode or manual recovery where we can rapidly get back to normal and re-ingest the board."
**Locked:** Staleness is the cardinal sin. Requirements: (1) self-recovery — automatic full-board re-ingest (Sleeper `/picks` returns the complete pick list every poll, so recovery = refetch-all, stateless); (2) manual "re-sync now" control; (3) visible board-integrity/last-sync indicator. Design default: stateless full-state polling over incremental diffs.
**Opened:** Unmatched player (Sleeper ID ↔ ECR name miss): default = show pick with raw Sleeper name, exclude that player from ECR-driven math, warn visibly (fold into FRs, no question needed). Traded picks honored via `/traded_picks` (cheap, endpoint exists). Late attach mid-draft works via the same full re-ingest path.
**Tagged:** none

### Q16 — AI-behavior evals / validation
**Asked:** Validate before first real draft: replay completed drafts (backtest), live mock drafts, and/or manual spot checks? (multi-select)
**Answer:** "Live mock drafts" only.
**Locked:** Validation = end-to-end dress rehearsals in live Sleeper mock drafts with Sidekick running alongside; quality bar = user judgment during mocks. No replay/backtest harness in v1, no quantitative calibration scoring (consistent with parked metrics row).
**Opened:** AS-1 (mocks readable via API) is now v1-critical — it's the ONLY validation path. If falsified, fallback = replay of completed real drafts → carry as risk + OQ. Also proposed: 🔶 AS-4 — no explicit run/deferral alerts in v1 (v2 §6.7); runs are implicitly captured by need vectors + tendencies updating survival %; explicit alerts = v-later. My-roster panel (what I have / what I still need) folded in as an FR — implied by "what do i need" (Q1/Q3).
**Tagged:** 🔶 AS-4 (falsifier: user wants a visible "RB run active" style alert in v1)

### Q17 — Dependencies (ECR ingestion route) — user correction, authorship Q pending
**Asked:** (Q17 asked about authorship; user instead corrected the ECR-route default)
**Answer:** "i prefer if we upload the ECR before the draft, read from fantasypros' website. but that can be flexible, defer that decision later"
**Locked:** Supersedes the nflverse-mirror default from my Q16-turn statement. Requirement locked: ECR must be snapshotted fresh immediately before each draft (freshness at draft time is the point). Route = deliberately deferred → 🔵 OQ-2: read from FantasyPros website directly (user preference; scrape or manual export upload) vs nflverse mirror (lags, but stable/free). Decide at implementation.
**Opened:** none new
**Tagged:** 🔵 OQ-2

### Q18 — Housekeeping (authorship)
**Asked:** Who is "Suraj Sinha" (v2 header) relative to this project; whose name goes on the final PRD?
**Answer:** "author doesnt matter. skip"
**Locked:** Authorship non-material; final PRD carries no author attribution. Open thread closed.
**Opened:** none
**Tagged:** none
