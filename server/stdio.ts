// Local stdio entry: node <absolute-repo>/dist/server/stdio.js
// The SDK transport writes newline-delimited JSON-RPC to stdout; everything else goes to stderr.
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./createServer.ts";
import { systemClock, webRandom } from "./domain/crypto.ts";
import { VIEW_HTML } from "./generated/view-html.ts";
import { createMemoryRepo } from "./repo/memoryRepo.ts";

async function main(): Promise<void> {
  const server = createServer({ repo: createMemoryRepo(), clock: systemClock, random: webRandom, viewHtml: VIEW_HTML });
  const transport = new StdioServerTransport();
  await server.connect(transport);
  process.stderr.write("approval-desk: stdio server ready (synthetic data, in-memory, resets on restart)\n");
}

main().catch((error: unknown) => {
  process.stderr.write(`approval-desk: failed to start: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
