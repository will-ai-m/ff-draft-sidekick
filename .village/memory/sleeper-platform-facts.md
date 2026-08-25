# Sleeper platform facts (live-verified)

Behavior confirmed against the real API and a real mock room, not inferred from docs.
Sources: `.work/001-draft-sidekick-v1/dev-notes-T2.md` (live re-verification table), `dev-notes-T3.md`,
`dev-notes-T15.md` §1, `qa.md`, `live-ops-notes.md` #5–#8.

## Mock drafts are destroyed when the human leaves the room

- Not "when the draft completes" — **the moment the human leaves, even mid-draft**. Both
  `/v1/draft/<id>` and `/v1/draft/<id>/picks` return 404/null immediately afterwards.
- Consequence: **no post-hoc capture of anything.** Post-draft checklists (PRD SC-3/SC-4), latency
  samplers, and convergence audits must all be run *while still in the room*. A completed mock cannot
  be replayed, re-read, or debugged later.
- QA hit the other half of this: attaching to a purged mock id is a clean live 404 path
  (`draft-not-found`), which is a usable error-path test but not a substitute for a live draft.

## Bots and the 90 s autopick will finish the draft without you

- If the human idles, bots plus the 90 s autopick blitz the whole draft. Two mock rehearsals were
  consumed on autopilot during one ops incident.
- Rehearsal protocol: have the app running and **attached before the room fills**. The draft waits
  for no one, and each wasted mock costs one of the PRD's ≥3 required rehearsals.

## Solo mock `draft_order` does carry the human's `user_id`

- Verified live: `{user_id: 8}`. Seat auto-detection works in mocks when a username is stored — the
  PRD's AS-1 residual is resolved. The manual slot picker remains the fallback, not the default path.

## Mocks cannot express traded picks

- A mock has `league_id: null`, therefore no `slot_to_roster_id`, and traded picks resolve through
  `roster_id`s. A "mock draft with a traded pick" is not a shape Sleeper ever produces.
- Fixture consequence (kept in the repo): one 150-pick script emitted as **two bundles** — a mock
  bundle (`league_id: null`, `picked_by: ""`, `roster_id: null`) carrying seat-only attribution, and
  a real-league bundle carrying `slot_to_roster_id`, real `picked_by`/`roster_id` and two traded
  picks. Do not "simplify" these into one bundle.

## Granular scoring lives only on the league object

- No draft object of either kind carries `scoring_settings`. The per-stat dict (~81 keys) is only on
  `/v1/league/<id>`; a draft carries the coarse `metadata.scoring_type` label. A mock therefore has
  no granular source at all, which is why the scoring-format check has a label-only fallback branch.

## Spellings that differ from the obvious guess

- Team defenses: the player dump uses `position: "DEF"` (not `DST`) with `player_id` = the team
  abbreviation (`"ARI"`), and no `full_name`. Roster slot key is `slots_def`, not `slots_dst`.
- Internally the app normalizes to `DST`; `mapSleeperPosition` accepts both.

## Perceived pick lag (~8 s) is mostly not ours — but it is unmeasured

- User-reported ~8 s from the Sleeper room to the app. Our bounded share is ≤1 s poll + 0.4 s burst
  debounce + ~0.1–0.4 s sim + paint ≈ ≤2 s (measured: p95 pick lag 1 ms, burst latency ~414 ms at a
  150-pick board).
- Remainder is suspected Sleeper REST propagation lag versus its private room websocket. **Not yet
  measured** — the sampler (compare a pick's `last_picked` stamp against its first visibility in the
  REST response) exists but the draft was purged before it ran. Run it during the next live mock,
  before drawing any conclusion about app slowness.
- The user judges latency against the websocket-fresh Sleeper room, so an "as of Sleeper API, Xs ago"
  stamp would attribute the gap correctly.

## Budget

- Per-IP request budget ≤120 req/min (real limit ~1000). Measured: 59 req/60 s single instance; two
  instances back off to 41 + 39 = 80/min combined. Only `/picks` is refetched per poll — never the
  draft object, traded picks, or the ~14 MB player dump.
