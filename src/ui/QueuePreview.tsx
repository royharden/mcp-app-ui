import { useState } from "react";
import { SEED_IDS, seedItems } from "../domain/seed.ts";
import { runDecisionJourney, type JourneyReport } from "../harness/journey.ts";
import type { readPublicConfig } from "../lib/supabase.ts";
import { LiveDesk } from "./LiveDesk.tsx";

const NOW = "2026-10-23T15:00:00.000Z";
const PREVIEW_BLOCK =
  "This preview has no signed-in user. Commit stays disabled. The harness replay below is an in-memory protocol simulation. Its stub actor is not authentication.";

type ConfigResult = ReturnType<typeof readPublicConfig>;

export function QueuePreview({ config }: { config: ConfigResult }) {
  const [notice, setNotice] = useState<string | null>(null);
  const [reports, setReports] = useState<JourneyReport[] | null>(null);
  const items = seedItems();

  function replay() {
    setReports([
      runDecisionJourney("approve", SEED_IDS.low, "", NOW),
      runDecisionJourney("deny", SEED_IDS.medium, "Needs a narrower folder.", NOW),
    ]);
  }

  return (
    <div className="stack">
      <section className="panel">
        <h2>Local preview</h2>
        <p>These three rows are synthetic. They are not stored in Bolt Database.</p>
        <ul className="cards">
          {items.map((item) => (
            <li key={item.id} className="card">
              <div className="card-top">
                <strong>{item.title}</strong>
                <span className={`risk risk-${item.risk}`}>{item.risk}</span>
              </div>
              <p>{item.summary}</p>
              <p className="change">{item.proposedChange}</p>
              <div className="row-actions">
                <button type="button" onClick={() => setNotice(PREVIEW_BLOCK)}>
                  Approve
                </button>
                <button type="button" className="danger" onClick={() => setNotice(PREVIEW_BLOCK)}>
                  Deny
                </button>
              </div>
            </li>
          ))}
        </ul>
        {notice ? <p className="notice">{notice}</p> : null}
      </section>
      <section className="panel">
        <h2>Headless harness replay</h2>
        <p>
          Replays the demo journey in this page: initialize, drop a host message that arrives too early, then
          confirm the low-risk rename and deny the export. No browser sandbox is opened.
        </p>
        <button type="button" onClick={replay}>
          Run harness replay
        </button>
        {reports ? (
          <div className="stack">
            {reports.map((report, index) => (
              <article key={`${report.finalStatus ?? "stopped"}-${index}`} className="replay">
                <p>
                  {report.ok ? "Protocol simulation finished." : "Protocol simulation stopped."} Status:{" "}
                  {report.finalStatus ?? "unknown"}. Early host push delivered: {String(report.earlyPushDelivered)}.
                </p>
                {report.error ? <p className="notice">{report.error}</p> : null}
                <ol>
                  {report.log.map((entry, index) => (
                    <li key={`${entry.method}-${index}`}>
                      {entry.direction} · {entry.method} · {entry.detail}
                    </li>
                  ))}
                </ol>
              </article>
            ))}
          </div>
        ) : null}
      </section>
      {config.ok ? <LiveDesk config={config.config} /> : null}
    </div>
  );
}
