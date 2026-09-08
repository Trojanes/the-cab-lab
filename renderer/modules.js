// Module registry. Each entry wraps a shared generator bundle (renderer/gen/*)
// and describes its envelope: which params are the outer W/D/H and which
// divider handles exist. The renderer only reads this; formulas stay in the
// generators.
import { generateSmallCabinet } from "./gen/smallCabinet.js";

export const MIN_ZONE_HEIGHT = 60;
const round1 = (v) => Math.round(v * 10) / 10;

/** Scale zone heights so they sum to `interior`, absorbing rounding in the last zone. */
export function fitZones(zones, interior) {
  if (!zones.length) return [];
  const sum = zones.reduce((s, z) => s + z.height, 0) || 1;
  // Whole millimetres for all but the last zone, which absorbs the remainder.
  const out = zones.map((z) => ({ ...z, height: Math.max(MIN_ZONE_HEIGHT, Math.round((z.height / sum) * interior)) }));
  const partial = out.slice(0, -1).reduce((s, z) => s + z.height, 0);
  out[out.length - 1].height = round1(interior - partial);
  if (out[out.length - 1].height < MIN_ZONE_HEIGHT) {
    // Interior too small for this many zones; distribute evenly instead.
    const even = round1(interior / out.length);
    out.forEach((z) => (z.height = even));
    out[out.length - 1].height = round1(interior - even * (out.length - 1));
  }
  return out;
}

const smallCabinet = {
  id: "smallCabinet",
  label: "Small",
  sub: "simple box",
  defaultSize: { W: 600, D: 560, H: 720 },
  minSize: { W: 120, D: 100, H: 120 },

  defaults(W, D, H) {
    const cpt = 16;
    return {
      cabinetWidth: W,
      cabinetDepth: D,
      cabinetHeight: H,
      panelThickness: cpt,
      frontPanelThickness: 16,
      frontClearance: 2.5,
      zones: [{ id: "zone-1", type: "left_door", height: round1(H - 2 * cpt) }],
    };
  },

  generate(params) {
    return generateSmallCabinet(params);
  },

  envelope(params) {
    return { W: params.cabinetWidth, D: params.cabinetDepth, H: params.cabinetHeight };
  },

  /** Returns a new params object with the outer size changed. */
  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) next.cabinetWidth = round1(W);
    if (D != null) next.cabinetDepth = round1(D);
    if (H != null) {
      next.cabinetHeight = round1(H);
      const cpt = params.panelThickness ?? 16;
      next.zones = fitZones(params.zones || [], round1(next.cabinetHeight - 2 * cpt));
    }
    return next;
  },

  /**
   * Divider handles on the front face. Small cabinet zones stack top→bottom,
   * so each boundary is a horizontal line at local z.
   */
  dividers(params, result) {
    const zones = result?.zones || [];
    const out = [];
    for (let i = 0; i < zones.length - 1; i += 1) {
      out.push({ index: i, axis: "z", pos: zones[i].zBottom, min: zones[i + 1].zBottom + MIN_ZONE_HEIGHT, max: zones[i].zTop - MIN_ZONE_HEIGHT });
    }
    return out;
  },

  /** Move boundary `index` to local z = pos; returns new params. */
  setDivider(params, result, index, pos) {
    const zones = result.zones;
    const above = zones[index];
    const below = zones[index + 1];
    if (!above || !below) return params;
    const z = Math.max(below.zBottom + MIN_ZONE_HEIGHT, Math.min(above.zTop - MIN_ZONE_HEIGHT, Math.round(pos)));
    const total = round1(above.height + below.height);
    const hAbove = round1(above.zTop - z);
    const hBelow = round1(total - hAbove);
    const nextZones = (params.zones || []).map((zn) => ({ ...zn }));
    nextZones[index].height = hAbove;
    nextZones[index + 1].height = hBelow;
    return { ...params, zones: nextZones };
  },

  zoneTypes: [
    { id: "left_door", label: "Door (hinge left)" },
    { id: "right_door", label: "Door (hinge right)" },
    { id: "drawer", label: "Drawer" },
  ],
};

export const MODULES = {
  smallCabinet,
};

/** Placeholders shown in the rail but not yet wired. */
export const PLANNED_MODULES = [
  { id: "generalTallCabinet", label: "Tall", sub: "general tall" },
  { id: "overheadCabinet", label: "Overhead", sub: "wall cabinet" },
  { id: "kitchenCabinet", label: "Base", sub: "kitchen run" },
  { id: "loungeGenerator", label: "Lounge", sub: "L / I layouts" },
  { id: "uShapeOverheadCabinet", label: "U overhead", sub: "three runs" },
];

export function getModule(id) {
  const m = MODULES[id];
  if (!m) throw new Error(`Unknown module: ${id}`);
  return m;
}
