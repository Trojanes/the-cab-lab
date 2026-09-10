// Feature points for point-to-point placement: the space's corners and the
// corners of every cabinet envelope (world space, coincident points merged).
// Rebuilt lazily whenever the job changes.
import * as THREE from "three";
import { camera, canvas, closestTOnLine, rayFromClient } from "./space.js";
import { getJob, getSpace, onChange, snap } from "./job.js";
import { envelopeFootprint } from "./cabinets3d.js";

export const SNAP_RADIUS_PX = 14;

let points = null;
let planes = null;
onChange(() => { points = null; planes = null; });

/** Pixel thresholds scale a little with the viewport so a 4K window feels like a laptop. */
export function uiScale() {
  const h = canvas.getBoundingClientRect().height || 760;
  return Math.min(1.5, Math.max(0.8, h / 760));
}

function key(x, y, z) {
  return `${Math.round(x * 10)}|${Math.round(y * 10)}|${Math.round(z * 10)}`;
}

export const AXIS_DIRS = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];

function unit(dx, dy, dz) {
  const l = Math.hypot(dx, dy, dz) || 1;
  return [dx / l, dy / l, dz / l];
}

function build() {
  const map = new Map();
  // Each point also records the directions of the edges leaving it, so the
  // cursor can slide along an edge after touching the point (inference).
  const add = (x, y, z, source, dirs) => {
    const k = key(x, y, z);
    let p = map.get(k);
    if (!p) {
      p = { x, y, z, sources: [], dirs: [] };
      map.set(k, p);
    }
    p.sources.push(source);
    for (const d of dirs) {
      if (!p.dirs.some((e) => Math.abs(e[0] - d[0]) < 1e-6 && Math.abs(e[1] - d[1]) < 1e-6 && Math.abs(e[2] - d[2]) < 1e-6)) p.dirs.push(d);
    }
  };

  const sp = getSpace();
  if (sp) {
    const n = sp.floor.length;
    for (let i = 0; i < n; i += 1) {
      const [x, y] = sp.floor[i];
      const [px, py] = sp.floor[(i + n - 1) % n];
      const [nx, ny] = sp.floor[(i + 1) % n];
      const dirs = [unit(px - x, py - y, 0), unit(nx - x, ny - y, 0)];
      add(x, y, 0, "space", [...dirs, [0, 0, 1]]);
      add(x, y, sp.height, "space", [...dirs, [0, 0, -1]]);
    }
    for (const o of sp.obstacles || []) {
      for (const x of [o.x0, o.x1]) for (const y of [o.y0, o.y1]) for (const z of [o.z0, o.z1]) add(x, y, z, "obstacle", AXIS_DIRS);
    }
  }

  for (const cab of getJob().cabinets) {
    const fp = envelopeFootprint(cab, cab.pose);
    const a = ((cab.pose.rotZ || 0) * Math.PI) / 180;
    const ex = [Math.cos(a), Math.sin(a), 0];
    const ey = [-Math.sin(a), Math.cos(a), 0];
    const dirs = [ex, ex.map((v) => -v), ey, ey.map((v) => -v)];
    for (const [x, y] of fp.corners) {
      add(x, y, fp.z0, cab.id, [...dirs, [0, 0, 1]]);
      add(x, y, fp.z1, cab.id, [...dirs, [0, 0, -1]]);
    }
  }
  return Array.from(map.values());
}

export function snapPoints() {
  if (!points) points = build();
  return points;
}

export const AXES = ["x", "y", "z"];
/** The two axes lying in a plane whose normal is `axis`. */
export function inPlaneAxes(axis) {
  return AXES.filter((a) => a !== axis);
}
export function axisVector(axis, sign = 1) {
  return [axis === "x" ? sign : 0, axis === "y" ? sign : 0, axis === "z" ? sign : 0];
}

/**
 * Axis-aligned faces of the space and of every cabinet envelope. Used for
 * alignment guides ("flush with cab-1 side"), for picking the working plane
 * a box is drawn on, and for extrusion targets ("up to the ceiling").
 *   { axis, value, dir, source, label, ext:{x:[..],y:[..],z:[..]}, pickable }
 * `dir` (±1) is the direction that leaves the solid the face belongs to: away
 * from a wall into the room, off a cabinet's top, etc. Boxes drawn on the face
 * may only be pulled that way.
 */
function buildPlanes() {
  const out = [];
  const face = (axis, value, dir, source, label, ext, pickable = true) => out.push({ axis, value, dir, source, label, ext: { ...ext, [axis]: [value, value] }, pickable });
  const sp = getSpace();
  if (sp) {
    const b = sp.bounds;
    const walls = new Set(sp.walls || []);
    const ext = { x: [b.minX, b.maxX], y: [b.minY, b.maxY], z: [0, sp.height] };
    // Box floor edges: 0 front (minY), 1 right (maxX), 2 back (maxY), 3 left (minX).
    face("x", b.minX, +1, "space", "Left wall", ext, walls.has(3));
    face("x", b.maxX, -1, "space", "Right wall", ext, walls.has(1));
    face("y", b.minY, +1, "space", "Front edge", ext, walls.has(0));
    face("y", b.maxY, -1, "space", "Back wall", ext, walls.has(2));
    face("z", 0, +1, "space", "Floor", ext);
    face("z", sp.height, -1, "space", "Ceiling", ext);
  }
  for (const cab of getJob().cabinets) {
    const fp = envelopeFootprint(cab, cab.pose);
    const ext = { x: [fp.minX, fp.maxX], y: [fp.minY, fp.maxY], z: [fp.z0, fp.z1] };
    face("x", fp.minX, -1, cab.id, `${cab.id} left side`, ext);
    face("x", fp.maxX, +1, cab.id, `${cab.id} right side`, ext);
    face("y", fp.minY, -1, cab.id, `${cab.id} front face`, ext);
    face("y", fp.maxY, +1, cab.id, `${cab.id} back face`, ext);
    face("z", fp.z0, -1, cab.id, `${cab.id} bottom`, ext);
    face("z", fp.z1, +1, cab.id, `${cab.id} top`, ext);
  }
  return out;
}

export function facePlanes() {
  if (!planes) planes = buildPlanes();
  return planes;
}

/** Ray ∩ plane (axis = value); returns the point or null. */
function rayHitPlane(ray, axis, value) {
  const o = ray.origin[axis];
  const d = ray.direction[axis];
  if (Math.abs(d) < 1e-9) return null;
  const t = (value - o) / d;
  if (t <= 0) return null;
  return { t, x: ray.origin.x + ray.direction.x * t, y: ray.origin.y + ray.direction.y * t, z: ray.origin.z + ray.direction.z * t };
}

/**
 * The face under the cursor: nearest pickable face whose visible side (the
 * `dir` side) faces the camera. Returns { face, point } or null.
 */
export function pickFace(clientX, clientY, { exclude = null } = {}) {
  const ray = rayFromClient(clientX, clientY);
  let best = null;
  for (const f of facePlanes()) {
    if (!f.pickable || f.source === exclude) continue;
    if (ray.direction[f.axis] * f.dir >= 0) continue; // looking at its back
    const h = rayHitPlane(ray, f.axis, f.value);
    if (!h) continue;
    const [u, v] = inPlaneAxes(f.axis);
    if (h[u] < f.ext[u][0] - 0.5 || h[u] > f.ext[u][1] + 0.5 || h[v] < f.ext[v][0] - 0.5 || h[v] > f.ext[v][1] + 0.5) continue;
    if (!best || h.t < best.point.t) best = { face: f, point: h };
  }
  return best;
}

/** Pickable faces a point lies on whose front we can see, most facing the camera first. */
export function facesAtPoint(p, clientX, clientY) {
  const ray = rayFromClient(clientX, clientY);
  const out = [];
  for (const f of facePlanes()) {
    if (!f.pickable || Math.abs(p[f.axis] - f.value) > 0.5) continue;
    const [u, v] = inPlaneAxes(f.axis);
    if (p[u] < f.ext[u][0] - 0.5 || p[u] > f.ext[u][1] + 0.5 || p[v] < f.ext[v][0] - 0.5 || p[v] > f.ext[v][1] + 0.5) continue;
    const facing = -ray.direction[f.axis] * f.dir; // > 0 when we see its front
    if (facing <= 0) continue;
    out.push({ face: f, facing });
  }
  out.sort((a, b) => b.facing - a.facing);
  return out.map((o) => o.face);
}
export function faceAtPoint(p, clientX, clientY) {
  return facesAtPoint(p, clientX, clientY)[0] || null;
}

/** Screen distance from the cursor to the 3D segment a→b (both {x,y,z}). */
function screenDistToSegment(clientX, clientY, a3, b3) {
  const a = toClient(a3.x, a3.y, a3.z);
  const b = toClient(b3.x, b3.y, b3.z);
  if (a.behind || b.behind) return Infinity;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = Math.min(1, Math.max(0, ((clientX - a.x) * dx + (clientY - a.y) * dy) / len2));
  return Math.hypot(clientX - (a.x + t * dx), clientY - (a.y + t * dy));
}

/**
 * Alignment on a working plane {axis, value}: faces perpendicular to it cut it
 * in a guide line; if the cursor is within `band` px of such a line, the
 * coordinate along the face's axis is pinned.
 * Returns { [faceAxis]: { value, plane, distPx } } for up to two in-plane axes.
 * `exclude` skips faces of one cabinet (the one being moved).
 */
export function nearestFaceAlign(clientX, clientY, plane, { band = INFER_BAND_PX * uiScale(), exclude = null } = {}) {
  const out = {};
  for (const f of facePlanes()) {
    if (f.axis === plane.axis || f.source === exclude) continue;
    // A face only aligns where it actually spans the working plane (with a little slack).
    const span = f.ext[plane.axis];
    if (plane.value < span[0] - 1 || plane.value > span[1] + 1) continue;
    const [a, b] = faceGuide(f, plane);
    const d = screenDistToSegment(clientX, clientY, a, b);
    if (d <= band && (!out[f.axis] || d < out[f.axis].distPx)) out[f.axis] = { value: f.value, plane: f, distPx: d };
  }
  return out;
}

/** Guide line where face `f` crosses the working plane, spanning the whole space. */
export function faceGuide(f, plane) {
  const third = AXES.find((a) => a !== f.axis && a !== plane.axis);
  const sp = getSpace();
  const ext = sp
    ? (third === "x" ? [sp.bounds.minX, sp.bounds.maxX] : third === "y" ? [sp.bounds.minY, sp.bounds.maxY] : [0, sp.height])
    : f.ext[third];
  const base = { [f.axis]: f.value, [plane.axis]: plane.value };
  return [{ ...base, [third]: ext[0] }, { ...base, [third]: ext[1] }];
}

/**
 * Extrusion targets along `axis` through point `p`, on the `dir` side only:
 * faces with that normal and feature-point coordinates. Nearest within `band`
 * on screen → { value, label, distPx } or null.
 */
export function nearestAxisAlign(clientX, clientY, p, axis, dir, { band = INFER_BAND_PX * uiScale(), exclude = null } = {}) {
  let best = null;
  const consider = (value, label) => {
    if ((value - p[axis]) * dir < 0.5) return;
    const q = { ...p, [axis]: value };
    const c = toClient(q.x, q.y, q.z);
    if (c.behind) return;
    const d = Math.hypot(c.x - clientX, c.y - clientY);
    if (d <= band && (!best || d < best.distPx)) best = { value, label, distPx: d };
  };
  for (const f of facePlanes()) if (f.axis === axis && f.source !== exclude) consider(f.value, f.label);
  for (const pt of snapPoints()) if (!(exclude && pt.sources.every((s) => s === exclude))) consider(pt[axis], `${axis.toUpperCase()} of ${describePoint(pt)}`);
  return best;
}

/** Short human label for a feature point ("Corner · space", "Corner · cab-1"). */
export function describePoint(p, exclude = null) {
  const sources = (p.sources || []).filter((s) => s !== exclude);
  if (!sources.length) return "point";
  const src = sources.includes("space") ? "space" : sources[0];
  return `${src}${sources.length > 1 ? " +" + (sources.length - 1) : ""}`;
}

const v = new THREE.Vector3();
export function toClient(x, y, z) {
  v.set(x, y, z).project(camera);
  const r = canvas.getBoundingClientRect();
  return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, behind: v.z > 1 };
}

export const INFER_BAND_PX = 10;
export const INFER_RELEASE_PX = 18;

/** Screen-space distance from the cursor to the line through `from` along `dir` (mm). */
function screenDistToLine(clientX, clientY, from, dir, lengthMm = 300) {
  // A short probe segment fixes the line's screen direction; a long one could
  // cross behind the camera and project garbage.
  const a = toClient(from.x, from.y, from.z);
  const b = toClient(from.x + dir[0] * lengthMm, from.y + dir[1] * lengthMm, from.z + dir[2] * lengthMm);
  if (a.behind || b.behind) return Infinity;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy || 1;
  const t = ((clientX - a.x) * dx + (clientY - a.y) * dy) / len2;
  if (t < 0) return Infinity; // only forward along the edge direction
  return Math.hypot(clientX - (a.x + t * dx), clientY - (a.y + t * dy));
}

/**
 * Among the edge directions of `from` (vertical ones included, so a box can be
 * pulled down from a ceiling edge), the one whose line passes within `band` px
 * of the cursor. Returns { dir, distPx } or null.
 */
export function nearestInference(clientX, clientY, from, { band = INFER_BAND_PX * uiScale(), planeAxis = null } = {}) {
  if (!from) return null;
  const ai = planeAxis ? AXES.indexOf(planeAxis) : -1;
  let best = null;
  for (const dir of from.dirs || []) {
    if (ai >= 0 && Math.abs(dir[ai]) > 1e-6) continue; // only edges lying in the working plane
    const d = screenDistToLine(clientX, clientY, from, dir);
    if (d <= band && (!best || d < best.distPx)) best = { dir, distPx: d };
  }
  return best;
}

/** Point on the line (from + t·dir) closest to the mouse ray, as {x,y,z}. */
export function pointOnLine(clientX, clientY, from, dir) {
  const origin = new THREE.Vector3(from.x, from.y, from.z);
  const d = new THREE.Vector3(dir[0], dir[1], dir[2]);
  const t = Math.max(0, snap(closestTOnLine(clientX, clientY, origin, d)));
  return { x: from.x + dir[0] * t, y: from.y + dir[1] * t, z: from.z + dir[2] * t };
}

/**
 * Nearest feature point to the cursor within SNAP_RADIUS_PX, or null.
 * `exclude` skips points that came only from the given cabinet id.
 */
export function nearestSnap(clientX, clientY, { exclude = null, maxPx = SNAP_RADIUS_PX * uiScale() } = {}) {
  let best = null;
  let bestD = maxPx;
  for (const p of snapPoints()) {
    if (exclude && p.sources.every((s) => s === exclude)) continue;
    const c = toClient(p.x, p.y, p.z);
    if (c.behind) continue;
    const d = Math.hypot(c.x - clientX, c.y - clientY);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
