---
type: feature
size: large
route: feature
---
## Rationale

- **Scope spans data integration, core simulation, and multi-panel UI.** Ingests three snapshot sources (Sleeper API, FantasyPros ECR, FFC ADP), implements stateless full-state sync, player matching, and cross-platform ID mapping (FR-1, FR-2, FR-4); core is Monte Carlo survival projection over a draft window with within-draft tendency learning (FR-7, FR-8); UI comprises five named surfaces (candidate list, opponent panel, roster panel, pick feed, player card) plus sync indicator and modal interactions (FR-2, FR-5, FR-6, FR-9, FR-11).

- **Crosses multiple subsystems:** API polling layer (Sleeper + web fetches), data normalization layer (snapshot matching, ID resolution), league-settings layer (read Sleeper draft/league config, compute need vectors, FLEX weighting), Monte Carlo simulation engine (position sampling by tendency-bent need vectors, ADP rank lookup, survive-to-next-pick logic), and interactive React/TypeScript UI with real-time sync indication and degraded-state handling.

- **Type = feature:** builds new behavior (FR-1 through FR-11 define a tool that doesn't exist); not a restoration of intended prior behavior. Validation per PRD §14 requires ≥3 full live mock dress rehearsals with success criteria on board convergence, latency, and felt-informedness; first real draft gated on zero non-converging board state.

- **Size = large:** task is stated as the complete v1; constellation of FRs with interdependencies (FR-3 depends on FR-2, FR-8/FR-10 depend on FR-4/FR-7, FR-11 needs its own data pipeline). Constitution and PRD both contemplate this as a single task's subject, but the developer will likely discover natural decomposition points (e.g., attach-and-sync layer vs insights layer) during implementation. Blast radius spans a new application codebase once the architecture is designed.
