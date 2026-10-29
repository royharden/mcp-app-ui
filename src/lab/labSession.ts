// One Lab session: a fresh in-memory repo and the real createServer, reached only through an
// official SDK Client over the SDK in-memory transport pair. No REST desk, no direct-domain
// shortcut. Reset destroys the session and creates a new one.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import { createSession } from "../../server/runtime.ts";
import type { Repo } from "../../server/repo/Repo.ts";
import { loggingTransport, type ProtocolLog } from "./protocolLog.ts";

export const EXPECTED_MIME = "text/html;profile=mcp-app";
const UI_EXTENSION = "io.modelcontextprotocol/ui";

export interface LoadedResource {
  uri: string;
  mimeType: string;
  html: string;
  meta: unknown;
}

export interface LabSession {
  client: Client;
  repo: Repo;
  tools: Tool[];
  launchTool: Tool;
  resource: LoadedResource;
  close(): Promise<void>;
}

export class LabSessionError extends Error {}

export async function startLabSession(viewHtml: string, log: ProtocolLog): Promise<LabSession> {
  const { repo, server } = createSession({ viewHtml });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client(
    { name: "approval-desk-bridge-lab", version: "0.2.0" },
    { capabilities: { extensions: { [UI_EXTENSION]: { mimeTypes: [EXPECTED_MIME] } } } as never },
  );
  await server.connect(serverSide);
  await client.connect(loggingTransport(clientSide, log, "client↔server", "→"));
  const closeBoth = async () => {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  };
  try {
    return await loadSession(client, repo, closeBoth);
  } catch (error) {
    // A partly started session is closed, never leaked.
    await closeBoth();
    throw error;
  }
}

async function loadSession(client: Client, repo: Repo, close: () => Promise<void>): Promise<LabSession> {
  const { tools } = await client.listTools();
  const launchTool = tools.find((t) => typeof (t._meta as { ui?: { resourceUri?: unknown } } | undefined)?.ui?.resourceUri === "string");
  if (!launchTool) throw new LabSessionError("No tool links a UI resource.");
  const uri = (launchTool._meta as { ui: { resourceUri: string } }).ui.resourceUri;
  const read = await client.readResource({ uri });
  if (read.contents.length !== 1) throw new LabSessionError(`Expected one resource content, got ${read.contents.length}.`);
  const content = read.contents[0] as { uri: string; mimeType?: string; text?: unknown; _meta?: unknown };
  if (content.mimeType !== EXPECTED_MIME) throw new LabSessionError(`Unexpected MIME type ${String(content.mimeType)}.`);
  if (typeof content.text !== "string" || content.text.length === 0) throw new LabSessionError("The resource has no HTML text.");

  return {
    client,
    repo,
    tools,
    launchTool,
    resource: { uri, mimeType: content.mimeType, html: content.text, meta: content._meta },
    close,
  };
}
