import type { ApprovalRequest, Decision, DecisionRecord } from "../domain/schemas.ts";

export const NONCE_CAPACITY = 256;
export const NONCE_TTL_MS = 5 * 60 * 1000;

export interface PreparationInput {
  nonceHash: string;
  id: string;
  version: number;
  decision: Decision;
  /** Already normalized. */
  reason: string;
  statementHash: string;
  expiresAtMs: number;
}

export interface CommitInput {
  nonceHash: string;
  id: string;
  decision: Decision;
  statement: string;
  statementHash: string;
}

export interface CommitResult {
  request: ApprovalRequest;
  record: DecisionRecord;
}

/**
 * Per-session state. Every method is synchronous: the compare/consume/update step in
 * `commit` cannot interleave with another call, so two preparations at one version
 * permit at most one transition.
 */
export interface Repo {
  list(): readonly ApprovalRequest[];
  get(id: string): ApprovalRequest | undefined;
  /** Rechecks pending/version, frees expired records, enforces capacity, stores the record. */
  recordPreparation(input: PreparationInput, now: Date): void;
  /** Validates the nonce record and the current row, then consumes and transitions atomically. */
  commit(input: CommitInput, now: Date): CommitResult;
  /** Records still held (unused or used tombstones) after expiry cleanup. */
  heldPreparations(now: Date): number;
}
