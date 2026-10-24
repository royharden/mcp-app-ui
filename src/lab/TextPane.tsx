import { useState } from "react";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CATEGORIES, REQUESTERS, RISKS, SORTS, type QueryInput } from "../../server/domain/schemas.ts";

interface TextPaneProps {
  client: Client;
}

/**
 * Text-only mode: the same read tools and the same server, showing exactly the text content a
 * model-facing host would forward. Prepare/submit are app-only, so this pane cannot decide.
 */
export function TextPane({ client }: TextPaneProps) {
  const [query, setQuery] = useState<QueryInput>({});
  const [detailId, setDetailId] = useState("REQ-104");
  const [output, setOutput] = useState<{ label: string; text: string; isError: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(label: string, name: string, args: Record<string, unknown>) {
    setBusy(true);
    try {
      const result = await client.callTool({ name, arguments: args });
      const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
      const text = content.filter((c) => c.type === "text").map((c) => c.text ?? "").join("\n");
      setOutput({ label, text, isError: result.isError === true });
    } catch (error) {
      setOutput({ label, text: error instanceof Error ? error.message : String(error), isError: true });
    } finally {
      setBusy(false);
    }
  }

  function select<K extends keyof QueryInput>(key: K, values: readonly string[], label: string) {
    return (
      <label>
        {label}
        <select
          value={(query[key] as string | undefined) ?? ""}
          onChange={(e) => setQuery({ ...query, [key]: e.target.value === "" ? undefined : e.target.value })}
        >
          <option value="">{key === "sort" ? "default" : "any"}</option>
          {values.map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <section className="panel" aria-labelledby="text-heading">
      <h2 id="text-heading">Text-only mode</h2>
      <p className="muted small">
        Same server, same read authority. Shows the text fallback a model would receive. Decisions are app-only, so
        text mode cannot record one.
      </p>
      <div className="filters">
        {select("status", ["pending", "approved", "rejected", "all"], "Status")}
        {select("category", CATEGORIES, "Category")}
        {select("risk", RISKS, "Risk")}
        {select("requesterId", REQUESTERS, "Requester")}
        {select("sort", SORTS, "Sort")}
        <label>
          Offset
          <input
            type="number"
            min={0}
            max={1000}
            value={query.offset ?? 0}
            onChange={(e) => setQuery({ ...query, offset: Number(e.target.value) || 0 })}
          />
        </label>
        <button type="button" disabled={busy} onClick={() => void run("list_approvals", "list_approvals", { ...query })}>
          list_approvals
        </button>
      </div>
      <div className="filters">
        <label>
          Id
          <input value={detailId} onChange={(e) => setDetailId(e.target.value.trim())} />
        </label>
        <button type="button" disabled={busy} onClick={() => void run(`get_approval ${detailId}`, "get_approval", { id: detailId })}>
          get_approval
        </button>
      </div>
      {output ? (
        <figure>
          <figcaption>
            {output.label} — {output.text.length} characters{output.isError ? " (error)" : ""}
          </figcaption>
          <pre className="text-output">{output.text}</pre>
        </figure>
      ) : null}
    </section>
  );
}
