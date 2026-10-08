// A wheel-arch pair lives on the space (job.space.params.wheelArches), in
// world millimetres. One record is both sides: the same span along the van
// (Y, the rear edge toward the back wall), the same width in from each side
// wall, the same height from the floor. It is not an obstacle — a cabinet
// may stand in it. Kitchen / ensuite project a hit on the carcass back into
// wheelAvoidances; a partition is notched up to the arch height.
import { localOf } from "./pose.js";

/** World arch boxes clipped into a lounge's local frame. Empty when the lounge misses every arch. */
export function loungePlanArches(pose, env, worldBoxes) {
  const out = [];
  const round = (n) => Math.round(n);
  for (const box of worldBoxes || []) {
    const corners = [
      [box.x0, box.y0, box.z0], [box.x1, box.y0, box.z0], [box.x1, box.y1, box.z0], [box.x0, box.y1, box.z0],
      [box.x0, box.y0, box.z1], [box.x1, box.y0, box.z1], [box.x1, box.y1, box.z1], [box.x0, box.y1, box.z1],
    ].map((p) => localOf(pose, p));
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const zs = corners.map((p) => p[2]);
    const x0 = Math.max(0, Math.min(...xs));
    const x1 = Math.min(env.W, Math.max(...xs));
    const y0 = Math.max(0, Math.min(...ys));
    const y1 = Math.min(env.D, Math.max(...ys));
    const z0 = Math.max(0, Math.min(...zs));
    const z1 = Math.min(env.H, Math.max(...zs));
    if (!(x1 - x0 > 1 && y1 - y0 > 1 && z1 - z0 > 1)) continue;
    out.push({ id: box.id, x0: round(x0), x1: round(x1), y0: round(y0), y1: round(y1), z0: round(z0), z1: round(z1) });
  }
  return out;
}

export const ARCH_MIN_MM = 50;

const round = (n) => Math.round(n);

function finite(n) {
  return Number.isFinite(n) ? n : NaN;
}

/** Clamp one pair into the floor. Null when the numbers cannot make a pair. */
export function clampArch(raw, bounds) {
  if (!raw || !bounds) return null;
  const spanX = bounds.maxX - bounds.minX;
  const yRear = Math.min(bounds.maxY, Math.max(bounds.minY + ARCH_MIN_MM, finite(raw.yRear)));
  const length = Math.min(yRear - bounds.minY, Math.max(ARCH_MIN_MM, finite(raw.length)));
  const width = Math.min(spanX / 2, Math.max(ARCH_MIN_MM, finite(raw.width)));
  const height = Math.max(1, finite(raw.height));
  if (![yRear, length, width, height].every(Number.isFinite)) return null;
  return { id: raw.id, yRear: round(yRear), length: round(length), width: round(width), height: round(height) };
}

/** Left and right boxes of one pair. Ids are `<id>-L` / `<id>-R`. */
export function archBoxes(arch, bounds) {
  const a = clampArch(arch, bounds);
  if (!a) return [];
  const y0 = a.yRear - a.length;
  const y1 = a.yRear;
  const base = { pair: a.id, y0, y1, z0: 0, z1: a.height };
  return [
    { ...base, id: `${a.id}-L`, side: "left", x0: bounds.minX, x1: bounds.minX + a.width },
    { ...base, id: `${a.id}-R`, side: "right", x0: bounds.maxX - a.width, x1: bounds.maxX },
  ];
}

export function archesToBoxes(arches, bounds) {
  const out = [];
  for (const a of arches || []) out.push(...archBoxes(a, bounds));
  return out;
}

/**
 * Kitchen / ensuite avoidances for the boxes whose overlap reaches the
 * carcass back (local y = D − front thickness). `depth` is how far that
 * overlap comes forward from the back; `x0`/`x1` are along the cabinet.
 * A box that misses the back is left out — the generator only cuts the
 * rear lower corner.
 */
export function baseAvoidances(cab, boxes) {
  const { pose, W, D, H, frontThickness } = cab;
  const cd = D - frontThickness;
  if (!(W > 0 && cd > 0 && H > 0)) return [];
  const out = [];
  for (const box of boxes || []) {
    const corners = [
      [box.x0, box.y0, 0], [box.x1, box.y0, 0], [box.x1, box.y1, 0], [box.x0, box.y1, 0],
      [box.x0, box.y0, box.z1], [box.x1, box.y0, box.z1], [box.x1, box.y1, box.z1], [box.x0, box.y1, box.z1],
    ].map((p) => localOf(pose, p));
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    const zs = corners.map((p) => p[2]);
    const x0 = Math.max(0, Math.min(...xs));
    const x1 = Math.min(W, Math.max(...xs));
    const y0 = Math.max(0, Math.min(...ys));
    const y1 = Math.min(cd, Math.max(...ys));
    if (!(x1 - x0 > 1 && y1 > y0 && y1 >= cd - 1)) continue;
    const depth = round(cd - y0);
    const height = round(Math.max(0, Math.min(Math.max(...zs), H)));
    if (!(depth > 0 && height > 0)) continue;
    out.push({ id: box.id, x0: round(x0), x1: round(x1), height, depth });
  }
  return out;
}

function mergeCuts(cuts) {
  const list = cuts
    .filter((c) => c.u1 - c.u0 > 1 && c.z > 0)
    .map((c) => ({ u0: Math.min(c.u0, c.u1), u1: Math.max(c.u0, c.u1), z: c.z }))
    .sort((a, b) => a.u0 - b.u0);
  const out = [];
  for (const c of list) {
    const prev = out[out.length - 1];
    if (prev && c.u0 <= prev.u1 + 0.5) {
      prev.u1 = Math.max(prev.u1, c.u1);
      prev.z = Math.max(prev.z, c.z);
    } else out.push({ ...c });
  }
  return out;
}

/**
 * Where a wall's footprint crosses an arch box: a floor notch `{u0, u1, z}`
 * in the wall's (u, z) outline. `solid` is a wallSolid (axis, thickness box,
 * u span, z0/z1).
 */
export function wallNotches(solid, boxes) {
  const cuts = [];
  for (const box of boxes || []) {
    if (!(box.z1 > solid.z0 + 1)) continue;
    const z = Math.min(box.z1, solid.z1 - 1);
    if (!(z > solid.z0 + 1)) continue;
    if (solid.axis === "y") {
      if (box.y1 <= solid.y0 + 0.5 || box.y0 >= solid.y1 - 0.5) continue;
      const u0 = Math.max(solid.u0, box.x0);
      const u1 = Math.min(solid.u1, box.x1);
      if (u1 - u0 > 1) cuts.push({ u0, u1, z });
    } else {
      if (box.x1 <= solid.x0 + 0.5 || box.x0 >= solid.x1 - 0.5) continue;
      const u0 = Math.max(solid.u0, box.y0);
      const u1 = Math.min(solid.u1, box.y1);
      if (u1 - u0 > 1) cuts.push({ u0, u1, z });
    }
  }
  return mergeCuts(cuts);
}

const near = (a, b) => Math.abs(a - b) < 0.6;

function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const prev = out[out.length - 1];
    if (prev && near(prev.u, p.u) && near(prev.z, p.z)) {
      if (!prev.bulge && p.bulge) prev.bulge = p.bulge;
      continue;
    }
    out.push(p.bulge ? { u: p.u, z: p.z, bulge: p.bulge } : { u: p.u, z: p.z });
  }
  return out;
}

/** Raise the floor edge of a closed (u, z) outline over each cut. */
export function notchFloor(outline, cuts) {
  if (!outline || outline.length < 4 || !cuts?.length) return outline;
  const zFloor = Math.min(...outline.map((p) => p.z));
  const merged = mergeCuts(cuts.filter((c) => c.z > zFloor + 0.5));
  if (!merged.length) return outline;
  const closed = near(outline[0].u, outline[outline.length - 1].u) && near(outline[0].z, outline[outline.length - 1].z);
  const pts = closed ? outline.slice(0, -1) : outline.slice();
  const out = [];
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    out.push(a.bulge ? { u: a.u, z: a.z, bulge: a.bulge } : { u: a.u, z: a.z });
    if (!(near(a.z, zFloor) && near(b.z, zFloor) && Math.abs(b.u - a.u) > 1)) continue;
    const dir = b.u >= a.u ? 1 : -1;
    const lo = Math.min(a.u, b.u);
    const hi = Math.max(a.u, b.u);
    const hits = merged
      .filter((c) => c.u1 > lo + 0.5 && c.u0 < hi - 0.5)
      .map((c) => ({ u0: Math.max(c.u0, lo), u1: Math.min(c.u1, hi), z: c.z }))
      .sort((p, q) => (p.u0 - q.u0) * dir);
    for (const h of hits) {
      const start = dir > 0 ? h.u0 : h.u1;
      const end = dir > 0 ? h.u1 : h.u0;
      if (!near(start, a.u)) out.push({ u: start, z: zFloor });
      out.push({ u: start, z: h.z });
      out.push({ u: end, z: h.z });
      out.push({ u: end, z: zFloor });
    }
  }
  if (closed && out.length) out.push({ u: out[0].u, z: out[0].z });
  return dedupe(out);
}
