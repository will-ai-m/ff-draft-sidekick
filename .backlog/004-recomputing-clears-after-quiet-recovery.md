---
id: "004"
slug: recomputing-clears-after-quiet-recovery
type: null
size: null
status: queued
depends_on: []
created: 2026-08-24
---
# Recomputing flag must clear after a recovery that brings no new picks

Found at T15 (`dev-notes-T15.md`, pinned by a test), confirmed by QA (`qa.md` non-blocking #1) and spec_review (recorded as an uncovered case — no AC governs it): an automatic recovery re-ingest that finds no new picks bumps `boardVersion` but triggers no insight cascade, so every panel sits flagged RECOMPUTING until the next pick or a manual Re-sync. Bites hardest during a paused draft while the user is on the clock. Fix belongs in T2/T10 territory (`sleeper/sync.ts` listener firing / `orchestrator.ts` early-return on empty pick delta).
