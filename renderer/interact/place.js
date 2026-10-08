// Generic box placement: armed → face → extrude → create, plus the bunk-bed
// overlay (a placement variant — it drives the same rb/face/extrude machinery).
// Companion flows that need to intercept the box's completion (lounge box step)
// register a finish hook instead of importing this file (no cycle).
import * as THREE from "three";
import { canvas, rayFromClient, planePointAt, closestTOnLine } from "../space.js";
import * as job from "../job.js";
import { getModule, isBaseCabinet } from "../modules.js";
import { RULES as BUNK_RULES, bunkUpperLimits } from "../gen/bunkBed.js";
import { getPreset } from "../presets.js";
import {
  showGhost, showLoungeGhost, showSnapMarker, hideSnapMarker, hideInference,
  showAlignLines, hideAlignLines, showFaceHint, hideFaceHint,
} from "../cabinets3d.js";
import {
  nearestSnap, nearestInference, toClient, nearestFaceAlign, describePoint,
  facesAtPoint, facesOnPoint, faceVisible, rayHitFace, preferDrawable, drawableOn,
  extrudeRoom, inPlaneAxes, axisVector, AXES, AXIS_DIRS, uiScale,
} from "../snap.js";
import { showTip, hideTip } from "../hud.js";
import { wallBoards } from "../walls.js";
import { wallPickables } from "../walls3d.js";
import {
  envelopeBox, envelopeFootprint, poseFits, solidBoxes, overlaps,
  fitBoxFacing, defaultSide, FRONT_THICKNESS_DEFAULT,
} from "../fit.js";
import { clearHeightAt, minClearHeight, maxClearHeight } from "../spaces.js";
import { log, traceSample, flushTrace, clearTrace } from "../log.js";
import { localOf, cornerOf } from "../pose.js";
import { cancelBoard } from "../boardSketch.js";
import { endGroove } from "../grooveTool.js";
import { cancelMeasure } from "../measureTool.js";
import { endResize } from "./resize.js";
import { endRetype } from "./retype.js";
import { startNose, cancelNose, noseActive } from "./nose.js";
import { startBedBox, cancelBedBox, bedActive } from "./bedBox.js";
import { cancelPlane, planeActive } from "./cplane.js";
import {
  S, host, resetHooks, registerMode, stopAll, emitMode, clearPreview,
  resolveCursor, drawResolved, threePlane, floorFace,
  DIM_OF, AXIS_OF, dimBox, DIM_ORDER, dimInputs, dimLabels,
  positionDimInputs, setDimNames,
} from "./shared.js";

// Shared placement-family slots live on S (shared.js): placing / rb / lshape /
// bunk / lounge / lastCreated. lastSize stays private to this file.
let lastSize = null;

const finishHooks = [];
/** Companion flows (lounge box step) intercept box completion via this hook. */
export function registerFinishHook(fn) { finishHooks.push(fn); }

// --- cursor resolver (shared machinery lives in interact/shared.js) ----------------
// cursorPoint stays here until the placement family moves to interact/place.js.

/**
 * Armed / grab cursor → a point and the face it lies on:
 *   corner within reach → that corner (face = the corner's face most facing the camera)
 *   otherwise the face under the cursor → grid point on it (floor if none)
 * Returns { x, y, z, feature, face, tip } or null.
 */
function cursorPoint(clientX, clientY, { exclude = null } = {}) {
  if (ceilingMode()) {
    // Overhead: a feature point where the ceiling meets a wall, a cabinet's outer box, or a partition.
    const snap = nearestSnap(clientX, clientY, { exclude, filter: onCeilingLine });
    if (!snap) return { none: true, tip: ["Overhead starts on a ceiling edge", "Click a corner where the ceiling meets a wall, a cabinet, or a partition"] };
    const all = allowedCeilingFaces(snap, facesOnPoint(snap));
    const visible = facesAtPoint(snap, clientX, clientY).filter((f) => all.includes(f));
    const face = preferDrawable(visible) || ceilingFace() || preferDrawable(all);
    const walls = wallsAt(snap).map((w) => w.label.toLowerCase()).join(" / ");
    return {
      x: snap.x, y: snap.y, z: snap.z, feature: true, dirs: snap.dirs, face, faces: all,
      tip: [`Ceiling edge · ${describePoint(snap, exclude)} · ${walls}`, all.length > 1 ? `On ${all.map((f) => f.label.toLowerCase()).join(" / ")} — move onto the face to draw on` : face ? `On ${face.label.toLowerCase()}` : null],
    };
  }
  if (bunkMode()) {
    // Bunk bed: one of the two floor corners at the rear wall, and nothing standing along that wall.
    const snap = nearestSnap(clientX, clientY, { exclude, filter: onBunkCorner });
    if (!snap) return { none: true, reason: "not on a rear floor corner", tip: ["Bunk bed starts at a rear corner", "Click a floor corner where the rear wall meets a side wall"] };
    const blocker = bunkLaneBlocker();
    if (blocker) return { none: true, reason: "rear wall not clear", blockedBy: blocker, tip: [`${blocker} stands along the rear wall`, "A bunk bed runs wall to wall — move it first"] };
    const all = facesOnPoint(snap).filter(bunkFace);
    const visible = facesAtPoint(snap, clientX, clientY).filter((f) => all.includes(f));
    const face = preferDrawable(visible) || floorFace();
    return {
      x: snap.x, y: snap.y, z: snap.z, feature: true, dirs: snap.dirs, face, faces: all,
      tip: [`Rear corner · ${describePoint(snap, exclude)}`, `Length ${Math.round(bunkLength())} wall to wall · draw the lower box on the floor, the rear wall or the side wall`],
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
  const p = { x: c.x, y: c.y, z: c.z };
  const alignSegs = [];
  const alignTips = [];
  const pinned = new Set();
  // Kitchen under an overhead: the first click on the floor or the back wall
  // snaps to the overhead's width sides when the cursor is close, and lets go past them.
  if (isBaseCabinet(S.placing) && face) {
    const al = nearestFaceAlign(clientX, clientY, face, { exclude, extendOverheadWidth: true });
    for (const a of inPlaneAxes(face.axis)) {
      if (!al[a]) continue;
      p[a] = al[a].value;
      pinned.add(a);
      alignSegs.push(faceGuide(al[a].plane, face));
      alignTips.push(`Flush with ${al[a].plane.label}`);
    }
  }
  for (const a of AXES) {
    if (face && a === face.axis) continue;
    if (pinned.has(a)) continue;
    p[a] = job.snap(c[a]);
  }
  if (face) p[face.axis] = face.value; // stay exactly on the face
  const where = alignTips.length
    ? alignTips
    : [`${face ? face.label : "Floor"} · ${AXES.filter((a) => !face || a !== face.axis).map((a) => `${a.toUpperCase()} ${Math.round(p[a])}`).join(", ")}${c.outside ? " (edge of space)" : ""}`];
  return { ...p, feature: false, face, alignSegs, tip: where };
}

// --- placement ------------------------------------------------------------------

/**
 * Which module dimension (W / D / H) lies along each world axis while a box is
 * drawn. Normally x→W, y→D (the doors face −Y until `defaultSide` decides);
 * a ceiling-hung module knows its back wall early, so W follows the wall.
 */
function currentTerm() {
  return (S.rb && S.rb.term) || DIM_OF;
}
/** Minimum box size along each world axis (keys W/D/H = x/y/z; the depth includes the fronts). */
function minSizes(mod, term = currentTerm()) {
  // Lounge L main box: either horizontal edge may run along the wall.
  if (S.lshape) return { W: L_MIN_BOX, D: L_MIN_BOX, H: mod.minSize.H };
  // Bunk bed: the drawn box is the lower one (boot + deck); its depth includes the front partition.
  if (bunkMode()) return { W: BUNK_RULES.LENGTH_MIN_MM.value, D: BUNK_RULES.DEPTH_MIN_MM.value, H: BUNK_RULES.BOOT_HEIGHT_MIN_MM.value + BUNK_RULES.DECK_THICKNESS_MM.value };
  const out = {};
  for (const a of AXES) out[DIM_OF[a]] = mod.minSize[term[a]] + (term[a] === "D" ? FRONT_THICKNESS_DEFAULT : 0);
  return out;
}
/** Preset box size along a world axis, falling back to the module default. */
function presetSize(moduleId, axis, term = currentTerm()) {
  if (bunkMode()) return axis === "y" ? BUNK_RULES.DEPTH_DEFAULT_MM.value : axis === "z" ? BUNK_RULES.DECK_TOP_DEFAULT_MM.value : bunkLength();
  const k = term[axis];
  const p = getPreset(moduleId)[k];
  if (p != null) return p;
  const d = getModule(moduleId).defaultSize;
  return k === "D" ? d.D + FRONT_THICKNESS_DEFAULT : d[k];
}

// --- ceiling-hung placement (Overhead) ------------------------------------------------
//
// The anchor is a feature point where the flat ceiling meets a solid: a space
// wall, a cabinet's outer box, or a partition (extended up to the roof). That
// face is the cabinet's back, W runs along it, the doors face the room and the
// top stays on the ceiling (the box can only grow down). Three faces may hold
// the 2D rectangle: the ceiling (W×D, pull H down), the back face (W×H, pull D
// into the room) or a face perpendicular to it — the adjacent wall at a corner
// or a neighbour's side (D×H, pull W along the wall).

function ceilingMode() {
  return !!S.placing && getModule(S.placing).placement === "ceiling";
}
function ceilingFace() {
  return facePlanes().find((f) => f.source === "space" && f.axis === "z" && f.dir < 0) || null;
}
/** Solids the point lies on: space walls, plus a cabinet's outer box or a partition. { axis, value, dir (into the room), label }. */
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
  for (const f of facesOnPoint(p)) {
    if (f.axis === "z" || f.source === "space") continue;
    if (out.some((w) => w.axis === f.axis && Math.abs(w.value - f.value) < 0.5 && w.dir === f.dir)) continue;
    out.push({ axis: f.axis, value: f.value, dir: f.dir, label: f.label });
  }
  return out;
}
/** On the flat ceiling and on at least one wall, cabinet box, or partition. */
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
  if (!S.rb || !ceilingMode()) return;
  const wall = backWallFor(S.rb.walls, S.rb.plane);
  S.rb.term = termFor(wall);
  S.rb.backWall = wall;
  setDimNames(DIM_ORDER.map((k) => S.rb.term[AXIS_OF[k]]));
}
/** Door side of a finished overhead box: away from its back wall. */
function ceilingSide(b, walls, plane) {
  const wall = backWallFor(walls, plane, b) || walls[0];
  return wall ? { axis: wall.axis, dir: wall.dir, wall: wall.label } : defaultSide(b);
}

/** Room from a point to the space boundary along each axis, both ways. */
export function roomFrom(p) {
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
  const mod = getModule(S.placing);
  const min = minSizes(mod);
  const { anchor, plane, locked } = S.rb;
  const room = roomFrom(anchor);
  const sp = job.getSpace();
  const clamped = {};
  const size = {};
  const sign = {};
  const max = {};

  for (const a of inPlaneAxes(plane.axis)) {
    const k = DIM_OF[a];
    const raw = S.rb.corner[a];
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
  if (bunkMode() && size.x >= bunkLength() - 0.5) delete clamped.W; // wall to wall is the rule, not a stop

  // Extrusion: only away from the face's solid.
  const n = plane.axis;
  const kn = DIM_OF[n];
  const s = plane.dir;
  const roomN = s > 0 ? room[n].pos : room[n].neg;
  let len = locked[kn] ?? (S.rb.ext ? S.rb.ext.len : 0);
  if (len > roomN) { len = roomN; clamped[kn] = WALL_NAME[n][s > 0 ? 1 : 0]; }
  size[n] = len;
  sign[n] = s;
  max[kn] = roomN;

  // Other cabinets are solid: the rectangle and the extrusion stop at them.
  // While drawing the rectangle its two sizes are clamped; once it is clicked only the pull is.
  const blocked = stopAtCabinets(anchor, size, sign, n, S.rb.step === "face" ? inPlaneAxes(n) : [n]);
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
export function stopAtCabinets(anchor, size, sign, n, order) {
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

export function updatePlacement(tipAt) {
  if (tipAt) S.rb.lastClient = { x: tipAt.clientX, y: tipAt.clientY };
  const b = placementBox();
  const clampedKeys = Object.keys(b.clamped);
  const n = S.rb.plane.axis;
  // Step "face": a zero-thickness rectangle; step "extrude": the box.
  showGhost(b.x0, b.y0, b.z0, b.W, b.D, b.H, { clamped: clampedKeys.length > 0 });
  for (const k of DIM_ORDER) {
    if (document.activeElement !== dimInputs[k]) dimInputs[k].value = Math.round(b[k]);
    dimLabels[k].classList.toggle("locked", S.rb.locked[k] != null);
    dimLabels[k].classList.toggle("hidden", S.rb.step === "face" && AXIS_OF[k] === n);
  }
  positionDimInputs(b);
  if (tipAt) {
    const lines = [...(tipAt.tip || [])];
    for (const k of clampedKeys) lines.push(`${k} stopped at ${b.clamped[k]}`);
    for (const k of DIM_ORDER) if (S.rb.locked[k] != null) lines.push(`${k} locked ${Math.round(S.rb.locked[k])}`);
    const term = currentTerm();
    if (S.rb.backWall) lines.push(`Back on the ${S.rb.backWall.label.toLowerCase()} · W along it · doors toward the room`);
    if (S.rb.step === "face") lines.push(`Enter: create with ${term[n]} ${Math.round(presetSize(S.placing, n))} (preset)`);
    else if (S.rb.ext && S.rb.ext.len <= 0 && S.rb.locked[DIM_OF[n]] == null) lines.push(`Pull ${term[n]} ${S.rb.plane.dir > 0 ? "+" : "−"}${n.toUpperCase()} · Enter uses preset ${Math.round(presetSize(S.placing, n))}`);
    showTip(tipAt.clientX, tipAt.clientY, lines, clampedKeys.length || (tipAt.tone === "warn") ? "warn" : Object.values(S.rb.locked).some((v) => v != null) ? "lock" : "");
  }
  if (bunkMode()) showBunkLower(b);
}

/** Put each type-in next to the middle of its edge — interact/shared.js exports positionDimInputs / setDimNames. */

function planeOf(face) {
  return { axis: face.axis, value: face.value, dir: face.dir, label: face.label, source: face.source };
}

function beginFace(p) {
  const ceiling = ceilingMode();
  const face = ceiling ? (p.face || ceilingFace()) : drawableOn(p.face || floorFace());
  const preset = getPreset(S.placing);
  const plane = planeOf(face);
  S.rb = {
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
  if (S.rb.locked[DIM_OF[plane.axis]] != null) S.rb.locked[DIM_OF[plane.axis]] = null; // extrusion is drawn, not preset-locked
  S.rb.presetLocks = { ...rb.locked };
  setDimNames(["W", "D", "H"]);
  if (ceiling) {
    // Presets are in module terms; re-key them to the world axes once the wall is known.
    applyCeilingTerm();
    S.rb.locked = { W: null, D: null, H: null };
    for (const a of AXES) if (a !== plane.axis && S.rb.term[a] !== "H") S.rb.locked[DIM_OF[a]] = preset[S.rb.term[a]] ?? null;
    S.rb.presetLocks = { ...rb.locked };
  }
  if (bunkMode()) {
    // Wall to wall: the length is never drawn. Depth and deck top are, one click each.
    S.rb.locked = { W: bunkLength(), D: null, H: null };
    S.rb.presetLocks = { ...rb.locked };
    setDimNames(["Length", "Depth", "Deck top"]);
  }
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked");
  showFaceHint(face);
  clearTrace();
  log("place.anchor", { moduleId: S.placing, anchor: S.rb.anchor, feature: !!p.feature, plane: { axis: plane.axis, value: plane.value, dir: plane.dir, label: plane.label }, walls: ceiling ? S.rb.walls.map((w) => w.label) : undefined, term: S.rb.term || undefined });
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
  if (!S.rb.candidates) return;
  const a = toClient(S.rb.anchor.x, S.rb.anchor.y, S.rb.anchor.z);
  const away = Math.hypot(e.clientX - a.x, e.clientY - a.y);
  if (away < 6) return;
  const ray = rayFromClient(e.clientX, e.clientY);
  const pool = S.rb.candidates.filter((f) => faceVisible(f, ray));
  if (!pool.length) return;

  let face = null;
  const inf = nearestInference(e.clientX, e.clientY, S.rb.ctx.anchorPoint, { band: INFER_RELEASE_PX * uiScale() });
  if (inf) {
    const along = pool.filter((f) => Math.abs(inf.dir[AXES.indexOf(f.axis)]) < 1e-6);
    if (along.length === 1) face = along[0];
    else if (along.length > 1) {
      face = faceBesideEdge(e.clientX, e.clientY, a, inf.dir, along)
        || along.find((f) => f.axis === S.rb.plane.axis && f.value === S.rb.plane.value && f.dir === S.rb.plane.dir)
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
  if (!face || (face.axis === S.rb.plane.axis && face.value === S.rb.plane.value && face.dir === S.rb.plane.dir)) return;
  S.rb.plane = planeOf(face);
  S.rb.ctx.plane = { axis: face.axis, value: face.value, label: face.label };
  S.rb.ctx.inference = null;
  S.rb.ctx.lastPoint = null;
  if (ceilingMode()) {
    applyCeilingTerm();
    const preset = getPreset(S.placing);
    S.rb.locked = { W: null, D: null, H: null };
    for (const a of AXES) if (a !== face.axis && S.rb.term[a] !== "H") S.rb.locked[DIM_OF[a]] = preset[S.rb.term[a]] ?? null;
    S.rb.presetLocks = { ...rb.locked };
  } else {
    S.rb.locked = { ...rb.presetLocks };
    if (!bunkMode()) S.rb.locked[DIM_OF[face.axis]] = null;
  }
  showFaceHint(face);
  log("place.face", { moduleId: S.placing, plane: { axis: face.axis, value: face.value, dir: face.dir, label: face.label }, term: S.rb.term || undefined });
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
    const sign = mid >= S.rb.anchor[into] ? 1 : -1;
    const probe = { ...rb.anchor, [into]: S.rb.anchor[into] + sign * 400 };
    const end = { ...rb.anchor, [edgeAxis]: S.rb.anchor[edgeAxis] + (dir[AXES.indexOf(edgeAxis)] >= 0 ? 400 : -400) };
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
  const drawn = ceilingMode() ? S.rb.plane : drawableOn(S.rb.plane);
  if (drawn.dir !== S.rb.plane.dir || drawn.label !== S.rb.plane.label) {
    S.rb.plane = planeOf(drawn);
    S.rb.ctx.plane = { axis: drawn.axis, value: drawn.value, label: drawn.label };
  }
  const { plane } = S.rb;
  const n = plane.axis;
  // Bake the rectangle as drawn (clamped by walls and cabinets): the pull starts from its real corner.
  const b0 = placementBox();
  for (const a of inPlaneAxes(n)) S.rb.corner[a] = S.rb.anchor[a] + b0.sign[a] * b0.size[a];
  const corner = S.rb.corner;
  const dirV = axisVector(n, plane.dir);
  S.rb.step = "extrude";
  S.rb.ext = {
    t0: closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(corner.x, corner.y, corner.z), new THREE.Vector3(dirV[0], dirV[1], dirV[2])),
    len: 0, label: null,
  };
  hideInference();
  hideAlignLines();
  hideSnapMarker();
  log("place.corner", { moduleId: S.placing, corner, plane: { axis: n, value: plane.value }, locked: S.rb.locked });
  updatePlacement({ clientX: e.clientX, clientY: e.clientY, tip: [] });
  emitMode();
}

function extrudeCursor(e) {
  const { corner, plane, ext } = S.rb;
  const n = plane.axis;
  if (bunkMode() && S.rb.locked[DIM_OF[n]] != null) return { tip: [`Length ${Math.round(S.rb.locked[DIM_OF[n]])} wall to wall — click or Enter confirms the lower box`] };
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
  const mod = getModule(S.placing);
  flushTrace("place.trace");
  // The box is the envelope; the door side decides which edge is W and where the origin (front carcass face) sits.
  const fit = fitBoxFacing(b, side, FRONT_THICKNESS_DEFAULT);
  log("place.finish", {
    moduleId: S.placing, how,
    anchor: S.rb ? S.rb.anchor : null, corner: S.rb ? S.rb.corner : null, locked: S.rb ? S.rb.locked : null,
    plane: S.rb ? { axis: S.rb.plane.axis, value: S.rb.plane.value, dir: S.rb.plane.dir, label: S.rb.plane.label } : null,
    extrude: S.rb && S.rb.ext ? { len: S.rb.ext.len, label: S.rb.ext.label } : null,
    clamped: b.clamped, box: { x0: b.x0, y0: b.y0, z0: b.z0, W: b.W, D: b.D, H: b.H },
    side: { axis: side.axis, dir: side.dir }, wall: side.wall, size: { W: fit.W, D: fit.D, H: fit.H }, pose: fit.pose,
  });
  // The first click is a corner of the drawn box: remember which one, in the cabinet frame.
  const corner = S.rb && S.rb.anchor
    ? cornerOf({ x0: 0, x1: fit.W, y0: -FRONT_THICKNESS_DEFAULT, y1: fit.D, z0: 0, z1: fit.H }, localOf(fit.pose, [S.rb.anchor.x, S.rb.anchor.y, S.rb.anchor.z]))
    : null;
  const cab = job.addCabinet(
    S.placing,
    fit.pose,
    { W: fit.W, D: Math.max(mod.minSize.D, fit.D), H: fit.H },
    { history: true, corner },
  );
  lastSize = { moduleId: S.placing, W: b.W, D: b.D, H: b.H };
  S.lastCreated = cab.id;
  S.rb = null;
  clearPreview();
  if (!poseFits(cab, cab.pose)) {
    log("place.unfit", { id: cab.id, pose: cab.pose });
    console.warn("[place]", cab.id, "does not fit the space; see Checks");
  }
  // Stay armed: the next click starts another box of the same module.
  emitMode();
}

function faceDrawn() {
  const [u, v] = inPlaneAxes(S.rb.plane.axis);
  return S.rb.locked[DIM_OF[u]] != null || S.rb.locked[DIM_OF[v]] != null
    || Math.abs(S.rb.corner[u] - S.rb.anchor[u]) >= 1 || Math.abs(S.rb.corner[v] - S.rb.anchor[v]) >= 1;
}

/** Enter / click: create. A zero extrusion takes the preset size along the normal. */
function finishPlacement(how) {
  if (!S.rb || !faceDrawn()) return;
  const n = S.rb.plane.axis;
  const kn = DIM_OF[n];
  if (S.rb.locked[kn] == null && !(S.rb.ext && S.rb.ext.len > 0)) {
    S.rb.ext = S.rb.ext || { t0: 0, len: 0, label: null };
    S.rb.ext.len = Math.max(minSizes(getModule(S.placing))[kn], presetSize(S.placing, n));
    how += ".preset";
  }
  const b = placementBox();
  for (const f of finishHooks) if (f(b, how)) return;
  if (bunkMode()) { beginBunkUpper(b, how); return; }
  // Minimums in module terms: W/D depend on which side gets the doors.
  const mod = getModule(S.placing);
  const side = ceilingMode() ? ceilingSide(b, S.rb.walls, S.rb.plane) : defaultSide(b);
  const fit = fitBoxFacing(b, side, FRONT_THICKNESS_DEFAULT);
  const small = DIM_ORDER.filter((k) => fit[k] < mod.minSize[k]);
  if (small.length) {
    log("place.blocked", { reason: "below minimum size", dims: small, clamped: b.clamped, box: b, fit });
    showTip(S.rb.lastClient ? S.rb.lastClient.x : 0, S.rb.lastClient ? S.rb.lastClient.y : 0, [`No room: ${small.map((k) => `${k} ${Math.round(fit[k])} < ${mod.minSize[k]}`).join(", ")}`], "warn");
    return;
  }
  createFromBox(b, how, side);
}

/** Shift+click: repeat the last size at this anchor, growing toward the side with room. */
function repeatLastSize(anchor) {
  if (!lastSize || lastSize.moduleId !== S.placing) return false;
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
  log("place.repeat", { moduleId: S.placing, anchor: { x: anchor.x, y: anchor.y, z: anchor.z }, size: lastSize, clamped });
  const b = {
    x0: sx > 0 ? anchor.x : anchor.x - W, y0: sy > 0 ? anchor.y : anchor.y - D, z0: sz > 0 ? anchor.z : anchor.z - H,
    W, D, H, clamped,
  };
  createFromBox(b, "repeat", ceilingMode() ? ceilingSide(b, wallsAt(anchor), null) : defaultSide(b));
  return true;
}

function cancelPlacement() {
  if (!S.rb) return;
  flushTrace("place.trace");
  log("place.cancel", { moduleId: S.placing, step: S.rb.step, anchor: S.rb.anchor, corner: S.rb.corner });
  S.rb = null;
  clearPreview();
  canvas.focus?.();
  emitMode();
}

// --- bunk bed across the rear -------------------------------------------------------
//
//   armed    only the two floor corners at the rear wall snap (nothing may stand along it)
//   face     the lower box's rectangle on the floor, the rear wall or the side wall · the
//            length is locked wall to wall, so the cursor only sets depth and / or deck top
//   extrude  the pull · on the side wall there is nothing left to pull, the click confirms
//   upper    same footprint; the upper base's underside follows the cursor up and down,
//            snaps where both bunks get the same clear height · click / Enter creates
// While depth or deck top is live, the front partition and the deck are drawn and the two
// numbers the user thinks in sit on either side of the cursor (mattress | depth, boot | deck top).

const bunkRound = (v) => Math.round(v * 10) / 10;

function bunkMode() {
  return !!S.placing && getModule(S.placing).placement === "bunk";
}
function bunkLength() {
  const sp = job.getSpace();
  return sp ? sp.bounds.maxX - sp.bounds.minX : 0;
}
/** Front partition thickness: the job's partition stock, which a new bunk copies. */
function bunkPartitionT() {
  return job.getStock()?.partition?.thickness ?? BUNK_RULES.PARTITION_THICKNESS_DEFAULT_MM.value;
}
/** A floor corner where the rear (back) wall meets a side wall. */
function onBunkCorner(p) {
  const sp = job.getSpace();
  if (!sp || Math.abs(p.z) > 0.5) return false;
  const b = sp.bounds;
  const walls = new Set(sp.walls || []);
  if (!walls.has(2) || Math.abs(p.y - b.maxY) > 0.5) return false;
  return (walls.has(3) && Math.abs(p.x - b.minX) < 0.5) || (walls.has(1) && Math.abs(p.x - b.maxX) < 0.5);
}
/** Faces through a rear corner the lower box may be drawn on: the floor, the rear wall, the side wall. */
function bunkFace(f) {
  return f.source === "space" && (f.axis !== "z" || f.dir > 0);
}
/** Id of a solid standing along the rear wall within the shallowest bunk depth, or null. */
function bunkLaneBlocker() {
  const sp = job.getSpace();
  if (!sp) return null;
  const y0 = sp.bounds.maxY - BUNK_RULES.DEPTH_MIN_MM.value;
  for (const o of solidBoxes()) {
    if (o.y[1] > y0 + 0.5 && o.y[0] < sp.bounds.maxY - 0.5 && o.x[1] > sp.bounds.minX + 0.5 && o.x[0] < sp.bounds.maxX - 0.5 && o.z[0] < sp.height - 0.5) return o.id;
  }
  return null;
}

const bunkNotes = [0, 1].map(() => {
  const n = document.createElement("div");
  n.className = "bunk-note hidden";
  dimBox.parentElement.append(n);
  return n;
});
function hideBunkNotes() {
  for (const n of bunkNotes) n.classList.add("hidden");
}
/**
 * Two read-outs beside the cursor, one each way along a world axis as it runs on screen:
 * `toward` on the side world `sign`·`axis` points to, `away` on the other side.
 * Both are shifted up / left so the cursor tip (down / right) stays clear.
 */
function showBunkNotes(clientX, clientY, at, axis, sign, toward, away) {
  const r = canvas.getBoundingClientRect();
  const p0 = toClient(at.x, at.y, at.z);
  const q = { ...at, [axis]: at[axis] + sign * 100 };
  const p1 = toClient(q.x, q.y, q.z);
  let dx = p1.x - p0.x;
  let dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (p0.behind || p1.behind || len < 1) { dx = 0; dy = -1; } else { dx /= len; dy /= len; }
  let px = -dy;
  let py = dx;
  if (px + py > 0) { px = -px; py = -py; }
  const d = 64 * uiScale();
  const s = 28 * uiScale();
  [[toward, 1], [away, -1]].forEach(([text, k], i) => {
    const n = bunkNotes[i];
    n.textContent = text;
    n.style.left = `${clientX - r.left + k * dx * d + px * s}px`;
    n.style.top = `${clientY - r.top + k * dy * d + py * s}px`;
    n.classList.remove("hidden");
  });
}

/** Lower box preview: the front partition on its room face, the deck on its top, and the numbers beside the cursor. */
function showBunkLower(b) {
  const T = bunkPartitionT();
  const deck = BUNK_RULES.DECK_THICKNESS_MM.value;
  const x1 = b.x0 + b.W;
  const y1 = b.y0 + b.D;
  showLoungeGhost([
    null,
    { x0: b.x0, x1, y0: b.y0, y1: b.y0 + Math.min(T, b.D), z0: b.z0, z1: b.z0 + Math.max(b.H, 1) },
    b.H > deck ? { x0: b.x0, x1, y0: b.y0, y1, z0: b.z0 + b.H - deck, z1: b.z0 + b.H } : null,
  ]);
  const at = S.rb.lastClient;
  if (!at) { hideBunkNotes(); return; }
  const n = S.rb.plane.axis;
  const live = (S.rb.step === "face" ? inPlaneAxes(n) : [n]).filter((a) => a !== "x");
  const mattress = `Mattress ${bunkRound(b.D - T)}`;
  const depth = `Depth ${bunkRound(b.D)}`;
  const boot = `Boot ${bunkRound(b.H - deck)}`;
  const top = `Deck top ${bunkRound(b.H)}`;
  const mid = { x: b.x0 + b.W / 2, y: b.y0, z: b.z0 + b.H / 2 };
  if (live.length === 1 && live[0] === "z") showBunkNotes(at.x, at.y, mid, "z", -1, boot, top);
  else if (live.length === 1) showBunkNotes(at.x, at.y, mid, "y", 1, mattress, depth);
  else showBunkNotes(at.x, at.y, mid, "y", 1, `${mattress} · ${boot}`, `${depth} · ${top}`);
}

/** The lower box is drawn: check it, then the upper base's height follows the cursor. */
function beginBunkUpper(b, how) {
  const sp = job.getSpace();
  const at = S.rb.lastClient;
  const box = { x0: b.x0, y0: b.y0, z0: b.z0, W: b.W, D: b.D, H: b.H };
  const refuse = (reason, lines, extra = {}) => {
    log("place.blocked", { moduleId: S.placing, reason, box, clamped: b.clamped, ...extra });
    if (at) showTip(at.x, at.y, lines, "warn");
  };
  const L = bunkLength();
  if (b.W < L - 0.5) {
    refuse("not wall to wall", [`Length ${Math.round(b.W)} of ${Math.round(L)}`, b.clamped.W ? `Stopped at ${b.clamped.W}` : "A bunk bed runs wall to wall"]);
    return;
  }
  const min = minSizes(getModule(S.placing));
  const small = ["W", "D", "H"].filter((k) => b[k] < min[k] - 0.05);
  if (small.length) {
    refuse("below minimum size", [`No room: ${small.map((k) => `${k === "H" ? "deck top" : k === "D" ? "depth" : "length"} ${Math.round(b[k])} < ${min[k]}`).join(", ")}`], { dims: small });
    return;
  }
  const top = bunkRound(minClearHeight(sp, b.y0, b.y0 + b.D) - (job.getStock()?.partition?.ceilingClearance ?? 0));
  const lim = bunkUpperLimits({ deckTop: b.H, height: top });
  if (lim.max < lim.min) {
    const need = 2 * BUNK_RULES.BUNK_CLEAR_MIN_MM.value + BUNK_RULES.UPPER_BASE_THICKNESS_MM.value;
    refuse("no room for two bunks", [`Deck top ${bunkRound(b.H)} · Bunk top ${top}`, `Two bunks need ${need} between them — lower the deck`], { top, limits: lim });
    return;
  }
  flushTrace("place.trace");
  log("bunk.box", {
    how, anchor: S.rb.anchor, corner: S.rb.corner, locked: S.rb.locked,
    plane: { axis: S.rb.plane.axis, value: S.rb.plane.value, dir: S.rb.plane.dir, label: S.rb.plane.label },
    extrude: S.rb.ext ? { len: S.rb.ext.len, label: S.rb.ext.label } : null,
    clamped: b.clamped, box, top, limits: lim,
  });
  S.bunk = { box, rb: S.rb, top, lim, z: lim.equal, locked: null, snap: "equal", clamped: null, moved: false, lastClient: at ? { clientX: at.x, clientY: at.y } : null };
  S.rb = null;
  clearPreview();
  setDimNames(["W", "D", "Underside"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) {
    dimLabels[k].classList.remove("focused", "locked");
    dimLabels[k].classList.toggle("hidden", k !== "H");
  }
  emitMode();
  updateBunk(null);
}

/** Cursor → upper base underside: along the vertical through the room face, snapped to equal clear heights, held in range. */
function bunkUpperZ(e) {
  const { box, lim } = S.bunk;
  let z = S.bunk.locked != null ? S.bunk.locked : S.bunk.z;
  let snap = S.bunk.locked != null ? null : S.bunk.snap;
  if (e) {
    const ray = rayFromClient(e.clientX, e.clientY);
    if (Math.abs(ray.direction.z) <= 0.985) {
      const raw = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(box.x0 + box.W / 2, box.y0, 0), new THREE.Vector3(0, 0, 1));
      // A typed height holds until the cursor actually leaves it.
      if (S.bunk.locked == null || Math.abs(raw - S.bunk.locked) > 40) {
        S.bunk.locked = null;
        S.bunk.moved = true;
        if (Math.abs(raw - lim.equal) <= 40) { z = lim.equal; snap = "equal"; } else { z = job.snap(raw); snap = null; }
      }
    }
  }
  let clamped = null;
  const clear = BUNK_RULES.BUNK_CLEAR_MIN_MM.value;
  if (z < lim.min) { z = lim.min; clamped = `lower bunk minimum ${clear}`; snap = null; }
  if (z > lim.max) { z = lim.max; clamped = `upper bunk minimum ${clear}`; snap = null; }
  S.bunk.z = z;
  S.bunk.snap = snap;
  S.bunk.clamped = clamped;
}

function bunkDimBox() {
  const { box, z } = S.bunk;
  return { x0: box.x0, y0: box.y0, z0: z, W: box.W, D: box.D, H: BUNK_RULES.UPPER_BASE_THICKNESS_MM.value };
}

function updateBunk(e) {
  if (!S.bunk) return;
  if (e) S.bunk.lastClient = e;
  bunkUpperZ(e);
  const { box, top, z } = S.bunk;
  const up = BUNK_RULES.UPPER_BASE_THICKNESS_MM.value;
  const T = bunkPartitionT();
  const x1 = box.x0 + box.W;
  const y1 = box.y0 + box.D;
  showGhost(box.x0, box.y0, 0, box.W, box.D, top, { clamped: !!S.bunk.clamped });
  showLoungeGhost([
    { x0: box.x0, x1, y0: box.y0, y1, z0: 0, z1: box.H },
    { x0: box.x0, x1, y0: box.y0, y1, z0: z, z1: z + up },
    { x0: box.x0, x1, y0: box.y0, y1: box.y0 + T, z0: 0, z1: top },
  ]);
  if (S.bunk.snap) showSnapMarker(box.x0 + box.W / 2, box.y0, z, { feature: true });
  else hideSnapMarker();
  if (document.activeElement !== dimInputs.H) dimInputs.H.value = String(bunkRound(z));
  dimLabels.H.classList.toggle("locked", S.bunk.locked != null);
  positionDimInputs(bunkDimBox());
  const ev = e || S.bunk.lastClient;
  if (!ev) return;
  showBunkNotes(ev.clientX, ev.clientY, { x: box.x0 + box.W / 2, y: box.y0, z }, "z", -1,
    `Lower bunk ${bunkRound(z - box.H)} clear`, `Upper bunk ${bunkRound(top - z - up)} clear`);
  showTip(ev.clientX, ev.clientY, [
    `Upper base underside ${bunkRound(z)}`,
    S.bunk.snap === "equal" ? "= both bunks the same clear height" : null,
    S.bunk.clamped ? `Stopped at ${S.bunk.clamped}` : null,
    S.bunk.locked != null ? `Locked ${bunkRound(S.bunk.locked)}` : "Tab types the underside",
    "click or Enter creates · Esc: back to the lower box",
  ], S.bunk.clamped ? "warn" : S.bunk.locked != null ? "lock" : "");
}

function finishBunk(how) {
  if (!S.bunk) return;
  if (how === "enter" && !S.bunk.moved && S.bunk.locked == null) how = "enter.default";
  bunkUpperZ(null);
  const { box, top, z, rb: drawn } = S.bunk;
  const env = { x0: box.x0, y0: box.y0, z0: 0, W: box.W, D: box.D, H: top };
  const front = { axis: "y", dir: -1 }; // away from the rear wall
  const fit = fitBoxFacing(env, front, 0);
  const pose = { ...fit.pose, x: bunkRound(fit.pose.x), y: bunkRound(fit.pose.y), z: bunkRound(fit.pose.z) };
  const params = { length: bunkRound(fit.W), depth: bunkRound(fit.D), height: top, deckTop: bunkRound(box.H), upperZ: bunkRound(z), endSide: "RIGHT" };
  const corner = drawn && drawn.anchor
    ? cornerOf({ x0: 0, x1: fit.W, y0: 0, y1: fit.D, z0: 0, z1: top }, localOf(pose, [drawn.anchor.x, drawn.anchor.y, drawn.anchor.z]))
    : null;
  const up = BUNK_RULES.UPPER_BASE_THICKNESS_MM.value;
  const cab = job.addCabinet(S.placing, pose, { W: params.length, D: params.depth, H: params.height }, { history: true, params, corner });
  log("bunk.finish", {
    id: cab.id, how, box, top, upperZ: params.upperZ,
    clear: { lower: bunkRound(z - box.H), upper: bunkRound(top - z - up) },
    snap: S.bunk.snap, locked: S.bunk.locked, clamped: S.bunk.clamped, params, pose,
  });
  if (!poseFits(cab, cab.pose)) log("place.unfit", { id: cab.id, pose: cab.pose });
  S.bunk = null;
  // Done: one bunk per rear wall, so the tool does not wait for another one. The new bunk stays selected.
  disarm();
}

/** Esc in the upper step: back to the lower box, at the step it was finished from (Enter may have skipped the pull). */
function bunkBack() {
  if (!S.bunk) return;
  S.rb = S.bunk.rb;
  if (S.rb.step === "face") S.rb.ext = null; // the preset pull Enter added is not the user's
  const at = S.bunk.lastClient;
  S.bunk = null;
  clearPreview();
  setDimNames(["Length", "Depth", "Deck top"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "hidden");
  log("bunk.back", { step: S.rb.step });
  emitMode();
  updatePlacement(at ? { clientX: at.clientX, clientY: at.clientY, tip: [] } : null);
}

function hoverArmed(e, prefix) {
  const p = cursorPoint(e.clientX, e.clientY);
  if (!p) { hideSnapMarker(); hideFaceHint(); hideAlignLines(); hideTip(); return; }
  if (p.none) { hideSnapMarker(); hideFaceHint(); hideAlignLines(); showTip(e.clientX, e.clientY, p.tip, "warn"); return; }
  showSnapMarker(p.x, p.y, p.z, { feature: p.feature });
  if (p.alignSegs && p.alignSegs.length) showAlignLines(p.alignSegs); else hideAlignLines();
  if (p.face) showFaceHint(p.face); else hideFaceHint();
  const lines = [...(prefix ? [prefix] : []), ...p.tip];
  if (S.placing && !S.lshape && lastSize && lastSize.moduleId === S.placing) lines.push(`Shift+click: repeat ${lastSize.W}×${lastSize.D}×${lastSize.H}`);
  showTip(e.clientX, e.clientY, lines);
}


// --- arm / disarm ------------------------------------------------------------------

function placementTeardown() {
  S.placing = null;
  S.rb = null;
  S.lshape = null;
  S.bunk = null;
  S.lastCreated = null;
}

/** Arm placement for a module (nose / bedBox placements route to their own modes). */
export function armPlacement(moduleId) {
  if (!job.hasSpace()) { log("place.arm.blocked", { moduleId, reason: "no space" }); return; }
  cancelBoard("tool off");
  endResize("tool off");
  endGroove("tool off");
  cancelMeasure("tool off");
  if (getModule(moduleId).placement === "nose") { startNose(moduleId); return; }
  if (getModule(moduleId).placement === "bedBox" || getModule(moduleId).placement === "bedSide") { startBedBox(moduleId); return; }
  stopAll();
  host.stopResidents?.();
  if (S.bunk) clearPreview();
  S.placing = moduleId;
  S.rb = null;
  S.lshape = null;
  S.bunk = null;
  S.lastCreated = null;
  log("place.arm", { moduleId });
  job.select(null);
  canvas.style.cursor = "crosshair";
  emitMode();
}

export function disarm() {
  cancelMeasure("tool off");
  if (noseActive()) { cancelNose(); return; }
  if (bedActive()) { cancelBedBox(); return; }
  if (S.lounge) { host.stopResidents?.(); return; }
  if (planeActive()) { cancelPlane(); return; }
  if (S.placing) log("place.disarm", { moduleId: S.placing, step: S.rb ? S.rb.step : S.bunk ? "bunk.upper" : S.lshape ? `lounge.${S.lshape.step}` : null });
  clearTrace();
  endRetype(false);
  placementTeardown();
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}

// --- mode ---------------------------------------------------------------------------

export const MODE = {
  mode: () => (S.bunk ? "bunk.upper" : S.rb ? S.rb.step : S.placing ? "armed" : null),
  typing: () => !!(S.rb || S.bunk),
  dims: () => ({
    typable: () => {
      if (S.bunk) return ["H"];
      if (S.rb && S.rb.step === "face") return DIM_ORDER.filter((k) => AXIS_OF[k] !== S.rb.plane.axis && !(bunkMode() && k === "W"));
      if (S.rb && bunkMode()) return DIM_ORDER.filter((k) => k !== "W");
      return DIM_ORDER;
    },
    current: (k) => {
      if (S.bunk) return k === "H" ? S.bunk.z : 0;
      if (S.rb) return placementBox()[k];
      return 0;
    },
    max: (k) => {
      if (S.bunk) return k === "H" ? S.bunk.lim.max : null;
      if (S.rb) return placementBox().max[k];
      return null;
    },
    set: (k, v) => {
      if (S.bunk) {
        if (k !== "H") return;
        S.bunk.locked = v != null && v > 0 ? v : null;
        log("bunk.typein", { dim: "upperZ", value: dimInputs.H.value, locked: S.bunk.locked });
        updateBunk(null);
      } else if (S.rb) {
        if (bunkMode() && k === "W") return; // wall to wall
        const min = minSizes(getModule(S.placing))[k];
        S.rb.locked[k] = v != null && v >= min ? v : null;
        log("place.typein", { dim: k, value: dimInputs[k].value, locked: S.rb.locked[k] });
        updatePlacement(null);
      }
    },
  }),
  down(e) {
    if (S.bunk) { updateBunk(e); finishBunk("click"); return true; }
    if (!S.placing) return false;
    if (!S.rb) {
      const p = cursorPoint(e.clientX, e.clientY);
      if (!p) return true;
      if (p.none) { log("place.blocked", { moduleId: S.placing, reason: p.reason || "not on a ceiling edge", blockedBy: p.blockedBy }); return true; }
      if (e.shiftKey && !S.lshape && !bunkMode() && repeatLastSize(p)) return true;
      beginFace(p);
    } else if (S.rb.step === "face") {
      if (!faceDrawn()) return true; // a second click on the anchor is a no-op
      S.rb.candidates = null; // the face is settled by the second click
      if (S.rb.locked[DIM_OF[S.rb.plane.axis]] != null && !bunkMode()) finishPlacement("click.locked");
      else beginExtrude(e);
    } else {
      finishPlacement("click");
    }
    return true;
  },
  hover(e) {
    if (S.bunk) { updateBunk(e); return true; }
    if (!S.placing) return false;
    if (!S.rb) return hoverArmed(e, S.lshape ? `Lounge ${S.lshape.style} · ${S.lshape.style === "L" ? "main box" : "the whole box"} first` : null);
    if (S.rb.step === "face") {
      chooseFace(e);
      const p = resolveCursor(e, S.rb.ctx);
      if (!p) return true;
      S.rb.corner = { x: p.x, y: p.y, z: p.z };
      traceSample({ cx: Math.round(e.clientX), cy: Math.round(e.clientY), x: Math.round(p.x), y: Math.round(p.y), z: Math.round(p.z), kind: p.kind, dir: p.inference ? p.inference.dir : undefined, shift: e.shiftKey || undefined });
      drawResolved(p);
      updatePlacement({ clientX: e.clientX, clientY: e.clientY, tip: p.tip });
    } else {
      const r = extrudeCursor(e);
      traceSample({ cx: Math.round(e.clientX), cy: Math.round(e.clientY), len: Math.round(S.rb.ext.len), kind: S.rb.ext.label ? "extrude.snap" : "extrude", label: S.rb.ext.label || undefined });
      updatePlacement({ clientX: e.clientX, clientY: e.clientY, tip: r.tip, tone: r.tone });
    }
    return true;
  },
  confirm(how) {
    if (S.bunk) finishBunk(how);
    else if (S.rb) finishPlacement(how);
  },
  cancel() {
    if (S.bunk) bunkBack();
    else if (S.rb) cancelPlacement();
  },
  leave() {
    if (S.placing && !S.rb) { hideSnapMarker(); hideFaceHint(); hideTip(); }
    if (S.bunk || S.rb) hideBunkNotes();
  },
  tick() {
    if (S.rb) positionDimInputs(placementBox());
    else if (S.bunk) positionDimInputs(bunkDimBox());
  },
  stop() { placementTeardown(); clearPreview(); },
};

host.placingId = () => S.placing;
host.lshapeActive = () => S.lshape;
host.stopPlacement = () => { if (S.placing) disarm(); };
host.minSizeOf = (mod) => minSizes(mod);
host.presetSize = (moduleId, axis) => presetSize(moduleId, axis);
host.clearPlacement = () => { placementTeardown(); clearPreview(); };
resetHooks.push(() => hideBunkNotes());
registerMode(MODE);
