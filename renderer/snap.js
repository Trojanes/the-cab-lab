// Feature points for point-to-point placement: the space's corners and the
// corners of every cabinet envelope (world space, coincident points merged).
// Rebuilt lazily whenever the job changes.
import * as THREE from "three";
import { camera, canvas, closestTOnLine } from "./space.js";
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

/**
 * Axis-aligned faces of the space and of every cabinet envelope, for
 * alignment inference ("flush with the front of cab-1", "at the ceiling").
 * { axis:"x"|"y"|"z", value, source, label, u:[min,max], v:[min,max] } where
 * u/v are the face's extents along the two other axes (x,y order, then z).
 */
function buildPlanes() {
  const out = [];
  const sp = getSpace();
  if (sp) {
    const b = sp.bounds;
    out.push({ axis: "x", value: b.minX, source: "space", label: "Left wall", u: [b.minY, b.maxY], v: [0, sp.height] });
    out.push({ axis: "x", value: b.maxX, source: "space", label: "Right wall", u: [b.minY, b.maxY], v: [0, sp.height] });
    out.push({ axis: "y", value: b.minY, source: "space", label: "Front edge", u: [b.minX, b.maxX], v: [0, sp.height] });
    out.push({ axis: "y", value: b.maxY, source: "space", label: "Back wall", u: [b.minX, b.maxX], v: [0, sp.height] });
    out.push({ axis: "z", value: 0, source: "space", label: "Floor", u: [b.minX, b.maxX], v: [b.minY, b.maxY] });
    out.push({ axis: "z", value: sp.height, source: "space", label: "Ceiling", u: [b.minX, b.maxX], v: [b.minY, b.maxY] });
  }
  for (const cab of getJob().cabinets) {
    const fp = envelopeFootprint(cab, cab.pose);
    const rot = ((cab.pose.rotZ || 0) % 180 + 180) % 180;
    const sideX = rot === 0 ? "side" : "front/back";
    const sideY = rot === 0 ? "front/back" : "side";
    out.push({ axis: "x", value: fp.minX, source: cab.id, label: `${cab.id} ${sideX}`, u: [fp.minY, fp.maxY], v: [fp.z0, fp.z1] });
    out.push({ axis: "x", value: fp.maxX, source: cab.id, label: `${cab.id} ${sideX}`, u: [fp.minY, fp.maxY], v: [fp.z0, fp.z1] });
    out.push({ axis: "y", value: fp.minY, source: cab.id, label: `${cab.id} ${sideY}`, u: [fp.minX, fp.maxX], v: [fp.z0, fp.z1] });
    out.push({ axis: "y", value: fp.maxY, source: cab.id, label: `${cab.id} ${sideY}`, u: [fp.minX, fp.maxX], v: [fp.z0, fp.z1] });
    out.push({ axis: "z", value: fp.z0, source: cab.id, label: `${cab.id} bottom`, u: [fp.minX, fp.maxX], v: [fp.minY, fp.maxY] });
    out.push({ axis: "z", value: fp.z1, source: cab.id, label: `${cab.id} top`, u: [fp.minX, fp.maxX], v: [fp.minY, fp.maxY] });
  }
  return out;
}

export function facePlanes() {
  if (!planes) planes = buildPlanes();
  return planes;
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
 * Alignment on a horizontal working plane: vertical faces (x = c or y = c)
 * cut the plane in a line; if the cursor is within `band` px of such a line,
 * that coordinate is pinned. Returns { x?: {value, plane}, y?: {value, plane} }.
 * `exclude` skips faces of one cabinet (the one being moved).
 */
export function nearestFaceAlign(clientX, clientY, planeZ, { band = INFER_BAND_PX * uiScale(), exclude = null } = {}) {
  const out = {};
  for (const pl of facePlanes()) {
    if (pl.axis === "z" || pl.source === exclude) continue;
    // A face only aligns at heights it actually spans (with a little slack).
    if (planeZ < pl.v[0] - 1 || planeZ > pl.v[1] + 1) continue;
    // The face is extended across the whole space, like a guide line.
    const [a, b] = faceGuide(pl, planeZ);
    const d = screenDistToSegment(clientX, clientY, a, b);
    if (d <= band && (!out[pl.axis] || d < out[pl.axis].distPx)) out[pl.axis] = { value: pl.value, plane: pl, distPx: d };
  }
  return out;
}

/** The guide line of a vertical face on plane z, spanning the whole space (or the face if no space). */
export function faceGuide(pl, z) {
  const sp = getSpace();
  const ext = sp ? (pl.axis === "x" ? [sp.bounds.minY, sp.bounds.maxY] : [sp.bounds.minX, sp.bounds.maxX]) : pl.u;
  return pl.axis === "x"
    ? [{ x: pl.value, y: ext[0], z }, { x: pl.value, y: ext[1], z }]
    : [{ x: ext[0], y: pl.value, z }, { x: ext[1], y: pl.value, z }];
}

/**
 * Height candidates along the vertical line through (x, y): horizontal faces
 * and feature points. Returns { z, label, distPx } for the nearest within `band`.
 */
export function nearestHeightAlign(clientX, clientY, x, y, { band = INFER_BAND_PX * uiScale(), exclude = null } = {}) {
  let best = null;
  const consider = (z, label) => {
    const c = toClient(x, y, z);
    if (c.behind) return;
    const d = Math.hypot(c.x - clientX, c.y - clientY);
    if (d <= band && (!best || d < best.distPx)) best = { z, label, distPx: d };
  };
  for (const pl of facePlanes()) if (pl.axis === "z" && pl.source !== exclude) consider(pl.value, pl.label);
  for (const p of snapPoints()) if (!(exclude && p.sources.every((s) => s === exclude))) consider(p.z, `Height of ${describePoint(p)}`);
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
export function nearestInference(clientX, clientY, from, { band = INFER_BAND_PX * uiScale(), planar = false } = {}) {
  if (!from) return null;
  let best = null;
  for (const dir of from.dirs || []) {
    if (planar && Math.abs(dir[2]) > 1e-6) continue;
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
