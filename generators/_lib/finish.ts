/**
 * Door colour name written onto colour faces (`finish.colour`). Only the name
 * lives here; what it looks like on screen is the renderer's swatch table.
 *
 * Door stock is single- or double-sided (job catalogue `finish.door.sides`,
 * copied into `params.doorSides`; default single). Single: the colour on the
 * outside face only, the back is the carcass colour. Double: both faces carry
 * the colour (and its grain). Carcass stock is always double-sided carcass
 * colour and is not touched here.
 */
import type { Board, Face } from "./model.ts";

export const DEFAULT_DOOR_COLOUR = "Gloss White";
export const DEFAULT_CARCASS_COLOUR = "White Stipple";

export type DoorSides = "single" | "double";

export function doorColourOf(params: { doorColorName?: unknown; doorColor?: unknown } | null | undefined): string {
  const raw = params ? params.doorColorName || params.doorColor : "";
  return String(raw || "").trim() || DEFAULT_DOOR_COLOUR;
}

export function doorSidesOf(params: { doorSides?: unknown } | null | undefined): DoorSides {
  return params && params.doorSides === "double" ? "double" : "single";
}

/** The carcass colour name (`carcassColor` may be a tag such as `white_stipple`). */
export function carcassColourOf(params: { carcassColorName?: unknown; carcassColor?: unknown } | null | undefined): string {
  const name = params && String(params.carcassColorName || "").trim();
  if (name) return name;
  const raw = params && String(params.carcassColor || "").trim();
  return raw && raw !== "white_stipple" ? raw : DEFAULT_CARCASS_COLOUR;
}

const bigFaces = (b: Board): Face[] => (b.faces ?? []).filter((f) => f.id === "A" || f.id === "B");

/**
 * The back of every door-stock board with a colour face: the colour again
 * (double) or the carcass colour (single). Run after the grain is applied so a
 * double back takes the same grain. Records `stock.sides`.
 */
export function applyDoorSides(boards: Board[], params: { doorSides?: unknown; carcassColorName?: unknown; carcassColor?: unknown }): void {
  const sides = doorSidesOf(params);
  const carcass = carcassColourOf(params);
  for (const b of boards) {
    if (b.stock?.kind !== "door") continue;
    const faces = bigFaces(b);
    const front = faces.find((f) => f.visible === true && f.finish?.colour && f.finish.colour !== carcass);
    if (!front) continue;
    const back = faces.find((f) => f !== front);
    if (!back) continue;
    const { grain: _drop, ...rest } = back.finish ?? {};
    back.finish = sides === "double"
      ? { ...rest, colour: front.finish!.colour, ...(front.finish!.grain ? { grain: front.finish!.grain } : {}) }
      : { ...rest, colour: carcass };
    b.stock = { ...b.stock, sides: sides === "double" ? 2 : 1 };
  }
}
