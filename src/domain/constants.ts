export const EXTENSION_ID = "io.modelcontextprotocol/ui";

export const UI_MIME = "text/html;profile=mcp-app";

export const UI_RESOURCE_URI = "ui://confirm-queue/approval";

export const ToolName = {
  listApprovals: "list_approvals",
  getApproval: "get_approval",
  requestDecision: "request_decision",
  commitDecision: "commit_decision",
} as const;

export type ToolNameValue = (typeof ToolName)[keyof typeof ToolName];

export const NOTE_LIMIT = 500;

export function uiMeta(): { ui: { resourceUri: string } } {
  return { ui: { resourceUri: UI_RESOURCE_URI } };
}
