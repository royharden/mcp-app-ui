// Pure state transition for one recorded decision. The repository calls this inside its
// single synchronous compare/consume/update step.
import type { ApprovalRequest, Decision, DecisionRecord } from "./schemas.ts";

export function applyDecision(
  request: ApprovalRequest,
  decision: Decision,
  reason: string,
  decidedAt: string,
): { next: ApprovalRequest; record: DecisionRecord } {
  if (request.status !== "pending") {
    throw new Error("applyDecision requires a pending request");
  }
  const record: DecisionRecord = {
    decision,
    reason,
    decidedAt,
    fromVersion: request.version,
    toVersion: request.version + 1,
  };
  const next: ApprovalRequest = {
    ...request,
    status: decision === "approve" ? "approved" : "rejected",
    version: request.version + 1,
    decisionHistory: [...request.decisionHistory, record],
  };
  return { next, record };
}

/** UTC timestamp with second precision, matching the fixture's format. */
export function utcStamp(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}
