// Floor plan: a 2D sheet that slides over the 3D view (the "minimap"). It is
// where partition walls are drawn; it reads and writes the same job, so the
// 3D scene underneath is already updated when the sheet is closed.
//
// One way to draw a wall, from features (see features2d.js):
//   1. click the first point on a feature edge (a corner, a junction, 10 mm
//      along the edge, or a point aligned with another feature). A junction —
//      a partition standing on the line — is ONE point on that partition's
//      centre line; the pull direction at step 2 decides which side of it the
//      wall goes.
//   2. click the second point on the same line (Tab / digits type L; Enter =
//      the far end of the line, i.e. the whole span)
//   3. pull the wall off the edge into the room; Tab / digits type Offset —
//      the clear distance to the wall's near face, the thickness grows away —
//      click or Enter drops it
// Centre lines are references only: the board is trimmed onto the FACE of any
// partition an end was drawn into (walls.js trimToFaces) — no physical
// overlap, ever. Right-click cancels the current wall (again: leaves the
// tool). A wall is red and cannot be dropped when it overlaps a solid, leaves
// the space or rests on nothing at either end. Thickness = Partition stock;
// height = floor + clearance … roof − clearance (walls.js).
import * as job from "./job.js";
import { snap } from "./job.js";
import { envelopeFootprint } from "./cabinets3d.js";
import { thickness } from "./materials.js";
import { wallSolid, wallStatus, wallBoxes, trimToFaces, openingIssues, openingWarnings, openingParts, pelmetCover, WALL_MIN_LENGTH, OPENING_MIN_WIDTH, OPENING_DEFAULT_CLEARANCE, OPENING_TYPES, SLIDING_DEFAULT_OVERLAP, SLIDING_DEFAULT_DOOR_HEIGHT } from "./walls.js";
import { solidBoxes } from "./walls3d.js";
import { buildFeatures, nearestEdge, projectOnEdge, pointOnEdge, featureUsOnEdge, distToEdge } from "./features2d.js";
import { disarm, cancelMove, cancelOrient, evalDim, sideOfRotZ } from "./interact.js";
import { log } from "./log.js";

const overlay = document.getElementById("floorplan");
const canvas = document.getElementById("fpCanvas");
const ctx = canvas.getContext("2d");
const btn = document.getElementById("floorplanBtn");
const hintEl = overlay.querySelector(".fp-hint");
const tipEl = overlay.querySelector(".fp-tip");
const dimEl = overlay.querySelector(".fp-dim");
const dimName = dimEl.querySelector("span");
const dimInput = dimEl.querySelector("input");
const wallBtn = overlay.querySelector('[data-fp-tool="wall"]');
const doorBtn = overlay.querySelector('[data-fp-tool="door"]');
const slideBtn = overlay.querySelector('[data-fp-tool="slide"]');
const cardEl = overlay.querySelector(".fp-card");
const cardTitle = cardEl.querySelector(".fp-card-title");
const cardBottom = cardEl.querySelector('[data-op="bottom"]');
const cardTop = cardEl.querySelector('[data-op="top"]');
const cardOverlap = cardEl.querySelector('[data-op="overlap"]');
const cardHeight = cardEl.querySelector('[data-op="height"]');
const stCursor = document.getElementById("stCursor");

const PAD = 40;
const PICK_PX = 12;
const CLICK_PX = 4; // a right button released within this distance is a click (cancel), not a pan
const GRID_MINOR = 100;
const GRID_MAJOR = 1000;
const WALL_NAME = { x: ["left wall", "right wall"], y: ["front wall", "back wall"] };

let isOpen = false;
let view = { k: 0.2, ox: 0, oy: 0 }; // screen = (ox + x·k, oy − y·k)
let size = { w: 0, h: 0 };
let features = null;
// Wall tool:  { kind: "wall", step: "pt1" | "pt2" | "offset", edge, u1, u2, locked }
// Door tool:  { kind: "door", type: "showerDoor" | "slidingDoor", step, wall, solid, from, endU, uStart, uEnd, side, locked }
//   showerDoor steps: "end" | "start" | "width" | "clear"
//   slidingDoor steps: "end" | "start" | "width" | "side" | "clear"  (side = which face the leaf hangs on)
let tool = null;
let cur = null; // hover / preview state for the current cursor
let pan = null;
let mouse = null; // last plan point under the cursor
let fitted = false;
let selectedOpening = null; // opening id highlighted in the plan (its wall is the job selection)
let lastClearance = { bottom: OPENING_DEFAULT_CLEARANCE, top: OPENING_DEFAULT_CLEARANCE }; // the card remembers the last input
let lastSliding = { top: OPENING_DEFAULT_CLEARANCE, overlap: SLIDING_DEFAULT_OVERLAP, doorHeight: SLIDING_DEFAULT_DOOR_HEIGHT };

// --- open / close ----------------------------------------------------------------------

export function openFloorPlan(from = "button") {
  if (isOpen) return;
  if (!job.hasSpace()) { log("floorplan.blocked", { reason: "no space" }); return; }
  disarm();
  cancelMove();
  cancelOrient();
  isOpen = true;
  overlay.classList.remove("hidden");
  btn.classList.add("active");
  features = null;
  resize();
  if (!fitted) fit();
  log("floorplan.open", { from, walls: job.getWalls().length, cabinets: job.getJob().cabinets.length });
  // The sheet exists to draw walls: the tool is ready as soon as it opens.
  setTool("wall", { silent: true });
  render();
}

export function closeFloorPlan(how = "button") {
  if (!isOpen) return;
  if (tool) cancelTool("close");
  isOpen = false;
  overlay.classList.add("hidden");
  btn.classList.remove("active");
  hideTip();
  hideDim();
  log("floorplan.close", { how, walls: job.getWalls().length });
}

export function floorPlanOpen() {
  return isOpen;
}

export function toggleFloorPlan(from) {
  if (isOpen) closeFloorPlan(from); else openFloorPlan(from);
}

btn.addEventListener("click", () => toggleFloorPlan("button"));
overlay.querySelector('[data-fp="close"]').addEventListener("click", () => closeFloorPlan("button"));
overlay.querySelector('[data-fp="fit"]').addEventListener("click", () => { fit(); render(); });
wallBtn.addEventListener("click", () => setTool(tool && tool.kind === "wall" ? null : "wall"));
doorBtn.addEventListener("click", () => setTool(isDoor("showerDoor") ? null : "door"));
slideBtn.addEventListener("click", () => setTool(isDoor("slidingDoor") ? null : "slide"));

// --- view -----------------------------------------------------------------------------

function resize() {
  const r = overlay.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (r.width < 1 || r.height < 1) return;
  const changed = size.w !== r.width || size.h !== r.height;
  size = { w: r.width, h: r.height };
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
  canvas.style.width = `${r.width}px`;
  canvas.style.height = `${r.height}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (changed && fitted) fit();
}
new ResizeObserver(() => { if (isOpen) { resize(); render(); } }).observe(overlay);

function fit() {
  const sp = job.getSpace();
  if (!sp || !size.w) return;
  const b = sp.bounds;
  const W = Math.max(b.maxX - b.minX, 1);
  const D = Math.max(b.maxY - b.minY, 1);
  const k = Math.min((size.w - 2 * PAD) / W, (size.h - 2 * PAD - 40) / D);
  view = {
    k,
    ox: size.w / 2 - ((b.minX + b.maxX) / 2) * k,
    oy: size.h / 2 + 12 + ((b.minY + b.maxY) / 2) * k,
  };
  fitted = true;
}
const S = (x, y) => ({ sx: view.ox + x * view.k, sy: view.oy - y * view.k });
const Wd = (sx, sy) => ({ x: (sx - view.ox) / view.k, y: (view.oy - sy) / view.k });
const tolMm = () => PICK_PX / view.k;

// --- data ------------------------------------------------------------------------------

function cabBoxes() {
  return job.getJob().cabinets.map((c) => {
    const fp = envelopeFootprint(c, c.pose);
    return { id: c.id, x: [fp.minX, fp.maxX], y: [fp.minY, fp.maxY], z: [fp.z0, fp.z1], pose: c.pose, moduleId: c.moduleId };
  });
}
function feats() {
  if (!features) features = buildFeatures({ resolved: job.getSpace(), walls: job.getWalls(), cabinets: cabBoxes(), stock: job.getStock() });
  return features;
}
job.onChange(() => {
  features = null;
  if (!isOpen) return;
  if (cur && mouse) cur = resolve(mouse);
  render();
});

function statusFor(wall) {
  return wallStatus(wall, {
    resolved: job.getSpace(),
    stock: job.getStock(),
    boxes: solidBoxes(),
    anchorBoxes: wallBoxes(job.getWalls(), job.getSpace(), job.getStock()),
  });
}

/** Room from a face to the opposite boundary along its dir, and that boundary's name. */
function roomFrom(face) {
  const b = job.getSpace().bounds;
  const bound = face.axis === "x" ? (face.dir > 0 ? b.maxX : b.minX) : (face.dir > 0 ? b.maxY : b.minY);
  return { room: (bound - face.at) * face.dir, name: WALL_NAME[face.axis][face.dir > 0 ? 1 : 0] };
}

/** Short name of what a feature edge id belongs to ("space", "wall-1", "cab-2"). */
function ownerOf(edgeId) {
  return String(edgeId).split(":")[0];
}

/** A partition as a body: its centre line coordinate and thickness across `axis`. */
function wallBody(sourceId) {
  const s = feats().solids.find((x) => x.id === sourceId && x.kind === "wall");
  if (!s) return null;
  const axis = s.solid.axis;
  return { id: s.id, axis, along: s.solid.along, centre: (s[axis][0] + s[axis][1]) / 2, t: s[axis][1] - s[axis][0], box: s };
}
/**
 * What the user picked, as a body: a partition's two faces are one wall line
 * (per segment, when another wall splits the face); other edges are themselves.
 */
function lineKey(e) {
  if (e.kind !== "wall") return e.id;
  const seg = e.id.includes("#") ? e.id.slice(e.id.indexOf("#")) : "";
  return `${e.source}|${e.axis}${seg}`;
}
/** Distance from a plan point to the wall line the edge stands for (centre line for a partition). */
function distToLine(p, e) {
  if (e.kind !== "wall") return distToEdge(p, e);
  const w = wallBody(e.source);
  const u = p[e.along];
  const du = u < e.u0 ? e.u0 - u : u > e.u1 ? u - e.u1 : 0;
  return Math.hypot(du, p[e.axis] - (w ? w.centre : e.at));
}
/** Display name of the edge as the user sees it: the wall itself, not one of its faces. */
function edgeName(e) {
  return e.kind === "wall" ? e.source : e.label;
}
/**
 * A partition's END face (one thickness long) is never a line to draw from —
 * at a junction with the space wall it lies on that wall and would steal the
 * pick, and nothing longer than 18 mm can come off it.
 */
function isEndFace(e) {
  if (e.kind !== "wall") return false;
  const s = feats().solids.find((x) => x.id === e.source && x.kind === "wall");
  return !!s && s.solid.along === e.axis;
}
/**
 * The face of the picked line the wall is offset from: for a partition, the
 * face on the cursor's side of its centre line (pull toward the nose → the
 * nose face, toward the back → the back face). Other edges are their own face.
 */
function sourceFace(e, p) {
  if (e.kind !== "wall") return e;
  const w = wallBody(e.source);
  if (!w) return e;
  const dir = p[e.axis] >= w.centre ? 1 : -1;
  return { ...e, id: `${e.source}:${e.axis}${dir > 0 ? "+" : "-"}`, at: w.centre + (dir * w.t) / 2, dir, label: e.source };
}

// --- tool ------------------------------------------------------------------------------

const HINTS = {
  idle: "Click a wall or a door to select it · Delete removes it · Wall (W) / Shower door (D) / Sliding door (S) draw · wheel zooms · middle / right-drag pans · Esc closes",
  "wall.pt1": "Wall — click the first point on a wall of the space, a partition or a cabinet side (a corner, a junction, 10 mm along it, or in line with another wall) · right-click leaves the tool",
  "wall.pt2": "Wall — click the second point on the same line · Tab / digits type L · Enter takes the far end · right-click restarts",
  "wall.offset": "Pull the wall out to either side · Tab / digits type Offset (clear distance to its near face) · click or Enter drops it · right-click restarts",
  "showerDoor.end": "Shower door — click the end of a partition to measure from · right-click leaves the tool",
  "showerDoor.start": "Shower door — move along the wall to where the door starts · Tab / digits type the distance from the end · click · right-click restarts",
  "showerDoor.width": "Shower door — pull to the other side of the door · Tab / digits type W · click or Enter · right-click restarts",
  "showerDoor.clear": "Shower door — bottom / top clearance (mm) · Enter creates · Esc / right-click cancels",
  "slidingDoor.end": "Sliding door — click the end of a partition to measure from · right-click leaves the tool",
  "slidingDoor.start": "Sliding door — move along the wall to where the opening starts · Tab / digits type the distance from the end · click · right-click restarts",
  "slidingDoor.width": "Sliding door — pull to the other side of the opening · Tab / digits type W · click or Enter · right-click restarts",
  "slidingDoor.side": "Sliding door — move to the side of the wall the door hangs on: the leaf and the pelmet follow · click or Enter · right-click restarts",
  "slidingDoor.clear": "Sliding door — top clearance (= pelmet height), leaf overlap and leaf height (mm) · Enter creates · Esc / right-click cancels",
};
const FIRST = { wall: "pt1", door: "end" };
const DRAW_LOG = { wall: "wall.draw", door: "opening.draw" };
/** Tool button → door type (the two door buttons drive one tool kind, "door"). */
const DOOR_TYPE = { door: "showerDoor", slide: "slidingDoor" };

function isDoor(type = null) {
  return !!tool && tool.kind === "door" && (type == null || tool.type === type);
}
function newTool(kind, type = null) {
  return kind === "door" ? { kind, type, step: "end", locked: null } : { kind, step: FIRST[kind], locked: null };
}
function syncToolButtons() {
  wallBtn.classList.toggle("active", !!tool && tool.kind === "wall");
  doorBtn.classList.toggle("active", isDoor("showerDoor"));
  slideBtn.classList.toggle("active", isDoor("slidingDoor"));
}

function setTool(kind, { silent = false } = {}) {
  if (tool && !silent) log(`${DRAW_LOG[tool.kind]}.cancel`, { step: tool.step, type: tool.type, reason: "tool off" });
  const type = DOOR_TYPE[kind] || null;
  if (type && !job.getWalls().length) { log("opening.draw.blocked", { reason: "no walls", type }); kind = null; }
  tool = kind ? newTool(type ? "door" : kind, type) : null;
  syncToolButtons();
  if (!silent) log("floorplan.tool", { tool: tool ? tool.kind : null, type: tool ? tool.type : undefined });
  hideDim();
  hideCard();
  cur = mouse ? resolve(mouse) : null;
  updateHint();
  render();
}

/** Drop what is in progress and start the same tool over at its first step. */
function restartTool(reason) {
  log(`${DRAW_LOG[tool.kind]}.cancel`, { step: tool.step, type: tool.type, reason });
  tool = newTool(tool.kind, tool.type);
  hideDim();
  hideCard();
  cur = mouse ? resolve(mouse) : null;
  updateHint();
  render();
}
function cancelTool(reason) {
  if (!tool) return;
  log(`${DRAW_LOG[tool.kind]}.cancel`, { step: tool.step, type: tool.type, reason });
  tool = null;
  syncToolButtons();
  hideDim();
  hideCard();
  cur = mouse ? resolve(mouse) : null;
  updateHint();
  render();
}
/** Right-click / Esc: back one level — restart the tool, or leave it when nothing is in progress. */
function cancelStep(reason) {
  if (!tool) return false;
  if (tool.step === FIRST[tool.kind]) cancelTool(reason); else restartTool(reason);
  return true;
}

function updateHint() {
  hintEl.textContent = HINTS[tool ? `${tool.kind === "door" ? tool.type : tool.kind}.${tool.step}` : "idle"] || "";
}
const END_NAME = { x: ["left", "right"], y: ["front", "back"] };
function endLabel(solid, from) {
  return `${END_NAME[solid.along][from === "lo" ? 0 : 1]} end`;
}

/**
 * Snapped position along `edge` for a plan point:
 *   a feature point on the edge within reach → that point
 *   in line with the centre line of another partition (or a cabinet side) that crosses the edge → it (dashed guide)
 *   else the 10 mm grid.
 * Alignment is body to body: a wall end that lines up with another partition
 * is picked on its centre line — a reference only; the board is trimmed back
 * onto that partition's face at the offset step (walls.js trimToFaces), so
 * nothing ever overlaps. `from` + `locked`: a typed length from the first
 * point, toward the cursor's side.
 */
function snapOnEdge(edge, p, { from = null, locked = null } = {}) {
  const tol = tolMm();
  let u = projectOnEdge(p, edge);
  if (locked != null && from != null) {
    const dir = u >= from ? 1 : -1;
    u = Math.min(edge.u1, Math.max(edge.u0, from + dir * locked));
    return { u, kind: "locked", label: `L ${Math.round(Math.abs(u - from))}` };
  }
  // Alignment candidates: a partition crossing the edge's direction → its centre line; a cabinet → its two sides.
  const aligns = [];
  for (const s of feats().solids) {
    if (s.id === edge.source) continue;
    const cands = s.kind === "wall"
      ? (s.solid.axis === edge.along ? [{ at: (s[edge.along][0] + s[edge.along][1]) / 2, label: `in line with ${s.id}`, reach: (s[edge.along][1] - s[edge.along][0]) / 2 }] : [])
      : [{ at: s[edge.along][0], label: `flush with ${s.id} side`, reach: 0 }, { at: s[edge.along][1], label: `flush with ${s.id} side`, reach: 0 }];
    for (const c of cands) {
      // A partition standing against this edge cuts it at its face; its centre line lies half a thickness
      // beyond the cut. The point may reach it there (the junction is picked at the middle of that
      // partition); the board itself is trimmed back to the face.
      if (c.at < edge.u0 - c.reach - 0.5 || c.at > edge.u1 + c.reach + 0.5) continue;
      const d = Math.abs(c.at - u);
      if (d <= tol) aligns.push({ u: c.at, d, label: c.label, id: s.id, kind: s.kind });
    }
  }
  // Feature points win — except a partition's own face corners, which yield to its centre line
  // (the wall is a body: you line up with the middle of it, not with one of its faces).
  const centred = new Set(aligns.filter((a) => a.kind === "wall").map((a) => a.id));
  let best = null;
  for (const fp of feats().points) {
    const v = edge.along === "x" ? fp.y : fp.x;
    if (Math.abs(v - edge.at) > 0.5) continue;
    const fu = edge.along === "x" ? fp.x : fp.y;
    if (fu < edge.u0 - 0.5 || fu > edge.u1 + 0.5) continue;
    const owners = [...new Set(fp.sources.map(ownerOf))];
    const own = owners.filter((o) => o !== "space");
    if (own.length === 1 && centred.has(own[0])) continue;
    const d = Math.abs(fu - u);
    if (d <= tol && (!best || d < best.d)) best = { u: fu, d };
  }
  if (best) return { u: best.u, kind: "feature", label: "feature point" };
  for (const a of aligns) if (!best || a.d < best.d) best = a;
  if (best) {
    return { u: best.u, kind: "align", label: best.label, guide: { axis: edge.along, at: best.u, id: best.id }, alignTo: best.id };
  }
  // Grid: from the first point the *length* is rounded (a corner may sit off the grid), else the coordinate.
  const g = from != null ? from + Math.sign(u - from || 1) * snap(Math.abs(u - from)) : snap(u);
  return { u: Math.min(edge.u1, Math.max(edge.u0, g)), kind: "grid", label: "10 mm grid" };
}

/**
 * Offset from `face` for the cursor: clear distance from the face to the near
 * face of the new wall, room side only, 10 mm steps, never past the opposite
 * boundary (the far face stops there). Alignment is body to body: the new
 * wall's centre line lines up with the centre line of another partition (same
 * stock, so the faces coincide too); the guide is that centre line.
 */
function offsetFor(face, p, locked) {
  const t = thickness(job.getStock(), "partition");
  const { room, name } = roomFrom(face);
  const maxD = Math.max(0, room - t);
  const tol = tolMm();
  const d0 = (p[face.axis] - face.at) * face.dir;
  let d = Math.max(0, snap(d0));
  let label = null;
  let guide = null;
  let alignTo = null;
  let bestDelta = tol;
  for (const s of feats().solids) {
    if (s.kind !== "wall" || s.solid.axis !== face.axis || s.id === face.source) continue;
    const centre = (s[face.axis][0] + s[face.axis][1]) / 2;
    const de = (centre - face.at) * face.dir - t / 2; // offset that puts the new centre on this centre
    if (de <= 0.5) continue;
    const delta = Math.abs(d0 - de);
    if (delta < bestDelta) { bestDelta = delta; d = de; label = `in line with ${s.id}`; guide = { axis: face.axis, at: centre, id: s.id }; alignTo = s.id; }
  }
  let clamped = null;
  if (locked != null) { d = locked; label = null; guide = null; alignTo = null; }
  if (d > maxD) { d = maxD; clamped = name; }
  return { d, label, guide, alignTo, clamped, max: maxD };
}

function previewFrom(face, d, u0, u1) {
  return { axis: face.axis, at: face.at + face.dir * d, side: face.dir, u0: Math.min(u0, u1), u1: Math.max(u0, u1) };
}

// --- doors (shower door / sliding door) --------------------------------------------------------
//
// Click the end of a partition (the door is measured from it) → move along the
// wall to the door's first edge (Tab / digits: distance from the end) → pull
// to the other edge (Tab / digits: W) → [sliding door only: move to the side of
// the wall the leaf hangs on — leaf and pelmet preview follow the cursor —
// click] → a card asks the numbers (shower: bottom / top clearance; sliding:
// top clearance, leaf overlap, leaf height; the last input is remembered) →
// the hole is cut (and, for a sliding door, the leaf and pelmet appear —
// derived by walls.js, never stored). Left-click confirms, right-click cancels.

/** The partition's centre line as a synthetic edge, so the wall snapping helpers work along it. */
function centreEdge(solid) {
  const centre = solid.axis === "x" ? (solid.x0 + solid.x1) / 2 : (solid.y0 + solid.y1) / 2;
  return { id: `${solid.id}:centre`, parent: `${solid.id}:centre`, kind: "wall", source: solid.id, axis: solid.axis, at: centre, dir: 1, along: solid.along, u0: solid.u0, u1: solid.u1, label: solid.id };
}
/** Nearest partition to a plan point within `tol`, as its plan solid. */
function nearestWallSolid(p, tol) {
  let best = null;
  let bestD = tol;
  for (const s of feats().solids) {
    if (s.kind !== "wall") continue;
    const dx = p.x < s.x[0] ? s.x[0] - p.x : p.x > s.x[1] ? p.x - s.x[1] : 0;
    const dy = p.y < s.y[0] ? s.y[0] - p.y : p.y > s.y[1] ? p.y - s.y[1] : 0;
    const d = Math.hypot(dx, dy);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}
/** Position along a partition for a door edge: existing jambs, then the usual snapping along its centre line. */
function snapAlongWall(solid, p, from, locked, { awayFrom = null } = {}) {
  const e = centreEdge(solid);
  const tol = tolMm();
  const s = snapOnEdge(e, p, { from, locked });
  if (locked == null) {
    for (const o of solid.openings) {
      for (const j of [o.u0, o.u1]) {
        if (Math.abs(j - projectOnEdge(p, e)) <= tol && Math.abs(j - s.u) > 0.01 && Math.abs(j - projectOnEdge(p, e)) < Math.abs(s.u - projectOnEdge(p, e))) { s.u = j; s.kind = "jamb"; s.label = `${o.id} jamb`; s.guide = null; }
      }
    }
  }
  // The second edge only grows away from the first one (toward the far end).
  if (awayFrom != null) {
    const dir = Math.sign(awayFrom.dir);
    if ((s.u - awayFrom.u) * dir < OPENING_MIN_WIDTH) s.u = awayFrom.u + dir * (locked != null ? locked : OPENING_MIN_WIDTH);
  }
  s.u = Math.min(solid.u1, Math.max(solid.u0, s.u));
  return s;
}
function doorPreview(solid, ua, ub) {
  const u0 = Math.min(ua, ub);
  const u1 = Math.max(ua, ub);
  return solid.along === "x" ? { x0: u0, x1: u1, y0: solid.y0, y1: solid.y1 } : { x0: solid.x0, x1: solid.x1, y0: u0, y1: u1 };
}
/** Other partitions as boxes (what a pelmet stops at; what a door must not run into). */
function otherWallBoxes(wallId) {
  return wallBoxes(job.getWalls().filter((w) => w.id !== wallId), job.getSpace(), job.getStock());
}
/**
 * The wall with a would-be opening added: { wall, solid, o (the resolved
 * opening), parts (leaf / pelmet for a sliding door), issues }.
 */
function probeDoor(wall, opening) {
  const sp = job.getSpace();
  const stock = job.getStock();
  const probe = { ...wall, openings: [...(wall.openings || []), { ...opening, id: "new door" }] };
  const solid = wallSolid(probe, sp, stock);
  const o = solid.openings.find((x) => x.id === "new door");
  const others = otherWallBoxes(wall.id);
  const parts = openingParts(solid, o, sp, stock, others);
  const boxes = solidBoxes({ excludeWall: wall.id });
  const strip = (m) => m.replace(/^new door: /, "");
  const issues = openingIssues(probe, solid, others, { parts, boxes }).filter((m) => m.startsWith("new door")).map(strip);
  const warnings = openingWarnings(solid, parts).filter((m) => m.startsWith("new door")).map(strip);
  return { wall: probe, solid, o, parts, issues, warnings };
}
/** Issues a new opening would have on this wall (overlap, T-junction inside, too narrow, leaf / pelmet clashes). */
function doorIssues(wall, opening) {
  return probeDoor(wall, opening).issues;
}
/** The record the tool has so far (`side` for a sliding door may be passed in while the cursor is still choosing). */
function doorRecord({ width = null, side = null } = {}) {
  const offset = Math.abs(tool.uStart - tool.endU);
  const w = width != null ? width : Math.abs(tool.uEnd - tool.uStart);
  if (tool.type === "slidingDoor") {
    return { type: "slidingDoor", from: tool.from, offset, width: w, bottom: 0, top: lastSliding.top, side: side != null ? side : (tool.side || 1), overlap: lastSliding.overlap, doorHeight: lastSliding.doorHeight };
  }
  return { type: "showerDoor", from: tool.from, offset, width: w, bottom: lastClearance.bottom, top: lastClearance.top };
}
/** Which face of the wall a plan point is on: ±1 along the wall's axis. */
function sideOfPoint(solid, p) {
  const centre = solid.axis === "x" ? (solid.x0 + solid.x1) / 2 : (solid.y0 + solid.y1) / 2;
  return p[solid.axis] >= centre ? 1 : -1;
}
const SIDE_NAME = { x: ["left", "right"], y: ["front", "back"] };
function sideLabel(solid, side) {
  return `${SIDE_NAME[solid.axis][side > 0 ? 1 : 0]} side`;
}
function partOf(parts, part) {
  return (parts || []).find((p) => p.part === part) || null;
}

function resolveDoor(p) {
  const out = { p, tip: [], tone: "" };
  const tol = tolMm();
  const sliding = tool.type === "slidingDoor";
  const label = OPENING_TYPES[tool.type];
  if (tool.step === "end") {
    const s = nearestWallSolid(p, tol * 2);
    if (!s) { out.tip.push("Move onto a partition"); return out; }
    const u = p[s.solid.along];
    const from = u <= (s.solid.u0 + s.solid.u1) / 2 ? "lo" : "hi";
    out.wall = s;
    out.from = from;
    out.endU = from === "lo" ? s.solid.u0 : s.solid.u1;
    const centre = s.solid.axis === "x" ? (s.x[0] + s.x[1]) / 2 : (s.y[0] + s.y[1]) / 2;
    out.pt = s.solid.along === "x" ? { x: out.endU, y: centre } : { x: centre, y: out.endU };
    out.tip.push(`${s.id} · ${label} · measure from the ${endLabel(s.solid, from)}`);
    return out;
  }
  const solid = tool.solid;
  if (tool.step === "start") {
    const s = snapAlongWall(solid, p, tool.endU, tool.locked);
    out.u = s.u;
    out.snap = s;
    out.dist = Math.abs(s.u - tool.endU);
    out.pt = pointOnEdge(centreEdge(solid), s.u);
    out.tip.push(`${solid.id} · ${s.label}`, `${Math.round(out.dist)} from the ${endLabel(solid, tool.from)}`);
    return out;
  }
  if (tool.step === "width") {
    const dir = tool.from === "lo" ? 1 : -1;
    const s = snapAlongWall(solid, p, tool.uStart, tool.locked, { awayFrom: { u: tool.uStart, dir } });
    out.u = s.u;
    out.snap = s;
    out.width = Math.abs(s.u - tool.uStart);
    out.pt = pointOnEdge(centreEdge(solid), s.u);
    out.rect = doorPreview(solid, tool.uStart, s.u);
    // For a sliding door the side is not chosen yet: only the hole is checked here (the side step checks the boards).
    const probe = probeDoor(tool.wall, doorRecord({ width: out.width, side: sideOfPoint(solid, p) }));
    const issues = sliding ? probe.issues.filter((m) => !/^(leaf|pelmet|door leaf|no room to slide)/.test(m)) : probe.issues;
    out.issues = issues;
    out.tip.push(`${solid.id} · ${s.label}`, `W ${Math.round(out.width)}`);
    if (issues.length) { out.tip.push(...issues); out.tone = "bad"; }
    return out;
  }
  // side (sliding: the cursor picks the face) / clear (the card is up): keep the hole preview, and the boards for a sliding door.
  out.rect = doorPreview(solid, tool.uStart, tool.uEnd);
  const W = Math.abs(tool.uEnd - tool.uStart);
  if (sliding) {
    const side = tool.step === "side" ? sideOfPoint(solid, p) : tool.side;
    const probe = probeDoor(tool.wall, doorRecord({ side }));
    out.side = side;
    out.parts = probe.parts;
    out.issues = probe.issues;
    const leaf = partOf(probe.parts, "leaf");
    const pelmet = partOf(probe.parts, "pelmet");
    out.tip.push(`${solid.id} · opening ${Math.round(W)} wide · door on the ${sideLabel(solid, side)}`);
    if (leaf && pelmet) {
      out.tip.push(`leaf ${Math.round(leaf.length)} × ${Math.round(lastSliding.doorHeight)} · pelmet ${Math.round(pelmet.length)} × ${Math.round(lastSliding.top)} (${pelmet.stoppedBy.lo} → ${pelmet.stoppedBy.hi})`);
      const cover = pelmetCover(leaf, pelmet);
      if (cover >= 0) out.tip.push(`pelmet covers the leaf top by ${Math.round(cover)}`);
    }
    if (tool.step === "clear") out.tip.push("top clearance / leaf overlap / leaf height in the card");
    if (probe.warnings.length) { out.tip.push(...probe.warnings); out.tone = "warn"; }
    if (probe.issues.length) { out.tip.push(...probe.issues); out.tone = "bad"; }
    return out;
  }
  out.tip.push(`${solid.id} · door ${Math.round(W)} wide`, "bottom / top clearance in the card");
  return out;
}

function clickDoor(p) {
  cur = resolveDoor(p);
  const type = tool.type;
  if (tool.step === "end") {
    if (!cur.wall) return;
    tool.wall = job.getWall(cur.wall.id);
    tool.solid = cur.wall.solid;
    tool.from = cur.from;
    tool.endU = cur.endU;
    tool.step = "start";
    tool.locked = null;
    log("opening.draw.end", { type, wallId: tool.wall.id, from: tool.from, endU: tool.endU });
    showDim("From end", cur.pt);
  } else if (tool.step === "start") {
    tool.uStart = cur.u;
    tool.step = "width";
    tool.locked = null;
    log("opening.draw.start", { type, wallId: tool.wall.id, u: tool.uStart, offset: Math.abs(tool.uStart - tool.endU), snap: cur.snap.kind, alignTo: cur.snap.alignTo });
    showDim("W", cur.pt);
  } else if (tool.step === "width") {
    if (!(cur.width >= OPENING_MIN_WIDTH)) { log("opening.draw.blocked", { type, step: "width", reason: `narrower than ${OPENING_MIN_WIDTH}` }); flashTip(); return; }
    if (cur.issues.length) { log("opening.draw.blocked", { type, step: "width", issues: cur.issues }); flashTip(); return; }
    tool.uEnd = cur.u;
    tool.locked = null;
    log("opening.draw.width", { type, wallId: tool.wall.id, u: tool.uEnd, width: Math.abs(tool.uEnd - tool.uStart), snap: cur.snap.kind, alignTo: cur.snap.alignTo });
    hideDim();
    if (type === "slidingDoor") {
      tool.step = "side"; // the cursor now picks the face the leaf hangs on
    } else {
      tool.step = "clear";
      showCard(cur.pt || pointOnEdge(centreEdge(tool.solid), (tool.uStart + tool.uEnd) / 2));
    }
  } else if (tool.step === "side") {
    if (cur.issues && cur.issues.length) { log("opening.draw.blocked", { type, wallId: tool.wall.id, step: "side", side: cur.side, label: sideLabel(tool.solid, cur.side), issues: cur.issues }); flashTip(); return; }
    tool.side = cur.side;
    tool.step = "clear";
    const pelmet = partOf(cur.parts, "pelmet");
    log("opening.draw.side", { type, wallId: tool.wall.id, side: tool.side, label: sideLabel(tool.solid, tool.side), pelmet: pelmet ? { length: pelmet.length, stoppedBy: pelmet.stoppedBy } : null });
    showCard(pointOnEdge(centreEdge(tool.solid), (tool.uStart + tool.uEnd) / 2));
  }
  // clear: clicks on the canvas do nothing; the card owns the step
  cur = resolveDoor(p);
  updateHint();
  render();
}

function commitDoor(how) {
  const rec = doorRecord();
  const probe = probeDoor(tool.wall, rec);
  if (probe.issues.length) { log("opening.draw.blocked", { type: tool.type, step: "clear", how, issues: probe.issues }); flashTip(); return; }
  const op = job.addOpening(tool.wall.id, rec, { how, endU: tool.endU });
  const leaf = partOf(probe.parts, "leaf");
  const pelmet = partOf(probe.parts, "pelmet");
  log("opening.draw.finish", {
    wallId: tool.wall.id, id: op ? op.id : null, ...rec, how,
    ...(rec.type === "slidingDoor" ? { sideLabel: sideLabel(tool.solid, rec.side), leaf: leaf ? { length: leaf.length, z0: leaf.z0, z1: leaf.z1 } : null, pelmet: pelmet ? { length: pelmet.length, height: pelmet.height, underside: pelmet.underside, stoppedBy: pelmet.stoppedBy } : null, cover: leaf && pelmet ? pelmetCover(leaf, pelmet) : null, warnings: probe.warnings } : {}),
  });
  selectedOpening = op ? op.id : null;
  tool = newTool("door", tool.type);
  hideDim();
  hideCard();
  cur = mouse ? resolve(mouse) : null;
  updateHint();
  render();
}

// --- door card (shower: bottom / top clearance · sliding: top clearance, leaf overlap, leaf height) ---

function cardInputs() {
  return tool && tool.type === "slidingDoor" ? [cardTop, cardOverlap, cardHeight] : [cardBottom, cardTop];
}
function showCard(at) {
  const sliding = tool.type === "slidingDoor";
  cardEl.classList.toggle("sliding", sliding);
  cardTitle.textContent = sliding ? "Sliding door · top clearance & leaf" : "Shower door · clearance";
  if (sliding) {
    cardTop.value = String(lastSliding.top);
    cardOverlap.value = String(lastSliding.overlap);
    cardHeight.value = String(lastSliding.doorHeight);
  } else {
    cardBottom.value = String(lastClearance.bottom);
    cardTop.value = String(lastClearance.top);
  }
  cardEl.classList.remove("hidden");
  const s = S(at.x, at.y);
  cardEl.style.left = `${Math.min(size.w - 230, Math.max(10, s.sx + 20))}px`;
  cardEl.style.top = `${Math.min(size.h - 160, Math.max(44, s.sy - 40))}px`;
  const first = cardInputs()[0];
  first.focus();
  first.select();
  log("opening.draw.clearance", { type: tool.type, ...(sliding ? lastSliding : lastClearance), how: "card open" });
}
function hideCard() {
  cardEl.classList.add("hidden");
  if (cardEl.contains(document.activeElement)) document.activeElement.blur();
}
function readCard() {
  const num = (input, dflt, min = 0) => { const v = Number(input.value); return Number.isFinite(v) && v >= min ? v : dflt; };
  if (tool && tool.type === "slidingDoor") {
    lastSliding = {
      top: num(cardTop, OPENING_DEFAULT_CLEARANCE),
      overlap: num(cardOverlap, SLIDING_DEFAULT_OVERLAP),
      doorHeight: num(cardHeight, SLIDING_DEFAULT_DOOR_HEIGHT, 1),
    };
  } else {
    lastClearance = { bottom: num(cardBottom, OPENING_DEFAULT_CLEARANCE), top: num(cardTop, OPENING_DEFAULT_CLEARANCE) };
  }
}
cardEl.querySelector('[data-op="ok"]').addEventListener("click", () => { if (isDoor() && tool.step === "clear") { readCard(); commitDoor("ok"); } });
cardEl.querySelector('[data-op="cancel"]').addEventListener("click", () => { if (isDoor()) restartTool("card cancel"); });
for (const input of [cardBottom, cardTop, cardOverlap, cardHeight]) {
  input.addEventListener("input", () => { readCard(); if (mouse) { cur = resolve(mouse); render(); } });
  input.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (!isDoor() || tool.step !== "clear") return;
    if (e.key === "Enter") { e.preventDefault(); readCard(); commitDoor("enter"); }
    else if (e.key === "Escape") { e.preventDefault(); restartTool("esc"); }
    else if (e.key === "Tab") {
      e.preventDefault();
      const list = cardInputs();
      const i = list.indexOf(input);
      const next = list[(i + (e.shiftKey ? list.length - 1 : 1)) % list.length];
      next.focus();
      next.select();
    }
  });
}

/** Everything the cursor means right now, for drawing and for the next click. */
function resolve(p) {
  const F = feats();
  const tol = tolMm();
  const t = thickness(job.getStock(), "partition");
  // A partition's long face can always be offset from (one of its sides has room); its end faces are not lines
  // to draw from; any other face needs room toward the room.
  const drawable = (e) => (e.kind === "wall" ? !isEndFace(e) : roomFrom(e).room >= t + 1);
  const out = { p, tip: [], tone: "" };
  if (!tool) {
    const hit = hitSolid(p);
    if (hit) {
      const op = hit.kind === "wall" ? openingAt(hit, p) : null;
      out.tip.push(op ? `${op.id} · ${(OPENING_TYPES[op.type] || "door").toLowerCase()} in ${hit.id}` : hit.kind === "wall" ? `${hit.id} · partition` : `${hit.id} · cabinet`);
      out.hoverOpening = op;
    }
    out.hover = hit;
    return out;
  }
  if (tool.kind === "door") return resolveDoor(p);
  if (tool.step === "pt1") {
    const e = nearestEdge(p, F.edges, tol, drawable);
    if (e) {
      const s = snapOnEdge(e, p);
      out.edge = e;
      out.u = s.u;
      out.pt = pointOnEdge(e, s.u);
      out.snap = s;
      out.tip.push(`${edgeName(e)} · ${s.label}`, `${e.along.toUpperCase()} ${Math.round(s.u)}`);
    } else out.tip.push("Move onto a feature edge");
    return out;
  }
  if (tool.step === "pt2") {
    // A corner belongs to several lines: the one the cursor leaves along wins, until the second click settles it.
    if (tool.candidates && tool.candidates.length > 1) {
      let best = tool.edge;
      let bestD = Infinity;
      for (const c of tool.candidates) {
        const d = distToLine(p, c);
        if (d < bestD - 0.01) { bestD = d; best = c; }
      }
      if (best !== tool.edge) {
        tool.edge = best;
        tool.u1 = tool.p1[best.along];
      }
    }
    const e = tool.edge;
    const s = snapOnEdge(e, p, { from: tool.u1, locked: tool.locked });
    out.edge = e;
    out.u = s.u;
    out.pt = pointOnEdge(e, s.u);
    out.snap = s;
    const L = Math.abs(s.u - tool.u1);
    out.length = L;
    out.tip.push(`${edgeName(e)} · ${s.label}`, `L ${Math.round(L)}`);
    if (L < WALL_MIN_LENGTH) { out.tip.push(`at least ${WALL_MIN_LENGTH} mm · Enter takes the far end`); out.tone = "warn"; }
    return out;
  }
  // offset: from the side of the picked line the cursor is on
  const face = sourceFace(tool.edge, p);
  const o = offsetFor(face, p, tool.locked);
  out.face = face;
  out.offset = o;
  // The points were picked on centre lines; the board stops on faces (no overlap, ever).
  const drawn = previewFrom(face, o.d, tool.u1, tool.u2);
  const trim = trimToFaces(drawn, job.getSpace(), job.getStock(), wallBoxes(job.getWalls(), job.getSpace(), job.getStock()));
  out.wall = trim.wall;
  out.trimmed = trim.trimmed;
  out.status = statusFor(out.wall);
  out.tip.push(`Offset ${Math.round(o.d)} from ${face.label}`, `L ${Math.round(out.wall.u1 - out.wall.u0)}`);
  if (o.label) out.tip.push(o.label);
  for (const end of ["lo", "hi"]) if (trim.trimmed[end]) out.tip.push(`stops on ${trim.trimmed[end].id}'s face (−${Math.round(trim.trimmed[end].by)})`);
  if (o.clamped) { out.tip.push(`stopped at ${o.clamped}`); out.tone = "warn"; }
  if (!out.status.ok) { out.tip.push(...out.status.issues); out.tone = "bad"; }
  return out;
}

/** Wall or cabinet under a plan point (walls first). */
function hitSolid(p) {
  const tol = tolMm() / 2;
  for (const s of feats().solids) {
    if (p.x >= s.x[0] - tol && p.x <= s.x[1] + tol && p.y >= s.y[0] - tol && p.y <= s.y[1] + tol) return s;
  }
  return null;
}
/** The opening of wall solid `s` under a plan point, or null. */
function openingAt(s, p) {
  const u = p[s.solid.along];
  return s.solid.openings.find((o) => u >= o.u0 - 0.5 && u <= o.u1 + 0.5) || null;
}

// --- clicks / commits ----------------------------------------------------------------------

function click(p) {
  cur = resolve(p);
  if (!tool) {
    const hit = cur.hover;
    selectedOpening = cur.hoverOpening ? cur.hoverOpening.id : null;
    job.select(hit ? hit.id : null);
    log("floorplan.select", { id: hit ? hit.id : null, kind: hit ? hit.kind : null, opening: selectedOpening });
    render();
    return;
  }
  if (tool.kind === "door") { clickDoor(p); return; }
  if (tool.step === "pt1") {
    if (!cur.edge) return;
    tool.edge = cur.edge;
    tool.u1 = cur.u;
    tool.p1 = cur.pt;
    // Every drawable line at the point stays a candidate until the second point picks one (a partition's
    // two faces count as one line). "At" is within one partition thickness: a junction is ONE point, not
    // two — the partition standing there splits the line into two segments (…900 | 918…) and the point
    // sits on its centre line between them, 9 mm from each. Both segments, and the lines of the partition
    // itself, stay candidates, so the direction of the pull at the second point picks the line.
    const t = thickness(job.getStock(), "partition");
    const seen = new Set([lineKey(tool.edge)]);
    tool.candidates = [tool.edge];
    const u = (e) => cur.pt[e.along];
    for (const e of feats().edges) {
      if (seen.has(lineKey(e))) continue;
      const near = distToEdge(cur.pt, e) <= t + 0.5
        || (e.kind === "wall" && cur.snap.alignTo === e.source && u(e) >= e.u0 - 0.5 && u(e) <= e.u1 + 0.5);
      if (!near) continue;
      if (!(e.kind === "wall" ? !isEndFace(e) : roomFrom(e).room >= t + 1)) continue;
      seen.add(lineKey(e));
      tool.candidates.push(e);
    }
    const junction = tool.candidates.length > 1 ? tool.candidates.filter((e) => e !== tool.edge && distToEdge(cur.pt, e) > 0.5).map((e) => e.id) : [];
    tool.step = "pt2";
    log("wall.draw.point", { step: "pt1", edge: tool.edge.id, line: edgeName(tool.edge), u: tool.u1, snap: cur.snap.kind, alignTo: cur.snap.alignTo, candidates: tool.candidates.map((e) => lineKey(e)), junction: junction.length ? junction : null });
    showDim("L", cur.pt);
  } else if (tool.step === "pt2") {
    tool.candidates = null; // settled by the second click
    takeSecondPoint(cur.u, cur.snap.kind, "click", cur.snap.alignTo);
  } else {
    commit("click");
  }
  cur = resolve(p);
  updateHint();
  render();
}

function takeSecondPoint(u2, snapKind, how, alignTo = undefined) {
  const L = Math.abs(u2 - tool.u1);
  if (!(L >= WALL_MIN_LENGTH)) { log("wall.draw.blocked", { step: "pt2", how, reason: `shorter than ${WALL_MIN_LENGTH}` }); flashTip(); return; }
  tool.u2 = u2;
  tool.locked = null;
  tool.step = "offset";
  log("wall.draw.point", { step: "pt2", edge: tool.edge.id, line: edgeName(tool.edge), u: tool.u2, length: L, snap: snapKind, alignTo, how });
  showDim("Offset", pointOnEdge(tool.edge, (tool.u1 + tool.u2) / 2));
}

/** Enter: second point = the far end of the edge (whole span) unless a length was typed; at the offset step, drop. */
function enter() {
  if (!tool) return;
  if (tool.kind === "door") {
    if (tool.step === "start" || tool.step === "width" || tool.step === "side") { if (mouse) clickDoor(mouse); }
    else if (tool.step === "clear") { readCard(); commitDoor("enter"); }
    return;
  }
  if (tool.step === "pt2") {
    if (mouse) cur = resolve(mouse); // lets the cursor pick the edge at a corner
    const e = tool.edge;
    tool.candidates = null;
    if (tool.locked != null && cur) takeSecondPoint(cur.u, "locked", "enter", null);
    else {
      const far = Math.abs(e.u1 - tool.u1) >= Math.abs(tool.u1 - e.u0) ? e.u1 : e.u0;
      takeSecondPoint(far, "far end", "enter");
    }
  } else if (tool.step === "offset") {
    if (mouse) cur = resolve(mouse);
    commit("enter");
  }
  if (mouse) cur = resolve(mouse);
  updateHint();
  render();
}

function commit(how) {
  if (!cur || !cur.wall || !cur.status) return;
  const st = cur.status;
  if (!st.ok) {
    log("wall.draw.blocked", { step: tool.step, how, issues: st.issues, wall: cur.wall });
    flashTip();
    return;
  }
  const meta = {
    how,
    from: cur.face.label,
    edge: cur.face.id,
    offset: cur.offset.d,
    alignedOffset: cur.offset.alignTo || null,
    clamped: cur.offset.clamped,
    length: cur.wall.u1 - cur.wall.u0,
    drawn: { u0: Math.min(tool.u1, tool.u2), u1: Math.max(tool.u1, tool.u2) },
    trimmed: cur.trimmed,
    anchors: st.anchors,
  };
  const w = job.addWall(cur.wall, meta);
  log("wall.draw.finish", { id: w ? w.id : null, wall: cur.wall, ...meta });
  // Stay in the tool: the new wall's faces are the next features to draw from.
  tool = { kind: "wall", step: "pt1", locked: null };
  hideDim();
  cur = mouse ? resolve(mouse) : null;
  updateHint();
  render();
}

let flashUntil = 0;
function flashTip() {
  flashUntil = performance.now() + 600;
  render();
  setTimeout(render, 620);
}

// --- type-in (Tab or a digit opens it; Enter commits the step; right-click / Esc cancels) ------

function showDim(name, at) {
  dimName.textContent = name;
  dimInput.value = "";
  dimEl.classList.remove("hidden", "locked");
  placeDim(at);
}
function placeDim(at) {
  if (!at) return;
  const s = S(at.x, at.y);
  dimEl.style.left = `${s.sx}px`;
  dimEl.style.top = `${s.sy - 26}px`;
}
function hideDim() {
  dimEl.classList.add("hidden");
  if (document.activeElement === dimInput) dimInput.blur();
}
function dimOpen() {
  return !dimEl.classList.contains("hidden");
}
/** Tab: focus the field with the live value selected, so typing replaces it (AutoCAD habit). */
function focusDim() {
  if (!dimOpen()) return;
  if (!tool.locked) dimInput.value = String(Math.round(currentDimValue()));
  dimEl.classList.add("focused");
  dimInput.focus();
  dimInput.select();
  log(`${DRAW_LOG[tool.kind]}.typein`, { step: tool.step, how: "tab", value: dimInput.value });
}
function currentDimValue() {
  if (!tool || !cur) return 0;
  if (tool.kind === "door") {
    if (tool.step === "start") return cur.dist || 0;
    if (tool.step === "width") return cur.width || 0;
    return 0;
  }
  if (tool.step === "pt2") return cur.length || 0;
  if (tool.step === "offset") return cur.offset ? cur.offset.d : 0;
  return 0;
}
function maxDimValue() {
  if (!tool || !cur) return null;
  if (tool.kind === "door") {
    const s = tool.solid;
    if (!s) return null;
    if (tool.step === "start") return s.u1 - s.u0;
    if (tool.step === "width") return tool.from === "lo" ? s.u1 - tool.uStart : tool.uStart - s.u0;
    return null;
  }
  if (tool.step === "pt2") return Math.max(tool.edge.u1 - tool.u1, tool.u1 - tool.edge.u0);
  if (tool.step === "offset") return cur.offset ? cur.offset.max : null;
  return null;
}
function setLocked(v) {
  if (!tool) return;
  tool.locked = v != null && v >= 0 ? v : null;
  dimEl.classList.toggle("locked", tool.locked != null);
  log(`${DRAW_LOG[tool.kind]}.typein`, { step: tool.step, value: dimInput.value, locked: tool.locked });
  if (mouse) cur = resolve(mouse);
  render();
}
dimInput.addEventListener("input", () => {
  const s = dimInput.value.trim();
  if (/^\d+(?:\.\d+)?$/.test(s)) setLocked(Number(s));
  else if (s === "") setLocked(null);
});
dimInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter" || e.key === "Tab") {
    e.preventDefault();
    const v = evalDim(dimInput.value, currentDimValue(), maxDimValue());
    if (v != null) { setLocked(v); dimInput.value = String(Math.round(v)); }
    if (e.key === "Enter") enter();
    else dimInput.select();
  } else if (e.key === "Escape") {
    e.preventDefault();
    dimInput.blur();
    cancelStep("esc");
  }
});
dimInput.addEventListener("blur", () => dimEl.classList.remove("focused"));

// --- pointer ---------------------------------------------------------------------------------

canvas.addEventListener("pointerdown", (e) => {
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  if (e.button === 1 || e.button === 2) {
    // Middle / right drag pans; a right *click* (no drag) cancels — decided on release.
    pan = { sx, sy, ox: view.ox, oy: view.oy, button: e.button, moved: false };
    canvas.setPointerCapture(e.pointerId);
    e.preventDefault();
    return;
  }
  if (e.button !== 0) return;
  if (document.activeElement === dimInput) {
    // A typed value is confirmed by the click, like Enter would.
    const v = evalDim(dimInput.value, currentDimValue(), maxDimValue());
    if (v != null) setLocked(v);
    dimInput.blur();
  }
  click(Wd(sx, sy));
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointermove", (e) => {
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  if (pan) {
    if (!pan.moved && Math.hypot(sx - pan.sx, sy - pan.sy) > CLICK_PX) pan.moved = true;
    if (pan.moved) {
      view.ox = pan.ox + (sx - pan.sx);
      view.oy = pan.oy + (sy - pan.sy);
      render();
    }
    return;
  }
  mouse = Wd(sx, sy);
  mouse.sx = sx;
  mouse.sy = sy;
  stCursor.textContent = `X ${Math.round(mouse.x)}  Y ${Math.round(mouse.y)}`;
  cur = resolve(mouse);
  render();
});
canvas.addEventListener("pointerup", (e) => {
  if (!pan) return;
  const p = pan;
  pan = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch (_) { /* released */ }
  if (p.button === 2 && !p.moved) {
    // Right-click = cancel (AutoCAD habit): the wall in progress, then the tool.
    if (document.activeElement === dimInput) dimInput.blur();
    if (!cancelStep("right-click")) log("floorplan.cancel", { what: "nothing to cancel" });
  }
});
canvas.addEventListener("pointerleave", () => { mouse = null; cur = null; hideTip(); render(); });
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const r = canvas.getBoundingClientRect();
  const sx = e.clientX - r.left;
  const sy = e.clientY - r.top;
  const before = Wd(sx, sy);
  const f = Math.exp(-e.deltaY * 0.0012);
  view.k = Math.min(5, Math.max(0.02, view.k * f));
  view.ox = sx - before.x * view.k;
  view.oy = sy + before.y * view.k;
  if (mouse) { mouse = { ...Wd(sx, sy), sx, sy }; cur = resolve(mouse); }
  render();
}, { passive: false });

// --- keyboard: the sheet owns the keys while it is open (Ctrl shortcuts pass through) ----------

window.addEventListener("keydown", (e) => {
  if (!isOpen) return;
  if (e.ctrlKey || e.metaKey) return; // undo / redo / save keep working
  if (e.target === dimInput || (e.target instanceof Node && cardEl.contains(e.target))) return; // the fields handle their own keys
  e.stopImmediatePropagation();
  if (e.key === "Escape") {
    e.preventDefault();
    if (!cancelStep("esc")) closeFloorPlan("esc");
    return;
  }
  if (e.key === "Enter") { e.preventDefault(); enter(); return; }
  if (e.key === "Tab") { e.preventDefault(); if (tool && dimOpen()) focusDim(); return; }
  if (e.key === "Delete" || e.key === "Backspace") {
    const w = job.getSelectedWall();
    if (w && selectedOpening && (w.openings || []).some((o) => o.id === selectedOpening)) {
      log("key.delete", { id: selectedOpening, wallId: w.id, where: "floorplan" });
      job.removeOpening(w.id, selectedOpening);
      selectedOpening = null;
    } else if (w) { log("key.delete", { id: w.id, where: "floorplan" }); job.removeWall(w.id); }
    return;
  }
  if (e.key === "f" || e.key === "F") { fit(); render(); return; }
  if (e.key === "w" || e.key === "W") { setTool(tool && tool.kind === "wall" ? null : "wall"); return; }
  if (e.key === "d" || e.key === "D") { setTool(isDoor("showerDoor") ? null : "door"); return; }
  if (e.key === "s" || e.key === "S") { setTool(isDoor("slidingDoor") ? null : "slide"); return; }
  if (tool && dimOpen() && /^[0-9.+\-*/]$/.test(e.key)) {
    dimInput.value = "";
    dimEl.classList.add("focused");
    dimInput.focus();
    return; // the key lands in the field
  }
}, true);

// --- drawing ---------------------------------------------------------------------------------

const C = {
  bg: "#1a1c1f", floor: "#23272e", gridMinor: "#2c3138", gridMajor: "#3a4049",
  spaceWall: "#6b7784", spaceWallOff: "#3a4049", seam: "#4f86e0", roofLine: "#3f4a5c",
  cab: "rgba(201,183,153,0.30)", cabLine: "#8a7d68", cabFront: "#9ec5d8", cabText: "#b8ad98",
  wall: "#dfe4ea", wallLine: "#8b93a0", wallSel: "#4f86e0", wallBad: "rgba(217,75,75,0.55)", wallBadLine: "#d94b4b",
  edge: "#7fb0ff", point: "#ffffff", text: "#9aa2ad", accent: "#4f86e0", warn: "#f0a050", bad: "#d94b4b",
  preview: "rgba(79,134,224,0.35)", previewLine: "#7fb0ff", dim: "#f0c070", align: "#f0c070", door: "#9ec5d8",
};

function rect(x0, y0, x1, y1, fill, stroke, lw = 1) {
  const a = S(Math.min(x0, x1), Math.max(y0, y1));
  const b = S(Math.max(x0, x1), Math.min(y0, y1));
  if (fill) { ctx.fillStyle = fill; ctx.fillRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy); }
}
function line(x0, y0, x1, y1, stroke, lw = 1, dash = null) {
  const a = S(x0, y0);
  const b = S(x1, y1);
  ctx.strokeStyle = stroke;
  ctx.lineWidth = lw;
  ctx.setLineDash(dash || []);
  ctx.beginPath(); ctx.moveTo(a.sx, a.sy); ctx.lineTo(b.sx, b.sy); ctx.stroke();
  ctx.setLineDash([]);
}
function text(x, y, s, color = C.text, align = "center", dx = 0, dy = 0, font = "11px Segoe UI, system-ui, sans-serif") {
  const a = S(x, y);
  ctx.fillStyle = color;
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(s, a.sx + dx, a.sy + dy);
}
function dot(x, y, r, color) {
  const a = S(x, y);
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(a.sx, a.sy, r, 0, Math.PI * 2); ctx.fill();
}
function edgeLine(e, color, lw, dash = null) {
  const a = pointOnEdge(e, e.u0);
  const b = pointOnEdge(e, e.u1);
  line(a.x, a.y, b.x, b.y, color, lw, dash);
}
/** A dashed alignment line { axis, at } across the whole space (a partition's centre line, a cabinet side). */
function guideLine(g) {
  const b = job.getSpace().bounds;
  if (g.axis === "x") line(g.at, b.minY, g.at, b.maxY, C.align, 1, [8, 6]);
  else line(b.minX, g.at, b.maxX, g.at, C.align, 1, [8, 6]);
}
/** The line the user picked, as a body: a partition is outlined whole, any other edge is highlighted. */
function lineMark(e) {
  if (e.kind === "wall") {
    const w = wallBody(e.source);
    if (w) { rect(w.box.x[0], w.box.y[0], w.box.x[1], w.box.y[1], null, C.edge, 2.5); return; }
  }
  edgeLine(e, C.edge, 3);
}
function snapMark(pt, s) {
  if (s.guide) guideLine(s.guide);
  dot(pt.x, pt.y, s.kind === "grid" ? 4 : 5, s.kind === "feature" ? C.point : s.kind === "align" ? C.align : C.accent);
}

function render() {
  if (!isOpen || !size.w) return;
  const sp = job.getSpace();
  ctx.fillStyle = C.bg;
  ctx.fillRect(0, 0, size.w, size.h);
  if (!sp) return;
  const b = sp.bounds;
  const F = feats();
  const stock = job.getStock();
  const selId = job.getSelectedId();

  // Floor + grid inside the space.
  rect(b.minX, b.minY, b.maxX, b.maxY, C.floor, null);
  for (let x = Math.ceil(b.minX / GRID_MINOR) * GRID_MINOR; x <= b.maxX; x += GRID_MINOR) line(x, b.minY, x, b.maxY, x % GRID_MAJOR === 0 ? C.gridMajor : C.gridMinor, 1);
  for (let y = Math.ceil(b.minY / GRID_MINOR) * GRID_MINOR; y <= b.maxY; y += GRID_MINOR) line(b.minX, y, b.maxX, y, y % GRID_MAJOR === 0 ? C.gridMajor : C.gridMinor, 1);

  // Roof breaks (where the slope changes) and the seam between the nose and the flat rear.
  for (const [y] of sp.profile || []) {
    if (y <= b.minY + 1e-6 || y >= b.maxY - 1e-6) continue;
    const seam = sp.flatFromY != null && Math.abs(y - sp.flatFromY) < 1e-6;
    line(b.minX, y, b.maxX, y, seam ? C.seam : C.roofLine, 1, [6, 6]);
    text(b.maxX, y, seam ? `seam ${Math.round(y)}` : `roof ${Math.round(y)}`, seam ? C.seam : C.roofLine, "left", 6, 0);
  }

  // Space walls: thick where a wall exists, thin dashed where the checkbox is off.
  const has = new Set(sp.walls || []);
  const edges = [[b.minX, b.minY, b.maxX, b.minY, 0], [b.maxX, b.minY, b.maxX, b.maxY, 1], [b.maxX, b.maxY, b.minX, b.maxY, 2], [b.minX, b.maxY, b.minX, b.minY, 3]];
  for (const [x0, y0, x1, y1, i] of edges) line(x0, y0, x1, y1, has.has(i) ? C.spaceWall : C.spaceWallOff, has.has(i) ? 4 : 1, has.has(i) ? null : [4, 6]);
  text((b.minX + b.maxX) / 2, b.minY, sp.kind === "vehicle" ? "front · nose" : "front", C.text, "center", 0, 14);
  text((b.minX + b.maxX) / 2, b.maxY, "back", C.text, "center", 0, -12);
  dot(0, 0, 3, C.text);
  text(0, 0, "0", C.text, "right", -6, 8);
  text(b.maxX, b.minY, `X ${Math.round(b.maxX)}`, C.text, "right", -2, 14);
  text(b.minX, b.maxY, `Y ${Math.round(b.maxY)}`, C.text, "left", -2, -12);

  // Cabinets: footprint, id, a light-blue line on the door side.
  for (const s of F.solids) {
    if (s.kind !== "cabinet") continue;
    const c = s.cab;
    rect(s.x[0], s.y[0], s.x[1], s.y[1], C.cab, selId === s.id ? C.wallSel : C.cabLine, selId === s.id ? 2 : 1);
    const side = sideOfRotZ(c.pose.rotZ);
    const at = side.axis === "x" ? (side.dir > 0 ? s.x[1] : s.x[0]) : (side.dir > 0 ? s.y[1] : s.y[0]);
    if (side.axis === "x") line(at, s.y[0], at, s.y[1], C.cabFront, 3); else line(s.x[0], at, s.x[1], at, C.cabFront, 3);
    if ((s.x[1] - s.x[0]) * view.k > 40) text((s.x[0] + s.x[1]) / 2, (s.y[0] + s.y[1]) / 2, s.id, C.cabText);
  }

  // Partition walls.
  for (const s of F.solids) {
    if (s.kind !== "wall") continue;
    const w = job.getWall(s.id);
    const st = statusFor(w);
    const sel = selId === s.id;
    rect(s.x[0], s.y[0], s.x[1], s.y[1], st.ok ? C.wall : C.wallBad, !st.ok ? C.wallBadLine : sel ? C.wallSel : C.wallLine, sel ? 2.5 : 1);
    const cx = (s.x[0] + s.x[1]) / 2;
    const cy = (s.y[0] + s.y[1]) / 2;
    const len = w.axis === "y" ? s.x[1] - s.x[0] : s.y[1] - s.y[0];
    if (len * view.k > 50) {
      const a = S(cx, cy);
      ctx.save();
      ctx.translate(a.sx, a.sy);
      if (w.axis === "x") ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = sel ? C.wallSel : C.text;
      ctx.font = "10px Segoe UI, system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${s.id} · ${Math.round(len)}`, 0, -(thickness(stock, "partition") * view.k) / 2 - 7);
      ctx.restore();
    }
    // Openings: the wall is cut over the door span — floor shows through, a jamb line on each side, dashed door line.
    // A sliding door also shows its leaf (solid) and pelmet (outline) beside the wall.
    const others = s.solid.openings.some((o) => o.type === "slidingDoor") ? otherWallBoxes(s.id) : null;
    for (const o of s.solid.openings) {
      const r = doorPreview(s.solid, o.u0, o.u1);
      const isSel = sel && selectedOpening === o.id;
      if (others) drawParts(openingParts(s.solid, o, sp, stock, others), isSel ? "sel" : st.ok ? "ok" : "bad");
      rect(r.x0, r.y0, r.x1, r.y1, C.floor, null);
      const jambs = s.solid.along === "x"
        ? [[r.x0, r.y0, r.x0, r.y1], [r.x1, r.y0, r.x1, r.y1]]
        : [[r.x0, r.y0, r.x1, r.y0], [r.x0, r.y1, r.x1, r.y1]];
      for (const [x0, y0, x1, y1] of jambs) line(x0, y0, x1, y1, isSel ? C.wallSel : C.wallLine, isSel ? 2.5 : 1.5);
      const mid = s.solid.axis === "x" ? (r.x0 + r.x1) / 2 : (r.y0 + r.y1) / 2;
      if (s.solid.along === "x") line(r.x0, mid, r.x1, mid, isSel ? C.wallSel : C.door, 1, [4, 4]); else line(mid, r.y0, mid, r.y1, isSel ? C.wallSel : C.door, 1, [4, 4]);
      if ((o.u1 - o.u0) * view.k > 36) {
        const a = S((r.x0 + r.x1) / 2, (r.y0 + r.y1) / 2);
        ctx.save();
        ctx.translate(a.sx, a.sy);
        if (w.axis === "x") ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = isSel ? C.wallSel : C.door;
        ctx.font = "10px Segoe UI, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`${o.type === "slidingDoor" ? "slide" : "door"} ${Math.round(o.width)}`, 0, (thickness(stock, "partition") * view.k) / 2 + 8);
        ctx.restore();
      }
    }
  }

  // Tool feedback.
  if (cur && tool && tool.kind === "door") drawDoorTool();
  else if (cur && tool) drawTool(F);
  else if (cur && cur.hover) {
    const s = cur.hover;
    if (cur.hoverOpening) { const r = doorPreview(s.solid, cur.hoverOpening.u0, cur.hoverOpening.u1); rect(r.x0, r.y0, r.x1, r.y1, null, C.accent, 1.5); }
    else rect(s.x[0], s.y[0], s.x[1], s.y[1], null, C.accent, 1.5);
  }

  // Tip.
  if (cur && mouse && cur.tip.length) showTip(mouse.sx, mouse.sy, cur.tip, performance.now() < flashUntil ? "bad" : cur.tone);
  else hideTip();
}

function drawTool(F) {
  if (tool.step === "pt1") {
    if (cur.edge) {
      lineMark(cur.edge);
      for (const u of featureUsOnEdge(cur.edge, F.points)) { const q = pointOnEdge(cur.edge, u); dot(q.x, q.y, 3, C.edge); }
      snapMark(cur.pt, cur.snap);
    }
    return;
  }
  const e = tool.edge;
  lineMark(e);
  const p1 = pointOnEdge(e, tool.u1);
  dot(p1.x, p1.y, 5, C.point);
  if (tool.step === "pt2") {
    for (const u of featureUsOnEdge(e, F.points)) { const q = pointOnEdge(e, u); dot(q.x, q.y, 3, C.edge); }
    const p2 = cur.pt;
    line(p1.x, p1.y, p2.x, p2.y, C.dim, 3);
    snapMark(p2, cur.snap);
    const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
    text(mid.x, mid.y, `L ${Math.round(cur.length)}`, C.dim, "center", e.along === "x" ? 0 : 14, e.along === "x" ? -12 : 0);
    placeDim(mid);
    return;
  }
  // offset step: from the face on the cursor's side
  const face = cur.face;
  if (cur.offset.guide) guideLine(cur.offset.guide);
  drawPreview(cur.wall, cur.status);
  const p2 = pointOnEdge(face, tool.u2);
  dot(p2.x, p2.y, 5, C.point);
  drawOffsetDim(face, cur.wall, cur.offset, (tool.u1 + tool.u2) / 2);
  placeDim(pointOnEdge(face, (tool.u1 + tool.u2) / 2));
}

function drawDoorTool() {
  if (tool.step === "end") {
    if (cur.wall) {
      rect(cur.wall.x[0], cur.wall.y[0], cur.wall.x[1], cur.wall.y[1], null, C.edge, 2.5);
      dot(cur.pt.x, cur.pt.y, 6, C.dim);
    }
    return;
  }
  const s = tool.solid;
  rect(s.x0, s.y0, s.x1, s.y1, null, C.edge, 2.5);
  const ce = centreEdge(s);
  const pe = pointOnEdge(ce, tool.endU);
  dot(pe.x, pe.y, 6, C.dim);
  const across = (u, color, lw) => {
    if (s.along === "x") line(u, s.y0, u, s.y1, color, lw); else line(s.x0, u, s.x1, u, color, lw);
  };
  if (tool.step === "start") {
    if (cur.snap && cur.snap.guide) guideLine(cur.snap.guide);
    across(cur.u, C.dim, 2);
    line(pe.x, pe.y, cur.pt.x, cur.pt.y, C.dim, 1.5);
    text((pe.x + cur.pt.x) / 2, (pe.y + cur.pt.y) / 2, `${Math.round(cur.dist)}`, C.dim, "center", s.along === "x" ? 0 : 16, s.along === "x" ? -14 : 0);
    placeDim(cur.pt);
    return;
  }
  const r = cur.rect;
  const bad = cur.issues && cur.issues.length;
  rect(r.x0, r.y0, r.x1, r.y1, bad ? C.wallBad : "rgba(240,192,112,0.35)", bad ? C.wallBadLine : C.dim, 1.5);
  across(tool.uStart, C.dim, 2);
  if (tool.step === "width") {
    if (cur.snap && cur.snap.guide) guideLine(cur.snap.guide);
    across(cur.u, C.dim, 2);
    const a = pointOnEdge(ce, tool.uStart);
    const b = pointOnEdge(ce, cur.u);
    text((a.x + b.x) / 2, (a.y + b.y) / 2, `W ${Math.round(cur.width)}`, C.dim, "center", s.along === "x" ? 0 : 16, s.along === "x" ? -14 : 0);
    placeDim(b);
    return;
  }
  across(tool.uEnd, C.dim, 2);
  // Sliding door: the leaf and pelmet on the chosen (or hovered) side.
  if (cur.parts) {
    drawParts(cur.parts, bad ? "bad" : "preview");
    const leaf = partOf(cur.parts, "leaf");
    if (leaf && tool.step === "side") {
      const mid = { x: (leaf.x0 + leaf.x1) / 2, y: (leaf.y0 + leaf.y1) / 2 };
      text(mid.x, mid.y, sideLabel(s, cur.side), bad ? C.bad : C.dim, "center", s.along === "x" ? 0 : 0, s.along === "x" ? (cur.side > 0 ? -14 : 14) : 0);
    }
  }
}

/** Leaf (filled) and pelmet (outline) of a sliding door in the plan. `tone`: ok | sel | bad | preview. */
function drawParts(parts, tone) {
  const fill = tone === "bad" ? C.wallBad : tone === "preview" ? "rgba(158,197,216,0.45)" : "rgba(158,197,216,0.55)";
  const stroke = tone === "bad" ? C.wallBadLine : tone === "sel" ? C.wallSel : tone === "preview" ? C.dim : C.door;
  for (const p of parts) {
    if (p.part === "leaf") rect(p.x0, p.y0, p.x1, p.y1, fill, stroke, tone === "sel" ? 2 : 1.2);
    else {
      // The pelmet is at the ceiling: an outline only, so the floor plan under it stays readable.
      const a = S(p.x0, p.y1);
      const b = S(p.x1, p.y0);
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 1;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
      ctx.setLineDash([]);
      if (p.length * view.k > 60) {
        const along = p.along;
        const mid = { x: (p.x0 + p.x1) / 2, y: (p.y0 + p.y1) / 2 };
        const at = S(mid.x, mid.y);
        ctx.save();
        ctx.translate(at.sx, at.sy);
        if (along === "y") ctx.rotate(-Math.PI / 2);
        ctx.fillStyle = stroke;
        ctx.font = "9px Segoe UI, system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(`pelmet ${Math.round(p.length)}`, 0, -8);
        ctx.restore();
      }
    }
  }
}

function drawPreview(wall, st) {
  const s = wallSolid(wall, job.getSpace(), job.getStock());
  const bad = st && !st.ok;
  rect(s.x0, s.y0, s.x1, s.y1, bad ? C.wallBad : C.preview, bad ? C.wallBadLine : C.previewLine, 1.5);
}

/** Dimension line from the source face to the wall's near face at `u` along the face. */
function drawOffsetDim(face, wall, offset, u) {
  const a = pointOnEdge(face, u);
  const bp = face.along === "x" ? { x: u, y: wall.at } : { x: wall.at, y: u };
  line(a.x, a.y, bp.x, bp.y, offset.clamped ? C.warn : C.dim, 1.5);
  const tick = 6 / view.k;
  if (face.along === "x") { line(a.x - tick, a.y, a.x + tick, a.y, C.dim, 1); line(bp.x - tick, bp.y, bp.x + tick, bp.y, C.dim, 1); }
  else { line(a.x, a.y - tick, a.x, a.y + tick, C.dim, 1); line(bp.x, bp.y - tick, bp.x, bp.y + tick, C.dim, 1); }
  const mid = { x: (a.x + bp.x) / 2, y: (a.y + bp.y) / 2 };
  text(mid.x, mid.y, `${Math.round(offset.d)}`, offset.clamped ? C.warn : C.dim, face.along === "x" ? "left" : "center", face.along === "x" ? 8 : 0, face.along === "x" ? 0 : -12);
}

function showTip(sx, sy, lines, tone) {
  tipEl.replaceChildren(...lines.filter(Boolean).map((s) => { const d = document.createElement("div"); d.textContent = s; return d; }));
  tipEl.className = `fp-tip ${tone || ""}`;
  tipEl.style.left = `${sx + 16}px`;
  tipEl.style.top = `${sy + 18}px`;
}
function hideTip() {
  tipEl.classList.add("hidden");
}

// The button is only useful once a space exists.
job.onChange(() => { btn.disabled = !job.hasSpace(); if (!job.hasSpace() && isOpen) closeFloorPlan("no space"); });
btn.disabled = !job.hasSpace();

// Read-only hook for scripted checks (CDP smoke tests): where a plan point is on
// screen, and what the sheet currently holds. Never used by the app itself.
window.cablabDebug = Object.assign(window.cablabDebug || {}, {
  floorplan: {
    isOpen: () => isOpen,
    toScreen: (x, y) => S(x, y),
    state: () => ({ tool: tool ? { kind: tool.kind, type: tool.type || null, step: tool.step, locked: tool.locked, side: tool.side || null } : null, tip: cur ? cur.tip : null, tone: cur ? cur.tone : null, side: cur && cur.side != null ? cur.side : null, parts: cur && cur.parts ? cur.parts.map((p) => ({ part: p.part, x: p.x, y: p.y, z: p.z, length: p.length, stoppedBy: p.stoppedBy || null })) : null, dim: dimOpen() ? { name: dimName.textContent, value: dimInput.value, focused: document.activeElement === dimInput } : null, card: !cardEl.classList.contains("hidden"), selectedOpening, view }),
    walls: () => job.getWalls(),
    bounds: () => (job.getSpace() ? job.getSpace().bounds : null),
    mouse: () => (mouse ? { x: mouse.x, y: mouse.y } : null),
  },
});
