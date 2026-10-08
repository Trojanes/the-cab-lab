// @module interact @owns nose.* — bedroom nose fill placement
// Nose placement (Bedroom). The module fills the vehicle's nose: front = nose
// cross-section, width = van width, height = roof; only the depth from the
// nose is chosen.
//   ready   the module is picked → the slab is already shown at the preset depth
//   drag    one click → the room-side face follows the cursor along +Y (snaps to
//           roof vertices / seam / cabinet faces); "From front" type-in
//   click / Enter → create (or re-size the existing one), Esc → cancel
import * as THREE from "three";
import { canvas, closestTOnLine } from "../space.js";
import * as job from "../job.js";
import { getModule } from "../modules.js";
import { maxClearHeight } from "../spaces.js";
import { envelopeFootprint } from "../fit.js";
import { nearestAxisAlign } from "../snap.js";
import { showNoseGhost } from "../cabinets3d.js";
import { showTip, hideTip } from "../hud.js";
import { log } from "../log.js";
import { cancelMeasure } from "../measureTool.js";
import {
  host, emitMode, clearPreview, registerMode, stopAll,
  dimBox, DIM_ORDER, dimInputs, dimLabels, focusDim, positionDimInputs, setDimNames,
} from "./shared.js";

let nose = null; // { moduleId, step: ready | drag, editId, D, t0, locked, snapLabel, clamped, lastClient }

export const noseActive = () => !!nose;
export const noseModuleId = () => (nose ? nose.moduleId : null);

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
  stopAll();
  host.stopResidents?.();
  cancelMeasure("tool off");
  host.clearPlacement?.();
  // One per vehicle: picking the module again edits the existing slab's depth.
  const existing = mod.single ? job.getJob().cabinets.find((c) => c.moduleId === moduleId) : null;
  const D = mod.fixedDepth
    ? mod.fixedDepth
    : existing
      ? mod.envelope(existing.params).D
      : Math.max(mod.minSize.D, Math.min(noseLength(), host.presetSize(moduleId, "y")));
  nose = { moduleId, step: "ready", editId: existing ? existing.id : null, D, t0: 0, locked: null, snapLabel: null, clamped: null, lastClient: null };
  job.select(existing ? existing.id : null);
  canvas.style.cursor = "crosshair";
  showNoseGhost(sp, D);
  log("nose.arm", { moduleId, editId: nose.editId, depth: D, preset: host.presetSize(moduleId, "y") });
  emitMode();
}

function noseBegin(e) {
  const mod = getModule(nose.moduleId);
  if (mod.fixedDepth) { nose.D = mod.fixedDepth; finishNose("click"); return; }
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
    getModule(nose.moduleId).fixedDepth
      ? `Mattress depth is fixed at ${Math.round(nose.D)} · click or Enter creates · Esc cancels`
      : `Click to drag the depth · Enter ${nose.editId ? "keeps it" : "creates it"} · Esc cancels`,
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

export const MODE = {
  mode: () => (nose ? (nose.step === "ready" ? "nose.ready" : "nose.drag") : null),
  typing: () => !!nose,
  dims: () => ({
    typable: () => ["D"],
    current: (k) => (k === "D" ? nose.D : 0),
    max: (k) => (k === "D" ? noseLength() : null),
    set: (k, v) => {
      if (k !== "D") return;
      nose.locked = v != null && v >= getModule(nose.moduleId).minSize.D ? v : null;
      log("nose.typein", { value: dimInputs.D.value, locked: nose.locked });
      if (nose.step === "drag") updateNose(null);
    },
  }),
  down(e) {
    if (!nose) return false;
    if (nose.step === "ready") noseBegin(e);
    else finishNose("click");
    return true;
  },
  hover(e) {
    if (!nose) return false;
    if (nose.step === "ready") noseHover(e);
    else updateNose(e);
    return true;
  },
  key(e) {
    if (!nose) return false;
    // Preset depth is already shown: Enter takes it, a digit opens the depth type-in.
    if (nose.step !== "ready") return false;
    if (e.key === "Enter") { e.preventDefault(); finishNose("enter"); return true; }
    if (e.key === "Escape") { cancelNose(); return true; }
    if (/^[0-9.+\-*/]$/.test(e.key)) {
      noseBegin(null);
      nose.locked = nose.D;
      updateNose(null);
      focusDim("D");
      dimInputs.D.value = "";
      return true;
    }
    return true;
  },
  confirm: (how) => { finishNose(how); return true; },
  cancel: () => { cancelNose(); return true; },
  leave: () => { if (nose) hideTip(); },
  tick: () => { if (nose && nose.step === "drag") positionDimInputs(noseBox()); },
  stop: () => cancelNose(),
};
registerMode(MODE);
