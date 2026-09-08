// Displays job.cabinets: boards as boxes from generator output, the envelope
// wireframe, and (when selected) resize / divider handles. Nothing here
// changes geometry — handles only report which parameter they drive.
import * as THREE from "three";
import { scene } from "./space.js";
import { getJob, getSelectedId, resultFor } from "./job.js";
import { getModule } from "./modules.js";

export const HANDLE_SIZE = 44;

const carcassMat = new THREE.MeshStandardMaterial({ color: 0xc9b799, roughness: 0.8 });
const frontMat = new THREE.MeshStandardMaterial({ color: 0xe8e4da, roughness: 0.6 });
const errorMat = new THREE.MeshStandardMaterial({ color: 0xd94b4b, roughness: 0.8, transparent: true, opacity: 0.35 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a4034 });
const envMat = new THREE.LineBasicMaterial({ color: 0x4f86e0 });
const envMatIdle = new THREE.LineBasicMaterial({ color: 0x6b7784, transparent: true, opacity: 0.35 });
const handleMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0 });
const handleHoverMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const dividerMat = new THREE.MeshBasicMaterial({ color: 0xe0a34f });

const root = new THREE.Group();
root.name = "cabinets";
scene.add(root);

const groups = new Map(); // cabinetId -> Group

export function cabinetGroups() {
  return Array.from(groups.values());
}

export function groupFor(id) {
  return groups.get(id) || null;
}

/** Envelope in cabinet-local mm: x 0..W, y -FPT..D, z 0..H. */
export function envelopeBox(cab, result) {
  const env = getModule(cab.moduleId).envelope(cab.params);
  const fpt = result?.params?.frontPanelThickness ?? cab.params.frontPanelThickness ?? 16;
  return { x0: 0, x1: env.W, y0: -fpt, y1: env.D, z0: 0, z1: env.H, W: env.W, D: env.D, H: env.H, fpt };
}

export function applyPose(group, pose) {
  group.position.set(pose.x, pose.y, pose.z);
  group.rotation.set(0, 0, (pose.rotZ || 0) * Math.PI / 180);
  group.updateMatrixWorld(true);
}

function boxMesh(x0, x1, y0, y1, z0, z1, mat) {
  const geo = new THREE.BoxGeometry(Math.max(x1 - x0, 0.1), Math.max(y1 - y0, 0.1), Math.max(z1 - z0, 0.1));
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return mesh;
}

function boxEdges(x0, x1, y0, y1, z0, z1, mat) {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0));
  const lines = new THREE.LineSegments(geo, mat);
  lines.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return lines;
}

function buildGroup(cab) {
  const result = resultFor(cab.id);
  const env = envelopeBox(cab, result);
  const selected = cab.id === getSelectedId();
  const group = new THREE.Group();
  group.name = cab.id;
  group.userData = { cabId: cab.id };

  const hasBoards = result && result.boards && result.boards.length > 0;

  if (hasBoards) {
    for (const b of result.boards) {
      const mat = b.category === "front_panel" ? frontMat : carcassMat;
      const mesh = boxMesh(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, mat);
      mesh.userData = { kind: "board", cabId: cab.id, boardId: b.id };
      group.add(mesh);
      group.add(boxEdges(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, edgeMat));
    }
  } else {
    // Invalid params: show the envelope as a red ghost so it can still be fixed.
    const ghost = boxMesh(env.x0, env.x1, env.y0, env.y1, env.z0, env.z1, errorMat);
    ghost.userData = { kind: "board", cabId: cab.id, boardId: null };
    group.add(ghost);
  }

  const envLines = boxEdges(env.x0, env.x1, env.y0, env.y1, env.z0, env.z1, selected ? envMat : envMatIdle);
  envLines.renderOrder = 5;
  group.add(envLines);

  if (selected) {
    const handles = new THREE.Group();
    handles.name = "handles";
    const s = HANDLE_SIZE;
    const mk = (x, y, z, handle) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), handleMat);
      m.position.set(x, y, z);
      m.userData = { kind: "handle", cabId: cab.id, handle };
      m.renderOrder = 20;
      handles.add(m);
    };
    mk(env.x1, env.y1 / 2, env.z1 / 2, { type: "W" });
    mk(env.x1 / 2, env.y0, env.z1 / 2, { type: "D" });
    mk(env.x1 / 2, env.y1 / 2, env.z1, { type: "H" });

    if (hasBoards) {
      const mod = getModule(cab.moduleId);
      for (const d of mod.dividers(cab.params, result)) {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(env.W + 8, 6, 8), dividerMat);
        bar.position.set(env.W / 2, env.y0 - 4, d.pos);
        bar.userData = { kind: "handle", cabId: cab.id, handle: { type: "divider", ...d } };
        bar.renderOrder = 20;
        handles.add(bar);
      }
    }
    group.add(handles);
  }

  applyPose(group, cab.pose);
  return group;
}

export function syncCabinets() {
  const job = getJob();
  const seen = new Set();
  for (const cab of job.cabinets) {
    seen.add(cab.id);
    const old = groups.get(cab.id);
    if (old) root.remove(old);
    const g = buildGroup(cab);
    groups.set(cab.id, g);
    root.add(g);
  }
  for (const [id, g] of groups) {
    if (!seen.has(id)) {
      root.remove(g);
      groups.delete(id);
    }
  }
}

export function setHandleHover(mesh, hovered) {
  if (!mesh || mesh.userData.kind !== "handle") return;
  if (mesh.userData.handle.type === "divider") {
    mesh.material = hovered ? handleHoverMat : dividerMat;
  } else {
    mesh.material = hovered ? handleHoverMat : handleMat;
  }
}

/** All meshes that can be picked with the left button. */
export function pickables() {
  const out = [];
  root.traverse((o) => {
    if (o.isMesh && o.userData && (o.userData.kind === "board" || o.userData.kind === "handle")) out.push(o);
  });
  return out;
}

/** Placement ghost shown while dragging out a new box on the floor. */
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0, transparent: true, opacity: 0.2 });
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
ghost.visible = false;
scene.add(ghost);

export function showGhost(x0, y0, W, D, H) {
  ghost.visible = true;
  ghost.scale.set(Math.max(W, 1), Math.max(D, 1), Math.max(H, 1));
  ghost.position.set(x0 + W / 2, y0 + D / 2, H / 2);
}
export function hideGhost() {
  ghost.visible = false;
}
