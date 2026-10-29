// Harness fixtures.
//
// serverFixture(): protocol layer only. Official SDK Client <-> in-memory pair <-> real
//   createServer with a fresh repo. No UI.
// renderInHarness(): exact-bundle layer. Reads the resource HTML through that Client, wraps it
//   in the same host CSP envelope the Lab uses, loads it into a frame in the happy-dom
//   document, and connects the shared host controller (AppBridge + PostMessageTransport). The
//   view's own inlined classic IIFE must execute and initialize; the harness then drives its
//   real DOM controls, and every tools/call goes to the real handlers.
//
// Harness-only deviation, recorded in docs/HARNESS.md: the frame is sandboxed with
// "allow-scripts allow-same-origin" so the test can read and drive the view's DOM. This layer
// therefore claims nothing about isolation; BROWSER-01 checks the real allow-scripts-only frame.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import type { Clock, RandomSource } from "../server/domain/crypto.ts";
import { createSession } from "../server/runtime.ts";
import type { Repo } from "../server/repo/Repo.ts";
import { buildEnvelope, type Envelope } from "../src/lab/csp.ts";
import { createHostController, type HostController, type ViewFrame } from "../src/lab/hostController.ts";
import { EXPECTED_MIME } from "../src/lab/labSession.ts";
import type { ProtocolLog } from "../src/lab/protocolLog.ts";
import { viewDriver, waitFor, type ViewDriver } from "./dom.ts";
import type { Recorder } from "./recorder.ts";

export type FaultName = "submitTimeoutAfterCommit" | "listTransportError";

export interface ServerFixtureOptions {
  viewHtml: string;
  recorder: Recorder;
  clock?: Clock;
  random?: RandomSource;
}

export async function serverFixture(options: ServerFixtureOptions) {
  const { repo, server } = createSession({ viewHtml: options.viewHtml, clock: options.clock, random: options.random });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "approval-desk-harness", version: "0.2.0" }, { capabilities: {} });
  await server.connect(serverSide);
  await client.connect(options.recorder.wrap(clientSide, "client↔server", "→"));
  const { tools } = await client.listTools();
  return {
    client,
    repo,
    tools,
    async close() {
      await client.close().catch(() => undefined);
      await server.close().catch(() => undefined);
    },
  };
}

/** Adapter so the shared host controller writes into the bounded harness trace. */
function recorderAsLog(recorder: Recorder): ProtocolLog {
  return {
    message: (channel, direction, msg) => recorder.message(channel, direction, msg),
    event: (_channel, summary) => recorder.action("host-event", { summary }),
  } as ProtocolLog;
}

/** Named injected faults wrap the real call; they are labelled in the trace. */
function faultyCall(client: Client, recorder: Recorder, faults: readonly FaultName[]) {
  if (faults.length === 0) return undefined;
  return async (params: { name: string; arguments: Record<string, unknown> }): Promise<CallToolResult> => {
    if (params.name === "list_approvals" && faults.includes("listTransportError")) {
      recorder.fault("listTransportError", { tool: params.name });
      throw new Error("Injected transport failure (harness fault).");
    }
    if (params.name === "submit_decision" && faults.includes("submitTimeoutAfterCommit")) {
      // The real handler runs and may commit; the reply is then lost.
      await client.callTool(params);
      recorder.fault("submitTimeoutAfterCommit", { tool: params.name });
      throw new Error("Request timed out (harness fault after the real call).");
    }
    return (await client.callTool(params)) as CallToolResult;
  };
}

export interface HarnessFrame extends ViewFrame {
  iframe: HTMLIFrameElement;
}

export function createHarnessFrame(doc: Document): HarnessFrame {
  const iframe = doc.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-scripts allow-same-origin");
  iframe.setAttribute("title", "Approval Desk view (harness)");
  doc.body.appendChild(iframe);
  const win = iframe.contentWindow;
  if (!win) throw new Error("Exact-bundle layer blocked: this DOM gives the iframe no window.");
  return {
    iframe,
    window: win,
    load: (html) => {
      iframe.srcdoc = html;
    },
    remove: () => iframe.remove(),
  };
}

export interface RenderOptions {
  viewHtml: string;
  recorder: Recorder;
  initialToolInput: Record<string, unknown>;
  hostContext?: Record<string, unknown>;
  messageCapability?: boolean;
  faults?: readonly FaultName[];
  clock?: Clock;
  random?: RandomSource;
}

export interface RenderedView {
  client: Client;
  repo: Repo;
  tools: Tool[];
  html: string;
  envelope: Envelope;
  controller: HostController;
  frame: HarnessFrame;
  view: ViewDriver;
  close(): Promise<void>;
}

export async function renderInHarness(options: RenderOptions): Promise<RenderedView> {
  const fixture = await serverFixture(options);
  const launch = fixture.tools.find(
    (t) => typeof (t._meta as { ui?: { resourceUri?: unknown } } | undefined)?.ui?.resourceUri === "string",
  );
  if (!launch) throw new Error("No tool links a UI resource.");
  const uri = (launch._meta as { ui: { resourceUri: string } }).ui.resourceUri;
  const read = await fixture.client.readResource({ uri });
  const content = read.contents[0] as { mimeType?: string; text?: unknown; _meta?: unknown };
  if (content.mimeType !== EXPECTED_MIME || typeof content.text !== "string") {
    throw new Error("The resource is not a single MCP App HTML document.");
  }
  const html = content.text;
  let envelope: Envelope;
  let frame: HarnessFrame;
  try {
    envelope = await buildEnvelope(html, content._meta);
    frame = createHarnessFrame(document);
  } catch (error) {
    await fixture.close();
    throw error;
  }
  const controller = createHostController({
    client: fixture.client,
    tools: fixture.tools,
    log: recorderAsLog(options.recorder),
    frame,
    messageCapability: options.messageCapability ?? true,
    hostContext: options.hostContext ?? { theme: "light", locale: "en-US", platform: "web", displayMode: "inline" },
    callTool: faultyCall(fixture.client, options.recorder, options.faults ?? []),
  });
  try {
    await controller.start(envelope.html);
    options.recorder.action("launch", { tool: launch.name, arguments: options.initialToolInput });
    controller.deliverInput(options.initialToolInput);
    const result = (await fixture.client.callTool({ name: launch.name, arguments: options.initialToolInput })) as CallToolResult;
    controller.deliverResult(result);
  } catch (error) {
    // Never leak the frame or the server when start-up fails.
    try {
      await controller.teardown();
    } finally {
      await fixture.close();
    }
    throw error;
  }

  const view = viewDriver(() => frame.iframe.contentDocument);
  return {
    client: fixture.client,
    repo: fixture.repo,
    tools: fixture.tools,
    html,
    envelope,
    controller,
    frame,
    view,
    async close() {
      await controller.teardown();
      await fixture.close();
    },
  };
}

/** Waits until the exact bundle has initialized and rendered the launch queue. */
export async function waitForReady(rendered: RenderedView, timeoutMs = 5000): Promise<void> {
  await waitFor(
    () => rendered.controller.getState().phase === "ready",
    "the view to send ui/notifications/initialized (exact-bundle execution)",
    timeoutMs,
  );
  await waitFor(() => rendered.view.phase() === "ready" && rendered.view.rowIds().length > 0, "the queue to render", timeoutMs);
}
