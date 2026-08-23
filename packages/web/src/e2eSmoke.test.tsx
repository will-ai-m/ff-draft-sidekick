/**
 * T15's frontend half: the real UI, rendered against the real server's answer for the same
 * 150-pick fixture draft.
 *
 * Every other web test in this suite feeds hand-built `AppStateSnapshot` fixtures, which proves
 * each panel renders its slice correctly but cannot prove the two halves of the app agree about
 * the shape. This one closes that gap: the snapshot is produced by standing the actual
 * `Orchestrator` up over the e2e fixtures (msw, no network), serialising it exactly as the SSE hub
 * does, and pushing that JSON through the store the browser really uses.
 *
 * Deliberately smoke-level, per design.md §T15 — "does it hang together", not a second pass at
 * what T12–T14 already assert panel by panel. The board it renders is the same end state the
 * server-side replay converges to; `e2eReplay.test.ts` asserts that equality directly (AC-13), so
 * attaching at the full board here buys the same picture without paying for the replay twice.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { AppStateSnapshot } from '@sidekick/shared';

import { attachAtFullBoard, createE2eMswServer } from '../../server/test/e2eReplay';
import { e2eBoard } from '../../server/test/fixtures/e2eDraft';
import { App } from './App';
import { AppStateStore } from './state/store';
import { FakeEventSource, fakeEventSourceFactory } from './test/fakeEventSource';

const server: ReturnType<typeof createE2eMswServer> = createE2eMswServer();

let snapshot: AppStateSnapshot;
let dispose = (): void => undefined;

/**
 * jsdom defines its own `AbortController`/`AbortSignal`, and Node's `fetch` (undici) brand-checks
 * the signal it is handed against *its* class — so server code that passes a timeout signal fails
 * with "Expected signal to be an instance of AbortSignal" the moment it runs inside this
 * environment. The signals are only request deadlines, and the fixtures answer instantly, so this
 * suite drops them for the one attach it performs. Nothing else here touches the network, and the
 * server's own suite (node environment) exercises the timeouts for real.
 */
const withoutAbortSignals = async <T,>(work: () => Promise<T>): Promise<T> => {
  const patched = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (init === undefined || init.signal === undefined) return patched(input, init);
    const rest: RequestInit = { ...init };
    delete rest.signal;
    return patched(input, rest);
  }) as typeof globalThis.fetch;
  try {
    return await work();
  } finally {
    globalThis.fetch = patched;
  }
};

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'bypass' });
  const result = await withoutAbortSignals(() => attachAtFullBoard({ variant: 'mock', server }));
  snapshot = result.snapshot;
  dispose = () => {
    result.harness.dispose();
  };
}, 60_000);

afterAll(() => {
  dispose();
  server.close();
});

afterEach(() => {
  FakeEventSource.reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Renders the app, delivers the server's snapshot over SSE, and confirms the draft (UJ-1). */
const renderConfirmed = (): { errors: unknown[][] } => {
  const errors: unknown[][] = [];
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errors.push(args);
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })),
  );

  const store = new AppStateStore({ createEventSource: fakeEventSourceFactory });
  store.connect();
  render(<App store={store} />);
  act(() => {
    FakeEventSource.latest.emitSnapshot(snapshot);
  });
  fireEvent.click(screen.getByRole('button', { name: /start drafting/i }));
  return { errors };
};

describe('the frontend against the end-to-end fixture’s final snapshot', () => {
  it('renders all five named surfaces with no unhandled error', () => {
    const { errors } = renderConfirmed();

    expect(screen.getByRole('status', { name: /sync indicator/i })).toBeTruthy();
    for (const name of [
      /candidate list/i,
      /opponent panel/i,
      /roster panel/i,
      /pick feed/i,
    ] as const) {
      const region = screen.getByRole('region', { name });
      expect(region.textContent?.trim().length ?? 0).toBeGreaterThan(0);
    }

    expect(errors).toEqual([]);
  });

  it('renders the whole 150-pick feed, the user’s own picks flagged', () => {
    renderConfirmed();

    const feed = screen.getByRole('list', { name: /picks, most recent first/i });
    expect(feed.querySelectorAll('li')).toHaveLength(e2eBoard.pickScript.length);
    // The exact label is the mine-vs-opponent badge; the row's own label merely mentions it.
    expect(screen.getAllByLabelText('Your pick').length).toBe(
      snapshot.pickFeed.filter((entry) => entry.isUserPick).length,
    );
  });

  it('shows the unmatched pick under its raw name with a visible warning (AC-20)', () => {
    renderConfirmed();

    const warnings = screen.getAllByRole('note');
    expect(warnings).toHaveLength(1);
    expect(warnings[0]?.getAttribute('aria-label')).toContain(e2eBoard.unmatchedPlayer.name);
    expect(screen.getByText(e2eBoard.unmatchedPlayer.name)).toBeTruthy();
  });

  it('renders candidate rows the board has not drafted, with survival suppressed (AC-45)', () => {
    renderConfirmed();

    const rows = screen
      .getByRole('table', { name: /candidate rows/i })
      .querySelectorAll('tbody tr');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const name = row.querySelector('td')?.textContent ?? '';
      expect(name.length).toBeGreaterThan(0);
    }
    // The draft is over, so nobody has a next pick — the list says so instead of showing numbers.
    expect(screen.getByText(/survival percentages are suppressed/i)).toBeTruthy();
  });

  it('survives the exact bytes the SSE hub would send, not a hand-built object', () => {
    // The store parses a JSON string; anything unserialisable in the server's snapshot (a Map, a
    // Set, an undefined that a hand-built fixture would have spelled null) would surface here.
    const wire = JSON.stringify(snapshot);
    expect(JSON.parse(wire)).toEqual(snapshot);
    expect(wire.length).toBeGreaterThan(10_000);
  });
});
