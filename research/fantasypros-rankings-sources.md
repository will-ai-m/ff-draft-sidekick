# FantasyPros Rankings: How They're Built and Where They Come From

*Compiled August 20, 2026 from Haiku subagent web research (fetched FantasyPros pages + support docs + 2026 articles). Claims are cited inline; a "Not publicly documented" section at the end lists what could not be verified. Player/team specifics reflect 2026-season articles as fetched — spot-check before acting on any individual player claim.*

Companion doc: [fantasypros-rankings-differences.md](fantasypros-rankings-differences.md) — where the rankings disagree.

---

## 1. What ECR is and how it's computed

**Expert Consensus Rankings (ECR)** aggregate **153 experts** for the 2026 draft season (count shown on [fantasypros.com/nfl/rankings/](https://www.fantasypros.com/nfl/rankings/) as of Aug 21, 2026).

- **Rank Points, not average rank.** Each player earns points based on position in each expert's list; points are summed across experts and players ordered by total. FantasyPros explicitly rejects simple rank-averaging because it forces arbitrary ranks onto players an expert left unranked ([support article](https://support.fantasypros.com/hc/en-us/articles/115001219327-What-is-ECR-Expert-Consensus-Rankings-and-how-do-you-calculate-it)).
- **Accuracy weighting.** Per the [accuracy methodology FAQ](https://www.fantasypros.com/about/faq/football-draft-accuracy-methodology/), expert contributions are weighted by historical accuracy, current-season accuracy, and **submission recency** — a stale list counts for less. Exact multipliers are not published.
- **In-season filter schedule:** the first ~2 weeks of updates mix recent contributors with prior-season proven performers; from week 3 on, accuracy is the primary inclusion filter (support article).
- **Disagreement is surfaced:** each player carries min/max/std-dev across experts on the ranking pages. Std-dev ~2 = near-universal agreement; ~11+ = "a coin flip wrapped in a consensus label."
- **Update cadence:** FantasyPros re-aggregates daily (same-day when experts revise), but individual experts update on their own schedules — some daily, some a handful of times per draft season. Per-expert publish/revision dates are displayed.

### Overall rank is derived, not submitted

Experts submit **positional** lists (roughly top-25 QB / 50 RB / 60 WR / 20 TE; K/DST optional). Overall ECR is computed by a **Rank Converter**: positional ranks → 5-year historical points-production curves per rank slot + current consensus projections → cross-position overall order ([methodology FAQ](https://www.fantasypros.com/about/faq/football-draft-accuracy-methodology/)). K and DST are excluded from overall (incomplete submissions, widest variance).

## 2. Who the experts are

~14 in-house FantasyPros staff plus outlet-affiliated and independent analysts. Outlets identified in the expert pool:

- **Major media:** Yahoo (Scott Pianowski, Justin Boone, Hayden Winks, Matt Harmon, Josh Norris…), ESPN, CBS Sports, NFL.com, Fox, NBC Sports, PFF, Sports Illustrated, The Athletic, The Washington Post, USA Today.
- **Fantasy-specialist sites:** Establish the Run (Pat Thorman), 4for4, Footballguys, RotoBaller, Razzball, PlayerProfiler, Fantrax, Dynasty League Football, Dynasty Nerds, numberFire, RotoGrinders, FantasySix Pack, SportsLine, BettingPros, and dozens more independents.
- Full directory: [fantasypros.com/experts/nfl/](https://www.fantasypros.com/experts/nfl/) (site truncates; complete roster not enumerable from public pages).

**Inclusion bar:** a "proven track record of published content" ([experts careers page](https://www.fantasypros.com/about/careers/fantasy-football-experts/)), then continuous evaluation — 225+ experts were scored in the most recent draft-accuracy study.

## 3. The accuracy competition (what powers the weighting)

- **Draft accuracy:** each expert's ranks are converted to projected points via historical production of rank slots, compared to actual season output ("accuracy gap"); position multipliers (1.0→0.5) emphasize draft-relevant players; overall score uses QB/RB/WR/TE only ([FAQ](https://www.fantasypros.com/about/faq/football-draft-accuracy-methodology/)).
- **In-season accuracy:** weekly rankings scored vs actuals; each expert's worst week is dropped ([FAQ](https://www.fantasypros.com/about/faq/football-inseason-accuracy-methodology/)).
- **2025 winners (published Jan 2026):** 1. Justin Boone (Yahoo, 2nd career win) 2. Pat Thorman (ETR, 4th straight top-4) 3. Jamie Calandro (RotoBaller). Multi-year strong: Jody Smith, Jeff Ratcliffe.
- Users can rebuild consensus from any expert subset via Draft Wizard ("Pick Experts", accuracy filter, recently-updated filter) — from 2 experts up to all 153.

## 4. The full catalog of ranking products

| Product | Expert pool | Formats | Notes |
|---|---|---|---|
| Redraft draft ECR | 153 | STD / Half / PPR, each ×(1QB, Superflex) | The flagship; cheat sheets derive directly from it |
| Dynasty overall / rookie / Devy | "100+" (subset unclear) | Half-PPR default, superflex variants | Rookie list covers pre-NFL players only |
| Best ball | undisclosed | Best-ball scoring | Separate ADP composite (see below) |
| IDP draft + IDP dynasty | "100+", smaller in practice | STD/PPR | Fewer experts rank defense |
| ROS (in-season) | 100+ | STD / Half / PPR, per position | Remaining-season value, not draft value |
| Auction values | derived, not submitted | configurable | VORP over ECR-derived projections, adjusted for league size/budget ([support](https://support.fantasypros.com/hc/en-us/articles/360053100033)) |
| Tiers | derived | per position | Breakpoints where consensus gaps widen |

### ADP: a different animal

ADP is **market data, not expert opinion**. FantasyPros composites:

- **Redraft ADP (6 platforms):** ESPN (PPR), Yahoo (half-PPR), CBS, RTSports, Fantrax, Sleeper ([adp/overall.php](https://www.fantasypros.com/nfl/adp/overall.php), updated Aug 19, 2026). Because each platform's user base drafts under different default scoring, the same player carries different ADPs per source.
- **Best-ball ADP (5 platforms):** Underdog, BB10s, Drafters, RTSports, DraftKings ([best-ball ADP](https://www.fantasypros.com/nfl/adp/best-ball-overall.php)).
- **NFFC** (high-stakes) tracked separately — sharp-market behavior diverges from casual ADP (e.g., mid-tier TEs go 19–23 picks later in NFFC than composite ADP).

**ECR = what experts think is right; ADP = where the public actually drafts.** The gap between them is the standard value/reach signal — and both are inputs to the willy-ff super-consensus and the Draft Sidekick behavioral model (platform ADP is the room's prior; expert lists are the candidate "lists a manager might be drafting from").

## 5. Not publicly documented (verify before depending on)

1. Exact Rank Points values per rank slot.
2. Exact accuracy-weighting multipliers (only that weighting exists).
3. Tie-handling in the consensus computation.
4. Whether specialty formats (dynasty/best-ball/IDP) draw from the same 153-expert pool or smaller subsets, and per-position submission rates.
5. When expert submissions "lock" for each daily re-aggregation.

## 6. Relevance to willy-ff

- Our pipeline route to ECR is the **nflverse mirror** (`load_ff_rankings()`), not the FantasyPros API (free tier is sample-data only) — see [data-sources.md](data-sources.md).
- The per-player **std-dev / min / max** columns are the cheapest disagreement signal available and should be retained in the super-consensus store (feeds Draft Sidekick's availability-uncertainty widening, [PRD v3 §3.5](../prd/draft-sidekick-prd-v3-working.md)).
- The accuracy competition's own finding — consensus is robust but individual experts (Boone, Thorman) repeatedly beat it — is the argument for our accuracy-weighted super-consensus rather than a plain mirror of ECR.
