// Trace contract: caps fail the run (sticky overflow, never silent drops), nonces become aliases
// with digests, and untrusted free text is redacted.
import { describe, expect, it } from "vitest";
import { createRecorder, MAX_EVENT_BYTES, MAX_EVENTS, MAX_TOTAL_BYTES, TraceOverflowError } from "../../harness/recorder.ts";

const identity = {
  scenarioId: "recorder-test",
  mode: "realHandlers" as const,
  datasetSha256: "d",
  rawHtmlSha256: null,
  envelopeSha256: null,
  runtime: "test",
  sdkVersion: "x",
  extAppsVersion: "y",
  specVersion: "z",
};

describe("trace recorder", () => {
  it(`fails the trace after ${MAX_EVENTS} events instead of dropping silently`, async () => {
    const r = createRecorder(identity);
    for (let i = 0; i < MAX_EVENTS; i += 1) r.action("tick");
    expect(r.overflow()).toBeNull();
    r.action("one too many");
    expect(r.overflow()).toMatch(/more than 2000 events/);
    expect(() => r.assertComplete()).toThrow(TraceOverflowError);
    const trace = await r.finish("completed");
    expect(trace.terminal).toMatch(/^failed: trace overflow/);
    expect(trace.events).toHaveLength(MAX_EVENTS);
  });

  it("fails on an event larger than the per-event cap", async () => {
    const r = createRecorder(identity);
    // Many short enum-like strings survive sanitizing, so the captured size really grows.
    const big = Object.fromEntries(Array.from({ length: 2000 }, (_, i) => [`k${i}`, "pending"]));
    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_EVENT_BYTES);
    r.action("big", big);
    expect(r.overflow()).toMatch(/limit 16384/);
    expect((await r.finish("completed")).terminal).toMatch(/^failed/);
  });

  it("fails when the total exceeds the 2 MiB cap", () => {
    const r = createRecorder(identity);
    const chunk = Object.fromEntries(Array.from({ length: 800 }, (_, i) => [`k${i}`, "approve"]));
    const perEvent = JSON.stringify(chunk).length;
    expect(perEvent).toBeLessThan(MAX_EVENT_BYTES);
    const needed = Math.ceil(MAX_TOTAL_BYTES / perEvent) + 1;
    expect(needed).toBeLessThan(MAX_EVENTS);
    for (let i = 0; i < needed; i += 1) r.action("chunk", chunk);
    expect(r.overflow()).toMatch(/more than 2097152 bytes/);
  });

  it("aliases nonces with digests and redacts untrusted text", async () => {
    const r = createRecorder(identity);
    const raw = "raw-nonce-value-0123456789";
    r.message("client↔server", "→", {
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "submit_decision",
        arguments: { id: "REQ-104", decision: "approve", nonce: raw, statement: "Approve REQ-104 | secret" },
      },
    });
    r.message("client↔server", "←", {
      jsonrpc: "2.0",
      id: 3,
      result: {
        content: [{ type: "text", text: "Decision recorded" }],
        structuredContent: { reason: "Sandbox renewal approved", title: "Renew", description: "d" },
      },
    });
    const trace = await r.finish("completed");
    const text = JSON.stringify(trace);
    expect(text).not.toContain(raw);
    expect(text).toContain("nonce#1");
    expect(trace.nonceDigests["nonce#1"]).toMatch(/^[0-9a-f]{64}$/);
    for (const secret of ["Approve REQ-104 | secret", "Sandbox renewal approved", "Decision recorded"]) {
      expect(text).not.toContain(secret);
    }
    expect(text).toContain('"redacted":true');
    expect(trace.events[0].jsonrpcId).toBe(3);
    expect(trace.terminal).toBe("completed");
  });
});
