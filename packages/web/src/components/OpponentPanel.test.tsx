import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { NO_NEED_SIGNAL } from '@sidekick/shared';
import type {
  Insight,
  OpponentPanelData,
  OpponentPanelEntry,
  Position,
  Team,
  TendencyProfile,
} from '@sidekick/shared';

import { OpponentPanel } from './OpponentPanel';

const wrap = <T,>(data: T, recomputing = false): Insight<T> => ({
  data,
  boardVersion: 7,
  recomputing,
  degraded: false,
});

const teams = (): Team[] => [
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
    teamId: 'slot-3',
    draftSlot: 3,
    displayName: 'Sunday Scaries',
    ownerDisplayName: 'scaryterry',
    isBotSeat: false,
    userId: '333',
    rosterId: 3,
    isUser: false,
  },
  {
    teamId: 'slot-4',
    draftSlot: 4,
    displayName: null,
    ownerDisplayName: null,
    isBotSeat: true,
    userId: null,
    rosterId: null,
    isUser: false,
  },
];

const share = (values: Partial<Record<Position, number>>): Record<Position, number> => ({
  QB: 0,
  RB: 0,
  WR: 0,
  TE: 0,
  K: 0,
  DST: 0,
  ...values,
});

/** The league baseline T6 computes: QB1 RB2 WR2 TE1 FLEX1 K1 DST1 = 9 starting slots. */
const leagueBaseline = (): Record<Position, number> =>
  share({ QB: 1 / 9, RB: 2 / 9, WR: 2 / 9, TE: 1 / 9, K: 1 / 9, DST: 1 / 9 });

const establishedProfile = (teamId: string): TendencyProfile => ({
  teamId,
  pickCount: 5,
  averageReach: 4.2,
  reachSampleCount: 5,
  needAdherence: 0.8,
  observedPositionalShare: share({ RB: 0.6, QB: 0.4 }),
  expectedPositionalShare: leagueBaseline(),
  confidence: 'established',
});

const earlyProfile = (teamId: string): TendencyProfile => ({
  teamId,
  pickCount: 2,
  averageReach: 0,
  reachSampleCount: 0,
  needAdherence: 1,
  observedPositionalShare: leagueBaseline(),
  expectedPositionalShare: leagueBaseline(),
  confidence: 'early',
});

/** Pick 26 — a team needing exactly one RB and one WR, with a real FR-7 bend applied. */
const needyEntry = (pickNo: number): OpponentPanelEntry => ({
  pickNo,
  round: 3,
  teamId: 'slot-3',
  unfilledStartingSlots: { dedicated: share({ RB: 1, WR: 1, K: 1 }), flex: 0 },
  needVector: share({ RB: 1, WR: 1 }),
  needDistribution: share({ RB: 0.5, WR: 0.5 }),
  bentDistribution: share({ QB: 0.05, RB: 0.6, WR: 0.3, TE: 0.05 }),
  remainingPicks: 13,
  kdstLikelihood: 0,
  mostLikelyPositions: [
    { position: 'RB', likelihood: 0.5, confidence: 'position' },
    { position: 'WR', likelihood: 0.5, confidence: 'position' },
  ],
  examplePlayers: [
    {
      playerId: '8155',
      playerName: 'Bijan Robinson',
      position: 'RB',
      adp: 3.2,
      confidence: 'player-example',
    },
    {
      playerId: '11565',
      playerName: 'Malik Nabers',
      position: 'WR',
      adp: 8.1,
      confidence: 'player-example',
    },
  ],
  tendencyProfile: establishedProfile('slot-3'),
});

/** Pick 27 — two picks in, so FR-7 is still on neutral priors (AC-39). */
const earlyEntry = (): OpponentPanelEntry => ({
  pickNo: 27,
  round: 3,
  teamId: 'slot-4',
  unfilledStartingSlots: { dedicated: share({ QB: 1, RB: 1, WR: 1, TE: 1 }), flex: 1 },
  needVector: share({ QB: 1, RB: 1 + 1 / 3, WR: 1 + 1 / 3, TE: 1 + 1 / 3 }),
  needDistribution: share({ QB: 0.2, RB: 4 / 15, WR: 4 / 15, TE: 4 / 15 }),
  bentDistribution: share({ QB: 0.2, RB: 4 / 15, WR: 4 / 15, TE: 4 / 15 }),
  remainingPicks: 12,
  kdstLikelihood: 0,
  mostLikelyPositions: [
    { position: 'RB', likelihood: 4 / 15, confidence: 'position' },
    { position: 'WR', likelihood: 4 / 15, confidence: 'position' },
    { position: 'TE', likelihood: 4 / 15, confidence: 'position' },
    { position: 'QB', likelihood: 0.2, confidence: 'position' },
  ],
  examplePlayers: [
    {
      playerId: '4034',
      playerName: 'Christian McCaffrey',
      position: 'RB',
      adp: null,
      confidence: 'player-example',
    },
  ],
  tendencyProfile: earlyProfile('slot-4'),
});

/** Pick 29 — a fully-rostered team: Terms' best-available regime, so no position prediction. */
const bestAvailableEntry = (): OpponentPanelEntry => ({
  pickNo: 29,
  round: 3,
  teamId: 'slot-1',
  unfilledStartingSlots: { dedicated: share({}), flex: 0 },
  needVector: NO_NEED_SIGNAL,
  needDistribution: null,
  remainingPicks: 10,
  kdstLikelihood: 0,
  mostLikelyPositions: [],
  examplePlayers: [
    {
      playerId: '8155',
      playerName: 'Bijan Robinson',
      position: 'RB',
      adp: 3.2,
      confidence: 'player-example',
    },
  ],
  tendencyProfile: establishedProfile('slot-1'),
});

const fullWindow = (): OpponentPanelData => ({
  window: {
    picks: [
      { pickNo: 26, round: 3, teamId: 'slot-3' },
      { pickNo: 27, round: 3, teamId: 'slot-4' },
      { pickNo: 28, round: 3, teamId: 'slot-3' },
      { pickNo: 29, round: 3, teamId: 'slot-1' },
    ],
    userOnTheClock: false,
    inProgressPickNo: 26,
    currentUserPickNo: null,
    nextUserPickNo: 30,
  },
  entries: [needyEntry(26), earlyEntry(), needyEntry(28), bestAvailableEntry()],
});

const emptyWindow = (overrides: Partial<OpponentPanelData['window']> = {}): OpponentPanelData => ({
  window: {
    picks: [],
    userOnTheClock: false,
    inProgressPickNo: 30,
    currentUserPickNo: null,
    nextUserPickNo: 30,
    ...overrides,
  },
  entries: [],
});

const renderPanel = (
  data: OpponentPanelData,
  options: { recomputing?: boolean; attachStatus?: 'attached' | 'needs-manual-slot' } = {},
) =>
  render(
    <OpponentPanel
      opponentPanel={wrap(data, options.recomputing ?? false)}
      teams={teams()}
      attachStatus={options.attachStatus ?? 'attached'}
    />,
  );

const rowFor = (pickNo: number): HTMLElement =>
  screen.getByRole('listitem', { name: new RegExp(`^Pick ${pickNo},`) });

const windowCaption = (): HTMLElement => screen.getByLabelText('Window');

/**
 * The window's own rows. Each row nests further lists (unfilled slots, likely positions, example
 * players), so a bare `getAllByRole('listitem')` inside the window list returns those too —
 * `data-pick-no` is what marks a row as a window pick rather than a detail inside one.
 */
const windowRows = (): HTMLElement[] =>
  within(screen.getByRole('list', { name: 'Window picks' }))
    .getAllByRole('listitem')
    .filter((node) => node.getAttribute('data-pick-no') !== null);

describe('OpponentPanel — the window (AC-34)', () => {
  it('lists every pick between now and the user’s next turn, in order, with its owning team', () => {
    renderPanel(fullWindow());

    const rows = windowRows();
    expect(rows.map((row) => row.getAttribute('data-pick-no'))).toEqual(['26', '27', '28', '29']);
    expect(within(rows[0]!).getByText('Sunday Scaries')).toBeTruthy();
    // A bot seat the API names not at all is shown by slot number (AC-2's convention).
    expect(within(rows[1]!).getByText('Slot 4')).toBeTruthy();
    expect(within(rows[3]!).getByText('Gridiron Gurus')).toBeTruthy();
  });

  it('repeats a team that picks twice in the window rather than deduping it', () => {
    renderPanel(fullWindow());

    const scaries = windowRows().filter(
      (row) => within(row).queryByText('Sunday Scaries') !== null,
    );
    expect(scaries.map((row) => row.getAttribute('data-pick-no'))).toEqual(['26', '28']);
  });

  it('captions the window with its size and the pick it closes at', () => {
    renderPanel(fullWindow());

    expect(windowCaption().textContent).toMatch(/4 picks/);
    expect(windowCaption().textContent).toMatch(/pick 30/);
  });

  it('says the user is on the clock when the in-progress pick is their own', () => {
    renderPanel({
      window: {
        picks: [{ pickNo: 27, round: 3, teamId: 'slot-3' }],
        userOnTheClock: true,
        inProgressPickNo: 26,
        currentUserPickNo: 26,
        nextUserPickNo: 30,
      },
      entries: [needyEntry(27)],
    });

    expect(windowCaption().textContent).toMatch(/on the clock/i);
    expect(windowCaption().textContent).toMatch(/pick 26/);
    // The in-progress pick is the user's own and is never part of the window.
    expect(screen.queryByRole('listitem', { name: /^Pick 26,/ })).toBeNull();
  });

  it('says there is nothing in the window when the user picks again immediately', () => {
    renderPanel(emptyWindow());

    expect(windowCaption().textContent).toMatch(/no picks between now and your pick 30/i);
    expect(screen.queryByRole('list', { name: 'Window picks' })).toBeNull();
  });

  it('says the user has no pick left rather than showing an unexplained empty window', () => {
    renderPanel(emptyWindow({ nextUserPickNo: null, inProgressPickNo: null }));

    expect(windowCaption().textContent).toMatch(/no pick left/i);
  });

  it('says the seat is unresolved when that is why the window is empty (AC-5)', () => {
    renderPanel(emptyWindow({ nextUserPickNo: null }), { attachStatus: 'needs-manual-slot' });

    expect(windowCaption().textContent).toMatch(/draft slot/i);
    expect(windowCaption().textContent).not.toMatch(/no pick left/i);
  });
});

describe('OpponentPanel — per-team needs and remaining picks (AC-35)', () => {
  it('shows each team’s unfilled starting slots and how many picks it still has', () => {
    renderPanel(fullWindow());

    const row = rowFor(26);
    const slots = within(row).getByRole('list', { name: 'Unfilled starting slots' });
    expect(within(slots).getByLabelText('RB: 1 unfilled')).toBeTruthy();
    expect(within(slots).getByLabelText('WR: 1 unfilled')).toBeTruthy();
    // K is tracked on the roster and shown here, yet carries no likelihood badge (🔶 AS-7).
    expect(within(slots).getByLabelText('K: 1 unfilled')).toBeTruthy();
    expect(within(row).getByLabelText('Remaining picks').textContent).toMatch(/13/);
  });

  it('gives a team appearing twice its own counts at each pick', () => {
    renderPanel(fullWindow());

    expect(within(rowFor(28)).getByLabelText('Remaining picks').textContent).toMatch(/13/);
    expect(within(rowFor(27)).getByLabelText('Remaining picks').textContent).toMatch(/12/);
  });
});

describe('OpponentPanel — position likelihoods and example players (AC-36, AC-37)', () => {
  it('renders the need-derived likelihood for each likely position', () => {
    renderPanel(fullWindow());

    const badges = within(rowFor(26)).getAllByRole('listitem', { name: /position-level/ });
    expect(badges.map((badge) => badge.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining('RB'), expect.stringContaining('WR')]),
    );
    expect(badges[0]!.textContent).toMatch(/50%/);
  });

  it('tags position predictions and player examples with the confidence the data carries', () => {
    renderPanel(fullWindow());

    const row = rowFor(26);
    const prediction = within(row).getAllByRole('listitem', { name: /position-level/ })[0]!;
    const example = within(row).getAllByRole('listitem', { name: /example/ })[0]!;

    expect(prediction.getAttribute('data-confidence')).toBe('position');
    expect(example.getAttribute('data-confidence')).toBe('player-example');
  });

  it('gives the two a genuinely distinct visual treatment (AC-37)', () => {
    renderPanel(fullWindow());

    const row = rowFor(26);
    const prediction = within(row).getAllByRole('listitem', { name: /position-level/ })[0]!;
    const example = within(row).getAllByRole('listitem', { name: /example/ })[0]!;

    expect(prediction.className).not.toBe(example.className);
    // A player-level guess is never presented as a certainty: it is hedged in the visible text …
    expect(example.textContent).toMatch(/e\.g\./i);
    // … and in what a screen reader is told.
    expect(example.getAttribute('aria-label')).toMatch(/illustrative/i);
    expect(prediction.getAttribute('aria-label')).toMatch(/position-level prediction/i);
  });

  it('names the example players in the ADP order the data supplies', () => {
    renderPanel(fullWindow());

    const examples = within(rowFor(26)).getAllByRole('listitem', { name: /example/ });
    expect(examples.map((node) => node.textContent)).toEqual([
      expect.stringContaining('Bijan Robinson'),
      expect.stringContaining('Malik Nabers'),
    ]);
  });

  it('offers no position prediction at all for a team drafting best available', () => {
    renderPanel(fullWindow());

    const row = rowFor(29);
    expect(within(row).queryAllByRole('listitem', { name: /position-level/ })).toHaveLength(0);
    expect(within(row).getByLabelText('Need signal').textContent).toMatch(/best available/i);
    // The examples survive — they are drawn across positions by ADP instead.
    expect(within(row).getAllByRole('listitem', { name: /example/ })).toHaveLength(1);
  });
});

describe('OpponentPanel — the K/DST chance (FR-8’s timing on the panel, 2026-09-02)', () => {
  /** Pick 132 — a team three picks from the end with both K/DST slots open, still needing an RB. */
  const lateEntry = (): OpponentPanelEntry => ({
    ...needyEntry(132),
    round: 14,
    remainingPicks: 3,
    unfilledStartingSlots: { dedicated: share({ RB: 1, K: 1, DST: 1 }), flex: 0 },
    needVector: share({ RB: 1 }),
    needDistribution: share({ RB: 1 }),
    bentDistribution: share({ RB: 0.8, WR: 0.2 }),
    kdstLikelihood: 0.4,
    // Already scaled by the server: the RB chip is the whole skill share, 60% of the pick.
    mostLikelyPositions: [{ position: 'RB', likelihood: 0.6, confidence: 'position' }],
  });

  const lateWindow = (entry: OpponentPanelEntry): OpponentPanelData => ({
    window: {
      picks: [{ pickNo: entry.pickNo, round: 14, teamId: entry.teamId }],
      userOnTheClock: true,
      inProgressPickNo: 131,
      currentUserPickNo: 131,
      nextUserPickNo: 134,
    },
    entries: [entry],
  });

  it('shows the K/DST chance as its own position-level chip beside the scaled skill chips', () => {
    renderPanel(lateWindow(lateEntry()));

    const badges = within(rowFor(132)).getAllByRole('listitem', { name: /position-level/ });
    expect(badges.map((badge) => badge.textContent)).toEqual([
      expect.stringMatching(/^RB 60%/),
      'K/DST 40%',
    ]);
    const kdst = badges[1]!;
    expect(kdst.getAttribute('data-confidence')).toBe('position');
    expect(kdst.getAttribute('aria-label')).toMatch(/K\/DST, 40% likely/);
  });

  it('scales the bent likelihood by the same skill share before calling it a shift', () => {
    renderPanel(lateWindow(lateEntry()));

    // Bent RB 0.8 of a 60% skill pick is 48%, shown against the 60% need reading.
    const rb = within(rowFor(132)).getAllByRole('listitem', { name: /^RB, / })[0]!;
    expect(rb.textContent).toMatch(/60%/);
    expect(rb.textContent).toMatch(/48%/);
  });

  it('shows no K/DST chip in the middle rounds, where the chance is zero', () => {
    renderPanel(fullWindow());

    expect(screen.queryByText(/K\/DST/)).toBeNull();
  });

  it('says a starters-full team near its deadline is reaching for K/DST, not best available', () => {
    renderPanel(lateWindow({ ...bestAvailableEntry(), pickNo: 132, kdstLikelihood: 0.5 }));
    expect(within(rowFor(132)).getByLabelText('Need signal').textContent).toMatch(
      /50% best available from ADP order, 50% K\/DST/,
    );
    expect(within(rowFor(132)).getByText('K/DST 50%')).toBeTruthy();
  });

  it('says the pick is spoken for at the deadline', () => {
    renderPanel(lateWindow({ ...bestAvailableEntry(), pickNo: 132, kdstLikelihood: 1 }));
    expect(within(rowFor(132)).getByLabelText('Need signal').textContent).toMatch(
      /this pick goes to K\/DST/,
    );
  });
});

describe('OpponentPanel — tendency profile summary (AC-38, AC-39, AC-40)', () => {
  it('summarises the profile compactly: reach, need-adherence and positional lean', () => {
    renderPanel(fullWindow());

    const summary = within(rowFor(26)).getByLabelText('Tendency profile');
    expect(summary.textContent).toMatch(/reaches \+4\.2/i);
    expect(summary.textContent).toMatch(/80%/);
    expect(summary.textContent).toMatch(/RB-heavy/i);
    expect(summary.textContent).toMatch(/5 picks/);
  });

  it('bends the displayed likelihoods by the profile, showing the shift rather than hiding it', () => {
    renderPanel(fullWindow());

    const rb = within(rowFor(26)).getAllByRole('listitem', { name: /^RB, / })[0]!;
    // AC-36's unbent need weight and AC-40's bent weight are both stated, so neither AC is
    // satisfied by silently replacing the other.
    expect(rb.textContent).toMatch(/50%/);
    expect(rb.textContent).toMatch(/60%/);
    expect(rb.getAttribute('aria-label')).toMatch(/tendency/i);
  });

  it('grays out and labels a cold-start profile instead of asserting a tendency (AC-39)', () => {
    renderPanel(fullWindow());

    const early = within(rowFor(27)).getByLabelText('Tendency profile');
    const established = within(rowFor(26)).getByLabelText('Tendency profile');

    expect(early.getAttribute('data-confidence')).toBe('early');
    expect(established.getAttribute('data-confidence')).toBe('established');
    expect(early.className).not.toBe(established.className);
    expect(early.textContent).toMatch(/early/i);
    expect(early.textContent).toMatch(/2 picks/);
  });

  it('does not claim a reach tendency when no pick could be scored for one', () => {
    renderPanel(fullWindow());

    // `reachSampleCount: 0` means "no ADP on any of their picks", not "drafts exactly at market".
    const early = within(rowFor(27)).getByLabelText('Tendency profile');
    expect(early.textContent).toMatch(/reach unknown/i);
    expect(early.textContent).not.toMatch(/at market/i);
  });

  it('shows no bent likelihoods for a team with no need signal to bend', () => {
    renderPanel(fullWindow());

    const summary = within(rowFor(29)).getByLabelText('Tendency profile');
    expect(summary).toBeTruthy();
    expect(within(rowFor(29)).queryAllByRole('listitem', { name: /position-level/ })).toHaveLength(
      0,
    );
  });
});

describe('OpponentPanel — recomputing (AC-21)', () => {
  it('keeps the stale window on screen while flagging it', () => {
    renderPanel(fullWindow(), { recomputing: true });

    expect(rowFor(26)).toBeTruthy();
    expect(
      within(screen.getByRole('region', { name: 'Opponent panel' })).getByText(/recomputing/i),
    ).toBeTruthy();
    expect(screen.getByLabelText('Opponent window').getAttribute('aria-busy')).toBe('true');
  });
});
