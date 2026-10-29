import { stripTypeScriptTypes } from "node:module";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
const [out, ...files] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
for (const f of files) {
  try {
    const js = stripTypeScriptTypes(readFileSync(f, "utf8"));
    const p = out + "/" + f.split("/").join("_") + ".mjs";
    writeFileSync(p, js);
    execFileSync(process.execPath, ["--check", p], { stdio: "pipe" });
  } catch (e) {
    console.log("FAIL", f, String(e.stderr || e.message).slice(0, 400));
  }
}
console.log("checked", files.length);
