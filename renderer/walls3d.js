// Displays job.walls: each partition wall as one board cut to the roof, with
// its edges; the selected wall is outlined blue, an illegal one red. Nothing
// here changes geometry — walls are drawn in the floor plan (floorplan.js) and
// edited through job.js.
import * as THREE from "three";
import { scene } from "./space.js";
import { getJob, getWalls, getSelectedId, getSpace, getStock } from "./job.js";
import { prismYZ, prismXZ } from "./boardGeom.js";
import { wallSolid, wallStatus, wallBoxes, allWallParts } from "./walls.js";
import { envelopeFootprint } from "./cabinets3d.js";

// White Stipple partition stock: lighter than the tan carcass so a wall reads as a wall.
const wallMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.85 });
const wallMatBad = new THREE.MeshStandardMaterial({ color: 0xd94b4b, roughness: 0.85, transparent: true, opacity: 0.5 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x5a6270 });
const edgeMatSel = new THREE.LineBasicMaterial({ color: 0x4f86e0 });
const edgeMatBad = new THREE.LineBasicMaterial({ color: 0xd94b4b });

const root = new THREE.Group();
root.name = "walls";
scene.add(root);

const groups = new Map(); // wallId -> Group

/**
 * Every other solid (other walls, their sliding-door leaves / pelmets, and
 * cabinets) as boxes, for legality checks. A wall's own parts leave with it.
 */
export function solidBoxes({ excludeWall = null } = {}) {
  const sp = getSpace();
  const stock = getStock();
  const walls = getWalls();
  const boxes = wallBoxes(walls.filter((w) => w.id !== excludeWall), sp, stock);
  boxes.push(...allWallParts(walls, sp, stock).filter((p) => p.wallId !== excludeWall));
  for (const cab of getJob().cabinets) {
    const fp = envelopeFootprint(cab, cab.pose);
    boxes.push({ id: cab.id, kind: "cabinet", x: [fp.minX, fp.maxX], y: [fp.minY, fp.maxY], z: [fp.z0, fp.z1] });
  }
  return boxes;
}

/** Legality of one wall against the current job (see walls.js wallStatus). */
export function statusOf(wall) {
  const sp = getSpace();
  const stock = getStock();
  return wallStatus(wall, {
    resolved: sp,
    stock,
    boxes: solidBoxes({ excludeWall: wall.id }),
    anchorBoxes: wallBoxes(getWalls().filter((w) => w.id !== wall.id), sp, stock),
  });
}

function buildGroup(wall) {
  const sp = getSpace();
  const solid = wallSolid(wall, sp, getStock());
  const st = statusOf(wall);
  const selected = wall.id === getSelectedId();
  const g = new THREE.Group();
  g.name = wall.id;
  // The wall is a board in the plane of its face (with its door holes), extruded across its thickness.
  const geo = wall.axis === "x"
    ? prismYZ(solid.outline.map((p) => ({ y: p.u, z: p.z })), solid.x0, solid.x1, solid.holes.map((h) => h.map((p) => ({ y: p.u, z: p.z }))))
    : prismXZ(solid.outline.map((p) => ({ x: p.u, z: p.z })), solid.y0, solid.y1, solid.holes.map((h) => h.map((p) => ({ x: p.u, z: p.z }))));
  const mesh = new THREE.Mesh(geo, st.ok ? wallMat : wallMatBad);
  mesh.userData = { kind: "wall", wallId: wall.id };
  g.add(mesh);
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), !st.ok ? edgeMatBad : selected ? edgeMatSel : edgeMat);
  edges.renderOrder = selected ? 6 : 1;
  g.add(edges);
  // Sliding doors: the leaf and the pelmet are boards parallel to the wall (walls.js openingParts).
  for (const p of st.parts || []) {
    const pg = wall.axis === "x"
      ? prismYZ(p.outline.map((q) => ({ y: q.u, z: q.z })), p.x0, p.x1)
      : prismXZ(p.outline.map((q) => ({ x: q.u, z: q.z })), p.y0, p.y1);
    const pm = new THREE.Mesh(pg, st.ok ? wallMat : wallMatBad);
    pm.userData = { kind: "wall", wallId: wall.id, part: p.part, opId: p.opId };
    g.add(pm);
    const pe = new THREE.LineSegments(new THREE.EdgesGeometry(pg), !st.ok ? edgeMatBad : selected ? edgeMatSel : edgeMat);
    pe.renderOrder = selected ? 6 : 1;
    g.add(pe);
  }
  return g;
}

export function syncWalls() {
  const seen = new Set();
  for (const w of getWalls()) {
    seen.add(w.id);
    const old = groups.get(w.id);
    if (old) { root.remove(old); old.traverse((o) => { if (o.geometry) o.geometry.dispose(); }); }
    const g = buildGroup(w);
    groups.set(w.id, g);
    root.add(g);
  }
  for (const [id, g] of groups) {
    if (!seen.has(id)) {
      root.remove(g);
      g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      groups.delete(id);
    }
  }
}

/** Wall meshes the left button can pick (kind "wall"). */
export function wallPickables() {
  const out = [];
  root.traverse((o) => { if (o.isMesh && o.userData && o.userData.kind === "wall") out.push(o); });
  return out;
}
