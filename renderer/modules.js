// Module registry. Each entry wraps a shared generator bundle (renderer/gen/*)
// and describes its envelope: which params are the outer W/D/H and which
// divider handles exist. The renderer only reads this; formulas stay in the
// generators.
import { generateSmallCabinet } from "./gen/smallCabinet.js";
import { generateBedroom, generateBedroomSvgPreview, setLayout as setBedroomLayout, layoutLimits as bedroomLayoutLimits, bedBoxSizeFor, setOhcBoundary as setBedroomOhcBoundary, equalOhcZones as bedroomEqualOhcZones, LAYOUT_KEYS as BEDROOM_LAYOUT_KEYS, RULES as BEDROOM_RULES, WARDROBE_STYLES as BEDROOM_WARDROBE_STYLES } from "./gen/bedroom.js";
import { generateBedBox, BED_BOX_DEFAULT_HEIGHT, BED_BOX_MIN, RULES as BED_BOX_RULES } from "./gen/bedBox.js";
import { generateBedSideTable, generateBedSideSvg, shelfLimits as bedSideShelfLimits, mirrorZoneType as mirrorBedSideZone, RULES as BED_SIDE_RULES } from "./gen/bedSideTable.js";
import { generateOverheadCabinet, generateOHCSvgPreview } from "./gen/overheadCabinet.js";
import { generateKitchenCabinet } from "./gen/kitchen.js";
import { fitTallCabinetHeight, generateGeneralTall } from "./gen/generalTall.js";
import { generateLounge, loungeFootprintBoxes } from "./gen/lounge.js";
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
      doorColor: color.doorColor,
      colorSlot: color.colorSlot,
    };
  },

  generate(params) {
    return generateBedroom(params);
  },

  /** 2D front elevation (SVG markup) from the last generation; `selectedRegion` is outlined. */
  frontView(result, { selectedRegion = null } = {}) {
    return generateBedroomSvgPreview(result, { selectedRegion, showDimensions: true });
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
  panel: "bedSide",
  defaultSize: { W: 330, D: BED_SIDE_RULES.DEPTH_DEFAULT_MM.value, H: BEDROOM_RULES.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value },
  minSize: { W: 80, D: 40, H: 200 },

  defaults(W, D, H, materials) {
    const { finish } = materialsOf(materials);
    const color = cabinetColor(finish);
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
      colorSlot: color.colorSlot,
    };
  },
  generate(params) { return generateBedSideTable(params); },
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
    const same = twin.shelfCenter === source.shelfCenter && twin.depth === source.depth && twin.height === source.height && twin.clearance === source.clearance
      && JSON.stringify(twin.zones) === JSON.stringify(zones);
    if (same) return twin;
    return { ...twin, shelfCenter: source.shelfCenter, depth: source.depth, height: source.height, clearance: source.clearance, zones };
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

/**
 * Kitchen base cabinet（厨房底柜）— 列 × 区两级布局。
 * 坐标契约与生成器一致：y=0 前缘（门板悬于 y∈[−FPT,0]）。
 * 默认单列 left_door（无中间 V 板 → 无双侧半槽冲突）。
 */
const kitchenCabinet = {
  id: "kitchenCabinet",
  label: "Base",
  sub: "kitchen run",
  defaultSize: { W: 887, D: 270, H: 880 },
  minSize: { W: 300, D: 250, H: 400 },

  defaults(W, D, H, materials) {
    const { stock } = materialsOf(materials);
    const bch = 70;
    return {
      globalSettings: { length: round1(W), depth: round1(D), height: round1(H) },
      materialThickness: thickness(stock, "carcass"),
      frontThickness: thickness(stock, "door"),
      bottomClearanceHeight: bch,
      bottomClearanceStyle: "style_1",
      frontClearance: 2.5,
      lockEnabled: true,
      columns: [
        {
          id: "c1",
          width: round1(W),
          zones: [{ id: "z1", height: round1(H - bch), zoneType: "left_door" }],
        },
      ],
      wheelAvoidances: [],
      vPanelMachiningPreferences: [],
    };
  },

  generate(params) {
    return generateKitchenCabinet(params);
  },

  envelope(params) {
    const gs = params.globalSettings || {};
    return { W: gs.length, D: gs.depth, H: gs.height };
  },

  setEnvelope(params, { W, D, H }) {
    const next = structuredClone(params);
    const gs = next.globalSettings;
    if (W != null) {
      gs.length = round1(W);
      if (next.columns?.length === 1) {
        next.columns[0].width = round1(W);
      } else if (next.columns?.length) {
        // 多列：按比例缩放列宽，保持列数
        const oldW = gs.length ?? W;
        const k = oldW > 0 ? W / oldW : 1;
        for (const col of next.columns) col.width = round1((col.width || 0) * k);
      }
    }
    if (D != null) gs.depth = round1(D);
    if (H != null) {
      gs.height = round1(H);
      const bch = next.bottomClearanceHeight ?? 70;
      const zoneSum = round1(H - bch);
      // 各列区和按原比例缩放到新 H − BCH
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
  setDivider(params) {
    return params;
  },
  zoneTypes: [],
};

const generalTallCabinet = {
  id: "generalTallCabinet",
  label: "Tall",
  sub: "general tall",
  defaultSize: { W: 600, D: 584, H: 2000 },
  minSize: { W: 400, D: 350, H: 800 },
  defaults(W, D, H, materials) {
    const { stock } = materialsOf(materials);
    return {
      cabinetWidth: W,
      cabinetDepth: D,
      cabinetHeight: H,
      panelThickness: thickness(stock, "carcass"),
      frontPanelThickness: thickness(stock, "door"),
      topSystem: { style: "style_1", frontRailHeight: 40 },
      bottomSystem: { style: "style_1", frontRailHeight: 53 },
      zones: [
        { id: "zone-1", type: "side_door", height: Math.max(200, Math.round(H * 0.3)) },
        { id: "zone-2", type: "drawer", height: 300 },
        { id: "zone-3", type: "double_door", height: Math.max(300, Math.round(H * 0.47)), verticalDivider: true },
      ],
    };
  },
  generate(params) {
    return generateGeneralTall(params);
  },
  envelope(params) {
    return { W: params.cabinetWidth, D: params.cabinetDepth, H: params.cabinetHeight };
  },
  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) next.cabinetWidth = round1(W);
    if (D != null) next.cabinetDepth = round1(D);
    if (H != null) return fitTallCabinetHeight(next, round1(H));
    return next;
  },
  dividers() { return []; },
  setDivider(params) { return params; },
  zoneTypes: [],
};

const loungeGenerator = {
  id: "loungeGenerator",
  label: "Lounge",
  sub: "I / L",
  defaultSize: { W: 2000, D: 800, H: 420 },
  minSize: { W: 800, D: 400, H: 300 },
  defaults(W, D, H) {
    return {
      style: "L_SHAPE",
      height: H,
      partitionPanelThickness: 18,
      mainWidth: W,
      mainDepth: Math.min(D, 600),
      lWidth: Math.min(W - 400, 1600),
      lDepth: D,
      lPosition: "RIGHT",
      topLidEnabled: true,
    };
  },
  generate(params) {
    return generateLounge(params);
  },
  envelope(params) {
    if (params.style === "PARALLEL") {
      return { W: params.totalWidth ?? 4000, D: params.depth ?? 800, H: params.height ?? 420 };
    }
    if (params.style === "L_SHAPE") {
      return { W: params.mainWidth ?? 2000, D: params.lWidth ?? 1600, H: params.height ?? 420 };
    }
    const lD = params.lDepth ?? 800;
    const mD = params.mainDepth ?? 600;
    return { W: params.mainWidth ?? 2000, D: Math.max(lD, mD), H: params.height ?? 420 };
  },
  footprintBoxes(params, result) {
    return loungeFootprintBoxes(params, result);
  },
  setEnvelope(params, { W, D, H }) {
    const next = { ...params };
    if (W != null) next.mainWidth = round1(W);
    if (D != null) {
      if (params.style === "L_SHAPE") next.lWidth = round1(D);
      else if (params.style === "U_SHAPE") next.mainDepth = round1(D);
      else next.lDepth = round1(D);
    }
    if (H != null) next.height = round1(H);
    return next;
  },
  dividers() { return []; },
  setDivider(params) { return params; },
  zoneTypes: [],
};

export const MODULES = {
  smallCabinet,
  overheadCabinet,
  bedroom,
  bedBox,
  kitchenCabinet,
  generalTallCabinet,
  loungeGenerator,
  bedSideTable,
};

/**
 * Renderer module id → generators/<dir> (presets, rules, esbuild entry).
 * Ids that already match the folder are omitted.
 */
export const GENERATOR_DIRS = {
  kitchenCabinet: "kitchen",
  generalTallCabinet: "generalTall",
  loungeGenerator: "lounge",
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
    id: "bedroom",
    label: "Bedroom",
    sub: "3 sub-modules",
    items: [
      { moduleId: "bedroom", label: "Body", sub: "nose volume" },
      { moduleId: "bedBox", label: "Bed Box", sub: "bed base · needs the body" },
      { moduleId: "bedSideTable", label: "Bed Side Table", sub: "pair · needs the body" },
    ],
  },
  {
    id: "lounge",
    label: "Lounge",
    sub: "I / L",
    items: [
      { moduleId: "loungeGenerator", lounge: "I", label: "I", sub: "one run" },
      { moduleId: "loungeGenerator", lounge: "L", label: "L", sub: "middle run, then one wing" },
    ],
  },
];

/** Placeholders shown in the rail but not yet wired. */
export const PLANNED_MODULES = [
  { id: "uShapeOverheadCabinet", label: "U overhead", sub: "three runs" },
];

export function getModule(id) {
  const m = MODULES[id];
  if (!m) throw new Error(`Unknown module: ${id}`);
  return m;
}
