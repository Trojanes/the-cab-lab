// Generated from generators/generalTall/generator.ts - do not edit.

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

// generators/generalTall/layout.json
var layout_default = {
  module: "generalTall",
  version: 1,
  boards: {}
};

// generators/generalTall/layout.ts
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
  const present2 = /* @__PURE__ */ new Set();
  for (const b of boards) {
    const group = groupOf(b);
    if (!group) continue;
    const faces = colourFacesOf(b);
    if (!faces.length) continue;
    const dir = grainOf(params, group, defaults);
    groups[group] = dir;
    present2.add(group);
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
  return { groups, present: [...present2], checked, issues };
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

// generators/_lib/recordBox.ts
function recordBoardBox(id, x0, x1, y0, y1, z0, z1) {
  return {
    x0: dim(`${id}.x0`, { x0 }, (t) => t.x0),
    x1: dim(`${id}.x1`, { x1 }, (t) => t.x1),
    y0: dim(`${id}.y0`, { y0 }, (t) => t.y0),
    y1: dim(`${id}.y1`, { y1 }, (t) => t.y1),
    z0: dim(`${id}.z0`, { z0 }, (t) => t.z0),
    z1: dim(`${id}.z1`, { z1 }, (t) => t.z1)
  };
}

// generators/_lib/trace.ts
function evalExpr(e) {
  const values = {};
  for (const [name, term] of Object.entries(e.terms)) values[name] = val(term);
  return e.fn(values);
}
function recordLoop(id, axes, pairs, round = false) {
  const q = (n) => round ? Math.round(n * 1e3) / 1e3 : n;
  return pairs.map(([a, b], i) => {
    const x = q(evalExpr(a));
    const y = q(evalExpr(b));
    dim(`${id}.pv[${i}].${axes[0]}`, a.terms, round ? (t) => q(a.fn(t)) : a.fn, { formula: a.formula });
    dim(`${id}.pv[${i}].${axes[1]}`, b.terms, round ? (t) => q(b.fn(t)) : b.fn, { formula: b.formula });
    return [x, y];
  });
}

// generators/_lib/edgeBand.ts
function outlineOf(b) {
  return localOutline(b) ?? rectOutline(b);
}
function setEdgeBand(b, i, band) {
  if (!Number.isInteger(i) || i < 0) throw new Error(`${b.id}: edge ${i} is not an outline index`);
  const n = outlineOf(b).length;
  if (i >= n) throw new Error(`${b.id}: edge ${i} is past the outline (${n} edges)`);
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

// generators/_lib/resolveJoints.ts
var EPS2 = 0.6;
function overlap(a0, a1, b0, b1) {
  return a0 < b1 - 0.01 && b0 < a1 - 0.01;
}
function contact(a, b) {
  const axes = [
    { axis: "x", a0: a.x0, a1: a.x1, b0: b.x0, b1: b.x1, o1: overlap(a.y0, a.y1, b.y0, b.y1), o2: overlap(a.z0, a.z1, b.z0, b.z1) },
    { axis: "y", a0: a.y0, a1: a.y1, b0: b.y0, b1: b.y1, o1: overlap(a.x0, a.x1, b.x0, b.x1), o2: overlap(a.z0, a.z1, b.z0, b.z1) },
    { axis: "z", a0: a.z0, a1: a.z1, b0: b.z0, b1: b.z1, o1: overlap(a.x0, a.x1, b.x0, b.x1), o2: overlap(a.y0, a.y1, b.y0, b.y1) }
  ];
  let best = null;
  for (const ax of axes) {
    if (!ax.o1 || !ax.o2) continue;
    const gapRight = ax.b0 - ax.a1;
    const gapLeft = ax.a0 - ax.b1;
    if (gapRight >= -EPS2 && (best == null || Math.abs(gapRight) < Math.abs(best.gap))) {
      best = { axis: ax.axis, aSide: "+", gap: gapRight };
    }
    if (gapLeft >= -EPS2 && (best == null || Math.abs(gapLeft) < Math.abs(best.gap))) {
      best = { axis: ax.axis, aSide: "-", gap: gapLeft };
    }
  }
  return best ? { axis: best.axis, aSide: best.aSide } : null;
}
function facesToward(board, axis, side, preferBig) {
  const dir = `${side}${axis.toUpperCase()}`;
  const thick = board.thicknessAxis.toLowerCase();
  if (thick === axis) return [side === "+" ? "A" : "B"];
  if (preferBig) return [];
  return boundaryEdgeFaces(board, dir).map((f) => f.id);
}
function resolveDeclaredJoints(boards, declarations) {
  const B = new Map(boards.map((b) => [b.id, b]));
  const out = [];
  for (const d of declarations) {
    const host = B.get(d.hostPanelId);
    const target = B.get(d.targetPanelId);
    if (!host || !target) continue;
    const c = contact(host, target);
    const faceContact = d.relationshipType === "face_contact";
    const kind = faceContact ? "face_contact" : "butt";
    if (!c) {
      const hostFaces2 = faceContact ? ["A"] : [];
      const targetFaces2 = [];
      out.push(joint(d.declarationId, kind, faceRef(host.id, hostFaces2), faceRef(target.id, targetFaces2), {
        hardware: d.allowedHardware,
        rule: d.ruleId
      }));
      continue;
    }
    const hostFaces = facesToward(host, c.axis, c.aSide, faceContact);
    const targetSide = c.aSide === "+" ? "-" : "+";
    const targetFaces = facesToward(target, c.axis, targetSide, faceContact);
    out.push(joint(d.declarationId, kind, faceRef(host.id, hostFaces), faceRef(target.id, targetFaces), {
      hardware: d.allowedHardware,
      rule: d.ruleId
    }));
  }
  return out;
}

// generators/generalTall/relationshipDeclarations.ts
var D = (declarationId, a, b, relationshipType, geometryType, hw) => ({
  declarationId,
  generator: "generalTall",
  panelAId: a,
  panelBId: b,
  relationshipType,
  geometryType,
  hostPanelId: a,
  targetPanelId: b,
  ruleId: `${declarationId}_v1`,
  allowedHardware: hw
});
var GT_RELATIONSHIP_DECLARATIONS = [
  D("gt_b1_b3_bottom_rail_to_deck", "B1", "B3", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_t1_t3_top_rail_to_insert", "T1", "T3", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_b2_b3_carcass_rail_to_deck", "B2", "B3", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_t2_t3_carcass_rail_to_insert", "T2", "T3", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_sidepanel_l_v1", "SidePanel_L", "V1", "face_contact", "surface_to_surface", []),
  D("gt_sidepanel_r_v2", "SidePanel_R", "V2", "face_contact", "surface_to_surface", []),
  D("gt_v5_v1", "V5", "V1", "face_contact", "surface_to_surface", []),
  D("gt_v5_v2", "V5", "V2", "face_contact", "surface_to_surface", []),
  D("gt_t4_t5_rear_stack", "T4", "T5", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_t5_v3", "T5", "V3", "face_contact", "surface_to_surface", []),
  D("gt_t5_v4", "T5", "V4", "face_contact", "surface_to_surface", []),
  D("gt_th1_fixed_front", "TH1", "TopStyle2FixedFrontPanel", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_bh1_fixed_front", "BH1", "BottomStyle2FixedFrontPanel", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_th1_v1", "TH1", "V1", "face_contact", "surface_to_surface", []),
  D("gt_bh1_v1", "BH1", "V1", "face_contact", "surface_to_surface", [])
];
function present(d, ids) {
  return [d.panelAId, d.panelBId, d.hostPanelId, d.targetPanelId].every((id) => ids.has(id));
}
function overlaps(a0, a1, b0, b1) {
  return a0 < b1 - 0.01 && b0 < a1 - 0.01;
}
function near(a0, a1, b0, b1) {
  const gap = Math.max(b0 - a1, a0 - b1);
  return gap <= 0.6 && gap >= -0.6;
}
function meets(a, b) {
  const ox = overlaps(a.x0, a.x1, b.x0, b.x1);
  const oy = overlaps(a.y0, a.y1, b.y0, b.y1);
  const oz = overlaps(a.z0, a.z1, b.z0, b.z1);
  return ox && oy && oz || near(a.x0, a.x1, b.x0, b.x1) && oy && oz || near(a.y0, a.y1, b.y0, b.y1) && ox && oz || near(a.z0, a.z1, b.z0, b.z1) && ox && oy;
}
function joinRule(a, b) {
  const types = /* @__PURE__ */ new Set([a.boardType, b.boardType]);
  if (types.has("vertical_divider") || [...types].some((t) => t?.startsWith("Zi") || t === "full_zi" || t === "half_zi" || t === "shortened_zi")) return "tall_zi_joint_v1";
  if ([...types].some((t) => t?.startsWith("H"))) return "tall_h_support_v1";
  if (types.has("V5")) return "tall_fridge_divider_v1";
  if (types.has("side_panel")) return "tall_side_panel_v1";
  return "tall_butt_v1";
}
function relationshipDeclarationsForBoards(boardsOrIds) {
  const boards = Array.isArray(boardsOrIds) ? boardsOrIds : [];
  const boardIds = Array.isArray(boardsOrIds) ? new Set(boards.map((b) => b.id)) : boardsOrIds;
  const extra = [];
  const vs = ["V1", "V2", "V3", "V4", "V5"].filter((id) => boardIds.has(id));
  const bottoms = [...boardIds].filter((id) => /^H\d+_(bottom|fridge)$/.test(id));
  const deck = boardIds.has("B3") ? "B3" : boardIds.has("BH1") ? "BH1" : null;
  if (deck) {
    for (const v of vs) extra.push(D(`gt_${deck.toLowerCase()}_${v.toLowerCase()}`, deck, v, "face_contact", "surface_to_surface", []));
    for (const h of bottoms) extra.push(D(`gt_${deck.toLowerCase()}_${h.toLowerCase()}`, deck, h, "structural_butt_joint", "edge_to_surface", ["screw_hole"]));
  }
  const base = [...GT_RELATIONSHIP_DECLARATIONS, ...extra].filter((d) => present(d, boardIds));
  const seenPairs = new Set(base.map((d) => [d.panelAId, d.panelBId].sort().join("|")));
  const more = [];
  for (let i = 0; i < boards.length; i += 1) {
    for (let k = i + 1; k < boards.length; k += 1) {
      const a = boards[i];
      const b = boards[k];
      if (a.category === "front_panel" || b.category === "front_panel" || a.boardType === "front_panel" || b.boardType === "front_panel") continue;
      if (a.id === "T4" || b.id === "T4" || a.id === "T5" || b.id === "T5") continue;
      const key = [a.id, b.id].sort().join("|");
      if (seenPairs.has(key) || !meets(a, b)) continue;
      seenPairs.add(key);
      const id = `gt_${a.id}_${b.id}`.replace(/[^A-Za-z0-9_]/g, "_").toLowerCase();
      more.push({ ...D(id, a.id, b.id, "structural_butt_joint", "edge_to_surface", ["screw_hole"]), ruleId: joinRule(a, b) });
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return [...base, ...more].filter((d) => {
    if (!present(d, boardIds) || seen.has(d.declarationId)) return false;
    seen.add(d.declarationId);
    return true;
  });
}

// generators/generalTall/rules.json
var rules_default = {
  DEFAULT_PANEL_THICKNESS: { value: 15, doc: "CPT \u7F3A\u7701\u3002" },
  DEFAULT_FRONT_FACE_ALLOWANCE: { value: 16, doc: "FPT \u7F3A\u7701\uFF08frontPanelThickness > frontFaceAllowance > doorPanelThickness > 16\uFF09\u3002" },
  DEFAULT_ZI_THICKNESS: { value: 15, doc: "Zi \u8FB9\u754C\u677F\u539A\u7F3A\u7701\uFF1BZi \u69FD\u9AD8 = ziT + 1\u3002" },
  DEFAULT_H_THICKNESS: { value: 15, doc: "H \u652F\u6491\u539A\u3002" },
  DEFAULT_SIDE_CLEARANCE: { value: 3, doc: "\u4FA7\u9699\u3002" },
  DEFAULT_DIVIDER_THICKNESS: { value: 15, doc: "VD \u539A\uFF1Bzi_groove \u5BBD = \u6B64\u503C + 1\u3002" },
  STYLE_1_INSERT_SLOT_THICKNESS: { value: 16, doc: "style_1 \u63D2\u677F\uFF08T3/B3\uFF09z \u6BB5\u9AD8\u3002" },
  TOP_STYLE_1_MIN_FRONT_RAIL_HEIGHT: { value: 40, doc: "\u9876\u7CFB\u7EDF style_1 \u8F68\u9AD8\u4E0B\u9650\u3002" },
  BOTTOM_STYLE_1_MIN_FRONT_RAIL_HEIGHT: { value: 53, doc: "\u5E95\u7CFB\u7EDF style_1 \u8F68\u9AD8\u4E0B\u9650\u3002" },
  STYLE_1_SECOND_RAIL_THICKNESS: { value: 15, doc: "T2/B2 \u539A\uFF08\u5B57\u9762\u91CF\uFF0C\u4E0D\u968F CPT\uFF09\u3002" },
  STYLE_1_FIRST_RAIL_THICKNESS: { value: 16, doc: "T1/B1 \u539A\uFF08\u5B57\u9762\u91CF\uFF0C\u4E0D\u968F FPT\uFF09\u3002" },
  STYLE_1_INSERT_FRONT_NOTCH_DEPTH: { value: 75, doc: "T3/B3 \u524D\u8033\u6DF1\u5EA6\uFF08Y \u5411\uFF09\u3002\u524D\u6BB5\u5168\u5BBD\uFF0C\u505C\u5728\u7ACB\u6883\u53F0\u9636 y=80 \u4E4B\u524D\uFF1B\u5176\u540E\u5DE6\u53F3\u6536\u8FDB CPT\u3002" },
  STYLE_1_INSERT_BOARD_DEPTH: { value: 150, doc: "T3/B3 \u677F\u6DF1\u3002" },
  ZI_FULL_FRONT_REAR_NOTCH_DEPTH: { value: 105, doc: "full_zi \u524D\u540E\u7F3A\u53E3\u6DF1\u3002" },
  ZI_HALF_FRONT_NOTCH_DEPTH: { value: 45, doc: "half_zi \u524D\u7F3A\u53E3\u6DF1\u3002" },
  ZI_HALF_DEPTH: { value: 150, doc: "half_zi \u677F\u6DF1\u3002" },
  ZI_SLOT_CLEARANCE: { value: 1, doc: "Zi \u69FD\u9AD8\u4F59\u91CF\uFF08\u69FD\u9AD8 = ziT+1\uFF0C\u8FB9\u754C\u5FC3 \xB1(ziT+1)/2\uFF09\u3002" },
  ZI_SLOT_DEPTH: { value: 50, doc: "Zi \u69FD\u6DF1\uFF08\u6570\u636E\u5B57\u6BB5\uFF09\u3002" },
  V12_Y_FRONT_FACE: { value: 70, doc: "\u7ACB\u677F\u524D\u8138\u7684\u67DC\u4F53 y\u3002\u9876\u8F68 T2 \u540E\u7F18\u505C\u5728\u540C\u4E00\u6761\u7EBF\u4E0A\uFF0C\u4E24\u5757\u677F\u8D34\u4E0A\u3002" },
  V12_Y_STEP_INNER: { value: 80, doc: "V1/V2 \u5C40\u90E8 Y\uFF1A\u53F0\u9636\u3002" },
  V12_Y_REAR: { value: 150, doc: "V1/V2 \u5C40\u90E8 Y\uFF1A\u540E\u7F18\uFF08\u5C40\u90E8\u7CFB\uFF09\u3002" },
  V12_ZI_SLOT_INNER: { value: 100, doc: "V1/V2 Zi \u69FD\u5185\u7F18\uFF08\u69FD y\u2208[100,150]\uFF09\u3002" },
  V34_Y_FRONT: { value: 0, doc: "V3/V4 \u5C40\u90E8 Y\uFF1A\u524D\u7F18\u3002" },
  V34_ZI_SLOT_INNER: { value: 50, doc: "V3/V4 Zi \u69FD\u5916\u7F18\uFF08\u69FD y\u2208[0,50]\uFF09\u3002" },
  V34_Y_REAR: { value: 150, doc: "V3/V4 \u5C40\u90E8 Y\uFF1A\u540E\u7F18\u3002" },
  V34_TOP_NOTCH_FRONT_Y: { value: 29, doc: "V3/V4 \u9876\u90E8 L \u7F3A\u53E3\u524D\u89D2\u3002" },
  V34_TOP_NOTCH_INNER_Y: { value: 134, doc: "V3/V4 \u9876\u90E8 L \u7F3A\u53E3\u5185\u89D2\u3002" },
  V34_NOTCH_HEIGHT: { value: 105, doc: "V3/V4 \u9876/\u5E95 L \u7F3A\u53E3\u9AD8\uFF08\u81EA CH \u4E0B\u91CF / \u81EA\u5730\u9762\u8D77\uFF09\u3002" },
  V34_END_NOTCH_THICKNESS: { value: 16, doc: "V3/V4 L \u7F3A\u53E3\u7AD6\u8FB9\u539A\u5EA6\uFF08CH\u221216 \u754C\uFF09\u3002" },
  ZI_GROOVE_WIDTH_CLEARANCE: { value: 1, doc: "VD \u69FD\u5BBD = dividerT + 1\u3002" },
  ZI_GROOVE_Y_OVERHANG: { value: 5, doc: "zi_groove y \u8D85\u820C\u533A \xB15\u3002" },
  DIVIDER_TONGUE_GROOVE_CLEARANCE: { value: 0.5, doc: "VD \u820C\u63D2\u5165 = CPT/2 \u2212 0.5\u3002" },
  H34_CLEARANCE_DEPTH: { value: 16, doc: "VD \u540E\u5E26\u8BA9\u4F4D\u69FD\u6DF1\uFF08y\u2208[midDepth\u221216, midDepth]\uFF09\u3002" },
  H34_Z_BELOW: { value: 5, doc: "H34 \u8BA9\u4F4D\u69FD z \u4E0B\u63A2\uFF08H34.z0 \u2212 5\uFF09\u3002" },
  H34_Z_ABOVE_START: { value: 105, doc: "H34 \u8BA9\u4F4D\u69FD z \u4E0A\u4F38\uFF08H34.z0 + 105\uFF09\u3002" },
  H12_DEPTH: { value: 15, doc: "blank_panel \u652F\u6491\u6DF1\u3002" },
  H12_SPLIT_HEIGHT: { value: 300, doc: "\u62C6\u5206\u9608\u503C\uFF08\u2265300 \u62C6\u4E24\u6761\u5404 100\uFF0C<300 \u5355\u5757\u6574\u9AD8\uFF09\u3002" },
  H_SUPPORT_THICKNESS: { value: 15, doc: "H \u677F\u539A\u3002" },
  H_SUPPORT_HEIGHT: { value: 100, doc: "H \u677F\u9AD8\u3002" },
  H_SUPPORT_SIDE_DEPTH_START: { value: 150, doc: "\u5DE6\u53F3\u6A2A\u6865\u524D\u7AEF\u7684\u67DC\u4F53 y\u3002\u4E0D\u8DDF\u7ACB\u677F\u540E\u7F18\u8D70\u3002" },
  H_SUPPORT_SIDE_REAR_CLEARANCE: { value: 150, doc: "\u5DE6\u53F3\u6A2A\u6865\u540E\u7F18 = midDepth \u2212 150\u3002" },
  H34_DEPTH: { value: 15, doc: "H34 \u677F\u6DF1\u3002" },
  V_AVOIDANCE_PARTIAL_FRONT_Y: { value: 70, doc: "V3/V4 partial \u907F\u8BA9\u524D\u89D2\uFF08ad \u2264 150\uFF09\u3002" },
  AVOIDANCE_SUPPORT_THICKNESS: { value: 15, doc: "\u907F\u8BA9\u652F\u6491\u677F\u539A\uFF08\u5B57\u9762\u91CF\uFF09\u3002" },
  MIN_END_SYSTEM_GAP: { value: 50, doc: "\u7AEF\u7CFB\u7EDF\u524D\u540E\u6761\u6700\u5C0F\u95F4\u9699\uFF08\u4F4E\u4E8E \u2192 merge \u5019\u9009 warning\uFF09\u3002" },
  DEFAULT_FRONT_CLEARANCE: { value: 2.5, doc: "\u95E8\u7F1D fc\u3002" },
  LED_GROOVE_WIDTH_MM: { value: 14.5, doc: "LED \u69FD\u5BBD\uFF08ledGroove\uFF1AT3 \u9876\u9762\u3001B3 \u5E95\u9762\u7684 T \u5F62\u69FD\uFF1B\u4E0E\u540A\u67DC\u76F8\u540C\uFF09\u3002" },
  LED_GROOVE_DEPTH_MM: { value: 6.5, doc: "LED \u69FD\u6DF1\u3002" },
  LED_GROOVE_FRONT_LAND_MM: { value: 18, doc: "T3 / B3 \u524D\u7F18\u5230 LED \u4E3B\u69FD\u8FD1\u8FB9\u7684\u7559\u8FB9\u3002" },
  LED_GROOVE_BRANCH_END_INSET_MM: { value: 30, doc: "\u4E24\u6761 LED \u652F\u69FD\u4E2D\u5FC3\u8DDD\u677F\u4E24\u7AEF\uFF1B\u652F\u69FD\u4ECE\u4E3B\u69FD\u901A\u5230\u677F\u540E\u7F18\uFF0C\u5BBD\u540C\u69FD\u5BBD\u3002" },
  EDGE_BAND_THICKNESS_MM: { value: 1, doc: "\u5C01\u8FB9\u5E26\u539A\u5EA6\u3002\u989C\u8272\u53E6\u5B9A\uFF1A\u95E8\u677F\u6599\u7684\u8FB9\u3001\u4EE5\u53CA\u548C\u95E8\u9762\u9F50\u5E73\u9732\u5728\u524D\u9762\u7684\u67DC\u4F53\u8FB9\uFF08V1/V2/V5 \u524D\u8FB9\u3001\u51B0\u7BB1\u5D4C\u677F\u9876\u4E0A\u7684 TH1 \u524D\u8FB9\u3001\u62BD\u5C49\u4E0A\u65B9\u9732\u51FA\u7684\u51B0\u7BB1\u5E95\u677F\u548C\u524D\u6491\u6761\u524D\u8FB9\uFF09\u7528\u95E8\u677F\u989C\u8272\uFF0C\u5176\u4F59\u770B\u5F97\u89C1\u7684\u67DC\u4F53\u8FB9\u7528\u67DC\u4F53\u989C\u8272\uFF08\u542B H \u6A2A\u6865\u671D\u7A7A\u683C\u5B50\u7684\u90A3\u6761\u957F\u8FB9\uFF1B\u671D\u51B0\u7BB1\u8154\u3001\u8D34\u5730\u8D34\u9876\u8D34\u677F\u7684\u4E0D\u5C01\uFF09\u3002" },
  HINGE_CUP_DIAMETER: { value: 35, doc: "\u94F0\u94FE\u676F\u76F4\u5F84\u3002" },
  HINGE_CUP_DEPTH: { value: 12.5, doc: "\u94F0\u94FE\u676F\u6DF1\u3002" },
  HINGE_CUP_FROM_EDGE: { value: 22.5, doc: "\u676F\u5FC3\u8DDD\u95E8\u8FB9\u3002" },
  FLAP_HINGE_FROM_SIDE: { value: 100, doc: "\u4E0A\u7FFB / \u4E0B\u7FFB\u95E8\u7684\u94F0\u94FE\u676F\u6CBF\u94F0\u94FE\u8FB9\u6392\u4E24\u4E2A\uFF0C\u676F\u5FC3\u8DDD\u95E8\u5DE6\u53F3\u4E24\u8FB9\uFF08\u4E0E\u540A\u67DC\u4E0A\u7FFB\u95E8\u76F8\u540C\uFF09\u3002" },
  FLAP_HINGE_CUP_DEPTH: { value: 12, doc: "\u7FFB\u95E8\u94F0\u94FE\u676F\u6DF1\uFF08\u4E0E\u540A\u67DC\u4E0A\u7FFB\u95E8\u76F8\u540C\uFF1B\u4FA7\u5F00\u95E8\u7528 HINGE_CUP_DEPTH\uFF09\u3002" },
  HINGE_SD_MIN: { value: 75, doc: "\u94F0\u94FE\u4FA7\u8DDD\u4E0B\u9650\u3002" },
  HINGE_SD_MAX: { value: 100, doc: "\u94F0\u94FE\u4FA7\u8DDD\u4E0A\u9650\u3002" },
  HINGE_SD_SPAN: { value: 300, doc: "sd = clamp[75,100](75 + (\u957F\u8FB9\u2212300)\xB725/300)\u3002" },
  SD_GAIN_NUM: { value: 25, doc: "sd \u516C\u5F0F\u589E\u76CA\u5206\u5B50\u3002" },
  SD_GAIN_DEN: { value: 300, doc: "sd \u516C\u5F0F\u589E\u76CA\u5206\u6BCD\u3002" },
  DEFAULT_LOCK_SIDE_DISTANCE: { value: 80, doc: "\u4FA7\u9501\u5FC3\u8DDD\u95E8\u4FA7\u6CBF\u3002" },
  LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER: { value: 30.5, doc: "\u5B89\u88C5\u9762\u5230\u9501\u69FD\u5FC3\u3002" },
  LOCK_SLOT_LENGTH: { value: 55, doc: "razor_long_rounded_1 \u9501\u69FD\u957F\u3002" },
  LOCK_SLOT_WIDTH: { value: 15.5, doc: "\u9501\u69FD\u5BBD\uFF08r = \u5BBD/2\uFF09\u3002" },
  DOOR_SHELF_MIN_ZONE_HEIGHT: { value: 350, doc: "\u533A\u9AD8\u4F4E\u4E8E\u6B64\u4E0D\u751F\u6210\u95E8\u5C42\u677F\u3002" },
  SIDE_PANEL_WHITELIST_15: { value: 15, doc: "\u4FA7\u677F\u539A\u767D\u540D\u5355\u6210\u5458\u3002" },
  SIDE_PANEL_WHITELIST_16: { value: 16, doc: "\u4FA7\u677F\u539A\u767D\u540D\u5355\u6210\u5458\u3002" },
  FRIDGE_RAISED_THRESHOLD: { value: 105, doc: "fridgeBaseBottomZ \u2212 avoidH < 105 \u2192 raised\u3002" },
  FRIDGE_BASE_ZI_DEPTH: { value: 224, doc: "\u51B0\u7BB1\u6B63\u4E0B\u65B9\u662F\u62BD\u5C49\u65F6\uFF0C\u62BD\u5C49\u4E0B\u9762\u90A3\u5757 Zi \u53EA\u505A\u5230\u8FD9\u4E2A\u6DF1\u5EA6\uFF08\u81EA\u67DC\u8EAB\u524D\u7F18\u91CF\uFF0C\u53EA\u6709\u524D\u7F3A\u53E3\uFF0CV3/V4 \u4E0D\u5F00\u69FD\uFF09\u3002\u53D6\u81EA 21 Bunk Dometic \u51B0\u7BB1\u67DC\u3002" },
  FRIDGE_BASE_RAIL_DEPTH: { value: 100, doc: "\u51B0\u7BB1\u6B63\u4E0B\u65B9\u662F\u62BD\u5C49\u65F6\uFF0C\u51B0\u7BB1\u5E95\u677F\u4E0B\u7684\u524D\u6491\u6761\u6DF1\u5EA6\uFF08\u81EA\u67DC\u8EAB\u524D\u7F18\u91CF\uFF0C\u539A CPT\uFF0C\u8D34\u5728\u51B0\u7BB1\u5E95\u677F\u4E0B\u9762\uFF09\u3002" },
  FRIDGE_BASE_DRAWER_FRONT_GAP: { value: 8.5, doc: "\u51B0\u7BB1\u6B63\u4E0B\u65B9\u7684\u62BD\u5C49\u9762\u677F\uFF0C\u4E0A\u6CBF\u505C\u5728\u51B0\u7BB1\u5E95\u677F\uFF08Zi\uFF09\u4E0B\u9762\u8FD9\u4E48\u591A\uFF1B\u51B0\u7BB1\u5E95\u677F\u548C\u524D\u6491\u6761\u7684\u524D\u8FB9\u9732\u5728\u4E0A\u9762\u3002" },
  STYLE_2_FRONT_SYSTEM_DEPTH: { value: 100, doc: "TH1/BH1 \u6DF1\u5EA6\uFF08\u524D\u67DC\u8EAB y\u2208[0,100]\uFF09\u3002" },
  STYLE_2_FRONT_SYSTEM_THICKNESS: { value: 15, doc: "TH1/BH1 \u539A\u3002" },
  STYLE_2_FRONT_SYSTEM_Z_INSET: { value: 1, doc: "TH1/BH1 \u8DDD\u9876/\u5E95 1 mm\uFF1Az\u2208[CH\u221216,CH\u22121] / [1,16]\u3002" },
  STYLE_2_END_NOTCH_DEPTH: { value: 105, doc: "V1/V2 style_2 \u7AEF\u7F3A\u53E3\u6DF1\uFF08Y \u5411\uFF09\u3002" },
  T4_REAR_HORIZONTAL_DEPTH: { value: 100, doc: "T4 \u6DF1\uFF1A\u540E\u7F18\u8D34 T5 \u524D\u7AEF\uFF0C\u524D\u7F18\u518D\u9000 100\u3002T5 \u540E\u7F18\u5728\u4FA7\u677F\u540E\u7F18\u5185\u4FA7 1 mm\u3002" },
  T5_REAR_VERTICAL_HEIGHT: { value: 100, doc: "T5 \u9AD8\uFF1Az\u2208[CH\u2212100, CH]\u3002" },
  T45_THICKNESS: { value: 15, doc: "T4/T5 \u539A\u3002" },
  T45_WALL_INSET: { value: 1, doc: "T5 \u540E\u7F18 = midDepth\u22121\uFF0C\u505C\u5728\u4FA7\u677F\u540E\u7F18\u5185\u4FA7\u3002" },
  STACKING_HEIGHT_TOLERANCE: { value: 1e-3, doc: "\u9AD8\u5EA6\u5DEE > \u6B64\u503C \u2192 mismatch warning\u3002" }
};

// generators/generalTall/rules.ts
var RULES = defineRules("generalTall", rules_default);

// generators/generalTall/faces.ts
function addLedGroove(b, face) {
  const K = `${b.id}.feat.LED`;
  const width = dim(`${K}_MAIN.u1`, { x1: ref(`${b.id}.x1`), x0: ref(`${b.id}.x0`) }, (t) => t.x1 - t.x0);
  const v0 = dim(`${K}_MAIN.v0`, { LAND: RULES.LED_GROOVE_FRONT_LAND_MM }, (t) => t.LAND);
  const v1 = dim(`${K}_MAIN.v1`, { LAND: RULES.LED_GROOVE_FRONT_LAND_MM, W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.LAND + t.W);
  const rear = dim(`${K}.rear`, { y1: ref(`${b.id}.y1`), y0: ref(`${b.id}.y0`) }, (t) => t.y1 - t.y0);
  const depth = RULES.LED_GROOVE_DEPTH_MM.value;
  addFeature(b, face, { id: `${b.id}_LED_MAIN`, kind: "tgroove", u0: 0, u1: width, v0, v1, depth, for: "led", key: `${K}_MAIN`, source: "generalTall" });
  const centres = [
    dim(`${K}_BRANCH_1.cu`, { INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM }, (t) => t.INSET),
    dim(`${K}_BRANCH_2.cu`, { w: ref(`${K}_MAIN.u1`), INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM }, (t) => t.w - t.INSET)
  ];
  const half = RULES.LED_GROOVE_WIDTH_MM.value / 2;
  centres.forEach((cu, i) => {
    addFeature(b, face, {
      id: `${b.id}_LED_BRANCH_${i + 1}`,
      kind: "tgroove",
      u0: cu - half,
      u1: cu + half,
      v0: v1,
      v1: rear,
      depth,
      for: "led",
      key: `${K}_BRANCH_${i + 1}`,
      source: "generalTall"
    });
  });
}
function buildTallFaces(fb) {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  if (fb.ledGroove) {
    const t3 = B.get("T3");
    const b3 = B.get("B3");
    if (t3) addLedGroove(t3, "A");
    if (b3) addLedGroove(b3, "B");
  }
  for (const b of fb.boards) {
    b.role = b.category;
    const doorLeaf = b.category === "front_panel" || b.boardType === "front_panel" || b.boardType === "style2_fixed_front_panel" || b.id === "T1" || b.id === "B1";
    if (doorLeaf) {
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, "A", { semantic: "back", visible: false });
    } else if (b.id.startsWith("SidePanel_") && b.stock?.kind === "door") {
      const left = b.id === "SidePanel_L";
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, left ? "B" : "A", { semantic: "outside", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, left ? "A" : "B", { semantic: "inside", visible: false });
    }
  }
  for (const s of fb.ziSlots) {
    const v = B.get(s.vPanelId);
    if (!v) continue;
    const r = localRect(v, { y: [s.y0, s.y1], z: [s.z0, s.z1] });
    tagEdges(v, "notch", r, { id: s.id, for: `Zi_${s.boundaryId}`, source: "generalTall" });
  }
  for (const g of fb.ziGrooves) {
    const board = B.get(g.boardId);
    if (!board) continue;
    const r = localRect(board, { x: [g.x0, g.x1], y: [g.y0, g.y1] });
    const vd = g.id.match(/zi_groove_(VD_[^_]+)_/)?.[1];
    addFeature(board, g.face === "top" ? "A" : "B", {
      id: g.id,
      kind: "groove",
      ...r,
      depth: g.depth,
      for: vd,
      source: "generalTall"
    });
  }
  for (const h of fb.hinges) {
    const fp = B.get(h.panelId);
    if (!fp) continue;
    const key = `${h.panelId}.feat.${h.id}`;
    const cx = dim(`${key}.x`, { centerX: h.centerX, x0: ref(`${h.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: h.centerZ, z0: ref(`${h.panelId}.z0`) }, (t) => t.centerZ - t.z0);
    addFeature(fp, "A", {
      id: h.id,
      kind: "hole",
      center: [cx, cz],
      diameter: h.diameter,
      depth: h.depth,
      for: "hinge",
      key,
      source: "generalTall"
    });
  }
  for (const lock of fb.locks) {
    const fp = B.get(lock.panelId);
    if (!fp) continue;
    const key = `${lock.panelId}.feat.${lock.id}`;
    const cx = dim(`${key}.x`, { centerX: lock.centerX, x0: ref(`${lock.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: lock.centerZ, z0: ref(`${lock.panelId}.z0`) }, (t) => t.centerZ - t.z0);
    addFeature(fp, "A", {
      id: lock.id,
      kind: "cutout",
      u0: cx - lock.width / 2,
      u1: cx + lock.width / 2,
      v0: cz - lock.height / 2,
      v1: cz + lock.height / 2,
      radius: lock.radius,
      through: true,
      for: "lock",
      key,
      source: "generalTall"
    });
  }
  bandTallEdges(fb.boards, fb.doorColour, fb.fridgeZ);
  return resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(fb.boards));
}
var CARCASS_COLOUR = "White Stipple";
function bandTallEdges(boards, doorColour, fridgeZ) {
  const tape = RULES.EDGE_BAND_THICKNESS_MM.value;
  const band = (b, normal, colour) => {
    for (const f of boundaryEdgeFaces(b, normal)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour });
  };
  const top = Math.max(...boards.map((b) => b.z1));
  const overXY = (a, b) => a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;
  const bandH = (b) => {
    for (const [normal, z, dir] of [["+Z", b.z1, 1], ["-Z", b.z0, -1]]) {
      if (z <= 0.01 || z >= top - 0.01) continue;
      const covered = boards.some((o) => o !== b && overXY(o, b) && Math.abs((dir > 0 ? o.z0 : o.z1) - z) <= 1);
      const probe = z + dir;
      const inFridge = fridgeZ != null && probe >= fridgeZ[0] && probe <= fridgeZ[1];
      if (!covered && !inFridge) band(b, normal, CARCASS_COLOUR);
    }
  };
  const infill = boards.find((b) => b.id === "TopStyle2FixedFrontPanel" && b.y0 > -0.01);
  const rail = boards.find((b) => b.id === "FridgeBaseRail");
  const fridgeFloor = rail ? boards.find((b) => b.id.startsWith("Zi_") && Math.abs(b.z0 - rail.z1) < 0.01) : void 0;
  for (const b of boards) {
    const t = b.boardType;
    if (b === rail || b === fridgeFloor) {
      band(b, "-Y", doorColour);
    } else if (t === "front_panel" || t === "style2_fixed_front_panel" && b !== infill) {
      for (const f of edgeFaces(b)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: doorColour });
    } else if (b === infill) {
      band(b, "-Z", doorColour);
    } else if (b.id === "V1" || b.id === "V2") {
      band(b, "-Y", doorColour);
      band(b, "+Y", CARCASS_COLOUR);
    } else if (b.id === "V3" || b.id === "V4") {
      band(b, "-Y", CARCASS_COLOUR);
    } else if (b.id.startsWith("SidePanel_") || b.id === "V5") {
      band(b, "-Y", doorColour);
    } else if (b.id === "T1") {
      band(b, "-Z", doorColour);
    } else if (b.id === "B1") {
      band(b, "+Z", doorColour);
    } else if (b.id === "TH1") {
      if (infill) band(b, "-Y", doorColour);
    } else if (b.id === "T3" || b.id === "B3" || t === "half_zi" || t === "shortened_zi") {
      band(b, "-Y", CARCASS_COLOUR);
      band(b, "+Y", CARCASS_COLOUR);
    } else if (t === "full_zi" || b.id.startsWith("DS_") || b.id.startsWith("VD_") || b.id === "T4" || b.id === "avoidance_horizontal") {
      band(b, "-Y", CARCASS_COLOUR);
    } else if (b.id === "T5") {
      band(b, "-Z", CARCASS_COLOUR);
    } else if (/^H(13|24|34)_/.test(b.id)) {
      bandH(b);
    }
  }
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
var ZONE_COLOR = {
  left_door: "#8ec5ef",
  right_door: "#8ec5ef",
  double_door: "#8ec5ef",
  side_door: "#8ec5ef",
  left_side_door: "#8ec5ef",
  right_side_door: "#8ec5ef",
  up_flap: "#b7e3a1",
  down_flap: "#b7e3a1",
  top_flap: "#b7e3a1",
  bottom_flap: "#b7e3a1",
  rangehood_flap: "#d7b8f2",
  drawer: "#f0c27a",
  open: "#f3e39a",
  open_space: "#f3e39a",
  custom: "#e4d0b0",
  stove: "#f0a3a3",
  open_appliance: "#f0a3a3",
  fridge: "#8ed4d0",
  fixed_panel: "#d5dcc4",
  blank_panel: "#d5dcc4",
  unassigned: "#f0a3a3"
};
function zoneColor(type) {
  return type && ZONE_COLOR[type] || "#8ec5ef";
}
function selectRect(attrs) {
  return `<rect pointer-events="none" ${attrs} fill="${PV.select}" fill-opacity="0.62" stroke="#d7e6ff" stroke-width="3" />`;
}
function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function fmt(value) {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}
var px = (v) => v.toFixed(2);
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
function label(x, y, text, opts = {}) {
  const { size = 11, fill = PV.text, anchor = "middle", weight } = opts;
  return `<text x="${px(x)}" y="${px(y)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${size}"${weight ? ` font-weight="${weight}"` : ""} fill="${fill}" stroke="${PV.bg}" stroke-opacity="0.85" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(text)}</text>`;
}
function dimText(x, y, text, anchor = "middle", fill = PV.text2, size = 10) {
  return `<text x="${px(x)}" y="${px(y)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${size}" fill="${fill}" pointer-events="none">${esc(text)}</text>`;
}
function grip(attrs, x1, y1, x2, y2, dashed = false) {
  const c = `x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}"`;
  return `<g class="boundary" ${attrs}><line ${c} stroke="${PV.boundary}" stroke-width="2"${dashed ? ` stroke-dasharray="6 4"` : ""} /><line class="hit" ${c} stroke="transparent" stroke-width="12" pointer-events="stroke" /></g>`;
}
function spacedLabels(items, x, anchor, gap = 11) {
  const sorted = [...items].sort((a, b) => a.y - b.y || Number(!!b.strong) - Number(!!a.strong));
  const out = [];
  let last = -Infinity;
  for (const it of sorted) {
    if (it.y - last < gap) continue;
    out.push(dimText(x, it.y, it.text, anchor, it.fill));
    last = it.y;
  }
  return out.join("");
}
function fitCanvas(W, H, width, maxHeight, pad) {
  const availW = width - pad.l - pad.r;
  const availH = maxHeight - pad.t - pad.b;
  const scale = Math.min(availW / Math.max(W, 1), availH / Math.max(H, 1));
  const ox = pad.l + (availW - W * scale) / 2;
  const oy = pad.t;
  const height = Math.round(H * scale + pad.t + pad.b);
  return { scale, ox, oy, height };
}
function textWidth(text, size = 9) {
  return text.length * size * 0.62 + 4;
}
function hits(a, b, pad = 3) {
  return a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.y0 - pad < b.y1 && a.y1 + pad > b.y0;
}
function paintDim(toX, toY, spec, edge, side, offsetPx, along) {
  if (!(Math.abs(spec.to - spec.from) > 0.4)) return null;
  const tick = 3.5;
  const color = spec.color;
  const halo = `fill="${color}" stroke="${PV.bg}" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round"`;
  const w = textWidth(spec.text);
  const h = 12;
  if (spec.axis === "x") {
    const x0 = toX(Math.min(spec.from, spec.to));
    const x1 = toX(Math.max(spec.from, spec.to));
    if (x1 - x0 < 18) return null;
    const yEdge = toY(edge);
    const y = yEdge + side * offsetPx;
    const textY = y + side * 8;
    const mid2 = (x0 + x1) / 2 + along;
    if (mid2 < x0 || mid2 > x1) return null;
    const svg2 = `<g pointer-events="none" stroke="${color}"><line x1="${px(x0)}" y1="${px(yEdge)}" x2="${px(x0)}" y2="${px(y + side * tick)}" stroke-width="0.6" /><line x1="${px(x1)}" y1="${px(yEdge)}" x2="${px(x1)}" y2="${px(y + side * tick)}" stroke-width="0.6" /><line x1="${px(x0)}" y1="${px(y)}" x2="${px(x1)}" y2="${px(y)}" stroke-width="0.8" /><line x1="${px(x0)}" y1="${px(y - tick)}" x2="${px(x0)}" y2="${px(y + tick)}" stroke-width="0.8" /><line x1="${px(x1)}" y1="${px(y - tick)}" x2="${px(x1)}" y2="${px(y + tick)}" stroke-width="0.8" /><text x="${px(mid2)}" y="${px(textY)}" text-anchor="middle" dominant-baseline="middle" font-size="9" ${halo} pointer-events="none">${esc(spec.text)}</text></g>`;
    return { svg: svg2, box: { x0: mid2 - w / 2, y0: textY - h / 2, x1: mid2 + w / 2, y1: textY + h / 2 } };
  }
  const y0 = toY(Math.max(spec.from, spec.to));
  const y1 = toY(Math.min(spec.from, spec.to));
  if (y1 - y0 < 18) return null;
  const xEdge = toX(edge);
  const x = xEdge + side * offsetPx;
  const textX = x + side * 5;
  const mid = (y0 + y1) / 2 + along;
  if (mid < y0 || mid > y1) return null;
  const anchor = side > 0 ? "start" : "end";
  const svg = `<g pointer-events="none" stroke="${color}"><line x1="${px(xEdge)}" y1="${px(y0)}" x2="${px(x + side * tick)}" y2="${px(y0)}" stroke-width="0.6" /><line x1="${px(xEdge)}" y1="${px(y1)}" x2="${px(x + side * tick)}" y2="${px(y1)}" stroke-width="0.6" /><line x1="${px(x)}" y1="${px(y0)}" x2="${px(x)}" y2="${px(y1)}" stroke-width="0.8" /><line x1="${px(x - tick)}" y1="${px(y0)}" x2="${px(x + tick)}" y2="${px(y0)}" stroke-width="0.8" /><line x1="${px(x - tick)}" y1="${px(y1)}" x2="${px(x + tick)}" y2="${px(y1)}" stroke-width="0.8" /><text x="${px(textX)}" y="${px(mid)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="9" ${halo} pointer-events="none">${esc(spec.text)}</text></g>`;
  const box = side > 0 ? { x0: textX, y0: mid - h / 2, x1: textX + w, y1: mid + h / 2 } : { x0: textX - w, y0: mid - h / 2, x1: textX, y1: mid + h / 2 };
  return { svg, box };
}
function layoutDimensions(specs, toX, toY, avoid = []) {
  const occupied = avoid.map((b) => ({ ...b }));
  const order = specs.map((spec, i) => ({ spec, i })).sort((a, b) => (a.spec.priority ?? 1) - (b.spec.priority ?? 1) || Math.abs(a.spec.to - a.spec.from) - Math.abs(b.spec.to - b.spec.from));
  const out = [];
  for (const { spec } of order) {
    const preferred = spec.axis === "x" ? -1 : 1;
    const alongs = [0, -28, 28, -56, 56, -84, 84, -112, 112, -140, 140];
    let placed = null;
    for (const offset of [16, 58]) {
      for (const side of [preferred, -preferred]) {
        const edge = side === preferred ? spec.edgeLo : spec.edgeHi;
        for (const along of alongs) {
          const attempt = paintDim(toX, toY, spec, edge, side, offset, along);
          if (!attempt) continue;
          if (occupied.some((box) => hits(attempt.box, box))) continue;
          placed = attempt;
          break;
        }
        if (placed) break;
      }
      if (placed) break;
    }
    if (!placed) placed = paintDim(toX, toY, spec, spec.edgeLo, preferred, 16, 0);
    if (!placed) continue;
    occupied.push(placed.box);
    out.push(placed.svg);
  }
  return out.join("");
}
function svgRoot(width, height, data, aria, body) {
  const d = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}" ${d} font-family="${PV.font}"><rect x="0" y="0" width="${width}" height="${height}" fill="${PV.bg}" />` + body + `</svg>`;
}

// generators/generalTall/svgPreview.ts
var GT_ZONE_LABELS = {
  side_door: "Door",
  left_side_door: "Door \xB7 hinge left",
  right_side_door: "Door \xB7 hinge right",
  double_door: "Double door",
  drawer: "Drawer",
  open_space: "Open",
  open_appliance: "Appliance",
  fridge: "Fridge",
  top_flap: "Top flap",
  bottom_flap: "Bottom flap",
  blank_panel: "Blank panel",
  fixed_panel: "Fixed panel"
};
var OWNED_HEIGHT = /* @__PURE__ */ new Set(["fridge"]);
var r1 = (v) => Math.round(v * 10) / 10;
function gtZoneOpenings(result) {
  if (!result || result.validation?.errors?.length || !result.boards?.length || !result.stack?.length) return [];
  const CW = result.params.cabinetWidth;
  const rows = result.stack;
  const zones = rows.filter((it) => it.kind === "functional_zone");
  const zid = (it) => it.zoneId ?? it.zone?.id ?? it.id;
  const carcass = result.boards.filter((b) => b.category !== "front_panel" && b.stock?.kind !== "door");
  const yFront = Math.min(...carcass.map((b) => b.y0));
  const front = carcass.filter((b) => b.y0 <= yFront + 20);
  const flats = front.filter((b) => b.thicknessAxis === "Z" && Math.min(b.x1, CW * 0.7) - Math.max(b.x0, CW * 0.3) > 1);
  const uprights = front.filter((b) => b.thicknessAxis === "X");
  return zones.map((it, index) => {
    const z0 = it.z0;
    const z1 = it.z1;
    const owned = OWNED_HEIGHT.has(it.zoneType);
    const below = flats.filter((b) => b.z1 <= z0 + 0.8 || b.z0 - 0.2 <= z0 && z0 <= b.z1 + 0.2).sort((a, b) => b.z0 + b.z1 - (a.z0 + a.z1))[0];
    const above = flats.filter((b) => b.z0 >= z1 - 0.8 || b.z0 - 0.2 <= z1 && z1 <= b.z1 + 0.2).sort((a, b) => a.z0 + a.z1 - (b.z0 + b.z1))[0];
    const k = rows.indexOf(it);
    const prev = rows[k - 1];
    const next = rows[k + 1];
    const floorAt = prev && prev.kind === "bottom_system" ? prev.z1 : null;
    const ceilAt = next && next.kind === "top_system" ? next.z0 : null;
    let lo = owned || !below ? z0 : below.z1;
    let hi = owned || !above ? z1 : above.z0;
    let loMid = owned || !below ? z0 : (below.z0 + below.z1) / 2;
    let hiMid = owned || !above ? z1 : (above.z0 + above.z1) / 2;
    if (!owned && floorAt != null && floorAt > lo) {
      lo = floorAt;
      loMid = floorAt;
    }
    if (!owned && ceilAt != null && ceilAt < hi) {
      hi = ceilAt;
      hiMid = ceilAt;
    }
    const need = Math.min(50, (z1 - z0) * 0.3);
    const across = uprights.filter((b) => Math.min(b.z1, z1) - Math.max(b.z0, z0) > need).sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1);
    const widths = [];
    for (let i = 0; i < across.length - 1; i += 1) {
      const a = across[i];
      const b = across[i + 1];
      if (b.x0 - a.x1 < 8) continue;
      widths.push({ aHi: a.x1, bLo: b.x0, aMid: (a.x0 + a.x1) / 2, bMid: (b.x0 + b.x1) / 2, clear: r1(b.x0 - a.x1), center: r1((b.x0 + b.x1) / 2 - (a.x0 + a.x1) / 2) });
    }
    return {
      id: String(zid(it)),
      index,
      zoneType: String(it.zoneType ?? ""),
      z0,
      z1,
      height: Number(it.height ?? r1(z1 - z0)),
      clear: r1(hi - lo),
      center: r1(hiMid - loMid),
      owned,
      lo,
      hi,
      loMid,
      hiMid,
      xLo: widths.length ? widths[0].aHi : 0,
      xHi: widths.length ? widths[widths.length - 1].bLo : CW,
      widths
    };
  });
}
function generateGTSvgPreview(result, options = {}) {
  if (!result || result.validation.errors.length || !result.boards.length || !result.stack?.length) return null;
  const CW = result.params.cabinetWidth;
  const CH = result.params.cabinetHeight;
  if (!(CW > 0) || !(CH > 0)) return null;
  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedZoneId ?? null;
  const { scale, ox, oy, height } = fitCanvas(CW, CH, width, options.maxHeight ?? 600, { l: 48, r: 56, t: 14, b: 28 });
  const toX = (x) => ox + x * scale;
  const toY = (z) => oy + (CH - z) * scale;
  const rect = (x0, x1, z0, z1) => `x="${px(toX(x0))}" y="${px(toY(z1))}" width="${px(Math.max((x1 - x0) * scale, 0.8))}" height="${px(Math.max((z1 - z0) * scale, 0.8))}"`;
  const rows = result.stack;
  const zones = rows.filter((it) => it.kind === "functional_zone");
  const zid = (it) => it.zoneId ?? it.zone?.id ?? it.id;
  const parts = [];
  const avoid = [];
  const reserve = (x, y, text, size, anchor = "middle") => {
    const w = text.length * size * 0.62 + 4;
    const h = size + 6;
    const x0 = anchor === "start" ? x : x - w / 2;
    avoid.push({ x0, y0: y - h / 2, x1: x0 + w, y1: y + h / 2 });
  };
  const mode = options.gaps === "center" ? "center" : "clear";
  const openings = gtZoneOpenings(result);
  for (const it of rows) {
    if (it.kind === "functional_zone") {
      parts.push(`<rect class="region" data-zone="${zid(it)}" ${rect(0, CW, it.z0, it.z1)} fill="${zoneColor(it.zoneType)}" stroke="none" />`);
    } else if (it.kind !== "boundary_panel") {
      parts.push(`<rect ${rect(0, CW, it.z0, it.z1)} fill="rgba(255,255,255,0.025)" stroke="none" pointer-events="none" />`);
    }
  }
  const boards = [...result.boards].sort((a, b) => b.y0 - a.y0);
  for (const b of boards) {
    const r = frontRect(b);
    if (!r || r.x1 - r.x0 < 0.1 || r.z1 - r.z0 < 0.1) continue;
    const door = b.stock?.kind === "door";
    const isFront = b.y0 < -0.01;
    parts.push(
      `<rect data-board="${b.id}" pointer-events="none" ${rect(r.x0, r.x1, r.z0, r.z1)} fill="${door ? PV.front : PV.carcass}" fill-opacity="${isFront ? 0.55 : 0.92}" stroke="${door ? PV.frontLine : PV.carcassLine}" stroke-width="0.75" />`
    );
  }
  for (const it of zones) {
    parts.push(`<rect pointer-events="none" ${rect(0, CW, it.z0, it.z1)} fill="${zoneColor(it.zoneType)}" fill-opacity="0.9" stroke="none" />`);
  }
  const sel = zones.find((it) => zid(it) === selected);
  if (sel) parts.push(selectRect(rect(0, CW, sel.z0, sel.z1)));
  for (const h of result.hinges) {
    parts.push(`<circle cx="${px(toX(h.centerX))}" cy="${px(toY(h.centerZ))}" r="${px(Math.max(h.diameter / 2 * scale, 1.5))}" fill="none" stroke="${PV.hinge}" stroke-width="1" pointer-events="none" />`);
  }
  for (const l of result.locks) {
    const w = Math.max(l.width * scale, 4);
    const h = Math.max(l.height * scale, 2.5);
    parts.push(`<rect x="${px(toX(l.centerX) - w / 2)}" y="${px(toY(l.centerZ) - h / 2)}" width="${px(w)}" height="${px(h)}" rx="${px(h / 2)}" fill="${PV.lock}" fill-opacity="0.55" stroke="none" pointer-events="none" />`);
  }
  for (const it of zones) {
    const w = CW * scale;
    const h = (it.z1 - it.z0) * scale;
    if (h < 14 || w < 40) continue;
    const cx = toX(it.zone?.verticalDivider === true ? CW / 4 : CW / 2);
    const cy = toY((it.z0 + it.z1) / 2);
    const name = GT_ZONE_LABELS[it.zoneType ?? ""] ?? it.zoneType ?? it.id;
    if (options.readout) {
      parts.push(label(cx, cy, name, { size: 11 }));
      reserve(cx, cy, name, 11);
      continue;
    }
    if (h >= 32) {
      parts.push(label(cx, cy - 6, name, { size: 11 }));
      parts.push(label(cx, cy + 8, fmt(it.height), { size: 10, fill: PV.text2 }));
      reserve(cx, cy - 6, name, 11);
      reserve(cx, cy + 8, fmt(it.height), 10);
    } else {
      parts.push(label(cx, cy, `${name} \xB7 ${fmt(it.height)}`, { size: 10 }));
      reserve(cx, cy, `${name} \xB7 ${fmt(it.height)}`, 10);
    }
  }
  parts.push(`<rect ${rect(0, CW, 0, CH)} fill="none" stroke="${PV.envelope}" stroke-width="1.25" pointer-events="none" />`);
  const draggable = /* @__PURE__ */ new Set();
  for (let i = 0; i < zones.length - 1; i += 1) {
    const lo = zones[i];
    const hi = zones[i + 1];
    if (OWNED_HEIGHT.has(lo.zoneType) || OWNED_HEIGHT.has(hi.zoneType)) continue;
    const z = (lo.z1 + hi.z0) / 2;
    draggable.add(i);
    parts.push(grip(`data-boundary="zone" data-axis="z" data-index="${i}"`, toX(0), toY(z), toX(CW), toY(z)));
  }
  for (const it of zones) {
    if (it.zone?.verticalDivider !== true) continue;
    const vd = result.boards.find((b) => b.category === "vertical_divider" && b.id.endsWith(`_${zid(it)}`));
    const cx = vd ? (vd.x0 + vd.x1) / 2 : Number(it.zone.dividerCenterX ?? result.params.midWidth / 2);
    parts.push(grip(`data-boundary="divider" data-axis="x" data-zone="${zid(it)}"`, toX(cx), toY(it.z1), toX(cx), toY(it.z0), true));
  }
  if (showDimensions) {
    const items = [
      { y: toY(0), text: "0", fill: PV.text3 },
      { y: toY(CH), text: fmt(CH), fill: PV.text3 }
    ];
    zones.forEach((it, i) => {
      if (i === 0) items.push({ y: toY(it.z0), text: fmt(it.z0), fill: PV.text3 });
      const drag = draggable.has(i);
      items.push({ y: toY(i < zones.length - 1 ? (it.z1 + zones[i + 1].z0) / 2 : it.z1), text: fmt(i < zones.length - 1 ? (it.z1 + zones[i + 1].z0) / 2 : it.z1), fill: drag ? PV.boundary : PV.text3, strong: drag });
    });
    parts.push(spacedLabels(items, ox - 6, "end"));
    const right = toX(CW);
    zones.forEach((it, i) => {
      parts.push(`<line x1="${px(right + 3)}" y1="${px(toY(it.z1))}" x2="${px(right + 8)}" y2="${px(toY(it.z1))}" stroke="${PV.text3}" pointer-events="none" />`);
      parts.push(`<line x1="${px(right + 3)}" y1="${px(toY(it.z0))}" x2="${px(right + 8)}" y2="${px(toY(it.z0))}" stroke="${PV.text3}" pointer-events="none" />`);
      if ((it.z1 - it.z0) * scale < 12) return;
      const y = toY((it.z0 + it.z1) / 2);
      const o = openings[i];
      if (!options.readout || !o) {
        parts.push(dimText(right + 11, y, fmt(it.height), "start"));
        reserve(right + 11, y, fmt(it.height), 10, "start");
        return;
      }
      const text = fmt(mode === "center" ? o.center : o.clear);
      const editable = options.editable === true && !o.owned && zones.length > 1;
      const hit = Math.max(36, text.length * 8);
      parts.push(
        `<g class="zone-dim${editable ? " editable" : ""}" data-zone="${zid(it)}" data-height="${o.height}" data-clear="${o.clear}" data-center="${o.center}"><title>${o.owned ? "The fridge cut-out" : `${mode === "center" ? "Centre to centre" : "Clearance"}${editable ? " \xB7 click to type" : ""}`}</title>` + (editable ? `<rect x="${px(right + 9)}" y="${px(y - 9)}" width="${hit}" height="18" fill="transparent" />` : "") + `<text x="${px(right + 11)}" y="${px(y)}" text-anchor="start" dominant-baseline="middle" font-size="10" fill="${editable ? PV.boundary : PV.text2}" pointer-events="none">${text}</text></g>`
      );
      reserve(right + 11, y, text, 10, "start");
    });
    parts.push(dimText(toX(CW / 2), toY(0) + 15, `W ${fmt(CW)} \xB7 H ${fmt(CH)}`, "middle", PV.text3));
    reserve(toX(CW / 2), toY(0) + 15, `W ${fmt(CW)} \xB7 H ${fmt(CH)}`, 10);
  }
  const color = mode === "center" ? "#e0a34f" : "#8ec5ef";
  const specs = [];
  for (const o of openings) {
    for (const w of o.widths) {
      specs.push({
        axis: "x",
        from: mode === "center" ? w.aMid : w.aHi,
        to: mode === "center" ? w.bMid : w.bLo,
        edgeLo: o.lo,
        edgeHi: o.hi,
        text: fmt(mode === "center" ? w.center : w.clear),
        color
      });
    }
    specs.push({
      axis: "z",
      from: mode === "center" ? o.loMid : o.lo,
      to: mode === "center" ? o.hiMid : o.hi,
      edgeLo: o.xLo,
      edgeHi: o.xHi,
      text: fmt(mode === "center" ? o.center : o.clear),
      color: o.owned ? PV.text : color,
      priority: o.owned ? 0 : 1
    });
  }
  parts.push(layoutDimensions(specs.filter((sp) => Math.abs(sp.to - sp.from) * scale >= 18), toX, toY, avoid));
  return svgRoot(width, height, { scale, ox, oy, w: CW, h: CH }, "Tall cabinet front elevation", parts.join(""));
}

// generators/generalTall/presets.json
var presets_default = {
  module: "generalTall",
  presets: [
    {
      id: "ui-default",
      label: "Tall \xB7 2000\xD7600\xD7584 \xB7 side+drawer+double\uFF08\u9EC4\u91D1 uiDefault\uFF09",
      params: {
        cabinetHeight: 2e3,
        cabinetWidth: 600,
        cabinetDepth: 584,
        panelThickness: 16,
        frontPanelThickness: 16,
        ziThickness: 15,
        hThickness: 15,
        sideClearance: 3,
        dividerThickness: 15,
        topSystem: {
          style: "style_1",
          frontRailHeight: 40
        },
        bottomSystem: {
          style: "style_1",
          frontRailHeight: 53
        },
        zones: [
          {
            id: "zone-1",
            type: "side_door",
            height: 600
          },
          {
            id: "zone-2",
            type: "drawer",
            height: 300
          },
          {
            id: "zone-3",
            type: "double_door",
            height: 945,
            verticalDivider: true
          }
        ]
      },
      pins: {
        boards: {
          V1: {
            x0: 0,
            x1: 16,
            y0: 0,
            y1: 150,
            z0: 0,
            z1: 2e3
          },
          V2: {
            x0: 584,
            x1: 600,
            y0: 0,
            y1: 150,
            z0: 0,
            z1: 2e3
          },
          V3: {
            x0: 0,
            x1: 16,
            y0: 418,
            y1: 568,
            z0: 0,
            z1: 2e3
          },
          V4: {
            x0: 584,
            x1: 600,
            y0: 418,
            y1: 568,
            z0: 0,
            z1: 2e3
          },
          T1: {
            x0: 0,
            x1: 600,
            y0: 39,
            y1: 55,
            z0: 1960,
            z1: 2e3
          },
          T2: {
            x0: 0,
            x1: 600,
            y0: 55,
            y1: 70,
            z0: 1960,
            z1: 2e3
          },
          T3: {
            x0: 0,
            x1: 600,
            y0: 0,
            y1: 150,
            z0: 1944,
            z1: 1960
          },
          B1: {
            x0: 0,
            x1: 600,
            y0: 39,
            y1: 55,
            z0: 0,
            z1: 53
          },
          B2: {
            x0: 0,
            x1: 600,
            y0: 55,
            y1: 70,
            z0: 0,
            z1: 53
          },
          B3: {
            x0: 0,
            x1: 600,
            y0: 0,
            y1: 150,
            z0: 53,
            z1: 69
          },
          T5: {
            x0: 0,
            x1: 600,
            y0: 552,
            y1: 567,
            z0: 1900,
            z1: 2e3
          },
          T4: {
            x0: 0,
            x1: 600,
            y0: 452,
            y1: 552,
            z0: 1984,
            z1: 1999
          },
          "Zi_boundary-zone-2": {
            x0: 0,
            x1: 600,
            y0: 0,
            y1: 568,
            z0: 669,
            z1: 684
          },
          "Zi_boundary-zone-3": {
            x0: 0,
            x1: 600,
            y0: 0,
            y1: 568,
            z0: 984,
            z1: 999
          },
          H13_top: {
            x0: 0,
            x1: 15,
            y0: 150,
            y1: 418,
            z0: 1900,
            z1: 2e3
          },
          H24_top: {
            x0: 585,
            x1: 600,
            y0: 150,
            y1: 418,
            z0: 1900,
            z1: 2e3
          },
          H13_bottom: {
            x0: 0,
            x1: 15,
            y0: 150,
            y1: 418,
            z0: 0,
            z1: 100
          },
          H24_bottom: {
            x0: 585,
            x1: 600,
            y0: 150,
            y1: 418,
            z0: 0,
            z1: 100
          },
          H34_bottom: {
            x0: 16,
            x1: 584,
            y0: 553,
            y1: 568,
            z0: 0,
            z1: 100
          },
          H13_mid: {
            x0: 0,
            x1: 15,
            y0: 150,
            y1: 418,
            z0: 999,
            z1: 1099
          },
          H24_mid: {
            x0: 585,
            x1: 600,
            y0: 150,
            y1: 418,
            z0: 999,
            z1: 1099
          },
          H34_mid: {
            x0: 16,
            x1: 584,
            y0: 553,
            y1: 568,
            z0: 999,
            z1: 1099
          },
          "VD_zone-3": {
            x0: 292.5,
            x1: 307.5,
            y0: 0,
            y1: 568,
            z0: 999,
            z1: 1944
          },
          "FP_zone-1": {
            x0: 2.5,
            x1: 597.5,
            y0: -16,
            y1: 0,
            z0: 53,
            z1: 675.25
          },
          "FP_zone-2": {
            x0: 2.5,
            x1: 597.5,
            y0: -16,
            y1: 0,
            z0: 677.75,
            z1: 990.25
          },
          "FP_zone-3_L": {
            x0: 2.5,
            x1: 298.75,
            y0: -16,
            y1: 0,
            z0: 992.75,
            z1: 1960
          },
          "FP_zone-3_R": {
            x0: 301.25,
            x1: 597.5,
            y0: -16,
            y1: 0,
            z0: 992.75,
            z1: 1960
          }
        },
        points: {
          "V1.pv": [
            [
              70,
              0
            ],
            [
              150,
              0
            ],
            [
              150,
              668.5
            ],
            [
              100,
              668.5
            ],
            [
              100,
              684.5
            ],
            [
              150,
              684.5
            ],
            [
              150,
              983.5
            ],
            [
              100,
              983.5
            ],
            [
              100,
              999.5
            ],
            [
              150,
              999.5
            ],
            [
              150,
              2e3
            ],
            [
              70,
              2e3
            ],
            [
              70,
              1960
            ],
            [
              80,
              1960
            ],
            [
              80,
              1944
            ],
            [
              0,
              1944
            ],
            [
              0,
              69
            ],
            [
              80,
              69
            ],
            [
              80,
              53
            ],
            [
              70,
              53
            ],
            [
              70,
              0
            ]
          ],
          "V2.pv": [
            [
              70,
              0
            ],
            [
              150,
              0
            ],
            [
              150,
              668.5
            ],
            [
              100,
              668.5
            ],
            [
              100,
              684.5
            ],
            [
              150,
              684.5
            ],
            [
              150,
              983.5
            ],
            [
              100,
              983.5
            ],
            [
              100,
              999.5
            ],
            [
              150,
              999.5
            ],
            [
              150,
              2e3
            ],
            [
              70,
              2e3
            ],
            [
              70,
              1960
            ],
            [
              80,
              1960
            ],
            [
              80,
              1944
            ],
            [
              0,
              1944
            ],
            [
              0,
              69
            ],
            [
              80,
              69
            ],
            [
              80,
              53
            ],
            [
              70,
              53
            ],
            [
              70,
              0
            ]
          ],
          "V3.pv": [
            [
              418,
              0
            ],
            [
              568,
              0
            ],
            [
              568,
              1895
            ],
            [
              552,
              1895
            ],
            [
              552,
              1984
            ],
            [
              447,
              1984
            ],
            [
              447,
              2e3
            ],
            [
              418,
              2e3
            ],
            [
              418,
              999.5
            ],
            [
              468,
              999.5
            ],
            [
              468,
              983.5
            ],
            [
              418,
              983.5
            ],
            [
              418,
              684.5
            ],
            [
              468,
              684.5
            ],
            [
              468,
              668.5
            ],
            [
              418,
              668.5
            ],
            [
              418,
              0
            ]
          ],
          "V4.pv": [
            [
              418,
              0
            ],
            [
              568,
              0
            ],
            [
              568,
              1895
            ],
            [
              552,
              1895
            ],
            [
              552,
              1984
            ],
            [
              447,
              1984
            ],
            [
              447,
              2e3
            ],
            [
              418,
              2e3
            ],
            [
              418,
              999.5
            ],
            [
              468,
              999.5
            ],
            [
              468,
              983.5
            ],
            [
              418,
              983.5
            ],
            [
              418,
              684.5
            ],
            [
              468,
              684.5
            ],
            [
              468,
              668.5
            ],
            [
              418,
              668.5
            ],
            [
              418,
              0
            ]
          ],
          "T3.pv": [
            [
              0,
              0
            ],
            [
              0,
              75
            ],
            [
              16,
              75
            ],
            [
              16,
              150
            ],
            [
              584,
              150
            ],
            [
              584,
              75
            ],
            [
              600,
              75
            ],
            [
              600,
              0
            ]
          ],
          "B3.pv": [
            [
              0,
              0
            ],
            [
              0,
              75
            ],
            [
              16,
              75
            ],
            [
              16,
              150
            ],
            [
              584,
              150
            ],
            [
              584,
              75
            ],
            [
              600,
              75
            ],
            [
              600,
              0
            ]
          ],
          "Zi_boundary-zone-2.pv": [
            [
              16,
              0
            ],
            [
              16,
              105
            ],
            [
              0,
              105
            ],
            [
              0,
              463
            ],
            [
              16,
              463
            ],
            [
              16,
              568
            ],
            [
              584,
              568
            ],
            [
              584,
              463
            ],
            [
              600,
              463
            ],
            [
              600,
              105
            ],
            [
              584,
              105
            ],
            [
              584,
              0
            ],
            [
              16,
              0
            ]
          ],
          "Zi_boundary-zone-3.pv": [
            [
              16,
              0
            ],
            [
              16,
              105
            ],
            [
              0,
              105
            ],
            [
              0,
              463
            ],
            [
              16,
              463
            ],
            [
              16,
              568
            ],
            [
              584,
              568
            ],
            [
              584,
              463
            ],
            [
              600,
              463
            ],
            [
              600,
              105
            ],
            [
              584,
              105
            ],
            [
              584,
              0
            ],
            [
              16,
              0
            ]
          ],
          "VD_zone-3.pv": [
            [
              0,
              991.5
            ],
            [
              189.333,
              991.5
            ],
            [
              189.333,
              999
            ],
            [
              378.667,
              999
            ],
            [
              378.667,
              991.5
            ],
            [
              568,
              991.5
            ],
            [
              568,
              999
            ],
            [
              552,
              999
            ],
            [
              552,
              1099
            ],
            [
              568,
              1099
            ],
            [
              568,
              1895
            ],
            [
              552,
              1895
            ],
            [
              552,
              1944
            ],
            [
              0,
              1944
            ],
            [
              0,
              991.5
            ]
          ]
        },
        features: {},
        faceFeatures: {
          "Zi_boundary-zone-3.A.zi_groove_VD_zone-3_boundary-zone-3": {
            u0: 292,
            u1: 308,
            v0: 184.333,
            v1: 383.667,
            depth: 8
          },
          "FP_zone-1.A.FP_zone-1_hinge_1": {
            diameter: 35,
            depth: 12.5,
            cx: 22.5,
            cy: 522.25
          },
          "FP_zone-1.A.FP_zone-1_hinge_2": {
            diameter: 35,
            depth: 12.5,
            cx: 22.5,
            cy: 100
          },
          "FP_zone-3_L.A.FP_zone-3_L_hinge_1": {
            diameter: 35,
            depth: 12.5,
            cx: 22.5,
            cy: 867.25
          },
          "FP_zone-3_L.A.FP_zone-3_L_hinge_2": {
            diameter: 35,
            depth: 12.5,
            cx: 22.5,
            cy: 100
          },
          "FP_zone-3_R.A.FP_zone-3_R_hinge_1": {
            diameter: 35,
            depth: 12.5,
            cx: 273.75,
            cy: 867.25
          },
          "FP_zone-3_R.A.FP_zone-3_R_hinge_2": {
            diameter: 35,
            depth: 12.5,
            cx: 273.75,
            cy: 100
          }
        }
      }
    },
    {
      id: "base-params",
      label: "Tall \xB7 2100\xD7664\xD7600 \xB7 5 \u533A\u94FE\uFF08\u9EC4\u91D1 baseParams\uFF0Cmismatch \u221230\uFF09",
      params: {
        cabinetHeight: 2100,
        cabinetWidth: 664,
        cabinetDepth: 600,
        panelThickness: 16,
        frontFaceAllowance: 16,
        ziThickness: 15,
        hThickness: 15,
        sideClearance: 3,
        dividerThickness: 15,
        topSystem: {
          style: "style_1",
          frontRailHeight: 40
        },
        bottomSystem: {
          style: "style_1",
          frontRailHeight: 53
        },
        zones: [
          {
            id: "side-door",
            type: "side_door",
            height: 600
          },
          {
            id: "drawer-a",
            type: "drawer",
            height: 300
          },
          {
            id: "drawer-b",
            type: "drawer",
            height: 300
          },
          {
            id: "blank",
            type: "blank_panel",
            height: 400
          },
          {
            id: "open",
            type: "open_space",
            height: 300
          }
        ]
      },
      pins: {
        boards: {
          V1: {
            x0: 0,
            x1: 16,
            y0: 0,
            y1: 150,
            z0: 0,
            z1: 2100
          },
          V2: {
            x0: 648,
            x1: 664,
            y0: 0,
            y1: 150,
            z0: 0,
            z1: 2100
          },
          V3: {
            x0: 0,
            x1: 16,
            y0: 434,
            y1: 584,
            z0: 0,
            z1: 2100
          },
          V4: {
            x0: 648,
            x1: 664,
            y0: 434,
            y1: 584,
            z0: 0,
            z1: 2100
          },
          T1: {
            x0: 0,
            x1: 664,
            y0: 39,
            y1: 55,
            z0: 2060,
            z1: 2100
          },
          T2: {
            x0: 0,
            x1: 664,
            y0: 55,
            y1: 70,
            z0: 2060,
            z1: 2100
          },
          T3: {
            x0: 0,
            x1: 664,
            y0: 0,
            y1: 150,
            z0: 2044,
            z1: 2060
          },
          B1: {
            x0: 0,
            x1: 664,
            y0: 39,
            y1: 55,
            z0: 0,
            z1: 53
          },
          B2: {
            x0: 0,
            x1: 664,
            y0: 55,
            y1: 70,
            z0: 0,
            z1: 53
          },
          B3: {
            x0: 0,
            x1: 664,
            y0: 0,
            y1: 150,
            z0: 53,
            z1: 69
          },
          T5: {
            x0: 0,
            x1: 664,
            y0: 568,
            y1: 583,
            z0: 2e3,
            z1: 2100
          },
          T4: {
            x0: 0,
            x1: 664,
            y0: 468,
            y1: 568,
            z0: 2084,
            z1: 2099
          },
          "Zi_boundary-drawer-a": {
            x0: 0,
            x1: 664,
            y0: 0,
            y1: 584,
            z0: 669,
            z1: 684
          },
          "Zi_boundary-drawer-b": {
            x0: 0,
            x1: 664,
            y0: 0,
            y1: 584,
            z0: 984,
            z1: 999
          },
          "Zi_boundary-blank": {
            x0: 0,
            x1: 664,
            y0: 0,
            y1: 584,
            z0: 1299,
            z1: 1314
          },
          H13_top: {
            x0: 0,
            x1: 15,
            y0: 150,
            y1: 434,
            z0: 2e3,
            z1: 2100
          },
          H24_top: {
            x0: 649,
            x1: 664,
            y0: 150,
            y1: 434,
            z0: 2e3,
            z1: 2100
          },
          H13_bottom: {
            x0: 0,
            x1: 15,
            y0: 150,
            y1: 434,
            z0: 0,
            z1: 100
          },
          H24_bottom: {
            x0: 649,
            x1: 664,
            y0: 150,
            y1: 434,
            z0: 0,
            z1: 100
          },
          H34_bottom: {
            x0: 16,
            x1: 648,
            y0: 569,
            y1: 584,
            z0: 0,
            z1: 100
          },
          H13_mid: {
            x0: 0,
            x1: 15,
            y0: 150,
            y1: 434,
            z0: 1e3,
            z1: 1100
          },
          H24_mid: {
            x0: 649,
            x1: 664,
            y0: 150,
            y1: 434,
            z0: 1e3,
            z1: 1100
          },
          H34_mid: {
            x0: 16,
            x1: 648,
            y0: 569,
            y1: 584,
            z0: 1e3,
            z1: 1100
          },
          H12_blank_top: {
            x0: 16,
            x1: 648,
            y0: 0,
            y1: 15,
            z0: 1614,
            z1: 1714
          },
          H12_blank_bottom: {
            x0: 16,
            x1: 648,
            y0: 0,
            y1: 15,
            z0: 1314,
            z1: 1414
          },
          "FP_side-door": {
            x0: 2.5,
            x1: 661.5,
            y0: -16,
            y1: 0,
            z0: 53,
            z1: 675.25
          },
          "FP_drawer-a": {
            x0: 2.5,
            x1: 661.5,
            y0: -16,
            y1: 0,
            z0: 677.75,
            z1: 990.25
          },
          "FP_drawer-b": {
            x0: 2.5,
            x1: 661.5,
            y0: -16,
            y1: 0,
            z0: 992.75,
            z1: 1305.25
          }
        },
        points: {
          "V1.pv": [
            [
              70,
              0
            ],
            [
              150,
              0
            ],
            [
              150,
              668.5
            ],
            [
              100,
              668.5
            ],
            [
              100,
              684.5
            ],
            [
              150,
              684.5
            ],
            [
              150,
              983.5
            ],
            [
              100,
              983.5
            ],
            [
              100,
              999.5
            ],
            [
              150,
              999.5
            ],
            [
              150,
              1298.5
            ],
            [
              100,
              1298.5
            ],
            [
              100,
              1314.5
            ],
            [
              150,
              1314.5
            ],
            [
              150,
              2100
            ],
            [
              70,
              2100
            ],
            [
              70,
              2060
            ],
            [
              80,
              2060
            ],
            [
              80,
              2044
            ],
            [
              0,
              2044
            ],
            [
              0,
              69
            ],
            [
              80,
              69
            ],
            [
              80,
              53
            ],
            [
              70,
              53
            ],
            [
              70,
              0
            ]
          ],
          "V2.pv": [
            [
              70,
              0
            ],
            [
              150,
              0
            ],
            [
              150,
              668.5
            ],
            [
              100,
              668.5
            ],
            [
              100,
              684.5
            ],
            [
              150,
              684.5
            ],
            [
              150,
              983.5
            ],
            [
              100,
              983.5
            ],
            [
              100,
              999.5
            ],
            [
              150,
              999.5
            ],
            [
              150,
              1298.5
            ],
            [
              100,
              1298.5
            ],
            [
              100,
              1314.5
            ],
            [
              150,
              1314.5
            ],
            [
              150,
              2100
            ],
            [
              70,
              2100
            ],
            [
              70,
              2060
            ],
            [
              80,
              2060
            ],
            [
              80,
              2044
            ],
            [
              0,
              2044
            ],
            [
              0,
              69
            ],
            [
              80,
              69
            ],
            [
              80,
              53
            ],
            [
              70,
              53
            ],
            [
              70,
              0
            ]
          ],
          "V3.pv": [
            [
              434,
              0
            ],
            [
              584,
              0
            ],
            [
              584,
              1995
            ],
            [
              568,
              1995
            ],
            [
              568,
              2084
            ],
            [
              463,
              2084
            ],
            [
              463,
              2100
            ],
            [
              434,
              2100
            ],
            [
              434,
              1314.5
            ],
            [
              484,
              1314.5
            ],
            [
              484,
              1298.5
            ],
            [
              434,
              1298.5
            ],
            [
              434,
              684.5
            ],
            [
              484,
              684.5
            ],
            [
              484,
              668.5
            ],
            [
              434,
              668.5
            ],
            [
              434,
              0
            ]
          ],
          "V4.pv": [
            [
              434,
              0
            ],
            [
              584,
              0
            ],
            [
              584,
              1995
            ],
            [
              568,
              1995
            ],
            [
              568,
              2084
            ],
            [
              463,
              2084
            ],
            [
              463,
              2100
            ],
            [
              434,
              2100
            ],
            [
              434,
              1314.5
            ],
            [
              484,
              1314.5
            ],
            [
              484,
              1298.5
            ],
            [
              434,
              1298.5
            ],
            [
              434,
              684.5
            ],
            [
              484,
              684.5
            ],
            [
              484,
              668.5
            ],
            [
              434,
              668.5
            ],
            [
              434,
              0
            ]
          ],
          "T3.pv": [
            [
              0,
              0
            ],
            [
              0,
              75
            ],
            [
              16,
              75
            ],
            [
              16,
              150
            ],
            [
              648,
              150
            ],
            [
              648,
              75
            ],
            [
              664,
              75
            ],
            [
              664,
              0
            ]
          ],
          "B3.pv": [
            [
              0,
              0
            ],
            [
              0,
              75
            ],
            [
              16,
              75
            ],
            [
              16,
              150
            ],
            [
              648,
              150
            ],
            [
              648,
              75
            ],
            [
              664,
              75
            ],
            [
              664,
              0
            ]
          ],
          "Zi_boundary-drawer-a.pv": [
            [
              16,
              0
            ],
            [
              16,
              105
            ],
            [
              0,
              105
            ],
            [
              0,
              479
            ],
            [
              16,
              479
            ],
            [
              16,
              584
            ],
            [
              648,
              584
            ],
            [
              648,
              479
            ],
            [
              664,
              479
            ],
            [
              664,
              105
            ],
            [
              648,
              105
            ],
            [
              648,
              0
            ],
            [
              16,
              0
            ]
          ],
          "Zi_boundary-drawer-b.pv": [
            [
              0,
              0
            ],
            [
              0,
              45
            ],
            [
              16,
              45
            ],
            [
              16,
              150
            ],
            [
              648,
              150
            ],
            [
              648,
              45
            ],
            [
              664,
              45
            ],
            [
              664,
              0
            ],
            [
              0,
              0
            ]
          ],
          "Zi_boundary-blank.pv": [
            [
              16,
              0
            ],
            [
              16,
              105
            ],
            [
              0,
              105
            ],
            [
              0,
              479
            ],
            [
              16,
              479
            ],
            [
              16,
              584
            ],
            [
              648,
              584
            ],
            [
              648,
              479
            ],
            [
              664,
              479
            ],
            [
              664,
              105
            ],
            [
              648,
              105
            ],
            [
              648,
              0
            ],
            [
              16,
              0
            ]
          ]
        },
        features: {},
        faceFeatures: {
          "FP_side-door.A.FP_side-door_hinge_1": {
            diameter: 35,
            depth: 12.5,
            cx: 22.5,
            cy: 522.25
          },
          "FP_side-door.A.FP_side-door_hinge_2": {
            diameter: 35,
            depth: 12.5,
            cx: 22.5,
            cy: 100
          }
        }
      }
    },
    {
      id: "rogue-dometic",
      label: "Rogue Dometic fridge \xB7 593 \xD7 640 \xD7 1965",
      ui: true,
      params: {
        cabinetHeight: 1965,
        cabinetWidth: 593,
        cabinetDepth: 640,
        panelThickness: 15,
        frontPanelThickness: 16,
        sideClearance: 3,
        leftSidePanelThickness: 16,
        leftSidePanelFinish: "colour",
        rightSidePanelThickness: 0,
        exteriorSide: "left",
        ledGroove: true,
        topSystem: {
          style: "style_2",
          height: 101
        },
        bottomSystem: {
          style: "style_1",
          frontRailHeight: 55
        },
        frontHardware: {
          frontClearance: 3
        },
        zones: [
          {
            id: "zone-1",
            type: "bottom_flap",
            height: 172,
            lockPosition: "top"
          },
          {
            id: "zone-2",
            type: "drawer",
            height: 247,
            lockPosition: "top"
          },
          {
            id: "zone-3",
            type: "fridge",
            height: 1344,
            applianceWidthMm: 532,
            applianceHeightMm: 1344
          }
        ]
      },
      pins: {
        boards: {
          V1: {
            x0: 16,
            x1: 31,
            y0: 0,
            y1: 150,
            z0: 0,
            z1: 1965
          },
          V2: {
            x0: 578,
            x1: 593,
            y0: 0,
            y1: 150,
            z0: 0,
            z1: 1965
          },
          V3: {
            x0: 16,
            x1: 31,
            y0: 474,
            y1: 624,
            z0: 0,
            z1: 1965
          },
          V4: {
            x0: 578,
            x1: 593,
            y0: 474,
            y1: 624,
            z0: 0,
            z1: 1965
          },
          V5: {
            x0: 563,
            x1: 578,
            y0: 0,
            y1: 150,
            z0: 520,
            z1: 1949
          },
          TH1: {
            x0: 16,
            x1: 593,
            y0: 0,
            y1: 100,
            z0: 1949,
            z1: 1964
          },
          TopStyle2FixedFrontPanel: {
            x0: 31,
            x1: 563,
            y0: 0,
            y1: 16,
            z0: 1864,
            z1: 1949
          },
          B1: {
            x0: 16,
            x1: 593,
            y0: 39,
            y1: 55,
            z0: 0,
            z1: 55
          },
          B2: {
            x0: 16,
            x1: 593,
            y0: 55,
            y1: 70,
            z0: 0,
            z1: 55
          },
          B3: {
            x0: 16,
            x1: 593,
            y0: 0,
            y1: 150,
            z0: 55,
            z1: 70
          },
          T5: {
            x0: 16,
            x1: 593,
            y0: 608,
            y1: 623,
            z0: 1865,
            z1: 1965
          },
          T4: {
            x0: 16,
            x1: 593,
            y0: 508,
            y1: 608,
            z0: 1949,
            z1: 1964
          },
          "Zi_boundary-zone-2": {
            x0: 16,
            x1: 593,
            y0: 0,
            y1: 224,
            z0: 243,
            z1: 258
          },
          "Zi_boundary-zone-3": {
            x0: 16,
            x1: 593,
            y0: 0,
            y1: 624,
            z0: 505,
            z1: 520
          },
          H13_top: {
            x0: 16,
            x1: 31,
            y0: 150,
            y1: 474,
            z0: 1865,
            z1: 1965
          },
          H24_top: {
            x0: 578,
            x1: 593,
            y0: 150,
            y1: 474,
            z0: 1865,
            z1: 1965
          },
          H13_bottom: {
            x0: 16,
            x1: 31,
            y0: 150,
            y1: 474,
            z0: 0,
            z1: 100
          },
          H24_bottom: {
            x0: 578,
            x1: 593,
            y0: 150,
            y1: 474,
            z0: 0,
            z1: 100
          },
          H34_bottom: {
            x0: 31,
            x1: 578,
            y0: 609,
            y1: 624,
            z0: 0,
            z1: 100
          },
          H13_mid: {
            x0: 16,
            x1: 31,
            y0: 150,
            y1: 474,
            z0: 932.5,
            z1: 1032.5
          },
          H24_mid: {
            x0: 578,
            x1: 593,
            y0: 150,
            y1: 474,
            z0: 932.5,
            z1: 1032.5
          },
          H34_mid: {
            x0: 31,
            x1: 578,
            y0: 609,
            y1: 624,
            z0: 932.5,
            z1: 1032.5
          },
          H13_fridgeBase: {
            x0: 16,
            x1: 31,
            y0: 150,
            y1: 474,
            z0: 258,
            z1: 504.5
          },
          H24_fridgeBase: {
            x0: 578,
            x1: 593,
            y0: 150,
            y1: 474,
            z0: 258,
            z1: 504.5
          },
          H34_fridgeBase: {
            x0: 31,
            x1: 578,
            y0: 609,
            y1: 624,
            z0: 405,
            z1: 505
          },
          FridgeBaseRail: {
            x0: 31,
            x1: 578,
            y0: 0,
            y1: 100,
            z0: 490,
            z1: 505
          },
          "FP_zone-1": {
            x0: 19,
            x1: 590,
            y0: -16,
            y1: 0,
            z0: 55,
            z1: 249
          },
          "FP_zone-2": {
            x0: 19,
            x1: 590,
            y0: -16,
            y1: 0,
            z0: 252,
            z1: 496.5
          },
          SidePanel_L: {
            x0: 0,
            x1: 16,
            y0: -16,
            y1: 624,
            z0: 0,
            z1: 1965
          }
        },
        points: {
          "V1.pv": [
            [
              70,
              0
            ],
            [
              150,
              0
            ],
            [
              150,
              242.5
            ],
            [
              100,
              242.5
            ],
            [
              100,
              258.5
            ],
            [
              150,
              258.5
            ],
            [
              150,
              504.5
            ],
            [
              100,
              504.5
            ],
            [
              100,
              520.5
            ],
            [
              150,
              520.5
            ],
            [
              150,
              1965
            ],
            [
              105,
              1965
            ],
            [
              105,
              1949
            ],
            [
              0,
              1949
            ],
            [
              0,
              71
            ],
            [
              80,
              71
            ],
            [
              80,
              55
            ],
            [
              70,
              55
            ],
            [
              70,
              0
            ]
          ],
          "V2.pv": [
            [
              70,
              0
            ],
            [
              150,
              0
            ],
            [
              150,
              242.5
            ],
            [
              100,
              242.5
            ],
            [
              100,
              258.5
            ],
            [
              150,
              258.5
            ],
            [
              150,
              504.5
            ],
            [
              100,
              504.5
            ],
            [
              100,
              520.5
            ],
            [
              150,
              520.5
            ],
            [
              150,
              1965
            ],
            [
              105,
              1965
            ],
            [
              105,
              1949
            ],
            [
              0,
              1949
            ],
            [
              0,
              71
            ],
            [
              80,
              71
            ],
            [
              80,
              55
            ],
            [
              70,
              55
            ],
            [
              70,
              0
            ]
          ],
          "V3.pv": [
            [
              474,
              0
            ],
            [
              624,
              0
            ],
            [
              624,
              1860
            ],
            [
              608,
              1860
            ],
            [
              608,
              1949
            ],
            [
              503,
              1949
            ],
            [
              503,
              1965
            ],
            [
              474,
              1965
            ],
            [
              474,
              520.5
            ],
            [
              524,
              520.5
            ],
            [
              524,
              504.5
            ],
            [
              474,
              504.5
            ],
            [
              474,
              0
            ]
          ],
          "V4.pv": [
            [
              474,
              0
            ],
            [
              624,
              0
            ],
            [
              624,
              1860
            ],
            [
              608,
              1860
            ],
            [
              608,
              1949
            ],
            [
              503,
              1949
            ],
            [
              503,
              1965
            ],
            [
              474,
              1965
            ],
            [
              474,
              520.5
            ],
            [
              524,
              520.5
            ],
            [
              524,
              504.5
            ],
            [
              474,
              504.5
            ],
            [
              474,
              0
            ]
          ],
          "V5.pv": [
            [
              0,
              520
            ],
            [
              150,
              520
            ],
            [
              150,
              1949
            ],
            [
              0,
              1949
            ],
            [
              0,
              520
            ]
          ],
          "B3.pv": [
            [
              16,
              0
            ],
            [
              16,
              75
            ],
            [
              31,
              75
            ],
            [
              31,
              150
            ],
            [
              578,
              150
            ],
            [
              578,
              75
            ],
            [
              593,
              75
            ],
            [
              593,
              0
            ]
          ],
          "Zi_boundary-zone-2.pv": [
            [
              31,
              0
            ],
            [
              31,
              105
            ],
            [
              16,
              105
            ],
            [
              16,
              224
            ],
            [
              31,
              224
            ],
            [
              31,
              224
            ],
            [
              578,
              224
            ],
            [
              578,
              224
            ],
            [
              593,
              224
            ],
            [
              593,
              105
            ],
            [
              578,
              105
            ],
            [
              578,
              0
            ],
            [
              31,
              0
            ]
          ],
          "Zi_boundary-zone-3.pv": [
            [
              31,
              0
            ],
            [
              31,
              105
            ],
            [
              16,
              105
            ],
            [
              16,
              519
            ],
            [
              31,
              519
            ],
            [
              31,
              624
            ],
            [
              578,
              624
            ],
            [
              578,
              519
            ],
            [
              593,
              519
            ],
            [
              593,
              105
            ],
            [
              578,
              105
            ],
            [
              578,
              0
            ],
            [
              31,
              0
            ]
          ]
        },
        features: {},
        faceFeatures: {
          "B3.B.B3_LED_MAIN": {
            u0: 0,
            u1: 577,
            v0: 18,
            v1: 32.5,
            depth: 6.5
          },
          "B3.B.B3_LED_BRANCH_1": {
            u0: 22.75,
            u1: 37.25,
            v0: 32.5,
            v1: 150,
            depth: 6.5
          },
          "B3.B.B3_LED_BRANCH_2": {
            u0: 539.75,
            u1: 554.25,
            v0: 32.5,
            v1: 150,
            depth: 6.5
          },
          "FP_zone-1.A.FP_zone-1_hinge_1": {
            diameter: 35,
            depth: 12,
            cx: 100,
            cy: 22.5
          },
          "FP_zone-1.A.FP_zone-1_hinge_2": {
            diameter: 35,
            depth: 12,
            cx: 471,
            cy: 22.5
          },
          "FP_zone-1.A.FP_zone-1_lock": {
            u0: 258,
            u1: 313,
            v0: 149.75,
            v1: 165.25,
            radius: 7.75
          },
          "FP_zone-2.A.FP_zone-2_lock": {
            u0: 258,
            u1: 313,
            v0: 199.75,
            v1: 215.25,
            radius: 7.75
          }
        }
      }
    }
  ]
};

// generators/generalTall/uiPresets.ts
var GT_UI_PRESETS = presets_default.presets.filter((p) => p.ui === true).map((p) => ({ id: p.id, label: p.label, params: p.params }));

// generators/generalTall/generator.ts
var asNum = (v, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
var r2 = (v) => Math.round(v * 1e3) / 1e3;
var EPS3 = 1e-3;
var PANEL_TYPES = /* @__PURE__ */ new Set(["side_door", "left_side_door", "right_side_door", "double_door", "drawer", "top_flap", "bottom_flap", "fixed_panel"]);
function applyFridgePrep(input, notes) {
  const zones = (input.zones ?? []).map((zone) => {
    if (zone.type !== "fridge") return zone;
    const applianceHeight = Number(zone.applianceHeightMm);
    if (Number.isFinite(applianceHeight) && applianceHeight > 0) {
      if (Math.abs(asNum(zone.height, 0) - applianceHeight) > 0.01) {
        notes.push(`Fridge zone ${zone.id} height synced to applianceHeightMm=${applianceHeight}.`);
      }
      return { ...zone, height: applianceHeight };
    }
    notes.push(`Fridge zone ${zone.id} has no applianceHeightMm; using zone height ${asNum(zone.height, 0)}.`);
    return zone;
  });
  const fridgeZones = zones.filter((zone) => zone.type === "fridge");
  if (!fridgeZones.length) return { ...input, zones };
  const exteriorSide = input.exteriorSide === "left" || input.exteriorSide === "right" ? input.exteriorSide : "none";
  const next = { ...input, zones, exteriorSide };
  const { CPT, FPT } = stockThickness(input);
  if (exteriorSide !== "none") {
    const key = exteriorSide === "left" ? "leftSidePanelThickness" : "rightSidePanelThickness";
    const finish = exteriorSide === "left" ? input.leftSidePanelFinish : input.rightSidePanelFinish;
    if (!(asNum(input[key], 0) > 0)) {
      next[key] = finish === "colour" ? FPT : CPT;
      notes.push(`Fridge exteriorSide=${exteriorSide} \u2192 SidePanel_${exteriorSide === "left" ? "L" : "R"} ${next[key]} mm (${finish === "colour" ? "door" : "carcass"} stock).`);
    }
  }
  const sync = input.syncCabinetWidthFromFridge !== false;
  const cutOut = Number(fridgeZones[0].applianceWidthMm);
  if (sync && Number.isFinite(cutOut) && cutOut > 0) {
    const sides = asNum(next.leftSidePanelThickness, 0) + asNum(next.rightSidePanelThickness, 0);
    const targetWidth = fridgeCabinetWidth(cutOut, sides, CPT);
    if (Math.abs(asNum(input.cabinetWidth, 0) - targetWidth) > 0.01) {
      notes.push(`Cabinet width synced from the fridge cut-out (${cutOut} + ${FRIDGE_STILES} \xD7 ${CPT} + sides ${sides} = ${targetWidth}).`);
    }
    next.cabinetWidth = targetWidth;
  }
  return next;
}
function stockThickness(input) {
  return {
    CPT: asNum(input.panelThickness, RULES.DEFAULT_PANEL_THICKNESS.value),
    FPT: asNum(input.frontPanelThickness ?? input.frontFaceAllowance ?? input.doorPanelThickness, RULES.DEFAULT_FRONT_FACE_ALLOWANCE.value)
  };
}
var FRIDGE_STILES = 3;
function fridgeCabinetWidth(cutOut, sides, CPT) {
  return Math.round((cutOut + sides + FRIDGE_STILES * CPT) * 1e3) / 1e3;
}
function normalize(input, errors) {
  const CH = asNum(input.cabinetHeight, 0);
  const CW = asNum(input.cabinetWidth, 0);
  const CD = asNum(input.cabinetDepth, 0);
  const { CPT, FPT } = stockThickness(input);
  const ziT = asNum(input.ziThickness, RULES.DEFAULT_ZI_THICKNESS.value);
  const hT = asNum(input.hThickness, RULES.DEFAULT_H_THICKNESS.value);
  const dividerT = asNum(input.dividerThickness, RULES.DEFAULT_DIVIDER_THICKNESS.value);
  const fc = asNum(input.frontHardware?.frontClearance, RULES.DEFAULT_FRONT_CLEARANCE.value);
  const leftT = asNum(input.leftSidePanelThickness, 0);
  const rightT = asNum(input.rightSidePanelThickness, 0);
  const leftFinish = input.leftSidePanelFinish === "colour" ? "colour" : "carcass";
  const rightFinish = input.rightSidePanelFinish === "colour" ? "colour" : "carcass";
  for (const [name, t] of [["Left", leftT], ["Right", rightT]]) {
    if (t !== 0 && t !== RULES.SIDE_PANEL_WHITELIST_15.value && t !== RULES.SIDE_PANEL_WHITELIST_16.value && t !== FPT && t !== CPT) {
      errors.push(`${name} side panel thickness must be one of {0, 15, 16}.`);
    }
  }
  const topStyle = input.topSystem?.style ?? "style_1";
  const botStyle = input.bottomSystem?.style ?? "style_1";
  const topInsert = topStyle === "style_1" ? asNum(input.topSystem?.insertSlotThickness, RULES.STYLE_1_INSERT_SLOT_THICKNESS.value) : 0;
  const botInsert = botStyle === "style_1" ? asNum(input.bottomSystem?.insertSlotThickness, RULES.STYLE_1_INSERT_SLOT_THICKNESS.value) : 0;
  const topFront = topStyle === "style_1" ? Math.max(asNum(input.topSystem?.frontRailHeight, 0), RULES.TOP_STYLE_1_MIN_FRONT_RAIL_HEIGHT.value) : asNum(input.topSystem?.height, 0);
  const botFront = botStyle === "style_1" ? Math.max(asNum(input.bottomSystem?.frontRailHeight, 0), RULES.BOTTOM_STYLE_1_MIN_FRONT_RAIL_HEIGHT.value) : asNum(input.bottomSystem?.height, 0);
  const topRailH = topFront + topInsert;
  const botRailH = botFront + botInsert;
  if (topStyle === "style_2" && topFront < 60) errors.push("top/bottom Style 2 height must be >= 60 mm.");
  if (botStyle === "style_2" && botFront < 60) errors.push("top/bottom Style 2 height must be >= 60 mm.");
  const av = input.avoidance ?? {};
  const avoid = {
    enabled: av.enabled === true,
    depth: Math.min(Math.max(asNum(av.depth, 0), 0), CD),
    height: Math.min(Math.max(asNum(av.height, 0), 0), CH)
  };
  const midWidth = CW - leftT - rightT;
  if (midWidth <= 0) errors.push("MidWidth must be > 0 after side panel thickness (CabinetWidth too small).");
  return {
    CH,
    CW,
    CD,
    CPT,
    FPT,
    ziT,
    hT,
    dividerT,
    leftT,
    rightT,
    leftFinish,
    rightFinish,
    leftAdapt: input.leftSidePanelAdaptAvoidance ?? true,
    rightAdapt: input.rightSidePanelAdaptAvoidance ?? true,
    topSys: { style: topStyle, railH: topRailH, frontRail: topFront, insert: topInsert },
    botSys: { style: botStyle, railH: botRailH, frontRail: botFront, insert: botInsert },
    avoid,
    fc,
    locksOn: input.frontHardware?.locksEnabled !== false,
    panelsOn: input.frontHardware?.frontPanelsEnabled !== false,
    zones: input.zones ?? [],
    midWidth,
    midDepth: r2(CD - FPT),
    dx: leftT,
    sideClearance: asNum(input.sideClearance, RULES.DEFAULT_SIDE_CLEARANCE.value),
    exteriorSide: input.exteriorSide === "left" || input.exteriorSide === "right" ? input.exteriorSide : "none",
    syncCabinetWidthFromFridge: input.syncCabinetWidthFromFridge !== false
  };
}
function resolveBoundary(above, below) {
  if (below === "bottom_system") return "none";
  if (below === "blank_panel" || above === "top_system") return "none";
  if (above === "drawer" && below === "drawer") return "half_zi";
  if (above === "bottom_system") return "none";
  if (above === "drawer") return "full_zi";
  return "full_zi";
}
function computeStack(s, errors, warnings) {
  const items = [];
  const botSys = {
    id: "bottom-system",
    kind: "bottom_system",
    z0: 0,
    z1: r2(s.botSys.railH),
    height: r2(s.botSys.railH),
    centerZ: r2(s.botSys.railH / 2)
  };
  items.push(botSys);
  let z = s.botSys.railH;
  const zoneItems = [];
  const boundaries = [];
  const prevTypes = ["bottom_system"];
  s.zones.forEach((zone, i) => {
    if (asNum(zone.height, 0) <= 0) errors.push(`Zone ${zone.id} height must be > 0.`);
    {
      const above = zone.type;
      const below = prevTypes[prevTypes.length - 1];
      let bt = resolveBoundary(above, below);
      if (zone.verticalDivider === true && below !== "bottom_system") bt = "full_zi";
      if (bt !== "none") {
        const h = s.ziT;
        boundaries.push({
          id: `boundary-${zone.id}`,
          kind: "boundary_panel",
          boundaryType: bt,
          upgraded: zone.verticalDivider === true,
          z0: r2(z),
          z1: r2(z + h),
          height: h,
          centerZ: r2(z + h / 2)
        });
        items.push(boundaries[boundaries.length - 1]);
        z += h;
      }
    }
    const zoneH = asNum(zone.height, 0);
    zoneItems.push({
      id: `zone-${zone.id}`,
      kind: "functional_zone",
      zoneType: zone.type,
      zoneId: zone.id,
      z0: r2(z),
      z1: r2(z + zoneH),
      height: zoneH,
      centerZ: r2(z + zoneH / 2),
      zone
    });
    items.push(zoneItems[zoneItems.length - 1]);
    z += zoneH;
    prevTypes.push(zone.type);
  });
  const topSys = {
    id: "top-system",
    kind: "top_system",
    z0: r2(z),
    z1: r2(z + s.topSys.railH),
    height: r2(s.topSys.railH),
    centerZ: r2(z + s.topSys.railH / 2)
  };
  items.push(topSys);
  const diff = r2(z + s.topSys.railH - s.CH);
  if (Math.abs(diff) > RULES.STACKING_HEIGHT_TOLERANCE.value) {
    warnings.push(`Height mismatch: expected CH = ${r2(s.CH)}; calculated CH = ${r2(z + s.topSys.railH)}; difference = ${diff}.`);
  }
  return { zones: zoneItems, boundaries, topSys, botSys, calculatedHeight: r2(z + s.topSys.railH) };
}
var SLACK_ZONE_MIN = 300;
function fitTallCabinetHeight(input, cabinetHeight, slackZoneId) {
  const zones = (input.zones ?? []).map((zone) => ({ ...zone }));
  const H = r2(cabinetHeight);
  if (!zones.length) return { ...input, cabinetHeight: H };
  const chosen = slackZoneId ? zones.findIndex((zone) => zone.id === slackZoneId && zone.type !== "fridge") : -1;
  const named = zones.findIndex((zone) => zone.id === "zone-3" && zone.type !== "fridge");
  let fallback = -1;
  for (let i = zones.length - 1; i >= 0; i -= 1) {
    if (zones[i].type !== "fridge") {
      fallback = i;
      break;
    }
  }
  const index = chosen >= 0 ? chosen : named >= 0 ? named : fallback >= 0 ? fallback : zones.length - 1;
  const trial = zones.map((zone, i) => i === index ? { ...zone, height: 0 } : zone);
  const scratch = [];
  const stacked = computeStack(normalize({ ...input, cabinetHeight: H, zones: trial }, scratch), scratch, scratch);
  const room = r2(H - stacked.calculatedHeight);
  const floor = Math.min(SLACK_ZONE_MIN, asNum(zones[index].height, SLACK_ZONE_MIN));
  const height = Math.max(floor, room);
  const nextZones = zones.map((zone, i) => i === index ? { ...zone, height } : zone);
  const fitted = height === room ? H : r2(stacked.calculatedHeight + height);
  return { ...input, cabinetHeight: fitted, zones: nextZones };
}
function link(key) {
  return ex({ v: ref(key) }, (t) => t.v, `= ${key}`);
}
function yzTrace(id, pairs) {
  return recordLoop(id, ["y", "z"], pairs, true).map(([y, z]) => ({ y, z }));
}
function xyTrace(id, pairs) {
  return recordLoop(id, ["x", "y"], pairs, true).map(([x, y]) => ({ x, y }));
}
function mkBoard(id, name, category, boardType, thickness, kind, plane, axis, x0, x1, y0, y1, z0, z1, profileVector) {
  const box = recordBoardBox(id, r2(x0), r2(x1), r2(y0), r2(y1), r2(z0), r2(z1));
  return {
    id,
    name,
    category,
    boardType,
    materialThickness: thickness,
    profilePlane: plane,
    thicknessAxis: axis,
    stock: { kind, thickness },
    ...box,
    profileVector: profileVector ? profileVector.map((p) => ({ ...p })) : void 0
  };
}
function v12Profile(s, slots, id) {
  const shift = (localKey) => ex(
    { y: ref(localKey), o: ref("tall.stileY0") },
    (t) => t.y + t.o,
    `${localKey.slice("tall.v12.".length)} + stileY0`
  );
  const front = shift("tall.v12.front");
  const rear = shift("tall.v12.rear");
  const step = shift("tall.v12.step");
  const slotY = shift("tall.v12.slot");
  const zero = lit(0);
  const CH = link("tall.CH");
  const topStyle1 = s.topSys.style === "style_1";
  const botStyle1 = s.botSys.style === "style_1";
  const pairs = botStyle1 ? [[front, zero], [rear, zero]] : [[rear, zero]];
  for (const sl of slots) {
    const z0 = link(`tall.slot.${sl.boundaryId}.z0`);
    const z1 = link(`tall.slot.${sl.boundaryId}.z1`);
    pairs.push([rear, z0], [slotY, z0], [slotY, z1], [rear, z1]);
  }
  pairs.push([rear, CH]);
  if (topStyle1) {
    dim(`${id}.topRail`, { CH: ref("tall.CH"), railH: ref("tall.topRailH"), ins: ref("tall.insertT") }, (t) => Math.round((t.CH - (t.railH - t.ins)) * 1e3) / 1e3, { formula: "CH - (railH - insertT)" });
    dim(`${id}.topBelow`, { rail: ref(`${id}.topRail`), ins: ref("tall.insertT") }, (t) => Math.round((t.rail - t.ins) * 1e3) / 1e3, { formula: "topRail - insertT" });
    const topRail = link(`${id}.topRail`);
    const below = link(`${id}.topBelow`);
    pairs.push([front, CH], [front, topRail], [step, topRail], [step, below], [zero, below]);
  } else {
    const notchD = shift("tall.v12.notchD");
    const notchZ = ex({ CH: ref("tall.CH"), t: ref("tall.notchT") }, (t) => Math.round((t.CH - t.t) * 1e3) / 1e3, "CH - notchT");
    pairs.push([notchD, CH], [notchD, notchZ], [zero, notchZ]);
  }
  if (botStyle1) {
    const botRail = link("tall.botRailH");
    const below = ex({ rail: ref("tall.botRailH"), ins: ref("tall.insertT") }, (t) => Math.round((t.rail - t.ins) * 1e3) / 1e3, "botRail - insertT");
    pairs.push([zero, botRail], [step, botRail], [step, below], [front, below], [front, zero]);
  } else {
    const notchD = shift("tall.v12.notchD");
    const notchT = link("tall.notchT");
    pairs.push([zero, notchT], [notchD, notchT], [notchD, zero], [rear, zero]);
  }
  return yzTrace(id, pairs);
}
function v34Profile(s, slots, warnings, id) {
  const CH = link("tall.CH");
  const rear = link("tall.v34.rear");
  const off = link("tall.v34.yOff");
  const yAt = (local, name) => {
    dim(`${id}.ly.${name}`, local.terms, local.fn, { formula: local.formula });
    return ex({ y: ref(`${id}.ly.${name}`), off: ref("tall.v34.yOff") }, (t) => Math.round((t.y + t.off) * 1e3) / 1e3, `${local.formula ?? name} + yOff`);
  };
  const slotY = yAt(ex({ y: RULES.V34_ZI_SLOT_INNER }, (t) => t.y, "V34_ZI_SLOT_INNER"), "slot");
  const yRear = yAt(rear, "rear");
  const yZero = off;
  dim(`${id}.ni`, {
    rear: ref("tall.v34.rear"),
    span: RULES.V34_Y_REAR,
    inner: RULES.V34_TOP_NOTCH_INNER_Y
  }, (t) => Math.max(0, t.rear - (t.span - t.inner)), { formula: "max(0, rear - (V34_Y_REAR - notchInner))" });
  dim(`${id}.nf`, {
    ni: ref(`${id}.ni`),
    rear: ref("tall.v34.rear"),
    span: RULES.V34_Y_REAR,
    front: RULES.V34_TOP_NOTCH_FRONT_Y
  }, (t) => Math.max(0, Math.min(t.ni, t.rear - (t.span - t.front))), { formula: "max(0, min(ni, rear - (V34_Y_REAR - notchFront)))" });
  const yNi = yAt(link(`${id}.ni`), "ni");
  const yNf = yAt(link(`${id}.nf`), "nf");
  const zNotch = ex({ CH: ref("tall.CH"), nh: RULES.V34_NOTCH_HEIGHT }, (t) => Math.round((t.CH - t.nh) * 1e3) / 1e3, "CH - notchH");
  const zThick = ex({ CH: ref("tall.CH"), nt: RULES.V34_END_NOTCH_THICKNESS }, (t) => Math.round((t.CH - t.nt) * 1e3) / 1e3, "CH - notchT");
  const kept = slots.filter((sl) => {
    const ok = sl.z0 < s.CH - RULES.V34_NOTCH_HEIGHT.value && sl.z1 > 0;
    if (!ok) warnings.push(`Zi slot at z [${r2(sl.z0)}, ${r2(sl.z1)}] intersects avoidance/edge on V3/V4; slot omitted.`);
    return ok;
  }).sort((a, b) => b.z1 - a.z1);
  const pairs = [];
  const ah = s.avoid.enabled && s.avoid.height > 0 && s.avoid.depth > 0 ? s.avoid.height : 0;
  if (ah > 0 && s.avoid.depth <= 150) {
    const yPartial = yAt(ex({ y: RULES.V_AVOIDANCE_PARTIAL_FRONT_Y }, (t) => t.y, "V_AVOIDANCE_PARTIAL_FRONT_Y"), "partial");
    const zAh = ex({ h: ah }, (t) => t.h, "avoidH");
    pairs.push([yZero, lit(0)], [yPartial, lit(0)], [yPartial, zAh], [yRear, zAh]);
  } else if (ah > 0) {
    const zAh = ex({ h: ah }, (t) => t.h, "avoidH");
    pairs.push([yZero, zAh], [yRear, zAh]);
  } else {
    pairs.push([yZero, lit(0)], [yRear, lit(0)]);
  }
  const zStart = pairs[0][1];
  pairs.push([yRear, zNotch], [yNi, zNotch], [yNi, zThick], [yNf, zThick], [yNf, CH], [yZero, CH]);
  for (const sl of kept) {
    const z0 = link(`tall.slot.${sl.boundaryId}.z0`);
    const z1 = link(`tall.slot.${sl.boundaryId}.z1`);
    pairs.push([yZero, z1], [slotY, z1], [slotY, z0], [yZero, z0]);
  }
  pairs.push([yZero, zStart]);
  return yzTrace(id, pairs);
}
function xOf(id, name, local) {
  dim(`${id}.lx.${name}`, local.terms, local.fn, { formula: local.formula });
  return ex({ x: ref(`${id}.lx.${name}`), dx: ref("tall.leftT") }, (t) => Math.round((t.x + t.dx) * 1e3) / 1e3, `${local.formula ?? name} + leftSide`);
}
function fullZiProfile(id, yCap) {
  const capY = (e, name) => {
    if (yCap == null) return e;
    dim(`${id}.yc.${name}`, e.terms, e.fn, { formula: e.formula });
    return ex({ y: ref(`${id}.yc.${name}`), cap: yCap }, (t) => Math.min(t.y, t.cap), `min(${e.formula ?? name}, avoidShort)`);
  };
  const cpt = ex({ CPT: ref("tall.CPT") }, (t) => t.CPT, "CPT");
  const zero = lit(0);
  const mw = link("tall.mw");
  const md = link("tall.md");
  const nd = ex({ d: RULES.ZI_FULL_FRONT_REAR_NOTCH_DEPTH }, (t) => t.d, "ZI_FULL_FRONT_REAR_NOTCH_DEPTH");
  const back = ex({ md: ref("tall.md"), d: RULES.ZI_FULL_FRONT_REAR_NOTCH_DEPTH }, (t) => Math.round((t.md - t.d) * 1e3) / 1e3, "midDepth - notch");
  const xCpt = xOf(id, "cpt", cpt);
  const x0 = xOf(id, "0", zero);
  const xMw = xOf(id, "mw", mw);
  const xMwC = xOf(id, "mwC", ex({ mw: ref("tall.mw"), CPT: ref("tall.CPT") }, (t) => t.mw - t.CPT, "midWidth - CPT"));
  const y0 = capY(lit(0), "0");
  const yNd = capY(nd, "nd");
  const yBack = capY(back, "back");
  const yMd = capY(md, "md");
  return xyTrace(id, [
    [xCpt, y0],
    [xCpt, yNd],
    [x0, yNd],
    [x0, yBack],
    [xCpt, yBack],
    [xCpt, yMd],
    [xMwC, yMd],
    [xMwC, yBack],
    [xMw, yBack],
    [xMw, yNd],
    [xMwC, yNd],
    [xMwC, y0],
    [xCpt, y0]
  ]);
}
function halfZiProfile(id) {
  const cpt = ex({ CPT: ref("tall.CPT") }, (t) => t.CPT, "CPT");
  const zero = lit(0);
  const nd = ex({ d: RULES.ZI_HALF_FRONT_NOTCH_DEPTH }, (t) => t.d, "ZI_HALF_FRONT_NOTCH_DEPTH");
  const dep = ex({ d: RULES.ZI_HALF_DEPTH }, (t) => t.d, "ZI_HALF_DEPTH");
  const x0 = xOf(id, "0", zero);
  const xCpt = xOf(id, "cpt", cpt);
  const xMw = xOf(id, "mw", link("tall.mw"));
  const xMwC = xOf(id, "mwC", ex({ mw: ref("tall.mw"), CPT: ref("tall.CPT") }, (t) => t.mw - t.CPT, "midWidth - CPT"));
  return xyTrace(id, [
    [x0, lit(0)],
    [x0, nd],
    [xCpt, nd],
    [xCpt, dep],
    [xMwC, dep],
    [xMwC, nd],
    [xMw, nd],
    [xMw, lit(0)],
    [x0, lit(0)]
  ]);
}
function insertProfile(id) {
  const dx = link("tall.leftT");
  const notch = ex({ n: RULES.STYLE_1_INSERT_FRONT_NOTCH_DEPTH }, (t) => t.n, "STYLE_1_INSERT_FRONT_NOTCH_DEPTH");
  const depth = ex({ d: RULES.STYLE_1_INSERT_BOARD_DEPTH }, (t) => t.d, "STYLE_1_INSERT_BOARD_DEPTH");
  const xIn = ex({ dx: ref("tall.leftT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.dx + t.CPT) * 1e3) / 1e3, "left + CPT");
  const xOut = ex({ dx: ref("tall.leftT"), mw: ref("tall.mw"), CPT: ref("tall.CPT") }, (t) => Math.round((t.dx + t.mw - t.CPT) * 1e3) / 1e3, "left + midWidth - CPT");
  const xEnd = ex({ dx: ref("tall.leftT"), mw: ref("tall.mw") }, (t) => Math.round((t.dx + t.mw) * 1e3) / 1e3, "left + midWidth");
  return xyTrace(id, [
    [dx, lit(0)],
    [dx, notch],
    [xIn, notch],
    [xIn, depth],
    [xOut, depth],
    [xOut, notch],
    [xEnd, notch],
    [xEnd, lit(0)]
  ]);
}
function stampTallBoards(s, boards) {
  dim("tall.topFront", { h: s.topSys.frontRail }, (t) => t.h, { formula: "frontRail" });
  dim("tall.botFront", { h: s.botSys.frontRail }, (t) => t.h, { formula: "frontRail" });
  const zero = lit(0);
  const ch = link("tall.CH");
  const dx = link("tall.leftT");
  const xEnd = ex({ x: ref("tall.leftT"), mw: ref("tall.mw") }, (t) => Math.round((t.x + t.mw) * 1e3) / 1e3, "left + midWidth");
  const xL1 = ex({ L: ref("tall.leftT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.L + t.CPT) * 1e3) / 1e3, "left + CPT");
  const xR1 = ex({ CW: ref("tall.CW"), R: ref("tall.rightT") }, (t) => Math.round((t.CW - t.R) * 1e3) / 1e3, "CW - right");
  const xR0 = ex({ CW: ref("tall.CW"), R: ref("tall.rightT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.CW - t.R - t.CPT) * 1e3) / 1e3, "CW - right - CPT");
  const yRear1 = ex({ y: ref("tall.v34.yOff"), r: ref("tall.v34.rear") }, (t) => Math.round((t.y + t.r) * 1e3) / 1e3, "yOff + rear");
  const negF = ex({ F: ref("tall.FPT") }, (t) => -t.F, "-FPT");
  const md = link("tall.md");
  const sideY1 = ex({ F: ref("tall.FPT"), md: ref("tall.md") }, (t) => Math.round((t.F + t.md) * 1e3) / 1e3, "FPT + midDepth");
  const hTop0 = ex({ CH: ref("tall.CH"), h: RULES.H_SUPPORT_HEIGHT }, (t) => Math.round((t.CH - t.h) * 1e3) / 1e3, "CH - H_SUPPORT_HEIGHT");
  const hHi = ex({ h: RULES.H_SUPPORT_HEIGHT }, (t) => t.h, "H_SUPPORT_HEIGHT");
  const hX1 = ex({ x: ref("tall.leftT"), t: RULES.H_SUPPORT_THICKNESS }, (t) => Math.round((t.x + t.t) * 1e3) / 1e3, "left + H thickness");
  const hX0 = ex({ x: ref("tall.leftT"), mw: ref("tall.mw"), t: RULES.H_SUPPORT_THICKNESS }, (t) => Math.round((t.x + t.mw - t.t) * 1e3) / 1e3, "left + midWidth - H thickness");
  const t1z0 = ex({ CH: ref("tall.CH"), h: ref("tall.topFront") }, (t) => Math.round((t.CH - t.h) * 1e3) / 1e3, "CH - frontRail");
  const t3z0 = ex({ CH: ref("tall.CH"), h: ref("tall.topRailH") }, (t) => Math.round((t.CH - t.h) * 1e3) / 1e3, "CH - topRailH");
  const insY = ex({ d: RULES.STYLE_1_INSERT_BOARD_DEPTH }, (t) => t.d, "STYLE_1_INSERT_BOARD_DEPTH");
  const t5z0 = ex({ CH: ref("tall.CH"), h: RULES.T5_REAR_VERTICAL_HEIGHT }, (t) => Math.round((t.CH - t.h) * 1e3) / 1e3, "CH - T5 height");
  const t4y0 = ex({ y: ref("tall.t5Front"), d: RULES.T4_REAR_HORIZONTAL_DEPTH }, (t) => Math.round((t.y - t.d) * 1e3) / 1e3, "T5 front - T4 depth");
  const t4z0 = ex({ CH: ref("tall.CH"), t: RULES.STYLE_1_FIRST_RAIL_THICKNESS }, (t) => Math.round((t.CH - t.t) * 1e3) / 1e3, "CH - rail thickness");
  const t4z1 = ex({ CH: ref("tall.CH"), inset: RULES.T45_WALL_INSET }, (t) => Math.round((t.CH - t.inset) * 1e3) / 1e3, "CH - wall inset");
  const h34y0 = ex({ md: ref("tall.md"), d: RULES.H34_DEPTH }, (t) => Math.round((t.md - t.d) * 1e3) / 1e3, "midDepth - H34 depth");
  dim("tall.fc", { fc: s.fc }, (t) => t.fc, { formula: "frontClearance" });
  dim("tall.leaf.x0", { L: ref("tall.leftT"), fc: ref("tall.fc") }, (t) => Math.round((t.L + t.fc) * 1e3) / 1e3, { formula: "left + clearance" });
  dim("tall.leaf.x1", { CW: ref("tall.CW"), R: ref("tall.rightT"), fc: ref("tall.fc") }, (t) => Math.round((t.CW - t.R - t.fc) * 1e3) / 1e3, { formula: "CW - right - clearance" });
  dim("tall.leaf.midL", { x0: ref("tall.leaf.x0"), x1: ref("tall.leaf.x1"), fc: ref("tall.fc") }, (t) => Math.round(((t.x0 + t.x1) / 2 - t.fc / 2) * 1e3) / 1e3, { formula: "mid - clearance / 2" });
  dim("tall.leaf.midR", { x0: ref("tall.leaf.x0"), x1: ref("tall.leaf.x1"), fc: ref("tall.fc") }, (t) => Math.round(((t.x0 + t.x1) / 2 + t.fc / 2) * 1e3) / 1e3, { formula: "mid + clearance / 2" });
  for (const b of boards) {
    const put = (face, e) => {
      if (Math.abs(evalExpr(e) - b[face]) > 0.05) return;
      dim(`${b.id}.${face}`, e.terms, e.fn, { formula: e.formula });
    };
    const id = b.id;
    if (id === "V1" || id === "V3") {
      put("x0", dx);
      put("x1", xL1);
    }
    if (id === "V2" || id === "V4") {
      put("x0", xR0);
      put("x1", xR1);
    }
    if (id === "V1" || id === "V2") {
      put("y0", link("tall.stileY0"));
      put("y1", link("tall.v12Rear"));
      put("z0", zero);
      put("z1", ch);
    }
    if (id === "V3" || id === "V4") {
      put("y0", link("tall.v34.yOff"));
      put("y1", yRear1);
      put("z0", zero);
      put("z1", ch);
    }
    if (id === "V5") {
      const onLeft = s.exteriorSide !== "left";
      put("x0", onLeft ? xL1 : ex({ x: ref("tall.CW"), R: ref("tall.rightT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.x - t.R - 2 * t.CPT) * 1e3) / 1e3, "CW - right - 2 CPT"));
      put("x1", onLeft ? ex({ L: ref("tall.leftT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.L + 2 * t.CPT) * 1e3) / 1e3, "left + 2 CPT") : ex({ CW: ref("tall.CW"), R: ref("tall.rightT"), CPT: ref("tall.CPT") }, (t) => Math.round((t.CW - t.R - t.CPT) * 1e3) / 1e3, "CW - right - CPT"));
      put("y0", link("tall.FPT"));
      put("y1", sideY1);
      put("z0", ex({ z: b.z0 }, (t) => t.z, "fridgeZ0"));
      put("z1", ex({ z: b.z1 }, (t) => t.z, "fridgeZ1"));
      if (Number.isFinite(valueOf("tall.th1.z0"))) {
        put("y0", link("tall.stileY0"));
        put("y1", link("tall.v12Rear"));
        put("z1", link("tall.th1.z0"));
      }
    }
    if (/^(T[1-5]|B[1-3]|TH1|BH1)$/.test(id) || id.startsWith("Zi_")) {
      put("x0", dx);
      put("x1", xEnd);
    }
    if (id === "T1" || id === "T2") {
      put("z0", t1z0);
      put("z1", ch);
    }
    if (id === "T1" || id === "B1") {
      put("y0", link("tall.railY0"));
      put("y1", link("tall.t1Rear"));
    }
    if (id === "T2" || id === "B2") {
      put("y0", link("tall.t1Rear"));
      put("y1", link("tall.railRear"));
    }
    if (id === "B1" || id === "B2") {
      put("z0", zero);
      put("z1", link("tall.botFront"));
    }
    if (id === "T3") {
      put("y0", zero);
      put("y1", insY);
      put("z0", t3z0);
      put("z1", t1z0);
      put("z0", ex({ CH: ref("tall.CH"), h: ref("tall.topFront"), CPT: ref("tall.CPT") }, (t) => Math.round((t.CH - t.h - t.CPT) * 1e3) / 1e3, "CH - frontRail - CPT"));
    }
    if (id === "B3") {
      put("y0", zero);
      put("y1", insY);
      put("z0", link("tall.botFront"));
      put("z1", link("tall.botRailH"));
      put("z1", ex({ h: ref("tall.botFront"), CPT: ref("tall.CPT") }, (t) => Math.round((t.h + t.CPT) * 1e3) / 1e3, "frontRail + CPT"));
    }
    if (id === "T5") {
      put("y0", link("tall.t5Front"));
      put("y1", link("tall.t5Rear"));
      put("z0", t5z0);
      put("z1", ch);
    }
    if (id === "T4") {
      put("y0", t4y0);
      put("y1", link("tall.t5Front"));
      put("z0", t4z0);
      put("z1", t4z1);
    }
    if (id.startsWith("Zi_")) {
      put("y0", zero);
      put("y1", md);
      put("z0", ex({ z: b.z0 }, (t) => t.z, "boundaryZ0"));
      put("z1", ex({ z: b.z1 }, (t) => t.z, "boundaryZ1"));
    }
    if (id.startsWith("H13")) {
      put("x0", dx);
      put("x1", hX1);
      put("y0", link("tall.hY0"));
      put("y1", link("tall.hY1"));
    }
    if (id.startsWith("H24")) {
      put("x0", hX0);
      put("x1", xEnd);
      put("y0", link("tall.hY0"));
      put("y1", link("tall.hY1"));
    }
    if (id.startsWith("H34")) {
      put("x0", hX1);
      put("x1", hX0);
      put("x0", xL1);
      put("x1", xR0);
      if (Number.isFinite(valueOf("V5.x1"))) put("x0", link("V5.x1"));
      if (Number.isFinite(valueOf("V5.x0"))) put("x1", link("V5.x0"));
      put("y0", h34y0);
      put("y1", md);
    }
    if (id.startsWith("H12")) {
      put("x0", xL1);
      put("x1", xR0);
      put("y0", zero);
      put("y1", ex({ d: RULES.H12_DEPTH }, (t) => t.d, "H12_DEPTH"));
    }
    if (/_mid$/.test(id) && id.startsWith("H")) {
      if (Number.isFinite(valueOf("tall.hMid.z0"))) {
        put("z0", link("tall.hMid.z0"));
        put("z1", link("tall.hMid.z1"));
      } else {
        put("z0", ex({ CH: ref("tall.CH"), h: RULES.H_SUPPORT_HEIGHT }, (t) => Math.round((t.CH / 2 - t.h / 2) * 1e3) / 1e3, "CH / 2 - H / 2"));
        put("z1", ex({ CH: ref("tall.CH"), h: RULES.H_SUPPORT_HEIGHT }, (t) => Math.round((t.CH / 2 + t.h / 2) * 1e3) / 1e3, "CH / 2 + H / 2"));
      }
    }
    if (id.startsWith("VD_")) {
      put("x0", ex({ x: ref("tall.leftT"), mw: ref("tall.mw"), t: param({ divider: s.dividerT }).divider }, (t) => Math.round((t.x + t.mw / 2 - t.t / 2) * 1e3) / 1e3, "centre - divider / 2"));
      put("x1", ex({ x: ref("tall.leftT"), mw: ref("tall.mw"), t: param({ divider: s.dividerT }).divider }, (t) => Math.round((t.x + t.mw / 2 + t.t / 2) * 1e3) / 1e3, "centre + divider / 2"));
      put("y0", zero);
      put("y1", md);
      put("z0", ex({ z: b.z0 }, (t) => t.z, "zoneZ0"));
      put("z1", ex({ z: b.z1 }, (t) => t.z, "zoneZ1"));
    }
    if (id.startsWith("FP_")) {
      if (id.endsWith("_L")) {
        put("x0", link("tall.leaf.x0"));
        put("x1", link("tall.leaf.midL"));
      } else if (id.endsWith("_R")) {
        put("x0", link("tall.leaf.midR"));
        put("x1", link("tall.leaf.x1"));
      } else {
        put("x0", link("tall.leaf.x0"));
        put("x1", link("tall.leaf.x1"));
      }
      put("y0", negF);
      put("y1", zero);
      put("z0", ex({ z: b.z0 }, (t) => t.z, "leafZ0"));
      put("z1", ex({ z: b.z1 }, (t) => t.z, "leafZ1"));
    }
    if (/_top$/.test(id) && id.startsWith("H")) {
      put("z0", hTop0);
      put("z1", ch);
    }
    if (/_bottom$/.test(id) && id.startsWith("H")) {
      put("z0", zero);
      put("z1", hHi);
    }
    if (id.startsWith("FP_") || id.endsWith("FixedFrontPanel")) {
      put("y0", negF);
      put("y1", zero);
    }
    if (id === "TopStyle2FixedFrontPanel" && Number.isFinite(valueOf("tall.th1.z0"))) {
      put("x0", xL1);
      put("x1", xR0);
      if (Number.isFinite(valueOf("V5.x1"))) {
        put("x0", link("V5.x1"));
        put("x1", link("V5.x0"));
      }
      put("y0", zero);
      put("y1", link("tall.FPT"));
      put("z0", t1z0);
      put("z1", link("tall.th1.z0"));
    }
    if (id === "TH1" && Number.isFinite(valueOf("tall.th1.z0"))) put("z0", link("tall.th1.z0"));
    if (id.startsWith("SidePanel_")) {
      put("y0", negF);
      put("y1", md);
      put("z0", zero);
      put("z1", ch);
    }
    if (id.startsWith("SidePanel_L")) {
      put("x0", zero);
      put("x1", link("tall.leftT"));
    }
    if (id.startsWith("SidePanel_R")) {
      put("x1", link("tall.CW"));
      put("x0", ex({ CW: ref("tall.CW"), R: ref("tall.rightT") }, (t) => Math.round((t.CW - t.R) * 1e3) / 1e3, "CW - right"));
    }
    if (id === "avoidance_horizontal" || id === "Avoidance_Vertical") {
      put("x0", dx);
      put("x1", xEnd);
    }
    if (s.avoid.enabled) {
      const avoidH = ex({ h: s.avoid.height }, (t) => t.h, "avoidH");
      const avoidZ0 = ex({ h: s.avoid.height, t: RULES.AVOIDANCE_SUPPORT_THICKNESS }, (t) => Math.round((t.h - t.t) * 1e3) / 1e3, "avoidH - support");
      if (id === "avoidance_horizontal") {
        put("z0", avoidZ0);
        put("z1", avoidH);
      }
      if (id === "Avoidance_Vertical") {
        put("y0", link("tall.avoidY0"));
        put("y1", ex({ y: ref("tall.avoidY0"), t: RULES.AVOIDANCE_SUPPORT_THICKNESS }, (t) => Math.round((t.y + t.t) * 1e3) / 1e3, "avoidY0 + support"));
        put("z0", zero);
        put("z1", avoidZ0);
      }
    }
    if (id.endsWith("_fridge") && Number.isFinite(valueOf("tall.hFridge.z0"))) {
      put("z0", link("tall.hFridge.z0"));
      put("z1", link("tall.hFridge.z1"));
    }
    if (id.startsWith("VD_") || id.startsWith("DS_")) {
      put("y0", zero);
      put("y1", md);
    }
  }
}
function generateGeneralTall(input, options = {}) {
  beginProvenance();
  const errors = [];
  const warnings = [];
  const fridgeNotes = [];
  const prepared = applyFridgePrep(input, fridgeNotes);
  const s = normalize(prepared, errors);
  warnings.push(...fridgeNotes);
  const P = param({ CH: s.CH, CW: s.CW, CD: s.CD, CPT: s.CPT, FPT: s.FPT });
  dim("tall.CH", { CH: P.CH }, (t) => t.CH, { formula: "CH" });
  dim("tall.CPT", { CPT: P.CPT }, (t) => t.CPT, { formula: "CPT" });
  dim("tall.FPT", { FPT: P.FPT }, (t) => t.FPT, { formula: "FPT" });
  dim("tall.leftT", { t: param({ leftSide: s.leftT }).leftSide }, (t) => t.t, { formula: "leftSide" });
  dim("tall.rightT", { t: param({ rightSide: s.rightT }).rightSide }, (t) => t.t, { formula: "rightSide" });
  const cutOutW = Number(prepared.zones.find((z) => z.type === "fridge")?.applianceWidthMm);
  if (prepared.syncCabinetWidthFromFridge !== false && cutOutW > 0) {
    dim("tall.CW", {
      cutOut: param({ fridgeCutOutWidth: cutOutW }).fridgeCutOutWidth,
      L: ref("tall.leftT"),
      R: ref("tall.rightT"),
      CPT: ref("tall.CPT")
    }, (t) => fridgeCabinetWidth(t.cutOut, t.L + t.R, t.CPT), { formula: `fridge cut-out + sides + ${FRIDGE_STILES} CPT` });
  } else {
    dim("tall.CW", { CW: P.CW }, (t) => t.CW, { formula: "CW" });
  }
  dim("tall.mw", { CW: ref("tall.CW"), L: ref("tall.leftT"), R: ref("tall.rightT") }, (t) => Math.round((t.CW - t.L - t.R) * 1e3) / 1e3, { formula: "CW - sides" });
  dim("tall.midDepth", { CD: P.CD, FPT: P.FPT }, (t) => t.CD - t.FPT);
  dim("tall.md", { CD: P.CD, FPT: P.FPT }, (t) => Math.round((t.CD - t.FPT) * 1e3) / 1e3, { formula: "CD - FPT" });
  const stileY0 = dim("tall.stileY0", { FPT: P.FPT }, () => 0);
  dim("tall.v12.front", { y: RULES.V12_Y_FRONT_FACE }, (t) => t.y, { formula: "V12_Y_FRONT_FACE" });
  dim("tall.v12.rear", { y: RULES.V12_Y_REAR }, (t) => t.y, { formula: "V12_Y_REAR" });
  dim("tall.v12.step", { y: RULES.V12_Y_STEP_INNER }, (t) => t.y, { formula: "V12_Y_STEP_INNER" });
  dim("tall.v12.slot", { y: RULES.V12_ZI_SLOT_INNER }, (t) => t.y, { formula: "V12_ZI_SLOT_INNER" });
  dim("tall.v12.notchD", { d: RULES.STYLE_2_END_NOTCH_DEPTH }, (t) => t.d, { formula: "STYLE_2_END_NOTCH_DEPTH" });
  dim("tall.notchT", { t: RULES.V34_END_NOTCH_THICKNESS }, (t) => t.t, { formula: "V34_END_NOTCH_THICKNESS" });
  dim("tall.insertT", { t: RULES.STYLE_1_INSERT_SLOT_THICKNESS }, (t) => t.t, { formula: "STYLE_1_INSERT_SLOT_THICKNESS" });
  dim("tall.topRailH", { h: s.topSys.railH }, (t) => t.h, { formula: "topRailH" });
  dim("tall.botRailH", { h: s.botSys.railH }, (t) => t.h, { formula: "botRailH" });
  dim("tall.ziT", { t: param({ ziThickness: s.ziT }).ziThickness }, (t) => t.t, { formula: "ziThickness" });
  const v12Rear = dim("tall.v12Rear", { y0: ref("tall.stileY0"), rear: RULES.V12_Y_REAR }, (t) => t.y0 + t.rear);
  const railRear = dim("tall.railRear", { face: RULES.V12_Y_FRONT_FACE }, (t) => t.face);
  const railY0 = dim("tall.railY0", {
    rear: ref("tall.railRear"),
    t1: RULES.STYLE_1_FIRST_RAIL_THICKNESS,
    t2: RULES.STYLE_1_SECOND_RAIL_THICKNESS
  }, (t) => t.rear - t.t1 - t.t2);
  const t1Rear = dim("tall.t1Rear", { y0: ref("tall.railY0"), t1: RULES.STYLE_1_FIRST_RAIL_THICKNESS }, (t) => t.y0 + t.t1);
  const t5Rear = dim("tall.t5Rear", { md: ref("tall.midDepth"), inset: RULES.T45_WALL_INSET }, (t) => t.md - t.inset);
  const t5Front = dim("tall.t5Front", { rear: ref("tall.t5Rear"), t: RULES.T45_THICKNESS }, (t) => t.rear - t.t);
  const hY0 = dim("tall.hY0", { y: RULES.H_SUPPORT_SIDE_DEPTH_START }, (t) => t.y);
  const hY1 = dim("tall.hY1", { md: ref("tall.midDepth"), clear: RULES.H_SUPPORT_SIDE_REAR_CLEARANCE }, (t) => t.md - t.clear);
  const boards = [];
  const ziSlots = [];
  const ziGrooves = [];
  const hinges = [];
  const locks = [];
  const { zones: zoneItems, boundaries, topSys, botSys } = computeStack(s, errors, warnings);
  const CH = s.CH, CD = s.CD, FPT = s.FPT, CPT = s.CPT, mw = s.midWidth, md = s.midDepth, dx = s.dx;
  let fridgeMode = "none";
  let fridgeGap = 0;
  let fridgeBaseBottomZ = 0;
  let fridgeOpening = null;
  const fridgeZoneItem = zoneItems.find((zi) => zi.zone.type === "fridge");
  if (fridgeZoneItem) {
    const below = boundaries.find((b) => b.id === `boundary-${fridgeZoneItem.zone.id}`);
    fridgeBaseBottomZ = below ? below.z0 : fridgeZoneItem.z0;
    const aw = Number(fridgeZoneItem.zone.applianceWidthMm);
    const adp = Number(fridgeZoneItem.zone.applianceDepthMm);
    fridgeOpening = r2(mw - FRIDGE_STILES * CPT);
    if (Number.isFinite(aw) && aw > fridgeOpening + 0.01) {
      errors.push(`Fridge cut-out ${aw} does not fit: the opening between the stiles is ${fridgeOpening} (${r2(aw - fridgeOpening)} short).`);
    }
    if (Number.isFinite(adp) && adp > md + 0.01) {
      warnings.push(`Fridge zone ${fridgeZoneItem.zone.id} applianceDepthMm=${adp} exceeds interior midDepth=${md}.`);
    }
    if (s.avoid.enabled) {
      fridgeGap = fridgeBaseBottomZ - s.avoid.height;
      if (fridgeBaseBottomZ < s.avoid.height + CPT) {
        errors.push(
          `Fridge base bottom Z (${fridgeBaseBottomZ}) must be >= Avoidance Height + panel thickness (${s.avoid.height}+${CPT}).`
        );
      } else if (fridgeGap < RULES.FRIDGE_RAISED_THRESHOLD.value) {
        fridgeMode = "raised";
        s.avoid.height = fridgeBaseBottomZ;
        warnings.push(
          `Fridge/avoidance gap ${fridgeGap.toFixed(1)} mm < 105 mm: raised avoidance mode and above-fridge HSet will be used.`
        );
      } else {
        fridgeMode = "normal";
        warnings.push(`Fridge/avoidance gap ${fridgeGap.toFixed(1)} mm >= 105 mm: normal avoidance height kept.`);
      }
    }
  }
  const fridgeIdx = fridgeZoneItem ? zoneItems.indexOf(fridgeZoneItem) : -1;
  const baseDrawer = fridgeIdx > 0 && zoneItems[fridgeIdx - 1].zone.type === "drawer" ? zoneItems[fridgeIdx - 1] : null;
  const fridgeFloor = baseDrawer ? boundaries.find((b) => b.id === `boundary-${fridgeZoneItem.zone.id}` && b.boundaryType === "full_zi") : void 0;
  const drawerBase = fridgeFloor ? boundaries.find((b) => b.id === `boundary-${baseDrawer.zone.id}` && b.boundaryType === "full_zi") : void 0;
  const v12Slots = boundaries.filter((b) => b.boundaryType === "full_zi" || b.boundaryType === "half_zi").map((b) => ({ z0: r2(b.centerZ - (s.ziT + RULES.ZI_SLOT_CLEARANCE.value) / 2), z1: r2(b.centerZ + (s.ziT + RULES.ZI_SLOT_CLEARANCE.value) / 2), boundaryId: b.id }));
  const v34Slots = boundaries.filter((b) => b.boundaryType === "full_zi" && b !== drawerBase).map((b) => ({ z0: r2(b.centerZ - (s.ziT + RULES.ZI_SLOT_CLEARANCE.value) / 2), z1: r2(b.centerZ + (s.ziT + RULES.ZI_SLOT_CLEARANCE.value) / 2), boundaryId: b.id }));
  for (const b of boundaries) {
    if (b.boundaryType !== "full_zi" && b.boundaryType !== "half_zi") continue;
    dim(`tall.slot.${b.id}.z0`, { cz: b.centerZ, zi: ref("tall.ziT"), clr: RULES.ZI_SLOT_CLEARANCE }, (t) => Math.round((t.cz - (t.zi + t.clr) / 2) * 1e3) / 1e3, { formula: "centerZ - (ziT + 1) / 2" });
    dim(`tall.slot.${b.id}.z1`, { cz: b.centerZ, zi: ref("tall.ziT"), clr: RULES.ZI_SLOT_CLEARANCE }, (t) => Math.round((t.cz + (t.zi + t.clr) / 2) * 1e3) / 1e3, { formula: "centerZ + (ziT + 1) / 2" });
  }
  const sideY0 = FPT;
  const sideY1 = r2(FPT + md);
  const vLeftX0 = s.leftT;
  const vLeftX1 = r2(s.leftT + CPT);
  const vRightX1 = r2(s.CW - s.rightT);
  const vRightX0 = r2(vRightX1 - CPT);
  const v12Y0 = stileY0;
  const v12Y1 = v12Rear;
  boards.push(mkBoard(
    "V1",
    "Front Stile Left",
    "vertical_structure",
    "V1",
    CPT,
    "carcass",
    "YZ",
    "X",
    vLeftX0,
    vLeftX1,
    v12Y0,
    v12Y1,
    0,
    CH,
    v12Profile(s, v12Slots, "V1")
  ));
  boards.push(mkBoard(
    "V2",
    "Front Stile Right",
    "vertical_structure",
    "V2",
    CPT,
    "carcass",
    "YZ",
    "X",
    vRightX0,
    vRightX1,
    v12Y0,
    v12Y1,
    0,
    CH,
    v12Profile(s, v12Slots, "V2")
  ));
  const v34Y1 = r2(stileY0 + md);
  let v34Y0 = r2(stileY0 + Math.max(0, md - RULES.V34_Y_REAR.value));
  if (v34Y0 < v12Y1) v34Y0 = v12Y1;
  const v34Depth = r2(Math.max(0, v34Y1 - v34Y0));
  const v34Rear = Math.min(RULES.V34_Y_REAR.value, v34Depth);
  dim("tall.v34.yOff", { y0: stileY0, md: ref("tall.md"), rear: RULES.V34_Y_REAR, stop: v12Y1 }, (t) => {
    let y = Math.round((t.y0 + Math.max(0, t.md - t.rear)) * 1e3) / 1e3;
    if (y < t.stop) y = t.stop;
    return y;
  }, { formula: "max(stile + max(0, midDepth - V34_Y_REAR), frontStileRear)" });
  dim("tall.v34.rear", { depth: v34Depth, rear: RULES.V34_Y_REAR }, (t) => Math.min(t.rear, t.depth), { formula: "min(V34_Y_REAR, depth)" });
  boards.push(mkBoard(
    "V3",
    "Rear Stile Left",
    "vertical_structure",
    "V3",
    CPT,
    "carcass",
    "YZ",
    "X",
    vLeftX0,
    vLeftX1,
    v34Y0,
    r2(v34Y0 + v34Rear),
    0,
    CH,
    v34Profile(s, v34Slots, warnings, "V3")
  ));
  boards.push(mkBoard(
    "V4",
    "Rear Stile Right",
    "vertical_structure",
    "V4",
    CPT,
    "carcass",
    "YZ",
    "X",
    vRightX0,
    vRightX1,
    v34Y0,
    r2(v34Y0 + v34Rear),
    0,
    CH,
    v34Profile(s, v34Slots, warnings, "V4")
  ));
  const topFridge = !!fridgeZoneItem && s.topSys.style === "style_2" && zoneItems[zoneItems.length - 1] === fridgeZoneItem;
  const th1Z0 = s.topSys.style === "style_2" ? dim(
    "tall.th1.z0",
    { CH: ref("tall.CH"), t: RULES.STYLE_2_FRONT_SYSTEM_THICKNESS, inset: RULES.STYLE_2_FRONT_SYSTEM_Z_INSET },
    (t) => Math.round((t.CH - t.t - t.inset) * 1e3) / 1e3,
    { formula: "CH - TH1 thickness - inset" }
  ) : NaN;
  if (fridgeZoneItem) {
    const v5OnLeft = s.exteriorSide !== "left";
    let v5x0, v5x1;
    if (v5OnLeft) {
      v5x0 = r2(s.leftT + CPT);
      v5x1 = r2(v5x0 + CPT);
    } else {
      v5x1 = r2(s.CW - s.rightT - CPT);
      v5x0 = r2(v5x1 - CPT);
    }
    const v5Z0 = ex({ z: fridgeZoneItem.z0 }, (t) => t.z, "fridgeZ0");
    const v5Front = topFridge ? link("tall.stileY0") : link("tall.FPT");
    const v5Rear = topFridge ? link("tall.v12Rear") : ex({ F: ref("tall.FPT"), md: ref("tall.md") }, (t) => Math.round((t.F + t.md) * 1e3) / 1e3, "FPT + midDepth");
    const v5Z1 = topFridge ? link("tall.th1.z0") : ex({ z: fridgeZoneItem.z1 }, (t) => t.z, "fridgeZ1");
    boards.push(mkBoard(
      "V5",
      "V5",
      "vertical_structure",
      "V5",
      CPT,
      "carcass",
      "YZ",
      "X",
      v5x0,
      v5x1,
      topFridge ? v12Y0 : sideY0,
      topFridge ? v12Y1 : sideY1,
      fridgeZoneItem.z0,
      topFridge ? th1Z0 : fridgeZoneItem.z1,
      yzTrace("V5", [[v5Front, v5Z0], [v5Rear, v5Z0], [v5Rear, v5Z1], [v5Front, v5Z1], [v5Front, v5Z0]])
    ));
    warnings.push(
      `Fridge zone ${fridgeZoneItem.zone.id}: V5 on ${v5OnLeft ? "left" : "right"} (exteriorSide=${s.exteriorSide}).`
    );
  }
  for (const sl of v12Slots) {
    ziSlots.push({ id: `zi_slot_V1_${sl.boundaryId}`, vPanelId: "V1", y0: r2(v12Y0 + RULES.V12_ZI_SLOT_INNER.value), y1: r2(v12Y0 + RULES.V12_Y_REAR.value), z0: sl.z0, z1: sl.z1, depth: RULES.ZI_SLOT_DEPTH.value, boundaryId: sl.boundaryId });
    ziSlots.push({ id: `zi_slot_V2_${sl.boundaryId}`, vPanelId: "V2", y0: r2(v12Y0 + RULES.V12_ZI_SLOT_INNER.value), y1: r2(v12Y0 + RULES.V12_Y_REAR.value), z0: sl.z0, z1: sl.z1, depth: RULES.ZI_SLOT_DEPTH.value, boundaryId: sl.boundaryId });
  }
  for (const sl of v34Slots) {
    ziSlots.push({
      id: `zi_slot_V3_${sl.boundaryId}`,
      vPanelId: "V3",
      y0: r2(v34Y0 + RULES.V34_Y_FRONT.value),
      y1: r2(v34Y0 + RULES.V34_ZI_SLOT_INNER.value),
      z0: sl.z0,
      z1: sl.z1,
      depth: RULES.ZI_SLOT_DEPTH.value,
      boundaryId: sl.boundaryId
    });
    ziSlots.push({
      id: `zi_slot_V4_${sl.boundaryId}`,
      vPanelId: "V4",
      y0: r2(v34Y0 + RULES.V34_Y_FRONT.value),
      y1: r2(v34Y0 + RULES.V34_ZI_SLOT_INNER.value),
      z0: sl.z0,
      z1: sl.z1,
      depth: RULES.ZI_SLOT_DEPTH.value,
      boundaryId: sl.boundaryId
    });
  }
  {
    const insDepth = RULES.STYLE_1_INSERT_BOARD_DEPTH.value;
    const t1H = RULES.STYLE_1_FIRST_RAIL_THICKNESS.value;
    const t2H = RULES.STYLE_1_SECOND_RAIL_THICKNESS.value;
    if (s.topSys.style === "style_1") {
      const topRail0 = r2(CH - s.topSys.frontRail);
      boards.push(mkBoard(
        "T1",
        "Top Front Rail",
        "top_system",
        "T1",
        t1H,
        "door",
        "XZ",
        "Y",
        dx,
        r2(dx + mw),
        railY0,
        t1Rear,
        topRail0,
        CH,
        void 0
      ));
      boards.push(mkBoard(
        "T2",
        "Top Second Rail",
        "top_system",
        "T2",
        t2H,
        "carcass",
        "XZ",
        "Y",
        dx,
        r2(dx + mw),
        t1Rear,
        railRear,
        topRail0,
        CH,
        void 0
      ));
      same("T1.y0", "tall.railY0");
      same("T1.y1", "tall.t1Rear");
      same("T2.y0", "tall.t1Rear");
      same("T2.y1", "tall.railRear");
      boards.push(mkBoard(
        "T3",
        "Top Insert Board",
        "top_system",
        "T3",
        CPT,
        "carcass",
        "XY",
        "Z",
        dx,
        r2(dx + mw),
        0,
        insDepth,
        r2(topRail0 - CPT),
        topRail0,
        insertProfile("T3")
      ));
    } else if (s.topSys.style === "style_2") {
      const sysH = s.topSys.frontRail;
      const th = RULES.STYLE_2_FRONT_SYSTEM_THICKNESS.value;
      const dep = RULES.STYLE_2_FRONT_SYSTEM_DEPTH.value;
      const inset = RULES.STYLE_2_FRONT_SYSTEM_Z_INSET.value;
      boards.push(mkBoard(
        "TH1",
        "Top Style 2 Front System Panel",
        "top_system",
        "TH1",
        th,
        "carcass",
        "XY",
        "Z",
        dx,
        r2(dx + mw),
        0,
        dep,
        th1Z0,
        r2(CH - inset),
        void 0
      ));
      if (topFridge) {
        const v5 = boards.find((b) => b.id === "V5");
        const v5Left = v5.x0 < dx + mw / 2;
        boards.push(mkBoard(
          "TopStyle2FixedFrontPanel",
          "Top Style 2 Fixed Front Panel",
          "top_system",
          "style2_fixed_front_panel",
          FPT,
          "door",
          "XZ",
          "Y",
          v5Left ? v5.x1 : vLeftX1,
          v5Left ? vRightX0 : v5.x0,
          0,
          FPT,
          r2(CH - sysH),
          th1Z0,
          void 0
        ));
      } else {
        boards.push(mkBoard(
          "TopStyle2FixedFrontPanel",
          "Top Style 2 Fixed Front Panel",
          "top_system",
          "style2_fixed_front_panel",
          FPT,
          "door",
          "XZ",
          "Y",
          r2(dx + s.sideClearance),
          r2(dx + mw - s.sideClearance),
          -FPT,
          0,
          r2(CH - sysH),
          CH,
          void 0
        ));
      }
    }
    if (s.botSys.style === "style_1") {
      const botRail1 = r2(s.botSys.frontRail);
      boards.push(mkBoard(
        "B1",
        "Bottom Front Rail",
        "bottom_system",
        "B1",
        t1H,
        "door",
        "XZ",
        "Y",
        dx,
        r2(dx + mw),
        railY0,
        t1Rear,
        0,
        botRail1,
        void 0
      ));
      boards.push(mkBoard(
        "B2",
        "Bottom Second Rail",
        "bottom_system",
        "B2",
        t2H,
        "carcass",
        "XZ",
        "Y",
        dx,
        r2(dx + mw),
        t1Rear,
        railRear,
        0,
        botRail1,
        void 0
      ));
      same("B1.y0", "tall.railY0");
      same("B1.y1", "tall.t1Rear");
      same("B2.y0", "tall.t1Rear");
      same("B2.y1", "tall.railRear");
      boards.push(mkBoard(
        "B3",
        "Bottom Insert Board",
        "bottom_system",
        "B3",
        CPT,
        "carcass",
        "XY",
        "Z",
        dx,
        r2(dx + mw),
        0,
        insDepth,
        botRail1,
        r2(botRail1 + CPT),
        insertProfile("B3")
      ));
    } else if (s.botSys.style === "style_2") {
      const sysH = s.botSys.frontRail;
      const th = RULES.STYLE_2_FRONT_SYSTEM_THICKNESS.value;
      const dep = RULES.STYLE_2_FRONT_SYSTEM_DEPTH.value;
      const inset = RULES.STYLE_2_FRONT_SYSTEM_Z_INSET.value;
      boards.push(mkBoard(
        "BH1",
        "Bottom Style 2 Front System Panel",
        "bottom_system",
        "BH1",
        th,
        "carcass",
        "XY",
        "Z",
        dx,
        r2(dx + mw),
        0,
        dep,
        inset,
        r2(inset + 15),
        void 0
      ));
      boards.push(mkBoard(
        "BottomStyle2FixedFrontPanel",
        "Bottom Style 2 Fixed Front Panel",
        "bottom_system",
        "style2_fixed_front_panel",
        FPT,
        "door",
        "XZ",
        "Y",
        r2(dx + s.sideClearance),
        r2(dx + mw - s.sideClearance),
        -FPT,
        0,
        0,
        sysH,
        void 0
      ));
    }
    const t45 = RULES.T45_THICKNESS.value;
    const rearY1 = t5Rear;
    const rearY0 = t5Front;
    boards.push(mkBoard(
      "T5",
      "T5 Rear Vertical Top Board",
      "top_system",
      "T5",
      t45,
      "carcass",
      "XZ",
      "Y",
      dx,
      r2(dx + mw),
      rearY0,
      rearY1,
      r2(CH - RULES.T5_REAR_VERTICAL_HEIGHT.value),
      CH,
      void 0
    ));
    boards.push(mkBoard(
      "T4",
      "T4 Rear Horizontal Top Board",
      "top_system",
      "T4",
      t45,
      "carcass",
      "XY",
      "Z",
      dx,
      r2(dx + mw),
      r2(rearY0 - RULES.T4_REAR_HORIZONTAL_DEPTH.value),
      rearY0,
      r2(CH - 16),
      r2(CH - RULES.T45_WALL_INSET.value),
      void 0
    ));
    same("T5.y0", "tall.t5Front");
    same("T5.y1", "tall.t5Rear");
    same("T4.y1", "tall.t5Front");
  }
  const avoidShortY = r2(md - s.avoid.depth);
  const isDividerSupportBoundary = (boundary) => {
    const upperId = boundary.id.replace(/^boundary-/, "");
    const upperIdx = s.zones.findIndex((z) => z.id === upperId);
    if (upperIdx < 0) return false;
    const hasDivider = (z) => z?.type === "double_door" && z.verticalDivider === true;
    return hasDivider(s.zones[upperIdx]) || hasDivider(s.zones[upperIdx - 1]);
  };
  for (const b of boundaries) {
    if (b.boundaryType === "none") continue;
    let type = b.boundaryType;
    let y1 = md;
    let prof;
    const hitsAvoid = s.avoid.enabled && s.avoid.depth > 0 && s.avoid.height > 0 && s.avoid.depth < md && b.z0 < s.avoid.height && b.z1 > 0 && !isDividerSupportBoundary(b);
    if (type === "half_zi") {
      y1 = md;
      prof = halfZiProfile(`Zi_${b.id}`);
    } else if (b === drawerBase) {
      type = "shortened_zi";
      y1 = r2(Math.min(md, RULES.FRIDGE_BASE_ZI_DEPTH.value));
      prof = fullZiProfile(`Zi_${b.id}`, y1);
    } else if (hitsAvoid) {
      type = "shortened_zi";
      y1 = avoidShortY;
      prof = fullZiProfile(`Zi_${b.id}`, y1);
    } else {
      prof = fullZiProfile(`Zi_${b.id}`, null);
    }
    boards.push(mkBoard(
      `Zi_${b.id}`,
      `Boundary ${b.id}`,
      "boundary_panel",
      type,
      s.ziT,
      "carcass",
      "XY",
      "Z",
      dx,
      r2(dx + mw),
      0,
      y1,
      b.z0,
      b.z1,
      prof
    ));
  }
  const hTop = [{ name: "H13_top", z0: r2(CH - RULES.H_SUPPORT_HEIGHT.value), z1: CH }, { name: "H24_top", z0: r2(CH - RULES.H_SUPPORT_HEIGHT.value), z1: CH }];
  const omitBottomForRaised = fridgeMode === "raised";
  const hBottom = omitBottomForRaised ? [] : [
    { name: "H13_bottom", z0: 0, z1: RULES.H_SUPPORT_HEIGHT.value },
    { name: "H24_bottom", z0: 0, z1: RULES.H_SUPPORT_HEIGHT.value },
    { name: "H34_bottom", z0: 0, z1: RULES.H_SUPPORT_HEIGHT.value }
  ];
  const Hspan = RULES.H_SUPPORT_HEIGHT.value;
  let hMid = [
    { name: "H13_mid", z0: r2(CH / 2 - Hspan / 2), z1: r2(CH / 2 + Hspan / 2) },
    { name: "H24_mid", z0: r2(CH / 2 - Hspan / 2), z1: r2(CH / 2 + Hspan / 2) },
    { name: "H34_mid", z0: r2(CH / 2 - Hspan / 2), z1: r2(CH / 2 + Hspan / 2) }
  ];
  const vdZone = [...zoneItems].reverse().find((zi) => zi.zone.type === "double_door" && zi.zone.verticalDivider === true);
  const vdShelf = vdZone ? boundaries.find((b) => b.id === `boundary-${vdZone.zone.id}` && (b.boundaryType === "full_zi" || b.boundaryType === "shortened_zi")) : void 0;
  if (vdShelf) {
    const above0 = r2(vdShelf.z1);
    dim("tall.hMid.z0", { z: vdShelf.z1 }, (t) => t.z, { formula: "divider top" });
    dim("tall.hMid.z1", { z0: ref("tall.hMid.z0"), h: RULES.H_SUPPORT_HEIGHT }, (t) => Math.round((t.z0 + t.h) * 1e3) / 1e3, { formula: "z0 + H height" });
    for (const h of hMid) {
      h.z0 = above0;
      h.z1 = r2(above0 + Hspan);
    }
  }
  const hZiConflicts = [];
  for (const zi of boundaries) {
    if (zi.boundaryType !== "full_zi" && zi.boundaryType !== "shortened_zi") {
      if (zi.boundaryType === "half_zi" && hMid.some((h) => h.z0 < zi.z1 && h.z1 > zi.z0)) {
        warnings.push(`H mid overlaps half Zi ${zi.id}; half Zi movement rule deferred.`);
      }
      continue;
    }
    if (vdShelf || !hMid.some((h) => h.z0 < zi.z1 && h.z1 > zi.z0)) continue;
    const H = RULES.H_SUPPORT_HEIGHT.value;
    for (const h of hMid) {
      if (!(h.z0 < zi.z1 && h.z1 > zi.z0)) continue;
      if (h.name === "H34_mid") {
        const nz0 = r2(zi.z1), nz1 = r2(zi.z1 + H);
        if (nz1 > CH) {
          hZiConflicts.push(`${h.name} movement above Zi would exceed cabinet bounds; movement skipped.`);
          continue;
        }
        h.z0 = nz0;
        h.z1 = nz1;
      } else {
        const nz1 = r2(zi.z0), nz0 = r2(zi.z0 - H);
        if (nz0 < 0) {
          hZiConflicts.push(`${h.name} movement below Zi would exceed cabinet bounds; movement skipped.`);
          continue;
        }
        h.z0 = nz0;
        h.z1 = nz1;
      }
      warnings.push(`H ${h.name} overlaps ${zi.boundaryType} ${zi.id}; Stage 2 movement evaluated.`);
    }
  }
  let hBottomZ0;
  let hBottomZ1;
  if (s.avoid.enabled && s.avoid.height > 0) {
    hBottomZ0 = dim("tall.hBottomZ0", { h: s.avoid.height }, (t) => t.h);
    hBottomZ1 = dim("tall.hBottomZ1", { z0: ref("tall.hBottomZ0"), H: RULES.H_SUPPORT_HEIGHT }, (t) => t.z0 + t.H);
    for (const h of hBottom) {
      h.z0 = hBottomZ0;
      h.z1 = hBottomZ1;
    }
  }
  for (const h of [...hTop, ...hBottom, ...hMid]) {
    if (h.name.startsWith("H13")) {
      boards.push(mkBoard(
        h.name,
        "H Bridge Left",
        "h_support",
        h.name,
        s.hT,
        "carcass",
        "YZ",
        "X",
        dx,
        r2(dx + RULES.H_SUPPORT_THICKNESS.value),
        hY0,
        hY1,
        h.z0,
        h.z1,
        void 0
      ));
      same(`${h.name}.y0`, "tall.hY0");
      same(`${h.name}.y1`, "tall.hY1");
    } else if (h.name.startsWith("H24")) {
      boards.push(mkBoard(
        h.name,
        "H Bridge Right",
        "h_support",
        h.name,
        s.hT,
        "carcass",
        "YZ",
        "X",
        r2(dx + mw - RULES.H_SUPPORT_THICKNESS.value),
        r2(dx + mw),
        hY0,
        hY1,
        h.z0,
        h.z1,
        void 0
      ));
      same(`${h.name}.y0`, "tall.hY0");
      same(`${h.name}.y1`, "tall.hY1");
    } else {
      let x0 = Math.max(r2(dx + RULES.H_SUPPORT_THICKNESS.value), vLeftX1);
      let x1 = Math.min(r2(dx + mw - RULES.H_SUPPORT_THICKNESS.value), vRightX0);
      const v5 = boards.find((board) => board.id === "V5");
      if (v5 && h.z0 < v5.z1 && h.z1 > v5.z0 && v5.y1 > md - RULES.H34_DEPTH.value) {
        if (v5.x0 < dx + mw / 2) x0 = r2(Math.max(x0, v5.x1));
        else x1 = r2(Math.min(x1, v5.x0));
      }
      boards.push(mkBoard(
        h.name,
        "H Bridge Rear",
        "h_support",
        h.name,
        s.hT,
        "carcass",
        "XZ",
        "Y",
        x0,
        x1,
        r2(md - RULES.H34_DEPTH.value),
        md,
        h.z0,
        h.z1,
        void 0
      ));
    }
    if (hBottomZ0 != null && h.name.endsWith("_bottom")) {
      same(`${h.name}.z0`, "tall.hBottomZ0");
      same(`${h.name}.z1`, "tall.hBottomZ1");
    }
  }
  if (fridgeMode === "raised" && fridgeZoneItem) {
    const below = boundaries.find((b) => b.id === `boundary-${fridgeZoneItem.zone.id}`);
    const hz0 = below ? below.z1 : fridgeZoneItem.z0;
    const hz1 = r2(hz0 + RULES.H_SUPPORT_HEIGHT.value);
    dim("tall.hFridge.z0", { z: hz0 }, (t) => t.z, { formula: "boundary above the fridge" });
    dim("tall.hFridge.z1", { z0: ref("tall.hFridge.z0"), h: RULES.H_SUPPORT_HEIGHT }, (t) => Math.round((t.z0 + t.h) * 1e3) / 1e3, { formula: "z0 + H height" });
    const hFridge = [
      { name: "H13_fridge", z0: hz0, z1: hz1 },
      { name: "H24_fridge", z0: hz0, z1: hz1 },
      { name: "H34_fridge", z0: hz0, z1: hz1 }
    ];
    for (const h of hFridge) {
      if (h.name.startsWith("H13")) {
        boards.push(mkBoard(
          h.name,
          "H13 fridge",
          "h_support",
          "H13_fridge",
          s.hT,
          "carcass",
          "YZ",
          "X",
          dx,
          r2(dx + RULES.H_SUPPORT_THICKNESS.value),
          hY0,
          hY1,
          h.z0,
          h.z1,
          void 0
        ));
        same(`${h.name}.y0`, "tall.hY0");
        same(`${h.name}.y1`, "tall.hY1");
      } else if (h.name.startsWith("H24")) {
        boards.push(mkBoard(
          h.name,
          "H24 fridge",
          "h_support",
          "H24_fridge",
          s.hT,
          "carcass",
          "YZ",
          "X",
          r2(dx + mw - RULES.H_SUPPORT_THICKNESS.value),
          r2(dx + mw),
          hY0,
          hY1,
          h.z0,
          h.z1,
          void 0
        ));
        same(`${h.name}.y0`, "tall.hY0");
        same(`${h.name}.y1`, "tall.hY1");
      } else {
        let x0 = Math.max(r2(dx + RULES.H_SUPPORT_THICKNESS.value), vLeftX1);
        let x1 = Math.min(r2(dx + mw - RULES.H_SUPPORT_THICKNESS.value), vRightX0);
        const v5 = boards.find((board) => board.id === "V5");
        if (v5 && h.z0 < v5.z1 && h.z1 > v5.z0 && v5.y1 > md - RULES.H34_DEPTH.value) {
          if (v5.x0 < dx + mw / 2) x0 = r2(Math.max(x0, v5.x1));
          else x1 = r2(Math.min(x1, v5.x0));
        }
        boards.push(mkBoard(
          h.name,
          "H34 fridge",
          "h_support",
          "H34_fridge",
          s.hT,
          "carcass",
          "XZ",
          "Y",
          x0,
          x1,
          r2(md - RULES.H34_DEPTH.value),
          md,
          h.z0,
          h.z1,
          void 0
        ));
      }
    }
  }
  if (baseDrawer && fridgeFloor) {
    const z0 = dim("tall.fridgeBase.z0", { z: baseDrawer.z0 }, (t) => t.z, { formula: "drawer zone bottom" });
    const zTop = evalExpr(link(`tall.slot.${fridgeFloor.id}.z0`));
    const floor = dim("tall.fridgeFloor.z0", { z: fridgeFloor.z0 }, (t) => t.z, { formula: "fridge floor underside" });
    const h34z0 = dim("tall.fridgeBase.h34z0", { z: ref("tall.fridgeFloor.z0"), h: RULES.H_SUPPORT_HEIGHT }, (t) => Math.round((t.z - t.h) * 1e3) / 1e3, { formula: "fridge floor - H height" });
    const railZ0 = dim("tall.fridgeBase.railZ0", { z: ref("tall.fridgeFloor.z0"), CPT: ref("tall.CPT") }, (t) => Math.round((t.z - t.CPT) * 1e3) / 1e3, { formula: "fridge floor - CPT" });
    const railY1 = dim("tall.fridgeBase.railY1", { d: RULES.FRIDGE_BASE_RAIL_DEPTH }, (t) => t.d, { formula: "FRIDGE_BASE_RAIL_DEPTH" });
    boards.push(mkBoard(
      "H13_fridgeBase",
      "H13 fridge base",
      "h_support",
      "H13_fridgeBase",
      s.hT,
      "carcass",
      "YZ",
      "X",
      dx,
      r2(dx + RULES.H_SUPPORT_THICKNESS.value),
      hY0,
      hY1,
      z0,
      zTop,
      void 0
    ));
    boards.push(mkBoard(
      "H24_fridgeBase",
      "H24 fridge base",
      "h_support",
      "H24_fridgeBase",
      s.hT,
      "carcass",
      "YZ",
      "X",
      r2(dx + mw - RULES.H_SUPPORT_THICKNESS.value),
      r2(dx + mw),
      hY0,
      hY1,
      z0,
      zTop,
      void 0
    ));
    boards.push(mkBoard(
      "H34_fridgeBase",
      "H34 fridge base",
      "h_support",
      "H34_fridgeBase",
      s.hT,
      "carcass",
      "XZ",
      "Y",
      Math.max(r2(dx + RULES.H_SUPPORT_THICKNESS.value), vLeftX1),
      Math.min(r2(dx + mw - RULES.H_SUPPORT_THICKNESS.value), vRightX0),
      r2(md - RULES.H34_DEPTH.value),
      md,
      h34z0,
      floor,
      void 0
    ));
    boards.push(mkBoard(
      "FridgeBaseRail",
      "Fridge Base Front Rail",
      "h_support",
      "fridge_base_rail",
      CPT,
      "carcass",
      "XY",
      "Z",
      vLeftX1,
      vRightX0,
      0,
      railY1,
      railZ0,
      floor,
      void 0
    ));
    for (const id of ["H13_fridgeBase", "H24_fridgeBase"]) {
      same(`${id}.y0`, "tall.hY0");
      same(`${id}.y1`, "tall.hY1");
      same(`${id}.z0`, "tall.fridgeBase.z0");
      same(`${id}.z1`, `tall.slot.${fridgeFloor.id}.z0`);
    }
    same("H34_fridgeBase.z0", "tall.fridgeBase.h34z0");
    same("H34_fridgeBase.z1", "tall.fridgeFloor.z0");
    same("FridgeBaseRail.z0", "tall.fridgeBase.railZ0");
    same("FridgeBaseRail.z1", "tall.fridgeFloor.z0");
    same("FridgeBaseRail.y1", "tall.fridgeBase.railY1");
  }
  for (const zi of zoneItems) {
    if (zi.zone.type !== "blank_panel") continue;
    const H = RULES.H_SUPPORT_HEIGHT.value;
    if (zi.height >= RULES.H12_SPLIT_HEIGHT.value) {
      boards.push(mkBoard(
        `H12_${zi.zone.id}_top`,
        "H12 Support Top",
        "blank_panel_support",
        "H12",
        s.hT,
        "carcass",
        "XZ",
        "Y",
        vLeftX1,
        vRightX0,
        0,
        RULES.H12_DEPTH.value,
        r2(zi.z1 - H),
        zi.z1,
        void 0
      ));
      boards.push(mkBoard(
        `H12_${zi.zone.id}_bottom`,
        "H12 Support Bottom",
        "blank_panel_support",
        "H12",
        s.hT,
        "carcass",
        "XZ",
        "Y",
        vLeftX1,
        vRightX0,
        0,
        RULES.H12_DEPTH.value,
        zi.z0,
        r2(zi.z0 + H),
        void 0
      ));
    } else {
      boards.push(mkBoard(
        `H12_${zi.zone.id}`,
        "H12 Support",
        "blank_panel_support",
        "H12",
        s.hT,
        "carcass",
        "XZ",
        "Y",
        vLeftX1,
        vRightX0,
        0,
        RULES.H12_DEPTH.value,
        zi.z0,
        zi.z1,
        void 0
      ));
    }
  }
  const vdBoards = [];
  for (const zi of zoneItems) {
    if (zi.zone.type !== "double_door" || zi.zone.verticalDivider !== true) continue;
    const coreX = asNum(zi.zone.dividerCenterX, mw / 2);
    if (coreX <= 0 || coreX >= mw) {
      errors.push(`Divider center X ${coreX} for zone ${zi.zone.id} is outside MidWidth.`);
      continue;
    }
    vdBoards.push({ id: `VD_${zi.zone.id}`, zoneItem: zi, coreX });
  }
  for (const vd of vdBoards) {
    const { zoneItem, coreX } = vd;
    const z0 = zoneItem.z0, z1 = zoneItem.z1;
    const x0 = r2(dx + coreX - s.dividerT / 2), x1 = r2(dx + coreX + s.dividerT / 2);
    const tongue = r2(CPT / 2 - RULES.DIVIDER_TONGUE_GROOVE_CLEARANCE.value);
    const ty0 = r2(md / 3), ty1 = r2(2 * md / 3);
    const h34CutY0 = r2(md - RULES.H34_CLEARANCE_DEPTH.value);
    const rearBottomZ = r2(z0 - tongue);
    const h34Cuts = [];
    const h34Bands = boards.filter((board) => board.id.startsWith("H34")).map((board) => ({ z0: Math.max(board.z0, z0), z1: Math.min(board.z1, z1) })).filter((band) => band.z1 - band.z0 > EPS3);
    const t5z0 = r2(CH - RULES.T5_REAR_VERTICAL_HEIGHT.value - RULES.H34_Z_BELOW.value);
    const t5Top = r2(Math.min(z1, CH));
    if (t5Top > Math.max(z0, t5z0) + EPS3) h34Bands.push({ z0: r2(Math.max(z0, t5z0)), z1: t5Top });
    h34Bands.sort((a, b) => a.z0 - b.z0);
    for (const band of h34Bands) {
      const prev = h34Cuts[h34Cuts.length - 1];
      if (prev && band.z0 <= prev.z1 + EPS3) prev.z1 = r2(Math.max(prev.z1, band.z1));
      else h34Cuts.push({ z0: r2(band.z0), z1: r2(band.z1) });
    }
    const yMd = link("tall.md");
    const yCut = ex({ md: ref("tall.md"), d: RULES.H34_CLEARANCE_DEPTH }, (t) => Math.round((t.md - t.d) * 1e3) / 1e3, "midDepth - H34_CLEARANCE_DEPTH");
    const yTy0 = ex({ md: ref("tall.md") }, (t) => Math.round(t.md / 3 * 1e3) / 1e3, "midDepth / 3");
    const yTy1 = ex({ md: ref("tall.md") }, (t) => Math.round(2 * t.md / 3 * 1e3) / 1e3, "2 * midDepth / 3");
    dim(`${vd.id}.tongue`, { CPT: ref("tall.CPT"), c: RULES.DIVIDER_TONGUE_GROOVE_CLEARANCE }, (t) => Math.round((t.CPT / 2 - t.c) * 1e3) / 1e3, { formula: "CPT / 2 - clearance" });
    const zTongue = ex({ z: z0, tongue: ref(`${vd.id}.tongue`) }, (t) => Math.round((t.z - t.tongue) * 1e3) / 1e3, "zoneZ0 - tongue");
    const zZone0 = ex({ z: z0 }, (t) => t.z, "zoneZ0");
    const zZone1 = ex({ z: z1 }, (t) => t.z, "zoneZ1");
    const pairs = [
      [lit(0), zTongue],
      [yTy0, zTongue],
      [yTy0, zZone0],
      [yTy1, zZone0],
      [yTy1, zTongue]
    ];
    const rear = [[md, rearBottomZ]];
    let zCursor = rearBottomZ;
    let cutN = 0;
    const pushRear = (y, z, formula) => {
      dim(`${vd.id}.rz.${cutN}`, { z }, (t) => t.z, { formula });
      pairs.push([y, link(`${vd.id}.rz.${cutN}`)]);
      cutN += 1;
    };
    pushRear(yMd, rearBottomZ, "zoneZ0 - tongue");
    for (const cut of h34Cuts) {
      const cz0 = r2(Math.max(cut.z0, zCursor));
      const cz1 = r2(cut.z1);
      if (cz1 <= zCursor + EPS3) continue;
      if (cz0 > zCursor + EPS3) pushRear(yMd, cz0, "H34 or T5 band");
      pushRear(yCut, cz0, "H34 or T5 band");
      pushRear(yCut, cz1, "H34 or T5 band");
      if (cz1 < z1 - EPS3) pushRear(yMd, cz1, "H34 or T5 band");
      zCursor = cz1;
    }
    if (z1 > zCursor + EPS3) pushRear(yMd, z1, "zoneZ1");
    pairs.push([lit(0), zZone1], [lit(0), zTongue]);
    const prof = yzTrace(vd.id, pairs);
    boards.push(mkBoard(
      vd.id,
      `Vertical Divider ${zoneItem.zone.id}`,
      "vertical_divider",
      "vertical_divider",
      s.dividerT,
      "carcass",
      "YZ",
      "X",
      x0,
      x1,
      0,
      md,
      z0,
      z1,
      prof
    ));
    for (const b of boundaries) {
      if (b.boundaryType !== "full_zi") continue;
      const isUpper = Math.abs(b.z0 - z1) < EPS3;
      const isLower = Math.abs(b.z1 - z0) < EPS3;
      if (!isUpper && !isLower) continue;
      ziGrooves.push({
        id: `zi_groove_${vd.id}_${b.id}`,
        boardId: `Zi_${b.id}`,
        face: isLower ? "top" : "bottom",
        x0: r2(dx + coreX - (s.dividerT + RULES.ZI_GROOVE_WIDTH_CLEARANCE.value) / 2),
        x1: r2(dx + coreX + (s.dividerT + RULES.ZI_GROOVE_WIDTH_CLEARANCE.value) / 2),
        y0: r2(md / 3 - RULES.ZI_GROOVE_Y_OVERHANG.value),
        y1: r2(2 * md / 3 + RULES.ZI_GROOVE_Y_OVERHANG.value),
        depth: r2(CPT / 2)
      });
    }
  }
  const dsBoards = [];
  for (const zi of zoneItems) {
    const zt = zi.zone.type;
    if (!PANEL_TYPES.has(zt) || zt === "drawer" || zt === "top_flap" || zt === "bottom_flap" || zt === "fixed_panel") continue;
    if (zi.zone.shelfEnabled !== true) continue;
    if (zi.height < RULES.DOOR_SHELF_MIN_ZONE_HEIGHT.value) continue;
    const shelfTopZ = r2(zi.z0 + asNum(zi.zone.shelfHeight, Math.round(zi.height / 2)));
    if (!(shelfTopZ > zi.z0 && shelfTopZ < zi.z1)) continue;
    const th = CPT;
    const z0 = r2(shelfTopZ - th), z1 = shelfTopZ;
    const vd = vdBoards.find((v) => v.zoneItem.zone.id === zi.zone.id);
    if (zt === "double_door" && vd) {
      const vx0 = r2(dx + vd.coreX - s.dividerT / 2), vx1 = r2(dx + vd.coreX + s.dividerT / 2);
      dsBoards.push({ id: `DS_${zi.zone.id}_L`, zone: zi, x0: dx, x1: vx0, z0, z1 });
      dsBoards.push({ id: `DS_${zi.zone.id}_R`, zone: zi, x0: vx1, x1: r2(dx + mw), z0, z1 });
    } else {
      dsBoards.push({ id: `DS_${zi.zone.id}`, zone: zi, x0: dx, x1: r2(dx + mw), z0, z1 });
    }
  }
  for (const ds of dsBoards) {
    boards.push(mkBoard(
      ds.id,
      "Door Shelf",
      "door_shelf",
      "door_shelf",
      CPT,
      "carcass",
      "XY",
      "Z",
      ds.x0,
      ds.x1,
      0,
      md,
      ds.z0,
      ds.z1,
      void 0
    ));
  }
  const frontPanels = [];
  const isOpenZone = (t) => t === "open_space" || t === "open_appliance" || t === "fridge";
  if (s.panelsOn) {
    const frontZones = zoneItems.filter((zi) => PANEL_TYPES.has(zi.zone.type));
    for (const zi of frontZones) {
      const zt = zi.zone.type;
      const idx = zoneItems.indexOf(zi);
      const next = zoneItems[idx + 1];
      const belowBoundary = boundaries.find((b) => b.id === `boundary-${zi.zone.id}`);
      const aboveBoundary = next ? boundaries.find((b) => b.id === `boundary-${next.zone.id}`) : void 0;
      const below = belowBoundary ?? (idx === 0 ? botSys : zoneItems[idx - 1]);
      const above = aboveBoundary ?? next ?? topSys;
      const lowerZone = belowBoundary ? zoneItems[idx - 1] : void 0;
      const upperZone = aboveBoundary ? next : void 0;
      let z0;
      let z1;
      if (zi === frontZones[0] && below.kind === "bottom_system") {
        z0 = s.botSys.style === "style_1" ? s.botSys.frontRail : r2(s.botSys.frontRail + s.fc);
      } else if (below.kind === "boundary_panel") {
        if (lowerZone && isOpenZone(lowerZone.zone.type)) z0 = r2(below.z0 + s.fc);
        else z0 = r2(below.centerZ + s.fc / 2);
      } else if (below.kind === "functional_zone") {
        const belowZone = below;
        z0 = belowZone.zone && PANEL_TYPES.has(belowZone.zone.type) ? r2(zi.z0 + s.fc / 2) : r2(zi.z0 + s.fc);
      } else {
        z0 = r2(zi.z0 + s.fc / 2);
      }
      if (zi === frontZones[frontZones.length - 1] && above.kind === "top_system") {
        z1 = s.topSys.style === "style_1" ? r2(CH - s.topSys.frontRail) : r2(CH - s.topSys.frontRail - s.fc);
      } else if (above.kind === "boundary_panel") {
        if (upperZone && isOpenZone(upperZone.zone.type)) z1 = r2(above.z1 - s.fc);
        else z1 = r2(above.centerZ - s.fc / 2);
      } else if (above.kind === "functional_zone") {
        const aboveZone = above;
        z1 = aboveZone.zone && PANEL_TYPES.has(aboveZone.zone.type) ? r2(zi.z1 - s.fc / 2) : r2(zi.z1 - s.fc);
      } else {
        z1 = r2(zi.z1 - s.fc / 2);
      }
      if (zi === baseDrawer && fridgeFloor) z1 = r2(fridgeFloor.z0 - RULES.FRIDGE_BASE_DRAWER_FRONT_GAP.value);
      const x0 = r2(s.leftT + s.fc), x1 = r2(s.CW - s.rightT - s.fc);
      if (zt === "double_door") {
        const mid = r2((x0 + x1) / 2);
        frontPanels.push({ id: `FP_${zi.zone.id}_L`, zone: zi, x0, x1: r2(mid - s.fc / 2), z0, z1, leaf: "L" });
        frontPanels.push({ id: `FP_${zi.zone.id}_R`, zone: zi, x0: r2(mid + s.fc / 2), x1, z0, z1, leaf: "R" });
      } else {
        frontPanels.push({ id: `FP_${zi.zone.id}`, zone: zi, x0, x1, z0, z1, leaf: "single" });
      }
    }
  }
  for (const fp of frontPanels) {
    boards.push(mkBoard(
      fp.id,
      fp.zone.zone.type === "fixed_panel" ? "Fixed Front Panel" : "Front Panel",
      "front_panel",
      "front_panel",
      FPT,
      "door",
      "XZ",
      "Y",
      fp.x0,
      fp.x1,
      -FPT,
      0,
      fp.z0,
      fp.z1,
      void 0
    ));
    const hs = { ...fp.zone.zone.hingeSettings };
    const cupD = asNum(hs.cupDiameter, RULES.HINGE_CUP_DIAMETER.value);
    const cupDepth = asNum(hs.cupDepth, RULES.HINGE_CUP_DEPTH.value);
    const fromEdge = asNum(hs.cupCenterFromEdge, RULES.HINGE_CUP_FROM_EDGE.value);
    const zt = fp.zone.zone.type;
    if (zt === "top_flap" || zt === "bottom_flap") {
      const custom = hs.sideDistance && hs.sideDistance !== "auto" && Number.isFinite(Number(hs.sideDistance));
      const fromSide = custom ? Number(hs.sideDistance) : RULES.FLAP_HINGE_FROM_SIDE.value;
      const cz = zt === "bottom_flap" ? r2(fp.z0 + fromEdge) : r2(fp.z1 - fromEdge);
      const depth = asNum(hs.cupDepth, RULES.FLAP_HINGE_CUP_DEPTH.value);
      [r2(fp.x0 + fromSide), r2(fp.x1 - fromSide)].forEach((cx, i) => {
        hinges.push({ id: `${fp.id}_hinge_${i + 1}`, panelId: fp.id, centerX: cx, centerZ: cz, diameter: cupD, depth });
      });
    } else if (zt !== "drawer" && zt !== "fixed_panel") {
      const h = r2(fp.z1 - fp.z0);
      let sd;
      if (hs.sideDistance && hs.sideDistance !== "auto" && Number.isFinite(Number(hs.sideDistance))) {
        sd = Number(hs.sideDistance);
      } else {
        sd = RULES.HINGE_SD_MIN.value + (h - RULES.HINGE_SD_SPAN.value) * RULES.SD_GAIN_NUM.value / RULES.SD_GAIN_DEN.value;
        sd = Math.min(RULES.HINGE_SD_MAX.value, Math.max(RULES.HINGE_SD_MIN.value, sd));
      }
      const hingeLeft = zt === "left_side_door" || zt === "side_door" || zt === "double_door" && fp.leaf === "L";
      const cx = hingeLeft ? r2(fp.x0 + fromEdge) : r2(fp.x1 - fromEdge);
      const centers = [{ z: r2(fp.z1 - sd) }, { z: r2(fp.z0 + sd) }];
      if (hs.useThreeHinges) centers.push({ z: r2((fp.z0 + fp.z1) / 2) });
      centers.forEach((c, i) => {
        hinges.push({ id: `${fp.id}_hinge_${i + 1}`, panelId: fp.id, centerX: cx, centerZ: c.z, diameter: cupD, depth: cupDepth });
      });
    }
    if (s.locksOn && fp.zone.zone.lockPosition) {
      const lw = RULES.LOCK_SLOT_LENGTH.value, lh = RULES.LOCK_SLOT_WIDTH.value;
      const cx = r2((fp.x0 + fp.x1) / 2);
      const zt2 = fp.zone.zone;
      let cz = null;
      let mountingFace = "bottom";
      let mountingBoardId;
      const lp = zt2.lockPosition;
      const zIdx = zoneItems.indexOf(fp.zone);
      const nextZone = zoneItems[zIdx + 1];
      const zoneAbove = nextZone ? boundaries.find((b) => b.id === `boundary-${nextZone.zone.id}` && b.boundaryType !== "none") : void 0;
      const zoneBelow = boundaries.find((b) => b.id === `boundary-${fp.zone.zone.id}` && b.boundaryType !== "none");
      if (lp === "top") {
        const underRail = fp.zone === baseDrawer && fridgeFloor;
        const mount = underRail ? r2(fridgeFloor.z0 - CPT) : zoneAbove ? zoneAbove.z0 : fp.z1;
        cz = r2(mount - RULES.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
        mountingFace = "top";
        mountingBoardId = underRail ? "FridgeBaseRail" : zoneAbove ? `Zi_${zoneAbove.id}` : void 0;
      } else if (lp === "bottom") {
        const mount = zoneBelow ? zoneBelow.z1 : fp.z0;
        cz = r2(mount + RULES.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
        mountingFace = "bottom";
        mountingBoardId = zoneBelow ? `Zi_${zoneBelow.id}` : void 0;
      } else if (lp === "side") {
        mountingFace = "side";
        mountingBoardId = `VD_${fp.zone.zone.id}`;
        cz = r2(fp.zone.z0 + asNum(zt2.lockHeight, 0));
        if (cz > fp.z1) {
          cz = fp.z1;
          warnings.push(`Zone ${fp.zone.zone.id}: side lock center Z outside panel Z; clamped.`);
        }
      } else {
        const ds = dsBoards.find((d) => d.zone.zone.id === fp.zone.zone.id && (fp.leaf === "single" || d.id.endsWith(`_${fp.leaf}`)));
        if (ds) {
          cz = lp === "shelf_top" ? r2(ds.z1 + RULES.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value) : r2(ds.z0 - RULES.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
          mountingFace = lp === "shelf_top" ? "top" : "bottom";
        } else {
          cz = r2(fp.z0 + RULES.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
          warnings.push(`Zone ${fp.zone.zone.id}: no horizontal shelf board found for ${lp} lock; fallback to bottom face.`);
        }
      }
      if (cz != null) {
        locks.push({
          id: `${fp.id}_lock`,
          panelId: fp.id,
          centerX: cx,
          centerZ: cz,
          width: lw,
          height: lh,
          radius: r2(lh / 2),
          mountingFace,
          mountingBoardId
        });
      }
    }
  }
  const mkSidePanel = (side, t, adapt, finish) => {
    const x0 = side === "L" ? 0 : r2(s.CW - t);
    let prof;
    if (s.avoid.enabled && s.avoid.depth > 0 && s.avoid.height > 0 && adapt) {
      const ad = s.avoid.depth, ah = s.avoid.height;
      prof = yzTrace(`SidePanel_${side}`, [
        [ex({ F: ref("tall.FPT") }, (t2) => -t2.F, "-FPT"), lit(0)],
        [ex({ md: ref("tall.md"), d: s.avoid.depth }, (t2) => Math.round((t2.md - t2.d) * 1e3) / 1e3, "midDepth - avoidD"), lit(0)],
        [ex({ md: ref("tall.md"), d: s.avoid.depth }, (t2) => Math.round((t2.md - t2.d) * 1e3) / 1e3, "midDepth - avoidD"), ex({ h: s.avoid.height }, (t2) => t2.h, "avoidH")],
        [link("tall.md"), ex({ h: s.avoid.height }, (t2) => t2.h, "avoidH")],
        [link("tall.md"), link("tall.CH")],
        [ex({ F: ref("tall.FPT") }, (t2) => -t2.F, "-FPT"), link("tall.CH")]
      ]);
    }
    boards.push(mkBoard(
      `SidePanel_${side}`,
      `Side Panel ${side === "L" ? "Left" : "Right"}`,
      "side_panel",
      "side_panel",
      t,
      finish === "colour" ? "door" : "carcass",
      "YZ",
      "X",
      x0,
      r2(x0 + t),
      -FPT,
      md,
      0,
      CH,
      prof
    ));
  };
  if (s.leftT > 0) mkSidePanel("L", s.leftT, s.leftAdapt, s.leftFinish);
  if (s.rightT > 0) mkSidePanel("R", s.rightT, s.rightAdapt, s.rightFinish);
  if (s.avoid.enabled && s.avoid.depth > 0 && s.avoid.height > RULES.AVOIDANCE_SUPPORT_THICKNESS.value) {
    const ad = s.avoid.depth, ah = s.avoid.height;
    const at = RULES.AVOIDANCE_SUPPORT_THICKNESS.value;
    const avoidY0 = dim("tall.avoidY0", { md: ref("tall.midDepth"), ad }, (t) => t.md - t.ad);
    const avoidY1 = dim("tall.avoidY1", { md: ref("tall.midDepth") }, (t) => t.md);
    boards.push(mkBoard(
      "avoidance_horizontal",
      "Avoidance Horizontal",
      "avoidance_support",
      "avoidance_horizontal",
      at,
      "carcass",
      "XY",
      "Z",
      dx,
      r2(dx + mw),
      avoidY0,
      avoidY1,
      r2(ah - at),
      ah,
      void 0
    ));
    same("avoidance_horizontal.y0", "tall.avoidY0");
    same("avoidance_horizontal.y1", "tall.avoidY1");
    boards.push(mkBoard(
      "Avoidance_Vertical",
      "Avoidance Vertical",
      "avoidance_support",
      "avoidance_vertical",
      at,
      "carcass",
      "XZ",
      "Y",
      dx,
      r2(dx + mw),
      avoidY0,
      r2(avoidY0 + at),
      0,
      r2(ah - at),
      void 0
    ));
  }
  stampTallBoards(s, boards);
  applyLayoutDraft(boards, options.layout != null ? options.layout : LAYOUT, {}, errors, warnings, {
    leftSide: s.leftT > 0 ? s.leftFinish : "none",
    rightSide: s.rightT > 0 ? s.rightFinish : "none"
  });
  attachFaces(boards);
  const joints = buildTallFaces({
    boards,
    ziSlots,
    ziGrooves,
    hinges,
    locks,
    doorColour: doorColourOf(input),
    ledGroove: input.ledGroove === true,
    fridgeZ: fridgeZoneItem ? [fridgeZoneItem.z0, fridgeZoneItem.z1] : null
  });
  const grain = applyGrain(
    boards,
    (b) => b.id.startsWith("SidePanel_") ? "side" : b.stock?.kind === "door" ? "front" : null,
    input,
    { front: "horizontal", side: "vertical" }
  );
  applyDoorSides(boards, input);
  const milling = applyMilling(boards);
  const result = {
    params: {
      cabinetHeight: CH,
      cabinetWidth: s.CW,
      cabinetDepth: CD,
      midWidth: mw,
      midDepth: md,
      panelThickness: CPT,
      frontPanelThickness: FPT,
      ziThickness: s.ziT,
      leftSidePanelThickness: s.leftT,
      rightSidePanelThickness: s.rightT,
      fridgeOpening
    },
    boards,
    grain,
    milling,
    stack: [
      botSys,
      ...(() => {
        const out = [];
        for (const zi of zoneItems) {
          const b = boundaries.find((x) => x.id === `boundary-${zi.zone.id}`);
          if (b) out.push(b);
          out.push(zi);
        }
        return out;
      })(),
      topSys
    ],
    ziSlots,
    ziGrooves,
    hinges,
    locks,
    joints,
    validation: { errors, warnings }
  };
  result.debug = {
    provenance: endProvenance(),
    boardFrame: "final",
    midWidth: mw,
    midDepth: md,
    hZiConflicts,
    fridgeAvoidance: { finalMode: fridgeMode, fridgeGap, fridgeBaseBottomZ }
  };
  return result;
}
export {
  GT_UI_PRESETS,
  fitTallCabinetHeight,
  fridgeCabinetWidth,
  generateGTSvgPreview,
  generateGeneralTall,
  gtZoneOpenings
};
