import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { installClientErrorReporter } from './errorReporter';
import { AppStateStore } from './state/store';
import './index.css';

// First, before anything below can fail: browser-side errors join the server's trace file, so a
// broken screen mid-draft is part of the same record as the polls around it.
installClientErrorReporter();

const container = document.getElementById('root');
if (container === null) throw new Error('Missing #root container in index.html');

/**
 * The store connects outside React on purpose: one process-wide `EventSource`, opened once, immune
 * to StrictMode's deliberate double-invocation of effects. Every tab that does this receives the
 * same broadcasts from the one server-held state, which is AC-15 for free.
 */
const store = new AppStateStore();
store.connect();

createRoot(container).render(
  <StrictMode>
    <App store={store} />
  </StrictMode>,
);
