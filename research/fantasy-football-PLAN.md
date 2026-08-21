# Fantasy Football Analytics Site — Build Plan

**Goal:** A personal website that ranks NFL players for half-PPR fantasy, covering both **season-long draft rankings** and **weekly in-season rankings**, driven by the full picture — opportunity, Vegas markets, coaching tendencies, weather, environment, injuries, and news — with every ranking explainable ("why is this player here?").

**Eval:** Weekly rankings are benchmarked against FantasyPros weekly Expert Consensus Rankings (ECR), scored against actual half-PPR results. Backtesting against historical ECR archives starts on day one — no need to wait for a live season.

Supporting research: [research/data-sources.md](research/data-sources.md), [research/factors.md](research/factors.md).

---

## 1. Guiding decisions (from the research)

1. **One data ecosystem covers ~80% of needs.** nflverse (via `nflreadpy`, Python/Polars) provides play-by-play with EPA/xpass/air yards (1999–), schedules bundled with closing Vegas lines + game weather + roof/surface (2006–), injuries (2009–), depth charts (2001–), snap counts (2012–), FTN route/scheme charting (2022–), rosters, and — critically — **a free mirror of FantasyPros ECR with a historical archive** (`load_ff_rankings`). Do not use the deprecated `nfl_data_py`.
2. **Volume over efficiency.** The single strongest research finding: opportunity metrics (target share, WOPR, air-yards share) persist at r ≈ 0.5–0.7 year-over-year while efficiency/TD-rate metrics sit at r ≈ 0.0–0.3. The projection engine ranks on opportunity and *regresses* efficiency; it never extrapolates hot efficiency.
3. **Model the components, not just the points.** Project usage (targets, carries, snaps) and environment (team plays, implied points) separately, then convert to fantasy points. This makes rankings explainable and makes news adjustments principled (an injury changes the *share inputs*, and points re-derive).
4. **Evidence-weighted factors.** Tier 1 factors go in the baseline; Tier 2 as measured add-ons (each must improve backtest score to stay); Tier 3 as flags/uncertainty; debunked factors deliberately excluded (revenge games, contract year, simple SOS, preseason box scores, trap/letdown, generalized injury-proneness).
5. **The eval harness comes before the fancy model.** A baseline + scorer that replays 2021–2025 weeks against archived ECR gives every subsequent feature a measurable verdict.

## 2. Architecture

```
┌─ Ingestion (nightly + event-driven) ──────────────────────────┐
│ nflreadpy loaders · Sleeper API · Open-Meteo · ESPN unofficial │
│ (news/odds/injuries) · FFC ADP · hand-curated coach table      │
└──────────────┬─────────────────────────────────────────────────┘
               ▼
┌─ Warehouse: DuckDB + Parquet (local, versioned snapshots) ────┐
│ raw/          — as-loaded tables                               │
│ features/     — factor features per player-week & team-week    │
│ projections/  — frozen pre-kickoff outputs (immutable)         │
│ eval/         — ECR snapshots, actuals, metric history         │
└──────────────┬─────────────────────────────────────────────────┘
               ▼
┌─ Engine (Python) ─────────────────────────────────────────────┐
│ feature builders → usage models → points conversion →          │
│ ranking + tiers + explanation payloads                         │
└──────────────┬─────────────────────────────────────────────────┘
               ▼
┌─ Web app ─────────────────────────────────────────────────────┐
│ FastAPI (read-only JSON over DuckDB) + React/Vite frontend     │
│ Weekly Rankings · Draft Board · Player Pages · Eval Dashboard  │
└────────────────────────────────────────────────────────────────┘
```

- **Stack:** Python 3.12, Polars, DuckDB, LightGBM, FastAPI, React/Vite. Runs locally or on any small box; nightly refresh via cron/launchd (or GitHub Actions writing Parquet artifacts).
- **Snapshot discipline:** projections and ECR are frozen at a fixed pre-kickoff time each week and never mutated — this is what makes the eval honest and backtests reproducible.
- **Fragile-source isolation:** unofficial ESPN endpoints (news/odds/injuries) live behind adapters with cached fallbacks, since they can break without notice.

## 3. Data plan (all free)

| Data | Primary source | Cadence |
|---|---|---|
| Play-by-play, EPA, xpass, air yards | `nflreadpy` PBP | nightly in season |
| Schedules + closing spread/total + weather + roof/surface | `load_schedules()` | weekly |
| Injuries (official designations) | `load_injuries()` (+ ESPN unofficial for intra-week) | daily in season |
| Depth charts / snap counts / route & scheme charting | `load_depth_charts()`, `load_snap_counts()`, `load_ftn_charting()` | weekly |
| FantasyPros ECR (eval baseline, draft + weekly + archive) | `load_ff_rankings()` | weekly snapshot |
| ADP | Fantasy Football Calculator API | daily in draft season |
| Player metadata + trending adds/drops | Sleeper API | daily |
| Weather forecast at stadium | Open-Meteo (10k calls/day, keyless) hourly forecast at kickoff hour | daily game week |
| Current-week odds | ESPN unofficial endpoint (backup: The Odds API, 500 credits/mo) | daily game week |
| News headlines | ESPN unofficial news endpoint + Sleeper trending as alert signal | hourly in season |
| Coach / OC / play-caller table | hand-maintained YAML (seeded from annual "32 playcallers" reporting) | yearly + on firings |
| Stadium lat/long/altitude | hand-built 32-row static table | yearly |

Notes: Reddit scraping is dead (May 2026); FantasyPros' own API free tier is sample-data-only — the nflverse mirror is the right ECR route; personal-use context keeps licensing simple.

## 4. Ranking engine

### 4.1 Weekly rankings (built first — it's what the eval measures)

**Baseline (Milestone 2):** trailing-usage expected fantasy points.
- Player usage priors: EWMA of target share, carry share, snap/route share (recency-weighted, small shrinkage to position priors).
- Team volume: plays/game from neutral-script pace; team pass/run split from PROE.
- Team scoring environment: Vegas implied team total.
- Convert: shares × team volume × league-average efficiency by depth/position (xFP-style), score as half-PPR. Rank within position.

**Factor layers (Milestone 3, each gated by backtest improvement):**
- Game script: spread → expected pass-rate shift (50/56/66 leading/tied/trailing) → RB receiving vs rushing mix.
- Weather: wind ≥15/≥20 mph passing & kicking penalties; dome bonus; dome-team-in-cold-road penalty; rain/snow minor run-tilt.
- Injury layer: designation → play probability (Q ≈ 71%, D ≈ 6%) → probability-weighted projection; play-through penalties by injury type/position; teammate-out target/carry redistribution using historical vacated-share patterns.
- Matchup: opponent pass/rush EPA splits, heavily shrunk toward mean (research: positional points-allowed is mostly noise — small weights only).
- Regression flags: xTD vs actual TD gap, red-zone conversion extremes → efficiency term pulled to mean.
- Environment deltas: OL composite (ALY-style) for RB rushing; QB-change re-rate trigger for pass catchers.

**Later (Milestone 5):** LightGBM per position predicting half-PPR points (with quantile models for floor/ceiling), trained on 2016–2024, using the same feature set. Keep the component model as the explainability backbone; ensemble if the ML model wins the backtest.

### 4.2 Draft rankings (Milestone 4)

- Season = sum of simulated weeks: schedule × team environment (Vegas win totals as team-quality prior — QB 18.4 vs 14.2 ppg tiers) × player role projection.
- Role projection from: prior-year opportunity (regressed), depth chart, ADP as market prior, draft capital (rookies/years 1–3), age-curve multipliers (RB cliff post-28, WR post-31, dual-threat QB rushing post-29), injury-type recurrence discounts (ACL/hamstring), coordinator-change uncertainty widening.
- Monte-Carlo season sim (injuries, variance) → points distribution per player → **VOR (value over replacement) rankings + tiers**, plus ADP-delta "value" board.
- Garbage-time audit on prior-year stats before they feed projections.

### 4.3 News-driven adjustments (Milestone 6)

Event pipeline: poll injuries/depth charts/ESPN news/Sleeper trending → detect events (designation change, depth-chart move, trade, OC firing, holdout) → map to input deltas (play probability, share redistribution, uncertainty widening) → recompute affected players → changelog entry ("Chase OUT → Higgins target share 21%→27%, rank WR24→WR11"). In-season, draft-board values update too (rest-of-season mode).

## 5. Eval harness (the spine of the project)

**Ground truth:** actual half-PPR points per player-week (from PBP stats).

**Metrics, computed per position-week for us vs ECR:**
1. **Pairwise accuracy** — of all player pairs we ranked, how often did the higher-ranked player outscore? (This is essentially FantasyPros' own accuracy framing.)
2. **Spearman rank correlation** vs actual points.
3. **Top-N precision** — starts that matter: top-12 QB/TE, top-24 RB/WR, top-36 flex hit rates.
4. **Projection RMSE/MAE** (ours only — ECR has no point values; compare against FantasyPros projections separately if desired).

**Protocol:**
- **Backtest:** replay 2021–2025 week by week using only data available before each kickoff; score baseline vs archived ECR (`load_ff_rankings(type="all")`). This immediately answers "how far behind the experts are we?" and every feature must move these numbers to be merged.
- **Live:** freeze both rankings Sunday ~11am ET (and Thursday pre-TNF for those players), score Tuesday, append to the eval dashboard.
- **Draft eval:** preseason rankings vs end-of-season points-per-game and total-value, compared against FantasyPros preseason draft ECR and ADP.
- **Honest accounting:** injury-ruled-out players excluded consistently from both sides; same player universe for both rankers.

**Success bar:** match ECR pairwise accuracy in year one; beat it in the situations our factors target (weather games, injury-redistribution weeks, extreme Vegas totals) — measure those slices separately, since that's where a factor model should have an edge over consensus.

## 6. Website (personal tool, explainability-first)

- **Weekly Rankings** — position tabs, our rank vs ECR side-by-side, delta highlighting; each row expands into a **factor breakdown** (base opportunity, Vegas, weather, matchup, injury adjustments, regression flags — with the numbers).
- **Draft Board** — VOR tiers, ADP vs our value (reach/value flags), risk badges (age cliff, ACL history, new OC, holdout).
- **Player Page** — usage trends (target share, WOPR, snaps), factor history, news-adjustment changelog.
- **Eval Dashboard** — us vs ECR by week/position/metric, cumulative; slice views (weather games, post-injury weeks).
- **This Week's Edges** — where we most disagree with consensus and why (the actionable start/sit page).

## 7. Milestones

1. **Foundations** — repo, ETL for all nflverse tables into DuckDB, static tables (stadiums, coaches), data-quality checks.
2. **Baseline + eval harness** — trailing-usage xFP baseline; 2021–2025 backtest vs archived ECR; first accuracy report. *Everything after this is measured.*
3. **Factor layers** — Vegas, game script, weather, injuries, matchup, regression flags; per-factor ablation results.
4. **Draft engine** — season sim, VOR board, ADP integration (target: ready before draft season).
5. **ML pass** — LightGBM point + quantile models; ensemble vs component model.
6. **News pipeline** — event detection, share redistribution, changelog; intra-week re-ranks.
7. **Website** — FastAPI + React app over the warehouse; the five pages above.
8. **Live season ops** — weekly freeze/score loop, dashboard, iterate on the losing slices.

## 8. Risks & mitigations

- **Unofficial ESPN endpoints break** → adapters + cached fallback; core rankings degrade gracefully (nflverse alone sustains them).
- **nflreadpy is self-described experimental** → pin versions; sanity-check row counts vs nflreadr release notes.
- **DynastyProcess ECR mirror cadence/format changes** → snapshot weekly; `ffpros`-style direct scrape as backup.
- **Coach/play-caller table is manual** → small YAML, yearly refresh + in-season edits on firings; the changelog makes staleness visible.
- **Overfitting the backtest** → ablations use 2021–2024 for tuning, 2025 held out; live season is the real test.
- **Consensus is hard to beat overall** → expected; the edge thesis is *slices* (weather, injury weeks, Vegas extremes), which the eval measures explicitly.
