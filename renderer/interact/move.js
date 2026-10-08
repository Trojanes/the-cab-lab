// @module interact @owns move.* — triad arrows/rings, board-level move, undo step
// Move (M): one command, three ways to choose what moves, picked on the card.
// Free = arrows and rings; Face = two faces, same direction, the first moves
// onto the second's plane; Point = a corner onto another point, no rotation.
// The Face and Point pages live in align.js / pointAlign.js and register here
// through registerMovePage — one Move either way, Enter/Esc confirm/cancel the
// whole command.
import * as THREE from "three";
import { canvas, closestTOnLine, planePointAt } from "../space.js";
import * as job from "../job.js";
import { getModule } from "../modules.js";
import {
  poseOf, worldOf, boardOverride, translatePose, translatePoseBy, translateBoardOverride,
  translateBoardOverrideBy, rotatePoseAbout, rotateBoardOverride, boardFaceLocal, worldPlane, alignTranslation,
} from "../pose.js";
import { envelopeBox, envelopeFootprint, overlaps } from "../fit.js";
import { minClearHeight, roofName } from "../spaces.js";
import {
  setMoveOpen, placeMoveTriad, hideMoveTriad, layoutMoveTriad, setMoveHover,
  showFaceHint, hideFaceHint, showSnapMarker, hideSnapMarker, showInference, hideInference,
} from "../cabinets3d.js";
import { showTip, hideTip } from "../hud.js";
import { log } from "../log.js";
import { cancelBoard } from "../boardSketch.js";
import { endGroove } from "../grooveTool.js";
import { cancelMeasure } from "../measureTool.js";
import { host, emitMode, pick, clearPreview, registerMode, stopAll } from "./shared.js";

const moveCard = document.getElementById("moveCard");
const MOVE_KEYS = ["x", "y", "z", "rotX", "rotY", "rotZ"];

let move = null; // { id, target: module | panel, kind: free | face | point, boardId, pose0, overrides0, before, applying, drag, clamped }

// The Face / Point pages register themselves here. `sub` is the active page —
// it owns its state; Move only asks for state(), down(), hover(), lifecycle.
const PAGES = {};
let sub = null;
export function registerMovePage(kind, page) { PAGES[kind] = page; }
const subState = () => (sub && sub.state ? sub.state() : null);

export function moveState() { return move; }
export function cabById(id) {
  return job.getJob().cabinets.find((c) => c.id === id) || null;
}

export function moveRound(v) {
  return Math.round((v || 0) * 10) / 10;
}
export function cloneOverrides(overrides) {
  return overrides ? JSON.parse(JSON.stringify(overrides)) : undefined;
}
function moveCab() {
  return move && cabById(move.id);
}
function envelopeCenter(cab) {
  const env = envelopeBox(cab, job.resultFor(cab.id));
  return [(env.x0 + env.x1) / 2, (env.y0 + env.y1) / 2, (env.z0 + env.z1) / 2];
}
/** A module whose pose is rewritten from the bedroom body cannot be moved as a whole. */
export function modulePoseLocked(cab) {
  return !!getModule(cab.moduleId).attach;
}
function worldAxis(axis) {
  return axis === "x" ? new THREE.Vector3(1, 0, 0) : axis === "y" ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(0, 0, 1);
}

export function writeBoardOverride(cab, boardId, override) {
  // Keep what else hangs on this board (user grooves); only the nudge is rewritten.
  const clean = Object.fromEntries(Object.entries(cab.overrides?.boards?.[boardId] || {}).filter(([k]) => !MOVE_KEYS.includes(k)));
  for (const k of MOVE_KEYS) {
    const v = moveRound(override[k]);
    if (Math.abs(v) >= 0.05) clean[k] = v;
  }
  const boards = { ...(cab.overrides?.boards || {}) };
  if (Object.keys(clean).length) boards[boardId] = clean;
  else delete boards[boardId];
  const rest = { ...(cab.overrides || {}) };
  delete rest.boards;
  if (Object.keys(boards).length) cab.overrides = { ...rest, boards };
  else cab.overrides = Object.keys(rest).length ? rest : undefined;
}

/** Put the cabinet back to where this Move started. Switching target does this too. */
export function restoreMove() {
  const cab = moveCab();
  if (!cab) return;
  const pose = { ...move.pose0 };
  const overrides = cloneOverrides(move.overrides0);
  const norm = poseOf(pose);
  const samePose = MOVE_KEYS.every((k) => (cab.pose[k] || 0) === (norm[k] || 0));
  const sameOv = JSON.stringify(cab.overrides || null) === JSON.stringify(overrides || null);
  if (samePose && sameOv) return;
  move.applying = true;
  job.updateCabinet(move.id, (c) => {
    c.pose = pose;
    if (overrides) c.overrides = overrides;
    else delete c.overrides;
  });
  move.applying = false;
}

/** World centre of whatever the triad is driving, or null until a board is chosen. */
function moveTargetPoint(cab) {
  if (!cab) return null;
  if (move.target === "panel") {
    if (!move.boardId) return null;
    const b = (job.resultFor(cab.id)?.boards || []).find((x) => x.id === move.boardId);
    if (!b) return null;
    const o = boardOverride(cab.overrides?.boards?.[b.id]);
    return worldOf(cab.pose, [(b.x0 + b.x1) / 2 + o.x, (b.y0 + b.y1) / 2 + o.y, (b.z0 + b.z1) / 2 + o.z]);
  }
  return worldOf(cab.pose, envelopeCenter(cab));
}

export function refreshMoveUi() {
  if (!move) return;
  const cab = moveCab();
  const st = subState();
  for (const input of moveCard.querySelectorAll('input[name="moveKind"]')) input.checked = input.value === (move.kind || "free");
  for (const input of moveCard.querySelectorAll('input[name="moveTarget"]')) input.checked = input.value === move.target;
  const note = moveCard.querySelector("[data-move-note]");
  const boards = cab ? (job.resultFor(cab.id)?.boards || []) : [];
  if (move.kind === "face") {
    if (move.target === "panel" && !st?.source) note.textContent = "Click the board face that should move, then the face it lines up with.";
    else if (!st?.source) note.textContent = "Click the face that should move, then the face it lines up with.";
    else if (move.target === "panel") note.textContent = `${st.source.boardId} ${st.source.faceId} moves. Click the face to align it to.`;
    else note.textContent = `${st.source.boardId} ${st.source.faceId} moves the cabinet. Click the face to align it to.`;
    hideMoveTriad();
    canvas.style.cursor = "crosshair";
    return;
  }
  if (move.kind === "point") {
    if (!st?.source) note.textContent = move.target === "panel"
      ? "Click a corner of the board that should move, then the point it lands on."
      : "Click a corner of the cabinet that should move, then the point it lands on.";
    else note.textContent = move.target === "panel"
      ? `${st.source.boardId} moves. Click the point it should land on.`
      : "The cabinet moves. Click the point that corner should land on.";
    hideMoveTriad();
    canvas.style.cursor = "crosshair";
    return;
  }
  hideFaceHint();
  if (move.target === "module" && cab && modulePoseLocked(cab)) note.textContent = "This module follows the Bedroom body. Choose Panel to move one board.";
  else if (move.target === "panel" && !boards.length) note.textContent = "This module has no boards to move.";
  else if (move.target === "panel" && !move.boardId) note.textContent = "Click a board of this cabinet.";
  else if (move.target === "panel") note.textContent = `${move.boardId} · drag an arrow or a ring · Enter confirms · Esc cancels`;
  else note.textContent = "Drag an arrow or a ring · Enter confirms · Ctrl+Enter copies · Esc cancels";
  placeMoveTriad(moveTargetPoint(cab));
  canvas.style.cursor = "";
}

function endMoveChrome() {
  hideMoveTriad();
  setMoveHover(null);
  setMoveOpen(false);
  moveCard.classList.add("hidden");
  hideFaceHint();
  hideSnapMarker();
  hideInference();
  canvas.style.cursor = "";
}

export function startMove(id = job.getSelectedId()) {
  const cab = id && cabById(id);
  if (!cab) return;
  cancelBoard("tool off");
  if (move) {
    if (move.id === id) { cancelMove(); return; }
    cancelMove();
  }
  stopAll();
  host.stopResidents?.();
  host.stopPlacement?.();
  endGroove("tool off");
  cancelMeasure("tool off");
  const subSel = job.getSubSelection();
  const boardId = subSel && subSel.cabId === id ? subSel.boardId : null;
  move = {
    id, target: boardId ? "panel" : "module", kind: "free", boardId: boardId || null,
    pose0: { ...cab.pose }, overrides0: cloneOverrides(cab.overrides),
    before: job.snapshot(), applying: true, drag: null, clamped: [],
  };
  if (boardId) job.select(id, { boardId, faceId: subSel.faceId || null });
  else job.select(id);
  move.applying = false;
  setMoveOpen(true);
  moveCard.classList.remove("hidden");
  log("move.start", { id, kind: "free", target: move.target, boardId: move.boardId, pose: move.pose0 });
  refreshMoveUi();
  emitMode();
}

/** The card's Module / Panel choice. Switching throws away the drag that has not been confirmed. */
function setMoveTarget(target) {
  if (!move || move.drag) { refreshMoveUi(); return; }
  if (move.target === target) return;
  restoreMove();
  move.target = target;
  move.boardId = null;
  move.applying = true;
  job.select(move.id);
  move.applying = false;
  sub?.onTarget?.(target);
  log("move.target", { id: move.id, kind: move.kind, target, boardId: null });
  refreshMoveUi();
  emitMode();
}

/** Free / Face / Point — different ways to choose what moves. One Move command either way. */
export function setMoveKind(kind) {
  if (!move || move.drag) { refreshMoveUi(); return; }
  if ((move.kind || "free") === kind) return;
  restoreMove();
  move.kind = kind;
  sub?.leave?.();
  sub = PAGES[kind] || null;
  hideFaceHint();
  hideSnapMarker();
  hideInference();
  sub?.enter?.();
  log("move.kind", { id: move.id, kind, target: move.target });
  refreshMoveUi();
  emitMode();
}

/**
 * The browser and the 3D view share one selection. In Panel mode a board click
 * (after a Module → Panel switch, a fresh click) becomes the thing the triad drives.
 */
function syncMoveSelection() {
  if (!move || move.applying || move.drag || sub?.applying?.()) return;
  const cab = job.getSelected();
  if (!cab) return;
  if (move.kind === "face" || move.kind === "point") {
    if (cab.id === move.id) return;
    restoreMove();
    move.id = cab.id;
    move.pose0 = { ...cab.pose };
    move.overrides0 = cloneOverrides(cab.overrides);
    sub?.clearSource?.();
    refreshMoveUi();
    return;
  }
  if (cab.id !== move.id) {
    restoreMove();
    move.id = cab.id;
    move.pose0 = { ...cab.pose };
    move.overrides0 = cloneOverrides(cab.overrides);
    move.boardId = null;
  }
  if (move.target !== "panel") { refreshMoveUi(); return; }
  const boardId = job.getSubSelection()?.boardId || null;
  if (boardId === move.boardId) { refreshMoveUi(); return; }
  restoreMove();
  move.boardId = boardId;
  log("move.target", { id: move.id, target: "panel", boardId });
  refreshMoveUi();
}

function planeVector(e, center, axis) {
  const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(axis, center);
  const hit = planePointAt(e.clientX, e.clientY, plane);
  if (!hit) return null;
  const v = hit.sub(center);
  v.addScaledVector(axis, -v.dot(axis));
  if (v.lengthSq() < 1) return null;
  return v.normalize();
}

function beginMoveDrag(e, ud) {
  const cab = moveCab();
  if (!cab) return;
  if (move.target === "panel" && !move.boardId) return;
  if (move.target === "module" && modulePoseLocked(cab)) return;
  const point = moveTargetPoint(cab);
  if (!point) return;
  const center = new THREE.Vector3(point[0], point[1], point[2]);
  const axis = worldAxis(ud.axis);
  move.drag = {
    op: ud.op, axis: ud.axis, center,
    basePose: poseOf(cab.pose),
    baseOverride: boardOverride(cab.overrides?.boards?.[move.boardId]),
    t0: ud.op === "translate" ? closestTOnLine(e.clientX, e.clientY, center, axis) : 0,
    v0: ud.op === "rotate" ? planeVector(e, center.clone(), axis) : null,
  };
  canvas.setPointerCapture(e.pointerId);
  canvas.style.cursor = "grabbing";
}

function applyMoveDrag(e) {
  const d = move.drag;
  const cab = moveCab();
  if (!cab || !d) return;
  if (d.op === "translate") {
    const delta = job.snap(closestTOnLine(e.clientX, e.clientY, d.center, worldAxis(d.axis)) - d.t0);
    if (move.target === "module") {
      const { pose, clamped } = clampPoseToSpace(cab, translatePose(d.basePose, d.axis, delta));
      move.clamped = clamped;
      job.updateCabinet(move.id, (c) => { c.pose = pose; });
    } else {
      move.clamped = [];
      const o = translateBoardOverride(d.basePose, d.baseOverride, d.axis, delta);
      job.updateCabinet(move.id, (c) => { writeBoardOverride(c, move.boardId, o); });
    }
  } else {
    const v1 = planeVector(e, d.center.clone(), worldAxis(d.axis));
    if (d.v0 && v1) {
      const cross = new THREE.Vector3().crossVectors(d.v0, v1);
      const angle = Math.round(Math.atan2(cross.dot(worldAxis(d.axis)), d.v0.dot(v1)) * 180 / Math.PI);
      if (move.target === "module") {
        const raw = rotatePoseAbout(d.basePose, d.axis, angle, envelopeCenter(cab));
        for (const k of MOVE_KEYS) raw[k] = moveRound(raw[k]);
        const { pose, clamped } = clampPoseToSpace(cab, raw);
        move.clamped = clamped;
        job.updateCabinet(move.id, (c) => { c.pose = pose; });
      } else {
        move.clamped = [];
        const o = rotateBoardOverride(d.basePose, d.baseOverride, d.axis, angle);
        job.updateCabinet(move.id, (c) => { writeBoardOverride(c, move.boardId, o); });
      }
    }
  }
  refreshMoveUi();
  const lines = moveTip(cab, e);
  const warn = (move.clamped || []).length || lines.some((line) => line.startsWith("Overlaps"));
  showTip(e.clientX, e.clientY, lines, warn ? "warn" : "");
}

function moveTip(cab, e) {
  const lines = [];
  if (move.target === "module") {
    const p0 = poseOf(move.pose0);
    const p = poseOf(cab.pose);
    lines.push(`ΔX ${Math.round(p.x - p0.x)}  ΔY ${Math.round(p.y - p0.y)}  ΔZ ${Math.round(p.z - p0.z)}`);
    lines.push(`rot ${Math.round(p.rotX)}  ${Math.round(p.rotY)}  ${Math.round(p.rotZ)}`);
    for (const c of move.clamped || []) lines.push(`Stopped at ${c}`);
    const ov = overlaps(cab, cab.pose);
    if (ov.length) lines.push(`Overlaps ${ov.join(", ")}`);
    if (e.ctrlKey) lines.push("Ctrl+Enter: copy");
  } else if (move.boardId) {
    const was = boardOverride(move.overrides0?.boards?.[move.boardId]);
    const o = boardOverride(cab.overrides?.boards?.[move.boardId]);
    lines.push(`${move.boardId}  Δ ${Math.round(o.x - was.x)}  ${Math.round(o.y - was.y)}  ${Math.round(o.z - was.z)}`);
    lines.push(`rot ${Math.round(o.rotX)}  ${Math.round(o.rotY)}  ${Math.round(o.rotZ)}`);
  }
  return lines;
}

function endMoveDrag(e) {
  if (!move || !move.drag) return;
  move.drag = null;
  if (e) try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* already released */ }
  canvas.style.cursor = "";
  hideTip();
}

/** Shift a pose back inside the space bounds; names the boundaries that stopped it. */
export function clampPoseToSpace(cab, pose0) {
  const pose = { ...pose0 };
  const clamped = [];
  const sp = job.getSpace();
  if (sp) {
    const fp = envelopeFootprint(cab, pose);
    const b = sp.bounds;
    if (fp.minX < b.minX) { pose.x += b.minX - fp.minX; clamped.push("left wall"); }
    if (fp.maxX > b.maxX) { pose.x -= fp.maxX - b.maxX; clamped.push("right wall"); }
    if (fp.minY < b.minY) { pose.y += b.minY - fp.minY; clamped.push("front wall"); }
    if (fp.maxY > b.maxY) { pose.y -= fp.maxY - b.maxY; clamped.push("back wall"); }
    if (fp.z0 < 0) { pose.z -= fp.z0; clamped.push("floor"); }
    // A roof-aware body (the bedroom) is already cut to the roof by its generator.
    // Its envelope is as tall as the highest point, so clamping that box under the
    // lowest roof over the footprint shoves the whole body through the floor.
    if (!getModule(cab.moduleId).roofAware) {
      const fp2 = envelopeFootprint(cab, pose);
      const roof = minClearHeight(sp, fp2.minY, fp2.maxY);
      if (fp2.z1 > roof) { pose.z -= fp2.z1 - roof; clamped.push(roofName(sp, fp2.minY, fp2.maxY)); }
    }
  }
  return { pose, clamped };
}

export function finishMove(copy) {
  if (!move) return;
  endMoveDrag();
  const m = move;
  const cab = moveCab();
  const mod = cab && getModule(cab.moduleId);
  const locked = !!(mod && mod.attach);
  sub?.leave?.();
  sub = null;
  move = null;
  if (copy && cab && m.target === "module" && !locked) {
    const pose = poseOf(cab.pose);
    const overrides = cloneOverrides(cab.overrides);
    const params = JSON.parse(JSON.stringify(cab.params));
    job.updateCabinet(m.id, (c) => {
      c.pose = { ...m.pose0 };
      if (m.overrides0) c.overrides = cloneOverrides(m.overrides0);
      else delete c.overrides;
    });
    const twin = job.addCabinet(cab.moduleId, pose, mod.envelope(params));
    job.updateCabinet(twin.id, (c) => {
      c.params = params;
      c.pose = pose;
      if (overrides) c.overrides = overrides;
    });
    log("move.copy", { from: m.id, to: twin.id, pose, target: "module" });
  } else {
    const changed = job.commitSnapshot(m.before);
    log("move.finish", {
      id: m.id, kind: m.kind || "free", how: "enter", target: m.target, boardId: m.boardId || null,
      from: m.pose0, to: cab ? poseOf(cab.pose) : null,
      override: m.target === "panel" && m.boardId ? boardOverride(cab?.overrides?.boards?.[m.boardId]) : null,
      clamped: m.clamped || [], changed,
    });
  }
  endMoveChrome();
  clearPreview();
  emitMode();
}

export function cancelMove() {
  if (!move) return;
  const m = move;
  endMoveDrag();
  restoreMove();
  sub?.leave?.();
  sub = null;
  move = null;
  log("move.cancel", { id: m.id, kind: m.kind || "free", target: m.target, boardId: m.boardId || null });
  endMoveChrome();
  hideFaceHint();
  hideSnapMarker();
  hideInference();
  clearPreview();
  emitMode();
}

moveCard.addEventListener("change", (e) => {
  if (e.target.name === "moveKind") setMoveKind(e.target.value);
  else if (e.target.name === "moveTarget") setMoveTarget(e.target.value);
});
moveCard.addEventListener("keydown", (e) => {
  if (!move) return;
  if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); finishMove(e.ctrlKey); }
  else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancelMove(); }
});
for (const type of ["pointerdown", "pointerup", "wheel", "contextmenu", "dblclick"]) {
  moveCard.addEventListener(type, (e) => e.stopPropagation());
}
job.onChange((kind) => {
  if (!move || move.applying) return;
  if (kind === "selection") syncMoveSelection();
  else if (kind === "job" && !move.drag && !moveCab()) cancelMove();
});

export const MODE = {
  mode: () => {
    if (!move) return null;
    if (move.kind === "face") return subState()?.source ? "move.face.target" : "move.face";
    if (move.kind === "point") return subState()?.source ? "move.point.target" : "move.point";
    return "move";
  },
  typing: () => false,
  down(e) {
    if (!move) return false;
    if (sub?.down) { sub.down(e); return true; }
    const hit = pick(e.clientX, e.clientY);
    const ud = hit && hit.object.userData;
    if (ud && ud.kind === "moveAxis") { beginMoveDrag(e, ud); return true; }
    if (move.target === "panel" && ud && ud.kind === "board" && ud.boardId && ud.cabId === move.id && ud.boardId !== move.boardId) {
      move.applying = true;
      job.select(move.id, { boardId: ud.boardId });
      move.applying = false;
      syncMoveSelection();
    }
    return true;
  },
  hover(e) {
    if (!move) return false;
    if (sub?.hover) { sub.hover(e); return true; }
    if (move.drag) { applyMoveDrag(e); return true; }
    const hit = pick(e.clientX, e.clientY);
    const ud = hit && hit.object.userData;
    if (ud && ud.kind === "moveAxis") {
      setMoveHover(hit.object);
      canvas.style.cursor = "grab";
      showTip(e.clientX, e.clientY, [ud.op === "rotate" ? `Rotate ${ud.axis.toUpperCase()}` : `Move ${ud.axis.toUpperCase()}`]);
    } else {
      setMoveHover(null);
      canvas.style.cursor = move.target === "panel" && !move.boardId ? "crosshair" : "";
      hideTip();
    }
    return true;
  },
  up(e) { endMoveDrag(e); },
  key(e) {
    if (!move) return false;
    if (e.key === "Enter") { e.preventDefault(); finishMove(e.ctrlKey); return true; }
    if (e.key === "Escape") { cancelMove(); return true; }
    return false; // other keys fall through, same as the old dispatch
  },
  tick() { if (move) layoutMoveTriad(); },
  cancel: () => cancelMove(),
  stop: () => cancelMove(),
};
registerMode(MODE);

// pose helpers re-exported so the pages import everything Move from here
export { boardFaceLocal, worldPlane, alignTranslation, translatePoseBy, translateBoardOverrideBy };
