// Feature points for point-to-point placement: the space's corners and the
// corners of every cabinet envelope (world space, coincident points merged).
// Rebuilt lazily whenever the job changes.
import * as THREE from "three";
import { camera, canvas } from "./space.js";
import { getJob, getSpace, onChange } from "./job.js";
import { envelopeFootprint } from "./cabinets3d.js";

export const SNAP_RADIUS_PX = 14;

let points = null;
onChange(() => { points = null; });

function key(x, y, z) {
  return `${Math.round(x * 10)}|${Math.round(y * 10)}|${Math.round(z * 10)}`;
}

function build() {
  const map = new Map();
  const add = (x, y, z, source) => {
    const k = key(x, y, z);
    if (!map.has(k)) map.set(k, { x, y, z, sources: [source] });
    else map.get(k).sources.push(source);
  };

  const sp = getSpace();
  if (sp) {
    for (const [x, y] of sp.floor) {
      add(x, y, 0, "space");
      add(x, y, sp.height, "space");
    }
    for (const o of sp.obstacles || []) {
      for (const x of [o.x0, o.x1]) for (const y of [o.y0, o.y1]) for (const z of [o.z0, o.z1]) add(x, y, z, "obstacle");
    }
  }

  for (const cab of getJob().cabinets) {
    const fp = envelopeFootprint(cab, cab.pose);
    for (const [x, y] of fp.corners) {
      add(x, y, fp.z0, cab.id);
      add(x, y, fp.z1, cab.id);
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
