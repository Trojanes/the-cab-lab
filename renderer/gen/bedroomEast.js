// Generated from generators/bedroomEast/generator.ts - do not edit.

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
function isRule(v2) {
  return !!v2 && typeof v2 === "object" && v2.__rule === true;
}
function isParam(v2) {
  return !!v2 && typeof v2 === "object" && v2.__param === true;
}
function isRef(v2) {
  return !!v2 && typeof v2 === "object" && v2.__ref === true;
}
function val(t) {
  if (typeof t === "number") return t;
  return t.value;
}
function param(inputs) {
  const out = {};
  for (const [name, v2] of Object.entries(inputs)) {
    out[name] = { __param: true, name, value: Number(v2 ?? 0) };
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
function defineRules(module, raw) {
  const out = {};
  for (const [name, r] of Object.entries(raw)) {
    out[name] = { __rule: true, module, name, value: Number(r.value), doc: String(r.doc ?? "") };
  }
  return out;
}

// generators/_lib/finish.ts
var DEFAULT_DOOR_COLOUR = "Gloss White";
var DEFAULT_CARCASS_COLOUR = "White Stipple";
function doorColourOf(params) {
  const raw = params ? params.doorColorName || params.doorColor : "";
  return String(raw || "").trim() || DEFAULT_DOOR_COLOUR;
}
function doorColourBOf(params) {
  const raw = params ? params.doorColorNameB || params.doorColorB : "";
  const name = String(raw || "").trim();
  return name || doorColourOf(params);
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

// generators/_lib/milling.ts
var WORK = /* @__PURE__ */ new Set(["groove", "tgroove", "hole", "cutout"]);
var CARCASS = /stipple/i;
var EPS = 0.01;
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
  if (material(bottom) < material(top) - EPS) return "B";
  if (material(top) < material(bottom) - EPS) return "A";
  return null;
}
function colourFaceOf(b, A, B) {
  if (b.stock?.kind !== "door" || b.stock.sides === 2) return null;
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

// generators/bedroom/generator.ts
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

// generators/bedroomEast/rules.json
var rules_default2 = {
  MATTRESS_DEPTH_MM: { value: 1570, doc: "Queen mattress width, laid across the van. The east-west bedroom's depth from the nose; fixed. Bedroom 1 measures 1570." },
  MATTRESS_QUEEN_LENGTH_MM: { value: 1880, doc: "Queen mattress length. Below this the layout warns: the van is too narrow for a queen mattress across it. Bedroom 1: 2275 \u2212 395 = 1880." },
  BODY_DEPTH_MM: { value: 756, doc: "Boot and wardrobe depth from the nose. The mattress continues past this into the room. Bedroom 1 measures 756." },
  BOOT_HEIGHT_MM: { value: 418, doc: "Boot deck top above the floor. Bedroom 1 measures 400 \u2192 418." },
  BOOT_DECK_THICKNESS_MM: { value: 18, doc: "Boot deck stock, wall to wall. Bedroom 1 measures 18." },
  WARDROBE_MIN_MM: { value: 150, doc: "Narrowest wardrobe. Same minimum as the north-south wardrobe." },
  BED_SIDE_GAP_MM: { value: 65, doc: "From the wardrobe's outer face (and the bedside cabinet's) to the bed box's left face. Bedroom 1: 330 \u2192 395." },
  WARDROBE_FLOOR_RAISE_MM: { value: 197, doc: "Wardrobe floor top (the fixed panel's underside, the bedside cabinet's top) above the boot deck. Bedroom 1: 418 \u2192 615." },
  WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM: { value: 775, doc: "Top of the wardrobe's fixed panel above the floor. Bedroom 1 measures 775." },
  WARDROBE_SHELF_ABOVE_FLOOR_MM: { value: 10, doc: "Wardrobe shelf underside above the wardrobe floor. Bedroom 1: 615 \u2192 625." },
  WARDROBE_SHELF_STRIP_SETBACK_MM: { value: 75, doc: "From the body's room face, the shelf stays clear of the wall strip; past this it runs to the wall. Bedroom 1 measures 75." },
  WARDROBE_SHELF_STRIP_GAP_MM: { value: 0.5, doc: "Gap between the shelf and the wall strip's inner face over the setback. Bedroom 1: 15 \u2192 15.5." },
  WARDROBE_STRIP_NOTCH_LEAD_MM: { value: 1.5, doc: "The wall strip's shelf notch starts this far in front of the shelf's step. Bedroom 1: shelf step 889, notch 887.5." },
  WARDROBE_SHELF_TONGUE_MM: { value: 240, doc: "Length of the shelf tongue into the colour panel, centred on the body depth. Bedroom 1 measures 240." },
  WARDROBE_SHELF_TONGUE_TIP_MM: { value: 0.5, doc: "Shelf tongue stops this short of the colour panel's mid-thickness (16 / 2 \u2212 0.5 = 7.5)." },
  WARDROBE_SHELF_GROOVE_EXTRA_MM: { value: 0.5, doc: "Colour-panel groove is this much deeper than the tongue (8 in a 16 panel), not through." },
  WARDROBE_SHELF_GROOVE_END_MM: { value: 5, doc: "Groove runs this much past the tongue at each end (a cutter diameter over the pair)." },
  WARDROBE_SHELF_GROOVE_Z_MM: { value: 0.5, doc: "Groove and strip notch are this much taller than the shelf on each side." },
  WARDROBE_STRIP_DEPTH_MM: { value: 150, doc: "Wall strip depth from the body's room face. Bedroom 1 measures 150." },
  WARDROBE_T2_BACK_MM: { value: 65, doc: "From the body's room face to the back of T2. Bedroom 1 measures 65 (Style 3: 66)." },
  WARDROBE_T2_THICKNESS_MM: { value: 15, doc: "T2 (rear top rail) thickness. Its top is the roof at its front." },
  WARDROBE_T2_HEIGHT_MM: { value: 35, doc: "T2 height at its back to the roof there. Sets T3: T3 top = roof(T2 back) \u2212 this \u2212 T3 clearance." },
  WARDROBE_T1_THICKNESS_MM: { value: 16, doc: "T1 (front top rail, door stock) thickness, in front of T2." },
  WARDROBE_T1_OVERSIZE_MM: { value: 20, doc: "T1 is cut this much taller than the roof at its back; trimmed on site. Bedroom 1: roof 1777 \u2192 1797." },
  WARDROBE_T3_THICKNESS_MM: { value: 15, doc: "T3 thickness. One board wall to wall over the wardrobe and the overhead." },
  WARDROBE_T3_CLEARANCE_MM: { value: 1, doc: "Clearance between T3 top and the T1 / T2 undersides." },
  WARDROBE_T3_DEPTH_MM: { value: 205, doc: "T3 depth from the body's room face. Bedroom 1 measures 205." },
  WARDROBE_T3_LIP_MM: { value: 20, doc: "Pocket in the colour panel and the overhead uprights behind the T2 back that T3's tail slides into. Bedroom 1: 65 \u2192 85." },
  WARDROBE_T3_TAIL_CLEARANCE_MM: { value: 5, doc: "T3's notches run forward to the lip minus this. Bedroom 1: 85 \u2212 5 = 80." },
  T3_NOTCH_SIDE_CLEARANCE_MM: { value: 0.5, doc: "T3 notch stands this far clear of each face of a board rising through it. Bedroom 1 measures 0.5." },
  T3_NOTCH_WALL_CLEARANCE_MM: { value: 1, doc: "At a side wall the T3 notch is this much wider than the board, all on its open side. Bedroom 1: strip 0 \u2192 16, right end panel 2259 \u2192 2275." },
  LED_MAIN_FROM_FACE_MM: { value: 14, doc: "T3 top: the LED main channel's front wall this far behind the body's room face. Bedroom 1: 814 \u2192 828." },
  LED_MAIN_WIDTH_MM: { value: 14.5, doc: "LED main channel width, wall to wall across T3. Bedroom 1: 828 \u2192 842.5." },
  LED_DEPTH_MM: { value: 6.5, doc: "LED channel depth into T3's top. Bedroom 1: 1738 \u2192 1731.5." },
  LED_BRANCH_WIDTH_MM: { value: 20, doc: "LED branch channel width; a branch runs from the main channel to T3's rear edge." },
  LED_BRANCH_LEFT_MM: { value: 55.9, doc: "Left branch centre from T3's left end. Bedroom 1: 45.9 \u2192 65.9." },
  LED_BRANCH_RIGHT_MM: { value: 85.2, doc: "Right branch centre from T3's right end. Bedroom 1: 2179.8 \u2192 2199.8." },
  BED_BOX_GROOVE_END_MM: { value: 5, doc: "The left side's groove for the body rail's tongue runs this much past it at each end. Bedroom 1: 89 \u2192 329." },
  WARDROBE_DOOR_CLEARANCE_MM: { value: 4, doc: "Wall-side gap of the wardrobe door and the gap between the fixed panel and the door. Bedroom 1 measures 4." },
  WARDROBE_HINGE_DIAMETER_MM: { value: 35, doc: "Hinge cup diameter, wardrobe and overhead doors." },
  WARDROBE_HINGE_DEPTH_MM: { value: 12.5, doc: "Hinge cup depth. Bedroom 1 measures 12.5." },
  WARDROBE_HINGE_FROM_END_MM: { value: 100, doc: "Wardrobe cup centre from the door top and bottom; the third is midway." },
  WARDROBE_HINGE_FROM_SIDE_MM: { value: 22.5, doc: "Cup centre from the hinge edge." },
  WARDROBE_LOCK_WIDTH_MM: { value: 16, doc: "Wardrobe door lock slot, across; the ends are half circles of half this. Through. Bedroom 1: 275.3 \u2192 291.3, ends r 8." },
  WARDROBE_LOCK_LENGTH_MM: { value: 55, doc: "Wardrobe door lock slot, overall along the door height, round ends included. Bedroom 1: straight 1238.9 \u2192 1277.9, overall 1230.9 \u2192 1285.9." },
  WARDROBE_LOCK_FROM_EDGE_MM: { value: 46.7, doc: "Lock slot centre from the door's opening edge, at the door's mid height. Bedroom 1: 330 \u2212 283.3." },
  OHC_BOTTOM_DEFAULT_MM: { value: 1418, doc: "Overhead door underside above the floor when the params give none. Bedroom 1 measures 1418 (doors 1418 \u2192 1738)." },
  OHC_ZONE_COUNT_DEFAULT: { value: 3, doc: "Up-flap bays across the overhead when the params give none. Bedroom 1 has three. Two or three are allowed." },
  OHC_ZONE_MIN_MM: { value: 150, doc: "Narrowest overhead bay. Bays are measured from the wardrobe face and the right wall to the divider centrelines." },
  OPENING_HEIGHT_MIN_MM: { value: 500, doc: "Least clear height between the boot deck and the overhead underside. Same as the north-south bedroom." },
  OHC_HEIGHT_MIN_MM: { value: 150, doc: "Least overhead height under the roof at the body's room face. Same as the north-south bedroom." },
  OHC_DOOR_DROP_MM: { value: 30, doc: "Door underside is this far below the bottom panel. Bedroom 1: 1418 \u2192 1448." },
  OHC_BP_OVERSIZE_MM: { value: 18, doc: "Bottom panel runs this much past where the roof meets its top; trimmed on site. Bedroom 1: 1244 \u2192 1262." },
  OHC_TONGUE_MM: { value: 150, doc: "Upright tongue length into the bottom panel, centred on the upright's depth. Bedroom 1 measures 150." },
  OHC_GROOVE_CLEARANCE_MM: { value: 1, doc: "Bottom-panel groove is this much wider than the upright (\xB1 0.5)." },
  OHC_GROOVE_END_MM: { value: 5, doc: "Bottom-panel groove runs this much past the tongue at each end." },
  OHC_GROOVE_EXTRA_MM: { value: 0.5, doc: "Bottom-panel groove is this much deeper than the tongue (7 \u2192 7.5)." },
  OHC_FILLER_MM: { value: 115, doc: "Fixed door-stock panel at the right wall, beside the last door. Bedroom 1: 2160 \u2192 2275. Its carcass backing stops at the end panel." },
  OHC_DOOR_EDGE_GAP_MM: { value: 2, doc: "Gap at the outer edges of the door run: the wardrobe side and the filler. Bedroom 1 measures 2." },
  OHC_DOOR_GAP_MM: { value: 3.5, doc: "Gap between two doors, centred on the divider. Bedroom 1 measures 3 and 4; this splits the difference." },
  OHC_HINGE_FROM_TOP_MM: { value: 22.5, doc: "Up-flap cup centre down from the door top." },
  OHC_HINGE_FROM_SIDE_MM: { value: 100, doc: "Up-flap cup centre from each side edge of the door. Bedroom 1 measures 100." },
  BEDSIDE_DEPTH_MM: { value: 200, doc: "Bedside cabinet in front of the wardrobe, depth into the room. Bedroom 1 measures 200." },
  BEDSIDE_SHELF_CENTER_MM: { value: 415, doc: "Middle shelf centreline above the floor. Bedroom 1: 407.5 \u2192 422.5." },
  BEDSIDE_TONGUE_MM: { value: 90, doc: "Shelf tongue length through the sides, centred on the depth. Bedroom 1 measures 90." },
  BEDSIDE_SLOT_END_MM: { value: 5, doc: "Side slot runs this much past the tongue at each end." },
  BEDSIDE_SLOT_Z_MM: { value: 0.5, doc: "Side slot is this much taller than the shelf on each side; at the top and bottom edge the full 1 goes inward." },
  BEDSIDE_FRONT_CLEARANCE_MM: { value: 1.5, doc: "Gap at the sides and top of the fronts, and each side of the middle shelf centreline. Bedroom 1 measures 1.5." },
  BEDSIDE_FRONT_BOTTOM_CLEARANCE_MM: { value: 2.5, doc: "Gap under the lower front. Bedroom 1 measures 2.5." },
  BEDSIDE_LOCK_LENGTH_MM: { value: 54.5, doc: "Front lock slot, overall across, round ends included. Through. Bedroom 1: straight 145.8 \u2192 184.1, overall 137.7 \u2192 192.2." },
  BEDSIDE_LOCK_WIDTH_MM: { value: 16.2, doc: "Front lock slot, up; the ends are half circles of half this. Bedroom 1: 560.4 \u2192 576.6, ends r 8.1." },
  BEDSIDE_LOCK_FROM_TOP_MM: { value: 45, doc: "Lock slot centre below the front's top edge." },
  BEDSIDE_LOCK_FROM_EDGE_MM: { value: 90, doc: "Door lock slot centre from the opening edge. A drawer's slot is centred." },
  BEDSIDE_HINGE_FROM_TOP_MM: { value: 100, doc: "Lower door cup centre below its top. Bedroom 1 measures 100." },
  BEDSIDE_HINGE_FROM_BOTTOM_MM: { value: 120, doc: "Lower door cup centre above its bottom. Bedroom 1 measures 120." },
  BEDSIDE_HINGE_DEPTH_MM: { value: 12, doc: "Bedside hinge cup depth." },
  BED_BOX_THICKNESS_MM: { value: 18, doc: "Bed box stock. Bedroom 1 measures 18." },
  BED_BOX_CHAMFER_X_MM: { value: 232, doc: "Room-side left corner of the bed box is cut off: this far across from its left face. Bedroom 1: 395 \u2192 627 (38.9\xB0)." },
  BED_BOX_CHAMFER_Y_MM: { value: 187, doc: "\u2026and this far along its left face from the room end. Bedroom 1: 0 \u2192 187." },
  BED_BOX_RAIL_NOTCH_MM: { value: 90, doc: "Half-lap: a rail is notched this high from its bottom and its top where a side crosses it. Bedroom 1: 0 \u2192 90, 328 \u2192 400." },
  BED_BOX_SIDE_NOTCH_BOTTOM_MM: { value: 85, doc: "Half-lap: a side is notched from this height \u2026 Bedroom 1: 85 \u2192 333." },
  BED_BOX_SIDE_NOTCH_TOP_MM: { value: 333, doc: "\u2026 to this height where a rail crosses it." },
  BED_BOX_NOTCH_CLEARANCE_MM: { value: 1, doc: "A rail notch is this much wider than the side each way; a side notch is this much deeper than the rail." },
  BED_BOX_BODY_TONGUE_MM: { value: 230, doc: "Body rail's tongue into the left side, centred on the rail height. Bedroom 1: 94 \u2192 324, 9 deep." },
  BED_BOX_SIDE_RELIEF_MM: { value: 0.5, doc: "The left side's top rear corner steps back this much where it meets the boot front. Bedroom 1: from 295 up." },
  BED_BOX_SIDE_RELIEF_FROM_MM: { value: 295, doc: "Height the left side's rear relief starts." },
  BED_BOX_CHAMFER_RAIL_GAP_MM: { value: 0.8, doc: "Inner rail behind the chamfer panel stands this far off it. Bedroom 1 measures 0.8." },
  BED_BOX_CHAMFER_RAIL_END_MM: { value: 0.5, doc: "The chamfer rail's square ends stop this far short of the left side and the inner side." }
};

// generators/bedroomEast/rules.ts
var RULES2 = defineRules("bedroomEast", rules_default2);

// generators/bedroomEast/boards.ts
var EPS2 = 0.05;
var r1 = (v2) => Math.round(v2 * 10) / 10;
var v = (rule) => rule.value;
function board(id, name, category, plane, thick, x0, x1, y0, y1, z0, z1, pv) {
  const T = plane === "XY" ? "Z" : plane === "XZ" ? "Y" : "X";
  const b = {
    id,
    name,
    category,
    boardType: category,
    materialThickness: thick,
    profilePlane: plane,
    thicknessAxis: T,
    x0: r1(x0),
    x1: r1(x1),
    y0: r1(y0),
    y1: r1(y1),
    z0: r1(z0),
    z1: r1(z1),
    source: "bedroomEast"
  };
  if (pv) b.profileVector = pv.map((p) => Object.fromEntries(Object.entries(p).map(([k, n]) => [k, r1(n)])));
  return b;
}
function buildEastBoards(input) {
  const { W, H, profile, wardrobe: ww, bedX0, ohcBottom, cpt, dpt } = input;
  const warnings = [];
  const roof = (y) => roofAt(profile, H, y);
  const D = v(RULES2.MATTRESS_DEPTH_MM);
  const B0 = D - v(RULES2.BODY_DEPTH_MM);
  const BH = v(RULES2.BOOT_HEIGHT_MM);
  const deck = v(RULES2.BOOT_DECK_THICKNESS_MM);
  const roofBack = (yA, yB) => {
    const ys = [yB, ...profile.map(([y]) => y).filter((y) => y > yA + EPS2 && y < yB - EPS2).sort((a, b) => b - a), yA];
    return ys.map((y) => ({ y, z: roof(y) }));
  };
  const yWhereRoof = (z, lo2, hi2) => {
    if (roof(hi2) >= z) return hi2;
    let a = lo2;
    let b = hi2;
    for (let i = 0; i < 40; i += 1) {
      const m = (a + b) / 2;
      if (roof(m) > z) a = m;
      else b = m;
    }
    return (a + b) / 2;
  };
  const boards = [];
  const regions = { boot: [], wardrobe: [], bedside: [], bedbox: [], ohc: [] };
  const push = (region, b, stock) => {
    b.stock = { kind: stock === "door" ? "door" : "carcass", thickness: b.materialThickness, colour: stock === "door" ? input.doorColor : input.carcassColor };
    boards.push(b);
    regions[region].push(b.id);
    return b;
  };
  const deckZ0 = dim("BOOT_DECK.z0", { BH: RULES2.BOOT_HEIGHT_MM, deck: RULES2.BOOT_DECK_THICKNESS_MM }, (t2) => t2.BH - t2.deck);
  push("boot", board("BOOT_DECK", "Boot deck", "boot", "XY", deck, 0, W, B0, D, deckZ0, BH), "carcass");
  push("boot", board("BOOT_BACK", "Boot back", "boot", "XZ", cpt, 0, W, D - cpt, D, 0, deckZ0), "carcass");
  push("boot", board("BOOT_FRONT", "Boot front", "boot", "XZ", cpt, 0, W, B0, B0 + cpt, 0, deckZ0), "carcass");
  const t2Back = dim("top.T2.y1", { B0, back: RULES2.WARDROBE_T2_BACK_MM }, (t2) => t2.B0 + t2.back);
  const t2Front = dim("top.T2.y0", { back: ref("top.T2.y1"), t: RULES2.WARDROBE_T2_THICKNESS_MM }, (t2) => t2.back - t2.t);
  const t1Front = dim("top.T1.y0", { y: ref("top.T2.y0"), t: RULES2.WARDROBE_T1_THICKNESS_MM }, (t2) => t2.y - t2.t);
  const roofT2 = dim("top.roofAtT2", { y: ref("top.T2.y1") }, (t2) => r1(roof(t2.y)), { formula: "roof(T2.y1)" });
  const t3Top = dim("top.T3.z1", { roof: ref("top.roofAtT2"), h: RULES2.WARDROBE_T2_HEIGHT_MM, cl: RULES2.WARDROBE_T3_CLEARANCE_MM }, (t2) => t2.roof - t2.h - t2.cl);
  const seat = dim("top.seat", { top: ref("top.T3.z1"), t: RULES2.WARDROBE_T3_THICKNESS_MM }, (t2) => t2.top - t2.t);
  const rail0 = dim("top.rail.z0", { top: ref("top.T3.z1"), cl: RULES2.WARDROBE_T3_CLEARANCE_MM }, (t2) => t2.top + t2.cl);
  const lipY = dim("top.lip.y", { back: ref("top.T2.y1"), lip: RULES2.WARDROBE_T3_LIP_MM }, (t2) => t2.back + t2.lip);
  const tailY = dim("top.T3.tail", { lip: ref("top.lip.y"), cl: RULES2.WARDROBE_T3_TAIL_CLEARANCE_MM }, (t2) => t2.lip - t2.cl);
  const t3Rear = dim("top.T3.y1", { B0, d: RULES2.WARDROBE_T3_DEPTH_MM }, (t2) => t2.B0 + t2.d);
  const roofT1 = r1(roof(t2Front));
  push("wardrobe", board("T1", "T1 front top rail", "wardrobe_top", "XZ", v(RULES2.WARDROBE_T1_THICKNESS_MM), 0, W, t1Front, t2Front, rail0, roofT1 + v(RULES2.WARDROBE_T1_OVERSIZE_MM)), "door");
  push("wardrobe", board("T2", "T2 rear top rail", "wardrobe_top", "XZ", v(RULES2.WARDROBE_T2_THICKNESS_MM), 0, W, t2Front, t2Back, rail0, roofT1), "carcass");
  const topEdge = (yEnd) => [
    { y: B0, z: seat },
    { y: lipY, z: seat },
    { y: lipY, z: rail0 },
    { y: t2Back, z: rail0 },
    ...roofBack(t2Back, yEnd).reverse()
  ];
  const floorTop = dim("wardrobe.floor", { BH: RULES2.BOOT_HEIGHT_MM, raise: RULES2.WARDROBE_FLOOR_RAISE_MM }, (t2) => t2.BH + t2.raise);
  const shelfZ0 = dim("WARD_SHELF.z0", { floor: ref("wardrobe.floor"), up: RULES2.WARDROBE_SHELF_ABOVE_FLOOR_MM }, (t2) => t2.floor + t2.up);
  const shelfZ1 = r1(shelfZ0 + cpt);
  const panelX0 = r1(ww - dpt);
  const tongue = r1(dpt / 2 - v(RULES2.WARDROBE_SHELF_TONGUE_TIP_MM));
  const midY = (B0 + D) / 2;
  const tY0 = r1(midY - v(RULES2.WARDROBE_SHELF_TONGUE_MM) / 2);
  const tY1 = r1(midY + v(RULES2.WARDROBE_SHELF_TONGUE_MM) / 2);
  const gz = v(RULES2.WARDROBE_SHELF_GROOVE_Z_MM);
  const panel = push("wardrobe", board("WARD_PANEL", "Wardrobe colour panel", "side_panel", "YZ", dpt, panelX0, ww, B0, D, BH, r1(roof(t2Back)), [
    { y: B0, z: BH },
    { y: D, z: BH },
    ...roofBack(t2Back, D),
    { y: t2Back, z: rail0 },
    { y: lipY, z: rail0 },
    { y: lipY, z: seat },
    { y: B0, z: seat }
  ]), "door");
  const stripY1 = dim("WARD_STRIP.y1", { B0, d: RULES2.WARDROBE_STRIP_DEPTH_MM }, (t2) => t2.B0 + t2.d);
  const notchY0 = r1(B0 + v(RULES2.WARDROBE_SHELF_STRIP_SETBACK_MM) - v(RULES2.WARDROBE_STRIP_NOTCH_LEAD_MM));
  push("wardrobe", board("WARD_STRIP", "Wardrobe wall strip", "side_panel", "YZ", cpt, 0, cpt, B0, stripY1, BH, r1(roof(t2Back)), [
    { y: B0, z: BH },
    { y: stripY1, z: BH },
    { y: stripY1, z: shelfZ0 - gz },
    { y: notchY0, z: shelfZ0 - gz },
    { y: notchY0, z: shelfZ1 + gz },
    { y: stripY1, z: shelfZ1 + gz },
    ...roofBack(t2Back, stripY1),
    { y: t2Back, z: rail0 },
    { y: lipY, z: rail0 },
    { y: lipY, z: seat },
    { y: B0, z: seat }
  ]), "carcass");
  const shelfX0 = r1(cpt + v(RULES2.WARDROBE_SHELF_STRIP_GAP_MM));
  const setY = r1(B0 + v(RULES2.WARDROBE_SHELF_STRIP_SETBACK_MM));
  push("wardrobe", board("WARD_SHELF", "Wardrobe shelf", "shelf", "XY", cpt, 0, r1(panelX0 + tongue), B0, D, shelfZ0, shelfZ1, [
    { x: shelfX0, y: B0 },
    { x: shelfX0, y: setY },
    { x: 0, y: setY },
    { x: 0, y: D },
    { x: panelX0, y: D },
    { x: panelX0, y: tY1 },
    { x: panelX0 + tongue, y: tY1 },
    { x: panelX0 + tongue, y: tY0 },
    { x: panelX0, y: tY0 },
    { x: panelX0, y: B0 }
  ]), "carcass");
  const fixedTop = input.fixedPanelTop;
  push("wardrobe", board("WARD_FIXED_BACK", "Wardrobe fixed-panel backing", "carcass", "XZ", cpt, cpt, panelX0, B0, B0 + cpt, shelfZ1, fixedTop), "carcass");
  push("wardrobe", board("WARD_FIXED", "Wardrobe fixed panel", "front_panel", "XZ", dpt, 0, ww, B0 - dpt, B0, floorTop, fixedTop), "door");
  const doorX0 = v(RULES2.WARDROBE_DOOR_CLEARANCE_MM);
  const door = push("wardrobe", board("WARD_DOOR", "Wardrobe door", "front_panel", "XZ", dpt, doorX0, ww, B0 - dpt, B0, fixedTop + v(RULES2.WARDROBE_DOOR_CLEARANCE_MM), t3Top), "door");
  const cutters = [[0, cpt], [panelX0, ww]];
  const bpZ0 = dim("OHC_BP.z0", { bottom: ohcBottom, drop: RULES2.OHC_DOOR_DROP_MM }, (t2) => t2.bottom + t2.drop);
  const bpZ1 = r1(bpZ0 + cpt);
  const uprightBack = r1(yWhereRoof(bpZ1, B0, D));
  const bpBack = r1(Math.min(D, uprightBack + v(RULES2.OHC_BP_OVERSIZE_MM)));
  const bp = push("ohc", board("OHC_BP", "Overhead bottom panel", "bottom_panel", "XY", cpt, ww, W, B0, bpBack, bpZ0, bpZ1), "carcass");
  const tongueH = r1(cpt / 2 - 0.5);
  const uMid = (B0 + uprightBack) / 2;
  const uT0 = r1(uMid - v(RULES2.OHC_TONGUE_MM) / 2);
  const uT1 = r1(uMid + v(RULES2.OHC_TONGUE_MM) / 2);
  const bounds = [];
  let acc = ww;
  for (const bay of input.bays.slice(0, -1)) {
    acc += bay.width;
    bounds.push(r1(acc));
  }
  const uprights = [
    ["OHC_D0", ww, ww + cpt],
    ...bounds.map((c, i) => [`OHC_D${i + 1}`, c - cpt / 2, c + cpt / 2]),
    [`OHC_D${bounds.length + 1}`, W - cpt, W]
  ];
  for (const [id, x0, x1] of uprights) {
    push("ohc", board(id, id === "OHC_D0" ? "Overhead end panel (wardrobe side)" : x1 >= W - EPS2 ? "Overhead end panel (wall)" : "Overhead divider", "vertical_divider", "YZ", cpt, x0, x1, B0, uprightBack, bpZ1 - tongueH, r1(roof(t2Back)), [
      { y: uprightBack, z: bpZ1 },
      { y: uT1, z: bpZ1 },
      { y: uT1, z: bpZ1 - tongueH },
      { y: uT0, z: bpZ1 - tongueH },
      { y: uT0, z: bpZ1 },
      { y: B0, z: bpZ1 },
      ...topEdge(uprightBack)
    ]), "carcass");
    cutters.push([x0, x1]);
  }
  const fillerX0 = dim("OHC_FILLER.x0", { W, f: RULES2.OHC_FILLER_MM }, (t2) => t2.W - t2.f);
  push("ohc", board("OHC_FILLER_BACK", "Overhead filler backing", "carcass", "XZ", cpt, fillerX0, W - cpt, B0, B0 + cpt, bpZ1, seat), "carcass");
  push("ohc", board("OHC_FILLER", "Overhead filler panel", "front_panel", "XZ", dpt, fillerX0, W, B0 - dpt, B0, ohcBottom, t3Top), "door");
  const doors = [];
  const edges = [ww, ...bounds, fillerX0];
  for (let i = 0; i < edges.length - 1; i += 1) {
    const x0 = i === 0 ? edges[0] + v(RULES2.OHC_DOOR_EDGE_GAP_MM) : edges[i] + v(RULES2.OHC_DOOR_GAP_MM) / 2;
    const x1 = i === edges.length - 2 ? edges[i + 1] - v(RULES2.OHC_DOOR_EDGE_GAP_MM) : edges[i + 1] - v(RULES2.OHC_DOOR_GAP_MM) / 2;
    doors.push({ x0: r1(x0), x1: r1(x1) });
    push("ohc", board(`OHC_FP${i}`, `Overhead up flap ${i + 1}`, "front_panel", "XZ", dpt, x0, x1, B0 - dpt, B0, ohcBottom, t3Top), "door");
  }
  const side = v(RULES2.T3_NOTCH_SIDE_CLEARANCE_MM);
  const wallCl = v(RULES2.T3_NOTCH_WALL_CLEARANCE_MM);
  const iv = cutters.map(([a, b]) => a <= EPS2 ? [0, b + wallCl] : b >= W - EPS2 ? [a - wallCl, W] : [a - side, b + side]).sort((p, q) => p[0] - q[0]);
  const merged = [];
  for (const [a, b] of iv) {
    const last = merged[merged.length - 1];
    if (last && a <= last[1] + EPS2) last[1] = Math.max(last[1], b);
    else merged.push([a, b]);
  }
  const rear = [];
  const desc = merged.slice().reverse();
  let x = W;
  for (const [a, b] of desc) {
    if (b >= W - EPS2) rear.push({ x: W, y: tailY });
    else rear.push({ x, y: t3Rear }, { x: b, y: t3Rear }, { x: b, y: tailY });
    rear.push({ x: a, y: tailY });
    x = a;
    if (a > EPS2) rear.push({ x: a, y: t3Rear });
  }
  if (x > EPS2) rear.push({ x: 0, y: t3Rear });
  const t3pv = [{ x: 0, y: B0 }, { x: W, y: B0 }, ...rear];
  const dedup = t3pv.filter((p, i) => i === 0 || Math.abs(p.x - t3pv[i - 1].x) > EPS2 || Math.abs(p.y - t3pv[i - 1].y) > EPS2);
  push("wardrobe", board("T3", "T3 top panel", "wardrobe_top", "XY", v(RULES2.WARDROBE_T3_THICKNESS_MM), 0, W, B0, t3Rear, seat, t3Top, dedup), "carcass");
  const bsY0 = dim("bedside.y0", { B0, d: RULES2.BEDSIDE_DEPTH_MM }, (t2) => t2.B0 - t2.d);
  const bsH = floorTop;
  const bsSideX0 = r1(ww - dpt - cpt);
  const bsMid = (bsY0 + B0) / 2;
  const bsT0 = r1(bsMid - v(RULES2.BEDSIDE_TONGUE_MM) / 2);
  const bsT1 = r1(bsMid + v(RULES2.BEDSIDE_TONGUE_MM) / 2);
  const bsS0 = r1(bsT0 - v(RULES2.BEDSIDE_SLOT_END_MM));
  const bsS1 = r1(bsT1 + v(RULES2.BEDSIDE_SLOT_END_MM));
  const center = v(RULES2.BEDSIDE_SHELF_CENTER_MM);
  const sz = v(RULES2.BEDSIDE_SLOT_Z_MM);
  const sideOutline = [
    { y: bsS1, z: bsH - cpt - 2 * sz },
    { y: bsS1, z: bsH },
    { y: B0, z: bsH },
    { y: B0, z: 0 },
    { y: bsS1, z: 0 },
    { y: bsS1, z: cpt + 2 * sz },
    { y: bsS0, z: cpt + 2 * sz },
    { y: bsS0, z: 0 },
    { y: bsY0, z: 0 },
    { y: bsY0, z: bsH },
    { y: bsS0, z: bsH },
    { y: bsS0, z: bsH - cpt - 2 * sz }
  ];
  const bsSides = [
    push("bedside", board("BS_SIDE_WALL", "Bedside side (wall)", "side_panel", "YZ", cpt, 0, cpt, bsY0, B0, 0, bsH, sideOutline), "carcass"),
    push("bedside", board("BS_SIDE_BED", "Bedside side (bed)", "side_panel", "YZ", cpt, bsSideX0, bsSideX0 + cpt, bsY0, B0, 0, bsH, sideOutline), "carcass")
  ];
  push("bedside", board("BS_SHOW", "Bedside show panel", "side_panel", "YZ", dpt, ww - dpt, ww, bsY0, B0, 0, bsH), "door");
  const shelfPv = [
    { x: cpt, y: bsT1 },
    { x: cpt, y: B0 },
    { x: bsSideX0, y: B0 },
    { x: bsSideX0, y: bsT1 },
    { x: bsSideX0 + cpt, y: bsT1 },
    { x: bsSideX0 + cpt, y: bsT0 },
    { x: bsSideX0, y: bsT0 },
    { x: bsSideX0, y: bsY0 },
    { x: cpt, y: bsY0 },
    { x: cpt, y: bsT0 },
    { x: 0, y: bsT0 },
    { x: 0, y: bsT1 }
  ];
  push("bedside", board("BS_TOP", "Bedside top", "shelf", "XY", cpt, 0, bsSideX0 + cpt, bsY0, B0, bsH - cpt, bsH, shelfPv), "carcass");
  push("bedside", board("BS_MID", "Bedside middle shelf", "shelf", "XY", cpt, 0, bsSideX0 + cpt, bsY0, B0, center - cpt / 2, center + cpt / 2, shelfPv), "carcass");
  push("bedside", board("BS_BOT", "Bedside bottom", "shelf", "XY", cpt, 0, bsSideX0 + cpt, bsY0, B0, 0, cpt, shelfPv), "carcass");
  const fc = v(RULES2.BEDSIDE_FRONT_CLEARANCE_MM);
  const hi = push("bedside", board("BS_FRONT_HI", "Bedside drawer front", "front_panel", "XZ", dpt, fc, ww - fc, bsY0 - dpt, bsY0, center + fc, bsH - fc), "door");
  const lo = push("bedside", board("BS_FRONT_LO", "Bedside door", "front_panel", "XZ", dpt, fc, ww - fc, bsY0 - dpt, bsY0, v(RULES2.BEDSIDE_FRONT_BOTTOM_CLEARANCE_MM), center - fc), "door");
  const t = v(RULES2.BED_BOX_THICKNESS_MM);
  const railH = r1(BH - t);
  const cx = dim("BB_SIDE_IN.x0", { x0: ref("bed.x0"), c: RULES2.BED_BOX_CHAMFER_X_MM }, (q) => q.x0 + q.c);
  const cy = v(RULES2.BED_BOX_CHAMFER_Y_MM);
  const divC = r1((cx + t + W - t) / 2);
  const crossings = [[cx, cx + t], [divC - t / 2, divC + t / 2], [W - t, W]];
  const sNb = v(RULES2.BED_BOX_SIDE_NOTCH_BOTTOM_MM);
  const sNt = v(RULES2.BED_BOX_SIDE_NOTCH_TOP_MM);
  const lapZ = 5;
  const nc = v(RULES2.BED_BOX_NOTCH_CLEARANCE_MM);
  const railOutline = (xStart, tongueLen) => {
    const rb = r1(sNb + lapZ);
    const rt = r1(sNt - lapZ);
    const cr = crossings.map(([a, b]) => [Math.max(xStart, a - nc), Math.min(W, b + nc)]);
    const atLeft = (n0) => n0 <= xStart + EPS2;
    const atRight = (n1) => n1 >= W - EPS2;
    const pts = [];
    if (atLeft(cr[0][0])) pts.push({ x: xStart, z: rt }, { x: xStart, z: rb });
    else if (tongueLen > 0) {
      const tz0 = r1(BH / 2 - v(RULES2.BED_BOX_BODY_TONGUE_MM) / 2);
      const tz1 = r1(BH / 2 + v(RULES2.BED_BOX_BODY_TONGUE_MM) / 2);
      const xb = xStart + tongueLen;
      pts.push({ x: xb, z: railH }, { x: xb, z: tz1 }, { x: xStart, z: tz1 }, { x: xStart, z: tz0 }, { x: xb, z: tz0 }, { x: xb, z: 0 });
    } else pts.push({ x: xStart, z: railH }, { x: xStart, z: 0 });
    for (const [n0, n1] of cr) {
      if (!atLeft(n0)) pts.push({ x: n0, z: 0 }, { x: n0, z: rb });
      pts.push({ x: n1, z: rb });
      if (!atRight(n1)) pts.push({ x: n1, z: 0 });
    }
    if (!atRight(cr[cr.length - 1][1])) pts.push({ x: W, z: 0 }, { x: W, z: railH });
    for (const [n0, n1] of cr.slice().reverse()) {
      if (!atRight(n1)) pts.push({ x: n1, z: railH });
      pts.push({ x: n1, z: rt }, { x: n0, z: rt });
      if (!atLeft(n0)) pts.push({ x: n0, z: railH });
    }
    const out = [];
    for (const p of pts) {
      const last = out[out.length - 1];
      if (last && Math.abs(last.x - p.x) < EPS2 && Math.abs(last.z - p.z) < EPS2) continue;
      out.push(p);
    }
    const f = out[0];
    const l = out[out.length - 1];
    if (Math.abs(f.x - l.x) < EPS2 && Math.abs(f.z - l.z) < EPS2) out.pop();
    return out;
  };
  const sideOutlineBB = [
    { y: B0, z: sNt },
    { y: B0 - t - nc, z: sNt },
    { y: B0 - t - nc, z: sNb },
    { y: B0, z: sNb },
    { y: B0, z: 0 },
    { y: t, z: 0 },
    { y: t, z: sNb },
    { y: 2 * t + nc, z: sNb },
    { y: 2 * t + nc, z: sNt },
    { y: t, z: sNt },
    { y: t, z: BH },
    { y: B0, z: BH }
  ];
  const relief = v(RULES2.BED_BOX_SIDE_RELIEF_MM);
  const sideL = push("bedbox", board("BB_SIDE_L", "Bed box left side", "side_panel", "YZ", t, bedX0, bedX0 + t, cy, B0, 0, BH, [
    { y: B0, z: 0 },
    { y: cy, z: 0 },
    { y: cy, z: BH },
    { y: B0 - relief, z: BH },
    { y: B0 - relief, z: v(RULES2.BED_BOX_SIDE_RELIEF_FROM_MM) },
    { y: B0, z: v(RULES2.BED_BOX_SIDE_RELIEF_FROM_MM) }
  ]), "bed");
  push("bedbox", board("BB_BODY", "Bed box rail at the body", "rail", "XZ", t, bedX0 + t / 2, W, B0 - t, B0, 0, railH, railOutline(bedX0 + t / 2, t / 2)), "bed");
  push("bedbox", board("BB_END", "Bed box end panel", "end_panel", "XZ", t, cx, W, 0, t, 0, BH), "bed");
  push("bedbox", board("BB_END_IN", "Bed box rail at the end", "rail", "XZ", t, cx, W, t, 2 * t, 0, railH, railOutline(cx, 0)), "bed");
  push("bedbox", board("BB_SIDE_IN", "Bed box inner side", "side_panel", "YZ", t, cx, cx + t, t, B0, 0, BH, sideOutlineBB), "bed");
  push("bedbox", board("BB_DIVIDER", "Bed box divider", "divider", "YZ", t, divC - t / 2, divC + t / 2, t, B0, 0, BH, sideOutlineBB), "bed");
  push("bedbox", board("BB_SIDE_R", "Bed box right side", "side_panel", "YZ", t, W - t, W, t, B0, 0, BH, sideOutlineBB), "bed");
  const L = Math.hypot(cx - bedX0, cy);
  const ux = (cx - bedX0) / L;
  const uy = -cy / L;
  const nx = cy / L;
  const ny = (cx - bedX0) / L;
  const P = { x: bedX0, y: cy };
  const at = (off, s) => ({ x: P.x + nx * off + ux * s, y: P.y + ny * off + uy * s });
  const chamfer = [at(0, 0), at(0, L), at(t, L), at(t, 0)];
  const bbox = (pts) => [Math.min(...pts.map((p) => p.x)), Math.max(...pts.map((p) => p.x)), Math.min(...pts.map((p) => p.y)), Math.max(...pts.map((p) => p.y))];
  const [c0, c1, c2, c3] = bbox(chamfer);
  const chamferB = push("bedbox", board("BB_CHAMFER", "Bed box corner panel (38.9\xB0)", "end_panel", "XY", BH, c0, c1, c2, c3, 0, BH, chamfer), "bed");
  const g = v(RULES2.BED_BOX_CHAMFER_RAIL_GAP_MM);
  const e = v(RULES2.BED_BOX_CHAMFER_RAIL_END_MM);
  const s0 = (bedX0 + t + e - (P.x + nx * (t + g))) / ux;
  const s1 = (cx - e - (P.x + nx * (2 * t + g))) / ux;
  const railC = [at(t + g, s0), at(t + g, s1), at(2 * t + g, s1), at(2 * t + g, s0)];
  const [d0, d1, d2, d3] = bbox(railC);
  const chamferR = push("bedbox", board("BB_CHAMFER_IN", "Bed box corner rail", "rail", "XY", railH, d0, d1, d2, d3, 0, railH, railC), "bed");
  for (const b of [chamferB, chamferR]) {
    b.materialThickness = t;
    b.stock = { kind: "carcass", thickness: t, colour: input.carcassColor };
    b.notes = [`${t} mm board standing on edge at the corner angle; drawn in plan, its sheet is length \xD7 height`];
  }
  attachFaces(boards);
  const colour = input.doorColor;
  const lower = input.doorColorB || input.doorColor;
  for (const b of boards.filter((q) => q.category === "front_panel")) {
    const c = b.id.startsWith("BS_") ? lower : colour;
    if (b.stock?.kind === "door") b.stock = { ...b.stock, colour: c };
    annotate(b, "B", { semantic: "front", visible: true, finish: { colour: c } });
  }
  annotate(boards.find((q) => q.id === "WARD_PANEL"), "A", { semantic: "side", visible: true, finish: { colour } });
  const show = boards.find((q) => q.id === "BS_SHOW");
  if (show.stock?.kind === "door") show.stock = { ...show.stock, colour: lower };
  annotate(show, "A", { semantic: "side", visible: true, finish: { colour: lower } });
  annotate(boards.find((q) => q.id === "T1"), "B", { semantic: "front", visible: true, finish: { colour } });
  addFeature(panel, "B", { id: "WARD_PANEL_SHELF", kind: "groove", ...localRect(panel, { y: [tY0 - v(RULES2.WARDROBE_SHELF_GROOVE_END_MM), tY1 + v(RULES2.WARDROBE_SHELF_GROOVE_END_MM)], z: [shelfZ0 - gz, shelfZ1 + gz] }), depth: r1(tongue + v(RULES2.WARDROBE_SHELF_GROOVE_EXTRA_MM)), for: "WARD_SHELF", source: "bedroomEast" });
  const cup = (b, id, u, vv, dia2, depth) => addFeature(b, "A", { id, kind: "hole", center: [r1(u), r1(vv)], diameter: dia2, depth, for: "hinge", source: "bedroomEast" });
  const dh = door.z1 - door.z0;
  const hs = v(RULES2.WARDROBE_HINGE_FROM_SIDE_MM);
  const he = v(RULES2.WARDROBE_HINGE_FROM_END_MM);
  const dia = v(RULES2.WARDROBE_HINGE_DIAMETER_MM);
  const hd = v(RULES2.WARDROBE_HINGE_DEPTH_MM);
  cup(door, "WARD_DOOR_HINGE_1", hs, he, dia, hd);
  cup(door, "WARD_DOOR_HINGE_2", hs, dh / 2, dia, hd);
  cup(door, "WARD_DOOR_HINGE_3", hs, dh - he, dia, hd);
  const lock = (b, id, cu, cv, w, h) => addFeature(b, "A", { id, kind: "cutout", u0: r1(cu - w / 2), u1: r1(cu + w / 2), v0: r1(cv - h / 2), v1: r1(cv + h / 2), radius: r1(Math.min(w, h) / 2), through: true, for: "lock", source: "bedroomEast" });
  lock(door, "WARD_DOOR_LOCK", ww - v(RULES2.WARDROBE_LOCK_FROM_EDGE_MM) - door.x0, dh / 2, v(RULES2.WARDROBE_LOCK_WIDTH_MM), v(RULES2.WARDROBE_LOCK_LENGTH_MM));
  for (const fp of boards.filter((q) => q.id.startsWith("OHC_FP"))) {
    const w = fp.x1 - fp.x0;
    const hz = fp.z1 - fp.z0 - v(RULES2.OHC_HINGE_FROM_TOP_MM);
    cup(fp, `${fp.id}_HINGE_1`, v(RULES2.OHC_HINGE_FROM_SIDE_MM), hz, dia, hd);
    cup(fp, `${fp.id}_HINGE_2`, w - v(RULES2.OHC_HINGE_FROM_SIDE_MM), hz, dia, hd);
  }
  for (const [id, x0, x1] of uprights) {
    const gx0 = Math.max(bp.x0, x0 - v(RULES2.OHC_GROOVE_CLEARANCE_MM) / 2);
    const gx1 = Math.min(bp.x1, x1 + v(RULES2.OHC_GROOVE_CLEARANCE_MM) / 2);
    addFeature(bp, "A", { id: `OHC_BP_${id}`, kind: "groove", ...localRect(bp, { x: [gx0, gx1], y: [uT0 - v(RULES2.OHC_GROOVE_END_MM), uT1 + v(RULES2.OHC_GROOVE_END_MM)] }), depth: r1(tongueH + v(RULES2.OHC_GROOVE_EXTRA_MM)), for: id, source: "bedroomEast" });
  }
  if (input.led) {
    const t3 = boards.find((q) => q.id === "T3");
    const m0 = r1(B0 + v(RULES2.LED_MAIN_FROM_FACE_MM));
    const m1 = r1(m0 + v(RULES2.LED_MAIN_WIDTH_MM));
    const depth = v(RULES2.LED_DEPTH_MM);
    addFeature(t3, "A", { id: "T3_LED_MAIN", kind: "tgroove", ...localRect(t3, { x: [0, W], y: [m0, m1] }), depth, for: "led", source: "bedroomEast" });
    const bw = v(RULES2.LED_BRANCH_WIDTH_MM);
    for (const [id, c] of [["T3_LED_BRANCH_1", v(RULES2.LED_BRANCH_LEFT_MM)], ["T3_LED_BRANCH_2", W - v(RULES2.LED_BRANCH_RIGHT_MM)]]) {
      addFeature(t3, "A", { id, kind: "tgroove", ...localRect(t3, { x: [c - bw / 2, c + bw / 2], y: [m1, t3.y1] }), depth, for: "led", source: "bedroomEast" });
    }
  }
  for (const s of bsSides) {
    addFeature(s, "A", { id: `${s.id}_SLOT_MID`, kind: "cutout", ...localRect(s, { y: [bsS0, bsS1], z: [center - cpt / 2 - sz, center + cpt / 2 + sz] }), through: true, for: "BS_MID", source: "bedroomEast" });
  }
  const lw = v(RULES2.BEDSIDE_LOCK_LENGTH_MM);
  const lh = v(RULES2.BEDSIDE_LOCK_WIDTH_MM);
  const lt = v(RULES2.BEDSIDE_LOCK_FROM_TOP_MM);
  lock(hi, "BS_FRONT_HI_LOCK", (hi.x1 - hi.x0) / 2, hi.z1 - hi.z0 - lt, lw, lh);
  lock(lo, "BS_FRONT_LO_LOCK", lo.x1 - lo.x0 - v(RULES2.BEDSIDE_LOCK_FROM_EDGE_MM), lo.z1 - lo.z0 - lt, lw, lh);
  cup(lo, "BS_FRONT_LO_HINGE_1", hs, v(RULES2.BEDSIDE_HINGE_FROM_BOTTOM_MM), dia, v(RULES2.BEDSIDE_HINGE_DEPTH_MM));
  cup(lo, "BS_FRONT_LO_HINGE_2", hs, lo.z1 - lo.z0 - v(RULES2.BEDSIDE_HINGE_FROM_TOP_MM), dia, v(RULES2.BEDSIDE_HINGE_DEPTH_MM));
  const ge = v(RULES2.BED_BOX_GROOVE_END_MM);
  addFeature(sideL, "A", { id: "BB_SIDE_L_BODY", kind: "groove", ...localRect(sideL, { y: [B0 - t - nc, B0], z: [BH / 2 - v(RULES2.BED_BOX_BODY_TONGUE_MM) / 2 - ge, BH / 2 + v(RULES2.BED_BOX_BODY_TONGUE_MM) / 2 + ge] }), depth: r1(t / 2 + 0.5), for: "BB_BODY", source: "bedroomEast" });
  if (roof(D) <= BH + EPS2) warnings.push("the roof comes down to the boot deck at the nose");
  return { boards, regions, info: { t3Top, seat, uprightBack, doors }, warnings };
}

// generators/bedroomEast/generator.ts
function round1(n) {
  return Math.round(n * 10) / 10;
}
var bodyY0 = () => RULES2.MATTRESS_DEPTH_MM.value - RULES2.BODY_DEPTH_MM.value;
function eastWardrobeMax(width) {
  return round1(Math.max(RULES2.WARDROBE_MIN_MM.value, width - RULES2.MATTRESS_QUEEN_LENGTH_MM.value - RULES2.BED_SIDE_GAP_MM.value));
}
function wardrobeOf(raw) {
  const W = round1(raw.width || 0);
  return round1(Math.min(eastWardrobeMax(W), Math.max(RULES2.WARDROBE_MIN_MM.value, raw.wardrobeWidth ?? eastWardrobeMax(W))));
}
function profileOf(raw) {
  const H = round1(raw.height || 0);
  return raw.roofProfile && raw.roofProfile.length > 1 ? raw.roofProfile : [[0, H], [RULES2.MATTRESS_DEPTH_MM.value, H]];
}
function eastBays(raw, opening) {
  const count = raw && (raw.length === 2 || raw.length === 3) ? raw.length : RULES2.OHC_ZONE_COUNT_DEFAULT.value;
  const given = raw && raw.length === count ? raw : [];
  const sum = given.reduce((s, z) => s + (Number.isFinite(z.width) ? z.width : 0), 0);
  const total = round1(Math.max(0, opening));
  if (sum <= 0) {
    const each = round1(total / count);
    return Array.from({ length: count }, (_, i) => ({ id: `ohc-${i + 1}`, width: i === count - 1 ? round1(total - each * (count - 1)) : each }));
  }
  const out = given.map((z, i) => ({ id: z.id || `ohc-${i + 1}`, width: round1(z.width * total / sum) }));
  out[out.length - 1].width = round1(total - out.slice(0, -1).reduce((s, z) => s + z.width, 0));
  return out;
}
function eastEqualBays(raw, count) {
  return eastBays(Array.from({ length: count }, (_, i) => ({ id: `ohc-${i + 1}`, width: 1 })), round1(raw.width - wardrobeOf(raw)));
}
function eastSetBayBoundary(raw, index, x) {
  const x0 = wardrobeOf(raw);
  const bays = eastBays(raw.ohcZones, round1(raw.width - x0)).map((z) => ({ ...z }));
  const left = bays[index];
  const right = bays[index + 1];
  if (!left || !right) return null;
  const start = round1(x0 + bays.slice(0, index).reduce((s, z) => s + z.width, 0));
  const total = round1(left.width + right.width);
  const min = RULES2.OHC_ZONE_MIN_MM.value;
  const at = round1(Math.max(start + min, Math.min(start + total - min, x)));
  left.width = round1(at - start);
  right.width = round1(total - left.width);
  return bays;
}
function eastOhcBottomLimits(raw) {
  const H = round1(raw.height || 0);
  const roof = roofAt(profileOf(raw), H, bodyY0());
  return { min: round1(RULES2.BOOT_HEIGHT_MM.value + RULES2.OPENING_HEIGHT_MIN_MM.value), max: round1(roof - RULES2.OHC_HEIGHT_MIN_MM.value) };
}
function sectionFrom(profile, height, y0, y1, z0, zTop = Infinity) {
  const roof = (y) => roofAt(profile, height, y);
  const top = (y) => Math.min(zTop, roof(y));
  if (top(y0) <= z0 + 0.5) return null;
  const cross = (a, b, f) => {
    let lo = a;
    let hi = b;
    for (let k = 0; k < 30; k += 1) {
      const mid = (lo + hi) / 2;
      if (Math.sign(f(mid)) === Math.sign(f(lo))) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  };
  const breaks = [y0, ...profile.map(([y]) => y).filter((y) => y > y0 + 0.01 && y < y1 - 0.01), y1];
  const ys = [breaks[0]];
  for (let i = 1; i < breaks.length; i += 1) {
    const a = breaks[i - 1];
    const b = breaks[i];
    if (zTop < Infinity && (roof(a) - zTop) * (roof(b) - zTop) < 0) ys.push(cross(a, b, (y) => roof(y) - zTop));
    ys.push(b);
  }
  const pts = [];
  let end = y1;
  for (let i = 0; i < ys.length; i += 1) {
    const y = ys[i];
    if (top(y) > z0 + 0.5) {
      pts.push({ y: round1(y), z: round1(top(y)) });
      continue;
    }
    end = round1(cross(ys[i - 1], y, (q) => top(q) - z0));
    break;
  }
  return [{ y: y0, z: z0 }, { y: end, z: z0 }, ...pts.slice().reverse(), { y: y0, z: z0 }];
}
function box(y0, y1, z0, z1) {
  return [{ y: y0, z: z0 }, { y: y1, z: z0 }, { y: y1, z: z1 }, { y: y0, z: z1 }, { y: y0, z: z0 }];
}
function generateBedroomEast(raw) {
  const errors = [];
  const warnings = [];
  const W = round1(raw.width || 0);
  const H = round1(raw.height || 0);
  const D = RULES2.MATTRESS_DEPTH_MM.value;
  const profile = profileOf(raw);
  const wardrobe = wardrobeOf(raw);
  const ohcBottom = round1(raw.ohcBottom ?? RULES2.OHC_BOTTOM_DEFAULT_MM.value);
  beginProvenance();
  const Pm = param({ W, H, wardrobeWidth: wardrobe, ohcBottom });
  const y0 = dim("body.y0", { D: RULES2.MATTRESS_DEPTH_MM, body: RULES2.BODY_DEPTH_MM }, (t) => t.D - t.body);
  const bootTop = dim("boot.z1", { boot: RULES2.BOOT_HEIGHT_MM }, (t) => t.boot);
  const wardX1 = dim("wardrobe.x1", { wardrobeWidth: Pm.wardrobeWidth }, (t) => t.wardrobeWidth);
  const bedX0 = dim("bed.x0", { x: ref("wardrobe.x1"), gap: RULES2.BED_SIDE_GAP_MM }, (t) => t.x + t.gap);
  const mattressLen = dim("mattress.length", { W: Pm.W, x0: ref("bed.x0") }, (t) => t.W - t.x0);
  dim("mattress.y1", { D: RULES2.MATTRESS_DEPTH_MM }, (t) => t.D);
  const ohcZ0 = dim("ohc.z0", { ohcBottom: Pm.ohcBottom }, (t) => t.ohcBottom);
  const opening = dim("ohc.width", { W: Pm.W, x0: ref("wardrobe.x1") }, (t) => t.W - t.x0);
  const openingH = dim("layout.openingHeight", { top: ref("ohc.z0"), bottom: ref("boot.z1") }, (t) => t.top - t.bottom);
  const roofAtFace = round1(roofAt(profile, H, y0));
  const ohcH = round1(roofAtFace - ohcZ0);
  if (W < RULES2.WARDROBE_MIN_MM.value + 1) errors.push(`width ${W} has no room for a wardrobe and a mattress`);
  if (mattressLen < RULES2.MATTRESS_QUEEN_LENGTH_MM.value - 0.05) {
    warnings.push(`the mattress is only ${round1(mattressLen)} mm long \u2014 a queen mattress needs ${RULES2.MATTRESS_QUEEN_LENGTH_MM.value}`);
  }
  if (openingH < RULES2.OPENING_HEIGHT_MIN_MM.value) errors.push(`only ${round1(openingH)} mm between the boot deck and the overhead (min ${RULES2.OPENING_HEIGHT_MIN_MM.value})`);
  if (ohcH < RULES2.OHC_HEIGHT_MIN_MM.value) errors.push(`overhead is only ${ohcH} mm high at the body's room face (min ${RULES2.OHC_HEIGHT_MIN_MM.value})`);
  const bays = eastBays(raw.ohcZones, opening);
  for (const b of bays) {
    if (b.width < RULES2.OHC_ZONE_MIN_MM.value - 0.05) errors.push(`overhead bay ${b.width} is narrower than ${RULES2.OHC_ZONE_MIN_MM.value} mm`);
  }
  const cpt = round1(raw.panelThickness ?? 15);
  const dpt = round1(raw.doorPanelThickness ?? 16);
  const fixedPanelTop = round1(raw.fixedPanelTop ?? RULES2.WARDROBE_FIXED_PANEL_TOP_DEFAULT_MM.value);
  const floorTop = round1(bootTop + RULES2.WARDROBE_FLOOR_RAISE_MM.value);
  const carcassColor = carcassColourOf(raw);
  const doorColor = doorColourOf(raw);
  const doorColorB = doorColourBOf(raw);
  const zones = [];
  let boards = [];
  let milling = { issues: [] };
  let top = null;
  if (!errors.length) {
    const built = buildEastBoards({ W, H, profile, wardrobe, bedX0, ohcBottom: ohcZ0, bays, fixedPanelTop, cpt, dpt, carcassColor, doorColor, doorColorB, led: raw.ledGroove !== false });
    boards = built.boards;
    top = built.info;
    warnings.push(...built.warnings);
    const bsY0 = round1(y0 - RULES2.BEDSIDE_DEPTH_MM.value);
    zones.push({ id: "boot", label: "Boot", kind: "solid", x0: 0, x1: W, y0, y1: D, z0: 0, z1: bootTop, roofTop: false, outlineYZ: box(y0, D, 0, bootTop), boards: built.regions.boot });
    zones.push({ id: "bedbox", label: "Bed box", kind: "solid", x0: bedX0, x1: W, y0: 0, y1: y0, z0: 0, z1: bootTop, roofTop: false, outlineYZ: box(0, y0, 0, bootTop), boards: built.regions.bedbox });
    zones.push({ id: "bedside", label: "Bedside cabinet", kind: "solid", x0: 0, x1: wardX1, y0: bsY0, y1: y0, z0: 0, z1: floorTop, roofTop: false, outlineYZ: box(bsY0, y0, 0, floorTop), boards: built.regions.bedside });
    const region = (id, label, kind, x0, x1, z0, zTop = Infinity, ids) => {
      const outline = sectionFrom(profile, H, y0, D, z0, zTop);
      if (!outline) {
        errors.push(`${label} has no room under the roof`);
        return;
      }
      zones.push({ id, label, kind, x0, x1, y0, y1: round1(Math.max(...outline.map((p) => p.y))), z0, z1: round1(Math.max(...outline.map((p) => p.z))), roofTop: zTop === Infinity, outlineYZ: outline, ...ids ? { boards: ids } : {} });
    };
    region("wardrobe", "Wardrobe", "solid", 0, wardX1, bootTop, Infinity, built.regions.wardrobe);
    region("opening", "Opening", "void", wardX1, W, bootTop, ohcZ0);
    region("ohc", "Overhead", "solid", wardX1, W, ohcZ0, Infinity, built.regions.ohc);
    applyDoorSides(boards, raw);
    milling = applyMilling(boards);
  }
  let x = wardX1;
  const bayInfo = bays.map((b) => {
    const out = { id: b.id, width: b.width, x0: round1(x), x1: round1(x + b.width) };
    x += b.width;
    return out;
  });
  const provenance = endProvenance();
  return {
    params: { width: W, depth: D, height: H, wardrobeWidth: wardrobe, bedX0, bootHeight: bootTop, bodyDepth: RULES2.BODY_DEPTH_MM.value, mattressDepth: D, mattressLength: round1(mattressLen), ohcBottom: ohcZ0, ohcZones: bays, fixedPanelTop, roofProfile: profile, panelThickness: cpt, doorPanelThickness: dpt },
    zones: errors.length ? [] : zones,
    boards: errors.length ? [] : boards,
    joints: [],
    layout: { ohc: { bottom: ohcZ0, width: round1(opening), height: ohcH, zones: bayInfo }, top },
    milling,
    validation: { errors, warnings },
    debug: { boardFrame: "final", provenance }
  };
}
export {
  RULES2 as RULES,
  eastBays,
  eastEqualBays,
  eastOhcBottomLimits,
  eastSetBayBoundary,
  eastWardrobeMax,
  generateBedroomEast
};
