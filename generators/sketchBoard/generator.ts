/**
 * One hand-drawn board. No placement UI: a later sketch writes these params.
 *
 * The sketch lies on `plane` in the cabinet frame. Points are (u, v) on that
 * plane — XY (x, y), XZ (x, z), YZ (y, z). The sketch plane is t = 0.
 * `pull` 1 grows toward the positive thickness axis (0 → thickness);
 * `pull` -1 grows toward the negative axis (−thickness → 0).
 *
 * `stock.thickness` is the catalogue thickness copied in when the board was
 * created. This generator does not look the catalogue up and does not accept
 * a free extrusion distance.
 *
 * A through opening is a closed loop in `holes`; it becomes a through
 * `cutout` on face A with that loop (docs/model-spec.md). A half
 * groove is not a hole; it is a later sketch on one face.
 *
 * Single-sided door stock: `colorFace` "sketch" paints the face on the sketch
 * plane, "pull" paints the face at the far end. The other face is the carcass
 * colour and the board is milled from that back. Double-sided door stock
 * paints both faces. Carcass and partition have no colour face.
 */
import { Outline, beginProvenance, endProvenance, ex, param, type Provenance } from "../_lib/dim.ts";
import { applyDoorSides, carcassColourOf, doorColourOf, doorSidesOf } from "../_lib/finish.ts";
import { applyGrain, type GrainResult } from "../_lib/grain.ts";
import { applyMilling, type MillingResult } from "../_lib/milling.ts";
import { addFeature, annotate, attachFaces, planeAxes, type Axis, type Board, type FaceId, type Plane, type ProfilePoint } from "../_lib/model.ts";
import { recordBoardBox } from "../_lib/recordBox.ts";

export type SketchPull = 1 | -1;
export type SketchColorFace = "sketch" | "pull";
export type SketchStockKind = "carcass" | "partition" | "door";

export interface SketchPoint {
  u: number;
  v: number;
}

export interface SketchBoardParams {
  plane: Plane;
  pull: SketchPull;
  /** Closed outline. The repeated first point is optional. */
  outline: SketchPoint[];
  /** Through openings, each a closed loop in the same (u, v). */
  holes?: SketchPoint[][];
  stock: { kind: SketchStockKind; thickness: number; colour?: string };
  doorSides?: "single" | "double";
  doorSeries?: "acrylic" | "hpl";
  doorColorName?: string;
  carcassColorName?: string;
  /** Single-sided door stock only. Omitted means the colour is on the pulled face. */
  colorFace?: SketchColorFace;
  grain?: { front?: "horizontal" | "vertical" };
}

export interface ResolvedSketchBoard {
  plane: Plane;
  pull: SketchPull;
  outline: SketchPoint[];
  holes: SketchPoint[][];
  stock: { kind: SketchStockKind; thickness: number; colour?: string };
  doorSides: "single" | "double";
  doorSeries?: "acrylic" | "hpl";
  doorColorName?: string;
  carcassColorName: string;
  colorFace: SketchColorFace;
  grain?: { front?: "horizontal" | "vertical" };
}

export interface SketchBoardResult {
  params: ResolvedSketchBoard;
  boards: Board[];
  joints: [];
  features: [];
  validation: { errors: string[]; warnings: string[] };
  grain: GrainResult;
  milling: MillingResult;
  debug: { boardFrame: "final"; provenance: Provenance };
}

const BOARD_ID = "BOARD";
const PLANES = new Set<Plane>(["XY", "XZ", "YZ"]);
const KINDS = new Set<SketchStockKind>(["carcass", "partition", "door"]);

const r3 = (n: number) => Math.round(n * 1000) / 1000;

const emptyGrain = (): GrainResult => ({ groups: {}, present: [], checked: false, issues: [] });
const emptyMilling = (): MillingResult => ({ issues: [] });

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? r3(n) : null;
}

/** Drop consecutive duplicates and a repeated closing point. */
function openRing(raw: SketchPoint[] | undefined, label: string, errors: string[]): SketchPoint[] | null {
  if (!Array.isArray(raw)) {
    errors.push(`${label} is missing`);
    return null;
  }
  const pts: SketchPoint[] = [];
  for (const p of raw) {
    const u = num(p?.u);
    const v = num(p?.v);
    if (u == null || v == null) {
      errors.push(`${label} has a point that is not a number`);
      return null;
    }
    const prev = pts[pts.length - 1];
    if (prev && prev.u === u && prev.v === v) continue;
    pts.push({ u, v });
  }
  if (pts.length > 1) {
    const a = pts[0]!;
    const b = pts[pts.length - 1]!;
    if (a.u === b.u && a.v === b.v) pts.pop();
  }
  return pts;
}

function signedArea(pts: SketchPoint[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a.u * b.v - b.u * a.v;
  }
  return s / 2;
}

function wind(pts: SketchPoint[], ccw: boolean): SketchPoint[] {
  if (pts.length < 3) return pts;
  return (signedArea(pts) > 0) === ccw ? pts.slice() : pts.slice().reverse();
}

function onBoundary(poly: SketchPoint[], u: number, v: number): boolean {
  const eps = 0.01;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((u - a.u) * dx + (v - a.v) * dy) / len2));
    const px = a.u + t * dx;
    const py = a.v + t * dy;
    if ((u - px) * (u - px) + (v - py) * (v - py) <= eps * eps) return true;
  }
  return false;
}

function inside(poly: SketchPoint[], u: number, v: number): boolean {
  if (onBoundary(poly, u, v)) return false;
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    const cross = (a.v > v) !== (b.v > v) && u < ((b.u - a.u) * (v - a.v)) / (b.v - a.v) + a.u;
    if (cross) hit = !hit;
  }
  return hit;
}

function crosses(a: SketchPoint, b: SketchPoint, c: SketchPoint, d: SketchPoint): boolean {
  const side = (p: SketchPoint, q: SketchPoint, r: SketchPoint) => (q.u - p.u) * (r.v - p.v) - (q.v - p.v) * (r.u - p.u);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

/** Two non-adjacent edges of a closed ring cross. */
function ringCrosses(pts: SketchPoint[]): boolean {
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      if (crosses(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) return true;
    }
  }
  return false;
}

function holeInside(outer: SketchPoint[], hole: SketchPoint[]): boolean {
  if (hole.some((p) => !inside(outer, p.u, p.v))) return false;
  for (let i = 0; i < hole.length; i += 1) {
    const a = hole[i]!;
    const b = hole[(i + 1) % hole.length]!;
    for (let k = 0; k < outer.length; k += 1) {
      if (crosses(a, b, outer[k]!, outer[(k + 1) % outer.length]!)) return false;
    }
  }
  return true;
}

/** The face at t = 0 is B when the thickness grows positive, A when it grows negative. */
function colourFaceId(pull: SketchPull, colorFace: SketchColorFace): FaceId {
  const sketch: FaceId = pull === 1 ? "B" : "A";
  return colorFace === "sketch" ? sketch : (sketch === "A" ? "B" : "A");
}

function profilePoint(plane: Plane, u: number, v: number): ProfilePoint {
  if (plane === "YZ") return { y: u, z: v };
  if (plane === "XZ") return { x: u, z: v };
  return { x: u, y: v };
}

function closedProfile(plane: Plane, pts: SketchPoint[]): ProfilePoint[] {
  const ring = pts.map((p) => profilePoint(plane, p.u, p.v));
  ring.push(ring[0]!);
  return ring;
}

function recordRing(prefix: string, pts: SketchPoint[]): SketchPoint[] {
  const outline = new Outline(prefix, ["u", "v"]);
  for (const p of pts) {
    const u = param({ u: p.u });
    const v = param({ v: p.v });
    outline.add(ex({ u: u.u }, (t) => t.u), ex({ v: v.v }, (t) => t.v));
  }
  return outline.points.map(([u, v]) => ({ u, v }));
}

export function generateSketchBoard(raw: SketchBoardParams): SketchBoardResult {
  beginProvenance();
  const errors: string[] = [];
  const warnings: string[] = [];

  const plane = raw?.plane;
  if (!PLANES.has(plane)) errors.push("the sketch plane is not XY, XZ or YZ");
  const pull = raw?.pull;
  if (pull !== 1 && pull !== -1) errors.push("the thickness direction is not set");

  const kind = raw?.stock?.kind;
  if (!KINDS.has(kind)) errors.push("the board stock is not carcass, partition or door");
  const thickness = num(raw?.stock?.thickness);
  if (thickness == null || thickness <= 0) errors.push("the board has no thickness");

  const outline = openRing(raw?.outline, "the outline", errors);
  if (outline && outline.length < 3) errors.push("the outline needs at least 3 points");
  if (outline && outline.length >= 3 && Math.abs(signedArea(outline)) < 1e-6) errors.push("the outline has no area");
  if (outline && outline.length >= 4 && ringCrosses(outline)) errors.push("the outline crosses itself");

  const outer = outline && outline.length >= 3 && Math.abs(signedArea(outline)) >= 1e-6 ? wind(outline, true) : [];
  const holes: SketchPoint[][] = [];
  const rawHoles = raw?.holes ?? [];
  if (raw?.holes != null && !Array.isArray(raw.holes)) errors.push("the openings are missing");
  if (Array.isArray(rawHoles)) {
    rawHoles.forEach((loop, i) => {
      const label = `opening ${i + 1}`;
      const ring = openRing(loop, label, errors);
      if (!ring) return;
      if (ring.length < 3) {
        errors.push(`${label} needs at least 3 points`);
        return;
      }
      if (Math.abs(signedArea(ring)) < 1e-6) {
        errors.push(`${label} has no area`);
        return;
      }
      const wound = wind(ring, false);
      if (outer.length && !holeInside(outer, wound)) errors.push(`${label} is not inside the outline`);
      holes.push(wound);
    });
  }

  const doorSides = doorSidesOf(raw);
  const carcassColorName = carcassColourOf(raw);
  const doorColorName = kind === "door" ? doorColourOf({ doorColorName: raw?.stock?.colour || raw?.doorColorName }) : undefined;
  let colorFace: SketchColorFace = "pull";
  if (kind === "door" && doorSides === "single") {
    if (raw?.colorFace == null) colorFace = "pull";
    else if (raw.colorFace === "sketch" || raw.colorFace === "pull") colorFace = raw.colorFace;
    else errors.push("the colour face is not sketch or pull");
  }

  const params: ResolvedSketchBoard = {
    plane: PLANES.has(plane) ? plane : "XY",
    pull: pull === 1 || pull === -1 ? pull : 1,
    outline: outer,
    holes,
    stock: {
      kind: KINDS.has(kind) ? kind : "carcass",
      thickness: thickness != null && thickness > 0 ? thickness : 0,
      ...(doorColorName ? { colour: doorColorName } : {}),
    },
    doorSides,
    ...(raw?.doorSeries === "acrylic" || raw?.doorSeries === "hpl" ? { doorSeries: raw.doorSeries } : {}),
    ...(doorColorName ? { doorColorName } : {}),
    carcassColorName,
    colorFace,
    ...(raw?.grain ? { grain: raw.grain } : {}),
  };

  const fail = (): SketchBoardResult => ({
    params,
    boards: [],
    joints: [],
    features: [],
    validation: { errors, warnings },
    grain: emptyGrain(),
    milling: emptyMilling(),
    debug: { boardFrame: "final", provenance: endProvenance() },
  });

  if (errors.length || !PLANES.has(plane) || (pull !== 1 && pull !== -1) || !KINDS.has(kind) || thickness == null || thickness <= 0) {
    return fail();
  }

  const recorded = recordRing(`${BOARD_ID}.pt`, outer);
  const recordedHoles = holes.map((loop, i) => recordRing(`${BOARD_ID}.hole${i}`, loop));
  const [U, V, T] = planeAxes(plane);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of recorded) {
    minU = Math.min(minU, p.u);
    maxU = Math.max(maxU, p.u);
    minV = Math.min(minV, p.v);
    maxV = Math.max(maxV, p.v);
  }
  const t0 = pull === 1 ? 0 : -thickness;
  const t1 = pull === 1 ? thickness : 0;
  const box: Record<"x0" | "x1" | "y0" | "y1" | "z0" | "z1", number> = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
  box[`${U}0`] = minU;
  box[`${U}1`] = maxU;
  box[`${V}0`] = minV;
  box[`${V}1`] = maxV;
  box[`${T}0`] = t0;
  box[`${T}1`] = t1;

  const board: Board = {
    id: BOARD_ID,
    name: "Board",
    category: kind,
    role: kind,
    boardType: kind,
    materialThickness: thickness,
    profilePlane: plane,
    thicknessAxis: T.toUpperCase() as Axis,
    stock: {
      kind,
      thickness,
      ...(kind === "door" ? { colour: doorColorName, sides: doorSides === "double" ? 2 : 1 } : {}),
    },
    ...recordBoardBox(BOARD_ID, box.x0, box.x1, box.y0, box.y1, box.z0, box.z1),
    profileVector: closedProfile(plane, recorded),
  };

  attachFaces([board]);
  // Through openings are cutouts on a big face (docs/model-spec.md), in board-local (u, v).
  recordedHoles.forEach((loop, i) => {
    const pts = loop.map((p) => [r3(p.u - minU), r3(p.v - minV)] as [number, number]);
    const us = pts.map((p) => p[0]);
    const vs = pts.map((p) => p[1]);
    addFeature(board, "A", {
      id: `HOLE_${i + 1}`, kind: "cutout", through: true,
      u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs),
      loop: pts, key: `${BOARD_ID}.hole${i}`,
    });
  });
  annotate(board, "A", { finish: { colour: carcassColorName } });
  annotate(board, "B", { finish: { colour: carcassColorName } });
  if (kind === "door") {
    const face = colourFaceId(pull, colorFace);
    const other: FaceId = face === "A" ? "B" : "A";
    annotate(board, face, { semantic: "outside", visible: true, finish: { colour: doorColorName } });
    annotate(board, other, doorSides === "double"
      ? { semantic: "outside", visible: true, finish: { colour: doorColorName } }
      : { semantic: "back", visible: false, finish: { colour: carcassColorName } });
  }
  const grain = kind === "door"
    ? applyGrain([board], () => "front", params, { front: "horizontal" })
    : emptyGrain();
  applyDoorSides([board], params);
  const milling = applyMilling([board]);

  return {
    params: { ...params, outline: recorded, holes: recordedHoles },
    boards: [board],
    joints: [],
    features: [],
    validation: { errors, warnings },
    grain,
    milling,
    debug: { boardFrame: "final", provenance: endProvenance() },
  };
}
