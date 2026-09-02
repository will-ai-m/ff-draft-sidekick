import { useEffect, useRef, useState } from 'react';

import type {
  DraftChatMessage,
  DraftChatProvider,
  DraftChatSessionStatus,
} from '@sidekick/shared';

import {
  connectDraftChatKey,
  forgetDraftChatKey,
  forgetDraftChatKeyOnExit,
  getDraftChatSession,
  postDraftChat,
} from '../state/api';
import { Panel } from './Panel';

export interface DraftChatProps {
  draftId: string;
  boardVersion: number;
}

interface DisplayMessage extends DraftChatMessage {
  boardVersion?: number;
}

const STARTERS = [
  'Why this player over the closest alternative?',
  "Shouldn't I draft a different position here?",
  'What is the biggest tactical risk if I wait?',
];

const EMPTY_SESSION: DraftChatSessionStatus = {
  configured: false,
  provider: null,
  model: null,
  expiresAfterMinutes: 30,
};

export function DraftChat({ draftId, boardVersion }: DraftChatProps) {
  const [messages, setMessages] = useState<DisplayMessage[]>([]);
  const [question, setQuestion] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<DraftChatSessionStatus | null>(null);
  const [provider, setProvider] = useState<DraftChatProvider>('openai');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState('');
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMessages([]);
    setQuestion('');
    setError(null);
  }, [draftId]);

  useEffect(() => {
    let active = true;
    void getDraftChatSession().then((result) => {
      if (!active) return;
      if (result.ok) setSession(result.status);
      else {
        setSession(EMPTY_SESSION);
        setError(result.error);
      }
    });
    const onPageHide = () => forgetDraftChatKeyOnExit();
    window.addEventListener('pagehide', onPageHide);
    return () => {
      active = false;
      window.removeEventListener('pagehide', onPageHide);
    };
  }, []);

  useEffect(() => {
    if (typeof endRef.current?.scrollIntoView === 'function') {
      endRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [messages, pending]);

  const ask = async (rawQuestion: string) => {
    const message = rawQuestion.trim();
    if (message === '' || pending) return;
    const history = messages.map(({ role, content }) => ({ role, content }));
    setMessages((current) => [...current, { role: 'user', content: message }]);
    setQuestion('');
    setError(null);
    setPending(true);

    const result = await postDraftChat(message, history);
    if (result.ok) {
      setMessages((current) => [
        ...current,
        {
          role: 'assistant',
          content: result.response.answer,
          boardVersion: result.response.boardVersion,
        },
      ]);
    } else {
      setError(result.failure.error);
      if (result.failure.code === 'chat-not-configured') setSession(EMPTY_SESSION);
    }
    setPending(false);
  };

  return (
    <Panel
      title="Ask Sidekick"
      badge={
        session?.configured === true
          ? `${session.provider === 'openai' ? 'OpenAI' : 'Claude'} · ${session.model}`
          : 'bring your own key'
      }
    >
      <div className="flex h-full min-h-[8rem] flex-col gap-3">
        {session === null && <p className="text-slate-500">Checking chat session…</p>}

        {session?.configured === false && (
          <form
            aria-label="Connect an AI provider"
            className="space-y-3 rounded-md border border-slate-700 bg-slate-950/60 p-3"
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
                  setSession(result.status);
                  setApiKey('');
                } else {
                  setError(result.error);
                }
                setPending(false);
              });
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Provider
              </span>
              {(['openai', 'anthropic'] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  aria-pressed={provider === choice}
                  onClick={() => setProvider(choice)}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium ring-1 ${
                    provider === choice
                      ? 'bg-emerald-500/20 text-emerald-200 ring-emerald-500/60'
                      : 'bg-slate-800 text-slate-300 ring-slate-700'
                  }`}
                >
                  {choice === 'openai' ? 'OpenAI / GPT' : 'Anthropic / Claude'}
                </button>
              ))}
            </div>
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,0.55fr)_auto]">
              <label className="text-xs text-slate-400">
                API key
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder={provider === 'openai' ? 'sk-…' : 'sk-ant-…'}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                />
              </label>
              <label className="text-xs text-slate-400">
                Model override (optional)
                <input
                  type="text"
                  value={model}
                  onChange={(event) => setModel(event.target.value)}
                  placeholder={provider === 'openai' ? 'gpt-5.4-mini' : 'claude-sonnet-4-6'}
                  className="mt-1 w-full rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-emerald-500"
                />
              </label>
              <button
                type="submit"
                disabled={pending || apiKey.trim().length < 10}
                className="self-end rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:opacity-40"
              >
                Connect
              </button>
            </div>
            <p className="text-xs leading-relaxed text-slate-500">
              The key is held only in server memory behind an HttpOnly session cookie. It is never
              saved in browser storage or logs, and is erased on detach, removal, server restart,
              page exit, or after {session.expiresAfterMinutes} minutes of inactivity.
            </p>
          </form>
        )}

        {session?.configured === true && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-emerald-900/70 bg-emerald-950/20 px-3 py-2 text-xs">
            <p className="text-emerald-200">
              Using your {session.provider === 'openai' ? 'OpenAI' : 'Anthropic'} tokens · key kept
              in memory only
            </p>
            <button
              type="button"
              onClick={() => {
                void forgetDraftChatKey().finally(() => {
                  setSession(EMPTY_SESSION);
                  setMessages([]);
                });
              }}
              className="rounded border border-slate-700 px-2 py-1 text-slate-300 hover:bg-slate-800"
            >
              Forget key
            </button>
          </div>
        )}

        {session?.configured === true && (
          <>
        {messages.length === 0 && (
          <div>
            <p className="mb-2 text-slate-300">
              Challenge the pick, compare players, or ask what position your roster needs.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => {
                    void ask(starter);
                  }}
                  className="rounded-full border border-slate-700 bg-slate-800 px-3 py-1.5 text-left text-xs text-slate-300 hover:border-emerald-600 hover:text-emerald-200"
                >
                  {starter}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.length > 0 && (
          <div aria-live="polite" className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={
                  message.role === 'user'
                    ? 'ml-8 rounded-lg bg-slate-800 px-3 py-2 text-slate-200'
                    : 'mr-4 rounded-lg border border-emerald-900/70 bg-emerald-950/20 px-3 py-2 text-slate-200'
                }
              >
                <p className="mb-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-500">
                  {message.role === 'user' ? 'You' : 'Sidekick'}
                </p>
                <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                {message.role === 'assistant' &&
                  message.boardVersion !== undefined &&
                  message.boardVersion !== boardVersion && (
                    <p className="mt-2 text-xs text-amber-300">
                      The board moved after this answer (version {message.boardVersion} → {boardVersion}).
                    </p>
                  )}
              </div>
            ))}
            {pending && <p className="text-sm text-emerald-300">Sidekick is checking the board…</p>}
            <div ref={endRef} />
          </div>
        )}

        {error !== null && (
          <p role="alert" className="rounded-md border border-rose-900 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {error}
          </p>
        )}

        <form
          className="mt-auto flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <label htmlFor="draft-chat-question" className="sr-only">
            Ask Sidekick about this pick
          </label>
          <textarea
            id="draft-chat-question"
            rows={2}
            value={question}
            maxLength={2_000}
            disabled={pending}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                void ask(question);
              }
            }}
            placeholder='Ask “Why this RB over the available WR?”'
            className="min-w-0 flex-1 resize-none rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-emerald-500 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={pending || question.trim() === ''}
            className="self-end rounded-md bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Ask
          </button>
        </form>
        <p className="text-xs text-slate-600">
          Enter sends · Shift+Enter adds a line. Advice is read-only; picks stay in Sleeper.
        </p>
          </>
        )}
      </div>
    </Panel>
  );
}
