// Partition walls: the 18 / 24 mm boards that split a vehicle into shower,
// ensuite and living areas. Pure geometry and rules — no Three.js here; the
// 3D layer (walls3d.js) and the floor plan (floorplan.js) only draw what
// these functions return.
//
// Record in job.walls (axis-aligned, floor to roof):
//   { id, axis, at, u0, u1, side }
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
  return { id: String(raw.id || ""), axis: raw.axis, at, u0, u1, side: Number(raw.side) < 0 ? -1 : 1, openings };
}

export function wallLength(wall) {
  return wall.u1 - wall.u0;
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
  const z1 = Math.max(...outline.map((p) => p.z));
  const zMin = Math.min(...outline.slice(2, -1).map((p) => p.z));
  // Openings: rectangles in the face plane. The hole top sits `top` under the lowest roof over the hole's span.
  const openings = (wall.openings || []).map((op) => {
    const span = openingSpan(wall, op);
    const roofOver = wall.axis === "y" ? topZ() : (resolved ? minClearHeight(resolved, span.u0, span.u1) - cl.ceiling : Infinity);
    return { ...op, ...span, zBottom: z0 + op.bottom, zTop: roofOver - op.top };
  });
  const holes = openings
    .filter((o) => o.zTop - o.zBottom >= 1 && o.u1 - o.u0 >= 1 && o.u0 >= wall.u0 - EPS && o.u1 <= wall.u1 + EPS)
    .map((o) => [{ u: o.u0, z: o.zBottom }, { u: o.u1, z: o.zBottom }, { u: o.u1, z: o.zTop }, { u: o.u0, z: o.zTop }, { u: o.u0, z: o.zBottom }]);
  return { id: wall.id, axis: wall.axis, along, ...box, z0, z1, zTopMin: zMin, thickness: t, outline, holes, topZ, openings, at: wall.at, side: wall.side, u0: wall.u0, u1: wall.u1 };
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
  const warnings = openingWarnings(solid, parts);
  return { ok: issues.length === 0, issues, warnings, overlaps, anchors, solid, parts };
}

/** Human description of a wall's orientation. */
export function wallOrientation(wall) {
  return wall.axis === "y" ? "across the van (along X)" : "along the van (along Y)";
}
