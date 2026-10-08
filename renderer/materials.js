// Job-level cabinet catalogue: carcass / partition colour, door colour card,
// and the three board stocks. Space geometry stays in space.params; new
// cabinets copy these into their own generator params.
//
// Carcass and partition are always White Stipple. Doors are Acrylic or HPL.
// Colour A is the upper group, colour B the lower. A one-colour job copies A
// into B. New cabinets copy their slot (`cabinetColor`); a split module keeps
// both names and paints each board itself.
// Bench tops are one HPL decor (`finish.benchTop`), never acrylic. A new base
// cabinet copies the name; a cabinet saved without it has no bench board.
import { getSetting } from "./settings.js";

export const MATERIALS_SETTINGS_KEY = "materials.defaults";
export const CARCASS_COLOR = "White Stipple";

// Partition stock is also the room partition (the walls that split a vehicle
// into shower / ensuite / living). Its clearances leave room for packers:
// a partition wall stands floorClearance above the floor and stops
// ceilingClearance under the roof.
export const DEFAULT_STOCK = {
  carcass: { thickness: 15 },
  partition: { thickness: 18, floorClearance: 2, ceilingClearance: 2 },
  door: { thickness: 16 },
};
export const CLEARANCE_MAX = 100;

export const DOOR_SERIES = {
  acrylic: {
    id: "acrylic",
    label: "Acrylic",
    groups: [
      { id: "gloss", label: "Gloss", colors: ["Gloss White", "Gloss Ash", "Gloss Sand"] },
      { id: "metallic", label: "Metallic", colors: ["Metallic White", "Metallic Silver", "Metallic Charcoal", "Metallic Black"] },
      { id: "supermatt", label: "SuperMatt", colors: [
        "SuperMatt White", "SuperMatt Silver", "SuperMatt Charcoal", "SuperMatt Black",
        "SuperMatt Forest Green", "SuperMatt Deep Ocean", "SuperMatt Ash", "SuperMatt Sand",
      ] },
    ],
  },
  hpl: {
    id: "hpl",
    label: "HPL",
    colors: [
      "Pale Driftwood", "Natural Beech", "Smoked Driftwood", "Felt Grey",
      "Urban Walnut", "Washed Elm", "Chestnut", "Frosted Ash",
      "Taupe Beech", "Nordic Grey Oak", "Grey Elm", "Bleached Oak",
      "Natural Pine", "Weathered Elm",
    ],
  },
};

const DEFAULT_DOOR_SERIES = "acrylic";
const DEFAULT_DOOR_NAME = "Gloss White";
export const DEFAULT_BENCH_TOP = "Pale Driftwood";

export function builtInStock() {
  return {
    carcass: { thickness: DEFAULT_STOCK.carcass.thickness },
    partition: { ...DEFAULT_STOCK.partition },
    door: { thickness: DEFAULT_STOCK.door.thickness },
  };
}

export function doorSeriesId(id) {
  return DOOR_SERIES[id] ? id : DEFAULT_DOOR_SERIES;
}

export function doorColorList(series) {
  const s = DOOR_SERIES[doorSeriesId(series)];
  if (s.groups) return s.groups.flatMap((g) => g.colors);
  return s.colors.slice();
}

export function coerceDoorName(series, name, fallbackIndex = 0) {
  const list = doorColorList(series);
  const n = String(name || "").trim();
  if (list.includes(n)) return n;
  return list[fallbackIndex] || list[0] || DEFAULT_DOOR_NAME;
}

function doorEntry(raw, id, series, fallbackIndex) {
  const sid = doorSeriesId((raw && raw.series) || series);
  return { id, series: sid, name: coerceDoorName(sid, raw && raw.name, fallbackIndex) };
}

function isLegacyFinish(raw) {
  return !!(raw && !raw.door && (raw.mode || raw.colors));
}

/** An HPL decor. Anything else falls back to the built-in bench top. */
export function benchTopName(name) {
  const list = doorColorList("hpl");
  const n = String(name || "").trim();
  return list.includes(n) ? n : (list.includes(DEFAULT_BENCH_TOP) ? DEFAULT_BENCH_TOP : list[0]);
}

export function builtInFinish() {
  return {
    carcass: { name: CARCASS_COLOR },
    door: {
      series: DEFAULT_DOOR_SERIES,
      mode: "one",
      sides: "single",
      colors: [{ id: "A", series: DEFAULT_DOOR_SERIES, name: DEFAULT_DOOR_NAME }],
    },
    benchTop: { name: DEFAULT_BENCH_TOP },
  };
}

/**
 * Door stock faces: "single" = the colour on the outside only, the back is the
 * carcass colour; "double" = the colour on both faces. Carcass stock is always
 * double (White Stipple both sides).
 */
export function doorSidesOf(raw) {
  return raw === "double" ? "double" : "single";
}

export function normalizeFinish(raw) {
  if (!raw || isLegacyFinish(raw)) return builtInFinish();
  const series = doorSeriesId(raw.door && raw.door.series);
  const mode = raw.door && raw.door.mode === "two" ? "two" : "one";
  const list = Array.isArray(raw.door && raw.door.colors) ? raw.door.colors : [];
  const colors = [doorEntry(list[0], "A", series, 0)];
  if (mode === "two") colors.push(doorEntry(list[1], "B", series, 1));
  for (const c of colors) { c.series = series; c.name = coerceDoorName(series, c.name, c.id === "B" ? 1 : 0); }
  return {
    carcass: { name: CARCASS_COLOR },
    door: { series, mode, sides: doorSidesOf(raw.door && raw.door.sides), colors },
    benchTop: { name: benchTopName(raw.benchTop && raw.benchTop.name) },
  };
}

/** The bench top colour a new base cabinet copies. */
export function benchTopColor(finish) {
  const name = benchTopName(normalizeFinish(finish).benchTop.name);
  return { name, benchTopColor: name, benchTopColorName: name };
}

function stockThickness(raw, key, fallback) {
  const n = Number(raw && raw[key] && raw[key].thickness);
  return { thickness: Number.isFinite(n) && n > 0 ? Math.round(n * 10) / 10 : fallback };
}

function clearance(raw, key, fallback) {
  const n = Number(raw && raw.partition && raw.partition[key]);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 10) / 10 : fallback;
}

export function normalizeStock(raw) {
  return {
    carcass: stockThickness(raw, "carcass", DEFAULT_STOCK.carcass.thickness),
    partition: {
      ...stockThickness(raw, "partition", DEFAULT_STOCK.partition.thickness),
      floorClearance: clearance(raw, "floorClearance", DEFAULT_STOCK.partition.floorClearance),
      ceilingClearance: clearance(raw, "ceilingClearance", DEFAULT_STOCK.partition.ceilingClearance),
    },
    door: stockThickness(raw, "door", DEFAULT_STOCK.door.thickness),
  };
}

/** Partition wall clearances { floor, ceiling } in mm. */
export function partitionClearance(stock) {
  const s = normalizeStock(stock);
  return { floor: s.partition.floorClearance, ceiling: s.partition.ceilingClearance };
}

export function validateMaterials(finish, stock) {
  const errors = [];
  const f = normalizeFinish(finish);
  const list = doorColorList(f.door.series);
  if (!list.includes(f.door.colors[0].name)) errors.push("Door colour A is not in the selected series.");
  if (f.door.mode === "two") {
    if (!f.door.colors[1] || !list.includes(f.door.colors[1].name)) errors.push("Door colour B is not in the selected series.");
  }
  const s = normalizeStock(stock);
  for (const [key, label] of [["carcass", "Carcass"], ["partition", "Partition"], ["door", "Door"]]) {
    const th = s[key].thickness;
    if (!(th >= 3 && th <= 50)) errors.push(`${label} thickness must be between 3 and 50 mm.`);
  }
  for (const [key, label] of [["floorClearance", "Partition floor clearance"], ["ceilingClearance", "Partition ceiling clearance"]]) {
    const v = s.partition[key];
    if (!(v >= 0 && v <= CLEARANCE_MAX)) errors.push(`${label} must be between 0 and ${CLEARANCE_MAX} mm.`);
  }
  return errors;
}

/**
 * Colours a new cabinet copies. Carcass is White Stipple.
 * Door colour A is the upper group, B the lower. One door colour in the job:
 * B is the same as A. `slot` is which group this cabinet belongs to.
 */
/** Colour A and colour B. A one-colour job, or two names that match: `two` is false and B is A. */
export function doorColors(finish) {
  const f = normalizeFinish(finish);
  const a = f.door.colors[0];
  const b = f.door.mode === "two" && f.door.colors[1] ? f.door.colors[1] : a;
  return { a, b, two: f.door.mode === "two" && a.name !== b.name };
}

export function cabinetColor(finish, slot = "A") {
  const { a, b } = doorColors(finish);
  const f = normalizeFinish(finish);
  const door = slot === "B" ? b : a;
  return {
    carcassColor: CARCASS_COLOR,
    carcassColorName: CARCASS_COLOR,
    doorSeries: f.door.series,
    doorSides: f.door.sides,
    doorColor: door.name,
    doorColorName: door.name,
    doorColorB: b.name,
    doorColorNameB: b.name,
    colorSlot: slot === "B" ? "B" : "A",
  };
}

/** Which group this cabinet is using. Missing slot: the stored door name, else A. */
export function colorSlotOf(params, finish) {
  if (params && (params.colorSlot === "A" || params.colorSlot === "B")) return params.colorSlot;
  const name = String((params && (params.doorColorName || params.doorColor)) || "").trim();
  const { a, b, two } = doorColors(finish);
  if (two && name === b.name && name !== a.name) return "B";
  return "A";
}

/**
 * The other door colour for a right-click. `enabled` is false when the job has
 * one door colour. Boards that are colour B by rule (`doorColorNameB`) stay B.
 */
export function otherDoorColor(params, finish) {
  const colors = doorColors(finish);
  const slot = colorSlotOf(params, finish);
  const other = slot === "B" ? "A" : "B";
  return { slot, other, name: other === "A" ? colors.a.name : colors.b.name, enabled: colors.two };
}

/**
 * The cabinet's colour group filled from the job catalogue: series, sides,
 * colour A and B, and a bench top it already has. Thicknesses stay.
 * A board drawn by hand (no colour group) is left alone.
 */
export function applyCatalogue(params, finish) {
  if (!params || (params.colorSlot == null && params.doorSeries == null && params.doorColorName == null && params.doorColor == null
    && params.benchTopColorName == null && params.benchTopColor == null)) return params;
  const next = { ...params };
  let changed = false;
  const catalogue = params.colorSlot != null || params.doorSeries != null;
  if (catalogue) {
    const color = cabinetColor(finish, colorSlotOf(params, finish));
    for (const key of ["doorSeries", "doorSides", "doorColor", "doorColorName", "doorColorB", "doorColorNameB", "colorSlot"]) {
      if (next[key] !== color[key]) { next[key] = color[key]; changed = true; }
    }
  }
  if (params.benchTopColorName != null || params.benchTopColor != null) {
    const name = benchTopColor(finish).name;
    if (next.benchTopColor !== name) { next.benchTopColor = name; changed = true; }
    if (next.benchTopColorName !== name) { next.benchTopColorName = name; changed = true; }
  }
  return changed ? next : params;
}

/** Copy of `params` whose door colour is the job's colour A or B. Series and sides stay. */
export function withColorSlot(params, finish, slot) {
  const color = cabinetColor(finish, slot);
  return {
    ...params,
    doorColor: color.doorColor,
    doorColorName: color.doorColorName,
    doorColorB: color.doorColorB,
    doorColorNameB: color.doorColorNameB,
    colorSlot: color.colorSlot,
  };
}

export function thickness(stock, kind) {
  const s = normalizeStock(stock);
  return (s[kind] || s.carcass).thickness;
}

/** Saved user default, or the built-in catalogue. */
export function defaultMaterials() {
  const saved = getSetting(MATERIALS_SETTINGS_KEY);
  return {
    finish: normalizeFinish(saved && saved.finish),
    stock: normalizeStock(saved && saved.stock),
  };
}

export function describeMaterials(finish, stock) {
  const f = normalizeFinish(finish);
  const s = normalizeStock(stock);
  const series = DOOR_SERIES[f.door.series].label;
  const sides = f.door.sides === "double" ? "double-sided" : "single-sided";
  const door = f.door.mode === "two"
    ? `${series} · ${f.door.colors[0].name} / ${f.door.colors[1].name} · ${sides}`
    : `${series} · ${f.door.colors[0].name} · ${sides}`;
  return [
    ["Carcass / partition", f.carcass.name],
    ["Door", door],
    ["Bench top", f.benchTop.name],
    ["Carcass", `${s.carcass.thickness} mm`],
    ["Partition", `${s.partition.thickness} mm`],
    ["Partition clearance", `floor ${s.partition.floorClearance} · ceiling ${s.partition.ceilingClearance}`],
    ["Door stock", `${s.door.thickness} mm`],
  ];
}
