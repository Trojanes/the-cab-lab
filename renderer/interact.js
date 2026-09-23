// Left-button interaction in the viewport.
//
//   idle       click board → select · click empty → deselect · press handle → drag W/D/H or divider
//   armed      (module picked) hover shows the face under the cursor and snaps to corners · click → anchor
//   face       a zero-thickness rectangle is drawn on that face (floor, ceiling, wall, cabinet face) · click → corner
//   extrude    the rectangle is pulled along the face normal, away from the solid only · click / Enter → create
//   move       (M) one command. The card picks Free (arrows and rings), Face
//              (two faces, same direction) or Point (a corner onto a point).
//              Module moves the cabinet, Panel moves one board. Enter confirms.
//   orient     (O / Face) click a side of a cabinet → its doors face that way (pending, orange);
//              click elsewhere or Enter confirms · Esc restores
//
// At every step of drawing a box, Tab / a digit opens the type-ins (W D H). Values may
// be expressions: 1110 · +50 · -20 · *2 · /2 · max · 1110,560,720 (comma fills the next fields).
// The cursor tooltip always says what the snap / inference / clamp is doing.
// Every edit writes pose or params through job.js and lets the generator redraw.
import * as THREE from "three";
import { canvas, rayFromClient, planePointAt, closestTOnLine, frame } from "./space.js";
import * as job from "./job.js";
import { getModule, BEDROOM_LAYOUT_LABEL as LAYOUT_LABEL } from "./modules.js";
import { getPreset } from "./presets.js";
import {
  pickables, groupFor, envelopeBox, envelopeFootprint, poseFits, setHandleHover, faceUnderHit, disarmHandle,
  showGhost, hideGhost, showNoseGhost, showWidthRect, hideWidthRect, showCPlanePreview, hideCPlanePreview, showSnapMarker, hideSnapMarker, showInference, hideInference, showAlignLines, hideAlignLines,
  showFaceHint, hideFaceHint, flashFaceHint,
  setMoveOpen, placeMoveTriad, hideMoveTriad, layoutMoveTriad, setMoveHover,
} from "./cabinets3d.js";
import {
  nearestSnap, nearestInference, pointOnLine, toClient, nearestFaceAlign, nearestAxisAlign, describePoint, faceGuide,
  pickFace, facesAtPoint, facesOnPoint, facePlanes, faceVisible, rayHitFace, preferDrawable, drawableOn, extrudeRoom, inPlaneAxes, axisVector, AXES,
  INFER_BAND_PX, INFER_RELEASE_PX, AXIS_DIRS, uiScale, SNAP_RADIUS_PX,
} from "./snap.js";
import { showTip, hideTip } from "./hud.js";
import { wallPickables, solidBoxes } from "./walls3d.js";
import { clearHeightAt, minClearHeight, maxClearHeight, roofName, slicePlane } from "./spaces.js";
import { log, traceSample, flushTrace, clearTrace } from "./log.js";
import { poseOf, boardOverride, rotatePoseAbout, translatePose, translateBoardOverride, rotateBoardOverride, worldOf, boardFaceLocal, worldPlane, alignTranslation, translatePoseBy, translateBoardOverrideBy, boardCornerLocals } from "./pose.js";
import { faceLabel } from "./boardModel.js";

const FRONT_THICKNESS_DEFAULT = 16;
const DWELL_MS = 400; // rest this long on an inference line to keep the point as a source
const DIM_OF = { x: "W", y: "D", z: "H" }; // box size along each world axis
const AXIS_OF = { W: "x", D: "y", H: "z" };

let placing = null; // moduleId while armed
let rb = null; // placement in progress (face / extrude step)
let move = null; // move command
let align = null; // face align: module (whole cabinet) or panel (one board)
let pointAlign = null; // point align: translate so two points coincide, no rotation
let orient = null; // Face command: { id, pose0, before, pending: face | null }
let retype = null; // keyboard re-size of the last created cabinet
let nose = null; // nose placement (Bedroom): { moduleId, step: ready | drag, editId, D, t0, locked, snapLabel, clamped }
let bed = null; // bed box placement: { moduleId, step: width | depth, editId, W, D, H, locked: {W, D}, snapLabel, clamped }
let cplane = null; // construction plane: { step: pick | offset, face, offset, locked, snapLabel, clamped }
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
  if (move) {
    if (move.kind === "face") return align?.source ? "move.face.target" : "move.face";
    if (move.kind === "point") return pointAlign?.source ? "move.point.target" : "move.point";
    return "move";
  }
  if (orient) return orient.pending ? "orient.pending" : "orient.pick";
  if (nose) return nose.step === "ready" ? "nose.ready" : "nose.drag";
  if (bed) return `bedbox.${bed.step}`;
  if (cplane) return cplane.step === "pick" ? "plane.pick" : "plane.offset";
  if (rb) return rb.step;
  if (placing) return "armed";
  return "idle";
}
export function getPlacingModule() {
  return placing || (nose ? nose.moduleId : null) || (bed ? bed.moduleId : null);
}

// --- arm / disarm ----------------------------------------------------------------

export function armPlacement(moduleId) {
  if (!job.hasSpace()) { log("place.arm.blocked", { moduleId, reason: "no space" }); return; }
  if (getModule(moduleId).placement === "nose") { startNose(moduleId); return; }
  if (getModule(moduleId).placement === "bedBox" || getModule(moduleId).placement === "bedSide") { startBedBox(moduleId); return; }
  cancelMove();
  cancelAlign();
  cancelPointAlign();
  cancelOrient();
  cancelNose();
  cancelBedBox();
  cancelPlane();
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
  if (nose) { cancelNose(); return; }
  if (bed) { cancelBedBox(); return; }
  if (cplane) { cancelPlane(); return; }
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
  hideCPlanePreview();
  hideTip();
  dimBox.classList.add("hidden");
  if (document.activeElement && dimBox.contains(document.activeElement)) document.activeElement.blur();
}

function pick(clientX, clientY) {
  const ray = rayFromClient(clientX, clientY);
  const rc = new THREE.Raycaster(ray.origin, ray.direction);
  const hits = rc.intersectObjects([...pickables(), ...wallPickables()], false);
  const triad = hits.find((h) => h.object.userData.kind === "moveAxis");
  if (triad) return triad;
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
  const z = Math.min(clearHeightAt(sp, x, y), Math.max(0, p.z));
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
  if (ceilingMode()) {
    // Overhead: the anchor is a feature point on a ceiling ∩ wall line, nothing else.
    const snap = nearestSnap(clientX, clientY, { exclude, filter: onCeilingLine });
    if (!snap) return { none: true, tip: ["Overhead starts on a ceiling edge", "Click a corner where a wall meets the ceiling (or an overhead's top corner there)"] };
    const all = allowedCeilingFaces(snap, facesOnPoint(snap));
    const visible = facesAtPoint(snap, clientX, clientY).filter((f) => all.includes(f));
    const face = preferDrawable(visible) || ceilingFace() || preferDrawable(all);
    const walls = wallsAt(snap).map((w) => w.label.toLowerCase()).join(" / ");
    return {
      x: snap.x, y: snap.y, z: snap.z, feature: true, dirs: snap.dirs, face, faces: all,
      tip: [`Ceiling edge · ${describePoint(snap, exclude)} · ${walls}`, all.length > 1 ? `On ${all.map((f) => f.label.toLowerCase()).join(" / ")} — move onto the face to draw on` : face ? `On ${face.label.toLowerCase()}` : null],
    };
  }
  const snap = nearestSnap(clientX, clientY, { exclude });
  if (snap) {
    // A corner lies on several faces: the face drawn over decides later (see beginFace).
    const all = facesOnPoint(snap);
    const visible = facesAtPoint(snap, clientX, clientY);
    const face = drawableOn(preferDrawable(visible) || preferDrawable(all) || floorFace());
    const hidden = all.length - visible.length;
    return {
      x: snap.x, y: snap.y, z: snap.z, feature: true, dirs: snap.dirs, face, faces: all,
      tip: [`Corner · ${describePoint(snap, exclude)}`, all.length > 1 ? `On ${all.map((f) => f.label.toLowerCase()).join(" / ")}${hidden ? " — orbit to draw on a hidden wall" : " — move onto the face to draw on"}` : face ? `On ${face.label.toLowerCase()}` : null],
    };
  }
  const hit = pickFace(clientX, clientY, { exclude });
  const face = drawableOn(hit ? hit.face : floorFace());
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

/**
 * Which module dimension (W / D / H) lies along each world axis while a box is
 * drawn. Normally x→W, y→D (the doors face −Y until `defaultSide` decides);
 * a ceiling-hung module knows its back wall early, so W follows the wall.
 */
function currentTerm() {
  return (rb && rb.term) || DIM_OF;
}
/** Minimum box size along each world axis (keys W/D/H = x/y/z; the depth includes the fronts). */
function minSizes(mod, term = currentTerm()) {
  const out = {};
  for (const a of AXES) out[DIM_OF[a]] = mod.minSize[term[a]] + (term[a] === "D" ? FRONT_THICKNESS_DEFAULT : 0);
  return out;
}
/** Preset box size along a world axis, falling back to the module default. */
function presetSize(moduleId, axis, term = currentTerm()) {
  const k = term[axis];
  const p = getPreset(moduleId)[k];
  if (p != null) return p;
  const d = getModule(moduleId).defaultSize;
  return k === "D" ? d.D + FRONT_THICKNESS_DEFAULT : d[k];
}

// --- ceiling-hung placement (Overhead) ------------------------------------------------
//
// The anchor is a feature point on a ceiling ∩ wall line; that wall is the
// cabinet's back, W runs along it, the doors face the room and the top stays
// on the ceiling (the box can only grow down). Three faces may hold the 2D
// rectangle: the ceiling (W×D, pull H down), the back wall (W×H, pull D into
// the room) or a face perpendicular to the wall — the adjacent wall at a corner
// or a neighbour's side (D×H, pull W along the wall).

function ceilingMode() {
  return !!placing && getModule(placing).placement === "ceiling";
}
function ceilingFace() {
  return facePlanes().find((f) => f.source === "space" && f.axis === "z" && f.dir < 0) || null;
}
/** Walls of the space the point lies on: { axis, value, dir (into the room), label }. */
function wallsAt(p) {
  const sp = job.getSpace();
  if (!sp) return [];
  const b = sp.bounds;
  const walls = new Set(sp.walls || []);
  const out = [];
  if (walls.has(3) && Math.abs(p.x - b.minX) < 0.5) out.push({ axis: "x", value: b.minX, dir: 1, label: "Left wall" });
  if (walls.has(1) && Math.abs(p.x - b.maxX) < 0.5) out.push({ axis: "x", value: b.maxX, dir: -1, label: "Right wall" });
  if (walls.has(0) && Math.abs(p.y - b.minY) < 0.5) out.push({ axis: "y", value: b.minY, dir: 1, label: "Front wall" });
  if (walls.has(2) && Math.abs(p.y - b.maxY) < 0.5) out.push({ axis: "y", value: b.maxY, dir: -1, label: "Back wall" });
  return out;
}
/** On the flat ceiling and on at least one wall. */
function onCeilingLine(p) {
  const sp = job.getSpace();
  if (!sp || Math.abs(p.z - sp.height) > 0.5) return false;
  if (p.y < (sp.flatFromY ?? sp.bounds.minY) - 0.5) return false;
  return wallsAt(p).length > 0;
}
/** Faces through a ceiling-line anchor that an overhead box may be drawn on (see above). */
function allowedCeilingFaces(anchor, faces) {
  const walls = wallsAt(anchor);
  const out = [];
  for (const f of faces) {
    if (f.axis === "z") { if (f.source === "space" && f.dir < 0) out.push(f); continue; }
    if (walls.some((w) => w.axis === f.axis && Math.abs(w.value - f.value) < 0.5 && w.dir === f.dir)) { out.push(f); continue; } // the back wall
    if (walls.some((w) => w.axis !== f.axis)) out.push(f); // perpendicular: side wall at a corner, a neighbour's side
  }
  const ceil = ceilingFace();
  if (ceil && !out.includes(ceil)) out.push(ceil);
  return out;
}
/**
 * The back wall for a box drawn from `walls` on `plane`. One wall at the
 * anchor: that wall. A face perpendicular to the only wall (a neighbour's
 * side): that wall. At a corner (two walls) the box decides once it exists:
 * W runs along the wall its longer horizontal edge follows; until then the
 * wall being drawn on counts as the back (front view). Null when unknown yet.
 */
function backWallFor(walls, plane, b = null) {
  if (!walls.length) return null;
  if (walls.length === 1) return walls[0];
  if (b) {
    const along = (w) => (w.axis === "y" ? b.W : b.D);
    return walls.slice().sort((p, q) => along(q) - along(p))[0];
  }
  if (plane && plane.axis !== "z") return walls.find((w) => w.axis === plane.axis && Math.abs(w.value - plane.value) < 0.5) || null;
  return null;
}
/** Module dimension along each world axis once the back wall is known (W along it, D through it). */
function termFor(wall) {
  if (!wall) return DIM_OF;
  return { x: wall.axis === "x" ? "D" : "W", y: wall.axis === "y" ? "D" : "W", z: "H" };
}
function applyCeilingTerm() {
  if (!rb || !ceilingMode()) return;
  const wall = backWallFor(rb.walls, rb.plane);
  rb.term = termFor(wall);
  rb.backWall = wall;
  setDimNames(DIM_ORDER.map((k) => rb.term[AXIS_OF[k]]));
}
/** Door side of a finished overhead box: away from its back wall. */
function ceilingSide(b, walls, plane) {
  const wall = backWallFor(walls, plane, b) || walls[0];
  return wall ? { axis: wall.axis, dir: wall.dir, wall: wall.label } : defaultSide(b);
}

/** Room from a point to the space boundary along each axis, both ways. */
function roomFrom(p) {
  const sp = job.getSpace();
  const inf = { pos: Infinity, neg: Infinity };
  if (!sp) return { x: inf, y: inf, z: inf };
  return {
    x: { pos: sp.bounds.maxX - p.x, neg: p.x - sp.bounds.minX },
    y: { pos: sp.bounds.maxY - p.y, neg: p.y - sp.bounds.minY },
    z: { pos: clearHeightAt(sp, p.x, p.y) - p.z, neg: p.z },
  };
}

/**
 * The roof may be lower over part of a box than at its anchor (the nose of a
 * vehicle): shrink H so the top stays under the roof over the whole footprint.
 * Mutates size / clamped / max; returns the roof height used.
 */
function clampToRoof(sp, anchor, size, sign, clamped, max) {
  if (!sp) return Infinity;
  const y0 = sign.y > 0 ? anchor.y : anchor.y - size.y;
  const y1 = y0 + size.y;
  const roof = minClearHeight(sp, y0, y1);
  if (sign.z > 0) {
    const room = Math.max(0, roof - anchor.z);
    if (size.z > room + 0.01) { size.z = room; clamped.H = roofName(sp, y0, y1); }
    if (max.H != null) max.H = Math.min(max.H, room);
  }
  if (clamped.H === "ceiling") clamped.H = roofName(sp, y0, y1);
  return roof;
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
  clampToRoof(sp, anchor, size, sign, clamped, max);

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
  // Every solid in the job: cabinets and partition walls alike.
  const boxes = solidBoxes();
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
    const term = currentTerm();
    if (rb.backWall) lines.push(`Back on the ${rb.backWall.label.toLowerCase()} · W along it · doors toward the room`);
    if (rb.step === "face") lines.push(`Enter: create with ${term[n]} ${Math.round(presetSize(placing, n))} (preset)`);
    else if (rb.ext && rb.ext.len <= 0 && rb.locked[DIM_OF[n]] == null) lines.push(`Pull ${term[n]} ${rb.plane.dir > 0 ? "+" : "−"}${n.toUpperCase()} · Enter uses preset ${Math.round(presetSize(placing, n))}`);
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
  const ceiling = ceilingMode();
  const face = ceiling ? (p.face || ceilingFace()) : drawableOn(p.face || floorFace());
  const preset = getPreset(placing);
  const plane = planeOf(face);
  rb = {
    step: "face",
    plane,
    // A corner anchor keeps its candidate faces until the cursor is clearly on one of them.
    candidates: (p.faces && p.faces.length > 1) ? p.faces : null,
    walls: ceiling ? wallsAt(p) : [],
    term: null,
    backWall: null,
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
  if (ceiling) {
    // Presets are in module terms; re-key them to the world axes once the wall is known.
    applyCeilingTerm();
    rb.locked = { W: null, D: null, H: null };
    for (const a of AXES) if (a !== plane.axis && rb.term[a] !== "H") rb.locked[DIM_OF[a]] = preset[rb.term[a]] ?? null;
    rb.presetLocks = { ...rb.locked };
  }
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked");
  showFaceHint(face);
  clearTrace();
  log("place.anchor", { moduleId: placing, anchor: rb.anchor, feature: !!p.feature, plane: { axis: plane.axis, value: plane.value, dir: plane.dir, label: plane.label }, walls: ceiling ? rb.walls.map((w) => w.label) : undefined, term: rb.term || undefined });
  updatePlacement(null);
  emitMode();
}

/**
 * Corner anchors: the click only sets the point. The working face follows
 * the cursor among the faces that meet there until the opposite corner is
 * clicked — along an edge (one face, or the side of a shared edge you lean
 * toward), otherwise the candidate the ray hits.
 */
function chooseFace(e) {
  if (!rb.candidates) return;
  const a = toClient(rb.anchor.x, rb.anchor.y, rb.anchor.z);
  const away = Math.hypot(e.clientX - a.x, e.clientY - a.y);
  if (away < 6) return;
  const ray = rayFromClient(e.clientX, e.clientY);
  const pool = rb.candidates.filter((f) => faceVisible(f, ray));
  if (!pool.length) return;

  let face = null;
  const inf = nearestInference(e.clientX, e.clientY, rb.ctx.anchorPoint, { band: INFER_RELEASE_PX * uiScale() });
  if (inf) {
    const along = pool.filter((f) => Math.abs(inf.dir[AXES.indexOf(f.axis)]) < 1e-6);
    if (along.length === 1) face = along[0];
    else if (along.length > 1) {
      face = faceBesideEdge(e.clientX, e.clientY, a, inf.dir, along)
        || along.find((f) => f.axis === rb.plane.axis && f.value === rb.plane.value && f.dir === rb.plane.dir)
        || preferDrawable(along);
    }
  }
  if (!face) {
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
  if (face && pool.filter((f) => f.axis === face.axis && f.value === face.value).length > 1) {
    face = preferDrawable(pool.filter((f) => f.axis === face.axis && f.value === face.value)) || face;
  }
  if (face && !ceilingMode()) face = drawableOn(face);
  if (!face || (face.axis === rb.plane.axis && face.value === rb.plane.value && face.dir === rb.plane.dir)) return;
  rb.plane = planeOf(face);
  rb.ctx.plane = { axis: face.axis, value: face.value, label: face.label };
  rb.ctx.inference = null;
  rb.ctx.lastPoint = null;
  if (ceilingMode()) {
    applyCeilingTerm();
    const preset = getPreset(placing);
    rb.locked = { W: null, D: null, H: null };
    for (const a of AXES) if (a !== face.axis && rb.term[a] !== "H") rb.locked[DIM_OF[a]] = preset[rb.term[a]] ?? null;
    rb.presetLocks = { ...rb.locked };
  } else {
    rb.locked = { ...rb.presetLocks };
    rb.locked[DIM_OF[face.axis]] = null;
  }
  showFaceHint(face);
  log("place.face", { moduleId: placing, plane: { axis: face.axis, value: face.value, dir: face.dir, label: face.label }, term: rb.term || undefined });
}

/** Which of `faces` (sharing an edge through the anchor along `dir`) the cursor sits on. */
function faceBesideEdge(cx, cy, a, dir, faces) {
  const edgeAxis = dir[0] ? "x" : dir[1] ? "y" : "z";
  let best = null;
  let bestSep = 0;
  for (const f of faces) {
    const into = inPlaneAxes(f.axis).find((ax) => ax !== edgeAxis);
    if (!into) continue;
    const mid = (f.ext[into][0] + f.ext[into][1]) / 2;
    const sign = mid >= rb.anchor[into] ? 1 : -1;
    const probe = { ...rb.anchor, [into]: rb.anchor[into] + sign * 400 };
    const end = { ...rb.anchor, [edgeAxis]: rb.anchor[edgeAxis] + (dir[AXES.indexOf(edgeAxis)] >= 0 ? 400 : -400) };
    const p = toClient(probe.x, probe.y, probe.z);
    const b = toClient(end.x, end.y, end.z);
    if (p.behind || b.behind) continue;
    const edgeSide = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
    const curSide = (b.x - a.x) * (cy - a.y) - (b.y - a.y) * (cx - a.x);
    if (edgeSide * curSide <= 0) continue;
    const sep = Math.abs(curSide) / (Math.hypot(b.x - a.x, b.y - a.y) || 1);
    if (sep > bestSep) { bestSep = sep; best = f; }
  }
  return bestSep > 4 ? best : null;
}

function beginExtrude(e) {
  const drawn = ceilingMode() ? rb.plane : drawableOn(rb.plane);
  if (drawn.dir !== rb.plane.dir || drawn.label !== rb.plane.label) {
    rb.plane = planeOf(drawn);
    rb.ctx.plane = { axis: drawn.axis, value: drawn.value, label: drawn.label };
  }
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
  if (Math.abs(ray.direction[n]) > 0.985) return { tip: [`Orbit to see the ${n.toUpperCase()} axis, or type ${currentTerm()[n]}`] };

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
  return { tip: [`${currentTerm()[n]} ${Math.round(ext.len)} ${plane.dir > 0 ? "+" : "−"}${n.toUpperCase()}`] };
}

function createFromBox(b, how, side = defaultSide(b)) {
  const mod = getModule(placing);
  flushTrace("place.trace");
  // The box is the envelope; the door side decides which edge is W and where the origin (front carcass face) sits.
  const fit = fitBoxFacing(b, side, FRONT_THICKNESS_DEFAULT);
  log("place.finish", {
    moduleId: placing, how,
    anchor: rb ? rb.anchor : null, corner: rb ? rb.corner : null, locked: rb ? rb.locked : null,
    plane: rb ? { axis: rb.plane.axis, value: rb.plane.value, dir: rb.plane.dir, label: rb.plane.label } : null,
    extrude: rb && rb.ext ? { len: rb.ext.len, label: rb.ext.label } : null,
    clamped: b.clamped, box: { x0: b.x0, y0: b.y0, z0: b.z0, W: b.W, D: b.D, H: b.H },
    side: { axis: side.axis, dir: side.dir }, wall: side.wall, size: { W: fit.W, D: fit.D, H: fit.H }, pose: fit.pose,
  });
  const cab = job.addCabinet(
    placing,
    fit.pose,
    { W: fit.W, D: Math.max(mod.minSize.D, fit.D), H: fit.H },
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
  // Minimums in module terms: W/D depend on which side gets the doors.
  const mod = getModule(placing);
  const side = ceilingMode() ? ceilingSide(b, rb.walls, rb.plane) : defaultSide(b);
  const fit = fitBoxFacing(b, side, FRONT_THICKNESS_DEFAULT);
  const small = DIM_ORDER.filter((k) => fit[k] < mod.minSize[k]);
  if (small.length) {
    log("place.blocked", { reason: "below minimum size", dims: small, clamped: b.clamped, box: b, fit });
    showTip(rb.lastClient ? rb.lastClient.x : 0, rb.lastClient ? rb.lastClient.y : 0, [`No room: ${small.map((k) => `${k} ${Math.round(fit[k])} < ${mod.minSize[k]}`).join(", ")}`], "warn");
    return;
  }
  createFromBox(b, how, side);
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
  const size = { x: W, y: D, z: Math.min(lastSize.H, sz > 0 ? room.z.pos : room.z.neg) };
  const clamped = {};
  clampToRoof(job.getSpace(), anchor, size, { x: sx, y: sy, z: sz }, clamped, {});
  const H = size.z;
  log("place.repeat", { moduleId: placing, anchor: { x: anchor.x, y: anchor.y, z: anchor.z }, size: lastSize, clamped });
  const b = {
    x0: sx > 0 ? anchor.x : anchor.x - W, y0: sy > 0 ? anchor.y : anchor.y - D, z0: sz > 0 ? anchor.z : anchor.z - H,
    W, D, H, clamped,
  };
  createFromBox(b, "repeat", ceilingMode() ? ceilingSide(b, wallsAt(anchor), null) : defaultSide(b));
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

// --- nose placement (Bedroom) ----------------------------------------------------------
//
// The module fills the vehicle's nose: front = nose cross-section, width = van
// width, height = roof; only the depth from the nose is chosen.
//   ready   the module is picked → the slab is already shown at the preset depth
//   drag    one click → the room-side face follows the cursor along +Y (snaps to
//           roof vertices / seam / cabinet faces); "From front" type-in
//   click / Enter → create (or re-size the existing one), Esc → cancel

function noseLength() {
  const sp = job.getSpace();
  return sp ? sp.bounds.maxY - sp.bounds.minY : Infinity;
}
function noseMid() {
  const sp = job.getSpace();
  return { x: (sp.bounds.minX + sp.bounds.maxX) / 2, y: 0, z: 0 };
}
function noseT(e) {
  const m = noseMid();
  return closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(m.x, 0, 0), new THREE.Vector3(0, 1, 0));
}
function noseBox() {
  const sp = job.getSpace();
  return { x0: sp.bounds.minX, y0: 0, z0: 0, W: sp.bounds.maxX - sp.bounds.minX, D: nose.D, H: Math.round(maxClearHeight(sp, 0, nose.D) * 10) / 10 };
}

export function startNose(moduleId) {
  const sp = job.getSpace();
  if (!sp) return;
  const mod = getModule(moduleId);
  cancelMove();
  cancelAlign();
  cancelPointAlign();
  cancelOrient();
  cancelNose();
  cancelBedBox();
  cancelPlane();
  endRetype(false);
  if (placing) { placing = null; rb = null; lastCreated = null; clearPreview(); }
  // One per vehicle: picking the module again edits the existing slab's depth.
  const existing = mod.single ? job.getJob().cabinets.find((c) => c.moduleId === moduleId) : null;
  const D = existing
    ? mod.envelope(existing.params).D
    : Math.max(mod.minSize.D, Math.min(noseLength(), presetSize(moduleId, "y")));
  nose = { moduleId, step: "ready", editId: existing ? existing.id : null, D, t0: 0, locked: null, snapLabel: null, clamped: null, lastClient: null };
  job.select(existing ? existing.id : null);
  canvas.style.cursor = "crosshair";
  showNoseGhost(sp, D);
  log("nose.arm", { moduleId, editId: nose.editId, depth: D, preset: presetSize(moduleId, "y") });
  emitMode();
}

function noseBegin(e) {
  nose.step = "drag";
  nose.t0 = e ? noseT(e) - nose.D : 0; // relative: the face starts where it is and follows the cursor
  setDimNames(["W", "From front", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) {
    dimLabels[k].classList.remove("focused", "locked");
    dimLabels[k].classList.toggle("hidden", k !== "D");
  }
  log("nose.drag", { moduleId: nose.moduleId, editId: nose.editId, depth: nose.D });
  updateNose(e);
  emitMode();
}

/** Depth for the cursor (or the lock): snapped, clamped to the space and stopped by other cabinets. */
function noseDepth(e) {
  const mod = getModule(nose.moduleId);
  const min = mod.minSize.D;
  const L = noseLength();
  let D;
  let label = null;
  let clamped = null;
  if (nose.locked != null) D = nose.locked;
  else if (e) {
    const snap = nearestAxisAlign(e.clientX, e.clientY, noseMid(), "y", +1, { exclude: nose.editId });
    if (snap) { D = snap.value; label = snap.label; } else D = job.snap(noseT(e) - nose.t0);
  } else D = nose.D;
  if (D > L) { D = L; clamped = "back wall"; }
  if (D < min) { D = min; clamped = `minimum ${min}`; }
  // Other cabinets in the nose stop the room-side face (not the ones glued to the body — they move with it).
  for (const c of job.getJob().cabinets) {
    if (c.id === nose.editId || getModule(c.moduleId).attachesTo === nose.moduleId) continue;
    const fp = envelopeFootprint(c, c.pose);
    if (fp.minY < D - 0.5 && fp.minY >= min) { D = job.snap(fp.minY); clamped = c.id; label = null; }
  }
  nose.D = D;
  nose.snapLabel = label;
  nose.clamped = clamped;
}

function updateNose(e) {
  if (e) nose.lastClient = { x: e.clientX, y: e.clientY };
  noseDepth(e);
  const sp = job.getSpace();
  showNoseGhost(sp, nose.D, { clamped: !!nose.clamped });
  if (document.activeElement !== dimInputs.D) dimInputs.D.value = Math.round(nose.D);
  dimLabels.D.classList.toggle("locked", nose.locked != null);
  positionDimInputs(noseBox());
  if (e) {
    const b = noseBox();
    const lines = [`From front ${Math.round(nose.D)} · roof ${Math.round(b.H)} at the room face`];
    if (nose.snapLabel) lines.push(nose.snapLabel);
    if (nose.clamped) lines.push(`Stopped at ${nose.clamped}`);
    if (nose.locked != null) lines.push(`Locked ${Math.round(nose.locked)}`);
    lines.push(nose.editId ? "Click or Enter to apply · Esc keeps the old depth" : "Click or Enter to create · Esc cancels");
    showTip(e.clientX, e.clientY, lines, nose.clamped ? "warn" : nose.locked != null ? "lock" : "");
  }
}

function noseHover(e) {
  nose.lastClient = { x: e.clientX, y: e.clientY };
  const b = noseBox();
  showTip(e.clientX, e.clientY, [
    nose.editId ? `${nose.editId} · from front ${Math.round(nose.D)}` : `Bedroom · from front ${Math.round(nose.D)} (preset)`,
    `Nose ${Math.round(b.W)} wide · roof ${Math.round(b.H)} at the room face`,
    `Click to drag the depth · Enter ${nose.editId ? "keeps it" : "creates it"} · Esc cancels`,
  ]);
}

function finishNose(how) {
  if (!nose) return;
  const n = nose;
  const sp = job.getSpace();
  const mod = getModule(n.moduleId);
  noseDepth(null);
  const b = noseBox();
  // Room-side face is the cabinet front: rotZ 180 puts local −Y (fronts) toward the room and local Y toward the nose.
  const pose = { x: sp.bounds.maxX, y: b.D, z: 0, rotZ: 180 };
  nose = null;
  let id = n.editId;
  let changed = true;
  if (id) {
    const before = job.snapshot();
    job.updateCabinet(id, (c) => { c.params = mod.setEnvelope(c.params, { D: b.D }); c.pose = pose; });
    changed = job.commitSnapshot(before);
  } else {
    id = job.addCabinet(n.moduleId, pose, { W: b.W, D: b.D, H: b.H }).id;
  }
  const cab = job.getJob().cabinets.find((c) => c.id === id);
  log("nose.finish", { moduleId: n.moduleId, id, how, depth: b.D, locked: n.locked, snap: n.snapLabel, clamped: n.clamped, edited: !!n.editId, changed, pose, envelope: cab ? mod.envelope(cab.params) : null, roofProfile: cab ? cab.params.roofProfile : null });
  clearPreview();
  canvas.style.cursor = "";
  job.select(id);
  emitMode();
}

export function cancelNose() {
  if (!nose) return;
  const n = nose;
  nose = null;
  log("nose.cancel", { moduleId: n.moduleId, editId: n.editId, step: n.step, depth: n.D });
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}

// --- construction plane ----------------------------------------------------------------
//
// Click a wall or cabinet face, offset a parallel plane into the room, click /
// Enter to leave it. The plane is infinite (axis = value); what you see is
// plane ∩ space. Its outline vertices are feature points for placement.

const PLANE_MIN = 10;

function planeMid(face) {
  const e = face.ext;
  const p = { x: (e.x[0] + e.x[1]) / 2, y: (e.y[0] + e.y[1]) / 2, z: (e.z[0] + e.z[1]) / 2 };
  p[face.axis] = face.value;
  return p;
}
function planeValue() {
  return cplane.face.value + cplane.face.dir * cplane.offset;
}
function planeBox() {
  const slice = slicePlane(job.getSpace(), cplane.face.axis, planeValue());
  if (!slice) return { x0: 0, y0: 0, z0: 0, W: 1, D: 1, H: 1 };
  const e = slice.ext;
  return { x0: e.x[0], y0: e.y[0], z0: e.z[0], W: Math.max(e.x[1] - e.x[0], 1), D: Math.max(e.y[1] - e.y[0], 1), H: Math.max(e.z[1] - e.z[0], 1) };
}

export function startPlane() {
  if (cplane) { cancelPlane(); return; }
  if (!job.hasSpace()) { log("plane.blocked", { reason: "no space" }); return; }
  cancelMove();
  cancelAlign();
  cancelPointAlign();
  cancelOrient();
  cancelNose();
  cancelBedBox();
  endRetype(false);
  if (placing) { placing = null; rb = null; lastCreated = null; clearPreview(); }
  cplane = { step: "pick", face: null, offset: 0, locked: null, snapLabel: null, clamped: null };
  canvas.style.cursor = "crosshair";
  log("plane.arm");
  emitMode();
}

function planeHoverPick(e) {
  const hit = pickFace(e.clientX, e.clientY);
  if (!hit) { hideFaceHint(); hideTip(); return; }
  showFaceHint(hit.face);
  const room = extrudeRoom(hit.face);
  showTip(e.clientX, e.clientY, [
    hit.face.label,
    room < PLANE_MIN ? "No room to offset this way" : `Click, then pull ${DIM_OF[hit.face.axis]} ${hit.face.dir > 0 ? "+" : "−"}${hit.face.axis.toUpperCase()}`,
    "Esc cancels",
  ], room < PLANE_MIN ? "warn" : "");
}

function planeBeginOffset(face) {
  const room = extrudeRoom(face);
  if (room < PLANE_MIN) { log("plane.blocked", { reason: "no room", face: face.label, room }); return; }
  cplane.step = "offset";
  cplane.face = { axis: face.axis, value: face.value, dir: face.dir, ext: face.ext, label: face.label, source: face.source };
  cplane.offset = job.snap(Math.min(100, room));
  cplane.locked = null;
  setDimNames(["Offset", "D", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) {
    dimLabels[k].classList.remove("focused", "locked");
    dimLabels[k].classList.toggle("hidden", k !== "W");
  }
  hideFaceHint();
  log("plane.face", { axis: face.axis, value: face.value, dir: face.dir, label: face.label, source: face.source, room });
  updatePlane(null);
  emitMode();
}

function planeReadOffset(e) {
  const face = cplane.face;
  const max = extrudeRoom(face);
  let off;
  let label = null;
  let clamped = null;
  if (cplane.locked != null) off = cplane.locked;
  else if (e) {
    const mid = planeMid(face);
    const snap = nearestAxisAlign(e.clientX, e.clientY, mid, face.axis, face.dir);
    if (snap) { off = (snap.value - face.value) * face.dir; label = snap.label; }
    else {
      const t = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(mid.x, mid.y, mid.z), new THREE.Vector3(...axisVector(face.axis, face.dir)));
      off = job.snap(t);
    }
  } else off = cplane.offset;
  if (off > max) { off = job.snap(Math.floor(max / 10) * 10) || max; clamped = "space"; }
  if (off < PLANE_MIN) { off = PLANE_MIN; clamped = `minimum ${PLANE_MIN}`; }
  cplane.offset = off;
  cplane.snapLabel = label;
  cplane.clamped = clamped;
}

function updatePlane(e) {
  if (!cplane || cplane.step !== "offset") return;
  planeReadOffset(e);
  const v = planeValue();
  showCPlanePreview(cplane.face.axis, v, { clamped: !!cplane.clamped });
  if (document.activeElement !== dimInputs.W) dimInputs.W.value = Math.round(cplane.offset);
  dimLabels.W.classList.toggle("locked", cplane.locked != null);
  positionDimInputs(planeBox());
  if (!e) return;
  showTip(e.clientX, e.clientY, [
    `${cplane.face.label} + ${Math.round(cplane.offset)} → ${cplane.face.axis.toUpperCase()} ${Math.round(v)}`,
    cplane.snapLabel,
    cplane.clamped ? `Stopped at ${cplane.clamped}` : null,
    "Click or Enter to place · Esc cancels",
  ], cplane.clamped ? "warn" : cplane.locked != null ? "lock" : "");
}

function finishPlane(how) {
  if (!cplane || cplane.step !== "offset") return;
  planeReadOffset(null);
  const p = cplane;
  const value = p.face.value + p.face.dir * p.offset;
  cplane = null;
  const rec = job.addPlane({
    axis: p.face.axis, value, dir: p.face.dir, offset: p.offset,
    from: { source: p.face.source, axis: p.face.axis, value: p.face.value, label: p.face.label },
  });
  log("plane.finish", { how, id: rec.id, axis: rec.axis, value: rec.value, offset: rec.offset, locked: p.locked, snap: p.snapLabel, clamped: p.clamped, from: rec.from });
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}

export function cancelPlane() {
  if (!cplane) return;
  const p = cplane;
  cplane = null;
  log("plane.cancel", { step: p.step, offset: p.offset, face: p.face && p.face.label });
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}

// --- bed box placement ---------------------------------------------------------------------
//
// Attached to the Bedroom body: it stands in the mattress opening and runs
// into the room. Width (the body's bed frame) and height (boot height) are
// read from the body — never typed or dragged here. Only the length is chosen:
//   length  the box stands on the body face, its room-side face follows the
//           cursor into the room (snaps to cabinet faces / back wall)
//   click / Enter → create (or re-size the existing one), Esc → cancel

function bedBody() {
  return job.getJob().cabinets.find((c) => c.moduleId === "bedroom") || null;
}
function bedFrame() {
  const sp = job.getSpace();
  const body = bedBody();
  if (!sp || !body) return null;
  const bodyMod = getModule(body.moduleId);
  const bodyD = bodyMod.envelope(body.params).D;
  return { cx: (sp.bounds.minX + sp.bounds.maxX) / 2, y: bodyD, minX: sp.bounds.minX, maxX: sp.bounds.maxX, maxW: sp.bounds.maxX - sp.bounds.minX, maxD: sp.bounds.maxY - bodyD, bodyId: body.id, size: bodyMod.bedBoxSize(body.params), bodyParams: body.params };
}
function bedT(e, axis) {
  const f = bedFrame();
  const dir = axis === "x" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  return closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(f.cx, f.y, 0), dir); // t = signed distance from (cx, bodyD)
}
function bedBoxBox() {
  const f = bedFrame();
  return { x0: f.cx - bed.W / 2, y0: f.y, z0: 0, W: bed.W, D: bed.D, H: bed.H, max: { W: bed.W, D: f.maxD, H: bed.H } };
}

export function startBedBox(moduleId) {
  const mod = getModule(moduleId);
  const f = bedFrame();
  const pair = mod.placement === "bedSide";
  if (!f) { log(pair ? "bedside.blocked" : "bedbox.blocked", { moduleId, reason: "no body" }); return; }
  cancelMove();
  cancelAlign();
  cancelPointAlign();
  cancelOrient();
  cancelNose();
  cancelBedBox();
  cancelPlane();
  endRetype(false);
  if (placing) { placing = null; rb = null; lastCreated = null; clearPreview(); }
  const existing = (mod.single || pair) ? job.getJob().cabinets.find((c) => c.moduleId === moduleId) : null;
  const env = existing ? mod.envelope(existing.params) : null;
  const table = pair ? mod.sizeFor(f.bodyParams) : null;
  bed = {
    moduleId, step: pair ? "height" : "depth", pair, editId: existing ? existing.id : null,
    W: table ? table.W : f.size.W, D: env ? env.D : mod.defaultSize.D, H: table ? table.H : f.size.H,
    snapH: table ? table.snapH : null,
    locked: { D: null, H: null }, snapLabel: null, clamped: null, lastClient: null,
  };
  if (env && pair) bed.H = env.H;
  job.select(existing ? existing.id : null);
  canvas.style.cursor = "crosshair";
  setDimNames(["W", "D", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) {
    dimLabels[k].classList.remove("focused", "locked");
    dimLabels[k].classList.toggle("hidden", pair ? k !== "H" : k !== "D");
  }
  drawBedBox(null);
  log(bed.pair ? "bedside.arm" : "bedbox.arm", { moduleId, editId: bed.editId, bodyId: f.bodyId, bodyDepth: f.y, W: bed.W, D: bed.D, H: bed.H, snapH: bed.snapH, pair: bed.pair || undefined, from: bed.pair ? "height first, snaps to the fixed panel bottom, then depth" : "body: bed frame width, bootHeight" });
  emitMode();
}

/** Depth for the cursor (or the lock): snapped, clamped to the space, stopped by other cabinets in the bed's lane. */
function bedDepth(e) {
  const mod = getModule(bed.moduleId);
  const f = bedFrame();
  let D;
  let label = null;
  let clamped = null;
  if (bed.locked.D != null) D = bed.locked.D;
  else if (e) {
    const snap = nearestAxisAlign(e.clientX, e.clientY, { x: f.cx, y: f.y, z: 0 }, "y", +1, { exclude: bed.editId });
    if (snap) { D = snap.value - f.y; label = snap.label; } else D = job.snap(bedT(e, "y"));
  } else D = bed.D;
  if (D > f.maxD) { D = f.maxD; clamped = "back wall"; }
  if (D < mod.minSize.D) { D = mod.minSize.D; clamped = `minimum ${mod.minSize.D}`; }
  const lanes = bed.pair
    ? [[f.minX, f.minX + bed.W], [f.maxX - bed.W, f.maxX]]
    : [[f.cx - bed.W / 2, f.cx + bed.W / 2]];
  for (const c of job.getJob().cabinets) {
    if (c.id === bed.editId || c.id === f.bodyId || c.moduleId === bed.moduleId) continue;
    const fp = envelopeFootprint(c, c.pose);
    if (fp.z0 >= bed.H - 0.5) continue;
    if (!lanes.some(([x0, x1]) => fp.maxX > x0 + 0.5 && fp.minX < x1 - 0.5)) continue;
    const room = fp.minY - f.y;
    if (room >= mod.minSize.D && room < D - 0.5) { D = Math.floor(room / 10) * 10; clamped = c.id; label = null; }
  }
  bed.D = D;
  bed.snapLabel = label;
  bed.clamped = clamped;
}

/** Height of the pair, from the floor. Snaps onto the underside of the wardrobe fixed panel. */
function bedHeight(e) {
  const mod = getModule(bed.moduleId);
  const f = bedFrame();
  let H;
  let label = null;
  let clamped = null;
  if (bed.locked.H != null) H = bed.locked.H;
  else if (e) {
    const t = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(f.minX + bed.W / 2, f.y, 0), new THREE.Vector3(0, 0, 1));
    H = job.snap(Math.max(0, t));
  } else H = bed.H;
  const roof = f.bodyParams.height;
  if (H > roof) { H = roof; clamped = "roof"; }
  if (H < mod.minSize.H) { H = mod.minSize.H; clamped = `minimum ${mod.minSize.H}`; }
  if (bed.locked.H == null && bed.snapH != null) {
    const pt = toClient(f.minX + bed.W / 2, f.y, bed.snapH);
    const near = e && !pt.behind && Math.hypot(e.clientX - pt.x, e.clientY - pt.y) <= SNAP_RADIUS_PX * uiScale();
    if (near || Math.abs(H - bed.snapH) <= 15) { H = bed.snapH; label = "fixed panel bottom"; clamped = null; }
  }
  bed.H = H;
  bed.snapLabel = label;
  bed.clamped = clamped;
}

function drawBedBox(e) {
  const f = bedFrame();
  const b = bed.pair
    ? { x0: f.minX, y0: f.y, z0: 0, W: bed.W, D: bed.D, H: bed.H }
    : bedBoxBox();
  const also = bed.pair ? { x0: f.maxX - bed.W, y0: f.y, z0: 0, W: bed.W, D: bed.D, H: bed.H } : null;
  showGhost(b.x0, b.y0, b.z0, b.W, b.D, b.H, { clamped: !!bed.clamped, also });
  const field = bed.pair && bed.step === "height" ? "H" : "D";
  if (document.activeElement !== dimInputs[field]) dimInputs[field].value = Math.round(bed[field]);
  dimLabels[field].classList.toggle("locked", bed.locked[field] != null);
  positionDimInputs(b);
  if (!e) return;
  const lines = [
    bed.pair && bed.step === "height"
      ? `H ${Math.round(bed.H)} · two tables · snaps at the fixed panel bottom ${Math.round(bed.snapH)}`
      : bed.pair
        ? `D ${Math.round(bed.D)} from the body · two tables · H ${Math.round(bed.H)}`
        : `D ${Math.round(bed.D)} from the body · W ${Math.round(bed.W)} (bed frame) × H ${Math.round(bed.H)} (boot)`,
    bed.snapLabel,
    bed.clamped ? `Stopped at ${bed.clamped}` : null,
    bed.pair && bed.step === "height"
      ? "Click or Enter for the depth"
      : bed.editId ? "Click or Enter to apply · Esc cancels" : "Click or Enter to create · Esc cancels",
  ];
  showTip(e.clientX, e.clientY, lines, bed.clamped ? "warn" : bed.locked[field] != null ? "lock" : "");
}

function updateBedBox(e) {
  if (e) bed.lastClient = { x: e.clientX, y: e.clientY };
  if (bed.pair && bed.step === "height") bedHeight(e);
  else bedDepth(e);
  drawBedBox(e);
}

function finishBedBox(how) {
  if (!bed) return;
  if (bed.pair && bed.step === "height") {
    bedHeight(null);
    bed.step = "depth";
    bed.snapLabel = null;
    bed.clamped = null;
    for (const k of DIM_ORDER) dimLabels[k].classList.toggle("hidden", k !== "D");
    log("bedside.height", { H: bed.H, snap: bed.H === bed.snapH ? "fixed panel bottom" : null, how });
    drawBedBox(null);
    emitMode();
    return;
  }
  const b = bed;
  const mod = getModule(b.moduleId);
  bedDepth(null);
  const f = bedFrame();
  bed = null;
  let id = b.editId;
  let changed = true;
  if (b.pair) {
    const poseFor = (side) => side === "left"
      ? { x: f.minX + b.W, y: f.y + b.D, z: 0, rotZ: 180 }
      : { x: f.maxX, y: f.y + b.D, z: 0, rotZ: 180 };
    const existing = job.getJob().cabinets.filter((c) => c.moduleId === b.moduleId);
    if (existing.length) {
      const before = job.snapshot();
      for (const c of existing) job.updateCabinet(c.id, (cab) => { cab.params = mod.setEnvelope(cab.params, { W: b.W, D: b.D, H: b.H }); cab.pose = poseFor(cab.params.side); });
      changed = job.commitSnapshot(before);
      id = existing[0].id;
    } else {
      const left = job.addCabinet(b.moduleId, poseFor("left"), { W: b.W, D: b.D, H: b.H }, { params: { side: "left" } });
      const right = job.addCabinet(b.moduleId, poseFor("right"), { W: b.W, D: b.D, H: b.H }, {
        history: false,
        params: { side: "right", zones: [{ id: "lower", type: "left_door" }, { id: "upper", type: "drawer" }] },
      });
      id = left.id;
    }
  } else {
    const pose = { x: f.cx + b.W / 2, y: f.y + b.D, z: 0, rotZ: 180 };
    if (id) {
      const before = job.snapshot();
      job.updateCabinet(id, (c) => { c.params = mod.setEnvelope(c.params, { W: b.W, D: b.D, H: b.H }); c.pose = pose; });
      changed = job.commitSnapshot(before);
    } else {
      id = job.addCabinet(b.moduleId, pose, { W: b.W, D: b.D, H: b.H }).id;
    }
  }
  const cab = job.getJob().cabinets.find((c) => c.id === id);
  const pose = cab ? cab.pose : null;
  log(b.pair ? "bedside.finish" : "bedbox.finish", { moduleId: b.moduleId, id, how, bodyId: f.bodyId, W: b.W, D: b.D, H: b.H, locked: b.locked, snap: b.snapLabel, clamped: b.clamped, edited: !!b.editId, changed, pair: b.pair || undefined, pose, envelope: cab ? mod.envelope(cab.params) : null });
  clearPreview();
  canvas.style.cursor = "";
  job.select(id);
  emitMode();
}

export function cancelBedBox() {
  if (!bed) return;
  const b = bed;
  bed = null;
  log(b.pair ? "bedside.cancel" : "bedbox.cancel", { moduleId: b.moduleId, editId: b.editId, step: b.step, W: b.W, D: b.D });
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}

// --- move command -----------------------------------------------------------------

const moveCard = document.getElementById("moveCard");
const MOVE_KEYS = ["x", "y", "z", "rotX", "rotY", "rotZ"];

function moveRound(v) {
  return Math.round((v || 0) * 10) / 10;
}
function cloneOverrides(overrides) {
  return overrides ? JSON.parse(JSON.stringify(overrides)) : undefined;
}
function moveCab() {
  return move && job.getJob().cabinets.find((c) => c.id === move.id);
}
function envelopeCenter(cab) {
  const env = envelopeBox(cab, job.resultFor(cab.id));
  return [(env.x0 + env.x1) / 2, (env.y0 + env.y1) / 2, (env.z0 + env.z1) / 2];
}
/** A module whose pose is rewritten from the bedroom body cannot be moved as a whole. */
function modulePoseLocked(cab) {
  return !!getModule(cab.moduleId).attach;
}
function worldAxis(axis) {
  return axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
}

function writeBoardOverride(cab, boardId, override) {
  const clean = {};
  for (const k of MOVE_KEYS) {
    const v = moveRound(override[k]);
    if (Math.abs(v) >= 0.05) clean[k] = v;
  }
  const boards = { ...(cab.overrides?.boards || {}) };
  if (Object.keys(clean).length) boards[boardId] = clean;
  else delete boards[boardId];
  const rest = { ...(cab.overrides || {}) };
  delete rest.boards;
  if (Object.keys(boards).length) cab.overrides = { ...rest, boards };
  else cab.overrides = Object.keys(rest).length ? rest : undefined;
}

/** Put the cabinet back to where this Move started. Switching target does this too. */
function restoreMove() {
  const cab = moveCab();
  if (!cab) return;
  const pose = { ...move.pose0 };
  const overrides = cloneOverrides(move.overrides0);
  const norm = poseOf(pose);
  const samePose = MOVE_KEYS.every((k) => (cab.pose[k] || 0) === (norm[k] || 0));
  const sameOv = JSON.stringify(cab.overrides || null) === JSON.stringify(overrides || null);
  if (samePose && sameOv) return;
  move.applying = true;
  job.updateCabinet(move.id, (c) => {
    c.pose = pose;
    if (overrides) c.overrides = overrides;
    else delete c.overrides;
  });
  move.applying = false;
}

/** World centre of whatever the triad is driving, or null until a board is chosen. */
function moveTargetPoint(cab) {
  if (!cab) return null;
  if (move.target === "panel") {
    if (!move.boardId) return null;
    const b = (job.resultFor(cab.id)?.boards || []).find((x) => x.id === move.boardId);
    if (!b) return null;
    const o = boardOverride(cab.overrides?.boards?.[b.id]);
    return worldOf(cab.pose, [(b.x0 + b.x1) / 2 + o.x, (b.y0 + b.y1) / 2 + o.y, (b.z0 + b.z1) / 2 + o.z]);
  }
  return worldOf(cab.pose, envelopeCenter(cab));
}

function refreshMoveUi() {
  if (!move) return;
  const cab = moveCab();
  for (const input of moveCard.querySelectorAll('input[name="moveKind"]')) input.checked = input.value === (move.kind || "free");
  for (const input of moveCard.querySelectorAll('input[name="moveTarget"]')) input.checked = input.value === move.target;
  const note = moveCard.querySelector("[data-move-note]");
  const boards = cab ? (job.resultFor(cab.id)?.boards || []) : [];
  if (move.kind === "face") {
    if (move.target === "panel" && !align?.source) note.textContent = "Click the board face that should move, then the face it lines up with.";
    else if (!align?.source) note.textContent = "Click the face that should move, then the face it lines up with.";
    else if (move.target === "panel") note.textContent = `${align.source.boardId} ${align.source.faceId} moves. Click the face to align it to.`;
    else note.textContent = `${align.source.boardId} ${align.source.faceId} moves the cabinet. Click the face to align it to.`;
    hideMoveTriad();
    canvas.style.cursor = "crosshair";
    return;
  }
  if (move.kind === "point") {
    if (!pointAlign?.source) note.textContent = move.target === "panel"
      ? "Click a corner of the board that should move, then the point it lands on."
      : "Click a corner of the cabinet that should move, then the point it lands on.";
    else note.textContent = move.target === "panel"
      ? `${pointAlign.source.boardId} moves. Click the point it should land on.`
      : "The cabinet moves. Click the point that corner should land on.";
    hideMoveTriad();
    canvas.style.cursor = "crosshair";
    return;
  }
  hideFaceHint();
  if (move.target === "module" && cab && modulePoseLocked(cab)) note.textContent = "This module follows the Bedroom body. Choose Panel to move one board.";
  else if (move.target === "panel" && !boards.length) note.textContent = "This module has no boards to move.";
  else if (move.target === "panel" && !move.boardId) note.textContent = "Click a board of this cabinet.";
  else if (move.target === "panel") note.textContent = `${move.boardId} · drag an arrow or a ring · Enter confirms · Esc cancels`;
  else note.textContent = "Drag an arrow or a ring · Enter confirms · Ctrl+Enter copies · Esc cancels";
  placeMoveTriad(moveTargetPoint(cab));
  canvas.style.cursor = "";
}

function endMoveChrome() {
  hideMoveTriad();
  setMoveHover(null);
  setMoveOpen(false);
  moveCard.classList.add("hidden");
  hideFaceHint();
  hideSnapMarker();
  hideInference();
  canvas.style.cursor = "";
}

export function startMove(id = job.getSelectedId()) {
  const cab = id && job.getJob().cabinets.find((c) => c.id === id);
  if (!cab) return;
  if (move) {
    if (move.id === id) { cancelMove(); return; }
    cancelMove();
  }
  if (placing) disarm();
  cancelOrient();
  cancelNose();
  cancelBedBox();
  cancelPlane();
  endRetype(false);
  const sub = job.getSubSelection();
  const boardId = sub && sub.cabId === id ? sub.boardId : null;
  move = {
    id, target: boardId ? "panel" : "module", kind: "free", boardId: boardId || null,
    pose0: { ...cab.pose }, overrides0: cloneOverrides(cab.overrides),
    before: job.snapshot(), applying: true, drag: null, clamped: [],
  };
  if (boardId) job.select(id, { boardId, faceId: sub.faceId || null });
  else job.select(id);
  move.applying = false;
  setMoveOpen(true);
  moveCard.classList.remove("hidden");
  log("move.start", { id, kind: "free", target: move.target, boardId: move.boardId, pose: move.pose0 });
  refreshMoveUi();
  emitMode();
}

/** The card's Module / Panel choice. Switching throws away the drag that has not been confirmed. */
function setMoveTarget(target) {
  if (!move || move.drag) { refreshMoveUi(); return; }
  if (move.target === target) return;
  restoreMove();
  move.target = target;
  move.boardId = null;
  move.applying = true;
  job.select(move.id);
  move.applying = false;
  if (align) { align.mode = target; align.source = null; hideFaceHint(); }
  if (pointAlign) { pointAlign.mode = target; pointAlign.source = null; hideSnapMarker(); hideInference(); }
  log("move.target", { id: move.id, kind: move.kind, target, boardId: null });
  refreshMoveUi();
  emitMode();
}

/** Free / Face / Point — different ways to choose what moves. One Move command either way. */
function setMoveKind(kind) {
  if (!move || move.drag) { refreshMoveUi(); return; }
  if ((move.kind || "free") === kind) return;
  restoreMove();
  move.kind = kind;
  align = null;
  pointAlign = null;
  hideFaceHint();
  hideSnapMarker();
  hideInference();
  if (kind === "face") align = { mode: move.target, source: null, before: move.before, applying: false };
  if (kind === "point") pointAlign = { mode: move.target, source: null, before: move.before };
  log("move.kind", { id: move.id, kind, target: move.target });
  refreshMoveUi();
  emitMode();
}

/**
 * The browser and the 3D view share one selection. In Panel mode a board click
 * (after a Module → Panel switch, a fresh click) becomes the thing the triad drives.
 */
function syncMoveSelection() {
  if (!move || move.applying || move.drag || align?.applying) return;
  const cab = job.getSelected();
  if (!cab) return;
  if (move.kind === "face" || move.kind === "point") {
    if (cab.id === move.id) return;
    restoreMove();
    move.id = cab.id;
    move.pose0 = { ...cab.pose };
    move.overrides0 = cloneOverrides(cab.overrides);
    if (align) align.source = null;
    if (pointAlign) pointAlign.source = null;
    refreshMoveUi();
    return;
  }
  if (cab.id !== move.id) {
    restoreMove();
    move.id = cab.id;
    move.pose0 = { ...cab.pose };
    move.overrides0 = cloneOverrides(cab.overrides);
    move.boardId = null;
  }
  if (move.target !== "panel") { refreshMoveUi(); return; }
  const boardId = job.getSubSelection()?.boardId || null;
  if (boardId === move.boardId) { refreshMoveUi(); return; }
  restoreMove();
  move.boardId = boardId;
  log("move.target", { id: move.id, target: "panel", boardId });
  refreshMoveUi();
}

function planeVector(e, center, axis) {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, center);
  const hit = planePointAt(e.clientX, e.clientY, plane);
  if (!hit) return null;
  const v = hit.sub(center);
  v.addScaledVector(axis, -v.dot(axis));
  if (v.lengthSq() < 1) return null;
  return v.normalize();
}

function beginMoveDrag(e, ud) {
  const cab = moveCab();
  if (!cab) return;
  if (move.target === "panel" && !move.boardId) return;
  if (move.target === "module" && modulePoseLocked(cab)) return;
  const point = moveTargetPoint(cab);
  if (!point) return;
  const center = new THREE.Vector3(point[0], point[1], point[2]);
  const axis = worldAxis(ud.axis);
  move.drag = {
    op: ud.op, axis: ud.axis, center,
    basePose: poseOf(cab.pose),
    baseOverride: boardOverride(cab.overrides?.boards?.[move.boardId]),
    t0: ud.op === "translate" ? closestTOnLine(e.clientX, e.clientY, center, axis) : 0,
    v0: ud.op === "rotate" ? planeVector(e, center.clone(), axis) : null,
  };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
}

function applyMoveDrag(e) {
  const d = move.drag;
  const cab = moveCab();
  if (!cab || !d) return;
  if (d.op === "translate") {
    const delta = job.snap(closestTOnLine(e.clientX, e.clientY, d.center, worldAxis(d.axis)) - d.t0);
    if (move.target === "module") {
      const { pose, clamped } = clampPoseToSpace(cab, translatePose(d.basePose, d.axis, delta));
      move.clamped = clamped;
      job.updateCabinet(move.id, (c) => { c.pose = pose; });
    } else {
      move.clamped = [];
      const o = translateBoardOverride(d.basePose, d.baseOverride, d.axis, delta);
      job.updateCabinet(move.id, (c) => { writeBoardOverride(c, move.boardId, o); });
    }
  } else {
    const v1 = planeVector(e, d.center.clone(), worldAxis(d.axis));
    if (d.v0 && v1) {
      const cross = new THREE.Vector3().crossVectors(d.v0, v1);
      const angle = Math.round(Math.atan2(cross.dot(worldAxis(d.axis)), d.v0.dot(v1)) * 180 / Math.PI);
      if (move.target === "module") {
        const raw = rotatePoseAbout(d.basePose, d.axis, angle, envelopeCenter(cab));
        for (const k of MOVE_KEYS) raw[k] = moveRound(raw[k]);
        const { pose, clamped } = clampPoseToSpace(cab, raw);
        move.clamped = clamped;
        job.updateCabinet(move.id, (c) => { c.pose = pose; });
      } else {
        move.clamped = [];
        const o = rotateBoardOverride(d.basePose, d.baseOverride, d.axis, angle);
        job.updateCabinet(move.id, (c) => { writeBoardOverride(c, move.boardId, o); });
      }
    }
  }
  refreshMoveUi();
  const lines = moveTip(cab, e);
  const warn = (move.clamped || []).length || lines.some((line) => line.startsWith("Overlaps"));
  showTip(e.clientX, e.clientY, lines, warn ? "warn" : "");
}

function moveTip(cab, e) {
  const lines = [];
  if (move.target === "module") {
    const p0 = poseOf(move.pose0);
    const p = poseOf(cab.pose);
    lines.push(`ΔX ${Math.round(p.x - p0.x)}  ΔY ${Math.round(p.y - p0.y)}  ΔZ ${Math.round(p.z - p0.z)}`);
    lines.push(`rot ${Math.round(p.rotX)}  ${Math.round(p.rotY)}  ${Math.round(p.rotZ)}`);
    for (const c of move.clamped || []) lines.push(`Stopped at ${c}`);
    const ov = overlaps(cab, cab.pose);
    if (ov.length) lines.push(`Overlaps ${ov.join(", ")}`);
    if (e.ctrlKey) lines.push("Ctrl+Enter: copy");
  } else if (move.boardId) {
    const was = boardOverride(move.overrides0?.boards?.[move.boardId]);
    const o = boardOverride(cab.overrides?.boards?.[move.boardId]);
    lines.push(`${move.boardId}  Δ ${Math.round(o.x - was.x)}  ${Math.round(o.y - was.y)}  ${Math.round(o.z - was.z)}`);
    lines.push(`rot ${Math.round(o.rotX)}  ${Math.round(o.rotY)}  ${Math.round(o.rotZ)}`);
  }
  return lines;
}

function endMoveDrag(e) {
  if (!move || !move.drag) return;
  move.drag = null;
  if (e) try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
  canvas.style.cursor = "";
  hideTip();
}

/** Shift a pose back inside the space bounds; names the boundaries that stopped it. */
function clampPoseToSpace(cab, pose0) {
  const pose = { ...pose0 };
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
    // A roof-aware body (the bedroom) is already cut to the roof by its generator.
    // Its envelope is as tall as the highest point, so clamping that box under the
    // lowest roof over the footprint shoves the whole body through the floor.
    if (!getModule(cab.moduleId).roofAware) {
      const fp2 = envelopeFootprint(cab, pose);
      const roof = minClearHeight(sp, fp2.minY, fp2.maxY);
      if (fp2.z1 > roof) { pose.z -= fp2.z1 - roof; clamped.push(roofName(sp, fp2.minY, fp2.maxY)); }
    }
  }
  return { pose, clamped };
}

/** Ids of the cabinets and partition walls a cabinet at `pose` would overlap. */
export function overlaps(cab, pose) {
  const a = envelopeFootprint(cab, pose);
  return solidBoxes().filter((b) => {
    if (b.id === cab.id) return false;
    return a.minX < b.x[1] - 0.5 && a.maxX > b.x[0] + 0.5 && a.minY < b.y[1] - 0.5 && a.maxY > b.y[0] + 0.5 && a.z0 < b.z[1] - 0.5 && a.z1 > b.z[0] + 0.5;
  }).map((b) => b.id);
}
/** Only the partition walls a cabinet at `pose` would overlap (walls come first; a cabinet never enters one). */
function wallHits(cab, pose) {
  const walls = new Set(job.getWalls().map((w) => w.id));
  return overlaps(cab, pose).filter((id) => walls.has(id));
}

function finishMove(copy) {
  if (!move) return;
  endMoveDrag();
  const m = move;
  const cab = moveCab();
  const mod = cab && getModule(cab.moduleId);
  const locked = !!(mod && mod.attach);
  align = null;
  pointAlign = null;
  move = null;
  if (copy && cab && m.target === "module" && !locked) {
    const pose = poseOf(cab.pose);
    const overrides = cloneOverrides(cab.overrides);
    const params = JSON.parse(JSON.stringify(cab.params));
    job.updateCabinet(m.id, (c) => {
      c.pose = { ...m.pose0 };
      if (m.overrides0) c.overrides = cloneOverrides(m.overrides0);
      else delete c.overrides;
    });
    const twin = job.addCabinet(cab.moduleId, pose, mod.envelope(params));
    job.updateCabinet(twin.id, (c) => {
      c.params = params;
      c.pose = pose;
      if (overrides) c.overrides = overrides;
    });
    log("move.copy", { from: m.id, to: twin.id, pose, target: "module" });
  } else {
    const changed = job.commitSnapshot(m.before);
    log("move.finish", {
      id: m.id, kind: m.kind || "free", how: "enter", target: m.target, boardId: m.boardId || null,
      from: m.pose0, to: cab ? poseOf(cab.pose) : null,
      override: m.target === "panel" && m.boardId ? boardOverride(cab?.overrides?.boards?.[m.boardId]) : null,
      clamped: m.clamped || [], changed,
    });
  }
  endMoveChrome();
  clearPreview();
  emitMode();
}

export function cancelMove() {
  if (!move) return;
  const m = move;
  endMoveDrag();
  restoreMove();
  align = null;
  pointAlign = null;
  move = null;
  log("move.cancel", { id: m.id, kind: m.kind || "free", target: m.target, boardId: m.boardId || null });
  endMoveChrome();
  hideFaceHint();
  hideSnapMarker();
  hideInference();
  clearPreview();
  emitMode();
}

moveCard.addEventListener("change", (e) => {
  if (e.target.name === "moveKind") setMoveKind(e.target.value);
  else if (e.target.name === "moveTarget") setMoveTarget(e.target.value);
});
moveCard.addEventListener("keydown", (e) => {
  if (!move) return;
  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finishMove(e.ctrlKey); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelMove(); }
});
for (const type of ["pointerdown", "pointerup", "wheel", "contextmenu", "dblclick"]) {
  moveCard.addEventListener(type, (e) => e.stopPropagation());
}
job.onChange((kind) => {
  if (!move || move.applying) return;
  if (kind === "selection") syncMoveSelection();
  else if (kind === "job" && !move.drag && !moveCab()) cancelMove();
});

// --- face align -------------------------------------------------------------------
//
// Inventor flush (对齐): the first face moves onto the second face's plane.
// Normals must already point the same way. Module slides the whole cabinet;
// Panel slides only that board. The second face stays where it is.
// This is a page of Move (M), not its own command.

function alignCab(id) {
  return job.getJob().cabinets.find((c) => c.id === id) || null;
}

function boardWorldPlane(cab, boardId, faceId) {
  const board = (job.resultFor(cab.id)?.boards || []).find((b) => b.id === boardId);
  const face = board?.faces?.find((f) => f.id === faceId);
  const local = board && face ? boardFaceLocal(board, face, cab.overrides?.boards?.[boardId]) : null;
  const plane = worldPlane(cab.pose, local);
  if (!plane) return null;
  return { ...plane, cabId: cab.id, boardId, faceId, label: `${board.name || boardId} · ${faceLabel(face)}` };
}

function fixedWorldPlane(hit) {
  if (!hit) return null;
  if (hit.kind === "board") {
    const cab = alignCab(hit.cabId);
    return cab ? boardWorldPlane(cab, hit.boardId, hit.faceId) : null;
  }
  const f = hit.face;
  const i = f.axis === "x" ? 0 : f.axis === "y" ? 1 : 2;
  const normal = [0, 0, 0];
  normal[i] = f.dir > 0 ? 1 : -1;
  const point = [hit.point.x, hit.point.y, hit.point.z];
  point[i] = f.value;
  return { point, normal, label: f.label, source: f.source };
}

function alignHit(e) {
  const hit = pick(e.clientX, e.clientY);
  const ud = hit?.object?.userData;
  if (ud?.kind === "board" && ud.boardId) {
    const face = faceUnderHit(hit);
    if (face?.faceId) return { kind: "board", cabId: face.cabId, boardId: face.boardId, faceId: face.faceId };
  }
  const pf = pickFace(e.clientX, e.clientY);
  if (pf) return { kind: "plane", face: pf.face, point: pf.point };
  return null;
}

function axisHint(plane, around) {
  if (!plane) return null;
  let ax = -1;
  for (let i = 0; i < 3; i += 1) if (Math.abs(plane.normal[i]) > 0.99) ax = i;
  if (ax < 0) return null;
  const name = ["x", "y", "z"][ax];
  const p = around || plane.point;
  const ext = { x: [p[0] - 160, p[0] + 160], y: [p[1] - 160, p[1] + 160], z: [p[2] - 160, p[2] + 160] };
  ext[name] = [p[ax], p[ax]];
  return { axis: name, value: p[ax], dir: plane.normal[ax] > 0 ? 1 : -1, ext };
}

function sourcePlane() {
  if (!align?.source) return null;
  const cab = alignCab(align.source.cabId);
  return cab ? boardWorldPlane(cab, align.source.boardId, align.source.faceId) : null;
}

function refreshAlignUi() {
  if (!align) return;
  align.mode = move?.target || align.mode;
  refreshMoveUi();
  const hint = axisHint(sourcePlane());
  if (hint) showFaceHint(hint, { tone: align.source ? "pending" : "" });
  else if (!align.source) hideFaceHint();
}

/** Face and point alignment are pages of Move, not separate commands. */
export function startAlign() {
  if (!move) startMove();
  if (move) setMoveKind("face");
}

function setAlignMode(mode) {
  if (!align || align.mode === mode) return;
  align.mode = mode;
  align.source = null;
  const id = job.getSelectedId();
  if (id && alignCab(id)) {
    align.applying = true;
    job.select(id);
    align.applying = false;
  }
  log("align.mode", { mode });
  refreshAlignUi();
  emitMode();
}

function endAlignChrome() {
  hideFaceHint();
  hideTip();
}

export function cancelAlign() {
  if (!align) return;
  const a = align;
  align = null;
  log("align.cancel", { mode: a.mode, source: a.source });
  endAlignChrome();
  emitMode();
}

function finishAlign(hit, e) {
  const srcRef = align.source;
  const cab = alignCab(srcRef.cabId);
  const source = cab && boardWorldPlane(cab, srcRef.boardId, srcRef.faceId);
  const target = fixedWorldPlane(hit);
  const tipAt = e ? { x: e.clientX, y: e.clientY } : null;
  const refuse = (reason) => {
    log("align.blocked", { reason, mode: align.mode, source: srcRef, fixed: target?.label || null });
    if (tipAt) showTip(tipAt.x, tipAt.y, [reason], "warn");
  };
  if (!cab || !source || !target) { refuse("that face has no plane"); return; }
  if (align.mode === "module" && target.cabId === cab.id) { refuse("pick a face on something else"); return; }
  if (align.mode === "panel" && target.cabId === cab.id && target.boardId === srcRef.boardId) { refuse("pick a face on a different board"); return; }
  if (align.mode === "module" && modulePoseLocked(cab)) { refuse("this module follows the Bedroom body — use Panel"); return; }
  const fit = alignTranslation(source, target);
  if (!fit.ok) { refuse(fit.reason); return; }
  const mode = align.mode;
  let clamped = [];
  if (mode === "module") {
    const raw = translatePoseBy(cab.pose, fit.delta);
    for (const k of ["x", "y", "z"]) raw[k] = moveRound(raw[k]);
    const stopped = clampPoseToSpace(cab, raw);
    clamped = stopped.clamped;
    job.updateCabinet(cab.id, (c) => { c.pose = stopped.pose; });
  } else {
    const o = translateBoardOverrideBy(cab.pose, cab.overrides?.boards?.[srcRef.boardId], fit.delta);
    job.updateCabinet(cab.id, (c) => { writeBoardOverride(c, srcRef.boardId, o); });
  }
  log("align.finish", {
    mode, source: srcRef, fixed: target.label, gap: Math.round(fit.gap * 10) / 10,
    delta: fit.delta.map((v) => Math.round(v * 10) / 10), clamped,
  });
  align.source = null;
  const hint = axisHint(target);
  hideTip();
  if (hint) flashFaceHint(hint);
  else hideFaceHint();
  refreshMoveUi();
  emitMode();
}

function alignClick(e) {
  const hit = alignHit(e);
  if (!align.source) {
    if (!hit || hit.kind !== "board") {
      showTip(e.clientX, e.clientY, [align.mode === "panel" ? "Click a board face" : "Click a face on the cabinet that should move"], "warn");
      return;
    }
    align.source = { cabId: hit.cabId, boardId: hit.boardId, faceId: hit.faceId };
    align.mode = move.target;
    if (hit.cabId !== move.id) {
      restoreMove();
      const next = alignCab(hit.cabId);
      if (next) {
        move.id = next.id;
        move.pose0 = { ...next.pose };
        move.overrides0 = cloneOverrides(next.overrides);
      }
    }
    align.applying = true;
    job.select(hit.cabId, { boardId: hit.boardId, faceId: hit.faceId });
    align.applying = false;
    log("align.pick", { which: "moving", mode: align.mode, ...align.source });
    refreshAlignUi();
    emitMode();
    return;
  }
  if (!hit) return;
  if (hit.kind === "board" && hit.cabId === align.source.cabId && hit.boardId === align.source.boardId && hit.faceId === align.source.faceId) return;
  finishAlign(hit, e);
}

function alignHover(e) {
  const hit = alignHit(e);
  const plane = hit?.kind === "board"
    ? boardWorldPlane(alignCab(hit.cabId), hit.boardId, hit.faceId)
    : fixedWorldPlane(hit);
  const lines = [align.source
    ? (align.mode === "panel" ? "Click the face to align this board to" : "Click the face to align this cabinet to")
    : (align.mode === "panel" ? "Click the board face that should move" : "Click the face that should move")];
  if (plane?.label) lines.push(plane.label);
  if (align.source && plane) {
    const fit = alignTranslation(sourcePlane(), plane);
    if (fit.ok) lines.push(`move ${Math.round(fit.gap)} mm`);
    else if (fit.reason) lines.push(fit.reason);
  }
  showTip(e.clientX, e.clientY, lines, align.source && plane && !alignTranslation(sourcePlane(), plane).ok ? "warn" : "");
  const hint = axisHint(plane) || axisHint(sourcePlane());
  if (hint) showFaceHint(hint, { tone: !plane && align.source ? "pending" : "" });
  else refreshAlignUi();
}

// --- point align ------------------------------------------------------------------
//
// Fusion point-to-point: translate, never rotate, so the first point lands on
// the second. Module slides the whole cabinet; Panel slides only that board.
// Two points on the same rigid piece cannot be brought together this way.
// A page of Move (M).

function pointOnMovingBody(pt) {
  if (!pointAlign?.source || !pt?.cabId) return false;
  if (pointAlign.mode === "panel") return pt.cabId === pointAlign.source.cabId && pt.boardId === pointAlign.source.boardId;
  return pt.cabId === pointAlign.source.cabId;
}

function nearestOwnedPoint(clientX, clientY) {
  const max = SNAP_RADIUS_PX * uiScale();
  let best = null;
  let bestD = max;
  for (const cab of job.getJob().cabinets) {
    for (const b of job.resultFor(cab.id)?.boards || []) {
      const locals = boardCornerLocals(b, cab.overrides?.boards?.[b.id]);
      for (const local of locals) {
        const w = worldOf(cab.pose, local);
        const c = toClient(w[0], w[1], w[2]);
        if (c.behind) continue;
        const d = Math.hypot(c.x - clientX, c.y - clientY);
        if (d < bestD) {
          bestD = d;
          best = { x: w[0], y: w[1], z: w[2], cabId: cab.id, boardId: b.id, label: `${b.name || b.id} corner`, kind: "board" };
        }
      }
    }
  }
  return best ? { ...best, dist: bestD } : null;
}

/** The point under the cursor: a board corner, or (for the target) a space / cabinet snap point. */
function pointHit(clientX, clientY, { ownedOnly = false } = {}) {
  const owned = nearestOwnedPoint(clientX, clientY);
  if (ownedOnly) return owned;
  const snap = nearestSnap(clientX, clientY);
  let snapD = Infinity;
  if (snap) {
    const c = toClient(snap.x, snap.y, snap.z);
    if (!c.behind) snapD = Math.hypot(c.x - clientX, c.y - clientY);
  }
  if (owned && (!snap || owned.dist <= snapD)) return owned;
  if (snap && snapD <= SNAP_RADIUS_PX * uiScale()) {
    return { x: snap.x, y: snap.y, z: snap.z, label: describePoint(snap), kind: "snap", sources: snap.sources };
  }
  return null;
}

function refreshPointUi() {
  if (!pointAlign) return;
  pointAlign.mode = move?.target || pointAlign.mode;
  refreshMoveUi();
  if (pointAlign.source) showSnapMarker(pointAlign.source.x, pointAlign.source.y, pointAlign.source.z, { feature: true });
}

/** Point alignment is a page of Move. */
export function startPointAlign() {
  if (!move) startMove();
  if (move) setMoveKind("point");
}

function setPointMode(mode) {
  if (!pointAlign || pointAlign.mode === mode) return;
  pointAlign.mode = mode;
  pointAlign.source = null;
  hideSnapMarker();
  const id = job.getSelectedId();
  if (id && alignCab(id)) job.select(id);
  log("pointalign.mode", { mode });
  refreshPointUi();
  emitMode();
}

function endPointChrome() {
  hideSnapMarker();
  hideInference();
  hideTip();
}

export function cancelPointAlign() {
  if (!pointAlign) return;
  const p = pointAlign;
  pointAlign = null;
  log("pointalign.cancel", { mode: p.mode, source: p.source });
  endPointChrome();
  emitMode();
}

function finishPointAlign(target, e) {
  const src = pointAlign.source;
  if (pointOnMovingBody(target)) {
    const reason = pointAlign.mode === "panel" ? "that point is on the same board" : "that point is on the same cabinet";
    log("pointalign.blocked", { reason, mode: pointAlign.mode, source: src, fixed: target.label });
    showTip(e.clientX, e.clientY, [reason], "warn");
    return;
  }
  const cab = alignCab(src.cabId);
  if (!cab) return;
  if (pointAlign.mode === "module" && modulePoseLocked(cab)) {
    log("pointalign.blocked", { reason: "this module follows the Bedroom body — use Panel", mode: "module", source: src });
    showTip(e.clientX, e.clientY, ["This module follows the Bedroom body — use Panel"], "warn");
    return;
  }
  const delta = [target.x - src.x, target.y - src.y, target.z - src.z];
  const mode = pointAlign.mode;
  let clamped = [];
  if (mode === "module") {
    const raw = translatePoseBy(cab.pose, delta);
    for (const k of ["x", "y", "z"]) raw[k] = moveRound(raw[k]);
    const stopped = clampPoseToSpace(cab, raw);
    clamped = stopped.clamped;
    job.updateCabinet(cab.id, (c) => { c.pose = stopped.pose; });
  } else {
    const o = translateBoardOverrideBy(cab.pose, cab.overrides?.boards?.[src.boardId], delta);
    job.updateCabinet(cab.id, (c) => { writeBoardOverride(c, src.boardId, o); });
  }
  log("pointalign.finish", {
    mode, source: { cabId: src.cabId, boardId: src.boardId, x: src.x, y: src.y, z: src.z },
    fixed: { label: target.label, x: target.x, y: target.y, z: target.z },
    delta: delta.map((v) => Math.round(v * 10) / 10), clamped,
  });
  pointAlign.source = null;
  hideInference();
  hideTip();
  refreshMoveUi();
  emitMode();
}

function pointClick(e) {
  if (!pointAlign.source) {
    const hit = pointHit(e.clientX, e.clientY, { ownedOnly: true });
    if (!hit) {
      showTip(e.clientX, e.clientY, [pointAlign.mode === "panel" ? "Click a corner of a board" : "Click a corner of a cabinet"], "warn");
      return;
    }
    pointAlign.source = { cabId: hit.cabId, boardId: hit.boardId, x: hit.x, y: hit.y, z: hit.z, label: hit.label };
    pointAlign.mode = move.target;
    if (hit.cabId !== move.id) {
      restoreMove();
      const next = alignCab(hit.cabId);
      if (next) {
        move.id = next.id;
        move.pose0 = { ...next.pose };
        move.overrides0 = cloneOverrides(next.overrides);
      }
    }
    job.select(hit.cabId, { boardId: hit.boardId });
    log("pointalign.pick", { which: "moving", mode: pointAlign.mode, cabId: hit.cabId, boardId: hit.boardId, x: hit.x, y: hit.y, z: hit.z });
    refreshPointUi();
    emitMode();
    return;
  }
  const hit = pointHit(e.clientX, e.clientY);
  if (!hit) {
    showTip(e.clientX, e.clientY, ["Click the point to land on"], "warn");
    return;
  }
  finishPointAlign(hit, e);
}

function pointHover(e) {
  const hit = pointAlign.source ? pointHit(e.clientX, e.clientY) : pointHit(e.clientX, e.clientY, { ownedOnly: true });
  const src = pointAlign.source;
  if (src && hit && !pointOnMovingBody(hit)) {
    const dx = hit.x - src.x;
    const dy = hit.y - src.y;
    const dz = hit.z - src.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    showSnapMarker(src.x, src.y, src.z, { feature: true });
    showInference({ x: src.x, y: src.y, z: src.z }, { x: hit.x, y: hit.y, z: hit.z }, [dx / len, dy / len, dz / len]);
  } else {
    hideInference();
    if (hit) showSnapMarker(hit.x, hit.y, hit.z, { feature: true });
    else if (src) showSnapMarker(src.x, src.y, src.z, { feature: true });
    else hideSnapMarker();
  }
  const lines = [src
    ? (pointAlign.mode === "panel" ? "Click the point this board corner should land on" : "Click the point this corner should land on")
    : (pointAlign.mode === "panel" ? "Click a corner of the board that should move" : "Click a corner of the cabinet that should move")];
  if (hit) {
    lines.push(hit.label);
    if (src) {
      if (pointOnMovingBody(hit)) lines.push(pointAlign.mode === "panel" ? "On the same board" : "On the same cabinet");
      else lines.push(`Δ ${Math.round(hit.x - src.x)}  ${Math.round(hit.y - src.y)}  ${Math.round(hit.z - src.z)}`);
    }
  }
  showTip(e.clientX, e.clientY, lines, hit && pointOnMovingBody(hit) ? "warn" : "");
}

// --- orientation ---------------------------------------------------------------------
//
// A box (world AABB) plus a door side (which vertical side the fronts are on)
// fixes everything: W is the horizontal edge along the door side, D the edge
// through it (minus the fronts), H the height; rotZ turns the generator's −Y
// onto that side and the origin lands on the matching box corner. The box
// itself never moves — changing the door side swaps W/D, not the footprint.

const SIDES = [{ axis: "y", dir: -1 }, { axis: "y", dir: 1 }, { axis: "x", dir: 1 }, { axis: "x", dir: -1 }];

/** rotZ (deg) that turns the fronts (local −Y) toward the world direction `axis` ± `dir`. */
export function rotZFacing(axis, dir) {
  if (axis === "y") return dir > 0 ? 180 : 0;
  return dir > 0 ? 90 : 270;
}
/** Inverse: which world side the fronts of a cabinet with this rotZ are on. */
export function sideOfRotZ(rotZ) {
  const r = (((rotZ || 0) % 360) + 360) % 360;
  return r === 180 ? { axis: "y", dir: 1 } : r === 90 ? { axis: "x", dir: 1 } : r === 270 ? { axis: "x", dir: -1 } : { axis: "y", dir: -1 };
}
export function sideLabel(side) {
  return `${side.dir > 0 ? "+" : "−"}${side.axis.toUpperCase()}`;
}

/**
 * Pose and module size for a world box `{x0,y0,z0,W,D,H}` (W/D/H along X/Y/Z)
 * whose doors are on `side`. `fpt` = front panel thickness kept inside the box.
 * Returns { pose, W, D, H } in module terms.
 */
export function fitBoxFacing(b, side, fpt = FRONT_THICKNESS_DEFAULT) {
  const x1 = b.x0 + b.W;
  const y1 = b.y0 + b.D;
  const along = side.axis === "y" ? b.W : b.D; // door-side edge → W
  const through = side.axis === "y" ? b.D : b.W; // edge through the doors → D + fronts
  const rotZ = rotZFacing(side.axis, side.dir);
  let x;
  let y;
  if (rotZ === 0) { x = b.x0; y = b.y0 + fpt; }
  else if (rotZ === 180) { x = x1; y = y1 - fpt; }
  else if (rotZ === 90) { x = x1 - fpt; y = b.y0; }
  else { x = b.x0 + fpt; y = y1; }
  return { pose: { x, y, z: b.z0, rotZ }, W: along, D: through - fpt, H: b.H };
}

/** Is this side of the box flush against a wall or another cabinet (so doors could not open)? */
function sideBlocked(b, side, excludeId = null) {
  const lo = { x: b.x0, y: b.y0, z: b.z0 };
  const hi = { x: b.x0 + b.W, y: b.y0 + b.D, z: b.z0 + b.H };
  const at = side.dir > 0 ? hi[side.axis] : lo[side.axis];
  const sp = job.getSpace();
  if (sp) {
    const bound = side.axis === "x" ? (side.dir > 0 ? sp.bounds.maxX : sp.bounds.minX) : (side.dir > 0 ? sp.bounds.maxY : sp.bounds.minY);
    const wallIdx = side.axis === "y" ? (side.dir > 0 ? 2 : 0) : (side.dir > 0 ? 1 : 3);
    if (Math.abs(at - bound) < 0.5 && (sp.walls || []).includes(wallIdx)) return true;
  }
  const others = AXES.filter((a) => a !== side.axis);
  for (const o of solidBoxes()) {
    if (o.id === excludeId) continue;
    const near = side.dir > 0 ? o[side.axis][0] : o[side.axis][1];
    if (Math.abs(near - at) > 0.5) continue;
    if (others.every((a) => lo[a] < o[a][1] - 0.5 && hi[a] > o[a][0] + 0.5)) return true;
  }
  return false;
}

/**
 * Door side for a new box: never against a wall or a neighbour; a blocked
 * side puts the doors opposite; otherwise the long horizontal edge is the
 * door edge (W), facing the middle of the room (ties: front, −Y).
 */
export function defaultSide(b, excludeId = null) {
  const free = SIDES.filter((s) => !sideBlocked(b, s, excludeId));
  if (!free.length) return SIDES[0];
  const sp = job.getSpace();
  const cx = b.x0 + b.W / 2;
  const cy = b.y0 + b.D / 2;
  const towardRoom = (s) => {
    if (!sp) return 0;
    const lo = s.axis === "x" ? sp.bounds.minX : sp.bounds.minY;
    const hi = s.axis === "x" ? sp.bounds.maxX : sp.bounds.maxY;
    const c = s.axis === "x" ? cx : cy;
    const off = (c - (lo + hi) / 2) / Math.max(hi - lo, 1);
    if (Math.abs(off) < 0.25) return 0; // the middle half of the room is a tie → front
    return -Math.sign(off) * s.dir; // 1 facing the room centre, −1 facing away
  };
  const edge = (s) => (s.axis === "y" ? b.W : b.D); // W if this side holds the doors
  const opposite = (s) => SIDES.find((t) => t.axis === s.axis && t.dir === -s.dir);
  const blockedOpp = SIDES.filter((s) => sideBlocked(b, s, excludeId)).map(opposite).filter((s) => free.includes(s));
  const pool = blockedOpp.length ? blockedOpp : free;
  const score = (s) => edge(s) * 4 + towardRoom(s) * 2 + (s.axis === "y" && s.dir < 0 ? 1 : 0) - (s.axis === "x" && s.dir < 0 ? 0.5 : 0);
  return pool.slice().sort((a, c) => score(c) - score(a))[0];
}

/** Pose turned `rotZ - current` degrees about world Z through the envelope centre, so R stays a 90° yaw. */
function poseRotatedTo(cab, rotZ) {
  const env = envelopeBox(cab, job.resultFor(cab.id));
  const center = [(env.x0 + env.x1) / 2, (env.y0 + env.y1) / 2, (env.z0 + env.z1) / 2];
  const next = rotatePoseAbout(cab.pose, "z", rotZ - (cab.pose.rotZ || 0), center);
  return {
    ...poseOf(cab.pose),
    ...next,
    x: job.snap(next.x),
    y: job.snap(next.y),
    z: job.snap(next.z),
  };
}

/** Nearest vertical envelope face of a cabinet (or of `onlyId`) under the cursor, seen from outside. */
function pickSideFace(clientX, clientY, onlyId = null) {
  const ray = rayFromClient(clientX, clientY);
  let best = null;
  for (const f of facePlanes()) {
    if (f.source === "space" || f.axis === "z" || (onlyId && f.source !== onlyId)) continue;
    if (!onlyId) {
      const cab = job.getJob().cabinets.find((c) => c.id === f.source);
      if (cab && getModule(cab.moduleId).noOrient) continue;
    }
    if (-ray.direction[f.axis] * f.dir <= 0) continue; // back side of the face
    const h = rayHitFace(ray, f, 1);
    if (h && (!best || h.t < best.t)) best = { face: f, t: h.t };
  }
  return best ? best.face : null;
}

/** Face command: click a side of a cabinet; its doors move to that side (pending) until confirmed. The box never moves. */
export function startOrient(id = job.getSelectedId()) {
  if (placing) disarm();
  cancelMove();
  cancelAlign();
  cancelPointAlign();
  cancelNose();
  cancelBedBox();
  cancelPlane();
  endRetype(false);
  const cab = id && job.getJob().cabinets.find((c) => c.id === id);
  if (!cab && !job.getJob().cabinets.length) return;
  if (cab && getModule(cab.moduleId).noOrient) {
    // Ceiling-hung modules have one possible door side (toward the room): nothing to choose.
    log("orient.blocked", { id: cab.id, reason: "module has a fixed door side", moduleId: cab.moduleId });
    return;
  }
  orient = { id: cab ? cab.id : null, pose0: cab ? { ...cab.pose } : null, params0: cab ? cab.params : null, before: job.snapshot(), pending: null };
  if (cab) job.select(cab.id);
  canvas.style.cursor = "crosshair";
  log("orient.start", { id: orient.id, pose: orient.pose0, side: cab ? sideOfRotZ(cab.pose.rotZ) : null });
  emitMode();
}

/** World AABB of a cabinet's envelope as a placement-style box. */
function envelopeAsBox(cab) {
  const fp = envelopeFootprint(cab, cab.pose);
  return { x0: fp.minX, y0: fp.minY, z0: fp.z0, W: fp.maxX - fp.minX, D: fp.maxY - fp.minY, H: fp.z1 - fp.z0 };
}

/** What the cabinet becomes with its doors on `side`, or the reason it can't. */
function orientFit(cab, side) {
  const mod = getModule(cab.moduleId);
  const fpt = envelopeBox(cab, job.resultFor(cab.id)).fpt;
  const fit = fitBoxFacing(envelopeAsBox(cab), side, fpt);
  const small = ["W", "D"].filter((k) => fit[k] < mod.minSize[k]);
  return { ...fit, small, blocked: sideBlocked(envelopeAsBox(cab), side, cab.id) };
}

/** The pending side as it sits on the (already rotated) envelope, for the orange hint. */
function pendingFace() {
  if (!orient || !orient.pending) return null;
  const p = orient.pending;
  return facePlanes().find((f) => f.source === orient.id && f.axis === p.axis && f.dir === p.dir) || null;
}

function orientHover(e) {
  const f = pickSideFace(e.clientX, e.clientY, orient.id);
  const pend = pendingFace();
  if (f) showFaceHint(f, { tone: pend && f.axis === pend.axis && f.dir === pend.dir ? "pending" : "" });
  else if (pend) showFaceHint(pend, { tone: "pending" });
  else hideFaceHint();
  const lines = [];
  let tone = pend ? "lock" : "";
  if (f) {
    const cab = job.getJob().cabinets.find((c) => c.id === f.source);
    const fit = orientFit(cab, f);
    lines.push(`${f.label} → doors on ${sideLabel(f)} · W ${Math.round(fit.W)} D ${Math.round(fit.D)}`);
    if (fit.blocked) { lines.push("Against a wall / neighbour — doors can't open here"); tone = "warn"; }
    else if (fit.small.length) { lines.push(`Too small: ${fit.small.map((k) => `${k} ${Math.round(fit[k])} < ${getModule(cab.moduleId).minSize[k]}`).join(", ")}`); tone = "warn"; }
  } else lines.push(orient.id ? `Click a side of ${orient.id}` : "Click a side of a cabinet");
  if (pend) lines.push("Click elsewhere or Enter to confirm · Esc restores");
  showTip(e.clientX, e.clientY, lines, tone);
}

function orientClick(e) {
  const f = pickSideFace(e.clientX, e.clientY, orient.id);
  if (!f) { finishOrient("click"); return; }
  if (!orient.id) {
    const cab = job.getJob().cabinets.find((c) => c.id === f.source);
    orient.id = cab.id;
    orient.pose0 = { ...cab.pose };
    orient.params0 = cab.params;
    job.select(cab.id);
  }
  const cab = job.getJob().cabinets.find((c) => c.id === orient.id);
  const side = { axis: f.axis, dir: f.dir };
  const fit = orientFit(cab, side);
  if (fit.blocked || fit.small.length) {
    log("orient.blocked", { id: cab.id, face: { ...side, label: f.label }, blocked: fit.blocked, small: fit.small, fit: { W: fit.W, D: fit.D } });
    orientHover(e);
    return;
  }
  const mod = getModule(cab.moduleId);
  const s0 = sideOfRotZ(orient.pose0.rotZ);
  const back = s0.axis === side.axis && s0.dir === side.dir;
  // The box stays put: W/D swap and the origin moves to the corner the doors now start from.
  const params = back ? orient.params0 : mod.setEnvelope(orient.params0, { W: fit.W, D: fit.D });
  const pose = back ? { ...orient.pose0 } : fit.pose;
  orient.pending = { ...side, label: f.label };
  job.updateCabinet(cab.id, (c) => { c.params = params; c.pose = pose; });
  log("orient.pending", { id: cab.id, face: orient.pending, from: { pose: orient.pose0, envelope: mod.envelope(orient.params0) }, to: { pose, envelope: mod.envelope(params) } });
  orientHover(e);
  emitMode();
}

function finishOrient(how) {
  if (!orient) return;
  const o = orient;
  const done = pendingFace(); // before orient is cleared
  orient = null;
  const cab = o.id && job.getJob().cabinets.find((c) => c.id === o.id);
  const changed = o.pending ? job.commitSnapshot(o.before) : false;
  log("orient.end", { id: o.id, how, face: o.pending, from: o.pose0, to: cab ? cab.pose : null, envelope: cab ? getModule(cab.moduleId).envelope(cab.params) : null, changed });
  clearPreview();
  if (done) flashFaceHint(done);
  canvas.style.cursor = "";
  emitMode();
}

export function cancelOrient() {
  if (!orient) return;
  const o = orient;
  orient = null;
  if (o.id && o.pending) job.updateCabinet(o.id, (c) => { c.params = o.params0; c.pose = { ...o.pose0 }; });
  log("orient.cancel", { id: o.id, pending: o.pending });
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

  if (orient) { orientClick(e); return; }

  if (cplane) {
    if (cplane.step === "pick") {
      const hit = pickFace(e.clientX, e.clientY);
      if (hit) planeBeginOffset(hit.face);
    } else finishPlane("click");
    return;
  }

  if (nose) {
    if (nose.step === "ready") noseBegin(e);
    else finishNose("click");
    return;
  }

  if (bed) { finishBedBox("click"); return; }

  if (align) { alignClick(e); return; }

  if (pointAlign) { pointClick(e); return; }

  if (move) {
    const hit = pick(e.clientX, e.clientY);
    const ud = hit && hit.object.userData;
    if (ud && ud.kind === "moveAxis") { beginMoveDrag(e, ud); return; }
    if (move.target === "panel" && ud && ud.kind === "board" && ud.boardId && ud.cabId === move.id && ud.boardId !== move.boardId) {
      move.applying = true;
      job.select(move.id, { boardId: ud.boardId });
      move.applying = false;
      syncMoveSelection();
    }
    return;
  }

  if (placing) {
    if (!rb) {
      const p = cursorPoint(e.clientX, e.clientY);
      if (!p) return;
      if (p.none) { log("place.blocked", { moduleId: placing, reason: "not on a ceiling edge" }); return; }
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
  const { kind, cabId, handle, planeId, wallId } = hit.object.userData;
  if (kind === "cplane") { job.select(planeId); return; }
  if (kind === "wall") { job.select(wallId); return; }
  const cab = job.getJob().cabinets.find((c) => c.id === cabId);
  if (!cab) return;

  if (kind === "handle") {
    const group = groupFor(cabId);
    const axis = handle.type === "W" ? "x" : handle.type === "D" ? "y" : handle.type === "divider" ? (handle.axis || "z") : "z";
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
    log("handle.start", { id: cabId, handle: handle.type, index: handle.index, key: handle.key || undefined, envelope: getModule(cab.moduleId).envelope(cab.params) });
    emitMode();
    return;
  }

  // Drill down module → board → face: the first click takes the cabinet, a click on a board of
  // the selected cabinet takes that board, a click on the selected board takes the face under
  // the cursor. Esc (or the cabinet row in the tree) climbs back up.
  if (cabId === job.getSelectedId() && hit.object.userData.boardId) {
    const sub = job.getSubSelection();
    const under = faceUnderHit(hit);
    if (!sub || sub.boardId !== under.boardId) job.select(cabId, { boardId: under.boardId });
    else job.select(cabId, { boardId: under.boardId, faceId: under.faceId });
    return;
  }
  // A volume-only module laid out in regions (bedroom body): the second click takes the region.
  if (cabId === job.getSelectedId() && hit.object.userData.regionId) {
    job.select(cabId, { regionId: hit.object.userData.regionId });
    return;
  }
  job.select(cabId);
});

function hoverArmed(e, prefix) {
  const p = cursorPoint(e.clientX, e.clientY);
  if (!p) { hideSnapMarker(); hideFaceHint(); hideTip(); return; }
  if (p.none) { hideSnapMarker(); hideFaceHint(); showTip(e.clientX, e.clientY, p.tip, "warn"); return; }
  showSnapMarker(p.x, p.y, p.z, { feature: p.feature });
  if (p.face) showFaceHint(p.face); else hideFaceHint();
  const lines = [...(prefix ? [prefix] : []), ...p.tip];
  if (placing && lastSize && lastSize.moduleId === placing) lines.push(`Shift+click: repeat ${lastSize.W}×${lastSize.D}×${lastSize.H}`);
  showTip(e.clientX, e.clientY, lines);
}

canvas.addEventListener("pointermove", (e) => {
  if (drag) return handleDragMove(e);

  if (orient) return orientHover(e);
  if (cplane) return cplane.step === "pick" ? planeHoverPick(e) : updatePlane(e);

  if (nose) return nose.step === "ready" ? noseHover(e) : updateNose(e);
  if (bed) return updateBedBox(e);

  if (align) return alignHover(e);

  if (pointAlign) return pointHover(e);

  if (move) {
    if (move.drag) return applyMoveDrag(e);
    const hit = pick(e.clientX, e.clientY);
    const ud = hit && hit.object.userData;
    if (ud && ud.kind === "moveAxis") {
      setMoveHover(hit.object);
      canvas.style.cursor = "grab";
      showTip(e.clientX, e.clientY, [ud.op === "rotate" ? `Rotate ${ud.axis.toUpperCase()}` : `Move ${ud.axis.toUpperCase()}`]);
    } else {
      setMoveHover(null);
      canvas.style.cursor = move.target === "panel" && !move.boardId ? "crosshair" : "";
      hideTip();
    }
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

  // Resize handles stop at the space boundary and at partition walls: only apply a candidate that still fits.
  let stopped = false;
  let stoppedBy = "the space boundary";
  const applyIfFits = (params, pose) => {
    const probe = { ...cab, params, pose };
    if (!poseFits(probe, pose)) { stopped = true; return; }
    const hits = wallHits(probe, pose);
    if (hits.length) { stopped = true; stoppedBy = hits[0]; return; }
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
    if (mod.growsDown) {
      // Top glued to the ceiling: the bottom is pulled; a lower bottom = a taller box.
      const H = Math.max(mod.minSize.H, job.snap(env0.H - delta));
      applyIfFits(mod.setEnvelope(drag.params0, { H }), { ...drag.pose0, z: drag.pose0.z + (env0.H - H) });
    } else {
      const H = Math.max(mod.minSize.H, job.snap(env0.H + delta));
      applyIfFits(mod.setEnvelope(drag.params0, { H }), cab.pose);
    }
  } else if (h.type === "divider") {
    job.setParams(drag.cabId, mod.setDivider(drag.params0, drag.result0, h.index, h.pos + delta), { history: false });
  }
  const now = job.getJob().cabinets.find((c) => c.id === drag.cabId).params;
  const env = mod.envelope(now);
  // A layout bar (bedroom body) names the number it drives; a zone bar just says what it is.
  const val = h.type === "divider"
    ? (h.key && now[h.key] != null ? `${LAYOUT_LABEL[h.key] || h.key} ${Math.round(now[h.key])}` : "Zone boundary")
    : `${h.type} ${Math.round(h.type === "D" ? env.D + FRONT_THICKNESS_DEFAULT : env[h.type])}`;
  showTip(e.clientX, e.clientY, [val, stopped ? `Stopped at ${stoppedBy}` : null], stopped ? "warn" : "");
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
    zones: cab && cab.params.zones ? cab.params.zones.map((z) => z.height ?? z.width) : undefined,
    // A layout bar (bedroom body): which number it drove and where it ended up.
    key: d.handle.key || undefined,
    value: cab && d.handle.key ? cab.params[d.handle.key] : undefined,
    pose: cab ? cab.pose : null,
  });
  hideTip();
  emitMode();
}
canvas.addEventListener("pointerup", (e) => { endDrag(e); endMoveDrag(e); });
canvas.addEventListener("pointercancel", (e) => { endDrag(e); endMoveDrag(e); });

canvas.addEventListener("pointerleave", () => {
  if (placing && !rb) { hideSnapMarker(); hideFaceHint(); hideTip(); }
  if (orient) { const pend = pendingFace(); if (pend) showFaceHint(pend, { tone: "pending" }); else hideFaceHint(); hideTip(); }
  if (nose || bed || cplane) hideTip();
});

function cursorFor(handle) {
  if (!handle) return "";
  if (handle.type === "divider") return handle.axis === "x" ? "ew-resize" : "ns-resize";
  if (handle.type === "H") return "ns-resize";
  return "ew-resize";
}

// Keep type-ins glued to the box while the camera moves.
(function tickDims() {
  if (rb) positionDimInputs(placementBox());
  else if (nose && nose.step === "drag") positionDimInputs(noseBox());
  else if (bed) drawBedBox(null);
  else if (cplane && cplane.step === "offset") positionDimInputs(planeBox());
  else if (retype) updateRetype();
  else if (move) layoutMoveTriad();
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
  if (cplane) return ["W"];
  if (nose) return ["D"];
  if (bed) return bed.pair && bed.step === "height" ? ["H"] : ["D"];
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
  if (cplane) return k === "W" ? cplane.offset : 0;
  if (nose) return k === "D" ? nose.D : 0;
  if (bed) return bed[k] ?? 0;
  if (retype) return retypeBox()[k];
  return 0;
}
function maxDim(k) {
  if (rb) return placementBox().max[k];
  if (cplane) return cplane.face ? extrudeRoom(cplane.face) : null;
  if (nose) return k === "D" ? noseLength() : null;
  if (bed) {
    if (bed.pair && bed.step === "height" && k === "H") return bedFrame()?.bodyParams.height ?? null;
    return bedBoxBox().max[k] ?? null;
  }
  return null;
}

/** Apply a typed value to whichever command owns the type-ins. */
function setTyped(k, v) {
  if (cplane && cplane.step === "offset") {
    if (k !== "W") return;
    cplane.locked = v != null && v >= PLANE_MIN ? v : null;
    log("plane.typein", { value: dimInputs.W.value, locked: cplane.locked });
    updatePlane(null);
  } else if (bed) {
    if (bed.pair && bed.step === "height") {
      if (k !== "H") return;
      const min = getModule(bed.moduleId).minSize.H;
      bed.locked.H = v != null && v >= min ? v : null;
      log("bedside.typein", { dim: k, value: dimInputs.H.value, locked: bed.locked.H, step: bed.step });
      bedHeight(null);
      drawBedBox(null);
      return;
    }
    if (k !== "D") return; // W and H come from the body
    const min = getModule(bed.moduleId).minSize.D;
    bed.locked.D = v != null && v >= min ? v : null;
    log(bed.pair ? "bedside.typein" : "bedbox.typein", { dim: k, value: dimInputs.D.value, locked: bed.locked.D, step: bed.step });
    bedDepth(null);
    drawBedBox(null);
  } else if (nose) {
    if (k !== "D") return;
    nose.locked = v != null && v >= getModule(nose.moduleId).minSize.D ? v : null;
    log("nose.typein", { value: dimInputs.D.value, locked: nose.locked });
    if (nose.step === "drag") updateNose(null);
  } else if (rb) {
    const min = minSizes(getModule(placing))[k];
    rb.locked[k] = v != null && v >= min ? v : null;
    log("place.typein", { dim: k, value: dimInputs[k].value, locked: rb.locked[k] });
    updatePlacement(null);
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
      if (nose) finishNose("enter");
      else if (cplane) { if (cplane.step === "offset") finishPlane("enter"); }
      else if (bed) finishBedBox("enter");
      else if (rb) finishPlacement("enter");
      else if (move) finishMove(e.ctrlKey);
      else if (retype) endRetype(true);
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (nose) cancelNose();
      else if (cplane) cancelPlane();
      else if (bed) cancelBedBox();
      else if (rb) cancelPlacement();
      else if (move) cancelMove();
      else if (retype) endRetype(false);
    }
    e.stopPropagation();
  });
}

// --- keyboard ----------------------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (orient) {
    if (e.key === "Enter") { e.preventDefault(); finishOrient("enter"); }
    else if (e.key === "Escape") cancelOrient();
    return;
  }
  if (cplane && cplane.step === "pick") {
    if (e.key === "Escape") { cancelPlane(); return; }
    return;
  }
  if (nose && nose.step === "ready") {
    // Preset depth is already shown: Enter takes it, a digit opens the depth type-in.
    if (e.key === "Enter") { e.preventDefault(); finishNose("enter"); return; }
    if (e.key === "Escape") { cancelNose(); return; }
    if (/^[0-9.+\-*/]$/.test(e.key)) {
      noseBegin(null);
      nose.locked = nose.D; updateNose(null);
      focusDim("D"); dimInputs.D.value = "";
      return;
    }
    return;
  }
  if (move) {
    if (e.key === "Enter") { e.preventDefault(); finishMove(e.ctrlKey); return; }
    if (e.key === "Escape") { cancelMove(); return; }
  }
  if (align && e.key === "Escape") { cancelAlign(); return; }
  if (pointAlign && e.key === "Escape") { cancelPointAlign(); return; }
  const typing = rb || retype || nose || bed || (cplane && cplane.step === "offset");

  if (typing) {
    if (e.key === "Tab") { e.preventDefault(); focusDim(focusedDim() || typableDims()[0]); return; }
    if (e.key === "Enter") {
      e.preventDefault();
      if (nose) finishNose("enter");
      else if (cplane) finishPlane("enter");
      else if (bed) finishBedBox("enter");
      else if (rb) finishPlacement("enter");
      else if (move) finishMove(e.ctrlKey);
      else endRetype(true);
      return;
    }
    if (e.key === "Escape") {
      if (nose) cancelNose();
      else if (cplane) cancelPlane();
      else if (bed) cancelBedBox();
      else if (rb) cancelPlacement();
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
    else if (align) cancelAlign();
    else if (pointAlign) cancelPointAlign();
    else if (cplane) cancelPlane();
    else if (placing) disarm();
    else if (disarmHandle()) log("handle.arm", { id: job.getSelectedId(), on: false, how: "esc" }); // an on-demand arrow goes first
    else if (job.getSubSelection()) {
      // Face → board → cabinet, one level per Esc.
      const sub = job.getSubSelection();
      job.select(sub.cabId, sub.faceId ? { boardId: sub.boardId } : null);
    }
    else if (job.getSelectedRegion()) job.select(job.getSelectedId()); // region → body
    else job.select(null);
    return;
  }
  // Armed with a fresh box: digits re-type its size.
  if (placing && lastCreated && !e.ctrlKey && /^[0-9.+\-*/]$/.test(e.key)) {
    if (beginRetype()) { focusDim("W"); dimInputs.W.value = ""; }
    return;
  }

  if ((e.key === "p" || e.key === "P") && !e.ctrlKey) { startPlane(); return; }

  const pl = job.getSelectedPlane();
  if (pl && (e.key === "Delete" || e.key === "Backspace")) {
    log("key.delete", { id: pl.id });
    job.removePlane(pl.id);
    return;
  }
  // A partition wall: 3D only selects and deletes it; it is drawn and edited in the floor plan.
  const wall = job.getSelectedWall();
  if (wall && (e.key === "Delete" || e.key === "Backspace")) {
    log("key.delete", { id: wall.id });
    job.removeWall(wall.id);
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
    if (getModule(sel.moduleId).noOrient) { log("key.rotate", { id: sel.id, blocked: "module has a fixed door side" }); return; }
    log("key.rotate", { id: sel.id, from: sel.pose.rotZ || 0 });
    // Rotate 90° about the envelope centre.
    job.setPose(sel.id, poseRotatedTo(sel, (sel.pose.rotZ || 0) + 90));
  } else if (e.key === "o" || e.key === "O") {
    startOrient(sel.id);
  }
});
