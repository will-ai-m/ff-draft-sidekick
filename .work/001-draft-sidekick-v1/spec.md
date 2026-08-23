# Spec — 001-draft-sidekick-v1

## Problem

Live Sleeper drafts are run today across two screens — a rankings site and the Sleeper draft room — with the drafter manually marking off roughly 150 picks per draft and tagging mine-vs-opponent, under the pick clock; one missed mark corrupts every later decision. Even a perfectly maintained board only answers "who's best overall," not "who's best for my roster given what I still need, what opponents ahead of my next turn need and tend to do, and who will still be there when I pick again" — today that's derived mentally, under time pressure, or not at all.

## Scope

This spec covers the complete v1 product defined by the approved PRD (`prd/draft-sidekick/prd.md`), FR-1 through FR-11 — **no narrowing**. Sizing already fixed this as one large task representing the full v1 (`sizing.md`); per-subtask decomposition during implementation is an architect/developer decision, not a scope decision, and is left open here.

v1 is a local, free-to-run, read-only web app that: attaches to one live Sleeper draft (league or mock) by pasted URL/ID (FR-1); keeps a board in sync via stateless full-refetch polling with a visible integrity indicator and one-click recovery (FR-2, FR-3); ingests immutable-per-draft FantasyPros half-PPR ECR and FFC ADP snapshots matched to Sleeper players (FR-4); derives league-settings-driven roster need vectors for the user (FR-5) and every opponent (FR-6), sharpened by within-draft-only tendency profiles (FR-7); runs a Monte Carlo survival projection over the window before the user's next pick (FR-8); surfaces a ranked candidate list with a single highlighted, reasoned recommendation (FR-9) chosen by a two-pick lookahead plan comparison (FR-10); and gives one-click per-game player history from local nflverse data, scored in the league's own settings (FR-11). The Sleeper room remains the only picking surface; Sidekick never writes to the Sleeper API.

Cross-cutting requirements carried from the PRD, binding on every AC below:
- **Configurable, not hardcoded:** every numeric default tagged 🔶 AS-N below (poll cadence, latency budgets, candidate-list length, survival bands, staleness window, API budget, thresholds) is a configurable parameter whose default is the stated value — never a constant baked into logic (constitution; PRD §12 AS-5).
- **Vocabulary:** implementation uses the PRD §9 terms (board, window, need vector, candidate list, opponent panel, roster panel, pick feed, sync indicator, insight, recomputing vs. degraded) as the identifiers for these concepts, not synonyms.
- **Raw ECR, unadjusted:** FantasyPros' overall half-PPR ECR drives ordering as-is, including the measured QB-vs-market skew (median +16 overall picks ahead of ADP — PRD AS-8, `research/half-ppr-2026-adp-vs-ecr.md`); v1 discloses this via the ADP column (FR-9) and must not correct, blend, or re-weight it.
- **Validation is out-of-band:** per PRD §14, this feature's real-draft readiness gate is ≥3 full live Sleeper mock-draft rehearsals with zero non-converging board states (SC-1's counter-metric) in the qualifying rehearsal, plus a manually-kept post-draft SC-3/SC-4 checklist. Both are live-judgment activities outside this repo's automated spec/code/qa gates and are **not** represented as numbered ACs below (none are diff/suite-checkable) — but they gate real-draft use regardless of this pipeline's verdicts. Mapping for traceability: SC-1→FR-2, SC-2→FR-6/FR-8/FR-9/FR-10, SC-3→FR-2/FR-3, SC-4→FR-5..FR-11; FR-1 and FR-4 carry no dedicated SC (exercised directly by every rehearsal instead).

## Acceptance criteria

<!-- Grouped by PRD FR for traceability. 🔶/✅ tags carry forward the PRD's own markers (🔶 = configurable default defined in PRD §12 AS-N; ✅ = pre-verified). One behavior per criterion; each is verifiable from the diff and an automated suite exercising mocked Sleeper/FantasyPros/FFC/nflverse fixtures, alone. -->

### Attach — FR-1
- AC-1: Pasting a valid Sleeper draft URL or ID attaches to that draft and completes a full initial ingest (settings, draft order, teams, all picks so far) within 10 s (🔶 AS-5).
- AC-2: On attach, the system displays the draft's teams — team names and owner display names where the API provides them, bot/empty seats shown by slot number — before any insight renders.
- AC-3: When a stored Sleeper username exists, the system additionally offers that user's discoverable season drafts as a convenience list; paste remains the primary path regardless.
- AC-4: For a mock draft (`league_id: null`), the system attributes picks to seats via `draft_slot` + `draft_order`, never `roster_id`/`picked_by` (✅ AS-1).
- AC-5: The system determines the user's own slot from `draft_order` when their user id appears there; otherwise it blocks mine-vs-opponent, next-pick, and survival output until the user manually selects their slot.
- AC-6: The system attaches to exactly one draft per running instance.
- AC-7: On an invalid draft ID or unreachable API, the system states which failure occurred and allows retry without discarding what the user already entered.
- AC-8: A second concurrently-running instance shares the per-IP API budget with the first, so the second instance raises its own poll interval (🔶 AS-5).

### Board sync — FR-2
- AC-9: While attached to an incomplete draft, the system re-fetches the complete pick list at a configurable cadence (default 1 s, 🔶 AS-5).
- AC-10: Total Sleeper API request rate from a running instance stays ≤120 requests/min (🔶 AS-5) at default cadence, including under the AC-8 second-instance back-off.
- AC-11: When a new pick appears in a poll response, within 3 s (🔶 AS-5) the system marks the player drafted in every view, appends the pick to the pick feed attributed to its team and flagged mine-vs-opponent, and updates the drafting team's roster.
- AC-12: Traded picks are attributed to their current owner per the traded-picks endpoint, in sync and in the opponent panel's window.
- AC-13: Attaching mid-draft rebuilds complete, correct state from the full pick list alone, with no dependence on having observed earlier picks live.
- AC-14: While the draft is paused or between picks, the system keeps polling and displays current draft status.
- AC-15: Multiple browser tabs/windows against the same running instance display consistent board state with no write conflicts (the app exposes no client-writable draft state).

### Board integrity and recovery — FR-3
- AC-16: At all times while attached, the system displays the last successful sync time and a healthy/degraded indicator.
- AC-17: When a poll fails, or returns data inconsistent with current state (pick count decreases, a previously-seen pick's player or team changes, or a pick number appears out of sequence), the system marks the board degraded, keeps retrying, and performs a full re-ingest automatically on the next successful response.
- AC-18: A malformed or unexpected API payload is treated as a failed poll (degraded + retry), never as a crash or a partial state apply.
- AC-19: Activating Re-sync rebuilds the entire board from the API's complete pick list within 5 s (🔶 AS-5), forcing an immediate out-of-cadence refetch and re-reading league settings, draft order, and traded picks.
- AC-20: When a drafted player cannot be matched to the rankings snapshot, the system shows the pick under its raw Sleeper name, excludes that player from rankings-driven outputs, and displays a visible warning naming the player.
- AC-21: Any insight derived from a board version older than the current one is marked recomputing, never presented as current.

### ECR/ADP snapshots — FR-4
- AC-22: Before attach, the pre-draft check displays each of the ECR and ADP snapshots' capture date and age, warning when either exceeds 24 h (🔶 AS-5).
- AC-23: The system ingests half-PPR overall rank and positional rank for every player in the FantasyPros half-PPR cheat-sheet's embedded `ecrData` JSON, fetched once immediately pre-draft, and warns in the pre-draft check if K/DST rows are absent from a fetched snapshot.
- AC-24: The system ingests an ADP snapshot for the attached league's team count at half-PPR, displaying its source and pool parameters in the pre-draft check and naming the pool actually used when no exact match exists (🔶 AS-6).
- AC-25: Snapshot entries are matched to Sleeper players via the player dump's cross-platform IDs first, normalized names as fallback; entries still unmatched are listed in the pre-draft check and excluded from the candidate list and simulation.
- AC-26: A player with no ADP entry falls back to ECR order within their position for sampling purposes (🔶 AS-6).
- AC-27: When the attached league's scoring settings differ from half-PPR, the pre-draft check warns that rankings are for a different scoring format.
- AC-28: When no ECR snapshot is loaded, board sync, rosters, and the pick feed still run, while the candidate list, survival, and recommendations are disabled with an explicit "no rankings loaded" state.
- AC-29: Both snapshots are treated as immutable for the duration of an attached draft — no mid-draft ranking or ADP changes.

### Rosters and roster panel — FR-5
- AC-30: At attach, team count, roster slot structure (starters by position, flex, bench), and scoring settings are read from the league/draft API, never from hardcoded format constants.
- AC-31: At all times, the roster panel displays the user's filled starting slots, unfilled starting slots by position (their need vector), and bench count, updated within 3 s of the user's pick appearing in a poll response (🔶 AS-5).
- AC-32: League settings that differ from the default assumption (e.g., 3 WR slots, 12 teams) are reflected without reconfiguration.
- AC-33: K/DST slots are tracked on rosters even though excluded from prediction math (🔶 AS-7).

### Opponent need vectors and panel — FR-6
- AC-34: At all times, the opponent panel displays the window — the exact sequence of picks between the user's current and next pick — with each pick's owning team (snake order and traded picks respected).
- AC-35: For each team in the window, the panel displays its unfilled starting slots, need vector, and remaining picks, updated within 5 s of any pick.
- AC-36: For each team in the window, the panel displays its most likely position(s) to draft — likelihood from that team's need-vector weights normalized to sum to 1, prior to FR-7 adjustment — with example likely players drawn from ADP order within those positions.
- AC-37: The panel visually distinguishes position-level predictions (high confidence) from player-level examples (illustrative) and never presents a player-level guess as a certainty.

### Within-draft tendency profiles — FR-7
- AC-38: After each opponent pick, the system updates that team's profile: average reach (player's ADP minus the pick number taken), need-adherence (fraction of picks filling a then-unfilled starting slot), and positional pick counts relative to the league's starting-slot proportions.
- AC-39: Until a team has made at least 3 picks in the current draft (🔶 AS-2), the system uses neutral priors for it and labels its profile early/low-confidence.
- AC-40: The opponent panel displays each team's profile as a compact summary and bends that team's displayed position likelihoods by its profile; these bent weights are the sampling distribution FR-8 consumes.
- AC-41: When a draft ends or Sidekick detaches, all tendency profiles are discarded — none persist across drafts.

### Availability (survival) projection — FR-8
- AC-42: For every candidate in the simulation universe — the top available players by ADP, extended to cover every player displayed in a skill-position candidate-list row (🔶 AS-5) — the system computes the probability of surviving all picks in the window via Monte Carlo simulation: each simulated pick draws a position from the team's tendency-bent need vector — or, when the team has no need signal, samples directly from ADP order instead of drawing a position — then draws the player within that position from ADP order adjusted by the team's reach profile, normalized over available players (🔶 AS-2).
- AC-43: Each simulation run retains its per-run survivor set (which candidates were still available at the end of that run), not only the aggregated marginal percentages — this per-run data is what FR-10's plan scoring (AC-55) consumes.
- AC-44: While the user has a subsequent pick, every skill-position candidate displays its survival percentage and band (likely gone <25%, coin flip, likely available >75%, 🔶 AS-5).
- AC-45: When the user has no pick remaining after the current one, survival percentages and bands are suppressed rather than shown.
- AC-46: When any pick lands, all survival projections recompute within 5 s of the pick appearing in a poll response — for a burst of picks, within 5 s of the burst's final pick, with affected outputs marked recomputing in the interim (🔶 AS-5).
- AC-47: K/DST is excluded from simulation and survival math; when a simulated team's unfilled K/DST starting slots equal or exceed its remaining picks, that team's simulated pick consumes no skill player (🔶 AS-7).
- AC-48: When the board is flagged degraded, all survival outputs carry the degraded flag.

### Candidate list with recommendation — FR-9
- AC-49: At all times, the candidate list displays the top available candidates (default 8, 🔶 AS-5) in ECR order, plus any additional row required by the FR-10 highlight; each row shows overall ECR rank, positional rank, ADP, and — while the user has a subsequent pick — survival percentage with band.
- AC-50: The list is filterable by position in one interaction; the K/DST filter shows positional ECR order without survival math, falling back to ADP order when the snapshot carries no K/DST rankings.
- AC-51: Exactly one candidate is highlighted as the recommendation (placed by FR-10), with a one-line reason naming the single decisive factor by precedence: plan/survival, then need (top-ECR candidate's position has no unfilled starting slot), then value (highlight is the top-ECR candidate and its ADP is ≥10 picks earlier than the current pick, 🔶 AS-5), else best available.
- AC-52: After the highlight is resolved, when it and the highest-ECR available candidate at a different position are within noise (survival within ≤5 percentage points **and** ECR ranks within ≤3, 🔶 AS-5), the highlight stays put and the reason line is replaced with a too-close-to-call statement naming the other candidate (merged with FR-10's near-tie statement when both fire).
- AC-53: When any pick lands, the list drops drafted players and re-highlights within 5 s of the pick appearing in a poll response (burst-final for bursts, marked recomputing in the interim); the recommendation never names a drafted player.

### Two-pick lookahead plan — FR-10
- AC-54: When recommending, the system compares positional plans across the user's current and next pick, drawn only from positions with an unfilled starting slot (FR-5), not from whichever positions happen to appear among displayed candidates.
- AC-55: Each plan is scored as the sum of two overall-ECR-rank terms — best available at the plan's now-position, plus the expected rank of the best available at the plan's next-position at the user's next turn, that expectation computed from the same FR-8 Monte Carlo runs' per-run survivor sets (AC-43: per-run best surviving rank at that position, averaged across runs; a run with no survivor at that position scores the snapshot's last-ranked overall ECR rank + 1) — with the lower total winning (🔶 AS-2).
- AC-56: The FR-9 highlight is the highest-ECR available player at the winning plan's now-position; the list extends to include them when they fall outside the default rows.
- AC-57: The system displays the winning plan, the closest alternative, and the survival fact separating them.
- AC-58: When plan totals are within 3 overall-ECR ranks of each other (🔶 AS-5), the system states that and falls back to the higher-ECR current pick, merging the too-close statement with FR-9's rather than rendering both.
- AC-59: When the user has fewer than two picks remaining, plan comparison is skipped, the FR-9 ECR-ordered highlight is used, and the system states lookahead does not apply.
- AC-60: Lookahead extends at most two of the user's picks ahead (🔶 AS-2).

### Player game logs — FR-11
- AC-61: One click from any candidate row, pick-feed entry, or roster entry opens that player's card without leaving the draft screen.
- AC-62: The card shows a per-game log for the most recent season — week, opponent, fantasy points, and the position-appropriate stat line (passing: att/comp/yds/TD/INT; rushing: att/yds/avg/TD; receiving: tgt/rec/yds/TD/long/yds-per-tgt; plus fumbles).
- AC-63: Prior seasons, where data exists, are reachable as tabs on the same card.
- AC-64: Fantasy points in the log are computed from the attached league's own scoring settings, not a generic format.
- AC-65: When a player has no NFL game data (e.g., a rookie), the card states that explicitly rather than showing an empty table.

### Cross-cutting: observability needed to validate SC-1/SC-2
- AC-66: The system makes per-pick sync lag (poll-response arrival to the pick reflected in every view) observable/measurable during a draft, sufficient to evaluate the SC-1 ≤3 s p95 target during mock rehearsals.
- AC-67: The system makes per-burst insight-refresh latency (burst-final pick to candidate list/survival/opponent panel/recommendation reflecting the post-burst board) observable/measurable during a draft, sufficient to evaluate the SC-2 ≤5 s p95 target during mock rehearsals.

## Non-goals

<!-- The cheapest scope control: anything a reasonable reader might assume is included, but isn't. -->

- A hosted, multi-user, or commercial product; accounts; auth; a mobile app; or a browser extension — v1 is a local single-user web app launched on demand.
- ESPN and Yahoo platforms — v1 is Sleeper-only.
- Auction, dynasty/keeper, best-ball, superflex/2QB, IDP, and TE-premium formats.
- Validated support for league sizes/scoring beyond 10-team half-PPR — other configurations are read from Sleeper settings (FR-5) and may work, but are untested and untuned.
- Blending, adjusting, or personally overriding ECR — including correcting the measured QB-vs-market skew in FantasyPros' derived overall order (AS-8); v1 surfaces raw ECR and discloses the gap via the ADP column only.
- Any projection/model engine beyond ECR-driven ordering (separate effort: `research/fantasy-football-PLAN.md`).
- Persisting opponent tendency profiles beyond the current draft, or using cross-draft history.
- Real-time news/injury verification beyond what the pre-draft ECR snapshot already prices in.
- Explicit positional-run alerts — runs surface only implicitly, via falling survival percentages.
- Making picks, autodraft execution, or queue management — Sidekick is read-only against the Sleeper API; the Sleeper room is always the picking surface.
- Special detection or handling of opponents on Sleeper autodraft — their picks stream in and their tendency profile learns identically to any other team's.
- An in-draft UI to resolve or fix unmatched snapshot entries — unmatched players are excluded from rankings-driven output with a visible warning only, by design.
- An in-app post-draft checklist feature — the SC-3/SC-4 checklist is kept manually, outside the app.
- A quantitative backtest/replay harness — validation is live mock drafts only (PRD §14); a completed Sleeper draft can't be replayed post-hoc regardless (mock data is purged server-side once the draft ends).
- A public real-time channel — sync is polling-only; there is no Sleeper websocket to depend on.

## Open questions

(None — the PRD is fully resolved for v1. OQ-2 is closed. OQ-1, whether success should ever gain a falsifiable outcome metric beyond the subjective SC-4 bar, is explicitly deferred to end-of-2026-season assessment and does not gate this build.)
