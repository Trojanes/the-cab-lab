/**
 * Bedroom (vehicle nose) v1 generator — the north-south body as five regions.
 *
 * The envelope (width = van, depth from the room face, roof profile) comes
 * from the space and the placement. Inside it the layout is four numbers —
 * `bootHeight`, `wardrobeWidth` (both sides: symmetric by rule), `ohcBottom`,
 * Style 1 `fixedPanelTop`. Nook's wardrobe bottom is boot + 197 + 204 and does not drag.
 * A bed frame and a wardrobe-front style (`style1` | `nook`), and the LED option (`ledGroove`, default on).
 * From those the generator lays out
 *
 *   boot        the tunnel boot, wall to wall, floor → bootHeight   (solid)
 *   wardrobeL/R side wall → wardrobeWidth, bootHeight → roof        (solid)
 *   opening     between the wardrobes, bootHeight → ohcBottom       (void)
 *   ohc         between the wardrobes, ohcBottom → roof             (solid)
 *
 * Every region carries its closed local YZ section (`outlineYZ`) with the
 * roof already applied, so the renderer only extrudes.
 *
 * Boards so far — the tunnel boot, the wardrobe colour panels + top, and Style 1 fronts:
 *
 *   BOOT_DECK / BOOT_BACK / BOOT_FRONT   the tunnel boot (deck on two uprights)
 *   WARD_L/R_STRIP  carcass wall strip, 175 deep, boot deck → the colour panel's top profile.
 *                   Style 1: a through notch from y 75 to the strip's back, so the shelf can pass
 *   WARD_L/R_SHELF  Style 1 carcass shelf, 10 above the wardrobe floor, full depth.
 *                   Tongue into the colour panel; through the wall strip behind y 75
 *   WARD_L/R_PANEL · WARD_L/R_T3 · T2 · T1   colour panel and top (unchanged)
 *   WARD_L/R_FIXED  Style 1 fixed panel: wall → colour panel, wardrobe floor → split
 *   WARD_L/R_DOOR   door: hangs at y −DPT…0, wall + 4 mm → colour panel, up to the T3 top;
 *                   Style 1 from split + 4 mm, nook from the nook shelf underside;
 *                   three Ø35 × 12 cups on face A
 *   WARD_L/R_KICK · WARD_L/R_FLOOR   nook base: wall kick on the deck, floor on it (top = boot + 197)
 *   WARD_L/R_NOOK   nook shelf: underside = boot + 197 + 204, wall → colour panel, 22 short of the
 *                   nose; LED channel underneath. The wall strip stands on it (no Style 1 notch)
 *
 * The middle overhead (OHC_BP, OHC_T3, OHC_D*, OHC_FP*) is its own cabinet between
 * the wardrobes: no T4, T1/T2 stay the shared rails. `ledGroove` (default on) cuts the
 * LED channels into the three T3 tops (`led.ts`). The deck sits on the two uprights.
 *
 * Coordinates: X left→right, Y room face (0) → nose (depth), Z floor→top.
 */

import type {
  BedFrame,
  BedroomLayoutInfo,
  BedroomLayoutKey,
  BedroomParams,
  BedroomResolvedParams,
  BedroomResult,
  BedroomZone,
  BedroomZoneId,
  Board,
  ProfilePoint,
  WardrobeStyle,
} from "./types.ts";
import { RULES as R } from "./rules.ts";
import { Outline, beginProvenance, dim, endProvenance, ex, lit, param, ref, same } from "../_lib/dim.ts";
import { addFeature, annotate, attachFaces, boundaryEdgeFaces, edgeFacesIn, faceRef, joint, localRect, type Joint } from "../_lib/model.ts";
import { buildBedroomOhc, equalOhcZones, normalizeOhcZones, setOhcBoundary, yWhereRoofMeets } from "./ohc.ts";
import { addNookShelfLed, addT3LedChannels } from "./led.ts";
import { applyGrain } from "../_lib/grain.ts";
import { applyDoorSides } from "../_lib/finish.ts";
import { applyMilling } from "../_lib/milling.ts";

export { RULES } from "./rules.ts";
export { equalOhcZones, normalizeOhcZones, setOhcBoundary };
export * from "./svgPreview.ts";

const DEFAULT_CPT = 16;
const DEFAULT_COLOR = "White Stipple";
const EPS = 1e-6;

export const LAYOUT_KEYS: BedroomLayoutKey[] = ["bootHeight", "wardrobeWidth", "ohcBottom", "fixedPanelTop"];

/** Wardrobe front construction. Style 1 drags the fixed-panel split. Nook's wardrobe bottom is computed and does not drag. */
export const WARDROBE_STYLES: Record<WardrobeStyle, { label: string; layoutKey: BedroomLayoutKey | null }> = {
  style1: { label: "Style 1 · door over a fixed panel", layoutKey: "fixedPanelTop" },
  nook: { label: "Nook · door over an open shelf", layoutKey: null },
};
function normalizeStyle(raw: unknown): WardrobeStyle {
  return raw != null && Object.prototype.hasOwnProperty.call(WARDROBE_STYLES, String(raw)) ? (String(raw) as WardrobeStyle) : "style1";
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/** How far the nook U reaches back along the floor. A constant: the lower arc meeting the cut bottom. */
function nookCutReach(): number {
  const cy = R.WARDROBE_NOOK_CUT_LOWER_CENTER_Y_MM.value;
  const cz = R.WARDROBE_NOOK_CUT_LOWER_CENTER_Z_MM.value;
  const rad = R.WARDROBE_NOOK_CUT_LOWER_RADIUS_MM.value;
  return round1(cy + Math.sqrt(rad * rad - cz * cz));
}

/**
 * The U's back edge, from its crest on the wardrobe bottom down to where it
 * meets the floor. Two tangent arcs, chord error about 0.3 mm. Y from the room
 * face, Z absolute.
 */
function nookCutPath(bottomZ: number, topZ: number): Array<{ y: number; z: number }> {
  const uy = R.WARDROBE_NOOK_CUT_UPPER_CENTER_Y_MM.value;
  const ur = R.WARDROBE_NOOK_CUT_UPPER_RADIUS_MM.value;
  const uz = topZ - ur;
  const ly = R.WARDROBE_NOOK_CUT_LOWER_CENTER_Y_MM.value;
  const lz = bottomZ + R.WARDROBE_NOOK_CUT_LOWER_CENTER_Z_MM.value;
  const lr = R.WARDROBE_NOOK_CUT_LOWER_RADIUS_MM.value;
  const ang = (cy: number, cz: number, y: number, z: number) => Math.atan2(y - cy, z - cz);
  const meet = circleMeet(uy, uz, ur, ly, lz, lr);
  const floorY = ly + Math.sqrt(lr * lr - (bottomZ - lz) ** 2);
  const samples = (cy: number, cz: number, rad: number, a0: number, a1: number) => {
    const span = a1 - a0;
    const step = 2 * Math.acos(Math.max(-1, 1 - 0.3 / rad));
    const n = Math.max(1, Math.ceil(Math.abs(span) / step));
    const out: Array<{ y: number; z: number }> = [];
    for (let i = 1; i < n; i += 1) {
      const a = a0 + (span * i) / n;
      out.push({ y: round1(cy + rad * Math.sin(a)), z: round1(cz + rad * Math.cos(a)) });
    }
    return out;
  };
  return [
    { y: round1(uy), z: round1(topZ) },
    ...samples(uy, uz, ur, 0, ang(uy, uz, meet[0], meet[1])),
    { y: round1(meet[0]), z: round1(meet[1]) },
    ...samples(ly, lz, lr, ang(ly, lz, meet[0], meet[1]), ang(ly, lz, floorY, bottomZ)),
    { y: round1(floorY), z: round1(bottomZ) },
  ];
}

function circleMeet(y1: number, z1: number, r1: number, y2: number, z2: number, r2: number): [number, number] {
  const dy = y2 - y1;
  const dz = z2 - z1;
  const d = Math.hypot(dy, dz);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const py = y1 + (a * dy) / d;
  const pz = z1 + (a * dz) / d;
  const yA = py + (h * -dz) / d;
  const zA = pz + (h * dy) / d;
  const yB = py - (h * -dz) / d;
  const zB = pz - (h * dy) / d;
  return yA > yB ? [yA, zA] : [yB, zB];
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

/**
 * The top edge of a region as a polyline over y ∈ [0, depth]: min(zTop, roof(y)),
 * with a vertex wherever the roof crosses zTop so the line stays exact.
 */
function topLine(profile: Array<[number, number]>, depth: number, height: number, zTop: number): ProfilePoint[] {
  const ys = new Set<number>([0, depth]);
  for (const [y] of profile) if (y > 0 && y < depth) ys.add(y);
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [y0, z0] = profile[i];
    const [y1, z1] = profile[i + 1];
    if ((z0 - zTop) * (z1 - zTop) < 0) {
      const y = y0 + ((zTop - z0) * (y1 - y0)) / (z1 - z0);
      if (y > 0 && y < depth) ys.add(round1(y));
    }
  }
  return [...ys].sort((a, b) => a - b).map((y) => ({ y, z: round1(Math.min(zTop, roofAt(profile, height, y))) }));
}

/**
 * Closed local YZ section of the slab between z0 and min(zTop, roof), from the
 * room face toward the nose, cut off where the roof comes down to z0. Null when
 * the region has no height even at the room face.
 */
export function sectionYZ(profile: Array<[number, number]>, depth: number, height: number, z0: number, zTop: number): ProfilePoint[] | null {
  const top = topLine(profile, depth, height, zTop);
  const kept: ProfilePoint[] = [];
  for (let i = 0; i < top.length; i += 1) {
    const p = top[i];
    if (p.z > z0 + EPS) { kept.push(p); continue; }
    if (kept.length) {
      const a = top[i - 1];
      const y = a.z - p.z < EPS ? p.y : a.y + ((a.z - z0) * (p.y - a.y)) / (a.z - p.z);
      kept.push({ y: round1(y), z: round1(z0) });
    }
    break;
  }
  if (!kept.length) return null;
  const yEnd = kept[kept.length - 1].y;
  const out: ProfilePoint[] = [{ y: 0, z: round1(z0) }, { y: yEnd, z: round1(z0) }];
  for (let i = kept.length - 1; i >= 0; i -= 1) {
    const p = kept[i];
    const last = out[out.length - 1];
    if (Math.abs(last.y - p.y) > EPS || Math.abs(last.z - p.z) > EPS) out.push(p);
  }
  out.push({ y: 0, z: round1(z0) });
  return out;
}

/** Depth (local Y extent) of a section — how far toward the nose the region still exists. */
function sectionDepth(outline: ProfilePoint[] | null): number {
  return outline ? Math.max(...outline.map((p) => p.y)) : 0;
}

// --- layout ------------------------------------------------------------------------

function resolve(raw: BedroomParams): BedroomResolvedParams {
  const W = round1(asNum(raw.width, 0));
  const D = round1(asNum(raw.depth, 0));
  const H = round1(asNum(raw.height, 0));
  return {
    width: W,
    depth: D,
    height: H,
    roofProfile: normalizeProfile(raw.roofProfile, D, H),
    bootHeight: round1(asNum(raw.bootHeight, R.BOOT_HEIGHT_DEFAULT_MM.value)),
    wardrobeWidth: round1(asNum(raw.wardrobeWidth, R.WARDROBE_WIDTH_DEFAULT_MM.value)),
    ohcBottom: round1(asNum(raw.ohcBottom, R.OHC_BOTTOM_DEFAULT_MM.value)),
    style: normalizeStyle(raw.style),
    fixedPanelTop: round1(asNum(raw.fixedPanelTop, R.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value)),
    nookShelfBottom: nookWardrobeBottom({ bootHeight: round1(asNum(raw.bootHeight, R.BOOT_HEIGHT_DEFAULT_MM.value)) }),
    ledGroove: raw.ledGroove !== false,
    bedFrame: normalizeBedFrame(raw.bedFrame),
    panelThickness: round1(asNum(raw.panelThickness, DEFAULT_CPT)),
    doorPanelThickness: round1(asNum(raw.doorPanelThickness, R.DOOR_PANEL_THICKNESS_DEFAULT_MM.value)),
    frontPanelThickness: round1(asNum(raw.frontPanelThickness, 0)),
    carcassColor: String(raw.carcassColor || DEFAULT_COLOR),
    doorColor: String(raw.doorColorName || raw.doorColor || DEFAULT_COLOR),
    ohcZones: normalizeOhcZones(raw.ohcZones, round1(W - 2 * round1(asNum(raw.wardrobeWidth, R.WARDROBE_WIDTH_DEFAULT_MM.value)))),
  };
}

/**
 * The range one layout value may take while the other three stay as they are.
 * The panel and the 3D bars clamp to it; the generator reports anything
 * outside it as an error.
 */
export function layoutLimits(raw: BedroomParams, key: BedroomLayoutKey): { min: number; max: number } {
  const p = resolve(raw);
  switch (key) {
    case "bootHeight":
      return { min: R.BOOT_HEIGHT_MIN_MM.value, max: round1(p.ohcBottom - R.OPENING_HEIGHT_MIN_MM.value) };
    case "ohcBottom":
      return { min: round1(p.bootHeight + R.OPENING_HEIGHT_MIN_MM.value), max: round1(p.height - R.OHC_HEIGHT_MIN_MM.value) };
    case "wardrobeWidth":
      // The opening between the wardrobes must take the bed frame.
      return { min: R.WARDROBE_WIDTH_MIN_MM.value, max: round1((p.width - bedFrameWidth(p.bedFrame)) / 2) };
    case "fixedPanelTop": {
      const floor = wardrobeFloorTop(p);
      const doorTop = t3TopOf(p);
      return {
        min: round1(floor + R.WARDROBE_FIXED_PANEL_MIN_MM.value),
        max: round1(doorTop - R.WARDROBE_DOOR_CLEARANCE_MM.value - R.WARDROBE_DOOR_MIN_MM.value),
      };
    }
  }
}

/** Wardrobe floor top (the Style 1 fixed panel sits on this; the nook U cut starts here): boot deck + the raise. */
export function wardrobeFloorTop(p: { bootHeight: number }): number {
  return round1(p.bootHeight + R.WARDROBE_FLOOR_RAISE_MM.value);
}

/** Nook wardrobe bottom (U-cut top, shelf underside, door start): floor top + the fixed cut height. */
export function nookWardrobeBottom(p: { bootHeight: number }): number {
  return round1(wardrobeFloorTop(p) + R.WARDROBE_NOOK_CUT_HEIGHT_MM.value);
}

/** T3 top from the roof at the T2 back — same formula the generator records. */
export function t3TopOf(p: { height: number; roofProfile: Array<[number, number]> }): number {
  return round1(roofAt(p.roofProfile, p.height, R.WARDROBE_T2_BACK_MM.value) - R.WARDROBE_T2_HEIGHT_MM.value - R.WARDROBE_T3_CLEARANCE_MM.value);
}

/** New params with `key` set to `value`, clamped into `layoutLimits` and rounded to 0.1 mm. */
export function setLayout(raw: BedroomParams, key: BedroomLayoutKey, value: number): BedroomParams {
  const { min, max } = layoutLimits(raw, key);
  const v = round1(Math.max(min, Math.min(max, Number(value))));
  if (raw[key] === v) return raw;
  const next: BedroomParams = { ...raw, [key]: v };
  // Raising the boot (or the T3 seat, via a later roof bind) can push the style's own line out of range.
  const own = WARDROBE_STYLES[normalizeStyle(next.style)].layoutKey;
  if (own && key !== own) {
    const lim = layoutLimits(next, own);
    const cur = round1(asNum(next[own], R.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value));
    const clamped = round1(Math.max(lim.min, Math.min(lim.max, cur)));
    if (clamped !== cur) next[own] = clamped;
  }
  return next;
}

/** Bed frames the body can be laid out for. One size each — the frame is a product, not a number to type. */
export const BED_FRAMES: Record<BedFrame, { label: string; rule: "BED_FRAME_QUEEN_WIDTH_MM" }> = {
  queen: { label: "Queen", rule: "BED_FRAME_QUEEN_WIDTH_MM" },
};
function normalizeBedFrame(raw: unknown): BedFrame {
  return raw != null && Object.prototype.hasOwnProperty.call(BED_FRAMES, String(raw)) ? (String(raw) as BedFrame) : "queen";
}
/** Outer width of a bed frame (a rule constant). */
export function bedFrameWidth(frame: BedFrame): number {
  return R[BED_FRAMES[normalizeBedFrame(frame)].rule].value;
}

/**
 * The bed box that stands in the opening and continues into the room: its
 * width is the bed frame's, its height the boot deck's. Only its length is
 * the bed box's own.
 */
export function bedBoxSizeFor(raw: BedroomParams): { W: number; H: number } {
  const p = resolve(raw);
  return { W: bedFrameWidth(p.bedFrame), H: p.bootHeight };
}

// --- generator ---------------------------------------------------------------------

const ZONE_LABEL: Record<BedroomZoneId, string> = {
  boot: "Tunnel boot",
  wardrobeL: "Wardrobe left",
  wardrobeR: "Wardrobe right",
  opening: "Mattress opening",
  ohc: "Overhead",
};

export function generateBedroom(raw: BedroomParams): BedroomResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const p = resolve(raw);
  const { width: W, depth: D, height: H, roofProfile: profile } = p;

  beginProvenance();
  const P = param({ W, D, H, bootHeight: p.bootHeight, wardrobeWidth: p.wardrobeWidth, ohcBottom: p.ohcBottom, fixedPanelTop: p.fixedPanelTop });
  const BED = R[BED_FRAMES[p.bedFrame].rule];

  // Region faces. Every number the regions are built from is recorded once here.
  const bootTop = dim("boot.z1", { bootHeight: P.bootHeight }, (t) => t.bootHeight);
  const wardLx1 = dim("wardrobeL.x1", { wardrobeWidth: P.wardrobeWidth }, (t) => t.wardrobeWidth);
  const wardRx0 = dim("wardrobeR.x0", { W: P.W, wardrobeWidth: P.wardrobeWidth }, (t) => t.W - t.wardrobeWidth);
  const ohcBot = dim("ohc.z0", { ohcBottom: P.ohcBottom }, (t) => t.ohcBottom);
  const openingW = dim("layout.openingWidth", { x1: ref("wardrobeR.x0"), x0: ref("wardrobeL.x1") }, (t) => t.x1 - t.x0);
  const openingH = dim("layout.openingHeight", { top: ref("ohc.z0"), bottom: ref("boot.z1") }, (t) => t.top - t.bottom);
  const ohcH = dim("layout.ohcHeight", { H: P.H, bottom: ref("ohc.z0") }, (t) => t.H - t.bottom);
  const bedW = dim("bedBox.W", { BED }, (t) => t.BED);
  dim("bedBox.H", { bootHeight: ref("boot.z1") }, (t) => t.bootHeight);
  dim("bedBox.x0", { W: P.W, bed: ref("bedBox.W") }, (t) => (t.W - t.bed) / 2);
  dim("bedBox.x1", { x0: ref("bedBox.x0"), bed: ref("bedBox.W") }, (t) => t.x0 + t.bed);
  const bedMargin = dim("layout.bedMargin", { opening: ref("layout.openingWidth"), bed: ref("bedBox.W") }, (t) => (t.opening - t.bed) / 2);
  const roofMin = round1(Math.min(...profile.map((q) => q[1])));

  // Envelope checks (as before).
  if (W < 600) errors.push("width must be at least 600 mm");
  if (D < 300) errors.push("depth must be at least 300 mm");
  if (H < 600) errors.push("height must be at least 600 mm");
  if (p.panelThickness <= 0) errors.push("panelThickness must be positive");
  if (roofMin < 300) warnings.push(`roof drops to ${roofMin} mm at the nose`);

  // Layout checks: every limit in layoutLimits() is also reported here.
  const lim = (key: BedroomLayoutKey) => layoutLimits(p, key);
  if (p.bootHeight < lim("bootHeight").min) errors.push(`tunnel boot ${p.bootHeight} is lower than ${R.BOOT_HEIGHT_MIN_MM.value} mm`);
  if (p.wardrobeWidth < lim("wardrobeWidth").min) errors.push(`wardrobe ${p.wardrobeWidth} is narrower than ${R.WARDROBE_WIDTH_MIN_MM.value} mm`);
  if (openingW < bedW - EPS) errors.push(`the wardrobes leave only ${round1(openingW)} mm between them — the ${BED_FRAMES[p.bedFrame].label.toLowerCase()} bed frame needs ${bedW}`);
  if (openingH < R.OPENING_HEIGHT_MIN_MM.value) errors.push(`only ${round1(openingH)} mm between the boot deck and the overhead (min ${R.OPENING_HEIGHT_MIN_MM.value})`);
  if (ohcH < R.OHC_HEIGHT_MIN_MM.value) errors.push(`overhead is only ${round1(ohcH)} mm high at the room face (min ${R.OHC_HEIGHT_MIN_MM.value})`);
  for (const bay of p.ohcZones) {
    if (bay.width < R.OHC_ZONE_MIN_MM.value - EPS) errors.push(`overhead bay ${bay.width} is narrower than ${R.OHC_ZONE_MIN_MM.value} mm`);
  }
  if (p.style === "style1") {
    const splitLim = lim("fixedPanelTop");
    if (p.fixedPanelTop < splitLim.min) errors.push(`the fixed panel top ${p.fixedPanelTop} leaves only ${round1(p.fixedPanelTop - wardrobeFloorTop(p))} mm of panel above the wardrobe floor (min ${R.WARDROBE_FIXED_PANEL_MIN_MM.value})`);
    if (p.fixedPanelTop > splitLim.max) errors.push(`the fixed panel top ${p.fixedPanelTop} leaves only ${round1(t3TopOf(p) - R.WARDROBE_DOOR_CLEARANCE_MM.value - p.fixedPanelTop)} mm of door under T3 (min ${R.WARDROBE_DOOR_MIN_MM.value})`);
  }
  if (p.style === "nook") {
    const bottom = nookWardrobeBottom(p);
    const door = round1(t3TopOf(p) - bottom);
    if (door < R.WARDROBE_DOOR_MIN_MM.value) errors.push(`the nook wardrobe bottom ${bottom} leaves only ${door} mm of door under T3 (min ${R.WARDROBE_DOOR_MIN_MM.value})`);
  }
  const zones: BedroomZone[] = [];
  if (!errors.length) {
    const region = (id: BedroomZoneId, kind: "solid" | "void", x0: number, x1: number, z0: number, zTop: number, roofTop: boolean): void => {
      const outline = sectionYZ(profile, D, H, z0, zTop);
      if (!outline) { errors.push(`${ZONE_LABEL[id]} has no room under the roof`); return; }
      zones.push({ id, label: ZONE_LABEL[id], kind, x0: round1(x0), x1: round1(x1), y0: 0, y1: sectionDepth(outline), z0: round1(z0), z1: round1(roofTop ? H : zTop), roofTop, outlineYZ: outline });
    };
    region("boot", "solid", 0, W, 0, bootTop, false);
    region("wardrobeL", "solid", 0, wardLx1, bootTop, H, true);
    region("wardrobeR", "solid", wardRx0, W, bootTop, H, true);
    region("opening", "void", wardLx1, wardRx0, bootTop, ohcBot, false);
    region("ohc", "solid", wardLx1, wardRx0, ohcBot, H, true);
    const ohcZone = zones.find((z) => z.id === "ohc");
    if (ohcZone && ohcZone.y1 < 100) warnings.push(`overhead is only ${round1(ohcZone.y1)} mm deep before the roof cuts it off`);
  }

  // --- tunnel boot boards -------------------------------------------------------------
  const boards: Board[] = [];
  const joints: Joint[] = [];
  const bootZone = zones.find((z) => z.id === "boot");
  if (!errors.length && bootZone && roofMin < p.bootHeight - EPS) errors.push(`the roof comes down to ${roofMin} mm at the nose, below the boot deck (${p.bootHeight}) — the deck cannot run to the nose`);
  if (!errors.length && bootZone) {
    const CPT = P_cpt(p.panelThickness);
    const deckT = R.BOOT_DECK_THICKNESS_MM;
    // Deck: the top of the boot region, wall to wall, full depth.
    const deck = boardRect("BOOT_DECK", "Boot deck", "boot_deck", "XY", "Z", deckT.value, {
      x0: dim("BOOT_DECK.x0", {}, () => 0, { formula: "0" }),
      x1: dim("BOOT_DECK.x1", { W: P.W }, (t) => t.W),
      y0: dim("BOOT_DECK.y0", {}, () => 0, { formula: "0" }),
      y1: dim("BOOT_DECK.y1", { D: P.D }, (t) => t.D),
      z1: same("BOOT_DECK.z1", "boot.z1"),
      z0: dim("BOOT_DECK.z0", { top: ref("BOOT_DECK.z1"), DECK: deckT }, (t) => t.top - t.DECK),
    });
    // Uprights: carcass stock, floor → deck underside, wall to wall. The room-face one has its
    // outer face on the room face; the nose one has its outer face at the depth.
    const back = boardRect("BOOT_BACK", "Boot upright · room face", "boot_upright", "XZ", "Y", CPT.value, {
      x0: dim("BOOT_BACK.x0", {}, () => 0, { formula: "0" }),
      x1: dim("BOOT_BACK.x1", { W: P.W }, (t) => t.W),
      y0: dim("BOOT_BACK.y0", {}, () => 0, { formula: "0" }),
      y1: dim("BOOT_BACK.y1", { CPT }, (t) => t.CPT),
      z0: dim("BOOT_BACK.z0", {}, () => 0, { formula: "0" }),
      z1: same("BOOT_BACK.z1", "BOOT_DECK.z0"),
    });
    const front = boardRect("BOOT_FRONT", "Boot upright · nose", "boot_upright", "XZ", "Y", CPT.value, {
      x0: dim("BOOT_FRONT.x0", {}, () => 0, { formula: "0" }),
      x1: dim("BOOT_FRONT.x1", { W: P.W }, (t) => t.W),
      y1: dim("BOOT_FRONT.y1", { D: P.D }, (t) => t.D),
      y0: dim("BOOT_FRONT.y0", { D: ref("BOOT_FRONT.y1"), CPT }, (t) => t.D - t.CPT),
      z0: dim("BOOT_FRONT.z0", {}, () => 0, { formula: "0" }),
      z1: same("BOOT_FRONT.z1", "BOOT_DECK.z0"),
    });
    for (const b of [deck, back, front]) { b.zoneId = "boot"; b.role = b.category; boards.push(b); }
    bootZone.boards = boards.map((b) => b.id);

    // Faces: the deck's top is the surface the wardrobes and mattress sit on; the room-face
    // upright shows into the room; the nose upright faces the boot cavity / the nose.
    attachFaces(boards);
    for (const b of boards) b.stock = { kind: "carcass", thickness: b.materialThickness, colour: p.carcassColor };
    annotate(deck, "A", { semantic: "top", visible: true, finish: { colour: p.carcassColor } });
    annotate(deck, "B", { semantic: "inside", visible: false });
    annotate(back, "B", { semantic: "front", visible: true, finish: { colour: p.carcassColor } }); // −Y: toward the room
    annotate(back, "A", { semantic: "inside", visible: false });
    annotate(front, "A", { semantic: "outside", visible: false }); // +Y: toward the nose
    annotate(front, "B", { semantic: "inside", visible: false });
    // The deck rests on the top edges of both uprights.
    for (const up of [back, front]) {
      joints.push(joint(`${up.id}_deck`, "butt", faceRef(deck.id, ["B"]), faceRef(up.id, boundaryEdgeFaces(up, "+Z")), { hardware: [], rule: "boot_deck_on_uprights_v1" }));
    }
  }

  // --- wardrobe colour panels and the top (T3 · T2 · T1) ------------------------------------
  //
  // One fixed Y distance rules the top: the T2 back (WARDROBE_T2_BACK). The roof height there,
  // less T2's height and a clearance, is T3's top; T3's seat is one T3 below. In front of the
  // T2 back the colour panel is cut down to the seat; behind it the panel runs to the roof, with
  // a pocket (T3 + clearance high, LIP deep) that T3's tail slides into. T1 / T2 stand on T3;
  // T2's top follows the roof at its back, T1 is cut OVERSIZE above the roof and trimmed on site.
  let top: BedroomLayoutInfo["top"] = null;
  const wardL = zones.find((z) => z.id === "wardrobeL");
  const wardR = zones.find((z) => z.id === "wardrobeR");
  if (!errors.length && wardL && wardR) {
    const DPT = param({ DPT: p.doorPanelThickness }).DPT;
    const roofFn = (y: number) => roofAt(profile, H, y);
    const t2Back = dim("top.T2.y1", { T2_BACK: R.WARDROBE_T2_BACK_MM }, (t) => t.T2_BACK);
    const roofAtT2 = dim("top.roofAtT2", { y: ref("top.T2.y1") }, (t) => round1(roofFn(t.y)), { formula: "roof(T2.y1)" });
    const t3Top = dim("top.T3.z1", { roof: ref("top.roofAtT2"), T2H: R.WARDROBE_T2_HEIGHT_MM, CL: R.WARDROBE_T3_CLEARANCE_MM }, (t) => t.roof - t.T2H - t.CL);
    const seat = dim("top.seat", { t3Top: ref("top.T3.z1"), T3: R.WARDROBE_T3_THICKNESS_MM }, (t) => t.t3Top - t.T3);
    const railZ0 = dim("top.rail.z0", { t3Top: ref("top.T3.z1"), CL: R.WARDROBE_T3_CLEARANCE_MM }, (t) => t.t3Top + t.CL);
    const lipY1 = dim("top.lip.y1", { T2_BACK: ref("top.T2.y1"), LIP: R.WARDROBE_T3_LIP_DEPTH_MM }, (t) => t.T2_BACK + t.LIP);
    dim("top.T3.tail.y1", { lip: ref("top.lip.y1"), CL: R.WARDROBE_T3_TAIL_CLEARANCE_MM }, (t) => t.lip - t.CL);
    const t3Depth = dim("top.T3.y1", { T3D: R.WARDROBE_T3_DEPTH_MM }, (t) => t.T3D);
    const stripY = dim("wallStrip.y1", { D: P.D, STRIP: R.WARDROBE_WALL_STRIP_DEPTH_MM }, (t) => Math.min(t.D, t.STRIP));
    dim("top.T2.y0", { y1: ref("top.T2.y1"), T2T: R.WARDROBE_T2_THICKNESS_MM }, (t) => t.y1 - t.T2T);
    const t1Y0 = dim("top.T1.y0", { y1: ref("top.T2.y0"), T1T: R.WARDROBE_T1_THICKNESS_MM }, (t) => t.y1 - t.T1T);
    dim("top.roofAtT1", { y: ref("top.T2.y0") }, (t) => round1(roofFn(t.y)), { formula: "roof(T1.y1)" });
    dim("top.T1.z1", { roof: ref("top.roofAtT1"), OVER: R.WARDROBE_T1_OVERSIZE_MM }, (t) => t.roof + t.OVER);
    const roofAtLip = round1(roofFn(lipY1));
    top = { seat: round1(seat), t3Top: round1(t3Top), roofAtT2: round1(roofAtT2), t2Height: round1(roofAtT2 - railZ0) };

    if (seat - p.bootHeight < R.WARDROBE_PANEL_MIN_HEIGHT_MM.value) errors.push(`the roof at the T2 back (${round1(roofAtT2)}) leaves only ${round1(seat - p.bootHeight)} mm of colour panel above the boot deck (min ${R.WARDROBE_PANEL_MIN_HEIGHT_MM.value})`);
    if (roofAtLip <= railZ0 + EPS) errors.push(`the roof comes down to ${roofAtLip} mm at the T3 pocket end — no room for the panel above the pocket`);
    if (t3Depth > D - EPS) errors.push(`T3 depth ${round1(t3Depth)} is more than the body depth ${D}`);
    if (stripY <= lipY1 + EPS) errors.push(`the wall strip depth ${round1(stripY)} does not reach past the T3 pocket`);
    if (round1(roofFn(stripY)) <= p.bootHeight + EPS) errors.push(`the roof comes down to ${round1(roofFn(stripY))} mm at the wall strip's back, below the boot deck`);
    if (t1Y0 < EPS) errors.push("the top rails do not fit in front of the T2 back");
    if (!errors.length) warnings.push(`T1 is cut ${R.WARDROBE_T1_OVERSIZE_MM.value} mm above the roof by design — trim to the roof on site`);

    const nookOn = p.style === "nook";
    // Wardrobe floor top for both styles. Nook's wardrobe bottom is a fixed 204 above it, and the
    // colour panel is cut through between the two.
    dim("front.floor.z1", { boot: ref("boot.z1"), RAISE: R.WARDROBE_FLOOR_RAISE_MM }, (t) => t.boot + t.RAISE);
    if (nookOn) {
      dim("nook.z0", { floor: ref("front.floor.z1") }, (t) => t.floor, { formula: "= front.floor.z1" });
      dim("nook.z1", { floor: ref("front.floor.z1"), H: R.WARDROBE_NOOK_CUT_HEIGHT_MM }, (t) => t.floor + t.H);
      const reach = nookCutReach();
      dim("nook.cut.floorY", { reach }, (t) => t.reach, { formula: "lower arc meets the cut bottom" });
      if (reach > D - EPS) errors.push(`the nook cut reaches ${reach} mm back and the body is only ${D} deep`);
    }

    if (!errors.length) {
    /** Colour panel section (cabinet y, z), counter-clockwise: deck → nose → roof back to the T2 back → pocket → seat → room face. */
    const panelOutline = (id: string): ProfilePoint[] => {
      const o = new Outline(`${id}.pv`, ["y", "z"]);
      const bootZ = ref("boot.z1");
      o.add(lit(0), ex({ bootZ }, (t) => t.bootZ));
      o.add(ex({ D: P.D }, (t) => t.D), ex({ bootZ }, (t) => t.bootZ));
      // Roof from the nose back to the T2 back: the profile's own break points, then the T2 back itself.
      const breaks = profile.map((q) => q[0]).filter((y) => y > t2Back + EPS && y < D - EPS).sort((a, b) => b - a);
      o.add(ex({ D: P.D }, (t) => t.D), ex({ D: P.D }, (t) => round1(roofFn(t.D)), "roof(D)"));
      for (const y of breaks) o.add(lit(round1(y)), ex({ y }, (t) => round1(roofFn(t.y)), `roof(${round1(y)})`));
      o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ roof: ref("top.roofAtT2") }, (t) => t.roof));
      // Down the T2 back to the pocket, the pocket toward the nose, down to the seat, back to the room face.
      o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
      o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
      o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.seat") }, (t) => t.z));
      o.add(lit(0), ex({ z: ref("top.seat") }, (t) => t.z));
      // Nook: a through U taken out of the room edge, floor top → wardrobe bottom.
      if (nookOn) {
        o.add(lit(0), ex({ z: ref("nook.z1") }, (t) => t.z));
        for (const pt of nookCutPath(ref("nook.z0").value, ref("nook.z1").value)) o.add(lit(pt.y), lit(pt.z));
        o.add(lit(0), ex({ z: ref("nook.z0") }, (t) => t.z));
      }
      return o.points.map(([py, pz]) => ({ y: round1(py), z: round1(pz) }));
    };
    const panelBox = (id: string, side: "L" | "R") => {
      const outline = panelOutline(id);
      const zTop = Math.max(...outline.map((q) => q.z));
      const x0 = side === "L"
        ? dim(`${id}.x0`, { ww: ref("wardrobeL.x1"), DPT }, (t) => t.ww - t.DPT)
        : same(`${id}.x0`, "wardrobeR.x0");
      const x1 = side === "L"
        ? same(`${id}.x1`, "wardrobeL.x1")
        : dim(`${id}.x1`, { x0: ref(`${id}.x0`), DPT }, (t) => t.x0 + t.DPT);
      const b = boardRect(id, `Wardrobe colour panel · ${side === "L" ? "left" : "right"}`, "colour_panel", "YZ", "X", DPT.value, {
        x0, x1,
        y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
        y1: dim(`${id}.y1`, { D: P.D }, (t) => t.D),
        z0: same(`${id}.z0`, "boot.z1"),
        z1: dim(`${id}.z1`, { H: P.H }, () => zTop, { formula: "max(roof over the panel)" }),
      });
      b.profileVector = outline;
      return b;
    };
    const panelL = panelBox("WARD_L_PANEL", "L");
    const panelR = panelBox("WARD_R_PANEL", "R");

    // Style 1 shelf: 10 above the wardrobe floor. Its tongue and the strip notch are sized here
    // so the strip outline can be cut before the shelf board is emitted.
    const CPT = param({ CPT: p.panelThickness }).CPT;
    const shelfOn = p.style === "style1";
    if (nookOn) {
      // Base (kick + floor, one thickness) and the shelf over the nook; the wall strip stands on the shelf.
      // Each runs toward the nose until its own rule (full depth / 22 short) or until the roof meets its top,
      // whichever comes first. A sloping nose must not refuse the whole body.
      dim("base.z0", { floor: ref("front.floor.z1"), BASE: R.WARDROBE_BASE_THICKNESS_MM }, (t) => t.floor - t.BASE);
      dim("nook.base.y1", { D: P.D, z: ref("front.floor.z1") }, (t) => yWhereRoofMeets(roofFn, t.D, t.z), { formula: "min(D, y where roof = floor top)" });
      same("nook.shelf.z0", "nook.z1");
      dim("nook.shelf.z1", { z0: ref("nook.shelf.z0"), CPT }, (t) => t.z0 + t.CPT);
      dim("nook.shelf.y1", { D: P.D, GAP: R.WARDROBE_NOOK_SHELF_NOSE_GAP_MM, z: ref("nook.shelf.z1") }, (t) => yWhereRoofMeets(roofFn, t.D - t.GAP, t.z), { formula: "min(D - GAP, y where roof = shelf top)" });
      if (ref("nook.base.y1").value < 50) errors.push(`the roof comes down to ${round1(roofFn(0))} mm at the room face, below the wardrobe floor (${round1(ref("front.floor.z1").value)})`);
      if (ref("nook.shelf.y1").value < 50) errors.push(`the roof comes down to ${round1(roofFn(0))} mm at the room face — the nook shelf (${round1(ref("nook.shelf.z1").value)}) does not fit under it`);
      else if (ref("nook.shelf.y1").value < D - R.WARDROBE_NOOK_SHELF_NOSE_GAP_MM.value - 0.5) warnings.push(`the nook shelf stops at ${round1(ref("nook.shelf.y1").value)} where the roof meets it, ${round1(D - R.WARDROBE_NOOK_SHELF_NOSE_GAP_MM.value - ref("nook.shelf.y1").value)} mm short of the ${R.WARDROBE_NOOK_SHELF_NOSE_GAP_MM.value} mm nose gap`);
    }
    const stripZ0Key = nookOn ? "nook.shelf.z1" : "boot.z1";
    if (shelfOn) {
      dim("shelf.z0", { floor: ref("front.floor.z1"), ABOVE: R.WARDROBE_SHELF_ABOVE_FLOOR_MM }, (t) => t.floor + t.ABOVE);
      dim("shelf.z1", { z0: ref("shelf.z0"), CPT }, (t) => t.z0 + t.CPT);
      dim("shelf.notch.z0", { z0: ref("shelf.z0"), CL: R.WARDROBE_SHELF_GROOVE_Z_MM }, (t) => t.z0 - t.CL);
      dim("shelf.notch.z1", { z1: ref("shelf.z1"), CL: R.WARDROBE_SHELF_GROOVE_Z_MM }, (t) => t.z1 + t.CL);
      dim("shelf.notch.y0", { SETBACK: R.WARDROBE_SHELF_STRIP_SETBACK_MM }, (t) => t.SETBACK);
      dim("shelf.groove.y0", { D: P.D }, (t) => t.D / 3);
      dim("shelf.groove.y1", { D: P.D }, (t) => (2 * t.D) / 3);
      dim("shelf.tongue.y0", { y0: ref("shelf.groove.y0"), END: R.WARDROBE_SHELF_GROOVE_END_MM }, (t) => t.y0 + t.END);
      dim("shelf.tongue.y1", { y1: ref("shelf.groove.y1"), END: R.WARDROBE_SHELF_GROOVE_END_MM }, (t) => t.y1 - t.END);
      dim("shelf.tongue.depth", { DPT, TIP: R.WARDROBE_SHELF_TONGUE_TIP_MM }, (t) => t.DPT / 2 - t.TIP);
      dim("shelf.groove.depth", { tongue: ref("shelf.tongue.depth"), EXTRA: R.WARDROBE_SHELF_GROOVE_EXTRA_MM }, (t) => t.tongue + t.EXTRA);
    }
    const shelfNotch = shelfOn && R.WARDROBE_SHELF_STRIP_SETBACK_MM.value < stripY - EPS;

    // Wall strip: the colour panel's front profile, carcass, against the side wall, only STRIP deep, down to the
    // boot deck (Style 1) or standing on the nook shelf (nook).
    // Style 1 cuts a through notch in the back of the strip so the shelf can pass to the wall.
    const stripOutline = (id: string): ProfilePoint[] => {
      const o = new Outline(`${id}.pv`, ["y", "z"]);
      const bootZ = ref(stripZ0Key);
      const yBack = () => ex({ y: ref("wallStrip.y1") }, (t) => t.y);
      o.add(lit(0), ex({ bootZ }, (t) => t.bootZ));
      o.add(yBack(), ex({ bootZ }, (t) => t.bootZ));
      if (shelfNotch) {
        o.add(yBack(), ex({ z: ref("shelf.notch.z0") }, (t) => t.z));
        o.add(ex({ y: ref("shelf.notch.y0") }, (t) => t.y), ex({ z: ref("shelf.notch.z0") }, (t) => t.z));
        o.add(ex({ y: ref("shelf.notch.y0") }, (t) => t.y), ex({ z: ref("shelf.notch.z1") }, (t) => t.z));
        o.add(yBack(), ex({ z: ref("shelf.notch.z1") }, (t) => t.z));
      }
      const breaks = profile.map((q) => q[0]).filter((y) => y > t2Back + EPS && y < stripY - EPS).sort((a, b) => b - a);
      o.add(yBack(), ex({ y: ref("wallStrip.y1") }, (t) => round1(roofFn(t.y)), "roof(wallStrip.y1)"));
      for (const y of breaks) o.add(lit(round1(y)), ex({ y }, (t) => round1(roofFn(t.y)), `roof(${round1(y)})`));
      o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ roof: ref("top.roofAtT2") }, (t) => t.roof));
      o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
      o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
      o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.seat") }, (t) => t.z));
      o.add(lit(0), ex({ z: ref("top.seat") }, (t) => t.z));
      return o.points.map(([py, pz]) => ({ y: round1(py), z: round1(pz) }));
    };
    const stripBox = (id: string, side: "L" | "R") => {
      const outline = stripOutline(id);
      const zTop = Math.max(...outline.map((q) => q.z));
      const x0 = side === "L"
        ? dim(`${id}.x0`, {}, () => 0, { formula: "0" })
        : dim(`${id}.x0`, { W: P.W, CPT }, (t) => t.W - t.CPT);
      const x1 = side === "L"
        ? dim(`${id}.x1`, { CPT }, (t) => t.CPT)
        : dim(`${id}.x1`, { W: P.W }, (t) => t.W);
      const b = boardRect(id, `Wardrobe wall strip · ${side === "L" ? "left" : "right"}`, "side_panel", "YZ", "X", p.panelThickness, {
        x0, x1,
        y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
        y1: same(`${id}.y1`, "wallStrip.y1"),
        z0: same(`${id}.z0`, stripZ0Key),
        z1: dim(`${id}.z1`, { H: P.H }, () => zTop, { formula: "max(roof over the strip)" }),
      });
      b.profileVector = outline;
      return b;
    };
    const stripL = stripBox("WARD_L_STRIP", "L");
    const stripR = stripBox("WARD_R_STRIP", "R");
    if (shelfNotch) {
      stripL.notes = ["through notch y 75 → back, the Style 1 shelf passes to the wall"];
      stripR.notes = stripL.notes;
    }

    // Nook base and shelf, one set each side. Kick: wall upright on the deck, full depth. Floor: on the
    // kick, wall → the colour panel's wall-side face, full depth. Shelf: wall → colour panel, 22 short of
    // the nose, its underside the dragged line the door starts on.
    const nookBoards: Board[] = [];
    if (nookOn) {
      const BASE = R.WARDROBE_BASE_THICKNESS_MM;
      const panelFace = (id: string, side: "L" | "R") => side === "L" ? same(`${id}.x1`, "WARD_L_PANEL.x0") : same(`${id}.x0`, "WARD_R_PANEL.x1");
      const wall0 = (id: string) => dim(`${id}.x0`, {}, () => 0, { formula: "0" });
      const wall1 = (id: string) => dim(`${id}.x1`, { W: P.W }, (t) => t.W);
      for (const side of ["L", "R"] as const) {
        const name = side === "L" ? "left" : "right";
        const kickId = `WARD_${side}_KICK`;
        const kick = boardRect(kickId, `Wardrobe kick · ${name}`, "kick", "YZ", "X", BASE.value, {
          x0: side === "L" ? wall0(kickId) : dim(`${kickId}.x0`, { W: P.W, BASE }, (t) => t.W - t.BASE),
          x1: side === "L" ? dim(`${kickId}.x1`, { BASE }, (t) => t.BASE) : wall1(kickId),
          y0: dim(`${kickId}.y0`, {}, () => 0, { formula: "0" }),
          y1: same(`${kickId}.y1`, "nook.base.y1"),
          z0: same(`${kickId}.z0`, "boot.z1"),
          z1: same(`${kickId}.z1`, "base.z0"),
        });
        const floorId = `WARD_${side}_FLOOR`;
        const floor = boardRect(floorId, `Wardrobe floor · ${name}`, "floor", "XY", "Z", BASE.value, {
          x0: side === "L" ? wall0(floorId) : panelFace(floorId, side),
          x1: side === "L" ? panelFace(floorId, side) : wall1(floorId),
          y0: dim(`${floorId}.y0`, {}, () => 0, { formula: "0" }),
          y1: same(`${floorId}.y1`, "nook.base.y1"),
          z0: same(`${floorId}.z0`, "base.z0"),
          z1: same(`${floorId}.z1`, "front.floor.z1"),
        });
        const nookId = `WARD_${side}_NOOK`;
        const shelf = boardRect(nookId, `Nook shelf · ${name}`, "shelf", "XY", "Z", p.panelThickness, {
          x0: side === "L" ? wall0(nookId) : panelFace(nookId, side),
          x1: side === "L" ? panelFace(nookId, side) : wall1(nookId),
          y0: dim(`${nookId}.y0`, {}, () => 0, { formula: "0" }),
          y1: same(`${nookId}.y1`, "nook.shelf.y1"),
          z0: same(`${nookId}.z0`, "nook.shelf.z0"),
          z1: same(`${nookId}.z1`, "nook.shelf.z1"),
        });
        nookBoards.push(kick, floor, shelf);
      }
    }

    // Style 1 shelf, one each side. Plan (left): clear of the strip for the front setback,
    // then to the wall; a tongue into the colour panel over the middle third of the depth.
    const shelfBoards: Board[] = [];
    if (shelfOn) {
      const shelfOutline = (id: string, side: "L" | "R"): ProfilePoint[] => {
        const o = new Outline(`${id}.pv`, ["x", "y"]);
        const ySet = () => ex({ y: ref("shelf.notch.y0") }, (t) => t.y);
        const y0t = () => ex({ y: ref("shelf.tongue.y0") }, (t) => t.y);
        const y1t = () => ex({ y: ref("shelf.tongue.y1") }, (t) => t.y);
        const yD = () => ex({ D: P.D }, (t) => t.D);
        const face = () => side === "L"
          ? ex({ x: ref("WARD_L_PANEL.x0") }, (t) => t.x)
          : ex({ x: ref("WARD_R_PANEL.x1") }, (t) => t.x);
        const tip = () => side === "L"
          ? ex({ x: ref("WARD_L_PANEL.x0"), tongue: ref("shelf.tongue.depth") }, (t) => t.x + t.tongue)
          : ex({ x: ref("WARD_R_PANEL.x1"), tongue: ref("shelf.tongue.depth") }, (t) => t.x - t.tongue);
        const inset = () => side === "L"
          ? ex({ CPT, GAP: R.WARDROBE_SHELF_STRIP_GAP_MM }, (t) => t.CPT + t.GAP)
          : ex({ W: P.W, CPT, GAP: R.WARDROBE_SHELF_STRIP_GAP_MM }, (t) => t.W - t.CPT - t.GAP);
        const wall = () => side === "L" ? lit(0) : ex({ W: P.W }, (t) => t.W);
        if (side === "L") {
          o.add(inset(), lit(0)).add(face(), lit(0)).add(face(), y0t()).add(tip(), y0t()).add(tip(), y1t()).add(face(), y1t());
          o.add(face(), yD()).add(wall(), yD()).add(wall(), ySet()).add(inset(), ySet());
        } else {
          o.add(inset(), lit(0)).add(inset(), ySet()).add(wall(), ySet()).add(wall(), yD()).add(face(), yD());
          o.add(face(), y1t()).add(tip(), y1t()).add(tip(), y0t()).add(face(), y0t()).add(face(), lit(0));
        }
        return o.points.map(([px, py]) => ({ x: round1(px), y: round1(py) }));
      };
      const shelfBox = (id: string, side: "L" | "R") => {
        const outline = shelfOutline(id, side);
        const x0 = side === "L"
          ? dim(`${id}.x0`, {}, () => 0, { formula: "0" })
          : dim(`${id}.x0`, { x: ref("WARD_R_PANEL.x1"), tongue: ref("shelf.tongue.depth") }, (t) => t.x - t.tongue);
        const x1 = side === "L"
          ? dim(`${id}.x1`, { x: ref("WARD_L_PANEL.x0"), tongue: ref("shelf.tongue.depth") }, (t) => t.x + t.tongue)
          : dim(`${id}.x1`, { W: P.W }, (t) => t.W);
        const b = boardRect(id, `Wardrobe shelf · ${side === "L" ? "left" : "right"}`, "shelf", "XY", "Z", p.panelThickness, {
          x0, x1,
          y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
          y1: dim(`${id}.y1`, { D: P.D }, (t) => t.D),
          z0: same(`${id}.z0`, "shelf.z0"),
          z1: same(`${id}.z1`, "shelf.z1"),
        });
        b.profileVector = outline;
        return b;
      };
      shelfBoards.push(shelfBox("WARD_L_SHELF", "L"), shelfBox("WARD_R_SHELF", "R"));
    }

    /** T3 over one wardrobe: wall → colour panel inner face for its tail, notched back to the panel's wall side beyond it. */
    const t3Box = (id: string, side: "L" | "R") => {
      const b = boardRect(id, `T3 · ${side === "L" ? "left" : "right"} wardrobe`, "top_panel", "XY", "Z", R.WARDROBE_T3_THICKNESS_MM.value, {
        x0: side === "L" ? dim(`${id}.x0`, {}, () => 0, { formula: "0" }) : same(`${id}.x0`, "wardrobeR.x0"),
        x1: side === "L" ? same(`${id}.x1`, "wardrobeL.x1") : dim(`${id}.x1`, { W: P.W }, (t) => t.W),
        y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
        y1: same(`${id}.y1`, "top.T3.y1"),
        z0: same(`${id}.z0`, "top.seat"),
        z1: same(`${id}.z1`, "top.T3.z1"),
      });
      // Outline in cabinet (x, y), counter-clockwise. The notch is on the colour-panel side.
      const o = new Outline(`${id}.pv`, ["x", "y"]);
      const X0 = ex({ x: ref(`${id}.x0`) }, (t) => t.x);
      const X1 = ex({ x: ref(`${id}.x1`) }, (t) => t.x);
      const XN = side === "L" ? ex({ x: ref(`WARD_L_PANEL.x0`) }, (t) => t.x) : ex({ x: ref(`WARD_R_PANEL.x1`) }, (t) => t.x); // the panel's wall-side face
      const Y0 = lit(0);
      const YT = ex({ y: ref("top.T3.tail.y1") }, (t) => t.y);
      const Y1 = ex({ y: ref("top.T3.y1") }, (t) => t.y);
      if (side === "L") o.add(X0, Y0).add(X1, Y0).add(X1, YT).add(XN, YT).add(XN, Y1).add(X0, Y1);
      else o.add(X0, Y0).add(X1, Y0).add(X1, Y1).add(XN, Y1).add(XN, YT).add(X0, YT);
      b.profileVector = o.points.map(([px, py]) => ({ x: round1(px), y: round1(py) }));
      return b;
    };
    const t3L = t3Box("WARD_L_T3", "L");
    const t3R = t3Box("WARD_R_T3", "R");

    // T2 / T1: wall to wall, standing on the T3s with the clearance.
    const T2 = boardRect("T2", "Top rail · rear (T2)", "top_rail", "XZ", "Y", R.WARDROBE_T2_THICKNESS_MM.value, {
      x0: dim("T2.x0", {}, () => 0, { formula: "0" }),
      x1: dim("T2.x1", { W: P.W }, (t) => t.W),
      y0: same("T2.y0", "top.T2.y0"),
      y1: same("T2.y1", "top.T2.y1"),
      z0: same("T2.z0", "top.rail.z0"),
      z1: same("T2.z1", "top.roofAtT2"),
    });
    T2.notes = ["top follows the roof: bevel from the height at the back to the roof at the front"];
    const T1 = boardRect("T1", "Top rail · front (T1)", "top_rail", "XZ", "Y", R.WARDROBE_T1_THICKNESS_MM.value, {
      x0: dim("T1.x0", {}, () => 0, { formula: "0" }),
      x1: dim("T1.x1", { W: P.W }, (t) => t.W),
      y0: same("T1.y0", "top.T1.y0"),
      y1: same("T1.y1", "top.T2.y0"),
      z0: same("T1.z0", "top.rail.z0"),
      z1: same("T1.z1", "top.T1.z1"),
    });
    T1.notes = [`cut ${R.WARDROBE_T1_OVERSIZE_MM.value} above the roof — flat top, trim to the roof slope on site`];

    // Fronts hang at y −DPT..0 (the room-face elevation is y = 0; the door is in front of it).
    // Style 1 — fixed panel: wall → colour-panel opening face, wardrobe floor → the dragged split;
    //           door: wall + clearance → colour-panel opening face, split + clearance → T3 top.
    // Nook    — door only, from the nook shelf underside (the dragged line) → T3 top; the nook below stays open.
    // Three hinge cups on the inside of every door.
    const frontBoards: Board[] = [];
    {
      const CL = R.WARDROBE_DOOR_CLEARANCE_MM;
      if (shelfOn) {
        dim("front.split.z1", { fixedPanelTop: P.fixedPanelTop }, (t) => t.fixedPanelTop);
        dim("front.door.z0", { split: ref("front.split.z1"), CL }, (t) => t.split + t.CL);
      } else {
        same("front.door.z0", "nook.shelf.z0");
      }
      same("front.door.z1", "top.T3.z1");
      dim("front.y0", { DPT }, (t) => -t.DPT);
      dim("front.y1", {}, () => 0, { formula: "0" });
      const frontBox = (id: string, name: string, category: string, side: "L" | "R", kind: "door" | "fixed") => {
        const gap = kind === "door";
        const x0 = side === "L"
          ? (gap ? dim(`${id}.x0`, { CL }, (t) => t.CL) : dim(`${id}.x0`, {}, () => 0, { formula: "0" }))
          : same(`${id}.x0`, "wardrobeR.x0");
        const x1 = side === "L"
          ? same(`${id}.x1`, "wardrobeL.x1")
          : (gap
            ? dim(`${id}.x1`, { W: P.W, CL }, (t) => t.W - t.CL)
            : dim(`${id}.x1`, { W: P.W }, (t) => t.W));
        return boardRect(id, name, category, "XZ", "Y", DPT.value, {
          x0, x1, y0: same(`${id}.y0`, "front.y0"), y1: same(`${id}.y1`, "front.y1"),
          z0: same(`${id}.z0`, kind === "door" ? "front.door.z0" : "front.floor.z1"),
          z1: same(`${id}.z1`, kind === "door" ? "front.door.z1" : "front.split.z1"),
        });
      };
      if (shelfOn) {
        frontBoards.push(
          frontBox("WARD_L_FIXED", "Wardrobe fixed panel · left", "front_panel", "L", "fixed"),
          frontBox("WARD_R_FIXED", "Wardrobe fixed panel · right", "front_panel", "R", "fixed"),
        );
      }
      frontBoards.push(
        frontBox("WARD_L_DOOR", "Wardrobe door · left", "front_panel", "L", "door"),
        frontBox("WARD_R_DOOR", "Wardrobe door · right", "front_panel", "R", "door"),
      );
    }

    const wardBoards: Board[] = [stripL, stripR, panelL, panelR, ...shelfBoards, ...nookBoards, t3L, t3R, T2, T1, ...frontBoards];
    for (const b of wardBoards) b.role = b.category;
    stripL.zoneId = "wardrobeL"; panelL.zoneId = "wardrobeL"; t3L.zoneId = "wardrobeL";
    stripR.zoneId = "wardrobeR"; panelR.zoneId = "wardrobeR"; t3R.zoneId = "wardrobeR";
    for (const b of [...shelfBoards, ...nookBoards, ...frontBoards]) b.zoneId = b.id.includes("_L_") ? "wardrobeL" : "wardrobeR";
    T2.zoneId = "top"; T1.zoneId = "top";
    const inZone = (list: Board[], side: "L" | "R") => list.filter((b) => b.zoneId === (side === "L" ? "wardrobeL" : "wardrobeR")).map((b) => b.id);
    wardL.boards = ["WARD_L_STRIP", "WARD_L_PANEL", ...inZone(shelfBoards, "L"), ...inZone(nookBoards, "L"), "WARD_L_T3", ...inZone(frontBoards, "L")];
    wardR.boards = ["WARD_R_STRIP", "WARD_R_PANEL", ...inZone(shelfBoards, "R"), ...inZone(nookBoards, "R"), "WARD_R_T3", ...inZone(frontBoards, "R")];
    attachFaces(wardBoards);
    if (shelfOn) {
      const grooveY0 = ref("shelf.groove.y0").value;
      const grooveY1 = ref("shelf.groove.y1").value;
      const notchZ0 = ref("shelf.notch.z0").value;
      const notchZ1 = ref("shelf.notch.z1").value;
      const grooveDepth = ref("shelf.groove.depth").value;
      for (const [panel, faceId, shelfId] of [[panelL, "B", "WARD_L_SHELF"], [panelR, "A", "WARD_R_SHELF"]] as Array<[Board, "A" | "B", string]>) {
        const r = localRect(panel, { y: [grooveY0, grooveY1], z: [notchZ0, notchZ1] });
        addFeature(panel, faceId, {
          id: "GR_SHELF",
          kind: "groove",
          ...r,
          depth: round1(grooveDepth),
          through: false,
          for: shelfId,
          key: `${panel.id}.feat.SHELF`,
          source: "bedroom.wardrobeShelf",
        });
      }
    }
    for (const b of [panelL, panelR]) b.stock = { kind: "door", thickness: b.materialThickness, colour: p.doorColor };
    for (const b of [stripL, stripR, ...shelfBoards, ...nookBoards, t3L, t3R, T2, T1]) b.stock = { kind: "carcass", thickness: b.materialThickness, colour: p.carcassColor };
    for (const b of shelfBoards) annotate(b, "A", { semantic: "top", visible: true, finish: { colour: p.carcassColor } });
    for (const b of nookBoards) {
      b.source = "bedroom.nook";
      if (b.id.endsWith("_KICK")) {
        // The kick's inner face looks into the nook under the floor; the outer face is against the wall.
        annotate(b, b.id.includes("_L_") ? "A" : "B", { semantic: "inside", visible: false });
        annotate(b, b.id.includes("_L_") ? "B" : "A", { semantic: "wall", visible: false });
      } else if (b.id.endsWith("_FLOOR")) {
        annotate(b, "A", { semantic: "top", visible: true, finish: { colour: p.carcassColor } });
        annotate(b, "B", { semantic: "bottom", visible: false });
      } else {
        annotate(b, "A", { semantic: "top", visible: false });
        annotate(b, "B", { semantic: "bottom", visible: true, finish: { colour: p.carcassColor } });
      }
    }
    // The strip's inner face looks into the wardrobe; the outer face is against the wall.
    annotate(stripL, "A", { semantic: "inside", visible: true, finish: { colour: p.carcassColor } });
    annotate(stripL, "B", { semantic: "wall", visible: false });
    annotate(stripR, "B", { semantic: "inside", visible: true, finish: { colour: p.carcassColor } });
    annotate(stripR, "A", { semantic: "wall", visible: false });
    // The colour face looks into the opening: +X on the left panel, −X on the right.
    annotate(panelL, "A", { semantic: "outside", visible: true, finish: { colour: p.doorColor } });
    annotate(panelL, "B", { semantic: "inside", visible: false });
    annotate(panelR, "B", { semantic: "outside", visible: true, finish: { colour: p.doorColor } });
    annotate(panelR, "A", { semantic: "inside", visible: false });
    for (const b of [t3L, t3R]) { annotate(b, "A", { semantic: "top", visible: false }); annotate(b, "B", { semantic: "inside", visible: false }); }
    annotate(T1, "B", { semantic: "front", visible: true, finish: { colour: p.carcassColor } });
    annotate(T1, "A", { semantic: "inside", visible: false });
    annotate(T2, "B", { semantic: "front", visible: false });
    annotate(T2, "A", { semantic: "back", visible: false });
    for (const b of frontBoards) {
      b.stock = { kind: "door", thickness: b.materialThickness, colour: p.doorColor };
      b.source = "bedroom.wardrobeFront";
      // A = +Y = y = 0 (carcass side); B = −Y = the visible room face.
      annotate(b, "A", { semantic: "inside", visible: false });
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: p.doorColor } });
    }
    {
      const fromEnd = R.WARDROBE_HINGE_FROM_END_MM;
      const fromSide = R.WARDROBE_HINGE_FROM_SIDE_MM;
      for (const door of frontBoards.filter((b) => b.id.endsWith("_DOOR"))) {
        const side = door.id.includes("_L_") ? "L" : "R";
        const w = dim(`${door.id}.width`, { x1: ref(`${door.id}.x1`), x0: ref(`${door.id}.x0`) }, (t) => t.x1 - t.x0);
        const h = dim(`${door.id}.height`, { z1: ref(`${door.id}.z1`), z0: ref(`${door.id}.z0`) }, (t) => t.z1 - t.z0);
        const uHinge = side === "L"
          ? dim(`${door.id}.feat.HINGE.u`, { fromSide }, (t) => t.fromSide)
          : dim(`${door.id}.feat.HINGE.u`, { w, fromSide }, (t) => t.w - t.fromSide);
        const vs = [
          dim(`${door.id}.feat.HINGE_0.v`, { fromEnd }, (t) => t.fromEnd),
          dim(`${door.id}.feat.HINGE_1.v`, { h }, (t) => t.h / 2),
          dim(`${door.id}.feat.HINGE_2.v`, { h, fromEnd }, (t) => t.h - t.fromEnd),
        ];
        const faceA = door.faces!.find((f) => f.id === "A")!;
        vs.forEach((v, i) => {
          faceA.features.push({
            id: `${door.id}_HINGE_${i}`,
            kind: "hole",
            center: [round1(uHinge), round1(v)],
            diameter: R.WARDROBE_HINGE_DIAMETER_MM.value,
            depth: R.WARDROBE_HINGE_DEPTH_MM.value,
            through: false,
            for: "hinge",
            key: `${door.id}.feat.HINGE_${i}`,
            source: "bedroom.wardrobeFront",
          });
        });
      }
    }
    // T3 rests on the colour panel's seat and on the wall strip's seat (the same edge, in front of the T2 back).
    for (const [panel, t3, jointId, rails] of [
      [panelL, t3L, "WARD_L_T3_seat", true],
      [panelR, t3R, "WARD_R_T3_seat", true],
      [stripL, t3L, "WARD_L_T3_strip", false],
      [stripR, t3R, "WARD_R_T3_strip", false],
    ] as Array<[Board, Board, string, boolean]>) {
      const seatFaces = edgeFacesIn(panel, { u0: -EPS, u1: lipY1 + EPS, v0: seat - p.bootHeight - EPS, v1: seat - p.bootHeight + EPS });
      for (const f of seatFaces) f.features.push({ id: `${panel.id}_SEAT`, kind: "notch", for: t3.id, key: `${panel.id}.pv`, source: "bedroom.wardrobeTop" });
      joints.push(joint(jointId, "butt", faceRef(t3.id, ["B"]), faceRef(panel.id, seatFaces), { hardware: [], rule: "wardrobe_t3_on_panel_seat_v1" }));
      if (!rails) continue;
      // T1 / T2 stand on T3 (with the clearance): face contact, not a joint that holds anything.
      for (const rail of [T1, T2]) joints.push(joint(`${rail.id}_${t3.id}`, "face_contact", faceRef(t3.id, ["A"]), faceRef(rail.id, boundaryEdgeFaces(rail, "-Z")), { hardware: [], rule: "wardrobe_rail_on_t3_v1" }));
    }
    // Nook: the shelf and the floor butt against the wall and the colour panel; the strip stands on the shelf.
    for (const b of nookBoards) {
      if (b.id.endsWith("_KICK")) continue;
      const side = b.id.includes("_L_") ? "L" : "R";
      const panel = side === "L" ? panelL : panelR;
      joints.push(joint(`${b.id}_panel`, "butt", faceRef(panel.id, [side === "L" ? "B" : "A"]), faceRef(b.id, boundaryEdgeFaces(b, side === "L" ? "+X" : "-X")), { hardware: [], rule: "nook_board_to_panel_v1" }));
      if (b.id.endsWith("_NOOK")) {
        const strip = side === "L" ? stripL : stripR;
        joints.push(joint(`${strip.id}_${b.id}`, "butt", faceRef(b.id, ["A"]), faceRef(strip.id, boundaryEdgeFaces(strip, "-Z")), { hardware: [], rule: "wall_strip_on_nook_shelf_v1" }));
      }
    }
    // LED channels: the three T3 tops (main channel in front of T1, a feed branch near each end) and
    // the nook shelf underside. Off with `ledGroove: false`.
    if (p.ledGroove) {
      const yTail = ref("top.T3.tail.y1").value;
      const yRear = ref("top.T3.y1").value;
      for (const [t3, side] of [[t3L, "L"], [t3R, "R"]] as Array<[Board, "L" | "R"]>) {
        const xn = side === "L" ? panelL.x0 : panelR.x1; // the panel's wall-side face: over the panel T3 only has its tail
        const fullDepth = (x0: number, x1: number) => (side === "L" ? x1 <= xn + EPS : x0 >= xn - EPS);
        const overPanel = (x0: number, x1: number) => (side === "L" ? x0 >= xn - EPS : x1 <= xn + EPS);
        addT3LedChannels(t3, {
          t1FrontKey: "top.T1.y0",
          rearAt: (x0, x1) => (fullDepth(x0, x1) ? yRear : overPanel(x0, x1) ? yTail : null),
          source: "bedroom.led",
        }, warnings);
      }
      for (const b of nookBoards) if (b.id.endsWith("_NOOK")) addNookShelfLed(b, "bedroom.led", warnings);
    }
    boards.push(...wardBoards);
    }
  }

  // Middle overhead. T1 / T2 are the shared rails already emitted; this cabinet has no T4.
  let ohcInfo: BedroomLayoutInfo["ohc"] = null;
  if (!errors.length && top) {
    const ohc = buildBedroomOhc({
      ...p,
      roofAt: (y) => roofAt(profile, H, y),
      seat: top.seat,
      t3Top: top.t3Top,
      led: p.ledGroove ? { t1FrontKey: "top.T1.y0" } : null,
    });
    boards.push(...ohc.boards);
    joints.push(...ohc.joints);
    warnings.push(...ohc.warnings);
    ohcInfo = ohc.info;
    const ohcZone = zones.find((z) => z.id === "ohc");
    if (ohcZone) ohcZone.boards = ohc.boards.map((b) => b.id);
  }

  const provenance = endProvenance();
  const layout: BedroomLayoutInfo = {
    openingWidth: round1(openingW),
    openingHeight: round1(openingH),
    roofMin,
    ohcHeight: round1(ohcH),
    bedFrameWidth: round1(bedW),
    bedMargin: round1(bedMargin),
    top,
    ohc: ohcInfo,
    front: !top || errors.length
      ? null
      : p.style === "style1"
        ? {
          style: "style1",
          floorTop: wardrobeFloorTop(p),
          fixedPanelTop: p.fixedPanelTop,
          doorBottom: round1(p.fixedPanelTop + R.WARDROBE_DOOR_CLEARANCE_MM.value),
          doorTop: top.t3Top,
          clearance: R.WARDROBE_DOOR_CLEARANCE_MM.value,
        }
        : {
          style: "nook",
          floorTop: wardrobeFloorTop(p),
          nookShelfBottom: nookWardrobeBottom(p),
          doorBottom: nookWardrobeBottom(p),
          doorTop: top.t3Top,
          clearance: R.WARDROBE_DOOR_CLEARANCE_MM.value,
        },
  };
  // Wardrobe / overhead fronts horizontal; the colour panels run boot deck → roof (over 1180), vertical.
  const grain = applyGrain(
    errors.length ? [] : boards,
    (b) => (b.id === "WARD_L_PANEL" || b.id === "WARD_R_PANEL" ? "side" : b.stock?.kind === "door" ? "front" : null),
    raw,
    { front: "horizontal", side: "vertical" },
  );
  if (!errors.length) applyDoorSides(boards, { ...raw, carcassColorName: p.carcassColor });
  const milling = applyMilling(errors.length ? [] : boards);
  return {
    params: p,
    layout,
    grain,
    milling,
    zones: errors.length ? [] : zones,
    boards: errors.length ? [] : boards,
    joints: errors.length ? [] : joints,
    features: [],
    validation: { errors, warnings },
    debug: { boardFrame: "final", provenance },
  };
}

// --- board helpers -----------------------------------------------------------------

/** The carcass thickness as a named param term so provenance shows it as `CPT`. */
function P_cpt(cpt: number) {
  return param({ CPT: cpt }).CPT;
}

/** A rectangular board from its six recorded faces (all numbers already went through dim()). */
function boardRect(
  id: string,
  name: string,
  category: string,
  profilePlane: Board["profilePlane"],
  thicknessAxis: Board["thicknessAxis"],
  materialThickness: number,
  f: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number },
): Board {
  return {
    id,
    name,
    category,
    boardType: "panel",
    materialThickness: round1(materialThickness),
    profilePlane,
    thicknessAxis,
    x0: round1(f.x0), x1: round1(f.x1), y0: round1(f.y0), y1: round1(f.y1), z0: round1(f.z0), z1: round1(f.z1),
    source: "bedroom",
  };
}
