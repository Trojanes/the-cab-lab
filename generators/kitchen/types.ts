/**
 * 厨房底柜（Kitchen Base Cabinet）— 列 × 区两级布局。
 *
 * 坐标契约：y=0 为结构前缘（门侧），门板在 y∈[−FPT, 0]。
 * x 左起；y=0 为结构前缘（门侧），门板悬于 y∈[−FPT, 0]，y=+cd 为墙侧；
 * z 地板=0 向上，总高含 BCH。**勿套用 overhead 的 Y 翻转。**
 * 结构深 cd = depth − FPT（depth 参数含门厚）。
 * 重实现依据：docs/kitchen-cleanroom-spec.md（钉值验收 0.01mm）。
 */
import type { Board as ModelBoard, Joint } from "../_lib/model.ts";
import type { GrainParams, GrainResult } from "../_lib/grain.ts";
import type { MillingResult } from "../_lib/milling.ts";

export type { Board, Joint } from "../_lib/model.ts";

export type KitchenZoneType =
  | "left_door" | "right_door" | "double_door" | "drawer"
  | "open" | "down_flap" | "stove" | "custom" | "unassigned";

/** 首列左端 / 末列右端侧板选项（§2 SidePanelOptions）。 */
export interface SidePanelOptions {
  panelType?: "carcass" | "door";
  frontVisible?: boolean;
  bchNotchEnabled?: boolean;
  grooveVisible?: boolean;
  extendT2T3B4ToOuterFace?: boolean;
  strengtheningStripEnabled?: boolean;
}

export interface HingeSettings {
  sideDistance?: number;
  cupDiameter?: number;
  cupDepth?: number;
  cupCenterFromEdge?: number;
  useThreeHinges?: boolean;
}

export interface KitchenZone {
  id: string;
  height: number;
  zoneType: KitchenZoneType;
  shelfEnabled?: boolean;
  shelfHeight?: number;
  leftSidePanelOptions?: SidePanelOptions;
  rightSidePanelOptions?: SidePanelOptions;
  hingeSettings?: HingeSettings;
  lockEnabled?: boolean;
  lockSideCenterOffset?: number;
}

export interface KitchenColumn {
  id: string;
  width: number;
  columnType?: string;
  zones: KitchenZone[];
}

export interface WheelAvoidance {
  id: string;
  x0: number;
  x1: number;
  height: number;
  depth: number;
}

export interface MachiningPreference {
  vPanelIndex: number;
  mode: MachiningMode;
}

/** 11 种双侧半槽加工模式（§4.4）。 */
export type MachiningMode =
  | "left_half_right_none" | "right_half_left_none"
  | "left_half_right_through" | "right_half_left_through"
  | "left_half" | "right_half" | "left_through" | "right_through"
  | "left_face_half_allowed" | "right_face_half_allowed"
  | "through_only";

export interface KitchenParams {
  globalSettings: {
    length: number;
    depth: number;
    height: number;
  };
  materialThickness?: number;
  frontThickness?: number;
  bottomClearanceHeight?: number;
  bottomClearanceStyle?: string;
  frontClearance?: number;
  lockEnabled?: boolean;
  /** Door colour name on the fronts' room face. Default Gloss White. */
  doorColor?: string;
  doorColorName?: string;
  /** Door series (acrylic | hpl); only HPL has a grain and the sheet-size check. */
  doorSeries?: string;
  /** Door stock single-sided (default: back = carcass colour) or double-sided (_lib/finish.ts). */
  doorSides?: "single" | "double";
  /** Wood grain per group; missing = module default (fronts horizontal). */
  grain?: GrainParams;
  columns: KitchenColumn[];
  wheelAvoidances?: WheelAvoidance[];
  vPanelMachiningPreferences?: MachiningPreference[];
}

/* ---------- 生成期派生记录 ---------- */

export interface ResolvedColumn {
  id: string;
  x0: number;
  x1: number;
  zones: { id: string; zoneType: KitchenZoneType; z0: number; z1: number }[];
}

/** 槽（挂在 V 板上，供功能板舌进入）。 */
export interface SlotRecord {
  id: string;
  vPanelId: string;
  side: "left" | "right";
  through: boolean;
  depth: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  forBoard: string;
}

/** A functional board that lost its slot on a V panel is screwed through the V from the other face. */
export interface ScrewRecord {
  id: string;
  vPanelId: string;
  /** The face of the V the board sits against; the screw goes in from the opposite face. */
  side: "left" | "right";
  forBoard: string;
  /** Cabinet-frame centre (y along the board's depth, z at the board's mid-thickness). */
  y: number;
  z: number;
  diameter: number;
}

export interface HingeRecord {
  id: string;
  panelId: string;
  centerX: number;
  centerZ: number;
  diameter: number;
  depth: number;
}

export interface LockRecord {
  id: string;
  panelId: string;
  centerX: number;
  centerZ: number;
  width: number;
  height: number;
  radius: number;
}

/** 板身让位缺口（层板前缘 / 条让 V 板等，作为特征记录）。 */
export interface NotchRecord {
  id: string;
  panelId: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface KitchenValidation {
  errors: string[];
  warnings: string[];
}

export interface KitchenResult {
  params: Required<Pick<KitchenParams, "materialThickness" | "frontThickness" | "bottomClearanceHeight"
    | "bottomClearanceStyle" | "frontClearance" | "lockEnabled">> & {
    length: number;
    depth: number;
    height: number;
    carcassDepth: number;
  };
  boards: ModelBoard[];
  /** Grain direction per group and the HPL sheet-size issues (_lib/grain.ts). */
  grain?: GrainResult;
  /** Boards that need partial-depth work on both faces / on a single-sided colour face (_lib/milling.ts). */
  milling?: MillingResult;
  slots: SlotRecord[];
  /** Screw holes for functional boards that got no slot (double-sided half-slot conflict, slots too close). */
  screws: ScrewRecord[];
  hinges: HingeRecord[];
  locks: LockRecord[];
  notches: NotchRecord[];
  joints: Joint[];
  xBoundaries: number[];
  validation: KitchenValidation;
  debug?: Record<string, unknown>;
}
