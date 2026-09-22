/**
 * Lounge floor-plan placement: back-edge polyline → style / params / pose.
 * I = 2 pts, L = 3 orthogonal, Parallel = 3 colinear, U = 4.
 * Walk P0→P1; depth grows to the right of the walk (into the room).
 */
import type { LoungeParams, LoungeResult } from "./types.ts";

export interface LoungeBox {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface LoungePose {
  x: number;
  y: number;
  z: number;
  rotZ: number;
}

const r2 = (v: number) => Math.round(v * 1000) / 1000;
const asNum = (v: unknown, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};

function boxesFromParams(p: LoungeParams): LoungeBox[] {
  const style = p.style ?? "L_SHAPE";
  if (style === "I_SHAPE") {
    const W = asNum(p.mainWidth, 2000);
    const D = asNum(p.mainDepth, 600);
    return [{ id: "i", x0: 0, x1: W, y0: 0, y1: D }];
  }
  if (style === "U_SHAPE") {
    const W = asNum(p.mainWidth, 2000);
    const D = asNum(p.mainDepth, 1600);
    const runD = asNum(p.lDepth, 600);
    return [
      { id: "left", x0: 0, x1: runD, y0: 0, y1: D },
      { id: "back", x0: 0, x1: W, y0: r2(D - runD), y1: D },
      { id: "right", x0: r2(W - runD), x1: W, y0: 0, y1: D },
    ];
  }
  if (style === "PARALLEL") {
    const totalW = asNum(p.totalWidth, 4000);
    const SW = asNum(p.singleLoungeWidth, 1500);
    const D = asNum(p.depth, 800);
    return [
      { id: "left", x0: 0, x1: SW, y0: 0, y1: D },
      { id: "right", x0: r2(totalW - SW), x1: totalW, y0: 0, y1: D },
    ];
  }
  const mainW = asNum(p.mainWidth, 2000);
  const mainD = asNum(p.mainDepth, 600);
  const ret = asNum(p.lWidth, 1600);
  const thick = asNum(p.lDepth, 600);
  const right = (p.lPosition ?? "RIGHT") !== "LEFT";
  const mainX0 = right ? 0 : thick;
  const mainX1 = right ? r2(mainW - thick) : mainW;
  const lX0 = right ? mainX1 : 0;
  const lX1 = right ? mainW : thick;
  return [
    { id: "main", x0: mainX0, x1: mainX1, y0: r2(ret - mainD), y1: ret },
    { id: "l", x0: lX0, x1: lX1, y0: 0, y1: ret },
  ];
}

/** Local footprint rectangles (cabinet frame). Result.footprint wins when present. */
export function loungeFootprintBoxes(params: LoungeParams, result?: Pick<LoungeResult, "footprint">): LoungeBox[] {
  const fp = result?.footprint;
  if (fp) {
    const out: LoungeBox[] = [];
    if (fp.i) out.push({ id: "i", ...fp.i });
    if (fp.main) out.push({ id: "main", ...fp.main });
    if (fp.l) out.push({ id: "l", ...fp.l });
    if (fp.left) out.push({ id: "left", ...fp.left });
    if (fp.right) out.push({ id: "right", ...fp.right });
    if (out.length) return out;
  }
  return boxesFromParams(params);
}

export function pointInFootprintBoxes(x: number, y: number, boxes: LoungeBox[]): boolean {
  return boxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
}

/** Back-edge polyline in cabinet-local XY (wall side, +Y). */
export function loungePolyline(params: LoungeParams): Array<{ x: number; y: number }> {
  const style = params.style ?? "L_SHAPE";
  if (style === "I_SHAPE") {
    const W = asNum(params.mainWidth, 2000);
    const D = asNum(params.mainDepth, 600);
    return [{ x: 0, y: D }, { x: W, y: D }];
  }
  if (style === "U_SHAPE") {
    const W = asNum(params.mainWidth, 2000);
    const D = asNum(params.mainDepth, 1600);
    return [{ x: 0, y: 0 }, { x: 0, y: D }, { x: W, y: D }, { x: W, y: 0 }];
  }
  if (style === "PARALLEL") {
    const totalW = asNum(params.totalWidth, 4000);
    const SW = asNum(params.singleLoungeWidth, 1500);
    const D = asNum(params.depth, 800);
    return [{ x: 0, y: D }, { x: SW, y: D }, { x: totalW, y: D }];
  }
  const mainW = asNum(params.mainWidth, 2000);
  const ret = asNum(params.lWidth, 1600);
  const right = (params.lPosition ?? "RIGHT") !== "LEFT";
  if (right) return [{ x: 0, y: ret }, { x: mainW, y: ret }, { x: mainW, y: 0 }];
  return [{ x: 0, y: 0 }, { x: 0, y: ret }, { x: mainW, y: ret }];
}

/**
 * Floor-plan drawing → params + pose.
 * `a`→`b` is the middle cabinet's back edge. Depth is into the room.
 * roomSign +1 means the room is to the right of a→b; −1 flips the walk so that stays true.
 * L: the wing is on `side`, same depth, backs flush. mainWidth is the middle length plus the wing.
 */
export function loungeFromDrawnRun(input: {
  a: { x: number; y: number };
  b: { x: number; y: number };
  depth: number;
  roomSign: number;
  style: "I" | "L" | "U";
  side?: "LEFT" | "RIGHT";
  wing?: number;
  height?: number;
  partitionPanelThickness?: number;
}): { params: LoungeParams; pose: LoungePose } {
  const a0 = input.a;
  const b0 = input.b;
  const dx = b0.x - a0.x;
  const dy = b0.y - a0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) throw new Error("lounge back edge is too short");
  const depth = input.depth;
  if (!(depth > 0)) throw new Error("lounge depth must be positive");
  const sign = input.roomSign < 0 ? -1 : 1;
  let ux = dx / len;
  let uy = dy / len;
  let rx = uy;
  let ry = -ux;
  let left = a0;
  let right = b0;
  if (sign < 0) {
    ux = -ux;
    uy = -uy;
    rx = -rx;
    ry = -ry;
    left = b0;
    right = a0;
  }
  const rotZ = r2((Math.atan2(uy, ux) * 180) / Math.PI) || 0;
  const H = asNum(input.height, 420);
  const ppt = asNum(input.partitionPanelThickness, 18);
  const frontLeft = {
    x: r2(left.x + rx * depth),
    y: r2(left.y + ry * depth),
  };
  if (input.style === "I") {
    return {
      params: {
        style: "I_SHAPE", mainWidth: r2(len), mainDepth: r2(depth),
        height: H, partitionPanelThickness: ppt,
      },
      pose: { x: frontLeft.x, y: frontLeft.y, z: 0, rotZ },
    };
  }
  const wing = input.wing ?? 0;
  if (!(wing > depth)) throw new Error("lounge return must extend past the middle front");
  const side = input.side === "LEFT" ? "LEFT" : "RIGHT";
  if (input.style === "U") {
    return {
      params: {
        style: "U_SHAPE",
        mainWidth: r2(len),
        mainDepth: r2(wing),
        lDepth: r2(depth),
        height: H,
        partitionPanelThickness: ppt,
      },
      pose: { x: r2(left.x + rx * wing), y: r2(left.y + ry * wing), z: 0, rotZ },
    };
  }
  const origin = side === "LEFT"
    ? { x: r2(left.x - ux * depth + rx * wing), y: r2(left.y - uy * depth + ry * wing) }
    : { x: r2(left.x + rx * wing), y: r2(left.y + ry * wing) };
  return {
    params: {
      style: "L_SHAPE",
      mainWidth: r2(len),
      mainDepth: r2(depth),
      lWidth: r2(wing),
      lDepth: r2(depth),
      lPosition: side,
      height: H,
      partitionPanelThickness: ppt,
    },
    pose: { x: origin.x, y: origin.y, z: 0, rotZ },
  };
}

/**
 * World back-edge points → lounge params + pose (cabinet origin at local 0,0).
 */
export function loungeFromPolyline(
  points: Array<{ x: number; y: number }>,
  base: LoungeParams = {},
): { params: LoungeParams; pose: LoungePose } {
  if (points.length < 2) throw new Error("lounge polyline needs at least 2 points");
  const p0 = points[0]!;
  const p1 = points[1]!;
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) throw new Error("lounge polyline first segment is too short");
  const rot = Math.atan2(dy, dx);
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const toPlace = (p: { x: number; y: number }) => {
    const wx = p.x - p0.x;
    const wy = p.y - p0.y;
    return { U: wx * c + wy * s, V: wx * s - wy * c };
  };
  const local = points.map(toPlace);
  const H = asNum(base.height, 420);
  const ppt = asNum(base.partitionPanelThickness, 18);
  const rotZ = r2((rot * 180) / Math.PI);

  const poseFromDepth = (depth: number): LoungePose => ({
    x: r2(p0.x + depth * s),
    y: r2(p0.y - depth * c),
    z: 0,
    rotZ,
  });

  if (points.length === 2) {
    const D = asNum(base.mainDepth, 600);
    return {
      params: { ...base, style: "I_SHAPE", mainWidth: r2(len), mainDepth: D, height: H, partitionPanelThickness: ppt },
      pose: poseFromDepth(D),
    };
  }

  if (points.length === 3) {
    const p2 = local[2]!;
    const colinear = Math.abs(p2.V) < 1;
    if (colinear) {
      const D = asNum(base.depth ?? base.mainDepth, 800);
      const SW = asNum(base.singleLoungeWidth, 1500);
      return {
        params: {
          ...base, style: "PARALLEL",
          totalWidth: r2(Math.abs(p2.U)), singleLoungeWidth: SW, depth: D,
          height: H, partitionPanelThickness: ppt,
        },
        pose: poseFromDepth(D),
      };
    }
    const mainD = asNum(base.mainDepth, 600);
    const lW = asNum(base.lWidth, 1600);
    const lD = r2(mainD + Math.abs(p2.V));
    const right = p2.U >= len / 2;
    return {
      params: {
        ...base, style: "L_SHAPE",
        mainWidth: r2(len), mainDepth: mainD, lWidth: lW, lDepth: lD,
        lPosition: right ? "RIGHT" : "LEFT",
        height: H, partitionPanelThickness: ppt,
      },
      pose: poseFromDepth(mainD),
    };
  }

  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const W = r2(Math.max(...xs) - minX);
  const D = r2(Math.max(...ys) - minY);
  const runD = asNum(base.lDepth, 600);
  return {
    params: {
      ...base, style: "U_SHAPE",
      mainWidth: W, mainDepth: D, lDepth: runD,
      height: H, partitionPanelThickness: ppt,
    },
    pose: { x: r2(minX), y: r2(minY), z: 0, rotZ: 0 },
  };
}
