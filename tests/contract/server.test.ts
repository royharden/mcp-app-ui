// MCP-01 and SEC-03: an independent SDK Client initializes, lists five tools, calls real
// handlers and reads the exact resource; expected values are pinned here, not imported.
import { RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { afterEach, describe, expect, it } from "vitest";
import { connectSession, STUB_VIEW_HTML, structured, text } from "./helpers.ts";

const EXPECTED_MIME = "text/html;profile=mcp-app";
const EXPECTED_URI = "ui://approval-desk/queue.html";

type ToolMeta = { ui?: { resourceUri?: string; visibility?: string[] } };

describe("MCP-01 server contract", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("matches the SDK constant to the pinned stable MIME type", () => {
    expect(RESOURCE_MIME_TYPE).toBe(EXPECTED_MIME);
  });

  it("lists exactly five tools with the planned visibility and a single UI link", async () => {
    const s = await connectSession();
    close = s.close;
    const { tools } = await s.client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      ["get_approval", "list_approvals", "open_approval_desk", "prepare_decision", "submit_decision"].sort(),
    );
    const meta = (name: string) => (tools.find((t) => t.name === name)?._meta ?? {}) as ToolMeta;
    expect(meta("open_approval_desk").ui?.resourceUri).toBe(EXPECTED_URI);
    for (const name of ["list_approvals", "get_approval", "prepare_decision", "submit_decision"]) {
      expect(meta(name).ui?.resourceUri).toBeUndefined();
    }
    expect(meta("open_approval_desk").ui?.visibility).toEqual(["model", "app"]);
    expect(meta("list_approvals").ui?.visibility).toEqual(["model", "app"]);
    expect(meta("get_approval").ui?.visibility).toEqual(["model", "app"]);
    expect(meta("prepare_decision").ui?.visibility).toEqual(["app"]);
    expect(meta("submit_decision").ui?.visibility).toEqual(["app"]);
    for (const name of ["open_approval_desk", "list_approvals", "get_approval"]) {
      expect(tools.find((t) => t.name === name)?.annotations?.readOnlyHint).toBe(true);
    }
    for (const t of tools) {
      expect(t.inputSchema.type).toBe("object");
      expect((t.inputSchema as { additionalProperties?: unknown }).additionalProperties).toBe(false);
      expect(t.outputSchema).toBeDefined();
    }
  });

  it("serves the exact injected HTML with the MCP App MIME type and an empty CSP allowlist", async () => {
    const s = await connectSession();
    close = s.close;
    const { resources } = await s.client.listResources();
    expect(resources.map((r) => r.uri)).toContain(EXPECTED_URI);
    const read = await s.client.readResource({ uri: EXPECTED_URI });
    expect(read.contents).toHaveLength(1);
    const content = read.contents[0] as { uri: string; mimeType?: string; text?: string; _meta?: Record<string, unknown> };
    expect(content.uri).toBe(EXPECTED_URI);
    expect(content.mimeType).toBe(EXPECTED_MIME);
    expect(content.text).toBe(STUB_VIEW_HTML);
    expect(content._meta).toEqual({
      ui: { csp: { connectDomains: [], resourceDomains: [], frameDomains: [] }, prefersBorder: true },
    });
  });

  it("returns non-empty text plus matching structured content for reads", async () => {
    const s = await connectSession();
    close = s.close;
    const open = await s.call("open_approval_desk", {});
    const list = await s.call("list_approvals", {});
    expect(open.isError).toBeFalsy();
    expect(structured(open)).toEqual(structured(list));
    expect(text(list)).toContain("Matching requests: 9.");
    const detail = await s.call("get_approval", { id: "REQ-104" });
    expect(structured<{ request: { title: string; version: number } }>(detail).request).toMatchObject({
      title: "Renew sandbox editor",
      version: 3,
    });
    expect(text(detail)).toContain("Renew sandbox editor");
  });

  it("reports not_found and invalid input as readable errors without stack traces", async () => {
    const s = await connectSession();
    close = s.close;
    const missing = await s.call("get_approval", { id: "REQ-999" });
    expect(missing.isError).toBe(true);
    expect(text(missing)).toContain("not_found");
    const bad = await s.call("list_approvals", { pageSize: 99 });
    expect(bad.isError).toBe(true);
    const message = bad.protocolError ?? text(bad);
    expect(message.length).toBeGreaterThan(0);
    expect(message).not.toMatch(/\n\s+at /);
  });

  it("SEC-03: visibility is metadata only; a direct caller can still prepare and submit", async () => {
    // This documents the plan's limit: hiding prepare/submit from the model is the host's
    // policy. The server cannot tell a model-initiated call from an app-initiated one.
    const s = await connectSession();
    close = s.close;
    const prepared = await s.call("prepare_decision", { id: "REQ-107", decision: "approve", reason: "Direct caller" });
    const p = structured<{ nonce: string; statement: string }>(prepared);
    const submitted = await s.call("submit_decision", {
      id: "REQ-107",
      decision: "approve",
      nonce: p.nonce,
      statement: p.statement,
    });
    expect(submitted.isError).toBeFalsy();
    expect(text(prepared)).not.toContain(p.nonce);
  });
});
