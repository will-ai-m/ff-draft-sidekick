# PRD: Draft Sidekick — v3 (working iteration doc)

*Status:* Working draft — iterating on [draft-sidekick-prd-v2.md](draft-sidekick-prd-v2.md)
*Iteration log:* v3.0 started August 20, 2026 (first pass: structural critique + revisions)

This is the living document. v2 is frozen as the baseline. Each iteration here records **what changed and why**, then the revised text. Sections of v2 not mentioned are carried forward unchanged.

---

## Iteration 1 — August 20, 2026

### Critique of v2 (what this pass fixes)

| # | Issue in v2 | Severity | Resolution |
|---|---|---|---|
| 1 | **No connection to the super-consensus ranking project.** v2 treats projections as a commodity dependency ("projection quality is a dependency, not a moat") while the sibling project — an overall draft super-consensus of all experts — is exactly the value input this engine needs. The two halves of willy-ff are one system. | High | New §3.5 "Player value input" wiring the super-consensus board in as the normative value function, with variance retained per player. |
| 2 | **Primary success metric is unmeasurable until a full season passes**, and even then is hopelessly noisy: one 12-team league season is ~1 bit of signal on win rate. v2 has no offline eval at all. | High | New §10: offline eval harness comes first, mirroring the eval-first discipline in [fantasy-football-PLAN.md](../research/fantasy-football-PLAN.md). Replay archived real drafts (Sleeper draft logs are public per league); score availability calibration and opponent-prediction accuracy against what actually happened. Win rate demoted to long-run observational metric. |
| 3 | **"Under 5 seconds" contradicts "verify player status at recommendation time"** if verification means a live fetch. | Med | §8 revised: news ingestion is a continuously-warm cache (hourly poll, event-driven bump on Sleeper trending spikes); recommendation-time "verification" is a cache-freshness assertion (reject if stale > N minutes), never a blocking fetch. |
| 4 | **The fingerprint's cold-start answer is hand-wavy.** "Design for 12–20 picks" — but with what estimator? | Med | §6.3 revised: fingerprint = Bayesian deviation from a platform-ADP prior. Every manager starts as "drafts platform ADP with noise"; observed picks update per-feature posteriors with shrinkage. 0 observations is now well-defined (= ADP-follower), and confidence is the posterior width, not a vibe. |
| 5 | **Availability bands are presented as the model output.** Bands destroy information the §6.5 optimizer needs. | Low | §6.4 revised: internal representation is a continuous survival probability per player; the three bands are UI rendering only. |
| 6 | **Draft-order variants unaddressed.** Third-round reversal (Sleeper supports it), linear drafts, traded picks in dynasty startups, and keeper-slot removals all break naïve snake arithmetic. | Med | §6.1 revised: window computation reads the actual pick-owner list from the platform, never derives it from "snake" assumptions. Keeper-removed players excluded from the pool at init. |
| 7 | **Form factor (open Q4) can be part-resolved now.** Sleeper has a public real-time API and is named the launch platform; a companion web app is buildable today, an overlay extension is not needed for v1. | Low | Q4 resolved for v1: companion web app, one-screen, glanceable. Extension/mobile deferred. Remaining open question narrowed to v2 form factor. |
| 8 | **Acceptance rate ≥60% is a weak trust proxy** — users may accept out of deference, or reject a correct rec that looks weird (which is exactly when the tool earns its keep). | Low | §10 revised: acceptance tracked but not targeted; calibration metrics are the quality bar. Added "regret" metric: EV delta between our rec and the user's actual pick, scored at season end. |
| 9 | **Missing risks:** platform ToS / unofficial API fragility (ESPN especially — see [data-sources.md](../research/data-sources.md): ESPN endpoints are undocumented and break without notice); and self-herding (multiple Sidekick users in one room collapse the behavioral edge). | Med | Added to §11. |
| 10 | **No degradation story.** What happens when the platform API drops mid-draft, or news cache goes stale during the pick clock? | Med | New §9.5: explicit degradation ladder. The tool must never go blank mid-draft. |

### Decisions taken this pass

- **Sleeper is the v1 platform, full stop.** Free public REST + real-time draft endpoints, no OAuth friction ([data-sources.md](../research/data-sources.md) §2). ESPN/Yahoo remain v1.5+ and inherit the fragility risk explicitly.
- **The super-consensus board is the value function.** Draft Sidekick does not maintain its own projections; it consumes the willy-ff super-consensus (rank + variance + staleness per player) and layers game theory on top. This converts v2's "projections are a dependency, not a moat" weakness into the actual moat: nobody else has both halves.
- **Eval before engine.** Milestone 1 is the draft-replay harness, not the recommender — same reasoning as the analytics-site plan: every subsequent feature must move a measured number.

---

### Revised sections

#### §3.5 Player value input (new)

The normative model's value function is the willy-ff **super-consensus draft board**: an aggregate over all published expert rankings, retaining per-player variance and per-source staleness rather than collapsing to a mean.

Three things flow from the board into the engine:

1. **Value:** consensus rank / VOR by format, the input to §6.5 optimization for our own picks.
2. **Market priors:** individual expert lists and platform ADP, the input to §6.3 fingerprinting (a manager who drafts a list is drafting one of *these* lists — we already have them all).
3. **Disagreement signal:** players with wide expert spread are precisely the players whose room price is unpredictable; availability projections widen accordingly instead of feigning confidence.

Interface contract: the board exposes `(player, format) → {rank, vor, variance, adp_by_platform, last_updated, status_flag}`. The Sidekick engine treats it as read-only and never edits player values inline — corrections happen upstream in the consensus pipeline so both halves of the project stay consistent.

#### §6.1 Window computation (revised)

Compute the exact ordered list of picks between the manager's current pick and their next, **read from the platform's pick-owner assignments, never derived from an assumed snake pattern.** Third-round reversal, linear order, traded picks (dynasty), and commissioner edits are all just data under this rule. Keeper leagues: keeper-assigned players are removed from the pool and their roster slots pre-filled at init.

The rest of §6.1 (asymmetric windows, teams picking twice) stands.

#### §6.3 Manager fingerprint (revised estimator)

Same feature set as v2. The estimator is now specified:

- **Prior:** every manager begins as "drafts platform ADP with noise" — the empirically correct zero-observation model, and exactly correct for autodrafters.
- **Update:** each observed pick updates per-feature posteriors (reach magnitude, positional bias, need-vs-BPA weight, list alignment) with shrinkage toward the prior. Confidence = posterior width; the availability model consumes distributions, not point estimates.
- **List alignment as model selection:** with every major published list already in the consensus store, "which list is this manager drafting?" is scored continuously as likelihood over candidate lists (platform ADP is one candidate). When one list dominates, player-level prediction sharpens dramatically; report it as such.
- **Autodraft detection is a fast path:** instant picks at queue-order = the platform's autodraft list, which for Sleeper is knowable. Flag and predict near-deterministically.

#### §6.4 Availability projection (revised)

Internal output: continuous per-player probability of surviving to our next pick (and the pick after, for §6.5 lookahead), with uncertainty from fingerprint posterior width and expert-spread. The three bands (likely gone / coin flip / likely available) are **UI only**. The optimizer consumes raw probabilities.

#### §8 Data architecture (revised principles)

v2's table stands with one structural change and one clarification:

- **Projections/rankings row → replaced by the super-consensus board** (§3.5). Refresh cadence and staleness tracking live upstream.
- **Freshness contract, not fetch-at-rec-time:** news/status data is kept warm by hourly polling (event-bumped by Sleeper trending spikes and injury-designation changes). A recommendation asserts cache freshness (status data < 60 min old in August, configurable); if stale, it degrades per §9.5 and says so. It never blocks on a live fetch inside the pick clock.

#### §9.5 Degradation ladder (new)

The tool must never go blank mid-draft. In order of failure:

1. **News cache stale** → recommend, flagged: "status data is N minutes old; X was healthy as of then."
2. **Fingerprint unstable** (posterior too wide) → availability model falls back to need-vector + ADP prior; say so.
3. **Platform API lagging/down** → user can enter picks manually; engine runs unchanged on manual state.
4. **Engine down** → last computed board with availability bands remains visible. Static but honest.

#### §10 Success metrics (rewritten)

**The eval harness precedes the engine.** Sleeper draft logs are public per league; archived ADP and ranking snapshots exist for prior seasons. Replay real historical drafts pick-by-pick with the engine running blind, and score:

- **Availability calibration** (primary, offline): of players given survival probability p, the observed survival rate must match p across bins. Target: calibration error < 5 points per decile. This is the v2 "85% of likely-available were available" metric, done properly.
- **Opponent position prediction** (offline): top-1 position accuracy per pick. Target 70% by round 3 (kept from v2), now measurable before launch.
- **List-alignment lift** (offline): does the fingerprint beat the ADP-prior-only model at player-level prediction, and by how much per round? This doubles as the answer to open question 5.
- **Latency** (live): p95 < 5s from pick event to recommendation.
- **Stale-status incidents** (live): target zero (kept).
- **Regret** (season-end): EV delta between recommendation and the user's actual pick, scored against end-of-season value. Measures whether disagreeing with us cost users.
- **Win rate / points percentile** (long-run observational): kept as the north star, but explicitly not a launch gate — one season of one league is noise.

Acceptance rate is tracked as an engagement signal, not targeted: a correct-but-surprising recommendation is the product working, and it will depress acceptance early.

#### §11 Risks (additions)

- **Platform dependency and ToS.** Sleeper's API is public but unofficial-tier; ESPN's is undocumented and breaks without notice. Mitigation: adapter layer per platform with manual-entry fallback (§9.5), Sleeper-first sequencing.
- **Self-herding.** If several managers in one room run Sidekick, the behavioral edge partially cancels and the fingerprints feed on each other. Not a v1 problem at v1 scale; note it before growth marketing ever targets whole leagues.
- **Consensus inputs lag exactly when they matter most.** Expert lists go stale in late August (the staleness data is visible in the super-consensus pipeline). Mitigation: the board's per-source staleness weighting, plus the freshness contract in §8.

#### §12 Open questions (updated)

1. Copilot vs autopilot — unchanged.
2. Platform-specific vs composite ADP — now directly measurable in the offline harness; run the experiment, close the question.
3. Cross-draft manager history — unchanged, but the offline harness lowers the cost of answering it.
4. ~~Form factor~~ → **resolved for v1: companion web app** (one glanceable screen, built against Sleeper real-time API). Open for v2: overlay extension vs mobile.
5. List-detection predictive power — now a named offline metric ("list-alignment lift") rather than an intuition.

---

## Next iterations (queue)

- [x] Fold in FantasyPros research findings — see [fantasypros-rankings-sources.md](../research/fantasypros-rankings-sources.md) and [fantasypros-rankings-differences.md](../research/fantasypros-rankings-differences.md). Two direct consequences: (a) open question 2 is essentially answered — platform ADP diverges hugely (23-spot spreads documented), so the room prior must be platform-specific; (b) FantasyPros' per-player std-dev is a free disagreement signal for §3.5/§6.4, and the candidate-list set for fingerprinting = individual expert lists + each platform's default ranks (which measurably lag the market — a predictable bias).
- [ ] Specify §6.5 optimizer concretely: expectimax depth-2 vs Monte Carlo rollouts; noise threshold for "within noise, say so."
- [ ] Draft the recommendation-payload schema (name, reasoning line, runner-up + flip condition, 2-pick plan) as an actual API contract.
- [ ] Wireframe the one-screen draft view.
- [ ] Define the super-consensus board's own PRD (part 1 of willy-ff) and the shared player-ID spine between the two halves (Sleeper IDs as canonical, per data-sources research).
