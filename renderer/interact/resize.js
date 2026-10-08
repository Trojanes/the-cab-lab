// Resize: pull one envelope face. One command for every module — click a face
// of a cabinet's box, drag the arrow on it. The opposite face stays; the module
// decides which faces it offers (`resizeFaces`) and what its zones do
// (`resizeFace`). One drag = one undo step.
import * as THREE from "three";
import { canvas, rayFromClient, closestTOnLine } from "../space.js";
import * as job from "../job.js";
import { getModule, isBaseCabinet, DIM_OF_AXIS } from "../modules.js";
import {
  groupFor, setResizeState, pickEnvelopeFace, envelopeFaceWorld, setEnvelopeDrag,
  showFaceHint, hideFaceHint, setHandleHover,
} from "../cabinets3d.js";
import { overheadWidthFaces, uiScale, INFER_BAND_PX, toClient } from "../snap.js";
import { showTip, hideTip } from "../hud.js";
import { poseFits, overlaps, blockingIssues } from "../fit.js";
import { log } from "../log.js";
import { cancelBoard } from "../boardSketch.js";
import { endGroove } from "../grooveTool.js";
import { cancelMeasure } from "../measureTool.js";
import { S, host, emitMode, pick, localAxisWorld, clearPreview, registerMode, stopAll } from "./shared.js";

let resize = null; // { face: { cabId, axis, dir } | null, drag: null | {...} }

const SIDE_LABEL = { "x-": "left side", "x+": "right side", "y-": "front", "y+": "back", "z-": "bottom", "z+": "top" };
const sideKey = (f) => `${f.axis}${f.dir > 0 ? "+" : "-"}`;
const resizeFacesOf = (mod) => mod.resizeFaces || [];

export function startResize() {
  if (resize) { endResize("toggle"); return; }
  if (!job.getJob().cabinets.length) return;
  stopAll();
  host.stopResidents?.();
  cancelBoard("tool off");
  endGroove("tool off");
  host.stopPlacement?.();
  cancelMeasure("tool off");
  resize = { face: null, drag: null };
  setResizeState(true, null);
  canvas.style.cursor = "crosshair";
  log("resize.start", {});
  emitMode();
}

export function endResize(how = "esc") {
  if (!resize) return;
  const r = resize;
  resize = null;
  setResizeState(false);
  clearPreview();
  canvas.style.cursor = "";
  log("resize.exit", { how, face: r.face });
  emitMode();
}

function resizeFaceLabel(f) {
  return SIDE_LABEL[sideKey(f)];
}

function resizeHover(e) {
  const hit = pick(e.clientX, e.clientY);
  const ud = hit && hit.object.userData;
  if (ud && ud.kind === "handle" && ud.handle.type === "resize") {
    setHandleHover(hit.object, true);
    S.hoverHandle = hit.object;
    canvas.style.cursor = "grab";
    const cab = job.getJob().cabinets.find((c) => c.id === ud.cabId);
    const env = getModule(cab.moduleId).envelope(cab.params);
    showTip(e.clientX, e.clientY, [`Drag: ${resizeFaceLabel(ud.handle)} · ${DIM_OF_AXIS[ud.handle.axis]} ${Math.round(env[DIM_OF_AXIS[ud.handle.axis]])}`, "The opposite face stays"]);
    return;
  }
  if (S.hoverHandle) { setHandleHover(S.hoverHandle, false); S.hoverHandle = null; }
  const f = pickEnvelopeFace(rayFromClient(e.clientX, e.clientY));
  const chosen = resize.face && job.getJob().cabinets.find((c) => c.id === resize.face.cabId);
  const chosenHint = chosen ? envelopeFaceWorld(chosen, resize.face.axis, resize.face.dir) : null;
  if (!f) {
    if (chosenHint) showFaceHint(chosenHint, { tone: "pending" }); else hideFaceHint();
    canvas.style.cursor = "crosshair";
    showTip(e.clientX, e.clientY, [resize.face ? "Drag the arrow · click another face · Esc ends" : "Click a face of a module"]);
    return;
  }
  const cab = job.getJob().cabinets.find((c) => c.id === f.cabId);
  const mod = getModule(cab.moduleId);
  const ok = resizeFacesOf(mod).includes(sideKey(f));
  const same = resize.face && resize.face.cabId === f.cabId && resize.face.axis === f.axis && resize.face.dir === f.dir;
  showFaceHint(envelopeFaceWorld(cab, f.axis, f.dir), { tone: same ? "pending" : ok ? "" : "warn" });
  canvas.style.cursor = ok ? "pointer" : "not-allowed";
  const env = mod.envelope(cab.params);
  showTip(e.clientX, e.clientY, ok
    ? [`${mod.label} · ${resizeFaceLabel(f)} · ${DIM_OF_AXIS[f.axis]} ${Math.round(env[DIM_OF_AXIS[f.axis]])}`, "Click to put the arrow on it"]
    : [`${mod.label} · ${resizeFaceLabel(f)} stays`, resizeFacesOf(mod).length ? `Pullable: ${resizeFacesOf(mod).map((k) => SIDE_LABEL[k]).join(", ")}` : "This module has no pullable face"], ok ? "" : "warn");
}

function resizeClick(e) {
  const hit = pick(e.clientX, e.clientY);
  const ud = hit && hit.object.userData;
  if (ud && ud.kind === "handle" && ud.handle.type === "resize") { beginResizeDrag(e, hit, ud); return; }
  const f = pickEnvelopeFace(rayFromClient(e.clientX, e.clientY));
  if (!f) return;
  const cab = job.getJob().cabinets.find((c) => c.id === f.cabId);
  const mod = getModule(cab.moduleId);
  const face = { cabId: f.cabId, axis: f.axis, dir: f.dir };
  if (!resizeFacesOf(mod).includes(sideKey(f))) {
    log("resize.blocked", { id: cab.id, moduleId: cab.moduleId, face: { axis: f.axis, dir: f.dir, label: resizeFaceLabel(f) }, reason: "face is fixed", pullable: resizeFacesOf(mod) });
    return;
  }
  resize.face = face;
  job.select(cab.id);
  setResizeState(true, face);
  log("resize.face", { id: cab.id, moduleId: cab.moduleId, face: { axis: f.axis, dir: f.dir, label: resizeFaceLabel(f) }, envelope: mod.envelope(cab.params) });
  resizeHover(e);
  emitMode();
}

function beginResizeDrag(e, hit, ud) {
  const cab = job.getJob().cabinets.find((c) => c.id === ud.cabId);
  if (!cab) return;
  const group = groupFor(cab.id);
  const face = { axis: ud.handle.axis, dir: ud.handle.dir };
  const dir = localAxisWorld(group, face.axis).multiplyScalar(face.dir);
  const origin = hit.object.getWorldPosition(new THREE.Vector3());
  const mod = getModule(cab.moduleId);
  resize.drag = {
    cabId: cab.id, face, dir, origin,
    axisWorld: localAxisWorld(group, face.axis),
    t0: closestTOnLine(e.clientX, e.clientY, origin, dir),
    before: job.snapshot(),
    params0: cab.params,
    pose0: { ...cab.pose },
    env0: mod.envelope(cab.params),
    errors0: blockingIssues(job.resultFor(cab.id)).length,
    overlaps0: new Set(overlaps(cab, cab.pose)),
    lastGood: { params: cab.params, pose: { ...cab.pose } },
    stopped: null,
  };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
  log("resize.drag", { id: cab.id, face: { ...face, label: resizeFaceLabel(face) }, envelope: resize.drag.env0 });
  setEnvelopeDrag(cab.id);
  emitMode();
}

/** Pulling a kitchen's width face: snap onto an overhead's width side when the cursor is close. */
function kitchenWidthSnap(e, d, cab) {
  if (!isBaseCabinet(cab.moduleId) || d.face.axis !== "x") return null;
  const base = { ...cab, params: d.params0, pose: d.pose0 };
  const w0 = envelopeFaceWorld(base, d.face.axis, d.face.dir);
  const perMm = (d.face.dir > 0 ? 1 : -1) * (d.axisWorld[w0.axis] || 0);
  if (Math.abs(perMm) < 0.5) return null;
  const band = INFER_BAND_PX * uiScale();
  let best = null;
  for (const f of overheadWidthFaces()) {
    if (f.axis !== w0.axis) continue;
    const need = (f.value - w0.value) / perMm;
    const at = d.t0 + need;
    const c = toClient(d.origin.x + d.dir.x * at, d.origin.y + d.dir.y * at, d.origin.z + d.dir.z * at);
    if (c.behind) continue;
    const dist = Math.hypot(c.x - e.clientX, c.y - e.clientY);
    if (dist <= band && (!best || dist < best.dist)) best = { pulled: need, label: f.label, dist };
  }
  return best;
}

function resizeDragMove(e) {
  const d = resize.drag;
  const cab = job.getJob().cabinets.find((c) => c.id === d.cabId);
  if (!cab) return;
  const mod = getModule(cab.moduleId);
  const dim = DIM_OF_AXIS[d.face.axis];
  const L0 = d.env0[dim];
  const min = mod.minSize[dim];
  const rawPull = closestTOnLine(e.clientX, e.clientY, d.origin, d.dir) - d.t0;
  const widthSnap = kitchenWidthSnap(e, d, cab);
  const pulled = widthSnap ? widthSnap.pulled : job.snap(rawPull);
  const L = Math.max(min, Math.round((L0 + pulled) * 10) / 10);
  d.stopped = L0 + pulled < min ? `minimum ${min}` : null;

  const apply = (params, pose) => {
    job.updateCabinet(d.cabId, (c) => { c.pose = pose; });
    job.setParams(d.cabId, params, { history: false });
  };
  const params = mod.resizeFace ? mod.resizeFace(d.params0, d.face, L) : mod.setEnvelope(d.params0, { [dim]: L });
  if (!params) {
    d.stopped = "a zone at its minimum";
  } else {
    // The far face stays: a pull on a negative-side face moves the origin with it.
    const shift = d.face.dir < 0 ? L0 - L : 0;
    const pose = { ...d.pose0, x: d.pose0.x + d.axisWorld.x * shift, y: d.pose0.y + d.axisWorld.y * shift, z: (d.pose0.z || 0) + d.axisWorld.z * shift };
    const probe = { ...cab, params, pose };
    const fresh = overlaps(probe, pose).filter((id) => !d.overlaps0.has(id));
    if (!poseFits(probe, pose)) d.stopped = "the space boundary";
    else if (fresh.length) d.stopped = fresh[0];
    else {
      apply(params, pose);
      const errs = blockingIssues(job.resultFor(d.cabId));
      if (errs.length > d.errors0) {
        d.stopped = errs[0];
        apply(d.lastGood.params, d.lastGood.pose);
      } else {
        d.lastGood = { params, pose };
      }
    }
  }
  const now = job.getJob().cabinets.find((c) => c.id === d.cabId);
  const env = mod.envelope(now.params);
  showTip(e.clientX, e.clientY, [`${dim} ${Math.round(env[dim])}  (${env[dim] - L0 >= 0 ? "+" : ""}${Math.round(env[dim] - L0)})`, widthSnap ? `Flush with ${widthSnap.label}` : null, d.stopped ? `Stopped: ${d.stopped}` : null], d.stopped ? "warn" : "");
}

/** The documented V1 half-slot conflict still builds the cabinet, so a resize keeps that size. */

function zonesSummary(params) {
  if (Array.isArray(params.columns)) return params.columns.map((c) => ({ width: c.width, heights: (c.zones || []).map((z) => z.height) }));
  if (Array.isArray(params.zones)) return params.zones.map((z) => z.width ?? z.height ?? z.type);
  return undefined;
}

function endResizeDrag(e) {
  if (!resize || !resize.drag) return;
  const d = resize.drag;
  resize.drag = null;
  setEnvelopeDrag(null);
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
  const changed = job.commitSnapshot(d.before);
  const cab = job.getJob().cabinets.find((c) => c.id === d.cabId);
  const mod = cab && getModule(cab.moduleId);
  log("resize.end", {
    id: d.cabId, moduleId: cab ? cab.moduleId : null, face: { ...d.face, label: resizeFaceLabel(d.face) }, changed,
    from: { envelope: d.env0, pose: d.pose0, zones: zonesSummary(d.params0) },
    to: cab ? { envelope: mod.envelope(cab.params), pose: cab.pose, zones: zonesSummary(cab.params) } : null,
    stopped: d.stopped || undefined,
  });
  hideTip();
  canvas.style.cursor = "grab";
  emitMode();
}

export const MODE = {
  mode: () => (resize ? (resize.drag ? "resize.drag" : resize.face ? "resize.face" : "resize.pick") : null),
  typing: () => false,
  down(e) { if (!resize) return false; resizeClick(e); return true; },
  hover(e) { if (!resize) return false; if (resize.drag) resizeDragMove(e); else resizeHover(e); return true; },
  up(e) { if (resize && resize.drag) endResizeDrag(e); },
  key(e) {
    if (!resize) return false;
    if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); if (!resize.drag) endResize(e.key === "Enter" ? "enter" : "esc"); return true; }
    if ((e.key === "s" || e.key === "S") && !e.ctrlKey && !e.metaKey && !e.altKey) { endResize("key"); return true; }
    return false; // other keys fall through, same as the old dispatch
  },
  cancel: () => endResize("esc"),
  stop: () => endResize("tool off"),
};
registerMode(MODE);
