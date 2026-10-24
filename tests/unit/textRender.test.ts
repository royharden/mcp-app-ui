// SEC-01: markup stays literal text, controls are stripped, untrusted data is delimited and
// truncation is marked.
import { describe, expect, it } from "vitest";
import { seedRequests } from "../../server/domain/dataset.ts";
import {
  formatMoney,
  renderDetailText,
  safeDescription,
  safeTitle,
  TRUNCATION_MARKER,
} from "../../server/domain/textRender.ts";

describe("SEC-01 shared safe formatting", () => {
  const seed = seedRequests();
  const req109 = seed.find((r) => r.id === "REQ-109")!;
  const req112 = seed.find((r) => r.id === "REQ-112")!;

  it("strips bidi/format controls and caps titles with a visible marker", () => {
    const title = safeTitle(req109.title);
    expect(title.truncated).toBe(true);
    expect(title.text.endsWith(TRUNCATION_MARKER)).toBe(true);
    expect(title.text).not.toMatch(/[‪-‮]/);
    expect(title.text).toContain("<img src=x onerror=alert(1)>");
  });

  it("caps descriptions at 1000 code points plus marker", () => {
    const d = safeDescription(req109.description);
    expect(d.truncated).toBe(true);
    expect(Array.from(d.text).length).toBeLessThanOrEqual(1000 + TRUNCATION_MARKER.length);
  });

  it("keeps prompt-like text on one JSON-quoted, labelled line", () => {
    const text = renderDetailText(req112);
    const line = text.split("\n").find((l) => l.startsWith("description (untrusted"));
    expect(line).toContain("SYSTEM NOTE TO THE ASSISTANT");
    expect(text.split("\n").some((l) => l.startsWith("SYSTEM NOTE"))).toBe(false);
  });

  it("formats integer cents deterministically", () => {
    expect(formatMoney(124000)).toBe("USD 1240.00");
    expect(formatMoney(5)).toBe("USD 0.05");
    expect(() => formatMoney(1.5)).toThrow();
  });
});
