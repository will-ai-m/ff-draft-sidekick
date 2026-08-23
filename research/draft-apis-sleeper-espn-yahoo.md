# Platform draft APIs — Sleeper vs ESPN vs Yahoo

*Researched 2026-08-22. Sources: official docs, community wrapper libraries (source-inspected), GitHub issue history, plus a live spike against a real Sleeper mock draft.*

## Verdict table

| | Sleeper | ESPN | Yahoo |
|---|---|---|---|
| Official API | ✅ documented, free | ❌ reverse-engineered private API | ✅ official, but access newly gated |
| Auth | None | `espn_s2` + `SWID` cookies (manual grab, brittle) | OAuth 2.0 + manual application review |
| Completed draft results | ✅ | ✅ (`?view=mDraftDetail`) | ✅ (`draftresults`) |
| Read a **live** draft in progress | ✅ **verified** (see spike) | ❌ confirmed impossible via API | ✅ picks-so-far mid-draft |
| Make picks via API | ❌ | ❌ | ❌ |
| Mock drafts via API | ✅ **verified** (see spike) | ❌ no known endpoint | ❌ not exposed |

**No platform allows programmatic pick submission — read-and-recommend is the only architecture supported anywhere.** Sleeper is the only platform where mock drafts are API-readable, which makes it the only platform where dress-rehearsal testing uses the exact production code path.

---

## Sleeper (v1 platform)

Base: `https://api.sleeper.app` — documented at docs.sleeper.com, no auth, read-only by design ("No API Token is necessary, as you cannot modify contents via this API").

### Draft endpoints

| Purpose | Endpoint |
|---|---|
| User's drafts | `GET /v1/user/<user_id>/drafts/<sport>/<season>` |
| League's drafts | `GET /v1/league/<league_id>/drafts` |
| Draft metadata/settings | `GET /v1/draft/<draft_id>` |
| All picks | `GET /v1/draft/<draft_id>/picks` |
| Traded picks | `GET /v1/draft/<draft_id>/traded_picks` |

- Draft object carries `draft_order` (user_id → slot), `slot_to_roster_id`, `settings` (teams, rounds, per-position slots, `pick_timer`, `cpu_autopick`), `status` (`drafting`/`complete`), `type` (snake/linear/auction), `metadata.scoring_type` (e.g. `half_ppr`).
- No websocket in the public API → poll `/picks` and diff. Rate limit: stay under ~1000 calls/min or risk IP block (429). ~1s cadence is comfortably safe.
- `/picks` returns the **complete pick list every call** → stateless full-refetch recovery is free (matches the Q15 staleness requirement).
- Unofficial `sleeper.com/graphql` exists (their web client's internal API) — read-only as far as anyone has shown; do not depend on it.

### ★ Mock draft spike — VERIFIED 2026-08-22 (AS-1 confirmed)

Spiked live against mock draft `1396790135072272384` **while it was in progress**:

- `GET /v1/draft/1396790135072272384` → full payload with `status: "drafting"`: settings (10-team, half-PPR, snake, 15 rounds, roster slots), `draft_order`, `slot_to_roster_id`, timers. No auth.
- `GET .../picks` → picks streamed in real time (bot picks visible seconds after they happened, mid-draft). Each pick embeds full player metadata: name, position, NFL team, injury status, years_exp — **no separate player-DB join needed for display**.

**Schema deltas: mock vs real league draft** (sync code must handle both):

| Field | Real league draft | Mock draft |
|---|---|---|
| `league_id` | league id | `null` ← clean mock detector |
| `picks[].picked_by` | user_id | `""` (bots) |
| `picks[].roster_id` | roster id | `null` |
| `picks[].draft_slot` | ✅ | ✅ |

→ **Key all pick attribution on `draft_slot` + `draft_order`, never `picked_by`/`roster_id`.** That one choice makes the identical code path work for mocks and real drafts.

Mock draft features relevant to testing (from sleeper.com/mockdraft): solo vs AI bots, start anytime, unlimited pause, custom roster/scoring settings, keeper/dynasty modes, shareable room links. Combined with API readability: **live Sleeper mocks are a full dress rehearsal of production — same endpoints, same polling loop, same shapes. Zero browser scraping needed for v1.**

---

## ESPN (later-ladder platform, per Q4)

No official API. Community uses the private endpoints ESPN's own apps call:

- Base: `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/{year}/segments/0/leagues/{leagueId}` (host changed from `fantasy.espn.com` in Apr 2024 — has churned before, will churn again).
- Draft data: `?view=mDraftDetail` → `draftDetail.picks[]` with `teamId`, `playerId`, `roundId`, `roundPickNumber`, `bidAmount`, `keeper`. Draft settings under `mSettings` → `settings.draftSettings`.
- Auth: public leagues need nothing; private leagues need `espn_s2` + `SWID` cookies copied manually from a logged-in browser session (cannot be automated; expire on session changes).

**Hard limits:**

- **Live drafts are NOT readable.** `draftDetail` is only populated after the draft completes (`drafted: true`). espn-api maintainer (cwendt94, issue #558): "ESPN uses different APIs for the live draft so the data won't reflect correctly until afterwards. I tried looking into it last year and was not able to get it working live." Nobody in the community has cracked the live draft-room backend.
- Existing "live assistant" tools for ESPN all scrape the rendered draft-room UI (Selenium / browser extension) — brittle by their own authors' admission.
- Disney Terms of Use §2.B prohibits automated access and reverse engineering outright. Rarely enforced (years of public tool usage, no known bans), but it's a standing legal/account risk.

**Implication for the ESPN rung of the ladder:** live sync would require browser automation (Playwright DOM/network capture of the draft room), a fundamentally different and more fragile integration than Sleeper's. Post-draft analysis via `mDraftDetail` is easy; live is the hard part.

---

## Yahoo (not on the ladder; documented for completeness)

Official API, OAuth 2.0. Draft surface:

- `league/{league_key}/draftresults` and `team/{team_key}/draftresults` — pick, round, cost (auction), team_key, player_id.
- `league/{league_key}` metadata carries `draft_status` (`predraft`/`postdraft`); `settings` carries `draft_type`, `is_auction_draft`, `draft_time`.
- **Live reads work**: `draftresults` mid-draft returns picks so far (auction quirk: the in-flight nomination is excluded until resolved).
- No draft-pick write path (transaction types are add/drop/commish/trade only). Mock lobby not exposed at all.

**Access risk (the real story, 2025–2026):**

- Oct 2025: write access silently removed for new apps.
- Jul 2026: existing apps began getting 403s on all endpoints; Fantasy Sports removed as a self-serve API scope. Access now requires a manual application at sports.yahoo.com/developer/access — read-only by default, human-reviewed, reports of approved apps still stuck on 403 (yfpy issues #79, #84, #85).

If Yahoo ever joins the ladder, file the access application well before build time.

---

## Testing-strategy implications (Draft Sidekick)

1. **Live Sleeper mocks** (Q16's chosen validation path) are fully unblocked — AS-1 verified, production code path end-to-end.
2. **Replay harness** is cheap if ever wanted: any completed Sleeper draft (real or mock) is publicly readable by draft_id → recorded pick sequences can be replayed against the engine at speed.
3. **Browser scraping is not needed for v1** and should only enter the picture if/when the ESPN rung is climbed.
