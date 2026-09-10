// Left-button interaction in the viewport.
//
//   idle   click board → select · click empty → deselect · press handle → drag W/D/H or divider
//   armed  (module picked) hover snaps to feature points · click → anchor
//   rubber mouse sets W/D from the anchor · Tab cycles W/D/H type-ins · click or Enter → create
//
// There is no drag-to-move: moving will be a dedicated command. Every edit
// writes pose or params through job.js and lets the generator redraw.
import * as THREE from "three";
import { canvas, controls, rayFromClient, planePointAt, closestTOnLine, frame } from "./space.js";
import * as job from "./job.js";
import { getModule } from "./modules.js";
import {
  pickables, groupFor, envelopeBox, poseFits, setHandleHover,
  showGhost, hideGhost, showSnapMarker, hideSnapMarker,
} from "./cabinets3d.js";
import { nearestSnap, toClient } from "./snap.js";

const FRONT_THICKNESS_DEFAULT = 16;

let placing = null; // moduleId while armed / rubber
let rubber = null; // { anchor:{x,y,z}, target:{x,y}, locked:{W,D,H}, growDown }
let hoverHandle = null;
let drag = null; // handle drag
let hoverSnap = null;
const modeListeners = new Set();

const dimBox = document.getElementById("dimInputs");
const dimInputs = { W: dimBox.querySelector('[data-dim="W"] input'), D: dimBox.querySelector('[data-dim="D"] input'), H: dimBox.querySelector('[data-dim="H"] input') };
const dimLabels = { W: dimBox.querySelector('[data-dim="W"]'), D: dimBox.querySelector('[data-dim="D"]'), H: dimBox.querySelector('[data-dim="H"]') };
const DIM_ORDER = ["W", "D", "H"];

export function onModeChange(fn) {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}
function emitMode() {
  for (const fn of modeListeners) fn(getMode());
}
export function getMode() {
  if (drag) return "handle";
  if (rubber) return "rubber";
  if (placing) return "armed";
  return "idle";
}
export function getPlacingModule() {
  return placing;
}

export function armPlacement(moduleId) {
  if (!job.hasSpace()) return;
  placing = moduleId;
  rubber = null;
  job.select(null);
  canvas.style.cursor = "crosshair";
  emitMode();
}
export function disarm() {
  placing = null;
  rubber = null;
  hideGhost();
  hideSnapMarker();
  dimBox.classList.add("hidden");
  canvas.style.cursor = "";
  emitMode();
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

// --- placement geometry ------------------------------------------------------

/** Cursor → world point: a feature point if one is near, else the grid on plane z. */
function cursorPoint(clientX, clientY, z) {
  const snap = nearestSnap(clientX, clientY);
  if (snap) return { x: snap.x, y: snap.y, z: snap.z, feature: true };
  const p = planePointAt(clientX, clientY, new THREE.Plane(new THREE.Vector3(0, 0, 1), -z));
  if (!p) return null;
  return { x: job.snap(p.x), y: job.snap(p.y), z, feature: false };
}

/** Current rubber box as a min-corner AABB. */
function rubberBox() {
  const mod = getModule(placing);
  const { anchor, target, locked } = rubber;
  // The box always lies between the anchor and the cursor. A typed (locked)
  // dimension keeps its length but still grows toward the cursor's side.
  const sx = target.x >= anchor.x ? 1 : -1;
  const sy = target.y >= anchor.y ? 1 : -1;
  const sz = rubber.growDown ? -1 : 1;
  let W = locked.W ?? Math.max(mod.minSize.W, Math.abs(target.x - anchor.x));
  let D = locked.D ?? Math.max(mod.minSize.D + FRONT_THICKNESS_DEFAULT, Math.abs(target.y - anchor.y));
  let H = locked.H ?? mod.defaultSize.H;
  // The box never leaves the space: stop each dimension at the boundary on its growth side.
  const sp = job.getSpace();
  if (sp) {
    W = Math.min(W, sx > 0 ? sp.bounds.maxX - anchor.x : anchor.x - sp.bounds.minX);
    D = Math.min(D, sy > 0 ? sp.bounds.maxY - anchor.y : anchor.y - sp.bounds.minY);
    H = Math.min(H, sz > 0 ? sp.height - anchor.z : anchor.z);
  }
  return {
    x0: sx > 0 ? anchor.x : anchor.x - W,
    y0: sy > 0 ? anchor.y : anchor.y - D,
    z0: sz > 0 ? anchor.z : anchor.z - H,
    W, D, H, sx, sy,
  };
}

function updateRubber() {
  const b = rubberBox();
  showGhost(b.x0, b.y0, b.z0, b.W, b.D, b.H);
  for (const k of DIM_ORDER) {
    if (document.activeElement !== dimInputs[k]) dimInputs[k].value = Math.round(b[k]);
    dimLabels[k].classList.toggle("locked", rubber.locked[k] != null);
  }
  positionDimInputs(b);
}

/** Put each type-in next to the middle of its edge. */
function positionDimInputs(b) {
  const r = canvas.getBoundingClientRect();
  // Screen offsets push the three labels off their edges so they don't stack.
  const place = (k, x, y, z, dx, dy) => {
    const c = toClient(x, y, z);
    dimLabels[k].style.left = `${c.x - r.left + dx}px`;
    dimLabels[k].style.top = `${c.y - r.top + dy}px`;
    dimLabels[k].style.display = c.behind ? "none" : "";
  };
  const yFront = b.y0; // edges on the near (−Y) side read best from the default camera
  place("W", b.x0 + b.W / 2, yFront, b.z0, 0, 22);
  place("D", b.x0 + b.W, b.y0 + b.D / 2, b.z0, 54, 0);
  place("H", b.x0 + b.W, yFront, b.z0 + b.H / 2, 54, -22);
}

function beginRubber(anchor) {
  const sp = job.getSpace();
  rubber = {
    anchor,
    target: { x: anchor.x, y: anchor.y },
    locked: { W: null, D: null, H: null },
    growDown: sp ? anchor.z >= sp.height - 1 : false,
  };
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked");
  updateRubber();
  emitMode();
}

function finishRubber() {
  const mod = getModule(placing);
  const b = rubberBox();
  const fpt = FRONT_THICKNESS_DEFAULT;
  // Cabinet local origin is the front carcass face; the rubber box includes the fronts.
  const cab = job.addCabinet(
    placing,
    { x: b.x0, y: b.y0 + fpt, z: b.z0, rotZ: 0 },
    { W: b.W, D: Math.max(mod.minSize.D, b.D - fpt), H: b.H },
  );
  disarm();
  if (!poseFits(cab, cab.pose)) console.warn("[place]", cab.id, "does not fit the space; see Checks");
}

// --- pointer -----------------------------------------------------------------

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;

  if (placing) {
    if (!rubber) {
      const p = cursorPoint(e.clientX, e.clientY, 0);
      if (p) beginRubber(p);
    } else {
      finishRubber();
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
    controls.enabled = false;
    canvas.setPointerCapture(e.pointerId);
    emitMode();
    return;
  }

  job.select(cabId);
});

canvas.addEventListener("pointermove", (e) => {
  if (drag) return handleDragMove(e);

  if (placing) {
    if (!rubber) {
      const p = cursorPoint(e.clientX, e.clientY, 0);
      if (p) showSnapMarker(p.x, p.y, p.z, { feature: p.feature });
      else hideSnapMarker();
      return;
    }
    const p = cursorPoint(e.clientX, e.clientY, rubber.anchor.z);
    if (!p) return;
    rubber.target = { x: p.x, y: p.y };
    if (p.feature) showSnapMarker(p.x, p.y, p.z, { feature: true });
    else hideSnapMarker();
    updateRubber();
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
  const applyIfFits = (params, pose) => {
    if (!poseFits({ ...cab, params, pose }, pose)) return;
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
}

function endDrag(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  controls.enabled = true;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
  job.commitSnapshot(d.before);
  emitMode();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

canvas.addEventListener("pointerleave", () => {
  if (placing && !rubber) hideSnapMarker();
});

function cursorFor(handle) {
  if (!handle) return "";
  if (handle.type === "divider" || handle.type === "H") return "ns-resize";
  return "ew-resize";
}

// Keep type-ins glued to the box while the camera moves.
(function tickDims() {
  if (rubber) positionDimInputs(rubberBox());
  requestAnimationFrame(tickDims);
})();

// --- dimension type-ins --------------------------------------------------------

function focusDim(k) {
  for (const kk of DIM_ORDER) dimLabels[kk].classList.toggle("focused", kk === k);
  dimInputs[k].focus();
  dimInputs[k].select();
}
function focusedDim() {
  return DIM_ORDER.find((k) => document.activeElement === dimInputs[k]) || null;
}

for (const k of DIM_ORDER) {
  const input = dimInputs[k];
  input.addEventListener("input", () => {
    if (!rubber) return;
    const v = Number(input.value);
    const mod = getModule(placing);
    const min = k === "D" ? mod.minSize.D + FRONT_THICKNESS_DEFAULT : mod.minSize[k];
    rubber.locked[k] = Number.isFinite(v) && v >= min ? v : null;
    updateRubber();
  });
  input.addEventListener("keydown", (e) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const i = DIM_ORDER.indexOf(k);
      focusDim(DIM_ORDER[(i + (e.shiftKey ? DIM_ORDER.length - 1 : 1)) % DIM_ORDER.length]);
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (rubber) finishRubber();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRubber();
    }
    e.stopPropagation();
  });
}

function cancelRubber() {
  rubber = null;
  hideGhost();
  dimBox.classList.add("hidden");
  canvas.focus?.();
  emitMode();
}

// --- keyboard ------------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;

  if (rubber) {
    if (e.key === "Tab") { e.preventDefault(); focusDim(focusedDim() || "W"); return; }
    if (e.key === "Enter") { e.preventDefault(); finishRubber(); return; }
    if (e.key === "Escape") { cancelRubber(); return; }
    // Typing a digit jumps straight into the W field.
    if (/^[0-9.]$/.test(e.key)) { focusDim("W"); dimInputs.W.value = ""; return; }
    return;
  }
  if (e.key === "Escape") {
    if (placing) disarm();
    else job.select(null);
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
  if (!sel) return;
  if (e.key === "Delete" || e.key === "Backspace") {
    job.removeCabinet(sel.id);
  } else if (e.key === "r" || e.key === "R") {
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