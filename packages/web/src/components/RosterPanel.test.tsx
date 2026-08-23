import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_NEED_SIGNAL } from '@sidekick/shared';
import type { Insight, RosterPanelData } from '@sidekick/shared';

import { closePlayerCard, playerCards } from '../state/playerCard';
import { RosterPanel } from './RosterPanel';
import type { RosterPlayer } from './RosterPanel';

/** The user's own picks, out of draft order on purpose — the panel sorts them. */
const drafted = (): RosterPlayer[] => [
  { playerId: '7564', playerName: "Ja'Marr Chase", position: 'WR', pickNo: 5 },
  { playerId: '9221', playerName: 'Jahmyr Gibbs', position: 'RB', pickNo: 2 },
  { playerId: '11604', playerName: 'Brock Bowers', position: null, pickNo: 8 },
];

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })),
  );
});

afterEach(() => {
  closePlayerCard();
  vi.unstubAllGlobals();
});

const wrap = <T,>(data: T, recomputing = false): Insight<T> => ({
  data,
  boardVersion: 4,
  recomputing,
  degraded: false,
});

/**
 * Mid-draft, default-ish shape: one RB and two WR starters in, one FLEX filled by surplus, two on
 * the bench. Every unfilled count below is the arithmetic complement, so a component that renders
 * `slots - filled` instead of reading the fields fails these assertions.
 */
const midDraftRoster = (overrides: Partial<RosterPanelData> = {}): RosterPanelData => ({
  teamId: 'slot-5',
  slots: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2, K: 1, DST: 1, BN: 6 },
  filledStartingSlots: { QB: 0, RB: 1, WR: 2, TE: 0, K: 0, DST: 0 },
  filledFlexSlots: 1,
  unfilledStartingSlots: { dedicated: { QB: 1, RB: 1, WR: 1, TE: 1, K: 1, DST: 1 }, flex: 1 },
  needVector: { QB: 1, RB: 4 / 3, WR: 4 / 3, TE: 4 / 3, K: 0, DST: 0 },
  benchCount: 2,
  benchSlots: 6,
  ...overrides,
});

const rosterPanel = () => screen.getByRole('region', { name: 'Roster panel' });

describe('RosterPanel — filled and unfilled starting slots, bench (AC-31)', () => {
  it('reports every starting slot as filled-of-total, the FLEX among them', () => {
    render(
      <RosterPanel userRoster={wrap<RosterPanelData | null>(midDraftRoster())} players={[]} />,
    );

    const slots = within(rosterPanel()).getByRole('list', { name: 'Starting slots' });
    expect(within(slots).getByLabelText('QB: 0 of 1 starting slots filled')).toBeTruthy();
    expect(within(slots).getByLabelText('RB: 1 of 2 starting slots filled')).toBeTruthy();
    expect(within(slots).getByLabelText('WR: 2 of 3 starting slots filled')).toBeTruthy();
    expect(within(slots).getByLabelText('TE: 0 of 1 starting slots filled')).toBeTruthy();
    expect(within(slots).getByLabelText('FLEX: 1 of 2 starting slots filled')).toBeTruthy();
  });

  it('reads the filled FLEX count off the data rather than re-deriving roster math', () => {
    // `filledFlexSlots` is the field T4 added precisely so the UI does not compute it. Two FLEX
    // slots with one filled and none unfilled is arithmetically impossible under a re-derivation
    // (2 - 0 = 2), so only a component reading the field renders "1 of 2".
    const roster = midDraftRoster({
      filledFlexSlots: 1,
      unfilledStartingSlots: { dedicated: { QB: 1, RB: 1, WR: 1, TE: 1, K: 1, DST: 1 }, flex: 0 },
    });
    render(<RosterPanel userRoster={wrap<RosterPanelData | null>(roster)} players={[]} />);

    expect(screen.getByLabelText('FLEX: 1 of 2 starting slots filled')).toBeTruthy();
  });

  it('counts the bench separately from the starting slots', () => {
    render(
      <RosterPanel userRoster={wrap<RosterPanelData | null>(midDraftRoster())} players={[]} />,
    );

    const bench = within(rosterPanel()).getByLabelText('Bench: 2 of 6 filled');
    expect(bench.textContent).toMatch(/2\s*\/\s*6/);
    // The bench is not a starting slot and must not be listed among them.
    const slots = within(rosterPanel()).getByRole('list', { name: 'Starting slots' });
    expect(within(slots).queryByText(/bench/i)).toBeNull();
  });

  it('shows the unfilled starting slots by position — the need vector, count-shaped', () => {
    render(
      <RosterPanel userRoster={wrap<RosterPanelData | null>(midDraftRoster())} players={[]} />,
    );

    const needs = within(rosterPanel()).getByRole('list', { name: 'Unfilled starting slots' });
    for (const label of [
      'QB: 1 unfilled',
      'RB: 1 unfilled',
      'WR: 1 unfilled',
      'TE: 1 unfilled',
      'FLEX: 1 unfilled',
      'K: 1 unfilled',
      'DST: 1 unfilled',
    ]) {
      expect(within(needs).getByLabelText(label)).toBeTruthy();
    }
  });

  it('omits a position from the unfilled list once it has nothing open', () => {
    const roster = midDraftRoster({
      filledStartingSlots: { QB: 0, RB: 2, WR: 2, TE: 0, K: 0, DST: 0 },
      unfilledStartingSlots: { dedicated: { QB: 1, RB: 0, WR: 1, TE: 1, K: 1, DST: 1 }, flex: 1 },
    });
    render(<RosterPanel userRoster={wrap<RosterPanelData | null>(roster)} players={[]} />);

    const needs = screen.getByRole('list', { name: 'Unfilled starting slots' });
    expect(within(needs).queryByLabelText(/^RB:/)).toBeNull();
    // …but the slot itself is still on the roster, filled 2 of 2.
    expect(screen.getByLabelText('RB: 2 of 2 starting slots filled')).toBeTruthy();
  });
});

describe('RosterPanel — K and DST are tracked like any other slot (AC-33)', () => {
  it('lists K and DST among the starting slots and among the unfilled ones', () => {
    render(
      <RosterPanel userRoster={wrap<RosterPanelData | null>(midDraftRoster())} players={[]} />,
    );

    const slots = screen.getByRole('list', { name: 'Starting slots' });
    expect(within(slots).getByLabelText('K: 0 of 1 starting slots filled')).toBeTruthy();
    expect(within(slots).getByLabelText('DST: 0 of 1 starting slots filled')).toBeTruthy();
  });

  it('states that only K/DST are left rather than claiming the starters are complete', () => {
    // T4's case: every skill slot filled, K and DST still open, so `computeNeedVector` returns the
    // sentinel. AC-33 keeps those slots visible; 🔶 AS-7 keeps them out of the prediction math.
    const roster = midDraftRoster({
      filledStartingSlots: { QB: 1, RB: 2, WR: 3, TE: 1, K: 0, DST: 0 },
      filledFlexSlots: 2,
      unfilledStartingSlots: { dedicated: { QB: 0, RB: 0, WR: 0, TE: 0, K: 1, DST: 1 }, flex: 0 },
      needVector: NO_NEED_SIGNAL,
      benchCount: 0,
    });
    render(<RosterPanel userRoster={wrap<RosterPanelData | null>(roster)} players={[]} />);

    const needs = screen.getByRole('list', { name: 'Unfilled starting slots' });
    expect(within(needs).getByLabelText('K: 1 unfilled')).toBeTruthy();
    expect(within(needs).getByLabelText('DST: 1 unfilled')).toBeTruthy();

    const note = screen.getByLabelText('Need signal');
    expect(note.textContent).toMatch(/no skill-position need/i);
    expect(note.textContent).toMatch(/K\/DST/);
    expect(note.textContent).not.toMatch(/every starting slot/i);
  });

  it('says the starters are complete only when nothing at all is open', () => {
    const roster = midDraftRoster({
      filledStartingSlots: { QB: 1, RB: 2, WR: 3, TE: 1, K: 1, DST: 1 },
      filledFlexSlots: 2,
      unfilledStartingSlots: { dedicated: { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DST: 0 }, flex: 0 },
      needVector: NO_NEED_SIGNAL,
      benchCount: 0,
    });
    render(<RosterPanel userRoster={wrap<RosterPanelData | null>(roster)} players={[]} />);

    expect(screen.getByLabelText('Need signal').textContent).toMatch(/every starting slot/i);
    expect(screen.queryByRole('list', { name: 'Unfilled starting slots' })).toBeNull();
  });
});

describe('RosterPanel — non-default league settings (AC-32)', () => {
  it('renders a 12-team 3-WR / 2-FLEX / no-kicker league with no special-casing', () => {
    const roster = midDraftRoster({
      slots: { QB: 1, RB: 2, WR: 3, TE: 1, FLEX: 2, K: 0, DST: 1, BN: 5 },
      filledStartingSlots: { QB: 1, RB: 1, WR: 3, TE: 0, K: 0, DST: 0 },
      filledFlexSlots: 0,
      unfilledStartingSlots: { dedicated: { QB: 0, RB: 1, WR: 0, TE: 1, K: 0, DST: 1 }, flex: 2 },
      needVector: { QB: 0, RB: 1 + 2 / 3, WR: 2 / 3, TE: 1 + 2 / 3, K: 0, DST: 0 },
      benchCount: 1,
      benchSlots: 5,
    });
    render(<RosterPanel userRoster={wrap<RosterPanelData | null>(roster)} players={[]} />);

    const slots = screen.getByRole('list', { name: 'Starting slots' });
    expect(within(slots).getByLabelText('WR: 3 of 3 starting slots filled')).toBeTruthy();
    expect(within(slots).getByLabelText('FLEX: 0 of 2 starting slots filled')).toBeTruthy();
    expect(within(slots).getByLabelText('DST: 0 of 1 starting slots filled')).toBeTruthy();
    // A league with no kicker slot shows no kicker row at all — not "0 of 0".
    expect(within(slots).queryByLabelText(/^K:/)).toBeNull();
    expect(screen.getByLabelText('Bench: 1 of 5 filled')).toBeTruthy();
    expect(screen.getByLabelText('FLEX: 2 unfilled')).toBeTruthy();
  });
});

describe('RosterPanel — states it cannot render (AC-5, AC-21)', () => {
  it('says the seat is unresolved instead of inventing an empty roster', () => {
    render(<RosterPanel userRoster={wrap<RosterPanelData | null>(null)} players={[]} />);

    expect(screen.getByText(/draft slot is not resolved/i)).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Starting slots' })).toBeNull();
  });

  it('keeps a stale roster on screen while marking it recomputing', () => {
    render(
      <RosterPanel
        userRoster={wrap<RosterPanelData | null>(midDraftRoster(), true)}
        players={[]}
      />,
    );

    // Stale data stays visible (FR-3: flagged, never blanked) …
    expect(screen.getByLabelText('WR: 2 of 3 starting slots filled')).toBeTruthy();
    // … and is flagged both to sighted users and to assistive tech.
    expect(within(rosterPanel()).getByText(/recomputing/i)).toBeTruthy();
    expect(screen.getByLabelText('Roster').getAttribute('aria-busy')).toBe('true');
  });
});

describe('RosterPanel — one click opens the player card (AC-61)', () => {
  const renderWithPlayers = () =>
    render(
      <RosterPanel
        userRoster={wrap<RosterPanelData | null>(midDraftRoster())}
        players={drafted()}
      />,
    );

  it('lists the user’s own picks in draft order', () => {
    renderWithPlayers();

    const rows = within(screen.getByRole('list', { name: 'Drafted players' })).getAllByRole(
      'listitem',
    );
    expect(rows.map((row) => within(row).getByRole('button').textContent)).toEqual([
      'Jahmyr Gibbs',
      "Ja'Marr Chase",
      'Brock Bowers',
    ]);
  });

  it('opens the clicked player’s card through the controller the draft screen mounts', () => {
    renderWithPlayers();
    expect(playerCards.getState().playerId).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: "Ja'Marr Chase" }));

    expect(playerCards.getState().playerId).toBe('7564');
  });

  it('makes each roster entry a real button, so the keyboard reaches it too', () => {
    renderWithPlayers();

    const button = screen.getByRole('button', { name: 'Jahmyr Gibbs' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });

  it('renders no drafted list at all before the user has picked', () => {
    render(
      <RosterPanel userRoster={wrap<RosterPanelData | null>(midDraftRoster())} players={[]} />,
    );

    expect(screen.queryByRole('list', { name: 'Drafted players' })).toBeNull();
  });
});
