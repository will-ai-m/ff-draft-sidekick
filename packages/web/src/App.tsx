/**
 * Application shell — scaffold only.
 *
 * The SSE-fed wholesale-replace store, the attach screen and the draft screen land in the
 * frontend-shell task; this placeholder exists so the dev server and the web test suite have
 * something real to mount.
 */
export function App() {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-slate-100">
      <h1 className="text-2xl font-semibold">Draft Sidekick</h1>
      <p className="mt-2 text-sm text-slate-400">Scaffold ready — no draft attached.</p>
    </main>
  );
}
