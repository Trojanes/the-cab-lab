// Partition walls: the 18 / 24 mm boards that split a vehicle into shower,
// ensuite and living areas. Pure geometry and rules — no Three.js here; the
// 3D layer (walls3d.js) and the floor plan (floorplan.js) only draw what
// these functions return.
//
// A wall that does not fit a 1200 × 2400 board (1220 × 2440 sheet, border
// removed) is cut once into two boards that butt together. The cut is derived
// (wallBoards); a drag stores `wall.split = { axis: "u"|"z", at }` and the
// boards are rebuilt from it. Door holes stay CNC cutouts.
//
// Record in job.walls (axis-aligned, floor to roof):
//   { id, axis, at, u0, u1, side, hidden? }
//   axis   the wall's normal: "y" for a wall parallel to the back wall (it runs
//          along X), "x" for one running along Y
//   at     the reference face — the face the offset was measured to when the
//          wall was drawn (world mm along `axis`)
//   side   ±1: the thickness grows from `at` in this direction along `axis`
//   u0,u1  span along the other horizontal axis (u0 < u1)
// Thickness and height are never stored: thickness = stock.partition,
// bottom = floor + floorClearance, top = roof − ceilingClearance, so a change
// in the catalogue moves every wall.
import { clearHeightAt, minClearHeight, pointInsideOrOn } from "./spaces.js";
import { thickness, partitionClearance } from "./materials.js";
import { worldOf } from "./pose.js";
import { getModule, isBaseCabinet } from "./modules.js";

export const WALL_MIN_LENGTH = 50;
export const WALL_MIN_HEIGHT = 50;
const EPS = 0.5;

/** The horizontal axis a wall runs along. */
export function alongAxis(axis) {
  return axis === "x" ? "y" : "x";
}

// Openings cut through a wall:
//   { id, type, from: "lo" | "hi", offset, width, bottom, top, ...type fields }
//   from/offset  measured along the wall from the end the user picked, so the
//                door follows that end when the wall is re-drawn
//   bottom/top   clearance: hole bottom = floor + bottom, hole top = wall top − top
// showerDoor  a rectangle in the middle of the wall, not to the floor, not to the roof.
// slidingDoor the hole goes to the floor (bottom is always 0); two boards hang
//             beside it, both from the Partition stock, derived here and never
//             stored (openingParts):
//   side        ±1 along the wall's axis — the face the door hangs on
//   overlap     the leaf is this much wider than the hole (centred on it)
//   doorHeight  the leaf's height; it stands SLIDING_FLOOR_GAP above the floor
//   leaf        parallel to the wall, SLIDING_GAP clear of its face, drawn closed
//   pelmet      the track cover: `top` high (its underside is level with the hole
//               top), against the roof, SLIDING_GAP clear of the leaf, and as
//               long as the room on that side — it runs until the space or
//               another partition stops it
export const OPENING_MIN_WIDTH = 50;
export const OPENING_MIN_HEIGHT = 50;
export const OPENING_DEFAULT_CLEARANCE = 100;
/** A cabinet standing within this depth in front of (or behind) a door blocks it. */
export const DOOR_CLEAR_DEPTH = 600;
export const OPENING_TYPES = { showerDoor: "Shower door", slidingDoor: "Sliding door" };
export const SLIDING_DEFAULT_OVERLAP = 40;
export const SLIDING_DEFAULT_DOOR_HEIGHT = 1880;
/** Clear distance wall face → leaf, and leaf → pelmet. */
export const SLIDING_GAP = 20;
/** The leaf's bottom edge above the floor. */
export const SLIDING_FLOOR_GAP = 15;
export const SLIDING_MIN_DOOR_HEIGHT = 50;
/** How far the open leaf may stick out past the pelmet before the door is refused. */
export const SLIDING_MAX_OVERHANG = 100;

export function normalizeOpening(raw) {
  if (!raw) return null;
  const offset = Number(raw.offset);
  const width = Number(raw.width);
  if (!Number.isFinite(offset) || !Number.isFinite(width) || width < 1 || offset < 0) return null;
  const nonneg = (v, dflt) => (Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v) * 10) / 10 : dflt);
  const type = raw.type === "slidingDoor" ? "slidingDoor" : "showerDoor";
  const op = {
    id: String(raw.id || ""),
    type,
    from: raw.from === "hi" ? "hi" : "lo",
    offset: Math.round(offset * 10) / 10,
    width: Math.round(width * 10) / 10,
    bottom: nonneg(raw.bottom, OPENING_DEFAULT_CLEARANCE),
    top: nonneg(raw.top, OPENING_DEFAULT_CLEARANCE),
  };
  if (type === "slidingDoor") {
    op.bottom = 0; // always to the floor
    op.side = Number(raw.side) < 0 ? -1 : 1;
    op.overlap = nonneg(raw.overlap, SLIDING_DEFAULT_OVERLAP);
    const h = Number(raw.doorHeight);
    op.doorHeight = Number.isFinite(h) && h >= 1 ? Math.round(h * 10) / 10 : SLIDING_DEFAULT_DOOR_HEIGHT;
  }
  return op;
}

export function normalizeWall(raw) {
  if (!raw || (raw.axis !== "x" && raw.axis !== "y")) return null;
  const at = Number(raw.at);
  const a = Number(raw.u0);
  const b = Number(raw.u1);
  if (![at, a, b].every(Number.isFinite)) return null;
  const u0 = Math.min(a, b);
  const u1 = Math.max(a, b);
  if (u1 - u0 < 1) return null;
  const openings = (Array.isArray(raw.openings) ? raw.openings : []).map(normalizeOpening).filter(Boolean);
  const wall = { id: String(raw.id || ""), axis: raw.axis, at, u0, u1, side: Number(raw.side) < 0 ? -1 : 1, openings };
  if (raw.hidden === true) wall.hidden = true;
  const splitAt = raw.split && Number(raw.split.at);
  if (raw.split && (raw.split.axis === "u" || raw.split.axis === "z") && Number.isFinite(splitAt)) {
    wall.split = { axis: raw.split.axis, at: Math.round(splitAt * 10) / 10 };
  }
  if (raw.fit && raw.fit.overheadId && raw.fit.kitchenId) {
    const radius = Number(raw.fit.radius);
    wall.fit = {
      overheadId: String(raw.fit.overheadId),
      kitchenId: String(raw.fit.kitchenId),
      radius: Number.isFinite(radius) && radius >= 0 ? Math.round(radius * 10) / 10 : FIT_CORNER_RADIUS_MM,
    };
  }
  return wall;
}

export function wallLength(wall) {
  return wall.u1 - wall.u0;
}

/**
 * Height used for a snap on a partition. The board stops short of the floor and
 * the roof by the clearance; that short corner is not a second point. A point
 * on the board's bottom becomes the floor, a point on the board's top becomes
 * the roof. Anything else is unchanged.
 */
export function settleClearanceZ(z, x, y, resolved, clearance) {
  const floorC = clearance && clearance.floor > 0.5 ? clearance.floor : 0;
  const ceilC = clearance && clearance.ceiling > 0.5 ? clearance.ceiling : 0;
  if (floorC && Math.abs(z - floorC) <= 0.5) return 0;
  if (resolved && ceilC) {
    const roof = clearHeightAt(resolved, x, y);
    if (Number.isFinite(roof) && Math.abs(z - (roof - ceilC)) <= 0.5) return roof;
  }
  return z;
}

/** Absolute span of an opening along the wall: { u0, u1 } (from the end it was measured from). */
export function openingSpan(wall, op) {
  if (op.from === "hi") {
    const u1 = wall.u1 - op.offset;
    return { u0: u1 - op.width, u1 };
  }
  const u0 = wall.u0 + op.offset;
  return { u0, u1: u0 + op.width };
}

// --- fit to an overhead and a base ----------------------------------------------------
// The wall's thickness stays the partition stock. Its outline in (u, z) — u
// along the wall, which is the cabinets' depth — steps to those two boxes.
// Back edge = the cabinets' back. Depths are the outer front-to-back size.

export const FIT_OHC_DEPTH_EXTRA_MM = 20;
export const FIT_OHC_BOTTOM_GAP_MM = 20;
export const FIT_NECK_DEPTH_MM = 100;
export const FIT_KITCHEN_HEIGHT_EXTRA_MM = 50;
export const FIT_KITCHEN_DEPTH_EXTRA_MM = 30;
/** Default radius on the four step corners (two outer, two inner). */
export const FIT_CORNER_RADIUS_MM = 50;

let cabinetsOf = () => [];
/** Job binds this so a fitted wall can read the live cabinets without a cycle. */
export function bindCabinets(fn) { cabinetsOf = typeof fn === "function" ? fn : () => []; }

function frontThicknessOf(cab) {
  const n = Number(cab.params && (cab.params.frontPanelThickness ?? cab.params.frontThickness));
  return Number.isFinite(n) && n > 0 ? n : 16;
}

/** Outer front/back in cabinet-local Y, and the world front, back, underside and top. */
export function cabinetOuter(cab) {
  const env = getModule(cab.moduleId).envelope(cab.params);
  const fpt = frontThicknessOf(cab);
  const kitchen = isBaseCabinet(cab.moduleId);
  // Kitchen depth already includes the door. Overhead depth is the carcass; the door hangs in front.
  const frontY = -fpt;
  const backY = kitchen ? env.D - fpt : env.D;
  const depth = kitchen ? env.D : env.D + fpt;
  const front = worldOf(cab.pose, [0, frontY, 0]);
  const back = worldOf(cab.pose, [0, backY, 0]);
  const bottom = worldOf(cab.pose, [0, 0, 0]);
  const top = worldOf(cab.pose, [0, 0, env.H]);
  return { depth, front, back, z0: bottom[2], z1: top[2] };
}

function uCoord(wall, world) {
  return wall.axis === "y" ? world[0] : world[1];
}

/**
 * Stepped (u, z) outline. `backU` is the shared back edge. `sign` is +1 when
 * fronts lie at greater u. `topAt(u)` is the roof. Returns { outline, steps }.
 */
/** Quarter-circle fillet on a 90° corner. Edges shorter than the radius keep a smaller arc. */
function filletCorner(prev, corner, next, radius) {
  const d1 = { u: prev.u - corner.u, z: prev.z - corner.z };
  const d2 = { u: next.u - corner.u, z: next.z - corner.z };
  const l1 = Math.hypot(d1.u, d1.z);
  const l2 = Math.hypot(d2.u, d2.z);
  const dot = l1 > 0 && l2 > 0 ? (d1.u * d2.u + d1.z * d2.z) / (l1 * l2) : 1;
  if (l1 < 1 || l2 < 1 || Math.abs(dot) > 0.2) return [{ u: corner.u, z: corner.z }];
  const r = Math.min(radius, l1 * 0.5, l2 * 0.5);
  if (r < 1) return [{ u: corner.u, z: corner.z }];
  const n1 = { u: d1.u / l1, z: d1.z / l1 };
  const n2 = { u: d2.u / l2, z: d2.z / l2 };
  const t1 = { u: corner.u + n1.u * r, z: corner.z + n1.z * r };
  const t2 = { u: corner.u + n2.u * r, z: corner.z + n2.z * r };
  const center = { u: corner.u + (n1.u + n2.u) * r, z: corner.z + (n1.z + n2.z) * r };
  const a0 = Math.atan2(t1.z - center.z, t1.u - center.u);
  const a1 = Math.atan2(t2.z - center.z, t2.u - center.u);
  let sweep = a1 - a0;
  while (sweep <= -Math.PI) sweep += Math.PI * 2;
  while (sweep > Math.PI) sweep -= Math.PI * 2;
  const steps = Math.max(2, Math.ceil(Math.abs(sweep) / (Math.PI / 8)));
  const pts = [{ u: round1(t1.u), z: round1(t1.z) }];
  for (let i = 1; i < steps; i += 1) {
    const a = a0 + sweep * (i / steps);
    pts.push({ u: round1(center.u + Math.cos(a) * r), z: round1(center.z + Math.sin(a) * r) });
  }
  pts.push({ u: round1(t2.u), z: round1(t2.z) });
  return pts;
}

function roundMarkedCorners(pts, radius) {
  const closed = pts.length > 1 && Math.abs(pts[0].u - pts[pts.length - 1].u) < 0.05 && Math.abs(pts[0].z - pts[pts.length - 1].z) < 0.05;
  const ring = closed ? pts.slice(0, -1) : pts.slice();
  const n = ring.length;
  if (!(radius >= 1) || n < 3) return pts;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const cur = ring[i];
    if (!cur.round) { out.push({ u: cur.u, z: cur.z }); continue; }
    const prev = ring[(i + n - 1) % n];
    const next = ring[(i + 1) % n];
    out.push(...filletCorner(prev, cur, next, radius));
  }
  if (out.length) out.push({ u: out[0].u, z: out[0].z });
  return out;
}

export function fitOutline({ backU, sign, z0, topAt, kitchenTop, kitchenDepth, ohcBottom, ohcDepth, samples = [], radius = 0 }) {
  const kDepth = kitchenDepth + FIT_KITCHEN_DEPTH_EXTRA_MM;
  const oDepth = ohcDepth + FIT_OHC_DEPTH_EXTRA_MM;
  const kTop = kitchenTop + FIT_KITCHEN_HEIGHT_EXTRA_MM;
  const oBot = ohcBottom + FIT_OHC_BOTTOM_GAP_MM;
  const warnings = [];
  const bands = [];
  if (oBot - kTop >= 1) {
    bands.push({ z1: kTop, depth: kDepth });
    bands.push({ z1: oBot, depth: FIT_NECK_DEPTH_MM });
    bands.push({ z1: Infinity, depth: oDepth });
  } else {
    warnings.push("the overhead and the base meet — the 100 mm neck is skipped");
    bands.push({ z1: kTop, depth: kDepth });
    bands.push({ z1: Infinity, depth: oDepth });
  }
  const uAt = (depth) => backU + sign * depth;
  const chain = [{ u: backU, z: z0 }];
  let z = z0;
  for (const band of bands) {
    const z1 = Math.min(band.z1, topAt(uAt(band.depth)));
    if (z1 <= z + 0.5) continue;
    const frontU = round1(uAt(band.depth));
    chain.push({ u: frontU, z: round1(z), round: z > z0 + 0.5 });
    chain.push({ u: frontU, z: round1(z1), round: z1 < topAt(uAt(band.depth)) - 0.5 });
    z = z1;
  }
  if (chain.length < 3) return { outline: null, warnings: [...warnings, "the fitted outline has no height under the roof"], steps: null };
  const front = chain[chain.length - 1];
  const backTop = round1(topAt(backU));
  const seen = new Set(chain.map((p) => round1(p.u)));
  const mids = samples
    .map((u) => round1(u))
    .filter((u) => (u - backU) * (u - front.u) < 0 && !seen.has(u))
    .sort((a, b) => Math.abs(a - front.u) - Math.abs(b - front.u));
  for (const u of mids) chain.push({ u, z: round1(topAt(u)) });
  chain.push({ u: round1(backU), z: backTop });
  chain.push({ u: round1(backU), z: round1(z0) });
  const rounded = roundMarkedCorners(chain, radius);
  const outline = [];
  for (const p of rounded) {
    const prev = outline[outline.length - 1];
    if (prev && Math.abs(prev.u - p.u) < 0.05 && Math.abs(prev.z - p.z) < 0.05) continue;
    outline.push(p);
  }
  const steps = {
    kitchenDepth: kDepth,
    kitchenTop: round1(Math.min(kTop, topAt(uAt(kDepth)))),
    neckDepth: FIT_NECK_DEPTH_MM,
    overheadDepth: oDepth,
    overheadBottom: round1(oBot),
  };
  return { outline, warnings, steps };
}

function round1(n) { return Math.round(n * 10) / 10; }

function fitRadius(wall) {
  const n = Number(wall.fit && wall.fit.radius);
  return Number.isFinite(n) && n >= 0 ? n : FIT_CORNER_RADIUS_MM;
}

/**
 * Live overhead + base for a wall that has `fit`, or null when it does not.
 * `warnings` explain a fit that could not be applied.
 */
export function readFit(wall) {
  if (!wall || !wall.fit) return null;
  const list = cabinetsOf() || [];
  const warnings = [];
  const ohc = list.find((c) => c.id === wall.fit.overheadId);
  const kit = list.find((c) => c.id === wall.fit.kitchenId);
  if (!ohc || ohc.moduleId !== "overheadCabinet") warnings.push(`${wall.fit.overheadId}: overhead is missing`);
  if (!kit || !isBaseCabinet(kit.moduleId)) warnings.push(`${wall.fit.kitchenId}: base is missing`);
  if (warnings.length) return { warnings, outline: null, steps: null };
  const o = cabinetOuter(ohc);
  const k = cabinetOuter(kit);
  const oBack = uCoord(wall, o.back);
  const oFront = uCoord(wall, o.front);
  const kBack = uCoord(wall, k.back);
  const kFront = uCoord(wall, k.front);
  const along = (front, back) => {
    const span = Math.hypot(front[0] - back[0], front[1] - back[1]);
    const du = Math.abs(uCoord(wall, front) - uCoord(wall, back));
    return span < 1 || du >= span * 0.85;
  };
  if (!along(k.front, k.back) || !along(o.front, o.back)) {
    warnings.push("this wall does not run along the cabinet depth");
    return { warnings, outline: null, steps: null, overheadId: ohc.id, kitchenId: kit.id };
  }
  if (Math.abs(oBack - kBack) > 40 || Math.sign(oFront - oBack) !== Math.sign(kFront - kBack)) {
    warnings.push("the overhead and the base do not share a back");
  }
  // Keep the wall's own end — the one nearest the cabinet backs. Using the
  // base's carcass back instead pulls the partition off the back wall (the
  // door thickness sits at the front, so that back is short of the wall) and
  // the partition is then free-standing.
  const near = Math.min(Math.abs(kBack - wall.u0), Math.abs(kBack - wall.u1));
  if (near > 500) warnings.push("the base does not sit against this wall");
  const backU = Math.abs(wall.u0 - kBack) <= Math.abs(wall.u1 - kBack) ? wall.u0 : wall.u1;
  const sign = kFront >= backU ? 1 : -1;
  return {
    warnings, overheadId: ohc.id, kitchenId: kit.id,
    backU, sign,
    kitchen: { ...k, depth: Math.abs(kFront - backU) },
    overhead: { ...o, depth: Math.abs(oFront - backU) },
  };
}

/**
 * Footprint and height of a wall for the current catalogue and space.
 * Returns { id, axis, along, x0, x1, y0, y1, z0, z1, zTopMin, thickness,
 *           outline, holes, topZ(u), openings }
 * The wall is drawn as a board: `outline` is its closed profile in the plane
 * of the wall face, as [{u, z}] with u along the wall (a wall along Y follows
 * the roof; a wall along X has a flat top at the lowest roof over its
 * thickness), extruded across its thickness; `holes` are the openings as
 * closed [{u, z}] rectangles inside it. z1 is the highest point of the top.
 */
export function wallSolid(wall, resolved, stock) {
  const t = thickness(stock, "partition");
  const cl = partitionClearance(stock);
  const lo = wall.side > 0 ? wall.at : wall.at - t;
  const hi = lo + t;
  const box = wall.axis === "y"
    ? { x0: wall.u0, x1: wall.u1, y0: lo, y1: hi }
    : { x0: lo, x1: hi, y0: wall.u0, y1: wall.u1 };
  const z0 = cl.floor;
  const along = alongAxis(wall.axis);
  let topZ;
  let outline;
  if (wall.axis === "y") {
    // Runs along X: the roof only varies with Y, so the top is flat at the lowest roof over the thickness.
    const zt = (resolved ? minClearHeight(resolved, box.y0, box.y1) : Infinity) - cl.ceiling;
    topZ = () => zt;
    outline = [{ u: wall.u0, z: z0 }, { u: wall.u1, z: z0 }, { u: wall.u1, z: zt }, { u: wall.u0, z: zt }, { u: wall.u0, z: z0 }];
  } else {
    // Runs along Y: the top follows the roof profile.
    const roof = (y) => (resolved ? clearHeightAt(resolved, box.x0, y) : Infinity) - cl.ceiling;
    topZ = roof;
    const top = [{ u: wall.u1, z: roof(wall.u1) }];
    const mid = (resolved && resolved.profile ? resolved.profile : []).filter(([y]) => y > wall.u0 + 1e-6 && y < wall.u1 - 1e-6).slice().reverse();
    for (const [y] of mid) top.push({ u: y, z: roof(y) });
    top.push({ u: wall.u0, z: roof(wall.u0) });
    outline = [{ u: wall.u0, z: z0 }, { u: wall.u1, z: z0 }, ...top, { u: wall.u0, z: z0 }];
  }
  let fitWarnings = [];
  let fitSteps = null;
  const fit = readFit(wall);
  if (fit) {
    fitWarnings = fit.warnings.slice();
    if (fit.kitchen && fit.overhead && !fitWarnings.some((m) => m.includes("does not run along") || m.includes("does not sit"))) {
      const samples = wall.axis === "x" && resolved && resolved.profile ? resolved.profile.map(([y]) => y) : [];
      const fitted = fitOutline({
        backU: fit.backU,
        sign: fit.sign,
        z0,
        topAt: topZ,
        kitchenTop: fit.kitchen.z1,
        kitchenDepth: fit.kitchen.depth,
        ohcBottom: fit.overhead.z0,
        ohcDepth: fit.overhead.depth,
        samples,
        radius: fitRadius(wall),
      });
      fitWarnings.push(...fitted.warnings);
      if (fitted.outline) {
        outline = fitted.outline;
        fitSteps = fitted.steps;
        const us = outline.map((p) => p.u);
        const uMin = Math.min(...us);
        const uMax = Math.max(...us);
        if (wall.axis === "y") { box.x0 = uMin; box.x1 = uMax; }
        else { box.y0 = uMin; box.y1 = uMax; }
      }
    }
  }
  const z1 = Math.max(...outline.map((p) => p.z));
  const uSpan0 = Math.min(...outline.map((p) => p.u));
  const uSpan1 = Math.max(...outline.map((p) => p.u));
  const zMin = wall.axis === "y" ? topZ() : Math.min(topZ(uSpan0), topZ(uSpan1));
  // Openings: rectangles in the face plane. The hole top sits `top` under the lowest roof over the hole's span.
  const openings = (wall.openings || []).map((op) => {
    const span = openingSpan(wall, op);
    const roofOver = wall.axis === "y" ? topZ() : (resolved ? minClearHeight(resolved, span.u0, span.u1) - cl.ceiling : Infinity);
    return { ...op, ...span, zBottom: z0 + op.bottom, zTop: roofOver - op.top };
  });
  const holes = [];
  for (const o of openings) {
    if (!(o.zTop - o.zBottom >= 1 && o.u1 - o.u0 >= 1 && o.u0 >= uSpan0 - EPS && o.u1 <= uSpan1 + EPS)) continue;
    holes.push([{ u: o.u0, z: o.zBottom }, { u: o.u1, z: o.zBottom }, { u: o.u1, z: o.zTop }, { u: o.u0, z: o.zTop }, { u: o.u0, z: o.zBottom }]);
  }
  return { id: wall.id, axis: wall.axis, along, ...box, z0, z1, zTopMin: zMin, thickness: t, outline, holes, topZ, openings, at: wall.at, side: wall.side, u0: wall.u0, u1: wall.u1, fitWarnings, fitSteps };
}

const SPACE_END_LABEL = { x: ["left wall", "right wall"], y: ["front wall", "back wall"] };

/**
 * The roof line over a strip parallel to a wall: [{u, z}] ascending along `along`
 * (a strip along X is flat at the lowest roof over its Y band; a strip along Y
 * follows the nose profile), already `ceiling` clearance under the roof.
 */
function roofLine(axis, box, u0, u1, resolved, cl) {
  if (axis === "y") {
    const z = minClearHeight(resolved, box.y0, box.y1) - cl.ceiling;
    return [{ u: u0, z }, { u: u1, z }];
  }
  const x = (box.x0 + box.x1) / 2;
  const roof = (y) => clearHeightAt(resolved, x, y) - cl.ceiling;
  const pts = [{ u: u0, z: roof(u0) }];
  for (const [y] of resolved.profile || []) if (y > u0 + 1e-6 && y < u1 - 1e-6) pts.push({ u: y, z: roof(y) });
  pts.push({ u: u1, z: roof(u1) });
  return pts;
}

/**
 * The boards a sliding door adds beside its wall — derived, never stored:
 *   leaf    Partition stock, `width + overlap` wide centred on the hole,
 *           `doorHeight` high standing SLIDING_FLOOR_GAP above the floor,
 *           SLIDING_GAP clear of the wall face on `side`, drawn closed
 *   pelmet  Partition stock, `top` high with its top on the wall's top line
 *           (roof − ceiling clearance, following the nose), SLIDING_GAP clear of
 *           the leaf; it runs along the wall's direction from the door until the
 *           space or another partition stops it (`otherWallBoxes`)
 * Each part: { id, kind: "door", part, wallId, opId, axis, along, x, y, z (ranges),
 *              x0..z1, outline [{u, z}], length, stoppedBy: { lo, hi } (pelmet) }.
 * Empty for any other opening type, or without a space.
 */
export function openingParts(solid, o, resolved, stock, otherWallBoxes = []) {
  if (!o || o.type !== "slidingDoor" || !resolved) return [];
  const t = solid.thickness;
  const cl = partitionClearance(stock);
  const axis = solid.axis;
  const along = solid.along;
  const face = o.side > 0 ? (axis === "x" ? solid.x1 : solid.y1) : (axis === "x" ? solid.x0 : solid.y0);
  const band = (d0, d1) => {
    const a = face + o.side * d0;
    const b = face + o.side * d1;
    return [Math.min(a, b), Math.max(a, b)];
  };
  const mk = (part, across, u0, u1, outline, extra = {}) => {
    const zs = outline.map((p) => p.z);
    const box = axis === "y" ? { x0: u0, x1: u1, y0: across[0], y1: across[1] } : { x0: across[0], x1: across[1], y0: u0, y1: u1 };
    return {
      id: `${o.id} ${part}`, kind: "door", part, wallId: solid.id, opId: o.id, axis, along,
      x: [box.x0, box.x1], y: [box.y0, box.y1], z: [Math.min(...zs), Math.max(...zs)],
      ...box, z0: Math.min(...zs), z1: Math.max(...zs), outline, length: u1 - u0, ...extra,
    };
  };
  const out = [];
  // Leaf: closed over the hole.
  const c = (o.u0 + o.u1) / 2;
  const L = o.width + o.overlap;
  const lz0 = SLIDING_FLOOR_GAP;
  const lz1 = lz0 + o.doorHeight;
  const lu0 = c - L / 2;
  const lu1 = c + L / 2;
  out.push(mk("leaf", band(SLIDING_GAP, SLIDING_GAP + t), lu0, lu1,
    [{ u: lu0, z: lz0 }, { u: lu1, z: lz0 }, { u: lu1, z: lz1 }, { u: lu0, z: lz1 }, { u: lu0, z: lz0 }]));
  // Pelmet: on its own line, from the door out to whatever stops it on either side.
  const pb = band(2 * SLIDING_GAP + t, 2 * SLIDING_GAP + 2 * t);
  const b = resolved.bounds;
  let lo = along === "x" ? b.minX : b.minY;
  let hi = along === "x" ? b.maxX : b.maxY;
  const stoppedBy = { lo: SPACE_END_LABEL[along][0], hi: SPACE_END_LABEL[along][1] };
  for (const w of otherWallBoxes) {
    if (w.id === solid.id || w.kind !== "wall") continue;
    if (!(w[axis][0] < pb[1] - EPS && w[axis][1] > pb[0] + EPS)) continue; // not across the pelmet's line
    const r = w[along];
    if (r[1] <= c + EPS && r[1] > lo) { lo = r[1]; stoppedBy.lo = w.id; }
    if (r[0] >= c - EPS && r[0] < hi) { hi = r[0]; stoppedBy.hi = w.id; }
  }
  const pbox = axis === "y" ? { x0: lo, x1: hi, y0: pb[0], y1: pb[1] } : { x0: pb[0], x1: pb[1], y0: lo, y1: hi };
  const tops = roofLine(axis, pbox, lo, hi, resolved, cl);
  const h = o.top;
  const outline = [...tops.map((p) => ({ u: p.u, z: p.z - h })), ...tops.slice().reverse(), { u: lo, z: tops[0].z - h }];
  out.push(mk("pelmet", pb, lo, hi, outline, { stoppedBy, height: h, underside: Math.min(...tops.map((p) => p.z)) - h }));
  return out;
}

/** Every derived board of a wall's openings (see openingParts). `otherWallBoxes` = the other partitions. */
export function wallParts(solid, resolved, stock, otherWallBoxes = []) {
  return (solid.openings || []).flatMap((o) => openingParts(solid, o, resolved, stock, otherWallBoxes));
}

/**
 * How far the pelmet's underside reaches below the leaf's top edge (positive =
 * the pelmet covers the leaf top and the track; negative = the track shows).
 */
export function pelmetCover(leaf, pelmet) {
  return leaf.z1 - pelmet.underside;
}

/**
 * Soft problems with a wall's openings — the door works, but not as intended:
 * a sliding door whose pelmet does not reach down over the leaf top (the track
 * shows). `parts` = openingParts of this wall.
 */
export function openingWarnings(solid, parts = []) {
  const out = [];
  for (const o of solid.openings || []) {
    if (o.type !== "slidingDoor") continue;
    const leaf = parts.find((p) => p.opId === o.id && p.part === "leaf");
    const pelmet = parts.find((p) => p.opId === o.id && p.part === "pelmet");
    if (!leaf || !pelmet) continue;
    const cover = pelmetCover(leaf, pelmet);
    if (cover < -EPS) out.push(`${o.id}: pelmet stops ${Math.round(-cover)} above the leaf top — the track shows (raise the leaf or the top clearance)`);
  }
  return out;
}

/** Derived boards of every wall, as boxes for clamping / overlap tests. */
export function allWallParts(walls, resolved, stock) {
  const boxes = wallBoxes(walls, resolved, stock);
  const out = [];
  for (const w of walls) {
    const solid = wallSolid(w, resolved, stock);
    out.push(...wallParts(solid, resolved, stock, boxes.filter((b) => b.id !== w.id)));
  }
  return out;
}

/**
 * Problems with a wall's openings: outside the wall, too narrow / low,
 * overlapping each other, or another wall meeting this one inside the hole.
 * `anchorBoxes` = the other partitions. `ctx.parts` (openingParts of this wall)
 * and `ctx.boxes` (every other solid) add the sliding-door checks: the leaf
 * must fit under the pelmet and have room to slide open (the open leaf may
 * stick out past the pelmet by SLIDING_MAX_OVERHANG); neither board may
 * hit a cabinet or another partition.
 */
export function openingIssues(wall, solid, anchorBoxes = [], ctx = {}) {
  const issues = [];
  const ops = solid.openings || [];
  const parts = ctx.parts || [];
  const boxes = ctx.boxes || [];
  for (let i = 0; i < ops.length; i += 1) {
    const o = ops[i];
    const name = o.id || `opening ${i + 1}`;
    if (o.width < OPENING_MIN_WIDTH) issues.push(`${name}: narrower than ${OPENING_MIN_WIDTH} mm`);
    if (o.u0 < wall.u0 - EPS || o.u1 > wall.u1 + EPS) issues.push(`${name}: outside the wall`);
    if (o.zTop - o.zBottom < OPENING_MIN_HEIGHT) issues.push(`${name}: less than ${OPENING_MIN_HEIGHT} mm high under the roof`);
    for (let j = 0; j < i; j += 1) {
      if (o.u0 < ops[j].u1 - EPS && o.u1 > ops[j].u0 + EPS) issues.push(`${name}: overlaps ${ops[j].id || `opening ${j + 1}`}`);
    }
    // Another partition ending on / in this wall inside the door span.
    for (const b of anchorBoxes) {
      if (b.id === wall.id || b.along === solid.along) continue;
      const across = wall.axis;
      if (!(b[across][0] <= (wall.axis === "x" ? solid.x1 : solid.y1) + EPS && b[across][1] >= (wall.axis === "x" ? solid.x0 : solid.y0) - EPS)) continue;
      const r = b[solid.along];
      if (r[0] < o.u1 - EPS && r[1] > o.u0 + EPS) issues.push(`${name}: ${b.id} meets the wall inside the door`);
    }
    if (o.type !== "slidingDoor") continue;
    if (o.doorHeight < SLIDING_MIN_DOOR_HEIGHT) issues.push(`${name}: door leaf under ${SLIDING_MIN_DOOR_HEIGHT} mm high`);
    const leaf = parts.find((p) => p.opId === o.id && p.part === "leaf");
    const pelmet = parts.find((p) => p.opId === o.id && p.part === "pelmet");
    if (!leaf || !pelmet) continue;
    const along = solid.along;
    // The leaf runs up behind the pelmet (the pelmet covers its top and the track); only the ceiling stops it.
    if (leaf.z1 > pelmet.z1 + EPS) issues.push(`${name}: door leaf ${Math.round(o.doorHeight)} high runs into the ceiling (max ${Math.floor(pelmet.z1 - leaf.z0)})`);
    const l0 = leaf[along][0];
    const l1 = leaf[along][1];
    const p0 = pelmet[along][0];
    const p1 = pelmet[along][1];
    if (l0 < p0 - EPS) issues.push(`${name}: door leaf runs past ${pelmet.stoppedBy.lo}`);
    if (l1 > p1 + EPS) issues.push(`${name}: door leaf runs past ${pelmet.stoppedBy.hi}`);
    // Open = the leaf slid its hole width to one side. Workshop tracks often
    // leave a bit of the leaf past the pelmet; refuse only when that overhang
    // would exceed SLIDING_MAX_OVERHANG.
    const need = Math.max(0, o.width - SLIDING_MAX_OVERHANG);
    if (!(p1 - l1 >= need - EPS || l0 - p0 >= need - EPS)) issues.push(`${name}: no room to slide open (needs ${Math.round(need)} beside the door leaf)`);
    for (const part of [leaf, pelmet]) {
      for (const b of boxes) {
        if (b.id === wall.id || b.wallId === wall.id) continue;
        if (b.kind === "wall" && part.part === "pelmet") continue; // the pelmet already stops at partitions
        if (boxesOverlap(part, b)) issues.push(`${name}: ${part.part} hits ${b.id}`);
      }
    }
  }
  return issues;
}

/** Does a cabinet box stand in the way of this opening (within DOOR_CLEAR_DEPTH of either face, over the door span)? */
export function cabinetBlocksOpening(cab, solid, o) {
  const along = solid.along;
  const across = solid.axis;
  if (!(cab[along][0] < o.u1 - EPS && cab[along][1] > o.u0 + EPS)) return false;
  const f0 = across === "x" ? solid.x0 : solid.y0;
  const f1 = across === "x" ? solid.x1 : solid.y1;
  if (!(cab[across][0] < f1 + DOOR_CLEAR_DEPTH - EPS && cab[across][1] > f0 - DOOR_CLEAR_DEPTH + EPS)) return false;
  return cab.z[1] > o.zBottom + EPS;
}

/** Walls as plain boxes { id, kind: "wall", along, x:[..], y:[..], z:[..] } for clamping and overlap tests. */
export function wallBoxes(walls, resolved, stock) {
  return walls.map((w) => {
    const s = wallSolid(w, resolved, stock);
    return { id: w.id, kind: "wall", along: s.along, x: [s.x0, s.x1], y: [s.y0, s.y1], z: [s.z0, s.z1] };
  });
}

function boxesOverlap(a, b) {
  return a.x[0] < b.x[1] - EPS && a.x[1] > b.x[0] + EPS && a.y[0] < b.y[1] - EPS && a.y[1] > b.y[0] + EPS && a.z[0] < b.z[1] - EPS && a.z[1] > b.z[0] + EPS;
}

/**
 * No physical overlap, ever: a wall may touch another solid, never enter it.
 * A wall that ends on another partition stops on that partition's FACE (its
 * centre line is only the alignment reference — see trimToFaces). Ids of
 * `boxes` the wall solid overlaps; touching is not overlapping, and a sliding
 * door's pelmet is not either (it stops at partitions, so a new wall across
 * its line just shortens it).
 */
export function wallOverlaps(solid, boxes, excludeId = null) {
  const me = { id: solid.id, kind: "wall", along: solid.along, x: [solid.x0, solid.x1], y: [solid.y0, solid.y1], z: [solid.z0, solid.z1] };
  return boxes.filter((b) => b.id !== excludeId && b.wallId !== excludeId && b.part !== "pelmet" && boxesOverlap(me, b)).map((b) => b.id);
}

/**
 * Pull a wall's ends out of the partitions they were drawn into, onto their
 * faces. Drawing aligns to centre lines (a junction is picked at the middle of
 * the partition standing there), so an end can land up to half a thickness
 * inside another wall; the board itself must stop on the face. Only a shallow
 * end (at most one partition thickness deep, with the wall going on past the
 * other side of that partition) is moved — anything deeper is a real overlap
 * and stays for wallStatus to refuse.
 * Returns { wall, trimmed: { lo, hi } } with `{ id, from, to, by }` per moved end.
 */
export function trimToFaces(wall, resolved, stock, otherWallBoxes = []) {
  const s = wallSolid(wall, resolved, stock);
  const t = s.thickness;
  const along = s.along;
  const across = wall.axis;
  const band = across === "x" ? [s.x0, s.x1] : [s.y0, s.y1];
  let u0 = wall.u0;
  let u1 = wall.u1;
  const trimmed = { lo: null, hi: null };
  for (const b of otherWallBoxes) {
    if (b.kind !== "wall" || b.id === wall.id) continue;
    if (!(b[across][0] < band[1] - EPS && b[across][1] > band[0] + EPS)) continue;
    if (!(b.z[0] < s.z1 - EPS && b.z[1] > s.z0 + EPS)) continue;
    const r = b[along];
    if (u0 > r[0] - EPS && u0 < r[1] - EPS && u1 > r[1] + EPS && r[1] - u0 <= t + EPS) {
      trimmed.lo = { id: b.id, from: u0, to: r[1], by: r[1] - u0 };
      u0 = r[1];
    }
    if (u1 < r[1] + EPS && u1 > r[0] + EPS && u0 < r[0] - EPS && u1 - r[0] <= t + EPS) {
      trimmed.hi = { id: b.id, from: u1, to: r[0], by: u1 - r[0] };
      u1 = r[0];
    }
  }
  return { wall: { ...wall, u0, u1 }, trimmed };
}

/** Index of the space wall a wall end can rest on: the low / high end of the axis it runs along. */
function spaceWallIndex(along, end) {
  if (along === "x") return end < 0 ? 3 : 1; // left / right
  return end < 0 ? 0 : 2; // front / back
}
const SPACE_WALL_LABEL = ["front wall", "right wall", "back wall", "left wall"];

/**
 * What each end of the wall rests on: the space wall, another partition, or
 * nothing. Returns { lo: label|null, hi: label|null }. A wall must rest on
 * something at one end at least — free-standing walls are not allowed.
 */
export function wallAnchors(solid, resolved, otherBoxes) {
  const along = solid.along;
  const band = along === "x" ? [solid.y0, solid.y1] : [solid.x0, solid.x1];
  const bandAxis = along === "x" ? "y" : "x";
  const out = { lo: null, hi: null };
  for (const end of [-1, 1]) {
    const u = end < 0 ? (along === "x" ? solid.x0 : solid.y0) : (along === "x" ? solid.x1 : solid.y1);
    const key = end < 0 ? "lo" : "hi";
    if (resolved) {
      const b = resolved.bounds;
      const bound = along === "x" ? (end < 0 ? b.minX : b.maxX) : (end < 0 ? b.minY : b.maxY);
      const idx = spaceWallIndex(along, end);
      if (Math.abs(u - bound) <= EPS && (resolved.walls || []).includes(idx)) { out[key] = SPACE_WALL_LABEL[idx]; continue; }
    }
    for (const o of otherBoxes) {
      if (o.id === solid.id) continue;
      // Our end sits ON the other wall's face (never inside it) and the two thickness bands meet.
      const near = end < 0 ? o[along][1] : o[along][0];
      if (Math.abs(near - u) > EPS) continue;
      if (o[bandAxis][0] < band[1] - EPS && o[bandAxis][1] > band[0] + EPS) { out[key] = o.id; break; }
    }
  }
  return out;
}

/** Is the wall footprint inside the space (all four corners on or inside the floor)? */
export function wallInside(solid, resolved) {
  if (!resolved) return true;
  const corners = [[solid.x0, solid.y0], [solid.x1, solid.y0], [solid.x1, solid.y1], [solid.x0, solid.y1]];
  return corners.every(([x, y]) => pointInsideOrOn(x, y, resolved.floor, EPS));
}

/**
 * Full legality of a wall against the job: { ok, issues:[...], overlaps:[ids], anchors }.
 * `boxes` = every other solid (other walls + cabinets) as { id, x, y, z }.
 * `anchorBoxes` = solids an end may rest on (other walls only; cabinets come after walls).
 */
export function wallStatus(wall, { resolved, stock, boxes, anchorBoxes }) {
  const solid = wallSolid(wall, resolved, stock);
  const parts = wallParts(solid, resolved, stock, anchorBoxes);
  const issues = [];
  if (wallLength(wall) < WALL_MIN_LENGTH) issues.push(`shorter than ${WALL_MIN_LENGTH} mm`);
  if (!wallInside(solid, resolved)) issues.push("outside the space");
  if (!(solid.zTopMin - solid.z0 >= WALL_MIN_HEIGHT)) issues.push("no height under the roof");
  const overlaps = wallOverlaps(solid, boxes, wall.id);
  if (overlaps.length) issues.push(`overlaps ${overlaps.join(", ")}`);
  const anchors = wallAnchors(solid, resolved, anchorBoxes);
  if (!anchors.lo && !anchors.hi) issues.push("free-standing: neither end rests on a wall");
  issues.push(...openingIssues(wall, solid, anchorBoxes, { parts, boxes }));
  const warnings = [...openingWarnings(solid, parts), ...(solid.fitWarnings || [])];
  return { ok: issues.length === 0, issues, warnings, overlaps, anchors, solid, parts };
}

/** Human description of a wall's orientation. */
export function wallOrientation(wall) {
  return wall.axis === "y" ? "across the van (along X)" : "along the van (along Y)";
}

// --- cutting a wall into boards -------------------------------------------------------
// One part must fit a 1200 × 2400 rectangle (either way round: partition stock
// has no grain). 1220 × 2440 is the sheet; the border is already gone.

export const SHEET_SHORT_MM = 1200;
export const SHEET_LONG_MM = 2400;

/** True when a rectangle of sides a × b fits on one board. */
export function fitsSheet(a, b) {
  const w = Math.min(a, b);
  const h = Math.max(a, b);
  return w <= SHEET_SHORT_MM + EPS && h <= SHEET_LONG_MM + EPS;
}

/**
 * Where a single straight cut can leave two fitting pieces.
 * `span` is the side being cut, `other` the side both pieces keep.
 * Returns [lo, hi] measured from 0, or null when no interior cut works.
 * Uses the wall's full height, so a sloped piece is judged by the tallest
 * point on the wall — a piece under the nose is never larger than that.
 */
function legalCutInterval(span, other) {
  if (!(other <= SHEET_LONG_MM + EPS)) return null;
  const maxPiece = other <= SHEET_SHORT_MM + EPS ? SHEET_LONG_MM : SHEET_SHORT_MM;
  const lo = Math.max(0, span - maxPiece);
  const hi = Math.min(span, maxPiece);
  const a = Math.max(lo, 1);
  const b = Math.min(hi, span - 1);
  if (b < a - EPS) return null;
  return [a, b];
}

/** Remove the interiors of `cuts` from [span0, span1]. Endpoints stay, so a cut may sit on a jamb. */
function subtractIntervals(span, cuts) {
  let segs = [span];
  for (const [c0, c1] of cuts) {
    const next = [];
    for (const [a, b] of segs) {
      if (c1 <= a + EPS || c0 >= b - EPS) { next.push([a, b]); continue; }
      if (c0 > a + EPS) next.push([a, Math.min(b, c0)]);
      if (c1 < b - EPS) next.push([Math.max(a, c1), b]);
    }
    segs = next.filter(([a, b]) => b - a >= 1 || Math.abs(b - a) <= EPS);
  }
  return segs.filter(([a, b]) => b >= a - EPS);
}

function distToSpan(p, a, b) {
  if (p < a) return a - p;
  if (p > b) return p - b;
  return 0;
}

function showerHoles(solid) {
  return (solid.openings || []).filter((o) => o.type !== "slidingDoor");
}

/**
 * The automatic cut, or null when the wall is already one legal board.
 * Sliding door: a vertical cut inside the hole, at the midpoint of the part
 * of the hole where both pieces fit — not the hole's own midpoint.
 * Shower door: the hole stays on one board. Among legal cuts that miss every
 * shower hole, the one farthest from the nearest hole. When every legal cut
 * goes through a hole, cut horizontally at the top of the highest hole.
 * No door: the midpoint of the legal vertical interval, else the horizontal one.
 */
function autoSplit(solid) {
  const L = solid.u1 - solid.u0;
  const H = solid.z1 - solid.z0;
  const vLegal = legalCutInterval(L, H);
  const hLegal = legalCutInterval(H, L);
  const sliding = (solid.openings || []).filter((o) => o.type === "slidingDoor");
  const showers = showerHoles(solid);

  if (sliding.length && vLegal) {
    const lo = solid.u0 + vLegal[0];
    const hi = solid.u0 + vLegal[1];
    let best = null;
    for (const o of sliding) {
      const a = Math.max(o.u0, lo);
      const b = Math.min(o.u1, hi);
      if (b - a < 1) continue;
      if (!best || b - a > best.w) best = { at: (a + b) / 2, w: b - a };
    }
    if (best) return { axis: "u", at: best.at };
    let at = (lo + hi) / 2;
    let dist = Infinity;
    for (const o of sliding) {
      const cand = o.u1 <= lo ? lo : o.u0 >= hi ? hi : (lo + hi) / 2;
      const d = o.u1 <= lo ? lo - o.u1 : o.u0 >= hi ? o.u0 - hi : 0;
      if (d < dist) { dist = d; at = cand; }
    }
    return { axis: "u", at };
  }

  if (showers.length) {
    let best = null;
    const consider = (axis, segs, holes) => {
      for (const [a, b] of segs) {
        for (const at of Math.abs(b - a) <= EPS ? [a] : [a, b]) {
          const dist = Math.min(...holes.map(([h0, h1]) => distToSpan(at, h0, h1)));
          if (!best || dist > best.dist + EPS) best = { axis, at, dist };
        }
      }
    };
    if (vLegal) {
      const lo = solid.u0 + vLegal[0];
      const hi = solid.u0 + vLegal[1];
      consider("u", subtractIntervals([lo, hi], showers.map((o) => [o.u0, o.u1])), showers.map((o) => [o.u0, o.u1]));
    }
    if (hLegal) {
      const lo = solid.z0 + hLegal[0];
      const hi = solid.z0 + hLegal[1];
      consider("z", subtractIntervals([lo, hi], showers.map((o) => [o.zBottom, o.zTop])), showers.map((o) => [o.zBottom, o.zTop]));
    }
    if (best) return { axis: best.axis, at: best.at };
    const zTop = Math.max(...showers.map((o) => o.zTop));
    if (zTop - solid.z0 >= 1 && solid.z1 - zTop >= 1) return { axis: "z", at: zTop };
    const o = showers[0];
    const at = (solid.u1 - o.u1) >= (o.u0 - solid.u0) ? o.u1 : o.u0;
    return { axis: "u", at };
  }

  if (vLegal) return { axis: "u", at: solid.u0 + (vLegal[0] + vLegal[1]) / 2 };
  if (hLegal) return { axis: "z", at: solid.z0 + (hLegal[0] + hLegal[1]) / 2 };
  if (L >= H) return { axis: "u", at: solid.u0 + Math.min(SHEET_SHORT_MM, L / 2) };
  return { axis: "z", at: solid.z0 + Math.min(SHEET_SHORT_MM, H / 2) };
}

/**
 * Keep a cut inside the wall, and out of the interior of a shower-door hole
 * (the hole stays on one board; the cut may sit on the hole's edge).
 */
export function placeSplit(solid, split) {
  const margin = 1;
  let axis = split.axis === "z" ? "z" : "u";
  let at = Number(split.at);
  if (!Number.isFinite(at)) at = axis === "u" ? (solid.u0 + solid.u1) / 2 : (solid.z0 + solid.z1) / 2;
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  for (let n = 0; n < 4; n += 1) {
    if (axis === "u") at = clamp(at, solid.u0 + margin, solid.u1 - margin);
    else at = clamp(at, solid.z0 + margin, solid.z1 - margin);
    for (const o of showerHoles(solid)) {
      if (axis === "u" && at > o.u0 + EPS && at < o.u1 - EPS) {
        at = (at - o.u0) <= (o.u1 - at) ? o.u0 : o.u1;
      } else if (axis === "z" && at > o.zBottom + EPS && at < o.zTop - EPS) {
        at = (at - o.zBottom) <= (o.zTop - at) ? o.zBottom : o.zTop;
      }
    }
  }
  if (axis === "u") at = clamp(at, solid.u0 + margin, solid.u1 - margin);
  else at = clamp(at, solid.z0 + margin, solid.z1 - margin);
  return { axis, at: Math.round(at * 10) / 10 };
}

function clipHalf(poly, inside, intersect) {
  const ring = poly.length > 1 && poly[0].u === poly[poly.length - 1].u && poly[0].z === poly[poly.length - 1].z
    ? poly.slice(0, -1) : poly.slice();
  if (ring.length < 3) return null;
  const out = [];
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    const ain = inside(a);
    const bin = inside(b);
    if (ain && bin) out.push({ u: b.u, z: b.z });
    else if (ain && !bin) out.push(intersect(a, b));
    else if (!ain && bin) { out.push(intersect(a, b)); out.push({ u: b.u, z: b.z }); }
  }
  const clean = [];
  for (const p of out) {
    const prev = clean[clean.length - 1];
    if (prev && Math.abs(prev.u - p.u) < 1e-4 && Math.abs(prev.z - p.z) < 1e-4) continue;
    clean.push(p);
  }
  if (clean.length >= 2 && Math.abs(clean[0].u - clean[clean.length - 1].u) < 1e-4 && Math.abs(clean[0].z - clean[clean.length - 1].z) < 1e-4) clean.pop();
  if (clean.length < 3) return null;
  clean.push({ u: clean[0].u, z: clean[0].z });
  return clean;
}

function clipU(poly, side, s) {
  return clipHalf(
    poly,
    (p) => (side < 0 ? p.u <= s + 1e-4 : p.u >= s - 1e-4),
    (a, b) => {
      const d = b.u - a.u;
      const t = Math.abs(d) < 1e-9 ? 0 : (s - a.u) / d;
      return { u: s, z: a.z + t * (b.z - a.z) };
    },
  );
}

function clipZ(poly, side, z) {
  return clipHalf(
    poly,
    (p) => (side < 0 ? p.z <= z + 1e-4 : p.z >= z - 1e-4),
    (a, b) => {
      const d = b.z - a.z;
      const t = Math.abs(d) < 1e-9 ? 0 : (z - a.z) / d;
      return { u: a.u + t * (b.u - a.u), z };
    },
  );
}

function holeRect(u0, u1, z0, z1) {
  return [{ u: u0, z: z0 }, { u: u1, z: z0 }, { u: u1, z: z1 }, { u: u0, z: z1 }, { u: u0, z: z0 }];
}

function splitHoles(holes, axis, at) {
  const lo = [];
  const hi = [];
  for (const h of holes) {
    const us = h.map((p) => p.u);
    const zs = h.map((p) => p.z);
    const u0 = Math.min(...us);
    const u1 = Math.max(...us);
    const z0 = Math.min(...zs);
    const z1 = Math.max(...zs);
    if (u1 - u0 < 1 || z1 - z0 < 1) continue;
    if (axis === "u") {
      if (u1 <= at + EPS) lo.push(h);
      else if (u0 >= at - EPS) hi.push(h);
      else { lo.push(holeRect(u0, at, z0, z1)); hi.push(holeRect(at, u1, z0, z1)); }
    } else if (z1 <= at + EPS) lo.push(h);
    else if (z0 >= at - EPS) hi.push(h);
    else { lo.push(holeRect(u0, u1, z0, at)); hi.push(holeRect(u0, u1, at, z1)); }
  }
  return [lo, hi];
}

function pieceName(wallAxis, splitAxis, index) {
  if (!splitAxis) return "Partition";
  if (splitAxis === "z") return index === 0 ? "Partition · lower" : "Partition · upper";
  if (wallAxis === "y") return index === 0 ? "Partition · left" : "Partition · right";
  return index === 0 ? "Partition · front" : "Partition · back";
}

function makeBoard(id, name, outline, holes, solid) {
  if (!outline) return null;
  const us = outline.map((p) => p.u);
  const zs = outline.map((p) => p.z);
  const u0 = Math.min(...us);
  const u1 = Math.max(...us);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  const length = u1 - u0;
  const height = z1 - z0;
  if (length < 1 || height < 1) return null;
  const box = solid.axis === "y"
    ? { x0: u0, x1: u1, y0: solid.y0, y1: solid.y1 }
    : { x0: solid.x0, x1: solid.x1, y0: u0, y1: u1 };
  return {
    id, name, u0, u1, z0, z1, length, height, ...box,
    outline, holes, fits: fitsSheet(length, height),
  };
}

function sheetIssue(board) {
  return `${board.id} is ${Math.round(board.length)} × ${Math.round(board.height)} mm: one board may be at most ${SHEET_SHORT_MM} × ${SHEET_LONG_MM}`;
}

function showerWarnings(solid, boards) {
  if (boards.length < 2) return [];
  const out = [];
  for (const o of showerHoles(solid)) {
    const host = boards.find((b) => o.u0 >= b.u0 - EPS && o.u1 <= b.u1 + EPS && o.zBottom >= b.z0 - EPS && o.zTop <= b.z1 + EPS);
    out.push(host
      ? `${o.id}: joint on the shower door board ${host.id}`
      : `${o.id}: the cut crosses the shower door`);
  }
  return out;
}

/**
 * The boards a wall is cut into. One board when it fits 1200 × 2400.
 * Otherwise one cut: `wall.split` when the user has dragged it, else autoSplit.
 * Returns { solid, split, boards, issues, warnings }.
 * `issues` — a piece past the sheet (the wall is still there; the piece is marked).
 * `warnings` — a shower-door board that carries a joint.
 */
export function wallBoards(wall, resolved, stock) {
  const solid = wallSolid(wall, resolved, stock);
  const L = solid.u1 - solid.u0;
  const H = solid.z1 - solid.z0;
  const whole = () => {
    const board = makeBoard("P0", "Partition", solid.outline, solid.holes, solid);
    const boards = board ? [board] : [];
    return { solid, split: null, boards, issues: boards.filter((b) => !b.fits).map(sheetIssue), warnings: [] };
  };
  if (!resolved || !Number.isFinite(H) || fitsSheet(L, H)) return whole();
  const proposal = wall.split && (wall.split.axis === "u" || wall.split.axis === "z") && Number.isFinite(Number(wall.split.at))
    ? wall.split
    : autoSplit(solid);
  const split = placeSplit(solid, proposal);
  const [o0, o1] = split.axis === "u"
    ? [clipU(solid.outline, -1, split.at), clipU(solid.outline, 1, split.at)]
    : [clipZ(solid.outline, -1, split.at), clipZ(solid.outline, 1, split.at)];
  const [h0, h1] = splitHoles(solid.holes, split.axis, split.at);
  const boards = [
    makeBoard("P0", pieceName(solid.axis, split.axis, 0), o0, h0, solid),
    makeBoard("P1", pieceName(solid.axis, split.axis, 1), o1, h1, solid),
  ].filter(Boolean);
  if (boards.length < 2) return whole();
  return {
    solid, split, boards,
    issues: boards.filter((b) => !b.fits).map(sheetIssue),
    warnings: showerWarnings(solid, boards),
  };
}
