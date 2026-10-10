// @module interact @owns lounge run placement (I/L/U/parallel), wing, midCab
// Lounge placement family: floor-drawn runs (I / L / U), the L wing and the
// Parallel seat drawn on top of a placed box. The box step rides generic
// placement — it intercepts the box's completion through place.js's finish hook
// (lounge -> place only; place never imports this file).
import * as THREE from "three";
import { canvas, rayFromClient, closestTOnLine, floorPointAt } from "../space.js";
import * as job from "../job.js";
import { loungeFootprintBoxes, loungeFromDrawnRun } from "../gen/lounge.js";
import { showLoungeGhost, showSnapMarker, hideSnapMarker } from "../cabinets3d.js";
import { showTip, hideTip } from "../hud.js";
import { poseFits, fitBoxFacing, sideBlocked, rotZFacing, SIDES } from "../fit.js";
import { localOf, cornerOf } from "../pose.js";
import { toClient, axisVector } from "../snap.js";
import { log, flushTrace } from "../log.js";
import { cancelMeasure } from "../measureTool.js";
import { endRetype } from "./retype.js";
import { armPlacement, roomFrom, stopAtCabinets, registerFinishHook, WALL_NAME } from "./place.js";
import { cancelMove } from "./move.js";
import { cancelOrient } from "./orient.js";
import { cancelNose } from "./nose.js";
import { cancelBedBox } from "./bedBox.js";
import { cancelPlane } from "./cplane.js";
import {
  S, host, registerMode, stopAll, emitMode, clearPreview,
  dimBox, DIM_ORDER, dimInputs, dimLabels, positionDimInputs, setDimNames, L_MIN_BOX,
} from "./shared.js";

// Lounge family state lives on S (shared.js): S.lounge (floor-drawn) and
// S.lshape (box → wing/seat). S.rb / S.placing are owned by place.js.
// --- lounge placement (I / L / U on the floor) ------------------------------------

const LOUNGE_MIN = 50;

function freshLounge(style) {
  return {
    moduleId: "loungeGenerator", style, step: "corner",
    a: null, b: null, depth: null, roomSign: 1, side: null, wing: null,
    height: 420, locks: { W: null, D: null, H: null }, lastClient: null,
  };
}

export function startLounge(style) {
  if (!job.hasSpace()) { log("lounge.arm.blocked", { style, reason: "no space" }); return; }
  if (style === "L" || style === "I" || style === "Parallel") { startLoungeBox(style); return; }
  cancelMove();
  cancelOrient();
  cancelNose();
  cancelBedBox();
  if (S.lounge) cancelLounge();
  cancelPlane();
  cancelMeasure("tool off");
  endRetype(false);
  host.clearPlacement();
  S.lounge = freshLounge(style);
  clearPreview();
  job.select(null);
  canvas.style.cursor = "crosshair";
  log("lounge.arm", { style });
  emitMode();
}

export function cancelLounge() {
  if (!S.lounge) return;
  const s = S.lounge;
  S.lounge = null;
  log("lounge.cancel", { style: s.style, step: s.step });
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}

function loungeFloor(e) {
  if (!e) return null;
  const p = floorPointAt(e.clientX, e.clientY);
  if (!p) return null;
  return { x: job.snap(p.x), y: job.snap(p.y) };
}

/** Opposite corner of the plan face. Both edges count: the longer one is the back, the other is the depth. */
function loungeOpposite(pt) {
  if (!S.lounge.a || !pt) return null;
  const rawX = pt.x - S.lounge.a.x;
  const rawY = pt.y - S.lounge.a.y;
  const alongX = Math.abs(rawX) >= Math.abs(rawY);
  let len = alongX ? Math.abs(rawX) : Math.abs(rawY);
  let depth = alongX ? Math.abs(rawY) : Math.abs(rawX);
  if (S.lounge.locks.W != null) len = S.lounge.locks.W;
  if (S.lounge.locks.D != null) depth = S.lounge.locks.D;
  if (len < LOUNGE_MIN || depth < LOUNGE_MIN) return null;
  const sx = rawX >= 0 ? 1 : -1;
  const sy = rawY >= 0 ? 1 : -1;
  return alongX
    ? { x: job.snap(S.lounge.a.x + sx * len), y: job.snap(S.lounge.a.y + sy * depth) }
    : { x: job.snap(S.lounge.a.x + sx * depth), y: job.snap(S.lounge.a.y + sy * len) };
}

/** Back edge through the first corner, depth filling the rectangle, room on the rectangle's side. */
function loungeRun(a, opposite) {
  const dx = opposite.x - a.x;
  const dy = opposite.y - a.y;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx < LOUNGE_MIN || ady < LOUNGE_MIN) return null;
  if (adx >= ady) {
    const walkPos = dx >= 0;
    const roomPos = dy > 0;
    return { a, b: { x: opposite.x, y: a.y }, depth: ady, roomSign: walkPos === roomPos ? -1 : 1 };
  }
  const walkPos = dy >= 0;
  const roomPos = dx > 0;
  return { a, b: { x: a.x, y: opposite.y }, depth: adx, roomSign: walkPos === roomPos ? 1 : -1 };
}

function loungeBasis(a, b, sign) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  let ux = dx / len;
  let uy = dy / len;
  let rx = uy;
  let ry = -ux;
  let left = a;
  let right = b;
  if (sign < 0) {
    ux = -ux; uy = -uy; rx = -rx; ry = -ry;
    left = b; right = a;
  }
  return { len, ux, uy, rx, ry, left, right, sign };
}

function loungeDepthLive(pt) {
  if (!S.lounge.a || !S.lounge.b) return null;
  const dx = S.lounge.b.x - S.lounge.a.x;
  const dy = S.lounge.b.y - S.lounge.a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) return null;
  const rx = dy / len;
  const ry = -dx / len;
  let sign = S.lounge.roomSign || 1;
  if (pt) {
    const s = (pt.x - S.lounge.a.x) * rx + (pt.y - S.lounge.a.y) * ry;
    if (Math.abs(s) > 1) sign = s >= 0 ? 1 : -1;
  }
  if (S.lounge.step === "depth" && S.lounge.locks.D != null) return { depth: S.lounge.locks.D, roomSign: sign };
  if (S.lounge.step !== "depth" && S.lounge.depth != null) return { depth: S.lounge.depth, roomSign: S.lounge.roomSign || 1 };
  if (!pt) return null;
  const s = (pt.x - S.lounge.a.x) * rx + (pt.y - S.lounge.a.y) * ry;
  return { depth: Math.abs(s), roomSign: Math.abs(s) > 1 ? (s >= 0 ? 1 : -1) : sign };
}

function loungeSideAt(pt, basis) {
  if (!pt || !basis) return null;
  const dl = Math.hypot(pt.x - basis.left.x, pt.y - basis.left.y);
  const dr = Math.hypot(pt.x - basis.right.x, pt.y - basis.right.y);
  return dl <= dr ? "LEFT" : "RIGHT";
}

function loungeExtra(pt, basis, depth) {
  if (!basis || !(depth > 0)) return 0;
  if (S.lounge.style === "L" && !S.lounge.side) return 0;
  if (S.lounge.step === "height" && S.lounge.wing != null) return Math.max(0, S.lounge.wing - depth);
  if (S.lounge.step === "width" && S.lounge.locks.W != null) return Math.max(0, S.lounge.locks.W - depth);
  if (!pt) return 0;
  const along = (pt.x - basis.left.x) * basis.rx + (pt.y - basis.left.y) * basis.ry;
  return Math.max(0, along - depth);
}

function loungeHeightNow() {
  return Math.max(S.lounge.height || 420, LOUNGE_MIN);
}

function loungeHeightLive(e) {
  if (S.lounge.step === "height" && S.lounge.locks.H != null) return S.lounge.locks.H;
  if (!e || !S.lounge.a) return loungeHeightNow();
  const t = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(S.lounge.a.x, S.lounge.a.y, 0), new THREE.Vector3(0, 0, 1));
  const h = job.snap(Math.max(0, t));
  return h >= LOUNGE_MIN ? h : loungeHeightNow();
}

function loungeSpec(pt, e) {
  if (!S.lounge.a || !S.lounge.b) return null;
  const live = loungeDepthLive(pt);
  if (!live || !(live.depth >= 1)) return null;
  const basis = loungeBasis(S.lounge.a, S.lounge.b, live.roomSign);
  if (!basis) return null;
  const extra = S.lounge.style === "I" ? 0 : loungeExtra(pt, basis, live.depth);
  const wing = live.depth + extra;
  const height = loungeHeightNow();
  let placed;
  if (S.lounge.style === "L" && S.lounge.side && extra >= LOUNGE_MIN) {
    placed = loungeFromDrawnRun({
      a: S.lounge.a, b: S.lounge.b, depth: live.depth, roomSign: live.roomSign,
      style: "L", side: S.lounge.side, wing,
      height: Math.max(height, LOUNGE_MIN),
    });
  } else {
    placed = loungeFromDrawnRun({
      a: S.lounge.a, b: S.lounge.b, depth: live.depth, roomSign: live.roomSign, style: "I", height: Math.max(height, LOUNGE_MIN),
    });
  }
  return { placed, basis, wing, extra, height, depth: live.depth };
}

function loungeWorldBoxes(placed, z1) {
  const rad = ((placed.pose.rotZ || 0) * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return loungeFootprintBoxes(placed.params).map((b) => {
    const xs = [];
    const ys = [];
    for (const [x, y] of [[b.x0, b.y0], [b.x1, b.y0], [b.x0, b.y1], [b.x1, b.y1]]) {
      xs.push(placed.pose.x + x * c - y * s);
      ys.push(placed.pose.y + x * s + y * c);
    }
    return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), z0: 0, z1 };
  });
}

function loungeEndCap(basis, side, depth, height) {
  const end = side === "RIGHT" ? basis.right : basis.left;
  const inward = side === "RIGHT" ? -1 : 1;
  const mark = 120;
  const corners = [0, 1].flatMap((room) => [0, 1].map((inn) => ({
    x: end.x + basis.ux * inward * mark * inn + basis.rx * depth * room,
    y: end.y + basis.uy * inward * mark * inn + basis.ry * depth * room,
  })));
  const xs = corners.map((p) => p.x);
  const ys = corners.map((p) => p.y);
  return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys), z0: 0, z1: height };
}

function loungeOpenDim(step) {
  const keys = step === "face" ? ["W", "D"]
    : step === "width" ? ["W"]
    : step === "height" ? ["H"]
    : [];
  if (!keys.length) { dimBox.classList.add("hidden"); return; }
  setDimNames(["W", "D", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) {
    dimLabels[k].classList.toggle("hidden", !keys.includes(k));
    dimLabels[k].classList.remove("focused");
    dimLabels[k].classList.toggle("locked", S.lounge.locks[k] != null);
  }
  if (keys.includes("H") && document.activeElement !== dimInputs.H) dimInputs.H.value = String(Math.round(loungeHeightNow()));
}

function loungePlanBox(a, opposite, z1) {
  return {
    x0: Math.min(a.x, opposite.x),
    y0: Math.min(a.y, opposite.y),
    x1: Math.max(a.x, opposite.x),
    y1: Math.max(a.y, opposite.y),
    z0: 0,
    z1,
  };
}

function loungeDimBox() {
  if (!S.lounge || !S.lounge.a) return null;
  const pt = loungeFloor(S.lounge.lastClient);
  const spec = S.lounge.b ? loungeSpec(pt, S.lounge.lastClient) : null;
  const z1 = S.lounge.step === "height" ? loungeHeightLive(S.lounge.lastClient) : (spec ? spec.height : 40);
  if (spec && spec.placed) {
    const boxes = loungeWorldBoxes(spec.placed, z1);
    if (!boxes.length) return null;
    const x0 = Math.min(...boxes.map((b) => b.x0));
    const y0 = Math.min(...boxes.map((b) => b.y0));
    const x1 = Math.max(...boxes.map((b) => b.x1));
    const y1 = Math.max(...boxes.map((b) => b.y1));
    return { x0, y0, z0: 0, W: Math.max(x1 - x0, 1), D: Math.max(y1 - y0, 1), H: z1 };
  }
  const opposite = S.lounge.step === "face" && pt ? loungeOpposite(pt) : null;
  if (S.lounge.a && opposite) return loungePlanBox(S.lounge.a, opposite, 40);
  return null;
}

function updateLounge(e) {
  if (!S.lounge) return;
  if (e) S.lounge.lastClient = e;
  const pt = loungeFloor(e || S.lounge.lastClient);
  const spec = S.lounge.b ? loungeSpec(pt, e || S.lounge.lastClient) : null;
  const z1 = S.lounge.step === "height" ? loungeHeightLive(e || S.lounge.lastClient) : 40;
  const boxes = spec ? loungeWorldBoxes(spec.placed, S.lounge.step === "height" ? z1 : 40) : [];
  const opposite = S.lounge.step === "face" && pt ? loungeOpposite(pt) : null;
  if (!spec && S.lounge.a && opposite) boxes.push(loungePlanBox(S.lounge.a, opposite, 40));
  const lit = S.lounge.step === "side" && spec ? loungeSideAt(pt, spec.basis) : (S.lounge.step === "width" && S.lounge.side && spec && spec.extra < LOUNGE_MIN ? S.lounge.side : null);
  if (lit && spec) boxes.push(loungeEndCap(spec.basis, lit, spec.depth, 200));
  showLoungeGhost(boxes, null);
  if (lit && spec) {
    const end = lit === "RIGHT" ? spec.basis.right : spec.basis.left;
    showSnapMarker(end.x + spec.basis.rx * spec.depth, end.y + spec.basis.ry * spec.depth, 0, { feature: true });
  } else if (pt) showSnapMarker(pt.x, pt.y, 0, { feature: false });
  const fields = S.lounge.step === "face" ? ["W", "D"]
    : S.lounge.step === "width" ? ["W"]
    : S.lounge.step === "height" ? ["H"]
    : [];
  for (const key of fields) {
    if (document.activeElement === dimInputs[key]) continue;
    const run = S.lounge.a && opposite ? loungeRun(S.lounge.a, opposite) : null;
    const value = key === "H" ? (S.lounge.step === "height" ? z1 : loungeHeightNow())
      : key === "D" ? (run ? run.depth : (S.lounge.depth || 0))
      : key === "W" && S.lounge.step === "width" ? (S.lounge.depth || 0) + (spec ? spec.extra : 0)
      : (run ? Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y) : 0);
    dimInputs[key].value = String(Math.round(value));
    dimLabels[key].classList.toggle("locked", S.lounge.locks[key] != null);
  }
  if (!e) return;
  const lines = [`Lounge ${S.lounge.style}`];
  if (S.lounge.step === "corner") lines.push("Click one corner of the plan");
  else if (S.lounge.step === "face") lines.push(`Plan face · W ${dimInputs.W.value} · D ${dimInputs.D.value}`);
  else if (S.lounge.step === "side") lines.push(lit === "LEFT" ? "Left end — click to turn the side cabinet here" : lit === "RIGHT" ? "Right end — click to turn the side cabinet here" : "Move to an end");
  else if (S.lounge.step === "width") lines.push(`Side cabinet ${Math.round((S.lounge.depth || 0) + (spec ? spec.extra : 0))}`);
  else lines.push(`H ${Math.round(z1)}`);
  showTip(e.clientX, e.clientY, lines, Object.values(S.lounge.locks).some((v) => v != null) ? "lock" : "");
}

function loungeClick(e) {
  if (e) S.lounge.lastClient = e;
  const pt = loungeFloor(e);
  if (S.lounge.step === "corner") {
    if (!pt) return;
    S.lounge.a = pt;
    S.lounge.locks = { W: null, D: null, H: null };
    S.lounge.step = "face";
    loungeOpenDim("face");
    log("lounge.point", { style: S.lounge.style, n: 1, ...pt });
    emitMode();
    updateLounge(e);
    return;
  }
  if (S.lounge.step === "face") {
    const opposite = loungeOpposite(pt);
    const run = opposite && loungeRun(S.lounge.a, opposite);
    if (!run) return;
    S.lounge.b = run.b;
    S.lounge.depth = run.depth;
    S.lounge.roomSign = run.roomSign;
    S.lounge.locks.W = null;
    S.lounge.locks.D = null;
    log("lounge.face", { style: S.lounge.style, ...run.b, depth: run.depth, roomSign: run.roomSign });
    S.lounge.step = S.lounge.style === "I" ? "height" : "side";
    if (S.lounge.step === "height") loungeOpenDim("height");
    else dimBox.classList.add("hidden");
    emitMode();
    updateLounge(e);
    return;
  }
  if (S.lounge.step === "side") {
    const live = loungeDepthLive(pt);
    const basis = live && loungeBasis(S.lounge.a, S.lounge.b, live.roomSign);
    const side = loungeSideAt(pt, basis);
    if (!side) return;
    S.lounge.side = side;
    S.lounge.locks.W = null;
    S.lounge.step = "width";
    loungeOpenDim("width");
    log("lounge.side", { side });
    emitMode();
    updateLounge(e);
    return;
  }
  if (S.lounge.step === "width") {
    const live = loungeDepthLive(pt);
    const basis = live && loungeBasis(S.lounge.a, S.lounge.b, live.roomSign);
    if (!live || !basis) return;
    const extra = loungeExtra(pt, basis, live.depth);
    if (!(extra >= LOUNGE_MIN)) return;
    S.lounge.wing = live.depth + extra;
    S.lounge.locks.W = null;
    S.lounge.step = "height";
    loungeOpenDim("height");
    log("lounge.width", { extra, wing: S.lounge.wing, side: S.lounge.side });
    emitMode();
    updateLounge(e);
    return;
  }
  if (S.lounge.step === "height") {
    S.lounge.height = loungeHeightLive(e);
    finishLounge("click");
  }
}

function finishLounge(how) {
  if (!S.lounge || S.lounge.step !== "height" || !S.lounge.a || !S.lounge.b || !(S.lounge.depth >= LOUNGE_MIN)) return;
  const height = loungeHeightNow();
  const depth = S.lounge.depth;
  const roomSign = S.lounge.roomSign || 1;
  let placed;
  if (S.lounge.style === "L") {
    if (!(S.lounge.wing > depth) || !S.lounge.side) return;
    placed = loungeFromDrawnRun({
      a: S.lounge.a, b: S.lounge.b, depth, roomSign, style: "L", side: S.lounge.side, wing: S.lounge.wing, height,
    });
  } else {
    placed = loungeFromDrawnRun({ a: S.lounge.a, b: S.lounge.b, depth, roomSign, style: "I", height });
  }
  const env = {
    W: placed.params.mainWidth,
    D: placed.params.style === "L_SHAPE" ? placed.params.lWidth : placed.params.mainDepth,
    H: height,
  };
  const style = S.lounge.style;
  const cab = job.addCabinet(S.lounge.moduleId, placed.pose, env, placed.params);
  log("lounge.finish", { style, id: cab.id, how, params: placed.params, pose: placed.pose });
  S.lounge = freshLounge(style);
  clearPreview();
  canvas.style.cursor = "crosshair";
  job.select(cab.id);
  emitMode();
}

function loungeConfirm(how) {
  if (!S.lounge) return;
  if (S.lounge.step === "face" || S.lounge.step === "width" || S.lounge.step === "height") loungeClick(S.lounge.lastClient);
}

function loungeBack() {
  if (!S.lounge) return;
  S.lounge.locks = { W: null, D: null, H: null };
  if (S.lounge.step === "corner") { cancelLounge(); return; }
  if (S.lounge.step === "face") {
    S.lounge.a = null;
    S.lounge.step = "corner";
    dimBox.classList.add("hidden");
  } else if (S.lounge.step === "side" || (S.lounge.step === "height" && S.lounge.style === "I")) {
    S.lounge.b = null;
    S.lounge.depth = null;
    S.lounge.step = "face";
    loungeOpenDim("face");
  } else if (S.lounge.step === "width") {
    S.lounge.wing = null;
    S.lounge.side = null;
    S.lounge.step = "side";
    dimBox.classList.add("hidden");
  } else if (S.lounge.step === "height") {
    S.lounge.step = "width";
    loungeOpenDim("width");
  }
  log("lounge.back", { style: S.lounge.style, step: S.lounge.step });
  emitMode();
  updateLounge(S.lounge.lastClient);
}

// --- lounge L (3D): main box, then one wing ---------------------------------------
//
//   box    the usual box placement draws the main box: corner → rectangle on a face → pull
//   edge   one of the two vertical edges of its room face is lit (the nearer one) · click
//   pull   the wing comes out of that face into the room; along the wall it is as wide as
//          the main box is deep, the pull snaps to that depth · click / Enter creates
// The room face is one of the two long sides: the one not against a wall or a solid,
// else the one toward the middle of the room. Only the outer L envelope is decided
// here; the generator lays out the boards.



/** Lounge I / L: the usual box placement (faces, feature points, inference, typed sizes) draws the run. */
function startLoungeBox(style) {
  armPlacement("loungeGenerator");
  if (S.placing !== "loungeGenerator") return;
  S.lshape = { step: "box", style };
  log("lounge.arm", { style });
  emitMode();
}

/** The box placement as logged: where the drawn box came from. */
function placementInfo(b) {
  return {
    anchor: S.rb.anchor, corner: S.rb.corner, locked: S.rb.locked,
    plane: { axis: S.rb.plane.axis, value: S.rb.plane.value, dir: S.rb.plane.dir, label: S.rb.plane.label },
    extrude: S.rb.ext ? { len: S.rb.ext.len, label: S.rb.ext.label } : null,
    clamped: b.clamped, box: { x0: b.x0, y0: b.y0, z0: b.z0, W: b.W, D: b.D, H: b.H },
  };
}

/** Create a S.lounge on the drawn box `b` facing `front`; `anchor` is the first click (the grow-from corner). */
function createLoungeOnBox(b, front, params, anchor, how, meta) {
  const fit = fitBoxFacing(b, front, 0);
  const r1 = (v) => Math.round(v * 10) / 10;
  const full = { ...params, height: r1(fit.H) };
  const pose = { ...fit.pose, x: r1(fit.pose.x), y: r1(fit.pose.y), z: r1(fit.pose.z) };
  const corner = anchor
    ? cornerOf({ x0: 0, x1: fit.W, y0: 0, y1: fit.D, z0: 0, z1: fit.H }, localOf(pose, [anchor.x, anchor.y, anchor.z]))
    : null;
  const cab = job.addCabinet("loungeGenerator", pose, { W: fit.W, D: fit.D, H: full.height }, { history: true, params: full, corner });
  log("lounge.finish", { style: S.lshape.style, id: cab.id, how, ...meta, front: { axis: front.axis, dir: front.dir }, params: full, pose });
  if (!poseFits(cab, cab.pose)) log("place.unfit", { id: cab.id, pose: cab.pose });
  return { cab, fit };
}

/** Lounge I: the drawn box is the run; its room face is the long side not against a wall or a solid. */
function finishLoungeI(b, how) {
  const front = loungeFront(b);
  const fit = fitBoxFacing(b, front, 0);
  const r1 = (v) => Math.round(v * 10) / 10;
  flushTrace("place.trace");
  createLoungeOnBox(b, front, { style: "I_SHAPE", mainWidth: r1(fit.W), mainDepth: r1(fit.D) }, S.rb.anchor, how, placementInfo(b));
  S.rb = null;
  clearPreview();
  emitMode();
}

// --- S.lounge Parallel (3D): the whole lounge's box, then the seat width ------------------------------
//
//   box    the usual box placement draws the whole S.lounge (room face = the long side off the wall)
//   seat   both runs grow from the two ends toward the middle, the same width: the cursor's distance
//          from the nearer end along the wall; snaps near PARALLEL_RUN_WIDTH · Tab types it ·
//          click / Enter creates · Esc redraws the box

/** Default seat width of each parallel run (19'6 Rear Door). */
const PARALLEL_RUN_WIDTH = 560;
const PARALLEL_MIN_SEAT = 300;

function beginLoungeSeat(b, how) {
  const front = loungeFront(b);
  const fr = loungeFrame(b, front);
  if (!(fr.length >= 2 * PARALLEL_MIN_SEAT)) {
    log("place.blocked", { moduleId: S.placing, reason: "parallel lounge too short for two seats", box: { x0: b.x0, y0: b.y0, z0: b.z0, W: b.W, D: b.D, H: b.H } });
    const at = S.rb && S.rb.lastClient;
    showTip(at ? at.x : 0, at ? at.y : 0, [`Box ${Math.round(fr.length)} long — two seats need at least ${2 * PARALLEL_MIN_SEAT}`], "warn");
    return;
  }
  flushTrace("place.trace");
  const info = placementInfo(b);
  log("lounge.box", { style: "Parallel", how, ...info, front: { axis: front.axis, dir: front.dir }, length: fr.length, depth: fr.depth });
  const at = S.rb.lastClient;
  const anchor = S.rb.anchor;
  S.rb = null;
  clearPreview();
  S.lshape = {
    step: "seat", style: "Parallel", box: info.box, front, frame: fr, info, anchor,
    seat: Math.min(PARALLEL_RUN_WIDTH, fr.length / 2), locked: null, snap: false, moved: false,
    lastClient: at ? { clientX: at.x, clientY: at.y } : null,
  };
  setDimNames(["W", "S", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.toggle("hidden", k !== "D");
  emitMode();
  // Enter is a click where the cursor is: the seat starts from the cursor, not a default width.
  updateLoungeSeat(S.lshape.lastClient);
}

/** Seat width from the cursor: its distance from the nearer end of the room face, snapped near 560. */
function loungeSeatWidth(e) {
  const fr = S.lshape.frame;
  const max = fr.length / 2;
  let seat = S.lshape.locked != null ? S.lshape.locked : S.lshape.seat;
  let snap = false;
  if (e) {
    const ray = rayFromClient(e.clientX, e.clientY);
    if (Math.abs(ray.direction[fr.u]) <= 0.985) {
      const base = { [fr.u]: fr.u0, [fr.n]: fr.face, z: fr.z0 };
      const dirV = axisVector(fr.u, 1);
      const t = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(base.x, base.y, base.z), new THREE.Vector3(dirV[0], dirV[1], dirV[2]));
      const raw = job.snap(Math.min(t, fr.length - t));
      // A typed seat width holds whatever the cursor does; empty the field + Tab frees it (as the kitchen).
      if (S.lshape.locked == null) {
        seat = raw;
        S.lshape.moved = true;
        if (Math.abs(seat - PARALLEL_RUN_WIDTH) <= 40 && PARALLEL_RUN_WIDTH <= max) { seat = PARALLEL_RUN_WIDTH; snap = true; }
      }
    }
  }
  S.lshape.seat = Math.max(PARALLEL_MIN_SEAT, Math.min(max, seat));
  S.lshape.snap = snap;
}

function loungeSeatBoxes() {
  const fr = S.lshape.frame;
  const b = S.lshape.box;
  const n = { x: [b.x0, b.x0 + b.W], y: [b.y0, b.y0 + b.D] }[fr.n];
  const run = (u0, u1) => {
    const r = { [fr.u]: [u0, u1], [fr.n]: n };
    return { x0: r.x[0], x1: r.x[1], y0: r.y[0], y1: r.y[1], z0: fr.z0, z1: fr.z0 + fr.H };
  };
  return [run(fr.u0, fr.u0 + S.lshape.seat), run(fr.u1 - S.lshape.seat, fr.u1)];
}

function updateLoungeSeat(e) {
  if (e) S.lshape.lastClient = e;
  loungeSeatWidth(e);
  const fr = S.lshape.frame;
  const boxes = loungeSeatBoxes();
  const edge = (u) => {
    const p = { [fr.u]: u, [fr.n]: fr.face, z: fr.z0 };
    return { a: p, b: { ...p, z: fr.z0 + fr.H } };
  };
  showLoungeGhost([...boxes, loungeMainBox(S.lshape.box)], [edge(fr.u0 + S.lshape.seat), edge(fr.u1 - S.lshape.seat)]);
  if (S.lshape.snap) {
    const p = edge(fr.u0 + S.lshape.seat).a;
    showSnapMarker(p.x, p.y, p.z + fr.H / 2, { feature: true });
  } else hideSnapMarker();
  if (document.activeElement !== dimInputs.D) dimInputs.D.value = String(Math.round(S.lshape.seat));
  dimLabels.D.classList.toggle("locked", S.lshape.locked != null);
  const m = boxes[0];
  positionDimInputs({ x0: m.x0, y0: m.y0, z0: m.z0, W: m.x1 - m.x0, D: m.y1 - m.y0, H: m.z1 - m.z0 });
  hideTip();
}

function finishLoungeSeat(how) {
  if (!S.lshape || S.lshape.step !== "seat") return;
  const r1 = (v) => Math.round(v * 10) / 10;
  const { box, front, frame: fr, info, anchor } = S.lshape;
  const seat = r1(S.lshape.seat);
  createLoungeOnBox(box, front, { style: "PARALLEL", totalWidth: r1(fr.length), depth: r1(fr.depth), singleLoungeWidth: seat }, anchor, how, {
    ...info, seat: { width: seat, snap: S.lshape.snap, locked: S.lshape.locked, moved: S.lshape.moved },
  });
  S.lshape = { step: "box", style: "Parallel" };
  hideTip();
  dimBox.classList.add("hidden");
  clearPreview();
  canvas.style.cursor = "crosshair";
  emitMode();
}

function loungeFront(b) {
  const axis = b.W >= b.D ? "y" : "x";
  const free = SIDES.filter((s) => s.axis === axis && !sideBlocked(b, s));
  if (free.length === 1) return free[0];
  const sp = job.getSpace();
  if (!sp) return { axis, dir: -1 };
  const lo = axis === "x" ? sp.bounds.minX : sp.bounds.minY;
  const hi = axis === "x" ? sp.bounds.maxX : sp.bounds.maxY;
  const c = axis === "x" ? b.x0 + b.W / 2 : b.y0 + b.D / 2;
  return { axis, dir: c > (lo + hi) / 2 ? -1 : 1 };
}

/** The main box in wall terms: `u` along the wall, `n` through the room face at `face`. */
function loungeFrame(b, front) {
  const n = front.axis;
  const u = n === "x" ? "y" : "x";
  const lo = { x: b.x0, y: b.y0 };
  const size = { x: b.W, y: b.D };
  return {
    n, u,
    face: front.dir > 0 ? lo[n] + size[n] : lo[n],
    u0: lo[u], u1: lo[u] + size[u],
    length: size[u], depth: size[n],
    z0: b.z0, H: b.H,
  };
}

function loungeEdgeBase(fr, end) {
  return { [fr.u]: end === "hi" ? fr.u1 : fr.u0, [fr.n]: fr.face, z: fr.z0 };
}

/** LEFT / RIGHT as seen from the room (the generator's lPosition). */
function loungeEndSide(front, end) {
  const rotZ = rotZFacing(front.axis, front.dir);
  const rad = (rotZ * Math.PI) / 180;
  const localX = Math.round(front.axis === "y" ? Math.cos(rad) : Math.sin(rad));
  return (end === "hi") === (localX > 0) ? "RIGHT" : "LEFT";
}

function loungeWingBox(fr, front, end, len, wide) {
  const w0 = end === "hi" ? fr.u1 - wide : fr.u0;
  const n0 = front.dir > 0 ? fr.face : fr.face - len;
  const r = { [fr.u]: [w0, w0 + wide], [fr.n]: [n0, n0 + len] };
  return { x0: r.x[0], x1: r.x[1], y0: r.y[0], y1: r.y[1], z0: fr.z0, z1: fr.z0 + fr.H };
}

/** Inner edge of the wing: a vertical line inset `wide` from the chosen end, along the wall. */
function loungeSideLine(fr, end, wide) {
  const p = { [fr.u]: end === "hi" ? fr.u1 - wide : fr.u0 + wide, [fr.n]: fr.face, z: fr.z0 };
  return { a: p, b: { ...p, z: fr.z0 + fr.H } };
}

function loungeMainBox(b) {
  return { x0: b.x0, x1: b.x0 + b.W, y0: b.y0, y1: b.y0 + b.D, z0: b.z0, z1: b.z0 + b.H };
}

function screenSegDist(clientX, clientY, a, b) {
  const pa = toClient(a.x, a.y, a.z);
  const pb = toClient(b.x, b.y, b.z);
  if (pa.behind || pb.behind) return Infinity;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((clientX - pa.x) * dx + (clientY - pa.y) * dy) / len2)) : 0;
  return Math.hypot(clientX - (pa.x + t * dx), clientY - (pa.y + t * dy));
}

function beginLoungeEdge(b, how) {
  const front = loungeFront(b);
  const fr = loungeFrame(b, front);
  if (!(fr.length > fr.depth + LOUNGE_MIN)) {
    log("place.blocked", { moduleId: S.placing, reason: "lounge main box not longer than deep", box: { x0: b.x0, y0: b.y0, z0: b.z0, W: b.W, D: b.D, H: b.H } });
    const at = S.rb && S.rb.lastClient;
    showTip(at ? at.x : 0, at ? at.y : 0, [`Main box ${Math.round(fr.length)} long, ${Math.round(fr.depth)} deep`, "It must be longer than deep: the wing takes its depth at one end"], "warn");
    return;
  }
  flushTrace("place.trace");
  log("lounge.box", {
    style: "L", how,
    anchor: S.rb.anchor, corner: S.rb.corner, locked: S.rb.locked,
    plane: { axis: S.rb.plane.axis, value: S.rb.plane.value, dir: S.rb.plane.dir, label: S.rb.plane.label },
    extrude: S.rb.ext ? { len: S.rb.ext.len, label: S.rb.ext.label } : null,
    clamped: b.clamped, box: { x0: b.x0, y0: b.y0, z0: b.z0, W: b.W, D: b.D, H: b.H },
    front: { axis: front.axis, dir: front.dir }, length: fr.length, depth: fr.depth,
  });
  const at = S.rb.lastClient;
  S.rb = null;
  clearPreview();
  S.lshape = {
    step: "edge", box: { x0: b.x0, y0: b.y0, z0: b.z0, W: b.W, D: b.D, H: b.H }, front, frame: fr,
    lit: "hi", end: null, wide: 0, len: 0, locked: null, snap: false, clamped: null,
    lastClient: at ? { clientX: at.x, clientY: at.y } : null,
  };
  emitMode();
  updateLoungeL(null);
}

/** Wing width along the wall, inward from the chosen end. Snaps when it passes the main depth; any other value stays. */
function loungeWide(e) {
  const fr = S.lshape.frame;
  const inward = S.lshape.end === "hi" ? -1 : 1;
  const origin = S.lshape.end === "hi" ? fr.u1 : fr.u0;
  const base = loungeEdgeBase(fr, S.lshape.end);
  let wide = S.lshape.locked != null ? S.lshape.locked : S.lshape.wide;
  let snap = false;
  if (e) {
    const ray = rayFromClient(e.clientX, e.clientY);
    if (Math.abs(ray.direction[fr.u]) <= 0.985) {
      const dirV = axisVector(fr.u, inward);
      const t = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(base.x, base.y, base.z), new THREE.Vector3(dirV[0], dirV[1], dirV[2]));
      const raw = Math.max(0, Math.min(fr.length - LOUNGE_MIN, job.snap(t)));
      // A typed width holds whatever the cursor does; empty the field + Tab frees it (as the kitchen).
      if (S.lshape.locked == null) {
        wide = raw;
        if (Math.abs(wide - fr.depth) <= 40 && fr.depth <= fr.length - LOUNGE_MIN) { wide = fr.depth; snap = true; }
      }
    }
  }
  S.lshape.wide = wide;
  S.lshape.snap = snap;
  S.lshape.clamped = null;
  return { origin, inward };
}

/** The wing's pull out of the room face: cursor → length, snapped to the main depth, stopped by the space and solids. */
function loungePull(e) {
  const fr = S.lshape.frame;
  const { front } = S.lshape;
  const base = loungeEdgeBase(fr, S.lshape.end);
  let len = S.lshape.locked != null ? S.lshape.locked : S.lshape.len;
  let snap = false;
  if (e) {
    const ray = rayFromClient(e.clientX, e.clientY);
    if (Math.abs(ray.direction[fr.n]) <= 0.985) {
      const dirV = axisVector(fr.n, front.dir);
      const t = closestTOnLine(e.clientX, e.clientY, new THREE.Vector3(base.x, base.y, base.z), new THREE.Vector3(dirV[0], dirV[1], dirV[2]));
      const raw = Math.max(0, job.snap(t));
      // A typed length holds whatever the cursor does; empty the field + Tab frees it (as the kitchen).
      if (S.lshape.locked == null) {
        len = raw;
        if (Math.abs(len - fr.depth) <= 40) { len = fr.depth; snap = true; }
      }
    }
  }
  let clamped = null;
  const room = roomFrom(base)[fr.n];
  const maxLen = front.dir > 0 ? room.pos : room.neg;
  if (len > maxLen) { len = maxLen; clamped = WALL_NAME[fr.n][front.dir > 0 ? 1 : 0]; snap = false; }
  const wide = S.lshape.wide;
  const w0 = S.lshape.end === "hi" ? fr.u1 - wide : fr.u0;
  const anchor = { [fr.u]: w0, [fr.n]: fr.face, z: fr.z0 };
  const blocked = stopAtCabinets(anchor, { [fr.u]: wide, [fr.n]: len, z: fr.H }, { [fr.u]: 1, [fr.n]: front.dir, z: 1 }, fr.n, [fr.n]);
  if (blocked[fr.n]) { len = blocked[fr.n].size; clamped = blocked[fr.n].id; snap = false; }
  S.lshape.len = len;
  S.lshape.snap = snap;
  S.lshape.clamped = clamped;
  return { maxLen };
}

function loungeWingDimBox() {
  const w = loungeWingBox(S.lshape.frame, S.lshape.front, S.lshape.end, Math.max(S.lshape.len, 1), Math.max(S.lshape.wide, 1));
  return { x0: w.x0, y0: w.y0, z0: w.z0, W: w.x1 - w.x0, D: w.y1 - w.y0, H: w.z1 - w.z0 };
}

function updateLoungeL(e) {
  if (!S.lshape || S.lshape.step === "box") return;
  if (S.lshape.step === "seat") { updateLoungeSeat(e); return; }
  if (e) S.lshape.lastClient = e;
  const fr = S.lshape.frame;
  const { front } = S.lshape;
  const main = loungeMainBox(S.lshape.box);
  const dims = `${Math.round(fr.length)} × ${Math.round(fr.depth)} × ${Math.round(fr.H)}`;
  if (S.lshape.step === "edge") {
    const ev = e || S.lshape.lastClient;
    if (ev) {
      const dist = (end) => {
        const p = loungeEdgeBase(fr, end);
        return screenSegDist(ev.clientX, ev.clientY, p, { ...p, z: fr.z0 + fr.H });
      };
      S.lshape.lit = dist("lo") <= dist("hi") ? "lo" : "hi";
    }
    const edgeOf = (end) => {
      const p = loungeEdgeBase(fr, end);
      return { a: p, b: { ...p, z: fr.z0 + fr.H } };
    };
    const other = S.lshape.lit === "hi" ? "lo" : "hi";
    showLoungeGhost([main], [edgeOf(other), edgeOf(S.lshape.lit)]);
    hideSnapMarker();
    // Like the kitchen: nothing follows the cursor; the status bar says what the click does.
    hideTip();
    return;
  }
  if (S.lshape.step === "wide") {
    loungeWide(e);
    const clicked = loungeEdgeBase(fr, S.lshape.end);
    const side = loungeSideLine(fr, S.lshape.end, S.lshape.wide);
    showLoungeGhost([main], [
      { a: clicked, b: { ...clicked, z: fr.z0 + fr.H } },
      side,
    ]);
    if (S.lshape.snap) showSnapMarker(side.a.x, side.a.y, side.a.z + fr.H / 2, { feature: true });
    else hideSnapMarker();
    if (document.activeElement !== dimInputs.D) dimInputs.D.value = String(Math.round(S.lshape.wide));
    dimLabels.D.classList.toggle("locked", S.lshape.locked != null);
    const mark = loungeWingBox(fr, front, S.lshape.end, 1, Math.max(S.lshape.wide, 1));
    positionDimInputs({ x0: mark.x0, y0: mark.y0, z0: mark.z0, W: mark.x1 - mark.x0, D: mark.y1 - mark.y0, H: mark.z1 - mark.z0 });
    hideTip();
    return;
  }
  loungePull(e);
  const base = loungeEdgeBase(fr, S.lshape.end);
  const edgeOf = (end) => {
    const p = loungeEdgeBase(fr, end);
    return { a: p, b: { ...p, z: fr.z0 + fr.H } };
  };
  const boxes = [main];
  if (S.lshape.len >= 1) boxes.push(loungeWingBox(fr, front, S.lshape.end, S.lshape.len, S.lshape.wide));
  const other = S.lshape.end === "hi" ? "lo" : "hi";
  showLoungeGhost(boxes, [edgeOf(other), edgeOf(S.lshape.end)]);
  if (S.lshape.snap) {
    const dirV = axisVector(fr.n, front.dir);
    showSnapMarker(base.x + dirV[0] * S.lshape.len, base.y + dirV[1] * S.lshape.len, base.z, { feature: true });
  } else hideSnapMarker();
  if (document.activeElement !== dimInputs.D) dimInputs.D.value = String(Math.round(S.lshape.len));
  dimLabels.D.classList.toggle("locked", S.lshape.locked != null);
  positionDimInputs(loungeWingDimBox());
  hideTip();
}

function loungeLClick(e) {
  if (e) S.lshape.lastClient = e;
  if (S.lshape.step === "seat") {
    if (e) updateLoungeSeat(e);
    finishLoungeSeat(e ? "click" : "enter");
    return;
  }
  if (S.lshape.step === "edge") {
    if (e) updateLoungeL(e);
    S.lshape.end = S.lshape.lit;
    S.lshape.step = "wide";
    S.lshape.wide = 0;
    S.lshape.len = 0;
    S.lshape.locked = null;
    log("lounge.edge", { style: "L", end: S.lshape.end, side: loungeEndSide(S.lshape.front, S.lshape.end), edge: loungeEdgeBase(S.lshape.frame, S.lshape.end) });
    hideTip();
    setDimNames(["W", "L", "H"]);
    dimBox.classList.remove("hidden");
    for (const k of DIM_ORDER) dimLabels[k].classList.toggle("hidden", k !== "D");
    emitMode();
    updateLoungeL(e);
    return;
  }
  if (S.lshape.step === "wide") {
    if (e) updateLoungeL(e);
    if (!(S.lshape.wide >= LOUNGE_MIN)) {
      const ev = S.lshape.lastClient;
      if (ev) showTip(ev.clientX, ev.clientY, [`Wing width ${Math.round(S.lshape.wide)} — drag the side line, or Tab to type L`], "warn");
      return;
    }
    S.lshape.step = "pull";
    S.lshape.len = 0;
    S.lshape.locked = null;
    S.lshape.snap = false;
    log("lounge.width", { style: "L", end: S.lshape.end, wide: S.lshape.wide, snap: Math.abs(S.lshape.wide - S.lshape.frame.depth) < 0.5 });
    emitMode();
    updateLoungeL(e);
    return;
  }
  if (S.lshape.step === "pull") {
    if (e) updateLoungeL(e);
    finishLoungeL("click");
  }
}

function finishLoungeL(how) {
  if (!S.lshape || S.lshape.step !== "pull") return;
  const fr = S.lshape.frame;
  const { front, box } = S.lshape;
  // Enter is a click where the cursor is: no default wing length (2026-10-09).
  const len = S.lshape.len;
  if (!(len >= LOUNGE_MIN)) {
    const ev = S.lshape.lastClient;
    log("lounge.blocked", { style: "L", reason: "wing shorter than minimum", len, min: LOUNGE_MIN, clamped: S.lshape.clamped });
    if (ev) showTip(ev.clientX, ev.clientY, [`Wing ${Math.round(len)} — pull it at least ${LOUNGE_MIN} out`, S.lshape.clamped ? `Stopped at ${S.lshape.clamped}` : null], "warn");
    return;
  }
  // The L's outer box: the main box grown out of its room face by the wing.
  const env = { ...box };
  if (front.axis === "x") { env.W = box.W + len; if (front.dir < 0) env.x0 = box.x0 - len; }
  else { env.D = box.D + len; if (front.dir < 0) env.y0 = box.y0 - len; }
  const fit = fitBoxFacing(env, front, 0);
  const r1 = (v) => Math.round(v * 10) / 10;
  const lPosition = loungeEndSide(front, S.lshape.end);
  const params = {
    style: "L_SHAPE",
    height: r1(fit.H),
    mainWidth: r1(fit.W),
    mainDepth: r1(fr.depth),
    lWidth: r1(fit.D),
    lDepth: r1(S.lshape.wide),
    lPosition,
  };
  const pose = { ...fit.pose, x: r1(fit.pose.x), y: r1(fit.pose.y), z: r1(fit.pose.z) };
  const cab = job.addCabinet("loungeGenerator", pose, { W: params.mainWidth, D: params.lWidth, H: params.height }, params);
  log("lounge.finish", {
    style: "L", id: cab.id, how,
    box, front: { axis: front.axis, dir: front.dir }, end: S.lshape.end, lPosition,
    wing: { len, snap: S.lshape.snap, locked: S.lshape.locked, clamped: S.lshape.clamped },
    params, pose,
  });
  if (!poseFits(cab, cab.pose)) log("place.unfit", { id: cab.id, pose: cab.pose });
  S.lshape = { step: "box", style: "L" };
  clearPreview();
  canvas.style.cursor = "crosshair";
  emitMode();
}

function loungeLBack() {
  if (!S.lshape) return;
  if (S.lshape.step === "pull") {
    S.lshape.step = "wide";
    S.lshape.len = 0;
    S.lshape.locked = null;
    clearPreview();
  } else if (S.lshape.step === "wide") {
    S.lshape.step = "edge";
    S.lshape.end = null;
    S.lshape.wide = 0;
    S.lshape.locked = null;
    clearPreview();
  } else if (S.lshape.step === "edge") {
    S.lshape = { step: "box", style: "L" };
    clearPreview();
  } else if (S.lshape.step === "seat") {
    S.lshape = { step: "box", style: "Parallel" };
    hideTip();
    dimBox.classList.add("hidden");
    clearPreview();
  }
  log("lounge.back", { style: S.lshape.style, step: S.lshape.step });
  emitMode();
  updateLoungeL(S.lshape.lastClient || null);
}


export function getLoungeStyle() {
  return S.lounge ? S.lounge.style : S.lshape ? S.lshape.style || "L" : null;
}

export function loungeModuleId() {
  return S.lounge ? S.lounge.moduleId : null;
}

// The generic placement finish hands the drawn box here for the wing/seat steps.
registerFinishHook((b, how) => {
  if (!S.lshape) return false;
  if (S.lshape.style === "L") beginLoungeEdge(b, how);
  else if (S.lshape.style === "Parallel") beginLoungeSeat(b, how);
  else finishLoungeI(b, how);
  return true;
});

export const MODE = {
  mode: () => (S.lounge ? `lounge.${S.lounge.step}` : S.lshape && S.lshape.step !== "box" ? `lounge.${S.lshape.step}` : null),
  typing: () => !!(S.lounge || (S.lshape && S.lshape.step !== "box")),
  dims: () => ({
    typable: () => {
      if (S.lounge) {
        if (S.lounge.step === "face") return ["W", "D"];
        if (S.lounge.step === "width") return ["W"];
        if (S.lounge.step === "height") return ["H"];
        return [];
      }
      if (S.lshape && S.lshape.step !== "box") return S.lshape.step === "pull" || S.lshape.step === "wide" || S.lshape.step === "seat" ? ["D"] : [];
      return DIM_ORDER;
    },
    current: (k) => {
      if (S.lshape && S.lshape.step === "wide") return k === "D" ? S.lshape.wide : 0;
      if (S.lshape && S.lshape.step === "pull") return k === "D" ? S.lshape.len : 0;
      if (S.lshape && S.lshape.step === "seat") return k === "D" ? S.lshape.seat : 0;
      if (S.lounge) {
        const pt = loungeFloor(S.lounge.lastClient);
        if (k === "H") return S.lounge.step === "height" ? loungeHeightLive(S.lounge.lastClient) : loungeHeightNow();
        if (k === "D") return S.lounge.depth || (S.lounge.a && pt && loungeOpposite(pt) ? loungeRun(S.lounge.a, loungeOpposite(pt))?.depth : 0) || 0;
        if (S.lounge.step === "width") return (S.lounge.depth || 0) + loungeExtra(pt, S.lounge.b ? loungeBasis(S.lounge.a, S.lounge.b, S.lounge.roomSign || 1) : null, S.lounge.depth || 0);
        if (S.lounge.a && pt && loungeOpposite(pt)) {
          const run = loungeRun(S.lounge.a, loungeOpposite(pt));
          return run ? Math.hypot(run.b.x - run.a.x, run.b.y - run.a.y) : 0;
        }
        return 0;
      }
      return 0;
    },
    max: (k) => {
      if (S.lshape && S.lshape.step === "pull") {
        if (k !== "D") return null;
        const room = roomFrom(loungeEdgeBase(S.lshape.frame, S.lshape.end))[S.lshape.frame.n];
        return S.lshape.front.dir > 0 ? room.pos : room.neg;
      }
      return null;
    },
    set: (k, v) => {
      if (S.lounge) {
        if (k === "H") {
          S.lounge.locks.H = v != null && v >= LOUNGE_MIN ? v : null;
          if (S.lounge.locks.H != null) S.lounge.height = S.lounge.locks.H;
          log("lounge.typein", { step: S.lounge.step, dim: "H", value: dimInputs.H.value, height: S.lounge.height });
          updateLounge(S.lounge.lastClient);
          return;
        }
        if (k !== "W" && k !== "D") return;
        if (S.lounge.step !== "face" && !(S.lounge.step === "width" && k === "W")) return;
        S.lounge.locks[k] = v != null && v >= LOUNGE_MIN ? v : null;
        log("lounge.typein", { step: S.lounge.step, dim: k, value: dimInputs[k].value, locked: S.lounge.locks[k] });
        updateLounge(S.lounge.lastClient);
      } else if (S.lshape && S.lshape.step === "seat") {
        if (k !== "D") return;
        S.lshape.locked = v != null && v >= PARALLEL_MIN_SEAT && v <= S.lshape.frame.length / 2 ? v : null;
        log("lounge.typein", { style: "Parallel", step: "seat", dim: "S", value: dimInputs.D.value, locked: S.lshape.locked });
        updateLoungeSeat(null);
      } else if (S.lshape && (S.lshape.step === "pull" || S.lshape.step === "wide")) {
        if (k !== "D") return;
        S.lshape.locked = v != null && v >= LOUNGE_MIN ? v : null;
        log("lounge.typein", { style: "L", step: "pull", dim: "L", value: dimInputs.D.value, locked: S.lshape.locked });
        updateLoungeL(null);
      }
    },
  }),
  down(e) {
    if (S.lounge) { loungeClick(e); return true; }
    if (S.lshape && S.lshape.step !== "box") { loungeLClick(e); return true; }
    return false;
  },
  hover(e) {
    if (S.lounge) { updateLounge(e); return true; }
    if (S.lshape && S.lshape.step !== "box") { updateLoungeL(e); return true; }
    return false;
  },
  confirm(how) {
    if (S.lounge) loungeConfirm(how);
    else if (S.lshape && S.lshape.step === "pull") finishLoungeL(how);
    else if (S.lshape && S.lshape.step !== "box") loungeLClick(null); // edge / wide / seat: Enter is the click
  },
  cancel() {
    if (S.lounge) loungeBack();
    else if (S.lshape && S.lshape.step !== "box") loungeLBack();
  },
  leave() {
    if (S.lounge || (S.lshape && S.lshape.step !== "box")) hideTip();
  },
  tick() {
    if (S.lounge) { const b = loungeDimBox(); if (b) positionDimInputs(b); }
    else if (S.lshape && S.lshape.step === "pull") positionDimInputs(loungeWingDimBox());
    else if (S.lshape && S.lshape.step === "seat") {
      const m = loungeSeatBoxes()[0];
      positionDimInputs({ x0: m.x0, y0: m.y0, z0: m.z0, W: m.x1 - m.x0, D: m.y1 - m.y0, H: m.z1 - m.z0 });
    }
  },
  stop() { cancelLounge(); S.lshape = null; },
};

host.stopResidents = () => { cancelLounge(); };
registerMode(MODE);
