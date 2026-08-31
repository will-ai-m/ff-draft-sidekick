/**
 * T15 — the capstone: one full 10-team, 15-round draft replayed through the real server.
 *
 * Everything below reads a single replay per bundle (they are expensive, and every assertion is a
 * different question about the same run). The replay itself is in `e2eReplay.ts`; the invariants it
 * checks on **every** broadcast are documented there. These tests assert §T15's five "done when"
 * clauses on top of that, plus the run-shape claims — burst-final recompute, degraded and
 * recovery, Re-sync, suppression after the user's last pick — the task's own brief names.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { AppStateSnapshot } from '@sidekick/shared';

import {
  InvariantChecker,
  attachAtFullBoard,
  createE2eMswServer,
  replayDraft,
  type ReplayResult,
} from './e2eReplay';
import {
  E2E_TRADED_PICKS,
  USER_SLOT,
  e2eBoard,
  expectedOwnerSlot,
  roundForPick,
  slotForPick,
  userPickNumbers,
} from './fixtures/e2eDraft';
import type { Harness } from './harness';

const server = createE2eMswServer();
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'bypass' });
});
afterAll(() => {
  server.close();
});

const TOTAL_PICKS = e2eBoard.pickScript.length;
const USER_PICKS = userPickNumbers();
const LAST_USER_PICK = USER_PICKS.at(-1)!;

const mark = (replay: ReplayResult, name: string): AppStateSnapshot => {
  const snapshot = replay.marks[name];
  if (snapshot === undefined) throw new Error(`the replay never recorded a "${name}" snapshot`);
  return snapshot;
};

// =============================================================================================
// The mock draft — design.md §T15's headline fixture (AC-4's seat-only attribution)
// =============================================================================================

describe('a full mock draft, replayed through the real orchestrator', () => {
  let replay: ReplayResult;
  let fullBoard: { harness: Harness; snapshot: AppStateSnapshot };

  beforeAll(async () => {
    replay = await replayDraft({ variant: 'mock', server });
    fullBoard = await attachAtFullBoard({ variant: 'mock', server });
  }, 120_000);

  afterAll(() => {
    replay.harness.dispose();
    fullBoard.harness.dispose();
  });

  // -------------------------------------------------------------------------------------------
  // 1. Convergence — SC-1's counter-metric as an automated check
  // -------------------------------------------------------------------------------------------

  it('converges: the final board is exactly the fixture’s end state, player for player', () => {
    const final = mark(replay, 'final');
    const drafted = Object.entries(final.board.players)
      .filter(([, state]) => state.drafted)
      .map(([playerId]) => playerId);

    expect(drafted.sort()).toEqual([...e2eBoard.pickScript].sort());
    expect(final.pickFeed).toHaveLength(TOTAL_PICKS);
    expect(final.pickFeed.map((entry) => entry.playerId)).toEqual(e2eBoard.pickScript);

    // …and nothing the fixture did not draft is marked drafted: every remaining snapshot player
    // is still available, which is the other half of "no player shown available that the fixture
    // drafted and vice versa".
    const draftedSet = new Set(e2eBoard.pickScript);
    const stillAvailable = e2eBoard.players.filter((player) => !draftedSet.has(player.id));
    expect(stillAvailable.length).toBeGreaterThan(40);
    for (const player of stillAvailable) {
      expect(final.board.players[player.id]?.drafted ?? false).toBe(false);
    }

    expect(final.sync.draftStatus).toBe('complete');
  });

  it('records zero non-converging board states across every broadcast of the replay', () => {
    expect(replay.checker.violations).toEqual([]);
    // The invariants are only worth anything if they actually ran on a real stream of states.
    expect(replay.checker.checked).toBeGreaterThan(60);
    expect(replay.broadcasts).toBeGreaterThan(60);
    const picksSeen = replay.timeline.map((event) => event.picksOnBoard);
    expect(Math.max(...picksSeen)).toBe(TOTAL_PICKS);
    expect([...picksSeen].sort((a, b) => a - b)).toEqual(picksSeen);
  });

  it('rebuilds the same board from the full pick list alone, however it arrived (AC-13)', () => {
    const replayed = mark(replay, 'final');
    const attached = fullBoard.snapshot;

    expect(attached.board.players).toEqual(replayed.board.players);
    expect(attached.pickFeed).toEqual(replayed.pickFeed);
    expect(attached.userRoster.data).toEqual(replayed.userRoster.data);
    expect(attached.opponentPanel.data.window).toEqual(replayed.opponentPanel.data.window);
    expect(attached.candidateList.data.rows.map((row) => row.playerId)).toEqual(
      replayed.candidateList.data.rows.map((row) => row.playerId),
    );
  });

  // -------------------------------------------------------------------------------------------
  // 2. The burst collapses to one recompute
  // -------------------------------------------------------------------------------------------

  it('recomputes once for a burst of three picks, not three times (AC-46, AC-53)', () => {
    expect(replay.burst.insideWindowCount).toBe(replay.burst.beforeCount);
    expect(replay.burst.afterSettleCount).toBe(replay.burst.beforeCount + 1);

    // AC-21 in the interim: the board is already current, the insights say they are not.
    const during = mark(replay, 'duringBurst');
    expect(during.pickFeed).toHaveLength(replay.burst.picks.at(-1)!);
    expect(during.candidateList.recomputing).toBe(true);
    expect(during.opponentPanel.recomputing).toBe(true);
    expect(during.userRoster.recomputing).toBe(true);
    expect(during.candidateList.data.rows.length).toBeGreaterThan(0);

    const after = mark(replay, 'afterBurst');
    expect(after.candidateList.recomputing).toBe(false);
    expect(after.candidateList.boardVersion).toBe(after.sync.boardVersion);
  });

  it('marks insights recomputing many times over the draft, and always settles them', () => {
    const flagged = replay.timeline.filter((event) => event.recomputing);
    expect(flagged.length).toBeGreaterThan(10);
    expect(replay.timeline.at(-1)?.recomputing).toBe(false);
  });

  // -------------------------------------------------------------------------------------------
  // 3. The recommendation actually moves, and never names a drafted player
  // -------------------------------------------------------------------------------------------

  it('updates the recommendation as the board moves', () => {
    const highlights = replay.timeline
      .map((event) => event.highlightPlayerId)
      .filter((id): id is string => id !== null);
    expect(new Set(highlights).size).toBeGreaterThan(8);

    // Every highlight the replay ever published was a real, snapshot-matched player.
    const known = new Set(e2eBoard.players.map((player) => player.id));
    for (const id of highlights) expect(known.has(id)).toBe(true);
  });

  it('suppresses survival and lookahead once the user has no pick left (AC-45, AC-59)', () => {
    const afterLast = mark(replay, 'afterUserFinalPick');
    expect(afterLast.pickFeed.length).toBeGreaterThanOrEqual(LAST_USER_PICK);
    expect(afterLast.opponentPanel.data.window.nextUserPickNo).toBeNull();
    expect(afterLast.candidateList.data.rows.length).toBeGreaterThan(0);
    for (const row of afterLast.candidateList.data.rows) expect(row.survival).toBeNull();
    expect(afterLast.candidateList.data.planComparison?.applicable).toBe(false);
    // 2026-08-28 amendment: with the starters full, the final pick's reason is the bench
    // thinnest-position rule rather than the bare AC-59 sentence — the plan comparison above is
    // still not applicable, which is the substance of AC-59.
    expect(afterLast.candidateList.data.reasonKind).toBe('bench-depth');
  });

  it('keeps the user’s own roster panel in step with their fifteen picks', () => {
    const final = mark(replay, 'final');
    const userPicks = final.pickFeed.filter((entry) => entry.isUserPick);
    expect(userPicks.map((entry) => entry.pickNo)).toEqual(USER_PICKS);
    expect(final.userRoster.data?.teamId).toBe(`slot-${USER_SLOT}`);
    // Fifteen rounds, fifteen picks: every starting slot filled and the bench full.
    expect(final.userRoster.data?.benchCount).toBe(6);
    expect(final.userRoster.data?.needVector).toBe('no-need-signal');
  });

  // -------------------------------------------------------------------------------------------
  // 4. The unmatched player (AC-20)
  // -------------------------------------------------------------------------------------------

  it('shows the unmatched pick under its raw Sleeper name and keeps it out of the rankings', () => {
    const unmatched = e2eBoard.unmatchedPlayer;
    const final = mark(replay, 'final');

    const entry = final.pickFeed.find((pick) => pick.playerId === unmatched.id);
    expect(entry).toBeDefined();
    expect(entry?.playerName).toBe(unmatched.name);
    expect(entry?.matchedToSnapshot).toBe(false);
    expect(entry?.pickNo).toBe(e2eBoard.unmatchedAtPickNo);

    // Everyone else in the feed matched, so the flag means something.
    const unmatchedEntries = final.pickFeed.filter((pick) => !pick.matchedToSnapshot);
    expect(unmatchedEntries).toHaveLength(1);

    // It was flagged from the very first snapshot that carried the pick, not only at the end.
    const atThePick = mark(replay, 'afterUnmatchedPick');
    expect(atThePick.pickFeed.at(-1)?.playerId).toBe(unmatched.id);
    expect(atThePick.pickFeed.at(-1)?.matchedToSnapshot).toBe(false);

    // …and never entered a rankings-driven output at any point — the checker asserts this on
    // every broadcast; this pins the end state as well.
    const named = [
      ...final.candidateList.data.rows.map((row) => row.playerId),
      ...Object.values(final.candidateList.data.rowsByPosition ?? {}).flatMap((rows) =>
        (rows ?? []).map((row) => row.playerId),
      ),
    ];
    expect(named).not.toContain(unmatched.id);
  });

  it('never lets a drafted player occupy a candidate row or the highlight (AC-53)', () => {
    const final = mark(replay, 'final');
    for (const row of final.candidateList.data.rows) {
      expect(final.board.players[row.playerId]?.drafted ?? false).toBe(false);
    }
    // 206 snapshot players minus the 149 of them the fixture drafted leaves a real list, so the
    // assertion above is not passing on an empty one.
    expect(final.candidateList.data.rows.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------------------------------------------------
  // 5. Degraded, recovery and Re-sync
  // -------------------------------------------------------------------------------------------

  it('goes degraded on a malformed payload and recovers on the next good poll (AC-17, AC-18)', () => {
    const degraded = mark(replay, 'degradedMalformed');
    expect(degraded.sync.status).toBe('degraded');
    expect(degraded.sync.degradedReason).toBeTruthy();
    expect(degraded.userRoster.degraded).toBe(true);
    expect(degraded.opponentPanel.degraded).toBe(true);
    expect(degraded.candidateList.degraded).toBe(true);

    const recovered = mark(replay, 'recoveredFromMalformed');
    expect(recovered.sync.status).toBe('healthy');
    expect(recovered.sync.degradedReason).toBeNull();
    expect(recovered.pickFeed.length).toBe(degraded.pickFeed.length + 3);
    expect(recovered.candidateList.degraded).toBe(false);
    expect(recovered.candidateList.recomputing).toBe(false);
  });

  it('goes degraded when the pick list contradicts the board, without applying it (AC-17)', () => {
    const before = mark(replay, 'recoveredFromMalformed');
    const degraded = mark(replay, 'degradedInconsistent');
    expect(degraded.sync.status).toBe('degraded');
    expect(degraded.sync.degradedReason).toContain('picks');
    // No partial apply: the board is untouched by the bad response (AC-18).
    expect(degraded.pickFeed).toEqual(before.pickFeed);

    const recovered = mark(replay, 'recoveredFromInconsistent');
    expect(recovered.sync.status).toBe('healthy');
    expect(recovered.pickFeed).toEqual(before.pickFeed);
    expect(replay.degradedEpisodes).toBe(2);

    // Pinned deliberately, because it is a behaviour a reader would otherwise assume away: the
    // recovering re-ingest bumps `boardVersion` even though it brought no new picks, and no
    // cascade is triggered without new picks — so the panels stay honestly flagged behind the
    // board until the next pick (or a Re-sync) rebuilds them. Never *stale-presented-as-current*,
    // which is what AC-21 requires; see dev-notes-T15 for why that is flagged, not changed here.
    expect(recovered.sync.boardVersion).toBeGreaterThan(degraded.sync.boardVersion);
    expect(recovered.candidateList.recomputing).toBe(true);
  });

  it('re-syncs out of cadence, inside the AC-19 budget, and catches every outstanding pick', () => {
    const before = mark(replay, 'recoveredFromInconsistent');
    const after = mark(replay, 'afterResync');
    expect(replay.resyncMs).toBeLessThan(replay.harness.config.resyncTimeoutMs);
    expect(after.pickFeed.length).toBe(before.pickFeed.length + 7);
    // A Re-sync is an explicit refresh: it must not leave the user looking at stale panels.
    expect(after.candidateList.recomputing).toBe(false);
    expect(after.candidateList.boardVersion).toBe(after.sync.boardVersion);
  });

  // -------------------------------------------------------------------------------------------
  // 6. Observability (AC-66, AC-67)
  // -------------------------------------------------------------------------------------------

  it('recorded plausible pick-lag and burst-latency samples end to end (AC-66, AC-67)', () => {
    const metrics = replay.harness.orchestrator.metrics();

    expect(metrics.pickLag?.count ?? 0).toBeGreaterThan(0);
    expect(metrics.pickLag!.p95Ms).toBeGreaterThanOrEqual(0);
    expect(metrics.pickLag!.maxMs).toBeLessThan(replay.harness.config.pickReflectionLatencyMs);

    expect(metrics.burstLatency?.count ?? 0).toBeGreaterThan(0);
    expect(metrics.burstLatency!.p95Ms).toBeGreaterThanOrEqual(0);
    expect(metrics.burstLatency!.maxMs).toBeLessThan(replay.harness.config.insightRefreshLatencyMs);

    const bursts = metrics.samples.filter((sample) => sample.type === 'burst-refreshed');
    expect(bursts.length).toBeGreaterThan(0);
    // The deliberate three-pick burst is in there, coalesced rather than split into three.
    expect(bursts.some((sample) => 'pickCount' in sample && sample.pickCount === 3)).toBe(true);
  });

  // -------------------------------------------------------------------------------------------
  // 7. The invariants themselves — "zero violations" is only worth something if they can fire
  // -------------------------------------------------------------------------------------------

  describe('the invariant checker', () => {
    const freshChecker = (): InvariantChecker =>
      new InvariantChecker({ ownerSlotFor: slotForPick, lastUserPickNo: LAST_USER_PICK });

    const mutated = (change: (snapshot: AppStateSnapshot) => void): AppStateSnapshot => {
      const copy = structuredClone(fullBoard.snapshot) as AppStateSnapshot;
      change(copy);
      return copy;
    };

    it('passes the unmutated snapshot', () => {
      const checker = freshChecker();
      checker.check('control', fullBoard.snapshot);
      expect(checker.violations).toEqual([]);
    });

    it('catches a board that drafted somebody the fixture never picked', () => {
      const checker = freshChecker();
      const available = e2eBoard.players.find(
        (player) => !new Set(e2eBoard.pickScript).has(player.id),
      )!;
      checker.check(
        'mutant',
        mutated((snapshot) => {
          snapshot.board.players[available.id] = { drafted: true, pickNo: 151 };
        }),
      );
      expect(checker.violations.join('\n')).toContain('the fixture never picked');
    });

    it('catches a board that went backwards', () => {
      const checker = freshChecker();
      checker.check('full', fullBoard.snapshot);
      checker.check(
        'shrunk',
        mutated((snapshot) => {
          const last = snapshot.pickFeed.pop()!;
          delete snapshot.board.players[last.playerId];
        }),
      );
      expect(checker.violations.join('\n')).toContain('board shrank');
    });

    it('catches a pick attributed to the wrong seat', () => {
      const checker = freshChecker();
      checker.check(
        'mutant',
        mutated((snapshot) => {
          snapshot.pickFeed[0]!.teamId = 'slot-9';
        }),
      );
      expect(checker.violations.join('\n')).toContain('attributed to slot-9');
    });

    it('catches an insight presented as current from a superseded board (AC-21)', () => {
      const checker = freshChecker();
      checker.check(
        'mutant',
        mutated((snapshot) => {
          snapshot.sync.boardVersion += 1;
        }),
      );
      expect(checker.violations.join('\n')).toContain('recomputing=false');
    });

    it('catches a drafted player occupying a candidate row (AC-53)', () => {
      const checker = freshChecker();
      checker.check(
        'mutant',
        mutated((snapshot) => {
          const row = snapshot.candidateList.data.rows[0]!;
          snapshot.candidateList.data.rows.push({ ...row, playerId: e2eBoard.pickScript[0]! });
        }),
      );
      expect(checker.violations.join('\n')).toContain('candidate row names drafted');
    });

    it('catches the unmatched player reaching a rankings-driven output (AC-20)', () => {
      const checker = freshChecker();
      checker.check(
        'mutant',
        mutated((snapshot) => {
          snapshot.candidateList.data.highlightPlayerId = e2eBoard.unmatchedPlayer.id;
        }),
      );
      expect(checker.violations.join('\n')).toContain('unmatched player reached');
    });

    it('catches survival still showing after the user’s last pick (AC-45)', () => {
      const checker = freshChecker();
      checker.check(
        'mutant',
        mutated((snapshot) => {
          snapshot.candidateList.data.rows[0]!.survival = {
            probability: 0.5,
            band: 'coin-flip',
          };
        }),
      );
      expect(checker.violations.join('\n')).toContain('still carry survival');
    });
  });

  it('kept the pre-draft check the user confirms on, warnings and all (FR-4)', () => {
    const attached = mark(replay, 'attached');
    expect(attached.preDraftCheck?.leagueSummary).toEqual({
      teamCount: e2eBoard.teams,
      scoringType: 'half_ppr',
      rounds: e2eBoard.rounds,
    });
    expect(attached.preDraftCheck?.ecrSnapshot?.ageHours ?? 99).toBeLessThan(24);
    expect(attached.preDraftCheck?.warnings.map((warning) => warning.code)).not.toContain(
      'snapshot-stale',
    );
    // AC-26's distinct list: matched players the ADP feed carries no row for.
    expect(attached.preDraftCheck?.playersMissingAdp.length).toBeGreaterThan(0);
    expect(attached.board.teams).toHaveLength(e2eBoard.teams);
    expect(attached.attach.isMock).toBe(true);
  });
});

// =============================================================================================
// The same 150 picks as a real league — the only bundle Sleeper can express a trade in (AC-12)
// =============================================================================================

describe('the same draft as a real league, with traded picks', () => {
  let replay: ReplayResult;

  beforeAll(async () => {
    replay = await replayDraft({ variant: 'league', server });
  }, 120_000);

  afterAll(() => {
    replay.harness.dispose();
  });

  it('replays clean under the same invariants, trades and all', () => {
    expect(replay.checker.violations).toEqual([]);
    expect(mark(replay, 'final').pickFeed).toHaveLength(TOTAL_PICKS);
  });

  it('attributes a traded pick to its current owner, not the seat on the clock (AC-12)', () => {
    const final = mark(replay, 'final');

    for (const traded of E2E_TRADED_PICKS) {
      const entries = final.pickFeed.filter(
        (entry) =>
          entry.round === traded.round && expectedOwnerSlot(entry.pickNo) !== entry.draftSlot,
      );
      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.teamId).toBe(`slot-${expectedOwnerSlot(entry.pickNo)}`);
        expect(entry.teamId).not.toBe(`slot-${entry.draftSlot}`);
        expect(final.board.players[entry.playerId]?.draftedByTeamId).toBe(entry.teamId);
      }
    }
  });

  it('carries the trade into the window the opponent panel and the simulation read (AC-12)', () => {
    // Seat 7's round-5 pick is overall 47, inside the window between the user's picks 44 and 57.
    const tradedPickNo = 47;
    expect(roundForPick(tradedPickNo)).toBe(5);
    expect(slotForPick(tradedPickNo)).toBe(7);
    expect(expectedOwnerSlot(tradedPickNo)).toBe(2);

    const duringBurst = mark(replay, 'duringBurst');
    expect(duringBurst.pickFeed.find((entry) => entry.pickNo === tradedPickNo)?.teamId).toBe(
      'slot-2',
    );

    // Before it was made, the window advertised the same owner — attribution and prediction
    // read one resolver, so the opponent panel never profiles the wrong seat.
    const beforeBurst = mark(replay, 'afterUserFifthPick');
    const windowEntry = beforeBurst.opponentPanel.data.entries.find(
      (entry) => entry.pickNo === tradedPickNo,
    );
    expect(windowEntry?.teamId).toBe('slot-2');
  });

  it('reads the league’s own granular scoring settings rather than the named table (AC-64)', () => {
    const attached = mark(replay, 'attached');
    expect(attached.attach.isMock).toBe(false);
    expect(attached.board.teams.map((team) => team.ownerDisplayName)).not.toContain(null);
    expect(attached.preDraftCheck?.leagueSummary?.scoringType).toBe('half_ppr');
  });
});
