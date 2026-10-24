// Scripted replay of the six equal-authority read tasks in TEXT mode against the real server.
// No model is called: the "scripted model turn" is a fixed parser over the text content a
// model-facing host would forward. The predicate compares the parsed answer with the oracle in
// tasks.v1.json, which was written independently of the query code.
//
// UI mode is executed by the exact-bundle harness (tests/harness), not here; this script reports
// the UI column as "not observed" and only accounts for the launch text a host still forwards.
// Results go to stdout. No results file is written and no win is pre-filled.
//
// Run later (authorized validation): npm run measure:replay
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import pkg from "../package.json" with { type: "json" };
import tasks from "./tasks.v1.json" with { type: "json" };
import { createSession } from "../server/runtime.ts";

type Row = { id: string; status: string; category: string; risk: string; amountText: string; submitted: string; cents: number };

/** Parses one row line produced by textRender.rowLine. */
export function parseRowLine(line: string): Row | null {
  const m = line.match(
    /^(REQ-\d{3}) \| status=(\w+) \| category=(\w+) \| risk=(\w+) \| (USD (\d+)\.(\d{2})) \| requester=\w+ \| submitted=(\S+) \| version=\d+ \| title=/,
  );
  if (!m) return null;
  return {
    id: m[1],
    status: m[2],
    category: m[3],
    risk: m[4],
    amountText: m[5],
    cents: Number(m[6]) * 100 + Number(m[7]),
    submitted: m[8],
  };
}

export function rowsOf(text: string): Row[] {
  return text.split("\n").map(parseRowLine).filter((r): r is Row => r !== null);
}

/** The scripted "model turn": fixed extraction rules per task kind. */
export function extract(kind: string, texts: string[], oracle: Record<string, unknown>): unknown {
  const all = texts.join("\n");
  const rows = rowsOf(all);
  switch (kind) {
    case "firstRow": {
      const r = rows[0];
      return r ? { id: r.id, risk: r.risk, amountText: r.amountText, submittedAt: r.submitted } : null;
    }
    case "facets": {
      const m = all.match(/category equipment=(\d+) software=(\d+) travel=(\d+)/);
      const t = all.match(/Matching requests: (\d+)\./);
      return m && t ? { equipment: Number(m[1]), software: Number(m[2]), travel: Number(m[3]), total: Number(t[1]) } : null;
    }
    case "detailRows":
      return Object.fromEntries(
        rows.map((r) => [r.id, { status: r.status, risk: r.risk, category: r.category, amountText: r.amountText }]),
      );
    case "ids":
      return { ids: rows.map((r) => r.id).sort() };
    case "idsOverThreshold": {
      const threshold = Number(oracle.thresholdCents);
      return { ids: rows.filter((r) => r.cents > threshold).map((r) => r.id).sort(), thresholdCents: threshold };
    }
    default:
      return null;
  }
}

/** Structural equality that ignores object key order. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) || Array.isArray(b)) {
    return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  if (a && b && typeof a === "object" && typeof b === "object") {
    const ka = Object.keys(a).sort();
    const kb = Object.keys(b).sort();
    return deepEqual(ka, kb) && ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

/** Predicate: every oracle field must equal the extracted answer's field. */
export function satisfies(answer: unknown, oracle: Record<string, unknown>): boolean {
  if (!answer || typeof answer !== "object") return false;
  return Object.entries(oracle).every(([k, v]) => deepEqual((answer as Record<string, unknown>)[k], v));
}

async function main(): Promise<void> {
  const results: Array<Record<string, unknown>> = [];
  for (const [index, task] of tasks.readTasks.entries()) {
    // Reset: a fresh repo/session per task and mode.
    const { server } = createSession({ viewHtml: "<!-- replay: the view is not loaded in text mode -->" });
    const [c, s] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "approval-desk-replay", version: "0.2.0" }, { capabilities: {} });
    await server.connect(s);
    await client.connect(c);
    const texts: string[] = [];
    const calls: Array<{ tool: string; arguments: unknown; query: unknown; total: unknown; nextOffset: unknown }> = [];
    const started = performance.now();
    for (const call of task.text.calls) {
      const result = await client.callTool({ name: call.tool, arguments: call.arguments });
      const content = (result.content ?? []) as Array<{ type: string; text?: string }>;
      texts.push(content.filter((x) => x.type === "text").map((x) => x.text ?? "").join("\n"));
      // Query parameters and paging actually applied, as reported by the server.
      const sc = (result.structuredContent ?? {}) as { query?: unknown; total?: unknown; nextOffset?: unknown };
      calls.push({ tool: call.tool, arguments: call.arguments, query: sc.query ?? null, total: sc.total ?? null, nextOffset: sc.nextOffset ?? null });
    }
    const wallMs = performance.now() - started;
    const answer = extract(task.text.extract, texts, task.oracle as Record<string, unknown>);
    results.push({
      task: task.id,
      order: index + 1,
      mode: "text",
      toolCalls: calls.length,
      calls,
      // Text mode has no view: recorded separately and explicitly as zero.
      hostViewMessages: 0,
      uiActions: 0,
      scriptedModelTurns: 1,
      modelVisibleChars: texts.reduce((n, t) => n + t.length, 0),
      tokens: "unavailable (no named tokenizer or telemetry)",
      wallMsReal: Math.round(wallMs * 10) / 10,
      correct: satisfies(answer, task.oracle as Record<string, unknown>),
      ui: "not observed here: run the harness for UI-mode observations",
    });
    await client.close();
    await server.close();
  }
  process.stdout.write(
    JSON.stringify(
      {
        datasetVersion: tasks.datasetVersion,
        datasetSha256: createHash("sha256").update(readFileSync(new URL("../fixtures/approvals.v1.json", import.meta.url))).digest("hex"),
        runtime: `node ${process.version}`,
        sdkVersion: pkg.dependencies["@modelcontextprotocol/sdk"],
        extAppsVersion: pkg.dependencies["@modelcontextprotocol/ext-apps"],
        note: "Characters are not tokens. Tiny structural replays do not establish usability or model performance.",
        results,
      },
      null,
      2,
    ) + "\n",
  );
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, "/")}` || process.argv[1]?.endsWith("replay.ts")) {
  main().catch((error: unknown) => {
    process.stderr.write(`measure:replay failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  });
}
