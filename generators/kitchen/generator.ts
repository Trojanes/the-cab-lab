/**
 * 厨房底柜生成器 — cleanroom 重实现。
 * 行为规格：docs/kitchen-cleanroom-spec.md；黄金验收：kitchen_base（§8）。
 * 坐标：y=0 前缘（门侧），门板 y∈[−FPT,0]，y=cd 墙侧，z 地板 0 向上。
 * 轮廓直接按目标形态生成（规格坑③：不做 0.001 事后点改写；功能板舌一步到位；
 * T 系/B4 的 V 板让位折进轮廓，只有灶台列（T1）与轮拱 x 段（B4）才切段）。
 */
import { beginProvenance, dim, endProvenance, param } from "../_lib/dim.ts";
import { attachFaces } from "../_lib/model.ts";
import { recordBoardBox, refreshBoardBox } from "../_lib/recordBox.ts";
import { buildKitchenFaces } from "./faces.ts";
import type {
  Board, HingeRecord, Joint, KitchenParams, KitchenResult, KitchenZoneType,
  LockRecord, MachiningMode, NotchRecord, SidePanelOptions, SlotRecord,
} from "./types.ts";
import { RULES as R } from "./rules.ts";

export { generateKitchenSvgPreview } from "./svgPreview.ts";

const asNum = (v: unknown, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const r2 = (v: number) => Math.round(v * 1000) / 1000;
const EPS = 0.001;

/* ================= 参数解析 ================= */

interface ZonePlan {
  id: string;
  zoneType: KitchenZoneType;
  z0: number;
  z1: number;
  height: number;
  shelfEnabled: boolean;
  shelfHeight: number | undefined;
  hingeSettings: { sideDistance: number; cupDiameter: number; cupDepth: number; cupCenterFromEdge: number; useThreeHinges: boolean };
  lockEnabled: boolean;
  lockSideCenterOffset: number;
  leftSidePanelOptions?: SidePanelOptions;
  rightSidePanelOptions?: SidePanelOptions;
}
interface ColumnPlan {
  id: string;
  x0: number;
  x1: number;
  width: number;
  zones: ZonePlan[];
}
interface S {
  W: number; D: number; H: number;
  CPT: number; FPT: number; fc: number; lockOn: boolean;
  BCH: number; style2: boolean;
  columns: ColumnPlan[];
  xBoundaries: number[];
  leftOpts: Required<SidePanelOptions>;
  rightOpts: Required<SidePanelOptions>;
  cd: number;
  avoidances: { id: string; x0: number; x1: number; height: number; depth: number }[];
  prefs: Map<number, MachiningMode>;
}

const DEFAULT_SIDE: Required<SidePanelOptions> = {
  panelType: "carcass", frontVisible: false, bchNotchEnabled: true,
  grooveVisible: true, extendT2T3B4ToOuterFace: true, strengtheningStripEnabled: false,
};

/** 面板类区（有 frontPanel → 视为可见邻区）。 */
const PANEL_ZONE_TYPES = new Set<KitchenZoneType>(["left_door", "right_door", "double_door", "drawer", "down_flap"]);
const DRAWER_BOTTOM_TYPES = new Set<KitchenZoneType>(["drawer", "down_flap"]);
const FULL_SHELF_TYPES = new Set<KitchenZoneType>(["left_door", "right_door", "double_door", "open", "stove", "custom"]);

function pickSideOptions(col: ColumnPlan, side: "left" | "right"): Required<SidePanelOptions> {
  // 取该列含此选项的区：优先门板区 → 可见(open/custom)区 → 首区。
  const key = side === "left" ? "leftSidePanelOptions" : "rightSidePanelOptions";
  const zonesWith = col.zones.filter((z) => z[key] != null);
  let zone = zonesWith.find((z) => PANEL_ZONE_TYPES.has(z.zoneType));
  if (!zone) zone = zonesWith.find((z) => z.zoneType === "open" || z.zoneType === "custom");
  if (!zone) zone = zonesWith[0] ?? col.zones[0];
  return { ...DEFAULT_SIDE, ...(zone?.[key] ?? {}) };
}

function normalize(input: KitchenParams): S {
  const gs = input.globalSettings ?? ({} as KitchenParams["globalSettings"]);
  const W = asNum(gs.length, 0);
  const D = asNum(gs.depth, 0);
  const H = asNum(gs.height, 0);
  const CPT = asNum(input.materialThickness, 15);
  const FPT = asNum(input.frontThickness, 16);
  const fc = asNum(input.frontClearance, R.FRONT_CLEARANCE.value);
  const BCH = asNum(input.bottomClearanceHeight, 70);
  const style2 = input.bottomClearanceStyle === "style_2"; // 非 style_2 一律按 style_1 兜底

  const columns: ColumnPlan[] = [];
  let x = 0;
  for (const c of input.columns ?? []) {
    const width = asNum(c.width, 0);
    const zones: ZonePlan[] = [];
    let z = H; // 区自顶向下切高（区和 = H − BCH）
    for (const zone of c.zones ?? []) {
      const zh = asNum(zone.height, 0);
      zones.push({
        id: zone.id,
        zoneType: (zone.zoneType ?? "unassigned") as KitchenZoneType,
        z0: r2(z - zh), z1: r2(z), height: zh,
        shelfEnabled: zone.shelfEnabled !== false,
        shelfHeight: zone.shelfHeight,
        hingeSettings: {
          sideDistance: asNum(zone.hingeSettings?.sideDistance, NaN),
          cupDiameter: asNum(zone.hingeSettings?.cupDiameter, R.HINGE_CUP_DIAMETER.value),
          cupDepth: asNum(zone.hingeSettings?.cupDepth, R.HINGE_CUP_DEPTH.value),
          cupCenterFromEdge: asNum(zone.hingeSettings?.cupCenterFromEdge, R.HINGE_CUP_FROM_EDGE.value),
          useThreeHinges: zone.hingeSettings?.useThreeHinges === true,
        },
        lockEnabled: zone.lockEnabled !== false,
        lockSideCenterOffset: asNum(zone.lockSideCenterOffset, R.LOCK_SIDE_OFFSET.value),
        leftSidePanelOptions: zone.leftSidePanelOptions,
        rightSidePanelOptions: zone.rightSidePanelOptions,
      });
      z = r2(z - zh);
    }
    columns.push({ id: c.id, x0: r2(x), x1: r2(x + width), width, zones });
    x += width;
  }

  const s: S = {
    W, D, H, CPT, FPT, fc, lockOn: input.lockEnabled !== false, BCH, style2,
    columns,
    xBoundaries: [0, ...columns.map((c) => c.x1)],
    leftOpts: DEFAULT_SIDE, rightOpts: DEFAULT_SIDE,
    cd: r2(D - FPT),
    avoidances: (input.wheelAvoidances ?? []).map((a) => ({
      id: a.id, x0: Math.round(asNum(a.x0, 0)), x1: Math.round(asNum(a.x1, 0)),
      height: Math.round(asNum(a.height, 0)), depth: Math.round(asNum(a.depth, 0)),
    })),
    prefs: new Map((input.vPanelMachiningPreferences ?? []).map((p) => [p.vPanelIndex, p.mode])),
  };
  if (columns.length) {
    s.leftOpts = pickSideOptions(columns[0], "left");
    s.rightOpts = pickSideOptions(columns[columns.length - 1], "right");
  }
  return s;
}

/* ================= 校验 ================= */

function validate(s: S, errors: string[], warnings: string[]): void {
  if (s.W <= 0 || s.cd <= 0 || s.H <= 0 || s.CPT <= 0) errors.push("Invalid global dimensions.");
  if (s.BCH < 0 || s.BCH >= s.H) errors.push("Bottom clearance height must be within [0, height).");
  if (!s.columns.length) errors.push("At least one column is required.");
  for (const col of s.columns) {
    if (col.x1 - col.x0 - s.CPT * 2 <= 0) errors.push(`Column ${col.id} has non-positive clear width.`);
    const zoneSum = col.zones.reduce((a, z) => a + z.height, 0);
    if (Math.abs(zoneSum - (s.H - s.BCH)) > 0.01) {
      warnings.push(`Column ${col.id}: zone heights sum ${r2(zoneSum)} ≠ H − BCH (${r2(s.H - s.BCH)}).`);
    }
    for (const z of col.zones) {
      if (z.zoneType === "unassigned") errors.push(`Zone ${z.id} in column ${col.id} has no zone type.`);
    }
  }
  for (const a of s.avoidances) {
    if (a.height < s.BCH) warnings.push(`Wheel avoidance ${a.id} height is below BCH; V panels conflict with the bottom system.`);
    if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) warnings.push(`Wheel avoidance ${a.id} bounds invalid; skipped.`);
  }
}

/* ================= 几何工具 ================= */

type P2 = { x: number; y: number } | { y: number; z: number } | { x: number; z: number };

function rectXZ(w: number, h: number): P2[] {
  return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: h }, { x: 0, z: h }, { x: 0, z: 0 }];
}
function rectYZ(w: number, h: number): P2[] {
  return [{ y: 0, z: 0 }, { y: w, z: 0 }, { y: w, z: h }, { y: 0, z: h }, { y: 0, z: 0 }];
}

function mkBoard(
  id: string, name: string, category: string, boardType: string, thickness: number,
  kind: "carcass" | "door",
  plane: "XY" | "XZ" | "YZ", axis: "X" | "Y" | "Z",
  x0: number, x1: number, y0: number, y1: number, z0: number, z1: number,
  profileVector: P2[],
): Board {
  const box = recordBoardBox(id, r2(x0), r2(x1), r2(y0), r2(y1), r2(z0), r2(z1));
  return {
    id, name, category, boardType,
    materialThickness: thickness, profilePlane: plane, thicknessAxis: axis,
    stock: { kind, thickness },
    ...box,
    profileVector: profileVector.map((p) => ({ ...(p as object) })) as Board["profileVector"],
  };
}

/**
 * 矩形 + 缺口轮廓（全局 x ∈ [x0,x1]，v ∈ [v0, v0+h]；缺口 [a,b] 从 edge 边凹进深度 d）。
 * 缺口先裁到 [x0,x1]，零宽丢弃；贴左右缘时边自动中断。一步生成目标轮廓。
 */
function edgeNotchRect(
  x0: number, x1: number, v0: number, h: number,
  notches: [number, number][],
  d: number,
  edge: "near" | "far",
  mk: (u: number, v: number) => P2,
): P2[] {
  const N = notches
    .map(([a, b]) => [Math.max(a, x0), Math.min(b, x1)] as [number, number])
    .filter(([a, b]) => b - a > EPS)
    .sort((p, q) => p[0] - q[0]);
  const yN = v0, yF = v0 + h; // near 边 v=v0，far 边 v=v0+h
  if (edge === "far") {
    // 底边 → 右缘 → far 边（从 x1 向 x0，带缺口）→ 左缘 → 闭合
    const pts: P2[] = [mk(x0, yN), mk(x1, yN)];
    let zr = yF;
    if (N.length && N[N.length - 1][1] >= x1 - EPS) zr = yF - d;
    pts.push(mk(x1, zr));
    let cur = x1;
    for (let i = N.length - 1; i >= 0; i--) {
      const [a, b] = N[i];
      if (b >= x1 - EPS) {
        pts.push(mk(a, yF - d), mk(a, yF)); // 贴右缘
      } else if (a <= x0 + EPS) {
        pts.push(mk(b, yF), mk(b, yF - d), mk(x0, yF - d)); // 贴左缘
        cur = x0;
        break;
      } else {
        pts.push(mk(b, yF), mk(b, yF - d), mk(a, yF - d), mk(a, yF));
      }
      cur = a;
    }
    if (cur > x0 + EPS) pts.push(mk(x0, yF));
    pts.push(mk(x0, yN));
    return pts;
  }
  // near 边凹进：底边（从 x0 向 x1，带缺口）→ 右缘 → far 边 → 左缘 → 闭合
  const pts: P2[] = [];
  const startLift = N.length && N[0][0] <= x0 + EPS; // 首缺口贴左缘：起点抬高 d
  pts.push(mk(x0, startLift ? yN + d : yN));
  let cur = x0;
  for (const [a, b] of N) {
    if (a <= x0 + EPS) {
      pts.push(mk(b, yN + d), mk(b, yN)); // 贴左缘
    } else if (b >= x1 - EPS) {
      pts.push(mk(a, yN), mk(a, yN + d), mk(x1, yN + d)); // 贴右缘
      cur = x1;
      break;
    } else {
      pts.push(mk(a, yN), mk(a, yN + d), mk(b, yN + d), mk(b, yN));
    }
    cur = b;
  }
  if (cur < x1 - EPS) pts.push(mk(x1, yN));
  pts.push(mk(x1, yF), mk(x0, yF));
  pts.push(pts[0]);
  return pts;
}

/** XY 板（{x,y} 点，全局坐标）带后缘(y1)/前缘(y0)缺口。 */
const xyNotch = (x0: number, x1: number, y0: number, h: number, notches: [number, number][], d: number, edge: "near" | "far") =>
  edgeNotchRect(x0, x1, y0, h, notches, d, edge, (u, v) => ({ x: r2(u), y: r2(v) }));
/** XZ 板（{x,z} 点，全局坐标）带 z1/z0 边缺口。 */
const xzNotch = (x0: number, x1: number, z0: number, h: number, notches: [number, number][], d: number, edge: "near" | "far") =>
  edgeNotchRect(x0, x1, z0, h, notches, d, edge, (u, v) => ({ x: r2(u), z: r2(v) }));

/* ================= V 板 ================= */

interface VPanel {
  index: number;
  id: string;
  x0: number; x1: number;
  thickness: number;
  kind: "carcass" | "door";
  leftNeighborCol: number;
  rightNeighborCol: number;
  frontVisible: boolean;
  grooveVisible: boolean;
  bchNotch: boolean;
}

function buildVPanels(s: S): VPanel[] {
  const vs: VPanel[] = [];
  const n = s.columns.length;
  vs.push({
    index: 0, id: "V0",
    x0: 0, x1: r2(s.leftOpts.panelType === "door" ? s.FPT : s.CPT),
    thickness: s.leftOpts.panelType === "door" ? s.FPT : s.CPT,
    kind: s.leftOpts.panelType === "door" ? "door" : "carcass",
    leftNeighborCol: -1, rightNeighborCol: 0,
    frontVisible: s.leftOpts.frontVisible, grooveVisible: s.leftOpts.grooveVisible,
    bchNotch: s.leftOpts.bchNotchEnabled,
  });
  for (let i = 1; i < n; i++) {
    const xb = s.xBoundaries[i];
    vs.push({
      index: i, id: `V${i}`,
      x0: r2(xb - s.CPT / 2), x1: r2(xb + s.CPT / 2),
      thickness: s.CPT, kind: "carcass",
      leftNeighborCol: i - 1, rightNeighborCol: i,
      frontVisible: false, grooveVisible: true, bchNotch: true,
    });
  }
  vs.push({
    index: n, id: `V${n}`,
    x0: r2(s.W - (s.rightOpts.panelType === "door" ? s.FPT : s.CPT)), x1: s.W,
    thickness: s.rightOpts.panelType === "door" ? s.FPT : s.CPT,
    kind: s.rightOpts.panelType === "door" ? "door" : "carcass",
    leftNeighborCol: n - 1, rightNeighborCol: -1,
    frontVisible: s.rightOpts.frontVisible, grooveVisible: s.rightOpts.grooveVisible,
    bchNotch: s.rightOpts.bchNotchEnabled,
  });
  return vs;
}

/**
 * V 板 YZ 外轮廓（B3 台阶 / T1 前让 / T3、B4 后接收缺口；轮拱替换后下角）。
 * na = 板厚 + 1；r = RECEIVER_NOTCH_DEPTH；frontY = style_2 ? CPT : STYLE1_TOE_KICK_Y。
 * 前可见：前缘延至 −FPT；bchNotch=false → 全高平直并封掉顶部前让位（一步生成）。
 */
function vPanelOutline(s: S, v: VPanel, avoidance?: { height: number; depth: number }, omitFrontTopReceiver = false): P2[] {
  const t = v.thickness;
  const na = t + R.NOTCH_ALLOWANCE_EXTRA.value;
  const cd = s.cd, H = s.H, BCH = s.BCH;
  const r = R.RECEIVER_NOTCH_DEPTH.value;
  const bsY = R.BOTTOM_SLOT_REAR_Y.value;
  const toeY = R.STYLE1_TOE_KICK_Y.value;

  if (v.frontVisible) {
    const frontY = -s.FPT;
    if (avoidance) {
      const ad = avoidance.depth, ah = avoidance.height;
      return [
        { y: frontY, z: 0 }, { y: frontY, z: H },
        { y: cd - na - r, z: H }, { y: cd - na - r, z: H - na },
        { y: cd - na, z: H - na }, { y: cd - na, z: ah + r },
        { y: cd, z: ah + r }, { y: cd, z: ah },
        { y: cd - ad, z: ah }, { y: cd - ad, z: 0 },
        { y: frontY, z: 0 },
      ];
    }
    if (!v.bchNotch) {
      // 全高平直 + 封掉顶部前让位（保留后侧 B4/T3 接收缺口）
      return [
        { y: frontY, z: 0 }, { y: frontY, z: H },
        { y: cd - na - r, z: H }, { y: cd - na - r, z: H - na },
        { y: cd - na, z: H - na }, { y: cd - na, z: H - r },
        { y: cd, z: H - r }, { y: cd, z: r },
        { y: cd - na, z: r }, { y: cd - na, z: 0 },
        { y: frontY, z: 0 },
      ];
    }
    // bchNotch=true：仅 z ≥ BCH + 板厚 + na 段延伸（保趾踢）
    const zExt = BCH + t + na;
    return [
      { y: frontY, z: zExt }, { y: frontY, z: H },
      { y: r, z: H }, { y: r, z: H - na },
      { y: 0, z: H - na }, { y: 0, z: BCH + na },
      { y: bsY, z: BCH + na }, { y: bsY, z: BCH },
      { y: toeY, z: BCH }, { y: toeY, z: 0 },
      { y: cd, z: 0 }, { y: cd, z: r },
      { y: cd - na, z: r }, { y: cd - na, z: 0 },
      { y: frontY, z: 0 },
    ];
  }

  const frontY = s.style2 ? s.CPT : toeY;
  const base: P2[] = [
    { y: frontY, z: 0 }, { y: frontY, z: BCH },
    { y: bsY, z: BCH }, { y: bsY, z: BCH + na },
    { y: 0, z: BCH + na }, { y: 0, z: H - na },
    ...(omitFrontTopReceiver
      ? [{ y: 0, z: H } as P2]
      : [{ y: r, z: H - na }, { y: r, z: H }]),
    { y: cd - na - r, z: H }, { y: cd - na - r, z: H - na },
    { y: cd - na, z: H - na }, { y: cd - na, z: H - r },
    { y: cd, z: H - r }, { y: cd, z: r },
    { y: cd - na, z: r }, { y: cd - na, z: 0 },
    { y: frontY, z: 0 },
  ];
  if (avoidance) {
    const ad = avoidance.depth, ah = avoidance.height;
    return [
      ...base.slice(0, 8),
      { y: cd - na - r, z: H }, { y: cd - na - r, z: H - na },
      { y: cd - na, z: H - na }, { y: cd - na, z: H - r },
      { y: cd, z: H - r }, { y: cd, z: ah + r },
      { y: cd - na, z: ah + r }, { y: cd - na, z: ah },
      { y: cd - ad, z: ah }, { y: cd - ad, z: 0 },
      { y: frontY, z: 0 },
    ];
  }
  return base;
}

function avoidanceForV(s: S, v: VPanel) {
  const a = s.avoidances.find((a) => a.x0 < v.x1 && a.x1 > v.x0 && a.height > 0 && a.depth > 0 && a.x1 > a.x0);
  return a && a.height < s.H ? { height: a.height, depth: a.depth } : undefined;
}

/* ================= 槽请求与解析（§4.4） ================= */

interface SlotRequest {
  vIndex: number;
  side: "left" | "right";
  boardId: string;
  tongueY0: number;
  tongueY1: number;
  z0: number;
  z1: number;
  isDrawer: boolean;
}

/** V 板槽面对侧的邻列在 z 高度是否为可见区（门板/open/custom）。 */
function neighborVisible(s: S, v: VPanel, face: "left" | "right", z0: number, z1: number): boolean {
  const colIdx = face === "left" ? v.leftNeighborCol : v.rightNeighborCol;
  if (colIdx < 0) return false;
  const col = s.columns[colIdx];
  if (!col) return false;
  const hit = col.zones.find((z) => z.z1 > z0 && z.z0 < z1);
  if (!hit) return false;
  return PANEL_ZONE_TYPES.has(hit.zoneType) || hit.zoneType === "open" || hit.zoneType === "custom";
}

const MACHINING_TABLE: Record<MachiningMode, ["through" | "half" | "none", "through" | "half" | "none"]> = {
  left_half_right_none: ["half", "none"],
  right_half_left_none: ["half", "none"],
  left_half_right_through: ["half", "through"],
  right_half_left_through: ["half", "through"],
  left_half: ["half", "none"],
  right_half: ["none", "half"],
  left_through: ["through", "none"],
  right_through: ["none", "through"],
  left_face_half_allowed: ["half", "through"],
  right_face_half_allowed: ["through", "half"],
  through_only: ["through", "through"],
};

function resolveSlots(
  s: S, requests: SlotRequest[], vPanels: VPanel[], errors: string[],
): { slots: SlotRecord[]; tongueOf: Map<string, { left: number; right: number }> } {
  const slots: SlotRecord[] = [];
  const tongueOf = new Map<string, { left: number; right: number }>();
  const byV = new Map<number, { left?: SlotRequest; right?: SlotRequest }>();
  for (const q of requests) {
    const e = byV.get(q.vIndex) ?? {};
    e[q.side] = q;
    byV.set(q.vIndex, e);
  }
  for (const [vi, pair] of byV) {
    const v = vPanels[vi];
    // half 判定：槽面对侧（V 板另一面）邻区可见，或侧板 grooveVisible=false（外侧不可见）
    const wantLeft = pair.left
      ? neighborVisible(s, v, "right", pair.left.z0, pair.left.z1) || !v.grooveVisible
      : false;
    const wantRight = pair.right
      ? neighborVisible(s, v, "left", pair.right.z0, pair.right.z1) || !v.grooveVisible
      : false;

    let resolveLeft: "through" | "half" | "none" | null = null;
    let resolveRight: "through" | "half" | "none" | null = null;
    if (wantLeft && wantRight) {
      const mode = s.prefs.get(vi);
      if (!mode) {
        errors.push(`Unresolved double-sided half-slot conflict on V${vi}.`);
        resolveLeft = "half"; resolveRight = "half"; // 报错但仍按 half 生成
      } else {
        [resolveLeft, resolveRight] = MACHINING_TABLE[mode];
      }
    } else {
      resolveLeft = pair.left ? (wantLeft ? "half" : "through") : null;
      resolveRight = pair.right ? (wantRight ? "half" : "through") : null;
    }

    const emit = (side: "left" | "right", kind: "through" | "half" | "none", q: SlotRequest) => {
      // V 板视角 side 是槽面（功能板所在侧）→ 功能板舌在相反端：
      // V 板 side="right"（功能板在 V 右侧）→ 功能板左舌；side="left" → 右舌。
      const boardSide = side === "right" ? "left" : "right";
      const t = tongueOf.get(q.boardId) ?? { left: 0, right: 0 };
      if (kind === "none") {
        t[boardSide] = 0;
        tongueOf.set(q.boardId, t);
        return;
      }
      const tongue = kind === "through" ? s.CPT : v.thickness / 2; // through 舌 = CPT（与侧板厚无关）
      const clr = q.isDrawer ? R.DRAWER_SLOT_CLEARANCE.value : R.SHELF_SLOT_CLEARANCE.value;
      slots.push({
        id: `${q.boardId}-V${vi}-${side}`,
        vPanelId: `V${vi}`,
        side,
        through: kind === "through",
        depth: kind === "through" ? v.thickness : v.thickness / 2,
        y0: r2(q.tongueY0 - clr), y1: r2(q.tongueY1 + clr),
        z0: r2(q.z0 - R.SLOT_Z_CLEARANCE.value), z1: r2(q.z1 + R.SLOT_Z_CLEARANCE.value),
        forBoard: q.boardId,
      });
      t[boardSide] = tongue;
      tongueOf.set(q.boardId, t);
    };
    if (pair.left && resolveLeft) emit("left", resolveLeft, pair.left);
    if (pair.right && resolveRight) emit("right", resolveRight, pair.right);
  }
  return { slots, tongueOf };
}

/* ================= 主流程 ================= */

export function generateKitchenCabinet(input: KitchenParams): KitchenResult {
  beginProvenance();
  const s = normalize(input);
  const P = param({ W: s.W, D: s.D, H: s.H, CPT: s.CPT, FPT: s.FPT, BCH: s.BCH, fc: s.fc, cd: s.cd });
  dim("kitchen.carcassDepth", { D: P.D, FPT: P.FPT }, (t) => t.D - t.FPT);
  const errors: string[] = [];
  const warnings: string[] = [];
  validate(s, errors, warnings);

  const boards: Board[] = [];
  const notches: NotchRecord[] = [];
  const hinges: HingeRecord[] = [];
  const locks: LockRecord[] = [];
  const cd = s.cd, CPT = s.CPT, FPT = s.FPT, fc = s.fc, H = s.H, BCH = s.BCH;
  const stripW = R.SUPPORT_STRIP_WIDTH.value;
  const notchD = R.SUPPORT_STRIP_NOTCH_DEPTH.value;

  /* ---- V 板 ---- */
  const vPanels = buildVPanels(s);
  const lastCol = s.columns.length - 1;
  const stoveAtLeftEdge = s.columns[0]?.zones.some((z) => z.zoneType === "stove") === true;
  const stoveAtRightEdge = lastCol >= 0 && s.columns[lastCol].zones.some((z) => z.zoneType === "stove");
  for (const v of vPanels) {
    const av = avoidanceForV(s, v);
    const omitT1 = (v.index === 0 && stoveAtLeftEdge) || (v.index === vPanels.length - 1 && stoveAtRightEdge);
    const outline = vPanelOutline(s, v, av, omitT1 && !v.frontVisible);
    const label = v.index === 0 ? "Left End Panel"
      : v.index === vPanels.length - 1 ? "Right End Panel" : `Vertical Panel ${v.index}`;
    boards.push(mkBoard(v.id, label, "vertical", "vertical_panel", v.thickness, v.kind,
      "YZ", "X", v.x0, v.x1, 0, cd, 0, H, outline));
  }

  /* ---- frontStop / rearStop ---- */
  const leftInner = vPanels[0].x1;
  const rightInner = vPanels[vPanels.length - 1].x0;
  const frontStop = { x0: s.leftOpts.frontVisible ? leftInner : 0, x1: s.rightOpts.frontVisible ? rightInner : s.W };
  const rearStop = {
    x0: (s.leftOpts.frontVisible && !s.leftOpts.extendT2T3B4ToOuterFace) ? leftInner : 0,
    x1: (s.rightOpts.frontVisible && !s.rightOpts.extendT2T3B4ToOuterFace) ? rightInner : s.W,
  };

  /* ---- V 让位缺口（宽 = CPT + 1，与 V 板料厚无关；黄金 V0 心 8 → [0,16]） ---- */
  const vNotchRanges = vPanels.map((v) => {
    const c = (v.x0 + v.x1) / 2;
    return [r2(c - (CPT + R.NOTCH_ALLOWANCE_EXTRA.value) / 2), r2(c + (CPT + R.NOTCH_ALLOWANCE_EXTRA.value) / 2)] as [number, number];
  });

  /* ---- B1 / B2（style_1 趾踢内缩 / style_2 平前） ---- */
  if (s.style2) {
    boards.push(mkBoard("B1", "Bottom Front Panel", "bottom", "bottom_front", FPT, "door",
      "XZ", "Y", frontStop.x0, frontStop.x1, -FPT, 0, 0, BCH, rectXZ(frontStop.x1 - frontStop.x0, BCH)));
    boards.push(mkBoard("B2", "Bottom Carcass Panel", "bottom", "bottom_carcass", CPT, "carcass",
      "XZ", "Y", frontStop.x0, frontStop.x1, 0, CPT, 0, BCH, rectXZ(frontStop.x1 - frontStop.x0, BCH)));
  } else {
    const toeY1 = R.STYLE1_TOE_KICK_Y.value - CPT;
    const toeY0 = toeY1 - FPT;
    boards.push(mkBoard("B1", "Bottom Front Panel", "bottom", "bottom_front", FPT, "door",
      "XZ", "Y", frontStop.x0, frontStop.x1, toeY0, toeY1, 0, BCH, rectXZ(frontStop.x1 - frontStop.x0, BCH)));
    boards.push(mkBoard("B2", "Bottom Carcass Panel", "bottom", "bottom_carcass", CPT, "carcass",
      "XZ", "Y", frontStop.x0, frontStop.x1, toeY1, R.STYLE1_TOE_KICK_Y.value, 0, BCH, rectXZ(frontStop.x1 - frontStop.x0, BCH)));
  }

  /* ---- B3 底板（y∈[0,100] z∈[BCH,BCH+CPT]，V 缺口从后缘 y=100 凹进 20） ---- */
  {
    boards.push(mkBoard("B3", "Bottom Deck", "bottom", "bottom_deck", CPT, "carcass",
      "XY", "Z", frontStop.x0, frontStop.x1, 0, stripW, BCH, r2(BCH + CPT),
      xyNotch(frontStop.x0, frontStop.x1, 0, stripW, vNotchRanges, notchD, "far")));
  }

  /* ---- 功能板（先建槽请求，轮廓待槽解析后一步生成） ---- */
  const requests: SlotRequest[] = [];
  interface FuncBoard {
    board: Board;
    isDrawer: boolean;
    clearX0: number; clearX1: number;
    z0: number; z1: number;
  }
  const funcBoards: FuncBoard[] = [];

  const addFuncBoard = (
    id: string, name: string, boardType: string, ci: number,
    z0: number, z1: number, isDrawer: boolean,
  ) => {
    const vL = vPanels[ci], vR = vPanels[ci + 1];
    const clearX0 = vL.x1, clearX1 = vR.x0;
    const depth = isDrawer ? R.B3_DEPTH.value : cd;
    const ty0 = isDrawer ? R.DRAWER_TONGUE_Y0.value : r2(cd / 3);
    const ty1 = isDrawer ? R.B3_DEPTH.value : r2((2 * cd) / 3);
    const board = mkBoard(id, name, "functional", boardType, CPT, "carcass",
      "XY", "Z", clearX0, clearX1, 0, depth, z0, z1,
      [{ x: clearX0, y: 0 }, { x: clearX1, y: 0 }, { x: clearX1, y: depth }, { x: clearX0, y: depth }, { x: clearX0, y: 0 }]);
    boards.push(board);
    funcBoards.push({ board, isDrawer, clearX0, clearX1, z0, z1 });
    requests.push({ vIndex: vL.index, side: "right", boardId: id, tongueY0: ty0, tongueY1: ty1, z0, z1, isDrawer });
    requests.push({ vIndex: vR.index, side: "left", boardId: id, tongueY0: ty0, tongueY1: ty1, z0, z1, isDrawer });
  };

  s.columns.forEach((col, ci) => {
    for (const zone of col.zones) {
      if (zone.z0 <= BCH + EPS) continue; // 底区不生成
      const isDrawer = DRAWER_BOTTOM_TYPES.has(zone.zoneType);
      const isShelf = FULL_SHELF_TYPES.has(zone.zoneType);
      if (!isDrawer && !isShelf) continue;
      const z = r2(zone.z0 - CPT / 2), zc = r2(zone.z0 + CPT / 2);
      addFuncBoard(
        `${col.id}-${zone.id}-bottom`,
        isDrawer ? "Drawer Divider" : "Full Depth Shelf",
        isDrawer ? "drawer_divider" : "full_depth_shelf",
        ci, z, zc, isDrawer,
      );
      // 门层板（门板区 shelfEnabled；drawer/flap 区无门层板）
      if (PANEL_ZONE_TYPES.has(zone.zoneType) && zone.zoneType !== "drawer" && zone.zoneType !== "down_flap"
        && zone.shelfEnabled) {
        if (zone.height < R.DOOR_SHELF_MIN_ZONE_HEIGHT.value) {
          warnings.push(`Zone ${zone.id}: height below ${R.DOOR_SHELF_MIN_ZONE_HEIGHT.value}; door shelf skipped.`);
          continue;
        }
        const shelfTopZ = r2(zone.z0 + (zone.shelfHeight ?? Math.round(zone.height / 2)));
        if (!(shelfTopZ > zone.z0 && shelfTopZ < zone.z1)) {
          warnings.push(`Zone ${zone.id}: door shelf top outside zone bounds; skipped.`);
          continue;
        }
        const centerZ = r2(shelfTopZ - CPT / 2);
        addFuncBoard(`${zone.id}-door-shelf`, "Door Shelf", "door_shelf", ci,
          r2(centerZ - CPT / 2), r2(centerZ + CPT / 2), false);
      }
    }
  });
  // 底区上方的门层板：底区自身（z0=BCH）的门板区也可能有层板（列1 情形）
  s.columns.forEach((col, ci) => {
    const zone = col.zones[col.zones.length - 1]; // 最底区
    if (!zone || zone.z0 > BCH + EPS) return;
    if (!PANEL_ZONE_TYPES.has(zone.zoneType) || zone.zoneType === "drawer" || zone.zoneType === "down_flap") return;
    if (!zone.shelfEnabled) return;
    if (zone.height < R.DOOR_SHELF_MIN_ZONE_HEIGHT.value) {
      warnings.push(`Zone ${zone.id}: height below ${R.DOOR_SHELF_MIN_ZONE_HEIGHT.value}; door shelf skipped.`);
      return;
    }
    const shelfTopZ = r2(zone.z0 + (zone.shelfHeight ?? Math.round(zone.height / 2)));
    if (!(shelfTopZ > zone.z0 && shelfTopZ < zone.z1)) {
      warnings.push(`Zone ${zone.id}: door shelf top outside zone bounds; skipped.`);
      return;
    }
    const centerZ = r2(shelfTopZ - CPT / 2);
    addFuncBoard(`${zone.id}-door-shelf`, "Door Shelf", "door_shelf", ci,
      r2(centerZ - CPT / 2), r2(centerZ + CPT / 2), false);
  });

  /* ---- 槽解析 + 功能板舌轮廓（一步生成，两套模板对应黄金点列） ---- */
  const { slots, tongueOf } = resolveSlots(s, requests, vPanels, errors);
  for (const fb of funcBoards) {
    const t = tongueOf.get(fb.board.id) ?? { left: 0, right: 0 };
    const { clearX0: c0, clearX1: c1 } = fb;
    const x0 = r2(c0 - t.left), x1 = r2(c1 + t.right);
    const by1 = fb.isDrawer ? R.B3_DEPTH.value : cd;
    const ty0 = fb.isDrawer ? R.DRAWER_TONGUE_Y0.value : r2(cd / 3);
    const ty1 = fb.isDrawer ? R.B3_DEPTH.value : r2((2 * cd) / 3);
    let prof: P2[];
    if (fb.isDrawer) {
      // 抽屉分隔板（黄金 9 点模板：body + 双侧舌，舌顶 = 板顶）
      prof = [
        { x: c0, y: 0 }, { x: c1, y: 0 }, { x: c1, y: ty0 },
        { x: x1, y: ty0 }, { x: x1, y: ty1 }, { x: x0, y: ty1 },
        { x: x0, y: ty0 }, { x: c0, y: ty0 }, { x: c0, y: 0 },
      ];
    } else if (t.left > 0 && t.right > 0) {
      // 双舌（黄金 13 点模板）
      prof = [
        { x: c0, y: 0 }, { x: c1, y: 0 }, { x: c1, y: ty0 },
        { x: x1, y: ty0 }, { x: x1, y: ty1 }, { x: c1, y: ty1 },
        { x: c1, y: by1 }, { x: c0, y: by1 }, { x: c0, y: ty1 },
        { x: x0, y: ty1 }, { x: x0, y: ty0 }, { x: c0, y: ty0 }, { x: c0, y: 0 },
      ];
    } else if (t.right > 0) {
      prof = [
        { x: c0, y: 0 }, { x: c1, y: 0 }, { x: c1, y: ty0 },
        { x: x1, y: ty0 }, { x: x1, y: ty1 }, { x: c1, y: ty1 },
        { x: c1, y: by1 }, { x: c0, y: by1 }, { x: c0, y: 0 },
      ];
    } else if (t.left > 0) {
      prof = [
        { x: c0, y: 0 }, { x: c1, y: 0 }, { x: c1, y: by1 }, { x: c0, y: by1 },
        { x: c0, y: ty1 }, { x: x0, y: ty1 }, { x: x0, y: ty0 }, { x: c0, y: ty0 }, { x: c0, y: 0 },
      ];
    } else {
      prof = [{ x: c0, y: 0 }, { x: c1, y: 0 }, { x: c1, y: by1 }, { x: c0, y: by1 }, { x: c0, y: 0 }];
    }
    fb.board.x0 = x0; fb.board.x1 = x1;
    fb.board.profileVector = prof.map((p) => ({ ...(p as object) })) as Board["profileVector"];
  }

  /* ---- T 系统 + B4（V 缺口折轮廓；灶台列切 T1、轮拱切 B4） ---- */
  const zTop0 = H - CPT;
  const rN = R.RECEIVER_NOTCH_DEPTH.value;
  const stoveCuts = s.columns
    .map((c, i) => {
      if (!c.zones.some((z) => z.zoneType === "stove")) return null;
      const leftV = vPanels[i], rightV = vPanels[i + 1];
      return {
        x0: leftV?.x1 ?? c.x0,
        x1: rightV?.x0 ?? c.x1,
        y0: 0,
        y1: FPT + R.STOVE_CUT_FRONT_EXTRA.value,
      };
    })
    .filter((x): x is { x0: number; x1: number; y0: number; y1: number } => x != null);
  const segmentBy = (x0: number, x1: number, cuts: [number, number][]) => {
    const pts = [...cuts].sort((a, b) => a[0] - b[0]);
    const segs: [number, number][] = [];
    let cur = x0;
    for (const [c0, c1] of pts) {
      if (c1 <= x0 || c0 >= x1) continue;
      const a = Math.max(c0, x0), b = Math.min(c1, x1);
      if (a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < x1) segs.push([cur, x1]);
    return segs.filter(([a, b]) => b - a >= R.MIN_STRIP_SEGMENT_LENGTH.value);
  };
  const notchIn = (n: [number, number], x0: number, x1: number): [number, number] | null => {
    const a = Math.max(n[0], x0), b = Math.min(n[1], x1);
    return b - a > EPS ? [a, b] : null;
  };

  const stoveXCutsForY = (y0: number, y1: number): [number, number][] =>
    stoveCuts.filter((c) => !(y1 <= c.y0 || y0 >= c.y1)).map((c) => [c.x0, c.x1] as [number, number]);

  // T1 顶前条：y∈[0,100] z∈[H−CPT,H]；V 缺口从后缘 y=100 凹进 20；灶台列按 y 相交切段
  {
    const segs = segmentBy(frontStop.x0, frontStop.x1, stoveXCutsForY(0, stripW));
    segs.forEach(([a, b], i) => {
      const ns = vNotchRanges.map((n) => notchIn(n, a, b)).filter(Boolean) as [number, number][];
      boards.push(mkBoard(`T1-${i + 1}`, "Top Front Rail", "top", "top_front_rail", CPT, "carcass",
        "XY", "Z", a, b, 0, stripW, zTop0, H,
        xyNotch(a, b, 0, stripW, ns, notchD, "far")));
    });
  }
  // T2 顶后条：y∈[cd−100, cd]；灶台 y 带不相交时保持整段
  {
    const y0 = r2(cd - stripW);
    const segs = segmentBy(rearStop.x0, rearStop.x1, stoveXCutsForY(y0, cd));
    segs.forEach(([a, b], i) => {
      const ns = vNotchRanges.map((n) => notchIn(n, a, b)).filter(Boolean) as [number, number][];
      boards.push(mkBoard(`T2-${i + 1}`, "Top Rear Rail", "top", "top_rear_rail", CPT, "carcass",
        "XY", "Z", a, b, y0, cd, zTop0, H,
        xyNotch(a, b, y0, stripW, ns, notchD, "near")));
    });
  }
  // T3 顶后竖条：y∈[cd−CPT, cd] z∈[H−100, H]
  {
    const y0 = r2(cd - CPT), z0 = r2(H - stripW);
    const segs = segmentBy(rearStop.x0, rearStop.x1, stoveXCutsForY(y0, cd));
    segs.forEach(([a, b], i) => {
      const ns = vNotchRanges.map((n) => notchIn(n, a, b)).filter(Boolean) as [number, number][];
      boards.push(mkBoard(`T3-${i + 1}`, "Top Rear Vertical", "top", "top_rear_vertical", CPT, "carcass",
        "XZ", "Y", a, b, y0, cd, z0, H,
        xzNotch(a, b, z0, stripW, ns, notchD, "near")));
    });
  }
  // B4 后下竖条：y∈[cd−CPT, cd] z∈[0,100]；V 缺口从顶缘 z=100 凹进 20；轮拱 x 段切分
  {
    const y0 = r2(cd - CPT);
    const avCuts = s.avoidances.filter((a) => a.x1 > a.x0 && a.height > 0).map((a) => [a.x0, a.x1] as [number, number]);
    const segs = segmentBy(rearStop.x0, rearStop.x1, avCuts);
    segs.forEach(([a, b], i) => {
      const ns = vNotchRanges.map((n) => notchIn(n, a, b)).filter(Boolean) as [number, number][];
      boards.push(mkBoard(`B4-${i + 1}`, "Bottom Rear Vertical", "bottom", "bottom_rear_vertical", CPT, "carcass",
        "XZ", "Y", a, b, y0, cd, 0, stripW,
        xzNotch(a, b, 0, stripW, ns, notchD, "far")));
    });
  }

  /* ---- 轮拱封板 ---- */
  for (const a of s.avoidances) {
    if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) continue;
    const ad = a.depth, ah = a.height;
    boards.push(mkBoard(`${a.id}-avoidance-top`, "Avoidance Top", "avoidance", "avoidance_top", CPT, "carcass",
      "XY", "Z", a.x0, a.x1, r2(cd - ad), cd, r2(ah - CPT), ah,
      xyNotch(a.x0, a.x1, r2(cd - ad), ad, [], notchD, "far")));
    if (ah + R.RAISED_B4_HEIGHT.value <= H) {
      boards.push(mkBoard(`${a.id}-B4`, "Raised Rear Vertical", "avoidance", "raised_b4", CPT, "carcass",
        "XZ", "Y", a.x0, a.x1, r2(cd - CPT), cd, ah, r2(ah + R.RAISED_B4_HEIGHT.value),
        rectXZ(r2(a.x1 - a.x0), R.RAISED_B4_HEIGHT.value)));
    } else {
      warnings.push(`Wheel avoidance ${a.id}: raised B4 exceeds height; skipped.`);
    }
    if (ah > CPT) {
      boards.push(mkBoard(`${a.id}-avoidance-front`, "Avoidance Front", "avoidance", "avoidance_front", CPT, "carcass",
        "XZ", "Y", a.x0, a.x1, r2(cd - ad), r2(cd - ad + CPT), 0, r2(ah - CPT),
        rectXZ(r2(a.x1 - a.x0), r2(ah - CPT))));
    } else {
      warnings.push(`Wheel avoidance ${a.id}: front cover height ≤ CPT; skipped.`);
    }
  }

  /* ---- 功能板轮拱缩短（§4.2） ---- */
  for (const fb of funcBoards) {
    for (const a of s.avoidances) {
      if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) continue;
      if (!(fb.board.x0 < a.x1 && fb.board.x1 > a.x0)) continue;
      const ad = a.depth, ah = a.height;
      let y1 = fb.board.y1;
      if (fb.z0 < ah) y1 = Math.max(fb.board.y0, r2(cd - ad - CPT)); // 与 [0,ah] 相交
      else if (fb.z0 < ah + R.RAISED_B4_HEIGHT.value) y1 = Math.min(y1, r2(cd - CPT)); // 与 [ah,ah+100] 相交
      if (y1 < fb.board.y1) {
        fb.board.y1 = y1;
        warnings.push(`Functional board ${fb.board.id} shortened by wheel avoidance ${a.id}.`);
      }
    }
  }

  /* ---- 加强条（frontVisible + strengtheningStripEnabled 门板区） ---- */
  const strips: { zoneId: string; side: "left" | "right"; z0: number; z1: number; x0: number; x1: number }[] = [];
  if (s.leftOpts.frontVisible && s.leftOpts.strengtheningStripEnabled) {
    for (const zone of s.columns[0].zones) {
      if (!PANEL_ZONE_TYPES.has(zone.zoneType)) continue;
      const z0 = Math.max(zone.z0, r2(BCH + CPT));
      const z1 = Math.min(zone.z1, r2(H - CPT));
      if (z1 > z0) strips.push({ zoneId: zone.id, side: "left", z0: r2(z0), z1: r2(z1), x0: leftInner, x1: r2(leftInner + CPT) });
    }
  }
  if (s.rightOpts.frontVisible && s.rightOpts.strengtheningStripEnabled) {
    const lastCol = s.columns[s.columns.length - 1];
    for (const zone of lastCol.zones) {
      if (!PANEL_ZONE_TYPES.has(zone.zoneType)) continue;
      const z0 = Math.max(zone.z0, r2(BCH + CPT));
      const z1 = Math.min(zone.z1, r2(H - CPT));
      if (z1 > z0) strips.push({ zoneId: zone.id, side: "right", z0: r2(z0), z1: r2(z1), x0: r2(rightInner - CPT), x1: rightInner });
    }
  }
  for (const st of strips) {
    const id = `${st.side}-side-strengthening-strip-${st.zoneId}`;
    // 条槽由覆盖的 door-shelf 推导（y∈[80,100] × 层板 z ± 0.5）
    const covered = funcBoards.filter((fb) => fb.board.id.endsWith("-door-shelf") && fb.z0 >= st.z0 - EPS && fb.z1 <= st.z1 + EPS);
    let prof: P2[];
    if (covered.length) {
      const sz0 = r2(Math.min(...covered.map((f) => f.z0)) - R.STRENGTHENING_GROOVE_CLEARANCE.value);
      const sz1 = r2(Math.max(...covered.map((f) => f.z1)) + R.STRENGTHENING_GROOVE_CLEARANCE.value);
      prof = [
        { y: 0, z: st.z0 }, { y: stripW, z: st.z0 },
        { y: stripW, z: sz0 }, { y: R.STRENGTHENING_GROOVE_Y0.value, z: sz0 },
        { y: R.STRENGTHENING_GROOVE_Y0.value, z: sz1 }, { y: stripW, z: sz1 },
        { y: stripW, z: st.z1 }, { y: 0, z: st.z1 },
        { y: 0, z: st.z0 },
      ];
    } else {
      prof = rectYZ(stripW, r2(st.z1 - st.z0));
    }
    boards.push(mkBoard(id, `${st.side === "left" ? "Left" : "Right"} Side Strengthening Strip`, "support", "strengthening_strip",
      CPT, "carcass", "YZ", "X", st.x0, st.x1, 0, stripW, st.z0, st.z1, prof));
    // 层板前缘让位缺口（宽 CPT+1，y∈[0,85]）作为特征记录
    for (const fb of covered) {
      const nx0 = st.side === "left" ? fb.clearX0 : r2(fb.clearX1 - CPT - R.NOTCH_ALLOWANCE_EXTRA.value);
      notches.push({
        id: `${fb.board.id}-${st.side}-strip-notch`, panelId: fb.board.id,
        x0: r2(nx0), x1: r2(nx0 + CPT + R.NOTCH_ALLOWANCE_EXTRA.value),
        y0: 0, y1: R.STRENGTHENING_STRIP_NOTCH_Y.value,
      });
    }
  }

  /* ---- 门板（frontPanels，§4.3 定位 + 铰链 + 锁） ---- */
  const colHasPanel = (ci: number) => s.columns[ci].zones.some((z) => PANEL_ZONE_TYPES.has(z.zoneType));
  const emitDoorPanel = (
    id: string, zone: ZonePlan, x0: number, x1: number, z0: number, z1: number,
    kind: "left_door" | "right_door" | "double_door" | "drawer" | "down_flap", leaf?: "left" | "right",
  ) => {
    const w = r2(x1 - x0), h = r2(z1 - z0);
    if (w <= 0 || h <= 0) {
      warnings.push(`Front panel ${id}: non-positive leaf size; skipped.`);
      return;
    }
    boards.push(mkBoard(id, "Front Panel", "front_panel", "front_panel", FPT, "door",
      "XZ", "Y", x0, x1, -FPT, 0, z0, z1, rectXZ(w, h)));
    const hs = zone.hingeSettings;
    if (kind !== "drawer") {
      const L = kind === "down_flap" ? w : h;
      let sd = R.HINGE_SD_MIN.value + (L - R.HINGE_SD_SPAN.value) * R.SD_GAIN_NUM.value / R.SD_GAIN_DEN.value;
      sd = Math.min(R.HINGE_SD_MAX.value, Math.max(R.HINGE_SD_MIN.value, sd));
      const fromEdge = hs.cupCenterFromEdge;
      let centers: { x: number; z: number }[];
      if (kind === "down_flap") {
        centers = [{ x: r2(x0 + sd), z: r2(z0 + fromEdge) }, { x: r2(x1 - sd), z: r2(z0 + fromEdge) }];
      } else {
        const hingeLeft = kind === "left_door" || (kind === "double_door" && leaf === "left");
        const cx = hingeLeft ? r2(x0 + fromEdge) : r2(x1 - fromEdge);
        centers = [{ x: cx, z: r2(z1 - sd) }, { x: cx, z: r2(z0 + sd) }];
        if (hs.useThreeHinges) centers.push({ x: cx, z: r2((z0 + z1) / 2) });
      }
      centers.forEach((c, i) => {
        hinges.push({ id: `${id}-hinge-${i + 1}`, panelId: id, centerX: c.x, centerZ: c.z, diameter: hs.cupDiameter, depth: hs.cupDepth });
      });
    }
    if (s.lockOn && zone.lockEnabled) {
      let cx: number;
      if (kind === "left_door") cx = r2(x1 - zone.lockSideCenterOffset);
      else if (kind === "right_door") cx = r2(x0 + zone.lockSideCenterOffset);
      else cx = r2((x0 + x1) / 2);
      const dividerCenter = zone.z1 >= H - EPS ? r2(H - CPT / 2) : zone.z1; // 上分隔心
      const cz = r2(dividerCenter - CPT / 2 - R.LOCK_DROP.value);
      locks.push({
        id: `${id}-lock`, panelId: id, centerX: cx, centerZ: cz,
        width: R.LOCK_WIDTH.value, height: R.LOCK_HEIGHT.value, radius: r2(R.LOCK_HEIGHT.value / 2),
      });
    }
  };

  s.columns.forEach((col, ci) => {
    for (const zone of col.zones) {
      if (!PANEL_ZONE_TYPES.has(zone.zoneType)) continue;
      // x 定位：首列/末列看外板前可见；中间边界看邻列是否含门板区
      const x0 = ci === 0
        ? (s.leftOpts.frontVisible ? r2(leftInner + fc) : fc)
        : (colHasPanel(ci - 1) ? r2(col.x0 + fc / 2) : r2(col.x0 + CPT / 2));
      const x1 = ci === s.columns.length - 1
        ? (s.rightOpts.frontVisible ? r2(rightInner - fc) : r2(s.W - fc))
        : (colHasPanel(ci + 1) ? r2(col.x1 - fc / 2) : r2(col.x1 + CPT / 2));
      // z 定位：z1 顶区 → H−fc；上邻门板 → −fc/2；否则盖分隔板 +CPT/2
      const zoneAbove = col.zones.find((z) => Math.abs(z.z0 - zone.z1) < EPS);
      let z1: number;
      if (zone.z1 >= H - EPS) z1 = r2(H - fc);
      else if (zoneAbove && PANEL_ZONE_TYPES.has(zoneAbove.zoneType)) z1 = r2(zone.z1 - fc / 2);
      else z1 = r2(zone.z1 + CPT / 2);
      const zoneBelow = col.zones.find((z) => Math.abs(z.z1 - zone.z0) < EPS);
      let z0: number;
      if (zone.z0 <= BCH + EPS) z0 = s.style2 ? r2(BCH + fc) : BCH;
      else if (zoneBelow && PANEL_ZONE_TYPES.has(zoneBelow.zoneType)) z0 = r2(zone.z0 + fc / 2);
      else z0 = r2(zone.z0 - CPT / 2);

      const id = `${zone.id}-front-panel`;
      if (zone.zoneType === "double_door") {
        const mid = r2((x0 + x1) / 2);
        emitDoorPanel(`${id}-left`, zone, x0, r2(mid - fc / 2), z0, z1, "double_door", "left");
        emitDoorPanel(`${id}-right`, zone, r2(mid + fc / 2), x1, z0, z1, "double_door", "right");
      } else {
        emitDoorPanel(id, zone, x0, x1, z0, z1, zone.zoneType as "left_door" | "right_door" | "drawer" | "down_flap");
      }
    }
  });

  /* ---- 组装结果 ---- */
  for (const b of boards) refreshBoardBox(b);
  attachFaces(boards);
  const joints: Joint[] = buildKitchenFaces({ boards, slots, hinges, locks, notches });

  const result: KitchenResult = {
    params: {
      length: s.W, depth: s.D, height: s.H, carcassDepth: cd,
      materialThickness: s.CPT, frontThickness: s.FPT,
      bottomClearanceHeight: s.BCH,
      bottomClearanceStyle: s.style2 ? "style_2" : "style_1",
      frontClearance: fc, lockEnabled: s.lockOn,
    },
    boards, slots, hinges, locks, notches, joints,
    xBoundaries: s.xBoundaries,
    validation: { errors, warnings },
  };
  result.debug = {
    provenance: endProvenance(), boardFrame: "final",
    // Resolved layout for the front-view preview (same numbers the boards were built from).
    columns: s.columns.map((c) => ({
      id: c.id, x0: c.x0, x1: c.x1,
      zones: c.zones.map((z) => ({ id: z.id, zoneType: z.zoneType, z0: z.z0, z1: z.z1 })),
    })),
    avoidances: s.avoidances,
  };
  return result;
}
