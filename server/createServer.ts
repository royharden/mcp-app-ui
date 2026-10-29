// Runtime-neutral MCP server. The Lab runs it in the page over an SDK in-memory pair; the
// stdio entry runs it in Node. It never reads files: the view HTML is injected.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } from "@modelcontextprotocol/ext-apps/server";
import { ZodError, type ZodTypeAny, type z } from "zod";
import { type Clock, type RandomSource, sha256Hex, toBase64Url } from "./domain/crypto.ts";
import { DomainError, type ErrorCode } from "./domain/errors.ts";
import { normalizeQuery, runQuery } from "./domain/query.ts";
import {
  DATASET_VERSION,
  DetailShape,
  GetApprovalInputSchema,
  PrepareDecisionInputSchema,
  PrepareOutputShape,
  QueryInputSchema,
  QueueOutputShape,
  SCHEMA_VERSION,
  SubmitDecisionInputSchema,
  SubmitOutputShape,
  type DetailOutput,
  type ErrorOutput,
  type PrepareOutput,
  type SubmitOutput,
} from "./domain/schemas.ts";
import { buildStatement, normalizeReason } from "./domain/statement.ts";
import {
  renderDetailText,
  renderErrorText,
  renderPreparedText,
  renderQueueText,
  renderRecordedText,
  safeDescription,
  toRow,
} from "./domain/textRender.ts";
import { NONCE_TTL_MS, type Repo } from "./repo/Repo.ts";

export const SERVER_NAME = "approval-desk";
export const SERVER_VERSION = "0.2.0";
export const VIEW_URI = "ui://approval-desk/queue.html";
export const VIEW_MIME_TYPE = "text/html;profile=mcp-app";
export const NONCE_BYTES = 32;

export const TOOL_NAMES = [
  "open_approval_desk",
  "list_approvals",
  "get_approval",
  "prepare_decision",
  "submit_decision",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

/** The view declares no external origins and asks for no device permissions. */
export const VIEW_CSP = { connectDomains: [], resourceDomains: [], frameDomains: [] };

export interface CreateServerOptions {
  repo: Repo;
  clock: Clock;
  random: RandomSource;
  viewHtml: string;
}

export function errorResult(code: ErrorCode, message: string): CallToolResult {
  const structured: ErrorOutput = { kind: "error", schemaVersion: SCHEMA_VERSION, code, message };
  return {
    isError: true,
    content: [{ type: "text", text: renderErrorText(code, message) }],
    structuredContent: structured,
  };
}

function okResult(text: string, structured: object): CallToolResult {
  return { content: [{ type: "text", text }], structuredContent: structured as Record<string, unknown> };
}

/**
 * Input schemas are passed as strict Zod objects so the SDK advertises and enforces
 * "no unknown properties" (raw shapes would silently strip them).
 * The SDK validates inputs against the advertised schema first; this second strict parse
 * maps anything that reaches the handler to the stable invalid_input code, and turns
 * DomainErrors into readable isError results. Unexpected errors are reported without stacks.
 */
function handle<S extends ZodTypeAny>(
  schema: S,
  run: (input: z.infer<S>) => CallToolResult | Promise<CallToolResult>,
) {
  return async (args: unknown): Promise<CallToolResult> => {
    try {
      return await run(schema.parse(args ?? {}));
    } catch (error) {
      if (error instanceof DomainError) return errorResult(error.code, error.message);
      if (error instanceof ZodError) {
        const detail = error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
        return errorResult("invalid_input", detail);
      }
      return errorResult("invalid_input", "The request could not be processed.");
    }
  };
}

export function createServer(options: CreateServerOptions): McpServer {
  const { repo, clock, random, viewHtml } = options;
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  const queue = (args: z.infer<typeof QueryInputSchema>) => {
    const out = runQuery(repo.list(), normalizeQuery(args));
    return okResult(renderQueueText(out), out);
  };

  registerAppResource(
    server,
    "Approval Desk",
    VIEW_URI,
    {
      description: "Self-contained approval queue view. Synthetic data; records decisions only.",
      _meta: { ui: { csp: VIEW_CSP, prefersBorder: true } },
    },
    async () => ({
      contents: [
        {
          uri: VIEW_URI,
          mimeType: RESOURCE_MIME_TYPE,
          text: viewHtml,
          _meta: { ui: { csp: VIEW_CSP, prefersBorder: true } },
        },
      ],
    }),
  );

  registerAppTool(
    server,
    "open_approval_desk",
    {
      title: "Open approval desk",
      description:
        "Open the interactive approval desk on a filtered page of the synthetic queue. Returns the same rows as list_approvals plus a UI link. Recording a decision happens only inside the desk.",
      inputSchema: QueryInputSchema,
      outputSchema: QueueOutputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { resourceUri: VIEW_URI, visibility: ["model", "app"] } },
    },
    handle(QueryInputSchema, queue),
  );

  server.registerTool(
    "list_approvals",
    {
      title: "List approvals",
      description:
        "Filter, sort and page the synthetic approval queue. Default: pending, oldest first, 10 per page. Returns rows, total and category/risk counts over all matches.",
      inputSchema: QueryInputSchema,
      outputSchema: QueueOutputShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    handle(QueryInputSchema, queue),
  );

  server.registerTool(
    "get_approval",
    {
      title: "Get approval",
      description: "Full detail and decision history for one request by canonical id, e.g. REQ-104.",
      inputSchema: GetApprovalInputSchema,
      outputSchema: DetailShape,
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      _meta: { ui: { visibility: ["model", "app"] } },
    },
    handle(GetApprovalInputSchema, ({ id }) => {
      const request = repo.get(id);
      if (!request) throw new DomainError("not_found");
      const description = safeDescription(request.description);
      const out: DetailOutput = {
        kind: "approval-detail",
        schemaVersion: SCHEMA_VERSION,
        datasetVersion: DATASET_VERSION,
        request: {
          ...toRow(request),
          description: description.text,
          descriptionTruncated: description.truncated,
          decisionHistory: request.decisionHistory,
        },
      };
      return okResult(renderDetailText(request), out);
    }),
  );

  server.registerTool(
    "prepare_decision",
    {
      title: "Prepare decision",
      description:
        "App-only. Bind a pending request version, decision and reason to an exact statement and a one-time nonce. Records nothing.",
      inputSchema: PrepareDecisionInputSchema,
      outputSchema: PrepareOutputShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: { ui: { visibility: ["app"] } },
    },
    handle(PrepareDecisionInputSchema, async ({ id, decision, reason: rawReason }) => {
      const reason = normalizeReason(rawReason);
      const request = repo.get(id);
      if (!request) throw new DomainError("not_found");
      if (request.status !== "pending") throw new DomainError("not_pending");
      const statement = buildStatement(request, decision, reason);
      const nonce = toBase64Url(random(NONCE_BYTES));
      const [nonceHash, statementHash] = await Promise.all([sha256Hex(nonce), sha256Hex(statement)]);
      // Read the clock after hashing so the TTL starts when the record is stored.
      const now = clock();
      const expiresAtMs = now.getTime() + NONCE_TTL_MS;
      repo.recordPreparation(
        { nonceHash, id, version: request.version, decision, reason, statementHash, expiresAtMs },
        now,
      );
      const out: PrepareOutput = {
        kind: "decision-prepared",
        schemaVersion: SCHEMA_VERSION,
        id,
        decision,
        requestVersion: request.version,
        reason,
        statement,
        nonce,
        expiresAt: new Date(expiresAtMs).toISOString(),
      };
      return okResult(renderPreparedText(out), out);
    }),
  );

  server.registerTool(
    "submit_decision",
    {
      title: "Submit decision",
      description:
        "App-only. Record a prepared decision. Succeeds once per nonce, only for the exact prepared statement and only while the request is pending at the prepared version.",
      inputSchema: SubmitDecisionInputSchema,
      outputSchema: SubmitOutputShape,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      _meta: { ui: { visibility: ["app"] } },
    },
    handle(SubmitDecisionInputSchema, async ({ id, decision, nonce, statement }) => {
      // Finish all asynchronous hashing before the synchronous commit step.
      const [nonceHash, statementHash] = await Promise.all([sha256Hex(nonce), sha256Hex(statement)]);
      const { request, record } = repo.commit({ nonceHash, id, decision, statement, statementHash }, clock());
      const out: SubmitOutput = {
        kind: "decision-recorded",
        schemaVersion: SCHEMA_VERSION,
        id: request.id,
        decision: record.decision,
        status: request.status,
        version: request.version,
        record,
      };
      return okResult(renderRecordedText(out), out);
    }),
  );

  return server;
}
