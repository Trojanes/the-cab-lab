// Board solids from generator output. Shared by the app (cabinets3d.js) and the
// generator bench so both draw the same board the same way. Display only: a
// board with an outline is extruded from it, otherwise it is its bounding box.
// A groove is a pocket of the feature's depth — the board is not a boolean,
// the pocket is just how that face feature is drawn.
import * as THREE from "three";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

function closedPath(points, map) {
  const pts = points.map(map);
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  return pts;
}
/** `holes` = closed outlines (same plane) cut out of the shape (a door in a partition, a notch). */
function shapeWithHoles(outline, holes, map) {
  const shape = new THREE.Shape(closedPath(outline, map));
  for (const h of holes || []) shape.holes.push(new THREE.Path(closedPath(h, map)));
  return shape;
}

/**
 * Solid from a closed YZ outline [{y, z}, ...] extruded across X from x0 to x1
 * (a board cut to the roof, the nose slab, a partition along the van).
 */
export function prismYZ(outline, x0, x1, holes = []) {
  const shape = shapeWithHoles(outline, holes, (p) => new THREE.Vector2(p.y, p.z));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(x1 - x0, 0.1), bevelEnabled: false });
  // Shape (u, v, w) → world (x0 + w, u, v): u along Y, v up, extrusion along X.
  geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, x0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return geo;
}

/** Solid from a closed XY outline [{x, y}, ...] extruded up Z from z0 to z1 (an OHC T3 with its LED notch). */
export function prismXY(outline, z0, z1, holes = []) {
  const shape = shapeWithHoles(outline, holes, (p) => new THREE.Vector2(p.x, p.y));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(z1 - z0, 0.1), bevelEnabled: false });
  geo.translate(0, 0, z0);
  return geo;
}

/** Solid from a closed XZ outline [{x, z}, ...] extruded along Y from y0 to y1 (an OHC T4 with its notches, a door). */
export function prismXZ(outline, y0, y1, holes = []) {
  // Shape (u, v) = (z, x) so the extrusion axis maps onto +Y without mirroring the solid.
  const shape = shapeWithHoles(outline, holes, (p) => new THREE.Vector2(p.z, p.x));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(y1 - y0, 0.1), bevelEnabled: false });
  // Shape (u, v, w) → world (v, y0 + w, u).
  geo.applyMatrix4(new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, y0, 1, 0, 0, 0, 0, 0, 0, 1));
  return geo;
}

/**
 * The outline a board is drawn from, in the cabinet frame, as [{a, b}, ...] in
 * its profile plane — or null when it is a plain box. YZ outlines are
 * cabinet-local already (or board-local `cutProfileVector`, shifted by y0/z0);
 * XY / XZ outlines are aligned so their minimum meets the board's bounding
 * box (`_align_body_axis_min`).
 */
function xyShift(b) {
  const pv = b.profileVector;
  if (!pv || pv.length < 4) return { dx: 0, dy: 0 };
  return {
    dx: b.x0 - Math.min(...pv.map((p) => p.x)),
    dy: b.y0 - Math.min(...pv.map((p) => p.y)),
  };
}

export function boardHoles(b) {
  if (b.profilePlane !== "XY" || b.thicknessAxis !== "Z" || !b.profileHoles) return [];
  const { dx, dy } = xyShift(b);
  return b.profileHoles.map((hole) => hole.map((p) => ({ x: p.x + dx, y: p.y + dy })));
}

export function boardOutline(b) {
  const plane = b.profilePlane;
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector : null;
  if (plane === "YZ" && b.thicknessAxis === "X") {
    if (pv) return pv.map((p) => ({ y: p.y, z: p.z }));
    if (b.cutProfileVector && b.cutProfileVector.length >= 4) return b.cutProfileVector.map((p) => ({ y: b.y0 + p.y, z: b.z0 + p.z }));
    return null;
  }
  if (plane === "XY" && b.thicknessAxis === "Z" && pv) {
    const { dx, dy } = xyShift(b);
    return pv.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
  if (plane === "XZ" && b.thicknessAxis === "Y" && pv) {
    const dx = b.x0 - Math.min(...pv.map((p) => p.x));
    const dz = b.z0 - Math.min(...pv.map((p) => p.z));
    return pv.map((p) => ({ x: p.x + dx, z: p.z + dz }));
  }
  return null;
}

function shiftXY(points, dx, dy) {
  return points.map((p) => ({ x: p.x + dx, y: p.y + dy }));
}

const AXES_OF = { YZ: ["y", "z", "x"], XZ: ["x", "z", "y"], XY: ["x", "y", "z"] };

/** Ray-cast point-in-polygon in the board's profile plane; `poly` and the point use the same axis keys. */
function insideOutline(poly, U, V, u, v) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const ui = poly[i][U], vi = poly[i][V], uj = poly[j][U], vj = poly[j][V];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / (vj - vi) + ui) inside = !inside;
  }
  return inside;
}

/**
 * Grooves / T-grooves on one big face, as closed loops in the cabinet frame.
 * `outline` (when the board has one) drops any loop that would leave the board —
 * a pocket cannot open into a notch; the groove marks still show it.
 */
function grooveLoops(b, faceId, outline = null) {
  const face = (b.faces || []).find((f) => f.id === faceId);
  if (!face) return [];
  const [U, V] = AXES_OF[b.profilePlane] || AXES_OF.XY;
  const U0 = b[`${U}0`], U1 = b[`${U}1`], V0 = b[`${V}0`], V1 = b[`${V}1`];
  const loops = [];
  for (const ft of face.features || []) {
    if ((ft.kind !== "groove" && ft.kind !== "tgroove") || ft.through) continue;
    if (!Number.isFinite(ft.u0) || !Number.isFinite(ft.v0) || !(ft.depth > 0.2)) continue;
    let u0 = b[`${U}0`] + Math.min(ft.u0, ft.u1);
    let u1 = b[`${U}0`] + Math.max(ft.u0, ft.u1);
    let v0 = b[`${V}0`] + Math.min(ft.v0, ft.v1);
    let v1 = b[`${V}0`] + Math.max(ft.v0, ft.v1);
    // A hole that touches the board edge is not a hole. Pull it just inside.
    const land = 0.4;
    if (u0 <= U0 + 0.3) u0 = U0 + land;
    if (u1 >= U1 - 0.3) u1 = U1 - land;
    if (v0 <= V0 + 0.3) v0 = V0 + land;
    if (v1 >= V1 - 0.3) v1 = V1 - land;
    if (u1 - u0 < 0.8 || v1 - v0 < 0.8) continue;
    if (outline) {
      const corners = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
      // Test a hair inside each corner so a loop flush with the outline edge still counts as inside.
      const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2;
      const ok = corners.every(([u, v]) => insideOutline(outline, U, V, u + Math.sign(cu - u) * 0.2, v + Math.sign(cv - v) * 0.2));
      if (!ok) continue;
    }
    loops.push({ depth: ft.depth, u0, u1, v0, v1 });
  }
  const p = (u, v) => (b.profilePlane === "XY" ? { x: u, y: v } : b.profilePlane === "XZ" ? { x: u, z: v } : { y: u, z: v });
  return mergeTGrooves(loops).map((g) => ({ depth: g.depth, loop: g.pts.map(([u, v]) => p(u, v)) }));
}

/**
 * Rectangles that touch edge to edge (a T-groove: the main channel and the
 * branches that start on its back wall) become one outline, so the cap has one
 * hole instead of two holes sharing an edge — which the triangulation drops.
 */
function mergeTGrooves(rects) {
  const eq = (a, c) => Math.abs(a - c) < 0.05;
  const used = new Set();
  const out = [];
  for (let i = 0; i < rects.length; i += 1) {
    if (used.has(i)) continue;
    const s = rects[i];
    const behind = []; // branches starting on the stem's v1 wall
    const ahead = []; // branches ending on the stem's v0 wall
    for (let j = 0; j < rects.length; j += 1) {
      if (j === i || used.has(j)) continue;
      const r = rects[j];
      if (!eq(r.depth, s.depth) || r.u0 < s.u0 - 0.05 || r.u1 > s.u1 + 0.05) continue;
      if (eq(r.v0, s.v1)) behind.push(j);
      else if (eq(r.v1, s.v0)) ahead.push(j);
    }
    if (!behind.length && !ahead.length) {
      out.push({ depth: s.depth, pts: [[s.u0, s.v0], [s.u1, s.v0], [s.u1, s.v1], [s.u0, s.v1]] });
      continue;
    }
    used.add(i);
    for (const j of [...behind, ...ahead]) used.add(j);
    const pts = [];
    // Counter-clockwise: along v0 from u0 to u1 (dipping into the branches ahead), up the u1 side,
    // back along v1 from u1 to u0 (rising into the branches behind), down the u0 side.
    pts.push([s.u0, s.v0]);
    for (const j of ahead.sort((a, c) => rects[a].u0 - rects[c].u0)) {
      const r = rects[j];
      pts.push([r.u0, s.v0], [r.u0, r.v0], [r.u1, r.v0], [r.u1, s.v0]);
    }
    pts.push([s.u1, s.v0], [s.u1, s.v1]);
    for (const j of behind.sort((a, c) => rects[c].u1 - rects[a].u1)) {
      const r = rects[j];
      pts.push([r.u1, s.v1], [r.u1, r.v1], [r.u0, r.v1], [r.u0, s.v1]);
    }
    pts.push([s.u0, s.v1]);
    // Drop repeated points (a branch flush with the stem's end).
    const clean = pts.filter((q, k) => k === 0 || !(eq(q[0], pts[k - 1][0]) && eq(q[1], pts[k - 1][1])));
    if (eq(clean[0][0], clean[clean.length - 1][0]) && eq(clean[0][1], clean[clean.length - 1][1])) clean.pop();
    out.push({ depth: s.depth, pts: clean });
  }
  return out;
}

function boxOutline(b) {
  if (b.profilePlane === "XY") return [{ x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }];
  if (b.profilePlane === "XZ") return [{ x: b.x0, z: b.z0 }, { x: b.x1, z: b.z0 }, { x: b.x1, z: b.z1 }, { x: b.x0, z: b.z1 }];
  return [{ y: b.y0, z: b.z0 }, { y: b.y1, z: b.z0 }, { y: b.y1, z: b.z1 }, { y: b.y0, z: b.z1 }];
}

function extrudeSlab(b, outline, holes, t0, t1) {
  if (b.profilePlane === "XY") return prismXY(outline, t0, t1, holes);
  if (b.profilePlane === "XZ") return prismXZ(outline, t0, t1, holes);
  return prismYZ(outline, t0, t1, holes);
}

/**
 * A board with grooves: the uncut core, plus a cap on each machined face whose
 * thickness is the groove depth and whose holes are the grooves. Looking at
 * that face, the core shows through — the pocket floor. Works on a plain box
 * and on an outlined board (a T3 with its LED channels) alike.
 */
function pocketGeometry(b) {
  const shaped = boardOutline(b);
  const onA = grooveLoops(b, "A", shaped);
  const onB = grooveLoops(b, "B", shaped);
  if (!onA.length && !onB.length) return null;
  const [, , T] = AXES_OF[b.profilePlane] || AXES_OF.XY;
  const t0 = b[`${T}0`], t1 = b[`${T}1`];
  const thick = t1 - t0;
  const depthA = onA.length ? Math.min(Math.max(...onA.map((g) => g.depth)), thick - 0.6) : 0;
  const depthB = onB.length ? Math.min(Math.max(...onB.map((g) => g.depth)), thick - depthA - 0.6) : 0;
  if (!(depthA > 0.2) && !(depthB > 0.2)) return null;
  const outline = shaped || boxOutline(b);
  const geos = [];
  const mid0 = t0 + depthB;
  const mid1 = t1 - depthA;
  if (mid1 - mid0 > 0.2) geos.push(extrudeSlab(b, outline, [], mid0, mid1));
  if (depthA > 0.2) geos.push(extrudeSlab(b, outline, onA.map((g) => g.loop), mid1, t1));
  if (depthB > 0.2) geos.push(extrudeSlab(b, outline, onB.map((g) => g.loop), t0, t0 + depthB));
  const merged = mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false);
  if (!merged) return null;
  const welded = mergeVertices(merged, 0.05);
  welded.computeVertexNormals();
  return welded;
}

/**
 * Through cutouts on the big faces (a mortise, a lock slot) as closed loops in
 * the cabinet frame. A `radius` rounds the corners; radius = half the short
 * side is a stadium.
 */
function throughLoops(b) {
  const [U, V] = AXES_OF[b.profilePlane] || AXES_OF.XY;
  const p = (u, v) => (b.profilePlane === "XY" ? { x: u, y: v } : b.profilePlane === "XZ" ? { x: u, z: v } : { y: u, z: v });
  const loops = [];
  for (const face of b.faces || []) {
    if (face.id !== "A" && face.id !== "B") continue;
    for (const ft of face.features || []) {
      if (ft.kind !== "cutout" || !ft.through || !Number.isFinite(ft.u0) || !Number.isFinite(ft.v0)) continue;
      const u0 = b[`${U}0`] + Math.min(ft.u0, ft.u1);
      const u1 = b[`${U}0`] + Math.max(ft.u0, ft.u1);
      const v0 = b[`${V}0`] + Math.min(ft.v0, ft.v1);
      const v1 = b[`${V}0`] + Math.max(ft.v0, ft.v1);
      if (u1 - u0 < 0.5 || v1 - v0 < 0.5) continue;
      const r = Math.max(0, Math.min(Number(ft.radius) || 0, (u1 - u0) / 2, (v1 - v0) / 2));
      if (r < 0.05) { loops.push([p(u0, v0), p(u1, v0), p(u1, v1), p(u0, v1)]); continue; }
      const pts = [];
      const corner = (cu, cv, a0) => {
        for (let i = 0; i <= 8; i += 1) {
          const a = a0 + (Math.PI / 2) * (i / 8);
          pts.push(p(cu + r * Math.cos(a), cv + r * Math.sin(a)));
        }
      };
      corner(u1 - r, v0 + r, -Math.PI / 2);
      corner(u1 - r, v1 - r, 0);
      corner(u0 + r, v1 - r, Math.PI / 2);
      corner(u0 + r, v0 + r, Math.PI);
      loops.push(pts);
    }
  }
  return loops;
}

/**
 * Board solid: its outline extruded through its thickness when it has one,
 * else a plain box. Grooves are pockets of the recorded depth; through
 * cutouts are holes in the extrusion.
 */
export function boardGeometry(b) {
  if (b.profilePlane === "XY" && b.thicknessAxis === "Z" && b.slabs && b.slabs.length) {
    const { dx, dy } = xyShift(b);
    const geos = b.slabs.map((slab) => prismXY(
      shiftXY(slab.outline, dx, dy),
      slab.z0,
      slab.z1,
      (slab.holes || []).map((hole) => shiftXY(hole, dx, dy)),
    ));
    // Weld the hole's triangulation so a half-depth step does not leave a
    // crease across the face. The hole itself stays: only coincident vertices merge.
    const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
    if (!merged) return { geo: null, cut: true };
    const welded = mergeVertices(merged, 1e-4);
    welded.computeVertexNormals();
    return { geo: welded, cut: true };
  }
  const pocket = pocketGeometry(b);
  if (pocket) return { geo: pocket, cut: true };
  const holes = throughLoops(b);
  const outline = boardOutline(b) || (holes.length ? boxOutline(b) : null);
  if (!outline) return { geo: null, cut: false };
  if (b.profilePlane === "YZ") return { geo: prismYZ(outline, b.x0, b.x1, holes), cut: true };
  if (b.profilePlane === "XY") return { geo: prismXY(outline, b.z0, b.z1, holes), cut: true };
  return { geo: prismXZ(outline, b.y0, b.y1, holes), cut: true };
}

/**
 * Highlight sheet for one face of a board (cabinet frame), `thick` mm proud of
 * the face so it reads over the board. A / B: the board's outline (or box) as a
 * thin slab on that side; E<i>: a quad along the outline edge through the
 * thickness. Display only — nothing here changes the board.
 */
export function faceSheetGeometry(b, face, thick = 1.5) {
  const [U, V, T] = AXES_OF[b.profilePlane] || AXES_OF.XY;
  const t0 = b[`${T}0`], t1 = b[`${T}1`];
  if (face.id === "A" || face.id === "B") {
    const lo = face.id === "A" ? t1 : t0 - thick;
    const hi = lo + thick;
    const outline = boardOutline(b);
    if (outline) {
      if (b.profilePlane === "YZ") return prismYZ(outline, lo, hi);
      if (b.profilePlane === "XY") return prismXY(outline, lo, hi);
      return prismXZ(outline, lo, hi);
    }
    const r = { x: [b.x0, b.x1], y: [b.y0, b.y1], z: [b.z0, b.z1] };
    r[T] = [lo, hi];
    const geo = new THREE.BoxGeometry(r.x[1] - r.x[0], r.y[1] - r.y[0], r.z[1] - r.z[0]);
    geo.translate((r.x[0] + r.x[1]) / 2, (r.y[0] + r.y[1]) / 2, (r.z[0] + r.z[1]) / 2);
    return geo;
  }
  if (!face.edge) return null;
  // Edge face: board-local (u, v) → cabinet frame, a quad spanning the thickness (a touch over),
  // pushed `thick / 2` out along the edge's outward normal so it sits proud of the board's side.
  const n = { x: 0, y: 0, z: 0 };
  if (typeof face.normal === "string") n[face.normal[1].toLowerCase()] = face.normal[0] === "+" ? 1 : -1;
  else if (Array.isArray(face.normal)) { n.x = face.normal[0]; n.y = face.normal[1]; n.z = face.normal[2]; }
  const push = thick / 2;
  const toCab = (u, v, t) => {
    const p = { x: 0, y: 0, z: 0 };
    p[U] = b[`${U}0`] + u;
    p[V] = b[`${V}0`] + v;
    p[T] = t;
    return [p.x + n.x * push, p.y + n.y * push, p.z + n.z * push];
  };
  const a0 = toCab(face.edge.from[0], face.edge.from[1], t0 - push);
  const a1 = toCab(face.edge.to[0], face.edge.to[1], t0 - push);
  const b1 = toCab(face.edge.to[0], face.edge.to[1], t1 + push);
  const b0 = toCab(face.edge.from[0], face.edge.from[1], t1 + push);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute([...a0, ...a1, ...b1, ...a0, ...b1, ...b0], 3));
  geo.computeVertexNormals();
  return geo;
}

export function boxMesh(x0, x1, y0, y1, z0, z1, mat) {
  const geo = new THREE.BoxGeometry(Math.max(x1 - x0, 0.1), Math.max(y1 - y0, 0.1), Math.max(z1 - z0, 0.1));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return mesh;
}

/** Edge lines of the board outline only. A groove is a hole in the solid; edging that mesh also draws the triangulator's bridge from the hole out to the rim. */
function outlineSolid(b) {
  if (b.profilePlane === "XY" && b.thicknessAxis === "Z" && b.slabs && b.slabs.length) {
    const { dx, dy } = xyShift(b);
    const geos = b.slabs.map((slab) => prismXY(shiftXY(slab.outline, dx, dy), slab.z0, slab.z1));
    return geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
  }
  const outline = boardOutline(b);
  if (!outline) return null;
  if (b.profilePlane === "YZ") return prismYZ(outline, b.x0, b.x1);
  if (b.profilePlane === "XY") return prismXY(outline, b.z0, b.z1);
  return prismXZ(outline, b.y0, b.y1);
}

export function boardEdges(b, mat) {
  const solid = outlineSolid(b);
  if (!solid) return boxEdges(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, mat);
  return new THREE.LineSegments(new THREE.EdgesGeometry(solid), mat);
}

export function boxEdges(x0, x1, y0, y1, z0, z1, mat) {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0));
  const lines = new THREE.LineSegments(geo, mat);
  lines.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return lines;
}

/** Mesh + edge lines for one board (cabinet frame). `userData` is left to the caller. */
export function boardMesh(b, mat, edgeMat) {
  const { geo, cut } = boardGeometry(b);
  const mesh = cut ? new THREE.Mesh(geo, mat) : boxMesh(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, mat);
  const edges = boardEdges(b, edgeMat);
  return { mesh, edges, cut };
}
