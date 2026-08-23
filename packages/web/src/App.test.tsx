import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from './App';

// Placeholder shell test — T11 replaces this shell with the real attach/draft screens.
describe('App', () => {
  it('renders the application shell', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: /draft sidekick/i })).toBeDefined();
  });
});
