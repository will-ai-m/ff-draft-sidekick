import { useEffect, useState } from 'react';

import type { DraftChatProvider, DraftChatSessionStatus } from '@sidekick/shared';

import {
  connectDraftChatKey,
  forgetDraftChatKey,
  forgetDraftChatKeyOnExit,
  getDraftChatSession,
} from '../state/api';

export function ChatKeySetup() {
  const [status, setStatus] = useState<DraftChatSessionStatus | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [provider, setProvider] = useState<DraftChatProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getDraftChatSession().then((result) => {
      if (!active) return;
      if (result.ok) setStatus(result.status);
      else {
        setStatus({ configured: false, provider: null, model: null, expiresAfterMinutes: 30 });
        // Optional setup should not compete with an attach error. If the user opts in, the
        // connect request itself will surface any real server/configuration failure.
      }
    });
    const onPageHide = () => forgetDraftChatKeyOnExit();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      active = false;
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  return (
    <section
      aria-label="Optional AI draft chat"
      className="rounded-lg border border-slate-800 bg-slate-900/60 p-5"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">
            AI draft chat <span className="font-normal text-slate-500">· Optional</span>
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-slate-400">
            Ask why Sidekick prefers one player or position. This uses your own OpenAI or Anthropic
            API account and tokens; every other Sidekick feature works without it.
          </p>
        </div>
        {status?.configured === true ? (
          <button
            type="button"
            onClick={() => {
              void forgetDraftChatKey().finally(() => {
                setStatus({
                  configured: false,
                  provider: null,
                  model: null,
                  expiresAfterMinutes: status.expiresAfterMinutes,
                });
                setExpanded(false);
              });
            }}
            className="rounded-md border border-slate-700 px-3 py-1.5 text-xs text-slate-300 hover:bg-slate-800"
          >
            Forget key
          </button>
        ) : (
          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
            className="rounded-md border border-emerald-500/50 bg-emerald-500/10 px-3 py-1.5 text-sm font-medium text-emerald-200 hover:bg-emerald-500/20"
          >
            {expanded ? 'Not now' : 'Enable AI draft chat'}
          </button>
        )}
      </div>

      {status === null && <p className="mt-3 text-xs text-slate-500">Checking chat setup…</p>}
      {status?.configured === true && (
        <p className="mt-3 rounded-md border border-emerald-800 bg-emerald-950/30 px-3 py-2 text-sm text-emerald-200">
          Ready: {status.provider === 'openai' ? 'OpenAI / GPT' : 'Anthropic / Claude'} ·{' '}
          {status.model}. Your key is held in server memory only.
        </p>
      )}

      {expanded && status?.configured !== true && (
        <form
          aria-label="Connect an AI provider during setup"
          className="mt-4 space-y-3 border-t border-slate-800 pt-4"
          onSubmit={(event) => {
            event.preventDefault();
            setPending(true);
            setError(null);
            void connectDraftChatKey({
              provider,
              apiKey,
              ...(model.trim() === '' ? {} : { model: model.trim() }),
            }).then((result) => {
              if (result.ok) {
                setStatus(result.status);
                setApiKey('');
                setExpanded(false);
              } else {
                setError(result.error);
              }
              setPending(false);
            });
          }}
        >
          <fieldset>
            <legend className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Choose provider
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(['openai', 'anthropic'] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={provider === choice}
                  onClick={() => setProvider(choice)}
                  className={`rounded-md px-3 py-1.5 text-sm ring-1 ${
                    provider === choice
                      ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/60'
                      : 'bg-slate-800 text-slate-300 ring-slate-700'
                  }`}
                >
                  {choice === 'openai' ? 'OpenAI / GPT' : 'Anthropic / Claude'}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(14rem,0.6fr)_auto]">
            <label className="text-sm text-slate-300">
              {provider === 'openai' ? 'OpenAI API key' : 'Anthropic API key'}
              <input
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={provider === 'openai' ? 'sk-…' : 'sk-ant-…'}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </label>
            <label className="text-sm text-slate-300">
              Model override <span className="text-slate-500">(optional)</span>
              <input
                type="text"
                value={model}
                onChange={(event) => setModel(event.target.value)}
                placeholder={provider === 'openai' ? 'gpt-5.4-mini' : 'claude-sonnet-4-6'}
                className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm outline-none focus:border-emerald-500"
              />
            </label>
            <button
              type="submit"
              disabled={pending || apiKey.trim().length < 10}
              className="self-end rounded-md bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40"
            >
              Connect
            </button>
          </div>
          <p className="text-xs leading-relaxed text-slate-500">
            The raw key is never saved in browser storage, config, logs, or Git. It is erased on
            detach, removal, page exit, server restart, or after {status?.expiresAfterMinutes ?? 30}{' '}
            minutes of inactivity.
          </p>
        </form>
      )}

      {error !== null && (
        <p role="alert" className="mt-3 rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
    </section>
  );
}
