// In-memory repository. One instance per Lab session or stdio process; nothing persists.
import { DomainError } from "../domain/errors.ts";
import { seedRequests } from "../domain/dataset.ts";
import type { ApprovalRequest, Decision } from "../domain/schemas.ts";
import { buildStatement } from "../domain/statement.ts";
import { applyDecision, utcStamp } from "../domain/transitions.ts";
import { NONCE_CAPACITY, type CommitInput, type CommitResult, type PreparationInput, type Repo } from "./Repo.ts";

interface PreparationRecord {
  id: string;
  version: number;
  decision: Decision;
  reason: string;
  statementHash: string;
  expiresAtMs: number;
  used: boolean;
}

export interface MemoryRepoOptions {
  seed?: ApprovalRequest[];
  capacity?: number;
}

export function createMemoryRepo(options: MemoryRepoOptions = {}): Repo {
  const rows = new Map<string, ApprovalRequest>();
  for (const r of options.seed ?? seedRequests()) rows.set(r.id, r);
  const capacity = options.capacity ?? NONCE_CAPACITY;
  // Keyed by SHA-256 of the raw nonce; raw nonces are never stored.
  const preparations = new Map<string, PreparationRecord>();

  function cleanup(nowMs: number): void {
    // Used tombstones are retained through their original expiry, then dropped with the rest.
    for (const [hash, rec] of preparations) {
      if (nowMs >= rec.expiresAtMs) preparations.delete(hash);
    }
  }

  return {
    list() {
      return Array.from(rows.values()).map((r) => structuredClone(r));
    },

    get(id) {
      const row = rows.get(id);
      return row ? structuredClone(row) : undefined;
    },

    recordPreparation(input: PreparationInput, now: Date) {
      const row = rows.get(input.id);
      if (!row) throw new DomainError("not_found");
      if (row.status !== "pending") throw new DomainError("not_pending");
      // The handler awaited hashing after reading the row; recheck the version here.
      if (row.version !== input.version) throw new DomainError("version_conflict");
      cleanup(now.getTime());
      if (preparations.size >= capacity) throw new DomainError("nonce_capacity");
      if (preparations.has(input.nonceHash)) {
        // 32 random bytes make this unreachable in practice; refuse rather than overwrite.
        throw new DomainError("invalid_input", "Nonce collision; prepare again.");
      }
      preparations.set(input.nonceHash, {
        id: input.id,
        version: input.version,
        decision: input.decision,
        reason: input.reason,
        statementHash: input.statementHash,
        expiresAtMs: input.expiresAtMs,
        used: false,
      });
    },

    commit(input: CommitInput, now: Date): CommitResult {
      const nowMs = now.getTime();
      const rec = preparations.get(input.nonceHash);
      if (!rec) throw new DomainError("nonce_unknown");
      if (rec.used) throw new DomainError("nonce_used");
      if (nowMs >= rec.expiresAtMs) throw new DomainError("nonce_expired");
      if (rec.id !== input.id || rec.decision !== input.decision) throw new DomainError("decision_mismatch");
      const row = rows.get(rec.id);
      if (!row) throw new DomainError("not_found");
      if (row.status !== "pending") throw new DomainError("not_pending");
      if (row.version !== rec.version) throw new DomainError("version_conflict");
      const expected = buildStatement(row, rec.decision, rec.reason);
      if (input.statement !== expected || input.statementHash !== rec.statementHash) {
        throw new DomainError("statement_mismatch");
      }
      // Every check passed: consume and transition with no await in between.
      rec.used = true;
      const { next, record } = applyDecision(row, rec.decision, rec.reason, utcStamp(now));
      rows.set(next.id, next);
      return { request: structuredClone(next), record: { ...record } };
    },

    heldPreparations(now: Date) {
      cleanup(now.getTime());
      return preparations.size;
    },
  };
}
