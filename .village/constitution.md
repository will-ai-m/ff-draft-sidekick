# Constitution — willy-ff (Draft Sidekick)

Project conventions every Village agent must respect. Checkers cite this file; violations are gate failures.

## Commands

- test: `npm test`
- lint: `npm run lint`
- typecheck: `npm run typecheck`

## Conventions

- The PRD is law: `prd/draft-sidekick/prd.md`. FR-1..FR-11 acceptance criteria are the spec of record; every 🔶 AS-N default in its §12 is a configurable parameter, not a constant to invent differently.
- Free-to-run only: no paid APIs, no hosted services, no auth. Local web app launched on demand (PRD §11 constraints).
- Sleeper API budget ≤120 req/min; stateless full-refetch sync (never incremental diffs); staleness is the cardinal sin — never present insights from a superseded board as current.
- Terms: use the PRD's §9 "Terms used by the requirements" vocabulary (board, window, need vector, candidate list, opponent panel, roster panel, pick feed, sync indicator) in code identifiers and docs.
- Snapshots (ECR/ADP) are immutable during an attached draft.

## Overrides

- circuit_breaker_cap: 30    # max subagent calls per task
