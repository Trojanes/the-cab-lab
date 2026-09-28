/**
 * 休闲柜。y=0 是房间，+Y 朝墙。
 * 一条直段：前板在靠房间的一端，两侧板从前板后面直到柜背，顶板盖住整段。
 * 顶板开口是段面正中的一半。下半层按开口挖，上半层再收进半个板厚。盖板坐在这圈台阶上。
 * L 是转角：中间段贴着柜背，侧段从所选一端转 90° 伸进房间。侧段外侧面和中间段端头齐平，侧段靠墙一端和中间段柜背齐平。RIGHT 时侧段在 +X。
 */
import { beginProvenance, dim, endProvenance, param, ref } from "../_lib/dim.ts";
import { attachFaces } from "../_lib/model.ts";
import { applyDoorSides, doorColourOf } from "../_lib/finish.ts";
import { applyMilling } from "../_lib/milling.ts";
import { recordBoardBox } from "../_lib/recordBox.ts";
import { buildLoungeFaces } from "./faces.ts";
import type {
  Board, Joint, LoungeGroove, LoungeHinge, LoungeLid, LoungeLock,
  LoungeOpening, LoungeParams, LoungeResult, LoungeStyle,
} from "./types.ts";
import { RULES as R } from "./rules.ts";
export {
  loungeFootprintBoxes,
  loungeFromDrawnRun,
  loungeFromPolyline,
  loungePolyline,
  pointInFootprintBoxes,
} from "./place.ts";
export { generateLoungeSvgPreview } from "./svgPreview.ts";

const asNum = (v: unknown, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const r2 = (v: number) => Math.round(v * 1000) / 1000;
/** Door-stock boards: the room face takes the door colour. */
const FRONT_TYPES = new Set(["front", "cabinet_door", "drawer_front", "fixed_front"]);

function mkBoard(
  id: string, name: string, boardType: string, thickness: number,
  plane: "XY" | "XZ" | "YZ", axis: "X" | "Y" | "Z",
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
  profileVector?: Board["profileVector"],
): Board {
  const box = recordBoardBox(id, r2(x0), r2(x1), r2(y0), r2(y1), r2(z0), r2(z1));
  return {
    id, name,
    category: FRONT_TYPES.has(boardType) ? "front_panel" : boardType,
    boardType,
    materialThickness: thickness, profilePlane: plane, thicknessAxis: axis,
    stock: { kind: "partition", thickness },
    ...box,
    profileVector,
  };
}

function openingAndLid(
  id: string, x0: number, y0: number, W: number, D: number, z0: number, z1: number, ppt: number,
  lidOn: boolean, boards: Board[], openings: LoungeOpening[], lids: LoungeLid[],
) {
  const ox = r2(x0 + W / 4), oy = r2(y0 + D / 4);
  const ow = r2(W / 2), od = r2(D / 2);
  openings.push({ id: `${id}_opening`, x0: ox, y0: oy, width: ow, depth: od });
  const top = boards.find((board) => board.id === `${id}_top`);
  const rad = R.OPENING_RADIUS.value;
  const step = r2(ppt / 2);
  const holeX0 = ox, holeY0 = oy, holeX1 = r2(ox + ow), holeY1 = r2(oy + od);
  if (top) {
    top.profileVector = [
      { x: top.x0, y: top.y0 }, { x: top.x1, y: top.y0 }, { x: top.x1, y: top.y1 },
      { x: top.x0, y: top.y1 }, { x: top.x0, y: top.y0 },
    ];
    const mouth = roundedLoop(holeX0, holeY0, holeX1, holeY1, rad, true);
    const through = roundedLoop(r2(holeX0 + step), r2(holeY0 + step), r2(holeX1 - step), r2(holeY1 - step), r2(rad - step), true);
    top.profileHoles = [through];
    const seat = r2(top.z0 + step);
    top.slabs = [
      { outline: top.profileVector, holes: [mouth], z0: top.z0, z1: seat },
      { outline: top.profileVector, holes: [through], z0: seat, z1: top.z1 },
    ];
  }
  if (!lidOn) return;
  const c = R.LID_CLEARANCE_EACH_SIDE.value;
  lids.push({
    id: `${id}_lid`, x0: r2(ox + c), y0: r2(oy + c),
    width: r2(ow - 2 * c), depth: r2(od - 2 * c),
    holeDiameter: R.FINGER_HOLE_DIAMETER.value,
  });
  const lid = mkBoard(`${id}_lid`, "Lid", "lid", ppt, "XY", "Z",
    ox + c, ox + ow - c, oy + c, oy + od - c, z0, z1);
  const lidRad = r2(rad - c);
  const finger = circleHole((lid.x0 + lid.x1) / 2, (lid.y0 + lid.y1) / 2, R.FINGER_HOLE_DIAMETER.value);
  lid.profileVector = roundedLoop(lid.x0, lid.y0, lid.x1, lid.y1, lidRad, false);
  lid.profileHoles = [finger];
  const tongue = roundedLoop(r2(lid.x0 + step), r2(lid.y0 + step), r2(lid.x1 - step), r2(lid.y1 - step), r2(lidRad - step), false);
  const seat = r2(lid.z0 + step);
  lid.slabs = [
    { outline: tongue, holes: [finger], z0: lid.z0, z1: seat },
    { outline: lid.profileVector, holes: [finger], z0: seat, z1: lid.z1 },
  ];
  boards.push(lid);
}

function arcPts(cx: number, cy: number, rad: number, a0: number, a1: number, steps = 4): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push({ x: r2(cx + rad * Math.cos(a)), y: r2(cy + rad * Math.sin(a)) });
  }
  return pts;
}

/** Closed XY loop. Outer runs counter-clockwise; a hole runs clockwise. */
function roundedLoop(x0: number, y0: number, x1: number, y1: number, rad: number, hole: boolean): { x: number; y: number }[] {
  const r = Math.max(0, Math.min(rad, (x1 - x0) / 2, (y1 - y0) / 2));
  if (r < 0.05) {
    return hole
      ? [{ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }, { x: x0, y: y0 }]
      : [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }];
  }
  const corners: Array<[number, number, number, number]> = hole
    ? [
      [x0 + r, y1 - r, Math.PI, Math.PI / 2],
      [x1 - r, y1 - r, Math.PI / 2, 0],
      [x1 - r, y0 + r, 0, -Math.PI / 2],
      [x0 + r, y0 + r, -Math.PI / 2, -Math.PI],
    ]
    : [
      [x0 + r, y0 + r, Math.PI, Math.PI * 1.5],
      [x1 - r, y0 + r, Math.PI * 1.5, Math.PI * 2],
      [x1 - r, y1 - r, 0, Math.PI * 0.5],
      [x0 + r, y1 - r, Math.PI * 0.5, Math.PI],
    ];
  return corners.flatMap(([cx, cy, a0, a1]) => arcPts(cx, cy, r, a0, a1));
}

function circleHole(cx: number, cy: number, diameter: number): { x: number; y: number }[] {
  return arcPts(cx, cy, diameter / 2, 0, -Math.PI * 2, 16);
}

function wallCutoutProfile(y0: number, y1: number, Hprime: number, AD: number, AH: number): { y: number; z: number }[] | undefined {
  const span = r2(y1 - y0);
  if (!(AD > 0 && AD < span && AH > 0 && AH < Hprime)) return undefined;
  const cut = r2(span - AD);
  return [
    { y: 0, z: 0 }, { y: cut, z: 0 }, { y: cut, z: AH }, { y: span, z: AH },
    { y: span, z: Hprime }, { y: 0, z: Hprime }, { y: 0, z: 0 },
  ];
}

function addAvoidanceCovers(
  prefix: string, x0: number, x1: number, D: number, AD: number, AH: number, ppt: number, boards: Board[],
) {
  if (!(AD > 0 && AH > ppt)) return;
  boards.push(mkBoard(`${prefix}avoidance_top`, "Avoidance Top", "avoidance_top", ppt, "XY", "Z",
    x0, x1, r2(D - AD), D, r2(AH - ppt), AH));
  boards.push(mkBoard(`${prefix}avoidance_front`, "Avoidance Front", "avoidance_front", ppt, "XZ", "Y",
    x0, x1, r2(D - AD), r2(D - AD + ppt), 0, r2(AH - ppt)));
}

/** 一条直段。前板在 y0，柜背在 y1，侧板夹在前板和柜背之间。 */
function addRun(
  ids: { key: string; front: string; left: string; right: string; top: string },
  names: { front: string; left: string; right: string; top: string },
  x0: number, x1: number, y0: number, y1: number,
  H: number, ppt: number, Hprime: number,
  lidOn: boolean, boards: Board[], openings: LoungeOpening[], lids: LoungeLid[],
  cuts?: { left?: Board["profileVector"]; right?: Board["profileVector"]; omitLeft?: boolean; omitRight?: boolean },
) {
  const frontY1 = r2(y0 + ppt);
  boards.push(mkBoard(ids.front, names.front, "front", ppt, "XZ", "Y", x0, x1, y0, frontY1, 0, Hprime));
  if (!cuts?.omitLeft) boards.push(mkBoard(ids.left, names.left, "side", ppt, "YZ", "X", x0, r2(x0 + ppt), frontY1, y1, 0, Hprime, cuts?.left));
  if (!cuts?.omitRight) boards.push(mkBoard(ids.right, names.right, "side", ppt, "YZ", "X", r2(x1 - ppt), x1, frontY1, y1, 0, Hprime, cuts?.right));
  boards.push(mkBoard(ids.top, names.top, "top_panel", ppt, "XY", "Z", x0, x1, y0, y1, H - ppt, H));
  openingAndLid(ids.key, x0, y0, r2(x1 - x0), r2(y1 - y0), H - ppt, H, ppt, lidOn, boards, openings, lids);
}

function addIRun(
  prefix: string, x0: number, x1: number, depth: number, H: number, ppt: number, Hprime: number,
  lidOn: boolean, boards: Board[], openings: LoungeOpening[], lids: LoungeLid[],
  wheel?: { AD: number; AH: number },
) {
  const cut = wheel ? wallCutoutProfile(ppt, depth, Hprime, wheel.AD, wheel.AH) : undefined;
  const key = prefix.replace(/_$/, "") || "i";
  addRun(
    { key, front: `${prefix}front`, left: `${prefix}left_side`, right: `${prefix}right_side`, top: `${prefix}top` },
    { front: "Front", left: "Left Side", right: "Right Side", top: "Top" },
    x0, x1, 0, depth, H, ppt, Hprime, lidOn, boards, openings, lids,
    { left: cut, right: cut },
  );
  if (wheel && cut) addAvoidanceCovers(prefix, x0, x1, depth, wheel.AD, wheel.AH, ppt, boards);
}

function addParallelRun(
  prefix: "left" | "right", label: "Left" | "Right",
  xStart: number, xEnd: number, D: number, H: number, ppt: number, Hprime: number,
  lidOn: boolean, boards: Board[], openings: LoungeOpening[], lids: LoungeLid[],
  wheel?: { AD: number; AH: number },
) {
  const SW = r2(xEnd - xStart);
  const isLeft = prefix === "left";
  const sideX0 = isLeft ? xEnd - ppt : xStart;
  const frontX0 = isLeft ? xStart : xStart + ppt;
  const frontX1 = isLeft ? xEnd - ppt : xEnd;
  const stripX0 = isLeft ? xStart : xEnd - ppt;
  const cut = wheel ? wallCutoutProfile(0, D, Hprime, wheel.AD, wheel.AH) : undefined;
  boards.push(mkBoard(`${prefix}_front`, `${label} Front`, "front", ppt, "XZ", "Y",
    frontX0, frontX1, 0, ppt, 0, Hprime));
  boards.push(mkBoard(`${prefix}_side`, `${label} Side`, "side", ppt, "YZ", "X",
    sideX0, r2(sideX0 + ppt), 0, D, 0, Hprime, cut));
  boards.push(mkBoard(`${prefix}_top`, `${label} Top`, "top_panel", ppt, "XY", "Z",
    xStart, xEnd, 0, D, H - ppt, H));
  openingAndLid(prefix, xStart, 0, SW, D, H - ppt, H, ppt, lidOn, boards, openings, lids);
  const stripH = R.TOP_SUPPORT_STRIP_HEIGHT.value;
  boards.push(mkBoard(`${prefix}_support_strip`, `${label} Support Strip`, "support_strip", ppt, "YZ", "X",
    stripX0, r2(stripX0 + ppt), ppt, D, r2(Hprime - stripH), Hprime));
}

function addMiddleCabinet(
  raw: LoungeParams, totalW: number, D: number,
  boards: Board[], hinges: LoungeHinge[], locks: LoungeLock[], grooves: LoungeGroove[], warnings: string[],
) {
  const mc = raw.middleCabinet ?? {};
  const CW = asNum(mc.width, R.MIDDLE_CABINET_WIDTH.value);
  const CD = asNum(mc.depth, R.MIDDLE_CABINET_DEPTH.value);
  const CH = asNum(mc.height, R.MIDDLE_CABINET_HEIGHT.value);
  const CSH = asNum(mc.startHeight, R.MIDDLE_CABINET_START_HEIGHT.value);
  const dpt = Math.max(1, asNum(mc.doorPanelThickness, R.MIDDLE_CABINET_DOOR_THICKNESS.value));
  const dc = Math.max(0, asNum(mc.doorClearance, R.MIDDLE_CABINET_DOOR_CLEARANCE.value));
  const lockStyle = mc.doorLockStyle === "NONE" ? "NONE" : "RAZOR_ROUNDED";
  const lockSide = asNum(mc.lockSideDistance, R.MIDDLE_CABINET_LOCK_SIDE.value);
  const hingeSide = asNum(mc.hingeSideDistance, R.MIDDLE_CABINET_HINGE_SIDE.value);
  const hingeEdge = asNum(mc.hingeCupCenterFromEdge, R.MIDDLE_CABINET_HINGE_FROM_EDGE.value);
  const cupD = asNum(mc.hingeCupDiameter, R.MIDDLE_CABINET_HINGE_DIAMETER.value);
  const cupDepth = Math.min(Math.max(0.5, asNum(mc.hingeCupDepth, R.MIDDLE_CABINET_HINGE_DEPTH.value)), dpt);
  const gap = totalW - asNum(raw.singleLoungeWidth, 1500) * 2;
  if (raw.wheelAvoidanceEnabled && !(CSH > asNum(raw.avoidanceHeight, R.DEFAULT_AVOIDANCE_HEIGHT.value))) {
    warnings.push("Middle cabinet start height must be greater than avoidance height.");
  }
  if (CW > Math.max(0, gap)) warnings.push("Middle cabinet width exceeds the middle gap.");
  if (CD > D) warnings.push("Middle cabinet depth exceeds lounge depth.");
  if (!(CW > 3 * dc)) warnings.push("Middle cabinet width must exceed 3 x door clearance.");
  if (!(CH > 2 * dc)) warnings.push("Middle cabinet height must exceed 2 x door clearance.");
  if (!(hingeSide * 2 < CH - 2 * dc)) warnings.push("Hinge side distance is too large for the door height.");

  const x0 = r2((totalW - CW) / 2);
  const y0 = r2(D - CD);
  const dividerDepth = Math.max(0, CD - dpt);
  const tongueWidth = dividerDepth / 2;
  const tongueDepth = dpt / 2 - 0.5;
  const dividerBodyWidth = Math.max(0, CW - 2 * dpt);
  const doorSlotWidth = Math.max(0, (CW - 3 * dc) / 2);
  const doorWidth = Math.max(0, doorSlotWidth - dpt);
  const doorHeight = Math.max(0, CH - 2 * dc - 2 * dpt);

  boards.push(mkBoard("middle_cabinet_bottom", "Middle Cabinet Bottom", "cabinet_bottom", dpt, "XY", "Z",
    x0, r2(x0 + CW), y0, D, CSH, r2(CSH + dpt)));
  boards.push(mkBoard("middle_cabinet_top", "Middle Cabinet Top", "cabinet_top", dpt, "XY", "Z",
    x0, r2(x0 + CW), y0, D, r2(CSH + CH - dpt), r2(CSH + CH)));
  const sideH = Math.max(0, CH - 2 * dpt);
  boards.push(mkBoard("middle_cabinet_left", "Middle Cabinet Left", "cabinet_side", dpt, "YZ", "X",
    x0, r2(x0 + dpt), y0, D, r2(CSH + dpt), r2(CSH + dpt + sideH)));
  boards.push(mkBoard("middle_cabinet_right", "Middle Cabinet Right", "cabinet_side", dpt, "YZ", "X",
    r2(x0 + CW - dpt), r2(x0 + CW), y0, D, r2(CSH + dpt), r2(CSH + dpt + sideH)));
  const grooveU0 = Math.max(0, CD - tongueWidth - 5);
  const grooveV0 = (CH - dpt) / 2 - dpt - 0.5;
  grooves.push({
    id: "middle_cabinet_left_groove", boardId: "middle_cabinet_left", face: "A",
    u0: grooveU0, u1: CD, v0: grooveV0, v1: grooveV0 + dpt + 1, depth: dpt / 2,
  });
  grooves.push({
    id: "middle_cabinet_right_groove", boardId: "middle_cabinet_right", face: "B",
    u0: grooveU0, u1: CD, v0: grooveV0, v1: grooveV0 + dpt + 1, depth: dpt / 2,
  });
  const dividerZ0 = CSH + (CH - dpt) / 2;
  boards.push(mkBoard("middle_cabinet_mid_divider", "Middle Cabinet Mid Horizontal Divider", "cabinet_divider", dpt, "XY", "Z",
    r2(x0 + dpt), r2(x0 + CW - dpt), r2(y0 + dpt), D, dividerZ0, r2(dividerZ0 + dpt), [
      { x: 0, y: 0 }, { x: dividerBodyWidth, y: 0 },
      { x: dividerBodyWidth, y: dividerDepth - tongueWidth },
      { x: dividerBodyWidth + tongueDepth, y: dividerDepth - tongueWidth },
      { x: dividerBodyWidth + tongueDepth, y: dividerDepth },
      { x: -tongueDepth, y: dividerDepth },
      { x: -tongueDepth, y: dividerDepth - tongueWidth },
      { x: 0, y: dividerDepth - tongueWidth }, { x: 0, y: 0 },
    ]));

  const lockCenterZ = CSH + dc + dpt + (CH - dc - 2 * dpt - R.LOCK_DROP.value);
  const addDoor = (id: string, doorX0: number, isLeft: boolean) => {
    boards.push(mkBoard(id, isLeft ? "Middle Cabinet Left Door" : "Middle Cabinet Right Door", "cabinet_door", dpt, "XZ", "Y",
      doorX0, r2(doorX0 + doorWidth), y0, r2(y0 + dpt), r2(CSH + dc + dpt), r2(CSH + dc + dpt + doorHeight)));
    const hingeX = isLeft ? doorX0 + hingeEdge : doorX0 + doorWidth - hingeEdge;
    const z0 = CSH + dc + dpt;
    hinges.push({ id: `${id}_hinge_bottom`, panelId: id, centerX: hingeX, centerZ: z0 + hingeSide, diameter: cupD, depth: cupDepth });
    hinges.push({ id: `${id}_hinge_top`, panelId: id, centerX: hingeX, centerZ: z0 + doorHeight - hingeSide, diameter: cupD, depth: cupDepth });
    if (lockStyle !== "NONE") {
      const lockX = isLeft ? doorX0 + doorWidth - lockSide : doorX0 + lockSide;
      locks.push({
        id: `${id}_lock`, panelId: id, centerX: lockX, centerZ: lockCenterZ,
        width: R.LOCK_WIDTH.value, height: R.LOCK_HEIGHT.value, radius: R.LOCK_HEIGHT.value / 2,
      });
    }
  };
  addDoor("middle_cabinet_left_door", x0 + dc + dpt, true);
  addDoor("middle_cabinet_right_door", x0 + dc + doorSlotWidth + dc, false);
}

/**
 * Frame L (21 Bunk new lounge). Built with the wing on the right, then mirrored for LEFT.
 * `d` is depth from the wall (y = back − d); x runs along the wall. Every outer panel is full height;
 * the top of each run is one lid, `FRAME_LID_GAP` clear of the panels round it and flush with their top,
 * resting at H − T on an inner frame: in the main run two end supports and two rails, in the wing two
 * side supports. One rear rail runs the whole length at the wall and drops into slots in the three
 * panels that reach the wall; the main rails drop into slots in the main supports.
 * `ft` non-null = the wing's room end is a drawer (door stock `ft`): a fixed strip from the top down
 * STRIP_REVEAL + T, the drawer front under it `FRAME_DRAWER_GAP` clear all round, and a drawer rail
 * behind the strip whose tongues sit in pockets in the two wing supports. No drawer box.
 */
function addFrameL(
  L: number, Dm: number, Dl: number, Wl: number, H: number, T: number, right: boolean, ft: number | null,
  boards: Board[], lids: LoungeLid[], locks: LoungeLock[], grooves: LoungeGroove[], errors: string[],
) {
  const c = R.FRAME_WALL_GAP.value;
  const s = R.FRAME_SLOT_CLEARANCE.value;
  const g = R.FRAME_LID_GAP.value;
  const hr = R.FRAME_INNER_RAIL_HEIGHT.value;
  const nd = R.FRAME_HALVING_NOTCH.value;
  const hg = R.FRAME_HALVING_GAP.value;
  const P = param({ L, Wl, H, T });
  const Lm = dim("lounge.frame.mainLength", { L: P.L, Wl: P.Wl }, (t) => r2(t.L - t.Wl), { formula: "L - Wl" });
  const railZ0 = dim("lounge.frame.railBottom", { H: P.H, T: P.T, hr: R.FRAME_INNER_RAIL_HEIGHT }, (t) => r2(t.H - t.T - t.hr), { formula: "H - T - FRAME_INNER_RAIL_HEIGHT" });
  const slotZ = dim("lounge.frame.slotBottom", { z: ref("lounge.frame.railBottom"), nd: R.FRAME_HALVING_NOTCH, hg: R.FRAME_HALVING_GAP }, (t) => r2(t.z + t.nd - t.hg), { formula: "railBottom + FRAME_HALVING_NOTCH - FRAME_HALVING_GAP" });
  const seat = dim("lounge.frame.lidSeat", { H: P.H, T: P.T }, (t) => r2(t.H - t.T), { formula: "H - T" });
  const slot = r2(T + s);

  if (Wl < R.L_MIN_WING_WIDTH.value) errors.push(`L: the wing is only ${Wl} wide — at least ${R.L_MIN_WING_WIDTH.value}.`);
  if (!(Lm > 3 * T + 2 * s)) errors.push(`L: the main run is only ${Lm} long.`);
  if (!(Dm > 4 * T + 3 * s + 2 * g)) errors.push(`L: the main depth ${Dm} does not fit the rear rail, both inner rails and the front.`);
  if (!(Dl > Dm)) errors.push(`L: the wing (${Dl}) must reach past the main front (${Dm}).`);
  if (!(railZ0 > 0 && slotZ < seat)) errors.push(`L: height ${H} is too low for the rails (${hr} + ${T}).`);
  const gd = R.FRAME_DRAWER_GAP.value;
  let stripZ0 = 0, frontTop = 0;
  if (ft != null) {
    const stripH = dim("lounge.frame.drawer.stripHeight", { rev: R.FRAME_DRAWER_STRIP_REVEAL, T: P.T }, (t) => r2(t.rev + t.T), { formula: "FRAME_DRAWER_STRIP_REVEAL + T" });
    stripZ0 = dim("lounge.frame.drawer.stripBottom", { H: P.H, s: ref("lounge.frame.drawer.stripHeight") }, (t) => r2(t.H - t.s), { formula: "H - stripHeight" });
    frontTop = dim("lounge.frame.drawer.frontTop", { z: ref("lounge.frame.drawer.stripBottom"), g: R.FRAME_DRAWER_GAP }, (t) => r2(t.z - t.g), { formula: "stripBottom - FRAME_DRAWER_GAP" });
    const room = r2(frontTop - gd);
    if (!(room > R.LOCK_DROP.value + R.LOCK_HEIGHT.value / 2)) {
      errors.push(`L drawer: height ${H} leaves only ${room} for the drawer front under the ${stripH} strip.`);
    }
  }
  if (errors.length) return;

  const back = Dl;
  const X = (a: number, b: number): [number, number] => (right ? [r2(a), r2(b)] : [r2(L - b), r2(L - a)]);
  const px = (x: number) => r2(right ? x : L - x);
  const Y = (d0: number, d1: number): [number, number] => [r2(back - d1), r2(back - d0)];
  const yz = (pts: [number, number][]) => [...pts, pts[0]].map(([d, z]) => ({ y: r2(back - d), z: r2(z) }));
  const xz = (pts: [number, number][]) => [...pts, pts[0]].map(([x, z]) => ({ x: px(x), z: r2(z) }));
  const push = (id: string, name: string, type: string, plane: "XY" | "XZ" | "YZ", axis: "X" | "Y" | "Z",
    x: [number, number], y: [number, number], z: [number, number], pv?: Board["profileVector"], th = T) => {
    const [x0, x1] = X(x[0], x[1]);
    const board = mkBoard(id, name, type, th, plane, axis, x0, x1, y[0], y[1], z[0], z[1], pv);
    boards.push(board);
    return board;
  };

  // Panels that reach the wall: full height, a slot for the rear rail at the wall corner.
  const atWall = r2(c + T);
  const wallPanel = (dEnd: number): [number, number][] => [[0, 0], [dEnd, 0], [dEnd, H], [atWall, H], [atWall, slotZ], [0, slotZ]];
  push("main_end", "Main End", "side", "YZ", "X", [0, T], Y(0, Dm - T), [0, H], yz(wallPanel(Dm - T)));
  push("main_front", "Main Front", "seat_front", "XZ", "Y", [0, Lm], Y(Dm - T, Dm), [0, H]);
  push("l_side", "L Side (junction)", "side", "YZ", "X", [Lm, Lm + T], Y(0, Dl), [0, H], yz(wallPanel(Dl)));
  push("l_outer_side", "L Outer Side", "side", "YZ", "X", [L - T, L], Y(0, Dl), [0, H], yz(wallPanel(Dl)));
  if (ft == null) push("l_front", "L Front", "seat_front", "XZ", "Y", [Lm + T, L - T], Y(Dl - T, Dl), [0, H]);

  // Rear rail: the whole length at the wall, halving slots over main_end, the junction side and the outer side.
  const n = railZ0 + nd;
  push("back_rail", "Rear Rail", "rear_rail", "XZ", "Y", [0, L], Y(c, c + T), [railZ0, H], xz([
    [0, H], [0, n], [slot, n], [slot, railZ0],
    [Lm - s / 2, railZ0], [Lm - s / 2, n], [Lm + T + s / 2, n], [Lm + T + s / 2, railZ0],
    [L - slot, railZ0], [L - slot, n], [L, n], [L, H],
  ]));

  // Main run: end supports against main_end and the junction side, slotted for the two rails.
  const railBackD: [number, number] = [T + 2 * c, 2 * T + 2 * c];
  const railFrontD: [number, number] = [Dm - 2 * T - c, Dm - T - c];
  const support: [number, number][] = [
    [T + c, 0], [Dm - T, 0], [Dm - T, slotZ], [railFrontD[0], slotZ], [railFrontD[0], seat],
    [railBackD[1], seat], [railBackD[1], slotZ], [T + c, slotZ],
  ];
  push("main_end_support", "Main End Support", "lid_support", "YZ", "X", [T, 2 * T], Y(T + c, Dm - T), [0, seat], yz(support));
  push("main_l_support", "Main Junction Support", "lid_support", "YZ", "X", [Lm - T, Lm], Y(T + c, Dm - T), [0, seat], yz(support));
  const rail: [number, number][] = [
    [T, n], [2 * T + s, n], [2 * T + s, railZ0], [Lm - T - s, railZ0], [Lm - T - s, n], [Lm, n], [Lm, seat], [T, seat],
  ];
  push("main_rail_back", "Main Rear Inner Rail", "lid_rail", "XZ", "Y", [T, Lm], Y(railBackD[0], railBackD[1]), [railZ0, seat], xz(rail));
  push("main_rail_front", "Main Front Inner Rail", "lid_rail", "XZ", "Y", [T, Lm], Y(railFrontD[0], railFrontD[1]), [railZ0, seat], xz(rail));

  // Wing: a support against each side, from the rear rail to the front (the front board's back face).
  const wingFront = ft == null ? T : ft;
  const supIn = push("l_support_inner", "L Inner Support", "lid_support", "YZ", "X", [Lm + T, Lm + 2 * T], Y(T + c, Dl - wingFront), [0, seat]);
  const supOut = push("l_support_outer", "L Outer Support", "lid_support", "YZ", "X", [L - 2 * T, L - T], Y(T + c, Dl - wingFront), [0, seat]);

  if (ft != null) {
    push("l_drawer_strip", "L Drawer Fixed Strip", "fixed_front", "XZ", "Y", [Lm + T, L - T], Y(Dl - ft, Dl), [stripZ0, H], undefined, ft);
    push("l_drawer_front", "L Drawer Front", "drawer_front", "XZ", "Y", [Lm + T + gd, L - T - gd], Y(Dl - ft, Dl), [gd, frontTop], undefined, ft);
    locks.push({
      id: "l_drawer_front_lock", panelId: "l_drawer_front", centerX: px((Lm + L) / 2), centerZ: r2(frontTop - R.LOCK_DROP.value),
      width: R.LOCK_WIDTH.value, height: R.LOCK_HEIGHT.value, radius: R.LOCK_HEIGHT.value / 2,
    });
    // Drawer rail behind the strip, between the supports; its rear part tongues into them.
    const tg = r2(T / 2 - R.FRAME_DRAWER_TONGUE_GAP.value);
    const xl = Lm + 2 * T, xr = L - 2 * T;
    const d1 = Dl - ft, d0 = d1 - R.FRAME_DRAWER_RAIL_DEPTH.value, dt = d1 - R.FRAME_DRAWER_RAIL_PLAIN_FRONT.value;
    const xy = (pts: [number, number][]) => [...pts, pts[0]].map(([x, d]) => ({ x: px(x), y: r2(back - d) }));
    push("l_drawer_rail", "L Drawer Rail", "drawer_rail", "XY", "Z", [xl - tg, xr + tg], Y(d0, d1), [stripZ0, stripZ0 + T], xy([
      [xl - tg, d0], [xr + tg, d0], [xr + tg, dt], [xr, dt], [xr, d1], [xl, d1], [xl, dt], [xl - tg, dt],
    ]));
    const ov = R.FRAME_DRAWER_POCKET_OVERRUN.value;
    const [py0, py1] = Y(d0 - ov, dt + ov);
    for (const [sup, faceDrawerSide] of [[supIn, right ? "A" : "B"], [supOut, right ? "B" : "A"]] as const) {
      grooves.push({
        id: `${sup.id}_drawer_rail_pocket`, boardId: sup.id, face: faceDrawerSide,
        u0: r2(py0 - sup.y0), u1: r2(py1 - sup.y0), v0: r2(stripZ0 - s / 2 - sup.z0), v1: r2(stripZ0 + T + s / 2 - sup.z0),
        depth: r2(T / 2), for: "l_drawer_rail",
      });
    }
  }

  // Lids: the whole top of each run, g clear of everything round them, flush with the panels.
  const lid = (id: string, name: string, x: [number, number], d: [number, number]) => {
    const b = push(id, name, "lid", "XY", "Z", x, Y(d[0], d[1]), [seat, H]);
    b.profileVector = [
      { x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }, { x: b.x0, y: b.y0 },
    ];
    b.profileHoles = [circleHole((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, R.FRAME_FINGER_HOLE_DIAMETER.value)];
    lids.push({ id, x0: b.x0, y0: b.y0, width: r2(b.x1 - b.x0), depth: r2(b.y1 - b.y0), holeDiameter: R.FRAME_FINGER_HOLE_DIAMETER.value });
  };
  lid("main_lid", "Main Lid", [T + g, Lm - g], [T + c + g, Dm - T - g]);
  lid("l_lid", "L Lid", [Lm + T + g, L - T - g], [T + c + g, Dl - wingFront - g]);
}

export function generateLounge(raw: LoungeParams): LoungeResult {
  beginProvenance();
  const warnings: string[] = [];
  const errors: string[] = [];
  const style: LoungeStyle = raw.style ?? "L_SHAPE";
  const H = asNum(raw.height, R.DEFAULT_HEIGHT.value);
  const ppt = Math.max(1, asNum(raw.partitionPanelThickness, R.DEFAULT_PPT.value));
  const P = param({ H, ppt });
  const Hprime = dim("lounge.panelHeight", { H: P.H, ppt: P.ppt }, (t) => t.H - t.ppt);
  const lidOn = raw.topLidEnabled !== false;
  const boards: Board[] = [];
  const openings: LoungeOpening[] = [];
  const lids: LoungeLid[] = [];
  const hinges: LoungeHinge[] = [];
  const locks: LoungeLock[] = [];
  const grooves: LoungeGroove[] = [];
  const footprint: LoungeResult["footprint"] = {};
  const AD = asNum(raw.avoidanceDepth, R.DEFAULT_AVOIDANCE_DEPTH.value);
  const AH = asNum(raw.avoidanceHeight, R.DEFAULT_AVOIDANCE_HEIGHT.value);
  const wheelOn = raw.wheelAvoidanceEnabled === true;
  const wheel = wheelOn ? { AD, AH } : undefined;

  if (H <= ppt) warnings.push("Height should be greater than panel thickness.");
  const frameL = style === "L_SHAPE" && raw.construction !== "classic";
  const lDrawer = frameL && raw.lFrontAccess === "DRAWER";
  if (raw.lFrontAccess && raw.lFrontAccess !== "NONE" && !lDrawer) {
    warnings.push(`lFrontAccess ${raw.lFrontAccess} is only built as a drawer on the frame L; ignored.`);
  }

  if (style === "I_SHAPE") {
    const W = asNum(raw.mainWidth, 2000);
    const D = asNum(raw.mainDepth, 600);
    if (!(W > 2 * ppt && D > 2 * ppt && H > ppt)) warnings.push("I-shape sizes should exceed two panel thicknesses.");
    if (wheelOn) {
      if (!(AD < D)) warnings.push("Avoidance Depth must be less than Depth.");
      if (!(AH < H - ppt)) warnings.push("Avoidance Height must be less than Height - PPT.");
    }
    footprint.i = { x0: 0, x1: W, y0: 0, y1: D };
    addIRun("i_", 0, W, D, H, ppt, Hprime, lidOn, boards, openings, lids, wheel);
  } else if (style === "U_SHAPE") {
    const W = asNum(raw.mainWidth, 2000);
    const D = asNum(raw.mainDepth, 1600);
    const runD = asNum(raw.lDepth, 600);
    if (!(runD < D && runD * 2 < W)) warnings.push("U: leg thickness must be less than the depth and half the width.");
    const backY0 = r2(D - runD);
    const midX0 = runD;
    const midX1 = r2(W - runD);
    footprint.left = { x0: 0, x1: runD, y0: 0, y1: D };
    footprint.main = { x0: midX0, x1: midX1, y0: backY0, y1: D };
    footprint.right = { x0: midX1, x1: W, y0: 0, y1: D };
    addIRun("left_", 0, runD, D, H, ppt, Hprime, lidOn, boards, openings, lids);
    addRun(
      { key: "back", front: "back_front", left: "back_left_side", right: "back_right_side", top: "back_top" },
      { front: "Front", left: "Left Side", right: "Right Side", top: "Top" },
      midX0, midX1, backY0, D, H, ppt, Hprime, lidOn, boards, openings, lids,
      { omitLeft: true, omitRight: true },
    );
    addIRun("right_", midX1, W, D, H, ppt, Hprime, lidOn, boards, openings, lids);
  } else if (style === "PARALLEL") {
    const totalW = asNum(raw.totalWidth, 4000);
    const SW = asNum(raw.singleLoungeWidth, 1500);
    const D = asNum(raw.depth, 800);
    if (totalW < 2 * SW) warnings.push("PARALLEL totalWidth < 2×singleLoungeWidth; runs overlap.");
    if (wheelOn) {
      if (!(AD < D)) warnings.push("Avoidance Depth must be less than Depth.");
      if (!(AH < H - ppt)) warnings.push("Avoidance Height must be less than Height - PPT.");
    }
    footprint.left = { x0: 0, x1: SW, y0: 0, y1: D };
    footprint.right = { x0: r2(totalW - SW), x1: totalW, y0: 0, y1: D };
    addParallelRun("left", "Left", 0, SW, D, H, ppt, Hprime, lidOn, boards, openings, lids, wheel);
    addParallelRun("right", "Right", r2(totalW - SW), totalW, D, H, ppt, Hprime, lidOn, boards, openings, lids, wheel);
    if (wheelOn) addAvoidanceCovers("parallel_", 0, totalW, D, AD, AH, ppt, boards);
    if (raw.hasMiddleCabinet) addMiddleCabinet(raw, totalW, D, boards, hinges, locks, grooves, warnings);
  } else {
    const mainW = asNum(raw.mainWidth, 2000);
    const mainD = asNum(raw.mainDepth, 600);
    const ret = asNum(raw.lWidth, 1600);
    const thick = asNum(raw.lDepth, 600);
    const right = (raw.lPosition ?? "RIGHT") !== "LEFT";
    if (frameL) {
      if (wheelOn) warnings.push("L frame: wheel arch avoidance is not in the frame lounge yet; ignored.");
      const ft = lDrawer ? Math.max(1, asNum(raw.frontPanelThickness, R.FRAME_DRAWER_FRONT_THICKNESS.value)) : null;
      const back = r2(ret);
      footprint.main = right ? { x0: 0, x1: r2(mainW - thick), y0: r2(back - mainD), y1: back } : { x0: thick, x1: mainW, y0: r2(back - mainD), y1: back };
      footprint.l = right ? { x0: r2(mainW - thick), x1: mainW, y0: 0, y1: back } : { x0: 0, x1: thick, y0: 0, y1: back };
      addFrameL(mainW, mainD, ret, thick, H, ppt, right, ft, boards, lids, locks, grooves, errors);
    } else {
    if (!(ret > mainD)) warnings.push("L: the return should extend past the middle front.");
    if (!(thick < mainW)) warnings.push("L: return thickness should be less than the back length.");
    if (wheelOn) {
      if (!(AD < Math.min(mainD, ret - ppt))) warnings.push("Avoidance Depth must be less than the middle depth and the return.");
      if (!(AH < H - ppt)) warnings.push("Avoidance Height must be less than Height - PPT.");
    }
    const back = dim("lounge.back", { ret }, (t) => t.ret);
    const mainY0 = dim("lounge.mainFront", { back: ref("lounge.back"), mainD }, (t) => t.back - t.mainD);
    const mainX0 = right ? 0 : thick;
    const mainX1 = right ? r2(mainW - thick) : mainW;
    const lX0 = right ? mainX1 : 0;
    const lX1 = right ? mainW : thick;
    footprint.main = { x0: mainX0, x1: mainX1, y0: mainY0, y1: back };
    footprint.l = { x0: lX0, x1: lX1, y0: 0, y1: back };
    addRun(
      { key: "main", front: "main_front", left: "main_left_side", right: "main_right_side", top: "main_top" },
      { front: "Main Front", left: "Main Left Side", right: "Main Right Side", top: "Main Top" },
      mainX0, mainX1, mainY0, back, H, ppt, Hprime, lidOn, boards, openings, lids,
      right ? { omitRight: true } : { omitLeft: true },
    );
    const innerOnLeft = right;
    const lCut = wheel ? wallCutoutProfile(ppt, back, Hprime, AD, AH) : undefined;
    addRun(
      {
        key: "l", front: "l_front", top: "l_top",
        left: innerOnLeft ? "l_side" : "l_outer_side",
        right: innerOnLeft ? "l_outer_side" : "l_side",
      },
      {
        front: "L Front", top: "L Top",
        left: innerOnLeft ? "L Side" : "L Outer Side",
        right: innerOnLeft ? "L Outer Side" : "L Side",
      },
      lX0, lX1, 0, back, H, ppt, Hprime, lidOn, boards, openings, lids,
      { left: innerOnLeft ? lCut : undefined, right: innerOnLeft ? undefined : lCut },
    );
    if (lCut) {
      addAvoidanceCovers("l_", lX0, lX1, back, AD, AH, ppt, boards);
      addAvoidanceCovers("main_", mainX0, mainX1, back, AD, AH, ppt, boards);
    }
    }
  }

  attachFaces(boards);
  const joints: Joint[] = buildLoungeFaces({ boards, openings, lids, hinges, locks, grooves, doorColour: doorColourOf(raw) });
  applyDoorSides(boards, raw);
  const milling = applyMilling(boards);

  return {
    params: {
      style, height: H, partitionPanelThickness: ppt, panelHeight: Hprime,
      ...(style === "L_SHAPE" ? { construction: frameL ? "frame" as const : "classic" as const } : {}),
      ...(frameL ? { lFrontAccess: lDrawer ? "DRAWER" as const : "NONE" as const } : {}),
    },
    boards, milling, openings, lids, footprint, hinges, locks, grooves, joints,
    validation: { errors, warnings },
    debug: { provenance: endProvenance(), boardFrame: "final" },
  };
}
