// Displays job.cabinets: boards as boxes from generator output, the envelope
// wireframe, and (when selected) resize / divider handles. Nothing here
// changes geometry — handles only report which parameter they drive.
import * as THREE from "three";
import { scene, camera } from "./space.js";
import { getJob, getSelectedId, getSubSelection, getSelectedRegion, getSpace, getPlanes, resultFor } from "./job.js";
import { getModule } from "./modules.js";
import { footprintFits, minClearHeight, clearHeightAt, slicePlane } from "./spaces.js";
import { prismYZ, boardGeometry, boxMesh, boxEdges, faceSheetGeometry } from "./boardGeom.js";
import { faceAtHit } from "./boardModel.js";

export const HANDLE_SIZE = 44;

const carcassMat = new THREE.MeshStandardMaterial({ color: 0xc9b799, roughness: 0.8 });
// Fronts read clearly against the carcass so the door side is visible at a glance (see the Face command).
const frontMat = new THREE.MeshStandardMaterial({ color: 0x9ec5d8, roughness: 0.6 });
const errorMat = new THREE.MeshStandardMaterial({ color: 0xd94b4b, roughness: 0.8, transparent: true, opacity: 0.35 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a4034 });
// A board is selected in the tree / by a second click: it lights up, the rest of its cabinet fades.
const boardSelMat = new THREE.MeshStandardMaterial({ color: 0x6fa0f0, emissive: 0x1e3a6e, roughness: 0.5 });
const carcassDimMat = new THREE.MeshStandardMaterial({ color: 0xc9b799, roughness: 0.8, transparent: true, opacity: 0.22, depthWrite: false });
const frontDimMat = new THREE.MeshStandardMaterial({ color: 0x9ec5d8, roughness: 0.6, transparent: true, opacity: 0.22, depthWrite: false });
const edgeDimMat = new THREE.LineBasicMaterial({ color: 0x4a4034, transparent: true, opacity: 0.3 });
// A face is selected: a translucent sheet just proud of that face (faceSheetGeometry offsets it;
// no polygonOffset — with the scene's depth range that pulled the sheet through the board).
const faceSelMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
const envMat = new THREE.LineBasicMaterial({ color: 0x4f86e0 });
const envMatIdle = new THREE.LineBasicMaterial({ color: 0x6b7784, transparent: true, opacity: 0.35 });
const envMatBad = new THREE.LineBasicMaterial({ color: 0xd94b4b });
const handleMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0 });
const handleHoverMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const dividerMat = new THREE.MeshBasicMaterial({ color: 0xe0a34f });
// A void region (the bedroom's mattress opening): dashed-looking thin outline, no fill; the pick mesh is invisible.
const voidEdgeMat = new THREE.LineBasicMaterial({ color: 0x8a8378, transparent: true, opacity: 0.7 });
const voidEdgeSelMat = new THREE.LineBasicMaterial({ color: 0x6fa0f0 });
const voidPickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });

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

  // A module laid out in regions (Bedroom body): every region that is not yet made of boards is
  // drawn from its own YZ section (roof already applied by the generator) extruded across its X
  // span — solid regions as blocks, a void (the mattress opening) as an outline only. Regions that
  // list `boards` are drawn as those boards below, like any other cabinet.
  const allRegions = valid && modOf.volumeOnly ? (result.zones || []).filter((z) => Array.isArray(z.outlineYZ) && z.outlineYZ.length > 2) : [];
  const regions = allRegions.filter((z) => !(z.boards && z.boards.length));
  if (regions.length) {
    const selRegion = selected ? getSelectedRegion() : null;
    const sub = selected ? getSubSelection() : null;
    for (const z of regions) {
      const geo = prismYZ(z.outlineYZ, z.x0, z.x1);
      if (z.kind === "void") {
        const lines = new THREE.LineSegments(new THREE.EdgesGeometry(geo), selRegion === z.id ? voidEdgeSelMat : voidEdgeMat);
        lines.renderOrder = 4;
        group.add(lines);
        // An invisible pick target so the opening can still be clicked (second click selects the region).
        const pick = new THREE.Mesh(geo, voidPickMat);
        pick.userData = { kind: "board", cabId: cab.id, boardId: null, regionId: z.id };
        group.add(pick);
        continue;
      }
      const isSel = selRegion === z.id;
      const mesh = new THREE.Mesh(geo, isSel ? boardSelMat : selRegion || sub ? carcassDimMat : carcassMat);
      mesh.userData = { kind: "board", cabId: cab.id, boardId: null, regionId: z.id };
      group.add(mesh);
      group.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), selRegion || sub ? edgeDimMat : edgeMat));
    }
  }
  if (!allRegions.length && !hasBoards && valid && modOf.volumeOnly) {
    // Volume-only module (Bed Box v0): the envelope itself is the solid — cut to the roof when it has a profile.
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
    // Board / face selected inside this cabinet (module → board → face): the board lights up,
    // its neighbours fade, and the face gets a sheet. The geometry itself is untouched.
    const sub = selected ? getSubSelection() : null;
    // A region selected in a mixed module (bedroom body): its boards light up, the rest fades.
    const selRegion = selected && allRegions.length ? getSelectedRegion() : null;
    for (const b of result.boards) {
      const front = b.category === "front_panel";
      const isSel = (sub && sub.boardId === b.id) || (!sub && selRegion && b.zoneId === selRegion);
      const dim = (sub && !isSel) || (selRegion && !isSel);
      const mat = isSel && !sub && selRegion ? carcassMat : isSel ? boardSelMat : dim ? (front ? frontDimMat : carcassDimMat) : front ? frontMat : carcassMat;
      // A board with an outline (robe side cut to the roof, an OHC divider / T3 / T4 with its notches) is drawn
      // from that outline, not its bounding box.
      const { geo, cut } = boardGeometry(b);
      const mesh = cut ? new THREE.Mesh(geo, mat) : boxMesh(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, mat);
      mesh.userData = { kind: "board", cabId: cab.id, boardId: b.id };
      group.add(mesh);
      const lineMat = dim ? edgeDimMat : edgeMat;
      group.add(cut ? new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), lineMat) : boxEdges(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, lineMat));
      if (isSel && sub && sub.face) {
        const sheetGeo = faceSheetGeometry(b, sub.face);
        if (sheetGeo) {
          const sheet = new THREE.Mesh(sheetGeo, faceSelMat);
          sheet.renderOrder = 8;
          group.add(sheet);
        }
      }
    }
  } else if (!allRegions.length) {
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

  // Handles only while the cabinet itself is selected: reading a board / face hides them.
  if (selected && !getSubSelection()) {
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
    const at = { W: [env.x1, env.y1 / 2, env.z1 / 2], D: [env.x1 / 2, env.y0, env.z1 / 2], H: [env.x1 / 2, env.y1 / 2, mod.growsDown ? env.z0 : env.z1] };
    const wanted = new Set(mod.handles || ["W", "D", "H"]);
    if (wanted.has("W")) mk(...at.W, { type: "W" });
    if (wanted.has("D")) mk(...at.D, { type: "D" });
    // A ceiling-hung module keeps its top: the H handle sits on the bottom and pulls it down.
    if (wanted.has("H")) mk(...at.H, { type: "H" });
    // On-demand handle (Bed Box length): a double arrow along the axis, shown only after the panel armed it.
    if (armedHandle && armedHandle.cabId === cab.id && (mod.handlesOnDemand || []).includes(armedHandle.type)) {
      // The arrow stands clear of the face it pulls, on the outside (D: the front; W: the right; H: the top, or the bottom of a ceiling-hung box).
      const outward = armedHandle.type === "D" ? -1 : armedHandle.type === "H" && mod.growsDown ? -1 : 1;
      handles.add(arrowHandle(at[armedHandle.type], armedHandle.type, outward, { kind: "handle", cabId: cab.id, handle: { type: armedHandle.type } }));
    }

    if (hasBoards || regions.length) {
      for (const d of mod.dividers(cab.params, result)) {
        // Zone boundaries: horizontal bars at local z (stacked zones) or vertical bars at local x (zones along W).
        // `span` limits a bar to part of the face (a wardrobe inner face runs from the boot deck to the roof).
        const vertical = d.axis === "x";
        const span = d.span || (vertical ? [0, env.H] : [0, env.W]);
        const len = span[1] - span[0] + 8;
        const mid = (span[0] + span[1]) / 2;
        const bar = new THREE.Mesh(vertical ? new THREE.BoxGeometry(6, 8, len) : new THREE.BoxGeometry(len, 6, 8), dividerMat);
        if (vertical) bar.position.set(d.pos, env.y0 - 4, mid);
        else bar.position.set(mid, env.y0 - 4, d.pos);
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

/**
 * On-demand handle (`mod.handlesOnDemand`): the panel arms one dimension of the
 * selected cabinet and a double arrow appears in 3D along that axis; dragging
 * it works exactly like the cube handles. It disappears on Esc, when the
 * selection changes, or when armed again (toggle). `{ cabId, type }` or null.
 */
let armedHandle = null;
export function armHandle(cabId, type) {
  armedHandle = armedHandle && armedHandle.cabId === cabId && armedHandle.type === type ? null : { cabId, type };
  syncCabinets();
  return armedHandle;
}
export function disarmHandle() {
  if (!armedHandle) return false;
  armedHandle = null;
  syncCabinets();
  return true;
}
export function armedHandleFor(cabId) {
  return armedHandle && armedHandle.cabId === cabId ? armedHandle.type : null;
}

/**
 * Double-headed arrow along local `axisType` (W → X, D → Y, H → Z), standing just
 * outside the face at `pos` on its `outward` side (±1); every part carries `userData`.
 */
function arrowHandle(pos, axisType, outward, userData) {
  const L = 280; // overall length, mm
  const head = 70;
  const gap = 30; // clear of the face
  const g = new THREE.Group();
  g.userData = { arrow: true };
  const parts = [
    new THREE.Mesh(new THREE.CylinderGeometry(9, 9, L - 2 * head, 12), handleMat),
    new THREE.Mesh(new THREE.ConeGeometry(26, head, 16), handleMat),
    new THREE.Mesh(new THREE.ConeGeometry(26, head, 16), handleMat),
  ];
  parts[1].position.y = (L - head) / 2;
  parts[2].position.y = -(L - head) / 2;
  parts[2].rotation.z = Math.PI;
  for (const m of parts) { m.userData = userData; m.renderOrder = 20; g.add(m); }
  // Cylinders / cones point along +Y; turn the arrow onto the handle's axis.
  const dir = axisType === "W" ? new THREE.Vector3(1, 0, 0) : axisType === "H" ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  g.position.set(pos[0], pos[1], pos[2]).addScaledVector(dir, outward * (gap + L / 2));
  return g;
}

export function syncCabinets() {
  const job = getJob();
  const seen = new Set();
  // An armed handle belongs to the selected cabinet only; a change of selection (or a board pick) drops it.
  if (armedHandle && (armedHandle.cabId !== getSelectedId() || getSubSelection())) armedHandle = null;
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
  // An arrow handle is several meshes in one group: light them all.
  const targets = mesh.parent && mesh.parent.userData && mesh.parent.userData.arrow ? mesh.parent.children : [mesh];
  for (const m of targets) {
    if (m.userData.handle.type === "divider") m.material = hovered ? handleHoverMat : dividerMat;
    else m.material = hovered ? handleHoverMat : handleMat;
  }
}

/**
 * The face of a board a raycast hit landed on: `{ cabId, boardId, faceId }` (faceId null when
 * the board has no faces or the hit is not a board). Normal and point are taken into the
 * cabinet frame; the board meshes carry no rotation of their own.
 */
export function faceUnderHit(hit) {
  const ud = hit?.object?.userData;
  if (!ud || ud.kind !== "board" || !ud.boardId) return null;
  const group = groups.get(ud.cabId);
  const board = (resultFor(ud.cabId)?.boards || []).find((b) => b.id === ud.boardId);
  if (!group || !board) return { cabId: ud.cabId, boardId: ud.boardId, faceId: null };
  const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 0, 1);
  const p = group.worldToLocal(hit.point.clone());
  return { cabId: ud.cabId, boardId: ud.boardId, faceId: faceAtHit(board, { x: n.x, y: n.y, z: n.z }, { x: p.x, y: p.y, z: p.z }) };
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
