// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { thickness } from "../materials.js";
import { el, numField, section, kv, panel, repaint } from "./widgets.js";
// --- lounge editor ---------------------------------------------------------------------
//
// Wide page while a lounge group is selected: a top-down plan view (the
// elevation of a 420 mm seat is a flat strip — the shape lives in XY). Click a
// run to select it; drag an orange edge to move it — the edge drives its
// matching size param (mainWidth / lWidth / lDepth / …, 10 mm steps,
// Shift = 1 mm). A card edits the selected run's fields. Every edit is one undo
// step; a drag commits once on release.

const loungeSel = { cabId: null, run: null }; // run selection, kept across re-renders
let loungeDrag = null; // { cabId, refresh } while a plan edge is dragged

function loungeSelected(cabId) {
  if (loungeSel.cabId !== cabId) { loungeSel.cabId = cabId; loungeSel.run = null; }
  return loungeSel.run;
}

const LOUNGE_RUN_LABEL = { i: "Run", main: "Main run", l: "L wing", left: "Left leg", right: "Right leg" };
const LOUNGE_STYLE_LABEL = { I_SHAPE: "I · straight", L_SHAPE: "L · corner", U_SHAPE: "U · three sides", PARALLEL: "Parallel · face to face" };

export function renderLounge(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const style = p.style || "L_SHAPE";
  const frameL = style === "L_SHAPE" && p.construction !== "classic";
  const frame = frameL || (style === "I_SHAPE" && p.construction !== "classic");
  const frameP = style === "PARALLEL" && p.construction !== "classic";
  // The middle cabinet as the generator built it (its width may come from the gap).
  const mc = result?.params?.middleCabinet ?? null;
  const mcField = (label, key, min) => numField(label, mc[key], (v) => {
    job.setParams(cab.id, { ...p, hasMiddleCabinet: true, middleCabinet: { ...(p.middleCabinet || {}), [key]: Math.max(min, Math.round(v)) } });
    log("lounge.run.midCab", { id: cab.id, key: `middleCabinet.${key}`, to: Math.round(v) });
  }, { step: 10, min });
  const selectedRun = loungeSelected(cab.id);
  const runs = Object.keys(result?.footprint || {});

  const setP = (key, value, kind = "set") => {
    job.setParams(cab.id, { ...p, [key]: value });
    log(`lounge.run.${kind}`, { id: cab.id, key, to: value });
  };

  // A drag in progress: redraw the SVG in place and keep the container (and its pointer capture) alive.
  if (loungeDrag && loungeDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    loungeDrag.refresh();
    return;
  }

  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedRun: loungeSelected(cab.id) }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No plan view — fix the checks first." }));
  };
  drawFront();

  front.addEventListener("click", (e) => {
    if (loungeDrag) return;
    const runEl = e.target.closest?.("[data-run]");
    if (!runEl) return;
    const id = runEl.getAttribute("data-run");
    loungeSel.cabId = cab.id;
    loungeSel.run = loungeSel.run === id ? null : id;
    log("lounge.run.select", { id: cab.id, run: loungeSel.run });
    repaint();
  });
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    const svg = front.querySelector("svg");
    if (!g || !svg || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const param = g.getAttribute("data-param");
    const axis = g.getAttribute("data-axis"); // "x" | "y"
    const params0 = cab.params;
    const from = params0[param];
    const before = job.snapshot();
    // mm ↔ px: the SVG carries its own mapping; plan view maps the vertical axis to Y (depth), not Z.
    const toMm = (clientX, clientY) => {
      const s = front.querySelector("svg");
      const rect = s.getBoundingClientRect();
      const k = Number(s.getAttribute("width")) / rect.width;
      const scale = Number(s.dataset.scale);
      const ox = Number(s.dataset.ox);
      const oy = Number(s.dataset.oy);
      const planH = Number(s.dataset.h);
      return axis === "x" ? ((clientX - rect.left) * k - ox) / scale : planH - ((clientY - rect.top) * k - oy) / scale;
    };
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    front.classList.add("dragging");
    g.classList.add("active");
    loungeDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(toMm(ev.clientX, ev.clientY) / step) * step;
      job.setParams(cab.id, mod.setRunEdge(params0, param, v), { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      front.classList.remove("dragging");
      loungeDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("lounge.run.drag", { id: cab.id, param, from, to: now ? now.params[param] : null, changed, where: "plan view" });
      repaint();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  // Selected run card: its rectangle, then only the sizes that run owns.
  const check = (text, on, onChange, title) => el("label", { class: "field check", title }, [
    el("span", { text }),
    el("input", { type: "checkbox", checked: on, onchange: (e) => onChange(e.target.checked) }),
  ]);
  const num = (label, key, min, title) => {
    const field = numField(label, p[key] ?? 0, (v) => setP(key, Math.max(min, Math.round(v)), "size"), { step: 10, min });
    if (title) field.title = title;
    return field;
  };
  let runCard = null;
  const fpRun = selectedRun ? result?.footprint?.[selectedRun] : null;
  if (fpRun) {
    const f = [
      kv("Across (X)", `${Math.round(fpRun.x0)} – ${Math.round(fpRun.x1)} · ${Math.round(fpRun.x1 - fpRun.x0)} long`),
      kv("From the room (Y)", `${Math.round(fpRun.y0)} – ${Math.round(fpRun.y1)} · ${Math.round(fpRun.y1 - fpRun.y0)} deep`),
    ];
    if (style === "I_SHAPE") {
      f.push(num("Length (mm)", "mainWidth", mod.minSize.W), num("Seat depth (mm)", "mainDepth", 300));
    } else if (style === "L_SHAPE") {
      if (selectedRun === "main") f.push(num("Overall width (mm)", "mainWidth", mod.minSize.W, "Main run + wing, along the wall"), num("Seat depth (mm)", "mainDepth", 300));
      if (selectedRun === "l") f.push(num("Wing length (mm)", "lWidth", 400, "Wall to the room end of the wing — the overall depth"), num("Wing seat depth (mm)", "lDepth", 200));
    } else if (style === "U_SHAPE") {
      if (selectedRun === "main") f.push(num("Overall width (mm)", "mainWidth", mod.minSize.W), num("Overall depth (mm)", "mainDepth", 600));
      else f.push(num("Leg seat depth (mm)", "lDepth", 200, "Both legs and the back run share it"), num("Overall depth (mm)", "mainDepth", 600));
    } else if (style === "PARALLEL") {
      f.push(num("Run width (mm)", "singleLoungeWidth", 400, "Both runs share it"), num("Run length (mm)", "depth", 400), num("Total width (mm)", "totalWidth", 1600, "Outer face to outer face"));
    }
    runCard = section(`${LOUNGE_RUN_LABEL[selectedRun] ?? selectedRun}`, f);
  }

  // Shape: the lounge's own layout, always open (like the bedroom's Layout section).
  const shape = section(`Shape · ${style.replace("_", " ")}`, [
    el("label", { class: "field wide-value" }, [
      el("span", { text: "Style" }),
      el("select", { onchange: (e) => {
        e.target.blur();
        const to = e.target.value;
        loungeSel.run = null;
        job.setParams(cab.id, mod.setStyle(p, to));
        log("lounge.run.style", { id: cab.id, key: "style", from: style, to });
      } }, Object.entries(LOUNGE_STYLE_LABEL).map(([s, text]) => el("option", { value: s, text, selected: s === style }))),
    ]),
    style === "L_SHAPE" ? el("label", { class: "field wide-value" }, [
      el("span", { text: "Wing side" }),
      el("select", { onchange: (e) => { e.target.blur(); setP("lPosition", e.target.value, "side"); } },
        ["RIGHT", "LEFT"].map((s) => el("option", { value: s, text: s === "RIGHT" ? "Right" : "Left", selected: s === (p.lPosition ?? "RIGHT") }))),
    ]) : null,
    frameL ? el("label", { class: "field wide-value", title: "The wing's room end: a plain seat front, or a drawer front with a fixed strip over it (no drawer box)" }, [
      el("span", { text: "Wing end" }),
      el("select", { onchange: (e) => { e.target.blur(); setP("lFrontAccess", e.target.value, "access"); } },
        [["NONE", "Seat front"], ["DRAWER", "Drawer"]].map(([v, text]) => el("option", { value: v, text, selected: v === (p.lFrontAccess === "DRAWER" ? "DRAWER" : "NONE") }))),
    ]) : null,
    numField("Seat height (mm)", p.height ?? env.H, (v) => setP("height", Math.max(mod.minSize.H, Math.round(v)), "size"), { step: 10, min: mod.minSize.H }),
    // A frame lounge's whole top is the lid; only the frame parallel has the wheel-arch cover yet.
    frame || frameP ? null : check("Top lids", p.topLidEnabled !== false, (on) => setP("topLidEnabled", on, "lid"), "Storage under the seat: an opening in each top with a lift-out lid"),
    frameP ? el("label", { class: "field wide-value", title: "Both runs' aisle ends: a plain end panel, or a drawer front with a fixed strip over it (no drawer box)" }, [
      el("span", { text: "Aisle ends" }),
      el("select", { onchange: (e) => { e.target.blur(); setP("aisleAccess", e.target.value, "access"); } },
        [["NONE", "Seat front"], ["DRAWER", "Drawer"]].map(([v, text]) => el("option", { value: v, text, selected: v === (p.aisleAccess === "DRAWER" ? "DRAWER" : "NONE") }))),
    ]) : null,
    style === "PARALLEL" ? check("Middle cabinet", !!mc, (on) => setP("hasMiddleCabinet", on, "midCab"), "A low cabinet between the two runs, against the wall") : null,
    ...(mc ? [
      mcField("Cabinet width (mm)", "width", 100),
      mcField("Cabinet depth (mm)", "depth", 100),
      mcField("Cabinet height (mm)", "height", 100),
    ] : []),
    style !== "U_SHAPE" && !frame ? check("Wheel-arch cut-out", p.wheelAvoidanceEnabled === true, (on) => setP("wheelAvoidanceEnabled", on, "wheel")) : null,
    ...(style === "PARALLEL" && p.wheelAvoidanceEnabled === true ? [
      numField("Wheel arch depth (mm)", p.avoidanceDepth ?? 300, (v) => setP("avoidanceDepth", Math.max(0, Math.round(v)), "wheel"), { step: 10, min: 0 }),
      numField("Wheel arch height (mm)", p.avoidanceHeight ?? 250, (v) => setP("avoidanceHeight", Math.max(0, Math.round(v)), "wheel"), { step: 10, min: 0 }),
    ] : []),
  ].filter(Boolean));

  // Cabinet-level fields, folded.
  const setEnv = (k) => (v) => job.setParams(cab.id, mod.setEnvelope(p, { [k]: Math.max(mod.minSize[k], v) }));
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Lounge · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box)", [
      numField("Width (mm)", env.W, setEnv("W")),
      numField("Depth (mm)", env.D, setEnv("D")),
      numField("Height (mm)", env.H, setEnv("H")),
    ]),
    section("Position", [
      numField("X (mm)", cab.pose.x, setPose("x"), { min: -1e6 }),
      numField("Y (mm)", cab.pose.y, setPose("y"), { min: -1e6 }),
      numField("Rotation (°)", cab.pose.rotZ || 0, (v) => job.setPose(cab.id, { rotZ: ((Math.round(v / 90) * 90) % 360 + 360) % 360 }), { step: 90, min: -1e6 }),
    ]),
    section("Material", [
      numField("Panel thickness (mm)", p.partitionPanelThickness ?? 18, (v) => setP("partitionPanelThickness", Math.max(1, v), "size"), { step: 0.5, min: 1 }),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} · ${LOUNGE_STYLE_LABEL[style] ?? style}` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} mm · ${runs.length} run${runs.length === 1 ? "" : "s"} · ${result?.boards?.length || 0} boards` }),
    ]),
    shared.board,
    section("Plan view · from above · wall at the top", [
      front,
      el("div", { class: "zs-hint", text: "Click a run to select it · drag an orange edge · Shift = 1 mm" }),
    ]),
    runCard,
    shape,
    fold,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
