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
function defineRules(module, raw) {
  const out = {};
  for (const [name, r] of Object.entries(raw)) {
    out[name] = { __rule: true, module, name, value: Number(r.value), doc: String(r.doc ?? "") };
  }
  return out;
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
  WARDROBE_MIN_MM: { value: 150, doc: "Narrowest wardrobe. Same minimum as the north-south wardrobe." },
  OHC_BOTTOM_DEFAULT_MM: { value: 1418, doc: "Overhead door underside above the floor when the params give none. Bedroom 1 measures 1418 (doors 1418 \u2192 1738)." },
  OHC_ZONE_COUNT_DEFAULT: { value: 3, doc: "Up-flap bays across the overhead when the params give none. Bedroom 1 has three. Two or three are allowed." },
  OHC_ZONE_MIN_MM: { value: 150, doc: "Narrowest overhead bay, centreline to centreline. Same as the north-south overhead." },
  OPENING_HEIGHT_MIN_MM: { value: 500, doc: "Least clear height between the boot deck and the overhead underside. Same as the north-south bedroom." },
  OHC_HEIGHT_MIN_MM: { value: 150, doc: "Least overhead height under the roof at the body's room face. Same as the north-south bedroom." }
};

// generators/bedroomEast/rules.ts
var RULES2 = defineRules("bedroomEast", rules_default2);

// generators/bedroomEast/generator.ts
function round1(n) {
  return Math.round(n * 10) / 10;
}
var bodyY0 = () => RULES2.MATTRESS_DEPTH_MM.value - RULES2.BODY_DEPTH_MM.value;
function eastWardrobeMax(width) {
  return round1(Math.max(RULES2.WARDROBE_MIN_MM.value, width - RULES2.MATTRESS_QUEEN_LENGTH_MM.value));
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
  const mattressLen = dim("mattress.length", { W: Pm.W, x0: ref("wardrobe.x1") }, (t) => t.W - t.x0);
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
  const zones = [];
  if (!errors.length) {
    zones.push({ id: "boot", label: "Boot", kind: "solid", x0: 0, x1: W, y0, y1: D, z0: 0, z1: bootTop, roofTop: false, outlineYZ: box(y0, D, 0, bootTop) });
    zones.push({ id: "mattress", label: "Mattress", kind: "solid", x0: wardX1, x1: W, y0: 0, y1: y0, z0: 0, z1: bootTop, roofTop: false, outlineYZ: box(0, y0, 0, bootTop) });
    const region = (id, label, kind, x0, x1, z0, zTop = Infinity) => {
      const outline = sectionFrom(profile, H, y0, D, z0, zTop);
      if (!outline) {
        errors.push(`${label} has no room under the roof`);
        return;
      }
      zones.push({ id, label, kind, x0, x1, y0, y1: round1(Math.max(...outline.map((p) => p.y))), z0, z1: round1(Math.max(...outline.map((p) => p.z))), roofTop: zTop === Infinity, outlineYZ: outline });
    };
    region("wardrobe", "Wardrobe", "solid", 0, wardX1, bootTop);
    region("opening", "Opening", "void", wardX1, W, bootTop, ohcZ0);
    region("ohc", "Overhead", "solid", wardX1, W, ohcZ0);
  }
  let x = wardX1;
  const bayInfo = bays.map((b) => {
    const out = { id: b.id, width: b.width, x0: round1(x), x1: round1(x + b.width) };
    x += b.width;
    return out;
  });
  const provenance = endProvenance();
  return {
    params: { width: W, depth: D, height: H, wardrobeWidth: wardrobe, bootHeight: bootTop, bodyDepth: RULES2.BODY_DEPTH_MM.value, mattressDepth: D, mattressLength: round1(mattressLen), ohcBottom: ohcZ0, ohcZones: bays, roofProfile: profile },
    zones: errors.length ? [] : zones,
    boards: [],
    layout: { ohc: { bottom: ohcZ0, width: round1(opening), height: ohcH, zones: bayInfo } },
    validation: { errors, warnings },
    debug: { provenance }
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
