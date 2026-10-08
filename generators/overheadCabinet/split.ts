/**
 * Split an overhead into two carcasses on a zone boundary.
 *
 * The shared divider (centre on the boundary, one CPT) becomes two end
 * panels butted on that line. BP, T1, T2, T3 and T4 stop there. A notch
 * belongs to the piece that contains the divider's centre — the slot is
 * CPT + 1 wide, so the neighbour's notch crosses the cut by 0.5 mm and
 * would otherwise be drawn as a triangle.
 *
 * Fronts are left as the geometry built them: half a clearance each side
 * of the boundary, not the full edge clearance.
 */
import { dim, param } from "../_lib/dim.ts";
import type { Board } from "../_lib/model.ts";
import {
  bpGroove,
  t3TrimmedOutlinePoints,
  t4TrimmedOutlinePoints,
  type DividerFeature,
  type OverheadCabinetInputs,
  type OverheadLegacyGeometry,
  type PanelScrewHole,
} from "./geometry.ts";
import { RULES as R } from "./rules.ts";

const EPS = 1e-6;

export interface OverheadSplit {
  after: number;
  x: number;
}

interface HoodSide {
  firstZoneIndex: number;
  lastZoneIndex: number;
  leftDividerIndex: number;
  rightDividerIndex: number;
  x0: number;
  x1: number;
  clearWidth: number;
}

function zonesOf(inputs: OverheadCabinetInputs): { type: string; width: number; x0: number; x1: number }[] {
  const zones = inputs.zones ?? [];
  let x = 0;
  return zones.map((zone) => {
    const width = Number(zone.width) || 0;
    const out = { type: String(zone.type || "up_flap"), width, x0: x, x1: x + width };
    x += width;
    return out;
  });
}

/** Boundaries the arrow may sit on: between two zones, never inside one rangehood group. */
export function overheadSplitTargets(
  zones: { type?: string; width?: number }[],
): { after: number; x: number }[] {
  const out: { after: number; x: number }[] = [];
  let x = 0;
  for (let i = 0; i < zones.length - 1; i += 1) {
    x += Number(zones[i]?.width) || 0;
    const hood = zones[i]?.type === "rangehood_flap" && zones[i + 1]?.type === "rangehood_flap";
    if (!hood) out.push({ after: i, x });
  }
  return out;
}

function slotRange(center: number, slot: number, x0: number, x1: number): [number, number] | null {
  const a = Math.max(center - slot / 2, x0);
  const b = Math.min(center + slot / 2, x1);
  return b - a > EPS ? [a, b] : null;
}

function retarget(feature: DividerFeature, center: number, inputs: OverheadCabinetInputs, id: string): void {
  const cpt = inputs.featureWidth ?? R.DIVIDER_THICKNESS_MM.value;
  const slot = cpt + R.FEATURE_CLEARANCE_MM.value;
  const depth = inputs.dividerTongueHeight ?? cpt / 2 - 0.5;
  feature.id = id;
  feature.XDi = center;
  feature.bp_groove = bpGroove(id, center, inputs.cabinetDepth, slot, depth, inputs.cabinetWidth);
  const x = slotRange(center, slot, 0, inputs.cabinetWidth) ?? feature.bp_groove.x;
  feature.t3_notch = { ...feature.t3_notch, id: `${id}_T3`, for_divider: id, x, width_x: x[1] - x[0] };
  feature.t4_notch = { ...feature.t4_notch, id: `${id}_T4`, for_divider: id, x, width_x: x[1] - x[0] };
  feature.screw_holes = feature.screw_holes.map((hole) => ({ ...hole, x: center }));
}

function outlineFor(
  kind: "T3" | "T4",
  id: string,
  x0: number,
  x1: number,
  features: DividerFeature[],
  slot: number,
): { x: number; y?: number; z?: number }[] {
  const width = x1 - x0;
  const ranges = features
    .filter((f) => f.XDi > x0 + EPS && f.XDi < x1 - EPS)
    .map((f) => {
      const a = Math.max(f.XDi - slot / 2, x0) - x0;
      const b = Math.min(f.XDi + slot / 2, x1) - x0;
      return [a, b] as [number, number];
    })
    .filter(([a, b]) => b - a > EPS);
  const widthTerm = param({ w: width }).w;
  const pts = kind === "T3"
    ? t3TrimmedOutlinePoints(widthTerm, ranges, R.T3_DEPTH_MM, R.T3_NOTCH_DEPTH_MM, `${id}.pv`)
    : t4TrimmedOutlinePoints(widthTerm, ranges, R.T4_HEIGHT_MM, R.T4_NOTCH_HEIGHT_MM, `${id}.pv`);
  return pts.map(([u, v]) => (kind === "T3" ? { x: u + x0, y: v } : { x: u + x0, z: v }));
}

function splitBox(boards: Board[], id: string, xb: number): void {
  const board = boards.find((b) => b.id === id);
  if (!board || !(board.x0 < xb - EPS && board.x1 > xb + EPS)) return;
  const rightId = `${id}-2`;
  const x1 = board.x1;
  boards.push({ ...board, id: rightId, x0: xb, x1 });
  board.x1 = xb;
  dim(`${id}.x1`, { x: xb }, (t) => t.x, { formula: "split" });
  dim(`${rightId}.x0`, { x: xb }, (t) => t.x, { formula: "split" });
  dim(`${rightId}.x1`, { x: x1 }, (t) => t.x, { formula: "split end" });
}

function addScrew(list: PanelScrewHole[], part: string, feature: DividerFeature, midline: number): void {
  list.push({
    id: `${part}SH_${feature.id}`,
    part,
    for_divider: feature.id,
    center: [feature.XDi, midline],
    diameter: list[0]?.diameter ?? R.SCREW_HOLE_DIAMETER_MM.value,
    depth: list[0]?.depth ?? R.SCREW_HOLE_DEPTH_MM.value,
    axis: "thickness",
  });
}

export function applyOverheadSplit(
  boards: Board[],
  geometry: OverheadLegacyGeometry,
  inputs: OverheadCabinetInputs,
  splitAfter: number | null | undefined,
  hood: HoodSide | null,
  warnings: string[],
): OverheadSplit | null {
  if (splitAfter == null || (splitAfter as unknown) === "") return null;
  const after = Math.round(Number(splitAfter));
  const zones = zonesOf(inputs);
  const allowed = overheadSplitTargets(zones);
  if (!Number.isInteger(after) || !allowed.some((t) => t.after === after)) {
    warnings.push("Split needs a line between two zones, and not through a rangehood.");
    return null;
  }
  const xb = zones[after]!.x1;
  const cpt = inputs.featureWidth ?? R.DIVIDER_THICKNESS_MM.value;
  const slot = cpt + R.FEATURE_CLEARANCE_MM.value;
  const di = geometry.divider_features.findIndex((f) => Math.abs(f.XDi - xb) < 0.51);
  const feature = di >= 0 ? geometry.divider_features[di] : undefined;
  const board = feature ? boards.find((b) => b.id === feature.id) : undefined;
  if (!feature || !board) {
    warnings.push("Split could not find the divider on that zone line.");
    return null;
  }

  const leftCenter = xb - cpt / 2;
  const rightCenter = xb + cpt / 2;
  retarget(feature, leftCenter, inputs, feature.id);
  const rightId = `D${geometry.divider_features.length}`;
  const right: DividerFeature = {
    ...feature,
    bp_groove: feature.bp_groove,
    screw_holes: feature.screw_holes.map((h) => ({ ...h })),
    divider_tongue: { ...feature.divider_tongue, y: [...feature.divider_tongue.y], z: [...feature.divider_tongue.z] },
    t3_notch: { ...feature.t3_notch, x: [...feature.t3_notch.x] },
    t4_notch: { ...feature.t4_notch, x: [...feature.t4_notch.x] },
  };
  retarget(right, rightCenter, inputs, rightId);
  geometry.divider_features.push(right);

  board.x0 = xb - cpt;
  board.x1 = xb;
  board.profileFeatures = [feature.bp_groove, feature.divider_tongue, feature.t3_notch, feature.t4_notch];
  dim(`${board.id}.x0`, { x: xb, CPT: cpt }, (t) => t.x - t.CPT, { formula: "split - CPT" });
  dim(`${board.id}.x1`, { x: xb }, (t) => t.x, { formula: "split" });
  boards.push({
    ...board,
    id: rightId,
    x0: xb,
    x1: xb + cpt,
    profileFeatures: [right.bp_groove, right.divider_tongue, right.t3_notch, right.t4_notch],
  });
  dim(`${rightId}.x0`, { x: xb }, (t) => t.x, { formula: "split" });
  dim(`${rightId}.x1`, { x: xb, CPT: cpt }, (t) => t.x + t.CPT, { formula: "split + CPT" });

  for (const part of ["T2", "T3", "T4"] as const) {
    const holes = geometry.panel_screw_holes[part];
    const hole = holes.find((h) => h.for_divider === feature.id);
    if (hole) hole.center = [leftCenter, hole.center[1]];
    addScrew(holes, part, right, hole?.center[1] ?? 0);
  }

  for (const id of ["BP", "T1", "T2"]) splitBox(boards, id, xb);
  for (const kind of ["T3", "T4"] as const) {
    const src = boards.find((b) => b.id === kind);
    if (!src || !(src.x0 < xb - EPS && src.x1 > xb + EPS)) continue;
    const x1 = src.x1;
    const rightBoardId = `${kind}-2`;
    src.x1 = xb;
    src.profileVector = outlineFor(kind, kind, src.x0, xb, geometry.divider_features, slot) as Board["profileVector"];
    boards.push({
      ...src,
      id: rightBoardId,
      x0: xb,
      x1,
      profileVector: outlineFor(kind, rightBoardId, xb, x1, geometry.divider_features, slot) as Board["profileVector"],
    });
    dim(`${kind}.x1`, { x: xb }, (t) => t.x, { formula: "split" });
    dim(`${rightBoardId}.x0`, { x: xb }, (t) => t.x, { formula: "split" });
    dim(`${rightBoardId}.x1`, { x: x1 }, (t) => t.x, { formula: "split end" });
  }

  if (hood) {
    if (hood.leftDividerIndex === di && hood.firstZoneIndex > after) hood.leftDividerIndex = geometry.divider_features.length - 1;
    const left = geometry.divider_features[hood.leftDividerIndex];
    const rightD = geometry.divider_features[hood.rightDividerIndex];
    if (left && rightD) {
      hood.x0 = left.XDi + cpt / 2;
      hood.x1 = rightD.XDi - cpt / 2;
      hood.clearWidth = hood.x1 - hood.x0;
      const minClear = R.RANGEHOOD_CUTOUT_WIDTH_MM.value + R.RANGEHOOD_MIN_EDGE_MM.value * 2;
      if (hood.clearWidth < minClear - EPS) {
        warnings.push(`The rangehood clear width is ${Math.round(hood.clearWidth * 10) / 10} mm after the split — it needs ${minClear}.`);
      }
    }
  }

  const sheet = R.RUN_SHEET_MAX_MM.value;
  if (xb > sheet) warnings.push(`The left side of the split is ${xb} mm. A board over ${sheet} mm cannot be cut.`);
  if (inputs.cabinetWidth - xb > sheet) warnings.push(`The right side of the split is ${Math.round((inputs.cabinetWidth - xb) * 10) / 10} mm. A board over ${sheet} mm cannot be cut.`);
  return { after, x: xb };
}
