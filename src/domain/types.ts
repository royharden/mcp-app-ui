export type Risk = "low" | "medium" | "high";

export type ApprovalStatus = "pending" | "approved" | "denied";

export type DecisionAction = "approve" | "deny";

export type Audience = "model" | "app";

export interface ApprovalItem {
  id: string;
  ownerId: string;
  title: string;
  requester: string;
  summary: string;
  proposedChange: string;
  risk: Risk;
  status: ApprovalStatus;
  createdAt: string;
}

export interface DecisionChallenge {
  approvalId: string;
  action: DecisionAction;
  actorId: string;
  statement: string;
  token: string;
  expiresAt: string;
  used: boolean;
}

export interface DecisionRecord {
  approvalId: string;
  action: DecisionAction;
  actorId: string;
  statement: string;
  note: string;
  token: string;
  decidedAt: string;
}

export interface Failure {
  ok: false;
  code: string;
  message: string;
}

export interface Success<T> {
  ok: true;
  value: T;
}

export type Result<T> = Success<T> | Failure;
