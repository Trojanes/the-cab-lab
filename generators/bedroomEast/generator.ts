/**
 * East-west bedroom layout only. No boards.
 *
 * Wardrobe on the left, mattress against the right wall, boot across the
 * width under both but only as deep as the wardrobe. The mattress depth is
 * fixed; its length is whatever the wardrobe does not take.
 *
 * Local: X left → right, Y room face → nose, Z up.
 */
import { sectionYZ } from "../bedroom/generator.ts";

export const EAST_MATTRESS_DEPTH_MM = 1570;
export const EAST_BODY_DEPTH_MM = 756;
export const EAST_BOOT_HEIGHT_MM = 418;
export const EAST_WARDROBE_DEFAULT_MM = 395;
export const EAST_WARDROBE_MIN_MM = 150;
export const EAST_MATTRESS_MIN_MM = 1500;

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface EastParams {
  width: number;
  depth?: number;
  height: number;
  roofProfile?: Array<[number, number]>;
  wardrobeWidth?: number;
  bootHeight?: number;
}

export function eastWardrobeMax(width: number): number {
  return round1(Math.max(EAST_WARDROBE_MIN_MM, width - EAST_MATTRESS_MIN_MM));
}

export function generateBedroomEast(raw: EastParams) {
  const errors: string[] = [];
  const W = round1(raw.width || 0);
  const H = round1(raw.height || 0);
  const D = EAST_MATTRESS_DEPTH_MM;
  const body = EAST_BODY_DEPTH_MM;
  const boot = EAST_BOOT_HEIGHT_MM;
  const maxW = eastWardrobeMax(W);
  const wardrobe = round1(Math.min(maxW, Math.max(EAST_WARDROBE_MIN_MM, raw.wardrobeWidth ?? EAST_WARDROBE_DEFAULT_MM)));
  const profile = raw.roofProfile && raw.roofProfile.length > 1 ? raw.roofProfile : [[0, H], [body, H]] as Array<[number, number]>;
  if (W < EAST_WARDROBE_MIN_MM + EAST_MATTRESS_MIN_MM) errors.push(`width ${W} cannot hold a ${EAST_MATTRESS_MIN_MM} mm mattress and a wardrobe`);
  const mattress = round1(W - wardrobe);
  const zones = [];
  if (!errors.length) {
    const box = (id: string, label: string, x0: number, x1: number, y1: number, z0: number, z1: number) => ({
      id, label, kind: "solid" as const, x0, x1, y0: 0, y1, z0, z1, roofTop: false,
      outlineYZ: [{ y: 0, z: z0 }, { y: y1, z: z0 }, { y: y1, z: z1 }, { y: 0, z: z1 }, { y: 0, z: z0 }],
    });
    zones.push(box("boot", "Boot", 0, W, body, 0, boot));
    zones.push({
      id: "mattress", label: "Mattress", kind: "solid" as const,
      x0: wardrobe, x1: W, y0: body, y1: D, z0: 0, z1: boot, roofTop: false,
      outlineYZ: [
        { y: body, z: 0 }, { y: D, z: 0 }, { y: D, z: boot }, { y: body, z: boot }, { y: body, z: 0 },
      ],
    });
    const ward = sectionYZ(profile, body, H, boot, H);
    if (ward) {
      zones.push({
        id: "wardrobe", label: "Wardrobe", kind: "solid" as const,
        x0: 0, x1: wardrobe, y0: 0, y1: body, z0: boot, z1: H, roofTop: true, outlineYZ: ward,
      });
    } else errors.push("the wardrobe has no room under the roof");
  }
  return {
    params: { width: W, depth: D, height: H, wardrobeWidth: wardrobe, bootHeight: boot, bodyDepth: body, mattressDepth: D, mattressLength: mattress, roofProfile: profile },
    zones: errors.length ? [] : zones,
    boards: [],
    validation: { errors, warnings: [] as string[] },
  };
}
