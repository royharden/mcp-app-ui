// @vitest-environment happy-dom
// Runs every declarative scenario through the exact bundle and compares observations with its
// expectations. injectedFault runs are reported separately and never count as real-server passes.
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BUILT_VIEW, baseIdentity, runScenario, ScenarioSchema } from "../../harness/index.ts";

const dir = fileURLToPath(new URL("../../harness/scenarios/", import.meta.url));
const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();

describe("declarative scenarios", () => {
  it("all scenario files validate against the allowlisted schema", () => {
    expect(files.length).toBeGreaterThanOrEqual(4);
    for (const f of files) {
      const parsed = ScenarioSchema.safeParse(JSON.parse(readFileSync(dir + f, "utf8")));
      expect(parsed.success, f).toBe(true);
    }
  });

  it("rejects executable or unknown actions", () => {
    const bad = {
      id: "bad",
      description: "x",
      mode: "realHandlers",
      datasetVersion: "approvals-v1",
      hostContext: {},
      initialToolInput: {},
      faults: [],
      actions: [{ do: "eval", code: "fetch('https://example.test')" }],
      expected: {},
    };
    expect(ScenarioSchema.safeParse(bad).success).toBe(false);
  });

  for (const file of files) {
    it(`scenario ${file}`, async () => {
      const input = JSON.parse(readFileSync(dir + file, "utf8"));
      const run = await runScenario(input, { viewHtml: BUILT_VIEW.html, identity: baseIdentity() });
      const { expected } = run.scenario;
      for (const [id, status] of Object.entries(expected.statuses ?? {})) expect(run.observed.statuses[id], id).toBe(status);
      for (const [id, n] of Object.entries(expected.historyLengths ?? {})) expect(run.observed.historyLengths[id], id).toBe(n);
      if (expected.outcome) expect(run.observed.outcome).toBe(expected.outcome);
      if (expected.statementShown) expect(run.observed.statementShown).toBe(expected.statementShown);
      if (expected.acceptedMessages) expect(run.observed.acceptedMessages).toEqual(expected.acceptedMessages);

      // Trace contract: identity present, terminal disposition, faults labelled, no raw nonces.
      expect(run.trace.identity).toMatchObject({ scenarioId: run.scenario.id, mode: run.scenario.mode });
      expect(run.trace.identity.rawHtmlSha256).toBe(BUILT_VIEW.sha256);
      expect(run.trace.terminal).toBe("completed");
      const faults = run.trace.events.filter((e) => e.channel === "fault");
      expect(faults.length > 0).toBe(run.scenario.mode === "injectedFault");
      const nonceValues: string[] = [];
      const collect = (v: unknown, key: string | null) => {
        if (key === "nonce" && typeof v === "string") nonceValues.push(v);
        if (Array.isArray(v)) v.forEach((x) => collect(x, key));
        else if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) collect(x, k);
      };
      collect(run.trace.events, null);
      for (const n of nonceValues) expect(n).toMatch(/^nonce#\d+$/);
      const serialized = JSON.stringify(run.trace);
      expect(serialized).not.toContain("Sandbox renewal approved");
      expect(serialized).not.toContain("SYSTEM NOTE");
    });
  }
});
