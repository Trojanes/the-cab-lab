// @module interact @owns align.* — face-to-face flush (a Move page)
// Face align — a page of Move (M), not its own command.
// Inventor flush (对齐): the first face moves onto the second face's plane.
// Normals must already point the same way. Module slides the whole cabinet;
// Panel slides only that board. The second face stays where it is.
import * as job from "../job.js";
import { faceLabel } from "../boardModel.js";
import { faceUnderHit, showFaceHint, hideFaceHint, flashFaceHint } from "../cabinets3d.js";
import { pickFace } from "../snap.js";
import { showTip, hideTip } from "../hud.js";
import { log } from "../log.js";
import { emitMode, pick } from "./shared.js";
import {
  moveState, cabById, registerMovePage, setMoveKind, startMove, restoreMove, refreshMoveUi,
  cloneOverrides, moveRound, clampPoseToSpace, modulePoseLocked, writeBoardOverride,
  boardFaceLocal, worldPlane, alignTranslation, translatePoseBy, translateBoardOverrideBy,
} from "./move.js";

let align = null; // { mode: module | panel, source: {cabId, boardId, faceId} | null, before, applying }

function boardWorldPlane(cab, boardId, faceId) {
  const board = (job.resultFor(cab.id)?.boards || []).find((b) => b.id === boardId);
  const face = board?.faces?.find((f) => f.id === faceId);
  const local = board && face ? boardFaceLocal(board, face, cab.overrides?.boards?.[boardId]) : null;
  const plane = worldPlane(cab.pose, local);
  if (!plane) return null;
  return { ...plane, cabId: cab.id, boardId, faceId, label: `${board.name || boardId} · ${faceLabel(face)}` };
}

function fixedWorldPlane(hit) {
  if (!hit) return null;
  if (hit.kind === "board") {
    const cab = cabById(hit.cabId);
    return cab ? boardWorldPlane(cab, hit.boardId, hit.faceId) : null;
  }
  const f = hit.face;
  const i = f.axis === "x" ? 0 : f.axis === "y" ? 1 : 2;
  const normal = [0, 0, 0];
  normal[i] = f.dir > 0 ? 1 : -1;
  const point = [hit.point.x, hit.point.y, hit.point.z];
  point[i] = f.value;
  return { point, normal, label: f.label, source: f.source };
}

function alignHit(e) {
  const hit = pick(e.clientX, e.clientY);
  const ud = hit?.object?.userData;
  if (ud?.kind === "board" && ud.boardId) {
    const face = faceUnderHit(hit);
    if (face?.faceId) return { kind: "board", cabId: face.cabId, boardId: face.boardId, faceId: face.faceId };
  }
  const pf = pickFace(e.clientX, e.clientY);
  if (pf) return { kind: "plane", face: pf.face, point: pf.point };
  return null;
}

function axisHint(plane, around) {
  if (!plane) return null;
  let ax = -1;
  for (let i = 0; i < 3; i += 1) if (Math.abs(plane.normal[i]) > 0.99) ax = i;
  if (ax < 0) return null;
  const name = ["x", "y", "z"][ax];
  const p = around || plane.point;
  const ext = { x: [p[0] - 160, p[0] + 160], y: [p[1] - 160, p[1] + 160], z: [p[2] - 160, p[2] + 160] };
  ext[name] = [p[ax], p[ax]];
  return { axis: name, value: p[ax], dir: plane.normal[ax] > 0 ? 1 : -1, ext };
}

function sourcePlane() {
  if (!align?.source) return null;
  const cab = cabById(align.source.cabId);
  return cab ? boardWorldPlane(cab, align.source.boardId, align.source.faceId) : null;
}

function refreshAlignUi() {
  if (!align) return;
  align.mode = moveState()?.target || align.mode;
  refreshMoveUi();
  const hint = axisHint(sourcePlane());
  if (hint) showFaceHint(hint, { tone: align.source ? "pending" : "" });
  else if (!align.source) hideFaceHint();
}

/** Face and point alignment are pages of Move, not separate commands. */
export function startAlign() {
  if (!moveState()) startMove();
  if (moveState()) setMoveKind("face");
}

function setAlignMode(mode) {
  if (!align || align.mode === mode) return;
  align.mode = mode;
  align.source = null;
  const id = job.getSelectedId();
  if (id && cabById(id)) {
    align.applying = true;
    job.select(id);
    align.applying = false;
  }
  log("align.mode", { mode });
  refreshAlignUi();
  emitMode();
}

function endAlignChrome() {
  hideFaceHint();
  hideTip();
}

export function cancelAlign() {
  if (!align) return;
  const a = align;
  align = null;
  log("align.cancel", { mode: a.mode, source: a.source });
  endAlignChrome();
  emitMode();
}

function finishAlign(hit, e) {
  const srcRef = align.source;
  const cab = cabById(srcRef.cabId);
  const source = cab && boardWorldPlane(cab, srcRef.boardId, srcRef.faceId);
  const target = fixedWorldPlane(hit);
  const tipAt = e ? { x: e.clientX, y: e.clientY } : null;
  const refuse = (reason) => {
    log("align.blocked", { reason, mode: align.mode, source: srcRef, fixed: target?.label || null });
    if (tipAt) showTip(tipAt.x, tipAt.y, [reason], "warn");
  };
  if (!cab || !source || !target) { refuse("that face has no plane"); return; }
  if (align.mode === "module" && target.cabId === cab.id) { refuse("pick a face on something else"); return; }
  if (align.mode === "panel" && target.cabId === cab.id && target.boardId === srcRef.boardId) { refuse("pick a face on a different board"); return; }
  if (align.mode === "module" && modulePoseLocked(cab)) { refuse("this module follows the Bedroom body — use Panel"); return; }
  const fit = alignTranslation(source, target);
  if (!fit.ok) { refuse(fit.reason); return; }
  const mode = align.mode;
  let clamped = [];
  if (mode === "module") {
    const raw = translatePoseBy(cab.pose, fit.delta);
    for (const k of ["x", "y", "z"]) raw[k] = moveRound(raw[k]);
    const stopped = clampPoseToSpace(cab, raw);
    clamped = stopped.clamped;
    job.updateCabinet(cab.id, (c) => { c.pose = stopped.pose; });
  } else {
    const o = translateBoardOverrideBy(cab.pose, cab.overrides?.boards?.[srcRef.boardId], fit.delta);
    job.updateCabinet(cab.id, (c) => { writeBoardOverride(c, srcRef.boardId, o); });
  }
  log("align.finish", {
    mode, source: srcRef, fixed: target.label, gap: Math.round(fit.gap * 10) / 10,
    delta: fit.delta.map((v) => Math.round(v * 10) / 10), clamped,
  });
  align.source = null;
  const hint = axisHint(target);
  hideTip();
  if (hint) flashFaceHint(hint);
  else hideFaceHint();
  refreshMoveUi();
  emitMode();
}

function alignClick(e) {
  const hit = alignHit(e);
  const move = moveState();
  if (!align.source) {
    if (!hit || hit.kind !== "board") {
      showTip(e.clientX, e.clientY, [align.mode === "panel" ? "Click a board face" : "Click a face on the cabinet that should move"], "warn");
      return;
    }
    align.source = { cabId: hit.cabId, boardId: hit.boardId, faceId: hit.faceId };
    align.mode = move.target;
    if (hit.cabId !== move.id) {
      restoreMove();
      const next = cabById(hit.cabId);
      if (next) {
        move.id = next.id;
        move.pose0 = { ...next.pose };
        move.overrides0 = cloneOverrides(next.overrides);
      }
    }
    align.applying = true;
    job.select(hit.cabId, { boardId: hit.boardId, faceId: hit.faceId });
    align.applying = false;
    log("align.pick", { which: "moving", mode: align.mode, ...align.source });
    refreshAlignUi();
    emitMode();
    return;
  }
  if (!hit) return;
  if (hit.kind === "board" && hit.cabId === align.source.cabId && hit.boardId === align.source.boardId && hit.faceId === align.source.faceId) return;
  finishAlign(hit, e);
}

function alignHover(e) {
  const hit = alignHit(e);
  const plane = hit?.kind === "board"
    ? boardWorldPlane(cabById(hit.cabId), hit.boardId, hit.faceId)
    : fixedWorldPlane(hit);
  const lines = [align.source
    ? (align.mode === "panel" ? "Click the face to align this board to" : "Click the face to align this cabinet to")
    : (align.mode === "panel" ? "Click the board face that should move" : "Click the face that should move")];
  if (plane?.label) lines.push(plane.label);
  if (align.source && plane) {
    const fit = alignTranslation(sourcePlane(), plane);
    if (fit.ok) lines.push(`move ${Math.round(fit.gap)} mm`);
    else if (fit.reason) lines.push(fit.reason);
  }
  showTip(e.clientX, e.clientY, lines, align.source && plane && !alignTranslation(sourcePlane(), plane).ok ? "warn" : "");
  const hint = axisHint(plane) || axisHint(sourcePlane());
  if (hint) showFaceHint(hint, { tone: !plane && align.source ? "pending" : "" });
  else refreshAlignUi();
}

registerMovePage("face", {
  state: () => align,
  enter: () => { align = { mode: moveState().target, source: null, before: moveState().before, applying: false }; },
  leave: () => { align = null; },
  onTarget: (target) => { if (align) { align.mode = target; align.source = null; hideFaceHint(); } },
  clearSource: () => { if (align) align.source = null; },
  applying: () => align?.applying,
  down: alignClick,
  hover: alignHover,
});
