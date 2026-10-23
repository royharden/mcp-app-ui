import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ErrorCodes } from "../src/domain/errors.ts";
import { SEED_IDS } from "../src/domain/seed.ts";
import { DEMO_HOST_ORIGIN, DEMO_SANDBOX_ORIGIN } from "../src/domain/securityPolicy.ts";
import { HostBridge } from "../src/harness/bridge.ts";
import { simulationById } from "../src/harness/fixtures.ts";
import { runDecisionJourney } from "../src/harness/journey.ts";

const NOW = "2026-10-23T15:00:00.000Z";

describe("headless host bridge", () => {
  it("approves only after initialize and a matching confirmation", () => {
    const report = runDecisionJourney("approve", SEED_IDS.low, "", NOW);
    assert.equal(report.ok, true);
    assert.equal(report.finalStatus, "approved");
    assert.equal(report.earlyPushDelivered, false);
    assert.equal(report.toolResultDelivered, true);
    assert.equal(report.log.some((entry) => entry.direction === "dropped" && entry.detail === ErrorCodes.notInitialized), true);
  });

  it("denies with a note and ignores the wrong source", () => {
    const report = runDecisionJourney("deny", SEED_IDS.medium, "Needs a narrower folder.", NOW);
    assert.equal(report.ok, true);
    assert.equal(report.finalStatus, "denied");
    const simulation = simulationById("dark-fullscreen");
    assert.ok(simulation);
    const bridge = new HostBridge(DEMO_SANDBOX_ORIGIN, DEMO_HOST_ORIGIN, simulation);
    const spoofed = bridge.receiveFromView(DEMO_HOST_ORIGIN, { method: "ui/notifications/initialized" });
    assert.equal(spoofed.ok, false);
    if (!spoofed.ok) {
      assert.equal(spoofed.code, ErrorCodes.badSource);
    }
    assert.equal(bridge.initialized, false);
    assert.equal(bridge.pushToView("ui/notifications/tool-result", "hidden").delivered, false);
  });
});
