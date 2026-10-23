import { pathToFileURL } from "node:url";
import { seedItems } from "../src/domain/seed.ts";
import { ApprovalStore } from "../src/domain/store.ts";
import { FrameDecoder, encodeFrame } from "../src/mcp/framing.ts";
import { createSession, handleRpc } from "../src/mcp/server.ts";

export function startStdioServer(): void {
  const actorId = process.env.CONFIRM_ACTOR_ID ?? null;
  const store = new ApprovalStore(seedItems(), () => crypto.randomUUID());
  const session = createSession(actorId, "model");
  const decoder = new FrameDecoder();
  process.stdin.on("data", (chunk: Uint8Array) => {
    let messages: unknown[];
    try {
      messages = decoder.push(chunk);
    } catch {
      process.stdout.write(
        encodeFrame({
          jsonrpc: "2.0",
          id: null,
          error: { code: -32700, message: "Parse error." },
        }),
      );
      return;
    }
    for (const message of messages) {
      const response = handleRpc(store, session, message, new Date().toISOString());
      if (response) {
        process.stdout.write(encodeFrame(response));
      }
    }
  });
}

const entry = process.argv[1];
if (entry && import.meta.url === pathToFileURL(entry).href) {
  startStdioServer();
}
