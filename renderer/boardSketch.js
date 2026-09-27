// Board command (B): a sketch on one face, turned into boards.
//
//   pick    click the face to sketch on; the view turns to look straight at it.
//   sketch  the sketch bar (top of the view): Create on the left (Line, Rectangle,
//           Circle, Arc), a divider, Modify on the right (Fillet, Chamfer, Offset,
//           Mirror, Trim, Extend). Nothing is drawn until a tool is chosen.
//           The sketch holds curves (sketchCurves.js items): open lines stay as
//           they are, and ends that meet join; a closed curve is a shape. A
//           shape inside another is a through opening of it, a shape inside
//           an opening is a board again.
//           The aids bar (bottom) holds Snap F3 / Ortho F8 / Polar F10 and
//           Reset view. Tab (or a digit) opens fields beside the cursor: a line
//           takes length + angle or dx + dy (the wheel switches), a rectangle
//           dx + dy, a circle r. Fillet, Chamfer and Offset show their sizes there.
//   stock   Finish sketch: pick the stock. Create makes one board per outer
//           shape, all in one undo step.
//
// Only previews follow the cursor. The sketch is drawn again only when it
// changes, and the generator runs once per board, on Create. interact.js
// hands over the pointer and the keyboard while this is on.
import * as THREE from "three";
import * as job from "./job.js";
import { canvas, planePointAt, beginFaceView, endFaceView } from "./space.js";
import {
  pickFace, extrudeRoom, nearestSnap, nearestFaceAlign, faceGuide, describePoint, toClient, inPlaneAxes, uiScale, SNAP_RADIUS_PX,
} from "./snap.js";
import {
  showSnapMarker, hideSnapMarker, showAlignLines, hideAlignLines, showFaceHint, hideFaceHint, hideInference,
  showSketchPath, hideSketchPath, showSketchSolid, hideSketchSolid, showSketchProfiles, hideSketchProfiles,
  showSketchPick, hideSketchPick,
} from "./cabinets3d.js";
import { showTip, hideTip } from "./hud.js";
import { clearHeightAt, minClearHeight } from "./spaces.js";
import { log } from "./log.js";
import { doorSwatch } from "./doorSwatches.js";
import { BOARD_MIN, colourFaceValue, onSketchFace, onSketchPlane, remembered, sketchBoardFromUV, stockChoices } from "./sketchBoard.js";
import {
  toUV, fromUV, orthoPoint, polarPoint, roundLength, segmentHitsPath, pathSnaps, perpendicularFoot,
  pointFromEntry, cornerFromPair, screenAxes, ringsTouch, ringRelation, nestRings,
} from "./sketch2d.js";
import {
  itemSegments, itemPoints, itemProblem, segPointAt, segmentPoints, arcOf, arcCentres, allIntersections,
  rectItem, circleItem, arcItem, joinItems, nearestSegment, nearestVertex, trimSpan, trimAt, extendAt,
  filletCorner, chamferCorner, offsetItem, offsetSide, mirrorItem,
} from "./sketchCurves.js";

// 16 × 16 stroke icons for the sketch bar; the name shows on hover.
const ICON = {
  line: '<path d="M3 13 L13 3"/><circle cx="3" cy="13" r="1.3" fill="currentColor"/><circle cx="13" cy="3" r="1.3" fill="currentColor"/>',
  rect: '<rect x="2.5" y="4" width="11" height="8"/>',
  circle: '<circle cx="8" cy="8" r="5.5"/><circle cx="8" cy="8" r="0.9" fill="currentColor"/>',
  arc: '<path d="M2.5 12 A6 6 0 0 1 13.5 12"/><circle cx="2.5" cy="12" r="1.2" fill="currentColor"/><circle cx="13.5" cy="12" r="1.2" fill="currentColor"/>',
  fillet: '<path d="M3 2.5 V8 A5 5 0 0 0 8 13 H13.5"/>',
  chamfer: '<path d="M3 2.5 V8.5 L7.5 13 H13.5"/>',
  offset: '<path d="M2.5 13.5 V5 H13.5"/><path d="M6 13.5 V8.5 H13.5" stroke-dasharray="2 1.5"/>',
  mirror: '<path d="M8 1.5 V14.5" stroke-dasharray="1.5 1.5"/><path d="M6 4.5 L2 11.5 H6 Z"/><path d="M10 4.5 L14 11.5 H10 Z"/>',
  trim: '<path d="M2 8 H14"/><path d="M8 2 V6"/><path d="M8 10 V14" stroke-dasharray="1.5 1.5"/>',
  extend: '<path d="M13.5 2 V14"/><path d="M2.5 8 H8.5"/><path d="M8.5 8 H13" stroke-dasharray="1.5 1.5"/><path d="M11 6 L13 8 L11 10"/>',
};
const iconSvg = (id) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[id]}</svg>`;

const CREATE = [
  { id: "line", label: "Line", key: "L" },
  { id: "rect", label: "Rectangle", key: "R" },
  { id: "circle", label: "Circle", key: "C" },
  { id: "arc", label: "Arc", key: "A" },
];
const MODIFY = [
  { id: "fillet", label: "Fillet", key: "F" },
  { id: "chamfer", label: "Chamfer", key: "K" },
  { id: "offset", label: "Offset", key: "O" },
  { id: "mirror", label: "Mirror", key: "M" },
  { id: "trim", label: "Trim", key: "T" },
  { id: "extend", label: "Extend", key: "E" },
];
const TOOL_KEYS = Object.fromEntries([...CREATE, ...MODIFY].map((t) => [t.key.toLowerCase(), t.id]));
const LABEL = Object.fromEntries([...CREATE, ...MODIFY].map((t) => [t.id, t.label]));
const AIDS = [
  { id: "osnap", label: "Snap", key: "F3", title: "Object snap: endpoints, midpoints, centres, crossings, perpendicular, the face's corners and corners in this plane" },
  { id: "ortho", label: "Ortho", key: "F8", title: "Lines run along the face's two axes · hold Shift to flip it for one point" },
  { id: "polar", label: "Polar", key: "F10", title: "Lines snap to 45° steps" },
];
const AID_KEYS = { F3: "osnap", F8: "ortho", F10: "polar" };
const SNAP_LABEL = { close: "Close", endpoint: "Endpoint", midpoint: "Midpoint", intersection: "Intersection", perpendicular: "Perpendicular", center: "Centre" };

const aids = { osnap: true, ortho: false, polar: false };
/** Sizes the modify tools remember for the session. */
const params = { fillet: { r: 20 }, chamfer: { d1: 10, d2: 10 }, offset: { d: 16 } };
let ctx = { stopOthers() {}, emitMode() {} };
let sk = null;

/** interact.js: how to stop the other commands, and how to say the mode changed. */
export function initBoardSketch(c) {
  ctx = c;
}
export function boardActive() {
  return !!sk;
}
export function boardMode() {
  return sk ? `board.${sk.step}` : null;
}

// --- bars -----------------------------------------------------------------------------

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) { if (v) e.addEventListener(k.slice(2), v); }
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

const viewport = document.getElementById("viewport");
const bar = el("div", { id: "sketchBar", class: "sketch-bar hidden" });
const aidsBar = el("div", { id: "sketchAids", class: "sketch-bar sketch-aids hidden" });
const card = el("div", { id: "boardCard", class: "hidden" });
viewport.append(bar, aidsBar);
document.getElementById("moveCard").parentElement.append(card);
for (const node of [bar, aidsBar, card]) {
  for (const type of ["pointerdown", "pointerup", "wheel", "contextmenu", "dblclick"]) node.addEventListener(type, (e) => e.stopPropagation());
}

const barTitle = el("span", { class: "sketch-title" });
const toolButtons = new Map();
function iconButton(t) {
  const b = el("button", { class: "tb icon", type: "button", title: `${t.label} (${t.key})`, "aria-label": t.label, onclick: () => setTool(t.id) });
  b.innerHTML = iconSvg(t.id);
  toolButtons.set(t.id, b);
  return b;
}
const createGroup = el("div", { class: "sketch-group" }, CREATE.map(iconButton));
const modifyGroup = el("div", { class: "sketch-group sketch-modify" }, MODIFY.map(iconButton));
const finishBtn = el("button", { class: "tb primary", type: "button", text: "Finish sketch", title: "Turn the closed shapes into boards", onclick: () => finishSketch("button") });
const cancelBtn = el("button", { class: "tb", type: "button", text: "Cancel", title: "Leave the sketch; nothing is made", onclick: () => cancelBoard("button") });
bar.append(barTitle, createGroup, el("span", { class: "sketch-divider" }), modifyGroup, el("span", { class: "spacer" }), finishBtn, cancelBtn);

const aidButtons = new Map();
const aidGroup = el("div", { class: "sketch-group" });
for (const a of AIDS) {
  const b = el("button", { class: "tb seg", type: "button", text: `${a.label} ${a.key}`, title: a.title, onclick: () => toggleAid(a.id) });
  aidButtons.set(a.id, b);
  aidGroup.append(b);
}
const status = el("span", { class: "sketch-status" });
aidsBar.append(aidGroup, status, el("span", { class: "spacer" }));
const resetBtn = document.getElementById("faceReset");
if (resetBtn) aidsBar.append(resetBtn);

// Fields beside the cursor. `point`: the next point (Tab / a digit opens them).
// `size`: the modify tool's sizes, shown while the tool is on.
const dynBox = el("div", { id: "sketchDyn", class: "sketch-dyn hidden" });
viewport.append(dynBox);
for (const type of ["pointerdown", "pointerup", "contextmenu", "dblclick"]) dynBox.addEventListener(type, (e) => e.stopPropagation());
const dynSlots = [0, 1].map(() => {
  const name = el("span", { class: "sketch-dyn-name" });
  const input = el("input", { type: "text", spellcheck: "false", inputmode: "decimal" });
  const unit = el("span", { class: "sketch-dyn-unit" });
  const wrap = el("label", { class: "sketch-dyn-field" }, [name, input, unit]);
  return { name, input, unit, wrap, key: null };
});
const dynHint = el("span", { class: "sketch-dyn-hint" });
dynBox.append(dynSlots[0].wrap, dynSlots[1].wrap, dynHint);
let lineMode = "polar";
const dyn = { open: false, kind: "point", locks: {} };

function showBars() {
  bar.classList.remove("hidden");
  aidsBar.classList.remove("hidden");
  document.getElementById("app")?.classList.add("sketching");
  paintBar();
  paintAids();
}
function hideBars() {
  bar.classList.add("hidden");
  aidsBar.classList.add("hidden");
  card.classList.add("hidden");
  document.getElementById("app")?.classList.remove("sketching");
  hideDyn();
}
function paintBar() {
  if (!sk || !sk.face) return;
  barTitle.textContent = `Sketch · ${sk.face.label}`;
  for (const [id, b] of toolButtons) b.classList.toggle("active", sk.tool === id);
}
function paintAids() {
  for (const [id, b] of aidButtons) b.classList.toggle("active", !!aids[id]);
  paintStatus();
}

let statusNote = null;
function paintStatus(message = null) {
  statusNote = message;
  if (!sk || sk.step !== "sketch") return;
  if (message) { status.textContent = message; status.classList.add("warn"); return; }
  status.classList.remove("warn");
  const closed = sk.items.filter((it) => it.closed).length;
  const open = sk.items.length - closed;
  const count = [closed ? `${closed} shape${closed > 1 ? "s" : ""}` : "", open ? `${open} open line${open > 1 ? "s" : ""}` : ""].filter(Boolean).join(" · ");
  const tail = count ? ` · ${count}` : "";
  const n = sk.path.length;
  const text = {
    null: "Pick a tool on the sketch bar",
    line: n >= 3 ? `${n} points · the first point or C closes · Enter ends an open line · U undoes`
      : n ? `${n} point${n > 1 ? "s" : ""} · Enter ends an open line · U undoes · Esc drops it` : "First point",
    rect: sk.anchor ? "Opposite corner" : "First corner",
    circle: sk.anchor ? "Radius: click, or Tab types it" : "Centre",
    arc: n === 0 ? "Start of the arc" : n === 1 ? "End of the arc" : "A point on the arc",
    fillet: `Click a corner · radius ${params.fillet.r}`,
    chamfer: `Click a corner · ${params.chamfer.d1} × ${params.chamfer.d2}`,
    offset: sk.pick ? `Click the side · ${params.offset.d} mm` : `Click a line or shape to offset · ${params.offset.d} mm`,
    mirror: !sk.pick ? "Click the line or shape to mirror" : !sk.pick.p1 ? "First point of the mirror line" : "Second point of the mirror line",
    trim: "Click the piece to cut away",
    extend: "Click near the end to extend",
  }[sk.tool ?? "null"];
  status.textContent = text + tail;
}

// --- command ----------------------------------------------------------------------------

const choices = () => stockChoices(job.getFinish(), job.getStock());

export function startBoard() {
  if (sk) { cancelBoard("toggle"); return; }
  if (!job.hasSpace()) { log("board.blocked", { reason: "no space" }); return; }
  const mem = job.getJob().sketchBoard;
  const choice = remembered(mem, choices());
  if (!choice) { log("board.blocked", { reason: "no stock" }); return; }
  ctx.stopOthers();
  sk = {
    step: "pick", face: null, tool: null, items: [], history: [], path: [], anchor: null, pick: null,
    cursor: null, raw: null, client: null, snaps: null, plan: null,
    choice, colorFace: mem && mem.colorFace === "sketch" ? "sketch" : "pull",
  };
  canvas.style.cursor = "crosshair";
  log("board.arm", { aids: { ...aids } });
  ctx.emitMode();
}

export function cancelBoard(how) {
  if (!sk) return;
  const { step, items } = sk;
  sk = null;
  hideBars();
  clearPreview();
  endFaceView();
  canvas.style.cursor = "";
  log("board.cancel", { step, how, items: items.length });
  ctx.emitMode();
}

function clearPreview() {
  hideFaceHint();
  hideSnapMarker();
  hideAlignLines();
  hideInference();
  hideSketchPath();
  hideSketchPick();
  hideSketchSolid();
  hideSketchProfiles();
  hideTip();
}

function enterSketch(face) {
  Object.assign(sk, { face, step: "sketch", tool: null, items: [], history: [], path: [], anchor: null, pick: null, snaps: null });
  hideFaceHint();
  hideTip();
  beginFaceView(face);
  showBars();
  log("board.face", { axis: face.axis, value: face.value, dir: face.dir, label: face.label, source: face.source });
  ctx.emitMode();
}

/** Esc: drop what is being drawn / picked → drop the tool → (empty sketch) pick another face. */
function back() {
  if (sk.step === "stock") {
    sk.step = "sketch";
    sk.plan = null;
    card.classList.add("hidden");
    hideSketchSolid();
    showBars();
    drawItems();
    log("board.back", { step: "sketch" });
    ctx.emitMode();
    return;
  }
  if (sk.step === "sketch") {
    if (dyn.open && dyn.kind === "point") { closeDyn(); return; }
    if (sk.path.length || sk.anchor || sk.pick) {
      clearDrawing();
      log("board.back", { step: "sketch", cleared: true });
      return;
    }
    if (sk.tool) { setTool(null); return; }
    if (sk.items.length) { paintStatus("Finish sketch or Cancel on the sketch bar"); return; }
    sk.step = "pick";
    sk.face = null;
    hideBars();
    clearPreview();
    endFaceView();
    log("board.back", { step: "pick" });
    ctx.emitMode();
    return;
  }
  cancelBoard("esc");
}

function clearDrawing() {
  sk.path = [];
  sk.anchor = null;
  sk.pick = null;
  sk.snaps = null;
  if (dyn.kind === "point") closeDyn();
  hideSketchPath();
  hideSketchPick();
  hideSnapMarker();
  paintStatus();
}

function setTool(id) {
  if (!sk || sk.step !== "sketch") return;
  if (sk.tool === id) return;
  clearDrawing();
  hideDyn();
  sk.tool = id;
  canvas.style.cursor = "crosshair";
  log("board.tool", { tool: id });
  paintBar();
  paintStatus();
  if (id && sizeFields().length) openSizes();
}

function toggleAid(key) {
  aids[key] = !aids[key];
  // Ortho and polar exclude each other, as in AutoCAD.
  if (key === "ortho" && aids.ortho) aids.polar = false;
  if (key === "polar" && aids.polar) aids.ortho = false;
  log("board.aid", { key, on: aids[key], aids: { ...aids } });
  paintAids();
}

/** One step of the sketch's own undo: the items before a change. */
function commit(items, kind, extra = {}) {
  sk.history.push(sk.items);
  if (sk.history.length > 100) sk.history.shift();
  sk.items = joinItems(items);
  sk.snaps = null;
  drawItems();
  log(`board.${kind}`, { tool: sk.tool, items: sk.items.length, closed: sk.items.filter((it) => it.closed).length, ...extra });
  paintStatus();
}

// --- geometry on the face ----------------------------------------------------------------

const world = (uv) => fromUV(sk.face, uv[0], uv[1]);
const client = (uv) => { const p = world(uv); return toClient(p.x, p.y, p.z); };

function threePlane(axis, value) {
  const n = new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
  return new THREE.Plane(n, -value);
}

function clampToSpace(p) {
  const sp = job.getSpace();
  if (!sp) return p;
  const x = Math.min(sp.bounds.maxX, Math.max(sp.bounds.minX, p.x));
  const y = Math.min(sp.bounds.maxY, Math.max(sp.bounds.minY, p.y));
  const z = Math.min(clearHeightAt(sp, x, y), Math.max(0, p.z));
  return { x, y, z };
}

/** The point drawing continues from. */
function last() {
  if (!sk) return null;
  if (sk.tool === "rect" || sk.tool === "circle") return sk.anchor;
  if (sk.tool === "mirror") return sk.pick && sk.pick.p1 ? sk.pick.p1 : null;
  return sk.path.length ? sk.path[sk.path.length - 1] : null;
}

/** Cursor on the face plane, no snapping. */
function planeUV(e) {
  const g = planePointAt(e.clientX, e.clientY, threePlane(sk.face.axis, sk.face.value));
  return g ? toUV(sk.face, g) : null;
}

/** Millimetres the snap aperture covers on the face here. */
function apertureMm() {
  const at = last() || sk.raw || toUV(sk.face, faceCentre(sk.face));
  const a = client(at);
  const b = client([at[0] + 100, at[1]]);
  const pxPerMm = Math.hypot(b.x - a.x, b.y - a.y) / 100 || 1;
  return (SNAP_RADIUS_PX * uiScale()) / pxPerMm;
}

/** A corner of this face, else any feature point in its plane. */
function planeFeature(e, face) {
  const hit = nearestSnap(e.clientX, e.clientY, { filter: (p) => onSketchFace(p, face) })
    || nearestSnap(e.clientX, e.clientY, { filter: (p) => onSketchPlane(p, face) });
  return hit ? { ...hit, [face.axis]: face.value } : null;
}

/** Snap points from the sketch; rebuilt only when the sketch changes. */
function sketchSnaps() {
  if (sk.snaps) return sk.snaps;
  const from = last();
  const out = [];
  if (sk.path.length && (sk.tool === "line" || sk.tool === "arc")) out.push(...pathSnaps(sk.path, { from }).filter((s) => sk.tool === "line" || s.kind !== "close"));
  if (sk.anchor) out.push({ uv: sk.anchor, kind: "endpoint" });
  for (const item of sk.items) {
    for (const p of item.pts) out.push({ uv: p, kind: "endpoint" });
    for (const s of itemSegments(item)) {
      out.push({ uv: segPointAt(s, 0.5), kind: "midpoint" });
      if (from && !arcOf(s.a, s.b, s.bulge)) {
        const f = perpendicularFoot(from, s.a, s.b);
        if (f) out.push({ uv: f, kind: "perpendicular" });
      }
    }
    for (const c of arcCentres(item)) out.push({ uv: c, kind: "center" });
  }
  for (const p of allIntersections(sk.items)) out.push({ uv: p, kind: "intersection" });
  sk.snaps = out;
  return out;
}

/** Flush lines with other faces, else the 10 mm grid; kept inside the space. */
function gridPoint(e, g) {
  const face = sk.face;
  const pt = { x: g.x, y: g.y, z: g.z };
  const al = aids.osnap ? nearestFaceAlign(e.clientX, e.clientY, { axis: face.axis, value: face.value }) : {};
  const segs = [];
  let label = null;
  for (const a of inPlaneAxes(face.axis)) {
    if (al[a]) {
      pt[a] = al[a].value;
      segs.push(faceGuide(al[a].plane, { axis: face.axis, value: face.value }));
      label = label || `Flush with ${al[a].plane.label}`;
    } else pt[a] = job.snap(pt[a]);
  }
  const c = clampToSpace(pt);
  c[face.axis] = face.value;
  return { uv: toUV(face, c), kind: segs.length ? "align" : "grid", label, segs };
}

/**
 * Where the cursor lands, in (u, v): object snap (the sketch's points, the
 * face's corners, corners in the plane) → ortho / polar from the last point →
 * flush lines and the grid.
 */
function resolve(e) {
  const face = sk.face;
  const g = planePointAt(e.clientX, e.clientY, threePlane(face.axis, face.value));
  if (!g) return null;
  const raw = toUV(face, g);
  const from = last();
  if (aids.osnap) {
    const radius = SNAP_RADIUS_PX * uiScale();
    let best = null;
    for (const c of sketchSnaps()) {
      const s = client(c.uv);
      if (s.behind) continue;
      const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
      if (d > radius) continue;
      // Closing wins inside the aperture, so the shape is easy to close.
      const rank = c.kind === "close" ? -1 : d;
      if (!best || rank < best.rank) best = { rank, uv: c.uv, kind: c.kind, label: SNAP_LABEL[c.kind] };
    }
    if (!best || best.kind !== "close") {
      const f = planeFeature(e, face);
      if (f) {
        const s = toClient(f.x, f.y, f.z);
        const d = Math.hypot(s.x - e.clientX, s.y - e.clientY);
        if (!best || d < best.rank) best = { rank: d, uv: toUV(face, f), kind: "feature", label: `Corner · ${describePoint(f)}` };
      }
    }
    if (best) return { uv: best.uv, kind: best.kind, label: best.label, feature: true };
  }
  if (from && (sk.tool === "line" || sk.tool === "mirror" || sk.tool === "arc")) {
    if (aids.ortho !== e.shiftKey) return { uv: roundLength(from, orthoPoint(from, raw)), kind: "ortho", label: "Ortho" };
    if (aids.polar) {
      const p = polarPoint(from, raw);
      if (p) return { uv: roundLength(from, p), kind: "polar", label: "Polar" };
    }
  }
  return gridPoint(e, g);
}

/** Screen angle (degrees, counter-clockwise from right) of a → b. */
function screenAngle(a, b) {
  const p = client(a);
  const q = client(b);
  const deg = Math.round((Math.atan2(-(q.y - p.y), q.x - p.x) * 180) / Math.PI);
  return deg < 0 ? deg + 360 : deg;
}

/** Screen right / up as the face's in-plane axes, at the last point. */
function screenFrame() {
  const at = last() || toUV(sk.face, faceCentre(sk.face));
  const o = client(at);
  const pu = client([at[0] + 100, at[1]]);
  const pv = client([at[0], at[1] + 100]);
  return screenAxes([(pu.x - o.x) / 100, (pu.y - o.y) / 100], [(pv.x - o.x) / 100, (pv.y - o.y) / 100]);
}
function faceCentre(face) {
  const c = {};
  for (const a of ["x", "y", "z"]) c[a] = (face.ext[a][0] + face.ext[a][1]) / 2;
  c[face.axis] = face.value;
  return c;
}

const itemWorld = (item) => itemPoints(item).map(world);

// --- preview ------------------------------------------------------------------------------

function drawItems() {
  showSketchProfiles(sk.items.map((it) => ({ pts: itemWorld(it), closed: it.closed })));
}

/** The shape being drawn with the cursor as its next point. True when it would cross itself. */
function drawPath(r) {
  const from = last();
  const cur = r ? r.uv : sk.cursor;
  const tool = sk.tool;
  if (!cur || !from) { hideSketchPath(); return false; }
  if (tool === "rect") { showSketchPath(itemWorld(rectItem(from, cur)), { closed: true }); return false; }
  if (tool === "circle") {
    const rr = Math.hypot(cur[0] - from[0], cur[1] - from[1]);
    if (rr > 0.5) showSketchPath(itemWorld(circleItem(from, rr)), { closed: true }); else hideSketchPath();
    return false;
  }
  if (tool === "arc") {
    if (sk.path.length === 1) { showSketchPath([world(sk.path[0]), world(cur)]); return false; }
    const a = arcItem(sk.path[0], cur, sk.path[1]);
    if (a) showSketchPath(itemWorld(a)); else showSketchPath([world(sk.path[0]), world(sk.path[1])], { bad: true });
    return !a;
  }
  if (tool === "mirror") {
    showSketchPath([world(from), world(cur)]);
    return false;
  }
  const closing = r && r.kind === "close";
  const bad = closing ? segmentHitsPath(sk.path, from, sk.path[0], { closing: true }) : segmentHitsPath(sk.path, from, cur);
  showSketchPath([...sk.path, closing ? sk.path[0] : cur].map(world), { bad });
  return bad;
}

/** The boards the sketch makes, as slabs with the colour skin. Built once per call. */
function drawSolids() {
  const plan = sk.plan;
  if (!plan) { hideSketchSolid(); return; }
  const f = sk.face;
  const t = sk.choice.thickness;
  const t0 = f.dir < 0 ? f.value - t : f.value;
  const swatch = sk.choice.kind === "door" ? doorSwatch(sk.choice.colour) : null;
  const where = sk.choice.single ? sk.choice.colorFace : "pull";
  const at = colourFaceValue(f, t, where);
  const out = f.dir < 0 ? -1 : 1;
  // A skin exactly on the slab's face would fight it: lift it a hair off the slab.
  const lift = at === f.value ? -0.3 * out : 0.3 * out;
  const shapes = plan.boards.map((b) => ({ outer: plan.rings[b.outer], holes: b.holes.map((i) => plan.rings[i]) }));
  showSketchSolid(f.axis, shapes, t0, t0 + t, { colour: swatch ? swatch.hex : null, colourAt: at + lift, bad: roomLeft() < t - 0.5 });
}

// --- modify tools: what the cursor is on ---------------------------------------------------

/** What a modify tool would do at `p`: `{ show: [uv], closed, bad, tip, apply() }` or null. */
function modifyAt(p) {
  const tol = apertureMm();
  const items = sk.items;
  const tool = sk.tool;
  if (tool === "fillet" || tool === "chamfer") {
    const v = nearestVertex(items, p, tol);
    if (!v) return null;
    const item = items[v.index];
    const res = tool === "fillet"
      ? filletCorner(item, v.vi, params.fillet.r)
      : chamferCorner(item, v.vi, params.chamfer.d1, params.chamfer.d2);
    if (res.error) return { show: itemPoints(item), closed: item.closed, bad: true, tip: res.error };
    return {
      show: itemPoints(res.item), closed: res.item.closed,
      tip: tool === "fillet" ? `Fillet R${params.fillet.r}` : `Chamfer ${params.chamfer.d1} × ${params.chamfer.d2}`,
      apply: () => commit(items.map((it, i) => (i === v.index ? res.item : it)), tool, { vertex: v.vi }),
    };
  }
  if (tool === "trim") {
    const s = nearestSegment(items, p, tol);
    if (!s) return null;
    const { piece } = trimSpan(items, s.index, s.k, s.f);
    return {
      show: [piece.a, ...segmentPoints(piece.a, piece.b, piece.bulge)], closed: false, bad: true, tip: "Trim",
      apply: () => commit(trimAt(items, s.index, s.k, s.f), "trim"),
    };
  }
  if (tool === "extend") {
    let best = null;
    items.forEach((it, index) => {
      if (it.closed) return;
      for (const end of [it.pts[0], it.pts[it.pts.length - 1]]) {
        const d = Math.hypot(end[0] - p[0], end[1] - p[1]);
        if (d <= tol * 2 && (!best || d < best.d)) best = { index, d };
      }
    });
    if (!best) return null;
    const res = extendAt(items, best.index, p);
    if (res.error) return { show: itemPoints(items[best.index]), closed: false, bad: true, tip: res.error };
    return { show: [res.from, res.to], closed: false, tip: "Extend", apply: () => commit(res.items, "extend") };
  }
  if (tool === "offset" || tool === "mirror") {
    if (sk.pick) return null;
    const s = nearestSegment(items, p, tol);
    if (!s) return null;
    const item = items[s.index];
    return { show: itemPoints(item), closed: item.closed, tip: LABEL[tool], apply: () => pickItem(s.index) };
  }
  return null;
}

function pickItem(index) {
  sk.pick = { index };
  sk.snaps = null;
  log("board.pick", { tool: sk.tool, index });
  paintStatus();
}

/** Offset of the picked item toward the cursor's side. */
function offsetPreview(p) {
  const item = sk.items[sk.pick.index];
  const side = offsetSide(item, p);
  return offsetItem(item, params.offset.d * side);
}

// --- pointer ------------------------------------------------------------------------------

export function boardPointerMove(e) {
  if (!sk) return;
  if (sk.step === "pick") {
    const hit = pickFace(e.clientX, e.clientY);
    if (!hit) { hideFaceHint(); hideTip(); return; }
    showFaceHint(hit.face);
    const room = extrudeRoom(hit.face);
    showTip(e.clientX, e.clientY, [hit.face.label, room < 1 ? "No room off this face" : "Click to sketch on this face", "Esc cancels"], room < 1 ? "warn" : "");
    return;
  }
  if (sk.step !== "sketch") return;
  sk.client = { x: e.clientX, y: e.clientY };
  if (dyn.open) placeDyn();
  if (!sk.tool) { hideSnapMarker(); hideAlignLines(); hideTip(); return; }
  if (MODIFY_IDS.has(sk.tool) && !(sk.tool === "mirror" && sk.pick)) { hoverModify(e); return; }
  let r = resolve(e);
  if (!r) { hideTip(); return; }
  sk.raw = r.uv;
  if (dyn.open && dyn.kind === "point") {
    const p = dynPoint(r.uv);
    if (p && Object.keys(dyn.locks).length) r = { uv: p, kind: "typed", label: null };
    paintDyn();
  }
  sk.cursor = r.uv;
  const w = world(r.uv);
  if (r.feature) showSnapMarker(w.x, w.y, w.z, { feature: true }); else hideSnapMarker();
  if (r.segs && r.segs.length) showAlignLines(r.segs); else hideAlignLines();
  const bad = drawPath(r);
  if (sk.tool === "mirror" && sk.pick && sk.pick.p1) {
    const m = mirrorItem(sk.items[sk.pick.index], sk.pick.p1, r.uv);
    if (Math.hypot(r.uv[0] - sk.pick.p1[0], r.uv[1] - sk.pick.p1[1]) > 0.5) showSketchPick(itemWorld(m), { closed: m.closed });
  } else if (sk.tool === "mirror" && sk.pick) {
    const it = sk.items[sk.pick.index];
    showSketchPick(itemWorld(it), { closed: it.closed });
  }
  const from = last();
  const lines = [];
  if (r.label) lines.push(r.label);
  if (from && sk.tool === "rect") lines.push(`${Math.round(Math.abs(r.uv[0] - from[0]))} × ${Math.round(Math.abs(r.uv[1] - from[1]))}`);
  if (from && sk.tool === "circle") lines.push(`R ${Math.round(Math.hypot(r.uv[0] - from[0], r.uv[1] - from[1]))}`);
  if (from && sk.tool === "line") lines.push(`L ${Math.round(Math.hypot(r.uv[0] - from[0], r.uv[1] - from[1]))} · ${screenAngle(from, r.uv)}°`);
  if (bad) lines.push(sk.tool === "arc" ? "The three points are in line" : "Crosses the line");
  if (from && !dyn.open && POINT_TOOLS.has(sk.tool)) lines.push("Tab types the next point");
  if (lines.length) showTip(e.clientX, e.clientY, lines, bad ? "warn" : ""); else hideTip();
}

const MODIFY_IDS = new Set(MODIFY.map((t) => t.id));
const POINT_TOOLS = new Set(["line", "rect", "circle"]);

function hoverModify(e) {
  hideSnapMarker();
  hideAlignLines();
  hideSketchPath();
  const p = planeUV(e);
  if (!p) return;
  sk.raw = p;
  if (sk.tool === "offset" && sk.pick) {
    const res = offsetPreview(p);
    const it = sk.items[sk.pick.index];
    if (res.error) {
      showSketchPick(itemWorld(it), { closed: it.closed, bad: true });
      showTip(e.clientX, e.clientY, [res.error], "warn");
    } else {
      showSketchPick(itemWorld(res.item), { closed: res.item.closed });
      showTip(e.clientX, e.clientY, [`Offset ${params.offset.d} · click to place`]);
    }
    return;
  }
  const m = modifyAt(p);
  if (!m) { hideSketchPick(); hideTip(); return; }
  // Red: a trim piece about to go, or a corner the size does not fit.
  showSketchPick(m.show.map(world), { closed: m.closed, bad: !!m.bad });
  showTip(e.clientX, e.clientY, [m.tip], m.apply ? "" : "warn");
}

export function boardPointerDown(e) {
  if (!sk) return;
  if (sk.step === "pick") {
    const hit = pickFace(e.clientX, e.clientY);
    if (!hit) return;
    if (extrudeRoom(hit.face) < 1) { log("board.blocked", { reason: "no room", face: hit.face.label }); return; }
    enterSketch({
      axis: hit.face.axis, value: hit.face.value, dir: hit.face.dir, label: hit.face.label, source: hit.face.source || null,
      ext: { x: [...hit.face.ext.x], y: [...hit.face.ext.y], z: [...hit.face.ext.z] },
    });
    return;
  }
  if (sk.step !== "sketch") return;
  if (!sk.tool) { paintStatus("Pick a tool on the sketch bar first"); log("board.blocked", { reason: "no tool" }); return; }
  if (MODIFY_IDS.has(sk.tool) && !(sk.tool === "mirror" && sk.pick)) { clickModify(e); return; }
  const r = resolve(e);
  if (!r) return;
  if (dyn.open && dyn.kind === "point" && Object.keys(dyn.locks).length) {
    sk.raw = r.uv;
    applyDyn();
    return;
  }
  if (sk.tool === "line" && r.kind === "close") { closeLine("click"); return; }
  addPoint(r.uv, "click", r.kind);
}

function clickModify(e) {
  const p = planeUV(e);
  if (!p) return;
  if (sk.tool === "offset" && sk.pick) {
    const res = offsetPreview(p);
    if (res.error) { paintStatus(res.error); log("board.blocked", { reason: res.error, tool: "offset" }); return; }
    const index = sk.pick.index;
    sk.pick = null;
    commit([...sk.items, res.item], "offset", { from: index, d: params.offset.d });
    hideSketchPick();
    return;
  }
  const m = modifyAt(p);
  if (!m) { paintStatus(`Nothing to ${LABEL[sk.tool].toLowerCase()} there`); return; }
  if (!m.apply) { paintStatus(m.tip); log("board.blocked", { reason: m.tip, tool: sk.tool }); return; }
  m.apply();
  hideSketchPick();
}

/** Right-click without a drag = Enter. True when the Board command took it. */
export function boardRightClick() {
  if (!sk) return false;
  if (sk.step === "sketch") enter("right-click");
  else if (sk.step === "stock") create("right-click");
  return true;
}

function addPoint(uv, how, snap) {
  const tool = sk.tool;
  if (tool === "rect" || tool === "circle") {
    if (!sk.anchor) {
      sk.anchor = uv;
      sk.snaps = null;
      log("board.point", { tool, index: 0, u: uv[0], v: uv[1], snap, how });
      paintStatus();
      return true;
    }
    const a = sk.anchor;
    const item = tool === "rect" ? rectItem(a, uv) : circleItem(a, Math.hypot(uv[0] - a[0], uv[1] - a[1]));
    const small = tool === "rect" ? Math.min(Math.abs(uv[0] - a[0]), Math.abs(uv[1] - a[1])) < 1 : Math.hypot(uv[0] - a[0], uv[1] - a[1]) < 0.5;
    if (small) { paintStatus(tool === "rect" ? "The rectangle has no size" : "The circle has no size"); return false; }
    log("board.point", { tool, index: 1, u: uv[0], v: uv[1], snap, how });
    sk.anchor = null;
    commit([...sk.items, item], "shape", { how });
    closeDyn();
    return true;
  }
  if (tool === "mirror") {
    if (!sk.pick) return false;
    if (!sk.pick.p1) {
      sk.pick.p1 = uv;
      sk.snaps = null;
      log("board.point", { tool, index: 0, u: uv[0], v: uv[1], snap, how });
      paintStatus();
      return true;
    }
    if (Math.hypot(uv[0] - sk.pick.p1[0], uv[1] - sk.pick.p1[1]) < 0.5) return false;
    const m = mirrorItem(sk.items[sk.pick.index], sk.pick.p1, uv);
    const from = sk.pick.index;
    sk.pick = null;
    hideSketchPath();
    hideSketchPick();
    commit([...sk.items, m], "mirror", { from });
    return true;
  }
  if (tool === "arc") {
    const from = last();
    if (from && Math.hypot(uv[0] - from[0], uv[1] - from[1]) < 0.5) return false;
    if (sk.path.length < 2) {
      sk.path.push(uv);
      sk.snaps = null;
      log("board.point", { tool, index: sk.path.length - 1, u: uv[0], v: uv[1], snap, how });
      paintStatus();
      return true;
    }
    const a = arcItem(sk.path[0], uv, sk.path[1]);
    if (!a) { paintStatus("The three points are in line"); return false; }
    sk.path = [];
    hideSketchPath();
    commit([...sk.items, a], "shape", { how });
    return true;
  }
  const from = last();
  if (from && Math.hypot(uv[0] - from[0], uv[1] - from[1]) < 0.5) return false;
  if (from && segmentHitsPath(sk.path, from, uv)) {
    log("board.blocked", { reason: "crosses itself", tool: "line", u: uv[0], v: uv[1] });
    paintStatus("That line crosses the one you are drawing");
    return false;
  }
  sk.path.push(uv);
  sk.snaps = null;
  log("board.point", { tool: "line", index: sk.path.length - 1, u: uv[0], v: uv[1], snap, how });
  drawPath(null);
  paintStatus();
  return true;
}

function closeLine(how) {
  if (sk.tool !== "line") return false;
  const pts = sk.path;
  if (pts.length < 3) { paintStatus("A shape needs at least 3 points"); log("board.blocked", { reason: "needs at least 3 points", how }); return false; }
  if (segmentHitsPath(pts, pts[pts.length - 1], pts[0], { closing: true })) {
    paintStatus("Closing it would cross the line");
    log("board.blocked", { reason: "the outline crosses itself", how, points: pts.length });
    return false;
  }
  const item = { closed: true, pts: pts.slice(), b: pts.map(() => 0) };
  const problem = itemProblem(item);
  if (problem) { paintStatus(`The shape ${problem}`); return false; }
  sk.path = [];
  hideSketchPath();
  closeDyn();
  commit([...sk.items, item], "shape", { how, points: pts.length });
  return true;
}

/** Enter / right-click: end the line where it is (open), or take the cursor as the next point. */
function enter(how) {
  if (sk.step !== "sketch") return;
  const tool = sk.tool;
  if (tool === "line" && sk.path.length >= 2) {
    const pts = sk.path.slice();
    sk.path = [];
    hideSketchPath();
    closeDyn();
    commit([...sk.items, { closed: false, pts, b: pts.slice(1).map(() => 0) }], "line", { how, points: pts.length });
    return;
  }
  if ((tool === "rect" || tool === "circle") && sk.anchor && sk.cursor) addPoint(sk.cursor, how, "cursor");
  else if (tool === "arc" && sk.path.length === 2 && sk.cursor) addPoint(sk.cursor, how, "cursor");
  else if (tool === "mirror" && sk.pick && sk.pick.p1 && sk.cursor) addPoint(sk.cursor, how, "cursor");
}

/** U / Ctrl+Z inside the sketch: the last point, else the last change. */
function undo(how) {
  if (sk.step !== "sketch") return;
  if ((sk.tool === "line" || sk.tool === "arc") && sk.path.length) {
    sk.path.pop();
    sk.snaps = null;
    drawPath(null);
    log("board.undo", { how, points: sk.path.length });
  } else if (sk.anchor) {
    sk.anchor = null;
    sk.snaps = null;
    hideSketchPath();
    log("board.undo", { how, points: 0 });
  } else if (sk.pick) {
    clearDrawing();
  } else if (sk.history.length) {
    sk.items = sk.history.pop();
    sk.snaps = null;
    drawItems();
    log("board.undo", { how, change: true, items: sk.items.length });
  }
  if (!last() && dyn.kind === "point") closeDyn();
  paintStatus();
}

// --- keyboard -----------------------------------------------------------------------------

/** Canvas keys while the command is on (focus is not in a field). */
export function boardKeydown(e) {
  if (!sk) return;
  const aid = AID_KEYS[e.key];
  if (aid) { e.preventDefault(); toggleAid(aid); return; }
  if (e.key === "Escape") { e.preventDefault(); back(); return; }
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  if (sk.step === "stock") {
    if (e.key === "Enter") { e.preventDefault(); create("enter"); }
    return;
  }
  if (sk.step === "sketch" && plain) {
    if (e.key === "Enter") { e.preventDefault(); enter("enter"); return; }
    const k = e.key.toLowerCase();
    // C closes a line being drawn (AutoCAD); otherwise it is the Circle tool.
    if (k === "c" && sk.tool === "line" && sk.path.length >= 3) { e.preventDefault(); closeLine("key"); return; }
    if (k === "u") { e.preventDefault(); undo("key"); return; }
    if (TOOL_KEYS[k] && !e.shiftKey) { e.preventDefault(); setTool(TOOL_KEYS[k]); return; }
    if (e.key === "Tab" && !e.shiftKey) { e.preventDefault(); openFields(null); return; }
    if (/^[0-9.\-]$/.test(e.key) && sk.tool) { e.preventDefault(); openFields(e.key); return; }
  }
  if (e.key === "Tab") e.preventDefault();
  if ((e.key === "b" || e.key === "B") && plain) cancelBoard("key");
}

/** Ctrl+Z while the command is on: undo inside the sketch, never the job. */
export function boardUndoKey() {
  if (!sk) return false;
  undo("ctrl+z");
  return true;
}

// --- fields beside the cursor ----------------------------------------------------------------

/** Point fields for the tool drawing now. */
function pointFields() {
  if (sk.tool === "line" && lineMode === "polar") return [{ key: "len", name: "L", unit: "" }, { key: "ang", name: "∠", unit: "°" }];
  if (sk.tool === "line" || sk.tool === "rect") return [{ key: "dx", name: "dx", unit: "" }, { key: "dy", name: "dy", unit: "" }];
  if (sk.tool === "circle") return [{ key: "r", name: "R", unit: "" }];
  return [];
}

/** Size fields for the modify tool. */
function sizeFields() {
  if (!sk) return [];
  if (sk.tool === "fillet") return [{ key: "r", name: "R", unit: "" }];
  if (sk.tool === "chamfer") return [{ key: "d1", name: "d1", unit: "" }, { key: "d2", name: "d2", unit: "" }];
  if (sk.tool === "offset") return [{ key: "d", name: "d", unit: "" }];
  return [];
}

/** Length, screen angle and screen dx / dy from the last point to `cur` (u, v). */
function liveValues(cur) {
  const from = last();
  if (!from || !cur) return { len: 0, ang: 0, dx: 0, dy: 0, r: 0 };
  const axes = screenFrame();
  const du = cur[0] - from[0];
  const dv = cur[1] - from[1];
  const len = Math.hypot(du, dv);
  return {
    len, r: len,
    ang: len > 1e-6 ? screenAngle(from, cur) : 0,
    dx: du * axes.right[0] + dv * axes.right[1],
    dy: du * axes.up[0] + dv * axes.up[1],
  };
}

/** The point the fields give: typed values where typed, the cursor for the rest. */
function dynPoint(cur) {
  const from = last();
  if (!from) return null;
  const lv = liveValues(cur);
  const L = dyn.locks;
  const axes = screenFrame();
  if (sk.tool === "rect") {
    const w = Math.abs(L.dx ?? lv.dx);
    const h = Math.abs(L.dy ?? lv.dy);
    if (!(w > 0) || !(h > 0)) return null;
    return cornerFromPair(from, { kind: "pair", a: w, b: h }, { axes, cursor: cur });
  }
  if (sk.tool === "circle") {
    const r = Math.abs(L.r ?? lv.r);
    if (!(r > 0)) return null;
    const d = lv.len > 1e-6 ? [(cur[0] - from[0]) / lv.len, (cur[1] - from[1]) / lv.len] : [1, 0];
    return [from[0] + d[0] * r, from[1] + d[1] * r];
  }
  if (lineMode === "polar") {
    const len = L.len ?? lv.len;
    if (!(len > 0)) return null;
    return pointFromEntry(from, { kind: "polar", len, deg: L.ang ?? lv.ang }, { axes });
  }
  return pointFromEntry(from, { kind: "rel", dx: L.dx ?? lv.dx, dy: L.dy ?? lv.dy }, { axes });
}

const fmt = (n) => String(Math.round(n * 10) / 10);

/** Tab / a digit: the size fields of a modify tool, or the next point's fields. */
function openFields(firstChar) {
  if (!sk || sk.step !== "sketch" || !sk.tool) { paintStatus("Pick a tool on the sketch bar first"); return; }
  if (sizeFields().length) { focusField(0, firstChar); return; }
  if (!POINT_TOOLS.has(sk.tool)) return;
  if (!last()) { paintStatus("Click the first point, then Tab types the next one"); return; }
  if (!dyn.open || dyn.kind !== "point") {
    dyn.open = true;
    dyn.kind = "point";
    dyn.locks = {};
    dynBox.classList.remove("hidden");
    hideTip();
    log("board.dyn.open", { tool: sk.tool, mode: sk.tool === "line" ? lineMode : "delta" });
  }
  paintDyn(true);
  focusField(0, firstChar);
}

function focusField(i, firstChar) {
  const slot = dynSlots[i];
  slot.input.focus();
  if (firstChar != null) {
    slot.input.value = firstChar;
    onDynInput(slot);
  } else slot.input.select();
}

/** Size fields stay up while Fillet / Chamfer / Offset is on. */
function openSizes() {
  dyn.open = true;
  dyn.kind = "size";
  dyn.locks = {};
  dynBox.classList.remove("hidden");
  paintDyn(true);
}

/** Put the fields away, whatever they were showing. */
function hideDyn() {
  dyn.open = false;
  dyn.locks = {};
  dynBox.classList.add("hidden");
  for (const s of dynSlots) s.input.blur();
}

/** Close the point fields; a modify tool keeps its sizes on screen. */
function closeDyn() {
  if (!dyn.open) return;
  hideDyn();
  if (sk && sk.step === "sketch" && sizeFields().length) openSizes();
}

function placeDyn() {
  const c = sk.client || (last() && client(last()));
  if (!c) return;
  const r = viewport.getBoundingClientRect();
  dynBox.style.left = `${c.x - r.left + 18}px`;
  dynBox.style.top = `${c.y - r.top - 46}px`;
}

/** Field names; live values for the untyped point fields; the box beside the cursor. */
function paintDyn(relabel = false) {
  if (!dyn.open || !sk) return;
  const size = dyn.kind === "size";
  const fields = size ? sizeFields() : pointFields();
  const lv = size ? null : liveValues(sk.raw || sk.cursor);
  dynSlots.forEach((s, i) => {
    const f = fields[i];
    s.wrap.classList.toggle("hidden", !f);
    if (!f) return;
    if (relabel || s.key !== f.key) {
      s.key = f.key;
      s.name.textContent = f.name;
      s.unit.textContent = f.unit;
    }
    if (size) {
      if (document.activeElement !== s.input || relabel) s.input.value = fmt(params[sk.tool][f.key]);
      s.wrap.classList.remove("locked");
      return;
    }
    s.wrap.classList.toggle("locked", dyn.locks[f.key] != null);
    if (dyn.locks[f.key] == null) {
      const v = f.key === "len" ? lv.len : f.key === "ang" ? lv.ang : f.key === "r" ? lv.r : sk.tool === "rect" ? Math.abs(lv[f.key]) : lv[f.key];
      const text = fmt(v);
      if (s.input.value !== text) {
        const focused = document.activeElement === s.input;
        s.input.value = text;
        if (focused) s.input.select();
      }
    }
  });
  dynHint.textContent = !size && sk.tool === "line" ? (lineMode === "polar" ? "wheel → dx dy" : "wheel → L ∠") : "";
  placeDyn();
}

/** Typing a point field holds it; clearing hands it back to the cursor. A size field sets the size. */
function onDynInput(slot) {
  const text = slot.input.value.trim();
  const n = Number(text);
  if (dyn.kind === "size") {
    if (text !== "" && Number.isFinite(n) && n > 0) {
      params[sk.tool][slot.key] = n;
      // A chamfer with one distance typed is even on both edges.
      if (sk.tool === "chamfer" && slot.key === "d1" && document.activeElement === slot.input) params.chamfer.d2 = n;
      paintStatus();
    }
    return;
  }
  if (text !== "" && Number.isFinite(n)) dyn.locks[slot.key] = n;
  else delete dyn.locks[slot.key];
  slot.wrap.classList.toggle("locked", dyn.locks[slot.key] != null);
  const p = dynPoint(sk.raw || sk.cursor);
  if (p) sk.cursor = p;
  drawPath(null);
}

/** Enter in a point field: that point goes in, the fields go back to the cursor. */
function applyDyn() {
  const locks = { ...dyn.locks };
  const mode = sk.tool === "line" ? lineMode : "delta";
  const p = dynPoint(sk.raw || sk.cursor);
  const ok = !!p && addPoint(p, "typein", mode);
  log("board.typein", { tool: sk.tool, mode, locks, ok });
  if (!ok) { if (!statusNote) paintStatus("That point does not fit"); return; }
  if (!dyn.open || dyn.kind !== "point") return;
  dyn.locks = {};
  sk.raw = p;
  sk.cursor = p;
  paintDyn(true);
  focusField(0, null);
}

function switchLineMode(how) {
  if (!dyn.open || dyn.kind !== "point" || !sk || sk.tool !== "line") return;
  lineMode = lineMode === "polar" ? "delta" : "polar";
  dyn.locks = {};
  paintDyn(true);
  focusField(0, null);
  drawPath(null);
  log("board.dyn.mode", { mode: lineMode, how });
}

for (const [i, slot] of dynSlots.entries()) {
  slot.input.addEventListener("focus", () => slot.input.select());
  slot.input.addEventListener("input", () => onDynInput(slot));
  slot.input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (!sk) return;
    const aid = AID_KEYS[e.key];
    if (aid) { e.preventDefault(); toggleAid(aid); return; }
    const count = (dyn.kind === "size" ? sizeFields() : pointFields()).length;
    if (e.key === "Tab") {
      e.preventDefault();
      if (count > 1) focusField((i + 1) % count, null);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (dyn.kind === "size") { slot.input.blur(); paintDyn(true); log("board.size", { tool: sk.tool, ...params[sk.tool] }); }
      else applyDyn();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      if (dyn.kind === "size") { slot.input.blur(); paintDyn(true); } else { closeDyn(); canvas.focus?.(); }
      return;
    }
    const typed = dyn.kind === "point" && Object.keys(dyn.locks).length > 0;
    if (dyn.kind === "point" && !typed && (e.key === "c" || e.key === "C") && sk.path.length >= 3) { e.preventDefault(); closeDyn(); closeLine("key"); return; }
    if (dyn.kind === "point" && !typed && (e.key === "u" || e.key === "U")) { e.preventDefault(); undo("key"); paintDyn(); }
  });
}

// The wheel switches the line's fields while they are open, instead of zooming.
// Capture on window runs before the viewport's own wheel handler. One notch is
// one switch: a trackpad's burst of events within WHEEL_GAP_MS counts once.
const WHEEL_GAP_MS = 250;
let lastWheel = 0;
window.addEventListener("wheel", (e) => {
  if (!dyn.open || dyn.kind !== "point" || !sk || sk.tool !== "line") return;
  e.preventDefault();
  e.stopPropagation();
  const now = performance.now();
  if (now - lastWheel > WHEEL_GAP_MS) switchLineMode("wheel");
  lastWheel = now;
}, { capture: true, passive: false });

// --- finish -------------------------------------------------------------------------------

/**
 * Closed items that do not overlap, sorted into boards. `{ plan }` with
 * `{ closed, rings, boards: [{ outer, holes }] }`, or `{ problem }`.
 */
function planBoards() {
  const closed = sk.items.filter((it) => it.closed);
  if (!closed.length) return { problem: "Draw a closed shape first" };
  const rings = closed.map(itemPoints);
  for (let i = 0; i < rings.length; i += 1) {
    for (let j = i + 1; j < rings.length; j += 1) {
      const rel = ringRelation(rings[i], rings[j]);
      if (rel === "cross" || rel === "same") return { problem: "Two shapes overlap: trim them into one outline first" };
      if ((rel === "inside" || rel === "contains") && ringsTouch(rings[i], rings[j])) return { problem: "An opening touches the shape around it: make it a notch in the outline" };
    }
  }
  const boards = nestRings(rings);
  for (const b of boards) {
    if (!sketchBoardFromUV(sk.face, closed[b.outer], sk.choice)) return { problem: `A board must be at least ${BOARD_MIN} × ${BOARD_MIN}` };
  }
  return { plan: { closed, rings, boards, open: sk.items.length - closed.length } };
}

function finishSketch(how) {
  if (!sk || sk.step !== "sketch") return;
  if (sk.path.length || sk.anchor) { paintStatus("Finish the shape you are drawing, or Esc to drop it"); return; }
  const { plan, problem } = planBoards();
  if (problem) { paintStatus(problem); log("board.blocked", { reason: problem, how }); return; }
  sk.plan = plan;
  sk.step = "stock";
  sk.pick = null;
  sk.tool = null;
  bar.classList.add("hidden");
  aidsBar.classList.add("hidden");
  hideDyn();
  hideSketchPath();
  hideSketchPick();
  hideSnapMarker();
  hideAlignLines();
  hideTip();
  log("board.sketch.finish", { how, shapes: plan.closed.length, boards: plan.boards.length, holes: plan.boards.reduce((n, b) => n + b.holes.length, 0), open: plan.open });
  paintCard();
  drawSolids();
  ctx.emitMode();
}

function placedBoards() {
  const { closed, boards } = sk.plan;
  return boards.map((b) => sketchBoardFromUV(sk.face, closed[b.outer], sk.choice, b.holes.map((i) => closed[i])));
}

/** Room off the face over every board (the roof may come down over a floor sketch). */
function roomLeft() {
  const f = sk.face;
  if (!(f.axis === "z" && f.dir > 0)) return extrudeRoom(f);
  const sp = job.getSpace();
  if (!sp) return Infinity;
  let room = Infinity;
  for (const b of (sk.plan && sk.plan.boards) || []) {
    const ys = sk.plan.rings[b.outer].map((p) => world(p).y);
    room = Math.min(room, minClearHeight(sp, Math.min(...ys), Math.max(...ys)) - f.value);
  }
  return room;
}

function paintCard() {
  const list = choices();
  const sel = el("select", {
    onchange: () => {
      const next = list.find((c) => c.id === sel.value) || list[0];
      sk.choice = { ...next, colorFace: next.single ? sk.colorFace : "pull" };
      paintCardState();
      drawSolids();
    },
  }, list.map((c) => el("option", { value: c.id, text: c.label, selected: c.id === sk.choice.id })));
  card._faces = el("div", { class: "move-kind" });
  card._note = el("div", { class: "move-note" });
  card._ok = el("button", { class: "tb primary", type: "button", text: "Create", onclick: () => create("ok") });
  const backBtn = el("button", { class: "tb", type: "button", text: "Back to sketch", onclick: () => back() });
  const n = sk.plan.boards.length;
  card.replaceChildren(
    el("div", { class: "move-card-title", text: n > 1 ? `${n} boards` : "Board" }),
    sel, card._faces, card._note,
    el("div", { class: "move-kind" }, [card._ok, backBtn]),
  );
  paintCardState();
  card.classList.remove("hidden");
}

function paintCardState() {
  const room = roomLeft();
  const t = sk.choice.thickness;
  const tight = t > room + 0.5;
  card._ok.disabled = tight;
  const holes = sk.plan.boards.reduce((k, b) => k + b.holes.length, 0);
  const open = sk.plan.open ? ` · ${sk.plan.open} open line${sk.plan.open > 1 ? "s are" : " is"} left out` : "";
  card._note.textContent = tight
    ? `${t} mm is thicker than the room (${Math.round(room)} mm)`
    : `${t} mm${holes ? ` · ${holes} opening${holes > 1 ? "s" : ""}` : ""}${open} · Enter creates · Esc back to the sketch`;
  card._faces.replaceChildren();
  if (!sk.choice.single) return;
  for (const [id, label] of [["pull", "Outer face"], ["sketch", "Sketch face"]]) {
    card._faces.append(el("button", {
      class: `tb seg${sk.choice.colorFace === id ? " active" : ""}`, type: "button", text: label,
      onclick: () => {
        sk.colorFace = id;
        sk.choice = { ...sk.choice, colorFace: id };
        paintCardState();
        drawSolids();
      },
    }));
  }
}

function create(how) {
  if (!sk || sk.step !== "stock") return;
  const room = roomLeft();
  if (sk.choice.thickness > room + 0.5) {
    log("board.blocked", { reason: "thicker than the room", thickness: sk.choice.thickness, room, face: sk.face.label });
    return;
  }
  const placed = placedBoards();
  if (placed.some((p) => !p)) return;
  const { choice, face, plan } = sk;
  const colorFace = sk.colorFace === "sketch" ? "sketch" : "pull";
  sk = null;
  hideBars();
  clearPreview();
  endFaceView();
  canvas.style.cursor = "";
  job.pushHistory();
  job.getJob().sketchBoard = { stockId: choice.id, colorFace };
  placed.forEach((p, i) => {
    const cab = job.addCabinet("sketchBoard", p.pose, {}, { history: false, params: p.params });
    log("board.finish", {
      id: cab.id, how, index: i, boards: placed.length, points: p.params.outline.length, holes: plan.boards[i].holes.length,
      arcs: p.params.outline.filter((q) => q.b).length,
      stockId: choice.id, colorFace: p.params.colorFace, plane: p.params.plane, pull: p.params.pull,
      du: p.du, dv: p.dv, thickness: choice.thickness, pose: p.pose,
      face: { axis: face.axis, value: face.value, dir: face.dir, label: face.label },
    });
  });
  ctx.emitMode();
}
