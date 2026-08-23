import { fireEvent, render, screen, within } from '@testing-library/react';
import type {
  CandidateListData,
  CandidateRow,
  Insight,
  Position,
  Survival,
  SurvivalBand,
} from '@sidekick/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CandidateList } from './CandidateList';
import { insight, makeCandidateList } from '../test/fixtures';
import { closePlayerCard, playerCards } from '../state/playerCard';

// ---------------------------------------------------------------------------------------------
// Fixtures. Every reason string below is T8's own output, copied verbatim from
// `packages/server/src/recommend/candidates.test.ts` — this component prints them and never
// rewords or re-derives them, so the assertions are string equality on purpose.
// ---------------------------------------------------------------------------------------------

const survival = (probability: number, band: SurvivalBand): Survival => ({ probability, band });

const row = (
  overrides: Partial<CandidateRow> & Pick<CandidateRow, 'playerId' | 'playerName' | 'position'>,
): CandidateRow => ({
  team: null,
  ecrRank: null,
  positionalRank: null,
  adp: null,
  survival: null,
  addedForHighlight: false,
  ...overrides,
});

const RB1 = row({
  playerId: 'rb1',
  playerName: 'Bijan Robinson',
  position: 'RB',
  team: 'ATL',
  ecrRank: 1,
  positionalRank: 1,
  adp: 1.5,
  survival: survival(0.92, 'likely-available'),
});
const WR1 = row({
  playerId: 'wr1',
  playerName: "Ja'Marr Chase",
  position: 'WR',
  team: 'CIN',
  ecrRank: 2,
  positionalRank: 1,
  adp: 3,
  survival: survival(0.18, 'likely-gone'),
});
const TE1 = row({
  playerId: 'te1',
  playerName: 'Brock Bowers',
  position: 'TE',
  team: 'LV',
  ecrRank: 3,
  positionalRank: 1,
  adp: null,
  survival: survival(0.5, 'coin-flip'),
});
const QB1 = row({
  playerId: 'qb1',
  playerName: 'Josh Allen',
  position: 'QB',
  team: 'BUF',
  ecrRank: 4,
  positionalRank: 1,
  adp: 20.4,
  survival: survival(0.8, 'likely-available'),
});
const RB2 = row({
  playerId: 'rb2',
  playerName: 'Saquon Barkley',
  position: 'RB',
  team: 'PHI',
  ecrRank: 5,
  positionalRank: 2,
  adp: 6,
  survival: survival(0.34, 'coin-flip'),
});

/** K/DST always arrive with `survival: null` — they are outside the sim universe (🔶 AS-7). */
const K1 = row({
  playerId: 'k1',
  playerName: 'Brandon Aubrey',
  position: 'K',
  team: 'DAL',
  ecrRank: 140,
  positionalRank: 1,
  adp: 131,
});
const DST1 = row({
  playerId: 'dst1',
  playerName: 'Houston Texans',
  position: 'DST',
  team: 'HOU',
  ecrRank: 150,
  positionalRank: 1,
  adp: 144,
});

const byPosition = (
  overrides: Partial<Record<Position, CandidateRow[]>> = {},
): Partial<Record<Position, CandidateRow[]>> => ({
  QB: [QB1],
  RB: [RB1, RB2],
  WR: [WR1],
  TE: [TE1],
  K: [K1],
  DST: [DST1],
  ...overrides,
});

const BEST_AVAILABLE_REASON = 'Best available: Bijan Robinson (ECR 1).';

const data = (overrides: Partial<CandidateListData> = {}): CandidateListData =>
  makeCandidateList({
    rows: [RB1, WR1, TE1, QB1, RB2],
    highlightPlayerId: 'rb1',
    reasonKind: 'best-available',
    reason: BEST_AVAILABLE_REASON,
    rowsByPosition: byPosition(),
    ...overrides,
  });

const renderList = (
  listData: CandidateListData = data(),
  flags: Partial<Omit<Insight<CandidateListData>, 'data'>> = {},
) => render(<CandidateList candidateList={insight(listData, flags)} />);

// --- queries ---------------------------------------------------------------------------------

const bodyRows = (): HTMLElement[] =>
  within(screen.getByRole('table', { name: /candidate rows/i }))
    .getAllByRole('row')
    .slice(1);

const playerIds = (): (string | null)[] => bodyRows().map((r) => r.getAttribute('data-player-id'));

const cellsOf = (tr: HTMLElement): (string | null)[] =>
  within(tr)
    .getAllByRole('cell')
    .map((cell) => cell.textContent);

/** AC-51's "exactly one candidate is highlighted", asserted on every scenario that uses it. */
const highlightedRow = (): HTMLElement => {
  const marked = bodyRows().filter((r) => r.getAttribute('aria-current') === 'true');
  expect(marked).toHaveLength(1);
  return marked[0] as HTMLElement;
};

const recommendation = (): HTMLElement => screen.getByRole('region', { name: /recommendation/i });

// ---------------------------------------------------------------------------------------------
// Rows (AC-49, AC-44, AC-45)
// ---------------------------------------------------------------------------------------------

describe('candidate rows', () => {
  it('lists the candidates in the ECR order the server shipped, never re-sorted (AC-49, AS-8)', () => {
    renderList();

    expect(playerIds()).toEqual(['rb1', 'wr1', 'te1', 'qb1', 'rb2']);
  });

  it('shows overall ECR rank, positional rank and ADP on every row (AC-49)', () => {
    renderList();
    const cells = cellsOf(bodyRows()[0] as HTMLElement);

    expect(cells[0]).toBe('1');
    expect(cells[1]).toBe('RB1');
    expect(cells[2]).toContain('Bijan Robinson');
    expect(cells[3]).toBe('1.5');
  });

  it('shows a dash rather than a number for a player carrying no ADP (AC-26)', () => {
    renderList();
    const bowers = bodyRows()[2] as HTMLElement;

    expect(cellsOf(bowers)[1]).toBe('TE1');
    expect(cellsOf(bowers)[3]).toBe('—');
  });

  it('shows survival percentage with its band while the user has a subsequent pick (AC-44)', () => {
    renderList();

    expect(cellsOf(bodyRows()[0] as HTMLElement)[4]).toContain('92%');
    expect(cellsOf(bodyRows()[0] as HTMLElement)[4]).toContain('Likely available');
    expect(cellsOf(bodyRows()[1] as HTMLElement)[4]).toContain('18%');
    expect(cellsOf(bodyRows()[1] as HTMLElement)[4]).toContain('Likely gone');
    expect(cellsOf(bodyRows()[2] as HTMLElement)[4]).toContain('Coin flip');
  });

  it('suppresses the survival column entirely when no row carries one (AC-45)', () => {
    renderList(
      data({
        rows: [
          { ...RB1, survival: null },
          { ...WR1, survival: null },
        ],
      }),
    );

    expect(screen.queryByRole('columnheader', { name: /survival/i })).toBeNull();
    expect(screen.getByText(/survival percentages are suppressed/i)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('renders a row added only for the highlight as an ordinary row (AC-49, AC-56)', () => {
    const deepSleeper = row({
      playerId: 'wr9',
      playerName: 'Rome Odunze',
      position: 'WR',
      team: 'CHI',
      ecrRank: 23,
      positionalRank: 9,
      adp: 30,
      survival: survival(0.7, 'coin-flip'),
      addedForHighlight: true,
    });
    renderList(
      data({ rows: [RB1, WR1, deepSleeper], highlightPlayerId: 'wr9', reason: 'Best available.' }),
    );

    expect(playerIds()).toEqual(['rb1', 'wr1', 'wr9']);
    expect(cellsOf(highlightedRow())[0]).toBe('23');
  });
});

// ---------------------------------------------------------------------------------------------
// The highlight and its one-line reason — one test per §T8 scenario (AC-51, AC-52, AC-56..AC-59)
// ---------------------------------------------------------------------------------------------

describe('the highlighted recommendation and its reason line', () => {
  it('a need-driven pick', () => {
    const reason = "Bijan Robinson (RB) fills no unfilled starting slot — Ja'Marr Chase (WR) does.";
    renderList(data({ highlightPlayerId: 'wr1', reasonKind: 'need', reason }));

    expect(highlightedRow().textContent).toContain("Ja'Marr Chase");
    expect(recommendation().textContent).toContain("Ja'Marr Chase");
    expect(screen.getByText(reason)).toBeTruthy();
  });

  it('a value-driven pick', () => {
    const reason =
      'Value: Bijan Robinson is the top available player, and an ADP of 1.5 is 10.5 picks earlier than pick 12.';
    renderList(data({ highlightPlayerId: 'rb1', reasonKind: 'value', reason }));

    expect(highlightedRow().textContent).toContain('Bijan Robinson');
    expect(screen.getByText(reason)).toBeTruthy();
  });

  it('a plan/survival-driven pick', () => {
    const reason =
      "Plan WR now / RB next scores best (3 vs 9) — Ja'Marr Chase over higher-ECR Bijan Robinson.";
    renderList(data({ highlightPlayerId: 'wr1', reasonKind: 'plan-survival', reason }));

    expect(highlightedRow().textContent).toContain("Ja'Marr Chase");
    expect(screen.getByText(reason)).toBeTruthy();
  });

  it('a too-close-to-call pick, whose within-noise statement replaces the reason line (AC-52)', () => {
    const reason =
      "Too close to call: Ja'Marr Chase (ECR 2, 100% survival) and Bijan Robinson (RB, ECR 1, 100% survival) — staying with Ja'Marr Chase.";
    renderList(data({ highlightPlayerId: 'wr1', reasonKind: 'too-close-to-call', reason }));

    expect(highlightedRow().textContent).toContain("Ja'Marr Chase");
    expect(screen.getByText(reason)).toBeTruthy();
  });

  it('a fewer-than-two-picks pick, stating that lookahead does not apply (AC-59)', () => {
    const reason =
      'Lookahead does not apply with 1 pick left — best available: Bijan Robinson (ECR 1).';
    renderList(
      data({
        rows: [
          { ...RB1, survival: null },
          { ...WR1, survival: null },
        ],
        highlightPlayerId: 'rb1',
        reasonKind: 'lookahead-not-applicable',
        reason,
        planComparison: {
          winner: null,
          runnerUp: null,
          separatingFact: null,
          tooClose: false,
          applicable: false,
        },
      }),
    );

    expect(highlightedRow().textContent).toContain('Bijan Robinson');
    expect(screen.getByText(reason)).toBeTruthy();
    expect(recommendation().textContent).not.toContain('Winning plan');
  });

  it('renders the merged tie statement as the one line it arrived as, never two (AC-52, AC-58)', () => {
    const reason =
      "Too close to call: Bijan Robinson (ECR 1, 100% survival) and Ja'Marr Chase (WR, ECR 2, 100% survival) — staying with Bijan Robinson. " +
      'Plan totals within 3 ECR ranks (3 vs 3) — too close to separate, taking the higher-ECR player now: Bijan Robinson (ECR 1).';
    renderList(data({ reasonKind: 'too-close-to-call', reason }));

    expect(screen.getByText(reason)).toBeTruthy();
    expect(screen.getAllByText(/Too close to call/)).toHaveLength(1);
  });

  it('marks exactly one row, and it is the one the server named (AC-51)', () => {
    renderList();

    expect(highlightedRow().getAttribute('data-player-id')).toBe('rb1');
  });

  it('displays the winning plan, the closest alternative and the fact separating them (AC-57)', () => {
    const separatingFact =
      'WR shelf: 2 of 4 likely gone by your next pick (best back at ECR 8); RB: 2 of 4 (ECR 1).';
    renderList(
      data({
        highlightPlayerId: 'wr1',
        reasonKind: 'plan-survival',
        reason: 'Plan WR now / RB next scores best (3 vs 9).',
        planComparison: {
          winner: { nowPosition: 'WR', nextPosition: 'RB', term1: 2, term2: 1, score: 3 },
          runnerUp: { nowPosition: 'RB', nextPosition: 'WR', term1: 1, term2: 8, score: 9 },
          separatingFact,
          tooClose: false,
          applicable: true,
        },
      }),
    );

    expect(within(recommendation()).getByText('WR now / RB next · 3')).toBeTruthy();
    expect(within(recommendation()).getByText('RB now / WR next · 9')).toBeTruthy();
    expect(screen.getByText(separatingFact)).toBeTruthy();
  });

  it('renders nothing in place of a separating fact the server did not name (AC-57)', () => {
    renderList(
      data({
        planComparison: {
          winner: { nowPosition: 'RB', nextPosition: 'WR', term1: 1, term2: 2, score: 3 },
          runnerUp: null,
          separatingFact: null,
          tooClose: false,
          applicable: true,
        },
      }),
    );

    expect(within(recommendation()).getByText('RB now / WR next · 3')).toBeTruthy();
    expect(recommendation().textContent).not.toContain('Closest alternative');
  });
});

// ---------------------------------------------------------------------------------------------
// The position filter (AC-50)
// ---------------------------------------------------------------------------------------------

describe('the position filter', () => {
  it('narrows the list to one position in a single interaction, and back again (AC-50)', () => {
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'RB' }));
    expect(playerIds()).toEqual(['rb1', 'rb2']);

    fireEvent.click(screen.getByRole('button', { name: 'All' }));
    expect(playerIds()).toEqual(['rb1', 'wr1', 'te1', 'qb1', 'rb2']);
  });

  it('shows K and DST rows in positional ECR order with no survival math (AC-50, AS-7)', () => {
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'K' }));
    expect(playerIds()).toEqual(['k1']);
    expect(screen.queryByRole('columnheader', { name: /survival/i })).toBeNull();
    expect(screen.getByText(/no survival math/i)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'DST' }));
    expect(playerIds()).toEqual(['dst1']);
    expect(screen.getByText('Houston Texans')).toBeTruthy();
  });

  it('states that a position carries no ranked players rather than showing an empty table', () => {
    renderList(data({ rowsByPosition: byPosition({ K: [] }) }));

    fireEvent.click(screen.getByRole('button', { name: 'K' }));
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByText(/no available K/i)).toBeTruthy();
  });

  it('keeps the chosen filter when the next board version arrives, so a pick costs no clicks', () => {
    const { rerender } = renderList();
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));

    rerender(
      <CandidateList
        candidateList={insight(data({ rowsByPosition: byPosition({ RB: [RB2] }) }), {
          boardVersion: 2,
        })}
      />,
    );

    expect(playerIds()).toEqual(['rb2']);
    expect(screen.getByRole('button', { name: 'RB' }).getAttribute('aria-pressed')).toBe('true');
  });
});

// ---------------------------------------------------------------------------------------------
// Board-version states (AC-21, AC-48, AC-53) and the disabled modes (AC-28, AC-5)
// ---------------------------------------------------------------------------------------------

describe('board-version and integrity states', () => {
  it('drops a drafted player and re-highlights when the next snapshot lands (AC-53)', () => {
    const { rerender } = renderList();
    expect(playerIds()).toContain('rb1');

    rerender(
      <CandidateList
        candidateList={insight(
          data({
            rows: [WR1, TE1, QB1, RB2],
            highlightPlayerId: 'wr1',
            reason: "Best available: Ja'Marr Chase (ECR 2).",
            rowsByPosition: byPosition({ RB: [RB2] }),
          }),
          { boardVersion: 2 },
        )}
      />,
    );

    expect(screen.queryByText('Bijan Robinson')).toBeNull();
    expect(highlightedRow().getAttribute('data-player-id')).toBe('wr1');
    expect(recommendation().textContent).not.toContain('Bijan Robinson');
  });

  it('keeps the stale list on screen, dimmed and labelled, while recomputing (AC-21, AC-53)', () => {
    renderList(data(), { recomputing: true });

    expect(screen.getByText(/showing the previous board/i)).toBeTruthy();
    const table = screen.getByRole('table', { name: /candidate rows/i });
    expect(table.getAttribute('aria-busy')).toBe('true');
    expect(table.className).toMatch(/opacity-/);
    // Never blanked — FR-3 wants it flagged as stale, still visible.
    expect(playerIds()).toEqual(['rb1', 'wr1', 'te1', 'qb1', 'rb2']);
  });

  it('carries the degraded flag onto the survival output (AC-48)', () => {
    renderList(data(), { degraded: true });

    expect(screen.getByText(/carry that flag/i)).toBeTruthy();
    expect(cellsOf(bodyRows()[0] as HTMLElement)[4]).toContain('92%');
  });

  it('shows both flags when both are set, never collapsing one into the other (AC-21, AC-48)', () => {
    renderList(data(), { recomputing: true, degraded: true });

    expect(screen.getByText(/showing the previous board/i)).toBeTruthy();
    expect(screen.getByText(/carry that flag/i)).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------------------------
// AC-61's one-click trigger. Driven through the **real** controller T14 shipped rather than a
// module mock, so the assertion covers the wiring (right import, right id) and not just that some
// spy was called.
// ---------------------------------------------------------------------------------------------

describe('opening the player card from a row (AC-61)', () => {
  afterEach(() => {
    closePlayerCard();
    vi.unstubAllGlobals();
  });

  const stubFetch = (): void => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 200 }))),
    );
  };

  it('opens that row’s player card in one click', () => {
    stubFetch();
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'Bijan Robinson' }));

    expect(playerCards.getState().playerId).toBe('rb1');
    expect(playerCards.getState().status).toBe('loading');
  });

  it('makes the name a real button, so Enter and Space come from the platform', () => {
    renderList();

    expect(screen.getByRole('button', { name: "Ja'Marr Chase" }).tagName).toBe('BUTTON');
  });

  it('opens the card from a filtered row too, including a DST row with no survival math', () => {
    stubFetch();
    renderList();

    fireEvent.click(screen.getByRole('button', { name: 'DST' }));
    fireEvent.click(screen.getByRole('button', { name: 'Houston Texans' }));

    expect(playerCards.getState().playerId).toBe('dst1');
  });

  it('leaves the position filter and the highlight exactly where they were', () => {
    stubFetch();
    renderList();
    fireEvent.click(screen.getByRole('button', { name: 'RB' }));

    fireEvent.click(screen.getByRole('button', { name: 'Bijan Robinson' }));

    expect(playerIds()).toEqual(['rb1', 'rb2']);
    expect(screen.getByRole('button', { name: 'RB' }).getAttribute('aria-pressed')).toBe('true');
    expect(highlightedRow().getAttribute('data-player-id')).toBe('rb1');
  });
});

describe('the disabled modes', () => {
  it('states "no rankings loaded" instead of rendering an empty candidate list (AC-28)', () => {
    renderList(
      makeCandidateList({
        disabledReason:
          'No rankings snapshot loaded — candidates, survival and recommendations are unavailable.',
      }),
    );

    expect(screen.getByText(/no rankings snapshot loaded/i)).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('group', { name: /position filter/i })).toBeNull();
    expect(screen.queryByRole('region', { name: /recommendation/i })).toBeNull();
  });

  it('keeps the rows but withholds the recommendation while the seat is unresolved (AC-5)', () => {
    renderList(
      data({
        highlightPlayerId: null,
        reason: null,
        reasonKind: null,
        disabledReason:
          'Select your draft slot to see the window, survival projections and the recommendation.',
      }),
    );

    expect(screen.getByText(/select your draft slot/i)).toBeTruthy();
    expect(playerIds()).toEqual(['rb1', 'wr1', 'te1', 'qb1', 'rb2']);
    expect(screen.queryByRole('region', { name: /recommendation/i })).toBeNull();
  });
});
