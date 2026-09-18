// Board solids from generator output. Shared by the app (cabinets3d.js) and the
// generator bench so both draw the same board the same way. Display only: a
// board with an outline is extruded from it, otherwise it is its bounding box.
import * as THREE from "three";

/**
 * Solid from a closed YZ outline [{y, z}, ...] extruded across X from x0 to x1
 * (a board cut to the roof, or the nose slab itself).
 */
export function prismYZ(outline, x0, x1) {
  const pts = outline.map((p) => new THREE.Vector2(p.y, p.z));
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(x1 - x0, 0.1), bevelEnabled: false });
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
export function prismXZ(outline, y0, y1) {
  // Shape (u, v) = (z, x) so the extrusion axis maps onto +Y without mirroring the solid.
  const pts = outline.map((p) => new THREE.Vector2(p.z, p.x));
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(y1 - y0, 0.1), bevelEnabled: false });
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
