# willy-ff

Fantasy football draft intelligence. Two aspects, one system:

1. **Super-consensus draft ranking** — an overall draft ranking aggregating *all* experts (FantasyPros ECR and beyond), retaining per-source variance and staleness instead of collapsing to a mean. The value function.
2. **Draft Sidekick** — a live draft assistant that recommends your next pick by modeling every other manager in the room (see [prd/](prd/)). The game-theory layer on top of the value function.

## Layout

- [research/](research/) — consolidated fantasy research: multi-source 2026 draft notes, position factors, data-source survey, coaching-change analysis, FantasyPros rankings research, 2025 draft-vs-finish analysis.
- [prd/](prd/) — Draft Sidekick PRD. [v2](prd/draft-sidekick-prd-v2.md) is the frozen baseline; [v3-working](prd/draft-sidekick-prd-v3-working.md) is the living iteration doc.
