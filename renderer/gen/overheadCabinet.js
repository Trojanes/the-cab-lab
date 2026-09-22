// Generated from generators/overheadCabinet/generator.ts - do not edit.

// generators/_lib/dim.ts
var fresh = () => ({ entries: {}, rules: {} });
var active = fresh();
var collecting = false;
function beginProvenance() {
  active = fresh();
  collecting = true;
}
function endProvenance() {
  const out = active;
  active = fresh();
  collecting = false;
  return out;
}
function provenanceActive() {
  return collecting;
}
function isRule(v) {
  return !!v && typeof v === "object" && v.__rule === true;
}
function isParam(v) {
  return !!v && typeof v === "object" && v.__param === true;
}
function isRef(v) {
  return !!v && typeof v === "object" && v.__ref === true;
}
function val(t) {
  if (typeof t === "number") return t;
  return t.value;
}
function param(inputs) {
  const out = {};
  for (const [name, v] of Object.entries(inputs)) {
    out[name] = { __param: true, name, value: Number(v ?? 0) };
  }
  return out;
}
function ref(key) {
  const entry = active.entries[key];
  if (!entry) throw new Error(`dim ref: unknown key "${key}" (record it before referencing it)`);
  return { __ref: true, key, value: entry.value };
}
function formulaOf(fn, override) {
  if (override) return override;
  const src = fn.toString();
  let body = src;
  const arrow = src.indexOf("=>");
  if (arrow >= 0) {
    body = src.slice(arrow + 2).trim();
    if (body.startsWith("{")) {
      const m = body.match(/return\s+([\s\S]*?);?\s*}$/);
      body = m ? m[1] : body;
    }
  } else {
    const m = src.match(/return\s+([\s\S]*?);?\s*}$/);
    body = m ? m[1] : src;
  }
  const pm = src.match(/^\s*(?:function\s*)?\(?\s*([A-Za-z_$][\w$]*)\s*\)?\s*=>|^\s*function\s*\(\s*([A-Za-z_$][\w$]*)/);
  const pname = pm && (pm[1] || pm[2]) || "t";
  const re = new RegExp(`\\b${pname.replace(/\$/g, "\\$")}\\.`, "g");
  return body.replace(re, "").replace(/\s+/g, " ").trim();
}
function dim(key, terms, fn, options = {}) {
  const values = {};
  for (const [name, t] of Object.entries(terms)) values[name] = val(t);
  const value = fn(values);
  const recorded = {};
  for (const [name, t] of Object.entries(terms)) {
    if (isRule(t)) {
      recorded[name] = { kind: "rule", value: t.value, name: t.name, doc: t.doc };
      active.rules[t.name] = { value: t.value, doc: t.doc, module: t.module };
    } else if (isParam(t)) {
      recorded[name] = { kind: "param", value: t.value, name: t.name };
    } else if (isRef(t)) {
      recorded[name] = { kind: "ref", value: t.value, ref: t.key };
    } else {
      recorded[name] = { kind: "value", value: t };
    }
  }
  active.entries[key] = { key, value, formula: formulaOf(fn, options.formula), terms: recorded };
  return value;
}
function same(key, of) {
  return dim(key, { v: ref(of) }, (t) => t.v, { formula: `= ${of}` });
}
function alias(fromPrefix, toPrefix) {
  const under = (key) => key.startsWith(`${fromPrefix}.`) || key.startsWith(`${fromPrefix}[`);
  const rename = (key) => toPrefix + key.slice(fromPrefix.length);
  const copies = [];
  for (const [key, entry] of Object.entries(active.entries)) {
    if (!under(key)) continue;
    const terms = {};
    for (const [name, t] of Object.entries(entry.terms)) {
      terms[name] = t.kind === "ref" && t.ref && under(t.ref) ? { ...t, ref: rename(t.ref) } : { ...t };
    }
    copies.push({ key: rename(key), value: entry.value, formula: entry.formula, terms });
  }
  for (const c of copies) active.entries[c.key] = c;
}
function ex(terms, fn, formula) {
  return { terms, fn, formula };
}
function lit(v) {
  return { terms: {}, fn: () => v, formula: String(v) };
}
function use(K, ...names) {
  const out = {};
  for (const n of names) out[n] = ref(K(n));
  return out;
}
var Outline = class {
  points = [];
  prefix;
  axes;
  constructor(prefix, axes) {
    this.prefix = prefix;
    this.axes = axes;
  }
  add(a, b) {
    const av = {};
    for (const [n, t] of Object.entries(a.terms)) av[n] = val(t);
    const bv = {};
    for (const [n, t] of Object.entries(b.terms)) bv[n] = val(t);
    const x = a.fn(av);
    const y = b.fn(bv);
    const last = this.points[this.points.length - 1];
    if (last && last[0] === x && last[1] === y) return this;
    const i = this.points.length;
    dim(`${this.prefix}[${i}].${this.axes[0]}`, a.terms, a.fn, { formula: a.formula });
    dim(`${this.prefix}[${i}].${this.axes[1]}`, b.terms, b.fn, { formula: b.formula });
    this.points.push([x, y]);
    return this;
  }
};
function defineRules(module, raw) {
  const out = {};
  for (const [name, r] of Object.entries(raw)) {
    out[name] = { __rule: true, module, name, value: Number(r.value), doc: String(r.doc ?? "") };
  }
  return out;
}

// generators/overheadCabinet/rules.json
var rules_default = {
  DIVIDER_THICKNESS_MM: { value: 15, doc: "Carcass / divider board thickness (CPT) when the params give none." },
  FEATURE_CLEARANCE_MM: { value: 1, doc: "Extra width added to CPT for grooves and notches a board slides into (slot = CPT + this)." },
  DEFAULT_ROUTER_DIAMETER_MM: { value: 10, doc: "Router bit diameter assumed for grooves." },
  BOTTOM_THICKNESS_MM: { value: 15, doc: "Bottom panel thickness for the legacy XD-based entry points." },
  T1_HEIGHT_MM: { value: 40, doc: "Top clearance height (TCH) when the params give none: height of the hidden top rails T1/T2." },
  T3_DEPTH_MM: { value: 90, doc: "Top rear panel T3: depth from the carcass front, mm. Sits in the divider front step." },
  T3_THICKNESS_MM: { value: 15, doc: "T3 thickness (legacy preview only)." },
  T3_NOTCH_DEPTH_MM: { value: 20, doc: "Depth of the T3 notch that clears each divider." },
  T4_THICKNESS_MM: { value: 15, doc: "T4 thickness (legacy preview only)." },
  T4_HEIGHT_MM: { value: 50, doc: "Height of the vertical top plate T4 on the divider rear notches." },
  T4_NOTCH_HEIGHT_MM: { value: 20, doc: "Height of the T4 notch that clears each divider." },
  T4_SCREW_HOLE_NOTCH_CLEARANCE_MM: { value: 8, doc: "T4 screw hole: clearance above the notch." },
  T4_SCREW_HOLE_UP_SHIFT_MM: { value: 10, doc: "T4 screw hole: additional upward shift." },
  FRONT_TOP_NOTCH_Y_OFFSET_MM: { value: 70, doc: "Divider front top notch: start Y from the carcass front (style 1)." },
  FRONT_TOP_STEP_Y_MM: { value: 10, doc: "Divider front step: run in Y past the notch offset." },
  SCREW_HOLE_DIAMETER_MM: { value: 3, doc: "Panel screw pilot hole diameter." },
  SCREW_HOLE_DEPTH_MM: { value: 15, doc: "Panel screw pilot hole depth." },
  DEFAULT_FRONT_PANEL_THICKNESS_MM: { value: 16, doc: "Door / front panel thickness (FPT) when the params give none." },
  DEFAULT_CLEARANCE_MM: { value: 2.5, doc: "Gap between neighbouring fronts and at the cabinet edges when the params give none." },
  DEFAULT_HINGE_HOLE_DIAMETER_MM: { value: 35, doc: "Hinge cup hole diameter." },
  DEFAULT_HINGE_HOLE_DEPTH_MM: { value: 12, doc: "Hinge cup hole depth." },
  DEFAULT_HINGE_HOLE_FROM_TOP_MM: { value: 22.5, doc: "Hinge cup centre from the top edge of an up flap." },
  DEFAULT_HINGE_HOLE_FROM_SIDE_MM: { value: 100, doc: "Hinge cup centre from each side edge of an up flap." },
  LED_GROOVE_WIDTH_MM: { value: 14.5, doc: "LED insert groove width (shared with General Tall / Kitchen / Fridge)." },
  LED_GROOVE_DEPTH_MM: { value: 6.5, doc: "LED insert groove depth." },
  LED_GROOVE_FRONT_LAND_MM: { value: 18, doc: "Clear strip from the T3 front edge to the near wall of the main LED channel." },
  LED_GROOVE_BRANCH_END_INSET_MM: { value: 80, doc: "LED T-branch centres inset from each X end of T3." },
  RANGEHOOD_CUTOUT_WIDTH_MM: { value: 555, doc: "NCE rangehood: BP cutout width." },
  RANGEHOOD_CUTOUT_DEPTH_MM: { value: 285, doc: "NCE rangehood: BP cutout depth." },
  RANGEHOOD_MIN_EDGE_MM: { value: 40, doc: "NCE rangehood: minimum material left around the cutout." },
  RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM: { value: 75, doc: "NCE rangehood: clear height from BP top to the insert top when the params give none." }
};

// generators/overheadCabinet/rules.ts
var RULES = defineRules("overheadCabinet", rules_default);

// generators/overheadCabinet/geometry.ts
var DEFAULT_ROUTER_DIAMETER_MM = RULES.DEFAULT_ROUTER_DIAMETER_MM.value;
var DIVIDER_THICKNESS_MM = RULES.DIVIDER_THICKNESS_MM.value;
var FEATURE_CLEARANCE_MM = RULES.FEATURE_CLEARANCE_MM.value;
var FEATURE_GROOVE_WIDTH_MM = DIVIDER_THICKNESS_MM + FEATURE_CLEARANCE_MM;
var SCREW_HOLE_DIAMETER_MM = RULES.SCREW_HOLE_DIAMETER_MM.value;
var SCREW_HOLE_DEPTH_MM = RULES.SCREW_HOLE_DEPTH_MM.value;
var BOTTOM_THICKNESS_MM = RULES.BOTTOM_THICKNESS_MM.value;
var DIVIDER_TONGUE_HEIGHT_MM = DIVIDER_THICKNESS_MM / 2 - 0.5;
var T1_HEIGHT_MM = RULES.T1_HEIGHT_MM.value;
var T3_DEPTH_MM = RULES.T3_DEPTH_MM.value;
var T3_THICKNESS_MM = RULES.T3_THICKNESS_MM.value;
var T3_NOTCH_DEPTH_MM = RULES.T3_NOTCH_DEPTH_MM.value;
var T4_THICKNESS_MM = RULES.T4_THICKNESS_MM.value;
var T4_HEIGHT_MM = RULES.T4_HEIGHT_MM.value;
var T4_NOTCH_HEIGHT_MM = RULES.T4_NOTCH_HEIGHT_MM.value;
var T4_SCREW_HOLE_NOTCH_CLEARANCE_MM = RULES.T4_SCREW_HOLE_NOTCH_CLEARANCE_MM.value;
var T4_SCREW_HOLE_UP_SHIFT_MM = RULES.T4_SCREW_HOLE_UP_SHIFT_MM.value;
var FRONT_TOP_NOTCH_Y_OFFSET_MM = RULES.FRONT_TOP_NOTCH_Y_OFFSET_MM.value;
var FRONT_TOP_STEP_Y_MM = RULES.FRONT_TOP_STEP_Y_MM.value;
var FRONT_TOP_STEP_DROP_MM = FEATURE_GROOVE_WIDTH_MM;
var REAR_TOP_NOTCH_HEIGHT_MM = T4_HEIGHT_MM - 15;
function paramTerms(inputs) {
  return param({
    Cw: inputs.cabinetWidth,
    Cd: inputs.cabinetDepth,
    H: inputs.cabinetHeight,
    TCH: inputs.topClearanceHeight,
    FPT: inputs.frontPanelThickness,
    clearance: inputs.clearance,
    CPT: inputs.featureWidth,
    tongueHeight: inputs.dividerTongueHeight,
    routerDiameter: inputs.routerDiameter,
    hingeHoleDiameter: inputs.hingeHoleDiameter,
    hingeHoleDepth: inputs.hingeHoleDepth,
    hingeHoleFromTop: inputs.hingeHoleFromTop,
    hingeHoleFromSide: inputs.hingeHoleFromSide
  });
}
function orRule(v, name, rule) {
  return v == null ? rule : param({ [name]: v })[name];
}
function edgeDividerCenterlines(cabinetWidth, featureWidth = DIVIDER_THICKNESS_MM) {
  const halfWidth = featureWidth / 2;
  return [halfWidth, cabinetWidth - halfWidth];
}
function dividerCenterlines(cabinetWidth, internalCenterlines, featureWidth = DIVIDER_THICKNESS_MM) {
  const [left, right] = edgeDividerCenterlines(cabinetWidth, featureWidth);
  return [left, ...internalCenterlines, right];
}
function clampRange(range, min, max) {
  return [Math.max(min, range[0]), Math.min(max, range[1])];
}
function featureXRange(centerlineX, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM) {
  const halfWidth = featureSlotWidth / 2;
  return [centerlineX - halfWidth, centerlineX + halfWidth];
}
function boardXRange(centerlineX, boardThickness = DIVIDER_THICKNESS_MM) {
  const halfWidth = boardThickness / 2;
  return [centerlineX - halfWidth, centerlineX + halfWidth];
}
function bpGrooveYRange(cabinetDepth) {
  return [cabinetDepth / 3, 2 * cabinetDepth / 3];
}
function bpGrooveLength(cabinetDepth) {
  return cabinetDepth / 3;
}
function screwHolePositions(centerlineX, cabinetDepth, diameter = SCREW_HOLE_DIAMETER_MM) {
  return [
    { x: centerlineX, y: cabinetDepth / 6, diameter },
    { x: centerlineX, y: 5 * cabinetDepth / 6, diameter }
  ];
}
function panelScrewHoles(part, centers, localMidline, diameter = SCREW_HOLE_DIAMETER_MM, depth = SCREW_HOLE_DEPTH_MM) {
  return centers.map((centerlineX, index) => ({
    id: `${part}SH_D${index}`,
    part,
    for_divider: `D${index}`,
    center: [centerlineX, localMidline],
    diameter,
    depth,
    axis: "thickness"
  }));
}
function dividerTongueYRange(cabinetDepth, _routerDiameter = DEFAULT_ROUTER_DIAMETER_MM) {
  const sideInset = 5;
  return [
    cabinetDepth / 3 + sideInset,
    2 * cabinetDepth / 3 - sideInset
  ];
}
function dividerTongueLength(cabinetDepth, _routerDiameter = DEFAULT_ROUTER_DIAMETER_MM) {
  return cabinetDepth / 3 - 10;
}
function t3NotchYRange(t3Depth = T3_DEPTH_MM, notchDepth = T3_NOTCH_DEPTH_MM) {
  return [t3Depth - notchDepth, t3Depth];
}
function t4NotchZRange(notchHeight = T4_NOTCH_HEIGHT_MM) {
  return [0, notchHeight];
}
function bpGroove(dividerId, centerlineX, cabinetDepth, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM, tongueHeight, cabinetWidth) {
  const z1 = tongueHeight !== void 0 ? -tongueHeight : 0;
  const [rawX0, rawX1] = featureXRange(centerlineX, featureSlotWidth);
  const [x0, x1] = cabinetWidth === void 0 ? [rawX0, rawX1] : clampRange([rawX0, rawX1], 0, cabinetWidth);
  const [y0, y1] = bpGrooveYRange(cabinetDepth);
  const depthZ = tongueHeight ?? 0;
  return {
    id: `BG_${dividerId}`,
    part: "BP",
    for_divider: dividerId,
    x: [x0, x1],
    y: [y0, y1],
    z: [0, z1],
    width_x: x1 - x0,
    length_y: bpGrooveLength(cabinetDepth),
    depth_z: depthZ
  };
}
function t3Notch(dividerId, centerlineX, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM, cabinetWidth) {
  const [rawX0, rawX1] = featureXRange(centerlineX, featureSlotWidth);
  const x = cabinetWidth === void 0 ? [rawX0, rawX1] : clampRange([rawX0, rawX1], 0, cabinetWidth);
  return {
    id: `T3N_${dividerId}`,
    part: "T3",
    for_divider: dividerId,
    x,
    y: t3NotchYRange(),
    z: [0, -DIVIDER_THICKNESS_MM],
    width_x: x[1] - x[0],
    depth_y: T3_NOTCH_DEPTH_MM
  };
}
function t4Notch(dividerId, centerlineX, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM, cabinetWidth) {
  const [rawX0, rawX1] = featureXRange(centerlineX, featureSlotWidth);
  const x = cabinetWidth === void 0 ? [rawX0, rawX1] : clampRange([rawX0, rawX1], 0, cabinetWidth);
  return {
    id: `T4N_${dividerId}`,
    part: "T4",
    for_divider: dividerId,
    x,
    y: [0, DIVIDER_THICKNESS_MM],
    z: t4NotchZRange(),
    width_x: x[1] - x[0],
    height_z: T4_NOTCH_HEIGHT_MM
  };
}
function t3TrimmedOutlinePoints(cabinetWidth, notchXRanges, t3Depth = RULES.T3_DEPTH_MM, notchDepth = RULES.T3_NOTCH_DEPTH_MM, key = "T3.pv") {
  const K = (n) => `${key}.${n}`;
  const Cw = val(cabinetWidth);
  const rearY = dim(K("rearY"), { T3_DEPTH: t3Depth }, (t) => t.T3_DEPTH);
  const notchY = dim(K("notchY"), { T3_DEPTH: t3Depth, T3_NOTCH_DEPTH: notchDepth }, (t) => t.T3_DEPTH - t.T3_NOTCH_DEPTH);
  const ranges = [...notchXRanges].sort((a, b) => b[0] - a[0]);
  const o = new Outline(key, ["x", "y"]);
  const W = { Cw: cabinetWidth };
  o.add(lit(0), lit(0));
  o.add(ex(W, (t) => t.Cw), lit(0));
  let currentX = Cw;
  if (ranges.length > 0 && ranges[0][1] >= Cw) {
    const [x0] = ranges.shift();
    o.add(ex(W, (t) => t.Cw), ex(use(K, "notchY"), (t) => t.notchY));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "notchY"), (t) => t.notchY));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "rearY"), (t) => t.rearY));
    currentX = x0;
  } else {
    o.add(ex(W, (t) => t.Cw), ex(use(K, "rearY"), (t) => t.rearY));
    currentX = Cw;
  }
  while (ranges.length > 0) {
    const [x0, x1] = ranges.shift();
    if (x0 <= 0) {
      o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "rearY"), (t) => t.rearY));
      o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "notchY"), (t) => t.notchY));
      o.add(lit(0), ex(use(K, "notchY"), (t) => t.notchY));
      o.add(lit(0), lit(0));
      return o.points;
    }
    o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "rearY"), (t) => t.rearY));
    o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "notchY"), (t) => t.notchY));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "notchY"), (t) => t.notchY));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "rearY"), (t) => t.rearY));
    currentX = x0;
  }
  if (currentX > 0) {
    o.add(lit(0), ex(use(K, "rearY"), (t) => t.rearY));
    o.add(lit(0), lit(0));
  }
  return o.points;
}
function t4TrimmedOutlinePoints(cabinetWidth, notchXRanges, t4Height = RULES.T4_HEIGHT_MM, notchHeight = RULES.T4_NOTCH_HEIGHT_MM, key = "T4.pv") {
  const K = (n) => `${key}.${n}`;
  const Cw = val(cabinetWidth);
  const top = dim(K("top"), { T4_HEIGHT: t4Height }, (t) => t.T4_HEIGHT);
  const notchZ = dim(K("notchZ"), { T4_NOTCH_HEIGHT: notchHeight }, (t) => t.T4_NOTCH_HEIGHT);
  const ranges = [...notchXRanges].sort((a, b) => b[0] - a[0]);
  const o = new Outline(key, ["x", "z"]);
  const W = { Cw: cabinetWidth };
  o.add(lit(0), ex(use(K, "top"), (t) => t.top));
  o.add(ex(W, (t) => t.Cw), ex(use(K, "top"), (t) => t.top));
  let currentX = Cw;
  if (ranges.length > 0 && ranges[0][1] >= Cw) {
    const [x0] = ranges.shift();
    o.add(ex(W, (t) => t.Cw), ex(use(K, "notchZ"), (t) => t.notchZ));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "notchZ"), (t) => t.notchZ));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), lit(0));
    currentX = x0;
  } else {
    o.add(ex(W, (t) => t.Cw), lit(0));
    currentX = Cw;
  }
  while (ranges.length > 0) {
    const [x0, x1] = ranges.shift();
    if (x0 <= 0) {
      o.add(ex({ notchX1: x1 }, (t) => t.notchX1), lit(0));
      o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "notchZ"), (t) => t.notchZ));
      o.add(lit(0), ex(use(K, "notchZ"), (t) => t.notchZ));
      o.add(lit(0), ex(use(K, "top"), (t) => t.top));
      return o.points;
    }
    o.add(ex({ notchX1: x1 }, (t) => t.notchX1), lit(0));
    o.add(ex({ notchX1: x1 }, (t) => t.notchX1), ex(use(K, "notchZ"), (t) => t.notchZ));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), ex(use(K, "notchZ"), (t) => t.notchZ));
    o.add(ex({ notchX0: x0 }, (t) => t.notchX0), lit(0));
    currentX = x0;
  }
  if (currentX > 0) {
    o.add(lit(0), lit(0));
    o.add(lit(0), ex(use(K, "top"), (t) => t.top));
  }
  return o.points;
}
function dividerSideTrimmedOutlinePoints(cabinetDepth, cabinetHeight, fgWidth = RULES.DIVIDER_THICKNESS_MM, tongueHeight, routerDiameter = RULES.DEFAULT_ROUTER_DIAMETER_MM, featureSlotWidth = FEATURE_GROOVE_WIDTH_MM, topClearanceHeight = RULES.T1_HEIGHT_MM, style = "style_1", frontPanelThickness = RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM, key = "DividerSide") {
  if (cabinetHeight == null) {
    return [];
  }
  const K = (n) => `${key}.${n}`;
  const Cd = cabinetDepth;
  const H = cabinetHeight;
  const CPT = fgWidth;
  if (tongueHeight !== void 0) dim(K("tongueHeight"), { tongueHeight }, (t) => t.tongueHeight);
  else dim(K("tongueHeight"), { CPT }, (t) => t.CPT / 2 - 0.5);
  dim(K("dividerHeight"), { H, CPT }, (t) => t.H - t.CPT);
  void routerDiameter;
  dim(K("tongueY0"), { Cd }, (t) => t.Cd / 3 + 5);
  dim(K("tongueY1"), { Cd }, (t) => 2 * t.Cd / 3 - 5);
  dim(K("tongueZ0"), use(K, "tongueHeight"), (t) => -t.tongueHeight);
  if (style === "style_2") dim(K("frontY0"), { FPT: frontPanelThickness, CPT }, (t) => t.FPT + t.CPT);
  else dim(K("frontY0"), { FRONT_TOP_NOTCH_Y_OFFSET: RULES.FRONT_TOP_NOTCH_Y_OFFSET_MM }, (t) => t.FRONT_TOP_NOTCH_Y_OFFSET);
  dim(K("frontZ0"), { ...use(K, "dividerHeight"), TCH: topClearanceHeight }, (t) => t.dividerHeight - t.TCH);
  dim(K("rearY0"), { Cd, slot: featureSlotWidth }, (t) => t.Cd - t.slot);
  dim(K("rearZ0"), { ...use(K, "dividerHeight"), T4_HEIGHT: RULES.T4_HEIGHT_MM, CPT }, (t) => t.dividerHeight - (t.T4_HEIGHT - t.CPT));
  dim(
    K("frontStepY1"),
    { FRONT_TOP_NOTCH_Y_OFFSET: RULES.FRONT_TOP_NOTCH_Y_OFFSET_MM, FRONT_TOP_STEP_Y: RULES.FRONT_TOP_STEP_Y_MM },
    (t) => t.FRONT_TOP_NOTCH_Y_OFFSET + t.FRONT_TOP_STEP_Y
  );
  dim(K("frontStepZ1"), { ...use(K, "frontZ0"), slot: featureSlotWidth }, (t) => t.frontZ0 - t.slot);
  const o = new Outline(key, ["y", "z"]);
  const r = (n) => ex(use(K, n), (t) => t[n], n);
  o.add(lit(0), lit(0));
  o.add(r("tongueY0"), lit(0));
  o.add(r("tongueY0"), r("tongueZ0"));
  o.add(r("tongueY1"), r("tongueZ0"));
  o.add(r("tongueY1"), lit(0));
  o.add(ex({ Cd }, (t) => t.Cd), lit(0));
  o.add(ex({ Cd }, (t) => t.Cd), r("rearZ0"));
  o.add(r("rearY0"), r("rearZ0"));
  o.add(r("rearY0"), r("dividerHeight"));
  o.add(r("frontY0"), r("dividerHeight"));
  o.add(r("frontY0"), r("frontZ0"));
  o.add(r("frontStepY1"), r("frontZ0"));
  o.add(r("frontStepY1"), r("frontStepZ1"));
  o.add(ex({ ...use(K, "frontStepY1"), T3_DEPTH: RULES.T3_DEPTH_MM }, (t) => t.frontStepY1 - (t.T3_DEPTH - 10)), r("frontStepZ1"));
  o.add(lit(0), lit(0));
  return o.points;
}
function bottomPanel(inputs) {
  const bottomThickness = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  return {
    origin: "left-top-front",
    global_origin: [0, 0, bottomThickness],
    size: [inputs.cabinetWidth, inputs.cabinetDepth, bottomThickness],
    local_bounds: {
      x: [0, inputs.cabinetWidth],
      y: [0, inputs.cabinetDepth],
      z: [-bottomThickness, 0]
    }
  };
}
function dividerFeature(dividerId, centerlineX, inputs) {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const featureSlotWidth = fgWidth + FEATURE_CLEARANCE_MM;
  const dividerTongueHeight = inputs.dividerTongueHeight ?? fgWidth / 2 - 0.5;
  const bpGrooveDepth = fgWidth / 2;
  const routerDiameter = inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM;
  const feature = {
    id: dividerId,
    XDi: centerlineX,
    bp_groove: bpGroove(
      dividerId,
      centerlineX,
      inputs.cabinetDepth,
      featureSlotWidth,
      bpGrooveDepth,
      inputs.cabinetWidth
    ),
    screw_holes: screwHolePositions(centerlineX, inputs.cabinetDepth),
    divider_tongue: {
      length_y: dividerTongueLength(inputs.cabinetDepth, routerDiameter),
      y: dividerTongueYRange(inputs.cabinetDepth, routerDiameter),
      z: [-dividerTongueHeight, 0]
    },
    t3_notch: t3Notch(dividerId, centerlineX, featureSlotWidth, inputs.cabinetWidth),
    t4_notch: t4Notch(dividerId, centerlineX, featureSlotWidth, inputs.cabinetWidth)
  };
  const P = paramTerms(inputs);
  const CPT = orRule(inputs.featureWidth, "CPT", RULES.DIVIDER_THICKNESS_MM);
  const K = (n) => `BP.feat.BG_${dividerId}.${n}`;
  dim(K("x0"), { XDi: centerlineX, CPT, FEATURE_CLEARANCE: RULES.FEATURE_CLEARANCE_MM, Cw: P.Cw }, (t) => Math.max(0, t.XDi - (t.CPT + t.FEATURE_CLEARANCE) / 2));
  dim(K("x1"), { XDi: centerlineX, CPT, FEATURE_CLEARANCE: RULES.FEATURE_CLEARANCE_MM, Cw: P.Cw }, (t) => Math.min(t.Cw, t.XDi + (t.CPT + t.FEATURE_CLEARANCE) / 2));
  dim(K("y0"), { Cd: P.Cd }, (t) => t.Cd / 3);
  dim(K("y1"), { Cd: P.Cd }, (t) => 2 * t.Cd / 3);
  dim(K("z1"), { CPT }, (t) => -(t.CPT / 2));
  return feature;
}
function normalizeStyle(style) {
  return style === "style_2" ? "style_2" : "style_1";
}
function resolveZones(inputs) {
  if (Array.isArray(inputs.zones) && inputs.zones.length > 0) {
    let x = 0;
    return inputs.zones.map((zone, index) => {
      const width = Number(zone.width) || 0;
      const out = {
        id: zone.id || `zone-${index + 1}`,
        type: zone.type || "up_flap",
        width,
        x0: x,
        x1: x + width
      };
      x += width;
      return out;
    });
  }
  const centers = inputs.internalDividerCenterlines ?? [];
  const boundaries = [0, ...centers, inputs.cabinetWidth];
  return boundaries.slice(0, -1).map((x0, index) => ({
    id: `zone-${index + 1}`,
    type: index % 2 === 0 ? "up_flap" : "fixed_panel",
    width: boundaries[index + 1] - x0,
    x0,
    x1: boundaries[index + 1]
  }));
}
function frontPanels(inputs, zones, centers) {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const clearance = inputs.clearance ?? RULES.DEFAULT_CLEARANCE_MM.value;
  const fpThickness = inputs.frontPanelThickness ?? RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM.value;
  const topClearanceHeight = inputs.topClearanceHeight ?? T1_HEIGHT_MM;
  const functionZoneHeight = (inputs.cabinetHeight ?? topClearanceHeight) - topClearanceHeight;
  const P = paramTerms(inputs);
  const CL = orRule(inputs.clearance, "clearance", RULES.DEFAULT_CLEARANCE_MM);
  const FPT = orRule(inputs.frontPanelThickness, "FPT", RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM);
  const TCH = orRule(inputs.topClearanceHeight, "TCH", RULES.T1_HEIGHT_MM);
  return zones.map((zone, index) => {
    if (zone.type === "open") return null;
    const K = (n) => `FP${index}.${n}`;
    const openingX0 = centers[index] + fgWidth / 2;
    const openingX1 = centers[index + 1] - fgWidth / 2;
    const leftEdge = zone.x0 <= 0;
    const rightEdge = zone.x1 >= inputs.cabinetWidth;
    const x0 = leftEdge ? dim(K("x0"), { zoneX0: zone.x0, clearance: CL }, (t) => t.zoneX0 + t.clearance) : dim(K("x0"), { zoneX0: zone.x0, clearance: CL }, (t) => t.zoneX0 + t.clearance / 2);
    const x1 = rightEdge ? dim(K("x1"), { zoneX1: zone.x1, clearance: CL }, (t) => t.zoneX1 - t.clearance) : dim(K("x1"), { zoneX1: zone.x1, clearance: CL }, (t) => t.zoneX1 - t.clearance / 2);
    const y0 = dim(K("y0"), { FPT }, (t) => -t.FPT);
    const y1 = dim(K("y1"), {}, () => 0, { formula: "0" });
    const z0 = dim(K("z0"), {}, () => -30, { formula: "-30" });
    const z1 = inputs.cabinetHeight == null ? dim(K("z1"), {}, () => functionZoneHeight - 1, { formula: "FZH - 1" }) : dim(K("z1"), { H: P.H, TCH }, (t) => t.H - t.TCH - 1);
    return {
      id: `FP${index}`,
      zoneId: zone.id,
      zoneIndex: index,
      type: zone.type,
      x: [x0, x1],
      y: [y0, y1],
      z: [z0, z1],
      width: x1 - x0,
      height: z1 - z0,
      thickness: fpThickness,
      clearance,
      opening: {
        x: [openingX0, openingX1],
        width: openingX1 - openingX0
      }
    };
  }).filter((panel) => panel !== null);
}
function hingeHoles(panels, inputs) {
  const holeDiameter = inputs.hingeHoleDiameter ?? RULES.DEFAULT_HINGE_HOLE_DIAMETER_MM.value;
  const holeDepth = inputs.hingeHoleDepth ?? RULES.DEFAULT_HINGE_HOLE_DEPTH_MM.value;
  const fromTop = orRule(inputs.hingeHoleFromTop, "hingeHoleFromTop", RULES.DEFAULT_HINGE_HOLE_FROM_TOP_MM);
  const fromSide = orRule(inputs.hingeHoleFromSide, "hingeHoleFromSide", RULES.DEFAULT_HINGE_HOLE_FROM_SIDE_MM);
  return panels.filter((panel) => panel.type === "up_flap" || panel.type === "rangehood_flap").flatMap((panel) => {
    const K = (n, c) => `${panel.id}.feat.HINGE_${n}.${c}`;
    return [0, 1].map((index) => {
      const n = index + 1;
      const px = index === 0 ? dim(K(n, "x"), { fromSide }, (t) => t.fromSide) : dim(K(n, "x"), { panelWidth: panel.width, fromSide }, (t) => t.panelWidth - t.fromSide);
      const pz = dim(K(n, "z"), { panelHeight: panel.height, fromTop }, (t) => t.panelHeight - t.fromTop);
      return {
        id: `${panel.id}_HINGE_${n}`,
        boardId: panel.id,
        center: [px, pz],
        diameter: holeDiameter,
        depth: holeDepth,
        axis: "Y",
        purpose: "hinge",
        face: "back"
      };
    });
  });
}
function buildLegacyGeometry(inputs, centers) {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const featureSlotWidth = fgWidth + FEATURE_CLEARANCE_MM;
  const routerDiameter = inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM;
  const style = normalizeStyle(inputs.style);
  const topClearanceHeight = inputs.topClearanceHeight ?? T1_HEIGHT_MM;
  const frontPanelThickness = inputs.frontPanelThickness ?? RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM.value;
  const dntgH = inputs.dividerTongueHeight ?? fgWidth / 2 - 0.5;
  const zones = resolveZones(inputs);
  const panels = frontPanels(inputs, zones, centers);
  const dividerIds = centers.map((_, index) => `D${index}`);
  const P = paramTerms(inputs);
  const CPT = orRule(inputs.featureWidth, "CPT", RULES.DIVIDER_THICKNESS_MM);
  const TCH = orRule(inputs.topClearanceHeight, "TCH", RULES.T1_HEIGHT_MM);
  const FPT = orRule(inputs.frontPanelThickness, "FPT", RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM);
  dim("FeatureSlotWidth", { CPT, FEATURE_CLEARANCE: RULES.FEATURE_CLEARANCE_MM }, (t) => t.CPT + t.FEATURE_CLEARANCE);
  const notchRanges = centers.map((centerlineX) => clampRange(featureXRange(centerlineX, featureSlotWidth), 0, inputs.cabinetWidth));
  return {
    cabinet: {
      Cw: inputs.cabinetWidth,
      Cd: inputs.cabinetDepth,
      Ch: inputs.cabinetHeight ?? null
    },
    manufacturing: {
      Crd: routerDiameter,
      Crr: routerDiameter / 2,
      FGw: fgWidth,
      FGh: fgWidth / 2,
      FPt: frontPanelThickness,
      TCH: topClearanceHeight,
      FZH: (inputs.cabinetHeight ?? topClearanceHeight) - topClearanceHeight,
      FitClearance: FEATURE_CLEARANCE_MM,
      FeatureSlotWidth: featureSlotWidth,
      Dntg_h: dntgH,
      style
    },
    bottom_panel: bottomPanel(inputs),
    divider_features: dividerIds.map(
      (dividerId, index) => dividerFeature(dividerId, centers[index], inputs)
    ),
    front_panels: panels,
    hinge_holes: hingeHoles(panels, inputs),
    panel_screw_holes: {
      T2: panelScrewHoles("T2", centers, topClearanceHeight / 2),
      T3: panelScrewHoles("T3", centers, T3_DEPTH_MM / 2),
      T4: panelScrewHoles(
        "T4",
        centers,
        T4_NOTCH_HEIGHT_MM + T4_SCREW_HOLE_NOTCH_CLEARANCE_MM + T4_SCREW_HOLE_UP_SHIFT_MM
      )
    },
    trimmed_vectors: {
      T3: t3TrimmedOutlinePoints(P.Cw, notchRanges),
      T4: t4TrimmedOutlinePoints(P.Cw, notchRanges),
      DividerSide: dividerSideTrimmedOutlinePoints(
        P.Cd,
        inputs.cabinetHeight == null ? null : P.H,
        CPT,
        inputs.dividerTongueHeight == null ? void 0 : P.tongueHeight,
        P.routerDiameter,
        ref("FeatureSlotWidth"),
        TCH,
        style,
        FPT
      )
    }
  };
}
function calculateOverheadGeometry(inputs) {
  const fgWidth = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const zones = resolveZones(inputs);
  const internalCenters = Array.isArray(inputs.zones) && inputs.zones.length > 0 ? zones.slice(0, -1).map((zone) => zone.x1) : inputs.internalDividerCenterlines ?? [];
  const centers = dividerCenterlines(inputs.cabinetWidth, internalCenters, fgWidth);
  return buildLegacyGeometry(inputs, centers);
}
function calculateOverheadGeometryFromXds(cabinetWidth, cabinetDepth, cabinetHeight, xds, bottomThickness = BOTTOM_THICKNESS_MM, dividerTongueHeight = DIVIDER_TONGUE_HEIGHT_MM, routerDiameter = DEFAULT_ROUTER_DIAMETER_MM, featureWidth = DIVIDER_THICKNESS_MM) {
  const inputs = {
    cabinetWidth,
    cabinetDepth,
    cabinetHeight,
    bottomThickness,
    dividerTongueHeight,
    routerDiameter,
    featureWidth,
    internalDividerCenterlines: xds.slice(1, -1)
  };
  return buildLegacyGeometry(inputs, xds);
}
function calculateOverheadGeometryFromInternalXds(cabinetWidth, cabinetDepth, cabinetHeight, internalXds, bottomThickness = BOTTOM_THICKNESS_MM, dividerTongueHeight, routerDiameter = DEFAULT_ROUTER_DIAMETER_MM, featureWidth = DIVIDER_THICKNESS_MM) {
  const resolvedTongueHeight = dividerTongueHeight ?? featureWidth / 2 - 0.5;
  const [leftXd, rightXd] = edgeDividerCenterlines(cabinetWidth, featureWidth);
  return calculateOverheadGeometryFromXds(
    cabinetWidth,
    cabinetDepth,
    cabinetHeight,
    [leftXd, ...internalXds, rightXd],
    bottomThickness,
    resolvedTongueHeight,
    routerDiameter,
    featureWidth
  );
}
function testCase001Geometry() {
  return calculateOverheadGeometryFromInternalXds(
    500,
    300,
    null,
    [125, 250, 375],
    BOTTOM_THICKNESS_MM,
    void 0,
    10,
    16
  );
}

// generators/overheadCabinet/svgPreview.ts
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
function panelFill(type) {
  if (type === "rangehood_flap") return "#f3e8ff";
  if (type === "fixed_panel") return "#eef8ea";
  if (type === "open") return "#fff7dc";
  return "#e5f2ff";
}
function generateOHCSvgPreview(geometry, options = {}) {
  const width = options.width ?? 760;
  const height = options.height ?? 390;
  const showDimensions = options.showDimensions ?? true;
  const selectedZoneIndex = options.selectedZoneIndex ?? -1;
  const cw = geometry.cabinet.Cw;
  const ch = geometry.cabinet.Ch ?? geometry.manufacturing.TCH;
  const fg = geometry.manufacturing.FGw;
  const fpThickness = geometry.manufacturing.FPt;
  const tch = geometry.manufacturing.TCH;
  const fzh = geometry.manufacturing.FZH;
  const clearance = geometry.front_panels[0]?.clearance ?? 0;
  const padLeft = 46;
  const padTop = 36;
  const scale = Math.min((width - padLeft - 30) / Math.max(cw, 1), (height - padTop - 96) / Math.max(ch, 1));
  const ox = padLeft;
  const oy = padTop;
  const bodyW = cw * scale;
  const bodyH = ch * scale;
  const toX = (x) => ox + x * scale;
  const toY = (z) => oy + (ch - z) * scale;
  const rectFromXZ = (x0, z0, x1, z1) => ({
    x: toX(x0),
    y: toY(z1),
    w: Math.max((x1 - x0) * scale, 1),
    h: Math.max((z1 - z0) * scale, 1)
  });
  const dividerRects = geometry.divider_features.map((feature, index) => {
    const x0 = feature.XDi - fg / 2;
    const x1 = feature.XDi + fg / 2;
    const clampedX0 = Math.max(0, x0);
    const clampedX1 = Math.min(cw, x1);
    const r = rectFromXZ(clampedX0, 0, clampedX1, ch);
    const isEdge = index === 0 || index === geometry.divider_features.length - 1;
    const centerX = toX(feature.XDi);
    const labelY = oy + bodyH + 56 + index % 2 * 14;
    return `
      <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="rgba(92,75,55,0.45)" stroke="#6e5a42"></rect>
      ${isEdge ? `<text x="${fmt(centerX)}" y="${fmt(oy - 11)}" text-anchor="middle" fill="#6e5a42" font-size="10">edge divider</text>` : `
        <line x1="${fmt(centerX)}" y1="${fmt(oy - 8)}" x2="${fmt(centerX)}" y2="${fmt(oy + bodyH + 12)}" stroke="#e5484d" stroke-dasharray="5 4"></line>
        <text x="${fmt(centerX)}" y="${fmt(oy - 11)}" text-anchor="middle" fill="#e5484d" font-size="10">drag boundary</text>`}
      ${showDimensions ? `
        <line x1="${fmt(r.x)}" y1="${fmt(labelY)}" x2="${fmt(r.x + r.w)}" y2="${fmt(labelY)}" stroke="#6e5a42"></line>
        <line x1="${fmt(r.x)}" y1="${fmt(labelY - 4)}" x2="${fmt(r.x)}" y2="${fmt(labelY + 4)}" stroke="#6e5a42"></line>
        <line x1="${fmt(r.x + r.w)}" y1="${fmt(labelY - 4)}" x2="${fmt(r.x + r.w)}" y2="${fmt(labelY + 4)}" stroke="#6e5a42"></line>
        <text x="${fmt(r.x + r.w / 2)}" y="${fmt(labelY - 4)}" text-anchor="middle" fill="#6e5a42" font-size="10">D${index} ${fmt(fg)} mm</text>` : ""}
    `;
  }).join("");
  const openingRects = geometry.front_panels.map((panel) => {
    const opening = rectFromXZ(panel.opening.x[0], 0, panel.opening.x[1], fzh);
    const selected = panel.zoneIndex === selectedZoneIndex;
    const dimensionY = oy + bodyH + 20 + panel.zoneIndex % 2 * 15;
    return `
      <rect x="${fmt(opening.x)}" y="${fmt(opening.y)}" width="${fmt(opening.w)}" height="${fmt(opening.h)}" fill="${panelFill(panel.type)}" stroke="${selected ? "#0f6bff" : "#9db6d5"}" stroke-width="${selected ? 2 : 1}"></rect>
      ${showDimensions ? `
        <line x1="${fmt(opening.x)}" y1="${fmt(dimensionY)}" x2="${fmt(opening.x + opening.w)}" y2="${fmt(dimensionY)}" stroke="#0f6bff"></line>
        <line x1="${fmt(opening.x)}" y1="${fmt(dimensionY - 4)}" x2="${fmt(opening.x)}" y2="${fmt(dimensionY + 4)}" stroke="#0f6bff"></line>
        <line x1="${fmt(opening.x + opening.w)}" y1="${fmt(dimensionY - 4)}" x2="${fmt(opening.x + opening.w)}" y2="${fmt(dimensionY + 4)}" stroke="#0f6bff"></line>
        <text x="${fmt(opening.x + opening.w / 2)}" y="${fmt(dimensionY - 3)}" text-anchor="middle" fill="#0f6bff" font-size="10">opening ${fmt(panel.opening.width)} mm</text>` : ""}
    `;
  }).join("");
  const frontPanelRects = geometry.front_panels.map((panel) => {
    const r = rectFromXZ(panel.x[0], panel.z[0], panel.x[1], panel.z[1]);
    const label = panel.type === "fixed_panel" ? "Fixed Panel" : panel.type === "rangehood_flap" ? "Rangehood Flap" : "Up Flap";
    return `
      <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="none" stroke="#66758a" stroke-width="1.2"></rect>
      <text x="${fmt(r.x + r.w / 2)}" y="${fmt(r.y + r.h / 2 - 4)}" text-anchor="middle" fill="#22344d" font-size="12">${esc(label)}</text>
      <text x="${fmt(r.x + r.w / 2)}" y="${fmt(r.y + r.h / 2 + 13)}" text-anchor="middle" fill="#22344d" font-size="11">${esc(panel.id)}</text>
    `;
  }).join("");
  const hingeHoles2 = geometry.hinge_holes.map((hole) => {
    const panel = geometry.front_panels.find((candidate) => candidate.id === hole.boardId);
    if (!panel) return "";
    const x = panel.x[0] + hole.center[0];
    const z = panel.z[0] + hole.center[1];
    return `<circle cx="${fmt(toX(x))}" cy="${fmt(toY(z))}" r="${fmt(Math.max(hole.diameter / 2 * scale, 4))}" fill="none" stroke="#66758a" stroke-dasharray="4 2"></circle>`;
  }).join("");
  const bp = rectFromXZ(0, 0, cw, fg);
  const topArea = rectFromXZ(0, ch - tch, cw, ch);
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="OHC front elevation geometry preview">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fbff"></rect>
      ${showDimensions ? `
        <line x1="${fmt(ox)}" y1="${fmt(oy - 14)}" x2="${fmt(ox + bodyW)}" y2="${fmt(oy - 14)}" stroke="#222"></line>
        <text x="${fmt(ox + bodyW / 2)}" y="${fmt(oy - 18)}" text-anchor="middle" fill="#222" font-size="11">${fmt(cw)}</text>
        <line x1="${fmt(ox - 14)}" y1="${fmt(oy)}" x2="${fmt(ox - 14)}" y2="${fmt(oy + bodyH)}" stroke="#222"></line>
        <text x="${fmt(ox - 20)}" y="${fmt(oy + bodyH / 2)}" text-anchor="middle" fill="#222" font-size="11" transform="rotate(-90 ${fmt(ox - 20)} ${fmt(oy + bodyH / 2)})">${fmt(ch)}</text>` : ""}
      <rect x="${fmt(ox)}" y="${fmt(oy)}" width="${fmt(bodyW)}" height="${fmt(bodyH)}" fill="#f4f0e6" stroke="#5c4b37" stroke-width="2"></rect>
      <rect x="${fmt(topArea.x)}" y="${fmt(topArea.y)}" width="${fmt(topArea.w)}" height="${fmt(topArea.h)}" fill="rgba(15,107,255,0.06)" stroke="#85b5ff" stroke-dasharray="5 3"></rect>
      <text x="${fmt(topArea.x + topArea.w - 6)}" y="${fmt(topArea.y + 14)}" text-anchor="end" fill="#0b57d0" font-size="10">T1/T2 / TCH ${fmt(tch)}</text>
      ${openingRects}
      ${frontPanelRects}
      <rect x="${fmt(bp.x)}" y="${fmt(bp.y)}" width="${fmt(bp.w)}" height="${fmt(bp.h)}" fill="#c7b9a2" stroke="#6e5a42"></rect>
      <text x="${fmt(bp.x + 6)}" y="${fmt(bp.y - 4)}" fill="#6e5a42" font-size="10">BP ${fmt(fg)} mm</text>
      ${dividerRects}
      ${hingeHoles2}
      <text x="${fmt(ox + 4)}" y="${fmt(oy + bodyH + 18)}" fill="#6d7a8d" font-size="11">FGw ${fmt(fg)} mm, FPt/T1 ${fmt(fpThickness)} mm, clearance ${fmt(clearance)} mm</text>
    </svg>`;
}

// generators/overheadCabinet/relationshipDeclarations.ts
var OVERHEAD_RELATIONSHIP_DECLARATIONS = [
  {
    declarationId: "oh_bp_d0_back_to_divider",
    generator: "overhead",
    panelAId: "BP",
    panelBId: "D0",
    relationshipType: "structural_butt_joint",
    geometryType: "edge_to_surface",
    hostPanelId: "BP",
    targetPanelId: "D0",
    ruleId: "overhead_back_divider_v1",
    allowedHardware: ["screw_hole"]
  },
  {
    declarationId: "oh_bp_fp0_back_to_front",
    generator: "overhead",
    panelAId: "BP",
    panelBId: "FP0",
    relationshipType: "structural_butt_joint",
    geometryType: "edge_to_surface",
    hostPanelId: "BP",
    targetPanelId: "FP0",
    ruleId: "overhead_back_front_v1",
    allowedHardware: ["screw_hole"]
  },
  {
    declarationId: "oh_d0_fp0_divider_to_front",
    generator: "overhead",
    panelAId: "D0",
    panelBId: "FP0",
    relationshipType: "structural_butt_joint",
    geometryType: "edge_to_surface",
    hostPanelId: "D0",
    targetPanelId: "FP0",
    ruleId: "overhead_divider_front_v1",
    allowedHardware: ["screw_hole"]
  },
  {
    declarationId: "oh_t1_t2_top_rail_stack",
    generator: "overhead",
    panelAId: "T1",
    panelBId: "T2",
    relationshipType: "face_contact",
    geometryType: "surface_to_surface",
    hostPanelId: "T1",
    targetPanelId: "T2",
    ruleId: "overhead_top_rail_stack_v1",
    allowedHardware: []
  }
];
function relationshipDeclarationsForBoards(boards) {
  const boardIds = new Set(boards.map((board) => board.id));
  return OVERHEAD_RELATIONSHIP_DECLARATIONS.filter((item) => {
    const required = /* @__PURE__ */ new Set([item.panelAId, item.panelBId, item.hostPanelId, item.targetPanelId]);
    for (const boardId of required) {
      if (!boardIds.has(boardId)) {
        return false;
      }
    }
    return true;
  });
}

// generators/_lib/model.ts
function planeAxes(plane) {
  if (plane === "YZ") return ["y", "z", "x"];
  if (plane === "XZ") return ["x", "z", "y"];
  return ["x", "y", "z"];
}
function localOutline(b) {
  const [U, V] = planeAxes(b.profilePlane);
  let pts = null;
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector : null;
  if (b.profilePlane === "YZ") {
    if (pv) pts = pv.map((p) => [Number(p.y) - b.y0, Number(p.z) - b.z0]);
    else if (b.cutProfileVector && b.cutProfileVector.length >= 4) pts = b.cutProfileVector.map((p) => [p.y, p.z]);
  } else if (pv) {
    const mu = Math.min(...pv.map((p) => Number(p[U])));
    const mv = Math.min(...pv.map((p) => Number(p[V])));
    pts = pv.map((p) => [Number(p[U]) - mu, Number(p[V]) - mv]);
  }
  if (!pts) return null;
  const out = pts.slice();
  const first = out[0];
  const last = out[out.length - 1];
  if (out.length > 2 && Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) out.pop();
  return out.length >= 3 ? out : null;
}
function rectOutline(b) {
  const [U, V] = planeAxes(b.profilePlane);
  const w = b[`${U}1`] - b[`${U}0`];
  const h = b[`${V}1`] - b[`${V}0`];
  return [[0, 0], [w, 0], [w, h], [0, h]];
}
function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}
var AXIS_UPPER = { x: "X", y: "Y", z: "Z" };
function edgeNormal(plane, from, to, ccw) {
  const [U, V] = planeAxes(plane);
  const du = to[0] - from[0];
  const dv = to[1] - from[1];
  let nu = ccw ? dv : -dv;
  let nv = ccw ? -du : du;
  const len = Math.hypot(nu, nv) || 1;
  nu /= len;
  nv /= len;
  const eps = 1e-9;
  if (Math.abs(nv) < eps) return `${nu > 0 ? "+" : "-"}${AXIS_UPPER[U]}`;
  if (Math.abs(nu) < eps) return `${nv > 0 ? "+" : "-"}${AXIS_UPPER[V]}`;
  const vec = [0, 0, 0];
  const idx = { x: 0, y: 1, z: 2 };
  vec[idx[U]] = nu;
  vec[idx[V]] = nv;
  return vec;
}
function facesOf(b) {
  const [, , T] = planeAxes(b.profilePlane);
  const t = AXIS_UPPER[T];
  const faces = [
    { id: "A", key: `${b.id}.A`, normal: `+${t}`, planeKey: `${b.id}.${T}1`, features: [] },
    { id: "B", key: `${b.id}.B`, normal: `-${t}`, planeKey: `${b.id}.${T}0`, features: [] }
  ];
  const outline = localOutline(b) ?? rectOutline(b);
  const ccw = signedArea(outline) > 0;
  for (let i = 0; i < outline.length; i += 1) {
    const from = outline[i];
    const to = outline[(i + 1) % outline.length];
    faces.push({
      id: `E${i}`,
      key: `${b.id}.E${i}`,
      normal: edgeNormal(b.profilePlane, from, to, ccw),
      segments: [i],
      edge: { from: [from[0], from[1]], to: [to[0], to[1]] },
      features: []
    });
  }
  return faces;
}
function attachFaces(boards) {
  for (const b of boards) b.faces = facesOf(b);
  return boards;
}
function faceOf(b, id) {
  const f = (b.faces ?? (b.faces = facesOf(b))).find((x) => x.id === id);
  if (!f) throw new Error(`${b.id}: no face ${id}`);
  return f;
}
function addFeature(b, faceId, feature) {
  faceOf(b, faceId).features.push(feature);
  return feature;
}
function edgeFaces(b) {
  return (b.faces ?? (b.faces = facesOf(b))).filter((f) => f.id.startsWith("E"));
}
function edgeFacesIn(b, box) {
  return edgeFaces(b).filter((f) => {
    const mu = (f.edge.from[0] + f.edge.to[0]) / 2;
    const mv = (f.edge.from[1] + f.edge.to[1]) / 2;
    return mu >= box.u0 && mu <= box.u1 && mv >= box.v0 && mv <= box.v1;
  });
}
function boundaryEdgeFaces(b, normal, tol = 0.01) {
  const [U, V] = planeAxes(b.profilePlane);
  const axis = normal[1].toLowerCase();
  const c = axis === U ? 0 : axis === V ? 1 : -1;
  if (c < 0) return [];
  const all = edgeFaces(b);
  const coords = all.flatMap((f) => [f.edge.from[c], f.edge.to[c]]);
  const extreme = normal[0] === "+" ? Math.max(...coords) : Math.min(...coords);
  return all.filter((f) => f.normal === normal && Math.abs(f.edge.from[c] - extreme) <= tol && Math.abs(f.edge.to[c] - extreme) <= tol);
}
function tagEdges(b, kind, box, meta) {
  const hit = edgeFacesIn(b, box);
  for (const f of hit) f.features.push({ kind, ...meta });
  return hit.map((f) => f.id);
}
function annotate(b, faceId, a) {
  Object.assign(faceOf(b, faceId), a);
}
function localRect(b, r) {
  const [U, V] = planeAxes(b.profilePlane);
  const ru = r[U];
  const rv = r[V];
  if (!ru || !rv) throw new Error(`${b.id}: rectangle needs ${U} and ${V} ranges`);
  return {
    u0: Math.min(...ru) - b[`${U}0`],
    u1: Math.max(...ru) - b[`${U}0`],
    v0: Math.min(...rv) - b[`${V}0`],
    v1: Math.max(...rv) - b[`${V}0`]
  };
}
function bigFaceToward(b, dir) {
  const [, , T] = planeAxes(b.profilePlane);
  if (dir[1] !== AXIS_UPPER[T]) return null;
  return faceOf(b, dir[0] === "+" ? "A" : "B");
}
function joint(id, kind, a, b, extra = {}) {
  return { id, kind, a, b, ...extra };
}
function faceRef(board, faces) {
  return { board, faces: faces.map((f) => typeof f === "string" ? f : f.id) };
}

// generators/overheadCabinet/faces.ts
var EPS = 0.01;
function byId(boards) {
  return new Map(boards.map((b) => [b.id, b]));
}
function orRule2(v, name, rule) {
  return v == null ? rule : param({ [name]: v })[name];
}
function buildOverheadFaces(fb) {
  const { boards, geometry, inputs } = fb;
  const B = byId(boards);
  const cpt = geometry.manufacturing.FGw;
  const CPT = orRule2(inputs.featureWidth, "CPT", RULES.DIVIDER_THICKNESS_MM);
  const TCH = orRule2(inputs.topClearanceHeight, "TCH", RULES.T1_HEIGHT_MM);
  for (const b of boards) {
    b.role = b.category;
    const isFront = b.category === "front_panel" || b.id === "T1";
    b.stock = { kind: isFront ? "door" : "carcass", thickness: b.materialThickness, colour: isFront ? void 0 : fb.carcassColorName };
    if (!isFront) {
      annotate(b, "A", { finish: { colour: fb.carcassColorName } });
      annotate(b, "B", { finish: { colour: fb.carcassColorName } });
    }
    if (b.category === "front_panel") {
      annotate(b, "B", { semantic: "front", visible: true });
      annotate(b, "A", { semantic: "back", visible: false });
    }
  }
  const bp = B.get("BP");
  if (bp) {
    annotate(bp, "A", { semantic: "inside" });
    annotate(bp, "B", { semantic: "bottom", visible: true });
  }
  const dividers = boards.filter((b) => b.category === "divider");
  if (dividers.length) {
    annotate(dividers[0], "B", { semantic: "outside" });
    annotate(dividers[dividers.length - 1], "A", { semantic: "outside" });
    for (const d of dividers.slice(1, -1)) {
      annotate(d, "A", { semantic: "inside" });
      annotate(d, "B", { semantic: "inside" });
    }
    annotate(dividers[0], "A", { semantic: "inside" });
    annotate(dividers[dividers.length - 1], "B", { semantic: "inside" });
  }
  const t3 = B.get("T3");
  if (t3) {
    annotate(t3, "A", { semantic: "top" });
    annotate(t3, "B", { semantic: "bottom" });
  }
  if (bp) {
    geometry.divider_features.forEach((df, index) => {
      if (fb.suppressedGrooves.includes(index) || !df.bp_groove) return;
      const g = df.bp_groove;
      const r = localRect(bp, { x: g.x, y: g.y });
      addFeature(bp, "A", {
        id: g.id,
        kind: "groove",
        ...r,
        depth: Math.abs(g.z[1] - g.z[0]),
        for: df.id,
        key: `BP.feat.${g.id}`,
        source: "overhead"
      });
    });
  }
  const slot = geometry.manufacturing.FeatureSlotWidth;
  const tch = geometry.manufacturing.TCH;
  for (const [index, df] of geometry.divider_features.entries()) {
    const d = B.get(df.id);
    if (!d) continue;
    const onRangehood = fb.suppressedGrooves.includes(index);
    const [tongueY0, tongueY1] = df.divider_tongue.y;
    const tongueH = Math.abs(df.divider_tongue.z[0] - df.divider_tongue.z[1]);
    const zTop = d.z1 - d.z0;
    tagEdges(d, "tongue", { u0: tongueY0 - d.y0 - EPS, u1: tongueY1 - d.y0 + EPS, v0: -tongueH - EPS, v1: -EPS }, {
      id: `${df.id}_TONGUE`,
      for: onRangehood ? "RGHD_TOP" : "BP",
      source: "overhead"
    });
    if (B.has("T3")) {
      const frontStepY1 = RULES.FRONT_TOP_NOTCH_Y_OFFSET_MM.value + RULES.FRONT_TOP_STEP_Y_MM.value;
      tagEdges(d, "notch", { u0: -EPS, u1: frontStepY1 + EPS, v0: zTop - tch - slot - EPS, v1: zTop - tch + EPS }, {
        id: `${df.id}_T3_STEP`,
        for: "T3",
        source: "overhead"
      });
    }
    if (B.has("T4")) {
      const rearNotchH = RULES.T4_HEIGHT_MM.value - cpt;
      tagEdges(d, "notch", { u0: d.y1 - d.y0 - slot - EPS, u1: d.y1 - d.y0 + EPS, v0: zTop - rearNotchH - EPS, v1: zTop - EPS }, {
        id: `${df.id}_T4_NOTCH`,
        for: "T4",
        source: "overhead"
      });
    }
  }
  const midlineTerm = {
    T2: { terms: { TCH }, fn: (t) => t.TCH / 2 },
    T3: { terms: { T3_DEPTH: RULES.T3_DEPTH_MM }, fn: (t) => t.T3_DEPTH / 2 },
    T4: {
      terms: { T4_NOTCH: RULES.T4_NOTCH_HEIGHT_MM, CLEAR: RULES.T4_SCREW_HOLE_NOTCH_CLEARANCE_MM, SHIFT: RULES.T4_SCREW_HOLE_UP_SHIFT_MM },
      fn: (t) => t.T4_NOTCH + t.CLEAR + t.SHIFT
    }
  };
  for (const part of ["T2", "T3", "T4"]) {
    const board = B.get(part);
    if (!board) continue;
    const [U, V] = planeAxes(board.profilePlane);
    for (const hole of geometry.panel_screw_holes[part]) {
      const K = `${part}.feat.${hole.id}`;
      const df = geometry.divider_features.find((f) => f.id === hole.for_divider);
      const cu = dim(`${K}.${U}`, { XDi: df?.XDi ?? hole.center[0], [`${part}_${U}0`]: ref(`${part}.${U}0`) }, (t) => t.XDi - t[`${part}_${U}0`], { formula: `XDi - ${part}.${U}0` });
      const m = midlineTerm[part];
      const cv = dim(`${K}.${V}`, m.terms, m.fn);
      addFeature(board, "A", {
        id: hole.id,
        kind: "hole",
        center: [cu, cv],
        diameter: hole.diameter,
        depth: hole.depth,
        through: false,
        for: hole.for_divider,
        key: K,
        source: "overhead"
      });
    }
  }
  for (const h of geometry.hinge_holes) {
    const fp = B.get(h.boardId);
    if (!fp) continue;
    const n = h.id.replace(`${h.boardId}_`, "");
    addFeature(fp, "A", {
      id: h.id,
      kind: "hole",
      center: [h.center[0], h.center[1]],
      diameter: h.diameter,
      depth: h.depth,
      through: false,
      for: "hinge",
      key: `${h.boardId}.feat.${n}`,
      source: "overhead"
    });
  }
  for (const led of fb.ledFeatures) {
    if (led.type !== "t3_groove" || !t3) continue;
    const main = led.main;
    const branches = led.branches ?? [];
    const depth = Number(led.depth);
    const KM = "T3.feat.LED_MAIN";
    dim(`${KM}.x0`, {}, () => 0, { formula: "0" });
    dim(`${KM}.x1`, { x1: ref("T3.x1"), x0: ref("T3.x0") }, (t) => t.x1 - t.x0);
    dim(`${KM}.y0`, { LAND: RULES.LED_GROOVE_FRONT_LAND_MM }, (t) => t.LAND);
    dim(`${KM}.y1`, { LAND: RULES.LED_GROOVE_FRONT_LAND_MM, W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.LAND + t.W);
    addFeature(t3, "A", {
      id: "T3_LED_MAIN",
      kind: "tgroove",
      u0: main.x0,
      u1: main.x1,
      v0: main.y0,
      v1: main.y1,
      depth,
      for: "led",
      key: KM,
      source: "T3"
    });
    branches.forEach((br, i) => {
      const KB = `T3.feat.LED_BRANCH_${i + 1}`;
      const x = i === 0 ? { terms: { INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM, W: RULES.LED_GROOVE_WIDTH_MM }, x0: (t) => t.INSET - t.W / 2, x1: (t) => t.INSET + t.W / 2 } : { terms: { width: ref(`${KM}.x1`), INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM, W: RULES.LED_GROOVE_WIDTH_MM }, x0: (t) => t.width - t.INSET - t.W / 2, x1: (t) => t.width - t.INSET + t.W / 2 };
      dim(`${KB}.x0`, x.terms, x.x0);
      dim(`${KB}.x1`, x.terms, x.x1);
      dim(`${KB}.y0`, { mainY1: ref(`${KM}.y1`) }, (t) => t.mainY1);
      dim(`${KB}.y1`, { rearY: ref("T3.pv.rearY") }, (t) => t.rearY);
      addFeature(t3, "A", {
        id: `T3_LED_BRANCH_${i + 1}`,
        kind: "tgroove",
        u0: br.x0,
        u1: br.x1,
        v0: br.y0,
        v1: br.y1,
        depth,
        for: "led",
        key: KB,
        source: "T3"
      });
    });
  }
  for (const f of fb.rangehoodFeatures) {
    const type = String(f.type);
    if (type === "rangehood_bp_cutout" && bp) {
      const r = localRect(bp, { x: f.x, y: f.y });
      const K = "BP.feat.RGHD_CUTOUT";
      const Cd = param({ Cd: inputs.cabinetDepth }).Cd;
      const edgeOffsetX = param({ edgeOffsetX: Number(f.edgeOffsetX) }).edgeOffsetX;
      if (String(f.alignment) === "left") {
        dim(`${K}.x0`, { rghdX0: ref("RGHD_FRONT.x0"), edgeOffsetX }, (t) => t.rghdX0 + t.edgeOffsetX);
      } else {
        dim(`${K}.x0`, { rghdX1: ref("RGHD_FRONT.x1"), edgeOffsetX, W: RULES.RANGEHOOD_CUTOUT_WIDTH_MM }, (t) => t.rghdX1 - t.edgeOffsetX - t.W);
      }
      dim(`${K}.x1`, { x0: ref(`${K}.x0`), W: RULES.RANGEHOOD_CUTOUT_WIDTH_MM }, (t) => t.x0 + t.W);
      dim(`${K}.y0`, { Cd, D: RULES.RANGEHOOD_CUTOUT_DEPTH_MM }, (t) => (t.Cd - t.D) / 2);
      dim(`${K}.y1`, { y0: ref(`${K}.y0`), D: RULES.RANGEHOOD_CUTOUT_DEPTH_MM }, (t) => t.y0 + t.D);
      addFeature(bp, "A", { id: String(f.id), kind: "cutout", ...r, through: true, for: "rangehood", key: K, source: "overhead_rangehood" });
    } else if (type === "rangehood_divider_side_groove") {
      const d = B.get(String(f.targetBoardId));
      if (!d) continue;
      const face = bigFaceToward(d, f.face);
      if (!face) continue;
      const r = localRect(d, { y: f.y, z: f.z });
      addFeature(d, face.id, { id: String(f.id), kind: "groove", ...r, depth: Number(f.depth), for: "RGHD_TOP", source: "overhead_rangehood" });
    } else if (type === "rangehood_top_divider_groove") {
      const top = B.get(String(f.targetBoardId));
      if (!top) continue;
      const r = localRect(top, { x: f.x, y: f.y });
      addFeature(top, "A", { id: String(f.id), kind: "groove", ...r, depth: Number(f.depth), for: String(f.dividerBoardId), source: "overhead_rangehood" });
    }
  }
  const joints = [];
  for (const decl of fb.declarations) {
    const a = B.get(decl.hostPanelId);
    const b = B.get(decl.targetPanelId);
    if (!a || !b) continue;
    if (decl.relationshipType === "face_contact") {
      const fa = faceOf(a, a.y1 <= b.y0 + EPS ? "A" : "B");
      const fbk = faceOf(b, fa.id === "A" ? "B" : "A");
      joints.push(joint(decl.declarationId, "face_contact", faceRef(a.id, [fa]), faceRef(b.id, [fbk]), { hardware: decl.allowedHardware, rule: decl.ruleId }));
      continue;
    }
    if (a.id === "BP") {
      if (b.category === "divider") {
        const bottom = edgeFacesIn(b, { u0: -EPS, u1: b.y1 - b.y0 + EPS, v0: -EPS, v1: EPS });
        joints.push(joint(decl.declarationId, "tongue_groove", faceRef("BP", ["A"]), faceRef(b.id, bottom), { hardware: decl.allowedHardware, rule: decl.ruleId }));
      } else {
        joints.push(joint(decl.declarationId, "butt", faceRef("BP", boundaryEdgeFaces(a, "-Y")), faceRef(b.id, ["A"]), { hardware: decl.allowedHardware, rule: decl.ruleId }));
      }
      continue;
    }
    if (a.category === "divider" && b.category === "front_panel") {
      joints.push(joint(decl.declarationId, "butt", faceRef(a.id, boundaryEdgeFaces(a, "-Y")), faceRef(b.id, ["A"]), { hardware: decl.allowedHardware, rule: decl.ruleId }));
      continue;
    }
    joints.push(joint(decl.declarationId, "butt", faceRef(a.id, []), faceRef(b.id, []), { hardware: decl.allowedHardware, rule: decl.ruleId }));
  }
  void CPT;
  return joints;
}

// generators/overheadCabinet/generator.ts
var LED_GROOVE_WIDTH = RULES.LED_GROOVE_WIDTH_MM.value;
var LED_GROOVE_DEPTH = RULES.LED_GROOVE_DEPTH_MM.value;
var LED_GROOVE_FRONT_LAND_MM = RULES.LED_GROOVE_FRONT_LAND_MM.value;
var LED_GROOVE_FRONT_OFFSET = LED_GROOVE_FRONT_LAND_MM + LED_GROOVE_WIDTH / 2;
var LED_GROOVE_BRANCH_END_INSET = RULES.LED_GROOVE_BRANCH_END_INSET_MM.value;
var T3_LED_BOARD_DEPTH_FALLBACK = RULES.T3_DEPTH_MM.value;
var RANGEHOOD_PRESET_NCE = "NCE";
var RANGEHOOD_CUTOUT_WIDTH_MM = RULES.RANGEHOOD_CUTOUT_WIDTH_MM.value;
var RANGEHOOD_CUTOUT_DEPTH_MM = RULES.RANGEHOOD_CUTOUT_DEPTH_MM.value;
var RANGEHOOD_MIN_EDGE_MM = RULES.RANGEHOOD_MIN_EDGE_MM.value;
var RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM = RULES.RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM.value;
function toInputs(params) {
  const opt = (v) => v == null ? void 0 : Number(v);
  return {
    cabinetWidth: Number(params.cabinetWidth),
    cabinetDepth: Number(params.cabinetDepth),
    cabinetHeight: params.cabinetHeight,
    style: params.style,
    topClearanceHeight: opt(params.topClearanceHeight),
    frontPanelThickness: opt(params.frontPanelThickness),
    clearance: opt(params.clearance),
    hingeHoleDiameter: opt(params.hingeHoleDiameter),
    hingeHoleDepth: opt(params.hingeHoleDepth),
    hingeHoleFromTop: opt(params.hingeHoleFromTop),
    hingeHoleFromSide: opt(params.hingeHoleFromSide),
    bottomThickness: opt(params.featureWidth ?? params.bottomThickness),
    dividerTongueHeight: opt(params.dividerTongueHeight),
    routerDiameter: opt(params.routerDiameter),
    featureWidth: opt(params.featureWidth),
    internalDividerCenterlines: Array.isArray(params.internalDividerCenterlines) ? params.internalDividerCenterlines.map(Number) : [],
    zones: params.zones
  };
}
function resolvedZones(params) {
  const zones = Array.isArray(params.zones) ? params.zones : [];
  let x = 0;
  return zones.map((zone, index) => {
    const width = Number(zone.width) || 0;
    const resolved = {
      id: String(zone.id || `zone-${index + 1}`),
      type: String(zone.type || "up_flap"),
      width,
      x0: x,
      x1: x + width
    };
    x += width;
    return resolved;
  });
}
function resolveRangehoodGroup(params, geometry, validation) {
  const zones = resolvedZones(params);
  const indices = zones.map((zone, index) => zone.type === "rangehood_flap" ? index : -1).filter((index) => index >= 0);
  if (indices.length === 0) return null;
  const firstZoneIndex = indices[0];
  const lastZoneIndex = indices[indices.length - 1];
  if (indices.some((index, offset) => index !== firstZoneIndex + offset)) {
    validation.errors.push("Only one contiguous rangehood group is allowed per overhead cabinet.");
    return null;
  }
  const preset = String(params.rangehoodPreset || RANGEHOOD_PRESET_NCE).toUpperCase();
  if (preset !== RANGEHOOD_PRESET_NCE) {
    validation.errors.push(`Unsupported rangehood preset: ${preset}.`);
  }
  const alignmentRaw = String(params.rangehoodAlignment || "left").toLowerCase();
  if (alignmentRaw !== "left" && alignmentRaw !== "right") {
    validation.errors.push("rangehoodAlignment must be left or right.");
  }
  const alignment = alignmentRaw === "right" ? "right" : "left";
  const edgeOffsetX = Number(params.rangehoodEdgeOffsetX ?? RANGEHOOD_MIN_EDGE_MM);
  const clearHeight = Number(params.rangehoodClearHeight ?? RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM);
  const cpt = geometry.manufacturing.FGw;
  const leftDivider = geometry.divider_features[firstZoneIndex];
  const rightDivider = geometry.divider_features[lastZoneIndex + 1];
  if (!leftDivider || !rightDivider) {
    validation.errors.push("Rangehood group boundary dividers could not be resolved.");
    return null;
  }
  const x0 = leftDivider.XDi + cpt / 2;
  const x1 = rightDivider.XDi - cpt / 2;
  const clearWidth = x1 - x0;
  if (!Number.isFinite(clearHeight) || clearHeight <= 0) {
    validation.errors.push("rangehoodClearHeight must be a positive number.");
  }
  if (!Number.isFinite(edgeOffsetX) || edgeOffsetX < RANGEHOOD_MIN_EDGE_MM) {
    validation.errors.push(`NCE rangehood edge offset must be at least ${RANGEHOOD_MIN_EDGE_MM} mm.`);
  }
  if (geometry.cabinet.Cd < RANGEHOOD_CUTOUT_DEPTH_MM + RANGEHOOD_MIN_EDGE_MM * 2) {
    validation.errors.push(
      `NCE rangehood requires BP depth >= ${RANGEHOOD_CUTOUT_DEPTH_MM + RANGEHOOD_MIN_EDGE_MM * 2} mm.`
    );
  }
  if (clearWidth < RANGEHOOD_CUTOUT_WIDTH_MM + RANGEHOOD_MIN_EDGE_MM * 2) {
    validation.errors.push(
      `NCE rangehood requires clear width between outer D inner faces >= ${RANGEHOOD_CUTOUT_WIDTH_MM + RANGEHOOD_MIN_EDGE_MM * 2} mm.`
    );
  }
  if (Number.isFinite(edgeOffsetX) && clearWidth - RANGEHOOD_CUTOUT_WIDTH_MM - edgeOffsetX < RANGEHOOD_MIN_EDGE_MM) {
    validation.errors.push("NCE rangehood cutout must leave at least 40 mm on the opposite X side.");
  }
  const cabinetHeight = Number(geometry.cabinet.Ch ?? 0);
  const functionalTop = cabinetHeight - geometry.manufacturing.TCH;
  if (3 * cpt + clearHeight > functionalTop) {
    validation.errors.push("Rangehood insert collides with the overhead top-clearance structure.");
  }
  return {
    firstZoneIndex,
    lastZoneIndex,
    leftDividerIndex: firstZoneIndex,
    rightDividerIndex: lastZoneIndex + 1,
    internalDividerIndices: Array.from(
      { length: Math.max(0, lastZoneIndex - firstZoneIndex) },
      (_, offset) => firstZoneIndex + offset + 1
    ),
    x0,
    x1,
    clearWidth,
    clearHeight,
    alignment,
    edgeOffsetX
  };
}
function rangehoodTopProfile(clearWidth, cabinetDepth, tongueProjection) {
  const y0 = cabinetDepth / 3 + 5;
  const y1 = cabinetDepth * 2 / 3 - 5;
  const rightMain = tongueProjection + clearWidth;
  const total = rightMain + tongueProjection;
  return [
    { x: tongueProjection, y: 0 },
    { x: rightMain, y: 0 },
    { x: rightMain, y: y0 },
    { x: total, y: y0 },
    { x: total, y: y1 },
    { x: rightMain, y: y1 },
    { x: rightMain, y: cabinetDepth },
    { x: tongueProjection, y: cabinetDepth },
    { x: tongueProjection, y: y1 },
    { x: 0, y: y1 },
    { x: 0, y: y0 },
    { x: tongueProjection, y: y0 },
    { x: tongueProjection, y: 0 }
  ];
}
function internalRangehoodDividerProfile(inputs, clearHeight) {
  const cpt = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const P = param({ H: inputs.cabinetHeight ?? 0, CPT: cpt, clearHeight, Cd: inputs.cabinetDepth });
  const effectiveCabinetHeight = dim(
    "DividerSideRangehood.effectiveHeight",
    { H: P.H, CPT: P.CPT, clearHeight: P.clearHeight },
    (t) => t.H - t.CPT - t.clearHeight
  );
  return dividerSideTrimmedOutlinePoints(
    P.Cd,
    ref("DividerSideRangehood.effectiveHeight"),
    P.CPT,
    inputs.dividerTongueHeight,
    inputs.routerDiameter,
    cpt + 1,
    inputs.topClearanceHeight,
    inputs.style === "style_2" ? "style_2" : "style_1",
    inputs.frontPanelThickness,
    "DividerSideRangehood"
  );
}
var OVERHEAD_BOARD_FRAME = "final";
function legacyToBoards(geometry, inputs, rangehood = null) {
  const { cabinetWidth, cabinetDepth, cabinetHeight, bottomThickness, featureWidth, topClearanceHeight, frontPanelThickness, clearance } = {
    cabinetWidth: inputs.cabinetWidth,
    cabinetDepth: inputs.cabinetDepth,
    cabinetHeight: inputs.cabinetHeight,
    bottomThickness: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    featureWidth: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    topClearanceHeight: inputs.topClearanceHeight ?? RULES.T1_HEIGHT_MM.value,
    frontPanelThickness: inputs.frontPanelThickness ?? RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM.value,
    clearance: inputs.clearance ?? RULES.DEFAULT_CLEARANCE_MM.value
  };
  const height = cabinetHeight ?? topClearanceHeight;
  const P = param({ Cw: cabinetWidth, Cd: cabinetDepth, H: height });
  const t = (v, name, rule) => v == null ? rule : param({ [name]: v })[name];
  const CPT = t(inputs.featureWidth, "CPT", RULES.DIVIDER_THICKNESS_MM);
  const TCH = t(inputs.topClearanceHeight, "TCH", RULES.T1_HEIGHT_MM);
  const FPT = t(inputs.frontPanelThickness, "FPT", RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM);
  const CL = t(inputs.clearance, "clearance", RULES.DEFAULT_CLEARANCE_MM);
  const zero = (key) => dim(key, {}, () => 0, { formula: "0" });
  const topRailY0 = dim("T1.y0", { TCH }, (t2) => t2.TCH - 1);
  const boards = [
    {
      id: "BP",
      name: "Bottom Panel",
      category: "panel",
      boardType: "BP",
      materialThickness: bottomThickness,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: zero("BP.x0"),
      x1: dim("BP.x1", { Cw: P.Cw }, (t2) => t2.Cw),
      y0: zero("BP.y0"),
      y1: dim("BP.y1", { Cd: P.Cd }, (t2) => t2.Cd),
      z0: zero("BP.z0"),
      z1: dim("BP.z1", { CPT }, (t2) => t2.CPT),
      source: "overhead"
    }
  ];
  boards.push({
    id: "T1",
    name: "Top Front Rail T1",
    category: "rail",
    boardType: "T1",
    materialThickness: frontPanelThickness,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    x0: zero("T1.x0"),
    x1: dim("T1.x1", { Cw: P.Cw }, (t2) => t2.Cw),
    y0: topRailY0,
    y1: dim("T1.y1", { y0: ref("T1.y0"), FPT }, (t2) => t2.y0 + t2.FPT),
    z0: dim("T1.z0", { H: P.H, TCH }, (t2) => t2.H - t2.TCH),
    z1: dim("T1.z1", { H: P.H }, (t2) => t2.H),
    source: "overhead"
  });
  boards.push({
    id: "T2",
    name: "Top Front Rail T2",
    category: "rail",
    boardType: "T2",
    materialThickness: featureWidth,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    x0: zero("T2.x0"),
    x1: dim("T2.x1", { Cw: P.Cw }, (t2) => t2.Cw),
    y0: same("T2.y0", "T1.y1"),
    y1: dim("T2.y1", { y0: ref("T2.y0"), CPT }, (t2) => t2.y0 + t2.CPT),
    z0: same("T2.z0", "T1.z0"),
    z1: same("T2.z1", "T1.z1"),
    source: "overhead"
  });
  if (geometry.trimmed_vectors.T3.length > 0) {
    const t3Depth = Math.max(...geometry.trimmed_vectors.T3.map(([, y]) => y));
    const t3Top = dim("T3.z1", { H: P.H, TCH }, (t2) => t2.H - t2.TCH - 1);
    boards.push({
      id: "T3",
      name: "Top Rear Panel",
      category: "panel",
      boardType: "T3",
      materialThickness: featureWidth,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: zero("T3.x0"),
      x1: dim("T3.x1", { Cw: P.Cw }, (t2) => t2.Cw),
      y0: zero("T3.y0"),
      y1: dim("T3.y1", { rearY: ref("T3.pv.rearY") }, () => t3Depth, { formula: "rearY" }),
      z0: dim("T3.z0", { z1: ref("T3.z1"), CPT }, (t2) => t2.z1 - t2.CPT),
      z1: t3Top,
      source: "overhead",
      profileVector: geometry.trimmed_vectors.T3.map(([x, y]) => ({ x, y }))
    });
  }
  if (geometry.trimmed_vectors.T4.length > 0) {
    const t4Height = Math.max(...geometry.trimmed_vectors.T4.map(([, z]) => z));
    const t4Y1 = dim("T4.y1", { Cd: P.Cd, CPT, clearance: CL }, (t2) => t2.Cd - t2.CPT - t2.clearance);
    boards.push({
      id: "T4",
      name: "Top Front Panel",
      category: "panel",
      boardType: "T4",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: zero("T4.x0"),
      x1: dim("T4.x1", { Cw: P.Cw }, (t2) => t2.Cw),
      y0: dim("T4.y0", { y1: ref("T4.y1"), CPT }, (t2) => t2.y1 - t2.CPT),
      y1: t4Y1,
      z0: dim("T4.z0", { H: P.H, top: ref("T4.pv.top") }, () => height - t4Height, { formula: "H - top" }),
      z1: dim("T4.z1", { H: P.H }, (t2) => t2.H),
      source: "overhead",
      profileVector: geometry.trimmed_vectors.T4.map(([x, z]) => ({ x, z }))
    });
  }
  for (let dividerIndex = 0; dividerIndex < geometry.divider_features.length; dividerIndex += 1) {
    const feature = geometry.divider_features[dividerIndex];
    const id = feature.id;
    const [x0, x1] = clampRange(boardXRange(feature.XDi, featureWidth), 0, cabinetWidth);
    dim(`${id}.x0`, { XDi: feature.XDi, CPT }, () => x0, { formula: "max(0, XDi - CPT / 2)" });
    dim(`${id}.x1`, { XDi: feature.XDi, CPT, Cw: P.Cw }, () => x1, { formula: "min(Cw, XDi + CPT / 2)" });
    const isInternalRangehoodDivider = Boolean(rangehood?.internalDividerIndices.includes(dividerIndex));
    const dividerZ0 = isInternalRangehoodDivider ? dim(`${id}.z0`, { CPT, clearHeight: rangehood?.clearHeight ?? 0 }, (t2) => t2.CPT * 2 + t2.clearHeight) : dim(`${id}.z0`, { CPT }, (t2) => t2.CPT);
    const dividerTopZ = cabinetHeight == null ? dim(`${id}.z1`, { CPT }, (t2) => t2.CPT + 1) : dim(`${id}.z1`, { H: P.H }, (t2) => t2.H);
    const dividerProfile = isInternalRangehoodDivider ? internalRangehoodDividerProfile(inputs, rangehood?.clearHeight ?? 0) : geometry.trimmed_vectors.DividerSide;
    alias(isInternalRangehoodDivider ? "DividerSideRangehood" : "DividerSide", `${id}.cut`);
    boards.push({
      id,
      name: `Divider ${id}`,
      category: "divider",
      boardType: "divider",
      materialThickness: featureWidth,
      profilePlane: "YZ",
      thicknessAxis: "X",
      x0,
      x1,
      y0: zero(`${id}.y0`),
      y1: dim(`${id}.y1`, { Cd: P.Cd }, (t2) => t2.Cd),
      z0: dividerZ0,
      z1: dividerTopZ,
      source: "overhead",
      cutProfileVector: dividerProfile.length > 0 ? dividerProfile.map(([y, z]) => ({ y, z })) : void 0,
      profileFeatures: [
        ...isInternalRangehoodDivider ? [] : [feature.bp_groove],
        feature.divider_tongue,
        feature.t3_notch,
        feature.t4_notch
      ],
      notes: isInternalRangehoodDivider ? ["Rangehood internal divider starts on RGHD_TOP; BP groove suppressed."] : void 0
    });
  }
  if (rangehood) {
    const tongueProjection = dim("RGHD.tongueProjection", { CPT }, (t2) => t2.CPT / 2 - 0.5);
    const bpTopZ = same("RGHD.bpTopZ", "BP.z1");
    const topBottomZ = dim("RGHD.topBottomZ", { bpTopZ: ref("RGHD.bpTopZ"), clearHeight: rangehood.clearHeight }, (t2) => t2.bpTopZ + t2.clearHeight);
    const topX0 = dim("RGHD_TOP.x0", { rghdX0: rangehood.x0, tongueProjection: ref("RGHD.tongueProjection") }, (t2) => t2.rghdX0 - t2.tongueProjection);
    const topX1 = dim("RGHD_TOP.x1", { rghdX1: rangehood.x1, tongueProjection: ref("RGHD.tongueProjection") }, (t2) => t2.rghdX1 + t2.tongueProjection);
    boards.push({
      id: "RGHD_TOP",
      name: "Rangehood Top",
      category: "rangehood",
      boardType: "RGHD_TOP",
      materialThickness: featureWidth,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: topX0,
      x1: topX1,
      y0: zero("RGHD_TOP.y0"),
      y1: dim("RGHD_TOP.y1", { Cd: P.Cd }, (t2) => t2.Cd),
      z0: same("RGHD_TOP.z0", "RGHD.topBottomZ"),
      z1: dim("RGHD_TOP.z1", { z0: ref("RGHD_TOP.z0"), CPT }, (t2) => t2.z0 + t2.CPT),
      source: "overhead_rangehood",
      profileVector: rangehoodTopProfile(rangehood.clearWidth, cabinetDepth, tongueProjection),
      notes: ["NCE rangehood top with side tongues."]
    });
    boards.push({
      id: "RGHD_FRONT",
      name: "Rangehood Front",
      category: "rangehood",
      boardType: "RGHD_FRONT",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: dim("RGHD_FRONT.x0", { rghdX0: rangehood.x0 }, (t2) => t2.rghdX0),
      x1: dim("RGHD_FRONT.x1", { rghdX1: rangehood.x1 }, (t2) => t2.rghdX1),
      y0: zero("RGHD_FRONT.y0"),
      y1: dim("RGHD_FRONT.y1", { CPT }, (t2) => t2.CPT),
      z0: same("RGHD_FRONT.z0", "RGHD.bpTopZ"),
      z1: same("RGHD_FRONT.z1", "RGHD.topBottomZ"),
      source: "overhead_rangehood"
    });
    boards.push({
      id: "RGHD_BACK",
      name: "Rangehood Back",
      category: "rangehood",
      boardType: "RGHD_BACK",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: dim("RGHD_BACK.x0", { rghdX0: rangehood.x0 }, (t2) => t2.rghdX0),
      x1: dim("RGHD_BACK.x1", { rghdX1: rangehood.x1 }, (t2) => t2.rghdX1),
      y0: dim("RGHD_BACK.y0", { Cd: P.Cd, CPT }, (t2) => t2.Cd - t2.CPT),
      y1: dim("RGHD_BACK.y1", { Cd: P.Cd }, (t2) => t2.Cd),
      z0: same("RGHD_BACK.z0", "RGHD.bpTopZ"),
      z1: same("RGHD_BACK.z1", "RGHD.topBottomZ"),
      source: "overhead_rangehood"
    });
    void bpTopZ;
    void topBottomZ;
  }
  for (const panel of geometry.front_panels) {
    const K = (n) => `${panel.id}.pv${n}`;
    const w = dim(`${panel.id}.width`, { x1: ref(`${panel.id}.x1`), x0: ref(`${panel.id}.x0`) }, (t2) => t2.x1 - t2.x0);
    const h = dim(`${panel.id}.height`, { z1: ref(`${panel.id}.z1`), z0: ref(`${panel.id}.z0`) }, (t2) => t2.z1 - t2.z0);
    void w;
    void h;
    for (const [i, [fx, fz]] of [[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]].entries()) {
      dim(K(`[${i}].x`), fx ? { width: ref(`${panel.id}.width`) } : {}, fx ? (t2) => t2.width : () => 0, { formula: fx ? "width" : "0" });
      dim(K(`[${i}].z`), fz ? { height: ref(`${panel.id}.height`) } : {}, fz ? (t2) => t2.height : () => 0, { formula: fz ? "height" : "0" });
    }
    boards.push({
      id: panel.id,
      name: `Front Panel ${panel.zoneIndex + 1}`,
      category: "front_panel",
      boardType: panel.type,
      materialThickness: panel.thickness,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: panel.x[0],
      x1: panel.x[1],
      y0: panel.y[0],
      y1: panel.y[1],
      z0: panel.z[0],
      z1: panel.z[1],
      source: "overhead",
      profileVector: [
        { x: 0, z: 0 },
        { x: panel.width, z: 0 },
        { x: panel.width, z: panel.height },
        { x: 0, z: panel.height },
        { x: 0, z: 0 }
      ]
    });
  }
  return boards;
}
function generateRangehoodFeatures(geometry, rangehood) {
  if (!rangehood) return [];
  const cpt = geometry.manufacturing.FGw;
  const depth = geometry.cabinet.Cd;
  const bpTopZ = cpt;
  const grooveZ0 = bpTopZ + rangehood.clearHeight;
  const grooveY = [depth / 3, depth * 2 / 3];
  const cutoutY0 = (depth - RANGEHOOD_CUTOUT_DEPTH_MM) / 2;
  const cutoutX0 = rangehood.alignment === "left" ? rangehood.x0 + rangehood.edgeOffsetX : rangehood.x1 - rangehood.edgeOffsetX - RANGEHOOD_CUTOUT_WIDTH_MM;
  const cutoutX1 = cutoutX0 + RANGEHOOD_CUTOUT_WIDTH_MM;
  const features = [
    {
      id: "RGHD_GROUP",
      type: "rangehood_group",
      preset: RANGEHOOD_PRESET_NCE,
      firstZoneIndex: rangehood.firstZoneIndex,
      lastZoneIndex: rangehood.lastZoneIndex,
      clearWidth: rangehood.clearWidth,
      clearHeight: rangehood.clearHeight,
      alignment: rangehood.alignment,
      edgeOffsetX: rangehood.edgeOffsetX,
      boundaryDividerIds: [
        `D${rangehood.leftDividerIndex}`,
        `D${rangehood.rightDividerIndex}`
      ],
      internalDividerIds: rangehood.internalDividerIndices.map((index) => `D${index}`)
    },
    {
      id: "BP_NCE_RANGEHOOD_CUTOUT",
      type: "rangehood_bp_cutout",
      targetBoardId: "BP",
      preset: RANGEHOOD_PRESET_NCE,
      through: true,
      shape: "rectangle",
      x: [cutoutX0, cutoutX1],
      y: [cutoutY0, cutoutY0 + RANGEHOOD_CUTOUT_DEPTH_MM],
      width: RANGEHOOD_CUTOUT_WIDTH_MM,
      depth: RANGEHOOD_CUTOUT_DEPTH_MM,
      alignment: rangehood.alignment,
      edgeOffsetX: rangehood.edgeOffsetX
    },
    {
      id: `RGHD_D${rangehood.leftDividerIndex}_SIDE_GROOVE`,
      type: "rangehood_divider_side_groove",
      targetBoardId: `D${rangehood.leftDividerIndex}`,
      face: "+X",
      y: grooveY,
      z: [grooveZ0, grooveZ0 + cpt + 1],
      depth: cpt / 2,
      widthY: depth / 3
    },
    {
      id: `RGHD_D${rangehood.rightDividerIndex}_SIDE_GROOVE`,
      type: "rangehood_divider_side_groove",
      targetBoardId: `D${rangehood.rightDividerIndex}`,
      face: "-X",
      y: grooveY,
      z: [grooveZ0, grooveZ0 + cpt + 1],
      depth: cpt / 2,
      widthY: depth / 3
    }
  ];
  for (const dividerIndex of rangehood.internalDividerIndices) {
    const divider = geometry.divider_features[dividerIndex];
    if (!divider) continue;
    features.push({
      id: `RGHD_TOP_D${dividerIndex}_GROOVE`,
      type: "rangehood_top_divider_groove",
      targetBoardId: "RGHD_TOP",
      dividerBoardId: `D${dividerIndex}`,
      face: "top",
      x: [divider.XDi - (cpt + 1) / 2, divider.XDi + (cpt + 1) / 2],
      y: grooveY,
      depth: cpt / 2
    });
  }
  return features;
}
function buildInsertBoardLedGroovePath(boardWidth, boardDepth, boardId, warnings, frontOffset = LED_GROOVE_FRONT_OFFSET) {
  const halfWidth = LED_GROOVE_WIDTH / 2;
  if (boardWidth <= LED_GROOVE_BRANCH_END_INSET * 2 + LED_GROOVE_WIDTH) {
    warnings.push(
      `${boardId} LED groove skipped: board width ${boardWidth.toFixed(1)} too narrow for 80 mm end insets.`
    );
    return null;
  }
  const mainYCenter = frontOffset;
  const main = {
    x0: 0,
    x1: boardWidth,
    y0: mainYCenter - halfWidth,
    y1: mainYCenter + halfWidth
  };
  if (main.y0 < -1e-6 || main.y1 > boardDepth + 1e-6) {
    warnings.push(
      `${boardId} LED groove skipped: main channel y=${main.y0.toFixed(2)}..${main.y1.toFixed(2)} leaves board depth ${boardDepth.toFixed(1)} (frontOffset=${frontOffset}).`
    );
    return null;
  }
  const branchY0 = main.y1;
  const branchY1 = boardDepth;
  const branchLength = branchY1 - branchY0;
  if (branchLength <= 1e-6) {
    warnings.push(
      `${boardId} LED groove T-branches skipped: no remaining depth behind main channel (y=${branchY0.toFixed(2)}).`
    );
    return null;
  }
  const branchCenters = [
    LED_GROOVE_BRANCH_END_INSET,
    boardWidth - LED_GROOVE_BRANCH_END_INSET
  ];
  const branches = branchCenters.map((centerX) => ({
    x0: centerX - halfWidth,
    x1: centerX + halfWidth,
    y0: branchY0,
    y1: branchY1
  }));
  return { main, branches, branchLength };
}
function t3LedBoardExtents(board) {
  const width = board.x1 - board.x0;
  const profileYs = (board.profileVector || []).map((point) => Number(point.y)).filter((value) => Number.isFinite(value));
  if (profileYs.length >= 2) {
    return { width, depth: Math.max(...profileYs) - Math.min(...profileYs) };
  }
  return {
    width,
    depth: Math.min(T3_LED_BOARD_DEPTH_FALLBACK, Math.max(0, board.y1 - board.y0))
  };
}
function generateT3LedGrooveFeatures(boards, warnings, params) {
  if (params.ledGroove === false) return [];
  const t3 = boards.find((board) => board.id === "T3" && board.boardType === "T3");
  if (!t3) {
    warnings.push("T3 LED groove skipped: T3 board missing.");
    return [];
  }
  const frontOffset = LED_GROOVE_FRONT_OFFSET;
  const { width, depth } = t3LedBoardExtents(t3);
  const path = buildInsertBoardLedGroovePath(width, depth, "T3", warnings);
  if (!path) return [];
  t3.notes = [
    ...(t3.notes ?? []).filter((note) => !note.toLowerCase().includes("led groove")),
    `T3 LED groove path on top face (${LED_GROOVE_FRONT_LAND_MM} mm front land)`
  ];
  return [
    {
      id: "T3_led_groove",
      type: "t3_groove",
      targetBoardId: "T3",
      face: "top",
      width: LED_GROOVE_WIDTH,
      depth: LED_GROOVE_DEPTH,
      frontOffset,
      frontLand: LED_GROOVE_FRONT_LAND_MM,
      branchCount: path.branches.length,
      branchLength: path.branchLength,
      branchWidth: LED_GROOVE_WIDTH,
      branchEndInset: LED_GROOVE_BRANCH_END_INSET,
      main: path.main,
      branches: path.branches,
      source: "T3",
      notes: [
        "T3 LED groove on top face (opens upward)",
        `Main channel along X, ${LED_GROOVE_FRONT_LAND_MM} mm land from T3 front then ${LED_GROOVE_WIDTH} mm groove (centerline ${frontOffset} mm)`,
        "Two rear T-branches parallel to Y, extend to T3 back edge, centers inset 80 mm from each X end"
      ]
    }
  ];
}
function resolveCarcassColor(params) {
  const raw = String(params.carcassColor || params.carcassColorName || "white_stipple").trim();
  const tag = raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "white_stipple";
  const name = String(params.carcassColorName || (tag === "white_stipple" ? "White Stipple" : raw)).trim() || "White Stipple";
  return { carcassColor: tag, carcassColorName: name };
}
function generateOverheadCabinet(rawParams) {
  beginProvenance();
  try {
    return generateOverheadCabinetInner(rawParams);
  } finally {
    if (provenanceActive()) endProvenance();
  }
}
function generateOverheadCabinetInner(rawParams) {
  const inputs = toInputs(rawParams);
  const carcassColor = resolveCarcassColor(rawParams);
  const validation = { errors: [], warnings: [] };
  if (!Number.isFinite(inputs.cabinetWidth) || inputs.cabinetWidth <= 0) {
    validation.errors.push("cabinetWidth must be a positive number.");
  }
  if (!Number.isFinite(inputs.cabinetDepth) || inputs.cabinetDepth <= 0) {
    validation.errors.push("cabinetDepth must be a positive number.");
  }
  if (inputs.cabinetHeight != null && (!Number.isFinite(inputs.cabinetHeight) || inputs.cabinetHeight <= 0)) {
    validation.errors.push("cabinetHeight must be a positive number when provided.");
  }
  const geometry = validation.errors.length === 0 ? calculateOverheadGeometry(inputs) : null;
  const rangehood = geometry ? resolveRangehoodGroup(rawParams, geometry, validation) : null;
  const centerlines = geometry ? geometry.divider_features.map((f) => f.XDi) : [];
  const resolvedParams = () => ({
    cabinetWidth: inputs.cabinetWidth,
    cabinetDepth: inputs.cabinetDepth,
    cabinetHeight: inputs.cabinetHeight ?? 0,
    style: inputs.style ?? "style_1",
    topClearanceHeight: inputs.topClearanceHeight ?? RULES.T1_HEIGHT_MM.value,
    frontPanelThickness: inputs.frontPanelThickness ?? RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM.value,
    clearance: inputs.clearance ?? RULES.DEFAULT_CLEARANCE_MM.value,
    hingeHoleDiameter: inputs.hingeHoleDiameter ?? RULES.DEFAULT_HINGE_HOLE_DIAMETER_MM.value,
    hingeHoleDepth: inputs.hingeHoleDepth ?? RULES.DEFAULT_HINGE_HOLE_DEPTH_MM.value,
    hingeHoleFromTop: inputs.hingeHoleFromTop ?? RULES.DEFAULT_HINGE_HOLE_FROM_TOP_MM.value,
    hingeHoleFromSide: inputs.hingeHoleFromSide ?? RULES.DEFAULT_HINGE_HOLE_FROM_SIDE_MM.value,
    bottomThickness: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    dividerTongueHeight: inputs.dividerTongueHeight ?? (inputs.featureWidth ?? DIVIDER_THICKNESS_MM) / 2 - 0.5,
    routerDiameter: inputs.routerDiameter ?? DEFAULT_ROUTER_DIAMETER_MM,
    featureWidth: inputs.featureWidth ?? DIVIDER_THICKNESS_MM,
    internalDividerCenterlines: inputs.internalDividerCenterlines ?? [],
    rangehoodPreset: String(rawParams.rangehoodPreset || RANGEHOOD_PRESET_NCE),
    rangehoodClearHeight: Number(rawParams.rangehoodClearHeight ?? RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM),
    rangehoodAlignment: String(rawParams.rangehoodAlignment || "left"),
    rangehoodEdgeOffsetX: Number(rawParams.rangehoodEdgeOffsetX ?? RANGEHOOD_MIN_EDGE_MM),
    ...carcassColor
  });
  if (validation.errors.length > 0) {
    return {
      params: resolvedParams(),
      boards: [],
      features: [],
      joints: [],
      relationshipDeclarations: [],
      validation,
      debug: {
        phase: "geometry_v1",
        boardFrame: OVERHEAD_BOARD_FRAME,
        dividerCenterlines: centerlines,
        provenance: endProvenance()
      }
    };
  }
  if (!geometry) {
    throw new Error("Overhead geometry was not resolved after validation.");
  }
  const boards = legacyToBoards(geometry, inputs, rangehood);
  const relationshipDeclarations = relationshipDeclarationsForBoards(boards);
  const ledFeatures = generateT3LedGrooveFeatures(boards, validation.warnings, rawParams);
  const rangehoodFeatures = generateRangehoodFeatures(geometry, rangehood);
  const dividerFeatures = geometry.divider_features.map((feature, index) => {
    if (!rangehood?.internalDividerIndices.includes(index)) return feature;
    return { ...feature, bp_groove: void 0 };
  });
  attachFaces(boards);
  const joints = buildOverheadFaces({
    boards,
    geometry,
    inputs,
    suppressedGrooves: rangehood?.internalDividerIndices ?? [],
    ledFeatures,
    rangehoodFeatures,
    declarations: relationshipDeclarations,
    carcassColorName: carcassColor.carcassColorName
  });
  return {
    params: resolvedParams(),
    boards,
    features: [
      ...dividerFeatures,
      ...geometry.front_panels,
      ...geometry.hinge_holes,
      ...rangehoodFeatures,
      ...ledFeatures
    ],
    joints,
    relationshipDeclarations,
    validation,
    debug: {
      phase: "geometry_v1",
      boardFrame: OVERHEAD_BOARD_FRAME,
      dividerCenterlines: centerlines,
      legacyGeometry: geometry,
      svgPreview: generateOHCSvgPreview(geometry, {
        selectedZoneIndex: Number(rawParams.selectedZoneIndex ?? -1)
      }),
      provenance: endProvenance()
    }
  };
}
export {
  BOTTOM_THICKNESS_MM,
  DEFAULT_ROUTER_DIAMETER_MM,
  DIVIDER_THICKNESS_MM,
  DIVIDER_TONGUE_HEIGHT_MM,
  FEATURE_CLEARANCE_MM,
  FEATURE_GROOVE_WIDTH_MM,
  FRONT_TOP_NOTCH_Y_OFFSET_MM,
  FRONT_TOP_STEP_DROP_MM,
  FRONT_TOP_STEP_Y_MM,
  OVERHEAD_BOARD_FRAME,
  REAR_TOP_NOTCH_HEIGHT_MM,
  RULES,
  SCREW_HOLE_DEPTH_MM,
  SCREW_HOLE_DIAMETER_MM,
  T1_HEIGHT_MM,
  T3_DEPTH_MM,
  T3_NOTCH_DEPTH_MM,
  T3_THICKNESS_MM,
  T4_HEIGHT_MM,
  T4_NOTCH_HEIGHT_MM,
  T4_SCREW_HOLE_NOTCH_CLEARANCE_MM,
  T4_SCREW_HOLE_UP_SHIFT_MM,
  T4_THICKNESS_MM,
  boardXRange,
  bpGroove,
  bpGrooveLength,
  bpGrooveYRange,
  calculateOverheadGeometry,
  calculateOverheadGeometryFromInternalXds,
  calculateOverheadGeometryFromXds,
  clampRange,
  dividerCenterlines,
  dividerSideTrimmedOutlinePoints,
  dividerTongueLength,
  dividerTongueYRange,
  edgeDividerCenterlines,
  featureXRange,
  generateOHCSvgPreview,
  generateOverheadCabinet,
  panelScrewHoles,
  screwHolePositions,
  t3Notch,
  t3NotchYRange,
  t3TrimmedOutlinePoints,
  t4Notch,
  t4NotchZRange,
  t4TrimmedOutlinePoints,
  testCase001Geometry
};
