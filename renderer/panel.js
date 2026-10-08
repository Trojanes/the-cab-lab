// Right panel: shows the space when nothing is selected, otherwise the
// selected cabinet's params. Every edit writes into job.js and regenerates.
import * as job from "./job.js";
import { getModule, fitZones, MIN_ZONE_HEIGHT, MIN_ZONE_WIDTH, fitZoneWidths, setKitchenWidthColumn, BEDROOM_LAYOUT_LABEL, BEDROOM_WARDROBE_STYLE, fridgeParts, fridgeFix, fridgeRuleIssues, FRIDGE_BELOW_TYPES, FRIDGE_ABOVE_TYPES, FRIDGE_ZONE_LABEL, overheadEndPanel } from "./modules.js";
import { showControlPanelForm } from "./quickCard.js";
import { getSpaceKind } from "./spaces.js";
import { openSpaceDialog } from "./spaceDialog.js";
import { poseFits, armHandle, armedHandleFor } from "./cabinets3d.js";
import { thickness, partitionClearance } from "./materials.js";
import { catalogueFields } from "./catalogueMenu.js";
import { sideOfRotZ, sideLabel, overlaps, startGroove, removeGroove, startBoardEdit, kitchenEndBlocked } from "./interact.js";
import { wallLength, wallOrientation, wallBoards, cabinetBlocksOpening, pelmetCover, DOOR_CLEAR_DEPTH, OPENING_MIN_WIDTH, OPENING_TYPES, SLIDING_GAP, SLIDING_FLOOR_GAP, SHEET_SHORT_MM, SHEET_LONG_MM } from "./walls.js";
import { envelopeFootprint, envelopeBox } from "./cabinets3d.js";
import { keepCorner, localAxes } from "./pose.js";
import { statusOf } from "./walls3d.js";
import { openFloorPlan } from "./floorplan.js";
import { faceLabel, featureSummary, featureLine, boardDims, bigFaces, edgeFaces, dirName } from "./boardModel.js";
import { log } from "./log.js";
import { outlineSpan } from "./sketchBoard.js";
import { swatchChipStyle } from "./doorSwatches.js";
import { cabinetHits, noteGrowth, applyYield, declineYield, conflictLines } from "./yield.js";

const panel = document.getElementById("rightpanel");
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

/** "Door" row with a swatch chip in front of the colour name. */
function doorLine(p, fpt) {
  const name = p.doorColorName || p.doorColor || "—";
  const s = swatchChipStyle(name);
  const chip = el("span", {
    class: `swatch${!s ? " none" : s.finish === "metallic" ? " metallic" : ""}`,
    title: s ? s.title : "No swatch yet",
    style: s ? `background-color: ${s.background}${s.image ? `; background-image: url("${s.image}"); background-size: 400%` : ""}` : "",
  });
  return el("div", { class: "kv" }, [el("span", { text: "Door" }), el("b", {}, [chip, fpt == null ? name : `${name} · ${fpt} mm`])]);
}

// --- wood grain (textured HPL) ---------------------------------------------------------

const GRAIN_DIRS = [["horizontal", "Horizontal ═"], ["vertical", "Vertical ‖"]];
const GRAIN_GROUP_LABEL = {
  generalTallCabinet: { front: "Fronts · T1 / B1", side: "Side panels" },
  tallFridgeCabinet: { front: "Fronts · T1 / B1", side: "Side panel" },
  kitchenCabinet: { front: "Fronts · kick" },
  ensuiteCabinet: { front: "Fronts · kick" },
  overheadCabinet: { front: "Flaps · T1" },
  smallCabinet: { front: "Fronts", side: "Door-panel sides" },
  bedroom: { front: "Doors · overhead", side: "Colour panels" },
};
/** Last refused switch, shown under the toggles until the next change: `{ cabId, text }`. */
let grainNote = null;

/** Board issues from the generator as check lines: HPL sheet size (grain) and CNC milling (one face per board). */
function grainIssueLines(result) {
  return [...(result?.grain?.issues || []), ...(result?.milling?.issues || [])].map((i) => `${i.message}.`);
}

function setGrain(cab, mod, result, group, dir) {
  const from = result.grain.groups[group];
  if (from === dir) return;
  const next = { ...cab.params, grain: { ...(cab.params.grain || {}), [group]: dir } };
  const bad = (mod.generate(next).grain?.issues || []).filter((i) => i.group === group);
  if (bad.length) {
    grainNote = { cabId: cab.id, text: `Not switched: ${bad[0].message}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ""}.` };
    log("grain.blocked", { id: cab.id, group, from, to: dir, boards: bad.map((i) => ({ id: i.board, side: i.side, length: i.length, limit: i.limit })) });
    renderPanel();
    return;
  }
  grainNote = null;
  job.setParams(cab.id, next);
  log("grain.set", { id: cab.id, group, from, to: dir });
}

/** Horizontal / vertical toggle per group; only for textured HPL, only for groups the cabinet has. */
function grainSection(cab, mod, result) {
  const g = result?.grain;
  if (!g || !g.checked || !g.present?.length) return null;
  const labels = GRAIN_GROUP_LABEL[cab.moduleId] || {};
  const rows = g.present.map((group) => el("label", { class: "field" }, [
    el("span", { text: labels[group] || group }),
    el("div", { class: "seg-group" }, GRAIN_DIRS.map(([dir, text]) => el("button", {
      type: "button",
      class: `tb seg${g.groups[group] === dir ? " active" : ""}`,
      text,
      onclick: () => setGrain(cab, mod, result, group, dir),
    }))),
  ]));
  const note = grainNote && grainNote.cabId === cab.id ? el("div", { class: "msg err", text: grainNote.text }) : null;
  return section("Wood grain", [
    ...rows,
    note,
    el("div", { class: "empty small", text: "Textured HPL comes on 1200 × 2400 sheets: a board may be at most 1180 across the grain and 2380 along it." }),
  ]);
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

/** Local box the pose is measured from. Modules with their own box use that; the rest are x 0..W, y −door..D, z 0..H. */
function cabinetBox(mod, params) {
  if (typeof mod.localBox === "function") return mod.localBox(params);
  const e = mod.envelope(params);
  const fpt = params.frontPanelThickness ?? params.frontThickness ?? 16;
  return { x0: 0, x1: e.W, y0: -fpt, y1: e.D, z0: 0, z1: e.H };
}

/**
 * Typed outer size. Width asks which face moves. Depth keeps the back.
 * Height keeps the bottom, unless `heightFrom` is "top" (a ceiling-hung cabinet).
 * `depthPad` is added to the stored depth for the field (overhead: the door).
 */
function outerSizeFields(cab, mod, env, params, opts = {}) {
  const heightFrom = opts.heightFrom === "top" ? "top" : "bottom";
  const depthPad = opts.depthPad || 0;
  const show = { W: true, D: true, H: true, ...(opts.show || {}) };
  const readOnly = opts.readOnly || {};
  const logKind = opts.logKind || "cabinet.size";
  const shownOf = (key) => (key === "D" ? env.D + depthPad : env[key]);
  const commit = (key, value, face, column) => {
    const min = (mod.minSize?.[key] || 0) + (key === "D" ? depthPad : 0);
    const sized = Math.max(min, value);
    const from = shownOf(key);
    if (!(Math.abs(sized - from) > 1e-6)) return;
    const before = job.snapshot();
    const hits = opts.grow ? cabinetHits(cab) : null;
    const patch = key === "D" ? { D: sized - depthPad } : { [key]: sized };
    let next = mod.setEnvelope(params, patch, key === "W" && column != null ? { column } : undefined);
    if (!next) return;
    if (key === "W" && column != null) setKitchenWidthColumn(cab.id, column);
    if (opts.finish) next = opts.finish(next);
    const corner = key === "W"
      ? { x: face === "left" ? 1 : -1, y: -1, z: -1 }
      : key === "D"
        ? { x: -1, y: 1, z: -1 }
        : { x: -1, y: -1, z: heightFrom === "top" ? 1 : -1 };
    const pose = keepCorner(cab.pose, cabinetBox(mod, params), cabinetBox(mod, next), corner);
    job.updateCabinet(cab.id, (c) => { c.params = next; c.pose = pose; });
    const changed = job.commitSnapshot(before);
    const now = job.getJob().cabinets.find((c) => c.id === cab.id);
    if (hits && now && sized > from + 1e-6 && key !== "D") {
      const axes = localAxes(now.pose);
      const dir = key === "H" ? axes[heightFrom === "top" ? 5 : 4] : axes[face === "left" ? 1 : 0];
      noteGrowth(now, hits, dir.map((v) => Math.round(v)), "size");
    }
      log(logKind, {
      id: cab.id, key, from, to: sized,
      face: key === "W" ? face : key === "D" ? "back" : heightFrom,
      column: key === "W" && column != null ? column : undefined,
      changed,
    });
  };
  const askColumn = (v, face, field) => {
    const cols = opts.columns || [];
    if (cols.length < 2) { commit("W", v, face, 0); return; }
    field.parentElement?.querySelectorAll(".size-pop").forEach((n) => n.remove());
    const pop = el("div", { class: "size-pop" }, [
      el("span", { text: "Which column?" }),
      ...cols.map((col, i) => el("button", {
        type: "button", class: "tb", text: `Column ${i + 1}`,
        title: `${Math.round(col.width)} mm now. This column takes the whole change.`,
        onclick: () => { pop.remove(); commit("W", v, face, i); },
      })),
    ]);
    field.after(pop);
  };
  const askWidth = (v, field) => {
    field.parentElement?.querySelectorAll(".size-pop").forEach((n) => n.remove());
    const pop = el("div", { class: "size-pop" }, [
      el("span", { text: "Which face moves?" }),
      el("button", { type: "button", class: "tb", text: "Left", title: "The left face moves. The right face stays.", onclick: () => { pop.remove(); askColumn(v, "left", field); } }),
      el("button", { type: "button", class: "tb", text: "Right", title: "The right face moves. The left face stays.", onclick: () => { pop.remove(); askColumn(v, "right", field); } }),
    ]);
    field.after(pop);
  };
  const field = (key, label, title, onCommit) => {
    if (readOnly[key]) return numField(label, shownOf(key), () => {}, { readOnly: readOnly[key] });
    const shown = Math.round(shownOf(key) * 10) / 10;
    const input = el("input", { type: "number", value: shown, step: 10, min: 0, title });
    const row = el("label", { class: "field", title }, [el("span", { text: label }), input]);
    const go = () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v === shown) { input.value = shown; return; }
      onCommit(v, row);
    };
    input.addEventListener("change", go);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
    return row;
  };
  const labels = { W: "Width (mm)", D: "Depth (mm)", H: "Height (mm)", ...(opts.labels || {}) };
  const heightTitle = heightFrom === "top"
    ? "The top stays on the ceiling. The bottom moves."
    : "From the bottom upward. The bottom stays.";
  return [
    show.W ? field("W", labels.W, "Type a width, then choose whether the left face or the right face moves.", (v, row) => askWidth(v, row)) : null,
    show.D ? field("D", labels.D, "From the back. The back stays and the front moves.", (v) => commit("D", v)) : null,
    show.H ? field("H", labels.H, heightTitle, (v) => commit("H", v)) : null,
  ].filter(Boolean);
}

function section(title, children) {
  return el("div", { class: "panel-section" }, [el("div", { class: "sec-title", text: title }), ...children]);
}

/** One choice for every front elevation: clearance between faces, or centre line to centre line. */
let gapMode = "clear";
function gapSelect() {
  return el("select", {
    class: "gap-mode",
    title: "Distance shown between boards",
    onchange: (e) => { gapMode = e.target.value; renderPanel(); },
  }, [
    el("option", { value: "clear", text: "Clearance", selected: gapMode === "clear" }),
    el("option", { value: "center", text: "Centre to centre", selected: gapMode === "center" }),
  ]);
}
function frontSection(title, children) {
  return el("div", { class: "panel-section" }, [
    el("div", { class: "sec-head" }, [el("div", { class: "sec-title", text: title }), gapSelect()]),
    ...children,
  ]);
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
  // Grooves drawn with the Groove command: kept on the cabinet, listed and removable here.
  const cab = job.getJob().cabinets.find((c) => c.id === sub.cabId);
  const mine = job.boardGrooves(cab, b.id).filter((g) => !f || g.face === f.id);
  rows.push(el("div", { class: "sec-title", style: "margin-top:8px", text: `Your grooves (${mine.length})` }));
  for (const g of mine) {
    const w = Math.round((g.u1 - g.u0) * 10) / 10;
    const h = Math.round((g.v1 - g.v0) * 10) / 10;
    rows.push(el("div", { class: "groove-row" }, [
      el("span", { text: `${g.id} · ${g.kind === "tgroove" ? `T groove ${g.group || ""}` : "groove"} · face ${g.face} · ${w} × ${h} · ${g.depth} deep` }),
      el("button", { class: "tb", text: "×", title: "Remove this groove", onclick: () => removeGroove(sub.cabId, b.id, g.id) }),
    ]));
  }
  rows.push(el("button", { class: "tb wide", text: "Add groove… (G)", onclick: () => startGroove() }));
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
    const parts = all.filter((id) => !wallIds.has(id) && !cabIds.has(id.split(":")[0])); // "op-1 leaf" / "op-1 pelmet"
    if (parts.length) issues.push(`${cab.id} overlaps the sliding door ${parts.join(", ")}.`);
    const cabs = cabinetHits(cab).filter((id) => id > cab.id);
    if (cabs.length) issues.push(`${cab.id} overlaps cabinet ${cabs.join(", ")}.`);
    issues.push(...grainIssueLines(job.resultFor(cab.id)).map((m) => `${cab.id}: ${m}`));
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
      section("Cabinets", catalogueFields()),
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
    section("Cabinets", catalogueFields()),
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

function ohcSplitTargets(zones) {
  const out = [];
  let x = 0;
  for (let i = 0; i < zones.length - 1; i += 1) {
    x += Number(zones[i].width) || 0;
    if (zones[i].type === "rangehood_flap" && zones[i + 1].type === "rangehood_flap") continue;
    out.push({ after: i, x });
  }
  return out;
}

function startSplitDrag(e, cab, _mod, total) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const before = job.snapshot();
  const params0 = cab.params;
  const from = params0.splitAfter ?? null;
  const row = handle.parentElement;
  const rect = row.getBoundingClientRect();
  try { handle.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
  handle.classList.add("active");
  ohcDrag = { cabId: cab.id, refresh: () => {} };
  const move = (ev) => {
    const targets = ohcSplitTargets(params0.zones || []);
    if (!targets.length || !rect.width) return;
    const x = ((ev.clientX - rect.left) / rect.width) * total;
    const hit = targets.reduce((best, t) => (Math.abs(t.x - x) < Math.abs(best.x - x) ? t : best));
    job.setParams(cab.id, { ...params0, splitAfter: hit.after }, { history: false });
  };
  const end = (ev) => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    try { handle.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
    ohcDrag = null;
    const changed = job.commitSnapshot(before);
    const now = job.getSelected();
    log("ohc.split.move", {
      id: cab.id, from, to: now ? now.params.splitAfter ?? null : null,
      x: now ? job.resultFor(cab.id)?.debug?.split?.x ?? null : null,
      changed, where: "zone strip",
    });
    renderPanel();
  };
  e.currentTarget.addEventListener("pointermove", move);
  e.currentTarget.addEventListener("pointerup", end);
  e.currentTarget.addEventListener("pointercancel", end);
}

/**
 * The width a zone shows: clearance (face to face) or centre to centre, whichever the
 * front view's dropdown reads, from the last generation. Falls back to the stored span.
 */
function ohcShownWidths(cab, mod) {
  const zones = job.getSelected()?.id === cab.id ? job.getSelected().params.zones || [] : cab.params.zones || [];
  const read = typeof mod.zoneOpenings === "function" ? mod.zoneOpenings(job.resultFor(cab.id)) : [];
  const ok = read.length === zones.length;
  const out = zones.map((z, i) => (ok && read[i] ? (gapMode === "center" ? read[i].center : read[i].clear) : z.width));
  out.readout = ok; // false: the generator gave no openings (checks failing), so these are the stored spans
  return out;
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
    const shown = ohcShownWidths(cab, mod);
    const r1 = (v) => String(Math.round(v * 10) / 10);
    zs.forEach((z, i) => {
      cells[i].style.flexBasis = `${(z.width / total) * 100}%`;
      cells[i].querySelector(".zs-w").textContent = r1(shown[i] ?? z.width);
    });
    widthRow.replaceChildren(...zs.map((z, i) => el("span", { style: `flex-basis:${(z.width / total) * 100}%`, text: r1(shown[i] ?? z.width), title: !shown.readout ? "Stored width (boundary to boundary)" : gapMode === "center" ? "Centre to centre" : "Clearance" })));
    let acc = 0;
    const marks = [];
    zs.slice(0, -1).forEach((z, i) => {
      acc += z.width;
      const on = job.getSelected()?.params?.splitAfter === i;
      const mark = el("span", {
        class: on ? "zs-split" : "",
        style: `left:${(acc / total) * 100}%`,
        text: on ? "↔" : String(Math.round(acc)),
        title: on ? "Drag the split onto a line between zones" : "",
      });
      if (on) mark.addEventListener("pointerdown", (e) => startSplitDrag(e, cab, mod, total));
      marks.push(mark);
    });
    cumRow.replaceChildren(...marks);
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

function renderUShape(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const fitted = result?.params?.zones || p.zones || {};
  const set = (patch, key, from, to) => {
    job.setParams(cab.id, { ...p, ...patch });
    log("uohc.set", { id: cab.id, key, from, to });
  };
  const runCard = (run, label) => {
    const types = run === "BACK" ? mod.zoneTypes : mod.sideZoneTypes;
    const zones = (p.zones && p.zones[run]) || [{ id: `${run}-1`, type: "up_flap", width: 1 }];
    const shown = fitted[run] || zones;
    return section(label, [
      ...shown.map((z, i) => el("label", { class: "field" }, [
        el("span", { text: `Zone ${i + 1} · ${Math.round(z.width)} mm` }),
        el("select", { onchange: (e) => {
          const next = zones.map((zz) => ({ ...zz }));
          if (next[i]) next[i].type = e.target.value;
          e.target.blur();
          set({ zones: { ...p.zones, [run]: next } }, "zone", zones[i]?.type, e.target.value);
        } }, types.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === (zones[i]?.type || z.type) }))),
      ])),
    ]);
  };
  const hood = ["LEFT", "RIGHT"].some((run) => (fitted[run] || []).some((z) => z.type === "rangehood_flap"));
  const hoodCard = hood ? section("Range hood · NCE", [
    numField("Clear height (mm)", p.rangehoodClearHeight ?? 75, (v) => set({ rangehoodClearHeight: Math.max(1, Math.round(v)) }, "rangehoodClearHeight", p.rangehoodClearHeight ?? 75, Math.max(1, Math.round(v))), { step: 5, min: 1 }),
    el("label", { class: "field" }, [
      el("span", { text: "Opening from" }),
      el("div", { class: "seg-group" }, [["left", "Left"], ["right", "Right"]].map(([id, text]) => el("button", {
        type: "button",
        class: `tb seg${(p.rangehoodAlignment === "right" ? "right" : "left") === id ? " active" : ""}`,
        text,
        onclick: () => { if ((p.rangehoodAlignment === "right" ? "right" : "left") !== id) set({ rangehoodAlignment: id }, "rangehoodAlignment", p.rangehoodAlignment || "left", id); },
      }))),
    ]),
    numField("Offset from that side (mm)", p.rangehoodEdgeOffsetX ?? 40, (v) => set({ rangehoodEdgeOffsetX: Math.max(40, Math.round(v)) }, "rangehoodEdgeOffsetX", p.rangehoodEdgeOffsetX ?? 40, Math.max(40, Math.round(v))), { step: 1, min: 40 }),
    el("div", { class: "empty small", text: "A hood on the back run is turned into an up flap. On a side arm the hood stays outside the corner." }),
  ]) : null;
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "U overhead" }),
      el("div", { class: "panel-sub", text: `${cab.id} · back on the wall` }),
      el("div", { class: "panel-sizes" }, outerSizeFields(cab, mod, env, p, {
        logKind: "uohc.size",
        heightFrom: "top",
        show: { D: false },
        labels: { W: "Width along the wall (mm)" },
      })),
    ]),
    shared.board,
    section("Runs", [
      numField("Left arm (mm)", p.leftArmLength, (v) => set({ leftArmLength: Math.max(0, v) }, "leftArmLength", p.leftArmLength, v), { step: 10, min: 0 }),
      numField("Right arm (mm)", p.rightArmLength, (v) => set({ rightArmLength: Math.max(0, v) }, "rightArmLength", p.rightArmLength, v), { step: 10, min: 0 }),
      numField("Run depth (mm)", p.cabinetDepth, (v) => set({ cabinetDepth: Math.max(150, v) }, "cabinetDepth", p.cabinetDepth, v), { step: 10, min: 150 }),
      el("div", { class: "empty small", text: "The back run owns both corners. Each arm is only the part past that corner. Drawing the box sets both arms to the box depth; change an arm here afterwards." }),
    ]),
    runCard("LEFT", "Left arm"),
    runCard("BACK", "Back"),
    runCard("RIGHT", "Right arm"),
    hoodCard,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
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
    if (view) view.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneIndex: selected[0] ?? -1, gaps: gapMode }) || "";
    return;
  }

  const { strip, widthRow, cumRow } = zoneStrip(cab, mod);

  // Add / delete follow the selected zone, as in the kitchen: only that zone gives or takes width,
  // zones further right keep theirs. After a delete the split stays when the two zones across it survive.
  const r1 = (v) => Math.round(v * 10) / 10;
  const keepSplit = (patch, next) => {
    if (!Number.isInteger(p.splitAfter)) return patch;
    const leftId = zones[p.splitAfter]?.id;
    const rightId = zones[p.splitAfter + 1]?.id;
    const at = next.findIndex((z, k) => z.id === leftId && next[k + 1]?.id === rightId);
    if (at >= 0) patch.splitAfter = at;
    else delete patch.splitAfter;
    return patch;
  };
  const one = selected.length === 1 ? selected[0] : -1;
  // The add is planned when the page is drawn, so a refused add shows as a greyed button with the reason.
  const addPlan = (() => {
    if (one < 0) return { reason: "Select one zone first. The new zone goes to its right." };
    if (zones[one]?.type === "rangehood_flap" && zones[one + 1]?.type === "rangehood_flap") {
      return { reason: "A zone cannot go inside a range hood group." };
    }
    const next = zones.map((z) => ({ ...z }));
    const host = next[one];
    const take = Math.min(400, r1(host.width / 2));
    if (take < MIN_ZONE_WIDTH || host.width - take < MIN_ZONE_WIDTH) {
      return { reason: `Zone ${one + 1} is ${Math.round(host.width)} wide: it cannot give ${MIN_ZONE_WIDTH} mm and keep ${MIN_ZONE_WIDTH}.` };
    }
    host.width = r1(host.width - take);
    const zone = { id: `zone-${Date.now().toString(36)}`, type: "up_flap", width: take };
    next.splice(one + 1, 0, zone);
    const patch = { ...p, zones: next };
    // The new zone fills up to the old line, so a split on or right of that line moves one index along.
    if (Number.isInteger(p.splitAfter) && p.splitAfter >= one) patch.splitAfter = p.splitAfter + 1;
    // Refuse an add the generator would reject (e.g. a range hood group left narrower than its insert needs).
    const known = new Set(result?.validation?.errors || []);
    let fresh = [];
    try { fresh = (mod.generate(patch)?.validation?.errors || []).filter((m) => !known.has(m)); } catch (_) { fresh = []; }
    if (fresh.length) return { reason: `Not here: ${fresh[0]}` };
    return { patch, next };
  })();
  const addZone = el("button", {
    class: "tb",
    text: "+ Add zone",
    disabled: !!addPlan.reason,
    title: addPlan.reason || "Insert a zone to the right of the selected one. Only that zone gives up width; zones further right keep theirs.",
    onclick: () => {
      if (addPlan.reason) { log("ohc.zone.blocked", { id: cab.id, zone: one, reason: addPlan.reason }); return; }
      const { patch, next } = addPlan;
      // Select first: setParams repaints the panel, and the buttons must see the new selection.
      ohcSelect(cab.id, [one + 1]);
      job.setParams(cab.id, patch);
      log("ohc.zone.add", { id: cab.id, at: one + 1, from: one, widths: next.map((z) => z.width), types: next.map((z) => z.type), splitAfter: patch.splitAfter ?? null });
    },
  });
  const delZone = el("button", {
    class: "tb",
    text: "Delete",
    disabled: !selected.length || zones.length - selected.length < 1,
    title: "Each deleted zone's width goes to the zone on its left (the first zone's to its right). Other zones keep theirs.",
    onclick: () => {
      const next = zones.map((z) => ({ ...z }));
      const gone = new Set(selected.map((i) => next[i].id));
      // Right to left, so a run of deleted zones all pours into the survivor on its left.
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (!gone.has(next[i].id)) continue;
        let heir = -1;
        for (let k = i - 1; k >= 0; k -= 1) if (!gone.has(next[k].id)) { heir = k; break; }
        if (heir < 0) for (let k = i + 1; k < next.length; k += 1) if (!gone.has(next[k].id)) { heir = k; break; }
        if (heir < 0) return;
        next[heir].width = r1(next[heir].width + next[i].width);
        next[i].width = 0;
      }
      const kept = next.filter((z) => !gone.has(z.id));
      const patch = keepSplit({ ...p, zones: kept }, kept);
      ohcSelect(cab.id, []);
      job.setParams(cab.id, patch);
      log("ohc.zone.remove", { id: cab.id, widths: kept.map((z) => z.width), types: kept.map((z) => z.type), removed: selected, splitAfter: patch.splitAfter ?? null });
    },
  });
  const avgZone = el("button", { class: "tb", text: "Average selected", disabled: selected.length < 2, title: "Give the selected zones equal widths (their total stays)", onclick: () => {
    const next = zones.map((z) => ({ ...z }));
    const sum = selected.reduce((s, i) => s + next[i].width, 0);
    const each = Math.round((sum / selected.length) * 10) / 10;
    selected.forEach((i, k) => { next[i].width = k === selected.length - 1 ? Math.round((sum - each * (selected.length - 1)) * 10) / 10 : each; });
    setZones(next, "average", { zones: selected });
  } });

  const front = el("div", { class: "bedroom-front ohc-front" });
  front.innerHTML = mod.frontView(result, { selectedZoneIndex: selected[0] ?? -1, gaps: gapMode }) || "";
  if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  const openings = typeof mod.zoneOpenings === "function" ? mod.zoneOpenings(result) : [];

  // Shown width (clearance or centre to centre) → stored width: the same delta. The neighbour on the right
  // (on the left for the last zone) takes the difference, so the cabinet keeps its width.
  // `clamp` (the zone card, like the kitchen card): an out-of-range number is cut back to the limit.
  // Without it (the number under the front view, like the kitchen) it is refused.
  const setShownWidth = (i, typed, shown, where, { clamp = false } = {}) => {
    const neighbour = i < zones.length - 1 ? i + 1 : i - 1;
    if (neighbour < 0 || !Number.isFinite(typed) || Math.abs(typed - shown) < 0.05) return;
    const next = zones.map((zz) => ({ ...zz }));
    let delta = r1(typed - shown);
    if (clamp) {
      const lo = MIN_ZONE_WIDTH - next[i].width;
      const hi = next[neighbour].width - MIN_ZONE_WIDTH;
      delta = r1(Math.max(lo, Math.min(hi, delta)));
    }
    const width = r1(next[i].width + delta);
    const other = r1(next[neighbour].width - delta);
    if (width < MIN_ZONE_WIDTH || other < MIN_ZONE_WIDTH || Math.abs(delta) < 0.05) {
      log("ohc.zone.blocked", { id: cab.id, zone: i, reason: `a zone stays at least ${MIN_ZONE_WIDTH} mm`, typed, mode: gapMode, where });
      renderPanel(); // the field goes back to the value the cabinet still has
      return;
    }
    next[i].width = width;
    next[neighbour].width = other;
    setZones(next, "width", { zone: i, width, mode: gapMode, shown: typed, where });
  };

  const editZoneOpening = (dim) => {
    if (front.querySelector(".col-dim-input")) return;
    const i = Number(dim.getAttribute("data-col"));
    const shown = Number(gapMode === "center" ? dim.dataset.center : dim.dataset.clear);
    if (!Number.isInteger(i) || !Number.isFinite(shown)) return;
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
      if (apply) setShownWidth(i, typed, shown, "front view");
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  };

  front.addEventListener("click", (e) => {
    const dim = e.target.closest?.(".col-dim.editable");
    if (dim) {
      e.stopPropagation();
      editZoneOpening(dim);
      return;
    }
    const region = e.target.closest?.("[data-zone-index]");
    if (!region) return;
    const i = Number(region.getAttribute("data-zone-index"));
    const cur = ohcSelected(cab.id);
    if (e.ctrlKey || e.metaKey) ohcSelect(cab.id, cur.includes(i) ? cur.filter((k) => k !== i) : [...cur, i]);
    else ohcSelect(cab.id, cur.length === 1 && cur[0] === i ? [] : [i]);
    renderPanel();
  });

  // Selected zone card.
  let zoneCard = null;
  if (selected.length === 1) {
    const i = selected[0];
    const z = zones[i];
    const type = el("select", { onchange: (e) => {
      const next = zones.map((zz) => ({ ...zz }));
      next[i].type = e.target.value;
      e.target.blur();
      const patch = { ...p, zones: next };
      // The NCE insert is cabinet-wide. Seed its numbers the first time a zone becomes a hood.
      if (e.target.value === "rangehood_flap") {
        patch.rangehoodPreset = p.rangehoodPreset || "NCE";
        if (p.rangehoodClearHeight == null) patch.rangehoodClearHeight = 75;
        if (p.rangehoodAlignment == null) patch.rangehoodAlignment = "left";
        if (p.rangehoodEdgeOffsetX == null) patch.rangehoodEdgeOffsetX = 40;
      }
      job.setParams(cab.id, patch);
      log("ohc.zone.type", { id: cab.id, widths: next.map((zz) => zz.width), types: next.map((zz) => zz.type), zone: i, type: e.target.value });
    } }, mod.zoneTypes.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.type })));
    const read = openings.length === zones.length ? openings[i] : null;
    const widthShown = read ? (gapMode === "center" ? read.center : read.clear) : z.width;
    const widthLabel = !read ? "Width (mm)" : gapMode === "center" ? "Centre width (mm)" : "Clear width (mm)";
    zoneCard = section(`Zone ${i + 1} of ${zones.length}`, [
      el("label", { class: "field" }, [el("span", { text: "Type" }), type]),
      numField(widthLabel, widthShown, (v) => {
        // The neighbour to the right (or left for the last zone) absorbs the difference.
        setShownWidth(i, Number(v), widthShown, "zone card", { clamp: true });
      }, { step: 1, min: 0, readOnly: zones.length <= 1 ? "The only zone fills the cabinet" : null }),
      el("div", { class: "kv" }, [el("span", { text: "From left" }), el("b", { text: `${Math.round(zones.slice(0, i).reduce((s, zz) => s + zz.width, 0))} – ${Math.round(zones.slice(0, i + 1).reduce((s, zz) => s + zz.width, 0))} mm` })]),
    ]);
  } else if (selected.length > 1) {
    zoneCard = section(`${selected.length} zones selected`, [
      el("div", { class: "empty small", text: `Total ${Math.round(selected.reduce((s, i) => s + zones[i].width, 0))} mm · "Average selected" shares it equally.` }),
    ]);
  }

  // NCE range hood: one insert for every adjacent rangehood_flap. The numbers belong to the cabinet.
  const hoodZones = zones.some((z) => z.type === "rangehood_flap");
  const hoodAlign = p.rangehoodAlignment === "right" ? "right" : "left";
  const setHood = (key, value) => {
    const from = p[key];
    job.setParams(cab.id, {
      ...p,
      rangehoodPreset: "NCE",
      rangehoodClearHeight: p.rangehoodClearHeight ?? 75,
      rangehoodAlignment: hoodAlign,
      rangehoodEdgeOffsetX: p.rangehoodEdgeOffsetX ?? 40,
      [key]: value,
    });
    log("ohc.rangehood", { id: cab.id, key, from: from ?? (key === "rangehoodClearHeight" ? 75 : key === "rangehoodEdgeOffsetX" ? 40 : hoodAlign), to: value });
  };
  const hoodSeg = (now, onPick) => el("div", { class: "seg-group" }, [["left", "Left"], ["right", "Right"]].map(([id, text]) => el("button", {
    type: "button", class: `tb seg${now === id ? " active" : ""}`, text, onclick: () => onPick(id),
  })));
  const hoodCard = hoodZones ? section("Range hood · NCE", [
    numField("Clear height (mm)", p.rangehoodClearHeight ?? 75, (v) => setHood("rangehoodClearHeight", Math.max(1, Math.round(v))), { step: 5, min: 1 }),
    el("label", { class: "field" }, [
      el("span", { text: "Opening from" }),
      hoodSeg(hoodAlign, (side) => { if (side !== hoodAlign) setHood("rangehoodAlignment", side); }),
    ]),
    numField("Offset from that side (mm)", p.rangehoodEdgeOffsetX ?? 40, (v) => setHood("rangehoodEdgeOffsetX", Math.max(40, Math.round(v))), { step: 1, min: 40 }),
    kv("Opening", "555 × 285 mm, through the bottom panel"),
    el("div", { class: "empty small", text: "A top, a front and a back in carcass stock. The top tongues into the dividers on each side of the group, and any divider inside the group stands on that top. Clear height is the gap from the bottom panel's top face up to the insert. The carcass needs 365 mm of depth, and 635 mm clear between those outer dividers. Hood zones that touch are one insert; a flap or a fixed panel between two hoods is refused." }),
  ]) : null;

  // A converted partition: the door-stock end panel and the control panels cut through that end.
  const endPanel = overheadEndPanel(p);
  const endCard = endPanel || (p.controlPanels || []).length ? section("End panel", [
    endPanel
      ? kv("End panel", `${endPanel} · door stock ${fpt} mm · door underside to the top, flush with the door face`)
      : kv("End panel", "none"),
    endPanel ? el("div", { class: "empty small", text: "Right-click the cabinet: Change to partition puts a fitted partition back on this outer face when a kitchen waterfall lines up with it." }) : null,
    ...controlPanelRows(cab.id, p.controlPanels || [], { host: "endPanel", canAdd: !!endPanel }),
  ].filter(Boolean)) : null;

  // Cabinet-level fields, folded.
  const sizes = () => outerSizeFields(cab, mod, env, p, { logKind: "ohc.size", heightFrom: "top", depthPad: fpt });
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D + fpt)} × ${Math.round(env.H)} · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box, doors included)", [
      ...sizes(),
      el("div", { class: "kv" }, [el("span", { text: "Bottom above floor" }), el("b", { text: `${Math.round(cab.pose.z)} mm` })]),
    ]),
    section("Material (job stock)", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: `${p.carcassColorName || "White Stipple"} · ${cpt} mm` })]),
      doorLine(p, fpt),
      el("div", { class: "empty small", text: "Every board except the doors is carcass stock; the doors are door stock. Thicknesses come from the space's catalogue." }),
    ]),
    section("Top", [
      el("label", { class: "field" }, [
        el("span", { text: "Style" }),
        el("div", { class: "seg-group" }, [["style_1", "Style 1"], ["style_2", "Style 2"]].map(([id, text]) => el("button", {
          type: "button",
          class: `tb seg${(p.style || "style_1") === id ? " active" : ""}`,
          text,
          onclick: () => {
            if ((p.style || "style_1") === id) return;
            job.setParams(cab.id, { ...p, style: id });
            log("ohc.option", { id: cab.id, key: "style", from: p.style || "style_1", to: id });
          },
        }))),
      ]),
      el("label", { class: "field check", title: "T3 top face, opening upward. A new overhead starts off. A cabinet with no stored value still has the groove." }, [
        el("span", { text: "T3 LED groove" }),
        el("input", { type: "checkbox", checked: p.ledGroove !== false, onchange: (e) => {
          const to = e.target.checked;
          if ((p.ledGroove !== false) === to && p.ledGroove != null) return;
          job.setParams(cab.id, { ...p, ledGroove: to });
          log("ohc.option", { id: cab.id, key: "ledGroove", from: p.ledGroove !== false, to });
        } }),
      ]),
      numField("Top clearance (mm)", p.topClearanceHeight ?? 40, (v) => {
        const to = Math.max(0, v);
        job.setParams(cab.id, { ...p, topClearanceHeight: to });
        log("ohc.option", { id: cab.id, key: "topClearanceHeight", from: p.topClearanceHeight ?? 40, to });
      }, { step: 5, min: 0 }),
      numField("Hinge cup diameter (mm)", p.hingeHoleDiameter ?? 35, (v) => {
        job.setParams(cab.id, { ...p, hingeHoleDiameter: Math.max(0, v) });
        log("ohc.option", { id: cab.id, key: "hingeHoleDiameter", from: p.hingeHoleDiameter ?? 35, to: Math.max(0, v) });
      }, { step: 0.5, min: 0 }),
      numField("Hinge cup depth (mm)", p.hingeHoleDepth ?? 12, (v) => {
        job.setParams(cab.id, { ...p, hingeHoleDepth: Math.max(0, v) });
        log("ohc.option", { id: cab.id, key: "hingeHoleDepth", from: p.hingeHoleDepth ?? 12, to: Math.max(0, v) });
      }, { step: 0.5, min: 0 }),
      numField("Cup from top (mm)", p.hingeHoleFromTop ?? 22.5, (v) => {
        job.setParams(cab.id, { ...p, hingeHoleFromTop: Math.max(0, v) });
        log("ohc.option", { id: cab.id, key: "hingeHoleFromTop", from: p.hingeHoleFromTop ?? 22.5, to: Math.max(0, v) });
      }, { step: 0.5, min: 0 }),
      numField("Cup from side (mm)", p.hingeHoleFromSide ?? 100, (v) => {
        job.setParams(cab.id, { ...p, hingeHoleFromSide: Math.max(0, v) });
        log("ohc.option", { id: cab.id, key: "hingeHoleFromSide", from: p.hingeHoleFromSide ?? 100, to: Math.max(0, v) });
      }, { step: 1, min: 0 }),
      el("div", { class: "empty small", text: "Style 2 sets the divider's front notch behind the door and the carcass rail (door thickness plus carcass thickness). Style 1 starts that notch 70 mm back from the carcass front. The LED groove is on top of T3 either way. A new overhead stores the groove as off." }),
    ]),
  ]);

  const splitTargets = ohcSplitTargets(zones);
  const splitOn = Number.isInteger(p.splitAfter) && splitTargets.some((t) => t.after === p.splitAfter);
  const splitBtn = el("button", {
    class: `tb${splitOn ? " active" : ""}`,
    text: splitOn ? "Remove split" : "Split",
    disabled: !splitOn && splitTargets.length === 0,
    title: splitTargets.length === 0
      ? "Needs two zones, and the line cannot run through a rangehood."
      : "Two carcasses butted on a zone line. Flaps there each keep half the clearance.",
    onclick: () => {
      if (splitOn) {
        const next = { ...p };
        delete next.splitAfter;
        job.setParams(cab.id, next);
        log("ohc.split", { id: cab.id, on: false, from: p.splitAfter });
        return;
      }
      const mid = total / 2;
      const hit = splitTargets.reduce((best, t) => (Math.abs(t.x - mid) < Math.abs(best.x - mid) ? t : best));
      job.setParams(cab.id, { ...p, splitAfter: hit.after });
      log("ohc.split", { id: cab.id, on: true, after: hit.after, x: hit.x });
    },
  });
  const sheetWarn = (result?.validation?.warnings || []).find((w) => /cannot be cut/.test(w));
  const sheetHint = sheetWarn ? el("div", { class: "zs-hint warn", text: sheetWarn }) : null;

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · doors ${sideLabel(sideOfRotZ(cab.pose.rotZ))} · top on the ceiling` }),
      el("div", { class: "panel-sizes" }, outerSizeFields(cab, mod, env, p, { logKind: "ohc.size", heightFrom: "top", depthPad: fpt })),
    ]),
    shared.board,
    section(`Zones · left → right · ${zones.length} · ${Math.round(total)} mm`, [
      el("div", { class: "zs-tools" }, [addZone, delZone, avgZone, splitBtn, el("span", { class: "zs-hint", text: splitOn ? "Drag the blue ↔ onto a line between zones. Flaps there each keep half the clearance." : "Drag a boundary · click a zone (strip or front view) · Ctrl+click adds to the selection · + Add zone goes right of the selected one" })]),
      sheetHint,
      strip,
      widthRow,
      cumRow,
    ]),
    zoneCard,
    hoodCard,
    frontSection("Front view", [front]),
    endCard,
    fold,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

/**
 * Control panels on a partition (`host: "wall"`) or an overhead end panel: one
 * row each with its numbers, × to remove, and an Add button. A row the overhead
 * only derives from a partition (`host: "wall"` on the overhead) is read-only.
 */
function controlPanelRows(targetId, list, { host, canAdd }) {
  const rows = list.map((cp) => {
    const derived = host === "endPanel" && cp.host === "wall";
    const set = (patch) => job.setControlPanel(targetId, cp.id, patch);
    return el("div", { class: "opening" }, [
      el("div", { class: "opening-head" }, [
        el("b", { text: cp.id }),
        el("span", { text: derived ? `through ${cp.wall} · ${cp.side} end` : `${Math.round(cp.width)} × ${Math.round(cp.height)} · ${Math.round(cp.depth)} deep` }),
        derived ? null : el("button", { class: "icon", text: "×", title: "Remove this control panel", onclick: () => job.removeControlPanel(targetId, cp.id) }),
      ]),
      ...(derived
        ? [el("div", { class: "kv" }, [el("span", { text: "Centre" }), el("b", { text: `${Math.round(cp.fromCeiling)} under the top · ${Math.round(cp.fromBack)} from the back` })])]
        : [
            numField("Centre from ceiling", cp.fromCeiling, (v) => set({ fromCeiling: Math.max(0, v) }), { step: 5, min: 0 }),
            numField("Centre from back wall", cp.fromBack, (v) => set({ fromBack: Math.max(0, v) }), { step: 5, min: 0 }),
            numField("Opening width", cp.width, (v) => set({ width: Math.max(1, v) }), { step: 5, min: 1 }),
            numField("Opening height", cp.height, (v) => set({ height: Math.max(1, v) }), { step: 5, min: 1 }),
            numField("Depth", cp.depth, (v) => set({ depth: Math.max(1, v) }), { step: 1, min: 1 }),
          ]),
    ].filter(Boolean));
  });
  const add = canAdd ? el("button", {
    class: "tb wide", text: "Add Control Panel…",
    onclick: async (e) => {
      const r = e.currentTarget.getBoundingClientRect();
      const rec = await showControlPanelForm(r.left, r.bottom + 4, { title: `Control panel · ${targetId}` });
      if (rec) job.addControlPanel(targetId, rec, { how: "panel" });
    },
  }) : null;
  const hint = el("div", { class: "empty small", text: host === "wall"
    ? "The opening is cut through this partition; the overhead standing against this end cuts its end divider and adds backing boards until the depth is reached — the last one takes a 10 mm half slot that runs on to the wall for the wiring."
    : "The opening is cut through the end panel and the end divider; backing dividers are added until the depth is reached — the last one takes a 10 mm half slot that runs to the back for the wiring. Beside a range hood the backing divider is the short one on RGHD_TOP." });
  return [...rows, add, hint];
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

function renderTall(cab, mod, result, shared) {
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

function renderTallFridge(cab, mod, result, shared) {
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
    renderPanel();
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
      renderPanel();
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
    if (!Number.isFinite(typed) || Math.abs(typed - shown) < 0.05) { renderPanel(); return; }
    const h = Math.round(z.height + (typed - shown));
    if (h < MIN_ZONE_HEIGHT) {
      log("tallFridge.zone.blocked", { id: cab.id, zone: z.id, reason: `a zone stays at least ${MIN_ZONE_HEIGHT} mm`, typed, mode: gapMode, where });
      renderPanel(); // the field goes back to the value the cabinet still has
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

// --- kitchen base cabinet editor -------------------------------------------------------
//
// Wide page while a kitchen base run is selected: the generator's 2D front
// elevation (columns left → right, zones inside a column top → bottom, over the
// kick). Click a cell to select its zone; drag an orange column boundary to
// trade width with the next column, or an orange zone boundary to trade height
// with the zone below (10 mm steps, Shift = 1 mm). A card edits the selected
// zone and its column. Every edit is one undo step; a drag commits on release.

/** A typed stove opening follows the column. A later width edit rewrites that number to the new gap. */
function syncStoveOpenings(cabId) {
  const cab = job.getJob().cabinets.find((c) => c.id === cabId);
  if (!cab) return;
  const stoves = job.resultFor(cabId)?.debug?.stoves || [];
  const opening = new Map(stoves.map((s) => [s.zoneId, s.openingWidth]));
  let changed = false;
  const columns = (cab.params.columns || []).map((col) => ({
    ...col,
    zones: (col.zones || []).map((z) => {
      if (z.zoneType !== "stove" || !(Number(z.cutoutWidth) > 0)) return z;
      const next = opening.get(z.id);
      if (next == null || Math.abs(next - Number(z.cutoutWidth)) < 0.05) return z;
      changed = true;
      return { ...z, cutoutWidth: next };
    }),
  }));
  if (changed) job.setParams(cabId, { ...cab.params, columns }, { history: false });
}

function bandBoards(boards, axis) {
  const thick = axis === "x" ? "X" : "Z";
  return (boards || []).filter((b) => b.thicknessAxis === thick && b.category !== "front_panel" && b.stock?.kind !== "door");
}

/** The same column reading the elevation draws: clearance between faces, or centre to centre. */
function columnReadout(result, ci) {
  const col = result?.debug?.columns?.[ci];
  if (!col) return null;
  const r1 = (v) => Math.round(v * 10) / 10;
  const width = r1(col.x1 - col.x0);
  const panels = bandBoards(result.boards, "x");
  const left = panels
    .filter((p) => p.x1 <= col.x0 + 0.8 || (p.x0 - 0.2 <= col.x0 && col.x0 <= p.x1 + 0.2))
    .sort((a, b) => (b.x0 + b.x1) - (a.x0 + a.x1))[0];
  const right = panels
    .filter((p) => p.x0 >= col.x1 - 0.8 || (p.x0 - 0.2 <= col.x1 && col.x1 <= p.x1 + 0.2))
    .sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1))[0];
  if (!left || !right) return { width, clear: width, center: width };
  return {
    width,
    clear: r1(right.x0 - left.x1),
    center: r1((right.x0 + right.x1) / 2 - (left.x0 + left.x1) / 2),
  };
}

/** The vertical opening of one zone, measured the same way as the bar drawn on it. */
function zoneReadout(result, ci, zoneId) {
  const col = result?.debug?.columns?.[ci];
  const zone = col?.zones?.find((z) => z.id === zoneId);
  if (!zone) return null;
  const r1 = (v) => Math.round(v * 10) / 10;
  const height = r1(zone.z1 - zone.z0);
  const panels = bandBoards(result.boards, "z").filter((b) => b.x1 > col.x0 + 1 && b.x0 < col.x1 - 1);
  const below = panels
    .filter((p) => p.z1 <= zone.z0 + 0.8 || (p.z0 - 0.2 <= zone.z0 && zone.z0 <= p.z1 + 0.2))
    .sort((a, b) => (b.z0 + b.z1) - (a.z0 + a.z1))[0];
  const above = panels
    .filter((p) => p.z0 >= zone.z1 - 0.8 || (p.z0 - 0.2 <= zone.z1 && zone.z1 <= p.z1 + 0.2))
    .sort((a, b) => (a.z0 + a.z1) - (b.z0 + b.z1))[0];
  if (!below || !above || above.z0 <= below.z1) return { height, clear: height, center: height };
  return {
    height,
    clear: r1(above.z0 - below.z1),
    center: r1((above.z0 + above.z1) / 2 - (below.z0 + below.z1) / 2),
  };
}

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
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneId: cur.zoneId, selectedCol: cur.col, gaps: gapMode }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  };
  drawFront();

  // The number under a column is the clearance or the centre distance, whichever the dropdown shows.
  // Typing it changes the stored column width by the difference; the neighbour takes the rest.
  const editColumnOpening = (dim) => {
    if (front.querySelector(".col-dim-input")) return;
    const ci = Number(dim.getAttribute("data-col"));
    const shown = Number(gapMode === "center" ? dim.dataset.center : dim.dataset.clear);
    const width = Number(dim.dataset.width);
    if (!Number.isFinite(ci) || !Number.isFinite(shown) || !Number.isFinite(width)) return;
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
      if (!apply || !Number.isFinite(typed) || Math.abs(typed - shown) < 0.05) return;
      const cols = cab.params.columns || [];
      const neighbour = ci < cols.length - 1 ? ci + 1 : ci - 1;
      if (neighbour < 0) return;
      const next = cols.map((c) => ({ ...c, zones: c.zones.map((z) => ({ ...z })) }));
      const delta = Math.round((typed - shown) * 10) / 10;
      const span = Math.round((width + delta) * 10) / 10;
      const other = Math.round((next[neighbour].width - delta) * 10) / 10;
      if (span < MIN_ZONE_WIDTH || other < MIN_ZONE_WIDTH) return;
      next[ci].width = span;
      next[neighbour].width = other;
      setParams({ ...cab.params, columns: next }, "width", {
        column: next[ci].id, width: span, mode: gapMode, shown: typed,
      });
      syncStoveOpenings(cab.id);
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  };

  // Cell selection: one click on a zone cell. A number under a column is typed instead.
  front.addEventListener("click", (e) => {
    if (kitchenDrag) return;
    const dim = e.target.closest?.(".col-dim.editable");
    if (dim) {
      e.stopPropagation();
      editColumnOpening(dim);
      return;
    }
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
    const heightLocked = (zn) => zn?.zoneType === "stove" && Number(zn.cutoutHeight) > 0;
    if (kind === "zone") {
      const zs = columns[ci]?.zones || [];
      if (heightLocked(zs[index]) || heightLocked(zs[index + 1])) {
        log("kitchen.cell.blocked", { id: cab.id, reason: "locked by the stove cutout" });
        return;
      }
    }
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    front.classList.add("dragging");
    g.classList.add("active");
    kitchenDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(toMm(ev.clientX, ev.clientY) / step) * step;
      if (kind === "split") {
        const lines = (result0?.debug?.columns || []).slice(0, -1).map((col, i) => ({ after: i, x: col.x1 }));
        if (!lines.length) return;
        const hit = lines.reduce((best, line) => (Math.abs(line.x - v) < Math.abs(best.x - v) ? line : best));
        job.setParams(cab.id, { ...params0, splitAfter: hit.after }, { history: false });
        return;
      }
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
      if (kind === "split") {
        log("kitchen.split.move", {
          id: cab.id, from: params0.splitAfter ?? null, to: now ? now.params.splitAfter ?? null : null,
          x: now?.params.splitAfter != null ? job.resultFor(cab.id)?.debug?.split?.x : null,
          changed, where: "front view",
        });
      } else {
        if (kind === "column") syncStoveOpenings(cab.id);
        log("kitchen.cell.drag", {
          id: cab.id, boundary: kind, index, column: kind === "zone" ? ci : undefined,
          to: now ? (kind === "column" ? now.params.columns?.map((c) => c.width) : now.params.columns?.[ci]?.zones?.map((z) => z.height)) : null,
          changed, where: "front view",
        });
      }
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
  const addColumn = el("button", { class: "tb", text: "+ Column", disabled: !selCol, title: "Insert a column to the right of the selected one. Only that column gives up width; columns further right keep theirs.", onclick: () => {
    if (!selCol) { log("kitchen.cell.blocked", { id: cab.id, reason: "select a column first" }); return; }
    const next = cloneCols();
    const ci = sel.col;
    const host = next[ci];
    const take = Math.min(400, r1((host?.width || 0) / 2));
    if (take < MIN_ZONE_WIDTH || (host.width || 0) - take < MIN_ZONE_WIDTH) { log("kitchen.cell.blocked", { id: cab.id, column: host.id, reason: `column ${host.id} cannot give ${MIN_ZONE_WIDTH} mm` }); return; }
    host.width = r1(host.width - take);
    const stamp = Date.now().toString(36);
    const col = { id: `c${stamp}`, width: take, zones: [{ id: `z${stamp}`, height: r1(env.H - bch), zoneType: "left_door" }] };
    next.splice(ci + 1, 0, col);
    kitchenSel.col = ci + 1;
    kitchenSel.zoneId = col.zones[0].id;
    const patch = { ...p, columns: next };
    if (p.splitAfter != null && p.splitAfter >= ci) patch.splitAfter = p.splitAfter + 1;
    setParams(patch, "add", { column: col.id, from: host.id, at: ci + 1, widths: next.map((c) => c.width) });
    syncStoveOpenings(cab.id);
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
  const removeColumn = el("button", { class: "tb danger", text: "Remove column", disabled: !selCol || columns.length <= 1, title: "The column on the left takes its width. Columns to the right keep theirs.", onclick: () => {
    const next = cloneCols();
    const ci = sel.col;
    const heir = next[ci - 1] ?? next[ci + 1];
    heir.width = r1((heir.width || 0) + (next[ci].width || 0));
    next.splice(ci, 1);
    kitchenSel.col = -1;
    kitchenSel.zoneId = null;
    const patch = { ...p, columns: next };
    if (p.splitAfter != null) {
      const leftId = columns[p.splitAfter]?.id;
      const rightId = columns[p.splitAfter + 1]?.id;
      const at = next.findIndex((c, i) => c.id === leftId && next[i + 1]?.id === rightId);
      if (at >= 0) patch.splitAfter = at;
      else delete patch.splitAfter;
    }
    setParams(patch, "columnRemove", { removed: selCol.id, heir: heir.id });
    syncStoveOpenings(cab.id);
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
    const stoveInfo = (result?.debug?.stoves || []).find((s) => s.zoneId === z.id);
    const fc = p.frontClearance ?? 2.5;
    const applyCutout = (key, opening) => {
      const next = cloneCols();
      const zone = next[ci].zones[zi];
      if (!(opening > 0)) {
        delete zone[key];
        setParams({ ...p, columns: next }, "cutout", { column: col.id, zone: z.id, key, to: null });
        return;
      }
      if (key === "cutoutWidth") {
        const current = stoveInfo?.openingWidth;
        if (current == null) return;
        const delta = r1(opening - current);
        if (next.length === 1) {
          next[0].width = r1((next[0].width || 0) + delta);
          zone.cutoutWidth = opening;
          setParams({ ...p, globalSettings: { ...p.globalSettings, length: next[0].width }, columns: next }, "cutout", { column: col.id, zone: z.id, key, from: current, to: opening });
          return;
        }
        const free = (candidate) => candidate && !(candidate.zones || []).some((zn) => zn.zoneType === "stove" && Number(zn.cutoutWidth) > 0 && zn.id !== zone.id);
        const absorber = free(next[ci + 1]) ? next[ci + 1] : free(next[ci - 1]) ? next[ci - 1] : null;
        if (!absorber || absorber.width - delta < MIN_ZONE_WIDTH || next[ci].width + delta < MIN_ZONE_WIDTH) {
          log("kitchen.cell.blocked", { id: cab.id, reason: "no column can take the stove opening" });
          renderPanel();
          return;
        }
        next[ci].width = r1(next[ci].width + delta);
        absorber.width = r1(absorber.width - delta);
        zone.cutoutWidth = opening;
        setParams({ ...p, columns: next }, "cutout", { column: col.id, zone: z.id, key, from: current, to: opening });
        return;
      }
      const nextHeight = r1(Math.max(MIN_ZONE_HEIGHT, opening - cpt + fc));
      const delta = r1(nextHeight - zone.height);
      if (next[ci].zones.length === 1) {
        zone.height = nextHeight;
        zone.cutoutHeight = opening;
        setParams({ ...p, globalSettings: { ...p.globalSettings, height: r1((p.globalSettings?.height ?? env.H) + delta) }, columns: next }, "cutout", { column: col.id, zone: z.id, key, to: opening });
        return;
      }
      const heir = next[ci].zones[zi + 1] || next[ci].zones[zi - 1];
      if (heir.height - delta < MIN_ZONE_HEIGHT) {
        log("kitchen.cell.blocked", { id: cab.id, reason: "the zone below cannot give that stove opening" });
        renderPanel();
        return;
      }
      heir.height = r1(heir.height - delta);
      zone.height = nextHeight;
      zone.cutoutHeight = opening;
      setParams({ ...p, columns: next }, "cutout", { column: col.id, zone: z.id, key, to: opening });
    };
    const cutoutInput = (label, stored, placeholder, key) => {
      const input = el("input", {
        type: "number", step: "0.1", min: "0",
        placeholder: placeholder == null ? "" : String(placeholder),
        value: stored > 0 ? stored : "",
      });
      const commit = () => {
        const text = String(input.value).trim();
        if (!text) { applyCutout(key, null); return; }
        const v = Number(text);
        if (!Number.isFinite(v) || v <= 0) { input.value = stored > 0 ? stored : ""; return; }
        applyCutout(key, v);
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
      return el("label", { class: "field", title: "Clear the field to drag this size again" }, [el("span", { text: label }), input]);
    };
    const widthRead = columnReadout(result, ci);
    const widthShown = widthRead ? (gapMode === "center" ? widthRead.center : widthRead.clear) : col.width;
    const heightRead = zoneReadout(result, ci, z.id);
    const heightShown = heightRead ? (gapMode === "center" ? heightRead.center : heightRead.clear) : z.height;
    const fields = [
      el("label", { class: "field wide-value" }, [el("span", { text: "Type" }), type]),
      res ? kv("From floor", `${Math.round(res.z0)} – ${Math.round(res.z1)} mm`) : null,
      numField(gapMode === "center" ? "Centre height (mm)" : "Clear height (mm)", heightShown, (v) => {
        if (neighbour < 0) return;
        const next = cloneCols();
        const zs = next[ci].zones;
        const raw = r1(zs[zi].height + (v - heightShown));
        const val = Math.max(MIN_ZONE_HEIGHT, Math.min(r1(zs[zi].height + zs[neighbour].height - MIN_ZONE_HEIGHT), raw));
        zs[neighbour].height = r1(zs[neighbour].height - (val - zs[zi].height));
        zs[zi].height = val;
        setParams({ ...p, columns: next }, "height", { column: col.id, zone: z.id, height: val, mode: gapMode, shown: r1(v) });
      }, { step: 1, min: 0, readOnly: z.zoneType === "stove" && Number(z.cutoutHeight) > 0 ? "Locked by the stove cutout — clear the opening height to drag" : col.zones.length <= 1 ? "The only zone fills the column (height − kick)" : null }),
      z.zoneType === "stove" ? cutoutInput("Opening width (mm)", z.cutoutWidth, stoveInfo?.openingWidth, "cutoutWidth") : null,
      z.zoneType === "stove" ? cutoutInput("Opening height (mm)", z.cutoutHeight, stoveInfo?.openingHeight, "cutoutHeight") : null,
      z.zoneType === "stove" ? el("p", { class: "zs-hint", text: "The opening is the gap between the two 100 mm side panels. Typing it sets this column's width. Dragging the column updates the number." }) : null,
      zoneAllowsShelf(z.zoneType) ? check("Shelf", z.shelfEnabled !== false, (on) => setZone({ shelfEnabled: on }, "shelf", { on })) : null,
      zoneAllowsLock(z.zoneType) ? check("Lock", z.lockEnabled !== false, (on) => setZone({ lockEnabled: on }, "lock", { on }), p.lockEnabled === false ? "Locks are off for the whole cabinet" : undefined) : null,
      (z.zoneType === "left_door" || z.zoneType === "right_door")
        ? check("With sink", z.withSink === true, (on) => setZone({ withSink: on }, "sink", { on }), "A sink in the bench above this door. The upper hinge moves down 130 mm. The lower hinge stays. A sink placed on the bench will turn this on by itself later.")
        : null,
      cab.moduleId === "ensuiteCabinet" && zi === col.zones.length - 1 && (z.zoneType === "left_door" || z.zoneType === "right_door")
        ? check("Washer floor", z.applianceFloorEnabled === true, (on) => setZone({ applianceFloorEnabled: on }, "washer", { on }), "A deck behind B3 and two supports in the kick. Style 1 only. Refused when this column meets a wheel arch, or the carcass is under 450 deep, or the clear width is under 500.")
        : null,
    ];
    const colFields = [
      numField(gapMode === "center" ? "Centre width (mm)" : "Clear width (mm)", widthShown, (v) => {
        if (colNeighbour < 0) return;
        const next = cloneCols();
        const raw = r1(next[ci].width + (v - widthShown));
        const val = Math.max(MIN_ZONE_WIDTH, Math.min(r1(next[ci].width + next[colNeighbour].width - MIN_ZONE_WIDTH), raw));
        next[colNeighbour].width = r1(next[colNeighbour].width - (val - next[ci].width));
        next[ci].width = val;
        setParams({ ...p, columns: next }, "width", { column: col.id, width: val, mode: gapMode, shown: r1(v) });
        syncStoveOpenings(cab.id);
      }, { step: 1, min: 0, readOnly: columns.length <= 1 ? "The only column fills the run" : null }),
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
  const setKick = (v) => {
    const carcassH = p.globalSettings?.height ?? env.H;
    const next = Math.max(0, Math.min(Math.round(carcassH) - 1, Math.round(Number(v))));
    if (!Number.isFinite(next) || next === Math.round(bch)) return;
    job.setParams(cab.id, mod.setEnvelope({ ...p, bottomClearanceHeight: next }, { H: env.H }));
    log("kitchen.cell.kick", { id: cab.id, from: bch, to: next });
  };
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });
  const sizes = () => outerSizeFields(cab, mod, env, p, { logKind: "kitchen.size", columns });
  const benchOn = !!(p.benchTopColorName || p.benchTopColor);
  const fallNow = p.waterfall === "left" || p.waterfall === "right" ? p.waterfall : null;
  const fallT = 25;
  const applyWaterfall = (side, columnIndex) => {
    const next = structuredClone(p);
    const from = next.waterfall === "left" || next.waterfall === "right" ? next.waterfall : null;
    if (side === from) return;
    const r1 = (v) => Math.round(v * 10) / 10;
    if (Boolean(side) !== Boolean(from)) {
      const col = next.columns?.[columnIndex];
      if (!col) return;
      const delta = side ? -fallT : fallT;
      const width = r1(col.width + delta);
      if (width < MIN_ZONE_WIDTH) {
        log("kitchen.waterfall", { id: cab.id, blocked: true, reason: `column ${columnIndex + 1} would be ${width} mm` });
        return;
      }
      col.width = width;
      next.globalSettings.length = r1(next.globalSettings.length + delta);
    }
    if ((side === "left") !== (from === "left")) {
      const shift = side === "left" ? fallT : -fallT;
      next.wheelAvoidances = (next.wheelAvoidances || []).map((a) => ({ ...a, x0: a.x0 + shift, x1: a.x1 + shift }));
    }
    if (side) next.waterfall = side;
    else delete next.waterfall;
    job.setParams(cab.id, next);
    log("kitchen.waterfall", { id: cab.id, from, to: side, column: columnIndex, length: next.globalSettings.length });
  };
  const askFallColumn = (side, host) => {
    if (columns.length < 2) { applyWaterfall(side, 0); return; }
    host.parentElement?.querySelectorAll(".size-pop").forEach((n) => n.remove());
    const gaining = !side;
    const pop = el("div", { class: "size-pop" }, [
      el("span", { text: gaining ? "Which column gains 25?" : "Which column gives 25?" }),
      ...columns.map((col, i) => {
        const tooSmall = !gaining && col.width - fallT < MIN_ZONE_WIDTH;
        return el("button", {
          type: "button", class: "tb", text: `Column ${i + 1}`,
          disabled: tooSmall,
          title: tooSmall ? "This column cannot give 25 mm and stay at least 150" : `${Math.round(col.width)} mm`,
          onclick: () => { pop.remove(); applyWaterfall(side, i); },
        });
      }),
    ]);
    host.after(pop);
  };
  const waterfallSection = () => {
    const endTitle = (side) => {
      if (!benchOn) return "Needs a bench top colour";
      if (kitchenEndBlocked(cab, side)) return "This end is against a wall or another cabinet";
      return side === "left" ? "25 mm drop on the left, mitred 45° to the bench top" : "25 mm drop on the right, mitred 45° to the bench top";
    };
    const choice = (side, label) => {
      const blocked = !benchOn || kitchenEndBlocked(cab, side);
      return el("button", {
        type: "button",
        class: `tb seg${fallNow === side ? " active" : ""}`,
        text: label,
        disabled: blocked && fallNow !== side,
        title: endTitle(side),
        onclick: (e) => {
          if (blocked) return;
          if (fallNow === side) askFallColumn(null, e.currentTarget);
          else if (fallNow) applyWaterfall(side, 0);
          else askFallColumn(side, e.currentTarget);
        },
      });
    };
    return section("Waterfall", [
      el("div", { class: "seg-group" }, [
        el("button", {
          type: "button", class: `tb seg${!fallNow ? " active" : ""}`, text: "Off",
          title: "No drop. The bench top stops at the carcass.",
          onclick: (e) => { if (fallNow) askFallColumn(null, e.currentTarget); },
        }),
        choice("left", "Left"),
        choice("right", "Right"),
      ]),
      el("div", { class: "empty small", text: "Only an end that does not meet a wall. The outer width includes the 25 mm drop, and the columns sit inboard of it. The joint with the bench top is a 45° mitre." }),
    ]);
  };
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${columns.length} columns · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box)", sizes()),
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
      numField("BCH (mm)", bch, setKick, { step: 1, min: 0 }),
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
    cab.moduleId === "kitchenCabinet" ? waterfallSection() : null,
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

  const splitAfter = Number.isInteger(p.splitAfter) ? p.splitAfter : null;
  const splitX = result?.debug?.split?.x;
  const splitOn = splitAfter != null && Number.isFinite(splitX);
  const nearestSplit = () => {
    const cols = result?.debug?.columns || [];
    let best = 0;
    let dist = Infinity;
    for (let i = 0; i < cols.length - 1; i += 1) {
      const d = Math.abs(cols[i].x1 - env.W / 2);
      if (d < dist) { dist = d; best = i; }
    }
    return best;
  };
  const splitBtn = el("button", {
    class: `tb${splitOn ? " active" : ""}`,
    text: splitOn ? "Remove split" : "Split Kitchen",
    disabled: !splitOn && columns.length < 2,
    title: columns.length < 2
      ? "Needs two columns. The split sits on the line between them."
      : "Two carcasses butted on a column line. Doors and drawers there each keep half the front clearance.",
    onclick: () => {
      if (splitOn) {
        const next = { ...p };
        delete next.splitAfter;
        job.setParams(cab.id, next);
        log("kitchen.split", { id: cab.id, on: false, from: splitAfter });
        return;
      }
      const after = nearestSplit();
      job.setParams(cab.id, { ...p, splitAfter: after });
      log("kitchen.split", { id: cab.id, on: true, after, x: result?.debug?.columns?.[after]?.x1 ?? null });
    },
  });
  const sheetWarn = (result?.validation?.warnings || []).find((w) => /cannot be cut/.test(w));
  const sheetHint = sheetWarn ? el("div", { class: "zs-hint warn", text: sheetWarn }) : null;

  const planArches = job.getSpace()?.wheelArches || [];
  const wheelOn = p.wheelArchAvoidance === true || (p.wheelArchAvoidance !== false && (p.wheelAvoidances || []).length > 0);
  const fullWheel = (height, depth, id = "wheel") => ({
    id, x0: 0, x1: Math.round(env.W), height, depth,
  });
  const setWheelOn = (on) => {
    if (!on) {
      job.setParams(cab.id, { ...p, wheelArchAvoidance: false, wheelAvoidances: [] });
    } else if (planArches.length) {
      job.setParams(cab.id, { ...p, wheelArchAvoidance: true });
    } else {
      const prev = (p.wheelAvoidances || [])[0];
      job.setParams(cab.id, {
        ...p,
        wheelArchAvoidance: true,
        wheelAvoidances: [fullWheel(
          prev?.height > 0 ? prev.height : Math.max(Math.round(bch), 200),
          prev?.depth > 0 ? prev.depth : 200,
          prev?.id || "wheel",
        )],
      });
    }
    log("kitchen.wheel", { id: cab.id, on });
  };
  const handWheel = (p.wheelAvoidances || [])[0];
  const setHandWheel = (patch) => {
    const height = Math.max(0, Math.round(patch.height != null ? patch.height : handWheel?.height || 0));
    const depth = Math.max(0, Math.round(patch.depth != null ? patch.depth : handWheel?.depth || 0));
    const arch = fullWheel(height, depth, handWheel?.id || "wheel");
    job.setParams(cab.id, { ...p, wheelArchAvoidance: true, wheelAvoidances: [arch] });
    log("kitchen.wheel", { id: cab.id, wheel: arch.id, height, depth });
  };
  const wheelSection = section("Wheel arch avoidance", [
    el("label", { class: "field check", title: "Cut this cabinet around a wheel arch. Kitchen and Ensuite. The cut runs the full width." }, [
      el("span", { text: "Wheel arch avoidance" }),
      el("input", { type: "checkbox", checked: wheelOn, onchange: (e) => setWheelOn(e.target.checked) }),
    ]),
    ...(wheelOn ? (
      p.wheelArchAvoidance === true && planArches.length ? [
        el("div", { class: "empty small", text: "From the red pair on the floor plan. The cut follows this cabinet's back." }),
        ...((p.wheelAvoidances || []).length
          ? (p.wheelAvoidances || []).map((w) => el("div", { class: "kv" }, [
            el("span", { text: w.id }),
            el("b", { text: `height ${Math.round(w.height)} · depth ${Math.round(w.depth)}` }),
          ]))
          : [el("div", { class: "empty small", text: "The back of this cabinet is outside the wheel arches." })]),
      ] : [
        numField("Height (mm)", handWheel?.height ?? Math.max(Math.round(bch), 200), (v) => setHandWheel({ height: v }), { step: 10, min: 0 }),
        numField("Depth (mm)", handWheel?.depth ?? 200, (v) => setHandWheel({ depth: v }), { step: 10, min: 0 }),
        el("div", { class: "empty small", text: "The cut runs the full width of this cabinet. Height is from the floor, depth is from the back. A wheel arch on the floor plan sets the width." }),
      ]
    ) : [
      el("div", { class: "empty small", text: "Off. When this cabinet touches a wheel arch on the floor plan, this turns on and the back is cut where it sits in the arch." }),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${columns.length} column${columns.length === 1 ? "" : "s"} · kick ${Math.round(bch)} · ${result?.boards?.length || 0} boards` }),
      el("div", { class: "panel-sizes" }, [
        ...outerSizeFields(cab, mod, env, p, { logKind: "kitchen.size", columns }),
        numField("BCH (mm)", bch, setKick, { step: 1, min: 0 }),
        benchOn ? el("div", { class: "empty small", text: "Height includes the bench top. A waterfall's 25 mm is inside the width." }) : null,
      ].filter(Boolean)),
    ]),
    shared.board,
    wheelSection,
    frontSection(`Front view · from the room · ${columns.length} column${columns.length === 1 ? "" : "s"}`, [
      el("div", { class: "zs-tools" }, [addColumn, addZone, removeZone, removeColumn, splitBtn]),
      sheetHint,
      front,
      el("div", { class: "zs-hint", text: splitOn
        ? "Drag the blue arrow onto a line between columns. Doors and drawers on that line each keep half the front clearance. Orange lines still set the column width."
        : "Click a cell to select it · click a number under a column to type it (Clearance or Centre to centre) · drag an orange line · Shift = 1 mm" }),
    ]),
    ...(cellCard || []),
    fold,
    shared.grain,
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
const LOUNGE_STYLE_LABEL = { I_SHAPE: "I · straight", L_SHAPE: "L · corner", PARALLEL: "Parallel · face to face" };

function renderLounge(cab, mod, result, shared) {
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
    front.innerHTML = mod.frontView(res, { selectedRegion: job.getSelectedRegion(), gaps: gapMode }) || "";
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
    frontSection("Front view · from the room", [
      front,
      el("div", { class: "zs-hint", text: "Click a region to select it · drag an orange boundary · Shift = 1 mm" }),
    ]),
    layoutSection,
    regionCard,
    fold,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

// --- cabinet ---------------------------------------------------------------------

const smallSel = { cabId: null, zoneId: null };
let smallDrag = null;

function smallSelected(cabId) {
  if (smallSel.cabId !== cabId) { smallSel.cabId = cabId; smallSel.zoneId = null; }
  return smallSel.zoneId;
}

function renderSmall(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const zones = result?.zones || [];
  const paramsZones = p.zones || [];

  if (smallDrag && smallDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    smallDrag.refresh();
    return;
  }

  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneId: smallSelected(cab.id) }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  };
  drawFront();

  front.addEventListener("click", (e) => {
    if (smallDrag) return;
    const cell = e.target.closest?.("[data-zone]");
    if (!cell) return;
    const zid = cell.getAttribute("data-zone");
    smallSel.zoneId = smallSel.zoneId === zid ? null : zid;
    log("small.zone.select", { id: cab.id, zone: smallSel.zoneId });
    renderPanel();
  });
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    const svg = front.querySelector("svg");
    if (!g || !svg || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const index = Number(g.getAttribute("data-index") || 0);
    const params0 = cab.params;
    const result0 = job.resultFor(cab.id);
    const before = job.snapshot();
    const toZ = (clientY) => {
      const s = front.querySelector("svg");
      const rect = s.getBoundingClientRect();
      const k = Number(s.getAttribute("width")) / rect.width;
      const scale = Number(s.dataset.scale);
      const oy = Number(s.dataset.oy);
      const H = Number(s.dataset.h);
      return H - ((clientY - rect.top) * k - oy) / scale;
    };
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
    front.classList.add("dragging");
    smallDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(toZ(ev.clientY) / step) * step;
      job.setParams(cab.id, mod.setDivider(params0, result0, index, v), { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      front.classList.remove("dragging");
      smallDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("small.zone.drag", { id: cab.id, boundary: index, to: now ? now.params.zones?.map((z) => z.height) : null, changed, where: "front view" });
      renderPanel();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  const selId = smallSelected(cab.id);
  const selIndex = zones.findIndex((z) => z.id === selId);
  const sel = selIndex >= 0 ? zones[selIndex] : null;
  const setZones = (next, kind) => {
    job.setParams(cab.id, { ...p, zones: next });
    log(`small.zone.${kind}`, { id: cab.id, zone: selId, heights: next.map((z) => z.height) });
  };
  const addRow = el("button", { class: "tb", text: "+ Row", onclick: () => {
    const next = paramsZones.map((z) => ({ ...z }));
    const tallest = next.reduce((a, b) => (b.height > a.height ? b : a), next[0]);
    const take = Math.min(150, (tallest?.height || 0) - MIN_ZONE_HEIGHT);
    if (take < MIN_ZONE_HEIGHT) { log("small.zone.blocked", { id: cab.id, reason: `no row can give ${MIN_ZONE_HEIGHT} mm` }); return; }
    tallest.height = Math.round((tallest.height - take) * 10) / 10;
    const zone = { id: `zone-${Date.now().toString(36)}`, type: "drawer", height: take };
    next.push(zone);
    smallSel.zoneId = zone.id;
    setZones(next, "add");
  } });
  const removeRow = el("button", { class: "tb", text: "Remove row", disabled: !sel || paramsZones.length <= 1, onclick: () => {
    const heir = paramsZones[selIndex < paramsZones.length - 1 ? selIndex + 1 : selIndex - 1];
    const next = paramsZones.filter((z) => z.id !== sel.id).map((z) => ({ ...z }));
    const keep = next.find((z) => z.id === heir.id);
    if (keep) keep.height = Math.round((keep.height + sel.height) * 10) / 10;
    smallSel.zoneId = keep?.id ?? null;
    setZones(next, "remove");
  } });
  let card = null;
  if (sel) {
    const type = el("select", { onchange: (e) => {
      const next = paramsZones.map((z) => ({ ...z }));
      const row = next.find((z) => z.id === sel.id);
      if (row) row.type = e.target.value;
      e.target.blur();
      setZones(next, "type");
    } }, mod.zoneTypes.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === sel.type })));
    card = section("Row", [
      type,
      numField("Height (mm)", sel.height, (v) => {
        const next = paramsZones.map((z) => ({ ...z }));
        const i = next.findIndex((z) => z.id === sel.id);
        const j = i < next.length - 1 ? i + 1 : i - 1;
        if (i < 0 || j < 0) return;
        const val = Math.max(MIN_ZONE_HEIGHT, Math.round(v));
        const delta = val - next[i].height;
        if (next[j].height - delta < MIN_ZONE_HEIGHT) return;
        next[i].height = val;
        next[j].height = Math.round((next[j].height - delta) * 10) / 10;
        setZones(next, "height");
      }, { step: 10, min: MIN_ZONE_HEIGHT }),
    ]);
  }

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Small cabinet" }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${zones.length} rows` }),
      el("div", { class: "panel-sizes" }, outerSizeFields(cab, mod, env, p, { logKind: "small.size" })),
    ]),
    shared.board,
    el("div", { class: "panel-section" }, [addRow, removeRow]),
    card,
    frontSection("Front view", [front]),
    section("Sides", [
      el("label", { class: "field check", title: "Door panel: colour face outward, half groove. Off: carcass side, groove through." }, [
        el("input", { type: "checkbox", checked: !!p.leftSideDoorColor, onchange: (e) => { job.setParams(cab.id, { ...p, leftSideDoorColor: e.target.checked }); log("small.zone.side", { id: cab.id, side: "left", on: e.target.checked }); } }),
        el("span", { text: "Left side is a door panel" }),
      ]),
      el("label", { class: "field check", title: "Door panel: colour face outward, half groove. Off: carcass side, groove through." }, [
        el("input", { type: "checkbox", checked: !!p.rightSideDoorColor, onchange: (e) => { job.setParams(cab.id, { ...p, rightSideDoorColor: e.target.checked }); log("small.zone.side", { id: cab.id, side: "right", on: e.target.checked }); } }),
        el("span", { text: "Right side is a door panel" }),
      ]),
    ]),
    section("Outer size (= box)", outerSizeFields(cab, mod, env, p, { logKind: "small.size" })),
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

function renderSketchPanel(cab) {
  const result = job.resultFor(cab.id);
  const p = cab.params;
  const span = outlineSpan(p);
  const stock = p.stock || {};
  const name = stock.kind === "door" ? (stock.colour || "Door") : stock.kind === "partition" ? "Partition" : "Carcass";
  const face = stock.kind !== "door" ? ""
    : p.doorSides === "double" ? "colour on both faces"
      : p.colorFace === "sketch" ? "colour on the sketch face" : "colour on the outer face";
  const errors = [...(result?.validation?.errors || [])];
  const warnings = result?.validation?.warnings || [];
  const checks = errors.length || warnings.length
    ? el("div", { class: "panel-section" }, [
      el("div", { class: "sec-title", text: "Checks" }),
      ...errors.map((m) => el("div", { class: "msg err", text: m })),
      ...warnings.map((m) => el("div", { class: "msg warn", text: m })),
    ])
    : null;
  const edit = el("button", { class: "tb", text: "Edit sketch", title: "Open this board's outline on the sketch", onclick: () => startBoardEdit(cab.id) });
  const remove = el("button", { class: "tb danger", text: "Remove board", onclick: () => job.removeCabinet(cab.id) });
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Board" }),
      el("div", { class: "panel-sub", text: cab.id }),
    ]),
    boardSection(),
    section("Sketch", [
      kv("Size", `${Math.round(span.u)} × ${Math.round(span.v)} mm`),
      kv("Stock", `${name} · ${span.t} mm`),
      face ? kv("Colour", face) : null,
    ].filter(Boolean)),
    checks,
    el("div", { class: "panel-foot" }, [edit, remove]),
  ].filter(Boolean));
  fillDrawer(result, errors, warnings);
}

/** Ensuite as drawn: a fixed copy of the Fusion cabinet. Nothing to edit; it says what it is and what it holds. */
function renderDrawing(cab, mod, result, { checks, remove, board }) {
  const env = mod.envelope(cab.params);
  const rp = result?.params || {};
  const boards = result?.boards || [];
  const count = (kind) => boards.filter((b) => b.stock?.kind === kind).length;
  const about = mod.part === "tall"
    ? "A lid at 383–398 over the cavity (worked out from the other boards: the STEP has no body for it — check it). Above it, 398–697 sits behind a fixed panel with a 427 × 200 R30 access opening; the base top is at 697. All four stiles stand on the lid at 398; below 398 the right side panel keeps only its front strip. The left side has no panel: an 80 filler stands there (the wall side). Two doors above."
    : "Left bay: a lid at 383–398 over the cavity; below it the left side panel keeps only its front strip and the back stile stops at 398. Right bay: open to the floor. Two doors.";
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: mod.label }),
      el("div", { class: "panel-sub", text: `${cab.id} · as drawn · ${boards.length} boards` }),
    ]),
    board,
    section("Size", [
      kv("W × D × H", `${env.W} × ${env.D} × ${env.H} mm`),
      kv("Boards", `${count("carcass")} carcass 15 · ${count("door")} door stock 16`),
    ]),
    section("As drawn", [
      el("div", { class: "empty small", text: about }),
      el("div", { class: "empty small", text: `Copied board by board from ${rp.source || "the Fusion model"} — outlines, notches, openings, hinge cups and grooves. Fixed: it cannot be resized and has no zones. Placed by As drawn → Ensuite sample, where the model has it: back on the rear wall, the tall at the left wall, the lower beside it.` }),
      ...((rp.corrections || []).map((c) => el("div", { class: "msg warn", text: `Drawing fix: ${c}` }))),
    ]),
    checks,
    el("div", { class: "panel-foot" }, [remove]),
  ].filter(Boolean));
}

function renderCabinet(cab) {
  const mod = getModule(cab.moduleId);
  if (mod.panel === "sketch") {
    renderSketchPanel(cab);
    return;
  }
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

  const errors = [...(result?.validation?.errors || []), ...grainIssueLines(result)];
  const warnings = result?.validation?.warnings || [];
  const grain = grainSection(cab, mod, result);

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
    renderBedroom(cab, mod, result, { checks, remove, setNoseDepth, board: boardSection(), grain });
    fillDrawer(result, errors, warnings);
    return;
  }

  const board = boardSection();

  if (mod.panel === "drawing") {
    renderDrawing(cab, mod, result, { checks, remove, board });
    fillDrawer(result, errors, warnings);
    return;
  }

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
  if (mod.panel === "uShape") {
    renderUShape(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "ohc") {
    renderOverhead(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "tall") {
    renderTall(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "tallFridge") {
    renderTallFridge(cab, mod, result, { remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "kitchen") {
    renderKitchen(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "lounge") {
    renderLounge(cab, mod, result, { checks, remove, board });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "small") {
    renderSmall(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "bedroomEast") {
    const rp = result?.params || {};
    const setKey = (key, next) => {
      job.setParams(cab.id, next);
      log("bedroomEast.layout.set", { id: cab.id, key, from: p[key], to: next[key], how: "type", changed: JSON.stringify(next[key]) !== JSON.stringify(p[key]) });
    };
    const setWard = (v) => setKey("wardrobeWidth", { ...p, wardrobeWidth: Math.max(150, Math.min(mod.envelope(p).W, Math.round(v))) });
    const bays = result?.layout?.ohc?.zones || [];
    const ob = mod.ohcBottomLimits(rp.width ? rp : p);
    const countField = el("label", { class: "field" }, [
      el("span", { text: "Overhead bays" }),
      el("select", { title: "Up flaps only. Bedroom 1 has three.", onchange: (e) => { const n = Number(e.target.value); e.target.blur(); setKey("ohcZones", mod.setOhcCount(p, n)); } }, [
        el("option", { value: "2", text: "2 · up flaps", selected: bays.length === 2 }),
        el("option", { value: "3", text: "3 · up flaps", selected: bays.length !== 2 }),
      ]),
    ]);
    panel.replaceChildren(...[
      el("div", { class: "panel-head" }, [
        el("div", { class: "panel-title", text: "East-west bedroom" }),
        el("div", { class: "panel-sub", text: `${cab.id} · wardrobe left · mattress across the van · ${Math.round(env.W)} wide` }),
      ]),
      board,
      section("Layout", [
        numField("Wardrobe width (mm)", p.wardrobeWidth, setWard, { step: 10, min: 150 }),
        numField("Mattress length (mm)", rp.mattressLength ?? Math.round(env.W - p.wardrobeWidth), () => {}, { readOnly: "Van width minus the wardrobe. A narrower wardrobe makes it longer." }),
        numField("Mattress depth (mm)", rp.mattressDepth, () => {}, { readOnly: "Queen mattress width. Fixed (rules.json MATTRESS_DEPTH_MM)." }),
        numField("Boot / wardrobe depth (mm)", rp.bodyDepth, () => {}, { readOnly: "From the nose. The mattress continues past this into the room (rules.json BODY_DEPTH_MM)." }),
        numField("Boot top (mm)", rp.bootHeight, () => {}, { readOnly: "rules.json BOOT_HEIGHT_MM." }),
        numField("Bed box from (mm)", rp.bedX0, () => {}, { readOnly: "Wardrobe + 65 (rules.json BED_SIDE_GAP_MM)." }),
        el("label", { class: "field check", title: "LED channels on T3's top: a main channel wall to wall and two branches to the rear edge" }, [
          el("input", { type: "checkbox", checked: p.ledGroove !== false, onchange: (e) => setKey("ledGroove", { ...p, ledGroove: e.target.checked }) }),
          el("span", { text: "LED channels" }),
        ]),
      ]),
      section("Overhead", [
        numField("Door underside (mm)", rp.ohcBottom ?? p.ohcBottom, (v) => setKey("ohcBottom", mod.setOhcBottom(p, v)), { step: 10, min: ob.min }),
        kv("Range", `${Math.round(ob.min)} – ${Math.round(ob.max)} · or drag the orange line in 3D`),
        countField,
        kv("Bays", bays.map((b) => Math.round(b.width)).join(" · ") || "—"),
        el("button", { class: "tb", text: "Average", title: "Make the bays equal again", onclick: () => setKey("ohcZones", mod.setOhcCount(p, bays.length === 2 ? 2 : 3)) }),
      ]),
      checks,
      el("div", { class: "panel-foot" }, [remove]),
    ].filter(Boolean));
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "bunk") {
    const lay = result?.layout || {};
    const lim = mod.upperLimits(p);
    const setKey = (key, value, how = "type") => {
      const next = { ...p, [key]: value };
      job.setParams(cab.id, next);
      log("bunk.layout.set", { id: cab.id, key, from: p[key], to: value, how, changed: p[key] !== value });
    };
    const endSelect = el("label", { class: "field", title: "Seen from the room, facing the bunk" }, [
      el("span", { text: "Ladder + end cubby" }),
      el("select", { onchange: (e) => { const v = e.target.value; e.target.blur(); setKey("endSide", v, "select"); } }, [
        el("option", { value: "RIGHT", text: "Right", selected: (p.endSide || "RIGHT") === "RIGHT" }),
        el("option", { value: "LEFT", text: "Left", selected: p.endSide === "LEFT" }),
      ]),
    ]);
    panel.replaceChildren(...[
      el("div", { class: "panel-head" }, [
        el("div", { class: "panel-title", text: "Bunk bed · across" }),
        el("div", { class: "panel-sub", text: `${cab.id} · rear wall · wall to wall · ${result?.boards?.length || 0} boards` }),
      ]),
      board,
      section("Size", [
        numField("Length (mm)", env.W, () => {}, { readOnly: "Wall to wall along the rear wall. Redraw the bunk to change it." }),
        numField("Depth (mm)", env.D, () => {}, { readOnly: "Rear wall to the room face of the front partition, partition included. Redraw the bunk to change it." }),
        numField("Top (mm)", env.H, () => {}, { readOnly: "The ceiling minus the partition ceiling clearance from the setup (copied when the bunk was drawn)." }),
        kv("Mattress width", `${lay.mattressWidth ?? "—"} mm · depth minus the partition`),
        kv("Front partition", `${lay.partition?.thickness ?? "—"} thick · ${p.floorClearance ?? 0} above the floor · ${p.ceilingClearance ?? 0} under the ceiling (setup)${lay.partition?.cut != null ? ` · two sheets, cut at ${lay.partition.cut}` : ""}`),
      ]),
      section("Bunks", [
        numField("Deck top (mm)", p.deckTop, (v) => setKey("deckTop", Math.round(v * 10) / 10), { step: 1 }),
        numField("Upper base underside (mm)", p.upperZ, (v) => setKey("upperZ", Math.round(v * 10) / 10), { step: 1 }),
        kv("Range", `${Math.round(lim.min)} – ${Math.round(lim.max)} · equal ${lim.equal}`),
        el("button", { class: "tb", text: "Equal clear height", title: "Put the upper base where both bunks get the same clear height", onclick: () => setKey("upperZ", lim.equal, "equal") }),
        kv("Clear height", `lower ${lay.lowerClear ?? "—"} · upper ${lay.upperClear ?? "—"}`),
        kv("Tunnel boot", `${lay.bootTop ?? "—"} high`),
        endSelect,
      ]),
      checks,
      el("div", { class: "panel-foot" }, [remove]),
    ].filter(Boolean));
    fillDrawer(result, errors, warnings);
    return;
  }

  const boxChildren = [
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${result?.boards?.length || 0} boards` }),
    ]),
    board,
    section("Outer size (= box)", outerSizeFields(cab, mod, env, p, { logKind: "cabinet.size" })),
    cab.moduleId === "smallCabinet" ? section("Sides", [
      el("label", { class: "field check", title: "Door panel: colour face outward, half groove. Off: carcass side, groove through." }, [
        el("input", { type: "checkbox", checked: !!p.leftSideDoorColor, onchange: (e) => job.setParams(cab.id, { ...p, leftSideDoorColor: e.target.checked }) }),
        el("span", { text: "Left side is a door panel" }),
      ]),
      el("label", { class: "field check", title: "Door panel: colour face outward, half groove. Off: carcass side, groove through." }, [
        el("input", { type: "checkbox", checked: !!p.rightSideDoorColor, onchange: (e) => job.setParams(cab.id, { ...p, rightSideDoorColor: e.target.checked }) }),
        el("span", { text: "Right side is a door panel" }),
      ]),
    ]) : null,
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
      doorLine(p),
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
      ...outerSizeFields(cab, mod, env, p, {
        logKind: "bedside.size",
        show: { W: false },
        labels: { D: "Into the room (mm)", H: "Top (mm)" },
      }),
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
            return el("tr", { class: sub && sub.boardId === b.id ? "sel" : "", onclick: (e) => {
              if (e.ctrlKey || e.metaKey) job.select(cabId, null, { extend: true });
              else job.select(cabId, { boardId: b.id });
            } }, [
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
  const cut = wallBoards(w, job.getSpace(), job.getStock());
  const sheetIssues = cut.issues || [];
  const jointWarnings = cut.warnings || [];
  const stock = job.getStock();
  const cl = partitionClearance(stock);
  const blocked = [...(st.warnings || []), ...doorBlockers(w, s)];
  const along = s.along.toUpperCase();
  const across = w.axis.toUpperCase();
  const anchorText = (a) => a || "free";
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Partition wall" }),
      el("div", { class: "panel-sub", text: `${w.id} · ${wallOrientation(w)}${w.hidden ? " · hidden" : ""}` }),
    ]),
    section("Geometry", [
      el("div", { class: "kv" }, [el("span", { text: "Length" }), el("b", { text: `${Math.round(wallLength(w))} mm` })]),
      el("div", { class: "kv" }, [el("span", { text: `From ${along}` }), el("b", { text: `${Math.round(w.u0)}` })]),
      el("div", { class: "kv" }, [el("span", { text: `To ${along}` }), el("b", { text: `${Math.round(w.u1)}` })]),
      el("div", { class: "kv" }, [el("span", { text: `Reference face ${across}` }), el("b", { text: `${Math.round(w.at)} · grows ${w.side > 0 ? "+" : "−"}${across}` })]),
      el("div", { class: "kv" }, [el("span", { text: `Faces ${across}` }), el("b", { text: `${Math.round(w.axis === "x" ? s.x0 : s.y0)} … ${Math.round(w.axis === "x" ? s.x1 : s.y1)}` })]),
      el("div", { class: "kv" }, [el("span", { text: "Rests on" }), el("b", { text: `${anchorText(st.anchors.lo)} / ${anchorText(st.anchors.hi)}` })]),
      cut.split
        ? el("div", { class: "kv" }, [el("span", { text: cut.split.axis === "z" ? "Horizontal cut" : "Vertical cut" }), el("b", { text: `${Math.round(cut.split.at)} mm` })])
        : el("div", { class: "kv" }, [el("span", { text: "Boards" }), el("b", { text: `1 · fits ${SHEET_SHORT_MM} × ${SHEET_LONG_MM}` })]),
      el("div", { class: "empty small", text: cut.split
        ? "Drag the yellow bar on the wall to move the cut. Shift = 1 mm. The two boards butt together. A piece past 1200 × 2400 is marked red."
        : "This wall fits on one 1200 × 2400 board." }),
    ]),
    w.fit ? section("Fit to cabinets", [
      el("div", { class: "kv" }, [el("span", { text: "Overhead" }), el("b", { text: w.fit.overheadId })]),
      el("div", { class: "kv" }, [el("span", { text: w.fit.loungeId ? "Lounge" : "Base" }), el("b", { text: w.fit.loungeId || w.fit.kitchenId })]),
      s.fitSteps ? el("div", { class: "kv" }, [el("span", { text: "Overhead depth" }), el("b", { text: `${Math.round(s.fitSteps.overheadDepth)} mm · bottom ${Math.round(s.fitSteps.overheadBottom)}` })]) : null,
      s.fitSteps ? el("div", { class: "kv" }, [el("span", { text: "Neck" }), el("b", { text: `${Math.round(s.fitSteps.neckDepth)} mm deep` })]) : null,
      s.fitSteps ? el("div", { class: "kv" }, [el("span", { text: w.fit.loungeId ? "Lounge depth" : "Base depth" }), el("b", { text: `${Math.round(s.fitSteps.kitchenDepth)} mm · top ${Math.round(s.fitSteps.kitchenTop)}` })]) : null,
      numField("Corner radius", w.fit.radius ?? 50, (v) => job.setWallFit(w.id, { overheadId: w.fit.overheadId, kitchenId: w.fit.kitchenId, loungeId: w.fit.loungeId, radius: Math.max(0, v) }, "radius"), { step: 1, min: 0 }),
      el("div", { class: "empty small", text: w.fit.loungeId
        ? "Upper depth is the overhead plus 20. Its lower edge is 15 mm below the door, and the door hangs 30 mm below the carcass. The gap between the steps is 100 deep. The lounge step is 80 above the lounge and 50 past the run this partition stands on — the main run's depth, or the wing's depth when it stands on the L. The four step corners are real arcs of this radius."
        : "Upper depth is the overhead plus 20. Its lower edge is 15 mm below the door, and the door hangs 30 mm below the carcass. The gap between the steps is 100 deep. The base step is 50 above the base and 30 deeper than its total depth. The four step corners are real arcs of this radius." }),
      el("button", { class: "tb", text: "Clear cabinet fit", onclick: () => job.setWallFit(w.id, null, "clear") }),
    ].filter(Boolean)) : null,
    section(`Control panels (${(w.controlPanels || []).length})`, controlPanelRows(w.id, w.controlPanels || [], { host: "wall", canAdd: true })),
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
    st.issues.length || sheetIssues.length || blocked.length || jointWarnings.length
      ? el("div", { class: "panel-section" }, [
          el("div", { class: "sec-title", text: "Checks" }),
          ...st.issues.map((m) => el("div", { class: "msg err", text: m })),
          ...sheetIssues.map((m) => el("div", { class: "msg err", text: m })),
          ...blocked.map((m) => el("div", { class: "msg warn", text: m })),
          ...jointWarnings.map((m) => el("div", { class: "msg warn", text: m })),
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
  const wallErr = [...st.issues, ...sheetIssues];
  const wallWarn = [...blocked, ...jointWarnings];
  drawerChecks.replaceChildren(
    wallErr.length || wallWarn.length
      ? el("div", {}, [...wallErr.map((m) => el("div", { class: "msg err", text: m })), ...wallWarn.map((m) => el("div", { class: "msg warn", text: m }))])
      : el("div", { class: "empty ok", text: "Wall rests on a wall, stays inside the space and overlaps nothing." }),
  );
  drawerBoards.replaceChildren(
    cut.boards.length
      ? el("table", { class: "grid" }, [
          el("thead", {}, [el("tr", {}, ["ID", "Name", "Length", "Height", "Sheet"].map((h) => el("th", { text: h })))]),
          el("tbody", {}, cut.boards.map((b) => el("tr", {}, [
            el("td", { text: b.id }),
            el("td", { text: b.name }),
            el("td", { text: `${Math.round(b.length)}` }),
            el("td", { text: `${Math.round(b.height)}` }),
            el("td", { text: b.fits ? `${SHEET_SHORT_MM} × ${SHEET_LONG_MM}` : "over" }),
          ]))),
        ])
      : el("div", { class: "empty", text: "No boards." }),
  );
}

/** Which page the panel is showing. A board / face pick stays on the same page, so it does not slide. */
function panelPage() {
  const sel = job.getSelected();
  if (sel) return `cab:${sel.id}`;
  const pl = job.getSelectedPlane();
  if (pl) return `plane:${pl.id}`;
  const wall = job.getSelectedWall();
  if (wall) return `wall:${wall.id}`;
  return "space";
}

let shownPage = null;
let panelToken = 0;
let panelLeaving = false;

function paintPanel() {
  const sel = job.getSelected();
  // The wide editor page only while an OHC or the Bedroom body is selected; everything else uses the narrow panel.
  const page = sel ? getModule(sel.moduleId).panel : "";
  const wide = ["ohc", "bedroom", "bedroomEast", "bedSide", "tall", "tallFridge", "kitchen", "lounge"].includes(page);
  panel.classList.toggle("wide", wide);
  panel.classList.toggle("kitchen", page === "kitchen");
  panel.classList.toggle("ohc", page === "ohc");
  panel.classList.toggle("fridge", page === "tallFridge");
  panel.classList.toggle("lounge", page === "lounge");
  if (sel) renderCabinet(sel);
  else {
    const pl = job.getSelectedPlane();
    const wall = job.getSelectedWall();
    if (pl) renderPlane(pl);
    else if (wall) renderWall(wall);
    else renderSpace();
  }
}

function slideIn() {
  panel.classList.remove("panel-in");
  void panel.offsetWidth;
  panel.classList.add("panel-in");
}

/**
 * A different page slides out to the right, then the next one slides in.
 * Rewriting the same page (a parameter edit) does not animate.
 */
export function renderPanel() {
  const key = panelPage();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A job edit while the page is leaving waits: the arrival paints whatever is selected then.
  if (panelLeaving) return;
  if (key === shownPage || shownPage === null || reduce) {
    shownPage = key;
    paintPanel();
    return;
  }
  const token = ++panelToken;
  panelLeaving = true;
  panel.classList.remove("panel-in");
  panel.classList.add("panel-out");
  let arrived = false;
  const arrive = () => {
    if (arrived || token !== panelToken) return;
    arrived = true;
    panelLeaving = false;
    panel.removeEventListener("animationend", onEnd);
    shownPage = panelPage();
    panel.classList.remove("panel-out");
    paintPanel();
    slideIn();
  };
  const onEnd = (e) => { if (e.target === panel && e.animationName === "panel-out") arrive(); };
  panel.addEventListener("animationend", onEnd);
  setTimeout(arrive, 400);
}
