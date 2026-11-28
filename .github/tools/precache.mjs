// Writes the offline precache list into sw.js: every file the site serves, with each page as
// its folder URL ("tango/" rather than "tango/index.html") since that's what visitors open.
// Usage (repo root): node .github/tools/precache.mjs [--check]
//   --check exits 1 instead of writing when sw.js is out of date (used by CI).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SKIP = /^\.|^\.github\/|\.md$|^LICENSE|OFL\.txt$|^icons\/og\.png$|^sw\.js$/;

export function precacheList() {
  return execFileSync("git", ["ls-files"], { encoding: "utf8" })
    .split("\n").filter((f) => f && !SKIP.test(f) && fs.existsSync(f))
    .map((f) => (f === "index.html" ? "./" : f.replace(/\/index\.html$/, "/")))
    .sort();
}

export function render(text, list) {
  const a = text.indexOf("// precache:start"), b = text.indexOf("  // precache:end");
  if (a < 0 || b < 0) throw new Error("sw.js is missing the precache markers");
  const eol = text.includes("\r\n") ? "\r\n" : "\n", start = text.indexOf("\n", a) + 1;
  return text.slice(0, start) + list.map((f) => "  " + JSON.stringify(f) + "," + eol).join("") + text.slice(b);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const text = fs.readFileSync("sw.js", "utf8"), next = render(text, precacheList());
  if (process.argv.includes("--check")) {
    if (next !== text) { console.error("sw.js precache list is out of date: run node .github/tools/precache.mjs"); process.exit(1); }
    console.log("sw.js precache list is up to date.");
  } else if (next !== text) {
    fs.writeFileSync("sw.js", next);
    console.log("sw.js updated.");
  } else console.log("sw.js already up to date.");
}
