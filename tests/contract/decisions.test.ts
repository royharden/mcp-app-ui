// DEC-01..04 and SEC-04 through real handlers: every rejected path leaves requests and
// history untouched, and a valid nonce is not consumed by a failed submit.
import { afterEach, describe, expect, it } from "vitest";
import { createMemoryRepo } from "../../server/repo/memoryRepo.ts";
import { NONCE_TTL_MS } from "../../server/repo/Repo.ts";
import { DomainError } from "../../server/domain/errors.ts";
import { connectSession, errorCode, structured, text } from "./helpers.ts";

type Prepared = { nonce: string; statement: string; requestVersion: number; expiresAt: string };
type Session = Awaited<ReturnType<typeof connectSession>>;

async function prepare(s: Session, id: string, decision: "approve" | "reject", reason: string) {
  const result = await s.call("prepare_decision", { id, decision, reason });
  expect(result.isError).toBeFalsy();
  return structured<Prepared>(result);
}

function snapshot(s: Session) {
  return JSON.stringify(s.repo.list());
}

describe("decision transitions through real handlers", () => {
  let close: (() => Promise<void>) | undefined;
  afterEach(async () => {
    await close?.();
    close = undefined;
  });

  it("DEC-01: prepare changes nothing; approve and reject each change one row once", async () => {
    const s = await connectSession();
    close = s.close;
    const before = snapshot(s);
    const p = await prepare(s, "REQ-104", "approve", "Sandbox renewal approved");
    expect(p.statement).toBe(
      'Approve REQ-104 | title="Renew sandbox editor" | USD 1240.00 | version=3 | reason="Sandbox renewal approved"',
    );
    expect(snapshot(s)).toBe(before);

    const ok = await s.call("submit_decision", { id: "REQ-104", decision: "approve", nonce: p.nonce, statement: p.statement });
    expect(ok.isError).toBeFalsy();
    expect(structured(ok)).toMatchObject({ kind: "decision-recorded", status: "approved", version: 4 });
    expect(text(ok)).toContain("Decision recorded: REQ-104 approve.");
    const after = s.repo.get("REQ-104")!;
    expect(after.decisionHistory).toHaveLength(1);
    expect(after.decisionHistory[0]).toMatchObject({ decision: "approve", fromVersion: 3, toVersion: 4, reason: "Sandbox renewal approved" });
    for (const r of s.repo.list()) if (r.id !== "REQ-104") expect(r).toEqual(JSON.parse(before).find((x: { id: string }) => x.id === r.id));

    const r = await prepare(s, "REQ-105", "reject", "Over the travel cap");
    const rejected = await s.call("submit_decision", { id: "REQ-105", decision: "reject", nonce: r.nonce, statement: r.statement });
    expect(structured(rejected)).toMatchObject({ status: "rejected", version: 2 });
  });

  it("DEC-02 / SEC-04: rejected submits have no effect", async () => {
    const s = await connectSession();
    close = s.close;
    const p = await prepare(s, "REQ-101", "approve", "Fine");
    const before = snapshot(s);
    const cases: Array<[Record<string, unknown>, string]> = [
      [{ id: "REQ-101", decision: "approve", nonce: "never-prepared", statement: p.statement }, "nonce_unknown"],
      [{ id: "REQ-101", decision: "approve", nonce: p.nonce, statement: p.statement + " " }, "statement_mismatch"],
      [{ id: "REQ-101", decision: "approve", nonce: p.nonce, statement: p.statement.replace("USD 450.00", "USD 4.50") }, "statement_mismatch"],
      [{ id: "REQ-102", decision: "approve", nonce: p.nonce, statement: p.statement }, "decision_mismatch"],
      [{ id: "REQ-101", decision: "reject", nonce: p.nonce, statement: p.statement }, "decision_mismatch"],
    ];
    for (const [args, code] of cases) {
      const result = await s.call("submit_decision", args);
      expect(result.isError, code).toBe(true);
      expect(errorCode(result)).toBe(code);
      expect(snapshot(s)).toBe(before);
    }
    // Missing nonce is rejected at input validation (SDK or handler) and writes nothing.
    const missing = await s.call("submit_decision", { id: "REQ-101", decision: "approve", statement: p.statement });
    expect(missing.isError).toBe(true);
    expect(snapshot(s)).toBe(before);
    // The valid nonce survived every failure above.
    const ok = await s.call("submit_decision", { id: "REQ-101", decision: "approve", nonce: p.nonce, statement: p.statement });
    expect(ok.isError).toBeFalsy();
    // Immediate replay.
    const replay = await s.call("submit_decision", { id: "REQ-101", decision: "approve", nonce: p.nonce, statement: p.statement });
    expect(errorCode(replay)).toBe("nonce_used");
    expect(s.repo.get("REQ-101")!.decisionHistory).toHaveLength(1);
  });

  it("DEC-02: preparing a decided request is refused", async () => {
    const s = await connectSession();
    close = s.close;
    const result = await s.call("prepare_decision", { id: "REQ-103", decision: "reject", reason: "Too late" });
    expect(errorCode(result)).toBe("not_pending");
  });

  it("DEC-03: two preparations at one version permit exactly one transition", async () => {
    const s = await connectSession();
    close = s.close;
    const a = await prepare(s, "REQ-108", "approve", "First");
    const b = await prepare(s, "REQ-108", "reject", "Second");
    const [ra, rb] = await Promise.all([
      s.call("submit_decision", { id: "REQ-108", decision: "approve", nonce: a.nonce, statement: a.statement }),
      s.call("submit_decision", { id: "REQ-108", decision: "reject", nonce: b.nonce, statement: b.statement }),
    ]);
    const outcomes = [ra, rb].map((r) => (r.isError ? errorCode(r) : "ok"));
    expect(outcomes.filter((o) => o === "ok")).toHaveLength(1);
    expect(outcomes.filter((o) => o === "not_pending" || o === "version_conflict")).toHaveLength(1);
    const row = s.repo.get("REQ-108")!;
    expect(row.version).toBe(2);
    expect(row.decisionHistory).toHaveLength(1);
  });

  it("DEC-03: now >= expiresAt is expired; one millisecond earlier is not", async () => {
    const s = await connectSession();
    close = s.close;
    const start = s.time.nowMs();
    const early = await prepare(s, "REQ-107", "approve", "Boundary");
    expect(Date.parse(early.expiresAt)).toBe(start + NONCE_TTL_MS);
    s.time.set(start + NONCE_TTL_MS);
    const expired = await s.call("submit_decision", { id: "REQ-107", decision: "approve", nonce: early.nonce, statement: early.statement });
    expect(errorCode(expired)).toBe("nonce_expired");

    s.time.set(start);
    const fresh = await prepare(s, "REQ-107", "approve", "Boundary");
    s.time.set(start + NONCE_TTL_MS - 1);
    const ok = await s.call("submit_decision", { id: "REQ-107", decision: "approve", nonce: fresh.nonce, statement: fresh.statement });
    expect(ok.isError).toBeFalsy();
  });

  it("DEC-03: nonce capacity refuses excess preparations until expiry frees space", async () => {
    const s = await connectSession({ capacity: 3 });
    close = s.close;
    for (let i = 0; i < 3; i += 1) await prepare(s, "REQ-111", "approve", `Attempt ${i}`);
    const refused = await s.call("prepare_decision", { id: "REQ-111", decision: "approve", reason: "One more" });
    expect(errorCode(refused)).toBe("nonce_capacity");
    s.time.advance(NONCE_TTL_MS);
    await prepare(s, "REQ-111", "approve", "After expiry");
  });

  it("DEC-04: a changed reason needs a new preparation", async () => {
    const s = await connectSession();
    close = s.close;
    const p = await prepare(s, "REQ-112", "reject", "Original reason");
    const edited = p.statement.replace("Original reason", "Edited reason");
    const result = await s.call("submit_decision", { id: "REQ-112", decision: "reject", nonce: p.nonce, statement: edited });
    expect(errorCode(result)).toBe("statement_mismatch");
    expect(s.repo.get("REQ-112")!.status).toBe("pending");
  });

  it("reason rules are enforced by prepare with invalid_input", async () => {
    const s = await connectSession();
    close = s.close;
    const result = await s.call("prepare_decision", { id: "REQ-101", decision: "approve", reason: "two\nlines" });
    expect(errorCode(result)).toBe("invalid_input");
  });

  it("repo rechecks the version captured before asynchronous hashing", () => {
    // Commit-time version_conflict is defensive: through the current tools a pending row's
    // version only changes when it leaves pending. The recheck at record time is reachable.
    const repo = createMemoryRepo();
    let caught: unknown;
    try {
      repo.recordPreparation(
        { nonceHash: "h", id: "REQ-104", version: 2, decision: "approve", reason: "r", statementHash: "s", expiresAtMs: Date.now() + 1000 },
        new Date(),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect((caught as DomainError).code).toBe("version_conflict");
  });
});
