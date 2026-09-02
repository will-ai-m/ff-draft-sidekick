# PRD — Draft Sidekick

- **Status:** draft
- **Owner:** willyu  |  **Updated:** 2026-08-22  |  **Interview:** `./interview.md`

---

## 1. Summary

Live Sleeper drafts are run today across two screens — the Sleeper draft room plus a rankings site — with the drafter hand-marking every pick and mentally juggling roster needs while the clock runs. Draft Sidekick is a local web app that attaches to the draft through the Sleeper API, keeps the board synced automatically, and puts a fresh-ECR candidate list, per-opponent pick predictions, survival probabilities, and one-click player game logs on a single screen. It worked if the drafter never touches the board by hand again and ends every draft having felt fully informed on every pick.

## 2. Problem & evidence

In the user's most recent live draft, they ran FantasyPros rankings on one screen and the Sleeper draft room on another. As each pick came in, they manually marked the player off on the FantasyPros site and tagged whether it was their pick or an opponent's — roughly 150 times in a 10-team, 15-round draft, every one under the pick clock ("the worst part... this should frankly be automated").

The second pain is that even a maintained board answers the wrong question. A ranking says who is best overall; the actual decision is *who is best for my roster, given what the teams picking before my next turn need and how they've drafted so far, and which players will still be there when I pick again*. Today all of that is derived mentally, per pick, under time pressure — or not at all.

Provider default rankings (Sleeper, ESPN, Yahoo) are "usually pretty damn bad" (user's words), so the drafter maintains an external ranking source, which is what forces the two-screen setup in the first place.

Frequency: every draft, every season, plus mock drafts. Cost: full attention spent on bookkeeping instead of decisions, and picks made without need/availability context.

## 3. Target user & job-to-be-done

**Primary user:** a fantasy manager who already drafts from an external expert ranking rather than platform defaults, drafts on Sleeper in a live snake draft, and runs this tool themselves on their own machine. Concretely: the repo owner, in their own leagues. Anyone else adopts it by cloning and running their own local instance.

**The job:** on every pick of a live snake draft, choose the best player for *my* roster — knowing what I still need, what each opponent needs and is likely to take before my next turn, and which candidates will survive back to me.

**Non-users:**
- Managers on ESPN/Yahoo leagues (v1 is Sleeper-only; see Non-goals).
- Auction, dynasty/keeper, and best-ball drafters (different game; see Non-goals).
- Anyone expecting a hosted service, accounts, or a mobile app — there is no server and no login.
- Anyone wanting the tool to *make* picks — the Sleeper API is read-only; picks are always made in the Sleeper room.

## 4. Current alternative

1. Before the draft: open FantasyPros rankings in one window, the Sleeper draft room in another.
2. Every pick: notice the pick in Sleeper → find the player on the FantasyPros list → mark them drafted → tag mine-vs-theirs.
3. On the clock: scan the crossed-off list, recall own roster holes from memory, guess what the next few teams will do, decide.
4. To check a player's history: open a third site (e.g., a fantasydata player page) and search.

Step 2 hurts most — it is pure bookkeeping repeated ~150 times under a clock, and one missed mark corrupts every later decision. What must not get worse: the Sleeper room stays the picking surface (the API is read-only), and reading the board must never be slower or less trustworthy than the manual list it replaces. Staleness is the cardinal sin: a wrong board is worse than no board.

## 5. Goals

- Zero manual board maintenance from first pick to last.
- Every pick decision made with need, availability, and opponent context visible — not derived mentally.
- The ranking the drafter trusts (fresh FantasyPros ECR), not platform defaults, drives the board.
- A player's game-by-game history is one click away, never a third website.
- Board state is trustworthy at all times, and recovers in seconds when it isn't.

## 6. Success metrics

Success is deliberately subjective — "the user felt given the best possible information" (🔵 OQ-1). The metrics below are the objective proxies that can actually fail; SC-4 makes the subjective bar explicit and recordable. FR-1 and FR-4 carry no dedicated success criterion: their acceptance criteria are exercised in full at every rehearsal (UJ-1, UJ-4), which is the validation of record for them.

### SC-1 — Board sync lag
- **Metric:** seconds from a pick's first appearance in a poll response to that player being marked drafted across all Sidekick views
- **Baseline:** no automated sync exists; 0% of picks auto-reflected (manual cross-off today)
- **Target:** picks reflected in ≤3 s (p95) (🔶 AS-5)  |  **Timeframe:** measured across all mock dress rehearsals, held through the 2026 real drafts
- **Guardrail:** total Sleeper API usage stays ≤120 requests/min (🔶 AS-5; limit ~1000)
- **Counter-metric:** non-converging board state = 0 per draft — a player still shown available in any view after a *subsequent* successful poll has also reported their pick, a pick attributed to the wrong team, or any divergence between Sidekick's board and the API's pick list at the end of the draft. Time-to-reflect inside the sync window is the metric above; only failure to converge counts here.
- **Validates:** FR-2
- **Instrumentation:** needs building (client-side sync log)

### SC-2 — Insight refresh latency
- **Metric:** seconds from the final pick of a burst (a run of picks arriving in quick succession, e.g. bot autodrafts) to candidate list, survival percentages, opponent panel, and recommendation all reflecting that board
- **Baseline:** n/a — no such insights exist today
- **Target:** ≤5 s (p95) after each burst-final pick (🔶 AS-5); mid-burst, affected insights are marked recomputing rather than presented as current
- **Guardrail:** survival estimates stay simulation-stable (re-running on an unchanged board moves no player's percentage across a band boundary)
- **Counter-metric:** insights presented as current while computed from a superseded board = 0 occurrences
- **Validates:** FR-6, FR-8, FR-9, FR-10
- **Instrumentation:** needs building (computation timing log)

### SC-3 — Manual bookkeeping eliminated
- **Metric:** count of manual board-maintenance actions (marking players drafted, tagging pick ownership) the user performs per draft
- **Baseline:** every pick — ~150 actions in a 10-team, 15-round draft (10 × 15; round count from the Sleeper draft settings captured in the AS-1 spike, `research/draft-apis-sleeper-espn-yahoo.md`. The exact count follows the attached league's `rounds` setting, read per FR-5.)
- **Target:** 0  |  **Timeframe:** first mock rehearsal onward
- **Guardrail:** the Sleeper room remains usable untouched alongside (no interference with the picking surface)
- **Counter-metric:** manual re-sync interventions (FR-3) ≤1 per draft — recovery must not become the new bookkeeping
- **Validates:** FR-2, FR-3
- **Instrumentation:** needs building (post-draft checklist)

### SC-4 — Felt-informedness
- **Metric:** post-draft binary self-report: "I had the information I needed on every pick" (yes/no), recorded after every mock and real draft
- **Baseline:** no — the current setup is the evidenced pain (interview Q2)
- **Target:** yes on 100% of 2026 real drafts  |  **Timeframe:** 2026 draft season
- **Guardrail:** a "yes" is invalid if any SC-1/SC-2 counter-metric fired that draft
- **Counter-metric:** count of moments the user opened a third-party site mid-draft for information Sidekick was supposed to have = 0
- **Validates:** FR-5, FR-6, FR-7, FR-8, FR-9, FR-10, FR-11
- **Instrumentation:** needs building (same post-draft checklist as SC-3; kept manually outside the app — deliberately not an FR)

## 7. Non-goals

- **A hosted or commercial product.** This is a personal, local, free-to-run tool; "users" are individuals running their own instance. Not planned.
- **ESPN and Yahoo platforms.** v1 is Sleeper-only; ESPN is the named candidate next platform. Revisit after a full Sleeper season.
- **Other formats: auction, dynasty/keeper, best ball, superflex/2QB, IDP, TE-premium.** None are the user's leagues. The engine reads league settings, but nothing beyond 1QB snake redraft is designed for. Revisit if the user's leagues change.
- **Validated 12-team / full-PPR support.** League size, roster slots, and scoring are read from Sleeper settings (FR-5), so these largely fall out — but v1 is only tested and tuned for 10-team half-PPR. Revisit next draft season.
- **Blending, adjusting, or replacing ECR (the "super-consensus").** v1 ingests raw FantasyPros ECR only — no multi-source blending, variance modeling, or personal overrides. This includes the measured QB skew in FP's derived overall order, which v1 surfaces rather than corrects (🔶 AS-8). Revisit after the first live season ("later we might adjust").
- **The projection/model engine from `research/fantasy-football-PLAN.md`.** Separate effort; this PRD's value function is ECR.
- **Cross-draft opponent history.** Tendency profiles are learned within the current draft only and discarded after it. Revisit only if within-draft profiles prove insufficient in practice (🔶 AS-2).
- **Real-time news/injury verification.** The v2 concept doc required checking "today's report" per recommendation; v1 relies on the pre-draft ECR snapshot having current news priced in by the experts. Revisit alongside the super-consensus work.
- **Explicit positional-run alerts.** Runs surface implicitly as survival percentages dropping (🔶 AS-4). Revisit if mocks show the implicit signal is missed.
- **Making picks, autodraft, or queue management.** Impossible (read-only API) and unwanted — the user decides, in Sleeper. Not planned.
- **A quantitative backtest/replay harness.** Validation is live mock drafts by user choice (interview Q16); replay of completed drafts is the named fallback only if mocks stop being viable. Not planned for v1.
- **Browser-extension or mobile form factors.** A local web app beside the Sleeper room was chosen explicitly. Not planned.

## 8. User journeys

### UJ-1 — Pre-draft setup and attach
**Trigger:** draft day (real or mock), ~20 minutes before the clock starts.
**Path:** launch the local app → paste the draft's URL/ID → app attaches and shows the draft's teams and owners → user confirms it's the right draft (and clicks their slot if auto-detect can't) → app runs the pre-draft check: ECR/ADP snapshot ages (warn if stale), player-matching results with any unmatched entries listed, league settings summary (teams, roster slots, scoring) → full board ingest.
**Success looks like:** before the first pick, the candidate list is up with fresh ECR, the roster panel shows league-correct slots, and the sync indicator is green.

### UJ-2 — The pick loop (core journey)
**Trigger:** any pick lands in the Sleeper room.
**Path:** Sidekick's poll sees the pick → board, pick feed, rosters, and all insights update within seconds → user scans the candidate list (ECR order, survival % and band, recommendation highlighted with its one-line reason) → optionally expands the opponent panel (each team picking before their next turn: needs, tendency summary, likely position/players) → optionally clicks a candidate for their game log → makes the pick in the Sleeper room → Sidekick reflects it and re-plans.
**Success looks like:** the user never touches the board, never opens a third site, and picks with the decision context already on screen.

### UJ-3 — Recovery
**Trigger:** the sync indicator degrades (failed polls, inconsistent data), or the user distrusts the board.
**Path:** Sidekick auto-retries and re-ingests the full pick list continuously → if the user wants certainty now, they hit **Re-sync** → full board rebuild from the API's complete pick list → indicator returns to green.
**Success looks like:** back to a trusted board in seconds, with the degraded interval clearly bounded on screen.

### UJ-4 — Mock dress rehearsal
**Trigger:** validating the tool (or warming up) before a real draft.
**Path:** join a Sleeper mock draft → paste the mock's draft URL/ID into Sidekick (mocks verified readable: `league_id: null`, seat attribution via `draft_slot` + `draft_order` — ✅ AS-1; mock data is live-only, purged post-draft) → confirm seat via slot picker if needed → run the full UJ-2 loop end-to-end → record the SC-3/SC-4 checklist afterward (mock data can't be revisited later).
**Success looks like:** a full-length rehearsal indistinguishable from a real draft, with validation notes (Section 14) recorded.

## 9. Functional requirements

### Terms used by the requirements

- **Team** — the drafting entity a pick belongs to. Keyed by `roster_id` in league drafts; in mocks (whose picks carry empty `picked_by`/`roster_id`) keyed by `draft_slot` + `draft_order` (✅ AS-1). "Seat," "owner," "manager," "opponent," and "league-mate" in this document all refer to this one entity.
- **Board** — the set {player → drafted/available, drafted-by-team} derived purely from the Sleeper pick list. Rankings, survival percentages, and recommendations are **insights** computed downstream from the board plus the snapshots — they are not part of the board.
- **The window** — the sequence of picks between the user's current pick and their next pick. While the user is on the clock, "current pick" is the in-progress one and "next pick" is the one after it; the in-progress slot is never simulated. When the user is not on the clock, the window runs from the in-progress pick through the one before the user's next turn.
- **Need vector** — a team's per-position weights: each unfilled dedicated starting slot contributes weight 1 to its position; each unfilled FLEX slot contributes its **FLEX share** to each eligible position — the split of the league's FLEX starters across the eligible positions, derived at attach from the league's own scoring curves (every league-wide FLEX seat allocated to the eligible position whose next player is worth most: RB 40% / WR 60% / TE 0% for a 10-team half-PPR RB2/WR2/TE1/FLEX1 room, beside the FFC market's own excess starters inside the top 70 picks, RB 36 / WR 64 / TE 0), overridable by `flexShareOverride`, and uniform 1/(number of eligible positions) only when no game-log cache exists (🔶 AS-5; *amended 2026-09-02*: the uniform split handed TE a third of every open FLEX slot, which kept TE in the user's plan set after TE1 was rostered and pitched a second tight end "for FLEX" — Tucker Kraft at picks 63–68 of the 09-02 league draft — where a standard room starts RB/WR at FLEX almost without exception; a position at share 0 takes no FLEX need, absorbs no FLEX slot with its surplus, and banks no starter points past its dedicated slots); K/DST slots contribute nothing (🔶 AS-7; the FR-9 endgame guard, added 2026-08-27, covers the roster-completion consequence outside prediction math). A team with no unfilled starting slots has **no need signal**: its simulated pick is drawn from ADP order across QB/RB/WR/TE — the best-available regime (🔶 AS-5). Used identically by FR-5 (the user's own needs), FR-6 (opponents), and FR-8 (sampling). *(Amended 2026-08-27: for the user's own recommendation only, no-need enters FR-9's bench phase — plans and the highlight draw from bench-eligible positions — rather than raw best-available; simulation of opponents is unchanged.)*
- **Ingest / re-ingest / Re-sync** — one operation (full pick-list refetch + recompute) with three triggers: attach, automatic recovery, and the user's Re-sync control. Re-sync additionally forces the refetch immediately, out of poll cadence, and re-reads league settings, draft order, and traded picks.
- **Recomputing vs degraded** — *recomputing*: the board is trusted but an insight derived from it is still being recalculated. *Degraded*: the board itself cannot currently be trusted (FR-3). The sync indicator distinguishes the two.
- **Named surfaces** — the **candidate list** (FR-9), **opponent panel** (FR-6), **roster panel** (FR-5), **pick feed** (FR-2), and **sync indicator** (FR-3); these names are used identically everywhere.
- **ECR** — FantasyPros' Expert Consensus Ranking. **ADP** — Average Draft Position, the mean pick number at which real drafts take a player.

### FR-1 — Attach to a Sleeper draft

The user connects Sidekick to any Sleeper draft — league or mock — by pasting the draft's URL or ID, and confirms it's the right one before insights render (🔶 AS-3, revised: paste is the primary path by user decision 2026-08-22, superseding username-discovery-first).

**Acceptance criteria**
- [ ] When the user pastes a Sleeper draft URL or draft ID, the system shall attach to that draft and complete a full initial ingest (settings, draft order, teams, all picks so far) within 10 s (🔶 AS-5).
- [ ] On attach, the system shall display the draft's teams — team names and owner display names where the API provides them; seats without a human (mock bots) shown by slot number — so the user can confirm it is the intended draft.
- [ ] ~~When a stored Sleeper username exists, the system shall additionally offer that user's discoverable drafts for the season as a convenience list (mocks may not appear in discovery — unverified; paste always works).~~ *(Removed 2026-08-31 by user directive — paste is the attach path; the stored username remains for seat auto-detection only.)*
- [ ] When the attached draft is a mock (`league_id: null`), the system shall attribute picks to seats via `draft_slot` and `draft_order` rather than `roster_id`/`picked_by` (✅ AS-1).
- [ ] At attach, the system shall determine the user's own slot from `draft_order` when their user id appears there; otherwise it shall require the user to select their slot before any mine-vs-opponent, next-pick, or survival output renders (one-time attach setup, not counted by SC-3).
- [ ] The system shall attach to exactly one draft per running instance; a second concurrent draft means a second running instance.
- [ ] When the pasted ID is not a valid draft or the API is unreachable, the system shall state which and allow retry without losing entered input.

**Consequences:** attach input is one paste; the stored username is optional convenience. Two concurrent instances share the per-IP API budget, so the second instance raises its poll interval (🔶 AS-5).
**Depends on:** —

### FR-2 — Real-time automated board sync

Every pick made in the Sleeper room appears in Sidekick automatically — the manual cross-off ceases to exist.

**Acceptance criteria**
- [ ] While attached to an incomplete draft, the system shall re-fetch the draft's complete pick list at the configured cadence (default 1 s — 🔶 AS-5).
- [ ] When a new pick appears in a poll response, the system shall within 3 s (🔶 AS-5) mark the player drafted in every view, append the pick to the pick feed attributed to its team and flagged mine-vs-opponent, and update the drafting team's roster.
- [ ] When the draft includes traded picks, the system shall attribute each pick to its current owner per the traded-picks endpoint.
- [ ] When Sidekick attaches mid-draft, the system shall rebuild complete, correct state from the full pick list alone, with no dependence on having observed earlier picks live.
- [ ] When the draft is paused or between picks, the system shall keep polling and display current draft status.

**Consequences:** sync is stateless full-state replacement, never incremental diffs — this is what makes FR-3's recovery trivial.
**Depends on:** FR-1

### FR-3 — Board integrity and recovery

The user can always see whether the board is trustworthy, and can force it back to truth in seconds ("very bad to be stale").

**Acceptance criteria**
- [ ] At all times while attached, the system shall display the last successful sync time and a healthy/degraded indicator.
- [ ] When a poll fails or returns data inconsistent with current state — the pick count decreases, a previously-seen pick's player or team changes, or a pick number appears out of sequence — the system shall mark the board degraded, continue retrying, and perform a full re-ingest automatically on the next successful response.
- [ ] When the user activates the Re-sync control, the system shall rebuild the entire board from the API's complete pick list within 5 s (🔶 AS-5), forcing an immediate out-of-cadence refetch and re-reading league settings, draft order, and traded picks.
- [ ] When a drafted player cannot be matched to the rankings snapshot, the system shall show the pick with its raw Sleeper name, exclude that player from rankings-driven outputs, and display a visible warning naming the player.
- [ ] When any insight is derived from a board version older than the current one, the system shall mark it recomputing rather than presenting it as current.

**Consequences:** recommendations must tolerate a flagged-degraded state — they display, but carry the degraded flag.
**Depends on:** FR-2

### FR-4 — Fresh ECR and ADP snapshots per draft

Each draft runs on a FantasyPros ECR snapshot and an ADP snapshot taken immediately beforehand — never weeks-old lists — with every entry matched to a Sleeper player before the draft starts.

**Acceptance criteria**
- [ ] Before attach, the pre-draft check shall display each snapshot's capture date and age (ECR and ADP), and shall warn when either is older than 24 h (🔶 AS-5).
- [ ] *(Amended 2026-09-01 — positional tiers.)* Alongside the overall snapshot, the system shall fetch the four skill-position cheat sheets (`qb-cheatsheets`, `half-point-ppr-{rb,wr,te}-cheatsheets`) and join each player's **positional tier** by FantasyPros id; the overall board's cross-position tiers are ignored everywhere (user directive: positional runs are what draft decisions read — the 2026 TE page holds Bowers/McBride/Loveland/Warren as one Tier 1 where the overall board sliced them 2/3/3/4). Each page degrades independently: a failed or tier-less page nulls that position's tiers (per-player tier steps) and the pre-draft check warns, naming the position and why; K/DST tier pages are never fetched for the engine (🔶 AS-7).
- [ ] When an ECR snapshot is loaded, the system shall ingest half-PPR overall rank and positional rank for every player it ranks. Source (🔵 OQ-2 — resolved 2026-08-22): the FantasyPros half-PPR cheat-sheet page's embedded `ecrData` JSON (`fantasypros.com/nfl/rankings/half-point-ppr-cheatsheets.php`), fetched once immediately pre-draft — verified to carry 839 players including K/DST rows, per-player overall and positional ranks, tier, min/max/std-dev, and FantasyPros player ids (the crosswalk key). The pre-draft check shall warn if K/DST rows are absent from a fetched snapshot (the page's embed schema is unversioned).
- [ ] When an ADP snapshot is loaded, the pre-draft check shall display its source and pool parameters, pulled for the attached league's team count at half-PPR (🔶 AS-6), naming the pool actually used when no exact match exists.
- [ ] The system shall match snapshot entries to Sleeper players via the Sleeper player dump (`/v1/players/nfl`) using cross-platform IDs first (the nflverse ID crosswalk; gsis/espn/yahoo/sportradar ids) and normalized names as fallback; entries still unmatched shall be listed in the pre-draft check and excluded from the candidate list and simulation rather than shown as available all draft.
- [ ] When a player has no ADP entry, the system shall fall back to ECR order within that player's position for sampling purposes (🔶 AS-6).
- [ ] When the attached league's scoring settings (read at attach, FR-1) differ from the snapshot's scoring format — v1 ships half-PPR only — the pre-draft check shall warn that rankings are for a different scoring format.
- [ ] When no ECR snapshot is loaded at attach, the system shall still run board sync, rosters, and the pick feed, and shall disable the candidate list, survival, and recommendations with an explicit "no rankings loaded" state.
- [ ] While a draft is attached, the system shall treat both snapshots as immutable — no mid-draft ranking or ADP changes.

**Consequences:** rankings freshness is the user's pre-draft ritual; the tool enforces visibility, not the ritual itself. Matching quality is bounded by the ID crosswalk — residual unmatched entries are dropped from play by design (user decision 2026-08-22: no in-draft resolve UI).
**Depends on:** FR-1

### FR-5 — League-settings-driven rosters and the roster panel

Roster math comes from the league's actual settings, and the user's own needs are always on screen ("what do I need").

**Acceptance criteria**
- [ ] When attaching, the system shall read team count, roster slot structure (starters by position, flex, bench), and scoring settings from the draft/league via the API — never from hardcoded format constants.
- [ ] At all times, the roster panel shall display the user's roster: filled starting slots, unfilled starting slots by position (their need vector), and bench count, updated within 3 s of their pick appearing in a poll response (🔶 AS-5).
- [ ] When league settings differ from the default assumption (e.g., 3 WR slots, 12 teams), the system shall reflect them without reconfiguration.
- [ ] When settings include K/DST slots, the system shall track them on rosters even though they are excluded from prediction math (🔶 AS-7).

**Consequences:** 12-team and 3WR support "fall out" structurally but remain untested (see Non-goals).
**Depends on:** FR-2

### FR-6 — Opponent need vectors and the opponent panel

The user sees, for every team picking before their next turn, what that team needs and what it is likely to do ("predict what my opponents are likely to draft next based on what they need and how they have drafted so far").

**Acceptance criteria**
- [ ] At all times, the opponent panel shall display the window — the exact sequence of picks between the user's current and next pick — with the owning team of each (snake order and traded picks respected).
- [ ] For each team in the window, the system shall display its unfilled starting slots, its need vector, and remaining picks, updated within 5 s of any pick.
- [ ] For each team in the window, the system shall display its most likely position(s) to draft, with likelihood derived from its need-vector weights normalized to sum to 1 (before any FR-7 tendency adjustment), and example likely players drawn from ADP order within those positions. *(Amended 2026-09-02 — K/DST timing on the panel:)* each row shall also state the chance FR-8 spends that pick on a kicker or defense — AC-47's placement rule read as an expectation, walked per team through the window so a seat picking twice at a snake turn carries its first pick's chance into its second: 0 through the middle rounds, which rooms use for skill depth; rising over a team's last few picks; 1 at its deadline — and the skill-position likelihoods (need-derived and tendency-bent alike) shall be scaled by the remainder, so a row's positions and its K/DST chip sum to 1. The conditional need distribution FR-7 bends and FR-8 samples is unchanged. Rationale (user directive, 09-02 league draft): "people don't fill K and DST until the last few rounds… they're probably using the middle rounds to build up depth" — the panel said "drafting best available" for a seat two picks from its deadline while the simulation was already spending that pick on a defense.
- [ ] The panel shall distinguish position-level predictions (high confidence) from player-level examples (illustrative), and shall never present a player-level guess as a certainty.

**Consequences:** requires the ADP snapshot (FR-4, 🔶 AS-6); teams picking twice before the user's next turn appear twice.
**Depends on:** FR-4, FR-5

### FR-7 — Within-draft tendency profiles

Each opponent's observed drafting behavior sharpens predictions about them — learned live, from this draft only ("how they have drafted so far").

**Acceptance criteria**
- [ ] After each opponent pick, the system shall update that team's profile: average reach (a pick's reach = the player's ADP minus the pick number at which taken; positive = taken ahead of market), need-adherence (the fraction of the team's picks that filled a then-unfilled starting slot at the time of the pick), and positional counts of their picks relative to the league's starting-slot proportions.
- [ ] Until a team has made at least 3 picks in this draft (🔶 AS-2), the system shall use neutral priors for it and label its profile as early/low-confidence.
- [ ] The opponent panel (FR-6) shall display each team's profile as a compact summary (e.g., reach tendency, need-vs-BPA lean), and shall bend that team's displayed position likelihoods by its profile — these bent weights are the team's sampling distribution (consumed by FR-8).
- [ ] When a draft ends or Sidekick detaches, the system shall discard all tendency profiles — none persist across drafts.

**Consequences:** profiles bend FR-8's sampling weights; discarding them keeps the cross-draft non-goal honest.
**Depends on:** FR-6

### FR-8 — Availability (survival) projection

Every available candidate carries the probability it survives to the user's next pick — the number that turns a ranking into a decision.

**Acceptance criteria**
- [ ] For every candidate in scope, the system shall compute the probability the player survives all picks in the window, by Monte Carlo simulation of those picks: each simulated pick draws a position from a blend of the market and the team's need — `(1 − 🔶 opponentNeedBlend) × marketShare + 🔶 opponentNeedBlend ×` the tendency-bent need distribution (FR-7), where marketShare is each position's share of the cross-position ADP draw weight over what is still available in that run *(amended 2026-08-31: the pure need-proportional draw assumed draft-open rooms spend ~19%/14% of picks on TE/QB where the observed rehearsal rooms spent 7%/3% over their first 30 picks — first-30 mix 50% RB / 40% WR — making TEs look scarce and RBs look safe; default 0.45 by joint MLE with `drawSharpness` on observed opponent picks, log-likelihood −750 vs −1319 for need-only)* — or, when the team has no need signal, skips the position draw and samples directly from ADP order (see Terms) — then draws the player within that position from ADP order adjusted by the team's reach profile, normalized over available players (🔶 AS-2).
- [ ] While the user has a subsequent pick, each skill-position candidate shall display the percentage and its band: likely gone (<25%), coin flip, likely available (>75%) (🔶 AS-5).
- [ ] When the user has no pick remaining after the current one, the system shall suppress survival percentages and bands rather than displaying them.
- [ ] When any pick lands, the system shall recompute all survival projections within 5 s of the pick appearing in a poll response — for a burst, within 5 s of the burst's final pick, with affected outputs marked recomputing in the interim (FR-3; validates SC-2).
- [ ] K/DST shall be excluded from simulation and survival math (🔶 AS-7); and when a simulated team's unfilled K/DST starting slots equal or exceed its remaining picks, that team's simulated pick shall consume no skill player, so late-round K/DST demand does not inflate apparent skill-player scarcity. *(Amended 2026-08-27:)* within a team's last `unfilled + kdstEarlyPickWindow` picks (default window 4 — 🔶 AS-5), each simulated pick shall be spent on K/DST with probability `unfilled / remaining` — reaching 1 at the deadline, which is the original rule — because the 08-27 mock rehearsal's trace showed nine of ten seats drafting K/DST with four to six picks still in hand, demand the deadline-only model mis-scored as skill-player scarcity. *(Amended 2026-09-02 — back-weighted placement:)* within the window the pick `r` from the team's deadline shall carry weight `kdstEarlyPickDecay^(r−1)` and be spent on K/DST with chance `unfilled × weight(r) / Σ weight(1..r)` (decay 1 restores the uniform `unfilled / remaining`; defaults decay 0.5, window 5 — 🔶 AS-5). The uniform placement put a third of every team's last six picks on K/DST; the rooms on record — the 09-02 league draft (10 humans) and two completed bot-room mocks, 30 teams and 57 K/DST picks — spent 74% of them in the last two rounds and used the middle rounds for skill depth (per-team share of K/DST picks at 1..7 picks from the end: .70 .70 .13 .13 .13 .07 .03; the fitted model gives .82 .69 .25 .13 .06 .03 .02, least-squares SSE 0.036 against 0.46 for uniform placement). Re-fit against `trace:calibrate` after each rehearsal. The same rule, read as an expectation, is what FR-6 now displays per pick.
- [ ] When the board is flagged degraded (FR-3), all survival outputs shall carry the degraded flag.

**Consequences:** simulation scope is bounded to the top available players by ADP, extended to cover every displayed skill-position candidate row (🔶 AS-5), to hold the latency budget; the simulation retains per-run survivor sets (not just marginal percentages) for FR-10's plan scoring.
**Depends on:** FR-4, FR-7

### FR-9 — Candidate list with embedded recommendation

The primary panel is a short ranked list of the best available players with the recommended pick highlighted — the user examines, the Sidekick recommends, the user decides.

**Acceptance criteria**
- [ ] At all times, the candidate list shall display the top available candidates (default 8 — 🔶 AS-5) in ECR order, plus any additional row required by FR-10's highlight; each row shows overall ECR rank, positional rank, the player's positional tier (2026-09-01 — their position page's own grouping, the dropoff structure FR-10's urgency facts cite), ADP (so the ECR-vs-market gap is visible per row — 🔶 AS-8), and — while the user has a subsequent pick — survival percentage with band (every displayed skill-position row has one; the FR-8 universe extends to cover it).
- [ ] The list shall be filterable by position in one interaction; K/DST filters show positional ECR order without survival math, falling back to ADP order when the snapshot carries no K/DST rankings (🔶 AS-7).
- [ ] Exactly one candidate shall be highlighted as the recommendation — placed by FR-10's plan comparison — with a one-line reason naming the single decisive factor by precedence: **plan/survival** (the winning plan moved the highlight off the overall top-ECR candidate), **need** (the top-ECR candidate's position has no unfilled starting slot, so it was excluded from the plan set), **value** (the highlight is the top-ECR candidate and its ADP is ≥10 picks earlier than the current pick — 🔶 AS-5), else **best available**.
- [ ] *(Added 2026-09-01 — per-player explainability.)* Every candidate row the list or its position filters can show shall carry a server-produced explanation, surfaced on hover **and on keyboard focus** of the player's name: a one-line headline saying either that this is the pick or the single reason it was passed over (a better player at the same position, a position filling no open starting slot or no longer adding bench value, or the winning plan's total), plus the facts the recommendation actually consumed — the player's projected pts/gm on this league's scoring, their positional tier and how much of it is left (with the step down when theirs is the live tier), their survival to the user's next pick, and their roster fit. Explanations ride as one map keyed by player id so `rows` and `rowsByPosition` cannot disagree, and are rendered verbatim — the browser never re-derives a second opinion about a pick the engine already reasoned about.
- [ ] After the highlight is resolved, when it and the highest-ECR available candidate **at a different position** are within noise — survival percentages within ≤5 percentage points **and** overall ECR ranks within ≤3 (🔶 AS-5) — the system shall leave the highlight where it is and replace the reason line with a single too-close-to-call statement naming the other candidate (merged with FR-10's near-tie statement when both fire).
- [ ] When any pick lands, the list shall drop drafted players and re-highlight within 5 s of the pick appearing in a poll response (burst-final for bursts, marked recomputing in the interim); a recommendation shall never name a drafted player.
- [ ] *(Added 2026-08-27 — the endgame K/DST guard.)* When the user's remaining picks are at or below their unfilled K/DST starting slots plus a buffer (default 0 since 2026-08-28 — rehearsal #3 showed the 1-pick buffer spending a bench-RB pick on an early DST for a fully-compliant user; 🔶 AS-5), the highlight shall move to the top available player at an open K/DST position (positional ECR order, ADP fallback per the filter rule above; the better of the two open positions by ADP), with a reason naming the picks left and the open slots; the FR-10 plan comparison is suppressed while the guard holds. This amends 🔶 AS-7's scope, whose stated falsifier — late-round K/DST runs hurting decisions — fired in the 08-27 mock rehearsal: a user following every highlight finished 6 QB / 0 K / 0 DST while nine of ten seats rostered both. K/DST remain excluded from all prediction math; the guard is roster arithmetic only.
- [ ] *(Added 2026-08-27 — the bench phase.)* Once the user has no need signal (all starting slots filled), plans and the highlight shall draw only from positions that still add bench value: every FLEX-eligible position, plus any other skill position whose total roster count is below its starting slots + a headroom (default 1 — 🔶 AS-5; a 1-QB league therefore caps at 2 QBs, a 2-QB league at 3 — slot arithmetic, never a hardcoded league shape) **and** — the flex-first gate, amended 2026-08-31 — only once every FLEX-eligible position carries at least one backup: a spare QB can never start weekly in a 1-QB lineup, and rehearsal #7 showed the thinnest-position rule reading "no backup QB" as the neediest bench hole (Lawrence at 79, Purdy at 94, amplified by AS-8's QB ECR skew) while FLEX depth went unfilled. When the board's top-ECR player sits at a capped position, the highlight redirects with a roster-balance reason naming the player passed over; the displayed rows stay raw ECR order (🔶 AS-8) — only the recommendation is constrained. Rationale: in the 08-27 rehearsal the no-need regime recommended QB3–QB6 (amplified by AS-8's QB-vs-market ECR skew reading as repeated "value") while the bench held two RBs; every other seat carried 4–6. *(Amended 2026-08-28 — the thinnest-position rule:)* among the bench-eligible positions, the highlight shall go to the position with the fewest bench bodies behind its dedicated starters (ECR breaking ties and choosing the player within it), with the reason naming the depth and the passed-over board leader. Rationale: rehearsal #3 showed the capped-only rule redirecting the same greed into WR7 and WR8 for a two-RB roster — ECR picks the player, the roster picks the position.

**Consequences:** supersedes the v2 concept's one-name-only output; the list is the primary surface, and its highlight is FR-10's output, not an independent second opinion.
**Depends on:** FR-4, FR-8

### FR-10 — Two-pick lookahead plan

The recommendation optimizes the user's next two picks jointly, not the current pick in isolation — and it, not a per-row rule, is what places FR-9's highlight.

**Acceptance criteria**
- [ ] When recommending, the system shall compare positional plans across the user's current and next pick (e.g., WR-now/RB-next vs RB-now/WR-next), drawn from the positions the user still needs (unfilled starting slots per FR-5) — not from whichever positions happen to appear among the displayed candidates.
- [ ] *(Amended 2026-08-31 — plans score in projected points, not ECR-rank sums.)* Each plan shall be scored as the starter points it expects to bank, and the **higher** total wins (🔶 AS-2): the **shaded value** of the best available player at the plan's now-position, plus the expected best surviving shaded value at its next-position at the user's next turn — that expectation computed from the same FR-8 Monte Carlo runs (per run, the best surviving player's value at that position; averaged across runs), never from marginal survival probabilities combined as if independent — plus the expected value of every **other** starting slot still unfilled after the plan's two picks (the 2026-08-28 fill term, revalued and horizon-priced): each slot — dedicated and FLEX alike, priced for every plan symmetrically — is assigned to one of the user's actual later turns and priced by a market replay of that turn's board (the best still-available player at the slot's position whose ADP that pick number has not passed, ECR rank standing in per AC-26, consumed so no player fills two slots; slots beyond the user's remaining picks price at 0). Horizon pricing replaced next-turn pricing after rehearsal #6: with every deferred slot priced at next-turn survivor values, deferral was near-free at every decision, every recompute of the draft read "too close to call", and the roster reached round 6 with one WR, two WR-capable slots open, and a fourth RB recommended. A plan pick beyond a position's startable capacity (dedicated slots + open FLEX for an eligible position) prices at 0 — a bench pick banks no starter points. Runs in which no universe player at a position survives floor at the best available player *outside* the simulation universe (who survives by construction), or 0 with nobody left. **Shaded value** (FR-10's value model, built once per attach): each player is priced at the mean of their position's historical points curve over [own positional ECR rank, rank + 2] — the curve being the rank-N finisher's mean season total across the FR-11 game-log cache's seasons, scored under the attached league's own settings (AC-64's rule extended to the recommendation) and divided by 17 to read as pts/gm; FantasyPros' positional tiers (FR-4, amended 2026-09-01) time the urgency facts below but never set a price. With no game-log cache, no plan is scored — the best-available regime stands and the pre-draft check says why. Rationale: the 08-31 rehearsals fired on rank arithmetic twice — Josh Allen (ECR 27, QB) recommended at pick 1 of a 1-QB league because `27 + E[best RB rank]` tied `1 + E[best QB rank]` (a rank gap carries no points; the QB curve is flat exactly where the RB curve cliffs), then, on the first value-model cut, Brock Bowers at pick 6 via a TE-now/TE-next plan (tier-mean pricing let a singleton tier keep its full peak while deep RB/WR tiers flattened, and a same-position double banked an unpriced FLEX subsidy). Rehearsal #2/#3's fill-cost rationale stands: two open RB slots against a collapsing RB shelf must outweigh a higher-value WR pair.
- [ ] The FR-9 highlight shall be the highest-ECR available player at the winning plan's now-position; when that player falls outside the default candidate rows, the list extends to include them.
- [ ] The system shall display the winning plan and the closest alternative, with the survival fact that separates them — tier-shaped since 2026-08-31, from the same per-run data: each deferred position's current tier group (of its best available player), members left, the joint probability at least one lasts to the user's next turn, and the pts/gm step down to the next live tier (e.g., "TE Tier 3: 1 of 3 left, 31% chance one lasts to your next pick (next tier −1.8 pts/gm)").
- [ ] When plan totals are within 0.75 projected pts/gm of each other (🔶 AS-5; `planTotalTooClosePoints`, replacing the rank-scale `planTotalTooCloseEcrRanks` 2026-08-31), the system shall state that and fall back across **every plan inside that band** (not the top two alone — rehearsal #6's mid-rounds tied two flex plans at the top with the need plan 0.1 behind, invisible to a top-two rule), in this order *(reordered 2026-09-02)*: first to a now-pick adding replacement-adjusted depth at a filled position while the lone missing starter is projected to last; then to a now-pick filling an unfilled **dedicated** starting slot that will *not* wait — its best candidate is not projected to survive (a safely-deferrable QB/TE hole does not count; the round-6 directive, and the Tyler Warren case where the last Tier-1 TE went the very next pick); then to a now-pick at a position that **actually flexes** in this league — the FLEX share's verdict, RB/WR in standard scoring — over a single-slot one (rehearsal #7: a dedicated-slot-only rule promoted Drake Maye at pick 46 because QB was the lone dedicated hole — the one pick that can never start anywhere else and whose flat curve makes deferral cheap); then — added 2026-09-01 — to the position carrying the greater **tier-break risk** (the chance its current tier is gone by the user's next turn times the step down to the next live tier; both halves are already computed by FR-8's survivor matrix and FR-10's value model, and until now were only printed); then to the better-overall-ECR player — depth-while-safe first, urgent need second, lineup flexibility third, tier urgency fourth, consensus last, never a manufactured preference; the too-close statement merges with FR-9's within-noise line rather than rendering twice. Rationale for the 2026-09-02 reordering: the 09-02 league draft's ladder read TE as an equal FLEX peer of RB/WR and "kept the pick FLEX-eligible" with Tucker Kraft at picks 63–68 while Tyler Warren already started at TE (user directive: "TE does not flex… WR and RB have way more upside"); with TE no longer counting as a flexing position, an urgent TE hole would otherwise have lost the flexibility rung to a spare RB before its urgency was ever consulted, so need moved above flexibility. *(The 2026-08-31 wording is deliberate: the prior "higher-ECR" phrasing shipped as a rank-delta comparison that let two same-position plans occupy both slots and sent the worse-consensus player out at pick 1.)*
- [ ] When the user has fewer than two picks remaining, the system shall skip plan comparison, fall back to FR-9's ECR-ordered highlight, and state that lookahead does not apply.
- [ ] Lookahead shall extend at most two of the user's picks ahead (🔶 AS-2).

**Consequences:** plan framing gives the runner-up-and-what-flips-it view without a separate output; requires FR-8's per-run survivor sets.
**Depends on:** FR-8, FR-9, FR-11 (the game-log cache prices the value model)

### FR-11 — One-click player game logs

Any player's game-by-game history is one click away, in the league's own scoring — the third website ceases to exist.

**Acceptance criteria**
- [ ] From any candidate row, pick-feed entry, or roster entry, one click shall open that player's card without leaving the draft screen.
- [ ] The card shall show a per-game log for the most recent season: week, opponent, fantasy points, and the position-appropriate stat line (passing: att/comp/yds/TD/INT; rushing: att/yds/avg/TD; receiving: tgt/rec/yds/TD/long/yds-per-tgt; plus fumbles) — the shape of the fantasydata.com player page the user pointed to.
- [ ] Prior seasons, where data exists, shall be reachable as tabs on the same card.
- [ ] Fantasy points in the log shall be computed from the attached league's scoring settings, not a generic format.
- [ ] When a player has no NFL game data (e.g., rookie), the card shall state that explicitly rather than showing an empty table.

**Consequences:** requires a local per-game stats dataset for recent seasons, refreshed before draft season (source: nflverse weekly stats — Section 11).
**Depends on:** FR-4

## 10. Edge cases & failure modes

| Case | Behavior | Who sees it |
|---|---|---|
| First run, nothing configured | Prompt for Sleeper username; validate before storing (FR-1) | User, setup screen |
| No live draft found | List upcoming drafts with start times; allow attaching to a scheduled draft in a waiting state | User, attach screen |
| Sleeper API unreachable mid-draft | Board marked degraded with last-sync time; auto-retry; full re-ingest on recovery; insights carry degraded flag (FR-3) | User, persistent indicator |
| Drafted player unmatched to ECR snapshot | Pick shown with raw Sleeper name; excluded from rankings math; visible warning (FR-3) | User, pick feed + warning area |
| ECR/ADP snapshot stale (>24 h) | Warning with snapshot age; attach allowed but flagged (FR-4) | User, pre-draft check |
| No ECR snapshot loaded | Board sync, rosters, and pick feed run; candidate list, survival, and recommendations disabled with an explicit "no rankings loaded" state (FR-4) | User, candidate list area |
| Player missing from ADP source | Sampled by ECR order instead of ADP within its position (FR-4, 🔶 AS-6) | Nobody (internal fallback); logged |
| User's final pick (no next turn) | Survival math suppressed (nothing to survive to); lookahead disabled; recommendation falls back to ECR order with the reason stated (FR-8, FR-10) | User, candidate list |
| Two drafts on the same night | One attached draft per instance; run a second instance for the second draft; both share the per-IP API budget, so the second raises its poll interval (FR-1, 🔶 AS-5) | User, at attach |
| Attach mid-draft / app restarted mid-draft | Full state rebuilt from complete pick list; identical result to having watched live (FR-2) | User: brief ingest, then normal |
| Draft paused / long clock idle | Polling continues; status displayed; no timeout | User, status area |
| Opponent on autodraft | No special handling — their picks stream in and their tendency profile learns like any other | Nobody |
| Traded picks | Ownership follows the traded-picks endpoint in window display and sync attribution (FR-2, FR-6) | User, opponent panel |
| Two Sidekick tabs open | Both read-only against the same local server; no write conflict possible | Nobody |
| Malformed/unexpected API payload | Treated as a failed poll: degraded state + retry, never a crash or partial apply (FR-3) | User, indicator only |

## 11. Constraints & dependencies

**Constraints**
- Local web app on the user's machine; zero hosting cost, zero auth, launched on demand.
- Free to run: no paid data sources, no subscriptions (build-over-buy is the point).
- Sleeper API is read-only; hard ceiling ~1000 req/min per IP — Sidekick budget ≤120 req/min (🔶 AS-5; SC-1 guardrail).
- No public Sleeper websocket: real-time = polling (default 1 s — 🔶 AS-5).
- No calendar deadline ("draft time doesn't matter") — correctness over speed-to-ship.

**Data touched**
- Sleeper username (stored locally), public league/draft/pick data, public player metadata and stats.
- Opponent tendency profiles are derived about real league-mates: session-only, local-only, discarded post-draft, never published (FR-7).
- Nothing sensitive leaves the machine; there is no server side.

**Dependencies** (no formal agreements — all public/free; stability is a risk, not a contract)
- **Sleeper API** — draft state, league settings, player metadata. Unofficial rate guidance; endpoints verified live 2026-08 (✅ AS-1). The full player dump (`/v1/players/nfl`, ~12k players, verified 2026-08-22) carries cross-platform IDs (gsis/espn/yahoo/sportradar) — the basis for snapshot matching via the nflverse player-ID crosswalk (FR-4).
- **FantasyPros ECR** — the value function. Route resolved (🔵 OQ-2, 2026-08-22): the half-PPR cheat-sheet page's embedded `ecrData` JSON — verified 2026-08-22: 839 players (incl. 35 K, 32 DST), overall + positional ranks, tier, min/max/std-dev, FantasyPros player ids, 107 experts, `last_updated` stamp, no auth; one page fetch per draft (personal use, negligible load — the nflverse mirror `load_ff_rankings()` remains the fallback if the embed changes). Note: this cheat-sheet page *includes* K/DST rows, unlike the pure overall-ECR list documented in `research/fantasypros-rankings-sources.md` §1.
- **ADP source** — Fantasy Football Calculator composite API, half-PPR, league size (🔶 AS-6); free with attribution requested.
- **nflverse weekly player stats** (via `nflreadpy`) — game logs for FR-11; free, covers all needed columns and seasons.

## 12. Assumptions index

Highest risk first.

| ID | Assumption | Risk if wrong | How to validate | Cost |
|---|---|---|---|---|
| AS-2 | The right v1 engine is layers 1–4 (snake window, need vectors, ADP survival, within-draft tendencies incl. 3-pick cold-start threshold) + two-pick lookahead, computed by Monte Carlo simulation of the window's picks; cross-draft history adds nothing v1 needs | Recommendations untrustworthy or too slow → the decision half of the product fails its purpose | Mock dress rehearsals: survival bands vs actual outcomes, latency vs SC-2; fall back to closed-form if MC misses budget, demote layer 4 if it adds nothing | 3 mock drafts |
| AS-6 | FFC composite ADP (half-PPR, at the league's team count) approximates how a Sleeper room actually drafts — Sleeper's public API exposes no ADP (verified 2026-08-22: player dump carries only `search_rank`) | Survival percentages systematically miscalibrated — the headline number misleads | During mocks, compare observed pick order vs FFC ADP; if divergence is large, source platform ADP another way | 1 mock draft + a spreadsheet |
| AS-8 | FantasyPros' **overall** half-PPR ECR is usable as-is as the board's ordering for a 1QB league. Experts do not submit an overall list — they submit positional lists, and FP's Rank Converter derives the overall order. This repo's own measurement (`research/half-ppr-2026-adp-vs-ecr.md`, data pulled 2026-08-21; 103-expert ECR vs a 4-source ADP composite) puts QBs a median **+16 overall picks** ahead of market ADP (n=28), against TE +1, WR −1, RB −2 | Measured and accepted: the value function is skewed for one whole position, so FR-9's ECR-ordered panel floats QBs ~1.5 rounds ahead of the room on every pick — and under FR-9 AC-3's value test (ADP earlier than current pick) a skew-inflated QB never qualifies as "value," so the skew ships unlabelled, reason reading "best available." v1 surfaces it (ADP column) rather than correcting it — the raw-ECR-only non-goal forbids adjustment | No new work to detect it; it is measured. Mitigation is disclosure: the per-row ADP column (FR-9 AC-1) makes the ECR-vs-market gap visible. Re-measure the per-position ADP−ECR median on each season's pre-draft snapshot | Free (already done) |
| AS-5 | Parameter defaults chosen without user input: candidate list 8 rows; poll 1 s; survival bands 75%/25%; insight refresh ≤5 s (burst-final); pick-to-view reflection ≤3 s; initial ingest ≤10 s; re-sync ≤5 s; ECR/ADP staleness warning 24 h; API budget ≤120 req/min; second-instance poll back-off; sim universe = top available by ADP extended to displayed rows; FLEX need split by the league's FLEX share, derived from its scoring curves (uniform 1/(eligible positions) only without a game-log cache — amended 2026-09-02); K/DST placement window 5 / back-weighting decay 0.5 (amended 2026-09-02); no-unfilled-starters regime = ADP-order best available; value threshold = ADP ≥10 picks earlier than current pick; within-noise thresholds (≤5 pp survival + ≤3 ECR ranks for candidates, ≤3 ECR ranks for plan totals); ≥3 mock rehearsals before the first real draft | Wrong defaults degrade the draft-day experience in small persistent ways | All configurable; review each during the first mock rehearsal | First mock |
| AS-7 | K/DST can be excluded from prediction/survival math (tracked on rosters, positional ECR/ADP only, sim picks spent without consuming skill players) without hurting decisions. **Falsifier fired 2026-08-27** (mock rehearsal, trace on record: a fully-followed draft finished with no K/DST); scope amended — prediction-math exclusion stands, FR-9's endgame guard now covers roster completion and FR-8's placement window covers sim demand timing (back-weighted toward the deadline since 2026-09-02, with the resulting per-pick K/DST chance stated on FR-6's panel) | Late-round K/DST runs surprise the user | Observe final rounds of mocks — observed; amendments above | Free (observation) |
| AS-3 | *(revised 2026-08-22 — original username-discovery-first flow superseded by user decision)* Attach = paste a draft URL/ID, confirm via the teams/owners display; username-based discovery is optional convenience and may not surface mocks (unverified) | Paste flow proves clumsy mid-draft-day, or solo-mock `draft_order` lacks the user's id more often than expected (manual slot picker covers it) | First attach attempt at the first mock | Trivial |
| AS-4 | Positional runs surfacing implicitly through falling survival percentages is enough — no explicit run alert | User misses a run the percentages technically showed | Ask after each mock: "did you notice the runs?" | Free (observation) |
| AS-1 | ✅ **Verified 2026-08-22** (live spike against an in-progress mock): mocks are ordinary draft objects; `league_id: null` identifies them; picks carry empty `picked_by`/`roster_id`, so seat attribution must key on `draft_slot` + `draft_order`. Still unverified: whether a solo mock's `draft_order` carries the human's user id (FR-1's slot picker covers the gap). Also observed: completed mocks are purged from the API (the spiked draft returns `null` post-draft) — mock data is live-only, no post-hoc replay | — (retired as a risk; kept for ID stability; the schema deltas are FR-1/FR-2 requirements) | Done (residual: one glance at `draft_order` in the first solo mock) | Done |

## 13. Open questions

| ID | Question | Blocks | Owner | Needed by |
|---|---|---|---|---|
| OQ-1 | Should there ever be a falsifiable outcome metric (e.g., availability-projection calibration scored against reality), or does success stay subjective (SC-4) with objective proxies (SC-1..3)? **Progress 2026-08-27:** the metric now exists — `npm run trace:calibrate` scores every recorded survival forecast against what the room actually did, from the flight-recorder traces, at the correct per-forecast horizon. First two bot-room drafts: "likely available" (p ≥ .75) survived only 50–80% vs ~0.90 predicted; "likely gone" well calibrated. The season-end judgment (and whether to act on bot-room data at all) stays open | Post-season assessment of whether the engine actually predicts well | willyu | End of 2026 season |
| OQ-2 | ~~ECR acquisition route: FP website vs nflverse mirror~~ **Resolved 2026-08-22 (user decision):** the FantasyPros half-PPR cheat-sheet page directly, via its embedded `ecrData` JSON — verified same day (839 players incl. K/DST, ranks + tier + spread + FP player ids, 107 experts, no auth). Fetched once pre-draft; nflverse mirror is the fallback if the page's embed changes | — (was FR-4) | willyu | done |
| OQ-3 | ~~Behavioral ADP source alignment~~ **Resolved 2026-08-28 — measured, and the premise reversed.** The Sleeper-source route died twice over: FP's redesigned ADP pages now gate the full table (5 SSR rows; the per-source data sits behind their keyed API, which Sidekick will not scrape), and Sleeper's own board ordering (`search_rank` in the player dump Sidekick already fetches) **correlates worse with actual room picks than FFC ADP does** — Spearman 0.907 vs 0.929 over 427 recorded picks from rehearsals #2–#3 (top-100: 0.888 vs 0.931). FFC stays the behavioral source. The real measured gap is **dispersion**: rooms track consensus within ~10–13 picks MAE, tighter than the 1/rank draw spreads, which is where the persistent top-bucket optimism (~0.90 predicted / ~0.70 observed across three rehearsals) lives. 🔶 `drawSharpness` (FR-8, default 1 = original draw) is the tuning lever; tune it against `trace:calibrate` at rehearsal #4 | FR-8's survival trustworthiness in real Sleeper rooms | willyu | done (tuning continues per rehearsal) |

## 14. Validation protocol

*(Formal eval tables deliberately omitted — user decision 2026-08-22: "we don't need eval." Validation is live use, judged by the user.)*

- **Method:** live Sleeper mock drafts, run end-to-end with Sidekick attached (UJ-4); ≥3 full rehearsals before the first real draft (🔶 AS-5). The user's judgment during and after each mock is the quality bar (per interview Q16 and OQ-1).
- **Hard gate:** zero board-state errors — non-converging board state as defined by SC-1's counter-metric — in a full mock before each real draft. Any occurrence blocks the real draft until fixed.
- **Standing rules:** never present a player-level opponent prediction as certain (FR-6); never present an insight from a superseded or degraded board as current (FR-3).
- **After each mock and real draft:** record the SC-3/SC-4 checklist (manual, outside the app).

## 15. Changelog

| Date | Change | Why |
|---|---|---|
| 2026-09-02 | The 09-02 league draft (10 humans) pitched Tucker Kraft "for FLEX" at picks 63–68 with Tyler Warren already started at TE, and the opponent panel called seats two picks from their K/DST deadline "drafting best available". **FLEX share (Terms, FR-5/6/7/8/10):** the need vector's uniform 1/(eligible) split is replaced by a per-league share derived at attach from the scoring curves — every league-wide FLEX seat allocated to the eligible position whose next player is worth most, the allocation the bench phase already used — RB 40 / WR 60 / TE 0 for the user's room (FFC market: RB 36 / WR 64 / TE 0), overridable by `flexShareOverride`, stated on the pre-draft check and in the trace. A position at share 0 takes no FLEX need, absorbs no FLEX slot with its surplus, banks no starter points past its dedicated slots in FR-10's plan cap, fills no need in FR-7's adherence, and is not "FLEX-eligible" to the AC-58 ladder, whose rungs were reordered (depth-while-safe → urgent open slot → flexes → tier risk → consensus) so an urgent TE hole is not outranked by a spare RB. **K/DST timing (FR-8 AC-47, FR-6 AC-36):** placement inside the window is back-weighted by `kdstEarlyPickDecay` (default 0.5, window 5): across this draft and two completed bot mocks, 74% of K/DST picks came in the last two rounds and the middle rounds went to skill depth, where uniform placement had a third of every team's last six picks going to K/DST (SSE 0.036 vs 0.46); the same rule is read as an expectation per pick on the opponent panel (a K/DST chip, skill chips scaled by the rest), in the chat adviser's context and in every recompute's trace record | User directive on the 09-02 league draft: TE does not flex in practice — RB/WR carry the upside a FLEX seat is for — and rooms fill K/DST in the last rounds, building depth before them; calibration from the recorded rooms |
| 2026-08-22 | Initial draft from interview (Q1–Q18) | — |
| 2026-08-22 | Review-pass fixes: FR-11 columns restored to Q12's list; ~140 corrected to ~150 (15 rounds, sourced); FR-10 AC-1 plan scoring defined; SC-1 counter-metric made convergence-based (unblocks SC-4); within-noise defined (FR-9/FR-10/E-3); AS-8 added (QB skew in derived overall ECR) | 6 confirmed findings from the 13-agent review (3 finders + adversarial verification) |
| 2026-08-22 | OQ-2 resolved: ECR route = FantasyPros half-PPR cheat-sheet page's embedded `ecrData` JSON (user-designated URL; live-verified: 839 players incl. K/DST, tiers, spreads, FP ids, 107 experts, no auth); FR-4 AC and dependencies updated; K/DST separate-fetch AC simplified to an absence warning | User provided the source URL; page verified by direct fetch + parse |
| 2026-08-22 | Round-2 review applied with user modifications: Terms block; need vector defined (FLEX split, no-need→ADP-order regime); FR-9/FR-10 composed into one highlighting algorithm; snapshot matching via player-dump ID crosswalk with unmatched entries excluded (no resolve UI — user decision); attach reworked to paste-primary with teams/owners confirmation (AS-3 revised); ADP made a first-class FR-4 snapshot incl. K/DST separate fetch; metrics slimmed (SC-1 contradiction removed, SC-2 burst-anchored, recomputing state added); §14 evals replaced by a validation protocol (user decision); assumptions re-ranked AS-2 → AS-6 → AS-8; tag index completed | 3-reviewer pass (2 Sonnet + 1 Opus) + Opus plan verifier; user approved per-group with modifications |
| 2026-08-27 | AS-7 scope amended after its falsifier fired in mock rehearsal #2 (flight-recorder trace on record; a fully-followed draft finished 6 QB / 0 K / 0 DST): FR-9 gains the endgame K/DST guard (`endgameKdstBufferPicks`, default 1) and FR-8's K/DST rule gains a probabilistic early-placement window (`kdstEarlyPickWindow`, default 4) matching observed room behavior — K/DST stay excluded from all prediction math. OQ-1 progressed: `trace:calibrate` scores recorded survival forecasts against draft reality per rehearsal | Trace-driven findings from the 08-27 mock rehearsals; user approved fixes for all three findings |
| 2026-08-27 | The bench phase added to FR-9/FR-10 (`benchPositionHeadroom`, default 1): with starters full, plans and the highlight draw from bench-eligible positions (FLEX-eligible always; others capped at slots + headroom), with a roster-balance redirect reason — closing the root cause of the rehearsal's QB3–QB6 recommendations. Terms' no-need regime amended for the user's recommendation surface only. OQ-3 opened with verified feasibility of a Sleeper-aligned ADP source (FP page embed, `src_4350`) for FR-8's remaining calibration gap | Root-cause pass on the rehearsal's drafting mistakes (user directive); trace + calibration evidence |
| 2026-09-01 | Rehearsal #9 (a second QB and a second TE recommended late while two RB and three WR starting slots went uninsured) plus a user directive on explainability. **Bench pricing:** once the starters are full and plan totals flatten, the bench phase ranked positions by raw depth (`rostered − starting slots`), which in a 1-QB/1-TE league made QB and TE the neediest holes forever — depth counts bodies without asking what a body is worth. `benchPositionScarcity` replaces it with two position-dependent facts: `startShare` (the lineup slots the position fills for this team, dedicated plus earned FLEX demand — a two- or three-slot position carries several times the injury and bye exposure of a single-slot one) and `waiverRank` (the first player at the position the league does **not** roster, read off ADP inside `teamCount × rounds` — a 10/12-team room drafts only ~1–2 QBs and TEs per team, so the best free agent there is close to the player you would bench, while RB/WR go deep enough that the wire is a real cliff). A bench pick is worth `startShare × (value − value at waiverRank)`, which is 0 for a QB2 no better than the wire; depth survives only as a tiebreak and as the whole rule when no value model exists. **Explainability:** FR-9 gains a per-player explanation map, surfaced as a hover/focus card on every candidate row (see the new AC) | Trace-driven root-cause pass on the 09-01 rehearsal; user directive on positional bench value and on explaining each row |
| 2026-09-01 | Rehearsal #8 root-cause pass (pick 53: a fourth WR taken over Tyler Warren, the last member of TE positional Tier 1, with the TE slot empty; he went the next pick). Three fixes: (a) **FR-10 allocates a plan's two picks jointly** against one shared FLEX pool — `starterCapacity` had asked "dedicated + openFlex >= 1?" per position independently, so two *different* slotless positions both banked the single open FLEX seat, a phantom ~10 pts/gm that scored WR-now/RB-next at 47.5 above every TE plan (the same-position case was already guarded at >= 2; this generalises the guard into an allocator); (b) **rank shading is clamped to the player's own tier** (FR-10's value model), since averaging across a tier boundary priced a tier's last man as partly the tier below and erased a third of the cliff the engine exists to notice (Warren 9.45 → 9.90); (c) **the AC-58 band tiebreak gains tier-break risk** above consensus. Replayed on that board: WR-now/RB-next falls 47.5 → 37.6 (its next term 9.8 → 0) and the recommendation becomes Tyler Warren | Trace-driven root-cause pass on the 09-01 rehearsal; user directive to weigh tier dropoffs and roster needs |
| 2026-09-01 | Positional tiers replace overall-board tiers as the engine's tier source (user directive: "only care about positional"): FR-4 fetches the four skill-position cheat sheets at attach and joins tiers by FantasyPros id, with per-position degradation and a pre-draft warning; FR-9's row tier and FR-10's urgency facts now read positional groupings (2026 TE Tier 1 = Bowers/McBride/Loveland/Warren, split 2/3/3/4 on the overall board). The `/positional-tiers` skill (`npm run tiers:positional`) reports the same six pages, K/DST included for human prep only; the earlier overall-tier report section was removed | User directive; positional cheat-sheet pages verified to carry positional tiers |
| 2026-08-31 | Rehearsal #4/#5 root-cause pass (the pick-1 Josh Allen and pick-6 Bowers/no-RB failures; user directive "you're over-indexing on filling positions… factor in position tiers and their dropoff"): FR-10's plan scoring re-based from ECR-rank sums to **shaded projected points** (league-scored historical curves from the FR-11 cache, priced at each player's own shaded rank; FantasyPros tiers — ingested since v1 — now drive hold-probability/dropoff urgency facts and the separating fact), with FLEX priced symmetrically in every plan's fill term and plan picks capped at startable capacity; the near-tie fallback restated as better-consensus (`planTotalTooClosePoints` 0.75 replaces `planTotalTooCloseEcrRanks`); FR-8's position draw re-anchored on the market via 🔶 `opponentNeedBlend` (default 0.45) with 🔶 `drawSharpness` fitted to 1.5 — joint MLE on observed rehearsal opponent picks (need-only model log-likelihood −1319 vs −750 blended; ADP-1 five-pick survival 26% → 4%, against trace:calibrate's measured 0.91-predicted/0.69-observed optimism); FR-1's username convenience list removed by user directive. Follow-up the same day (rehearsal #6, round-6-with-one-WR): the fill term horizon-priced — each deferred slot assigned to the user's actual later turn and priced by ADP-depletion market replay — and FR-9's survival column header now names the pick it projects to ("Lasts to #36") after the number read as this-pick availability. Rehearsal #7 (Maye at 46; Lawrence/Purdy QB2 pitches): the AC-58 band tiebreak gains FLEX-eligibility above the dedicated-slot preference, and the bench phase gains the flex-first gate on non-FLEX backups | Trace-driven root-cause passes on the 08-31 mock rehearsals; drafting-pattern fits on recorded opponent picks; user directives |
| 2026-08-28 | Rehearsal #3 root-cause pass: AC-55 gains the fill-cost term (unfilled dedicated starting slots priced at expected j-th-best survivors — kills the twice-observed WR→WR-over-open-RB-slots failure); the bench phase gains the thinnest-position rule (roster picks the position, ECR picks the player — kills the 8-WR/2-RB redirect of the same greed); `endgameKdstBufferPicks` default 1 → 0 (the buffer cost a compliant user a bench RB); OQ-3 resolved by measurement — Sleeper `search_rank` tested *worse* than FFC ADP against 427 recorded room picks (Spearman 0.907 vs 0.929), FFC retained, and 🔶 `drawSharpness` added as FR-8's dispersion-tuning lever for the persistent ~0.90-predicted/~0.70-observed top-bucket optimism | User directive to fix the identified root causes; head-to-head source measurement on rehearsals #2–#3 traces |
