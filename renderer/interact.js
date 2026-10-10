// Left-button interaction in the viewport.
//
//   idle       click board → select · click empty → deselect · press handle → drag W/D/H or divider
//   armed      (module picked) hover shows the face under the cursor and snaps to corners · click → anchor
//   face       a zero-thickness rectangle is drawn on that face (floor, ceiling, wall, cabinet face) · click → corner
//   extrude    the rectangle is pulled along the face normal, away from the solid only · click / Enter → create
//   move       (M) one command. The card picks Free (arrows and rings), Face
//              (two faces, same direction) or Point (a corner onto a point).
//              Module moves the cabinet, Panel moves one board. Enter confirms.
//   orient     (O / Face) click a side of a cabinet → its doors face that way (pending, orange);
//              click elsewhere or Enter confirms · Esc restores
//   measure    (I) click a point or a face, then another: distance or angle. Nothing is stored.
//
// At every step of drawing a box, Tab / a digit opens the type-ins (W D H). Values may
// be expressions: 1110 · +50 · -20 · *2 · /2 · max · 1110,560,720 (comma fills the next fields).
// The cursor tooltip always says what the snap / inference / clamp is doing.
// Every edit writes pose or params through job.js and lets the generator redraw.
import * as THREE from "three";
import { canvas, frame } from "./space.js";
import * as job from "./job.js";
import { invoke } from "./commands.js";
import { getModule } from "./modules.js";
import {
  pickables, groupFor, setHandleHover, faceUnderHit, disarmHandle,
  showGhost, hideGhost, showNoseGhost, showWidthRect, hideWidthRect, showLoungeGhost, hideLoungeGhost, showCPlanePreview, hideCPlanePreview, showSnapMarker, hideSnapMarker, hideInference, showAlignLines, hideAlignLines,
  showFaceHint, hideFaceHint,
  setResizeState, pickEnvelopeFace, envelopeFaceWorld, setEnvelopeDrag,
} from "./cabinets3d.js";
import {
  nearestSnap, nearestInference, toClient, nearestFaceAlign, nearestAxisAlign, overheadWidthFaces, describePoint, faceGuide,
  pickFace, facesAtPoint, facesOnPoint, facePlanes, faceVisible, rayHitFace, preferDrawable, drawableOn, extrudeRoom, inPlaneAxes, axisVector, AXES,
  INFER_BAND_PX, INFER_RELEASE_PX, AXIS_DIRS, uiScale, SNAP_RADIUS_PX,
} from "./snap.js";
import { envelopeBox, rotZFacing, sideOfRotZ, sideLabel, fitBoxFacing, defaultSide, overlaps } from "./fit.js";

// Re-exported for floorplan.js / panel.js (moved to fit.js — pure math).
export { rotZFacing, sideOfRotZ, sideLabel, fitBoxFacing, defaultSide, overlaps };
import { log } from "./log.js";
import {
  initBoardSketch, boardActive, boardMode, startBoard, cancelBoard, boardPointerDown, boardPointerMove, boardPointerUp, boardKeydown,
} from "./boardSketch.js";

export { startBoard, startBoardEdit, boardRightClick, boardUndoKey } from "./boardSketch.js";
import { initGrooveTool, grooveActive, grooveMode, startGroove, endGroove, groovePointerDown, groovePointerMove, grooveKeydown } from "./grooveTool.js";
export { startGroove, removeGroove } from "./grooveTool.js";
import {
  initMeasure, measureActive, measureMode, startMeasure, cancelMeasure, measureEscape, measureDelete,
  measurePointerDown, measurePointerMove, measureLeave, measureTick,
} from "./measureTool.js";
export { startMeasure };

// Shared interaction machinery + the extracted modes live in ./interact/.
// This file keeps the mode registry dispatch and the not-yet-extracted modes.
import {
  S, host, MODES, resetHooks,
  setModeGetter, emitMode, typingMode, stopAll,
  pick, localAxisWorld, threePlane, clampToSpace, floorFace, resolveCursor, drawResolved,
  dimInputs, focusDim, focusedDim, typableDims,
  beginWallSplit, beginHandleDrag, handleDragMove, endDrag, cursorFor,
} from "./interact/shared.js";
export { onModeChange, evalDim } from "./interact/shared.js";
import { startOrient, cancelOrient, MODE as orientMode } from "./interact/orient.js";
export { startOrient, cancelOrient };
import { startFitPick, cancelFitPick, isFitPicking, MODE as fitPickMode } from "./interact/fitPick.js";
export { startFitPick, cancelFitPick, isFitPicking };
import { beginRetype, endRetype, retypeActive } from "./interact/retype.js";
import { startResize, endResize, MODE as resizeMode } from "./interact/resize.js";
export { startResize, endResize };
import { startMove, cancelMove, MODE as moveMode } from "./interact/move.js";
export { startMove, cancelMove };
import { startAlign, cancelAlign } from "./interact/align.js";
import { startPointAlign, cancelPointAlign } from "./interact/pointAlign.js";
export { startAlign, cancelAlign, startPointAlign, cancelPointAlign };
import { startNose, cancelNose, noseModuleId, MODE as noseMode } from "./interact/nose.js";
import { startPlane, cancelPlane, planeActive, MODE as cplaneMode } from "./interact/cplane.js";
export { startNose, cancelNose, startPlane, cancelPlane };
import { startBedBox, cancelBedBox, bedModuleId, MODE as bedMode } from "./interact/bedBox.js";
export { startBedBox, cancelBedBox };
import { armPlacement, disarm, placeEnsuiteSample, MODE as placeMode } from "./interact/place.js";
export { armPlacement, disarm, placeEnsuiteSample };
import { startLounge, cancelLounge, getLoungeStyle, loungeModuleId, MODE as loungeMode } from "./interact/lounge.js";
export { startLounge, cancelLounge, getLoungeStyle };

// Placement-family state lives on S (interact/shared.js): S.placing / S.rb / S.lounge /
// S.lshape / S.bunk / S.lastCreated — shared by interact/place.js and (next) interact/lounge.js.

export function getMode() {
  if (S.drag) return "handle";
  {
    const rm = resizeMode.mode();
    if (rm) return rm;
  }
  {
    const mm = moveMode.mode();
    if (mm) return mm;
  }
  {
    const om = orientMode.mode();
    if (om) return om;
  }
  {
    const nm = noseMode.mode();
    if (nm) return nm;
  }
  {
    const bm = bedMode.mode();
    if (bm) return bm;
  }
  {
    const lm = loungeMode.mode();
    if (lm) return lm;
  }
  {
    const cm = cplaneMode.mode();
    if (cm) return cm;
  }
  {
    const pm = placeMode.mode();
    if (pm) return pm;
  }
  {
    const fm = fitPickMode.mode();
    if (fm) return fm;
  }
  if (boardActive()) return boardMode();
  if (grooveActive()) return grooveMode();
  if (measureActive()) return measureMode();
  return "idle";
}

// The mode bus resolves the token through this dispatcher's getMode; modes reach the
// still-resident placement family through the host hooks (removed as they extract).
setModeGetter(getMode);

// --- fit a partition to an overhead and a base — interact/fitPick.js -----------------

export function getPlacingModule() {
  return S.placing || noseModuleId() || bedModuleId() || loungeModuleId();
}


// --- move / face-align / point-align moved to interact/move.js + align.js + pointAlign.js ---

// --- orientation (Face command) moved to interact/orient.js ---------------------------

// --- resize moved to interact/resize.js ---

// --- re-type the last created box — interact/retype.js --------------------------------

// --- drawn board --------------------------------------------------------------------
// The Board command is boardSketch.js. It borrows these to stop the other commands.
initBoardSketch({
  stopOthers() {
    endGroove("tool off");
    cancelMeasure("tool off");
    stopAll();
    host.stopResidents();
    host.clearPlacement();
  },
  emitMode,
});
// Groove command (grooveTool.js): same hand-over.
initGrooveTool({
  stopOthers() {
    cancelBoard("tool off");
    cancelMeasure("tool off");
    stopAll();
    host.stopResidents();
    host.clearPlacement();
  },
  emitMode,
});
initMeasure({
  stopOthers() {
    endGroove("tool off");
    cancelBoard("tool off");
    stopAll();
    host.stopResidents();
    host.clearPlacement();
  },
  emitMode,
});

// --- pointer -----------------------------------------------------------------------

canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  if (fitPickMode.down(e)) return;
  if (retypeActive()) endRetype(true);

  if (resizeMode.down(e)) return;

  if (orientMode.down(e)) return;

  if (cplaneMode.down(e)) return;

  if (boardActive()) { boardPointerDown(e); return; }
  if (grooveActive()) { groovePointerDown(e); return; }
  if (measureActive()) { measurePointerDown(e); return; }

  if (noseMode.down(e)) return;

  if (bedMode.down(e)) return;

  if (loungeMode.down(e)) return;

  if (moveMode.down(e)) return;


  if (placeMode.down(e)) return;

  const hit = pick(e.clientX, e.clientY);
  const extend = e.ctrlKey || e.metaKey;
  if (!hit) {
    if (!extend) job.select(null);
    return;
  }
  const { kind, cabId, handle, planeId, wallId } = hit.object.userData;
  if (kind === "handle" && handle && handle.type === "wallSplit") { beginWallSplit(e, hit); return; }
  if (kind === "cplane") { if (!extend) job.select(planeId); return; }
  if (kind === "wall") { if (!extend) job.select(wallId); return; }
  const cab = job.getJob().cabinets.find((c) => c.id === cabId);
  if (!cab) return;

  // Ctrl+click toggles this cabinet in the set. It does not drill into a board and does not drag a handle.
  if (extend) { job.select(cabId, null, { extend: true }); return; }

  if (kind === "handle") {
    beginHandleDrag(e, hit, cab);
    return;
  }

  // Drill down module → board → face: the first click takes the cabinet, a click on a board of
  // the selected cabinet takes that board, a click on the selected board takes the face under
  // the cursor. Esc (or the cabinet row in the tree) climbs back up. A set of several cabinets
  // stays at cabinet level: a plain click keeps only the one under the cursor.
  if (job.getSelectedIds().length === 1 && cabId === job.getSelectedId() && hit.object.userData.boardId) {
    const sub = job.getSubSelection();
    const under = faceUnderHit(hit);
    if (!sub || sub.boardId !== under.boardId) job.select(cabId, { boardId: under.boardId });
    else job.select(cabId, { boardId: under.boardId, faceId: under.faceId });
    return;
  }
  // A volume-only module laid out in regions (bedroom body): the second click takes the region.
  if (job.getSelectedIds().length === 1 && cabId === job.getSelectedId() && hit.object.userData.regionId) {
    job.select(cabId, { regionId: hit.object.userData.regionId });
    return;
  }
  job.select(cabId);
});

canvas.addEventListener("pointermove", (e) => {
  if (S.drag) return handleDragMove(e);

  if (resizeMode.hover(e)) return;

  if (orientMode.hover(e)) return;
  if (cplaneMode.hover(e)) return;
  if (boardActive()) return boardPointerMove(e);
  if (grooveActive()) return groovePointerMove(e);
  if (measureActive()) return measurePointerMove(e);

  if (noseMode.hover(e)) return;
  if (bedMode.hover(e)) return;
  if (loungeMode.hover(e)) return;

  if (moveMode.hover(e)) return;


  if (placeMode.hover(e)) return;

  // Idle: hover feedback on handles.
  const hit = job.getSelectedId() ? pick(e.clientX, e.clientY) : null;
  const h = hit && hit.object.userData.kind === "handle" ? hit.object : null;
  if (h !== S.hoverHandle) {
    setHandleHover(S.hoverHandle, false);
    setHandleHover(h, true);
    S.hoverHandle = h;
  }
  canvas.style.cursor = h ? cursorFor(h.userData.handle) : hit ? "pointer" : "";
});

// beginWallSplit / wallSplitMove / endWallSplit / handleDragMove / endDrag /
// cursorFor moved to interact/shared.js (they drive the shared S.drag state).

canvas.addEventListener("pointerup", (e) => { endDrag(e); for (const m of MODES) m.up?.(e); if (boardActive()) boardPointerUp(e); });
canvas.addEventListener("pointercancel", (e) => { endDrag(e); for (const m of MODES) m.up?.(e); if (boardActive()) boardPointerUp(e); });

canvas.addEventListener("pointerleave", () => {
  for (const m of MODES) if (m.leave) m.leave();
  if (measureActive()) measureLeave();
});

// Keep type-ins glued to the box while the camera moves.
(function tickDims() {
  for (const m of MODES) if (m.tick) m.tick();
  measureTick();
  requestAnimationFrame(tickDims);
})();

// --- dimension type-ins ---------------------------------------------------------------
// focusDim / commitDim / the input listeners / positionDimInputs live in
// interact/shared.js. They dispatch through whichever registered mode claims
// typing() — placement (place.js), lounge steps (lounge.js), retype, etc.

// --- keyboard ----------------------------------------------------------------------------

window.addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (fitPickMode.key(e)) return;
  if (measureActive()) {
    const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
    if (e.key === "Escape") { e.preventDefault(); measureEscape(); return; }
    if (plain && (e.key === "i" || e.key === "I")) { cancelMeasure("key"); return; }
    if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); measureDelete(); return; }
  }
  if (resizeMode.key(e)) return;
  if (orientMode.key(e)) return;
  if (cplaneMode.key(e)) return;
  if (boardActive()) { boardKeydown(e); return; }
  if (grooveActive()) { grooveKeydown(e); return; }
  if (noseMode.key(e)) return;
  if (moveMode.key(e)) return;
  const typing = retypeActive() || typingMode();

  if (typing) {
    if (e.key === "Tab") {
      e.preventDefault();
      const dims = typableDims();
      if (!dims.length) return;
      focusDim(focusedDim() || dims[0]);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      if (typingMode()) typingMode().confirm("enter", e);
      else endRetype(true);
      return;
    }
    if (e.key === "Escape") {
      if (typingMode()) typingMode().cancel();
      else endRetype(false);
      return;
    }
    // Typing a digit / sign jumps straight into the first open field.
    if (/^[0-9.+\-*/]$/.test(e.key)) {
      const dims = typableDims();
      if (!dims.length) return;
      focusDim(dims[0]);
      dimInputs[dims[0]].value = "";
      return;
    }
    return;
  }
  if (e.key === "Escape") {
    if (planeActive()) cancelPlane();
    else if (S.placing) disarm();
    else if (disarmHandle()) log("handle.arm", { id: job.getSelectedId(), on: false, how: "esc" }); // an on-demand arrow goes first
    else if (job.getSubSelection()) {
      // Face → board → cabinet, one level per Esc.
      const sub = job.getSubSelection();
      job.select(sub.cabId, sub.faceId ? { boardId: sub.boardId } : null);
    }
    else if (job.getSelectedRegion()) job.select(job.getSelectedId()); // region → body
    else job.select(null);
    return;
  }
  // Armed with a fresh box: digits re-type its size.
  if (S.placing && S.lastCreated && !e.ctrlKey && /^[0-9.+\-*/]$/.test(e.key)) {
    if (beginRetype(S.lastCreated)) { focusDim("W"); dimInputs.W.value = ""; }
    return;
  }

  if ((e.key === "b" || e.key === "B") && !e.ctrlKey && !e.metaKey && !e.altKey) { startBoard(); return; }
  if ((e.key === "g" || e.key === "G") && !e.ctrlKey && !e.metaKey && !e.altKey) { startGroove(); return; }
  if ((e.key === "i" || e.key === "I") && !e.ctrlKey && !e.metaKey && !e.altKey) { startMeasure(); return; }
  if ((e.key === "p" || e.key === "P") && !e.ctrlKey) { startPlane(); return; }
  if ((e.key === "s" || e.key === "S") && !e.ctrlKey && !e.metaKey && !e.altKey) { startResize(); return; }

  const pl = job.getSelectedPlane();
  if (pl && (e.key === "Delete" || e.key === "Backspace")) {
    log("key.delete", { id: pl.id });
    job.removePlane(pl.id);
    return;
  }
  // A partition wall: 3D only selects and deletes it; it is drawn and edited in the floor plan.
  const wall = job.getSelectedWall();
  if (wall && (e.key === "Delete" || e.key === "Backspace")) {
    log("key.delete", { id: wall.id });
    job.removeWall(wall.id);
    return;
  }

  const sel = job.getSelected();
  const selectedIds = job.getSelectedIds();
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
  if ((e.key === "v" || e.key === "V") && !e.ctrlKey && !e.metaKey && !e.altKey && !moveMode.mode()) {
    if (job.toggleSelectionVisible()) return;
  }
  if (!sel || moveMode.mode()) return;
  if (e.key === "m" || e.key === "M") {
    startMove(sel.id);
  } else if (e.key === "Delete" || e.key === "Backspace") {
    if (selectedIds.length > 1) {
      log("key.delete", { id: sel.id, ids: selectedIds });
      job.removeCabinets(selectedIds);
    } else {
      log("key.delete", { id: sel.id });
      invoke("cabinet.remove", { id: sel.id });
    }
  } else if (e.key === "r" || e.key === "R") {
    if (getModule(sel.moduleId).noOrient) {
      const why = getModule(sel.moduleId).noOrient;
      log("key.rotate", { id: sel.id, blocked: typeof why === "string" ? why : "module has a fixed door side" });
      return;
    }
    log("key.rotate", { id: sel.id, from: sel.pose.rotZ || 0 });
    // Rotate 90° about the envelope centre (same verb the Agent calls).
    invoke("cabinet.rotate", { id: sel.id });
  } else if (e.key === "o" || e.key === "O") {
    startOrient(sel.id);
  }
});
