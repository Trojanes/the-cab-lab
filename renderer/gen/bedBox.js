// Generated from generators/bedBox/generator.ts - do not edit.

// generators/bedBox/rules.json
var rules_default = {
  BOARD_THICKNESS_MM: { value: 18, doc: "Every bed box board \u2014 side panels, end panel, centre divider, rails \u2014 is 18 mm structural stock. Style 3 measures 18 throughout." },
  LENGTH_DEFAULT_MM: { value: 979, doc: "Outer length of the bed box from the body's room face to the end panel's outer face when the params give none. Style 3: side panels 961 + end panel 18. Set by hand until mattress presets exist." },
  RAIL_HEIGHT_MM: { value: 100, doc: "Height of every rail (long and short). One rail sits on the floor, one is flush with the top of the box." },
  RAIL_NOTCH_DEPTH_MM: { value: 20, doc: "Depth of the notch in each short rail where the centre divider passes: cut from the top edge of the low rail, from the bottom edge of the high rail." },
  RAIL_NOTCH_CLEARANCE_MM: { value: 2, doc: "The short-rail notch is the divider thickness plus this (18 + 2 = 20 wide)." },
  DIVIDER_NOTCH_DEPTH_MM: { value: 19, doc: "How far the centre divider's end notches run in from each end: the short rail's 18 plus 1 mm of room." },
  DIVIDER_NOTCH_UNDERCUT_MM: { value: 15, doc: "The divider's end notch is the rail height minus this (100 \u2212 15 = 85 high), so the half-lap with the 20 mm rail notch leaves 5 mm vertical clearance." },
  REAR_RAIL_GAP_MM: { value: 1, doc: "The short rails at the body end stand this far clear of the body's room face (the boot's room-face upright)." },
  END_PANEL_OVERSIZE_MM: { value: 1, doc: "The end panel is cut this much wider than the box on each side \u2014 edge-banding / trimming allowance." }
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

// generators/bedBox/rules.ts
var RULES = defineRules("bedBox", rules_default);

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
function joint(id, kind, a, b, extra = {}) {
  return { id, kind, a, b, ...extra };
}
function faceRef(board2, faces) {
  return { board: board2, faces: faces.map((f) => typeof f === "string" ? f : f.id) };
}

// generators/bedBox/generator.ts
var BED_BOX_DEFAULT_HEIGHT = 398;
var BED_BOX_MIN = { width: 300, depth: 300, height: 100 };
var DEFAULT_COLOR = "White Stipple";
var EPS = 1e-6;
function round1(v) {
  return Math.round(v * 10) / 10;
}
function asNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function minLength(t = RULES.BOARD_THICKNESS_MM.value) {
  return round1(t + t + t + RULES.REAR_RAIL_GAP_MM.value + 2 * RULES.DIVIDER_NOTCH_DEPTH_MM.value);
}
function minHeight() {
  return round1(2 * RULES.RAIL_HEIGHT_MM.value + 2 * RULES.DIVIDER_NOTCH_UNDERCUT_MM.value);
}
function generateBedBox(raw) {
  const errors = [];
  const warnings = [];
  const W = round1(asNum(raw.width, 0));
  const D = round1(asNum(raw.depth, RULES.LENGTH_DEFAULT_MM.value));
  const H = round1(asNum(raw.height, BED_BOX_DEFAULT_HEIGHT));
  const t = round1(asNum(raw.panelThickness, RULES.BOARD_THICKNESS_MM.value));
  const fpt = round1(asNum(raw.frontPanelThickness, 0));
  const color = String(raw.carcassColor || DEFAULT_COLOR);
  if (W < BED_BOX_MIN.width) errors.push(`width must be at least ${BED_BOX_MIN.width} mm`);
  if (D < Math.max(BED_BOX_MIN.depth, minLength(t))) errors.push(`length must be at least ${Math.max(BED_BOX_MIN.depth, minLength(t))} mm`);
  if (H < Math.max(BED_BOX_MIN.height, minHeight())) errors.push(`height must be at least ${Math.max(BED_BOX_MIN.height, minHeight())} mm for two rails and the divider tongue`);
  if (t <= 0) errors.push("panelThickness must be positive");
  if (W < 6 * t + 2 * (t + RULES.RAIL_NOTCH_CLEARANCE_MM.value)) errors.push("width leaves no room for the rails beside the divider");
  if (!errors.length && D < 1800) warnings.push(`bed length ${D} mm is shorter than a standard mattress`);
  beginProvenance();
  const P = param({ W, D, H, T: t });
  const boards = [];
  const joints = [];
  if (!errors.length) {
    const RH = RULES.RAIL_HEIGHT_MM;
    const K = (b, f) => `${b}.${f}`;
    const face = (b, f, terms, fn, formula) => dim(K(b, f), terms, fn, formula ? { formula } : {});
    const zero = (b, f) => dim(K(b, f), {}, () => 0, { formula: "0" });
    const END = board("END", "End panel", "end_panel", "XZ", "Y", t, {
      x0: face("END", "x0", { OVER: RULES.END_PANEL_OVERSIZE_MM }, (v) => -v.OVER),
      x1: face("END", "x1", { W: P.W, OVER: RULES.END_PANEL_OVERSIZE_MM }, (v) => v.W + v.OVER),
      y0: zero("END", "y0"),
      y1: face("END", "y1", { T: P.T }, (v) => v.T),
      z0: zero("END", "z0"),
      z1: face("END", "z1", { H: P.H }, (v) => v.H)
    });
    const SIDE_L = board("SIDE_L", "Side panel \xB7 left", "side_panel", "YZ", "X", t, {
      x0: zero("SIDE_L", "x0"),
      x1: face("SIDE_L", "x1", { T: P.T }, (v) => v.T),
      y0: same("SIDE_L.y0", "END.y1"),
      y1: face("SIDE_L", "y1", { D: P.D }, (v) => v.D),
      z0: zero("SIDE_L", "z0"),
      z1: face("SIDE_L", "z1", { H: P.H }, (v) => v.H)
    });
    const SIDE_R = board("SIDE_R", "Side panel \xB7 right", "side_panel", "YZ", "X", t, {
      x0: face("SIDE_R", "x0", { W: P.W, T: P.T }, (v) => v.W - v.T),
      x1: face("SIDE_R", "x1", { W: P.W }, (v) => v.W),
      y0: same("SIDE_R.y0", "END.y1"),
      y1: face("SIDE_R", "y1", { D: P.D }, (v) => v.D),
      z0: zero("SIDE_R", "z0"),
      z1: face("SIDE_R", "z1", { H: P.H }, (v) => v.H)
    });
    const DIVIDER = board("DIVIDER", "Centre divider", "divider", "YZ", "X", t, {
      x0: face("DIVIDER", "x0", { W: P.W, T: P.T }, (v) => (v.W - v.T) / 2),
      x1: face("DIVIDER", "x1", { x0: ref("DIVIDER.x0"), T: P.T }, (v) => v.x0 + v.T),
      y0: same("DIVIDER.y0", "END.y1"),
      y1: face("DIVIDER", "y1", { D: P.D }, (v) => v.D),
      z0: zero("DIVIDER", "z0"),
      z1: face("DIVIDER", "z1", { H: P.H }, (v) => v.H)
    });
    const divLen = dim("DIVIDER.len", { y1: ref("DIVIDER.y1"), y0: ref("DIVIDER.y0") }, (v) => v.y1 - v.y0);
    const notchH = dim("DIVIDER.notchH", { RH, UNDER: RULES.DIVIDER_NOTCH_UNDERCUT_MM }, (v) => v.RH - v.UNDER);
    {
      const ND2 = RULES.DIVIDER_NOTCH_DEPTH_MM;
      const L2 = ref("DIVIDER.len");
      const NH = ref("DIVIDER.notchH");
      const o = new Outline("DIVIDER.cut", ["y", "z"]);
      const y = {
        nd: ex({ ND: ND2 }, (v) => v.ND),
        lnd: ex({ L: L2, ND: ND2 }, (v) => v.L - v.ND),
        l: ex({ L: L2 }, (v) => v.L),
        zero: lit(0)
      };
      const z = {
        zero: lit(0),
        nh: ex({ NH }, (v) => v.NH),
        hnh: ex({ H: P.H, NH }, (v) => v.H - v.NH),
        h: ex({ H: P.H }, (v) => v.H)
      };
      o.add(y.nd, z.zero).add(y.lnd, z.zero).add(y.lnd, z.nh).add(y.l, z.nh).add(y.l, z.hnh).add(y.lnd, z.hnh).add(y.lnd, z.h).add(y.nd, z.h).add(y.nd, z.hnh).add(y.zero, z.hnh).add(y.zero, z.nh).add(y.nd, z.nh);
      DIVIDER.cutProfileVector = o.points.map(([py, pz]) => ({ y: round1(py), z: round1(pz) }));
    }
    const railZ = (id, high) => high ? { z1: face(id, "z1", { H: P.H }, (v) => v.H), z0: face(id, "z0", { z1: ref(K(id, "z1")), RH }, (v) => v.z1 - v.RH) } : { z0: zero(id, "z0"), z1: face(id, "z1", { RH }, (v) => v.RH) };
    const shortRail = (id, name, atEnd, high) => {
      const zz = railZ(id, high);
      const b = board(id, name, "short_rail", "XZ", "Y", t, {
        x0: same(K(id, "x0"), "SIDE_L.x1"),
        x1: same(K(id, "x1"), "SIDE_R.x0"),
        ...atEnd ? { y0: same(K(id, "y0"), "END.y1"), y1: face(id, "y1", { y0: ref(K(id, "y0")), T: P.T }, (v) => v.y0 + v.T) } : { y1: face(id, "y1", { D: P.D, GAP: RULES.REAR_RAIL_GAP_MM }, (v) => v.D - v.GAP), y0: face(id, "y0", { y1: ref(K(id, "y1")), T: P.T }, (v) => v.y1 - v.T) },
        z0: zz.z0,
        z1: zz.z1
      });
      const NW = dim(K(id, "notchW"), { T: P.T, CL: RULES.RAIL_NOTCH_CLEARANCE_MM }, (v) => v.T + v.CL);
      const nx0 = dim(K(id, "notch.x0"), { x0: ref("DIVIDER.x0"), x1: ref("DIVIDER.x1"), NW: ref(K(id, "notchW")) }, (v) => (v.x0 + v.x1) / 2 - v.NW / 2);
      const nx1 = dim(K(id, "notch.x1"), { nx0: ref(K(id, "notch.x0")), NW: ref(K(id, "notchW")) }, (v) => v.nx0 + v.NW);
      const o = new Outline(`${id}.pv`, ["x", "z"]);
      const X = { l: ex({ x: ref(K(id, "x0")) }, (v) => v.x), r: ex({ x: ref(K(id, "x1")) }, (v) => v.x), n0: ex({ x: ref(K(id, "notch.x0")) }, (v) => v.x), n1: ex({ x: ref(K(id, "notch.x1")) }, (v) => v.x) };
      const Z = {
        bot: ex({ z: ref(K(id, "z0")) }, (v) => v.z),
        top: ex({ z: ref(K(id, "z1")) }, (v) => v.z),
        topN: ex({ z: ref(K(id, "z1")), ND: RULES.RAIL_NOTCH_DEPTH_MM }, (v) => v.z - v.ND),
        botN: ex({ z: ref(K(id, "z0")), ND: RULES.RAIL_NOTCH_DEPTH_MM }, (v) => v.z + v.ND)
      };
      if (high) o.add(X.l, Z.bot).add(X.n0, Z.bot).add(X.n0, Z.botN).add(X.n1, Z.botN).add(X.n1, Z.bot).add(X.r, Z.bot).add(X.r, Z.top).add(X.l, Z.top);
      else o.add(X.l, Z.bot).add(X.r, Z.bot).add(X.r, Z.top).add(X.n1, Z.top).add(X.n1, Z.topN).add(X.n0, Z.topN).add(X.n0, Z.top).add(X.l, Z.top);
      b.profileVector = o.points.map(([px, pz]) => ({ x: round1(px), z: round1(pz) }));
      b.notes = [`notch ${round1(NW)} wide \xD7 ${RULES.RAIL_NOTCH_DEPTH_MM.value} deep at x ${round1(nx0)}\u2013${round1(nx1)} for the divider`];
      railNotch.set(id, { x0: round1(nx0), x1: round1(nx1) });
      return b;
    };
    const railNotch = /* @__PURE__ */ new Map();
    const RAIL_END_LOW = shortRail("RAIL_END_LOW", "Short rail \xB7 end \xB7 low", true, false);
    const RAIL_END_HIGH = shortRail("RAIL_END_HIGH", "Short rail \xB7 end \xB7 high", true, true);
    const RAIL_BODY_LOW = shortRail("RAIL_BODY_LOW", "Short rail \xB7 body \xB7 low", false, false);
    const RAIL_BODY_HIGH = shortRail("RAIL_BODY_HIGH", "Short rail \xB7 body \xB7 high", false, true);
    const longRail = (id, name, left, high) => {
      const zz = railZ(id, high);
      return board(id, name, "long_rail", "YZ", "X", t, {
        ...left ? { x0: same(K(id, "x0"), "SIDE_L.x1"), x1: face(id, "x1", { x0: ref(K(id, "x0")), T: P.T }, (v) => v.x0 + v.T) } : { x1: same(K(id, "x1"), "SIDE_R.x0"), x0: face(id, "x0", { x1: ref(K(id, "x1")), T: P.T }, (v) => v.x1 - v.T) },
        y0: same(K(id, "y0"), "RAIL_END_LOW.y1"),
        y1: same(K(id, "y1"), "RAIL_BODY_LOW.y0"),
        z0: zz.z0,
        z1: zz.z1
      });
    };
    const RAIL_L_LOW = longRail("RAIL_L_LOW", "Long rail \xB7 left \xB7 low", true, false);
    const RAIL_L_HIGH = longRail("RAIL_L_HIGH", "Long rail \xB7 left \xB7 high", true, true);
    const RAIL_R_LOW = longRail("RAIL_R_LOW", "Long rail \xB7 right \xB7 low", false, false);
    const RAIL_R_HIGH = longRail("RAIL_R_HIGH", "Long rail \xB7 right \xB7 high", false, true);
    boards.push(SIDE_L, SIDE_R, END, DIVIDER, RAIL_L_LOW, RAIL_L_HIGH, RAIL_R_LOW, RAIL_R_HIGH, RAIL_END_LOW, RAIL_END_HIGH, RAIL_BODY_LOW, RAIL_BODY_HIGH);
    attachFaces(boards);
    for (const b of boards) {
      b.role = b.category;
      b.stock = { kind: "carcass", thickness: b.materialThickness, colour: color };
    }
    annotate(END, "B", { semantic: "front", visible: true, finish: { colour: color } });
    annotate(END, "A", { semantic: "inside", visible: false });
    annotate(SIDE_L, "B", { semantic: "outside", visible: true, finish: { colour: color } });
    annotate(SIDE_L, "A", { semantic: "inside", visible: false });
    annotate(SIDE_R, "A", { semantic: "outside", visible: true, finish: { colour: color } });
    annotate(SIDE_R, "B", { semantic: "inside", visible: false });
    for (const b of [DIVIDER, RAIL_L_LOW, RAIL_L_HIGH, RAIL_R_LOW, RAIL_R_HIGH, RAIL_END_LOW, RAIL_END_HIGH, RAIL_BODY_LOW, RAIL_BODY_HIGH]) {
      annotate(b, "A", { visible: false });
      annotate(b, "B", { visible: false });
    }
    const L = divLen;
    const ND = RULES.DIVIDER_NOTCH_DEPTH_MM.value;
    const notchBoxes = [
      { id: "DIVIDER_NOTCH_END_LOW", for: "RAIL_END_LOW", u0: -EPS, u1: ND + EPS, v0: -EPS, v1: notchH + EPS },
      { id: "DIVIDER_NOTCH_END_HIGH", for: "RAIL_END_HIGH", u0: -EPS, u1: ND + EPS, v0: H - notchH - EPS, v1: H + EPS },
      { id: "DIVIDER_NOTCH_BODY_LOW", for: "RAIL_BODY_LOW", u0: L - ND - EPS, u1: L + EPS, v0: -EPS, v1: notchH + EPS },
      { id: "DIVIDER_NOTCH_BODY_HIGH", for: "RAIL_BODY_HIGH", u0: L - ND - EPS, u1: L + EPS, v0: H - notchH - EPS, v1: H + EPS }
    ];
    const dividerTags = {};
    for (const nb of notchBoxes) {
      dividerTags[nb.for] = tagEdges(DIVIDER, "notch", nb, { id: nb.id, for: nb.for, key: "DIVIDER.cut", source: "bedBox.halfLap" });
    }
    for (const rail of [RAIL_END_LOW, RAIL_END_HIGH, RAIL_BODY_LOW, RAIL_BODY_HIGH]) {
      const high = rail.z0 > EPS;
      const n = railNotch.get(rail.id);
      const nx0 = n.x0 - rail.x0;
      const nw = n.x1 - n.x0;
      const nd = RULES.RAIL_NOTCH_DEPTH_MM.value;
      const rh = rail.z1 - rail.z0;
      const box = high ? { u0: nx0 - EPS, u1: nx0 + nw + EPS, v0: -EPS, v1: nd + EPS } : { u0: nx0 - EPS, u1: nx0 + nw + EPS, v0: rh - nd - EPS, v1: rh + EPS };
      const railTags = tagEdges(rail, "notch", box, { id: `${rail.id}_NOTCH`, for: "DIVIDER", key: `${rail.id}.pv`, source: "bedBox.halfLap" });
      joints.push(joint(`${rail.id}_halflap`, "half_lap", faceRef("DIVIDER", dividerTags[rail.id] ?? []), faceRef(rail.id, railTags), { hardware: [], rule: "bed_box_half_lap_v1" }));
    }
    const endInside = faceRef("END", ["A"]);
    for (const b of [SIDE_L, SIDE_R, DIVIDER]) joints.push(joint(`${b.id}_end`, "butt", endInside, faceRef(b.id, boundaryEdgeFaces(b, "-Y")), { hardware: [], rule: "bed_box_butt_v1" }));
    for (const [rail, side, sideFace] of [[RAIL_L_LOW, SIDE_L, "A"], [RAIL_L_HIGH, SIDE_L, "A"], [RAIL_R_LOW, SIDE_R, "B"], [RAIL_R_HIGH, SIDE_R, "B"]]) {
      joints.push(joint(`${rail.id}_side`, "face_contact", faceRef(side.id, [sideFace]), faceRef(rail.id, [side === SIDE_L ? "B" : "A"]), { hardware: [], rule: "bed_box_rail_on_side_v1" }));
    }
    for (const rail of [RAIL_END_LOW, RAIL_END_HIGH]) joints.push(joint(`${rail.id}_end`, "face_contact", endInside, faceRef(rail.id, ["B"]), { hardware: [], rule: "bed_box_rail_on_end_v1" }));
    for (const [lr, sr] of [[RAIL_L_LOW, RAIL_END_LOW], [RAIL_R_LOW, RAIL_END_LOW], [RAIL_L_HIGH, RAIL_END_HIGH], [RAIL_R_HIGH, RAIL_END_HIGH], [RAIL_L_LOW, RAIL_BODY_LOW], [RAIL_R_LOW, RAIL_BODY_LOW], [RAIL_L_HIGH, RAIL_BODY_HIGH], [RAIL_R_HIGH, RAIL_BODY_HIGH]]) {
      const toward = sr.id.includes("END") ? "-Y" : "+Y";
      joints.push(joint(`${lr.id}_${sr.id}`, "butt", faceRef(sr.id, [toward === "-Y" ? "A" : "B"]), faceRef(lr.id, boundaryEdgeFaces(lr, toward)), { hardware: [], rule: "bed_box_rail_butt_v1" }));
    }
  }
  const provenance = endProvenance();
  const params = { width: W, depth: D, height: H, panelThickness: t, frontPanelThickness: fpt, carcassColor: color };
  const zones = errors.length ? [] : [{ id: "box", x0: 0, x1: W, y0: 0, y1: D, z0: 0, z1: H }];
  return { params, zones, boards: errors.length ? [] : boards, joints: errors.length ? [] : joints, features: [], validation: { errors, warnings }, debug: { boardFrame: "final", provenance } };
}
function board(id, name, category, profilePlane, thicknessAxis, materialThickness, f) {
  return {
    id,
    name,
    category,
    boardType: category.endsWith("rail") ? "rail" : "panel",
    materialThickness: round1(materialThickness),
    profilePlane,
    thicknessAxis,
    x0: round1(f.x0),
    x1: round1(f.x1),
    y0: round1(f.y0),
    y1: round1(f.y1),
    z0: round1(f.z0),
    z1: round1(f.z1),
    source: "bedBox"
  };
}
export {
  BED_BOX_DEFAULT_HEIGHT,
  BED_BOX_MIN,
  RULES,
  generateBedBox,
  minHeight,
  minLength
};
