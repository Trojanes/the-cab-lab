// Module registry. Each entry wraps a shared generator bundle (renderer/gen/*)
// and describes its envelope: which params are the outer W/D/H and which
// divider handles exist. The renderer only reads this; formulas stay in the
// generators.
import * as smallMod from "./gen/smallCabinet.js";
import * as bedroomMod from "./gen/bedroom.js";
import * as bedroomEastMod from "./gen/bedroomEast.js";
import * as bedBoxMod from "./gen/bedBox.js";
import * as bedSideMod from "./gen/bedSideTable.js";
import * as bunkMod from "./gen/bunkBed.js";
import * as overheadMod from "./gen/overheadCabinet.js";
import * as uShapeMod from "./gen/uShapeOverhead.js";
import * as kitchenMod from "./gen/kitchen.js";
import * as tallMod from "./gen/generalTall.js";
import * as loungeMod from "./gen/lounge.js";
let generateSmallCabinet = smallMod.generateSmallCabinet;
let generateSmallCabinetSvgPreview = smallMod.generateSmallCabinetSvgPreview;
let generateBedroom = bedroomMod.generateBedroom;
let generateBedroomSvgPreview = bedroomMod.generateBedroomSvgPreview;
let setBedroomLayout = bedroomMod.setLayout;
let bedroomLayoutLimits = bedroomMod.layoutLimits;
let bedBoxSizeFor = bedroomMod.bedBoxSizeFor;
let setBedroomOhcBoundary = bedroomMod.setOhcBoundary;
let bedroomEqualOhcZones = bedroomMod.equalOhcZones;
let BEDROOM_LAYOUT_KEYS = bedroomMod.LAYOUT_KEYS;
let BEDROOM_RULES = bedroomMod.RULES;
let BEDROOM_WARDROBE_STYLES = bedroomMod.WARDROBE_STYLES;
let generateBedroomEast = bedroomEastMod.generateBedroomEast;
let eastWardrobeMax = bedroomEastMod.eastWardrobeMax;
let eastEqualBays = bedroomEastMod.eastEqualBays;
let eastSetBayBoundary = bedroomEastMod.eastSetBayBoundary;
let eastOhcBottomLimits = bedroomEastMod.eastOhcBottomLimits;
let EAST_RULES = bedroomEastMod.RULES;
let generateBedBox = bedBoxMod.generateBedBox;
let BED_BOX_DEFAULT_HEIGHT = bedBoxMod.BED_BOX_DEFAULT_HEIGHT;
let BED_BOX_MIN = bedBoxMod.BED_BOX_MIN;
let BED_BOX_RULES = bedBoxMod.RULES;
let generateBedSideTable = bedSideMod.generateBedSideTable;
let generateBedSideSvg = bedSideMod.generateBedSideSvg;
let bedSideShelfLimits = bedSideMod.shelfLimits;
let mirrorBedSideZone = bedSideMod.mirrorZoneType;
let BED_SIDE_RULES = bedSideMod.RULES;
let generateBunkBed = bunkMod.generateBunkBed;
let bunkUpperLimits = bunkMod.bunkUpperLimits;
let bunkMinSize = bunkMod.bunkMinSize;
let BUNK_RULES = bunkMod.RULES;
let generateOverheadCabinet = overheadMod.generateOverheadCabinet;
let generateOHCSvgPreview = overheadMod.generateOHCSvgPreview;
let generateOHCFrontView = overheadMod.generateOHCFrontView;
let ohcZoneOpenings = overheadMod.ohcZoneOpenings;
let generateUShapeOverhead = uShapeMod.generateUShapeOverhead;
let generateKitchenCabinet = kitchenMod.generateKitchenCabinet;
let generateKitchenSvgPreview = kitchenMod.generateKitchenSvgPreview;
let KITCHEN_RULES = kitchenMod.RULES;
let fitTallCabinetHeight = tallMod.fitTallCabinetHeight;
let fridgeCabinetWidth = tallMod.fridgeCabinetWidth;
let generateGeneralTall = tallMod.generateGeneralTall;
let generateGTSvgPreview = tallMod.generateGTSvgPreview;
let gtZoneOpenings = tallMod.gtZoneOpenings;
let GT_UI_PRESETS = tallMod.GT_UI_PRESETS;
let generateLounge = loungeMod.generateLounge;
let generateLoungeSvgPreview = loungeMod.generateLoungeSvgPreview;
let loungeFootprintBoxes = loungeMod.loungeFootprintBoxes;
import { clearHeightAt, maxClearHeight } from "./spaces.js";
import { benchTopColor, builtInFinish, builtInStock, cabinetColor, thickness } from "./materials.js";
import * as sketchMod from "./gen/sketchBoard.js";
import * as ensuiteDrawingMod from "./gen/ensuiteDrawing.js";
let generateEnsuiteDrawing = ensuiteDrawingMod.generateEnsuiteDrawing;
let ensuiteDrawingSize = ensuiteDrawingMod.ensuiteDrawingSize;
let generateSketchBoard = sketchMod.generateSketchBoard;
import { localBoxOf } from "./sketchBoard.js";

function materialsOf(materials) {
  return {
    finish: materials && materials.finish ? materials.finish : builtInFinish(),
    stock: materials && materials.stock ? materials.stock : builtInStock(),
  };
}

export const MIN_ZONE_HEIGHT = 60;
const round1 = (v) => Math.round(v * 10) / 10;

/** Which column a kitchen width change grows or shrinks, remembered for this session. */
const kitchenWidthColumn = new Map();
export function getKitchenWidthColumn(id) {
  const n = kitchenWidthColumn.get(id);
  return Number.isInteger(n) ? n : null;
}
export function setKitchenWidthColumn(id, index) {
  if (index == null) kitchenWidthColumn.delete(id);
  else kitchenWidthColumn.set(id, index);
}

function kitchenBenchRise(params) {
  return params && (params.benchTopColorName || params.benchTopColor) ? KITCHEN_RULES.BENCH_THICKNESS_MM.value : 0;
}
function kitchenWaterfall(params) {
  return params?.waterfall === "left" || params?.waterfall === "right" ? params.waterfall : null;
}
/** The kitchen's waterfall end (left | right) or null. */
export function kitchenWaterfallSide(params) { return kitchenWaterfall(params); }
/** Bench stock thickness: the bench top's rise and a waterfall's thickness. */
export function kitchenBenchThickness() { return KITCHEN_RULES.BENCH_THICKNESS_MM.value; }
/** A kitchen with a bench top colour builds a bench top (and may build a waterfall). */
export function kitchenBenchOn(params) { return !!(params && (params.benchTopColorName || params.benchTopColor)); }

/** The overhead's door-stock end panel (a converted partition): which end, or null. */
export function overheadEndPanel(params) {
  return params?.endPanel === "left" || params?.endPanel === "right" ? params.endPanel : null;
}
/** Its thickness inside the overhead's outer width: the door stock, else 0. */
export function overheadEndPanelThickness(params) {
  if (!overheadEndPanel(params)) return 0;
  const t = Number(params.frontPanelThickness);
  return Number.isFinite(t) && t > 0 ? t : 16;
}

/** Envelope dimension along a local axis. */
export const DIM_OF_AXIS = { x: "W", y: "D", z: "H" };

/**
 * Resize command on a row of zones. `items` are ordered from the moved face
 * inward; `delta` is how far the face moved outward (negative = pushed in).
 * Growth: `make(delta)` becomes a new zone at the face once delta reaches
 * `min`; without `make`, or below `min`, the face zone takes it. Shrink: the
 * face zone gives; a zone that would drop under `min` merges into its
 * neighbour, which keeps giving. Returns the list in the same order, or null
 * when the last zone would drop under `min`.
 */
export function resizeStack(items, delta, { key, min, make = null }) {
  const out = items.map((it) => ({ ...it }));
  if (!out.length) return null;
  if (delta >= 0) {
    if (make && delta >= min) out.unshift(make(round1(delta)));
    else out[0][key] = round1(out[0][key] + delta);
    return out;
  }
  const give = -delta;
  while (out.length > 1 && out[0][key] - give < min) {
    const gone = out.shift();
    out[0] = { ...out[0], [key]: round1(out[0][key] + gone[key]) };
  }
  if (out[0][key] - give < min) return null;
  out[0][key] = round1(out[0][key] - give);
  return out;
}

/** First `${prefix}${n}` not already taken. */
function freshId(prefix, taken) {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Zones along W (left → right) resized from the left (x−) or right (x+) face. */
function resizeRow(zones, side, delta, opts) {
  const fromLeft = side.dir < 0;
  const ordered = fromLeft ? zones : zones.slice().reverse();
  const next = resizeStack(ordered, delta, opts);
  if (!next) return null;
  return fromLeft ? next : next.reverse();
}

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
  panel: "small",
  defaultSize: { W: 600, D: 560, H: 720 },
  minSize: { W: 120, D: 100, H: 120 },

  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const cpt = thickness(stock, "carcass");
    const color = cabinetColor(finish, "B");
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
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      colorSlot: color.colorSlot,
      zones: [{ id: "zone-1", type: "left_door", height: round1(H - 2 * cpt) }],
    };
  },

  generate(params, options) {
    return generateSmallCabinet(params, options);
  },
  benchSwitches: [
    { key: "leftSide", label: "左侧板", options: [["door", "门板"], ["carcass", "柜身"]], get: (p) => p.leftSideDoorColor ? "door" : "carcass", set: (p, v) => ({ ...p, leftSideDoorColor: v === "door" }) },
    { key: "rightSide", label: "右侧板", options: [["door", "门板"], ["carcass", "柜身"]], get: (p) => p.rightSideDoorColor ? "door" : "carcass", set: (p, v) => ({ ...p, rightSideDoorColor: v === "door" }) },
  ],

  frontView(result, { selectedZoneId = null } = {}) {
    return generateSmallCabinetSvgPreview(result, { selectedZoneId });
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

  /** Resize command: the faces it offers (`x-` left … `z+` top; the floor side never moves). */
  resizeFaces: ["x-", "x+", "y-", "y+", "z+"],
  /** Top face: only the top zone (zones[0]) grows or shrinks; one too small merges into the zone below. */
  resizeFace(params, side, size) {
    if (side.axis !== "z") return this.setEnvelope(params, { [DIM_OF_AXIS[side.axis]]: size });
    const zones = resizeStack(params.zones || [], size - params.cabinetHeight, { key: "height", min: MIN_ZONE_HEIGHT });
    return zones ? { ...params, cabinetHeight: round1(size), zones } : null;
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
  benchShape: "small",
};

/**
 * Bedroom body: the vehicle's nose, laid out as five regions — tunnel boot
 * (wall to wall, floor → bootHeight), a wardrobe each side (bootHeight → roof),
 * the mattress opening between them (a void) and the overhead block above it.
 * Symmetric by rule: one `wardrobeWidth` serves both sides. No boards yet: the
 * regions are the solids (`result.zones[].outlineYZ`, drawn by cabinets3d.js).
 *
 * Not a free box: its front is the nose cross-section, its width the van's
 * inside width, its height the roof at the room face; only the depth (distance
 * from the nose) is chosen. Placement "nose" (see interact.js) puts it at the
 * front with pose { x: W, y: D, rotZ: 180 } so the room-side face is the
 * cabinet front (fronts at negative local Y, per the core contract) and local
 * Y runs from the room face toward the nose.
 *
 * Layout editing goes through `setLayout(params, key, value)` (clamped by the
 * generator's `layoutLimits`); the 3D orange bars and the panel's front view
 * are both views of the same four numbers.
 */
export const BEDROOM_LAYOUT = BEDROOM_LAYOUT_KEYS;
export const BEDROOM_LAYOUT_LABEL = {
  bootHeight: "Tunnel boot height",
  wardrobeWidth: "Wardrobe width",
  ohcBottom: "Overhead bottom",
  fixedPanelTop: "Fixed panel top",
  nookShelfBottom: "Nook shelf bottom",
};
export const BEDROOM_WARDROBE_STYLE = BEDROOM_WARDROBE_STYLES;
const bedroom = {
  id: "bedroom",
  label: "Bedroom",
  sub: "nose body",
  placement: "nose",
  single: true, // one per vehicle; picking the module again edits the existing one
  roofAware: true, // the envelope already follows the roof; fit checks skip the roof
  volumeOnly: true, // regions without boards yet (wardrobes, overhead, opening) are drawn as solids; the boot is boards
  panel: "bedroom", // wide right-hand editor: front view with draggable boundaries + layout fields
  handles: ["D"],
  defaultSize: { W: 2275, D: 756, H: 1797 },
  minSize: { W: 600, D: 300, H: 600 },

  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish);
    return {
      width: round1(W),
      depth: round1(D),
      height: round1(H),
      roofProfile: [[0, round1(H)], [round1(D), round1(H)]],
      bootHeight: BEDROOM_RULES.BOOT_HEIGHT_DEFAULT_MM.value,
      // The wardrobes never close the opening below the bed frame: on a narrow van they start narrower.
      wardrobeWidth: Math.min(BEDROOM_RULES.WARDROBE_WIDTH_DEFAULT_MM.value, Math.floor((round1(W) - BEDROOM_RULES.BED_FRAME_QUEEN_WIDTH_MM.value) / 2)),
      ohcBottom: BEDROOM_RULES.OHC_BOTTOM_DEFAULT_MM.value,
      style: "style1",
      fixedPanelTop: BEDROOM_RULES.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value,
      nookShelfBottom: BEDROOM_RULES.WARDROBE_NOOK_SHELF_BOTTOM_DEFAULT_MM.value,
      ledGroove: true, // LED channels on the T3 tops (and the nook shelf underside)
      bedFrame: "queen",
      ohcZones: (() => {
        const opening = round1(W) - 2 * Math.min(BEDROOM_RULES.WARDROBE_WIDTH_DEFAULT_MM.value, Math.floor((round1(W) - BEDROOM_RULES.BED_FRAME_QUEEN_WIDTH_MM.value) / 2));
        return bedroomEqualOhcZones(opening, 2);
      })(),
      panelThickness: thickness(stock, "carcass"),
      doorPanelThickness: thickness(stock, "door"), // the wardrobe colour panels
      doorColorName: color.doorColorName,
      frontPanelThickness: 0,
      carcassColor: color.carcassColor,
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      colorSlot: color.colorSlot,
    };
  },

  generate(params, options) {
    return generateBedroom(params, options);
  },
  benchSwitches: [
    { key: "style", label: "衣柜门", options: [["style1", "样式 1"], ["nook", "壁龛"]], get: (p) => p.style === "nook" ? "nook" : "style1", set: (p, v) => ({ ...p, style: v }) },
    { key: "ledGroove", label: "灯槽", options: [["on", "开"], ["off", "关"]], get: (p) => p.ledGroove === false ? "off" : "on", set: (p, v) => ({ ...p, ledGroove: v === "on" }) },
  ],

  /** 2D front elevation (SVG markup) from the last generation; `selectedRegion` is outlined. */
  frontView(result, { selectedRegion = null, gaps = "clear" } = {}) {
    return generateBedroomSvgPreview(result, { selectedRegion, showDimensions: true, gaps });
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
  /** Width is the van, height the roof, the nose side the nose: only the room face moves. */
  resizeFaces: ["y-"],

  /** Layout: the numbers the regions (and Style 1 split) are built from. Clamped by the generator's limits. */
  layoutKeys: BEDROOM_LAYOUT_KEYS,
  layoutLimits(params, key) {
    return bedroomLayoutLimits(params, key);
  },
  setLayout(params, key, value) {
    return setBedroomLayout(params, key, value);
  },
  /** W × H of the bed box: the bed frame's width, the boot deck's height. */
  bedBoxSize(params) {
    return bedBoxSizeFor(params);
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

  /**
   * Layout boundaries as orange bars on the room face. Each bar drives one
   * layout key; the mirrored pair (wardrobe inner faces) carries `side` so
   * either bar moves both. `span` is the bar's extent along the other axis
   * (a wardrobe face runs from the boot deck to the roof, not the whole height).
   */
  dividers(params, result) {
    if (!result || result.validation?.errors?.length) return [];
    const p = result.params;
    const W = p.width;
    const H = p.height;
    const lim = (k) => bedroomLayoutLimits(p, k);
    const bh = lim("bootHeight");
    const ob = lim("ohcBottom");
    const ww = lim("wardrobeWidth");
    const bars = [
      { index: 0, key: "bootHeight", axis: "z", pos: p.bootHeight, min: bh.min, max: bh.max, span: [0, W], front: 20 },
      { index: 1, key: "ohcBottom", axis: "z", pos: p.ohcBottom, min: ob.min, max: ob.max, span: [p.wardrobeWidth, W - p.wardrobeWidth], front: 20 },
      { index: 2, key: "wardrobeWidth", side: -1, axis: "x", pos: p.wardrobeWidth, min: ww.min, max: ww.max, span: [p.bootHeight, H], front: 20 },
      { index: 3, key: "wardrobeWidth", side: 1, axis: "x", pos: round1(W - p.wardrobeWidth), min: W - ww.max, max: W - ww.min, span: [p.bootHeight, H], front: 20 },
    ];
    // Style 1 only: the fixed-panel split. Nook's wardrobe bottom is computed from the boot and does not drag.
    const styleKey = (BEDROOM_WARDROBE_STYLES[p.style] || BEDROOM_WARDROBE_STYLES.style1).layoutKey;
    if (styleKey) {
      const fp = lim(styleKey);
      bars.push(
        { index: 4, key: styleKey, side: -1, axis: "z", pos: p[styleKey], min: fp.min, max: fp.max, span: [0, p.wardrobeWidth], front: 20 },
        { index: 5, key: styleKey, side: 1, axis: "z", pos: p[styleKey], min: fp.min, max: fp.max, span: [W - p.wardrobeWidth, W], front: 20 },
      );
    }
    const ohc = result.layout && result.layout.ohc;
    if (ohc) {
      ohc.zones.slice(0, -1).forEach((zone, i) => {
        const next = ohc.zones[i + 1];
        const start = zone.x0;
        const total = zone.width + next.width;
        bars.push({
          index: bars.length,
          key: "ohcZone",
          zoneIndex: i,
          axis: "x",
          pos: zone.x1,
          min: round1(start + 150),
          max: round1(start + total - 150),
          span: [p.ohcBottom, H],
          front: 20,
        });
      });
    }
    return bars;
  },

  /** Two or three equal up-flap bays across the opening. */
  setOhcCount(params, count) {
    const opening = round1(params.width - 2 * params.wardrobeWidth);
    return { ...params, ohcZones: bedroomEqualOhcZones(opening, count) };
  },

  /** Move the centreline between bay `index` and the next bay to cabinet x. */
  setOhcBoundary(params, index, x) {
    const zones = setBedroomOhcBoundary(params, index, x);
    return zones ? { ...params, ohcZones: zones } : params;
  },

  /** Move bar `index` to local coordinate `pos` (x or z); returns new params with the layout key it drives changed. */
  setDivider(params, result, index, pos) {
    const d = this.dividers(params, result).find((b) => b.index === index);
    if (!d) return params;
    if (d.key === "ohcZone") return this.setOhcBoundary(params, d.zoneIndex, Math.round(pos));
    const W = params.width;
    const value = d.key === "wardrobeWidth" ? (d.side > 0 ? W - pos : pos) : pos;
    return setBedroomLayout(params, d.key, Math.round(value));
  },
  zoneTypes: [],
  benchShape: "bedroom",
};

/**
 * Bed Box: the bed base, attached to the Bedroom body — twelve boards (side
 * panels, end panel, centre divider, four long and four short rails). It
 * stands against the body's room-side face, centred on the van, in the
 * mattress opening: width = the body's bed frame (queen 1508), height = the
 * boot height — both read from the body (`bedroom.bedBoxSize`), never typed
 * here. Only its length into the room is free (default 979, a rule). Placement
 * "bedBox" (interact.js): pull the length into the room, click. `attach` keeps
 * it glued to the body (size and pose) whenever the body or the space changes.
 * Every board is the bed box stock (18, `rules.json`), not the job's carcass.
 */
const bedBox = {
  id: "bedBox",
  label: "Bed Box",
  sub: "bed base",
  placement: "bedBox",
  single: true,
  requires: "bedroom", // usable only once the body exists
  attachesTo: "bedroom", // the body's depth drag ignores it
  handles: [], // no permanent cubes: W and H come from the body
  handlesOnDemand: ["D"], // the panel's "drag in 3D" button shows an arrow for the length
  resizeFaces: ["y-"], // the room end; the body end stays on the body
  defaultSize: { W: BEDROOM_RULES.BED_FRAME_QUEEN_WIDTH_MM.value, D: BED_BOX_RULES.LENGTH_DEFAULT_MM.value, H: BED_BOX_DEFAULT_HEIGHT },
  minSize: { W: BED_BOX_MIN.width, D: BED_BOX_MIN.depth, H: BED_BOX_MIN.height },

  defaults(W, D, H, materials) {
    const { finish } = materialsOf(materials);
    const color = cabinetColor(finish);
    return {
      width: round1(W),
      depth: round1(D),
      height: round1(H),
      panelThickness: BED_BOX_RULES.BOARD_THICKNESS_MM.value,
      frontPanelThickness: 0,
      carcassColor: color.carcassColor,
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      colorSlot: color.colorSlot,
    };
  },
  generate(params, options) {
    return generateBedBox(params, options);
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
   * Glue to the body: width from its bed frame, height from its boot deck, the
   * body-side face of the box at the body's room-side face, centred on the
   * van. Returns { params, pose } or null when there is no body (the box then
   * stays as it is).
   */
  attach(params, pose, { cabinets, resolved }) {
    const body = cabinets.find((c) => c.moduleId === "bedroom");
    if (!body || !resolved) return null;
    const bodyMod = getModule(body.moduleId);
    const bodyD = bodyMod.envelope(body.params).D;
    const size = bodyMod.bedBoxSize(body.params);
    const nextParams = params.width === size.W && params.height === size.H ? params : { ...params, width: size.W, height: size.H };
    const cx = (resolved.bounds.minX + resolved.bounds.maxX) / 2;
    // rotZ 180: local X runs W→0 from pose.x, local Y from the room face (pose.y) toward the body.
    const next = { x: round1(cx + size.W / 2), y: round1(bodyD + params.depth), z: 0, rotZ: 180 };
    const same = pose.x === next.x && pose.y === next.y && pose.z === next.z && (pose.rotZ || 0) === next.rotZ;
    return { params: nextParams, pose: same ? pose : next };
  },

  dividers() { return []; },
  setDivider(params) { return params; },
  zoneTypes: [],
  benchShape: "bedBox",
};

/**
 * Bunk bed across the van: two bunks stacked against the rear wall, wall to
 * wall, as boards: front partition (one per sheet), tunnel boot back and inner
 * sides, lower deck, upper base, two end panels at the cubby, the boot door and
 * its sill. Placement "bunk" (interact.js): a rear floor
 * corner → the lower box on the floor, the rear wall or a side wall (its
 * length locked wall to wall) → the upper base underside. W = length along the
 * rear wall, D = rear wall → room face of the front partition (partition
 * included), H = floor → ceiling minus the clearance. The fronts face the
 * room (rotZ 0 against the back wall), so local X runs left → right seen from
 * the room and `endSide` (ladder + end cubby) is in those terms.
 */
const bunkBed = {
  id: "bunkBed",
  label: "Bunk bed",
  sub: "across the rear",
  placement: "bunk",
  noOrient: "a bunk bed runs wall to wall with its back on the rear wall",
  volumeOnly: true,
  panel: "bunk",
  handles: [],
  resizeFaces: [],
  defaultSize: { W: 2275, D: BUNK_RULES.DEPTH_DEFAULT_MM.value, H: 1961 },
  minSize: bunkMinSize(),

  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish);
    const height = round1(H);
    const deckTop = BUNK_RULES.DECK_TOP_DEFAULT_MM.value;
    return {
      length: round1(W),
      depth: round1(D),
      height,
      deckTop,
      upperZ: bunkUpperLimits({ deckTop, height }).equal,
      endSide: "RIGHT",
      // Front partition: the job's partition stock (thickness and gaps), like the partition walls.
      partitionThickness: thickness(stock, "partition"),
      floorClearance: stock.partition.floorClearance,
      ceilingClearance: stock.partition.ceilingClearance,
      carcassThickness: thickness(stock, "carcass"), // tunnel boot back and inner sides
      doorThickness: thickness(stock, "door"), // end panels and the boot door
      ...color,
      frontPanelThickness: 0, // the front partition is inside the depth
    };
  },
  generate(params, options) {
    return generateBunkBed(params, options);
  },
  benchSwitches: [
    { key: "endSide", label: "梯子一侧", options: [["RIGHT", "右"], ["LEFT", "左"]], get: (p) => p.endSide === "LEFT" ? "LEFT" : "RIGHT", set: (p, v) => ({ ...p, endSide: v }) },
  ],
  envelope(params) {
    return { W: params.length, D: params.depth, H: params.height };
  },
  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) next.length = round1(W);
    if (D != null) next.depth = round1(D);
    if (H != null) next.height = round1(H);
    return next;
  },
  upperLimits(params) {
    return bunkUpperLimits({ deckTop: params.deckTop ?? BUNK_RULES.DECK_TOP_DEFAULT_MM.value, height: params.height });
  },
  /** The box, plus the boot door standing proud of the partition into the room. */
  footprintBoxes(params, result) {
    const door = result?.layout?.bootDoor;
    if (!door || result.validation?.errors?.length) return [];
    return [
      { id: "bunk", x0: 0, x1: params.length, y0: 0, y1: params.depth, z0: 0, z1: params.height },
      { id: "bootDoor", ...door },
    ];
  },
  dividers() { return []; },
  setDivider(params) { return params; },
  zoneTypes: [],
  benchShape: "bunk",
};

/**
 * Bedside table, north-south: a mirrored pair, one against each wall, in
 * front of the body's room face. Width comes from the body: the wardrobe width,
 * the show panel standing under the colour panel. Placement drags the height first — it snaps to the underside
 * of the wardrobe fixed panel — then the depth into the room. `side` says
 * which wall; the show panel is on the bed side.
 */
const bedSideTable = {
  id: "bedSideTable",
  label: "Bed Side Table",
  sub: "pair at the walls",
  placement: "bedSide",
  pair: true,
  requires: "bedroom",
  attachesTo: "bedroom",
  handles: [],
  handlesOnDemand: ["D"],
  // Room face (depth) and top (height). The shelf stays where it is, so a height change goes to the
  // upper zone; `attach` pushes the shelf down once the upper zone reaches its minimum.
  resizeFaces: ["y-", "z+"],
  panel: "bedSide",
  defaultSize: { W: 330, D: BED_SIDE_RULES.DEPTH_DEFAULT_MM.value, H: BEDROOM_RULES.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value },
  minSize: { W: 80, D: 40, H: 200 },

  defaults(W, D, H, materials) {
    const { finish } = materialsOf(materials);
    const color = cabinetColor(finish, "B");
    return {
      width: round1(W),
      depth: round1(D),
      height: round1(H),
      side: "left",
      shelfCenter: round1(H / 2),
      zones: [{ id: "lower", type: "right_door" }, { id: "upper", type: "drawer" }],
      clearance: BED_SIDE_RULES.CLEARANCE_MM.value,
      panelThickness: BED_SIDE_RULES.BOARD_THICKNESS_MM.value,
      doorPanelThickness: BED_SIDE_RULES.DOOR_THICKNESS_MM.value,
      carcassColor: color.carcassColor,
      carcassColorName: color.carcassColorName,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      colorSlot: color.colorSlot,
    };
  },
  generate(params, options) { return generateBedSideTable(params, options); },
  benchSwitches: [
    { key: "side", label: "靠床一侧", options: [["left", "左"], ["right", "右"]], get: (p) => p.side === "right" ? "right" : "left", set: (p, v) => ({ ...p, side: v }) },
    { key: "lower", label: "下层", options: [["left_door", "左开门"], ["right_door", "右开门"], ["drawer", "抽屉"]], get: (p) => p.zones?.[0]?.type || "left_door", set: (p, v) => { const zones = (p.zones || [{}, {}]).map((z) => ({ ...z })); zones[0] = { ...(zones[0] || {}), type: v }; return { ...p, zones }; } },
    { key: "upper", label: "上层", options: [["drawer", "抽屉"], ["left_door", "左开门"], ["right_door", "右开门"]], get: (p) => p.zones?.[1]?.type || "drawer", set: (p, v) => { const zones = (p.zones || [{}, {}]).map((z) => ({ ...z })); zones[1] = { ...(zones[1] || {}), type: v }; return { ...p, zones }; } },
  ],
  frontView(result) { return generateBedSideSvg(result); },
  envelope(params) { return { W: params.width, D: params.depth, H: params.height }; },
  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) next.width = round1(W);
    if (D != null) next.depth = round1(D);
    if (H != null) next.height = round1(H);
    return next;
  },
  sizeFor(bodyParams) {
    return {
      /** Carcass + the show panel under the wardrobe's colour panel = the wardrobe width. */
      W: round1(bodyParams.wardrobeWidth),
      /** The show panel matches the colour panel above it. */
      door: round1(bodyParams.doorPanelThickness || BED_SIDE_RULES.DOOR_THICKNESS_MM.value),
      H: round1((bodyParams.bootHeight ?? BEDROOM_RULES.BOOT_HEIGHT_DEFAULT_MM.value) + BEDROOM_RULES.WARDROBE_FLOOR_RAISE_MM.value),
      /** Underside of the Style 1 fixed panel: the wardrobe floor the panel sits on. Height drag snaps here. */
      snapH: round1((bodyParams.bootHeight ?? BEDROOM_RULES.BOOT_HEIGHT_DEFAULT_MM.value) + BEDROOM_RULES.WARDROBE_FLOOR_RAISE_MM.value),
    };
  },
  attach(params, pose, { cabinets, resolved }) {
    const body = cabinets.find((c) => c.moduleId === "bedroom");
    if (!body || !resolved) return null;
    const { W, door } = this.sizeFor(body.params);
    const H = params.height;
    const D = params.depth;
    const side = params.side === "right" ? "right" : "left";
    const bodyD = getModule(body.moduleId).envelope(body.params).D;
    const nextPose = side === "left"
      ? { x: round1(resolved.bounds.minX + W), y: round1(bodyD + D), z: 0, rotZ: 180 }
      : { x: round1(resolved.bounds.maxX), y: round1(bodyD + D), z: 0, rotZ: 180 };
    const lim = bedSideShelfLimits({ height: H, clearance: params.clearance, panelThickness: params.panelThickness });
    const shelfCenter = round1(Math.max(lim.min, Math.min(lim.max, params.shelfCenter ?? H / 2)));
    const sameParams = params.width === W && params.height === H && params.shelfCenter === shelfCenter && params.side === side && params.doorPanelThickness === door;
    const samePose = pose.x === nextPose.x && pose.y === nextPose.y && pose.z === nextPose.z && (pose.rotZ || 0) === 180;
    return {
      params: sameParams ? params : { ...params, width: W, height: H, shelfCenter, side, doorPanelThickness: door },
      pose: samePose ? pose : nextPose,
    };
  },
  /** Copy the shared shelf, depth and clearance onto the other table, flipping door hands. */
  mirrorParams(source, twin) {
    const zones = (source.zones || []).map((z) => ({ id: z.id, type: mirrorBedSideZone(z.type) }));
    const colourKeys = ["doorColor", "doorColorName", "doorColorB", "doorColorNameB", "colorSlot"];
    const colourSame = colourKeys.every((k) => twin[k] === source[k]);
    const same = twin.shelfCenter === source.shelfCenter && twin.depth === source.depth && twin.height === source.height && twin.clearance === source.clearance
      && JSON.stringify(twin.zones) === JSON.stringify(zones) && colourSame;
    if (same) return twin;
    const colour = {};
    for (const k of colourKeys) if (source[k] !== undefined) colour[k] = source[k];
    return { ...twin, ...colour, shelfCenter: source.shelfCenter, depth: source.depth, height: source.height, clearance: source.clearance, zones };
  },
  dividers(params, result) {
    if (!result || result.validation?.errors?.length) return [];
    const lim = bedSideShelfLimits(result.params);
    return [{ index: 0, key: "shelfCenter", axis: "z", pos: result.params.shelfCenter, min: lim.min, max: lim.max, span: [0, result.params.width], front: 20 }];
  },
  setDivider(params, _result, _index, pos) {
    const lim = bedSideShelfLimits(params);
    const shelfCenter = round1(Math.max(lim.min, Math.min(lim.max, Math.round(pos))));
    if (shelfCenter === params.shelfCenter) return params;
    return { ...params, shelfCenter };
  },
  zoneTypes: [
    { id: "drawer", label: "Drawer" },
    { id: "wall", label: "Door · hinge at the wall" },
    { id: "bed", label: "Door · hinge at the bed" },
  ],
  benchShape: "bedSide",
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
  defaultSize: { W: 1200, D: 400, H: 425 },
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
      ledGroove: false, // a new overhead starts with the T3 groove off; an older cabinet with no value still grooves (the generator treats a missing flag as on)
      carcassColor: color.carcassColor,
      carcassColorName: color.carcassColorName,
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      colorSlot: color.colorSlot,
      zones: [{ id: "zone-1", type: "up_flap", width: round1(W) }],
    };
  },

  generate(params, options) {
    return generateOverheadCabinet(params, options);
  },

  /**
   * Generator Rules: the overall inputs, grouped as a cabinetmaker reads them.
   * `sym` is the name formulas use; `source` says where the number comes from
   * (this cabinet, the job's material catalogue, a generator rule default).
   */
  benchInputs: [
    { group: "柜体尺寸", fields: [
      { key: "cabinetWidth", sym: "Cw", label: "柜宽", source: "柜体" },
      { key: "cabinetDepth", sym: "Cd", label: "柜身深度（不含门）", source: "柜体" },
      { key: "cabinetHeight", sym: "H", label: "柜高", source: "柜体" },
    ] },
    { group: "材料", fields: [
      { key: "featureWidth", sym: "CPT", label: "柜身板厚", source: "材料", rule: "DIVIDER_THICKNESS_MM" },
      { key: "frontPanelThickness", sym: "FPT", label: "门板厚", source: "材料", rule: "DEFAULT_FRONT_PANEL_THICKNESS_MM" },
    ] },
    { group: "预留", fields: [
      { key: "topClearanceHeight", sym: "TCH", label: "顶部预留", source: "规则默认", rule: "T1_HEIGHT_MM" },
      { key: "clearance", sym: "clearance", label: "门缝", source: "规则默认", rule: "DEFAULT_CLEARANCE_MM" },
    ] },
    { group: "分区", kind: "zones" },
    { group: "选项", fields: [
      { key: "style", label: "样式", kind: "select", options: [["style_1", "样式 1"], ["style_2", "样式 2"]] },
      { key: "ledGroove", label: "T3 LED 灯槽", kind: "bool", default: true },
      { key: "hingeHoleDiameter", label: "铰链杯直径", source: "规则默认", rule: "DEFAULT_HINGE_HOLE_DIAMETER_MM" },
      { key: "hingeHoleDepth", label: "铰链杯深", source: "规则默认", rule: "DEFAULT_HINGE_HOLE_DEPTH_MM" },
      { key: "hingeHoleFromTop", label: "杯孔距顶", source: "规则默认", rule: "DEFAULT_HINGE_HOLE_FROM_TOP_MM" },
      { key: "hingeHoleFromSide", label: "杯孔距侧", source: "规则默认", rule: "DEFAULT_HINGE_HOLE_FROM_SIDE_MM" },
    ] },
    { group: "油烟机 NCE", fields: [
      { key: "rangehoodClearHeight", sym: "rangehoodClearHeight", label: "净空高度", source: "规则默认", rule: "RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM" },
      { key: "rangehoodEdgeOffsetX", sym: "rangehoodEdgeOffsetX", label: "开孔距侧", source: "规则默认", rule: "RANGEHOOD_MIN_EDGE_MM" },
      { key: "rangehoodAlignment", label: "开孔靠", kind: "select", options: [["left", "左侧"], ["right", "右侧"]] },
    ] },
  ],
  benchSwitches: [
    { key: "style", label: "样式", options: [["style_1", "样式 1"], ["style_2", "样式 2"]], get: (p) => p.style === "style_2" ? "style_2" : "style_1", set: (p, v) => ({ ...p, style: v }) },
    { key: "ledGroove", label: "灯槽", options: [["on", "开"], ["off", "关"]], get: (p) => p.ledGroove === false ? "off" : "on", set: (p, v) => ({ ...p, ledGroove: v === "on" }) },
    { key: "rangehoodAlignment", label: "油烟机靠", options: [["left", "左侧"], ["right", "右侧"]], get: (p) => p.rangehoodAlignment === "right" ? "right" : "left", set: (p, v) => ({ ...p, rangehoodAlignment: v }) },
  ],

  /**
   * 2D front elevation (SVG markup) from the last generation, in the kitchen's look: boards on the
   * dark ground, openings on the edges, `selectedZoneIndex` washed blue, the number under each zone typed in the panel.
   */
  frontView(result, { selectedZoneIndex = -1, gaps = "clear" } = {}) {
    if (!result?.boards?.length) return null;
    return generateOHCFrontView(result, { selectedZoneIndex, showDimensions: true, gaps });
  },

  /** Per zone: stored span (boundary to boundary), clearance (face to face) and centre to centre, from the emitted boards. */
  zoneOpenings(result) {
    return result?.boards?.length ? ohcZoneOpenings(result) : [];
  },

  /**
   * The outer box. An end panel (`endPanel` left | right, door stock outside the end
   * divider — a converted partition) is inside W; the carcass frame does not move,
   * so on the left the box starts at −FPT.
   */
  envelope(params) {
    return { W: round1(params.cabinetWidth + overheadEndPanelThickness(params)), D: params.cabinetDepth, H: params.cabinetHeight };
  },

  localBox(params) {
    const env = this.envelope(params);
    const fpt = params.frontPanelThickness ?? 16;
    const x0 = params.endPanel === "left" ? -overheadEndPanelThickness(params) : 0;
    return { x0, x1: round1(x0 + env.W), y0: -fpt, y1: env.D, z0: 0, z1: env.H, W: env.W, D: env.D, H: env.H, fpt };
  },

  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) {
      next.cabinetWidth = round1(W - overheadEndPanelThickness(params));
      next.zones = fitZoneWidths(params.zones || [], next.cabinetWidth);
    }
    if (D != null) next.cabinetDepth = round1(D);
    if (H != null) next.cabinetHeight = round1(H);
    return next;
  },

  /** Hung on the ceiling against a wall: the top and the back stay. */
  resizeFaces: ["x-", "x+", "y-", "z-"],
  /** Side faces: a pull adds an up-flap bay (once it is MIN_ZONE_WIDTH), a push trims the end bay and merges one too narrow. */
  resizeFace(params, side, size) {
    if (side.axis !== "x") return this.setEnvelope(params, { [DIM_OF_AXIS[side.axis]]: size });
    const zones = params.zones || [];
    const ep = overheadEndPanelThickness(params);
    const next = resizeRow(zones, side, size - (params.cabinetWidth + ep), {
      key: "width",
      min: MIN_ZONE_WIDTH,
      make: (width) => ({ id: freshId("zone-", zones.map((z) => z.id)), type: "up_flap", width }),
    });
    return next ? { ...params, cabinetWidth: round1(size - ep), zones: next } : null;
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
    { id: "rangehood_flap", label: "Range hood", short: "Hood" },
  ],
};

const uShapeOverheadCabinet = {
  id: "uShapeOverheadCabinet",
  label: "U overhead",
  sub: "three runs",
  placement: "ceiling",
  noOrient: true,
  growsDown: true,
  panel: "uShape",
  defaultSize: { W: 2400, D: 1500, H: 400 },
  minSize: { W: 1200, D: 700, H: 200 },
  zoneTypes: overheadCabinet.zoneTypes.filter((t) => t.id !== "rangehood_flap"),
  sideZoneTypes: overheadCabinet.zoneTypes,

  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish);
    return {
      totalWidth: round1(W),
      leftArmLength: round1(D),
      rightArmLength: round1(D),
      cabinetDepth: 400,
      cabinetHeight: round1(H),
      sideClearance: 50,
      featureWidth: thickness(stock, "carcass"),
      frontPanelThickness: thickness(stock, "door"),
      topClearanceHeight: 40,
      clearance: 2.5,
      ledGroove: false,
      carcassColor: color.carcassColor,
      carcassColorName: color.carcassColorName,
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      colorSlot: color.colorSlot,
      rangehoodClearHeight: 75,
      rangehoodAlignment: "left",
      rangehoodEdgeOffsetX: 40,
      zones: {
        LEFT: [{ id: "LEFT-1", type: "up_flap", width: 1 }],
        BACK: [{ id: "BACK-1", type: "up_flap", width: 1 }],
        RIGHT: [{ id: "RIGHT-1", type: "up_flap", width: 1 }],
      },
    };
  },

  generate(params, options) {
    return generateUShapeOverhead(params, options);
  },
  benchSwitches: [
    { key: "ledGroove", label: "灯槽", options: [["off", "关"], ["on", "开"]], get: (p) => p.ledGroove === true ? "on" : "off", set: (p, v) => ({ ...p, ledGroove: v === "on" }) },
    { key: "rangehoodAlignment", label: "油烟机靠", options: [["left", "左侧"], ["right", "右侧"]], get: (p) => p.rangehoodAlignment === "right" ? "right" : "left", set: (p, v) => ({ ...p, rangehoodAlignment: v }) },
  ],

  envelope(params) {
    return {
      W: params.totalWidth,
      D: Math.max(params.leftArmLength || 0, params.rightArmLength || 0),
      H: params.cabinetHeight,
    };
  },

  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) next.totalWidth = round1(W);
    if (D != null) { next.leftArmLength = round1(D); next.rightArmLength = round1(D); }
    if (H != null) next.cabinetHeight = round1(H);
    return next;
  },

  resizeFaces: ["x-", "x+", "y-", "z-"],
  resizeFace(params, side, size) {
    if (side.axis === "x") return this.setEnvelope(params, { W: size });
    if (side.axis === "y") return this.setEnvelope(params, { D: size });
    if (side.axis === "z") return this.setEnvelope(params, { H: size });
    return null;
  },

  dividers() { return []; },
  benchShape: "uShape",
};

/**
 * Kitchen base cabinet（厨房底柜）— 列 × 区两级布局。
 * 坐标契约与生成器一致：y=0 前缘（门板悬于 y∈[−FPT,0]）。
 * 默认单列 left_door（无中间 V 板 → 无双侧半槽冲突）。
 */
const BASE_ZONE_TYPES = [
  { id: "left_door", label: "Door · hinge left" },
  { id: "right_door", label: "Door · hinge right" },
  { id: "double_door", label: "Double door" },
  { id: "drawer", label: "Drawer" },
  { id: "open", label: "Open" },
  { id: "down_flap", label: "Down flap" },
  { id: "custom", label: "Custom" },
];

/** Floor base run: kitchen or ensuite. Both use the kitchen generator; the box depth includes the door. */
export function isBaseCabinet(moduleId) {
  return moduleId === "kitchenCabinet" || moduleId === "ensuiteCabinet";
}

function kitchenEndColumn(params, side) {
  const cols = params?.columns || [];
  return side === "left" ? cols[0] : cols[cols.length - 1];
}
function kitchenSideFront(params, side) {
  const col = kitchenEndColumn(params, side);
  const key = side === "left" ? "leftSidePanelOptions" : "rightSidePanelOptions";
  const zone = (col?.zones || []).find((z) => z[key]) || col?.zones?.[0];
  return zone?.[key]?.frontVisible === true;
}
function kitchenSetSideFront(params, side, on) {
  const next = structuredClone(params);
  const col = kitchenEndColumn(next, side);
  if (!col?.zones?.length) return next;
  const key = side === "left" ? "leftSidePanelOptions" : "rightSidePanelOptions";
  const zone = col.zones.find((z) => ["left_door", "right_door", "double_door", "drawer", "down_flap"].includes(z.zoneType)) || col.zones[0];
  zone[key] = { ...(zone[key] || {}), panelType: on ? "door" : "carcass", frontVisible: on };
  return next;
}

const kitchenCabinet = {
  id: "kitchenCabinet",
  label: "Kitchen",
  sub: "base run · stove",
  panel: "kitchen", // wide right-hand editor: front elevation (columns × zones)
  defaultSize: { W: 887, D: 270, H: 880 },
  minSize: { W: 300, D: 250, H: 400 },

  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish, "B");
    const bench = benchTopColor(finish);
    const bch = 70;
    const rise = KITCHEN_RULES.BENCH_THICKNESS_MM.value;
    const carcassH = round1(Math.max(H - rise, bch + MIN_ZONE_HEIGHT));
    return {
      globalSettings: { length: round1(W), depth: round1(D), height: carcassH },
      benchTopColor: bench.name,
      benchTopColorName: bench.name,
      materialThickness: thickness(stock, "carcass"),
      frontThickness: thickness(stock, "door"),
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      colorSlot: color.colorSlot,
      bottomClearanceHeight: bch,
      bottomClearanceStyle: "style_1",
      frontClearance: 2.5,
      lockEnabled: true,
      columns: [
        {
          id: "c1",
          width: round1(W),
          zones: [{ id: "z1", height: round1(carcassH - bch), zoneType: "left_door" }],
        },
      ],
      wheelAvoidances: [],
      vPanelMachiningPreferences: [],
    };
  },

  generate(params, options) {
    return generateKitchenCabinet(params, options);
  },

  /** 2D front elevation (SVG markup) from the last generation; `selectedZoneId` is outlined. */
  frontView(result, { selectedZoneId = null, selectedCol = -1, gaps = "clear" } = {}) {
    return generateKitchenSvgPreview(result, { selectedZoneId, selectedCol, showDimensions: true, gaps });
  },

  envelope(params) {
    const gs = params.globalSettings || {};
    const fall = kitchenWaterfall(params) ? KITCHEN_RULES.BENCH_THICKNESS_MM.value : 0;
    return { W: (gs.length || 0) + fall, D: gs.depth, H: (gs.height || 0) + kitchenBenchRise(params) };
  },

  /**
   * The drawn box. The height includes the bench top. A waterfall's 25 mm
   * is inside the width; the carcass sits inboard of it. The front still
   * grows by the bench overhang.
   */
  localBox(params) {
    const env = this.envelope(params);
    const fpt = params.frontPanelThickness ?? 16;
    const door = Number(params.frontThickness);
    const doorT = Number.isFinite(door) && door > 0 ? door : fpt;
    const bench = !!(params && (params.benchTopColorName || params.benchTopColor));
    const over = bench ? KITCHEN_RULES.BENCH_FRONT_OVERHANG_MM.value : 0;
    return {
      x0: 0, x1: env.W,
      y0: bench ? -(doorT + over) : -fpt,
      y1: env.D,
      z0: 0, z1: env.H,
      W: env.W, D: env.D, H: env.H, fpt,
    };
  },

  setEnvelope(params, { W, D, H }, opts = {}) {
    const next = structuredClone(params);
    const gs = next.globalSettings;
    const rise = kitchenBenchRise(next);
    const fall = kitchenWaterfall(next) ? KITCHEN_RULES.BENCH_THICKNESS_MM.value : 0;
    if (W != null) {
      const carcass = round1(W - fall);
      const delta = round1(carcass - gs.length);
      gs.length = carcass;
      next.wheelAvoidances = (next.wheelAvoidances || []).map((a) =>
        /^wa-\d+-[LR]$/.test(String(a.id)) ? a : { ...a, x0: 0, x1: carcass },
      );
      const cols = next.columns || [];
      if (cols.length === 1) {
        cols[0].width = carcass;
      } else if (cols.length && opts.column != null && cols[opts.column]) {
        const w = round1((cols[opts.column].width || 0) + delta);
        if (w < MIN_ZONE_WIDTH) return null;
        cols[opts.column].width = w;
      } else if (cols.length) {
        const fitted = fitZoneWidths(cols, carcass);
        if (!fitted) return null;
        next.columns = fitted;
      }
    }
    if (D != null) gs.depth = round1(D);
    if (H != null) {
      const carcassH = round1(H - rise);
      gs.height = carcassH;
      const bch = next.bottomClearanceHeight ?? 70;
      const zoneSum = round1(carcassH - bch);
      // 各列区和按原比例缩放到新的柜身高 − BCH
      for (const col of next.columns ?? []) {
        const oldSum = (col.zones ?? []).reduce((a, z) => a + (z.height || 0), 0);
        if (oldSum > 0 && (col.zones ?? []).length) {
          let acc = 0;
          for (let i = 0; i < col.zones.length; i++) {
            const isLast = i === col.zones.length - 1;
            const h = isLast ? round1(zoneSum - acc) : round1((col.zones[i].height / oldSum) * zoneSum);
            col.zones[i].height = h;
            acc = round1(acc + h);
          }
        }
      }
    }
    return next;
  },

  dividers() {
    return [];
  },

  resizeFaces: ["x-", "x+", "y-", "y+", "z+"],
  /**
   * Side faces: a pull adds a door column, unless a column was chosen — then
   * that column takes the whole change. Top face: the same on every column's
   * top zone. Height is the outer height, bench top included.
   */
  resizeFace(params, side, size, opts = {}) {
    const gs = params.globalSettings || {};
    if (side.axis === "y") return this.setEnvelope(params, { D: size });
    const columns = params.columns || [];
    if (side.axis === "x") {
      if (opts.column != null) return this.setEnvelope(params, { W: size }, { column: opts.column });
      const fall = kitchenWaterfall(params) ? KITCHEN_RULES.BENCH_THICKNESS_MM.value : 0;
      const zoneH = round1((gs.height ?? 0) - (params.bottomClearanceHeight ?? 70));
      const next = resizeRow(columns, side, size - ((gs.length ?? 0) + fall), {
        key: "width",
        min: MIN_ZONE_WIDTH,
        make: (width) => ({ id: freshId("c", columns.map((c) => c.id)), width, zones: [{ id: "z1", height: zoneH, zoneType: side.dir < 0 ? "left_door" : "right_door" }] }),
      });
      return next ? { ...params, globalSettings: { ...gs, length: round1(size - fall) }, columns: next } : null;
    }
    const rise = kitchenBenchRise(params);
    const delta = size - ((gs.height ?? 0) + rise);
    const next = [];
    for (const col of columns) {
      const zones = col.zones || [];
      const z = resizeStack(zones, delta, {
        key: "height",
        min: MIN_ZONE_HEIGHT,
        make: (height) => ({ id: freshId("z", zones.map((zn) => zn.id)), height, zoneType: "left_door" }),
      });
      if (!z) return null;
      next.push({ ...col, zones: z });
    }
    return { ...params, globalSettings: { ...gs, height: round1((gs.height ?? 0) + delta) }, columns: next };
  },

  /** Column boundary `index` (between columns index / index+1) moves to local x = pos; the two columns trade width. */
  setDivider(params, result, index, pos) {
    const columns = (params.columns || []).map((c) => ({ ...c }));
    const left = columns[index];
    const right = columns[index + 1];
    if (!left || !right) return params;
    const inset = kitchenWaterfall(params) === "left" ? KITCHEN_RULES.BENCH_THICKNESS_MM.value : 0;
    const x0 = inset + columns.slice(0, index).reduce((s, c) => s + (c.width || 0), 0);
    const total = round1((left.width || 0) + (right.width || 0));
    const x = Math.max(x0 + MIN_ZONE_WIDTH, Math.min(x0 + total - MIN_ZONE_WIDTH, Math.round(pos)));
    left.width = round1(x - x0);
    right.width = round1(total - left.width);
    return { ...params, columns };
  },

  /**
   * Zone boundary inside a column: `zoneIndex` is the upper zone (zones are
   * declared top → bottom); pos is the boundary's new absolute z. The upper
   * zone gives or takes the difference from the zone below.
   */
  setZoneDivider(params, result, colIndex, zoneIndex, pos) {
    const col = (params.columns || [])[colIndex];
    if (!col) return params;
    const resCol = result?.debug?.columns?.[colIndex];
    const upper = col.zones?.[zoneIndex];
    const lower = col.zones?.[zoneIndex + 1];
    const resUpper = resCol?.zones?.[zoneIndex];
    const resLower = resCol?.zones?.[zoneIndex + 1];
    if (!upper || !lower || !resUpper || !resLower) return params;
    const z = Math.max(resLower.z0 + MIN_ZONE_HEIGHT, Math.min(resUpper.z1 - MIN_ZONE_HEIGHT, Math.round(pos)));
    const columns = params.columns.map((c, i) => (i === colIndex ? { ...c, zones: c.zones.map((zn) => ({ ...zn })) } : c));
    const u = columns[colIndex].zones[zoneIndex];
    const l = columns[colIndex].zones[zoneIndex + 1];
    u.height = round1(resUpper.z1 - z);
    l.height = round1(z - resLower.z0);
    return { ...params, columns };
  },

  zoneTypes: [
    ...BASE_ZONE_TYPES.slice(0, -1),
    { id: "stove", label: "Stove" },
    BASE_ZONE_TYPES[BASE_ZONE_TYPES.length - 1],
  ],

  /** Generator Rules: existing parameters only. Face formulas stay in the generator. */
  benchShape: "base",
  benchInputs: [
    { group: "柜体尺寸", fields: [
      { key: "globalSettings.length", sym: "L", label: "柜宽", source: "柜体" },
      { key: "globalSettings.depth", sym: "D", label: "柜深（含门）", source: "柜体" },
      { key: "globalSettings.height", sym: "H", label: "柜高", source: "柜体" },
    ] },
    { group: "材料", fields: [
      { key: "materialThickness", sym: "CPT", label: "柜身板厚", source: "材料" },
      { key: "frontThickness", sym: "FPT", label: "门板厚", source: "材料" },
      { key: "frontClearance", sym: "clearance", label: "门缝", source: "柜体" },
    ] },
    { group: "踢脚", fields: [
      { key: "bottomClearanceHeight", sym: "BCH", label: "踢脚高度", source: "柜体" },
      { key: "bottomClearanceStyle", label: "踢脚", kind: "select", options: [["style_1", "内凹"], ["style_2", "齐平"]] },
    ] },
    { group: "列和行", kind: "columns" },
  ],
  /**
   * Switches already on this cabinet. The bench shows one only when flipping
   * it changes the face being edited.
   */
  benchSwitches: [
    {
      key: "bottomClearanceStyle", label: "踢脚",
      options: [["style_1", "内凹"], ["style_2", "齐平"]],
      get: (p) => p.bottomClearanceStyle || "style_1",
      set: (p, v) => ({ ...p, bottomClearanceStyle: v }),
    },
    {
      key: "leftFront", label: "左侧板",
      options: [["door", "门板"], ["carcass", "柜身"]],
      get: (p) => kitchenSideFront(p, "left") ? "door" : "carcass",
      set: (p, v) => kitchenSetSideFront(p, "left", v === "door"),
    },
    {
      key: "rightFront", label: "右侧板",
      options: [["door", "门板"], ["carcass", "柜身"]],
      get: (p) => kitchenSideFront(p, "right") ? "door" : "carcass",
      set: (p, v) => kitchenSetSideFront(p, "right", v === "door"),
    },
  ],
};

/**
 * Ensuite vanity: the same base carcass as Kitchen. No stove — a stove zone
 * is a generator error, not rewritten as a door. Default size matches Kitchen
 * until a vanity size is chosen.
 */
const ensuiteCabinet = {
  ...kitchenCabinet,
  id: "ensuiteCabinet",
  label: "Ensuite",
  sub: "vanity · no stove",
  zoneTypes: BASE_ZONE_TYPES,
  generate(params, options) {
    return generateKitchenCabinet({ ...params, baseKind: "ensuite" }, options);
  },
};

/**
 * Ensuite as drawn: the two ensuite cabinets copied board by board from the
 * Fusion model (generators/ensuiteDrawing/drawing.json). A fixed reference, not
 * a formula: no resizing, no zones. Not placed freely: the rail's "Ensuite
 * sample" puts both where the model has them, at the rear of a van like the
 * model's (ENSUITE_SAMPLE, `placeEnsuiteSample` in interact.js).
 */
function ensuiteDrawingModule(id, part, label, sub) {
  const size = ensuiteDrawingSize(part);
  return {
    id,
    label,
    sub,
    panel: "drawing",
    part,
    /** Not armed from the rail on its own: only the ensuite sample places it. */
    sample: "ensuite",
    fixedSize: { ...size },
    defaultSize: { ...size },
    minSize: { ...size },
    handles: [],
    resizeFaces: [],
    defaults(_W, _D, _H, materials) {
      const { finish } = materialsOf(materials);
      const color = cabinetColor(finish, "B");
      return {
        part,
        carcassColor: color.carcassColor,
        carcassColorName: color.carcassColorName,
        doorSeries: color.doorSeries,
        doorSides: color.doorSides,
        doorColor: color.doorColor,
        doorColorName: color.doorColorName,
        colorSlot: color.colorSlot,
      };
    },
    generate(params, options) {
      return generateEnsuiteDrawing({ ...params, part }, options);
    },
    envelope() {
      return { ...ensuiteDrawingSize(part) };
    },
    /** Fixed as drawn: a size change is refused (the params come back unchanged). */
    setEnvelope(params) {
      return params;
    },
    dividers() {
      return [];
    },
  };
}
const ensuiteDrawingLower = ensuiteDrawingModule("ensuiteDrawingLower", "lower", "Ensuite lower · drawn", "lower cabinet · as in Fusion");
const ensuiteDrawingTall = ensuiteDrawingModule("ensuiteDrawingTall", "tall", "Ensuite tall · drawn", "through cabinet · as in Fusion");

/**
 * Where the Fusion model (Main_Design_second_van) has the ensuite, in a space like the model's:
 * 2275 wide, 1965 high at the rear. Both stand with their backs on the rear wall (doors facing
 * forward); `x` = from the left wall (space minX). The tall's open side (80 filler) is on the left wall.
 */
export const ENSUITE_SAMPLE = {
  id: "ensuite",
  width: 2275,
  height: 1965,
  parts: [
    { moduleId: "ensuiteDrawingTall", x: 0 },
    { moduleId: "ensuiteDrawingLower", x: 523 },
  ],
};

/** The tall generator's door thickness: frontPanelThickness > frontFaceAllowance > doorPanelThickness > 16. */
function tallDoorThickness(p) {
  return p.frontPanelThickness ?? p.frontFaceAllowance ?? p.doorPanelThickness ?? 16;
}

const hasFridge = (params) => (params?.zones || []).some((z) => z.type === "fridge");
const TALL_STORAGE_PRESETS = GT_UI_PRESETS.filter((pr) => !hasFridge(pr.params));
const TALL_FRIDGE_PRESETS = GT_UI_PRESETS.filter((pr) => hasFridge(pr.params));

function tallSideValue(p, side) {
  const t = Number(side === "left" ? p.leftSidePanelThickness : p.rightSidePanelThickness) || 0;
  if (!(t > 0)) return "none";
  const finish = side === "left" ? p.leftSidePanelFinish : p.rightSidePanelFinish;
  return finish === "colour" ? "colour" : "carcass";
}
function tallSetSide(p, side, v) {
  const next = { ...p };
  const tk = side === "left" ? "leftSidePanelThickness" : "rightSidePanelThickness";
  const fk = side === "left" ? "leftSidePanelFinish" : "rightSidePanelFinish";
  if (v === "none") { next[tk] = 0; return next; }
  if (!(Number(next[tk]) > 0)) next[tk] = next.panelThickness || 16;
  next[fk] = v === "colour" ? "colour" : "carcass";
  return next;
}
const TALL_BENCH_SWITCHES = [
  { key: "leftSide", label: "左侧板", options: [["none", "无"], ["carcass", "柜身"], ["colour", "门板色"]], get: (p) => tallSideValue(p, "left"), set: (p, v) => tallSetSide(p, "left", v) },
  { key: "rightSide", label: "右侧板", options: [["none", "无"], ["carcass", "柜身"], ["colour", "门板色"]], get: (p) => tallSideValue(p, "right"), set: (p, v) => tallSetSide(p, "right", v) },
  { key: "ledGroove", label: "灯槽", options: [["off", "关"], ["on", "开"]], get: (p) => p.ledGroove === true ? "on" : "off", set: (p, v) => ({ ...p, ledGroove: v === "on" }) },
];

const generalTallCabinet = {
  id: "generalTallCabinet",
  label: "Storage",
  sub: "tall · outer width fixed",
  /** A tall saved with a fridge zone (before the split) opens as a fridge cabinet. */
  moduleIdFor(params) {
    return hasFridge(params) ? "tallFridgeCabinet" : "generalTallCabinet";
  },
  panel: "tall", // wide right-hand editor: front elevation + zone card
  defaultSize: { W: 600, D: 568, H: 2000 }, // carcass 568 + 16 doors = cabinetDepth 584
  // A narrow pantry beside the fridge (e.g. 374 wide, back on the side wall) must fit; the generator builds down to 250.
  minSize: { W: 300, D: 350, H: 800 },
  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish, "B");
    const base = {
      cabinetWidth: W,
      // The box's D stops at the carcass front (like every module); cabinetDepth also holds the doors.
      cabinetDepth: round1(D + thickness(stock, "door")),
      cabinetHeight: H,
      panelThickness: thickness(stock, "carcass"),
      frontPanelThickness: thickness(stock, "door"),
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      colorSlot: color.colorSlot,
      topSystem: { style: "style_1", frontRailHeight: 40 },
      bottomSystem: { style: "style_1", frontRailHeight: 53 },
    };
    // The stack must sum to exactly H: boards anchored to a zone top (VD, fronts)
    // pierce the top system when zones overflow, and float when they underflow.
    // Try 3 / 2 / 1 zones; keep the first candidate whose slack zone still gets
    // its 300 mm minimum without fitTallCabinetHeight pushing the height back up.
    const zoneSets = [
      [
        { id: "zone-1", type: "side_door", height: Math.max(200, Math.round(H * 0.3)) },
        { id: "zone-2", type: "drawer", height: 300 },
        { id: "zone-3", type: "double_door", height: 300, verticalDivider: true },
      ],
      [
        { id: "zone-1", type: "side_door", height: Math.max(200, Math.round(H * 0.35)) },
        { id: "zone-2", type: "double_door", height: 300, verticalDivider: true },
      ],
      [{ id: "zone-1", type: "double_door", height: 300, verticalDivider: true }],
    ];
    for (const zones of zoneSets) {
      const fitted = fitTallCabinetHeight({ ...base, zones }, H);
      if (fitted.cabinetHeight <= H + 0.05) return { ...fitted, cabinetHeight: H };
    }
    return fitTallCabinetHeight({ ...base, zones: zoneSets[2] }, H);
  },
  generate(params, options) {
    return generateGeneralTall(params, options);
  },
  benchSwitches: TALL_BENCH_SWITCHES,

  /** Named cabinets from generators/generalTall/presets.json (`ui: true`, no fridge); every board is pinned there. */
  presets: TALL_STORAGE_PRESETS,
  /** The preset's params in full; the cabinet keeps its colours (job catalogue) and grain choice. */
  applyPreset(params, presetId) {
    return tallPresetParams(TALL_STORAGE_PRESETS, params, presetId);
  },
  /** Id of the preset these params still equal (colours aside), or null once anything was edited. */
  presetOf(params) {
    return tallPresetOf(TALL_STORAGE_PRESETS, params);
  },

  /** 2D front elevation (SVG markup) from the last generation; `selectedZoneId` is outlined. */
  frontView(result, { selectedZoneId = null, gaps = "clear" } = {}) {
    return generateGTSvgPreview(result, { selectedZoneId, showDimensions: true, gaps });
  },

  /** D = carcass front to back (the box stops at the carcass front; doors hang in front of it). */
  envelope(params) {
    return { W: params.cabinetWidth, D: round1(params.cabinetDepth - tallDoorThickness(params)), H: params.cabinetHeight };
  },
  /**
   * Repair stored params on load: the zone stack must sum to cabinetHeight,
   * else zone-anchored boards (VD, fronts) pierce or float off the top system.
   * fitTallCabinetHeight is idempotent on already-fitted params.
   */
  normalizeParams(params) {
    return params?.zones?.length ? fitTallCabinetHeight(params, params.cabinetHeight ?? 2000) : params;
  },
  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) next.cabinetWidth = round1(W);
    if (D != null) next.cabinetDepth = round1(D + tallDoorThickness(params));
    if (H != null) return fitTallCabinetHeight(next, round1(H));
    return next;
  },

  resizeFaces: ["x-", "x+", "y-", "y+", "z+"],
  /** Top face: every zone keeps its share of the stack. Null when a zone would fall under its minimum. */
  resizeFace(params, side, size) {
    if (side.axis !== "z") return this.setEnvelope(params, { [DIM_OF_AXIS[side.axis]]: size });
    const zones = params.zones || [];
    const sum = zones.reduce((s, z) => s + (z.height || 0), 0);
    const target = round1(sum + size - params.cabinetHeight);
    if (!zones.length || sum <= 0 || target <= 0) return null;
    let acc = 0;
    const scaled = zones.map((z, i) => {
      const h = i === zones.length - 1 ? round1(target - acc) : round1((z.height * target) / sum);
      acc = round1(acc + h);
      return { ...z, height: h };
    });
    const fitted = fitTallCabinetHeight({ ...params, zones: scaled }, round1(size));
    return Math.abs(fitted.cabinetHeight - size) > 0.05 ? null : fitted;
  },

  /**
   * Zone boundaries on the front view: the centre line of the boundary panel
   * between functional zones `index` (below) and `index + 1` (absolute z from
   * result.stack). Moving it trades height between the two zones.
   */
  setDivider(params, result, index, pos) {
    return tradeTallZoneHeight(params, result, index, pos);
  },

  /** Move a double_door zone's vertical divider centre to interior x (from the left side panel's inner face). */
  setDividerCenter(params, zoneId, x) {
    const zones = (params.zones || []).map((z) => ({ ...z }));
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone || zone.verticalDivider !== true) return params;
    const mw = round1((params.cabinetWidth ?? 0) - (params.leftSidePanelThickness ?? 0) - (params.rightSidePanelThickness ?? 0));
    zone.dividerCenterX = round1(Math.max(MIN_ZONE_WIDTH, Math.min(mw - MIN_ZONE_WIDTH, x)));
    return { ...params, zones };
  },

  dividers() { return []; },
  /** Generator Rules: existing parameters. Zone heights trade; the stack stays the cabinet height. */
  benchShape: "tall",
  benchInputs: [
    { group: "柜体尺寸", fields: [
      { key: "cabinetWidth", sym: "CW", label: "柜宽", source: "柜体" },
      { key: "cabinetDepth", sym: "CD", label: "柜深（含门）", source: "柜体" },
      { key: "cabinetHeight", sym: "H", label: "柜高", source: "柜体" },
    ] },
    { group: "材料", fields: [
      { key: "panelThickness", sym: "CPT", label: "柜身板厚", source: "材料" },
      { key: "frontPanelThickness", sym: "FPT", label: "门板厚", source: "材料" },
    ] },
  ],
  zoneTypes: [
    { id: "side_door", label: "Door (hinge side)" },
    { id: "left_side_door", label: "Door · hinge left" },
    { id: "right_side_door", label: "Door · hinge right" },
    { id: "double_door", label: "Double door" },
    { id: "drawer", label: "Drawer" },
    { id: "open_space", label: "Open" },
    { id: "open_appliance", label: "Open · appliance" },
    { id: "top_flap", label: "Top flap" },
    { id: "bottom_flap", label: "Bottom flap" },
    { id: "blank_panel", label: "Blank panel" },
  ],
};

/** Move the boundary between stacked zones `index` / `index + 1` to z = `pos` (its panel's centre line); the pair keeps its total. */
function tradeTallZoneHeight(params, result, index, pos) {
  const items = (result?.stack || []).filter((it) => it.kind === "functional_zone");
  const below = items[index];
  const above = items[index + 1];
  if (!below || !above) return params;
  const zones = (params.zones || []).map((z) => ({ ...z }));
  const pBelow = zones.find((z) => z.id === below.zoneId);
  const pAbove = zones.find((z) => z.id === above.zoneId);
  if (!pBelow || !pAbove) return params;
  const gap = Math.max(0, above.z0 - below.z1); // the boundary panel
  const top = Math.max(below.z0 + MIN_ZONE_HEIGHT, Math.min(above.z1 - gap - MIN_ZONE_HEIGHT, round1(pos - gap / 2)));
  const total = round1(pBelow.height + pAbove.height);
  pBelow.height = round1(top - below.z0);
  pAbove.height = round1(total - pBelow.height);
  return { ...params, zones };
}

function tallPresetParams(list, params, presetId) {
  const preset = list.find((pr) => pr.id === presetId);
  if (!preset) return params;
  const keep = {};
  for (const k of ["doorSeries", "doorSides", "doorColor", "doorColorName", "doorColorB", "doorColorNameB", "colorSlot", "grain"]) {
    if (params[k] !== undefined) keep[k] = params[k];
  }
  return { ...structuredClone(preset.params), ...keep };
}

function tallPresetOf(list, params) {
  const hit = list.find((pr) => Object.keys(pr.params).every((k) => JSON.stringify(params[k]) === JSON.stringify(pr.params[k])));
  return hit ? hit.id : null;
}

// --- tall fridge cabinet ------------------------------------------------------------
//
// The fridge's cut-out is fixed; everything else follows it. Bottom → top:
// drawers / down flaps, the fridge (one), then nothing, an up flap or a fixed
// panel. Width = cut-out + side panel + V1 / V2 / V5 (fridgeCabinetWidth), so
// a side panel's stock moves the outer width, never the opening. Only one side
// panel, on the side that shows; exteriorSide follows it. The same generalTall
// generator builds it.

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
function fridgeSlack(zones, except = null) {
  const { below, above } = fridgeParts(zones);
  if (above[0] && above[0].id !== except) return above[0].id;
  for (let k = below.length - 1; k >= 0; k -= 1) if (below[k].id !== except) return below[k].id;
  return null;
}

/** Stack height (bottom system → top system) of these params as they stand. */
function tallStackHeight(params) {
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
function fridgeWidthAnchor(params, cab) {
  if (params.exteriorSide === "left") return 1;
  if (params.exteriorSide === "right") return -1;
  return cab?.placeCorner?.x ?? -1;
}

const tallFridgeCabinet = {
  id: "tallFridgeCabinet",
  label: "Fridge",
  sub: "tall · fridge cut-out fixed",
  panel: "tallFridge",
  defaultSize: { W: 593, D: 624, H: 1965 }, // Rogue Dometic: cut-out 532 + 16 side + 3 × 15; carcass 624 + 16 doors
  minSize: { W: 300, D: 350, H: 800 },
  noOrient: "the fridge fixes the width — turn it with Move",
  handles: ["D", "H"],
  /** Face of the box that stays when the width follows the fridge or a side panel (job.setParams). */
  widthAnchor: fridgeWidthAnchor,
  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish, "B");
    const seed = TALL_FRIDGE_PRESETS[0] ? structuredClone(TALL_FRIDGE_PRESETS[0].params) : {
      cabinetHeight: 1965, cabinetWidth: 593, cabinetDepth: 640, sideClearance: 3,
      leftSidePanelThickness: 16, leftSidePanelFinish: "colour", rightSidePanelThickness: 0,
      topSystem: { style: "style_2", height: 101 }, bottomSystem: { style: "style_1", frontRailHeight: 55 },
      frontHardware: { frontClearance: 3 },
      zones: [
        { id: "zone-1", type: "bottom_flap", height: 172, lockPosition: "top" },
        { id: "zone-2", type: "drawer", height: 247, lockPosition: "top" },
        { id: "zone-3", type: "fridge", height: 1344, applianceWidthMm: 532, applianceHeightMm: 1344 },
      ],
    };
    const cpt = thickness(stock, "carcass");
    const fpt = thickness(stock, "door");
    const side = (key, finishKey) => ((seed[key] ?? 0) > 0 ? (seed[finishKey] === "colour" ? fpt : cpt) : 0);
    const base = {
      ...seed,
      panelThickness: cpt,
      frontPanelThickness: fpt,
      leftSidePanelThickness: side("leftSidePanelThickness", "leftSidePanelFinish"),
      rightSidePanelThickness: side("rightSidePanelThickness", "rightSidePanelFinish"),
      cabinetDepth: round1(D + fpt),
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      colorSlot: color.colorSlot,
    };
    return fridgeFix(base, { H });
  },
  generate(params, options) {
    return generateGeneralTall(params, options);
  },
  benchSwitches: TALL_BENCH_SWITCHES,

  presets: TALL_FRIDGE_PRESETS,
  applyPreset(params, presetId) {
    return fridgeFix(tallPresetParams(TALL_FRIDGE_PRESETS, params, presetId));
  },
  presetOf(params) {
    return tallPresetOf(TALL_FRIDGE_PRESETS, params);
  },

  /**
   * The fridge page's elevation: taller than the storage tall's (the cabinet is tall and narrow, so
   * the height is what limits the drawing), and the numbers beside it are the Clearance / Centre to
   * centre reading, typed in place for the zones you may resize.
   */
  frontView(result, { selectedZoneId = null, gaps = "clear", editable = false } = {}) {
    return generateGTSvgPreview(result, { selectedZoneId, showDimensions: true, gaps, readout: true, editable, maxHeight: 820 });
  },

  /** Per zone: stored height, clearance and centre to centre (the fridge reads its own cut-out). */
  zoneOpenings(result) {
    return result?.boards?.length && typeof gtZoneOpenings === "function" ? gtZoneOpenings(result) : [];
  },
  envelope(params) {
    return { W: params.cabinetWidth, D: round1(params.cabinetDepth - tallDoorThickness(params)), H: params.cabinetHeight };
  },
  normalizeParams(params) {
    return params?.zones?.length ? fridgeFix(params) : params;
  },
  /** W is the fridge's: only D and H are set here. */
  setEnvelope(params, { D, H }) {
    const next = { ...params };
    if (D != null) next.cabinetDepth = round1(D + tallDoorThickness(params));
    return fridgeFix(next, { H: H ?? next.cabinetHeight });
  },

  resizeFaces: ["y-", "y+", "z+"],
  /** Top face: the zone above the fridge (else the one under it) takes the difference. Null when it would go under its minimum. */
  resizeFace(params, side, size) {
    if (side.axis === "x") return null;
    if (side.axis === "y") return this.setEnvelope(params, { D: size });
    const fitted = fridgeFix(params, { H: size });
    return Math.abs(fitted.cabinetHeight - size) > 0.05 ? null : fitted;
  },

  /** Front-view boundaries between zones `index` / `index + 1`; the fridge's own edges do not move. */
  setDivider(params, result, index, pos) {
    const items = (result?.stack || []).filter((it) => it.kind === "functional_zone");
    const below = items[index];
    const above = items[index + 1];
    if (!below || !above || below.zoneType === "fridge" || above.zoneType === "fridge") return params;
    return fridgeFix(tradeTallZoneHeight(params, result, index, pos));
  },

  dividers() { return []; },
  /** Generator Rules: the cut-out is the parameter. Outer width is cut-out + side + 3 CPT. */
  benchShape: "fridge",
  benchInputs: [
    { group: "柜体尺寸", fields: [
      { key: "cabinetDepth", sym: "CD", label: "柜深（含门）", source: "柜体" },
      { key: "cabinetHeight", sym: "H", label: "柜高", source: "柜体" },
    ] },
    { group: "材料", fields: [
      { key: "panelThickness", sym: "CPT", label: "柜身板厚", source: "材料" },
      { key: "frontPanelThickness", sym: "FPT", label: "门板厚", source: "材料" },
    ] },
  ],
  zoneTypes: [
    ...FRIDGE_BELOW_TYPES.map((id) => ({ id, label: FRIDGE_ZONE_LABEL[id] })),
    { id: "fridge", label: FRIDGE_ZONE_LABEL.fridge },
    ...FRIDGE_ABOVE_TYPES.map((id) => ({ id, label: FRIDGE_ZONE_LABEL[id] })),
  ],
};

/** Lounge: −1 keeps local x = 0, +1 keeps x = W. The L keeps its wing end; I / parallel the corner drawn first. */
function loungeWidthAnchor(params, cab) {
  if ((params.style || "L_SHAPE") === "L_SHAPE") return params.lPosition === "LEFT" ? -1 : 1;
  return cab?.placeCorner?.x ?? -1;
}

const loungeGenerator = {
  id: "loungeGenerator",
  label: "Lounge",
  sub: "I / L",
  panel: "lounge", // wide right-hand editor: plan view + run card
  /**
   * Any size change keeps the lounge on its walls (job.setParams): the back (local y = D) is the wall
   * and stays; along the wall the end that stays is the L wing's end (it sits on a side wall), else
   * the corner the box was drawn from.
   */
  widthAnchor: loungeWidthAnchor,
  depthAnchor: () => 1,
  defaultSize: { W: 2000, D: 800, H: 420 },
  minSize: { W: 800, D: 400, H: 300 },
  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish, "B");
    return {
      style: "L_SHAPE",
      height: H,
      frontPanelThickness: thickness(stock, "door"),
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      colorSlot: color.colorSlot,
      partitionPanelThickness: 18,
      mainWidth: W,
      mainDepth: Math.min(D, 600),
      lWidth: Math.min(W - 400, 1600),
      lDepth: D,
      lPosition: "RIGHT",
      topLidEnabled: true,
    };
  },
  generate(params, options) {
    return generateLounge(params, options);
  },
  /** The classic construction was retired (2026-10-08): a saved one opens as the frame lounge. */
  normalizeParams(params) {
    if (!params || params.construction == null) return params;
    const next = { ...params };
    delete next.construction;
    return next;
  },
  benchSwitches: [
    { key: "style", label: "样式", options: [["I_SHAPE", "I"], ["L_SHAPE", "L"], ["PARALLEL", "平行"]], get: (p) => p.style || "L_SHAPE", set: (p, v) => ({ ...p, style: v }) },
    { key: "lFrontAccess", label: "翼端", options: [["NONE", "无抽屉"], ["DRAWER", "抽屉"]], get: (p) => p.lFrontAccess === "DRAWER" ? "DRAWER" : "NONE", set: (p, v) => ({ ...p, lFrontAccess: v }) },
    { key: "aisleAccess", label: "过道端", options: [["NONE", "无抽屉"], ["DRAWER", "抽屉"]], get: (p) => p.aisleAccess === "DRAWER" ? "DRAWER" : "NONE", set: (p, v) => ({ ...p, aisleAccess: v }) },
    { key: "backPanel", label: "背板", options: [["off", "无"], ["on", "有"]], get: (p) => p.backPanel ? "on" : "off", set: (p, v) => ({ ...p, backPanel: v === "on" }) },
    { key: "leftBackPanel", label: "左背板", options: [["off", "无"], ["on", "有"]], get: (p) => p.leftBackPanel ? "on" : "off", set: (p, v) => ({ ...p, leftBackPanel: v === "on" }) },
    { key: "rightBackPanel", label: "右背板", options: [["off", "无"], ["on", "有"]], get: (p) => p.rightBackPanel ? "on" : "off", set: (p, v) => ({ ...p, rightBackPanel: v === "on" }) },
  ],
  envelope(params) {
    if (params.style === "PARALLEL") {
      return { W: params.totalWidth ?? 4000, D: params.depth ?? 800, H: params.height ?? 420 };
    }
    if (params.style === "L_SHAPE") {
      return { W: params.mainWidth ?? 2000, D: params.lWidth ?? 1600, H: params.height ?? 420 };
    }
    // I: the run's depth.
    return { W: params.mainWidth ?? 2000, D: params.mainDepth ?? 600, H: params.height ?? 420 };
  },
  footprintBoxes(params, result) {
    return loungeFootprintBoxes(params, result);
  },

  /** Plan (top-down) view — a front elevation of a lounge is a flat strip; the layout lives in XY. */
  frontView(result, { selectedRun = null, params = null, widthAnchor = -1 } = {}) {
    return generateLoungeSvgPreview(result, { selectedRun, showDimensions: true, params: params || undefined, widthAnchor, width: 640 });
  },

  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    const parallel = params.style === "PARALLEL";
    if (W != null) next[parallel ? "totalWidth" : "mainWidth"] = round1(W);
    if (D != null) {
      if (params.style === "L_SHAPE") next.lWidth = round1(D);
      else if (parallel) next.depth = round1(D);
      else next.mainDepth = round1(D);
    }
    if (H != null) next.height = round1(H);
    return next;
  },

  /**
   * Switch the shape, keeping the footprint's outer size where it means the
   * same thing and a sensible seat depth everywhere else.
   */
  setStyle(params, style) {
    if (style === params.style) return params;
    const env = this.envelope(params);
    const seat = Math.max(300, Math.min(params.mainDepth ?? params.singleLoungeWidth ?? 600, 800));
    const next = { ...params, style };
    if (style === "I_SHAPE") {
      next.mainWidth = round1(env.W);
      next.mainDepth = seat;
    } else if (style === "L_SHAPE") {
      next.mainWidth = round1(env.W);
      next.mainDepth = seat;
      next.lWidth = round1(Math.max(env.D, seat + 400));
      next.lDepth = round1(Math.min(params.lDepth ?? seat, env.W - 400));
      next.lPosition = params.lPosition ?? "RIGHT";
    } else if (style === "PARALLEL") {
      next.totalWidth = round1(Math.max(env.W, 2 * seat + 400));
      next.singleLoungeWidth = seat;
      next.depth = round1(Math.max(env.D, 400));
    }
    return next;
  },

  /**
   * Plan-view edge drag. `key` is the plan edge's semantic (emitted as
   * data-param by the preview); pos is the pointer's mm on that axis.
   * Edges that are measured from a fixed outer edge convert internally.
   */
  setRunEdge(params, key, pos) {
    const next = { ...params };
    const v = round1(pos);
    const minRun = 200;
    // Edges drawn on the room side or the left end: `pos` is where that edge went, in the plan as it
    // was when the drag started (the wall stays at y = D, the right end at x = W).
    const d0 = this.envelope(params).D;
    const w0 = this.envelope(params).W;
    switch (key) {
      case "mainWidthLo": next.mainWidth = Math.max(800, round1((params.mainWidth ?? w0) - v)); break;
      case "totalWidthLo": next.totalWidth = Math.max(1600, round1((params.totalWidth ?? w0) - v)); break;
      case "mainDepthFront": next.mainDepth = Math.max(300, round1(d0 - v)); break; // I: the room edge
      case "lWidthFront": next.lWidth = Math.max(400, round1(d0 - v)); break; // L: the wing's room end
      case "depthFront": next.depth = Math.max(400, round1(d0 - v)); break; // parallel: the aisle ends
      case "mainWidth": next.mainWidth = Math.max(800, v); break;
      case "mainDepth":
        // I/U: the back edge sits at y = mainDepth. L: main's front edge sits at
        // y = lWidth - mainDepth (main hugs the wall), so convert.
        next.mainDepth = Math.max(300, round1(params.style === "L_SHAPE" ? (params.lWidth ?? 1600) - v : v));
        break;
      case "lWidth": next.lWidth = Math.max(400, v); break;
      case "lDepth": {
        // L: the inner edge — LEFT wing measures from x=0, RIGHT from mainWidth.
        // A back panel has already moved that edge in by one thickness.
        const mw = params.mainWidth ?? 2000;
        const inset = params.backPanel === true ? (params.partitionPanelThickness ?? 18) : 0;
        const raw = params.style === "L_SHAPE" && params.lPosition === "LEFT" ? v - inset : mw - v - inset;
        next.lDepth = Math.max(minRun, round1(raw));
        break;
      }
      case "totalWidth": next.totalWidth = Math.max(1600, v); break;
      case "singleLoungeWidth": {
        const inset = params.rightBackPanel === true ? (params.partitionPanelThickness ?? 18) : 0;
        next.singleLoungeWidth = Math.max(400, round1((params.totalWidth ?? 4000) - v - inset));
        break;
      }
      case "depth": next.depth = Math.max(400, v); break;
      default: return params;
    }
    return next;
  },

  dividers() { return []; },
  setDivider(params) { return params; },
  zoneTypes: [],
  /** Generator Rules: the run sizes already on the lounge. Lid split stays a workshop rule. */
  benchShape: "lounge",
  benchInputs: [
    { group: "外形", fields: [
      { key: "style", label: "样式", kind: "select" },
      { key: "height", sym: "H", label: "座高", source: "柜体" },
    ] },
    { group: "材料", fields: [
      { key: "partitionPanelThickness", sym: "T", label: "板厚", source: "材料" },
    ] },
  ],
};

const bedroomEast = {
  id: "bedroomEast",
  label: "East-west",
  sub: "wardrobe left · mattress across",
  placement: "nose",
  fixedDepth: EAST_RULES.MATTRESS_DEPTH_MM.value,
  single: true,
  roofAware: true,
  volumeOnly: true,
  panel: "bedroomEast",
  defaultSize: { W: 2275, D: EAST_RULES.MATTRESS_DEPTH_MM.value, H: 1797 },
  minSize: { W: EAST_RULES.WARDROBE_MIN_MM.value + 1, D: EAST_RULES.MATTRESS_DEPTH_MM.value, H: 600 },
  defaults(W, D, H, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish);
    const width = round1(W);
    const depth = EAST_RULES.MATTRESS_DEPTH_MM.value;
    return {
      width,
      depth,
      height: round1(H),
      roofProfile: [[0, round1(H)], [depth, round1(H)]],
      wardrobeWidth: eastWardrobeMax(width),
      ohcBottom: EAST_RULES.OHC_BOTTOM_DEFAULT_MM.value,
      fixedPanelTop: EAST_RULES.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value,
      ledGroove: true,
      panelThickness: thickness(stock, "carcass"),
      doorPanelThickness: thickness(stock, "door"),
      carcassColor: color.carcassColor,
      carcassColorName: color.carcassColorName,
      doorSeries: color.doorSeries,
      doorSides: color.doorSides,
      doorColor: color.doorColor,
      doorColorName: color.doorColorName,
      doorColorB: color.doorColorB,
      doorColorNameB: color.doorColorNameB,
      colorSlot: color.colorSlot,
    };
  },
  ohcBottomLimits(params) { return eastOhcBottomLimits(params); },
  setOhcBottom(params, value) {
    const lim = eastOhcBottomLimits(params);
    return { ...params, ohcBottom: round1(Math.max(lim.min, Math.min(lim.max, value))) };
  },
  setOhcCount(params, count) { return { ...params, ohcZones: eastEqualBays(params, count) }; },
  generate(params, options) { return generateBedroomEast(params, options); },
  benchSwitches: [
    { key: "ledGroove", label: "灯槽", options: [["on", "开"], ["off", "关"]], get: (p) => p.ledGroove === false ? "off" : "on", set: (p, v) => ({ ...p, ledGroove: v === "on" }) },
  ],
  envelope(params) { return { W: params.width, D: EAST_RULES.MATTRESS_DEPTH_MM.value, H: params.height }; },
  setEnvelope(params, { W, H }) {
    const next = { ...params, depth: EAST_RULES.MATTRESS_DEPTH_MM.value };
    if (W != null) {
      next.width = round1(W);
      next.wardrobeWidth = Math.min(next.wardrobeWidth ?? eastWardrobeMax(next.width), eastWardrobeMax(next.width));
    }
    if (H != null) next.height = round1(H);
    return next;
  },
  /** Width, height and roof come from the vehicle, like the north-south body. */
  withSpace(params, resolved, pose) {
    const next = bedroom.withSpace({ ...params, depth: EAST_RULES.MATTRESS_DEPTH_MM.value }, resolved, pose);
    if (next.width !== params.width && params.wardrobeWidth > eastWardrobeMax(next.width)) {
      return { ...next, wardrobeWidth: eastWardrobeMax(next.width) };
    }
    return next.width === params.width && next.height === params.height && next.roofProfile === params.roofProfile && next.depth === params.depth ? params : next;
  },
  envelopeProfile(params) {
    return params.roofProfile || [[0, params.height], [EAST_RULES.MATTRESS_DEPTH_MM.value, params.height]];
  },
  /**
   * Orange bars on the body's room face: the wardrobe face, the overhead
   * underside, and one per overhead bay boundary.
   */
  dividers(params, result) {
    if (!result || result.validation?.errors?.length) return [];
    const rp = result.params;
    const W = rp.width;
    const front = -(EAST_RULES.MATTRESS_DEPTH_MM.value - EAST_RULES.BODY_DEPTH_MM.value) + 20;
    const boot = rp.bootHeight;
    const wardTop = result.zones.find((z) => z.id === "wardrobe")?.z1 ?? rp.height;
    const ohcTop = result.zones.find((z) => z.id === "ohc")?.z1 ?? rp.height;
    const ob = eastOhcBottomLimits(rp);
    const bars = [
      { index: 0, key: "wardrobeWidth", axis: "x", pos: rp.wardrobeWidth, min: EAST_RULES.WARDROBE_MIN_MM.value, max: eastWardrobeMax(W), span: [boot, wardTop], front },
      { index: 1, key: "ohcBottom", axis: "z", pos: rp.ohcBottom, min: ob.min, max: ob.max, span: [rp.wardrobeWidth, W], front },
    ];
    const bays = result.layout?.ohc?.zones || [];
    bays.slice(0, -1).forEach((bay, i) => {
      const total = bay.width + bays[i + 1].width;
      bars.push({ index: bars.length, key: "ohcZone", zoneIndex: i, axis: "x", pos: bay.x1, min: round1(bay.x0 + EAST_RULES.OHC_ZONE_MIN_MM.value), max: round1(bay.x0 + total - EAST_RULES.OHC_ZONE_MIN_MM.value), span: [rp.ohcBottom, ohcTop], front });
    });
    return bars;
  },
  setDivider(params, result, index, pos) {
    const d = this.dividers(params, result).find((b) => b.index === index);
    if (!d) return params;
    if (d.key === "ohcZone") {
      const bays = eastSetBayBoundary(params, d.zoneIndex, Math.round(pos));
      return bays ? { ...params, ohcZones: bays } : params;
    }
    if (d.key === "ohcBottom") return this.setOhcBottom(params, Math.round(pos));
    const wardrobeWidth = round1(Math.max(EAST_RULES.WARDROBE_MIN_MM.value, Math.min(eastWardrobeMax(params.width), pos)));
    return { ...params, wardrobeWidth };
  },
};

const sketchBoard = {
  id: "sketchBoard",
  label: "Board",
  sub: "one rectangle on a face",
  panel: "sketch",
  /** Started from the command bar, not the module rail. */
  command: true,
  noOrient: "a drawn board stays on the face it was sketched on",
  handles: [],
  resizeFaces: [],
  minSize: { W: 50, D: 50, H: 1 },
  defaultSize: { W: 400, D: 600, H: 16 },

  defaults(_w, _d, _h, materials) {
    const { finish, stock } = materialsOf(materials);
    const color = cabinetColor(finish);
    return {
      plane: "XY",
      pull: 1,
      outline: [{ u: 0, v: 0 }, { u: 400, v: 0 }, { u: 400, v: 600 }, { u: 0, v: 600 }],
      stock: { kind: "carcass", thickness: thickness(stock, "carcass") },
      carcassColorName: color.carcassColorName,
      colorFace: "pull",
    };
  },

  generate(params, options) {
    return generateSketchBoard(params, options);
  },

  envelope(params) {
    const b = localBoxOf(params);
    return { W: b.W, D: b.D, H: b.H };
  },

  /** Real local box, including a slab that grows back through t = 0. */
  localBox(params) {
    return localBoxOf(params);
  },

  footprintBoxes(params) {
    const b = localBoxOf(params);
    return [{ id: "board", x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1 }];
  },

  setEnvelope(params) {
    return params;
  },

  dividers() {
    return [];
  },
};

export const MODULES = {
  smallCabinet,
  overheadCabinet,
  uShapeOverheadCabinet,
  bedroom,
  bedroomEast,
  bedBox,
  kitchenCabinet,
  ensuiteCabinet,
  generalTallCabinet,
  tallFridgeCabinet,
  loungeGenerator,
  bedSideTable,
  bunkBed,
  sketchBoard,
  ensuiteDrawingLower,
  ensuiteDrawingTall,
};

/**
 * Renderer module id → generators/<dir> (presets, rules, esbuild entry).
 * Ids that already match the folder are omitted.
 */
export const GENERATOR_DIRS = {
  kitchenCabinet: "kitchen",
  ensuiteCabinet: "kitchen",
  uShapeOverheadCabinet: "uShapeOverhead",
  generalTallCabinet: "generalTall",
  tallFridgeCabinet: "generalTall",
  loungeGenerator: "lounge",
  ensuiteDrawingLower: "ensuiteDrawing",
  ensuiteDrawingTall: "ensuiteDrawing",
};

export function generatorDir(moduleId) {
  return GENERATOR_DIRS[moduleId] || moduleId;
}

/** Folder name or module id → MODULES key (CABLAB_BENCH=kitchen, bench:modules). */
export function moduleIdForGenerator(dirOrId) {
  if (MODULES[dirOrId]) return dirOrId;
  for (const [id, dir] of Object.entries(GENERATOR_DIRS)) {
    if (dir === dirOrId) return id;
  }
  return dirOrId;
}

/**
 * Rail groups: one rail entry that opens a flyout of sub-modules on hover.
 * `moduleId` items arm that module; `planned` items are listed but disabled.
 */
export const MODULE_GROUPS = [
  {
    id: "base",
    label: "Base",
    sub: "ensuite / kitchen",
    items: [
      { moduleId: "ensuiteCabinet", label: "Ensuite", sub: "vanity · no stove" },
      { moduleId: "kitchenCabinet", label: "Kitchen", sub: "run · stove" },
    ],
  },
  {
    id: "tall",
    label: "Tall",
    sub: "storage / fridge",
    items: [
      { moduleId: "generalTallCabinet", label: "Storage", sub: "outer width fixed" },
      { moduleId: "tallFridgeCabinet", label: "Fridge", sub: "fridge cut-out fixed" },
    ],
  },
  {
    id: "bedroom",
    label: "Bedroom",
    sub: "north-south / east-west",
    items: [
      { moduleId: "bedroom", label: "North-south", sub: "wardrobes both sides" },
      { moduleId: "bedroomEast", label: "East-west", sub: "wardrobe left · mattress across" },
      { moduleId: "bedBox", label: "Bed Box", sub: "bed base · needs the body" },
      { moduleId: "bedSideTable", label: "Bed Side Table", sub: "pair · needs the body" },
    ],
  },
  {
    id: "lounge",
    label: "Lounge",
    sub: "I / L / Parallel",
    items: [
      { moduleId: "loungeGenerator", lounge: "I", label: "I", sub: "one run" },
      { moduleId: "loungeGenerator", lounge: "L", label: "L", sub: "main box, then the wing" },
      { moduleId: "loungeGenerator", lounge: "Parallel", label: "Parallel", sub: "two runs face to face" },
    ],
  },
  {
    id: "drawn",
    label: "As drawn",
    sub: "fixed copies from Fusion",
    items: [
      { moduleId: "ensuiteDrawingLower", sample: "ensuite", label: "Ensuite sample", sub: "rear of the van · tall + lower as in Fusion · 2275 wide, 1965 high" },
    ],
  },
  {
    id: "bunk",
    label: "Bunk bed",
    sub: "across the rear",
    items: [
      { moduleId: "bunkBed", label: "Across", sub: "rear wall · wall to wall · two bunks" },
    ],
  },
];

/** Placeholders shown in the rail but not yet wired. */
export const PLANNED_MODULES = [];

/** Swap one rebuilt bundle into the running app. A new URL so the page does not keep the copy it loaded at launch. */
const applyBundle = {
  smallCabinet(m) {
    generateSmallCabinet = m.generateSmallCabinet;
    generateSmallCabinetSvgPreview = m.generateSmallCabinetSvgPreview;
  },
  bedroom(m) {
    generateBedroom = m.generateBedroom;
    generateBedroomSvgPreview = m.generateBedroomSvgPreview;
    setBedroomLayout = m.setLayout;
    bedroomLayoutLimits = m.layoutLimits;
    bedBoxSizeFor = m.bedBoxSizeFor;
    setBedroomOhcBoundary = m.setOhcBoundary;
    bedroomEqualOhcZones = m.equalOhcZones;
    BEDROOM_LAYOUT_KEYS = m.LAYOUT_KEYS;
    BEDROOM_RULES = m.RULES;
    BEDROOM_WARDROBE_STYLES = m.WARDROBE_STYLES;
  },
  bedroomEast(m) {
    generateBedroomEast = m.generateBedroomEast;
    eastWardrobeMax = m.eastWardrobeMax;
    eastEqualBays = m.eastEqualBays;
    eastSetBayBoundary = m.eastSetBayBoundary;
    eastOhcBottomLimits = m.eastOhcBottomLimits;
    EAST_RULES = m.RULES;
  },
  bedBox(m) {
    generateBedBox = m.generateBedBox;
    BED_BOX_DEFAULT_HEIGHT = m.BED_BOX_DEFAULT_HEIGHT;
    BED_BOX_MIN = m.BED_BOX_MIN;
    BED_BOX_RULES = m.RULES;
  },
  bedSideTable(m) {
    generateBedSideTable = m.generateBedSideTable;
    generateBedSideSvg = m.generateBedSideSvg;
    bedSideShelfLimits = m.shelfLimits;
    mirrorBedSideZone = m.mirrorZoneType;
    BED_SIDE_RULES = m.RULES;
  },
  bunkBed(m) {
    generateBunkBed = m.generateBunkBed;
    bunkUpperLimits = m.bunkUpperLimits;
    bunkMinSize = m.bunkMinSize;
    BUNK_RULES = m.RULES;
  },
  overheadCabinet(m) {
    generateOverheadCabinet = m.generateOverheadCabinet;
    generateOHCSvgPreview = m.generateOHCSvgPreview;
    generateOHCFrontView = m.generateOHCFrontView;
    ohcZoneOpenings = m.ohcZoneOpenings;
  },
  uShapeOverhead(m) { generateUShapeOverhead = m.generateUShapeOverhead; },
  kitchen(m) {
    generateKitchenCabinet = m.generateKitchenCabinet;
    generateKitchenSvgPreview = m.generateKitchenSvgPreview;
    KITCHEN_RULES = m.RULES;
  },
  generalTall(m) {
    fitTallCabinetHeight = m.fitTallCabinetHeight;
    fridgeCabinetWidth = m.fridgeCabinetWidth;
    generateGeneralTall = m.generateGeneralTall;
    generateGTSvgPreview = m.generateGTSvgPreview;
    gtZoneOpenings = m.gtZoneOpenings;
    GT_UI_PRESETS = m.GT_UI_PRESETS;
  },
  lounge(m) {
    generateLounge = m.generateLounge;
    generateLoungeSvgPreview = m.generateLoungeSvgPreview;
    loungeFootprintBoxes = m.loungeFootprintBoxes;
  },
  sketchBoard(m) { generateSketchBoard = m.generateSketchBoard; },
  ensuiteDrawing(m) {
    generateEnsuiteDrawing = m.generateEnsuiteDrawing;
    ensuiteDrawingSize = m.ensuiteDrawingSize;
  },
};

export async function reloadGeneratorDir(dir) {
  const apply = applyBundle[dir];
  if (!apply) return false;
  const m = await import(`./gen/${dir}.js?v=${Date.now()}`);
  apply(m);
  return true;
}

export function getModule(id) {
  const m = MODULES[id];
  if (!m) throw new Error(`Unknown module: ${id}`);
  return m;
}
