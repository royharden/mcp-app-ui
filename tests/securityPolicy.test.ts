import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ToolName } from "../src/domain/constants.ts";
import { ErrorCodes } from "../src/domain/errors.ts";
import {
  checkFramePolicy,
  hostMayPush,
  recommendedPolicy,
  rejectModelWrite,
  sourceAllowed,
  toolNamesFor,
  visibleTo,
} from "../src/domain/securityPolicy.ts";

describe("frame policy", () => {
  it("accepts the recommended double-origin sandbox", () => {
    assert.deepEqual(checkFramePolicy(recommendedPolicy()), { ok: true });
  });

  it("rejects same-origin access, top navigation, a shared origin, and an open CSP", () => {
    const base = recommendedPolicy();
    const sameOrigin = checkFramePolicy({
      ...base,
      sandboxAttribute: "allow-scripts allow-same-origin",
    });
    assert.equal(sameOrigin.ok, false);
    const navigation = checkFramePolicy({
      ...base,
      sandboxAttribute: "allow-scripts allow-top-navigation",
    });
    assert.equal(navigation.ok, false);
    const shared = checkFramePolicy({ ...base, sandboxOrigin: base.hostOrigin });
    assert.equal(shared.ok, false);
    const open = checkFramePolicy({
      ...base,
      csp: "default-src 'none'; connect-src https://example.com",
    });
    assert.equal(open.ok, false);
  });
});

describe("bridge gates", () => {
  it("drops the wrong source and any host push before initialized", () => {
    const policy = recommendedPolicy();
    assert.equal(sourceAllowed(policy.sandboxOrigin, policy.sandboxOrigin), true);
    assert.equal(sourceAllowed(policy.hostOrigin, policy.sandboxOrigin), false);
    assert.equal(sourceAllowed("", policy.sandboxOrigin), false);
    assert.equal(hostMayPush(false), false);
    assert.equal(hostMayPush(true), true);
  });

  it("hides write tools from the model audience", () => {
    assert.equal(visibleTo("model", ToolName.commitDecision), false);
    assert.equal(visibleTo("model", ToolName.requestDecision), false);
    assert.equal(visibleTo("model", ToolName.listApprovals), true);
    assert.equal(visibleTo("app", ToolName.commitDecision), true);
    assert.deepEqual(toolNamesFor("model"), [ToolName.listApprovals, ToolName.getApproval]);
    const rejected = rejectModelWrite(ToolName.commitDecision);
    assert.equal(rejected.ok, false);
    if (!rejected.ok) {
      assert.equal(rejected.code, ErrorCodes.appToolForbidden);
    }
  });
});
