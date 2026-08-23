/**
 * The application shell: one SSE-fed snapshot, two screens, one explicit confirmation between them.
 *
 * The store owns everything the server says; the only state this component holds is whether the
 * user has confirmed the attached draft (UJ-1's "user confirms it's the right draft"), which is a
 * fact about this browser tab and about nothing on the server. It resets whenever the server
 * publishes a snapshot with nothing attached, so a detach cannot leave a stale board on screen.
 */
import { useEffect, useState } from 'react';

import { DraftScreen } from './screens/DraftScreen';
import { AttachScreen } from './screens/AttachScreen';
import { postDetach } from './state/api';
import { useAppState } from './state/store';
import type { AppStateStore } from './state/store';

export interface AppProps {
  store: AppStateStore;
}

export function App({ store }: AppProps) {
  const { snapshot, connection } = useAppState(store);
  const [confirmed, setConfirmed] = useState(false);

  const attachStatus = snapshot?.attach.status;
  useEffect(() => {
    if (attachStatus === undefined || attachStatus === 'not-attached' || attachStatus === 'error') {
      setConfirmed(false);
    }
  }, [attachStatus]);

  return (
    <div className="min-h-screen bg-slate-950">
      {connection !== 'open' && snapshot !== null && (
        <p
          role="alert"
          className="bg-rose-600 px-4 py-2 text-center text-sm font-medium text-white"
        >
          Sidekick lost the connection to its server — what you see below has stopped updating.
        </p>
      )}

      {snapshot === null ? (
        <main className="flex min-h-screen items-center justify-center text-slate-400">
          <p>Waiting for the first update from the Sidekick server…</p>
        </main>
      ) : confirmed && (attachStatus === 'attached' || attachStatus === 'needs-manual-slot') ? (
        <DraftScreen
          snapshot={snapshot}
          onDetach={() => {
            void postDetach();
          }}
        />
      ) : (
        <AttachScreen
          snapshot={snapshot}
          onConfirm={() => {
            setConfirmed(true);
          }}
        />
      )}
    </div>
  );
}
