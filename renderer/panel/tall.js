// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { MIN_ZONE_HEIGHT } from "../modules.js";
import { envelopeBox } from "../fit.js";
import { keepCorner } from "../pose.js";
import { thickness } from "../materials.js";
import { el, doorLine, numField, section, frontSection, kv, panel, repaint, gapMode, outerSizeFields } from "./widgets.js";
// --- tall cabinet editor --------------------------------------------------------------
//
// Wide page while a general tall cabinet is selected: the generator's 2D front
// elevation (zones stack bottom → top between the bottom and top systems; click
// a zone to select it, drag an orange boundary to trade height with the zone
// above — 10 mm steps, Shift = 1 mm), a card for the selected zone, and the
// cabinet-level fields folded below. A double_door zone's vertical divider is
// an x-axis drag on the same view. Every edit is one undo step; a boundary drag
// commits once on release.

const tallSel = { cabId: null, zoneId: null }; // zone selection, kept across re-renders
let tallDrag = null; // { cabId, refresh } while a front-view boundary is dragged

function tallSelected(cabId) {
  if (tallSel.cabId !== cabId) { tallSel.cabId = cabId; tallSel.zoneId = null; }
  return tallSel.zoneId;
}

export function renderTall(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const zones = p.zones || [];
  const cpt = p.panelThickness ?? thickness(job.getStock(), "carcass");
  const fpt = p.frontPanelThickness ?? thickness(job.getStock(), "door");
  const selectedZoneId = tallSelected(cab.id);
  const zoneItems = (result?.stack || []).filter((it) => it.kind === "functional_zone");

  const setZones = (next, kind, extra = {}) => {
    job.setParams(cab.id, { ...p, zones: next });
    log(`tall.zone.${kind}`, { id: cab.id, heights: next.map((z) => z.height), types: next.map((z) => z.type), ...extra });
  };

  // Side panels: none, carcass (carcass stock) or a colour panel (door stock, door colour outside).
  // The thickness follows the choice; the outer width stays and the carcass between gets narrower.
  const sideMode = (side) => {
    if (!((p[`${side}SidePanelThickness`] ?? 0) > 0)) return "none";
    return p[`${side}SidePanelFinish`] === "colour" ? "colour" : "carcass";
  };
  const setSide = (side, mode) => {
    const from = sideMode(side);
    if (from === mode) return;
    const t = mode === "none" ? 0 : mode === "colour" ? fpt : cpt;
    job.setParams(cab.id, { ...p, [`${side}SidePanelThickness`]: t, [`${side}SidePanelFinish`]: mode === "colour" ? "colour" : "carcass" });
    log("tall.side", { id: cab.id, side, from, to: mode, thickness: t });
  };
  const lt = p.leftSidePanelThickness ?? 0;
  const rt = p.rightSidePanelThickness ?? 0;
  const tallSides = section("Side panels", [
    ...["left", "right"].map((side) => el("label", { class: "field" }, [
      el("span", { text: side === "left" ? "Left" : "Right" }),
      el("div", { class: "seg-group" }, [["none", "None"], ["carcass", "Carcass"], ["colour", "Colour panel"]].map(([mode, text]) => el("button", {
        type: "button",
        class: `tb seg${sideMode(side) === mode ? " active" : ""}`,
        text,
        title: mode === "colour" ? `Door stock ${fpt} mm, door colour outside` : mode === "carcass" ? `Carcass stock ${cpt} mm` : "No side panel",
        onclick: () => setSide(side, mode),
      }))),
    ])),
    kv("Inside the side panels", `${Math.round((env.W - lt - rt) * 10) / 10} = ${env.W} − ${lt} − ${rt}`),
    el("div", { class: "empty small", text: "The outer width stays: a side panel takes its thickness from the inside. The front edge is always banded in the door colour." }),
  ]);

  // Preset: a named cabinet from the generator's presets.json; applying it replaces every param but the colours.
  const presetNow = mod.presetOf(p);
  const tallPreset = (mod.presets || []).length ? section("Preset", [el("label", { class: "field wide-value" }, [
    el("span", { text: "Cabinet" }),
    el("select", {
      onchange: (e) => {
        const id = e.target.value;
        e.target.blur();
        if (!id) return;
        // The new size grows from the corner the box was drawn from (else the back-left floor corner); the fronts keep facing the same way.
        const next = mod.applyPreset(p, id);
        const corner = cab.placeCorner || { x: -1, y: 1, z: -1 };
        const fromPose = { ...cab.pose };
        const pose = keepCorner(cab.pose, envelopeBox(cab, result), envelopeBox({ ...cab, params: next }, null), corner);
        job.setParams(cab.id, next);
        job.setPose(cab.id, pose, { history: false });
        const now = job.getSelected();
        log("tall.preset", { id: cab.id, preset: id, from: env, to: now ? mod.envelope(now.params) : null, corner, stored: !!cab.placeCorner, fromPose, toPose: pose });
      },
    }, [
      el("option", { value: "", text: "Custom", selected: !presetNow }),
      ...mod.presets.map((pr) => el("option", { value: pr.id, text: pr.label, selected: pr.id === presetNow })),
    ]),
  ])]) : null;

  // A drag in progress: redraw the SVG in place and keep the container (and its pointer capture) alive.
  if (tallDrag && tallDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    tallDrag.refresh();
    return;
  }

  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneId: tallSelected(cab.id), gaps: gapMode }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  };
  drawFront();

  // Zone selection: one click on a zone row. Boundary drag: pointer down on a boundary group.
  front.addEventListener("click", (e) => {
    if (tallDrag) return;
    const zoneEl = e.target.closest?.("[data-zone]");
    if (!zoneEl) return;
    const id = zoneEl.getAttribute("data-zone");
    tallSel.cabId = cab.id;
    tallSel.zoneId = tallSel.zoneId === id ? null : id;
    log("tall.zone.select", { id: cab.id, zone: tallSel.zoneId });
    repaint();
  });
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    const svg = front.querySelector("svg");
    if (!g || !svg || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = g.getAttribute("data-boundary"); // "zone" | "divider"
    const axis = g.getAttribute("data-axis");
    const index = Number(g.getAttribute("data-index") || 0);
    const dragZoneId = g.getAttribute("data-zone");
    const params0 = cab.params;
    const result0 = job.resultFor(cab.id);
    const from = kind === "divider"
      ? (params0.zones || []).find((z) => z.id === dragZoneId)?.dividerCenterX
      : (result0?.stack || []).filter((it) => it.kind === "functional_zone")[index]?.z1;
    const before = job.snapshot();
    // mm ↔ px: the SVG carries its own mapping; the container may be scaled to the panel width.
    const toMm = (clientX, clientY) => {
      const s = front.querySelector("svg");
      const rect = s.getBoundingClientRect();
      const k = Number(s.getAttribute("width")) / rect.width;
      const scale = Number(s.dataset.scale);
      const ox = Number(s.dataset.ox);
      const oy = Number(s.dataset.oy);
      const H = Number(s.dataset.h);
      return axis === "x" ? ((clientX - rect.left) * k - ox) / scale : H - ((clientY - rect.top) * k - oy) / scale;
    };
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    front.classList.add("dragging");
    g.classList.add("active");
    tallDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(toMm(ev.clientX, ev.clientY) / step) * step;
      // The divider centre is stored from the left side panel's inner face; the view is in cabinet x.
      const next = kind === "divider"
        ? mod.setDividerCenter(params0, dragZoneId, v - (params0.leftSidePanelThickness ?? 0))
        : mod.setDivider(params0, result0, index, v);
      job.setParams(cab.id, next, { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      front.classList.remove("dragging");
      tallDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("tall.zone.drag", {
        id: cab.id, boundary: kind, index: kind === "zone" ? index : undefined, zone: kind === "divider" ? dragZoneId : undefined,
        from, to: now ? (kind === "divider" ? now.params.zones?.find((z) => z.id === dragZoneId)?.dividerCenterX : now.params.zones?.map((z) => z.height)) : null,
        changed, where: "front view",
      });
      repaint();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  // Zone toolbar: add / remove keep the stack's total (a neighbour gives or takes the room).
  const zi = zones.findIndex((z) => z.id === selectedZoneId);
  const addZone = el("button", { class: "tb", text: "+ Add zone", title: "A new open zone on top, taken from the tallest zone", onclick: () => {
    const next = zones.map((z) => ({ ...z }));
    const tallest = next.reduce((a, b) => (b.height > a.height ? b : a), next[0]);
    const take = Math.min(300, (tallest?.height ?? 0) - MIN_ZONE_HEIGHT);
    if (take < MIN_ZONE_HEIGHT) { log("tall.zone.blocked", { id: cab.id, reason: `no zone can give ${MIN_ZONE_HEIGHT} mm` }); return; }
    tallest.height = Math.round((tallest.height - take) * 10) / 10;
    const zone = { id: `zone-${Date.now().toString(36)}`, type: "open_space", height: take };
    next.push(zone);
    tallSel.zoneId = zone.id;
    setZones(next, "add", { zone: zone.id, from: tallest.id });
  } });
  const removeZone = el("button", { class: "tb danger", text: "Remove", disabled: zi < 0 || zones.length <= 1, title: "The zone below (or above) takes its height", onclick: () => {
    const z = zones[zi];
    const next = zones.filter((_, k) => k !== zi).map((zz) => ({ ...zz }));
    const heir = next[Math.max(0, zi - 1)];
    if (heir) heir.height = Math.round((heir.height + z.height) * 10) / 10;
    tallSel.zoneId = null;
    setZones(next, "remove", { removed: z.id, heir: heir?.id });
  } });

  // Selected zone card.
  let zoneCard = null;
  if (zi >= 0) {
    const z = zones[zi];
    const row = zoneItems.find((it) => it.zoneId === z.id);
    const neighbour = zi < zones.length - 1 ? zi + 1 : zi - 1;
    const type = el("select", {
      onchange: (e) => {
        const next = zones.map((zz) => ({ ...zz }));
        next[zi].type = e.target.value;
        e.target.blur();
        setZones(next, "type", { zone: z.id, type: e.target.value });
      },
    }, mod.zoneTypes.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.type })));
    const check = (text, on, onChange, title) => el("label", { class: "field check", title }, [
      el("span", { text }),
      el("input", { type: "checkbox", checked: on, onchange: (e) => onChange(e.target.checked) }),
    ]);

    const fields = [
      el("label", { class: "field wide-value" }, [el("span", { text: "Type" }), type]),
      row ? kv("From floor", `${Math.round(row.z0)} – ${Math.round(row.z1)} mm`) : null,
      numField("Height (mm)", z.height, (v) => {
        // The neighbour above (or below for the last zone) absorbs the difference.
        const val = Math.max(MIN_ZONE_HEIGHT, Math.round(v));
        if (neighbour < 0) return;
        const next = zones.map((zz) => ({ ...zz }));
        const delta = val - next[zi].height;
        if (next[neighbour].height - delta >= MIN_ZONE_HEIGHT) {
          next[zi].height = val;
          next[neighbour].height = Math.round((next[neighbour].height - delta) * 10) / 10;
          setZones(next, "height", { zone: z.id, height: val });
        }
      }, { step: 10, min: MIN_ZONE_HEIGHT }),
    ];
    if (z.type === "double_door") {
      fields.push(check("Vertical divider", z.verticalDivider === true, (on) => {
        const next = zones.map((zz) => ({ ...zz }));
        next[zi].verticalDivider = on;
        setZones(next, "divider", { zone: z.id, on });
      }, "A standing board between the two leaves; shelves split left / right"));
      if (z.verticalDivider === true) {
        const mw = (result?.params?.midWidth ?? env.W) || env.W;
        const field = numField("Divider centre (mm)", z.dividerCenterX ?? Math.round(mw / 2), (v) => {
          job.setParams(cab.id, mod.setDividerCenter(p, z.id, Math.round(v)));
          log("tall.zone.divider", { id: cab.id, zone: z.id, to: v });
        }, { step: 10, min: 0 });
        field.title = `From the left side panel's inner face · interior ${Math.round(mw)} wide · or drag the dashed line`;
        fields.push(field);
      }
    }
    if (z.type !== "drawer" && z.type !== "blank_panel") {
      fields.push(check("Shelf", z.shelfEnabled === true, (on) => {
        const next = zones.map((zz) => ({ ...zz }));
        next[zi].shelfEnabled = on;
        setZones(next, "shelf", { zone: z.id, on });
      }));
      if (z.shelfEnabled === true) {
        fields.push(numField("Shelf top above zone (mm)", z.shelfHeight ?? Math.round(z.height / 2), (v) => {
          const next = zones.map((zz) => ({ ...zz }));
          next[zi].shelfHeight = Math.max(0, Math.min(z.height, Math.round(v)));
          setZones(next, "shelfHeight", { zone: z.id });
        }, { step: 10, min: 0 }));
      }
    }
    zoneCard = section(`Zone ${zi + 1} of ${zones.length} · from the floor · ${mod.zoneTypes.find((t) => t.id === z.type)?.label ?? z.type}`, fields.filter(Boolean));
  }

  // Cabinet-level fields, folded.
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });
  const setNested = (group, key) => (v) => job.setParams(cab.id, { ...p, [group]: { ...(p[group] || {}), [key]: v } });
  const sizes = () => outerSizeFields(cab, mod, env, p, { logKind: "tall.size" });
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${zones.length} zones · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box)", sizes()),
    section("Systems", [
      numField("Top rail (mm)", p.topSystem?.frontRailHeight ?? 40, setNested("topSystem", "frontRailHeight"), { step: 5, min: 0 }),
      numField("Bottom rail (mm)", p.bottomSystem?.frontRailHeight ?? 53, setNested("bottomSystem", "frontRailHeight"), { step: 5, min: 0 }),
      numField("Front clearance (mm)", p.frontHardware?.frontClearance ?? 2.5, setNested("frontHardware", "frontClearance"), { step: 0.5, min: 0 }),
    ]),
    section("Position", [
      numField("X (mm)", cab.pose.x, setPose("x"), { min: -1e6 }),
      numField("Y (mm)", cab.pose.y, setPose("y"), { min: -1e6 }),
      numField("Rotation (°)", cab.pose.rotZ || 0, (v) => job.setPose(cab.id, { rotZ: ((Math.round(v / 90) * 90) % 360 + 360) % 360 }), { step: 90, min: -1e6 }),
    ]),
    section("Material (job stock)", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: `${p.carcassColorName || p.carcassColor || "White Stipple"} · ${cpt} mm` })]),
      doorLine(p, fpt),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${zones.length} zones · ${result?.boards?.length || 0} boards` }),
      el("div", { class: "panel-sizes" }, outerSizeFields(cab, mod, env, p, { logKind: "tall.size" })),
    ]),
    shared.board,
    frontSection(`Front view · from the room · ${zones.length} zone${zones.length === 1 ? "" : "s"} bottom → top`, [
      el("div", { class: "zs-tools" }, [addZone, removeZone]),
      front,
      el("div", { class: "zs-hint", text: "Click a zone to select it · drag an orange line (height) or the dashed one (divider) · Shift = 1 mm" }),
    ]),
    zoneCard,
    tallPreset,
    tallSides,
    fold,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
