/**
 * The rankings-format toggle (2026-09-02): Half PPR ⇄ Full PPR.
 *
 * Lives on the attach screen only — the format is set before the draft starts. Before an attach
 * it chooses the board, positional tiers and ADP pool the attach fetches; while the pre-draft
 * check is still on screen (attached, not yet confirmed) it re-attaches the draft on the other
 * format's sources, so a scoring-mismatch warning can be acted on with one click. It is not
 * offered on the draft screen: the snapshots are frozen per attach (AC-29), and every survival
 * percentage, tier fact and plan score there was computed from the board that was chosen.
 *
 * Presentational only: the caller owns the value and the request. Rendered as a radio group so
 * the current format is announced as the checked option, not as a pressed button.
 */
import { RANKINGS_FORMATS, RANKINGS_FORMAT_LABELS } from '@sidekick/shared';
import type { RankingsFormat } from '@sidekick/shared';

export interface RankingsFormatToggleProps {
  value: RankingsFormat;
  onChange: (format: RankingsFormat) => void;
  /** While a switch is in flight, or when the screen cannot accept one. */
  disabled?: boolean;
}

export function RankingsFormatToggle({ value, onChange, disabled = false }: RankingsFormatToggleProps) {
  return (
    <div role="radiogroup" aria-label="Rankings format" className="inline-flex items-center gap-3">
      <span className="text-sm font-medium text-slate-200">Rankings format</span>
      <div className="inline-flex overflow-hidden rounded-md border border-slate-700">
        {RANKINGS_FORMATS.map((format) => {
          const selected = format === value;
          return (
            <button
              key={format}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => {
                if (!selected) onChange(format);
              }}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors disabled:opacity-50 ${
                selected
                  ? 'bg-emerald-600 text-white'
                  : 'bg-slate-900 text-slate-300 hover:bg-slate-800'
              }`}
            >
              {RANKINGS_FORMAT_LABELS[format]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
