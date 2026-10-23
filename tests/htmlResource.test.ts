import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { HOST_SIMULATIONS } from "../src/harness/fixtures.ts";
import { RESOURCE_CSP } from "../src/domain/securityPolicy.ts";
import { buildAppHtml, withHostOrigin } from "../src/mcp/htmlResource.ts";

describe("MCP app document", () => {
  it("ships a deny-all connection policy and stays idle without a host origin", () => {
    const html = buildAppHtml();
    assert.equal(html.includes(RESOURCE_CSP), true);
    assert.equal(html.includes('<meta name="mcp-host-origin" content="" />'), true);
    assert.equal(html.includes("ui/initialize"), true);
    assert.equal(html.includes("ui/notifications/initialized"), true);
    assert.equal(html.includes("tools/call"), true);
    assert.equal(html.includes("request_decision"), true);
    assert.equal(html.includes("commit_decision"), true);
    assert.equal(html.includes("http://"), false);
    assert.equal(html.includes("https://"), false);
    assert.equal(html.includes("allow-top-navigation"), false);
    assert.equal(html.includes("allow-same-origin"), false);
  });

  it("rewrites only a bare http or https origin", () => {
    const html = buildAppHtml();
    const rewritten = withHostOrigin(html, "https://host.confirm-queue.invalid");
    assert.equal(rewritten.includes('content="https://host.confirm-queue.invalid"'), true);
    assert.throws(() => withHostOrigin(html, "https://host.confirm-queue.invalid/app"), /origin/);
    assert.throws(() => withHostOrigin(html, "javascript:alert(1)"), /origin/);
    assert.throws(() => withHostOrigin(html, 'https://host.example/"'), /origin/);
  });

  it("matches the JSON host simulations", () => {
    const file = JSON.parse(readFileSync(new URL("../fixtures/host-simulations.json", import.meta.url), "utf8")) as unknown;
    assert.deepEqual(file, HOST_SIMULATIONS);
  });
});
