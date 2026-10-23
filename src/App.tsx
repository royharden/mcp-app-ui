import { useState } from "react";
import { readPublicConfig } from "./lib/supabase.ts";
import { MeasureView } from "./ui/MeasureView.tsx";
import { QueuePreview } from "./ui/QueuePreview.tsx";
import { SecurityNote } from "./ui/SecurityNote.tsx";

type Tab = "queue" | "security" | "measure";

export function App() {
  const [tab, setTab] = useState<Tab>("queue");
  const config = readPublicConfig();

  return (
    <div className="page">
      <header className="mast">
        <p className="eyebrow">MCP App · io.modelcontextprotocol/ui</p>
        <h1>Confirm Queue</h1>
        <p className="lede">
          A person reviews a proposed write and confirms the exact change. The model can read the queue.
          Only the view can commit.
        </p>
      </header>
      {config.ok ? null : <p className="banner">{config.message}</p>}
      <nav className="tabs" aria-label="Sections">
        <TabButton current={tab} id="queue" label="Queue" onSelect={setTab} />
        <TabButton current={tab} id="security" label="Security note" onSelect={setTab} />
        <TabButton current={tab} id="measure" label="UI vs text" onSelect={setTab} />
      </nav>
      {tab === "queue" ? <QueuePreview config={config} /> : null}
      {tab === "security" ? <SecurityNote /> : null}
      {tab === "measure" ? <MeasureView /> : null}
      <footer className="colophon">Dirty Mode construction. Runtime unverified.</footer>
    </div>
  );
}

function TabButton({
  current,
  id,
  label,
  onSelect,
}: {
  current: Tab;
  id: Tab;
  label: string;
  onSelect: (tab: Tab) => void;
}) {
  return (
    <button type="button" className={current === id ? "tab active" : "tab"} onClick={() => onSelect(id)}>
      {label}
    </button>
  );
}
