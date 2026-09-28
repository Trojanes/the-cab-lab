// Groove command (G): draw grooves on the big face of any board, in any module.
//
//   pick   hover a board; the face under the cursor lights up (A / B only). Click it:
//          the view turns to look straight at that face.
//   draw   Line: click the start of the centreline, click its end — the groove runs
//          along the face's u or v axis, `width` across. Rectangle: two corners.
//          Groove = a half groove of `depth`. T groove = the rectangles drawn while it
//          is on belong to one T (main channel + branches), each its own rectangle.
//          Snaps: the face's corners and edge midpoints, and the corners / centreline
//          ends of the grooves already on it; else whole millimetres. Shift = free.
//
// A groove is stored on the cabinet (`overrides.boards[roleId].grooves`, job.setBoardGrooves)
// in the board's face-local (u, v); job.resultFor merges it after the generator, so 3D,
// the milling check and the .cnjob export all read it like a generator groove.
// Esc: drops the first point → back to picking a face → leaves the command.
import * as THREE from "three";
import * as job from "./job.js";
import { canvas, rayFromClient, beginFaceView, endFaceView } from "./space.js";
import { pickables, groupFor, faceUnderHit, showFaceHint, hideFaceHint, showSketchPick, hideSketchPick, showSnapMarker, hideSnapMarker } from "./cabinets3d.js";
import { showTip, hideTip } from "./hud.js";
import { toClient, uiScale, SNAP_RADIUS_PX } from "./snap.js";
import { log } from "./log.js";

const PLANE_AXES = { XY: ["x", "y", "z"], XZ: ["x", "z", "y"], YZ: ["y", "z", "x"] };
const MIN_FLOOR_MM = 1;

let ctx = { stopOthers() {}, emitMode() {} };
let gv = null;
/** Remembered for the session: the last kind, shape and sizes. */
const last = { kind: "groove", shape: "line", width: 8, depth: 8 };

export function initGrooveTool(c) { ctx = c; }
export function grooveActive() { return !!gv; }
export function grooveMode() { return gv ? `groove.${gv.step}` : null; }

// --- card ----------------------------------------------------------------------------

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === true) e.setAttribute(k, "");
    else if (v !== false && v != null) e.setAttribute(k, v);
  }
  e.append(...children);
  return e;
}

const card = el("div", { id: "grooveCard", class: "hidden" });
document.getElementById("moveCard").parentElement.append(card);
for (const type of ["pointerdown", "pointerup", "wheel", "contextmenu", "dblclick"]) card.addEventListener(type, (e) => e.stopPropagation());

const title = el("div", { class: "move-card-title", text: "Groove" });
const where = el("div", { class: "move-note" });
function seg(options, key) {
  const wrap = el("div", { class: "groove-seg" });
  const buttons = options.map((o) => el("button", {
    class: "tb seg", type: "button", text: o.label, title: o.title || "",
    onclick: () => { setOption(key, o.id); },
  }));
  buttons.forEach((b, i) => { b.dataset.value = options[i].id; wrap.append(b); });
  return wrap;
}
const kindSeg = seg([
  { id: "groove", label: "Groove", title: "Half groove: a pocket of the depth below" },
  { id: "tgroove", label: "T groove", title: "Each rectangle drawn while this is on joins one T: main channel, then the branches" },
], "kind");
const shapeSeg = seg([
  { id: "line", label: "Line", title: "Click the two ends of the centreline; the width is across it" },
  { id: "rect", label: "Rectangle", title: "Click two opposite corners" },
], "shape");
function numInput(key, label) {
  const input = el("input", { type: "number", step: "0.5", min: "0.5" });
  input.addEventListener("change", () => {
    const v = Number(input.value);
    if (v > 0) { last[key] = Math.round(v * 10) / 10; log("groove.size", { key, value: last[key] }); }
    paintCard();
    redraw();
  });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); input.blur(); } e.stopPropagation(); });
  return { input, row: el("label", { class: "groove-field" }, [el("span", { text: label }), input, el("span", { class: "groove-unit", text: "mm" })]) };
}
const widthField = numInput("width", "Width");
const depthField = numInput("depth", "Depth");
const note = el("div", { class: "move-note" });
const backBtn = el("button", { class: "tb", type: "button", text: "Other face", onclick: () => backToPick("button") });
const doneBtn = el("button", { class: "tb primary", type: "button", text: "Done", onclick: () => endGroove("button") });
card.append(title, where, kindSeg, shapeSeg, widthField.row, depthField.row, note, el("div", { class: "groove-actions" }, [backBtn, doneBtn]));

function setOption(key, value) {
  if (last[key] === value) return;
  last[key] = value;
  if (gv) {
    gv.a = null;
    if (key === "kind") gv.group = null;
  }
  log("groove.option", { key, value });
  paintCard();
  redraw();
}

function paintCard() {
  if (!gv) return;
  for (const b of kindSeg.children) b.classList.toggle("active", b.dataset.value === last.kind);
  for (const b of shapeSeg.children) b.classList.toggle("active", b.dataset.value === last.shape);
  widthField.row.classList.toggle("hidden", last.shape !== "line");
  if (document.activeElement !== widthField.input) widthField.input.value = last.width;
  if (document.activeElement !== depthField.input) depthField.input.value = last.depth;
  const info = gv.step === "draw" ? faceInfo() : null;
  if (info) {
    depthField.input.max = String(info.t - MIN_FLOOR_MM);
    where.textContent = `${info.board.name || info.board.id} (${info.board.id}) · face ${gv.faceId} · ${Math.round(info.w)} × ${Math.round(info.h)} · ${info.t} stock`;
    const n = job.boardGrooves(info.cab, gv.boardId).length;
    note.textContent = last.depth > info.t - MIN_FLOOR_MM
      ? `Depth over ${info.t - MIN_FLOOR_MM}: the board keeps ${MIN_FLOOR_MM} mm under the groove`
      : `${n} groove${n === 1 ? "" : "s"} on this board · ${gv.a ? "click the other end" : last.shape === "line" ? "click the start of the centreline" : "click the first corner"} · Esc ${gv.a ? "drops the point" : "picks another face"}`;
    note.classList.toggle("warn", last.depth > info.t - MIN_FLOOR_MM);
  } else {
    where.textContent = "Click the face of a board to groove";
    note.textContent = "Any board of any module · the big faces only";
    note.classList.remove("warn");
  }
  backBtn.disabled = gv.step !== "draw";
}

// --- start / stop --------------------------------------------------------------------

export function startGroove() {
  if (gv) { endGroove("toggle"); return; }
  if (!job.getJob().cabinets.length) return;
  ctx.stopOthers();
  gv = { step: "pick", cabId: null, boardId: null, faceId: null, a: null, group: null, client: null };
  card.classList.remove("hidden");
  canvas.style.cursor = "crosshair";
  log("groove.arm", { ...last });
  paintCard();
  ctx.emitMode();
}

export function endGroove(how = "esc") {
  if (!gv) return;
  const g = gv;
  gv = null;
  card.classList.add("hidden");
  hideSketchPick();
  hideSnapMarker();
  hideFaceHint();
  hideTip();
  endFaceView();
  canvas.style.cursor = "";
  log("groove.exit", { how, board: g.boardId, face: g.faceId });
  ctx.emitMode();
}

function backToPick(how) {
  if (!gv) return;
  log("groove.back", { how, board: gv.boardId, face: gv.faceId });
  gv.step = "pick";
  gv.cabId = null;
  gv.boardId = null;
  gv.faceId = null;
  gv.a = null;
  gv.group = null;
  hideSketchPick();
  hideSnapMarker();
  endFaceView();
  paintCard();
  ctx.emitMode();
}

// --- the face -------------------------------------------------------------------------

/** The board being grooved: its mesh holder (cabinet frame → world), axes and face-local size. */
function faceInfo(cabId = gv && gv.cabId, boardId = gv && gv.boardId, faceId = gv && gv.faceId) {
  const cab = job.getJob().cabinets.find((c) => c.id === cabId);
  const board = cab && (job.resultFor(cab.id)?.boards || []).find((b) => b.id === boardId);
  if (!board) return null;
  const axes = PLANE_AXES[board.profilePlane];
  if (!axes) return null;
  const [U, V, T] = axes;
  let holder = null;
  groupFor(cab.id)?.traverse((o) => { if (!holder && o.isMesh && o.userData?.kind === "board" && o.userData.boardId === boardId) holder = o.parent; });
  if (!holder) return null;
  holder.updateMatrixWorld(true);
  return {
    cab, board, U, V, T, holder,
    u0: board[`${U}0`], v0: board[`${V}0`],
    w: board[`${U}1`] - board[`${U}0`], h: board[`${V}1`] - board[`${V}0`], t: Math.abs(board[`${T}1`] - board[`${T}0`]),
    tFace: faceId === "A" ? board[`${T}1`] : board[`${T}0`],
    sign: faceId === "A" ? 1 : -1,
  };
}

/** Face-local (u, v) → world, lifted off the face so the outline is not hidden in it. */
function toWorld(info, u, v, lift = 0.8) {
  const p = { x: 0, y: 0, z: 0 };
  p[info.U] = info.u0 + u;
  p[info.V] = info.v0 + v;
  p[info.T] = info.tFace + info.sign * lift;
  return new THREE.Vector3(p.x, p.y, p.z).applyMatrix4(info.holder.matrixWorld);
}

/** The face as a world face (`{ axis, dir, value, ext }`) for the hint and the straight-on view. */
function worldFace(info) {
  const pts = [[0, 0], [info.w, 0], [0, info.h], [info.w, info.h]].map(([u, v]) => toWorld(info, u, v, 0));
  const ext = {};
  for (const a of ["x", "y", "z"]) ext[a] = [Math.min(...pts.map((p) => p[a])), Math.max(...pts.map((p) => p[a]))];
  const axis = ["x", "y", "z"].reduce((m, a) => (ext[a][1] - ext[a][0] < ext[m][1] - ext[m][0] ? a : m), "x");
  const n = new THREE.Vector3(info.T === "x" ? 1 : 0, info.T === "y" ? 1 : 0, info.T === "z" ? 1 : 0).transformDirection(info.holder.matrixWorld).multiplyScalar(info.sign);
  return { axis, dir: Math.sign(n[axis]) || 1, value: ext[axis][0], ext, label: `${info.board.id} · ${gv ? gv.faceId : ""}` };
}

/** Cursor → face-local (u, v) on the face plane, or null. */
function cursorUV(info, e) {
  const ray = rayFromClient(e.clientX, e.clientY);
  const inv = info.holder.matrixWorld.clone().invert();
  const o = ray.origin.clone().applyMatrix4(inv);
  const d = ray.direction.clone().transformDirection(inv);
  if (Math.abs(d[info.T]) < 1e-9) return null;
  const k = (info.tFace - o[info.T]) / d[info.T];
  const p = o.addScaledVector(d, k);
  return [p[info.U] - info.u0, p[info.V] - info.v0];
}

function snapCandidates(info) {
  const { w, h } = info;
  const out = [
    { uv: [0, 0], label: "Corner" }, { uv: [w, 0], label: "Corner" }, { uv: [0, h], label: "Corner" }, { uv: [w, h], label: "Corner" },
    { uv: [w / 2, 0], label: "Edge midpoint" }, { uv: [w / 2, h], label: "Edge midpoint" }, { uv: [0, h / 2], label: "Edge midpoint" }, { uv: [w, h / 2], label: "Edge midpoint" },
    { uv: [w / 2, h / 2], label: "Face centre" },
  ];
  for (const g of job.boardGrooves(info.cab, gv.boardId)) {
    if (g.face !== gv.faceId) continue;
    for (const uv of [[g.u0, g.v0], [g.u1, g.v0], [g.u0, g.v1], [g.u1, g.v1]]) out.push({ uv, label: `Groove ${g.id} corner` });
    const along = g.u1 - g.u0 >= g.v1 - g.v0;
    const mu = (g.u0 + g.u1) / 2;
    const mv = (g.v0 + g.v1) / 2;
    for (const uv of along ? [[g.u0, mv], [g.u1, mv], [mu, mv]] : [[mu, g.v0], [mu, g.v1], [mu, mv]]) out.push({ uv, label: `Groove ${g.id} centreline` });
  }
  return out;
}

/** Where the cursor lands on the face: a snap point, else whole millimetres; kept on the face. */
function resolve(info, e) {
  const raw = cursorUV(info, e);
  if (!raw) return null;
  if (!e.shiftKey) {
    const radius = SNAP_RADIUS_PX * uiScale();
    let best = null;
    for (const c of snapCandidates(info)) {
      const s = toWorld(info, c.uv[0], c.uv[1], 0);
      const sc = toClient(s.x, s.y, s.z);
      const d = Math.hypot(sc.x - e.clientX, sc.y - e.clientY);
      if (d <= radius && (!best || d < best.d)) best = { d, ...c };
    }
    if (best) return { uv: best.uv.slice(), label: best.label, snap: true };
  }
  const uv = e.shiftKey ? raw : raw.map((n) => Math.round(n));
  return { uv: [Math.max(0, Math.min(info.w, uv[0])), Math.max(0, Math.min(info.h, uv[1]))], label: null, snap: false };
}

/** The groove rectangle from the first point to `b`, clamped to the face. */
function grooveRect(info, a, b) {
  let u0; let u1; let v0; let v1;
  if (last.shape === "rect") {
    [u0, u1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
    [v0, v1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
  } else {
    const half = last.width / 2;
    if (Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1])) {
      [u0, u1] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])];
      [v0, v1] = [a[1] - half, a[1] + half];
    } else {
      [u0, u1] = [a[0] - half, a[0] + half];
      [v0, v1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
    }
  }
  const r1 = (n) => Math.round(n * 10) / 10;
  return {
    u0: r1(Math.max(0, u0)), u1: r1(Math.min(info.w, u1)),
    v0: r1(Math.max(0, v0)), v1: r1(Math.min(info.h, v1)),
  };
}

function showRect(info, r, bad = false) {
  const pts = [[r.u0, r.v0], [r.u1, r.v0], [r.u1, r.v1], [r.u0, r.v1]].map(([u, v]) => toWorld(info, u, v));
  showSketchPick(pts, { closed: true, bad });
}

// --- pointer / keys -------------------------------------------------------------------

function pickFaceHit(e) {
  const ray = rayFromClient(e.clientX, e.clientY);
  const rc = new THREE.Raycaster(ray.origin, ray.direction);
  const hit = rc.intersectObjects(pickables(), false).find((h) => h.object.userData.kind === "board" && h.object.userData.boardId);
  const under = hit ? faceUnderHit(hit) : null;
  return under && under.faceId ? under : null;
}

export function groovePointerMove(e) {
  if (!gv) return;
  gv.client = { clientX: e.clientX, clientY: e.clientY, shiftKey: e.shiftKey };
  if (gv.step === "pick") {
    const under = pickFaceHit(e);
    if (!under) { hideFaceHint(); showTip(e.clientX, e.clientY, ["Click the face of a board"]); return; }
    const big = under.faceId === "A" || under.faceId === "B";
    const info = faceInfo(under.cabId, under.boardId, under.faceId);
    if (info && big) showFaceHint(worldFace(info), { tone: "" }); else hideFaceHint();
    showTip(e.clientX, e.clientY, big
      ? [`${info ? info.board.name || under.boardId : under.boardId} · face ${under.faceId}`, "Click to groove this face"]
      : [`${under.boardId} · edge ${under.faceId}`, "Grooves go on the big faces (A / B)"], big ? "" : "warn");
    return;
  }
  const info = faceInfo();
  if (!info) return;
  const r = resolve(info, e);
  if (!r) { hideTip(); return; }
  const at = toWorld(info, r.uv[0], r.uv[1]);
  if (r.snap) showSnapMarker(at.x, at.y, at.z, { feature: true }); else hideSnapMarker();
  const lines = [];
  if (r.label) lines.push(r.label);
  lines.push(`u ${r.uv[0]} · v ${r.uv[1]}`);
  if (gv.a) {
    const rect = grooveRect(info, gv.a, r.uv);
    const tooDeep = last.depth > info.t - MIN_FLOOR_MM;
    showRect(info, rect, tooDeep);
    lines.push(`${Math.round((rect.u1 - rect.u0) * 10) / 10} × ${Math.round((rect.v1 - rect.v0) * 10) / 10} · ${last.depth} deep`);
    if (tooDeep) lines.push(`Too deep for ${info.t} stock`);
  } else hideSketchPick();
  showTip(e.clientX, e.clientY, lines, gv.a && last.depth > info.t - MIN_FLOOR_MM ? "warn" : "");
}

export function groovePointerDown(e) {
  if (!gv || e.button !== 0) return;
  if (gv.step === "pick") {
    const under = pickFaceHit(e);
    if (!under) return;
    if (under.faceId !== "A" && under.faceId !== "B") { log("groove.blocked", { board: under.boardId, face: under.faceId, reason: "edge face" }); return; }
    gv.step = "draw";
    gv.cabId = under.cabId;
    gv.boardId = under.boardId;
    gv.faceId = under.faceId;
    job.select(under.cabId, { boardId: under.boardId, faceId: under.faceId });
    const info = faceInfo();
    if (info) beginFaceView(worldFace(info));
    hideFaceHint();
    log("groove.face", { id: under.cabId, board: under.boardId, face: under.faceId, size: info ? { w: info.w, h: info.h, t: info.t } : null });
    paintCard();
    ctx.emitMode();
    return;
  }
  const info = faceInfo();
  if (!info) return;
  const r = resolve(info, e);
  if (!r) return;
  if (!gv.a) {
    gv.a = r.uv;
    log("groove.point", { board: gv.boardId, face: gv.faceId, uv: r.uv, snap: r.label || (r.snap ? "snap" : "mm") });
    paintCard();
    return;
  }
  commit(info, grooveRect(info, gv.a, r.uv), "click");
}

function commit(info, rect, how) {
  if (rect.u1 - rect.u0 < 0.5 || rect.v1 - rect.v0 < 0.5) { log("groove.blocked", { board: gv.boardId, reason: "no size", rect }); return; }
  if (last.depth > info.t - MIN_FLOOR_MM) { log("groove.blocked", { board: gv.boardId, reason: "too deep", depth: last.depth, thickness: info.t }); return; }
  const list = job.boardGrooves(info.cab, gv.boardId);
  const used = new Set(list.map((g) => g.id));
  let n = 1;
  while (used.has(`G${n}`)) n += 1;
  if (last.kind === "tgroove" && !gv.group) {
    const groups = new Set(list.map((g) => g.group).filter(Boolean));
    let k = 1;
    while (groups.has(`T${k}`)) k += 1;
    gv.group = `T${k}`;
  }
  const groove = { id: `G${n}`, face: gv.faceId, kind: last.kind, ...rect, depth: last.depth, ...(last.kind === "tgroove" ? { group: gv.group } : {}) };
  job.setBoardGrooves(info.cab.id, gv.boardId, [...list, groove]);
  log("groove.add", { id: info.cab.id, board: gv.boardId, how, groove, shape: last.shape, width: last.shape === "line" ? last.width : undefined });
  gv.a = null;
  hideSketchPick();
  paintCard();
  redraw();
}

function redraw() {
  if (gv && gv.client) groovePointerMove(gv.client);
}

export function grooveKeydown(e) {
  if (!gv) return;
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === "Escape") {
    e.preventDefault();
    if (gv.a) { gv.a = null; hideSketchPick(); log("groove.cancel", { step: "point" }); paintCard(); return; }
    if (gv.step === "draw") { backToPick("esc"); return; }
    endGroove("esc");
    return;
  }
  if ((e.key === "g" || e.key === "G") && !e.ctrlKey && !e.metaKey && !e.altKey) { e.preventDefault(); endGroove("key"); return; }
  if (e.key === "t" || e.key === "T") { setOption("kind", last.kind === "tgroove" ? "groove" : "tgroove"); return; }
  if (e.key === "l" || e.key === "L") { setOption("shape", "line"); return; }
  if (e.key === "r" || e.key === "R") { setOption("shape", "rect"); return; }
}

/** Remove one user groove (the panel's ×). */
export function removeGroove(cabId, boardId, grooveId) {
  const cab = job.getJob().cabinets.find((c) => c.id === cabId);
  if (!cab) return;
  const list = job.boardGrooves(cab, boardId);
  const gone = list.find((g) => g.id === grooveId);
  if (!gone) return;
  job.setBoardGrooves(cabId, boardId, list.filter((g) => g.id !== grooveId));
  log("groove.remove", { id: cabId, board: boardId, groove: gone });
}
