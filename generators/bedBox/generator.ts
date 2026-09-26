/**
 * Bed Box v1 generator — the bed base as twelve boards (see types.ts).
 *
 * The box is W (bed frame) × D (length, room end → body face) × H (boot
 * height); every board is one stock. The renderer binds W and H from the
 * Bedroom body and places the box (against the body, centred); the generator
 * only knows the three numbers and the rules.
 *
 *   plan (Y up the page = toward the body)              section at a short rail
 *
 *   body face ───────────────────────────────           ┌──── top ────┐
 *     ║ RAIL_BODY (1 off the face)          ║           │ HIGH rail   │ 100, notched
 *     ║ ┌──────────────┬──────────────┐     ║           │  from below │
 *   S ║ │ RAIL_L       │ DIVIDER      │ R   ║           │             │
 *   I ║ │  (long)      │  (notched    │ A   ║  DIVIDER  │   tongue    │  85 notch
 *   D ║ │              │   both ends) │ I   ║  ───────  │   through   │  top + bottom
 *   E ║ │              │              │ L   ║           │             │
 *     ║ └──────────────┴──────────────┘ R   ║           │ LOW rail    │ 100, notched
 *     ║ RAIL_END (against the end panel)    ║           │  from above │
 *   END ═══════════════════════════════════════ (1 wider each side)   └──── floor ──┘
 *
 * Coordinates: X left→right, Y room end (0) → body face (D), Z floor→top.
 */

import type { BedBoxParams, BedBoxResult, Board } from "./types.ts";
import { RULES as R } from "./rules.ts";
import { Outline, beginProvenance, dim, endProvenance, ex, lit, param, ref, same, type Term } from "../_lib/dim.ts";
import { annotate, attachFaces, boundaryEdgeFaces, faceRef, joint, tagEdges, type FaceId, type Joint } from "../_lib/model.ts";
import { applyMilling } from "../_lib/milling.ts";

export { RULES } from "./rules.ts";

/** Fallback only: in a job the height is the Bedroom body's `bootHeight`. */
export const BED_BOX_DEFAULT_HEIGHT = 398;
export const BED_BOX_MIN = { width: 300, depth: 300, height: 100 };

const DEFAULT_COLOR = "White Stipple";
const EPS = 1e-6;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function asNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/** Rule-driven minimum length: the two short rails, the end panel and the gap must fit with a rail between. */
export function minLength(t = R.BOARD_THICKNESS_MM.value): number {
  return round1(t + t + t + R.REAR_RAIL_GAP_MM.value + 2 * R.DIVIDER_NOTCH_DEPTH_MM.value);
}
/** Rule-driven minimum height: two rails with a divider tongue of at least 2 × undercut between them. */
export function minHeight(): number {
  return round1(2 * R.RAIL_HEIGHT_MM.value + 2 * R.DIVIDER_NOTCH_UNDERCUT_MM.value);
}

export function generateBedBox(raw: BedBoxParams): BedBoxResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const W = round1(asNum(raw.width, 0));
  const D = round1(asNum(raw.depth, R.LENGTH_DEFAULT_MM.value));
  const H = round1(asNum(raw.height, BED_BOX_DEFAULT_HEIGHT));
  const t = round1(asNum(raw.panelThickness, R.BOARD_THICKNESS_MM.value));
  const fpt = round1(asNum(raw.frontPanelThickness, 0));
  const color = String(raw.carcassColor || DEFAULT_COLOR);

  if (W < BED_BOX_MIN.width) errors.push(`width must be at least ${BED_BOX_MIN.width} mm`);
  if (D < Math.max(BED_BOX_MIN.depth, minLength(t))) errors.push(`length must be at least ${Math.max(BED_BOX_MIN.depth, minLength(t))} mm`);
  if (H < Math.max(BED_BOX_MIN.height, minHeight())) errors.push(`height must be at least ${Math.max(BED_BOX_MIN.height, minHeight())} mm for two rails and the divider tongue`);
  if (t <= 0) errors.push("panelThickness must be positive");
  if (W < 6 * t + 2 * (t + R.RAIL_NOTCH_CLEARANCE_MM.value)) errors.push("width leaves no room for the rails beside the divider");
  if (!errors.length && D < 1800) warnings.push(`bed length ${D} mm is shorter than a standard mattress`);

  beginProvenance();
  const P = param({ W, D, H, T: t });
  const boards: Board[] = [];
  const joints: Joint[] = [];

  if (!errors.length) {
    const RH = R.RAIL_HEIGHT_MM;
    const K = (b: string, f: string) => `${b}.${f}`;
    const face = (b: string, f: string, terms: Record<string, Term>, fn: (v: Record<string, number>) => number, formula?: string) =>
      dim(K(b, f), terms, fn, formula ? { formula } : {});
    const zero = (b: string, f: string) => dim(K(b, f), {}, () => 0, { formula: "0" });

    // --- END: the end panel over the side panel ends, oversize each side --------------------
    const END = board("END", "End panel", "end_panel", "XZ", "Y", t, {
      x0: face("END", "x0", { OVER: R.END_PANEL_OVERSIZE_MM }, (v) => -v.OVER),
      x1: face("END", "x1", { W: P.W, OVER: R.END_PANEL_OVERSIZE_MM }, (v) => v.W + v.OVER),
      y0: zero("END", "y0"),
      y1: face("END", "y1", { T: P.T }, (v) => v.T),
      z0: zero("END", "z0"),
      z1: face("END", "z1", { H: P.H }, (v) => v.H),
    });

    // --- SIDE_L / SIDE_R: end panel inner face → body face ---------------------------------
    const SIDE_L = board("SIDE_L", "Side panel · left", "side_panel", "YZ", "X", t, {
      x0: zero("SIDE_L", "x0"),
      x1: face("SIDE_L", "x1", { T: P.T }, (v) => v.T),
      y0: same("SIDE_L.y0", "END.y1"),
      y1: face("SIDE_L", "y1", { D: P.D }, (v) => v.D),
      z0: zero("SIDE_L", "z0"),
      z1: face("SIDE_L", "z1", { H: P.H }, (v) => v.H),
    });
    const SIDE_R = board("SIDE_R", "Side panel · right", "side_panel", "YZ", "X", t, {
      x0: face("SIDE_R", "x0", { W: P.W, T: P.T }, (v) => v.W - v.T),
      x1: face("SIDE_R", "x1", { W: P.W }, (v) => v.W),
      y0: same("SIDE_R.y0", "END.y1"),
      y1: face("SIDE_R", "y1", { D: P.D }, (v) => v.D),
      z0: zero("SIDE_R", "z0"),
      z1: face("SIDE_R", "z1", { H: P.H }, (v) => v.H),
    });

    // --- DIVIDER: centred, full inner length, half-lap notches at both ends -----------------
    const DIVIDER = board("DIVIDER", "Centre divider", "divider", "YZ", "X", t, {
      x0: face("DIVIDER", "x0", { W: P.W, T: P.T }, (v) => (v.W - v.T) / 2),
      x1: face("DIVIDER", "x1", { x0: ref("DIVIDER.x0"), T: P.T }, (v) => v.x0 + v.T),
      y0: same("DIVIDER.y0", "END.y1"),
      y1: face("DIVIDER", "y1", { D: P.D }, (v) => v.D),
      z0: zero("DIVIDER", "z0"),
      z1: face("DIVIDER", "z1", { H: P.H }, (v) => v.H),
    });
    const divLen = dim("DIVIDER.len", { y1: ref("DIVIDER.y1"), y0: ref("DIVIDER.y0") }, (v) => v.y1 - v.y0);
    const notchH = dim("DIVIDER.notchH", { RH, UNDER: R.DIVIDER_NOTCH_UNDERCUT_MM }, (v) => v.RH - v.UNDER);
    {
      // Board-local (y from the end-panel end, z from the floor), counter-clockwise from the bottom edge.
      const ND = R.DIVIDER_NOTCH_DEPTH_MM;
      const L = ref("DIVIDER.len");
      const NH = ref("DIVIDER.notchH");
      const o = new Outline("DIVIDER.cut", ["y", "z"]);
      const y = {
        nd: ex({ ND }, (v) => v.ND),
        lnd: ex({ L, ND }, (v) => v.L - v.ND),
        l: ex({ L }, (v) => v.L),
        zero: lit(0),
      };
      const z = {
        zero: lit(0),
        nh: ex({ NH }, (v) => v.NH),
        hnh: ex({ H: P.H, NH }, (v) => v.H - v.NH),
        h: ex({ H: P.H }, (v) => v.H),
      };
      o.add(y.nd, z.zero).add(y.lnd, z.zero).add(y.lnd, z.nh).add(y.l, z.nh).add(y.l, z.hnh).add(y.lnd, z.hnh)
        .add(y.lnd, z.h).add(y.nd, z.h).add(y.nd, z.hnh).add(y.zero, z.hnh).add(y.zero, z.nh).add(y.nd, z.nh);
      DIVIDER.cutProfileVector = o.points.map(([py, pz]) => ({ y: round1(py), z: round1(pz) }));
    }

    // --- short rails: across the box at the end panel and 1 mm off the body face -----------
    const railZ = (id: string, high: boolean) => high
      ? { z1: face(id, "z1", { H: P.H }, (v) => v.H), z0: face(id, "z0", { z1: ref(K(id, "z1")), RH }, (v) => v.z1 - v.RH) }
      : { z0: zero(id, "z0"), z1: face(id, "z1", { RH }, (v) => v.RH) };
    const shortRail = (id: string, name: string, atEnd: boolean, high: boolean): Board => {
      const zz = railZ(id, high);
      const b = board(id, name, "short_rail", "XZ", "Y", t, {
        x0: same(K(id, "x0"), "SIDE_L.x1"),
        x1: same(K(id, "x1"), "SIDE_R.x0"),
        ...(atEnd
          ? { y0: same(K(id, "y0"), "END.y1"), y1: face(id, "y1", { y0: ref(K(id, "y0")), T: P.T }, (v) => v.y0 + v.T) }
          : { y1: face(id, "y1", { D: P.D, GAP: R.REAR_RAIL_GAP_MM }, (v) => v.D - v.GAP), y0: face(id, "y0", { y1: ref(K(id, "y1")), T: P.T }, (v) => v.y1 - v.T) }),
        z0: zz.z0,
        z1: zz.z1,
      });
      // Notch for the divider: T + clearance wide, centred on the divider, RAIL_NOTCH_DEPTH deep,
      // from the top edge of the low rail / the bottom edge of the high rail. Cabinet-frame XZ outline.
      const NW = dim(K(id, "notchW"), { T: P.T, CL: R.RAIL_NOTCH_CLEARANCE_MM }, (v) => v.T + v.CL);
      const nx0 = dim(K(id, "notch.x0"), { x0: ref("DIVIDER.x0"), x1: ref("DIVIDER.x1"), NW: ref(K(id, "notchW")) }, (v) => (v.x0 + v.x1) / 2 - v.NW / 2);
      const nx1 = dim(K(id, "notch.x1"), { nx0: ref(K(id, "notch.x0")), NW: ref(K(id, "notchW")) }, (v) => v.nx0 + v.NW);
      const o = new Outline(`${id}.pv`, ["x", "z"]);
      const X = { l: ex({ x: ref(K(id, "x0")) }, (v) => v.x), r: ex({ x: ref(K(id, "x1")) }, (v) => v.x), n0: ex({ x: ref(K(id, "notch.x0")) }, (v) => v.x), n1: ex({ x: ref(K(id, "notch.x1")) }, (v) => v.x) };
      const Z = {
        bot: ex({ z: ref(K(id, "z0")) }, (v) => v.z),
        top: ex({ z: ref(K(id, "z1")) }, (v) => v.z),
        topN: ex({ z: ref(K(id, "z1")), ND: R.RAIL_NOTCH_DEPTH_MM }, (v) => v.z - v.ND),
        botN: ex({ z: ref(K(id, "z0")), ND: R.RAIL_NOTCH_DEPTH_MM }, (v) => v.z + v.ND),
      };
      if (high) o.add(X.l, Z.bot).add(X.n0, Z.bot).add(X.n0, Z.botN).add(X.n1, Z.botN).add(X.n1, Z.bot).add(X.r, Z.bot).add(X.r, Z.top).add(X.l, Z.top);
      else o.add(X.l, Z.bot).add(X.r, Z.bot).add(X.r, Z.top).add(X.n1, Z.top).add(X.n1, Z.topN).add(X.n0, Z.topN).add(X.n0, Z.top).add(X.l, Z.top);
      b.profileVector = o.points.map(([px, pz]) => ({ x: round1(px), z: round1(pz) }));
      b.notes = [`notch ${round1(NW)} wide × ${R.RAIL_NOTCH_DEPTH_MM.value} deep at x ${round1(nx0)}–${round1(nx1)} for the divider`];
      railNotch.set(id, { x0: round1(nx0), x1: round1(nx1) });
      return b;
    };
    const railNotch = new Map<string, { x0: number; x1: number }>();
    const RAIL_END_LOW = shortRail("RAIL_END_LOW", "Short rail · end · low", true, false);
    const RAIL_END_HIGH = shortRail("RAIL_END_HIGH", "Short rail · end · high", true, true);
    const RAIL_BODY_LOW = shortRail("RAIL_BODY_LOW", "Short rail · body · low", false, false);
    const RAIL_BODY_HIGH = shortRail("RAIL_BODY_HIGH", "Short rail · body · high", false, true);

    // --- long rails: against each side panel, between the short rails ----------------------
    const longRail = (id: string, name: string, left: boolean, high: boolean): Board => {
      const zz = railZ(id, high);
      return board(id, name, "long_rail", "YZ", "X", t, {
        ...(left
          ? { x0: same(K(id, "x0"), "SIDE_L.x1"), x1: face(id, "x1", { x0: ref(K(id, "x0")), T: P.T }, (v) => v.x0 + v.T) }
          : { x1: same(K(id, "x1"), "SIDE_R.x0"), x0: face(id, "x0", { x1: ref(K(id, "x1")), T: P.T }, (v) => v.x1 - v.T) }),
        y0: same(K(id, "y0"), "RAIL_END_LOW.y1"),
        y1: same(K(id, "y1"), "RAIL_BODY_LOW.y0"),
        z0: zz.z0,
        z1: zz.z1,
      });
    };
    const RAIL_L_LOW = longRail("RAIL_L_LOW", "Long rail · left · low", true, false);
    const RAIL_L_HIGH = longRail("RAIL_L_HIGH", "Long rail · left · high", true, true);
    const RAIL_R_LOW = longRail("RAIL_R_LOW", "Long rail · right · low", false, false);
    const RAIL_R_HIGH = longRail("RAIL_R_HIGH", "Long rail · right · high", false, true);

    boards.push(SIDE_L, SIDE_R, END, DIVIDER, RAIL_L_LOW, RAIL_L_HIGH, RAIL_R_LOW, RAIL_R_HIGH, RAIL_END_LOW, RAIL_END_HIGH, RAIL_BODY_LOW, RAIL_BODY_HIGH);

    // --- faces ------------------------------------------------------------------------------
    attachFaces(boards);
    for (const b of boards) {
      b.role = b.category;
      b.stock = { kind: "carcass", thickness: b.materialThickness, colour: color };
    }
    annotate(END, "B", { semantic: "front", visible: true, finish: { colour: color } }); // −Y: into the room
    annotate(END, "A", { semantic: "inside", visible: false });
    annotate(SIDE_L, "B", { semantic: "outside", visible: true, finish: { colour: color } }); // −X
    annotate(SIDE_L, "A", { semantic: "inside", visible: false });
    annotate(SIDE_R, "A", { semantic: "outside", visible: true, finish: { colour: color } }); // +X
    annotate(SIDE_R, "B", { semantic: "inside", visible: false });
    for (const b of [DIVIDER, RAIL_L_LOW, RAIL_L_HIGH, RAIL_R_LOW, RAIL_R_HIGH, RAIL_END_LOW, RAIL_END_HIGH, RAIL_BODY_LOW, RAIL_BODY_HIGH]) {
      annotate(b, "A", { visible: false });
      annotate(b, "B", { visible: false });
    }

    // Divider end notches: tag the outline edges inside each notch rectangle (board-local y, z).
    const L = divLen;
    const ND = R.DIVIDER_NOTCH_DEPTH_MM.value;
    const notchBoxes = [
      { id: "DIVIDER_NOTCH_END_LOW", for: "RAIL_END_LOW", u0: -EPS, u1: ND + EPS, v0: -EPS, v1: notchH + EPS },
      { id: "DIVIDER_NOTCH_END_HIGH", for: "RAIL_END_HIGH", u0: -EPS, u1: ND + EPS, v0: H - notchH - EPS, v1: H + EPS },
      { id: "DIVIDER_NOTCH_BODY_LOW", for: "RAIL_BODY_LOW", u0: L - ND - EPS, u1: L + EPS, v0: -EPS, v1: notchH + EPS },
      { id: "DIVIDER_NOTCH_BODY_HIGH", for: "RAIL_BODY_HIGH", u0: L - ND - EPS, u1: L + EPS, v0: H - notchH - EPS, v1: H + EPS },
    ];
    const dividerTags: Record<string, FaceId[]> = {};
    for (const nb of notchBoxes) {
      dividerTags[nb.for] = tagEdges(DIVIDER, "notch", nb, { id: nb.id, for: nb.for, key: "DIVIDER.cut", source: "bedBox.halfLap" });
    }
    // Short-rail notches: tag their outline edges (board-local x, z) and join to the divider.
    for (const rail of [RAIL_END_LOW, RAIL_END_HIGH, RAIL_BODY_LOW, RAIL_BODY_HIGH]) {
      const high = rail.z0 > EPS;
      const n = railNotch.get(rail.id)!;
      const nx0 = n.x0 - rail.x0;
      const nw = n.x1 - n.x0;
      const nd = R.RAIL_NOTCH_DEPTH_MM.value;
      const rh = rail.z1 - rail.z0;
      const box = high ? { u0: nx0 - EPS, u1: nx0 + nw + EPS, v0: -EPS, v1: nd + EPS } : { u0: nx0 - EPS, u1: nx0 + nw + EPS, v0: rh - nd - EPS, v1: rh + EPS };
      const railTags = tagEdges(rail, "notch", box, { id: `${rail.id}_NOTCH`, for: "DIVIDER", key: `${rail.id}.pv`, source: "bedBox.halfLap" });
      joints.push(joint(`${rail.id}_halflap`, "half_lap", faceRef("DIVIDER", dividerTags[rail.id] ?? []), faceRef(rail.id, railTags), { hardware: [], rule: "bed_box_half_lap_v1" }));
    }
    // Butt joints: side panels and divider against the end panel; rails against the panels they touch.
    const endInside = faceRef("END", ["A"]);
    for (const b of [SIDE_L, SIDE_R, DIVIDER]) joints.push(joint(`${b.id}_end`, "butt", endInside, faceRef(b.id, boundaryEdgeFaces(b, "-Y")), { hardware: [], rule: "bed_box_butt_v1" }));
    for (const [rail, side, sideFace] of [[RAIL_L_LOW, SIDE_L, "A"], [RAIL_L_HIGH, SIDE_L, "A"], [RAIL_R_LOW, SIDE_R, "B"], [RAIL_R_HIGH, SIDE_R, "B"]] as Array<[Board, Board, FaceId]>) {
      joints.push(joint(`${rail.id}_side`, "face_contact", faceRef(side.id, [sideFace]), faceRef(rail.id, [side === SIDE_L ? "B" : "A"]), { hardware: [], rule: "bed_box_rail_on_side_v1" }));
    }
    for (const rail of [RAIL_END_LOW, RAIL_END_HIGH]) joints.push(joint(`${rail.id}_end`, "face_contact", endInside, faceRef(rail.id, ["B"]), { hardware: [], rule: "bed_box_rail_on_end_v1" }));
    for (const [lr, sr] of [[RAIL_L_LOW, RAIL_END_LOW], [RAIL_R_LOW, RAIL_END_LOW], [RAIL_L_HIGH, RAIL_END_HIGH], [RAIL_R_HIGH, RAIL_END_HIGH], [RAIL_L_LOW, RAIL_BODY_LOW], [RAIL_R_LOW, RAIL_BODY_LOW], [RAIL_L_HIGH, RAIL_BODY_HIGH], [RAIL_R_HIGH, RAIL_BODY_HIGH]] as Array<[Board, Board]>) {
      const toward = sr.id.includes("END") ? "-Y" : "+Y";
      joints.push(joint(`${lr.id}_${sr.id}`, "butt", faceRef(sr.id, [toward === "-Y" ? "A" : "B"]), faceRef(lr.id, boundaryEdgeFaces(lr, toward)), { hardware: [], rule: "bed_box_rail_butt_v1" }));
    }
  }

  const provenance = endProvenance();
  const params = { width: W, depth: D, height: H, panelThickness: t, frontPanelThickness: fpt, carcassColor: color };
  const zones = errors.length ? [] : [{ id: "box" as const, x0: 0, x1: W, y0: 0, y1: D, z0: 0, z1: H }];
  const milling = applyMilling(errors.length ? [] : boards);
  return { params, zones, milling, boards: errors.length ? [] : boards, joints: errors.length ? [] : joints, features: [], validation: { errors, warnings }, debug: { boardFrame: "final", provenance } };
}

// --- helpers -----------------------------------------------------------------------

function board(
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
    boardType: category.endsWith("rail") ? "rail" : "panel",
    materialThickness: round1(materialThickness),
    profilePlane,
    thicknessAxis,
    x0: round1(f.x0), x1: round1(f.x1), y0: round1(f.y0), y1: round1(f.y1), z0: round1(f.z0), z1: round1(f.z1),
    source: "bedBox",
  };
}
