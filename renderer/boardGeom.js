// Board solids from generator output. Shared by the app (cabinets3d.js) and the
// generator bench so both draw the same board the same way. Display only: a
// board with an outline is extruded from it, otherwise it is its bounding box.
import * as THREE from "three";

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
export function prismXY(outline, z0, z1) {
  const pts = outline.map((p) => new THREE.Vector2(p.x, p.y));
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(z1 - z0, 0.1), bevelEnabled: false });
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
 * box, like the Fusion adapter does (`_align_body_axis_min`).
 */
export function boardOutline(b) {
  const plane = b.profilePlane;
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector : null;
  if (plane === "YZ" && b.thicknessAxis === "X") {
    if (pv) return pv.map((p) => ({ y: p.y, z: p.z }));
    if (b.cutProfileVector && b.cutProfileVector.length >= 4) return b.cutProfileVector.map((p) => ({ y: b.y0 + p.y, z: b.z0 + p.z }));
    return null;
  }
  if (plane === "XY" && b.thicknessAxis === "Z" && pv) {
    const dx = b.x0 - Math.min(...pv.map((p) => p.x));
    const dy = b.y0 - Math.min(...pv.map((p) => p.y));
    return pv.map((p) => ({ x: p.x + dx, y: p.y + dy }));
  }
  if (plane === "XZ" && b.thicknessAxis === "Y" && pv) {
    const dx = b.x0 - Math.min(...pv.map((p) => p.x));
    const dz = b.z0 - Math.min(...pv.map((p) => p.z));
    return pv.map((p) => ({ x: p.x + dx, z: p.z + dz }));
  }
  return null;
}

/**
 * Board solid: its outline extruded through its thickness when it has one,
 * else `{ geo: null, cut: false }` (draw the bounding box).
 */
export function boardGeometry(b) {
  const outline = boardOutline(b);
  if (!outline) return { geo: null, cut: false };
  if (b.profilePlane === "YZ") return { geo: prismYZ(outline, b.x0, b.x1), cut: true };
  if (b.profilePlane === "XY") return { geo: prismXY(outline, b.z0, b.z1), cut: true };
  return { geo: prismXZ(outline, b.y0, b.y1), cut: true };
}

const AXES_OF = { YZ: ["y", "z", "x"], XZ: ["x", "z", "y"], XY: ["x", "y", "z"] };

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
  const edges = cut ? new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat) : boxEdges(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, edgeMat);
  return { mesh, edges, cut };
}
