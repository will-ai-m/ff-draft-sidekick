---
id: "005"
slug: small-cleanups-from-review-sweep
type: null
size: null
status: queued
depends_on: []
created: 2026-08-24
---
# Small cleanups from the review sweep and QA observations

Batch of non-blocking findings from the code-review sweep and QA (task 001; evidence in the review-round outputs and `qa.md`):

- `postDetach` (`packages/web/src/state/api.ts`) is the only network call with no try/catch and no `response.ok` check; its caller ignores the promise — failures are silent. Align with `postResync`'s handling.
- `TendencyProfileTracker.bpaDistribution()` ignores `isDiscarded`, contradicting the class's own discard contract (`tendencies/profiles.ts`).
- `zeroByPosition` is hand-written three times (`shared/needvector.ts`, `server/tendencies/profiles.ts`, `server/roster/needvectors.ts`) — derive once from `POSITIONS`.
- Dead code: `SUPPORTED_SCORING_KEYS` export (`gamelogs/scoring.ts`), `AttachFailure.input` and `DraftSummary.startTime` produced but never consumed (`web/state/api.ts` ↔ `AttachScreen.tsx`); AttachScreen doc comment describes an input-echo mechanism the component doesn't use.
- `OpponentPanel.tsx` display thresholds (5 constants) hardcoded outside `parameters.ts` — either move or record the display-copy exemption in the constitution.
- No-rankings mode badges every pick UNMATCHED with a per-row note (40 notes of noise — QA #2); collapse to one banner when no snapshot is loaded.
- `body` has no background color — scrolling past the container shows white under the dark UI (QA #3).
