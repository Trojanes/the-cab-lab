// Displays job.walls. A wall that fits 1200 × 2400 is one board; a larger one
// is the two boards from walls.js wallBoards, butted at the cut. A piece past
// the sheet is red. The selected wall grows a yellow bar on the cut — drag it
// in interact.js. Nothing here changes geometry.
import * as THREE from "three";
import { scene } from "./space.js";
import { getJob, getWalls, getSelectedId, getSpace, getStock } from "./job.js";
import { prismYZ, prismXZ } from "./boardGeom.js";
import { wallBoards } from "./walls.js";
import { statusOf } from "./fit.js";

// White Stipple partition stock: lighter than the tan carcass so a wall reads as a wall.
const wallMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ea, roughness: 0.85 });
const wallMatBad = new THREE.MeshStandardMaterial({ color: 0xd94b4b, roughness: 0.85, transparent: true, opacity: 0.5 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x5a6270 });
const edgeMatSel = new THREE.LineBasicMaterial({ color: 0x4f86e0 });
const edgeMatBad = new THREE.LineBasicMaterial({ color: 0xd94b4b });
const splitMat = new THREE.MeshBasicMaterial({ color: 0xf5d76e });

const root = new THREE.Group();
root.name = "walls";
scene.add(root);

const groups = new Map(); // wallId -> Group


function boardGeo(wall, board) {
  const holes = (board.holes || []).map((h) => h.map((p) => (wall.axis === "x" ? { y: p.u, z: p.z } : { x: p.u, z: p.z })));
  return wall.axis === "x"
    ? prismYZ(board.outline.map((p) => ({ y: p.u, z: p.z, bulge: p.bulge })), board.x0, board.x1, holes)
    : prismXZ(board.outline.map((p) => ({ x: p.u, z: p.z, bulge: p.bulge })), board.y0, board.y1, holes);
}

function buildGroup(wall) {
  const g = new THREE.Group();
  g.name = wall.id;
  if (wall.hidden) return g;
  const sp = getSpace();
  const cut = wallBoards(wall, sp, getStock());
  const st = statusOf(wall);
  const selected = wall.id === getSelectedId();
  cut.boards.forEach((board, i) => {
    const bad = !st.ok || !board.fits;
    const geo = boardGeo(wall, board);
    // The two boards share the cut face. Offset the second so the seam does not flicker.
    const mat = (bad ? wallMatBad : wallMat).clone();
    if (i === 1) { mat.polygonOffset = true; mat.polygonOffsetFactor = 1; mat.polygonOffsetUnits = 1; }
    const mesh = new THREE.Mesh(geo, mat);
    mesh.userData = { kind: "wall", wallId: wall.id, boardId: board.id, disposeMat: true };
    g.add(mesh);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), bad ? edgeMatBad : selected ? edgeMatSel : edgeMat);
    edges.renderOrder = selected ? 6 : 1;
    g.add(edges);
  });
  // Sliding doors: the leaf and the pelmet are boards parallel to the wall (walls.js openingParts).
  for (const p of st.parts || []) {
    const pg = wall.axis === "x"
      ? prismYZ(p.outline.map((q) => ({ y: q.u, z: q.z, bulge: q.bulge })), p.x0, p.x1)
      : prismXZ(p.outline.map((q) => ({ x: q.u, z: q.z, bulge: q.bulge })), p.y0, p.y1);
    const pm = new THREE.Mesh(pg, st.ok ? wallMat : wallMatBad);
    pm.userData = { kind: "wall", wallId: wall.id, part: p.part, opId: p.opId };
    g.add(pm);
    const pe = new THREE.LineSegments(new THREE.EdgesGeometry(pg), !st.ok ? edgeMatBad : selected ? edgeMatSel : edgeMat);
    pe.renderOrder = selected ? 6 : 1;
    g.add(pe);
  }
  // The cut, as a yellow bar on the outer face. Dragging it stores wall.split.
  if (selected && cut.split && cut.boards.length > 1) {
    const solid = cut.solid;
    const alongX = solid.along === "x";
    // Sticks out both faces so the bar can be grabbed from either side of the wall.
    const proud = (alongX ? solid.y1 - solid.y0 : solid.x1 - solid.x0) + 72;
    const midAcross = alongX ? (solid.y0 + solid.y1) / 2 : (solid.x0 + solid.x1) / 2;
    let geo;
    let x;
    let y;
    let z;
    if (cut.split.axis === "u") {
      const z1 = solid.topZ(cut.split.at);
      const len = Math.max(z1 - solid.z0, 1);
      geo = alongX ? new THREE.BoxGeometry(16, proud, len) : new THREE.BoxGeometry(proud, 16, len);
      x = alongX ? cut.split.at : midAcross;
      y = alongX ? midAcross : cut.split.at;
      z = (solid.z0 + z1) / 2;
    } else {
      const len = Math.max(solid.u1 - solid.u0, 1);
      geo = alongX ? new THREE.BoxGeometry(len, proud, 16) : new THREE.BoxGeometry(proud, len, 16);
      x = alongX ? (solid.u0 + solid.u1) / 2 : midAcross;
      y = alongX ? midAcross : (solid.u0 + solid.u1) / 2;
      z = cut.split.at;
    }
    const bar = new THREE.Mesh(geo, splitMat.clone());
    bar.position.set(x, y, z);
    bar.userData = {
      kind: "handle", wallId: wall.id,
      handle: { type: "wallSplit", axis: cut.split.axis, along: solid.along, at: cut.split.at },
    };
    bar.renderOrder = 20;
    g.add(bar);
  }
  return g;
}

export function syncWalls() {
  const seen = new Set();
  for (const w of getWalls()) {
    seen.add(w.id);
    const old = groups.get(w.id);
    if (old) {
      root.remove(old);
      old.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.userData && (o.userData.disposeMat || (o.userData.handle && o.userData.handle.type === "wallSplit"))) o.material.dispose();
      });
    }
    const g = buildGroup(w);
    groups.set(w.id, g);
    root.add(g);
  }
  for (const [id, g] of groups) {
    if (!seen.has(id)) {
      root.remove(g);
      g.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && o.userData && (o.userData.disposeMat || (o.userData.handle && o.userData.handle.type === "wallSplit"))) o.material.dispose();
      });
      groups.delete(id);
    }
  }
}

/** Wall meshes and the yellow cut bar (kind "wall" or "handle"). */
export function wallPickables() {
  const out = [];
  root.traverse((o) => {
    if (o.isMesh && o.userData && (o.userData.kind === "wall" || o.userData.kind === "handle")) out.push(o);
  });
  return out;
}
