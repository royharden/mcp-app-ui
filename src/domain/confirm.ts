import type { ApprovalItem, DecisionAction, Failure } from "./types.ts";

export function confirmationStatement(
  item: Pick<ApprovalItem, "title" | "proposedChange">,
  action: DecisionAction,
): string {
  const verb = action === "approve" ? "Approve" : "Deny";
  return `${verb} "${item.title}": ${item.proposedChange}`;
}

export function failure(code: string, message: string): Failure {
  return { ok: false, code, message };
}

export function addMilliseconds(iso: string, milliseconds: number): string {
  const parsed = Date.parse(iso);
  if (Number.isNaN(parsed)) {
    throw new Error("Clock value is not a valid time.");
  }
  return new Date(parsed + milliseconds).toISOString();
}

export function isExpired(expiresAt: string, now: string): boolean {
  const expiry = Date.parse(expiresAt);
  const current = Date.parse(now);
  if (Number.isNaN(expiry) || Number.isNaN(current)) {
    return true;
  }
  return expiry <= current;
}

export function isDecisionAction(value: string): value is DecisionAction {
  return value === "approve" || value === "deny";
}
