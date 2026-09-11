// Space registry. Like cabinets, a space is `kind + params` resolved into
// geometry the renderer and interaction layer consume:
//   floor      polygon [[x, y], ...] in mm, counter-clockwise, origin at the
//              front-left corner (X right, Y back, Z up)
//   height     tallest clear height in mm (the flat rear part)
//   profile    roof as a YZ polyline [[y, z], ...] with y increasing, constant
//              across X: the clear height at any point is the profile's z at
//              that y (see clearHeightAt). A box is [[0, H], [D, H]].
//   flatFromY  y from which the roof is flat at `height` (the pickable ceiling)
//   obstacles  boxes inside the floor that cabinets must not overlap
//              (wheel arches, columns) – empty for a plain box
//   bounds     XY AABB of the floor, for quick clamping
// The renderer never branches on `kind`; vehicle / floorplan only differ here.
import { getSetting } from "./settings.js";

const WALL_KEYS = { key: "walls", type: "walls", label: "Walls" };

function numErrors(fields, p) {
  const errors = [];
  for (const f of fields) {
    if (f.type !== undefined && f.type !== "number") continue;
    const v = Number(p[f.key]);
    if (!Number.isFinite(v) || v < f.min) errors.push(`${f.label} must be at least ${f.min}.`);
  }
  return errors;
}

function wallList(p) {
  return Array.isArray(p.walls) ? p.walls.map(Number).filter((i) => i >= 0 && i <= 3) : [0, 1, 2, 3];
}

// --- box ---------------------------------------------------------------------------

const box = {
  id: "box",
  label: "Box",
  sub: "W × D × H room",
  defaults: () => ({ width: 4000, depth: 3000, height: 2400, walls: [0, 1, 2, 3] }),
  fields: [
    { key: "width", label: "Width (mm)", min: 300 },
    { key: "depth", label: "Depth (mm)", min: 300 },
    { key: "height", label: "Height (mm)", min: 300 },
    WALL_KEYS,
  ],
  validate(p) {
    return numErrors(this.fields, p);
  },
  describe(p) {
    return [["Width", `${p.width} mm`], ["Depth", `${p.depth} mm`], ["Height", `${p.height} mm`]];
  },
  resolve(p) {
    const W = Number(p.width);
    const D = Number(p.depth);
    const H = Number(p.height);
    return {
      kind: "box",
      floor: [[0, 0], [W, 0], [W, D], [0, D]],
      height: H,
      profile: [[0, H], [D, H]],
      flatFromY: 0,
      obstacles: [],
      bounds: { minX: 0, minY: 0, maxX: W, maxY: D },
      // Floor edges that get a wall: 0 front, 1 right, 2 back, 3 left.
      walls: wallList(p),
      summary: `${W} × ${D} × ${H} mm`,
    };
  },
};

// --- vehicle: box rear + side-profile nose ------------------------------------------
//
// Width is constant. The rear is a plain box (width × rearDepth × height). The
// nose is a side view (Y along the van, Z up) either typed as feature points
// joined by straight lines or imported from a DXF; it is extruded across X and
// grafted onto the front of the box: its rearmost vertical edge (the seam) is
// scaled uniformly to `height`, and the nose tip lands at Y = 0.

export const NOSE_DEFAULT_POINTS = [[0, 0], [0, 737], [345, 1515], [579, 1758], [1520, 1965], [1520, 0]];
const SETTINGS_KEY = "space.vehicle.defaults";

function builtInVehicleDefaults() {
  return {
    width: 2100,
    rearDepth: 4000,
    height: 1965,
    walls: [0, 1, 2, 3],
    frontMode: "points",
    front: { points: NOSE_DEFAULT_POINTS.map((p) => [...p]), dxf: null },
  };
}

/** The nose points in use for the mode, or null. */
export function nosePoints(p) {
  const front = p && p.front ? p.front : {};
  if (p && p.frontMode === "dxf") return front.dxf && Array.isArray(front.dxf.points) ? front.dxf.points : null;
  return Array.isArray(front.points) ? front.points : null;
}

/**
 * Nose side view → roof upper edge. Accepts an open or closed polyline in any
 * order: the roof at a given y is the highest point of any segment covering
 * it, so the floor and the seam edge may or may not be drawn.
 * Returns { profile: [[y, z], ...] (y from 0), frontLen, seamZ, noseZ } or { error }.
 */
export function noseUpperEdge(points) {
  if (!Array.isArray(points) || points.length < 2) return { error: "Nose needs at least 2 points." };
  const pts = [];
  for (const p of points) {
    const y = Number(p && p[0]);
    const z = Number(p && p[1]);
    if (!Number.isFinite(y) || !Number.isFinite(z)) return { error: "Every nose point needs a numeric Y and Z." };
    const last = pts[pts.length - 1];
    if (last && Math.abs(last[0] - y) < 0.01 && Math.abs(last[1] - z) < 0.01) continue;
    pts.push([y, z]);
  }
  if (pts.length < 2) return { error: "Nose needs at least 2 distinct points." };
  const minY = Math.min(...pts.map((p) => p[0]));
  const minZ = Math.min(...pts.map((p) => p[1]));
  if (minZ < -0.01) return { error: "Nose points must not go below the floor (Z ≥ 0)." };
  for (const p of pts) p[0] -= minY; // nose tip at Y = 0
  const frontLen = Math.max(...pts.map((p) => p[0]));
  if (frontLen < 50) return { error: "Nose must be at least 50 mm long along Y." };

  const segs = [];
  for (let i = 0; i < pts.length - 1; i += 1) segs.push([pts[i], pts[i + 1]]);
  const ys = [...new Set(pts.map((p) => Math.round(p[0] * 100) / 100))].sort((a, b) => a - b);
  const topAt = (y) => {
    let top = -Infinity;
    for (const [a, b] of segs) {
      const lo = Math.min(a[0], b[0]);
      const hi = Math.max(a[0], b[0]);
      if (y < lo - 0.01 || y > hi + 0.01) continue;
      if (hi - lo < 0.01) top = Math.max(top, a[1], b[1]);
      else top = Math.max(top, a[1] + ((b[1] - a[1]) * (y - a[0])) / (b[0] - a[0]));
    }
    return top;
  };
  const profile = ys.map((y) => [y, topAt(y)]);
  const seamZ = profile[profile.length - 1][1];
  if (!(seamZ > 0)) return { error: "The seam (rearmost edge of the nose) must be higher than the floor." };
  return { profile, frontLen, seamZ, noseZ: profile[0][1] };
}

/** Nose graft for `height`: uniform scale so the seam edge matches the rear box. */
export function graftNose(points, height) {
  const edge = noseUpperEdge(points);
  if (edge.error) return edge;
  const H = Number(height);
  const k = H > 0 ? H / edge.seamZ : 1;
  const profile = edge.profile.map(([y, z]) => [Math.round(y * k * 100) / 100, Math.round(z * k * 100) / 100]);
  return { profile, frontLen: profile[profile.length - 1][0], noseZ: profile[0][1], scale: k, seamZ: edge.seamZ };
}

const vehicle = {
  id: "vehicle",
  label: "Vehicle",
  sub: "box rear + side-profile nose",
  defaults() {
    const saved = getSetting(SETTINGS_KEY);
    if (saved && typeof saved === "object" && this.validate(saved).length === 0) return saved;
    return builtInVehicleDefaults();
  },
  builtInDefaults: builtInVehicleDefaults,
  settingsKey: SETTINGS_KEY,
  fields: [
    { key: "width", label: "Width (mm)", min: 300 },
    { key: "rearDepth", label: "Rear depth (mm)", min: 300 },
    { key: "height", label: "Height (mm)", min: 300 },
    WALL_KEYS,
    { key: "frontMode", type: "choice", label: "Front (nose)", options: [{ id: "points", label: "Points" }, { id: "dxf", label: "DXF" }] },
    { key: "front", type: "nose", label: "Nose side view" },
  ],
  validate(p) {
    const errors = numErrors(this.fields, p);
    if (p.frontMode !== "points" && p.frontMode !== "dxf") errors.push("Choose how the nose is defined: Points or DXF.");
    const pts = nosePoints(p);
    if (!pts) errors.push(p.frontMode === "dxf" ? "Import a DXF side view of the nose." : "Enter the nose points.");
    else {
      const g = graftNose(pts, p.height);
      if (g.error) errors.push(g.error);
    }
    return errors;
  },
  describe(p) {
    const pts = nosePoints(p);
    const g = pts ? graftNose(pts, p.height) : null;
    const nose = !g || g.error
      ? "—"
      : `${p.frontMode === "dxf" ? (p.front.dxf.name || "DXF") : `${pts.length} points`} · ${Math.round(g.frontLen)} mm${Math.abs(g.scale - 1) > 0.001 ? ` · ×${g.scale.toFixed(3)}` : ""}`;
    return [["Width", `${p.width} mm`], ["Rear depth", `${p.rearDepth} mm`], ["Height", `${p.height} mm`], ["Nose", nose]];
  },
  resolve(p) {
    const W = Number(p.width);
    const R = Number(p.rearDepth);
    const H = Number(p.height);
    const g = graftNose(nosePoints(p) || NOSE_DEFAULT_POINTS, H);
    const nose = g.error ? { profile: [[0, H]], frontLen: 0, noseZ: H, scale: 1 } : g;
    const L = nose.frontLen + R;
    const profile = [...nose.profile];
    if (Math.abs(profile[profile.length - 1][1] - H) > 0.01) profile[profile.length - 1] = [nose.frontLen, H];
    profile.push([L, H]);
    return {
      kind: "vehicle",
      floor: [[0, 0], [W, 0], [W, L], [0, L]],
      height: H,
      profile,
      flatFromY: nose.frontLen,
      nose: { frontLen: nose.frontLen, noseZ: nose.noseZ, scale: nose.scale, mode: p.frontMode },
      obstacles: [],
      bounds: { minX: 0, minY: 0, maxX: W, maxY: L },
      walls: wallList(p),
      summary: `${W} × (${Math.round(nose.frontLen)} + ${R}) × ${H} mm`,
    };
  },
};

export const SPACE_KINDS = { box, vehicle };

export const PLANNED_SPACE_KINDS = [
  { id: "floorplan", label: "Floor plan", sub: "walls & openings from an imported plan" },
];

export function getSpaceKind(id) {
  const k = SPACE_KINDS[id];
  if (!k) throw new Error(`Unknown space kind: ${id}`);
  return k;
}

export function resolveSpace(space) {
  if (!space) return null;
  return getSpaceKind(space.kind).resolve(space.params);
}

// --- roof helpers ---------------------------------------------------------------------

/** Clear height under the roof at (x, y); `height` when the space has no profile. */
export function clearHeightAt(resolved, _x, y) {
  if (!resolved) return Infinity;
  const pr = resolved.profile;
  if (!pr || pr.length < 2) return resolved.height;
  if (y <= pr[0][0]) return pr[0][1];
  for (let i = 0; i < pr.length - 1; i += 1) {
    const [y0, z0] = pr[i];
    const [y1, z1] = pr[i + 1];
    if (y <= y1 + 1e-9) return y1 - y0 < 1e-9 ? Math.min(z0, z1) : z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
  }
  return pr[pr.length - 1][1];
}

/** Lowest clear height over the Y range [y0, y1] (the roof is piecewise linear: check the ends and the vertices inside). */
export function minClearHeight(resolved, y0, y1) {
  if (!resolved) return Infinity;
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  let m = Math.min(clearHeightAt(resolved, 0, lo), clearHeightAt(resolved, 0, hi));
  for (const [y, z] of resolved.profile || []) if (y > lo && y < hi) m = Math.min(m, z);
  return m;
}

/** Highest clear height over the Y range [y0, y1]. */
export function maxClearHeight(resolved, y0, y1) {
  if (!resolved) return Infinity;
  const lo = Math.min(y0, y1);
  const hi = Math.max(y0, y1);
  let m = Math.max(clearHeightAt(resolved, 0, lo), clearHeightAt(resolved, 0, hi));
  for (const [y, z] of resolved.profile || []) if (y > lo && y < hi) m = Math.max(m, z);
  return m;
}

/**
 * Intersection of an axis-aligned plane with the space: the outline used to
 * draw a construction plane, and its AABB `ext` for snap / picking.
 * Returns null when the plane misses the space.
 */
export function slicePlane(resolved, axis, value) {
  if (!resolved) return null;
  const b = resolved.bounds;
  const eps = 0.5;
  const pt = (x, y, z) => ({ x, y, z });
  if (axis === "x") {
    if (value < b.minX - eps || value > b.maxX + eps) return null;
    const v = Math.max(b.minX, Math.min(b.maxX, value));
    const roof = (y) => clearHeightAt(resolved, v, y);
    const outline = [pt(v, b.minY, 0), pt(v, b.maxY, 0), pt(v, b.maxY, roof(b.maxY))];
    const mid = (resolved.profile || []).filter(([y]) => y > b.minY + 0.01 && y < b.maxY - 0.01).slice().reverse();
    for (const [y, z] of mid) outline.push(pt(v, y, z));
    outline.push(pt(v, b.minY, roof(b.minY)));
    return { ext: { x: [v, v], y: [b.minY, b.maxY], z: [0, Math.max(...outline.map((p) => p.z))] }, outline };
  }
  if (axis === "y") {
    if (value < b.minY - eps || value > b.maxY + eps) return null;
    const v = Math.max(b.minY, Math.min(b.maxY, value));
    const z = clearHeightAt(resolved, b.minX, v);
    const outline = [pt(b.minX, v, 0), pt(b.maxX, v, 0), pt(b.maxX, v, z), pt(b.minX, v, z)];
    return { ext: { x: [b.minX, b.maxX], y: [v, v], z: [0, z] }, outline };
  }
  if (value < -eps || value > resolved.height + eps) return null;
  const v = Math.max(0, Math.min(resolved.height, value));
  const range = yRangeAtHeight(resolved, v);
  if (!range) return null;
  const [y0, y1] = range;
  const outline = [pt(b.minX, y0, v), pt(b.maxX, y0, v), pt(b.maxX, y1, v), pt(b.minX, y1, v)];
  return { ext: { x: [b.minX, b.maxX], y: [y0, y1], z: [v, v] }, outline };
}

/** Y span of the space where the roof is at least `z` (a horizontal slice). */
function yRangeAtHeight(resolved, z) {
  const b = resolved.bounds;
  const pts = [[b.minY, clearHeightAt(resolved, 0, b.minY)]];
  for (const p of resolved.profile || []) pts.push(p);
  pts.push([b.maxY, clearHeightAt(resolved, 0, b.maxY)]);
  let yLo = Infinity;
  let yHi = -Infinity;
  const consider = (y) => { yLo = Math.min(yLo, y); yHi = Math.max(yHi, y); };
  for (let i = 0; i < pts.length - 1; i += 1) {
    const [y0, z0] = pts[i];
    const [y1, z1] = pts[i + 1];
    if (z0 >= z) consider(y0);
    if (z1 >= z) consider(y1);
    if ((z0 >= z) !== (z1 >= z) && Math.abs(z1 - z0) > 1e-9) consider(y0 + ((z - z0) * (y1 - y0)) / (z1 - z0));
  }
  if (!Number.isFinite(yLo) || yHi - yLo < 1) return null;
  return [yLo, yHi];
}

/** Name of what stops a box growing up at this Y range: the flat ceiling or the sloped roof. */
export function roofName(resolved, y0, y1) {
  if (!resolved) return "ceiling";
  return minClearHeight(resolved, y0, y1) < resolved.height - 0.01 ? "roof" : "ceiling";
}

// --- geometry helpers used by interaction and checks -----------------------------

export function pointInPolygon(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    const intersects = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Is a point inside or on the boundary (within eps) of the polygon. */
export function pointInsideOrOn(x, y, poly, eps = 0.01) {
  if (pointInPolygon(x, y, poly)) return true;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    if (distToSegment(x, y, poly[j], poly[i]) <= eps) return true;
  }
  return false;
}

function distToSegment(px, py, [ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy || 1;
  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

/**
 * footprint: 4 world corners [[x,y],...]; zRange: [z0, z1].
 * Valid when every corner is inside the floor, no obstacle overlaps and the
 * top stays under the roof everywhere over the footprint.
 */
export function footprintFits(resolved, footprint, zRange) {
  if (!resolved) return true;
  for (const [x, y] of footprint) {
    if (!pointInsideOrOn(x, y, resolved.floor)) return false;
  }
  const xs = footprint.map((c) => c[0]);
  const ys = footprint.map((c) => c[1]);
  const fx0 = Math.min(...xs), fx1 = Math.max(...xs), fy0 = Math.min(...ys), fy1 = Math.max(...ys);
  for (const o of resolved.obstacles) {
    const overlap = fx0 < o.x1 && fx1 > o.x0 && fy0 < o.y1 && fy1 > o.y0 && zRange[0] < o.z1 && zRange[1] > o.z0;
    if (overlap) return false;
  }
  if (zRange[1] > minClearHeight(resolved, fy0, fy1) + 0.01) return false;
  return true;
}
