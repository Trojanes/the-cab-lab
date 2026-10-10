// @module interact @owns orient.* — Face command (O), pending side flip
// Face command (O): click a side of a cabinet; its doors move to that side
// (pending, orange) until confirmed — click elsewhere or Enter. Esc restores.
// The box never moves: W/D swap and the origin lands on the corner the doors
// now start from. Pure math (rotZFacing / orientFit / …) lives in fit.js.
import { canvas, rayFromClient } from "../space.js";
import * as job from "../job.js";
import { getModule } from "../modules.js";
import { facePlanes, rayHitFace } from "../snap.js";
import { showFaceHint, hideFaceHint, flashFaceHint } from "../cabinets3d.js";
import { showTip, hideTip } from "../hud.js";
import { sideOfRotZ, sideLabel, orientFit } from "../fit.js";
import { log } from "../log.js";
import { emitMode, clearPreview, registerMode, stopAll, host } from "./shared.js";

let orient = null; // { id, pose0, params0, before, pending: face | null }

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
  stopAll();
  host.stopResidents?.();
  host.stopPlacement?.();
  const cab = id && job.getJob().cabinets.find((c) => c.id === id);
  if (!cab && !job.getJob().cabinets.length) return;
  if (cab && getModule(cab.moduleId).noOrient) {
    const why = getModule(cab.moduleId).noOrient;
    log("orient.blocked", { id: cab.id, reason: typeof why === "string" ? why : "module has a fixed door side", moduleId: cab.moduleId });
    return;
  }
  orient = { id: cab ? cab.id : null, pose0: cab ? { ...cab.pose } : null, params0: cab ? cab.params : null, before: job.snapshot(), pending: null };
  if (cab) job.select(cab.id);
  canvas.style.cursor = "crosshair";
  log("orient.start", { id: orient.id, pose: orient.pose0, side: cab ? sideOfRotZ(cab.pose.rotZ) : null });
  emitMode();
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

export const MODE = {
  mode: () => (orient ? (orient.pending ? "orient.pending" : "orient.pick") : null),
  typing: () => false,
  down(e) { if (!orient) return false; orientClick(e); return true; },
  hover(e) { if (!orient) return false; orientHover(e); return true; },
  key(e) {
    if (!orient) return false;
    if (e.key === "Enter") { e.preventDefault(); finishOrient("enter"); }
    else if (e.key === "Escape") cancelOrient();
    return true;
  },
  leave() {
    if (!orient) return;
    const pend = pendingFace();
    if (pend) showFaceHint(pend, { tone: "pending" });
    else hideFaceHint();
    hideTip();
  },
  confirm: (how) => finishOrient(how),
  cancel: () => cancelOrient(),
  stop: () => cancelOrient(),
};
registerMode(MODE);
