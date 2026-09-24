// Displays job.cabinets: boards as boxes from generator output, the envelope
// wireframe, and (when selected) resize / divider handles. Nothing here
// changes geometry — handles only report which parameter they drive.
import * as THREE from "three";
import { scene, camera, canvas } from "./space.js";
import { colourFaces, doorBodyMaterial } from "./doorFinish.js";
import { carcassDimMat, carcassMat } from "./carcassFinish.js";
import { getJob, getSelectedId, getSubSelection, getSelectedRegion, getSpace, getPlanes, resultFor, isBoardHidden } from "./job.js";
import { getModule } from "./modules.js";
import { footprintFits, minClearHeight, clearHeightAt, slicePlane } from "./spaces.js";
import { prismYZ, boardGeometry, boxMesh, boxEdges, boardEdges, faceSheetGeometry } from "./boardGeom.js";
import { faceAtHit } from "./boardModel.js";
import { worldOf, boardOverride, nominalBoardPoint } from "./pose.js";

export const HANDLE_SIZE = 44;

const frontMat = new THREE.MeshStandardMaterial({ color: 0x9ec5d8, roughness: 0.6 });
const errorMat = new THREE.MeshStandardMaterial({ color: 0xd94b4b, roughness: 0.8, transparent: true, opacity: 0.35 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a4034 });
// A board is selected in the tree / by a second click: it lights up, the rest of its cabinet fades.
const boardSelMat = new THREE.MeshStandardMaterial({ color: 0x6fa0f0, emissive: 0x1e3a6e, roughness: 0.5 });
const frontDimMat = new THREE.MeshStandardMaterial({ color: 0x9ec5d8, roughness: 0.6, transparent: true, opacity: 0.22, depthWrite: false });
const edgeDimMat = new THREE.LineBasicMaterial({ color: 0x4a4034, transparent: true, opacity: 0.3 });
// A face is selected: a translucent sheet just proud of that face (faceSheetGeometry offsets it;
// no polygonOffset — with the scene's depth range that pulled the sheet through the board).
const faceSelMat = new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
const envMat = new THREE.LineBasicMaterial({ color: 0x4f86e0 });
const envMatBad = new THREE.LineBasicMaterial({ color: 0xd94b4b });
const handleMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0 });
const handleHoverMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const dividerMat = new THREE.MeshBasicMaterial({ color: 0xe0a34f });
// A void region (the bedroom's mattress opening): dashed-looking thin outline, no fill; the pick mesh is invisible.
const voidEdgeMat = new THREE.LineBasicMaterial({ color: 0x8a8378, transparent: true, opacity: 0.7 });
const voidEdgeSelMat = new THREE.LineBasicMaterial({ color: 0x6fa0f0 });
const voidPickMat = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false });
// Hinge-cup mark. The bore is on the inside face; a ring on both faces of the door so it reads from the room and from inside.
const hingeMat = new THREE.MeshBasicMaterial({ color: 0x243044, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false });
// Groove mark. The cut is blind, into one face: a dark floor in the pocket and an outline on that face only — the other face is untouched.
const grooveLineMat = new THREE.LineBasicMaterial({ color: 0x2c241c });
const grooveFloorMat = new THREE.MeshBasicMaterial({ color: 0x2c241c, transparent: true, opacity: 0.7, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

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

function transformBox(box, pose) {
  const z0 = box.z0 ?? 0;
  const z1 = box.z1 ?? 0;
  const locals = [
    [box.x0, box.y0, z0], [box.x1, box.y0, z0], [box.x1, box.y1, z0], [box.x0, box.y1, z0],
    [box.x0, box.y0, z1], [box.x1, box.y0, z1], [box.x1, box.y1, z1], [box.x0, box.y1, z1],
  ];
  const points = locals.map((p) => worldOf(pose, p));
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const zs = points.map((p) => p[2]);
  return {
    id: box.id,
    points,
    corners: [[points[0][0], points[0][1]], [points[1][0], points[1][1]], [points[2][0], points[2][1]], [points[3][0], points[3][1]]],
    minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys),
    z0: Math.min(...zs), z1: Math.max(...zs),
  };
}

/** Local XY rectangles the cabinet occupies (L/U/Parallel lounge = several). */
export function localFootprintBoxes(cab) {
  const result = resultFor(cab.id);
  const mod = getModule(cab.moduleId);
  if (typeof mod.footprintBoxes === "function") {
    const boxes = mod.footprintBoxes(cab.params, result) || [];
    if (boxes.length) {
      const env = envelopeBox(cab, result);
      return boxes.map((b) => ({ ...b, z0: b.z0 ?? env.z0, z1: b.z1 ?? env.z1 }));
    }
  }
  const env = envelopeBox(cab, result);
  return [{ id: "envelope", x0: env.x0, x1: env.x1, y0: env.y0, y1: env.y1, z0: env.z0, z1: env.z1 }];
}

/** One world footprint per local rectangle (walls can sit in an L notch). */
export function cabinetFootprints(cab, pose) {
  return localFootprintBoxes(cab).map((box) => transformBox(box, pose));
}

/** World-space union AABB of the cabinet envelope (or all footprint boxes). */
export function envelopeFootprint(cab, pose) {
  const fps = cabinetFootprints(cab, pose);
  const minX = Math.min(...fps.map((f) => f.minX));
  const maxX = Math.max(...fps.map((f) => f.maxX));
  const minY = Math.min(...fps.map((f) => f.minY));
  const maxY = Math.max(...fps.map((f) => f.maxY));
  const z0 = Math.min(...fps.map((f) => f.z0));
  const z1 = Math.max(...fps.map((f) => f.z1));
  return {
    corners: [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]],
    minX, maxX, minY, maxY, z0, z1,
  };
}

/** Does the cabinet fit inside the space at this pose (floor polygon, obstacles, height)? */
export function poseFits(cab, pose) {
  const fps = cabinetFootprints(cab, pose);
  const sp = getSpace();
  const roofAware = getModule(cab.moduleId).roofAware;
  return fps.every((fp) => {
    const z1 = roofAware && sp ? Math.min(fp.z1, minClearHeight(sp, fp.minY, fp.maxY)) : fp.z1;
    return footprintFits(sp, fp.corners, [fp.z0, z1]);
  });
}

/** Closed local YZ outline of a nose slab: floor, then the roof profile back toward the room face. */
export function slabOutline(profile, depth) {
  const top = profile.slice().sort((a, b) => a[0] - b[0]);
  return [{ y: 0, z: 0 }, { y: depth, z: 0 }, ...top.slice().reverse().map(([y, z]) => ({ y, z })), { y: 0, z: 0 }];
}

export function applyPose(group, pose) {
  group.position.set(pose.x || 0, pose.y || 0, pose.z || 0);
  group.rotation.order = "XYZ";
  group.rotation.set((pose.rotX || 0) * Math.PI / 180, (pose.rotY || 0) * Math.PI / 180, (pose.rotZ || 0) * Math.PI / 180);
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
  const hiddenCount = hasBoards ? result.boards.filter((b) => isBoardHidden(cab, b.id)).length : 0;
  const allBoardsHidden = hasBoards && hiddenCount === result.boards.length;
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
      if (isBoardHidden(cab, b.id)) continue;
      const front = b.category === "front_panel";
      const coats = colourFaces(b);
      const isSel = (sub && sub.boardId === b.id) || (!sub && selRegion && b.zoneId === selRegion);
      const dim = (sub && !isSel) || (selRegion && !isSel);
      // A colour face used to sit on the blue front material, which washed the colour out.
      const plain = coats.length ? doorBodyMaterial(coats[0].finish.colour) : front ? frontMat : carcassMat;
      const faded = coats.length ? doorBodyMaterial(coats[0].finish.colour, { dim: true }) : front ? frontDimMat : carcassDimMat;
      const mat = isSel && !sub && selRegion ? plain : isSel ? boardSelMat : dim ? faded : plain;
      // A board with an outline (robe side cut to the roof, an OHC divider / T3 / T4 with its notches) is drawn
      // from that outline, not its bounding box.
      const { geo, cut } = boardGeometry(b);
      const holder = new THREE.Group();
      const mesh = cut ? new THREE.Mesh(geo, mat) : boxMesh(b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, mat);
      mesh.userData = { kind: "board", cabId: cab.id, boardId: b.id };
      holder.add(mesh);
      const lineMat = dim ? edgeDimMat : edgeMat;
      holder.add(boardEdges(b, lineMat));
      addHingeMarks(holder, b);
      addGrooveMarks(holder, b);
      addEdgeBandMarks(holder, b, dim);
      if (isSel && sub && sub.face) {
        const sheetGeo = faceSheetGeometry(b, sub.face);
        if (sheetGeo) {
          const sheet = new THREE.Mesh(sheetGeo, faceSelMat);
          sheet.renderOrder = 8;
          holder.add(sheet);
        }
      }
      group.add(boardPivot(holder, b, cab));
    }
  } else if (!allRegions.length) {
    // Invalid params: show the envelope as a red ghost so it can still be fixed.
    const ghost = boxMesh(env.x0, env.x1, env.y0, env.y1, env.z0, env.z1, errorMat);
    ghost.userData = { kind: "board", cabId: cab.id, boardId: null };
    group.add(ghost);
  }

  const fits = poseFits(cab, cab.pose);
  const mod = getModule(cab.moduleId);
  // The blue envelope is only there while this box is being dragged. A box that
  // does not fit keeps its red frame so the error stays visible.
  if ((!fits || envelopeDragId === cab.id) && !(allBoardsHidden && !selected)) {
    const envMatNow = !fits ? envMatBad : envMat;
    const envLines = mod.envelopeProfile
      ? new THREE.LineSegments(new THREE.EdgesGeometry(prismYZ(slabOutline(mod.envelopeProfile(cab.params), env.D), env.x0, env.x1)), envMatNow)
      : boxEdges(env.x0, env.x1, env.y0, env.y1, env.z0, env.z1, envMatNow);
    envLines.renderOrder = 5;
    group.add(envLines);
  }

  // Resize command: one double arrow on the chosen envelope face, pointing out of it.
  if (resizeFace && resizeFace.cabId === cab.id) {
    const c = { x: (env.x0 + env.x1) / 2, y: (env.y0 + env.y1) / 2, z: (env.z0 + env.z1) / 2 };
    c[resizeFace.axis] = env[`${resizeFace.axis}${resizeFace.dir > 0 ? 1 : 0}`];
    const type = { x: "W", y: "D", z: "H" }[resizeFace.axis];
    group.add(arrowHandle([c.x, c.y, c.z], type, resizeFace.dir, { kind: "handle", cabId: cab.id, handle: { type: "resize", axis: resizeFace.axis, dir: resizeFace.dir } }));
  }

  // Handles only while the cabinet itself is selected: reading a board / face hides them.
  // Move draws its own triad and hides these so the two don't fight for the click; so does Resize.
  if (selected && !getSubSelection() && !moveOpen && !resizeOpen) {
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
        const standOff = d.front != null ? d.front : 4;
        if (vertical) bar.position.set(d.pos, env.y0 - standOff, mid);
        else bar.position.set(mid, env.y0 - standOff, d.pos);
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
 * A board's Move override: shift and rotate about its centre, in the cabinet frame.
 * Geometry stays in nominal cabinet coordinates; the pivot carries the nudge, so a
 * zero override draws the board where the generator put it.
 */
function boardPivot(holder, b, cab) {
  const o = boardOverride(cab.overrides?.boards?.[b.id]);
  const c = [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2];
  const pivot = new THREE.Group();
  pivot.position.set(c[0] + o.x, c[1] + o.y, c[2] + o.z);
  pivot.rotation.order = "XYZ";
  pivot.rotation.set(o.rotX * Math.PI / 180, o.rotY * Math.PI / 180, o.rotZ * Math.PI / 180);
  holder.position.set(-c[0], -c[1], -c[2]);
  pivot.add(holder);
  return pivot;
}

/**
 * On-demand handle (`mod.handlesOnDemand`): the panel arms one dimension of the
 * selected cabinet and a double arrow appears in 3D along that axis; dragging
 * it works exactly like the cube handles. It disappears on Esc, when the
 * selection changes, or when armed again (toggle). `{ cabId, type }` or null.
 */
let armedHandle = null;
/** Move is open: the resize cubes stay hidden so the triad gets the click. */
let moveOpen = false;
export function setMoveOpen(on) {
  if (moveOpen === on) return;
  moveOpen = on;
  syncCabinets();
}

/** Resize command: open (hides the cubes) and the face carrying the arrow, `{ cabId, axis, dir }` in cabinet-local axes. */
let resizeOpen = false;
let resizeFace = null;
/** The cabinet whose envelope is being dragged (handle or Resize). The blue box shows only then. */
let envelopeDragId = null;
export function setEnvelopeDrag(cabId) {
  const next = cabId || null;
  if (envelopeDragId === next) return;
  envelopeDragId = next;
  syncCabinets();
}
export function setResizeState(open, face = null) {
  resizeOpen = open;
  resizeFace = open ? face : null;
  syncCabinets();
}

/** Nearest cabinet envelope face under the ray, seen from outside: `{ cabId, axis, dir, t }` in cabinet-local axes, or null. */
export function pickEnvelopeFace(ray) {
  let best = null;
  const inv = new THREE.Matrix4();
  for (const cab of getJob().cabinets) {
    const g = groups.get(cab.id);
    if (!g) continue;
    inv.copy(g.matrixWorld).invert();
    const o = new THREE.Vector3(ray.origin.x, ray.origin.y, ray.origin.z).applyMatrix4(inv);
    const d = new THREE.Vector3(ray.direction.x, ray.direction.y, ray.direction.z).transformDirection(inv);
    const hit = rayBoxEntry(o, d, envelopeBox(cab, resultFor(cab.id)));
    if (hit && (!best || hit.t < best.t)) best = { cabId: cab.id, ...hit };
  }
  return best;
}

function rayBoxEntry(o, d, b) {
  let tmin = -Infinity;
  let tmax = Infinity;
  let face = null;
  for (const a of ["x", "y", "z"]) {
    const lo = b[`${a}0`];
    const hi = b[`${a}1`];
    if (Math.abs(d[a]) < 1e-12) {
      if (o[a] < lo || o[a] > hi) return null;
      continue;
    }
    let t1 = (lo - o[a]) / d[a];
    let t2 = (hi - o[a]) / d[a];
    let f1 = { axis: a, dir: -1 };
    if (t1 > t2) { [t1, t2] = [t2, t1]; f1 = { axis: a, dir: 1 }; }
    if (t1 > tmin) { tmin = t1; face = f1; }
    if (t2 < tmax) tmax = t2;
  }
  if (!face || tmin <= 0 || tmax < tmin) return null;
  return { t: tmin, ...face };
}

/** A cabinet-local envelope face as a world face (`{ axis, dir, value, ext }`) for showFaceHint. */
export function envelopeFaceWorld(cab, axis, dir) {
  const b = envelopeBox(cab, resultFor(cab.id));
  const at = b[`${axis}${dir > 0 ? 1 : 0}`];
  const [u, v] = ["x", "y", "z"].filter((a) => a !== axis);
  const pts = [];
  for (const pu of [b[`${u}0`], b[`${u}1`]]) {
    for (const pv of [b[`${v}0`], b[`${v}1`]]) {
      const p = { [axis]: at, [u]: pu, [v]: pv };
      pts.push(worldOf(cab.pose, [p.x, p.y, p.z]));
    }
  }
  const ext = {};
  ["x", "y", "z"].forEach((a, i) => { ext[a] = [Math.min(...pts.map((p) => p[i])), Math.max(...pts.map((p) => p[i]))]; });
  const flat = ["x", "y", "z"].reduce((m, a) => (ext[a][1] - ext[a][0] < ext[m][1] - ext[m][0] ? a : m), "x");
  const n = localAxisDir(cab.pose, axis);
  return { axis: flat, dir: Math.sign(n[flat] * dir) || 1, value: ext[flat][0], ext };
}

/** World direction of a cabinet-local axis. */
export function localAxisDir(pose, axis) {
  const o = worldOf(pose, [0, 0, 0]);
  const p = worldOf(pose, [axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0]);
  return { x: p[0] - o[0], y: p[1] - o[1], z: p[2] - o[2] };
}
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
 * the board has no faces or the hit is not a board). The point is taken back into the board's
 * nominal cabinet frame, undoing a Move override, so it still matches the generator's box.
 */
export function faceUnderHit(hit) {
  const ud = hit?.object?.userData;
  if (!ud || ud.kind !== "board" || !ud.boardId) return null;
  const group = groups.get(ud.cabId);
  const board = (resultFor(ud.cabId)?.boards || []).find((b) => b.id === ud.boardId);
  if (!group || !board) return { cabId: ud.cabId, boardId: ud.boardId, faceId: null };
  const n = hit.face ? hit.face.normal.clone() : new THREE.Vector3(0, 0, 1);
  const p = group.worldToLocal(hit.point.clone());
  const cab = getJob().cabinets.find((c) => c.id === ud.cabId);
  const center = [(board.x0 + board.x1) / 2, (board.y0 + board.y1) / 2, (board.z0 + board.z1) / 2];
  const nom = nominalBoardPoint([p.x, p.y, p.z], center, cab?.overrides?.boards?.[board.id]);
  return { cabId: ud.cabId, boardId: ud.boardId, faceId: faceAtHit(board, { x: n.x, y: n.y, z: n.z }, { x: nom[0], y: nom[1], z: nom[2] }) };
}

// --- Move triad -----------------------------------------------------------------
// World-aligned, drawn at the target's centre: red X, green Y, blue Z.
// One arrow and one ring per axis. Local size is 1 along the arrow; layoutMoveTriad
// scales it so the arrow stays about the same size on screen.

const TRIAD_ARROW = 1;
const AXIS_COLOR = { x: 0xe24b4b, y: 0x3cba54, z: 0x4f86e0 };
const AXIS_DIR = {
  x: new THREE.Vector3(1, 0, 0),
  y: new THREE.Vector3(0, 1, 0),
  z: new THREE.Vector3(0, 0, 1),
};

const moveRoot = new THREE.Group();
moveRoot.name = "move-triad";
moveRoot.visible = false;
moveRoot.renderOrder = 40;
scene.add(moveRoot);

function triadMat(axis) {
  return new THREE.MeshBasicMaterial({ color: AXIS_COLOR[axis], depthTest: false, transparent: true, opacity: 0.95 });
}

function addArrow(axis) {
  const mat = triadMat(axis);
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.58, 10), mat);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.22, 12), mat);
  shaft.position.y = 0.22 + 0.29;
  head.position.y = 0.22 + 0.58 + 0.11;
  const ud = { kind: "moveAxis", axis, op: "translate" };
  shaft.userData = ud;
  head.userData = ud;
  shaft.renderOrder = 40;
  head.renderOrder = 40;
  g.add(shaft, head);
  g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), AXIS_DIR[axis]);
  moveRoot.add(g);
}

function addRing(axis) {
  const mat = triadMat(axis);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.032, 8, 40), mat);
  if (axis === "x") ring.rotation.y = Math.PI / 2;
  else if (axis === "y") ring.rotation.x = Math.PI / 2;
  ring.userData = { kind: "moveAxis", axis, op: "rotate" };
  ring.renderOrder = 40;
  moveRoot.add(ring);
}

for (const axis of ["x", "y", "z"]) {
  addArrow(axis);
  addRing(axis);
}

let moveHover = [];
export function setMoveHover(mesh) {
  for (const m of moveHover) m.material.color.setHex(AXIS_COLOR[m.userData.axis]);
  moveHover = [];
  if (!mesh || mesh.userData.kind !== "moveAxis") return;
  const parts = mesh.parent && mesh.userData.op === "translate" ? mesh.parent.children : [mesh];
  for (const m of parts) {
    if (!m.material || !m.userData) continue;
    m.material.color.setHex(0xfff4c2);
    moveHover.push(m);
  }
}

/** Put the triad at a world point, or hide it when the target is not chosen yet. */
export function placeMoveTriad(point) {
  if (!point) { moveRoot.visible = false; setMoveHover(null); return; }
  moveRoot.visible = true;
  moveRoot.position.set(point[0], point[1], point[2]);
  layoutMoveTriad();
}
export function hideMoveTriad() {
  placeMoveTriad(null);
}
export function layoutMoveTriad() {
  if (!moveRoot.visible) return;
  const dist = Math.max(camera.position.distanceTo(moveRoot.position), 400);
  const h = canvas.clientHeight || 800;
  const worldPerPx = 2 * Math.tan((camera.fov * Math.PI / 180) / 2) * dist / h;
  moveRoot.scale.setScalar((52 * worldPerPx) / TRIAD_ARROW);
}

/** All meshes that can be picked with the left button. */
export function pickables() {
  const out = [];
  const take = (o) => {
    if (o.isMesh && o.userData && (o.userData.kind === "board" || o.userData.kind === "handle" || o.userData.kind === "cplane" || o.userData.kind === "moveAxis")) out.push(o);
  };
  root.traverse(take);
  cplaneRoot.traverse(take);
  moveRoot.traverse(take);
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
const ghostB = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), ghostMat);
ghostB.visible = false;
scene.add(ghostB);
const ghostBEdges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: 0x4f86e0 }));
ghostBEdges.visible = false;
scene.add(ghostBEdges);

/**
 * Ø35 (or whatever the feature says) rings at each hinge cup. Doors are XZ boards;
 * face-local (u, v) is (x, z) from the board origin. One ring on each big face.
 */
const PLANE_AXES = { XY: ["x", "y", "z"], XZ: ["x", "z", "y"], YZ: ["y", "z", "x"] };

function grooveLoop(group, U, V, T, u0, u1, v0, v1, t) {
  const pts = [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]].map(([u, v]) => {
    const p = new THREE.Vector3();
    p[U] = u;
    p[V] = v;
    p[T] = t;
    return p;
  });
  const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), grooveLineMat);
  line.userData = { kind: "groove" };
  group.add(line);
}

/** Dark floor in the pocket and the slot outline, on the machined face only. Display only. */
function addGrooveMarks(group, b) {
  const axes = PLANE_AXES[b.profilePlane];
  if (!axes || !b.faces) return;
  const [U, V, T] = axes;
  const thick = Math.abs(b[`${T}1`] - b[`${T}0`]);
  for (const face of b.faces) {
    if (face.id !== "A" && face.id !== "B") continue;
    const sign = face.id === "A" ? 1 : -1;
    const tFace = sign === 1 ? b[`${T}1`] : b[`${T}0`];
    for (const ft of face.features || []) {
      if ((ft.kind !== "groove" && ft.kind !== "tgroove") || !Number.isFinite(ft.u0) || !Number.isFinite(ft.v0)) continue;
      const u0 = b[`${U}0`] + Math.min(ft.u0, ft.u1);
      const u1 = b[`${U}0`] + Math.max(ft.u0, ft.u1);
      const v0 = b[`${V}0`] + Math.min(ft.v0, ft.v1);
      const v1 = b[`${V}0`] + Math.max(ft.v0, ft.v1);
      if (u1 - u0 < 0.5 || v1 - v0 < 0.5) continue;
      grooveLoop(group, U, V, T, u0, u1, v0, v1, tFace + sign * 0.6);
      const depth = Math.min(ft.depth || 0, thick - 0.4);
      if (!(depth > 0.4)) continue;
      const size = { x: 0.4, y: 0.4, z: 0.4 };
      const pos = { x: 0, y: 0, z: 0 };
      size[U] = Math.max(u1 - u0 - 0.6, 0.4);
      size[V] = Math.max(v1 - v0 - 0.6, 0.4);
      size[T] = 0.6;
      pos[U] = (u0 + u1) / 2;
      pos[V] = (v0 + v1) / 2;
      pos[T] = tFace - sign * (depth - 0.4);
      const fill = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), grooveFloorMat);
      fill.position.set(pos.x, pos.y, pos.z);
      fill.renderOrder = 3;
      fill.userData = { kind: "groove" };
      group.add(fill);
    }
  }
}

/**
 * Edge tape on a banded outline edge. Pre-mill means the tape does not add to
 * the outline: the strip only recolours the narrow face (the board thickness).
 * Colour is the stored name — door swatch, or White Stipple for carcass.
 */
function addEdgeBandMarks(group, b, dim) {
  const axes = PLANE_AXES[b.profilePlane];
  if (!axes || !b.faces) return;
  const [U, V, T] = axes;
  const t0 = b[`${T}0`];
  const t1 = b[`${T}1`];
  const thick = Math.abs(t1 - t0);
  const tMid = (t0 + t1) / 2;
  const thickAxis = new THREE.Vector3();
  thickAxis[T] = 1;
  for (const face of b.faces) {
    const band = face.finish && face.finish.edgeBand;
    if (!band || !face.edge) continue;
    const p0 = { x: 0, y: 0, z: 0 };
    const p1 = { x: 0, y: 0, z: 0 };
    p0[U] = b[`${U}0`] + face.edge.from[0];
    p0[V] = b[`${V}0`] + face.edge.from[1];
    p1[U] = b[`${U}0`] + face.edge.to[0];
    p1[V] = b[`${V}0`] + face.edge.to[1];
    p0[T] = tMid;
    p1[T] = tMid;
    const along = new THREE.Vector3(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
    const len = along.length();
    if (len < 1) continue;
    along.multiplyScalar(1 / len);
    const normal = new THREE.Vector3();
    if (typeof face.normal === "string") {
      normal[face.normal[1].toLowerCase()] = face.normal[0] === "+" ? 1 : -1;
    } else if (Array.isArray(face.normal)) {
      normal.set(face.normal[0], face.normal[1], face.normal[2]);
    }
    if (normal.lengthSq() < 1e-8) continue;
    normal.normalize();
    const mat = band.colour === "White Stipple" ? (dim ? carcassDimMat : carcassMat) : doorBodyMaterial(band.colour, { dim: !!dim });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(len, thick, 0.2), mat);
    bar.position.set(
      (p0.x + p1.x) / 2 + normal.x * 0.15,
      (p0.y + p1.y) / 2 + normal.y * 0.15,
      (p0.z + p1.z) / 2 + normal.z * 0.15,
    );
    bar.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(along, thickAxis, normal));
    bar.renderOrder = 6;
    bar.userData = { kind: "edgeBand" };
    group.add(bar);
  }
}

function addHingeMarks(group, b) {
  if (b.profilePlane !== "XZ" || b.thicknessAxis !== "Y" || !b.faces) return;
  const face = b.faces.find((f) => f.id === "A");
  if (!face) return;
  for (const ft of face.features || []) {
    if (ft.kind !== "hole" || ft.for !== "hinge" || !ft.center) continue;
    const radius = (ft.diameter || 35) / 2;
    const x = b.x0 + ft.center[0];
    const z = b.z0 + ft.center[1];
    for (const y of [b.y0 - 0.8, b.y1 + 0.8]) {
      const mark = new THREE.Mesh(new THREE.RingGeometry(radius - 1.2, radius, 40), hingeMat);
      mark.rotation.x = -Math.PI / 2;
      mark.position.set(x, y, z);
      mark.userData = { kind: "hinge" };
      group.add(mark);
    }
  }
}

/** Axis-aligned preview box from min corner (x0, y0, z0). `clamped` turns the outline orange. */
export function showGhost(x0, y0, z0, W, D, H, { clamped = false, also = null } = {}) {
  for (const m of [ghost, ghostEdges]) {
    m.visible = true;
    m.scale.set(Math.max(W, 1), Math.max(D, 1), Math.max(H, 1));
    m.position.set(x0 + W / 2, y0 + D / 2, z0 + H / 2);
  }
  ghostEdges.material.color.setHex(clamped ? 0xf0a050 : 0x4f86e0);
  ghostB.visible = !!also;
  ghostBEdges.visible = !!also;
  if (also) {
    for (const m of [ghostB, ghostBEdges]) {
      m.scale.set(Math.max(also.W, 1), Math.max(also.D, 1), Math.max(also.H, 1));
      m.position.set(also.x0 + also.W / 2, also.y0 + also.D / 2, also.z0 + also.H / 2);
    }
    ghostBEdges.material.color.setHex(clamped ? 0xf0a050 : 0x4f86e0);
  }
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
const HINT_TONES = { "": 0x4f86e0, pending: 0xf0a050, done: 0x7cf09c, warn: 0xd94b4b };
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
  ghostB.visible = false;
  ghostBEdges.visible = false;
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

/** Up to three floor boxes plus an optional segment, for lounge placement. */
const loungeSlots = [0x4f86e0, 0xf0c070, 0x9ec5d8].map((hex) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: 0.22, depthWrite: false }));
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)), new THREE.LineBasicMaterial({ color: hex }));
  mesh.visible = false;
  edges.visible = false;
  mesh.renderOrder = 25;
  edges.renderOrder = 26;
  scene.add(mesh, edges);
  return { mesh, edges };
});
const loungeLines = [0x4f86e0, 0xf0a050].map((hex) => {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(6), 3));
  const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color: hex, depthTest: false }));
  line.visible = false;
  line.renderOrder = 27;
  scene.add(line);
  return line;
});
/** `boxes` are world AABBs {x0,y0,x1,y1,z0,z1}. `segments` is up to two edges [{a,b}]. */
export function showLoungeGhost(boxes, segments = null) {
  hideLoungeGhost();
  (boxes || []).slice(0, loungeSlots.length).forEach((b, i) => {
    const slot = loungeSlots[i];
    const W = Math.max(b.x1 - b.x0, 1);
    const D = Math.max(b.y1 - b.y0, 1);
    const H = Math.max((b.z1 ?? 40) - (b.z0 ?? 0), 1);
    for (const m of [slot.mesh, slot.edges]) {
      m.visible = true;
      m.scale.set(W, D, H);
      m.position.set(b.x0 + W / 2, b.y0 + D / 2, (b.z0 ?? 0) + H / 2);
    }
  });
  (segments || []).slice(0, loungeLines.length).forEach((seg, i) => {
    const line = loungeLines[i];
    const pos = line.geometry.attributes.position;
    pos.setXYZ(0, seg.a.x, seg.a.y, seg.a.z || 0);
    pos.setXYZ(1, seg.b.x, seg.b.y, seg.b.z || 0);
    pos.needsUpdate = true;
    line.geometry.computeBoundingSphere();
    line.visible = true;
  });
}
export function hideLoungeGhost() {
  for (const slot of loungeSlots) {
    slot.mesh.visible = false;
    slot.edges.visible = false;
  }
  for (const line of loungeLines) line.visible = false;
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
