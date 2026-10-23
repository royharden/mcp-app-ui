import type { ApprovalItem, DecisionRecord, Failure } from "./types.ts";

export interface TextBlock {
  type: "text";
  text: string;
}

export interface ToolContentResult {
  content: TextBlock[];
  isError: boolean;
  structuredContent: unknown;
}

export function listText(items: readonly ApprovalItem[]): string {
  if (items.length === 0) {
    return "No approvals are waiting.";
  }
  const lines = items.map(
    (item) => `- ${item.id} | ${item.risk} | ${item.status} | ${item.title} | ${item.proposedChange}`,
  );
  return `Pending and recent approvals:\n${lines.join("\n")}`;
}

export function itemText(item: ApprovalItem): string {
  return [
    `${item.title} (${item.risk}, ${item.status})`,
    `Requester: ${item.requester}`,
    item.summary,
    `Proposed change: ${item.proposedChange}`,
  ].join("\n");
}

export function decisionText(record: DecisionRecord): string {
  const verb = record.action === "approve" ? "Approved" : "Denied";
  const note = record.note ? ` Note: ${record.note}` : "";
  return `${verb} ${record.approvalId}. ${record.statement}${note}`;
}

export function failureText(error: Failure): string {
  return `${error.code}: ${error.message}`;
}

export function uiVisibleText(items: readonly ApprovalItem[]): string {
  return items.map((item) => `${item.title} (${item.risk})`).join("\n");
}

export function asToolResult(text: string, structured: unknown, isError: boolean): ToolContentResult {
  if (text.trim().length === 0) {
    throw new Error("Tool text fallback is empty.");
  }
  return {
    content: [{ type: "text", text }],
    isError,
    structuredContent: structured,
  };
}
