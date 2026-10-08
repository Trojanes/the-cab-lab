// Space-fit geometry. Extracted from cabinets3d / walls3d / interact / yield /
// ui so legality checks (does a cabinet fit, what does it overlap, is a wall
// legal, is the job exportable) run without the 3D or interaction layers.
// Everything here is pure math over job state — safe for headless callers
// (tests, the Application API, agents).
import { getSpace, getStock, getWalls, getJob, resultFor } from "./job.js";
import { getModule } from "./modules.js";
import { footprintFits, minClearHeight } from "./spaces.js";
import { worldOf, poseOf, rotatePoseAbout, localAxes } from "./pose.js";
import { wallBoxes, allWallParts, wallStatus } from "./walls.js";

const AXES = ["x", "y", "z"];
export const FRONT_THICKNESS_DEFAULT = 16;

/** Envelope in cabinet-local mm: x 0..W, y -FPT..D, z 0..H. A module with `localBox` supplies its own. */
export function envelopeBox(cab, result) {
  const mod = getModule(cab.moduleId);
  if (typeof mod.localBox === "function") return mod.localBox(cab.params);
  const env = mod.envelope(cab.params);
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
    const fps = cabinetFootprints(cab, cab.pose);
    fps.forEach((fp, i) => {
      boxes.push({
        id: fps.length === 1 ? cab.id : `${cab.id}:${fp.id || i}`,
        kind: "cabinet", cabId: cab.id,
        x: [fp.minX, fp.maxX], y: [fp.minY, fp.maxY], z: [fp.z0, fp.z1],
      });
    });
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

export function overlaps(cab, pose) {
  const fps = cabinetFootprints(cab, pose);
  return solidBoxes().filter((b) => {
    if (b.id === cab.id || b.cabId === cab.id) return false;
    return fps.some((a) =>
      a.minX < b.x[1] - 0.5 && a.maxX > b.x[0] + 0.5
      && a.minY < b.y[1] - 0.5 && a.maxY > b.y[0] + 0.5
      && a.z0 < b.z[1] - 0.5 && a.z1 > b.z[0] + 0.5);
  }).map((b) => b.id);
}

/** Cabinets `cab` overlaps. A module that follows another one (bed box, bed side table) is not a neighbour of it. */
export function cabinetHits(cab) {
  if (!cab) return [];
  const cabinetOf = (id) => getJob().cabinets.find((c) => c.id === id) || null;
  const cabIds = new Set(getJob().cabinets.map((c) => c.id));
  return overlaps(cab, cab.pose).map((id) => id.split(":")[0]).filter((id, i, all) => cabIds.has(id) && all.indexOf(id) === i)
    .filter((id) => !getModule(cab.moduleId).attach && !getModule(cabinetOf(id).moduleId).attach);
}

/**
 * Job-level legality for export: every cabinet inside the space and clear of
 * obstacles, walls, doors, and other cabinets; every wall legal. Mirrors the
 * check the UI export button runs.
 */
export function exportFitIssues() {
  const issues = [];
  const jobData = getJob();
  const wallIds = new Set(getWalls().map((w) => w.id));
  const cabIds = new Set(jobData.cabinets.map((c) => c.id));
  for (const cab of jobData.cabinets) {
    if (!poseFits(cab, cab.pose)) issues.push(`${cab.id} is outside the space or overlaps an obstacle.`);
    const hits = overlaps(cab, cab.pose);
    const walls = hits.filter((id) => wallIds.has(id));
    if (walls.length) issues.push(`${cab.id} overlaps partition ${walls.join(", ")}.`);
    const doors = hits.filter((id) => !wallIds.has(id) && !cabIds.has(id.split(":")[0]));
    if (doors.length) issues.push(`${cab.id} overlaps the sliding door ${doors.join(", ")}.`);
    const cabs = cabinetHits(cab).filter((id) => id > cab.id);
    if (cabs.length) issues.push(`${cab.id} overlaps cabinet ${cabs.join(", ")}.`);
  }
  for (const wall of getWalls()) {
    const st = statusOf(wall);
    if (!st.ok) issues.push(`${wall.id}: ${st.issues.join("; ")}.`);
  }
  return issues;
}

// --- orientation / door side ---------------------------------------------------
//
// A box (world AABB) plus a door side (which vertical side the fronts are on)
// fixes everything: W is the horizontal edge along the door side, D the edge
// through it (minus the fronts), H the height; rotZ turns the generator's −Y
// onto that side and the origin lands on the matching box corner. The box
// itself never moves — changing the door side swaps W/D, not the footprint.
// (Moved from interact.js — pure math over job state.)

export const SIDES = [{ axis: "y", dir: -1 }, { axis: "y", dir: 1 }, { axis: "x", dir: 1 }, { axis: "x", dir: -1 }];

/** rotZ (deg) that turns the fronts (local −Y) toward the world direction `axis` ± `dir`. */
export function rotZFacing(axis, dir) {
  if (axis === "y") return dir > 0 ? 180 : 0;
  return dir > 0 ? 90 : 270;
}
/** Inverse: which world side the fronts of a cabinet with this rotZ are on. */
export function sideOfRotZ(rotZ) {
  const r = (((rotZ || 0) % 360) + 360) % 360;
  return r === 180 ? { axis: "y", dir: 1 } : r === 90 ? { axis: "x", dir: 1 } : r === 270 ? { axis: "x", dir: -1 } : { axis: "y", dir: -1 };
}
export function sideLabel(side) {
  return `${side.dir > 0 ? "+" : "−"}${side.axis.toUpperCase()}`;
}

/**
 * Pose and module size for a world box `{x0,y0,z0,W,D,H}` (W/D/H along X/Y/Z)
 * whose doors are on `side`. `fpt` = front panel thickness kept inside the box.
 * Returns { pose, W, D, H } in module terms.
 */
export function fitBoxFacing(b, side, fpt = FRONT_THICKNESS_DEFAULT) {
  const x1 = b.x0 + b.W;
  const y1 = b.y0 + b.D;
  const along = side.axis === "y" ? b.W : b.D; // door-side edge → W
  const through = side.axis === "y" ? b.D : b.W; // edge through the doors → D + fronts
  const rotZ = rotZFacing(side.axis, side.dir);
  let x;
  let y;
  if (rotZ === 0) { x = b.x0; y = b.y0 + fpt; }
  else if (rotZ === 180) { x = x1; y = y1 - fpt; }
  else if (rotZ === 90) { x = x1 - fpt; y = b.y0; }
  else { x = b.x0 + fpt; y = y1; }
  return { pose: { x, y, z: b.z0, rotZ }, W: along, D: through - fpt, H: b.H };
}

/** Is this side of the box flush against a wall or another cabinet (so doors could not open)? */
export function sideBlocked(b, side, excludeId = null) {
  const lo = { x: b.x0, y: b.y0, z: b.z0 };
  const hi = { x: b.x0 + b.W, y: b.y0 + b.D, z: b.z0 + b.H };
  const at = side.dir > 0 ? hi[side.axis] : lo[side.axis];
  const sp = getSpace();
  if (sp) {
    const bound = side.axis === "x" ? (side.dir > 0 ? sp.bounds.maxX : sp.bounds.minX) : (side.dir > 0 ? sp.bounds.maxY : sp.bounds.minY);
    const wallIdx = side.axis === "y" ? (side.dir > 0 ? 2 : 0) : (side.dir > 0 ? 1 : 3);
    if (Math.abs(at - bound) < 0.5 && (sp.walls || []).includes(wallIdx)) return true;
  }
  const others = AXES.filter((a) => a !== side.axis);
  for (const o of solidBoxes()) {
    if (o.id === excludeId) continue;
    const near = side.dir > 0 ? o[side.axis][0] : o[side.axis][1];
    if (Math.abs(near - at) > 0.5) continue;
    if (others.every((a) => lo[a] < o[a][1] - 0.5 && hi[a] > o[a][0] + 0.5)) return true;
  }
  return false;
}

/**
 * Door side for a new box: never against a wall or a neighbour; a blocked
 * side puts the doors opposite; otherwise the long horizontal edge is the
 * door edge (W), facing the middle of the room (ties: front, −Y).
 */
export function defaultSide(b, excludeId = null) {
  const free = SIDES.filter((s) => !sideBlocked(b, s, excludeId));
  if (!free.length) return SIDES[0];
  const sp = getSpace();
  const cx = b.x0 + b.W / 2;
  const cy = b.y0 + b.D / 2;
  const towardRoom = (s) => {
    if (!sp) return 0;
    const lo = s.axis === "x" ? sp.bounds.minX : sp.bounds.minY;
    const hi = s.axis === "x" ? sp.bounds.maxX : sp.bounds.maxY;
    const c = s.axis === "x" ? cx : cy;
    const off = (c - (lo + hi) / 2) / Math.max(hi - lo, 1);
    if (Math.abs(off) < 0.25) return 0; // the middle half of the room is a tie → front
    return -Math.sign(off) * s.dir; // 1 facing the room centre, −1 facing away
  };
  const edge = (s) => (s.axis === "y" ? b.W : b.D); // W if this side holds the doors
  const opposite = (s) => SIDES.find((t) => t.axis === s.axis && t.dir === -s.dir);
  const blockedOpp = SIDES.filter((s) => sideBlocked(b, s, excludeId)).map(opposite).filter((s) => free.includes(s));
  const pool = blockedOpp.length ? blockedOpp : free;
  const score = (s) => edge(s) * 4 + towardRoom(s) * 2 + (s.axis === "y" && s.dir < 0 ? 1 : 0) - (s.axis === "x" && s.dir < 0 ? 0.5 : 0);
  return pool.slice().sort((a, c) => score(c) - score(a))[0];
}

/** Pose turned `rotZ - current` degrees about world Z through the envelope centre, so R stays a 90° yaw. */
export function poseRotatedTo(cab, rotZ, snap = (v) => v) {
  const env = envelopeBox(cab, resultFor(cab.id));
  const center = [(env.x0 + env.x1) / 2, (env.y0 + env.y1) / 2, (env.z0 + env.z1) / 2];
  const next = rotatePoseAbout(cab.pose, "z", rotZ - (cab.pose.rotZ || 0), center);
  return {
    ...poseOf(cab.pose),
    ...next,
    x: snap(next.x),
    y: snap(next.y),
    z: snap(next.z),
  };
}

/** World AABB of a cabinet's envelope as a placement-style box. */
export function envelopeAsBox(cab) {
  const fp = envelopeFootprint(cab, cab.pose);
  return { x0: fp.minX, y0: fp.minY, z0: fp.z0, W: fp.maxX - fp.minX, D: fp.maxY - fp.minY, H: fp.z1 - fp.z0 };
}

/** What the cabinet becomes with its doors on `side`, or the reason it can't. */
export function orientFit(cab, side) {
  const mod = getModule(cab.moduleId);
  const fpt = envelopeBox(cab, resultFor(cab.id)).fpt;
  const fit = fitBoxFacing(envelopeAsBox(cab), side, fpt);
  const small = ["W", "D"].filter((k) => fit[k] < mod.minSize[k]);
  return { ...fit, small, blocked: sideBlocked(envelopeAsBox(cab), side, cab.id) };
}

/** The documented V1 half-slot conflict still builds the cabinet, so a resize keeps that size. */
export function blockingErrors(errs) {
  return (errs || []).filter((e) => !/half-slot conflict/.test(e));
}

/** What stops a drag: blocking generator errors plus HPL boards past the sheet limit for their grain. */
export function blockingIssues(result) {
  return [...blockingErrors(result?.validation?.errors), ...(result?.grain?.issues || []).map((i) => i.message)];
}
