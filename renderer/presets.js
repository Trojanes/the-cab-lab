// Placement presets: the sizes a module's box starts with before the user
// moves the cursor or types. Today they come from the module defaults; a
// settings UI will let the user override them per module (e.g. base units
// D 560 / H 720, wall units D 320 / H 720) so most placements are two clicks.
import { getModule } from "./modules.js";

const overrides = new Map(); // moduleId → { W?, D?, H? }

/** Preset for a module: { W, D, H } with nulls where the cursor decides. */
export function getPreset(moduleId) {
  const mod = getModule(moduleId);
  const o = overrides.get(moduleId) || {};
  return {
    W: o.W ?? null, // width is almost always drawn
    // Depth: preset once the settings UI exists; nose modules start with their default depth.
    D: o.D ?? (mod.placement === "nose" ? mod.defaultSize.D : null),
    H: o.H ?? mod.defaultSize.H,
  };
}

export function setPreset(moduleId, preset) {
  overrides.set(moduleId, { ...(overrides.get(moduleId) || {}), ...preset });
}
