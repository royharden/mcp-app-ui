import { confirmationStatement, failure, isDecisionAction, isExpired, addMilliseconds } from "./confirm.ts";
import { NOTE_LIMIT } from "./constants.ts";
import { ErrorCodes } from "./errors.ts";
import type { ApprovalItem, DecisionChallenge, DecisionRecord, Result } from "./types.ts";

export interface CommitInput {
  actorId: string;
  approvalId: string;
  action: string;
  token: string;
  statement: string;
  note: string;
  now: string;
}

export class ApprovalStore {
  private readonly items: ApprovalItem[];

  private readonly challenges: DecisionChallenge[] = [];

  private readonly decisions: DecisionRecord[] = [];

  constructor(
    items: readonly ApprovalItem[],
    private readonly random: () => string,
    private readonly ttlMs = 10 * 60 * 1000,
  ) {
    this.items = items.map((item) => ({ ...item }));
  }

  list(actorId: string): Result<ApprovalItem[]> {
    if (!actorId) {
      return missingActor();
    }
    return {
      ok: true,
      value: this.items.filter((item) => item.ownerId === actorId).map(copyItem),
    };
  }

  get(actorId: string, id: string): Result<ApprovalItem> {
    if (!actorId) {
      return missingActor();
    }
    const item = this.items.find((candidate) => candidate.id === id);
    if (!item) {
      return failure(ErrorCodes.unknownApproval, "No approval with that id exists.");
    }
    if (item.ownerId !== actorId) {
      return failure(ErrorCodes.notOwner, "This approval belongs to another person.");
    }
    return { ok: true, value: copyItem(item) };
  }

  requestDecision(actorId: string, id: string, action: string, now: string): Result<DecisionChallenge> {
    if (!actorId) {
      return missingActor();
    }
    if (!isDecisionAction(action)) {
      return failure(ErrorCodes.invalidInput, "Action must be approve or deny.");
    }
    const item = this.get(actorId, id);
    if (!item.ok) {
      return item;
    }
    if (item.value.status !== "pending") {
      return failure(ErrorCodes.notPending, "This approval is no longer pending.");
    }
    const token = this.random();
    if (!token) {
      return failure(ErrorCodes.invalidInput, "The token source returned an empty token.");
    }
    if (this.challenges.some((challenge) => challenge.token === token)) {
      return failure(ErrorCodes.invalidInput, "The token source repeated a live token.");
    }
    let expiresAt: string;
    try {
      expiresAt = addMilliseconds(now, this.ttlMs);
    } catch {
      return failure(ErrorCodes.invalidInput, "The clock value is not a valid time.");
    }
    const challenge: DecisionChallenge = {
      approvalId: item.value.id,
      action,
      actorId,
      statement: confirmationStatement(item.value, action),
      token,
      expiresAt,
      used: false,
    };
    this.challenges.push(challenge);
    return { ok: true, value: { ...challenge } };
  }

  commit(input: CommitInput): Result<DecisionRecord> {
    if (!input.actorId) {
      return missingActor();
    }
    if (!isDecisionAction(input.action)) {
      return failure(ErrorCodes.invalidInput, "Action must be approve or deny.");
    }
    if (input.note.length > NOTE_LIMIT) {
      return failure(ErrorCodes.invalidInput, `Note must be ${NOTE_LIMIT} characters or fewer.`);
    }
    const challenge = this.challenges.find((candidate) => candidate.token === input.token);
    if (!challenge) {
      return failure(
        ErrorCodes.challengeMismatch,
        "The confirmation token does not match this approval.",
      );
    }
    if (challenge.actorId !== input.actorId) {
      return failure(ErrorCodes.actorMismatch, "The confirmation token was issued to a different actor.");
    }
    if (challenge.approvalId !== input.approvalId || challenge.action !== input.action) {
      return failure(
        ErrorCodes.challengeMismatch,
        "The confirmation token does not match this approval.",
      );
    }
    if (challenge.statement !== input.statement) {
      return failure(
        ErrorCodes.statementMismatch,
        "The confirmed statement does not match the proposed change.",
      );
    }
    if (challenge.used) {
      return failure(ErrorCodes.challengeUsed, "The confirmation token was already used.");
    }
    if (isExpired(challenge.expiresAt, input.now)) {
      return failure(ErrorCodes.challengeExpired, "The confirmation token has expired. Request a new decision.");
    }
    const item = this.items.find((candidate) => candidate.id === input.approvalId);
    if (!item) {
      return failure(ErrorCodes.unknownApproval, "No approval with that id exists.");
    }
    if (item.ownerId !== input.actorId) {
      return failure(ErrorCodes.notOwner, "This approval belongs to another person.");
    }
    if (item.status !== "pending") {
      return failure(ErrorCodes.notPending, "This approval is no longer pending.");
    }
    challenge.used = true;
    item.status = input.action === "approve" ? "approved" : "denied";
    const record: DecisionRecord = {
      approvalId: item.id,
      action: input.action,
      actorId: input.actorId,
      statement: challenge.statement,
      note: input.note,
      token: challenge.token,
      decidedAt: input.now,
    };
    this.decisions.push(record);
    return { ok: true, value: { ...record } };
  }
}

function copyItem(item: ApprovalItem): ApprovalItem {
  return { ...item };
}

function missingActor(): Result<never> {
  return failure(ErrorCodes.missingActor, "Sign in is required before this queue can be read or changed.");
}
