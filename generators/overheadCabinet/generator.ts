import {
  DIVIDER_THICKNESS_MM,
  DEFAULT_ROUTER_DIAMETER_MM,
  RULES as R,
  boardXRange,
  calculateOverheadGeometry,
  clampRange,
  featureXRange,
  t4TrimmedOutlinePoints,
  dividerSideTrimmedOutlinePoints,
  type OverheadCabinetInputs,
  type OverheadLegacyGeometry,
  type OutlinePoint,
} from "./geometry.ts";
import { alias, beginProvenance, dim, endProvenance, ex, Outline, param, provenanceActive, ref, same, type Term } from "../_lib/dim.ts";
import { generateOHCSvgPreview } from "./svgPreview.ts";
import type { Board, OverheadCabinetParams, OverheadCabinetResult } from "./types.ts";
import { relationshipDeclarationsForBoards } from "./relationshipDeclarations.ts";
import { attachFaces } from "../_lib/model.ts";
import { applyDoorSides, doorColourOf } from "../_lib/finish.ts";
import { applyGrain } from "../_lib/grain.ts";
import { applyMilling } from "../_lib/milling.ts";
import { CORNERS, LayoutError, placeBoards, recordExpr, validateLayout, type BoardRule, type LayoutFile } from "../_lib/layout.ts";
import { buildOverheadFaces } from "./faces.ts";
import { LAYOUT } from "./layout.ts";

export * from "./geometry.ts";
export * from "./svgPreview.ts";

/** Match General Tall / Kitchen / Fridge LED insert groove (mm). */
const LED_GROOVE_WIDTH = R.LED_GROOVE_WIDTH_MM.value;
const LED_GROOVE_DEPTH = R.LED_GROOVE_DEPTH_MM.value;
/**
 * Clear strip from T3 front edge to the near wall of the main channel.
 * Shared with GT / Kitchen / Fridge: 18 mm land → centerline 25.25.
 */
const LED_GROOVE_FRONT_LAND_MM = R.LED_GROOVE_FRONT_LAND_MM.value;
const LED_GROOVE_FRONT_OFFSET = LED_GROOVE_FRONT_LAND_MM + LED_GROOVE_WIDTH / 2;
const LED_GROOVE_BRANCH_END_INSET = R.LED_GROOVE_BRANCH_END_INSET_MM.value;
const T3_LED_BOARD_DEPTH_FALLBACK = R.T3_DEPTH_MM.value;

const RANGEHOOD_PRESET_NCE = "NCE";
const RANGEHOOD_CUTOUT_WIDTH_MM = R.RANGEHOOD_CUTOUT_WIDTH_MM.value;
const RANGEHOOD_CUTOUT_DEPTH_MM = R.RANGEHOOD_CUTOUT_DEPTH_MM.value;
const RANGEHOOD_MIN_EDGE_MM = R.RANGEHOOD_MIN_EDGE_MM.value;
const RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM = R.RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM.value;

interface ResolvedZone {
  id: string;
  type: string;
  width: number;
  x0: number;
  x1: number;
}

interface RangehoodGroup {
  firstZoneIndex: number;
  lastZoneIndex: number;
  leftDividerIndex: number;
  rightDividerIndex: number;
  internalDividerIndices: number[];
  x0: number;
  x1: number;
  clearWidth: number;
  clearHeight: number;
  alignment: "left" | "right";
  edgeOffsetX: number;
}

/**
 * Only what the user gave. Missing values are left undefined so geometry.ts
 * falls back to the rule constants and the provenance shows them as "rule",
 * not as a param the user typed.
 */
function toInputs(params: OverheadCabinetParams): OverheadCabinetInputs {
  const opt = (v: number | undefined | null): number | undefined => (v == null ? undefined : Number(v));
  return {
    cabinetWidth: Number(params.cabinetWidth),
    cabinetDepth: Number(params.cabinetDepth),
    cabinetHeight: params.cabinetHeight,
    style: params.style,
    topClearanceHeight: opt(params.topClearanceHeight),
    frontPanelThickness: opt(params.frontPanelThickness),
    clearance: opt(params.clearance),
    hingeHoleDiameter: opt(params.hingeHoleDiameter),
    hingeHoleDepth: opt(params.hingeHoleDepth),
    hingeHoleFromTop: opt(params.hingeHoleFromTop),
    hingeHoleFromSide: opt(params.hingeHoleFromSide),
    bottomThickness: opt(params.featureWidth ?? params.bottomThickness),
    dividerTongueHeight: opt(params.dividerTongueHeight),
    routerDiameter: opt(params.routerDiameter),
    featureWidth: opt(params.featureWidth),
    internalDividerCenterlines: Array.isArray(params.internalDividerCenterlines)
      ? params.internalDividerCenterlines.map(Number)
      : [],
    zones: params.zones,
  };
}

function resolvedZones(params: OverheadCabinetParams): ResolvedZone[] {
  const zones = Array.isArray(params.zones) ? params.zones : [];
  let x = 0;
  return zones.map((zone, index) => {
    const width = Number(zone.width) || 0;
    const resolved = {
      id: String(zone.id || `zone-${index + 1}`),
      type: String(zone.type || "up_flap"),
      width,
      x0: x,
      x1: x + width,
    };
    x += width;
    return resolved;
  });
}

function resolveRangehoodGroup(
  params: OverheadCabinetParams,
  geometry: OverheadLegacyGeometry,
  validation: { errors: string[]; warnings: string[] },
): RangehoodGroup | null {
  const zones = resolvedZones(params);
  const indices = zones
    .map((zone, index) => zone.type === "rangehood_flap" ? index : -1)
    .filter((index) => index >= 0);
  if (indices.length === 0) return null;

  const firstZoneIndex = indices[0]!;
  const lastZoneIndex = indices[indices.length - 1]!;
  if (indices.some((index, offset) => index !== firstZoneIndex + offset)) {
    validation.errors.push("Only one contiguous rangehood group is allowed per overhead cabinet.");
    return null;
  }

  const preset = String(params.rangehoodPreset || RANGEHOOD_PRESET_NCE).toUpperCase();
  if (preset !== RANGEHOOD_PRESET_NCE) {
    validation.errors.push(`Unsupported rangehood preset: ${preset}.`);
  }
  const alignmentRaw = String(params.rangehoodAlignment || "left").toLowerCase();
  if (alignmentRaw !== "left" && alignmentRaw !== "right") {
    validation.errors.push("rangehoodAlignment must be left or right.");
  }
  const alignment: "left" | "right" = alignmentRaw === "right" ? "right" : "left";
  const edgeOffsetX = Number(params.rangehoodEdgeOffsetX ?? RANGEHOOD_MIN_EDGE_MM);
  const clearHeight = Number(params.rangehoodClearHeight ?? RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM);
  const cpt = geometry.manufacturing.FGw;
  const leftDivider = geometry.divider_features[firstZoneIndex];
  const rightDivider = geometry.divider_features[lastZoneIndex + 1];
  if (!leftDivider || !rightDivider) {
    validation.errors.push("Rangehood group boundary dividers could not be resolved.");
    return null;
  }
  const x0 = leftDivider.XDi + cpt / 2;
  const x1 = rightDivider.XDi - cpt / 2;
  const clearWidth = x1 - x0;

  if (!Number.isFinite(clearHeight) || clearHeight <= 0) {
    validation.errors.push("rangehoodClearHeight must be a positive number.");
  }
  if (!Number.isFinite(edgeOffsetX) || edgeOffsetX < RANGEHOOD_MIN_EDGE_MM) {
    validation.errors.push(`NCE rangehood edge offset must be at least ${RANGEHOOD_MIN_EDGE_MM} mm.`);
  }
  if (geometry.cabinet.Cd < RANGEHOOD_CUTOUT_DEPTH_MM + RANGEHOOD_MIN_EDGE_MM * 2) {
    validation.errors.push(
      `NCE rangehood requires BP depth >= ${RANGEHOOD_CUTOUT_DEPTH_MM + RANGEHOOD_MIN_EDGE_MM * 2} mm.`,
    );
  }
  if (clearWidth < RANGEHOOD_CUTOUT_WIDTH_MM + RANGEHOOD_MIN_EDGE_MM * 2) {
    validation.errors.push(
      `NCE rangehood requires clear width between outer D inner faces >= ${RANGEHOOD_CUTOUT_WIDTH_MM + RANGEHOOD_MIN_EDGE_MM * 2} mm.`,
    );
  }
  if (
    Number.isFinite(edgeOffsetX) &&
    clearWidth - RANGEHOOD_CUTOUT_WIDTH_MM - edgeOffsetX < RANGEHOOD_MIN_EDGE_MM
  ) {
    validation.errors.push("NCE rangehood cutout must leave at least 40 mm on the opposite X side.");
  }
  const cabinetHeight = Number(geometry.cabinet.Ch ?? 0);
  const functionalTop = cabinetHeight - geometry.manufacturing.TCH;
  if (3 * cpt + clearHeight > functionalTop) {
    validation.errors.push("Rangehood insert collides with the overhead top-clearance structure.");
  }

  return {
    firstZoneIndex,
    lastZoneIndex,
    leftDividerIndex: firstZoneIndex,
    rightDividerIndex: lastZoneIndex + 1,
    internalDividerIndices: Array.from(
      { length: Math.max(0, lastZoneIndex - firstZoneIndex) },
      (_, offset) => firstZoneIndex + offset + 1,
    ),
    x0,
    x1,
    clearWidth,
    clearHeight,
    alignment,
    edgeOffsetX,
  };
}

function rangehoodTopProfile(clearWidth: number, cabinetDepth: number, tongueProjection: number): Array<{ x: number; y: number }> {
  const y0 = cabinetDepth / 3 + 5;
  const y1 = cabinetDepth * 2 / 3 - 5;
  const rightMain = tongueProjection + clearWidth;
  const total = rightMain + tongueProjection;
  return [
    { x: tongueProjection, y: 0 },
    { x: rightMain, y: 0 },
    { x: rightMain, y: y0 },
    { x: total, y: y0 },
    { x: total, y: y1 },
    { x: rightMain, y: y1 },
    { x: rightMain, y: cabinetDepth },
    { x: tongueProjection, y: cabinetDepth },
    { x: tongueProjection, y: y1 },
    { x: 0, y: y1 },
    { x: 0, y: y0 },
    { x: tongueProjection, y: y0 },
    { x: tongueProjection, y: 0 },
  ];
}

function internalRangehoodDividerProfile(
  inputs: OverheadCabinetInputs,
  clearHeight: number,
): OutlinePoint[] {
  const cpt = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const P = param({ H: inputs.cabinetHeight ?? 0, CPT: cpt, clearHeight, Cd: inputs.cabinetDepth });
  const effectiveCabinetHeight = dim(
    "DividerSideRangehood.effectiveHeight",
    { H: P.H, CPT: P.CPT, clearHeight: P.clearHeight },
    (t) => t.H - t.CPT - t.clearHeight,
  );
  return dividerSideTrimmedOutlinePoints(
    P.Cd,
    ref("DividerSideRangehood.effectiveHeight"),
    P.CPT,
    inputs.dividerTongueHeight,
    inputs.routerDiameter,
    cpt + 1,
    inputs.topClearanceHeight,
    inputs.style === "style_2" ? "style_2" : "style_1",
    inputs.frontPanelThickness,
    "DividerSideRangehood",
  );
}

/**
 * Boards are emitted in their FINAL assembled pose (`boardFrame: "final"`):
 * carcass bottom face z = 0, carcass top z = cabinetHeight, carcass front
 * face y = 0 (doors hang at y = -FPT..0), +Y into the cabinet. No consumer
 * moves or rotates a board afterwards.
 *
 * Reference stack for W×Cd×H, CPT = featureWidth, TCH = topClearanceHeight:
 *   BP   z 0..CPT, y 0..Cd
 *   D_i  YZ outline with origin on the BP top (z0 = CPT); tongue dips 7 into BP
 *   T1   y TCH-1 .. TCH-1+FPT, z H-TCH..H (door stock, hidden top rail)
 *   T2   behind T1, CPT thick, same Z
 *   T3   XY outline, 90 deep from the front, z H-TCH-CPT-1 .. H-TCH-1
 *        (sits in the divider front step)
 *   T4   vertical XZ plate, y Cd-2CPT-clearance .. Cd-CPT-clearance,
 *        z H-50..H, divider notches at its bottom edge
 *   FP_i y -FPT..0, z -30 .. H-TCH-1
 */
export const OVERHEAD_BOARD_FRAME = "final" as const;

/** Names a layout.json rule may use: the inputs (param when given, the rule default otherwise) and every rule constant. */
function ruleScope(inputs: OverheadCabinetInputs): Record<string, Term> {
  const height = inputs.cabinetHeight ?? inputs.topClearanceHeight ?? R.T1_HEIGHT_MM.value;
  const P = param({ Cw: inputs.cabinetWidth, Cd: inputs.cabinetDepth, H: height });
  const t = <T extends Term>(v: number | null | undefined, name: string, rule: T): Term =>
    v == null ? rule : param({ [name]: v })[name]!;
  return {
    ...R,
    Cw: P.Cw, Cd: P.Cd, H: P.H,
    CPT: t(inputs.featureWidth, "CPT", R.DIVIDER_THICKNESS_MM),
    FPT: t(inputs.frontPanelThickness, "FPT", R.DEFAULT_FRONT_PANEL_THICKNESS_MM),
    TCH: t(inputs.topClearanceHeight, "TCH", R.T1_HEIGHT_MM),
    clearance: t(inputs.clearance, "clearance", R.DEFAULT_CLEARANCE_MM),
  };
}

/**
 * Where the dividers cut a top board, in the board's frame (`frameX0` = the frame's left face).
 * The notches belong to the dividers: a board moved along X keeps them where the dividers are.
 */
function dividerNotches(geometry: OverheadLegacyGeometry, inputs: OverheadCabinetInputs, frameX0: number, lo: number, hi: number): [number, number][] {
  const slot = (inputs.featureWidth ?? DIVIDER_THICKNESS_MM) + R.FEATURE_CLEARANCE_MM.value;
  return geometry.divider_features
    .map((f) => clampRange(featureXRange(f.XDi, slot), 0, inputs.cabinetWidth))
    .map(([a, b]) => [Math.max(a - frameX0, lo), Math.min(b - frameX0, hi)] as [number, number])
    .filter(([a, b]) => b - a > 1e-6);
}

/**
 * T3's outline from its corner rules (board edit). The corners are in T3's placement frame;
 * the default rectangle keeps geometry.ts's outline exactly. Otherwise the outline is rebuilt
 * from the four corners with the divider notches on the rear edge, and the box becomes the
 * outline's extent — the frame does not move, so a corner pulled out does not shift the board.
 */
function shapeT3(
  rule: BoardRule,
  frame: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number },
  geometry: OverheadLegacyGeometry,
  inputs: OverheadCabinetInputs,
  scope: Record<string, Term>,
  _warnings: string[],
): { box: typeof frame; outline: [number, number][] } {
  const corners = rule.outline!.corners;
  const c: Record<string, [number, number]> = {};
  for (const k of CORNERS) {
    c[k] = [
      recordExpr(`T3.corner.${k}.u`, corners[k]!.u, scope, `T3 corner ${k} u`),
      recordExpr(`T3.corner.${k}.v`, corners[k]!.v, scope, `T3 corner ${k} v`),
    ];
  }
  const W = frame.x1 - frame.x0;
  const D = frame.y1 - frame.y0;
  const at = (k: string, u: number, v: number) => Math.abs(c[k]![0] - u) < 1e-9 && Math.abs(c[k]![1] - v) < 1e-9;
  // geometry.ts's outline is in cabinet coordinates: it is only this board's outline while the frame sits at the origin.
  const legacy = geometry.trimmed_vectors.T3;
  const legacyFits = Math.abs(frame.x0) < 1e-9 && Math.abs(frame.y0) < 1e-9
    && Math.abs(Math.max(...legacy.map((p) => p[0])) - W) < 1e-9 && Math.abs(Math.max(...legacy.map((p) => p[1])) - D) < 1e-9;
  if (legacyFits && at("FL", 0, 0) && at("FR", W, 0) && at("RR", W, D) && at("RL", 0, D)) return { box: frame, outline: legacy };

  // Four corners FL → FR → RR → RL: a simple quadrilateral, counter-clockwise like the rectangle.
  const quad = CORNERS.map((k) => c[k]!);
  const cross = (o: number[], a: number[], b: number[]) => (a[0]! - o[0]!) * (b[1]! - o[1]!) - (a[1]! - o[1]!) * (b[0]! - o[0]!);
  const crosses = (p1: number[], p2: number[], p3: number[], p4: number[]) => {
    const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
  };
  let area = 0;
  for (let i = 0; i < 4; i += 1) { const p = quad[i]!; const q = quad[(i + 1) % 4]!; area += p[0] * q[1] - q[0] * p[1]; }
  if (area <= 0 || crosses(quad[0]!, quad[1]!, quad[2]!, quad[3]!) || crosses(quad[1]!, quad[2]!, quad[3]!, quad[0]!)) {
    throw new LayoutError("layout: T3 outline crosses itself or turns inside out: check the corner formulas");
  }

  const K = (name: string) => `T3.corner.${name}`;
  const U = (k: string) => ex({ u: ref(K(`${k}.u`)) }, (t) => t.u, `= ${K(`${k}.u`)}`);
  const V = (k: string) => ex({ v: ref(K(`${k}.v`)) }, (t) => t.v, `= ${K(`${k}.v`)}`);
  dim("T3.pv.rearY", { v: ref(K("RR.v")) }, (t) => t.v, { formula: `= ${K("RR.v")}` });
  dim("T3.pv.notchY", { rearY: ref("T3.pv.rearY"), T3_NOTCH_DEPTH: R.T3_NOTCH_DEPTH_MM }, (t) => t.rearY - t.T3_NOTCH_DEPTH);
  const rearV = ex({ v: ref("T3.pv.rearY") }, (t) => t.v, "rearY");
  const notchV = ex({ v: ref("T3.pv.notchY") }, (t) => t.v, "notchY");
  const o = new Outline("T3.pv", ["x", "y"]);
  o.add(U("FL"), V("FL"));
  o.add(U("FR"), V("FR"));
  const right = c.RR![0];
  const left = c.RL![0];
  if (Math.abs(c.RR![1] - c.RL![1]) > 1e-9) {
    throw new LayoutError("layout: T3 的后边不直，分隔板缺口没法留在这条边上");
  } else {
    // Divider notches on the rear edge, in frame coordinates, right to left (as geometry.ts does).
    const ranges = dividerNotches(geometry, inputs, frame.x0, left, right).sort((p, q) => q[0] - p[0]);
    const nx = (x: number) => ex({ notchX: x }, (t) => t.notchX, "notch edge (divider centre ± slot / 2)");
    if (ranges.length && ranges[0]![1] >= right - 1e-9) {
      const [x0] = ranges.shift()!;
      o.add(U("RR"), notchV);
      o.add(nx(x0), notchV);
      o.add(nx(x0), rearV);
    } else {
      o.add(U("RR"), V("RR"));
    }
    let closed = false;
    for (const [x0, x1] of ranges) {
      if (x0 <= left + 1e-9) {
        o.add(nx(x1), rearV);
        o.add(nx(x1), notchV);
        o.add(U("RL"), notchV);
        closed = true;
        break;
      }
      o.add(nx(x1), rearV);
      o.add(nx(x1), notchV);
      o.add(nx(x0), notchV);
      o.add(nx(x0), rearV);
    }
    if (!closed) o.add(U("RL"), V("RL"));
  }
  o.add(U("FL"), V("FL"));
  const pts = o.points;
  const us = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1]);
  // The box is the outline's extent around the frame; keep the frame on record for the editor.
  for (const f of ["x0", "x1", "y0", "y1"] as const) same(`T3.frame.${f}`, `T3.${f}`);
  const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs);
  const box = {
    x0: dim("T3.x0", { frame: ref("T3.frame.x0"), minU }, (t) => t.frame + t.minU, { formula: "T3.frame.x0 + leftmost corner u" }),
    x1: dim("T3.x1", { frame: ref("T3.frame.x0"), maxU }, (t) => t.frame + t.maxU, { formula: "T3.frame.x0 + rightmost corner u" }),
    y0: dim("T3.y0", { frame: ref("T3.frame.y0"), minV }, (t) => t.frame + t.minV, { formula: "T3.frame.y0 + frontmost corner v" }),
    y1: dim("T3.y1", { frame: ref("T3.frame.y0"), maxV }, (t) => t.frame + t.maxV, { formula: "T3.frame.y0 + rearmost corner v" }),
    z0: frame.z0,
    z1: frame.z1,
  };
  return { box, outline: pts };
}

/** Boards whose outline is rebuilt from the box. Anything else stays in code. */
const RULE_BOARDS = new Set(["T1", "T2", "T3", "T4"]);

function legacyToBoards(
  geometry: OverheadLegacyGeometry,
  inputs: OverheadCabinetInputs,
  rangehood: RangehoodGroup | null,
  layout: LayoutFile,
  warnings: string[],
): Board[] {
  const { cabinetWidth, cabinetDepth, cabinetHeight, bottomThickness, featureWidth, topClearanceHeight, frontPanelThickness, clearance } = {
    cabinetWidth: inputs.cabinetWidth,
    cabinetDepth: inputs.cabinetDepth,
    cabinetHeight: inputs.cabinetHeight,
    bottomThickness: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    featureWidth: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    topClearanceHeight: inputs.topClearanceHeight ?? R.T1_HEIGHT_MM.value,
    frontPanelThickness: inputs.frontPanelThickness ?? R.DEFAULT_FRONT_PANEL_THICKNESS_MM.value,
    clearance: inputs.clearance ?? R.DEFAULT_CLEARANCE_MM.value,
  };
  const height = cabinetHeight ?? topClearanceHeight;

  // Terms: a param when the user gave it, the rule constant otherwise.
  const P = param({ Cw: cabinetWidth, Cd: cabinetDepth, H: height });
  const t = <T extends Term>(v: number | null | undefined, name: string, rule: T): Term =>
    v == null ? rule : param({ [name]: v })[name]!;
  const CPT = t(inputs.featureWidth, "CPT", R.DIVIDER_THICKNESS_MM);
  const TCH = t(inputs.topClearanceHeight, "TCH", R.T1_HEIGHT_MM);
  const FPT = t(inputs.frontPanelThickness, "FPT", R.DEFAULT_FRONT_PANEL_THICKNESS_MM);
  const CL = t(inputs.clearance, "clearance", R.DEFAULT_CLEARANCE_MM);
  const zero = (key: string) => dim(key, {}, () => 0, { formula: "0" });

  const boards: Board[] = [
    {
      id: "BP",
      name: "Bottom Panel",
      category: "panel",
      boardType: "BP",
      materialThickness: bottomThickness,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: zero("BP.x0"),
      x1: dim("BP.x1", { Cw: P.Cw }, (t) => t.Cw),
      y0: zero("BP.y0"),
      y1: dim("BP.y1", { Cd: P.Cd }, (t) => t.Cd),
      z0: zero("BP.z0"),
      z1: dim("BP.z1", { CPT }, (t) => t.CPT),
      source: "overhead",
    },
  ];

  // Placed after BP so a rule may refer to the bottom panel's faces; the dividers come later in code.
  const hasT3 = geometry.trimmed_vectors.T3.length > 0;
  const hasT4 = geometry.trimmed_vectors.T4.length > 0;
  const scope = ruleScope(inputs);
  // Notch planes (`D3.cut.rearY0`) have to exist before T1–T4 are placed, so a
  // face relation can sit on a step inside a divider, not only on its outer box.
  for (const feature of geometry.divider_features) alias("DividerSide", `${feature.id}.cut`);
  const placed = placeBoards(
    layout,
    ["T1", "T2", ...(hasT3 ? ["T3"] : []), ...(hasT4 ? ["T4"] : [])],
    scope,
    warnings,
  );
  let t3Outline = geometry.trimmed_vectors.T3;
  if (hasT3 && layout.boards.T3?.outline) {
    const shaped = shapeT3(layout.boards.T3, placed.T3!, geometry, inputs, scope, warnings);
    placed.T3 = shaped.box;
    t3Outline = shaped.outline;
  }
  // T4's outline follows its box: geometry.ts's is in cabinet coordinates, right only while T4 spans 0..Cw at the default height.
  let t4Outline = geometry.trimmed_vectors.T4;
  if (hasT4) {
    const f = placed.T4!;
    const W = f.x1 - f.x0;
    const legacyFits = Math.abs(f.x0) < 1e-9 && Math.abs(W - cabinetWidth) < 1e-9 && Math.abs(f.z1 - f.z0 - R.T4_HEIGHT_MM.value) < 1e-9;
    if (!legacyFits) {
      t4Outline = t4TrimmedOutlinePoints(ref("T4.xSize"), dividerNotches(geometry, inputs, f.x0, 0, W), ref("T4.zSize"), R.T4_NOTCH_HEIGHT_MM);
    }
  }
  // The box comes from layout.json, the outline from geometry.ts: say so when they part.
  const outlineExtent = (id: string, pts: [number, number][], axis: "y" | "z") => {
    const box = placed[id];
    if (!box) return;
    const extent = Math.max(...pts.map(([, v]) => v));
    const size = box[`${axis}1`] - box[`${axis}0`];
    if (Math.abs(extent - size) > 0.01) warnings.push(`${id}: its ${axis} size ${size} differs from its outline (${extent}).`);
  };
  if (hasT3 && !layout.boards.T3?.outline) outlineExtent("T3", geometry.trimmed_vectors.T3, "y");
  if (hasT4) outlineExtent("T4", t4Outline, "z");

  boards.push({
    id: "T1",
    name: "Top Front Rail T1",
    category: "rail",
    boardType: "T1",
    materialThickness: frontPanelThickness,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    ...placed.T1!,
    source: "overhead",
  });

  boards.push({
    id: "T2",
    name: "Top Front Rail T2",
    category: "rail",
    boardType: "T2",
    materialThickness: featureWidth,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    ...placed.T2!,
    source: "overhead",
  });

  if (hasT3) {
    boards.push({
      id: "T3",
      name: "Top Rear Panel",
      category: "panel",
      boardType: "T3",
      materialThickness: featureWidth,
      profilePlane: "XY",
      thicknessAxis: "Z",
      ...placed.T3!,
      source: "overhead",
      profileVector: t3Outline.map(([x, y]) => ({ x, y })),
    });
  }

  if (hasT4) {
    // Vertical plate on the divider rear notches; the outline's second
    // coordinate is height (Z), notches open downward.
    boards.push({
      id: "T4",
      name: "Top Front Panel",
      category: "panel",
      boardType: "T4",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      ...placed.T4!,
      source: "overhead",
      profileVector: t4Outline.map(([x, z]) => ({ x, z })),
    });
  }

  for (let dividerIndex = 0; dividerIndex < geometry.divider_features.length; dividerIndex += 1) {
    const feature = geometry.divider_features[dividerIndex]!;
    const id = feature.id;
    // Board solid thickness must be featureWidth (CPT), not the BP groove
    // slot width (CPT + clearance). Groove/notch features keep the wider
    // slot range; only the divider body uses boardXRange.
    const [x0, x1] = clampRange(boardXRange(feature.XDi, featureWidth), 0, cabinetWidth);
    const xd = `XD${dividerIndex}`;
    dim(`${id}.x0`, { [xd]: ref(xd), CPT }, (t) => Math.max(0, t[xd]! - t.CPT / 2), { formula: `max(0, ${xd} - CPT / 2)` });
    dim(`${id}.x1`, { [xd]: ref(xd), CPT, Cw: P.Cw }, (t) => Math.min(t.Cw, t[xd]! + t.CPT / 2), { formula: `min(Cw, ${xd} + CPT / 2)` });
    // Divider outline origin = BP top face (z = CPT); the tongue in the
    // cutProfileVector dips below z0 into the BP groove.
    const isInternalRangehoodDivider = Boolean(rangehood?.internalDividerIndices.includes(dividerIndex));
    const dividerZ0 = isInternalRangehoodDivider
      ? dim(`${id}.z0`, { CPT, clearHeight: rangehood?.clearHeight ?? 0 }, (t) => t.CPT * 2 + t.clearHeight)
      : dim(`${id}.z0`, { CPT }, (t) => t.CPT);
    const dividerTopZ = cabinetHeight == null
      ? dim(`${id}.z1`, { CPT }, (t) => t.CPT + 1)
      : dim(`${id}.z1`, { H: P.H }, (t) => t.H);
    const dividerProfile = isInternalRangehoodDivider
      ? internalRangehoodDividerProfile(inputs, rangehood?.clearHeight ?? 0)
      : geometry.trimmed_vectors.DividerSide;
    alias(isInternalRangehoodDivider ? "DividerSideRangehood" : "DividerSide", `${id}.cut`);
    boards.push({
      id,
      name: `Divider ${id}`,
      category: "divider",
      boardType: "divider",
      materialThickness: featureWidth,
      profilePlane: "YZ",
      thicknessAxis: "X",
      x0,
      x1,
      y0: zero(`${id}.y0`),
      y1: dim(`${id}.y1`, { Cd: P.Cd }, (t) => t.Cd),
      z0: dividerZ0,
      z1: dividerTopZ,
      source: "overhead",
      cutProfileVector:
        dividerProfile.length > 0
          ? dividerProfile.map(([y, z]) => ({ y, z }))
          : undefined,
      profileFeatures: [
        ...(isInternalRangehoodDivider ? [] : [feature.bp_groove]),
        feature.divider_tongue,
        feature.t3_notch,
        feature.t4_notch,
      ],
      notes: isInternalRangehoodDivider
        ? ["Rangehood internal divider starts on RGHD_TOP; BP groove suppressed."]
        : undefined,
    });
  }

  if (rangehood) {
    const tongueProjection = dim("RGHD.tongueProjection", { CPT }, (t) => t.CPT / 2 - 0.5);
    const bpTopZ = same("RGHD.bpTopZ", "BP.z1");
    const topBottomZ = dim("RGHD.topBottomZ", { bpTopZ: ref("RGHD.bpTopZ"), clearHeight: rangehood.clearHeight }, (t) => t.bpTopZ + t.clearHeight);
    const topX0 = dim("RGHD_TOP.x0", { rghdX0: rangehood.x0, tongueProjection: ref("RGHD.tongueProjection") }, (t) => t.rghdX0 - t.tongueProjection);
    const topX1 = dim("RGHD_TOP.x1", { rghdX1: rangehood.x1, tongueProjection: ref("RGHD.tongueProjection") }, (t) => t.rghdX1 + t.tongueProjection);
    boards.push({
      id: "RGHD_TOP",
      name: "Rangehood Top",
      category: "rangehood",
      boardType: "RGHD_TOP",
      materialThickness: featureWidth,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: topX0,
      x1: topX1,
      y0: zero("RGHD_TOP.y0"),
      y1: dim("RGHD_TOP.y1", { Cd: P.Cd }, (t) => t.Cd),
      z0: same("RGHD_TOP.z0", "RGHD.topBottomZ"),
      z1: dim("RGHD_TOP.z1", { z0: ref("RGHD_TOP.z0"), CPT }, (t) => t.z0 + t.CPT),
      source: "overhead_rangehood",
      profileVector: rangehoodTopProfile(rangehood.clearWidth, cabinetDepth, tongueProjection),
      notes: ["NCE rangehood top with side tongues."],
    });
    boards.push({
      id: "RGHD_FRONT",
      name: "Rangehood Front",
      category: "rangehood",
      boardType: "RGHD_FRONT",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: dim("RGHD_FRONT.x0", { rghdX0: rangehood.x0 }, (t) => t.rghdX0),
      x1: dim("RGHD_FRONT.x1", { rghdX1: rangehood.x1 }, (t) => t.rghdX1),
      y0: zero("RGHD_FRONT.y0"),
      y1: dim("RGHD_FRONT.y1", { CPT }, (t) => t.CPT),
      z0: same("RGHD_FRONT.z0", "RGHD.bpTopZ"),
      z1: same("RGHD_FRONT.z1", "RGHD.topBottomZ"),
      source: "overhead_rangehood",
    });
    boards.push({
      id: "RGHD_BACK",
      name: "Rangehood Back",
      category: "rangehood",
      boardType: "RGHD_BACK",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: dim("RGHD_BACK.x0", { rghdX0: rangehood.x0 }, (t) => t.rghdX0),
      x1: dim("RGHD_BACK.x1", { rghdX1: rangehood.x1 }, (t) => t.rghdX1),
      y0: dim("RGHD_BACK.y0", { Cd: P.Cd, CPT }, (t) => t.Cd - t.CPT),
      y1: dim("RGHD_BACK.y1", { Cd: P.Cd }, (t) => t.Cd),
      z0: same("RGHD_BACK.z0", "RGHD.bpTopZ"),
      z1: same("RGHD_BACK.z1", "RGHD.topBottomZ"),
      source: "overhead_rangehood",
    });
    void bpTopZ; void topBottomZ;
  }

  for (const panel of geometry.front_panels) {
    // Faces were recorded as FP<i>.x0 … .z1 by frontPanels(); the outline is the
    // panel rectangle in board-local XZ.
    const K = (n: string) => `${panel.id}.pv${n}`;
    const w = dim(`${panel.id}.width`, { x1: ref(`${panel.id}.x1`), x0: ref(`${panel.id}.x0`) }, (t) => t.x1 - t.x0);
    const h = dim(`${panel.id}.height`, { z1: ref(`${panel.id}.z1`), z0: ref(`${panel.id}.z0`) }, (t) => t.z1 - t.z0);
    void w; void h;
    for (const [i, [fx, fz]] of [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]].entries()) {
      dim(K(`[${i}].x`), fx ? { width: ref(`${panel.id}.width`) } : {}, fx ? (t) => t.width : () => 0, { formula: fx ? "width" : "0" });
      dim(K(`[${i}].z`), fz ? { height: ref(`${panel.id}.height`) } : {}, fz ? (t) => t.height : () => 0, { formula: fz ? "height" : "0" });
    }
    boards.push({
      id: panel.id,
      name: `Front Panel ${panel.zoneIndex + 1}`,
      category: "front_panel",
      boardType: panel.type,
      materialThickness: panel.thickness,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: panel.x[0],
      x1: panel.x[1],
      y0: panel.y[0],
      y1: panel.y[1],
      z0: panel.z[0],
      z1: panel.z[1],
      source: "overhead",
      profileVector: [
        { x: 0, z: 0 },
        { x: panel.width, z: 0 },
        { x: panel.width, z: panel.height },
        { x: 0, z: panel.height },
        { x: 0, z: 0 },
      ],
    });
  }

  // Only boards placed above follow their box (T3 / T4 outlines are rebuilt from it).
  // A rule for a divider or a door would move the box and leave the tongue, notches and grooves.
  for (const id of Object.keys(layout.boards)) {
    const axes = layout.boards[id]?.axes;
    if (!axes?.x || !axes?.y || !axes?.z || placed[id] || RULE_BOARDS.has(id)) continue;
    throw new LayoutError(`layout: ${id} 的缺口和槽由代码算，这条位置没有写上`);
  }

  return boards;
}

function generateRangehoodFeatures(
  geometry: OverheadLegacyGeometry,
  rangehood: RangehoodGroup | null,
): Array<Record<string, unknown>> {
  if (!rangehood) return [];
  const cpt = geometry.manufacturing.FGw;
  const depth = geometry.cabinet.Cd;
  const bpTopZ = cpt;
  const grooveZ0 = bpTopZ + rangehood.clearHeight;
  const grooveY: [number, number] = [depth / 3, depth * 2 / 3];
  const cutoutY0 = (depth - RANGEHOOD_CUTOUT_DEPTH_MM) / 2;
  const cutoutX0 = rangehood.alignment === "left"
    ? rangehood.x0 + rangehood.edgeOffsetX
    : rangehood.x1 - rangehood.edgeOffsetX - RANGEHOOD_CUTOUT_WIDTH_MM;
  const cutoutX1 = cutoutX0 + RANGEHOOD_CUTOUT_WIDTH_MM;

  const features: Array<Record<string, unknown>> = [
    {
      id: "RGHD_GROUP",
      type: "rangehood_group",
      preset: RANGEHOOD_PRESET_NCE,
      firstZoneIndex: rangehood.firstZoneIndex,
      lastZoneIndex: rangehood.lastZoneIndex,
      clearWidth: rangehood.clearWidth,
      clearHeight: rangehood.clearHeight,
      alignment: rangehood.alignment,
      edgeOffsetX: rangehood.edgeOffsetX,
      boundaryDividerIds: [
        `D${rangehood.leftDividerIndex}`,
        `D${rangehood.rightDividerIndex}`,
      ],
      internalDividerIds: rangehood.internalDividerIndices.map((index) => `D${index}`),
    },
    {
      id: "BP_NCE_RANGEHOOD_CUTOUT",
      type: "rangehood_bp_cutout",
      targetBoardId: "BP",
      preset: RANGEHOOD_PRESET_NCE,
      through: true,
      shape: "rectangle",
      x: [cutoutX0, cutoutX1],
      y: [cutoutY0, cutoutY0 + RANGEHOOD_CUTOUT_DEPTH_MM],
      width: RANGEHOOD_CUTOUT_WIDTH_MM,
      depth: RANGEHOOD_CUTOUT_DEPTH_MM,
      alignment: rangehood.alignment,
      edgeOffsetX: rangehood.edgeOffsetX,
    },
    {
      id: `RGHD_D${rangehood.leftDividerIndex}_SIDE_GROOVE`,
      type: "rangehood_divider_side_groove",
      targetBoardId: `D${rangehood.leftDividerIndex}`,
      face: "+X",
      y: grooveY,
      z: [grooveZ0, grooveZ0 + cpt + 1],
      depth: cpt / 2,
      widthY: depth / 3,
    },
    {
      id: `RGHD_D${rangehood.rightDividerIndex}_SIDE_GROOVE`,
      type: "rangehood_divider_side_groove",
      targetBoardId: `D${rangehood.rightDividerIndex}`,
      face: "-X",
      y: grooveY,
      z: [grooveZ0, grooveZ0 + cpt + 1],
      depth: cpt / 2,
      widthY: depth / 3,
    },
  ];

  for (const dividerIndex of rangehood.internalDividerIndices) {
    const divider = geometry.divider_features[dividerIndex];
    if (!divider) continue;
    features.push({
      id: `RGHD_TOP_D${dividerIndex}_GROOVE`,
      type: "rangehood_top_divider_groove",
      targetBoardId: "RGHD_TOP",
      dividerBoardId: `D${dividerIndex}`,
      face: "top",
      x: [divider.XDi - (cpt + 1) / 2, divider.XDi + (cpt + 1) / 2],
      y: grooveY,
      depth: cpt / 2,
    });
  }
  return features;
}

function buildInsertBoardLedGroovePath(
  boardWidth: number,
  boardDepth: number,
  boardId: string,
  warnings: string[],
  frontOffset = LED_GROOVE_FRONT_OFFSET,
): {
  main: { x0: number; x1: number; y0: number; y1: number };
  branches: Array<{ x0: number; x1: number; y0: number; y1: number }>;
  branchLength: number;
} | null {
  const halfWidth = LED_GROOVE_WIDTH / 2;
  if (boardWidth <= LED_GROOVE_BRANCH_END_INSET * 2 + LED_GROOVE_WIDTH) {
    warnings.push(
      `${boardId} LED groove skipped: board width ${boardWidth.toFixed(1)} too narrow for 80 mm end insets.`,
    );
    return null;
  }
  const mainYCenter = frontOffset;
  const main = {
    x0: 0,
    x1: boardWidth,
    y0: mainYCenter - halfWidth,
    y1: mainYCenter + halfWidth,
  };
  if (main.y0 < -1e-6 || main.y1 > boardDepth + 1e-6) {
    warnings.push(
      `${boardId} LED groove skipped: main channel y=${main.y0.toFixed(2)}..${main.y1.toFixed(2)} leaves board depth ${boardDepth.toFixed(1)} (frontOffset=${frontOffset}).`,
    );
    return null;
  }
  const branchY0 = main.y1;
  const branchY1 = boardDepth;
  const branchLength = branchY1 - branchY0;
  if (branchLength <= 1e-6) {
    warnings.push(
      `${boardId} LED groove T-branches skipped: no remaining depth behind main channel (y=${branchY0.toFixed(2)}).`,
    );
    return null;
  }
  const branchCenters = [
    LED_GROOVE_BRANCH_END_INSET,
    boardWidth - LED_GROOVE_BRANCH_END_INSET,
  ];
  const branches = branchCenters.map((centerX) => ({
    x0: centerX - halfWidth,
    x1: centerX + halfWidth,
    y0: branchY0,
    y1: branchY1,
  }));
  return { main, branches, branchLength };
}

function t3LedBoardExtents(board: Board): { width: number; depth: number } {
  const width = board.x1 - board.x0;
  const profileYs = (board.profileVector || [])
    .map((point) => Number((point as { y?: number }).y))
    .filter((value) => Number.isFinite(value));
  if (profileYs.length >= 2) {
    return { width, depth: Math.max(...profileYs) - Math.min(...profileYs) };
  }
  // T3 board bbox is padded to cabinet depth; solid outline is ~90 mm.
  return {
    width,
    depth: Math.min(T3_LED_BOARD_DEPTH_FALLBACK, Math.max(0, board.y1 - board.y0)),
  };
}

/**
 * The LED groove is one feature however many segments it is cut as: its depth comes from one
 * rule (layout.json T3.features.LED) and every segment uses it. Through or deeper than the
 * board is never cut back silently.
 */
function applyLedDepth(
  ledFeatures: Array<Record<string, unknown>>,
  layout: LayoutFile,
  inputs: OverheadCabinetInputs,
  boards: Board[],
  warnings: string[],
): void {
  const rule = layout.boards.T3?.features?.LED;
  const led = ledFeatures.find((f) => f.type === "t3_groove");
  if (!rule || !led) return;
  const depth = recordExpr("T3.feat.LED.depth", rule.depth, ruleScope(inputs), "T3 LED depth");
  const t3 = boards.find((b) => b.id === "T3");
  const thick = t3 ? t3.z1 - t3.z0 : Infinity;
  if (!(depth > 0)) throw new LayoutError(`layout: the T3 LED groove depth is ${depth}; it must be above 0`);
  if (depth > thick + 1e-9) throw new LayoutError(`layout: T3 灯槽深度 ${depth} 深过板厚 ${thick}`);
  if (Math.abs(depth - thick) < 1e-9) warnings.push(`T3: 灯槽深度等于板厚 ${thick}，这一刀切穿了`);
  led.depth = depth;
}

function generateT3LedGrooveFeatures(
  boards: Board[],
  warnings: string[],
  params: OverheadCabinetParams,
): Array<Record<string, unknown>> {
  // Overhead Style 1/2 only changes divider front notches; gate on checkbox.
  if (params.ledGroove === false) return [];

  const t3 = boards.find((board) => board.id === "T3" && board.boardType === "T3");
  if (!t3) {
    warnings.push("T3 LED groove skipped: T3 board missing.");
    return [];
  }

  // Front land (edge → groove) = 18 mm → centerline = 18 + 14.5/2 = 25.25.
  const frontOffset = LED_GROOVE_FRONT_OFFSET;
  const { width, depth } = t3LedBoardExtents(t3);
  const path = buildInsertBoardLedGroovePath(width, depth, "T3", warnings);
  if (!path) return [];

  t3.notes = [
    ...(t3.notes ?? []).filter((note) => !note.toLowerCase().includes("led groove")),
    `T3 LED groove path on top face (${LED_GROOVE_FRONT_LAND_MM} mm front land)`,
  ];

  return [
    {
      id: "T3_led_groove",
      type: "t3_groove",
      targetBoardId: "T3",
      face: "top",
      width: LED_GROOVE_WIDTH,
      depth: LED_GROOVE_DEPTH,
      frontOffset,
      frontLand: LED_GROOVE_FRONT_LAND_MM,
      branchCount: path.branches.length,
      branchLength: path.branchLength,
      branchWidth: LED_GROOVE_WIDTH,
      branchEndInset: LED_GROOVE_BRANCH_END_INSET,
      main: path.main,
      branches: path.branches,
      source: "T3",
      notes: [
        "T3 LED groove on top face (opens upward)",
        `Main channel along X, ${LED_GROOVE_FRONT_LAND_MM} mm land from T3 front then ${LED_GROOVE_WIDTH} mm groove (centerline ${frontOffset} mm)`,
        "Two rear T-branches parallel to Y, extend to T3 back edge, centers inset 80 mm from each X end",
      ],
    },
  ];
}

function resolveCarcassColor(params: OverheadCabinetParams): { carcassColor: string; carcassColorName: string } {
  const raw = String(params.carcassColor || params.carcassColorName || "white_stipple").trim();
  const tag = raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "white_stipple";
  const name = String(params.carcassColorName || (tag === "white_stipple" ? "White Stipple" : raw)).trim() || "White Stipple";
  return { carcassColor: tag, carcassColorName: name };
}

export interface OverheadGenerateOptions {
  /** Placement rules to use instead of layout.json (the bench's unsaved draft). */
  layout?: unknown;
}

export function generateOverheadCabinet(rawParams: OverheadCabinetParams, options: OverheadGenerateOptions = {}): OverheadCabinetResult {
  beginProvenance();
  try {
    return generateOverheadCabinetInner(rawParams, options);
  } finally {
    // endProvenance() is called inside on success; this only clears after a throw.
    if (provenanceActive()) endProvenance();
  }
}

function generateOverheadCabinetInner(rawParams: OverheadCabinetParams, options: OverheadGenerateOptions): OverheadCabinetResult {
  const inputs = toInputs(rawParams);
  const carcassColor = resolveCarcassColor(rawParams);
  const validation = { errors: [] as string[], warnings: [] as string[] };

  if (!Number.isFinite(inputs.cabinetWidth) || inputs.cabinetWidth <= 0) {
    validation.errors.push("cabinetWidth must be a positive number.");
  }
  if (!Number.isFinite(inputs.cabinetDepth) || inputs.cabinetDepth <= 0) {
    validation.errors.push("cabinetDepth must be a positive number.");
  }
  if (
    inputs.cabinetHeight != null &&
    (!Number.isFinite(inputs.cabinetHeight) || inputs.cabinetHeight <= 0)
  ) {
    validation.errors.push("cabinetHeight must be a positive number when provided.");
  }

  const geometry = validation.errors.length === 0 ? calculateOverheadGeometry(inputs) : null;
  const rangehood = geometry ? resolveRangehoodGroup(rawParams, geometry, validation) : null;
  const centerlines = geometry ? geometry.divider_features.map((f) => f.XDi) : [];

  const resolvedParams = (): OverheadCabinetResult["params"] => ({
    cabinetWidth: inputs.cabinetWidth,
    cabinetDepth: inputs.cabinetDepth,
    cabinetHeight: inputs.cabinetHeight ?? 0,
    style: inputs.style ?? "style_1",
    topClearanceHeight: inputs.topClearanceHeight ?? R.T1_HEIGHT_MM.value,
    frontPanelThickness: inputs.frontPanelThickness ?? R.DEFAULT_FRONT_PANEL_THICKNESS_MM.value,
    clearance: inputs.clearance ?? R.DEFAULT_CLEARANCE_MM.value,
    hingeHoleDiameter: inputs.hingeHoleDiameter ?? R.DEFAULT_HINGE_HOLE_DIAMETER_MM.value,
    hingeHoleDepth: inputs.hingeHoleDepth ?? R.DEFAULT_HINGE_HOLE_DEPTH_MM.value,
    hingeHoleFromTop: inputs.hingeHoleFromTop ?? R.DEFAULT_HINGE_HOLE_FROM_TOP_MM.value,
    hingeHoleFromSide: inputs.hingeHoleFromSide ?? R.DEFAULT_HINGE_HOLE_FROM_SIDE_MM.value,
    bottomThickness: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    dividerTongueHeight: inputs.dividerTongueHeight ?? (inputs.featureWidth ?? DIVIDER_THICKNESS_MM) / 2 - 0.5,
    routerDiameter: inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM,
    featureWidth: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    internalDividerCenterlines: inputs.internalDividerCenterlines ?? [],
    rangehoodPreset: String(rawParams.rangehoodPreset || RANGEHOOD_PRESET_NCE),
    rangehoodClearHeight: Number(rawParams.rangehoodClearHeight ?? RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM),
    rangehoodAlignment: String(rawParams.rangehoodAlignment || "left"),
    rangehoodEdgeOffsetX: Number(rawParams.rangehoodEdgeOffsetX ?? RANGEHOOD_MIN_EDGE_MM),
    ...carcassColor,
  });

  let layout: LayoutFile = LAYOUT;
  if (options.layout != null) {
    try {
      layout = validateLayout(options.layout);
    } catch (err) {
      validation.errors.push((err as Error).message);
    }
  }
  let boards: Board[] = [];
  let ledFeatures: Array<Record<string, unknown>> = [];
  if (geometry && validation.errors.length === 0) {
    try {
      boards = legacyToBoards(geometry, inputs, rangehood, layout, validation.warnings);
      ledFeatures = generateT3LedGrooveFeatures(boards, validation.warnings, rawParams);
      applyLedDepth(ledFeatures, layout, inputs, boards, validation.warnings);
    } catch (err) {
      if (!(err instanceof LayoutError)) throw err;
      validation.errors.push(err.message);
    }
  }

  if (validation.errors.length > 0) {
    return {
      params: resolvedParams(),
      boards: [],
      features: [],
      joints: [],
      relationshipDeclarations: [],
      validation,
      debug: {
        phase: "geometry_v1",
        boardFrame: OVERHEAD_BOARD_FRAME,
        dividerCenterlines: centerlines,
        provenance: endProvenance(),
      },
    };
  }

  if (!geometry) {
    throw new Error("Overhead geometry was not resolved after validation.");
  }
  const relationshipDeclarations = relationshipDeclarationsForBoards(boards);
  const rangehoodFeatures = generateRangehoodFeatures(geometry, rangehood);
  const dividerFeatures = geometry.divider_features.map((feature, index) => {
    if (!rangehood?.internalDividerIndices.includes(index)) return feature;
    return { ...feature, bp_groove: undefined };
  });

  // Face layer: A / B / E<i> on every board, then each feature on the face it is machined into.
  attachFaces(boards);
  const joints = buildOverheadFaces({
    boards,
    geometry,
    inputs,
    suppressedGrooves: rangehood?.internalDividerIndices ?? [],
    ledFeatures,
    rangehoodFeatures,
    declarations: relationshipDeclarations,
    carcassColorName: carcassColor.carcassColorName,
    doorColour: doorColourOf(rawParams),
  });
  // Flap fronts and T1: one group, horizontal unless chosen otherwise.
  const grain = applyGrain(boards, (b) => (b.stock?.kind === "door" ? "front" : null), rawParams, { front: "horizontal" });
  applyDoorSides(boards, { ...rawParams, carcassColorName: carcassColor.carcassColorName });
  const milling = applyMilling(boards);

  return {
    params: resolvedParams(),
    boards,
    grain,
    milling,
    features: [
      ...dividerFeatures,
      ...geometry.front_panels,
      ...geometry.hinge_holes,
      ...rangehoodFeatures,
      ...ledFeatures,
    ],
    joints,
    relationshipDeclarations,
    validation,
    debug: {
      phase: "geometry_v1",
      boardFrame: OVERHEAD_BOARD_FRAME,
      dividerCenterlines: centerlines,
      placement: Object.fromEntries(
        boards.filter((b) => layout.boards[b.id]).map((b) => [b.id, layout.boards[b.id]!]),
      ),
      legacyGeometry: geometry,
      svgPreview: generateOHCSvgPreview(geometry, {
        selectedZoneIndex: Number((rawParams as { selectedZoneIndex?: number }).selectedZoneIndex ?? -1),
      }),
      provenance: endProvenance(),
      ruleBoards: [...RULE_BOARDS],
    },
  };
}
