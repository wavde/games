// Offline check: sw.js lists every site file, and with the server gone, every page still loads
// from the service worker's cache with no errors (games still generate and render boards).
// Usage (repo root): node .github/checks/offline.mjs
import { startServer, launchBrowser } from "./lib.mjs";
import { precacheList, render } from "../tools/precache.mjs";
import fs from "node:fs";

const failures = [];
const text = fs.readFileSync("sw.js", "utf8");
if (render(text, precacheList()) !== text) failures.push("sw.js precache list is out of date: run node .github/tools/precache.mjs");

// Service workers need a secure origin; localhost counts (the 127.0.0.1 used elsewhere skips it).
const { server, base } = await startServer();
const origin = base.replace("127.0.0.1", "localhost");
const browser = await launchBrowser();
const page = await browser.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
await page.goto(origin + "/", { waitUntil: "load" });
await page.evaluate(() => navigator.serviceWorker.ready);
const cached = await page.evaluate(async () => (await (await caches.open("games")).keys()).length);
const pages = await page.evaluate(() => [...document.querySelectorAll("a.card")].map((a) => a.getAttribute("href")));
if (cached < precacheList().length) failures.push("only " + cached + " of " + precacheList().length + " files cached");

server.closeAllConnections();
await new Promise((r) => server.close(r));

for (const href of ["", ...pages]) {
  errors.length = 0;
  try {
    await page.goto(origin + "/" + href, { waitUntil: "load" });
    await page.waitForFunction(() => !document.querySelector('[aria-busy="true"]'), { timeout: 20000 });
    const ok = await page.evaluate((hub) => (hub ? document.querySelectorAll("a.card").length > 0 :
      document.querySelector(".panel").offsetHeight > 100 && performance.getEntriesByType("resource").some((e) => e.name.endsWith("/game.js"))), !href);
    if (!ok) failures.push((href || "hub") + ": nothing rendered offline");
  } catch (e) {
    failures.push((href || "hub") + ": " + e.message.split("\n")[0]);
  }
  for (const e of errors) failures.push((href || "hub") + ": page error " + e);
}

await browser.close();
if (failures.length) {
  console.error(failures.length + " failure(s):\n" + failures.join("\n"));
  process.exit(1);
}
console.log("Offline: " + cached + " files cached; hub and " + pages.length + " games load with the server down.");
