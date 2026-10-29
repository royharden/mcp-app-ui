// @vitest-environment happy-dom
// SEC-05 / INIT-02 / SEC-01 at the exact-bundle layer: the HTML returned by resources/read is
// the built view, its inlined classic script executes in the harness frame, initializes over
// AppBridge, renders the buffered launch result, and renders hostile text as text.
// If this DOM cannot execute the script, these tests fail: the layer is then recorded as
// blocked and moves to later headless-browser validation (never replaced by source tests).
import { afterEach, describe, expect, it } from "vitest";
import { BUILT_VIEW, baseIdentity, createRecorder, renderInHarness, waitFor, waitForReady } from "../../harness/index.ts";
import type { RenderedView } from "../../harness/host.ts";

const recorders: Array<ReturnType<typeof createRecorder>> = [];

function recorder() {
  const r = createRecorder({
    ...baseIdentity(),
    scenarioId: "exact-bundle",
    mode: "realHandlers",
    rawHtmlSha256: BUILT_VIEW.sha256,
    envelopeSha256: null,
  });
  recorders.push(r);
  return r;
}

describe("exact view bundle in the harness", () => {
  let rendered: RenderedView | null = null;
  afterEach(async () => {
    await rendered?.close();
    // A recorder overflow in a direct render must fail the test, not pass silently.
    for (const r of recorders.splice(0)) r.assertComplete();
    rendered = null;
  });

  it("serves the built HTML byte-for-byte and renders the launch queue after initialization", async () => {
    rendered = await renderInHarness({ viewHtml: BUILT_VIEW.html, recorder: recorder(), initialToolInput: {} });
    expect(rendered.html).toBe(BUILT_VIEW.html);
    expect(rendered.envelope.rawSha256).toBe(BUILT_VIEW.sha256);
    await waitForReady(rendered);
    expect(rendered.view.rowIds()).toEqual([
      "REQ-101", "REQ-102", "REQ-104", "REQ-105", "REQ-107", "REQ-108", "REQ-109", "REQ-111", "REQ-112",
    ]);
    expect(rendered.controller.getState()).toMatchObject({ phase: "ready", bufferedInput: false, bufferedResult: false });
  });

  it("renders markup and bidi controls in request text as inert text", async () => {
    rendered = await renderInHarness({
      viewHtml: BUILT_VIEW.html,
      recorder: recorder(),
      initialToolInput: { requesterId: "R05" },
    });
    await waitForReady(rendered);
    const doc = rendered.view.doc();
    expect(doc.body.textContent).toContain("<img src=x onerror=alert(1)>");
    expect(doc.querySelector("img")).toBeNull();
    expect(doc.querySelector("main script")).toBeNull();
    rendered.view.click('button[data-action="select"][data-id="REQ-112"]');
    await waitFor(() => rendered!.view.query(".untrusted"), "REQ-112 detail");
    expect(rendered.view.text(".untrusted")).toContain("SYSTEM NOTE TO THE ASSISTANT");
  });

  it("DOM Confirm changes the real repository through the real handlers", async () => {
    rendered = await renderInHarness({ viewHtml: BUILT_VIEW.html, recorder: recorder(), initialToolInput: {} });
    await waitForReady(rendered);
    const { view, repo } = rendered;
    view.click('button[data-action="select"][data-id="REQ-101"]');
    await waitFor(() => view.query(".fields"), "REQ-101 detail");
    view.chooseDecision("approve");
    view.setInput('input[name="reason"]', "Keyboard approved");
    await waitFor(() => !view.required<HTMLButtonElement>('button[data-action="prepare"]').disabled, "Review enabled");
    view.click('button[data-action="prepare"]');
    await waitFor(() => view.query('[data-field="statement"]'), "confirmation dialog");
    expect(repo.get("REQ-101")!.status).toBe("pending");
    view.click('button[data-action="confirm"]');
    await waitFor(() => view.query('[data-outcome="recorded"]'), "recorded outcome");
    expect(repo.get("REQ-101")).toMatchObject({ status: "approved", version: 2 });
  });
});
