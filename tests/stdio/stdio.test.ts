// MCP-02: the built stdio entry runs as a real subprocess from an unrelated cwd, writes only
// protocol messages to stdout and returns the same results as the in-memory server.
// Requires `npm run build` first (dist/server/stdio.js and the generated view module).
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { describe, expect, it } from "vitest";

const ENTRY = fileURLToPath(new URL("../../dist/server/stdio.js", import.meta.url));

describe("MCP-02 stdio subprocess", () => {
  it("has a built entry to test", () => {
    expect(existsSync(ENTRY), `missing ${ENTRY}; run npm run build`).toBe(true);
  });

  it("serves tools and the resource from an unrelated working directory", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "approval-desk-stdio-"));
    const transport = new StdioClientTransport({ command: process.execPath, args: [ENTRY], cwd, stderr: "pipe" });
    const client = new Client({ name: "stdio-test", version: "0.0.0" }, { capabilities: {} });
    await client.connect(transport);
    try {
      const { tools } = await client.listTools();
      expect(tools).toHaveLength(5);
      const list = await client.callTool({ name: "list_approvals", arguments: { requesterId: "R02" } });
      const rows = (list.structuredContent as { rows: Array<{ id: string }> }).rows.map((r) => r.id);
      expect(rows).toEqual(["REQ-102", "REQ-104", "REQ-108"]);
      const read = await client.readResource({ uri: "ui://approval-desk/queue.html" });
      const content = read.contents[0] as { mimeType?: string; text?: string };
      expect(content.mimeType).toBe("text/html;profile=mcp-app");
      expect(content.text).toMatch(/^<!doctype html>/i);
    } finally {
      await client.close();
    }
  });

  it("writes only newline-delimited JSON-RPC to stdout", async () => {
    const cwd = mkdtempSync(join(tmpdir(), "approval-desk-stdout-"));
    const child = spawn(process.execPath, [ENTRY], { cwd, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    const init = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "raw", version: "0" } },
    };
    child.stdin.write(JSON.stringify(init) + "\n");
    await new Promise<void>((done, fail) => {
      const timer = setTimeout(() => fail(new Error("no initialize response")), 10000);
      child.stdout.on("data", () => {
        if (stdout.includes("\n")) {
          clearTimeout(timer);
          done();
        }
      });
    });
    child.kill();
    const lines = stdout.split("\n").filter((l) => l.length > 0);
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) expect(JSON.parse(line)).toMatchObject({ jsonrpc: "2.0" });
    expect(stdout).not.toMatch(/Content-Length:/i);
  });
});
