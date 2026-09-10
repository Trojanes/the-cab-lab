// Left-button interaction in the viewport.
//
//   idle       click board → select · click empty → deselect · press handle → drag W/D/H or divider
//   armed      (module picked) hover snaps to feature points · click → anchor (sets the working plane)
//   footprint  cursor draws W × D on the anchor's plane · click → corner
//   height     cursor pulls H along the corner's vertical · click / Enter → create, stay armed
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
} from "./cabinets3d.js";
import {
  nearestSnap, nearestInference, pointOnLine, toClient, nearestFaceAlign, nearestHeightAlign, describePoint, faceGuide,
  INFER_BAND_PX, INFER_RELEASE_PX, AXIS_DIRS, uiScale,
} from "./snap.js";
import { showTip, hideTip } from "./hud.js";
import { log, traceSample, flushTrace, clearTrace } from "./log.js";

const FRONT_THICKNESS_DEFAULT = 16;

let placing = null; // moduleId while armed
let rb = null; // placement in progress (footprint / height step)
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
  if (rb) return rb.step === "height" ? "height" : "footprint";
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

/** Cursor → feature point (any height) or grid point on plane z. */
function cursorPoint(clientX, clientY, z, { exclude = null } = {}) {
  const snap = nearestSnap(clientX, clientY, { exclude });
  if (snap) return { x: snap.x, y: snap.y, z: snap.z, feature: true, dirs: snap.dirs, tip: [`Corner · ${describePoint(snap)}`] };
  const p = planePointAt(clientX, clientY, new THREE.Plane(new THREE.Vector3(0, 0, 1), -z));
  if (!p) return null;
  const x = job.snap(p.x);
  const y = job.snap(p.y);
  return { x, y, z, feature: false, tip: [`${z > 0 ? `Plane ${Math.round(z)}` : "Floor"} · ${x}, ${y}`] };
}

/**
 * Cursor with inference. `ctx` persists between moves:
 *   { planeZ, anchorPoint, lastPoint, inference, exclude, planar }
 * planar=true keeps the result on ctx.planeZ (footprint drawing); otherwise
 * feature points and vertical edges may move the working plane (move command).
 * Returns { x, y, z, kind, tip:[…], inference?, alignSegs? } or null.
 */
function resolveCursor(e, ctx) {
  const cx = e.clientX;
  const cy = e.clientY;
  const shift = e.shiftKey;
  const band = INFER_BAND_PX * uiScale();

  const snap = nearestSnap(cx, cy, { exclude: ctx.exclude });
  if (snap) {
    const projected = ctx.planar && Math.abs(snap.z - ctx.planeZ) > 0.5;
    // On a plane, an off-plane corner contributes its X/Y only (SketchUp's "from point").
    ctx.lastPoint = projected ? { ...snap, z: ctx.planeZ } : snap;
    ctx.inference = null;
    if (!ctx.planar) ctx.planeZ = snap.z;
    return {
      x: snap.x, y: snap.y, z: ctx.planar ? ctx.planeZ : snap.z, kind: "feature",
      tip: [`Corner · ${describePoint(snap, ctx.exclude)}${projected ? " (projected to plane)" : ""}`],
    };
  }

  const finishOnLine = (from, dir, pt, extraTip) => {
    // A face crossing the line can still pin the free coordinate.
    const al = nearestFaceAlign(cx, cy, ctx.planeZ, { exclude: ctx.exclude });
    const segs = [];
    const tip = [`On edge ${axisName(dir)} from ${describePoint(from)}`];
    if (Math.abs(dir[0]) > 0.5 && al.x) { pt = { ...pt, x: al.x.value }; segs.push(faceSeg(al.x.plane, ctx.planeZ)); tip.push(`Flush with ${al.x.plane.label}`); }
    if (Math.abs(dir[1]) > 0.5 && al.y) { pt = { ...pt, y: al.y.value }; segs.push(faceSeg(al.y.plane, ctx.planeZ)); tip.push(`Flush with ${al.y.plane.label}`); }
    if (extraTip) tip.push(extraTip);
    return { ...pt, kind: "inference", inference: ctx.inference, alignSegs: segs, tip };
  };

  // Keep the current inference while the cursor stays near its line (or Shift is held).
  if (ctx.inference) {
    const { from, dir } = ctx.inference;
    const near = shift ? { dir, distPx: 0 } : nearestInference(cx, cy, from, { band: INFER_RELEASE_PX * uiScale(), planar: ctx.planar });
    if (near && near.dir === dir) {
      const pt = pointOnLine(cx, cy, from, dir);
      if (shift || near.distPx <= band) ctx.inference.at = pt;
      if (!ctx.planar) ctx.planeZ = pt.z;
      return finishOnLine(from, dir, pt, shift ? "Shift: locked to edge" : null);
    }
    // Leaving the line: where we left it becomes the next inference source, so
    // a third edge can start from the end of the second one.
    if (ctx.inference.at) ctx.lastPoint = { ...ctx.inference.at, dirs: AXIS_DIRS, sources: ["edge"] };
    ctx.inference = null;
  }
  // Pick up a new inference from the last touched point or the anchor.
  for (const from of [ctx.lastPoint, ctx.anchorPoint]) {
    if (!from) continue;
    const near = nearestInference(cx, cy, from, { planar: ctx.planar });
    if (near) {
      const pt = pointOnLine(cx, cy, from, near.dir);
      ctx.inference = { from, dir: near.dir, at: pt };
      if (!ctx.planar) ctx.planeZ = pt.z;
      return finishOnLine(from, near.dir, pt);
    }
  }

  // Free cursor on the working plane, with face alignment.
  const g = planePointAt(cx, cy, new THREE.Plane(new THREE.Vector3(0, 0, 1), -ctx.planeZ));
  if (!g) return null;
  const al = nearestFaceAlign(cx, cy, ctx.planeZ, { exclude: ctx.exclude });
  const x = al.x ? al.x.value : job.snap(g.x);
  const y = al.y ? al.y.value : job.snap(g.y);
  const segs = [];
  const tip = [];
  if (al.x) { segs.push(faceSeg(al.x.plane, ctx.planeZ)); tip.push(`Flush with ${al.x.plane.label}`); }
  if (al.y) { segs.push(faceSeg(al.y.plane, ctx.planeZ)); tip.push(`Flush with ${al.y.plane.label}`); }
  if (!tip.length) tip.push(`${ctx.planeZ > 0.5 ? `Plane ${Math.round(ctx.planeZ)}` : "Floor"} · ${x}, ${y}`);
  return { x, y, z: ctx.planeZ, kind: segs.length ? "align" : "plane", alignSegs: segs, tip };
}

function axisName(dir) {
  return Math.abs(dir[0]) > 0.5 ? "X" : Math.abs(dir[1]) > 0.5 ? "Y" : "Z";
}
function faceSeg(plane, z) {
  return faceGuide(plane, z);
}

function drawResolved(e, p) {
  if (p.kind === "feature") showSnapMarker(p.x, p.y, p.z, { feature: true });
  else hideSnapMarker();
  if (p.inference) showInference(p.inference.from, p, p.inference.dir);
  else hideInference();
  if (p.alignSegs && p.alignSegs.length) showAlignLines(p.alignSegs);
  else hideAlignLines();
}

// --- placement ------------------------------------------------------------------

function minDims(mod) {
  return { W: mod.minSize.W, D: mod.minSize.D + FRONT_THICKNESS_DEFAULT, H: mod.minSize.H };
}

/** Room from the anchor to the space boundary on each side. */
function roomFrom(anchor) {
  const sp = job.getSpace();
  if (!sp) return { xPos: Infinity, xNeg: Infinity, yPos: Infinity, yNeg: Infinity, zPos: Infinity, zNeg: Infinity };
  return {
    xPos: sp.bounds.maxX - anchor.x, xNeg: anchor.x - sp.bounds.minX,
    yPos: sp.bounds.maxY - anchor.y, yNeg: anchor.y - sp.bounds.minY,
    zPos: sp.height - anchor.z, zNeg: anchor.z,
  };
}

/** Current placement box as a min-corner AABB, with which dims were stopped by the space. */
function placementBox() {
  const mod = getModule(placing);
  const min = minDims(mod);
  const { anchor, corner, locked, planeZ } = rb;
  const sx = corner.x >= anchor.x ? 1 : -1;
  const sy = corner.y >= anchor.y ? 1 : -1;
  const room = roomFrom(anchor);
  const clamped = {};
  let W = locked.W ?? Math.max(min.W, Math.abs(corner.x - anchor.x));
  let D = locked.D ?? Math.max(min.D, Math.abs(corner.y - anchor.y));
  const roomW = sx > 0 ? room.xPos : room.xNeg;
  const roomD = sy > 0 ? room.yPos : room.yNeg;
  if (W > roomW) { W = roomW; clamped.W = sx > 0 ? "right wall" : "left wall"; }
  if (D > roomD) { D = roomD; clamped.D = sy > 0 ? "back wall" : "front edge"; }

  const dirH = rb.h ? rb.h.dir : defaultHeightDir(planeZ);
  let H = locked.H ?? (rb.h ? rb.h.H : getPreset(placing).H);
  H = Math.max(min.H, H);
  const roomH = dirH > 0 ? room.zPos : room.zNeg;
  if (H > roomH) { H = roomH; clamped.H = dirH > 0 ? "ceiling" : "floor"; }

  return {
    x0: sx > 0 ? anchor.x : anchor.x - W,
    y0: sy > 0 ? anchor.y : anchor.y - D,
    z0: dirH > 0 ? planeZ : planeZ - H,
    W, D, H, sx, sy, dirH, clamped,
    max: { W: roomW, D: roomD, H: roomH },
  };
}

function defaultHeightDir(planeZ) {
  const sp = job.getSpace();
  return sp && planeZ >= sp.height - 1 ? -1 : 1;
}

function updatePlacement(tipAt) {
  const b = placementBox();
  const clampedKeys = Object.keys(b.clamped);
  showGhost(b.x0, b.y0, b.z0, b.W, b.D, b.H, { clamped: clampedKeys.length > 0 });
  for (const k of DIM_ORDER) {
    if (document.activeElement !== dimInputs[k]) dimInputs[k].value = Math.round(b[k]);
    dimLabels[k].classList.toggle("locked", rb.locked[k] != null);
  }
  positionDimInputs(b);
  if (tipAt) {
    const lines = [...(tipAt.tip || [])];
    for (const k of clampedKeys) lines.push(`${k} stopped at ${b.clamped[k]}`);
    for (const k of DIM_ORDER) if (rb.locked[k] != null) lines.push(`${k} locked ${Math.round(rb.locked[k])}`);
    if (rb.step === "height" && !rb.h.touched && rb.locked.H == null) lines.push(`H ${Math.round(b.H)} · preset · Enter keeps it`);
    showTip(tipAt.clientX, tipAt.clientY, lines, clampedKeys.length ? "warn" : Object.values(rb.locked).some((v) => v != null) ? "lock" : "");
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
  const yFront = b.y0;
  place("W", b.x0 + b.W / 2, yFront, b.z0, 0, 22);
  place("D", b.x0 + b.W, b.y0 + b.D / 2, b.z0, 54, 0);
  place("H", b.x0 + b.W, yFront, b.z0 + b.H / 2, 54, -22);
}

function setDimNames(names) {
  DIM_ORDER.forEach((k, i) => { dimNames[k].textContent = names[i]; });
}

function beginFootprint(anchor) {
  const preset = getPreset(placing);
  rb = {
    step: "footprint",
    anchor: { x: anchor.x, y: anchor.y, z: anchor.z },
    corner: { x: anchor.x, y: anchor.y },
    planeZ: anchor.z,
    locked: { W: preset.W, D: preset.D, H: null }, // H comes from the preset unless typed
    h: null,
    ctx: {
      planeZ: anchor.z, planar: true, exclude: null,
      anchorPoint: { x: anchor.x, y: anchor.y, z: anchor.z, dirs: anchor.dirs || AXIS_DIRS, sources: ["anchor"] },
      lastPoint: null, inference: null,
    },
  };
  setDimNames(["W", "D", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked");
  clearTrace();
  log("place.anchor", { moduleId: placing, anchor: rb.anchor, feature: !!anchor.feature, planeZ: rb.planeZ });
  updatePlacement(null);
  emitMode();
}

function beginHeight(e) {
  const { corner, planeZ } = rb;
  const dir = defaultHeightDir(planeZ);
  const t0 = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(corner.x, corner.y, planeZ), new THREE.Vector3(0, 0, 1));
  rb.step = "height";
  rb.h = { dir, t0, base: rb.locked.H ?? getPreset(placing).H, H: rb.locked.H ?? getPreset(placing).H, touched: false, label: null };
  hideInference();
  hideAlignLines();
  hideSnapMarker();
  log("place.corner", { moduleId: placing, corner, planeZ, locked: rb.locked });
  updatePlacement({ clientX: e.clientX, clientY: e.clientY, tip: ["Pull the height"] });
  emitMode();
}

function heightCursor(e) {
  const { corner, planeZ } = rb;
  const h = rb.h;
  const snap = nearestHeightAlign(e.clientX, e.clientY, corner.x, corner.y);
  if (snap && Math.abs(snap.z - planeZ) > 0.5) {
    h.H = Math.abs(snap.z - planeZ);
    h.dir = Math.sign(snap.z - planeZ);
    h.touched = true;
    h.label = snap.label;
    showSnapMarker(corner.x, corner.y, snap.z, { feature: true });
    return { tip: [snap.label] };
  }
  hideSnapMarker();
  const t = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(corner.x, corner.y, planeZ), new THREE.Vector3(0, 0, 1));
  const travel = t - h.t0;
  if (!h.touched && Math.abs(travel) < 20) return { tip: [] }; // small jitter keeps the preset
  h.touched = true;
  h.label = null;
  // Relative like Push/Pull: the preset height grows or shrinks with the cursor.
  const raw = h.base + h.dir * travel;
  const min = minDims(getModule(placing)).H;
  if (raw < min && Math.abs(travel) > h.base) {
    // Pulled straight through the plane: flip direction and measure from there.
    h.dir = -h.dir;
    h.base = 0;
    h.t0 = t;
  }
  h.H = job.snap(Math.max(min, h.base + h.dir * (t - h.t0)));
  return { tip: [`H ${Math.round(h.H)} ${h.dir > 0 ? "up" : "down"}`] };
}

function createFromBox(b, how) {
  const mod = getModule(placing);
  const fpt = FRONT_THICKNESS_DEFAULT;
  flushTrace("place.trace");
  log("place.finish", {
    moduleId: placing, how,
    anchor: rb ? rb.anchor : null, corner: rb ? rb.corner : null, locked: rb ? rb.locked : null,
    planeZ: rb ? rb.planeZ : b.z0, height: rb && rb.h ? { dir: rb.h.dir, label: rb.h.label, touched: rb.h.touched } : null,
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

function finishPlacement(how) {
  if (!rb) return;
  const b = placementBox();
  if (rb.step === "footprint" && rb.locked.W == null && rb.locked.D == null
      && Math.abs(rb.corner.x - rb.anchor.x) < 1 && Math.abs(rb.corner.y - rb.anchor.y) < 1) return; // nothing drawn yet
  createFromBox(b, how);
}

/** Shift+click: repeat the last size at this anchor, growing toward the side with room. */
function repeatLastSize(anchor) {
  if (!lastSize || lastSize.moduleId !== placing) return false;
  const room = roomFrom(anchor);
  const sx = room.xPos >= lastSize.W || room.xPos >= room.xNeg ? 1 : -1;
  const sy = room.yPos >= lastSize.D || room.yPos >= room.yNeg ? 1 : -1;
  const sz = room.zPos >= lastSize.H || room.zPos >= room.zNeg ? 1 : -1;
  const W = Math.min(lastSize.W, sx > 0 ? room.xPos : room.xNeg);
  const D = Math.min(lastSize.D, sy > 0 ? room.yPos : room.yNeg);
  const H = Math.min(lastSize.H, sz > 0 ? room.zPos : room.zNeg);
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
    planeZ: p.z, planar: false, exclude: move.id,
    anchorPoint: { x: p.x, y: p.y, z: p.z, dirs: AXIS_DIRS, sources: ["grab"] },
    lastPoint: null, inference: null,
  };
  setDimNames(["ΔX", "ΔY", "ΔZ"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked");
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
  let pose = { ...move.pose0, x: move.pose0.x + delta.x, y: move.pose0.y + delta.y, z: move.pose0.z + delta.z };
  const clamped = [];
  const sp = job.getSpace();
  if (sp) {
    const fp = envelopeFootprint(cab, pose);
    const b = sp.bounds;
    if (fp.minX < b.minX) { pose.x += b.minX - fp.minX; clamped.push("left wall"); }
    if (fp.maxX > b.maxX) { pose.x -= fp.maxX - b.maxX; clamped.push("right wall"); }
    if (fp.minY < b.minY) { pose.y += b.minY - fp.minY; clamped.push("front edge"); }
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
  job.updateCabinet(move.id, (c) => { c.pose = pose; });
  const vals = { W: delta.x, D: delta.y, H: delta.z };
  for (const k of DIM_ORDER) {
    if (document.activeElement !== dimInputs[k]) dimInputs[k].value = Math.round(vals[k]);
    dimLabels[k].classList.toggle("locked", move.locked[k] != null);
  }
  const cab = job.getJob().cabinets.find((c) => c.id === move.id);
  const fp = envelopeFootprint(cab, pose);
  const r = canvas.getBoundingClientRect();
  const put = (k, x, y, z, dx, dy) => {
    const c = toClient(x, y, z);
    dimLabels[k].style.left = `${c.x - r.left + dx}px`;
    dimLabels[k].style.top = `${c.y - r.top + dy}px`;
    dimLabels[k].style.display = c.behind ? "none" : "";
  };
  put("W", (fp.minX + fp.maxX) / 2, fp.minY, fp.z0, 0, 22);
  put("D", fp.maxX, (fp.minY + fp.maxY) / 2, fp.z0, 54, 0);
  put("H", fp.maxX, fp.minY, (fp.z0 + fp.z1) / 2, 54, -22);
  if (tipAt) {
    const lines = [...(tipAt.tip || []), `ΔX ${Math.round(delta.x)}  ΔY ${Math.round(delta.y)}  ΔZ ${Math.round(delta.z)}`];
    for (const c of clamped) lines.push(`Stopped at ${c}`);
    const ov = overlaps(cab, pose);
    if (ov.length) lines.push(`Overlaps ${ov.join(", ")}`);
    if (tipAt.ctrlKey) lines.push("Ctrl: copy");
    showTip(tipAt.clientX, tipAt.clientY, lines, clamped.length || ov.length ? "warn" : "");
  }
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
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked");
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
  const min = minDims(mod);
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
      const p = cursorPoint(e.clientX, e.clientY, 0);
      if (p) moveGrab(p);
    } else {
      finishMove(e.ctrlKey);
    }
    return;
  }

  if (placing) {
    if (!rb) {
      const p = cursorPoint(e.clientX, e.clientY, 0);
      if (!p) return;
      if (e.shiftKey && repeatLastSize(p)) return;
      beginFootprint(p);
    } else if (rb.step === "footprint") {
      const drawn = rb.locked.W != null || rb.locked.D != null
        || Math.abs(rb.corner.x - rb.anchor.x) >= 1 || Math.abs(rb.corner.y - rb.anchor.y) >= 1;
      if (!drawn) return; // a second click on the anchor is a no-op
      if (rb.locked.H != null) finishPlacement("click.lockedH");
      else beginHeight(e);
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

canvas.addEventListener("pointermove", (e) => {
  if (drag) return handleDragMove(e);

  if (move) {
    if (move.step === "grab") {
      const p = cursorPoint(e.clientX, e.clientY, 0);
      if (p) { showSnapMarker(p.x, p.y, p.z, { feature: p.feature }); showTip(e.clientX, e.clientY, ["Grab point", ...p.tip]); }
      else { hideSnapMarker(); hideTip(); }
      return;
    }
    const p = resolveCursor(e, move.ctx);
    if (!p) return;
    move.target = { x: p.x, y: p.y, z: p.z };
    traceSample({ cx: Math.round(e.clientX), cy: Math.round(e.clientY), x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), kind: p.kind, dir: p.inference ? p.inference.dir : undefined });
    drawResolved(e, p);
    updateMove({ clientX: e.clientX, clientY: e.clientY, tip: p.tip, ctrlKey: e.ctrlKey });
    return;
  }

  if (placing) {
    if (!rb) {
      const p = cursorPoint(e.clientX, e.clientY, 0);
      if (p) {
        showSnapMarker(p.x, p.y, p.z, { feature: p.feature });
        const lines = [...p.tip];
        if (lastSize && lastSize.moduleId === placing) lines.push(`Shift+click: repeat ${lastSize.W}×${lastSize.D}×${lastSize.H}`);
        showTip(e.clientX, e.clientY, lines);
      } else { hideSnapMarker(); hideTip(); }
      return;
    }
    if (rb.step === "footprint") {
      const p = resolveCursor(e, rb.ctx);
      if (!p) return;
      rb.corner = { x: p.x, y: p.y };
      traceSample({ cx: Math.round(e.clientX), cy: Math.round(e.clientY), x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), kind: p.kind, dir: p.inference ? p.inference.dir : undefined, shift: e.shiftKey || undefined });
      drawResolved(e, p);
      updatePlacement({ clientX: e.clientX, clientY: e.clientY, tip: p.tip });
    } else {
      const r = heightCursor(e);
      traceSample({ cx: Math.round(e.clientX), cy: Math.round(e.clientY), z: Math.round(rb.planeZ + rb.h.dir * rb.h.H), kind: rb.h.label ? "height.snap" : "height", label: rb.h.label || undefined });
      updatePlacement({ clientX: e.clientX, clientY: e.clientY, tip: r.tip });
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
  if ((placing && !rb) || (move && move.step === "grab")) { hideSnapMarker(); hideTip(); }
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
  else if (move && move.step === "drop") updateMove(null);
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

/**
 * Evaluate one type-in: 1110 · +50 · -20 · *2 · /2 · max. Returns a number or null.
 * `current` is the value the field shows, `max` the room the space leaves.
 */
export function evalDim(text, current, max) {
  const s = String(text).trim().toLowerCase();
  if (!s) return null;
  if (s === "max" || s === "m") return Number.isFinite(max) ? max : null;
  let m = /^([+\-*/])\s*(\d+(?:\.\d+)?)$/.exec(s);
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
    const min = minDims(getModule(placing))[k];
    rb.locked[k] = v != null && v >= min ? v : null;
    if (k === "H" && rb.h) { rb.h.H = rb.locked.H ?? rb.h.H; }
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

/** Commit the field on Tab / Enter: expressions and comma lists. */
function commitDim(k) {
  const parts = dimInputs[k].value.split(",");
  let i = DIM_ORDER.indexOf(k);
  for (const part of parts) {
    if (i >= DIM_ORDER.length) break;
    const kk = DIM_ORDER[i];
    const v = evalDim(part, currentDim(kk), maxDim(kk));
    if (v != null) { setTyped(kk, v); dimInputs[kk].value = Math.round(v); }
    i += 1;
  }
  return DIM_ORDER[Math.min(i, DIM_ORDER.length) % DIM_ORDER.length];
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
      const i = DIM_ORDER.indexOf(k);
      focusDim(e.shiftKey ? DIM_ORDER[(i + DIM_ORDER.length - 1) % DIM_ORDER.length] : next);
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
    if (e.key === "Tab") { e.preventDefault(); focusDim(focusedDim() || "W"); return; }
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
    // Typing a digit / sign jumps straight into the first field.
    if (/^[0-9.+\-*/]$/.test(e.key)) { focusDim("W"); dimInputs.W.value = ""; return; }
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
