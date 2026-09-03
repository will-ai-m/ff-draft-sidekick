import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DraftChat } from './DraftChat';

const configured = {
  configured: true,
  provider: 'openai',
  model: 'test-model',
  expiresAfterMinutes: 30,
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('DraftChat', () => {
  it('sends the question and renders the grounded answer', async () => {
    const fetchMock = vi.fn(async (...args: [string, RequestInit?]) =>
      args[0] === '/api/chat/session'
        ? new Response(JSON.stringify(configured), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        : new Response(
            JSON.stringify({
              answer: 'Take the WR because your RB depth is already stronger.',
              provider: 'openai',
              model: 'test-model',
              boardVersion: 7,
            }),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(<DraftChat draftId="draft-1" boardVersion={7} />);

    await screen.findByText(/using your OpenAI tokens/i);
    fireEvent.change(screen.getByLabelText(/ask sidekick about this pick/i), {
      target: { value: 'Why this RB over the available WR?' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^ask$/i }));

    expect(await screen.findByText(/take the WR because/i)).toBeTruthy();
    const request = fetchMock.mock.calls.find((call) => call[0] === '/api/chat');
    expect(JSON.parse(String((request?.[1] as RequestInit).body))).toMatchObject({
      message: 'Why this RB over the available WR?',
      history: [],
    });
  });

  it('marks an answer stale when the board advances', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (url: string) =>
          new Response(
            JSON.stringify(
              url === '/api/chat/session'
                ? configured
                : { answer: 'Wait on TE.', provider: 'openai', model: 'test', boardVersion: 4 },
            ),
            { status: 200, headers: { 'content-type': 'application/json' } },
          ),
      ),
    );
    const { rerender } = render(<DraftChat draftId="draft-1" boardVersion={4} />);
    await screen.findByText(/using your OpenAI tokens/i);
    fireEvent.click(screen.getByRole('button', { name: /who could take this position/i }));
    await screen.findByText('Wait on TE.');

    rerender(<DraftChat draftId="draft-1" boardVersion={5} />);
    expect(screen.getByText(/board moved after this answer/i).textContent).toMatch(/4 → 5/);
  });

  it('connects and forgets a user-provided Claude key without displaying it again', async () => {
    const unconfigured = {
      configured: false,
      provider: null,
      model: null,
      expiresAfterMinutes: 30,
    };
    const claude = {
      configured: true,
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
      expiresAfterMinutes: 30,
    };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === '/api/chat/session' && init?.method === 'POST') {
        return new Response(JSON.stringify(claude), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        });
      }
      if (url === '/api/chat/session' && init?.method === 'DELETE') {
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify(unconfigured), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<DraftChat draftId="draft-1" boardVersion={1} />);

    await screen.findByRole('button', { name: /connect ai/i });
    fireEvent.click(screen.getByRole('button', { name: /connect ai/i }));
    await screen.findByRole('form', { name: /connect an AI provider/i });
    fireEvent.click(screen.getByRole('button', { name: /anthropic \/ claude/i }));
    fireEvent.change(screen.getByLabelText(/^api key$/i), {
      target: { value: 'sk-ant-user-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    expect(await screen.findByText(/using your Anthropic tokens/i)).toBeTruthy();
    expect(screen.queryByDisplayValue('sk-ant-user-secret')).toBeNull();
    const connect = fetchMock.mock.calls.find(
      (call) => call[0] === '/api/chat/session' && (call[1] as RequestInit)?.method === 'POST',
    );
    expect(JSON.parse(String((connect?.[1] as RequestInit).body))).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-ant-user-secret',
    });

    fireEvent.click(screen.getByRole('button', { name: /forget key/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /connect ai/i })).toBeTruthy());
    expect(
      fetchMock.mock.calls.some(
        (call) => call[0] === '/api/chat/session' && (call[1] as RequestInit)?.method === 'DELETE',
      ),
    ).toBe(true);
  });
});
