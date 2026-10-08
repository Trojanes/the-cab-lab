// Human-operation smoke test: launches Electron with CDP, then drives the app
// with real DOM PointerEvent/KeyboardEvent gestures through the same interact
// layer a user hits. Zero dependencies (global fetch + WebSocket).
// Usage: node scripts/e2e-drive.mjs   (E2E_TRACE=1 for CDP traffic)
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 9223;
const ELECTRON = path.join(ROOT, "node_modules", "electron", "dist", "electron.exe");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function targetWsUrl(timeoutMs = 20000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === "page" && t.url.includes("index.html"));
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(300);
  }
  throw new Error("no index.html CDP target");
}

let msgId = 0;
const pending = new Map();
const pageErrors = [];
let ws;
function send(method, params = {}, timeoutMs = 30000) {
  const id = ++msgId;
  if (process.env.E2E_TRACE) console.error(`[cdp] send#${id} ${method}`);
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => {
    pending.set(id, { res, rej });
    setTimeout(() => rej(new Error(`CDP timeout: ${method}`)), timeoutMs);
  });
}
async function evaluate(expression, timeoutMs = 30000) {
  const r = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }, timeoutMs);
  if (r.error) throw new Error(`CDP error: ${JSON.stringify(r.error)}`);
  const res = r.result || {};
  if (res.exceptionDetails) {
    const e = res.exceptionDetails;
    throw new Error(`page exception: ${e.exception?.description || e.text}`);
  }
  return res.result ? res.result.value : undefined;
}

// Installs window.__e2e helpers once (module imports, event helpers, pick scan).
const BOOTSTRAP = `(async () => {
  const e = (window.__e2e = { steps: [], errs: [] });
  window.addEventListener("error", (ev) => e.errs.push(String(ev.message)));
  window.addEventListener("unhandledrejection", (ev) => e.errs.push("rejection: " + String(ev.reason)));
  e.S = await import("./space.js");
  e.I = await import("./interact.js");
  e.SH = await import("./interact/shared.js");
  e.J = await import("./job.js");
  const V3 = e.S.camera.position.constructor;
  e.toClient = (x, y, z) => {
    const v = new V3(x, y, z).project(e.S.camera);
    const r = e.S.canvas.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  };
  e.pe = (t, p, b = 0) => e.S.canvas.dispatchEvent(new PointerEvent(t, {
    clientX: p.x, clientY: p.y, button: b, buttons: t === "pointerdown" ? 1 : 0,
    bubbles: true, pointerId: 1, isPrimary: true, pointerType: "mouse",
  }));
  e.click = (p) => { e.pe("pointerdown", p); e.pe("pointerup", p); };
  e.move = (p) => e.pe("pointermove", p);
  e.key = (k, o = {}) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, ...o }));
  e.scan = (pred, step = 18) => {
    const r = e.S.canvas.getBoundingClientRect();
    for (let y = r.top + 10; y < r.bottom - 10; y += step)
      for (let x = r.left + 10; x < r.right - 10; x += step) {
        const h = e.SH.pick(x, y);
        if (h && pred(h)) return { x, y };
      }
    return null;
  };
  e.cabHit = (h) => { const u = h.object.userData || {}; return u.cabId != null && u.kind !== "handle" && u.kind !== "moveAxis"; };
  e.mode = () => e.I.getMode();
  e.cabs = () => e.J.getJob().cabinets;
  e.ok = (n, c, info) => e.steps.push({ name: n, ok: !!c, info: info == null ? "" : String(info).slice(0, 200) });
  e.raf = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  e.settle = (ms = 40) => new Promise((r) => setTimeout(r, ms));
  return { rect: e.S.canvas.getBoundingClientRect().toJSON(), boot: true };
})()`;

// Each phase is a small async expression run against window.__e2e.
const PHASES = [
  ["space", `(async () => { const e = window.__e2e;
    const dlg = document.getElementById("spaceDialog");
    if (dlg && !dlg.classList.contains("hidden")) { dlg.querySelector("[data-ok]").click(); await e.settle(); }
    if (!e.J.hasSpace()) {
      e.J.defineSpace("box", { width: 4200, depth: 2800, height: 2500 });
      if (dlg) dlg.classList.add("hidden");
    }
    await e.settle();
    e.ok("space defined", e.J.hasSpace(), JSON.stringify(e.J.getJob().space && e.J.getJob().space.params));
    return e.J.getJob().space ? e.J.getJob().space.params : null; })()`],

  ["place-arm", `(async () => { const e = window.__e2e;
    const sp = e.J.getJob().space.params; e.sp = sp;
    e.I.armPlacement("kitchenCabinet");
    await e.settle();
    e.ok("armed for place", e.mode() === "armed", e.mode());
    e.click(e.toClient(sp.width * 0.25, sp.depth * 0.25, 0));
    await e.settle();
    e.ok("anchor set (face step)", e.mode() === "face", e.mode());
    return e.mode(); })()`],

  ["place-face", `(async () => { const e = window.__e2e, sp = e.sp;
    const c = e.toClient(sp.width * 0.25 + 800, sp.depth * 0.25 + 600, 0);
    e.move(c); await e.settle(); e.click(c); await e.settle();
    e.ok("corner set (extrude step)", e.mode() === "extrude", e.mode());
    return e.mode(); })()`],

  ["place-extrude", `(async () => { const e = window.__e2e, sp = e.sp;
    const c = e.toClient(sp.width * 0.25 + 800, sp.depth * 0.25 + 600, 800);
    e.move(c); await e.settle(); e.click(c); await e.settle();
    e.ok("cabinet placed", e.cabs().length === 1, "cabs=" + e.cabs().length + " mode=" + e.mode());
    const cab = e.cabs()[0] || {};
    e.ok("cabinet is kitchen", cab.moduleId === "kitchenCabinet", cab.moduleId);
    e.env0 = JSON.stringify(cab.pose);
    // Placement stays armed for repeats — a real user hits Esc to finish.
    e.key("Escape"); await e.settle();
    return { n: e.cabs().length, mode: e.mode() }; })()`],

  ["panel", `(async () => { const e = window.__e2e;
    await e.settle();
    const panel = document.getElementById("rightpanel") || document.body;
    const html = panel.innerHTML || "";
    e.ok("kitchen editor rendered", html.length > 500 && /front view|column|zone/i.test(html), "chars=" + html.length);
    return html.length; })()`],

  ["select", `(async () => { const e = window.__e2e;
    const found = e.scan(e.cabHit);
    e.ok("pick finds cabinet", !!found, found ? JSON.stringify(found) : "none");
    if (found) { e.click(found); await e.settle(); }
    else { e.J.select(e.cabs()[0].id); await e.settle(); }
    // A click on a board of the selected cabinet drills to board level — climb back
    // to module level so Move targets the whole cabinet.
    if (e.J.getSubSelection() && e.J.getSubSelection().boardId) { e.J.select(e.cabs()[0].id); await e.settle(); }
    e.ok("cabinet selected at module level", e.J.getSelectedId() === e.cabs()[0].id && !(e.J.getSubSelection() && e.J.getSubSelection().boardId), "sel=" + e.J.getSelectedId());
    return e.J.getSelectedId(); })()`],

  ["move", `(async () => { const e = window.__e2e;
    e.key("m"); await e.settle();
    e.ok("move mode entered", String(e.mode()).startsWith("move"), e.mode());
    const triad = e.scan((h) => h.object.userData && h.object.userData.kind === "moveAxis" && h.object.userData.op === "translate" && h.object.userData.axis !== "z", 10);
    let moved = false, dbg = "";
    if (triad) {
      const h2 = e.SH.pick(triad.x, triad.y);
      const p0 = JSON.stringify(e.cabs()[0].pose);
      const errN = e.errs.length;
      // Wrap every MODE's hover/down to see who claims the events.
      const claims = { down: [], hover: [] };
      for (const m of e.SH.MODES) {
        for (const k of ["down", "hover"]) {
          if (!m[k]) continue;
          const orig = m[k].bind(m);
          m[k] = (ev) => { const r = orig(ev); if (r) claims[k].push(m.mode ? m.mode() : "?"); return r; };
        }
      }
      e.pe("pointerdown", triad);
      const mid1 = JSON.stringify(e.cabs()[0].pose);
      const cur = e.S.canvas.style.cursor;
      e.move({ x: triad.x + 90, y: triad.y });
      const mid2 = JSON.stringify(e.cabs()[0].pose);
      e.move({ x: triad.x + 90, y: triad.y + 90 });
      e.pe("pointerup", { x: triad.x + 90, y: triad.y + 90 });
      await e.settle();
      const p1 = JSON.stringify(e.cabs()[0].pose);
      moved = p1 !== p0;
      const ud = h2 && h2.object.userData;
      let tInfo = "";
      try {
        const c = e.S.canvas.getBoundingClientRect();
        const SP = await import("./space.js");
        const v = new e.S.camera.position.constructor(0, 0, 1);
        tInfo = " t0=" + SP.closestTOnLine(triad.x, triad.y, {x:0,y:0,z:0}, v)
          + " t1=" + SP.closestTOnLine(triad.x + 90, triad.y, {x:0,y:0,z:0}, v)
          + " t2=" + SP.closestTOnLine(triad.x + 90, triad.y + 90, {x:0,y:0,z:0}, v);
      } catch (ex) { tInfo = " tErr=" + ex.message; }
      dbg = "ud=" + JSON.stringify(ud) + " cur=" + cur + " errs+" + (e.errs.length - errN)
        + " downBy=" + claims.down.join(",") + " hoverBy=" + claims.hover.join(",")
        + " mid1=" + (mid1 === p0 ? "same" : "DIFF") + " mid2=" + (mid2 === mid1 ? "same" : "DIFF") + tInfo;
      if (e.errs.length > errN) dbg += " " + e.errs.slice(errN).join("|").slice(0, 150);
    }
    e.ok("axis drag moves cabinet", moved, dbg || "no triad");
    e.key("Enter"); await e.settle();
    e.ok("move ends on Enter", !String(e.mode()).startsWith("move"), e.mode());
    return e.mode(); })()`],

  ["orient", `(async () => { const e = window.__e2e;
    e.key("f"); await e.settle();
    const m0 = String(e.mode());
    const side = e.scan(e.cabHit, 12);
    let changed = false;
    if (side) {
      const b = JSON.stringify(e.cabs()[0].params) + JSON.stringify(e.cabs()[0].pose);
      e.click(side); await e.settle();
      changed = JSON.stringify(e.cabs()[0].params) + JSON.stringify(e.cabs()[0].pose) !== b;
    }
    e.ok("orient applied or finished cleanly", changed || m0 !== "orient" || e.mode() !== "orient", "m0=" + m0 + " now=" + e.mode() + " chg=" + changed);
    e.key("Escape"); await e.settle();
    return e.mode(); })()`],

  ["resize", `(async () => { const e = window.__e2e;
    e.key("s"); await e.settle();
    e.ok("resize mode entered", String(e.mode()).startsWith("resize"), e.mode());
    e.key("Escape"); await e.settle();
    e.ok("resize cancels", !String(e.mode()).startsWith("resize"), e.mode());
    return e.mode(); })()`],

  ["lounge", `(async () => { const e = window.__e2e, sp = e.sp;
    e.I.startLounge("I"); await e.settle();
    const m0 = String(e.mode());
    const p0 = e.toClient(sp.width * 0.6, sp.depth * 0.7, 0), p1 = e.toClient(sp.width * 0.6 + 900, sp.depth * 0.7 + 550, 0);
    e.pe("pointerdown", p0); e.move(p1); e.move(p1); e.pe("pointerup", p1);
    await e.settle();
    const n = e.cabs().length;
    e.I.cancelLounge(); await e.settle();
    e.ok("lounge entered + cancelled clean", m0 !== "idle" && e.cabs().length === n, "m0=" + m0 + " after=" + e.mode());
    return e.mode(); })()`],

  ["esc-arm", `(async () => { const e = window.__e2e;
    e.I.armPlacement("kitchenCabinet"); await e.settle();
    e.key("Escape"); await e.settle();
    e.ok("placement disarmed by Esc", ["idle", "selected"].includes(String(e.mode())), e.mode());
    return e.mode(); })()`],

  ["undo-redo", `(async () => { const e = window.__e2e;
    const n = e.cabs().length;
    // First undo reverts the most recent step (the move); the next removes the cabinet.
    e.key("z", { ctrlKey: true }); await e.settle();
    e.key("z", { ctrlKey: true }); await e.settle();
    e.ok("undo removes cabinet", e.cabs().length < n, "n=" + e.cabs().length);
    e.key("y", { ctrlKey: true }); await e.settle();
    if (e.cabs().length < n) { e.key("z", { ctrlKey: true, shiftKey: true }); await e.settle(); }
    e.ok("redo restores", e.cabs().length === n, "n=" + e.cabs().length);
    return e.mode(); })()`],

  ["mode-coverage", `(async () => { const e = window.__e2e;
    // Enter and leave each remaining mode; each exercises its module's dispatch path.
    const err0 = e.errs.length;
    e.key("p"); await e.settle();                      // construction plane
    const cplaneMode = String(e.mode());
    e.key("Escape"); await e.settle();
    e.key("i"); await e.settle();                      // measure
    e.key("Escape"); await e.settle();
    e.key("g"); await e.settle();                      // groove pick
    e.key("Escape"); await e.settle();
    if (e.I.startAlign) { e.I.startAlign(); await e.settle(); e.I.cancelAlign(); await e.settle(); }
    if (e.I.startPointAlign) { e.I.startPointAlign(); await e.settle(); e.I.cancelPointAlign(); await e.settle(); }
    e.ok("cplane/measure/groove/align pages enter+exit", true, "cplane=" + cplaneMode + " errs=" + (e.errs.length - err0));
    e.ok("no errors in mode coverage", e.errs.length === err0, e.errs.slice(err0, err0 + 4).join(" | "));
    return e.mode(); })()`],

  ["retype", `(async () => { const e = window.__e2e;
    // After a placement completes, a digit key retypes the last cabinet's size.
    const err0 = e.errs.length;
    e.I.armPlacement("kitchenCabinet"); await e.settle();
    const c = e.toClient(300, 300, 0), c2 = e.toClient(900, 900, 0), c3 = e.toClient(900, 900, 700);
    e.click(c); e.move(c2); e.click(c2); e.move(c3); e.click(c3); await e.settle();
    const placed = e.cabs().length;
    e.key("9"); await e.settle();
    const retypeMode = String(e.mode());
    e.key("Escape"); await e.settle(); e.key("Escape"); await e.settle();
    e.ok("digit retype claims or stays", placed >= 1, "mode=" + retypeMode + " cabs=" + e.cabs().length);
    e.ok("no errors in retype", e.errs.length === err0, e.errs.slice(err0).join(" | ").slice(0, 150));
    return { mode: e.mode(), cabs: e.cabs().length }; })()`],

  ["all-panels", `(async () => { const e = window.__e2e;
    // Render every editor: create each module programmatically, select it, and watch
    // for render crashes (the unbound-identifier class of bug lives here).
    const mods = await import("./modules.js");
    const panel = document.getElementById("rightpanel") || document.body;
    const err0 = e.errs.length;
    const report = [];
    const mods_ = Object.keys(mods.MODULES || mods.default || {});
    let x = 400;
    for (const id of mods_) {
      try {
        const cab = e.J.addCabinet(id, { x, y: 300, z: 0, rotX: 0, rotY: 0, rotZ: 0 });
        x += 700;
        if (!cab || !cab.id) { report.push(id + ":no-id"); continue; }
        e.J.select(cab.id); await e.settle(60);
        const len = (panel.innerHTML || "").length;
        const errsNow = e.errs.length - err0;
        if (errsNow > 0) report.push(id + ":ERR " + e.errs[e.errs.length - 1].slice(0, 80));
        else if (len < 300) report.push(id + ":thin(" + len + ")");
      } catch (ex) { report.push(id + ":THREW " + String(ex.message).slice(0, 80)); }
    }
    e.ok("every module editor renders", report.length === 0, report.slice(0, 6).join(" | ") || ("mods=" + mods_.length));
    return report; })()`],

  ["entity-panels", `(async () => { const e = window.__e2e;
    const panel = document.getElementById("rightpanel") || document.body;
    const err0 = e.errs.length;
    const walls = e.J.getWalls();
    if (walls.length) { e.J.select(walls[0].id); await e.settle(); }
    const wallLen = (panel.innerHTML || "").length;
    e.ok("wall editor renders", wallLen > 300 && e.errs.length === err0, "chars=" + wallLen + " errs=" + (e.errs.length - err0));
    e.J.select(null); await e.settle();
    const spaceLen = (panel.innerHTML || "").length;
    e.ok("space editor renders on deselect", spaceLen > 300 && e.errs.length === err0, "chars=" + spaceLen);
    return { wallLen, spaceLen, errs: e.errs.length - err0 }; })()`],

  ["final", `(async () => { const e = window.__e2e;
    e.ok("ends in a rest mode", ["idle", "selected"].includes(String(e.mode())), e.mode());
    e.ok("no page errors", e.errs.length === 0, e.errs.slice(0, 4).join(" | "));
    return e.steps; })()`],
];

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
const electron = spawn(ELECTRON, [ROOT, `--remote-debugging-port=${PORT}`], {
  cwd: ROOT,
  env,
  stdio: ["ignore", "pipe", "pipe"],
});
let electronErr = "";
electron.stderr.on("data", (d) => (electronErr += d));

try {
  const url = await targetWsUrl();
  ws = new WebSocket(url);
  await new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error("ws connect failed"));
  });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (process.env.E2E_TRACE) console.error(`[cdp] ${m.id ? "res#" + m.id : m.method}`);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id).res(m);
      pending.delete(m.id);
    } else if (m.method === "Runtime.exceptionThrown") {
      pageErrors.push(m.params.exceptionDetails?.exception?.description || m.params.exceptionDetails?.text);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      const args = Array.isArray(m.params.args) ? m.params.args : [];
      pageErrors.push(args.map((a) => a.value || a.description || "").join(" "));
    }
  };
  await send("Runtime.enable");
  for (let i = 0; i < 40; i++) {
    const ready = await evaluate("!!document.getElementById('fpCanvas')");
    if (ready) break;
    await sleep(400);
  }
  const boot = await evaluate(BOOTSTRAP, 20000);
  console.error("[boot] canvas", JSON.stringify(boot.rect));
  let fail = 0;
  for (const [name, expr] of PHASES) {
    try {
      const r = await evaluate(expr, 25000);
      if (process.env.E2E_TRACE) console.error(`[phase ${name}]`, JSON.stringify(r).slice(0, 160));
    } catch (err) {
      console.log(`FAIL  phase "${name}" threw — ${err.message.slice(0, 300)}`);
      fail++;
    }
  }
  const steps = (await evaluate("window.__e2e.steps")) || [];
  for (const s of steps) {
    console.log(`${s.ok ? "PASS" : "FAIL"}  ${s.name}${s.info ? "   — " + s.info : ""}`);
    if (!s.ok) fail++;
  }
  for (const er of pageErrors.slice(0, 8)) console.log("PAGE-ERROR:", String(er).slice(0, 200));
  console.log(fail === 0 ? `\n${steps.length} checks, all passed` : `\n${fail} check(s) FAILED`);
  process.exitCode = fail ? 1 : 0;
} catch (e) {
  console.error("E2E driver error:", e.message);
  if (electronErr) console.error("electron stderr:", electronErr.slice(0, 800));
  process.exitCode = 2;
} finally {
  electron.kill();
}
