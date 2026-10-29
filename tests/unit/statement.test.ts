import { describe, expect, it } from "vitest";
import { seedRequests } from "../../server/domain/dataset.ts";
import { DomainError } from "../../server/domain/errors.ts";
import { buildStatement, normalizeReason } from "../../server/domain/statement.ts";

describe("canonical statement and reason normalization", () => {
  const req104 = seedRequests().find((r) => r.id === "REQ-104")!;

  it("produces the exact planned statement bytes", () => {
    expect(buildStatement(req104, "approve", "Sandbox renewal approved")).toBe(
      'Approve REQ-104 | title="Renew sandbox editor" | USD 1240.00 | version=3 | reason="Sandbox renewal approved"',
    );
    expect(buildStatement(req104, "reject", "No")).toMatch(/^Reject REQ-104 \| /);
  });

  it("normalizes NFC and trims once", () => {
    expect(normalizeReason("  Cafe\u0301 ok  ")).toBe("Café ok");
  });

  it.each([
    ["empty", "   "],
    ["newline", "line one\nline two"],
    ["bidi override", "ok \u202E reversed"],
    ["zero width", "zero\u200Bwidth"],
    ["too long", "x".repeat(241)],
  ])("rejects %s reasons with invalid_input", (_label, value) => {
    let caught: unknown;
    try {
      normalizeReason(value);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(DomainError);
    expect((caught as DomainError).code).toBe("invalid_input");
  });

  it("accepts 240 code points including non-ASCII", () => {
    expect(Array.from(normalizeReason("é".repeat(240)))).toHaveLength(240);
  });

  it("quotes reasons so embedded quotes cannot fake a field", () => {
    const s = buildStatement(req104, "approve", 'ok" | version=99 | reason="x');
    expect(s.endsWith('reason="ok\\" | version=99 | reason=\\"x"')).toBe(true);
    expect(s).toContain("| version=3 |");
  });
});
