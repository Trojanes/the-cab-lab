// Space registry. Like cabinets, a space is `kind + params` resolved into
// geometry the renderer and interaction layer consume:
//   floor      polygon [[x, y], ...] in mm, counter-clockwise, origin at the
//              front-left corner (X right, Y back, Z up)
//   height     clear height in mm
//   obstacles  boxes inside the floor that cabinets must not overlap
//              (wheel arches, columns) – empty for a plain box
//   bounds     XY AABB of the floor, for quick clamping
// Later kinds (vehicle, floorplan) plug in here without touching the renderer.

const box = {
  id: "box",
  label: "Box",
  sub: "W × D × H room",
  defaults: () => ({ width: 4000, depth: 3000, height: 2400, walls: [0, 1, 2, 3] }),
  fields: [
    { key: "width", label: "Width (mm)", min: 300 },
    { key: "depth", label: "Depth (mm)", min: 300 },
    { key: "height", label: "Height (mm)", min: 300 },
    { key: "walls", type: "walls", label: "Walls" },
  ],
  validate(p) {
    const errors = [];
    for (const f of this.fields) {
      if (f.type === "walls") continue;
      const v = Number(p[f.key]);
      if (!Number.isFinite(v) || v < f.min) errors.push(`${f.label} must be at least ${f.min}.`);
    }
    return errors;
  },
  resolve(p) {
    const W = Number(p.width);
    const D = Number(p.depth);
    const H = Number(p.height);
    return {
      kind: "box",
      floor: [[0, 0], [W, 0], [W, D], [0, D]],
      height: H,
      obstacles: [],
      bounds: { minX: 0, minY: 0, maxX: W, maxY: D },
      // Floor edges that get a wall: 0 front, 1 right, 2 back, 3 left.
      walls: Array.isArray(p.walls) ? p.walls.map(Number).filter((i) => i >= 0 && i <= 3) : [0, 1, 2, 3],
      summary: `${W} × ${D} × ${H} mm`,
    };
  },
};

export const SPACE_KINDS = { box };

export const PLANNED_SPACE_KINDS = [
  { id: "vehicle", label: "Vehicle", sub: "from a van / truck body library" },
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
 * Valid when every corner is inside the floor and no obstacle overlaps.
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
  if (zRange[1] > resolved.height + 0.01) return false;
  return true;
}
