/**
 * The frame every named surface on the draft screen sits in.
 *
 * The `title` is also the accessible name, and the titles are PRD §9 Terms verbatim — candidate
 * list, opponent panel, roster panel, pick feed — so the vocabulary the constitution makes binding
 * on identifiers is the same vocabulary a screen reader (and every component test) addresses them
 * by, rather than a second set of display-only names.
 */
import type { ReactNode } from 'react';

export interface PanelProps {
  title: string;
  /** Small right-aligned status text — "recomputing", a count, a caption. */
  badge?: ReactNode;
  children: ReactNode;
}

export function Panel({ title, badge, children }: PanelProps) {
  return (
    <section
      aria-label={title}
      className="flex min-h-0 flex-col rounded-lg border border-slate-800 bg-slate-900/60"
    >
      <header className="flex items-baseline justify-between gap-3 border-b border-slate-800 px-4 py-2.5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{title}</h2>
        {badge !== undefined && <span className="text-xs text-slate-500">{badge}</span>}
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-3 text-sm text-slate-300">
        {children}
      </div>
    </section>
  );
}

/** What a panel shows until the task that owns it fills it in. */
export function PanelPlaceholder({ task }: { task: string }) {
  return <p className="text-sm text-slate-500">Rendered by {task}.</p>;
}
