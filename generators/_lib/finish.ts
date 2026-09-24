/**
 * Door colour name written onto colour faces (`finish.colour`). Only the name
 * lives here; what it looks like on screen is the renderer's swatch table.
 */
export const DEFAULT_DOOR_COLOUR = "Gloss White";

export function doorColourOf(params: { doorColorName?: unknown; doorColor?: unknown } | null | undefined): string {
  const raw = params ? params.doorColorName || params.doorColor : "";
  return String(raw || "").trim() || DEFAULT_DOOR_COLOUR;
}
