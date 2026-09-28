import file from "./presets.json" with { type: "json" };
import type { GTParams } from "./types.ts";

export interface GTUiPreset {
  id: string;
  label: string;
  params: GTParams;
}

/** Presets offered in the Tall panel: the presets.json entries marked `ui` (their pins are asserted by the tests). */
export const GT_UI_PRESETS: GTUiPreset[] = (file.presets as Array<{ id: string; label: string; ui?: boolean; params: unknown }>)
  .filter((p) => p.ui === true)
  .map((p) => ({ id: p.id, label: p.label, params: p.params as GTParams }));
