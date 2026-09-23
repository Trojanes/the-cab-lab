import type { Board as ModelBoard, Joint } from "../_lib/model.ts";

export type BedSide = "left" | "right";
export type BedSideZoneType = "drawer" | "left_door" | "right_door";

export interface BedSideZone {
  id: string;
  type: BedSideZoneType;
}

export interface BedSideParams {
  /** Outer width, wall → outer face of the bed-side show panel: the wardrobe width. */
  width: number;
  /** Into the room, from the body's room face. */
  depth: number;
  /** Top of the top shelf. Dragged at placement; snaps to the wardrobe fixed panel's underside. */
  height: number;
  /** Which wall the table stands on. The show panel is on the bed side. */
  side?: BedSide;
  /** Z of the middle shelf's centreline. */
  shelfCenter?: number;
  /** Lower zone, then upper zone. */
  zones?: BedSideZone[];
  /** Shared side clearance: every gap around and between the fronts. */
  clearance?: number;
  panelThickness?: number;
  doorPanelThickness?: number;
  carcassColor?: string;
  doorColor?: string;
  doorColorName?: string;
}

export interface Board extends ModelBoard {}

export interface BedSideResult {
  params: {
    width: number;
    depth: number;
    height: number;
    side: BedSide;
    shelfCenter: number;
    zones: BedSideZone[];
    clearance: number;
    panelThickness: number;
    doorPanelThickness: number;
    carcassColor: string;
    doorColor: string;
  };
  boards: Board[];
  joints: Joint[];
  validation: { errors: string[]; warnings: string[] };
  debug: { boardFrame: "final"; provenance: import("../_lib/dim.ts").Provenance };
}
