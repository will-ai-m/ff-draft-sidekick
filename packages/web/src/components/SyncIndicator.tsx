/**
 * The **sync indicator** (PRD §9 Terms, FR-3).
 *
 * AC-16 asks for the last successful sync time and a healthy/degraded reading "at all times", so
 * the elapsed reading ticks locally once a second rather than only when a broadcast lands. Between
 * picks the server has nothing new to say, and a frozen "last sync" would be indistinguishable
 * from a stalled poll loop — the exact condition this indicator exists to make visible.
 *
 * Three states, in priority order: **degraded** (the board itself cannot be trusted, AC-17) beats
 * **recomputing** (the board is fine, an insight derived from it is behind, AC-21) beats healthy.
 * They are separate facts and the component never collapses one into the other.
 */
import { useEffect, useState } from 'react';
import type { SyncState } from '@sidekick/shared';

import { postResync } from '../state/api';

export interface SyncIndicatorProps {
  sync: SyncState;
  /** True when any insight on screen was computed from an older board version (AC-21). */
  recomputing: boolean;
}

/** How often the elapsed reading is recomputed. Purely a display cadence, not a poll. */
const TICK_MS = 1000;

const elapsedLabel = (lastSuccessfulSyncAt: string | null, now: number): string => {
  if (lastSuccessfulSyncAt === null) return 'never';
  const then = Date.parse(lastSuccessfulSyncAt);
  if (Number.isNaN(then)) return 'unknown';

  const seconds = Math.max(0, Math.floor((now - then) / 1000));
  if (seconds < 1) return 'just now';
  if (seconds < 60) return `${seconds} s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  return `${Math.floor(minutes / 60)} h ago`;
};

type Health = 'degraded' | 'recomputing' | 'healthy';

const HEALTH_STYLES: Readonly<Record<Health, string>> = {
  degraded: 'bg-rose-500/15 text-rose-300 ring-rose-500/40',
  recomputing: 'bg-amber-500/15 text-amber-300 ring-amber-500/40',
  healthy: 'bg-emerald-500/15 text-emerald-300 ring-emerald-500/40',
};

const HEALTH_LABELS: Readonly<Record<Health, string>> = {
  degraded: 'Degraded',
  recomputing: 'Recomputing',
  healthy: 'Healthy',
};

export function SyncIndicator({ sync, recomputing }: SyncIndicatorProps) {
  const [now, setNow] = useState(() => Date.now());
  const [resyncPending, setResyncPending] = useState(false);
  const [resyncMessage, setResyncMessage] = useState<string | null>(null);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, TICK_MS);
    return () => {
      clearInterval(timer);
    };
  }, []);

  const health: Health =
    sync.status === 'degraded' ? 'degraded' : recomputing ? 'recomputing' : 'healthy';

  const runResync = (): void => {
    setResyncPending(true);
    setResyncMessage(null);
    void postResync().then((result) => {
      setResyncPending(false);
      setResyncMessage(
        result.ok
          ? `Rebuilt in ${result.durationMs ?? 0} ms.`
          : (result.error ?? 'Re-sync failed.'),
      );
    });
  };

  return (
    <section
      role="status"
      aria-label="Sync indicator"
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-slate-800 bg-slate-900/60 px-4 py-3"
    >
      <span
        className={`rounded-full px-2.5 py-1 text-xs font-semibold uppercase tracking-wide ring-1 ${HEALTH_STYLES[health]}`}
      >
        {HEALTH_LABELS[health]}
      </span>

      <span className="text-sm text-slate-300">
        Last sync {elapsedLabel(sync.lastSuccessfulSyncAt, now)}
      </span>

      {sync.draftStatus !== null && (
        <span className="text-sm text-slate-400">Draft: {sync.draftStatus}</span>
      )}

      <button
        type="button"
        onClick={runResync}
        disabled={resyncPending}
        className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-100 hover:bg-slate-700 disabled:opacity-50"
      >
        {resyncPending ? 'Re-syncing…' : 'Re-sync'}
      </button>

      {sync.degradedReason !== null && (
        <p className="w-full text-sm text-rose-300">{sync.degradedReason}</p>
      )}
      {resyncMessage !== null && <p className="w-full text-sm text-slate-400">{resyncMessage}</p>}
    </section>
  );
}
