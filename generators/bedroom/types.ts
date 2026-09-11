/**
 * Bedroom (vehicle nose) v0 — the front slab of a caravan as one solid volume.
 * The slab's front is the vehicle's nose cross-section (roof profile), its
 * back is a flat face toward the room. Partitioning into tunnel boot, robes
 * and overhead comes later and adds boards inside this envelope.
 *
 * Local coordinates follow the Cab Lab cabinet convention: origin at the
 * room-side (back) face at floor level; X left→right (0..width), Y from the
 * room face (0) toward the nose (depth), Z up. Fronts / doors (later) sit at
 * negative Y. The roof profile is given in these local coordinates.
 */

export type ProfilePoint = { y: number; z: number };

export interface BedroomParams {
  /** Inside width of the van (X). */
  width: number;
  /** Distance from the room face to the nose tip (Y). */
  depth: number;
  /** Roof height at the room face (Z) — the tallest point of the slab. */
  height: number;
  /** Roof upper edge over the slab, local [y, z] with y from 0 (room face) to depth (nose). */
  roofProfile?: Array<[number, number]>;
  /** Carcass panel thickness (for later versions). */
  panelThickness?: number;
  /** Fronts are not generated; kept at 0 so the envelope has no front allowance. */
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
  /** Outline in the profile plane when the board is not a rectangle. */
  profileVector?: ProfilePoint[];
}

export interface BedroomZone {
  id: "slab";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export interface BedroomValidation {
  errors: string[];
  warnings: string[];
}

export interface BedroomResult {
  params: {
    width: number;
    depth: number;
    height: number;
    panelThickness: number;
    frontPanelThickness: number;
    roofProfile: Array<[number, number]>;
    carcassColor: string;
  };
  zones: BedroomZone[];
  boards: Board[];
  features: never[];
  validation: BedroomValidation;
}
