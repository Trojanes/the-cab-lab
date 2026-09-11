/**
 * Bed Box v0 generator — the bed base as one solid volume.
 *
 * Emits no boards: the renderer shows the envelope itself as a solid block.
 * Placement (against the Bedroom body, centred on the van) is the renderer's
 * job; the generator only knows W × D × H.
 */

import type { BedBoxParams, BedBoxResult, Board } from "./types.ts";

export const BED_BOX_DEFAULT_HEIGHT = 420; // = tunnel boot height until the boot is defined on the body
export const BED_BOX_MIN = { width: 300, depth: 300, height: 100 };

const DEFAULT_CPT = 16;
const DEFAULT_COLOR = "White Stipple";

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function asNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function generateBedBox(raw: BedBoxParams): BedBoxResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const W = round1(asNum(raw.width, 0));
  const D = round1(asNum(raw.depth, 0));
  const H = round1(asNum(raw.height, BED_BOX_DEFAULT_HEIGHT));
  const t = round1(asNum(raw.panelThickness, DEFAULT_CPT));
  const fpt = round1(asNum(raw.frontPanelThickness, 0));
  const color = String(raw.carcassColor || DEFAULT_COLOR);

  if (W < BED_BOX_MIN.width) errors.push(`width must be at least ${BED_BOX_MIN.width} mm`);
  if (D < BED_BOX_MIN.depth) errors.push(`depth must be at least ${BED_BOX_MIN.depth} mm`);
  if (H < BED_BOX_MIN.height) errors.push(`height must be at least ${BED_BOX_MIN.height} mm`);
  if (t <= 0) errors.push("panelThickness must be positive");
  if (!errors.length && D < 1800) warnings.push(`bed length ${D} mm is shorter than a standard mattress`);

  const boards: Board[] = []; // v0: one volume, no boards yet
  const params = { width: W, depth: D, height: H, panelThickness: t, frontPanelThickness: fpt, carcassColor: color };
  const zones = errors.length ? [] : [{ id: "box" as const, x0: 0, x1: W, y0: 0, y1: D, z0: 0, z1: H }];
  return { params, zones, boards, features: [], validation: { errors, warnings } };
}
