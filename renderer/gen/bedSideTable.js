// Generated from generators/bedSideTable/generator.ts - do not edit.

// generators/bedSideTable/rules.json
var rules_default = {
  BOARD_THICKNESS_MM: { value: 15, doc: "Side panels and shelves. Style 3 / Bedroom 1 measure 15." },
  DOOR_THICKNESS_MM: { value: 16, doc: "Fronts (drawer or door) and the bed-side show panel, which stands outside the carcass under the wardrobe's colour panel. Style 3 / Bedroom 1 measure 16." },
  TOP_ABOVE_BOOT_MM: { value: 4.5, doc: "Unused for the table height. The top follows the body's fixed-panel top (the panel under the wardrobe door), not the boot." },
  DEPTH_DEFAULT_MM: { value: 145, doc: "How far the table stands into the room from the body's room face, when nothing else is set. Style 3 measures 145." },
  GROOVE_CLEARANCE_MM: { value: 1, doc: "Side slot is this much taller than the shelf (15 \u2192 16): 0.5 above and below for the middle shelf; for the top and bottom shelves, whose slot reaches the side's edge, the whole 1 mm is toward the inside." },
  ROUTER_DIAMETER_MM: { value: 10, doc: "The side slot runs this much further than the tongue along the depth, 5 mm past each end. The tongue itself is the middle third of the depth and goes through the side to its outer face." },
  CLEARANCE_MM: { value: 2.5, doc: "The shared side clearance around the fronts: above the floor, between the two fronts (centred on the shelf line), under the top, and at both side edges. The fronts cover the shelves and the show panel. 2.5 or 3, whichever the job uses." },
  ZONE_MIN_MM: { value: 80, doc: "Least clear height of a drawer or door zone." },
  HINGE_DIAMETER_MM: { value: 35, doc: "Door cup diameter." },
  HINGE_DEPTH_MM: { value: 12, doc: "Door cup depth from the inside face." },
  HINGE_FROM_END_MM: { value: 22.5, doc: "Cup centre from the top and from the bottom of a bedside door. Not measured from a model \u2014 chosen because a bedside zone is under 200 high and the wardrobe's 100 would put the two cups on top of each other. Confirm on the next model." },
  HINGE_FROM_SIDE_MM: { value: 22.5, doc: "Cup centre from the hinge edge." }
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

// generators/bedSideTable/rules.ts
var RULES = defineRules("bedSideTable", rules_default);

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

// generators/bedSideTable/layout.json
var layout_default = {
  module: "bedSideTable",
  version: 1,
  boards: {}
};

// generators/bedSideTable/layout.ts
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
function faceRef(board, faces) {
  return { board, faces: faces.map((f) => typeof f === "string" ? f : f.id) };
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

// generators/bedSideTable/svgPreview.ts
function fmt(v) {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(1)));
}
function generateBedSideSvg(result, options = {}) {
  if (!result || result.validation.errors.length || !result.boards.length) return null;
  const p = result.params;
  const width = options.width ?? 420;
  const pad = 36;
  const scale = (width - pad * 2) / Math.max(p.width, 1);
  const height = Math.round(p.height * scale + pad * 2);
  const toX = (x) => pad + x * scale;
  const toY = (z) => pad + (p.height - z) * scale;
  const parts = [];
  const labelOf = (type) => type === "drawer" ? "Drawer" : type === "left_door" ? "Door \xB7 left" : "Door \xB7 right";
  for (const id of ["FRONT_LO", "FRONT_HI"]) {
    const b = result.boards.find((board) => board.id === id);
    const zone = id === "FRONT_LO" ? p.zones[0] : p.zones[1];
    if (!b || !zone) continue;
    parts.push(
      `<rect class="region" x="${toX(b.x0).toFixed(1)}" y="${toY(b.z1).toFixed(1)}" width="${((b.x1 - b.x0) * scale).toFixed(1)}" height="${((b.z1 - b.z0) * scale).toFixed(1)}" fill="${zone.type === "drawer" ? "#f0c27a" : "#8ec5ef"}" stroke="#5c6b78" pointer-events="none" />`,
      `<text x="${toX((b.x0 + b.x1) / 2).toFixed(1)}" y="${toY((b.z0 + b.z1) / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#3b352d" pointer-events="none">${labelOf(zone.type)}</text>`
    );
  }
  parts.push(`<rect x="${toX(0).toFixed(1)}" y="${toY(p.height).toFixed(1)}" width="${(p.width * scale).toFixed(1)}" height="${(p.height * scale).toFixed(1)}" fill="none" stroke="#5c4b37" pointer-events="none" />`);
  const y = toY(p.shelfCenter);
  parts.push(
    `<g class="boundary" data-boundary="shelfCenter" data-axis="z"><rect x="${toX(0).toFixed(1)}" y="${(y - 8).toFixed(1)}" width="${(p.width * scale).toFixed(1)}" height="16" fill="transparent" pointer-events="all" /><line x1="${toX(0).toFixed(1)}" y1="${y.toFixed(1)}" x2="${toX(p.width).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e0a34f" stroke-width="3" pointer-events="none" /></g>`
  );
  for (const b of result.boards) {
    if (b.category !== "front_panel") continue;
    const face = b.faces?.find((f) => f.id === "A");
    for (const ft of face?.features || []) {
      if (ft.kind !== "hole" || !ft.center) continue;
      const cx = toX(b.x0 + ft.center[0]);
      const cy = toY(b.z0 + ft.center[1]);
      const r = Math.max((ft.diameter || 35) / 2 * scale, 2);
      parts.push(`<circle class="hinge" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="#3d4d63" pointer-events="none" />`);
    }
  }
  parts.push(`<text x="${(width / 2).toFixed(1)}" y="${(height - 12).toFixed(1)}" text-anchor="middle" font-size="11" fill="#6b6357">${p.side} \xB7 shelf ${fmt(p.shelfCenter)} \xB7 ${p.zones.map((z) => z.type).join(" / ")}</text>`);
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-scale="${scale}" data-ox="${pad}" data-oy="${pad}" data-h="${p.height}" data-w="${p.width}"><rect width="${width}" height="${height}" fill="#f8fbff" />` + parts.join("") + `</svg>`;
}

// generators/bedSideTable/generator.ts
var ZONE_TYPES = ["drawer", "left_door", "right_door"];
var EPS2 = 0.01;
function round1(v) {
  return Math.round(v * 10) / 10;
}
function asNum(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function shelfLimits(raw) {
  const H = round1(asNum(raw.height, 0));
  const cl = asNum(raw.clearance, RULES.CLEARANCE_MM.value);
  const min = round1(cl + RULES.ZONE_MIN_MM.value + cl / 2);
  const max = round1(H - cl - RULES.ZONE_MIN_MM.value - cl / 2);
  return { min, max: Math.max(min, max) };
}
function normalizeZones(raw) {
  const out = [];
  for (let i = 0; i < 2; i += 1) {
    const z = raw && raw[i];
    const type = z && ZONE_TYPES.includes(z.type) ? z.type : i === 0 ? "left_door" : "drawer";
    out.push({ id: z?.id || (i === 0 ? "lower" : "upper"), type });
  }
  return out;
}
function mirrorZoneType(type) {
  if (type === "left_door") return "right_door";
  if (type === "right_door") return "left_door";
  return "drawer";
}
function resolve(raw) {
  const height = round1(asNum(raw.height, 0));
  const t = round1(asNum(raw.panelThickness, RULES.BOARD_THICKNESS_MM.value));
  const lim = shelfLimits({ height, clearance: raw.clearance, panelThickness: t });
  const center = round1(Math.max(lim.min, Math.min(lim.max, asNum(raw.shelfCenter, height / 2))));
  return {
    width: round1(asNum(raw.width, 0)),
    depth: round1(asNum(raw.depth, 0)),
    height,
    side: raw.side === "right" ? "right" : "left",
    shelfCenter: center,
    zones: normalizeZones(raw.zones),
    clearance: round1(asNum(raw.clearance, RULES.CLEARANCE_MM.value)),
    panelThickness: t,
    doorPanelThickness: round1(asNum(raw.doorPanelThickness, RULES.DOOR_THICKNESS_MM.value)),
    carcassColor: String(raw.carcassColor || "White Stipple"),
    doorColor: String(raw.doorColorName || raw.doorColor || "White Stipple")
  };
}
function generateBedSideTable(raw, options = {}) {
  const errors = [];
  const warnings = [];
  const p = resolve(raw);
  const t = p.panelThickness;
  const dpt = p.doorPanelThickness;
  const W = p.width;
  const D = p.depth;
  const H = p.height;
  const bedAtStart = p.side === "left";
  beginProvenance();
  const P = param({ W, D, H, t, dpt, center: p.shelfCenter, cl: p.clearance });
  const BIT = RULES.ROUTER_DIAMETER_MM;
  const GC = RULES.GROOVE_CLEARANCE_MM;
  if (W < dpt + 4 * t) errors.push(`width ${W} is too narrow for the show panel and two sides`);
  if (D < 3 * (RULES.ROUTER_DIAMETER_MM.value + 5)) errors.push(`depth ${D} leaves no room for a tongue in the middle third`);
  if (H < t * 2 + p.clearance * 3 + RULES.ZONE_MIN_MM.value * 2) errors.push(`height ${H} cannot hold two zones`);
  const c0 = bedAtStart ? dim("carcass.x0", { dpt: P.dpt }, (v) => v.dpt) : dim("carcass.x0", {}, () => 0, { formula: "0" });
  const c1 = bedAtStart ? dim("carcass.x1", { W: P.W }, (v) => v.W) : dim("carcass.x1", { W: P.W, dpt: P.dpt }, (v) => v.W - v.dpt);
  const ty0 = dim("joint.tongue.y0", { D: P.D }, (v) => round1(v.D / 3));
  const ty1 = dim("joint.tongue.y1", { D: P.D }, (v) => round1(2 * v.D / 3));
  const sy0 = dim("joint.slot.y0", { y: ref("joint.tongue.y0"), BIT }, (v) => v.y - v.BIT / 2);
  const sy1 = dim("joint.slot.y1", { y: ref("joint.tongue.y1"), BIT }, (v) => v.y + v.BIT / 2);
  void c0;
  void c1;
  void ty0;
  void ty1;
  void sy0;
  void sy1;
  const shelves = [
    {
      id: "SHELF_BOT",
      name: "Bottom shelf",
      z0: dim("SHELF_BOT.z0", {}, () => 0, { formula: "0" }),
      z1: dim("SHELF_BOT.z1", { t: P.t }, (v) => v.t),
      sz0: dim("slot.SHELF_BOT.z0", {}, () => 0, { formula: "0" }),
      sz1: dim("slot.SHELF_BOT.z1", { t: P.t, GC }, (v) => v.t + v.GC)
    },
    {
      id: "SHELF_MID",
      name: "Middle shelf",
      z0: dim("SHELF_MID.z0", { center: P.center, t: P.t }, (v) => round1(v.center - v.t / 2)),
      z1: dim("SHELF_MID.z1", { center: P.center, t: P.t }, (v) => round1(v.center + v.t / 2)),
      sz0: dim("slot.SHELF_MID.z0", { center: P.center, t: P.t, GC }, (v) => round1(v.center - (v.t + v.GC) / 2)),
      sz1: dim("slot.SHELF_MID.z1", { center: P.center, t: P.t, GC }, (v) => round1(v.center + (v.t + v.GC) / 2))
    },
    {
      id: "SHELF_TOP",
      name: "Top shelf",
      z0: dim("SHELF_TOP.z0", { H: P.H, t: P.t }, (v) => v.H - v.t),
      z1: dim("SHELF_TOP.z1", { H: P.H }, (v) => v.H),
      sz0: dim("slot.SHELF_TOP.z0", { H: P.H, t: P.t, GC }, (v) => v.H - v.t - v.GC),
      sz1: dim("slot.SHELF_TOP.z1", { H: P.H }, (v) => v.H)
    }
  ];
  const boards = [];
  const joints = [];
  if (!errors.length) {
    const yz = (id) => ({
      y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
      y1: dim(`${id}.y1`, { D: P.D }, (v) => v.D),
      z0: dim(`${id}.z0`, {}, () => 0, { formula: "0" }),
      z1: dim(`${id}.z1`, { H: P.H }, (v) => v.H)
    });
    const show = rect("SHOW", "Bed-side panel \xB7 door stock", "side_panel", "YZ", "X", dpt, bedAtStart ? { x0: dim("SHOW.x0", {}, () => 0, { formula: "0" }), x1: dim("SHOW.x1", { dpt: P.dpt }, (v) => v.dpt), ...yz("SHOW") } : { x0: dim("SHOW.x0", { W: P.W, dpt: P.dpt }, (v) => v.W - v.dpt), x1: dim("SHOW.x1", { W: P.W }, (v) => v.W), ...yz("SHOW") });
    const sideBed = rect("SIDE_BED", "Side \xB7 bed", "side_panel", "YZ", "X", t, bedAtStart ? { x0: same("SIDE_BED.x0", "carcass.x0"), x1: dim("SIDE_BED.x1", { x: ref("carcass.x0"), t: P.t }, (v) => v.x + v.t), ...yz("SIDE_BED") } : { x0: dim("SIDE_BED.x0", { x: ref("carcass.x1"), t: P.t }, (v) => v.x - v.t), x1: same("SIDE_BED.x1", "carcass.x1"), ...yz("SIDE_BED") });
    const sideWall = rect("SIDE_WALL", "Side \xB7 wall", "side_panel", "YZ", "X", t, bedAtStart ? { x0: dim("SIDE_WALL.x0", { x: ref("carcass.x1"), t: P.t }, (v) => v.x - v.t), x1: same("SIDE_WALL.x1", "carcass.x1"), ...yz("SIDE_WALL") } : { x0: same("SIDE_WALL.x0", "carcass.x0"), x1: dim("SIDE_WALL.x1", { x: ref("carcass.x0"), t: P.t }, (v) => v.x + v.t), ...yz("SIDE_WALL") });
    for (const side of [sideBed, sideWall]) side.profileVector = sideOutline(side.id);
    boards.push(show, sideBed, sideWall);
    for (const s of shelves) {
      const b = rect(s.id, s.name, "shelf", "XY", "Z", t, {
        x0: same(`${s.id}.x0`, "carcass.x0"),
        x1: same(`${s.id}.x1`, "carcass.x1"),
        y0: dim(`${s.id}.y0`, {}, () => 0, { formula: "0" }),
        y1: dim(`${s.id}.y1`, { D: P.D }, (v) => v.D),
        z0: s.z0,
        z1: s.z1
      });
      b.profileVector = shelfOutline(s.id, P.t);
      boards.push(b);
    }
    const spans = [
      {
        id: "FRONT_LO",
        zone: p.zones[0],
        z0: dim("FRONT_LO.z0", { cl: P.cl }, (v) => v.cl),
        z1: dim("FRONT_LO.z1", { center: P.center, cl: P.cl }, (v) => round1(v.center - v.cl / 2))
      },
      {
        id: "FRONT_HI",
        zone: p.zones[1],
        z0: dim("FRONT_HI.z0", { center: P.center, cl: P.cl }, (v) => round1(v.center + v.cl / 2)),
        z1: dim("FRONT_HI.z1", { H: P.H, cl: P.cl }, (v) => v.H - v.cl)
      }
    ];
    for (const f of spans) {
      if (f.z1 - f.z0 < RULES.ZONE_MIN_MM.value) errors.push(`${f.zone.id} zone is only ${round1(f.z1 - f.z0)} mm`);
      const door = rect(f.id, f.zone.type === "drawer" ? "Drawer front" : "Door", "front_panel", "XZ", "Y", dpt, {
        x0: dim(`${f.id}.x0`, { cl: P.cl }, (v) => v.cl),
        x1: dim(`${f.id}.x1`, { W: P.W, cl: P.cl }, (v) => v.W - v.cl),
        y0: dim(`${f.id}.y0`, { dpt: P.dpt }, (v) => -v.dpt),
        y1: dim(`${f.id}.y1`, {}, () => 0, { formula: "0" }),
        z0: f.z0,
        z1: f.z1
      });
      boards.push(door);
    }
    for (const b of boards) b.source = "bedSideTable";
    applyLayoutDraft(boards, options.layout != null ? options.layout : LAYOUT, {}, errors, warnings, {
      side: p.side,
      lower: p.zones[0]?.type || "left_door",
      upper: p.zones[1]?.type || "drawer"
    });
    attachFaces(boards);
    for (const b of boards) {
      const doorish = b.id === "SHOW" || b.category === "front_panel";
      b.stock = { kind: doorish ? "door" : "carcass", thickness: b.materialThickness, colour: doorish ? p.doorColor : p.carcassColor };
    }
    annotate(show, bedAtStart ? "B" : "A", { semantic: "outside", visible: true, finish: { colour: p.doorColor } });
    for (const b of boards) if (b.category === "front_panel") annotate(b, "B", { semantic: "front", visible: true, finish: { colour: p.doorColor } });
    applyDoorSides(boards, { doorSides: raw.doorSides, carcassColorName: p.carcassColor });
    const mid = shelves[1];
    const bedInner = bedAtStart ? "A" : "B";
    const wallInner = bedAtStart ? "B" : "A";
    for (const [side, faceId] of [[sideBed, bedInner], [sideWall, wallInner]]) {
      const r = localRect(side, { y: [sy0, sy1], z: [mid.sz0, mid.sz1] });
      addFeature(side, faceId, {
        id: "SLOT_SHELF_MID",
        kind: "cutout",
        ...r,
        through: true,
        for: "SHELF_MID",
        key: `${side.id}.feat.SLOT_SHELF_MID`,
        source: "bedSideTable"
      });
      for (const s of [shelves[0], shelves[2]]) {
        tagEdges(side, "notch", { u0: sy0 - EPS2, u1: sy1 + EPS2, v0: s.sz0 - EPS2, v1: s.sz1 + EPS2 }, { id: `SLOT_${s.id}`, for: s.id, key: `${side.id}.pv`, source: "bedSideTable" });
      }
    }
    for (const s of shelves) {
      const shelf = boards.find((b) => b.id === s.id);
      const w = shelf.x1 - shelf.x0;
      for (const [side, u0, u1] of [
        [bedAtStart ? sideBed : sideWall, -EPS2, t + EPS2],
        [bedAtStart ? sideWall : sideBed, w - t - EPS2, w + EPS2]
      ]) {
        const tags = tagEdges(shelf, "tongue", { u0, u1, v0: ty0 - EPS2, v1: ty1 + EPS2 }, { id: `${s.id}_TONGUE_${side.id}`, for: side.id, key: `${s.id}.pv`, source: "bedSideTable" });
        const slotFaces = s.id === "SHELF_MID" ? [side.id === sideBed.id ? bedInner : wallInner] : side.faces.filter((f) => f.features.some((ft) => ft.id === `SLOT_${s.id}`)).map((f) => f.id);
        joints.push(joint(`${s.id}_${side.id}`, "tongue_groove", faceRef(side.id, slotFaces), faceRef(s.id, tags), { hardware: [], rule: "bedside_through_tongue_v1" }));
      }
    }
    for (const f of spans) {
      const door = boards.find((b) => b.id === f.id);
      if (f.zone.type === "drawer") continue;
      const h = door.z1 - door.z0;
      const w = door.x1 - door.x0;
      if (h < RULES.HINGE_FROM_END_MM.value * 2 + 10) continue;
      const face = door.faces.find((fc) => fc.id === "A");
      const u = f.zone.type === "left_door" ? RULES.HINGE_FROM_SIDE_MM.value : round1(w - RULES.HINGE_FROM_SIDE_MM.value);
      for (const [i, v] of [[0, RULES.HINGE_FROM_END_MM.value], [1, round1(h - RULES.HINGE_FROM_END_MM.value)]]) {
        face.features.push({
          id: `${door.id}_HINGE_${i}`,
          kind: "hole",
          center: [u, v],
          diameter: RULES.HINGE_DIAMETER_MM.value,
          depth: RULES.HINGE_DEPTH_MM.value,
          through: false,
          for: "hinge",
          key: `${door.id}.feat.HINGE_${i}`,
          source: "bedSideTable"
        });
      }
    }
  }
  const provenance = endProvenance();
  const milling = applyMilling(errors.length ? [] : boards);
  return {
    params: p,
    milling,
    boards: errors.length ? [] : boards,
    joints: errors.length ? [] : joints,
    validation: { errors, warnings },
    debug: { boardFrame: "final", provenance }
  };
}
function sideOutline(id) {
  const o = new Outline(`${id}.pv`, ["y", "z"]);
  const Y = (k) => ex({ y: ref(k) }, (v) => v.y);
  const Z = (k) => ex({ z: ref(k) }, (v) => v.z);
  o.add(lit(0), lit(0));
  o.add(Y("joint.slot.y0"), lit(0));
  o.add(Y("joint.slot.y0"), Z("slot.SHELF_BOT.z1"));
  o.add(Y("joint.slot.y1"), Z("slot.SHELF_BOT.z1"));
  o.add(Y("joint.slot.y1"), lit(0));
  o.add(Y(`${id}.y1`), lit(0));
  o.add(Y(`${id}.y1`), Z(`${id}.z1`));
  o.add(Y("joint.slot.y1"), Z(`${id}.z1`));
  o.add(Y("joint.slot.y1"), Z("slot.SHELF_TOP.z0"));
  o.add(Y("joint.slot.y0"), Z("slot.SHELF_TOP.z0"));
  o.add(Y("joint.slot.y0"), Z(`${id}.z1`));
  o.add(lit(0), Z(`${id}.z1`));
  return o.points.map(([y, z]) => ({ y: round1(y), z: round1(z) }));
}
function shelfOutline(id, T) {
  const o = new Outline(`${id}.pv`, ["x", "y"]);
  const x0 = () => ex({ x: ref("carcass.x0") }, (v) => v.x);
  const x1 = () => ex({ x: ref("carcass.x1") }, (v) => v.x);
  const in0 = () => ex({ x: ref("carcass.x0"), t: T }, (v) => v.x + v.t);
  const in1 = () => ex({ x: ref("carcass.x1"), t: T }, (v) => v.x - v.t);
  const ty0 = () => ex({ y: ref("joint.tongue.y0") }, (v) => v.y);
  const ty1 = () => ex({ y: ref("joint.tongue.y1") }, (v) => v.y);
  const yD = () => ex({ y: ref(`${id}.y1`) }, (v) => v.y);
  o.add(in0(), lit(0)).add(in1(), lit(0)).add(in1(), ty0()).add(x1(), ty0()).add(x1(), ty1()).add(in1(), ty1());
  o.add(in1(), yD()).add(in0(), yD()).add(in0(), ty1()).add(x0(), ty1()).add(x0(), ty0()).add(in0(), ty0());
  return o.points.map(([x, y]) => ({ x: round1(x), y: round1(y) }));
}
function rect(id, name, category, profilePlane, thicknessAxis, thickness, f) {
  return {
    id,
    name,
    category,
    boardType: "panel",
    materialThickness: round1(thickness),
    profilePlane,
    thicknessAxis,
    x0: round1(f.x0),
    x1: round1(f.x1),
    y0: round1(f.y0),
    y1: round1(f.y1),
    z0: round1(f.z0),
    z1: round1(f.z1),
    source: "bedSideTable"
  };
}
export {
  RULES,
  generateBedSideSvg,
  generateBedSideTable,
  mirrorZoneType,
  normalizeZones,
  shelfLimits
};
