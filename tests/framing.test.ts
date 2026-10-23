import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { FrameDecoder, encodeFrame } from "../src/mcp/framing.ts";

describe("stdio frames", () => {
  it("decodes a frame that arrives in pieces and then a pair", () => {
    const first = encodeFrame({ jsonrpc: "2.0", id: 1, method: "ping" });
    const decoder = new FrameDecoder();
    assert.deepEqual(decoder.push(first.slice(0, 5)), []);
    assert.deepEqual(decoder.push(first.slice(5)), [{ jsonrpc: "2.0", id: 1, method: "ping" }]);
    const second = encodeFrame({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    const third = encodeFrame({ jsonrpc: "2.0", id: 3, method: "resources/list" });
    const both = new Uint8Array(second.length + third.length);
    both.set(second, 0);
    both.set(third, second.length);
    assert.deepEqual(decoder.push(both), [
      { jsonrpc: "2.0", id: 2, method: "tools/list" },
      { jsonrpc: "2.0", id: 3, method: "resources/list" },
    ]);
  });

  it("rejects a header without Content-Length", () => {
    const decoder = new FrameDecoder();
    const bytes = new TextEncoder().encode("\r\n\r\n{}");
    assert.throws(() => decoder.push(bytes), /Content-Length/);
  });

  it("rejects an oversized content length", () => {
    const decoder = new FrameDecoder();
    const bytes = new TextEncoder().encode("Content-Length: 1000001\r\n\r\n");
    assert.throws(() => decoder.push(bytes), /too large/);
  });
});
