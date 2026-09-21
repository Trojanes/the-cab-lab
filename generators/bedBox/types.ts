/**
 * Bed Box v1 — the bed base in a north-south caravan bedroom, as boards.
 *
 * It stands against the room-side face of the Bedroom body, centred on the
 * van, and continues the mattress opening into the room: its width is the bed
 * frame's (queen 1508), its height the body's tunnel boot height — both bound
 * from the body by the renderer. Only its length is its own.
 *
 * Twelve boards, all one stock (18):
 *
 *   SIDE_L / SIDE_R   side panels, room end → body face (length − end panel)
 *   END               end panel at the room end, over the side panel ends,
 *                     1 mm wider each side (edge-banding allowance)
 *   DIVIDER           centre panel the full inner length, notched at both
 *                     ends top and bottom so the short rails half-lap into it
 *   RAIL_L_LOW/HIGH   long rails against each side panel's inner face,
 *   RAIL_R_LOW/HIGH   one on the floor, one flush with the top, butting
 *                     the short rails
 *   RAIL_END_LOW/HIGH short rails across the box at the end panel and at the
 *   RAIL_BODY_LOW/HIGH body end (1 mm off the body face), notched in the
 *                     middle for the divider
 *
 * No bottom, no top, no board on the body face (the boot's upright is there).
 *
 * Local coordinates follow the Cab Lab cabinet convention: origin at the
 * room-side (front) face at floor level; X left→right (0..width), Y from the
 * room end (0, the end panel's outer face) toward the body (depth), Z up.
 */

import type { Board as ModelBoard, Joint } from "../_lib/model.ts";
export type { Face, FaceFeature, Joint } from "../_lib/model.ts";

export interface BedBoxParams {
  /** Bed width (X) — the bed frame's outer width, from the body. */
  width: number;
  /** Outer length (Y) from the end panel's outer face to the body face. */
  depth: number;
  /** Box height (Z) — the body's tunnel boot height. */
  height: number;
  /** Board thickness for every board; the rule value when absent. */
  panelThickness?: number;
  frontPanelThickness?: number;
  carcassColor?: string;
}

export type BedBoxBoardId =
  | "SIDE_L" | "SIDE_R" | "END" | "DIVIDER"
  | "RAIL_L_LOW" | "RAIL_L_HIGH" | "RAIL_R_LOW" | "RAIL_R_HIGH"
  | "RAIL_END_LOW" | "RAIL_END_HIGH" | "RAIL_BODY_LOW" | "RAIL_BODY_HIGH";

export interface Board extends ModelBoard {
  id: BedBoxBoardId | string;
}

export interface BedBoxZone {
  id: "box";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface BedBoxValidation {
  errors: string[];
  warnings: string[];
}

export interface BedBoxResult {
  params: {
    width: number;
    depth: number;
    height: number;
    panelThickness: number;
    frontPanelThickness: number;
    carcassColor: string;
  };
  zones: BedBoxZone[];
  boards: Board[];
  joints: Joint[];
  features: never[];
  validation: BedBoxValidation;
  debug: {
    boardFrame: "final";
    provenance: import("../_lib/dim.ts").Provenance;
  };
}
