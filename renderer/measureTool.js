// Measure (I): click a point or a face, then another.
//
//   point → point     distance, and ΔX ΔY ΔZ
//   point → face      perpendicular distance onto the plane
//   face → face       the same, when the two planes are parallel
//                     the angle between them, when they are not
//   one board face    also its overall size and thickness, until the second click
//
// A face is the infinite plane, so the length is along the normal, not the
// shortest gap between the two patches. Shift, after a length is done, continues
// from the last point (up to MEASURE_LIMIT). Esc clears the reading; Esc again
// leaves. Nothing is written to the job, and nothing is undone.
//
// Board corners come from snap.js boardCorners(), rebuilt when the job changes,
// so a pointer move does not walk every cabinet.
import * as THREE from "three";
import * as job from "./job.js";
import { scene, canvas, activeCamera, rayFromClient, canvasClientRect } from "./space.js";
import { pickables, faceUnderHit, showFaceHint, hideFaceHint } from "./cabinets3d.js";
import { wallPickables } from "./walls3d.js";
import { boardCorners, nearestSnap, toClient, pickFace, describePoint, uiScale, SNAP_RADIUS_PX } from "./snap.js";
import { showTip, hideTip } from "./hud.js";
import { boardFaceLocal, worldPlane } from "./pose.js";
import { faceLabel } from "./boardModel.js";
import { log } from "./log.js";
import {
  MEASURE_LIMIT, boardSize, boardSummary, emptyMeasure, measureClick, measureLogPick, measureLogResult,
  measureMark, measurePreview, measureSummary, pickPoint,
} from "./measure.js";

let ctx = { stopOthers() {}, emitMode() {} };
let ms = null;
let hover = null;
let shiftHeld = false;
let lastClient = null;

export function initMeasure(c) { ctx = c; }
export function measureActive() { return !!ms; }
export function measureMode() { return ms ? (ms.anchor ? "measure.anchor" : "measure") : null; }

// --- drawing ------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
const solidMat = new THREE.LineBasicMaterial({ color: 0xf0c070, depthTest: false, transparent: true });
const dashMat = new THREE.LineDashedMaterial({ color: 0x4f86e0, dashSize: 30, gapSize: 18, depthTest: false, transparent: true });
const linePool = [];
const labelPool = [];
const _v = new THREE.Vector3();

function marker(color) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(1, 14, 10),
    new THREE.MeshBasicMaterial({ color, depthTest: false }),
  );
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 33;
  scene.add(mesh);
  return mesh;
}
const anchorMark = marker(0xf0c070);
const hoverMark = marker(0xffffff);

function lineSlot(i) {
  let l = linePool[i];
  if (!l) {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3));
    l = new THREE.Line(g, solidMat);
    l.frustumCulled = false;
    l.renderOrder = 32;
    l.visible = false;
    scene.add(l);
    linePool.push(l);
  }
  return l;
}

/** Same screen size as the snap marker in cabinets3d.js. */
function markerScale(pos, px) {
  const cam = activeCamera();
  const h = canvas.clientHeight || 800;
  _v.set(pos.x, pos.y, pos.z);
  if (cam.isOrthographicCamera) return Math.max(4, (px * (cam.top - cam.bottom)) / ((cam.zoom || 1) * h));
  return Math.max(4, _v.distanceTo(cam.position) * px * 0.0004);
}

function placeMarker(mesh, at, px) {
  if (!at) { mesh.visible = false; return; }
  mesh.visible = true;
  mesh.position.set(at.x, at.y, at.z);
  mesh.scale.setScalar(markerScale(mesh.position, px));
}

function takeLabel(i) {
  let el = labelPool[i];
  if (!el) {
    el = document.createElement("div");
    el.className = "measure-label hidden";
    document.getElementById("viewport").append(el);
    labelPool.push(el);
  }
  return el;
}

function placeLabel(el, world) {
  const c = toClient(world.x, world.y, world.z);
  if (c.behind) { el.classList.add("hidden"); return; }
  const r = canvasClientRect();
  el.classList.remove("hidden");
  el.style.left = `${c.x - r.left}px`;
  el.style.top = `${c.y - r.top}px`;
}

function hideGraphics() {
  drawn = [];
  for (const l of linePool) l.visible = false;
  for (const el of labelPool) el.classList.add("hidden");
  anchorMark.visible = false;
  hoverMark.visible = false;
  card.classList.add("hidden");
  hideFaceHint();
  hideTip();
}

function livePreview() {
  if (!hover || !ms) return null;
  const preview = measurePreview(ms, hover, { shift: shiftHeld });
  if (!preview) return null;
  // The cursor is still on the point just accepted. Holding Shift would otherwise
  // draw a zero-length preview from that point back to itself.
  const p = pickPoint(preview.a);
  const q = pickPoint(preview.b);
  if (p && q && preview.a.label === preview.b.label && Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z) < 0.5) return null;
  return preview;
}

let drawn = [];

function layout() {
  if (!ms) return;
  drawn = ms.segments.map((seg) => ({ ...measureMark(seg.a, seg.b, seg.result), live: false }));
  const preview = livePreview();
  if (preview) drawn.push({ ...measureMark(preview.a, preview.b, preview.result), live: true });
  let n = 0;
  for (const m of drawn) {
    if (!m.line) continue;
    const l = lineSlot(n);
    const pos = l.geometry.attributes.position;
    pos.setXYZ(0, m.line[0].x, m.line[0].y, m.line[0].z);
    pos.setXYZ(1, m.line[1].x, m.line[1].y, m.line[1].z);
    pos.needsUpdate = true;
    l.geometry.computeBoundingSphere();
    l.material = m.live ? dashMat : solidMat;
    l.computeLineDistances();
    l.visible = true;
    n += 1;
  }
  for (let i = n; i < linePool.length; i += 1) linePool[i].visible = false;
  for (let i = 0; i < drawn.length; i += 1) {
    const el = takeLabel(i);
    el.textContent = drawn[i].text;
    el.classList.toggle("live", drawn[i].live);
  }
  for (let i = drawn.length; i < labelPool.length; i += 1) labelPool[i].classList.add("hidden");
  placeMarks();
}

function placeMarks() {
  if (!ms) return;
  for (let i = 0; i < drawn.length; i += 1) {
    const el = labelPool[i];
    if (!el) continue;
    if (drawn[i].at && drawn[i].text) placeLabel(el, drawn[i].at);
    else el.classList.add("hidden");
  }
  const anchorAt = ms.anchor ? pickPoint(ms.anchor) : null;
  const hoverAt = hover ? pickPoint(hover) : null;
  const same = anchorAt && hoverAt && Math.hypot(hoverAt.x - anchorAt.x, hoverAt.y - anchorAt.y, hoverAt.z - anchorAt.z) < 0.5;
  placeMarker(anchorMark, anchorAt, 8);
  placeMarker(hoverMark, same ? null : hoverAt, 7);
}

export function measureTick() {
  if (!ms) return;
  placeMarks();
}

// --- card ---------------------------------------------------------------------------

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

const card = el("div", { id: "measureCard", class: "hidden" });
document.getElementById("moveCard").parentElement.append(card);
for (const type of ["pointerdown", "pointerup", "wheel", "contextmenu", "dblclick"]) {
  card.addEventListener(type, (e) => e.stopPropagation());
}
const body = el("div", { class: "measure-body" });
card.append(
  el("div", { class: "move-card-title", text: "Measure" }),
  body,
  el("div", { class: "move-note", text: "Shift continues from the last point · Esc clears · not saved" }),
);

function row(text, cls) {
  const d = document.createElement("div");
  if (cls) d.className = cls;
  d.textContent = text;
  return d;
}

function paintCard() {
  if (!ms) { card.classList.add("hidden"); return; }
  card.classList.remove("hidden");
  const rows = [];
  if (!ms.anchor && !ms.segments.length) rows.push(row("Click a point or a face"));
  if (ms.anchor) {
    rows.push(row(ms.anchor.label));
    const size = boardSummary(ms.anchor.size);
    if (size) rows.push(row(size, "sub"));
    if (!ms.segments.length) rows.push(row("Click the second point or face", "sub"));
  }
  for (const seg of ms.segments) {
    const s = measureSummary(seg.result);
    rows.push(row(`${s.title}   ${seg.a.label} → ${seg.b.label}`));
    if (s.detail) rows.push(row(s.detail, "sub"));
  }
  const preview = livePreview();
  if (preview) {
    const s = measureSummary(preview.result);
    rows.push(row(s.title, "live"));
    if (s.detail) rows.push(row(s.detail, "sub"));
  }
  body.replaceChildren(...rows);
}

function atLimit() {
  return shiftHeld && ms && !ms.anchor && ms.segments.length >= MEASURE_LIMIT;
}

function tipLines() {
  if (atLimit()) return ["12 lengths is the most this chain holds"];
  const lines = [];
  const preview = livePreview();
  if (preview) {
    const s = measureSummary(preview.result);
    lines.push(s.title);
    if (s.detail) lines.push(s.detail);
  } else if (ms.anchor) lines.push("Click the second point or face");
  else if (ms.segments.length) lines.push("Click to start again", "Shift continues from the last point");
  else lines.push("Click a point or a face");
  if (hover) lines.push(hover.label);
  if (hover?.size && !preview) {
    const size = boardSummary(hover.size);
    if (size) lines.push(size);
  }
  return lines;
}

function paint() {
  paintCard();
  layout();
  const hinted = (hover && hover.hint) || (ms && ms.anchor && ms.anchor.hint) || null;
  if (hinted) showFaceHint(hinted);
  else hideFaceHint();
  if (lastClient) showTip(lastClient.x, lastClient.y, tipLines(), atLimit() ? "warn" : "");
}

// --- picking ------------------------------------------------------------------------

function nearestPoint(clientX, clientY) {
  const max = SNAP_RADIUS_PX * uiScale();
  let best = null;
  let bestD = max;
  const take = (d, pick) => {
    if (d < bestD) { bestD = d; best = pick; }
  };
  for (const p of boardCorners()) {
    if (p.hidden) continue;
    const c = toClient(p.x, p.y, p.z);
    if (c.behind) continue;
    take(Math.hypot(c.x - clientX, c.y - clientY), {
      kind: "point", x: p.x, y: p.y, z: p.z,
      label: `${p.cabId} · ${p.label}`, cabId: p.cabId, boardId: p.boardId,
    });
  }
  const snap = nearestSnap(clientX, clientY);
  if (snap) {
    const c = toClient(snap.x, snap.y, snap.z);
    if (!c.behind) {
      take(Math.hypot(c.x - clientX, c.y - clientY), {
        kind: "point", x: snap.x, y: snap.y, z: snap.z, label: `Corner · ${describePoint(snap)}`,
      });
    }
  }
  return best;
}

function boardFaceFromHit(hit) {
  const under = faceUnderHit(hit);
  if (!under?.faceId) return null;
  const cab = job.getJob().cabinets.find((c) => c.id === under.cabId);
  if (!cab || job.isBoardHidden(cab, under.boardId)) return null;
  const board = (job.resultFor(cab.id)?.boards || []).find((b) => b.id === under.boardId);
  const face = board?.faces?.find((f) => f.id === under.faceId);
  const local = board && face ? boardFaceLocal(board, face, cab.overrides?.boards?.[board.id]) : null;
  const plane = worldPlane(cab.pose, local);
  if (!plane) return null;
  return {
    kind: "face",
    at: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
    point: plane.point,
    normal: plane.normal,
    label: `${cab.id} ${board.name || board.id} · ${faceLabel(face)}`,
    cabId: cab.id,
    boardId: board.id,
    faceId: face.id,
    size: boardSize(board),
  };
}

function planeFace(hit) {
  const f = hit.face;
  const normal = [0, 0, 0];
  normal[f.axis === "x" ? 0 : f.axis === "y" ? 1 : 2] = f.dir > 0 ? 1 : -1;
  return {
    kind: "face",
    at: { x: hit.point.x, y: hit.point.y, z: hit.point.z },
    point: [hit.point.x, hit.point.y, hit.point.z],
    normal,
    label: f.label,
    hint: f,
  };
}

function resolveAt(clientX, clientY) {
  const pt = nearestPoint(clientX, clientY);
  if (pt) return pt;
  const ray = rayFromClient(clientX, clientY);
  raycaster.set(ray.origin, ray.direction);
  const hits = raycaster.intersectObjects([...pickables(), ...wallPickables()], false);
  const hit = hits.find((h) => {
    const k = h.object.userData.kind;
    return k !== "handle" && k !== "moveAxis";
  });
  if (hit?.object?.userData?.kind === "board" && hit.object.userData.boardId) {
    const face = boardFaceFromHit(hit);
    if (face) return face;
  }
  const pf = pickFace(clientX, clientY);
  return pf ? planeFace(pf) : null;
}

function logEvent(ev) {
  if (ev.kind === "clear") log("measure.clear", { how: ev.how, count: ev.count });
  else if (ev.kind === "pick") log("measure.pick", { which: ev.which, pick: measureLogPick(ev.pick) });
  else if (ev.kind === "blocked") log("measure.blocked", { reason: ev.reason });
  else if (ev.kind === "result") {
    log("measure.result", {
      ...measureLogResult(ev.result),
      a: measureLogPick(ev.a),
      b: measureLogPick(ev.b),
      chain: ev.chain,
      how: "click",
    });
  }
}

// --- command ------------------------------------------------------------------------

function nothingToMeasure() {
  return !job.hasSpace() && !job.getJob().cabinets.length;
}

export function startMeasure() {
  if (ms) { cancelMeasure("toggle"); return; }
  if (nothingToMeasure()) { log("measure.blocked", { reason: "nothing to measure" }); return; }
  ctx.stopOthers();
  ms = emptyMeasure();
  hover = null;
  shiftHeld = false;
  lastClient = null;
  canvas.style.cursor = "crosshair";
  log("measure.arm");
  paint();
  ctx.emitMode();
}

export function cancelMeasure(how = "tool off") {
  if (!ms) return;
  ms = null;
  hover = null;
  shiftHeld = false;
  lastClient = null;
  hideGraphics();
  canvas.style.cursor = "";
  log("measure.exit", { how });
  ctx.emitMode();
}

export function measureEscape() {
  if (!ms) return;
  if (ms.anchor || ms.segments.length) {
    log("measure.clear", { how: "esc", count: ms.segments.length });
    ms = emptyMeasure();
    hover = null;
    paint();
    ctx.emitMode();
    return;
  }
  cancelMeasure("esc");
}

/** Delete clears the reading and does not remove the cabinet. */
export function measureDelete() {
  if (!ms || (!ms.anchor && !ms.segments.length)) return;
  log("measure.clear", { how: "delete", count: ms.segments.length });
  ms = emptyMeasure();
  hover = null;
  paint();
  ctx.emitMode();
}

export function measurePointerDown(e) {
  if (!ms) return;
  lastClient = { x: e.clientX, y: e.clientY };
  shiftHeld = !!e.shiftKey;
  const hit = resolveAt(e.clientX, e.clientY);
  if (!hit) {
    hover = null;
    paint();
    showTip(e.clientX, e.clientY, ["No point or face there"], "warn");
    return;
  }
  const applied = measureClick(ms, hit, { shift: shiftHeld, limit: MEASURE_LIMIT });
  for (const ev of applied.events) logEvent(ev);
  ms = applied.state;
  hover = hit;
  paint();
  ctx.emitMode();
}

export function measurePointerMove(e) {
  if (!ms) return;
  lastClient = { x: e.clientX, y: e.clientY };
  shiftHeld = !!e.shiftKey;
  hover = resolveAt(e.clientX, e.clientY);
  canvas.style.cursor = "crosshair";
  paint();
}

export function measureLeave() {
  if (!ms) return;
  hover = null;
  lastClient = null;
  paint();
  hideTip();
}

function onShift(e) {
  if (!ms || e.key !== "Shift") return;
  shiftHeld = e.type === "keydown";
  if (lastClient) hover = resolveAt(lastClient.x, lastClient.y);
  paint();
}

job.onChange((kind) => {
  if (!ms || kind !== "job") return;
  const empty = nothingToMeasure();
  if (ms.anchor || ms.segments.length) {
    log("measure.clear", { how: "changed", count: ms.segments.length });
    ms = emptyMeasure();
    hover = null;
    paint();
    ctx.emitMode();
  }
  if (empty) cancelMeasure("changed");
});

window.addEventListener("keydown", onShift);
window.addEventListener("keyup", onShift);
