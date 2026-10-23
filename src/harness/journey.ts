import { ToolName } from "../domain/constants.ts";
import { DEMO_OWNER, seedItems } from "../domain/seed.ts";
import { DEMO_HOST_ORIGIN, DEMO_SANDBOX_ORIGIN } from "../domain/securityPolicy.ts";
import { ApprovalStore } from "../domain/store.ts";
import { callTool, createSession, handleRpc } from "../mcp/server.ts";
import { HostBridge } from "./bridge.ts";
import { simulationById } from "./fixtures.ts";

export interface JourneyReport {
  ok: boolean;
  finalStatus: string | null;
  error: string | null;
  steps: string[];
  log: HostBridge["log"];
  earlyPushDelivered: boolean;
  toolResultDelivered: boolean;
}

export function runDecisionJourney(
  action: "approve" | "deny",
  approvalId: string,
  note: string,
  now: string,
): JourneyReport {
  const simulation = simulationById("light-inline");
  if (!simulation) {
    throw new Error("Missing light-inline host simulation.");
  }
  const store = new ApprovalStore(seedItems(), () => `token-${action}-${approvalId}`);
  const session = createSession(DEMO_OWNER, "app");
  const opened = handleRpc(
    store,
    session,
    { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
    now,
  );
  if (!opened || opened.error) {
    throw new Error("Harness failed to initialize the MCP session.");
  }
  const bridge = new HostBridge(DEMO_SANDBOX_ORIGIN, DEMO_HOST_ORIGIN, simulation);
  const steps: string[] = [];
  const early = bridge.pushToView("ui/notifications/tool-result", "before initialized");
  const hello = bridge.receiveFromView(DEMO_SANDBOX_ORIGIN, {
    method: "ui/initialize",
    params: { appInfo: { name: "Confirm Queue", version: "0.1.0" } },
  });
  steps.push(hello.ok ? "ui/initialize" : hello.code);
  const ready = bridge.receiveFromView(DEMO_SANDBOX_ORIGIN, { method: "ui/notifications/initialized" });
  steps.push(ready.ok ? "ui/notifications/initialized" : ready.code);
  const listed = callTool(store, session, ToolName.listApprovals, {}, now);
  const delivered = bridge.pushToView("ui/notifications/tool-result", listed.content[0]?.text ?? "");
  steps.push(delivered.delivered ? "tool-result" : "tool-result-dropped");
  const requestedCall = bridge.receiveFromView(DEMO_SANDBOX_ORIGIN, {
    method: "tools/call",
    params: { name: ToolName.requestDecision, arguments: { id: approvalId, action } },
  });
  if (!requestedCall.ok) {
    return finish(store, approvalId, false, requestedCall.message, steps, bridge, early.delivered, delivered.delivered);
  }
  const requested = callTool(
    store,
    session,
    ToolName.requestDecision,
    { id: approvalId, action },
    now,
  );
  steps.push(ToolName.requestDecision);
  if (requested.isError) {
    return finish(store, approvalId, false, requested.content[0]?.text ?? "request failed", steps, bridge, early.delivered, delivered.delivered);
  }
  const challenge = readChallenge(requested.structuredContent);
  if (!challenge) {
    return finish(store, approvalId, false, "Request did not return a challenge.", steps, bridge, early.delivered, delivered.delivered);
  }
  const commitCall = bridge.receiveFromView(DEMO_SANDBOX_ORIGIN, {
    method: "tools/call",
    params: {
      name: ToolName.commitDecision,
      arguments: {
        id: approvalId,
        action,
        token: challenge.token,
        statement: challenge.statement,
        note,
      },
    },
  });
  if (!commitCall.ok) {
    return finish(store, approvalId, false, commitCall.message, steps, bridge, early.delivered, delivered.delivered);
  }
  const committed = callTool(
    store,
    session,
    ToolName.commitDecision,
    {
      id: approvalId,
      action,
      token: challenge.token,
      statement: challenge.statement,
      note,
    },
    now,
  );
  steps.push(ToolName.commitDecision);
  const item = store.get(DEMO_OWNER, approvalId);
  const finalStatus = item.ok ? item.value.status : null;
  const expected = action === "approve" ? "approved" : "denied";
  return finish(
    store,
    approvalId,
    !committed.isError && finalStatus === expected,
    committed.isError ? committed.content[0]?.text ?? "commit failed" : null,
    steps,
    bridge,
    early.delivered,
    delivered.delivered,
  );
}

function finish(
  store: ApprovalStore,
  approvalId: string,
  ok: boolean,
  error: string | null,
  steps: string[],
  bridge: HostBridge,
  earlyPushDelivered: boolean,
  toolResultDelivered: boolean,
): JourneyReport {
  const item = store.get(DEMO_OWNER, approvalId);
  return {
    ok,
    finalStatus: item.ok ? item.value.status : null,
    error: ok ? null : error,
    steps,
    log: bridge.log,
    earlyPushDelivered,
    toolResultDelivered,
  };
}

function readChallenge(value: unknown): { token: string; statement: string } | null {
  if (!value || typeof value !== "object" || !("challenge" in value)) {
    return null;
  }
  const challenge = (value as { challenge?: unknown }).challenge;
  if (!challenge || typeof challenge !== "object") {
    return null;
  }
  const token = "token" in challenge ? challenge.token : undefined;
  const statement = "statement" in challenge ? challenge.statement : undefined;
  if (typeof token !== "string" || typeof statement !== "string") {
    return null;
  }
  return { token, statement };
}
