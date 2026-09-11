/**
 * Bed Box v0 — the bed base in a caravan bedroom as one solid volume.
 * It sits against the room-side face of the Bedroom body, centred on the
 * van's centre line, symmetric left / right; its height equals the tunnel
 * boot height (420 until the boot is defined on the body).
 *
 * Local coordinates follow the Cab Lab cabinet convention: origin at the
 * room-side (front) face at floor level; X left→right (0..width), Y from the
 * room face (0) toward the body (depth), Z up. Fronts (later) sit at negative Y.
 */

export interface BedBoxParams {
  /** Bed width (X), symmetric about the van centre line. */
  width: number;
  /** Bed length (Y) from the body face into the room. */
  depth: number;
  /** Box height (Z) — tunnel boot height. */
  height: number;
  panelThickness?: number;
  frontPanelThickness?: number;
  carcassColor?: string;
}

export interface Board {
  id: string;
  name: string;
  category: string;
  boardType: string;
  materialThickness: number;
  profilePlane: "XY" | "XZ" | "YZ";
  thicknessAxis: "X" | "Y" | "Z";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  source?: string;
  notes?: string[];
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
  features: never[];
  validation: BedBoxValidation;
}
