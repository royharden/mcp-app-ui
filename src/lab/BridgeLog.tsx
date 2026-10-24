import type { LogEntry } from "./protocolLog.ts";

interface BridgeLogProps {
  entries: LogEntry[];
  dropped: number;
  identity: Record<string, string>;
}

/** Explicit-click export only; nonces are already aliased in every entry. */
function exportTrace(entries: LogEntry[], identity: Record<string, string>): void {
  const blob = new Blob([JSON.stringify({ identity, entries }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "approval-desk-lab-log.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function BridgeLog({ entries, dropped, identity }: BridgeLogProps) {
  return (
    <section className="panel" aria-labelledby="log-heading">
      <div className="panel-head">
        <h2 id="log-heading">Protocol log</h2>
        <button type="button" onClick={() => exportTrace(entries, identity)}>
          Export log
        </button>
      </div>
      <p className="muted small">
        Newest {entries.length} messages{dropped > 0 ? ` (${dropped} older entries not kept)` : ""}. Nonces are shown as
        aliases. This log is an inspection aid, not evidence.
      </p>
      <ol className="log">
        {entries.map((e) => (
          <li key={e.index} className={`log-${e.kind}`}>
            <span className="log-meta">
              #{e.index} {e.channel} {e.direction} {e.kind}
              {e.method ? ` ${e.method}` : ""}
              {e.id !== null ? ` id=${String(e.id)}` : ""}
            </span>
            <code>{e.summary}</code>
          </li>
        ))}
      </ol>
    </section>
  );
}
