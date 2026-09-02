# Draft Sidekick — the full guide

The [README](../README.md) is deliberately just the start-the-app steps. Everything else about
*using* Sidekick well lives here. (Design rationale and requirements live in [prd/](../prd/).)

## What this project is

Fantasy football draft intelligence. Two aspects, one system:

1. **Super-consensus draft ranking** — an overall draft ranking aggregating *all* experts
   (FantasyPros ECR and beyond), retaining per-source variance and staleness instead of collapsing
   to a mean. The value function.
2. **Draft Sidekick** — a live draft assistant that recommends your next pick by modeling every
   other manager in the room (see [prd/](../prd/)). The game-theory layer on top of the value
   function.

Draft Sidekick is a local, free-to-run web app that attaches to a live Sleeper draft (league or
mock), keeps a **board** in sync automatically, and puts a fresh-ECR **candidate list** (with one
highlighted, reasoned recommendation), an **opponent panel** (needs and tendencies for every team
picking before your next turn), your **roster panel**, the **pick feed**, a **sync indicator**,
and one-click player game logs on a single screen. It never writes to Sleeper — the Sleeper draft
room stays the only place you actually make a pick.

No Sleeper login and no API key are needed: the Sleeper API Sidekick reads is public.

## Running a draft

1. Start the app (see the [README](../README.md)) and open the web URL it prints.
2. Paste the draft's Sleeper URL or ID. Entering your Sleeper username (saved in your browser for
   next time) lets Sidekick auto-detect your seat from the draft order and offers a convenience
   list of that username's discoverable season drafts — pasting the URL/ID is always the primary
   path and works without it.
3. Confirm it's the right draft: Sidekick shows the draft's teams and owners (bot/empty seats by
   slot number) before any insight renders. If your seat can't be auto-detected, pick it from the
   slot picker — required before mine-vs-opponent, next-pick, or survival output will show.
4. Review the pre-draft check (below), then click **Start drafting**.
5. The five surfaces update live as picks land, each within a few seconds: the candidate list,
   opponent panel, roster panel, pick feed, and sync indicator.
6. If you ever distrust the board, click **Re-sync** to force an immediate full rebuild from
   Sleeper's complete pick list instead of waiting for the next poll.
7. Click **Detach** when the draft ends or before attaching to a different one — one running
   instance holds exactly one draft at a time.

## The pre-draft ritual

Before you confirm a draft, the attach screen runs a pre-draft check:

- The FantasyPros ECR and Fantasy Football Calculator ADP snapshots' capture dates and ages,
  warning when either is more than 24 hours old. Both are fetched fresh at attach and then held
  immutable for the rest of that draft — there is no mid-draft re-fetch, so there's no separate
  manual "refresh rankings" step; attaching close to when the draft actually starts *is* the
  refresh.
- Which ADP pool was used (nearest team-count match to your league) and whether the snapshot
  carries K/DST rankings.
- Any snapshot entries that couldn't be matched to a Sleeper player, and any matched players with
  no ADP entry (sampled by ECR order within position instead).
- A warning if your league's actual scoring settings diverge from half-PPR — v1's rankings are
  half-PPR only.
- The league's **FLEX demand split** — which positions the engine will treat as FLEX candidates
  all draft, derived from your league's own scoring (a 10-team half-PPR room reads RB 40% · WR
  60% · TE 0%: a second tight end is a bench pick there, never a FLEX play). Pin it with
  `flexShareOverride` in `config.local.json` if you disagree with the curves.

## Mock-rehearsal workflow

Per the PRD (§14), live Sleeper mock drafts are the validation gate before trusting Sidekick in a
real draft — join the mock on Sleeper itself first (that requires a Sleeper account on Sleeper's
side), then paste its URL/ID into Sidekick as usual:

- Run at least 3 full mock-draft rehearsals end to end (attach through the last pick) before your
  first real draft of a season.
- Hard gate: zero non-converging board states in a qualifying rehearsal — any player Sidekick
  still shows available after Sleeper's pick list has already reported them drafted, or attributed
  to the wrong team, blocks real-draft use until fixed.
- After every mock and every real draft, record the post-draft checklist by hand, outside the app
  (by design — there's no in-app feature for this): how many times you had to manually intervene,
  and whether you felt fully informed on every pick. This is a deliberate gut-check, not busywork.
  `npm run trace:report` (see [OBSERVABILITY.md](OBSERVABILITY.md)) gives you the objective half:
  latency bars, degraded episodes, and what was recommended when.

## Configuration

Copy `config.local.json.example` to `config.local.json` (gitignored) and edit only the values you
want to change — poll cadence, candidate-list length, Monte Carlo run count, survival bands, and
every other tunable default. Anything you leave out, or delete, keeps its documented default. An
unrecognised key or wrong-typed value is a startup error, not a silent no-op. Changes take effect
on the next server restart. Defaults and provenance live in
`packages/shared/src/config/parameters.ts`.

## Troubleshooting

**Sync indicator shows degraded.** A poll to Sleeper failed, or came back inconsistent with what
Sidekick already knew (pick count went down, a pick's player/team changed, a pick number arrived
out of sequence). Sidekick keeps retrying automatically and performs a full re-ingest the moment a
poll succeeds again — no action needed. To force the board back immediately instead of waiting for
the next poll, click **Re-sync**.

**"No rankings loaded" / candidate list disabled.** The FantasyPros ECR snapshot failed to load at
attach (e.g., the site was unreachable). Board sync, the roster panel, and the pick feed keep
working normally; the candidate list, survival percentages, and recommendations stay disabled
until a snapshot loads. Because snapshots are immutable for the life of an attached draft, the fix
is to Detach and re-attach (which fetches a fresh snapshot), not to wait it out.

**Running two drafts the same night.** One running instance attaches to exactly one draft. For a
second, simultaneous draft, start a second instance on a second port —
`PORT=3002 scripts/start-app.sh` — and attach to the second draft there. Both instances share the
same per-IP Sleeper rate budget, so each automatically raises its own poll interval to stay under
the shared limit — nothing to configure.

**What exactly happened during that draft?** Every run writes a complete flight-recorder trace to
`data/traces/`. See [OBSERVABILITY.md](OBSERVABILITY.md).
