// --- 3D --------------------------------------------------------------------------------
import { $, $$, cur, saveState, tab } from "./core.js";
import { MODE_GHOST, buildModeOverlay, faceHit, facePick } from "./modes.js";
import { highlight, renderSelection } from "./selection.js";
import { renderBottom } from "./statusPane.js";
import { renderL3 } from "./l3.js";
import { boardCtx, renderExplodeOrder, syncToolbar } from "./chrome.js";
import * as THREE from "three";
import { camera, canvas, controls, frame, rayFromClient, renderer, scene, setView } from "../space.js";
import { log } from "../log.js";
import { entryOf, flatFormula, fmt } from "./provenance.js";
import { boardMesh } from "../boardGeom.js";
import { doorMaterialFor } from "../doorFinish.js";
import { STIPPLE_WHITE, carcassMat } from "../carcassFinish.js";
import { hideTip, showTip } from "../hud.js";
import { planeAxes } from "../gen/pins.js";
import { boardPoints } from "./board2d.js";
import { assemblyOffsets, explodeUnit, planExplode, radialOffsets, separation } from "./explode.js";

export const cabRoot = new THREE.Group();
cabRoot.name = "bench-cabinet";
scene.add(cabRoot);
const frontMat = new THREE.MeshStandardMaterial({ color: 0x9ec5d8, roughness: 0.6 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a4034 });
export const pointMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0 });
const pointOutlineMat = new THREE.MeshBasicMaterial({ color: 0xb48be0 });
const pointHoverMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const pointSelMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
const jointMats = { ok: new THREE.LineBasicMaterial({ color: 0x4fc46f }), gap: new THREE.LineBasicMaterial({ color: 0xe0a34f }), bad: new THREE.LineBasicMaterial({ color: 0xd94b4b }) };
const jointDotMats = { ok: new THREE.MeshBasicMaterial({ color: 0x4fc46f }), gap: new THREE.MeshBasicMaterial({ color: 0xe0a34f }), bad: new THREE.MeshBasicMaterial({ color: 0xd94b4b }) };

export let boardGroups = new Map(); // boardId -> { group, mesh, edges, mat, center }
export let pointMeshes = [];
export let jointObjs = [];
export let bbox = null;
let hover = null;
export let explodePlan = null; // { rels, order, plan } from explode.js for the current result
export function resetExplodePlan() { explodePlan = null; }
// Section planes apply to the cabinet's materials only (the grid and axes stay whole).
const clipPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
renderer.localClippingEnabled = true;
const sharedClipped = [edgeMat, pointMat, pointOutlineMat, pointHoverMat, pointSelMat, ...Object.values(jointMats), ...Object.values(jointDotMats)];

function cabinetBox(boards) {
  const b = new THREE.Box3();
  for (const bd of boards) b.union(new THREE.Box3(new THREE.Vector3(bd.x0, bd.y0, bd.z0), new THREE.Vector3(bd.x1, bd.y1, bd.z1)));
  if (b.isEmpty()) b.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1000, 400, 400));
  return b;
}

/** All pickable points of a board in the cabinet frame: outline vertices, corners, hinges. */
function pointsOf(board, prov, features) {
  const [A, B, T] = planeAxes(board.profilePlane);
  const t0 = board[`${T}0`];
  const t1 = board[`${T}1`];
  const out = [];
  for (const p of boardPoints(board, prov, features)) {
    const [a, b] = p.cabinet;
    // Outline points sit on both faces of the plate; corners on both ends of the thickness.
    const ts = p.kind === "feature" ? [t0] : [t0, t1];
    for (const tv of ts) {
      const pos = new THREE.Vector3();
      pos[A] = a; pos[B] = b; pos[T] = tv;
      out.push({ ...p, pos, side: tv === t0 ? 0 : 1 });
    }
  }
  return out;
}

export function build3D(keepCamera) {
  const t = tab();
  const c = cur();
  cabRoot.clear();
  boardGroups = new Map();
  pointMeshes = [];
  jointObjs = [];
  hover = null;
  if (!t || !c) return;
  const boards = c.result.boards || [];
  bbox = cabinetBox(boards);
  explodePlan = planExplode(c.result);
  if (t.step != null) t.step = Math.min(t.step, explodePlan.order.length);

  for (const b of boards) {
    const door = doorMaterialFor(b);
    const base = door || (b.category === "front_panel" ? frontMat : carcassMat);
    // Resting tint after a highlight: the material's own colour (white under an image).
    const bodyHex = door ? base.color.getHex() : null;
    const mat = base.clone();
    // clone() drops the shader hook that lays out stipple / flakes / wood.
    mat.onBeforeCompile = base.onBeforeCompile;
    mat.customProgramCacheKey = base.customProgramCacheKey;
    const { mesh, edges } = boardMesh(b, mat, edgeMat);
    mesh.userData = { kind: "board", boardId: b.id };
    const group = new THREE.Group();
    group.add(mesh, edges);
    const coats = [];
    const bc = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    cabRoot.add(group);
    boardGroups.set(b.id, { group, mesh, edges, mat, coats, bodyHex, center: bc, board: b });
  }
  buildTrails();
  buildLabels();
  buildModeOverlay();
  applyExplode();
  applyCut();
  paintSelection();
  if (!keepCamera || !t.camera) {
    setBenchView(t.view || "3d");
  } else {
    camera.position.fromArray(t.camera.pos);
    controls.target.fromArray(t.camera.target);
    controls.update();
  }
}

function jointStatus(sep) {
  if (sep > 0.01) return "gap";
  if (sep < -0.01) return "bad";
  return "ok";
}

export function buildJoints() {
  const t = tab();
  const c = cur();
  for (const j of jointObjs) { cabRoot.remove(j.line, j.dot); j.line.geometry.dispose(); j.dot.geometry.dispose(); }
  jointObjs = [];
  if (!t.showJoints || t.mode) return;
  const decls = c.result.relationshipDeclarations || [];
  decls.forEach((d, index) => {
    const A = boardGroups.get(d.panelAId);
    const B = boardGroups.get(d.panelBId);
    if (!A || !B) return;
    const sep = separation(A.board, B.board);
    const status = jointStatus(sep);
    const pa = A.center.clone().add(A.group.position);
    const pb = B.center.clone().add(B.group.position);
    const geo = new THREE.BufferGeometry().setFromPoints([pa, pb]);
    const line = new THREE.Line(geo, jointMats[status]);
    line.renderOrder = 12;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(4, bbox.getSize(new THREE.Vector3()).length() / 180), 10, 10), jointDotMats[status]);
    dot.position.copy(pa).lerp(pb, 0.5);
    dot.userData = { kind: "joint", index, decl: d, sep, status };
    dot.renderOrder = 16;
    cabRoot.add(line, dot);
    jointObjs.push({ line, dot, decl: d, sep, status, index });
  });
}

// --- explode: assembly / radial, steps, trails, labels ------------------------------------------
// Only the groups' positions move (docs/bench-spec.md). Geometry, boards and the result never change.

const GHOST_OPACITY = 0.22;
const STEP_MS = 380;
let explodeAnim = null;

/** Index of a board in the assembly order (-1 when unknown). */
function stepIndex(id) {
  return explodePlan ? explodePlan.order.indexOf(id) : -1;
}
/** In step mode: the board that just went in. */
export function stepCurrentId() {
  const t = tab();
  if (!t || t.step == null || !explodePlan || t.step < 1) return null;
  return explodePlan.order[t.step - 1] || null;
}
/** In step mode: still waiting outside (drawn faint, at its exploded position). */
function isWaiting(id) {
  const t = tab();
  return !!(t && t.step != null && stepIndex(id) >= t.step);
}
/** Whether the exploded state is visible at all (something is offset or steps are on). */
function explodeActive() {
  const t = tab();
  return !!(t && (t.explode > 0 || t.step != null));
}

/** Target offset per board for the tab's mode / factor / step. */
function explodeTargets() {
  const t = tab();
  const c = cur();
  const out = new Map();
  if (!t || !c || !explodePlan) return out;
  const boards = c.result.boards || [];
  const factor = t.step != null ? Math.max(t.explode, 0.01) : t.explode;
  const size = bbox.getSize(new THREE.Vector3());
  const raw = t.explodeMode === "radial"
    ? radialOffsets(boards, factor)
    : assemblyOffsets(explodePlan.plan, explodePlan.order, explodeUnit(size), factor);
  for (const b of boards) {
    const o = raw.get(b.id) || [0, 0, 0];
    // Steps: boards already in sit at home; the rest wait at their exploded position.
    const home = t.step != null && stepIndex(b.id) < t.step;
    const at = home ? new THREE.Vector3() : new THREE.Vector3(o[0], o[1], o[2]);
    const n = t.nudge?.[b.id];
    if (n) at.add(new THREE.Vector3(n[0], n[1], n[2]));
    out.set(b.id, at);
  }
  return out;
}

/** Move the boards to their targets — at once (slider) or over STEP_MS (a step). */
export function applyExplode({ animate = false } = {}) {
  const t = tab();
  if (!t || !bbox) return;
  const targets = explodeTargets();
  if (explodeAnim) { cancelAnimationFrame(explodeAnim); explodeAnim = null; }
  if (!animate) {
    for (const [id, g] of boardGroups) g.group.position.copy(targets.get(id) || new THREE.Vector3());
    afterExplodeMove();
    return;
  }
  const from = new Map(Array.from(boardGroups, ([id, g]) => [id, g.group.position.clone()]));
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / STEP_MS);
    const e = 1 - (1 - k) ** 3;
    for (const [id, g] of boardGroups) g.group.position.lerpVectors(from.get(id), targets.get(id) || new THREE.Vector3(), e);
    afterExplodeMove();
    explodeAnim = k < 1 ? requestAnimationFrame(tick) : null;
  };
  explodeAnim = requestAnimationFrame(tick);
}
/** Everything that hangs on the boards' positions. */
function afterExplodeMove() {
  buildJoints();
  updateTrails();
  updateLabels();
  applyOpacity();
}

export function applyOpacity() {
  const t = tab();
  for (const [id, g] of boardGroups) {
    // Default mode fades the other boards. Face mode keeps them solid so the mating face stays readable.
    const inMode = t.mode?.kind === "default" && id !== t.mode.board;
    const o = inMode ? Math.min(t.opacity, MODE_GHOST) : isWaiting(id) ? Math.min(t.opacity, GHOST_OPACITY) : t.opacity;
    g.mat.transparent = o < 1;
    g.mat.opacity = o;
    g.mat.depthWrite = o >= 1;
    g.mat.needsUpdate = true;
    for (const m of g.coats) {
      m.transparent = o < 1;
      m.opacity = o;
      m.depthWrite = o >= 1;
      m.needsUpdate = true;
    }
    g.edges.material = isWaiting(id) || inMode ? edgeMatGhost : edgeMat;
  }
}

// Trails: a dashed line from where a board sits to where it is drawn; the board that just went in gets the accent.
const trailMat = new THREE.LineDashedMaterial({ color: 0x8a93a0, dashSize: 24, gapSize: 14, transparent: true, opacity: 0.8 });
const trailMatCur = new THREE.LineDashedMaterial({ color: 0xffd166, dashSize: 24, gapSize: 14 });
const edgeMatGhost = new THREE.LineBasicMaterial({ color: 0x4a4034, transparent: true, opacity: 0.3 });
let trails = null; // { all: LineSegments, cur: LineSegments }
function buildTrails() {
  if (trails) { cabRoot.remove(trails.all, trails.cur); trails.all.geometry.dispose(); trails.cur.geometry.dispose(); }
  const mk = (mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(Math.max(boardGroups.size, 1) * 6), 3));
    const l = new THREE.LineSegments(geo, mat);
    l.renderOrder = 11;
    l.frustumCulled = false;
    cabRoot.add(l);
    return l;
  };
  trails = { all: mk(trailMat), cur: mk(trailMatCur) };
}
export function updateTrails() {
  const t = tab();
  if (!trails || !t) return;
  const on = t.trails !== false && explodeActive();
  const curId = stepCurrentId();
  let nAll = 0;
  let nCur = 0;
  const pa = trails.all.geometry.attributes.position;
  const pc = trails.cur.geometry.attributes.position;
  if (on) {
    for (const [id, g] of boardGroups) {
      const off = g.group.position;
      // The board that just went in is home: draw its trail from where it waited.
      const isCur = id === curId;
      if (!isCur && off.lengthSq() < 1) continue;
      const home = g.center;
      const away = isCur ? home.clone().add(explodeTargetsWaiting(id)) : home.clone().add(off);
      const p = isCur ? pc : pa;
      const n = isCur ? nCur : nAll;
      p.setXYZ(n * 2, home.x, home.y, home.z);
      p.setXYZ(n * 2 + 1, away.x, away.y, away.z);
      if (isCur) nCur += 1; else nAll += 1;
    }
  }
  for (const [l, n, p] of [[trails.all, nAll, pa], [trails.cur, nCur, pc]]) {
    p.needsUpdate = true;
    l.geometry.setDrawRange(0, n * 2);
    l.visible = n > 0;
    if (n) { l.computeLineDistances(); l.geometry.computeBoundingSphere(); }
  }
}
/** Where a board would wait if it were still outside (for the current board's trail). */
function explodeTargetsWaiting(id) {
  const t = tab();
  const c = cur();
  const boards = c.result.boards || [];
  const factor = Math.max(t.explode, 0.01);
  const raw = t.explodeMode === "radial" ? radialOffsets(boards, factor) : assemblyOffsets(explodePlan.plan, explodePlan.order, explodeUnit(bbox.getSize(new THREE.Vector3())), factor);
  const o = raw.get(id) || [0, 0, 0];
  return new THREE.Vector3(o[0], o[1], o[2]);
}

// Labels: the board id as a sprite at a constant screen size (the same role id nesting and labels use).
const labelTextures = new Map(); // `${text}|${tone}` -> CanvasTexture
function labelTexture(text, tone) {
  const key = `${text}|${tone}`;
  if (labelTextures.has(key)) return labelTextures.get(key);
  const dpr = 2;
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d");
  ctx.font = `600 ${22 * dpr}px "Segoe UI", system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 20 * dpr;
  const hgt = 34 * dpr;
  cv.width = w; cv.height = hgt;
  ctx.font = `600 ${22 * dpr}px "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const r = 8 * dpr;
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, hgt - 2, r);
  ctx.fillStyle = tone === "cur" ? "rgba(255, 209, 102, 0.95)" : "rgba(26, 28, 31, 0.85)";
  ctx.fill();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = tone === "cur" ? "#ffd166" : tone === "ghost" ? "rgba(138, 147, 160, 0.5)" : "#8a93a0";
  ctx.stroke();
  ctx.fillStyle = tone === "cur" ? "#1a1c1f" : tone === "ghost" ? "rgba(216, 221, 228, 0.55)" : "#d8dde4";
  ctx.fillText(text, w / 2, hgt / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { aspect: w / hgt };
  labelTextures.set(key, tex);
  return tex;
}
let labelSprites = new Map(); // boardId -> Sprite
function buildLabels() {
  for (const s of labelSprites.values()) { cabRoot.remove(s); s.material.dispose(); }
  labelSprites = new Map();
  for (const [id] of boardGroups) {
    const mat = new THREE.SpriteMaterial({ map: labelTexture(id, ""), sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 40;
    s.visible = false;
    cabRoot.add(s);
    labelSprites.set(id, s);
  }
}
export function updateLabels() {
  const t = tab();
  if (!t) return;
  const on = t.explodeLabels !== false && explodeActive();
  const curId = stepCurrentId();
  const hgt = 0.032; // fraction of the view height (× 2·tan(fov/2))
  for (const [id, s] of labelSprites) {
    s.visible = on;
    if (!on) continue;
    const g = boardGroups.get(id);
    const tone = id === curId ? "cur" : isWaiting(id) ? "ghost" : "";
    const tex = labelTexture(id, tone);
    if (s.material.map !== tex) { s.material.map = tex; s.material.needsUpdate = true; }
    s.position.copy(g.center).add(g.group.position);
    s.scale.set(hgt * tex.userData.aspect * camera.aspect, hgt, 1);
  }
}

/** Steps: n boards in. `null` leaves step mode. */
export function setStep(n, how) {
  const t = tab();
  if (!t || !explodePlan) return;
  const N = explodePlan.order.length;
  const next = n == null ? null : Math.max(0, Math.min(N, n));
  if (next === t.step) return;
  // Entering steps with the slider at 0 would show nothing moving: give it a working distance.
  if (next != null && t.step == null && t.explode <= 0) { t.explode = 0.6; $("#explode").value = "0.6"; }
  t.step = next;
  applyExplode({ animate: true });
  paintSelection();
  syncToolbar();
  logExplode(how);
  saveState();
}
export function logExplode(how) {
  const t = tab();
  if (!t) return;
  log("bench.explode", { module: t.moduleId, mode: t.explodeMode, factor: t.explode, step: t.step, of: explodePlan?.order.length ?? 0, board: stepCurrentId(), order: explodePlan?.order || [], how });
}
export function applyCut() {
  const t = tab();
  if (!bbox) return;
  const planes = [];
  const min = bbox.min, max = bbox.max;
  if (t.cut.x < 1) { clipPlanes[0].constant = min.x + (max.x - min.x) * t.cut.x; planes.push(clipPlanes[0]); }
  if (t.cut.y < 1) { clipPlanes[1].constant = min.y + (max.y - min.y) * t.cut.y; planes.push(clipPlanes[1]); }
  if (t.cut.z < 1) { clipPlanes[2].constant = min.z + (max.z - min.z) * t.cut.z; planes.push(clipPlanes[2]); }
  const list = planes.length ? planes : null;
  for (const g of boardGroups.values()) {
    g.mat.clippingPlanes = list;
    for (const m of g.coats) m.clippingPlanes = list;
  }
  for (const m of sharedClipped) m.clippingPlanes = list;
}

export function setBenchView(name) {
  const t = tab();
  t.view = name;
  $$("#viewGroup [data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("#viewLabel").textContent = name === "3d" ? "3D" : name[0].toUpperCase() + name.slice(1);
  setView(name);
  frameCabinet();
}
export function frameCabinet() {
  if (!bbox) return;
  const sphere = bbox.getBoundingSphere(new THREE.Sphere());
  frame(sphere.center, Math.max(sphere.radius, 200));
  storeCamera();
}
export function storeCamera() {
  const t = tab();
  if (!t) return;
  t.camera = { pos: camera.position.toArray(), target: controls.target.toArray() };
}

const HL = 0x3a2a00;
export function paintSelection() {
  const t = tab();
  const sel = t?.selection;
  const curId = stepCurrentId();
  for (const [id, g] of boardGroups) {
    const on = (sel && (sel.kind === "board" || sel.kind === "face" || sel.kind === "point") && sel.id === id) || id === curId;
    const joint = sel && sel.kind === "joint" && (sel.a === id || sel.b === id);
    const l3 = t.l3 === id;
    g.mat.emissive.setHex(on || joint || l3 ? HL : 0x000000);
    g.mat.emissiveIntensity = on || l3 ? 1.2 : joint ? 0.8 : 0;
    const rest = g.bodyHex != null ? g.bodyHex : g.board.category === "front_panel" ? 0x9ec5d8 : STIPPLE_WHITE;
    g.mat.color.setHex(on || l3 ? 0xffe08a : joint ? 0xe8d7b0 : rest);
  }
  renderExplodeOrder();
  for (const m of pointMeshes) {
    const p = m.userData.point;
    const on = sel && sel.kind === "point" && sel.id === m.userData.boardId && sel.keys && sel.keys.join() === p.keys.join();
    m.material = on ? pointSelMat : p.kind === "outline" ? pointOutlineMat : pointMat;
    m.scale.setScalar(on ? 1.6 : 1);
  }
  for (const j of jointObjs) {
    const on = sel && sel.kind === "joint" && sel.index === j.index;
    j.dot.scale.setScalar(on ? 1.8 : 1);
  }
}

// --- picking -----------------------------------------------------------------------------

export const raycaster = new THREE.Raycaster();
function pickAt(clientX, clientY) {
  const t = tab();
  if (!t) return null;
  const ray = rayFromClient(clientX, clientY);
  raycaster.set(ray.origin, ray.direction);
  const order = [];
  if (t.showPoints && pointMeshes.length) order.push(pointMeshes);
  if (t.showJoints && jointObjs.length) order.push(jointObjs.map((j) => j.dot));
  order.push(Array.from(boardGroups.values()).map((g) => g.mesh));
  for (const list of order) {
    const hits = raycaster.intersectObjects(list, false);
    if (hits.length) return hits[0];
  }
  return null;
}

let down = null;
let faceDrag = null;
canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, b: e.button };
  const t = tab();
  if (t?.mode?.kind === "face" && t.faceMove && e.button === 0) {
    const hit = pickAt(e.clientX, e.clientY);
    if (hit?.object.userData.kind === "board" && hit.object.userData.boardId === t.mode.board) faceDrag = { id: t.mode.board, moved: false };
  }
});
canvas.addEventListener("pointerup", (e) => {
  const d = down;
  down = null;
  storeCamera();
  if (faceDrag?.moved) { faceDrag = null; return; }
  faceDrag = null;
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
  const hit = pickAt(e.clientX, e.clientY);
  if (e.button === 2) { if (hit && hit.object.userData.kind === "board") boardCtx(hit.object.userData.boardId, e.clientX, e.clientY); return; }
  if (e.button !== 0) return;
  if (tab()?.mode) { if (tab().mode.kind === "face") facePick(faceHit(e.clientX, e.clientY)); return; }
  if (!hit) { select(null); return; }
  const u = hit.object.userData;
  if (u.kind === "board") select({ kind: "board", id: u.boardId });
  else if (u.kind === "joint") select({ kind: "board", id: u.decl.panelAId });
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
/** Slide one board in the picture, along the screen. Display only. */
function slideBoard(id, dx, dy) {
  const t = tab();
  if (!t || !dx && !dy) return;
  const dist = Math.max(camera.position.distanceTo(controls.target), 200);
  const worldPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * dist) / Math.max(canvas.clientHeight, 1);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const cur = t.nudge?.[id] || [0, 0, 0];
  t.nudge = { ...(t.nudge || {}), [id]: [
    cur[0] + right.x * dx * worldPerPx + up.x * -dy * worldPerPx,
    cur[1] + right.y * dx * worldPerPx + up.y * -dy * worldPerPx,
    cur[2] + right.z * dx * worldPerPx + up.z * -dy * worldPerPx,
  ] };
  applyExplode();
}
export function toggleFaceMove() {
  const t = tab();
  if (t?.mode?.kind !== "face") return;
  t.faceMove = !t.faceMove;
  log("bench.face.move", { module: t.moduleId, on: !!t.faceMove });
  applyOpacity();
  renderSelection();
}
export function clearNudge() {
  const t = tab();
  if (!t) return;
  t.nudge = null;
  applyExplode();
  renderSelection();
}

canvas.addEventListener("pointermove", (e) => {
  if (faceDrag && down) {
    slideBoard(faceDrag.id, e.movementX, e.movementY);
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) faceDrag.moved = true;
    hideTip();
    return;
  }
  if (down) { hideTip(); return; }
  const hit = pickAt(e.clientX, e.clientY);
  const c = cur();
  if (hover && hover !== hit?.object) {
    if (hover.userData.kind === "point") {
      const p = hover.userData.point;
      const tsel = tab().selection;
      const isSel = tsel && tsel.kind === "point" && tsel.keys && tsel.keys.join() === p.keys.join();
      const isHl = highlight && p.keys.some((k) => highlight.keys.has(k));
      hover.material = isSel || isHl ? pointSelMat : p.kind === "outline" ? pointOutlineMat : pointMat;
    }
    hover = null;
  }
  if (!hit) { hideTip(); canvas.style.cursor = ""; return; }
  hover = hit.object;
  canvas.style.cursor = "pointer";
  const u = hover.userData;
  if (u.kind === "point") {
    const tsel = tab().selection;
    const isSel = tsel && tsel.kind === "point" && tsel.keys && tsel.keys.join() === u.point.keys.join();
    if (!isSel) hover.material = pointHoverMat;
    const [A, B] = planeAxes(c.boards.get(u.boardId).profilePlane);
    const lines = [`${u.boardId}`, `${A} ${fmt(u.point.cabinet[0])} · ${B} ${fmt(u.point.cabinet[1])}`];
    u.point.keys.forEach((k, i) => { const flat = flatFormula(c.prov, k); if (flat) lines.push(`${i === 0 ? A : B} = ${flat}`); });
    tip(e.clientX, e.clientY, lines);
  } else if (u.kind === "joint") {
    tip(e.clientX, e.clientY, [`${u.decl.panelAId} ↔ ${u.decl.panelBId}`, `${u.decl.relationshipType} · ${u.status === "ok" ? "touching" : u.status === "gap" ? `gap ${fmt(u.sep)} mm` : `overlap ${fmt(-u.sep)} mm`}`], u.status === "ok" ? "" : "warn");
  } else if (u.kind === "board") {
    const b = c.boards.get(u.boardId);
    tip(e.clientX, e.clientY, [`${b.id} · ${b.name}`, `${fmt(b.x1 - b.x0)} × ${fmt(b.y1 - b.y0)} × ${fmt(b.z1 - b.z0)} · ${b.profilePlane} · t ${fmt(b.materialThickness)}`]);
  }
});
canvas.addEventListener("pointerleave", () => { hideTip(); });
canvas.addEventListener("wheel", () => { storeCamera(); }, { passive: true });

/** Cursor tip positioned for wherever the canvas sits in #bcenter (full view or the L3 inset). */
export function tip(clientX, clientY, lines, tone = "") {
  const cr = canvas.getBoundingClientRect();
  const br = $("#bcenter").getBoundingClientRect();
  showTip(clientX + (cr.left - br.left), clientY + (cr.top - br.top), lines, tone);
}

export function select(sel) {
  const t = tab();
  t.selection = sel;
  t.tryout = null;
  if (sel) {
    const c = cur();
    const value = sel.kind === "point" ? sel.cabinet : sel.kind === "face" ? entryOf(c.prov, sel.key)?.value : null;
    const formula = sel.kind === "face" ? entryOf(c.prov, sel.key)?.formula : sel.kind === "point" ? sel.keys.map((k) => entryOf(c.prov, k)?.formula).join(" | ") : null;
    log("bench.select", { module: t.moduleId, what: sel.kind, id: sel.id ?? `${sel.a}↔${sel.b}`, key: sel.key || null, keys: sel.keys || null, value, formula });
  }
  const hadError = !!t.placeError;
  if (!sel || sel.kind === "board") t.placeError = null;
  paintSelection();
  // A board click only highlights it. Rebuilding the generator page would throw away the scroll position.
  const keepPage = !t.mode && !t.l3 && !hadError && (!sel || sel.kind === "board");
  if (!keepPage) renderSelection();
  renderBottom();
  renderL3();
  saveState();
}

