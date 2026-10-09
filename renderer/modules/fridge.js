// @module modules @owns fridge-cabinet zone rules — below/above types, slack
// zone, rule issues, width anchor
// The fridge's cut-out is fixed; everything else follows it. Bottom → top:
// drawers / down flaps, the fridge (one), then nothing, an up flap or a fixed
// panel. Width = cut-out + side panel + V1 / V2 / V5 (fridgeCabinetWidth), so
// a side panel's stock moves the outer width, never the opening. Only one side
// panel, on the side that shows; exteriorSide follows it. The same generalTall
// generator builds it.
import { round1 } from "./stackFit.js";
// Live bindings, not the bundle directly: reloadGeneratorDir re-points these
// after a generator rebuild, and a static gen import would stay stale.
import { generateGeneralTall, fitTallCabinetHeight, fridgeCabinetWidth } from "../modules.js";

export const FRIDGE_BELOW_TYPES = ["drawer", "bottom_flap"];
export const FRIDGE_ABOVE_TYPES = ["top_flap", "fixed_panel"];
export const FRIDGE_ZONE_LABEL = { drawer: "Drawer", bottom_flap: "Down flap", top_flap: "Up flap", fixed_panel: "Fixed panel", fridge: "Fridge" };

/** `{ index, below, fridge, above }` of a fridge cabinet's zones (bottom → top). */
export function fridgeParts(zones = []) {
  const index = zones.findIndex((z) => z.type === "fridge");
  if (index < 0) return { index, below: zones, fridge: null, above: [] };
  return { index, below: zones.slice(0, index), fridge: zones[index], above: zones.slice(index + 1) };
}

/** The zone that takes a cabinet height change: the one above the fridge, else the nearest one under it. */
export function fridgeSlack(zones, except = null) {
  const { below, above } = fridgeParts(zones);
  if (above[0] && above[0].id !== except) return above[0].id;
  for (let k = below.length - 1; k >= 0; k -= 1) if (below[k].id !== except) return below[k].id;
  return null;
}

/** Stack height (bottom system → top system) of these params as they stand. */
export function tallStackHeight(params) {
  const stack = generateGeneralTall(params).stack || [];
  return stack.length ? stack[stack.length - 1].z1 : params.cabinetHeight;
}

/**
 * Params as a fridge cabinet: fridge height = cut-out height, exteriorSide from the one side panel,
 * width from the cut-out, and the stack re-fitted to `H` through the slack zone (none = H follows the stack).
 */
export function fridgeFix(params, { H = params.cabinetHeight, except = null } = {}) {
  const p = { ...params, zones: (params.zones || []).map((z) => ({ ...z })) };
  const { fridge } = fridgeParts(p.zones);
  if (fridge && fridge.applianceHeightMm > 0) fridge.height = fridge.applianceHeightMm;
  const left = (p.leftSidePanelThickness ?? 0) > 0;
  const right = (p.rightSidePanelThickness ?? 0) > 0;
  p.exteriorSide = left && !right ? "left" : right && !left ? "right" : "none";
  p.syncCabinetWidthFromFridge = true;
  if (fridge && fridge.applianceWidthMm > 0) {
    p.cabinetWidth = fridgeCabinetWidth(fridge.applianceWidthMm, (p.leftSidePanelThickness ?? 0) + (p.rightSidePanelThickness ?? 0), p.panelThickness ?? 15);
  }
  const slack = fridgeSlack(p.zones, except);
  if (slack) return fitTallCabinetHeight(p, round1(H), slack);
  return { ...p, cabinetHeight: round1(tallStackHeight(p)) };
}

/** What breaks the fridge-cabinet rules (a tall saved before the split may): shown as warnings, never removed. */
export function fridgeRuleIssues(params) {
  const zones = params.zones || [];
  const issues = [];
  const fridges = zones.filter((z) => z.type === "fridge");
  if (!fridges.length) issues.push("No fridge zone: this is a fridge cabinet without a fridge.");
  if (fridges.length > 1) issues.push(`${fridges.length} fridge zones: a fridge cabinet holds one fridge.`);
  const { below, above } = fridgeParts(zones);
  for (const z of below) {
    if (!FRIDGE_BELOW_TYPES.includes(z.type)) issues.push(`${z.id} (${z.type}) under the fridge: only drawers and down flaps go there.`);
  }
  if (above.length > 1) issues.push(`${above.length} zones above the fridge: only one (an up flap or a fixed panel).`);
  for (const z of above) {
    if (!FRIDGE_ABOVE_TYPES.includes(z.type)) issues.push(`${z.id} (${z.type}) above the fridge: only an up flap or a fixed panel — nobody reaches a drawer up there.`);
  }
  if ((params.leftSidePanelThickness ?? 0) > 0 && (params.rightSidePanelThickness ?? 0) > 0) {
    issues.push("Side panels on both sides: a fridge cabinet has one, on the side that shows.");
  }
  return issues;
}

/**
 * Which face stays when the width changes: the one away from the side panel (the panel side shows,
 * the other stands on a wall or a neighbour). No side panel: the corner the box was drawn from.
 * −1 = the left face (local x = 0), +1 = the right face (local x = W).
 */
export function fridgeWidthAnchor(params, cab) {
  if (params.exteriorSide === "left") return 1;
  if (params.exteriorSide === "right") return -1;
  return cab?.placeCorner?.x ?? -1;
}
