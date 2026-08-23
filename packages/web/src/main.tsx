import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App';
import { AppStateStore } from './state/store';
import './index.css';

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
