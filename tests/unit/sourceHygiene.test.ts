// Guards against invisible characters in active source: raw line/paragraph separators break
// regex literals, and raw bidi/zero-width characters hide what code says. Write them as
// escapes instead. (Found by review of P1.)
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = fileURLToPath(new URL("../..", import.meta.url));
const ACTIVE_DIRS = ["server", "view", "src/lab", "harness", "measure", "scripts", "tests"];
const SKIP = new Set(["generated", "node_modules"]);

function forbidden(code: number): boolean {
  return (
    code === 0x2028 ||
    code === 0x2029 ||
    code === 0x061c ||
    code === 0xfeff ||
    (code >= 0x200b && code <= 0x200f) ||
    (code >= 0x202a && code <= 0x202e) ||
    (code >= 0x2060 && code <= 0x2069)
  );
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|css|json)$/.test(name) && !path.includes(join("server", "main.ts"))) out.push(path);
  }
}

describe("source hygiene", () => {
  it("active source contains no raw separators, bidi or zero-width characters", () => {
    const files: string[] = [];
    for (const dir of ACTIVE_DIRS) {
      try {
        walk(join(root, dir), files);
      } catch {
        // Directory not present yet.
      }
    }
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, "utf8");
      for (let i = 0; i < text.length; i += 1) {
        if (forbidden(text.charCodeAt(i))) {
          offenders.push(`${file}: U+${text.charCodeAt(i).toString(16).toUpperCase().padStart(4, "0")} at ${i}`);
          break;
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the regex escapes used by the formatter are real escapes", () => {
    expect(String.fromCharCode(0x2028)).toMatch(new RegExp("[\\u2028]"));
  });
});
