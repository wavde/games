// Browser checks for every page linked from the hub:
//  - loads with no page errors and auto-opens its manpage
//  - axe-core finds no WCAG 2.x A/AA or best-practice violations, fresh and with the manpage open
// Usage (repo root): node .github/checks/browser.mjs   (CHROME_PATH overrides the Chrome binary)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const ROOT = process.cwd();
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml" };

const server = http.createServer((req, res) => {
  let file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    res.end(data);
  });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = "http://127.0.0.1:" + server.address().port;

const chromeCandidates = [
  process.env.CHROME_PATH,
  "/usr/bin/google-chrome",
  "/usr/bin/chromium-browser",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = chromeCandidates.find((p) => fs.existsSync(p));
if (!executablePath) { console.error("No Chrome found; set CHROME_PATH."); process.exit(2); }

const browser = await puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox"] });
const failures = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function axe(page, label) {
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
    const r = await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] } });
    return r.violations.map((v) => v.id + " ×" + v.nodes.length + " (" + v.nodes[0].target.join(" ") + ")");
  });
  for (const v of violations) failures.push(label + ": axe " + v);
}

const hub = await browser.newPage();
await hub.goto(BASE + "/", { waitUntil: "load" });
const games = await hub.evaluate(() => [...document.querySelectorAll("a.card")].map((a) => a.getAttribute("href")));
await axe(hub, "hub");
await hub.close();

for (const g of games) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  page.on("pageerror", (e) => failures.push(g + ": page error " + e.message));
  await page.setViewport({ width: 420, height: 900 });
  await page.goto(BASE + "/" + g, { waitUntil: "load" });
  await sleep(500);
  if (!(await page.evaluate(() => !!document.querySelector(".man-backdrop")))) failures.push(g + ": manpage did not auto-open");
  await axe(page, g + " (manpage open)");
  await page.keyboard.press("Escape");
  await sleep(300);
  await axe(page, g);
  await ctx.close();
  console.log("checked " + g);
}

await browser.close();
server.close();
if (failures.length) {
  console.error("\n" + failures.length + " failure(s):\n" + failures.join("\n"));
  process.exit(1);
}
console.log("\nAll " + (games.length + 1) + " pages passed.");
