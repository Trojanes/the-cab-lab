// @module panel @owns renderTallFridge — tallFridge.* cut-out, editable front view, presets
// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { FRIDGE_BELOW_TYPES, FRIDGE_ZONE_LABEL, MIN_ZONE_HEIGHT, fridgeFix, fridgeParts, fridgeRuleIssues, getModule } from "../modules.js";
import { applyYield, conflictLines, declineYield, noteGrowth } from "../yield.js";
import { cabinetHits } from "../fit.js";
import { localAxes, keepCorner } from "../pose.js";
import { thickness } from "../materials.js";
import { el, doorLine, grainIssueLines, numField, section, frontSection, kv, panel, repaint, gapMode, outerSizeFields, cabinetBox } from "./widgets.js";
// --- tall fridge cabinet editor -----------------------------------------------------------
//
// The fridge's cut-out is fixed and everything follows it: the outer width is
// cut-out + side panel + three stiles (read-only here), and a side panel's
// stock moves the outer width, never the opening — on the side that shows, the
// other face stays (job.setParams → widthAnchor). Bottom → top: drawers and
// down flaps, the fridge, then nothing, an up flap or a fixed panel. Growing
// into a neighbour asks whether it should give way (renderer/yield.js).

const fridgeSel = { cabId: null, zoneId: null };
let fridgeDrag = null; // { cabId, refresh } while a front-view boundary is dragged

function fridgeSelected(cabId) {
  if (fridgeSel.cabId !== cabId) { fridgeSel.cabId = cabId; fridgeSel.zoneId = null; }
  return fridgeSel.zoneId;
}

export function renderTallFridge(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const zones = p.zones || [];
  const { below, fridge, above } = fridgeParts(zones);
  const aboveZone = above[0] || null;
  const cpt = p.panelThickness ?? thickness(job.getStock(), "carcass");
  const fpt = p.frontPanelThickness ?? thickness(job.getStock(), "door");
  const ziT = p.ziThickness ?? 15;
  const lt = p.leftSidePanelThickness ?? 0;
  const rt = p.rightSidePanelThickness ?? 0;
  const selectedZoneId = fridgeSelected(cab.id);
  const clone = () => zones.map((z) => ({ ...z }));
  const freshZoneId = () => {
    let n = zones.length + 1;
    while (zones.some((z) => z.id === `zone-${n}`)) n += 1;
    return `zone-${n}`;
  };

  // One edit = one undo step. The width may follow (side panel, cut-out); growing into a neighbour asks it to give way.
  const commit = (next, kind, extra = {}) => {
    const fromPose = { ...cab.pose };
    const before = cabinetHits(cab);
    job.setParams(cab.id, next);
    const now = job.getJob().cabinets.find((c) => c.id === cab.id);
    if (!now) return;
    const to = mod.envelope(now.params);
    const moved = JSON.stringify(now.pose) !== JSON.stringify(fromPose);
    log(`tallFridge.${kind}`, { id: cab.id, ...extra, from: env, to, ...(moved ? { fromPose, toPose: now.pose } : {}) });
    const axes = localAxes(now.pose);
    const grow = to.W > env.W + 1e-6
      ? axes[mod.widthAnchor(now.params, now) > 0 ? 1 : 0] // the free side face moved out
      : to.H > env.H + 1e-6 ? axes[4] : null;
    if (grow) noteGrowth(now, before, grow.map((v) => Math.round(v)), kind);
  };

  // --- neighbour yield prompt ---
  const conflict = job.getConflict();
  const mine = conflict && conflict.sourceId === cab.id ? conflict : null;
  const canYield = mine ? mine.neighbours.filter((n) => n.ok) : [];
  const yieldCard = mine && !mine.declined ? el("div", { class: "panel-section" }, [
    el("div", { class: "sec-title", text: "Neighbours in the way" }),
    ...mine.neighbours.map((n) => el("div", { class: "msg err", text: n.ok
      ? `This fridge cabinet changed size and now runs ${n.by} mm into ${n.id} (${getModule(n.moduleId).label}). Pull its ${n.label} back ${n.by} mm?`
      : `It runs ${n.by} mm into ${n.id} (${getModule(n.moduleId).label}), which cannot give way: ${n.reason}. Move or resize it by hand.` })),
    el("div", { class: "zs-tools" }, [
      canYield.length ? el("button", { class: "tb primary", text: canYield.length > 1 ? `Yes, adjust all ${canYield.length}` : `Yes, adjust ${canYield[0].id}`, onclick: () => applyYield() }) : null,
      el("button", { class: "tb", text: canYield.length ? "No" : "OK", onclick: () => declineYield() }),
    ].filter(Boolean)),
  ]) : null;

  // --- front view (same drawing as the storage tall; the fridge's own edges do not move) ---
  if (fridgeDrag && fridgeDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    fridgeDrag.refresh();
    return;
  }
  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneId: fridgeSelected(cab.id), gaps: gapMode, editable: true }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  };
  drawFront();
  // The number beside a zone is its clearance or centre distance (the dropdown); typing it moves the
  // stored height by the difference. The fridge's own height is its cut-out and is not typed here.
  const editZoneHeight = (dim) => {
    if (front.querySelector(".col-dim-input")) return;
    const id = dim.getAttribute("data-zone");
    const shown = Number(gapMode === "center" ? dim.dataset.center : dim.dataset.clear);
    if (!id || !Number.isFinite(shown)) return;
    const box = dim.getBoundingClientRect();
    const host = front.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "number";
    input.className = "col-dim-input";
    input.step = "1";
    input.value = String(shown);
    input.style.left = `${box.left - host.left + 30}px`;
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
      const z = zones.find((zz) => zz.id === id);
      if (apply && z) setShownHeight(z, typed, "front view");
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  };
  front.addEventListener("click", (e) => {
    if (fridgeDrag) return;
    const dim = e.target.closest?.(".zone-dim.editable");
    if (dim) {
      e.stopPropagation();
      editZoneHeight(dim);
      return;
    }
    if (e.target.closest?.(".zone-dim")) return;
    const zoneEl = e.target.closest?.("[data-zone]");
    if (!zoneEl) return;
    const id = zoneEl.getAttribute("data-zone");
    fridgeSel.cabId = cab.id;
    fridgeSel.zoneId = fridgeSel.zoneId === id ? null : id;
    log("tallFridge.zone.select", { id: cab.id, zone: fridgeSel.zoneId });
    repaint();
  });
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    const svg = front.querySelector("svg");
    if (!g || !svg || e.button !== 0 || g.getAttribute("data-boundary") !== "zone") return;
    e.preventDefault();
    e.stopPropagation();
    const index = Number(g.getAttribute("data-index") || 0);
    const params0 = cab.params;
    const result0 = job.resultFor(cab.id);
    const from = params0.zones.map((z) => z.height);
    const before = job.snapshot();
    const toMm = (clientY) => {
      const s = front.querySelector("svg");
      const rect = s.getBoundingClientRect();
      const k = Number(s.getAttribute("width")) / rect.width;
      return Number(s.dataset.h) - ((clientY - rect.top) * k - Number(s.dataset.oy)) / Number(s.dataset.scale);
    };
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    front.classList.add("dragging");
    g.classList.add("active");
    fridgeDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(toMm(ev.clientY) / step) * step;
      job.setParams(cab.id, mod.setDivider(params0, result0, index, v), { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      front.classList.remove("dragging");
      fridgeDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("tallFridge.zone.drag", { id: cab.id, boundary: "zone", index, from, to: now ? now.params.zones.map((z) => z.height) : null, changed, where: "front view" });
      repaint();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  // --- the fridge: cut-out, the width it gives ---
  const setCutOut = (key, v) => {
    const next = clone();
    const f = next.find((z) => z.type === "fridge");
    if (!f) return;
    f[key] = Math.max(key === "applianceHeightMm" ? MIN_ZONE_HEIGHT : 0, Math.round(v));
    commit(fridgeFix({ ...p, zones: next }), "cutout", { key, value: f[key] });
  };
  const opening = result?.params?.fridgeOpening;
  const fridgeSec = fridge ? section("Fridge cut-out", [
    numField("Width (mm)", fridge.applianceWidthMm ?? 0, (v) => setCutOut("applianceWidthMm", v), { step: 1, min: 0 }),
    numField("Height (mm)", fridge.applianceHeightMm ?? fridge.height, (v) => setCutOut("applianceHeightMm", v), { step: 1, min: MIN_ZONE_HEIGHT }),
    numField("Depth (mm)", fridge.applianceDepthMm ?? 0, (v) => setCutOut("applianceDepthMm", v), { step: 1, min: 0 }),
    kv("Outer width", `${env.W} = ${fridge.applianceWidthMm ?? "?"} cut-out + 3 × ${cpt} stiles + ${lt + rt} side panel`),
    opening != null ? kv("Opening", `${opening} between the stiles`) : null,
    el("div", { class: "empty small", text: "The maker's cut-out, not the fridge body. The opening is exactly this wide; the cabinet width follows." }),
  ].filter(Boolean)) : null;

  // --- side panel: one side, carcass or door stock ---
  const sideNow = lt > 0 ? "left" : rt > 0 ? "right" : "none";
  const matNow = (sideNow === "left" ? p.leftSidePanelFinish : p.rightSidePanelFinish) === "colour" ? "colour" : "carcass";
  const setSide = (side, mat) => {
    if (side === sideNow && (side === "none" || mat === matNow)) return;
    const t = side === "none" ? 0 : mat === "colour" ? fpt : cpt;
    const next = {
      ...p,
      leftSidePanelThickness: side === "left" ? t : 0,
      rightSidePanelThickness: side === "right" ? t : 0,
      leftSidePanelFinish: side === "left" ? mat : "carcass",
      rightSidePanelFinish: side === "right" ? mat : "carcass",
    };
    commit(fridgeFix(next), "side", { from: { side: sideNow, finish: matNow, thickness: lt + rt }, to: { side, finish: mat, thickness: t } });
  };
  const seg = (options, now, onPick, disabled = false) => el("div", { class: "seg-group" }, options.map(([id, text, title]) => el("button", {
    type: "button", class: `tb seg${now === id ? " active" : ""}`, text, title, disabled,
    onclick: () => onPick(id),
  })));
  const sideSec = section("Side panel", [
    el("label", { class: "field" }, [el("span", { text: "Side" }), seg([["none", "None"], ["left", "Left"], ["right", "Right"]], sideNow, (s) => setSide(s, matNow))]),
    el("label", { class: "field" }, [el("span", { text: "Stock" }), seg([
      ["carcass", "Carcass", `Carcass stock ${cpt} mm, White Stipple outside`],
      ["colour", "Door", `Door stock ${fpt} mm, door colour outside`],
    ], sideNow === "none" ? null : matNow, (m) => setSide(sideNow, m), sideNow === "none")]),
    el("div", { class: "empty small", text: `Carcass ${cpt} or door ${fpt} mm, on the side that shows. Its front edge is banded in the door colour either way. Changing the stock moves that side face; the other face stays.` }),
  ]);

  // --- above the fridge: nothing, an up flap or a fixed panel (later: microwave) ---
  const setAbove = (type) => {
    const now = aboveZone ? aboveZone.type : "none";
    if (type === now) return;
    let next;
    if (type === "none") {
      next = fridgeFix({ ...p, zones: zones.filter((z) => z !== aboveZone) }, { H: env.H - aboveZone.height - ziT });
    } else if (aboveZone) {
      next = { ...p, zones: zones.map((z) => (z === aboveZone ? { ...z, type } : z)) };
    } else {
      const zone = { id: freshZoneId(), type, height: 300, ...(type === "top_flap" ? { lockPosition: "bottom" } : {}) };
      next = fridgeFix({ ...p, zones: [...zones, zone] }, { H: env.H + zone.height + ziT });
    }
    commit(next, "above", { from: now, to: type });
  };
  const setAboveHeight = (v, extra = {}) => {
    const h = Math.max(MIN_ZONE_HEIGHT, Math.round(v));
    const next = zones.map((z) => (z === aboveZone ? { ...z, height: h } : z));
    commit(fridgeFix({ ...p, zones: next }, { H: env.H + h - aboveZone.height }), "above", { zone: aboveZone.id, height: h, ...extra });
  };

  // Heights as the front view reads them: clearance (face to face) or centre to centre, from the
  // emitted boards. A typed reading moves the stored height by the same difference. No reading
  // (checks failing) falls back to the stored height, labelled as such.
  const openings = typeof mod.zoneOpenings === "function" ? mod.zoneOpenings(result) : [];
  const readOf = (id) => openings.find((o) => o.id === id) || null;
  const shownHeight = (z) => {
    const o = readOf(z.id);
    return o ? (gapMode === "center" ? o.center : o.clear) : z.height;
  };
  const heightWord = openings.length ? (gapMode === "center" ? "Centre height" : "Clear height") : "Height";
  const setShownHeight = (z, typed, where) => {
    const shown = shownHeight(z);
    if (!Number.isFinite(typed) || Math.abs(typed - shown) < 0.05) { repaint(); return; }
    const h = Math.round(z.height + (typed - shown));
    if (h < MIN_ZONE_HEIGHT) {
      log("tallFridge.zone.blocked", { id: cab.id, zone: z.id, reason: `a zone stays at least ${MIN_ZONE_HEIGHT} mm`, typed, mode: gapMode, where });
      repaint(); // the field goes back to the value the cabinet still has
      return;
    }
    const extra = { mode: gapMode, shown: typed, where };
    if (aboveZone && z.id === aboveZone.id) setAboveHeight(h, extra);
    else setBelow(z.id, { height: h }, "below.height", extra);
  };
  const aboveSec = section("Above the fridge", [
    seg([["none", "None", "The fridge runs up to the top system"], ["top_flap", "Up flap"], ["fixed_panel", "Fixed panel", "A front that does not open (later: a microwave)"]], aboveZone ? aboveZone.type : "none", setAbove),
    aboveZone ? numField(`${heightWord} (mm)`, shownHeight(aboveZone), (v) => setShownHeight(aboveZone, Number(v), "above field"), { step: 1, min: 0 }) : null,
    el("div", { class: "empty small", text: "Only an up flap or a fixed panel: nobody reaches a drawer above a fridge. Adding one makes the cabinet taller by its height and the board on the fridge." }),
  ].filter(Boolean));

  // --- below the fridge: drawers and down flaps, listed from the fridge down ---
  const setBelow = (id, patch, kind, extra = {}) => {
    const next = zones.map((z) => (z.id === id ? { ...z, ...patch } : z));
    commit(fridgeFix({ ...p, zones: next }, patch.height != null ? { except: id } : {}), kind, { zone: id, ...extra, ...patch });
  };
  const belowRows = below.slice().reverse().map((z) => el("div", { class: `zone-row${z.id === selectedZoneId ? " sel" : ""}` }, [
    el("span", { class: "zone-idx", text: String(below.indexOf(z) + 1), title: "Zone number from the floor" }),
    el("select", { onchange: (e) => { e.target.blur(); setBelow(z.id, { type: e.target.value }, "below.type"); } },
      FRIDGE_BELOW_TYPES.map((t) => el("option", { value: t, text: FRIDGE_ZONE_LABEL[t], selected: t === z.type }))
        .concat(FRIDGE_BELOW_TYPES.includes(z.type) ? [] : [el("option", { value: z.type, text: `${z.type} (not allowed here)`, selected: true, disabled: true })])),
    (() => {
      const shown = shownHeight(z);
      const input = el("input", { type: "number", value: shown, step: 1, min: 0, title: `${heightWord} (mm) — the same reading as the front view` });
      input.addEventListener("change", () => {
        const v = Number(input.value);
        if (!Number.isFinite(v)) { input.value = shown; return; }
        setShownHeight(z, v, "below row");
      });
      return input;
    })(),
    el("button", { class: "icon", title: "Remove this zone", text: "×", onclick: () => {
      commit(fridgeFix({ ...p, zones: zones.filter((zz) => zz.id !== z.id) }), "below.remove", { zone: z.id });
    } }),
  ]));
  const addBelow = el("button", { class: "tb", text: "+ Add drawer", title: "A drawer on the floor; the zone that takes height changes gives the room", onclick: () => {
    const zone = { id: freshZoneId(), type: "drawer", height: 200, lockPosition: "top" };
    commit(fridgeFix({ ...p, zones: [zone, ...zones] }), "below.add", { zone: zone.id });
  } });
  const belowSec = section("Below the fridge · from the fridge down", [
    el("div", { class: "empty small", text: `Type · ${heightWord.toLowerCase()} (mm)${openings.length ? ", as the front view reads it" : ""}` }),
    ...belowRows,
    addBelow,
    el("div", { class: "empty small", text: "Drawers and down flaps. A drawer right under the fridge carries the fridge base." }),
  ]);

  // --- preset ---
  const presetNow = mod.presetOf(p);
  const presetSec = (mod.presets || []).length ? section("Preset", [el("label", { class: "field wide-value" }, [
    el("span", { text: "Cabinet" }),
    el("select", {
      onchange: (e) => {
        const id = e.target.value;
        e.target.blur();
        if (!id) return;
        // The back stays on the wall. The side away from the side panel stays too. The front moves.
        const next = mod.applyPreset(p, id);
        const corner = { x: mod.widthAnchor(next, cab), y: 1, z: -1 };
        const fromPose = { ...cab.pose };
        const pose = keepCorner(fromPose, cabinetBox(mod, p), cabinetBox(mod, next), corner);
        job.setParams(cab.id, next);
        job.setPose(cab.id, pose, { history: false });
        const now = job.getJob().cabinets.find((c) => c.id === cab.id);
        log("tallFridge.preset", {
          id: cab.id, preset: id, from: env, to: now ? mod.envelope(now.params) : null,
          corner, fromPose, toPose: pose,
        });
      },
    }, [
      el("option", { value: "", text: "Custom", selected: !presetNow }),
      ...mod.presets.map((pr) => el("option", { value: pr.id, text: pr.label, selected: pr.id === presetNow })),
    ]),
  ])]) : null;

  // --- checks: generator, the fridge-cabinet rules (a tall saved before the split may break them), neighbours ---
  const errors = [...(result?.validation?.errors || []), ...grainIssueLines(result), ...(mine && mine.declined ? conflictLines() : [])];
  const warnings = [...fridgeRuleIssues(p), ...(result?.validation?.warnings || [])];
  const checks = errors.length || warnings.length ? el("div", { class: "panel-section" }, [
    el("div", { class: "sec-title", text: "Checks" }),
    ...errors.map((m) => el("div", { class: "msg err", text: m })),
    mine && mine.declined && canYield.length ? el("button", { class: "tb", text: "Auto-fix the neighbours", onclick: () => applyYield() }) : null,
    ...warnings.map((m) => el("div", { class: "msg warn", text: m })),
  ].filter(Boolean)) : null;

  // --- cabinet-level fields, folded ---
  const top = p.topSystem || {};
  const setTop = (style) => {
    if (style === (top.style || "style_1")) return;
    const topSystem = style === "style_2" ? { style: "style_2", height: 101 } : { style: "style_1", frontRailHeight: 40 };
    commit(fridgeFix({ ...p, topSystem }), "top", { from: top.style, to: style });
  };
  const setNested = (group, key) => (v) => commit(fridgeFix({ ...p, [group]: { ...(p[group] || {}), [key]: v } }), "system", { group, key, value: v });
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${zones.length} zones · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box)", [
      numField("Width (mm)", env.W, () => {}, { readOnly: "From the fridge cut-out and the side panel" }),
      ...outerSizeFields(cab, mod, env, p, {
        logKind: "tallFridge.size",
        show: { W: false },
        grow: true,
        finish: (next) => mod.normalizeParams ? mod.normalizeParams(next) : next,
      }),
    ]),
    section("Systems", [
      el("label", { class: "field" }, [el("span", { text: "Top" }), seg([["style_1", "Style 1 · rail"], ["style_2", "Style 2 · fixed panel"]], top.style || "style_1", setTop)]),
      top.style === "style_2"
        ? numField("Top height TCH (mm)", top.height ?? 101, setNested("topSystem", "height"), { step: 1, min: 60 })
        : numField("Top rail (mm)", top.frontRailHeight ?? 40, setNested("topSystem", "frontRailHeight"), { step: 5, min: 0 }),
      numField("Bottom rail (mm)", p.bottomSystem?.frontRailHeight ?? 53, setNested("bottomSystem", "frontRailHeight"), { step: 5, min: 0 }),
      numField("Front clearance (mm)", p.frontHardware?.frontClearance ?? 2.5, setNested("frontHardware", "frontClearance"), { step: 0.5, min: 0 }),
    ]),
    section("Position", [
      numField("X (mm)", cab.pose.x, setPose("x"), { min: -1e6 }),
      numField("Y (mm)", cab.pose.y, setPose("y"), { min: -1e6 }),
    ]),
    section("Material (job stock)", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: `${p.carcassColorName || p.carcassColor || "White Stipple"} · ${cpt} mm` })]),
      doorLine(p, fpt),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Fridge cabinet" }),
      el("div", { class: "panel-sub", text: `${cab.id} · cut-out ${fridge ? `${fridge.applianceWidthMm} × ${fridge.applianceHeightMm}` : "—"} · ${result?.boards?.length || 0} boards` }),
      el("div", { class: "panel-sizes" }, [
        numField("Width (mm)", env.W, () => {}, { readOnly: "From the fridge cut-out and the side panel" }),
        ...outerSizeFields(cab, mod, env, p, { logKind: "tallFridge.size", show: { W: false }, grow: true }),
      ]),
    ]),
    yieldCard,
    shared.board,
    frontSection(`Front view · from the room · ${zones.length} zone${zones.length === 1 ? "" : "s"} bottom → top`, [
      front,
      el("div", { class: "zs-hint", text: "Click a zone to select it · drag an orange line between two zones under the fridge · Shift = 1 mm" }),
    ]),
    fridgeSec,
    sideSec,
    aboveSec,
    belowSec,
    presetSec,
    section("LED", [
      el("label", { class: "field check", title: "Style 1 cuts the T3 top and the B3 underside. Style 2 has no T3, so only B3 is cut. The main channel is 14.5 × 6.5, 18 mm behind the front edge. Each branch is centred 30 mm from the board end, so its near wall is 22.75 mm from that edge — the same as a kitchen B3 — and runs back to the rear edge." }, [
        el("span", { text: "LED channels" }),
        el("input", { type: "checkbox", checked: p.ledGroove === true, onchange: (e) => {
          const to = e.target.checked;
          if ((p.ledGroove === true) === to) return;
          commit({ ...p, ledGroove: to }, "led", { from: p.ledGroove === true, to });
        } }),
      ]),
    ]),
    fold,
    shared.grain,
    checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
