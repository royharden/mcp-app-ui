import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildScriptedReport, tokensEstimate } from "../src/domain/measure.ts";

describe("scripted UI versus text", () => {
  it("marks only the read task as a fair comparison", () => {
    const report = buildScriptedReport();
    assert.equal(report.comparisons.length, 3);
    const read = report.comparisons.find((item) => item.taskId === "name-high-risk");
    const approve = report.comparisons.find((item) => item.taskId === "approve-low-risk");
    const deny = report.comparisons.find((item) => item.taskId === "deny-with-note");
    assert.ok(read);
    assert.ok(approve);
    assert.ok(deny);
    assert.equal(read.fairComparison, true);
    assert.equal(read.ui.success, true);
    assert.equal(read.text.success, true);
    assert.equal(read.text.tokensEstimate > read.ui.tokensEstimate, true);
    assert.equal(approve.fairComparison, false);
    assert.equal(approve.ui.success, true);
    assert.equal(approve.text.success, false);
    assert.equal(deny.ui.success, true);
    assert.equal(deny.text.success, false);
    assert.equal(report.limits.some((line) => line.includes("authorization")), true);
    assert.equal(report.limits.some((line) => line.includes("wall-clock")), true);
  });

  it("estimates tokens from characters", () => {
    assert.equal(tokensEstimate(0), 0);
    assert.equal(tokensEstimate(1), 1);
    assert.equal(tokensEstimate(4), 1);
    assert.equal(tokensEstimate(5), 2);
  });
});

