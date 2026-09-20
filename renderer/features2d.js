// Feature edges and points of the floor plan. A partition wall is drawn from
// features, never from free coordinates:
//   a feature edge  = a vertical face seen from above — a wall of the space,
//                     a face or end of a partition, a side of a cabinet
//   a feature point = an end of a feature edge (corners, and the points where
//                     one solid meets another)
// Every solid that touches an edge splits it: the back wall with two
// partitions standing against it becomes three edges, and the middle one is
// the source for the wall that closes the room between them. The part of an
// edge covered by a solid is not an edge any more.
//
// Edge: { id, parent, kind, source, axis, at, dir, along, u0, u1, label }
//   axis   the face normal ("y" for the back wall), at = its coordinate
//   dir    ±1, the way that leaves the solid (into the room)
//   along  the horizontal axis the edge runs along; u0 < u1 its span
//   parent id of the unsplit face (method 2 offsets the whole face)
import { wallSolid } from "./walls.js";

const EPS = 0.5;
export const FEATURE_KEY = (x, y) => `${Math.round(x * 10)}|${Math.round(y * 10)}`;

const SPACE_EDGES = [
  // floor edge index → { axis, side of bounds, dir into the room, label }
  { idx: 0, axis: "y", bound: "minY", dir: 1, label: "Front wall" },
  { idx: 1, axis: "x", bound: "maxX", dir: -1, label: "Right wall" },
  { idx: 2, axis: "y", bound: "maxY", dir: -1, label: "Back wall" },
  { idx: 3, axis: "x", bound: "minX", dir: 1, label: "Left wall" },
];

function other(axis) {
  return axis === "x" ? "y" : "x";
}

/** Solids as { id, kind, x:[..], y:[..], label } from the job. */
export function planSolids({ resolved, walls, cabinets, stock }) {
  const out = [];
  for (const w of walls) {
    const s = wallSolid(w, resolved, stock);
    out.push({ id: w.id, kind: "wall", x: [s.x0, s.x1], y: [s.y0, s.y1], label: w.id, solid: s });
  }
  for (const c of cabinets) out.push({ id: c.id, kind: "cabinet", x: c.x, y: c.y, label: c.id, cab: c });
  return out;
}

function facesOf(solid) {
  const out = [];
  const f = (axis, at, dir, label) => out.push({ axis, at, dir, along: other(axis), u0: solid[other(axis)][0], u1: solid[other(axis)][1], label });
  f("x", solid.x[0], -1, `${solid.label} −X face`);
  f("x", solid.x[1], +1, `${solid.label} +X face`);
  f("y", solid.y[0], -1, `${solid.label} −Y face`);
  f("y", solid.y[1], +1, `${solid.label} +Y face`);
  return out;
}

/**
 * All feature edges (split) and points for the current plan.
 * Returns { edges, points:[{x, y, sources:[edgeId]}], solids }.
 */
export function buildFeatures({ resolved, walls, cabinets, stock }) {
  const solids = planSolids({ resolved, walls, cabinets, stock });
  const raw = [];
  if (resolved) {
    const b = resolved.bounds;
    const has = new Set(resolved.walls || []);
    for (const e of SPACE_EDGES) {
      if (!has.has(e.idx)) continue;
      const along = other(e.axis);
      raw.push({
        id: `space:${e.idx}`, parent: `space:${e.idx}`, kind: "space", source: "space",
        axis: e.axis, at: b[e.bound], dir: e.dir, along,
        u0: along === "x" ? b.minX : b.minY, u1: along === "x" ? b.maxX : b.maxY, label: e.label,
      });
    }
  }
  for (const s of solids) {
    for (const f of facesOf(s)) {
      const id = `${s.id}:${f.axis}${f.dir > 0 ? "+" : "-"}`;
      raw.push({ id, parent: id, kind: s.kind, source: s.id, ...f });
    }
  }

  const edges = [];
  for (const e of raw) {
    const touching = solids.filter((s) => s.id !== e.source
      && s[e.axis][0] <= e.at + EPS && s[e.axis][1] >= e.at - EPS
      && s[e.along][0] < e.u1 - EPS && s[e.along][1] > e.u0 + EPS);
    const cuts = new Set([e.u0, e.u1]);
    for (const s of touching) for (const u of s[e.along]) if (u > e.u0 + EPS && u < e.u1 - EPS) cuts.add(u);
    const us = [...cuts].sort((a, b) => a - b);
    let n = 0;
    for (let i = 0; i < us.length - 1; i += 1) {
      const a = us[i];
      const b = us[i + 1];
      if (b - a < 1) continue;
      const mid = (a + b) / 2;
      if (touching.some((s) => s[e.along][0] < mid && s[e.along][1] > mid)) continue; // covered by a solid
      edges.push({ ...e, id: us.length > 2 ? `${e.id}#${n}` : e.id, u0: a, u1: b });
      n += 1;
    }
  }

  const pts = new Map();
  const addPt = (x, y, id) => {
    const k = FEATURE_KEY(x, y);
    let p = pts.get(k);
    if (!p) { p = { x, y, sources: [] }; pts.set(k, p); }
    p.sources.push(id);
  };
  for (const e of edges) {
    for (const u of [e.u0, e.u1]) {
      if (e.along === "x") addPt(u, e.at, e.id);
      else addPt(e.at, u, e.id);
    }
  }
  // Door jambs: both sides of every opening, on both faces of its wall (a cabinet can stand up to a door edge).
  for (const s of solids) {
    if (s.kind !== "wall") continue;
    for (const o of s.solid.openings) {
      for (const u of [o.u0, o.u1]) {
        if (s.solid.along === "x") { addPt(u, s.y[0], `${s.id}:door`); addPt(u, s.y[1], `${s.id}:door`); }
        else { addPt(s.x[0], u, `${s.id}:door`); addPt(s.x[1], u, `${s.id}:door`); }
      }
    }
  }
  return { edges, points: [...pts.values()], solids };
}

/** Distance (mm) from a plan point to an edge segment. */
export function distToEdge(p, e) {
  const u = e.along === "x" ? p.x : p.y;
  const v = e.along === "x" ? p.y : p.x;
  const du = u < e.u0 ? e.u0 - u : u > e.u1 ? u - e.u1 : 0;
  return Math.hypot(du, v - e.at);
}

/** Nearest edge within `tol` mm; `filter(e)` may reject edges. */
export function nearestEdge(p, edges, tol, filter = null) {
  let best = null;
  let bestD = tol;
  for (const e of edges) {
    if (filter && !filter(e)) continue;
    const d = distToEdge(p, e);
    if (d < bestD) { bestD = d; best = e; }
  }
  return best;
}

/** Coordinate of a plan point along an edge, clamped to the edge. */
export function projectOnEdge(p, e) {
  const u = e.along === "x" ? p.x : p.y;
  return Math.min(e.u1, Math.max(e.u0, u));
}

/** Plan point at `u` along edge `e`. */
export function pointOnEdge(e, u) {
  return e.along === "x" ? { x: u, y: e.at } : { x: e.at, y: u };
}

/** Feature points lying on edge `e` (its ends and every split point), as `u` values. */
export function featureUsOnEdge(e, points) {
  const out = [];
  for (const p of points) {
    const v = e.along === "x" ? p.y : p.x;
    if (Math.abs(v - e.at) > EPS) continue;
    const u = e.along === "x" ? p.x : p.y;
    if (u < e.u0 - EPS || u > e.u1 + EPS) continue;
    out.push(u);
  }
  return out;
}