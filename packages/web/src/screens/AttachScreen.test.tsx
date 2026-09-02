import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  makeCandidateList,
  makePreDraftCheck,
  makeSnapshot,
  makeUnattachedSnapshot,
} from '../test/fixtures';
import { AttachScreen } from './AttachScreen';
import { STORED_USERNAME_KEY } from '../state/api';

const jsonResponse = (body: unknown, init: { ok?: boolean; status?: number } = {}) => ({
  ok: init.ok ?? true,
  status: init.status ?? 200,
  json: () => Promise.resolve(body),
});

const stubFetch = (impl: (url: string, init?: RequestInit) => unknown) => {
  const mock = vi.fn((url: string, init?: RequestInit) => Promise.resolve(impl(url, init)));
  vi.stubGlobal('fetch', mock);
  return mock;
};

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AttachScreen — paste (FR-1)', () => {
  it('shows the paste field as the one attach path (AC-3)', () => {
    stubFetch(() => jsonResponse({}));
    render(<AttachScreen snapshot={makeUnattachedSnapshot()} onConfirm={vi.fn()} onDetach={vi.fn()} />);

    expect(screen.getByLabelText(/sleeper draft url or id/i)).toBeTruthy();
  });

  it('renders no recent-drafts list even with a stored username (removed 2026-08-31)', () => {
    window.localStorage.setItem(STORED_USERNAME_KEY, 'willyu');
    const fetchMock = stubFetch(() => jsonResponse({}));

    render(<AttachScreen snapshot={makeUnattachedSnapshot()} onConfirm={vi.fn()} onDetach={vi.fn()} />);

    expect(screen.queryByRole('region', { name: /your recent drafts/i })).toBeNull();
    // The username is kept for seat detection only — chat may read its ephemeral session status,
    // but no recent-drafts request is made on render.
    expect(fetchMock.mock.calls.some((call) => call[0].startsWith('/api/drafts'))).toBe(false);
  });

  it('attaches by posting the pasted input together with the stored username', async () => {
    window.localStorage.setItem(STORED_USERNAME_KEY, 'willyu');
    const fetchMock = stubFetch((url) =>
      url.startsWith('/api/drafts') ? jsonResponse({ drafts: [] }) : jsonResponse(makeSnapshot()),
    );

    render(<AttachScreen snapshot={makeUnattachedSnapshot()} onConfirm={vi.fn()} onDetach={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/sleeper draft url or id/i), {
      target: { value: 'https://sleeper.com/draft/nfl/1234567890' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^attach$/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => call[0] === '/api/attach')).toBe(true);
    });
    const attachCall = fetchMock.mock.calls.find((call) => call[0] === '/api/attach');
    expect(JSON.parse((attachCall?.[1] as RequestInit).body as string)).toEqual({
      input: 'https://sleeper.com/draft/nfl/1234567890',
      sleeperUsername: 'willyu',
    });
  });

  it('states which failure occurred and keeps what the user entered (AC-7)', async () => {
    stubFetch(() =>
      jsonResponse(
        {
          failure: {
            kind: 'draft-not-found',
            message: 'Sleeper has no draft 999. Check the id and try again.',
            input: '999',
          },
        },
        { ok: false, status: 404 },
      ),
    );

    render(<AttachScreen snapshot={makeUnattachedSnapshot()} onConfirm={vi.fn()} onDetach={vi.fn()} />);
    const field = screen.getByLabelText(/sleeper draft url or id/i) as HTMLInputElement;
    fireEvent.change(field, { target: { value: '999' } });
    fireEvent.click(screen.getByRole('button', { name: /^attach$/i }));

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/sleeper has no draft 999/i);
    expect(field.value).toBe('999');
  });
});

describe('AttachScreen — confirmation surface (UJ-1)', () => {
  it('displays every seat, bot and empty ones by slot number (AC-2)', () => {
    stubFetch(() => jsonResponse({ drafts: [] }));
    render(<AttachScreen snapshot={makeSnapshot()} onConfirm={vi.fn()} onDetach={vi.fn()} />);

    const teams = screen.getByRole('region', { name: /teams and owners/i });
    expect(within(teams).getByText(/gridiron gurus/i)).toBeTruthy();
    expect(within(teams).getByText(/dynastydan/i)).toBeTruthy();
    expect(within(teams).getByText(/bot seat/i)).toBeTruthy();
    expect(within(teams).getByText(/empty seat/i)).toBeTruthy();
    // Every row is anchored on its slot number, which is all an unnamed seat has (AC-2).
    for (const slot of [1, 2, 3, 4]) {
      expect(within(teams).getByText(new RegExp(`slot ${slot}\\b`, 'i'))).toBeTruthy();
    }
  });

  it('surfaces the pre-draft check content the user confirms against (AC-22..AC-27)', () => {
    stubFetch(() => jsonResponse({ drafts: [] }));
    render(<AttachScreen snapshot={makeSnapshot()} onConfirm={vi.fn()} onDetach={vi.fn()} />);

    const check = screen.getByRole('region', { name: /pre-draft check/i });
    expect(check.textContent).toMatch(/fantasypros\.com/i);
    expect(check.textContent).toMatch(/30 h old/i);
    expect(check.textContent).toMatch(/fantasyfootballcalculator\.com/i);
    expect(check.textContent).toMatch(/12-team half-PPR pool/i);
    expect(check.textContent).toMatch(/the ECR snapshot is 30 h old/i);
    expect(check.textContent).toMatch(/this league scores ppr/i);
    expect(check.textContent).toMatch(/bucky irving/i);
    expect(check.textContent).toMatch(/brock bowers/i);
    expect(check.textContent).toMatch(/10 teams/i);
    expect(check.textContent).toMatch(/15 rounds/i);
    expect(check.textContent).toMatch(/half_ppr/i);
  });

  it('states the no-rankings-loaded mode explicitly (AC-28)', () => {
    stubFetch(() => jsonResponse({ drafts: [] }));
    render(
      <AttachScreen
        snapshot={makeSnapshot({
          preDraftCheck: makePreDraftCheck({
            ecrSnapshot: null,
            warnings: [
              {
                code: 'no-ecr-loaded',
                message:
                  'No ECR snapshot loaded. Board sync, rosters and the pick feed still run; the ' +
                  'candidate list, survival and recommendations are disabled.',
              },
            ],
          }),
          candidateList: {
            data: makeCandidateList({ disabledReason: 'No rankings loaded.' }),
            boardVersion: 1,
            recomputing: false,
            degraded: false,
          },
        })}
        onConfirm={vi.fn()}
        onDetach={vi.fn()}
      />,
    );

    const check = screen.getByRole('region', { name: /pre-draft check/i });
    expect(check.textContent).toMatch(/no ecr snapshot loaded/i);
    expect(check.textContent).toMatch(/candidate list, survival and recommendations are disabled/i);
  });

  it('confirms the draft and hands off to the draft screen (UJ-1)', () => {
    stubFetch(() => jsonResponse({ drafts: [] }));
    const onConfirm = vi.fn();
    render(<AttachScreen snapshot={makeSnapshot()} onConfirm={onConfirm} onDetach={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /start drafting/i }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});

describe('AttachScreen — manual slot picker (AC-5)', () => {
  const unresolved = () =>
    makeSnapshot({
      attach: { status: 'needs-manual-slot', draftId: '1234567890', isMock: true },
    });

  it('shows the picker only while the seat is unresolved', () => {
    stubFetch(() => jsonResponse({ drafts: [] }));
    const { unmount } = render(<AttachScreen snapshot={unresolved()} onConfirm={vi.fn()} onDetach={vi.fn()} />);
    expect(screen.getByRole('region', { name: /your draft slot/i })).toBeTruthy();

    unmount();
    render(<AttachScreen snapshot={makeSnapshot()} onConfirm={vi.fn()} onDetach={vi.fn()} />);
    expect(screen.queryByRole('region', { name: /your draft slot/i })).toBeNull();
  });

  it('blocks confirmation until a seat is chosen, naming what stays blocked', () => {
    stubFetch(() => jsonResponse({ drafts: [] }));
    render(<AttachScreen snapshot={unresolved()} onConfirm={vi.fn()} onDetach={vi.fn()} />);

    const confirm = screen.getByRole('button', { name: /start drafting/i });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('region', { name: /your draft slot/i }).textContent).toMatch(
      /survival/i,
    );
  });

  it('posts the clicked seat to the attach route — one button per slot, no dropdown', async () => {
    const fetchMock = stubFetch((url) =>
      url.startsWith('/api/drafts') ? jsonResponse({ drafts: [] }) : jsonResponse(makeSnapshot()),
    );
    render(<AttachScreen snapshot={unresolved()} onConfirm={vi.fn()} onDetach={vi.fn()} />);

    // The teams list itself is the picker (user request, 2026-08-26): no combobox anywhere,
    // one "This is me" button beside every seat row.
    expect(screen.queryByRole('combobox')).toBeNull();
    const teams = screen.getByRole('region', { name: /teams and owners/i });
    expect(within(teams).getAllByRole('button', { name: /this is me/i })).toHaveLength(4);

    fireEvent.click(within(teams).getByRole('button', { name: /this is me — slot 2/i }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => call[0] === '/api/attach')).toBe(true);
    });
    const call = fetchMock.mock.calls.find((c) => c[0] === '/api/attach');
    expect(JSON.parse((call?.[1] as RequestInit).body as string)).toEqual({ draftSlot: 2 });
  });

  it('offers no seat buttons once the seat is resolved', () => {
    stubFetch(() => jsonResponse({ drafts: [] }));
    render(<AttachScreen snapshot={makeSnapshot()} onConfirm={vi.fn()} onDetach={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /this is me/i })).toBeNull();
  });
});

describe('AttachScreen — detach (AC-41)', () => {
  it('offers Detach next to Attach once a draft is attached, and wires the handler', () => {
    stubFetch(() => jsonResponse({}));
    const onDetach = vi.fn();
    render(<AttachScreen snapshot={makeSnapshot()} onConfirm={vi.fn()} onDetach={onDetach} />);

    const detach = screen.getByRole('button', { name: /^detach$/i });
    fireEvent.click(detach);
    expect(onDetach).toHaveBeenCalledTimes(1);
    // Attach stays alongside — pasting a different draft remains the switch path.
    expect(screen.getByRole('button', { name: /^attach$/i })).toBeTruthy();
  });

  it('shows no Detach button while nothing is attached', () => {
    stubFetch(() => jsonResponse({}));
    render(<AttachScreen snapshot={makeUnattachedSnapshot()} onConfirm={vi.fn()} onDetach={vi.fn()} />);

    expect(screen.queryByRole('button', { name: /^detach$/i })).toBeNull();
  });
});
