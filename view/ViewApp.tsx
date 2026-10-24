import { useEffect, useSyncExternalStore } from "react";
import { ConfirmDialog } from "./ConfirmDialog.tsx";
import { Detail } from "./Detail.tsx";
import { Queue } from "./Queue.tsx";
import type { ViewSession } from "./sessionStore.ts";

const PHASE_TEXT = {
  disconnected: "Not connected",
  initializing: "Connecting to host…",
  ready: "Connected",
  error: "Connection failed",
  closed: "Closed",
} as const;

export function ViewApp({ session }: { session: ViewSession }) {
  // Subscribing only. StrictMode may mount/unmount/remount this; connection ownership lives
  // in the session, created once before render.
  const snapshot = useSyncExternalStore(session.subscribe, session.getSnapshot, session.getSnapshot);

  useEffect(() => {
    document.documentElement.dataset.theme = snapshot.theme;
    if (snapshot.locale) document.documentElement.lang = snapshot.locale;
  }, [snapshot.theme, snapshot.locale]);

  const prepared = snapshot.preparation.status === "ready" ? snapshot.preparation.prepared : null;

  // Closing the drawer removes the focused Close button; return focus to the row's Open
  // button (or the queue heading) after React commits.
  function closeDrawer() {
    const id = snapshot.selection.id;
    session.select(null);
    setTimeout(() => {
      const row = id ? document.querySelector<HTMLElement>(`[data-action="select"][data-id="${CSS.escape(id)}"]`) : null;
      (row ?? document.getElementById("queue-heading"))?.focus();
    }, 0);
  }

  return (
    <main className="desk" aria-busy={snapshot.phase === "initializing"}>
      <header className="desk-head">
        <h1>Approval Desk</h1>
        <p className="muted small">Synthetic requests. Decisions are recorded in this session only.</p>
        <p className={`phase phase-${snapshot.phase}`} data-phase={snapshot.phase}>
          {PHASE_TEXT[snapshot.phase]}
        </p>
      </header>
      {snapshot.phase === "error" ? (
        <div role="alert" className="error">
          <p>{snapshot.connectError}</p>
          <button type="button" data-action="retry" onClick={() => void session.retry()}>
            Retry
          </button>
        </div>
      ) : null}
      {snapshot.launchCancelled ? <p className="muted">Launch cancelled: {snapshot.launchCancelled}</p> : null}
      <div className="layout">
        <Queue snapshot={snapshot} onQuery={(q) => void session.query(q)} onSelect={(id) => session.select(id)} />
        <Detail
          snapshot={snapshot}
          onDecision={session.setDecision}
          onReason={session.setReason}
          onPrepare={() => void session.prepare()}
          onTellAssistant={() => void session.tellAssistant()}
          onClose={closeDrawer}
        />
      </div>
      {prepared ? (
        <ConfirmDialog
          prepared={prepared}
          submitting={snapshot.submit.status === "submitting"}
          onCancel={session.cancelConfirm}
          onConfirm={() => void session.confirm()}
        />
      ) : null}
      <div className="visually-hidden" role="status" aria-live="polite" data-field="announcement">
        {snapshot.announcement}
      </div>
    </main>
  );
}
