/**
 * U overhead: three straight overheads (left arm, back, right arm).
 * The back run owns both corners. A range hood stays on a side arm, outside that corner.
 * Boards are returned in one cabinet frame: y = 0 at the open tips, +y toward the back wall.
 */
import { generateOverheadCabinet } from "../overheadCabinet/generator.ts";
import type { Board } from "../overheadCabinet/types.ts";
import { RULES as R } from "./rules.ts";

export interface UZone {
  id?: string;
  type: string;
  width: number;
}

export interface UShapeParams {
  totalWidth: number;
  leftArmLength: number;
  rightArmLength: number;
  cabinetDepth: number;
  cabinetHeight: number;
  sideClearance?: number;
  featureWidth?: number;
  frontPanelThickness?: number;
  topClearanceHeight?: number;
  clearance?: number;
  ledGroove?: boolean;
  hingeHoleDiameter?: number;
  hingeHoleDepth?: number;
  hingeHoleFromTop?: number;
  hingeHoleFromSide?: number;
  carcassColor?: string;
  carcassColorName?: string;
  doorColor?: string;
  doorColorName?: string;
  doorSeries?: string;
  doorSides?: "single" | "double";
  colorSlot?: string;
  rangehoodPreset?: string;
  rangehoodClearHeight?: number;
  rangehoodAlignment?: string;
  rangehoodEdgeOffsetX?: number;
  zones?: { LEFT?: UZone[]; BACK?: UZone[]; RIGHT?: UZone[] };
}

type RunId = "LEFT" | "BACK" | "RIGHT";

interface Xform {
  rotationDeg: 90 | -90 | 180;
  translateX: number;
  translateY: number;
}

function n(value: unknown, fallback: number): number {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}

function r1(v: number): number {
  return Math.round(v * 10) / 10;
}

function fitZones(zones: UZone[] | undefined, usable: number, run: RunId): UZone[] {
  const src = zones?.length ? zones : [{ id: `${run}-1`, type: "up_flap", width: usable }];
  const total = src.reduce((s, z) => s + (Number(z.width) || 0), 0) || 1;
  let used = 0;
  return src.map((z, i) => {
    const width = i === src.length - 1 ? Math.max(0, usable - used) : ((Number(z.width) || 0) / total) * usable;
    used += width;
    return { id: String(z.id || `${run}-${i + 1}`), type: String(z.type || "up_flap"), width: r1(width) };
  });
}

/** Reserved corner width stays out of a range-hood zone: it is its own open pad. */
function zonesForRun(zones: UZone[], reservedStart: number, reservedEnd: number): UZone[] {
  const hood = zones.some((z) => z.type === "rangehood_flap");
  if (!hood) {
    return zones.map((z, i) => ({
      ...z,
      width: r1(z.width + (i === 0 ? reservedStart : 0) + (i === zones.length - 1 ? reservedEnd : 0)),
    }));
  }
  const out: UZone[] = [];
  if (reservedStart > 0) out.push({ id: `${zones[0]?.id || "run"}-corner-start`, type: "open", width: reservedStart });
  out.push(...zones);
  if (reservedEnd > 0) out.push({ id: `${zones[zones.length - 1]?.id || "run"}-corner-end`, type: "open", width: reservedEnd });
  return out;
}

function transformXY(x: number, y: number, t: Xform): [number, number] {
  const rad = t.rotationDeg * Math.PI / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  return [t.translateX + x * cos - y * sin, t.translateY + x * sin + y * cos];
}

function planeOf(plane: Board["profilePlane"], deg: number): Board["profilePlane"] {
  if (deg === 180 || plane === "XY") return plane;
  if (plane === "XZ") return "YZ";
  if (plane === "YZ") return "XZ";
  return plane;
}

function axisOf(axis: Board["thicknessAxis"], deg: number): Board["thicknessAxis"] {
  if (deg === 180 || axis === "Z") return axis;
  return axis === "X" ? "Y" : "X";
}

function placeBoard(run: RunId, board: Board, t: Xform, spanY: number): Board {
  const pts = [
    [board.x0, board.y0], [board.x0, board.y1], [board.x1, board.y0], [board.x1, board.y1],
  ].map(([x, y]) => transformXY(x, y, t));
  const xs = pts.map(([x]) => x);
  const ys = pts.map(([, y]) => spanY - y);
  return {
    ...board,
    id: `${run}.${board.id}`,
    name: `${run} ${board.name}`,
    profilePlane: planeOf(board.profilePlane, t.rotationDeg),
    thicknessAxis: axisOf(board.thicknessAxis, t.rotationDeg),
    x0: Math.min(...xs),
    x1: Math.max(...xs),
    y0: Math.min(...ys),
    y1: Math.max(...ys),
    profileVector: undefined,
    cutProfileVector: undefined,
  };
}

function overlap(a: Board, b: Board): number {
  const dx = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const dy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const dz = Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
  return dx * dy * dz;
}

export function generateUShapeOverhead(raw: UShapeParams) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const totalWidth = n(raw.totalWidth, 2400);
  const leftArmLength = n(raw.leftArmLength, 1500);
  const rightArmLength = n(raw.rightArmLength, 1500);
  const cabinetDepth = n(raw.cabinetDepth, R.DEFAULT_RUN_DEPTH_MM.value);
  const cabinetHeight = n(raw.cabinetHeight, 400);
  const sideClearance = n(raw.sideClearance, R.SIDE_CLEARANCE_MM.value);
  const featureWidth = n(raw.featureWidth, 15);
  const frontPanelThickness = n(raw.frontPanelThickness, 16);
  const topClearanceHeight = n(raw.topClearanceHeight, 40);
  const clearance = n(raw.clearance, 2.5);
  const minUsable = R.MIN_USABLE_MM.value;
  const reserved = frontPanelThickness + sideClearance;
  const backClearance = sideClearance + frontPanelThickness;
  const leftRun = leftArmLength - cabinetDepth;
  const rightRun = rightArmLength - cabinetDepth;
  const leftUsable = leftRun - reserved;
  const rightUsable = rightRun - reserved;
  const backUsable = totalWidth - 2 * cabinetDepth - 2 * backClearance;

  if (!(totalWidth > 2 * cabinetDepth)) errors.push("totalWidth must exceed 2 × the run depth.");
  if (!(backUsable >= minUsable)) errors.push(`The back run has ${r1(backUsable)} mm between the corners — it needs ${minUsable}.`);
  if (!(leftUsable >= minUsable)) errors.push(`The left arm has ${r1(leftUsable)} mm outside the corner — it needs ${minUsable}.`);
  if (!(rightUsable >= minUsable)) errors.push(`The right arm has ${r1(rightUsable)} mm outside the corner — it needs ${minUsable}.`);
  if (!(cabinetHeight > topClearanceHeight + 3 * featureWidth)) errors.push("cabinetHeight is too small for the top rails and the bottom panel.");

  let backZones = fitZones(raw.zones?.BACK, Math.max(0, backUsable), "BACK");
  if (backZones.some((z) => z.type === "rangehood_flap")) {
    warnings.push("Rangehood on BACK was converted to up flap — hoods stay on the left and right arms, outside the corners.");
    backZones = backZones.map((z) => (z.type === "rangehood_flap" ? { ...z, type: "up_flap" } : z));
  }
  const leftZones = fitZones(raw.zones?.LEFT, Math.max(0, leftUsable), "LEFT");
  const rightZones = fitZones(raw.zones?.RIGHT, Math.max(0, rightUsable), "RIGHT");

  const common = {
    cabinetDepth,
    cabinetHeight,
    style: "style_1" as const,
    featureWidth,
    frontPanelThickness,
    topClearanceHeight,
    clearance,
    ledGroove: raw.ledGroove === true,
    hingeHoleDiameter: raw.hingeHoleDiameter,
    hingeHoleDepth: raw.hingeHoleDepth,
    hingeHoleFromTop: raw.hingeHoleFromTop,
    hingeHoleFromSide: raw.hingeHoleFromSide,
    carcassColor: raw.carcassColor,
    carcassColorName: raw.carcassColorName,
    doorColor: raw.doorColor,
    doorColorName: raw.doorColorName,
    doorSeries: raw.doorSeries,
    doorSides: raw.doorSides,
    rangehoodPreset: raw.rangehoodPreset || "NCE",
    rangehoodClearHeight: n(raw.rangehoodClearHeight, 75),
    rangehoodAlignment: raw.rangehoodAlignment === "right" ? "right" : "left",
    rangehoodEdgeOffsetX: Math.max(40, n(raw.rangehoodEdgeOffsetX, 40)),
  };

  const spanY = Math.max(leftArmLength, rightArmLength);
  const specs: { id: RunId; width: number; reservedStart: number; reservedEnd: number; zones: UZone[]; transform: Xform }[] = [
    { id: "LEFT", width: leftRun, reservedStart: reserved, reservedEnd: 0, zones: leftZones, transform: { rotationDeg: 90, translateX: cabinetDepth, translateY: cabinetDepth } },
    { id: "BACK", width: totalWidth, reservedStart: cabinetDepth + backClearance, reservedEnd: cabinetDepth + backClearance, zones: backZones, transform: { rotationDeg: 180, translateX: totalWidth, translateY: cabinetDepth } },
    { id: "RIGHT", width: rightRun, reservedStart: 0, reservedEnd: reserved, zones: rightZones, transform: { rotationDeg: -90, translateX: totalWidth - cabinetDepth, translateY: rightArmLength } },
  ];

  const runs = errors.length ? [] : specs.map((spec) => {
    const hood = spec.id !== "BACK" && spec.zones.some((z) => z.type === "rangehood_flap");
    const result = generateOverheadCabinet({
      ...common,
      cabinetWidth: spec.width,
      zones: zonesForRun(spec.zones, spec.reservedStart, spec.reservedEnd),
      rangehoodPreset: hood ? common.rangehoodPreset : undefined,
    });
    return { ...spec, result };
  });

  for (const run of runs) {
    for (const err of run.result.validation.errors) errors.push(`${run.id}: ${err}`);
    for (const warn of run.result.validation.warnings) warnings.push(`${run.id}: ${warn}`);
    if (run.id !== "BACK") {
      const top = run.result.boards.find((b) => b.id === "RGHD_TOP");
      if (top && top.x0 < run.reservedStart - 0.5) {
        errors.push(`${run.id}: the range hood enters the corner (x ${r1(top.x0)} < ${r1(run.reservedStart)}).`);
      }
    } else if (run.result.boards.some((b) => b.id.startsWith("RGHD_"))) {
      errors.push("BACK: a range hood is not allowed on the back run.");
    }
  }

  const boards = runs.flatMap((run) => {
    const usable0 = run.reservedStart;
    const usable1 = run.width - run.reservedEnd;
    const clipped = run.result.boards.flatMap((b) => {
      const front = b.category === "front_panel" || b.boardType === "up_flap" || b.boardType === "rangehood_flap" || b.boardType === "fixed_panel";
      if (!front) return [b];
      const x0 = Math.max(b.x0, usable0);
      const x1 = Math.min(b.x1, usable1);
      if (x1 - x0 < 1) return [];
      return [{ ...b, x0, x1 }];
    });
    return clipped.map((b) => placeBoard(run.id, b, run.transform, spanY));
  });
  for (let i = 0; i < boards.length; i += 1) {
    for (let j = i + 1; j < boards.length; j += 1) {
      const a = boards[i];
      const b = boards[j];
      if (a.id.split(".")[0] === b.id.split(".")[0]) continue;
      if (overlap(a, b) > 1) errors.push(`${a.id} overlaps ${b.id}.`);
    }
  }

  return {
    boards: errors.some((e) => e.startsWith("totalWidth") || e.includes("needs")) && !runs.length ? [] : boards,
    validation: { errors, warnings },
    params: {
      totalWidth, leftArmLength, rightArmLength, cabinetDepth, cabinetHeight, sideClearance,
      featureWidth, frontPanelThickness, topClearanceHeight, clearance,
      ledGroove: raw.ledGroove === true,
      rangehoodClearHeight: common.rangehoodClearHeight,
      rangehoodAlignment: common.rangehoodAlignment,
      rangehoodEdgeOffsetX: common.rangehoodEdgeOffsetX,
      zones: { LEFT: leftZones, BACK: backZones, RIGHT: rightZones },
      usable: { LEFT: r1(leftUsable), BACK: r1(backUsable), RIGHT: r1(rightUsable) },
    },
  };
}
