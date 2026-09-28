/**
 * Bunk bed across the van: layout regions, and the front partition as boards.
 *
 * Two bunks stacked against the rear wall, wall to wall. The lower box is
 * the tunnel boot with the lower deck on top (its top is `deckTop`); the
 * upper base hangs at `upperZ` (its underside); the bunk stops a ceiling
 * clearance under the roof (`height`). The front partition is part of the
 * depth. The ladder and the end cubby sit at `endSide` (seen from the room).
 *
 *   section (room on the left)            local frame
 *   ─────────── height ──────┐             X  left → right seen from the room (0..length)
 *     upper                  │             Y  room face of the partition (0) → rear wall (depth)
 *   ▀▀▀▀▀▀▀ upper base ▀▀▀▀▀ │ upperZ      Z  up from the floor
 *     lower                  │
 *   ▀▀▀▀▀▀▀ deck ▀▀▀▀▀▀▀▀▀▀▀ │ deckTop
 *     tunnel boot            │
 *   ─────────────────────────┘ rear wall
 *
 *   front partition, seen from the room (endSide RIGHT: ladder on the right)
 *   ┌──────┐                         ┌──────┐ height
 *   │      │      upper opening      │      │
 *   │      └─────────────────────────┘      │ upper base top + UPPER_RAIL
 *   │      ╭──────────────────╮ ╭──╮        │ upper base underside − UPPER_BASE_LIP
 *   │      │  lower opening   │ ╰──╯ ladder │
 *   │      │                  │ ╭──╮ holes  │
 *   │      ╰──────────────────╯ ╰──╯        │ deck top + LOWER_RAIL
 *   │               ┌──────┐                │ deck underside
 *   └───────────────┘ boot └────────────────┘ floorClearance
 *    600 from the far wall     914.5 from the ladder wall
 */
import { Outline, beginProvenance, dim, endProvenance, lit, param, ref, type Term } from "../_lib/dim.ts";
import { addFeature, annotate, attachFaces, boundaryEdgeFaces, faceRef, joint, tagEdges, type Board, type FaceId, type Joint } from "../_lib/model.ts";
import { applyMilling } from "../_lib/milling.ts";
import { applyDoorSides, doorColourOf, doorSidesOf } from "../_lib/finish.ts";
import { applyGrain } from "../_lib/grain.ts";
import { cutAt, flatten, notchedOutline, reverseRing, roundedRect, sillOutline, type Piece, type Pt } from "./partition.ts";
import { RULES as R } from "./rules.ts";

export { RULES } from "./rules.ts";

export type BunkEndSide = "LEFT" | "RIGHT";

export interface BunkBedParams {
  /** Wall to wall along the rear wall (X). */
  length: number;
  /** Rear wall to the room face of the front partition (Y), partition included. */
  depth: number;
  /** Floor to the top of the bunk: the ceiling minus `ceilingClearance`. */
  height: number;
  /** Front partition gap above the floor — the job's partition stock, copied at creation. */
  floorClearance?: number;
  /** Front partition gap under the ceiling — the job's partition stock, copied at creation; `height` already leaves it. */
  ceilingClearance?: number;
  /** Front partition and sill thickness — the job's partition stock, copied at creation. */
  partitionThickness?: number;
  /** Tunnel boot back and inner sides — the job's carcass stock, copied at creation. */
  carcassThickness?: number;
  /** End panels and the boot door — the job's door stock, copied at creation. */
  doorThickness?: number;
  doorColorName?: string;
  doorSides?: "single" | "double";
  doorSeries?: "acrylic" | "hpl";
  grain?: { front?: "horizontal" | "vertical"; side?: "horizontal" | "vertical" };
  /** Top of the lower deck. */
  deckTop?: number;
  /** Underside of the upper base. Equal clear heights when absent. */
  upperZ?: number;
  /** Ladder and end cubby, seen from the room. */
  endSide?: BunkEndSide;
  carcassColorName?: string;
  /** Always 0: the front partition is inside the depth. */
  frontPanelThickness?: number;
}

export interface BunkZone {
  id: "boot" | "deck" | "lower" | "upperBase" | "upper";
  label: string;
  kind: "solid" | "void";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  roofTop: false;
  outlineYZ: Array<{ y: number; z: number }>;
  /** Boards this region is made of; the 3D view draws those instead of the region's block. */
  boards?: string[];
}

const DEFAULT_COLOR = "White Stipple";

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
const r3 = (n: number) => Math.round(n * 1000) / 1000;
function num(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Upper base underside range for a lower deck and a bunk top, and the height that gives both bunks the same clear height. */
export function bunkUpperLimits(p: { deckTop: number; height: number }): { min: number; max: number; equal: number } {
  const up = R.UPPER_BASE_THICKNESS_MM.value;
  const clear = R.BUNK_CLEAR_MIN_MM.value;
  return {
    min: round1(p.deckTop + clear),
    max: round1(p.height - up - clear),
    equal: round1((p.deckTop + p.height - up) / 2),
  };
}

/** Smallest box the module accepts: W length, D depth, H top (boot + deck + two bunks + the upper base). */
export function bunkMinSize(): { W: number; D: number; H: number } {
  return {
    W: R.LENGTH_MIN_MM.value,
    D: R.DEPTH_MIN_MM.value,
    H: round1(R.BOOT_HEIGHT_MIN_MM.value + R.DECK_THICKNESS_MM.value + 2 * R.BUNK_CLEAR_MIN_MM.value + R.UPPER_BASE_THICKNESS_MM.value),
  };
}

function box(y0: number, y1: number, z0: number, z1: number): Array<{ y: number; z: number }> {
  return [{ y: y0, z: z0 }, { y: y1, z: z0 }, { y: y1, z: z1 }, { y: y0, z: z1 }, { y: y0, z: z0 }];
}

export function generateBunkBed(raw: BunkBedParams) {
  const errors: string[] = [];
  const warnings: string[] = [];
  const W = round1(num(raw.length, 0));
  const D = round1(num(raw.depth, R.DEPTH_DEFAULT_MM.value));
  const H = round1(num(raw.height, 0));
  const deckTopIn = round1(num(raw.deckTop, R.DECK_TOP_DEFAULT_MM.value));
  const upperZIn = round1(num(raw.upperZ, bunkUpperLimits({ deckTop: deckTopIn, height: H }).equal));
  const endSide: BunkEndSide = raw.endSide === "LEFT" ? "LEFT" : "RIGHT";
  const right = endSide === "RIGHT";
  const floorClearance = round1(num(raw.floorClearance, 0));
  const ceilingClearance = round1(num(raw.ceilingClearance, 0));
  const T = round1(num(raw.partitionThickness, R.PARTITION_THICKNESS_DEFAULT_MM.value));
  const Tc = round1(num(raw.carcassThickness, 15));
  const Td = round1(num(raw.doorThickness, 16));
  const color = String(raw.carcassColorName || DEFAULT_COLOR);
  const doorColour = doorColourOf(raw);
  const doorSides = doorSidesOf(raw);

  beginProvenance();
  const P = param({ W, D, H, deckTop: deckTopIn, upperZ: upperZIn, floorClearance, T, Tc, Td });
  const deckTop = dim("deck.z1", { deckTop: P.deckTop }, (t) => t.deckTop);
  const bootTop = dim("boot.z1", { top: ref("deck.z1"), T: R.DECK_THICKNESS_MM }, (t) => t.top - t.T);
  dim("deck.z0", { z: ref("boot.z1") }, (t) => t.z, { formula: "= boot.z1" });
  const upperZ = dim("upperBase.z0", { upperZ: P.upperZ }, (t) => t.upperZ);
  const upperTop = dim("upperBase.z1", { z0: ref("upperBase.z0"), T: R.UPPER_BASE_THICKNESS_MM }, (t) => t.z0 + t.T);
  const lowerClear = dim("lower.clear", { top: ref("upperBase.z0"), bottom: ref("deck.z1") }, (t) => t.top - t.bottom);
  const upperClear = dim("upper.clear", { H: P.H, bottom: ref("upperBase.z1") }, (t) => t.H - t.bottom);
  const mattress = dim("mattress.width", { D: P.D, T: P.T }, (t) => t.D - t.T);
  const partZ0 = dim("partition.z0", { floorClearance: P.floorClearance }, (t) => t.floorClearance);
  const partZ1 = dim("partition.z1", { H: P.H }, (t) => t.H);

  // Front partition heights come from the two decks.
  const lowZ0 = dim("opening.lower.z0", { deckTop: ref("deck.z1"), RAIL: R.LOWER_RAIL_MM }, (t) => t.deckTop + t.RAIL);
  const lowZ1 = dim("opening.lower.z1", { underside: ref("upperBase.z0"), LIP: R.UPPER_BASE_LIP_MM }, (t) => t.underside - t.LIP);
  const upZ0 = dim("opening.upper.z0", { top: ref("upperBase.z1"), RAIL: R.UPPER_RAIL_MM }, (t) => t.top + t.RAIL);
  const holeH = dim("ladder.h", { z0: ref("opening.lower.z0"), z1: ref("opening.lower.z1"), N: R.LADDER_HOLE_COUNT, GAP: R.LADDER_HOLE_GAP_MM }, (t) => (t.z1 - t.z0 - (t.N - 1) * t.GAP) / t.N, { formula: "(z1 - z0 - (N - 1) * GAP) / N" });
  // Along X: a distance from the ladder-side wall or from the far wall, as a local x.
  const fromLadder = (key: string, terms: Record<string, Term>, d: (t: Record<string, number>) => number, f: string) =>
    dim(key, { W: P.W, ...terms }, (t) => (right ? t.W - d(t) : d(t)), { formula: right ? `W - (${f})` : f });
  const fromFar = (key: string, terms: Record<string, Term>, d: (t: Record<string, number>) => number, f: string) =>
    dim(key, { W: P.W, ...terms }, (t) => (right ? d(t) : t.W - d(t)), { formula: right ? f : `W - (${f})` });
  const M = R.OPENING_WALL_MARGIN_MM;
  const upFar = fromFar("opening.upper.far", { M }, (t) => t.M, "M");
  const upLadder = fromLadder("opening.upper.ladder", { M }, (t) => t.M, "M");
  const holeNear = fromLadder("ladder.near", { M, EDGE: R.LADDER_HOLE_EDGE_MM }, (t) => t.M + t.EDGE, "M + EDGE");
  const holeFar = fromLadder("ladder.far", { M, EDGE: R.LADDER_HOLE_EDGE_MM, HW: R.LADDER_HOLE_WIDTH_MM }, (t) => t.M + t.EDGE + t.HW, "M + EDGE + HW");
  const lowFar = fromFar("opening.lower.far", { M }, (t) => t.M, "M");
  const lowLadder = fromLadder("opening.lower.ladder", { M, EDGE: R.LADDER_HOLE_EDGE_MM, HW: R.LADDER_HOLE_WIDTH_MM, WEB: R.LADDER_WEB_MM }, (t) => t.M + t.EDGE + t.HW + t.WEB, "M + EDGE + HW + WEB");
  const accNear = fromLadder("access.near", { FROM: R.BOOT_ACCESS_FROM_END_MM }, (t) => t.FROM, "FROM");
  const accFar = fromLadder("access.far", { FROM: R.BOOT_ACCESS_FROM_END_MM, AW: R.BOOT_ACCESS_WIDTH_MM }, (t) => t.FROM + t.AW, "FROM + AW");
  const partH = partZ1 - partZ0;
  const fits = (w: number, h: number) => (w <= R.SHEET_SHORT_MM.value && h <= R.SHEET_LONG_MM.value) || (w <= R.SHEET_LONG_MM.value && h <= R.SHEET_SHORT_MM.value);
  const cut = fits(W, partH) ? null : dim("partition.cut", { W: P.W, ROUND: R.SPLIT_ROUND_MM }, (t) => Math.round(t.W / 2 / t.ROUND) * t.ROUND, { formula: "round(W / 2 / ROUND) * ROUND" });

  if (W < R.LENGTH_MIN_MM.value) errors.push(`the bunk is only ${W} mm long — at least ${R.LENGTH_MIN_MM.value}`);
  if (D < R.DEPTH_MIN_MM.value) errors.push(`the bunk is only ${D} mm deep — at least ${R.DEPTH_MIN_MM.value}`);
  if (bootTop < R.BOOT_HEIGHT_MIN_MM.value) errors.push(`the deck top ${deckTop} leaves a ${round1(bootTop)} mm boot — at least ${R.BOOT_HEIGHT_MIN_MM.value}`);
  if (lowerClear < R.BUNK_CLEAR_MIN_MM.value) errors.push(`the lower bunk has only ${round1(lowerClear)} mm clear — at least ${R.BUNK_CLEAR_MIN_MM.value}`);
  if (upperClear < R.BUNK_CLEAR_MIN_MM.value) errors.push(`the upper bunk has only ${round1(upperClear)} mm clear — at least ${R.BUNK_CLEAR_MIN_MM.value}`);
  if (T <= 0 || T >= D) errors.push(`the front partition is ${T} mm thick in a ${D} mm deep bunk`);

  // The partition's features as x ranges (left < right) — `endSide` only mirrors them.
  const span = (a: number, b: number): [number, number] => [Math.min(a, b), Math.max(a, b)];
  const rOpen = R.OPENING_RADIUS_MM.value;
  const rHole = R.LADDER_HOLE_RADIUS_MM.value;
  const upX = span(upFar, upLadder);
  const lowX = span(lowFar, lowLadder);
  const holeX = span(holeNear, holeFar);
  const accX = span(accNear, accFar);
  if (!errors.length) {
    if (accX[0] < 0 || accX[1] > W) errors.push(`the boot access (${round1(accX[0])} → ${round1(accX[1])}) runs past the side walls`);
    if (lowX[1] - lowX[0] < 2 * rOpen) errors.push(`the lower opening is only ${round1(lowX[1] - lowX[0])} mm wide — the bunk is too short for the opening, the ladder and the margins`);
    if (lowZ1 - lowZ0 < 2 * rOpen) errors.push(`the lower opening is only ${round1(lowZ1 - lowZ0)} mm high`);
    if (holeH < 2 * rHole) errors.push(`the ladder holes are only ${round1(holeH)} mm high`);
    if (upZ0 > partZ1 - rOpen) errors.push(`no room for the upper opening: it would start at ${round1(upZ0)} under a ${round1(partZ1)} top`);
  }

  // Front partition boards.
  const boards: Board[] = [];
  const joints: Joint[] = [];
  if (!errors.length) {
    const outer = flatten(notchedOutline(W, partZ0, partZ1, accX, bootTop, upX, upZ0, rOpen));
    const holes = [
      flatten(reverseRing(roundedRect(lowX[0], lowX[1], lowZ0, lowZ1, rOpen))),
      ...Array.from({ length: R.LADDER_HOLE_COUNT.value }, (_, i) => {
        const z0 = dim(`ladder${i + 1}.z0`, { z0: ref("opening.lower.z0"), h: ref("ladder.h"), GAP: R.LADDER_HOLE_GAP_MM, i }, (t) => t.z0 + t.i * (t.h + t.GAP), { formula: "z0 + i * (h + GAP)" });
        return flatten(reverseRing(roundedRect(holeX[0], holeX[1], z0, z0 + holeH, rHole)));
      }),
    ];
    let pieces: Piece[] | null = [{ outer, holes }];
    if (cut != null) {
      const left = cutAt(outer, holes, cut, true);
      const rightSide = cutAt(outer, holes, cut, false);
      pieces = left && rightSide ? [...left, ...rightSide] : null;
      if (!pieces) errors.push(`the sheet cut at ${cut} lands on a corner of an opening`);
    }
    if (pieces) {
      pieces.sort((a, b) => Math.min(...a.outer.map((p) => p.u)) - Math.min(...b.outer.map((p) => p.u)));
      pieces.forEach((pc, i) => {
        const id = pieces!.length === 1 ? "FP" : `FP_${i + 1}`;
        const name = pieces!.length === 1 ? "Front partition" : `Front partition · ${i === 0 ? "left" : i === pieces!.length - 1 ? "right" : `part ${i + 1}`}`;
        boards.push(partitionBoard(id, name, pc, T, color, partZ0, partZ1));
      });
      for (const b of boards) {
        const w = b.x1 - b.x0;
        const h = b.z1 - b.z0;
        if (!fits(w, h)) errors.push(`${b.id} is ${round1(w)} × ${round1(h)} mm — past the ${R.SHEET_SHORT_MM.value} × ${R.SHEET_LONG_MM.value} sheet`);
      }
      for (let i = 1; i < boards.length; i += 1) {
        const a = boards[i - 1]!;
        const b = boards[i]!;
        joints.push(joint(`${a.id}_${b.id}_cut`, "butt", faceRef(a.id, boundaryEdgeFaces(a, "+X")), faceRef(b.id, boundaryEdgeFaces(b, "-X")), { hardware: [], rule: "bunk_partition_sheet_cut_v1" }));
      }
    }
  }

  // --- boards behind the partition, the boot door and the sill ----------------------------
  const accLo = right ? "access.far" : "access.near"; // the access opening's left / right edge
  const accHi = right ? "access.near" : "access.far";
  let layoutDoor: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } | null = null;
  let layoutCubby: { x0: number; x1: number } | null = null;
  if (!errors.length) {
    const F = (id: string, f: string, terms: Record<string, Term>, fn: (t: Record<string, number>) => number, formula: string) => dim(`${id}.${f}`, terms, fn, { formula });
    const Z0 = (id: string, f: string) => dim(`${id}.${f}`, {}, () => 0, { formula: "0" });
    const carcass = { kind: "carcass" as const, thickness: Tc, colour: color };
    const partition = (t: number) => ({ kind: "partition" as const, thickness: t, colour: color });
    const door = { kind: "door" as const, thickness: Td, colour: doorColour, sides: doorSides === "double" ? 2 : 1 };
    const inBoot = (id: string) => ({ y0: F(id, "y0", { T: P.T }, (t) => t.T, "T"), y1: F(id, "y1", { T: P.T, Tc: P.Tc }, (t) => t.T + t.Tc, "T + Tc") });
    const bootZ = (id: string) => ({ z0: Z0(id, "z0"), z1: F(id, "z1", { z: ref("boot.z1") }, (t) => t.z, "= boot.z1") });

    // Tunnel boot: the back against the rear wall, the inner sides behind the partition either side of the access.
    const back = boxBoard("BOOT_BACK", "Tunnel boot · back", "boot_back", "XZ", "Y", carcass, {
      x0: Z0("BOOT_BACK", "x0"), x1: F("BOOT_BACK", "x1", { W: P.W }, (t) => t.W, "W"),
      y0: F("BOOT_BACK", "y0", { D: P.D, Tc: P.Tc }, (t) => t.D - t.Tc, "D - Tc"), y1: F("BOOT_BACK", "y1", { D: P.D }, (t) => t.D, "D"),
      ...bootZ("BOOT_BACK"),
    });
    const sideL = boxBoard("BOOT_SIDE_L", "Tunnel boot · inner side · left", "boot_side", "XZ", "Y", carcass, {
      x0: Z0("BOOT_SIDE_L", "x0"), x1: F("BOOT_SIDE_L", "x1", { x: ref(accLo) }, (t) => t.x, `= ${accLo}`), ...inBoot("BOOT_SIDE_L"), ...bootZ("BOOT_SIDE_L"),
    });
    const sideR = boxBoard("BOOT_SIDE_R", "Tunnel boot · inner side · right", "boot_side", "XZ", "Y", carcass, {
      x0: F("BOOT_SIDE_R", "x0", { x: ref(accHi) }, (t) => t.x, `= ${accHi}`), x1: F("BOOT_SIDE_R", "x1", { W: P.W }, (t) => t.W, "W"), ...inBoot("BOOT_SIDE_R"), ...bootZ("BOOT_SIDE_R"),
    });

    // Decks: from the partition's back face to the rear wall, wall to wall.
    const flat = (id: string, name: string, role: string, t: number, z0: string, z1: string) => boxBoard(id, name, role, "XY", "Z", partition(t), {
      x0: Z0(id, "x0"), x1: F(id, "x1", { W: P.W }, (v) => v.W, "W"),
      y0: F(id, "y0", { T: P.T }, (v) => v.T, "T"), y1: F(id, "y1", { D: P.D }, (v) => v.D, "D"),
      z0: F(id, "z0", { z: ref(z0) }, (v) => v.z, `= ${z0}`), z1: F(id, "z1", { z: ref(z1) }, (v) => v.z, `= ${z1}`),
    });
    const deck = flat("DECK", "Lower deck", "deck", R.DECK_THICKNESS_MM.value, "deck.z0", "deck.z1");
    const upper = flat("UPPER_BASE", "Upper base", "upper_base", R.UPPER_BASE_THICKNESS_MM.value, "upperBase.z0", "upperBase.z1");

    // Strips under the upper base (partition stock on edge, top = the upper base underside): one against the
    // rear wall, wall to wall; against the partition one from each side wall to the first opening it meets —
    // the lower opening on the far side, the ladder holes on the ladder side.
    const LH = R.LEDGER_HEIGHT_MM;
    const ledgerZ = (id: string) => ({
      z1: F(id, "z1", { z: ref("upperBase.z0") }, (t) => t.z, "= upperBase.z0"),
      z0: F(id, "z0", { z: ref("upperBase.z0"), LH }, (t) => t.z - t.LH, "upperBase.z0 - LH"),
    });
    const ledgerBack = boxBoard("LEDGER_BACK", "Upper base strip · rear wall", "ledger", "XZ", "Y", partition(T), {
      x0: Z0("LEDGER_BACK", "x0"), x1: F("LEDGER_BACK", "x1", { W: P.W }, (t) => t.W, "W"),
      y0: F("LEDGER_BACK", "y0", { D: P.D, T: P.T }, (t) => t.D - t.T, "D - T"), y1: F("LEDGER_BACK", "y1", { D: P.D }, (t) => t.D, "D"),
      ...ledgerZ("LEDGER_BACK"),
    });
    const frontLedger = (id: string, name: string, lo: { key: string } | null, hi: { key: string } | null) => boxBoard(id, name, "ledger", "XZ", "Y", partition(T), {
      x0: lo ? F(id, "x0", { x: ref(lo.key) }, (t) => t.x, `= ${lo.key}`) : Z0(id, "x0"),
      x1: hi ? F(id, "x1", { x: ref(hi.key) }, (t) => t.x, `= ${hi.key}`) : F(id, "x1", { W: P.W }, (t) => t.W, "W"),
      y0: F(id, "y0", { T: P.T }, (t) => t.T, "T"), y1: F(id, "y1", { T: P.T }, (t) => 2 * t.T, "2 * T"),
      ...ledgerZ(id),
    });
    // Left of the room face: from x 0 to the first opening; right: from it to x W.
    const ledgerL = frontLedger("LEDGER_FRONT_L", "Upper base strip · partition · left", null, { key: right ? "opening.lower.far" : "ladder.near" });
    const ledgerR = frontLedger("LEDGER_FRONT_R", "Upper base strip · partition · right", { key: right ? "ladder.near" : "opening.lower.far" }, null);
    const ladderLedger = right ? ledgerR : ledgerL;
    for (const b of [ledgerBack, ledgerL, ledgerR]) {
      annotate(b, "A", { visible: true, finish: { colour: color } });
      annotate(b, "B", { visible: true, finish: { colour: color } });
    }

    // End panels: door stock across each bunk at the cubby, colour toward the bunk, one hand hole each.
    // The lower one stands up to the upper base: the strips that pass it go through notches in its top corners.
    const cubby = fromLadder("cubby.face", { CUBBY: R.CUBBY_WIDTH_MM }, (t) => t.CUBBY, "CUBBY");
    const ex0 = right ? cubby - Td : cubby;
    const ex1 = right ? cubby : cubby + Td;
    const bunkFace = right ? ex0 : ex1;
    if (right ? bunkFace < upLadder : bunkFace > upLadder) errors.push(`the end cubby (${R.CUBBY_WIDTH_MM.value} wide) reaches into the upper opening`);
    const passes = (b: Board) => b.x0 <= ex0 + 1e-6 && b.x1 >= ex1 - 1e-6;
    const endPanel = (id: string, name: string, z0: string, z1: string, strips: Board[] = []) => {
      const b = boxBoard(id, name, "end_panel", "YZ", "X", door, {
        x0: F(id, "x0", { face: ref("cubby.face"), Td: P.Td }, (t) => (right ? t.face - t.Td : t.face), right ? "face - Td" : "= cubby.face"),
        x1: F(id, "x1", { face: ref("cubby.face"), Td: P.Td }, (t) => (right ? t.face : t.face + t.Td), right ? "= cubby.face" : "face + Td"),
        y0: F(id, "y0", { T: P.T }, (t) => t.T, "T"), y1: F(id, "y1", { D: P.D }, (t) => t.D, "D"),
        z0: F(id, "z0", { z: ref(z0) }, (t) => t.z, `= ${z0}`), z1: z1 === "H" ? F(id, "z1", { H: P.H }, (t) => t.H, "H") : F(id, "z1", { z: ref(z1) }, (t) => t.z, `= ${z1}`),
      });
      const h = b.z1 - b.z0;
      const front = strips.find((s) => Math.abs(s.y0 - b.y0) < 1e-6 && passes(s));
      const rear = strips.find((s) => Math.abs(s.y1 - b.y1) < 1e-6 && passes(s));
      if (front || rear) {
        const nz = b.z1 - LH.value;
        const o = new Outline(`${id}.pv`, ["y", "z"]);
        const ring: Array<[number, number]> = [[b.y0, b.z0], [b.y1, b.z0]];
        ring.push(...(rear ? [[b.y1, nz], [rear.y0, nz], [rear.y0, b.z1]] as Array<[number, number]> : [[b.y1, b.z1]] as Array<[number, number]>));
        ring.push(...(front ? [[front.y1, b.z1], [front.y1, nz], [b.y0, nz]] as Array<[number, number]> : [[b.y0, b.z1]] as Array<[number, number]>));
        for (const [y, z] of ring) o.add(lit(r3(y)), lit(r3(z)));
        b.profileVector = [...o.points.map(([y, z]) => ({ y, z })), { y: o.points[0]![0], z: o.points[0]![1] }];
        attachFaces([b]);
        for (const s of [front, rear]) {
          if (!s) continue;
          const box = { u0: s.y0 - b.y0 - 0.01, u1: s.y1 - b.y0 + 0.01, v0: nz - b.z0 - 0.01, v1: h + 0.01 };
          const tags = tagEdges(b, "notch", box, { id: `${id}_NOTCH_${s.id}`, for: s.id, key: `${id}.pv`, source: "bunkBed.ledger" });
          joints.push(joint(`${id}_${s.id}_notch`, "notch", faceRef(id, tags), faceRef(s.id, ["A", "B"]), { hardware: [], rule: "bunk_ledger_through_end_panel_v1" }));
        }
      }
      const u0 = F(id, "hole.u0", { SIDE: R.END_HOLE_SIDE_MM }, (t) => t.SIDE, "SIDE");
      const u1 = F(id, "hole.u1", { deep: b.y1 - b.y0, SIDE: R.END_HOLE_SIDE_MM }, (t) => t.deep - t.SIDE, "deep - SIDE");
      const v1 = F(id, "hole.v1", { h, TOP: R.END_HOLE_TOP_MM }, (t) => t.h - t.TOP, "h - TOP");
      const v0 = F(id, "hole.v0", { v1: ref(`${id}.hole.v1`), HH: R.END_HOLE_HEIGHT_MM }, (t) => t.v1 - t.HH, "v1 - HH");
      if (u1 - u0 < 2 * R.END_HOLE_RADIUS_MM.value || v0 < R.END_HOLE_RADIUS_MM.value) errors.push(`${id}: no room for its hand hole`);
      else throughCutout(b, `${id}_HOLE`, flatten(roundedRect(u0, u1, v0, v1, R.END_HOLE_RADIUS_MM.value)), "hand_hole");
      paintDoorStock(b, right ? "B" : "A", doorColour, color);
      return b;
    };
    const endLower = endPanel("END_LOWER", "End panel · lower bunk", "deck.z1", "upperBase.z0", [ladderLedger, ledgerBack]);
    const endUpper = endPanel("END_UPPER", "End panel · upper bunk", "upperBase.z1", "H");
    layoutCubby = right ? { x0: round1(cubby), x1: W } : { x0: 0, x1: round1(cubby) };

    // Boot door: a down flap of door stock on the room face of the partition, over the access opening.
    // Hinged at the bottom (plates on the sill), the catch at the top under the deck.
    const OV = R.BOOT_DOOR_OVERLAP_MM;
    const bootDoor = boxBoard("BOOT_DOOR", "Tunnel boot flap", "boot_door", "XZ", "Y", door, {
      x0: F("BOOT_DOOR", "x0", { x: ref(accLo), OV }, (t) => t.x - t.OV, `${accLo} - OV`),
      x1: F("BOOT_DOOR", "x1", { x: ref(accHi), OV }, (t) => t.x + t.OV, `${accHi} + OV`),
      y0: F("BOOT_DOOR", "y0", { Td: P.Td }, (t) => -t.Td, "-Td"), y1: Z0("BOOT_DOOR", "y1"),
      z0: F("BOOT_DOOR", "z0", { GAP: R.BOOT_DOOR_BOTTOM_GAP_MM }, (t) => t.GAP, "GAP"),
      z1: F("BOOT_DOOR", "z1", { z: ref("boot.z1"), TOP: R.BOOT_DOOR_TOP_OVERLAP_MM }, (t) => t.z + t.TOP, "boot.z1 + TOP"),
    });
    {
      const w = bootDoor.x1 - bootDoor.x0;
      const cu = F("BOOT_DOOR", "lock.u", { w }, (t) => t.w / 2, "w / 2");
      const cv = F("BOOT_DOOR", "lock.v", { deck: ref("boot.z1"), DROP: R.BOOT_DOOR_LOCK_DROP_MM, z0: ref("BOOT_DOOR.z0") }, (t) => t.deck - t.DROP - t.z0, "boot.z1 - DROP - z0");
      const L = R.BOOT_DOOR_LOCK_LENGTH_MM.value;
      const Wl = R.BOOT_DOOR_LOCK_WIDTH_MM.value;
      addFeature(bootDoor, "A", {
        id: "BOOT_DOOR_LOCK", kind: "cutout", u0: r3(cu - L / 2), u1: r3(cu + L / 2), v0: r3(cv - Wl / 2), v1: r3(cv + Wl / 2),
        radius: Wl / 2, through: true, for: "lock", key: "BOOT_DOOR.lock",
      });
      const hv = F("BOOT_DOOR", "hinge.v", { EDGE: R.BOOT_DOOR_HINGE_FROM_EDGE_MM }, (t) => t.EDGE, "EDGE");
      const hu = [
        F("BOOT_DOOR", "hinge1.u", { SIDE: R.BOOT_DOOR_HINGE_FROM_SIDE_MM }, (t) => t.SIDE, "SIDE"),
        F("BOOT_DOOR", "hinge2.u", { w, SIDE: R.BOOT_DOOR_HINGE_FROM_SIDE_MM }, (t) => t.w - t.SIDE, "w - SIDE"),
      ];
      hu.forEach((u, i) => addFeature(bootDoor, "A", {
        id: `BOOT_DOOR_HINGE_${i + 1}`, kind: "hole", center: [r3(u), r3(hv)],
        diameter: R.BOOT_DOOR_HINGE_DIAMETER_MM.value, depth: R.BOOT_DOOR_HINGE_DEPTH_MM.value, through: false, for: "hinge", key: `BOOT_DOOR.hinge${i + 1}`,
      }));
    }
    paintDoorStock(bootDoor, "B", doorColour, color);
    layoutDoor = { x0: bootDoor.x0, x1: bootDoor.x1, y0: bootDoor.y0, y1: bootDoor.y1, z0: bootDoor.z0, z1: bootDoor.z1 };

    // Sill: partition stock on the floor; the tongue fills the access through the partition and the inner side.
    const CL = R.SILL_TONGUE_CLEARANCE_MM;
    const t0 = F("SILL", "tongue.x0", { x: ref(accLo), CL }, (t) => (right ? t.x : t.x + t.CL), right ? `= ${accLo}` : `${accLo} + CL`);
    const t1 = F("SILL", "tongue.x1", { x: ref(accHi), CL }, (t) => (right ? t.x - t.CL : t.x), right ? `${accHi} - CL` : `= ${accHi}`);
    const yBody = F("SILL", "body.y0", { T: P.T, Tc: P.Tc }, (t) => t.T + t.Tc, "T + Tc");
    const yBack = F("SILL", "body.y1", { y: ref("SILL.body.y0"), SD: R.SILL_DEPTH_MM }, (t) => t.y + t.SD, "y + SD");
    const m0 = F("SILL", "body.x0", { x: ref("SILL.tongue.x0"), OH: R.SILL_OVERHANG_MM }, (t) => t.x - t.OH, "tongue.x0 - OH");
    const m1 = F("SILL", "body.x1", { x: ref("SILL.tongue.x1"), OH: R.SILL_OVERHANG_MM }, (t) => t.x + t.OH, "tongue.x1 + OH");
    const sill = outlinedBoard("SILL", "Tunnel boot sill", "sill", "XY", "Z", partition(T), flatten(sillOutline(m0, m1, t0, t1, yBody, yBack, R.SILL_RELIEF_DIAMETER_MM.value)), 0, T);
    annotate(sill, "A", { semantic: "top", visible: true, finish: { colour: color } });
    annotate(sill, "B", { semantic: "floor", visible: false, finish: { colour: color } });

    for (const b of [back, sideL, sideR]) {
      annotate(b, back === b ? "B" : "A", { semantic: "inside", visible: true, finish: { colour: color } });
      annotate(b, back === b ? "A" : "B", { semantic: back === b ? "wall" : "partition", visible: false, finish: { colour: color } });
    }
    for (const b of [deck, upper]) {
      annotate(b, "A", { semantic: "mattress", visible: true, finish: { colour: color } });
      annotate(b, "B", { semantic: "underside", visible: true, finish: { colour: color } });
    }
    boards.push(back, sideL, sideR, deck, upper, ledgerL, ledgerR, ledgerBack, endLower, endUpper, bootDoor, sill);

    const top = (b: Board) => boundaryEdgeFaces(b, "+Z");
    const bottom = (b: Board) => boundaryEdgeFaces(b, "-Z");
    joints.push(
      joint("DECK_on_BOOT_BACK", "butt", faceRef("DECK", ["B"]), faceRef("BOOT_BACK", top(back)), { hardware: [], rule: "bunk_deck_on_boot_v1" }),
      joint("DECK_on_BOOT_SIDE_L", "butt", faceRef("DECK", ["B"]), faceRef("BOOT_SIDE_L", top(sideL)), { hardware: [], rule: "bunk_deck_on_boot_v1" }),
      joint("DECK_on_BOOT_SIDE_R", "butt", faceRef("DECK", ["B"]), faceRef("BOOT_SIDE_R", top(sideR)), { hardware: [], rule: "bunk_deck_on_boot_v1" }),
      joint("END_LOWER_on_DECK", "butt", faceRef("DECK", ["A"]), faceRef("END_LOWER", bottom(endLower)), { hardware: [], rule: "bunk_end_panel_v1" }),
      joint("END_LOWER_under_UPPER_BASE", "butt", faceRef("UPPER_BASE", ["B"]), faceRef("END_LOWER", top(endLower)), { hardware: [], rule: "bunk_end_panel_v1" }),
      joint("END_UPPER_on_UPPER_BASE", "butt", faceRef("UPPER_BASE", ["A"]), faceRef("END_UPPER", bottom(endUpper)), { hardware: [], rule: "bunk_end_panel_v1" }),
      ...[ledgerL, ledgerR, ledgerBack].map((s) => joint(`UPPER_BASE_on_${s.id}`, "butt", faceRef("UPPER_BASE", ["B"]), faceRef(s.id, top(s)), { hardware: [], rule: "bunk_upper_base_on_ledger_v1" })),
      joint("BOOT_DOOR_hinge_SILL", "hinge", faceRef("BOOT_DOOR", ["A"]), faceRef("SILL", ["A"]), { hardware: ["flap_hinge", "flap_hinge"], rule: "bunk_boot_flap_v1" }),
    );
    for (const b of [back, sideL, sideR, deck, upper, ledgerL, ledgerR, ledgerBack, endLower, endUpper, bootDoor, sill]) {
      const dims = [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0].sort((a, c) => c - a);
      if (!fits(dims[0]!, dims[1]!)) errors.push(`${b.id} is ${round1(dims[0]!)} × ${round1(dims[1]!)} mm — past the ${R.SHEET_SHORT_MM.value} × ${R.SHEET_LONG_MM.value} sheet`);
    }
  }
  const grain = applyGrain(boards, (b) => (b.stock?.kind === "door" ? (b.role === "end_panel" ? "side" : "front") : null), raw, { front: "horizontal", side: "vertical" });
  applyDoorSides(boards, { doorSides, carcassColorName: color });
  const provenance = endProvenance();

  const zone = (id: BunkZone["id"], label: string, kind: BunkZone["kind"], z0: number, z1: number, made: string[] = []): BunkZone => ({
    id, label, kind, x0: 0, x1: W, y0: T, y1: D, z0: round1(z0), z1: round1(z1), roofTop: false, outlineYZ: box(T, D, round1(z0), round1(z1)),
    ...(made.length ? { boards: made } : {}),
  });
  const zones = errors.length ? [] : [
    zone("boot", "Tunnel boot", "solid", 0, bootTop, ["BOOT_BACK", "BOOT_SIDE_L", "BOOT_SIDE_R", "SILL"]),
    zone("deck", "Lower deck", "solid", bootTop, deckTop, ["DECK"]),
    zone("lower", "Lower bunk", "void", deckTop, upperZ),
    zone("upperBase", "Upper base", "solid", upperZ, upperTop, ["UPPER_BASE", "LEDGER_FRONT_L", "LEDGER_FRONT_R", "LEDGER_BACK"]),
    zone("upper", "Upper bunk", "void", upperTop, H),
  ];
  const out = errors.length ? [] : boards;

  return {
    params: {
      length: W, depth: D, height: H, deckTop, upperZ, endSide, floorClearance, ceilingClearance,
      partitionThickness: T, carcassThickness: Tc, doorThickness: Td, carcassColorName: color, doorColorName: doorColour, doorSides, frontPanelThickness: 0,
    },
    zones,
    boards: out,
    joints: errors.length ? [] : joints,
    features: [],
    grain: errors.length ? { ...grain, issues: [] } : grain,
    milling: applyMilling(out),
    layout: {
      bootTop: round1(bootTop),
      deckTop: round1(deckTop),
      upperZ: round1(upperZ),
      upperTop: round1(upperTop),
      lowerClear: round1(lowerClear),
      upperClear: round1(upperClear),
      mattressWidth: round1(mattress),
      partition: {
        thickness: T, z0: round1(partZ0), z1: round1(partZ1), floorClearance, ceilingClearance, cut,
        lowerOpening: { x0: lowX[0], x1: lowX[1], z0: round1(lowZ0), z1: round1(lowZ1) },
        upperOpening: { x0: upX[0], x1: upX[1], z0: round1(upZ0) },
        ladder: { x0: holeX[0], x1: holeX[1], h: round1(holeH) },
        bootAccess: { x0: accX[0], x1: accX[1], z1: round1(bootTop) },
      },
      bootDoor: layoutDoor,
      cubby: layoutCubby,
      endSide,
    },
    validation: { errors, warnings },
    debug: { boardFrame: "final" as const, provenance },
  };
}

type Box6 = { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };

/** A plain board: its box is the geometry (faces already recorded by the caller). */
function boxBoard(id: string, name: string, role: string, plane: Board["profilePlane"], axis: Board["thicknessAxis"], stock: NonNullable<Board["stock"]>, f: Box6): Board {
  const b: Board = {
    id, name, category: role, role, boardType: "panel", materialThickness: stock.thickness, profilePlane: plane, thicknessAxis: axis, stock,
    x0: round1(f.x0), x1: round1(f.x1), y0: round1(f.y0), y1: round1(f.y1), z0: round1(f.z0), z1: round1(f.z1), source: "bunkBed",
  };
  attachFaces([b]);
  return b;
}

/** A flat (XY) board from an outline in plan, thickness z0..z1; every outline point recorded as `${id}.pv[i]`. */
function outlinedBoard(id: string, name: string, role: string, plane: "XY", axis: "Z", stock: NonNullable<Board["stock"]>, ring: Pt[], z0: number, z1: number): Board {
  const o = new Outline(`${id}.pv`, ["x", "y"]);
  for (const p of ring) o.add(lit(r3(p.u)), lit(r3(p.v)));
  const xs = o.points.map((p) => p[0]);
  const ys = o.points.map((p) => p[1]);
  const box6 = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const b: Board = {
    id, name, category: role, role, boardType: "panel", materialThickness: stock.thickness, profilePlane: plane, thicknessAxis: axis, stock,
    x0: dim(`${id}.x0`, {}, () => box6.x0, { formula: String(box6.x0) }),
    x1: dim(`${id}.x1`, {}, () => box6.x1, { formula: String(box6.x1) }),
    y0: dim(`${id}.y0`, {}, () => box6.y0, { formula: String(box6.y0) }),
    y1: dim(`${id}.y1`, {}, () => box6.y1, { formula: String(box6.y1) }),
    z0: dim(`${id}.z0`, {}, () => z0, { formula: String(z0) }),
    z1: dim(`${id}.z1`, { T: z1 }, (t) => t.T, { formula: "T" }),
    profileVector: [...o.points.map(([x, y]) => ({ x, y })), { x: o.points[0]![0], y: o.points[0]![1] }],
    tessellated: true,
    source: "bunkBed",
  };
  attachFaces([b]);
  return b;
}

/** A through opening on face A, `loop` already in board-local (u, v). */
function throughCutout(b: Board, id: string, loop: Pt[], purpose: string): void {
  const pts = loop.map((p) => [r3(p.u), r3(p.v)] as [number, number]);
  const us = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1]);
  addFeature(b, "A", { id, kind: "cutout", through: true, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), loop: pts, key: id, for: purpose });
}

/** Door stock: the colour on one big face, the carcass colour on the other (applyDoorSides repaints it for double-sided doors). */
function paintDoorStock(b: Board, face: FaceId, doorColour: string, carcassColour: string): void {
  annotate(b, face, { semantic: "outside", visible: true, finish: { colour: doorColour } });
  annotate(b, face === "A" ? "B" : "A", { semantic: "back", visible: false, finish: { colour: carcassColour } });
}

/** One piece of the front partition: XZ outline at y 0..T, the openings inside it as through cutouts on face A. */
function partitionBoard(id: string, name: string, pc: Piece, T: number, color: string, partZ0: number, partZ1: number): Board {
  const o = new Outline(`${id}.pv`, ["x", "z"]);
  for (const p of pc.outer) o.add(lit(r3(p.u)), lit(r3(p.v)));
  const xs = o.points.map((p) => p[0]);
  const zs = o.points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  const zDim = (key: string, v: number, whole: number, of: string) => (Math.abs(v - whole) < 1e-6
    ? dim(key, { v: ref(of) }, (t) => t.v, { formula: `= ${of}` })
    : dim(key, {}, () => v, { formula: String(v) }));
  const b: Board = {
    id,
    name,
    category: "partition",
    role: "front_partition",
    boardType: "panel",
    materialThickness: T,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    stock: { kind: "partition", thickness: T, colour: color },
    x0: dim(`${id}.x0`, {}, () => x0, { formula: String(x0) }),
    x1: dim(`${id}.x1`, {}, () => Math.max(...xs), { formula: String(Math.max(...xs)) }),
    y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
    y1: dim(`${id}.y1`, { T }, (t) => t.T, { formula: "T" }),
    z0: zDim(`${id}.z0`, z0, partZ0, "partition.z0"),
    z1: zDim(`${id}.z1`, z1, partZ1, "partition.z1"),
    profileVector: [...o.points.map(([x, z]) => ({ x, z })), { x: o.points[0]![0], z: o.points[0]![1] }],
    tessellated: true,
    source: "bunkBed",
  };
  attachFaces([b]);
  pc.holes.forEach((loop, i) => {
    const pts = loop.map((p) => [r3(p.u - x0), r3(p.v - z0)] as [number, number]);
    const us = pts.map((p) => p[0]);
    const vs = pts.map((p) => p[1]);
    addFeature(b, "A", { id: `${id}_HOLE_${i + 1}`, kind: "cutout", through: true, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), loop: pts, key: `${id}.hole${i}` });
  });
  annotate(b, "B", { semantic: "front", visible: true, finish: { colour: color } }); // −Y: into the room
  annotate(b, "A", { semantic: "inside", visible: true, finish: { colour: color } }); // +Y: the bunks
  return b;
}
