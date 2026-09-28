/**
 * 高柜生成器。一套柜体坐标，接缝先写成规则，板再坐上去。
 * y=0 是门背。门在 −门厚..0。侧板后缘 = midDepth。立板从 y=0 起，比门厚基准朝前一个门厚。
 * 顶轨后缘停在立板前脸之前一个门厚。底部横桥在避让打开时抬到避让高度。
 */
import { beginProvenance, dim, endProvenance, ex, lit, param, ref, same, valueOf, type Expr } from "../_lib/dim.ts";
import { attachFaces } from "../_lib/model.ts";
import { applyDoorSides, doorColourOf } from "../_lib/finish.ts";
import { applyGrain } from "../_lib/grain.ts";
import { applyMilling } from "../_lib/milling.ts";
import { recordBoardBox } from "../_lib/recordBox.ts";
import { evalExpr, recordLoop } from "../_lib/trace.ts";
import { buildTallFaces } from "./faces.ts";
import type {
  Board, GTParams, GTResult, GTZone, GTZoneType, HingeRecord, Joint,
  LockRecord, StackItem, BoundaryType, ZiGrooveRecord, ZiSlotRecord,
} from "./types.ts";
import { RULES as R } from "./rules.ts";

export { generateGTSvgPreview } from "./svgPreview.ts";
export { GT_UI_PRESETS } from "./uiPresets.ts";

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
  leftFinish: "colour" | "carcass"; rightFinish: "colour" | "carcass";
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
  // A colour side is door stock (door thickness); a carcass side is carcass stock.
  const leftFinish: "colour" | "carcass" = input.leftSidePanelFinish === "colour" ? "colour" : "carcass";
  const rightFinish: "colour" | "carcass" = input.rightSidePanelFinish === "colour" ? "colour" : "carcass";
  for (const [name, t] of [["Left", leftT], ["Right", rightT]] as const) {
    if (t !== 0 && t !== R.SIDE_PANEL_WHITELIST_15.value && t !== R.SIDE_PANEL_WHITELIST_16.value && t !== FPT && t !== CPT) {
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
    CH, CW, CD, CPT, FPT, ziT, hT, dividerT, leftT, rightT, leftFinish, rightFinish,
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
  // A slack zone already under the minimum (a drawer under a fridge) may keep its size; it only may not shrink further.
  const floor = Math.min(SLACK_ZONE_MIN, asNum(zones[index].height, SLACK_ZONE_MIN));
  const height = Math.max(floor, room);
  const nextZones = zones.map((zone, i) => (i === index ? { ...zone, height } : zone));
  const fitted = height === room ? H : r2(stacked.calculatedHeight + height);
  return { ...input, cabinetHeight: fitted, zones: nextZones };
}

/* ================= 轮廓工具 ================= */

type P2 = { x: number; y: number } | { y: number; z: number } | { x: number; z: number };

function yz(pts: [number, number][]): P2[] {
  return pts.map(([y, z]) => ({ y: r2(y), z: r2(z) }));
}

function link(key: string): Expr {
  return ex({ v: ref(key) }, (t) => t.v, `= ${key}`);
}

function yzTrace(id: string, pairs: [Expr, Expr][]): P2[] {
  return recordLoop(id, ["y", "z"], pairs, true).map(([y, z]) => ({ y, z }));
}

function xyTrace(id: string, pairs: [Expr, Expr][]): P2[] {
  return recordLoop(id, ["x", "y"], pairs, true).map(([x, y]) => ({ x, y }));
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
function v12Profile(s: S, slots: { z0: number; z1: number; boundaryId: string }[], id: string): P2[] {
  const shift = (localKey: string): Expr => ex(
    { y: ref(localKey), o: ref("tall.stileY0") },
    (t) => t.y + t.o,
    `${localKey.slice("tall.v12.".length)} + stileY0`,
  );
  const front = shift("tall.v12.front");
  const rear = shift("tall.v12.rear");
  const step = shift("tall.v12.step");
  const slotY = shift("tall.v12.slot");
  const zero = lit(0);
  const CH = link("tall.CH");
  const topStyle1 = s.topSys.style === "style_1";
  const botStyle1 = s.botSys.style === "style_1";
  const pairs: [Expr, Expr][] = botStyle1 ? [[front, zero], [rear, zero]] : [[rear, zero]];
  for (const sl of slots) {
    const z0 = link(`tall.slot.${sl.boundaryId}.z0`);
    const z1 = link(`tall.slot.${sl.boundaryId}.z1`);
    pairs.push([rear, z0], [slotY, z0], [slotY, z1], [rear, z1]);
  }
  pairs.push([rear, CH]);
  if (topStyle1) {
    dim(`${id}.topRail`, { CH: ref("tall.CH"), railH: ref("tall.topRailH"), ins: ref("tall.insertT") }, (t) => Math.round((t.CH - (t.railH - t.ins)) * 1000) / 1000, { formula: "CH - (railH - insertT)" });
    dim(`${id}.topBelow`, { rail: ref(`${id}.topRail`), ins: ref("tall.insertT") }, (t) => Math.round((t.rail - t.ins) * 1000) / 1000, { formula: "topRail - insertT" });
    const topRail = link(`${id}.topRail`);
    const below = link(`${id}.topBelow`);
    pairs.push([front, CH], [front, topRail], [step, topRail], [step, below], [zero, below]);
  } else {
    const notchD = shift("tall.v12.notchD");
    const notchZ = ex({ CH: ref("tall.CH"), t: ref("tall.notchT") }, (t) => Math.round((t.CH - t.t) * 1000) / 1000, "CH - notchT");
    pairs.push([notchD, CH], [notchD, notchZ], [zero, notchZ]);
  }
  if (botStyle1) {
    const botRail = link("tall.botRailH");
    const below = ex({ rail: ref("tall.botRailH"), ins: ref("tall.insertT") }, (t) => Math.round((t.rail - t.ins) * 1000) / 1000, "botRail - insertT");
    pairs.push([zero, botRail], [step, botRail], [step, below], [front, below], [front, zero]);
  } else {
    const notchD = shift("tall.v12.notchD");
    const notchT = link("tall.notchT");
    pairs.push([zero, notchT], [notchD, notchT], [notchD, zero], [rear, zero]);
  }
  return yzTrace(id, pairs);
}

/**
 * V3/V4 轮廓，直接写成柜体 Y（后立梃贴墙：局部 0 = 柜体 yOff = midDepth−150）。
 * 路径与 spec §8.3 一致：底边 → 后缘上到顶 L 缺口 → 沿前缘下行插入 Zi 槽。
 */
function v34Profile(s: S, slots: { z0: number; z1: number; boundaryId: string }[], warnings: string[], id: string): P2[] {
  const CH = link("tall.CH");
  const rear = link("tall.v34.rear");
  const off = link("tall.v34.yOff");
  const yAt = (local: Expr, name: string) => {
    dim(`${id}.ly.${name}`, local.terms, local.fn, { formula: local.formula });
    return ex({ y: ref(`${id}.ly.${name}`), off: ref("tall.v34.yOff") }, (t) => Math.round((t.y + t.off) * 1000) / 1000, `${local.formula ?? name} + yOff`);
  };
  const slotY = yAt(ex({ y: R.V34_ZI_SLOT_INNER }, (t) => t.y, "V34_ZI_SLOT_INNER"), "slot");
  const yRear = yAt(rear, "rear");
  const yZero = off;
  dim(`${id}.ni`, {
    rear: ref("tall.v34.rear"), span: R.V34_Y_REAR, inner: R.V34_TOP_NOTCH_INNER_Y,
  }, (t) => Math.max(0, t.rear - (t.span - t.inner)), { formula: "max(0, rear - (V34_Y_REAR - notchInner))" });
  dim(`${id}.nf`, {
    ni: ref(`${id}.ni`), rear: ref("tall.v34.rear"), span: R.V34_Y_REAR, front: R.V34_TOP_NOTCH_FRONT_Y,
  }, (t) => Math.max(0, Math.min(t.ni, t.rear - (t.span - t.front))), { formula: "max(0, min(ni, rear - (V34_Y_REAR - notchFront)))" });
  const yNi = yAt(link(`${id}.ni`), "ni");
  const yNf = yAt(link(`${id}.nf`), "nf");
  const zNotch = ex({ CH: ref("tall.CH"), nh: R.V34_NOTCH_HEIGHT }, (t) => Math.round((t.CH - t.nh) * 1000) / 1000, "CH - notchH");
  const zThick = ex({ CH: ref("tall.CH"), nt: R.V34_END_NOTCH_THICKNESS }, (t) => Math.round((t.CH - t.nt) * 1000) / 1000, "CH - notchT");
  const kept = slots.filter((sl) => {
    const ok = sl.z0 < s.CH - R.V34_NOTCH_HEIGHT.value && sl.z1 > 0;
    if (!ok) warnings.push(`Zi slot at z [${r2(sl.z0)}, ${r2(sl.z1)}] intersects avoidance/edge on V3/V4; slot omitted.`);
    return ok;
  }).sort((a, b) => b.z1 - a.z1);
  const pairs: [Expr, Expr][] = [];
  const ah = s.avoid.enabled && s.avoid.height > 0 && s.avoid.depth > 0 ? s.avoid.height : 0;
  if (ah > 0 && s.avoid.depth <= 150) {
    const yPartial = yAt(ex({ y: R.V_AVOIDANCE_PARTIAL_FRONT_Y }, (t) => t.y, "V_AVOIDANCE_PARTIAL_FRONT_Y"), "partial");
    const zAh = ex({ h: ah }, (t) => t.h, "avoidH");
    pairs.push([yZero, lit(0)], [yPartial, lit(0)], [yPartial, zAh], [yRear, zAh]);
  } else if (ah > 0) {
    const zAh = ex({ h: ah }, (t) => t.h, "avoidH");
    pairs.push([yZero, zAh], [yRear, zAh]);
  } else {
    pairs.push([yZero, lit(0)], [yRear, lit(0)]);
  }
  const zStart = pairs[0][1];
  pairs.push([yRear, zNotch], [yNi, zNotch], [yNi, zThick], [yNf, zThick], [yNf, CH], [yZero, CH]);
  for (const sl of kept) {
    const z0 = link(`tall.slot.${sl.boundaryId}.z0`);
    const z1 = link(`tall.slot.${sl.boundaryId}.z1`);
    pairs.push([yZero, z1], [slotY, z1], [slotY, z0], [yZero, z0]);
  }
  pairs.push([yZero, zStart]);
  return yzTrace(id, pairs);
}

/* ================= Zi 边界板轮廓（柜体坐标，x 从侧板内缘起） ================= */

function xOf(id: string, name: string, local: Expr): Expr {
  dim(`${id}.lx.${name}`, local.terms, local.fn, { formula: local.formula });
  return ex({ x: ref(`${id}.lx.${name}`), dx: ref("tall.leftT") }, (t) => Math.round((t.x + t.dx) * 1000) / 1000, `${local.formula ?? name} + leftSide`);
}

function fullZiProfile(id: string, yCap: number | null): P2[] {
  const capY = (e: Expr, name: string): Expr => {
    if (yCap == null) return e;
    dim(`${id}.yc.${name}`, e.terms, e.fn, { formula: e.formula });
    return ex({ y: ref(`${id}.yc.${name}`), cap: yCap }, (t) => Math.min(t.y, t.cap), `min(${e.formula ?? name}, avoidShort)`);
  };
  const cpt = ex({ CPT: ref("tall.CPT") }, (t) => t.CPT, "CPT");
  const zero = lit(0);
  const mw = link("tall.mw");
  const md = link("tall.md");
  const nd = ex({ d: R.ZI_FULL_FRONT_REAR_NOTCH_DEPTH }, (t) => t.d, "ZI_FULL_FRONT_REAR_NOTCH_DEPTH");
  const back = ex({ md: ref("tall.md"), d: R.ZI_FULL_FRONT_REAR_NOTCH_DEPTH }, (t) => Math.round((t.md - t.d) * 1000) / 1000, "midDepth - notch");
  const xCpt = xOf(id, "cpt", cpt);
  const x0 = xOf(id, "0", zero);
  const xMw = xOf(id, "mw", mw);
  const xMwC = xOf(id, "mwC", ex({ mw: ref("tall.mw"), CPT: ref("tall.CPT") }, (t) => t.mw - t.CPT, "midWidth - CPT"));
  const y0 = capY(lit(0), "0");
  const yNd = capY(nd, "nd");
  const yBack = capY(back, "back");
  const yMd = capY(md, "md");
  return xyTrace(id, [
    [xCpt, y0], [xCpt, yNd], [x0, yNd], [x0, yBack], [xCpt, yBack], [xCpt, yMd], [xMwC, yMd],
    [xMwC, yBack], [xMw, yBack], [xMw, yNd], [xMwC, yNd], [xMwC, y0], [xCpt, y0],
  ]);
}

function halfZiProfile(id: string): P2[] {
  const cpt = ex({ CPT: ref("tall.CPT") }, (t) => t.CPT, "CPT");
  const zero = lit(0);
  const nd = ex({ d: R.ZI_HALF_FRONT_NOTCH_DEPTH }, (t) => t.d, "ZI_HALF_FRONT_NOTCH_DEPTH");
  const dep = ex({ d: R.ZI_HALF_DEPTH }, (t) => t.d, "ZI_HALF_DEPTH");
  const x0 = xOf(id, "0", zero);
  const xCpt = xOf(id, "cpt", cpt);
  const xMw = xOf(id, "mw", link("tall.mw"));
  const xMwC = xOf(id, "mwC", ex({ mw: ref("tall.mw"), CPT: ref("tall.CPT") }, (t) => t.mw - t.CPT, "midWidth - CPT"));
  return xyTrace(id, [
    [x0, lit(0)], [x0, nd], [xCpt, nd], [xCpt, dep], [xMwC, dep], [xMwC, nd], [xMw, nd], [xMw, lit(0)], [x0, lit(0)],
  ]);
}

function insertProfile(id: string): P2[] {
  const dx = link("tall.leftT");
  const notch = ex({ n: R.STYLE_1_INSERT_FRONT_NOTCH_DEPTH }, (t) => t.n, "STYLE_1_INSERT_FRONT_NOTCH_DEPTH");
  const depth = ex({ d: R.STYLE_1_INSERT_BOARD_DEPTH }, (t) => t.d, "STYLE_1_INSERT_BOARD_DEPTH");
  const xIn = ex({ dx: ref("tall.leftT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.dx + t.CPT) * 1000) / 1000, "left + CPT");
  const xOut = ex({ dx: ref("tall.leftT"), mw: ref("tall.mw"), CPT: ref("tall.CPT") }, (t) => Math.round((t.dx + t.mw - t.CPT) * 1000) / 1000, "left + midWidth - CPT");
  const xEnd = ex({ dx: ref("tall.leftT"), mw: ref("tall.mw") }, (t) => Math.round((t.dx + t.mw) * 1000) / 1000, "left + midWidth");
  return xyTrace(id, [
    [dx, lit(0)], [dx, notch], [xIn, notch], [xIn, depth], [xOut, depth], [xOut, notch], [xEnd, notch], [xEnd, lit(0)],
  ]);
}

/* ================= 主流程 ================= */

function stampTallBoards(s: S, boards: Board[]) {
  dim("tall.topFront", { h: s.topSys.frontRail }, (t) => t.h, { formula: "frontRail" });
  dim("tall.botFront", { h: s.botSys.frontRail }, (t) => t.h, { formula: "frontRail" });
  const zero = lit(0);
  const ch = link("tall.CH");
  const dx = link("tall.leftT");
  const xEnd = ex({ x: ref("tall.leftT"), mw: ref("tall.mw") }, (t) => Math.round((t.x + t.mw) * 1000) / 1000, "left + midWidth");
  const xL1 = ex({ L: ref("tall.leftT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.L + t.CPT) * 1000) / 1000, "left + CPT");
  const xR1 = ex({ CW: ref("tall.CW"), R: ref("tall.rightT") }, (t) => Math.round((t.CW - t.R) * 1000) / 1000, "CW - right");
  const xR0 = ex({ CW: ref("tall.CW"), R: ref("tall.rightT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.CW - t.R - t.CPT) * 1000) / 1000, "CW - right - CPT");
  const yRear1 = ex({ y: ref("tall.v34.yOff"), r: ref("tall.v34.rear") }, (t) => Math.round((t.y + t.r) * 1000) / 1000, "yOff + rear");
  const negF = ex({ F: ref("tall.FPT") }, (t) => -t.F, "-FPT");
  const md = link("tall.md");
  const sideY1 = ex({ F: ref("tall.FPT"), md: ref("tall.md") }, (t) => Math.round((t.F + t.md) * 1000) / 1000, "FPT + midDepth");
  const hTop0 = ex({ CH: ref("tall.CH"), h: R.H_SUPPORT_HEIGHT }, (t) => Math.round((t.CH - t.h) * 1000) / 1000, "CH - H_SUPPORT_HEIGHT");
  const hHi = ex({ h: R.H_SUPPORT_HEIGHT }, (t) => t.h, "H_SUPPORT_HEIGHT");
  const hX1 = ex({ x: ref("tall.leftT"), t: R.H_SUPPORT_THICKNESS }, (t) => Math.round((t.x + t.t) * 1000) / 1000, "left + H thickness");
  const hX0 = ex({ x: ref("tall.leftT"), mw: ref("tall.mw"), t: R.H_SUPPORT_THICKNESS }, (t) => Math.round((t.x + t.mw - t.t) * 1000) / 1000, "left + midWidth - H thickness");
  const t1z0 = ex({ CH: ref("tall.CH"), h: ref("tall.topFront") }, (t) => Math.round((t.CH - t.h) * 1000) / 1000, "CH - frontRail");
  const t3z0 = ex({ CH: ref("tall.CH"), h: ref("tall.topRailH") }, (t) => Math.round((t.CH - t.h) * 1000) / 1000, "CH - topRailH");
  const insY = ex({ d: R.STYLE_1_INSERT_BOARD_DEPTH }, (t) => t.d, "STYLE_1_INSERT_BOARD_DEPTH");
  const t5z0 = ex({ CH: ref("tall.CH"), h: R.T5_REAR_VERTICAL_HEIGHT }, (t) => Math.round((t.CH - t.h) * 1000) / 1000, "CH - T5 height");
  const t4y0 = ex({ y: ref("tall.t5Front"), d: R.T4_REAR_HORIZONTAL_DEPTH }, (t) => Math.round((t.y - t.d) * 1000) / 1000, "T5 front - T4 depth");
  const t4z0 = ex({ CH: ref("tall.CH"), t: R.STYLE_1_FIRST_RAIL_THICKNESS }, (t) => Math.round((t.CH - t.t) * 1000) / 1000, "CH - rail thickness");
  const t4z1 = ex({ CH: ref("tall.CH"), inset: R.T45_WALL_INSET }, (t) => Math.round((t.CH - t.inset) * 1000) / 1000, "CH - wall inset");
  const h34y0 = ex({ md: ref("tall.md"), d: R.H34_DEPTH }, (t) => Math.round((t.md - t.d) * 1000) / 1000, "midDepth - H34 depth");
  dim("tall.fc", { fc: s.fc }, (t) => t.fc, { formula: "frontClearance" });
  dim("tall.leaf.x0", { L: ref("tall.leftT"), fc: ref("tall.fc") }, (t) => Math.round((t.L + t.fc) * 1000) / 1000, { formula: "left + clearance" });
  dim("tall.leaf.x1", { CW: ref("tall.CW"), R: ref("tall.rightT"), fc: ref("tall.fc") }, (t) => Math.round((t.CW - t.R - t.fc) * 1000) / 1000, { formula: "CW - right - clearance" });
  dim("tall.leaf.midL", { x0: ref("tall.leaf.x0"), x1: ref("tall.leaf.x1"), fc: ref("tall.fc") }, (t) => Math.round(((t.x0 + t.x1) / 2 - t.fc / 2) * 1000) / 1000, { formula: "mid - clearance / 2" });
  dim("tall.leaf.midR", { x0: ref("tall.leaf.x0"), x1: ref("tall.leaf.x1"), fc: ref("tall.fc") }, (t) => Math.round(((t.x0 + t.x1) / 2 + t.fc / 2) * 1000) / 1000, { formula: "mid + clearance / 2" });
  for (const b of boards) {
    const put = (face: "x0" | "x1" | "y0" | "y1" | "z0" | "z1", e: Expr) => {
      if (Math.abs(evalExpr(e) - b[face]) > 0.05) return;
      dim(`${b.id}.${face}`, e.terms, e.fn, { formula: e.formula });
    };
    const id = b.id;
    if (id === "V1" || id === "V3") { put("x0", dx); put("x1", xL1); }
    if (id === "V2" || id === "V4") { put("x0", xR0); put("x1", xR1); }
    if (id === "V1" || id === "V2") { put("y0", link("tall.stileY0")); put("y1", link("tall.v12Rear")); put("z0", zero); put("z1", ch); }
    if (id === "V3" || id === "V4") { put("y0", link("tall.v34.yOff")); put("y1", yRear1); put("z0", zero); put("z1", ch); }
    if (id === "V5") {
      const onLeft = s.exteriorSide !== "left";
      put("x0", onLeft ? xL1 : ex({ x: ref("tall.CW"), R: ref("tall.rightT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.x - t.R - 2 * t.CPT) * 1000) / 1000, "CW - right - 2 CPT"));
      put("x1", onLeft ? ex({ L: ref("tall.leftT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.L + 2 * t.CPT) * 1000) / 1000, "left + 2 CPT") : ex({ CW: ref("tall.CW"), R: ref("tall.rightT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.CW - t.R - t.CPT) * 1000) / 1000, "CW - right - CPT"));
      put("y0", link("tall.FPT"));
      put("y1", sideY1);
      put("z0", ex({ z: b.z0 }, (t) => t.z, "fridgeZ0"));
      put("z1", ex({ z: b.z1 }, (t) => t.z, "fridgeZ1"));
      if (Number.isFinite(valueOf("tall.th1.z0"))) {
        put("y0", link("tall.stileY0"));
        put("y1", link("tall.v12Rear"));
        put("z1", link("tall.th1.z0"));
      }
    }
    if (/^(T[1-5]|B[1-3]|TH1|BH1)$/.test(id) || id.startsWith("Zi_")) { put("x0", dx); put("x1", xEnd); }
    if (id === "T1" || id === "T2") { put("z0", t1z0); put("z1", ch); }
    if (id === "T1" || id === "B1") { put("y0", link("tall.railY0")); put("y1", link("tall.t1Rear")); }
    if (id === "T2" || id === "B2") { put("y0", link("tall.t1Rear")); put("y1", link("tall.railRear")); }
    if (id === "B1" || id === "B2") { put("z0", zero); put("z1", link("tall.botFront")); }
    if (id === "T3") {
      put("y0", zero); put("y1", insY); put("z0", t3z0); put("z1", t1z0);
      put("z0", ex({ CH: ref("tall.CH"), h: ref("tall.topFront"), CPT: ref("tall.CPT") }, (t) => Math.round((t.CH - t.h - t.CPT) * 1000) / 1000, "CH - frontRail - CPT"));
    }
    if (id === "B3") {
      put("y0", zero); put("y1", insY); put("z0", link("tall.botFront")); put("z1", link("tall.botRailH"));
      put("z1", ex({ h: ref("tall.botFront"), CPT: ref("tall.CPT") }, (t) => Math.round((t.h + t.CPT) * 1000) / 1000, "frontRail + CPT"));
    }
    if (id === "T5") { put("y0", link("tall.t5Front")); put("y1", link("tall.t5Rear")); put("z0", t5z0); put("z1", ch); }
    if (id === "T4") { put("y0", t4y0); put("y1", link("tall.t5Front")); put("z0", t4z0); put("z1", t4z1); }
    if (id.startsWith("Zi_")) { put("y0", zero); put("y1", md); put("z0", ex({ z: b.z0 }, (t) => t.z, "boundaryZ0")); put("z1", ex({ z: b.z1 }, (t) => t.z, "boundaryZ1")); }
    if (id.startsWith("H13")) { put("x0", dx); put("x1", hX1); put("y0", link("tall.hY0")); put("y1", link("tall.hY1")); }
    if (id.startsWith("H24")) { put("x0", hX0); put("x1", xEnd); put("y0", link("tall.hY0")); put("y1", link("tall.hY1")); }
    if (id.startsWith("H34")) {
      put("x0", hX1);
      put("x1", hX0);
      if (Number.isFinite(valueOf("V5.x1"))) put("x0", link("V5.x1"));
      if (Number.isFinite(valueOf("V5.x0"))) put("x1", link("V5.x0"));
      put("y0", h34y0);
      put("y1", md);
    }
    if (/_mid$/.test(id) && id.startsWith("H")) {
      if (Number.isFinite(valueOf("tall.hMid.z0"))) {
        put("z0", link("tall.hMid.z0"));
        put("z1", link("tall.hMid.z1"));
      } else {
        put("z0", ex({ CH: ref("tall.CH"), h: R.H_SUPPORT_HEIGHT }, (t) => Math.round((t.CH / 2 - t.h / 2) * 1000) / 1000, "CH / 2 - H / 2"));
        put("z1", ex({ CH: ref("tall.CH"), h: R.H_SUPPORT_HEIGHT }, (t) => Math.round((t.CH / 2 + t.h / 2) * 1000) / 1000, "CH / 2 + H / 2"));
      }
    }
    if (id.startsWith("VD_")) {
      put("x0", ex({ x: ref("tall.leftT"), mw: ref("tall.mw"), t: param({ divider: s.dividerT }).divider }, (t) => Math.round((t.x + t.mw / 2 - t.t / 2) * 1000) / 1000, "centre - divider / 2"));
      put("x1", ex({ x: ref("tall.leftT"), mw: ref("tall.mw"), t: param({ divider: s.dividerT }).divider }, (t) => Math.round((t.x + t.mw / 2 + t.t / 2) * 1000) / 1000, "centre + divider / 2"));
      put("y0", zero);
      put("y1", md);
      put("z0", ex({ z: b.z0 }, (t) => t.z, "zoneZ0"));
      put("z1", ex({ z: b.z1 }, (t) => t.z, "zoneZ1"));
    }
    if (id.startsWith("FP_")) {
      if (id.endsWith("_L")) { put("x0", link("tall.leaf.x0")); put("x1", link("tall.leaf.midL")); }
      else if (id.endsWith("_R")) { put("x0", link("tall.leaf.midR")); put("x1", link("tall.leaf.x1")); }
      else { put("x0", link("tall.leaf.x0")); put("x1", link("tall.leaf.x1")); }
      put("y0", negF);
      put("y1", zero);
      put("z0", ex({ z: b.z0 }, (t) => t.z, "leafZ0"));
      put("z1", ex({ z: b.z1 }, (t) => t.z, "leafZ1"));
    }
    if (/_top$/.test(id) && id.startsWith("H")) { put("z0", hTop0); put("z1", ch); }
    if (/_bottom$/.test(id) && id.startsWith("H")) { put("z0", zero); put("z1", hHi); }
    if (id.startsWith("FP_") || id.endsWith("FixedFrontPanel")) { put("y0", negF); put("y1", zero); }
    if (id === "TopStyle2FixedFrontPanel" && Number.isFinite(valueOf("tall.th1.z0"))) {
      put("x0", xL1);
      put("x1", xR0);
      if (Number.isFinite(valueOf("V5.x1"))) { put("x0", link("V5.x1")); put("x1", link("V5.x0")); }
      put("y0", zero);
      put("y1", link("tall.FPT"));
      put("z0", t1z0);
      put("z1", link("tall.th1.z0"));
    }
    if (id === "TH1" && Number.isFinite(valueOf("tall.th1.z0"))) put("z0", link("tall.th1.z0"));
    if (id.startsWith("SidePanel_")) { put("y0", negF); put("y1", md); put("z0", zero); put("z1", ch); }
    if (id.startsWith("SidePanel_L")) { put("x0", zero); put("x1", link("tall.leftT")); }
    if (id.startsWith("SidePanel_R")) { put("x1", link("tall.CW")); put("x0", ex({ CW: ref("tall.CW"), R: ref("tall.rightT") }, (t) => Math.round((t.CW - t.R) * 1000) / 1000, "CW - right")); }
    if (id === "avoidance_horizontal" || id === "Avoidance_Vertical") { put("x0", dx); put("x1", xEnd); }
    if (s.avoid.enabled) {
      const avoidH = ex({ h: s.avoid.height }, (t) => t.h, "avoidH");
      const avoidZ0 = ex({ h: s.avoid.height, t: R.AVOIDANCE_SUPPORT_THICKNESS }, (t) => Math.round((t.h - t.t) * 1000) / 1000, "avoidH - support");
      if (id === "avoidance_horizontal") { put("z0", avoidZ0); put("z1", avoidH); }
      if (id === "Avoidance_Vertical") {
        put("y0", link("tall.avoidY0"));
        put("y1", ex({ y: ref("tall.avoidY0"), t: R.AVOIDANCE_SUPPORT_THICKNESS }, (t) => Math.round((t.y + t.t) * 1000) / 1000, "avoidY0 + support"));
        put("z0", zero);
        put("z1", avoidZ0);
      }
    }
    if (id.endsWith("_fridge") && Number.isFinite(valueOf("tall.hFridge.z0"))) {
      put("z0", link("tall.hFridge.z0"));
      put("z1", link("tall.hFridge.z1"));
    }
    if (id.startsWith("VD_") || id.startsWith("DS_")) { put("y0", zero); put("y1", md); }
  }
}

export function generateGeneralTall(input: GTParams): GTResult {
  beginProvenance();
  const errors: string[] = [];
  const warnings: string[] = [];
  const fridgeNotes: string[] = [];
  const prepared = applyFridgePrep(input, fridgeNotes);
  const s = normalize(prepared, errors);
  warnings.push(...fridgeNotes);
  const P = param({ CH: s.CH, CW: s.CW, CD: s.CD, CPT: s.CPT, FPT: s.FPT });
  dim("tall.CH", { CH: P.CH }, (t) => t.CH, { formula: "CH" });
  dim("tall.CW", { CW: P.CW }, (t) => t.CW, { formula: "CW" });
  dim("tall.CPT", { CPT: P.CPT }, (t) => t.CPT, { formula: "CPT" });
  dim("tall.FPT", { FPT: P.FPT }, (t) => t.FPT, { formula: "FPT" });
  dim("tall.leftT", { t: param({ leftSide: s.leftT }).leftSide }, (t) => t.t, { formula: "leftSide" });
  dim("tall.rightT", { t: param({ rightSide: s.rightT }).rightSide }, (t) => t.t, { formula: "rightSide" });
  dim("tall.mw", { CW: ref("tall.CW"), L: ref("tall.leftT"), R: ref("tall.rightT") }, (t) => Math.round((t.CW - t.L - t.R) * 1000) / 1000, { formula: "CW - sides" });
  dim("tall.midDepth", { CD: P.CD, FPT: P.FPT }, (t) => t.CD - t.FPT);
  dim("tall.md", { CD: P.CD, FPT: P.FPT }, (t) => Math.round((t.CD - t.FPT) * 1000) / 1000, { formula: "CD - FPT" });
  const stileY0 = dim("tall.stileY0", { FPT: P.FPT }, () => 0);
  dim("tall.v12.front", { y: R.V12_Y_FRONT_FACE }, (t) => t.y, { formula: "V12_Y_FRONT_FACE" });
  dim("tall.v12.rear", { y: R.V12_Y_REAR }, (t) => t.y, { formula: "V12_Y_REAR" });
  dim("tall.v12.step", { y: R.V12_Y_STEP_INNER }, (t) => t.y, { formula: "V12_Y_STEP_INNER" });
  dim("tall.v12.slot", { y: R.V12_ZI_SLOT_INNER }, (t) => t.y, { formula: "V12_ZI_SLOT_INNER" });
  dim("tall.v12.notchD", { d: R.STYLE_2_END_NOTCH_DEPTH }, (t) => t.d, { formula: "STYLE_2_END_NOTCH_DEPTH" });
  dim("tall.notchT", { t: R.V34_END_NOTCH_THICKNESS }, (t) => t.t, { formula: "V34_END_NOTCH_THICKNESS" });
  dim("tall.insertT", { t: R.STYLE_1_INSERT_SLOT_THICKNESS }, (t) => t.t, { formula: "STYLE_1_INSERT_SLOT_THICKNESS" });
  dim("tall.topRailH", { h: s.topSys.railH }, (t) => t.h, { formula: "topRailH" });
  dim("tall.botRailH", { h: s.botSys.railH }, (t) => t.h, { formula: "botRailH" });
  dim("tall.ziT", { t: param({ ziThickness: s.ziT }).ziThickness }, (t) => t.t, { formula: "ziThickness" });
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

  // A drawer right under the fridge: the drawer zone carries the fridge floor (side and rear H,
  // a front rail under the floor) and the Zi under the drawer is cut back to FRIDGE_BASE_ZI_DEPTH.
  const fridgeIdx = fridgeZoneItem ? zoneItems.indexOf(fridgeZoneItem) : -1;
  const baseDrawer = fridgeIdx > 0 && zoneItems[fridgeIdx - 1].zone.type === "drawer" ? zoneItems[fridgeIdx - 1] : null;
  const fridgeFloor = baseDrawer
    ? boundaries.find((b) => b.id === `boundary-${fridgeZoneItem!.zone.id}` && b.boundaryType === "full_zi")
    : undefined;
  const drawerBase = fridgeFloor ? boundaries.find((b) => b.id === `boundary-${baseDrawer!.zone.id}` && b.boundaryType === "full_zi") : undefined;

  /* ---- V1/V2 Zi 槽（full + half 边界都给前立梃） ---- */
  const v12Slots = boundaries
    .filter((b) => b.boundaryType === "full_zi" || b.boundaryType === "half_zi")
    .map((b) => ({ z0: r2(b.centerZ - (s.ziT + R.ZI_SLOT_CLEARANCE.value) / 2), z1: r2(b.centerZ + (s.ziT + R.ZI_SLOT_CLEARANCE.value) / 2), boundaryId: b.id }));
  const v34Slots = boundaries
    .filter((b) => b.boundaryType === "full_zi" && b !== drawerBase)
    .map((b) => ({ z0: r2(b.centerZ - (s.ziT + R.ZI_SLOT_CLEARANCE.value) / 2), z1: r2(b.centerZ + (s.ziT + R.ZI_SLOT_CLEARANCE.value) / 2), boundaryId: b.id }));
  for (const b of boundaries) {
    if (b.boundaryType !== "full_zi" && b.boundaryType !== "half_zi") continue;
    dim(`tall.slot.${b.id}.z0`, { cz: b.centerZ, zi: ref("tall.ziT"), clr: R.ZI_SLOT_CLEARANCE }, (t) => Math.round((t.cz - (t.zi + t.clr) / 2) * 1000) / 1000, { formula: "centerZ - (ziT + 1) / 2" });
    dim(`tall.slot.${b.id}.z1`, { cz: b.centerZ, zi: ref("tall.ziT"), clr: R.ZI_SLOT_CLEARANCE }, (t) => Math.round((t.cz + (t.zi + t.clr) / 2) * 1000) / 1000, { formula: "centerZ + (ziT + 1) / 2" });
  }

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
    "YZ", "X", vLeftX0, vLeftX1, v12Y0, v12Y1, 0, CH, v12Profile(s, v12Slots, "V1")));
  boards.push(mkBoard("V2", "Front Stile Right", "vertical_structure", "V2", CPT, "carcass",
    "YZ", "X", vRightX0, vRightX1, v12Y0, v12Y1, 0, CH, v12Profile(s, v12Slots, "V2")));

  /* ---- V3/V4 后立梃：同样朝前一个门厚。后缘贴侧板后缘 midDepth。 ---- */
  const v34Y1 = r2(stileY0 + md);
  // Front stile occupies y up to v12Y1 (150). A shallow cabinet would put the rear stile through it.
  let v34Y0 = r2(stileY0 + Math.max(0, md - R.V34_Y_REAR.value));
  if (v34Y0 < v12Y1) v34Y0 = v12Y1;
  const v34Depth = r2(Math.max(0, v34Y1 - v34Y0));
  const v34Rear = Math.min(R.V34_Y_REAR.value, v34Depth);
  dim("tall.v34.yOff", { y0: stileY0, md: ref("tall.md"), rear: R.V34_Y_REAR, stop: v12Y1 }, (t) => {
    let y = Math.round((t.y0 + Math.max(0, t.md - t.rear)) * 1000) / 1000;
    if (y < t.stop) y = t.stop;
    return y;
  }, { formula: "max(stile + max(0, midDepth - V34_Y_REAR), frontStileRear)" });
  dim("tall.v34.rear", { depth: v34Depth, rear: R.V34_Y_REAR }, (t) => Math.min(t.rear, t.depth), { formula: "min(V34_Y_REAR, depth)" });
  boards.push(mkBoard("V3", "Rear Stile Left", "vertical_structure", "V3", CPT, "carcass",
    "YZ", "X", vLeftX0, vLeftX1, v34Y0, r2(v34Y0 + v34Rear), 0, CH, v34Profile(s, v34Slots, warnings, "V3")));
  boards.push(mkBoard("V4", "Rear Stile Right", "vertical_structure", "V4", CPT, "carcass",
    "YZ", "X", vRightX0, vRightX1, v34Y0, r2(v34Y0 + v34Rear), 0, CH, v34Profile(s, v34Slots, warnings, "V4")));

  // A fridge right under a Style 2 top: the fixed panel fills the fridge opening under TH1, so V5
  // is a front stile (V1 / V2 depth) that runs up to TH1 and carries the panel's edge.
  const topFridge = !!fridgeZoneItem && s.topSys.style === "style_2" && zoneItems[zoneItems.length - 1] === fridgeZoneItem;
  const th1Z0 = s.topSys.style === "style_2"
    ? dim("tall.th1.z0", { CH: ref("tall.CH"), t: R.STYLE_2_FRONT_SYSTEM_THICKNESS, inset: R.STYLE_2_FRONT_SYSTEM_Z_INSET },
      (t) => Math.round((t.CH - t.t - t.inset) * 1000) / 1000, { formula: "CH - TH1 thickness - inset" })
    : NaN;
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
    const v5Z0 = ex({ z: fridgeZoneItem.z0 }, (t) => t.z, "fridgeZ0");
    const v5Front = topFridge ? link("tall.stileY0") : link("tall.FPT");
    const v5Rear = topFridge
      ? link("tall.v12Rear")
      : ex({ F: ref("tall.FPT"), md: ref("tall.md") }, (t) => Math.round((t.F + t.md) * 1000) / 1000, "FPT + midDepth");
    const v5Z1 = topFridge ? link("tall.th1.z0") : ex({ z: fridgeZoneItem.z1 }, (t) => t.z, "fridgeZ1");
    boards.push(mkBoard("V5", "V5", "vertical_structure", "V5", CPT, "carcass",
      "YZ", "X", v5x0, v5x1, topFridge ? v12Y0 : sideY0, topFridge ? v12Y1 : sideY1,
      fridgeZoneItem.z0, topFridge ? th1Z0 : fridgeZoneItem.z1,
      yzTrace("V5", [[v5Front, v5Z0], [v5Rear, v5Z0], [v5Rear, v5Z1], [v5Front, v5Z1], [v5Front, v5Z0]])));
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
    const t1H = R.STYLE_1_FIRST_RAIL_THICKNESS.value;
    const t2H = R.STYLE_1_SECOND_RAIL_THICKNESS.value;
    if (s.topSys.style === "style_1") {
      const topRail0 = r2(CH - s.topSys.frontRail);
      boards.push(mkBoard("T1", "Top Front Rail", "top_system", "T1", t1H, "door",
        "XZ", "Y", dx, r2(dx + mw), railY0, t1Rear, topRail0, CH, undefined));
      boards.push(mkBoard("T2", "Top Second Rail", "top_system", "T2", t2H, "carcass",
        "XZ", "Y", dx, r2(dx + mw), t1Rear, railRear, topRail0, CH, undefined));
      same("T1.y0", "tall.railY0");
      same("T1.y1", "tall.t1Rear");
      same("T2.y0", "tall.t1Rear");
      same("T2.y1", "tall.railRear");
      boards.push(mkBoard("T3", "Top Insert Board", "top_system", "T3", CPT, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, insDepth, r2(topRail0 - CPT), topRail0, insertProfile("T3")));
    } else if (s.topSys.style === "style_2") {
      const sysH = s.topSys.frontRail;
      const th = R.STYLE_2_FRONT_SYSTEM_THICKNESS.value;
      const dep = R.STYLE_2_FRONT_SYSTEM_DEPTH.value;
      const inset = R.STYLE_2_FRONT_SYSTEM_Z_INSET.value;
      boards.push(mkBoard("TH1", "Top Style 2 Front System Panel", "top_system", "TH1", th, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, dep, th1Z0, r2(CH - inset), undefined));
      if (topFridge) {
        const v5 = boards.find((b) => b.id === "V5")!;
        const v5Left = v5.x0 < dx + mw / 2;
        boards.push(mkBoard("TopStyle2FixedFrontPanel", "Top Style 2 Fixed Front Panel", "top_system", "style2_fixed_front_panel", FPT, "door",
          "XZ", "Y", v5Left ? v5.x1 : vLeftX1, v5Left ? vRightX0 : v5.x0, 0, FPT, r2(CH - sysH), th1Z0, undefined));
      } else {
        boards.push(mkBoard("TopStyle2FixedFrontPanel", "Top Style 2 Fixed Front Panel", "top_system", "style2_fixed_front_panel", FPT, "door",
          "XZ", "Y", r2(dx + s.sideClearance), r2(dx + mw - s.sideClearance), -FPT, 0, r2(CH - sysH), CH, undefined));
      }
    }
    if (s.botSys.style === "style_1") {
      const botRail1 = r2(s.botSys.frontRail);
      boards.push(mkBoard("B1", "Bottom Front Rail", "bottom_system", "B1", t1H, "door",
        "XZ", "Y", dx, r2(dx + mw), railY0, t1Rear, 0, botRail1, undefined));
      boards.push(mkBoard("B2", "Bottom Second Rail", "bottom_system", "B2", t2H, "carcass",
        "XZ", "Y", dx, r2(dx + mw), t1Rear, railRear, 0, botRail1, undefined));
      same("B1.y0", "tall.railY0");
      same("B1.y1", "tall.t1Rear");
      same("B2.y0", "tall.t1Rear");
      same("B2.y1", "tall.railRear");
      boards.push(mkBoard("B3", "Bottom Insert Board", "bottom_system", "B3", CPT, "carcass",
        "XY", "Z", dx, r2(dx + mw), 0, insDepth, botRail1, r2(botRail1 + CPT), insertProfile("B3")));
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
      prof = halfZiProfile(`Zi_${b.id}`);
    } else if (b === drawerBase) {
      type = "shortened_zi";
      y1 = r2(Math.min(md, R.FRIDGE_BASE_ZI_DEPTH.value));
      prof = fullZiProfile(`Zi_${b.id}`, y1);
    } else if (hitsAvoid) {
      type = "shortened_zi";
      y1 = avoidShortY;
      prof = fullZiProfile(`Zi_${b.id}`, y1);
    } else {
      prof = fullZiProfile(`Zi_${b.id}`, null);
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
    const above0 = r2(vdShelf.z1);
    dim("tall.hMid.z0", { z: vdShelf.z1 }, (t) => t.z, { formula: "divider top" });
    dim("tall.hMid.z1", { z0: ref("tall.hMid.z0"), h: R.H_SUPPORT_HEIGHT }, (t) => Math.round((t.z0 + t.h) * 1000) / 1000, { formula: "z0 + H height" });
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
      // Sit on the Zi / hang under it: touching, never inside it.
      if (h.name === "H34_mid") {
        const nz0 = r2(zi.z1), nz1 = r2(zi.z1 + H);
        if (nz1 > CH) { hZiConflicts.push(`${h.name} movement above Zi would exceed cabinet bounds; movement skipped.`); continue; }
        h.z0 = nz0; h.z1 = nz1;
      } else {
        const nz1 = r2(zi.z0), nz0 = r2(zi.z0 - H);
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
      let x0 = r2(dx + R.H_SUPPORT_THICKNESS.value);
      let x1 = r2(dx + mw - R.H_SUPPORT_THICKNESS.value);
      const v5 = boards.find((board) => board.id === "V5");
      if (v5 && h.z0 < v5.z1 && h.z1 > v5.z0 && v5.y1 > md - R.H34_DEPTH.value) {
        if (v5.x0 < dx + mw / 2) x0 = r2(Math.max(x0, v5.x1));
        else x1 = r2(Math.min(x1, v5.x0));
      }
      boards.push(mkBoard(h.name, "H Bridge Rear", "h_support", h.name, s.hT, "carcass",
        "XZ", "Y", x0, x1,
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
    dim("tall.hFridge.z0", { z: hz0 }, (t) => t.z, { formula: "boundary above the fridge" });
    dim("tall.hFridge.z1", { z0: ref("tall.hFridge.z0"), h: R.H_SUPPORT_HEIGHT }, (t) => Math.round((t.z0 + t.h) * 1000) / 1000, { formula: "z0 + H height" });
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
        let x0 = r2(dx + R.H_SUPPORT_THICKNESS.value);
        let x1 = r2(dx + mw - R.H_SUPPORT_THICKNESS.value);
        const v5 = boards.find((board) => board.id === "V5");
        if (v5 && h.z0 < v5.z1 && h.z1 > v5.z0 && v5.y1 > md - R.H34_DEPTH.value) {
          if (v5.x0 < dx + mw / 2) x0 = r2(Math.max(x0, v5.x1));
          else x1 = r2(Math.min(x1, v5.x0));
        }
        boards.push(mkBoard(h.name, "H34 fridge", "h_support", "H34_fridge", s.hT, "carcass",
          "XZ", "Y", x0, x1,
          r2(md - R.H34_DEPTH.value), md, h.z0, h.z1, undefined));
      }
    }
  }

  /* ---- 冰箱底座：冰箱正下方是抽屉时，由抽屉区的左右 H、后 H34 和前撑条托住冰箱底板 ---- */
  if (baseDrawer && fridgeFloor) {
    const z0 = dim("tall.fridgeBase.z0", { z: baseDrawer.z0 }, (t) => t.z, { formula: "drawer zone bottom" });
    const zTop = evalExpr(link(`tall.slot.${fridgeFloor.id}.z0`));
    const floor = dim("tall.fridgeFloor.z0", { z: fridgeFloor.z0 }, (t) => t.z, { formula: "fridge floor underside" });
    const h34z0 = dim("tall.fridgeBase.h34z0", { z: ref("tall.fridgeFloor.z0"), h: R.H_SUPPORT_HEIGHT }, (t) => Math.round((t.z - t.h) * 1000) / 1000, { formula: "fridge floor - H height" });
    const railZ0 = dim("tall.fridgeBase.railZ0", { z: ref("tall.fridgeFloor.z0"), CPT: ref("tall.CPT") }, (t) => Math.round((t.z - t.CPT) * 1000) / 1000, { formula: "fridge floor - CPT" });
    const railY1 = dim("tall.fridgeBase.railY1", { d: R.FRIDGE_BASE_RAIL_DEPTH }, (t) => t.d, { formula: "FRIDGE_BASE_RAIL_DEPTH" });
    boards.push(mkBoard("H13_fridgeBase", "H13 fridge base", "h_support", "H13_fridgeBase", s.hT, "carcass",
      "YZ", "X", dx, r2(dx + R.H_SUPPORT_THICKNESS.value), hY0, hY1, z0, zTop, undefined));
    boards.push(mkBoard("H24_fridgeBase", "H24 fridge base", "h_support", "H24_fridgeBase", s.hT, "carcass",
      "YZ", "X", r2(dx + mw - R.H_SUPPORT_THICKNESS.value), r2(dx + mw), hY0, hY1, z0, zTop, undefined));
    boards.push(mkBoard("H34_fridgeBase", "H34 fridge base", "h_support", "H34_fridgeBase", s.hT, "carcass",
      "XZ", "Y", r2(dx + R.H_SUPPORT_THICKNESS.value), r2(dx + mw - R.H_SUPPORT_THICKNESS.value), r2(md - R.H34_DEPTH.value), md, h34z0, floor, undefined));
    boards.push(mkBoard("FridgeBaseRail", "Fridge Base Front Rail", "h_support", "fridge_base_rail", CPT, "carcass",
      "XY", "Z", vLeftX1, vRightX0, 0, railY1, railZ0, floor, undefined));
    for (const id of ["H13_fridgeBase", "H24_fridgeBase"]) {
      same(`${id}.y0`, "tall.hY0");
      same(`${id}.y1`, "tall.hY1");
      same(`${id}.z0`, "tall.fridgeBase.z0");
      same(`${id}.z1`, `tall.slot.${fridgeFloor.id}.z0`);
    }
    same("H34_fridgeBase.z0", "tall.fridgeBase.h34z0");
    same("H34_fridgeBase.z1", "tall.fridgeFloor.z0");
    same("FridgeBaseRail.z0", "tall.fridgeBase.railZ0");
    same("FridgeBaseRail.z1", "tall.fridgeFloor.z0");
    same("FridgeBaseRail.y1", "tall.fridgeBase.railY1");
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
    const yMd = link("tall.md");
    const yCut = ex({ md: ref("tall.md"), d: R.H34_CLEARANCE_DEPTH }, (t) => Math.round((t.md - t.d) * 1000) / 1000, "midDepth - H34_CLEARANCE_DEPTH");
    const yTy0 = ex({ md: ref("tall.md") }, (t) => Math.round((t.md / 3) * 1000) / 1000, "midDepth / 3");
    const yTy1 = ex({ md: ref("tall.md") }, (t) => Math.round(((2 * t.md) / 3) * 1000) / 1000, "2 * midDepth / 3");
    dim(`${vd.id}.tongue`, { CPT: ref("tall.CPT"), c: R.DIVIDER_TONGUE_GROOVE_CLEARANCE }, (t) => Math.round((t.CPT / 2 - t.c) * 1000) / 1000, { formula: "CPT / 2 - clearance" });
    const zTongue = ex({ z: z0, tongue: ref(`${vd.id}.tongue`) }, (t) => Math.round((t.z - t.tongue) * 1000) / 1000, "zoneZ0 - tongue");
    const zZone0 = ex({ z: z0 }, (t) => t.z, "zoneZ0");
    const zZone1 = ex({ z: z1 }, (t) => t.z, "zoneZ1");
    const pairs: [Expr, Expr][] = [
      [lit(0), zTongue], [yTy0, zTongue], [yTy0, zZone0], [yTy1, zZone0], [yTy1, zTongue],
    ];
    const rear: [number, number][] = [[md, rearBottomZ]];
    let zCursor = rearBottomZ;
    let cutN = 0;
    const pushRear = (y: Expr, z: number, formula: string) => {
      dim(`${vd.id}.rz.${cutN}`, { z }, (t) => t.z, { formula });
      pairs.push([y, link(`${vd.id}.rz.${cutN}`)]);
      cutN += 1;
    };
    pushRear(yMd, rearBottomZ, "zoneZ0 - tongue");
    for (const cut of h34Cuts) {
      const cz0 = r2(Math.max(cut.z0, zCursor));
      const cz1 = r2(cut.z1);
      if (cz1 <= zCursor + EPS) continue;
      if (cz0 > zCursor + EPS) pushRear(yMd, cz0, "H34 or T5 band");
      pushRear(yCut, cz0, "H34 or T5 band");
      pushRear(yCut, cz1, "H34 or T5 band");
      if (cz1 < z1 - EPS) pushRear(yMd, cz1, "H34 or T5 band");
      zCursor = cz1;
    }
    if (z1 > zCursor + EPS) pushRear(yMd, z1, "zoneZ1");
    pairs.push([lit(0), zZone1], [lit(0), zTongue]);
    const prof: P2[] = yzTrace(vd.id, pairs);
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
      if (zi === baseDrawer && fridgeFloor) z1 = r2(fridgeFloor.z0 - R.FRIDGE_BASE_DRAWER_FRONT_GAP.value);
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
    if (zt === "top_flap" || zt === "bottom_flap") {
      // Flaps hinge on their top / bottom edge: two cups along it, FLAP_HINGE_FROM_SIDE in from each side.
      const custom = hs.sideDistance && hs.sideDistance !== "auto" && Number.isFinite(Number(hs.sideDistance));
      const fromSide = custom ? Number(hs.sideDistance) : R.FLAP_HINGE_FROM_SIDE.value;
      const cz = zt === "bottom_flap" ? r2(fp.z0 + fromEdge) : r2(fp.z1 - fromEdge);
      const depth = asNum(hs.cupDepth, R.FLAP_HINGE_CUP_DEPTH.value);
      [r2(fp.x0 + fromSide), r2(fp.x1 - fromSide)].forEach((cx, i) => {
        hinges.push({ id: `${fp.id}_hinge_${i + 1}`, panelId: fp.id, centerX: cx, centerZ: cz, diameter: cupD, depth });
      });
    } else if (zt !== "drawer") {
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
      // Top / bottom locks are measured from the board the bolt catches: the Zi above / below the zone
      // (the front rail under the fridge floor for a drawer right under the fridge); else the front's own edge.
      const zIdx = zoneItems.indexOf(fp.zone);
      const nextZone = zoneItems[zIdx + 1];
      const zoneAbove = nextZone ? boundaries.find((b) => b.id === `boundary-${nextZone.zone.id}` && b.boundaryType !== "none") : undefined;
      const zoneBelow = boundaries.find((b) => b.id === `boundary-${fp.zone.zone.id}` && b.boundaryType !== "none");
      if (lp === "top") {
        const underRail = fp.zone === baseDrawer && fridgeFloor;
        const mount = underRail ? r2(fridgeFloor!.z0 - CPT) : zoneAbove ? zoneAbove.z0 : fp.z1;
        cz = r2(mount - R.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
        mountingFace = "top";
        mountingBoardId = underRail ? "FridgeBaseRail" : zoneAbove ? `Zi_${zoneAbove.id}` : undefined;
      } else if (lp === "bottom") {
        const mount = zoneBelow ? zoneBelow.z1 : fp.z0;
        cz = r2(mount + R.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
        mountingFace = "bottom";
        mountingBoardId = zoneBelow ? `Zi_${zoneBelow.id}` : undefined;
      }
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
  const mkSidePanel = (side: "L" | "R", t: number, adapt: boolean, finish: "colour" | "carcass") => {
    const x0 = side === "L" ? 0 : r2(s.CW - t);
    let prof: P2[] | undefined;
    if (s.avoid.enabled && s.avoid.depth > 0 && s.avoid.height > 0 && adapt) {
      const ad = s.avoid.depth, ah = s.avoid.height;
      prof = yzTrace(`SidePanel_${side}`, [
        [ex({ F: ref("tall.FPT") }, (t) => -t.F, "-FPT"), lit(0)],
        [ex({ md: ref("tall.md"), d: s.avoid.depth }, (t) => Math.round((t.md - t.d) * 1000) / 1000, "midDepth - avoidD"), lit(0)],
        [ex({ md: ref("tall.md"), d: s.avoid.depth }, (t) => Math.round((t.md - t.d) * 1000) / 1000, "midDepth - avoidD"), ex({ h: s.avoid.height }, (t) => t.h, "avoidH")],
        [link("tall.md"), ex({ h: s.avoid.height }, (t) => t.h, "avoidH")],
        [link("tall.md"), link("tall.CH")],
        [ex({ F: ref("tall.FPT") }, (t) => -t.F, "-FPT"), link("tall.CH")],
      ]);
    }
    boards.push(mkBoard(`SidePanel_${side}`, `Side Panel ${side === "L" ? "Left" : "Right"}`, "side_panel", "side_panel",
      t, finish === "colour" ? "door" : "carcass", "YZ", "X", x0, r2(x0 + t), -FPT, md, 0, CH, prof));
  };
  if (s.leftT > 0) mkSidePanel("L", s.leftT, s.leftAdapt, s.leftFinish);
  if (s.rightT > 0) mkSidePanel("R", s.rightT, s.rightAdapt, s.rightFinish);

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
  stampTallBoards(s, boards);
  attachFaces(boards);
  const joints: Joint[] = buildTallFaces({ boards, ziSlots, ziGrooves, hinges, locks, doorColour: doorColourOf(input), ledGroove: input.ledGroove === true,
    fridgeZ: fridgeZoneItem ? [fridgeZoneItem.z0, fridgeZoneItem.z1] : null });
  // Fronts (doors, fixed fronts, T1 / B1) horizontal; colour side panels vertical.
  const grain = applyGrain(
    boards,
    (b) => (b.id.startsWith("SidePanel_") ? "side" : b.stock?.kind === "door" ? "front" : null),
    input,
    { front: "horizontal", side: "vertical" },
  );
  applyDoorSides(boards, input);
  const milling = applyMilling(boards);

  const result: GTResult = {
    params: {
      cabinetHeight: CH, cabinetWidth: s.CW, cabinetDepth: CD,
      midWidth: mw, midDepth: md,
      panelThickness: CPT, frontPanelThickness: FPT, ziThickness: s.ziT,
    },
    boards,
    grain,
    milling,
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
