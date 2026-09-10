// Feature points for point-to-point placement: the space's corners and the
// corners of every cabinet envelope (world space, coincident points merged).
// Rebuilt lazily whenever the job changes.
import * as THREE from "three";
import { camera, canvas, closestTOnLine } from "./space.js";
import { getJob, getSpace, onChange, snap } from "./job.js";
import { envelopeFootprint } from "./cabinets3d.js";

export const SNAP_RADIUS_PX = 14;

let points = null;
onChange(() => { points = null; });

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
export function nearestInference(clientX, clientY, from, { band = INFER_BAND_PX, planar = false } = {}) {
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
export function nearestSnap(clientX, clientY, { exclude = null, maxPx = SNAP_RADIUS_PX } = {}) {
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
