/* ============================================================
   net.js — online two-player for the versus games, with no server.
   Two browsers connect directly over WebRTC. The host makes an invite link holding its
   connection offer; the friend opens it and sends back a reply code; the host pastes that
   in. After that, moves travel over a data channel. Exposes `window.Net`.

   const link = Net.attach({
     container,          element the online panel is appended to (hidden until used)
     onJoin(),           the page was opened from an invite link: switch the game to online
     onOpen(role),       connected; role is "host" (moves first) or "guest"
     onMessage(msg),     a message from the other player (any JSON value)
     onClose(),          the other player left or the connection dropped
   });
   link.host()   start hosting (show the invite)      link.leave()  hang up, hide the panel
   link.send(m)  send a message once connected        link.connected()
   ============================================================ */
(function (global) {
  "use strict";

  const ICE = [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }];

  // Connection descriptions are deflated and base64url-encoded so links stay short.
  const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const unb64 = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
  async function pipe(bytes, stream) {
    return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());
  }
  async function encode(desc) {
    const raw = new TextEncoder().encode(JSON.stringify({ t: desc.type, s: desc.sdp }));
    if (global.CompressionStream) return "z" + b64(await pipe(raw, new CompressionStream("deflate-raw")));
    return "p" + b64(raw);
  }
  async function decode(code) {
    code = code.trim().replace(/^.*#join=/, "");
    let raw = unb64(code.slice(1));
    if (code[0] === "z") raw = await pipe(raw, new DecompressionStream("deflate-raw"));
    else if (code[0] !== "p") throw new Error("bad code");
    const o = JSON.parse(new TextDecoder().decode(raw));
    return { type: o.t, sdp: o.s };
  }

  // Wait for every candidate so one code carries the whole offer (no signalling server).
  function gathered(pc) {
    if (pc.iceGatheringState === "complete") return Promise.resolve();
    return new Promise((done) => {
      const t = setTimeout(done, 5000);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") { clearTimeout(t); done(); }
      });
    });
  }

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  function attach(opts) {
    const panel = el("div", "net");
    panel.hidden = true;
    panel.setAttribute("aria-live", "polite");
    opts.container.appendChild(panel);

    let pc = null, ch = null, role = null, open = false, gen = 0;

    function show(...nodes) { panel.replaceChildren(...nodes); panel.hidden = false; }
    function say(text) { show(el("p", "net-say", text), leaveBtn("Cancel")); }

    function leaveBtn(label) {
      const b = el("button", "btn ghost tool-btn", label);
      b.type = "button";
      b.addEventListener("click", () => { leave(); if (opts.onLeave) opts.onLeave(); });
      return b;
    }

    // A read-only field with Copy (and Share where the browser has it).
    function codeBox(label, value, shareText) {
      const wrap = el("div", "net-code");
      const id = "net-" + Math.random().toString(36).slice(2, 8);
      const lab = el("label", "net-label", label);
      lab.htmlFor = id;
      const input = el("input");
      input.id = id;
      input.readOnly = true;
      input.value = value;
      input.addEventListener("focus", () => input.select());
      const copy = el("button", "btn tool-btn", "copy");
      copy.type = "button";
      copy.addEventListener("click", async () => {
        try { await navigator.clipboard.writeText(value); } catch (e) { input.select(); document.execCommand("copy"); }
        copy.textContent = "copied";
        setTimeout(() => { copy.textContent = "copy"; }, 1500);
      });
      const row = el("div", "net-row");
      row.append(input, copy);
      if (navigator.share && shareText) {
        const share = el("button", "btn tool-btn", "share");
        share.type = "button";
        share.addEventListener("click", () => navigator.share({ title: document.title, text: shareText, url: value.startsWith("http") ? value : undefined }).catch(() => {}));
        row.append(share);
      }
      wrap.append(lab, row);
      return wrap;
    }

    function wire(channel) {
      ch = channel;
      ch.onopen = () => {
        open = true;
        show(el("p", "net-say", "Connected — " + (role === "host" ? "you move first." : "your friend moves first.")), leaveBtn("Leave"));
        opts.onOpen(role);
      };
      ch.onmessage = (e) => {
        let msg;
        try { msg = JSON.parse(e.data); } catch (err) { return; }
        if (msg && msg._ === "bye") dropped();
        else opts.onMessage(msg);
      };
      ch.onclose = () => dropped();
    }

    function dropped() {
      if (!open) return;
      open = false;
      show(el("p", "net-say", "Your friend left. Back to playing on this device."));
      setTimeout(() => { if (!open && !pc) panel.hidden = true; }, 4000);
      cleanup();
      opts.onClose();
    }

    function newPeer() {
      cleanup();
      const mine = ++gen;
      pc = new RTCPeerConnection({ iceServers: ICE });
      let lost = null;
      pc.addEventListener("connectionstatechange", () => {
        if (mine !== gen) return;
        clearTimeout(lost);
        const st = pc.connectionState;
        if (st === "failed") { if (open) dropped(); else say("Couldn't connect. Networks that block direct connections can't play online."); }
        // A dropped peer shows as "disconnected" long before "failed"; give it a few seconds.
        else if (st === "disconnected" && open) lost = setTimeout(() => { if (mine === gen && pc.connectionState !== "connected") dropped(); }, 6000);
      });
      return mine;
    }

    function cleanup() {
      if (ch) { ch.onclose = null; try { ch.close(); } catch (e) { /* already closed */ } }
      if (pc) pc.close();
      ch = pc = null;
    }

    async function host() {
      role = "host";
      const mine = newPeer();
      say("Making an invite…");
      wire(pc.createDataChannel("game"));
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      if (mine !== gen) return;
      const link = location.origin + location.pathname + "#join=" + (await encode(pc.localDescription));
      const reply = el("input");
      reply.id = "net-reply";
      reply.placeholder = "paste the reply code";
      reply.autocomplete = "off";
      reply.spellcheck = false;
      const lab = el("label", "net-label", "2. Paste the reply code your friend sends back");
      lab.htmlFor = "net-reply";
      const go = el("button", "btn primary tool-btn", "connect");
      go.type = "button";
      go.addEventListener("click", async () => {
        try { await pc.setRemoteDescription(await decode(reply.value)); go.disabled = true; go.textContent = "connecting…"; }
        catch (e) { reply.setAttribute("aria-invalid", "true"); go.textContent = "check the code"; }
      });
      const row = el("div", "net-row");
      row.append(reply, go);
      const box = el("div", "net-code");
      box.append(lab, row);
      show(codeBox("1. Send this invite link to a friend", link, "Play me online"), box, leaveBtn("Cancel"));
    }

    async function join(code) {
      role = "guest";
      const mine = newPeer();
      say("Opening the invite…");
      pc.ondatachannel = (e) => wire(e.channel);
      try { await pc.setRemoteDescription(await decode(code)); }
      catch (e) { say("That invite link looks damaged — ask for a new one."); return; }
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc);
      if (mine !== gen) return;
      show(codeBox("Send this reply code back to your friend", await encode(pc.localDescription), "My reply code"),
        el("p", "net-say", "Waiting for your friend to connect…"), leaveBtn("Cancel"));
    }

    // Say goodbye so the other side knows at once (a closed tab otherwise takes a while to notice).
    function bye() { if (open && ch && ch.readyState === "open") try { ch.send(JSON.stringify({ _: "bye" })); } catch (e) { /* closing */ } }
    addEventListener("pagehide", bye);

    function leave() {
      bye();
      open = false;
      gen++;
      cleanup();
      panel.hidden = true;
      panel.replaceChildren();
    }

    const m = /#join=(.+)$/.exec(location.hash);
    if (m && global.RTCPeerConnection) {
      history.replaceState(null, "", location.pathname + location.search);
      setTimeout(() => { if (opts.onJoin) opts.onJoin(); join(m[1]); }, 0);
    }

    return {
      host,
      leave,
      send(msg) { if (open && ch && ch.readyState === "open") ch.send(JSON.stringify(msg)); },
      connected: () => open,
      role: () => role,
    };
  }

  global.Net = { attach, supported: !!global.RTCPeerConnection, encode, decode };
})(window);
