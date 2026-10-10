// @module panel @owns renderLounge — lounge.run.* plan view, back panels, wheel arch
// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { thickness } from "../materials.js";
import { el, numField, section, kv, panel, repaint, outerSizeFields } from "./widgets.js";
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
const LOUNGE_STYLE_LABEL = { I_SHAPE: "I · straight", L_SHAPE: "L · corner", PARALLEL: "Parallel · face to face" };

export function renderLounge(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const style = p.style || "L_SHAPE";
  // Every lounge is the frame build now (the classic top panel and the U were retired).
  const frameL = style === "L_SHAPE";
  const frameP = style === "PARALLEL";
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
    const now = job.getJob().cabinets.find((c) => c.id === cab.id) || cab;
    front.innerHTML = mod.frontView(job.resultFor(cab.id), {
      selectedRun: loungeSelected(cab.id),
      params: now.params,
      widthAnchor: mod.widthAnchor ? mod.widthAnchor(now.params, now) : -1,
    }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No plan view — fix the checks first." }));
  };
  drawFront();

  // A number on the plan: click to type it. The value is the param itself (lengths, depths, seat
  // widths, the middle cabinet); the wall and the anchored end stay (job.setParams anchors the pose).
  const LOUNGE_TYPED_MIN = { mainWidth: 800, mainDepth: 300, lWidth: 400, lDepth: 200, totalWidth: 1600, singleLoungeWidth: 400, depth: 400 };
  const setTyped = (param, typed, shown) => {
    if (!Number.isFinite(typed) || Math.abs(typed - shown) < 0.05) return;
    if (param.startsWith("middleCabinet.")) {
      const key = param.slice("middleCabinet.".length);
      const v = Math.max(100, Math.round(typed));
      job.setParams(cab.id, { ...p, hasMiddleCabinet: true, middleCabinet: { ...(p.middleCabinet || {}), [key]: v } });
      log("lounge.run.midCab", { id: cab.id, key: param, to: v, shown, where: "plan view" });
      return;
    }
    const v = Math.max(LOUNGE_TYPED_MIN[param] ?? 1, Math.round(typed * 10) / 10);
    job.setParams(cab.id, { ...p, [param]: v });
    log("lounge.run.size", { id: cab.id, key: param, from: p[param] ?? shown, to: v, shown, where: "plan view" });
  };
  const editPlanDim = (dim) => {
    if (front.querySelector(".col-dim-input")) return;
    const param = dim.getAttribute("data-param");
    const shown = Number(dim.getAttribute("data-value"));
    if (!param || !Number.isFinite(shown)) return;
    const box = dim.getBoundingClientRect();
    const host = front.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "number";
    input.className = "col-dim-input";
    input.step = "1";
    input.value = String(shown);
    input.style.left = `${box.left - host.left + box.width / 2}px`;
    input.style.top = `${box.top - host.top}px`;
    front.append(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (apply) => {
      if (done) return;
      done = true;
      const typed = Number(input.value);
      input.remove();
      if (apply) setTyped(param, typed, shown);
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  };

  front.addEventListener("click", (e) => {
    if (loungeDrag) return;
    const dim = e.target.closest?.(".col-dim.editable");
    if (dim) {
      e.stopPropagation();
      editPlanDim(dim);
      return;
    }
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
    // Grips on the room side / the left end drive the same stored size as the matching far edge.
    const stored = { mainWidthLo: "mainWidth", totalWidthLo: "totalWidth", mainDepthFront: "mainDepth", lWidthFront: "lWidth", depthFront: "depth" }[param] ?? param;
    const from = params0[stored];
    const before = job.snapshot();
    // mm ↔ px: the SVG carries its own mapping; plan view maps the vertical axis to Y (depth), not Z.
    // The mapping is read once, at the press: the plan re-fits while it changes, and setRunEdge reads
    // `pos` in the plan as it was when the drag started (params0).
    const rect0 = svg.getBoundingClientRect();
    const map0 = {
      k: Number(svg.getAttribute("width")) / rect0.width,
      scale: Number(svg.dataset.scale), ox: Number(svg.dataset.ox), oy: Number(svg.dataset.oy), planH: Number(svg.dataset.h),
    };
    const toMm = (clientX, clientY) => (axis === "x"
      ? ((clientX - rect0.left) * map0.k - map0.ox) / map0.scale
      : map0.planH - ((clientY - rect0.top) * map0.k - map0.oy) / map0.scale);
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
      log("lounge.run.drag", { id: cab.id, param: stored, edge: param, from, to: now ? now.params[stored] : null, changed, pose: now ? now.pose : null, where: "plan view" });
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
    // The whole top of each run is the lid; only the parallel lounge has the wheel-arch cover yet.
    frameL ? check("Back panel", p.backPanel === true, (on) => setP("backPanel", on, "back"), "A tall panel on the wing's outer side. The wing moves into the main by one panel thickness; the outer width stays.") : null,
    frameP ? check("Left back panel", p.leftBackPanel === true, (on) => setP("leftBackPanel", on, "back"), "On the left run's outer end. That run moves toward the gap by one panel thickness.") : null,
    frameP ? check("Right back panel", p.rightBackPanel === true, (on) => setP("rightBackPanel", on, "back"), "On the right run's outer end. That run moves toward the gap by one panel thickness.") : null,
    (frameL && p.backPanel === true) || (frameP && (p.leftBackPanel === true || p.rightBackPanel === true)) ? (() => {
      const past = numField("Past the front (mm)", p.backPanelOverhang ?? 50, (v) => setP("backPanelOverhang", Math.max(0, Math.round(v)), "back"), { step: 5, min: 0 });
      past.title = "How far the panel sticks past the room face. The seat stays where it is.";
      const high = Math.round(result?.params?.backPanelHeight ?? (p.height ?? 420) + 530);
      return el("div", {}, [
        past,
        el("div", { class: "empty small", text: `Panel ${high} mm high — 530 above the seat. The top corner toward the room is rounded, radius 50.` }),
      ]);
    })() : null,
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
  ].filter(Boolean));

  // Wheel arch avoidance: the red pairs on the floor plan cut whatever this lounge stands in (job.js
  // syncLoungeArch → planWheelArches). I / L: a notch in each board the arch hits. Parallel: the boards,
  // plus top / front covers in the middle gap. The checkbox off refuses it.
  const worldArches = job.getSpace()?.wheelArches || [];
  const archOn = p.wheelArchAvoidance !== false;
  const hitArches = (p.planWheelArches || []).filter((a) => a.id !== "hand");
  const hw = p.handWheelArch || {};
  const handOn = hw.enabled === true;
  const setHand = (patch) => {
    const next = { enabled: true, depth: hw.depth > 0 ? hw.depth : 300, height: hw.height > 0 ? hw.height : 250, ...patch };
    job.setParams(cab.id, { ...p, handWheelArch: next, ...(next.enabled ? { wheelArchAvoidance: true } : {}) });
    log("lounge.wheel.hand", { id: cab.id, arch: next });
  };
  const loungeWheel = section("Wheel arch avoidance", [
    el("label", { class: "field check", title: "Cut this lounge around the wheel arches drawn on the floor plan" }, [
      el("span", { text: "Wheel arch avoidance" }),
      el("input", { type: "checkbox", checked: archOn, onchange: (e) => setP("wheelArchAvoidance", e.target.checked, "wheel") }),
    ]),
    ...(!archOn ? [
      el("div", { class: "empty small", text: "Off. No board is cut, even where the lounge stands in a wheel arch." }),
    ] : !worldArches.length ? [
      el("div", { class: "empty small", text: "No wheel arch on the floor plan yet. Draw one there (Wheel arch, A); the boards it meets are then cut." }),
    ] : hitArches.length ? [
      ...hitArches.map((a) => kv(a.id, `along ${Math.round(a.x0)}–${Math.round(a.x1)} · ${Math.round(a.y1 - a.y0)} in from the wall · ${Math.round(a.z1)} high`)),
      el("div", { class: "empty small", text: style === "PARALLEL"
        ? "From the floor plan. Each board the arch meets gets a notch; in the middle gap a top and a front cover close it, and the middle cabinet stands on the top cover."
        : "From the floor plan. Each board the arch meets gets a notch; nothing else is added." }),
    ] : [
      el("div", { class: "empty small", text: "This lounge stands outside the wheel arches on the floor plan." }),
    ]),
    ...(archOn ? [
      check("By hand (full width)", handOn, (on) => setHand({ enabled: on }), "A cut along the whole lounge, typed here. Cut the same way as a floor-plan arch: a notch in each board it meets (parallel: covers in the middle gap)."),
      ...(handOn ? [
        numField("Depth from the wall (mm)", hw.depth ?? 300, (v) => setHand({ depth: Math.max(0, Math.round(v)) }), { step: 10, min: 0 }),
        numField("Height from the floor (mm)", hw.height ?? 250, (v) => setHand({ height: Math.max(0, Math.round(v)) }), { step: 10, min: 0 }),
        el("div", { class: "empty small", text: "Runs the full length of the lounge, against the wall." }),
      ] : []),
    ] : []),
    // The older parallel-only cut-out: shown only while a job still has it on, so it can be turned off.
    ...(style === "PARALLEL" && p.wheelAvoidanceEnabled === true ? [
      check("Old cut-out (middle gap)", p.wheelAvoidanceEnabled === true, (on) => setP("wheelAvoidanceEnabled", on, "wheel"), "The earlier parallel-only cut-out. Use By hand (full width) instead."),
      ...(p.wheelAvoidanceEnabled === true ? [
        numField("Wheel arch depth (mm)", p.avoidanceDepth ?? 300, (v) => setP("avoidanceDepth", Math.max(0, Math.round(v)), "wheel"), { step: 10, min: 0 }),
        numField("Wheel arch height (mm)", p.avoidanceHeight ?? 250, (v) => setP("avoidanceHeight", Math.max(0, Math.round(v)), "wheel"), { step: 10, min: 0 }),
      ] : []),
    ] : []),
  ]);

  // Cabinet-level fields, folded.
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Lounge · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box)", outerSizeFields(cab, mod, env, p, { logKind: "lounge.size" })),
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
      el("div", { class: "zs-hint", text: "Click a run to select it · drag an orange edge · click a number to type it · Shift = 1 mm · the wall side stays" }),
    ]),
    runCard,
    shape,
    loungeWheel,
    fold,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
