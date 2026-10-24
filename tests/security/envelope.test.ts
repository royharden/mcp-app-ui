// SEC-07 (configuration layer): the host envelope is generated from validated metadata and
// placed before any script; raw and enveloped identities are separate; logs never keep raw
// nonces. Whether a browser enforces the policy is BROWSER-01, a later check.
import { describe, expect, it } from "vitest";
import { buildEnvelope, EnvelopeError, extractInline, validateResourceMeta } from "../../src/lab/csp.ts";
import { createProtocolLog } from "../../src/lab/protocolLog.ts";

const EMPTY_META = { ui: { csp: { connectDomains: [], resourceDomains: [], frameDomains: [] } } };
const HTML =
  '<!doctype html><html><head><meta charset="utf-8"><style>body{color:red}</style></head>' +
  '<body><div id="root"></div><script>var s="\\x3Cscript>";document.body.dataset.ok="1";</script></body></html>';

describe("SEC-07 CSP envelope", () => {
  it("puts a deny-by-default policy first in <head> with exact script and style hashes", async () => {
    const env = await buildEnvelope(HTML, EMPTY_META);
    const head = env.html.slice(env.html.indexOf("<head>") + "<head>".length);
    expect(head.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    for (const directive of [
      "default-src 'none'",
      "connect-src 'none'",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'none'",
      "form-action 'none'",
    ]) {
      expect(env.policy).toContain(directive);
    }
    expect(env.policy).toMatch(/script-src 'sha256-[A-Za-z0-9+/]+={0,2}'/);
    expect(env.policy).not.toContain("unsafe-inline");
    expect(env.policy).not.toContain("unsafe-eval");
    expect(env.rawSha256).not.toBe(env.envelopeSha256);
    expect(env.rawSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("hashes exactly the script and style element text, independently recomputed", async () => {
    const { createHash } = await import("node:crypto");
    const env = await buildEnvelope(HTML, EMPTY_META);
    const { script, style } = extractInline(HTML);
    const digest = (text: string) => `'sha256-${createHash("sha256").update(text, "utf8").digest("base64")}'`;
    expect(env.scriptHash).toBe(digest(script));
    expect(env.styleHash).toBe(digest(style ?? ""));
    expect(script).toBe('var s="\\x3Cscript>";document.body.dataset.ok="1";');
    const metaAt = env.html.indexOf("Content-Security-Policy");
    expect(metaAt).toBeGreaterThan(0);
    expect(metaAt).toBeLessThan(env.html.indexOf("<style>"));
    expect(metaAt).toBeLessThan(env.html.indexOf("<script>"));
  });

  it("refuses script text with CR or NUL instead of guessing the browser's normalization", async () => {
    const html = "<html><head></head><body><script>var a=1;\r\nvar b=2;</script></body></html>";
    await expect(buildEnvelope(html, EMPTY_META)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("ends an element only at a real close tag", () => {
    const html = '<html><head></head><body><script>var t="</scriptx>";</script></body></html>';
    expect(extractInline(html).script).toBe('var t="</scriptx>";');
  });

  it("ignores <script> text inside the script body when counting elements", () => {
    const bundle = '<html><head></head><body><script>var a="<script>"+"<"+"/b>";</script></body></html>';
    expect(extractInline(bundle).script).toBe('var a="<script>"+"<"+"/b>";');
  });

  it.each([
    ["external script", '<html><head></head><body><script src="https://x.test/a.js"></script></body></html>'],
    ["module script", '<html><head></head><body><script type="module">1</script></body></html>'],
    ["two scripts", "<html><head></head><body><script>1</script><script>2</script></body></html>"],
    ["external stylesheet", '<html><head><link rel="stylesheet" href="a.css"></head><body><script>1</script></body></html>'],
  ])("refuses a resource with %s", async (_label, html) => {
    await expect(buildEnvelope(html, EMPTY_META)).rejects.toBeInstanceOf(EnvelopeError);
  });

  it("refuses metadata that asks for external origins instead of widening the policy", () => {
    expect(() => validateResourceMeta({ ui: { csp: { connectDomains: ["https://api.example"] } } })).toThrow(EnvelopeError);
    expect(() => validateResourceMeta({})).toThrow(EnvelopeError);
  });
});

describe("protocol log redaction", () => {
  it("stores nonce aliases, never raw nonces, including inside error text", () => {
    const log = createProtocolLog(() => {});
    const raw = "q9Zr-secret-nonce-value";
    log.message("client↔server", "→", {
      jsonrpc: "2.0",
      id: 7,
      method: "tools/call",
      params: { name: "submit_decision", arguments: { nonce: raw, statement: "s" } },
    });
    log.message("client↔server", "←", { jsonrpc: "2.0", id: 7, error: { code: -1, message: `bad nonce ${raw}` } });
    const text = JSON.stringify(log.entries());
    expect(text).not.toContain(raw);
    expect(text).toContain("nonce#1");
  });
});
