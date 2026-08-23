import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { SyncState } from '@sidekick/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SyncIndicator } from './SyncIndicator';

const SYNCED_AT = '2026-08-21T18:00:00.000Z';

const healthy = (overrides: Partial<SyncState> = {}): SyncState => ({
  lastSuccessfulSyncAt: new Date().toISOString(),
  status: 'healthy',
  boardVersion: 4,
  draftStatus: 'drafting',
  degradedReason: null,
  ...overrides,
});

const indicator = (): HTMLElement => screen.getByRole('status', { name: /sync indicator/i });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('SyncIndicator', () => {
  it('shows healthy, the draft status and the last successful sync time (AC-14, AC-16)', () => {
    render(<SyncIndicator sync={healthy()} recomputing={false} />);

    expect(indicator().textContent).toMatch(/healthy/i);
    expect(indicator().textContent).toMatch(/drafting/i);
    expect(indicator().textContent).toMatch(/just now/i);
  });

  it('ticks the last-sync reading between broadcasts, so a stalled loop is visible (AC-16)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(SYNCED_AT));
    render(
      <SyncIndicator sync={healthy({ lastSuccessfulSyncAt: SYNCED_AT })} recomputing={false} />,
    );

    act(() => {
      vi.advanceTimersByTime(9_000);
    });
    expect(indicator().textContent).toMatch(/9 s ago/);

    act(() => {
      vi.advanceTimersByTime(51_000);
    });
    expect(indicator().textContent).toMatch(/1 min ago/);
  });

  it('reads "never" before the first successful sync', () => {
    render(<SyncIndicator sync={healthy({ lastSuccessfulSyncAt: null })} recomputing={false} />);

    expect(indicator().textContent).toMatch(/never/i);
  });

  it('shows degraded plus the reason the board cannot be trusted (AC-17)', () => {
    render(
      <SyncIndicator
        sync={healthy({
          status: 'degraded',
          degradedReason: 'Pick count decreased from 24 to 23.',
        })}
        recomputing={false}
      />,
    );

    expect(indicator().textContent).toMatch(/degraded/i);
    expect(indicator().textContent).toMatch(/pick count decreased from 24 to 23/i);
  });

  it('shows recomputing when insights are behind the board, without claiming degraded (AC-21)', () => {
    render(<SyncIndicator sync={healthy()} recomputing />);

    expect(indicator().textContent).toMatch(/recomputing/i);
    expect(indicator().textContent).not.toMatch(/degraded/i);
  });

  it('lets degraded outrank recomputing — an untrusted board is the bigger fact', () => {
    render(
      <SyncIndicator
        sync={healthy({ status: 'degraded', degradedReason: 'Poll timed out.' })}
        recomputing
      />,
    );

    expect(indicator().textContent).toMatch(/degraded/i);
  });

  it('posts to /api/resync when Re-sync is pressed and reports the rebuild (AC-19)', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true, durationMs: 412, boardVersion: 5, failure: null }),
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<SyncIndicator sync={healthy()} recomputing={false} />);
    fireEvent.click(screen.getByRole('button', { name: /re-sync/i }));

    await waitFor(() => {
      expect(indicator().textContent).toMatch(/rebuilt in 412 ms/i);
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('/api/resync');
    expect((fetchMock.mock.calls[0]?.[1] as RequestInit).method).toBe('POST');
  });

  it('surfaces a failed Re-sync instead of silently leaving the board as it was', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () =>
          Promise.resolve({ error: 'No draft is attached, so there is nothing to re-sync.' }),
      }),
    );

    render(<SyncIndicator sync={healthy()} recomputing={false} />);
    fireEvent.click(screen.getByRole('button', { name: /re-sync/i }));

    await waitFor(() => {
      expect(indicator().textContent).toMatch(/nothing to re-sync/i);
    });
  });
});
