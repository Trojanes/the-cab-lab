/**
 * East-west bedroom boards, as Bedroom 1 is built.
 *
 * Local frame: X left → right seen from the room, Y from the room face (0)
 * to the nose (MATTRESS_DEPTH), Z up. The body (boot, wardrobe, top rails,
 * overhead) stands against the nose from y = bodyY0; the bedside cabinet and
 * the bed box stand in front of it. Fronts hang at y bodyY0 − door … bodyY0.
 */
import { dim, ref } from "../_lib/dim.ts";
import { addFeature, annotate, attachFaces, localRect, type Board, type ProfilePoint } from "../_lib/model.ts";
import { roofAt } from "../bedroom/generator.ts";
import { RULES as R } from "./rules.ts";

const EPS = 0.05;
const r1 = (v: number) => Math.round(v * 10) / 10;
const v = (rule: { value: number }) => rule.value;

export interface EastBoardInput {
  W: number;
  H: number;
  profile: Array<[number, number]>;
  wardrobe: number;
  bedX0: number;
  ohcBottom: number;
  bays: Array<{ width: number }>;
  fixedPanelTop: number;
  cpt: number;
  dpt: number;
  carcassColor: string;
  doorColor: string;
  /** LED channels on T3's top. */
  led: boolean;
}

export interface EastBoards {
  boards: Board[];
  regions: Record<string, string[]>;
  info: { t3Top: number; seat: number; uprightBack: number; doors: Array<{ x0: number; x1: number }> };
  warnings: string[];
}

type Stock = "carcass" | "door" | "bed";

function board(id: string, name: string, category: string, plane: "XY" | "XZ" | "YZ", thick: number,
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, pv?: ProfilePoint[]): Board {
  const T = plane === "XY" ? "Z" : plane === "XZ" ? "Y" : "X";
  const b: Board = {
    id, name, category, boardType: category, materialThickness: thick, profilePlane: plane, thicknessAxis: T,
    x0: r1(x0), x1: r1(x1), y0: r1(y0), y1: r1(y1), z0: r1(z0), z1: r1(z1), source: "bedroomEast",
  };
  if (pv) b.profileVector = pv.map((p) => Object.fromEntries(Object.entries(p).map(([k, n]) => [k, r1(n as number)])) as ProfilePoint);
  return b;
}

export function buildEastBoards(input: EastBoardInput): EastBoards {
  const { W, H, profile, wardrobe: ww, bedX0, ohcBottom, cpt, dpt } = input;
  const warnings: string[] = [];
  const roof = (y: number) => roofAt(profile, H, y);
  const D = v(R.MATTRESS_DEPTH_MM);
  const B0 = D - v(R.BODY_DEPTH_MM);
  const BH = v(R.BOOT_HEIGHT_MM);
  const deck = v(R.BOOT_DECK_THICKNESS_MM);
  /** Roof points from yB back to yA (descending y), both ends included. */
  const roofBack = (yA: number, yB: number): ProfilePoint[] => {
    const ys = [yB, ...profile.map(([y]) => y).filter((y) => y > yA + EPS && y < yB - EPS).sort((a, b) => b - a), yA];
    return ys.map((y) => ({ y, z: roof(y) }));
  };
  /** Local y in [lo, hi] where the roof comes down to z. */
  const yWhereRoof = (z: number, lo: number, hi: number) => {
    if (roof(hi) >= z) return hi;
    let a = lo;
    let b = hi;
    for (let i = 0; i < 40; i += 1) { const m = (a + b) / 2; if (roof(m) > z) a = m; else b = m; }
    return (a + b) / 2;
  };

  const boards: Board[] = [];
  const regions: Record<string, string[]> = { boot: [], wardrobe: [], bedside: [], bedbox: [], ohc: [] };
  const push = (region: string, b: Board, stock: Stock) => {
    b.stock = { kind: stock === "door" ? "door" : "carcass", thickness: b.materialThickness, colour: stock === "door" ? input.doorColor : input.carcassColor };
    boards.push(b);
    regions[region]!.push(b.id);
    return b;
  };

  // ---- boot ------------------------------------------------------------------------
  const deckZ0 = dim("BOOT_DECK.z0", { BH: R.BOOT_HEIGHT_MM, deck: R.BOOT_DECK_THICKNESS_MM }, (t) => t.BH - t.deck);
  push("boot", board("BOOT_DECK", "Boot deck", "boot", "XY", deck, 0, W, B0, D, deckZ0, BH), "carcass");
  push("boot", board("BOOT_BACK", "Boot back", "boot", "XZ", cpt, 0, W, D - cpt, D, 0, deckZ0), "carcass");
  push("boot", board("BOOT_FRONT", "Boot front", "boot", "XZ", cpt, 0, W, B0, B0 + cpt, 0, deckZ0), "carcass");

  // ---- wardrobe top: T1 / T2 / T3 --------------------------------------------------
  const t2Back = dim("top.T2.y1", { B0, back: R.WARDROBE_T2_BACK_MM }, (t) => t.B0 + t.back);
  const t2Front = dim("top.T2.y0", { back: ref("top.T2.y1"), t: R.WARDROBE_T2_THICKNESS_MM }, (t) => t.back - t.t);
  const t1Front = dim("top.T1.y0", { y: ref("top.T2.y0"), t: R.WARDROBE_T1_THICKNESS_MM }, (t) => t.y - t.t);
  const roofT2 = dim("top.roofAtT2", { y: ref("top.T2.y1") }, (t) => r1(roof(t.y)), { formula: "roof(T2.y1)" });
  const t3Top = dim("top.T3.z1", { roof: ref("top.roofAtT2"), h: R.WARDROBE_T2_HEIGHT_MM, cl: R.WARDROBE_T3_CLEARANCE_MM }, (t) => t.roof - t.h - t.cl);
  const seat = dim("top.seat", { top: ref("top.T3.z1"), t: R.WARDROBE_T3_THICKNESS_MM }, (t) => t.top - t.t);
  const rail0 = dim("top.rail.z0", { top: ref("top.T3.z1"), cl: R.WARDROBE_T3_CLEARANCE_MM }, (t) => t.top + t.cl);
  const lipY = dim("top.lip.y", { back: ref("top.T2.y1"), lip: R.WARDROBE_T3_LIP_MM }, (t) => t.back + t.lip);
  const tailY = dim("top.T3.tail", { lip: ref("top.lip.y"), cl: R.WARDROBE_T3_TAIL_CLEARANCE_MM }, (t) => t.lip - t.cl);
  const t3Rear = dim("top.T3.y1", { B0, d: R.WARDROBE_T3_DEPTH_MM }, (t) => t.B0 + t.d);
  const roofT1 = r1(roof(t2Front));
  push("wardrobe", board("T1", "T1 front top rail", "wardrobe_top", "XZ", v(R.WARDROBE_T1_THICKNESS_MM), 0, W, t1Front, t2Front, rail0, roofT1 + v(R.WARDROBE_T1_OVERSIZE_MM)), "door");
  push("wardrobe", board("T2", "T2 rear top rail", "wardrobe_top", "XZ", v(R.WARDROBE_T2_THICKNESS_MM), 0, W, t2Front, t2Back, rail0, roofT1), "carcass");
  /** Seat, pocket and roof: the top of every board that rises through T3. */
  const topEdge = (yEnd: number): ProfilePoint[] => [
    { y: B0, z: seat }, { y: lipY, z: seat }, { y: lipY, z: rail0 }, { y: t2Back, z: rail0 },
    ...roofBack(t2Back, yEnd).reverse(),
  ];

  // ---- wardrobe ----------------------------------------------------------------------
  const floorTop = dim("wardrobe.floor", { BH: R.BOOT_HEIGHT_MM, raise: R.WARDROBE_FLOOR_RAISE_MM }, (t) => t.BH + t.raise);
  const shelfZ0 = dim("WARD_SHELF.z0", { floor: ref("wardrobe.floor"), up: R.WARDROBE_SHELF_ABOVE_FLOOR_MM }, (t) => t.floor + t.up);
  const shelfZ1 = r1(shelfZ0 + cpt);
  const panelX0 = r1(ww - dpt);
  const tongue = r1(dpt / 2 - v(R.WARDROBE_SHELF_TONGUE_TIP_MM));
  const midY = (B0 + D) / 2;
  const tY0 = r1(midY - v(R.WARDROBE_SHELF_TONGUE_MM) / 2);
  const tY1 = r1(midY + v(R.WARDROBE_SHELF_TONGUE_MM) / 2);
  const gz = v(R.WARDROBE_SHELF_GROOVE_Z_MM);

  const panel = push("wardrobe", board("WARD_PANEL", "Wardrobe colour panel", "side_panel", "YZ", dpt, panelX0, ww, B0, D, BH, r1(roof(t2Back)), [
    { y: B0, z: BH }, { y: D, z: BH }, ...roofBack(t2Back, D),
    { y: t2Back, z: rail0 }, { y: lipY, z: rail0 }, { y: lipY, z: seat }, { y: B0, z: seat },
  ]), "door");
  const stripY1 = dim("WARD_STRIP.y1", { B0, d: R.WARDROBE_STRIP_DEPTH_MM }, (t) => t.B0 + t.d);
  const notchY0 = r1(B0 + v(R.WARDROBE_SHELF_STRIP_SETBACK_MM) - v(R.WARDROBE_STRIP_NOTCH_LEAD_MM));
  push("wardrobe", board("WARD_STRIP", "Wardrobe wall strip", "side_panel", "YZ", cpt, 0, cpt, B0, stripY1, BH, r1(roof(t2Back)), [
    { y: B0, z: BH }, { y: stripY1, z: BH }, { y: stripY1, z: shelfZ0 - gz }, { y: notchY0, z: shelfZ0 - gz },
    { y: notchY0, z: shelfZ1 + gz }, { y: stripY1, z: shelfZ1 + gz }, ...roofBack(t2Back, stripY1),
    { y: t2Back, z: rail0 }, { y: lipY, z: rail0 }, { y: lipY, z: seat }, { y: B0, z: seat },
  ]), "carcass");
  const shelfX0 = r1(cpt + v(R.WARDROBE_SHELF_STRIP_GAP_MM));
  const setY = r1(B0 + v(R.WARDROBE_SHELF_STRIP_SETBACK_MM));
  push("wardrobe", board("WARD_SHELF", "Wardrobe shelf", "shelf", "XY", cpt, 0, r1(panelX0 + tongue), B0, D, shelfZ0, shelfZ1, [
    { x: shelfX0, y: B0 }, { x: shelfX0, y: setY }, { x: 0, y: setY }, { x: 0, y: D }, { x: panelX0, y: D },
    { x: panelX0, y: tY1 }, { x: panelX0 + tongue, y: tY1 }, { x: panelX0 + tongue, y: tY0 }, { x: panelX0, y: tY0 }, { x: panelX0, y: B0 },
  ]), "carcass");
  const fixedTop = input.fixedPanelTop;
  push("wardrobe", board("WARD_FIXED_BACK", "Wardrobe fixed-panel backing", "carcass", "XZ", cpt, cpt, panelX0, B0, B0 + cpt, shelfZ1, fixedTop), "carcass");
  push("wardrobe", board("WARD_FIXED", "Wardrobe fixed panel", "front_panel", "XZ", dpt, 0, ww, B0 - dpt, B0, floorTop, fixedTop), "door");
  const doorX0 = v(R.WARDROBE_DOOR_CLEARANCE_MM);
  const door = push("wardrobe", board("WARD_DOOR", "Wardrobe door", "front_panel", "XZ", dpt, doorX0, ww, B0 - dpt, B0, fixedTop + v(R.WARDROBE_DOOR_CLEARANCE_MM), t3Top), "door");

  // ---- T3 with its notches -------------------------------------------------------------
  const cutters: Array<[number, number]> = [[0, cpt], [panelX0, ww]];

  // ---- overhead ----------------------------------------------------------------------
  const bpZ0 = dim("OHC_BP.z0", { bottom: ohcBottom, drop: R.OHC_DOOR_DROP_MM }, (t) => t.bottom + t.drop);
  const bpZ1 = r1(bpZ0 + cpt);
  const uprightBack = r1(yWhereRoof(bpZ1, B0, D));
  const bpBack = r1(Math.min(D, uprightBack + v(R.OHC_BP_OVERSIZE_MM)));
  const bp = push("ohc", board("OHC_BP", "Overhead bottom panel", "bottom_panel", "XY", cpt, ww, W, B0, bpBack, bpZ0, bpZ1), "carcass");
  const tongueH = r1(cpt / 2 - 0.5);
  const uMid = (B0 + uprightBack) / 2;
  const uT0 = r1(uMid - v(R.OHC_TONGUE_MM) / 2);
  const uT1 = r1(uMid + v(R.OHC_TONGUE_MM) / 2);
  const bounds: number[] = [];
  let acc = ww;
  for (const bay of input.bays.slice(0, -1)) { acc += bay.width; bounds.push(r1(acc)); }
  const uprights: Array<[string, number, number]> = [
    ["OHC_D0", ww, ww + cpt],
    ...bounds.map((c, i) => [`OHC_D${i + 1}`, c - cpt / 2, c + cpt / 2] as [string, number, number]),
    [`OHC_D${bounds.length + 1}`, W - cpt, W],
  ];
  for (const [id, x0, x1] of uprights) {
    push("ohc", board(id, id === "OHC_D0" ? "Overhead end panel (wardrobe side)" : x1 >= W - EPS ? "Overhead end panel (wall)" : "Overhead divider", "vertical_divider", "YZ", cpt, x0, x1, B0, uprightBack, bpZ1 - tongueH, r1(roof(t2Back)), [
      { y: uprightBack, z: bpZ1 }, { y: uT1, z: bpZ1 }, { y: uT1, z: bpZ1 - tongueH }, { y: uT0, z: bpZ1 - tongueH }, { y: uT0, z: bpZ1 }, { y: B0, z: bpZ1 },
      ...topEdge(uprightBack),
    ]), "carcass");
    cutters.push([x0, x1]);
  }
  const fillerX0 = dim("OHC_FILLER.x0", { W, f: R.OHC_FILLER_MM }, (t) => t.W - t.f);
  push("ohc", board("OHC_FILLER_BACK", "Overhead filler backing", "carcass", "XZ", cpt, fillerX0, W - cpt, B0, B0 + cpt, bpZ1, seat), "carcass");
  push("ohc", board("OHC_FILLER", "Overhead filler panel", "front_panel", "XZ", dpt, fillerX0, W, B0 - dpt, B0, ohcBottom, t3Top), "door");
  const doors: Array<{ x0: number; x1: number }> = [];
  const edges = [ww, ...bounds, fillerX0];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const x0 = i === 0 ? edges[0]! + v(R.OHC_DOOR_EDGE_GAP_MM) : edges[i]! + v(R.OHC_DOOR_GAP_MM) / 2;
    const x1 = i === edges.length - 2 ? edges[i + 1]! - v(R.OHC_DOOR_EDGE_GAP_MM) : edges[i + 1]! - v(R.OHC_DOOR_GAP_MM) / 2;
    doors.push({ x0: r1(x0), x1: r1(x1) });
    push("ohc", board(`OHC_FP${i}`, `Overhead up flap ${i + 1}`, "front_panel", "XZ", dpt, x0, x1, B0 - dpt, B0, ohcBottom, t3Top), "door");
  }

  // T3: one board wall to wall, notched from its rear edge forward to the tail for every board rising through it.
  const side = v(R.T3_NOTCH_SIDE_CLEARANCE_MM);
  const wallCl = v(R.T3_NOTCH_WALL_CLEARANCE_MM);
  const iv = cutters.map(([a, b]) => (a <= EPS ? [0, b + wallCl] : b >= W - EPS ? [a - wallCl, W] : [a - side, b + side]) as [number, number])
    .sort((p, q) => p[0] - q[0]);
  const merged: Array<[number, number]> = [];
  for (const [a, b] of iv) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + EPS) last[1] = Math.max(last[1], b); else merged.push([a, b]);
  }
  const rear: ProfilePoint[] = [];
  const desc = merged.slice().reverse();
  let x = W;
  for (const [a, b] of desc) {
    if (b >= W - EPS) rear.push({ x: W, y: tailY });
    else rear.push({ x, y: t3Rear }, { x: b, y: t3Rear }, { x: b, y: tailY });
    rear.push({ x: a, y: tailY });
    x = a;
    if (a > EPS) rear.push({ x: a, y: t3Rear });
  }
  if (x > EPS) rear.push({ x: 0, y: t3Rear });
  const t3pv = [{ x: 0, y: B0 }, { x: W, y: B0 }, ...rear];
  const dedup = t3pv.filter((p, i) => i === 0 || Math.abs(p.x - t3pv[i - 1]!.x) > EPS || Math.abs(p.y - t3pv[i - 1]!.y) > EPS);
  push("wardrobe", board("T3", "T3 top panel", "wardrobe_top", "XY", v(R.WARDROBE_T3_THICKNESS_MM), 0, W, B0, t3Rear, seat, t3Top, dedup), "carcass");

  // ---- bedside cabinet (in front of the wardrobe) --------------------------------------
  const bsY0 = dim("bedside.y0", { B0, d: R.BEDSIDE_DEPTH_MM }, (t) => t.B0 - t.d);
  const bsH = floorTop;
  const bsSideX0 = r1(ww - dpt - cpt);
  const bsMid = (bsY0 + B0) / 2;
  const bsT0 = r1(bsMid - v(R.BEDSIDE_TONGUE_MM) / 2);
  const bsT1 = r1(bsMid + v(R.BEDSIDE_TONGUE_MM) / 2);
  const bsS0 = r1(bsT0 - v(R.BEDSIDE_SLOT_END_MM));
  const bsS1 = r1(bsT1 + v(R.BEDSIDE_SLOT_END_MM));
  const center = v(R.BEDSIDE_SHELF_CENTER_MM);
  const sz = v(R.BEDSIDE_SLOT_Z_MM);
  const sideOutline: ProfilePoint[] = [
    { y: bsS1, z: bsH - cpt - 2 * sz }, { y: bsS1, z: bsH }, { y: B0, z: bsH }, { y: B0, z: 0 }, { y: bsS1, z: 0 },
    { y: bsS1, z: cpt + 2 * sz }, { y: bsS0, z: cpt + 2 * sz }, { y: bsS0, z: 0 }, { y: bsY0, z: 0 }, { y: bsY0, z: bsH },
    { y: bsS0, z: bsH }, { y: bsS0, z: bsH - cpt - 2 * sz },
  ];
  const bsSides = [
    push("bedside", board("BS_SIDE_WALL", "Bedside side (wall)", "side_panel", "YZ", cpt, 0, cpt, bsY0, B0, 0, bsH, sideOutline), "carcass"),
    push("bedside", board("BS_SIDE_BED", "Bedside side (bed)", "side_panel", "YZ", cpt, bsSideX0, bsSideX0 + cpt, bsY0, B0, 0, bsH, sideOutline), "carcass"),
  ];
  push("bedside", board("BS_SHOW", "Bedside show panel", "side_panel", "YZ", dpt, ww - dpt, ww, bsY0, B0, 0, bsH), "door");
  const shelfPv: ProfilePoint[] = [
    { x: cpt, y: bsT1 }, { x: cpt, y: B0 }, { x: bsSideX0, y: B0 }, { x: bsSideX0, y: bsT1 }, { x: bsSideX0 + cpt, y: bsT1 },
    { x: bsSideX0 + cpt, y: bsT0 }, { x: bsSideX0, y: bsT0 }, { x: bsSideX0, y: bsY0 }, { x: cpt, y: bsY0 }, { x: cpt, y: bsT0 },
    { x: 0, y: bsT0 }, { x: 0, y: bsT1 },
  ];
  push("bedside", board("BS_TOP", "Bedside top", "shelf", "XY", cpt, 0, bsSideX0 + cpt, bsY0, B0, bsH - cpt, bsH, shelfPv), "carcass");
  push("bedside", board("BS_MID", "Bedside middle shelf", "shelf", "XY", cpt, 0, bsSideX0 + cpt, bsY0, B0, center - cpt / 2, center + cpt / 2, shelfPv), "carcass");
  push("bedside", board("BS_BOT", "Bedside bottom", "shelf", "XY", cpt, 0, bsSideX0 + cpt, bsY0, B0, 0, cpt, shelfPv), "carcass");
  const fc = v(R.BEDSIDE_FRONT_CLEARANCE_MM);
  const hi = push("bedside", board("BS_FRONT_HI", "Bedside drawer front", "front_panel", "XZ", dpt, fc, ww - fc, bsY0 - dpt, bsY0, center + fc, bsH - fc), "door");
  const lo = push("bedside", board("BS_FRONT_LO", "Bedside door", "front_panel", "XZ", dpt, fc, ww - fc, bsY0 - dpt, bsY0, v(R.BEDSIDE_FRONT_BOTTOM_CLEARANCE_MM), center - fc), "door");

  // ---- bed box --------------------------------------------------------------------------
  const t = v(R.BED_BOX_THICKNESS_MM);
  const railH = r1(BH - t);
  const cx = dim("BB_SIDE_IN.x0", { x0: ref("bed.x0"), c: R.BED_BOX_CHAMFER_X_MM }, (q) => q.x0 + q.c);
  const cy = v(R.BED_BOX_CHAMFER_Y_MM);
  const divC = r1((cx + t + W - t) / 2);
  const crossings: Array<[number, number]> = [[cx, cx + t], [divC - t / 2, divC + t / 2], [W - t, W]];
  const sNb = v(R.BED_BOX_SIDE_NOTCH_BOTTOM_MM);
  const sNt = v(R.BED_BOX_SIDE_NOTCH_TOP_MM);
  const lapZ = 5;
  const nc = v(R.BED_BOX_NOTCH_CLEARANCE_MM);
  /** Rail outline (XZ): half-lap notches at every crossing side; an optional tongue at the left end. */
  const railOutline = (xStart: number, tongueLen: number): ProfilePoint[] => {
    const rb = r1(sNb + lapZ);
    const rt = r1(sNt - lapZ);
    const cr = crossings.map(([a, b]) => [Math.max(xStart, a - nc), Math.min(W, b + nc)] as [number, number]);
    const atLeft = (n0: number) => n0 <= xStart + EPS;
    const atRight = (n1: number) => n1 >= W - EPS;
    const pts: ProfilePoint[] = [];
    if (atLeft(cr[0]![0])) pts.push({ x: xStart, z: rt }, { x: xStart, z: rb });
    else if (tongueLen > 0) {
      const tz0 = r1(BH / 2 - v(R.BED_BOX_BODY_TONGUE_MM) / 2);
      const tz1 = r1(BH / 2 + v(R.BED_BOX_BODY_TONGUE_MM) / 2);
      const xb = xStart + tongueLen;
      pts.push({ x: xb, z: railH }, { x: xb, z: tz1 }, { x: xStart, z: tz1 }, { x: xStart, z: tz0 }, { x: xb, z: tz0 }, { x: xb, z: 0 });
    } else pts.push({ x: xStart, z: railH }, { x: xStart, z: 0 });
    for (const [n0, n1] of cr) {
      if (!atLeft(n0)) pts.push({ x: n0, z: 0 }, { x: n0, z: rb });
      pts.push({ x: n1, z: rb });
      if (!atRight(n1)) pts.push({ x: n1, z: 0 });
    }
    if (!atRight(cr[cr.length - 1]![1])) pts.push({ x: W, z: 0 }, { x: W, z: railH });
    for (const [n0, n1] of cr.slice().reverse()) {
      if (!atRight(n1)) pts.push({ x: n1, z: railH });
      pts.push({ x: n1, z: rt }, { x: n0, z: rt });
      if (!atLeft(n0)) pts.push({ x: n0, z: railH });
    }
    const out: ProfilePoint[] = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.x! - p.x!) < EPS && Math.abs(last.z! - p.z!) < EPS) continue;
      out.push(p);
    }
    const f = out[0]!;
    const l = out[out.length - 1]!;
    if (Math.abs(f.x! - l.x!) < EPS && Math.abs(f.z! - l.z!) < EPS) out.pop();
    return out;
  };
  const sideOutlineBB: ProfilePoint[] = [
    { y: B0, z: sNt }, { y: B0 - t - nc, z: sNt }, { y: B0 - t - nc, z: sNb }, { y: B0, z: sNb }, { y: B0, z: 0 }, { y: t, z: 0 },
    { y: t, z: sNb }, { y: 2 * t + nc, z: sNb }, { y: 2 * t + nc, z: sNt }, { y: t, z: sNt }, { y: t, z: BH }, { y: B0, z: BH },
  ];
  const relief = v(R.BED_BOX_SIDE_RELIEF_MM);
  const sideL = push("bedbox", board("BB_SIDE_L", "Bed box left side", "side_panel", "YZ", t, bedX0, bedX0 + t, cy, B0, 0, BH, [
    { y: B0, z: 0 }, { y: cy, z: 0 }, { y: cy, z: BH }, { y: B0 - relief, z: BH }, { y: B0 - relief, z: v(R.BED_BOX_SIDE_RELIEF_FROM_MM) }, { y: B0, z: v(R.BED_BOX_SIDE_RELIEF_FROM_MM) },
  ]), "bed");
  push("bedbox", board("BB_BODY", "Bed box rail at the body", "rail", "XZ", t, bedX0 + t / 2, W, B0 - t, B0, 0, railH, railOutline(bedX0 + t / 2, t / 2)), "bed");
  push("bedbox", board("BB_END", "Bed box end panel", "end_panel", "XZ", t, cx, W, 0, t, 0, BH), "bed");
  push("bedbox", board("BB_END_IN", "Bed box rail at the end", "rail", "XZ", t, cx, W, t, 2 * t, 0, railH, railOutline(cx, 0)), "bed");
  push("bedbox", board("BB_SIDE_IN", "Bed box inner side", "side_panel", "YZ", t, cx, cx + t, t, B0, 0, BH, sideOutlineBB), "bed");
  push("bedbox", board("BB_DIVIDER", "Bed box divider", "divider", "YZ", t, divC - t / 2, divC + t / 2, t, B0, 0, BH, sideOutlineBB), "bed");
  push("bedbox", board("BB_SIDE_R", "Bed box right side", "side_panel", "YZ", t, W - t, W, t, B0, 0, BH, sideOutlineBB), "bed");
  // The cut-off corner: a panel from the left side to the inner side, and a rail behind it. Drawn in plan.
  const L = Math.hypot(cx - bedX0, cy);
  const ux = (cx - bedX0) / L;
  const uy = -cy / L;
  const nx = cy / L;
  const ny = (cx - bedX0) / L;
  const P = { x: bedX0, y: cy };
  const at = (off: number, s: number) => ({ x: P.x + nx * off + ux * s, y: P.y + ny * off + uy * s });
  const chamfer = [at(0, 0), at(0, L), at(t, L), at(t, 0)];
  const bbox = (pts: Array<{ x: number; y: number }>) => [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))] as const;
  const [c0, c1, c2, c3] = bbox(chamfer);
  const chamferB = push("bedbox", board("BB_CHAMFER", "Bed box corner panel (38.9°)", "end_panel", "XY", BH, c0, c1, c2, c3, 0, BH, chamfer), "bed");
  const g = v(R.BED_BOX_CHAMFER_RAIL_GAP_MM);
  const e = v(R.BED_BOX_CHAMFER_RAIL_END_MM);
  const s0 = (bedX0 + t + e - (P.x + nx * (t + g))) / ux;
  const s1 = (cx - e - (P.x + nx * (2 * t + g))) / ux;
  const railC = [at(t + g, s0), at(t + g, s1), at(2 * t + g, s1), at(2 * t + g, s0)];
  const [d0, d1, d2, d3] = bbox(railC);
  const chamferR = push("bedbox", board("BB_CHAMFER_IN", "Bed box corner rail", "rail", "XY", railH, d0, d1, d2, d3, 0, railH, railC), "bed");
  for (const b of [chamferB, chamferR]) {
    b.materialThickness = t;
    b.stock = { kind: "carcass", thickness: t, colour: input.carcassColor };
    b.notes = [`${t} mm board standing on edge at the corner angle; drawn in plan, its sheet is length × height`];
  }

  // ---- faces and features ----------------------------------------------------------------
  attachFaces(boards);
  const colour = input.doorColor;
  for (const b of boards.filter((q) => q.category === "front_panel")) annotate(b, "B", { semantic: "front", visible: true, finish: { colour } });
  for (const id of ["WARD_PANEL", "BS_SHOW"]) annotate(boards.find((q) => q.id === id)!, "A", { semantic: "side", visible: true, finish: { colour } });
  annotate(boards.find((q) => q.id === "T1")!, "B", { semantic: "front", visible: true, finish: { colour } });

  addFeature(panel, "B", { id: "WARD_PANEL_SHELF", kind: "groove", ...localRect(panel, { y: [tY0 - v(R.WARDROBE_SHELF_GROOVE_END_MM), tY1 + v(R.WARDROBE_SHELF_GROOVE_END_MM)], z: [shelfZ0 - gz, shelfZ1 + gz] }), depth: r1(tongue + v(R.WARDROBE_SHELF_GROOVE_EXTRA_MM)), for: "WARD_SHELF", source: "bedroomEast" });

  const cup = (b: Board, id: string, u: number, vv: number, dia: number, depth: number) =>
    addFeature(b, "A", { id, kind: "hole", center: [r1(u), r1(vv)], diameter: dia, depth, for: "hinge", source: "bedroomEast" });
  const dh = door.z1 - door.z0;
  const hs = v(R.WARDROBE_HINGE_FROM_SIDE_MM);
  const he = v(R.WARDROBE_HINGE_FROM_END_MM);
  const dia = v(R.WARDROBE_HINGE_DIAMETER_MM);
  const hd = v(R.WARDROBE_HINGE_DEPTH_MM);
  cup(door, "WARD_DOOR_HINGE_1", hs, he, dia, hd);
  cup(door, "WARD_DOOR_HINGE_2", hs, dh / 2, dia, hd);
  cup(door, "WARD_DOOR_HINGE_3", hs, dh - he, dia, hd);
  /** Lock slot: a through stadium, `w` across and `h` up overall; the short ends are half circles. */
  const lock = (b: Board, id: string, cu: number, cv: number, w: number, h: number) =>
    addFeature(b, "A", { id, kind: "cutout", u0: r1(cu - w / 2), u1: r1(cu + w / 2), v0: r1(cv - h / 2), v1: r1(cv + h / 2), radius: r1(Math.min(w, h) / 2), through: true, for: "lock", source: "bedroomEast" });
  lock(door, "WARD_DOOR_LOCK", ww - v(R.WARDROBE_LOCK_FROM_EDGE_MM) - door.x0, dh / 2, v(R.WARDROBE_LOCK_WIDTH_MM), v(R.WARDROBE_LOCK_LENGTH_MM));
  for (const fp of boards.filter((q) => q.id.startsWith("OHC_FP"))) {
    const w = fp.x1 - fp.x0;
    const hz = fp.z1 - fp.z0 - v(R.OHC_HINGE_FROM_TOP_MM);
    cup(fp, `${fp.id}_HINGE_1`, v(R.OHC_HINGE_FROM_SIDE_MM), hz, dia, hd);
    cup(fp, `${fp.id}_HINGE_2`, w - v(R.OHC_HINGE_FROM_SIDE_MM), hz, dia, hd);
  }
  for (const [id, x0, x1] of uprights) {
    const gx0 = Math.max(bp.x0, x0 - v(R.OHC_GROOVE_CLEARANCE_MM) / 2);
    const gx1 = Math.min(bp.x1, x1 + v(R.OHC_GROOVE_CLEARANCE_MM) / 2);
    addFeature(bp, "A", { id: `OHC_BP_${id}`, kind: "groove", ...localRect(bp, { x: [gx0, gx1], y: [uT0 - v(R.OHC_GROOVE_END_MM), uT1 + v(R.OHC_GROOVE_END_MM)] }), depth: r1(tongueH + v(R.OHC_GROOVE_EXTRA_MM)), for: id, source: "bedroomEast" });
  }
  if (input.led) {
    const t3 = boards.find((q) => q.id === "T3")!;
    const m0 = r1(B0 + v(R.LED_MAIN_FROM_FACE_MM));
    const m1 = r1(m0 + v(R.LED_MAIN_WIDTH_MM));
    const depth = v(R.LED_DEPTH_MM);
    addFeature(t3, "A", { id: "T3_LED_MAIN", kind: "tgroove", ...localRect(t3, { x: [0, W], y: [m0, m1] }), depth, for: "led", source: "bedroomEast" });
    const bw = v(R.LED_BRANCH_WIDTH_MM);
    for (const [id, c] of [["T3_LED_BRANCH_1", v(R.LED_BRANCH_LEFT_MM)], ["T3_LED_BRANCH_2", W - v(R.LED_BRANCH_RIGHT_MM)]] as const) {
      addFeature(t3, "A", { id, kind: "tgroove", ...localRect(t3, { x: [c - bw / 2, c + bw / 2], y: [m1, t3.y1] }), depth, for: "led", source: "bedroomEast" });
    }
  }
  for (const s of bsSides) {
    addFeature(s, "A", { id: `${s.id}_SLOT_MID`, kind: "cutout", ...localRect(s, { y: [bsS0, bsS1], z: [center - cpt / 2 - sz, center + cpt / 2 + sz] }), through: true, for: "BS_MID", source: "bedroomEast" });
  }
  const lw = v(R.BEDSIDE_LOCK_LENGTH_MM);
  const lh = v(R.BEDSIDE_LOCK_WIDTH_MM);
  const lt = v(R.BEDSIDE_LOCK_FROM_TOP_MM);
  lock(hi, "BS_FRONT_HI_LOCK", (hi.x1 - hi.x0) / 2, hi.z1 - hi.z0 - lt, lw, lh);
  lock(lo, "BS_FRONT_LO_LOCK", lo.x1 - lo.x0 - v(R.BEDSIDE_LOCK_FROM_EDGE_MM), lo.z1 - lo.z0 - lt, lw, lh);
  cup(lo, "BS_FRONT_LO_HINGE_1", hs, v(R.BEDSIDE_HINGE_FROM_BOTTOM_MM), dia, v(R.BEDSIDE_HINGE_DEPTH_MM));
  cup(lo, "BS_FRONT_LO_HINGE_2", hs, lo.z1 - lo.z0 - v(R.BEDSIDE_HINGE_FROM_TOP_MM), dia, v(R.BEDSIDE_HINGE_DEPTH_MM));
  const ge = v(R.BED_BOX_GROOVE_END_MM);
  addFeature(sideL, "A", { id: "BB_SIDE_L_BODY", kind: "groove", ...localRect(sideL, { y: [B0 - t - nc, B0], z: [BH / 2 - v(R.BED_BOX_BODY_TONGUE_MM) / 2 - ge, BH / 2 + v(R.BED_BOX_BODY_TONGUE_MM) / 2 + ge] }), depth: r1(t / 2 + 0.5), for: "BB_BODY", source: "bedroomEast" });

  if (roof(D) <= BH + EPS) warnings.push("the roof comes down to the boot deck at the nose");
  return { boards, regions, info: { t3Top, seat, uprightBack, doors }, warnings };
}
