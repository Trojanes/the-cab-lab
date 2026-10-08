/**
 * 厨房底柜生成器 — cleanroom 重实现。
 * 行为规格：docs/kitchen-cleanroom-spec.md；黄金验收：kitchen_base（§8）。
 * 坐标：y=0 前缘（门侧），门板 y∈[−FPT,0]，y=cd 墙侧，z 地板 0 向上。
 * 轮廓直接按目标形态生成（规格坑③：不做 0.001 事后点改写；功能板舌一步到位；
 * T 系/B4 的 V 板让位折进轮廓，只有灶台列（T1）与轮拱 x 段（B4）才切段）。
 */
import { beginProvenance, dim, endProvenance, ex, lit, param, ref, type Expr, type Term } from "../_lib/dim.ts";
import { applyLayoutDraft } from "../_lib/layout.ts";
import { attachFaces } from "../_lib/model.ts";
import { applyDoorSides, doorColourOf } from "../_lib/finish.ts";
import { applyGrain, SHEET_ALONG_MAX_MM, SHEET_CROSS_MAX_MM, type GrainIssue } from "../_lib/grain.ts";
import { applyMilling } from "../_lib/milling.ts";
import { recordBoardBox, refreshBoardBox } from "../_lib/recordBox.ts";
import { evalExpr, recordLoop } from "../_lib/trace.ts";
import { addKitchenB3Led, buildKitchenFaces } from "./faces.ts";
import type {
  Board, HingeRecord, Joint, KitchenParams, KitchenResult, KitchenZoneType,
  LockRecord, MachiningMode, NotchRecord, ScrewRecord, SidePanelOptions, SlotRecord,
} from "./types.ts";
import { LAYOUT } from "./layout.ts";
import { RULES as R } from "./rules.ts";

export { generateKitchenSvgPreview } from "./svgPreview.ts";
export { RULES } from "./rules.ts";

const asNum = (v: unknown, fb: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
const r2 = (v: number) => Math.round(v * 1000) / 1000;
const round1 = (v: number) => Math.round(v * 10) / 10;
const EPS = 0.001;

/** Bench top grain runs along the cabinet width. The sheet check does not follow the door series. */
function noteBenchSheet(issues: GrainIssue[], board: Board | undefined, alongAxis: "x" | "z" = "x") {
  if (!board) return;
  const along = round1(alongAxis === "z" ? board.z1 - board.z0 : board.x1 - board.x0);
  const across = round1(board.y1 - board.y0);
  if (across > SHEET_CROSS_MAX_MM) {
    issues.push({
      board: board.id, group: "front", dir: "horizontal", side: "across",
      length: across, word: "deep", limit: SHEET_CROSS_MAX_MM,
      message: `${board.id} is ${across} deep: horizontal grain allows ${SHEET_CROSS_MAX_MM} across the grain (sheet 1200 × 2400)`,
    });
  }
  if (along > SHEET_ALONG_MAX_MM) {
    issues.push({
      board: board.id, group: "front", dir: "horizontal", side: "along",
      length: along, word: "wide", limit: SHEET_ALONG_MAX_MM,
      message: `${board.id} is ${along} wide: horizontal grain allows ${SHEET_ALONG_MAX_MM} along the grain (sheet 1200 × 2400)`,
    });
  }
}

/**
 * A closed XY loop (last point = first) without repeated or collinear points:
 * a tongue resolved to none leaves a zero-length step in the outline template.
 */
function cleanLoop(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const same = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.abs(a.x - b.x) < EPS && Math.abs(a.y - b.y) < EPS;
  const ring = pts.filter((p, i) => i === 0 || !same(p, pts[i - 1]));
  if (ring.length > 1 && same(ring[0], ring[ring.length - 1])) ring.pop();
  const out = ring.filter((p, i) => {
    const a = ring[(i - 1 + ring.length) % ring.length], c = ring[(i + 1) % ring.length];
    return Math.abs((p.x - a.x) * (c.y - a.y) - (p.y - a.y) * (c.x - a.x)) > EPS;
  });
  return out.length >= 3 ? [...out, out[0]] : pts;
}

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
  withSink: boolean;
  leftSidePanelOptions?: SidePanelOptions;
  rightSidePanelOptions?: SidePanelOptions;
  applianceFloorEnabled: boolean;
}
interface ColumnPlan {
  id: string;
  x0: number;
  x1: number;
  width: number;
  zones: ZonePlan[];
}
interface S {
  /** Carcass right face. A left waterfall starts the carcass at `x0`, so this is `x0 + length`. */
  W: number;
  /** Carcass width, the sum of the columns. The outer box adds a waterfall when there is one. */
  length: number;
  /** Left face of the carcass. 25 when a waterfall occupies the left end, otherwise 0. */
  x0: number;
  waterfall: "left" | "right" | null;
  /** Ensuite was asked for a waterfall. The drop is not built. */
  waterfallRejected: boolean;
  D: number; H: number;
  CPT: number; FPT: number; fc: number; lockOn: boolean;
  BCH: number; style2: boolean;
  columns: ColumnPlan[];
  xBoundaries: number[];
  leftOpts: Required<SidePanelOptions>;
  rightOpts: Required<SidePanelOptions>;
  cd: number;
  /** `ensuite` is the vanity rail entry. Omitted / anything else is the kitchen run. */
  baseKind: "kitchen" | "ensuite";
  avoidances: { id: string; x0: number; x1: number; height: number; depth: number }[];
  /** Column index to the left of a Split Kitchen joint. Null: one carcass. */
  splitAfter: number | null;
  /** The caller asked for a split that is not a line between two columns. */
  splitRejected: boolean;
  prefs: Map<number, MachiningMode>;
}

const DEFAULT_SIDE: Required<SidePanelOptions> = {
  panelType: "carcass", frontVisible: false, bchNotchEnabled: true,
  grooveVisible: true, extendT2T3B4ToOuterFace: true, strengtheningStripEnabled: false,
};

/** 面板类区（有 frontPanel）。 */
const PANEL_ZONE_TYPES = new Set<KitchenZoneType>(["left_door", "right_door", "double_door", "drawer", "down_flap"]);
/**
 * Zones whose inside is seen when opened: a slot must not show there (half slot).
 * A drawer zone is not one of them — the drawer box stands in front of the V panel,
 * so a through slot facing it stays hidden.
 */
const VISIBLE_ZONE_TYPES = new Set<KitchenZoneType>(["left_door", "right_door", "double_door", "down_flap", "open", "custom"]);
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
  const length = asNum(gs.length, 0);
  const D = asNum(gs.depth, 0);
  const H = asNum(gs.height, 0);
  const askedFall = input.waterfall === "left" || input.waterfall === "right" ? input.waterfall : null;
  const waterfall = input.baseKind === "ensuite" ? null : askedFall;
  const x0 = waterfall === "left" ? R.BENCH_THICKNESS_MM.value : 0;
  const W = r2(x0 + length);
  const CPT = asNum(input.materialThickness, 15);
  const FPT = asNum(input.frontThickness, 16);
  const fc = asNum(input.frontClearance, R.FRONT_CLEARANCE.value);
  const BCH = asNum(input.bottomClearanceHeight, 70);
  const style2 = input.bottomClearanceStyle === "style_2"; // 非 style_2 一律按 style_1 兜底

  const columns: ColumnPlan[] = [];
  let x = x0;
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
        withSink: zone.withSink === true,
        lockSideCenterOffset: asNum(zone.lockSideCenterOffset, R.LOCK_SIDE_OFFSET.value),
        leftSidePanelOptions: zone.leftSidePanelOptions,
        rightSidePanelOptions: zone.rightSidePanelOptions,
        applianceFloorEnabled: zone.applianceFloorEnabled === true,
      });
      z = r2(z - zh);
    }
    columns.push({ id: c.id, x0: r2(x), x1: r2(x + width), width, zones });
    x += width;
  }

  const asked = input.splitAfter;
  const askedN = asked == null || (asked as unknown) === "" ? null : Math.round(Number(asked));
  const splitAfter = askedN != null && Number.isInteger(askedN) && askedN >= 0 && askedN <= columns.length - 2
    ? askedN
    : null;

  const s: S = {
    W, length, x0, waterfall, waterfallRejected: input.baseKind === "ensuite" && askedFall != null, D, H, CPT, FPT, fc, lockOn: input.lockEnabled !== false, BCH, style2,
    columns,
    xBoundaries: [x0, ...columns.map((c) => c.x1)],
    leftOpts: DEFAULT_SIDE, rightOpts: DEFAULT_SIDE,
    cd: r2(D - FPT),
    baseKind: input.baseKind === "ensuite" ? "ensuite" : "kitchen",
    splitAfter,
    splitRejected: askedN != null && splitAfter == null,
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
      if (s.baseKind === "ensuite" && z.zoneType === "stove") {
        errors.push(`Ensuite has no stove — zone ${z.id} in column ${col.id}.`);
      }
      if (z.zoneType === "stove" && z !== col.zones[0]) {
        errors.push(`Stove zone ${z.id} must be the top zone in column ${col.id}.`);
      }
    }
  }
  for (const a of s.avoidances) {
    if (a.height < s.BCH) warnings.push(`Wheel avoidance ${a.id} height is below BCH; V panels conflict with the bottom system.`);
    if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) warnings.push(`Wheel avoidance ${a.id} bounds invalid; skipped.`);
  }
  if (s.waterfallRejected) errors.push("Waterfall is only on a kitchen.");
  if (s.splitRejected) warnings.push("Split Kitchen needs a line between two columns.");
  const sheet = R.RUN_SHEET_MAX_MM.value;
  if (s.splitAfter == null && s.length > sheet) {
    warnings.push(`This run is ${r2(s.length)} mm long. A board over ${sheet} mm cannot be cut — split the kitchen.`);
  } else if (s.splitAfter != null) {
    const xb = s.xBoundaries[s.splitAfter + 1];
    const left = r2(xb - s.x0);
    const right = r2(s.W - xb);
    if (left > sheet) warnings.push(`The left side of the split is ${left} mm. A board over ${sheet} mm cannot be cut.`);
    if (right > sheet) warnings.push(`The right side of the split is ${right} mm. A board over ${sheet} mm cannot be cut.`);
  }
}

/* ================= 几何工具 ================= */

type P2 = { x: number; y: number } | { y: number; z: number } | { x: number; z: number };

/** Face formulas, written again after refreshBoardBox so the bench does not keep `x0 = x0`. */
let planned = new Map<string, Record<string, Expr>>();

function resetPlans() { planned = new Map(); }

function plan(id: string, faces: Record<string, Expr>) {
  planned.set(id, { ...planned.get(id), ...faces });
  for (const [face, e] of Object.entries(faces)) {
    dim(`${id}.${face}`, e.terms, e.fn, { formula: e.formula });
  }
}

function flushPlans() {
  for (const [id, faces] of planned) {
    for (const [face, e] of Object.entries(faces)) dim(`${id}.${face}`, e.terms, e.fn, { formula: e.formula });
  }
}

function link(key: string): Expr {
  return ex({ v: ref(key) }, (t) => t.v, `= ${key}`);
}

function qRound(e: Expr, formula?: string): Expr {
  return { terms: e.terms, fn: (t) => Math.round(e.fn(t) * 1000) / 1000, formula: formula ?? e.formula };
}

function loopPts(id: string, axes: [string, string], pairs: [Expr, Expr][], round = false): P2[] {
  return recordLoop(id, axes, pairs, round).map(([u, v]) => ({ [axes[0]]: u, [axes[1]]: v })) as P2[];
}

/** Local rectangle, origin at the board's minimum, closing point included. */
function traceLocalRect(id: string, axes: [string, string], w: Expr, h: Expr): P2[] {
  const o = lit(0);
  return loopPts(id, axes, [[o, o], [w, o], [w, h], [o, h], [o, o]]);
}

function rectXZ(w: number, h: number): P2[] {
  return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: h }, { x: 0, z: h }, { x: 0, z: 0 }];
}
function rectYZ(w: number, h: number): P2[] {
  return [{ y: 0, z: 0 }, { y: w, z: 0 }, { y: w, z: h }, { y: 0, z: h }, { y: 0, z: 0 }];
}

function mkBoard(
  id: string, name: string, category: string, boardType: string, thickness: number,
  kind: "carcass" | "door" | "bench",
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

interface NotchTrace {
  id: string;
  axes: [string, string];
  x0: Expr; x1: Expr; yN: Expr; h: Expr; d: Expr;
  notches: { a: Expr; b: Expr }[];
}

/**
 * 矩形 + 缺口轮廓（全局 x ∈ [x0,x1]，v ∈ [v0, v0+h]；缺口 [a,b] 从 edge 边凹进深度 d）。
 * 缺口先裁到 [x0,x1]，零宽丢弃；贴左右缘时边自动中断。一步生成目标轮廓。
 * `trace` 把每个顶点记成公式，数值与不记公式时相同。
 */
function edgeNotchRect(
  x0: number, x1: number, v0: number, h: number,
  notches: [number, number][],
  d: number,
  edge: "near" | "far",
  mk: (u: number, v: number) => P2,
  trace?: NotchTrace,
): P2[] {
  const id = trace?.id;
  if (trace && id) {
    dim(`${id}.q.x0`, trace.x0.terms, trace.x0.fn, { formula: trace.x0.formula });
    dim(`${id}.q.x1`, trace.x1.terms, trace.x1.fn, { formula: trace.x1.formula });
    dim(`${id}.q.yN`, trace.yN.terms, trace.yN.fn, { formula: trace.yN.formula });
    dim(`${id}.q.h`, trace.h.terms, trace.h.fn, { formula: trace.h.formula });
    dim(`${id}.q.d`, trace.d.terms, trace.d.fn, { formula: trace.d.formula });
    dim(`${id}.q.yF`, { yN: ref(`${id}.q.yN`), h: ref(`${id}.q.h`) }, (t) => t.yN + t.h, { formula: "yN + h" });
    trace.notches.forEach((n, i) => {
      dim(`${id}.q.n${i}.a`, n.a.terms, n.a.fn, { formula: n.a.formula });
      dim(`${id}.q.n${i}.b`, n.b.terms, n.b.fn, { formula: n.b.formula });
    });
  }
  const X0 = id ? link(`${id}.q.x0`) : lit(x0);
  const X1 = id ? link(`${id}.q.x1`) : lit(x1);
  const YN = id ? link(`${id}.q.yN`) : lit(v0);
  const YF = id ? link(`${id}.q.yF`) : lit(v0 + h);
  const yFd = id
    ? ex({ yF: ref(`${id}.q.yF`), d: ref(`${id}.q.d`) }, (t) => t.yF - t.d, "yF - d")
    : lit(v0 + h - d);
  const yNd = id
    ? ex({ yN: ref(`${id}.q.yN`), d: ref(`${id}.q.d`) }, (t) => t.yN + t.d, "yN + d")
    : lit(v0 + d);
  const clipA = (i: number) => ex(
    { a: ref(`${id}.q.n${i}.a`), x0: ref(`${id}.q.x0`) },
    (t) => Math.max(t.a, t.x0),
    "max(a, x0)",
  );
  const clipB = (i: number) => ex(
    { b: ref(`${id}.q.n${i}.b`), x1: ref(`${id}.q.x1`) },
    (t) => Math.min(t.b, t.x1),
    "min(b, x1)",
  );
  const N = notches
    .map(([a, b], i) => ({ a: Math.max(a, x0), b: Math.min(b, x1), ea: id ? clipA(i) : lit(a), eb: id ? clipB(i) : lit(b) }))
    .filter((n) => n.b - n.a > EPS)
    .sort((p, q) => p.a - q.a);
  const yN = v0, yF = v0 + h;
  const pairs: [Expr, Expr][] = [];
  const pts: P2[] = [];
  const push = (u: number, v: number, eu: Expr, ev: Expr) => {
    pts.push(mk(u, v));
    pairs.push([eu, ev]);
  };
  if (edge === "far") {
    push(x0, yN, X0, YN);
    push(x1, yN, X1, YN);
    let zr = yF;
    let zrE = YF;
    if (N.length && N[N.length - 1].b >= x1 - EPS) { zr = yF - d; zrE = yFd; }
    push(x1, zr, X1, zrE);
    let cur = x1;
    for (let i = N.length - 1; i >= 0; i--) {
      const { a, b, ea, eb } = N[i];
      if (b >= x1 - EPS) {
        push(a, yF - d, ea, yFd);
        push(a, yF, ea, YF);
      } else if (a <= x0 + EPS) {
        push(b, yF, eb, YF);
        push(b, yF - d, eb, yFd);
        push(x0, yF - d, X0, yFd);
        cur = x0;
        break;
      } else {
        push(b, yF, eb, YF);
        push(b, yF - d, eb, yFd);
        push(a, yF - d, ea, yFd);
        push(a, yF, ea, YF);
      }
      cur = a;
    }
    if (cur > x0 + EPS) push(x0, yF, X0, YF);
    push(x0, yN, X0, YN);
  } else {
    const startLift = N.length && N[0].a <= x0 + EPS;
    push(x0, startLift ? yN + d : yN, X0, startLift ? yNd : YN);
    let cur = x0;
    for (const { a, b, ea, eb } of N) {
      if (a <= x0 + EPS) {
        push(b, yN + d, eb, yNd);
        push(b, yN, eb, YN);
      } else if (b >= x1 - EPS) {
        push(a, yN, ea, YN);
        push(a, yN + d, ea, yNd);
        push(x1, yN + d, X1, yNd);
        cur = x1;
        break;
      } else {
        push(a, yN, ea, YN);
        push(a, yN + d, ea, yNd);
        push(b, yN + d, eb, yNd);
        push(b, yN, eb, YN);
      }
      cur = b;
    }
    if (cur < x1 - EPS) push(x1, yN, X1, YN);
    push(x1, yF, X1, YF);
    push(x0, yF, X0, YF);
    push(x0, startLift ? yN + d : yN, X0, startLift ? yNd : YN);
  }
  if (trace) {
    const rec = recordLoop(trace.id, trace.axes, pairs, true);
    if (rec.length !== pts.length) throw new Error(`${trace.id} trace length ${rec.length} != ${pts.length}`);
    pts.forEach((p, i) => {
      const got = p as unknown as Record<string, number>;
      const av = got[trace.axes[0]];
      const bv = got[trace.axes[1]];
      if (Math.abs(rec[i][0] - av) > 1e-6 || Math.abs(rec[i][1] - bv) > 1e-6) {
        throw new Error(`${trace.id} pv[${i}] ${rec[i][0]},${rec[i][1]} != ${av},${bv}`);
      }
    });
  }
  return pts;
}

/** XY 板（{x,y} 点，全局坐标）带后缘(y1)/前缘(y0)缺口。 */
function xyNotch(
  id: string, x0: Expr, x1: Expr, y0: Expr, h: Expr,
  notches: { a: Expr; b: Expr }[], d: Expr, edge: "near" | "far",
): P2[] {
  return edgeNotchRect(
    evalExpr(x0), evalExpr(x1), evalExpr(y0), evalExpr(h),
    notches.map((n) => [evalExpr(n.a), evalExpr(n.b)] as [number, number]),
    evalExpr(d), edge,
    (u, v) => ({ x: r2(u), y: r2(v) }),
    { id, axes: ["x", "y"], x0, x1, yN: y0, h, d, notches },
  );
}
/** XZ 板（{x,z} 点，全局坐标）带 z1/z0 边缺口。 */
function xzNotch(
  id: string, x0: Expr, x1: Expr, z0: Expr, h: Expr,
  notches: { a: Expr; b: Expr }[], d: Expr, edge: "near" | "far",
): P2[] {
  return edgeNotchRect(
    evalExpr(x0), evalExpr(x1), evalExpr(z0), evalExpr(h),
    notches.map((n) => [evalExpr(n.a), evalExpr(n.b)] as [number, number]),
    evalExpr(d), edge,
    (u, v) => ({ x: r2(u), z: r2(v) }),
    { id, axes: ["x", "z"], x0, x1, yN: z0, h, d, notches },
  );
}

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
  const leftDoor = s.leftOpts.panelType === "door";
  const rightDoor = s.rightOpts.panelType === "door";
  const push = (v: Omit<VPanel, "index" | "id">, faces: Record<string, Expr>) => {
    const index = vs.length;
    const id = `V${index}`;
    vs.push({ ...v, index, id });
    plan(id, faces);
  };
  push({
    x0: 0, x1: r2(leftDoor ? s.FPT : s.CPT),
    thickness: leftDoor ? s.FPT : s.CPT,
    kind: leftDoor ? "door" : "carcass",
    leftNeighborCol: -1, rightNeighborCol: 0,
    frontVisible: s.leftOpts.frontVisible, grooveVisible: s.leftOpts.grooveVisible,
    bchNotch: s.leftOpts.bchNotchEnabled,
  }, {
    x0: lit(0),
    x1: leftDoor ? link("kitchen.FPT") : link("kitchen.CPT"),
  });
  for (let i = 1; i < n; i++) {
    const xb = s.xBoundaries[i];
    const col = s.columns[i - 1];
    const boundary = ref(`kitchen.col.${col.id}.x1`);
    const atBoundary = ex({ xb: boundary }, (t) => t.xb, `= kitchen.col.${col.id}.x1`);
    // Split Kitchen: two end panels butted on this column line, each one CPT.
    if (s.splitAfter === i - 1) {
      push({
        x0: r2(xb - s.CPT), x1: xb,
        thickness: s.CPT, kind: "carcass",
        leftNeighborCol: i - 1, rightNeighborCol: -1,
        frontVisible: false, grooveVisible: true, bchNotch: true,
      }, {
        x0: qRound(ex({ xb: boundary, CPT: ref("kitchen.CPT") }, (t) => t.xb - t.CPT), "boundary - CPT"),
        x1: atBoundary,
      });
      push({
        x0: xb, x1: r2(xb + s.CPT),
        thickness: s.CPT, kind: "carcass",
        leftNeighborCol: -1, rightNeighborCol: i,
        frontVisible: false, grooveVisible: true, bchNotch: true,
      }, {
        x0: atBoundary,
        x1: qRound(ex({ xb: boundary, CPT: ref("kitchen.CPT") }, (t) => t.xb + t.CPT), "boundary + CPT"),
      });
      continue;
    }
    push({
      x0: r2(xb - s.CPT / 2), x1: r2(xb + s.CPT / 2),
      thickness: s.CPT, kind: "carcass",
      leftNeighborCol: i - 1, rightNeighborCol: i,
      frontVisible: false, grooveVisible: true, bchNotch: true,
    }, {
      x0: qRound(ex({ xb: boundary, CPT: ref("kitchen.CPT") }, (t) => t.xb - t.CPT / 2), "boundary - CPT / 2"),
      x1: qRound(ex({ xb: boundary, CPT: ref("kitchen.CPT") }, (t) => t.xb + t.CPT / 2), "boundary + CPT / 2"),
    });
  }
  push({
    x0: r2(s.W - (rightDoor ? s.FPT : s.CPT)), x1: s.W,
    thickness: rightDoor ? s.FPT : s.CPT,
    kind: rightDoor ? "door" : "carcass",
    leftNeighborCol: n - 1, rightNeighborCol: -1,
    frontVisible: s.rightOpts.frontVisible, grooveVisible: s.rightOpts.grooveVisible,
    bchNotch: s.rightOpts.bchNotchEnabled,
  }, {
    x1: link("kitchen.W"),
    x0: qRound(ex({ W: ref("kitchen.W"), t: rightDoor ? ref("kitchen.FPT") : ref("kitchen.CPT") }, (t) => t.W - t.t), "W - t"),
  });
  return vs;
}

/** The V on each side of a column. A split puts a full end panel on that side. */
function columnV(vPanels: VPanel[], ci: number): { left: VPanel; right: VPanel } {
  const left = vPanels.find((v) => v.rightNeighborCol === ci);
  const right = vPanels.find((v) => v.leftNeighborCol === ci);
  return {
    left: left ?? vPanels[Math.min(ci, vPanels.length - 1)],
    right: right ?? vPanels[Math.min(ci + 1, vPanels.length - 1)],
  };
}

/**
 * Wheel-arch pieces this carcass actually cuts. A split is two cabinets:
 * an arch that sits in only one of them is cut only there. An arch that
 * crosses the line is cut on each side up to the line.
 */
function clippedAvoidances(s: S): S["avoidances"] {
  if (s.splitAfter == null) return s.avoidances;
  const xb = s.xBoundaries[s.splitAfter + 1];
  const out: S["avoidances"] = [];
  for (const a of s.avoidances) {
    if (!(a.x1 > a.x0)) continue;
    const parts = [
      { x0: Math.max(a.x0, 0), x1: Math.min(a.x1, xb), tag: "L" },
      { x0: Math.max(a.x0, xb), x1: Math.min(a.x1, s.W), tag: "R" },
    ].filter((p) => p.x1 - p.x0 > EPS);
    for (const p of parts) {
      out.push({
        ...a,
        id: parts.length === 1 ? a.id : `${a.id}-${p.tag}`,
        x0: r2(p.x0),
        x1: r2(p.x1),
      });
    }
  }
  return out;
}

/**
 * V 板 YZ 外轮廓（B3 台阶 / T1 前让 / T3、B4 后接收缺口；轮拱替换后下角）。
 * na = 板厚 + 1；r = RECEIVER_NOTCH_DEPTH；frontY = style_2 ? CPT : STYLE1_TOE_KICK_Y。
 * 前可见：前缘延至 −FPT；bchNotch=false → 全高平直并封掉顶部前让位（一步生成）。
 */
function vPanelOutline(s: S, v: VPanel, avoidance?: { height: number; depth: number }, omitFrontTopReceiver = false, flatStove = false): P2[] {
  const id = v.id;
  dim(`${id}.t`, v.kind === "door" ? { FPT: ref("kitchen.FPT") } : { CPT: ref("kitchen.CPT") }, v.kind === "door" ? (t) => t.FPT : (t) => t.CPT, { formula: v.kind === "door" ? "FPT" : "CPT" });
  dim(`${id}.na`, { t: ref(`${id}.t`), extra: R.NOTCH_ALLOWANCE_EXTRA }, (t) => t.t + t.extra, { formula: "t + NOTCH_ALLOWANCE_EXTRA" });
  const cd = link("kitchen.cd");
  const H = link("kitchen.H");
  const BCH = link("kitchen.BCH");
  const na = link(`${id}.na`);
  const recv = link("kitchen.recv");
  const bsY = link("kitchen.bsY");
  const toe = link("kitchen.toeY");
  const zero = lit(0);
  const frontY: Expr = v.frontVisible
    ? ex({ FPT: ref("kitchen.FPT") }, (t) => -t.FPT, "-FPT")
    : (s.style2 ? link("kitchen.CPT") : toe);
  // An end V beside a stove, with the top rails stopped short of it, has nothing
  // to receive: a flat top and a full rear, toe-kick and B3 step kept.
  if (!v.frontVisible && flatStove) {
    if (avoidance) {
      dim(`${id}.avoid.h`, { h: avoidance.height }, (t) => t.h, { formula: "avoidH" });
      dim(`${id}.avoid.d`, { d: avoidance.depth }, (t) => t.d, { formula: "avoidD" });
      const ah = link(`${id}.avoid.h`);
      const ahR = ex({ ah: ref(`${id}.avoid.h`), r: ref("kitchen.recv") }, (t) => t.ah + t.r, "avoidH + r");
      const cdAd = ex({ cd: ref("kitchen.cd"), ad: ref(`${id}.avoid.d`) }, (t) => t.cd - t.ad, "cd - avoidD");
      const cdNa = ex({ cd: ref("kitchen.cd"), na: ref(`${id}.na`) }, (t) => t.cd - t.na, "cd - na");
      return draw([
        [frontY, zero], [frontY, BCH], [bsY, BCH], [bsY, BCHna], [zero, BCHna], [zero, H],
        [cd, H], [cd, ahR], [cdNa, ahR], [cdNa, ah], [cdAd, ah], [cdAd, zero], [frontY, zero],
      ]);
    }
    return draw([
      [frontY, zero], [frontY, BCH], [bsY, BCH], [bsY, BCHna], [zero, BCHna], [zero, H],
      [cd, H], [cd, zero], [frontY, zero],
    ]);
  }
  const cdNaR = ex({ cd: ref("kitchen.cd"), na: ref(`${id}.na`), r: ref("kitchen.recv") }, (t) => t.cd - t.na - t.r, "cd - na - r");
  const cdNa = ex({ cd: ref("kitchen.cd"), na: ref(`${id}.na`) }, (t) => t.cd - t.na, "cd - na");
  const Hna = ex({ H: ref("kitchen.H"), na: ref(`${id}.na`) }, (t) => t.H - t.na, "H - na");
  const Hr = ex({ H: ref("kitchen.H"), r: ref("kitchen.recv") }, (t) => t.H - t.r, "H - r");
  const BCHna = ex({ BCH: ref("kitchen.BCH"), na: ref(`${id}.na`) }, (t) => t.BCH + t.na, "BCH + na");
  const draw = (pairs: [Expr, Expr][]) => loopPts(id, ["y", "z"], pairs);

  if (v.frontVisible) {
    if (avoidance) {
      dim(`${id}.avoid.h`, { h: avoidance.height }, (t) => t.h, { formula: "avoidH" });
      dim(`${id}.avoid.d`, { d: avoidance.depth }, (t) => t.d, { formula: "avoidD" });
      const ah = link(`${id}.avoid.h`);
      const ahR = ex({ ah: ref(`${id}.avoid.h`), r: ref("kitchen.recv") }, (t) => t.ah + t.r, "avoidH + r");
      const cdAd = ex({ cd: ref("kitchen.cd"), ad: ref(`${id}.avoid.d`) }, (t) => t.cd - t.ad, "cd - avoidD");
      return draw([
        [frontY, zero], [frontY, H],
        [cdNaR, H], [cdNaR, Hna],
        [cdNa, Hna], [cdNa, ahR],
        [cd, ahR], [cd, ah],
        [cdAd, ah], [cdAd, zero],
        [frontY, zero],
      ]);
    }
    if (!v.bchNotch) {
      return draw([
        [frontY, zero], [frontY, H],
        [cdNaR, H], [cdNaR, Hna],
        [cdNa, Hna], [cdNa, Hr],
        [cd, Hr], [cd, recv],
        [cdNa, recv], [cdNa, zero],
        [frontY, zero],
      ]);
    }
    const zExt = ex({ BCH: ref("kitchen.BCH"), t: ref(`${id}.t`), na: ref(`${id}.na`) }, (t) => t.BCH + t.t + t.na, "BCH + t + na");
    return draw([
      [frontY, zExt], [frontY, H],
      [recv, H], [recv, Hna],
      [zero, Hna], [zero, BCHna],
      [bsY, BCHna], [bsY, BCH],
      [toe, BCH], [toe, zero],
      [cd, zero], [cd, recv],
      [cdNa, recv], [cdNa, zero],
      [frontY, zero],
    ]);
  }

  const top: [Expr, Expr][] = omitFrontTopReceiver ? [[zero, H]] : [[recv, Hna], [recv, H]];
  const base: [Expr, Expr][] = [
    [frontY, zero], [frontY, BCH],
    [bsY, BCH], [bsY, BCHna],
    [zero, BCHna], [zero, Hna],
    ...top,
    [cdNaR, H], [cdNaR, Hna],
    [cdNa, Hna], [cdNa, Hr],
    [cd, Hr], [cd, recv],
    [cdNa, recv], [cdNa, zero],
    [frontY, zero],
  ];
  if (avoidance) {
    dim(`${id}.avoid.h`, { h: avoidance.height }, (t) => t.h, { formula: "avoidH" });
    dim(`${id}.avoid.d`, { d: avoidance.depth }, (t) => t.d, { formula: "avoidD" });
    const ah = link(`${id}.avoid.h`);
    const ahR = ex({ ah: ref(`${id}.avoid.h`), r: ref("kitchen.recv") }, (t) => t.ah + t.r, "avoidH + r");
    const cdAd = ex({ cd: ref("kitchen.cd"), ad: ref(`${id}.avoid.d`) }, (t) => t.cd - t.ad, "cd - avoidD");
    return draw([
      ...base.slice(0, 8),
      [cdNaR, H], [cdNaR, Hna],
      [cdNa, Hna], [cdNa, Hr],
      [cd, Hr], [cd, ahR],
      [cdNa, ahR], [cdNa, ah],
      [cdAd, ah], [cdAd, zero],
      [frontY, zero],
    ]);
  }
  return draw(base);
}

function avoidanceForV(s: S, v: VPanel, avoidances: S["avoidances"]) {
  const a = avoidances.find((a) => a.x0 < v.x1 && a.x1 > v.x0 && a.height > 0 && a.depth > 0 && a.x1 > a.x0);
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
  /** Front area of the board's zone, centreline to centreline: the larger side keeps its slots. */
  area: number;
  /** The board's depth span at the V (screw positions). */
  boardY0: number;
  boardY1: number;
}

/**
 * Screw positions along a board's depth: SCREW_END_OFFSET from each end, the
 * span between split evenly at no more than SCREW_MAX_SPACING, symmetric
 * about the middle. A board shorter than two offsets gets one screw in the middle.
 */
export function screwPositions(y0: number, y1: number): number[] {
  const L = y1 - y0;
  const off = R.SCREW_END_OFFSET.value;
  const S = L - 2 * off;
  if (S <= EPS) return [r2(y0 + L / 2)];
  const n = Math.ceil(S / R.SCREW_MAX_SPACING.value - 1e-9);
  return Array.from({ length: n + 1 }, (_, k) => r2(y0 + off + (k * S) / n));
}

/** V 板槽面对侧的邻列在 z 高度是否为可见区（门板/open/custom）。 */
function neighborVisible(s: S, v: VPanel, face: "left" | "right", z0: number, z1: number): boolean {
  const colIdx = face === "left" ? v.leftNeighborCol : v.rightNeighborCol;
  if (colIdx < 0) return false;
  const col = s.columns[colIdx];
  if (!col) return false;
  const hit = col.zones.find((z) => z.z1 > z0 && z.z0 < z1);
  if (!hit) return false;
  return VISIBLE_ZONE_TYPES.has(hit.zoneType);
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

type SlotKind = "through" | "half" | "none";

/**
 * One slot per functional board on each V it meets. The CNC cuts from one side
 * only, so a V may carry any number of through slots but half slots on one face
 * only:
 *   1. half when the V's other face at that height looks into a visible zone, else through;
 *   2. half slots on both faces: the side with the smaller zone area (summed) gets none;
 *   3. slots on opposite faces closer than SLOT_MIN_GAP: the smaller zone of the pair gets none.
 * A board with none is butt-jointed and screwed through the V (screwPositions).
 * A machining preference chosen for the V (vPanelMachiningPreferences) overrides 2 and 3.
 */
function resolveSlots(
  s: S, requests: SlotRequest[], vPanels: VPanel[],
): { slots: SlotRecord[]; screws: ScrewRecord[]; tongueOf: Map<string, { left: number; right: number }> } {
  const slots: SlotRecord[] = [];
  const screws: ScrewRecord[] = [];
  const tongueOf = new Map<string, { left: number; right: number }>();
  const byV = new Map<number, { left: SlotRequest[]; right: SlotRequest[] }>();
  for (const q of requests) {
    const e = byV.get(q.vIndex) ?? { left: [], right: [] };
    e[q.side].push(q);
    byV.set(q.vIndex, e);
  }
  const zc = R.SLOT_Z_CLEARANCE.value;
  for (const [vi, sides] of byV) {
    const v = vPanels[vi];
    // half 判定：槽面对侧（V 板另一面）邻区可见，或侧板 grooveVisible=false（外侧不可见）
    const kind = new Map<SlotRequest, SlotKind>();
    for (const q of [...sides.left, ...sides.right]) {
      const other = q.side === "left" ? "right" : "left";
      kind.set(q, neighborVisible(s, v, other, q.z0, q.z1) || !v.grooveVisible ? "half" : "through");
    }
    const halves = (list: SlotRequest[]) => list.filter((q) => kind.get(q) === "half");
    const mode = s.prefs.get(vi);
    if (mode && halves(sides.left).length && halves(sides.right).length) {
      const [kl, kr] = MACHINING_TABLE[mode];
      for (const q of sides.left) kind.set(q, kl);
      for (const q of sides.right) kind.set(q, kr);
    } else if (!mode) {
      const hl = halves(sides.left), hr = halves(sides.right);
      if (hl.length && hr.length) {
        const area = (list: SlotRequest[]) => list.reduce((a, q) => a + q.area, 0);
        for (const q of area(hl) < area(hr) ? hl : hr) kind.set(q, "none");
      }
      // Opposite faces: two slots closer than the gap would cut into each other.
      let changed = true;
      while (changed) {
        changed = false;
        for (const l of sides.left) {
          for (const r of sides.right) {
            if (kind.get(l) === "none" || kind.get(r) === "none") continue;
            const gap = Math.max((r.z0 - zc) - (l.z1 + zc), (l.z0 - zc) - (r.z1 + zc));
            if (gap >= R.SLOT_MIN_GAP.value - EPS) continue;
            kind.set(l.area < r.area ? l : r, "none");
            changed = true;
          }
        }
      }
    }

    const emit = (side: "left" | "right", k: SlotKind, q: SlotRequest) => {
      // V 板视角 side 是槽面（功能板所在侧）→ 功能板舌在相反端：
      // V 板 side="right"（功能板在 V 右侧）→ 功能板左舌；side="left" → 右舌。
      const boardSide = side === "right" ? "left" : "right";
      const t = tongueOf.get(q.boardId) ?? { left: 0, right: 0 };
      if (k === "none") {
        t[boardSide] = 0;
        tongueOf.set(q.boardId, t);
        dim(`kitchen.tongue.${q.boardId}.${boardSide}`, {}, () => 0, { formula: "0" });
        const z = r2((q.z0 + q.z1) / 2);
        screwPositions(q.boardY0, q.boardY1).forEach((y, i) => {
          const sid = `${q.boardId}-V${vi}-screw-${i + 1}`;
          const L = q.boardY1 - q.boardY0;
          const off = R.SCREW_END_OFFSET.value;
          const span = L - 2 * off;
          if (span <= EPS) {
            dim(`kitchen.screw.${sid}.y`, { y0: q.boardY0, y1: q.boardY1 }, (t) => Math.round((t.y0 + (t.y1 - t.y0) / 2) * 1000) / 1000, { formula: "y0 + (y1 - y0) / 2" });
          } else {
            const n = Math.ceil(span / R.SCREW_MAX_SPACING.value - 1e-9);
            dim(`kitchen.screw.${sid}.y`, { y0: q.boardY0, off: R.SCREW_END_OFFSET, span, n, k: i }, (t) => Math.round((t.y0 + t.off + (t.k * t.span) / t.n) * 1000) / 1000, { formula: "y0 + endOffset + k * span / n" });
          }
          dim(`kitchen.screw.${sid}.z`, { z0: ref(`${q.boardId}.z0`), z1: ref(`${q.boardId}.z1`) }, (t) => Math.round(((t.z0 + t.z1) / 2) * 1000) / 1000, { formula: "(z0 + z1) / 2" });
          dim(`kitchen.screw.${sid}.d`, { d: R.SCREW_HOLE_DIAMETER }, (t) => t.d, { formula: "SCREW_HOLE_DIAMETER" });
          screws.push({ id: sid, vPanelId: `V${vi}`, side, forBoard: q.boardId, y, z, diameter: R.SCREW_HOLE_DIAMETER.value });
        });
        return;
      }
      const tongue = k === "through" ? s.CPT : v.thickness / 2; // through 舌 = CPT（与侧板厚无关）
      if (k === "through") dim(`kitchen.tongue.${q.boardId}.${boardSide}`, { CPT: ref("kitchen.CPT") }, (t) => t.CPT, { formula: "CPT" });
      else dim(`kitchen.tongue.${q.boardId}.${boardSide}`, { t: ref(`${v.id}.t`) }, (t) => t.t / 2, { formula: "t / 2" });
      const clrRule = q.isDrawer ? R.DRAWER_SLOT_CLEARANCE : R.SHELF_SLOT_CLEARANCE;
      const clr = clrRule.value;
      const slotId = `${q.boardId}-V${vi}-${side}`;
      dim(`kitchen.slot.${slotId}.y0`, { y: ref(`kitchen.ty.${q.boardId}.y0`), clr: clrRule }, (t) => Math.round((t.y - t.clr) * 1000) / 1000, { formula: "tongueY0 - clearance" });
      dim(`kitchen.slot.${slotId}.y1`, { y: ref(`kitchen.ty.${q.boardId}.y1`), clr: clrRule }, (t) => Math.round((t.y + t.clr) * 1000) / 1000, { formula: "tongueY1 + clearance" });
      dim(`kitchen.slot.${slotId}.z0`, { z: ref(`${q.boardId}.z0`), c: R.SLOT_Z_CLEARANCE }, (t) => Math.round((t.z - t.c) * 1000) / 1000, { formula: "boardZ0 - SLOT_Z_CLEARANCE" });
      dim(`kitchen.slot.${slotId}.z1`, { z: ref(`${q.boardId}.z1`), c: R.SLOT_Z_CLEARANCE }, (t) => Math.round((t.z + t.c) * 1000) / 1000, { formula: "boardZ1 + SLOT_Z_CLEARANCE" });
      slots.push({
        id: slotId,
        vPanelId: `V${vi}`,
        side,
        through: k === "through",
        depth: k === "through" ? v.thickness : v.thickness / 2,
        y0: r2(q.tongueY0 - clr), y1: r2(q.tongueY1 + clr),
        z0: r2(q.z0 - R.SLOT_Z_CLEARANCE.value), z1: r2(q.z1 + R.SLOT_Z_CLEARANCE.value),
        forBoard: q.boardId,
      });
      t[boardSide] = tongue;
      tongueOf.set(q.boardId, t);
    };
    for (const q of sides.left) emit("left", kind.get(q)!, q);
    for (const q of sides.right) emit("right", kind.get(q)!, q);
  }
  return { slots, screws, tongueOf };
}

/* ================= 主流程 ================= */

function recordColumns(s: S) {
  let prev = "kitchen.originX";
  dim(prev, { x0: param({ x0: s.x0 }).x0 }, (t) => t.x0, { formula: s.waterfall === "left" ? "waterfall thickness" : "0" });
  for (const col of s.columns) {
    const width = param({ width: col.width }).width;
    dim(`kitchen.col.${col.id}.x0`, { x: ref(prev) }, (t) => t.x, { formula: `= ${prev}` });
    dim(`kitchen.col.${col.id}.x1`, { x0: ref(`kitchen.col.${col.id}.x0`), width }, (t) => Math.round((t.x0 + t.width) * 1000) / 1000, { formula: "x0 + width" });
    prev = `kitchen.col.${col.id}.x1`;
    let zKey = "kitchen.H";
    for (const zone of col.zones) {
      const height = param({ height: zone.height }).height;
      const z1 = `kitchen.zone.${col.id}.${zone.id}.z1`;
      const z0 = `kitchen.zone.${col.id}.${zone.id}.z0`;
      dim(z1, { z: ref(zKey) }, (t) => t.z, { formula: `= ${zKey}` });
      dim(z0, { z1: ref(z1), height }, (t) => Math.round((t.z1 - t.height) * 1000) / 1000, { formula: "z1 - height" });
      zKey = z0;
    }
  }
}

function wheelHit(col: ColumnPlan, avoidances: S["avoidances"]) {
  return avoidances.find((a) => a.x1 > a.x0 && a.height > 0 && a.depth > 0 && a.x0 < col.x1 && a.x1 > col.x0);
}

/** Washer deck behind B3, tongues into the column's side panels, two plinth supports under it. */
function addWasherFloor(s: S, col: ColumnPlan, zone: ZonePlan, vL: VPanel, vR: VPanel): {
  boards: Board[];
  tongue: { id: string; vLeft: string; vRight: string; y0: number; y1: number; z0: number; z1: number; depth: number } | null;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const id = `${col.id}-${zone.id}-appliance-floor`;
  if (s.baseKind !== "ensuite") {
    errors.push(`Appliance floor in ${zone.id} is only on an ensuite.`);
    return { boards: [], tongue: null, errors, warnings };
  }
  if (zone.zoneType !== "left_door" && zone.zoneType !== "right_door") {
    errors.push(`Appliance floor in ${zone.id} requires a left or right door (not ${zone.zoneType}).`);
    return { boards: [], tongue: null, errors, warnings };
  }
  if (s.style2) {
    errors.push(`Appliance floor in ${zone.id} requires Style 1 bottom clearance.`);
    return { boards: [], tongue: null, errors, warnings };
  }
  const hit = wheelHit(col, s.avoidances);
  if (hit) {
    errors.push(`Appliance floor in ${zone.id} is not allowed: column intersects wheel avoidance ${hit.id}.`);
    return { boards: [], tongue: null, errors, warnings };
  }
  const clearX0 = vL.x1;
  const clearX1 = vR.x0;
  const clearW = clearX1 - clearX0;
  const floorY0 = R.SUPPORT_STRIP_WIDTH.value;
  const floorY1 = r2(s.cd - s.CPT);
  const span = floorY1 - floorY0;
  if (clearW < R.APPLIANCE_FLOOR_MIN_CLEAR_WIDTH_MM.value) {
    errors.push(`Appliance floor in ${zone.id} needs clear width >= ${R.APPLIANCE_FLOOR_MIN_CLEAR_WIDTH_MM.value} mm (got ${r2(clearW)}).`);
  }
  if (s.cd < R.APPLIANCE_FLOOR_MIN_DEPTH_MM.value) {
    errors.push(`Appliance floor in ${zone.id} needs structural depth >= ${R.APPLIANCE_FLOOR_MIN_DEPTH_MM.value} mm (got ${r2(s.cd)}).`);
  }
  if (span < R.APPLIANCE_FLOOR_MIN_SPAN_MM.value) {
    errors.push(`Appliance floor in ${zone.id} has insufficient depth behind B3 (${r2(span)} mm).`);
  }
  if (errors.length) return { boards: [], tongue: null, errors, warnings };
  const tongue = s.CPT / 2;
  const tongueY0 = r2(floorY0 + span / 3);
  const tongueY1 = r2(floorY0 + (2 * span) / 3);
  const x0 = r2(clearX0 - tongue);
  const x1 = r2(clearX1 + tongue);
  const z0 = s.BCH;
  const z1 = r2(s.BCH + s.CPT);
  const X0 = lit(clearX0);
  const X1 = lit(clearX1);
  const TX0 = lit(x0);
  const TX1 = lit(x1);
  const Y0 = lit(floorY0);
  const Y1 = lit(floorY1);
  const TY0 = lit(tongueY0);
  const TY1 = lit(tongueY1);
  const outline = loopPts(id, ["x", "y"], [
    [X0, Y0], [X1, Y0], [X1, TY0], [TX1, TY0], [TX1, TY1], [X1, TY1],
    [X1, Y1], [X0, Y1], [X0, TY1], [TX0, TY1], [TX0, TY0], [X0, TY0], [X0, Y0],
  ]);
  const boards: Board[] = [
    mkBoard(id, "Washer floor", "bottom", "appliance_floor", s.CPT, "carcass",
      "XY", "Z", x0, x1, floorY0, floorY1, z0, z1, outline),
  ];
  [0.35, 0.75].forEach((at, index) => {
    const center = floorY0 + span * at;
    const y0 = r2(center - s.CPT / 2);
    const y1 = r2(center + s.CPT / 2);
    if (y0 < floorY0 + 1 || y1 > floorY1 - 1) return;
    const sid = `${col.id}-${zone.id}-underside-${index + 1}`;
    boards.push(mkBoard(sid, `Washer support ${index + 1}`, "bottom", "underside_support", s.CPT, "carcass",
      "XZ", "Y", clearX0, clearX1, y0, y1, 0, s.BCH, rectXZ(clearX1 - clearX0, s.BCH)));
  });
  if (boards.length < 3) warnings.push(`Appliance floor ${id}: underside supports skipped (floor span too short).`);
  return {
    boards,
    tongue: { id, vLeft: vL.id, vRight: vR.id, y0: tongueY0, y1: tongueY1, z0, z1, depth: tongue },
    errors, warnings,
  };
}

/**
 * B1 / B2 placement lives in layout.json under those ids. A split renames the
 * pieces B1-1, B1-2, … and the same Y rule has to follow each piece, or the
 * layout check reports the original id as missing and moves nothing.
 */
function layoutForSplitRails(layout: unknown, boards: Board[]): unknown {
  if (layout == null || typeof layout !== "object") return layout;
  const file = structuredClone(layout) as { boards?: Record<string, unknown> };
  if (!file.boards) return layout;
  const ids = new Set(boards.map((b) => b.id));
  for (const base of ["B1", "B2"]) {
    const rule = file.boards[base];
    if (!rule || ids.has(base)) continue;
    delete file.boards[base];
    for (const id of ids) {
      if (id.startsWith(`${base}-`)) file.boards[id] = structuredClone(rule);
    }
  }
  return file;
}

export function generateKitchenCabinet(input: KitchenParams, options: { layout?: unknown } = {}): KitchenResult {
  beginProvenance();
  resetPlans();
  const s = normalize(input);
  const P = param({ W: s.W, D: s.D, H: s.H, CPT: s.CPT, FPT: s.FPT, BCH: s.BCH, fc: s.fc, cd: s.cd });
  dim("kitchen.carcassDepth", { D: P.D, FPT: P.FPT }, (t) => t.D - t.FPT);
  dim("kitchen.H", { H: P.H }, (t) => t.H, { formula: "H" });
  dim("kitchen.W", { W: P.W }, (t) => t.W, { formula: "W" });
  dim("kitchen.CPT", { CPT: P.CPT }, (t) => t.CPT, { formula: "CPT" });
  dim("kitchen.FPT", { FPT: P.FPT }, (t) => t.FPT, { formula: "FPT" });
  dim("kitchen.BCH", { BCH: P.BCH }, (t) => t.BCH, { formula: "BCH" });
  dim("kitchen.fc", { fc: P.fc }, (t) => t.fc, { formula: "fc" });
  dim("kitchen.cd", { D: P.D, FPT: P.FPT }, (t) => Math.round((t.D - t.FPT) * 1000) / 1000, { formula: "D - FPT" });
  dim("kitchen.toeY", { y: R.STYLE1_TOE_KICK_Y }, (t) => t.y, { formula: "STYLE1_TOE_KICK_Y" });
  // The face formulas write this name (`toeY + FPT`). It is the same constant.
  dim("toeY", { y: R.STYLE1_TOE_KICK_Y }, (t) => t.y, { formula: "STYLE1_TOE_KICK_Y" });
  dim("kitchen.bsY", { y: R.BOTTOM_SLOT_REAR_Y }, (t) => t.y, { formula: "BOTTOM_SLOT_REAR_Y" });
  dim("kitchen.recv", { r: R.RECEIVER_NOTCH_DEPTH }, (t) => t.r, { formula: "RECEIVER_NOTCH_DEPTH" });
  dim("kitchen.stripW", { w: R.SUPPORT_STRIP_WIDTH }, (t) => t.w, { formula: "SUPPORT_STRIP_WIDTH" });
  dim("kitchen.notchD", { d: R.SUPPORT_STRIP_NOTCH_DEPTH }, (t) => t.d, { formula: "SUPPORT_STRIP_NOTCH_DEPTH" });
  dim("kitchen.b3", { d: R.B3_DEPTH }, (t) => t.d, { formula: "B3_DEPTH" });
  recordColumns(s);
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
  const arches = clippedAvoidances(s);
  if (s.splitAfter != null) {
    for (const ci of [s.splitAfter, s.splitAfter + 1]) {
      const { left, right } = columnV(vPanels, ci);
      if (!(right.x0 - left.x1 > EPS)) {
        errors.push(`Column ${s.columns[ci].id} is too narrow for a split end (${r2(right.x0 - left.x1)} mm clear).`);
      }
    }
  }
  const lastCol = s.columns.length - 1;
  const stoveAtLeftEdge = s.columns[0]?.zones.some((z) => z.zoneType === "stove") === true;
  const stoveAtRightEdge = lastCol >= 0 && s.columns[lastCol].zones.some((z) => z.zoneType === "stove");
  for (const v of vPanels) {
    const av = avoidanceForV(s, v, arches);
    const edgeStove = (v.index === 0 && stoveAtLeftEdge) || (v.index === vPanels.length - 1 && stoveAtRightEdge);
    const extendOut = v.index === 0 ? s.leftOpts.extendT2T3B4ToOuterFace : s.rightOpts.extendT2T3B4ToOuterFace;
    const flatStove = edgeStove && extendOut === false && !v.frontVisible;
    const omitT1 = edgeStove && !flatStove;
    const outline = vPanelOutline(s, v, av, omitT1 && !v.frontVisible, flatStove);
    const label = v.index === 0 ? "Left End Panel"
      : v.index === vPanels.length - 1 ? "Right End Panel"
        : (v.leftNeighborCol < 0 || v.rightNeighborCol < 0) ? "Split End Panel"
          : `Vertical Panel ${v.index}`;
    plan(v.id, { y0: lit(0), y1: link("kitchen.cd"), z0: lit(0), z1: link("kitchen.H") });
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

  const frontX0: Expr = s.leftOpts.frontVisible ? link("V0.x1") : lit(0);
  const frontX1: Expr = s.rightOpts.frontVisible ? link(`${vPanels[vPanels.length - 1].id}.x0`) : link("kitchen.W");
  const rearX0: Expr = (s.leftOpts.frontVisible && !s.leftOpts.extendT2T3B4ToOuterFace) ? link("V0.x1") : lit(0);
  const rearX1: Expr = (s.rightOpts.frontVisible && !s.rightOpts.extendT2T3B4ToOuterFace) ? link(`${vPanels[vPanels.length - 1].id}.x0`) : link("kitchen.W");
  const localW = (boardId: string) => ex({ x1: ref(`${boardId}.x1`), x0: ref(`${boardId}.x0`) }, (t) => t.x1 - t.x0, "x1 - x0");

  /* ---- V 让位缺口（宽 = CPT + 1，与 V 板料厚无关；黄金 V0 心 8 → [0,16]） ---- */
  const vNotchRanges = vPanels.map((v) => {
    const c = (v.x0 + v.x1) / 2;
    return [r2(c - (CPT + R.NOTCH_ALLOWANCE_EXTRA.value) / 2), r2(c + (CPT + R.NOTCH_ALLOWANCE_EXTRA.value) / 2)] as [number, number];
  });
  const vNotchExpr = vPanels.map((v) => {
    dim(`kitchen.vnotch.${v.id}.x0`, {
      c0: ref(`${v.id}.x0`), c1: ref(`${v.id}.x1`), CPT: ref("kitchen.CPT"), extra: R.NOTCH_ALLOWANCE_EXTRA,
    }, (t) => Math.round(((t.c0 + t.c1) / 2 - (t.CPT + t.extra) / 2) * 1000) / 1000, { formula: "centre - (CPT + 1) / 2" });
    dim(`kitchen.vnotch.${v.id}.x1`, {
      c0: ref(`${v.id}.x0`), c1: ref(`${v.id}.x1`), CPT: ref("kitchen.CPT"), extra: R.NOTCH_ALLOWANCE_EXTRA,
    }, (t) => Math.round(((t.c0 + t.c1) / 2 + (t.CPT + t.extra) / 2) * 1000) / 1000, { formula: "centre + (CPT + 1) / 2" });
    return { a: link(`kitchen.vnotch.${v.id}.x0`), b: link(`kitchen.vnotch.${v.id}.x1`) };
  });
  // A notch is CPT + 1 wide, centred on its V, so it crosses the split by 0.5 mm.
  // The piece on the other side would keep that sliver. Two notches that both
  // run out the cut then join with a diagonal, and the slot is drawn as a triangle.
  // Keep a notch only when this piece contains the V's centre.
  const notchesOn = (x0: number, x1: number) => vNotchExpr.filter((_, i) => {
    const v = vPanels[i];
    const c = (v.x0 + v.x1) / 2;
    return c > x0 + EPS && c < x1 - EPS;
  });

  // A cut range is removed. A split is a zero-width cut, so the two pieces meet on the line.
  const segmentBy = (x0: number, x1: number, cuts: [number, number][]) => {
    const extra: [number, number][] = [];
    if (s.splitAfter != null) {
      const xb = s.xBoundaries[s.splitAfter + 1];
      if (xb > x0 + EPS && xb < x1 - EPS) extra.push([xb, xb]);
    }
    const pts = [...cuts, ...extra].sort((a, b) => a[0] - b[0]);
    const segs: [number, number][] = [];
    let cur = x0;
    for (const [c0, c1] of pts) {
      if (c1 <= x0 || c0 >= x1) continue;
      const a = Math.max(c0, x0), b = Math.min(c1, x1);
      if (a > cur + EPS) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < x1 - EPS) segs.push([cur, x1]);
    return segs.filter(([a, b]) => b - a >= R.MIN_STRIP_SEGMENT_LENGTH.value);
  };
  const knownX = (n: number, id: string, face: "x0" | "x1"): Expr => {
    const candidates: { v: number; e: Expr }[] = [
      { v: evalExpr(frontX0), e: frontX0 },
      { v: evalExpr(frontX1), e: frontX1 },
      { v: evalExpr(rearX0), e: rearX0 },
      { v: evalExpr(rearX1), e: rearX1 },
    ];
    for (const v of vPanels) candidates.push({ v: v.x0, e: link(`${v.id}.x0`) }, { v: v.x1, e: link(`${v.id}.x1`) });
    const hit = candidates.find((c) => Math.abs(c.v - n) < 1e-4);
    if (hit) return hit.e;
    return ex({ x: n }, (t) => t.x, `${id}.${face}`);
  };
  const xPair = (a: number, b: number, id: string, whole: boolean): [Expr, Expr] =>
    whole ? [frontX0, frontX1] : [knownX(a, id, "x0"), knownX(b, id, "x1")];

  /* ---- B1 / B2（style_1 趾踢内缩 / style_2 平前）. A split meets flush on the line. ---- */
  {
    const segs = segmentBy(frontStop.x0, frontStop.x1, []);
    const whole = segs.length <= 1;
    const placeBottom = (
      base: string, name: string, boardType: string, thickness: number, kind: "door" | "carcass",
      y0: number, y1: number, y0e: Expr, y1e: Expr,
    ) => {
      segs.forEach(([a, b], i) => {
        const id = whole ? base : `${base}-${i + 1}`;
        const [x0e, x1e] = xPair(a, b, id, whole);
        plan(id, { x0: x0e, x1: x1e, y0: y0e, y1: y1e, z0: lit(0), z1: link("kitchen.BCH") });
        boards.push(mkBoard(id, name, "bottom", boardType, thickness, kind,
          "XZ", "Y", a, b, y0, y1, 0, BCH, traceLocalRect(id, ["x", "z"], localW(id), link("kitchen.BCH"))));
      });
    };
    if (s.style2) {
      placeBottom("B1", "Bottom Front Panel", "bottom_front", FPT, "door", -FPT, 0, ex({ FPT: ref("kitchen.FPT") }, (t) => -t.FPT, "-FPT"), lit(0));
      placeBottom("B2", "Bottom Carcass Panel", "bottom_carcass", CPT, "carcass", 0, CPT, lit(0), link("kitchen.CPT"));
    } else {
      const toeY0 = R.STYLE1_TOE_KICK_Y.value;
      const toeY1 = toeY0 + FPT;
      const toeRear = ex({ y: ref("kitchen.toeY"), FPT: ref("kitchen.FPT") }, (t) => t.y + t.FPT, "toeY + FPT");
      const b2Rear = qRound(ex({ y: ref("kitchen.toeY"), FPT: ref("kitchen.FPT"), CPT: ref("kitchen.CPT") }, (t) => t.y + t.FPT + t.CPT), "toeY + FPT + CPT");
      placeBottom("B1", "Bottom Front Panel", "bottom_front", FPT, "door", toeY0, toeY1, link("kitchen.toeY"), toeRear);
      placeBottom("B2", "Bottom Carcass Panel", "bottom_carcass", CPT, "carcass", toeY1, r2(toeY1 + CPT), toeRear, b2Rear);
    }
  }

  /* ---- B3 底板（y∈[0,100] z∈[BCH,BCH+CPT]，V 缺口从后缘 y=100 凹进 20） ---- */
  {
    const segs = segmentBy(frontStop.x0, frontStop.x1, []);
    const whole = segs.length <= 1;
    const z1e = qRound(ex({ BCH: ref("kitchen.BCH"), CPT: ref("kitchen.CPT") }, (t) => t.BCH + t.CPT), "BCH + CPT");
    segs.forEach(([a, b], i) => {
      const id = whole ? "B3" : `B3-${i + 1}`;
      const [x0e, x1e] = xPair(a, b, id, whole);
      plan(id, {
        x0: x0e, x1: x1e, y0: lit(0), y1: link("kitchen.stripW"),
        z0: link("kitchen.BCH"), z1: z1e,
      });
      boards.push(mkBoard(id, "Bottom Deck", "bottom", "bottom_deck", CPT, "carcass",
        "XY", "Z", a, b, 0, stripW, BCH, r2(BCH + CPT),
        xyNotch(id, x0e, x1e, lit(0), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "far")));
    });
  }

  /* ---- 功能板（先建槽请求，轮廓待槽解析后一步生成） ---- */
  const requests: SlotRequest[] = [];
  interface FuncBoard {
    board: Board;
    isDrawer: boolean;
    clearX0: number; clearX1: number;
    z0: number; z1: number;
    y0e: Expr;
    y1e: Expr;
    /** Stove full shelf: a front lip between the two side panels, one door thickness proud. */
    lip?: boolean;
    ci?: number;
  }
  const funcBoards: FuncBoard[] = [];
  const applianceTongues: { id: string; vLeft: string; vRight: string; y0: number; y1: number; z0: number; z1: number; depth: number }[] = [];

  const addFuncBoard = (
    id: string, name: string, boardType: string, ci: number,
    z0: number, z1: number, z0e: Expr, z1e: Expr, isDrawer: boolean, zone: ZonePlan,
    span?: { y0: number; y1: number; y0e: Expr; y1e: Expr },
  ) => {
    const { left: vL, right: vR } = columnV(vPanels, ci);
    const clearX0 = vL.x1, clearX1 = vR.x0;
    // The zone's front, centreline to centreline: the side with more of it keeps its slots.
    const area = ((vR.x0 + vR.x1) / 2 - (vL.x0 + vL.x1) / 2) * (zone.z1 - zone.z0);
    // A full-depth shelf stops on T3 / B4's front face when it shares their height.
    const intoRear = !isDrawer && !span && (z0 < stripW || z1 > r2(H - stripW));
    const y0n = span?.y0 ?? 0;
    const depth = span ? span.y1 : (isDrawer ? R.B3_DEPTH.value : (intoRear ? r2(cd - CPT) : cd));
    const y0e = span?.y0e ?? lit(0);
    const y1e: Expr = span?.y1e ?? (isDrawer
      ? link("kitchen.b3")
      : intoRear
        ? qRound(ex({ cd: ref("kitchen.cd"), CPT: ref("kitchen.CPT") }, (t) => t.cd - t.CPT), "cd - CPT")
        : link("kitchen.cd"));
    const ty0 = isDrawer ? R.DRAWER_TONGUE_Y0.value : (span ? r2(y0n + (depth - y0n) / 3) : r2(cd / 3));
    const ty1 = isDrawer ? R.B3_DEPTH.value : (span ? r2(y0n + (2 * (depth - y0n)) / 3) : r2((2 * cd) / 3));
    dim(`kitchen.span.${id}.x0`, { x: ref(`${vL.id}.x1`) }, (t) => t.x, { formula: `= ${vL.id}.x1` });
    dim(`kitchen.span.${id}.x1`, { x: ref(`${vR.id}.x0`) }, (t) => t.x, { formula: `= ${vR.id}.x0` });
    if (isDrawer) {
      dim(`kitchen.ty.${id}.y0`, { y: R.DRAWER_TONGUE_Y0 }, (t) => t.y, { formula: "DRAWER_TONGUE_Y0" });
      dim(`kitchen.ty.${id}.y1`, { y: R.B3_DEPTH }, (t) => t.y, { formula: "B3_DEPTH" });
    } else if (span) {
      dim(`kitchen.ty.${id}.y0`, { y0: span.y0e, y1: span.y1e }, (t) => Math.round((t.y0 + (t.y1 - t.y0) / 3) * 1000) / 1000, { formula: "y0 + (y1 - y0) / 3" });
      dim(`kitchen.ty.${id}.y1`, { y0: span.y0e, y1: span.y1e }, (t) => Math.round((t.y0 + (2 * (t.y1 - t.y0)) / 3) * 1000) / 1000, { formula: "y0 + 2 * (y1 - y0) / 3" });
    } else {
      dim(`kitchen.ty.${id}.y0`, { cd: ref("kitchen.cd") }, (t) => Math.round((t.cd / 3) * 1000) / 1000, { formula: "cd / 3" });
      dim(`kitchen.ty.${id}.y1`, { cd: ref("kitchen.cd") }, (t) => Math.round(((2 * t.cd) / 3) * 1000) / 1000, { formula: "2 * cd / 3" });
    }
    plan(id, { y0: y0e, y1: y1e, z0: z0e, z1: z1e });
    const board = mkBoard(id, name, "functional", boardType, CPT, "carcass",
      "XY", "Z", clearX0, clearX1, y0n, depth, z0, z1,
      [{ x: clearX0, y: y0n }, { x: clearX1, y: y0n }, { x: clearX1, y: depth }, { x: clearX0, y: depth }, { x: clearX0, y: y0n }]);
    boards.push(board);
    funcBoards.push({ board, isDrawer, clearX0, clearX1, z0, z1, y0e, y1e, ci });
    const at = { boardId: id, tongueY0: ty0, tongueY1: ty1, z0, z1, isDrawer, area, boardY0: y0n, boardY1: depth };
    requests.push({ vIndex: vL.index, side: "right", ...at });
    requests.push({ vIndex: vR.index, side: "left", ...at });
  };

  const shelfBand = (colId: string, zone: ZonePlan) => {
    const zKey = `kitchen.zone.${colId}.${zone.id}.z0`;
    const shelfH = zone.shelfHeight ?? Math.round(zone.height / 2);
    dim(`kitchen.shelf.${zone.id}.top`, { z0: ref(zKey), h: param({ shelfHeight: shelfH }).shelfHeight }, (t) => Math.round((t.z0 + t.h) * 1000) / 1000, { formula: "zoneZ0 + shelfHeight" });
    dim(`kitchen.shelf.${zone.id}.center`, { top: ref(`kitchen.shelf.${zone.id}.top`), CPT: ref("kitchen.CPT") }, (t) => Math.round((t.top - t.CPT / 2) * 1000) / 1000, { formula: "shelfTop - CPT / 2" });
    return {
      z0e: qRound(ex({ c: ref(`kitchen.shelf.${zone.id}.center`), CPT: ref("kitchen.CPT") }, (t) => t.c - t.CPT / 2), "center - CPT / 2"),
      z1e: qRound(ex({ c: ref(`kitchen.shelf.${zone.id}.center`), CPT: ref("kitchen.CPT") }, (t) => t.c + t.CPT / 2), "center + CPT / 2"),
    };
  };

  s.columns.forEach((col, ci) => {
    for (const zone of col.zones) {
      if (zone.z0 <= BCH + EPS) continue; // 底区不生成
      const isDrawer = DRAWER_BOTTOM_TYPES.has(zone.zoneType);
      const isShelf = FULL_SHELF_TYPES.has(zone.zoneType);
      if (!isDrawer && !isShelf) continue;
      const z = r2(zone.z0 - CPT / 2), zc = r2(zone.z0 + CPT / 2);
      const zKey = `kitchen.zone.${col.id}.${zone.id}.z0`;
      const z0e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT / 2), "zoneZ0 - CPT / 2");
      const z1e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z + t.CPT / 2), "zoneZ0 + CPT / 2");
      addFuncBoard(
        `${col.id}-${zone.id}-bottom`,
        isDrawer ? "Drawer Divider" : "Full Depth Shelf",
        isDrawer ? "drawer_divider" : "full_depth_shelf",
        ci, z, zc, z0e, z1e, isDrawer, zone,
      );
      if (zone.zoneType === "stove") {
        const below = col.zones[col.zones.indexOf(zone) + 1];
        if (below && PANEL_ZONE_TYPES.has(below.zoneType)) {
          const made = funcBoards[funcBoards.length - 1];
          made.board.boardType = "stove_full_shelf";
          made.lip = true;
          made.ci = ci;
        }
      }
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
        const band = shelfBand(col.id, zone);
        addFuncBoard(`${zone.id}-door-shelf`, "Door Shelf", "door_shelf", ci,
          r2(centerZ - CPT / 2), r2(centerZ + CPT / 2), band.z0e, band.z1e, false, zone);
      }
    }
  });
  // 底区上方的门层板：底区自身（z0=BCH）的门板区也可能有层板（列1 情形）
  s.columns.forEach((col) => {
    col.zones.forEach((zone, index) => {
      if (zone.applianceFloorEnabled && index !== col.zones.length - 1) {
        errors.push(`Appliance floor in ${zone.id} is only allowed on the bottom zone of a column.`);
      }
    });
  });
  s.columns.forEach((col, ci) => {
    const zone = col.zones[col.zones.length - 1]; // 最底区
    if (zone?.applianceFloorEnabled) {
      const made = addWasherFloor(s, col, zone, columnV(vPanels, ci).left, columnV(vPanels, ci).right);
      errors.push(...made.errors);
      warnings.push(...made.warnings);
      boards.push(...made.boards);
      if (made.tongue) applianceTongues.push(made.tongue);
    }
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
    const band = shelfBand(col.id, zone);
    addFuncBoard(`${zone.id}-door-shelf`, "Door Shelf", "door_shelf", ci,
      r2(centerZ - CPT / 2), r2(centerZ + CPT / 2), band.z0e, band.z1e, false, zone);
  });

  /* ---- 灶台：贴踢脚时补满深底板；下面是门/抽屉/翻门时加半深隔板（抽屉槽） ---- */
  s.columns.forEach((col, ci) => {
    const zone = col.zones[0];
    if (!zone || zone.zoneType !== "stove") return;
    const below = col.zones[1];
    if (zone.z0 <= BCH + EPS) {
      const y0e = link("kitchen.stripW");
      const y1e = qRound(ex({ cd: ref("kitchen.cd"), CPT: ref("kitchen.CPT") }, (t) => t.cd - t.CPT), "cd - CPT");
      const z0e = link("kitchen.BCH");
      const z1e = qRound(ex({ BCH: ref("kitchen.BCH"), CPT: ref("kitchen.CPT") }, (t) => t.BCH + t.CPT), "BCH + CPT");
      addFuncBoard(
        `${col.id}-${zone.id}-stove-deck`, "Stove deck", "full_depth_shelf", ci,
        BCH, r2(BCH + CPT), z0e, z1e, false, zone,
        { y0: stripW, y1: r2(cd - CPT), y0e, y1e },
      );
      return;
    }
    if (!below || !PANEL_ZONE_TYPES.has(below.zoneType)) return;
    const zKey = `kitchen.zone.${col.id}.${zone.id}.z0`;
    const z0e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT - t.CPT / 2), "zoneZ0 - CPT - CPT / 2");
    const z1e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT / 2), "zoneZ0 - CPT / 2");
    addFuncBoard(
      `${col.id}-${zone.id}-stove-half`, "Stove half divider", "stove_half_divider", ci,
      r2(zone.z0 - CPT - CPT / 2), r2(zone.z0 - CPT / 2), z0e, z1e, true, zone,
    );
  });

  /* ---- 槽解析 + 功能板舌轮廓（一步生成，两套模板对应黄金点列） ---- */
  const colHasPanel = (ci: number) => s.columns[ci].zones.some((z) => PANEL_ZONE_TYPES.has(z.zoneType));
  const frontEdges = (ci: number) => {
    const col = s.columns[ci];
    const mateL = s.splitAfter != null && ci === s.splitAfter + 1;
    const mateR = s.splitAfter != null && ci === s.splitAfter;
    const x0 = ci === 0
      ? (s.leftOpts.frontVisible ? r2(leftInner + fc) : fc)
      : (mateL || colHasPanel(ci - 1) ? r2(col.x0 + fc / 2) : r2(col.x0 + CPT / 2));
    const x1 = ci === s.columns.length - 1
      ? (s.rightOpts.frontVisible ? r2(rightInner - fc) : r2(s.W - fc))
      : (mateR || colHasPanel(ci + 1) ? r2(col.x1 - fc / 2) : r2(col.x1 + CPT / 2));
    const x0e: Expr = ci === 0
      ? (s.leftOpts.frontVisible
        ? qRound(ex({ x: ref("V0.x1"), fc: ref("kitchen.fc") }, (t) => t.x + t.fc), "inner + fc")
        : link("kitchen.fc"))
      : (mateL || colHasPanel(ci - 1)
        ? qRound(ex({ x: ref(`kitchen.col.${col.id}.x0`), fc: ref("kitchen.fc") }, (t) => t.x + t.fc / 2), "colX0 + fc / 2")
        : qRound(ex({ x: ref(`kitchen.col.${col.id}.x0`), CPT: ref("kitchen.CPT") }, (t) => t.x + t.CPT / 2), "colX0 + CPT / 2"));
    const x1e: Expr = ci === s.columns.length - 1
      ? (s.rightOpts.frontVisible
        ? qRound(ex({ x: ref(`${vPanels[vPanels.length - 1].id}.x0`), fc: ref("kitchen.fc") }, (t) => t.x - t.fc), "inner - fc")
        : qRound(ex({ W: ref("kitchen.W"), fc: ref("kitchen.fc") }, (t) => t.W - t.fc), "W - fc"))
      : (mateR || colHasPanel(ci + 1)
        ? qRound(ex({ x: ref(`kitchen.col.${col.id}.x1`), fc: ref("kitchen.fc") }, (t) => t.x - t.fc / 2), "colX1 - fc / 2")
        : qRound(ex({ x: ref(`kitchen.col.${col.id}.x1`), CPT: ref("kitchen.CPT") }, (t) => t.x - t.CPT / 2), "colX1 - CPT / 2"));
    return { x0, x1, x0e, x1e };
  };
  const { slots, screws, tongueOf } = resolveSlots(s, requests, vPanels);
  for (const fb of funcBoards) {
    const t = tongueOf.get(fb.board.id) ?? { left: 0, right: 0 };
    const id = fb.board.id;
    const { clearX0: c0, clearX1: c1 } = fb;
    const x0 = r2(c0 - t.left), x1 = r2(c1 + t.right);
    const C0 = link(`kitchen.span.${id}.x0`);
    const C1 = link(`kitchen.span.${id}.x1`);
    const TY0 = link(`kitchen.ty.${id}.y0`);
    const TY1 = link(`kitchen.ty.${id}.y1`);
    const X0 = qRound(ex({ c0: ref(`kitchen.span.${id}.x0`), tongue: ref(`kitchen.tongue.${id}.left`) }, (tn) => tn.c0 - tn.tongue), "clearX0 - tongue");
    const X1 = qRound(ex({ c1: ref(`kitchen.span.${id}.x1`), tongue: ref(`kitchen.tongue.${id}.right`) }, (tn) => tn.c1 + tn.tongue), "clearX1 + tongue");
    const Y0 = fb.y0e;
    const BY1 = fb.y1e;
    let front: [Expr, Expr][] = [[C0, Y0], [C1, Y0]];
    if (fb.lip && fb.ci != null) {
      const span = frontEdges(fb.ci);
      dim(`kitchen.stove.${id}.frontX0`, span.x0e.terms, span.x0e.fn, { formula: span.x0e.formula });
      dim(`kitchen.stove.${id}.frontX1`, span.x1e.terms, span.x1e.fn, { formula: span.x1e.formula });
      dim(`kitchen.stove.${id}.lipX0`, { x: ref(`kitchen.stove.${id}.frontX0`), w: R.STOVE_SIDE_PANEL_WIDTH_MM }, (t) => Math.round((t.x + t.w) * 1000) / 1000, { formula: "frontX0 + side panel" });
      dim(`kitchen.stove.${id}.lipX1`, { x: ref(`kitchen.stove.${id}.frontX1`), w: R.STOVE_SIDE_PANEL_WIDTH_MM }, (t) => Math.round((t.x - t.w) * 1000) / 1000, { formula: "frontX1 - side panel" });
      const lx0 = link(`kitchen.stove.${id}.lipX0`);
      const lx1 = link(`kitchen.stove.${id}.lipX1`);
      const lipY = ex({ FPT: ref("kitchen.FPT") }, (t) => -t.FPT, "-FPT");
      const relief = R.STOVE_LIP_RELIEF_RADIUS_MM.value;
      const lx0n = evalExpr(lx0);
      const lx1n = evalExpr(lx1);
      // Semicircle of radius 5.5 into the shelf (+Y) at each inside corner.
      // The diameter sits on the front edge, on the shoulder side, so the lip width does not change.
      const halfCircle = (xFrom: number, xTo: number): [Expr, Expr][] => {
        const cx = (xFrom + xTo) / 2;
        const steps = 8;
        const pts: [Expr, Expr][] = [];
        for (let i = 0; i <= steps; i += 1) {
          const ang = Math.PI - (Math.PI * i) / steps;
          pts.push([lit(r2(cx + relief * Math.cos(ang))), lit(r2(relief * Math.sin(ang)))]);
        }
        return pts;
      };
      const leftArc = halfCircle(lx0n - 2 * relief, lx0n);
      const rightArc = halfCircle(lx1n, lx1n + 2 * relief);
      front = [[C0, Y0], ...leftArc, [lx0, lipY], [lx1, lipY], ...rightArc, [C1, Y0]];
      fb.board.y0 = r2(-FPT);
      plan(id, { y0: lipY });
    }
    // A door shelf beside a strengthening strip is notched round it at the front (the strip is
    // solid for y < STRENGTHENING_GROOVE_Y0). The notch is part of the cut, so it goes in the outline.
    const lastCi = s.columns.length - 1;
    const stripSide = (side: "left" | "right") => id.endsWith("-door-shelf") && !fb.lip && (side === "left"
      ? fb.ci === 0 && s.leftOpts.frontVisible && s.leftOpts.strengtheningStripEnabled
      : fb.ci === lastCi && s.rightOpts.frontVisible && s.rightOpts.strengtheningStripEnabled);
    if (stripSide("left") || stripSide("right")) {
      const ty0n = evalExpr(TY0);
      const notchY = R.STRENGTHENING_STRIP_NOTCH_Y.value;
      const NY: Expr = ty0n < notchY ? TY0 : ex({ y: R.STRENGTHENING_STRIP_NOTCH_Y }, (tn) => tn.y, "STRENGTHENING_STRIP_NOTCH_Y");
      const na = { CPT: ref("kitchen.CPT"), e: R.NOTCH_ALLOWANCE_EXTRA };
      if (stripSide("left")) {
        const NX = qRound(ex({ c0: ref(`kitchen.span.${id}.x0`), ...na }, (tn) => tn.c0 + tn.CPT + tn.e), "clearX0 + CPT + 1");
        front = [[NX, Y0], ...front.slice(1)];
        (fb as FuncBoard & { closeLeft?: [Expr, Expr][] }).closeLeft = [[C0, NY], [NX, NY], [NX, Y0]];
      }
      if (stripSide("right")) {
        const NX = qRound(ex({ c1: ref(`kitchen.span.${id}.x1`), ...na }, (tn) => tn.c1 - tn.CPT - tn.e), "clearX1 - CPT - 1");
        front = [...front.slice(0, -1), [NX, Y0], [NX, NY], [C1, NY]];
      }
    }
    const closeLeft = (fb as FuncBoard & { closeLeft?: [Expr, Expr][] }).closeLeft;
    let pairs: [Expr, Expr][];
    if (fb.isDrawer) {
      pairs = [...front, [C1, TY0], [X1, TY0], [X1, TY1], [X0, TY1], [X0, TY0], [C0, TY0], [C0, Y0]];
    } else if (t.left > 0 && t.right > 0) {
      pairs = [...front, [C1, TY0], [X1, TY0], [X1, TY1], [C1, TY1], [C1, BY1], [C0, BY1], [C0, TY1], [X0, TY1], [X0, TY0], [C0, TY0], [C0, Y0]];
    } else if (t.right > 0) {
      pairs = [...front, [C1, TY0], [X1, TY0], [X1, TY1], [C1, TY1], [C1, BY1], [C0, BY1], [C0, Y0]];
    } else if (t.left > 0) {
      pairs = [...front, [C1, BY1], [C0, BY1], [C0, TY1], [X0, TY1], [X0, TY0], [C0, TY0], [C0, Y0]];
    } else {
      pairs = [...front, [C1, BY1], [C0, BY1], [C0, Y0]];
    }
    if (closeLeft) pairs = [...pairs.slice(0, -1), ...closeLeft];
    const rows = pairs.map(([a, b]) => ({ x: evalExpr(a), y: evalExpr(b), e: [a, b] as [Expr, Expr] }));
    const samePt = (p: { x: number; y: number }, q: { x: number; y: number }) => Math.abs(p.x - q.x) < EPS && Math.abs(p.y - q.y) < EPS;
    const ring = rows.filter((p, i) => i === 0 || !samePt(p, rows[i - 1]));
    if (ring.length > 1 && samePt(ring[0], ring[ring.length - 1])) ring.pop();
    const kept = ring.filter((p, i) => {
      const a = ring[(i - 1 + ring.length) % ring.length];
      const c = ring[(i + 1) % ring.length];
      return Math.abs((p.x - a.x) * (c.y - a.y) - (p.y - a.y) * (c.x - a.x)) > EPS;
    });
    const finalRows = kept.length >= 3 ? [...kept, kept[0]] : rows;
    plan(id, { x0: X0, x1: X1 });
    fb.board.x0 = x0; fb.board.x1 = x1;
    fb.board.profileVector = loopPts(id, ["x", "y"], finalRows.map((p) => p.e)) as Board["profileVector"];
  }

  /* ---- T 系统 + B4（V 缺口折轮廓；灶台列切 T1、轮拱切 B4） ---- */
  const zTop0 = H - CPT;
  const rN = R.RECEIVER_NOTCH_DEPTH.value;
  const stoveCuts = s.columns
    .map((c, i) => {
      if (!c.zones.some((z) => z.zoneType === "stove")) return null;
      const { left: leftV, right: rightV } = columnV(vPanels, i);
      return {
        x0: leftV?.x1 ?? c.x0,
        x1: rightV?.x0 ?? c.x1,
        y0: 0,
        y1: FPT + R.STOVE_CUT_FRONT_EXTRA.value,
      };
    })
    .filter((x): x is { x0: number; x1: number; y0: number; y1: number } => x != null);
  const notchIn = (n: [number, number], x0: number, x1: number): [number, number] | null => {
    const a = Math.max(n[0], x0), b = Math.min(n[1], x1);
    return b - a > EPS ? [a, b] : null;
  };

  const stoveXCutsForY = (y0: number, y1: number): [number, number][] =>
    stoveCuts.filter((c) => !(y1 <= c.y0 || y0 >= c.y1)).map((c) => [c.x0, c.x1] as [number, number]);

  dim("kitchen.t3y0", { cd: ref("kitchen.cd"), CPT: ref("kitchen.CPT") }, (t) => Math.round((t.cd - t.CPT) * 1000) / 1000, { formula: "cd - CPT" });
  dim("kitchen.t2y0", { y1: ref("kitchen.t3y0"), w: ref("kitchen.stripW") }, (t) => Math.round((t.y1 - t.w) * 1000) / 1000, { formula: "T3 front - stripW" });
  dim("kitchen.topZ0", { H: ref("kitchen.H"), CPT: ref("kitchen.CPT") }, (t) => Math.round((t.H - t.CPT) * 1000) / 1000, { formula: "H - CPT" });
  dim("kitchen.t3z0", { H: ref("kitchen.H"), w: ref("kitchen.stripW") }, (t) => Math.round((t.H - t.w) * 1000) / 1000, { formula: "H - stripW" });

  // T1 顶前条：y∈[0,100] z∈[H−CPT,H]；V 缺口从后缘 y=100 凹进 20；灶台列按 y 相交切段
  {
    const segs = segmentBy(frontStop.x0, frontStop.x1, stoveXCutsForY(0, stripW));
    segs.forEach(([a, b], i) => {
      const id = `T1-${i + 1}`;
      const x0e = knownX(a, id, "x0");
      const x1e = knownX(b, id, "x1");
      plan(id, {
        x0: x0e, x1: x1e, y0: lit(0), y1: link("kitchen.stripW"),
        z0: link("kitchen.topZ0"), z1: link("kitchen.H"),
      });
      boards.push(mkBoard(id, "Top Front Rail", "top", "top_front_rail", CPT, "carcass",
        "XY", "Z", a, b, 0, stripW, zTop0, H,
        xyNotch(id, x0e, x1e, lit(0), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "far")));
    });
  }
  // T2 顶后条：深 100，后边贴在 T3 前脸（cd−CPT），不伸进 T3。
  {
    const y1 = r2(cd - CPT);
    const y0 = r2(y1 - stripW);
    const segs = segmentBy(rearStop.x0, rearStop.x1, stoveXCutsForY(y0, y1));
    segs.forEach(([a, b], i) => {
      const id = `T2-${i + 1}`;
      const x0e = knownX(a, id, "x0");
      const x1e = knownX(b, id, "x1");
      plan(id, {
        x0: x0e, x1: x1e, y0: link("kitchen.t2y0"), y1: link("kitchen.t3y0"),
        z0: link("kitchen.topZ0"), z1: link("kitchen.H"),
      });
      boards.push(mkBoard(id, "Top Rear Rail", "top", "top_rear_rail", CPT, "carcass",
        "XY", "Z", a, b, y0, y1, zTop0, H,
        xyNotch(id, x0e, x1e, link("kitchen.t2y0"), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "near")));
    });
  }
  // T3 顶后竖条：y∈[cd−CPT, cd] z∈[H−100, H]
  {
    const y0 = r2(cd - CPT), z0 = r2(H - stripW);
    const segs = segmentBy(rearStop.x0, rearStop.x1, stoveXCutsForY(y0, cd));
    segs.forEach(([a, b], i) => {
      const id = `T3-${i + 1}`;
      const x0e = knownX(a, id, "x0");
      const x1e = knownX(b, id, "x1");
      plan(id, {
        x0: x0e, x1: x1e, y0: link("kitchen.t3y0"), y1: link("kitchen.cd"),
        z0: link("kitchen.t3z0"), z1: link("kitchen.H"),
      });
      boards.push(mkBoard(id, "Top Rear Vertical", "top", "top_rear_vertical", CPT, "carcass",
        "XZ", "Y", a, b, y0, cd, z0, H,
        xzNotch(id, x0e, x1e, link("kitchen.t3z0"), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "near")));
    });
  }
  // B4 后下竖条：y∈[cd−CPT, cd] z∈[0,100]；V 缺口从顶缘 z=100 凹进 20；轮拱 x 段切分
  {
    const y0 = r2(cd - CPT);
    const avCuts = arches.filter((a) => a.x1 > a.x0 && a.height > 0).map((a) => [a.x0, a.x1] as [number, number]);
    const segs = segmentBy(rearStop.x0, rearStop.x1, avCuts);
    segs.forEach(([a, b], i) => {
      const id = `B4-${i + 1}`;
      const x0e = knownX(a, id, "x0");
      const x1e = knownX(b, id, "x1");
      plan(id, {
        x0: x0e, x1: x1e, y0: link("kitchen.t3y0"), y1: link("kitchen.cd"),
        z0: lit(0), z1: link("kitchen.stripW"),
      });
      boards.push(mkBoard(id, "Bottom Rear Vertical", "bottom", "bottom_rear_vertical", CPT, "carcass",
        "XZ", "Y", a, b, y0, cd, 0, stripW,
        xzNotch(id, x0e, x1e, lit(0), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "far")));
    });
  }

  /* ---- 轮拱封板 ---- */
  for (const a of arches) {
    if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) continue;
    const ad = a.depth, ah = a.height;
    const idTop = `${a.id}-avoidance-top`;
    dim(`${a.id}.x0`, { x0: param({ x0: a.x0 }).x0 }, (t) => t.x0, { formula: "avoidX0" });
    dim(`${a.id}.x1`, { x1: param({ x1: a.x1 }).x1 }, (t) => t.x1, { formula: "avoidX1" });
    dim(`${a.id}.h`, { h: param({ height: a.height }).height }, (t) => t.h, { formula: "avoidH" });
    dim(`${a.id}.d`, { d: param({ depth: a.depth }).depth }, (t) => t.d, { formula: "avoidD" });
    const y0e = qRound(ex({ cd: ref("kitchen.cd"), d: ref(`${a.id}.d`) }, (t) => t.cd - t.d), "cd - avoidD");
    const z0e = qRound(ex({ h: ref(`${a.id}.h`), CPT: ref("kitchen.CPT") }, (t) => t.h - t.CPT), "avoidH - CPT");
    plan(idTop, {
      x0: link(`${a.id}.x0`), x1: link(`${a.id}.x1`), y0: y0e, y1: link("kitchen.cd"),
      z0: z0e, z1: link(`${a.id}.h`),
    });
    boards.push(mkBoard(idTop, "Avoidance Top", "avoidance", "avoidance_top", CPT, "carcass",
      "XY", "Z", a.x0, a.x1, r2(cd - ad), cd, r2(ah - CPT), ah,
      xyNotch(idTop, link(`${a.id}.x0`), link(`${a.id}.x1`), y0e, link(`${a.id}.d`), [], link("kitchen.notchD"), "far")));
    if (ah + R.RAISED_B4_HEIGHT.value <= H) {
      const id = `${a.id}-B4`;
      const z1e = qRound(ex({ h: ref(`${a.id}.h`), rise: R.RAISED_B4_HEIGHT }, (t) => t.h + t.rise), "avoidH + RAISED_B4_HEIGHT");
      plan(id, {
        x0: link(`${a.id}.x0`), x1: link(`${a.id}.x1`),
        y0: link("kitchen.t3y0"), y1: link("kitchen.cd"),
        z0: link(`${a.id}.h`), z1: z1e,
      });
      boards.push(mkBoard(id, "Raised Rear Vertical", "avoidance", "raised_b4", CPT, "carcass",
        "XZ", "Y", a.x0, a.x1, r2(cd - CPT), cd, ah, r2(ah + R.RAISED_B4_HEIGHT.value),
        // Same V notches as B4 (NOTCH_DEPTH down from the top edge): a V panel inside the arch span
        // has its receiver notch for this strip, and a plain rectangle ran 15 mm into it.
        xzNotch(id, link(`${a.id}.x0`), link(`${a.id}.x1`), link(`${a.id}.h`),
          ex({ rise: R.RAISED_B4_HEIGHT }, (t) => t.rise, "RAISED_B4_HEIGHT"),
          notchesOn(a.x0, a.x1), link("kitchen.notchD"), "far")));
    } else {
      warnings.push(`Wheel avoidance ${a.id}: raised B4 exceeds height; skipped.`);
    }
    if (ah > CPT) {
      const id = `${a.id}-avoidance-front`;
      const y1e = qRound(ex({ cd: ref("kitchen.cd"), d: ref(`${a.id}.d`), CPT: ref("kitchen.CPT") }, (t) => t.cd - t.d + t.CPT), "cd - avoidD + CPT");
      const hE = qRound(ex({ h: ref(`${a.id}.h`), CPT: ref("kitchen.CPT") }, (t) => t.h - t.CPT), "avoidH - CPT");
      plan(id, {
        x0: link(`${a.id}.x0`), x1: link(`${a.id}.x1`), y0: y0e, y1: y1e,
        z0: lit(0), z1: hE,
      });
      boards.push(mkBoard(id, "Avoidance Front", "avoidance", "avoidance_front", CPT, "carcass",
        "XZ", "Y", a.x0, a.x1, r2(cd - ad), r2(cd - ad + CPT), 0, r2(ah - CPT),
        traceLocalRect(id, ["x", "z"], localW(id), hE)));
    } else {
      warnings.push(`Wheel avoidance ${a.id}: front cover height ≤ CPT; skipped.`);
    }
  }

  /* ---- 功能板轮拱缩短（§4.2） ---- */
  for (const fb of funcBoards) {
    for (const a of arches) {
      if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) continue;
      if (!(fb.board.x0 < a.x1 && fb.board.x1 > a.x0)) continue;
      const ad = a.depth, ah = a.height;
      let y1 = fb.board.y1;
      if (fb.z0 < ah) y1 = Math.max(fb.board.y0, r2(cd - ad - CPT)); // 与 [0,ah] 相交
      else if (fb.z0 < ah + R.RAISED_B4_HEIGHT.value) y1 = Math.min(y1, r2(cd - CPT)); // 与 [ah,ah+100] 相交
      if (y1 < fb.board.y1) {
        fb.board.y1 = y1;
        plan(fb.board.id, {
          y1: fb.z0 < ah
            ? qRound(ex({ cd: ref("kitchen.cd"), d: ref(`${a.id}.d`), CPT: ref("kitchen.CPT") }, (t) => t.cd - t.d - t.CPT), "cd - avoidD - CPT")
            : link("kitchen.t3y0"),
        });
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
  dim("kitchen.deckTop", { BCH: ref("kitchen.BCH"), CPT: ref("kitchen.CPT") }, (t) => Math.round((t.BCH + t.CPT) * 1000) / 1000, { formula: "BCH + CPT" });
  for (const st of strips) {
    const id = `${st.side}-side-strengthening-strip-${st.zoneId}`;
    const colId = st.side === "left" ? s.columns[0].id : s.columns[s.columns.length - 1].id;
    const endId = st.side === "left" ? "V0" : vPanels[vPanels.length - 1].id;
    plan(id, {
      x0: st.side === "left"
        ? link("V0.x1")
        : qRound(ex({ x: ref(`${endId}.x0`), CPT: ref("kitchen.CPT") }, (t) => t.x - t.CPT), "inner - CPT"),
      x1: st.side === "left"
        ? qRound(ex({ x: ref("V0.x1"), CPT: ref("kitchen.CPT") }, (t) => t.x + t.CPT), "inner + CPT")
        : link(`${endId}.x0`),
      y0: lit(0),
      y1: link("kitchen.stripW"),
      z0: qRound(ex({ z: ref(`kitchen.zone.${colId}.${st.zoneId}.z0`), deck: ref("kitchen.deckTop") }, (t) => Math.max(t.z, t.deck)), "max(zoneZ0, BCH + CPT)"),
      z1: qRound(ex({ z: ref(`kitchen.zone.${colId}.${st.zoneId}.z1`), cap: ref("kitchen.topZ0") }, (t) => Math.min(t.z, t.cap)), "min(zoneZ1, H - CPT)"),
    });
    const covered = funcBoards.filter((fb) => fb.board.id.endsWith("-door-shelf") && fb.z0 >= st.z0 - EPS && fb.z1 <= st.z1 + EPS);
    let prof: P2[];
    if (covered.length) {
      const lo = covered.reduce((a, b) => (a.z0 < b.z0 ? a : b));
      const hi = covered.reduce((a, b) => (a.z1 > b.z1 ? a : b));
      dim(`${id}.gz0`, { z: ref(`${lo.board.id}.z0`), c: R.STRENGTHENING_GROOVE_CLEARANCE }, (t) => Math.round((t.z - t.c) * 1000) / 1000, { formula: "shelfZ0 - clearance" });
      dim(`${id}.gz1`, { z: ref(`${hi.board.id}.z1`), c: R.STRENGTHENING_GROOVE_CLEARANCE }, (t) => Math.round((t.z + t.c) * 1000) / 1000, { formula: "shelfZ1 + clearance" });
      const grooveY = ex({ y: R.STRENGTHENING_GROOVE_Y0 }, (t) => t.y, "STRENGTHENING_GROOVE_Y0");
      const sw = link("kitchen.stripW");
      const z0e = link(`${id}.z0`);
      const z1e = link(`${id}.z1`);
      const gz0 = link(`${id}.gz0`);
      const gz1 = link(`${id}.gz1`);
      prof = loopPts(id, ["y", "z"], [
        [lit(0), z0e], [sw, z0e], [sw, gz0], [grooveY, gz0], [grooveY, gz1], [sw, gz1], [sw, z1e], [lit(0), z1e], [lit(0), z0e],
      ], true);
    } else {
      prof = traceLocalRect(id, ["y", "z"], link("kitchen.stripW"), qRound(ex({ z1: ref(`${id}.z1`), z0: ref(`${id}.z0`) }, (t) => t.z1 - t.z0), "z1 - z0"));
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
  const emitDoorPanel = (
    id: string, zone: ZonePlan, x0: number, x1: number, z0: number, z1: number,
    kind: "left_door" | "right_door" | "double_door" | "drawer" | "down_flap", leaf?: "left" | "right",
    stoveAbove = false,
  ) => {
    const w = r2(x1 - x0), h = r2(z1 - z0);
    if (w <= 0 || h <= 0) {
      warnings.push(`Front panel ${id}: non-positive leaf size; skipped.`);
      return;
    }
    boards.push(mkBoard(id, "Front Panel", "front_panel", "front_panel", FPT, "door",
      "XZ", "Y", x0, x1, -FPT, 0, z0, z1, traceLocalRect(id, ["x", "z"],
        qRound(ex({ x1: ref(`${id}.x1`), x0: ref(`${id}.x0`) }, (t) => t.x1 - t.x0), "x1 - x0"),
        qRound(ex({ z1: ref(`${id}.z1`), z0: ref(`${id}.z0`) }, (t) => t.z1 - t.z0), "z1 - z0"))));
    const hs = zone.hingeSettings;
    if (kind !== "drawer") {
      const L = kind === "down_flap" ? w : h;
      let sd = R.HINGE_SD_MIN.value + (L - R.HINGE_SD_SPAN.value) * R.SD_GAIN_NUM.value / R.SD_GAIN_DEN.value;
      sd = Math.min(R.HINGE_SD_MAX.value, Math.max(R.HINGE_SD_MIN.value, sd));
      dim(`kitchen.hinge.${id}.sd`, {
        min: R.HINGE_SD_MIN, max: R.HINGE_SD_MAX, span: R.HINGE_SD_SPAN,
        num: R.SD_GAIN_NUM, den: R.SD_GAIN_DEN, L,
      }, (t) => Math.min(t.max, Math.max(t.min, t.min + (t.L - t.span) * t.num / t.den)), { formula: "clamp(min, max, min + (L - span) * num / den)" });
      const fromEdge = hs.cupCenterFromEdge;
      const edgeTerm = Math.abs(fromEdge - R.HINGE_CUP_FROM_EDGE.value) < 1e-9
        ? R.HINGE_CUP_FROM_EDGE
        : param({ cupCenterFromEdge: fromEdge }).cupCenterFromEdge;
      let centers: { x: number; z: number; xe: Expr; ze: Expr }[];
      if (kind === "down_flap") {
        const ze = qRound(ex({ z0: ref(`${id}.z0`), edge: edgeTerm }, (t) => t.z0 + t.edge), "z0 + cupFromEdge");
        centers = [
          { x: r2(x0 + sd), z: r2(z0 + fromEdge), xe: qRound(ex({ x0: ref(`${id}.x0`), sd: ref(`kitchen.hinge.${id}.sd`) }, (t) => t.x0 + t.sd), "x0 + sd"), ze },
          { x: r2(x1 - sd), z: r2(z0 + fromEdge), xe: qRound(ex({ x1: ref(`${id}.x1`), sd: ref(`kitchen.hinge.${id}.sd`) }, (t) => t.x1 - t.sd), "x1 - sd"), ze },
        ];
      } else {
        const hingeLeft = kind === "left_door" || (kind === "double_door" && leaf === "left");
        const cx = hingeLeft ? r2(x0 + fromEdge) : r2(x1 - fromEdge);
        const xe = hingeLeft
          ? qRound(ex({ x0: ref(`${id}.x0`), edge: edgeTerm }, (t) => t.x0 + t.edge), "x0 + cupFromEdge")
          : qRound(ex({ x1: ref(`${id}.x1`), edge: edgeTerm }, (t) => t.x1 - t.edge), "x1 - cupFromEdge");
        const sinkDoor = (kind === "left_door" || kind === "right_door") && zone.withSink;
        const askedDrop = sinkDoor ? R.SINK_HINGE_DROP_MM.value : 0;
        const room = (z1 - sd) - (z0 + sd) - hs.cupDiameter;
        const drop = askedDrop > 0 ? Math.min(askedDrop, Math.max(0, r2(room))) : 0;
        if (sinkDoor && drop < askedDrop) {
          warnings.push(`With sink: ${id} can only drop the upper hinge ${drop} mm — ${askedDrop} mm would meet the lower hinge.`);
        }
        const zeTop = drop > 0
          ? qRound(ex(
            { z1: ref(`${id}.z1`), sd: ref(`kitchen.hinge.${id}.sd`), drop: R.SINK_HINGE_DROP_MM },
            (t) => t.z1 - t.sd - Math.min(t.drop, drop),
          ), "z1 - sd - sinkDrop")
          : qRound(ex({ z1: ref(`${id}.z1`), sd: ref(`kitchen.hinge.${id}.sd`) }, (t) => t.z1 - t.sd), "z1 - sd");
        centers = [
          { x: cx, z: r2(z1 - sd - drop), xe, ze: zeTop },
          { x: cx, z: r2(z0 + sd), xe, ze: qRound(ex({ z0: ref(`${id}.z0`), sd: ref(`kitchen.hinge.${id}.sd`) }, (t) => t.z0 + t.sd), "z0 + sd") },
        ];
        if (hs.useThreeHinges) centers.push({ x: cx, z: r2((z0 + z1) / 2), xe, ze: qRound(ex({ z0: ref(`${id}.z0`), z1: ref(`${id}.z1`) }, (t) => (t.z0 + t.z1) / 2), "(z0 + z1) / 2") });
      }
      centers.forEach((c, i) => {
        const hid = `${id}-hinge-${i + 1}`;
        dim(`kitchen.hinge.${hid}.x`, c.xe.terms, c.xe.fn, { formula: c.xe.formula });
        dim(`kitchen.hinge.${hid}.z`, c.ze.terms, c.ze.fn, { formula: c.ze.formula });
        hinges.push({ id: hid, panelId: id, centerX: c.x, centerZ: c.z, diameter: hs.cupDiameter, depth: hs.cupDepth });
      });
    }
    if (s.lockOn && zone.lockEnabled) {
      let cx: number;
      if (kind === "left_door") cx = r2(x1 - zone.lockSideCenterOffset);
      else if (kind === "right_door") cx = r2(x0 + zone.lockSideCenterOffset);
      else cx = r2((x0 + x1) / 2);
      const dividerCenter = stoveAbove ? r2(zone.z1 - CPT) : (zone.z1 >= H - EPS ? r2(H - CPT / 2) : zone.z1);
      const cz = r2(dividerCenter - CPT / 2 - R.LOCK_DROP.value);
      const lockId = `${id}-lock`;
      const off = Math.abs(zone.lockSideCenterOffset - R.LOCK_SIDE_OFFSET.value) < 1e-9
        ? R.LOCK_SIDE_OFFSET
        : param({ lockSideCenterOffset: zone.lockSideCenterOffset }).lockSideCenterOffset;
      if (kind === "left_door") dim(`kitchen.lock.${lockId}.x`, { x1: ref(`${id}.x1`), off }, (t) => Math.round((t.x1 - t.off) * 1000) / 1000, { formula: "x1 - lockSideOffset" });
      else if (kind === "right_door") dim(`kitchen.lock.${lockId}.x`, { x0: ref(`${id}.x0`), off }, (t) => Math.round((t.x0 + t.off) * 1000) / 1000, { formula: "x0 + lockSideOffset" });
      else dim(`kitchen.lock.${lockId}.x`, { x0: ref(`${id}.x0`), x1: ref(`${id}.x1`) }, (t) => Math.round(((t.x0 + t.x1) / 2) * 1000) / 1000, { formula: "(x0 + x1) / 2" });
      dim(`kitchen.lock.${lockId}.z`, {
        divider: dividerCenter, CPT: ref("kitchen.CPT"), drop: R.LOCK_DROP,
      }, (t) => Math.round((t.divider - t.CPT / 2 - t.drop) * 1000) / 1000, { formula: stoveAbove ? "stoveHalfCenter - CPT / 2 - LOCK_DROP" : "dividerCenter - CPT / 2 - LOCK_DROP" });
      locks.push({
        id: `${id}-lock`, panelId: id, centerX: cx, centerZ: cz,
        width: R.LOCK_WIDTH.value, height: R.LOCK_HEIGHT.value, radius: r2(R.LOCK_HEIGHT.value / 2),
      });
    }
  };

  s.columns.forEach((col, ci) => {
    for (const zone of col.zones) {
      if (!PANEL_ZONE_TYPES.has(zone.zoneType)) continue;
      const { x0, x1, x0e, x1e } = frontEdges(ci);
      // z 定位：z1 顶区 → H−fc；上邻灶台 → 半深隔板中心 − fc；上邻门板 → −fc/2；否则盖分隔板 +CPT/2
      const zoneAbove = col.zones.find((z) => Math.abs(z.z0 - zone.z1) < EPS);
      const stoveAbove = zoneAbove?.zoneType === "stove";
      let z1: number;
      if (zone.z1 >= H - EPS) z1 = r2(H - fc);
      else if (stoveAbove) z1 = r2(zone.z1 - CPT - fc);
      else if (zoneAbove && PANEL_ZONE_TYPES.has(zoneAbove.zoneType)) z1 = r2(zone.z1 - fc / 2);
      else z1 = r2(zone.z1 + CPT / 2);
      const zoneBelow = col.zones.find((z) => Math.abs(z.z1 - zone.z0) < EPS);
      let z0: number;
      if (zone.z0 <= BCH + EPS) z0 = s.style2 ? r2(BCH + fc) : BCH;
      else if (zoneBelow && PANEL_ZONE_TYPES.has(zoneBelow.zoneType)) z0 = r2(zone.z0 + fc / 2);
      else z0 = r2(zone.z0 - CPT / 2);

      const zKey1 = `kitchen.zone.${col.id}.${zone.id}.z1`;
      const zKey0 = `kitchen.zone.${col.id}.${zone.id}.z0`;
      const z1e: Expr = zone.z1 >= H - EPS
        ? qRound(ex({ H: ref("kitchen.H"), fc: ref("kitchen.fc") }, (t) => t.H - t.fc), "H - fc")
        : stoveAbove
          ? qRound(ex({ z: ref(zKey1), CPT: ref("kitchen.CPT"), fc: ref("kitchen.fc") }, (t) => t.z - t.CPT - t.fc), "zoneZ1 - CPT - fc")
          : (zoneAbove && PANEL_ZONE_TYPES.has(zoneAbove.zoneType)
            ? qRound(ex({ z: ref(zKey1), fc: ref("kitchen.fc") }, (t) => t.z - t.fc / 2), "zoneZ1 - fc / 2")
            : qRound(ex({ z: ref(zKey1), CPT: ref("kitchen.CPT") }, (t) => t.z + t.CPT / 2), "zoneZ1 + CPT / 2"));
      const z0e: Expr = zone.z0 <= BCH + EPS
        ? (s.style2
          ? qRound(ex({ BCH: ref("kitchen.BCH"), fc: ref("kitchen.fc") }, (t) => t.BCH + t.fc), "BCH + fc")
          : link("kitchen.BCH"))
        : (zoneBelow && PANEL_ZONE_TYPES.has(zoneBelow.zoneType)
          ? qRound(ex({ z: ref(zKey0), fc: ref("kitchen.fc") }, (t) => t.z + t.fc / 2), "zoneZ0 + fc / 2")
          : qRound(ex({ z: ref(zKey0), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT / 2), "zoneZ0 - CPT / 2"));
      const y0e = ex({ FPT: ref("kitchen.FPT") }, (t) => -t.FPT, "-FPT");
      const placeLeaf = (leafId: string, lx0: Expr, lx1: Expr) => {
        plan(leafId, { x0: lx0, x1: lx1, y0: y0e, y1: lit(0), z0: z0e, z1: z1e });
      };

      const id = `${zone.id}-front-panel`;
      if (zone.zoneType === "double_door") {
        const mid = r2((x0 + x1) / 2);
        dim(`kitchen.leaf.${id}.x0`, x0e.terms, x0e.fn, { formula: x0e.formula });
        dim(`kitchen.leaf.${id}.x1`, x1e.terms, x1e.fn, { formula: x1e.formula });
        dim(`kitchen.leaf.${id}.mid`, { x0: ref(`kitchen.leaf.${id}.x0`), x1: ref(`kitchen.leaf.${id}.x1`) }, (t) => Math.round(((t.x0 + t.x1) / 2) * 1000) / 1000, { formula: "(x0 + x1) / 2" });
        const leftX1 = qRound(ex({ mid: ref(`kitchen.leaf.${id}.mid`), fc: ref("kitchen.fc") }, (t) => t.mid - t.fc / 2), "mid - fc / 2");
        const rightX0 = qRound(ex({ mid: ref(`kitchen.leaf.${id}.mid`), fc: ref("kitchen.fc") }, (t) => t.mid + t.fc / 2), "mid + fc / 2");
        placeLeaf(`${id}-left`, x0e, leftX1);
        placeLeaf(`${id}-right`, rightX0, x1e);
        emitDoorPanel(`${id}-left`, zone, x0, r2(mid - fc / 2), z0, z1, "double_door", "left", stoveAbove);
        emitDoorPanel(`${id}-right`, zone, r2(mid + fc / 2), x1, z0, z1, "double_door", "right", stoveAbove);
      } else {
        placeLeaf(id, x0e, x1e);
        emitDoorPanel(id, zone, x0, x1, z0, z1, zone.zoneType as "left_door" | "right_door" | "drawer" | "down_flap", undefined, stoveAbove);
      }
    }
  });

  /* ---- 灶台前脸：左右各一块门料侧板，朝开口的上角缺 20 × 30 ---- */
  const sideW = R.STOVE_SIDE_PANEL_WIDTH_MM.value;
  const notchZ = R.STOVE_SIDE_NOTCH_Z_MM.value;
  s.columns.forEach((col, ci) => {
    const zone = col.zones[0];
    const below = col.zones[1];
    if (!zone || zone.zoneType !== "stove" || !below || !PANEL_ZONE_TYPES.has(below.zoneType)) return;
    const { x0, x1, x0e, x1e } = frontEdges(ci);
    const span = r2(x1 - x0);
    if (span < sideW * 2) {
      warnings.push(`Stove side panels skipped in ${zone.id}: front width ${span} is under ${sideW * 2}.`);
      return;
    }
    const splitZ = r2(zone.z0 - CPT);
    const topZ = r2(H - fc);
    if (topZ - splitZ <= notchZ) {
      warnings.push(`Stove side panels skipped in ${zone.id}: height ${r2(topZ - splitZ)} is too short for the ${notchZ} mm top notch.`);
      return;
    }
    const zKey = `kitchen.zone.${col.id}.${zone.id}.z0`;
    const z0e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT), "zoneZ0 - CPT");
    const z1e = qRound(ex({ H: ref("kitchen.H"), fc: ref("kitchen.fc") }, (t) => t.H - t.fc), "H - fc");
    const y0e = ex({ FPT: ref("kitchen.FPT") }, (t) => -t.FPT, "-FPT");
    const leftX1 = r2(x0 + sideW);
    const rightX0 = r2(x1 - sideW);
    const leftId = `${col.id}-${zone.id}-stove-side-left`;
    const rightId = `${col.id}-${zone.id}-stove-side-right`;
    plan(leftId, { x0: x0e, y0: y0e, y1: lit(0), z0: z0e, z1: z1e });
    plan(rightId, { x1: x1e, y0: y0e, y1: lit(0), z0: z0e, z1: z1e });
    dim(`kitchen.stove.${leftId}.x1`, { x0: ref(`${leftId}.x0`), w: R.STOVE_SIDE_PANEL_WIDTH_MM }, (t) => Math.round((t.x0 + t.w) * 1000) / 1000, { formula: "frontX0 + sideWidth" });
    dim(`kitchen.stove.${rightId}.x0`, { x1: ref(`${rightId}.x1`), w: R.STOVE_SIDE_PANEL_WIDTH_MM }, (t) => Math.round((t.x1 - t.w) * 1000) / 1000, { formula: "frontX1 - sideWidth" });
    const leftX1e = link(`kitchen.stove.${leftId}.x1`);
    const rightX0e = link(`kitchen.stove.${rightId}.x0`);
    plan(leftId, { x1: leftX1e });
    plan(rightId, { x0: rightX0e });
    dim(`kitchen.stove.${leftId}.notchX`, { x: ref(`kitchen.stove.${leftId}.x1`), n: R.STOVE_SIDE_NOTCH_X_MM }, (t) => Math.round((t.x - t.n) * 1000) / 1000, { formula: "inner - notch" });
    dim(`kitchen.stove.${rightId}.notchX`, { x: ref(`kitchen.stove.${rightId}.x0`), n: R.STOVE_SIDE_NOTCH_X_MM }, (t) => Math.round((t.x + t.n) * 1000) / 1000, { formula: "inner + notch" });
    dim(`kitchen.stove.${leftId}.notchZ`, { z: ref(`${leftId}.z1`), n: R.STOVE_SIDE_NOTCH_Z_MM }, (t) => Math.round((t.z - t.n) * 1000) / 1000, { formula: "top - notch" });
    const leftNotchX = link(`kitchen.stove.${leftId}.notchX`);
    const rightNotchX = link(`kitchen.stove.${rightId}.notchX`);
    const notchZe = link(`kitchen.stove.${leftId}.notchZ`);
    boards.push(mkBoard(leftId, "Stove left side panel", "front_panel", "stove_side_panel", FPT, "door",
      "XZ", "Y", x0, leftX1, -FPT, 0, splitZ, topZ,
      loopPts(leftId, ["x", "z"], [
        [x0e, z0e], [leftX1e, z0e], [leftX1e, notchZe], [leftNotchX, notchZe], [leftNotchX, z1e], [x0e, z1e], [x0e, z0e],
      ])));
    boards.push(mkBoard(rightId, "Stove right side panel", "front_panel", "stove_side_panel", FPT, "door",
      "XZ", "Y", rightX0, x1, -FPT, 0, splitZ, topZ,
      loopPts(rightId, ["x", "z"], [
        [rightX0e, z0e], [x1e, z0e], [x1e, z1e], [rightNotchX, z1e], [rightNotchX, notchZe], [rightX0e, notchZe], [rightX0e, z0e],
      ])));
  });

  /* ---- Bench top. A waterfall is a second board, mitred 45° to this one. ---- */
  const benchColour = String(input.benchTopColorName || input.benchTopColor || "").trim();
  if (s.waterfall && !benchColour) warnings.push("Waterfall needs a bench top colour.");
  if (benchColour) {
    const y0e = ex(
      { FPT: ref("kitchen.FPT"), over: R.BENCH_FRONT_OVERHANG_MM },
      (t) => -(t.FPT + t.over),
      "-(FPT + overhang)",
    );
    const z1e = ex(
      { H: ref("kitchen.H"), t: R.BENCH_THICKNESS_MM },
      (t) => t.H + t.t,
      "H + thickness",
    );
    const thick = R.BENCH_THICKNESS_MM.value;
    const over = R.BENCH_FRONT_OVERHANG_MM.value;
    const y0 = r2(-FPT - over);
    const y1 = cd;
    const z1 = r2(H + thick);
    const fall = s.waterfall;
    const xOuter0 = 0;
    const xOuter1 = fall === "right" ? r2(s.W + thick) : s.W;
    if (!fall) {
      plan("BENCH", {
        x0: lit(0), x1: link("kitchen.W"),
        y0: y0e, y1: link("kitchen.cd"),
        z0: link("kitchen.H"), z1: z1e,
      });
      const depth = ex({ y1: ref("BENCH.y1"), y0: ref("BENCH.y0") }, (t) => t.y1 - t.y0, "y1 - y0");
      const bench = mkBoard("BENCH", "Bench top", "top", "bench_top", thick, "bench",
        "XY", "Z", 0, s.W, y0, y1, H, z1,
        traceLocalRect("BENCH", ["x", "y"], localW("BENCH"), depth));
      bench.stock = { kind: "bench", thickness: thick, sides: 1, colour: benchColour };
      boards.push(bench);
    } else {
      // 45° miter: the top face runs to the outer corner, the underside stops one thickness in.
      plan("BENCH", {
        x0: lit(xOuter0), x1: lit(xOuter1),
        y0: y0e, y1: link("kitchen.cd"),
        z0: link("kitchen.H"), z1: z1e,
      });
      const benchOutline = fall === "right"
        ? loopPts("BENCH", ["x", "z"], [
          [lit(0), link("kitchen.H")],
          [link("kitchen.W"), link("kitchen.H")],
          [lit(xOuter1), z1e],
          [lit(0), z1e],
          [lit(0), link("kitchen.H")],
        ])
        : loopPts("BENCH", ["x", "z"], [
          [lit(0), z1e],
          [lit(thick), link("kitchen.H")],
          [link("kitchen.W"), link("kitchen.H")],
          [link("kitchen.W"), z1e],
          [lit(0), z1e],
        ]);
      const bench = mkBoard("BENCH", "Bench top", "top", "bench_top", thick, "bench",
        "XZ", "Y", 0, xOuter1, y0, y1, H, z1, benchOutline);
      bench.stock = { kind: "bench", thickness: thick, sides: 1, colour: benchColour };
      boards.push(bench);
      const dropX0 = fall === "right" ? s.W : 0;
      const dropX1 = fall === "right" ? xOuter1 : thick;
      plan("WATERFALL", {
        x0: lit(dropX0), x1: lit(dropX1),
        y0: y0e, y1: link("kitchen.cd"),
        z0: lit(0), z1: z1e,
      });
      const dropOutline = fall === "right"
        ? loopPts("WATERFALL", ["x", "z"], [
          [lit(dropX0), lit(0)],
          [lit(dropX1), lit(0)],
          [lit(dropX1), z1e],
          [lit(dropX0), link("kitchen.H")],
          [lit(dropX0), lit(0)],
        ])
        : loopPts("WATERFALL", ["x", "z"], [
          [lit(0), lit(0)],
          [lit(thick), lit(0)],
          [lit(thick), link("kitchen.H")],
          [lit(0), z1e],
          [lit(0), lit(0)],
        ]);
      const drop = mkBoard("WATERFALL", "Waterfall", "top", "bench_waterfall", thick, "bench",
        "XZ", "Y", dropX0, dropX1, y0, y1, 0, z1, dropOutline);
      drop.stock = { kind: "bench", thickness: thick, sides: 1, colour: benchColour };
      boards.push(drop);
    }
  }

  /* ---- 组装结果 ---- */
  for (const b of boards) refreshBoardBox(b);
  flushPlans();
  applyLayoutDraft(boards, layoutForSplitRails(options.layout != null ? options.layout : LAYOUT, boards), {
    W: P.W, D: P.D, H: P.H, CPT: P.CPT, FPT: P.FPT, BCH: P.BCH, fc: P.fc,
    toeY: R.STYLE1_TOE_KICK_Y,
  }, errors, warnings, {
    bottomClearanceStyle: s.style2 ? "style_2" : "style_1",
    leftFront: s.leftOpts.frontVisible ? "door" : "carcass",
    rightFront: s.rightOpts.frontVisible ? "door" : "carcass",
  });
  attachFaces(boards);
  const joints: Joint[] = buildKitchenFaces({
    boards, slots, screws, hinges, locks, notches, doorColour: doorColourOf(input), applianceTongues,
    benchColour: benchColour || undefined,
  });
  warnings.push(...addKitchenB3Led(boards, !s.style2 && input.ledGroove !== false));
  // Fronts, the kick (B1) included: one group, horizontal unless chosen otherwise.
  // The bench top is HPL even when the doors are acrylic, so its sheet check is separate.
  const grain = applyGrain(boards, (b) => (b.stock?.kind === "door" ? "front" : null), input, { front: "horizontal" });
  noteBenchSheet(grain.issues, boards.find((b) => b.id === "BENCH"));
  noteBenchSheet(grain.issues, boards.find((b) => b.id === "WATERFALL"), "z");
  applyDoorSides(boards, input);
  const milling = applyMilling(boards);

  const stoves = s.columns.flatMap((c, ci) => {
    const z = c.zones[0];
    if (!z || z.zoneType !== "stove") return [];
    const span = frontEdges(ci);
    return [{
      columnId: c.id,
      zoneId: z.id,
      openingWidth: r2(span.x1 - span.x0 - 2 * R.STOVE_SIDE_PANEL_WIDTH_MM.value),
      openingHeight: r2(z.height + s.CPT - s.fc),
    }];
  });
  const result: KitchenResult = {
    params: {
      length: s.length, depth: s.D, height: s.H, carcassDepth: cd,
      materialThickness: s.CPT, frontThickness: s.FPT,
      bottomClearanceHeight: s.BCH,
      bottomClearanceStyle: s.style2 ? "style_2" : "style_1",
      frontClearance: fc, lockEnabled: s.lockOn,
    },
    boards, grain, milling, slots, screws, hinges, locks, notches, joints,
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
    split: s.splitAfter == null ? null : { after: s.splitAfter, x: s.xBoundaries[s.splitAfter + 1] },
    waterfall: s.waterfall ? { side: s.waterfall, x0: s.waterfall === "left" ? 0 : s.W, thickness: R.BENCH_THICKNESS_MM.value } : null,
    stoves,
  };
  return result;
}
