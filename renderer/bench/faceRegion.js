// @module bench @owns face-mode pick geometry
// Face mode geometry: which box face a pick landed on, the real extent of
// that face (from the board's outline, so a notch is not solid), and how much
// two coplanar faces overlap. Pure (no THREE), tested in node (rules.test.js).

const AXES = ["x", "y", "z"];

export function planeAxes(plane) {
  if (plane === "YZ") return ["y", "z", "x"];
  if (plane === "XZ") return ["x", "z", "y"];
  return ["x", "y", "z"];
}

/** Board-local outline (u, v from the box minimum), as model.ts reads it; null for a plain box. */
export function localOutline(b) {
  const [U, V] = planeAxes(b.profilePlane);
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector : null;
  let pts = null;
  if (b.profilePlane === "YZ") {
    if (pv) pts = pv.map((p) => [Number(p.y) - b.y0, Number(p.z) - b.z0]);
    else if (b.cutProfileVector && b.cutProfileVector.length >= 4) pts = b.cutProfileVector.map((p) => [p.y, p.z]);
  } else if (pv) {
    const mu = Math.min(...pv.map((p) => Number(p[U])));
    const mv = Math.min(...pv.map((p) => Number(p[V])));
    pts = pv.map((p) => [Number(p[U]) - mu, Number(p[V]) - mv]);
  }
  if (!pts) return null;
  const f = pts[0];
  const l = pts[pts.length - 1];
  if (pts.length > 2 && Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) pts = pts.slice(0, -1);
  return pts;
}

/**
 * The box face a pick landed on, or a reason it is not one.
 * @param normal world normal of the hit triangle  @param point world hit point
 */
/** Cabinet-frame outline points, or null for a plain box. */
function cabinetOutline(b) {
  const local = localOutline(b);
  if (!local) return null;
  const [U, V, T] = planeAxes(b.profilePlane);
  return local.map(([u, v]) => {
    const p = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 };
    p[U] = b[`${U}0`] + u;
    p[V] = b[`${V}0`] + v;
    p[T] = (b[`${T}0`] + b[`${T}1`]) / 2;
    return p;
  });
}

/** An axis-aligned outline edge the pick landed on (a notch or step), or null. */
function outlineEdge(b, axis, point, tol) {
  const [U, V, T] = planeAxes(b.profilePlane);
  if (axis === T) return null;
  const pts = cabinetOutline(b);
  if (!pts) return null;
  const along = axis === U ? V : U;
  let best = null;
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    if (Math.abs(p[axis] - q[axis]) > 1e-6) continue;
    if (Math.abs(point[axis] - p[axis]) > tol) continue;
    const lo = Math.min(p[along], q[along]);
    const hi = Math.max(p[along], q[along]);
    if (point[along] < lo - tol || point[along] > hi + tol) continue;
    // The face is the extrusion of this edge. A tongue can stand outside the box.
    const tLo = Math.min(b[`${T}0`], p[T], q[T]);
    const tHi = Math.max(b[`${T}1`], p[T], q[T]);
    if (point[T] < tLo - tol || point[T] > tHi + tol) continue;
    const span = hi - lo;
    if (!best || span < best.span[1] - best.span[0]) best = { value: p[axis], along, span: [lo, hi], cross: T, spanCross: [tLo, tHi], pocket: "notch" };
  }
  return best;
}

/**
 * A wall or floor of a half-slot (groove / T-groove) or a through opening.
 * These are machined into a big face; they are not outline edges.
 * Round holes are left out: a cylinder is not an axis plane.
 */
function featureFace(b, axis, point, tol) {
  const [U, V, T] = planeAxes(b.profilePlane);
  let best = null;
  const consider = (hit) => {
    const d = Math.abs(point[hit.axis] - hit.value);
    if (!best || d < best.d - 1e-9) best = { d, hit };
  };
  for (const face of b.faces || []) {
    if (face.id !== "A" && face.id !== "B") continue;
    for (const ft of face.features || []) {
      if (ft.kind !== "groove" && ft.kind !== "tgroove" && ft.kind !== "cutout") continue;
      if (![ft.u0, ft.u1, ft.v0, ft.v1].every((n) => Number.isFinite(n))) continue;
      const u0 = b[`${U}0`] + Math.min(ft.u0, ft.u1);
      const u1 = b[`${U}0`] + Math.max(ft.u0, ft.u1);
      const v0 = b[`${V}0`] + Math.min(ft.v0, ft.v1);
      const v1 = b[`${V}0`] + Math.max(ft.v0, ft.v1);
      if (u1 - u0 < 0.5 || v1 - v0 < 0.5) continue;
      const opening = ft.kind === "cutout" || ft.through || !(Number(ft.depth) > 0.2);
      const pocket = ft.kind === "cutout" ? "cutout" : "groove";
      const tOpen = face.id === "A" ? b[`${T}1`] : b[`${T}0`];
      const tFar = opening ? (face.id === "A" ? b[`${T}0`] : b[`${T}1`]) : (face.id === "A" ? tOpen - Number(ft.depth) : tOpen + Number(ft.depth));
      const tLo = Math.min(tOpen, tFar);
      const tHi = Math.max(tOpen, tFar);
      if (axis !== T) {
        const walls = [
          { axis: U, value: u0, along: V, span: [v0, v1] },
          { axis: U, value: u1, along: V, span: [v0, v1] },
          { axis: V, value: v0, along: U, span: [u0, u1] },
          { axis: V, value: v1, along: U, span: [u0, u1] },
        ];
        for (const w of walls) {
          if (w.axis !== axis || Math.abs(point[axis] - w.value) > tol) continue;
          if (point[w.along] < w.span[0] - tol || point[w.along] > w.span[1] + tol) continue;
          if (point[T] < tLo - tol || point[T] > tHi + tol) continue;
          consider({ ...w, cross: T, spanCross: [tLo, tHi], pocket, feature: ft.id });
        }
      } else if (!opening) {
        if (Math.abs(point[T] - tFar) > tol) continue;
        if (point[U] < u0 - tol || point[U] > u1 + tol || point[V] < v0 - tol || point[V] > v1 + tol) continue;
        consider({ axis: T, value: tFar, along: U, span: [u0, u1], cross: V, spanCross: [v0, v1], pocket, feature: ft.id });
      }
    }
  }
  return best ? best.hit : null;
}

export function faceAt(b, normal, point, tol = 0.5) {
  const a = AXES.reduce((m, k) => (Math.abs(normal[k]) > Math.abs(normal[m]) ? k : m), "x");
  if (Math.abs(normal[a]) < 0.995) return { error: "这是斜面或曲面：本轮只支持沿主轴的平面" };
  const side = normal[a] > 0 ? 1 : 0;
  const face = `${a}${side}`;
  if (Math.abs(point[a] - b[face]) <= tol) return { face, axis: a, side, value: b[face], notch: false };
  const hit = outlineEdge(b, a, point, tol) || featureFace(b, a, point, tol);
  if (!hit) return { error: "没有落到这块板沿主轴的一个面上" };
  return {
    face, axis: a, side, value: hit.value, notch: true, pocket: hit.pocket,
    along: hit.along, span: hit.span, cross: hit.cross, spanCross: hit.spanCross, feature: hit.feature,
  };
}

function inPolygon(pts, u, v) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i, i += 1) {
    const [ui, vi] = pts[i];
    const [uj, vj] = pts[j];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

/**
 * Where the board is solid on one of its box faces, in world coordinates.
 * Big face (normal along the thickness): the outline polygon. Edge face: the
 * outline edges lying on that side of the box, times the thickness.
 * @returns { axis, value, contains(p: {x,y,z}) → bool, bounds: { [axis]: [lo, hi] } }
 */
export function faceRegion(b, face) {
  const axis = face[0];
  const value = b[face];
  const [U, V, T] = planeAxes(b.profilePlane);
  const pts = localOutline(b);
  const others = AXES.filter((k) => k !== axis);
  const bounds = Object.fromEntries(others.map((k) => [k, [b[`${k}0`], b[`${k}1`]]]));
  if (axis === T) {
    const contains = pts
      ? (p) => inPolygon(pts, p[U] - b[`${U}0`], p[V] - b[`${V}0`])
      : (p) => p[U] >= b[`${U}0`] && p[U] <= b[`${U}1`] && p[V] >= b[`${V}0`] && p[V] <= b[`${V}1`];
    return { axis, value, contains, bounds };
  }
  // Edge face: axis is U or V. The solid runs along the other in-plane axis where outline edges lie on this side.
  const inPlane = axis === U ? 0 : 1;
  const along = axis === U ? V : U;
  const sideLocal = face.endsWith("0") ? 0 : b[`${axis}1`] - b[`${axis}0`];
  let intervals;
  if (!pts) intervals = [[b[`${along}0`], b[`${along}1`]]];
  else {
    intervals = [];
    for (let i = 0; i < pts.length; i += 1) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      if (Math.abs(p[inPlane] - sideLocal) < 1e-6 && Math.abs(q[inPlane] - sideLocal) < 1e-6) {
        const o = 1 - inPlane;
        const base = b[`${along}0`];
        intervals.push([Math.min(p[o], q[o]) + base, Math.max(p[o], q[o]) + base]);
      }
    }
  }
  const t0 = b[`${T}0`];
  const t1 = b[`${T}1`];
  const contains = (p) => p[T] >= t0 && p[T] <= t1 && intervals.some(([s, e]) => p[along] >= s && p[along] <= e);
  return { axis, value, contains, bounds, intervals };
}

/**
 * Overlap area (mm²) of two face regions on the same plane, sampled on a grid
 * over the intersection of their bounds. 0 when the planes differ.
 */
export function overlapArea(ra, rb, tol = 0.01, cells = 120) {
  if (ra.axis !== rb.axis || Math.abs(ra.value - rb.value) > tol) return 0;
  const [k1, k2] = AXES.filter((k) => k !== ra.axis);
  const lo1 = Math.max(ra.bounds[k1][0], rb.bounds[k1][0]);
  const hi1 = Math.min(ra.bounds[k1][1], rb.bounds[k1][1]);
  const lo2 = Math.max(ra.bounds[k2][0], rb.bounds[k2][0]);
  const hi2 = Math.min(ra.bounds[k2][1], rb.bounds[k2][1]);
  if (hi1 - lo1 <= tol || hi2 - lo2 <= tol) return 0;
  const n1 = Math.max(4, Math.min(cells, Math.ceil(hi1 - lo1)));
  const n2 = Math.max(4, Math.min(cells, Math.ceil(hi2 - lo2)));
  const d1 = (hi1 - lo1) / n1;
  const d2 = (hi2 - lo2) / n2;
  let hit = 0;
  const p = { x: 0, y: 0, z: 0 };
  p[ra.axis] = ra.value;
  for (let i = 0; i < n1; i += 1) {
    p[k1] = lo1 + (i + 0.5) * d1;
    for (let j = 0; j < n2; j += 1) {
      p[k2] = lo2 + (j + 0.5) * d2;
      if (ra.contains(p) && rb.contains(p)) hit += 1;
    }
  }
  return hit * d1 * d2;
}
