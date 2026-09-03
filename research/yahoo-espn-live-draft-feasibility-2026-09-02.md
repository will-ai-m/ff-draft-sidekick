# Can Draft Sidekick attach to a Yahoo or ESPN draft? — feasibility study

*Researched 2026-09-02. Method: the 2026-08-22 platform spike (`draft-apis-sleeper-espn-yahoo.md`) as
the baseline; six narrow Haiku web-research passes on 2026-09-02 (ESPN live readability, ESPN
access mechanics, ESPN data model, Yahoo access, Yahoo draft-time data model, prior art), each
citing dated sources and labelling confidence; plus local empirical checks run against this repo's
own data (id-crosswalk coverage from DynastyProcess `db_playerids.csv`, an unauthenticated probe of
ESPN's public player endpoint). Where a Haiku pass and a primary check disagreed, the check wins and
the correction is noted.*

## Verdict

| | Sleeper (today) | Yahoo | ESPN |
|---|---|---|---|
| Live picks readable by a program | ✅ public REST, verified | ✅ official REST (`draftresults` returns picks-so-far mid-draft) | ❌ no API; every live tool reads the draft-room page |
| Auth | none | OAuth 2.0 + **human-reviewed access application** | `espn_s2` + `SWID` cookies, copied by hand |
| Access status (Sep 2026) | open | **gated**: self-serve Fantasy scope removed Jul 2026; approved apps still reporting 403s (yfpy #84, #85, both open) | unofficial API works for public leagues without auth; Disney ToS forbids automated access |
| Polling at 1 Hz for a 3-hour draft | verified safe (≤1000/min) | **unproven** — no published limits, one report of connections dropping under sustained sequential calls | REST irrelevant for live; a browser reader has no polling question |
| Settings / scoring / order / teams | ✅ | ✅ (`settings`, `teams`, `draftresults`) | ✅ (`mSettings`, `mTeam`, `mDraftDetail`) |
| Player identity → this app's Sleeper ids | native | crosswalk `yahoo_id`: 88% of draftable skill players (59% of 2022+ draftees) | crosswalk `espn_id`: 97% of draftable skill players, ids verified identical to ESPN's live ids |
| Mock drafts via API | ✅ | ❌ | ❌ |
| Integration shape | poll REST | poll REST behind OAuth | **browser automation** (Playwright/CDP reading the draft room), a different product |

**Bottom line.** Yahoo is the only platform besides Sleeper where the app's architecture — poll a
complete pick list, replace state wholesale — carries over unchanged; what blocks it is not code
but Yahoo's access program and unknown throttling. ESPN cannot be done the way Sidekick works today:
nobody in public has read an in-progress ESPN draft through an API, and all commercial and
open-source "live sync" tools read the draft room itself from inside the browser. An ESPN rung
means building and maintaining a browser-side reader against an undocumented page, in tension with
Disney's terms. Keep Sleeper first; if a Yahoo league matters, file the access application now and
spike against a real Yahoo draft when it is granted; treat ESPN as a separate project, not an
adapter.

## What the app actually needs from a platform

The engine (need vectors, FLEX share, Monte Carlo survival, plans, bench phase) is already
platform-agnostic: it consumes `SlotConfig`, `ScoringSettings`, a pick feed keyed by **Sleeper
player id**, a seat→team map, and the traded-pick resolver. Everything platform-specific lives in
four modules (`sleeper/client.ts` 488 lines, `sleeper/sync.ts` 809, `sleeper/attach.ts` 264,
`roster/leagueSettings.ts` 161) plus the identity join in `snapshots/match.ts` (413), which keys on
`sleeper_id` and models team defenses as Sleeper pseudo-players keyed by team code.

| Sidekick needs | Sleeper today | Yahoo | ESPN |
|---|---|---|---|
| Attach input → draft | draft URL/id, `GET /v1/draft/<id>` | league key (`{game}.l.{id}`); league → `draft_status`, `settings` | numeric league id from the URL; `leagues/{id}?view=mSettings,mTeam,mDraftDetail` |
| Draft status | `pre_draft`/`drafting`/`complete` | `predraft`/`postdraft` documented; no in-progress value found in any primary source (see Yahoo §3) | `draftDetail.drafted` / `inProgress` (semantics undocumented) |
| Teams, rounds, slots | draft `settings.slots_*` | `num_teams`, `roster_positions[]` (position, count) | `settings.rosterSettings.lineupSlotCounts` (slot id table: 0 QB, 2 RB, 4 WR, 6 TE, 7 OP, 16 D/ST, 17 K, 20 BE, 21 IR, 23 FLEX) |
| Scoring | league `scoring_settings` (81 keys) | `stat_categories` + `stat_modifiers` (stat_id → points; ids fetched from `game/{key}/stat_categories`) | `scoringSettings.scoringItems[]` (statId → points; espn-api `constant.py` maps them) |
| Draft order + user's seat | `draft_order` (user_id → slot) + stored username | `Team.draft_position` (verified in yfpy's model); user via `use_login=1` | `settings.draftSettings.pickOrder`; user = SWID cookie matched to `members[].id` → `teams[].owners[]` |
| Full pick list per poll | `GET /v1/draft/<id>/picks` | `league/{key}/draftresults` (pick, round, team_key, player_key) | `draftDetail.picks[]` — **post-draft only** as far as anyone has shown |
| Traded picks | `traded_picks` endpoint | `can_trade_draft_picks` setting exists; pick-ownership field not found | pick trading exists (LM setting); API field for changed ownership not found |
| Player identity | native ids | `player_key = {game}.p.{player_id}` → crosswalk `yahoo_id` → `sleeper_id`; name fallback for rookies | `playerId` → crosswalk `espn_id` → `sleeper_id`; D/ST are negative ids (`-16000 − teamId`, e.g. Texans `-16034`) |
| Mock rehearsals | live mocks readable | not exposed; a private league drafted against autopick teams is API-visible | not exposed |

**Identity coverage, measured 2026-09-02 against the live crosswalk** (draftable = rows carrying both
a Sleeper id and a FantasyPros id):

| Set | n | has `espn_id` | has `yahoo_id` |
|---|---|---|---|
| Skill players (QB/RB/WR/TE) | 2,404 | 2,320 (97%) | 2,111 (88%) |
| … drafted 2022 or later | 716 | 669 (93%) | 426 (59%) |
| … drafted before 2022 | 1,688 | 1,651 (98%) | 1,685 (100%) |
| Kickers (`PK`) | 109 | 104 | 109 |
| Team defenses | 0 rows | — | — |

The ESPN gap is fringe (Brant Kuithe, Taulia Tagovailoa…); the Yahoo gap is this year's rookies
(Fernando Mendoza, Jeremiyah Love, Emmett Johnson…), which the existing normalized-name fallback
would have to catch. Both platforms need a 32-row team-defense table; ESPN's ids were confirmed
by probe (`id: -16034, name: "Texans D/ST", defaultPositionId: 16`), Yahoo's format is in §3.

## Yahoo

### 1. Access — the real blocker

- Fantasy Sports is no longer a self-serve scope. Since 22 Jul 2026 every app, old or new, gets
  HTTP 403 "This application is not authorized to perform this action" on every endpoint unless
  approved through `sports.yahoo.com/developer/access/` (yfpy #84, opened 2026-07-22, still open).
- An app that *was* approved (StatsDeckAI, App ID QR4gTydM) was still receiving 403s two weeks
  later; the maintainer attributed it to a backend sync lag needing Yahoo support to clear
  (yfpy #85, 2026-08-07, open). No approval SLA is published.
- Personal / single-league use is an explicitly recognised application category ("where access is
  limited to personal or single league use"). Read-only (`fspt-r`); write scope removed Oct 2025.
- Terms: attribution ("Fantasy data provided by Yahoo Fantasy" with logo), single developer
  account, no reverse engineering, and "Yahoo monitors usage… may temporarily throttle or limit
  access" — dynamic, not a stated number.

### 2. OAuth mechanics — standard, no surprises

Authorization-code flow (`api.login.yahoo.com/oauth2/request_auth` → `get_token`), loopback
`localhost` redirect or out-of-band code entry, PKCE recommended for a desktop client, access token
~1 hour, refresh token long-lived and possibly rotated on refresh. yfpy and yahoo_fantasy_api both
implement it; the app would keep a consumer key/secret and the refresh token in local config.

### 3. Draft-time data model — clean, four facts to confirm at the spike

- `draftresults` rows: `pick`, `round`, `cost` (auction), `team_key` (`{game}.l.{league}.t.{n}`),
  `player_key` (`{game}.p.{player_id}`). Returns picks so far during an in-progress draft
  (baseline spike; the auction in-flight nomination is excluded until resolved).
- `settings`: `num_teams`, `roster_positions[]` (position, count, position_type), `stat_categories`
  + `stat_modifiers`, `draft_type`, `is_auction_draft`, `draft_time`, `draft_pick_time`,
  `can_trade_draft_picks`, `uses_playoff`.
- Teams carry `draft_position` (verified in yfpy's `Team` model — the seat order needs no
  inference from round 1) and `managers[]` (guid, nickname, `is_commissioner`); the logged-in
  manager is found via `users;use_login=1/games/leagues/teams`.
- Team defenses are players whose `position_type` is `DT` (Defense/Special Teams); the concrete
  `player_key` format for a defense was not found in public documentation.
- Formats: XML by default, `?format=json` available; players paginate at 25.
- **To confirm live** (not settled by sources, second pass included): whether `draft_status` has an
  in-progress value beyond `predraft`/`postdraft` — no primary source lists one, so the adapter
  should key "drafting" off `draft_time` having passed while `draftresults` is still short of
  `num_teams × rounds`; the defense `player_key` format; and the NFL `stat_id` numbers, which no
  library publishes as a table but which `game/{game_key}/stat_categories` returns at runtime
  (a lookup at attach, not a risk).

### 4. Polling — the open technical risk

No documented per-minute or per-day limit. yfpy #51 reports "Remote end closed connection without
response" under sustained sequential requests. Sidekick's 1 Hz cadence is ~10,000 requests over a
draft; whether Yahoo tolerates that is unknown and only a live spike answers it. A safe design
polls `draftresults` at 2–3 s, backs off on `429`/connection drops, and keeps the full-refetch
recovery model (every response is the complete pick list, exactly as with Sleeper). One Haiku pass
quoted "~1000 calls/min" for Yahoo; that figure is Sleeper's and was discarded.

## ESPN

### 1. Live picks — no program-readable path has been demonstrated

- The unofficial v3 API (`lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{y}/segments/0/leagues/{id}`)
  serves `draftDetail.picks[]` for completed drafts. No 2025–2026 source shows it populating during
  a live draft; the espn-api maintainer's position (issue #558) that the live draft runs on
  different backend calls stands, and no repo, thread or article documents a draft websocket or
  host (`draft.espn.com`, `fantasydraft.espn.com` searches: nothing credible).
- The only public leads for live data are inside the page: a community gist notes that the ESPN
  and Yahoo draft-room DOM elements carry React props holding league settings, positions, teams,
  every pick and the player pool; the community's standard answer is "scrape it with a Chrome
  extension".
- Open-source live tools (`Daisymath/fantasy-football-draft-tool`, `markpassando/espn-fantasy-scraper`)
  drive Selenium against the draft room after a manual login.

### 2. Access mechanics

- Public leagues: no auth (this repo's probe of `leaguedefaults/3?view=kona_player_info` returned
  HTTP 200 with player ids, positions, eligible slots and ADP). Private leagues: `espn_s2` + `SWID`
  cookies, which persist across sessions and can only be obtained by copying them from a logged-in
  browser (ffscrapr: "cannot be done programmatically"; a "ESPN Cookie Finder" extension exists).
- No published rate limits and no community reports of 429s or Akamai blocks against the fantasy
  API; wrappers poll on minute-to-hour cadences, so 1 Hz is untested territory.
- No league-discovery endpoint; the user supplies the league id from the URL.
- Terms: the 2026-08-22 spike's citation stands — Disney Terms of Use prohibit automated access and
  reverse engineering; no enforcement against fantasy tools is on record. (Two Haiku citations
  pointed at ESPN Fan Advisors and ESPN BET terms, which are other properties; discarded.)
- Mock drafts: browser-only; nothing in the v3 API addresses the mock lobby.

### 3. Data model — easy if the picks ever become readable

Slot ids, `scoringItems[].statId` (espn-api `constant.py` has both tables), `draftSettings`
(`type` SNAKE/LINEAR/AUCTION, `pickOrder`, `timePerSelection`, `keeperCount`, `isTradingEnabled`),
`draftDetail.picks[]` (`overallPickNumber`, `teamId`, `playerId`, `roundPickNumber`), `teams[]`
with `owners[]` SWIDs and `members[]`. Traded picks: ESPN supports LM-enabled pick trading, but no
source documents an API field recording changed ownership — it would have to be inferred from
`pickOrder` versus who actually picked. One Haiku pass guessed D/ST ids were positive; the probe
shows they are negative.

### 4. What an ESPN rung would really be

A browser-side reader: Playwright attached to the user's own Chrome profile over CDP (so the
user's real login and cookies are used, nothing is automated at the login step), reading the draft
room's React state or intercepting its network calls, and emitting the same `PickFeedEntry` stream
the Sleeper poller emits. Prior art says this works (every commercial assistant does it) and is
brittle (their own help pages ship "manual mode" fallbacks; ESPN's page changes break selectors).
It also inverts Sidekick's staleness guarantee: today a poll returns the platform's complete pick
list, so a missed poll costs nothing; a DOM reader that misses a render has no authoritative list
to resync from unless the page keeps the full pick history in state. Bot-detection reports in 2026
target headless/automation fingerprints; attaching to a real browser session avoids most of it, and
no ESPN- or Yahoo-specific blocking of extensions or CDP sessions is on record.

## Prior art (what the market does)

| Tool | Platforms | Mechanism |
|---|---|---|
| FantasyPros Draft Assistant (sync) | ESPN, Yahoo, CBS, Sleeper | Chrome/Firefox/Edge extension reading the draft room; ESPN needs third-party cookies enabled |
| Draft Sharks | ESPN, Yahoo, Sleeper | Chrome extension; ESPN sync desktop-only |
| RotoWire Draft Kit | ESPN, Yahoo, CBS | extension, with a manual-entry fallback |
| PickPulse, DraftKick, Draft Hero, Draft Companion | ESPN ± Yahoo ± Sleeper | Chrome extensions, method undisclosed |
| open source (Daisymath, markpassando) | ESPN | Selenium against the draft room |

Nothing in the market reads ESPN live picks without a browser; nothing found reads Yahoo live picks
through anything but the official API or the page.

## Recommendation

1. **Sleeper stays the production platform.** It is the only one where the app's contract (public
   pick list, stateless recovery, mock rehearsals on the real code path) holds.
2. **Yahoo, if a league of ours lands there:** file the developer access application now — the
   lead time is weeks and the first approval reports are of apps still stuck — then run a one-day
   spike against a real Yahoo draft (a private league drafted against autopick teams is API-visible,
   the mock lobby is not) to settle the four §3 facts and the throttling question. The adapter is a
   bounded change: a `DraftPlatform` seam behind `attach`/`sync`/`leagueSettings`, an identity step
   mapping `yahoo_id` → `sleeper_id` with name fallback for rookies, a DEF table, and a stat-id →
   `ScoringSettings` translation. Poll at 2–3 s with backoff rather than 1 s until measured.
3. **ESPN: do not build it as an adapter.** If it is ever wanted, scope it as a separate
   "browser source" that feeds the existing pick feed from a Playwright/CDP session on the user's
   own Chrome, prototype it against one live ESPN mock in the browser first, and go in knowing it is
   the brittle, ToS-adverse integration every commercial tool also carries.

## Sources

- Baseline: `research/draft-apis-sleeper-espn-yahoo.md` (2026-08-22, incl. live Sleeper mock spike).
- Yahoo access: uberfastman/yfpy issues #84 (2026-07-22) and #85 (2026-08-07); #51 (connection
  drops); sports.yahoo.com/developer and /developer/access; developer.yahoo.com/oauth2/guide
  (auth-code flow, token lifetimes); Pipedream community thread on `fspt-r`/`fspt-w`.
- Yahoo model: yahoo-fantasy-api.readthedocs.io (league/draftresults/settings/authentication);
  yfpy.uberfastman.com/query; y-fantasy-node-docs.vercel.app (draft_results, player, user);
  help.yahoo.com stat-categories (SLN6451).
- ESPN live: cwendt94/espn-api issue #558 (2024-08-22); ffscrapr `espn_getendpoint` and
  `espn_authentication` vignettes; gist nntrn/ee26cb2a0716de0947a0a4e9a157bc1c (draft-room React
  props); Daisymath/fantasy-football-draft-tool; markpassando/espn-fantasy-scraper;
  jman4190 Medium "ESPN Fantasy Draft API".
- ESPN access/model: cwendt94/espn-api discussion #150 and `constant.py`; pseudo-r/Public-ESPN-API;
  stmorse.github.io "ESPN Fantasy API v3"; thomaswildetech.com player-info views; ESPN support
  articles on League ID, roster slots, scoring formats, draft settings and trade draft picks;
  ESPN Cookie Finder (Chrome Web Store); dev.to/zuplo ESPN hidden API guide.
- Prior art: support.fantasypros.com ESPN draft sync; draftsharks.com/kb league sync;
  rotowire.com live draft assistant sync explained; pff.com draft tools; Chrome Web Store listings
  (PickPulse, DraftKick); sntlhq.com and cside.com headless-detection write-ups (2026).
- Local checks (this repo, 2026-09-02): DynastyProcess `db_playerids.csv` coverage counts; ESPN
  `leaguedefaults/3?view=kona_player_info` probe (HTTP 200 unauthenticated, ids match crosswalk
  `espn_id`, D/ST ids negative).
