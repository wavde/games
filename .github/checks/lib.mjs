// Shared plumbing for the browser checks: a static server for the repo that can append test
// hooks to any game.js (so the site itself ships no test code), and a headless Chrome.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const puppeteer = require("puppeteer-core");
export const ROOT = process.cwd();

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };

// hookFor(game) returns code to insert just before the game's closing `})();`, or "".
export async function startServer(hookFor = () => "") {
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); res.end(); return; }
      const m = /^\/([\w-]+)\/game\.js$/.exec(rel), hook = m ? hookFor(m[1]) : "";
      if (hook) {
        const text = data.toString("utf8"), end = text.lastIndexOf("})();");
        data = text.slice(0, end) + "\n" + hook + "\n" + text.slice(end);
      }
      res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
      res.end(data);
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { server, base: "http://127.0.0.1:" + server.address().port };
}

export async function launchBrowser(extraArgs = []) {
  const executablePath = [
    process.env.CHROME_PATH,
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean).find((p) => fs.existsSync(p));
  if (!executablePath) { console.error("No Chrome found; set CHROME_PATH."); process.exit(2); }
  return puppeteer.launch({ executablePath, headless: true, args: ["--no-sandbox", ...extraArgs] });
}
