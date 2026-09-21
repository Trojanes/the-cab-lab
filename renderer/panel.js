// Right panel: shows the space when nothing is selected, otherwise the
// selected cabinet's params. Every edit writes into job.js and regenerates.
import * as job from "./job.js";
import { getModule, fitZones, MIN_ZONE_HEIGHT, MIN_ZONE_WIDTH, fitZoneWidths, BEDROOM_LAYOUT_LABEL } from "./modules.js";
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
    const params0 = cab.params;
    const from = params0[key];
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
      job.setParams(cab.id, mod.setLayout(params0, key, v), { history: false });
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
      log("bedroom.layout.drag", { id: cab.id, key, side: side || undefined, from, to: now ? now.params[key] : null, changed, where: "front view" });
      renderPanel();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  // Layout fields: the four numbers, each with the range the other three leave it.
  const layoutField = (key, label, hint) => {
    const lim = mod.layoutLimits(p, key);
    const field = numField(`${label} (mm)`, p[key], (v) => setLayout(key, v, "type"), { step: 10, min: 0 });
    field.title = `${lim.min} … ${lim.max} mm${hint ? ` · ${hint}` : ""}`;
    return field;
  };
  const layoutSection = section("Layout · symmetric left / right", [
    layoutField("bootHeight", "Tunnel boot height", "top of the boot deck"),
    layoutField("wardrobeWidth", "Wardrobe width, each side", "side wall → inner face"),
    layoutField("ohcBottom", "Overhead bottom", "underside of the overhead block"),
    el("label", { class: "field" }, [
      el("span", { text: "Bed frame" }),
      el("select", { title: "A product size: the opening must take it and the bed box is exactly this wide", onchange: (e) => { const v = e.target.value; e.target.blur(); job.setParams(cab.id, { ...p, bedFrame: v }); log("bedroom.layout.set", { id: cab.id, key: "bedFrame", from: p.bedFrame, to: v, how: "select", changed: v !== p.bedFrame }); } },
        [el("option", { value: "queen", text: `Queen · ${info ? Math.round(info.bedFrameWidth) : 1508} wide`, selected: true })]),
    ]),
    info ? kv("Mattress opening", `${Math.round(info.openingWidth)} wide × ${Math.round(info.openingHeight)} high · ${Math.round(info.bedMargin)} beside the bed each side`) : null,
    info ? kv("Overhead at the room face", `${Math.round(info.ohcHeight)} high`) : null,
    info ? kv("Bed box", `${Math.round(mod.bedBoxSize(rp).W)} wide × ${Math.round(mod.bedBoxSize(rp).H)} high · from the bed frame and the boot`) : null,
    info && info.top ? kv("Wardrobe top", `T3 seat ${Math.round(info.top.seat)} · roof ${Math.round(info.top.roofAtT2)} at the T2 back · T2 ${Math.round(info.top.t2Height)} high`) : null,
    el("div", { class: "empty small", text: "Drag a boundary in the front view (10 mm, Shift = 1 mm) or type here. The wardrobes stop where the opening equals the bed frame. Width, depth and roof come from the vehicle." }),
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
          : zone.boards && zone.boards.length
            ? "So far: the colour panel (door stock, colour into the opening; cut down to the T3 seat in front of the T2 back, pocket for T3's tail) and T3. T1 / T2 run wall to wall on the T3s. Wall side, base, shelf and door come next."
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
  const wide = !!sel && ["ohc", "bedroom"].includes(getModule(sel.moduleId).panel);
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
