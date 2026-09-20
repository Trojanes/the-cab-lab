// Job-level cabinet catalogue: carcass / partition colour, door colour card,
// and the three board stocks. Space geometry stays in space.params; new
// cabinets copy these into their own generator params.
//
// Carcass and partition are always White Stipple. Doors are Acrylic or HPL.
// One or two door colours: two-colour assignment to modules comes later —
// until then every new cabinet uses door colour A.
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

export function builtInFinish() {
  return {
    carcass: { name: CARCASS_COLOR },
    door: {
      series: DEFAULT_DOOR_SERIES,
      mode: "one",
      colors: [{ id: "A", series: DEFAULT_DOOR_SERIES, name: DEFAULT_DOOR_NAME }],
    },
  };
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
    door: { series, mode, colors },
  };
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

/** Colours a new cabinet copies today: carcass White Stipple, door = colour A. */
export function cabinetColor(finish) {
  const f = normalizeFinish(finish);
  const door = f.door.colors[0];
  return {
    carcassColor: CARCASS_COLOR,
    carcassColorName: CARCASS_COLOR,
    doorSeries: f.door.series,
    doorColor: door.name,
    doorColorName: door.name,
    colorSlot: "A",
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
  const door = f.door.mode === "two"
    ? `${series} · ${f.door.colors[0].name} / ${f.door.colors[1].name}`
    : `${series} · ${f.door.colors[0].name}`;
  return [
    ["Carcass / partition", f.carcass.name],
    ["Door", door],
    ["Carcass", `${s.carcass.thickness} mm`],
    ["Partition", `${s.partition.thickness} mm`],
    ["Partition clearance", `floor ${s.partition.floorClearance} · ceiling ${s.partition.ceilingClearance}`],
    ["Door stock", `${s.door.thickness} mm`],
  ];
}
