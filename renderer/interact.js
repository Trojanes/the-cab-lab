// Left-button interaction in the viewport: place a module box, select,
// move, pull envelope faces, drag zone dividers. Every drag writes pose or
// params through job.js and lets the generator redraw.
import * as THREE from "three";
import { canvas, controls, rayFromClient, floorPointAt, planePointAt, closestTOnLine, frame } from "./space.js";
import * as job from "./job.js";
import { getModule } from "./modules.js";
import { pickables, groupFor, envelopeBox, setHandleHover, showGhost, hideGhost } from "./cabinets3d.js";

const DRAG_THRESHOLD_PX = 4;
const MIN_DRAG_BOX_MM = 50;

let placing = null; // moduleId while a module is armed
let hoverHandle = null;
let drag = null;
const modeListeners = new Set();

export function onModeChange(fn) {
  modeListeners.add(fn);
  return () => modeListeners.delete(fn);
}
function emitMode() {
  for (const fn of modeListeners) fn(getMode());
}
export function getMode() {
  if (drag) return drag.kind;
  if (placing) return "placing";
  return "idle";
}
export function getPlacingModule() {
  return placing;
}

export function armPlacement(moduleId) {
  placing = moduleId;
  job.select(null);
  canvas.style.cursor = "crosshair";
  emitMode();
}
export function disarm() {
  placing = null;
  hideGhost();
  canvas.style.cursor = "";
  emitMode();
}

function pick(clientX, clientY) {
  const ray = rayFromClient(clientX, clientY);
  const rc = new THREE.Raycaster(ray.origin, ray.direction);
  const hits = rc.intersectObjects(pickables(), false);
  // Handles win over boards regardless of depth order.
  const handle = hits.find((h) => h.object.userData.kind === "handle");
  return handle || hits[0] || null;
}

function localAxisWorld(group, axis) {
  const v = axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
  return v.transformDirection(group.matrixWorld).normalize();
}

/** World-space XY bounds of the cabinet envelope for the given pose. */
function envelopeWorldAabb(cab, pose) {
  const env = envelopeBox(cab, job.resultFor(cab.id));
  const a = ((pose.rotZ || 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const corners = [[env.x0, env.y0], [env.x1, env.y0], [env.x1, env.y1], [env.x0, env.y1]];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [lx, ly] of corners) {
    const wx = pose.x + lx * c - ly * s;
    const wy = pose.y + lx * s + ly * c;
    minX = Math.min(minX, wx); maxX = Math.max(maxX, wx);
    minY = Math.min(minY, wy); maxY = Math.max(maxY, wy);
  }
  return { minX, minY, maxX, maxY };
}

function clampPoseToSpace(cab, pose) {
  const sp = job.getJob().space;
  const bb = envelopeWorldAabb(cab, pose);
  let dx = 0, dy = 0;
  if (bb.minX < 0) dx = -bb.minX;
  else if (bb.maxX > sp.width) dx = sp.width - bb.maxX;
  if (bb.minY < 0) dy = -bb.minY;
  else if (bb.maxY > sp.depth) dy = sp.depth - bb.maxY;
  return { ...pose, x: pose.x + dx, y: pose.y + dy };
}

// --- pointer -----------------------------------------------------------------

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (placing) {
    const p = floorPointAt(e.clientX, e.clientY);
    if (!p) return;
    drag = { kind: "place", start: { x: job.snap(p.x), y: job.snap(p.y) }, cur: null };
    canvas.setPointerCapture(e.pointerId);
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
    const t0 = closestTOnLine(e.clientX, e.clientY, origin, dir);
    drag = {
      kind: "handle",
      cabId,
      handle,
      dir,
      origin,
      t0,
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

  // Board: select, and maybe start moving.
  job.select(cabId);
  const plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -cab.pose.z);
  const p0 = planePointAt(e.clientX, e.clientY, plane);
  drag = {
    kind: "move",
    cabId,
    plane,
    p0,
    pose0: { ...cab.pose },
    startPx: { x: e.clientX, y: e.clientY },
    moved: false,
    before: job.snapshot(),
  };
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener("pointermove", (e) => {
  if (!drag) {
    // Hover feedback on handles.
    const hit = job.getSelectedId() ? pick(e.clientX, e.clientY) : null;
    const h = hit && hit.object.userData.kind === "handle" ? hit.object : null;
    if (h !== hoverHandle) {
      setHandleHover(hoverHandle, false);
      setHandleHover(h, true);
      hoverHandle = h;
    }
    if (!placing) canvas.style.cursor = h ? cursorFor(h.userData.handle) : hit ? "move" : "";
    return;
  }

  if (drag.kind === "place") {
    const p = floorPointAt(e.clientX, e.clientY);
    if (!p) return;
    drag.cur = { x: job.snap(p.x), y: job.snap(p.y) };
    const mod = getModule(placing);
    const W = Math.abs(drag.cur.x - drag.start.x);
    const D = Math.abs(drag.cur.y - drag.start.y);
    const small = W < MIN_DRAG_BOX_MM || D < MIN_DRAG_BOX_MM;
    const x0 = small ? drag.start.x : Math.min(drag.start.x, drag.cur.x);
    const y0 = small ? drag.start.y : Math.min(drag.start.y, drag.cur.y);
    showGhost(x0, y0, small ? mod.defaultSize.W : W, small ? mod.defaultSize.D : D, mod.defaultSize.H);
    return;
  }

  if (drag.kind === "move") {
    if (!drag.moved) {
      const dx = e.clientX - drag.startPx.x;
      const dy = e.clientY - drag.startPx.y;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
      drag.moved = true;
      controls.enabled = false;
      emitMode();
    }
    const p = planePointAt(e.clientX, e.clientY, drag.plane);
    if (!p || !drag.p0) return;
    const cab = job.getJob().cabinets.find((c) => c.id === drag.cabId);
    if (!cab) return;
    let pose = {
      ...drag.pose0,
      x: job.snap(drag.pose0.x + (p.x - drag.p0.x)),
      y: job.snap(drag.pose0.y + (p.y - drag.p0.y)),
    };
    pose = clampPoseToSpace(cab, pose);
    job.setPose(drag.cabId, pose, { history: false });
    return;
  }

  if (drag.kind === "handle") {
    const t = closestTOnLine(e.clientX, e.clientY, drag.origin, drag.dir);
    const delta = t - drag.t0;
    const cab = job.getJob().cabinets.find((c) => c.id === drag.cabId);
    if (!cab) return;
    const mod = getModule(cab.moduleId);
    const env0 = mod.envelope(drag.params0);
    const h = drag.handle;

    if (h.type === "W") {
      const W = Math.max(mod.minSize.W, job.snap(env0.W + delta));
      job.setParams(drag.cabId, mod.setEnvelope(drag.params0, { W }), { history: false });
    } else if (h.type === "D") {
      // Front face is pulled; keep the back (local y = D) where it is.
      const D = Math.max(mod.minSize.D, job.snap(env0.D - delta));
      const shift = env0.D - D;
      const yDir = drag.dir; // local +Y in world
      job.updateCabinet(drag.cabId, (c) => {
        c.params = mod.setEnvelope(drag.params0, { D });
        c.pose = { ...drag.pose0, x: drag.pose0.x + yDir.x * shift, y: drag.pose0.y + yDir.y * shift };
      });
    } else if (h.type === "H") {
      const H = Math.max(mod.minSize.H, job.snap(env0.H + delta));
      job.setParams(drag.cabId, mod.setEnvelope(drag.params0, { H }), { history: false });
    } else if (h.type === "divider") {
      const pos = h.pos + delta;
      job.setParams(drag.cabId, mod.setDivider(drag.params0, drag.result0, h.index, pos), { history: false });
    }
  }
});

function endDrag(e) {
  if (!drag) return;
  const d = drag;
  drag = null;
  controls.enabled = true;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }

  if (d.kind === "place") {
    hideGhost();
    const mod = getModule(placing);
    const cur = d.cur || d.start;
    let W = Math.abs(cur.x - d.start.x);
    let D = Math.abs(cur.y - d.start.y);
    let x0 = Math.min(d.start.x, cur.x);
    let y0 = Math.min(d.start.y, cur.y);
    if (W < MIN_DRAG_BOX_MM || D < MIN_DRAG_BOX_MM) {
      W = mod.defaultSize.W;
      D = mod.defaultSize.D;
      x0 = d.start.x;
      y0 = d.start.y;
    }
    W = Math.max(mod.minSize.W, W);
    D = Math.max(mod.minSize.D, D);
    const fpt = 16;
    // Local origin is the front carcass face (y = 0); the dragged box includes the fronts.
    const cab = job.addCabinet(placing, { x: x0, y: y0 + fpt, z: 0, rotZ: 0 }, { W, D: D - fpt, H: mod.defaultSize.H });
    job.setPose(cab.id, clampPoseToSpace(cab, cab.pose), { history: false });
    disarm();
    return;
  }

  if (d.kind === "move" || d.kind === "handle") {
    job.commitSnapshot(d.before);
  }
  emitMode();
}
canvas.addEventListener("pointerup", endDrag);
canvas.addEventListener("pointercancel", endDrag);

function cursorFor(handle) {
  if (!handle) return "";
  if (handle.type === "divider" || handle.type === "H") return "ns-resize";
  return "ew-resize";
}

// --- keyboard ----------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
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
      const sp = job.getJob().space;
      frame(new THREE.Vector3(sp.width / 2, sp.depth / 2, sp.height / 2), Math.hypot(sp.width, sp.depth, sp.height) / 2);
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
    const pose = {
      ...sel.pose,
      rotZ: (((sel.pose.rotZ || 0) + 90) % 360),
      x: job.snap(wx - (cx * Math.cos(a1) - cy * Math.sin(a1))),
      y: job.snap(wy - (cx * Math.sin(a1) + cy * Math.cos(a1))),
    };
    job.setPose(sel.id, clampPoseToSpace(sel, pose));
  }
});
