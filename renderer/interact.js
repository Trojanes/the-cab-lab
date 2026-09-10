// Left-button interaction in the viewport.
//
//   idle       click board → select · click empty → deselect · press handle → drag W/D/H or divider
//   armed      (module picked) hover shows the face under the cursor and snaps to corners · click → anchor
//   face       a zero-thickness rectangle is drawn on that face (floor, ceiling, wall, cabinet face) · click → corner
//   extrude    the rectangle is pulled along the face normal, away from the solid only · click / Enter → create
//   move       (M) click a grab point, then a target point; ΔX/ΔY/ΔZ type-ins; Ctrl+click copies
//
// At every step Tab / a digit opens the type-ins (W D H or ΔX ΔY ΔZ). Values may
// be expressions: 1110 · +50 · -20 · *2 · /2 · max · 1110,560,720 (comma fills the next fields).
// The cursor tooltip always says what the snap / inference / clamp is doing.
// Every edit writes pose or params through job.js and lets the generator redraw.
import * as THREE from "three";
import { canvas, rayFromClient, planePointAt, closestTOnLine, frame } from "./space.js";
import * as job from "./job.js";
import { getModule } from "./modules.js";
import { getPreset } from "./presets.js";
import {
  pickables, groupFor, envelopeBox, envelopeFootprint, poseFits, setHandleHover,
  showGhost, hideGhost, showSnapMarker, hideSnapMarker, showInference, hideInference, showAlignLines, hideAlignLines,
  showFaceHint, hideFaceHint,
} from "./cabinets3d.js";
import {
  nearestSnap, nearestInference, pointOnLine, toClient, nearestFaceAlign, nearestAxisAlign, describePoint, faceGuide,
  pickFace, facesAtPoint, facePlanes, faceVisible, rayHitFace, preferDrawable, extrudeRoom, inPlaneAxes, axisVector, AXES,
  INFER_BAND_PX, INFER_RELEASE_PX, AXIS_DIRS, uiScale,
} from "./snap.js";
import { showTip, hideTip } from "./hud.js";
import { log, traceSample, flushTrace, clearTrace } from "./log.js";

const FRONT_THICKNESS_DEFAULT = 16;
const DWELL_MS = 400; // rest this long on an inference line to keep the point as a source
const DIM_OF = { x: "W", y: "D", z: "H" }; // box size along each world axis
const AXIS_OF = { W: "x", D: "y", H: "z" };

let placing = null; // moduleId while armed
let rb = null; // placement in progress (face / extrude step)
let move = null; // move command
let retype = null; // keyboard re-size of the last created cabinet
let lastSize = null; // { moduleId, W, D, H } of the last created box
let lastCreated = null; // cabinet id that digits re-type while still armed
let hoverHandle = null;
let drag = null; // handle drag
const modeListeners = new Set();

const dimBox = document.getElementById("dimInputs");
const DIM_ORDER = ["W", "D", "H"];
const dimInputs = Object.fromEntries(DIM_ORDER.map((k) => [k, dimBox.querySelector(`[data-dim="${k}"] input`)]));
const dimLabels = Object.fromEntries(DIM_ORDER.map((k) => [k, dimBox.querySelector(`[data-dim="${k}"]`)]));
const dimNames = Object.fromEntries(DIM_ORDER.map((k) => [k, dimBox.querySelector(`[data-dim="${k}"] span`)]));

export function onModeChange(fn) {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}
function emitMode() {
  for (const fn of modeListeners) fn(getMode());
}
export function getMode() {
  if (drag) return "handle";
  if (move) return move.step === "grab" ? "move.grab" : "move.drop";
  if (rb) return rb.step;
  if (placing) return "armed";
  return "idle";
}
export function getPlacingModule() {
  return placing;
}

// --- arm / disarm ----------------------------------------------------------------

export function armPlacement(moduleId) {
  if (!job.hasSpace()) { log("place.arm.blocked", { moduleId, reason: "no space" }); return; }
  cancelMove();
  endRetype(false);
  placing = moduleId;
  rb = null;
  lastCreated = null;
  log("place.arm", { moduleId });
  job.select(null);
  canvas.style.cursor = "crosshair";
  emitMode();
}
export function disarm() {
  if (placing) log("place.disarm", { moduleId: placing, step: rb && rb.step });
  clearTrace();
  endRetype(false);
  placing = null;
  rb = null;
  lastCreated = null;
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}
function clearPreview() {
  hideGhost();
  hideSnapMarker();
  hideInference();
  hideAlignLines();
  hideFaceHint();
  hideTip();
  dimBox.classList.add("hidden");
}

function pick(clientX, clientY) {
  const ray = rayFromClient(clientX, clientY);
  const rc = new THREE.Raycaster(ray.origin, ray.direction);
  const hits = rc.intersectObjects(pickables(), false);
  const handle = hits.find((h) => h.object.userData.kind === "handle");
  return handle || hits[0] || null;
}

function localAxisWorld(group, axis) {
  const v = axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  return v.transformDirection(group.matrixWorld).normalize();
}

// --- cursor resolver (shared by placement and move) ------------------------------

function threePlane(axis, value) {
  const n = axisVector(axis);
  return new THREE.Plane(new THREE.Vector3(n[0], n[1], n[2]), -value);
}

function clampToSpace(p) {
  const sp = job.getSpace();
  if (!sp) return { ...p, outside: false };
  const x = Math.min(sp.bounds.maxX, Math.max(sp.bounds.minX, p.x));
  const y = Math.min(sp.bounds.maxY, Math.max(sp.bounds.minY, p.y));
  const z = Math.min(sp.height, Math.max(0, p.z));
  return { x, y, z, outside: Math.abs(x - p.x) > 5 || Math.abs(y - p.y) > 5 || Math.abs(z - p.z) > 5 };
}

function floorFace() {
  return facePlanes().find((f) => f.source === "space" && f.axis === "z" && f.dir > 0) || null;
}

/**
 * Armed / grab cursor → a point and the face it lies on:
 *   corner within reach → that corner (face = the corner's face most facing the camera)
 *   otherwise the face under the cursor → grid point on it (floor if none)
 * Returns { x, y, z, feature, face, tip } or null.
 */
function cursorPoint(clientX, clientY, { exclude = null } = {}) {
  const snap = nearestSnap(clientX, clientY, { exclude });
  if (snap) {
    // A corner lies on several faces: the face drawn over decides later (see beginFace).
    const faces = facesAtPoint(snap, clientX, clientY);
    const face = preferDrawable(faces) || floorFace();
    return {
      x: snap.x, y: snap.y, z: snap.z, feature: true, dirs: snap.dirs, face, faces,
      tip: [`Corner · ${describePoint(snap, exclude)}`, faces.length > 1 ? `On ${faces.map((f) => f.label.toLowerCase()).join(" / ")} — move along an edge of the face to draw on` : face ? `On ${face.label.toLowerCase()}` : null],
    };
  }
  const hit = pickFace(clientX, clientY, { exclude });
  const face = hit ? hit.face : floorFace();
  const raw = hit ? hit.point : planePointAt(clientX, clientY, threePlane("z", 0));
  if (!raw) return null;
  const c = clampToSpace(raw);
  const p = { x: job.snap(c.x), y: job.snap(c.y), z: job.snap(c.z) };
  if (face) p[face.axis] = face.value; // stay exactly on the face
  return { ...p, feature: false, face, tip: [`${face ? face.label : "Floor"} · ${AXES.filter((a) => !face || a !== face.axis).map((a) => `${a.toUpperCase()} ${p[a]}`).join(", ")}${c.outside ? " (edge of space)" : ""}`] };
}

/**
 * Cursor with inference. `ctx` persists between moves:
 *   { plane:{axis,value}, free3d, anchorPoint, lastPoint, inference, exclude }
 * With free3d=false the result stays on ctx.plane (drawing a rectangle on a
 * face); with free3d=true corners and edges may move the plane (move command).
 * Returns { x, y, z, kind, tip:[…], inference?, alignSegs? } or null.
 */
function resolveCursor(e, ctx) {
  const cx = e.clientX;
  const cy = e.clientY;
  const shift = e.shiftKey;
  const band = INFER_BAND_PX * uiScale();
  const plane = ctx.plane;
  const planeAxis = ctx.free3d ? null : plane.axis;

  const snap = nearestSnap(cx, cy, { exclude: ctx.exclude });
  if (snap) {
    const projected = !ctx.free3d && Math.abs(snap[plane.axis] - plane.value) > 0.5;
    // On a face, an off-face corner contributes its in-plane coordinates only (SketchUp's "from point").
    const pt = projected ? { ...snap, [plane.axis]: plane.value } : { x: snap.x, y: snap.y, z: snap.z };
    ctx.lastPoint = projected ? { ...snap, [plane.axis]: plane.value } : snap;
    ctx.inference = null;
    if (ctx.free3d) plane.value = snap[plane.axis];
    return { ...pt, kind: "feature", tip: [`Corner · ${describePoint(snap, ctx.exclude)}${projected ? " (projected to face)" : ""}`] };
  }

  const finishOnLine = (from, dir, pt, extraTip) => {
    // A face crossing the line can still pin the free coordinate.
    const al = nearestFaceAlign(cx, cy, plane, { exclude: ctx.exclude });
    const segs = [];
    const tip = [`On edge ${axisName(dir)} from ${describePoint(from)}`];
    for (const a of AXES) {
      if (Math.abs(dir[AXES.indexOf(a)]) > 0.5 && al[a] && (ctx.free3d || a !== plane.axis)) {
        pt = { ...pt, [a]: al[a].value };
        segs.push(faceGuide(al[a].plane, plane));
        tip.push(`Flush with ${al[a].plane.label}`);
      }
    }
    if (extraTip) tip.push(extraTip);
    return { ...pt, kind: "inference", inference: ctx.inference, alignSegs: segs, tip };
  };

  // Keep the current inference while the cursor stays near its line (or Shift is held).
  if (ctx.inference) {
    const inf = ctx.inference;
    const { from, dir } = inf;
    const near = shift ? { dir, distPx: 0 } : nearestInference(cx, cy, from, { band: INFER_RELEASE_PX * uiScale(), planeAxis });
    if (near && near.dir === dir) {
      const pt = pointOnLine(cx, cy, from, dir);
      if (shift || near.distPx <= band) {
        inf.at = pt;
        // Dwell: the point only becomes a future inference source if the cursor
        // rests on it (SketchUp's hover-to-encourage), never by passing through.
        const now = performance.now();
        if (!inf.dwell || Math.hypot(cx - inf.dwell.cx, cy - inf.dwell.cy) > 4) inf.dwell = { cx, cy, t: now };
        inf.dwelt = now - inf.dwell.t >= DWELL_MS;
      }
      if (ctx.free3d) plane.value = pt[plane.axis];
      return finishOnLine(from, dir, pt, shift ? "Shift: locked to edge" : inf.dwelt ? "Point kept for the next edge" : null);
    }
    // Leaving the line: a point the cursor rested on becomes the next source,
    // so a third edge can start from the end of the second one.
    if (inf.at && inf.dwelt) ctx.lastPoint = { ...inf.at, dirs: AXIS_DIRS, sources: ["edge"] };
    ctx.inference = null;
  }
  // Pick up a new inference from the last touched point or the anchor.
  for (const from of [ctx.lastPoint, ctx.anchorPoint]) {
    if (!from) continue;
    const near = nearestInference(cx, cy, from, { planeAxis });
    if (near) {
      const pt = pointOnLine(cx, cy, from, near.dir);
      ctx.inference = { from, dir: near.dir, at: pt };
      if (ctx.free3d) plane.value = pt[plane.axis];
      return finishOnLine(from, near.dir, pt);
    }
  }

  // Free cursor on the working plane, with face alignment.
  const g = planePointAt(cx, cy, threePlane(plane.axis, plane.value));
  if (!g) return null;
  const al = nearestFaceAlign(cx, cy, plane, { exclude: ctx.exclude });
  const pt = { x: g.x, y: g.y, z: g.z };
  const segs = [];
  const tip = [];
  for (const a of inPlaneAxes(plane.axis)) {
    if (al[a]) { pt[a] = al[a].value; segs.push(faceGuide(al[a].plane, plane)); tip.push(`Flush with ${al[a].plane.label}`); }
    else pt[a] = job.snap(pt[a]);
  }
  pt[plane.axis] = plane.value;
  if (!tip.length) tip.push(`${planeLabel(plane)} · ${inPlaneAxes(plane.axis).map((a) => `${a.toUpperCase()} ${pt[a]}`).join(", ")}`);
  return { ...pt, kind: segs.length ? "align" : "plane", alignSegs: segs, tip };
}

function axisName(dir) {
  return Math.abs(dir[0]) > 0.5 ? "X" : Math.abs(dir[1]) > 0.5 ? "Y" : "Z";
}
function planeLabel(plane) {
  return plane.label || `${plane.axis.toUpperCase()} = ${Math.round(plane.value)}`;
}

function drawResolved(p) {
  if (p.kind === "feature") showSnapMarker(p.x, p.y, p.z, { feature: true });
  else hideSnapMarker();
  if (p.inference) showInference(p.inference.from, p, p.inference.dir);
  else hideInference();
  if (p.alignSegs && p.alignSegs.length) showAlignLines(p.alignSegs);
  else hideAlignLines();
}

// --- placement ------------------------------------------------------------------

/** Minimum box size along each world axis for the module (D includes the fronts). */
function minSizes(mod) {
  return { W: mod.minSize.W, D: mod.minSize.D + FRONT_THICKNESS_DEFAULT, H: mod.minSize.H };
}
/** Preset box size along a world axis, falling back to the module default. */
function presetSize(moduleId, axis) {
  const k = DIM_OF[axis];
  const p = getPreset(moduleId)[k];
  if (p != null) return p;
  const d = getModule(moduleId).defaultSize;
  return k === "D" ? d.D + FRONT_THICKNESS_DEFAULT : d[k];
}

/** Room from a point to the space boundary along each axis, both ways. */
function roomFrom(p) {
  const sp = job.getSpace();
  const inf = { pos: Infinity, neg: Infinity };
  if (!sp) return { x: inf, y: inf, z: inf };
  return {
    x: { pos: sp.bounds.maxX - p.x, neg: p.x - sp.bounds.minX },
    y: { pos: sp.bounds.maxY - p.y, neg: p.y - sp.bounds.minY },
    z: { pos: sp.height - p.z, neg: p.z },
  };
}
const WALL_NAME = { x: ["left wall", "right wall"], y: ["front wall", "back wall"], z: ["floor", "ceiling"] };

/**
 * Current placement box as a min-corner AABB. The two in-plane sizes come
 * from anchor → corner (clamped inside the space, never mirrored past a
 * wall); the size along the face normal is the extrusion, one way only.
 */
function placementBox() {
  const mod = getModule(placing);
  const min = minSizes(mod);
  const { anchor, plane, locked } = rb;
  const room = roomFrom(anchor);
  const sp = job.getSpace();
  const clamped = {};
  const size = {};
  const sign = {};
  const max = {};

  for (const a of inPlaneAxes(plane.axis)) {
    const k = DIM_OF[a];
    const raw = rb.corner[a];
    const lo = a === "z" ? 0 : sp ? sp.bounds[a === "x" ? "minX" : "minY"] : -Infinity;
    const hi = a === "z" ? (sp ? sp.height : Infinity) : sp ? sp.bounds[a === "x" ? "maxX" : "maxY"] : Infinity;
    const c = Math.min(hi, Math.max(lo, raw));
    const r = room[a];
    // A side with no room (anchor on a wall, cursor beyond it) never wins.
    let s;
    if (c > anchor[a] + 0.5 && r.pos >= min[k]) s = 1;
    else if (c < anchor[a] - 0.5 && r.neg >= min[k]) s = -1;
    else s = r.pos >= r.neg ? 1 : -1;
    let v = locked[k] ?? Math.max(min[k], Math.abs(c - anchor[a]));
    const roomHere = s > 0 ? r.pos : r.neg;
    if (v > roomHere || c !== raw) {
      v = Math.min(v, roomHere);
      const hitSide = c !== raw ? (raw < anchor[a] ? 0 : 1) : (s > 0 ? 1 : 0);
      clamped[k] = WALL_NAME[a][hitSide];
    }
    size[a] = v;
    sign[a] = s;
    max[k] = roomHere;
  }

  // Extrusion: only away from the face's solid.
  const n = plane.axis;
  const kn = DIM_OF[n];
  const s = plane.dir;
  const roomN = s > 0 ? room[n].pos : room[n].neg;
  let len = locked[kn] ?? (rb.ext ? rb.ext.len : 0);
  if (len > roomN) { len = roomN; clamped[kn] = WALL_NAME[n][s > 0 ? 1 : 0]; }
  size[n] = len;
  sign[n] = s;
  max[kn] = roomN;

  // Other cabinets are solid: the rectangle and the extrusion stop at them.
  // While drawing the rectangle its two sizes are clamped; once it is clicked only the pull is.
  const blocked = stopAtCabinets(anchor, size, sign, n, rb.step === "face" ? inPlaneAxes(n) : [n]);
  for (const a of AXES) if (blocked[a]) { size[a] = blocked[a].size; clamped[DIM_OF[a]] = blocked[a].id; max[DIM_OF[a]] = Math.min(max[DIM_OF[a]], blocked[a].size); }

  const min0 = {};
  for (const a of AXES) min0[a] = sign[a] > 0 ? anchor[a] : anchor[a] - size[a];
  return {
    x0: min0.x, y0: min0.y, z0: min0.z,
    W: size.x, D: size.y, H: size.z,
    size, sign, clamped, max,
  };
}

/**
 * Clamp a box growing from `anchor` (sizes per axis, growth signs) so it does
 * not enter any existing cabinet envelope, along the axes in `order`. A zero
 * extrusion is treated as a 1 mm slab on the pull side, so a footprint cannot
 * be drawn under a cabinet standing on the same face.
 * Returns { [axis]: { size, id } } for the axes that were stopped.
 */
function stopAtCabinets(anchor, size, sign, n, order) {
  const boxes = job.getJob().cabinets.map((c) => {
    const fp = envelopeFootprint(c, c.pose);
    return { id: c.id, x: [fp.minX, fp.maxX], y: [fp.minY, fp.maxY], z: [fp.z0, fp.z1] };
  });
  if (!boxes.length) return {};
  const cur = { ...size };
  const range = (a) => {
    const len = a === n ? Math.max(cur[a], 1) : cur[a];
    return sign[a] > 0 ? [anchor[a], anchor[a] + len] : [anchor[a] - len, anchor[a]];
  };
  const overlap = (r, s) => r[0] < s[1] - 0.5 && r[1] > s[0] + 0.5;
  const out = {};
  for (const a of order) {
    const others = AXES.filter((o) => o !== a);
    for (const b of boxes) {
      if (!others.every((o) => overlap(range(o), b[o]))) continue;
      // Distance from the anchor to the cabinet's near face along the growth side.
      let room = null;
      if (sign[a] > 0 && b[a][0] >= anchor[a] - 0.5) room = Math.max(0, b[a][0] - anchor[a]);
      else if (sign[a] < 0 && b[a][1] <= anchor[a] + 0.5) room = Math.max(0, anchor[a] - b[a][1]);
      if (room == null || room >= cur[a]) continue;
      cur[a] = room;
      out[a] = { size: room, id: b.id };
    }
  }
  return out;
}

function updatePlacement(tipAt) {
  if (tipAt) rb.lastClient = { x: tipAt.clientX, y: tipAt.clientY };
  const b = placementBox();
  const clampedKeys = Object.keys(b.clamped);
  const n = rb.plane.axis;
  // Step "face": a zero-thickness rectangle; step "extrude": the box.
  showGhost(b.x0, b.y0, b.z0, b.W, b.D, b.H, { clamped: clampedKeys.length > 0 });
  for (const k of DIM_ORDER) {
    if (document.activeElement !== dimInputs[k]) dimInputs[k].value = Math.round(b[k]);
    dimLabels[k].classList.toggle("locked", rb.locked[k] != null);
    dimLabels[k].classList.toggle("hidden", rb.step === "face" && AXIS_OF[k] === n);
  }
  positionDimInputs(b);
  if (tipAt) {
    const lines = [...(tipAt.tip || [])];
    for (const k of clampedKeys) lines.push(`${k} stopped at ${b.clamped[k]}`);
    for (const k of DIM_ORDER) if (rb.locked[k] != null) lines.push(`${k} locked ${Math.round(rb.locked[k])}`);
    if (rb.step === "face") lines.push(`Enter: create with ${DIM_OF[n]} ${Math.round(presetSize(placing, n))} (preset)`);
    else if (rb.ext && rb.ext.len <= 0 && rb.locked[DIM_OF[n]] == null) lines.push(`Pull ${DIM_OF[n]} ${rb.plane.dir > 0 ? "+" : "−"}${n.toUpperCase()} · Enter uses preset ${Math.round(presetSize(placing, n))}`);
    showTip(tipAt.clientX, tipAt.clientY, lines, clampedKeys.length || (tipAt.tone === "warn") ? "warn" : Object.values(rb.locked).some((v) => v != null) ? "lock" : "");
  }
}

/** Put each type-in next to the middle of its edge. */
function positionDimInputs(b) {
  const r = canvas.getBoundingClientRect();
  const place = (k, x, y, z, dx, dy) => {
    const c = toClient(x, y, z);
    dimLabels[k].style.left = `${c.x - r.left + dx}px`;
    dimLabels[k].style.top = `${c.y - r.top + dy}px`;
    dimLabels[k].style.display = c.behind ? "none" : "";
  };
  place("W", b.x0 + b.W / 2, b.y0, b.z0, 0, 22);
  place("D", b.x0 + b.W, b.y0 + b.D / 2, b.z0, 54, 0);
  place("H", b.x0 + b.W, b.y0, b.z0 + b.H / 2, 54, -22);
}

function setDimNames(names) {
  DIM_ORDER.forEach((k, i) => { dimNames[k].textContent = names[i]; });
}

function planeOf(face) {
  return { axis: face.axis, value: face.value, dir: face.dir, label: face.label, source: face.source };
}

function beginFace(p) {
  const face = p.face || floorFace();
  const preset = getPreset(placing);
  const plane = planeOf(face);
  rb = {
    step: "face",
    plane,
    // A corner anchor keeps its candidate faces until the cursor is clearly on one of them.
    candidates: p.faces && p.faces.length > 1 ? p.faces : null,
    anchorClient: null,
    anchor: { x: p.x, y: p.y, z: p.z },
    corner: { x: p.x, y: p.y, z: p.z },
    // Typed / preset locks; the normal-axis size is never preset-locked here (Enter applies it).
    locked: { W: preset.W, D: preset.D, H: null },
    ext: null,
    ctx: {
      plane: { axis: plane.axis, value: plane.value, label: plane.label }, free3d: false, exclude: null,
      anchorPoint: { x: p.x, y: p.y, z: p.z, dirs: p.dirs || AXIS_DIRS, sources: ["anchor"] },
      lastPoint: null, inference: null,
    },
  };
  if (rb.locked[DIM_OF[plane.axis]] != null) rb.locked[DIM_OF[plane.axis]] = null; // extrusion is drawn, not preset-locked
  rb.presetLocks = { ...rb.locked };
  setDimNames(["W", "D", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked");
  showFaceHint(face);
  clearTrace();
  log("place.anchor", { moduleId: placing, anchor: rb.anchor, feature: !!p.feature, plane: { axis: plane.axis, value: plane.value, dir: plane.dir, label: plane.label } });
  updatePlacement(null);
  emitMode();
}

/**
 * Corner anchors: while the cursor is still near the corner, the working face
 * follows the face under the cursor (among those the corner lies on); once
 * the cursor is clearly away, the face is locked for this rectangle.
 */
function chooseFace(e) {
  if (!rb.candidates) return;
  const a = toClient(rb.anchor.x, rb.anchor.y, rb.anchor.z);
  const away = Math.hypot(e.clientX - a.x, e.clientY - a.y);
  // Which candidate is the cursor drawing on?
  //  1. Moving along one of the corner's edges (axis inference) names the faces
  //     that contain that edge: up a wall from a floor corner can only be the wall.
  //     Works from either side of a see-through wall.
  //  2. Otherwise the candidate whose face the cursor ray crosses, front side first.
  if (away < 6) return; // still on the corner: keep the default
  const ray = rayFromClient(e.clientX, e.clientY);
  let pool = rb.candidates.filter((f) => faceVisible(f, ray));
  const inf = nearestInference(e.clientX, e.clientY, rb.ctx.anchorPoint, { band: INFER_RELEASE_PX * uiScale() });
  let ambiguous = false;
  if (inf) {
    const along = pool.filter((f) => Math.abs(inf.dir[AXES.indexOf(f.axis)]) < 1e-6);
    if (along.length) pool = along;
    // On an edge shared by two faces (floor + a cabinet's front): either is right,
    // so keep the current face and wait for the cursor to leave the edge.
    ambiguous = pool.length > 1;
  }
  let face = pool.length === 1 ? pool[0] : null;
  if (!face && !ambiguous) {
    let bestT = Infinity;
    let bestFront = false;
    let bestRoom = -1;
    for (const f of pool) {
      const h = rayHitFace(ray, f, 5);
      if (!h) continue;
      const front = -ray.direction[f.axis] * f.dir > 0;
      const room = extrudeRoom(f);
      const sameHit = Math.abs(h.t - bestT) < 0.5;
      const better = (sameHit && room > bestRoom + 1)
        || (front && !bestFront && !sameHit)
        || (front === bestFront && h.t < bestT - 0.5);
      if (better) { face = f; bestT = h.t; bestFront = front; bestRoom = room; }
    }
  }
  // Coincident faces (cabinet top = ceiling): keep / switch to the one with room to pull.
  if (ambiguous) {
    const drawable = preferDrawable(pool);
    if (drawable && extrudeRoom(rb.plane) <= 1 && extrudeRoom(drawable) > 1) face = drawable;
    else if (pool.some((f) => f.axis === rb.plane.axis && f.value === rb.plane.value && f.dir === rb.plane.dir)) face = null;
  }
  if (face && (face.axis !== rb.plane.axis || face.dir !== rb.plane.dir)) {
    rb.plane = planeOf(face);
    rb.ctx.plane = { axis: face.axis, value: face.value, label: face.label };
    rb.ctx.inference = null;
    rb.ctx.lastPoint = null;
    rb.locked = { ...rb.presetLocks };
    rb.locked[DIM_OF[face.axis]] = null;
    showFaceHint(face);
    log("place.face", { moduleId: placing, plane: { axis: face.axis, value: face.value, dir: face.dir, label: face.label } });
  }
  if (away > 40 * uiScale() && face && !ambiguous) rb.candidates = null; // locked
}

function beginExtrude(e) {
  const { plane } = rb;
  const n = plane.axis;
  // Bake the rectangle as drawn (clamped by walls and cabinets): the pull starts from its real corner.
  const b0 = placementBox();
  for (const a of inPlaneAxes(n)) rb.corner[a] = rb.anchor[a] + b0.sign[a] * b0.size[a];
  const corner = rb.corner;
  const dirV = axisVector(n, plane.dir);
  rb.step = "extrude";
  rb.ext = {
    t0: closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(corner.x, corner.y, corner.z), new THREE.Vector3(dirV[0], dirV[1], dirV[2])),
    len: 0, label: null,
  };
  hideInference();
  hideAlignLines();
  hideSnapMarker();
  log("place.corner", { moduleId: placing, corner, plane: { axis: n, value: plane.value }, locked: rb.locked });
  updatePlacement({ clientX: e.clientX, clientY: e.clientY, tip: [] });
  emitMode();
}

function extrudeCursor(e) {
  const { corner, plane, ext } = rb;
  const n = plane.axis;
  const dirV = axisVector(n, plane.dir);
  const ray = rayFromClient(e.clientX, e.clientY);
  // Looking straight along the axis it degenerates on screen: keep the current value.
  if (Math.abs(ray.direction[n]) > 0.985) return { tip: [`Orbit to see the ${n.toUpperCase()} axis, or type ${DIM_OF[n]}`] };

  const snap = nearestAxisAlign(e.clientX, e.clientY, corner, n, plane.dir);
  if (snap) {
    ext.len = Math.abs(snap.value - plane.value);
    ext.label = snap.label;
    const q = { ...corner, [n]: snap.value };
    showSnapMarker(q.x, q.y, q.z, { feature: true });
    return { tip: [snap.label] };
  }
  hideSnapMarker();
  ext.label = null;
  const t = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(corner.x, corner.y, corner.z), new THREE.Vector3(dirV[0], dirV[1], dirV[2]));
  const travel = t - ext.t0;
  if (travel < 0) {
    ext.len = 0;
    return { tip: [`Can't pull into ${plane.label.toLowerCase()}`], tone: "warn" };
  }
  ext.len = job.snap(travel);
  return { tip: [`${DIM_OF[n]} ${Math.round(ext.len)} ${plane.dir > 0 ? "+" : "−"}${n.toUpperCase()}`] };
}

function createFromBox(b, how) {
  const mod = getModule(placing);
  const fpt = FRONT_THICKNESS_DEFAULT;
  flushTrace("place.trace");
  log("place.finish", {
    moduleId: placing, how,
    anchor: rb ? rb.anchor : null, corner: rb ? rb.corner : null, locked: rb ? rb.locked : null,
    plane: rb ? { axis: rb.plane.axis, value: rb.plane.value, dir: rb.plane.dir, label: rb.plane.label } : null,
    extrude: rb && rb.ext ? { len: rb.ext.len, label: rb.ext.label } : null,
    clamped: b.clamped, box: { x0: b.x0, y0: b.y0, z0: b.z0, W: b.W, D: b.D, H: b.H },
  });
  // Cabinet local origin is the front carcass face; the box includes the fronts.
  const cab = job.addCabinet(
    placing,
    { x: b.x0, y: b.y0 + fpt, z: b.z0, rotZ: 0 },
    { W: b.W, D: Math.max(mod.minSize.D, b.D - fpt), H: b.H },
  );
  lastSize = { moduleId: placing, W: b.W, D: b.D, H: b.H };
  lastCreated = cab.id;
  rb = null;
  clearPreview();
  if (!poseFits(cab, cab.pose)) {
    log("place.unfit", { id: cab.id, pose: cab.pose });
    console.warn("[place]", cab.id, "does not fit the space; see Checks");
  }
  // Stay armed: the next click starts another box of the same module.
  emitMode();
}

function faceDrawn() {
  const [u, v] = inPlaneAxes(rb.plane.axis);
  return rb.locked[DIM_OF[u]] != null || rb.locked[DIM_OF[v]] != null
    || Math.abs(rb.corner[u] - rb.anchor[u]) >= 1 || Math.abs(rb.corner[v] - rb.anchor[v]) >= 1;
}

/** Enter / click: create. A zero extrusion takes the preset size along the normal. */
function finishPlacement(how) {
  if (!rb || !faceDrawn()) return;
  const n = rb.plane.axis;
  const kn = DIM_OF[n];
  if (rb.locked[kn] == null && !(rb.ext && rb.ext.len > 0)) {
    rb.ext = rb.ext || { t0: 0, len: 0, label: null };
    rb.ext.len = Math.max(minSizes(getModule(placing))[kn], presetSize(placing, n));
    how += ".preset";
  }
  const b = placementBox();
  const min = minSizes(getModule(placing));
  const small = DIM_ORDER.filter((k) => b[k] < min[k]);
  if (small.length) {
    log("place.blocked", { reason: "below minimum size", dims: small, clamped: b.clamped, box: b });
    showTip(rb.lastClient ? rb.lastClient.x : 0, rb.lastClient ? rb.lastClient.y : 0, [`No room: ${small.map((k) => `${k} ${Math.round(b[k])} < ${min[k]}`).join(", ")}`], "warn");
    return;
  }
  createFromBox(b, how);
}

/** Shift+click: repeat the last size at this anchor, growing toward the side with room. */
function repeatLastSize(anchor) {
  if (!lastSize || lastSize.moduleId !== placing) return false;
  const room = roomFrom(anchor);
  const pickSide = (a, want) => (room[a].pos >= want || room[a].pos >= room[a].neg ? 1 : -1);
  const sx = pickSide("x", lastSize.W);
  const sy = pickSide("y", lastSize.D);
  const sz = pickSide("z", lastSize.H);
  const W = Math.min(lastSize.W, sx > 0 ? room.x.pos : room.x.neg);
  const D = Math.min(lastSize.D, sy > 0 ? room.y.pos : room.y.neg);
  const H = Math.min(lastSize.H, sz > 0 ? room.z.pos : room.z.neg);
  log("place.repeat", { moduleId: placing, anchor: { x: anchor.x, y: anchor.y, z: anchor.z }, size: lastSize });
  createFromBox({
    x0: sx > 0 ? anchor.x : anchor.x - W, y0: sy > 0 ? anchor.y : anchor.y - D, z0: sz > 0 ? anchor.z : anchor.z - H,
    W, D, H, clamped: {},
  }, "repeat");
  return true;
}

function cancelPlacement() {
  if (!rb) return;
  flushTrace("place.trace");
  log("place.cancel", { moduleId: placing, step: rb.step, anchor: rb.anchor, corner: rb.corner });
  rb = null;
  clearPreview();
  canvas.focus?.();
  emitMode();
}

// --- move command -----------------------------------------------------------------

export function startMove(id = job.getSelectedId()) {
  const cab = id && job.getJob().cabinets.find((c) => c.id === id);
  if (!cab) return;
  if (placing) disarm();
  endRetype(false);
  move = { id, step: "grab", pose0: { ...cab.pose }, before: job.snapshot(), grab: null, locked: { W: null, D: null, H: null }, ctx: null, target: null, clamped: [] };
  job.select(id);
  canvas.style.cursor = "crosshair";
  log("move.start", { id, pose: move.pose0 });
  emitMode();
}

function moveGrab(p) {
  move.grab = { x: p.x, y: p.y, z: p.z };
  move.step = "drop";
  move.ctx = {
    plane: { axis: "z", value: p.z }, free3d: true, exclude: move.id,
    anchorPoint: { x: p.x, y: p.y, z: p.z, dirs: AXIS_DIRS, sources: ["grab"] },
    lastPoint: null, inference: null,
  };
  setDimNames(["ΔX", "ΔY", "ΔZ"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked", "hidden");
  hideFaceHint();
  clearTrace();
  log("move.grab", { id: move.id, grab: move.grab, feature: !!p.feature });
  emitMode();
}

/** Pose for the current target, clamped so the envelope stays in the space. */
function movePose() {
  const cab = job.getJob().cabinets.find((c) => c.id === move.id);
  const t = move.target || move.grab;
  const delta = {
    x: move.locked.W ?? job.snap(t.x - move.grab.x),
    y: move.locked.D ?? job.snap(t.y - move.grab.y),
    z: move.locked.H ?? job.snap(t.z - move.grab.z),
  };
  const pose = { ...move.pose0, x: move.pose0.x + delta.x, y: move.pose0.y + delta.y, z: move.pose0.z + delta.z };
  const clamped = [];
  const sp = job.getSpace();
  if (sp) {
    const fp = envelopeFootprint(cab, pose);
    const b = sp.bounds;
    if (fp.minX < b.minX) { pose.x += b.minX - fp.minX; clamped.push("left wall"); }
    if (fp.maxX > b.maxX) { pose.x -= fp.maxX - b.maxX; clamped.push("right wall"); }
    if (fp.minY < b.minY) { pose.y += b.minY - fp.minY; clamped.push("front wall"); }
    if (fp.maxY > b.maxY) { pose.y -= fp.maxY - b.maxY; clamped.push("back wall"); }
    if (fp.z0 < 0) { pose.z -= fp.z0; clamped.push("floor"); }
    if (fp.z1 > sp.height) { pose.z -= fp.z1 - sp.height; clamped.push("ceiling"); }
  }
  return { pose, delta: { x: pose.x - move.pose0.x, y: pose.y - move.pose0.y, z: pose.z - move.pose0.z }, clamped };
}

function overlaps(cab, pose) {
  const a = envelopeFootprint(cab, pose);
  return job.getJob().cabinets.filter((o) => {
    if (o.id === cab.id) return false;
    const b = envelopeFootprint(o, o.pose);
    return a.minX < b.maxX - 0.5 && a.maxX > b.minX + 0.5 && a.minY < b.maxY - 0.5 && a.maxY > b.minY + 0.5 && a.z0 < b.z1 - 0.5 && a.z1 > b.z0 + 0.5;
  }).map((o) => o.id);
}

function updateMove(tipAt) {
  const { pose, delta, clamped } = movePose();
  move.clamped = clamped;
  const cab = job.getJob().cabinets.find((c) => c.id === move.id);
  if (cab.pose.x !== pose.x || cab.pose.y !== pose.y || cab.pose.z !== pose.z) job.updateCabinet(move.id, (c) => { c.pose = pose; });
  const vals = { W: delta.x, D: delta.y, H: delta.z };
  for (const k of DIM_ORDER) {
    if (document.activeElement !== dimInputs[k]) dimInputs[k].value = Math.round(vals[k]);
    dimLabels[k].classList.toggle("locked", move.locked[k] != null);
  }
  placeMoveLabels(cab, pose);
  if (tipAt) {
    const lines = [...(tipAt.tip || []), `ΔX ${Math.round(delta.x)}  ΔY ${Math.round(delta.y)}  ΔZ ${Math.round(delta.z)}`];
    for (const c of clamped) lines.push(`Stopped at ${c}`);
    const ov = overlaps(cab, pose);
    if (ov.length) lines.push(`Overlaps ${ov.join(", ")}`);
    if (tipAt.ctrlKey) lines.push("Ctrl: copy");
    showTip(tipAt.clientX, tipAt.clientY, lines, clamped.length || ov.length ? "warn" : "");
  }
}

function placeMoveLabels(cab, pose) {
  const fp = envelopeFootprint(cab, pose);
  positionDimInputs({ x0: fp.minX, y0: fp.minY, z0: fp.z0, W: fp.maxX - fp.minX, D: fp.maxY - fp.minY, H: fp.z1 - fp.z0 });
}

function finishMove(copy) {
  if (!move || move.step !== "drop") return;
  const { pose, delta, clamped } = movePose();
  const m = move;
  move = null;
  flushTrace("move.trace");
  const cab = job.getJob().cabinets.find((c) => c.id === m.id);
  if (copy) {
    // Put the original back, then add a twin at the new pose (one undo step).
    job.updateCabinet(m.id, (c) => { c.pose = { ...m.pose0 }; });
    const params = JSON.parse(JSON.stringify(cab.params));
    const twin = job.addCabinet(cab.moduleId, pose, getModule(cab.moduleId).envelope(params));
    job.updateCabinet(twin.id, (c) => { c.params = params; });
    log("move.copy", { from: m.id, to: twin.id, pose, delta, clamped });
  } else {
    const changed = job.commitSnapshot(m.before);
    log("move.finish", { id: m.id, from: m.pose0, to: pose, delta, clamped, changed });
  }
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}

export function cancelMove() {
  if (!move) return;
  const m = move;
  move = null;
  job.updateCabinet(m.id, (c) => { c.pose = { ...m.pose0 }; });
  log("move.cancel", { id: m.id, step: m.step });
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}

// --- re-type the last created box ---------------------------------------------------

function beginRetype() {
  const cab = job.getJob().cabinets.find((c) => c.id === lastCreated);
  if (!cab) return false;
  retype = { id: cab.id, before: job.snapshot(), params0: cab.params };
  setDimNames(["W", "D", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked", "hidden");
  updateRetype();
  log("retype.start", { id: cab.id });
  return true;
}
function retypeBox() {
  const cab = job.getJob().cabinets.find((c) => c.id === retype.id);
  const fp = envelopeFootprint(cab, cab.pose);
  const env = getModule(cab.moduleId).envelope(cab.params);
  return { x0: fp.minX, y0: fp.minY, z0: fp.z0, W: env.W, D: env.D + FRONT_THICKNESS_DEFAULT, H: env.H };
}
function updateRetype() {
  const b = retypeBox();
  for (const k of DIM_ORDER) if (document.activeElement !== dimInputs[k]) dimInputs[k].value = Math.round(b[k]);
  positionDimInputs(b);
}
function applyRetype(k, v) {
  const cab = job.getJob().cabinets.find((c) => c.id === retype.id);
  const mod = getModule(cab.moduleId);
  const min = minSizes(mod);
  if (!(v >= min[k])) return;
  const size = k === "D" ? { D: v - FRONT_THICKNESS_DEFAULT } : { [k]: v };
  const params = mod.setEnvelope(cab.params, size);
  if (!poseFits({ ...cab, params }, cab.pose)) return;
  job.setParams(cab.id, params, { history: false });
  updateRetype();
}
function endRetype(commit) {
  if (!retype) return;
  const r = retype;
  retype = null;
  if (commit) {
    const changed = job.commitSnapshot(r.before);
    const cab = job.getJob().cabinets.find((c) => c.id === r.id);
    log("retype.end", { id: r.id, changed, envelope: cab ? getModule(cab.moduleId).envelope(cab.params) : null });
  } else {
    job.setParams(r.id, r.params0, { history: false });
    log("retype.cancel", { id: r.id });
  }
  dimBox.classList.add("hidden");
  canvas.focus?.();
}

// --- pointer -----------------------------------------------------------------------

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (retype) endRetype(true);

  if (move) {
    if (move.step === "grab") {
      const p = cursorPoint(e.clientX, e.clientY);
      if (p) moveGrab(p);
    } else {
      finishMove(e.ctrlKey);
    }
    return;
  }

  if (placing) {
    if (!rb) {
      const p = cursorPoint(e.clientX, e.clientY);
      if (!p) return;
      if (e.shiftKey && repeatLastSize(p)) return;
      beginFace(p);
    } else if (rb.step === "face") {
      if (!faceDrawn()) return; // a second click on the anchor is a no-op
      rb.candidates = null; // the face is settled by the second click
      if (rb.locked[DIM_OF[rb.plane.axis]] != null) finishPlacement("click.locked");
      else beginExtrude(e);
    } else {
      finishPlacement("click");
    }
    return;
  }

  const hit = pick(e.clientX, e.clientY);
  if (!hit) {
    job.select(null);
    return;
  }
  const { kind, cabId, handle } = hit.object.userData;
  const cab = job.getJob().cabinets.find((c) => c.id === cabId);
  if (!cab) return;

  if (kind === "handle") {
    const group = groupFor(cabId);
    const axis = handle.type === "W" ? "x" : handle.type === "D" ? "y" : "z";
    const dir = localAxisWorld(group, axis);
    const origin = hit.object.getWorldPosition(new THREE.Vector3());
    drag = {
      cabId, handle, dir, origin,
      t0: closestTOnLine(e.clientX, e.clientY, origin, dir),
      before: job.snapshot(),
      params0: cab.params,
      pose0: { ...cab.pose },
      result0: job.resultFor(cabId),
    };
    // OrbitControls ignores the left button, so the middle button still orbits mid-drag.
    canvas.setPointerCapture(e.pointerId);
    log("handle.start", { id: cabId, handle: handle.type, index: handle.index, envelope: getModule(cab.moduleId).envelope(cab.params) });
    emitMode();
    return;
  }

  job.select(cabId);
});

function hoverArmed(e, prefix) {
  const p = cursorPoint(e.clientX, e.clientY);
  if (!p) { hideSnapMarker(); hideFaceHint(); hideTip(); return; }
  showSnapMarker(p.x, p.y, p.z, { feature: p.feature });
  if (p.face) showFaceHint(p.face); else hideFaceHint();
  const lines = [...(prefix ? [prefix] : []), ...p.tip];
  if (placing && lastSize && lastSize.moduleId === placing) lines.push(`Shift+click: repeat ${lastSize.W}×${lastSize.D}×${lastSize.H}`);
  showTip(e.clientX, e.clientY, lines);
}

canvas.addEventListener("pointermove", (e) => {
  if (drag) return handleDragMove(e);

  if (move) {
    if (move.step === "grab") return hoverArmed(e, "Grab point");
    const p = resolveCursor(e, move.ctx);
    if (!p) return;
    move.target = { x: p.x, y: p.y, z: p.z };
    traceSample({ cx: Math.round(e.clientX), cy: Math.round(e.clientY), x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), kind: p.kind, dir: p.inference ? p.inference.dir : undefined });
    drawResolved(p);
    updateMove({ clientX: e.clientX, clientY: e.clientY, tip: p.tip, ctrlKey: e.ctrlKey });
    return;
  }

  if (placing) {
    if (!rb) return hoverArmed(e, null);
    if (rb.step === "face") {
      chooseFace(e);
      const p = resolveCursor(e, rb.ctx);
      if (!p) return;
      rb.corner = { x: p.x, y: p.y, z: p.z };
      traceSample({ cx: Math.round(e.clientX), cy: Math.round(e.clientY), x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), kind: p.kind, dir: p.inference ? p.inference.dir : undefined, shift: e.shiftKey || undefined });
      drawResolved(p);
      updatePlacement({ clientX: e.clientX, clientY: e.clientY, tip: p.tip });
    } else {
      const r = extrudeCursor(e);
      traceSample({ cx: Math.round(e.clientX), cy: Math.round(e.clientY), len: Math.round(rb.ext.len), kind: rb.ext.label ? "extrude.snap" : "extrude", label: rb.ext.label || undefined });
      updatePlacement({ clientX: e.clientX, clientY: e.clientY, tip: r.tip, tone: r.tone });
    }
    return;
  }

  // Idle: hover feedback on handles.
  const hit = job.getSelectedId() ? pick(e.clientX, e.clientY) : null;
  const h = hit && hit.object.userData.kind === "handle" ? hit.object : null;
  if (h !== hoverHandle) {
    setHandleHover(hoverHandle, false);
    setHandleHover(h, true);
    hoverHandle = h;
  }
  canvas.style.cursor = h ? cursorFor(h.userData.handle) : hit ? "pointer" : "";
});

function handleDragMove(e) {
  const t = closestTOnLine(e.clientX, e.clientY, drag.origin, drag.dir);
  const delta = t - drag.t0;
  const cab = job.getJob().cabinets.find((c) => c.id === drag.cabId);
  if (!cab) return;
  const mod = getModule(cab.moduleId);
  const env0 = mod.envelope(drag.params0);
  const h = drag.handle;

  // Resize handles stop at the space boundary: only apply a candidate that still fits.
  let stopped = false;
  const applyIfFits = (params, pose) => {
    if (!poseFits({ ...cab, params, pose }, pose)) { stopped = true; return; }
    job.updateCabinet(drag.cabId, (c) => { c.params = params; c.pose = pose; });
  };

  if (h.type === "W") {
    const W = Math.max(mod.minSize.W, job.snap(env0.W + delta));
    applyIfFits(mod.setEnvelope(drag.params0, { W }), cab.pose);
  } else if (h.type === "D") {
    // Front face is pulled; keep the back (local y = D) where it is.
    const D = Math.max(mod.minSize.D, job.snap(env0.D - delta));
    const shift = env0.D - D;
    const yDir = drag.dir;
    applyIfFits(
      mod.setEnvelope(drag.params0, { D }),
      { ...drag.pose0, x: drag.pose0.x + yDir.x * shift, y: drag.pose0.y + yDir.y * shift },
    );
  } else if (h.type === "H") {
    const H = Math.max(mod.minSize.H, job.snap(env0.H + delta));
    applyIfFits(mod.setEnvelope(drag.params0, { H }), cab.pose);
  } else if (h.type === "divider") {
    job.setParams(drag.cabId, mod.setDivider(drag.params0, drag.result0, h.index, h.pos + delta), { history: false });
  }
  const env = mod.envelope(job.getJob().cabinets.find((c) => c.id === drag.cabId).params);
  const val = h.type === "divider" ? null : `${h.type} ${Math.round(h.type === "D" ? env.D + FRONT_THICKNESS_DEFAULT : env[h.type])}`;
  showTip(e.clientX, e.clientY, [val || "Zone boundary", stopped ? "Stopped at the space boundary" : null], stopped ? "warn" : "");
}

function endDrag(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
  const changed = job.commitSnapshot(d.before);
  const cab = job.getJob().cabinets.find((c) => c.id === d.cabId);
  log("handle.end", {
    id: d.cabId, handle: d.handle.type, index: d.handle.index, changed,
    envelope: cab ? getModule(cab.moduleId).envelope(cab.params) : null,
    zones: cab && cab.params.zones ? cab.params.zones.map((z) => z.height) : undefined,
    pose: cab ? cab.pose : null,
  });
  hideTip();
  emitMode();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener("pointerleave", () => {
  if ((placing && !rb) || (move && move.step === "grab")) { hideSnapMarker(); hideFaceHint(); hideTip(); }
});

function cursorFor(handle) {
  if (!handle) return "";
  if (handle.type === "divider" || handle.type === "H") return "ns-resize";
  return "ew-resize";
}

// Keep type-ins glued to the box while the camera moves.
(function tickDims() {
  if (rb) positionDimInputs(placementBox());
  else if (retype) updateRetype();
  else if (move && move.step === "drop") {
    const cab = job.getJob().cabinets.find((c) => c.id === move.id);
    if (cab) placeMoveLabels(cab, cab.pose); // labels only; no job writes per frame
  }
  requestAnimationFrame(tickDims);
})();

// --- dimension type-ins ---------------------------------------------------------------

function focusDim(k) {
  for (const kk of DIM_ORDER) dimLabels[kk].classList.toggle("focused", kk === k);
  dimInputs[k].focus();
  dimInputs[k].select();
}
function focusedDim() {
  return DIM_ORDER.find((k) => document.activeElement === dimInputs[k]) || null;
}
/** Dims that are open for typing right now (the face step hides the normal-axis one). */
function typableDims() {
  if (rb && rb.step === "face") return DIM_ORDER.filter((k) => AXIS_OF[k] !== rb.plane.axis);
  return DIM_ORDER;
}
function nextDim(k, back = false) {
  const list = typableDims();
  const i = Math.max(0, list.indexOf(k));
  return list[(i + (back ? list.length - 1 : 1)) % list.length];
}

/**
 * Evaluate one type-in: 1110 · +50 · -20 · *2 · /2 · max. Returns a number or null.
 * `current` is the value the field shows, `max` the room the space leaves.
 */
export function evalDim(text, current, max) {
  const s = String(text).trim().toLowerCase();
  if (!s) return null;
  if (s === "max" || s === "m") return Number.isFinite(max) ? max : null;
  const m = /^([+\-*/])\s*(\d+(?:\.\d+)?)$/.exec(s);
  if (m) {
    const v = Number(m[2]);
    if (m[1] === "+") return current + v;
    if (m[1] === "-") return current - v;
    if (m[1] === "*") return current * v;
    return v ? current / v : null;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  return null;
}

function currentDim(k) {
  if (rb) return placementBox()[k];
  if (move && move.step === "drop") { const d = movePose().delta; return { W: d.x, D: d.y, H: d.z }[k]; }
  if (retype) return retypeBox()[k];
  return 0;
}
function maxDim(k) {
  if (rb) return placementBox().max[k];
  return null;
}

/** Apply a typed value to whichever command owns the type-ins. */
function setTyped(k, v) {
  if (rb) {
    const min = minSizes(getModule(placing))[k];
    rb.locked[k] = v != null && v >= min ? v : null;
    log("place.typein", { dim: k, value: dimInputs[k].value, locked: rb.locked[k] });
    updatePlacement(null);
  } else if (move && move.step === "drop") {
    move.locked[k] = v != null ? v : null;
    log("move.typein", { dim: k, value: dimInputs[k].value, locked: move.locked[k] });
    updateMove(null);
  } else if (retype) {
    if (v != null) applyRetype(k, v);
    log("retype.typein", { dim: k, value: dimInputs[k].value });
  }
}

/** Commit the field on Tab / Enter: expressions and comma lists. Returns the dim after the last filled one. */
function commitDim(k) {
  const parts = dimInputs[k].value.split(",");
  let kk = k;
  for (let i = 0; i < parts.length; i += 1) {
    const v = evalDim(parts[i], currentDim(kk), maxDim(kk));
    if (v != null) { setTyped(kk, v); dimInputs[kk].value = Math.round(v); }
    if (i < parts.length - 1) kk = nextDim(kk);
  }
  return nextDim(kk);
}

for (const k of DIM_ORDER) {
  const input = dimInputs[k];
  input.addEventListener("input", () => {
    // Plain numbers apply live; expressions wait for Tab / Enter.
    const s = input.value.trim();
    if (/^\d+(?:\.\d+)?$/.test(s)) setTyped(k, Number(s));
    else if (s === "") setTyped(k, null);
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const next = commitDim(k);
      focusDim(e.shiftKey ? nextDim(k, true) : next);
    } else if (e.key === "Enter") {
      e.preventDefault();
      commitDim(k);
      if (rb) finishPlacement("enter");
      else if (move) finishMove(e.ctrlKey);
      else if (retype) endRetype(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (rb) cancelPlacement();
      else if (move) cancelMove();
      else if (retype) endRetype(false);
    }
    e.stopPropagation();
  });
}

// --- keyboard ----------------------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  const typing = rb || (move && move.step === "drop") || retype;

  if (typing) {
    if (e.key === "Tab") { e.preventDefault(); focusDim(focusedDim() || typableDims()[0]); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (rb) finishPlacement("enter");
      else if (move) finishMove(e.ctrlKey);
      else endRetype(true);
      return;
    }
    if (e.key === "Escape") {
      if (rb) cancelPlacement();
      else if (move) cancelMove();
      else endRetype(false);
      return;
    }
    // Typing a digit / sign jumps straight into the first open field.
    if (/^[0-9.+\-*/]$/.test(e.key)) { const k = typableDims()[0]; focusDim(k); dimInputs[k].value = ""; return; }
    return;
  }
  if (e.key === "Escape") {
    if (move) cancelMove();
    else if (placing) disarm();
    else job.select(null);
    return;
  }
  // Armed with a fresh box: digits re-type its size.
  if (placing && lastCreated && !e.ctrlKey && /^[0-9.+\-*/]$/.test(e.key)) {
    if (beginRetype()) { focusDim("W"); dimInputs.W.value = ""; }
    return;
  }

  const sel = job.getSelected();
  if (e.key === "f" || e.key === "F") {
    if (sel) {
      const env = envelopeBox(sel, job.resultFor(sel.id));
      const group = groupFor(sel.id);
      const center = new THREE.Vector3((env.x0 + env.x1) / 2, (env.y0 + env.y1) / 2, (env.z0 + env.z1) / 2).applyMatrix4(group.matrixWorld);
      frame(center, Math.hypot(env.W, env.D + env.fpt, env.H) / 2);
    } else {
      const sp = job.getSpace();
      if (!sp) return;
      const W = sp.bounds.maxX - sp.bounds.minX;
      const D = sp.bounds.maxY - sp.bounds.minY;
      frame(new THREE.Vector3(sp.bounds.minX + W / 2, sp.bounds.minY + D / 2, sp.height / 2), Math.hypot(W, D, sp.height) / 2);
    }
    return;
  }
  if (!sel || move) return;
  if (e.key === "m" || e.key === "M") {
    startMove(sel.id);
  } else if (e.key === "Delete" || e.key === "Backspace") {
    log("key.delete", { id: sel.id });
    job.removeCabinet(sel.id);
  } else if (e.key === "r" || e.key === "R") {
    log("key.rotate", { id: sel.id, from: sel.pose.rotZ || 0 });
    // Rotate 90° about the envelope centre.
    const env = envelopeBox(sel, job.resultFor(sel.id));
    const cx = (env.x0 + env.x1) / 2;
    const cy = (env.y0 + env.y1) / 2;
    const a0 = ((sel.pose.rotZ || 0) * Math.PI) / 180;
    const a1 = a0 + Math.PI / 2;
    const wx = sel.pose.x + cx * Math.cos(a0) - cy * Math.sin(a0);
    const wy = sel.pose.y + cx * Math.sin(a0) + cy * Math.cos(a0);
    job.setPose(sel.id, {
      ...sel.pose,
      rotZ: ((sel.pose.rotZ || 0) + 90) % 360,
      x: job.snap(wx - (cx * Math.cos(a1) - cy * Math.sin(a1))),
      y: job.snap(wy - (cx * Math.sin(a1) + cy * Math.cos(a1))),
    });
  }
});
