// Generated from generators/uShapeOverhead/generator.ts - do not edit.

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
function valueOf(key) {
  return active.entries[key]?.value ?? NaN;
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
  for (const n2 of names) out[n2] = ref(K(n2));
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
    for (const [n2, t] of Object.entries(a.terms)) av[n2] = val(t);
    const bv = {};
    for (const [n2, t] of Object.entries(b.terms)) bv[n2] = val(t);
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
  DIVIDER_THICKNESS_MM: { value: 15, doc: "Carcass / divider board thickness (CPT) when the params give none.", label: "\u9ED8\u8BA4\u67DC\u8EAB\u677F\u539A" },
  FEATURE_CLEARANCE_MM: { value: 1, doc: "Extra width added to CPT for grooves and notches a board slides into (slot = CPT + this).", label: "\u69FD\u53E3\u5BBD\u5EA6\u4F59\u91CF" },
  DEFAULT_ROUTER_DIAMETER_MM: { value: 10, doc: "Router bit diameter assumed for grooves.", label: "\u94E3\u5200\u76F4\u5F84" },
  BOTTOM_THICKNESS_MM: { value: 15, doc: "Bottom panel thickness for the legacy XD-based entry points.", label: "\u5E95\u677F\u539A\uFF08\u65E7\u63A5\u53E3\uFF09" },
  T1_HEIGHT_MM: { value: 40, doc: "Top clearance height (TCH) when the params give none: height of the hidden top rails T1/T2.", label: "\u9ED8\u8BA4\u9876\u90E8\u9884\u7559" },
  T3_DEPTH_MM: { value: 90, doc: "Top rear panel T3: depth from the carcass front, mm. Sits in the divider front step.", label: "T3 \u6DF1\u5EA6" },
  T3_THICKNESS_MM: { value: 15, doc: "T3 thickness (legacy preview only).", label: "T3 \u539A\uFF08\u65E7\u9884\u89C8\uFF09" },
  T3_NOTCH_DEPTH_MM: { value: 20, doc: "Depth of the T3 notch that clears each divider.", label: "T3 \u7F3A\u53E3\u6DF1\u5EA6" },
  T4_THICKNESS_MM: { value: 15, doc: "T4 thickness (legacy preview only).", label: "T4 \u539A\uFF08\u65E7\u9884\u89C8\uFF09" },
  T4_HEIGHT_MM: { value: 50, doc: "Height of the vertical top plate T4 on the divider rear notches.", label: "T4 \u9AD8\u5EA6" },
  T4_NOTCH_HEIGHT_MM: { value: 20, doc: "Height of the T4 notch that clears each divider.", label: "T4 \u7F3A\u53E3\u9AD8\u5EA6" },
  T4_SCREW_HOLE_NOTCH_CLEARANCE_MM: { value: 8, doc: "T4 screw hole: clearance above the notch.", label: "T4 \u87BA\u4E1D\u5B54\u79BB\u7F3A\u53E3" },
  T4_SCREW_HOLE_UP_SHIFT_MM: { value: 10, doc: "T4 screw hole: additional upward shift.", label: "T4 \u87BA\u4E1D\u5B54\u4E0A\u79FB" },
  FRONT_TOP_NOTCH_Y_OFFSET_MM: { value: 70, doc: "Divider front top notch: start Y from the carcass front (style 1).", label: "\u5206\u9694\u677F\u524D\u9876\u7F3A\u53E3\u8D77\u70B9" },
  FRONT_TOP_STEP_Y_MM: { value: 10, doc: "Divider front step: run in Y past the notch offset.", label: "\u5206\u9694\u677F\u524D\u53F0\u9636\u5EF6\u4F38" },
  SCREW_HOLE_DIAMETER_MM: { value: 3, doc: "Panel screw pilot hole diameter.", label: "\u87BA\u4E1D\u5BFC\u5B54\u76F4\u5F84" },
  SCREW_HOLE_DEPTH_MM: { value: 15, doc: "Panel screw pilot hole depth.", label: "\u87BA\u4E1D\u5BFC\u5B54\u6DF1" },
  DEFAULT_FRONT_PANEL_THICKNESS_MM: { value: 16, doc: "Door / front panel thickness (FPT) when the params give none.", label: "\u9ED8\u8BA4\u95E8\u677F\u539A" },
  DEFAULT_CLEARANCE_MM: { value: 2.5, doc: "Gap between neighbouring fronts and at the cabinet edges when the params give none.", label: "\u9ED8\u8BA4\u95E8\u7F1D" },
  DEFAULT_HINGE_HOLE_DIAMETER_MM: { value: 35, doc: "Hinge cup hole diameter.", label: "\u94F0\u94FE\u676F\u5B54\u76F4\u5F84" },
  DEFAULT_HINGE_HOLE_DEPTH_MM: { value: 12, doc: "Hinge cup hole depth.", label: "\u94F0\u94FE\u676F\u5B54\u6DF1" },
  DEFAULT_HINGE_HOLE_FROM_TOP_MM: { value: 22.5, doc: "Hinge cup centre from the top edge of an up flap.", label: "\u94F0\u94FE\u676F\u8DDD\u9876" },
  DEFAULT_HINGE_HOLE_FROM_SIDE_MM: { value: 100, doc: "Hinge cup centre from each side edge of an up flap.", label: "\u94F0\u94FE\u676F\u8DDD\u4FA7" },
  LED_GROOVE_WIDTH_MM: { value: 14.5, doc: "LED insert groove width (shared with General Tall / Kitchen / Fridge).", label: "LED \u69FD\u5BBD" },
  LED_GROOVE_DEPTH_MM: { value: 6.5, doc: "LED insert groove depth.", label: "LED \u69FD\u6DF1" },
  LED_GROOVE_FRONT_LAND_MM: { value: 18, doc: "Clear strip from the T3 front edge to the near wall of the main LED channel.", label: "LED \u4E3B\u69FD\u524D\u4FA7\u7559\u6599" },
  LED_GROOVE_BRANCH_END_INSET_MM: { value: 30, doc: "LED T-branch centres inset from each X end of T3.", label: "LED \u652F\u69FD\u8DDD\u677F\u7AEF" },
  RANGEHOOD_CUTOUT_WIDTH_MM: { value: 555, doc: "NCE rangehood: BP cutout width.", label: "\u6CB9\u70DF\u673A\u5F00\u5B54\u5BBD" },
  RANGEHOOD_CUTOUT_DEPTH_MM: { value: 285, doc: "NCE rangehood: BP cutout depth.", label: "\u6CB9\u70DF\u673A\u5F00\u5B54\u6DF1" },
  RANGEHOOD_MIN_EDGE_MM: { value: 40, doc: "NCE rangehood: minimum material left around the cutout.", label: "\u6CB9\u70DF\u673A\u6700\u5C0F\u8FB9\u7F18\u7559\u6599" },
  RANGEHOOD_DEFAULT_CLEAR_HEIGHT_MM: { value: 75, doc: "NCE rangehood: clear height from BP top to the insert top when the params give none.", label: "\u6CB9\u70DF\u673A\u9ED8\u8BA4\u51C0\u7A7A\u9AD8\u5EA6" },
  EDGE_BAND_THICKNESS_MM: { value: 1, doc: "Edge-tape thickness written on each banded outline edge. Colour is separate: door colour on fronts, carcass colour on the visible carcass edges.", label: "\u5C01\u8FB9\u539A" },
  RUN_SHEET_MAX_MM: { value: 2400, doc: "An overhead longer than this cannot be cut as one board. The panel asks for a split; a shorter run may still be split.", label: "\u5355\u677F\u6700\u957F" }
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
  const K = (n2) => `${key}.${n2}`;
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
  const K = (n2) => `${key}.${n2}`;
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
  const K = (n2) => `${key}.${n2}`;
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
  const r = (n2) => ex(use(K, n2), (t) => t[n2], n2);
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
  const K = (n2) => `BP.feat.BG_${dividerId}.${n2}`;
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
function recordCenterlines(centers, Cw, CPT) {
  centers.forEach((at, i) => {
    const key = `XD${i}`;
    if (i === 0) dim(key, { CPT }, (t) => t.CPT / 2);
    else if (i === centers.length - 1) dim(key, { Cw, CPT }, (t) => t.Cw - t.CPT / 2);
    else dim(key, { at }, (t) => t.at, { formula: key });
  });
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
    const K = (n2) => `FP${index}.${n2}`;
    const openingX0 = centers[index] + fgWidth / 2;
    const openingX1 = centers[index + 1] - fgWidth / 2;
    const leftEdge = zone.x0 <= 0;
    const rightEdge = zone.x1 >= inputs.cabinetWidth;
    const leftXd = `XD${index}`;
    const rightXd = `XD${index + 1}`;
    const x0 = leftEdge ? dim(K("x0"), { clearance: CL }, (t) => t.clearance) : dim(K("x0"), { [leftXd]: ref(leftXd), clearance: CL }, (t) => t[leftXd] + t.clearance / 2, { formula: `${leftXd} + clearance / 2` });
    const x1 = rightEdge ? dim(K("x1"), { Cw: param({ Cw: inputs.cabinetWidth }).Cw, clearance: CL }, (t) => t.Cw - t.clearance) : dim(K("x1"), { [rightXd]: ref(rightXd), clearance: CL }, (t) => t[rightXd] - t.clearance / 2, { formula: `${rightXd} - clearance / 2` });
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
    const K = (n2, c) => `${panel.id}.feat.HINGE_${n2}.${c}`;
    return [0, 1].map((index) => {
      const n2 = index + 1;
      const px2 = index === 0 ? dim(K(n2, "x"), { fromSide }, (t) => t.fromSide) : dim(K(n2, "x"), { panelWidth: panel.width, fromSide }, (t) => t.panelWidth - t.fromSide);
      const pz = dim(K(n2, "z"), { panelHeight: panel.height, fromTop }, (t) => t.panelHeight - t.fromTop);
      return {
        id: `${panel.id}_HINGE_${n2}`,
        boardId: panel.id,
        center: [px2, pz],
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
  const P0 = paramTerms(inputs);
  const CPT0 = orRule(inputs.featureWidth, "CPT", RULES.DIVIDER_THICKNESS_MM);
  recordCenterlines(centers, P0.Cw, CPT0);
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

// generators/overheadCabinet/svgPreview.ts
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt2(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}
function panelFill(type) {
  if (type === "rangehood_flap") return "#d7b8f2";
  if (type === "fixed_panel") return "#d5dcc4";
  if (type === "open") return "#f3e39a";
  if (type === "up_flap") return "#b7e3a1";
  return "#8ec5ef";
}
function generateOHCSvgPreview(geometry, options = {}) {
  const width = options.width ?? 760;
  const height = options.height ?? 390;
  const showDimensions = options.showDimensions ?? true;
  const selectedZoneIndex = options.selectedZoneIndex ?? -1;
  const splitX = options.splitX != null && Number.isFinite(options.splitX) ? Number(options.splitX) : null;
  const centerGaps = options.gaps === "center";
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
    const isEdge = feature.XDi <= fg + 0.1 || feature.XDi >= cw - fg - 0.1;
    const centerX = toX(feature.XDi);
    const labelY = oy + bodyH + 56 + index % 2 * 14;
    return `
      <rect x="${fmt2(r.x)}" y="${fmt2(r.y)}" width="${fmt2(r.w)}" height="${fmt2(r.h)}" fill="rgba(92,75,55,0.45)" stroke="#6e5a42"></rect>
      ${isEdge ? `<text x="${fmt2(centerX)}" y="${fmt2(oy - 11)}" text-anchor="middle" fill="#6e5a42" font-size="10">edge divider</text>` : `
        <line x1="${fmt2(centerX)}" y1="${fmt2(oy - 8)}" x2="${fmt2(centerX)}" y2="${fmt2(oy + bodyH + 12)}" stroke="#e5484d" stroke-dasharray="5 4"></line>
        <text x="${fmt2(centerX)}" y="${fmt2(oy - 11)}" text-anchor="middle" fill="#e5484d" font-size="10">drag boundary</text>`}
      ${showDimensions ? `
        <line x1="${fmt2(r.x)}" y1="${fmt2(labelY)}" x2="${fmt2(r.x + r.w)}" y2="${fmt2(labelY)}" stroke="#6e5a42"></line>
        <line x1="${fmt2(r.x)}" y1="${fmt2(labelY - 4)}" x2="${fmt2(r.x)}" y2="${fmt2(labelY + 4)}" stroke="#6e5a42"></line>
        <line x1="${fmt2(r.x + r.w)}" y1="${fmt2(labelY - 4)}" x2="${fmt2(r.x + r.w)}" y2="${fmt2(labelY + 4)}" stroke="#6e5a42"></line>
        <text x="${fmt2(r.x + r.w / 2)}" y="${fmt2(labelY - 4)}" text-anchor="middle" fill="#6e5a42" font-size="10">${esc(feature.id)} ${fmt2(fg)} mm</text>` : ""}
    `;
  }).join("");
  const dividers = [...geometry.divider_features].sort((a, b) => a.XDi - b.XDi);
  const bayGaps = dividers.slice(0, -1).map((a, i) => {
    const b = dividers[i + 1];
    const clear = Math.round((b.XDi - fg / 2 - (a.XDi + fg / 2)) * 10) / 10;
    const center = Math.round((b.XDi - a.XDi) * 10) / 10;
    if (clear < 8 || clear * scale < 16) return "";
    const x = toX((a.XDi + b.XDi) / 2);
    const y = toY(fzh / 2);
    const n2 = centerGaps ? center : clear;
    return `<text x="${fmt2(x)}" y="${fmt2(y)}" text-anchor="middle" fill="${centerGaps ? "#9a6b12" : "#2a6f97"}" font-size="10">${fmt2(n2)}</text>`;
  }).join("");
  const topClear = Math.round((ch - tch - fg) * 10) / 10;
  const topCenter = Math.round((ch - tch / 2 - fg / 2) * 10) / 10;
  const heightGap = topClear >= 8 && topClear * scale >= 16 ? `<text x="${fmt2(toX(cw / 2))}" y="${fmt2(toY((fg + ch - tch) / 2))}" text-anchor="middle" fill="${centerGaps ? "#9a6b12" : "#2a6f97"}" font-size="10">${fmt2(centerGaps ? topCenter : topClear)}</text>` : "";
  const openingRects = geometry.front_panels.map((panel) => {
    const opening = rectFromXZ(panel.opening.x[0], 0, panel.opening.x[1], fzh);
    const selected = panel.zoneIndex === selectedZoneIndex;
    const dimensionY = oy + bodyH + 20 + panel.zoneIndex % 2 * 15;
    return `
      <rect x="${fmt2(opening.x)}" y="${fmt2(opening.y)}" width="${fmt2(opening.w)}" height="${fmt2(opening.h)}" fill="${panelFill(panel.type)}" stroke="#6a7d90" stroke-width="1"></rect>
      ${selected ? `<rect x="${fmt2(opening.x)}" y="${fmt2(opening.y)}" width="${fmt2(opening.w)}" height="${fmt2(opening.h)}" fill="#0e3f8f" fill-opacity="0.62" stroke="#d7e6ff" stroke-width="3"></rect>` : ""}
      ${showDimensions ? `
        <line x1="${fmt2(opening.x)}" y1="${fmt2(dimensionY)}" x2="${fmt2(opening.x + opening.w)}" y2="${fmt2(dimensionY)}" stroke="#0f6bff"></line>
        <line x1="${fmt2(opening.x)}" y1="${fmt2(dimensionY - 4)}" x2="${fmt2(opening.x)}" y2="${fmt2(dimensionY + 4)}" stroke="#0f6bff"></line>
        <line x1="${fmt2(opening.x + opening.w)}" y1="${fmt2(dimensionY - 4)}" x2="${fmt2(opening.x + opening.w)}" y2="${fmt2(dimensionY + 4)}" stroke="#0f6bff"></line>
        <text x="${fmt2(opening.x + opening.w / 2)}" y="${fmt2(dimensionY - 3)}" text-anchor="middle" fill="#0f6bff" font-size="10">opening ${fmt2(panel.opening.width)} mm</text>` : ""}
    `;
  }).join("");
  const frontPanelRects = geometry.front_panels.map((panel) => {
    const r = rectFromXZ(panel.x[0], panel.z[0], panel.x[1], panel.z[1]);
    const label2 = panel.type === "fixed_panel" ? "Fixed Panel" : panel.type === "rangehood_flap" ? "Rangehood Flap" : "Up Flap";
    return `
      <rect x="${fmt2(r.x)}" y="${fmt2(r.y)}" width="${fmt2(r.w)}" height="${fmt2(r.h)}" fill="none" stroke="#66758a" stroke-width="1.2"></rect>
      <text x="${fmt2(r.x + r.w / 2)}" y="${fmt2(r.y + r.h / 2 - 4)}" text-anchor="middle" fill="#22344d" font-size="12">${esc(label2)}</text>
      <text x="${fmt2(r.x + r.w / 2)}" y="${fmt2(r.y + r.h / 2 + 13)}" text-anchor="middle" fill="#22344d" font-size="11">${esc(panel.id)}</text>
    `;
  }).join("");
  const hingeHoles2 = geometry.hinge_holes.map((hole) => {
    const panel = geometry.front_panels.find((candidate) => candidate.id === hole.boardId);
    if (!panel) return "";
    const x = panel.x[0] + hole.center[0];
    const z = panel.z[0] + hole.center[1];
    return `<circle cx="${fmt2(toX(x))}" cy="${fmt2(toY(z))}" r="${fmt2(Math.max(hole.diameter / 2 * scale, 4))}" fill="none" stroke="#66758a" stroke-dasharray="4 2"></circle>`;
  }).join("");
  const bp = rectFromXZ(0, 0, cw, fg);
  const topArea = rectFromXZ(0, ch - tch, cw, ch);
  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="OHC front elevation geometry preview">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fbff"></rect>
      ${showDimensions ? `
        <line x1="${fmt2(ox)}" y1="${fmt2(oy - 14)}" x2="${fmt2(ox + bodyW)}" y2="${fmt2(oy - 14)}" stroke="#222"></line>
        <text x="${fmt2(ox + bodyW / 2)}" y="${fmt2(oy - 18)}" text-anchor="middle" fill="#222" font-size="11">${fmt2(cw)}</text>
        <line x1="${fmt2(ox - 14)}" y1="${fmt2(oy)}" x2="${fmt2(ox - 14)}" y2="${fmt2(oy + bodyH)}" stroke="#222"></line>
        <text x="${fmt2(ox - 20)}" y="${fmt2(oy + bodyH / 2)}" text-anchor="middle" fill="#222" font-size="11" transform="rotate(-90 ${fmt2(ox - 20)} ${fmt2(oy + bodyH / 2)})">${fmt2(ch)}</text>` : ""}
      <rect x="${fmt2(ox)}" y="${fmt2(oy)}" width="${fmt2(bodyW)}" height="${fmt2(bodyH)}" fill="#f4f0e6" stroke="#5c4b37" stroke-width="2"></rect>
      <rect x="${fmt2(topArea.x)}" y="${fmt2(topArea.y)}" width="${fmt2(topArea.w)}" height="${fmt2(topArea.h)}" fill="rgba(15,107,255,0.06)" stroke="#85b5ff" stroke-dasharray="5 3"></rect>
      <text x="${fmt2(topArea.x + topArea.w - 6)}" y="${fmt2(topArea.y + 14)}" text-anchor="end" fill="#0b57d0" font-size="10">T1/T2 / TCH ${fmt2(tch)}</text>
      ${openingRects}
      ${bayGaps}
      ${heightGap}
      ${frontPanelRects}
      <rect x="${fmt2(bp.x)}" y="${fmt2(bp.y)}" width="${fmt2(bp.w)}" height="${fmt2(bp.h)}" fill="#c7b9a2" stroke="#6e5a42"></rect>
      <text x="${fmt2(bp.x + 6)}" y="${fmt2(bp.y - 4)}" fill="#6e5a42" font-size="10">BP ${fmt2(fg)} mm</text>
      ${dividerRects}
      ${splitX == null ? "" : `<line x1="${fmt2(toX(splitX))}" y1="${fmt2(oy - 6)}" x2="${fmt2(toX(splitX))}" y2="${fmt2(oy + bodyH + 8)}" stroke="#7eb6ff" stroke-width="1.5" stroke-dasharray="3 3"></line>`}
      ${hingeHoles2}
      <text x="${fmt2(ox + 4)}" y="${fmt2(oy + bodyH + 18)}" fill="#6d7a8d" font-size="11">FGw ${fmt2(fg)} mm, FPt/T1 ${fmt2(fpThickness)} mm, clearance ${fmt2(clearance)} mm</text>
    </svg>`;
}

// generators/overheadCabinet/split.ts
var EPS = 1e-6;
function zonesOf(inputs) {
  const zones = inputs.zones ?? [];
  let x = 0;
  return zones.map((zone) => {
    const width = Number(zone.width) || 0;
    const out = { type: String(zone.type || "up_flap"), width, x0: x, x1: x + width };
    x += width;
    return out;
  });
}
function overheadSplitTargets(zones) {
  const out = [];
  let x = 0;
  for (let i = 0; i < zones.length - 1; i += 1) {
    x += Number(zones[i]?.width) || 0;
    const hood = zones[i]?.type === "rangehood_flap" && zones[i + 1]?.type === "rangehood_flap";
    if (!hood) out.push({ after: i, x });
  }
  return out;
}
function slotRange(center, slot, x0, x1) {
  const a = Math.max(center - slot / 2, x0);
  const b = Math.min(center + slot / 2, x1);
  return b - a > EPS ? [a, b] : null;
}
function retarget(feature, center, inputs, id) {
  const cpt = inputs.featureWidth ?? RULES.DIVIDER_THICKNESS_MM.value;
  const slot = cpt + RULES.FEATURE_CLEARANCE_MM.value;
  const depth = inputs.dividerTongueHeight ?? cpt / 2 - 0.5;
  feature.id = id;
  feature.XDi = center;
  feature.bp_groove = bpGroove(id, center, inputs.cabinetDepth, slot, depth, inputs.cabinetWidth);
  const x = slotRange(center, slot, 0, inputs.cabinetWidth) ?? feature.bp_groove.x;
  feature.t3_notch = { ...feature.t3_notch, id: `${id}_T3`, for_divider: id, x, width_x: x[1] - x[0] };
  feature.t4_notch = { ...feature.t4_notch, id: `${id}_T4`, for_divider: id, x, width_x: x[1] - x[0] };
  feature.screw_holes = feature.screw_holes.map((hole) => ({ ...hole, x: center }));
}
function outlineFor(kind, id, x0, x1, features, slot) {
  const width = x1 - x0;
  const ranges = features.filter((f) => f.XDi > x0 + EPS && f.XDi < x1 - EPS).map((f) => {
    const a = Math.max(f.XDi - slot / 2, x0) - x0;
    const b = Math.min(f.XDi + slot / 2, x1) - x0;
    return [a, b];
  }).filter(([a, b]) => b - a > EPS);
  const widthTerm = param({ w: width }).w;
  const pts = kind === "T3" ? t3TrimmedOutlinePoints(widthTerm, ranges, RULES.T3_DEPTH_MM, RULES.T3_NOTCH_DEPTH_MM, `${id}.pv`) : t4TrimmedOutlinePoints(widthTerm, ranges, RULES.T4_HEIGHT_MM, RULES.T4_NOTCH_HEIGHT_MM, `${id}.pv`);
  return pts.map(([u, v]) => kind === "T3" ? { x: u + x0, y: v } : { x: u + x0, z: v });
}
function splitBox(boards, id, xb) {
  const board = boards.find((b) => b.id === id);
  if (!board || !(board.x0 < xb - EPS && board.x1 > xb + EPS)) return;
  const rightId = `${id}-2`;
  const x1 = board.x1;
  boards.push({ ...board, id: rightId, x0: xb, x1 });
  board.x1 = xb;
  dim(`${id}.x1`, { x: xb }, (t) => t.x, { formula: "split" });
  dim(`${rightId}.x0`, { x: xb }, (t) => t.x, { formula: "split" });
  dim(`${rightId}.x1`, { x: x1 }, (t) => t.x, { formula: "split end" });
}
function addScrew(list, part, feature, midline) {
  list.push({
    id: `${part}SH_${feature.id}`,
    part,
    for_divider: feature.id,
    center: [feature.XDi, midline],
    diameter: list[0]?.diameter ?? RULES.SCREW_HOLE_DIAMETER_MM.value,
    depth: list[0]?.depth ?? RULES.SCREW_HOLE_DEPTH_MM.value,
    axis: "thickness"
  });
}
function applyOverheadSplit(boards, geometry, inputs, splitAfter, hood, warnings) {
  if (splitAfter == null || splitAfter === "") return null;
  const after = Math.round(Number(splitAfter));
  const zones = zonesOf(inputs);
  const allowed = overheadSplitTargets(zones);
  if (!Number.isInteger(after) || !allowed.some((t) => t.after === after)) {
    warnings.push("Split needs a line between two zones, and not through a rangehood.");
    return null;
  }
  const xb = zones[after].x1;
  const cpt = inputs.featureWidth ?? RULES.DIVIDER_THICKNESS_MM.value;
  const slot = cpt + RULES.FEATURE_CLEARANCE_MM.value;
  const di = geometry.divider_features.findIndex((f) => Math.abs(f.XDi - xb) < 0.51);
  const feature = di >= 0 ? geometry.divider_features[di] : void 0;
  const board = feature ? boards.find((b) => b.id === feature.id) : void 0;
  if (!feature || !board) {
    warnings.push("Split could not find the divider on that zone line.");
    return null;
  }
  const leftCenter = xb - cpt / 2;
  const rightCenter = xb + cpt / 2;
  retarget(feature, leftCenter, inputs, feature.id);
  const rightId = `D${geometry.divider_features.length}`;
  const right = {
    ...feature,
    bp_groove: feature.bp_groove,
    screw_holes: feature.screw_holes.map((h) => ({ ...h })),
    divider_tongue: { ...feature.divider_tongue, y: [...feature.divider_tongue.y], z: [...feature.divider_tongue.z] },
    t3_notch: { ...feature.t3_notch, x: [...feature.t3_notch.x] },
    t4_notch: { ...feature.t4_notch, x: [...feature.t4_notch.x] }
  };
  retarget(right, rightCenter, inputs, rightId);
  geometry.divider_features.push(right);
  board.x0 = xb - cpt;
  board.x1 = xb;
  board.profileFeatures = [feature.bp_groove, feature.divider_tongue, feature.t3_notch, feature.t4_notch];
  dim(`${board.id}.x0`, { x: xb, CPT: cpt }, (t) => t.x - t.CPT, { formula: "split - CPT" });
  dim(`${board.id}.x1`, { x: xb }, (t) => t.x, { formula: "split" });
  boards.push({
    ...board,
    id: rightId,
    x0: xb,
    x1: xb + cpt,
    profileFeatures: [right.bp_groove, right.divider_tongue, right.t3_notch, right.t4_notch]
  });
  dim(`${rightId}.x0`, { x: xb }, (t) => t.x, { formula: "split" });
  dim(`${rightId}.x1`, { x: xb, CPT: cpt }, (t) => t.x + t.CPT, { formula: "split + CPT" });
  for (const part of ["T2", "T3", "T4"]) {
    const holes = geometry.panel_screw_holes[part];
    const hole = holes.find((h) => h.for_divider === feature.id);
    if (hole) hole.center = [leftCenter, hole.center[1]];
    addScrew(holes, part, right, hole?.center[1] ?? 0);
  }
  for (const id of ["BP", "T1", "T2"]) splitBox(boards, id, xb);
  for (const kind of ["T3", "T4"]) {
    const src = boards.find((b) => b.id === kind);
    if (!src || !(src.x0 < xb - EPS && src.x1 > xb + EPS)) continue;
    const x1 = src.x1;
    const rightBoardId = `${kind}-2`;
    src.x1 = xb;
    src.profileVector = outlineFor(kind, kind, src.x0, xb, geometry.divider_features, slot);
    boards.push({
      ...src,
      id: rightBoardId,
      x0: xb,
      x1,
      profileVector: outlineFor(kind, rightBoardId, xb, x1, geometry.divider_features, slot)
    });
    dim(`${kind}.x1`, { x: xb }, (t) => t.x, { formula: "split" });
    dim(`${rightBoardId}.x0`, { x: xb }, (t) => t.x, { formula: "split" });
    dim(`${rightBoardId}.x1`, { x: x1 }, (t) => t.x, { formula: "split end" });
  }
  if (hood) {
    if (hood.leftDividerIndex === di && hood.firstZoneIndex > after) hood.leftDividerIndex = geometry.divider_features.length - 1;
    const left = geometry.divider_features[hood.leftDividerIndex];
    const rightD = geometry.divider_features[hood.rightDividerIndex];
    if (left && rightD) {
      hood.x0 = left.XDi + cpt / 2;
      hood.x1 = rightD.XDi - cpt / 2;
      hood.clearWidth = hood.x1 - hood.x0;
      const minClear = RULES.RANGEHOOD_CUTOUT_WIDTH_MM.value + RULES.RANGEHOOD_MIN_EDGE_MM.value * 2;
      if (hood.clearWidth < minClear - EPS) {
        warnings.push(`The rangehood clear width is ${Math.round(hood.clearWidth * 10) / 10} mm after the split \u2014 it needs ${minClear}.`);
      }
    }
  }
  const sheet = RULES.RUN_SHEET_MAX_MM.value;
  if (xb > sheet) warnings.push(`The left side of the split is ${xb} mm. A board over ${sheet} mm cannot be cut.`);
  if (inputs.cabinetWidth - xb > sheet) warnings.push(`The right side of the split is ${Math.round((inputs.cabinetWidth - xb) * 10) / 10} mm. A board over ${sheet} mm cannot be cut.`);
  return { after, x: xb };
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
var ARC_CHORD_MM = 0.05;
var ARC_STEP_MAX = 5 * Math.PI / 180;
function bulgeOf(p) {
  const b = Number(p.bulge);
  return Number.isFinite(b) ? b : 0;
}
function expandBulgeRing(pts) {
  if (!pts.some((p) => p.b && Math.abs(p.b) > 1e-9)) return pts.map((p) => ({ u: p.u, v: p.v }));
  const n2 = pts.length;
  const out = [];
  for (let i = 0; i < n2; i += 1) {
    const a = pts[i];
    const c = pts[(i + 1) % n2];
    out.push({ u: a.u, v: a.v });
    const bulge = a.b ?? 0;
    const chord = Math.hypot(c.u - a.u, c.v - a.v);
    if (!bulge || chord < 1e-9) continue;
    const sweep = 4 * Math.atan(bulge);
    const du = (c.u - a.u) / chord;
    const dv = (c.v - a.v) / chord;
    const h = chord / 2 / Math.tan(sweep / 2);
    const cu = (a.u + c.u) / 2 - dv * h;
    const cv = (a.v + c.v) / 2 + du * h;
    const r = Math.hypot(a.u - cu, a.v - cv);
    if (!(r > 1e-6)) continue;
    const a0 = Math.atan2(a.v - cv, a.u - cu);
    const step = Math.min(ARC_STEP_MAX, 2 * Math.acos(Math.max(-1, 1 - ARC_CHORD_MM / r)));
    const k = Math.max(2, Math.ceil(Math.abs(sweep) / step));
    for (let j = 1; j < k; j += 1) {
      const t = a0 + sweep * j / k;
      out.push({ u: cu + r * Math.cos(t), v: cv + r * Math.sin(t) });
    }
  }
  return out;
}
function localOutline(b) {
  const [U, V] = planeAxes(b.profilePlane);
  let raw = null;
  let local = false;
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector : null;
  if (b.profilePlane === "YZ") {
    if (pv) raw = pv.map((p) => ({ u: Number(p.y), v: Number(p.z), b: bulgeOf(p) }));
    else if (b.cutProfileVector && b.cutProfileVector.length >= 4) {
      raw = b.cutProfileVector.map((p) => ({ u: p.y, v: p.z }));
      local = true;
    }
  } else if (pv) {
    raw = pv.map((p) => ({ u: Number(p[U]), v: Number(p[V]), b: bulgeOf(p) }));
  }
  if (!raw) return null;
  if (raw.length > 2) {
    const a = raw[0];
    const c = raw[raw.length - 1];
    if (Math.abs(a.u - c.u) < 1e-9 && Math.abs(a.v - c.v) < 1e-9) raw.pop();
  }
  const expanded = expandBulgeRing(raw);
  if (expanded.length < 3) return null;
  if (local) return expanded.map((p) => [p.u, p.v]);
  const ou = b.profilePlane === "YZ" ? b.y0 : Math.min(...expanded.map((p) => p.u));
  const ov = b.profilePlane === "YZ" ? b.z0 : Math.min(...expanded.map((p) => p.v));
  return expanded.map((p) => [p.u - ou, p.v - ov]);
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

// generators/_lib/finish.ts
var DEFAULT_DOOR_COLOUR = "Gloss White";
var DEFAULT_CARCASS_COLOUR = "White Stipple";
function doorColourOf(params) {
  const raw = params ? params.doorColorName || params.doorColor : "";
  return String(raw || "").trim() || DEFAULT_DOOR_COLOUR;
}
function doorSidesOf(params) {
  return params && params.doorSides === "double" ? "double" : "single";
}
function carcassColourOf(params) {
  const name = params && String(params.carcassColorName || "").trim();
  if (name) return name;
  const raw = params && String(params.carcassColor || "").trim();
  return raw && raw !== "white_stipple" ? raw : DEFAULT_CARCASS_COLOUR;
}
var bigFaces = (b) => (b.faces ?? []).filter((f) => f.id === "A" || f.id === "B");
function applyDoorSides(boards, params) {
  const sides = doorSidesOf(params);
  const carcass = carcassColourOf(params);
  for (const b of boards) {
    if (b.stock?.kind !== "door") continue;
    const faces = bigFaces(b);
    const front = faces.find((f) => f.visible === true && f.finish?.colour && f.finish.colour !== carcass);
    if (!front) continue;
    const back = faces.find((f) => f !== front);
    if (!back) continue;
    const { grain: _drop, ...rest } = back.finish ?? {};
    back.finish = sides === "double" ? { ...rest, colour: front.finish.colour, ...front.finish.grain ? { grain: front.finish.grain } : {} } : { ...rest, colour: carcass };
    b.stock = { ...b.stock, sides: sides === "double" ? 2 : 1 };
  }
}

// generators/_lib/grain.ts
var SHEET_CROSS_MAX_MM = 1180;
var SHEET_ALONG_MAX_MM = 2380;
var PLANE_AXES = { XZ: ["x", "z"], YZ: ["y", "z"], XY: ["x", "y"] };
var WORD = { x: "wide", y: "deep", z: "high" };
function isDir(v) {
  return v === "horizontal" || v === "vertical";
}
function grainOf(params, group, defaults) {
  const stored = params && params.grain && typeof params.grain === "object" ? params.grain[group] : void 0;
  return isDir(stored) ? stored : defaults[group] ?? "horizontal";
}
function grainChecked(params) {
  return !!params && params.doorSeries === "hpl";
}
function colourFacesOf(b) {
  return (b.faces ?? []).filter((f) => (f.id === "A" || f.id === "B") && f.finish?.colour);
}
var round1 = (v) => Math.round(v * 10) / 10;
function applyGrain(boards, groupOf, params, defaults) {
  const checked = grainChecked(params);
  const groups = {};
  for (const g of Object.keys(defaults)) groups[g] = grainOf(params, g, defaults);
  const issues = [];
  const present = /* @__PURE__ */ new Set();
  for (const b of boards) {
    const group = groupOf(b);
    if (!group) continue;
    const faces = colourFacesOf(b);
    if (!faces.length) continue;
    const dir = grainOf(params, group, defaults);
    groups[group] = dir;
    present.add(group);
    const key = dir === "horizontal" ? "u" : "v";
    for (const f of faces) f.finish = { ...f.finish, grain: key };
    if (!checked) continue;
    const [U, V] = PLANE_AXES[b.profilePlane] ?? PLANE_AXES.XY;
    const alongAxis = key === "u" ? U : V;
    const acrossAxis = key === "u" ? V : U;
    const len = (a) => round1(b[`${a}1`] - b[`${a}0`]);
    const across = len(acrossAxis);
    const along = len(alongAxis);
    if (across > SHEET_CROSS_MAX_MM) {
      issues.push({
        board: b.id,
        group,
        dir,
        side: "across",
        length: across,
        word: WORD[acrossAxis],
        limit: SHEET_CROSS_MAX_MM,
        message: `${b.id} is ${across} ${WORD[acrossAxis]}: ${dir} grain allows ${SHEET_CROSS_MAX_MM} across the grain (sheet 1200 \xD7 2400)`
      });
    }
    if (along > SHEET_ALONG_MAX_MM) {
      issues.push({
        board: b.id,
        group,
        dir,
        side: "along",
        length: along,
        word: WORD[alongAxis],
        limit: SHEET_ALONG_MAX_MM,
        message: `${b.id} is ${along} ${WORD[alongAxis]}: ${dir} grain allows ${SHEET_ALONG_MAX_MM} along the grain (sheet 1200 \xD7 2400)`
      });
    }
  }
  return { groups, present: [...present], checked, issues };
}

// generators/_lib/milling.ts
var WORK = /* @__PURE__ */ new Set(["groove", "tgroove", "hole", "cutout"]);
var CARCASS = /stipple/i;
var EPS2 = 0.01;
var partial = (f) => WORK.has(f.kind) && !f.through;
var through = (f) => WORK.has(f.kind) && !!f.through;
function bboxArea(pts) {
  if (!pts || !pts.length) return 0;
  const xs = pts.map((p) => Number(p.x ?? 0));
  const ys = pts.map((p) => Number(p.y ?? 0));
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}
function slabRebateFace(b) {
  if (!b.slabs || b.slabs.length < 2 || b.thicknessAxis !== "Z") return null;
  const material = (s) => bboxArea(s.outline) - (s.holes ?? []).reduce((a, h) => a + bboxArea(h), 0);
  const bottom = b.slabs.reduce((a, s) => s.z0 < a.z0 ? s : a);
  const top = b.slabs.reduce((a, s) => s.z1 > a.z1 ? s : a);
  if (material(bottom) < material(top) - EPS2) return "B";
  if (material(top) < material(bottom) - EPS2) return "A";
  return null;
}
function colourFaceOf(b, A, B) {
  const coloured = b.stock?.kind === "door" || b.stock?.kind === "bench";
  if (!coloured || b.stock?.sides === 2) return null;
  return [A, B].find((f) => f.visible === true && f.finish?.colour && !CARCASS.test(f.finish.colour)) ?? null;
}
function reportFace(A, B, colour) {
  if (colour) return colour.id === "A" ? "B" : "A";
  const inward = (f) => f.semantic === "inside" || f.semantic === "back" || f.semantic === "wall";
  if (inward(B) && !inward(A)) return "B";
  return "A";
}
function applyMilling(boards) {
  const issues = [];
  for (const b of boards) {
    const A = b.faces?.find((f) => f.id === "A");
    const B = b.faces?.find((f) => f.id === "B");
    if (!A || !B) continue;
    const rebate = slabRebateFace(b);
    const onA = A.features.some(partial) || rebate === "A";
    const onB = B.features.some(partial) || rebate === "B";
    const colour = colourFaceOf(b, A, B);
    let face;
    if (onA && onB) {
      face = reportFace(A, B, colour);
      issues.push({ board: b.id, reason: "both-faces", message: `${b.id} has partial-depth machining on both faces: the CNC cuts from one side only` });
    } else if (onA || onB) {
      face = onA ? "A" : "B";
      if (colour && colour.id === face) {
        issues.push({ board: b.id, reason: "colour-face", message: `${b.id} is single-sided and has partial-depth machining on its colour face (${face})` });
      }
    } else if (colour) {
      face = colour.id === "A" ? "B" : "A";
    } else {
      b.milling = "either";
      continue;
    }
    const [to, from] = face === "A" ? [A, B] : [B, A];
    const moving = from.features.filter(through);
    if (moving.length) {
      from.features = from.features.filter((f) => !through(f));
      to.features.push(...moving);
    }
    b.milling = face;
  }
  return { issues };
}

// generators/_lib/expr.ts
var FUNCS = {
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  sqrt: Math.sqrt
};
function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?/i.exec(src.slice(i));
      if (!m) throw new Error(`bad number at ${i} in "${src}"`);
      out.push({ t: "num", v: Number(m[0]) });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][\w-]*(?:\[\d+\])?(?:\.[A-Za-z_][\w-]*(?:\[\d+\])?)*/.exec(src.slice(i));
      out.push({ t: "id", v: m[0] });
      i += m[0].length;
      continue;
    }
    if ("+-*/%^(),".includes(c)) {
      out.push({ t: c });
      i += 1;
      continue;
    }
    throw new Error(`unexpected "${c}" in "${src}"`);
  }
  return out;
}
function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const take = (t) => {
    const k = toks[p];
    if (!k || t && k.t !== t) throw new Error(`expected ${t || "a value"} in "${src}"`);
    p += 1;
    return k;
  };
  const primary = () => {
    const k = peek();
    if (!k) throw new Error(`unexpected end of "${src}"`);
    if (k.t === "num") {
      p += 1;
      return { k: "num", v: k.v };
    }
    if (k.t === "(") {
      p += 1;
      const v = sum();
      take(")");
      return v;
    }
    if (k.t === "-") {
      p += 1;
      return { k: "neg", a: primary() };
    }
    if (k.t === "+") {
      p += 1;
      return primary();
    }
    if (k.t === "id") {
      p += 1;
      const name = k.v;
      if (peek()?.t === "(") {
        p += 1;
        if (!(name in FUNCS)) throw new Error(`unknown function ${name} in "${src}"`);
        const args = [];
        if (peek()?.t !== ")") {
          args.push(sum());
          while (peek()?.t === ",") {
            p += 1;
            args.push(sum());
          }
        }
        take(")");
        return { k: "call", f: name, args };
      }
      return { k: "id", v: name };
    }
    throw new Error(`unexpected ${k.t} in "${src}"`);
  };
  const power = () => {
    let a = primary();
    while (peek()?.t === "^") {
      p += 1;
      a = { k: "bin", op: "^", a, b: primary() };
    }
    return a;
  };
  const product = () => {
    let a = power();
    while (peek() && ["*", "/", "%"].includes(peek().t)) {
      const op = take().t;
      a = { k: "bin", op, a, b: power() };
    }
    return a;
  };
  const sum = () => {
    let a = product();
    while (peek() && ["+", "-"].includes(peek().t)) {
      const op = take().t;
      a = { k: "bin", op, a, b: product() };
    }
    return a;
  };
  if (!toks.length) throw new Error("empty expression");
  const node = sum();
  if (p !== toks.length) throw new Error(`trailing input in "${src}"`);
  return node;
}
function namesOf(n2, out) {
  if (n2.k === "id") out.add(n2.v);
  else if (n2.k === "neg") namesOf(n2.a, out);
  else if (n2.k === "bin") {
    namesOf(n2.a, out);
    namesOf(n2.b, out);
  } else if (n2.k === "call") for (const a of n2.args) namesOf(a, out);
}
function run(n2, lookup) {
  switch (n2.k) {
    case "num":
      return n2.v;
    case "id":
      return lookup(n2.v);
    case "neg":
      return -run(n2.a, lookup);
    case "call":
      return FUNCS[n2.f](...n2.args.map((a) => run(a, lookup)));
    case "bin": {
      const a = run(n2.a, lookup);
      const b = run(n2.b, lookup);
      switch (n2.op) {
        case "+":
          return a + b;
        case "-":
          return a - b;
        case "*":
          return a * b;
        case "/":
          return a / b;
        case "%":
          return a % b;
        default:
          return a ** b;
      }
    }
  }
}
var cache = /* @__PURE__ */ new Map();
function compile(src) {
  const key = String(src).trim();
  const hit = cache.get(key);
  if (hit) return hit;
  const node = parse(key);
  const names = /* @__PURE__ */ new Set();
  namesOf(node, names);
  const compiled = { src: key, names: [...names], run: (lookup) => run(node, lookup) };
  cache.set(key, compiled);
  return compiled;
}

// generators/_lib/layout.ts
var AXES = ["x", "y", "z"];
function selectAxisRule(rule, situation = {}) {
  const list = rule.cases?.length ? rule.cases : [rule];
  const hit = list.filter((c) => !c.when || Object.entries(c.when).every(([k, v]) => situation[k] === v));
  hit.sort((a, b) => Object.keys(b.when || {}).length - Object.keys(a.when || {}).length);
  return hit[0] || null;
}
var CORNERS = ["FL", "FR", "RR", "RL"];
var LayoutError = class extends Error {
};
var FACE_REF = /^([A-Za-z][\w-]*)\.([xyz])([01])$/;
function planeOf(ref2) {
  const face = FACE_REF.exec(ref2);
  if (face) return { board: face[1], axis: face[2] };
  const m = /^([A-Za-z][\w-]*)\.(.+)$/.exec(ref2);
  if (!m) return null;
  const ax = /([xyz])\d*$/i.exec(m[2]);
  if (!ax) return null;
  return { board: m[1], axis: ax[1].toLowerCase() };
}
function atHonours(at, ref2, from, offset = 0, extra = 0) {
  const shift = (from === "lo" ? 1 : -1) * (Number(offset) || 0) + (Number(extra) || 0);
  let expected = ref2;
  if (shift) {
    const mag = Math.round(Math.abs(shift) * 1e3) / 1e3;
    expected = `${ref2} ${shift > 0 ? "+" : "-"} ${mag}`;
  }
  return at.trim() === expected;
}
function validateAxisRule(id, axis, r) {
  if (!r || r.from !== "lo" && r.from !== "hi") throw new LayoutError(`layout: ${id}.${axis} from must be lo or hi`);
  for (const k of ["at", "size"]) {
    if (typeof r[k] !== "string" || !r[k].trim()) throw new LayoutError(`layout: ${id}.${axis} ${k} missing`);
    try {
      compile(r[k]);
    } catch (err) {
      throw new LayoutError(`layout: ${id}.${axis} ${k}: ${err.message}`);
    }
  }
  if (r.when != null) {
    if (typeof r.when !== "object" || Array.isArray(r.when)) throw new LayoutError(`layout: ${id}.${axis} when must be a map of switches`);
    for (const [key, value] of Object.entries(r.when)) {
      if (typeof value !== "string" || !value) throw new LayoutError(`layout: ${id}.${axis} when.${key} must be a value`);
    }
  }
  if (r.relation != null) {
    const rel = r.relation;
    if (rel.kind !== "contact" && rel.kind !== "flush") throw new LayoutError(`layout: ${id}.${axis} relation must be contact or flush`);
    const plane = planeOf(String(rel.ref));
    if (!plane) throw new LayoutError(`layout: ${id}.${axis} relation ref ${rel.ref} is not a board face`);
    if (plane.axis !== axis) throw new LayoutError(`layout: ${id}.${axis} relation ref ${rel.ref} is on another axis`);
    if (plane.board === id) throw new LayoutError(`layout: ${id}.${axis} relation refers to its own face`);
    if (!atHonours(r.at, String(rel.ref), r.from, rel.offset || 0, rel.delta || 0)) throw new LayoutError(`layout: ${id}.${axis} relation ref ${rel.ref} differs from at (${r.at})`);
  }
}
function validateLayout(raw) {
  const f = raw;
  if (!f || typeof f !== "object") throw new LayoutError("layout: not an object");
  if (typeof f.module !== "string") throw new LayoutError("layout: module missing");
  if (!Number.isFinite(f.version)) throw new LayoutError("layout: version missing");
  if (!f.boards || typeof f.boards !== "object") throw new LayoutError("layout: boards missing");
  for (const [id, b] of Object.entries(f.boards)) {
    if (!b || typeof b.axes !== "object") throw new LayoutError(`layout: ${id} has no axes`);
    for (const [axis, r] of Object.entries(b.axes)) {
      if (!AXES.includes(axis)) throw new LayoutError(`layout: ${id} has an unknown axis ${axis}`);
      const list = r?.cases?.length ? r.cases : [r];
      for (const one of list) validateAxisRule(id, axis, one);
    }
    const check = (what, src) => {
      if (typeof src !== "string" || !src.trim()) throw new LayoutError(`layout: ${id} ${what} missing`);
      try {
        compile(src);
      } catch (err) {
        throw new LayoutError(`layout: ${id} ${what}: ${err.message}`);
      }
    };
    if (b.outline != null) {
      for (const c of CORNERS) {
        const p = b.outline.corners?.[c];
        if (!p) throw new LayoutError(`layout: ${id} outline has no corner ${c}`);
        check(`corner ${c} u`, p.u);
        check(`corner ${c} v`, p.v);
      }
    }
    for (const [fid, feat] of Object.entries(b.features ?? {})) check(`feature ${fid} depth`, feat?.depth);
  }
  return f;
}
function recordExpr(key, src, scope, from) {
  const c = compile(src);
  const terms = {};
  for (const n2 of c.names) {
    if (n2 in scope) terms[n2] = scope[n2];
    else if (Number.isFinite(valueOf(n2))) terms[n2] = ref(n2);
    else throw new LayoutError(`layout: ${from} uses ${n2}, which is not an input, a rule or a value recorded before it`);
  }
  return dim(key, terms, (t) => c.run((n2) => t[n2]), { formula: c.src });
}
function placeBoards(file, ids, scope, warnings = [], situation = {}) {
  const placing = new Set(ids);
  for (const id of ids) {
    const rule = file.boards[id];
    if (!rule?.axes || !AXES.some((axis) => rule.axes[axis])) throw new LayoutError(`layout: ${id} has no axes`);
  }
  const done = /* @__PURE__ */ new Map();
  const visiting = [];
  const termOf = (name, from) => {
    if (name in scope) return scope[name];
    const m = FACE_REF.exec(name);
    if (m && placing.has(m[1])) {
      placeAxis(m[1], m[2]);
      return ref(name);
    }
    if (Number.isFinite(valueOf(name))) return ref(name);
    if (m) throw new LayoutError(`layout: ${from} uses ${name}: ${m[1]} is placed in code after these boards, so its faces cannot be referenced yet`);
    throw new LayoutError(`layout: ${from} uses ${name}, which is not an input, a rule or a placed face`);
  };
  const record = (key, c, from) => {
    const terms = {};
    for (const n2 of c.names) terms[n2] = termOf(n2, from);
    return dim(key, terms, (t) => c.run((n2) => t[n2]), { formula: c.src });
  };
  function placeAxis(id, axis) {
    const key = `${id}.${axis}`;
    const hit = done.get(key);
    if (hit) return hit;
    const raw = file.boards[id].axes[axis];
    const r = raw ? selectAxisRule(raw, situation) : null;
    if (!r) return null;
    if (visiting.includes(key)) {
      throw new LayoutError(`layout: ${[...visiting.slice(visiting.indexOf(key)), key].join(" \u2192 ")} goes round in a circle`);
    }
    visiting.push(key);
    const lo = `${id}.${axis}0`;
    const hi = `${id}.${axis}1`;
    const sizeKey = `${id}.${axis}Size`;
    const drive = r.from === "lo" ? lo : hi;
    const other = r.from === "lo" ? hi : lo;
    record(drive, compile(r.at), `${id} ${axis} position`);
    const size = record(sizeKey, compile(r.size), `${id} ${axis} size`);
    if (!(size > 0)) throw new LayoutError(`layout: ${id} ${axis} size is ${size}, it must be above 0`);
    if (r.from === "lo") dim(other, { [drive]: ref(drive), [sizeKey]: ref(sizeKey) }, (t) => t[drive] + t[sizeKey], { formula: `${drive} + ${sizeKey}` });
    else dim(other, { [drive]: ref(drive), [sizeKey]: ref(sizeKey) }, (t) => t[drive] - t[sizeKey], { formula: `${drive} - ${sizeKey}` });
    visiting.pop();
    const pair = [valueOf(lo), valueOf(hi)];
    done.set(key, pair);
    return pair;
  }
  const out = {};
  for (const id of ids) {
    const box = {};
    for (const axis of AXES) {
      if (!file.boards[id].axes[axis]) continue;
      const pair = placeAxis(id, axis);
      if (!pair) continue;
      const [a0, a1] = pair;
      box[`${axis}0`] = a0;
      box[`${axis}1`] = a1;
    }
    out[id] = box;
  }
  for (const id of ids) {
    for (const axis of AXES) {
      const raw = file.boards[id].axes[axis];
      if (!raw) continue;
      const rel = selectAxisRule(raw, situation)?.relation;
      if (rel?.kind !== "contact" || rel.offset) continue;
      const otherId = planeOf(rel.ref)?.board;
      if (!otherId || !out[otherId]) continue;
      const other = otherId;
      const ok = AXES.filter((k) => k !== axis).every((k) => {
        const a0 = out[id][`${k}0`] ?? valueOf(`${id}.${k}0`);
        const a1 = out[id][`${k}1`] ?? valueOf(`${id}.${k}1`);
        const b0 = valueOf(`${other}.${k}0`);
        const b1 = valueOf(`${other}.${k}1`);
        return Number.isFinite(b0) && Number.isFinite(b1) && Math.min(a1, b1) - Math.max(a0, b0) > 0.01;
      });
      if (!ok) warnings.push(`${id}: its ${axis} contact with ${rel.ref} no longer touches (the two faces do not overlap).`);
    }
  }
  return out;
}
var round2 = (n2) => Math.round(n2 * 1e3) / 1e3;
function followOutline(board, before) {
  if (board.profilePlane !== "YZ" || !board.profileVector) return;
  const dy = board.y0 - before.y0;
  const dz = board.z0 - before.z0;
  if (Math.abs(dy) < 1e-9 && Math.abs(dz) < 1e-9) return;
  board.profileVector = board.profileVector.map((p) => {
    const q = { ...p };
    if (typeof q.y === "number") q.y = round2(q.y + dy);
    if (typeof q.z === "number") q.z = round2(q.z + dz);
    return q;
  });
}
function applyLayoutDraft(boards, layout, scope, errors, warnings, situation = {}, skip = () => false) {
  if (layout == null) return;
  try {
    const file = validateLayout(layout);
    const known = new Set(boards.map((b) => b.id));
    const ids = Object.keys(file.boards).filter((id) => known.has(id) && !skip(id));
    for (const id of Object.keys(file.boards)) {
      if (skip(id)) continue;
      if (!known.has(id)) warnings.push(`layout: ${id} is not a board of this cabinet, so that rule was left unused`);
    }
    if (!ids.length) return;
    const placed = placeBoards(file, ids, scope, warnings, situation);
    for (const b of boards) {
      const box = placed[b.id];
      if (!box) continue;
      const before = { y0: b.y0, z0: b.z0 };
      for (const face of ["x0", "x1", "y0", "y1", "z0", "z1"]) {
        const v = box[face];
        if (typeof v === "number") b[face] = v;
      }
      followOutline(b, before);
    }
  } catch (err) {
    if (err instanceof LayoutError) errors.push(err.message);
    else throw err;
  }
}

// generators/_lib/edgeBand.ts
function outlineOf(b) {
  return localOutline(b) ?? rectOutline(b);
}
function setEdgeBand(b, i, band) {
  if (!Number.isInteger(i) || i < 0) throw new Error(`${b.id}: edge ${i} is not an outline index`);
  const n2 = outlineOf(b).length;
  if (i >= n2) throw new Error(`${b.id}: edge ${i} is past the outline (${n2} edges)`);
  const face = faceOf(b, `E${i}`);
  if (!band) {
    if (!face.finish?.edgeBand) return;
    delete face.finish.edgeBand;
    if (face.finish.colour == null) delete face.finish;
    return;
  }
  if (!Number.isFinite(band.thickness) || band.thickness <= 0) {
    throw new Error(`${b.id}.E${i}: edge band thickness must be millimetres above 0`);
  }
  const stored = { thickness: band.thickness };
  if (band.colour) stored.colour = band.colour;
  face.finish = { ...face.finish, edgeBand: stored };
}

// generators/overheadCabinet/faces.ts
var EPS3 = 0.01;
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
    if (isFront) {
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, "A", { semantic: "back", visible: false });
    }
  }
  const bpBoards = boards.filter((b) => b.boardType === "BP");
  const bp = bpBoards[0];
  for (const one of bpBoards) {
    annotate(one, "A", { semantic: "inside" });
    annotate(one, "B", { semantic: "bottom", visible: true });
  }
  const dividers = boards.filter((b) => b.category === "divider").sort((a, b) => a.x0 - b.x0);
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
  const t3Boards = boards.filter((b) => b.boardType === "T3");
  const t3 = t3Boards[0];
  for (const one of t3Boards) {
    annotate(one, "A", { semantic: "top" });
    annotate(one, "B", { semantic: "bottom" });
  }
  const tape = RULES.EDGE_BAND_THICKNESS_MM.value;
  const band = (b, normal, colour) => {
    if (!b) return;
    for (const f of boundaryEdgeFaces(b, normal)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour });
  };
  for (const b of boards) {
    if (b.category !== "front_panel") continue;
    for (const f of edgeFaces(b)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: fb.doorColour });
  }
  for (const one of bpBoards) band(one, "-Y", fb.carcassColorName);
  for (const d of dividers) band(d, "-Y", fb.carcassColorName);
  for (const one of t3Boards) {
    band(one, "-Y", fb.carcassColorName);
    band(one, "+Y", fb.carcassColorName);
  }
  for (const one of boards.filter((b) => b.boardType === "T4")) band(one, "-Z", fb.carcassColorName);
  band(B.get("RGHD_TOP"), "-Y", fb.carcassColorName);
  if (bpBoards.length) {
    geometry.divider_features.forEach((df, index) => {
      if (fb.suppressedGrooves.includes(index) || !df.bp_groove) return;
      const host = bpBoards.find((b) => df.XDi >= b.x0 - EPS3 && df.XDi <= b.x1 + EPS3) ?? bpBoards[0];
      const g = df.bp_groove;
      const r = localRect(host, { x: g.x, y: g.y });
      addFeature(host, "A", {
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
    tagEdges(d, "tongue", { u0: tongueY0 - d.y0 - EPS3, u1: tongueY1 - d.y0 + EPS3, v0: -tongueH - EPS3, v1: -EPS3 }, {
      id: `${df.id}_TONGUE`,
      for: onRangehood ? "RGHD_TOP" : "BP",
      source: "overhead"
    });
    if (B.has("T3")) {
      const frontStepY1 = RULES.FRONT_TOP_NOTCH_Y_OFFSET_MM.value + RULES.FRONT_TOP_STEP_Y_MM.value;
      tagEdges(d, "notch", { u0: -EPS3, u1: frontStepY1 + EPS3, v0: zTop - tch - slot - EPS3, v1: zTop - tch + EPS3 }, {
        id: `${df.id}_T3_STEP`,
        for: "T3",
        source: "overhead"
      });
    }
    if (B.has("T4")) {
      const rearNotchH = RULES.T4_HEIGHT_MM.value - cpt;
      tagEdges(d, "notch", { u0: d.y1 - d.y0 - slot - EPS3, u1: d.y1 - d.y0 + EPS3, v0: zTop - rearNotchH - EPS3, v1: zTop - EPS3 }, {
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
    const hosts = fb.boards.filter((b) => b.boardType === part);
    if (!hosts.length) continue;
    const [U, V] = planeAxes(hosts[0].profilePlane);
    for (const hole of geometry.panel_screw_holes[part]) {
      const x = hole.center[0];
      const board = hosts.find((b) => x >= b.x0 - EPS3 && x <= b.x1 + EPS3);
      if (!board) continue;
      const K = `${board.id}.feat.${hole.id}`;
      const df = geometry.divider_features.find((f) => f.id === hole.for_divider);
      const x0name = `${board.id}.${U}0`;
      const cu = dim(`${K}.${U}`, { XDi: df?.XDi ?? x, x0: ref(x0name) }, (t) => t.XDi - t.x0, { formula: `XDi - ${x0name}` });
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
    const n2 = h.id.replace(`${h.boardId}_`, "");
    addFeature(fp, "A", {
      id: h.id,
      kind: "hole",
      center: [h.center[0], h.center[1]],
      diameter: h.diameter,
      depth: h.depth,
      through: false,
      for: "hinge",
      key: `${h.boardId}.feat.${n2}`,
      source: "overhead"
    });
  }
  for (const led of fb.ledFeatures) {
    const host = B.get(String(led.targetBoardId ?? "T3")) ?? t3;
    if (led.type !== "t3_groove" || !host) continue;
    const main = led.main;
    const branches = led.branches ?? [];
    const depth = Number(led.depth);
    const KM = host.id === "T3" ? "T3.feat.LED_MAIN" : `${host.id}.feat.LED_MAIN`;
    const rearKey = host.id === "T3" ? "T3.pv.rearY" : `${host.id}.pv.rearY`;
    dim(`${KM}.x0`, {}, () => 0, { formula: "0" });
    dim(`${KM}.x1`, { x1: ref(`${host.id}.x1`), x0: ref(`${host.id}.x0`) }, (t) => t.x1 - t.x0);
    dim(`${KM}.y0`, { LAND: RULES.LED_GROOVE_FRONT_LAND_MM }, (t) => t.LAND);
    dim(`${KM}.y1`, { LAND: RULES.LED_GROOVE_FRONT_LAND_MM, W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.LAND + t.W);
    const shared = { group: "T3.LED", depthKey: "T3.feat.LED.depth" };
    addFeature(host, "A", {
      id: host.id === "T3" ? "T3_LED_MAIN" : `${host.id}_LED_MAIN`,
      kind: "tgroove",
      u0: main.x0,
      u1: main.x1,
      v0: main.y0,
      v1: main.y1,
      depth,
      for: "led",
      key: KM,
      source: "T3",
      ...shared
    });
    branches.forEach((br, i) => {
      const KB = host.id === "T3" ? `T3.feat.LED_BRANCH_${i + 1}` : `${host.id}.feat.LED_BRANCH_${i + 1}`;
      const x = i === 0 ? { terms: { INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM, W: RULES.LED_GROOVE_WIDTH_MM }, x0: (t) => t.INSET - t.W / 2, x1: (t) => t.INSET + t.W / 2 } : { terms: { width: ref(`${KM}.x1`), INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM, W: RULES.LED_GROOVE_WIDTH_MM }, x0: (t) => t.width - t.INSET - t.W / 2, x1: (t) => t.width - t.INSET + t.W / 2 };
      dim(`${KB}.x0`, x.terms, x.x0);
      dim(`${KB}.x1`, x.terms, x.x1);
      dim(`${KB}.y0`, { mainY1: ref(`${KM}.y1`) }, (t) => t.mainY1);
      dim(`${KB}.y1`, { rearY: ref(rearKey) }, (t) => t.rearY);
      addFeature(host, "A", {
        id: host.id === "T3" ? `T3_LED_BRANCH_${i + 1}` : `${host.id}_LED_BRANCH_${i + 1}`,
        kind: "tgroove",
        u0: br.x0,
        u1: br.x1,
        v0: br.y0,
        v1: br.y1,
        depth,
        for: "led",
        key: KB,
        source: "T3",
        ...shared
      });
    });
  }
  for (const f of fb.rangehoodFeatures) {
    const type = String(f.type);
    if (type === "rangehood_bp_cutout" && bpBoards.length) {
      const span = f.x;
      const mid = (span[0] + span[1]) / 2;
      const hostBp = bpBoards.find((b) => mid >= b.x0 - EPS3 && mid <= b.x1 + EPS3) ?? bp;
      if (!hostBp) continue;
      const r = localRect(hostBp, { x: span, y: f.y });
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
      addFeature(hostBp, "A", { id: String(f.id), kind: "cutout", ...r, through: true, for: "rangehood", key: K, source: "overhead_rangehood" });
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
      const fa = faceOf(a, a.y1 <= b.y0 + EPS3 ? "A" : "B");
      const fbk = faceOf(b, fa.id === "A" ? "B" : "A");
      joints.push(joint(decl.declarationId, "face_contact", faceRef(a.id, [fa]), faceRef(b.id, [fbk]), { hardware: decl.allowedHardware, rule: decl.ruleId }));
      continue;
    }
    if (a.id === "BP") {
      if (b.category === "divider") {
        const bottom = edgeFacesIn(b, { u0: -EPS3, u1: b.y1 - b.y0 + EPS3, v0: -EPS3, v1: EPS3 });
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

// generators/overheadCabinet/layout.json
var layout_default = {
  module: "overheadCabinet",
  version: 1,
  boards: {
    T1: {
      label: "\u9876\u90E8\u524D\u8F68 T1",
      axes: {
        x: { from: "lo", at: "0", size: "Cw" },
        y: { from: "lo", at: "TCH - 1", size: "FPT" },
        z: { from: "hi", at: "H", size: "TCH" }
      }
    },
    T2: {
      label: "\u9876\u90E8\u540E\u8F68 T2",
      axes: {
        x: { from: "lo", at: "0", size: "Cw" },
        y: { from: "lo", at: "T1.y1", size: "CPT" },
        z: { from: "hi", at: "T1.z1", size: "T1.z1 - T1.z0" }
      }
    },
    T3: {
      label: "\u9876\u90E8\u6A2A\u677F T3",
      axes: {
        x: { from: "lo", at: "0", size: "Cw" },
        y: { from: "lo", at: "0", size: "T3_DEPTH_MM" },
        z: { from: "hi", at: "H - TCH - 1", size: "CPT" }
      },
      outline: {
        corners: {
          FL: { u: "0", v: "0" },
          FR: { u: "T3.xSize", v: "0" },
          RR: { u: "T3.xSize", v: "T3.ySize" },
          RL: { u: "0", v: "T3.ySize" }
        }
      },
      features: {
        LED: { label: "LED \u706F\u69FD", depth: "LED_GROOVE_DEPTH_MM" }
      }
    },
    T4: {
      label: "\u9876\u90E8\u7AD6\u677F T4",
      axes: {
        x: { from: "lo", at: "0", size: "Cw" },
        y: { from: "hi", at: "Cd - CPT - clearance", size: "CPT" },
        z: { from: "hi", at: "H", size: "T4_HEIGHT_MM" }
      }
    }
  }
};

// generators/overheadCabinet/layout.ts
var LAYOUT = validateLayout(layout_default);

// generators/_lib/controlPanel.ts
var CONTROL_PANEL_DEFAULTS = { width: 175, height: 105, depth: 35 };
var CONTROL_PANEL_GROOVE_MM = 10;
var CONTROL_PANEL_EDGE_PAST_MM = 0.5;
function controlPanelLayers(depth, stack, backing, groove = CONTROL_PANEL_GROOVE_MM) {
  const cuts = [];
  let reached = 0;
  for (let i = 0; i < 64; i += 1) {
    const t = i < stack.length ? stack[i] : backing;
    if (reached >= depth - 1e-6) {
      cuts.push("none");
      break;
    }
    if (depth - reached <= groove + 1e-6 && groove < t) {
      cuts.push("groove");
      reached += groove;
      break;
    }
    cuts.push("through");
    reached += t;
  }
  return { cuts, added: Math.max(0, cuts.length - stack.length), reached };
}
function normalizeControlPanel(raw) {
  if (!raw || typeof raw !== "object") return null;
  const r = raw;
  const num = (v, d) => Number.isFinite(Number(v)) ? Math.round(Number(v) * 10) / 10 : d;
  const rec = {
    id: String(r.id || ""),
    fromCeiling: num(r.fromCeiling, 200),
    fromBack: num(r.fromBack, 200),
    width: num(r.width, CONTROL_PANEL_DEFAULTS.width),
    height: num(r.height, CONTROL_PANEL_DEFAULTS.height),
    depth: num(r.depth, CONTROL_PANEL_DEFAULTS.depth)
  };
  if (!(rec.width >= 1 && rec.height >= 1 && rec.depth >= 1)) return null;
  return rec;
}

// generators/overheadCabinet/controlPanel.ts
function endPanelSide(raw) {
  return raw === "left" || raw === "right" ? raw : null;
}
function addEndPanel(boards, inputs, side) {
  const FPT = inputs.frontPanelThickness == null ? RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM : param({ FPT: inputs.frontPanelThickness }).FPT;
  const fpt = inputs.frontPanelThickness ?? RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM.value;
  const P = param({ Cw: inputs.cabinetWidth, Cd: inputs.cabinetDepth, H: inputs.cabinetHeight ?? 0 });
  const doorBottom = boards.find((b) => b.category === "front_panel");
  const x0 = side === "left" ? dim("END_PANEL.x0", { FPT }, (t) => -t.FPT, { formula: "-FPT" }) : dim("END_PANEL.x0", { Cw: P.Cw }, (t) => t.Cw, { formula: "Cw" });
  const x1 = side === "left" ? dim("END_PANEL.x1", {}, () => 0, { formula: "0" }) : dim("END_PANEL.x1", { x0: ref("END_PANEL.x0"), FPT }, (t) => t.x0 + t.FPT);
  const y0 = dim("END_PANEL.y0", { FPT }, (t) => -t.FPT, { formula: "-FPT (flush with the door face)" });
  const y1 = dim("END_PANEL.y1", { Cd: P.Cd }, (t) => t.Cd);
  const z0 = doorBottom ? same("END_PANEL.z0", `${doorBottom.id}.z0`) : dim("END_PANEL.z0", {}, () => -30, { formula: "-30 (door underside)" });
  const z1 = dim("END_PANEL.z1", { H: P.H }, (t) => t.H);
  boards.push({
    id: "END_PANEL",
    name: `End panel (${side})`,
    category: "end_panel",
    boardType: "end_panel",
    materialThickness: fpt,
    profilePlane: "YZ",
    thicknessAxis: "X",
    x0,
    x1,
    y0,
    y1,
    z0,
    z1,
    source: "overhead",
    notes: ["Door stock outside the end divider: door underside to the top, flush with the door face."]
  });
}
function finishEndPanel(boards, side, doorColour) {
  const b = boards.find((x) => x.id === "END_PANEL");
  if (!b || !side) return;
  const out = side === "left" ? "B" : "A";
  b.stock = { kind: "door", thickness: b.materialThickness, colour: doorColour };
  annotate(b, out, { semantic: "outside", visible: true, finish: { colour: doorColour } });
  annotate(b, out === "A" ? "B" : "A", { semantic: "inside", visible: false });
  const tape = RULES.EDGE_BAND_THICKNESS_MM.value;
  for (const n2 of ["-Y", "-Z"]) {
    for (const f of boundaryEdgeFaces(b, n2)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: doorColour });
  }
}
function mergeRanges(ranges) {
  const sorted = ranges.filter(([a, b]) => b - a > 1e-6).sort((p, q) => p[0] - q[0]);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}
function reoutline(boards, features, slot) {
  for (const kind of ["T3", "T4"]) {
    for (const b of boards.filter((x) => x.boardType === kind)) {
      const ranges = mergeRanges(features.map((f) => {
        const [a, c] = featureXRange(f.XDi, slot);
        return [Math.max(a, b.x0) - b.x0, Math.min(c, b.x1) - b.x0];
      }));
      const w = param({ w: b.x1 - b.x0 }).w;
      const pts = kind === "T3" ? t3TrimmedOutlinePoints(w, ranges, RULES.T3_DEPTH_MM, RULES.T3_NOTCH_DEPTH_MM, `${b.id}.pv`) : t4TrimmedOutlinePoints(w, ranges, RULES.T4_HEIGHT_MM, RULES.T4_NOTCH_HEIGHT_MM, `${b.id}.pv`);
      b.profileVector = pts.map(([u, v]) => kind === "T3" ? { x: u + b.x0, y: v } : { x: u + b.x0, z: v });
    }
  }
}
function controlPanelsOf(raw, endSide) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const r of raw) {
    const rec = normalizeControlPanel(r);
    if (!rec) continue;
    const x = r;
    const host = x.host === "wall" ? "wall" : "endPanel";
    const side = host === "wall" ? endPanelSide(x.side) : endSide;
    if (!side) continue;
    out.push({ ...rec, host, side, wallThickness: Number(x.wallThickness) || 0, wall: x.wall ? String(x.wall) : void 0 });
  }
  return out;
}
function planControlPanels(boards, geometry, inputs, panels, hood, hoodDivider, warnings) {
  const plan = { cuts: [], suppressed: [], hoodFeatures: [] };
  if (!panels.length) return plan;
  const cpt = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const Cw = inputs.cabinetWidth;
  const Cd = inputs.cabinetDepth;
  const H = inputs.cabinetHeight ?? 0;
  const tch = inputs.topClearanceHeight ?? RULES.T1_HEIGHT_MM.value;
  const fpt = inputs.frontPanelThickness ?? RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM.value;
  const slot = cpt + RULES.FEATURE_CLEARANCE_MM.value;
  const zones = inputs.zones ?? [];
  const dividers = boards.filter((b) => b.category === "divider").sort((a, b) => a.x0 - b.x0);
  const ends = { left: dividers[0], right: dividers[dividers.length - 1] };
  const top = H - tch - cpt - 1;
  const sized = panels.map((p) => {
    const cy = Cd - p.fromBack;
    const cz = H - p.fromCeiling;
    const y = [cy - p.width / 2, cy + p.width / 2];
    const z = [cz - p.height / 2, cz + p.height / 2];
    const stack = p.host === "wall" ? [p.wallThickness || 0, cpt] : [fpt, cpt];
    const layers = controlPanelLayers(p.depth, stack, cpt);
    return { p, y, z, layers };
  }).filter(({ p, y, z }) => {
    if (y[0] < -1e-6 || y[1] > Cd + 1e-6 || z[0] < cpt - 1e-6 || z[1] > top + 1e-6) {
      warnings.push(`Control panel ${p.id} runs past the overhead carcass (y 0\u2013${Cd}, z ${cpt}\u2013${Math.round(top * 10) / 10}): not cut.`);
      return false;
    }
    return true;
  });
  for (const side of ["left", "right"]) {
    const mine = sized.filter((s) => s.p.side === side);
    const end = ends[side];
    if (!mine.length || !end) continue;
    const zoneIndex = side === "left" ? 0 : zones.length - 1;
    const onHood = !!hood && (side === "left" ? hood.firstZoneIndex === 0 : hood.lastZoneIndex === zones.length - 1);
    const short = onHood ? hoodDivider() : null;
    const need = Math.max(...mine.map((s) => s.layers.added));
    const zoneWidth = Number(zones[zoneIndex]?.width) || Cw;
    if ((need + 1) * cpt > zoneWidth - 50) warnings.push(`Control panel: ${need} backing board(s) at the ${side} end leave the zone too narrow.`);
    const backing = [];
    for (let k = 1; k <= need; k += 1) {
      const id = `D_CP_${side === "left" ? "L" : "R"}${k}`;
      const bx0 = side === "left" ? k * cpt : Cw - (k + 1) * cpt;
      const xdi = bx0 + cpt / 2;
      const feature = {
        id,
        XDi: xdi,
        bp_groove: bpGroove(id, xdi, Cd, slot, inputs.dividerTongueHeight ?? cpt / 2 - 0.5, Cw),
        screw_holes: screwHolePositions(xdi, Cd),
        divider_tongue: { ...geometry.divider_features[0].divider_tongue },
        t3_notch: t3Notch(id, xdi, slot, Cw),
        t4_notch: t4Notch(id, xdi, slot, Cw)
      };
      geometry.divider_features.push(feature);
      const index = geometry.divider_features.length - 1;
      for (const part of ["T2", "T3", "T4"]) {
        const list = geometry.panel_screw_holes[part];
        const like = list[0];
        if (!like) continue;
        list.push({ ...like, id: `${part}SH_${id}`, for_divider: id, center: [xdi, like.center[1]] });
      }
      dim(`${id}.x0`, { at: bx0 }, (t) => t.at, { formula: side === "left" ? `${k} \xD7 CPT (behind the end divider)` : `Cw \u2212 ${k + 1} \xD7 CPT` });
      dim(`${id}.x1`, { x0: ref(`${id}.x0`), CPT: param({ CPT: cpt }).CPT }, (t) => t.x0 + t.CPT);
      same(`${id}.y0`, `${end.id}.y0`);
      same(`${id}.y1`, `${end.id}.y1`);
      const z0 = short ? dim(`${id}.z0`, { z: short.z0 }, (t) => t.z, { formula: "on RGHD_TOP" }) : same(`${id}.z0`, `${end.id}.z0`);
      const z1 = same(`${id}.z1`, `${end.id}.z1`);
      const board = {
        ...end,
        id,
        name: `Control panel backing ${side} ${k}`,
        x0: bx0,
        x1: bx0 + cpt,
        z0,
        z1,
        cutProfileVector: short ? short.cutProfileVector : end.cutProfileVector,
        profileFeatures: [...short ? [] : [feature.bp_groove], feature.divider_tongue, feature.t3_notch, feature.t4_notch],
        notes: [short ? "Backing divider for a control panel; stands on RGHD_TOP." : "Backing divider for a control panel."]
      };
      if (short) {
        plan.suppressed.push(index);
        plan.hoodFeatures.push({
          id: `RGHD_TOP_${id}_GROOVE`,
          type: "rangehood_top_divider_groove",
          targetBoardId: "RGHD_TOP",
          dividerBoardId: id,
          face: "top",
          x: [xdi - slot / 2, xdi + slot / 2],
          y: [Cd / 3, Cd * 2 / 3],
          depth: cpt / 2
        });
      }
      boards.push(board);
      backing.push(board);
    }
    if (need) reoutline(boards, geometry.divider_features, slot);
    const toward = side === "left" ? "-X" : "+X";
    for (const { p, y, z, layers } of mine) {
      const stackBoards = [p.host === "wall" ? null : "END_PANEL", end.id, ...backing.map((b) => b.id)];
      layers.cuts.forEach((cut, i) => {
        const board = stackBoards[i];
        if (!board || cut === "none") return;
        if (short && i >= 2 && z[0] < short.z0 - 1e-6) {
          warnings.push(`Control panel ${p.id}: the opening reaches below the short divider on RGHD_TOP.`);
          return;
        }
        if (cut === "through") {
          plan.cuts.push({ id: `CP_${p.id}_${board}`, board, toward, kind: "through", y, z, panel: p.id });
        } else {
          const back = (boards.find((b) => b.id === board)?.y1 ?? Cd) + CONTROL_PANEL_EDGE_PAST_MM;
          plan.cuts.push({ id: `CP_${p.id}_${board}`, board, toward, kind: "groove", y: [y[0], back], z, depth: CONTROL_PANEL_GROOVE_MM, panel: p.id });
        }
      });
      if (p.host === "wall" && layers.cuts[0] !== "through") {
        warnings.push(`Control panel ${p.id}: ${p.depth} mm is not deeper than the 10 mm half slot; the partition is cut through.`);
      }
    }
  }
  return plan;
}
function applyControlPanelCuts(boards, plan, warnings) {
  for (const c of plan.cuts) {
    const b = boards.find((x) => x.id === c.board);
    if (!b) continue;
    const face = bigFaceToward(b, c.toward);
    if (!face) continue;
    const r = localRect(b, { y: c.y, z: c.z });
    const w = b.y1 - b.y0;
    const h = b.z1 - b.z0;
    const past = c.kind === "groove" ? CONTROL_PANEL_EDGE_PAST_MM : 0;
    if (r.u0 < -0.01 || r.u1 > w + past + 0.01 || r.v0 < -0.01 || r.v1 > h + 0.01) {
      warnings.push(`Control panel ${c.panel}: the opening runs off ${b.id}; not cut there.`);
      continue;
    }
    addFeature(b, face.id, c.kind === "through" ? { id: c.id, kind: "cutout", ...r, through: true, for: "control_panel", source: "control_panel" } : { id: c.id, kind: "groove", ...r, depth: c.depth, for: "control_panel", source: "control_panel" });
  }
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
function ruleScope(inputs) {
  const height = inputs.cabinetHeight ?? inputs.topClearanceHeight ?? RULES.T1_HEIGHT_MM.value;
  const P = param({ Cw: inputs.cabinetWidth, Cd: inputs.cabinetDepth, H: height });
  const t = (v, name, rule) => v == null ? rule : param({ [name]: v })[name];
  return {
    ...RULES,
    Cw: P.Cw,
    Cd: P.Cd,
    H: P.H,
    CPT: t(inputs.featureWidth, "CPT", RULES.DIVIDER_THICKNESS_MM),
    FPT: t(inputs.frontPanelThickness, "FPT", RULES.DEFAULT_FRONT_PANEL_THICKNESS_MM),
    TCH: t(inputs.topClearanceHeight, "TCH", RULES.T1_HEIGHT_MM),
    clearance: t(inputs.clearance, "clearance", RULES.DEFAULT_CLEARANCE_MM)
  };
}
function dividerNotches(geometry, inputs, frameX0, lo, hi) {
  const slot = (inputs.featureWidth ?? DIVIDER_THICKNESS_MM) + RULES.FEATURE_CLEARANCE_MM.value;
  return geometry.divider_features.map((f) => clampRange(featureXRange(f.XDi, slot), 0, inputs.cabinetWidth)).map(([a, b]) => [Math.max(a - frameX0, lo), Math.min(b - frameX0, hi)]).filter(([a, b]) => b - a > 1e-6);
}
function shapeT3(rule, frame, geometry, inputs, scope, _warnings) {
  const corners = rule.outline.corners;
  const c = {};
  for (const k of CORNERS) {
    c[k] = [
      recordExpr(`T3.corner.${k}.u`, corners[k].u, scope, `T3 corner ${k} u`),
      recordExpr(`T3.corner.${k}.v`, corners[k].v, scope, `T3 corner ${k} v`)
    ];
  }
  const W = frame.x1 - frame.x0;
  const D = frame.y1 - frame.y0;
  const at = (k, u, v) => Math.abs(c[k][0] - u) < 1e-9 && Math.abs(c[k][1] - v) < 1e-9;
  const legacy = geometry.trimmed_vectors.T3;
  const legacyFits = Math.abs(frame.x0) < 1e-9 && Math.abs(frame.y0) < 1e-9 && Math.abs(Math.max(...legacy.map((p) => p[0])) - W) < 1e-9 && Math.abs(Math.max(...legacy.map((p) => p[1])) - D) < 1e-9;
  if (legacyFits && at("FL", 0, 0) && at("FR", W, 0) && at("RR", W, D) && at("RL", 0, D)) return { box: frame, outline: legacy };
  const quad = CORNERS.map((k) => c[k]);
  const cross = (o2, a, b) => (a[0] - o2[0]) * (b[1] - o2[1]) - (a[1] - o2[1]) * (b[0] - o2[0]);
  const crosses = (p1, p2, p3, p4) => {
    const d1 = cross(p3, p4, p1), d2 = cross(p3, p4, p2), d3 = cross(p1, p2, p3), d4 = cross(p1, p2, p4);
    return (d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) && (d3 > 0 && d4 < 0 || d3 < 0 && d4 > 0);
  };
  let area = 0;
  for (let i = 0; i < 4; i += 1) {
    const p = quad[i];
    const q = quad[(i + 1) % 4];
    area += p[0] * q[1] - q[0] * p[1];
  }
  if (area <= 0 || crosses(quad[0], quad[1], quad[2], quad[3]) || crosses(quad[1], quad[2], quad[3], quad[0])) {
    throw new LayoutError("layout: T3 outline crosses itself or turns inside out: check the corner formulas");
  }
  const K = (name) => `T3.corner.${name}`;
  const U = (k) => ex({ u: ref(K(`${k}.u`)) }, (t) => t.u, `= ${K(`${k}.u`)}`);
  const V = (k) => ex({ v: ref(K(`${k}.v`)) }, (t) => t.v, `= ${K(`${k}.v`)}`);
  dim("T3.pv.rearY", { v: ref(K("RR.v")) }, (t) => t.v, { formula: `= ${K("RR.v")}` });
  dim("T3.pv.notchY", { rearY: ref("T3.pv.rearY"), T3_NOTCH_DEPTH: RULES.T3_NOTCH_DEPTH_MM }, (t) => t.rearY - t.T3_NOTCH_DEPTH);
  const rearV = ex({ v: ref("T3.pv.rearY") }, (t) => t.v, "rearY");
  const notchV = ex({ v: ref("T3.pv.notchY") }, (t) => t.v, "notchY");
  const o = new Outline("T3.pv", ["x", "y"]);
  o.add(U("FL"), V("FL"));
  o.add(U("FR"), V("FR"));
  const right = c.RR[0];
  const left = c.RL[0];
  if (Math.abs(c.RR[1] - c.RL[1]) > 1e-9) {
    throw new LayoutError("layout: T3 \u7684\u540E\u8FB9\u4E0D\u76F4\uFF0C\u5206\u9694\u677F\u7F3A\u53E3\u6CA1\u6CD5\u7559\u5728\u8FD9\u6761\u8FB9\u4E0A");
  } else {
    const ranges = dividerNotches(geometry, inputs, frame.x0, left, right).sort((p, q) => q[0] - p[0]);
    const nx = (x) => ex({ notchX: x }, (t) => t.notchX, "notch edge (divider centre \xB1 slot / 2)");
    if (ranges.length && ranges[0][1] >= right - 1e-9) {
      const [x0] = ranges.shift();
      o.add(U("RR"), notchV);
      o.add(nx(x0), notchV);
      o.add(nx(x0), rearV);
    } else {
      o.add(U("RR"), V("RR"));
    }
    let closed = false;
    for (const [x0, x1] of ranges) {
      if (x0 <= left + 1e-9) {
        o.add(nx(x1), rearV);
        o.add(nx(x1), notchV);
        o.add(U("RL"), notchV);
        closed = true;
        break;
      }
      o.add(nx(x1), rearV);
      o.add(nx(x1), notchV);
      o.add(nx(x0), notchV);
      o.add(nx(x0), rearV);
    }
    if (!closed) o.add(U("RL"), V("RL"));
  }
  o.add(U("FL"), V("FL"));
  const pts = o.points;
  const us = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1]);
  for (const f of ["x0", "x1", "y0", "y1"]) same(`T3.frame.${f}`, `T3.${f}`);
  const minU = Math.min(...us), maxU = Math.max(...us), minV = Math.min(...vs), maxV = Math.max(...vs);
  const box = {
    x0: dim("T3.x0", { frame: ref("T3.frame.x0"), minU }, (t) => t.frame + t.minU, { formula: "T3.frame.x0 + leftmost corner u" }),
    x1: dim("T3.x1", { frame: ref("T3.frame.x0"), maxU }, (t) => t.frame + t.maxU, { formula: "T3.frame.x0 + rightmost corner u" }),
    y0: dim("T3.y0", { frame: ref("T3.frame.y0"), minV }, (t) => t.frame + t.minV, { formula: "T3.frame.y0 + frontmost corner v" }),
    y1: dim("T3.y1", { frame: ref("T3.frame.y0"), maxV }, (t) => t.frame + t.maxV, { formula: "T3.frame.y0 + rearmost corner v" }),
    z0: frame.z0,
    z1: frame.z1
  };
  return { box, outline: pts };
}
var RULE_BOARDS = /* @__PURE__ */ new Set(["T1", "T2", "T3", "T4"]);
function legacyToBoards(geometry, inputs, rangehood, layout, warnings, situation) {
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
  const hasT3 = geometry.trimmed_vectors.T3.length > 0;
  const hasT4 = geometry.trimmed_vectors.T4.length > 0;
  const scope = ruleScope(inputs);
  for (const feature of geometry.divider_features) alias("DividerSide", `${feature.id}.cut`);
  const placed = placeBoards(
    layout,
    ["T1", "T2", ...hasT3 ? ["T3"] : [], ...hasT4 ? ["T4"] : []],
    scope,
    warnings,
    situation
  );
  let t3Outline = geometry.trimmed_vectors.T3;
  if (hasT3 && layout.boards.T3?.outline) {
    const shaped = shapeT3(layout.boards.T3, placed.T3, geometry, inputs, scope, warnings);
    placed.T3 = shaped.box;
    t3Outline = shaped.outline;
  }
  let t4Outline = geometry.trimmed_vectors.T4;
  if (hasT4) {
    const f = placed.T4;
    const W = f.x1 - f.x0;
    const legacyFits = Math.abs(f.x0) < 1e-9 && Math.abs(W - cabinetWidth) < 1e-9 && Math.abs(f.z1 - f.z0 - RULES.T4_HEIGHT_MM.value) < 1e-9;
    if (!legacyFits) {
      t4Outline = t4TrimmedOutlinePoints(ref("T4.xSize"), dividerNotches(geometry, inputs, f.x0, 0, W), ref("T4.zSize"), RULES.T4_NOTCH_HEIGHT_MM);
    }
  }
  const outlineExtent = (id, pts, axis) => {
    const box = placed[id];
    if (!box) return;
    const extent = Math.max(...pts.map(([, v]) => v));
    const size = box[`${axis}1`] - box[`${axis}0`];
    if (Math.abs(extent - size) > 0.01) warnings.push(`${id}: its ${axis} size ${size} differs from its outline (${extent}).`);
  };
  if (hasT3 && !layout.boards.T3?.outline) outlineExtent("T3", geometry.trimmed_vectors.T3, "y");
  if (hasT4) outlineExtent("T4", t4Outline, "z");
  boards.push({
    id: "T1",
    name: "Top Front Rail T1",
    category: "rail",
    boardType: "T1",
    materialThickness: frontPanelThickness,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    ...placed.T1,
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
    ...placed.T2,
    source: "overhead"
  });
  if (hasT3) {
    boards.push({
      id: "T3",
      name: "Top Rear Panel",
      category: "panel",
      boardType: "T3",
      materialThickness: featureWidth,
      profilePlane: "XY",
      thicknessAxis: "Z",
      ...placed.T3,
      source: "overhead",
      profileVector: t3Outline.map(([x, y]) => ({ x, y }))
    });
  }
  if (hasT4) {
    boards.push({
      id: "T4",
      name: "Top Front Panel",
      category: "panel",
      boardType: "T4",
      materialThickness: featureWidth,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      ...placed.T4,
      source: "overhead",
      profileVector: t4Outline.map(([x, z]) => ({ x, z }))
    });
  }
  for (let dividerIndex = 0; dividerIndex < geometry.divider_features.length; dividerIndex += 1) {
    const feature = geometry.divider_features[dividerIndex];
    const id = feature.id;
    const [x0, x1] = clampRange(boardXRange(feature.XDi, featureWidth), 0, cabinetWidth);
    const xd = `XD${dividerIndex}`;
    dim(`${id}.x0`, { [xd]: ref(xd), CPT }, (t2) => Math.max(0, t2[xd] - t2.CPT / 2), { formula: `max(0, ${xd} - CPT / 2)` });
    dim(`${id}.x1`, { [xd]: ref(xd), CPT, Cw: P.Cw }, (t2) => Math.min(t2.Cw, t2[xd] + t2.CPT / 2), { formula: `min(Cw, ${xd} + CPT / 2)` });
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
    const K = (n2) => `${panel.id}.pv${n2}`;
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
      `${boardId} LED groove skipped: board width ${boardWidth.toFixed(1)} too narrow for ${LED_GROOVE_BRANCH_END_INSET} mm end insets.`
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
function applyLedDepth(ledFeatures, layout, inputs, boards, warnings) {
  const rule = layout.boards.T3?.features?.LED;
  const leds = ledFeatures.filter((f) => f.type === "t3_groove");
  if (!rule || !leds.length) return;
  const depth = recordExpr("T3.feat.LED.depth", rule.depth, ruleScope(inputs), "T3 LED depth");
  const t3 = boards.find((b) => b.boardType === "T3");
  const thick = t3 ? t3.z1 - t3.z0 : Infinity;
  if (!(depth > 0)) throw new LayoutError(`layout: the T3 LED groove depth is ${depth}; it must be above 0`);
  if (depth > thick + 1e-9) throw new LayoutError(`layout: T3 \u706F\u69FD\u6DF1\u5EA6 ${depth} \u6DF1\u8FC7\u677F\u539A ${thick}`);
  if (Math.abs(depth - thick) < 1e-9) warnings.push(`T3: \u706F\u69FD\u6DF1\u5EA6\u7B49\u4E8E\u677F\u539A ${thick}\uFF0C\u8FD9\u4E00\u5200\u5207\u7A7F\u4E86`);
  for (const led of leds) led.depth = depth;
}
function generateT3LedGrooveFeatures(boards, warnings, params) {
  if (params.ledGroove === false) return [];
  const t3s = boards.filter((board) => board.boardType === "T3");
  if (!t3s.length) {
    warnings.push("T3 LED groove skipped: T3 board missing.");
    return [];
  }
  const frontOffset = LED_GROOVE_FRONT_OFFSET;
  const features = [];
  for (const t3 of t3s) {
    const { width, depth } = t3LedBoardExtents(t3);
    const path = buildInsertBoardLedGroovePath(width, depth, t3.id, warnings);
    if (!path) continue;
    t3.notes = [
      ...(t3.notes ?? []).filter((note) => !note.toLowerCase().includes("led groove")),
      `T3 LED groove path on top face (${LED_GROOVE_FRONT_LAND_MM} mm front land)`
    ];
    features.push({
      id: t3.id === "T3" ? "T3_led_groove" : `${t3.id}_led_groove`,
      type: "t3_groove",
      targetBoardId: t3.id,
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
        `Two rear T-branches parallel to Y, extend to T3 back edge, centers inset ${LED_GROOVE_BRANCH_END_INSET} mm from each X end`
      ]
    });
  }
  return features;
}
function resolveCarcassColor(params) {
  const raw = String(params.carcassColor || params.carcassColorName || "white_stipple").trim();
  const tag = raw.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "white_stipple";
  const name = String(params.carcassColorName || (tag === "white_stipple" ? "White Stipple" : raw)).trim() || "White Stipple";
  return { carcassColor: tag, carcassColorName: name };
}
function generateOverheadCabinet(rawParams, options = {}) {
  beginProvenance();
  try {
    return generateOverheadCabinetInner(rawParams, options);
  } finally {
    if (provenanceActive()) endProvenance();
  }
}
function generateOverheadCabinetInner(rawParams, options) {
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
  const situation = {
    style: String(inputs.style || "style_1"),
    ledGroove: rawParams.ledGroove === false ? "off" : "on",
    rangehoodAlignment: String(rawParams.rangehoodAlignment || "left") === "right" ? "right" : "left"
  };
  let layout = LAYOUT;
  if (options.layout != null) {
    try {
      layout = validateLayout(options.layout);
    } catch (err) {
      validation.errors.push(err.message);
    }
  }
  let boards = [];
  let ledFeatures = [];
  let splitInfo = null;
  const endSide = endPanelSide(rawParams.endPanel);
  let cpPlan = { cuts: [], suppressed: [], hoodFeatures: [] };
  if (geometry && validation.errors.length === 0) {
    try {
      boards = legacyToBoards(geometry, inputs, rangehood, layout, validation.warnings, situation);
      splitInfo = applyOverheadSplit(boards, geometry, inputs, rawParams.splitAfter, rangehood, validation.warnings);
      if (endSide) addEndPanel(boards, inputs, endSide);
      cpPlan = planControlPanels(
        boards,
        geometry,
        inputs,
        controlPanelsOf(rawParams.controlPanels, endSide),
        rangehood,
        () => ({
          z0: (inputs.featureWidth ?? DIVIDER_THICKNESS_MM) * 2 + (rangehood?.clearHeight ?? 0),
          cutProfileVector: internalRangehoodDividerProfile(inputs, rangehood?.clearHeight ?? 0).map(([y, z]) => ({ y, z }))
        }),
        validation.warnings
      );
      if (!splitInfo && rawParams.splitAfter == null && inputs.cabinetWidth > RULES.RUN_SHEET_MAX_MM.value) {
        validation.warnings.push(`This run is ${inputs.cabinetWidth} mm long. A board over ${RULES.RUN_SHEET_MAX_MM.value} mm cannot be cut \u2014 split the overhead.`);
      }
      ledFeatures = generateT3LedGrooveFeatures(boards, validation.warnings, rawParams);
      applyLedDepth(ledFeatures, layout, inputs, boards, validation.warnings);
      applyLayoutDraft(boards, layout, ruleScope(inputs), validation.errors, validation.warnings, situation, (id) => RULE_BOARDS.has(id));
    } catch (err) {
      if (!(err instanceof LayoutError)) throw err;
      validation.errors.push(err.message);
    }
  }
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
  const relationshipDeclarations = relationshipDeclarationsForBoards(boards);
  const rangehoodFeatures = [...generateRangehoodFeatures(geometry, rangehood), ...cpPlan.hoodFeatures];
  const suppressed = [...rangehood?.internalDividerIndices ?? [], ...cpPlan.suppressed];
  const dividerFeatures = geometry.divider_features.map((feature, index) => {
    if (!suppressed.includes(index)) return feature;
    return { ...feature, bp_groove: void 0 };
  });
  attachFaces(boards);
  const joints = buildOverheadFaces({
    boards,
    geometry,
    inputs,
    suppressedGrooves: suppressed,
    ledFeatures,
    rangehoodFeatures,
    declarations: relationshipDeclarations,
    carcassColorName: carcassColor.carcassColorName,
    doorColour: doorColourOf(rawParams)
  });
  finishEndPanel(boards, endSide, doorColourOf(rawParams));
  applyControlPanelCuts(boards, cpPlan, validation.warnings);
  const grain = applyGrain(
    boards,
    (b) => b.id === "END_PANEL" ? "side" : b.stock?.kind === "door" ? "front" : null,
    rawParams,
    endSide ? { front: "horizontal", side: "vertical" } : { front: "horizontal" }
  );
  applyDoorSides(boards, { ...rawParams, carcassColorName: carcassColor.carcassColorName });
  const milling = applyMilling(boards);
  return {
    params: resolvedParams(),
    boards,
    grain,
    milling,
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
      placement: Object.fromEntries(
        boards.filter((b) => layout.boards[b.id]).map((b) => [b.id, layout.boards[b.id]])
      ),
      legacyGeometry: geometry,
      split: splitInfo,
      svgPreview: generateOHCSvgPreview(geometry, {
        selectedZoneIndex: Number(rawParams.selectedZoneIndex ?? -1),
        splitX: splitInfo?.x
      }),
      provenance: endProvenance()
    }
  };
}

// generators/uShapeOverhead/layout.json
var layout_default2 = {
  module: "uShapeOverhead",
  version: 1,
  boards: {}
};

// generators/uShapeOverhead/layout.ts
var LAYOUT2 = validateLayout(layout_default2);

// generators/uShapeOverhead/rules.json
var rules_default2 = {
  SIDE_CLEARANCE_MM: { value: 50, doc: "Clear gap kept at a U corner besides the door thickness, so a side arm does not enter the back run's corner." },
  MIN_USABLE_MM: { value: 120, doc: "Each run must keep at least this much width for its zones after the corner is reserved." },
  DEFAULT_RUN_DEPTH_MM: { value: 400, doc: "Carcass depth of each run when a new U overhead is created." }
};

// generators/uShapeOverhead/rules.ts
var RULES2 = defineRules("uShapeOverhead", rules_default2);

// generators/uShapeOverhead/generator.ts
function n(value, fallback) {
  const x = Number(value);
  return Number.isFinite(x) ? x : fallback;
}
function r1(v) {
  return Math.round(v * 10) / 10;
}
function fitZones(zones, usable, run2) {
  const src = zones?.length ? zones : [{ id: `${run2}-1`, type: "up_flap", width: usable }];
  const total = src.reduce((s, z) => s + (Number(z.width) || 0), 0) || 1;
  let used = 0;
  return src.map((z, i) => {
    const width = i === src.length - 1 ? Math.max(0, usable - used) : (Number(z.width) || 0) / total * usable;
    used += width;
    return { id: String(z.id || `${run2}-${i + 1}`), type: String(z.type || "up_flap"), width: r1(width) };
  });
}
function zonesForRun(zones, reservedStart, reservedEnd) {
  const hood = zones.some((z) => z.type === "rangehood_flap");
  if (!hood) {
    return zones.map((z, i) => ({
      ...z,
      width: r1(z.width + (i === 0 ? reservedStart : 0) + (i === zones.length - 1 ? reservedEnd : 0))
    }));
  }
  const out = [];
  if (reservedStart > 0) out.push({ id: `${zones[0]?.id || "run"}-corner-start`, type: "open", width: reservedStart });
  out.push(...zones);
  if (reservedEnd > 0) out.push({ id: `${zones[zones.length - 1]?.id || "run"}-corner-end`, type: "open", width: reservedEnd });
  return out;
}
function transformXY(x, y, t) {
  const rad = t.rotationDeg * Math.PI / 180;
  const cos = Math.round(Math.cos(rad));
  const sin = Math.round(Math.sin(rad));
  return [t.translateX + x * cos - y * sin, t.translateY + x * sin + y * cos];
}
function planeOf2(plane, deg) {
  if (deg === 180 || plane === "XY") return plane;
  if (plane === "XZ") return "YZ";
  if (plane === "YZ") return "XZ";
  return plane;
}
function axisOf(axis, deg) {
  if (deg === 180 || axis === "Z") return axis;
  return axis === "X" ? "Y" : "X";
}
function mapPoint(p, t, spanY) {
  const [x, y] = transformXY(p.x, p.y, t);
  return { x, y: spanY - y, z: p.z };
}
function placeBoard(run2, board, t, spanY) {
  const [U, V, T] = planeAxes(board.profilePlane);
  const plane = planeOf2(board.profilePlane, t.rotationDeg);
  const [U2, V2, T2] = planeAxes(plane);
  const at = (u, v, w) => {
    const p = { x: 0, y: 0, z: 0 };
    p[U] = u;
    p[V] = v;
    p[T] = w;
    return mapPoint(p, t, spanY);
  };
  const U0 = board[`${U}0`];
  const V0 = board[`${V}0`];
  const t0 = board[`${T}0`];
  const t1 = board[`${T}1`];
  const local = localOutline(board) ?? rectOutline(board);
  const outline = local.map(([u, v]) => at(U0 + u, V0 + v, t0));
  const holes = (board.profileHoles ?? []).map((h) => h.map((q) => {
    const mu = board.profileVector ? Math.min(...board.profileVector.map((r) => Number(r[U]))) : U0;
    const mv = board.profileVector ? Math.min(...board.profileVector.map((r) => Number(r[V]))) : V0;
    return at(Number(q[U]) - mu + U0, Number(q[V]) - mv + V0, t0);
  }));
  const corners = [board.x0, board.x1].flatMap((x) => [board.y0, board.y1].flatMap((y) => [board.z0, board.z1].map((z) => mapPoint({ x, y, z }, t, spanY))));
  const box = {};
  for (const a of ["x", "y", "z"]) {
    box[`${a}0`] = Math.min(...corners.map((c) => c[a]));
    box[`${a}1`] = Math.max(...corners.map((c) => c[a]));
  }
  for (const a of [U2, V2]) {
    box[`${a}0`] = Math.min(box[`${a}0`], ...outline.map((c) => c[a]));
    box[`${a}1`] = Math.max(box[`${a}1`], ...outline.map((c) => c[a]));
  }
  const nU0 = box[`${U2}0`];
  const nV0 = box[`${V2}0`];
  const flip = at(U0, V0, t1)[T2] < at(U0, V0, t0)[T2];
  const big = (id) => id === "A" ? flip ? "B" : "A" : id === "B" ? flip ? "A" : "B" : id;
  const toLocal = (u, v) => {
    const q = at(U0 + u, V0 + v, t0);
    return [q[U2] - nU0, q[V2] - nV0];
  };
  const pt = (q) => ({ [U2]: q[U2], [V2]: q[V2] });
  const placed = {
    ...board,
    id: `${run2}.${board.id}`,
    name: `${run2} ${board.name}`,
    profilePlane: plane,
    thicknessAxis: axisOf(board.thicknessAxis, t.rotationDeg),
    x0: box.x0,
    x1: box.x1,
    y0: box.y0,
    y1: box.y1,
    z0: box.z0,
    z1: box.z1,
    profileVector: [...outline, outline[0]].map(pt),
    profileHoles: holes.length ? holes.map((h) => h.map(pt)) : void 0,
    cutProfileVector: void 0,
    profileFeatures: void 0,
    faces: void 0
  };
  const faces = facesOf(placed);
  for (const f of board.faces ?? []) {
    const to = faces.find((g) => g.id === big(f.id));
    if (!to) continue;
    if (f.semantic !== void 0) to.semantic = f.semantic;
    if (f.visible !== void 0) to.visible = f.visible;
    if (f.finish !== void 0) to.finish = f.finish;
    to.features = (f.features ?? []).map((ft) => {
      const out = { ...ft };
      if ([ft.u0, ft.u1, ft.v0, ft.v1].every((n2) => Number.isFinite(n2))) {
        const a = toLocal(ft.u0, ft.v0);
        const b = toLocal(ft.u1, ft.v1);
        out.u0 = Math.min(a[0], b[0]);
        out.u1 = Math.max(a[0], b[0]);
        out.v0 = Math.min(a[1], b[1]);
        out.v1 = Math.max(a[1], b[1]);
      }
      if (Array.isArray(ft.center)) out.center = toLocal(ft.center[0], ft.center[1]);
      if (Array.isArray(ft.loop)) out.loop = ft.loop.map(([u, v]) => toLocal(u, v));
      return out;
    });
  }
  placed.faces = faces;
  if (placed.milling === "A" || placed.milling === "B") placed.milling = big(placed.milling);
  return placed;
}
function clipFront(b, x0, x1) {
  const shift = x0 - b.x0;
  const width = x1 - x0;
  const out = { ...b, x0, x1, profileVector: void 0, faces: void 0 };
  const faces = facesOf(out);
  for (const f of b.faces ?? []) {
    const to = faces.find((g) => g.id === f.id);
    if (!to) continue;
    if (f.semantic !== void 0) to.semantic = f.semantic;
    if (f.visible !== void 0) to.visible = f.visible;
    if (f.finish !== void 0) to.finish = f.finish;
    if (f.id !== "A" && f.id !== "B") {
      to.features = f.features;
      continue;
    }
    to.features = (f.features ?? []).flatMap((ft) => {
      const moved = { ...ft };
      if (Number.isFinite(ft.u0) && Number.isFinite(ft.u1)) {
        moved.u0 = ft.u0 - shift;
        moved.u1 = ft.u1 - shift;
      }
      if (Array.isArray(ft.center)) moved.center = [ft.center[0] - shift, ft.center[1]];
      if (Array.isArray(ft.loop)) moved.loop = ft.loop.map(([u, v]) => [u - shift, v]);
      const lo = Array.isArray(moved.center) ? moved.center[0] - (moved.diameter ?? 0) / 2 : Math.min(moved.u0 ?? 0, moved.u1 ?? 0);
      const hi = Array.isArray(moved.center) ? moved.center[0] + (moved.diameter ?? 0) / 2 : Math.max(moved.u0 ?? 0, moved.u1 ?? 0);
      return lo >= 0 && hi <= width ? [moved] : [];
    });
  }
  out.faces = faces;
  return out;
}
function overlap(a, b) {
  const dx = Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0));
  const dy = Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
  const dz = Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));
  return dx * dy * dz;
}
function generateUShapeOverhead(raw, options = {}) {
  const errors = [];
  const warnings = [];
  const totalWidth = n(raw.totalWidth, 2400);
  const leftArmLength = n(raw.leftArmLength, 1500);
  const rightArmLength = n(raw.rightArmLength, 1500);
  const cabinetDepth = n(raw.cabinetDepth, RULES2.DEFAULT_RUN_DEPTH_MM.value);
  const cabinetHeight = n(raw.cabinetHeight, 400);
  const sideClearance = n(raw.sideClearance, RULES2.SIDE_CLEARANCE_MM.value);
  const featureWidth = n(raw.featureWidth, 15);
  const frontPanelThickness = n(raw.frontPanelThickness, 16);
  const topClearanceHeight = n(raw.topClearanceHeight, 40);
  const clearance = n(raw.clearance, 2.5);
  const minUsable = RULES2.MIN_USABLE_MM.value;
  const reserved = frontPanelThickness + sideClearance;
  const backClearance = sideClearance + frontPanelThickness;
  const leftRun = leftArmLength - cabinetDepth;
  const rightRun = rightArmLength - cabinetDepth;
  const leftUsable = leftRun - reserved;
  const rightUsable = rightRun - reserved;
  const backUsable = totalWidth - 2 * cabinetDepth - 2 * backClearance;
  if (!(totalWidth > 2 * cabinetDepth)) errors.push("totalWidth must exceed 2 \xD7 the run depth.");
  if (!(backUsable >= minUsable)) errors.push(`The back run has ${r1(backUsable)} mm between the corners \u2014 it needs ${minUsable}.`);
  if (!(leftUsable >= minUsable)) errors.push(`The left arm has ${r1(leftUsable)} mm outside the corner \u2014 it needs ${minUsable}.`);
  if (!(rightUsable >= minUsable)) errors.push(`The right arm has ${r1(rightUsable)} mm outside the corner \u2014 it needs ${minUsable}.`);
  if (!(cabinetHeight > topClearanceHeight + 3 * featureWidth)) errors.push("cabinetHeight is too small for the top rails and the bottom panel.");
  let backZones = fitZones(raw.zones?.BACK, Math.max(0, backUsable), "BACK");
  if (backZones.some((z) => z.type === "rangehood_flap")) {
    warnings.push("Rangehood on BACK was converted to up flap \u2014 hoods stay on the left and right arms, outside the corners.");
    backZones = backZones.map((z) => z.type === "rangehood_flap" ? { ...z, type: "up_flap" } : z);
  }
  const leftZones = fitZones(raw.zones?.LEFT, Math.max(0, leftUsable), "LEFT");
  const rightZones = fitZones(raw.zones?.RIGHT, Math.max(0, rightUsable), "RIGHT");
  const common = {
    cabinetDepth,
    cabinetHeight,
    style: "style_1",
    featureWidth,
    frontPanelThickness,
    topClearanceHeight,
    clearance,
    ledGroove: raw.ledGroove === true,
    hingeHoleDiameter: raw.hingeHoleDiameter,
    hingeHoleDepth: raw.hingeHoleDepth,
    hingeHoleFromTop: raw.hingeHoleFromTop,
    hingeHoleFromSide: raw.hingeHoleFromSide,
    carcassColor: raw.carcassColor,
    carcassColorName: raw.carcassColorName,
    doorColor: raw.doorColor,
    doorColorName: raw.doorColorName,
    doorSeries: raw.doorSeries,
    doorSides: raw.doorSides,
    rangehoodPreset: raw.rangehoodPreset || "NCE",
    rangehoodClearHeight: n(raw.rangehoodClearHeight, 75),
    rangehoodAlignment: raw.rangehoodAlignment === "right" ? "right" : "left",
    rangehoodEdgeOffsetX: Math.max(40, n(raw.rangehoodEdgeOffsetX, 40))
  };
  const spanY = Math.max(leftArmLength, rightArmLength);
  const specs = [
    { id: "LEFT", width: leftRun, reservedStart: reserved, reservedEnd: 0, zones: leftZones, transform: { rotationDeg: 90, translateX: cabinetDepth, translateY: cabinetDepth } },
    { id: "BACK", width: totalWidth, reservedStart: cabinetDepth + backClearance, reservedEnd: cabinetDepth + backClearance, zones: backZones, transform: { rotationDeg: 180, translateX: totalWidth, translateY: cabinetDepth } },
    { id: "RIGHT", width: rightRun, reservedStart: 0, reservedEnd: reserved, zones: rightZones, transform: { rotationDeg: -90, translateX: totalWidth - cabinetDepth, translateY: rightArmLength } }
  ];
  const runs = errors.length ? [] : specs.map((spec) => {
    const hood = spec.id !== "BACK" && spec.zones.some((z) => z.type === "rangehood_flap");
    const result = generateOverheadCabinet({
      ...common,
      cabinetWidth: spec.width,
      zones: zonesForRun(spec.zones, spec.reservedStart, spec.reservedEnd),
      rangehoodPreset: hood ? common.rangehoodPreset : void 0
    });
    return { ...spec, result };
  });
  for (const run2 of runs) {
    for (const err of run2.result.validation.errors) errors.push(`${run2.id}: ${err}`);
    for (const warn of run2.result.validation.warnings) warnings.push(`${run2.id}: ${warn}`);
    if (run2.id !== "BACK") {
      const top = run2.result.boards.find((b) => b.id === "RGHD_TOP");
      if (top && top.x0 < run2.reservedStart - 0.5) {
        errors.push(`${run2.id}: the range hood enters the corner (x ${r1(top.x0)} < ${r1(run2.reservedStart)}).`);
      }
    } else if (run2.result.boards.some((b) => b.id.startsWith("RGHD_"))) {
      errors.push("BACK: a range hood is not allowed on the back run.");
    }
  }
  const boards = runs.flatMap((run2) => {
    const usable0 = run2.reservedStart;
    const usable1 = run2.width - run2.reservedEnd;
    const clipped = run2.result.boards.flatMap((b) => {
      const front = b.category === "front_panel" || b.boardType === "up_flap" || b.boardType === "rangehood_flap" || b.boardType === "fixed_panel";
      if (!front) return [b];
      const x0 = Math.max(b.x0, usable0);
      const x1 = Math.min(b.x1, usable1);
      if (x1 - x0 < 1) return [];
      return [x0 === b.x0 && x1 === b.x1 ? b : clipFront(b, x0, x1)];
    });
    return clipped.map((b) => placeBoard(run2.id, b, run2.transform, spanY));
  });
  for (let i = 0; i < boards.length; i += 1) {
    for (let j = i + 1; j < boards.length; j += 1) {
      const a = boards[i];
      const b = boards[j];
      if (a.id.split(".")[0] === b.id.split(".")[0]) continue;
      if (overlap(a, b) > 1) errors.push(`${a.id} overlaps ${b.id}.`);
    }
  }
  applyLayoutDraft(boards, options.layout != null ? options.layout : LAYOUT2, {}, errors, warnings, {
    ledGroove: raw.ledGroove === true ? "on" : "off",
    rangehoodAlignment: raw.rangehoodAlignment === "right" ? "right" : "left"
  });
  return {
    boards: errors.some((e) => e.startsWith("totalWidth") || e.includes("needs")) && !runs.length ? [] : boards,
    validation: { errors, warnings },
    params: {
      totalWidth,
      leftArmLength,
      rightArmLength,
      cabinetDepth,
      cabinetHeight,
      sideClearance,
      featureWidth,
      frontPanelThickness,
      topClearanceHeight,
      clearance,
      ledGroove: raw.ledGroove === true,
      rangehoodClearHeight: common.rangehoodClearHeight,
      rangehoodAlignment: common.rangehoodAlignment,
      rangehoodEdgeOffsetX: common.rangehoodEdgeOffsetX,
      zones: { LEFT: leftZones, BACK: backZones, RIGHT: rightZones },
      usable: { LEFT: r1(leftUsable), BACK: r1(backUsable), RIGHT: r1(rightUsable) }
    }
  };
}
export {
  generateUShapeOverhead
};
