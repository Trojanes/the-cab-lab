/**
 * 休闲柜组（Lounge）— I / L / U / Parallel。
 * 坐标：y=0 房间，+Y 朝墙。直段前板在该段靠房间的一端。
 * L 是转角。中间段沿柜背，侧段从一端转进房间。U 是两端都转出去。
 */
import type { Board as ModelBoard, Joint } from "../_lib/model.ts";
import type { MillingResult } from "../_lib/milling.ts";

export type { Board, Joint } from "../_lib/model.ts";

export type LoungeStyle = "I_SHAPE" | "L_SHAPE" | "PARALLEL";
export type LPosition = "LEFT" | "RIGHT";

export interface LoungeParams {
  style?: LoungeStyle;
  /** Door colour name on the fronts' room face. Default Gloss White. */
  doorColor?: string;
  doorColorName?: string;
  /** Door stock single-sided (default: back = carcass colour) or double-sided (_lib/finish.ts). */
  doorSides?: "single" | "double";
  height?: number;
  partitionPanelThickness?: number;
  wheelAvoidanceEnabled?: boolean;
  mainWidth?: number;
  mainDepth?: number;
  lWidth?: number;
  lDepth?: number;
  lPosition?: LPosition;
  /**
   * Always "frame": outer panels full height, the whole top of each run is a lid sitting flush between
   * them on an inner frame, one rear rail along the wall (21 Bunk new lounge); a run longer than
   * FRAME_LID_MAX_LENGTH gets several lids over middle supports. The classic top panel with a rebated
   * lid was retired (a saved "classic" builds as frame, with a warning).
   */
  construction?: "frame";
  topLidEnabled?: boolean;
  /**
   * The wing's room end. Frame L "DRAWER": the wing front becomes a door-stock drawer front with a
   * fixed strip over it and a drawer rail behind the strip (no drawer box). "FLAP" is not built yet.
   */
  lFrontAccess?: "NONE" | "DRAWER" | "FLAP";
  /** Frame parallel: both runs' aisle ends as drawers (same build as the L wing drawer). */
  aisleAccess?: "NONE" | "DRAWER";
  /**
   * Frame L: a partition-thick back panel on the wing's outer side. The wing shifts into the main
   * by one thickness; the outer width stays. The panel rises BACK_PANEL_ABOVE_SEAT above the seat
   * and sticks backPanelOverhang past the room face. The top corner toward the room is rounded.
   */
  backPanel?: boolean;
  /** Frame parallel: the same panel on that run's outer end. The run shifts toward the gap by one thickness. */
  leftBackPanel?: boolean;
  rightBackPanel?: boolean;
  /** How far a back panel sticks past the room face. Absent: BACK_PANEL_OVERHANG. */
  backPanelOverhang?: number;
  /** Door stock of the frame drawer fronts and their fixed strips. */
  frontPanelThickness?: number;
  totalWidth?: number;
  singleLoungeWidth?: number;
  depth?: number;
  avoidanceDepth?: number;
  avoidanceHeight?: number;
  /**
   * Floor-plan wheel arches in this lounge's frame (mm). Written by the app from the
   * space pair. I and L are notched where a board sits in a box and get no cover.
   * A parallel middle cabinet, when a box meets the gap at the wall, gets a top and
   * a front cover there and stands on the top cover.
   */
  planWheelArches?: { id: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }[];
  hasMiddleCabinet?: boolean;
  middleCabinet?: {
    width?: number;
    depth?: number;
    height?: number;
    startHeight?: number;
    doorPanelThickness?: number;
    /** Carcass stock of the mid divider (default MIDDLE_CABINET_DIVIDER_THICKNESS). */
    dividerThickness?: number;
    doorClearance?: number;
    doorLockStyle?: "RAZOR_ROUNDED" | "NONE";
    lockSideDistance?: number;
    hingeSideDistance?: number;
    hingeCupCenterFromEdge?: number;
    hingeCupDiameter?: number;
    hingeCupDepth?: number;
  };
}

export interface LoungeFootprint {
  i?: { x0: number; x1: number; y0: number; y1: number };
  main?: { x0: number; x1: number; y0: number; y1: number };
  l?: { x0: number; x1: number; y0: number; y1: number };
  left?: { x0: number; x1: number; y0: number; y1: number };
  right?: { x0: number; x1: number; y0: number; y1: number };
}

export interface LoungeOpening {
  id: string;
  x0: number;
  y0: number;
  width: number;
  depth: number;
}

export interface LoungeLid {
  id: string;
  x0: number;
  y0: number;
  width: number;
  depth: number;
  holeDiameter: number;
}

export interface LoungeHinge {
  id: string;
  panelId: string;
  centerX: number;
  centerZ: number;
  diameter: number;
  depth: number;
}
export interface LoungeLock {
  id: string;
  panelId: string;
  centerX: number;
  centerZ: number;
  width: number;
  height: number;
  radius: number;
}
export interface LoungeGroove {
  id: string;
  boardId: string;
  face: "A" | "B";
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  depth: number;
  /** The board that sits in it (default the middle cabinet's divider). */
  for?: string;
}

export interface LoungeResult {
  /** Boards that need partial-depth work on both faces / on a single-sided colour face (_lib/milling.ts). */
  milling?: MillingResult;
  params: {
    style: LoungeStyle;
    height: number;
    partitionPanelThickness: number;
    panelHeight: number;
    construction?: "frame";
    lFrontAccess?: "NONE" | "DRAWER";
    aisleAccess?: "NONE" | "DRAWER";
    /** Set when a back panel was built. Height is the seat plus BACK_PANEL_ABOVE_SEAT. */
    backPanel?: boolean;
    leftBackPanel?: boolean;
    rightBackPanel?: boolean;
    backPanelOverhang?: number;
    backPanelHeight?: number;
    /** PARALLEL: the middle cabinet as built (null = none). */
    middleCabinet?: { width: number; depth: number; height: number; startHeight: number } | null;
  };
  boards: ModelBoard[];
  openings: LoungeOpening[];
  lids: LoungeLid[];
  footprint: LoungeFootprint;
  hinges: LoungeHinge[];
  locks: LoungeLock[];
  grooves: LoungeGroove[];
  joints: Joint[];
  validation: { errors: string[]; warnings: string[] };
  debug?: Record<string, unknown>;
}
