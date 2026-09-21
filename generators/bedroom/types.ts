/**
 * Bedroom (vehicle nose) v1 — the north-south bedroom body, laid out but not yet
 * cut into boards.
 *
 * The body fills the nose: its front is the vehicle's roof profile, its width
 * the van's inside width, its back a flat face toward the room. Inside that
 * envelope the layout is fixed by rule (symmetric left / right):
 *
 *   z roof ┌──────────┬────────────────────┬──────────┐
 *          │ wardrobe │        ohc         │ wardrobe │   overhead block
 *   ohcBot │    L     ├────────────────────┤    R     │
 *          │          │      opening       │          │   void: the mattress
 *   bootH  ├──────────┴────────────────────┴──────────┤
 *          │              tunnel boot                 │   deck on two uprights (room face / nose)
 *   0      └──────────────────────────────────────────┘
 *          0        wardrobeWidth     W-wardrobeWidth  W
 *
 * The opening is not a part: it is what the boot deck, the two wardrobe inner
 * faces and the overhead underside leave free. It must take the chosen bed
 * frame (`bedFrame`, queen = 1508 wide); the bed box in the room is that wide
 * and as high as the boot deck (see `bedBoxSizeFor`).
 *
 * Local coordinates follow the Cab Lab cabinet convention: origin at the
 * room-side face at floor level; X left→right (0..width), Y from the room face
 * (0) toward the nose (depth), Z up. The roof profile is given in these local
 * coordinates as [y, z] pairs.
 */

export type ProfilePoint = { y: number; z: number };

export interface BedroomParams {
  /** Inside width of the van (X). */
  width: number;
  /** Distance from the room face to the nose tip (Y). */
  depth: number;
  /** Roof height at the room face (Z) — the tallest point of the body. */
  height: number;
  /** Roof upper edge over the body, local [y, z] with y from 0 (room face) to depth (nose). */
  roofProfile?: Array<[number, number]>;

  /** Top of the tunnel boot deck above the floor. */
  bootHeight?: number;
  /** Wardrobe width from the side wall to its inner face; the same on both sides. */
  wardrobeWidth?: number;
  /** Underside of the overhead block above the floor. */
  ohcBottom?: number;
  /** Bed frame the opening is laid out for; its width is a rule constant (queen 1508). */
  bedFrame?: BedFrame;

  /** Carcass panel thickness (boot uprights). */
  panelThickness?: number;
  /** Door stock thickness: the wardrobe colour panels. */
  doorPanelThickness?: number;
  /** Fronts are not generated; kept at 0 so the envelope has no front allowance. */
  frontPanelThickness?: number;
  carcassColor?: string;
  doorColor?: string;
  doorColorName?: string;
}

export type BedroomLayoutKey = "bootHeight" | "wardrobeWidth" | "ohcBottom";
/** Bed frame products. Double comes later. */
export type BedFrame = "queen";

import type { Board as ModelBoard, Joint } from "../_lib/model.ts";
export type { Face, FaceFeature, Joint } from "../_lib/model.ts";

/**
 * Shared board record (generators/_lib/model.ts). Bedroom role ids:
 *   BOOT_DECK      the boot deck, wall to wall, full depth, on top of the uprights
 *   BOOT_BACK      the boot upright on the room face (its outer face is the room face)
 *   BOOT_FRONT     the boot upright at the nose end of the body
 *   WARD_L_PANEL   wardrobe colour panel (door stock) on the opening side, boot deck → roof,
 *   WARD_R_PANEL   cut down to the T3 seat in front of the T2 back, with T3's pocket
 *   WARD_L_T3      T3 over each wardrobe: on the seat, across the colour panel for its tail,
 *   WARD_R_T3      notched back to the panel's wall side beyond it
 *   T2 / T1        the rear / front top rails, wall to wall, standing on the T3s
 * The rest of the wardrobe (wall side, base, shelf, door), the overhead and the bed box
 * (its own module) come in later versions.
 */
export interface Board extends ModelBoard {
  /** The layout region this board belongs to (`top` = the wall-to-wall top rails). */
  zoneId?: BedroomZoneId | "top";
}

export type BedroomZoneId = "boot" | "wardrobeL" | "wardrobeR" | "opening" | "ohc";

/**
 * One region of the body. `solid` regions are drawn as blocks, `void` ones
 * as an outline only. `outlineYZ` is the closed local YZ section of the
 * region (floor / roof already applied) — the renderer extrudes it from x0 to
 * x1 and never computes the roof cut itself.
 */
export interface BedroomZone {
  id: BedroomZoneId;
  label: string;
  kind: "solid" | "void";
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  /** Nominal top: the roof height at the room face for roof-topped regions. */
  z1: number;
  /** True when the top follows the roof profile (wardrobes, overhead). */
  roofTop: boolean;
  outlineYZ: ProfilePoint[];
  /** Role ids of the boards this region is made of — when present the renderer draws the boards, not a block. */
  boards?: string[];
}

export interface BedroomValidation {
  errors: string[];
  warnings: string[];
}

export interface BedroomResolvedParams {
  width: number;
  depth: number;
  height: number;
  roofProfile: Array<[number, number]>;
  bootHeight: number;
  wardrobeWidth: number;
  ohcBottom: number;
  bedFrame: BedFrame;
  panelThickness: number;
  doorPanelThickness: number;
  frontPanelThickness: number;
  carcassColor: string;
  doorColor: string;
}

/** Derived numbers the panel shows (never typed by the user). */
export interface BedroomLayoutInfo {
  /** Clear width between the wardrobe inner faces. */
  openingWidth: number;
  /** Clear height between the boot deck and the overhead underside. */
  openingHeight: number;
  /** Lowest roof over the body (at the nose end of the profile). */
  roofMin: number;
  /** Overhead block height at the room face. */
  ohcHeight: number;
  /** Outer width of the chosen bed frame (= the bed box width). */
  bedFrameWidth: number;
  /** Room left between the bed frame and each wardrobe inner face. */
  bedMargin: number;
  /** Wardrobe top: the T3 seat height, T3 top, roof at the T2 back and T2's height there. */
  top: { seat: number; t3Top: number; roofAtT2: number; t2Height: number } | null;
}

export interface BedroomResult {
  params: BedroomResolvedParams;
  layout: BedroomLayoutInfo;
  zones: BedroomZone[];
  boards: Board[];
  joints: Joint[];
  features: never[];
  validation: BedroomValidation;
  debug: {
    boardFrame: "final";
    provenance: import("../_lib/dim.ts").Provenance;
  };
}
