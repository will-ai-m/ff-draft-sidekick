import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DraftScreen } from '../screens/DraftScreen';
import { PlayerCardController, closePlayerCard, openPlayerCard } from '../state/playerCard';
import type { PlayerCardState } from '../state/playerCard';
import { makeSnapshot } from '../test/fixtures';
import {
  quarterbackCard,
  rookieCard,
  runningBackCard,
  wideReceiverCard,
} from '../test/playerCards';

import { PlayerCardHost, PlayerCardModal } from './PlayerCard';

const ready = (card: PlayerCardState['card']): PlayerCardState => ({
  playerId: card?.playerId ?? '0',
  status: 'ready',
  card,
  error: null,
});

const dialog = (): HTMLElement => screen.getByRole('dialog', { name: /player card/i });

/** The leaf column headers, in table order — the AC-62 column set this card is showing. */
const columnHeaders = (): string[] =>
  within(within(dialog()).getByTestId('gamelog-columns'))
    .getAllByRole('columnheader')
    .map((cell) => (cell.textContent ?? '').replace(/\s+/g, ' ').trim());

/** One game's row, addressed by its week — the week cell is the row's header. */
const gameRow = (week: string): HTMLElement =>
  within(dialog()).getByRole('rowheader', { name: week }).closest('tr') as HTMLElement;

const cells = (row: HTMLElement): (string | null)[] =>
  within(row)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

afterEach(() => {
  closePlayerCard();
  vi.unstubAllGlobals();
});

describe('PlayerCardModal', () => {
  it('shows a QB’s passing and rushing columns, and never a receiving one (AC-62)', () => {
    render(<PlayerCardModal state={ready(quarterbackCard())} onClose={() => {}} />);

    expect(columnHeaders()).toEqual([
      'Week',
      'Opp',
      'Pts',
      'Passing Att',
      'Passing Comp',
      'Passing Yds',
      'Passing TD',
      'Passing INT',
      'Rushing Att',
      'Rushing Yds',
      'Rushing Avg',
      'Rushing TD',
      'Fum',
    ]);
    expect(columnHeaders().some((header) => header.startsWith('Receiving'))).toBe(false);
    // The repeated "Att"/"Yds"/"TD" labels are disambiguated on screen by a group header row.
    expect(within(dialog()).getByRole('columnheader', { name: 'Passing' })).toBeDefined();
    expect(within(dialog()).getByRole('columnheader', { name: 'Rushing' })).toBeDefined();
  });

  it('shows a RB’s rushing and receiving columns, long and yds-per-tgt included (AC-62)', () => {
    render(<PlayerCardModal state={ready(runningBackCard())} onClose={() => {}} />);

    expect(columnHeaders()).toEqual([
      'Week',
      'Opp',
      'Pts',
      'Rushing Att',
      'Rushing Yds',
      'Rushing Avg',
      'Rushing TD',
      'Receiving Tgt',
      'Receiving Rec',
      'Receiving Yds',
      'Receiving TD',
      'Receiving Long',
      'Receiving Yds/Tgt',
      'Fum',
    ]);
  });

  it('shows a WR’s receiving columns, plus a rushing line only because he carried it (AC-62)', () => {
    render(<PlayerCardModal state={ready(wideReceiverCard())} onClose={() => {}} />);

    expect(columnHeaders()).toEqual([
      'Week',
      'Opp',
      'Pts',
      'Rushing Att',
      'Rushing Yds',
      'Rushing Avg',
      'Rushing TD',
      'Receiving Tgt',
      'Receiving Rec',
      'Receiving Yds',
      'Receiving TD',
      'Receiving Long',
      'Receiving Yds/Tgt',
      'Fum',
    ]);

    // Week 2 has no carries at all: the season's column stays, the cell reads as absent.
    expect(cells(gameRow('2'))).toEqual([
      'JAX',
      '14.5',
      '—',
      '—',
      '—',
      '—',
      '11',
      '6',
      '85',
      '0',
      '33',
      '7.7',
      '0',
    ]);
  });

  it('renders each game’s week, opponent, league-scored points and stat line (AC-62, AC-64)', () => {
    render(<PlayerCardModal state={ready(runningBackCard())} onClose={() => {}} />);

    expect(cells(gameRow('1'))).toEqual([
      'GB',
      '19.3',
      '15',
      '82',
      '5.5',
      '1',
      '5',
      '4',
      '31',
      '0',
      '14',
      '6.2',
      '0',
    ]);
    // Two-decimal points survive: a custom league's settings do not have to land on a tenth.
    expect(cells(gameRow('2'))[1]).toBe('12.05');
    // The points came from the league's own settings, and the card says so rather than leaving
    // the reader to assume half-PPR (AC-64).
    expect(dialog().textContent).toMatch(/your league’s scoring settings/i);
  });

  it('offers every cached season as a tab, newest first, and switches between them (AC-63)', () => {
    render(<PlayerCardModal state={ready(runningBackCard())} onClose={() => {}} />);

    expect(
      within(dialog())
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['2025', '2024']);
    expect(within(dialog()).getByRole('tab', { selected: true }).textContent).toBe('2025');
    expect(gameRow('1')).toBeDefined();

    fireEvent.click(within(dialog()).getByRole('tab', { name: '2024' }));

    expect(within(dialog()).getByRole('tab', { selected: true }).textContent).toBe('2024');
    expect(cells(gameRow('3'))[0]).toBe('ARI');
    expect(within(dialog()).queryByRole('rowheader', { name: '1' })).toBeNull();
  });

  it('states that a rookie has no NFL game data instead of showing an empty table (AC-65)', () => {
    render(<PlayerCardModal state={ready(rookieCard())} onClose={() => {}} />);

    expect(dialog().textContent).toMatch(/no nfl game data/i);
    expect(dialog().textContent).toMatch(/Squirrel White/);
    expect(within(dialog()).queryByRole('table')).toBeNull();
    expect(within(dialog()).queryByRole('tab')).toBeNull();
  });

  it('names the league scoring rules no game log can express, when there are any', () => {
    const card = { ...quarterbackCard(), unsupportedScoringKeys: ['def_st_td', 'fgm_40_49'] };
    render(<PlayerCardModal state={ready(card)} onClose={() => {}} />);

    const note = within(dialog()).getByRole('region', { name: /scoring rules not reflected/i });
    expect(note.textContent).toMatch(/2 of your league’s scoring rules/i);
    expect(note.textContent).toMatch(/def_st_td/);
    expect(note.textContent).toMatch(/fgm_40_49/);
  });

  it('says nothing about unsupported rules when the league has none', () => {
    render(<PlayerCardModal state={ready(quarterbackCard())} onClose={() => {}} />);

    expect(within(dialog()).queryByRole('region', { name: /scoring rules/i })).toBeNull();
  });

  it('shows a loading state while the log is on its way', () => {
    render(
      <PlayerCardModal
        state={{ playerId: '4984', status: 'loading', card: null, error: null }}
        onClose={() => {}}
      />,
    );

    expect(within(dialog()).getByRole('status').textContent).toMatch(/loading/i);
  });

  it('shows the failure and a retry when the log could not be fetched', () => {
    const onRetry = vi.fn();
    render(
      <PlayerCardModal
        state={{ playerId: '4984', status: 'error', card: null, error: 'No draft is attached.' }}
        onClose={() => {}}
        onRetry={onRetry}
      />,
    );

    expect(within(dialog()).getByRole('alert').textContent).toMatch(/no draft is attached/i);
    fireEvent.click(within(dialog()).getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('closes on the close button, on Escape, and on a click outside the card', () => {
    const onClose = vi.fn();
    const { unmount } = render(
      <PlayerCardModal state={ready(quarterbackCard())} onClose={onClose} />,
    );
    const backdrop = dialog().parentElement as HTMLElement;

    fireEvent.click(within(dialog()).getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(3);

    // A click *inside* the card is not a click outside it.
    fireEvent.click(within(dialog()).getByRole('table'));
    expect(onClose).toHaveBeenCalledTimes(3);

    unmount();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('moves focus onto the card so the keyboard lands inside it', () => {
    render(<PlayerCardModal state={ready(quarterbackCard())} onClose={() => {}} />);

    expect(document.activeElement).toBe(dialog());
  });
});

describe('PlayerCardHost', () => {
  it('opens over the draft screen without leaving it, and closing returns to it (AC-61)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        expect(url).toBe('/api/player/9221/gamelog');
        return new Response(JSON.stringify(runningBackCard()), { status: 200 });
      }),
    );

    render(<DraftScreen snapshot={makeSnapshot()} onDetach={() => {}} />);
    expect(screen.queryByRole('dialog')).toBeNull();

    openPlayerCard('9221');

    await waitFor(() => expect(within(dialog()).getByRole('table')).toBeDefined());
    // The draft screen is still mounted underneath — an overlay, not a route change (AC-61).
    expect(screen.getByRole('region', { name: 'Candidate list' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'Pick feed' })).toBeDefined();

    fireEvent.click(within(dialog()).getByRole('button', { name: /close/i }));

    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('region', { name: 'Candidate list' })).toBeDefined();
  });

  it('renders nothing at all while no player is open', () => {
    const { container } = render(<PlayerCardHost controller={new PlayerCardController()} />);
    expect(container.innerHTML).toBe('');
  });
});
