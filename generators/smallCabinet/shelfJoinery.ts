/**
 * Small Cabinet shelf / back ↔ side joinery (层板 + 后板锁定).
 *
 * Horizontal boards (TOP / MID / BOTTOM):
 *   - Tongue along depth Y = span/3, centered; insertion through side (CPT).
 *   - Side groove: Y ±5, Z ±0.5.
 *
 * Back board:
 *   - Tongue along height Z = span/3, centered; insertion through side (CPT).
 *   - Side groove: Z ±5, Y ±0.5 (same rule: length axis ±5, thickness axis ±0.5).
 */

import type { Board, ProfilePoint, SmallCabinetFeature } from "./types.ts";

export const SHELF_TONGUE_DEPTH_FRACTION = 1 / 3;
export const GROOVE_LENGTH_OVERSIZE = 5;
export const GROOVE_THICKNESS_OVERSIZE = 1;
/** Half tongue sticks out this much less than half the receiving board; the groove is 0.5 deeper. */
export const HALF_TONGUE_SHORT_MM = 0.5;
/** @deprecated alias — horizontal groove Y oversize */
export const GROOVE_Y_OVERSIZE = GROOVE_LENGTH_OVERSIZE;
/** @deprecated alias — horizontal groove Z oversize */
export const GROOVE_Z_OVERSIZE = GROOVE_THICKNESS_OVERSIZE;

export interface ShelfTongueSpec {
  shelfId: string;
  bodyX0: number;
  bodyX1: number;
  y0: number;
  y1: number;
  tongueY0: number;
  tongueY1: number;
  tongueLength: number;
  z0: number;
  z1: number;
  left: SideJoin;
  right: SideJoin;
}

export interface BackTongueSpec {
  backId: string;
  bodyX0: number;
  bodyX1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  tongueZ0: number;
  tongueZ1: number;
  tongueLength: number;
  left: SideJoin;
  right: SideJoin;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

export function centeredThirdRange(spanStart: number, spanEnd: number): { a0: number; a1: number } {
  const span = spanEnd - spanStart;
  const length = span * SHELF_TONGUE_DEPTH_FRACTION;
  const a0 = round1(spanStart + (span - length) / 2);
  const a1 = round1(a0 + length);
  return { a0, a1 };
}

export function shelfTongueYRange(shelfY0: number, shelfY1: number): { tongueY0: number; tongueY1: number } {
  const { a0, a1 } = centeredThirdRange(shelfY0, shelfY1);
  return { tongueY0: a0, tongueY1: a1 };
}

/** XY outer profile with left/right tongues (world X/Y). */
export function shelfProfileWithTongues(
  bodyX0: number,
  bodyX1: number,
  y0: number,
  y1: number,
  leftLength: number,
  rightLength: number,
  tongueY0: number,
  tongueY1: number,
): ProfilePoint[] {
  const left = Math.max(0, leftLength);
  const right = Math.max(0, rightLength);
  return [
    { x: bodyX0, y: y0 },
    { x: bodyX1, y: y0 },
    { x: bodyX1, y: tongueY0 },
    { x: bodyX1 + right, y: tongueY0 },
    { x: bodyX1 + right, y: tongueY1 },
    { x: bodyX1, y: tongueY1 },
    { x: bodyX1, y: y1 },
    { x: bodyX0, y: y1 },
    { x: bodyX0, y: tongueY1 },
    { x: bodyX0 - left, y: tongueY1 },
    { x: bodyX0 - left, y: tongueY0 },
    { x: bodyX0, y: tongueY0 },
    { x: bodyX0, y: y0 },
  ];
}

/** XZ outer profile with left/right tongues (world X/Z) for back panel. */
export function backProfileWithTongues(
  bodyX0: number,
  bodyX1: number,
  z0: number,
  z1: number,
  leftLength: number,
  rightLength: number,
  tongueZ0: number,
  tongueZ1: number,
): ProfilePoint[] {
  const left = Math.max(0, leftLength);
  const right = Math.max(0, rightLength);
  return [
    { x: bodyX0, z: z0 },
    { x: bodyX1, z: z0 },
    { x: bodyX1, z: tongueZ0 },
    { x: bodyX1 + right, z: tongueZ0 },
    { x: bodyX1 + right, z: tongueZ1 },
    { x: bodyX1, z: tongueZ1 },
    { x: bodyX1, z: z1 },
    { x: bodyX0, z: z1 },
    { x: bodyX0, z: tongueZ1 },
    { x: bodyX0 - left, z: tongueZ1 },
    { x: bodyX0 - left, z: tongueZ0 },
    { x: bodyX0, z: tongueZ0 },
    { x: bodyX0, z: z0 },
  ];
}

export function tongueStickOut(thickness: number, through: boolean): number {
  if (through) return round1(thickness);
  return round1(Math.max(1, thickness / 2 - HALF_TONGUE_SHORT_MM));
}

export function grooveDepthFor(thickness: number, through: boolean): number {
  if (through) return round1(thickness);
  return round1(tongueStickOut(thickness, false) + HALF_TONGUE_SHORT_MM);
}

/**
 * Groove cross-span around a board of [a, b] inside a receiver of [edge0, edge1].
 * The groove is GROOVE_THICKNESS_OVERSIZE taller than the board. Against an edge
 * that extra stays inside the receiver.
 */
export function grooveCrossSpan(a: number, b: number, edge0: number, edge1: number): { g0: number; g1: number } {
  const extra = GROOVE_THICKNESS_OVERSIZE;
  if (a <= edge0 + 0.05) return { g0: round1(edge0), g1: round1(b + extra) };
  if (b >= edge1 - 0.05) return { g0: round1(a - extra), g1: round1(edge1) };
  return { g0: round1(a - extra / 2), g1: round1(b + extra / 2) };
}

export interface SideJoin {
  thickness: number;
  through: boolean;
}

export function buildShelfTongueSpec(shelf: Board, left: SideJoin, right: SideJoin): ShelfTongueSpec {
  const bodyX0 = shelf.x0;
  const bodyX1 = shelf.x1;
  const { tongueY0, tongueY1 } = shelfTongueYRange(shelf.y0, shelf.y1);
  return {
    shelfId: shelf.id,
    bodyX0,
    bodyX1,
    y0: shelf.y0,
    y1: shelf.y1,
    tongueY0,
    tongueY1,
    tongueLength: round1(Math.max(tongueStickOut(left.thickness, left.through), tongueStickOut(right.thickness, right.through))),
    z0: shelf.z0,
    z1: shelf.z1,
    left,
    right,
  };
}

export function buildBackTongueSpec(back: Board, left: SideJoin, right: SideJoin): BackTongueSpec {
  const { a0: tongueZ0, a1: tongueZ1 } = centeredThirdRange(back.z0, back.z1);
  return {
    backId: back.id,
    bodyX0: back.x0,
    bodyX1: back.x1,
    y0: back.y0,
    y1: back.y1,
    z0: back.z0,
    z1: back.z1,
    tongueZ0,
    tongueZ1,
    tongueLength: round1(Math.max(tongueStickOut(left.thickness, left.through), tongueStickOut(right.thickness, right.through))),
    left,
    right,
  };
}

export function applyShelfTongues(shelf: Board, spec: ShelfTongueSpec): void {
  const left = tongueStickOut(spec.left.thickness, spec.left.through);
  const right = tongueStickOut(spec.right.thickness, spec.right.through);
  shelf.x0 = round1(spec.bodyX0 - left);
  shelf.x1 = round1(spec.bodyX1 + right);
  shelf.profileVector = shelfProfileWithTongues(
    spec.bodyX0,
    spec.bodyX1,
    spec.y0,
    spec.y1,
    left,
    right,
    spec.tongueY0,
    spec.tongueY1,
  );
  shelf.notes = [
    ...(shelf.notes || []),
    `Tongues length=${spec.tongueLength} Y=${spec.tongueY0}..${spec.tongueY1} (depth/3, through)`,
  ];
}

export function applyBackTongues(back: Board, spec: BackTongueSpec): void {
  const left = tongueStickOut(spec.left.thickness, spec.left.through);
  const right = tongueStickOut(spec.right.thickness, spec.right.through);
  back.x0 = round1(spec.bodyX0 - left);
  back.x1 = round1(spec.bodyX1 + right);
  back.profileVector = backProfileWithTongues(
    spec.bodyX0,
    spec.bodyX1,
    spec.z0,
    spec.z1,
    left,
    right,
    spec.tongueZ0,
    spec.tongueZ1,
  );
  back.notes = [
    ...(back.notes || []),
    `Tongues length=${spec.tongueLength} Z=${spec.tongueZ0}..${spec.tongueZ1} (height/3, through)`,
  ];
}

export function buildShelfJoineryFeatures(spec: ShelfTongueSpec, sideY1: number, sideZ1: number): SmallCabinetFeature[] {
  const grooveY0 = round1(Math.max(0, spec.tongueY0 - GROOVE_LENGTH_OVERSIZE));
  const grooveY1 = round1(Math.min(sideY1, spec.tongueY1 + GROOVE_LENGTH_OVERSIZE));
  const { g0: grooveZ0, g1: grooveZ1 } = grooveCrossSpan(spec.z0, spec.z1, 0, sideZ1);
  const leftDepth = grooveDepthFor(spec.left.thickness, spec.left.through);
  const rightDepth = grooveDepthFor(spec.right.thickness, spec.right.through);

  return [
    {
      id: `${spec.shelfId}_tongue_L`,
      type: "shelf_tongue",
      targetBoardId: spec.shelfId,
      relatedBoardId: "SIDE_L",
      side: "left",
      y0: spec.tongueY0,
      y1: spec.tongueY1,
      z0: spec.z0,
      z1: spec.z1,
      insertionDepth: tongueStickOut(spec.left.thickness, spec.left.through),
      source: "shelf_joinery",
    },
    {
      id: `${spec.shelfId}_tongue_R`,
      type: "shelf_tongue",
      targetBoardId: spec.shelfId,
      relatedBoardId: "SIDE_R",
      side: "right",
      y0: spec.tongueY0,
      y1: spec.tongueY1,
      z0: spec.z0,
      z1: spec.z1,
      insertionDepth: tongueStickOut(spec.right.thickness, spec.right.through),
      source: "shelf_joinery",
    },
    {
      id: `SIDE_L_${spec.shelfId}_groove`,
      type: "side_groove",
      targetBoardId: "SIDE_L",
      relatedBoardId: spec.shelfId,
      side: "left",
      y0: grooveY0,
      y1: grooveY1,
      z0: grooveZ0,
      z1: grooveZ1,
      depth: leftDepth,
      through: spec.left.through,
      source: "shelf_joinery",
    },
    {
      id: `SIDE_R_${spec.shelfId}_groove`,
      type: "side_groove",
      targetBoardId: "SIDE_R",
      relatedBoardId: spec.shelfId,
      side: "right",
      y0: grooveY0,
      y1: grooveY1,
      z0: grooveZ0,
      z1: grooveZ1,
      depth: rightDepth,
      through: spec.right.through,
      source: "shelf_joinery",
    },
  ];
}

export function buildBackJoineryFeatures(spec: BackTongueSpec, sideZ1: number): SmallCabinetFeature[] {
  const grooveZ0 = round1(Math.max(0, spec.tongueZ0 - GROOVE_LENGTH_OVERSIZE));
  const grooveZ1 = round1(Math.min(sideZ1, spec.tongueZ1 + GROOVE_LENGTH_OVERSIZE));
  const { g0: grooveY0, g1: grooveY1 } = grooveCrossSpan(spec.y0, spec.y1, 0, spec.y1);
  const leftDepth = grooveDepthFor(spec.left.thickness, spec.left.through);
  const rightDepth = grooveDepthFor(spec.right.thickness, spec.right.through);

  return [
    {
      id: `${spec.backId}_tongue_L`,
      type: "back_tongue",
      targetBoardId: spec.backId,
      relatedBoardId: "SIDE_L",
      side: "left",
      y0: spec.y0,
      y1: spec.y1,
      z0: spec.tongueZ0,
      z1: spec.tongueZ1,
      insertionDepth: tongueStickOut(spec.left.thickness, spec.left.through),
      source: "back_joinery",
    },
    {
      id: `${spec.backId}_tongue_R`,
      type: "back_tongue",
      targetBoardId: spec.backId,
      relatedBoardId: "SIDE_R",
      side: "right",
      y0: spec.y0,
      y1: spec.y1,
      z0: spec.tongueZ0,
      z1: spec.tongueZ1,
      insertionDepth: tongueStickOut(spec.right.thickness, spec.right.through),
      source: "back_joinery",
    },
    {
      id: `SIDE_L_${spec.backId}_groove`,
      type: "side_groove",
      targetBoardId: "SIDE_L",
      relatedBoardId: spec.backId,
      side: "left",
      y0: grooveY0,
      y1: grooveY1,
      z0: grooveZ0,
      z1: grooveZ1,
      depth: leftDepth,
      through: spec.left.through,
      source: "back_joinery",
    },
    {
      id: `SIDE_R_${spec.backId}_groove`,
      type: "side_groove",
      targetBoardId: "SIDE_R",
      relatedBoardId: spec.backId,
      side: "right",
      y0: grooveY0,
      y1: grooveY1,
      z0: grooveZ0,
      z1: grooveZ1,
      depth: rightDepth,
      through: spec.right.through,
      source: "back_joinery",
    },
  ];
}

export function attachSideGrooveProfileFeatures(side: Board, features: SmallCabinetFeature[]): void {
  const grooves = features.filter(
    (feature) => feature.type === "side_groove" && feature.targetBoardId === side.id,
  );
  if (!grooves.length) return;
  side.profileFeatures = [
    ...(side.profileFeatures || []),
    ...grooves.map((groove) => ({
      id: groove.id,
      type: "side_groove",
      y0: groove.y0,
      y1: groove.y1,
      z0: groove.z0,
      z1: groove.z1,
      depth: groove.depth,
      relatedBoardId: groove.relatedBoardId,
      source: groove.source,
    })),
  ];
}

/** Rear tongue of a shelf into the back panel (half groove: does not break the outer face). */
export function applyShelfBackTongue(shelf: Board, bodyX0: number, bodyX1: number, backThickness: number, sideZ1: number): SmallCabinetFeature {
  const stick = tongueStickOut(backThickness, false);
  const yBody = round1(shelf.y1);
  const { a0, a1 } = centeredThirdRange(bodyX0, bodyX1);
  // x0/x1 already include the side tongues. The rear tongue is the middle third of the body, which is the span between the side tongues.
  const pts = shelf.profileVector || [];
  const next: ProfilePoint[] = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    next.push(p);
    const q = pts[(i + 1) % pts.length];
    if (!("x" in p) || !("y" in p) || !("x" in q) || !("y" in q)) continue;
    if (Math.abs(p.y - yBody) < 0.05 && Math.abs(q.y - yBody) < 0.05 && p.x > q.x) {
      next.push({ x: a1, y: yBody }, { x: a1, y: round1(yBody + stick) }, { x: a0, y: round1(yBody + stick) }, { x: a0, y: yBody });
    }
  }
  shelf.profileVector = next;
  shelf.y1 = round1(yBody + stick);
  const { g0, g1 } = grooveCrossSpan(shelf.z0, shelf.z1, 0, sideZ1);
  return {
    id: `BACK_${shelf.id}_groove`,
    type: "side_groove",
    targetBoardId: "BACK",
    relatedBoardId: shelf.id,
    x0: round1(a0 - GROOVE_LENGTH_OVERSIZE),
    x1: round1(a1 + GROOVE_LENGTH_OVERSIZE),
    z0: g0,
    z1: g1,
    depth: grooveDepthFor(backThickness, false),
    through: false,
    source: "shelf_back_joinery",
  };
}

/** YZ outline of a side with through grooves that open on an edge cut out of it. */
export function sideOutlineWithGrooves(depth: number, height: number, grooves: SmallCabinetFeature[]): ProfilePoint[] {
  const bot = grooves.filter((g) => g.through && (g.z0 ?? 0) <= 0.05).sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0));
  const back = grooves.filter((g) => g.through && (g.y1 ?? 0) >= depth - 0.05 && (g.z0 ?? 0) > 0.05 && (g.z1 ?? 0) < height - 0.05).sort((a, b) => (a.z0 ?? 0) - (b.z0 ?? 0));
  const top = grooves.filter((g) => g.through && (g.z1 ?? 0) >= height - 0.05).sort((a, b) => (b.y0 ?? 0) - (a.y0 ?? 0));
  const pts: ProfilePoint[] = [];
  const push = (y: number, z: number) => {
    const last = pts[pts.length - 1];
    if (last && Math.abs((last.y ?? 0) - y) < 1e-6 && Math.abs((last.z ?? 0) - z) < 1e-6) return;
    pts.push({ y: round1(y), z: round1(z) });
  };
  push(0, 0);
  for (const n of bot) { push(n.y0 ?? 0, 0); push(n.y0 ?? 0, n.z1 ?? 0); push(n.y1 ?? 0, n.z1 ?? 0); push(n.y1 ?? 0, 0); }
  push(depth, 0);
  for (const n of back) { push(depth, n.z0 ?? 0); push(n.y0 ?? 0, n.z0 ?? 0); push(n.y0 ?? 0, n.z1 ?? 0); push(depth, n.z1 ?? 0); }
  push(depth, height);
  for (const n of top) { push(n.y1 ?? 0, height); push(n.y1 ?? 0, n.z0 ?? 0); push(n.y0 ?? 0, n.z0 ?? 0); push(n.y0 ?? 0, height); }
  push(0, height);
  push(0, 0);
  return pts;
}

/** Apply horizontal tongue/groove joinery and return features. */
export function applyHorizontalJoinery(board: Board, left: SideJoin, right: SideJoin, sideY1: number, sideZ1: number): SmallCabinetFeature[] {
  const spec = buildShelfTongueSpec(board, left, right);
  applyShelfTongues(board, spec);
  return buildShelfJoineryFeatures(spec, sideY1, sideZ1);
}

/** Apply back tongue/groove joinery and return features. */
export function applyBackJoinery(board: Board, left: SideJoin, right: SideJoin, sideZ1: number): SmallCabinetFeature[] {
  const spec = buildBackTongueSpec(board, left, right);
  applyBackTongues(board, spec);
  return buildBackJoineryFeatures(spec, sideZ1);
}
