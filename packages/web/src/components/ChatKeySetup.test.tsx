import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatKeySetup } from './ChatKeySetup';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChatKeySetup', () => {
  it('is optional and reveals provider/key setup only after the user opts in', async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      void url;
      const status =
        init?.method === 'POST'
          ? {
              configured: true,
              provider: 'anthropic',
              model: 'claude-sonnet-4-6',
              expiresAfterMinutes: 30,
            }
          : {
              configured: false,
              provider: null,
              model: null,
              expiresAfterMinutes: 30,
            };
      return new Response(JSON.stringify(status), {
        status: init?.method === 'POST' ? 201 : 200,
        headers: { 'content-type': 'application/json' },
      });
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<ChatKeySetup />);

    expect(await screen.findByRole('button', { name: /enable AI draft chat/i })).toBeTruthy();
    expect(screen.queryByLabelText(/API key/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /enable AI draft chat/i }));
    fireEvent.click(screen.getByRole('button', { name: /anthropic \/ claude/i }));
    fireEvent.change(screen.getByLabelText(/anthropic API key/i), {
      target: { value: 'sk-ant-user-secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^connect$/i }));

    expect(await screen.findByText(/Ready: Anthropic \/ Claude/i)).toBeTruthy();
    const connect = fetchMock.mock.calls.find((call) => (call[1] as RequestInit)?.method === 'POST');
    expect(connect?.[0]).toBe('/api/chat/session');
    expect(JSON.parse(String((connect?.[1] as RequestInit).body))).toEqual({
      provider: 'anthropic',
      apiKey: 'sk-ant-user-secret',
    });
    expect(screen.queryByDisplayValue('sk-ant-user-secret')).toBeNull();
  });
});
