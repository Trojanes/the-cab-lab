// Displays job.cabinets: boards as boxes from generator output, the envelope
// wireframe, and (when selected) resize / divider handles. Nothing here
// changes geometry — handles only report which parameter they drive.
import * as THREE from "three";
import { scene, camera } from "./space.js";
import { getJob, getSelectedId, getSpace, getPlanes, resultFor } from "./job.js";
import { getModule } from "./modules.js";
import { footprintFits, minClearHeight, clearHeightAt, slicePlane } from "./spaces.js";

export const HANDLE_SIZE = 44;

const carcassMat = new THREE.MeshStandardMaterial({ color: 0xc9b799, roughness: 0.8 });
// Fronts read clearly against the carcass so the door side is visible at a glance (see the Face command).
const frontMat = new THREE.MeshStandardMaterial({ color: 0x9ec5d8, roughness: 0.6 });
const errorMat = new THREE.MeshStandardMaterial({ color: 0xd94b4b, roughness: 0.8, transparent: true, opacity: 0.35 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a4034 });
const envMat = new THREE.LineBasicMaterial({ color: 0x4f86e0 });
const envMatIdle = new THREE.LineBasicMaterial({ color: 0x6b7784, transparent: true, opacity: 0.35 });
const envMatBad = new THREE.LineBasicMaterial({ color: 0xd94b4b });
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

/** World-space footprint corners and XY bounds of the cabinet envelope for a pose. */
export function envelopeFootprint(cab, pose) {
  const env = envelopeBox(cab, resultFor(cab.id));
  const a = ((pose.rotZ || 0) * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const corners = [[env.x0, env.y0], [env.x1, env.y0], [env.x1, env.y1], [env.x0, env.y1]].map(([lx, ly]) => [
    pose.x + lx * c - ly * s,
    pose.y + lx * s + ly * c,
  ]);
  const xs = corners.map((p) => p[0]);
  const ys = corners.map((p) => p[1]);
  return {
    corners,
    minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    z0: pose.z + env.z0, z1: pose.z + env.z1,
  };
}

/** Does the cabinet fit inside the space at this pose (floor polygon, obstacles, height)? */
export function poseFits(cab, pose) {
  const fp = envelopeFootprint(cab, pose);
  const sp = getSpace();
  // A roof-aware module (the bedroom) is cut to the roof by its generator; only the floor and obstacles apply.
  const z1 = getModule(cab.moduleId).roofAware && sp ? Math.min(fp.z1, minClearHeight(sp, fp.minY, fp.maxY)) : fp.z1;
  return footprintFits(sp, fp.corners, [fp.z0, z1]);
}

/**
 * Solid from a closed YZ outline [{y, z}, ...] extruded across X from x0 to x1
 * (a board cut to the roof, or the nose slab itself).
 */
function prismYZ(outline, x0, x1) {
  const pts = outline.map((p) => new THREE.Vector2(p.y, p.z));
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(x1 - x0, 0.1), bevelEnabled: false });
  // Shape (u, v, w) → world (x0 + w, u, v): u along Y, v up, extrusion along X.
  geo.applyMatrix4(new THREE.Matrix4().set(0, 0, 1, x0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1));
  return geo;
}

/** Solid from a closed XY outline [{x, y}, ...] extruded up Z from z0 to z1 (an OHC T3 with its LED notch). */
function prismXY(outline, z0, z1) {
  const pts = outline.map((p) => new THREE.Vector2(p.x, p.y));
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(z1 - z0, 0.1), bevelEnabled: false });
  geo.translate(0, 0, z0);
  return geo;
}

/** Solid from a closed XZ outline [{x, z}, ...] extruded along Y from y0 to y1 (an OHC T4 with its notches, a door). */
function prismXZ(outline, y0, y1) {
  // Shape (u, v) = (z, x) so the extrusion axis maps onto +Y without mirroring the solid.
  const pts = outline.map((p) => new THREE.Vector2(p.z, p.x));
  if (pts.length > 2 && pts[0].distanceTo(pts[pts.length - 1]) < 1e-6) pts.pop();
  const geo = new THREE.ExtrudeGeometry(new THREE.Shape(pts), { depth: Math.max(y1 - y0, 0.1), bevelEnabled: false });
  // Shape (u, v, w) → world (v, y0 + w, u).
  geo.applyMatrix4(new THREE.Matrix4().set(0, 1, 0, 0, 0, 0, 1, y0, 1, 0, 0, 0, 0, 0, 0, 1));
  return geo;
}

/**
 * Board solid: its `profileVector` outline when the generator gives one (a plate with notches / tongues),
 * else its bounding box. Outlines in the YZ plane are cabinet-local; XY / XZ outlines are aligned so their
 * minimum matches the board's bounding box, like the Fusion adapter does (`_align_body_axis_min`).
 * `cutProfileVector` is relative to the board's own y0 / z0.
 */
function boardGeometry(b) {
  const plane = b.profilePlane;
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector : null;
  if (plane === "YZ" && b.thicknessAxis === "X") {
    const outline = pv ? pv
      : b.cutProfileVector && b.cutProfileVector.length >= 4 ? b.cutProfileVector.map((p) => ({ y: b.y0 + p.y, z: b.z0 + p.z }))
        : null;
    if (outline) return { geo: prismYZ(outline, b.x0, b.x1), cut: true };
  } else if (plane === "XY" && b.thicknessAxis === "Z" && pv) {
    const dx = b.x0 - Math.min(...pv.map((p) => p.x));
    const dy = b.y0 - Math.min(...pv.map((p) => p.y));
    return { geo: prismXY(pv.map((p) => ({ x: p.x + dx, y: p.y + dy })), b.z0, b.z1), cut: true };
  } else if (plane === "XZ" && b.thicknessAxis === "Y" && pv) {
    const dx = b.x0 - Math.min(...pv.map((p) => p.x));
    const dz = b.z0 - Math.min(...pv.map((p) => p.z));
    return { geo: prismXZ(pv.map((p) => ({ x: p.x + dx, z: p.z + dz })), b.y0, b.y1), cut: true };
  }
  return { geo: null, cut: false };
}

/** Closed local YZ outline of a nose slab: floor, then the roof profile back toward the room face. */
export function slabOutline(profile, depth) {
  const top = profile.slice().sort((a, b) => a[0] - b[0]);
  return [{ y: 0, z: 0 }, { y: depth, z: 0 }, ...top.slice().reverse().map(([y, z]) => ({ y, z })), { y: 0, z: 0 }];
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
  const modOf = getModule(cab.moduleId);
  const valid = result && result.validation && result.validation.errors.length === 0;

  if (!hasBoards && valid && modOf.volumeOnly) {
    // Volume-only module (Bedroom body, Bed Box v0): the envelope itself is the solid — cut to the roof when it has a profile.
    const solid = modOf.envelopeProfile
      ? new THREE.Mesh(prismYZ(slabOutline(modOf.envelopeProfile(cab.params), env.D), env.x0, env.x1), carcassMat)
      : boxMesh(env.x0, env.x1, env.y0, env.y1, env.z0, env.z1, carcassMat);
    solid.userData = { kind: "board", cabId: cab.id, boardId: null };
    group.add(solid);
    // The prism geometry is in local coordinates; the box geometry is centred and positioned, so its edges need the same placement.
    group.add(modOf.envelopeProfile
      ? new THREE.LineSegments(new THREE.EdgesGeometry(solid.geometry), edgeMat)
      : boxEdges(env.x0, env.x1, env.y0, env.y1, env.z0, env.z1, edgeMat));
  } else if (hasBoards) {
    for (const b of result.boards) {
      const mat = b.category === "front_panel" ? frontMat : carcassMat;
      // A board with an outline (robe side cut to the roof, an OHC divider / T3 / T4 with its notches) is drawn
      // from that outline, not its bounding box.
      const { geo, cut } = boardGeometry(b);
      const mesh = cut ? new THREE.Mesh(geo, mat) : boxMesh(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, mat);
      mesh.userData = { kind: "board", cabId: cab.id, boardId: b.id };
      group.add(mesh);
      group.add(cut ? new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), edgeMat) : boxEdges(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, edgeMat));
    }
  } else {
    // Invalid params: show the envelope as a red ghost so it can still be fixed.
    const ghost = boxMesh(env.x0, env.x1, env.y0, env.y1, env.z0, env.z1, errorMat);
    ghost.userData = { kind: "board", cabId: cab.id, boardId: null };
    group.add(ghost);
  }

  const fits = poseFits(cab, cab.pose);
  const mod = getModule(cab.moduleId);
  const envMatNow = !fits ? envMatBad : selected ? envMat : envMatIdle;
  // Envelope: a box, or the slab prism when the module follows the roof.
  const envLines = mod.envelopeProfile
    ? new THREE.LineSegments(new THREE.EdgesGeometry(prismYZ(slabOutline(mod.envelopeProfile(cab.params), env.D), env.x0, env.x1)), envMatNow)
    : boxEdges(env.x0, env.x1, env.y0, env.y1, env.z0, env.z1, envMatNow);
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
    const wanted = new Set(mod.handles || ["W", "D", "H"]);
    if (wanted.has("W")) mk(env.x1, env.y1 / 2, env.z1 / 2, { type: "W" });
    if (wanted.has("D")) mk(env.x1 / 2, env.y0, env.z1 / 2, { type: "D" });
    // A ceiling-hung module keeps its top: the H handle sits on the bottom and pulls it down.
    if (wanted.has("H")) mk(env.x1 / 2, env.y1 / 2, mod.growsDown ? env.z0 : env.z1, { type: "H" });

    if (hasBoards) {
      for (const d of mod.dividers(cab.params, result)) {
        // Zone boundaries: horizontal bars at local z (stacked zones) or vertical bars at local x (zones along W).
        const vertical = d.axis === "x";
        const bar = new THREE.Mesh(vertical ? new THREE.BoxGeometry(6, 8, env.H + 8) : new THREE.BoxGeometry(env.W + 8, 6, 8), dividerMat);
        if (vertical) bar.position.set(d.pos, env.y0 - 4, env.H / 2);
        else bar.position.set(env.W / 2, env.y0 - 4, d.pos);
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
  const take = (o) => {
    if (o.isMesh && o.userData && (o.userData.kind === "board" || o.userData.kind === "handle" || o.userData.kind === "cplane")) out.push(o);
  };
  root.traverse(take);
  cplaneRoot.traverse(take);
  return out;
}

/** Placement ghost shown while dragging out a new box on the floor. */
const ghostMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0, transparent: true, opacity: 0.2 });
const ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
ghost.visible = false;
scene.add(ghost);

const ghostEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x4f86e0 }));
ghostEdges.visible = false;
scene.add(ghostEdges);

/** Axis-aligned preview box from min corner (x0, y0, z0). `clamped` turns the outline orange. */
export function showGhost(x0, y0, z0, W, D, H, { clamped = false } = {}) {
  for (const m of [ghost, ghostEdges]) {
    m.visible = true;
    m.scale.set(Math.max(W, 1), Math.max(D, 1), Math.max(H, 1));
    m.position.set(x0 + W / 2, y0 + D / 2, z0 + H / 2);
  }
  ghostEdges.material.color.setHex(clamped ? 0xf0a050 : 0x4f86e0);
}

/** Working-face hint: a translucent sheet over the face the box will be drawn on. */
const faceHint = new THREE.Mesh(
  new THREE.BoxGeometry(1, 1, 1),
  new THREE.MeshBasicMaterial({ color: 0x4f86e0, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
);
faceHint.visible = false;
faceHint.renderOrder = 5;
scene.add(faceHint);
/**
 * `face` = { axis, value, ext:{x,y,z} } from snap.js.
 * `tone`: "" blue working face · "pending" orange (Face command's chosen side) · "done" green flash on confirm.
 */
const HINT_TONES = { "": 0x4f86e0, pending: 0xf0a050, done: 0x7cf09c };
let hintTimer = null;
export function showFaceHint(face, { tone = "" } = {}) {
  const e = face.ext;
  const size = { x: e.x[1] - e.x[0], y: e.y[1] - e.y[0], z: e.z[1] - e.z[0] };
  size[face.axis] = 2;
  const strong = tone !== "";
  if (hintTimer) { clearTimeout(hintTimer); hintTimer = null; }
  faceHint.material.color.setHex(HINT_TONES[tone] ?? HINT_TONES[""]);
  faceHint.material.opacity = strong ? 0.35 : 0.08;
  faceHint.material.depthTest = !strong; // the chosen side reads through the door panel it sits on
  faceHint.material.needsUpdate = true;
  faceHint.renderOrder = strong ? 26 : 5;
  faceHint.visible = true;
  faceHint.scale.set(Math.max(size.x, 1), Math.max(size.y, 1), Math.max(size.z, 1));
  faceHint.position.set((e.x[0] + e.x[1]) / 2, (e.y[0] + e.y[1]) / 2, (e.z[0] + e.z[1]) / 2);
  faceHint.position[face.axis] = face.value;
}
/** Confirm feedback: the side flashes green, then hides itself. */
export function flashFaceHint(face, ms = 450) {
  showFaceHint(face, { tone: "done" });
  hintTimer = setTimeout(() => { hintTimer = null; faceHint.visible = false; }, ms);
}
export function hideFaceHint() {
  if (hintTimer) return; // let a confirm flash finish
  faceHint.visible = false;
}

/** Alignment lines: a face of the space / another cabinet the cursor is flush with. */
const alignMat = new THREE.LineDashedMaterial({ color: 0xf0c070, dashSize: 30, gapSize: 20, depthTest: false, transparent: true, opacity: 0.9 });
const alignLines = [];
for (let i = 0; i < 2; i += 1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const l = new THREE.Line(g, alignMat);
  l.visible = false;
  l.renderOrder = 28;
  scene.add(l);
  alignLines.push(l);
}
/** `segs` = up to two [{x,y,z},{x,y,z}] pairs. */
export function showAlignLines(segs) {
  alignLines.forEach((l, i) => {
    const s = segs[i];
    l.visible = !!s;
    if (!s) return;
    const pos = l.geometry.attributes.position;
    pos.setXYZ(0, s[0].x, s[0].y, s[0].z);
    pos.setXYZ(1, s[1].x, s[1].y, s[1].z);
    pos.needsUpdate = true;
    l.geometry.computeBoundingSphere();
    l.computeLineDistances();
  });
}
export function hideAlignLines() {
  for (const l of alignLines) l.visible = false;
}
export function hideGhost() {
  ghost.visible = false;
  ghostEdges.visible = false;
  hideNoseGhost();
  hideWidthRect();
}

/**
 * 2D width rectangle (Bed Box width step): W × H standing on the body's room
 * face in the XZ plane at `y`, no depth, with a centre-line mark. Drawn over
 * everything so the body cannot hide it.
 */
const widthRectMat = new THREE.LineBasicMaterial({ color: 0x4f86e0, depthTest: false, transparent: true, opacity: 0.95 });
const widthRectGeo = new THREE.BufferGeometry();
widthRectGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(5 * 2 * 3), 3));
const widthRect = new THREE.LineSegments(widthRectGeo, widthRectMat);
widthRect.visible = false;
widthRect.renderOrder = 27;
scene.add(widthRect);
const widthFaceMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0, transparent: true, opacity: 0.18, depthTest: false, depthWrite: false, side: THREE.DoubleSide });
const widthFace = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), widthFaceMat);
widthFace.rotation.x = Math.PI / 2; // plane normal along Y: the rectangle stands in XZ
widthFace.visible = false;
widthFace.renderOrder = 26;
scene.add(widthFace);
export function showWidthRect(x0, x1, y, h, { clamped = false } = {}) {
  const cx = (x0 + x1) / 2;
  const pos = widthRectGeo.attributes.position;
  const segs = [
    [x0, y, 0, x1, y, 0], // bottom
    [x1, y, 0, x1, y, h], // right
    [x1, y, h, x0, y, h], // top
    [x0, y, h, x0, y, 0], // left
    [cx, y, 0, cx, y, h * 0.25], // centre-line mark
  ];
  segs.forEach((s, i) => { pos.setXYZ(i * 2, s[0], s[1], s[2]); pos.setXYZ(i * 2 + 1, s[3], s[4], s[5]); });
  pos.needsUpdate = true;
  widthRectGeo.computeBoundingSphere();
  widthRectMat.color.setHex(clamped ? 0xf0a050 : 0x4f86e0);
  widthRect.visible = true;
  widthFace.scale.set(Math.max(x1 - x0, 1), Math.max(h, 1), 1);
  widthFace.position.set(cx, y, h / 2);
  widthFace.visible = true;
}
export function hideWidthRect() {
  widthRect.visible = false;
  widthFace.visible = false;
}

/** Nose-slab preview (Bedroom placement): the space's nose from Y = 0 to `depth`, full width, under the roof. */
let noseGhost = null;
export function showNoseGhost(resolved, depth, { clamped = false } = {}) {
  hideNoseGhost();
  if (!resolved) return;
  const b = resolved.bounds;
  const D = Math.max(depth, 1);
  // World-Y profile over [0, D] (the ghost is not posed, so it is built in world space).
  const ys = new Set([0, D]);
  for (const [y] of resolved.profile || []) if (y > 0 && y < D) ys.add(y);
  const profile = [...ys].sort((p, q) => p - q).map((y) => [y, clearHeightAt(resolved, 0, y)]);
  const geo = prismYZ(slabOutline(profile, D).map((p) => ({ y: p.y, z: p.z })), b.minX, b.maxX);
  noseGhost = new THREE.Group();
  noseGhost.add(new THREE.Mesh(geo, ghostMat));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: clamped ? 0xf0a050 : 0x4f86e0 }));
  edges.renderOrder = 6;
  noseGhost.add(edges);
  scene.add(noseGhost);
}
export function hideNoseGhost() {
  if (!noseGhost) return;
  scene.remove(noseGhost);
  noseGhost.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  noseGhost = null;
}

/** Snap marker: a small sphere on the hovered feature point (or a dim one on a grid point). */
const snapMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
const gridMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0, depthTest: false, transparent: true, opacity: 0.6 });
const snapMarker = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), snapMat);
snapMarker.visible = false;
snapMarker.renderOrder = 30;
scene.add(snapMarker);

export function showSnapMarker(x, y, z, { feature = true } = {}) {
  snapMarker.visible = true;
  snapMarker.material = feature ? snapMat : gridMat;
  snapMarker.position.set(x, y, z);
  // Keep the marker a roughly constant screen size.
  const dist = snapMarker.position.distanceTo(camera.position);
  const r = Math.max(6, dist * 0.004) * (feature ? 1 : 0.6);
  snapMarker.scale.setScalar(r);
}
export function hideSnapMarker() {
  snapMarker.visible = false;
}

/** Inference line: dashed, coloured by axis, from a feature point to the cursor target. */
const inferGeo = new THREE.BufferGeometry();
inferGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
const inferMat = new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 40, gapSize: 25, depthTest: false });
const inferLine = new THREE.Line(inferGeo, inferMat);
inferLine.visible = false;
inferLine.renderOrder = 29;
scene.add(inferLine);
const onLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false });
const onLineMarker = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), onLineMat);
onLineMarker.visible = false;
onLineMarker.renderOrder = 30;
scene.add(onLineMarker);

// Brighter than the axes so a 1 px dashed line reads against the grid.
function axisColor(dir) {
  if (Math.abs(dir[0]) > 0.9) return 0xff7070;
  if (Math.abs(dir[1]) > 0.9) return 0x7cf09c;
  if (Math.abs(dir[2]) > 0.9) return 0x7fb0ff;
  return 0xf0c070;
}

export function showInference(from, to, dir) {
  const pos = inferGeo.attributes.position;
  pos.setXYZ(0, from.x, from.y, from.z);
  pos.setXYZ(1, to.x, to.y, to.z);
  pos.needsUpdate = true;
  inferGeo.computeBoundingSphere();
  inferLine.computeLineDistances();
  const color = axisColor(dir);
  inferMat.color.setHex(color);
  onLineMat.color.setHex(color);
  inferLine.visible = true;
  onLineMarker.visible = true;
  onLineMarker.position.set(to.x, to.y, to.z);
  const dist = onLineMarker.position.distanceTo(camera.position);
  onLineMarker.scale.setScalar(Math.max(8, dist * 0.005));
}
export function hideInference() {
  inferLine.visible = false;
  onLineMarker.visible = false;
}

/** Construction-plane mesh from an outline (plane ∩ space). `axis` is the constant coordinate. */
function planeGeometry(axis, outline) {
  const u = axis === "x" ? "y" : "x";
  const v = axis === "z" ? "y" : "z";
  const vecs = outline.map((p) => new THREE.Vector2(p[u], p[v]));
  if (vecs.length > 2 && vecs[0].distanceTo(vecs[vecs.length - 1]) < 1e-6) vecs.pop();
  if (vecs.length < 3) return null;
  const tris = THREE.ShapeUtils.triangulateShape(vecs, []);
  const pos = [];
  const put = (uu, vv) => {
    if (axis === "x") pos.push(outline[0].x, uu, vv);
    else if (axis === "y") pos.push(uu, outline[0].y, vv);
    else pos.push(uu, vv, outline[0].z);
  };
  for (const tri of tris) for (const i of tri) put(vecs[i].x, vecs[i].y);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
function planeEdges(outline) {
  const pts = outline.map((p) => new THREE.Vector3(p.x, p.y, p.z));
  if (pts.length && pts[0].distanceTo(pts[pts.length - 1]) > 1e-4) pts.push(pts[0].clone());
  return new THREE.BufferGeometry().setFromPoints(pts);
}

const cplaneMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide });
const cplaneMatSel = new THREE.MeshBasicMaterial({ color: 0x4f86e0, transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide });
const cplaneEdgeMat = new THREE.LineBasicMaterial({ color: 0x4f86e0, transparent: true, opacity: 0.85 });
const cplaneEdgeMatSel = new THREE.LineBasicMaterial({ color: 0x7fb0ff });
const cplaneRoot = new THREE.Group();
cplaneRoot.name = "cplanes";
scene.add(cplaneRoot);

export function syncPlanes() {
  while (cplaneRoot.children.length) {
    const o = cplaneRoot.children[0];
    cplaneRoot.remove(o);
    o.traverse((c) => { if (c.geometry) c.geometry.dispose(); });
  }
  const sp = getSpace();
  const sel = getSelectedId();
  for (const pl of getPlanes()) {
    const slice = slicePlane(sp, pl.axis, pl.value);
    if (!slice) continue;
    const selected = sel === pl.id;
    const geo = planeGeometry(pl.axis, slice.outline);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, selected ? cplaneMatSel : cplaneMat);
    mesh.userData = { kind: "cplane", planeId: pl.id };
    mesh.renderOrder = 8;
    const edges = new THREE.Line(planeEdges(slice.outline), selected ? cplaneEdgeMatSel : cplaneEdgeMat);
    edges.renderOrder = 9;
    const g = new THREE.Group();
    g.add(mesh, edges);
    cplaneRoot.add(g);
  }
}

const previewMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0, transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide });
const previewEdgeMat = new THREE.LineBasicMaterial({ color: 0x4f86e0 });
let previewGroup = null;
export function showCPlanePreview(axis, value, { clamped = false } = {}) {
  hideCPlanePreview();
  const slice = slicePlane(getSpace(), axis, value);
  if (!slice) return;
  const geo = planeGeometry(axis, slice.outline);
  if (!geo) return;
  previewMat.color.setHex(clamped ? 0xf0a050 : 0x4f86e0);
  previewEdgeMat.color.setHex(clamped ? 0xf0a050 : 0x4f86e0);
  const mesh = new THREE.Mesh(geo, previewMat);
  mesh.renderOrder = 26;
  const edges = new THREE.Line(planeEdges(slice.outline), previewEdgeMat);
  edges.renderOrder = 27;
  previewGroup = new THREE.Group();
  previewGroup.add(mesh, edges);
  scene.add(previewGroup);
}
export function hideCPlanePreview() {
  if (!previewGroup) return;
  scene.remove(previewGroup);
  previewGroup.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  previewGroup = null;
}
