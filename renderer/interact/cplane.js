// Construction plane (P). Click a wall or cabinet face, offset a parallel
// plane into the room, click / Enter to leave it. The plane is infinite
// (axis = value); what you see is plane ∩ space. Its outline vertices are
// feature points for placement.
import * as THREE from "three";
import { canvas, closestTOnLine } from "../space.js";
import * as job from "../job.js";
import { slicePlane } from "../spaces.js";
import { pickFace, extrudeRoom, nearestAxisAlign, axisVector } from "../snap.js";
import { showFaceHint, hideFaceHint, showCPlanePreview } from "../cabinets3d.js";
import { showTip, hideTip } from "../hud.js";
import { log } from "../log.js";
import { cancelBoard } from "../boardSketch.js";
import { endGroove } from "../grooveTool.js";
import { cancelMeasure } from "../measureTool.js";
import {
  host, emitMode, clearPreview, registerMode, stopAll, DIM_OF,
  dimBox, DIM_ORDER, dimInputs, dimLabels, positionDimInputs, setDimNames,
} from "./shared.js";

const PLANE_MIN = 10;

let cplane = null; // { step: pick | offset, face, offset, locked, snapLabel, clamped }

export const planeActive = () => !!cplane;

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
  cancelBoard("tool off");
  endGroove("tool off");
  cancelMeasure("tool off");
  stopAll();
  host.stopResidents?.();
  host.clearPlacement?.();
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

export const MODE = {
  mode: () => (cplane ? (cplane.step === "pick" ? "plane.pick" : "plane.offset") : null),
  typing: () => !!(cplane && cplane.step === "offset"),
  dims: () => ({
    typable: () => ["W"],
    current: (k) => (k === "W" ? cplane.offset : 0),
    max: () => (cplane.face ? extrudeRoom(cplane.face) : null),
    set: (k, v) => {
      if (!cplane || cplane.step !== "offset" || k !== "W") return;
      cplane.locked = v != null && v >= PLANE_MIN ? v : null;
      log("plane.typein", { value: dimInputs.W.value, locked: cplane.locked });
      updatePlane(null);
    },
  }),
  down(e) {
    if (!cplane) return false;
    if (cplane.step === "pick") {
      const hit = pickFace(e.clientX, e.clientY);
      if (hit) planeBeginOffset(hit.face);
    } else finishPlane("click");
    return true;
  },
  hover(e) {
    if (!cplane) return false;
    if (cplane.step === "pick") planeHoverPick(e);
    else updatePlane(e);
    return true;
  },
  key(e) {
    if (!cplane) return false;
    if (cplane.step === "pick") {
      if (e.key === "Escape") cancelPlane();
      return true;
    }
    return false; // offset step → typing machinery
  },
  confirm: (how) => { if (cplane?.step === "offset") finishPlane(how); return true; },
  cancel: () => { cancelPlane(); return true; },
  leave: () => { if (cplane) hideTip(); },
  tick: () => { if (cplane && cplane.step === "offset") positionDimInputs(planeBox()); },
  stop: () => cancelPlane(),
};
registerMode(MODE);
