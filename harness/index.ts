// Harness entry points and trace identity. Requires the built view: server/generated/view-html.ts
// is produced by `npm run build:view`; without it this module fails to load, visibly.
import pkg from "../package.json" with { type: "json" };
import { DATASET_SHA256, VIEW_HTML, VIEW_HTML_SHA256 } from "../server/generated/view-html.ts";
import type { TraceIdentity } from "./recorder.ts";

export { createRecorder, TraceOverflowError, MAX_EVENTS, MAX_EVENT_BYTES, MAX_TOTAL_BYTES } from "./recorder.ts";
export { renderInHarness, serverFixture, waitForReady, createHarnessFrame } from "./host.ts";
export { runScenario, ScenarioError, ScenarioSchema } from "./scenario.ts";
export { waitFor, viewDriver } from "./dom.ts";

export const BUILT_VIEW = { html: VIEW_HTML, sha256: VIEW_HTML_SHA256, datasetSha256: DATASET_SHA256 };

/** Spec revisions this code targets; recorded in every trace. */
export const SPEC_VERSIONS = "ext-apps 2026-01-26; MCP 2025-11-25";

export function baseIdentity(): Omit<TraceIdentity, "scenarioId" | "mode" | "rawHtmlSha256" | "envelopeSha256"> {
  const deps = pkg.dependencies as Record<string, string>;
  return {
    datasetSha256: DATASET_SHA256,
    runtime: typeof process !== "undefined" ? `node ${process.version}` : "unknown",
    sdkVersion: deps["@modelcontextprotocol/sdk"] ?? "unknown",
    extAppsVersion: deps["@modelcontextprotocol/ext-apps"] ?? "unknown",
    specVersion: SPEC_VERSIONS,
  };
}
