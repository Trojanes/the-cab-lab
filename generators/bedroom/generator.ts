/**
 * Bedroom (vehicle nose) v1 generator — the north-south body as five regions.
 *
 * The envelope (width = van, depth from the room face, roof profile) comes
 * from the space and the placement. Inside it the layout is three numbers —
 * `bootHeight`, `wardrobeWidth` (both sides: symmetric by rule), `ohcBottom` —
 * and a bed frame choice (`bedFrame`, a product size the opening must take).
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
 * Boards so far — the tunnel boot, three boards bounded by the boot region:
 *
 *   BOOT_DECK   wall to wall × full depth × BOOT_DECK_THICKNESS, its top at bootHeight
 *   BOOT_BACK   upright on the room face: carcass stock, floor → deck underside
 *   BOOT_FRONT  upright at the nose end: the same, its outer face at depth
 *
 * The deck sits on the two uprights (butt joints). The other regions are
 * still blocks; their boards come later, each bounded by its region's faces.
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
} from "./types.ts";
import { RULES as R } from "./rules.ts";
import { Outline, beginProvenance, dim, endProvenance, ex, lit, param, ref, same } from "../_lib/dim.ts";
import { annotate, attachFaces, boundaryEdgeFaces, edgeFacesIn, faceRef, joint, type Joint } from "../_lib/model.ts";

export { RULES } from "./rules.ts";
export * from "./svgPreview.ts";

const DEFAULT_CPT = 16;
const DEFAULT_COLOR = "White Stipple";
const EPS = 1e-6;

export const LAYOUT_KEYS: BedroomLayoutKey[] = ["bootHeight", "wardrobeWidth", "ohcBottom"];

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
    bedFrame: normalizeBedFrame(raw.bedFrame),
    panelThickness: round1(asNum(raw.panelThickness, DEFAULT_CPT)),
    doorPanelThickness: round1(asNum(raw.doorPanelThickness, R.DOOR_PANEL_THICKNESS_DEFAULT_MM.value)),
    frontPanelThickness: round1(asNum(raw.frontPanelThickness, 0)),
    carcassColor: String(raw.carcassColor || DEFAULT_COLOR),
    doorColor: String(raw.doorColorName || raw.doorColor || DEFAULT_COLOR),
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
  }
}

/** New params with `key` set to `value`, clamped into `layoutLimits` and rounded to 0.1 mm. */
export function setLayout(raw: BedroomParams, key: BedroomLayoutKey, value: number): BedroomParams {
  const { min, max } = layoutLimits(raw, key);
  const v = round1(Math.max(min, Math.min(max, Number(value))));
  if (raw[key] === v) return raw;
  return { ...raw, [key]: v };
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
  const P = param({ W, D, H, bootHeight: p.bootHeight, wardrobeWidth: p.wardrobeWidth, ohcBottom: p.ohcBottom });
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
    dim("top.T2.y0", { y1: ref("top.T2.y1"), T2T: R.WARDROBE_T2_THICKNESS_MM }, (t) => t.y1 - t.T2T);
    const t1Y0 = dim("top.T1.y0", { y1: ref("top.T2.y0"), T1T: R.WARDROBE_T1_THICKNESS_MM }, (t) => t.y1 - t.T1T);
    dim("top.roofAtT1", { y: ref("top.T2.y0") }, (t) => round1(roofFn(t.y)), { formula: "roof(T1.y1)" });
    dim("top.T1.z1", { roof: ref("top.roofAtT1"), OVER: R.WARDROBE_T1_OVERSIZE_MM }, (t) => t.roof + t.OVER);
    const roofAtLip = round1(roofFn(lipY1));
    top = { seat: round1(seat), t3Top: round1(t3Top), roofAtT2: round1(roofAtT2), t2Height: round1(roofAtT2 - railZ0) };

    if (seat - p.bootHeight < R.WARDROBE_PANEL_MIN_HEIGHT_MM.value) errors.push(`the roof at the T2 back (${round1(roofAtT2)}) leaves only ${round1(seat - p.bootHeight)} mm of colour panel above the boot deck (min ${R.WARDROBE_PANEL_MIN_HEIGHT_MM.value})`);
    if (roofAtLip <= railZ0 + EPS) errors.push(`the roof comes down to ${roofAtLip} mm at the T3 pocket end — no room for the panel above the pocket`);
    if (t3Depth > D - EPS) errors.push(`T3 depth ${round1(t3Depth)} is more than the body depth ${D}`);
    if (t1Y0 < EPS) errors.push("the top rails do not fit in front of the T2 back");
    if (!errors.length) warnings.push(`T1 is cut ${R.WARDROBE_T1_OVERSIZE_MM.value} mm above the roof by design — trim to the roof on site`);

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

    const wardBoards: Board[] = [panelL, panelR, t3L, t3R, T2, T1];
    for (const b of wardBoards) b.role = b.category;
    panelL.zoneId = "wardrobeL"; t3L.zoneId = "wardrobeL";
    panelR.zoneId = "wardrobeR"; t3R.zoneId = "wardrobeR";
    T2.zoneId = "top"; T1.zoneId = "top";
    wardL.boards = ["WARD_L_PANEL", "WARD_L_T3"];
    wardR.boards = ["WARD_R_PANEL", "WARD_R_T3"];
    attachFaces(wardBoards);
    for (const b of [panelL, panelR]) b.stock = { kind: "door", thickness: b.materialThickness, colour: p.doorColor };
    for (const b of [t3L, t3R, T2, T1]) b.stock = { kind: "carcass", thickness: b.materialThickness, colour: p.carcassColor };
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
    // T3 rests on the colour panel's seat (the panel's top edge in front of the T2 back).
    for (const [panel, t3] of [[panelL, t3L], [panelR, t3R]] as Array<[Board, Board]>) {
      const seatFaces = edgeFacesIn(panel, { u0: -EPS, u1: lipY1 + EPS, v0: seat - p.bootHeight - EPS, v1: seat - p.bootHeight + EPS });
      for (const f of seatFaces) f.features.push({ id: `${panel.id}_SEAT`, kind: "notch", for: t3.id, key: `${panel.id}.pv`, source: "bedroom.wardrobeTop" });
      joints.push(joint(`${t3.id}_seat`, "butt", faceRef(t3.id, ["B"]), faceRef(panel.id, seatFaces), { hardware: [], rule: "wardrobe_t3_on_panel_seat_v1" }));
      // T1 / T2 stand on T3 (with the clearance): face contact, not a joint that holds anything.
      for (const rail of [T1, T2]) joints.push(joint(`${rail.id}_${t3.id}`, "face_contact", faceRef(t3.id, ["A"]), faceRef(rail.id, boundaryEdgeFaces(rail, "-Z")), { hardware: [], rule: "wardrobe_rail_on_t3_v1" }));
    }
    boards.push(...wardBoards);
    }
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
  };
  return {
    params: p,
    layout,
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
    source: "bedroom.boot",
  };
}
