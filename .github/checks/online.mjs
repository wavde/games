// Online two-player checks: two pages connect through the real invite / reply-code flow
// (WebRTC on this machine), play a game to the end by clicking, and after every move both
// boards must match. Then new game syncs, and closing one page drops the other to local play.
// Usage (repo root): node .github/checks/online.mjs [game ...]
import { startServer, launchBrowser } from "./lib.mjs";

// Per game: a hook exposing the board as a string, and the clicks of a short decisive game
// (alternating host, guest; a move may be a list of clicks, or { host: clicks } / { guest: clicks } to
// name who plays it, for games with extra turns), plus the text both pages should show at the end.
// `moves` may instead be a function run in the host page that returns the next move for whoever
// is to play, or null once the game is over.
const GAMES = {
  checkers: {
    state: "JSON.stringify({ board, current, over })",
    // A move is the squares tapped in turn: the piece, then each landing square (multi-jumps included).
    moves: [[46, 37], [19, 28], [37, 19], [12, 26], [42, 33], [5, 12], [33, 19, 5], [23, 30], [5, 23, 37], [3, 12], [44, 35],
      [17, 26], [35, 17, 3], [7, 14], [40, 33], [21, 30], [37, 23, 5, 19], [1, 10], [3, 17], [8, 26, 40], [19, 10]]
      .map((path) => path.map((i) => '.ck-cell[data-i="' + i + '"]')),
    end: /win/i,
  },
  reversi: {
    state: "JSON.stringify({ board, current, over })",
    moves: [19, 18, 17, 11, 4, 43, 51, 20, 29].map((i) => '.rv-cell[data-i="' + i + '"]'),
    end: /win/i,
  },
  gomoku: {
    state: "JSON.stringify({ board, current, over })",
    moves: [105, 0, 106, 1, 107, 2, 108, 3, 109].map((i) => '.gm-cell[data-i="' + i + '"]'),
    end: /win/i,
  },
  hex: {
    state: "JSON.stringify({ n, b: Array.from(b), turn, over })",
    moves: [0, 8, 9, 17, 18, 26, 27, 35, 36, 44, 45, 53, 54, 62, 63, 71, 72].map((i) => '.hx-cell[data-i="' + i + '"]'),
    end: /win/i,
  },
  "connect-four": {
    state: "JSON.stringify({ grid: grid.map((r) => Array.from(r)), current, gameOver })",
    moves: [0, 1, 0, 1, 0, 1, 0].map((c) => '.c4-col-btn[data-col="' + c + '"]'),
    end: /win/i,
  },
  // A turn can be several messages: White closes a mill at 20, then takes Black's piece on 3.
  // { host } / { guest } names who clicks. After placing, White is blocked and Black wins.
  morris: {
    state: "JSON.stringify({ b: Array.from(S.b), hand: S.hand, turn: S.turn, over, pending: pending && [pending[0].from, pending[0].to] })",
    moves: [["host", 18], ["guest", 3], ["host", 9], ["guest", 0], ["host", 19], ["guest", 17], ["host", 11], ["guest", 15], ["host", 20],
      ["host", 3], ["guest", 13], ["host", 2], ["guest", 3], ["host", 1], ["guest", 21], ["host", 8], ["guest", 10], ["host", 12], ["guest", 6]]
      .map(([who, i]) => ({ [who]: '.mm-pt[data-i="' + i + '"]' })),
    end: /win/i,
  },
  // Closing a box moves again, so the page picks the next move: the first undrawn line, by whoever is to move.
  "dots-and-boxes": {
    state: "JSON.stringify({ N, drawn: Array.from(drawn), owner: Array.from(owner), current, scores, over })",
    moves: () => {
      const s = JSON.parse(window.__net.state());
      return s.over ? null : { [s.current === 1 ? "host" : "guest"]: '.db-line[data-x="' + s.drawn.indexOf(0) + '"]' };
    },
    end: /draw 8–8/i, // both sides play the same way: an even split
  },
  // Landing in your store moves again: the mover sows the non-empty pit nearest their store.
  mancala: {
    state: "JSON.stringify({ board, current, over })",
    moves: () => {
      const s = JSON.parse(window.__net.state());
      if (s.over) return null;
      for (let k = 5; k >= 0; k--) if (s.board[s.current * 7 + k]) return { [s.current ? "guest" : "host"]: '.mc-pit[data-i="' + (s.current * 7 + k) + '"]' };
      return null;
    },
    end: /draw 24–24/i,
  },
  "tic-tac-toe": {
    state: "JSON.stringify({ board, turn, gameOver })",
    moves: [0, 3, 1, 4, 2].map((i) => '.cell[data-i="' + i + '"]'),
    end: /win/i,
  },
  chess: {
    state: "JSON.stringify({ board: state.board, turn: state.turn, over })",
    // Fool's mate: 1. f3 e5 2. g4 Qh4# — each move taps the piece, then its destination.
    moves: [["f2, white pawn", "f3"], ["e7, black pawn", "e5"], ["g2, white pawn", "g4"], ["d8, black queen", "h4"]]
      .map((m) => m.map((label) => '#board [aria-label="' + label + '"]')),
    end: /checkmate.*win/i,
  },
};

const only = process.argv.slice(2);
const { server, base } = await startServer((game) => (GAMES[game] ? "window.__net = { state: () => " + GAMES[game].state + " };" : ""));
// Real host addresses (not mDNS names) so the two pages can reach each other in CI.
const browser = await launchBrowser(["--disable-features=WebRtcHideLocalIpsWithMdns"]);
const failures = [];

let step = "";
const until = (page, fn, arg, timeout = 15000) => page.waitForFunction(fn, { timeout }, arg).catch((e) => { throw new Error(step + ": " + e.message); });

for (const [game, cfg] of Object.entries(GAMES)) {
  if (only.length && !only.includes(game)) continue;
  const t0 = Date.now(), ctxA = await browser.createBrowserContext(), ctxB = await browser.createBrowserContext();
  const host = await ctxA.newPage(), guest = await ctxB.newPage(), errors = [];
  for (const [p, who] of [[host, "host"], [guest, "guest"]]) {
    p.on("pageerror", (e) => errors.push(who + ": " + e.message));
    await p.evaluateOnNewDocument((g) => localStorage.setItem("man:seen:" + g, "1"), game);
  }
  try {
    await host.goto(base + "/" + game + "/", { waitUntil: "load" });
    step = "invite";
    await host.select("#mode", "online");
    await until(host, () => document.querySelector(".net input[readonly]")?.value.includes("#join="));
    const invite = await host.$eval(".net input[readonly]", (i) => i.value);

    step = "reply";
    await guest.goto(invite, { waitUntil: "load" });
    await until(guest, () => document.querySelector(".net input[readonly]")?.value.length > 20);
    if ((await guest.$eval("#mode", (s) => s.value)) !== "online") throw new Error("guest didn't switch to online");
    const reply = await guest.$eval(".net input[readonly]", (i) => i.value);

    step = "connect";
    await host.type("#net-reply", reply);
    await host.click(".net .btn.primary");
    for (const p of [host, guest]) await until(p, () => /Connected/.test(document.querySelector(".net").textContent));

    const same = async (k) => {
      for (let t = 0; t < 100; t++) {
        const [a, b] = await Promise.all([host, guest].map((p) => p.evaluate(() => window.__net.state())));
        if (a === b) return;
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("boards differ after move " + k);
    };
    const generated = typeof cfg.moves === "function";
    const norm = (m, k) => (m.host !== undefined ? [host, m.host] : m.guest !== undefined ? [guest, m.guest] : [k % 2 ? guest : host, m]);
    // The guest can't move first.
    const before = await guest.evaluate(() => window.__net.state());
    for (const sel of [].concat(norm(generated ? await host.evaluate(cfg.moves) : cfg.moves[1], 1)[1])) await guest.click(sel);
    if ((await guest.evaluate(() => window.__net.state())) !== before) throw new Error("guest moved out of turn");

    let k = 0;
    for (let tries = 0; ; tries++) {
      const move = generated ? await host.evaluate(cfg.moves) : cfg.moves[k];
      if (!move) break;
      if (tries > 3000) throw new Error("game didn't end");
      const [p, clicks] = norm(move, k), was = await p.evaluate(() => window.__net.state());
      for (const sel of [].concat(clicks)) await p.click(sel);
      await same(k + 1);
      // A generated move the page ignored (busy animating) is asked for again.
      if (generated && (await p.evaluate(() => window.__net.state())) === was) { await new Promise((r) => setTimeout(r, 100)); continue; }
      k++;
    }
    step = "result";
    for (const p of [host, guest]) await until(p, (re) => new RegExp(re, "i").test(document.getElementById("status").textContent), cfg.end.source, 5000);

    await guest.click("#reset-btn, #new-btn");
    await same("new game");
    for (const p of [host, guest]) if (cfg.end.test(await p.$eval("#status", (s) => s.textContent))) throw new Error("new game didn't reset");

    step = "leave";
    await guest.close();
    await until(host, () => document.getElementById("mode").value === "local", undefined, 15000);
    console.log("ok   " + game + " — connected, " + k + " moves in sync, new game, leave (" + ((Date.now() - t0) / 1000).toFixed(1) + " s)");
  } catch (e) {
    failures.push(game + ": " + e.message.split("\n")[0]);
    console.log("FAIL " + game);
  }
  for (const e of errors) failures.push(game + " page error " + e);
  await ctxA.close();
  await ctxB.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error("\n" + failures.length + " failure(s):\n" + failures.join("\n"));
  process.exit(1);
}
