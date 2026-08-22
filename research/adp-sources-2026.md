# Where to Get 2026 Fantasy Draft Rankings by ADP

*Compiled Aug 20, 2026. API endpoints marked ✅ were hit live and returned 2026 data.*

Companion: [data-sources.md](data-sources.md) (broader data stack), [fantasypros-rankings-sources.md](fantasypros-rankings-sources.md) (ECR vs ADP methodology).

---

## 1. Composites (multiple platforms blended)

| Source | URL | What it blends | Access |
|---|---|---|---|
| **FantasyPros ADP** ⭐ | [fantasypros.com/nfl/adp/overall.php](https://www.fantasypros.com/nfl/adp/overall.php) | ESPN (PPR), Yahoo (half), CBS, RTSports, Fantrax, Sleeper | Free HTML; also PPR/half/std/superflex splits. Official API is paid ($5.99/mo) — free tier is sample data only |
| **Fantasy Life** | [fantasylife.com/tools/nfl-adp](https://www.fantasylife.com/tools/nfl-adp) | Multi-platform, redraft + best ball | Free web, account-gated features |
| **DIRECTV Insider** | [directv.com/insider/fantasy-football-adp-rankings](https://www.directv.com/insider/fantasy-football-adp-rankings/) | CBS, ESPN, NFL, Yahoo, Sleeper, Underdog | Free article table, updated ~weekly |
| **Draft Sharks ADP** | [draftsharks.com/adp](https://www.draftsharks.com/adp) | Per-platform pages (`/adp/sleeper`, `/adp/underdog`, …) plus a cross-platform index | Free web |
| **Fantasy Six Pack** | [fantasysixpack.net/fantasy-football-adp](https://fantasysixpack.net/fantasy-football-adp/) | ESPN, Yahoo, Sleeper, CBS side-by-side | Free web |

## 2. Mock-draft / open-data ADP (best for programmatic pulls)

| Source | Endpoint | Notes |
|---|---|---|
| **Fantasy Football Calculator** ⭐ | ✅ `https://fantasyfootballcalculator.com/api/v1/adp/ppr?teams=12&year=2026` | No key. Formats: `standard`/`ppr`/`half-ppr`/`2qb`/`dynasty`; `teams=8/10/12/14`. Returns adp, high/low, stdev, times_drafted. Free for personal **and** commercial use with attribution. Currently ~7k drafts in the trailing 7-day window |
| **MyFantasyLeague** ✅ | `https://api.myfantasyleague.com/2026/export?TYPE=adp&JSON=1` | No key. Real MFL league drafts (sharper pool than public mocks). Params: `PERIOD`, `FCOUNT`, `IS_PPR`, `IS_KEEPER`, `IS_MOCK`. Returns MFL player IDs — needs a `TYPE=players` join |
| **Sleeper** | [docs.sleeper.com](https://docs.sleeper.com) | No public ADP endpoint. You get drafts/picks per league + trending adds/drops; ADP has to be derived, or read Sleeper ADP off FantasyPros/Draft Sharks |
| **FantasyCalc** | [fantasycalc.com](https://fantasycalc.com) | Free JSON. Redraft + dynasty trade values and ADP; dynasty-leaning |

## 3. Platform-native (the ADP your actual league drafts against)

- **ESPN** — unofficial API `lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/2026/segments/0/leaguedefaults/3?view=kona_player_info` carries `averageDraftPosition`. Public leagues need no auth. Undocumented, can break.
- **Yahoo** — Fantasy Sports API, OAuth 2.0 required; ADP/AVP in player draft analysis. Highest friction of the majors.
- **CBS / RTSports / Fantrax** — no free public API; take them via the FantasyPros composite.
- **NFL.com** — ADP on-site only.

If the target audience drafts on one platform, use *that* platform's ADP, not a composite — the composites blend different default scoring and the same player can move 15+ picks between sources.

## 4. Best ball (steeper, sharper, different shape than redraft)

| Source | URL | Pools |
|---|---|---|
| **FantasyPros best-ball ADP** | [fantasypros.com/nfl/adp/best-ball-overall.php](https://www.fantasypros.com/nfl/adp/best-ball-overall.php) | Underdog, BB10s, Drafters, RTSports, DraftKings |
| **Best Ball Team Builder** | [bestballteambuilder.com/underdog-best-ball-average-draft-position](https://www.bestballteambuilder.com/underdog-best-ball-average-draft-position) | Underdog, live |
| **Sharp Football** | [sharpfootballanalysis.com/fantasy/fantasy-football-adp-half-ppr-underdog-best-ball](https://www.sharpfootballanalysis.com/fantasy/fantasy-football-adp-half-ppr-underdog-best-ball/) | Underdog half-PPR |
| **Occupy Fantasy** | [occupyfantasy.com/draftkings-best-ball-adp](https://occupyfantasy.com/draftkings-best-ball-adp/) | DraftKings, daily 2pm ET |
| **The Fantasy Sanctuary** | [thefantasysanctuary.com/bestball-adp](https://thefantasysanctuary.com/bestball-adp/) | Underdog, Drafters, DraftKings, FFPC |
| **Fantasy Points** | [fantasypoints.com/nfl/adp/best-ball](https://www.fantasypoints.com/nfl/adp/best-ball) | Underdog, NFFC, FFPC |

## 5. High-stakes / sharp market

- **NFFC** — tracked by FantasyPros and Fantasy Points. Diverges meaningfully from casual ADP (mid-tier TEs have gone ~19–23 picks later in NFFC than composite).
- **FFPC** — TE-premium scoring, so its ADP is only comparable within FFPC.
- **RotoWire** ([rotowire.com/football/adp.php](https://www.rotowire.com/football/adp.php)) and **Footballguys** ([footballguys.com/adp](https://www.footballguys.com/adp)) both publish PPR/half/standard splits; Footballguys supports `?season=2026&pos=wr` filtering.
- **Fantasy Alarm** ([fantasyalarm.com/nfl/adp](https://www.fantasyalarm.com/nfl/adp)) — free web table.

---

## Recommendation

- **Programmatic, free, no auth:** Fantasy Football Calculator (primary) + MyFantasyLeague (sharper cross-check). Both verified live for 2026.
- **Broadest single human-readable board:** FantasyPros overall ADP, with the format toggle set to your league's scoring.
- **If building a draft tool:** pull platform-specific ADP for whichever host the user's league runs on, and keep a composite only as a fallback. ADP is market data — the pool it came from is the whole point.

### Caveats
- ADP is a trailing average over a draft window (FFC uses 7 days); it lags news by days.
- Recency matters more than sample size in August — a July-heavy window misprices post-preseason-injury players.
- Composites hide format differences; always check whether the number is PPR, half, or standard before comparing two sources.

---

# Half-PPR (0.5 PPR) Availability

*Verified Aug 20–21, 2026 by hitting each endpoint / loading each page. ✅ = confirmed live.*

## Yes — real half-PPR toggle or dedicated set

| Source | How | Verified |
|---|---|---|
| **Fantasy Football Calculator** | `?format=half-ppr` in the URL/API path: `api/v1/adp/half-ppr?teams=12&year=2026` | ✅ Returned `"type":"Half-PPR"`, 2,595 drafts, 8/15–8/20 window |
| **FantasyPros** | Dedicated page [adp/half-point-ppr-overall.php](https://www.fantasypros.com/nfl/adp/half-point-ppr-overall.php) | ✅ Composite of **Yahoo + RTSports + Sleeper**, all updated 8/19 |
| **Draft Sharks** | Scoring nav on [/adp](https://www.draftsharks.com/adp): Non-PPR / **Half-PPR** / PPR / TEP / IDP, crossed with platform + league size | ✅ Toggle present in DOM |
| **Fantasy Life** | "RANKING SET: **0.5 PPR**" on [/tools/nfl-adp](https://www.fantasylife.com/tools/nfl-adp) | ✅ Label confirmed — but page read "Last updated 9 days ago" |
| **RotoWire** | Scoring selector: PPR / Standard / **Half PPR** on [adp.php](https://www.rotowire.com/football/adp.php) | ✅ |
| **FantasyCalc** | `ppr=0.5` query param on `api.fantasycalc.com/values/current` | ✅ Rank order genuinely shifts vs ppr=1 (Nacua/McCaffrey swap at #4). Note: trade **values**, not literal ADP |

## Yes — but only because the platform is natively half-PPR

Underdog and Yahoo default to 0.5 PPR, so any ADP sourced from them *is* half-PPR ADP even with no toggle.

| Source | Half-PPR via | Note |
|---|---|---|
| **Yahoo** (API / any site's Yahoo column) | Yahoo's own default scoring is 0.5 PPR | The single cleanest half-PPR redraft market signal |
| **Underdog** best ball — [FantasyPros BB](https://www.fantasypros.com/nfl/adp/best-ball-overall.php), [Best Ball Team Builder](https://www.bestballteambuilder.com/underdog-best-ball-average-draft-position), [Sharp Football](https://www.sharpfootballanalysis.com/fantasy/fantasy-football-adp-half-ppr-underdog-best-ball/), [Draft Sharks /adp/underdog](https://www.draftsharks.com/adp/underdog), [Fantasy Points](https://www.fantasypoints.com/nfl/adp/best-ball) | Underdog is half-PPR | Sharp Football's page is titled half-PPR outright. **Best ball ≠ redraft shape** — 18-round, no K/DST, WR-heavy |
| **Sleeper** | Sleeper's default league is half-PPR; FantasyPros carries a Sleeper column in the std/half/PPR composites, so format-split Sleeper ADP exists | No public Sleeper ADP endpoint — read it off FantasyPros/Draft Sharks/Fantasy Life |
| **RTSports** | Appears in all three FantasyPros composites (std, half, PPR) | Format-split available |

## No half-PPR

| Source | Why |
|---|---|
| **MyFantasyLeague API** | `IS_PPR` is binary — "0 = leagues that do not use a PPR scoring system; 1 = only PPR; -1 = all." Half-PPR leagues fall into the PPR bucket, undifferentiated. Confirmed from [MFL API docs](https://api.myfantasyleague.com/2026/api_info?STATE=details&TYPE=adp) |
| **ESPN** | ✅ One global `averageDraftPosition` per player — byte-identical across `leaguedefaults/1` and `/3` (Gibbs 1.50, Robinson 2.57, Chase 4.11 in both). ESPN's default is full PPR |
| **Fantasy Alarm** | Provider filter only (RTSports, NFFC, FFPC, Yahoo, ESPN, Sleeper), no scoring toggle. ✅ Its blended "ADP" column averages *across different scoring systems* — half-PPR only reachable via the Yahoo column |
| **Footballguys** (free ADP page) | ✅ Per-platform columns + Consensus, no scoring selector. Half-PPR only via Underdog / Yahoo! / BestBall10s columns. Page itself points to subscriber "Footballguys Labs" for more |
| **Fantasy Points** | ✅ Toggle is Redraft / Dynasty / Best Ball, not scoring. Columns Underdog / FFPC / RT Sports. Paywalled ($60/yr) |
| **DIRECTV Insider** | Single blended table across CBS/ESPN/NFL/Yahoo/Sleeper/Underdog — mixes scoring formats (page timed out on fetch; treat as no half-PPR split) |
| **Fantasy Six Pack** | Per-platform tables (ESPN/Yahoo/Sleeper/CBS), no scoring toggle; half-PPR only via Yahoo/Sleeper (403 on fetch — from search-result descriptions) |
| **Occupy Fantasy** (DraftKings BB) | DraftKings best ball is **full PPR** + 100/100/300-yard bonuses |
| **CBS, Fantrax** | Appear only in FantasyPros' PPR composite |
| **NFFC, BestBall10s** | Full PPR (NFFC scoring: 1 PPR, 6-pt pass TD, 1pt/20 pass yds) |
| **FFPC** | Full PPR with TE premium — its ADP is only comparable within FFPC |
| **The Fantasy Sanctuary** | Underdog / Drafters / DraftKings / FFPC columns, no scoring toggle; half-PPR via the Underdog column |

## Practical takeaway for half-PPR

1. **Programmatic:** Fantasy Football Calculator `half-ppr` is the only free, no-auth, genuinely-half-PPR ADP feed. Everything else is either a scrape or a platform proxy.
2. **Market signal:** Yahoo ADP, because Yahoo's default *is* 0.5 PPR — a real drafting population, not mocks.
3. **Best cross-check:** FantasyPros half-PPR composite (Yahoo + RTSports + Sleeper).
4. **Don't do this:** take a "consensus" ADP from Fantasy Alarm / DIRECTV / Footballguys and call it half-PPR. Those blends average PPR, half-PPR, and TE-premium pools into one number, which systematically mis-prices pass-catching RBs and high-volume WRs at exactly the picks where half-PPR diverges.
5. **Sample-size caveat:** FFC's half-PPR pool (2,595 drafts) is ~37% the size of its PPR pool (6,978) — noisier at the back of the board.
