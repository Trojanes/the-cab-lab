/** Small Cabinet v1 — simple floor box, side doors / drawers only. */

export type SmallCabinetZoneType = "left_door" | "right_door" | "drawer";

import type { Board as ModelBoard, Joint } from "../_lib/model.ts";
import type { GrainParams, GrainResult } from "../_lib/grain.ts";
import type { MillingResult } from "../_lib/milling.ts";

export type { Face, FaceFeature, Joint, ProfilePoint } from "../_lib/model.ts";

export interface SmallCabinetZone {
  id?: string;
  type: SmallCabinetZoneType | string;
  /** Logical zone height (mm). Zones stack top→bottom; sum must equal interior height. */
  height: number;
  /** Side-door zones: enable door lock cutout (default true for doors). */
  lockEnabled?: boolean;
  /** Distance from handle-side edge / top for lock center (mm). */
  lockSideDistance?: number;
}

export interface SmallCabinetParams {
  cabinetWidth: number;
  cabinetDepth: number;
  cabinetHeight: number;
  /** Carcass panel thickness (CPT). */
  panelThickness?: number;
  /** Front panel / drawer face thickness (FPT). */
  frontPanelThickness?: number;
  /** Door / drawer face clearance (门缝). */
  frontClearance?: number;
  /** Global door-lock toggle (side doors only). Default true. */
  locksEnabled?: boolean;
  /** Default lock inset from handle edge / top (mm). */
  lockSideDistance?: number;
  carcassColor?: string;
  carcassColorName?: string;
  /** Door colour (job catalogue colour A / B); the renderer's module registry passes these. */
  doorSeries?: string;
  /** Door stock single-sided (default: back = carcass colour) or double-sided (_lib/finish.ts). */
  doorSides?: "single" | "double";
  doorColor?: string;
  doorColorName?: string;
  colorSlot?: string;
  /** When true, left side panel uses door color slot. */
  leftSideDoorColor?: boolean;
  /** When true, right side panel uses door color slot. */
  rightSideDoorColor?: boolean;
  /** Wood grain per group; missing = module default (fronts and door-panel sides horizontal). */
  grain?: GrainParams;
  zones?: SmallCabinetZone[];
}

/** Shared board record (generators/_lib/model.ts) plus the small-cabinet attributes. */
export interface Board extends ModelBoard {
  /** Attribute hint: side panel should use door color. */
  useDoorColor?: boolean;
  hingeSide?: "left" | "right";
  zoneId?: string;
  /** Door lock pocket on front panel (XZ local / world). */
  lockCutout?: LockCutout;
}

export interface LockCutout {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
  radius: number;
  orientation: "vertical" | "horizontal";
}

export interface SmallCabinetFeature {
  id: string;
  type: "shelf_tongue" | "back_tongue" | "side_groove" | "door_lock";
  targetBoardId: string;
  relatedBoardId?: string;
  side?: "left" | "right";
  y0?: number;
  y1?: number;
  z0?: number;
  z1?: number;
  x0?: number;
  x1?: number;
  depth?: number;
  insertionDepth?: number;
  /** Through the receiving board (full groove). A half groove is blind. */
  through?: boolean;
  source?: string;
}

export interface SmallCabinetValidation {
  errors: string[];
  warnings: string[];
}

export interface ResolvedZone {
  id: string;
  type: SmallCabinetZoneType;
  height: number;
  /** Logical top Z (underside of board above / top of interior). */
  zTop: number;
  /** Logical bottom Z (top of board below / bottom of interior). */
  zBottom: number;
  /** Clear opening after half-middle / top-bottom faces. */
  clearZ0: number;
  clearZ1: number;
  lockEnabled: boolean;
  lockSideDistance: number;
}

export interface SmallCabinetResult {
  params: {
    cabinetWidth: number;
    cabinetDepth: number;
    cabinetHeight: number;
    panelThickness: number;
    frontPanelThickness: number;
    frontClearance: number;
    locksEnabled: boolean;
    lockSideDistance: number;
    carcassColor: string;
    carcassColorName: string;
    leftSideDoorColor: boolean;
    rightSideDoorColor: boolean;
  };
  zones: ResolvedZone[];
  /** Board layer: each board carries its faces (A / B / E<i>) with the features that belong to them. */
  boards: Board[];
  /** Grain direction per group and the HPL sheet-size issues (_lib/grain.ts). */
  grain?: GrainResult;
  /** Boards that need partial-depth work on both faces / on a single-sided colour face (_lib/milling.ts). */
  milling?: MillingResult;
  /** Flat legacy view of the same joinery (tongues, grooves, door locks); kept for existing consumers. */
  features: SmallCabinetFeature[];
  /** Face ↔ face joints: side grooves receiving shelf / back tongues. */
  joints: Joint[];
  validation: SmallCabinetValidation;
  debug?: Record<string, unknown>;
}
