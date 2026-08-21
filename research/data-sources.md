# Free Data Sources for Fantasy Football Analytics — Research Report (verified July 2026)

Methodology note: every entry below was checked against a live fetch of the vendor's docs/GitHub page or a current web search in July 2026, not from training-data memory. Flags mark anything that changed in 2025–2026.

---

## 1. Core NFL Play-by-Play & Player Stats

| Source | URL | Access | Covers | Update freq | History | Cost/Auth/Limits | Gotchas |
|---|---|---|---|---|---|---|---|
| **nflverse-data / nflreadr** (R) | github.com/nflverse/nflverse-data, nflreadr.nflverse.com | R package, or direct CSV/Parquet from GitHub Releases | PBP, rosters, schedules (+ betting lines, weather, roof/surface), snap counts, injuries, depth charts, FTN charting, draft picks/values, coach names | Nightly during season | 1999–present (PBP), varies by table | Free, no auth, GitHub-rate-limited only | The canonical, most maintained nflverse entry point |
| **nflreadpy** (Python) | nflreadpy.nflverse.com, github.com/nflverse/nflreadpy | `pip install nflreadpy` | Same data as nflreadr, ported to Python, returns Polars DataFrames | Same as nflverse-data | Same | Free | **Official successor to nfl_data_py.** Docs self-disclose "experimental" — sanity-check outputs |
| **nfl_data_py** (Python) | github.com/nflverse/nfl_data_py | pip | Legacy Python wrapper | **Frozen** | Last release 0.3.3, Sep 2024 | Free | **DEPRECATED** in favor of nflreadpy. Do not build on this. |
| **nflfastR** (R) | nflfastr.com | R package | Underlying PBP scraper/EPA-WP model | Nightly | 1999– | Free | Reads from new `nflverse/nflverse-pbp` repo; old `nflfastR-raw` repo deprecated, won't get 2026+ seasons |
| **nfldata (Lee Sharpe)** | github.com/nflverse/nfldata | CSV, feeds `load_schedules()` | Games/schedules with betting lines (spread, total, odds), weather (temp, wind), roof/surface, refs, coaches, standings, draft/trade history | Weekly | 2000/2006–present | Free | One call gets closing lines + game-day weather + roof/surface for every historical game |

**Verdict:** nflverse (nflreadpy for Python) is the backbone. nfl_data_py is dead.

---

## 2. Fantasy Platform APIs / ADP

| Source | Access | Covers | Cost/Auth/Limits | Gotchas |
|---|---|---|---|---|
| **Sleeper API** (docs.sleeper.com) | Public REST, JSON | Leagues, rosters, drafts, matchups, transactions, players metadata, **trending adds/drops** (`/v1/players/nfl/trending/add`) | Free, no auth, ~90 req/min/IP (unofficial) | Player dump endpoint ~5MB — cache it |
| **Fantasy Football Calculator ADP API** | REST, e.g. `/api/v1/adp/standard?teams=12&year=2026` | Mock-draft ADP by format/team count/year | Free for personal AND commercial use, attribution asked | No key needed |
| **ESPN Fantasy API (unofficial)** (`lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/...`; python `espn-api` pkg, active Mar 2026) | Undocumented REST | Rosters, matchups, ESPN rankings/projections | Free; private leagues need `swid` + `espn_s2` cookies | Unofficial, can break anytime |
| **Yahoo Fantasy API** | REST via OAuth 2.0 | Yahoo league data | Free, requires app registration + OAuth flow | Friction; only if league is on Yahoo |
| **FantasyCalc** | REST, no key | Dynasty/redraft trade values, ADP | Free | Dynasty supplement |

**Verdict:** Sleeper default; FFC for ADP.

---

## 3. Projections & Expert Rankings (Eval Baseline — FantasyPros ECR)

| Source | Access | Covers | Cost/Limits | Gotchas |
|---|---|---|---|---|
| **`nflreadr::load_ff_rankings()`** ⭐ | R (or CSV pull) | **FantasyPros ECR** via DynastyProcess-maintained mirror; `type="draft"`, `"week"`, `"all"` (historical archive) | Free, no key, no scraping | **Best route to weekly ECR eval baseline.** Weekly refresh in season. |
| **`ffpros` R package** (ffverse) | R, `fp_rankings()` | Direct FantasyPros scrape with rate-limiting/caching | Free | Live-of-the-moment alternative |
| **FantasyPros official API** (fantasypros.com/api-data) | REST, x-api-key | ECR/ADP (130+ experts), projections, news | Free tier = "sample data", prototyping only; $5.99/mo for production personal use | Free tier's sample-data scope is the catch |
| **ffanalytics R package** | R `scrape_data()` | Aggregates free projections: CBS, ESPN, FantasySharks, FFToday, NFL.com, etc. | Free | Good for building own consensus |
| **FFToday** | HTML scrape | Rankings, projections, ADP | Free | Alive as of July 2026 |
| **NumberFire** | — | — | — | Absorbed into NBC Sports Edge; not a distinct source anymore |

---

## 4. Vegas Odds & Lines

| Source | Access | Covers | Cost/Limits | Gotchas |
|---|---|---|---|---|
| **nflverse `load_schedules()`** ⭐ | R/Python | Closing spread, total, moneyline (PFR-sourced) | Free | **2006–present. Best free historical closing lines.** |
| **The Odds API** | REST, key | Live spreads/totals/props, many books | Free tier: **500 credits/mo**; cost = markets × regions per call (~83 live calls/mo at 3×2); historical = 10× | No overage — hard stop at 0 |
| **ESPN odds endpoints (unofficial)** (`sports.core.api.espn.com/v2/.../odds`) | Undocumented REST | Current lines per game, ATS records | Free, no key | Fragile |
| **Australia Sports Betting** (aussportsbetting.com) | Free spreadsheet | Historical results + odds | Free, **personal-use-only license** | 2025 data patchy (bookmaker switch) |
| scoresandodds / covers / Action Network | — | — | No free programmatic access | Skip |

**Verdict:** nflverse for historical; ESPN unofficial primary + Odds API free tier backup for live.

---

## 5. Weather

| Source | Access | Covers | Cost/Limits | Gotchas |
|---|---|---|---|---|
| **Open-Meteo** ⭐ | REST, no key | Hourly forecast 16 days out + historical (ERA5 from 1940) | Free non-commercial, **10,000 calls/day** | >10 variables or >2wk single-location counts as multiple calls |
| **api.weather.gov (NWS)** | REST, no key | Official US forecasts, gridpoint hourly | Free, informal limits | Forecast-only, no deep history |
| **Visual Crossing** | REST, key | Forecast + historical | Free: 1,000 records/day, commercial OK | Backup/cross-check |
| **Meteostat** | `pip install meteostat` | Station-based historical observations | Free, CC-BY 4.0 | Ground-truth station obs for past game days |

**Verdict:** Open-Meteo primary; nflverse temp/wind columns already cover historical games.

---

## 6. Injuries & Practice Reports

- **`nflreadr::load_injuries()`** ⭐ — official weekly injury designations (practice + game status), **2009–present**, free.
- **ESPN injuries endpoint (unofficial)** — `sports.core.api.espn.com/v2/sports/football/leagues/nfl/teams/{team_id}/injuries` — near-real-time, current only.
- NFL.com injury report — HTML only; redundant with load_injuries().

---

## 7. News / Transactions (Real-Time)

- **Sleeper trending** (`/v1/players/nfl/trending/add`, `/drop`) — free numeric add/drop signal; call ~once/day.
- **ESPN news endpoint (unofficial)** — `site.api.espn.com/apis/site/v2/sports/football/nfl/news?limit=50` (optionally `&team={id}`) — best free structured news feed; fragile.
- **Rotoworld/NBC Sports Edge** — live in 2026 but no confirmed working public RSS; verify manually; scrape fallback.
- **Reddit** — ⚠️ unauthenticated `.json` access killed **May 28, 2026**; OAuth free tier gated, new registrations require manual approval (2–4 wk, reportedly not approving new accounts). Effectively closed to new projects.
- **X/Twitter** — no free tier. Bluesky firehose free but beat-writer coverage inconsistent.

---

## 8. Depth Charts, Snap Counts, Targets/Routes

- **`load_depth_charts()`** — weekly, back to 2001, ESPN-sourced now. Free.
- **`load_snap_counts()`** — game-level, 2012–present, PFR-sourced. Free.
- **`load_ftn_charting()`** ⭐ — route participation, target quality, coverage-scheme charting; within 48h of each game; **2022–present free subset**, CC-BY-SA 4.0 (attribute FTN).
- OurLads — scrape only, largely unnecessary.

---

## 9. Coaching/Staff, Scheme, Pace, PROE

- **rbsdm.com** — view-only Shiny app, no API. Compute PROE from nflverse PBP instead (recent nflfastR PBP includes pass-probability/PROE-adjacent fields directly).
- **FTN free subset via nflverse** — man/zone, blitz, play-action, screen charting, 2022+.
- **Coach/coordinator/play-caller history** — **no structured free dataset exists.** Hand-maintain a small per-season lookup table (seed from ESPN's annual "32 playcallers" article). `load_schedules()` has head-coach-per-game.
- SumerSports — view-only.

---

## 10. Stadium / Venue Metadata

- nflverse `load_schedules()` per-game `roof` (outdoors/dome/closed/open) + `surface` fields.
- Hand-built 32-row lat/long/altitude table from Wikipedia, refreshed yearly.

---

## 11. Advanced Stats Free Tiers

- **PFR** — scraping: ≤10 req/min or IP "jail" (24h); Cloudflare-fronted (bare requests often 403); ToS prohibits productizing scraped data. **Prefer nflverse re-published PFR data (snap counts, lines).**
- **Stathead** — paid, skip.
- **NGS (nextgenstats.nfl.com)** — public leaderboard pages free; real API partner-gated. Unofficial route: frontend XHR JSON (`appapi.ngs.nfl.com/statboard/...`) for CPOE, separation, time-to-throw, RYOE. Fragile.
- **PlayerProfiler** — unconfirmed scraping ToS; prefer nflverse overlapping metrics (target share, air yards already in nflverse player stats).

---

## Recommended Core Stack

| Need | Primary | Backup |
|---|---|---|
| PBP / player stats / rosters | **nflreadpy** (Python) | — |
| Fantasy platform data | **Sleeper API** | ESPN unofficial |
| ADP | **Fantasy Football Calculator API** | FantasyCalc |
| Weekly ECR eval baseline | **`load_ff_rankings(type="week")`** | FantasyPros API free tier / ffpros |
| Historical Vegas closing lines | **`load_schedules()`** | AusSportsBetting spreadsheet |
| Current-week lines | **ESPN unofficial odds** | The Odds API (500 credits/mo) |
| Weather | **Open-Meteo** | nflverse temp/wind (historical); Meteostat |
| Injuries | **`load_injuries()`** | ESPN unofficial injuries |
| News signal | **ESPN unofficial news + Sleeper trending** | Rotoworld RSS (verify manually) |
| Depth/snaps/routes | **nflverse loaders + FTN charting** | OurLads spot-check |
| PROE / pace / scheme | **Compute from nflverse PBP + FTN charting** | rbsdm (view-only) |
| Stadium metadata | **nflverse roof/surface + hand-built 32-row table** | — |
| NGS-style metrics | **nflverse player stats** | NGS unofficial XHR |

**Net:** ~80% of data needs come from nflverse alone, plus Sleeper, Open-Meteo, and unofficial ESPN endpoints. Two cautions: (1) FantasyPros' own free API tier is sample-data-only — route ECR through `load_ff_rankings()`; (2) Reddit scraping died May 2026.
