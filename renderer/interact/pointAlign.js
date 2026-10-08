// @module interact @owns pointalign.* — point-to-point translate (a Move page)
// Point align — a page of Move (M).
// Fusion point-to-point: translate, never rotate, so the first point lands on
// the second. Module slides the whole cabinet; Panel slides only that board.
// Two points on the same rigid piece cannot be brought together this way.
import * as job from "../job.js";
import { boardCorners, nearestSnap, describePoint, toClient, uiScale, SNAP_RADIUS_PX } from "../snap.js";
import { showSnapMarker, hideSnapMarker, showInference, hideInference } from "../cabinets3d.js";
import { showTip, hideTip } from "../hud.js";
import { log } from "../log.js";
import { emitMode } from "./shared.js";
import {
  moveState, cabById, registerMovePage, setMoveKind, startMove, restoreMove, refreshMoveUi,
  cloneOverrides, moveRound, clampPoseToSpace, modulePoseLocked, writeBoardOverride,
  translatePoseBy, translateBoardOverrideBy,
} from "./move.js";

let pointAlign = null; // { mode: module | panel, source: {cabId, boardId, x, y, z, label} | null, before }

function pointOnMovingBody(pt) {
  if (!pointAlign?.source || !pt?.cabId) return false;
  if (pointAlign.mode === "panel") return pt.cabId === pointAlign.source.cabId && pt.boardId === pointAlign.source.boardId;
  return pt.cabId === pointAlign.source.cabId;
}

function nearestOwnedPoint(clientX, clientY) {
  const max = SNAP_RADIUS_PX * uiScale();
  let best = null;
  let bestD = max;
  for (const p of boardCorners()) {
    const c = toClient(p.x, p.y, p.z);
    if (c.behind) continue;
    const d = Math.hypot(c.x - clientX, c.y - clientY);
    if (d < bestD) { bestD = d; best = p; }
  }
  return best
    ? { x: best.x, y: best.y, z: best.z, cabId: best.cabId, boardId: best.boardId, label: best.label, kind: "board", dist: bestD }
    : null;
}

/** The point under the cursor: a board corner, or (for the target) a space / cabinet snap point. */
function pointHit(clientX, clientY, { ownedOnly = false } = {}) {
  const owned = nearestOwnedPoint(clientX, clientY);
  if (ownedOnly) return owned;
  const snap = nearestSnap(clientX, clientY);
  let snapD = Infinity;
  if (snap) {
    const c = toClient(snap.x, snap.y, snap.z);
    if (!c.behind) snapD = Math.hypot(c.x - clientX, c.y - clientY);
  }
  if (owned && (!snap || owned.dist <= snapD)) return owned;
  if (snap && snapD <= SNAP_RADIUS_PX * uiScale()) {
    return { x: snap.x, y: snap.y, z: snap.z, label: describePoint(snap), kind: "snap", sources: snap.sources };
  }
  return null;
}

function refreshPointUi() {
  if (!pointAlign) return;
  pointAlign.mode = moveState()?.target || pointAlign.mode;
  refreshMoveUi();
  if (pointAlign.source) showSnapMarker(pointAlign.source.x, pointAlign.source.y, pointAlign.source.z, { feature: true });
}

/** Point alignment is a page of Move. */
export function startPointAlign() {
  if (!moveState()) startMove();
  if (moveState()) setMoveKind("point");
}

function setPointMode(mode) {
  if (!pointAlign || pointAlign.mode === mode) return;
  pointAlign.mode = mode;
  pointAlign.source = null;
  hideSnapMarker();
  const id = job.getSelectedId();
  if (id && cabById(id)) job.select(id);
  log("pointalign.mode", { mode });
  refreshPointUi();
  emitMode();
}

function endPointChrome() {
  hideSnapMarker();
  hideInference();
  hideTip();
}

export function cancelPointAlign() {
  if (!pointAlign) return;
  const p = pointAlign;
  pointAlign = null;
  log("pointalign.cancel", { mode: p.mode, source: p.source });
  endPointChrome();
  emitMode();
}

function finishPointAlign(target, e) {
  const src = pointAlign.source;
  if (pointOnMovingBody(target)) {
    const reason = pointAlign.mode === "panel" ? "that point is on the same board" : "that point is on the same cabinet";
    log("pointalign.blocked", { reason, mode: pointAlign.mode, source: src, fixed: target.label });
    showTip(e.clientX, e.clientY, [reason], "warn");
    return;
  }
  const cab = cabById(src.cabId);
  if (!cab) return;
  if (pointAlign.mode === "module" && modulePoseLocked(cab)) {
    log("pointalign.blocked", { reason: "this module follows the Bedroom body — use Panel", mode: "module", source: src });
    showTip(e.clientX, e.clientY, ["This module follows the Bedroom body — use Panel"], "warn");
    return;
  }
  const delta = [target.x - src.x, target.y - src.y, target.z - src.z];
  const mode = pointAlign.mode;
  let clamped = [];
  if (mode === "module") {
    const raw = translatePoseBy(cab.pose, delta);
    for (const k of ["x", "y", "z"]) raw[k] = moveRound(raw[k]);
    const stopped = clampPoseToSpace(cab, raw);
    clamped = stopped.clamped;
    job.updateCabinet(cab.id, (c) => { c.pose = stopped.pose; });
  } else {
    const o = translateBoardOverrideBy(cab.pose, cab.overrides?.boards?.[src.boardId], delta);
    job.updateCabinet(cab.id, (c) => { writeBoardOverride(c, src.boardId, o); });
  }
  log("pointalign.finish", {
    mode, source: { cabId: src.cabId, boardId: src.boardId, x: src.x, y: src.y, z: src.z },
    fixed: { label: target.label, x: target.x, y: target.y, z: target.z },
    delta: delta.map((v) => Math.round(v * 10) / 10), clamped,
  });
  pointAlign.source = null;
  hideInference();
  hideTip();
  refreshMoveUi();
  emitMode();
}

function pointClick(e) {
  const move = moveState();
  if (!pointAlign.source) {
    const hit = pointHit(e.clientX, e.clientY, { ownedOnly: true });
    if (!hit) {
      showTip(e.clientX, e.clientY, [pointAlign.mode === "panel" ? "Click a corner of a board" : "Click a corner of a cabinet"], "warn");
      return;
    }
    pointAlign.source = { cabId: hit.cabId, boardId: hit.boardId, x: hit.x, y: hit.y, z: hit.z, label: hit.label };
    pointAlign.mode = move.target;
    if (hit.cabId !== move.id) {
      restoreMove();
      const next = cabById(hit.cabId);
      if (next) {
        move.id = next.id;
        move.pose0 = { ...next.pose };
        move.overrides0 = cloneOverrides(next.overrides);
      }
    }
    job.select(hit.cabId, { boardId: hit.boardId });
    log("pointalign.pick", { which: "moving", mode: pointAlign.mode, cabId: hit.cabId, boardId: hit.boardId, x: hit.x, y: hit.y, z: hit.z });
    refreshPointUi();
    emitMode();
    return;
  }
  const hit = pointHit(e.clientX, e.clientY);
  if (!hit) {
    showTip(e.clientX, e.clientY, ["Click the point to land on"], "warn");
    return;
  }
  finishPointAlign(hit, e);
}

function pointHover(e) {
  const hit = pointAlign.source ? pointHit(e.clientX, e.clientY) : pointHit(e.clientX, e.clientY, { ownedOnly: true });
  const src = pointAlign.source;
  if (src && hit && !pointOnMovingBody(hit)) {
    const dx = hit.x - src.x;
    const dy = hit.y - src.y;
    const dz = hit.z - src.z;
    const len = Math.hypot(dx, dy, dz) || 1;
    showSnapMarker(src.x, src.y, src.z, { feature: true });
    showInference({ x: src.x, y: src.y, z: src.z }, { x: hit.x, y: hit.y, z: hit.z }, [dx / len, dy / len, dz / len]);
  } else {
    hideInference();
    if (hit) showSnapMarker(hit.x, hit.y, hit.z, { feature: true });
    else if (src) showSnapMarker(src.x, src.y, src.z, { feature: true });
    else hideSnapMarker();
  }
  const lines = [src
    ? (pointAlign.mode === "panel" ? "Click the point this board corner should land on" : "Click the point this corner should land on")
    : (pointAlign.mode === "panel" ? "Click a corner of the board that should move" : "Click a corner of the cabinet that should move")];
  if (hit) {
    lines.push(hit.label);
    if (src) {
      if (pointOnMovingBody(hit)) lines.push(pointAlign.mode === "panel" ? "On the same board" : "On the same cabinet");
      else lines.push(`Δ ${Math.round(hit.x - src.x)}  ${Math.round(hit.y - src.y)}  ${Math.round(hit.z - src.z)}`);
    }
  }
  showTip(e.clientX, e.clientY, lines, hit && pointOnMovingBody(hit) ? "warn" : "");
}

registerMovePage("point", {
  state: () => pointAlign,
  enter: () => { pointAlign = { mode: moveState().target, source: null, before: moveState().before }; },
  leave: () => { pointAlign = null; },
  onTarget: (target) => { if (pointAlign) { pointAlign.mode = target; pointAlign.source = null; hideSnapMarker(); hideInference(); } },
  clearSource: () => { if (pointAlign) pointAlign.source = null; },
  applying: () => false,
  down: pointClick,
  hover: pointHover,
});
