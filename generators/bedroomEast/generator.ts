/**
 * East-west bedroom, built as Bedroom 1.
 *
 * The mattress lies across the van against the right wall; one wardrobe
 * stands against the left wall with a bedside cabinet in front of it. Boot,
 * wardrobe, top rails and overhead sit against the nose, BODY_DEPTH deep; the
 * bed box runs from the body MATTRESS_DEPTH − BODY_DEPTH into the room, with
 * its room-side left corner cut off. The bed box starts BED_SIDE_GAP past the
 * wardrobe; the mattress is the rest of the width. The overhead spans from the
 * wardrobe's inner face to the right wall, two or three up-flap bays and a
 * filler panel at the wall. Boards: boards.ts.
 *
 * Local frame (nose placement, pose rotZ 180): X left → right seen from the
 * room, Y from the room face (0) toward the nose (depth), Z up. The roof
 * profile comes from the space in the same local Y.
 */
import { beginProvenance, dim, endProvenance, param, ref } from "../_lib/dim.ts";
import { applyDoorSides, carcassColourOf, doorColourBOf, doorColourOf } from "../_lib/finish.ts";
import { applyMilling } from "../_lib/milling.ts";
import { roofAt } from "../bedroom/generator.ts";
import { buildEastBoards } from "./boards.ts";
import { RULES as R } from "./rules.ts";

export { RULES } from "./rules.ts";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface EastBay {
  id: string;
  width: number;
}

export interface EastParams {
  width: number;
  depth?: number;
  height: number;
  roofProfile?: Array<[number, number]>;
  wardrobeWidth?: number;
  ohcBottom?: number;
  ohcZones?: EastBay[];
  fixedPanelTop?: number;
  /** LED channels on T3's top (default on). */
  ledGroove?: boolean;
  panelThickness?: number;
  doorPanelThickness?: number;
  carcassColor?: string;
  carcassColorName?: string;
  doorColor?: string;
  doorColorName?: string;
  doorSides?: string;
}

type P = { y: number; z: number };

const bodyY0 = () => R.MATTRESS_DEPTH_MM.value - R.BODY_DEPTH_MM.value;

/** Widest wardrobe that still leaves a queen-length mattress past the bed-side gap; never under the minimum. */
export function eastWardrobeMax(width: number): number {
  return round1(Math.max(R.WARDROBE_MIN_MM.value, width - R.MATTRESS_QUEEN_LENGTH_MM.value - R.BED_SIDE_GAP_MM.value));
}

function wardrobeOf(raw: EastParams): number {
  const W = round1(raw.width || 0);
  return round1(Math.min(eastWardrobeMax(W), Math.max(R.WARDROBE_MIN_MM.value, raw.wardrobeWidth ?? eastWardrobeMax(W))));
}

function profileOf(raw: EastParams): Array<[number, number]> {
  const H = round1(raw.height || 0);
  return raw.roofProfile && raw.roofProfile.length > 1 ? raw.roofProfile : [[0, H], [R.MATTRESS_DEPTH_MM.value, H]];
}

/** Two or three bays whose widths sum to `opening`; the last one absorbs the remainder. */
export function eastBays(raw: EastBay[] | undefined, opening: number): EastBay[] {
  const count = raw && (raw.length === 2 || raw.length === 3) ? raw.length : R.OHC_ZONE_COUNT_DEFAULT.value;
  const given = raw && raw.length === count ? raw : [];
  const sum = given.reduce((s, z) => s + (Number.isFinite(z.width) ? z.width : 0), 0);
  const total = round1(Math.max(0, opening));
  if (sum <= 0) {
    const each = round1(total / count);
    return Array.from({ length: count }, (_, i) => ({ id: `ohc-${i + 1}`, width: i === count - 1 ? round1(total - each * (count - 1)) : each }));
  }
  const out = given.map((z, i) => ({ id: z.id || `ohc-${i + 1}`, width: round1((z.width * total) / sum) }));
  out[out.length - 1]!.width = round1(total - out.slice(0, -1).reduce((s, z) => s + z.width, 0));
  return out;
}

/** `count` equal bays across the overhead. */
export function eastEqualBays(raw: EastParams, count: 2 | 3): EastBay[] {
  return eastBays(Array.from({ length: count }, (_, i) => ({ id: `ohc-${i + 1}`, width: 1 })), round1(raw.width - wardrobeOf(raw)));
}

/** Move the centreline between bay `index` and the next to cabinet x. */
export function eastSetBayBoundary(raw: EastParams, index: number, x: number): EastBay[] | null {
  const x0 = wardrobeOf(raw);
  const bays = eastBays(raw.ohcZones, round1(raw.width - x0)).map((z) => ({ ...z }));
  const left = bays[index];
  const right = bays[index + 1];
  if (!left || !right) return null;
  const start = round1(x0 + bays.slice(0, index).reduce((s, z) => s + z.width, 0));
  const total = round1(left.width + right.width);
  const min = R.OHC_ZONE_MIN_MM.value;
  const at = round1(Math.max(start + min, Math.min(start + total - min, x)));
  left.width = round1(at - start);
  right.width = round1(total - left.width);
  return bays;
}

/** Range the overhead underside may take: room above the boot, room under the roof at the body's room face. */
export function eastOhcBottomLimits(raw: EastParams): { min: number; max: number } {
  const H = round1(raw.height || 0);
  const roof = roofAt(profileOf(raw), H, bodyY0());
  return { min: round1(R.BOOT_HEIGHT_MM.value + R.OPENING_HEIGHT_MIN_MM.value), max: round1(roof - R.OHC_HEIGHT_MIN_MM.value) };
}

/**
 * Closed YZ section from y0 toward y1, from z0 up to min(roof, zTop). Where
 * the roof comes down to z0 the section stops there. Null when there is no
 * room at y0.
 */
function sectionFrom(profile: Array<[number, number]>, height: number, y0: number, y1: number, z0: number, zTop = Infinity): P[] | null {
  const roof = (y: number) => roofAt(profile, height, y);
  const top = (y: number) => Math.min(zTop, roof(y));
  if (top(y0) <= z0 + 0.5) return null;
  /** y in (a, b) where f changes sign. */
  const cross = (a: number, b: number, f: (y: number) => number) => {
    let lo = a;
    let hi = b;
    for (let k = 0; k < 30; k += 1) {
      const mid = (lo + hi) / 2;
      if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const breaks = [y0, ...profile.map(([y]) => y).filter((y) => y > y0 + 0.01 && y < y1 - 0.01), y1];
  const ys: number[] = [breaks[0]!];
  for (let i = 1; i < breaks.length; i += 1) {
    const a = breaks[i - 1]!;
    const b = breaks[i]!;
    if (zTop < Infinity && (roof(a) - zTop) * (roof(b) - zTop) < 0) ys.push(cross(a, b, (y) => roof(y) - zTop));
    ys.push(b);
  }
  const pts: P[] = [];
  let end = y1;
  for (let i = 0; i < ys.length; i += 1) {
    const y = ys[i]!;
    if (top(y) > z0 + 0.5) { pts.push({ y: round1(y), z: round1(top(y)) }); continue; }
    end = round1(cross(ys[i - 1]!, y, (q) => top(q) - z0));
    break;
  }
  return [{ y: y0, z: z0 }, { y: end, z: z0 }, ...pts.slice().reverse(), { y: y0, z: z0 }];
}

function box(y0: number, y1: number, z0: number, z1: number): P[] {
  return [{ y: y0, z: z0 }, { y: y1, z: z0 }, { y: y1, z: z1 }, { y: y0, z: z1 }, { y: y0, z: z0 }];
}

export function generateBedroomEast(raw: EastParams) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const W = round1(raw.width || 0);
  const H = round1(raw.height || 0);
  const D = R.MATTRESS_DEPTH_MM.value;
  const profile = profileOf(raw);
  const wardrobe = wardrobeOf(raw);
  const ohcBottom = round1(raw.ohcBottom ?? R.OHC_BOTTOM_DEFAULT_MM.value);

  beginProvenance();
  const Pm = param({ W, H, wardrobeWidth: wardrobe, ohcBottom });
  const y0 = dim("body.y0", { D: R.MATTRESS_DEPTH_MM, body: R.BODY_DEPTH_MM }, (t) => t.D - t.body);
  const bootTop = dim("boot.z1", { boot: R.BOOT_HEIGHT_MM }, (t) => t.boot);
  const wardX1 = dim("wardrobe.x1", { wardrobeWidth: Pm.wardrobeWidth }, (t) => t.wardrobeWidth);
  const bedX0 = dim("bed.x0", { x: ref("wardrobe.x1"), gap: R.BED_SIDE_GAP_MM }, (t) => t.x + t.gap);
  const mattressLen = dim("mattress.length", { W: Pm.W, x0: ref("bed.x0") }, (t) => t.W - t.x0);
  dim("mattress.y1", { D: R.MATTRESS_DEPTH_MM }, (t) => t.D);
  const ohcZ0 = dim("ohc.z0", { ohcBottom: Pm.ohcBottom }, (t) => t.ohcBottom);
  const opening = dim("ohc.width", { W: Pm.W, x0: ref("wardrobe.x1") }, (t) => t.W - t.x0);
  const openingH = dim("layout.openingHeight", { top: ref("ohc.z0"), bottom: ref("boot.z1") }, (t) => t.top - t.bottom);
  const roofAtFace = round1(roofAt(profile, H, y0));
  const ohcH = round1(roofAtFace - ohcZ0);

  if (W < R.WARDROBE_MIN_MM.value + 1) errors.push(`width ${W} has no room for a wardrobe and a mattress`);
  if (mattressLen < R.MATTRESS_QUEEN_LENGTH_MM.value - 0.05) {
    warnings.push(`the mattress is only ${round1(mattressLen)} mm long — a queen mattress needs ${R.MATTRESS_QUEEN_LENGTH_MM.value}`);
  }
  if (openingH < R.OPENING_HEIGHT_MIN_MM.value) errors.push(`only ${round1(openingH)} mm between the boot deck and the overhead (min ${R.OPENING_HEIGHT_MIN_MM.value})`);
  if (ohcH < R.OHC_HEIGHT_MIN_MM.value) errors.push(`overhead is only ${ohcH} mm high at the body's room face (min ${R.OHC_HEIGHT_MIN_MM.value})`);
  const bays = eastBays(raw.ohcZones, opening);
  for (const b of bays) {
    if (b.width < R.OHC_ZONE_MIN_MM.value - 0.05) errors.push(`overhead bay ${b.width} is narrower than ${R.OHC_ZONE_MIN_MM.value} mm`);
  }

  const cpt = round1(raw.panelThickness ?? 15);
  const dpt = round1(raw.doorPanelThickness ?? 16);
  const fixedPanelTop = round1(raw.fixedPanelTop ?? R.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value);
  const floorTop = round1(bootTop + R.WARDROBE_FLOOR_RAISE_MM.value);
  const carcassColor = carcassColourOf(raw);
  const doorColor = doorColourOf(raw);
  const doorColorB = doorColourBOf(raw);

  const zones: Array<Record<string, unknown>> = [];
  let boards: ReturnType<typeof buildEastBoards>["boards"] = [];
  let milling = { issues: [] as unknown[] };
  let top = null as null | { t3Top: number; seat: number; uprightBack: number; doors: Array<{ x0: number; x1: number }> };
  if (!errors.length) {
    const built = buildEastBoards({ W, H, profile, wardrobe, bedX0, ohcBottom: ohcZ0, bays, fixedPanelTop, cpt, dpt, carcassColor, doorColor, doorColorB, led: raw.ledGroove !== false });
    boards = built.boards;
    top = built.info;
    warnings.push(...built.warnings);
    const bsY0 = round1(y0 - R.BEDSIDE_DEPTH_MM.value);
    zones.push({ id: "boot", label: "Boot", kind: "solid", x0: 0, x1: W, y0, y1: D, z0: 0, z1: bootTop, roofTop: false, outlineYZ: box(y0, D, 0, bootTop), boards: built.regions.boot });
    zones.push({ id: "bedbox", label: "Bed box", kind: "solid", x0: bedX0, x1: W, y0: 0, y1: y0, z0: 0, z1: bootTop, roofTop: false, outlineYZ: box(0, y0, 0, bootTop), boards: built.regions.bedbox });
    zones.push({ id: "bedside", label: "Bedside cabinet", kind: "solid", x0: 0, x1: wardX1, y0: bsY0, y1: y0, z0: 0, z1: floorTop, roofTop: false, outlineYZ: box(bsY0, y0, 0, floorTop), boards: built.regions.bedside });
    const region = (id: string, label: string, kind: "solid" | "void", x0: number, x1: number, z0: number, zTop = Infinity, ids?: string[]) => {
      const outline = sectionFrom(profile, H, y0, D, z0, zTop);
      if (!outline) { errors.push(`${label} has no room under the roof`); return; }
      zones.push({ id, label, kind, x0, x1, y0, y1: round1(Math.max(...outline.map((p) => p.y))), z0, z1: round1(Math.max(...outline.map((p) => p.z))), roofTop: zTop === Infinity, outlineYZ: outline, ...(ids ? { boards: ids } : {}) });
    };
    region("wardrobe", "Wardrobe", "solid", 0, wardX1, bootTop, Infinity, built.regions.wardrobe);
    region("opening", "Opening", "void", wardX1, W, bootTop, ohcZ0);
    region("ohc", "Overhead", "solid", wardX1, W, ohcZ0, Infinity, built.regions.ohc);
    applyDoorSides(boards, raw);
    milling = applyMilling(boards);
  }
  let x = wardX1;
  const bayInfo = bays.map((b) => {
    const out = { id: b.id, width: b.width, x0: round1(x), x1: round1(x + b.width) };
    x += b.width;
    return out;
  });
  const provenance = endProvenance();

  return {
    params: { width: W, depth: D, height: H, wardrobeWidth: wardrobe, bedX0, bootHeight: bootTop, bodyDepth: R.BODY_DEPTH_MM.value, mattressDepth: D, mattressLength: round1(mattressLen), ohcBottom: ohcZ0, ohcZones: bays, fixedPanelTop, roofProfile: profile, panelThickness: cpt, doorPanelThickness: dpt },
    zones: errors.length ? [] : zones,
    boards: errors.length ? [] : boards,
    joints: [],
    layout: { ohc: { bottom: ohcZ0, width: round1(opening), height: ohcH, zones: bayInfo }, top },
    milling,
    validation: { errors, warnings },
    debug: { boardFrame: "final", provenance },
  };
}
