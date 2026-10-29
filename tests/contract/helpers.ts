// Real-handler test session: SDK Client <-> SDK in-memory pair <-> createServer.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { createSession } from "../../server/runtime.ts";

export const START = new Date("2026-10-20T12:00:00.000Z");

/** Mutable fake clock for expiry assertions only; never used for timing measurements. */
export function fakeClock(start = START) {
  let now = start.getTime();
  return {
    clock: () => new Date(now),
    set: (ms: number) => {
      now = ms;
    },
    advance: (ms: number) => {
      now += ms;
    },
    nowMs: () => now,
  };
}

/** Deterministic but distinct byte sequences, so every nonce in a test differs. */
export function counterRandom() {
  let counter = 0;
  return (length: number) => {
    counter += 1;
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) bytes[i] = (counter * 31 + i * 7) & 0xff;
    bytes[0] = counter & 0xff;
    bytes[1] = (counter >> 8) & 0xff;
    return bytes;
  };
}

export const STUB_VIEW_HTML = "<!doctype html><html><head><title>stub</title></head><body>contract-test stub</body></html>";

export async function connectSession(options: { capacity?: number; viewHtml?: string } = {}) {
  const time = fakeClock();
  const { repo, server } = createSession({
    viewHtml: options.viewHtml ?? STUB_VIEW_HTML,
    clock: time.clock,
    random: counterRandom(),
    repo: options.capacity === undefined ? undefined : { capacity: options.capacity },
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "approval-desk-contract-tests", version: "0.0.0" },
    { capabilities: {} },
  );
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  /** Calls a tool; SDK-level rejections are returned as { protocolError } instead of thrown. */
  async function call(name: string, args: Record<string, unknown>): Promise<CallToolResult & { protocolError?: string }> {
    try {
      return (await client.callTool({ name, arguments: args })) as CallToolResult;
    } catch (error) {
      return { content: [], isError: true, protocolError: error instanceof Error ? error.message : String(error) };
    }
  }

  async function close() {
    await client.close();
    await server.close();
  }

  return { client, server, repo, time, call, close };
}

export function structured<T = Record<string, unknown>>(result: CallToolResult): T {
  return result.structuredContent as T;
}

export function text(result: CallToolResult): string {
  return result.content
    .filter((c): c is { type: "text"; text: string } => c.type === "text")
    .map((c) => c.text)
    .join("\n");
}

export function errorCode(result: CallToolResult): string | undefined {
  const s = result.structuredContent as { kind?: string; code?: string } | undefined;
  return s?.kind === "error" ? s.code : undefined;
}
