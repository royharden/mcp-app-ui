// Host side of one rendered view: AppBridge over PostMessageTransport to exactly one frame
// window, with the Lab's policies. Shared by the browser Lab (iframe frame) and the headless
// harness (happy-dom frame), so both exercise the same host code.
//
// Policies:
// - Initialization: at most one initial tool input and one initial tool result are buffered
//   until `initialized`, then flushed once, input before result. A second one before ready is
//   an overflow and fails visibly.
// - tools/call and ui/message are refused before ready, after teardown, or without capability.
// - Only app-visible tools of this server are forwarded, through the same SDK Client.
// - ui/open-link is always refused, with a visible log entry and no window.open.
// - ui/message accepts only the fixed "Decision recorded: <id> <decision>" template.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";
import { loggingTransport, type ProtocolLog } from "./protocolLog.ts";

export const HOST_INFO = { name: "approval-desk-bridge-lab", version: "0.2.0" } as const;
export const MESSAGE_TEMPLATE = /^Decision recorded: REQ-\d{3} (approve|reject)$/;
export const TEARDOWN_TIMEOUT_MS = 2000;

/** A place to put the view's document. The window must exist before the document loads. */
export interface ViewFrame {
  readonly window: Window;
  load(html: string): void;
  remove(): void;
}

export type HostPhase = "idle" | "initializing" | "ready" | "overflow" | "torndown";

export interface HostState {
  phase: HostPhase;
  error: string | null;
  bufferedInput: boolean;
  bufferedResult: boolean;
  acceptedMessages: string[];
  refusedLinks: number;
}

export interface HostControllerOptions {
  client: Client;
  tools: Tool[];
  log: ProtocolLog;
  frame: ViewFrame;
  messageCapability: boolean;
  hostContext: Record<string, unknown>;
  onState?: (state: HostState) => void;
}

export function appVisibleToolNames(tools: Tool[]): Set<string> {
  const names = new Set<string>();
  for (const tool of tools) {
    const visibility = (tool._meta as { ui?: { visibility?: string[] } } | undefined)?.ui?.visibility;
    // Absent visibility defaults to model+app in the extension specification.
    if (!visibility || visibility.includes("app")) names.add(tool.name);
  }
  return names;
}

export function createHostController(options: HostControllerOptions) {
  const { client, log, frame } = options;
  const appTools = appVisibleToolNames(options.tools);
  let state: HostState = {
    phase: "idle",
    error: null,
    bufferedInput: false,
    bufferedResult: false,
    acceptedMessages: [],
    refusedLinks: 0,
  };
  let pendingInput: Record<string, unknown> | null = null;
  let pendingResult: CallToolResult | null = null;
  let bridge: AppBridge | null = null;

  function update(patch: Partial<HostState>): void {
    state = { ...state, ...patch };
    options.onState?.(state);
  }

  function requireReady(what: string): void {
    if (state.phase !== "ready") throw new Error(`${what} refused: the view is ${state.phase}, not ready.`);
  }

  async function start(html: string): Promise<void> {
    if (state.phase !== "idle") throw new Error("A host controller renders one view once.");
    const capabilities: Record<string, unknown> = { serverTools: {} };
    if (options.messageCapability) capabilities.message = { text: {} };
    // null client: nothing is forwarded implicitly; every handler below is explicit.
    const next = new AppBridge(null, HOST_INFO, capabilities as never, { hostContext: options.hostContext as never });
    bridge = next;

    next.oninitialized = () => {
      if (state.phase !== "initializing") return;
      update({ phase: "ready", bufferedInput: false, bufferedResult: false });
      log.event("host↔view", "view initialized; flushing buffered launch data");
      const input = pendingInput;
      const result = pendingResult;
      pendingInput = null;
      pendingResult = null;
      void (async () => {
        if (input) await next.sendToolInput({ arguments: input });
        if (result) await next.sendToolResult(result as never);
      })();
    };

    next.oncalltool = async (params: { name: string; arguments?: Record<string, unknown> }) => {
      requireReady("tools/call");
      if (!appTools.has(params.name)) throw new Error(`tools/call refused: ${params.name} is not app-visible on this server.`);
      return (await client.callTool({ name: params.name, arguments: params.arguments ?? {} })) as never;
    };

    next.onmessage = async (params: { role?: string; content?: Array<{ type: string; text?: string }> }) => {
      requireReady("ui/message");
      if (!options.messageCapability) throw new Error("ui/message refused: not negotiated.");
      const content = params.content ?? [];
      const text = content.length === 1 && content[0].type === "text" ? content[0].text ?? "" : "";
      if (params.role !== "user" || !MESSAGE_TEMPLATE.test(text)) {
        log.event("host↔view", "ui/message refused: not the fixed id+decision template");
        return { isError: true } as never;
      }
      update({ acceptedMessages: [...state.acceptedMessages, text] });
      log.event("host↔view", `ui/message accepted by the Lab (not a model): ${text}`);
      return {} as never;
    };

    next.onopenlink = async () => {
      update({ refusedLinks: state.refusedLinks + 1 });
      log.event("host↔view", "ui/open-link refused: this host opens no links");
      return { isError: true } as never;
    };

    // Attach to the frame window BEFORE its document loads, so no early message is missed.
    const transport = loggingTransport(
      new PostMessageTransport(frame.window, frame.window),
      log,
      "host↔view",
      "→",
    );
    update({ phase: "initializing", error: null });
    await next.connect(transport);
    frame.load(html);
  }

  function deliver(kind: "input" | "result", payload: Record<string, unknown> | CallToolResult): void {
    if (state.phase === "torndown" || state.phase === "overflow") return;
    if (state.phase === "ready" && bridge) {
      void (kind === "input"
        ? bridge.sendToolInput({ arguments: payload as Record<string, unknown> })
        : bridge.sendToolResult(payload as never));
      return;
    }
    if ((kind === "input" && pendingInput) || (kind === "result" && pendingResult)) {
      pendingInput = null;
      pendingResult = null;
      update({ phase: "overflow", error: `More than one initial tool ${kind} arrived before the view initialized.` });
      log.event("host↔view", `buffer overflow: second initial ${kind}; launch data discarded`);
      return;
    }
    if (kind === "input") pendingInput = payload as Record<string, unknown>;
    else pendingResult = payload as CallToolResult;
    update(kind === "input" ? { bufferedInput: true } : { bufferedResult: true });
  }

  async function setHostContext(patch: Record<string, unknown>): Promise<void> {
    if (!bridge || state.phase !== "ready") return;
    await bridge.sendHostContextChange(patch as never);
  }

  async function teardown(): Promise<void> {
    const current = bridge;
    if (state.phase === "torndown") return;
    const wasReady = state.phase === "ready";
    update({ phase: "torndown" });
    bridge = null;
    pendingInput = null;
    pendingResult = null;
    if (current) {
      if (wasReady) {
        await Promise.race([
          current.teardownResource({}).catch(() => undefined),
          new Promise((resolve) => setTimeout(resolve, TEARDOWN_TIMEOUT_MS)),
        ]);
      }
      await current.close().catch(() => undefined);
    }
    frame.remove();
    log.event("host↔view", "view torn down");
  }

  return {
    start,
    deliverInput: (args: Record<string, unknown>) => deliver("input", args),
    deliverResult: (result: CallToolResult) => deliver("result", result),
    setHostContext,
    teardown,
    getState: () => state,
  };
}

export type HostController = ReturnType<typeof createHostController>;
