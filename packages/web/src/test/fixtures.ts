/**
 * `AppStateSnapshot` fixtures for the web suite.
 *
 * The shape is T10's, verbatim — the frontend consumes what the server ships and never reshapes
 * it, so these builders exist only to spell one out compactly, not to define a second contract.
 */
import { PARAMETER_DEFAULTS } from '@sidekick/shared';
import type {
  AppStateSnapshot,
  CandidateListData,
  Insight,
  OpponentPanelData,
  PickFeedEntry,
  PreDraftCheckData,
  RosterPanelData,
  Team,
} from '@sidekick/shared';

export const insight = <T>(
  data: T,
  options: { boardVersion?: number; recomputing?: boolean; degraded?: boolean } = {},
): Insight<T> => ({
  data,
  boardVersion: options.boardVersion ?? 1,
  recomputing: options.recomputing ?? false,
  degraded: options.degraded ?? false,
});

/**
 * Four seats covering every case AC-2 names: a named owner, the user's own seat, a mock bot, and
 * an empty seat the API gives no name for at all.
 */
export const makeTeams = (): Team[] => [
  {
    teamId: 'slot-1',
    draftSlot: 1,
    displayName: 'Gridiron Gurus',
    ownerDisplayName: 'dynastydan',
    isBotSeat: false,
    userId: '111',
    rosterId: 1,
    isUser: false,
  },
  {
    teamId: 'slot-2',
    draftSlot: 2,
    displayName: 'Willy Wildcats',
    ownerDisplayName: 'willyu',
    isBotSeat: false,
    userId: '222',
    rosterId: 2,
    isUser: true,
  },
  {
    teamId: 'slot-3',
    draftSlot: 3,
    displayName: null,
    ownerDisplayName: null,
    isBotSeat: true,
    userId: null,
    rosterId: null,
    isUser: false,
  },
  {
    teamId: 'slot-4',
    draftSlot: 4,
    displayName: null,
    ownerDisplayName: null,
    isBotSeat: false,
    userId: null,
    rosterId: null,
    isUser: false,
  },
];

export const makePickFeed = (): PickFeedEntry[] => [
  {
    pickNo: 1,
    round: 1,
    draftSlot: 1,
    teamId: 'slot-1',
    playerId: '9221',
    playerName: 'Jahmyr Gibbs',
    position: 'RB',
    isUserPick: false,
    matchedToSnapshot: true,
  },
  {
    pickNo: 2,
    round: 1,
    draftSlot: 2,
    teamId: 'slot-2',
    playerId: '7564',
    playerName: "Ja'Marr Chase",
    position: 'WR',
    isUserPick: true,
    matchedToSnapshot: true,
  },
];

export const makeRosterPanel = (): RosterPanelData => ({
  teamId: 'slot-2',
  slots: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 1, K: 1, DST: 1, BN: 6 },
  filledStartingSlots: { QB: 0, RB: 0, WR: 1, TE: 0, K: 0, DST: 0 },
  filledFlexSlots: 0,
  unfilledStartingSlots: {
    dedicated: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DST: 1 },
    flex: 1,
  },
  needVector: { QB: 1, RB: 2, WR: 2, TE: 1, K: 0, DST: 0 },
  benchCount: 0,
  benchSlots: 6,
});

export const makeOpponentPanel = (): OpponentPanelData => ({
  window: {
    picks: [{ pickNo: 3, round: 1, teamId: 'slot-3' }],
    userOnTheClock: false,
    inProgressPickNo: 3,
    currentUserPickNo: null,
    nextUserPickNo: 19,
  },
  entries: [],
});

export const makeCandidateList = (
  overrides: Partial<CandidateListData> = {},
): CandidateListData => ({
  rows: [],
  highlightPlayerId: null,
  reason: null,
  reasonKind: null,
  planComparison: null,
  disabledReason: null,
  ...overrides,
});

/**
 * A pre-draft check carrying one of every surface FR-4 puts on it: both snapshot ages (the ECR one
 * past the 24 h staleness window), a substituted ADP pool, a scoring-format mismatch, an unmatched
 * entry and a matched-but-ADP-less player.
 */
export const makePreDraftCheck = (
  overrides: Partial<PreDraftCheckData> = {},
): PreDraftCheckData => ({
  ecrSnapshot: {
    source: 'https://www.fantasypros.com/nfl/rankings/half-point-ppr-cheatsheets.php',
    capturedAt: '2026-08-20T12:00:00.000Z',
    ageHours: 30,
  },
  adpSnapshot: {
    source: 'https://fantasyfootballcalculator.com/api/v1/adp/half-ppr',
    capturedAt: '2026-08-21T12:00:00.000Z',
    ageHours: 6,
    poolDescription: '12-team half-PPR pool (no 11-team pool exists)',
  },
  unmatchedEntries: [{ name: 'Bucky Irving', position: 'RB', source: 'ecr' }],
  playersMissingAdp: [{ playerId: '11604', name: 'Brock Bowers' }],
  warnings: [
    { code: 'snapshot-stale', message: 'The ECR snapshot is 30 h old (warning above 24 h).' },
    { code: 'adp-pool-substituted', message: 'Using the 12-team ADP pool for an 11-team league.' },
    {
      code: 'scoring-format-mismatch',
      message: 'This league scores ppr; the rankings are half-PPR.',
    },
  ],
  leagueSummary: {
    teamCount: 10,
    scoringType: 'half_ppr',
    rounds: 15,
    flexShare: { share: { RB: 0.4, WR: 0.6, TE: 0 }, source: 'league-scoring' },
  },
  ...overrides,
});

/** A complete, attached snapshot. Every builder above is overridable field by field. */
export function makeSnapshot(overrides: Partial<AppStateSnapshot> = {}): AppStateSnapshot {
  return {
    attach: { status: 'attached', draftId: '1234567890', isMock: true, userTeamId: 'slot-2' },
    sync: {
      lastSuccessfulSyncAt: '2026-08-21T18:00:00.000Z',
      status: 'healthy',
      boardVersion: 1,
      draftStatus: 'drafting',
      degradedReason: null,
    },
    board: {
      players: {
        '9221': { drafted: true, draftedByTeamId: 'slot-1', pickNo: 1 },
        '7564': { drafted: true, draftedByTeamId: 'slot-2', pickNo: 2 },
      },
      teams: makeTeams(),
    },
    pickFeed: makePickFeed(),
    userRoster: insight<RosterPanelData | null>(makeRosterPanel()),
    opponentPanel: insight(makeOpponentPanel()),
    candidateList: insight(makeCandidateList()),
    preDraftCheck: makePreDraftCheck(),
    config: PARAMETER_DEFAULTS,
    ...overrides,
  };
}

/** The shape the server publishes before anything is attached (orchestrator's own empty state). */
export function makeUnattachedSnapshot(
  overrides: Partial<AppStateSnapshot> = {},
): AppStateSnapshot {
  return makeSnapshot({
    attach: { status: 'not-attached' },
    sync: {
      lastSuccessfulSyncAt: null,
      status: 'healthy',
      boardVersion: 0,
      draftStatus: null,
      degradedReason: null,
    },
    board: { players: {}, teams: [] },
    pickFeed: [],
    userRoster: insight<RosterPanelData | null>(null, { boardVersion: 0 }),
    opponentPanel: insight(
      {
        window: {
          picks: [],
          userOnTheClock: false,
          inProgressPickNo: null,
          currentUserPickNo: null,
          nextUserPickNo: null,
        },
        entries: [],
      },
      { boardVersion: 0 },
    ),
    candidateList: insight(makeCandidateList(), { boardVersion: 0 }),
    preDraftCheck: null,
    ...overrides,
  });
}
