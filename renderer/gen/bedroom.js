// Generated from generators/bedroom/generator.ts - do not edit.

// generators/bedroom/rules.json
var rules_default = {
  BOOT_HEIGHT_DEFAULT_MM: { value: 398, doc: "Tunnel boot height (top of the boot deck above the floor) when the params give none. Bedroom Style 3 measures 398; the east-west bedroom 418." },
  WARDROBE_WIDTH_DEFAULT_MM: { value: 330, doc: "Wardrobe width from the van's side wall to its inner face (the opening edge) when the params give none. Same on both sides: the north-south bedroom is symmetric by rule." },
  OHC_BOTTOM_DEFAULT_MM: { value: 1418, doc: "Door underside of the middle overhead above the floor when the params give none. The bottom panel sits OHC_DOOR_DROP_MM above this. Style 3 measures 1418." },
  BOOT_DECK_THICKNESS_MM: { value: 18, doc: "Tunnel boot deck (the board the wardrobes and the mattress sit on): 18 mm structural stock, wall to wall and the full depth of the body. Style 3 measures 18." },
  BOOT_HEIGHT_MIN_MM: { value: 200, doc: "Lowest tunnel boot deck allowed." },
  WARDROBE_WIDTH_MIN_MM: { value: 150, doc: "Narrowest wardrobe allowed (from the side wall)." },
  OPENING_HEIGHT_MIN_MM: { value: 500, doc: "Least clear height between the boot deck and the overhead underside \u2014 room for the mattress and to sit up." },
  OHC_HEIGHT_MIN_MM: { value: 150, doc: "Least overhead block height under the lowest roof over the body." },
  BED_FRAME_QUEEN_WIDTH_MM: { value: 1508, doc: "Outer width of the queen bed frame / bed box. A product size, not a design number: the opening between the wardrobes must be at least this wide and the bed box is exactly this wide. Style 3 measures 1508 (side panel outer faces)." },
  DOOR_PANEL_THICKNESS_DEFAULT_MM: { value: 16, doc: "Wardrobe colour panel (door stock) thickness when the params give none." },
  WARDROBE_T2_BACK_MM: { value: 66, doc: "Y from the room face to the back of T2 \u2014 the one fixed distance of the wardrobe top. The colour panel runs full height (to the roof) from here toward the nose; in front of it the panel is cut down to the T3 seat. Style 3: 66." },
  WARDROBE_T2_THICKNESS_MM: { value: 15, doc: "T2 (rear top rail) thickness; it stands on T3 with its back at WARDROBE_T2_BACK." },
  WARDROBE_T2_HEIGHT_MM: { value: 35, doc: "T2 height at its back, measured to the roof there. Sets the T3 seat: T3 top = roof(T2 back) \u2212 this \u2212 T3 clearance. The roof slopes, so T2 is taller at its front (Style 3: 35 back, 38 front)." },
  WARDROBE_T1_THICKNESS_MM: { value: 16, doc: "T1 (front top rail) thickness; it stands on T3 directly in front of T2." },
  WARDROBE_T1_OVERSIZE_MM: { value: 20, doc: "T1 is cut this much taller than the roof at its back (a flat top: the three-axis router cannot cut the slope) \u2014 trimmed to the roof on site." },
  WARDROBE_T3_THICKNESS_MM: { value: 15, doc: "T3 (top panel over the wardrobe) thickness." },
  WARDROBE_T3_CLEARANCE_MM: { value: 1, doc: "Clearance between T3 top and the T1 / T2 undersides, and above T3 in the colour panel's pocket." },
  WARDROBE_T3_DEPTH_MM: { value: 188, doc: "T3 depth from the room face toward the nose." },
  WARDROBE_T3_LIP_DEPTH_MM: { value: 16, doc: "Pocket in the colour panel behind the T2 back (Y from WARDROBE_T2_BACK) that T3's tail slides into; its height is T3 + clearance." },
  WARDROBE_T3_TAIL_CLEARANCE_MM: { value: 5, doc: "T3's tail stops this short of the pocket end. Beyond the tail T3 is notched back to the colour panel's wall-side face." },
  WARDROBE_PANEL_MIN_HEIGHT_MM: { value: 300, doc: "Least colour-panel height between the boot deck and the T3 seat." },
  WARDROBE_WALL_STRIP_DEPTH_MM: { value: 175, doc: "Wall strip depth from the room face. Carcass, against the side wall, one each side. The front profile matches the colour panel (seat, pocket, roof); the board stops here instead of running to the nose. Bottom is the boot deck. Style 3 measures 175." },
  WARDROBE_SHELF_ABOVE_FLOOR_MM: { value: 10, doc: "Style 1 wardrobe shelf underside above the wardrobe floor (boot + 197). Bedroom 1: floor 615, shelf 625. Not the fixed-panel split." },
  WARDROBE_SHELF_STRIP_SETBACK_MM: { value: 75, doc: "From the room face, the shelf stays clear of the wall strip. Past this it runs to the wall, through a notch in the strip. Bedroom 1 measures 75." },
  WARDROBE_SHELF_STRIP_GAP_MM: { value: 0.5, doc: "Gap between the shelf and the wall strip's inner face over that front setback." },
  WARDROBE_SHELF_TONGUE_TIP_MM: { value: 0.5, doc: "Shelf tongue into the colour panel stops this short of the panel's mid-thickness (tongue = door thickness / 2 \u2212 this). Bedroom 1: 7.5 into the 16 mm panel." },
  WARDROBE_SHELF_GROOVE_EXTRA_MM: { value: 0.5, doc: "Colour-panel groove is this much deeper than the tongue. Not through the panel." },
  WARDROBE_SHELF_GROOVE_Z_MM: { value: 0.5, doc: "Groove / strip notch is this much taller than the shelf on each side (slot = shelf + 1)." },
  WARDROBE_SHELF_GROOVE_END_MM: { value: 5, doc: "Groove runs this much past the tongue at each end, along the depth. Tongue sits in the middle third of the body depth." },
  WARDROBE_FLOOR_RAISE_MM: { value: 197, doc: "Wardrobe floor top above the boot deck (Style 3 / Bedroom 1: kick + floor = 197). The Style 1 fixed panel sits on this; the nook opening starts here." },
  WARDROBE_BASE_THICKNESS_MM: { value: 18, doc: "Nook wardrobe base: the wall kick (boot deck \u2192 floor underside, full depth) and the floor (wall \u2192 colour panel, full depth) are both this structural stock. Style 3 measures 18 / 18." },
  WARDROBE_NOOK_SHELF_BOTTOM_DEFAULT_MM: { value: 799, doc: "Unused as an input. The nook wardrobe bottom is boot height + WARDROBE_FLOOR_RAISE_MM + WARDROBE_NOOK_CUT_HEIGHT_MM (Style 3: 398 + 197 + 204 = 799). Kept so older jobs still parse." },
  WARDROBE_NOOK_CUT_HEIGHT_MM: { value: 204, doc: "Height of the U cut through each wardrobe colour panel, from the wardrobe floor top up to the wardrobe bottom (the nook shelf underside, where the door starts). Fixed: it does not drag. Style 3: 595 \u2192 799." },
  WARDROBE_NOOK_CUT_UPPER_RADIUS_MM: { value: 100, doc: "Upper arc of the U cut, through the colour panel. Centre is this far below the wardrobe bottom, at WARDROBE_NOOK_CUT_UPPER_CENTER_Y from the room face, so the arc crests on the wardrobe bottom. Style 3 measures 100." },
  WARDROBE_NOOK_CUT_UPPER_CENTER_Y_MM: { value: 502.775, doc: "Y of the upper arc's centre, from the room face toward the nose. The crest of the cut is at this same Y. Style 3 measures 502.775." },
  WARDROBE_NOOK_CUT_LOWER_RADIUS_MM: { value: 703.374, doc: "Lower arc of the U cut. Tangent to the upper arc. Centre is in front of the room face. Style 3 measures 703.374." },
  WARDROBE_NOOK_CUT_LOWER_CENTER_Y_MM: { value: -92.024, doc: "Y of the lower arc's centre. Negative: 92.024 mm in front of the room face, in the room. Style 3." },
  WARDROBE_NOOK_CUT_LOWER_CENTER_Z_MM: { value: 2.565, doc: "Lower arc centre above the cut's bottom (the wardrobe floor top). Style 3 measures 2.565, so the arc meets the floor almost vertically, 611 mm back." },
  WARDROBE_NOOK_SHELF_NOSE_GAP_MM: { value: 22, doc: "Nook shelf stops this short of the body depth (the nose), or where the roof meets the shelf top, whichever comes first. Style 3: 734 deep in a 756 body." },
  WARDROBE_NOOK_MIN_HEIGHT_MM: { value: 100, doc: "Least nook opening height (wardrobe floor top \u2192 shelf underside)." },
  LED_GROOVE_WIDTH_MM: { value: 14.5, doc: "LED strip channel width: the T3 main channel and the nook shelf channel. Same insert as the wall overhead / General Tall." },
  LED_GROOVE_DEPTH_MM: { value: 6.5, doc: "LED strip channel depth (15 mm board keeps 8.5)." },
  LED_T3_T1_GAP_MM: { value: 0.5, doc: "T3 top: the main LED channel's back wall stops this short of T1's front face, so the channel sits on the strip of T3 in front of T1. Style 3: T1 front 35 \u2192 channel 20 \u2192 34.5." },
  LED_T3_BRANCH_WIDTH_MM: { value: 20, doc: "T3 top: the feed branches from the main channel to the rear edge are this wide (wider than the channel: a cable slot). Style 3 measures 20." },
  LED_T3_BRANCH_END_INSET_MM: { value: 80, doc: "T3 top: one feed branch near each end of every T3, its centre this far from that end. Style 3 varies 59 \u2013 99; the position is not critical." },
  LED_NOOK_SHELF_FROM_ROOM_FACE_MM: { value: 54, doc: "Nook shelf underside: the LED channel starts this far from the room face and runs to the shelf's rear edge, centred across the shelf. Style 3 measures 54." },
  WARDROBE_DOOR_CLEARANCE_MM: { value: 4, doc: "Reveal around the wardrobe door: wall-side gap, and the vertical gap between the Style 1 fixed panel and the door. Opening side is flush with the colour panel." },
  WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM: { value: 775, doc: "Style 1: top of the fixed panel (the dragged split) when the params give none. Bedroom 1 measures 775; the door starts this + clearance above it." },
  WARDROBE_FIXED_PANEL_MIN_MM: { value: 80, doc: "Least Style 1 fixed-panel height (floor top \u2192 split)." },
  WARDROBE_DOOR_MIN_MM: { value: 300, doc: "Least Style 1 door height (split + clearance \u2192 T3 top). Leaves room for three hinge cups 100 from each end." },
  WARDROBE_HINGE_DIAMETER_MM: { value: 35, doc: "Wardrobe door hinge cup diameter. Bedroom 1 / Style 3 measure 35." },
  WARDROBE_HINGE_DEPTH_MM: { value: 12, doc: "Wardrobe door hinge cup depth, from the inside face." },
  WARDROBE_HINGE_FROM_END_MM: { value: 100, doc: "Cup centre from the door top and from the door bottom; the third cup is midway." },
  WARDROBE_HINGE_FROM_SIDE_MM: { value: 22.5, doc: "Cup centre from the door's hinge (wall-side) edge. Bedroom 1 measures 22.5 \u2014 a standard 35 mm full-overlay cup. The mounting plate on the wall strip comes later." },
  OHC_DOOR_DROP_MM: { value: 30, doc: "Middle overhead: the up-flap underside (ohcBottom) is this far below the bottom panel. Same drop as the wall overhead." },
  OHC_BP_OVERSIZE_MM: { value: 18, doc: "Bottom panel is cut this much deeper than the uprights, past where the roof meets the panel's top face. The slope cannot be cut on a three-axis router \u2014 trim to the roof on the sliding table saw. Same idea as T1's oversize." },
  OHC_FEATURE_CLEARANCE_MM: { value: 1, doc: "Extra width of a bottom-panel groove over the upright thickness (slot = panel + this). The T3 notch is wider: OHC_T3_NOTCH_SIDE_CLEARANCE_MM each side." },
  OHC_T3_NOTCH_SIDE_CLEARANCE_MM: { value: 5, doc: "T3 notch stands this far clear of each face of an upright, so the cutter can enter on both sides. A 15 mm divider is a 25 mm notch, centred on the divider." },
  OHC_T3_NOTCH_DEPTH_MM: { value: 20, doc: "Unused. The notch used to be 20 mm off the rear edge. It now runs from the rear edge forward to the T3 tail (the lip minus WARDROBE_T3_TAIL_CLEARANCE_MM), which is where the upright rises above the seat." },
  OHC_FRONT_CLEARANCE_MM: { value: 2.5, doc: "Gap between neighbouring overhead doors, and at the outer edges of the run. Matches the wall overhead." },
  OHC_HINGE_FROM_TOP_MM: { value: 22.5, doc: "Up-flap cup centre down from the door top. Two cups, both at this height." },
  OHC_HINGE_FROM_SIDE_2_MM: { value: 150, doc: "Two bays: cup centre from the outer face of each side panel, and from the centre divider's centreline." },
  OHC_HINGE_FROM_SIDE_3_MM: { value: 100, doc: "Three bays: cup centre from each side edge of the door. The wall overhead's rule." },
  OHC_ZONE_MIN_MM: { value: 150, doc: "Narrowest overhead bay (centreline to centreline, including the end panels)." },
  OHC_ZONE_COUNT_DEFAULT: { value: 2, doc: "Overhead bays when the params give none. Two or three, up flaps only; two is the Style 3 split." }
};

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
function ex(terms, fn, formula) {
  return { terms, fn, formula };
}
function lit(v) {
  return { terms: {}, fn: () => v, formula: String(v) };
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

// generators/bedroom/rules.ts
var RULES = defineRules("bedroom", rules_default);

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
function joint(id, kind, a, b, extra = {}) {
  return { id, kind, a, b, ...extra };
}
function faceRef(board2, faces) {
  return { board: board2, faces: faces.map((f) => typeof f === "string" ? f : f.id) };
}

// generators/bedroom/led.ts
var EPS = 1e-6;
function round1(v) {
  return Math.round(v * 10) / 10;
}
function addT3LedChannels(t3, opts, warnings) {
  const id = t3.id;
  const K = `${id}.feat.LED_MAIN`;
  const width = dim(`${K}.u1`, { x1: ref(`${id}.x1`), x0: ref(`${id}.x0`) }, (t) => t.x1 - t.x0);
  dim(`${K}.u0`, {}, () => 0, { formula: "0" });
  const v1 = dim(`${K}.v1`, { t1: ref(opts.t1FrontKey), y0: ref(`${id}.y0`), GAP: RULES.LED_T3_T1_GAP_MM }, (t) => t.t1 - t.y0 - t.GAP);
  const v0 = dim(`${K}.v0`, { v1: ref(`${K}.v1`), W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.v1 - t.W);
  if (v0 < -EPS) {
    warnings.push(`${id} LED channel skipped: T1 stands only ${round1(v1 + RULES.LED_GROOVE_WIDTH_MM.value)} mm behind the T3 front \u2014 no room for a ${RULES.LED_GROOVE_WIDTH_MM.value} mm channel`);
    return;
  }
  addFeature(t3, "A", {
    id: `${id}_LED_MAIN`,
    kind: "tgroove",
    u0: 0,
    u1: round1(width),
    v0: round1(v0),
    v1: round1(v1),
    depth: RULES.LED_GROOVE_DEPTH_MM.value,
    through: false,
    for: "led",
    key: K,
    source: opts.source
  });
  t3.notes = [...t3.notes ?? [], `LED channel on the top: ${RULES.LED_GROOVE_WIDTH_MM.value} \xD7 ${RULES.LED_GROOVE_DEPTH_MM.value} along the front, ${RULES.LED_T3_T1_GAP_MM.value} mm in front of T1; ${RULES.LED_T3_BRANCH_WIDTH_MM.value} wide feed branches to the rear near each end`];
  const BW = RULES.LED_T3_BRANCH_WIDTH_MM;
  const INSET = RULES.LED_T3_BRANCH_END_INSET_MM;
  if (width <= 2 * INSET.value + BW.value) {
    warnings.push(`${id} LED feed branches skipped: the board is only ${round1(width)} mm wide`);
    return;
  }
  const ends = [
    ["LED_BRANCH_1", (t) => t.INSET, { INSET }],
    ["LED_BRANCH_2", (t) => t.width - t.INSET, { width: ref(`${K}.u1`), INSET }]
  ];
  for (const [name, centre, terms] of ends) {
    const KB = `${id}.feat.${name}`;
    const c = dim(`${KB}.c`, terms, centre);
    const u0 = dim(`${KB}.u0`, { c: ref(`${KB}.c`), BW }, (t) => t.c - t.BW / 2);
    const u1 = dim(`${KB}.u1`, { c: ref(`${KB}.c`), BW }, (t) => t.c + t.BW / 2);
    const rear = opts.rearAt(t3.x0 + u0, t3.x0 + u1);
    if (rear == null) {
      warnings.push(`${id} ${name} skipped: no straight rear edge at x ${round1(t3.x0 + u0)} \u2013 ${round1(t3.x0 + u1)}`);
      continue;
    }
    const bv0 = dim(`${KB}.v0`, { main: ref(`${K}.v1`) }, (t) => t.main);
    const bv1 = dim(`${KB}.v1`, { rear, y0: ref(`${id}.y0`) }, (t) => t.rear - t.y0, { formula: "rear - y0" });
    if (bv1 - bv0 < EPS) {
      warnings.push(`${id} ${name} skipped: nothing behind the main channel`);
      continue;
    }
    void c;
    addFeature(t3, "A", {
      id: `${id}_${name}`,
      kind: "tgroove",
      u0: round1(u0),
      u1: round1(u1),
      v0: round1(bv0),
      v1: round1(bv1),
      depth: RULES.LED_GROOVE_DEPTH_MM.value,
      through: false,
      for: "led",
      key: KB,
      source: opts.source
    });
  }
}
function addNookShelfLed(shelf, source, warnings) {
  const id = shelf.id;
  const K = `${id}.feat.LED`;
  const width = dim(`${K}.width`, { x1: ref(`${id}.x1`), x0: ref(`${id}.x0`) }, (t) => t.x1 - t.x0);
  const depth = dim(`${K}.depth`, { y1: ref(`${id}.y1`), y0: ref(`${id}.y0`) }, (t) => t.y1 - t.y0);
  const v0 = dim(`${K}.v0`, { FROM: RULES.LED_NOOK_SHELF_FROM_ROOM_FACE_MM }, (t) => t.FROM);
  const v1 = dim(`${K}.v1`, { depth: ref(`${K}.depth`) }, (t) => t.depth);
  if (width < RULES.LED_GROOVE_WIDTH_MM.value + 20 || v1 - v0 < 20) {
    warnings.push(`${id} LED channel skipped: the shelf is too small for it`);
    return;
  }
  const u0 = dim(`${K}.u0`, { width: ref(`${K}.width`), W: RULES.LED_GROOVE_WIDTH_MM }, (t) => (t.width - t.W) / 2);
  const u1 = dim(`${K}.u1`, { u0: ref(`${K}.u0`), W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.u0 + t.W);
  addFeature(shelf, "B", {
    id: `${id}_LED`,
    kind: "groove",
    u0: round1(u0),
    u1: round1(u1),
    v0: round1(v0),
    v1: round1(v1),
    depth: RULES.LED_GROOVE_DEPTH_MM.value,
    through: false,
    for: "led",
    key: K,
    source
  });
  shelf.notes = [...shelf.notes ?? [], `LED channel on the underside: ${RULES.LED_GROOVE_WIDTH_MM.value} \xD7 ${RULES.LED_GROOVE_DEPTH_MM.value}, centred, from ${RULES.LED_NOOK_SHELF_FROM_ROOM_FACE_MM.value} behind the room face to the rear edge`];
}

// generators/bedroom/ohc.ts
var EPS2 = 1e-6;
function round12(v) {
  return Math.round(v * 10) / 10;
}
function normalizeOhcZones(raw, opening) {
  const count = raw && (raw.length === 2 || raw.length === 3) ? raw.length : RULES.OHC_ZONE_COUNT_DEFAULT.value;
  const given = raw && raw.length === count ? raw : [];
  const sum = given.reduce((s, z) => s + (Number.isFinite(z.width) ? z.width : 0), 0);
  const total = round12(Math.max(0, opening));
  if (sum <= EPS2) {
    const each = round12(total / count);
    return Array.from({ length: count }, (_, i) => ({
      id: `ohc-${i + 1}`,
      width: i === count - 1 ? round12(total - each * (count - 1)) : each
    }));
  }
  const scale = total / sum;
  const out = given.map((z, i) => ({ id: z.id || `ohc-${i + 1}`, width: round12(z.width * scale) }));
  const partial2 = out.slice(0, -1).reduce((s, z) => s + z.width, 0);
  out[out.length - 1].width = round12(total - partial2);
  return out;
}
function setOhcBoundary(raw, index, x) {
  const W = round12(Number(raw.width) || 0);
  const ww = round12(Number(raw.wardrobeWidth) || 0);
  const x0 = ww;
  const opening = round12(W - 2 * ww);
  const zones = normalizeOhcZones(raw.ohcZones, opening).map((z) => ({ ...z }));
  const left = zones[index];
  const right = zones[index + 1];
  if (!left || !right) return null;
  const start = round12(x0 + zones.slice(0, index).reduce((s, z) => s + z.width, 0));
  const total = round12(left.width + right.width);
  const minW = RULES.OHC_ZONE_MIN_MM.value;
  const at = round12(Math.max(start + minW, Math.min(start + total - minW, Number(x))));
  left.width = round12(at - start);
  right.width = round12(total - left.width);
  return zones;
}
function equalOhcZones(opening, count) {
  return normalizeOhcZones(Array.from({ length: count }, (_, i) => ({ id: `ohc-${i + 1}`, width: 1 })), opening);
}
function yWhereRoofMeets(roofAt2, depth, z) {
  if (roofAt2(0) <= z + EPS2) return 0;
  if (roofAt2(depth) >= z - EPS2) return round12(depth);
  const steps = 40;
  let lo = 0;
  let hi = depth;
  for (let i = 0; i <= steps; i += 1) {
    const y = depth * i / steps;
    if (roofAt2(y) <= z) {
      hi = y;
      break;
    }
    lo = y;
  }
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (roofAt2(mid) > z) lo = mid;
    else hi = mid;
  }
  return round12(hi);
}
function buildBedroomOhc(host) {
  const cpt = host.panelThickness;
  const dpt = host.doorPanelThickness;
  const x0 = host.wardrobeWidth;
  const x1 = round12(host.width - host.wardrobeWidth);
  const opening = round12(x1 - x0);
  const zones = normalizeOhcZones(host.ohcZones, opening);
  const bpZ0 = round12(host.ohcBottom + RULES.OHC_DOOR_DROP_MM.value);
  const bpZ1 = round12(bpZ0 + cpt);
  const uprightBack = yWhereRoofMeets(host.roofAt, host.depth, bpZ1);
  const bpBack = round12(Math.min(host.depth, uprightBack + RULES.OHC_BP_OVERSIZE_MM.value));
  const seat = host.seat;
  const t3Top = host.t3Top;
  const t3Depth = RULES.WARDROBE_T3_DEPTH_MM.value;
  const sideClear = RULES.OHC_T3_NOTCH_SIDE_CLEARANCE_MM.value;
  const notchSlot = round12(cpt + 2 * sideClear);
  const grooveSlot = round12(cpt + RULES.OHC_FEATURE_CLEARANCE_MM.value);
  const notchY = round12(RULES.WARDROBE_T2_BACK_MM.value + RULES.WARDROBE_T3_LIP_DEPTH_MM.value - RULES.WARDROBE_T3_TAIL_CLEARANCE_MM.value);
  const tongueH = round12(cpt / 2 - 0.5);
  const grooveDepth = round12(cpt / 2);
  const clearance = RULES.OHC_FRONT_CLEARANCE_MM.value;
  const placed = zones.map((z, i) => {
    const zx0 = round12(x0 + zones.slice(0, i).reduce((s, q) => s + q.width, 0));
    return { ...z, x0: zx0, x1: round12(zx0 + z.width) };
  });
  const centers = [
    round12(x0 + cpt / 2),
    ...placed.slice(0, -1).map((z) => z.x1),
    round12(x1 - cpt / 2)
  ];
  const warnings = [];
  if (bpBack > uprightBack + 0.05) {
    warnings.push(`the overhead bottom panel is cut ${RULES.OHC_BP_OVERSIZE_MM.value} mm past the roof \u2014 trim it to the slope on the sliding table saw`);
  }
  const P = param({
    x0,
    x1,
    bpZ0,
    bpZ1,
    uprightBack,
    bpBack,
    seat,
    t3Top,
    cpt,
    dpt,
    opening
  });
  const bp = board("OHC_BP", "Overhead bottom panel", "bottom_panel", "XY", "Z", cpt, {
    x0: dim("OHC_BP.x0", { x0: P.x0 }, (t) => t.x0),
    x1: dim("OHC_BP.x1", { x1: P.x1 }, (t) => t.x1),
    y0: dim("OHC_BP.y0", {}, () => 0, { formula: "0" }),
    y1: dim("OHC_BP.y1", { bpBack: P.bpBack }, (t) => t.bpBack),
    z0: dim("OHC_BP.z0", { bpZ0: P.bpZ0 }, (t) => t.bpZ0),
    z1: dim("OHC_BP.z1", { bpZ1: P.bpZ1 }, (t) => t.bpZ1)
  });
  bp.notes = [`straight back, ${RULES.OHC_BP_OVERSIZE_MM.value} mm past the uprights \u2014 trim to the roof on site`];
  const t3 = board("OHC_T3", "Overhead T3", "top_panel", "XY", "Z", RULES.WARDROBE_T3_THICKNESS_MM.value, {
    x0: same("OHC_T3.x0", "OHC_BP.x0"),
    x1: same("OHC_T3.x1", "OHC_BP.x1"),
    y0: dim("OHC_T3.y0", {}, () => 0, { formula: "0" }),
    y1: dim("OHC_T3.y1", { T3D: RULES.WARDROBE_T3_DEPTH_MM }, (t) => t.T3D),
    z0: dim("OHC_T3.z0", { seat: P.seat }, (t) => t.seat),
    z1: dim("OHC_T3.z1", { t3Top: P.t3Top }, (t) => t.t3Top)
  });
  const localNotches = centers.map((c) => {
    const u = c - x0;
    return [round12(Math.max(0, u - notchSlot / 2)), round12(Math.min(opening, u + notchSlot / 2))];
  });
  t3.profileVector = t3Outline(opening, localNotches, t3Depth, notchY).map(([x, y]) => ({ x: round12(x + x0), y: round12(y) }));
  const tongueY0 = round12(uprightBack / 3 + 5);
  const tongueY1 = round12(2 * uprightBack / 3 - 5);
  const grooveY0 = round12(uprightBack / 3);
  const grooveY1 = round12(2 * uprightBack / 3);
  const dividers = centers.map((center, i) => {
    const id = `OHC_D${i}`;
    const name = i === 0 ? "Overhead side \xB7 left" : i === centers.length - 1 ? "Overhead side \xB7 right" : `Overhead divider ${i}`;
    const b = board(id, name, "divider", "YZ", "X", cpt, {
      x0: dim(`${id}.x0`, { c: center, cpt }, (t) => round12(t.c - t.cpt / 2)),
      x1: dim(`${id}.x1`, { c: center, cpt }, (t) => round12(t.c + t.cpt / 2)),
      y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
      y1: dim(`${id}.y1`, { uprightBack: P.uprightBack }, (t) => t.uprightBack),
      z0: dim(`${id}.z0`, { bpZ1: P.bpZ1, tongueH }, (t) => round12(t.bpZ1 - t.tongueH)),
      z1: dim(`${id}.z1`, { roof: round12(host.roofAt(RULES.WARDROBE_T2_BACK_MM.value)) }, (t) => t.roof, { formula: "roof(T2 back)" })
    });
    b.profileVector = dividerOutline(host, uprightBack, bpZ1, tongueH, tongueY0, tongueY1, seat, t3Top);
    return b;
  });
  const doors = placed.map((zone, i) => {
    const id = `OHC_FP${i}`;
    const leftEdge = i === 0;
    const rightEdge = i === placed.length - 1;
    const dx0 = leftEdge ? round12(zone.x0 + clearance) : round12(zone.x0 + clearance / 2);
    const dx1 = rightEdge ? round12(zone.x1 - clearance) : round12(zone.x1 - clearance / 2);
    return board(id, `Overhead door ${i + 1}`, "front_panel", "XZ", "Y", dpt, {
      x0: dim(`${id}.x0`, { dx0 }, (t) => t.dx0),
      x1: dim(`${id}.x1`, { dx1 }, (t) => t.dx1),
      y0: dim(`${id}.y0`, { dpt }, (t) => -t.dpt),
      y1: dim(`${id}.y1`, {}, () => 0, { formula: "0" }),
      z0: dim(`${id}.z0`, { bottom: host.ohcBottom }, (t) => t.bottom),
      z1: same(`${id}.z1`, "OHC_T3.z1")
    });
  });
  const boards = [bp, t3, ...dividers, ...doors];
  for (const b of boards) {
    b.role = b.category;
    b.zoneId = "ohc";
    b.source = "bedroom.ohc";
  }
  attachFaces(boards);
  bp.stock = { kind: "carcass", thickness: cpt, colour: host.carcassColor };
  t3.stock = { kind: "carcass", thickness: t3.materialThickness, colour: host.carcassColor };
  for (const d of dividers) d.stock = { kind: "carcass", thickness: cpt, colour: host.carcassColor };
  for (const d of doors) d.stock = { kind: "door", thickness: dpt, colour: host.doorColor };
  annotate(bp, "A", { semantic: "top", visible: false });
  annotate(bp, "B", { semantic: "bottom", visible: true, finish: { colour: host.carcassColor } });
  annotate(t3, "A", { semantic: "top", visible: false });
  annotate(t3, "B", { semantic: "bottom", visible: false });
  for (const d of doors) {
    annotate(d, "A", { semantic: "inside", visible: false });
    annotate(d, "B", { semantic: "front", visible: true, finish: { colour: host.doorColor } });
  }
  centers.forEach((center, i) => {
    const id = `OHC_D${i}`;
    const gx0 = round12(Math.max(x0, center - grooveSlot / 2));
    const gx1 = round12(Math.min(x1, center + grooveSlot / 2));
    const r = localRect(bp, { x: [gx0, gx1], y: [grooveY0, grooveY1] });
    addFeature(bp, "A", {
      id: `BG_${id}`,
      kind: "groove",
      ...r,
      depth: grooveDepth,
      for: id,
      key: `OHC_BP.feat.BG_${id}`,
      source: "bedroom.ohc"
    });
    const div = dividers[i];
    tagEdges(div, "tongue", {
      u0: tongueY0 - EPS2,
      u1: tongueY1 + EPS2,
      v0: -EPS2,
      v1: tongueH + EPS2
    }, { id: `${id}_TONGUE`, for: "OHC_BP", source: "bedroom.ohc" });
  });
  const fromTop = RULES.OHC_HINGE_FROM_TOP_MM.value;
  doors.forEach((door, i) => {
    const h = door.z1 - door.z0;
    const v = round12(h - fromTop);
    const xs = cupXs(door, i, placed.length, x0, x1, placed[i]);
    const faceA = door.faces.find((f) => f.id === "A");
    xs.forEach((cabX, n) => {
      faceA.features.push({
        id: `${door.id}_HINGE_${n}`,
        kind: "hole",
        center: [round12(cabX - door.x0), v],
        diameter: RULES.WARDROBE_HINGE_DIAMETER_MM.value,
        depth: RULES.WARDROBE_HINGE_DEPTH_MM.value,
        through: false,
        for: "hinge",
        key: `${door.id}.feat.HINGE_${n}`,
        source: "bedroom.ohc"
      });
    });
  });
  if (host.led) {
    addT3LedChannels(t3, {
      t1FrontKey: host.led.t1FrontKey,
      rearAt: (bx0, bx1) => {
        const hit = localNotches.some(([n0, n1]) => bx1 > x0 + n0 - EPS2 && bx0 < x0 + n1 + EPS2);
        return hit ? notchY : t3Depth;
      },
      source: "bedroom.ohc"
    }, warnings);
  }
  const joints = [];
  for (const div of dividers) {
    const tongues = div.faces.filter((f) => f.features.some((ft) => ft.kind === "tongue"));
    if (!tongues.length) continue;
    joints.push(joint(`${div.id}_BP`, "tongue_groove", faceRef(bp.id, ["A"]), faceRef(div.id, tongues), { hardware: [], rule: "bedroom_ohc_tongue_v1" }));
  }
  return {
    boards,
    joints,
    warnings,
    info: {
      zones: placed,
      centers,
      bpZ0,
      bpZ1,
      uprightBack,
      bpBack,
      oversize: RULES.OHC_BP_OVERSIZE_MM.value
    }
  };
}
function cupXs(door, index, count, x0, x1, zone) {
  if (count === 2) {
    const from2 = RULES.OHC_HINGE_FROM_SIDE_2_MM.value;
    return index === 0 ? [round12(x0 + from2), round12(zone.x1 - from2)] : [round12(zone.x0 + from2), round12(x1 - from2)];
  }
  const from = RULES.OHC_HINGE_FROM_SIDE_3_MM.value;
  return [round12(door.x0 + from), round12(door.x1 - from)];
}
function t3Outline(width, notches, depth, notchY) {
  const rear = depth;
  const ranges = [...notches].sort((a, b) => b[0] - a[0]);
  const o = new Outline("OHC_T3.pv", ["x", "y"]);
  o.add(lit(0), lit(0));
  o.add(lit(width), lit(0));
  let guard = 0;
  const pushRear = (x) => o.add(lit(x), lit(rear));
  const pushNotch = (x) => o.add(lit(x), lit(notchY));
  if (ranges.length && ranges[0][1] >= width - EPS2) {
    const [nx0] = ranges.shift();
    pushNotch(width);
    pushNotch(nx0);
    pushRear(nx0);
  } else {
    pushRear(width);
  }
  while (ranges.length && guard < 8) {
    guard += 1;
    const [nx0, nx1] = ranges.shift();
    pushRear(nx1);
    pushNotch(nx1);
    pushNotch(nx0);
    if (nx0 <= EPS2) {
      o.add(lit(0), lit(notchY));
      o.add(lit(0), lit(0));
      return o.points;
    }
    pushRear(nx0);
  }
  o.add(lit(0), lit(rear));
  o.add(lit(0), lit(0));
  return o.points;
}
function dividerOutline(host, uprightBack, bpTop, tongueH, tongueY0, tongueY1, seat, t3Top) {
  const t2Back = RULES.WARDROBE_T2_BACK_MM.value;
  const lip = round12(t2Back + RULES.WARDROBE_T3_LIP_DEPTH_MM.value);
  const rail = round12(t3Top + RULES.WARDROBE_T3_CLEARANCE_MM.value);
  const pts = [
    { y: 0, z: bpTop },
    { y: tongueY0, z: bpTop },
    { y: tongueY0, z: round12(bpTop - tongueH) },
    { y: tongueY1, z: round12(bpTop - tongueH) },
    { y: tongueY1, z: bpTop },
    { y: uprightBack, z: bpTop }
  ];
  const roof = (y) => round12(host.roofAt(y));
  pts.push({ y: uprightBack, z: roof(uprightBack) });
  const breaks = (host.roofProfile || []).map((q) => q[0]).filter((y) => y > t2Back + EPS2 && y < uprightBack - EPS2).sort((a, b) => b - a);
  for (const y of breaks) pts.push({ y: round12(y), z: roof(y) });
  if (uprightBack > t2Back + EPS2) {
    pts.push({ y: t2Back, z: roof(t2Back) });
    pts.push({ y: t2Back, z: rail });
  }
  if (uprightBack > lip + EPS2) pts.push({ y: lip, z: rail });
  pts.push({ y: Math.min(lip, uprightBack), z: seat });
  pts.push({ y: 0, z: seat });
  pts.push({ y: 0, z: bpTop });
  return pts;
}
function board(id, name, category, profilePlane, thicknessAxis, materialThickness, f) {
  return {
    id,
    name,
    category,
    boardType: "panel",
    materialThickness: round12(materialThickness),
    profilePlane,
    thicknessAxis,
    x0: round12(f.x0),
    x1: round12(f.x1),
    y0: round12(f.y0),
    y1: round12(f.y1),
    z0: round12(f.z0),
    z1: round12(f.z1),
    source: "bedroom.ohc"
  };
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
var round13 = (v) => Math.round(v * 10) / 10;
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
    const len = (a) => round13(b[`${a}1`] - b[`${a}0`]);
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

// generators/_lib/finish.ts
var DEFAULT_CARCASS_COLOUR = "White Stipple";
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

// generators/_lib/milling.ts
var WORK = /* @__PURE__ */ new Set(["groove", "tgroove", "hole", "cutout"]);
var CARCASS = /stipple/i;
var EPS3 = 0.01;
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
  if (material(bottom) < material(top) - EPS3) return "B";
  if (material(top) < material(bottom) - EPS3) return "A";
  return null;
}
function colourFaceOf(b, A, B) {
  if (b.stock?.kind !== "door" || b.stock.sides === 2) return null;
  return [A, B].find((f) => f.visible === true && f.finish?.colour && !CARCASS.test(f.finish.colour)) ?? null;
}
function defaultFace(A, B, colour) {
  if (colour) return colour.id === "A" ? "B" : "A";
  const inward = (f) => f.semantic === "inside" || f.semantic === "back" || f.semantic === "wall";
  if (inward(B) && !inward(A)) return "B";
  if (inward(A) && !inward(B)) return "A";
  if (A.visible === true && B.visible !== true) return "B";
  if (B.visible === true && A.visible !== true) return "A";
  if (B.features.some(through) && !A.features.some(through)) return "B";
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
      face = defaultFace(A, B, colour);
      issues.push({ board: b.id, reason: "both-faces", message: `${b.id} has partial-depth machining on both faces: the CNC cuts from one side only` });
    } else if (onA || onB) {
      face = onA ? "A" : "B";
      if (colour && colour.id === face) {
        issues.push({ board: b.id, reason: "colour-face", message: `${b.id} is single-sided and has partial-depth machining on its colour face (${face})` });
      }
    } else {
      face = defaultFace(A, B, colour);
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

// generators/_lib/preview.ts
var PV = {
  bg: "#1d2025",
  carcass: "#c9b799",
  carcassLine: "#4a4034",
  front: "#9ec5d8",
  frontLine: "#3f5a6a",
  boundary: "#e0a34f",
  select: "#0e3f8f",
  text: "#d8dde4",
  text2: "#9aa2ad",
  text3: "#6b737e",
  envelope: "#6b737e",
  hinge: "#243044",
  lock: "#5a3d22",
  warn: "#e5484d",
  font: "'Segoe UI', system-ui, sans-serif"
};
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}
var px = (v) => v.toFixed(2);
function label(x, y, text, opts = {}) {
  const { size = 11, fill = PV.text, anchor = "middle", weight } = opts;
  return `<text x="${px(x)}" y="${px(y)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${size}"${weight ? ` font-weight="${weight}"` : ""} fill="${fill}" stroke="${PV.bg}" stroke-opacity="0.85" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(text)}</text>`;
}
function boardGaps(boards) {
  const out = [];
  const structural = boards.filter((b) => b.category !== "front_panel" && b.stock?.kind !== "door");
  for (const axis of ["x", "z"]) {
    const thick = axis === "x" ? "X" : "Z";
    const list = structural.filter((b) => b.thicknessAxis === thick);
    const lo = (b) => axis === "x" ? b.x0 : b.z0;
    const hi = (b) => axis === "x" ? b.x1 : b.z1;
    const c0 = (b) => axis === "x" ? b.z0 : b.x0;
    const c1 = (b) => axis === "x" ? b.z1 : b.x1;
    const mid = (b) => (lo(b) + hi(b)) / 2;
    const sorted = [...list].sort((a, b) => mid(a) - mid(b));
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        const crossLo = Math.max(c0(a), c0(b));
        const crossHi = Math.min(c1(a), c1(b));
        if (crossHi - crossLo < 30) continue;
        const clear = lo(b) - hi(a);
        if (clear < 8) continue;
        const blocked = sorted.some((m, k) => {
          if (k === i || k === j) return false;
          if (mid(m) <= mid(a) || mid(m) >= mid(b)) return false;
          const share = Math.min(c1(m), crossHi) - Math.max(c0(m), crossLo);
          return share > 20 && lo(m) >= hi(a) - 1 && hi(m) <= lo(b) + 1;
        });
        if (blocked) continue;
        out.push({
          axis,
          clear: Math.round(clear * 10) / 10,
          center: Math.round((mid(b) - mid(a)) * 10) / 10,
          at: (hi(a) + lo(b)) / 2,
          cross: (crossLo + crossHi) / 2
        });
      }
    }
  }
  return out;
}
function gapMarks(gaps, toX, toY, scale, mode = "clear") {
  const center = mode === "center";
  return gaps.map((g) => {
    if (g.clear * scale < 16) return "";
    const x = g.axis === "x" ? toX(g.at) : toX(g.cross);
    const y = g.axis === "z" ? toY(g.at) : toY(g.cross);
    return label(x, y, fmt(center ? g.center : g.clear), { size: 9, fill: center ? "#e0a34f" : "#8ec5ef" });
  }).join("");
}

// generators/bedroom/svgPreview.ts
function esc2(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt2(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}
var C = {
  bg: "#1d2025",
  carcass: "#c9b799",
  carcassLine: "#4a4034",
  front: "#9ec5d8",
  frontLine: "#3f5a6a",
  boundary: "#e0a34f",
  select: "#4f86e0",
  text: "#d8dde4",
  text2: "#9aa2ad",
  text3: "#6b737e",
  envelope: "#6b737e",
  hinge: "#243044"
};
var REGION_FILL = {
  boot: "rgba(201,183,153,0.07)",
  wardrobeL: "rgba(79,134,224,0.06)",
  wardrobeR: "rgba(79,134,224,0.06)",
  opening: "rgba(255,255,255,0.015)",
  ohc: "rgba(79,134,224,0.06)"
};
function frontRect(b) {
  const pv = b.profileVector ?? [];
  if (b.profilePlane === "XZ" || pv.length < 3) return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
  const ys = pv.map((q) => q.y).filter((v) => Number.isFinite(v));
  if (!ys.length) return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
  const yMin = Math.min(...ys);
  const atFront = pv.filter((q) => Math.abs(q.y - yMin) < 0.6);
  if (b.profilePlane === "YZ") {
    const zs = atFront.map((q) => q.z);
    return zs.length >= 2 ? { x0: b.x0, x1: b.x1, z0: Math.min(...zs), z1: Math.max(...zs) } : null;
  }
  const xs = atFront.map((q) => q.x);
  return xs.length >= 2 ? { x0: Math.min(...xs), x1: Math.max(...xs), z0: b.z0, z1: b.z1 } : null;
}
function generateBedroomSvgPreview(result, options = {}) {
  if (!result || result.validation.errors.length || !result.zones.length) return null;
  const width = options.width ?? 760;
  const p = result.params;
  const W = p.width;
  const H = p.height;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedRegion ?? null;
  const padLeft = 54;
  const padRight = 24;
  const padTop = 22;
  const padBottom = 30;
  const scale = (width - padLeft - padRight) / Math.max(W, 1);
  const height = options.height ?? Math.round(H * scale + padTop + padBottom);
  const ox = padLeft;
  const oy = padTop;
  const toX = (x) => ox + x * scale;
  const toY = (z) => oy + (H - z) * scale;
  const rectAttrs = (x0, x1, z0, z1) => `x="${toX(x0).toFixed(2)}" y="${toY(z1).toFixed(2)}" width="${Math.max((x1 - x0) * scale, 0.8).toFixed(2)}" height="${Math.max((z1 - z0) * scale, 0.8).toFixed(2)}"`;
  const parts = [];
  for (const z of result.zones) {
    const sel = z.id === selected;
    const isVoid = z.kind === "void";
    parts.push(
      `<rect class="region${sel ? " sel" : ""}${isVoid ? " void" : ""}" data-region="${z.id}" ${rectAttrs(z.x0, z.x1, z.z0, z.z1)} fill="${REGION_FILL[z.id]}" stroke="none" />`
    );
  }
  const boards = [...result.boards].sort((a, b) => b.y0 - a.y0);
  for (const b of boards) {
    const r = frontRect(b);
    if (!r || r.x1 - r.x0 < 0.1 || r.z1 - r.z0 < 0.1) continue;
    const isFront = b.y0 < -0.01;
    const doorStock = b.stock?.kind === "door";
    const kind = b.id.endsWith("_DOOR") ? "front door" : b.id.startsWith("OHC_FP") ? "front flap" : b.id.endsWith("_FIXED") ? "front fixed" : isFront ? "front" : "board";
    const fill = doorStock ? C.front : C.carcass;
    const line = doorStock ? C.frontLine : C.carcassLine;
    const opacity = isFront ? 0.55 : 0.92;
    parts.push(
      `<rect class="${kind}" data-board="${esc2(b.id)}" pointer-events="none" ${rectAttrs(r.x0, r.x1, r.z0, r.z1)} fill="${fill}" fill-opacity="${opacity}" stroke="${line}" stroke-width="0.75" />`
    );
  }
  for (const b of result.boards) {
    if (b.profilePlane !== "XZ") continue;
    const face = b.faces?.find((f) => f.id === "A");
    if (!face) continue;
    for (const ft of face.features) {
      if (ft.kind !== "hole" || ft.for !== "hinge" || !ft.center) continue;
      const x = b.x0 + ft.center[0];
      const z = b.z0 + ft.center[1];
      const r = Math.max((ft.diameter || 35) / 2 * scale, 1.5);
      parts.push(`<circle class="hinge" cx="${toX(x).toFixed(2)}" cy="${toY(z).toFixed(2)}" r="${r.toFixed(2)}" fill="none" stroke="${C.hinge}" stroke-width="1" pointer-events="none" />`);
    }
  }
  for (const z of result.zones) {
    const w = (z.x1 - z.x0) * scale;
    const h = (z.z1 - z.z0) * scale;
    if (w < 40 || h < 22) continue;
    const cx = toX((z.x0 + z.x1) / 2);
    const cy = toY((z.z0 + z.z1) / 2);
    const halo = `stroke="${C.bg}" stroke-opacity="0.85" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round"`;
    parts.push(`<text class="label" x="${cx.toFixed(2)}" y="${(cy - 5).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="${C.text}" ${halo} pointer-events="none">${esc2(z.label)}</text>`);
    if (w >= 70 && h >= 34) {
      parts.push(`<text class="label size" x="${cx.toFixed(2)}" y="${(cy + 9).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="${C.text2}" ${halo} pointer-events="none">${esc2(`${fmt2(z.x1 - z.x0)} \xD7 ${fmt2(z.z1 - z.z0)}`)}</text>`);
    }
  }
  const bedW = result.layout.bedFrameWidth;
  const bx0 = (W - bedW) / 2;
  const bx1 = bx0 + bedW;
  const by = toY(p.bootHeight) - 14;
  parts.push(
    `<g class="bed" pointer-events="none" stroke="${C.text2}" stroke-width="1"><line x1="${toX(bx0).toFixed(2)}" y1="${by.toFixed(2)}" x2="${toX(bx1).toFixed(2)}" y2="${by.toFixed(2)}" /><line x1="${toX(bx0).toFixed(2)}" y1="${(by - 5).toFixed(2)}" x2="${toX(bx0).toFixed(2)}" y2="${(by + 5).toFixed(2)}" /><line x1="${toX(bx1).toFixed(2)}" y1="${(by - 5).toFixed(2)}" x2="${toX(bx1).toFixed(2)}" y2="${(by + 5).toFixed(2)}" /><text x="${toX(W / 2).toFixed(2)}" y="${(by - 7).toFixed(2)}" text-anchor="middle" dominant-baseline="auto" font-size="10" fill="${C.text2}" stroke="none">bed ${fmt2(bedW)} \xB7 ${fmt2(result.layout.bedMargin)} each side</text></g>`
  );
  const selZone = result.zones.find((z) => z.id === selected);
  if (selZone) {
    parts.push(`<rect class="region-outline" pointer-events="none" ${rectAttrs(selZone.x0, selZone.x1, selZone.z0, selZone.z1)} fill="${C.select}" fill-opacity="0.12" stroke="${C.select}" stroke-width="2" />`);
  }
  parts.push(gapMarks(boardGaps(result.boards), toX, toY, scale, options.gaps ?? "clear"));
  parts.push(`<rect ${rectAttrs(0, W, 0, H)} fill="none" stroke="${C.envelope}" stroke-width="1.25" pointer-events="none" />`);
  const front = result.layout.front;
  const boundary = (key, axis, side, x1, y1, x2, y2, index) => {
    parts.push(
      `<g class="boundary" data-boundary="${key}" data-axis="${axis}" data-side="${side}"${index != null ? ` data-index="${index}"` : ""}><line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${C.boundary}" stroke-width="2" /><line class="hit" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="transparent" stroke-width="12" pointer-events="stroke" /></g>`
    );
  };
  boundary("bootHeight", "z", 0, toX(0), toY(p.bootHeight), toX(W), toY(p.bootHeight));
  boundary("wardrobeWidth", "x", -1, toX(p.wardrobeWidth), toY(p.bootHeight), toX(p.wardrobeWidth), toY(H));
  boundary("wardrobeWidth", "x", 1, toX(W - p.wardrobeWidth), toY(p.bootHeight), toX(W - p.wardrobeWidth), toY(H));
  boundary("ohcBottom", "z", 0, toX(p.wardrobeWidth), toY(p.ohcBottom), toX(W - p.wardrobeWidth), toY(p.ohcBottom));
  if (front && front.style === "style1") {
    boundary("fixedPanelTop", "z", -1, toX(0), toY(front.fixedPanelTop), toX(p.wardrobeWidth), toY(front.fixedPanelTop));
    boundary("fixedPanelTop", "z", 1, toX(W - p.wardrobeWidth), toY(front.fixedPanelTop), toX(W), toY(front.fixedPanelTop));
  }
  const ohc = result.layout.ohc;
  if (ohc) {
    ohc.zones.slice(0, -1).forEach((zone, i) => {
      boundary("ohcZone", "x", 0, toX(zone.x1), toY(p.ohcBottom), toX(zone.x1), toY(H), i);
    });
  }
  if (showDimensions) {
    const dimText = (x, y, text, anchor = "middle", fill = C.text2) => parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" fill="${fill}" pointer-events="none">${esc2(text)}</text>`);
    const heights = [[0, false], [p.bootHeight, true], [p.ohcBottom, true], [H, false]];
    if (front && front.style === "style1" && front.fixedPanelTop != null) heights.push([front.fixedPanelTop, true]);
    if (front && front.style === "nook" && front.nookShelfBottom != null) heights.push([front.nookShelfBottom, false]);
    for (const [z, drag] of heights) dimText(ox - 6, toY(z), fmt2(z), "end", drag ? C.boundary : C.text3);
    const yb = toY(0) + 14;
    dimText(toX(p.wardrobeWidth / 2), yb, fmt2(p.wardrobeWidth), "middle", C.boundary);
    dimText(toX(W / 2), yb, `${fmt2(result.layout.openingWidth)} opening`);
    dimText(toX(W - p.wardrobeWidth / 2), yb, fmt2(p.wardrobeWidth), "middle", C.boundary);
    dimText(toX(W), toY(H) - 11, `W ${fmt2(W)} \xB7 roof ${fmt2(H)} at the room face`, "end", C.text3);
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bedroom body front elevation" data-scale="${scale}" data-ox="${ox}" data-oy="${oy}" data-w="${W}" data-h="${H}" font-family="'Segoe UI', system-ui, sans-serif"><rect x="0" y="0" width="${width}" height="${height}" fill="${C.bg}" />` + parts.join("") + `</svg>`;
}

// generators/bedroom/generator.ts
var DEFAULT_CPT = 16;
var DEFAULT_COLOR = "White Stipple";
var EPS4 = 1e-6;
var LAYOUT_KEYS = ["bootHeight", "wardrobeWidth", "ohcBottom", "fixedPanelTop"];
var WARDROBE_STYLES = {
  style1: { label: "Style 1 \xB7 door over a fixed panel", layoutKey: "fixedPanelTop" },
  nook: { label: "Nook \xB7 door over an open shelf", layoutKey: null }
};
function normalizeStyle(raw) {
  return raw != null && Object.prototype.hasOwnProperty.call(WARDROBE_STYLES, String(raw)) ? String(raw) : "style1";
}
function round14(v) {
  return Math.round(v * 10) / 10;
}
function nookCutReach() {
  const cy = RULES.WARDROBE_NOOK_CUT_LOWER_CENTER_Y_MM.value;
  const cz = RULES.WARDROBE_NOOK_CUT_LOWER_CENTER_Z_MM.value;
  const rad = RULES.WARDROBE_NOOK_CUT_LOWER_RADIUS_MM.value;
  return round14(cy + Math.sqrt(rad * rad - cz * cz));
}
function nookCutPath(bottomZ, topZ) {
  const uy = RULES.WARDROBE_NOOK_CUT_UPPER_CENTER_Y_MM.value;
  const ur = RULES.WARDROBE_NOOK_CUT_UPPER_RADIUS_MM.value;
  const uz = topZ - ur;
  const ly = RULES.WARDROBE_NOOK_CUT_LOWER_CENTER_Y_MM.value;
  const lz = bottomZ + RULES.WARDROBE_NOOK_CUT_LOWER_CENTER_Z_MM.value;
  const lr = RULES.WARDROBE_NOOK_CUT_LOWER_RADIUS_MM.value;
  const ang = (cy, cz, y, z) => Math.atan2(y - cy, z - cz);
  const meet = circleMeet(uy, uz, ur, ly, lz, lr);
  const floorY = ly + Math.sqrt(lr * lr - (bottomZ - lz) ** 2);
  const samples = (cy, cz, rad, a0, a1) => {
    const span = a1 - a0;
    const step = 2 * Math.acos(Math.max(-1, 1 - 0.3 / rad));
    const n = Math.max(1, Math.ceil(Math.abs(span) / step));
    const out = [];
    for (let i = 1; i < n; i += 1) {
      const a = a0 + span * i / n;
      out.push({ y: round14(cy + rad * Math.sin(a)), z: round14(cz + rad * Math.cos(a)) });
    }
    return out;
  };
  return [
    { y: round14(uy), z: round14(topZ) },
    ...samples(uy, uz, ur, 0, ang(uy, uz, meet[0], meet[1])),
    { y: round14(meet[0]), z: round14(meet[1]) },
    ...samples(ly, lz, lr, ang(ly, lz, meet[0], meet[1]), ang(ly, lz, floorY, bottomZ)),
    { y: round14(floorY), z: round14(bottomZ) }
  ];
}
function circleMeet(y1, z1, r1, y2, z2, r2) {
  const dy = y2 - y1;
  const dz = z2 - z1;
  const d = Math.hypot(dy, dz);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const py = y1 + a * dy / d;
  const pz = z1 + a * dz / d;
  const yA = py + h * -dz / d;
  const zA = pz + h * dy / d;
  const yB = py - h * -dz / d;
  const zB = pz - h * dy / d;
  return yA > yB ? [yA, zA] : [yB, zB];
}
function asNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function roofAt(profile, height, y) {
  if (!profile || profile.length < 2) return height;
  if (y <= profile[0][0]) return profile[0][1];
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [y0, z0] = profile[i];
    const [y1, z1] = profile[i + 1];
    if (y <= y1 + 1e-9) return y1 - y0 < 1e-9 ? Math.min(z0, z1) : z0 + (z1 - z0) * (y - y0) / (y1 - y0);
  }
  return profile[profile.length - 1][1];
}
function normalizeProfile(raw, depth, height) {
  if (!Array.isArray(raw) || raw.length < 2) return [[0, height], [depth, height]];
  const pts = [];
  for (const p of raw) {
    const y = Number(Array.isArray(p) ? p[0] : NaN);
    const z = Number(Array.isArray(p) ? p[1] : NaN);
    if (Number.isFinite(y) && Number.isFinite(z)) pts.push([round14(Math.max(0, Math.min(depth, y))), round14(Math.max(0, z))]);
  }
  pts.sort((a, b) => a[0] - b[0]);
  if (!pts.length || pts[0][0] > 0) pts.unshift([0, pts.length ? pts[0][1] : height]);
  if (pts[pts.length - 1][0] < depth) pts.push([depth, pts[pts.length - 1][1]]);
  return pts;
}
function topLine(profile, depth, height, zTop) {
  const ys = /* @__PURE__ */ new Set([0, depth]);
  for (const [y] of profile) if (y > 0 && y < depth) ys.add(y);
  for (let i = 0; i < profile.length - 1; i += 1) {
    const [y0, z0] = profile[i];
    const [y1, z1] = profile[i + 1];
    if ((z0 - zTop) * (z1 - zTop) < 0) {
      const y = y0 + (zTop - z0) * (y1 - y0) / (z1 - z0);
      if (y > 0 && y < depth) ys.add(round14(y));
    }
  }
  return [...ys].sort((a, b) => a - b).map((y) => ({ y, z: round14(Math.min(zTop, roofAt(profile, height, y))) }));
}
function sectionYZ(profile, depth, height, z0, zTop) {
  const top = topLine(profile, depth, height, zTop);
  const kept = [];
  for (let i = 0; i < top.length; i += 1) {
    const p = top[i];
    if (p.z > z0 + EPS4) {
      kept.push(p);
      continue;
    }
    if (kept.length) {
      const a = top[i - 1];
      const y = a.z - p.z < EPS4 ? p.y : a.y + (a.z - z0) * (p.y - a.y) / (a.z - p.z);
      kept.push({ y: round14(y), z: round14(z0) });
    }
    break;
  }
  if (!kept.length) return null;
  const yEnd = kept[kept.length - 1].y;
  const out = [{ y: 0, z: round14(z0) }, { y: yEnd, z: round14(z0) }];
  for (let i = kept.length - 1; i >= 0; i -= 1) {
    const p = kept[i];
    const last = out[out.length - 1];
    if (Math.abs(last.y - p.y) > EPS4 || Math.abs(last.z - p.z) > EPS4) out.push(p);
  }
  out.push({ y: 0, z: round14(z0) });
  return out;
}
function sectionDepth(outline) {
  return outline ? Math.max(...outline.map((p) => p.y)) : 0;
}
function resolve(raw) {
  const W = round14(asNum(raw.width, 0));
  const D = round14(asNum(raw.depth, 0));
  const H = round14(asNum(raw.height, 0));
  return {
    width: W,
    depth: D,
    height: H,
    roofProfile: normalizeProfile(raw.roofProfile, D, H),
    bootHeight: round14(asNum(raw.bootHeight, RULES.BOOT_HEIGHT_DEFAULT_MM.value)),
    wardrobeWidth: round14(asNum(raw.wardrobeWidth, RULES.WARDROBE_WIDTH_DEFAULT_MM.value)),
    ohcBottom: round14(asNum(raw.ohcBottom, RULES.OHC_BOTTOM_DEFAULT_MM.value)),
    style: normalizeStyle(raw.style),
    fixedPanelTop: round14(asNum(raw.fixedPanelTop, RULES.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value)),
    nookShelfBottom: nookWardrobeBottom({ bootHeight: round14(asNum(raw.bootHeight, RULES.BOOT_HEIGHT_DEFAULT_MM.value)) }),
    ledGroove: raw.ledGroove !== false,
    bedFrame: normalizeBedFrame(raw.bedFrame),
    panelThickness: round14(asNum(raw.panelThickness, DEFAULT_CPT)),
    doorPanelThickness: round14(asNum(raw.doorPanelThickness, RULES.DOOR_PANEL_THICKNESS_DEFAULT_MM.value)),
    frontPanelThickness: round14(asNum(raw.frontPanelThickness, 0)),
    carcassColor: String(raw.carcassColor || DEFAULT_COLOR),
    doorColor: String(raw.doorColorName || raw.doorColor || DEFAULT_COLOR),
    ohcZones: normalizeOhcZones(raw.ohcZones, round14(W - 2 * round14(asNum(raw.wardrobeWidth, RULES.WARDROBE_WIDTH_DEFAULT_MM.value))))
  };
}
function layoutLimits(raw, key) {
  const p = resolve(raw);
  switch (key) {
    case "bootHeight":
      return { min: RULES.BOOT_HEIGHT_MIN_MM.value, max: round14(p.ohcBottom - RULES.OPENING_HEIGHT_MIN_MM.value) };
    case "ohcBottom":
      return { min: round14(p.bootHeight + RULES.OPENING_HEIGHT_MIN_MM.value), max: round14(p.height - RULES.OHC_HEIGHT_MIN_MM.value) };
    case "wardrobeWidth":
      return { min: RULES.WARDROBE_WIDTH_MIN_MM.value, max: round14((p.width - bedFrameWidth(p.bedFrame)) / 2) };
    case "fixedPanelTop": {
      const floor = wardrobeFloorTop(p);
      const doorTop = t3TopOf(p);
      return {
        min: round14(floor + RULES.WARDROBE_FIXED_PANEL_MIN_MM.value),
        max: round14(doorTop - RULES.WARDROBE_DOOR_CLEARANCE_MM.value - RULES.WARDROBE_DOOR_MIN_MM.value)
      };
    }
  }
}
function wardrobeFloorTop(p) {
  return round14(p.bootHeight + RULES.WARDROBE_FLOOR_RAISE_MM.value);
}
function nookWardrobeBottom(p) {
  return round14(wardrobeFloorTop(p) + RULES.WARDROBE_NOOK_CUT_HEIGHT_MM.value);
}
function t3TopOf(p) {
  return round14(roofAt(p.roofProfile, p.height, RULES.WARDROBE_T2_BACK_MM.value) - RULES.WARDROBE_T2_HEIGHT_MM.value - RULES.WARDROBE_T3_CLEARANCE_MM.value);
}
function setLayout(raw, key, value) {
  const { min, max } = layoutLimits(raw, key);
  const v = round14(Math.max(min, Math.min(max, Number(value))));
  if (raw[key] === v) return raw;
  const next = { ...raw, [key]: v };
  const own = WARDROBE_STYLES[normalizeStyle(next.style)].layoutKey;
  if (own && key !== own) {
    const lim = layoutLimits(next, own);
    const cur = round14(asNum(next[own], RULES.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value));
    const clamped = round14(Math.max(lim.min, Math.min(lim.max, cur)));
    if (clamped !== cur) next[own] = clamped;
  }
  return next;
}
var BED_FRAMES = {
  queen: { label: "Queen", rule: "BED_FRAME_QUEEN_WIDTH_MM" }
};
function normalizeBedFrame(raw) {
  return raw != null && Object.prototype.hasOwnProperty.call(BED_FRAMES, String(raw)) ? String(raw) : "queen";
}
function bedFrameWidth(frame) {
  return RULES[BED_FRAMES[normalizeBedFrame(frame)].rule].value;
}
function bedBoxSizeFor(raw) {
  const p = resolve(raw);
  return { W: bedFrameWidth(p.bedFrame), H: p.bootHeight };
}
var ZONE_LABEL = {
  boot: "Tunnel boot",
  wardrobeL: "Wardrobe left",
  wardrobeR: "Wardrobe right",
  opening: "Mattress opening",
  ohc: "Overhead"
};
function generateBedroom(raw) {
  const errors = [];
  const warnings = [];
  const p = resolve(raw);
  const { width: W, depth: D, height: H, roofProfile: profile } = p;
  beginProvenance();
  const P = param({ W, D, H, bootHeight: p.bootHeight, wardrobeWidth: p.wardrobeWidth, ohcBottom: p.ohcBottom, fixedPanelTop: p.fixedPanelTop });
  const BED = RULES[BED_FRAMES[p.bedFrame].rule];
  const bootTop = dim("boot.z1", { bootHeight: P.bootHeight }, (t) => t.bootHeight);
  const wardLx1 = dim("wardrobeL.x1", { wardrobeWidth: P.wardrobeWidth }, (t) => t.wardrobeWidth);
  const wardRx0 = dim("wardrobeR.x0", { W: P.W, wardrobeWidth: P.wardrobeWidth }, (t) => t.W - t.wardrobeWidth);
  const ohcBot = dim("ohc.z0", { ohcBottom: P.ohcBottom }, (t) => t.ohcBottom);
  const openingW = dim("layout.openingWidth", { x1: ref("wardrobeR.x0"), x0: ref("wardrobeL.x1") }, (t) => t.x1 - t.x0);
  const openingH = dim("layout.openingHeight", { top: ref("ohc.z0"), bottom: ref("boot.z1") }, (t) => t.top - t.bottom);
  const ohcH = dim("layout.ohcHeight", { H: P.H, bottom: ref("ohc.z0") }, (t) => t.H - t.bottom);
  const bedW = dim("bedBox.W", { BED }, (t) => t.BED);
  dim("bedBox.H", { bootHeight: ref("boot.z1") }, (t) => t.bootHeight);
  dim("bedBox.x0", { W: P.W, bed: ref("bedBox.W") }, (t) => (t.W - t.bed) / 2);
  dim("bedBox.x1", { x0: ref("bedBox.x0"), bed: ref("bedBox.W") }, (t) => t.x0 + t.bed);
  const bedMargin = dim("layout.bedMargin", { opening: ref("layout.openingWidth"), bed: ref("bedBox.W") }, (t) => (t.opening - t.bed) / 2);
  const roofMin = round14(Math.min(...profile.map((q) => q[1])));
  if (W < 600) errors.push("width must be at least 600 mm");
  if (D < 300) errors.push("depth must be at least 300 mm");
  if (H < 600) errors.push("height must be at least 600 mm");
  if (p.panelThickness <= 0) errors.push("panelThickness must be positive");
  if (roofMin < 300) warnings.push(`roof drops to ${roofMin} mm at the nose`);
  const lim = (key) => layoutLimits(p, key);
  if (p.bootHeight < lim("bootHeight").min) errors.push(`tunnel boot ${p.bootHeight} is lower than ${RULES.BOOT_HEIGHT_MIN_MM.value} mm`);
  if (p.wardrobeWidth < lim("wardrobeWidth").min) errors.push(`wardrobe ${p.wardrobeWidth} is narrower than ${RULES.WARDROBE_WIDTH_MIN_MM.value} mm`);
  if (openingW < bedW - EPS4) errors.push(`the wardrobes leave only ${round14(openingW)} mm between them \u2014 the ${BED_FRAMES[p.bedFrame].label.toLowerCase()} bed frame needs ${bedW}`);
  if (openingH < RULES.OPENING_HEIGHT_MIN_MM.value) errors.push(`only ${round14(openingH)} mm between the boot deck and the overhead (min ${RULES.OPENING_HEIGHT_MIN_MM.value})`);
  if (ohcH < RULES.OHC_HEIGHT_MIN_MM.value) errors.push(`overhead is only ${round14(ohcH)} mm high at the room face (min ${RULES.OHC_HEIGHT_MIN_MM.value})`);
  for (const bay of p.ohcZones) {
    if (bay.width < RULES.OHC_ZONE_MIN_MM.value - EPS4) errors.push(`overhead bay ${bay.width} is narrower than ${RULES.OHC_ZONE_MIN_MM.value} mm`);
  }
  if (p.style === "style1") {
    const splitLim = lim("fixedPanelTop");
    if (p.fixedPanelTop < splitLim.min) errors.push(`the fixed panel top ${p.fixedPanelTop} leaves only ${round14(p.fixedPanelTop - wardrobeFloorTop(p))} mm of panel above the wardrobe floor (min ${RULES.WARDROBE_FIXED_PANEL_MIN_MM.value})`);
    if (p.fixedPanelTop > splitLim.max) errors.push(`the fixed panel top ${p.fixedPanelTop} leaves only ${round14(t3TopOf(p) - RULES.WARDROBE_DOOR_CLEARANCE_MM.value - p.fixedPanelTop)} mm of door under T3 (min ${RULES.WARDROBE_DOOR_MIN_MM.value})`);
  }
  if (p.style === "nook") {
    const bottom = nookWardrobeBottom(p);
    const door = round14(t3TopOf(p) - bottom);
    if (door < RULES.WARDROBE_DOOR_MIN_MM.value) errors.push(`the nook wardrobe bottom ${bottom} leaves only ${door} mm of door under T3 (min ${RULES.WARDROBE_DOOR_MIN_MM.value})`);
  }
  const zones = [];
  if (!errors.length) {
    const region = (id, kind, x0, x1, z0, zTop, roofTop) => {
      const outline = sectionYZ(profile, D, H, z0, zTop);
      if (!outline) {
        errors.push(`${ZONE_LABEL[id]} has no room under the roof`);
        return;
      }
      zones.push({ id, label: ZONE_LABEL[id], kind, x0: round14(x0), x1: round14(x1), y0: 0, y1: sectionDepth(outline), z0: round14(z0), z1: round14(roofTop ? H : zTop), roofTop, outlineYZ: outline });
    };
    region("boot", "solid", 0, W, 0, bootTop, false);
    region("wardrobeL", "solid", 0, wardLx1, bootTop, H, true);
    region("wardrobeR", "solid", wardRx0, W, bootTop, H, true);
    region("opening", "void", wardLx1, wardRx0, bootTop, ohcBot, false);
    region("ohc", "solid", wardLx1, wardRx0, ohcBot, H, true);
    const ohcZone = zones.find((z) => z.id === "ohc");
    if (ohcZone && ohcZone.y1 < 100) warnings.push(`overhead is only ${round14(ohcZone.y1)} mm deep before the roof cuts it off`);
  }
  const boards = [];
  const joints = [];
  const bootZone = zones.find((z) => z.id === "boot");
  if (!errors.length && bootZone && roofMin < p.bootHeight - EPS4) errors.push(`the roof comes down to ${roofMin} mm at the nose, below the boot deck (${p.bootHeight}) \u2014 the deck cannot run to the nose`);
  if (!errors.length && bootZone) {
    const CPT = P_cpt(p.panelThickness);
    const deckT = RULES.BOOT_DECK_THICKNESS_MM;
    const deck = boardRect("BOOT_DECK", "Boot deck", "boot_deck", "XY", "Z", deckT.value, {
      x0: dim("BOOT_DECK.x0", {}, () => 0, { formula: "0" }),
      x1: dim("BOOT_DECK.x1", { W: P.W }, (t) => t.W),
      y0: dim("BOOT_DECK.y0", {}, () => 0, { formula: "0" }),
      y1: dim("BOOT_DECK.y1", { D: P.D }, (t) => t.D),
      z1: same("BOOT_DECK.z1", "boot.z1"),
      z0: dim("BOOT_DECK.z0", { top: ref("BOOT_DECK.z1"), DECK: deckT }, (t) => t.top - t.DECK)
    });
    const back = boardRect("BOOT_BACK", "Boot upright \xB7 room face", "boot_upright", "XZ", "Y", CPT.value, {
      x0: dim("BOOT_BACK.x0", {}, () => 0, { formula: "0" }),
      x1: dim("BOOT_BACK.x1", { W: P.W }, (t) => t.W),
      y0: dim("BOOT_BACK.y0", {}, () => 0, { formula: "0" }),
      y1: dim("BOOT_BACK.y1", { CPT }, (t) => t.CPT),
      z0: dim("BOOT_BACK.z0", {}, () => 0, { formula: "0" }),
      z1: same("BOOT_BACK.z1", "BOOT_DECK.z0")
    });
    const front = boardRect("BOOT_FRONT", "Boot upright \xB7 nose", "boot_upright", "XZ", "Y", CPT.value, {
      x0: dim("BOOT_FRONT.x0", {}, () => 0, { formula: "0" }),
      x1: dim("BOOT_FRONT.x1", { W: P.W }, (t) => t.W),
      y1: dim("BOOT_FRONT.y1", { D: P.D }, (t) => t.D),
      y0: dim("BOOT_FRONT.y0", { D: ref("BOOT_FRONT.y1"), CPT }, (t) => t.D - t.CPT),
      z0: dim("BOOT_FRONT.z0", {}, () => 0, { formula: "0" }),
      z1: same("BOOT_FRONT.z1", "BOOT_DECK.z0")
    });
    for (const b of [deck, back, front]) {
      b.zoneId = "boot";
      b.role = b.category;
      boards.push(b);
    }
    bootZone.boards = boards.map((b) => b.id);
    attachFaces(boards);
    for (const b of boards) b.stock = { kind: "carcass", thickness: b.materialThickness, colour: p.carcassColor };
    annotate(deck, "A", { semantic: "top", visible: true, finish: { colour: p.carcassColor } });
    annotate(deck, "B", { semantic: "inside", visible: false });
    annotate(back, "B", { semantic: "front", visible: true, finish: { colour: p.carcassColor } });
    annotate(back, "A", { semantic: "inside", visible: false });
    annotate(front, "A", { semantic: "outside", visible: false });
    annotate(front, "B", { semantic: "inside", visible: false });
    for (const up of [back, front]) {
      joints.push(joint(`${up.id}_deck`, "butt", faceRef(deck.id, ["B"]), faceRef(up.id, boundaryEdgeFaces(up, "+Z")), { hardware: [], rule: "boot_deck_on_uprights_v1" }));
    }
  }
  let top = null;
  const wardL = zones.find((z) => z.id === "wardrobeL");
  const wardR = zones.find((z) => z.id === "wardrobeR");
  if (!errors.length && wardL && wardR) {
    const DPT = param({ DPT: p.doorPanelThickness }).DPT;
    const roofFn = (y) => roofAt(profile, H, y);
    const t2Back = dim("top.T2.y1", { T2_BACK: RULES.WARDROBE_T2_BACK_MM }, (t) => t.T2_BACK);
    const roofAtT2 = dim("top.roofAtT2", { y: ref("top.T2.y1") }, (t) => round14(roofFn(t.y)), { formula: "roof(T2.y1)" });
    const t3Top = dim("top.T3.z1", { roof: ref("top.roofAtT2"), T2H: RULES.WARDROBE_T2_HEIGHT_MM, CL: RULES.WARDROBE_T3_CLEARANCE_MM }, (t) => t.roof - t.T2H - t.CL);
    const seat = dim("top.seat", { t3Top: ref("top.T3.z1"), T3: RULES.WARDROBE_T3_THICKNESS_MM }, (t) => t.t3Top - t.T3);
    const railZ0 = dim("top.rail.z0", { t3Top: ref("top.T3.z1"), CL: RULES.WARDROBE_T3_CLEARANCE_MM }, (t) => t.t3Top + t.CL);
    const lipY1 = dim("top.lip.y1", { T2_BACK: ref("top.T2.y1"), LIP: RULES.WARDROBE_T3_LIP_DEPTH_MM }, (t) => t.T2_BACK + t.LIP);
    dim("top.T3.tail.y1", { lip: ref("top.lip.y1"), CL: RULES.WARDROBE_T3_TAIL_CLEARANCE_MM }, (t) => t.lip - t.CL);
    const t3Depth = dim("top.T3.y1", { T3D: RULES.WARDROBE_T3_DEPTH_MM }, (t) => t.T3D);
    const stripY = dim("wallStrip.y1", { D: P.D, STRIP: RULES.WARDROBE_WALL_STRIP_DEPTH_MM }, (t) => Math.min(t.D, t.STRIP));
    dim("top.T2.y0", { y1: ref("top.T2.y1"), T2T: RULES.WARDROBE_T2_THICKNESS_MM }, (t) => t.y1 - t.T2T);
    const t1Y0 = dim("top.T1.y0", { y1: ref("top.T2.y0"), T1T: RULES.WARDROBE_T1_THICKNESS_MM }, (t) => t.y1 - t.T1T);
    dim("top.roofAtT1", { y: ref("top.T2.y0") }, (t) => round14(roofFn(t.y)), { formula: "roof(T1.y1)" });
    dim("top.T1.z1", { roof: ref("top.roofAtT1"), OVER: RULES.WARDROBE_T1_OVERSIZE_MM }, (t) => t.roof + t.OVER);
    const roofAtLip = round14(roofFn(lipY1));
    top = { seat: round14(seat), t3Top: round14(t3Top), roofAtT2: round14(roofAtT2), t2Height: round14(roofAtT2 - railZ0) };
    if (seat - p.bootHeight < RULES.WARDROBE_PANEL_MIN_HEIGHT_MM.value) errors.push(`the roof at the T2 back (${round14(roofAtT2)}) leaves only ${round14(seat - p.bootHeight)} mm of colour panel above the boot deck (min ${RULES.WARDROBE_PANEL_MIN_HEIGHT_MM.value})`);
    if (roofAtLip <= railZ0 + EPS4) errors.push(`the roof comes down to ${roofAtLip} mm at the T3 pocket end \u2014 no room for the panel above the pocket`);
    if (t3Depth > D - EPS4) errors.push(`T3 depth ${round14(t3Depth)} is more than the body depth ${D}`);
    if (stripY <= lipY1 + EPS4) errors.push(`the wall strip depth ${round14(stripY)} does not reach past the T3 pocket`);
    if (round14(roofFn(stripY)) <= p.bootHeight + EPS4) errors.push(`the roof comes down to ${round14(roofFn(stripY))} mm at the wall strip's back, below the boot deck`);
    if (t1Y0 < EPS4) errors.push("the top rails do not fit in front of the T2 back");
    if (!errors.length) warnings.push(`T1 is cut ${RULES.WARDROBE_T1_OVERSIZE_MM.value} mm above the roof by design \u2014 trim to the roof on site`);
    const nookOn = p.style === "nook";
    dim("front.floor.z1", { boot: ref("boot.z1"), RAISE: RULES.WARDROBE_FLOOR_RAISE_MM }, (t) => t.boot + t.RAISE);
    if (nookOn) {
      dim("nook.z0", { floor: ref("front.floor.z1") }, (t) => t.floor, { formula: "= front.floor.z1" });
      dim("nook.z1", { floor: ref("front.floor.z1"), H: RULES.WARDROBE_NOOK_CUT_HEIGHT_MM }, (t) => t.floor + t.H);
      const reach = nookCutReach();
      dim("nook.cut.floorY", { reach }, (t) => t.reach, { formula: "lower arc meets the cut bottom" });
      if (reach > D - EPS4) errors.push(`the nook cut reaches ${reach} mm back and the body is only ${D} deep`);
    }
    if (!errors.length) {
      const panelOutline = (id) => {
        const o = new Outline(`${id}.pv`, ["y", "z"]);
        const bootZ = ref("boot.z1");
        o.add(lit(0), ex({ bootZ }, (t) => t.bootZ));
        o.add(ex({ D: P.D }, (t) => t.D), ex({ bootZ }, (t) => t.bootZ));
        const breaks = profile.map((q) => q[0]).filter((y) => y > t2Back + EPS4 && y < D - EPS4).sort((a, b) => b - a);
        o.add(ex({ D: P.D }, (t) => t.D), ex({ D: P.D }, (t) => round14(roofFn(t.D)), "roof(D)"));
        for (const y of breaks) o.add(lit(round14(y)), ex({ y }, (t) => round14(roofFn(t.y)), `roof(${round14(y)})`));
        o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ roof: ref("top.roofAtT2") }, (t) => t.roof));
        o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
        o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
        o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.seat") }, (t) => t.z));
        o.add(lit(0), ex({ z: ref("top.seat") }, (t) => t.z));
        if (nookOn) {
          o.add(lit(0), ex({ z: ref("nook.z1") }, (t) => t.z));
          for (const pt of nookCutPath(ref("nook.z0").value, ref("nook.z1").value)) o.add(lit(pt.y), lit(pt.z));
          o.add(lit(0), ex({ z: ref("nook.z0") }, (t) => t.z));
        }
        return o.points.map(([py, pz]) => ({ y: round14(py), z: round14(pz) }));
      };
      const panelBox = (id, side) => {
        const outline = panelOutline(id);
        const zTop = Math.max(...outline.map((q) => q.z));
        const x0 = side === "L" ? dim(`${id}.x0`, { ww: ref("wardrobeL.x1"), DPT }, (t) => t.ww - t.DPT) : same(`${id}.x0`, "wardrobeR.x0");
        const x1 = side === "L" ? same(`${id}.x1`, "wardrobeL.x1") : dim(`${id}.x1`, { x0: ref(`${id}.x0`), DPT }, (t) => t.x0 + t.DPT);
        const b = boardRect(id, `Wardrobe colour panel \xB7 ${side === "L" ? "left" : "right"}`, "colour_panel", "YZ", "X", DPT.value, {
          x0,
          x1,
          y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
          y1: dim(`${id}.y1`, { D: P.D }, (t) => t.D),
          z0: same(`${id}.z0`, "boot.z1"),
          z1: dim(`${id}.z1`, { H: P.H }, () => zTop, { formula: "max(roof over the panel)" })
        });
        b.profileVector = outline;
        return b;
      };
      const panelL = panelBox("WARD_L_PANEL", "L");
      const panelR = panelBox("WARD_R_PANEL", "R");
      const CPT = param({ CPT: p.panelThickness }).CPT;
      const shelfOn = p.style === "style1";
      if (nookOn) {
        dim("base.z0", { floor: ref("front.floor.z1"), BASE: RULES.WARDROBE_BASE_THICKNESS_MM }, (t) => t.floor - t.BASE);
        dim("nook.base.y1", { D: P.D, z: ref("front.floor.z1") }, (t) => yWhereRoofMeets(roofFn, t.D, t.z), { formula: "min(D, y where roof = floor top)" });
        same("nook.shelf.z0", "nook.z1");
        dim("nook.shelf.z1", { z0: ref("nook.shelf.z0"), CPT }, (t) => t.z0 + t.CPT);
        dim("nook.shelf.y1", { D: P.D, GAP: RULES.WARDROBE_NOOK_SHELF_NOSE_GAP_MM, z: ref("nook.shelf.z1") }, (t) => yWhereRoofMeets(roofFn, t.D - t.GAP, t.z), { formula: "min(D - GAP, y where roof = shelf top)" });
        if (ref("nook.base.y1").value < 50) errors.push(`the roof comes down to ${round14(roofFn(0))} mm at the room face, below the wardrobe floor (${round14(ref("front.floor.z1").value)})`);
        if (ref("nook.shelf.y1").value < 50) errors.push(`the roof comes down to ${round14(roofFn(0))} mm at the room face \u2014 the nook shelf (${round14(ref("nook.shelf.z1").value)}) does not fit under it`);
        else if (ref("nook.shelf.y1").value < D - RULES.WARDROBE_NOOK_SHELF_NOSE_GAP_MM.value - 0.5) warnings.push(`the nook shelf stops at ${round14(ref("nook.shelf.y1").value)} where the roof meets it, ${round14(D - RULES.WARDROBE_NOOK_SHELF_NOSE_GAP_MM.value - ref("nook.shelf.y1").value)} mm short of the ${RULES.WARDROBE_NOOK_SHELF_NOSE_GAP_MM.value} mm nose gap`);
      }
      const stripZ0Key = nookOn ? "nook.shelf.z1" : "boot.z1";
      if (shelfOn) {
        dim("shelf.z0", { floor: ref("front.floor.z1"), ABOVE: RULES.WARDROBE_SHELF_ABOVE_FLOOR_MM }, (t) => t.floor + t.ABOVE);
        dim("shelf.z1", { z0: ref("shelf.z0"), CPT }, (t) => t.z0 + t.CPT);
        dim("shelf.notch.z0", { z0: ref("shelf.z0"), CL: RULES.WARDROBE_SHELF_GROOVE_Z_MM }, (t) => t.z0 - t.CL);
        dim("shelf.notch.z1", { z1: ref("shelf.z1"), CL: RULES.WARDROBE_SHELF_GROOVE_Z_MM }, (t) => t.z1 + t.CL);
        dim("shelf.notch.y0", { SETBACK: RULES.WARDROBE_SHELF_STRIP_SETBACK_MM }, (t) => t.SETBACK);
        dim("shelf.groove.y0", { D: P.D }, (t) => t.D / 3);
        dim("shelf.groove.y1", { D: P.D }, (t) => 2 * t.D / 3);
        dim("shelf.tongue.y0", { y0: ref("shelf.groove.y0"), END: RULES.WARDROBE_SHELF_GROOVE_END_MM }, (t) => t.y0 + t.END);
        dim("shelf.tongue.y1", { y1: ref("shelf.groove.y1"), END: RULES.WARDROBE_SHELF_GROOVE_END_MM }, (t) => t.y1 - t.END);
        dim("shelf.tongue.depth", { DPT, TIP: RULES.WARDROBE_SHELF_TONGUE_TIP_MM }, (t) => t.DPT / 2 - t.TIP);
        dim("shelf.groove.depth", { tongue: ref("shelf.tongue.depth"), EXTRA: RULES.WARDROBE_SHELF_GROOVE_EXTRA_MM }, (t) => t.tongue + t.EXTRA);
      }
      const shelfNotch = shelfOn && RULES.WARDROBE_SHELF_STRIP_SETBACK_MM.value < stripY - EPS4;
      const stripOutline = (id) => {
        const o = new Outline(`${id}.pv`, ["y", "z"]);
        const bootZ = ref(stripZ0Key);
        const yBack = () => ex({ y: ref("wallStrip.y1") }, (t) => t.y);
        o.add(lit(0), ex({ bootZ }, (t) => t.bootZ));
        o.add(yBack(), ex({ bootZ }, (t) => t.bootZ));
        if (shelfNotch) {
          o.add(yBack(), ex({ z: ref("shelf.notch.z0") }, (t) => t.z));
          o.add(ex({ y: ref("shelf.notch.y0") }, (t) => t.y), ex({ z: ref("shelf.notch.z0") }, (t) => t.z));
          o.add(ex({ y: ref("shelf.notch.y0") }, (t) => t.y), ex({ z: ref("shelf.notch.z1") }, (t) => t.z));
          o.add(yBack(), ex({ z: ref("shelf.notch.z1") }, (t) => t.z));
        }
        const breaks = profile.map((q) => q[0]).filter((y) => y > t2Back + EPS4 && y < stripY - EPS4).sort((a, b) => b - a);
        o.add(yBack(), ex({ y: ref("wallStrip.y1") }, (t) => round14(roofFn(t.y)), "roof(wallStrip.y1)"));
        for (const y of breaks) o.add(lit(round14(y)), ex({ y }, (t) => round14(roofFn(t.y)), `roof(${round14(y)})`));
        o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ roof: ref("top.roofAtT2") }, (t) => t.roof));
        o.add(ex({ y: ref("top.T2.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
        o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.rail.z0") }, (t) => t.z));
        o.add(ex({ y: ref("top.lip.y1") }, (t) => t.y), ex({ z: ref("top.seat") }, (t) => t.z));
        o.add(lit(0), ex({ z: ref("top.seat") }, (t) => t.z));
        return o.points.map(([py, pz]) => ({ y: round14(py), z: round14(pz) }));
      };
      const stripBox = (id, side) => {
        const outline = stripOutline(id);
        const zTop = Math.max(...outline.map((q) => q.z));
        const x0 = side === "L" ? dim(`${id}.x0`, {}, () => 0, { formula: "0" }) : dim(`${id}.x0`, { W: P.W, CPT }, (t) => t.W - t.CPT);
        const x1 = side === "L" ? dim(`${id}.x1`, { CPT }, (t) => t.CPT) : dim(`${id}.x1`, { W: P.W }, (t) => t.W);
        const b = boardRect(id, `Wardrobe wall strip \xB7 ${side === "L" ? "left" : "right"}`, "side_panel", "YZ", "X", p.panelThickness, {
          x0,
          x1,
          y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
          y1: same(`${id}.y1`, "wallStrip.y1"),
          z0: same(`${id}.z0`, stripZ0Key),
          z1: dim(`${id}.z1`, { H: P.H }, () => zTop, { formula: "max(roof over the strip)" })
        });
        b.profileVector = outline;
        return b;
      };
      const stripL = stripBox("WARD_L_STRIP", "L");
      const stripR = stripBox("WARD_R_STRIP", "R");
      if (shelfNotch) {
        stripL.notes = ["through notch y 75 \u2192 back, the Style 1 shelf passes to the wall"];
        stripR.notes = stripL.notes;
      }
      const nookBoards = [];
      if (nookOn) {
        const BASE = RULES.WARDROBE_BASE_THICKNESS_MM;
        const panelFace = (id, side) => side === "L" ? same(`${id}.x1`, "WARD_L_PANEL.x0") : same(`${id}.x0`, "WARD_R_PANEL.x1");
        const wall0 = (id) => dim(`${id}.x0`, {}, () => 0, { formula: "0" });
        const wall1 = (id) => dim(`${id}.x1`, { W: P.W }, (t) => t.W);
        for (const side of ["L", "R"]) {
          const name = side === "L" ? "left" : "right";
          const kickId = `WARD_${side}_KICK`;
          const kick = boardRect(kickId, `Wardrobe kick \xB7 ${name}`, "kick", "YZ", "X", BASE.value, {
            x0: side === "L" ? wall0(kickId) : dim(`${kickId}.x0`, { W: P.W, BASE }, (t) => t.W - t.BASE),
            x1: side === "L" ? dim(`${kickId}.x1`, { BASE }, (t) => t.BASE) : wall1(kickId),
            y0: dim(`${kickId}.y0`, {}, () => 0, { formula: "0" }),
            y1: same(`${kickId}.y1`, "nook.base.y1"),
            z0: same(`${kickId}.z0`, "boot.z1"),
            z1: same(`${kickId}.z1`, "base.z0")
          });
          const floorId = `WARD_${side}_FLOOR`;
          const floor = boardRect(floorId, `Wardrobe floor \xB7 ${name}`, "floor", "XY", "Z", BASE.value, {
            x0: side === "L" ? wall0(floorId) : panelFace(floorId, side),
            x1: side === "L" ? panelFace(floorId, side) : wall1(floorId),
            y0: dim(`${floorId}.y0`, {}, () => 0, { formula: "0" }),
            y1: same(`${floorId}.y1`, "nook.base.y1"),
            z0: same(`${floorId}.z0`, "base.z0"),
            z1: same(`${floorId}.z1`, "front.floor.z1")
          });
          const nookId = `WARD_${side}_NOOK`;
          const shelf = boardRect(nookId, `Nook shelf \xB7 ${name}`, "shelf", "XY", "Z", p.panelThickness, {
            x0: side === "L" ? wall0(nookId) : panelFace(nookId, side),
            x1: side === "L" ? panelFace(nookId, side) : wall1(nookId),
            y0: dim(`${nookId}.y0`, {}, () => 0, { formula: "0" }),
            y1: same(`${nookId}.y1`, "nook.shelf.y1"),
            z0: same(`${nookId}.z0`, "nook.shelf.z0"),
            z1: same(`${nookId}.z1`, "nook.shelf.z1")
          });
          nookBoards.push(kick, floor, shelf);
        }
      }
      const shelfBoards = [];
      if (shelfOn) {
        const shelfOutline = (id, side) => {
          const o = new Outline(`${id}.pv`, ["x", "y"]);
          const ySet = () => ex({ y: ref("shelf.notch.y0") }, (t) => t.y);
          const y0t = () => ex({ y: ref("shelf.tongue.y0") }, (t) => t.y);
          const y1t = () => ex({ y: ref("shelf.tongue.y1") }, (t) => t.y);
          const yD = () => ex({ D: P.D }, (t) => t.D);
          const face = () => side === "L" ? ex({ x: ref("WARD_L_PANEL.x0") }, (t) => t.x) : ex({ x: ref("WARD_R_PANEL.x1") }, (t) => t.x);
          const tip = () => side === "L" ? ex({ x: ref("WARD_L_PANEL.x0"), tongue: ref("shelf.tongue.depth") }, (t) => t.x + t.tongue) : ex({ x: ref("WARD_R_PANEL.x1"), tongue: ref("shelf.tongue.depth") }, (t) => t.x - t.tongue);
          const inset = () => side === "L" ? ex({ CPT, GAP: RULES.WARDROBE_SHELF_STRIP_GAP_MM }, (t) => t.CPT + t.GAP) : ex({ W: P.W, CPT, GAP: RULES.WARDROBE_SHELF_STRIP_GAP_MM }, (t) => t.W - t.CPT - t.GAP);
          const wall = () => side === "L" ? lit(0) : ex({ W: P.W }, (t) => t.W);
          if (side === "L") {
            o.add(inset(), lit(0)).add(face(), lit(0)).add(face(), y0t()).add(tip(), y0t()).add(tip(), y1t()).add(face(), y1t());
            o.add(face(), yD()).add(wall(), yD()).add(wall(), ySet()).add(inset(), ySet());
          } else {
            o.add(inset(), lit(0)).add(inset(), ySet()).add(wall(), ySet()).add(wall(), yD()).add(face(), yD());
            o.add(face(), y1t()).add(tip(), y1t()).add(tip(), y0t()).add(face(), y0t()).add(face(), lit(0));
          }
          return o.points.map(([px2, py]) => ({ x: round14(px2), y: round14(py) }));
        };
        const shelfBox = (id, side) => {
          const outline = shelfOutline(id, side);
          const x0 = side === "L" ? dim(`${id}.x0`, {}, () => 0, { formula: "0" }) : dim(`${id}.x0`, { x: ref("WARD_R_PANEL.x1"), tongue: ref("shelf.tongue.depth") }, (t) => t.x - t.tongue);
          const x1 = side === "L" ? dim(`${id}.x1`, { x: ref("WARD_L_PANEL.x0"), tongue: ref("shelf.tongue.depth") }, (t) => t.x + t.tongue) : dim(`${id}.x1`, { W: P.W }, (t) => t.W);
          const b = boardRect(id, `Wardrobe shelf \xB7 ${side === "L" ? "left" : "right"}`, "shelf", "XY", "Z", p.panelThickness, {
            x0,
            x1,
            y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
            y1: dim(`${id}.y1`, { D: P.D }, (t) => t.D),
            z0: same(`${id}.z0`, "shelf.z0"),
            z1: same(`${id}.z1`, "shelf.z1")
          });
          b.profileVector = outline;
          return b;
        };
        shelfBoards.push(shelfBox("WARD_L_SHELF", "L"), shelfBox("WARD_R_SHELF", "R"));
      }
      const t3Box = (id, side) => {
        const b = boardRect(id, `T3 \xB7 ${side === "L" ? "left" : "right"} wardrobe`, "top_panel", "XY", "Z", RULES.WARDROBE_T3_THICKNESS_MM.value, {
          x0: side === "L" ? dim(`${id}.x0`, {}, () => 0, { formula: "0" }) : same(`${id}.x0`, "wardrobeR.x0"),
          x1: side === "L" ? same(`${id}.x1`, "wardrobeL.x1") : dim(`${id}.x1`, { W: P.W }, (t) => t.W),
          y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
          y1: same(`${id}.y1`, "top.T3.y1"),
          z0: same(`${id}.z0`, "top.seat"),
          z1: same(`${id}.z1`, "top.T3.z1")
        });
        const o = new Outline(`${id}.pv`, ["x", "y"]);
        const X0 = ex({ x: ref(`${id}.x0`) }, (t) => t.x);
        const X1 = ex({ x: ref(`${id}.x1`) }, (t) => t.x);
        const XN = side === "L" ? ex({ x: ref(`WARD_L_PANEL.x0`) }, (t) => t.x) : ex({ x: ref(`WARD_R_PANEL.x1`) }, (t) => t.x);
        const Y0 = lit(0);
        const YT = ex({ y: ref("top.T3.tail.y1") }, (t) => t.y);
        const Y1 = ex({ y: ref("top.T3.y1") }, (t) => t.y);
        if (side === "L") o.add(X0, Y0).add(X1, Y0).add(X1, YT).add(XN, YT).add(XN, Y1).add(X0, Y1);
        else o.add(X0, Y0).add(X1, Y0).add(X1, Y1).add(XN, Y1).add(XN, YT).add(X0, YT);
        b.profileVector = o.points.map(([px2, py]) => ({ x: round14(px2), y: round14(py) }));
        return b;
      };
      const t3L = t3Box("WARD_L_T3", "L");
      const t3R = t3Box("WARD_R_T3", "R");
      const T2 = boardRect("T2", "Top rail \xB7 rear (T2)", "top_rail", "XZ", "Y", RULES.WARDROBE_T2_THICKNESS_MM.value, {
        x0: dim("T2.x0", {}, () => 0, { formula: "0" }),
        x1: dim("T2.x1", { W: P.W }, (t) => t.W),
        y0: same("T2.y0", "top.T2.y0"),
        y1: same("T2.y1", "top.T2.y1"),
        z0: same("T2.z0", "top.rail.z0"),
        z1: same("T2.z1", "top.roofAtT2")
      });
      T2.notes = ["top follows the roof: bevel from the height at the back to the roof at the front"];
      const T1 = boardRect("T1", "Top rail \xB7 front (T1)", "top_rail", "XZ", "Y", RULES.WARDROBE_T1_THICKNESS_MM.value, {
        x0: dim("T1.x0", {}, () => 0, { formula: "0" }),
        x1: dim("T1.x1", { W: P.W }, (t) => t.W),
        y0: same("T1.y0", "top.T1.y0"),
        y1: same("T1.y1", "top.T2.y0"),
        z0: same("T1.z0", "top.rail.z0"),
        z1: same("T1.z1", "top.T1.z1")
      });
      T1.notes = [`cut ${RULES.WARDROBE_T1_OVERSIZE_MM.value} above the roof \u2014 flat top, trim to the roof slope on site`];
      const frontBoards = [];
      {
        const CL = RULES.WARDROBE_DOOR_CLEARANCE_MM;
        if (shelfOn) {
          dim("front.split.z1", { fixedPanelTop: P.fixedPanelTop }, (t) => t.fixedPanelTop);
          dim("front.door.z0", { split: ref("front.split.z1"), CL }, (t) => t.split + t.CL);
        } else {
          same("front.door.z0", "nook.shelf.z0");
        }
        same("front.door.z1", "top.T3.z1");
        dim("front.y0", { DPT }, (t) => -t.DPT);
        dim("front.y1", {}, () => 0, { formula: "0" });
        const frontBox = (id, name, category, side, kind) => {
          const gap = kind === "door";
          const x0 = side === "L" ? gap ? dim(`${id}.x0`, { CL }, (t) => t.CL) : dim(`${id}.x0`, {}, () => 0, { formula: "0" }) : same(`${id}.x0`, "wardrobeR.x0");
          const x1 = side === "L" ? same(`${id}.x1`, "wardrobeL.x1") : gap ? dim(`${id}.x1`, { W: P.W, CL }, (t) => t.W - t.CL) : dim(`${id}.x1`, { W: P.W }, (t) => t.W);
          return boardRect(id, name, category, "XZ", "Y", DPT.value, {
            x0,
            x1,
            y0: same(`${id}.y0`, "front.y0"),
            y1: same(`${id}.y1`, "front.y1"),
            z0: same(`${id}.z0`, kind === "door" ? "front.door.z0" : "front.floor.z1"),
            z1: same(`${id}.z1`, kind === "door" ? "front.door.z1" : "front.split.z1")
          });
        };
        if (shelfOn) {
          frontBoards.push(
            frontBox("WARD_L_FIXED", "Wardrobe fixed panel \xB7 left", "front_panel", "L", "fixed"),
            frontBox("WARD_R_FIXED", "Wardrobe fixed panel \xB7 right", "front_panel", "R", "fixed")
          );
        }
        frontBoards.push(
          frontBox("WARD_L_DOOR", "Wardrobe door \xB7 left", "front_panel", "L", "door"),
          frontBox("WARD_R_DOOR", "Wardrobe door \xB7 right", "front_panel", "R", "door")
        );
      }
      const wardBoards = [stripL, stripR, panelL, panelR, ...shelfBoards, ...nookBoards, t3L, t3R, T2, T1, ...frontBoards];
      for (const b of wardBoards) b.role = b.category;
      stripL.zoneId = "wardrobeL";
      panelL.zoneId = "wardrobeL";
      t3L.zoneId = "wardrobeL";
      stripR.zoneId = "wardrobeR";
      panelR.zoneId = "wardrobeR";
      t3R.zoneId = "wardrobeR";
      for (const b of [...shelfBoards, ...nookBoards, ...frontBoards]) b.zoneId = b.id.includes("_L_") ? "wardrobeL" : "wardrobeR";
      T2.zoneId = "top";
      T1.zoneId = "top";
      const inZone = (list, side) => list.filter((b) => b.zoneId === (side === "L" ? "wardrobeL" : "wardrobeR")).map((b) => b.id);
      wardL.boards = ["WARD_L_STRIP", "WARD_L_PANEL", ...inZone(shelfBoards, "L"), ...inZone(nookBoards, "L"), "WARD_L_T3", ...inZone(frontBoards, "L")];
      wardR.boards = ["WARD_R_STRIP", "WARD_R_PANEL", ...inZone(shelfBoards, "R"), ...inZone(nookBoards, "R"), "WARD_R_T3", ...inZone(frontBoards, "R")];
      attachFaces(wardBoards);
      if (shelfOn) {
        const grooveY0 = ref("shelf.groove.y0").value;
        const grooveY1 = ref("shelf.groove.y1").value;
        const notchZ0 = ref("shelf.notch.z0").value;
        const notchZ1 = ref("shelf.notch.z1").value;
        const grooveDepth = ref("shelf.groove.depth").value;
        for (const [panel, faceId, shelfId] of [[panelL, "B", "WARD_L_SHELF"], [panelR, "A", "WARD_R_SHELF"]]) {
          const r = localRect(panel, { y: [grooveY0, grooveY1], z: [notchZ0, notchZ1] });
          addFeature(panel, faceId, {
            id: "GR_SHELF",
            kind: "groove",
            ...r,
            depth: round14(grooveDepth),
            through: false,
            for: shelfId,
            key: `${panel.id}.feat.SHELF`,
            source: "bedroom.wardrobeShelf"
          });
        }
      }
      for (const b of [panelL, panelR]) b.stock = { kind: "door", thickness: b.materialThickness, colour: p.doorColor };
      for (const b of [stripL, stripR, ...shelfBoards, ...nookBoards, t3L, t3R, T2, T1]) b.stock = { kind: "carcass", thickness: b.materialThickness, colour: p.carcassColor };
      for (const b of shelfBoards) annotate(b, "A", { semantic: "top", visible: true, finish: { colour: p.carcassColor } });
      for (const b of nookBoards) {
        b.source = "bedroom.nook";
        if (b.id.endsWith("_KICK")) {
          annotate(b, b.id.includes("_L_") ? "A" : "B", { semantic: "inside", visible: false });
          annotate(b, b.id.includes("_L_") ? "B" : "A", { semantic: "wall", visible: false });
        } else if (b.id.endsWith("_FLOOR")) {
          annotate(b, "A", { semantic: "top", visible: true, finish: { colour: p.carcassColor } });
          annotate(b, "B", { semantic: "bottom", visible: false });
        } else {
          annotate(b, "A", { semantic: "top", visible: false });
          annotate(b, "B", { semantic: "bottom", visible: true, finish: { colour: p.carcassColor } });
        }
      }
      annotate(stripL, "A", { semantic: "inside", visible: true, finish: { colour: p.carcassColor } });
      annotate(stripL, "B", { semantic: "wall", visible: false });
      annotate(stripR, "B", { semantic: "inside", visible: true, finish: { colour: p.carcassColor } });
      annotate(stripR, "A", { semantic: "wall", visible: false });
      annotate(panelL, "A", { semantic: "outside", visible: true, finish: { colour: p.doorColor } });
      annotate(panelL, "B", { semantic: "inside", visible: false });
      annotate(panelR, "B", { semantic: "outside", visible: true, finish: { colour: p.doorColor } });
      annotate(panelR, "A", { semantic: "inside", visible: false });
      for (const b of [t3L, t3R]) {
        annotate(b, "A", { semantic: "top", visible: false });
        annotate(b, "B", { semantic: "inside", visible: false });
      }
      annotate(T1, "B", { semantic: "front", visible: true, finish: { colour: p.carcassColor } });
      annotate(T1, "A", { semantic: "inside", visible: false });
      annotate(T2, "B", { semantic: "front", visible: false });
      annotate(T2, "A", { semantic: "back", visible: false });
      for (const b of frontBoards) {
        b.stock = { kind: "door", thickness: b.materialThickness, colour: p.doorColor };
        b.source = "bedroom.wardrobeFront";
        annotate(b, "A", { semantic: "inside", visible: false });
        annotate(b, "B", { semantic: "front", visible: true, finish: { colour: p.doorColor } });
      }
      {
        const fromEnd = RULES.WARDROBE_HINGE_FROM_END_MM;
        const fromSide = RULES.WARDROBE_HINGE_FROM_SIDE_MM;
        for (const door of frontBoards.filter((b) => b.id.endsWith("_DOOR"))) {
          const side = door.id.includes("_L_") ? "L" : "R";
          const w = dim(`${door.id}.width`, { x1: ref(`${door.id}.x1`), x0: ref(`${door.id}.x0`) }, (t) => t.x1 - t.x0);
          const h = dim(`${door.id}.height`, { z1: ref(`${door.id}.z1`), z0: ref(`${door.id}.z0`) }, (t) => t.z1 - t.z0);
          const uHinge = side === "L" ? dim(`${door.id}.feat.HINGE.u`, { fromSide }, (t) => t.fromSide) : dim(`${door.id}.feat.HINGE.u`, { w, fromSide }, (t) => t.w - t.fromSide);
          const vs = [
            dim(`${door.id}.feat.HINGE_0.v`, { fromEnd }, (t) => t.fromEnd),
            dim(`${door.id}.feat.HINGE_1.v`, { h }, (t) => t.h / 2),
            dim(`${door.id}.feat.HINGE_2.v`, { h, fromEnd }, (t) => t.h - t.fromEnd)
          ];
          const faceA = door.faces.find((f) => f.id === "A");
          vs.forEach((v, i) => {
            faceA.features.push({
              id: `${door.id}_HINGE_${i}`,
              kind: "hole",
              center: [round14(uHinge), round14(v)],
              diameter: RULES.WARDROBE_HINGE_DIAMETER_MM.value,
              depth: RULES.WARDROBE_HINGE_DEPTH_MM.value,
              through: false,
              for: "hinge",
              key: `${door.id}.feat.HINGE_${i}`,
              source: "bedroom.wardrobeFront"
            });
          });
        }
      }
      for (const [panel, t3, jointId, rails] of [
        [panelL, t3L, "WARD_L_T3_seat", true],
        [panelR, t3R, "WARD_R_T3_seat", true],
        [stripL, t3L, "WARD_L_T3_strip", false],
        [stripR, t3R, "WARD_R_T3_strip", false]
      ]) {
        const seatFaces = edgeFacesIn(panel, { u0: -EPS4, u1: lipY1 + EPS4, v0: seat - p.bootHeight - EPS4, v1: seat - p.bootHeight + EPS4 });
        for (const f of seatFaces) f.features.push({ id: `${panel.id}_SEAT`, kind: "notch", for: t3.id, key: `${panel.id}.pv`, source: "bedroom.wardrobeTop" });
        joints.push(joint(jointId, "butt", faceRef(t3.id, ["B"]), faceRef(panel.id, seatFaces), { hardware: [], rule: "wardrobe_t3_on_panel_seat_v1" }));
        if (!rails) continue;
        for (const rail of [T1, T2]) joints.push(joint(`${rail.id}_${t3.id}`, "face_contact", faceRef(t3.id, ["A"]), faceRef(rail.id, boundaryEdgeFaces(rail, "-Z")), { hardware: [], rule: "wardrobe_rail_on_t3_v1" }));
      }
      for (const b of nookBoards) {
        if (b.id.endsWith("_KICK")) continue;
        const side = b.id.includes("_L_") ? "L" : "R";
        const panel = side === "L" ? panelL : panelR;
        joints.push(joint(`${b.id}_panel`, "butt", faceRef(panel.id, [side === "L" ? "B" : "A"]), faceRef(b.id, boundaryEdgeFaces(b, side === "L" ? "+X" : "-X")), { hardware: [], rule: "nook_board_to_panel_v1" }));
        if (b.id.endsWith("_NOOK")) {
          const strip = side === "L" ? stripL : stripR;
          joints.push(joint(`${strip.id}_${b.id}`, "butt", faceRef(b.id, ["A"]), faceRef(strip.id, boundaryEdgeFaces(strip, "-Z")), { hardware: [], rule: "wall_strip_on_nook_shelf_v1" }));
        }
      }
      if (p.ledGroove) {
        const yTail = ref("top.T3.tail.y1").value;
        const yRear = ref("top.T3.y1").value;
        for (const [t3, side] of [[t3L, "L"], [t3R, "R"]]) {
          const xn = side === "L" ? panelL.x0 : panelR.x1;
          const fullDepth = (x0, x1) => side === "L" ? x1 <= xn + EPS4 : x0 >= xn - EPS4;
          const overPanel = (x0, x1) => side === "L" ? x0 >= xn - EPS4 : x1 <= xn + EPS4;
          addT3LedChannels(t3, {
            t1FrontKey: "top.T1.y0",
            rearAt: (x0, x1) => fullDepth(x0, x1) ? yRear : overPanel(x0, x1) ? yTail : null,
            source: "bedroom.led"
          }, warnings);
        }
        for (const b of nookBoards) if (b.id.endsWith("_NOOK")) addNookShelfLed(b, "bedroom.led", warnings);
      }
      boards.push(...wardBoards);
    }
  }
  let ohcInfo = null;
  if (!errors.length && top) {
    const ohc = buildBedroomOhc({
      ...p,
      roofAt: (y) => roofAt(profile, H, y),
      seat: top.seat,
      t3Top: top.t3Top,
      led: p.ledGroove ? { t1FrontKey: "top.T1.y0" } : null
    });
    boards.push(...ohc.boards);
    joints.push(...ohc.joints);
    warnings.push(...ohc.warnings);
    ohcInfo = ohc.info;
    const ohcZone = zones.find((z) => z.id === "ohc");
    if (ohcZone) ohcZone.boards = ohc.boards.map((b) => b.id);
  }
  const provenance = endProvenance();
  const layout = {
    openingWidth: round14(openingW),
    openingHeight: round14(openingH),
    roofMin,
    ohcHeight: round14(ohcH),
    bedFrameWidth: round14(bedW),
    bedMargin: round14(bedMargin),
    top,
    ohc: ohcInfo,
    front: !top || errors.length ? null : p.style === "style1" ? {
      style: "style1",
      floorTop: wardrobeFloorTop(p),
      fixedPanelTop: p.fixedPanelTop,
      doorBottom: round14(p.fixedPanelTop + RULES.WARDROBE_DOOR_CLEARANCE_MM.value),
      doorTop: top.t3Top,
      clearance: RULES.WARDROBE_DOOR_CLEARANCE_MM.value
    } : {
      style: "nook",
      floorTop: wardrobeFloorTop(p),
      nookShelfBottom: nookWardrobeBottom(p),
      doorBottom: nookWardrobeBottom(p),
      doorTop: top.t3Top,
      clearance: RULES.WARDROBE_DOOR_CLEARANCE_MM.value
    }
  };
  const grain = applyGrain(
    errors.length ? [] : boards,
    (b) => b.id === "WARD_L_PANEL" || b.id === "WARD_R_PANEL" ? "side" : b.stock?.kind === "door" ? "front" : null,
    raw,
    { front: "horizontal", side: "vertical" }
  );
  if (!errors.length) applyDoorSides(boards, { ...raw, carcassColorName: p.carcassColor });
  const milling = applyMilling(errors.length ? [] : boards);
  return {
    params: p,
    layout,
    grain,
    milling,
    zones: errors.length ? [] : zones,
    boards: errors.length ? [] : boards,
    joints: errors.length ? [] : joints,
    features: [],
    validation: { errors, warnings },
    debug: { boardFrame: "final", provenance }
  };
}
function P_cpt(cpt) {
  return param({ CPT: cpt }).CPT;
}
function boardRect(id, name, category, profilePlane, thicknessAxis, materialThickness, f) {
  return {
    id,
    name,
    category,
    boardType: "panel",
    materialThickness: round14(materialThickness),
    profilePlane,
    thicknessAxis,
    x0: round14(f.x0),
    x1: round14(f.x1),
    y0: round14(f.y0),
    y1: round14(f.y1),
    z0: round14(f.z0),
    z1: round14(f.z1),
    source: "bedroom"
  };
}
export {
  BED_FRAMES,
  LAYOUT_KEYS,
  RULES,
  WARDROBE_STYLES,
  bedBoxSizeFor,
  bedFrameWidth,
  equalOhcZones,
  generateBedroom,
  generateBedroomSvgPreview,
  layoutLimits,
  nookWardrobeBottom,
  normalizeOhcZones,
  roofAt,
  sectionYZ,
  setLayout,
  setOhcBoundary,
  t3TopOf,
  wardrobeFloorTop
};
