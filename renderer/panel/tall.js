// @module panel @owns renderTall — tall.zone.* stack editor @reads result.stack
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

// zoneIds: every selected zone (Ctrl+click adds / removes); zoneId: the one zone the card edits, only while exactly one is selected.
const tallSel = { cabId: null, zoneId: null, zoneIds: [] }; // zone selection, kept across re-renders
let tallDrag = null; // { cabId, refresh } while a front-view boundary is dragged

function tallSelected(cabId) {
  if (tallSel.cabId !== cabId) { tallSel.cabId = cabId; tallSel.zoneId = null; tallSel.zoneIds = []; }
  return tallSel.zoneId;
}
function tallSelectedIds(cabId) {
  tallSelected(cabId);
  return tallSel.zoneIds;
}
function tallSelect(cabId, ids) {
  tallSel.cabId = cabId;
  tallSel.zoneIds = ids.slice();
  tallSel.zoneId = ids.length === 1 ? ids[0] : null;
}

export function renderTall(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const zones = p.zones || [];
  const cpt = p.panelThickness ?? thickness(job.getStock(), "carcass");
  const fpt = p.frontPanelThickness ?? thickness(job.getStock(), "door");
  const selectedZoneId = tallSelected(cab.id);
  // Drop ids of zones that no longer exist (undo, preset).
  tallSelect(cab.id, tallSelectedIds(cab.id).filter((id) => zones.some((z) => z.id === id)));
  const selectedIds = tallSelectedIds(cab.id);
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

  // Wheel arch avoidance: one cut across the full width at the back bottom; the side panels follow it.
  // Touching a wheel arch on the floor plan turns it on and sets the size (job.js syncTallArch).
  const av = p.avoidance || {};
  const avOn = av.enabled === true;
  const avPlan = Array.isArray(av.fromPlan) && av.fromPlan.length > 0;
  const setAvoid = (patch, extra = {}) => {
    const next = { ...p, avoidance: { enabled: true, depth: av.depth > 0 ? av.depth : 200, height: av.height > 0 ? av.height : 300, ...patch }, ...extra };
    delete next.avoidance.fromPlan;
    job.setParams(cab.id, next);
    log("tall.wheel", { id: cab.id, avoidance: next.avoidance, flag: next.wheelArchAvoidance });
  };
  const tallWheel = section("Wheel arch avoidance", [
    el("label", { class: "field check", title: "Cut the back bottom of this cabinet around a wheel arch. The cut runs the full width; the side panels follow it." }, [
      el("span", { text: "Wheel arch avoidance" }),
      el("input", { type: "checkbox", checked: avOn, onchange: (e) => {
        if (e.target.checked) setAvoid({ enabled: true }, { wheelArchAvoidance: true });
        else {
          job.setParams(cab.id, { ...p, wheelArchAvoidance: false, avoidance: { enabled: false, depth: av.depth, height: av.height } });
          log("tall.wheel", { id: cab.id, on: false });
        }
      } }),
    ]),
    ...(avOn ? (avPlan ? [
      kv("From the floor plan", av.fromPlan.join(", ")),
      kv("Cut", `depth ${Math.round(av.depth)} from the back · height ${Math.round(av.height)} from the floor`),
      el("div", { class: "empty small", text: "Set by the wheel arch this cabinet stands in. Move the cabinet or edit the arch on the floor plan to change it." }),
    ] : [
      numField("Depth from the back (mm)", av.depth ?? 200, (v) => setAvoid({ depth: Math.max(0, Math.round(v)) }), { step: 10, min: 0 }),
      numField("Height from the floor (mm)", av.height ?? 300, (v) => setAvoid({ height: Math.max(0, Math.round(v)) }), { step: 10, min: 0 }),
      el("div", { class: "empty small", text: "Hand-entered. When this cabinet touches a wheel arch on the floor plan, the arch sets the size instead." }),
    ]) : [
      el("div", { class: "empty small", text: "Off. When this cabinet touches a wheel arch on the floor plan, this turns on and the back bottom is cut where it sits in the arch." }),
    ]),
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
    // The generator highlights one zone; with several selected, lay the same highlight over each.
    const svg = front.querySelector("svg");
    const ids = tallSelectedIds(cab.id);
    if (svg && ids.length > 1) {
      const before = [...svg.children].find((n) => /^(circle|text|g|line|path)$/i.test(n.tagName)) || null;
      for (const id of ids) {
        const region = [...svg.querySelectorAll("rect.region[data-zone]")].find((r) => r.getAttribute("data-zone") === id);
        if (!region) continue;
        const hl = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        for (const a of ["x", "y", "width", "height"]) hl.setAttribute(a, region.getAttribute(a));
        hl.setAttribute("pointer-events", "none");
        hl.setAttribute("fill", "#0e3f8f");
        hl.setAttribute("fill-opacity", "0.62");
        hl.setAttribute("stroke", "#d7e6ff");
        hl.setAttribute("stroke-width", "3");
        svg.insertBefore(hl, before);
      }
    }
  };
  drawFront();

  // Zone selection: click a zone; Ctrl+click adds or removes it. Boundary drag: pointer down on a boundary group.
  front.addEventListener("click", (e) => {
    if (tallDrag) return;
    const zoneEl = e.target.closest?.("[data-zone]");
    if (!zoneEl) return;
    const id = zoneEl.getAttribute("data-zone");
    const cur = tallSelectedIds(cab.id);
    if (e.ctrlKey || e.metaKey) tallSelect(cab.id, cur.includes(id) ? cur.filter((k) => k !== id) : [...cur, id]);
    else tallSelect(cab.id, cur.length === 1 && cur[0] === id ? [] : [id]);
    log("tall.zone.select", { id: cab.id, zone: tallSel.zoneId, zones: tallSel.zoneIds });
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
    tallSelect(cab.id, [zone.id]);
    setZones(next, "add", { zone: zone.id, from: tallest.id });
  } });
  const removeZone = el("button", { class: "tb danger", text: "Remove", disabled: zi < 0 || zones.length <= 1, title: "The zone below (or above) takes its height", onclick: () => {
    const z = zones[zi];
    const next = zones.filter((_, k) => k !== zi).map((zz) => ({ ...zz }));
    const heir = next[Math.max(0, zi - 1)];
    if (heir) heir.height = Math.round((heir.height + z.height) * 10) / 10;
    tallSelect(cab.id, []);
    setZones(next, "remove", { removed: z.id, heir: heir?.id });
  } });
  // Average selected height: the selected zones share their total equally (whole mm; the topmost one takes the
  // rounding). Zones not selected keep their height, so the cabinet height stays.
  const avgIdx = zones.map((z, k) => (selectedIds.includes(z.id) ? k : -1)).filter((k) => k >= 0);
  const avgTotal = avgIdx.reduce((s, k) => s + zones[k].height, 0);
  const averageHeight = el("button", {
    class: "tb",
    text: "Average selected height",
    disabled: avgIdx.length < 2,
    title: avgIdx.length < 2
      ? "Ctrl+click two or more zones in the front view first"
      : `${avgIdx.length} zones share ${Math.round(avgTotal * 10) / 10} mm equally; the other zones keep their height`,
    onclick: () => {
      if (avgIdx.length < 2) return;
      const next = zones.map((z) => ({ ...z }));
      const each = Math.floor(avgTotal / avgIdx.length);
      const top = avgIdx[avgIdx.length - 1];
      avgIdx.forEach((k) => { next[k].height = k === top ? Math.round((avgTotal - each * (avgIdx.length - 1)) * 10) / 10 : each; });
      if (avgIdx.some((k) => next[k].height < MIN_ZONE_HEIGHT)) {
        log("tall.zone.blocked", { id: cab.id, reason: `average below ${MIN_ZONE_HEIGHT} mm`, zones: avgIdx });
        return;
      }
      setZones(next, "average", { zones: avgIdx.map((k) => zones[k].id), from: avgIdx.map((k) => zones[k].height), total: avgTotal });
    },
  });

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
    if (z.type === "side_door" || z.type === "left_side_door" || z.type === "right_side_door" || z.type === "double_door") {
      // Lock: pick the board the bolt catches (as in the Fusion plugin). The slot centre is 30.5 mm from
      // that board's face, on the door edge opposite the hinge, 80 mm in.
      const stack = result?.stack || [];
      const boundaryUnder = (zoneId) => stack.find((it) => it.kind === "boundary_panel" && it.id === `boundary-${zoneId}` && it.boundaryType && it.boundaryType !== "none");
      const boardIds = new Set((result?.boards || []).map((b) => b.id));
      const aboveZone = zones[zi + 1];
      const aboveB = aboveZone ? boundaryUnder(aboveZone.id) : null;
      const belowB = boundaryUnder(z.id);
      const aboveName = aboveB ? `Zi_${aboveB.id}` : !aboveZone ? (boardIds.has("T3") ? "T3 (top insert)" : boardIds.has("TH1") ? "TH1 (top system)" : "door top edge") : "door top edge (no board)";
      const belowName = belowB ? `Zi_${belowB.id}` : zi === 0 ? (boardIds.has("B3") ? "B3 (bottom insert)" : boardIds.has("BH1") ? "BH1 (bottom system)" : "door bottom edge") : "door bottom edge (no board)";
      const hasVd = z.type === "double_door" && z.verticalDivider === true;
      const lockNow = z.lockPosition ?? "top";
      const lockOpts = [
        ["none", "No lock"],
        ["top", `Board above · ${aboveName} · 30.5 under it`],
        ["bottom", `Board below · ${belowName} · 30.5 over it`],
        ...(z.shelfEnabled === true ? [["shelf_top", "Shelf · 30.5 over its top face"], ["shelf_bottom", "Shelf · 30.5 under it"]] : []),
        ["side", `Side · ${hasVd ? `VD_${z.id}` : "vertical board"} face · height below`],
      ];
      if (!lockOpts.some(([v]) => v === lockNow)) lockOpts.push([lockNow, `${lockNow} (board not here)`]);
      fields.push(el("label", { class: "field wide-value", title: "The board the lock bolt catches. The slot sits on the door edge opposite the hinge, 80 mm in." }, [
        el("span", { text: "Lock on" }),
        el("select", {
          onchange: (e) => {
            const to = e.target.value;
            e.target.blur();
            const next = zones.map((zz) => ({ ...zz }));
            next[zi].lockPosition = to;
            if (to === "side" && !(Number(next[zi].lockHeight) > 0)) next[zi].lockHeight = Math.round(z.height / 2);
            setZones(next, "lock", { zone: z.id, from: lockNow, to });
          },
        }, lockOpts.map(([v, t]) => el("option", { value: v, text: t, selected: v === lockNow }))),
      ]));
      if (lockNow !== "none") {
        fields.push(numField("Lock side distance (mm)", z.lockSideDistance ?? 80, (v) => {
          const next = zones.map((zz) => ({ ...zz }));
          next[zi].lockSideDistance = Math.max(0, Math.round(v * 10) / 10);
          setZones(next, "lockSide", { zone: z.id, to: next[zi].lockSideDistance });
        }, { step: 5, min: 0 }));
      }
      if (lockNow === "side") {
        fields.push(numField("Lock height, from zone bottom (mm)", z.lockHeight ?? Math.round(z.height / 2), (v) => {
          const next = zones.map((zz) => ({ ...zz }));
          next[zi].lockHeight = Math.max(0, Math.min(z.height, Math.round(v)));
          setZones(next, "lockHeight", { zone: z.id, to: next[zi].lockHeight });
        }, { step: 10, min: 0 }));
      }
      const myLocks = (result?.locks || []).filter((l) => l.panelId === `FP_${z.id}` || String(l.panelId).startsWith(`FP_${z.id}_`));
      if (myLocks.length) {
        fields.push(kv("Lock centre", myLocks.map((l) => `${Math.round(l.centerZ * 10) / 10} from floor${l.mountingBoardId ? ` · on ${l.mountingBoardId}` : ""}`).filter((t, k, a) => a.indexOf(t) === k).join(" / ")));
      }
    }
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
        // No shelf, nothing for a shelf lock to catch: back to the default (board above).
        if (!on && (next[zi].lockPosition === "shelf_top" || next[zi].lockPosition === "shelf_bottom")) delete next[zi].lockPosition;
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
      el("div", { class: "zs-tools" }, [addZone, removeZone, averageHeight]),
      front,
      el("div", { class: "zs-hint", text: "Click a zone to select it · Ctrl+click to select several · drag an orange line (height) or the dashed one (divider) · Shift = 1 mm" }),
    ]),
    zoneCard,
    tallPreset,
    tallSides,
    tallWheel,
    section("LED", [
      el("label", { class: "field check", title: "Style 1 cuts the T3 top and the B3 underside. The main channel is 14.5 × 6.5, 18 mm behind the front edge. Each branch is centred 30 mm from the board end, so its near wall is 22.75 mm from that edge — the same as a kitchen B3 — and runs back to the rear edge. Off until ticked." }, [
        el("span", { text: "LED channels" }),
        el("input", { type: "checkbox", checked: p.ledGroove === true, onchange: (e) => {
          const to = e.target.checked;
          if ((p.ledGroove === true) === to) return;
          job.setParams(cab.id, { ...p, ledGroove: to });
          log("tall.led", { id: cab.id, from: p.ledGroove === true, to });
        } }),
      ]),
    ]),
    fold,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
