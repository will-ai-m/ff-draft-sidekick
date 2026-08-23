import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from './App';
import { AppStateStore } from './state/store';
import { FakeEventSource, fakeEventSourceFactory } from './test/fakeEventSource';
import { makeSnapshot, makeUnattachedSnapshot } from './test/fixtures';

const connectedStore = (): AppStateStore => {
  const store = new AppStateStore({ createEventSource: fakeEventSourceFactory });
  store.connect();
  return store;
};

const push = (snapshot: ReturnType<typeof makeSnapshot>): void => {
  act(() => {
    FakeEventSource.latest.emitSnapshot(snapshot);
  });
};

beforeEach(() => {
  window.localStorage.clear();
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) })),
  );
});

afterEach(() => {
  FakeEventSource.reset();
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('waits for the first SSE frame instead of rendering an invented empty state', () => {
    render(<App store={connectedStore()} />);

    expect(screen.getByText(/waiting for the first update/i)).toBeTruthy();
    expect(screen.queryByLabelText(/sleeper draft url or id/i)).toBeNull();
  });

  it('renders the attach screen from an unattached snapshot', () => {
    render(<App store={connectedStore()} />);
    push(makeUnattachedSnapshot());

    expect(screen.getByLabelText(/sleeper draft url or id/i)).toBeTruthy();
    expect(screen.queryByRole('region', { name: /candidate list/i })).toBeNull();
  });

  it('moves to the draft screen only once the user confirms, showing the five named surfaces', () => {
    render(<App store={connectedStore()} />);
    push(makeSnapshot());

    // Attached, but not yet confirmed: UJ-1 puts the confirmation between attach and the board.
    expect(screen.getByRole('region', { name: /teams and owners/i })).toBeTruthy();
    expect(screen.queryByRole('region', { name: /candidate list/i })).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /start drafting/i }));

    expect(screen.getByRole('status', { name: /sync indicator/i })).toBeTruthy();
    for (const name of [
      /candidate list/i,
      /opponent panel/i,
      /roster panel/i,
      /pick feed/i,
    ] as const) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
  });

  it('replaces the whole view when the server publishes a detached snapshot', () => {
    render(<App store={connectedStore()} />);
    push(makeSnapshot());
    fireEvent.click(screen.getByRole('button', { name: /start drafting/i }));
    expect(screen.getByRole('region', { name: /candidate list/i })).toBeTruthy();

    push(makeUnattachedSnapshot());

    expect(screen.queryByRole('region', { name: /candidate list/i })).toBeNull();
    expect(screen.getByLabelText(/sleeper draft url or id/i)).toBeTruthy();
  });

  it('warns when the SSE stream drops, so a dead server never looks like a quiet draft', () => {
    render(<App store={connectedStore()} />);
    push(makeSnapshot());
    fireEvent.click(screen.getByRole('button', { name: /start drafting/i }));

    act(() => {
      FakeEventSource.latest.fail();
    });

    expect(screen.getByRole('alert').textContent).toMatch(/lost the connection/i);
  });
});
