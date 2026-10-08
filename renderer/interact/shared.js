// Shared interaction machinery — every mode file in ./interact/ builds on this
// and nothing here depends on a single mode. The mode bus (registerMode /
// activeMode / emitMode), the cursor resolver, the dimension type-ins, and the
// shared drag state (envelope handles + wall splits) live here.
//
// Mode contract (each file registers one):
//   mode()    → the getMode token while active, else null
//   typing()  → the type-in dispatch owns Enter/Esc/Tab/digits (default false)
//   dims()    → { typable?, current(k), max(k), set(k,v) } | null while typing
//   down/hover/up/key(e) → bool, true = the event is consumed
//   leave()   → pointerleave cleanup
//   tick()    → per-frame chrome (dim boxes glued to the box)
//   confirm(how, e) / cancel(how) → Enter / Esc while typing
import * as THREE from "three";
import { canvas, rayFromClient, planePointAt, closestTOnLine } from "../space.js";
import * as job from "../job.js";
import { getModule, isBaseCabinet, BEDROOM_LAYOUT_LABEL as LAYOUT_LABEL } from "../modules.js";
import {
  pickables, groupFor, setHandleHover, setEnvelopeDrag,
  showSnapMarker, hideSnapMarker, showInference, hideInference, showAlignLines, hideAlignLines,
  hideFaceHint, hideCPlanePreview, hideGhost, hideLoungeGhost,
} from "../cabinets3d.js";
import {
  nearestSnap, nearestInference, pointOnLine, nearestFaceAlign, faceGuide,
  facePlanes, inPlaneAxes, axisVector, AXES,
  INFER_BAND_PX, INFER_RELEASE_PX, AXIS_DIRS, uiScale, toClient, describePoint,
} from "../snap.js";
import { showTip, hideTip } from "../hud.js";
import { wallPickables } from "../walls3d.js";
import { wallBoards } from "../walls.js";
import { poseFits, overlaps, FRONT_THICKNESS_DEFAULT } from "../fit.js";
import { clearHeightAt } from "../spaces.js";
import { log } from "../log.js";

export const DWELL_MS = 400; // rest this long on an inference line to keep the point as a source
export const DIM_OF = { x: "W", y: "D", z: "H" }; // box size along each world axis
export const AXIS_OF = { W: "x", D: "y", H: "z" };

// --- mode bus -----------------------------------------------------------------

export const MODES = [];
export function registerMode(m) { MODES.push(m); }
/** The one active mode (modes are mutually exclusive). */
export const activeMode = () => MODES.find((m) => m.mode() != null) || null;
/** The active mode that owns the type-ins, if any. An overlay (retype) claims typing without a mode token. */
export const typingMode = () => MODES.find((m) => m.typing && m.typing()) || null;

const modeListeners = new Set();
let getModeFn = () => "idle"; // the shell injects its dispatcher-side getMode
export const setModeGetter = (fn) => { getModeFn = fn; };
export const currentMode = () => getModeFn();
export function onModeChange(fn) {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}
export function emitMode() {
  for (const fn of modeListeners) fn(getModeFn());
}

/** Host hooks a mode may register so shared code can read its state without an import cycle. */
export const host = { placingId: () => null, lshapeActive: () => null, stopPlacement: null, legacy: null };

/** Start of a command: every registered mode cancels itself (modes are mutually exclusive). */
export function stopAll() {
  for (const m of MODES) if (m.stop) m.stop();
}

// --- shared drag state ----------------------------------------------------------
// `drag` covers the two things the idle pointer can grab: an envelope handle
// (W/D/H/divider on a cabinet) and a wall-split handle. `hoverHandle` is the
// handle under the cursor while idle.

export const S = {
  drag: null,
  hoverHandle: null,
  // Placement-family slots — written by interact/place.js and interact/lounge.js;
  // read here by shared helpers (cursor resolver, dims) and by the shell's dispatch.
  placing: null,   // moduleId while armed
  rb: null,        // placement in progress (face / extrude step)
  lshape: null,    // lounge L/Parallel box flow: { step: box | edge | pull | wide | seat, ... }
  bunk: null,      // bunk bed step 4 (the lower box is drawn by the usual placement)
  lounge: null,    // floor-drawn lounge (I / L / U on the floor)
  lastCreated: null, // cabinet id that digits re-type while still armed
};

// --- pick helpers -------------------------------------------------------------

export function pick(clientX, clientY) {
  const ray = rayFromClient(clientX, clientY);
  const rc = new THREE.Raycaster(ray.origin, ray.direction);
  const hits = rc.intersectObjects([...pickables(), ...wallPickables()], false);
  const triad = hits.find((h) => h.object.userData.kind === "moveAxis");
  if (triad) return triad;
  const handle = hits.find((h) => h.object.userData.kind === "handle");
  return handle || hits[0] || null;
}

export function localAxisWorld(group, axis) {
  const v = axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  return v.transformDirection(group.matrixWorld).normalize();
}

// --- cursor resolver (shared by placement and move) -----------------------------

export function threePlane(axis, value) {
  const n = axisVector(axis);
  return new THREE.Plane(new THREE.Vector3(n[0], n[1], n[2]), -value);
}

export function clampToSpace(p) {
  const sp = job.getSpace();
  if (!sp) return { ...p, outside: false };
  const x = Math.min(sp.bounds.maxX, Math.max(sp.bounds.minX, p.x));
  const y = Math.min(sp.bounds.maxY, Math.max(sp.bounds.minY, p.y));
  const z = Math.min(clearHeightAt(sp, x, y), Math.max(0, p.z));
  return { x, y, z, outside: Math.abs(x - p.x) > 5 || Math.abs(y - p.y) > 5 || Math.abs(z - p.z) > 5 };
}

export function floorFace() {
  return facePlanes().find((f) => f.source === "space" && f.axis === "z" && f.dir > 0) || null;
}

/**
 * Cursor with inference. `ctx` persists between moves:
 *   { plane:{axis,value}, free3d, anchorPoint, lastPoint, inference, exclude }
 * With free3d=false the result stays on ctx.plane (drawing a rectangle on a
 * face); with free3d=true corners and edges may move the plane (move command).
 * Returns { x, y, z, kind, tip:[…], inference?, alignSegs? } or null.
 */
export function resolveCursor(e, ctx) {
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
    const al = nearestFaceAlign(cx, cy, plane, { exclude: ctx.exclude, extendOverheadWidth: isBaseCabinet(host.placingId()) });
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
  const al = nearestFaceAlign(cx, cy, plane, { exclude: ctx.exclude, extendOverheadWidth: isBaseCabinet(host.placingId()) });
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

export function axisName(dir) {
  return Math.abs(dir[0]) > 0.5 ? "X" : Math.abs(dir[1]) > 0.5 ? "Y" : "Z";
}
export function planeLabel(plane) {
  return plane.label || `${plane.axis.toUpperCase()} = ${Math.round(plane.value)}`;
}

export function drawResolved(p) {
  if (p.kind === "feature") showSnapMarker(p.x, p.y, p.z, { feature: true });
  else hideSnapMarker();
  if (p.inference) showInference(p.inference.from, p, p.inference.dir);
  else hideInference();
  if (p.alignSegs && p.alignSegs.length) showAlignLines(p.alignSegs);
  else hideAlignLines();
}

// --- dimension type-ins ---------------------------------------------------------

export const dimBox = document.getElementById("dimInputs");
export const DIM_ORDER = ["W", "D", "H"];
export const dimInputs = Object.fromEntries(DIM_ORDER.map((k) => [k, dimBox.querySelector(`[data-dim="${k}"] input`)]));
export const dimLabels = Object.fromEntries(DIM_ORDER.map((k) => [k, dimBox.querySelector(`[data-dim="${k}"]`)]));
export const dimNames = Object.fromEntries(DIM_ORDER.map((k) => [k, dimBox.querySelector(`[data-dim="${k}"] span`)]));

export function focusDim(k) {
  for (const kk of DIM_ORDER) dimLabels[kk].classList.toggle("focused", kk === k);
  dimInputs[k].focus();
  dimInputs[k].select();
}
export function focusedDim() {
  return DIM_ORDER.find((k) => document.activeElement === dimInputs[k]) || null;
}
/** Type-in owner precedence: the shell's legacy chain while it claims one (its
 * internal order is the original if-chain), else a registered typing mode. */
function claimOwner() {
  if (host.legacy && host.legacy.claims && host.legacy.claims()) return host.legacy;
  return typingMode() || activeMode() || host.legacy;
}
/** The dims provider: the registered mode that claims typing, else the shell's legacy bridge. */
function dimOwner() {
  const o = claimOwner();
  return o && o.dims ? o.dims() : null;
}
/** Dims that are open for typing right now (the face step hides the normal-axis one). */
export function typableDims() {
  const d = dimOwner();
  if (d && d.typable) return d.typable();
  return DIM_ORDER;
}
export function nextDim(k, back = false) {
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

export function currentDim(k) {
  const d = dimOwner();
  return d && d.current ? d.current(k) : 0;
}
export function maxDim(k) {
  const d = dimOwner();
  return d && d.max ? d.max(k) : null;
}

/** Apply a typed value to whichever command owns the type-ins. */
export function setTyped(k, v) {
  const d = dimOwner();
  if (d && d.set) d.set(k, v);
}

/** Commit the field on Tab / Enter: expressions and comma lists. Returns the dim after the last filled one. */
export function commitDim(k) {
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
      const m = claimOwner();
      if (m && m.confirm) m.confirm("enter", e);
    } else if (e.key === "Escape") {
      e.preventDefault();
      const m = claimOwner();
      if (m && m.cancel) m.cancel();
    }
    e.stopPropagation();
  });
}

export function positionDimInputs(b) {
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

export function setDimNames(names) {
  DIM_ORDER.forEach((k, i) => { dimNames[k].textContent = names[i]; });
}

// --- preview reset -------------------------------------------------------------

/** Chrome cleanups a mode owns (e.g. bunk's note badges) — registered beside the mode. */
export const resetHooks = [];

export function clearPreview() {
  hideGhost();
  hideLoungeGhost();
  setDimNames(["W", "D", "H"]);
  hideSnapMarker();
  hideInference();
  hideAlignLines();
  hideFaceHint();
  hideCPlanePreview();
  for (const fn of resetHooks) fn();
  hideTip();
  dimBox.classList.add("hidden");
  if (document.activeElement && dimBox.contains(document.activeElement)) document.activeElement.blur();
}

// --- wall hits (shared by handle drags and the move command) ---------------------

export function wallHits(cab, pose) {
  const walls = new Set(job.getWalls().map((w) => w.id));
  return overlaps(cab, pose).filter((id) => walls.has(id));
}

// --- wall split drag -------------------------------------------------------------

export function beginWallSplit(e, hit) {
  const handle = hit.object.userData.handle;
  const dir = handle.axis === "z"
    ? new THREE.Vector3(0, 0, 1)
    : handle.along === "x" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
  const origin = hit.object.getWorldPosition(new THREE.Vector3());
  S.drag = {
    wallSplit: true,
    wallId: hit.object.userData.wallId,
    handle,
    dir,
    origin,
    t0: closestTOnLine(e.clientX, e.clientY, origin, dir),
    at0: handle.at,
    before: job.snapshot(),
  };
  canvas.setPointerCapture(e.pointerId);
  log("wall.split.start", { id: S.drag.wallId, axis: handle.axis, at: handle.at });
  emitMode();
}

export function wallSplitMove(e) {
  const delta = closestTOnLine(e.clientX, e.clientY, S.drag.origin, S.drag.dir) - S.drag.t0;
  const raw = S.drag.at0 + delta;
  const at = e.shiftKey ? Math.round(raw) : job.snap(raw);
  job.setWallSplit(S.drag.wallId, { axis: S.drag.handle.axis, at }, { history: false });
  const wall = job.getWall(S.drag.wallId);
  const cut = wall ? wallBoards(wall, job.getSpace(), job.getStock()) : null;
  const where = cut && cut.split ? Math.round(cut.split.at) : at;
  showTip(e.clientX, e.clientY, [
    `Cut ${where}`,
    cut ? cut.boards.map((b) => `${b.id} ${Math.round(b.length)}×${Math.round(b.height)}`).join(" · ") : null,
    (cut && cut.issues[0]) || (cut && cut.warnings[0]) || null,
  ], cut && cut.issues.length ? "warn" : "");
}

export function endWallSplit(e) {
  const d = S.drag;
  S.drag = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
  const changed = job.commitSnapshot(d.before);
  const wall = job.getWall(d.wallId);
  const cut = wall ? wallBoards(wall, job.getSpace(), job.getStock()) : null;
  log("wall.split", {
    id: d.wallId,
    axis: wall && wall.split ? wall.split.axis : d.handle.axis,
    from: d.at0,
    to: wall && wall.split ? wall.split.at : d.at0,
    changed,
    boards: cut ? cut.boards.map((b) => ({ id: b.id, length: Math.round(b.length), height: Math.round(b.height), fits: b.fits })) : undefined,
  });
  hideTip();
  emitMode();
}

// --- envelope handle drag ---------------------------------------------------------

export function beginHandleDrag(e, hit, cab) {
  const { handle, cabId } = hit.object.userData;
  const group = groupFor(cabId);
  const axis = handle.type === "W" ? "x" : handle.type === "D" ? "y" : handle.type === "divider" ? (handle.axis || "z") : "z";
  const dir = localAxisWorld(group, axis);
  const origin = hit.object.getWorldPosition(new THREE.Vector3());
  S.drag = {
    cabId, handle, dir, origin,
    t0: closestTOnLine(e.clientX, e.clientY, origin, dir),
    before: job.snapshot(),
    params0: cab.params,
    pose0: { ...cab.pose },
    result0: job.resultFor(cabId),
    grain0: (job.resultFor(cabId)?.grain?.issues || []).length,
  };
  // OrbitControls ignores the left button, so the middle button still orbits mid-drag.
  canvas.setPointerCapture(e.pointerId);
  log("handle.start", { id: cabId, handle: handle.type, index: handle.index, key: handle.key || undefined, envelope: getModule(cab.moduleId).envelope(cab.params) });
  setEnvelopeDrag(cabId);
  emitMode();
}

export function handleDragMove(e) {
  if (S.drag.wallSplit) { wallSplitMove(e); return; }
  const drag = S.drag;
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
  // HPL: a board may not grow past the sheet for its grain. Keep the last size that did not add an issue.
  const grainIssues = () => (job.resultFor(drag.cabId)?.grain?.issues || []);
  const keepGrain = (prev) => {
    const now = grainIssues();
    if (now.length <= drag.grain0) return;
    stopped = true;
    stoppedBy = now[now.length - 1].message;
    job.updateCabinet(drag.cabId, (c) => { c.params = prev.params; c.pose = prev.pose; });
  };
  const applyIfFits = (params, pose) => {
    const probe = { ...cab, params, pose };
    if (!poseFits(probe, pose)) { stopped = true; return; }
    const hits = wallHits(probe, pose);
    if (hits.length) { stopped = true; stoppedBy = hits[0]; return; }
    const prev = { params: cab.params, pose: { ...cab.pose } };
    job.updateCabinet(drag.cabId, (c) => { c.params = params; c.pose = pose; });
    keepGrain(prev);
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
    const prev = { params: cab.params, pose: { ...cab.pose } };
    job.setParams(drag.cabId, mod.setDivider(drag.params0, drag.result0, h.index, h.pos + delta), { history: false });
    keepGrain(prev);
  }
  const now = job.getJob().cabinets.find((c) => c.id === drag.cabId).params;
  const env = mod.envelope(now);
  // A layout bar (bedroom body) names the number it drives; a zone bar just says what it is.
  const val = h.type === "divider"
    ? (h.key && now[h.key] != null ? `${LAYOUT_LABEL[h.key] || h.key} ${Math.round(now[h.key])}` : "Zone boundary")
    : `${h.type} ${Math.round(h.type === "D" ? env.D + FRONT_THICKNESS_DEFAULT : env[h.type])}`;
  showTip(e.clientX, e.clientY, [val, stopped ? `Stopped at ${stoppedBy}` : null], stopped ? "warn" : "");
}

export function endDrag(e) {
  if (!S.drag) return;
  if (S.drag.wallSplit) { endWallSplit(e); return; }
  const d = S.drag;
  S.drag = null;
  setEnvelopeDrag(null);
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

export function cursorFor(handle) {
  if (!handle) return "";
  if (handle.type === "wallSplit") {
    if (handle.axis === "z") return "ns-resize";
    return handle.along === "x" ? "ew-resize" : "ns-resize";
  }
  if (handle.type === "divider") return handle.axis === "x" ? "ew-resize" : "ns-resize";
  if (handle.type === "H") return "ns-resize";
  return "ew-resize";
}
