import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PickFeedEntry, Team } from '@sidekick/shared';

import { closePlayerCard, playerCards } from '../state/playerCard';
import { PickFeed } from './PickFeed';

beforeEach(() => {
  // `open` fires a game-log fetch; the card itself is T14's surface, so the request is stubbed and
  // only the controller's synchronous "which player is open" transition is asserted here.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })),
  );
});

afterEach(() => {
  closePlayerCard();
  vi.unstubAllGlobals();
});

/**
 * Four seats covering every way a team can be named: a named team, the user's own seat, a mock bot
 * the API names not at all, and a seat with an owner but no team name.
 */
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
    ownerDisplayName: 'latejoiner',
    isBotSeat: false,
    userId: '444',
    rosterId: 4,
    isUser: false,
  },
];

const pick = (
  overrides: Partial<PickFeedEntry> & Pick<PickFeedEntry, 'pickNo'>,
): PickFeedEntry => ({
  round: 1,
  draftSlot: overrides.pickNo,
  teamId: `slot-${overrides.pickNo}`,
  playerId: `p${overrides.pickNo}`,
  playerName: `Player ${overrides.pickNo}`,
  position: 'RB',
  isUserPick: false,
  matchedToSnapshot: true,
  ...overrides,
});

const feed = (): PickFeedEntry[] => [
  pick({ pickNo: 1, teamId: 'slot-1', playerId: '9221', playerName: 'Jahmyr Gibbs' }),
  pick({
    pickNo: 2,
    teamId: 'slot-2',
    playerId: '7564',
    playerName: "Ja'Marr Chase",
    position: 'WR',
    isUserPick: true,
  }),
  pick({
    pickNo: 3,
    teamId: 'slot-3',
    playerId: '12345',
    playerName: 'Cam Skattebo',
    matchedToSnapshot: false,
  }),
  pick({ pickNo: 4, teamId: 'slot-4', playerId: '99', playerName: 'Unknown Guy', position: null }),
];

const rowFor = (pickNo: number): HTMLElement =>
  screen.getByRole('listitem', { name: new RegExp(`^Pick ${pickNo},`) });

describe('PickFeed — attribution and mine-vs-opponent (AC-11)', () => {
  it('attributes every pick to its drafting team by that team’s canonical name', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);

    expect(within(rowFor(1)).getByText('Gridiron Gurus')).toBeTruthy();
    expect(within(rowFor(2)).getByText('Willy Wildcats')).toBeTruthy();
    // A bot/empty seat the API names not at all falls back to its slot number (AC-2's convention).
    expect(within(rowFor(3)).getByText('Slot 3')).toBeTruthy();
    // A seat with an owner but no team name is named by its owner.
    expect(within(rowFor(4)).getByText('latejoiner')).toBeTruthy();
  });

  it('flags the user’s own pick and leaves opponents’ picks unflagged', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);

    expect(within(rowFor(2)).getByLabelText('Your pick')).toBeTruthy();
    expect(rowFor(2).getAttribute('data-owner')).toBe('mine');

    for (const pickNo of [1, 3, 4]) {
      expect(within(rowFor(pickNo)).queryByLabelText('Your pick')).toBeNull();
      expect(rowFor(pickNo).getAttribute('data-owner')).toBe('opponent');
    }
  });

  it('gives mine and opponent genuinely different treatments, not the same row twice', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);

    expect(rowFor(2).className).not.toBe(rowFor(1).className);
  });

  it('shows each pick’s round-and-slot coordinates alongside its overall number', () => {
    const late = [
      pick({ pickNo: 21, round: 3, draftSlot: 1, teamId: 'slot-1', playerName: 'Late Pick' }),
    ];
    render(<PickFeed pickFeed={late} teams={teams()} />);

    expect(within(rowFor(21)).getByText('3.01')).toBeTruthy();
    expect(rowFor(21).getAttribute('aria-label')).toMatch(/^Pick 21, Gridiron Gurus/);
  });

  it('lists the most recent pick first, so a live feed never hides behind a scroll', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);

    const rows = within(screen.getByRole('region', { name: 'Pick feed' })).getAllByRole('listitem');
    expect(rows.map((row) => row.getAttribute('data-pick-no'))).toEqual(['4', '3', '2', '1']);
  });

  it('renders a position-less pick without inventing a position', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);

    expect(within(rowFor(4)).getByText('Unknown Guy')).toBeTruthy();
    expect(within(rowFor(4)).queryByText(/^(QB|RB|WR|TE|K|DST)$/)).toBeNull();
  });

  it('says the feed is empty rather than rendering a bare list', () => {
    render(<PickFeed pickFeed={[]} teams={teams()} />);

    expect(screen.getByText(/no picks yet/i)).toBeTruthy();
    expect(screen.queryByRole('listitem')).toBeNull();
  });
});

describe('PickFeed — unmatched players (AC-20)', () => {
  it('shows the raw Sleeper name with a visible warning badge naming the player', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);

    const row = rowFor(3);
    expect(within(row).getByText('Cam Skattebo')).toBeTruthy();

    const warning = within(row).getByRole('note');
    expect(warning.textContent).toMatch(/unmatched/i);
    // AC-20's warning has to *name* the player, not just mark the row.
    expect(warning.getAttribute('aria-label')).toMatch(/Cam Skattebo/);
    expect(warning.getAttribute('aria-label')).toMatch(/rankings snapshot/i);
  });

  it('leaves matched picks unbadged', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);

    for (const pickNo of [1, 2, 4]) {
      expect(within(rowFor(pickNo)).queryByRole('note')).toBeNull();
    }
  });

  it('counts the unmatched picks in the panel’s own header', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);

    const header = within(screen.getByRole('region', { name: 'Pick feed' })).getByText(/4 picks/);
    expect(header.textContent).toMatch(/1 unmatched/i);
  });
});

describe('PickFeed — one click opens the player card (AC-61)', () => {
  it('opens the clicked entry’s card through the controller the draft screen mounts', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);
    expect(playerCards.getState().playerId).toBeNull();

    fireEvent.click(within(rowFor(1)).getByRole('button', { name: 'Jahmyr Gibbs' }));

    expect(playerCards.getState().playerId).toBe('9221');
  });

  it('makes every entry’s name a real button, so the keyboard reaches it too', () => {
    render(<PickFeed pickFeed={feed()} teams={teams()} />);

    // A `<button>` is focusable and Enter/Space-activated by the platform — no key handler of our
    // own to get wrong, and an unmatched player's card is reachable like any other.
    const button = within(rowFor(3)).getByRole('button', { name: 'Cam Skattebo' });
    expect(button.tagName).toBe('BUTTON');
    expect(button.getAttribute('type')).toBe('button');
  });
});
