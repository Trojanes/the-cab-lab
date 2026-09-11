/**
 * Bedroom (vehicle nose) v0 generator — the slab as one solid volume.
 *
 * The slab is bounded by the floor, the van's roof profile, both side walls,
 * the nose tip (y = depth) and a flat room-side face (y = 0). This version
 * emits no boards: the renderer shows the envelope itself as a solid block.
 * Partitioning (tunnel boot, robes, overhead) comes in a later version and
 * adds boards inside this same envelope.
 *
 * Coordinates: X left→right, Y room face (0) → nose (depth), Z floor→top.
 */

import type { BedroomParams, BedroomResult, Board } from "./types.ts";

const DEFAULT_CPT = 16;
const DEFAULT_COLOR = "White Stipple";

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function asNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Roof z at local y from the profile (piecewise linear; flat `height` when absent). */
export function roofAt(profile: Array<[number, number]>, height: number, y: number): number {
  if (!profile || profile.length < 2) return height;
  if (y <= profile[0][0]) return profile[0][1];
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [y0, z0] = profile[i];
    const [y1, z1] = profile[i + 1];
    if (y <= y1 + 1e-9) return y1 - y0 < 1e-9 ? Math.min(z0, z1) : z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
  }
  return profile[profile.length - 1][1];
}

function normalizeProfile(raw: unknown, depth: number, height: number): Array<[number, number]> {
  if (!Array.isArray(raw) || raw.length < 2) return [[0, height], [depth, height]];
  const pts: Array<[number, number]> = [];
  for (const p of raw) {
    const y = Number(Array.isArray(p) ? p[0] : NaN);
    const z = Number(Array.isArray(p) ? p[1] : NaN);
    if (Number.isFinite(y) && Number.isFinite(z)) pts.push([round1(Math.max(0, Math.min(depth, y))), round1(Math.max(0, z))]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  if (!pts.length || pts[0][0] > 0) pts.unshift([0, pts.length ? pts[0][1] : height]);
  if (pts[pts.length - 1][0] < depth) pts.push([depth, pts[pts.length - 1][1]]);
  return pts;
}

export function generateBedroom(raw: BedroomParams): BedroomResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const W = round1(asNum(raw.width, 0));
  const D = round1(asNum(raw.depth, 0));
  const H = round1(asNum(raw.height, 0));
  const t = round1(asNum(raw.panelThickness, DEFAULT_CPT));
  const fpt = round1(asNum(raw.frontPanelThickness, 0));
  const color = String(raw.carcassColor || DEFAULT_COLOR);
  const profile = normalizeProfile(raw.roofProfile, D, H);

  if (W < 600) errors.push("width must be at least 600 mm");
  if (D < 300) errors.push("depth must be at least 300 mm");
  if (H < 600) errors.push("height must be at least 600 mm");
  if (t <= 0) errors.push("panelThickness must be positive");
  const roofMin = Math.min(...profile.map((p) => p[1]));
  if (roofMin < 300) warnings.push(`roof drops to ${roofMin} mm at the nose`);

  const boards: Board[] = []; // v0: the slab is one volume, no boards yet
  const params = { width: W, depth: D, height: H, panelThickness: t, frontPanelThickness: fpt, roofProfile: profile, carcassColor: color };
  const zones = errors.length ? [] : [{ id: "slab" as const, x0: 0, x1: W, y0: 0, y1: D, z0: 0, z1: H }];
  return { params, zones, boards, features: [], validation: { errors, warnings } };
}
