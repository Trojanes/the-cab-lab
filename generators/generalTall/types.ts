/**
 * 高柜（General Tall Cabinet）— 单列高柜，zones 自下而上堆叠。
 *
 * 坐标：一套最终柜体坐标（前脸 −Y，无事后平移）。
 * - y=0 前柜身，门 y∈[−FPT, 0]，墙侧 y = midDepth = CD − FPT（depth 含门厚）。
 * - 全部板的 x/y 一次写成装配位；轮廓与 bbox、槽/舌特征同一套数字。
 * - V1/V2 深 150，从 y=0 起；V3/V4 深 150，后缘贴 midDepth。四块立板都比门厚基准朝前一个门厚。
 * - 侧板 y∈[−FPT, midDepth]。毫米、Z 向上、x 左起。
 * 端系统、立梃、横桥和避让都按这套接缝直接落位。
 */
import type { Board as ModelBoard, Joint } from "../_lib/model.ts";

export type { Board, Joint } from "../_lib/model.ts";

export type GTZoneType =
  | "side_door" | "left_side_door" | "right_side_door" | "double_door"
  | "drawer" | "open_space" | "open_appliance" | "fridge"
  | "top_flap" | "bottom_flap" | "blank_panel";

export interface GTHingeSettings {
  cupDiameter?: number;
  cupDepth?: number;
  cupCenterFromEdge?: number;
  useThreeHinges?: boolean;
  sideDistance?: number | "auto";
}

export interface GTZone {
  id: string;
  type: GTZoneType;
  height: number;
  shelfEnabled?: boolean;
  shelfHeight?: number;
  lockPosition?: "top" | "bottom" | "side" | "shelf_top" | "shelf_bottom";
  lockHeight?: number;
  hingeSettings?: GTHingeSettings;
  verticalDivider?: boolean;
  dividerCenterX?: number;
  applianceWidthMm?: number;
  applianceDepthMm?: number;
  applianceHeightMm?: number;
}

export interface GTSystemStyle1 {
  style: "style_1";
  frontRailHeight?: number;
  insertSlotThickness?: number;
}
export interface GTSystemStyle2 {
  style: "style_2";
  height?: number;
}
export type GTSystem = GTSystemStyle1 | GTSystemStyle2;

export interface GTParams {
  cabinetHeight: number;
  cabinetWidth: number;
  cabinetDepth: number;
  panelThickness?: number;
  frontPanelThickness?: number;
  /** Door colour name on the fronts' and T1 / B1 room face. Default Gloss White. */
  doorColor?: string;
  doorColorName?: string;
  frontFaceAllowance?: number;
  doorPanelThickness?: number;
  ziThickness?: number;
  hThickness?: number;
  sideClearance?: number;
  dividerThickness?: number;
  topSystem: GTSystem;
  bottomSystem: GTSystem;
  avoidance?: { enabled?: boolean; depth?: number; height?: number };
  leftSidePanelThickness?: number;
  rightSidePanelThickness?: number;
  leftSidePanelAdaptAvoidance?: boolean;
  rightSidePanelAdaptAvoidance?: boolean;
  exteriorSide?: "left" | "right" | "none";
  syncCabinetWidthFromFridge?: boolean;
  zones: GTZone[];
  frontHardware?: {
    frontPanelsEnabled?: boolean;
    frontClearance?: number;
    locksEnabled?: boolean;
    defaultHingeSettings?: GTHingeSettings;
  };
}

/* ---------- 堆叠条目（stackingCalculator 输出） ---------- */

export type BoundaryType = "none" | "full_zi" | "half_zi" | "shortened_zi";

export interface StackItem {
  id: string;
  kind: "bottom_system" | "functional_zone" | "boundary_panel" | "top_system";
  zoneType?: GTZoneType;
  boundaryType?: BoundaryType;
  zoneId?: string;
  z0: number;
  z1: number;
  height: number;
  centerZ: number;
}

/* ---------- 特征（数据层） ---------- */

export interface ZiSlotRecord {
  id: string;
  vPanelId: string;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  depth: number;
  boundaryId: string;
}

export interface ZiGrooveRecord {
  id: string;
  boardId: string;
  face: "top" | "bottom";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  depth: number;
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
  mountingFace: "top" | "bottom" | "side";
  mountingBoardId?: string;
}

export interface GTValidation {
  errors: string[];
  warnings: string[];
}

export interface GTResult {
  params: {
    cabinetHeight: number;
    cabinetWidth: number;
    cabinetDepth: number;
    midWidth: number;
    midDepth: number;
    panelThickness: number;
    frontPanelThickness: number;
    ziThickness: number;
  };
  boards: ModelBoard[];
  stack: StackItem[];
  ziSlots: ZiSlotRecord[];
  ziGrooves: ZiGrooveRecord[];
  hinges: HingeRecord[];
  locks: LockRecord[];
  joints: Joint[];
  validation: GTValidation;
  debug?: Record<string, unknown>;
}
