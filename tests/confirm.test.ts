import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { confirmationStatement } from "../src/domain/confirm.ts";
import { NOTE_LIMIT } from "../src/domain/constants.ts";
import { ErrorCodes } from "../src/domain/errors.ts";
import { DEMO_OWNER, SEED_IDS, seedItems } from "../src/domain/seed.ts";
import { ApprovalStore } from "../src/domain/store.ts";

const NOW = "2026-10-23T15:00:00.000Z";

function store(token = "token-1", ttlMs?: number): ApprovalStore {
  return new ApprovalStore(seedItems(), () => token, ttlMs);
}

describe("confirmation statements", () => {
  it("binds the verb, title, and proposed change", () => {
    const item = seedItems()[2];
    assert.equal(
      confirmationStatement(item, "approve"),
      'Approve "Rename the sandbox label": Rename the sandbox project label from Demo to Sandbox.',
    );
    assert.equal(
      confirmationStatement(item, "deny"),
      'Deny "Rename the sandbox label": Rename the sandbox project label from Demo to Sandbox.',
    );
  });
});

describe("approval store", () => {
  it("commits an approval only with a matching unused token", () => {
    const queue = store();
    const requested = queue.requestDecision(DEMO_OWNER, SEED_IDS.low, "approve", NOW);
    assert.equal(requested.ok, true);
    if (!requested.ok) {
      return;
    }
    const committed = queue.commit({
      actorId: DEMO_OWNER,
      approvalId: SEED_IDS.low,
      action: "approve",
      token: requested.value.token,
      statement: requested.value.statement,
      note: "",
      now: NOW,
    });
    assert.equal(committed.ok, true);
    const after = queue.get(DEMO_OWNER, SEED_IDS.low);
    assert.equal(after.ok && after.value.status, "approved");
    const again = queue.commit({
      actorId: DEMO_OWNER,
      approvalId: SEED_IDS.low,
      action: "approve",
      token: requested.value.token,
      statement: requested.value.statement,
      note: "",
      now: NOW,
    });
    assert.equal(again.ok, false);
    if (!again.ok) {
      assert.equal(again.code, ErrorCodes.challengeUsed);
    }
  });

  it("rejects a missing token, a mismatched statement, and a different actor", () => {
    const queue = store();
    const missing = queue.commit({
      actorId: DEMO_OWNER,
      approvalId: SEED_IDS.low,
      action: "approve",
      token: "nope",
      statement: "Approve something",
      note: "",
      now: NOW,
    });
    assert.equal(missing.ok, false);
    if (!missing.ok) {
      assert.equal(missing.code, ErrorCodes.challengeMismatch);
    }
    const requested = queue.requestDecision(DEMO_OWNER, SEED_IDS.low, "approve", NOW);
    assert.equal(requested.ok, true);
    if (!requested.ok) {
      return;
    }
    const statement = queue.commit({
      actorId: DEMO_OWNER,
      approvalId: SEED_IDS.low,
      action: "approve",
      token: requested.value.token,
      statement: `${requested.value.statement} extra`,
      note: "",
      now: NOW,
    });
    assert.equal(statement.ok, false);
    if (!statement.ok) {
      assert.equal(statement.code, ErrorCodes.statementMismatch);
    }
    const actor = queue.commit({
      actorId: "someone-else",
      approvalId: SEED_IDS.low,
      action: "approve",
      token: requested.value.token,
      statement: requested.value.statement,
      note: "",
      now: NOW,
    });
    assert.equal(actor.ok, false);
    if (!actor.ok) {
      assert.equal(actor.code, ErrorCodes.actorMismatch);
    }
  });

  it("rejects an expired token and a decision on a row that is no longer pending", () => {
    const queue = store("token-expire", 1000);
    const requested = queue.requestDecision(DEMO_OWNER, SEED_IDS.high, "deny", NOW);
    assert.equal(requested.ok, true);
    if (!requested.ok) {
      return;
    }
    const expired = queue.commit({
      actorId: DEMO_OWNER,
      approvalId: SEED_IDS.high,
      action: "deny",
      token: requested.value.token,
      statement: requested.value.statement,
      note: "too late",
      now: requested.value.expiresAt,
    });
    assert.equal(expired.ok, false);
    if (!expired.ok) {
      assert.equal(expired.code, ErrorCodes.challengeExpired);
    }
    const fresh = store("token-pending");
    const first = fresh.requestDecision(DEMO_OWNER, SEED_IDS.low, "approve", NOW);
    assert.equal(first.ok, true);
    if (!first.ok) {
      return;
    }
    const done = fresh.commit({
      actorId: DEMO_OWNER,
      approvalId: SEED_IDS.low,
      action: "approve",
      token: first.value.token,
      statement: first.value.statement,
      note: "",
      now: NOW,
    });
    assert.equal(done.ok, true);
    const second = fresh.requestDecision(DEMO_OWNER, SEED_IDS.low, "deny", NOW);
    assert.equal(second.ok, false);
    if (!second.ok) {
      assert.equal(second.code, ErrorCodes.notPending);
    }
  });

  it("hides other owners and refuses an empty actor", () => {
    const queue = store();
    const hidden = queue.get("other-owner", SEED_IDS.high);
    assert.equal(hidden.ok, false);
    if (!hidden.ok) {
      assert.equal(hidden.code, ErrorCodes.notOwner);
    }
    const absent = queue.list("");
    assert.equal(absent.ok, false);
    if (!absent.ok) {
      assert.equal(absent.code, ErrorCodes.missingActor);
    }
    const longNote = queue.requestDecision(DEMO_OWNER, SEED_IDS.medium, "deny", NOW);
    assert.equal(longNote.ok, true);
    if (!longNote.ok) {
      return;
    }
    const noted = queue.commit({
      actorId: DEMO_OWNER,
      approvalId: SEED_IDS.medium,
      action: "deny",
      token: longNote.value.token,
      statement: longNote.value.statement,
      note: "x".repeat(NOTE_LIMIT + 1),
      now: NOW,
    });
    assert.equal(noted.ok, false);
    if (!noted.ok) {
      assert.equal(noted.code, ErrorCodes.invalidInput);
    }
  });
});
