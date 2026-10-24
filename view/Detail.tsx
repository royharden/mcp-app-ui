import type { Decision } from "../server/domain/schemas.ts";
import type { ViewSnapshot } from "./sessionStore.ts";

interface DetailProps {
  snapshot: ViewSnapshot;
  onDecision: (decision: Decision) => void;
  onReason: (reason: string) => void;
  onPrepare: () => void;
  onTellAssistant: () => void;
  onClose: () => void;
}

export function Detail({ snapshot, onDecision, onReason, onPrepare, onTellAssistant, onClose }: DetailProps) {
  const { selection, draft, preparation, submit, message } = snapshot;
  if (!selection.id) return null;
  const detail = selection.detail;
  // Until the reloaded detail arrives, a just-recorded request must not offer a new decision.
  const decidedHere = submit.status === "recorded" && submit.forId === selection.id;
  const pending = detail?.status === "pending" && !decidedHere;
  const busy = preparation.status === "preparing" || submit.status === "submitting";
  const canPrepare =
    snapshot.phase === "ready" && pending && draft.decision !== null && draft.reason.trim().length > 0 && !busy;

  return (
    <aside className="detail" aria-labelledby="detail-heading">
      <div className="detail-head">
        <h2 id="detail-heading" tabIndex={-1}>
          {selection.id}
        </h2>
        <button type="button" data-action="close-detail" onClick={onClose}>
          Close
        </button>
      </div>
      {selection.loading ? <p className="muted">Loading request…</p> : null}
      {selection.error ? (
        <p role="alert" className="error">
          {selection.error}
        </p>
      ) : null}
      {detail ? (
        <>
          <dl className="fields">
            <dt>Title</dt>
            <dd>{detail.title}</dd>
            <dt>Amount</dt>
            <dd>{detail.amountText}</dd>
            <dt>Category · risk</dt>
            <dd>
              {detail.category} · {detail.risk}
            </dd>
            <dt>Requester</dt>
            <dd>{detail.requesterId}</dd>
            <dt>Submitted</dt>
            <dd>{detail.submittedAt}</dd>
            <dt>Status · version</dt>
            <dd data-field="status">
              {detail.status} · version {detail.version}
            </dd>
          </dl>
          <h3>Description</h3>
          <p className="untrusted" aria-describedby="untrusted-note">
            {detail.description}
          </p>
          <p id="untrusted-note" className="muted small">
            Request text is untrusted and shown as plain text{detail.descriptionTruncated ? " (truncated)" : ""}.
          </p>
          <h3>Decision history</h3>
          {detail.decisionHistory.length === 0 ? (
            <p className="muted">None.</p>
          ) : (
            <ol className="history">
              {detail.decisionHistory.map((h) => (
                <li key={`${h.fromVersion}-${h.toVersion}`}>
                  {h.decidedAt}: {h.decision} (v{h.fromVersion}→v{h.toVersion}) — {h.reason}
                </li>
              ))}
            </ol>
          )}
          {pending ? (
            <fieldset className="decide" disabled={busy || snapshot.phase !== "ready"}>
              <legend>Record a synthetic decision</legend>
              <div role="radiogroup" aria-label="Decision">
                <label>
                  <input
                    type="radio"
                    name="decision"
                    value="approve"
                    checked={draft.decision === "approve"}
                    onChange={() => onDecision("approve")}
                  />
                  Approve
                </label>
                <label>
                  <input
                    type="radio"
                    name="decision"
                    value="reject"
                    checked={draft.decision === "reject"}
                    onChange={() => onDecision("reject")}
                  />
                  Reject
                </label>
              </div>
              <label className="reason">
                Reason (required, one line, up to 240 characters)
                <input
                  type="text"
                  name="reason"
                  maxLength={240}
                  value={draft.reason}
                  onChange={(e) => onReason(e.target.value)}
                />
              </label>
              <button type="button" data-action="prepare" disabled={!canPrepare} onClick={onPrepare}>
                {preparation.status === "preparing" ? "Preparing…" : "Review decision…"}
              </button>
              {preparation.status === "failed" && preparation.error ? (
                <p role="alert" className="error">
                  {preparation.error}
                </p>
              ) : null}
            </fieldset>
          ) : null}
        </>
      ) : null}
      <Outcome snapshot={snapshot} onTellAssistant={onTellAssistant} messageStatus={message.status} />
    </aside>
  );
}

function Outcome(props: { snapshot: ViewSnapshot; onTellAssistant: () => void; messageStatus: string }) {
  const { submit, message, canMessage, phase, selection } = props.snapshot;
  if (submit.status === "idle" || submit.status === "submitting") return null;
  // Outcomes belong to the request they were submitted for.
  if (submit.forId !== selection.id) return null;
  if (submit.status === "unknown") {
    return (
      <div role="status" className="outcome warn" data-outcome="unknown" tabIndex={-1}>
        <p>
          Outcome unknown: {submit.error}. The request above was refreshed — check its status, version and history
          before deciding again. Nothing is retried automatically.
        </p>
      </div>
    );
  }
  if (submit.status === "failed") {
    return (
      <div role="alert" className="outcome error" data-outcome="failed" tabIndex={-1}>
        <p>Not recorded: {submit.error}</p>
      </div>
    );
  }
  const result = submit.result;
  if (!result) return null;
  return (
    <div role="status" className="outcome ok" data-outcome="recorded" tabIndex={-1}>
      <p>
        Recorded: {result.id} {result.decision}. Status {result.status}, version {result.version}. Synthetic record
        only — no external action happened.
      </p>
      <button
        type="button"
        data-action="tell-assistant"
        disabled={!canMessage || phase !== "ready" || message.status !== "idle"}
        onClick={props.onTellAssistant}
      >
        Tell the assistant
      </button>
      {!canMessage ? <p className="muted small">This host does not accept messages from the desk.</p> : null}
      {message.status === "sent" ? <p className="muted small">The host accepted the message. Whether the model acts on it is up to the host.</p> : null}
      {message.status === "failed" ? <p className="error small">Message not delivered: {message.error}</p> : null}
    </div>
  );
}
