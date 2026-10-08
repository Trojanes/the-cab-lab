/**
 * 休闲柜。y=0 是房间，+Y 朝墙。
 * 一条直段：前板在靠房间的一端，两侧板从前板后面直到柜背，顶板盖住整段。
 * 顶板开口是段面正中的一半。下半层按开口挖，上半层再收进半个板厚。盖板坐在这圈台阶上。
 * L 是转角：中间段贴着柜背，侧段从所选一端转 90° 伸进房间。侧段外侧面和中间段端头齐平，侧段靠墙一端和中间段柜背齐平。RIGHT 时侧段在 +X。
 */
import { beginProvenance, dim, endProvenance, lit, param, ref } from "../_lib/dim.ts";
import { applyLayoutDraft } from "../_lib/layout.ts";
import { LAYOUT } from "./layout.ts";
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
import { gapCovers, notchPlanArches } from "./planArch.ts";
import { SHEET_ALONG_MAX_MM, SHEET_CROSS_MAX_MM } from "../_lib/grain.ts";
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
const QUARTER = Math.tan(Math.PI / 8); // bulge of a 90° arc, counter-clockwise
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

function arcPts(cx: number, cy: number, rad: number, a0: number, a1: number, steps = 4): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push({ x: r2(cx + rad * Math.cos(a)), y: r2(cy + rad * Math.sin(a)) });
  }
  return pts;
}

function circleHole(cx: number, cy: number, diameter: number): { x: number; y: number }[] {
  return arcPts(cx, cy, diameter / 2, 0, -Math.PI * 2, 16);
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

/**
 * The middle cabinet in the gap between the two parallel runs, against the wall. An unset width is the
 * rule width, or the gap when that is narrower. `fit` takes the "wider than the gap" message (an error on
 * the frame parallel: the cabinet would stand in the seats). `standOn` non-null = the cabinet stands
 * there (frame parallel: the wheel-arch cover's top, else the floor) and `startHeight` is not used.
 * Returns the sizes it was built with.
 */
function addMiddleCabinet(
  raw: LoungeParams, totalW: number, D: number,
  boards: Board[], hinges: LoungeHinge[], locks: LoungeLock[], grooves: LoungeGroove[], warnings: string[], fit: string[],
  standOn: number | null = null,
  span: { x0: number; x1: number } | null = null,
) {
  const mc = raw.middleCabinet ?? {};
  const gap0 = span ? span.x1 - span.x0 : totalW - asNum(raw.singleLoungeWidth, 1500) * 2;
  const CW = asNum(mc.width, Math.min(R.MIDDLE_CABINET_WIDTH.value, Math.max(0, gap0)));
  const CD = asNum(mc.depth, R.MIDDLE_CABINET_DEPTH.value);
  const CH = asNum(mc.height, R.MIDDLE_CABINET_HEIGHT.value);
  const CSH = standOn ?? asNum(mc.startHeight, R.MIDDLE_CABINET_START_HEIGHT.value);
  const dpt = Math.max(1, asNum(mc.doorPanelThickness, R.MIDDLE_CABINET_DOOR_THICKNESS.value));
  const dc = Math.max(0, asNum(mc.doorClearance, R.MIDDLE_CABINET_DOOR_CLEARANCE.value));
  const lockStyle = mc.doorLockStyle === "NONE" ? "NONE" : "RAZOR_ROUNDED";
  const lockSide = asNum(mc.lockSideDistance, R.MIDDLE_CABINET_LOCK_SIDE.value);
  const hingeSide = asNum(mc.hingeSideDistance, R.MIDDLE_CABINET_HINGE_SIDE.value);
  const hingeEdge = asNum(mc.hingeCupCenterFromEdge, R.MIDDLE_CABINET_HINGE_FROM_EDGE.value);
  const cupD = asNum(mc.hingeCupDiameter, R.MIDDLE_CABINET_HINGE_DIAMETER.value);
  const cupDepth = Math.min(Math.max(0.5, asNum(mc.hingeCupDepth, R.MIDDLE_CABINET_HINGE_DEPTH.value)), dpt);
  const gap = gap0;
  if (standOn == null && raw.wheelAvoidanceEnabled && !(CSH > asNum(raw.avoidanceHeight, R.DEFAULT_AVOIDANCE_HEIGHT.value))) {
    warnings.push("Middle cabinet start height must be greater than avoidance height.");
  }
  if (CW > Math.max(0, gap)) fit.push(`Middle cabinet width ${CW} exceeds the middle gap ${Math.max(0, gap)}.`);
  if (CD > D) warnings.push("Middle cabinet depth exceeds lounge depth.");
  if (!(CW > 3 * dc)) warnings.push("Middle cabinet width must exceed 3 x door clearance.");
  if (!(CH > 2 * dc)) warnings.push("Middle cabinet height must exceed 2 x door clearance.");
  if (!(hingeSide * 2 < CH - 2 * dc)) warnings.push("Hinge side distance is too large for the door height.");

  const dvt = Math.max(1, asNum(mc.dividerThickness, R.MIDDLE_CABINET_DIVIDER_THICKNESS.value));
  const x0 = span ? r2(span.x0 + Math.max(0, gap - CW) / 2) : r2((totalW - CW) / 2);
  const y0 = r2(D - CD);
  const dividerDepth = Math.max(0, CD - dpt);
  const tongueWidth = dividerDepth / 2;
  const tongueDepth = dvt / 2 - 0.5;
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
  // The divider is carcass stock; its groove is 1 taller and half its thickness deep, the tongue 0.5 short of that.
  const grooveV0 = (CH - dvt) / 2 - dpt - 0.5;
  grooves.push({
    id: "middle_cabinet_left_groove", boardId: "middle_cabinet_left", face: "A",
    u0: grooveU0, u1: CD, v0: grooveV0, v1: grooveV0 + dvt + 1, depth: dvt / 2,
  });
  grooves.push({
    id: "middle_cabinet_right_groove", boardId: "middle_cabinet_right", face: "B",
    u0: grooveU0, u1: CD, v0: grooveV0, v1: grooveV0 + dvt + 1, depth: dvt / 2,
  });
  const dividerZ0 = CSH + (CH - dvt) / 2;
  // The box spans the tongues: an XY outline is placed with its minimum on the box, so a box that
  // stopped at the body put the whole divider tongueDepth to the right (left tongue out of its groove,
  // right one into the side).
  boards.push(mkBoard("middle_cabinet_mid_divider", "Middle Cabinet Mid Horizontal Divider", "cabinet_divider", dvt, "XY", "Z",
    r2(x0 + dpt - tongueDepth), r2(x0 + CW - dpt + tongueDepth), r2(y0 + dpt), D, dividerZ0, r2(dividerZ0 + dvt), [
      { x: 0, y: 0 }, { x: dividerBodyWidth, y: 0 },
      { x: dividerBodyWidth, y: dividerDepth - tongueWidth },
      { x: dividerBodyWidth + tongueDepth, y: dividerDepth - tongueWidth },
      { x: dividerBodyWidth + tongueDepth, y: dividerDepth },
      { x: -tongueDepth, y: dividerDepth },
      { x: -tongueDepth, y: dividerDepth - tongueWidth },
      { x: 0, y: dividerDepth - tongueWidth }, { x: 0, y: 0 },
    ]));

  // The lock base hangs under the divider: its centre LOCK_DROP below the divider's underside.
  const lockCenterZ = r2(dividerZ0 - R.LOCK_DROP.value);
  const lockFromMeeting = lockSide + R.MIDDLE_CABINET_LOCK_EXTRA.value;
  const addDoor = (id: string, doorX0: number, isLeft: boolean) => {
    boards.push(mkBoard(id, isLeft ? "Middle Cabinet Left Door" : "Middle Cabinet Right Door", "cabinet_door", dpt, "XZ", "Y",
      doorX0, r2(doorX0 + doorWidth), y0, r2(y0 + dpt), r2(CSH + dc + dpt), r2(CSH + dc + dpt + doorHeight)));
    const hingeX = isLeft ? doorX0 + hingeEdge : doorX0 + doorWidth - hingeEdge;
    const z0 = CSH + dc + dpt;
    hinges.push({ id: `${id}_hinge_bottom`, panelId: id, centerX: hingeX, centerZ: z0 + hingeSide, diameter: cupD, depth: cupDepth });
    hinges.push({ id: `${id}_hinge_top`, panelId: id, centerX: hingeX, centerZ: z0 + doorHeight - hingeSide, diameter: cupD, depth: cupDepth });
    if (lockStyle !== "NONE") {
      const lockX = isLeft ? doorX0 + doorWidth - lockFromMeeting : doorX0 + lockFromMeeting;
      locks.push({
        id: `${id}_lock`, panelId: id, centerX: lockX, centerZ: lockCenterZ,
        width: R.LOCK_WIDTH.value, height: R.LOCK_HEIGHT.value, radius: R.LOCK_HEIGHT.value / 2,
      });
    }
  };
  addDoor("middle_cabinet_left_door", x0 + dc + dpt, true);
  addDoor("middle_cabinet_right_door", x0 + dc + doorSlotWidth + dc, false);
  return { width: CW, depth: CD, height: CH, startHeight: CSH };
}

/** Frame lounge heights: the inner rails' bottom, the halving slot bottom in the supports, the lid seat. */
function frameHeights(H: number, T: number) {
  const P = param({ H, T });
  const railZ0 = dim("lounge.frame.railBottom", { H: P.H, T: P.T, hr: R.FRAME_INNER_RAIL_HEIGHT }, (t) => r2(t.H - t.T - t.hr), { formula: "H - T - FRAME_INNER_RAIL_HEIGHT" });
  const slotZ = dim("lounge.frame.slotBottom", { z: ref("lounge.frame.railBottom"), nd: R.FRAME_HALVING_NOTCH, hg: R.FRAME_HALVING_GAP }, (t) => r2(t.z + t.nd - t.hg), { formula: "railBottom + FRAME_HALVING_NOTCH - FRAME_HALVING_GAP" });
  const seat = dim("lounge.frame.lidSeat", { H: P.H, T: P.T }, (t) => r2(t.H - t.T), { formula: "H - T" });
  return { railZ0, slotZ, seat, n: r2(railZ0 + R.FRAME_HALVING_NOTCH.value) };
}

/**
 * Board builders for a frame lounge. `d` is depth from the wall (y = back − d); x runs along the wall
 * and is mirrored (x → L − x) when `right` is false.
 */
function frameKit(L: number, back: number, H: number, T: number, right: boolean, boards: Board[], lids: LoungeLid[], xShift = 0) {
  const X = (a: number, b: number): [number, number] => {
    const a2 = a + xShift, b2 = b + xShift;
    return right ? [r2(a2), r2(b2)] : [r2(L - b2), r2(L - a2)];
  };
  const px = (x: number) => {
    const s = x + xShift;
    return r2(right ? s : L - s);
  };
  const Y = (d0: number, d1: number): [number, number] => [r2(back - d1), r2(back - d0)];
  const yz = (pts: [number, number][]) => [...pts, pts[0]].map(([d, z]) => ({ y: r2(back - d), z: r2(z) }));
  const xz = (pts: [number, number][]) => [...pts, pts[0]].map(([x, z]) => ({ x: px(x), z: r2(z) }));
  const xy = (pts: [number, number][]) => [...pts, pts[0]].map(([x, d]) => ({ x: px(x), y: r2(back - d) }));
  const push = (id: string, name: string, type: string, plane: "XY" | "XZ" | "YZ", axis: "X" | "Y" | "Z",
    x: [number, number], y: [number, number], z: [number, number], pv?: Board["profileVector"], th = T) => {
    const [x0, x1] = X(x[0], x[1]);
    const board = mkBoard(id, name, type, th, plane, axis, x0, x1, y[0], y[1], z[0], z[1], pv);
    boards.push(board);
    return board;
  };
  /** A lid: flush with the top, resting on the frame at H − T, Ø finger hole in the middle. */
  const lid = (id: string, name: string, x: [number, number], d: [number, number]) => {
    const b = push(id, name, "lid", "XY", "Z", x, Y(d[0], d[1]), [r2(H - T), H]);
    b.profileVector = [
      { x: b.x0, y: b.y0 }, { x: b.x1, y: b.y0 }, { x: b.x1, y: b.y1 }, { x: b.x0, y: b.y1 }, { x: b.x0, y: b.y0 },
    ];
    b.profileHoles = [circleHole((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, R.FRAME_FINGER_HOLE_DIAMETER.value)];
    lids.push({ id, x0: b.x0, y0: b.y0, width: r2(b.x1 - b.x0), depth: r2(b.y1 - b.y0), holeDiameter: R.FRAME_FINGER_HOLE_DIAMETER.value });
  };
  /** A panel that reaches the wall: full height, a slot for the rear rail at the wall corner. */
  const wallPanel = (dEnd: number, slotZ: number): [number, number][] => {
    const atWall = r2(R.FRAME_WALL_GAP.value + T);
    return [[0, 0], [dEnd, 0], [dEnd, H], [atWall, H], [atWall, slotZ], [0, slotZ]];
  };
  return { H, X, px, Y, yz, xz, xy, push, lid, wallPanel };
}

/**
 * The inner frame of one straight run between two panels whose inner faces are at x0 and x1, the run
 * `Dm` deep from the wall: a support against each panel, a rear and a front rail dropped into slots in
 * them, and the lid(s). A run longer than FRAME_LID_MAX_LENGTH gets equal lids, FRAME_LID_GAP apart,
 * each joint over a middle support that the rails cross in halving slots.
 */
function frameRun(
  kit: ReturnType<typeof frameKit>,
  ids: { prefix: string; label: string; supportL: [string, string]; supportR: [string, string] },
  x0: number, x1: number, Dm: number, T: number, h: ReturnType<typeof frameHeights>,
) {
  const c = R.FRAME_WALL_GAP.value, s = R.FRAME_SLOT_CLEARANCE.value, g = R.FRAME_LID_GAP.value;
  const { railZ0, slotZ, seat, n } = h;
  const railBackD: [number, number] = [T + 2 * c, 2 * T + 2 * c];
  const railFrontD: [number, number] = [Dm - 2 * T - c, Dm - T - c];
  const support: [number, number][] = [
    [T + c, 0], [Dm - T, 0], [Dm - T, slotZ], [railFrontD[0], slotZ], [railFrontD[0], seat],
    [railBackD[1], seat], [railBackD[1], slotZ], [T + c, slotZ],
  ];
  const sd = kit.Y(T + c, Dm - T);
  const pushSupport = (id: string, name: string, x: [number, number]) => {
    kit.push(id, name, "lid_support", "YZ", "X", x, sd, [0, seat], kit.yz(support));
  };
  pushSupport(ids.supportL[0], ids.supportL[1], [x0, x0 + T]);
  pushSupport(ids.supportR[0], ids.supportR[1], [x1 - T, x1]);

  const a = x0 + g, b = x1 - g;
  const count = Math.max(1, Math.ceil((b - a) / R.FRAME_LID_MAX_LENGTH.value - 1e-9));
  const lidLen = (b - a - (count - 1) * g) / count;
  const mids: number[] = [];
  for (let j = 1; j < count; j++) mids.push(r2(a + j * (lidLen + g) - g / 2));
  mids.forEach((cx, j) => pushSupport(`${ids.prefix}_mid_support_${j + 1}`, `${ids.label} Middle Support ${j + 1}`, [cx - T / 2, cx + T / 2]));

  const rail: [number, number][] = [[x0, n], [x0 + T + s, n], [x0 + T + s, railZ0]];
  for (const cx of mids) rail.push([cx - T / 2 - s / 2, railZ0], [cx - T / 2 - s / 2, n], [cx + T / 2 + s / 2, n], [cx + T / 2 + s / 2, railZ0]);
  rail.push([x1 - T - s, railZ0], [x1 - T - s, n], [x1, n], [x1, seat], [x0, seat]);
  kit.push(`${ids.prefix}_rail_back`, `${ids.label} Rear Inner Rail`, "lid_rail", "XZ", "Y", [x0, x1], kit.Y(railBackD[0], railBackD[1]), [railZ0, seat], kit.xz(rail));
  kit.push(`${ids.prefix}_rail_front`, `${ids.label} Front Inner Rail`, "lid_rail", "XZ", "Y", [x0, x1], kit.Y(railFrontD[0], railFrontD[1]), [railZ0, seat], kit.xz(rail));

  const ld: [number, number] = [T + c + g, Dm - T - g];
  if (count === 1) kit.lid(`${ids.prefix}_lid`, `${ids.label} Lid`, [a, b], ld);
  else for (let j = 0; j < count; j++) {
    const l0 = a + j * (lidLen + g);
    kit.lid(`${ids.prefix}_lid_${j + 1}`, `${ids.label} Lid ${j + 1}`, [l0, l0 + lidLen], ld);
  }
}

/**
 * Frame I: the frame L's main run on its own. The front runs the whole length and covers both end
 * panels' front edges; both ends reach the wall and take the rear rail in a slot.
 */
function addFrameI(L: number, D: number, H: number, T: number, boards: Board[], lids: LoungeLid[], errors: string[]) {
  const s = R.FRAME_SLOT_CLEARANCE.value, g = R.FRAME_LID_GAP.value, c = R.FRAME_WALL_GAP.value;
  const h = frameHeights(H, T);
  if (!(L > 4 * T + 2 * s + 2 * g)) errors.push(`I: the run is only ${L} long.`);
  if (!(D > 4 * T + 3 * s + 2 * g)) errors.push(`I: the depth ${D} does not fit the rear rail, both inner rails and the front.`);
  if (!(h.railZ0 > 0 && h.slotZ < h.seat)) errors.push(`I: height ${H} is too low for the rails (${R.FRAME_INNER_RAIL_HEIGHT.value} + ${T}).`);
  if (errors.length) return;

  const kit = frameKit(L, D, H, T, true, boards, lids);
  const slot = r2(T + s);
  kit.push("i_front", "Front", "seat_front", "XZ", "Y", [0, L], kit.Y(D - T, D), [0, H]);
  kit.push("i_left_end", "Left End", "side", "YZ", "X", [0, T], kit.Y(0, D - T), [0, H], kit.yz(kit.wallPanel(D - T, h.slotZ)));
  kit.push("i_right_end", "Right End", "side", "YZ", "X", [L - T, L], kit.Y(0, D - T), [0, H], kit.yz(kit.wallPanel(D - T, h.slotZ)));
  kit.push("back_rail", "Rear Rail", "rear_rail", "XZ", "Y", [0, L], kit.Y(c, c + T), [h.railZ0, H], kit.xz([
    [0, H], [0, h.n], [slot, h.n], [slot, h.railZ0], [L - slot, h.railZ0], [L - slot, h.n], [L, h.n], [L, H],
  ]));
  frameRun(kit, { prefix: "i", label: "I", supportL: ["i_left_support", "Left End Support"], supportR: ["i_right_support", "Right End Support"] }, T, L - T, D, T, h);
}

/**
 * Frame parallel (19'6 Rear Door dinette): two runs face to face along the wall (y = D), each from its
 * outer end wall (x 0 / totalW) to a seat front facing the gap, and from the wall to the aisle (y 0).
 * Each run is built like the frame L's wing: the seat front `<side>_side` full depth, the aisle end
 * `<side>_front` between the end wall and it, a support against each side (`<side>_outer_support` on the
 * end wall, `<side>_inner_support` on the seat front) carrying the lid. The rear rail always lies on the
 * wall; its gap end sits in a half slot on the seat front's inner face (never through: it must not show
 * from the gap). With the wheel-arch cover the seat front and both supports are cut round it and the
 * rear rail comes down onto its top.
 */
function addFrameParallel(
  totalW: number, SW: number, D: number, H: number, T: number, wheel: { AD: number; AH: number } | null, ft: number | null,
  boards: Board[], lids: LoungeLid[], locks: LoungeLock[], grooves: LoungeGroove[], errors: string[],
  backs: { left: boolean; right: boolean }, back: BackPanel | null,
) {
  const s = R.FRAME_SLOT_CLEARANCE.value, g = R.FRAME_LID_GAP.value, c = R.FRAME_WALL_GAP.value;
  const h = frameHeights(H, T);
  const rearZ0 = wheel ? wheel.AH : h.railZ0;
  if (!(totalW >= 2 * SW)) errors.push(`Parallel: the total width ${totalW} is less than two runs of ${SW}.`);
  if (!(SW > 3 * T + 2 * g)) errors.push(`Parallel: the run width ${SW} does not fit both supports and the seat front.`);
  if (!(D > 3 * T + c + 2 * g)) errors.push(`Parallel: the run is only ${D} deep.`);
  if (!(h.railZ0 > 0)) errors.push(`Parallel: height ${H} is too low for the rear rail (${R.FRAME_INNER_RAIL_HEIGHT.value} + ${T}).`);
  if (wheel) {
    if (!(wheel.AD > 2 * T + c && wheel.AD < D - 2 * T)) errors.push(`Parallel: the wheel-arch depth ${wheel.AD} must lie between the rear rail and the aisle end (${2 * T + c} to ${D - 2 * T}).`);
    if (!(wheel.AH > T && wheel.AH <= h.railZ0)) errors.push(`Parallel: the wheel-arch height ${wheel.AH} leaves the rear rail under ${R.FRAME_INNER_RAIL_HEIGHT.value} + ${T} (${T} to ${h.railZ0}).`);
  }
  const dz = ft != null ? frameDrawerHeights(H, T, "Parallel", errors) : null;
  if (ft != null && wheel && !(wheel.AD < D - ft - R.FRAME_DRAWER_RAIL_DEPTH.value - R.FRAME_DRAWER_POCKET_OVERRUN.value)) {
    errors.push(`Parallel drawer: the wheel-arch depth ${wheel.AD} reaches the drawer rail.`);
  }
  if (errors.length) return;

  const seat = h.seat;
  const tg = r2(T / 2 - R.FRAME_HALF_SLOT_TONGUE_GAP.value);
  // With an aisle drawer the aisle end is door stock ft; the supports and the lid stop at its back.
  const endT = ft ?? T;
  for (const side of ["left", "right"] as const) {
    const label = side === "left" ? "Left" : "Right";
    // A back panel keeps the outer face and slides this run toward the gap by one thickness.
    const shift = backs[side] ? T : 0;
    const kit = frameKit(totalW, D, H, T, side === "left", boards, lids, shift);
    const { Y } = kit;
    const seatFront = wheel
      ? kit.yz([[0, wheel.AH], [wheel.AD, wheel.AH], [wheel.AD, 0], [D, 0], [D, H], [0, H]])
      : undefined;
    const sf = kit.push(`${side}_side`, `${label} Seat Front`, "seat_front", "YZ", "X", [SW - T, SW], Y(0, D), [0, H], seatFront);
    if (ft == null) kit.push(`${side}_front`, `${label} Aisle End`, "seat_front", "XZ", "Y", [0, SW - T], Y(D - T, D), [0, H]);
    // Rear rail on the wall, from the end wall into a half slot on the seat front.
    kit.push(`${side}_rear_rail`, `${label} Rear Rail`, "rear_rail", "XZ", "Y", [0, SW - T + tg], Y(c, c + T), [rearZ0, H]);
    const [py0, py1] = Y(c - s / 2, c + T + s / 2);
    grooves.push({
      id: `${side}_side_rear_rail_slot`, boardId: sf.id, face: side === "left" ? "B" : "A",
      u0: r2(py0 - sf.y0), u1: r2(py1 - sf.y0), v0: r2(rearZ0 - s / 2 - sf.z0), v1: r2(H - sf.z0),
      depth: r2(T / 2), for: `${side}_rear_rail`,
    });
    // Supports from the rear rail to the aisle end, cut round the wheel-arch cover.
    const support = wheel
      ? kit.yz([[T + c, wheel.AH], [wheel.AD, wheel.AH], [wheel.AD, 0], [D - endT, 0], [D - endT, seat], [T + c, seat]])
      : undefined;
    const outer = kit.push(`${side}_outer_support`, `${label} Outer Support`, "lid_support", "YZ", "X", [0, T], Y(T + c, D - endT), [0, seat], support);
    const inner = kit.push(`${side}_inner_support`, `${label} Inner Support`, "lid_support", "YZ", "X", [SW - 2 * T, SW - T], Y(T + c, D - endT), [0, seat], support);
    if (ft != null && dz) frameDrawer(kit, side, label, [0, SW - T], [outer, inner], [T, SW - 2 * T], D, T, ft, dz, locks, grooves);
    kit.lid(`${side}_lid`, `${label} Lid`, [g, SW - T - g], [T + c + g, D - endT - g]);
    if (backs[side] && back) {
      const yRoom = r2(-back.over);
      const x0 = side === "left" ? 0 : r2(totalW - T);
      const panel = mkBoard(`${side}_back`, `${label} Back Panel`, "back_panel", T, "YZ", "X", x0, r2(x0 + T), yRoom, D, 0, back.zTop, backOutline(yRoom, D, back.zTop, back.radius));
      panel.tessellated = true;
      boards.push(panel);
    }
  }
}

/** Frame drawer heights: the fixed strip's bottom (H − REVEAL − T) and the drawer front's top; an error when the lock does not fit. */
function frameDrawerHeights(H: number, T: number, label: string, errors: string[]) {
  const P = param({ H, T });
  const gd = R.FRAME_DRAWER_GAP.value;
  const stripH = dim("lounge.frame.drawer.stripHeight", { rev: R.FRAME_DRAWER_STRIP_REVEAL, T: P.T }, (t) => r2(t.rev + t.T), { formula: "FRAME_DRAWER_STRIP_REVEAL + T" });
  const stripZ0 = dim("lounge.frame.drawer.stripBottom", { H: P.H, s: ref("lounge.frame.drawer.stripHeight") }, (t) => r2(t.H - t.s), { formula: "H - stripHeight" });
  const frontTop = dim("lounge.frame.drawer.frontTop", { z: ref("lounge.frame.drawer.stripBottom"), g: R.FRAME_DRAWER_GAP }, (t) => r2(t.z - t.g), { formula: "stripBottom - FRAME_DRAWER_GAP" });
  const room = r2(frontTop - gd);
  if (!(room > R.LOCK_DROP.value + R.LOCK_HEIGHT.value / 2)) {
    errors.push(`${label} drawer: height ${H} leaves only ${room} for the drawer front under the ${stripH} strip.`);
  }
  return { stripZ0, frontTop };
}

/**
 * A frame run's room end as a drawer (no drawer box), `Dl` = that end's depth from the wall:
 * a door-stock fixed strip across `span` from the top down STRIP_REVEAL + T, the drawer front under it
 * FRAME_DRAWER_GAP inside `span` and off the floor, a lock centred LOCK_DROP under its top, and a drawer
 * rail behind the strip between the two supports' inner faces `rail`, whose rear part tongues into
 * pockets on the supports' drawer side.
 */
function frameDrawer(
  kit: ReturnType<typeof frameKit>, prefix: string, label: string, span: [number, number],
  supports: [Board, Board], rail: [number, number], Dl: number, T: number, ft: number,
  z: { stripZ0: number; frontTop: number }, locks: LoungeLock[], grooves: LoungeGroove[],
) {
  const { Y, push, px, xy } = kit;
  const gd = R.FRAME_DRAWER_GAP.value, s = R.FRAME_SLOT_CLEARANCE.value;
  const { stripZ0, frontTop } = z;
  push(`${prefix}_drawer_strip`, `${label} Drawer Fixed Strip`, "fixed_front", "XZ", "Y", span, Y(Dl - ft, Dl), [stripZ0, kit.H], undefined, ft);
  push(`${prefix}_drawer_front`, `${label} Drawer Front`, "drawer_front", "XZ", "Y", [span[0] + gd, span[1] - gd], Y(Dl - ft, Dl), [gd, frontTop], undefined, ft);
  locks.push({
    id: `${prefix}_drawer_front_lock`, panelId: `${prefix}_drawer_front`, centerX: px((span[0] + span[1]) / 2), centerZ: r2(frontTop - R.LOCK_DROP.value),
    width: R.LOCK_WIDTH.value, height: R.LOCK_HEIGHT.value, radius: R.LOCK_HEIGHT.value / 2,
  });
  const tg = r2(T / 2 - R.FRAME_DRAWER_TONGUE_GAP.value);
  const [xl, xr] = rail;
  const d1 = Dl - ft, d0 = d1 - R.FRAME_DRAWER_RAIL_DEPTH.value, dt = d1 - R.FRAME_DRAWER_RAIL_PLAIN_FRONT.value;
  push(`${prefix}_drawer_rail`, `${label} Drawer Rail`, "drawer_rail", "XY", "Z", [xl - tg, xr + tg], Y(d0, d1), [stripZ0, stripZ0 + T], xy([
    [xl - tg, d0], [xr + tg, d0], [xr + tg, dt], [xr, dt], [xr, d1], [xl, d1], [xl, dt], [xl - tg, dt],
  ]));
  const ov = R.FRAME_DRAWER_POCKET_OVERRUN.value;
  const [py0, py1] = Y(d0 - ov, dt + ov);
  const mid = px((xl + xr) / 2);
  for (const sup of supports) {
    grooves.push({
      id: `${sup.id}_drawer_rail_pocket`, boardId: sup.id, face: (sup.x0 + sup.x1) / 2 < mid ? "A" : "B",
      u0: r2(py0 - sup.y0), u1: r2(py1 - sup.y0), v0: r2(stripZ0 - s / 2 - sup.z0), v1: r2(stripZ0 + T + s / 2 - sup.z0),
      depth: r2(T / 2), for: `${prefix}_drawer_rail`,
    });
  }
}

/**
 * Back panel outline in cabinet YZ. The seat runs y = 0 (room) .. yWall. The panel continues to
 * yRoom (negative: past the room face) and up to zTop. The rounded corner is the top one at the
 * room end — the corner you walk past. The wall end stays square.
 */
function backOutline(yRoom: number, yWall: number, zTop: number, radius: number): Board["profileVector"] {
  const r = Math.max(0, Math.min(radius, (yWall - yRoom) / 2, zTop / 2));
  if (r < 0.5) {
    return [
      { y: yRoom, z: 0 }, { y: yWall, z: 0 }, { y: yWall, z: zTop }, { y: yRoom, z: zTop }, { y: yRoom, z: 0 },
    ];
  }
  return [
    { y: yRoom, z: 0 },
    { y: yWall, z: 0 },
    { y: yWall, z: zTop },
    { y: r2(yRoom + r), z: zTop, bulge: QUARTER },
    { y: yRoom, z: r2(zTop - r) },
    { y: yRoom, z: 0 },
  ];
}

interface BackPanel {
  over: number;
  zTop: number;
  radius: number;
}

/** Shared size of every back panel on this lounge. Called once, only when one is on. */
function backMetrics(raw: LoungeParams, H: number): BackPanel {
  const P = param({ H });
  const overIn = raw.backPanelOverhang == null ? R.BACK_PANEL_OVERHANG : lit(Math.max(0, asNum(raw.backPanelOverhang, 0)));
  const over = dim("lounge.back.overhang", { d: overIn }, (t) => Math.max(0, t.d), { formula: "BACK_PANEL_OVERHANG" });
  const zTop = dim("lounge.back.height", { H: P.H, above: R.BACK_PANEL_ABOVE_SEAT }, (t) => r2(t.H + t.above), { formula: "H + BACK_PANEL_ABOVE_SEAT" });
  return { over, zTop, radius: R.BACK_PANEL_CORNER_RADIUS.value };
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
 * `back` set: a tall panel occupies the outer thickness. The seating is built in 0..L−T (still
 * mirrored about the full L) so the wing moves into the main and the outer face stays at L.
 */
function addFrameL(
  L: number, Dm: number, Dl: number, Wl: number, H: number, T: number, right: boolean, ft: number | null,
  boards: Board[], lids: LoungeLid[], locks: LoungeLock[], grooves: LoungeGroove[], errors: string[],
  back: BackPanel | null = null,
) {
  const c = R.FRAME_WALL_GAP.value;
  const s = R.FRAME_SLOT_CLEARANCE.value;
  const g = R.FRAME_LID_GAP.value;
  const hr = R.FRAME_INNER_RAIL_HEIGHT.value;
  const P = param({ L, Wl, H, T });
  // The back panel takes the outer thickness; the seating ends one thickness sooner.
  const end = back ? r2(L - T) : L;
  const Lm = back
    ? dim("lounge.frame.mainLength", { L: P.L, Wl: P.Wl, T: P.T }, (t) => r2(t.L - t.Wl - t.T), { formula: "L - Wl - T" })
    : dim("lounge.frame.mainLength", { L: P.L, Wl: P.Wl }, (t) => r2(t.L - t.Wl), { formula: "L - Wl" });
  const h = frameHeights(H, T);
  const { railZ0, slotZ, seat } = h;
  const slot = r2(T + s);

  if (Wl < R.L_MIN_WING_WIDTH.value) errors.push(`L: the wing is only ${Wl} wide — at least ${R.L_MIN_WING_WIDTH.value}.`);
  if (!(Lm > 3 * T + 2 * s)) errors.push(`L: the main run is only ${Lm} long.`);
  if (!(Dm > 4 * T + 3 * s + 2 * g)) errors.push(`L: the main depth ${Dm} does not fit the rear rail, both inner rails and the front.`);
  if (!(Dl > Dm)) errors.push(`L: the wing (${Dl}) must reach past the main front (${Dm}).`);
  if (!(railZ0 > 0 && slotZ < seat)) errors.push(`L: height ${H} is too low for the rails (${hr} + ${T}).`);
  const dz = ft != null ? frameDrawerHeights(H, T, "L", errors) : null;
  if (errors.length) return;

  const wall = Dl;
  const kit = frameKit(L, wall, H, T, right, boards, lids);
  const { Y, push } = kit;

  push("main_end", "Main End", "side", "YZ", "X", [0, T], Y(0, Dm - T), [0, H], kit.yz(kit.wallPanel(Dm - T, slotZ)));
  push("main_front", "Main Front", "seat_front", "XZ", "Y", [0, Lm], Y(Dm - T, Dm), [0, H]);
  push("l_side", "L Side (junction)", "side", "YZ", "X", [Lm, Lm + T], Y(0, Dl), [0, H], kit.yz(kit.wallPanel(Dl, slotZ)));
  push("l_outer_side", "L Outer Side", "side", "YZ", "X", [end - T, end], Y(0, Dl), [0, H], kit.yz(kit.wallPanel(Dl, slotZ)));
  if (ft == null) push("l_front", "L Front", "seat_front", "XZ", "Y", [Lm + T, end - T], Y(Dl - T, Dl), [0, H]);

  // Rear rail: the seating length at the wall, halving slots over main_end, the junction side and the outer side.
  const n = h.n;
  push("back_rail", "Rear Rail", "rear_rail", "XZ", "Y", [0, end], Y(c, c + T), [railZ0, H], kit.xz([
    [0, H], [0, n], [slot, n], [slot, railZ0],
    [Lm - s / 2, railZ0], [Lm - s / 2, n], [Lm + T + s / 2, n], [Lm + T + s / 2, railZ0],
    [end - slot, railZ0], [end - slot, n], [end, n], [end, H],
  ]));

  // Main run: supports against main_end and the junction side, the two rails, the lid(s).
  frameRun(kit, { prefix: "main", label: "Main", supportL: ["main_end_support", "Main End Support"], supportR: ["main_l_support", "Main Junction Support"] }, T, Lm, Dm, T, h);

  // Wing: a support against each side, from the rear rail to the front (the front board's back face).
  const wingFront = ft == null ? T : ft;
  const supIn = push("l_support_inner", "L Inner Support", "lid_support", "YZ", "X", [Lm + T, Lm + 2 * T], Y(T + c, Dl - wingFront), [0, seat]);
  const supOut = push("l_support_outer", "L Outer Support", "lid_support", "YZ", "X", [end - 2 * T, end - T], Y(T + c, Dl - wingFront), [0, seat]);

  if (ft != null && dz) {
    frameDrawer(kit, "l", "L", [Lm + T, end - T], [supIn, supOut], [Lm + 2 * T, end - 2 * T], Dl, T, ft, dz, locks, grooves);
  }

  // Wing lid: the whole top of the wing, g clear of everything round it, flush with the panels.
  kit.lid("l_lid", "L Lid", [Lm + T + g, end - T - g], [T + c + g, Dl - wingFront - g]);

  if (back) {
    const yRoom = r2(-back.over);
    const panel = push("l_back", "Wing Back Panel", "back_panel", "YZ", "X", [end, L], [yRoom, wall], [0, back.zTop], backOutline(yRoom, wall, back.zTop, back.radius));
    panel.tessellated = true;
  }
}


/**
 * A board longer than a sheet cannot be cut: a red `generator.errors` line (the right panel only — the
 * board is not tinted in 3D). Sheet 2400 × 1200 less trim (`SHEET_ALONG_MAX_MM` × `SHEET_CROSS_MAX_MM`),
 * either way round. A run that long has to be shortened, or split like the kitchen (not built yet).
 */
function sheetLimitErrors(boards: Board[], errors: string[]): void {
  for (const b of boards) {
    const [a, c] = [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0].map((v) => Math.round(Math.abs(v) * 10) / 10).sort((m, n) => n - m);
    if (a > SHEET_ALONG_MAX_MM) errors.push(`${b.id} is ${a} long: a sheet gives at most ${SHEET_ALONG_MAX_MM} (2400 × 1200) — shorten that run.`);
    else if (c > SHEET_CROSS_MAX_MM) errors.push(`${b.id} is ${a} × ${c}: a sheet gives at most ${SHEET_ALONG_MAX_MM} × ${SHEET_CROSS_MAX_MM} (2400 × 1200).`);
  }
}
export function generateLounge(raw: LoungeParams, options: { layout?: unknown } = {}): LoungeResult {
  beginProvenance();
  const warnings: string[] = [];
  const errors: string[] = [];
  const style: LoungeStyle = raw.style ?? "L_SHAPE";
  // The classic construction (top panel with a rebated lid) and the U lounge were retired on 2026-10-08:
  // I, L and parallel are always the frame build, with the lid lying between the panels.
  if ((raw as { construction?: string }).construction === "classic") {
    warnings.push("The classic lounge construction was retired; this lounge is built as the frame construction.");
  }
  if ((style as string) === "U_SHAPE") {
    errors.push("The U-shaped lounge was retired. Draw it again as an L or I lounge.");
    endProvenance();
    return { params: { style, height: asNum(raw.height, R.DEFAULT_HEIGHT.value) }, boards: [], milling: { issues: [] }, openings: [], lids: [], footprint: {}, hinges: [], locks: [], grooves: [], joints: [], validation: { errors, warnings }, debug: { boardFrame: "final" } } as unknown as LoungeResult;
  }
  const H = asNum(raw.height, R.DEFAULT_HEIGHT.value);
  const ppt = Math.max(1, asNum(raw.partitionPanelThickness, R.DEFAULT_PPT.value));
  const P = param({ H, ppt });
  const Hprime = dim("lounge.panelHeight", { H: P.H, ppt: P.ppt }, (t) => t.H - t.ppt);
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
  const frameL = style === "L_SHAPE";
  const frameP = style === "PARALLEL";
  let middleCabinet: { width: number; depth: number; height: number; startHeight: number } | null = null;
  let backBuilt: BackPanel | null = null;
  const backFlags: { backPanel?: true; leftBackPanel?: true; rightBackPanel?: true } = {};
  const lDrawer = frameL && raw.lFrontAccess === "DRAWER";
  if (raw.lFrontAccess && raw.lFrontAccess !== "NONE" && !lDrawer) {
    warnings.push(`lFrontAccess ${raw.lFrontAccess} is only built as a drawer on the frame L; ignored.`);
  }

  if (style === "I_SHAPE") {
    const W = asNum(raw.mainWidth, 2000);
    const D = asNum(raw.mainDepth, 600);
    footprint.i = { x0: 0, x1: W, y0: 0, y1: D };
    if (wheelOn) warnings.push("I frame: wheel arch avoidance is not in the frame lounge yet; ignored.");
    addFrameI(W, D, H, ppt, boards, lids, errors);
  } else if (style === "PARALLEL") {
    const totalW = asNum(raw.totalWidth, 4000);
    const SW = asNum(raw.singleLoungeWidth, 1500);
    const D = asNum(raw.depth, 800);
    if (totalW < 2 * SW) warnings.push("PARALLEL totalWidth < 2×singleLoungeWidth; runs overlap.");
    if (wheelOn) {
      if (!(AD < D)) warnings.push("Avoidance Depth must be less than Depth.");
      if (!(AH < H - ppt)) warnings.push("Avoidance Height must be less than Height - PPT.");
    }
    const leftOn = raw.leftBackPanel === true;
    const rightOn = raw.rightBackPanel === true;
    if (leftOn || rightOn) backBuilt = backMetrics(raw, H);
    if (leftOn) backFlags.leftBackPanel = true;
    if (rightOn) backFlags.rightBackPanel = true;
    const leftInner = r2(SW + (leftOn ? ppt : 0));
    const rightInner = r2(totalW - SW - (rightOn ? ppt : 0));
    footprint.left = { x0: 0, x1: leftInner, y0: leftOn && backBuilt ? r2(-backBuilt.over) : 0, y1: D };
    footprint.right = { x0: rightInner, x1: totalW, y0: rightOn && backBuilt ? r2(-backBuilt.over) : 0, y1: D };
    const ftP = raw.aisleAccess === "DRAWER" ? Math.max(1, asNum(raw.frontPanelThickness, R.FRAME_DRAWER_FRONT_THICKNESS.value)) : null;
    addFrameParallel(totalW, SW, D, H, ppt, wheel ?? null, ftP, boards, lids, locks, grooves, errors, { left: leftOn, right: rightOn }, backBuilt);
    if (wheelOn && !errors.length) addAvoidanceCovers("parallel_", 0, totalW, D, AD, AH, ppt, boards);
    // The middle cabinet is on unless switched off, when the gap takes MIDDLE_CABINET_MIN_WIDTH.
    const gapW = rightInner - leftInner;
    const mcOn = raw.hasMiddleCabinet ?? (gapW >= R.MIDDLE_CABINET_MIN_WIDTH.value);
    // A floor-plan arch that meets the gap at the wall: the visible covers live there,
    // and the cabinet stands on the top one. Otherwise the old whole-run cover, or the floor.
    const planCovers = mcOn ? gapCovers(raw.planWheelArches, leftInner, rightInner, D, H, ppt) : [];
    const planTop = planCovers.reduce((m, c) => Math.max(m, c.z1), 0);
    const standOn = planCovers.length ? planTop : (wheelOn ? AH : 0);
    if (mcOn && !errors.length) middleCabinet = addMiddleCabinet(raw, totalW, D, boards, hinges, locks, grooves, warnings, errors, standOn, { x0: leftInner, x1: rightInner });
    if (planCovers.length && !errors.length) {
      planCovers.forEach((c, i) => {
        const id = planCovers.length === 1 ? "mid_avoidance" : `mid_avoidance_${i + 1}`;
        const z0 = r2(c.z1 - ppt);
        boards.push(mkBoard(`${id}_top`, "Avoidance Top", "avoidance_top", ppt, "XY", "Z", c.x0, c.x1, c.y0, c.y1, z0, c.z1));
        if (c.y0 + ppt < c.y1) {
          boards.push(mkBoard(`${id}_front`, "Avoidance Front", "avoidance_front", ppt, "XZ", "Y", c.x0, c.x1, c.y0, r2(c.y0 + ppt), 0, z0));
        }
      });
    }
  } else {
    const mainW = asNum(raw.mainWidth, 2000);
    const mainD = asNum(raw.mainDepth, 600);
    const ret = asNum(raw.lWidth, 1600);
    const thick = asNum(raw.lDepth, 600);
    const right = (raw.lPosition ?? "RIGHT") !== "LEFT";
    if (wheelOn) warnings.push("L frame: wheel arch avoidance is not in the frame lounge yet; ignored.");
    const ft = lDrawer ? Math.max(1, asNum(raw.frontPanelThickness, R.FRAME_DRAWER_FRONT_THICKNESS.value)) : null;
    if (raw.backPanel === true) {
      backBuilt = backMetrics(raw, H);
      backFlags.backPanel = true;
    }
    const wallY = r2(ret);
    const inset = backBuilt ? ppt : 0;
    const overY = backBuilt ? backBuilt.over : 0;
    footprint.main = right
      ? { x0: 0, x1: r2(mainW - thick - inset), y0: r2(wallY - mainD), y1: wallY }
      : { x0: r2(thick + inset), x1: mainW, y0: r2(wallY - mainD), y1: wallY };
    footprint.l = right
      ? { x0: r2(mainW - thick - inset), x1: mainW, y0: overY ? r2(-overY) : 0, y1: wallY }
      : { x0: 0, x1: r2(thick + inset), y0: overY ? r2(-overY) : 0, y1: wallY };
    addFrameL(mainW, mainD, ret, thick, H, ppt, right, ft, boards, lids, locks, grooves, errors, backBuilt);
  }

  notchPlanArches(boards, raw.planWheelArches);
  applyLayoutDraft(boards, options.layout != null ? options.layout : LAYOUT, {}, errors, warnings, {
    style,
    construction: "frame",
    lFrontAccess: raw.lFrontAccess === "DRAWER" ? "DRAWER" : "NONE",
    aisleAccess: raw.aisleAccess === "DRAWER" ? "DRAWER" : "NONE",
  });
  attachFaces(boards);
  const joints: Joint[] = buildLoungeFaces({ boards, openings, lids, hinges, locks, grooves, doorColour: doorColourOf(raw) });
  applyDoorSides(boards, raw);
  const milling = applyMilling(boards);
  sheetLimitErrors(boards, errors);

  return {
    params: {
      style, height: H, partitionPanelThickness: ppt, panelHeight: Hprime,
      construction: "frame" as const,
      ...(frameL ? { lFrontAccess: lDrawer ? "DRAWER" as const : "NONE" as const } : {}),
      ...(frameP ? { aisleAccess: raw.aisleAccess === "DRAWER" ? "DRAWER" as const : "NONE" as const } : {}),
      ...(style === "PARALLEL" ? { middleCabinet } : {}),
      ...backFlags,
      ...(backBuilt ? { backPanelOverhang: backBuilt.over, backPanelHeight: backBuilt.zTop } : {}),
    },
    boards, milling, openings, lids, footprint, hinges, locks, grooves, joints,
    validation: { errors, warnings },
    debug: { provenance: endProvenance(), boardFrame: "final" },
  };
}
