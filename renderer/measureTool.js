// Measure (I): click a point, an edge, or a face, then another.
//
//   point → point     distance, and ΔX ΔY ΔZ
//   one edge          its length (an arc's length, not the chord)
//   edge → edge       distance when parallel, otherwise the angle
//   edge → face       distance when the edge is parallel to the face, otherwise the angle
//   point → face      perpendicular distance onto the plane
//   face → face       the same, when the two planes are parallel
//                     the angle between them, when they are not
//
// Hover tints the point, edge, or face that a click would take. A point inside
// the snap aperture wins, then an edge, then the face under the cursor.
// A face is the infinite plane, so a face distance runs along the normal.
// Shift, after a length is done, continues from the last pick (up to MEASURE_LIMIT).
// Esc clears the reading; Esc again leaves. Nothing is written to the job.
import * as THREE from "three";
import * as job from "./job.js";
import { scene, canvas, activeCamera, rayFromClient, canvasClientRect } from "./space.js";
import { pickables, faceUnderHit, showFaceHint, hideFaceHint } from "./cabinets3d.js";
import { wallPickables } from "./walls3d.js";
import { boardCorners, nearestSnap, toClient, pickFace, describePoint, uiScale, SNAP_RADIUS_PX } from "./snap.js";
import { showTip, hideTip } from "./hud.js";
import { boardFaceLocal, worldPlane, worldOf, boardOverride, rotationMatrix, mulVec } from "./pose.js";
import { faceLabel, planeAxes } from "./boardModel.js";
import { arcOf } from "./sketchCurves.js";
import { log } from "./log.js";
import {
  MEASURE_LIMIT, boardSize, boardSummary, closestOnEdge, emptyMeasure, fmtMm, measureClick, measureLogPick, measureLogResult,
  measureMark, measurePreview, measureSummary, pickPoint, segmentLength,
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
const hoverFaceMat = new THREE.MeshBasicMaterial({ color: 0x7eb6ff, transparent: true, opacity: 0.32, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const anchorFaceMat = new THREE.MeshBasicMaterial({ color: 0xf0c070, transparent: true, opacity: 0.38, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const hoverEdgeMat = new THREE.LineBasicMaterial({ color: 0x7eb6ff, depthTest: false });
const anchorEdgeMat = new THREE.LineBasicMaterial({ color: 0xf0c070, depthTest: false });

function tintMesh(mat) {
  const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
  mesh.visible = false;
  mesh.frustumCulled = false;
  mesh.renderOrder = 31;
  scene.add(mesh);
  return mesh;
}
function tintLine(mat) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(3), 3));
  const line = new THREE.Line(geo, mat);
  line.visible = false;
  line.frustumCulled = false;
  line.renderOrder = 34;
  scene.add(line);
  return line;
}
const hoverFaceMesh = tintMesh(hoverFaceMat);
const anchorFaceMesh = tintMesh(anchorFaceMat);
const hoverEdgeLine = tintLine(hoverEdgeMat);
const anchorEdgeLine = tintLine(anchorEdgeMat);

function setLinePoints(line, points) {
  if (!points || points.length < 2) { line.visible = false; return; }
  const arr = new Float32Array(points.length * 3);
  points.forEach((p, i) => { arr[i * 3] = p.x; arr[i * 3 + 1] = p.y; arr[i * 3 + 2] = p.z; });
  line.geometry.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  line.geometry = geo;
  line.visible = true;
}

function setFaceLoop(mesh, points) {
  if (!points || points.length < 3) { mesh.visible = false; return; }
  const arr = [];
  for (let i = 1; i < points.length - 1; i += 1) {
    for (const p of [points[0], points[i], points[i + 1]]) arr.push(p.x, p.y, p.z);
  }
  mesh.geometry.dispose();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(arr, 3));
  mesh.geometry = geo;
  mesh.visible = true;
}

function showPickTint(pick, faceMesh, edgeLine) {
  const key = !pick ? "" : `${pick.kind}:${pick.cabId || ""}:${pick.boardId || ""}:${pick.faceId || ""}:${pick.label || ""}`;
  if (faceMesh.userData.key === key) {
    faceMesh.visible = !!(pick && pick.kind === "face" && pick.loop && pick.loop.length >= 3);
    edgeLine.visible = !!(pick && pick.kind === "edge" && pick.samples && pick.samples.length >= 2);
    return;
  }
  faceMesh.userData.key = key;
  faceMesh.visible = false;
  edgeLine.visible = false;
  if (!pick) return;
  if (pick.kind === "edge") setLinePoints(edgeLine, pick.samples);
  else if (pick.kind === "face" && pick.loop) setFaceLoop(faceMesh, pick.loop);
}

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
  hoverFaceMesh.visible = false;
  anchorFaceMesh.visible = false;
  hoverEdgeLine.visible = false;
  anchorEdgeLine.visible = false;
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
  else if (ms.anchor && ms.anchor.kind === "edge" && !ms.segments.length) {
    drawn.push({ text: `${fmtMm(ms.anchor.length)} mm`, at: ms.anchor.at, line: null, live: false });
  }
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
  const anchorAt = ms.anchor && ms.anchor.kind === "point" ? pickPoint(ms.anchor) : null;
  const hoverAt = hover && hover.kind === "point" ? pickPoint(hover) : null;
  const same = anchorAt && hoverAt && Math.hypot(hoverAt.x - anchorAt.x, hoverAt.y - anchorAt.y, hoverAt.z - anchorAt.z) < 0.5;
  placeMarker(anchorMark, anchorAt, 8);
  placeMarker(hoverMark, same ? null : hoverAt, 7);
  const hoverSame = hover && ms.anchor && hover.label === ms.anchor.label && hover.kind === ms.anchor.kind;
  showPickTint(ms.anchor, anchorFaceMesh, anchorEdgeLine);
  showPickTint(hoverSame ? null : hover, hoverFaceMesh, hoverEdgeLine);
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
  if (!ms.anchor && !ms.segments.length) rows.push(row("Click a point, an edge, or a face"));
  if (ms.anchor) {
    rows.push(row(ms.anchor.label));
    if (ms.anchor.kind === "edge") rows.push(row(`${fmtMm(ms.anchor.length)} mm`, "sub"));
    const size = boardSummary(ms.anchor.size);
    if (size) rows.push(row(size, "sub"));
    if (!ms.segments.length) {
      rows.push(row(ms.anchor.kind === "edge"
        ? "Length of this edge · click a second point, edge, or face"
        : "Click the second point, edge, or face", "sub"));
    }
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
  } else if (ms.anchor) lines.push("Click the second point, edge, or face");
  else if (ms.segments.length) lines.push("Click to start again", "Shift continues from the last point");
  else lines.push("Click a point, an edge, or a face");
  if (hover) lines.push(hover.label);
  if (hover?.kind === "edge" && !preview) lines.push(`${fmtMm(hover.length)} mm`);
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

const EDGE_PX = 10;
let edgeCache = null;
job.onChange(() => { edgeCache = null; });

function cabinetPoint(cab, board, local) {
  const o = boardOverride(cab.overrides?.boards?.[board.id]);
  const c = [(board.x0 + board.x1) / 2, (board.y0 + board.y1) / 2, (board.z0 + board.z1) / 2];
  const R = rotationMatrix(o.rotX, o.rotY, o.rotZ);
  const d = mulVec(R, [local[0] - c[0], local[1] - c[1], local[2] - c[2]]);
  const shifted = [c[0] + d[0] + o.x, c[1] + d[1] + o.y, c[2] + d[2] + o.z];
  const w = worldOf(cab.pose, shifted);
  return { x: w[0], y: w[1], z: w[2] };
}

function uvLocal(board, u, v, t) {
  const [U, V, T] = planeAxes(board.profilePlane);
  const p = [0, 0, 0];
  const ax = { x: 0, y: 1, z: 2 };
  p[ax[U]] = board[`${U}0`] + u;
  p[ax[V]] = board[`${V}0`] + v;
  p[ax[T]] = t;
  return p;
}

function sampleUv(a, b, bulge) {
  const arc = arcOf(a, b, bulge);
  if (!arc) return [a, b];
  const n = Math.max(8, Math.ceil(Math.abs(arc.sweep) / (Math.PI / 16)));
  const out = [];
  for (let i = 0; i <= n; i += 1) {
    const t = arc.a0 + arc.sweep * (i / n);
    out.push([arc.c[0] + arc.r * Math.cos(t), arc.c[1] + arc.r * Math.sin(t)]);
  }
  return out;
}

function outlineLoops(cab, board) {
  if (cab.moduleId === "sketchBoard" && Array.isArray(cab.params?.outline) && cab.params.outline.length >= 2) {
    const loops = [cab.params.outline, ...(cab.params.holes || [])];
    return loops.filter((loop) => Array.isArray(loop) && loop.length >= 2).map((loop) => ({
      uv: loop.map((p) => [Number(p.u), Number(p.v)]),
      bulge: loop.map((p) => Number(p.b) || 0),
    }));
  }
  const [U, V] = planeAxes(board.profilePlane);
  const pv = board.profileVector;
  let uv = null;
  if (board.profilePlane === "YZ") {
    if (pv && pv.length >= 4) uv = pv.map((p) => [Number(p.y) - board.y0, Number(p.z) - board.z0]);
    else if (board.cutProfileVector && board.cutProfileVector.length >= 4) uv = board.cutProfileVector.map((p) => [p.y, p.z]);
  } else if (pv && pv.length >= 4) {
    const mu = Math.min(...pv.map((p) => Number(p[U])));
    const mv = Math.min(...pv.map((p) => Number(p[V])));
    uv = pv.map((p) => [Number(p[U]) - mu, Number(p[V]) - mv]);
  }
  if (!uv) {
    const w = board[`${U}1`] - board[`${U}0`];
    const h = board[`${V}1`] - board[`${V}0`];
    uv = [[0, 0], [w, 0], [w, h], [0, h]];
  }
  if (uv.length > 2) {
    const a = uv[0];
    const b = uv[uv.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) uv = uv.slice(0, -1);
  }
  return [{ uv, bulge: uv.map(() => 0) }];
}

function pushEdge(out, cab, board, samples, length, faceId, name) {
  if (!samples || samples.length < 2 || !(length > 0.5)) return;
  const a = samples[0];
  const b = samples[samples.length - 1];
  out.push({
    kind: "edge",
    a, b, length, samples,
    at: samples[Math.floor(samples.length / 2)],
    label: `${cab.id} · ${name}`,
    cabId: cab.id,
    boardId: board.id,
    faceId,
  });
}

function buildEdges() {
  const out = [];
  for (const cab of job.getJob().cabinets) {
    for (const board of job.resultFor(cab.id)?.boards || []) {
      if (job.isBoardHidden(cab, board.id)) continue;
      const [,, T] = planeAxes(board.profilePlane);
      const t0 = board[`${T}0`];
      const t1 = board[`${T}1`];
      const name = board.name || board.id;
      for (const loop of outlineLoops(cab, board)) {
        const n = loop.uv.length;
        for (const t of [t0, t1]) {
          for (let i = 0; i < n; i += 1) {
            const uvA = loop.uv[i];
            const uvB = loop.uv[(i + 1) % n];
            const bulge = loop.bulge[i] || 0;
            const samples = sampleUv(uvA, uvB, bulge).map(([u, v]) => cabinetPoint(cab, board, uvLocal(board, u, v, t)));
            pushEdge(out, cab, board, samples, segmentLength(uvA[0], uvA[1], uvB[0], uvB[1], bulge), `E${i}`, `${name} edge`);
          }
        }
        for (let i = 0; i < n; i += 1) {
          const [u, v] = loop.uv[i];
          const a = cabinetPoint(cab, board, uvLocal(board, u, v, t0));
          const b = cabinetPoint(cab, board, uvLocal(board, u, v, t1));
          pushEdge(out, cab, board, [a, b], Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z), `S${i}`, `${name} thickness`);
        }
      }
    }
  }
  return out;
}

function boardEdges() {
  if (!edgeCache) edgeCache = buildEdges();
  return edgeCache;
}

function screenDistToPoly(clientX, clientY, samples) {
  let best = Infinity;
  for (let i = 1; i < samples.length; i += 1) {
    const a = toClient(samples[i - 1].x, samples[i - 1].y, samples[i - 1].z);
    const b = toClient(samples[i].x, samples[i].y, samples[i].z);
    if (a.behind || b.behind) continue;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((clientX - a.x) * dx + (clientY - a.y) * dy) / len2));
    best = Math.min(best, Math.hypot(clientX - (a.x + dx * t), clientY - (a.y + dy * t)));
  }
  return best;
}

function nearestEdge(clientX, clientY) {
  const max = EDGE_PX * uiScale();
  let best = null;
  let bestD = max;
  for (const edge of boardEdges()) {
    const d = screenDistToPoly(clientX, clientY, edge.samples);
    if (d < bestD) { bestD = d; best = edge; }
  }
  return best;
}

function faceLoop(cab, board, faceId) {
  const [,, T] = planeAxes(board.profilePlane);
  const t = faceId === "B" ? board[`${T}0`] : board[`${T}1`];
  const loop = outlineLoops(cab, board)[0];
  if (!loop) return null;
  return loop.uv.map(([u, v]) => cabinetPoint(cab, board, uvLocal(board, u, v, t)));
}

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
    loop: face.id === "A" || face.id === "B" ? faceLoop(cab, board, face.id) : null,
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
  const edge = nearestEdge(clientX, clientY);
  if (edge) return edge;
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
