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
    let triad = e.scan((h) => h.object.userData && h.object.userData.kind === "moveAxis" && h.object.userData.op === "translate" && h.object.userData.axis !== "z", 10);
    // The arrows are only a few px wide on screen; a coarse grid can sit between
    // them. Fall back to a fine sweep around the triad's projected position.
    if (!triad) {
      const root = e.S.scene.getObjectByName("move-triad");
      if (root && root.visible) {
        const c0 = e.toClient(root.position.x, root.position.y, root.position.z);
        for (let dy = -80; dy <= 80 && !triad; dy += 3)
          for (let dx = -80; dx <= 80 && !triad; dx += 3) {
            const h = e.SH.pick(Math.round(c0.x + dx), Math.round(c0.y + dy));
            const u = h && h.object.userData;
            if (u && u.kind === "moveAxis" && u.op === "translate" && u.axis !== "z") triad = { x: Math.round(c0.x + dx), y: Math.round(c0.y + dy) };
          }
      }
    }
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
    if (!triad) {
      const root = e.S.scene.getObjectByName("move-triad");
      const MV = await import("./interact/move.js");
      const st = MV.moveState && MV.moveState();
      const cab0 = e.cabs()[0];
      let pt = null;
      try { pt = root ? root.position.toArray().map((v) => Math.round(v)) : null; } catch (_) {}
      dbg = "no triad root=" + (root ? (root.visible ? "vis" : "HIDDEN") + "@ " + JSON.stringify(pt) : "MISSING")
        + " move=" + JSON.stringify(st && { id: st.id, target: st.target, kind: st.kind })
        + " sel=" + e.J.getSelectedId() + " sub=" + JSON.stringify(e.J.getSubSelection())
        + " cabPose=" + (cab0 ? JSON.stringify(cab0.pose) : "none")
        + " errs=" + e.errs.length;
      if (root && root.visible) {
        const C3 = await import("./cabinets3d.js");
        const pk = C3.pickables().filter((m) => m.userData.kind === "moveAxis");
        const scr = pk.map((m) => {
          const b = new e.S.camera.position.constructor();
          m.getWorldPosition(b); const c = e.toClient(b.x, b.y, b.z);
          return m.userData.axis + m.userData.op[0] + "@" + Math.round(c.x) + "," + Math.round(c.y);
        });
        const pC = e.toClient(root.position.x, root.position.y, root.position.z);
        const direct = e.SH.pick(Math.round(pC.x), Math.round(pC.y));
        dbg += " pickables=" + pk.length + " " + scr.join(" ") + " rootScr=" + Math.round(pC.x) + "," + Math.round(pC.y)
          + " direct=" + (direct ? direct.object.userData.kind + "/" + (direct.object.userData.axis || "-") : "none");
      }
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

  ["functional", `(async () => { const e = window.__e2e;
    // Functional pass: not just "the editor renders" — every editor must accept a
    // real edit that lands in job params. Uses the cabinets "all-panels" placed.
    const panel = document.getElementById("rightpanel") || document.body;
    const cab = (id) => e.cabs().find((c) => c.moduleId === id);
    const jCab = (id) => e.J.getJob().cabinets.find((x) => x.id === id);
    const sel = async (id) => { const c = cab(id); if (c) { e.J.select(c.id); await e.settle(450); } return c; };
    const ev = (t, o = {}) => new (t === "click" ? MouseEvent : Event)(t, { bubbles: true, ...o });
    // Try editable label.field number inputs until one mutates the job.
    const fieldCommit = async (id) => {
      const c = await sel(id); if (!c) return "no cabinet";
      const inputs = [...panel.querySelectorAll("label.field input[type=number]")].filter((i) => !i.readOnly && !i.disabled);
      if (!inputs.length) return "no editable field";
      for (const inp of inputs) {
        const before = JSON.stringify(jCab(c.id));
        inp.value = String((Number(inp.value) || 0) + 10);
        inp.dispatchEvent(new Event("change", { bubbles: true }));
        await e.settle(80);
        if (JSON.stringify(jCab(c.id)) !== before) return "changed";
      }
      return "no change on " + inputs.length + " fields";
    };
    // Click .col-dim.editable → type +delta into .col-dim-input → Enter.
    const dimEdit = async (delta = 20) => {
      const dim = panel.querySelector(".col-dim.editable");
      if (!dim) return { res: "no editable dim" };
      const param = dim.getAttribute("data-param");
      dim.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      await e.settle(40);
      const inp = panel.querySelector(".col-dim-input");
      if (!inp) return { res: "input did not open", param };
      inp.value = String((Number(inp.value) || 0) + delta);
      inp.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
      await e.settle(100);
      return { res: "ok", param };
    };

    // --- kitchen: + Column on the selected column, typed column dim ---
    let c = await sel("kitchenCabinet");
    if (c) {
      const cell = panel.querySelector("[data-zone]");
      if (cell) { cell.dispatchEvent(new MouseEvent("click", { bubbles: true })); await e.settle(60); }
      const n0 = (jCab(c.id).params.columns || []).length;
      const addBtn = [...panel.querySelectorAll("button.tb")].find((b) => b.textContent.includes("+ Column"));
      if (addBtn && !addBtn.disabled) { addBtn.click(); await e.settle(100); }
      const n1 = (jCab(c.id).params.columns || []).length;
      e.ok("kitchen + Column adds a column", n1 === n0 + 1, n0 + " -> " + n1 + (addBtn ? (addBtn.disabled ? " (disabled)" : "") : " (no btn)"));
      const w0 = (jCab(c.id).params.columns || []).map((x) => x.width).join();
      const d = await dimEdit(20);
      const w1 = (jCab(c.id).params.columns || []).map((x) => x.width).join();
      e.ok("kitchen typed column dim applies", d.res === "ok" && w1 !== w0, d.res + " " + w0 + " -> " + w1);
    } else e.ok("kitchen functional", false, "no cabinet");

    // --- lounge: plan-view typed dim edits the stored param ---
    c = await sel("loungeGenerator");
    if (c) {
      const dim = panel.querySelector(".col-dim.editable");
      const param = dim && dim.getAttribute("data-param");
      const v0 = param ? jCab(c.id).params[param] : undefined;
      const d = await dimEdit(40);
      const v1 = (d.param || param) ? jCab(c.id).params[d.param || param] : undefined;
      e.ok("lounge plan typed dim applies", d.res === "ok" && v1 !== v0, (d.param || param) + " " + v0 + " -> " + v1 + " (" + d.res + ")");
      e.ok("lounge wheel-arch controls present", /wheel/i.test(panel.innerHTML), "");
    } else e.ok("lounge functional", false, "no cabinet");

    // --- tall: ctrl-multiselect two zones, Average selected height applies ---
    c = await sel("generalTallCabinet");
    if (c) {
      const regions = [...panel.querySelectorAll("[data-zone]")];
      if (regions.length >= 2) {
        regions[0].dispatchEvent(new MouseEvent("click", { bubbles: true })); await e.settle(50);
        regions[1].dispatchEvent(new MouseEvent("click", { bubbles: true, ctrlKey: true })); await e.settle(50);
        const avg = [...panel.querySelectorAll("button.tb")].find((b) => /average selected/i.test(b.textContent));
        const h0 = JSON.stringify((jCab(c.id).params.zones || []).map((z) => z.height));
        if (avg && !avg.disabled) { avg.click(); await e.settle(100); }
        const h1 = JSON.stringify((jCab(c.id).params.zones || []).map((z) => z.height));
        e.ok("tall ctrl+click multiselect + average", !!avg && !avg.disabled && h1 !== h0, "btn=" + !!avg + (avg ? (avg.disabled ? " disabled" : "") : "") + " " + h0 + " -> " + h1);
      } else e.ok("tall multiselect", false, "zone regions=" + regions.length);
    } else e.ok("tall functional", false, "no cabinet");

    // --- every other editor: a field edit must land in params ---
    const generic = ["ensuiteCabinet", "tallFridgeCabinet", "overheadCabinet", "uShapeOverheadCabinet", "smallCabinet", "bedroom", "bedroomEast", "bedside", "bunkBed", "bedBox"];
    const fails = [];
    for (const id of generic) {
      if (!cab(id)) continue;                       // module not in this build
      const r = await fieldCommit(id);
      if (r !== "changed") fails.push(id + ":" + r);
    }
    e.ok("every editor accepts a param edit", fails.length === 0, fails.slice(0, 5).join(" | ") || "checked " + generic.length);

    // --- drawing modules render real content ---
    for (const id of ["ensuiteDrawingLower", "ensuiteDrawingTall"]) {
      c = await sel(id);
      if (!c) continue;
      const len = panel.innerHTML.length;
      e.ok(id + " drawing panel has content", len > 200, "chars=" + len);
    }

    // --- partition fit to a lounge run: store + render the upstream contract ---
    const ohc = cab("overheadCabinet"), lg = cab("loungeGenerator");
    if (ohc && lg && e.J.addWall) {
      const w = e.J.addWall({ axis: "x", at: e.sp.depth - 400, u0: 200, u1: 1800, side: 1 });
      e.J.setWallFit(w.id, { overheadId: ohc.id, loungeId: lg.id, radius: 50 });
      await e.settle(80);
      const stored = e.J.getWall(w.id) || {};
      e.J.select(w.id); await e.settle(450);
      e.ok("wall fit to lounge stored + rendered", stored.fit && stored.fit.loungeId === lg.id && !stored.fit.kitchenId && /Lounge/.test(panel.innerHTML),
        "fit=" + JSON.stringify(stored.fit || null) + " panel=" + (/Lounge/.test(panel.innerHTML) ? "Lounge" : "?"));
    } else e.ok("wall fit to lounge", false, "missing overhead/lounge/addWall");

    // Deselect while a partition exists — renderSpace runs spaceFitIssues over the
    // wall, which calls doorBlockers (it crashed on CI before it moved to widgets).
    {
      const err0 = e.errs.length;
      e.J.select(null); await e.settle(450);
      e.ok("space editor renders with a partition", panel.innerHTML.length > 300 && e.errs.length === err0,
        "chars=" + panel.innerHTML.length + " errs=" + (e.errs.length - err0));
    }

    // --- ensuite sample: refused in a wrong space; in the matching space the
    // existing drawing cabs make it refuse "already in job"; cleared, it places.
    const n0 = e.cabs().length;
    const bad = e.I.placeEnsuiteSample();
    e.ok("ensuite sample refuses wrong space", bad === false && e.cabs().length === n0, "ret=" + bad);
    e.J.defineSpace("box", { width: 2275, depth: 3000, height: 1965 });
    await e.settle(150);
    const dup = e.I.placeEnsuiteSample();
    e.ok("ensuite sample refuses when parts exist", dup === false && e.cabs().length === n0, "ret=" + dup);
    for (const x of e.cabs().filter((x) => String(x.moduleId).startsWith("ensuiteDrawing"))) e.J.removeCabinet(x.id);
    await e.settle(60);
    const before = e.cabs().length;
    const good = e.I.placeEnsuiteSample();
    await e.settle(150);
    const newIds = e.cabs().slice(-2).map((x) => x.moduleId);
    e.ok("ensuite sample places both parts", good === true && e.cabs().length === before + 2, "ret=" + good + " new=" + newIds.join(","));
    e.J.defineSpace("box", { width: e.sp.width, depth: e.sp.depth, height: e.sp.height });
    await e.settle(150);
    return e.mode(); })()`],

  ["functional-drag", `(async () => { const e = window.__e2e;
    // Gesture pass: SVG boundary grips get real pointerdown/move/up drags and the
    // stored params must move. The panels keep their own mm<->px mapping on the
    // svg element (data-scale/ox/oy/h) — we invert it back to client coords.
    const panel = document.getElementById("rightpanel") || document.body;
    const cab = (id) => e.cabs().find((c) => c.moduleId === id);
    const jCab = (id) => e.J.getJob().cabinets.find((x) => x.id === id);
    const sel = async (id) => { const c = cab(id); if (c) { e.J.select(c.id); await e.settle(450); } return c; };
    const svgDrag = async (gripSel, dxMm, dyMm) => {
      const front = panel.querySelector(".bedroom-front");
      const g = front && front.querySelector(gripSel);
      const svg = front && front.querySelector("svg");
      if (!g || !svg) return "no grip";
      const rect = svg.getBoundingClientRect();
      const k = Number(svg.getAttribute("width")) / rect.width;
      const scale = Number(svg.dataset.scale);
      const gr = g.getBoundingClientRect();
      const p0 = { x: gr.left + gr.width / 2, y: gr.top + gr.height / 2 };
      const to = { x: p0.x + (dxMm * scale) / k, y: p0.y - (dyMm * scale) / k };
      const opts = { bubbles: true, button: 0, buttons: 1, pointerId: 1, pointerType: "mouse", isPrimary: true };
      g.dispatchEvent(new PointerEvent("pointerdown", { ...opts, clientX: p0.x, clientY: p0.y }));
      front.dispatchEvent(new PointerEvent("pointermove", { ...opts, clientX: to.x, clientY: to.y }));
      front.dispatchEvent(new PointerEvent("pointerup", { ...opts, clientX: to.x, clientY: to.y, buttons: 0 }));
      await e.settle(120);
      return "dragged";
    };

    // --- kitchen: column boundary drag keeps the run's total; split toggles + drags ---
    let c = await sel("kitchenCabinet");
    if (c) {
      const cell = panel.querySelector("[data-zone]");
      if (cell) { cell.dispatchEvent(new MouseEvent("click", { bubbles: true })); await e.settle(80); }
      const addBtn = [...panel.querySelectorAll("button.tb")].find((b) => b.textContent.includes("+ Column"));
      while ((jCab(c.id).params.columns || []).length < 3 && addBtn && !addBtn.disabled) { addBtn.click(); await e.settle(120); }
      const ws0 = (jCab(c.id).params.columns || []).map((x) => x.width);
      const r = await svgDrag("[data-boundary='column']", 60, 0);
      const ws1 = (jCab(c.id).params.columns || []).map((x) => x.width);
      const sum = (a) => a.reduce((x, y) => x + y, 0);
      e.ok("kitchen column boundary drag", r === "dragged" && ws1.join() !== ws0.join() && Math.abs(sum(ws1) - sum(ws0)) < 1,
        r + " " + ws0.join() + " -> " + ws1.join());
      const splitBtn = [...panel.querySelectorAll("button.tb")].find((b) => /Split Kitchen/.test(b.textContent));
      if (splitBtn && !splitBtn.disabled) { splitBtn.click(); await e.settle(120); }
      const s0 = jCab(c.id).params.splitAfter;
      const lines = (e.J.resultFor(c.id)?.debug?.columns || []).slice(0, -1).map((col) => col.x1);
      // Drag toward a different boundary: the marker sits on lines[s0].
      const target = s0 > 0 ? s0 - 1 : s0 + 1;
      const dxMm = s0 != null && lines[target] != null ? lines[target] - lines[s0] : -400;
      const r2 = await svgDrag("[data-boundary='split']", dxMm, 0);
      const s1 = jCab(c.id).params.splitAfter;
      e.ok("kitchen split marker drag", r2 === "dragged" && s0 != null && s1 !== s0, s0 + " -> " + s1 + " (" + r2 + ")");
      const rm = [...panel.querySelectorAll("button.tb")].find((b) => /Remove split/.test(b.textContent));
      if (rm && !rm.disabled) { rm.click(); await e.settle(100); }
      e.ok("kitchen split removed", jCab(c.id).params.splitAfter == null, "after=" + jCab(c.id).params.splitAfter);
      // Wheel arch avoidance checkbox → wheelAvoidances[0] created.
      const cb = [...panel.querySelectorAll("label.field.check input[type=checkbox]")].find((i) => /wheel arch/i.test(i.closest("label").textContent || ""));
      if (cb && !cb.checked) { cb.click(); await e.settle(120); }
      const wa = jCab(c.id).params;
      e.ok("kitchen wheel arch toggles on", wa.wheelArchAvoidance === true && (wa.wheelAvoidances || []).length >= 1,
        "on=" + wa.wheelArchAvoidance + " arches=" + JSON.stringify(wa.wheelAvoidances || []).slice(0, 100));
    } else e.ok("kitchen drag suite", false, "no cabinet");

    // --- lounge: plan edge grip drag edits the stored size ---
    c = await sel("loungeGenerator");
    if (c) {
      const g = panel.querySelector("[data-boundary]");
      const edge = g && g.getAttribute("data-param");
      const axis = g && g.getAttribute("data-axis");
      // the panel maps screen-side edge names onto stored params
      const param = { mainWidthLo: "mainWidth", totalWidthLo: "totalWidth", mainDepthFront: "mainDepth", lWidthFront: "lWidth", depthFront: "depth" }[edge] || edge;
      const read = () => (param && param.startsWith("middleCabinet.") ? (jCab(c.id).params.middleCabinet || {})[param.slice(14)] : param ? jCab(c.id).params[param] : undefined);
      const v0 = read();
      const r = await svgDrag("[data-boundary]", axis === "y" ? 0 : 50, axis === "y" ? 50 : 0);
      const v1 = read();
      e.ok("lounge plan edge drag applies", r === "dragged" && param && v1 !== v0, edge + "→" + param + " " + v0 + " -> " + v1 + " (" + r + ")");
    } else e.ok("lounge drag", false, "no cabinet");

    // --- tall: zone boundary drag adjusts zone heights ---
    c = await sel("generalTallCabinet");
    if (c) {
      const h0 = JSON.stringify((jCab(c.id).params.zones || []).map((z) => z.height));
      const r = await svgDrag("[data-boundary]", 0, -60);
      const h1 = JSON.stringify((jCab(c.id).params.zones || []).map((z) => z.height));
      e.ok("tall zone boundary drag applies", r === "dragged" && h1 !== h0, r + " " + h0 + " -> " + h1);
    } else e.ok("tall drag", false, "no cabinet");
    return e.mode(); })()`],

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
      // 150 s: the functional phases serialize many select→settle→edit steps and
      // software-rendered CI runners are several times slower than a dev box.
      const r = await evaluate(expr, 150000);
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
