// Right panel: shows the space when nothing is selected, otherwise the
// selected cabinet's params. Every edit writes into job.js and regenerates.
import * as job from "./job.js";
import { getModule, fitZones, MIN_ZONE_HEIGHT, MIN_ZONE_WIDTH, fitZoneWidths, BEDROOM_LAYOUT_LABEL, BEDROOM_WARDROBE_STYLE } from "./modules.js";
import { getSpaceKind } from "./spaces.js";
import { openSpaceDialog } from "./spaceDialog.js";
import { poseFits, armHandle, armedHandleFor } from "./cabinets3d.js";
import { describeMaterials, thickness, partitionClearance } from "./materials.js";
import { sideOfRotZ, sideLabel, overlaps } from "./interact.js";
import { wallLength, wallOrientation, cabinetBlocksOpening, pelmetCover, DOOR_CLEAR_DEPTH, OPENING_MIN_WIDTH, OPENING_TYPES, SLIDING_GAP, SLIDING_FLOOR_GAP } from "./walls.js";
import { envelopeFootprint } from "./cabinets3d.js";
import { statusOf } from "./walls3d.js";
import { openFloorPlan } from "./floorplan.js";
import { faceLabel, featureSummary, featureLine, boardDims, bigFaces, edgeFaces, dirName } from "./boardModel.js";
import { log } from "./log.js";

const panel = document.getElementById("rightpanel");
const app = document.getElementById("app");
const drawerChecks = document.querySelector('[data-dpane="checks"]');
const drawerBoards = document.querySelector('[data-dpane="boards"]');

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "style") e.style.cssText = v; // CSSOM: allowed by the CSP, unlike a style attribute
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === false || v == null) continue;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

function numField(label, value, onCommit, opts = {}) {
  const input = el("input", { type: "number", value, step: opts.step ?? 10, min: opts.min ?? 0 });
  if (opts.readOnly) {
    input.readOnly = true;
    input.title = opts.readOnly;
    return el("label", { class: "field readonly" }, [el("span", { text: label }), input]);
  }
  const commit = () => {
    const v = Number(input.value);
    if (!Number.isFinite(v)) { input.value = value; return; }
    if (v === Number(value)) return;
    onCommit(v);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
  return el("label", { class: "field" }, [el("span", { text: label }), input]);
}

/**
 * A number field with a "drag in 3D" toggle: pressing it arms an on-demand arrow
 * handle on the cabinet (cabinets3d.armHandle) for that dimension; pressing again,
 * Esc or a selection change removes it. Typing still works as usual.
 */
function dragField(label, value, onCommit, cabId, type, title) {
  const field = numField(label, value, onCommit);
  const armed = armedHandleFor(cabId) === type;
  const btn = el("button", { class: `icon drag${armed ? " active" : ""}`, title, text: "⇕", onclick: (e) => {
    e.preventDefault();
    const now = armHandle(cabId, type);
    log("handle.arm", { id: cabId, handle: type, on: !!now });
    renderPanel();
  } });
  field.classList.add("with-drag");
  field.append(btn);
  return field;
}

function section(title, children) {
  return el("div", { class: "panel-section" }, [el("div", { class: "sec-title", text: title }), ...children]);
}
const kv = (label, value) => el("div", { class: "kv" }, [el("span", { text: label }), el("b", { text: value })]);

/**
 * Read-out for the board / face selected inside the cabinet (tree or a second click in 3D).
 * Read only: boards and faces are regenerated from the cabinet's params; nothing here edits them.
 */
function boardSection() {
  const sub = job.getSubSelection();
  if (!sub) return null;
  const b = sub.board;
  const d = boardDims(b);
  const f = sub.face;
  const back = el("button", { class: "tb", text: f ? `‹ Board ${b.id}` : "‹ Cabinet", title: "Back up one level (Esc)", onclick: () => job.select(sub.cabId, f ? { boardId: b.id } : null) });
  const rows = [
    el("div", { class: "kv" }, [el("span", { text: "Path" }), el("b", { text: `${sub.cabId} › ${b.id}${f ? ` › ${f.id}` : ""}` })]),
    kv("Board", `${b.name} · ${b.id}`),
    kv("Size (L × W × T)", `${Math.round(d.L)} × ${Math.round(d.W)} × ${d.T} mm`),
    kv("Stock", `${b.stock?.kind || b.category}${b.stock?.colour ? ` · ${b.stock.colour}` : ""} · ${b.materialThickness} mm`),
    kv("Lies in", `${b.profilePlane} · thickness along ${b.thicknessAxis}`),
  ];
  if (f) {
    rows.push(
      kv("Face", `${faceLabel(f)} · ${f.id}`),
      kv("Looks", typeof f.normal === "string" ? `${f.normal} (${dirName(f.normal)})` : "slanted"),
      f.visible != null ? kv("After assembly", f.visible ? "visible" : "hidden") : null,
      f.finish?.colour ? kv("Colour", f.finish.colour) : null,
      f.finish?.edgeBand ? kv("Edge band", `${f.finish.edgeBand.thickness} mm${f.finish.edgeBand.colour ? ` · ${f.finish.edgeBand.colour}` : ""}`) : null,
    );
    if (f.features.length) {
      rows.push(el("div", { class: "sec-title", style: "margin-top:8px", text: `Machined into it (${f.features.length})` }));
      for (const ft of f.features) rows.push(el("div", { class: "empty small mono", text: featureLine(ft) }));
    } else {
      rows.push(el("div", { class: "empty small", text: f.id.startsWith("E") ? "Plain edge." : "Nothing machined into this face." }));
    }
  } else {
    const faces = b.faces || [];
    if (faces.length) {
      for (const bf of bigFaces(b)) {
        const bits = [bf.id, featureSummary(bf), bf.finish?.colour].filter(Boolean).join(" · ");
        rows.push(el("div", { class: "kv link", onclick: () => job.select(sub.cabId, { boardId: b.id, faceId: bf.id }) }, [el("span", { text: faceLabel(bf) }), el("b", { text: bits })]));
      }
      const edges = edgeFaces(b);
      const tagged = edges.filter((e) => e.features.length);
      rows.push(kv(`${edges.length} edges`, tagged.length ? tagged.map((e) => `${e.id} ${e.features.map((t) => t.kind).join("/")}`).join(", ") : "plain"));
    } else {
      rows.push(el("div", { class: "empty small", text: "This generator does not describe faces yet." }));
    }
  }
  rows.push(el("div", { class: "empty small", text: "Generated from the cabinet's parameters — change a size or a zone and the board follows. Esc climbs back up." }));
  return el("div", { class: "panel-section sub-sel" }, [
    el("div", { class: "sec-head" }, [el("div", { class: "sec-title", text: f ? "Face" : "Board" }), back]),
    ...rows.filter(Boolean),
  ]);
}

// --- space ---------------------------------------------------------------------

/** Cabinets that no longer fit the space (after a space edit, for instance). */
export function spaceFitIssues() {
  const issues = [];
  if (!job.hasSpace()) return issues;
  const wallIds = new Set(job.getWalls().map((w) => w.id));
  const cabIds = new Set(job.getJob().cabinets.map((c) => c.id));
  for (const cab of job.getJob().cabinets) {
    if (!poseFits(cab, cab.pose)) issues.push(`${cab.id} is outside the space or overlaps an obstacle.`);
    const all = overlaps(cab, cab.pose);
    const hits = all.filter((id) => wallIds.has(id));
    if (hits.length) issues.push(`${cab.id} overlaps partition ${hits.join(", ")}.`);
    const parts = all.filter((id) => !wallIds.has(id) && !cabIds.has(id)); // "op-1 leaf" / "op-1 pelmet"
    if (parts.length) issues.push(`${cab.id} overlaps the sliding door ${parts.join(", ")}.`);
  }
  for (const w of job.getWalls()) {
    const st = statusOf(w);
    if (!st.ok) issues.push(`${w.id}: ${st.issues.join("; ")}.`);
    issues.push(...(st.warnings || []).map((m) => `${w.id}: ${m}.`), ...doorBlockers(w, st.solid));
  }
  return issues;
}

function renderSpace() {
  const space = job.getJob().space;
  const resolved = job.getSpace();
  const count = job.getJob().cabinets.length;

  if (!space) {
    panel.replaceChildren(
      el("div", { class: "panel-head" }, [
        el("div", { class: "panel-title", text: "Space" }),
        el("div", { class: "panel-sub", text: "not defined" }),
      ]),
      section("Step 1", [
        el("div", { class: "empty small", text: "Define the space first: a box room, or a vehicle (box rear + side-profile nose); imported floor plans later." }),
        el("button", { class: "tb primary wide-solid", text: "Define the space", onclick: () => openSpaceDialog() }),
      ]),
    );
    drawerChecks.replaceChildren(el("div", { class: "empty", text: "No space defined." }));
    drawerBoards.replaceChildren(el("div", { class: "empty", text: "No space defined." }));
    return;
  }

  const kind = getSpaceKind(space.kind);
  const issues = spaceFitIssues();
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Space" }),
      el("div", { class: "panel-sub", text: `${kind.label} · ${resolved.summary} · ${count} cabinet(s)${job.getWalls().length ? ` · ${job.getWalls().length} partition(s)` : ""}` }),
    ]),
    section(kind.label, [
      ...(kind.describe
        ? kind.describe(space.params)
        : kind.fields.filter((f) => !f.type || f.type === "number").map((f) => [f.label, String(space.params[f.key])])
      ).map(([label, value]) => el("div", { class: "kv" }, [el("span", { text: label }), el("b", { text: value })])),
      el("button", { class: "tb wide", text: "Edit space…", onclick: () => openSpaceDialog() }),
    ]),
    section("Cabinets", [
      ...describeMaterials(job.getFinish(), job.getStock()).map(([label, value]) =>
        el("div", { class: "kv" }, [el("span", { text: label }), el("b", { text: value })])),
    ]),
    issues.length
      ? el("div", { class: "panel-section" }, [
          el("div", { class: "sec-title", text: "Checks" }),
          ...issues.map((m) => el("div", { class: "msg err", text: m })),
        ])
      : null,
    el("div", { class: "panel-section muted" }, [
      el("div", { class: "sec-title", text: "Next" }),
      el("div", { class: "empty small", text: "Walls first: open the Floor plan (top right of the 3D view) and draw the partition walls from the space's walls. Then pick a module on the left, click a corner of the space (or of a wall / another cabinet) to start its box, size it with the mouse or Tab-typed numbers, click again to create. Pull the blue faces to change W / D / H, drag the orange bars to move zone boundaries." }),
    ]),
  ].filter(Boolean));
  drawerChecks.replaceChildren(
    issues.length
      ? el("div", {}, issues.map((m) => el("div", { class: "msg err", text: m })))
      : el("div", { class: "empty", text: count ? "All cabinets fit the space. Select one to see its checks." : "Select a cabinet to see its checks." }),
  );
  drawerBoards.replaceChildren(el("div", { class: "empty", text: "Select a cabinet to list its boards." }));
}

// --- overhead editor ---------------------------------------------------------------
//
// Wide page while an OHC is selected: a zone strip (left → right, drag the
// boundaries, click / Ctrl+click to select), the generator's 2D front view,
// a card for the selected zone, and the cabinet-level fields folded below.
// Every edit is one undo step; a boundary drag commits once on release.

const ohcSel = { cabId: null, indices: [] }; // zone selection, kept across re-renders
let ohcDrag = null; // { cabId, refresh } while a strip boundary is dragged

function ohcSelected(cabId) {
  if (ohcSel.cabId !== cabId) { ohcSel.cabId = cabId; ohcSel.indices = []; }
  return ohcSel.indices;
}
function ohcSelect(cabId, indices) {
  ohcSel.cabId = cabId;
  ohcSel.indices = indices.slice().sort((a, b) => a - b);
  log("ohc.zone.select", { id: cabId, zones: ohcSel.indices });
}

function ohcTypeShort(mod, type) {
  const t = mod.zoneTypes.find((z) => z.id === type);
  return t ? t.short || t.label : type;
}

/** The zone strip: proportional cells with draggable boundaries; returns { strip, refresh }. */
function zoneStrip(cab, mod) {
  const p = cab.params;
  const zones = p.zones || [];
  const total = p.cabinetWidth;
  const selected = ohcSelected(cab.id);
  const strip = el("div", { class: "zs-strip" });
  const widthRow = el("div", { class: "zs-row" });
  const cumRow = el("div", { class: "zs-row cum" });

  const cells = zones.map((z, i) => {
    const cell = el("div", { class: `zs-zone t-${z.type}${selected.includes(i) ? " sel" : ""}` }, [
      el("span", { class: "zs-type", text: ohcTypeShort(mod, z.type) }),
      el("span", { class: "zs-w", text: String(Math.round(z.width)) }),
    ]);
    cell.addEventListener("click", (e) => {
      const cur = ohcSelected(cab.id);
      if (e.ctrlKey || e.metaKey) ohcSelect(cab.id, cur.includes(i) ? cur.filter((k) => k !== i) : [...cur, i]);
      else ohcSelect(cab.id, [i]);
      renderPanel();
    });
    return cell;
  });

  const layout = (zs) => {
    let x = 0;
    zs.forEach((z, i) => {
      cells[i].style.flexBasis = `${(z.width / total) * 100}%`;
      cells[i].querySelector(".zs-w").textContent = String(Math.round(z.width));
      x += z.width;
    });
    widthRow.replaceChildren(...zs.map((z) => el("span", { style: `flex-basis:${(z.width / total) * 100}%`, text: String(Math.round(z.width)) })));
    let acc = 0;
    cumRow.replaceChildren(...zs.slice(0, -1).map((z) => { acc += z.width; return el("span", { style: `left:${(acc / total) * 100}%`, text: String(Math.round(acc)) }); }));
  };

  // Boundaries: a grip between neighbouring cells; drag moves the boundary (10 mm steps, Shift = 1 mm).
  for (let i = 0; i < zones.length; i += 1) {
    strip.append(cells[i]);
    if (i === zones.length - 1) break;
    const grip = el("div", { class: "zs-grip", title: "Drag to move the boundary · Shift = 1 mm" });
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const before = job.snapshot();
      const params0 = job.getSelected().params;
      const result0 = job.resultFor(cab.id);
      const rect = strip.getBoundingClientRect();
      const x0 = params0.zones.slice(0, i + 1).reduce((s, z) => s + z.width, 0);
      const startX = e.clientX;
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
      grip.classList.add("active");
      ohcDrag = { cabId: cab.id, refresh: () => layout(job.getSelected().params.zones) };
      const move = (ev) => {
        const mm = ((ev.clientX - startX) / rect.width) * total;
        const step = ev.shiftKey ? 1 : 10;
        const pos = Math.round((x0 + mm) / step) * step;
        job.setParams(cab.id, mod.setDivider(params0, result0, i, pos), { history: false });
      };
      const end = (ev) => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
        try { grip.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
        grip.classList.remove("active");
        ohcDrag = null;
        const changed = job.commitSnapshot(before);
        const now = job.getSelected();
        log("ohc.zone.drag", { id: cab.id, boundary: i, changed, widths: now ? now.params.zones.map((z) => z.width) : null });
        renderPanel();
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    });
    strip.append(grip);
  }
  layout(zones);
  return { strip, widthRow, cumRow, refresh: layout };
}

function renderOverhead(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const zones = p.zones || [];
  const total = p.cabinetWidth;
  const selected = ohcSelected(cab.id).filter((i) => i < zones.length);
  const cpt = p.featureWidth ?? thickness(job.getStock(), "carcass");
  const fpt = p.frontPanelThickness ?? thickness(job.getStock(), "door");
  const setZones = (next, kind, extra = {}) => {
    job.setParams(cab.id, { ...p, zones: next });
    log(`ohc.zone.${kind}`, { id: cab.id, widths: next.map((z) => z.width), types: next.map((z) => z.type), ...extra });
  };

  // A drag in progress: refresh the strip in place, keep the DOM (and the pointer capture) alive.
  if (ohcDrag && ohcDrag.cabId === cab.id && panel.querySelector(".zs-strip")) {
    ohcDrag.refresh();
    const view = panel.querySelector(".ohc-front");
    if (view) view.innerHTML = mod.frontView(result, { selectedZoneIndex: selected[0] ?? -1 }) || "";
    return;
  }

  const { strip, widthRow, cumRow } = zoneStrip(cab, mod);

  const addZone = el("button", { class: "tb", text: "+ Add zone", onclick: () => {
    // The new zone takes up to 300 mm from the widest one (or everything is re-fitted).
    const next = zones.map((z) => ({ ...z }));
    const widest = next.reduce((a, b) => (b.width > a.width ? b : a), next[0]);
    const take = Math.min(300, widest.width - MIN_ZONE_WIDTH);
    const zone = { id: `zone-${Date.now().toString(36)}`, type: "up_flap", width: Math.max(MIN_ZONE_WIDTH, take) };
    if (take >= MIN_ZONE_WIDTH) { widest.width = Math.round((widest.width - take) * 10) / 10; next.push(zone); setZones(next, "add"); }
    else if ((next.length + 1) * MIN_ZONE_WIDTH <= total) { next.push(zone); setZones(fitZoneWidths(next, total), "add"); }
    else log("ohc.zone.blocked", { id: cab.id, reason: `no room for another ${MIN_ZONE_WIDTH} mm zone`, total });
    ohcSelect(cab.id, [next.length - 1]);
  } });
  const delZone = el("button", { class: "tb", text: "Delete", disabled: !selected.length || zones.length - selected.length < 1, onclick: () => {
    const next = zones.filter((_, i) => !selected.includes(i)).map((z) => ({ ...z }));
    setZones(fitZoneWidths(next, total), "remove", { removed: selected });
    ohcSelect(cab.id, []);
  } });
  const avgZone = el("button", { class: "tb", text: "Average selected", disabled: selected.length < 2, title: "Give the selected zones equal widths (their total stays)", onclick: () => {
    const next = zones.map((z) => ({ ...z }));
    const sum = selected.reduce((s, i) => s + next[i].width, 0);
    const each = Math.round((sum / selected.length) * 10) / 10;
    selected.forEach((i, k) => { next[i].width = k === selected.length - 1 ? Math.round((sum - each * (selected.length - 1)) * 10) / 10 : each; });
    setZones(next, "average", { zones: selected });
  } });

  const front = el("div", { class: "ohc-front" });
  front.innerHTML = mod.frontView(result, { selectedZoneIndex: selected[0] ?? -1 }) || "";
  if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));

  // Selected zone card.
  let zoneCard = null;
  if (selected.length === 1) {
    const i = selected[0];
    const z = zones[i];
    const type = el("select", { onchange: (e) => {
      const next = zones.map((zz) => ({ ...zz }));
      next[i].type = e.target.value;
      e.target.blur();
      setZones(next, "type", { zone: i, type: e.target.value });
    } }, mod.zoneTypes.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.type })));
    const neighbour = i < zones.length - 1 ? i + 1 : i - 1;
    const maxW = neighbour >= 0 ? z.width + zones[neighbour].width - MIN_ZONE_WIDTH : total;
    zoneCard = section(`Zone ${i + 1} of ${zones.length}`, [
      el("label", { class: "field" }, [el("span", { text: "Type" }), type]),
      numField("Width (mm)", z.width, (v) => {
        // The neighbour to the right (or left for the last zone) absorbs the difference.
        const w = Math.max(MIN_ZONE_WIDTH, Math.min(maxW, Math.round(v)));
        if (neighbour < 0) return;
        const next = zones.map((zz) => ({ ...zz }));
        const delta = w - next[i].width;
        next[i].width = w;
        next[neighbour].width = Math.round((next[neighbour].width - delta) * 10) / 10;
        setZones(next, "width", { zone: i, width: w });
      }, { step: 10, min: MIN_ZONE_WIDTH }),
      el("div", { class: "kv" }, [el("span", { text: "From left" }), el("b", { text: `${Math.round(zones.slice(0, i).reduce((s, zz) => s + zz.width, 0))} – ${Math.round(zones.slice(0, i + 1).reduce((s, zz) => s + zz.width, 0))} mm` })]),
    ]);
  } else if (selected.length > 1) {
    zoneCard = section(`${selected.length} zones selected`, [
      el("div", { class: "empty small", text: `Total ${Math.round(selected.reduce((s, i) => s + zones[i].width, 0))} mm · "Average selected" shares it equally.` }),
    ]);
  }

  // Cabinet-level fields, folded.
  const setEnv = (k) => (v) => job.setParams(cab.id, mod.setEnvelope(p, { [k]: Math.max(mod.minSize[k], v) }));
  const setHeightDown = (v) => {
    // The top stays on the ceiling: a taller box moves its bottom down.
    const H = Math.max(mod.minSize.H, v);
    const before = job.snapshot();
    job.updateCabinet(cab.id, (c) => { c.params = mod.setEnvelope(c.params, { H }); c.pose = { ...c.pose, z: c.pose.z + (env.H - H) }; });
    job.commitSnapshot(before);
  };
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D + fpt)} × ${Math.round(env.H)} · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box, doors included)", [
      numField("Width (mm)", env.W, setEnv("W")),
      numField("Depth (mm)", env.D + fpt, (v) => setEnv("D")(v - fpt)),
      numField("Height (mm)", env.H, setHeightDown),
      el("div", { class: "kv" }, [el("span", { text: "Bottom above floor" }), el("b", { text: `${Math.round(cab.pose.z)} mm` })]),
    ]),
    section("Material (job stock)", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: `${p.carcassColorName || "White Stipple"} · ${cpt} mm` })]),
      el("div", { class: "kv" }, [el("span", { text: "Door" }), el("b", { text: `${p.doorColorName || p.doorColor || "—"} · ${fpt} mm` })]),
      el("div", { class: "empty small", text: "Every board except the doors is carcass stock; the doors are door stock. Thicknesses come from the space's catalogue." }),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · doors ${sideLabel(sideOfRotZ(cab.pose.rotZ))} · ${Math.round(env.W)} × ${Math.round(env.D + fpt)} × ${Math.round(env.H)} mm · top on the ceiling` }),
    ]),
    shared.board,
    section(`Zones · left → right · ${zones.length} · ${Math.round(total)} mm`, [
      el("div", { class: "zs-tools" }, [addZone, delZone, avgZone, el("span", { class: "zs-hint", text: "Drag a boundary · click a zone · Ctrl+click adds to the selection" })]),
      strip,
      widthRow,
      cumRow,
    ]),
    zoneCard,
    section("Front view", [front]),
    fold,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

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

function renderTall(cab, mod, result, shared) {
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

  // A drag in progress: redraw the SVG in place and keep the container (and its pointer capture) alive.
  if (tallDrag && tallDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    tallDrag.refresh();
    return;
  }

  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneId: tallSelected(cab.id) }) || "";
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
    renderPanel();
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
      renderPanel();
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
      z.type === "fridge"
        ? numField("Appliance height (mm)", z.applianceHeightMm ?? z.height, (v) => {
            const next = zones.map((zz) => ({ ...zz }));
            next[zi].applianceHeightMm = Math.max(MIN_ZONE_HEIGHT, Math.round(v));
            setZones(next, "height", { zone: z.id, appliance: true });
          }, { step: 10, min: MIN_ZONE_HEIGHT })
        : numField("Height (mm)", z.height, (v) => {
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
    if (z.type === "fridge") {
      fields.push(numField("Appliance width (mm)", z.applianceWidthMm ?? 0, (v) => {
        const next = zones.map((zz) => ({ ...zz }));
        next[zi].applianceWidthMm = Math.max(0, Math.round(v));
        setZones(next, "appliance", { zone: z.id });
      }, { step: 10, min: 0 }));
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
    if (z.type !== "drawer" && z.type !== "fridge" && z.type !== "blank_panel") {
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
  const setEnv = (k) => (v) => job.setParams(cab.id, mod.setEnvelope(p, { [k]: Math.max(mod.minSize[k], v) }));
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });
  const setNested = (group, key) => (v) => job.setParams(cab.id, { ...p, [group]: { ...(p[group] || {}), [key]: v } });
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${zones.length} zones · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box)", [
      numField("Width (mm)", env.W, setEnv("W")),
      numField("Depth (mm)", env.D, setEnv("D")),
      numField("Height (mm)", env.H, setEnv("H")),
    ]),
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
      el("div", { class: "kv" }, [el("span", { text: "Door" }), el("b", { text: `${p.doorColorName || p.doorColor || "—"} · ${fpt} mm` })]),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} mm · ${zones.length} zones · ${result?.boards?.length || 0} boards` }),
    ]),
    shared.board,
    section(`Front view · from the room · ${zones.length} zone${zones.length === 1 ? "" : "s"} bottom → top`, [
      el("div", { class: "zs-tools" }, [addZone, removeZone]),
      front,
      el("div", { class: "zs-hint", text: "Click a zone to select it · drag an orange line (height) or the dashed one (divider) · Shift = 1 mm" }),
    ]),
    zoneCard,
    fold,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

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

function renderKitchen(cab, mod, result, shared) {
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
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneId: cur.zoneId, selectedCol: cur.col }) || "";
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
    renderPanel();
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
      renderPanel();
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
    const type = el("select", { onchange: (e) => { e.target.blur(); setZone({ zoneType: e.target.value }, "type", { type: e.target.value }); } },
      mod.zoneTypes.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.zoneType })));

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
    cellCard = [
      section(`Zone ${zi + 1} of ${col.zones.length} · from the top`, fields.filter(Boolean)),
      section(`Column ${ci + 1} of ${columns.length}`, colFields.filter(Boolean)),
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
      // A new kick re-fits every column's zones to height − kick (same rule as a height change).
      numField("Kick height (mm)", bch, (v) => job.setParams(cab.id, mod.setEnvelope({ ...p, bottomClearanceHeight: Math.max(0, Math.round(v)) }, { H: env.H })), { step: 5, min: 0 }),
      numField("Front clearance (mm)", p.frontClearance ?? 2.5, (v) => job.setParams(cab.id, { ...p, frontClearance: Math.max(0, v) }), { step: 0.5, min: 0 }),
      el("label", { class: "field check" }, [
        el("span", { text: "Locks" }),
        el("input", { type: "checkbox", checked: p.lockEnabled !== false, onchange: (e) => job.setParams(cab.id, { ...p, lockEnabled: e.target.checked }) }),
      ]),
    ]),
    section("Position", [
      numField("X (mm)", cab.pose.x, setPose("x"), { min: -1e6 }),
      numField("Y (mm)", cab.pose.y, setPose("y"), { min: -1e6 }),
      numField("Rotation (°)", cab.pose.rotZ || 0, (v) => job.setPose(cab.id, { rotZ: ((Math.round(v / 90) * 90) % 360 + 360) % 360 }), { step: 90, min: -1e6 }),
    ]),
    section("Material (job stock)", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: `${p.carcassColorName || p.carcassColor || "White Stipple"} · ${cpt} mm` })]),
      el("div", { class: "kv" }, [el("span", { text: "Door" }), el("b", { text: `${p.doorColorName || p.doorColor || "—"} · ${fpt} mm` })]),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} mm · ${columns.length} columns · kick ${Math.round(bch)} · ${result?.boards?.length || 0} boards` }),
    ]),
    shared.board,
    section(`Front view · from the room · ${columns.length} column${columns.length === 1 ? "" : "s"}`, [
      el("div", { class: "zs-tools" }, [addColumn, addZone, removeZone, removeColumn]),
      front,
      el("div", { class: "zs-hint", text: "Click a cell to select it · drag an orange line (column width / zone height) · Shift = 1 mm" }),
    ]),
    ...(cellCard || []),
    fold,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

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

function renderLounge(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const style = p.style || "L_SHAPE";
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
    renderPanel();
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
      renderPanel();
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
    numField("Seat height (mm)", p.height ?? env.H, (v) => setP("height", Math.max(mod.minSize.H, Math.round(v)), "size"), { step: 10, min: mod.minSize.H }),
    check("Top lids", p.topLidEnabled !== false, (on) => setP("topLidEnabled", on, "lid"), "Storage under the seat: an opening in each top with a lift-out lid"),
    style === "PARALLEL" ? check("Middle cabinet", p.hasMiddleCabinet === true, (on) => setP("hasMiddleCabinet", on, "midCab"), "A low cabinet between the two runs, against the wall") : null,
    style !== "U_SHAPE" ? check("Wheel-arch cut-out", p.wheelAvoidanceEnabled === true, (on) => setP("wheelAvoidanceEnabled", on, "wheel")) : null,
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

// --- bedroom body editor ------------------------------------------------------------
//
// Wide page while the Bedroom body is selected: the generator's 2D front
// elevation (click a region to select it, drag a boundary to move it — boot
// deck, wardrobe inner faces, overhead underside; 10 mm
// steps, Shift = 1 mm), the four layout numbers as fields, a card for the
// selected region, and the body-level fields folded below. Width, depth and
// roof are not edited here: they come from the vehicle and the placement.
// Every edit is one undo step; a boundary drag commits once on release.

let bedroomDrag = null; // { cabId, refresh } while a front-view boundary is dragged

function renderBedroom(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const valid = !!result && !result.validation.errors.length;
  const rp = valid ? result.params : p;
  const info = valid ? result.layout : null;
  const selectedRegion = job.getSelectedRegion();
  const labelOf = (key) => BEDROOM_LAYOUT_LABEL[key] || key;

  const setLayout = (key, value, how, extra = {}) => {
    const next = mod.setLayout(p, key, value);
    const to = next[key];
    const clamped = Math.round(value) !== Math.round(to) ? mod.layoutLimits(p, key) : null;
    if (next === p) { log("bedroom.layout.set", { id: cab.id, key, from: p[key], to, how, clamped, changed: false, ...extra }); return; }
    job.setParams(cab.id, next);
    log("bedroom.layout.set", { id: cab.id, key, from: p[key], to, how, clamped, changed: true, ...extra });
  };

  // A drag in progress: redraw the SVG in place and keep the container (and its pointer capture) alive.
  if (bedroomDrag && bedroomDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    bedroomDrag.refresh();
    return;
  }

  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    const res = job.resultFor(cab.id);
    front.innerHTML = mod.frontView(res, { selectedRegion: job.getSelectedRegion() }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  };
  drawFront();

  // Region selection: one click on a region. Boundary drag: pointer down on a boundary group.
  front.addEventListener("click", (e) => {
    if (bedroomDrag) return;
    const region = e.target.closest?.("[data-region]");
    if (!region) return;
    const id = region.getAttribute("data-region");
    job.select(cab.id, job.getSelectedRegion() === id ? null : { regionId: id });
  });
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    const svg = front.querySelector("svg");
    if (!g || !svg || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const key = g.getAttribute("data-boundary");
    const axis = g.getAttribute("data-axis");
    const side = Number(g.getAttribute("data-side") || 0);
    const zoneIndex = Number(g.getAttribute("data-index") || 0);
    const params0 = cab.params;
    const from = key === "ohcZone" ? params0.ohcZones : params0[key];
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
    const W = params0.width;
    const valueAt = (mm) => (key === "wardrobeWidth" ? (side > 0 ? W - mm : mm) : mm);
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    front.classList.add("dragging");
    g.classList.add("active");
    bedroomDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(valueAt(toMm(ev.clientX, ev.clientY)) / step) * step;
      const next = key === "ohcZone" ? mod.setOhcBoundary(params0, zoneIndex, v) : mod.setLayout(params0, key, v);
      job.setParams(cab.id, next, { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      front.classList.remove("dragging");
      bedroomDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("bedroom.layout.drag", { id: cab.id, key, side: side || undefined, from, to: now ? (key === "ohcZone" ? now.params.ohcZones : now.params[key]) : null, changed, where: "front view" });
      renderPanel();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  // Layout fields: the four numbers, each with the range the other three leave it.
  const layoutField = (key, label, hint) => {
    const lim = mod.layoutLimits(p, key);
    const field = numField(`${label} (mm)`, p[key] ?? rp[key], (v) => setLayout(key, v, "type"), { step: 10, min: 0 });
    field.title = `${lim.min} … ${lim.max} mm${hint ? ` · ${hint}` : ""}`;
    return field;
  };
  const layoutSection = section("Layout · symmetric left / right", [
    layoutField("bootHeight", "Tunnel boot height", "top of the boot deck"),
    layoutField("wardrobeWidth", "Wardrobe width, each side", "side wall → inner face"),
    layoutField("ohcBottom", "Overhead door bottom", "up-flap underside; the bottom panel is 30 above"),
    el("label", { class: "field" }, [
      el("span", { text: "Overhead bays" }),
      el("select", { title: "Up flaps only. Two is the Style 3 split; three uses the 100 mm hinge inset.", onchange: (e) => {
        const n = Number(e.target.value);
        e.target.blur();
        const before = info && info.ohc ? info.ohc.zones.length : 2;
        job.setParams(cab.id, mod.setOhcCount(p, n));
        log("bedroom.layout.set", { id: cab.id, key: "ohcZones", from: before, to: n, how: "select", changed: n !== before });
      } }, [
        el("option", { value: "2", text: "2 · up flaps", selected: (info && info.ohc ? info.ohc.zones.length : 2) === 2 }),
        el("option", { value: "3", text: "3 · up flaps", selected: (info && info.ohc ? info.ohc.zones.length : 2) === 3 }),
      ]),
    ]),
    el("label", { class: "field" }, [
      el("span", { text: "Bed frame" }),
      el("select", { title: "A product size: the opening must take it and the bed box is exactly this wide", onchange: (e) => { const v = e.target.value; e.target.blur(); job.setParams(cab.id, { ...p, bedFrame: v }); log("bedroom.layout.set", { id: cab.id, key: "bedFrame", from: p.bedFrame, to: v, how: "select", changed: v !== p.bedFrame }); } },
        [el("option", { value: "queen", text: `Queen · ${info ? Math.round(info.bedFrameWidth) : 1508} wide`, selected: true })]),
    ]),
    el("label", { class: "field" }, [
      el("span", { text: "Wardrobe style" }),
      el("select", { title: "Style 1: door over a fixed panel, the split is draggable. Nook: door over an open nook with a shelf, the shelf underside is draggable.", onchange: (e) => { const v = e.target.value; e.target.blur(); job.setParams(cab.id, { ...p, style: v }); log("bedroom.layout.set", { id: cab.id, key: "style", from: p.style || "style1", to: v, how: "select", changed: v !== (p.style || "style1") }); } },
        Object.entries(BEDROOM_WARDROBE_STYLE).map(([id, s]) => el("option", { value: id, text: s.label, selected: (p.style || "style1") === id }))),
    ]),
    (p.style || "style1") === "nook"
      ? (info && info.front ? kv("Wardrobe bottom", `${Math.round(info.front.nookShelfBottom)} · boot + 401, not dragged`) : null)
      : layoutField("fixedPanelTop", "Fixed panel top", "split: door starts this + 4 mm"),
    el("label", { class: "field check" }, [
      el("span", { text: "LED channels" }),
      el("input", { type: "checkbox", checked: p.ledGroove !== false, title: "14.5 × 6.5 channel along the front of every T3 top (0.5 in front of T1) with a 20 mm feed branch near each end; in the nook style also one under each nook shelf.", onchange: (e) => {
        const on = !!e.target.checked;
        job.setParams(cab.id, { ...p, ledGroove: on });
        log("bedroom.layout.set", { id: cab.id, key: "ledGroove", from: p.ledGroove !== false, to: on, how: "toggle", changed: on !== (p.ledGroove !== false) });
      } }),
    ]),
    info ? kv("Mattress opening", `${Math.round(info.openingWidth)} wide × ${Math.round(info.openingHeight)} high · ${Math.round(info.bedMargin)} beside the bed each side`) : null,
    info ? kv("Overhead at the room face", `${Math.round(info.ohcHeight)} high`) : null,
    info && info.ohc ? kv("Overhead bays", `${info.ohc.zones.map((z) => Math.round(z.width * 10) / 10).join(" + ")} · bottom panel to ${Math.round(info.ohc.bpBack)}`) : null,
    info ? kv("Bed box", `${Math.round(mod.bedBoxSize(rp).W)} wide × ${Math.round(mod.bedBoxSize(rp).H)} high · from the bed frame and the boot`) : null,
    info && info.top ? kv("Wardrobe top", `T3 seat ${Math.round(info.top.seat)} · roof ${Math.round(info.top.roofAtT2)} at the T2 back · T2 ${Math.round(info.top.t2Height)} high`) : null,
    info && info.front ? kv("Wardrobe fronts", info.front.style === "nook"
      ? `door ${Math.round(info.front.doorBottom)}–${Math.round(info.front.doorTop)} · nook open ${Math.round(info.front.floorTop)}–${Math.round(info.front.nookShelfBottom)} · wall gap ${info.front.clearance}`
      : `door ${Math.round(info.front.doorBottom)}–${Math.round(info.front.doorTop)} · fixed panel ${Math.round(info.front.floorTop)}–${Math.round(info.front.fixedPanelTop)} · clearance ${info.front.clearance}`) : null,
    el("div", { class: "empty small", text: `Drag a boundary in the front view (10 mm, Shift = 1 mm) or type here. ${(p.style || "style1") === "nook" ? "Nook: the wardrobe bottom is boot + 401 and does not drag; the door starts there." : "The orange line on each wardrobe is the fixed-panel top — the door starts 4 mm above it."} The wardrobes stop where the opening equals the bed frame. Width, depth and roof come from the vehicle.` }),
  ].filter(Boolean));

  // Selected region card.
  let regionCard = null;
  const zone = valid ? result.zones.find((z) => z.id === selectedRegion) : null;
  if (zone) {
    const drives = zone.id === "boot" ? ["bootHeight"] : zone.id === "ohc" ? ["ohcBottom"] : zone.id === "opening" ? ["bootHeight", "ohcBottom", "wardrobeWidth"] : ["wardrobeWidth"];
    regionCard = section(`${zone.label} · ${zone.kind === "void" ? "opening" : "block"}`, [
      kv("Across (X)", `${Math.round(zone.x0)} – ${Math.round(zone.x1)} · ${Math.round(zone.x1 - zone.x0)} wide`),
      kv("Height (Z)", `${Math.round(zone.z0)} – ${Math.round(zone.z1)}${zone.roofTop ? " at the room face, cut to the roof" : ""}`),
      kv("Depth (Y)", `${Math.round(zone.y1)}${zone.y1 < rp.depth - 0.5 ? ` of ${Math.round(rp.depth)} — the roof cuts it off` : ""}`),
      kv("Set by", drives.map(labelOf).join(", ")),
      zone.boards && zone.boards.length
        ? el("div", { class: "kv" }, [el("span", { text: `Boards (${zone.boards.length})` }), el("b", {}, zone.boards.map((id) =>
            el("a", { class: "link", text: `${id} `, title: "Select this board", onclick: () => job.select(cab.id, { boardId: id }) })))])
        : null,
      el("div", { class: "empty small", text: zone.kind === "void"
        ? "Not a part: what the boot deck, the wardrobe inner faces and the overhead underside leave free. The bed frame stands here and the bed box continues it into the room."
        : zone.id === "boot"
          ? "Made of boards: the deck on top, an upright on the room face and one at the nose, all wall to wall. Click a board id or a board in 3D to read it."
          : zone.id === "ohc"
            ? "Its own bottom panel, side panels and dividers, a T3 notched for those uprights, and up-flap doors. T1 and T2 are the shared rails. No rear T4. The bottom panel is cut long — trim it to the roof."
          : zone.boards && zone.boards.length
            ? ((p.style || "style1") === "nook"
              ? "Wall strip, colour panel, kick and floor, the nook shelf (LED channel underneath) and the door from the shelf underside to T3. The nook under the shelf stays open to the room. T1 / T2 run wall to wall on the T3s."
              : "Wall strip, colour panel, the shelf 10 above the wardrobe floor, T3, the door (hangs in front of the room face) and the fixed panel under it. T1 / T2 run wall to wall on the T3s.")
            : "One block for now — its boards come in a later version, each bounded by this region's faces." }),
    ].filter(Boolean));
  }

  // Body-level fields, folded: depth from the placement, width / roof from the vehicle.
  const fromSpace = "Set by the vehicle: redefine the space to change it";
  const nBoards = result?.boards?.length || 0;
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Body · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${valid ? result.zones.length : 0} regions · ${nBoards} boards` }),
    section("Envelope (= nose body)", [
      numField("Width (mm)", env.W, () => {}, { readOnly: fromSpace }),
      numField("From front (mm)", env.D, shared.setNoseDepth),
      numField("Height at room face (mm)", env.H, () => {}, { readOnly: fromSpace }),
      info ? kv("Roof at the nose", `${Math.round(info.roofMin)} mm`) : null,
    ].filter(Boolean)),
    section("Material (job stock)", [
      kv("Carcass", `${p.carcassColorName || p.carcassColor || "White Stipple"} · ${p.panelThickness ?? thickness(job.getStock(), "carcass")} mm`),
      el("div", { class: "empty small", text: "The boot uprights are carcass stock; the boot deck thickness is a bedroom rule (rules.json). Wardrobes and overhead are still drawn as solids." }),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} body` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} mm · boot ${Math.round(p.bootHeight)} · wardrobes ${Math.round(p.wardrobeWidth)} · overhead from ${Math.round(p.ohcBottom)} · ${nBoards} boards` }),
    ]),
    shared.board,
    section("Front view · from the room", [
      front,
      el("div", { class: "zs-hint", text: "Click a region to select it · drag an orange boundary · Shift = 1 mm" }),
    ]),
    layoutSection,
    regionCard,
    fold,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

// --- cabinet ---------------------------------------------------------------------

function renderCabinet(cab) {
  const mod = getModule(cab.moduleId);
  const result = job.resultFor(cab.id);
  const env = mod.envelope(cab.params);
  const p = cab.params;
  const cpt = p.panelThickness ?? thickness(job.getStock(), "carcass");
  const interior = Math.round((env.H - 2 * cpt) * 10) / 10;

  const setEnv = (k) => (v) => job.setParams(cab.id, mod.setEnvelope(p, { [k]: Math.max(mod.minSize[k], v) }));
  const setParam = (k, min = 0) => (v) => job.setParams(cab.id, { ...p, [k]: Math.max(min, v) });
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });

  const zones = p.zones || [];
  const zoneRows = zones.map((z, i) => {
    const type = el("select", {
      onchange: (e) => {
        const next = zones.map((zz) => ({ ...zz }));
        next[i].type = e.target.value;
        e.target.blur();
        job.setParams(cab.id, { ...p, zones: next });
      },
    }, mod.zoneTypes.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.type })));
    const height = el("input", { type: "number", value: z.height, step: 1, min: 0 });
    height.addEventListener("change", () => {
      const v = Number(height.value);
      if (!Number.isFinite(v) || v <= 0) { height.value = z.height; return; }
      // Changing one zone: the neighbour below (or above for the last) absorbs the difference.
      const next = zones.map((zz) => ({ ...zz }));
      const j = i < next.length - 1 ? i + 1 : i - 1;
      const delta = v - next[i].height;
      if (j >= 0 && next[j].height - delta >= 60) {
        next[i].height = v;
        next[j].height = Math.round((next[j].height - delta) * 10) / 10;
        job.setParams(cab.id, { ...p, zones: next });
      } else {
        height.value = z.height;
      }
    });
    const remove = el("button", { class: "icon", title: "Remove zone", text: "×", disabled: zones.length <= 1,
      onclick: () => {
        const next = zones.filter((_, k) => k !== i);
        job.setParams(cab.id, { ...p, zones: fitZones(next, interior) });
      } });
    return el("div", { class: "zone-row" }, [el("span", { class: "zone-idx", text: String(i + 1) }), type, height, remove]);
  });

  const addZone = el("button", { class: "tb wide", text: "+ Add zone", onclick: () => {
    // New zone takes up to 150 mm from the tallest existing zone.
    const next = zones.map((zz) => ({ ...zz }));
    const tallest = next.reduce((a, b) => (b.height > a.height ? b : a), next[0]);
    const take = Math.min(150, tallest.height - MIN_ZONE_HEIGHT);
    const zone = { id: `zone-${Date.now().toString(36)}`, type: "drawer", height: take };
    if (take >= MIN_ZONE_HEIGHT) {
      tallest.height = Math.round((tallest.height - take) * 10) / 10;
      next.push(zone);
      job.setParams(cab.id, { ...p, zones: next });
    } else {
      next.push({ ...zone, height: MIN_ZONE_HEIGHT });
      job.setParams(cab.id, { ...p, zones: fitZones(next, interior) });
    }
  } });

  const errors = result?.validation?.errors || [];
  const warnings = result?.validation?.warnings || [];

  const checks = errors.length || warnings.length
    ? el("div", { class: "panel-section" }, [
        el("div", { class: "sec-title", text: "Checks" }),
        ...errors.map((m) => el("div", { class: "msg err", text: m })),
        ...warnings.map((m) => el("div", { class: "msg warn", text: m })),
      ])
    : null;
  const remove = el("button", { class: "tb danger", text: "Remove cabinet", onclick: () => job.removeCabinet(cab.id) });

  // Nose slab (Bedroom): width and height come from the vehicle, only the depth is free;
  // the depth keeps the nose end fixed and moves the room-side face (like its D handle).
  const setNoseDepth = (v) => {
    const D = Math.max(mod.minSize.D, v);
    const shift = env.D - D;
    const a = ((cab.pose.rotZ || 0) * Math.PI) / 180;
    const before = job.snapshot();
    job.updateCabinet(cab.id, (c) => {
      c.params = mod.setEnvelope(c.params, { D });
      c.pose = { ...c.pose, x: c.pose.x - Math.sin(a) * shift, y: c.pose.y + Math.cos(a) * shift };
    });
    job.commitSnapshot(before);
  };
  if (mod.panel === "bedroom") {
    renderBedroom(cab, mod, result, { checks, remove, setNoseDepth, board: boardSection() });
    fillDrawer(result, errors, warnings);
    return;
  }

  const board = boardSection();

  if (mod.panel === "bedSide") {
    renderBedSide(cab, mod, result, { checks, remove, board, setEnv });
    fillDrawer(result, errors, warnings);
    return;
  }

  // Bed box: stands in the body's mattress opening — W (bed frame) and H (boot) from the body, only the length is free.
  const bedChildren = [
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: mod.label }),
      el("div", { class: "panel-sub", text: `${cab.id} · on the body's room face · centred · ${result?.boards?.length || 0} boards` }),
    ]),
    board,
    section("Size", [
      numField("Width (mm)", env.W, () => {}, { readOnly: "From the Bedroom body: the bed frame's width (queen 1508). Change the body's bed frame." }),
      dragField("Length from body (mm)", env.D, setEnv("D"), cab.id, "D", "Show an arrow at the room end of the box; drag it to change the length"),
      numField("Height (mm)", env.H, () => {}, { readOnly: "From the Bedroom body: its tunnel boot height." }),
    ]),
    section("Boards", [
      el("div", { class: "empty small", text: "Two side panels, an end panel (1 mm wider each side for edge banding), a centre divider notched at both ends, four long rails against the sides and four short rails across the box (one on the floor, one flush with the top; the short rails notched 20 × 20 for the divider — a half-lap). No bottom, no top, no board on the body face: the boot's upright is there. Everything is the bed box stock (18)." }),
      kv("Stock", `${p.panelThickness ?? 18} mm · ${p.carcassColorName || p.carcassColor || "White Stipple"}`),
    ]),
    el("div", { class: "panel-section" }, [
      el("div", { class: "empty small", text: "Follows the Bedroom body: centred on the van, against the body's room-side face, as wide as the bed frame and as high as the boot." }),
    ]),
    checks,
    el("div", { class: "panel-foot" }, [remove]),
  ];
  if (mod.panel === "ohc") {
    renderOverhead(cab, mod, result, { checks, remove, board });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "tall") {
    renderTall(cab, mod, result, { checks, remove, board });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "kitchen") {
    renderKitchen(cab, mod, result, { checks, remove, board });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "lounge") {
    renderLounge(cab, mod, result, { checks, remove, board });
    fillDrawer(result, errors, warnings);
    return;
  }

  const boxChildren = [
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${result?.boards?.length || 0} boards` }),
    ]),
    board,
    section("Outer size (= box)", [
      numField("Width (mm)", env.W, setEnv("W")),
      numField("Depth (mm)", env.D, setEnv("D")),
      numField("Height (mm)", env.H, setEnv("H")),
    ]),
    section(`Zones · top → bottom · interior ${interior} mm`, [
      el("div", { class: "zone-list" }, zoneRows),
      addZone,
    ]),
    section("Position", [
      numField("X (mm)", cab.pose.x, setPose("x"), { min: -1e6 }),
      numField("Y (mm)", cab.pose.y, setPose("y"), { min: -1e6 }),
      numField("Rotation (°)", cab.pose.rotZ || 0, (v) => job.setPose(cab.id, { rotZ: ((Math.round(v / 90) * 90) % 360 + 360) % 360 }), { step: 90, min: -1e6 }),
    ]),
    section("Material", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: p.carcassColorName || p.carcassColor || "White Stipple" })]),
      el("div", { class: "kv" }, [el("span", { text: "Door" }), el("b", { text: p.doorColorName || p.doorColor || "—" })]),
      numField("Carcass thickness", cpt, setParam("panelThickness", 1), { step: 0.5 }),
      numField("Front thickness", p.frontPanelThickness ?? thickness(job.getStock(), "door"), setParam("frontPanelThickness", 1), { step: 0.5 }),
      numField("Front clearance", p.frontClearance ?? 2.5, setParam("frontClearance", 0), { step: 0.5 }),
    ]),
    checks,
    el("div", { class: "panel-foot" }, [remove]),
  ];
  panel.replaceChildren(...(mod.placement === "bedBox" ? bedChildren : boxChildren).filter(Boolean));
  fillDrawer(result, errors, warnings);
}

function bedSideChoice(side, type) {
  if (type === "drawer") return "drawer";
  const towardWall = side === "left" ? "right_door" : "left_door";
  return type === towardWall ? "wall" : "bed";
}
function bedSideType(side, choice) {
  if (choice === "drawer") return "drawer";
  if (choice === "wall") return side === "left" ? "right_door" : "left_door";
  return side === "left" ? "left_door" : "right_door";
}

let bedSideDrag = null; // { cabId, refresh } while the shelf line is dragged in the front view

function renderBedSide(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const side = p.side === "right" ? "right" : "left";
  const lim = mod.dividers(p, result)[0];
  // A drag in progress: redraw the SVG in place and keep the container (and its listeners) alive.
  if (bedSideDrag && bedSideDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    bedSideDrag.refresh();
    return;
  }
  const setShelf = (z) => {
    job.setParams(cab.id, { ...p, shelfCenter: z });
    log("bedside.shelf", { id: cab.id, side, from: p.shelfCenter, to: z });
  };
  const setZone = (index, choice) => {
    const zones = (p.zones || []).map((z) => ({ ...z }));
    zones[index] = { ...zones[index], type: bedSideType(side, choice) };
    job.setParams(cab.id, { ...p, zones });
    log("bedside.zone", { id: cab.id, side, index, type: zones[index].type });
  };
  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => { front.innerHTML = mod.frontView(job.resultFor(cab.id)) || ""; };
  drawFront();
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    if (!g || !front.querySelector("svg") || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const before = job.snapshot();
    const from = p.shelfCenter;
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    bedSideDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const svg = front.querySelector("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const k = Number(svg.getAttribute("width")) / rect.width;
      const scale = Number(svg.dataset.scale);
      const oy = Number(svg.dataset.oy);
      const H = Number(svg.dataset.h);
      const z = H - ((ev.clientY - rect.top) * k - oy) / scale;
      const step = ev.shiftKey ? 1 : 10;
      job.setParams(cab.id, mod.setDivider(p, result, 0, Math.round(z / step) * step), { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      bedSideDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("bedside.shelf", { id: cab.id, side, from, to: now ? now.params.shelfCenter : null, changed, where: "front view" });
      renderPanel();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });
  const zoneSelect = (index, label) => {
    const type = (p.zones && p.zones[index] && p.zones[index].type) || "drawer";
    const choice = bedSideChoice(side, type);
    return el("label", { class: "field" }, [
      el("span", { text: label }),
      el("select", { onchange: (e) => { e.target.blur(); setZone(index, e.target.value); } }, [
        el("option", { value: "drawer", text: "Drawer", selected: choice === "drawer" }),
        el("option", { value: "wall", text: "Door · hinge at the wall", selected: choice === "wall" }),
        el("option", { value: "bed", text: "Door · hinge at the bed", selected: choice === "bed" }),
      ]),
    ]);
  };
  panel.replaceChildren(
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `Bed side · ${side}` }),
      el("div", { class: "panel-sub", text: `${cab.id} · the other table mirrors this · ${result?.boards?.length || 0} boards` }),
    ]),
    shared.board,
    section("Front view", [
      front,
      el("div", { class: "zs-hint", text: "Drag the orange line to move the middle shelf · Shift = 1 mm" }),
    ]),
    section("Layout", [
      numField("Width (mm)", env.W, () => {}, { readOnly: "The body's wardrobe width: the door-stock side panel stands under the colour panel." }),
      numField("Into the room (mm)", env.D, shared.setEnv("D")),
      numField("Top (mm)", env.H, shared.setEnv("H")),
      numField("Middle shelf centre (mm)", p.shelfCenter, setShelf, { step: 10, min: lim ? lim.min : 0, max: lim ? lim.max : env.H }),
      zoneSelect(0, "Lower"),
      zoneSelect(1, "Upper"),
      el("div", { class: "empty small", text: "No back. Each shelf's tongues go through the carcass sides over the middle third of the depth. The bed-side panel is door stock, under the colour panel; the fronts cover it. Removing one table removes both." }),
    ]),
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  );
}

/** Checks + Boards tabs of the bottom drawer for a generated cabinet. */
function fillDrawer(result, errors, warnings) {
  drawerChecks.replaceChildren(
    errors.length || warnings.length
      ? el("div", {}, [
          ...errors.map((m) => el("div", { class: "msg err", text: m })),
          ...warnings.map((m) => el("div", { class: "msg warn", text: m })),
        ])
      : el("div", { class: "empty ok", text: "All checks passed." }),
  );

  const boards = result?.boards || [];
  const sub = job.getSubSelection();
  const cabId = job.getSelectedId();
  drawerBoards.replaceChildren(
    boards.length
      ? el("table", { class: "grid pick" }, [
          el("thead", {}, [el("tr", {}, ["ID", "Name", "Type", "L (mm)", "W (mm)", "T (mm)", "Faces"].map((h) => el("th", { text: h })))]),
          el("tbody", {}, boards.map((b) => {
            const d = boardDims(b);
            const feats = (b.faces || []).reduce((n, f) => n + f.features.length, 0);
            // Same selection as the tree and the 3D view: one click = this board.
            return el("tr", { class: sub && sub.boardId === b.id ? "sel" : "", onclick: () => job.select(cabId, { boardId: b.id }) }, [
              el("td", { text: b.id }), el("td", { text: b.name }), el("td", { text: b.boardType }),
              el("td", { text: d.L.toFixed(1) }), el("td", { text: d.W.toFixed(1) }), el("td", { text: String(d.T) }),
              el("td", { text: b.faces ? `${b.faces.length}${feats ? ` · ${feats} feat.` : ""}` : "—" }),
            ]);
          })),
        ])
      : el("div", { class: "empty", text: "No boards — fix the checks first." }),
  );
}

function renderPlane(pl) {
  const AXIS = { x: "X (width)", y: "Y (depth)", z: "Z (height)" };
  panel.replaceChildren(
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Construction plane" }),
      el("div", { class: "panel-sub", text: pl.id }),
    ]),
    section("Offset", [
      el("div", { class: "kv" }, [el("span", { text: "From" }), el("b", { text: pl.from?.label || "—" })]),
      el("div", { class: "kv" }, [el("span", { text: "Distance" }), el("b", { text: `${Math.round(pl.offset)} mm` })]),
      el("div", { class: "kv" }, [el("span", { text: "Plane" }), el("b", { text: `${AXIS[pl.axis] || pl.axis} = ${Math.round(pl.value)}` })]),
    ]),
    el("div", { class: "panel-section" }, [
      el("div", { class: "empty small", text: "Intersections with walls, floor, ceiling and roof are snap points. Delete removes the plane." }),
    ]),
    el("div", { class: "panel-foot" }, [
      el("button", { class: "tb danger", text: "Remove plane", onclick: () => job.removePlane(pl.id) }),
    ]),
  );
  drawerChecks.replaceChildren(el("div", { class: "empty", text: "A construction plane has no checks." }));
  drawerBoards.replaceChildren(el("div", { class: "empty", text: "A construction plane has no boards." }));
}

/** A partition wall: read-only geometry (drawn in the floor plan), its checks, Remove. */
/** Cabinets standing in the way of a wall's doors: "cab-1 blocks op-1 in wall-2". */
function doorBlockers(w, s) {
  const out = [];
  for (const o of s.openings) {
    for (const cab of job.getJob().cabinets) {
      const fp = envelopeFootprint(cab, cab.pose);
      const box = { x: [fp.minX, fp.maxX], y: [fp.minY, fp.maxY], z: [fp.z0, fp.z1] };
      if (cabinetBlocksOpening(box, s, o)) out.push(`${cab.id} blocks the ${(OPENING_TYPES[o.type] || "door").toLowerCase()} ${o.id} in ${w.id} (within ${DOOR_CLEAR_DEPTH} mm).`);
    }
  }
  return out;
}

function renderWall(w) {
  const st = statusOf(w);
  const s = st.solid;
  const stock = job.getStock();
  const cl = partitionClearance(stock);
  const blocked = [...(st.warnings || []), ...doorBlockers(w, s)];
  const along = s.along.toUpperCase();
  const across = w.axis.toUpperCase();
  const anchorText = (a) => a || "free";
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Partition wall" }),
      el("div", { class: "panel-sub", text: `${w.id} · ${wallOrientation(w)}` }),
    ]),
    section("Geometry", [
      el("div", { class: "kv" }, [el("span", { text: "Length" }), el("b", { text: `${Math.round(wallLength(w))} mm` })]),
      el("div", { class: "kv" }, [el("span", { text: `From ${along}` }), el("b", { text: `${Math.round(w.u0)}` })]),
      el("div", { class: "kv" }, [el("span", { text: `To ${along}` }), el("b", { text: `${Math.round(w.u1)}` })]),
      el("div", { class: "kv" }, [el("span", { text: `Reference face ${across}` }), el("b", { text: `${Math.round(w.at)} · grows ${w.side > 0 ? "+" : "−"}${across}` })]),
      el("div", { class: "kv" }, [el("span", { text: `Faces ${across}` }), el("b", { text: `${Math.round(w.axis === "x" ? s.x0 : s.y0)} … ${Math.round(w.axis === "x" ? s.x1 : s.y1)}` })]),
      el("div", { class: "kv" }, [el("span", { text: "Rests on" }), el("b", { text: `${anchorText(st.anchors.lo)} / ${anchorText(st.anchors.hi)}` })]),
    ]),
    section("Stock (from the job catalogue)", [
      el("div", { class: "kv" }, [el("span", { text: "Thickness" }), el("b", { text: `${s.thickness} mm · Partition` })]),
      el("div", { class: "kv" }, [el("span", { text: "Bottom" }), el("b", { text: `${cl.floor} mm above the floor` })]),
      el("div", { class: "kv" }, [el("span", { text: "Top" }), el("b", { text: `${Math.round(s.zTopMin)}${Math.abs(s.z1 - s.zTopMin) > 0.5 ? ` … ${Math.round(s.z1)}` : ""} (roof − ${cl.ceiling})` })]),
      el("div", { class: "empty small", text: "Thickness and clearances follow the Partition stock in the space dialog; every wall changes together." }),
    ]),
    section(`Doors (${(w.openings || []).length})`, [
      ...(w.openings || []).length
        ? s.openings.map((o) => {
            const sliding = o.type === "slidingDoor";
            const leaf = sliding ? (st.parts || []).find((p) => p.opId === o.id && p.part === "leaf") : null;
            const pelmet = sliding ? (st.parts || []).find((p) => p.opId === o.id && p.part === "pelmet") : null;
            const sideName = sliding ? (w.axis === "x" ? (o.side > 0 ? "right" : "left") : (o.side > 0 ? "back" : "front")) : null;
            return el("div", { class: "opening" }, [
              el("div", { class: "opening-head" }, [
                el("b", { text: o.id }),
                el("span", { text: `${OPENING_TYPES[o.type] || "Door"} · ${along} ${Math.round(o.u0)} … ${Math.round(o.u1)} · from the ${o.from === "lo" ? (s.along === "x" ? "left" : "front") : (s.along === "x" ? "right" : "back")} end` }),
                el("button", { class: "icon", text: "×", title: "Remove this door", onclick: () => job.removeOpening(w.id, o.id) }),
              ]),
              numField("Offset from end", o.offset, (v) => job.setOpening(w.id, o.id, { offset: v }), { step: 10, min: 0 }),
              numField("Width", o.width, (v) => job.setOpening(w.id, o.id, { width: v }), { step: 10, min: OPENING_MIN_WIDTH }),
              sliding ? null : numField("Bottom clearance", o.bottom, (v) => job.setOpening(w.id, o.id, { bottom: v }), { step: 10, min: 0 }),
              numField(sliding ? "Top clearance (pelmet height)" : "Top clearance", o.top, (v) => job.setOpening(w.id, o.id, { top: v }), { step: 10, min: 0 }),
              el("div", { class: "kv" }, [el("span", { text: "Hole" }), el("b", { text: `${Math.round(o.zBottom)} … ${Math.round(o.zTop)} high` })]),
              ...(sliding
                ? [
                    numField("Leaf wider by", o.overlap, (v) => job.setOpening(w.id, o.id, { overlap: v }), { step: 10, min: 0 }),
                    numField("Leaf height", o.doorHeight, (v) => job.setOpening(w.id, o.id, { doorHeight: v }), { step: 10, min: 1 }),
                    el("div", { class: "kv" }, [
                      el("span", { text: "Hangs on" }),
                      el("b", { text: `${sideName} side` }),
                      el("button", { class: "tb", text: "Flip", title: "Hang the door on the other face of the wall", onclick: () => job.setOpening(w.id, o.id, { side: -o.side }) }),
                    ]),
                    leaf ? el("div", { class: "kv" }, [el("span", { text: "Leaf" }), el("b", { text: `${Math.round(leaf.length)} × ${Math.round(o.doorHeight)} · ${SLIDING_GAP} off the wall · ${SLIDING_FLOOR_GAP} off the floor` })]) : null,
                    pelmet ? el("div", { class: "kv" }, [el("span", { text: "Pelmet" }), el("b", { text: `${Math.round(pelmet.length)} × ${Math.round(pelmet.height)} · ${pelmet.stoppedBy.lo} → ${pelmet.stoppedBy.hi}` })]) : null,
                    leaf && pelmet ? el("div", { class: "kv" }, [el("span", { text: "Covers the leaf top by" }), el("b", { text: `${Math.round(pelmetCover(leaf, pelmet))} mm` })]) : null,
                    el("div", { class: "empty small", text: "Leaf and pelmet are Partition stock, derived from this record: the hole goes to the floor; the pelmet sits against the roof and runs until the space or another partition stops it." }),
                  ]
                : []),
            ]);
          })
        : [el("div", { class: "empty small", text: "No door yet. In the floor plan pick Shower door (D) or Sliding door (S): click an end of this wall, the door's first edge, its other edge (then the side it hangs on), then the numbers." })],
    ]),
    st.issues.length || blocked.length
      ? el("div", { class: "panel-section" }, [
          el("div", { class: "sec-title", text: "Checks" }),
          ...st.issues.map((m) => el("div", { class: "msg err", text: m })),
          ...blocked.map((m) => el("div", { class: "msg warn", text: m })),
        ])
      : null,
    el("div", { class: "panel-section" }, [
      el("div", { class: "empty small", text: "Walls and doors are drawn and re-drawn in the floor plan (button at the top right of the 3D view). Delete removes this wall." }),
      el("button", { class: "tb wide", text: "Open floor plan…", onclick: () => openFloorPlan("panel") }),
    ]),
    el("div", { class: "panel-foot" }, [
      el("button", { class: "tb danger", text: "Remove wall", onclick: () => job.removeWall(w.id) }),
    ]),
  ].filter(Boolean));
  drawerChecks.replaceChildren(
    st.issues.length || blocked.length
      ? el("div", {}, [...st.issues.map((m) => el("div", { class: "msg err", text: m })), ...blocked.map((m) => el("div", { class: "msg warn", text: m }))])
      : el("div", { class: "empty ok", text: "Wall rests on a wall, stays inside the space and overlaps nothing." }),
  );
  drawerBoards.replaceChildren(el("div", { class: "empty", text: "Partition walls are not cut into boards yet (v1)." }));
}

export function renderPanel() {
  const sel = job.getSelected();
  // The wide editor page only while an OHC or the Bedroom body is selected; everything else uses the narrow panel.
  const wide = !!sel && ["ohc", "bedroom", "bedSide", "tall", "kitchen", "lounge"].includes(getModule(sel.moduleId).panel);
  panel.classList.toggle("wide", wide);
  app.classList.toggle("wide-right", wide);
  if (sel) renderCabinet(sel);
  else {
    const pl = job.getSelectedPlane();
    const wall = job.getSelectedWall();
    if (pl) renderPlane(pl);
    else if (wall) renderWall(wall);
    else renderSpace();
  }
}
