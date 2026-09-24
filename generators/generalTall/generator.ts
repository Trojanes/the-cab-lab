/**
 * 高柜生成器。一套柜体坐标，接缝先写成规则，板再坐上去。
 * y=0 是门背。门在 −门厚..0。侧板后缘 = midDepth。立板从 y=0 起，比门厚基准朝前一个门厚。
 * 顶轨后缘停在立板前脸之前一个门厚。底部横桥在避让打开时抬到避让高度。
 */
import { beginProvenance, dim, endProvenance, param, ref, same } from "../_lib/dim.ts";
import { attachFaces } from "../_lib/model.ts";
import { recordBoardBox } from "../_lib/recordBox.ts";
import { buildTallFaces } from "./faces.ts";
import type {
  Board, GTParams, GTResult, GTZone, GTZoneType, HingeRecord, Joint,
  LockRecord, StackItem, BoundaryType, ZiGrooveRecord, ZiSlotRecord,
} from "./types.ts";
import { RULES as R } from "./rules.ts";

export { generateGTSvgPreview } from "./svgPreview.ts";

const asNum = (v: unknown, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const r2 = (v: number) => Math.round(v * 1000) / 1000;
const EPS = 0.001;

const PANEL_TYPES = new Set<GTZoneType>(["side_door", "left_side_door", "right_side_door", "double_door", "drawer", "top_flap", "bottom_flap"]);

/* ================= 参数解析 ================= */

interface S {
  CH: number; CW: number; CD: number;
  CPT: number; FPT: number; ziT: number; hT: number; dividerT: number;
  leftT: number; rightT: number;
  leftAdapt: boolean; rightAdapt: boolean;
  topSys: { style: string; railH: number; frontRail: number; insert: number };
  botSys: { style: string; railH: number; frontRail: number; insert: number };
  avoid: { enabled: boolean; depth: number; height: number };
  fc: number;
  locksOn: boolean;
  panelsOn: boolean;
  zones: GTZone[];
  midWidth: number;
  midDepth: number;
  dx: number; // core → 绝对 x 平移 = leftT
  sideClearance: number;
  exteriorSide: "left" | "right" | "none";
  syncCabinetWidthFromFridge: boolean;
}

function applyFridgePrep(input: GTParams, notes: string[]): GTParams {
  const zones = (input.zones ?? []).map((zone) => {
    if (zone.type !== "fridge") return zone;
    const applianceHeight = Number(zone.applianceHeightMm);
    if (Number.isFinite(applianceHeight) && applianceHeight > 0) {
      if (Math.abs(asNum(zone.height, 0) - applianceHeight) > 0.01) {
        notes.push(`Fridge zone ${zone.id} height synced to applianceHeightMm=${applianceHeight}.`);
      }
      return { ...zone, height: applianceHeight };
    }
    notes.push(`Fridge zone ${zone.id} has no applianceHeightMm; using zone height ${asNum(zone.height, 0)}.`);
    return zone;
  });
  const fridgeZones = zones.filter((zone) => zone.type === "fridge");
  if (!fridgeZones.length) return { ...input, zones };

  const exteriorSide = input.exteriorSide === "left" || input.exteriorSide === "right"
    ? input.exteriorSide
    : "none";
  const next: GTParams = { ...input, zones, exteriorSide };
  const sideMm = R.FRIDGE_EXTERIOR_THICKNESS.value;
  if (exteriorSide === "left") {
    next.leftSidePanelThickness = sideMm;
    notes.push("Fridge exteriorSide=left → SidePanel_L thickness 16mm.");
  } else if (exteriorSide === "right") {
    next.rightSidePanelThickness = sideMm;
    notes.push("Fridge exteriorSide=right → SidePanel_R thickness 16mm.");
  }

  const sync = input.syncCabinetWidthFromFridge !== false;
  const applianceWidth = Number(fridgeZones[0].applianceWidthMm);
  if (sync && Number.isFinite(applianceWidth) && applianceWidth > 0) {
    const allowance = exteriorSide === "none"
      ? R.FRIDGE_WIDTH_ALLOWANCE.value
      : R.FRIDGE_WIDTH_ALLOWANCE_WITH_EXTERIOR.value;
    const targetWidth = applianceWidth + allowance;
    if (Math.abs(asNum(input.cabinetWidth, 0) - targetWidth) > 0.01) {
      notes.push(`Cabinet width synced from fridge appliance (${applianceWidth}+${allowance}=${targetWidth}).`);
    }
    next.cabinetWidth = targetWidth;
  }
  return next;
}

function normalize(input: GTParams, errors: string[]): S {
  const CH = asNum(input.cabinetHeight, 0);
  const CW = asNum(input.cabinetWidth, 0);
  const CD = asNum(input.cabinetDepth, 0);
  const CPT = asNum(input.panelThickness, R.DEFAULT_PANEL_THICKNESS.value);
  // FPT 统一优先级：frontPanelThickness > frontFaceAllowance > doorPanelThickness > 16
  const FPT = asNum(input.frontPanelThickness ?? input.frontFaceAllowance ?? input.doorPanelThickness, R.DEFAULT_FRONT_FACE_ALLOWANCE.value);
  const ziT = asNum(input.ziThickness, R.DEFAULT_ZI_THICKNESS.value);
  const hT = asNum(input.hThickness, R.DEFAULT_H_THICKNESS.value);
  const dividerT = asNum(input.dividerThickness, R.DEFAULT_DIVIDER_THICKNESS.value);
  const fc = asNum(input.frontHardware?.frontClearance, R.DEFAULT_FRONT_CLEARANCE.value);

  const leftT = asNum(input.leftSidePanelThickness, 0);
  const rightT = asNum(input.rightSidePanelThickness, 0);
  for (const [name, t] of [["Left", leftT], ["Right", rightT]] as const) {
    if (t !== 0 && t !== R.SIDE_PANEL_WHITELIST_15.value && t !== R.SIDE_PANEL_WHITELIST_16.value) {
      errors.push(`${name} side panel thickness must be one of {0, 15, 16}.`);
    }
  }

  const topStyle = input.topSystem?.style ?? "style_1";
  const botStyle = input.bottomSystem?.style ?? "style_1";
  const topInsert = topStyle === "style_1"
    ? asNum((input.topSystem as { insertSlotThickness?: number })?.insertSlotThickness, R.STYLE_1_INSERT_SLOT_THICKNESS.value)
    : 0;
  const botInsert = botStyle === "style_1"
    ? asNum((input.bottomSystem as { insertSlotThickness?: number })?.insertSlotThickness, R.STYLE_1_INSERT_SLOT_THICKNESS.value)
    : 0;
  const topFront = topStyle === "style_1"
    ? Math.max(asNum((input.topSystem as { frontRailHeight?: number })?.frontRailHeight, 0), R.TOP_STYLE_1_MIN_FRONT_RAIL_HEIGHT.value)
    : asNum((input.topSystem as { height?: number })?.height, 0);
  const botFront = botStyle === "style_1"
    ? Math.max(asNum((input.bottomSystem as { frontRailHeight?: number })?.frontRailHeight, 0), R.BOTTOM_STYLE_1_MIN_FRONT_RAIL_HEIGHT.value)
    : asNum((input.bottomSystem as { height?: number })?.height, 0);
  const topRailH = topFront + topInsert;
  const botRailH = botFront + botInsert;
  if (topStyle === "style_2" && topFront < 60) errors.push("top/bottom Style 2 height must be >= 60 mm.");
  if (botStyle === "style_2" && botFront < 60) errors.push("top/bottom Style 2 height must be >= 60 mm.");

  const av = input.avoidance ?? {};
  const avoid = {
    enabled: av.enabled === true,
    depth: Math.min(Math.max(asNum(av.depth, 0), 0), CD),
    height: Math.min(Math.max(asNum(av.height, 0), 0), CH),
  };

  const midWidth = CW - leftT - rightT;
  if (midWidth <= 0) errors.push("MidWidth must be > 0 after side panel thickness (CabinetWidth too small).");

  return {
    CH, CW, CD, CPT, FPT, ziT, hT, dividerT, leftT, rightT,
    leftAdapt: input.leftSidePanelAdaptAvoidance ?? true,
    rightAdapt: input.rightSidePanelAdaptAvoidance ?? true,
    topSys: { style: topStyle, railH: topRailH, frontRail: topFront, insert: topInsert },
    botSys: { style: botStyle, railH: botRailH, frontRail: botFront, insert: botInsert },
    avoid,
    fc,
    locksOn: input.frontHardware?.locksEnabled !== false,
    panelsOn: input.frontHardware?.frontPanelsEnabled !== false,
    zones: input.zones ?? [],
    midWidth, midDepth: r2(CD - FPT),
    dx: leftT,
    sideClearance: asNum(input.sideClearance, R.DEFAULT_SIDE_CLEARANCE.value),
    exteriorSide: input.exteriorSide === "left" || input.exteriorSide === "right" ? input.exteriorSide : "none",
    syncCabinetWidthFromFridge: input.syncCabinetWidthFromFridge !== false,
  };
}

/* ================= 边界解析（§7.2） ================= */

function resolveBoundary(above: GTZoneType | "top_system" | "bottom_system", below: GTZoneType | "bottom_system" | "blank_panel"): BoundaryType {
  if (below === "bottom_system") return "none";
  // blank 上方不再切边界（§8.2：blank→open 为 none）；进入 blank 仍按下列区类型出 Zi
  if (below === "blank_panel" || above === "top_system") return "none";
  if (above === "drawer" && below === "drawer") return "half_zi";
  if (above === "bottom_system") return "none";
  if (above === "drawer") return "full_zi";
  return "full_zi";
}

/* ================= 堆叠（§7.1，自下而上） ================= */

interface Boundary extends StackItem {
  boundaryType: BoundaryType;
  upgraded: boolean; // 双门升级
}

function computeStack(s: S, errors: string[], warnings: string[]): {
  zones: (StackItem & { zone: GTZone })[];
  boundaries: Boundary[];
  topSys: StackItem;
  botSys: StackItem;
  calculatedHeight: number;
} {
  const items: StackItem[] = [];
  const botSys: StackItem = {
    id: "bottom-system", kind: "bottom_system",
    z0: 0, z1: r2(s.botSys.railH), height: r2(s.botSys.railH), centerZ: r2(s.botSys.railH / 2),
  };
  items.push(botSys);
  let z = s.botSys.railH;
  const zoneItems: (StackItem & { zone: GTZone })[] = [];
  const boundaries: Boundary[] = [];
  const prevTypes: (GTZoneType | "bottom_system")[] = ["bottom_system"];

  s.zones.forEach((zone, i) => {
    if (asNum(zone.height, 0) <= 0) errors.push(`Zone ${zone.id} height must be > 0.`);
    {
      const above = zone.type;
      const below = prevTypes[prevTypes.length - 1];
      let bt = resolveBoundary(above, below);
      // 双门升级：double_door(verticalDivider) 的下边界强制 full_zi（对底系统仍 none）
      if (zone.verticalDivider === true && below !== "bottom_system") bt = "full_zi";
      if (bt !== "none") {
        const h = s.ziT;
        boundaries.push({
          id: `boundary-${zone.id}`,
          kind: "boundary_panel", boundaryType: bt,
          upgraded: zone.verticalDivider === true,
          z0: r2(z), z1: r2(z + h), height: h, centerZ: r2(z + h / 2),
        });
        items.push(boundaries[boundaries.length - 1]);
        z += h;
      }
    }
    const zoneH = asNum(zone.height, 0);
    zoneItems.push({
      id: `zone-${zone.id}`, kind: "functional_zone", zoneType: zone.type, zoneId: zone.id,
      z0: r2(z), z1: r2(z + zoneH), height: zoneH, centerZ: r2(z + zoneH / 2), zone,
    });
    items.push(zoneItems[zoneItems.length - 1]);
    z += zoneH;
    prevTypes.push(zone.type);
  });
  const topSys: StackItem = {
    id: "top-system", kind: "top_system",
    z0: r2(z), z1: r2(z + s.topSys.railH), height: r2(s.topSys.railH), centerZ: r2(z + s.topSys.railH / 2),
  };
  items.push(topSys);
  const diff = r2((z + s.topSys.railH) - s.CH);
  if (Math.abs(diff) > R.STACKING_HEIGHT_TOLERANCE.value) {
    warnings.push(`Height mismatch: expected CH = ${r2(s.CH)}; calculated CH = ${r2(z + s.topSys.railH)}; difference = ${diff}.`);
  }
  return { zones: zoneItems, boundaries, topSys, botSys, calculatedHeight: r2(z + s.topSys.railH) };
}

/** zone-3 吃掉柜高差额，使堆叠等于新柜高。矮于 300 mm 时柜高停住。 */
const SLACK_ZONE_MIN = 300;

export function fitTallCabinetHeight(input: GTParams, cabinetHeight: number): GTParams {
  const zones = (input.zones ?? []).map((zone) => ({ ...zone }));
  const H = r2(cabinetHeight);
  if (!zones.length) return { ...input, cabinetHeight: H };
  const named = zones.findIndex((zone) => zone.id === "zone-3" && zone.type !== "fridge");
  let fallback = -1;
  for (let i = zones.length - 1; i >= 0; i -= 1) {
    if (zones[i].type !== "fridge") { fallback = i; break; }
  }
  const index = named >= 0 ? named : fallback >= 0 ? fallback : zones.length - 1;
  const trial = zones.map((zone, i) => (i === index ? { ...zone, height: 0 } : zone));
  const scratch: string[] = [];
  const stacked = computeStack(normalize({ ...input, cabinetHeight: H, zones: trial }, scratch), scratch, scratch);
  const room = r2(H - stacked.calculatedHeight);
  const height = Math.max(SLACK_ZONE_MIN, room);
  const nextZones = zones.map((zone, i) => (i === index ? { ...zone, height } : zone));
  const fitted = height === room ? H : r2(stacked.calculatedHeight + height);
  return { ...input, cabinetHeight: fitted, zones: nextZones };
}

/* ================= 轮廓工具 ================= */

type P2 = { x: number; y: number } | { y: number; z: number } | { x: number; z: number };

function yz(pts: [number, number][]): P2[] {
  return pts.map(([y, z]) => ({ y: r2(y), z: r2(z) }));
}

function mkBoard(
  id: string, name: string, category: string, boardType: string, thickness: number,
  kind: "carcass" | "door",
  plane: "XY" | "XZ" | "YZ", axis: "X" | "Y" | "Z",
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
  profileVector: P2[] | undefined,
): Board {
  const box = recordBoardBox(id, r2(x0), r2(x1), r2(y0), r2(y1), r2(z0), r2(z1));
  return {
    id, name, category, boardType,
    materialThickness: thickness, profilePlane: plane, thicknessAxis: axis,
    stock: { kind, thickness },
    ...box,
    profileVector: profileVector ? profileVector.map((p) => ({ ...(p as object) })) as Board["profileVector"] : undefined,
  };
}

/* ================= V 立梃轮廓 ================= */

/** V1/V2 轮廓，点已经是柜体 Y。整体比门厚基准朝前一个门厚，前脸贴在顶轨后缘。 */
function v12Profile(s: S, slots: { z0: number; z1: number }[], yOrigin: number): P2[] {
  const CH = s.CH;
  const tRear = R.V12_Y_REAR.value;
  const slotY = R.V12_ZI_SLOT_INNER.value;
  const frontY = R.V12_Y_FRONT_FACE.value;
  const stepY = R.V12_Y_STEP_INNER.value;
  const topStyle1 = s.topSys.style === "style_1";
  const botStyle1 = s.botSys.style === "style_1";
  const notchD = R.STYLE_2_END_NOTCH_DEPTH.value;
  const notchT = R.V34_END_NOTCH_THICKNESS.value;
  const pts: [number, number][] = botStyle1 ? [[frontY, 0], [tRear, 0]] : [[tRear, 0]];
  for (const sl of slots) {
    pts.push([tRear, r2(sl.z0)], [slotY, r2(sl.z0)], [slotY, r2(sl.z1)], [tRear, r2(sl.z1)]);
  }
  pts.push([tRear, CH]);
  if (topStyle1) {
    const insT = R.STYLE_1_INSERT_SLOT_THICKNESS.value;
    const topFrontRail = r2(CH - (s.topSys.railH - insT));
    pts.push(
      [frontY, CH], [frontY, topFrontRail], [stepY, topFrontRail],
      [stepY, r2(topFrontRail - insT)], [0, r2(topFrontRail - insT)],
    );
  } else {
    pts.push([notchD, CH], [notchD, r2(CH - notchT)], [0, r2(CH - notchT)]);
  }
  if (botStyle1) {
    const insT = R.STYLE_1_INSERT_SLOT_THICKNESS.value;
    const botRail = s.botSys.railH;
    pts.push(
      [0, r2(botRail)], [stepY, r2(botRail)], [stepY, r2(botRail - insT)],
      [frontY, r2(botRail - insT)], [frontY, 0],
    );
  } else {
    pts.push([0, notchT], [notchD, notchT], [notchD, 0], [tRear, 0]);
  }
  return yz(pts.map(([y, z]) => [y + yOrigin, z]));
}

/**
 * V3/V4 轮廓，直接写成柜体 Y（后立梃贴墙：局部 0 = 柜体 yOff = midDepth−150）。
 * 路径与 spec §8.3 一致：底边 → 后缘上到顶 L 缺口 → 沿前缘下行插入 Zi 槽。
 */
function v34Profile(s: S, slots: { z0: number; z1: number }[], warnings: string[], yOff: number): P2[] {
  const CH = s.CH;
  const tRear = R.V34_Y_REAR.value;
  const slotY = R.V34_ZI_SLOT_INNER.value;
  const nh = R.V34_NOTCH_HEIGHT.value;
  const nf = R.V34_TOP_NOTCH_FRONT_Y.value;
  const ni = R.V34_TOP_NOTCH_INNER_Y.value;
  const nt = R.V34_END_NOTCH_THICKNESS.value;
  const Y = (y: number) => r2(y + yOff);
  const kept: { z0: number; z1: number }[] = [];
  for (const sl of slots) {
    if (sl.z0 < CH - nh && sl.z1 > 0) kept.push(sl);
    else warnings.push(`Zi slot at z [${r2(sl.z0)}, ${r2(sl.z1)}] intersects avoidance/edge on V3/V4; slot omitted.`);
  }
  kept.sort((a, b) => b.z1 - a.z1);
  let start: [number, number][];
  if (s.avoid.enabled && s.avoid.height > 0 && s.avoid.depth > 0) {
    const ah = s.avoid.height, ad = s.avoid.depth;
    if (ad <= 150) {
      start = [
        [0, 0], [R.V_AVOIDANCE_PARTIAL_FRONT_Y.value, 0],
        [R.V_AVOIDANCE_PARTIAL_FRONT_Y.value, ah], [tRear, ah],
      ];
    } else {
      start = [[0, ah], [tRear, ah]];
    }
  } else {
    start = [[0, 0], [tRear, 0]];
  }
  const pts: [number, number][] = [
    ...start,
    [tRear, r2(CH - nh)], [ni, r2(CH - nh)], [ni, r2(CH - nt)], [nf, r2(CH - nt)], [nf, CH], [0, CH],
  ];
  for (const sl of kept) {
    pts.push([0, r2(sl.z1)], [slotY, r2(sl.z1)], [slotY, r2(sl.z0)], [0, r2(sl.z0)]);
  }
  pts.push([0, start[0][1]]);
  return yz(pts.map(([y, z]) => [Y(y), z]));
}

/* ================= Zi 边界板轮廓（柜体坐标，x 从侧板内缘起） ================= */

function fullZiProfile(s: S): P2[] {
  const x = (v: number) => r2(v + s.dx);
  const mw = s.midWidth, md = s.midDepth, nd = R.ZI_FULL_FRONT_REAR_NOTCH_DEPTH.value;
  return [
    { x: x(s.CPT), y: 0 }, { x: x(s.CPT), y: nd }, { x: x(0), y: nd }, { x: x(0), y: r2(md - nd) },
    { x: x(s.CPT), y: r2(md - nd) }, { x: x(s.CPT), y: md }, { x: x(mw - s.CPT), y: md },
    { x: x(mw - s.CPT), y: r2(md - nd) }, { x: x(mw), y: r2(md - nd) }, { x: x(mw), y: nd },
    { x: x(mw - s.CPT), y: nd }, { x: x(mw - s.CPT), y: 0 }, { x: x(s.CPT), y: 0 },
  ];
}
function halfZiProfile(s: S): P2[] {
  const x = (v: number) => r2(v + s.dx);
  const mw = s.midWidth;
  const nd = R.ZI_HALF_FRONT_NOTCH_DEPTH.value;
  const dep = R.ZI_HALF_DEPTH.value;
  return [
    { x: x(0), y: 0 }, { x: x(0), y: nd }, { x: x(s.CPT), y: nd }, { x: x(s.CPT), y: dep },
    { x: x(mw - s.CPT), y: dep }, { x: x(mw - s.CPT), y: nd }, { x: x(mw), y: nd }, { x: x(mw), y: 0 }, { x: x(0), y: 0 },
  ];
}

/* ================= 主流程 ================= */

export function generateGeneralTall(input: GTParams): GTResult {
  beginProvenance();
  const errors: string[] = [];
  const warnings: string[] = [];
  const fridgeNotes: string[] = [];
  const prepared = applyFridgePrep(input, fridgeNotes);
  const s = normalize(prepared, errors);
  warnings.push(...fridgeNotes);
  const P = param({ CH: s.CH, CW: s.CW, CD: s.CD, CPT: s.CPT, FPT: s.FPT });
  dim("tall.midDepth", { CD: P.CD, FPT: P.FPT }, (t) => t.CD - t.FPT);
  const stileY0 = dim("tall.stileY0", { FPT: P.FPT }, () => 0);
  const v12Rear = dim("tall.v12Rear", { y0: ref("tall.stileY0"), rear: R.V12_Y_REAR }, (t) => t.y0 + t.rear);
  const railRear = dim("tall.railRear", { face: R.V12_Y_FRONT_FACE }, (t) => t.face);
  const railY0 = dim("tall.railY0", {
    rear: ref("tall.railRear"),
    t1: R.STYLE_1_FIRST_RAIL_THICKNESS,
    t2: R.STYLE_1_SECOND_RAIL_THICKNESS,
  }, (t) => t.rear - t.t1 - t.t2);
  const t1Rear = dim("tall.t1Rear", { y0: ref("tall.railY0"), t1: R.STYLE_1_FIRST_RAIL_THICKNESS }, (t) => t.y0 + t.t1);
  const t5Rear = dim("tall.t5Rear", { md: ref("tall.midDepth"), inset: R.T45_WALL_INSET }, (t) => t.md - t.inset);
  const t5Front = dim("tall.t5Front", { rear: ref("tall.t5Rear"), t: R.T45_THICKNESS }, (t) => t.rear - t.t);
  const hY0 = dim("tall.hY0", { y: R.H_SUPPORT_SIDE_DEPTH_START }, (t) => t.y);
  const hY1 = dim("tall.hY1", { md: ref("tall.midDepth"), clear: R.H_SUPPORT_SIDE_REAR_CLEARANCE }, (t) => t.md - t.clear);
  const boards: Board[] = [];
  const ziSlots: ZiSlotRecord[] = [];
  const ziGrooves: ZiGrooveRecord[] = [];
  const hinges: HingeRecord[] = [];
  const locks: LockRecord[] = [];

  const { zones: zoneItems, boundaries, topSys, botSys } = computeStack(s, errors, warnings);
  const CH = s.CH, CD = s.CD, FPT = s.FPT, CPT = s.CPT, mw = s.midWidth, md = s.midDepth, dx = s.dx;

  let fridgeMode: "none" | "normal" | "raised" = "none";
  let fridgeGap = 0;
  let fridgeBaseBottomZ = 0;
  const fridgeZoneItem = zoneItems.find((zi) => zi.zone.type === "fridge");
  if (fridgeZoneItem) {
    const below = boundaries.find((b) => b.id === `boundary-${fridgeZoneItem.zone.id}`);
    fridgeBaseBottomZ = below ? below.z0 : fridgeZoneItem.z0;
    const aw = Number(fridgeZoneItem.zone.applianceWidthMm);
    const adp = Number(fridgeZoneItem.zone.applianceDepthMm);
    if (Number.isFinite(aw) && aw > mw + 0.01) {
      warnings.push(`Fridge zone ${fridgeZoneItem.zone.id} applianceWidthMm=${aw} exceeds interior midWidth=${mw}.`);
    }
    if (Number.isFinite(adp) && adp > md + 0.01) {
      warnings.push(`Fridge zone ${fridgeZoneItem.zone.id} applianceDepthMm=${adp} exceeds interior midDepth=${md}.`);
    }
    if (s.avoid.enabled) {
      fridgeGap = fridgeBaseBottomZ - s.avoid.height;
      if (fridgeBaseBottomZ < s.avoid.height + CPT) {
        errors.push(
          `Fridge base bottom Z (${fridgeBaseBottomZ}) must be >= Avoidance Height + panel thickness (${s.avoid.height}+${CPT}).`,
        );
      } else if (fridgeGap < R.FRIDGE_RAISED_THRESHOLD.value) {
        fridgeMode = "raised";
        s.avoid.height = fridgeBaseBottomZ;
        warnings.push(
          `Fridge/avoidance gap ${fridgeGap.toFixed(1)} mm < 105 mm: raised avoidance mode and above-fridge HSet will be used.`,
        );
      } else {
        fridgeMode = "normal";
        warnings.push(`Fridge/avoidance gap ${fridgeGap.toFixed(1)} mm >= 105 mm: normal avoidance height kept.`);
      }
    }
  }

  /* ---- V1/V2 Zi 槽（full + half 边界都给前立梃） ---- */
  const v12Slots = boundaries
    .filter((b) => b.boundaryType === "full_zi" || b.boundaryType === "half_zi")
    .map((b) => ({ z0: r2(b.centerZ - (s.ziT + R.ZI_SLOT_CLEARANCE.value) / 2), z1: r2(b.centerZ + (s.ziT + R.ZI_SLOT_CLEARANCE.value) / 2), boundaryId: b.id }));
  /* ---- V3/V4 Zi 槽（仅 full） ---- */
  const v34Slots = boundaries
    .filter((b) => b.boundaryType === "full_zi")
    .map((b) => ({ z0: r2(b.centerZ - (s.ziT + R.ZI_SLOT_CLEARANCE.value) / 2), z1: r2(b.centerZ + (s.ziT + R.ZI_SLOT_CLEARANCE.value) / 2), boundaryId: b.id }));

  /* ---- 立梃在侧板内侧。四块立板比门厚基准朝前一个门厚：前脸贴顶轨后缘，后缘贴横桥前端。 ---- */
  const sideY0 = FPT;
  const sideY1 = r2(FPT + md);
  const vLeftX0 = s.leftT;
  const vLeftX1 = r2(s.leftT + CPT);
  const vRightX1 = r2(s.CW - s.rightT);
  const vRightX0 = r2(vRightX1 - CPT);
  const v12Y0 = stileY0;
  const v12Y1 = v12Rear;
  boards.push(mkBoard("V1", "Front Stile Left", "vertical_structure", "V1", CPT, "carcass",
    "YZ", "X", vLeftX0, vLeftX1, v12Y0, v12Y1, 0, CH, v12Profile(s, v12Slots, v12Y0)));
  boards.push(mkBoard("V2", "Front Stile Right", "vertical_structure", "V2", CPT, "carcass",
    "YZ", "X", vRightX0, vRightX1, v12Y0, v12Y1, 0, CH, v12Profile(s, v12Slots, v12Y0)));

  /* ---- V3/V4 后立梃：同样朝前一个门厚。后缘贴侧板后缘 midDepth。 ---- */
  const v34Y0 = r2(stileY0 + Math.max(0, md - R.V34_Y_REAR.value));
  const v34Y1 = r2(stileY0 + md);
  boards.push(mkBoard("V3", "Rear Stile Left", "vertical_structure", "V3", CPT, "carcass",
    "YZ", "X", vLeftX0, vLeftX1, v34Y0, v34Y1, 0, CH, v34Profile(s, v34Slots, warnings, v34Y0)));
  boards.push(mkBoard("V4", "Rear Stile Right", "vertical_structure", "V4", CPT, "carcass",
    "YZ", "X", vRightX0, vRightX1, v34Y0, v34Y1, 0, CH, v34Profile(s, v34Slots, warnings, v34Y0)));

  if (fridgeZoneItem) {
    const v5OnLeft = s.exteriorSide !== "left";
    let v5x0: number, v5x1: number;
    if (v5OnLeft) {
      v5x0 = r2(s.leftT + CPT);
      v5x1 = r2(v5x0 + CPT);
    } else {
      v5x1 = r2(s.CW - s.rightT - CPT);
      v5x0 = r2(v5x1 - CPT);
    }
    boards.push(mkBoard("V5", "V5", "vertical_structure", "V5", CPT, "carcass",
      "YZ", "X", v5x0, v5x1, sideY0, sideY1, fridgeZoneItem.z0, fridgeZoneItem.z1,
      yz([
        [sideY0, fridgeZoneItem.z0], [sideY1, fridgeZoneItem.z0],
        [sideY1, fridgeZoneItem.z1], [sideY0, fridgeZoneItem.z1],
        [sideY0, fridgeZoneItem.z0],
      ])));
    warnings.push(
      `Fridge zone ${fridgeZoneItem.zone.id}: V5 on ${v5OnLeft ? "left" : "right"} (exteriorSide=${s.exteriorSide}).`,
    );
  }

  for (const sl of v12Slots) {
    ziSlots.push({ id: `zi_slot_V1_${sl.boundaryId}`, vPanelId: "V1", y0: r2(v12Y0 + R.V12_ZI_SLOT_INNER.value), y1: r2(v12Y0 + R.V12_Y_REAR.value), z0: sl.z0, z1: sl.z1, depth: R.ZI_SLOT_DEPTH.value, boundaryId: sl.boundaryId });
    ziSlots.push({ id: `zi_slot_V2_${sl.boundaryId}`, vPanelId: "V2", y0: r2(v12Y0 + R.V12_ZI_SLOT_INNER.value), y1: r2(v12Y0 + R.V12_Y_REAR.value), z0: sl.z0, z1: sl.z1, depth: R.ZI_SLOT_DEPTH.value, boundaryId: sl.boundaryId });
  }
  for (const sl of v34Slots) {
    ziSlots.push({
      id: `zi_slot_V3_${sl.boundaryId}`, vPanelId: "V3",
      y0: r2(v34Y0 + R.V34_Y_FRONT.value), y1: r2(v34Y0 + R.V34_ZI_SLOT_INNER.value),
      z0: sl.z0, z1: sl.z1, depth: R.ZI_SLOT_DEPTH.value, boundaryId: sl.boundaryId,
    });
    ziSlots.push({
      id: `zi_slot_V4_${sl.boundaryId}`, vPanelId: "V4",
      y0: r2(v34Y0 + R.V34_Y_FRONT.value), y1: r2(v34Y0 + R.V34_ZI_SLOT_INNER.value),
      z0: sl.z0, z1: sl.z1, depth: R.ZI_SLOT_DEPTH.value, boundaryId: sl.boundaryId,
    });
  }

  /* ---- 端系统。顶轨坐在 tall.railY0；T5 后缘坐在 tall.t5Rear（侧板后缘内侧 1 mm） ---- */
  {
    const insDepth = R.STYLE_1_INSERT_BOARD_DEPTH.value;
    const notch = R.STYLE_1_INSERT_FRONT_NOTCH_DEPTH.value;
    const t1H = R.STYLE_1_FIRST_RAIL_THICKNESS.value;
    const t2H = R.STYLE_1_SECOND_RAIL_THICKNESS.value;
    const insT = R.STYLE_1_INSERT_SLOT_THICKNESS.value;
    // Ears stay in front of the stile step (y = 80). The board necks in after `notch`
    // so the rear run clears V1/V2. A front notch put the ears into the stile.
    const insertProfile = (): P2[] => [
      { x: dx, y: 0 }, { x: dx, y: notch }, { x: r2(dx + CPT), y: notch }, { x: r2(dx + CPT), y: insDepth },
      { x: r2(dx + mw - CPT), y: insDepth }, { x: r2(dx + mw - CPT), y: notch }, { x: r2(dx + mw), y: notch }, { x: r2(dx + mw), y: 0 },
    ];
    if (s.topSys.style === "style_1") {
      const topBand0 = r2(CH - s.topSys.railH);
      const topRail0 = r2(CH - s.topSys.frontRail);
      boards.push(mkBoard("T1", "Top Front Rail", "top_system", "T1", t1H, "carcass",
        "XZ", "Y", dx, r2(dx + mw), railY0, t1Rear, topRail0, CH, undefined));
      boards.push(mkBoard("T2", "Top Second Rail", "top_system", "T2", t2H, "carcass",
        "XZ", "Y", dx, r2(dx + mw), t1Rear, railRear, topRail0, CH, undefined));
      same("T1.y0", "tall.railY0");
      same("T1.y1", "tall.t1Rear");
      same("T2.y0", "tall.t1Rear");
      same("T2.y1", "tall.railRear");
      boards.push(mkBoard("T3", "Top Insert Board", "top_system", "T3", CPT, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, insDepth, topBand0, topRail0, insertProfile()));
    } else if (s.topSys.style === "style_2") {
      const sysH = s.topSys.frontRail;
      const th = R.STYLE_2_FRONT_SYSTEM_THICKNESS.value;
      const dep = R.STYLE_2_FRONT_SYSTEM_DEPTH.value;
      const inset = R.STYLE_2_FRONT_SYSTEM_Z_INSET.value;
      boards.push(mkBoard("TH1", "Top Style 2 Front System Panel", "top_system", "TH1", th, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, dep, r2(CH - 16), r2(CH - inset), undefined));
      boards.push(mkBoard("TopStyle2FixedFrontPanel", "Top Style 2 Fixed Front Panel", "top_system", "style2_fixed_front_panel", FPT, "door",
        "XZ", "Y", r2(dx + s.sideClearance), r2(dx + mw - s.sideClearance), -FPT, 0, r2(CH - sysH), CH, undefined));
    }
    if (s.botSys.style === "style_1") {
      const botRail1 = r2(s.botSys.frontRail);
      const botBand1 = r2(s.botSys.railH);
      boards.push(mkBoard("B1", "Bottom Front Rail", "bottom_system", "B1", t1H, "carcass",
        "XZ", "Y", dx, r2(dx + mw), railY0, t1Rear, 0, botRail1, undefined));
      boards.push(mkBoard("B2", "Bottom Second Rail", "bottom_system", "B2", t2H, "carcass",
        "XZ", "Y", dx, r2(dx + mw), t1Rear, railRear, 0, botRail1, undefined));
      same("B1.y0", "tall.railY0");
      same("B1.y1", "tall.t1Rear");
      same("B2.y0", "tall.t1Rear");
      same("B2.y1", "tall.railRear");
      boards.push(mkBoard("B3", "Bottom Insert Board", "bottom_system", "B3", CPT, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, insDepth, botRail1, botBand1, insertProfile()));
    } else if (s.botSys.style === "style_2") {
      const sysH = s.botSys.frontRail;
      const th = R.STYLE_2_FRONT_SYSTEM_THICKNESS.value;
      const dep = R.STYLE_2_FRONT_SYSTEM_DEPTH.value;
      const inset = R.STYLE_2_FRONT_SYSTEM_Z_INSET.value;
      boards.push(mkBoard("BH1", "Bottom Style 2 Front System Panel", "bottom_system", "BH1", th, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, dep, inset, r2(inset + 15), undefined));
      boards.push(mkBoard("BottomStyle2FixedFrontPanel", "Bottom Style 2 Fixed Front Panel", "bottom_system", "style2_fixed_front_panel", FPT, "door",
        "XZ", "Y", r2(dx + s.sideClearance), r2(dx + mw - s.sideClearance), -FPT, 0, 0, sysH, undefined));
    }
    const t45 = R.T45_THICKNESS.value;
    const rearY1 = t5Rear;
    const rearY0 = t5Front;
    boards.push(mkBoard("T5", "T5 Rear Vertical Top Board", "top_system", "T5", t45, "carcass",
      "XZ", "Y", dx, r2(dx + mw), rearY0, rearY1, r2(CH - R.T5_REAR_VERTICAL_HEIGHT.value), CH, undefined));
    boards.push(mkBoard("T4", "T4 Rear Horizontal Top Board", "top_system", "T4", t45, "carcass",
      "XY", "Z", dx, r2(dx + mw), r2(rearY0 - R.T4_REAR_HORIZONTAL_DEPTH.value), rearY0, r2(CH - 16), r2(CH - R.T45_WALL_INSET.value), undefined));
    same("T5.y0", "tall.t5Front");
    same("T5.y1", "tall.t5Rear");
    same("T4.y1", "tall.t5Front");
  }

  /* ---- Zi 边界板：x 已是装配位（dx..dx+mw）；轮廓 x 相对本板（0..mw） ---- */
  // 全深 Zi 只有自身高度碰到避让时才收到 y1 = md − ad。双门竖分隔两侧的边界不缩短。
  const avoidShortY = r2(md - s.avoid.depth);
  const isDividerSupportBoundary = (boundary: Boundary) => {
    const upperId = boundary.id.replace(/^boundary-/, "");
    const upperIdx = s.zones.findIndex((z) => z.id === upperId);
    if (upperIdx < 0) return false;
    const hasDivider = (z: GTZone | undefined) => z?.type === "double_door" && z.verticalDivider === true;
    return hasDivider(s.zones[upperIdx]) || hasDivider(s.zones[upperIdx - 1]);
  };
  for (const b of boundaries) {
    if (b.boundaryType === "none") continue;
    let type = b.boundaryType;
    let y1 = md;
    let prof: P2[];
    const hitsAvoid = s.avoid.enabled && s.avoid.depth > 0 && s.avoid.height > 0 && s.avoid.depth < md
      && b.z0 < s.avoid.height && b.z1 > 0 && !isDividerSupportBoundary(b);
    if (type === "half_zi") {
      y1 = md; // bbox 用 midDepth（轮廓仅前 150，坑②：profile/bbox 双参考）
      prof = halfZiProfile(s);
    } else {
      prof = fullZiProfile(s);
      if (hitsAvoid) {
        type = "shortened_zi";
        y1 = avoidShortY;
        prof = fullZiProfile(s).map((p) => ("y" in p && !("z" in p) ? { ...p, y: Math.min((p as { y: number }).y, y1) } : p));
      }
    }
    boards.push(mkBoard(`Zi_${b.id}`, `Boundary ${b.id}`, "boundary_panel", type, s.ziT, "carcass",
      "XY", "Z", dx, r2(dx + mw), 0, y1, b.z0, b.z1, prof));
  }

  /* ---- H 支撑（top：H13/H24；bottom/mid：H13/H24/H34；mid 冲突移动；blank → H12） ---- */
  interface HSpec { name: string; z0: number; z1: number; }
  const hTop: HSpec[] = [{ name: "H13_top", z0: r2(CH - R.H_SUPPORT_HEIGHT.value), z1: CH }, { name: "H24_top", z0: r2(CH - R.H_SUPPORT_HEIGHT.value), z1: CH }];
  const omitBottomForRaised = fridgeMode === "raised";
  const hBottom: HSpec[] = omitBottomForRaised ? [] : [
    { name: "H13_bottom", z0: 0, z1: R.H_SUPPORT_HEIGHT.value },
    { name: "H24_bottom", z0: 0, z1: R.H_SUPPORT_HEIGHT.value },
    { name: "H34_bottom", z0: 0, z1: R.H_SUPPORT_HEIGHT.value },
  ];
  const Hspan = R.H_SUPPORT_HEIGHT.value;
  let hMid: HSpec[] = [
    { name: "H13_mid", z0: r2(CH / 2 - Hspan / 2), z1: r2(CH / 2 + Hspan / 2) },
    { name: "H24_mid", z0: r2(CH / 2 - Hspan / 2), z1: r2(CH / 2 + Hspan / 2) },
    { name: "H34_mid", z0: r2(CH / 2 - Hspan / 2), z1: r2(CH / 2 + Hspan / 2) },
  ];
  // 双门竖分隔的下沿隔板是中撑的基准：三件中撑在隔板上沿共面成环（双门区内），
  // 随隔板定而不随柜高动；侧撑落进下方区（抽屉）是错的。
  const vdZone = [...zoneItems].reverse().find((zi) => zi.zone.type === "double_door" && zi.zone.verticalDivider === true);
  const vdShelf = vdZone
    ? boundaries.find((b) => b.id === `boundary-${vdZone.zone.id}` && (b.boundaryType === "full_zi" || b.boundaryType === "shortened_zi"))
    : undefined;
  if (vdShelf) {
    const above0 = r2(vdShelf.z1 - 1);
    for (const h of hMid) {
      h.z0 = above0; h.z1 = r2(above0 + Hspan);
    }
  }
  const hZiConflicts: string[] = [];
  for (const zi of boundaries) {
    if (zi.boundaryType !== "full_zi" && zi.boundaryType !== "shortened_zi") {
      if (zi.boundaryType === "half_zi" && hMid.some((h) => h.z0 < zi.z1 && h.z1 > zi.z0)) {
        warnings.push(`H mid overlaps half Zi ${zi.id}; half Zi movement rule deferred.`);
      }
      continue;
    }
    if (vdShelf || !hMid.some((h) => h.z0 < zi.z1 && h.z1 > zi.z0)) continue;
    const H = R.H_SUPPORT_HEIGHT.value;
    for (const h of hMid) {
      if (!(h.z0 < zi.z1 && h.z1 > zi.z0)) continue;
      if (h.name === "H34_mid") {
        const nz0 = r2(zi.z1 - 1), nz1 = r2(zi.z1 - 1 + H);
        if (nz1 > CH) { hZiConflicts.push(`${h.name} movement above Zi would exceed cabinet bounds; movement skipped.`); continue; }
        h.z0 = nz0; h.z1 = nz1;
      } else {
        const nz1 = r2(zi.z0 - 1), nz0 = r2(zi.z0 - 1 - H);
        if (nz0 < 0) { hZiConflicts.push(`${h.name} movement below Zi would exceed cabinet bounds; movement skipped.`); continue; }
        h.z0 = nz0; h.z1 = nz1;
      }
      warnings.push(`H ${h.name} overlaps ${zi.boundaryType} ${zi.id}; Stage 2 movement evaluated.`);
    }
  }
  let hBottomZ0: number | undefined;
  let hBottomZ1: number | undefined;
  if (s.avoid.enabled && s.avoid.height > 0) {
    hBottomZ0 = dim("tall.hBottomZ0", { h: s.avoid.height }, (t) => t.h);
    hBottomZ1 = dim("tall.hBottomZ1", { z0: ref("tall.hBottomZ0"), H: R.H_SUPPORT_HEIGHT }, (t) => t.z0 + t.H);
    for (const h of hBottom) {
      h.z0 = hBottomZ0;
      h.z1 = hBottomZ1;
    }
  }
  for (const h of [...hTop, ...hBottom, ...hMid]) {
    if (h.name.startsWith("H13")) {
      boards.push(mkBoard(h.name, "H Bridge Left", "h_support", h.name, s.hT, "carcass",
        "YZ", "X", dx, r2(dx + R.H_SUPPORT_THICKNESS.value),
        hY0, hY1, h.z0, h.z1, undefined));
      same(`${h.name}.y0`, "tall.hY0");
      same(`${h.name}.y1`, "tall.hY1");
    } else if (h.name.startsWith("H24")) {
      boards.push(mkBoard(h.name, "H Bridge Right", "h_support", h.name, s.hT, "carcass",
        "YZ", "X", r2(dx + mw - R.H_SUPPORT_THICKNESS.value), r2(dx + mw),
        hY0, hY1, h.z0, h.z1, undefined));
      same(`${h.name}.y0`, "tall.hY0");
      same(`${h.name}.y1`, "tall.hY1");
    } else {
      boards.push(mkBoard(h.name, "H Bridge Rear", "h_support", h.name, s.hT, "carcass",
        "XZ", "Y", r2(dx + R.H_SUPPORT_THICKNESS.value), r2(dx + mw - R.H_SUPPORT_THICKNESS.value),
        r2(md - R.H34_DEPTH.value), md, h.z0, h.z1, undefined));
    }
    if (hBottomZ0 != null && h.name.endsWith("_bottom")) {
      same(`${h.name}.z0`, "tall.hBottomZ0");
      same(`${h.name}.z1`, "tall.hBottomZ1");
    }
  }
  if (fridgeMode === "raised" && fridgeZoneItem) {
    const below = boundaries.find((b) => b.id === `boundary-${fridgeZoneItem.zone.id}`);
    const hz0 = below ? below.z1 : fridgeZoneItem.z0;
    const hz1 = r2(hz0 + R.H_SUPPORT_HEIGHT.value);
    const hFridge: HSpec[] = [
      { name: "H13_fridge", z0: hz0, z1: hz1 },
      { name: "H24_fridge", z0: hz0, z1: hz1 },
      { name: "H34_fridge", z0: hz0, z1: hz1 },
    ];
    for (const h of hFridge) {
      if (h.name.startsWith("H13")) {
        boards.push(mkBoard(h.name, "H13 fridge", "h_support", "H13_fridge", s.hT, "carcass",
          "YZ", "X", dx, r2(dx + R.H_SUPPORT_THICKNESS.value),
          hY0, hY1, h.z0, h.z1, undefined));
        same(`${h.name}.y0`, "tall.hY0");
        same(`${h.name}.y1`, "tall.hY1");
      } else if (h.name.startsWith("H24")) {
        boards.push(mkBoard(h.name, "H24 fridge", "h_support", "H24_fridge", s.hT, "carcass",
          "YZ", "X", r2(dx + mw - R.H_SUPPORT_THICKNESS.value), r2(dx + mw),
          hY0, hY1, h.z0, h.z1, undefined));
        same(`${h.name}.y0`, "tall.hY0");
        same(`${h.name}.y1`, "tall.hY1");
      } else {
        boards.push(mkBoard(h.name, "H34 fridge", "h_support", "H34_fridge", s.hT, "carcass",
          "XZ", "Y", r2(dx + R.H_SUPPORT_THICKNESS.value), r2(dx + mw - R.H_SUPPORT_THICKNESS.value),
          r2(md - R.H34_DEPTH.value), md, h.z0, h.z1, undefined));
      }
    }
  }

  /* ---- blank_panel 区 H12 支撑 ---- */
  for (const zi of zoneItems) {
    if (zi.zone.type !== "blank_panel") continue;
    const H = R.H_SUPPORT_HEIGHT.value;
    if (zi.height >= R.H12_SPLIT_HEIGHT.value) {
      boards.push(mkBoard(`H12_${zi.zone.id}_top`, "H12 Support Top", "blank_panel_support", "H12", s.hT, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, R.H12_DEPTH.value, r2(zi.z1 - H), zi.z1, undefined));
      boards.push(mkBoard(`H12_${zi.zone.id}_bottom`, "H12 Support Bottom", "blank_panel_support", "H12", s.hT, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, R.H12_DEPTH.value, zi.z0, r2(zi.z0 + H), undefined));
    } else {
      boards.push(mkBoard(`H12_${zi.zone.id}`, "H12 Support", "blank_panel_support", "H12", s.hT, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, R.H12_DEPTH.value, zi.z0, zi.z1, undefined));
    }
  }

  /* ---- VD 竖分隔（double_door + verticalDivider）+ 舌 + zi_groove + h34 槽 ---- */
  const vdBoards: { id: string; zoneItem: StackItem & { zone: GTZone }; coreX: number }[] = [];
  for (const zi of zoneItems) {
    if (zi.zone.type !== "double_door" || zi.zone.verticalDivider !== true) continue;
    const coreX = asNum(zi.zone.dividerCenterX, mw / 2);
    if (coreX <= 0 || coreX >= mw) {
      errors.push(`Divider center X ${coreX} for zone ${zi.zone.id} is outside MidWidth.`);
      continue;
    }
    vdBoards.push({ id: `VD_${zi.zone.id}`, zoneItem: zi, coreX });
  }
  for (const vd of vdBoards) {
    const { zoneItem, coreX } = vd;
    const z0 = zoneItem.z0, z1 = zoneItem.z1;
    const x0 = r2(dx + coreX - s.dividerT / 2), x1 = r2(dx + coreX + s.dividerT / 2);
    const tongue = r2(CPT / 2 - R.DIVIDER_TONGUE_GROOVE_CLEARANCE.value);
    const ty0 = r2(md / 3), ty1 = r2((2 * md) / 3);
    const h34CutY0 = r2(md - R.H34_CLEARANCE_DEPTH.value);
    const rearBottomZ = r2(z0 - tongue);
    const h34Cuts: { z0: number; z1: number }[] = [];
    const h34Bands = boards
      .filter((board) => board.id.startsWith("H34"))
      .map((board) => ({ z0: Math.max(board.z0, z0), z1: Math.min(board.z1, z1) }))
      .filter((band) => band.z1 - band.z0 > EPS);
    const t5z0 = r2(CH - R.T5_REAR_VERTICAL_HEIGHT.value - R.H34_Z_BELOW.value);
    const t5Top = r2(Math.min(z1, CH));
    if (t5Top > Math.max(z0, t5z0) + EPS) h34Bands.push({ z0: r2(Math.max(z0, t5z0)), z1: t5Top });
    h34Bands.sort((a, b) => a.z0 - b.z0);
    for (const band of h34Bands) {
      const prev = h34Cuts[h34Cuts.length - 1];
      if (prev && band.z0 <= prev.z1 + EPS) prev.z1 = r2(Math.max(prev.z1, band.z1));
      else h34Cuts.push({ z0: r2(band.z0), z1: r2(band.z1) });
    }
    const rear: [number, number][] = [[md, rearBottomZ]];
    let zCursor = rearBottomZ;
    for (const cut of h34Cuts) {
      const cz0 = r2(Math.max(cut.z0, zCursor));
      const cz1 = r2(cut.z1);
      if (cz1 <= zCursor + EPS) continue;
      if (cz0 > zCursor + EPS) rear.push([md, cz0]);
      rear.push([h34CutY0, cz0], [h34CutY0, cz1]);
      if (cz1 < z1 - EPS) rear.push([md, cz1]);
      zCursor = cz1;
    }
    if (z1 > zCursor + EPS) rear.push([md, z1]);
    const prof: P2[] = yz([
      [0, rearBottomZ], [ty0, rearBottomZ], [ty0, z0], [ty1, z0], [ty1, rearBottomZ],
      ...rear,
      [0, z1], [0, rearBottomZ],
    ]);
    boards.push(mkBoard(vd.id, `Vertical Divider ${zoneItem.zone.id}`, "vertical_divider", "vertical_divider",
      s.dividerT, "carcass", "YZ", "X", x0, x1, 0, md, z0, z1, prof));
    // 上下边界的 full_zi 挂 zi_groove（x 已是装配位 = dx + core）
    for (const b of boundaries) {
      if (b.boundaryType !== "full_zi") continue;
      const isUpper = Math.abs(b.z0 - z1) < EPS;
      const isLower = Math.abs(b.z1 - z0) < EPS;
      if (!isUpper && !isLower) continue;
      ziGrooves.push({
        id: `zi_groove_${vd.id}_${b.id}`, boardId: `Zi_${b.id}`,
        face: isLower ? "top" : "bottom",
        x0: r2(dx + coreX - (s.dividerT + R.ZI_GROOVE_WIDTH_CLEARANCE.value) / 2),
        x1: r2(dx + coreX + (s.dividerT + R.ZI_GROOVE_WIDTH_CLEARANCE.value) / 2),
        y0: r2(md / 3 - R.ZI_GROOVE_Y_OVERHANG.value), y1: r2((2 * md) / 3 + R.ZI_GROOVE_Y_OVERHANG.value),
        depth: r2(CPT / 2),
      });
    }
  }

  /* ---- DS 门层板（门板区 shelfEnabled；双门 VD 拆 _L/_R） ---- */
  const dsBoards: { id: string; zone: StackItem & { zone: GTZone }; x0: number; x1: number; z0: number; z1: number }[] = [];
  for (const zi of zoneItems) {
    const zt = zi.zone.type;
    if (!PANEL_TYPES.has(zt) || zt === "drawer" || zt === "top_flap" || zt === "bottom_flap") continue;
    if (zi.zone.shelfEnabled !== true) continue;
    if (zi.height < R.DOOR_SHELF_MIN_ZONE_HEIGHT.value) continue;
    const shelfTopZ = r2(zi.z0 + asNum(zi.zone.shelfHeight, Math.round(zi.height / 2)));
    if (!(shelfTopZ > zi.z0 && shelfTopZ < zi.z1)) continue;
    const th = CPT;
    const z0 = r2(shelfTopZ - th), z1 = shelfTopZ;
    const vd = vdBoards.find((v) => v.zoneItem.zone.id === zi.zone.id);
    if (zt === "double_door" && vd) {
      const vx0 = r2(dx + vd.coreX - s.dividerT / 2), vx1 = r2(dx + vd.coreX + s.dividerT / 2);
      dsBoards.push({ id: `DS_${zi.zone.id}_L`, zone: zi, x0: dx, x1: vx0, z0, z1 });
      dsBoards.push({ id: `DS_${zi.zone.id}_R`, zone: zi, x0: vx1, x1: r2(dx + mw), z0, z1 });
    } else {
      dsBoards.push({ id: `DS_${zi.zone.id}`, zone: zi, x0: dx, x1: r2(dx + mw), z0, z1 });
    }
  }
  for (const ds of dsBoards) {
    boards.push(mkBoard(ds.id, "Door Shelf", "door_shelf", "door_shelf", CPT, "carcass",
      "XY", "Z", ds.x0, ds.x1, 0, md, ds.z0, ds.z1, undefined));
  }

  /* ---- frontPanels（数据层：叶解析 + 铰链 + 锁） ---- */
  const frontPanels: { id: string; zone: StackItem & { zone: GTZone }; x0: number; x1: number; z0: number; z1: number; leaf: "single" | "L" | "R" }[] = [];
  const isOpenZone = (t: GTZoneType | undefined) => t === "open_space" || t === "open_appliance" || t === "fridge";
  if (s.panelsOn) {
    const frontZones = zoneItems.filter((zi) => PANEL_TYPES.has(zi.zone.type));
    for (const zi of frontZones) {
      const zt = zi.zone.type;
      const idx = zoneItems.indexOf(zi);
      const next = zoneItems[idx + 1];
      const belowBoundary = boundaries.find((b) => b.id === `boundary-${zi.zone.id}`);
      const aboveBoundary = next ? boundaries.find((b) => b.id === `boundary-${next.zone.id}`) : undefined;
      const below = belowBoundary ?? (idx === 0 ? botSys : zoneItems[idx - 1]);
      const above = aboveBoundary ?? next ?? topSys;
      const lowerZone = belowBoundary ? zoneItems[idx - 1] : undefined;
      const upperZone = aboveBoundary ? next : undefined;
      let z0: number;
      let z1: number;
      if (zi === frontZones[0] && below.kind === "bottom_system") {
        z0 = s.botSys.style === "style_1" ? s.botSys.frontRail : r2(s.botSys.frontRail + s.fc);
      } else if (below.kind === "boundary_panel") {
        if (lowerZone && isOpenZone(lowerZone.zone.type)) z0 = r2(below.z0 + s.fc);
        else z0 = r2(below.centerZ + s.fc / 2);
      } else if (below.kind === "functional_zone") {
        const belowZone = below as StackItem & { zone?: GTZone };
        z0 = belowZone.zone && PANEL_TYPES.has(belowZone.zone.type) ? r2(zi.z0 + s.fc / 2) : r2(zi.z0 + s.fc);
      } else {
        z0 = r2(zi.z0 + s.fc / 2);
      }
      if (zi === frontZones[frontZones.length - 1] && above.kind === "top_system") {
        z1 = s.topSys.style === "style_1" ? r2(CH - s.topSys.frontRail) : r2(CH - s.topSys.frontRail - s.fc);
      } else if (above.kind === "boundary_panel") {
        if (upperZone && isOpenZone(upperZone.zone.type)) z1 = r2(above.z1 - s.fc);
        else z1 = r2(above.centerZ - s.fc / 2);
      } else if (above.kind === "functional_zone") {
        const aboveZone = above as StackItem & { zone?: GTZone };
        z1 = aboveZone.zone && PANEL_TYPES.has(aboveZone.zone.type) ? r2(zi.z1 - s.fc / 2) : r2(zi.z1 - s.fc);
      } else {
        z1 = r2(zi.z1 - s.fc / 2);
      }
      const x0 = r2(s.leftT + s.fc), x1 = r2(s.CW - s.rightT - s.fc);
      if (zt === "double_door") {
        const mid = r2((x0 + x1) / 2);
        frontPanels.push({ id: `FP_${zi.zone.id}_L`, zone: zi, x0, x1: r2(mid - s.fc / 2), z0, z1, leaf: "L" });
        frontPanels.push({ id: `FP_${zi.zone.id}_R`, zone: zi, x0: r2(mid + s.fc / 2), x1, z0, z1, leaf: "R" });
      } else {
        frontPanels.push({ id: `FP_${zi.zone.id}`, zone: zi, x0, x1, z0, z1, leaf: "single" });
      }
    }
  }
  for (const fp of frontPanels) {
    boards.push(mkBoard(fp.id, "Front Panel", "front_panel", "front_panel", FPT, "door",
      "XZ", "Y", fp.x0, fp.x1, -FPT, 0, fp.z0, fp.z1, undefined));
    const hs = { ...fp.zone.zone.hingeSettings };
    const cupD = asNum(hs.cupDiameter, R.HINGE_CUP_DIAMETER.value);
    const cupDepth = asNum(hs.cupDepth, R.HINGE_CUP_DEPTH.value);
    const fromEdge = asNum(hs.cupCenterFromEdge, R.HINGE_CUP_FROM_EDGE.value);
    const zt = fp.zone.zone.type;
    if (zt !== "drawer") {
      const h = r2(fp.z1 - fp.z0);
      let sd: number;
      if (hs.sideDistance && hs.sideDistance !== "auto" && Number.isFinite(Number(hs.sideDistance))) {
        sd = Number(hs.sideDistance);
      } else {
        sd = R.HINGE_SD_MIN.value + (h - R.HINGE_SD_SPAN.value) * R.SD_GAIN_NUM.value / R.SD_GAIN_DEN.value;
        sd = Math.min(R.HINGE_SD_MAX.value, Math.max(R.HINGE_SD_MIN.value, sd));
      }
      const hingeLeft = zt === "left_side_door" || zt === "side_door" || (zt === "double_door" && fp.leaf === "L");
      const cx = hingeLeft ? r2(fp.x0 + fromEdge) : r2(fp.x1 - fromEdge);
      const centers = [{ z: r2(fp.z1 - sd) }, { z: r2(fp.z0 + sd) }];
      if (hs.useThreeHinges) centers.push({ z: r2((fp.z0 + fp.z1) / 2) });
      centers.forEach((c, i) => {
        hinges.push({ id: `${fp.id}_hinge_${i + 1}`, panelId: fp.id, centerX: cx, centerZ: c.z, diameter: cupD, depth: cupDepth });
      });
    }
    // 锁（五种 lockPosition）
    if (s.locksOn && fp.zone.zone.lockPosition) {
      const lw = R.LOCK_SLOT_LENGTH.value, lh = R.LOCK_SLOT_WIDTH.value;
      const cx = r2((fp.x0 + fp.x1) / 2);
      const zt2 = fp.zone.zone;
      let cz: number | null = null;
      let mountingFace: "top" | "bottom" | "side" = "bottom";
      let mountingBoardId: string | undefined;
      const lp = zt2.lockPosition;
      if (lp === "top") { cz = r2(fp.z1 - R.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value); mountingFace = "top"; }
      else if (lp === "bottom") { cz = r2(fp.z0 + R.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value); mountingFace = "bottom"; }
      else if (lp === "side") {
        mountingFace = "side";
        mountingBoardId = `VD_${fp.zone.zone.id}`;
        cz = r2(fp.zone.z0 + asNum(zt2.lockHeight, 0));
        if (cz > fp.z1) {
          cz = fp.z1;
          warnings.push(`Zone ${fp.zone.zone.id}: side lock center Z outside panel Z; clamped.`);
        }
      } else {
        const ds = dsBoards.find((d) => d.zone.zone.id === fp.zone.zone.id
          && (fp.leaf === "single" || d.id.endsWith(`_${fp.leaf}`)));
        if (ds) {
          cz = lp === "shelf_top" ? r2(ds.z1 + R.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value) : r2(ds.z0 - R.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
          mountingFace = lp === "shelf_top" ? "top" : "bottom";
        } else {
          cz = r2(fp.z0 + R.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
          warnings.push(`Zone ${fp.zone.zone.id}: no horizontal shelf board found for ${lp} lock; fallback to bottom face.`);
        }
      }
      if (cz != null) {
        locks.push({
          id: `${fp.id}_lock`, panelId: fp.id, centerX: cx, centerZ: cz,
          width: lw, height: lh, radius: r2(lh / 2), mountingFace, mountingBoardId,
        });
      }
    }
  }

  /* ---- 侧板：y∈[−FPT, midDepth]；避让缺口用柜体 Y ---- */
  const mkSidePanel = (side: "L" | "R", t: number, adapt: boolean) => {
    const x0 = side === "L" ? 0 : r2(s.CW - t);
    let prof: P2[] | undefined;
    if (s.avoid.enabled && s.avoid.depth > 0 && s.avoid.height > 0 && adapt) {
      const ad = s.avoid.depth, ah = s.avoid.height;
      prof = yz([[-FPT, 0], [r2(md - ad), 0], [r2(md - ad), ah], [md, ah], [md, CH], [-FPT, CH]]);
    }
    boards.push(mkBoard(`SidePanel_${side}`, `Side Panel ${side === "L" ? "Left" : "Right"}`, "side_panel", "side_panel",
      t, "carcass", "YZ", "X", x0, r2(x0 + t), -FPT, md, 0, CH, prof));
  };
  if (s.leftT > 0) mkSidePanel("L", s.leftT, s.leftAdapt);
  if (s.rightT > 0) mkSidePanel("R", s.rightT, s.rightAdapt);

  /* ---- 避让支撑 ---- */
  if (s.avoid.enabled && s.avoid.depth > 0 && s.avoid.height > R.AVOIDANCE_SUPPORT_THICKNESS.value) {
    const ad = s.avoid.depth, ah = s.avoid.height;
    const at = R.AVOIDANCE_SUPPORT_THICKNESS.value;
    const avoidY0 = dim("tall.avoidY0", { md: ref("tall.midDepth"), ad }, (t) => t.md - t.ad);
    const avoidY1 = dim("tall.avoidY1", { md: ref("tall.midDepth") }, (t) => t.md);
    boards.push(mkBoard("avoidance_horizontal", "Avoidance Horizontal", "avoidance_support", "avoidance_horizontal",
      at, "carcass", "XY", "Z", dx, r2(dx + mw), avoidY0, avoidY1, r2(ah - at), ah, undefined));
    same("avoidance_horizontal.y0", "tall.avoidY0");
    same("avoidance_horizontal.y1", "tall.avoidY1");
    boards.push(mkBoard("Avoidance_Vertical", "Avoidance Vertical", "avoidance_support", "avoidance_vertical",
      at, "carcass", "XZ", "Y", dx, r2(dx + mw), avoidY0, r2(avoidY0 + at), 0, r2(ah - at), undefined));
  }

  /* ---- 组装 ---- */
  attachFaces(boards);
  const joints: Joint[] = buildTallFaces({ boards, ziSlots, ziGrooves, hinges, locks });

  const result: GTResult = {
    params: {
      cabinetHeight: CH, cabinetWidth: s.CW, cabinetDepth: CD,
      midWidth: mw, midDepth: md,
      panelThickness: CPT, frontPanelThickness: FPT, ziThickness: s.ziT,
    },
    boards,
    stack: [
      botSys,
      ...(() => {
        const out: StackItem[] = [];
        for (const zi of zoneItems) {
          const b = boundaries.find((x) => x.id === `boundary-${zi.zone.id}`);
          if (b) out.push(b);
          out.push(zi);
        }
        return out;
      })(),
      topSys,
    ],
    ziSlots, ziGrooves, hinges, locks, joints,
    validation: { errors, warnings },
  };
  result.debug = {
    provenance: endProvenance(), boardFrame: "final",
    midWidth: mw, midDepth: md, hZiConflicts,
    fridgeAvoidance: { finalMode: fridgeMode, fridgeGap, fridgeBaseBottomZ },
  };
  return result;
}
