// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { MIN_ZONE_HEIGHT, MIN_ZONE_WIDTH } from "../modules.js";
import { thickness } from "../materials.js";
import { el, doorLine, numField, section, frontSection, kv, panel, repaint, gapMode } from "./widgets.js";
// --- kitchen base cabinet editor -------------------------------------------------------
//
// Wide page while a kitchen base run is selected: the generator's 2D front
// elevation (columns left → right, zones inside a column top → bottom, over the
// kick). Click a cell to select its zone; drag an orange column boundary to
// trade width with the next column, or an orange zone boundary to trade height
// with the zone below (10 mm steps, Shift = 1 mm). A card edits the selected
// zone and its column. Every edit is one undo step; a drag commits on release.

const kitchenSel = { cabId: null, col: -1, zoneId: null }; // cell selection, kept across re-renders
let kitchenDrag = null; // { cabId, refresh } while a front-view boundary is dragged

function kitchenSelected(cabId) {
  if (kitchenSel.cabId !== cabId) { kitchenSel.cabId = cabId; kitchenSel.col = -1; kitchenSel.zoneId = null; }
  return kitchenSel;
}

export function renderKitchen(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const columns = p.columns || [];
  const cpt = p.materialThickness ?? thickness(job.getStock(), "carcass");
  const fpt = p.frontThickness ?? thickness(job.getStock(), "door");
  const bch = p.bottomClearanceHeight ?? 70;
  const sel = kitchenSelected(cab.id);
  const selCol = columns[sel.col];
  const selZone = selCol?.zones?.find((z) => z.id === sel.zoneId) ?? null;
  const selZoneIndex = selZone ? selCol.zones.indexOf(selZone) : -1;
  const resCols = result?.debug?.columns || [];

  const setParams = (next, kind, extra = {}) => {
    job.setParams(cab.id, next);
    log(`kitchen.cell.${kind}`, { id: cab.id, ...extra });
  };

  // A drag in progress: redraw the SVG in place and keep the container (and its pointer capture) alive.
  if (kitchenDrag && kitchenDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    kitchenDrag.refresh();
    return;
  }

  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    const cur = kitchenSelected(cab.id);
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneId: cur.zoneId, selectedCol: cur.col, gaps: gapMode }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  };
  drawFront();

  // Cell selection: one click on a zone cell.
  front.addEventListener("click", (e) => {
    if (kitchenDrag) return;
    const cellEl = e.target.closest?.("[data-zone]");
    if (!cellEl) return;
    const zid = cellEl.getAttribute("data-zone");
    const ci = Number(cellEl.getAttribute("data-col") || 0);
    const cur = kitchenSelected(cab.id);
    const same = cur.zoneId === zid && cur.col === ci;
    cur.col = same ? -1 : ci;
    cur.zoneId = same ? null : zid;
    log("kitchen.cell.select", { id: cab.id, column: cur.col, zone: cur.zoneId });
    repaint();
  });
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    const svg = front.querySelector("svg");
    if (!g || !svg || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = g.getAttribute("data-boundary"); // "column" | "zone"
    const axis = g.getAttribute("data-axis");
    const index = Number(g.getAttribute("data-index") || 0);
    const ci = Number(g.getAttribute("data-col") || 0);
    const params0 = cab.params;
    const result0 = job.resultFor(cab.id);
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
    kitchenDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(toMm(ev.clientX, ev.clientY) / step) * step;
      const next = kind === "column"
        ? mod.setDivider(params0, result0, index, v)
        : mod.setZoneDivider(params0, result0, ci, index, v);
      job.setParams(cab.id, next, { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      front.classList.remove("dragging");
      kitchenDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("kitchen.cell.drag", {
        id: cab.id, boundary: kind, index, column: kind === "zone" ? ci : undefined,
        to: now ? (kind === "column" ? now.params.columns?.map((c) => c.width) : now.params.columns?.[ci]?.zones?.map((z) => z.height)) : null,
        changed, where: "front view",
      });
      repaint();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  // Column / zone toolbar. Columns keep the run's length; zones keep the column's height.
  const r1 = (v) => Math.round(v * 10) / 10;
  const zoneAllowsShelf = (t) => ["left_door", "right_door", "double_door", "open", "custom"].includes(t);
  const zoneAllowsLock = (t) => ["left_door", "right_door", "double_door", "drawer", "down_flap"].includes(t);
  const cloneCols = () => columns.map((c) => ({ ...c, zones: c.zones.map((z) => ({ ...z })) }));
  const addColumn = el("button", { class: "tb", text: "+ Column", title: "A new column on the right, taken from the widest column", onclick: () => {
    const next = cloneCols();
    const widest = next.reduce((a, b) => ((b.width || 0) > (a.width || 0) ? b : a), next[0]);
    const take = Math.min(400, r1((widest?.width || 0) / 2));
    if (take < MIN_ZONE_WIDTH || (widest.width || 0) - take < MIN_ZONE_WIDTH) { log("kitchen.cell.blocked", { id: cab.id, reason: `no column can give ${MIN_ZONE_WIDTH} mm` }); return; }
    widest.width = r1(widest.width - take);
    const stamp = Date.now().toString(36);
    const col = { id: `c${stamp}`, width: take, zones: [{ id: `z${stamp}`, height: r1(env.H - bch), zoneType: "left_door" }] };
    next.push(col);
    kitchenSel.col = next.length - 1;
    kitchenSel.zoneId = col.zones[0].id;
    setParams({ ...p, columns: next }, "add", { column: col.id, from: widest.id, widths: next.map((c) => c.width) });
  } });
  const addZone = el("button", { class: "tb", text: "+ Zone", disabled: !selZone, title: "Split the selected zone: a new drawer above it takes part of its height", onclick: () => {
    const next = cloneCols();
    const zs = next[sel.col].zones;
    const host = zs[selZoneIndex];
    const take = Math.min(200, r1(host.height / 2));
    if (take < MIN_ZONE_HEIGHT || host.height - take < MIN_ZONE_HEIGHT) { log("kitchen.cell.blocked", { id: cab.id, reason: `zone ${host.id} cannot give ${MIN_ZONE_HEIGHT} mm` }); return; }
    host.height = r1(host.height - take);
    const zone = { id: `z${Date.now().toString(36)}`, height: take, zoneType: "drawer" };
    zs.splice(selZoneIndex, 0, zone); // top → bottom: inserting before the host puts it above
    kitchenSel.zoneId = zone.id;
    setParams({ ...p, columns: next }, "zoneAdd", { column: selCol.id, zone: zone.id, from: host.id });
  } });
  const removeZone = el("button", { class: "tb danger", text: "Remove zone", disabled: !selZone || selCol.zones.length <= 1, title: "The zone below (or above) takes its height", onclick: () => {
    const next = cloneCols();
    const zs = next[sel.col].zones;
    const heir = zs[selZoneIndex + 1] ?? zs[selZoneIndex - 1];
    heir.height = r1(heir.height + zs[selZoneIndex].height);
    zs.splice(selZoneIndex, 1);
    kitchenSel.zoneId = heir.id;
    setParams({ ...p, columns: next }, "zoneRemove", { column: selCol.id, removed: selZone.id, heir: heir.id });
  } });
  const removeColumn = el("button", { class: "tb danger", text: "Remove column", disabled: !selCol || columns.length <= 1, title: "The neighbouring column takes its width", onclick: () => {
    const next = cloneCols();
    const ci = sel.col;
    const heir = next[ci + 1] ?? next[ci - 1];
    heir.width = r1((heir.width || 0) + (next[ci].width || 0));
    next.splice(ci, 1);
    kitchenSel.col = -1;
    kitchenSel.zoneId = null;
    setParams({ ...p, columns: next }, "columnRemove", { removed: selCol.id, heir: heir.id });
  } });

  // Selected cell card: the zone's fields, then its column.
  let cellCard = null;
  if (selZone && selZoneIndex >= 0) {
    const ci = sel.col;
    const zi = selZoneIndex;
    const z = selZone;
    const col = selCol;
    const res = resCols[ci]?.zones?.find((rz) => rz.id === z.id);
    const setZone = (patch, kind, extra = {}) => {
      const next = cloneCols();
      Object.assign(next[ci].zones[zi], patch);
      setParams({ ...p, columns: next }, kind, { column: col.id, zone: z.id, ...extra });
    };
    const check = (text, on, onChange, title) => el("label", { class: "field check", title }, [
      el("span", { text }),
      el("input", { type: "checkbox", checked: on, onchange: (e) => onChange(e.target.checked) }),
    ]);
    const zoneChoices = mod.zoneTypes.some((t) => t.id === z.zoneType)
      ? mod.zoneTypes
      : [...mod.zoneTypes, { id: z.zoneType, label: z.zoneType === "stove" ? "Stove (not on an ensuite)" : z.zoneType }];
    const type = el("select", { onchange: (e) => { e.target.blur(); setZone({ zoneType: e.target.value }, "type", { type: e.target.value }); } },
      zoneChoices.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.zoneType })));

    const neighbour = zi < col.zones.length - 1 ? zi + 1 : zi - 1;
    const colNeighbour = ci < columns.length - 1 ? ci + 1 : ci - 1;
    const fields = [
      el("label", { class: "field wide-value" }, [el("span", { text: "Type" }), type]),
      res ? kv("From floor", `${Math.round(res.z0)} – ${Math.round(res.z1)} mm`) : null,
      numField("Height (mm)", z.height, (v) => {
        if (neighbour < 0) return;
        const next = cloneCols();
        const zs = next[ci].zones;
        const val = Math.max(MIN_ZONE_HEIGHT, Math.min(r1(zs[zi].height + zs[neighbour].height - MIN_ZONE_HEIGHT), Math.round(v)));
        zs[neighbour].height = r1(zs[neighbour].height - (val - zs[zi].height));
        zs[zi].height = val;
        setParams({ ...p, columns: next }, "height", { column: col.id, zone: z.id, height: val });
      }, { step: 10, min: MIN_ZONE_HEIGHT, readOnly: col.zones.length <= 1 ? "The only zone fills the column (height − kick)" : null }),
      zoneAllowsShelf(z.zoneType) ? check("Shelf", z.shelfEnabled !== false, (on) => setZone({ shelfEnabled: on }, "shelf", { on })) : null,
      zoneAllowsLock(z.zoneType) ? check("Lock", z.lockEnabled !== false, (on) => setZone({ lockEnabled: on }, "lock", { on }), p.lockEnabled === false ? "Locks are off for the whole cabinet" : undefined) : null,
      cab.moduleId === "ensuiteCabinet" && zi === col.zones.length - 1 && (z.zoneType === "left_door" || z.zoneType === "right_door")
        ? check("Washer floor", z.applianceFloorEnabled === true, (on) => setZone({ applianceFloorEnabled: on }, "washer", { on }), "A deck behind B3 and two supports in the kick. Style 1 only. Refused when this column meets a wheel arch, or the carcass is under 450 deep, or the clear width is under 500.")
        : null,
    ];
    const colFields = [
      numField("Width (mm)", col.width, (v) => {
        if (colNeighbour < 0) return;
        const next = cloneCols();
        const val = Math.max(MIN_ZONE_WIDTH, Math.min(r1(next[ci].width + next[colNeighbour].width - MIN_ZONE_WIDTH), Math.round(v)));
        next[colNeighbour].width = r1(next[colNeighbour].width - (val - next[ci].width));
        next[ci].width = val;
        setParams({ ...p, columns: next }, "width", { column: col.id, width: val });
      }, { step: 10, min: MIN_ZONE_WIDTH, readOnly: columns.length <= 1 ? "The only column fills the run" : null }),
      resCols[ci] ? kv("From left", `${Math.round(resCols[ci].x0)} – ${Math.round(resCols[ci].x1)} mm`) : null,
      kv("Zones", `${col.zones.length} · top → bottom`),
    ];
    const SIDE_DEFAULT = {
      panelType: "carcass", frontVisible: false, bchNotchEnabled: true,
      grooveVisible: true, extendT2T3B4ToOuterFace: true, strengtheningStripEnabled: false,
    };
    const isPanelZone = (t) => ["left_door", "right_door", "double_door", "drawer", "down_flap"].includes(t);
    const sideKey = (side) => (side === "left" ? "leftSidePanelOptions" : "rightSidePanelOptions");
    const sideHost = (zones, side) => {
      const key = sideKey(side);
      const indexed = zones.map((zone, index) => ({ zone, index }));
      const withKey = indexed.filter(({ zone }) => zone[key]);
      return withKey.find(({ zone }) => isPanelZone(zone.zoneType))
        || withKey.find(({ zone }) => zone.zoneType === "open" || zone.zoneType === "custom")
        || withKey[0]
        || indexed.find(({ zone }) => isPanelZone(zone.zoneType))
        || indexed.find(({ zone }) => zone.zoneType === "open" || zone.zoneType === "custom")
        || indexed[0];
    };
    const writeSide = (side, patch) => {
      const next = cloneCols();
      const host = sideHost(next[ci].zones, side);
      if (!host) return;
      const key = sideKey(side);
      const from = { ...SIDE_DEFAULT, ...(host.zone[key] || {}) };
      const field = Object.keys(patch)[0];
      next[ci].zones[host.index][key] = { ...from, ...patch };
      setParams({ ...p, columns: next }, "side", { column: col.id, side, key: field, from: from[field], to: patch[field] });
    };
    const sideSection = (side) => {
      const host = sideHost(col.zones, side);
      const opts = { ...SIDE_DEFAULT, ...(host ? host.zone[sideKey(side)] : {}) };
      const hasPanel = col.zones.some((zone) => isPanelZone(zone.zoneType));
      const tick = (text, on, key, title, disabled) => el("label", { class: "field check", title }, [
        el("span", { text }),
        el("input", { type: "checkbox", checked: on, disabled: !!disabled, onchange: (e) => writeSide(side, { [key]: e.target.checked }) }),
      ]);
      return section(side === "left" ? "Left end" : "Right end", [
        el("label", { class: "field" }, [
          el("span", { text: "Stock" }),
          el("div", { class: "seg-group" }, [["carcass", "Carcass"], ["door", "Door"]].map(([id, text]) => el("button", {
            type: "button",
            class: `tb seg${opts.panelType === id ? " active" : ""}`,
            text,
            title: id === "door" ? `Door stock ${fpt} mm, door colour outside` : `Carcass stock ${cpt} mm`,
            onclick: () => { if (opts.panelType !== id) writeSide(side, { panelType: id }); },
          }))),
        ]),
        tick("Front visible", opts.frontVisible, "frontVisible"),
        tick("Groove visible", opts.grooveVisible, "grooveVisible"),
        tick("Kick notch", opts.bchNotchEnabled, "bchNotchEnabled"),
        tick("T2 / T3 / B4 reach the outer face", opts.extendT2T3B4ToOuterFace, "extendT2T3B4ToOuterFace"),
        tick("Strengthening strip", opts.strengtheningStripEnabled, "strengtheningStripEnabled", "Needs a visible front and a door, drawer, or flap in this column", !opts.frontVisible || !hasPanel),
        el("div", { class: "empty small", text: "This end of the run. The strip is cut only when the front is visible and this column has a door, a drawer, or a flap." }),
      ]);
    };
    const sideCards = [];
    if (ci === 0) sideCards.push(sideSection("left"));
    if (ci === columns.length - 1) sideCards.push(sideSection("right"));
    cellCard = [
      section(`Zone ${zi + 1} of ${col.zones.length} · from the top`, fields.filter(Boolean)),
      section(`Column ${ci + 1} of ${columns.length}`, colFields.filter(Boolean)),
      ...sideCards,
    ];
  }

  // Cabinet-level fields, folded.
  const setEnv = (k) => (v) => job.setParams(cab.id, mod.setEnvelope(p, { [k]: Math.max(mod.minSize[k], v) }));
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${columns.length} columns · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box)", [
      numField("Width (mm)", env.W, setEnv("W")),
      numField("Depth (mm)", env.D, setEnv("D")),
      numField("Height (mm)", env.H, setEnv("H")),
    ]),
    section("Kick & fronts", [
      el("label", { class: "field" }, [
        el("span", { text: "Kick" }),
        el("div", { class: "seg-group" }, [["style_1", "Style 1 · recessed"], ["style_2", "Style 2 · flush"]].map(([id, text]) => el("button", {
          type: "button",
          class: `tb seg${(p.bottomClearanceStyle === "style_2" ? "style_2" : "style_1") === id ? " active" : ""}`,
          text,
          title: id === "style_2" ? "Kick face flush with the carcass front" : "Kick face set back from the door",
          onclick: () => {
            const from = p.bottomClearanceStyle === "style_2" ? "style_2" : "style_1";
            if (from === id) return;
            job.setParams(cab.id, { ...p, bottomClearanceStyle: id });
            log("kitchen.cell.kickStyle", { id: cab.id, from, to: id });
          },
        }))),
      ]),
      // A new kick re-fits every column's zones to height − kick (same rule as a height change).
      numField("Kick height (mm)", bch, (v) => job.setParams(cab.id, mod.setEnvelope({ ...p, bottomClearanceHeight: Math.max(0, Math.round(v)) }, { H: env.H })), { step: 5, min: 0 }),
      numField("Front clearance (mm)", p.frontClearance ?? 2.5, (v) => job.setParams(cab.id, { ...p, frontClearance: Math.max(0, v) }), { step: 0.5, min: 0 }),
      el("label", { class: "field check" }, [
        el("span", { text: "Locks" }),
        el("input", { type: "checkbox", checked: p.lockEnabled !== false, onchange: (e) => job.setParams(cab.id, { ...p, lockEnabled: e.target.checked }) }),
      ]),
      p.bottomClearanceStyle === "style_2" ? null : el("label", { class: "field check", title: "On the underside of B3, opening downward. Style 2 has no groove." }, [
        el("span", { text: "B3 LED groove" }),
        el("input", { type: "checkbox", checked: p.ledGroove !== false, onchange: (e) => {
          job.setParams(cab.id, { ...p, ledGroove: e.target.checked });
          log("kitchen.cell.led", { id: cab.id, from: p.ledGroove !== false, to: e.target.checked });
        } }),
      ]),
    ].filter(Boolean)),
    section("Wheel arches", [
      ...((p.wheelAvoidances || []).map((w, wi) => {
        const setWheel = (patch) => {
          const next = (p.wheelAvoidances || []).map((item, i) => (i === wi ? { ...item, ...patch } : item));
          job.setParams(cab.id, { ...p, wheelAvoidances: next });
          log("kitchen.wheel", { id: cab.id, wheel: w.id, ...patch });
        };
        return el("div", { class: "zone-row" }, [
          el("span", { class: "zone-idx", text: w.id }),
          numField("From", w.x0, (v) => setWheel({ x0: Math.round(v) }), { step: 10, min: -1e6 }),
          numField("To", w.x1, (v) => setWheel({ x1: Math.round(v) }), { step: 10, min: -1e6 }),
          numField("Height", w.height, (v) => setWheel({ height: Math.max(0, Math.round(v)) }), { step: 10, min: 0 }),
          numField("Depth", w.depth, (v) => setWheel({ depth: Math.max(0, Math.round(v)) }), { step: 10, min: 0 }),
          el("button", { class: "icon", title: "Remove this wheel arch", text: "×", onclick: () => {
            const next = (p.wheelAvoidances || []).filter((_, i) => i !== wi);
            job.setParams(cab.id, { ...p, wheelAvoidances: next });
            log("kitchen.wheel", { id: cab.id, removed: w.id });
          } }),
        ]);
      })),
      el("button", { class: "tb", text: "+ Wheel arch", onclick: () => {
        const next = [...(p.wheelAvoidances || []), { id: `w${Date.now().toString(36)}`, x0: 0, x1: 400, height: Math.max(bch, 200), depth: 200 }];
        job.setParams(cab.id, { ...p, wheelAvoidances: next });
        log("kitchen.wheel", { id: cab.id, added: next[next.length - 1] });
      } }),
      el("div", { class: "empty small", text: "From and To are along the cabinet width. Height is from the floor, depth is from the back. The kick and the boards it meets are cut around it. The dashed block in the front view is the arch, not a board." }),
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
      el("div", { class: "panel-sub", text: `${cab.id} · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} mm · ${columns.length} columns · kick ${Math.round(bch)} · ${result?.boards?.length || 0} boards` }),
    ]),
    shared.board,
    frontSection(`Front view · from the room · ${columns.length} column${columns.length === 1 ? "" : "s"}`, [
      el("div", { class: "zs-tools" }, [addColumn, addZone, removeZone, removeColumn]),
      front,
      el("div", { class: "zs-hint", text: "Click a cell to select it · drag an orange line (column width / zone height) · Shift = 1 mm" }),
    ]),
    ...(cellCard || []),
    fold,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
