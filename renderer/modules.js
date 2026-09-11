// Module registry. Each entry wraps a shared generator bundle (renderer/gen/*)
// and describes its envelope: which params are the outer W/D/H and which
// divider handles exist. The renderer only reads this; formulas stay in the
// generators.
import { generateSmallCabinet } from "./gen/smallCabinet.js";
import { generateBedroom } from "./gen/bedroom.js";
import { generateBedBox, BED_BOX_DEFAULT_HEIGHT, BED_BOX_MIN } from "./gen/bedBox.js";
import { generateOverheadCabinet, generateOHCSvgPreview } from "./gen/overheadCabinet.js";
import { clearHeightAt, maxClearHeight } from "./spaces.js";
import { builtInFinish, builtInStock, cabinetColor, thickness } from "./materials.js";

function materialsOf(materials) {
  return {
    finish: materials && materials.finish ? materials.finish : builtInFinish(),
    stock: materials && materials.stock ? materials.stock : builtInStock(),
  };
}

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

  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const cpt = thickness(stock, "carcass");
    const color = cabinetColor(finish);
    return {
      cabinetWidth: W,
      cabinetDepth: D,
      cabinetHeight: H,
      panelThickness: cpt,
      frontPanelThickness: thickness(stock, "door"),
      frontClearance: 2.5,
      carcassColor: color.carcassColor,
      carcassColorName: color.carcassColorName,
      doorSeries: color.doorSeries,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      colorSlot: color.colorSlot,
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
      const cpt = params.panelThickness ?? thickness(builtInStock(), "carcass");
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

/**
 * Bedroom: the vehicle's nose slab, for now one solid volume (tunnel boot,
 * robes and overhead are partitioned inside it later). Not a
 * free box: its front is the nose cross-section, its width the van's inside
 * width, its height the roof at the room face; only the depth (distance from
 * the nose) is chosen. Placement "nose" (see interact.js) puts it at the
 * front with pose { x: W, y: D, rotZ: 180 } so the room-side face is the
 * cabinet front (fronts at negative local Y, per the core contract) and local
 * Y runs from the room face toward the nose.
 */
const bedroom = {
  id: "bedroom",
  label: "Bedroom",
  sub: "nose volume",
  placement: "nose",
  single: true, // one per vehicle; picking the module again edits the existing one
  roofAware: true, // the envelope already follows the roof; fit checks skip the roof
  volumeOnly: true, // no boards yet: the envelope is drawn as the solid
  handles: ["D"],
  defaultSize: { W: 2100, D: 700, H: 1965 },
  minSize: { W: 600, D: 300, H: 600 },

  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish);
    return {
      width: round1(W),
      depth: round1(D),
      height: round1(H),
      roofProfile: [[0, round1(H)], [round1(D), round1(H)]],
      panelThickness: thickness(stock, "carcass"),
      frontPanelThickness: 0,
      carcassColor: color.carcassColor,
      doorSeries: color.doorSeries,
      doorColor: color.doorColor,
      colorSlot: color.colorSlot,
    };
  },

  generate(params) {
    return generateBedroom(params);
  },

  envelope(params) {
    return { W: params.width, D: params.depth, H: params.height };
  },

  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) next.width = round1(W);
    if (D != null) next.depth = round1(D);
    if (H != null) next.height = round1(H);
    return next;
  },

  /**
   * Bind the slab to the space: width = van width, height = roof at the room
   * face, roofProfile = the roof over the slab in local Y (0 at the room face,
   * increasing toward the nose). Returns the same object when nothing changed.
   */
  withSpace(params, resolved, pose) {
    if (!resolved) return params;
    const D = params.depth;
    const a = ((pose.rotZ || 0) * Math.PI) / 180;
    const cy = Math.cos(a);
    const worldY = (ly) => pose.y + ly * cy; // local X = 0 along the profile
    const yA = worldY(0);
    const yB = worldY(D);
    const ys = new Set([0, D]);
    for (const [y] of resolved.profile || []) {
      const ly = cy !== 0 ? (y - pose.y) / cy : null;
      if (ly != null && ly > 0.01 && ly < D - 0.01) ys.add(round1(ly));
    }
    const profile = [...ys].sort((p, q) => p - q).map((ly) => [ly, round1(clearHeightAt(resolved, 0, worldY(ly)))]);
    const height = round1(maxClearHeight(resolved, yA, yB));
    const width = round1(resolved.bounds.maxX - resolved.bounds.minX);
    const same = params.width === width && params.height === height
      && JSON.stringify(params.roofProfile) === JSON.stringify(profile);
    if (same) return params;
    return { ...params, width, height, roofProfile: profile };
  },

  /** Local YZ outline of the envelope (room face at y = 0) for the prism wireframe. */
  envelopeProfile(params) {
    return params.roofProfile || [[0, params.height], [params.depth, params.height]];
  },

  dividers() { return []; },
  setDivider(params) { return params; },
  zoneTypes: [],
};

/**
 * Bed Box: the bed base, attached to the Bedroom body. It sits against the
 * body's room-side face, centred on the van's centre line and symmetric about
 * it; height = tunnel boot height (420 until the boot is defined on the body).
 * Placement "bedBox" (interact.js): drag the width as a 2D line on the floor,
 * click, pull the depth into the room, click. `attach` keeps it glued to the
 * body whenever the body or the space changes.
 */
const bedBox = {
  id: "bedBox",
  label: "Bed Box",
  sub: "bed base",
  placement: "bedBox",
  single: true,
  requires: "bedroom", // usable only once the body exists
  attachesTo: "bedroom", // the body's depth drag ignores it
  volumeOnly: true,
  handles: ["D"],
  defaultSize: { W: 1530, D: 1900, H: BED_BOX_DEFAULT_HEIGHT },
  minSize: { W: BED_BOX_MIN.width, D: BED_BOX_MIN.depth, H: BED_BOX_MIN.height },

  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish);
    return {
      width: round1(W),
      depth: round1(D),
      height: round1(H),
      panelThickness: thickness(stock, "carcass"),
      frontPanelThickness: 0,
      carcassColor: color.carcassColor,
      doorSeries: color.doorSeries,
      doorColor: color.doorColor,
      colorSlot: color.colorSlot,
    };
  },
  generate(params) {
    return generateBedBox(params);
  },
  envelope(params) {
    return { W: params.width, D: params.depth, H: params.height };
  },
  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) next.width = round1(W);
    if (D != null) next.depth = round1(D);
    if (H != null) next.height = round1(H);
    return next;
  },

  /**
   * Glue to the body: room-side face of the box at the body's room-side
   * face, centred on the van. Returns { params, pose } or null when there is
   * no body (the box then stays where it is).
   */
  attach(params, pose, { cabinets, resolved }) {
    const body = cabinets.find((c) => c.moduleId === "bedroom");
    if (!body || !resolved) return null;
    const bodyD = getModule(body.moduleId).envelope(body.params).D;
    const cx = (resolved.bounds.minX + resolved.bounds.maxX) / 2;
    // rotZ 180: local X runs W→0 from pose.x, local Y from the room face (pose.y) toward the body.
    const next = { x: round1(cx + params.width / 2), y: round1(bodyD + params.depth), z: 0, rotZ: 180 };
    const same = pose.x === next.x && pose.y === next.y && pose.z === next.z && (pose.rotZ || 0) === next.rotZ;
    return { params, pose: same ? pose : next };
  },

  dividers() { return []; },
  setDivider(params) { return params; },
  zoneTypes: [],
};

/**
 * Overhead cabinet (OHC): hangs from the ceiling with its back on a wall.
 * The box is the whole solid — carcass + the 40 mm top structure + the door
 * thickness; doors may hang a little below it. Placement "ceiling"
 * (interact.js): the anchor is a point on a ceiling ∩ wall line, W runs along
 * that wall, doors face the room; the Face command is not available.
 * Zones run left → right along W and sum to W (the generator's zone frame).
 *
 * Adapter to the shared generator: its frame already matches ours — carcass
 * y 0..cabinetDepth, fronts at y −FPT..0 — so W/D/H map straight onto
 * cabinetWidth / cabinetDepth / cabinetHeight. Stock: every non-door board is
 * carcass stock (`featureWidth`), doors are door stock (`frontPanelThickness`).
 */
export const MIN_ZONE_WIDTH = 150;

/** Scale zone widths so they sum to `total` (whole mm, last zone absorbs the remainder, none under MIN_ZONE_WIDTH). */
export function fitZoneWidths(zones, total) {
  if (!zones.length) return [];
  const sum = zones.reduce((s, z) => s + z.width, 0) || 1;
  const out = zones.map((z) => ({ ...z, width: Math.max(MIN_ZONE_WIDTH, Math.round((z.width / sum) * total)) }));
  const partial = out.slice(0, -1).reduce((s, z) => s + z.width, 0);
  out[out.length - 1].width = round1(total - partial);
  if (out[out.length - 1].width < MIN_ZONE_WIDTH) {
    const even = round1(total / out.length);
    out.forEach((z) => (z.width = even));
    out[out.length - 1].width = round1(total - even * (out.length - 1));
  }
  return out;
}

const overheadCabinet = {
  id: "overheadCabinet",
  label: "Overhead",
  sub: "against the ceiling",
  placement: "ceiling",
  noOrient: true, // only one side can hold the doors: the one facing the room
  growsDown: true, // the top is glued to the ceiling; H changes move the bottom
  panel: "ohc", // wide right-hand editor: zone strip + front view
  defaultSize: { W: 1200, D: 350, H: 400 },
  minSize: { W: MIN_ZONE_WIDTH, D: 150, H: 150 },

  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish);
    return {
      cabinetWidth: round1(W),
      cabinetDepth: round1(D),
      cabinetHeight: round1(H),
      style: "style_1",
      featureWidth: thickness(stock, "carcass"),
      frontPanelThickness: thickness(stock, "door"),
      topClearanceHeight: 40,
      clearance: 2.5,
      ledGroove: false, // manufacturing option; exposed later with the other advanced fields
      carcassColor: color.carcassColor,
      carcassColorName: color.carcassColorName,
      doorSeries: color.doorSeries,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      colorSlot: color.colorSlot,
      zones: [{ id: "zone-1", type: "up_flap", width: round1(W) }],
    };
  },

  generate(params) {
    return generateOverheadCabinet(params);
  },

  /** 2D front elevation (SVG markup) from the last generation; `selectedZoneIndex` is outlined. */
  frontView(result, { selectedZoneIndex = -1 } = {}) {
    const geo = result?.debug?.legacyGeometry;
    if (!geo) return null;
    return generateOHCSvgPreview(geo, { selectedZoneIndex, showDimensions: true });
  },

  envelope(params) {
    return { W: params.cabinetWidth, D: params.cabinetDepth, H: params.cabinetHeight };
  },

  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) {
      next.cabinetWidth = round1(W);
      next.zones = fitZoneWidths(params.zones || [], next.cabinetWidth);
    }
    if (D != null) next.cabinetDepth = round1(D);
    if (H != null) next.cabinetHeight = round1(H);
    return next;
  },

  /** Zone boundaries: vertical lines on the front face at local x (left → right). */
  dividers(params) {
    const zones = params.zones || [];
    const out = [];
    let x = 0;
    for (let i = 0; i < zones.length - 1; i += 1) {
      x = round1(x + zones[i].width);
      out.push({ index: i, axis: "x", pos: x, min: x - zones[i].width + MIN_ZONE_WIDTH, max: x + zones[i + 1].width - MIN_ZONE_WIDTH });
    }
    return out;
  },

  /** Move boundary `index` to local x = pos; the two zones it separates trade width. */
  setDivider(params, result, index, pos) {
    const zones = (params.zones || []).map((z) => ({ ...z }));
    const left = zones[index];
    const right = zones[index + 1];
    if (!left || !right) return params;
    const x0 = zones.slice(0, index).reduce((s, z) => s + z.width, 0);
    const total = round1(left.width + right.width);
    const x = Math.max(x0 + MIN_ZONE_WIDTH, Math.min(x0 + total - MIN_ZONE_WIDTH, Math.round(pos)));
    left.width = round1(x - x0);
    right.width = round1(total - left.width);
    return { ...params, zones };
  },

  zoneTypes: [
    { id: "up_flap", label: "Up flap", short: "Flap" },
    { id: "fixed_panel", label: "Fixed panel", short: "Fixed" },
    { id: "open", label: "Open", short: "Open" },
  ],
};

export const MODULES = {
  smallCabinet,
  overheadCabinet,
  bedroom,
  bedBox,
};

/**
 * Rail groups: one rail entry that opens a flyout of sub-modules on hover.
 * `moduleId` items arm that module; `planned` items are listed but disabled.
 */
export const MODULE_GROUPS = [
  {
    id: "bedroom",
    label: "Bedroom",
    sub: "3 sub-modules",
    items: [
      { moduleId: "bedroom", label: "Body", sub: "nose volume" },
      { moduleId: "bedBox", label: "Bed Box", sub: "bed base · needs the body" },
      { id: "bedSideTable", label: "Bed Side Table", sub: "not wired yet", planned: true },
    ],
  },
];

/** Placeholders shown in the rail but not yet wired. */
export const PLANNED_MODULES = [
  { id: "generalTallCabinet", label: "Tall", sub: "general tall" },
  { id: "kitchenCabinet", label: "Base", sub: "kitchen run" },
  { id: "loungeGenerator", label: "Lounge", sub: "L / I layouts" },
  { id: "uShapeOverheadCabinet", label: "U overhead", sub: "three runs" },
];

export function getModule(id) {
  const m = MODULES[id];
  if (!m) throw new Error(`Unknown module: ${id}`);
  return m;
}
