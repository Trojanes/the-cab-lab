/**
 * Overhead Cabinet geometry v7.
 *
 * Every dimension that ends up on a board goes through `dim()` so the bench can
 * show, for any face or outline point, the formula and the named quantities
 * behind it. The arithmetic is unchanged; `dim()` only records.
 *
 * Rule constants come from rules.json (via rules.ts). Derived constants stay
 * here as formulas.
 */
import {
  Outline,
  dim,
  ex,
  lit,
  param,
  ref,
  use,
  val,
  type Term,
} from "../_lib/dim.ts";
import { RULES as R } from "./rules.ts";

export { RULES } from "./rules.ts";

export const DEFAULT_ROUTER_DIAMETER_MM = R.DEFAULT_ROUTER_DIAMETER_MM.value;
export const DIVIDER_THICKNESS_MM = R.DIVIDER_THICKNESS_MM.value;
export const FEATURE_CLEARANCE_MM = R.FEATURE_CLEARANCE_MM.value;
export const FEATURE_GROOVE_WIDTH_MM = DIVIDER_THICKNESS_MM + FEATURE_CLEARANCE_MM;
export const SCREW_HOLE_DIAMETER_MM = R.SCREW_HOLE_DIAMETER_MM.value;
export const SCREW_HOLE_DEPTH_MM = R.SCREW_HOLE_DEPTH_MM.value;
export const BOTTOM_THICKNESS_MM = R.BOTTOM_THICKNESS_MM.value;
export const DIVIDER_TONGUE_HEIGHT_MM = DIVIDER_THICKNESS_MM / 2 - 0.5;
export const T1_HEIGHT_MM = R.T1_HEIGHT_MM.value;
export const T3_DEPTH_MM = R.T3_DEPTH_MM.value;
export const T3_THICKNESS_MM = R.T3_THICKNESS_MM.value;
export const T3_NOTCH_DEPTH_MM = R.T3_NOTCH_DEPTH_MM.value;
export const T4_THICKNESS_MM = R.T4_THICKNESS_MM.value;
export const T4_HEIGHT_MM = R.T4_HEIGHT_MM.value;
export const T4_NOTCH_HEIGHT_MM = R.T4_NOTCH_HEIGHT_MM.value;
export const T4_SCREW_HOLE_NOTCH_CLEARANCE_MM = R.T4_SCREW_HOLE_NOTCH_CLEARANCE_MM.value;
export const T4_SCREW_HOLE_UP_SHIFT_MM = R.T4_SCREW_HOLE_UP_SHIFT_MM.value;
export const FRONT_TOP_NOTCH_Y_OFFSET_MM = R.FRONT_TOP_NOTCH_Y_OFFSET_MM.value;
export const FRONT_TOP_STEP_Y_MM = R.FRONT_TOP_STEP_Y_MM.value;
export const FRONT_TOP_STEP_DROP_MM = FEATURE_GROOVE_WIDTH_MM;
export const REAR_TOP_NOTCH_HEIGHT_MM = T4_HEIGHT_MM - 15;

export type OverheadStyle = "style_1" | "style_2";

export interface FunctionZoneInput {
  id?: string;
  type: string;
  width: number;
}

export interface OverheadCabinetInputs {
  style?: string;
  cabinetWidth: number;
  cabinetDepth: number;
  cabinetHeight?: number | null;
  topClearanceHeight?: number;
  frontPanelThickness?: number;
  clearance?: number;
  hingeHoleDiameter?: number;
  hingeHoleDepth?: number;
  hingeHoleFromTop?: number;
  hingeHoleFromSide?: number;
  bottomThickness?: number;
  dividerTongueHeight?: number;
  routerDiameter?: number;
  featureWidth?: number;
  internalDividerCenterlines?: number[];
  zones?: FunctionZoneInput[];
}

export interface ScrewHolePosition {
  x: number;
  y: number;
  diameter: number;
}

export interface PanelScrewHole {
  id: string;
  part: string;
  for_divider: string;
  center: [number, number];
  diameter: number;
  depth: number;
  axis: "thickness";
}

export interface BpGroove {
  id: string;
  part: "BP";
  for_divider: string;
  x: [number, number];
  y: [number, number];
  z: [number, number];
  width_x: number;
  length_y: number;
  depth_z: number;
}

export interface DividerNotch {
  id: string;
  part: string;
  for_divider: string;
  x: [number, number];
  y: number[] | [number, number];
  z: number[] | [number, number];
  width_x: number;
  depth_y?: number;
  height_z?: number;
}

export interface DividerTongue {
  length_y: number;
  y: [number, number];
  z: [number, number];
}

export interface DividerFeature {
  id: string;
  XDi: number;
  bp_groove: BpGroove;
  screw_holes: ScrewHolePosition[];
  divider_tongue: DividerTongue;
  t3_notch: DividerNotch;
  t4_notch: DividerNotch;
}

export interface BottomPanel {
  origin: "left-top-front";
  global_origin: [number, number, number];
  size: [number, number, number];
  local_bounds: {
    x: [number, number];
    y: [number, number];
    z: [number, number];
  };
}

export type OutlinePoint = [number, number];

export interface OverheadLegacyGeometry {
  cabinet: { Cw: number; Cd: number; Ch: number | null | undefined };
  manufacturing: {
    Crd: number;
    Crr: number;
    FGw: number;
    FGh: number;
    FPt: number;
    TCH: number;
    FZH: number;
    FitClearance: number;
    FeatureSlotWidth: number;
    Dntg_h: number;
    style: OverheadStyle;
  };
  bottom_panel: BottomPanel;
  divider_features: DividerFeature[];
  front_panels: FrontPanelFeature[];
  hinge_holes: HingeHoleFeature[];
  panel_screw_holes: {
    T2: PanelScrewHole[];
    T3: PanelScrewHole[];
    T4: PanelScrewHole[];
  };
  trimmed_vectors: {
    T3: OutlinePoint[];
    T4: OutlinePoint[];
    DividerSide: OutlinePoint[];
  };
}

export interface FunctionZone {
  id: string;
  type: string;
  width: number;
  x0: number;
  x1: number;
}

export interface FrontPanelFeature {
  id: string;
  zoneId: string;
  zoneIndex: number;
  type: string;
  x: [number, number];
  y: [number, number];
  z: [number, number];
  width: number;
  height: number;
  thickness: number;
  clearance: number;
  opening: {
    x: [number, number];
    width: number;
  };
}

export interface HingeHoleFeature {
  id: string;
  boardId: string;
  center: [number, number];
  diameter: number;
  depth: number;
  axis: "Y";
  purpose: "hinge";
  face: "back";
}

/** Inputs as param terms, so faces and points show "param" in the bench. */
function paramTerms(inputs: OverheadCabinetInputs) {
  return param({
    Cw: inputs.cabinetWidth,
    Cd: inputs.cabinetDepth,
    H: inputs.cabinetHeight,
    TCH: inputs.topClearanceHeight,
    FPT: inputs.frontPanelThickness,
    clearance: inputs.clearance,
    CPT: inputs.featureWidth,
    tongueHeight: inputs.dividerTongueHeight,
    routerDiameter: inputs.routerDiameter,
    hingeHoleDiameter: inputs.hingeHoleDiameter,
    hingeHoleDepth: inputs.hingeHoleDepth,
    hingeHoleFromTop: inputs.hingeHoleFromTop,
    hingeHoleFromSide: inputs.hingeHoleFromSide,
  });
}

/** `inputs.x ?? rule` as a term: the param when given, else the rule constant. */
function orRule<T extends Term>(v: number | null | undefined, name: string, rule: T): Term {
  return v == null ? rule : param({ [name]: v })[name]!;
}

export function edgeDividerCenterlines(
  cabinetWidth: number,
  featureWidth = DIVIDER_THICKNESS_MM,
): [number, number] {
  const halfWidth = featureWidth / 2;
  return [halfWidth, cabinetWidth - halfWidth];
}

export function dividerCenterlines(
  cabinetWidth: number,
  internalCenterlines: number[],
  featureWidth = DIVIDER_THICKNESS_MM,
): number[] {
  const [left, right] = edgeDividerCenterlines(cabinetWidth, featureWidth);
  return [left, ...internalCenterlines, right];
}

export function clampRange(range: [number, number], min: number, max: number): [number, number] {
  return [Math.max(min, range[0]), Math.min(max, range[1])];
}

export function featureXRange(centerlineX: number, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM): [number, number] {
  const halfWidth = featureSlotWidth / 2;
  return [centerlineX - halfWidth, centerlineX + halfWidth];
}

export function boardXRange(centerlineX: number, boardThickness = DIVIDER_THICKNESS_MM): [number, number] {
  const halfWidth = boardThickness / 2;
  return [centerlineX - halfWidth, centerlineX + halfWidth];
}

export function bpGrooveYRange(cabinetDepth: number): [number, number] {
  return [cabinetDepth / 3, (2 * cabinetDepth) / 3];
}

export function bpGrooveLength(cabinetDepth: number): number {
  return cabinetDepth / 3;
}

export function screwHolePositions(
  centerlineX: number,
  cabinetDepth: number,
  diameter = SCREW_HOLE_DIAMETER_MM,
): ScrewHolePosition[] {
  return [
    { x: centerlineX, y: cabinetDepth / 6, diameter },
    { x: centerlineX, y: (5 * cabinetDepth) / 6, diameter },
  ];
}

export function panelScrewHoles(
  part: string,
  centers: number[],
  localMidline: number,
  diameter = SCREW_HOLE_DIAMETER_MM,
  depth = SCREW_HOLE_DEPTH_MM,
): PanelScrewHole[] {
  return centers.map((centerlineX, index) => ({
    id: `${part}SH_D${index}`,
    part,
    for_divider: `D${index}`,
    center: [centerlineX, localMidline],
    diameter,
    depth,
    axis: "thickness" as const,
  }));
}

export function dividerTongueYRange(
  cabinetDepth: number,
  _routerDiameter = DEFAULT_ROUTER_DIAMETER_MM,
): [number, number] {
  const sideInset = 5;
  return [
    cabinetDepth / 3 + sideInset,
    (2 * cabinetDepth) / 3 - sideInset,
  ];
}

export function dividerTongueLength(
  cabinetDepth: number,
  _routerDiameter = DEFAULT_ROUTER_DIAMETER_MM,
): number {
  return cabinetDepth / 3 - 10;
}

export function t3NotchYRange(
  t3Depth = T3_DEPTH_MM,
  notchDepth = T3_NOTCH_DEPTH_MM,
): [number, number] {
  return [t3Depth - notchDepth, t3Depth];
}

export function t4NotchZRange(notchHeight = T4_NOTCH_HEIGHT_MM): [number, number] {
  return [0, notchHeight];
}

export function bpGroove(
  dividerId: string,
  centerlineX: number,
  cabinetDepth: number,
  featureSlotWidth = FEATURE_GROOVE_WIDTH_MM,
  tongueHeight?: number,
  cabinetWidth?: number,
): BpGroove {
  const z1 = tongueHeight !== undefined ? -tongueHeight : 0;
  const [rawX0, rawX1] = featureXRange(centerlineX, featureSlotWidth);
  const [x0, x1] = cabinetWidth === undefined ? [rawX0, rawX1] : clampRange([rawX0, rawX1], 0, cabinetWidth);
  const [y0, y1] = bpGrooveYRange(cabinetDepth);
  const depthZ = tongueHeight ?? 0;
  return {
    id: `BG_${dividerId}`,
    part: "BP",
    for_divider: dividerId,
    x: [x0, x1],
    y: [y0, y1],
    z: [0, z1],
    width_x: x1 - x0,
    length_y: bpGrooveLength(cabinetDepth),
    depth_z: depthZ,
  };
}

export function t3Notch(
  dividerId: string,
  centerlineX: number,
  featureSlotWidth = FEATURE_GROOVE_WIDTH_MM,
  cabinetWidth?: number,
): DividerNotch {
  const [rawX0, rawX1] = featureXRange(centerlineX, featureSlotWidth);
  const x = cabinetWidth === undefined ? [rawX0, rawX1] as [number, number] : clampRange([rawX0, rawX1], 0, cabinetWidth);
  return {
    id: `T3N_${dividerId}`,
    part: "T3",
    for_divider: dividerId,
    x,
    y: t3NotchYRange(),
    z: [0, -DIVIDER_THICKNESS_MM],
    width_x: x[1] - x[0],
    depth_y: T3_NOTCH_DEPTH_MM,
  };
}

export function t4Notch(
  dividerId: string,
  centerlineX: number,
  featureSlotWidth = FEATURE_GROOVE_WIDTH_MM,
  cabinetWidth?: number,
): DividerNotch {
  const [rawX0, rawX1] = featureXRange(centerlineX, featureSlotWidth);
  const x = cabinetWidth === undefined ? [rawX0, rawX1] as [number, number] : clampRange([rawX0, rawX1], 0, cabinetWidth);
  return {
    id: `T4N_${dividerId}`,
    part: "T4",
    for_divider: dividerId,
    x,
    y: [0, DIVIDER_THICKNESS_MM],
    z: t4NotchZRange(),
    width_x: x[1] - x[0],
    height_z: T4_NOTCH_HEIGHT_MM,
  };
}

/**
 * T3 outline in the XY plane: full width, `t3Depth` deep, one notch per
 * divider `notchDepth` deep at the rear edge. Points recorded as
 * `${key}[i].x` / `.y`.
 */
export function t3TrimmedOutlinePoints(
  cabinetWidth: Term,
  notchXRanges: [number, number][],
  t3Depth: Term = R.T3_DEPTH_MM,
  notchDepth: Term = R.T3_NOTCH_DEPTH_MM,
  key = "T3.pv",
): OutlinePoint[] {
  const K = (n: string) => `${key}.${n}`;
  const Cw = val(cabinetWidth);
  const rearY = dim(K("rearY"), { T3_DEPTH: t3Depth }, (t) => t.T3_DEPTH);
  const notchY = dim(K("notchY"), { T3_DEPTH: t3Depth, T3_NOTCH_DEPTH: notchDepth }, (t) => t.T3_DEPTH - t.T3_NOTCH_DEPTH);
  const ranges = [...notchXRanges].sort((a, b) => b[0] - a[0]);
  const o = new Outline(key, ["x", "y"]);
  const W = { Cw: cabinetWidth };
  o.add(lit(0), lit(0));
  o.add(ex(W, (t) => t.Cw), lit(0));

  let currentX = Cw;

  if (ranges.length > 0 && ranges[0]![1] >= Cw) {
    const [x0] = ranges.shift()!;
    o.add(ex(W, (t) => t.Cw), ex(use(K, "notchY"), (t) => t.notchY));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "notchY"), (t) => t.notchY));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "rearY"), (t) => t.rearY));
    currentX = x0;
  } else {
    o.add(ex(W, (t) => t.Cw), ex(use(K, "rearY"), (t) => t.rearY));
    currentX = Cw;
  }

  while (ranges.length > 0) {
    const [x0, x1] = ranges.shift()!;
    if (x0 <= 0) {
      o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "rearY"), (t) => t.rearY));
      o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "notchY"), (t) => t.notchY));
      o.add(lit(0), ex(use(K, "notchY"), (t) => t.notchY));
      o.add(lit(0), lit(0));
      return o.points;
    }
    o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "rearY"), (t) => t.rearY));
    o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "notchY"), (t) => t.notchY));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "notchY"), (t) => t.notchY));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "rearY"), (t) => t.rearY));
    currentX = x0;
  }

  if (currentX > 0) {
    o.add(lit(0), ex(use(K, "rearY"), (t) => t.rearY));
    o.add(lit(0), lit(0));
  }
  return o.points;
}

/**
 * T4 outline in the XZ plane: full width, `t4Height` tall, notches
 * `notchHeight` tall opening downward, one per divider. Points recorded as
 * `${key}[i].x` / `.z`.
 */
export function t4TrimmedOutlinePoints(
  cabinetWidth: Term,
  notchXRanges: [number, number][],
  t4Height: Term = R.T4_HEIGHT_MM,
  notchHeight: Term = R.T4_NOTCH_HEIGHT_MM,
  key = "T4.pv",
): OutlinePoint[] {
  const K = (n: string) => `${key}.${n}`;
  const Cw = val(cabinetWidth);
  const top = dim(K("top"), { T4_HEIGHT: t4Height }, (t) => t.T4_HEIGHT);
  const notchZ = dim(K("notchZ"), { T4_NOTCH_HEIGHT: notchHeight }, (t) => t.T4_NOTCH_HEIGHT);
  const ranges = [...notchXRanges].sort((a, b) => b[0] - a[0]);
  const o = new Outline(key, ["x", "z"]);
  const W = { Cw: cabinetWidth };
  o.add(lit(0), ex(use(K, "top"), (t) => t.top));
  o.add(ex(W, (t) => t.Cw), ex(use(K, "top"), (t) => t.top));

  let currentX = Cw;

  if (ranges.length > 0 && ranges[0]![1] >= Cw) {
    const [x0] = ranges.shift()!;
    o.add(ex(W, (t) => t.Cw), ex(use(K, "notchZ"), (t) => t.notchZ));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "notchZ"), (t) => t.notchZ));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), lit(0));
    currentX = x0;
  } else {
    o.add(ex(W, (t) => t.Cw), lit(0));
    currentX = Cw;
  }

  while (ranges.length > 0) {
    const [x0, x1] = ranges.shift()!;
    if (x0 <= 0) {
      o.add(ex({ notchX1: x1 }, (t) => t.notchX1), lit(0));
      o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "notchZ"), (t) => t.notchZ));
      o.add(lit(0), ex(use(K, "notchZ"), (t) => t.notchZ));
      o.add(lit(0), ex(use(K, "top"), (t) => t.top));
      return o.points;
    }
    o.add(ex({ notchX1: x1 }, (t) => t.notchX1), lit(0));
    o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "notchZ"), (t) => t.notchZ));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "notchZ"), (t) => t.notchZ));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), lit(0));
    currentX = x0;
  }

  if (currentX > 0) {
    o.add(lit(0), lit(0));
    o.add(lit(0), ex(use(K, "top"), (t) => t.top));
  }
  return o.points;
}

/**
 * Divider side outline (YZ, board-local, origin on the BP top face): tongue
 * into the BP, rear notch for T4, front notch + step for T1/T2/T3.
 * Intermediates are recorded as `${key}.<name>`, points as `${key}[i].y/.z`.
 */
export function dividerSideTrimmedOutlinePoints(
  cabinetDepth: Term,
  cabinetHeight: Term | null | undefined,
  fgWidth: Term = R.DIVIDER_THICKNESS_MM,
  tongueHeight?: Term,
  routerDiameter: Term = R.DEFAULT_ROUTER_DIAMETER_MM,
  featureSlotWidth: Term = FEATURE_GROOVE_WIDTH_MM,
  topClearanceHeight: Term = R.T1_HEIGHT_MM,
  style: OverheadStyle = "style_1",
  frontPanelThickness: Term = R.DEFAULT_FRONT_PANEL_THICKNESS_MM,
  key = "DividerSide",
): OutlinePoint[] {
  if (cabinetHeight == null) {
    return [];
  }
  const K = (n: string) => `${key}.${n}`;
  const Cd = cabinetDepth;
  const H = cabinetHeight;
  const CPT = fgWidth;

  // Intermediates are recorded under `${key}.<name>` and referenced by name below.
  if (tongueHeight !== undefined) dim(K("tongueHeight"), { tongueHeight }, (t) => t.tongueHeight);
  else dim(K("tongueHeight"), { CPT }, (t) => t.CPT / 2 - 0.5);
  dim(K("dividerHeight"), { H, CPT }, (t) => t.H - t.CPT);
  // dividerTongueYRange(): Cd/3 + 5 .. 2Cd/3 - 5 (the router diameter is not used by the legacy rule).
  void routerDiameter;
  dim(K("tongueY0"), { Cd }, (t) => t.Cd / 3 + 5);
  dim(K("tongueY1"), { Cd }, (t) => (2 * t.Cd) / 3 - 5);
  dim(K("tongueZ0"), use(K, "tongueHeight"), (t) => -t.tongueHeight);
  if (style === "style_2") dim(K("frontY0"), { FPT: frontPanelThickness, CPT }, (t) => t.FPT + t.CPT);
  else dim(K("frontY0"), { FRONT_TOP_NOTCH_Y_OFFSET: R.FRONT_TOP_NOTCH_Y_OFFSET_MM }, (t) => t.FRONT_TOP_NOTCH_Y_OFFSET);
  dim(K("frontZ0"), { ...use(K, "dividerHeight"), TCH: topClearanceHeight }, (t) => t.dividerHeight - t.TCH);
  dim(K("rearY0"), { Cd, slot: featureSlotWidth }, (t) => t.Cd - t.slot);
  dim(K("rearZ0"), { ...use(K, "dividerHeight"), T4_HEIGHT: R.T4_HEIGHT_MM, CPT }, (t) => t.dividerHeight - (t.T4_HEIGHT - t.CPT));
  dim(
    K("frontStepY1"),
    { FRONT_TOP_NOTCH_Y_OFFSET: R.FRONT_TOP_NOTCH_Y_OFFSET_MM, FRONT_TOP_STEP_Y: R.FRONT_TOP_STEP_Y_MM },
    (t) => t.FRONT_TOP_NOTCH_Y_OFFSET + t.FRONT_TOP_STEP_Y,
  );
  dim(K("frontStepZ1"), { ...use(K, "frontZ0"), slot: featureSlotWidth }, (t) => t.frontZ0 - t.slot);

  const o = new Outline(key, ["y", "z"]);
  const r = (n: string) => ex(use(K, n), (t) => t[n]!, n);
  o.add(lit(0), lit(0));
  o.add(r("tongueY0"), lit(0));
  o.add(r("tongueY0"), r("tongueZ0"));
  o.add(r("tongueY1"), r("tongueZ0"));
  o.add(r("tongueY1"), lit(0));
  o.add(ex({ Cd }, (t) => t.Cd), lit(0));
  o.add(ex({ Cd }, (t) => t.Cd), r("rearZ0"));
  o.add(r("rearY0"), r("rearZ0"));
  o.add(r("rearY0"), r("dividerHeight"));
  o.add(r("frontY0"), r("dividerHeight"));
  o.add(r("frontY0"), r("frontZ0"));
  o.add(r("frontStepY1"), r("frontZ0"));
  o.add(r("frontStepY1"), r("frontStepZ1"));
  o.add(ex({ ...use(K, "frontStepY1"), T3_DEPTH: R.T3_DEPTH_MM }, (t) => t.frontStepY1 - (t.T3_DEPTH - 10)), r("frontStepZ1"));
  o.add(lit(0), lit(0));
  return o.points;
}

function bottomPanel(inputs: OverheadCabinetInputs): BottomPanel {
  const bottomThickness = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  return {
    origin: "left-top-front",
    global_origin: [0, 0, bottomThickness],
    size: [inputs.cabinetWidth, inputs.cabinetDepth, bottomThickness],
    local_bounds: {
      x: [0, inputs.cabinetWidth],
      y: [0, inputs.cabinetDepth],
      z: [-bottomThickness, 0],
    },
  };
}

function dividerFeature(dividerId: string, centerlineX: number, inputs: OverheadCabinetInputs): DividerFeature {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const featureSlotWidth = fgWidth + FEATURE_CLEARANCE_MM;
  const dividerTongueHeight = inputs.dividerTongueHeight ?? fgWidth / 2 - 0.5;
  const bpGrooveDepth = fgWidth / 2;
  const routerDiameter = inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM;

  const feature: DividerFeature = {
    id: dividerId,
    XDi: centerlineX,
    bp_groove: bpGroove(
      dividerId,
      centerlineX,
      inputs.cabinetDepth,
      featureSlotWidth,
      bpGrooveDepth,
      inputs.cabinetWidth,
    ),
    screw_holes: screwHolePositions(centerlineX, inputs.cabinetDepth),
    divider_tongue: {
      length_y: dividerTongueLength(inputs.cabinetDepth, routerDiameter),
      y: dividerTongueYRange(inputs.cabinetDepth, routerDiameter),
      z: [-dividerTongueHeight, 0],
    },
    t3_notch: t3Notch(dividerId, centerlineX, featureSlotWidth, inputs.cabinetWidth),
    t4_notch: t4Notch(dividerId, centerlineX, featureSlotWidth, inputs.cabinetWidth),
  };

  // Provenance for the BP groove this divider drops into (feature keys on BP).
  const P = paramTerms(inputs);
  const CPT = orRule(inputs.featureWidth, "CPT", R.DIVIDER_THICKNESS_MM);
  const K = (n: string) => `BP.feat.BG_${dividerId}.${n}`;
  dim(K("x0"), { XDi: centerlineX, CPT, FEATURE_CLEARANCE: R.FEATURE_CLEARANCE_MM, Cw: P.Cw }, (t) => Math.max(0, t.XDi - (t.CPT + t.FEATURE_CLEARANCE) / 2));
  dim(K("x1"), { XDi: centerlineX, CPT, FEATURE_CLEARANCE: R.FEATURE_CLEARANCE_MM, Cw: P.Cw }, (t) => Math.min(t.Cw, t.XDi + (t.CPT + t.FEATURE_CLEARANCE) / 2));
  dim(K("y0"), { Cd: P.Cd }, (t) => t.Cd / 3);
  dim(K("y1"), { Cd: P.Cd }, (t) => (2 * t.Cd) / 3);
  dim(K("z1"), { CPT }, (t) => -(t.CPT / 2));
  return feature;
}

function normalizeStyle(style?: string): OverheadStyle {
  return style === "style_2" ? "style_2" : "style_1";
}

function resolveZones(inputs: OverheadCabinetInputs): FunctionZone[] {
  if (Array.isArray(inputs.zones) && inputs.zones.length > 0) {
    let x = 0;
    return inputs.zones.map((zone, index) => {
      const width = Number(zone.width) || 0;
      const out = {
        id: zone.id || `zone-${index + 1}`,
        type: zone.type || "up_flap",
        width,
        x0: x,
        x1: x + width,
      };
      x += width;
      return out;
    });
  }
  const centers = inputs.internalDividerCenterlines ?? [];
  const boundaries = [0, ...centers, inputs.cabinetWidth];
  return boundaries.slice(0, -1).map((x0, index) => ({
    id: `zone-${index + 1}`,
    type: index % 2 === 0 ? "up_flap" : "fixed_panel",
    width: boundaries[index + 1]! - x0,
    x0,
    x1: boundaries[index + 1]!,
  }));
}

/**
 * Fronts: one per non-open zone. X = zone edges pulled in by the clearance
 * (full at the cabinet edges, half between two fronts); Z from 30 below the
 * carcass to 1 under the top rails. Faces recorded as `FP<i>.x0` … `.z1`.
 */
function frontPanels(inputs: OverheadCabinetInputs, zones: FunctionZone[], centers: number[]): FrontPanelFeature[] {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const clearance = inputs.clearance ?? R.DEFAULT_CLEARANCE_MM.value;
  const fpThickness = inputs.frontPanelThickness ?? R.DEFAULT_FRONT_PANEL_THICKNESS_MM.value;
  const topClearanceHeight = inputs.topClearanceHeight ?? T1_HEIGHT_MM;
  const functionZoneHeight = (inputs.cabinetHeight ?? topClearanceHeight) - topClearanceHeight;
  const P = paramTerms(inputs);
  const CL = orRule(inputs.clearance, "clearance", R.DEFAULT_CLEARANCE_MM);
  const FPT = orRule(inputs.frontPanelThickness, "FPT", R.DEFAULT_FRONT_PANEL_THICKNESS_MM);
  const TCH = orRule(inputs.topClearanceHeight, "TCH", R.T1_HEIGHT_MM);
  return zones
    .map((zone, index) => {
      if (zone.type === "open") return null;
      const K = (n: string) => `FP${index}.${n}`;
      const openingX0 = centers[index]! + fgWidth / 2;
      const openingX1 = centers[index + 1]! - fgWidth / 2;
      // Full clearance at the cabinet edges, half between two fronts.
      const leftEdge = zone.x0 <= 0;
      const rightEdge = zone.x1 >= inputs.cabinetWidth;
      const x0 = leftEdge
        ? dim(K("x0"), { zoneX0: zone.x0, clearance: CL }, (t) => t.zoneX0 + t.clearance)
        : dim(K("x0"), { zoneX0: zone.x0, clearance: CL }, (t) => t.zoneX0 + t.clearance / 2);
      const x1 = rightEdge
        ? dim(K("x1"), { zoneX1: zone.x1, clearance: CL }, (t) => t.zoneX1 - t.clearance)
        : dim(K("x1"), { zoneX1: zone.x1, clearance: CL }, (t) => t.zoneX1 - t.clearance / 2);
      const y0 = dim(K("y0"), { FPT }, (t) => -t.FPT);
      const y1 = dim(K("y1"), {}, () => 0, { formula: "0" });
      const z0 = dim(K("z0"), {}, () => -30, { formula: "-30" });
      const z1 = inputs.cabinetHeight == null
        ? dim(K("z1"), {}, () => functionZoneHeight - 1, { formula: "FZH - 1" })
        : dim(K("z1"), { H: P.H, TCH }, (t) => t.H - t.TCH - 1);
      return {
        id: `FP${index}`,
        zoneId: zone.id,
        zoneIndex: index,
        type: zone.type,
        x: [x0, x1],
        y: [y0, y1],
        z: [z0, z1],
        width: x1 - x0,
        height: z1 - z0,
        thickness: fpThickness,
        clearance,
        opening: {
          x: [openingX0, openingX1],
          width: openingX1 - openingX0,
        },
      } as FrontPanelFeature;
    })
    .filter((panel): panel is FrontPanelFeature => panel !== null);
}

/** Two hinge cups per flap, board-local XZ from the panel's bottom-left. Recorded as `FP<i>.feat.HINGE_<n>.x/.z`. */
function hingeHoles(panels: FrontPanelFeature[], inputs: OverheadCabinetInputs): HingeHoleFeature[] {
  const holeDiameter = inputs.hingeHoleDiameter ?? R.DEFAULT_HINGE_HOLE_DIAMETER_MM.value;
  const holeDepth = inputs.hingeHoleDepth ?? R.DEFAULT_HINGE_HOLE_DEPTH_MM.value;
  const fromTop = orRule(inputs.hingeHoleFromTop, "hingeHoleFromTop", R.DEFAULT_HINGE_HOLE_FROM_TOP_MM);
  const fromSide = orRule(inputs.hingeHoleFromSide, "hingeHoleFromSide", R.DEFAULT_HINGE_HOLE_FROM_SIDE_MM);
  return panels
    .filter((panel) => panel.type === "up_flap" || panel.type === "rangehood_flap")
    .flatMap((panel) => {
      const K = (n: number, c: string) => `${panel.id}.feat.HINGE_${n}.${c}`;
      // Two cups: `fromSide` in from each side edge, `fromTop` down from the top edge.
      return [0, 1].map((index) => {
        const n = index + 1;
        const px = index === 0
          ? dim(K(n, "x"), { fromSide }, (t) => t.fromSide)
          : dim(K(n, "x"), { panelWidth: panel.width, fromSide }, (t) => t.panelWidth - t.fromSide);
        const pz = dim(K(n, "z"), { panelHeight: panel.height, fromTop }, (t) => t.panelHeight - t.fromTop);
        return {
          id: `${panel.id}_HINGE_${n}`,
          boardId: panel.id,
          center: [px, pz] as [number, number],
          diameter: holeDiameter,
          depth: holeDepth,
          axis: "Y" as const,
          purpose: "hinge" as const,
          face: "back" as const,
        };
      });
    });
}

function buildLegacyGeometry(inputs: OverheadCabinetInputs, centers: number[]): OverheadLegacyGeometry {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const featureSlotWidth = fgWidth + FEATURE_CLEARANCE_MM;
  const routerDiameter = inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM;
  const style = normalizeStyle(inputs.style);
  const topClearanceHeight = inputs.topClearanceHeight ?? T1_HEIGHT_MM;
  const frontPanelThickness = inputs.frontPanelThickness ?? R.DEFAULT_FRONT_PANEL_THICKNESS_MM.value;
  const dntgH = inputs.dividerTongueHeight ?? fgWidth / 2 - 0.5;
  const zones = resolveZones(inputs);
  const panels = frontPanels(inputs, zones, centers);
  const dividerIds = centers.map((_, index) => `D${index}`);

  // Terms for the outline templates: params where given, rules otherwise.
  const P = paramTerms(inputs);
  const CPT = orRule(inputs.featureWidth, "CPT", R.DIVIDER_THICKNESS_MM);
  const TCH = orRule(inputs.topClearanceHeight, "TCH", R.T1_HEIGHT_MM);
  const FPT = orRule(inputs.frontPanelThickness, "FPT", R.DEFAULT_FRONT_PANEL_THICKNESS_MM);
  // Slot width every groove / notch uses; referenced by the outline templates as ref("FeatureSlotWidth").
  dim("FeatureSlotWidth", { CPT, FEATURE_CLEARANCE: R.FEATURE_CLEARANCE_MM }, (t) => t.CPT + t.FEATURE_CLEARANCE);
  const notchRanges = centers.map((centerlineX) => clampRange(featureXRange(centerlineX, featureSlotWidth), 0, inputs.cabinetWidth));

  return {
    cabinet: {
      Cw: inputs.cabinetWidth,
      Cd: inputs.cabinetDepth,
      Ch: inputs.cabinetHeight ?? null,
    },
    manufacturing: {
      Crd: routerDiameter,
      Crr: routerDiameter / 2,
      FGw: fgWidth,
      FGh: fgWidth / 2,
      FPt: frontPanelThickness,
      TCH: topClearanceHeight,
      FZH: (inputs.cabinetHeight ?? topClearanceHeight) - topClearanceHeight,
      FitClearance: FEATURE_CLEARANCE_MM,
      FeatureSlotWidth: featureSlotWidth,
      Dntg_h: dntgH,
      style,
    },
    bottom_panel: bottomPanel(inputs),
    divider_features: dividerIds.map((dividerId, index) =>
      dividerFeature(dividerId, centers[index]!, inputs),
    ),
    front_panels: panels,
    hinge_holes: hingeHoles(panels, inputs),
    panel_screw_holes: {
      T2: panelScrewHoles("T2", centers, topClearanceHeight / 2),
      T3: panelScrewHoles("T3", centers, T3_DEPTH_MM / 2),
      T4: panelScrewHoles(
        "T4",
        centers,
        T4_NOTCH_HEIGHT_MM + T4_SCREW_HOLE_NOTCH_CLEARANCE_MM + T4_SCREW_HOLE_UP_SHIFT_MM,
      ),
    },
    trimmed_vectors: {
      T3: t3TrimmedOutlinePoints(P.Cw, notchRanges),
      T4: t4TrimmedOutlinePoints(P.Cw, notchRanges),
      DividerSide: dividerSideTrimmedOutlinePoints(
        P.Cd,
        inputs.cabinetHeight == null ? null : P.H,
        CPT,
        inputs.dividerTongueHeight == null ? undefined : P.tongueHeight,
        P.routerDiameter,
        ref("FeatureSlotWidth"),
        TCH,
        style,
        FPT,
      ),
    },
  };
}

export function calculateOverheadGeometry(inputs: OverheadCabinetInputs): OverheadLegacyGeometry {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const zones = resolveZones(inputs);
  const internalCenters = Array.isArray(inputs.zones) && inputs.zones.length > 0
    ? zones.slice(0, -1).map((zone) => zone.x1)
    : inputs.internalDividerCenterlines ?? [];
  const centers = dividerCenterlines(inputs.cabinetWidth, internalCenters, fgWidth);
  return buildLegacyGeometry(inputs, centers);
}

export function calculateOverheadGeometryFromXds(
  cabinetWidth: number,
  cabinetDepth: number,
  cabinetHeight: number | null | undefined,
  xds: number[],
  bottomThickness = BOTTOM_THICKNESS_MM,
  dividerTongueHeight = DIVIDER_TONGUE_HEIGHT_MM,
  routerDiameter = DEFAULT_ROUTER_DIAMETER_MM,
  featureWidth = DIVIDER_THICKNESS_MM,
): OverheadLegacyGeometry {
  const inputs: OverheadCabinetInputs = {
    cabinetWidth,
    cabinetDepth,
    cabinetHeight,
    bottomThickness,
    dividerTongueHeight,
    routerDiameter,
    featureWidth,
    internalDividerCenterlines: xds.slice(1, -1),
  };
  return buildLegacyGeometry(inputs, xds);
}

export function calculateOverheadGeometryFromInternalXds(
  cabinetWidth: number,
  cabinetDepth: number,
  cabinetHeight: number | null | undefined,
  internalXds: number[],
  bottomThickness = BOTTOM_THICKNESS_MM,
  dividerTongueHeight?: number,
  routerDiameter = DEFAULT_ROUTER_DIAMETER_MM,
  featureWidth = DIVIDER_THICKNESS_MM,
): OverheadLegacyGeometry {
  const resolvedTongueHeight = dividerTongueHeight ?? featureWidth / 2 - 0.5;
  const [leftXd, rightXd] = edgeDividerCenterlines(cabinetWidth, featureWidth);
  return calculateOverheadGeometryFromXds(
    cabinetWidth,
    cabinetDepth,
    cabinetHeight,
    [leftXd, ...internalXds, rightXd],
    bottomThickness,
    resolvedTongueHeight,
    routerDiameter,
    featureWidth,
  );
}

export function testCase001Geometry(): OverheadLegacyGeometry {
  return calculateOverheadGeometryFromInternalXds(
    500,
    300,
    null,
    [125, 250, 375],
    BOTTOM_THICKNESS_MM,
    undefined,
    10,
    16,
  );
}
