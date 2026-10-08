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
function namesOf(n, out) {
  if (n.k === "id") out.add(n.v);
  else if (n.k === "neg") namesOf(n.a, out);
  else if (n.k === "bin") {
    namesOf(n.a, out);
    namesOf(n.b, out);
  } else if (n.k === "call") for (const a of n.args) namesOf(a, out);
}
function run(n, lookup) {
  switch (n.k) {
    case "num":
      return n.v;
    case "id":
      return lookup(n.v);
    case "neg":
      return -run(n.a, lookup);
    case "call":
      return FUNCS[n.f](...n.args.map((a) => run(a, lookup)));
    case "bin": {
      const a = run(n.a, lookup);
      const b = run(n.b, lookup);
      switch (n.op) {
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
    for (const n of c.names) terms[n] = termOf(n, from);
    return dim(key, terms, (t) => c.run((n) => t[n]), { formula: c.src });
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
var round2 = (n) => Math.round(n * 1e3) / 1e3;
function followOutline(board2, before) {
  if (board2.profilePlane !== "YZ" || !board2.profileVector) return;
  const dy = board2.y0 - before.y0;
  const dz = board2.z0 - before.z0;
  if (Math.abs(dy) < 1e-9 && Math.abs(dz) < 1e-9) return;
  board2.profileVector = board2.profileVector.map((p) => {
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

// generators/bedBox/layout.json
var layout_default = {
  module: "bedBox",
  version: 1,
  boards: {}
};

// generators/bedBox/layout.ts
var LAYOUT = validateLayout(layout_default);

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
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const c = pts[(i + 1) % n];
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

// generators/bedBox/generator.ts
var BED_BOX_DEFAULT_HEIGHT = 398;
var BED_BOX_MIN = { width: 300, depth: 300, height: 100 };
var DEFAULT_COLOR = "White Stipple";
var EPS2 = 1e-6;
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
function generateBedBox(raw, options = {}) {
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
    applyLayoutDraft(boards, options.layout != null ? options.layout : LAYOUT, {}, errors, warnings);
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
      { id: "DIVIDER_NOTCH_END_LOW", for: "RAIL_END_LOW", u0: -EPS2, u1: ND + EPS2, v0: -EPS2, v1: notchH + EPS2 },
      { id: "DIVIDER_NOTCH_END_HIGH", for: "RAIL_END_HIGH", u0: -EPS2, u1: ND + EPS2, v0: H - notchH - EPS2, v1: H + EPS2 },
      { id: "DIVIDER_NOTCH_BODY_LOW", for: "RAIL_BODY_LOW", u0: L - ND - EPS2, u1: L + EPS2, v0: -EPS2, v1: notchH + EPS2 },
      { id: "DIVIDER_NOTCH_BODY_HIGH", for: "RAIL_BODY_HIGH", u0: L - ND - EPS2, u1: L + EPS2, v0: H - notchH - EPS2, v1: H + EPS2 }
    ];
    const dividerTags = {};
    for (const nb of notchBoxes) {
      dividerTags[nb.for] = tagEdges(DIVIDER, "notch", nb, { id: nb.id, for: nb.for, key: "DIVIDER.cut", source: "bedBox.halfLap" });
    }
    for (const rail of [RAIL_END_LOW, RAIL_END_HIGH, RAIL_BODY_LOW, RAIL_BODY_HIGH]) {
      const high = rail.z0 > EPS2;
      const n = railNotch.get(rail.id);
      const nx0 = n.x0 - rail.x0;
      const nw = n.x1 - n.x0;
      const nd = RULES.RAIL_NOTCH_DEPTH_MM.value;
      const rh = rail.z1 - rail.z0;
      const box = high ? { u0: nx0 - EPS2, u1: nx0 + nw + EPS2, v0: -EPS2, v1: nd + EPS2 } : { u0: nx0 - EPS2, u1: nx0 + nw + EPS2, v0: rh - nd - EPS2, v1: rh + EPS2 };
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
  const milling = applyMilling(errors.length ? [] : boards);
  return { params, zones, milling, boards: errors.length ? [] : boards, joints: errors.length ? [] : joints, features: [], validation: { errors, warnings }, debug: { boardFrame: "final", provenance } };
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
