// Space-fit geometry. Extracted from cabinets3d / walls3d / interact / yield /
// ui so legality checks (does a cabinet fit, what does it overlap, is a wall
// legal, is the job exportable) run without the 3D or interaction layers.
// Everything here is pure math over job state — safe for headless callers
// (tests, the Application API, agents).
import { getSpace, getStock, getWalls, getJob, resultFor } from "./job.js";
import { getModule } from "./modules.js";
import { footprintFits, minClearHeight } from "./spaces.js";
import { worldOf } from "./pose.js";
import { wallBoxes, allWallParts, wallStatus } from "./walls.js";

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
