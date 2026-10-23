import { uiMeta, ToolName, UI_MIME, UI_RESOURCE_URI } from "../domain/constants.ts";
import { ErrorCodes } from "../domain/errors.ts";
import { rejectModelWrite, visibleTo } from "../domain/securityPolicy.ts";
import type { ApprovalStore } from "../domain/store.ts";
import {
  asToolResult,
  decisionText,
  failureText,
  itemText,
  listText,
  type ToolContentResult,
} from "../domain/textFallback.ts";
import type { Audience } from "../domain/types.ts";
import { buildAppHtml } from "./htmlResource.ts";
import { resourceDescriptors, toolDescriptors } from "./descriptors.ts";

export interface Session {
  actorId: string | null;
  audience: Audience;
  mcpInitialized: boolean;
}

export interface RpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

export interface ToolCallResult extends ToolContentResult {
  _meta: { ui: { resourceUri: string } };
}

export function createSession(actorId: string | null, audience: Audience = "model"): Session {
  return { actorId, audience, mcpInitialized: false };
}

export function handleRpc(
  store: ApprovalStore,
  session: Session,
  raw: unknown,
  now: string,
): RpcResponse | null {
  if (!isRecord(raw) || raw.jsonrpc !== "2.0" || typeof raw.method !== "string") {
    const id = idOf(raw);
    if (id === undefined) {
      return null;
    }
    return rpcError(id, -32600, "Invalid JSON-RPC request.");
  }
  const method = raw.method;
  const id = idOf(raw);
  if (method === "notifications/initialized" || method.startsWith("notifications/")) {
    return null;
  }
  if (id === undefined) {
    return null;
  }
  if (method === "initialize") {
    session.mcpInitialized = true;
    return rpcResult(id, {
      protocolVersion: "2025-03-26",
      capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
      serverInfo: { name: "confirm-queue", version: "0.1.0" },
      instructions:
        "list_approvals and get_approval are read-only. request_decision and commit_decision belong to the Confirm Queue view.",
    });
  }
  if (!session.mcpInitialized) {
    return rpcError(id, -32002, "Server not initialized.");
  }
  if (method === "ping") {
    return rpcResult(id, {});
  }
  if (method === "tools/list") {
    return rpcResult(id, { tools: toolDescriptors(session.audience) });
  }
  if (method === "tools/call") {
    const params = isRecord(raw.params) ? raw.params : {};
    const name = typeof params.name === "string" ? params.name : "";
    return rpcResult(id, callTool(store, session, name, params.arguments, now));
  }
  if (method === "resources/list") {
    return rpcResult(id, { resources: resourceDescriptors() });
  }
  if (method === "resources/read") {
    const params = isRecord(raw.params) ? raw.params : {};
    const uri = typeof params.uri === "string" ? params.uri : "";
    if (uri !== UI_RESOURCE_URI) {
      return rpcError(id, -32002, "Unknown resource URI.");
    }
    return rpcResult(id, {
      contents: [{ uri: UI_RESOURCE_URI, mimeType: UI_MIME, text: buildAppHtml() }],
    });
  }
  return rpcError(id, -32601, "Method not found.");
}

export function callTool(
  store: ApprovalStore,
  session: Session,
  name: string,
  rawArgs: unknown,
  now: string,
): ToolCallResult {
  const args = isRecord(rawArgs) ? rawArgs : {};
  if (!visibleTo(session.audience, name)) {
    if (knownWrite(name)) {
      const rejected = rejectModelWrite(name);
      return finish(asToolResult(failureText(rejected), { error: rejected.code }, true));
    }
    return finish(invalid(`Unknown tool: ${name || "(blank)"}.`));
  }
  const actorId = session.actorId ?? "";
  if (name === ToolName.listApprovals) {
    const listed = store.list(actorId);
    if (!listed.ok) {
      return finish(asToolResult(failureText(listed), { error: listed.code }, true));
    }
    return finish(asToolResult(listText(listed.value), { items: listed.value }, false));
  }
  if (name === ToolName.getApproval) {
    const id = readString(args, "id");
    if (!id) {
      return finish(invalid("id is required."));
    }
    const item = store.get(actorId, id);
    if (!item.ok) {
      return finish(asToolResult(failureText(item), { error: item.code }, true));
    }
    return finish(asToolResult(itemText(item.value), { item: item.value }, false));
  }
  if (name === ToolName.requestDecision) {
    const id = readString(args, "id");
    const action = readString(args, "action");
    if (!id || !action) {
      return finish(invalid("id and action are required."));
    }
    const requested = store.requestDecision(actorId, id, action, now);
    if (!requested.ok) {
      return finish(asToolResult(failureText(requested), { error: requested.code }, true));
    }
    const text = `Confirmation required before any write.\n${requested.value.statement}\nThe confirmation token stays in the view.`;
    return finish(asToolResult(text, { challenge: requested.value }, false));
  }
  if (name === ToolName.commitDecision) {
    const id = readString(args, "id");
    const action = readString(args, "action");
    const token = readString(args, "token");
    const statement = readString(args, "statement");
    const note = readString(args, "note") ?? "";
    if (!id || !action || !token || !statement) {
      return finish(invalid("id, action, token, and statement are required."));
    }
    const committed = store.commit({ actorId, approvalId: id, action, token, statement, note, now });
    if (!committed.ok) {
      return finish(asToolResult(failureText(committed), { error: committed.code }, true));
    }
    return finish(asToolResult(decisionText(committed.value), { decision: committed.value }, false));
  }
  return finish(invalid(`Unknown tool: ${name || "(blank)"}.`));
}

function finish(result: ToolContentResult): ToolCallResult {
  return { ...result, _meta: uiMeta() };
}

function invalid(message: string): ToolContentResult {
  return asToolResult(`${ErrorCodes.invalidInput}: ${message}`, { error: ErrorCodes.invalidInput }, true);
}

function knownWrite(name: string): boolean {
  return name === ToolName.requestDecision || name === ToolName.commitDecision;
}

function readString(args: Record<string, unknown>, key: string): string | null {
  const value = args[key];
  return typeof value === "string" ? value : null;
}

function rpcResult(id: string | number | null, result: unknown): RpcResponse {
  return { jsonrpc: "2.0", id, result };
}

function rpcError(id: string | number | null, code: number, message: string): RpcResponse {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function idOf(raw: unknown): string | number | null | undefined {
  if (!isRecord(raw) || !Object.hasOwn(raw, "id")) {
    return undefined;
  }
  const id = raw.id;
  if (id === null || typeof id === "string" || typeof id === "number") {
    return id;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
