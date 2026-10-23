import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolName, UI_MIME, UI_RESOURCE_URI } from "../src/domain/constants.ts";
import { ErrorCodes } from "../src/domain/errors.ts";
import { DEMO_OWNER, SEED_IDS, seedItems } from "../src/domain/seed.ts";
import { ApprovalStore } from "../src/domain/store.ts";
import { callTool, createSession, handleRpc } from "../src/mcp/server.ts";

const NOW = "2026-10-23T15:00:00.000Z";

function readyStore(): { store: ApprovalStore; session: ReturnType<typeof createSession> } {
  const store = new ApprovalStore(seedItems(), () => "token-server");
  const session = createSession(DEMO_OWNER, "model");
  const opened = handleRpc(store, session, { jsonrpc: "2.0", id: 1, method: "initialize" }, NOW);
  assert.equal(opened?.error, undefined);
  return { store, session };
}

describe("MCP contract", () => {
  it("lists read tools to the model and keeps the nested UI link", () => {
    const { store, session } = readyStore();
    const listed = handleRpc(store, session, { jsonrpc: "2.0", id: 2, method: "tools/list" }, NOW);
    const tools = (listed?.result as { tools: Array<{ name: string; _meta: Record<string, unknown> }> }).tools;
    assert.deepEqual(
      tools.map((tool) => tool.name),
      [ToolName.listApprovals, ToolName.getApproval],
    );
    assert.equal(tools[0]?._meta.ui && (tools[0]._meta.ui as { resourceUri: string }).resourceUri, UI_RESOURCE_URI);
    assert.equal(Object.hasOwn(tools[0]?._meta ?? {}, "ui/resourceUri"), false);
  });

  it("returns the app document and refuses a model write without changing the row", () => {
    const { store, session } = readyStore();
    const read = handleRpc(
      store,
      session,
      { jsonrpc: "2.0", id: 3, method: "resources/read", params: { uri: UI_RESOURCE_URI } },
      NOW,
    );
    const contents = (read?.result as { contents: Array<{ mimeType: string; text: string }> }).contents;
    assert.equal(contents[0]?.mimeType, UI_MIME);
    assert.equal(contents[0]?.text.includes("ui/initialize"), true);
    const before = store.get(DEMO_OWNER, SEED_IDS.low);
    const denied = callTool(store, session, ToolName.commitDecision, { id: SEED_IDS.low, action: "approve" }, NOW);
    assert.equal(denied.isError, true);
    assert.equal(denied.content[0]?.text.includes(ErrorCodes.appToolForbidden), true);
    const after = store.get(DEMO_OWNER, SEED_IDS.low);
    assert.equal(before.ok && after.ok && before.value.status === after.value.status, true);
  });

  it("keeps the confirmation token out of the request text", () => {
    const store = new ApprovalStore(seedItems(), () => "token-secret");
    const session = createSession(DEMO_OWNER, "app");
    handleRpc(store, session, { jsonrpc: "2.0", id: 1, method: "initialize" }, NOW);
    const requested = callTool(
      store,
      session,
      ToolName.requestDecision,
      { id: SEED_IDS.low, action: "approve" },
      NOW,
    );
    assert.equal(requested.isError, false);
    assert.equal(requested.content[0]?.text.includes("token-secret"), false);
    const challenge = (requested.structuredContent as { challenge: { token: string } }).challenge;
    assert.equal(challenge.token, "token-secret");
  });

  it("rejects tool calls before initialize", () => {
    const store = new ApprovalStore(seedItems(), () => "token-early");
    const session = createSession(DEMO_OWNER, "model");
    const early = handleRpc(store, session, { jsonrpc: "2.0", id: 9, method: "tools/list" }, NOW);
    assert.equal(early?.error?.code, -32002);
  });
});
