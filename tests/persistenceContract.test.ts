import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { confirmationStatement } from "../src/domain/confirm.ts";

const root = new URL("../", import.meta.url);

describe("durable decision contract", () => {
  it("uses the same confirmation sentence as the in-memory rules", () => {
    assert.equal(confirmationStatement({ title: "T", proposedChange: "C" }, "approve"), 'Approve "T": C');
    assert.equal(confirmationStatement({ title: "T", proposedChange: "C" }, "deny"), 'Deny "T": C');
    const sql = readFileSync(new URL("supabase/migrations/20261023180000_confirm_queue.sql", root), "utf8");
    assert.equal(sql.includes(`'Approve "' || v_title || '": ' || v_change`), true);
    assert.equal(sql.includes(`'Deny "' || v_title || '": ' || v_change`), true);
    for (const code of [
      "invalid_input",
      "unknown_approval",
      "not_owner",
      "not_pending",
      "challenge_mismatch",
      "actor_mismatch",
      "statement_mismatch",
      "challenge_used",
      "challenge_expired",
    ]) {
      assert.equal(sql.includes(code), true, code);
    }
    assert.equal(sql.includes("enable row level security"), true);
    assert.equal(sql.includes("status = 'pending'"), true);
    assert.equal(sql.includes("grant execute"), true);
  });

  it("keeps the edge function on a user JWT and off public env prefixes", () => {
    const source = readFileSync(new URL("supabase/functions/approval-decision/index.ts", root), "utf8");
    const config = readFileSync(new URL("supabase/config.toml", root), "utf8");
    assert.equal(source.includes("auth.getUser"), true);
    assert.equal(source.includes("missing_config"), true);
    assert.equal(source.includes("unauthenticated"), true);
    assert.equal(source.includes("SUPABASE_SERVICE_ROLE_KEY"), true);
    assert.equal(source.includes("VITE_"), false);
    assert.equal(config.includes("verify_jwt = true"), true);
  });
});
