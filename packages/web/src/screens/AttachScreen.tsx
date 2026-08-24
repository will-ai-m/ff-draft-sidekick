/**
 * The attach screen (FR-1, UJ-1).
 *
 * UJ-1's path, in order: paste the draft's URL/ID (or pick one off the optional username-based
 * convenience list) → the draft's teams and owners come up → the user confirms it is the right
 * draft, clicking their slot if auto-detect could not find it → the pre-draft check reports what
 * Sidekick is about to draft with → the board screen.
 *
 * Two rules shape the details:
 * - **Paste is the primary path regardless** (AC-3). The field is never gated behind the
 *   convenience list, and the list only appears when a username is already stored.
 * - **A failure never costs the user their input** (AC-7). The field is controlled state that no
 *   error path clears, and the server echoes the input back with the classified failure so a retry
 *   never has to reconstruct it.
 */
import { useEffect, useState } from 'react';
import type { AppStateSnapshot, PreDraftCheckData, SnapshotInfo, Team } from '@sidekick/shared';

import {
  fetchUserDrafts,
  postAttach,
  postDraftSlot,
  readStoredUsername,
  writeStoredUsername,
} from '../state/api';
import type { AttachFailure, DraftSummary } from '../state/api';

export interface AttachScreenProps {
  snapshot: AppStateSnapshot;
  /** UJ-1's explicit "yes, this is the right draft" — the only way onto the draft screen. */
  onConfirm: () => void;
}

const seatLabel = (team: Team): string =>
  team.displayName ?? (team.isBotSeat ? 'Bot seat' : 'Empty seat');

const ageLabel = (info: SnapshotInfo): string =>
  info.ageHours === null ? 'age unknown' : `${Math.round(info.ageHours)} h old`;

export function AttachScreen({ snapshot, onConfirm }: AttachScreenProps) {
  const { attach, preDraftCheck } = snapshot;
  const isAttached = attach.status === 'attached' || attach.status === 'needs-manual-slot';
  const needsSlot = attach.status === 'needs-manual-slot';

  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<AttachFailure | null>(null);

  const [storedUsername, setStoredUsername] = useState(() => readStoredUsername());
  const [usernameDraft, setUsernameDraft] = useState(() => readStoredUsername());
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draftsError, setDraftsError] = useState<string | null>(null);

  const [slotChoice, setSlotChoice] = useState('');

  useEffect(() => {
    if (storedUsername === '') return;
    let cancelled = false;
    setDraftsError(null);
    void fetchUserDrafts(storedUsername)
      .then((list) => {
        if (!cancelled) setDrafts(list);
      })
      .catch((error: Error) => {
        if (!cancelled) setDraftsError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [storedUsername]);

  const runAttach = (value: string): void => {
    if (value.trim() === '' || pending) return;
    setPending(true);
    setFailure(null);
    void postAttach({ input: value, sleeperUsername: storedUsername }).then((result) => {
      setPending(false);
      // The input is never cleared here, on either branch — AC-7's "retry without discarding what
      // the user already entered" is a property of this state, not of the error message.
      if (!result.ok) setFailure(result.failure);
    });
  };

  const chooseSlot = (): void => {
    if (slotChoice === '') return;
    setPending(true);
    void postDraftSlot(Number(slotChoice)).then((result) => {
      setPending(false);
      if (!result.ok) setFailure(result.failure);
    });
  };

  const errorMessage =
    failure?.message ?? (attach.status === 'error' ? (attach.error ?? null) : null);

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-6 py-10 text-slate-100">
      <header>
        <h1 className="text-2xl font-semibold">Draft Sidekick</h1>
        <p className="mt-1 text-sm text-slate-400">
          Attach to one live Sleeper draft. Sidekick never writes to Sleeper — the draft room stays
          the only picking surface.
        </p>
      </header>

      <section
        aria-label="Attach to a draft"
        className="rounded-lg border border-slate-800 bg-slate-900/60 p-5"
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            runAttach(input);
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="draft-input" className="text-sm font-medium text-slate-200">
            Sleeper draft URL or ID
          </label>
          <div className="flex gap-2">
            <input
              id="draft-input"
              type="text"
              value={input}
              onChange={(event) => {
                setInput(event.target.value);
              }}
              placeholder="https://sleeper.com/draft/nfl/1234567890"
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <button
              type="submit"
              disabled={pending}
              className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Attach
            </button>
          </div>
        </form>

        <div className="mt-4 flex flex-col gap-2 border-t border-slate-800 pt-4">
          <label htmlFor="username-input" className="text-sm font-medium text-slate-200">
            Sleeper username
          </label>
          <div className="flex gap-2">
            <input
              id="username-input"
              type="text"
              value={usernameDraft}
              onChange={(event) => {
                setUsernameDraft(event.target.value);
              }}
              className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            />
            <button
              type="button"
              onClick={() => {
                const next = usernameDraft.trim();
                writeStoredUsername(next);
                setStoredUsername(next);
              }}
              className="rounded-md border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-medium hover:bg-slate-700"
            >
              Save username
            </button>
          </div>
          <p className="text-xs text-slate-500">
            Optional. Stored locally; used to find your seat in the draft order and to list your
            drafts below.
          </p>
        </div>

        {attach.status === 'attaching' && <p className="mt-4 text-sm text-slate-400">Attaching…</p>}
        {errorMessage !== null && (
          <p
            role="alert"
            className="mt-4 rounded-md border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200"
          >
            {errorMessage}
          </p>
        )}
      </section>

      {storedUsername !== '' && (
        <section
          aria-label="Your recent drafts"
          className="rounded-lg border border-slate-800 bg-slate-900/60 p-5"
        >
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            Your recent drafts
          </h2>
          {draftsError !== null && <p className="mt-2 text-sm text-amber-300">{draftsError}</p>}
          {draftsError === null && drafts.length === 0 && (
            <p className="mt-2 text-sm text-slate-500">No drafts found for {storedUsername}.</p>
          )}
          <ul className="mt-3 flex flex-col gap-2">
            {drafts.map((draft) => (
              <li
                key={draft.draftId}
                className="flex items-center justify-between gap-3 rounded-md border border-slate-800 px-3 py-2"
              >
                <span className="text-sm text-slate-200">
                  {draft.name ?? `Draft ${draft.draftId}`}
                </span>
                <span className="text-xs text-slate-500">
                  {draft.season} · {draft.type} · {draft.teamCount} teams ·{' '}
                  {draft.isMock ? 'mock' : 'league'} · {draft.status}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setInput(draft.draftId);
                    runAttach(draft.draftId);
                  }}
                  className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs font-medium hover:bg-slate-700"
                >
                  Use this draft
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {isAttached && (
        <>
          <section
            aria-label="Teams and owners"
            className="rounded-lg border border-slate-800 bg-slate-900/60 p-5"
          >
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
              Teams and owners
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              Draft {attach.draftId} · {attach.isMock === true ? 'mock draft' : 'league draft'}
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {snapshot.board.teams.map((team) => (
                <li
                  key={team.teamId}
                  className="flex items-baseline gap-3 rounded-md border border-slate-800 px-3 py-2"
                >
                  <span className="w-16 shrink-0 text-xs uppercase tracking-wide text-slate-500">
                    Slot {team.draftSlot}
                  </span>
                  <span className="text-sm text-slate-200">{seatLabel(team)}</span>
                  <span className="text-xs text-slate-400">{team.ownerDisplayName ?? '—'}</span>
                  {team.isUser && (
                    <span className="ml-auto text-xs font-semibold text-emerald-400">You</span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {needsSlot && (
            <section
              aria-label="Your draft slot"
              className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-5"
            >
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-200">
                Your draft slot
              </h2>
              <p className="mt-1 text-sm text-amber-100">
                Sidekick could not find your Sleeper user id in this draft&apos;s order.
                Mine-vs-opponent, next-pick and survival output stay blocked until you pick your
                seat.
              </p>
              <div className="mt-3 flex items-end gap-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="slot-select" className="text-xs font-medium text-amber-200">
                    Draft slot
                  </label>
                  <select
                    id="slot-select"
                    value={slotChoice}
                    onChange={(event) => {
                      setSlotChoice(event.target.value);
                    }}
                    className="rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100"
                  >
                    <option value="">Select a slot…</option>
                    {snapshot.board.teams.map((team) => (
                      <option key={team.teamId} value={team.draftSlot}>
                        Slot {team.draftSlot} — {seatLabel(team)}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={chooseSlot}
                  disabled={slotChoice === '' || pending}
                  className="rounded-md bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 disabled:opacity-50"
                >
                  Use this slot
                </button>
              </div>
            </section>
          )}

          {/* Action row sits ABOVE the pre-draft check: the check's unmatched/warning lists can
              run long, and the primary action must not require scrolling past them (user request,
              2026-08-23). The check remains fully visible below for pre-start review. */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onConfirm}
              disabled={needsSlot}
              className="rounded-md bg-emerald-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              Start drafting
            </button>
            {needsSlot && (
              <span className="text-sm text-amber-200">Pick your slot to continue.</span>
            )}
          </div>

          {preDraftCheck !== null && <PreDraftCheck check={preDraftCheck} />}
        </>
      )}
    </main>
  );
}

/**
 * The pre-draft check (FR-4): what Sidekick is about to draft with, stated before any insight
 * renders. Warning messages are the server's own strings, rendered verbatim — this screen never
 * rewords a warning, since the wording is where the specific fact lives.
 */
function PreDraftCheck({ check }: { check: PreDraftCheckData }) {
  return (
    <section
      aria-label="Pre-draft check"
      className="rounded-lg border border-slate-800 bg-slate-900/60 p-5"
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
        Pre-draft check
      </h2>

      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">ECR snapshot</dt>
          <dd className="text-sm text-slate-300">
            {check.ecrSnapshot === null ? (
              'No ECR snapshot loaded.'
            ) : (
              <>
                <span className="break-all">{check.ecrSnapshot.source}</span>
                <span className="block text-xs text-slate-500">
                  {check.ecrSnapshot.capturedAt ?? 'capture time unknown'} ·{' '}
                  {ageLabel(check.ecrSnapshot)}
                </span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">ADP snapshot</dt>
          <dd className="text-sm text-slate-300">
            {check.adpSnapshot === null ? (
              'No ADP snapshot loaded.'
            ) : (
              <>
                <span className="break-all">{check.adpSnapshot.source}</span>
                <span className="block text-xs text-slate-500">
                  {check.adpSnapshot.capturedAt ?? 'capture time unknown'} ·{' '}
                  {ageLabel(check.adpSnapshot)}
                  {check.adpSnapshot.poolDescription !== undefined &&
                    ` · ${check.adpSnapshot.poolDescription}`}
                </span>
              </>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-slate-500">League settings</dt>
          <dd className="text-sm text-slate-300">
            {check.leagueSummary === null
              ? 'Not read yet.'
              : `${check.leagueSummary.teamCount} teams · ${check.leagueSummary.scoringType} · ${check.leagueSummary.rounds} rounds`}
          </dd>
        </div>
      </dl>

      {check.warnings.length > 0 && (
        <ul className="mt-4 flex flex-col gap-2">
          {check.warnings.map((warning) => (
            <li
              key={`${warning.code}:${warning.message}`}
              className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
            >
              {warning.message}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <h3 className="text-xs uppercase tracking-wide text-slate-500">
            Unmatched entries ({check.unmatchedEntries.length})
          </h3>
          {check.unmatchedEntries.length === 0 ? (
            <p className="text-sm text-slate-500">None — every snapshot entry matched a player.</p>
          ) : (
            <ul className="mt-1 text-sm text-slate-300">
              {check.unmatchedEntries.map((entry) => (
                <li key={`${entry.source}:${entry.name}`}>
                  {entry.name}
                  {entry.position === null ? '' : ` (${entry.position})`} · {entry.source}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Excluded from the candidate list and the simulation.
          </p>
        </div>
        <div>
          <h3 className="text-xs uppercase tracking-wide text-slate-500">
            Matched, no ADP ({check.playersMissingAdp.length})
          </h3>
          {check.playersMissingAdp.length === 0 ? (
            <p className="text-sm text-slate-500">None.</p>
          ) : (
            <ul className="mt-1 text-sm text-slate-300">
              {check.playersMissingAdp.map((player) => (
                <li key={player.playerId}>{player.name}</li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-xs text-slate-500">
            Sampled in ECR order within their position instead.
          </p>
        </div>
      </div>
    </section>
  );
}
