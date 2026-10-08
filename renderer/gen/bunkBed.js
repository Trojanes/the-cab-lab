// Generated from generators/bunkBed/generator.ts - do not edit.

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
    const box2 = {};
    for (const axis of AXES) {
      if (!file.boards[id].axes[axis]) continue;
      const pair = placeAxis(id, axis);
      if (!pair) continue;
      const [a0, a1] = pair;
      box2[`${axis}0`] = a0;
      box2[`${axis}1`] = a1;
    }
    out[id] = box2;
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
      const box2 = placed[b.id];
      if (!box2) continue;
      const before = { y0: b.y0, z0: b.z0 };
      for (const face of ["x0", "x1", "y0", "y1", "z0", "z1"]) {
        const v = box2[face];
        if (typeof v === "number") b[face] = v;
      }
      followOutline(b, before);
    }
  } catch (err) {
    if (err instanceof LayoutError) errors.push(err.message);
    else throw err;
  }
}

// generators/bunkBed/layout.json
var layout_default = {
  module: "bunkBed",
  version: 1,
  boards: {}
};

// generators/bunkBed/layout.ts
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
function edgeFacesIn(b, box2) {
  return edgeFaces(b).filter((f) => {
    const mu = (f.edge.from[0] + f.edge.to[0]) / 2;
    const mv = (f.edge.from[1] + f.edge.to[1]) / 2;
    return mu >= box2.u0 && mu <= box2.u1 && mv >= box2.v0 && mv <= box2.v1;
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
function tagEdges(b, kind, box2, meta) {
  const hit = edgeFacesIn(b, box2);
  for (const f of hit) f.features.push({ kind, ...meta });
  return hit.map((f) => f.id);
}
function annotate(b, faceId, a) {
  Object.assign(faceOf(b, faceId), a);
}
function joint(id, kind, a, b, extra = {}) {
  return { id, kind, a, b, ...extra };
}
function faceRef(board, faces) {
  return { board, faces: faces.map((f) => typeof f === "string" ? f : f.id) };
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

// generators/sketchBoard/layout.json
var layout_default2 = {
  module: "sketchBoard",
  version: 1,
  boards: {}
};

// generators/sketchBoard/layout.ts
var LAYOUT2 = validateLayout(layout_default2);

// generators/sketchBoard/generator.ts
var r3 = (n) => Math.round(n * 1e3) / 1e3;
var ARC_CHORD_MM2 = 0.05;
var ARC_STEP_MAX2 = 5 * Math.PI / 180;
function tessellateRing(pts) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    out.push({ u: a.u, v: a.v });
    const bulge = a.b ?? 0;
    const chord = Math.hypot(b.u - a.u, b.v - a.v);
    if (!bulge || chord < 1e-9) continue;
    const sweep = 4 * Math.atan(bulge);
    const du = (b.u - a.u) / chord;
    const dv = (b.v - a.v) / chord;
    const h = chord / 2 / Math.tan(sweep / 2);
    const cu = (a.u + b.u) / 2 - dv * h;
    const cv = (a.v + b.v) / 2 + du * h;
    const r = Math.hypot(a.u - cu, a.v - cv);
    const a0 = Math.atan2(a.v - cv, a.u - cu);
    const step = Math.min(ARC_STEP_MAX2, 2 * Math.acos(Math.max(-1, 1 - ARC_CHORD_MM2 / r)));
    const k = Math.max(2, Math.ceil(Math.abs(sweep) / step));
    for (let j = 1; j < k; j += 1) {
      const t = a0 + sweep * j / k;
      out.push({ u: r3(cu + r * Math.cos(t)), v: r3(cv + r * Math.sin(t)) });
    }
  }
  return out;
}

// generators/bunkBed/partition.ts
var QUARTER = Math.tan(Math.PI / 8);
function roundedRect(x0, x1, z0, z1, r) {
  if (r <= 0) return [{ u: x0, v: z0 }, { u: x1, v: z0 }, { u: x1, v: z1 }, { u: x0, v: z1 }];
  return [
    { u: x0 + r, v: z0 },
    { u: x1 - r, v: z0, b: QUARTER },
    { u: x1, v: z0 + r },
    { u: x1, v: z1 - r, b: QUARTER },
    { u: x1 - r, v: z1 },
    { u: x0 + r, v: z1, b: QUARTER },
    { u: x0, v: z1 - r },
    { u: x0, v: z0 + r, b: QUARTER }
  ];
}
function reverseRing(pts) {
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const p = pts[(n - i) % n];
    const b = -(pts[(n - 1 - i) % n].b ?? 0);
    out.push(b ? { u: p.u, v: p.v, b } : { u: p.u, v: p.v });
  }
  return out;
}
function notchedOutline(W, z0, z1, bottom, bottomTop, top, topBottom, r) {
  const [a0, a1] = bottom;
  const [u0, u1] = top;
  return [
    { u: 0, v: z0 },
    { u: a0, v: z0 },
    { u: a0, v: bottomTop },
    { u: a1, v: bottomTop },
    { u: a1, v: z0 },
    { u: W, v: z0 },
    { u: W, v: z1 },
    { u: u1, v: z1 },
    { u: u1, v: topBottom + r, b: -QUARTER },
    { u: u1 - r, v: topBottom },
    { u: u0 + r, v: topBottom, b: -QUARTER },
    { u: u0, v: topBottom + r },
    { u: u0, v: z1 },
    { u: 0, v: z1 }
  ];
}
function sillOutline(m0, m1, t0, t1, y1, y2, d) {
  return [
    { u: m0, v: y1 },
    { u: t0 - d, v: y1, b: -1 },
    { u: t0, v: y1 },
    { u: t0, v: 0 },
    { u: t1, v: 0 },
    { u: t1, v: y1, b: -1 },
    { u: t1 + d, v: y1 },
    { u: m1, v: y1 },
    { u: m1, v: y2 },
    { u: m0, v: y2 }
  ];
}
function flatten(ring) {
  return tessellateRing(ring);
}
function inside(poly, u, v) {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    if (a.v > v !== b.v > v && u < (b.u - a.u) * (v - a.v) / (b.v - a.v) + a.u) hit = !hit;
  }
  return hit;
}
function cutAt(outer, holes, c, keepLeft) {
  const keep = (u) => keepLeft ? u < c : u > c;
  const chains = [];
  const whole = [];
  const wholeHoles = [];
  for (const [ring, isHole] of [[outer, false], ...holes.map((h) => [h, true])]) {
    const ins = ring.map((p) => keep(p.u));
    if (ins.every(Boolean)) {
      (isHole ? wholeHoles : whole).push(ring);
      continue;
    }
    if (!ins.some(Boolean)) continue;
    const n = ring.length;
    const s = ins.findIndex((v) => !v);
    let cur = null;
    for (let k = 0; k < n; k += 1) {
      const i = (s + k) % n;
      const j = (i + 1) % n;
      const a = ring[i];
      const b = ring[j];
      const hit = () => ({ u: c, v: a.v + (c - a.u) / (b.u - a.u) * (b.v - a.v) });
      if (ins[i] && ins[j]) cur.push({ u: b.u, v: b.v });
      else if (ins[i] && !ins[j]) {
        cur.push(hit());
        chains.push(cur);
        cur = null;
      } else if (!ins[i] && ins[j]) cur = [hit(), { u: b.u, v: b.v }];
    }
  }
  const rings = [...whole];
  const used = /* @__PURE__ */ new Set();
  for (let i = 0; i < chains.length; i += 1) {
    if (used.has(i)) continue;
    const ring = [];
    let k = i;
    for (let guard = 0; guard <= chains.length; guard += 1) {
      used.add(k);
      ring.push(...chains[k]);
      const end = chains[k].at(-1).v;
      let next = -1;
      for (let m = 0; m < chains.length; m += 1) {
        const start = chains[m].at(0).v;
        const ahead = keepLeft ? start > end : start < end;
        if (!ahead) continue;
        if (next < 0 || (keepLeft ? start < chains[next][0].v : start > chains[next][0].v)) next = m;
      }
      if (next < 0) return null;
      if (next === i) break;
      if (used.has(next)) return null;
      k = next;
    }
    rings.push(ring);
  }
  return rings.map((r) => ({ outer: r, holes: wholeHoles.filter((h) => inside(r, h[0].u, h[0].v)) }));
}

// generators/bunkBed/rules.json
var rules_default = {
  DEPTH_DEFAULT_MM: { value: 748, doc: "Outer depth from the rear wall to the room face of the front partition when Enter creates without a pull. 21 Bunk: 730 mattress + 18 partition." },
  DECK_TOP_DEFAULT_MM: { value: 418, doc: "Top of the lower bunk deck (the lower box's top) when Enter creates without a pull. 21 Bunk: tunnel boot 400 + deck 18." },
  DECK_THICKNESS_MM: { value: 18, doc: "Lower bunk deck, which is also the tunnel boot's lid. 21 Bunk: 18 partition stock." },
  UPPER_BASE_THICKNESS_MM: { value: 24, doc: "Upper bunk base. 21 Bunk: 24 (confirmed 2026-09-29)." },
  PARTITION_THICKNESS_DEFAULT_MM: { value: 18, doc: "Front partition thickness when the params give none. A new bunk copies the job's partition stock thickness instead. 21 Bunk: 18." },
  BUNK_CLEAR_MIN_MM: { value: 500, doc: "Least clear height over each mattress base (lower: deck top to the upper base underside; upper: upper base top to the bunk top). Set by hand; 21 Bunk has 759.5 on both." },
  BOOT_HEIGHT_MIN_MM: { value: 100, doc: "Lowest tunnel boot under the deck. Set by hand." },
  LENGTH_MIN_MM: { value: 1500, doc: "Shortest bunk, wall to wall. Set by hand; 21 Bunk is 2275." },
  DEPTH_MIN_MM: { value: 400, doc: "Shallowest bunk including the front partition. Set by hand; 21 Bunk is 748." },
  LOWER_RAIL_MM: { value: 130, doc: "Front partition above the lower deck top before the lower opening starts: the lower bunk's guard. 21 Bunk: deck top 418 \u2192 opening 548." },
  UPPER_BASE_LIP_MM: { value: 30, doc: "The lower opening stops this far under the upper base, so the partition covers the upper base's front edge. 21 Bunk: underside 1177.5 \u2192 opening top 1147.5." },
  UPPER_RAIL_MM: { value: 125, doc: "Front partition above the upper base top before the upper opening starts: the upper bunk's guard. 21 Bunk: 1201.5 \u2192 1326.5." },
  OPENING_WALL_MARGIN_MM: { value: 600, doc: "Both bunk openings start this far from the side wall away from the ladder; the upper opening also ends this far from the ladder-side wall. 21 Bunk: 600 \u2192 1675 (2275 \u2212 600)." },
  OPENING_RADIUS_MM: { value: 100, doc: "Corner radius of the bunk openings. 21 Bunk: R100 (one corner in the STEP is R120, taken as a drawing slip)." },
  LADDER_HOLE_COUNT: { value: 3, doc: "Hand holes in the front partition beside the lower opening: the ladder to the upper bunk. 21 Bunk: 3." },
  LADDER_HOLE_WIDTH_MM: { value: 250, doc: "Width of each ladder hole. 21 Bunk: 250." },
  LADDER_HOLE_GAP_MM: { value: 50, doc: "Partition between two ladder holes. The holes share the lower opening's height, so their height follows. 21 Bunk: 166.5 high each." },
  LADDER_HOLE_RADIUS_MM: { value: 30, doc: "Corner radius of the ladder holes. 21 Bunk: R30." },
  LADDER_HOLE_EDGE_MM: { value: 20, doc: "The ladder holes' outer edge sits this far inside the upper opening's ladder-side edge. 21 Bunk: 1675 \u2192 1655." },
  LADDER_WEB_MM: { value: 80, doc: "Partition between the lower opening and the ladder holes. 21 Bunk: 1325 \u2192 1405." },
  BOOT_ACCESS_WIDTH_MM: { value: 435.5, doc: "Opening in the front partition for the tunnel boot door, from the floor to the deck underside. 21 Bunk: 925 \u2192 1360.5." },
  BOOT_ACCESS_FROM_END_MM: { value: 914.5, doc: "From the ladder-side wall to the near edge of the boot access opening. 21 Bunk: 2275 \u2212 1360.5." },
  SHEET_SHORT_MM: { value: 1200, doc: "Usable short side of a 1220 \xD7 2440 sheet (border removed). Same limit as the partition walls." },
  SHEET_LONG_MM: { value: 2400, doc: "Usable long side of a 1220 \xD7 2440 sheet (border removed). Same limit as the partition walls." },
  SPLIT_ROUND_MM: { value: 10, doc: "A partition too big for one sheet is butt-cut once at its middle, rounded to this. 21 Bunk: 2275 / 2 \u2192 1140." },
  CUBBY_WIDTH_MM: { value: 284, doc: "End cubby at the ladder-side wall: from the end panels' cubby face to that wall. 21 Bunk: end panels at 1975 \u2192 1991, wall at 2275." },
  END_HOLE_SIDE_MM: { value: 80, doc: "Hand hole in each end panel: this far from the partition and from the rear wall. 21 Bunk: 80 \u2192 650 on a 730 deep panel." },
  END_HOLE_TOP_MM: { value: 80, doc: "Hand hole in each end panel: its top edge this far under the panel's top. 21 Bunk: 679.5 on a 759.5 high panel." },
  END_HOLE_HEIGHT_MM: { value: 250, doc: "Hand hole in each end panel: height. 21 Bunk: 429.5 \u2192 679.5." },
  END_HOLE_RADIUS_MM: { value: 30, doc: "Hand hole in each end panel: corner radius. 21 Bunk: R30." },
  BOOT_DOOR_OVERLAP_MM: { value: 10, doc: "The tunnel boot door covers the access opening by this much on each side, on the room face of the partition. 21 Bunk: door 915 \u2192 1370.5 over 925 \u2192 1360.5." },
  BOOT_DOOR_BOTTOM_GAP_MM: { value: 3.5, doc: "Tunnel boot door: gap above the floor. 21 Bunk: 3.5." },
  BOOT_DOOR_TOP_OVERLAP_MM: { value: 8.5, doc: "Tunnel boot door: its top passes the deck underside (the top of the access opening) by this much. 21 Bunk: 400 \u2192 408.5." },
  BOOT_DOOR_LOCK_LENGTH_MM: { value: 55, doc: "The boot flap's catch (\u95E8\u6263): lock slot through the door, overall across, round ends included, centred on the door. 21 Bunk: straight 39 + ends 16 = 55." },
  BOOT_DOOR_LOCK_WIDTH_MM: { value: 16, doc: "Lock slot height; the ends are half circles of half this. 21 Bunk: 357.75 \u2192 373.75." },
  BOOT_DOOR_LOCK_DROP_MM: { value: 30.75, doc: "Lock slot centre below the deck underside, where the catch fastens. 21 Bunk: 400 \u2212 369.25. The kitchen's lock uses 30.5 with a 15.5 slot." },
  BOOT_DOOR_HINGE_DIAMETER_MM: { value: 35, doc: "The boot door is a down flap: hinge cup diameter, on its inside face. Same as every flap." },
  BOOT_DOOR_HINGE_DEPTH_MM: { value: 12, doc: "Flap hinge cup depth (the tall and overhead flaps' 12)." },
  BOOT_DOOR_HINGE_FROM_EDGE_MM: { value: 22.5, doc: "Hinge cup centre up from the flap's bottom (hinge) edge. The hinge plates fix to the sill's top behind the door." },
  BOOT_DOOR_HINGE_FROM_SIDE_MM: { value: 100, doc: "Two hinge cups along the bottom edge, centres this far from each side (the flap rule of the tall and overhead cabinets)." },
  LEDGER_HEIGHT_MM: { value: 100, doc: "Strips under the upper base, cut from the partition stock and standing on edge: one against the rear wall wall to wall, one against the partition from each side wall to the first opening. Their top is the upper base underside. 21 Bunk: 2275 \xD7 100 at the back." },
  SILL_DEPTH_MM: { value: 45, doc: "Tunnel boot sill on the floor: the part behind the boot's inner sides, into the boot. 21 Bunk: 45." },
  SILL_OVERHANG_MM: { value: 55, doc: "The sill runs this far past its tongue on each side, behind the inner sides. 21 Bunk: 545 = 435 + 2 \xD7 55." },
  SILL_TONGUE_CLEARANCE_MM: { value: 0.5, doc: "The sill's tongue fills the access opening through the partition and the inner side, this much short, flush on the side away from the ladder. 21 Bunk: 435 in a 435.5 opening." },
  SILL_RELIEF_DIAMETER_MM: { value: 11, doc: "Router relief at the two inner corners where the tongue meets the sill: a half circle cut into the sill along its edge, so the inner sides' square corners seat. 21 Bunk: \xD811 (router 10 + 1)." }
};

// generators/bunkBed/rules.ts
var RULES = defineRules("bunkBed", rules_default);

// generators/bunkBed/generator.ts
var DEFAULT_COLOR = "White Stipple";
function round12(n) {
  return Math.round(n * 10) / 10;
}
var r32 = (n) => Math.round(n * 1e3) / 1e3;
function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}
function bunkUpperLimits(p) {
  const up = RULES.UPPER_BASE_THICKNESS_MM.value;
  const clear = RULES.BUNK_CLEAR_MIN_MM.value;
  return {
    min: round12(p.deckTop + clear),
    max: round12(p.height - up - clear),
    equal: round12((p.deckTop + p.height - up) / 2)
  };
}
function bunkMinSize() {
  return {
    W: RULES.LENGTH_MIN_MM.value,
    D: RULES.DEPTH_MIN_MM.value,
    H: round12(RULES.BOOT_HEIGHT_MIN_MM.value + RULES.DECK_THICKNESS_MM.value + 2 * RULES.BUNK_CLEAR_MIN_MM.value + RULES.UPPER_BASE_THICKNESS_MM.value)
  };
}
function box(y0, y1, z0, z1) {
  return [{ y: y0, z: z0 }, { y: y1, z: z0 }, { y: y1, z: z1 }, { y: y0, z: z1 }, { y: y0, z: z0 }];
}
function generateBunkBed(raw, options = {}) {
  const errors = [];
  const warnings = [];
  const W = round12(num(raw.length, 0));
  const D = round12(num(raw.depth, RULES.DEPTH_DEFAULT_MM.value));
  const H = round12(num(raw.height, 0));
  const deckTopIn = round12(num(raw.deckTop, RULES.DECK_TOP_DEFAULT_MM.value));
  const upperZIn = round12(num(raw.upperZ, bunkUpperLimits({ deckTop: deckTopIn, height: H }).equal));
  const endSide = raw.endSide === "LEFT" ? "LEFT" : "RIGHT";
  const right = endSide === "RIGHT";
  const floorClearance = round12(num(raw.floorClearance, 0));
  const ceilingClearance = round12(num(raw.ceilingClearance, 0));
  const T = round12(num(raw.partitionThickness, RULES.PARTITION_THICKNESS_DEFAULT_MM.value));
  const Tc = round12(num(raw.carcassThickness, 15));
  const Td = round12(num(raw.doorThickness, 16));
  const color = String(raw.carcassColorName || DEFAULT_COLOR);
  const doorColour = doorColourOf(raw);
  const lowerColour = doorColourBOf(raw);
  const doorSides = doorSidesOf(raw);
  beginProvenance();
  const P = param({ W, D, H, deckTop: deckTopIn, upperZ: upperZIn, floorClearance, T, Tc, Td });
  const deckTop = dim("deck.z1", { deckTop: P.deckTop }, (t) => t.deckTop);
  const bootTop = dim("boot.z1", { top: ref("deck.z1"), T: RULES.DECK_THICKNESS_MM }, (t) => t.top - t.T);
  dim("deck.z0", { z: ref("boot.z1") }, (t) => t.z, { formula: "= boot.z1" });
  const upperZ = dim("upperBase.z0", { upperZ: P.upperZ }, (t) => t.upperZ);
  const upperTop = dim("upperBase.z1", { z0: ref("upperBase.z0"), T: RULES.UPPER_BASE_THICKNESS_MM }, (t) => t.z0 + t.T);
  const lowerClear = dim("lower.clear", { top: ref("upperBase.z0"), bottom: ref("deck.z1") }, (t) => t.top - t.bottom);
  const upperClear = dim("upper.clear", { H: P.H, bottom: ref("upperBase.z1") }, (t) => t.H - t.bottom);
  const mattress = dim("mattress.width", { D: P.D, T: P.T }, (t) => t.D - t.T);
  const partZ0 = dim("partition.z0", { floorClearance: P.floorClearance }, (t) => t.floorClearance);
  const partZ1 = dim("partition.z1", { H: P.H }, (t) => t.H);
  const lowZ0 = dim("opening.lower.z0", { deckTop: ref("deck.z1"), RAIL: RULES.LOWER_RAIL_MM }, (t) => t.deckTop + t.RAIL);
  const lowZ1 = dim("opening.lower.z1", { underside: ref("upperBase.z0"), LIP: RULES.UPPER_BASE_LIP_MM }, (t) => t.underside - t.LIP);
  const upZ0 = dim("opening.upper.z0", { top: ref("upperBase.z1"), RAIL: RULES.UPPER_RAIL_MM }, (t) => t.top + t.RAIL);
  const holeH = dim("ladder.h", { z0: ref("opening.lower.z0"), z1: ref("opening.lower.z1"), N: RULES.LADDER_HOLE_COUNT, GAP: RULES.LADDER_HOLE_GAP_MM }, (t) => (t.z1 - t.z0 - (t.N - 1) * t.GAP) / t.N, { formula: "(z1 - z0 - (N - 1) * GAP) / N" });
  const fromLadder = (key, terms, d, f) => dim(key, { W: P.W, ...terms }, (t) => right ? t.W - d(t) : d(t), { formula: right ? `W - (${f})` : f });
  const fromFar = (key, terms, d, f) => dim(key, { W: P.W, ...terms }, (t) => right ? d(t) : t.W - d(t), { formula: right ? f : `W - (${f})` });
  const M = RULES.OPENING_WALL_MARGIN_MM;
  const upFar = fromFar("opening.upper.far", { M }, (t) => t.M, "M");
  const upLadder = fromLadder("opening.upper.ladder", { M }, (t) => t.M, "M");
  const holeNear = fromLadder("ladder.near", { M, EDGE: RULES.LADDER_HOLE_EDGE_MM }, (t) => t.M + t.EDGE, "M + EDGE");
  const holeFar = fromLadder("ladder.far", { M, EDGE: RULES.LADDER_HOLE_EDGE_MM, HW: RULES.LADDER_HOLE_WIDTH_MM }, (t) => t.M + t.EDGE + t.HW, "M + EDGE + HW");
  const lowFar = fromFar("opening.lower.far", { M }, (t) => t.M, "M");
  const lowLadder = fromLadder("opening.lower.ladder", { M, EDGE: RULES.LADDER_HOLE_EDGE_MM, HW: RULES.LADDER_HOLE_WIDTH_MM, WEB: RULES.LADDER_WEB_MM }, (t) => t.M + t.EDGE + t.HW + t.WEB, "M + EDGE + HW + WEB");
  const accNear = fromLadder("access.near", { FROM: RULES.BOOT_ACCESS_FROM_END_MM }, (t) => t.FROM, "FROM");
  const accFar = fromLadder("access.far", { FROM: RULES.BOOT_ACCESS_FROM_END_MM, AW: RULES.BOOT_ACCESS_WIDTH_MM }, (t) => t.FROM + t.AW, "FROM + AW");
  const partH = partZ1 - partZ0;
  const fits = (w, h) => w <= RULES.SHEET_SHORT_MM.value && h <= RULES.SHEET_LONG_MM.value || w <= RULES.SHEET_LONG_MM.value && h <= RULES.SHEET_SHORT_MM.value;
  const cut = fits(W, partH) ? null : dim("partition.cut", { W: P.W, ROUND: RULES.SPLIT_ROUND_MM }, (t) => Math.round(t.W / 2 / t.ROUND) * t.ROUND, { formula: "round(W / 2 / ROUND) * ROUND" });
  if (W < RULES.LENGTH_MIN_MM.value) errors.push(`the bunk is only ${W} mm long \u2014 at least ${RULES.LENGTH_MIN_MM.value}`);
  if (D < RULES.DEPTH_MIN_MM.value) errors.push(`the bunk is only ${D} mm deep \u2014 at least ${RULES.DEPTH_MIN_MM.value}`);
  if (bootTop < RULES.BOOT_HEIGHT_MIN_MM.value) errors.push(`the deck top ${deckTop} leaves a ${round12(bootTop)} mm boot \u2014 at least ${RULES.BOOT_HEIGHT_MIN_MM.value}`);
  if (lowerClear < RULES.BUNK_CLEAR_MIN_MM.value) errors.push(`the lower bunk has only ${round12(lowerClear)} mm clear \u2014 at least ${RULES.BUNK_CLEAR_MIN_MM.value}`);
  if (upperClear < RULES.BUNK_CLEAR_MIN_MM.value) errors.push(`the upper bunk has only ${round12(upperClear)} mm clear \u2014 at least ${RULES.BUNK_CLEAR_MIN_MM.value}`);
  if (T <= 0 || T >= D) errors.push(`the front partition is ${T} mm thick in a ${D} mm deep bunk`);
  const span = (a, b) => [Math.min(a, b), Math.max(a, b)];
  const rOpen = RULES.OPENING_RADIUS_MM.value;
  const rHole = RULES.LADDER_HOLE_RADIUS_MM.value;
  const upX = span(upFar, upLadder);
  const lowX = span(lowFar, lowLadder);
  const holeX = span(holeNear, holeFar);
  const accX = span(accNear, accFar);
  if (!errors.length) {
    if (accX[0] < 0 || accX[1] > W) errors.push(`the boot access (${round12(accX[0])} \u2192 ${round12(accX[1])}) runs past the side walls`);
    if (lowX[1] - lowX[0] < 2 * rOpen) errors.push(`the lower opening is only ${round12(lowX[1] - lowX[0])} mm wide \u2014 the bunk is too short for the opening, the ladder and the margins`);
    if (lowZ1 - lowZ0 < 2 * rOpen) errors.push(`the lower opening is only ${round12(lowZ1 - lowZ0)} mm high`);
    if (holeH < 2 * rHole) errors.push(`the ladder holes are only ${round12(holeH)} mm high`);
    if (upZ0 > partZ1 - rOpen) errors.push(`no room for the upper opening: it would start at ${round12(upZ0)} under a ${round12(partZ1)} top`);
  }
  const boards = [];
  const joints = [];
  if (!errors.length) {
    const outer = flatten(notchedOutline(W, partZ0, partZ1, accX, bootTop, upX, upZ0, rOpen));
    const holes = [
      flatten(reverseRing(roundedRect(lowX[0], lowX[1], lowZ0, lowZ1, rOpen))),
      ...Array.from({ length: RULES.LADDER_HOLE_COUNT.value }, (_, i) => {
        const z0 = dim(`ladder${i + 1}.z0`, { z0: ref("opening.lower.z0"), h: ref("ladder.h"), GAP: RULES.LADDER_HOLE_GAP_MM, i }, (t) => t.z0 + t.i * (t.h + t.GAP), { formula: "z0 + i * (h + GAP)" });
        return flatten(reverseRing(roundedRect(holeX[0], holeX[1], z0, z0 + holeH, rHole)));
      })
    ];
    let pieces = [{ outer, holes }];
    if (cut != null) {
      const left = cutAt(outer, holes, cut, true);
      const rightSide = cutAt(outer, holes, cut, false);
      pieces = left && rightSide ? [...left, ...rightSide] : null;
      if (!pieces) errors.push(`the sheet cut at ${cut} lands on a corner of an opening`);
    }
    if (pieces) {
      pieces.sort((a, b) => Math.min(...a.outer.map((p) => p.u)) - Math.min(...b.outer.map((p) => p.u)));
      pieces.forEach((pc, i) => {
        const id = pieces.length === 1 ? "FP" : `FP_${i + 1}`;
        const name = pieces.length === 1 ? "Front partition" : `Front partition \xB7 ${i === 0 ? "left" : i === pieces.length - 1 ? "right" : `part ${i + 1}`}`;
        boards.push(partitionBoard(id, name, pc, T, color, partZ0, partZ1));
      });
      for (const b of boards) {
        const w = b.x1 - b.x0;
        const h = b.z1 - b.z0;
        if (!fits(w, h)) errors.push(`${b.id} is ${round12(w)} \xD7 ${round12(h)} mm \u2014 past the ${RULES.SHEET_SHORT_MM.value} \xD7 ${RULES.SHEET_LONG_MM.value} sheet`);
      }
      for (let i = 1; i < boards.length; i += 1) {
        const a = boards[i - 1];
        const b = boards[i];
        joints.push(joint(`${a.id}_${b.id}_cut`, "butt", faceRef(a.id, boundaryEdgeFaces(a, "+X")), faceRef(b.id, boundaryEdgeFaces(b, "-X")), { hardware: [], rule: "bunk_partition_sheet_cut_v1" }));
      }
    }
  }
  const accLo = right ? "access.far" : "access.near";
  const accHi = right ? "access.near" : "access.far";
  let layoutDoor = null;
  let layoutCubby = null;
  if (!errors.length) {
    const F = (id, f, terms, fn, formula) => dim(`${id}.${f}`, terms, fn, { formula });
    const Z0 = (id, f) => dim(`${id}.${f}`, {}, () => 0, { formula: "0" });
    const carcass = { kind: "carcass", thickness: Tc, colour: color };
    const partition = (t) => ({ kind: "partition", thickness: t, colour: color });
    const door = { kind: "door", thickness: Td, colour: doorColour, sides: doorSides === "double" ? 2 : 1 };
    const inBoot = (id) => ({ y0: F(id, "y0", { T: P.T }, (t) => t.T, "T"), y1: F(id, "y1", { T: P.T, Tc: P.Tc }, (t) => t.T + t.Tc, "T + Tc") });
    const bootZ = (id) => ({ z0: Z0(id, "z0"), z1: F(id, "z1", { z: ref("boot.z1") }, (t) => t.z, "= boot.z1") });
    const back = boxBoard("BOOT_BACK", "Tunnel boot \xB7 back", "boot_back", "XZ", "Y", carcass, {
      x0: Z0("BOOT_BACK", "x0"),
      x1: F("BOOT_BACK", "x1", { W: P.W }, (t) => t.W, "W"),
      y0: F("BOOT_BACK", "y0", { D: P.D, Tc: P.Tc }, (t) => t.D - t.Tc, "D - Tc"),
      y1: F("BOOT_BACK", "y1", { D: P.D }, (t) => t.D, "D"),
      ...bootZ("BOOT_BACK")
    });
    const sideL = boxBoard("BOOT_SIDE_L", "Tunnel boot \xB7 inner side \xB7 left", "boot_side", "XZ", "Y", carcass, {
      x0: Z0("BOOT_SIDE_L", "x0"),
      x1: F("BOOT_SIDE_L", "x1", { x: ref(accLo) }, (t) => t.x, `= ${accLo}`),
      ...inBoot("BOOT_SIDE_L"),
      ...bootZ("BOOT_SIDE_L")
    });
    const sideR = boxBoard("BOOT_SIDE_R", "Tunnel boot \xB7 inner side \xB7 right", "boot_side", "XZ", "Y", carcass, {
      x0: F("BOOT_SIDE_R", "x0", { x: ref(accHi) }, (t) => t.x, `= ${accHi}`),
      x1: F("BOOT_SIDE_R", "x1", { W: P.W }, (t) => t.W, "W"),
      ...inBoot("BOOT_SIDE_R"),
      ...bootZ("BOOT_SIDE_R")
    });
    const flat = (id, name, role, t, z0, z1) => boxBoard(id, name, role, "XY", "Z", partition(t), {
      x0: Z0(id, "x0"),
      x1: F(id, "x1", { W: P.W }, (v) => v.W, "W"),
      y0: F(id, "y0", { T: P.T }, (v) => v.T, "T"),
      y1: F(id, "y1", { D: P.D }, (v) => v.D, "D"),
      z0: F(id, "z0", { z: ref(z0) }, (v) => v.z, `= ${z0}`),
      z1: F(id, "z1", { z: ref(z1) }, (v) => v.z, `= ${z1}`)
    });
    const deck = flat("DECK", "Lower deck", "deck", RULES.DECK_THICKNESS_MM.value, "deck.z0", "deck.z1");
    const upper = flat("UPPER_BASE", "Upper base", "upper_base", RULES.UPPER_BASE_THICKNESS_MM.value, "upperBase.z0", "upperBase.z1");
    const LH = RULES.LEDGER_HEIGHT_MM;
    const ledgerZ = (id) => ({
      z1: F(id, "z1", { z: ref("upperBase.z0") }, (t) => t.z, "= upperBase.z0"),
      z0: F(id, "z0", { z: ref("upperBase.z0"), LH }, (t) => t.z - t.LH, "upperBase.z0 - LH")
    });
    const ledgerBack = boxBoard("LEDGER_BACK", "Upper base strip \xB7 rear wall", "ledger", "XZ", "Y", partition(T), {
      x0: Z0("LEDGER_BACK", "x0"),
      x1: F("LEDGER_BACK", "x1", { W: P.W }, (t) => t.W, "W"),
      y0: F("LEDGER_BACK", "y0", { D: P.D, T: P.T }, (t) => t.D - t.T, "D - T"),
      y1: F("LEDGER_BACK", "y1", { D: P.D }, (t) => t.D, "D"),
      ...ledgerZ("LEDGER_BACK")
    });
    const frontLedger = (id, name, lo, hi) => boxBoard(id, name, "ledger", "XZ", "Y", partition(T), {
      x0: lo ? F(id, "x0", { x: ref(lo.key) }, (t) => t.x, `= ${lo.key}`) : Z0(id, "x0"),
      x1: hi ? F(id, "x1", { x: ref(hi.key) }, (t) => t.x, `= ${hi.key}`) : F(id, "x1", { W: P.W }, (t) => t.W, "W"),
      y0: F(id, "y0", { T: P.T }, (t) => t.T, "T"),
      y1: F(id, "y1", { T: P.T }, (t) => 2 * t.T, "2 * T"),
      ...ledgerZ(id)
    });
    const ledgerL = frontLedger("LEDGER_FRONT_L", "Upper base strip \xB7 partition \xB7 left", null, { key: right ? "opening.lower.far" : "ladder.near" });
    const ledgerR = frontLedger("LEDGER_FRONT_R", "Upper base strip \xB7 partition \xB7 right", { key: right ? "ladder.near" : "opening.lower.far" }, null);
    const ladderLedger = right ? ledgerR : ledgerL;
    for (const b of [ledgerBack, ledgerL, ledgerR]) {
      annotate(b, "A", { visible: true, finish: { colour: color } });
      annotate(b, "B", { visible: true, finish: { colour: color } });
    }
    const cubby = fromLadder("cubby.face", { CUBBY: RULES.CUBBY_WIDTH_MM }, (t) => t.CUBBY, "CUBBY");
    const ex0 = right ? cubby - Td : cubby;
    const ex1 = right ? cubby : cubby + Td;
    const bunkFace = right ? ex0 : ex1;
    if (right ? bunkFace < upLadder : bunkFace > upLadder) errors.push(`the end cubby (${RULES.CUBBY_WIDTH_MM.value} wide) reaches into the upper opening`);
    const passes = (b) => b.x0 <= ex0 + 1e-6 && b.x1 >= ex1 - 1e-6;
    const endPanel = (id, name, z0, z1, strips = [], paint = doorColour) => {
      const b = boxBoard(id, name, "end_panel", "YZ", "X", door, {
        x0: F(id, "x0", { face: ref("cubby.face"), Td: P.Td }, (t) => right ? t.face - t.Td : t.face, right ? "face - Td" : "= cubby.face"),
        x1: F(id, "x1", { face: ref("cubby.face"), Td: P.Td }, (t) => right ? t.face : t.face + t.Td, right ? "= cubby.face" : "face + Td"),
        y0: F(id, "y0", { T: P.T }, (t) => t.T, "T"),
        y1: F(id, "y1", { D: P.D }, (t) => t.D, "D"),
        z0: F(id, "z0", { z: ref(z0) }, (t) => t.z, `= ${z0}`),
        z1: z1 === "H" ? F(id, "z1", { H: P.H }, (t) => t.H, "H") : F(id, "z1", { z: ref(z1) }, (t) => t.z, `= ${z1}`)
      });
      const h = b.z1 - b.z0;
      const front = strips.find((s) => Math.abs(s.y0 - b.y0) < 1e-6 && passes(s));
      const rear = strips.find((s) => Math.abs(s.y1 - b.y1) < 1e-6 && passes(s));
      if (front || rear) {
        const nz = b.z1 - LH.value;
        const o = new Outline(`${id}.pv`, ["y", "z"]);
        const ring = [[b.y0, b.z0], [b.y1, b.z0]];
        ring.push(...rear ? [[b.y1, nz], [rear.y0, nz], [rear.y0, b.z1]] : [[b.y1, b.z1]]);
        ring.push(...front ? [[front.y1, b.z1], [front.y1, nz], [b.y0, nz]] : [[b.y0, b.z1]]);
        for (const [y, z] of ring) o.add(lit(r32(y)), lit(r32(z)));
        b.profileVector = [...o.points.map(([y, z]) => ({ y, z })), { y: o.points[0][0], z: o.points[0][1] }];
        attachFaces([b]);
        for (const s of [front, rear]) {
          if (!s) continue;
          const box2 = { u0: s.y0 - b.y0 - 0.01, u1: s.y1 - b.y0 + 0.01, v0: nz - b.z0 - 0.01, v1: h + 0.01 };
          const tags = tagEdges(b, "notch", box2, { id: `${id}_NOTCH_${s.id}`, for: s.id, key: `${id}.pv`, source: "bunkBed.ledger" });
          joints.push(joint(`${id}_${s.id}_notch`, "notch", faceRef(id, tags), faceRef(s.id, ["A", "B"]), { hardware: [], rule: "bunk_ledger_through_end_panel_v1" }));
        }
      }
      const u0 = F(id, "hole.u0", { SIDE: RULES.END_HOLE_SIDE_MM }, (t) => t.SIDE, "SIDE");
      const u1 = F(id, "hole.u1", { deep: b.y1 - b.y0, SIDE: RULES.END_HOLE_SIDE_MM }, (t) => t.deep - t.SIDE, "deep - SIDE");
      const v1 = F(id, "hole.v1", { h, TOP: RULES.END_HOLE_TOP_MM }, (t) => t.h - t.TOP, "h - TOP");
      const v0 = F(id, "hole.v0", { v1: ref(`${id}.hole.v1`), HH: RULES.END_HOLE_HEIGHT_MM }, (t) => t.v1 - t.HH, "v1 - HH");
      if (u1 - u0 < 2 * RULES.END_HOLE_RADIUS_MM.value || v0 < RULES.END_HOLE_RADIUS_MM.value) errors.push(`${id}: no room for its hand hole`);
      else throughCutout(b, `${id}_HOLE`, flatten(roundedRect(u0, u1, v0, v1, RULES.END_HOLE_RADIUS_MM.value)), "hand_hole");
      paintDoorStock(b, right ? "B" : "A", paint, color);
      return b;
    };
    const endLower = endPanel("END_LOWER", "End panel \xB7 lower bunk", "deck.z1", "upperBase.z0", [ladderLedger, ledgerBack], lowerColour);
    const endUpper = endPanel("END_UPPER", "End panel \xB7 upper bunk", "upperBase.z1", "H");
    layoutCubby = right ? { x0: round12(cubby), x1: W } : { x0: 0, x1: round12(cubby) };
    const OV = RULES.BOOT_DOOR_OVERLAP_MM;
    const bootDoor = boxBoard("BOOT_DOOR", "Tunnel boot flap", "boot_door", "XZ", "Y", door, {
      x0: F("BOOT_DOOR", "x0", { x: ref(accLo), OV }, (t) => t.x - t.OV, `${accLo} - OV`),
      x1: F("BOOT_DOOR", "x1", { x: ref(accHi), OV }, (t) => t.x + t.OV, `${accHi} + OV`),
      y0: F("BOOT_DOOR", "y0", { Td: P.Td }, (t) => -t.Td, "-Td"),
      y1: Z0("BOOT_DOOR", "y1"),
      z0: F("BOOT_DOOR", "z0", { GAP: RULES.BOOT_DOOR_BOTTOM_GAP_MM }, (t) => t.GAP, "GAP"),
      z1: F("BOOT_DOOR", "z1", { z: ref("boot.z1"), TOP: RULES.BOOT_DOOR_TOP_OVERLAP_MM }, (t) => t.z + t.TOP, "boot.z1 + TOP")
    });
    {
      const w = bootDoor.x1 - bootDoor.x0;
      const cu = F("BOOT_DOOR", "lock.u", { w }, (t) => t.w / 2, "w / 2");
      const cv = F("BOOT_DOOR", "lock.v", { deck: ref("boot.z1"), DROP: RULES.BOOT_DOOR_LOCK_DROP_MM, z0: ref("BOOT_DOOR.z0") }, (t) => t.deck - t.DROP - t.z0, "boot.z1 - DROP - z0");
      const L = RULES.BOOT_DOOR_LOCK_LENGTH_MM.value;
      const Wl = RULES.BOOT_DOOR_LOCK_WIDTH_MM.value;
      addFeature(bootDoor, "A", {
        id: "BOOT_DOOR_LOCK",
        kind: "cutout",
        u0: r32(cu - L / 2),
        u1: r32(cu + L / 2),
        v0: r32(cv - Wl / 2),
        v1: r32(cv + Wl / 2),
        radius: Wl / 2,
        through: true,
        for: "lock",
        key: "BOOT_DOOR.lock"
      });
      const hv = F("BOOT_DOOR", "hinge.v", { EDGE: RULES.BOOT_DOOR_HINGE_FROM_EDGE_MM }, (t) => t.EDGE, "EDGE");
      const hu = [
        F("BOOT_DOOR", "hinge1.u", { SIDE: RULES.BOOT_DOOR_HINGE_FROM_SIDE_MM }, (t) => t.SIDE, "SIDE"),
        F("BOOT_DOOR", "hinge2.u", { w, SIDE: RULES.BOOT_DOOR_HINGE_FROM_SIDE_MM }, (t) => t.w - t.SIDE, "w - SIDE")
      ];
      hu.forEach((u, i) => addFeature(bootDoor, "A", {
        id: `BOOT_DOOR_HINGE_${i + 1}`,
        kind: "hole",
        center: [r32(u), r32(hv)],
        diameter: RULES.BOOT_DOOR_HINGE_DIAMETER_MM.value,
        depth: RULES.BOOT_DOOR_HINGE_DEPTH_MM.value,
        through: false,
        for: "hinge",
        key: `BOOT_DOOR.hinge${i + 1}`
      }));
    }
    paintDoorStock(bootDoor, "B", lowerColour, color);
    layoutDoor = { x0: bootDoor.x0, x1: bootDoor.x1, y0: bootDoor.y0, y1: bootDoor.y1, z0: bootDoor.z0, z1: bootDoor.z1 };
    const CL = RULES.SILL_TONGUE_CLEARANCE_MM;
    const t0 = F("SILL", "tongue.x0", { x: ref(accLo), CL }, (t) => right ? t.x : t.x + t.CL, right ? `= ${accLo}` : `${accLo} + CL`);
    const t1 = F("SILL", "tongue.x1", { x: ref(accHi), CL }, (t) => right ? t.x - t.CL : t.x, right ? `${accHi} - CL` : `= ${accHi}`);
    const yBody = F("SILL", "body.y0", { T: P.T, Tc: P.Tc }, (t) => t.T + t.Tc, "T + Tc");
    const yBack = F("SILL", "body.y1", { y: ref("SILL.body.y0"), SD: RULES.SILL_DEPTH_MM }, (t) => t.y + t.SD, "y + SD");
    const m0 = F("SILL", "body.x0", { x: ref("SILL.tongue.x0"), OH: RULES.SILL_OVERHANG_MM }, (t) => t.x - t.OH, "tongue.x0 - OH");
    const m1 = F("SILL", "body.x1", { x: ref("SILL.tongue.x1"), OH: RULES.SILL_OVERHANG_MM }, (t) => t.x + t.OH, "tongue.x1 + OH");
    const sill = outlinedBoard("SILL", "Tunnel boot sill", "sill", "XY", "Z", partition(T), flatten(sillOutline(m0, m1, t0, t1, yBody, yBack, RULES.SILL_RELIEF_DIAMETER_MM.value)), 0, T);
    annotate(sill, "A", { semantic: "top", visible: true, finish: { colour: color } });
    annotate(sill, "B", { semantic: "floor", visible: false, finish: { colour: color } });
    for (const b of [back, sideL, sideR]) {
      annotate(b, back === b ? "B" : "A", { semantic: "inside", visible: true, finish: { colour: color } });
      annotate(b, back === b ? "A" : "B", { semantic: back === b ? "wall" : "partition", visible: false, finish: { colour: color } });
    }
    for (const b of [deck, upper]) {
      annotate(b, "A", { semantic: "mattress", visible: true, finish: { colour: color } });
      annotate(b, "B", { semantic: "underside", visible: true, finish: { colour: color } });
    }
    boards.push(back, sideL, sideR, deck, upper, ledgerL, ledgerR, ledgerBack, endLower, endUpper, bootDoor, sill);
    const top = (b) => boundaryEdgeFaces(b, "+Z");
    const bottom = (b) => boundaryEdgeFaces(b, "-Z");
    joints.push(
      joint("DECK_on_BOOT_BACK", "butt", faceRef("DECK", ["B"]), faceRef("BOOT_BACK", top(back)), { hardware: [], rule: "bunk_deck_on_boot_v1" }),
      joint("DECK_on_BOOT_SIDE_L", "butt", faceRef("DECK", ["B"]), faceRef("BOOT_SIDE_L", top(sideL)), { hardware: [], rule: "bunk_deck_on_boot_v1" }),
      joint("DECK_on_BOOT_SIDE_R", "butt", faceRef("DECK", ["B"]), faceRef("BOOT_SIDE_R", top(sideR)), { hardware: [], rule: "bunk_deck_on_boot_v1" }),
      joint("END_LOWER_on_DECK", "butt", faceRef("DECK", ["A"]), faceRef("END_LOWER", bottom(endLower)), { hardware: [], rule: "bunk_end_panel_v1" }),
      joint("END_LOWER_under_UPPER_BASE", "butt", faceRef("UPPER_BASE", ["B"]), faceRef("END_LOWER", top(endLower)), { hardware: [], rule: "bunk_end_panel_v1" }),
      joint("END_UPPER_on_UPPER_BASE", "butt", faceRef("UPPER_BASE", ["A"]), faceRef("END_UPPER", bottom(endUpper)), { hardware: [], rule: "bunk_end_panel_v1" }),
      ...[ledgerL, ledgerR, ledgerBack].map((s) => joint(`UPPER_BASE_on_${s.id}`, "butt", faceRef("UPPER_BASE", ["B"]), faceRef(s.id, top(s)), { hardware: [], rule: "bunk_upper_base_on_ledger_v1" })),
      joint("BOOT_DOOR_hinge_SILL", "hinge", faceRef("BOOT_DOOR", ["A"]), faceRef("SILL", ["A"]), { hardware: ["flap_hinge", "flap_hinge"], rule: "bunk_boot_flap_v1" })
    );
    for (const b of [back, sideL, sideR, deck, upper, ledgerL, ledgerR, ledgerBack, endLower, endUpper, bootDoor, sill]) {
      const dims = [b.x1 - b.x0, b.y1 - b.y0, b.z1 - b.z0].sort((a, c) => c - a);
      if (!fits(dims[0], dims[1])) errors.push(`${b.id} is ${round12(dims[0])} \xD7 ${round12(dims[1])} mm \u2014 past the ${RULES.SHEET_SHORT_MM.value} \xD7 ${RULES.SHEET_LONG_MM.value} sheet`);
    }
  }
  const grain = applyGrain(boards, (b) => b.stock?.kind === "door" ? b.role === "end_panel" ? "side" : "front" : null, raw, { front: "horizontal", side: "vertical" });
  applyDoorSides(boards, { doorSides, carcassColorName: color });
  applyLayoutDraft(boards, options.layout != null ? options.layout : LAYOUT, {}, errors, warnings, { endSide });
  const provenance = endProvenance();
  const zone = (id, label, kind, z0, z1, made = []) => ({
    id,
    label,
    kind,
    x0: 0,
    x1: W,
    y0: T,
    y1: D,
    z0: round12(z0),
    z1: round12(z1),
    roofTop: false,
    outlineYZ: box(T, D, round12(z0), round12(z1)),
    ...made.length ? { boards: made } : {}
  });
  const zones = errors.length ? [] : [
    zone("boot", "Tunnel boot", "solid", 0, bootTop, ["BOOT_BACK", "BOOT_SIDE_L", "BOOT_SIDE_R", "SILL"]),
    zone("deck", "Lower deck", "solid", bootTop, deckTop, ["DECK"]),
    zone("lower", "Lower bunk", "void", deckTop, upperZ),
    zone("upperBase", "Upper base", "solid", upperZ, upperTop, ["UPPER_BASE", "LEDGER_FRONT_L", "LEDGER_FRONT_R", "LEDGER_BACK"]),
    zone("upper", "Upper bunk", "void", upperTop, H)
  ];
  const out = errors.length ? [] : boards;
  return {
    params: {
      length: W,
      depth: D,
      height: H,
      deckTop,
      upperZ,
      endSide,
      floorClearance,
      ceilingClearance,
      partitionThickness: T,
      carcassThickness: Tc,
      doorThickness: Td,
      carcassColorName: color,
      doorColorName: doorColour,
      doorSides,
      frontPanelThickness: 0
    },
    zones,
    boards: out,
    joints: errors.length ? [] : joints,
    features: [],
    grain: errors.length ? { ...grain, issues: [] } : grain,
    milling: applyMilling(out),
    layout: {
      bootTop: round12(bootTop),
      deckTop: round12(deckTop),
      upperZ: round12(upperZ),
      upperTop: round12(upperTop),
      lowerClear: round12(lowerClear),
      upperClear: round12(upperClear),
      mattressWidth: round12(mattress),
      partition: {
        thickness: T,
        z0: round12(partZ0),
        z1: round12(partZ1),
        floorClearance,
        ceilingClearance,
        cut,
        lowerOpening: { x0: lowX[0], x1: lowX[1], z0: round12(lowZ0), z1: round12(lowZ1) },
        upperOpening: { x0: upX[0], x1: upX[1], z0: round12(upZ0) },
        ladder: { x0: holeX[0], x1: holeX[1], h: round12(holeH) },
        bootAccess: { x0: accX[0], x1: accX[1], z1: round12(bootTop) }
      },
      bootDoor: layoutDoor,
      cubby: layoutCubby,
      endSide
    },
    validation: { errors, warnings },
    debug: { boardFrame: "final", provenance }
  };
}
function boxBoard(id, name, role, plane, axis, stock, f) {
  const b = {
    id,
    name,
    category: role,
    role,
    boardType: "panel",
    materialThickness: stock.thickness,
    profilePlane: plane,
    thicknessAxis: axis,
    stock,
    x0: round12(f.x0),
    x1: round12(f.x1),
    y0: round12(f.y0),
    y1: round12(f.y1),
    z0: round12(f.z0),
    z1: round12(f.z1),
    source: "bunkBed"
  };
  attachFaces([b]);
  return b;
}
function outlinedBoard(id, name, role, plane, axis, stock, ring, z0, z1) {
  const o = new Outline(`${id}.pv`, ["x", "y"]);
  for (const p of ring) o.add(lit(r32(p.u)), lit(r32(p.v)));
  const xs = o.points.map((p) => p[0]);
  const ys = o.points.map((p) => p[1]);
  const box6 = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  const b = {
    id,
    name,
    category: role,
    role,
    boardType: "panel",
    materialThickness: stock.thickness,
    profilePlane: plane,
    thicknessAxis: axis,
    stock,
    x0: dim(`${id}.x0`, {}, () => box6.x0, { formula: String(box6.x0) }),
    x1: dim(`${id}.x1`, {}, () => box6.x1, { formula: String(box6.x1) }),
    y0: dim(`${id}.y0`, {}, () => box6.y0, { formula: String(box6.y0) }),
    y1: dim(`${id}.y1`, {}, () => box6.y1, { formula: String(box6.y1) }),
    z0: dim(`${id}.z0`, {}, () => z0, { formula: String(z0) }),
    z1: dim(`${id}.z1`, { T: z1 }, (t) => t.T, { formula: "T" }),
    profileVector: [...o.points.map(([x, y]) => ({ x, y })), { x: o.points[0][0], y: o.points[0][1] }],
    tessellated: true,
    source: "bunkBed"
  };
  attachFaces([b]);
  return b;
}
function throughCutout(b, id, loop, purpose) {
  const pts = loop.map((p) => [r32(p.u), r32(p.v)]);
  const us = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1]);
  addFeature(b, "A", { id, kind: "cutout", through: true, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), loop: pts, key: id, for: purpose });
}
function paintDoorStock(b, face, doorColour, carcassColour) {
  annotate(b, face, { semantic: "outside", visible: true, finish: { colour: doorColour } });
  annotate(b, face === "A" ? "B" : "A", { semantic: "back", visible: false, finish: { colour: carcassColour } });
}
function partitionBoard(id, name, pc, T, color, partZ0, partZ1) {
  const o = new Outline(`${id}.pv`, ["x", "z"]);
  for (const p of pc.outer) o.add(lit(r32(p.u)), lit(r32(p.v)));
  const xs = o.points.map((p) => p[0]);
  const zs = o.points.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const z0 = Math.min(...zs);
  const z1 = Math.max(...zs);
  const zDim = (key, v, whole, of) => Math.abs(v - whole) < 1e-6 ? dim(key, { v: ref(of) }, (t) => t.v, { formula: `= ${of}` }) : dim(key, {}, () => v, { formula: String(v) });
  const b = {
    id,
    name,
    category: "partition",
    role: "front_partition",
    boardType: "panel",
    materialThickness: T,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    stock: { kind: "partition", thickness: T, colour: color },
    x0: dim(`${id}.x0`, {}, () => x0, { formula: String(x0) }),
    x1: dim(`${id}.x1`, {}, () => Math.max(...xs), { formula: String(Math.max(...xs)) }),
    y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
    y1: dim(`${id}.y1`, { T }, (t) => t.T, { formula: "T" }),
    z0: zDim(`${id}.z0`, z0, partZ0, "partition.z0"),
    z1: zDim(`${id}.z1`, z1, partZ1, "partition.z1"),
    profileVector: [...o.points.map(([x, z]) => ({ x, z })), { x: o.points[0][0], z: o.points[0][1] }],
    tessellated: true,
    source: "bunkBed"
  };
  attachFaces([b]);
  pc.holes.forEach((loop, i) => {
    const pts = loop.map((p) => [r32(p.u - x0), r32(p.v - z0)]);
    const us = pts.map((p) => p[0]);
    const vs = pts.map((p) => p[1]);
    addFeature(b, "A", { id: `${id}_HOLE_${i + 1}`, kind: "cutout", through: true, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), loop: pts, key: `${id}.hole${i}` });
  });
  annotate(b, "B", { semantic: "front", visible: true, finish: { colour: color } });
  annotate(b, "A", { semantic: "inside", visible: true, finish: { colour: color } });
  return b;
}
export {
  RULES,
  bunkMinSize,
  bunkUpperLimits,
  generateBunkBed
};
