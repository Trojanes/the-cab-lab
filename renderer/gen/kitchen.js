// Generated from generators/kitchen/generator.ts - do not edit.

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
function refreshBoardBox(b) {
  Object.assign(b, recordBoardBox(b.id, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1));
  return b;
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

// generators/kitchen/relationshipDeclarations.ts
var D = (declarationId, host, target) => ({
  declarationId,
  generator: "kitchen",
  panelAId: host,
  panelBId: target,
  relationshipType: "structural_butt_joint",
  geometryType: "edge_to_surface",
  hostPanelId: host,
  targetPanelId: target,
  ruleId: `${declarationId}_v1`,
  allowedHardware: ["screw_hole"]
});
var STATIC = [
  D("kt_b1_b3_bottom_rail_to_deck", "B1", "B3"),
  D("kt_b2_b3_carcass_rail_to_deck", "B2", "B3"),
  D("kt_b1_b2_front_to_carcass_rail", "B1", "B2")
];
function present(d, ids) {
  return [d.panelAId, d.panelBId, d.hostPanelId, d.targetPanelId].every((id) => ids.has(id));
}
function axisOverlap(a0, a1, b0, b1) {
  return a0 < b1 - 0.01 && b0 < a1 - 0.01;
}
function axisNear(a0, a1, b0, b1) {
  const gap = Math.max(b0 - a1, a0 - b1);
  return gap <= 0.6 && gap >= -0.6;
}
function meets(a, b) {
  const ox = axisOverlap(a.x0, a.x1, b.x0, b.x1);
  const oy = axisOverlap(a.y0, a.y1, b.y0, b.y1);
  const oz = axisOverlap(a.z0, a.z1, b.z0, b.z1);
  const nx = axisNear(a.x0, a.x1, b.x0, b.x1);
  const ny = axisNear(a.y0, a.y1, b.y0, b.y1);
  const nz = axisNear(a.z0, a.z1, b.z0, b.z1);
  return ox && oy && oz || nx && oy && oz || ny && ox && oz || nz && ox && oy;
}
var SKIP_FRONT = /* @__PURE__ */ new Set(["front_panel"]);
function joinRule(a, b) {
  const types = /* @__PURE__ */ new Set([a.boardType, b.boardType]);
  if (types.has("vertical_panel") && (types.has("drawer_divider") || types.has("full_depth_shelf") || types.has("door_shelf"))) return "kitchen_v_to_functional_v1";
  if (types.has("vertical_panel") && types.has("strengthening_strip")) return "kitchen_v_to_strengthening_strip_v1";
  if (types.has("vertical_panel") && (types.has("bottom_front") || types.has("bottom_carcass"))) return "kitchen_v_to_bottom_rail_v1";
  if (types.has("vertical_panel") && (types.has("top_front_rail") || types.has("top_rear_rail") || types.has("top_rear_vertical") || types.has("bottom_rear_vertical"))) return "kitchen_v_to_rail_v1";
  if (types.has("top_rear_rail") && types.has("top_rear_vertical")) return "kitchen_t2_meets_t3_v1";
  if (types.has("strengthening_strip") && types.has("door_shelf")) return "kitchen_strip_groove_to_shelf_v1";
  if (types.has("strengthening_strip") && (types.has("bottom_deck") || types.has("top_front_rail"))) return "kitchen_strip_to_rail_v1";
  if (types.has("avoidance_top") || types.has("avoidance_front") || types.has("raised_b4")) return "kitchen_avoidance_v1";
  return "kitchen_butt_v1";
}
function relationshipDeclarationsForBoards(boardsOrIds, skipPairs = /* @__PURE__ */ new Set()) {
  const boards = Array.isArray(boardsOrIds) ? boardsOrIds : [];
  const boardIds = Array.isArray(boardsOrIds) ? new Set(boards.map((b) => b.id)) : boardsOrIds;
  const extra = [];
  if (boardIds.has("B3")) {
    const vs2 = [...boardIds].filter((id) => /^V\d+$/.test(id)).sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
    for (const v of vs2) extra.push(D(`kt_${v.toLowerCase()}_b3`, v, "B3"));
    const funcs = [...boardIds].filter((id) => /door-shelf$/.test(id) || /-(bottom)$/.test(id));
    for (const id of funcs) extra.push(D(`kt_b3_${id.replace(/-/g, "_")}`, "B3", id));
  }
  const rails = [...boardIds].filter((id) => /^(T[123]|B4)(-\d+)?$/.test(id));
  const vs = [...boardIds].filter((id) => /^V\d+$/.test(id)).sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
  const endVs = vs.length ? [vs[0], vs[vs.length - 1]].filter((v, i, a) => a.indexOf(v) === i) : [];
  for (const rail of rails) {
    for (const v of endVs) extra.push(D(`kt_${rail.replace(/-/g, "_")}_${v.toLowerCase()}`, rail, v));
  }
  const base = [...STATIC, ...extra].filter((d) => present(d, boardIds));
  const seen = new Set(base.map((d) => [d.panelAId, d.panelBId].sort().join("|")));
  const more = [];
  for (let i = 0; i < boards.length; i += 1) {
    for (let k = i + 1; k < boards.length; k += 1) {
      const a = boards[i];
      const b = boards[k];
      if (SKIP_FRONT.has(a.boardType ?? "") || SKIP_FRONT.has(b.boardType ?? "")) continue;
      if (a.category === "front_panel" || b.category === "front_panel") continue;
      const key = [a.id, b.id].sort().join("|");
      if (seen.has(key) || skipPairs.has(key)) continue;
      if (!meets(a, b)) continue;
      seen.add(key);
      const rule = joinRule(a, b);
      more.push({
        ...D(`kt_${a.id}_${b.id}`.replace(/[^A-Za-z0-9_]/g, "_").toLowerCase(), a.id, b.id),
        ruleId: rule
      });
    }
  }
  return [...base, ...more];
}

// generators/kitchen/rules.json
var rules_default = {
  NOTCH_ALLOWANCE_EXTRA: { value: 1, doc: "\u8BA9\u4F4D\u7F3A\u53E3/\u69FD\u5BBD\u4F59\u91CF\uFF1Bna = \u677F\u539A + 1\u3002" },
  STYLE1_TOE_KICK_Y: { value: 70, doc: "style_1 toe kick: the side panel's front edge, and B1's front face. B1 and B2 sit behind it." },
  BOTTOM_SLOT_REAR_Y: { value: 80, doc: "V \u677F B3 \u53F0\u9636\u524D\u7F18 Y\uFF08z\u2208[BCH, BCH+na] \u6BB5\uFF09\u3002" },
  RECEIVER_NOTCH_DEPTH: { value: 85, doc: "r\uFF1AV \u677F\u9876\u524D T1 \u8BA9\u4F4D\u6DF1\uFF08Y \u5411\uFF09\uFF1B\u4EA6\u4E3A T3/B4 \u540E\u63A5\u6536\u7F3A\u53E3\u9AD8\uFF08Z \u5411\uFF09\u3002" },
  SUPPORT_STRIP_WIDTH: { value: 100, doc: "B3 \u6DF1\u5EA6\uFF1BT1/T2 \u6761\u5BBD\uFF1BT3/B4 \u6761\u9AD8\uFF1B\u52A0\u5F3A\u6761\u6DF1\u5EA6\u3002" },
  B3_DEPTH: { value: 150, doc: "\u62BD\u5C49\u5206\u9694\u677F\u6DF1\uFF08drawer_divider y \u8303\u56F4\uFF09\u3002" },
  SUPPORT_STRIP_NOTCH_DEPTH: { value: 20, doc: "T \u7CFB/B4 \u6761\u8BA9 V \u677F\u7684\u7F3A\u53E3\u6DF1\u3002" },
  MIN_STRIP_SEGMENT_LENGTH: { value: 30, doc: "\u6761\u5207\u5206\u540E\u6700\u5C0F\u6BB5\u957F\uFF0C\u5C0F\u4E8E\u5373\u4E22\u5F03\u3002" },
  DRAWER_SLOT_Y0: { value: 45, doc: "\u62BD\u5C49\u69FD Y \u4E0B\u754C\uFF08drawerSlotLength 110\uFF1Ay\u2208[45,155]\uFF09\u3002" },
  DRAWER_SLOT_Y1: { value: 155, doc: "\u62BD\u5C49\u69FD Y \u4E0A\u754C\u3002" },
  DRAWER_TONGUE_Y0: { value: 50, doc: "\u62BD\u5C49\u820C Y \u4E0B\u754C\uFF08[50, B3_DEPTH]\uFF09\u3002" },
  DRAWER_SLOT_CLEARANCE: { value: 5, doc: "\u62BD\u5C49\u69FD\u76F8\u5BF9\u820C\u7684 Y \u5411\u4F59\u91CF\u3002" },
  SHELF_SLOT_CLEARANCE: { value: 6, doc: "\u529F\u80FD\u677F\u69FD\u76F8\u5BF9\u820C\u7684 Y \u5411\u4F59\u91CF\uFF08\u820C \xB16\uFF09\u3002" },
  SLOT_MIN_GAP: { value: 20, doc: "V \u677F\u4E24\u9762\u7684\u69FD\uFF08\u5168\u69FD\u6216\u534A\u69FD\uFF09z \u5411\u81F3\u5C11\u76F8\u9694\u8FD9\u4E48\u591A\uFF08\u69FD\u8FB9\u5230\u69FD\u8FB9\uFF09\uFF0C\u5426\u5219\u9762\u79EF\u5C0F\u7684\u4E00\u4FA7\u90A3\u5757\u677F\u4E0D\u5F00\u69FD\u3001\u6539\u87BA\u4E1D\u3002CNC \u53EA\u4ECE\u4E0A\u9762\u5207\uFF1A\u534A\u69FD\u53EA\u80FD\u5728\u4E00\u9762\uFF0C\u4E24\u69FD\u592A\u8FD1\u4F1A\u5207\u5230\u4E00\u8D77\u3002" },
  SCREW_END_OFFSET: { value: 100, doc: "\u4E0D\u5F00\u69FD\u7684\u529F\u80FD\u677F\u7528\u87BA\u4E1D\u4ECE V \u677F\u53E6\u4E00\u9762\u56FA\u5B9A\uFF1A\u9996\u5C3E\u4E24\u5B54\u79BB\u677F\u7684\u524D\u540E\u8FB9\u5404\u8FD9\u4E48\u8FDC\u3002\u677F\u6DF1\u4E0D\u8DB3 2 \u500D\u65F6\u53EA\u5728\u6B63\u4E2D\u6253\u4E00\u4E2A\u3002\u9AD8\u7EA7\u8BBE\u7F6E\u53EF\u8C03\u3002" },
  SCREW_MAX_SPACING: { value: 150, doc: "\u9996\u5C3E\u4E24\u5B54\u4E4B\u95F4\u6309\u4E0D\u8D85\u8FC7\u8FD9\u4E2A\u95F4\u8DDD\u5E73\u5206\uFF08\u95F4\u9694\u6570 = \u4E2D\u6BB5 \xF7 \u6B64\u503C\u5411\u4E0A\u53D6\u6574\uFF09\uFF0C\u4EE5\u677F\u4E2D\u5FC3\u7EBF\u5BF9\u79F0\u3002\u9AD8\u7EA7\u8BBE\u7F6E\u53EF\u8C03\u3002" },
  SCREW_HOLE_DIAMETER: { value: 3, doc: "\u87BA\u4E1D\u5B54\uFF1A\u901A\u5B54\uFF0C\u4E0D\u505A\u6C89\u5934\uFF1B\u9489\u5934\u5916\u9732\uFF0C\u8F66\u95F4\u8D34\u8D34\u7EB8\u3002" },
  HINGE_CUP_DIAMETER: { value: 35, doc: "\u94F0\u94FE\u676F\u76F4\u5F84\u3002" },
  HINGE_CUP_DEPTH: { value: 12.5, doc: "\u94F0\u94FE\u676F\u6DF1\u3002" },
  HINGE_CUP_FROM_EDGE: { value: 22.5, doc: "\u676F\u5FC3\u8DDD\u95E8\u4FA7\u6CBF\u3002" },
  SINK_HINGE_DROP_MM: { value: 130, doc: "Left or right door under a bench sink: the upper hinge cup moves down by this much. The lower hinge stays. A sink on the bench will set this later." },
  HINGE_SD_MIN: { value: 75, doc: "\u94F0\u94FE\u4FA7\u8DDD\u4E0B\u9650\u3002" },
  HINGE_SD_MAX: { value: 100, doc: "\u94F0\u94FE\u4FA7\u8DDD\u4E0A\u9650\u3002" },
  HINGE_SD_SPAN: { value: 300, doc: "\u4FA7\u8DDD\u516C\u5F0F\u53C2\u8003\u957F\uFF1Asd = clamp[75,100](75 + (\u957F\u8FB9\u2212300)\xB725/300)\u3002" },
  SD_GAIN_NUM: { value: 25, doc: "\u4FA7\u8DDD\u516C\u5F0F\u589E\u76CA\u5206\u5B50\u3002" },
  SD_GAIN_DEN: { value: 300, doc: "\u4FA7\u8DDD\u516C\u5F0F\u589E\u76CA\u5206\u6BCD\u3002" },
  FRONT_CLEARANCE: { value: 2.5, doc: "\u95E8\u7F1D fc\uFF08\u9690\u85CF\u53C2\u6570\u9ED8\u8BA4\uFF09\u3002" },
  RUN_SHEET_MAX_MM: { value: 2400, doc: "A kitchen run longer than this cannot be cut as one board. The panel asks for a split; a shorter run may still be split." },
  LOCK_WIDTH: { value: 55, doc: "razor_long_rounded_1 \u9501\u69FD\u5BBD\u3002" },
  LOCK_HEIGHT: { value: 15.5, doc: "\u9501\u69FD\u9AD8\uFF08r = \u9AD8/2\uFF09\u3002" },
  LOCK_SIDE_OFFSET: { value: 80, doc: "\u9501\u5FC3\u8DDD\u4FA7\u6CBF\uFF08lockSideCenterOffset \u9ED8\u8BA4\uFF09\u3002" },
  LOCK_DROP: { value: 30.5, doc: "\u9501\u5FC3\u4F4E\u4E8E\u4E0A\u5206\u9694\u5FC3\uFF1A\u4E0A\u5206\u9694\u5FC3 \u2212 CPT/2 \u2212 30.5\u3002" },
  DOOR_SHELF_MIN_ZONE_HEIGHT: { value: 350, doc: "\u533A\u9AD8\u4F4E\u4E8E\u6B64\u4E0D\u751F\u6210\u95E8\u5C42\u677F\u3002" },
  STRENGTHENING_STRIP_NOTCH_Y: { value: 85, doc: "\u5C42\u677F\u524D\u7F18\u8BA9\u52A0\u5F3A\u6761\u7684\u7F3A\u53E3\u6DF1\uFF08y\u2208[0,85]\uFF09\u3002" },
  STRENGTHENING_GROOVE_Y0: { value: 80, doc: "\u52A0\u5F3A\u6761\u81EA\u8EAB\u69FD y \u4E0B\u754C\u3002" },
  STRENGTHENING_GROOVE_CLEARANCE: { value: 0.5, doc: "\u52A0\u5F3A\u6761\u69FD z \u76F8\u5BF9\u5C42\u677F\u7684\u4F59\u91CF\u3002" },
  RAISED_B4_HEIGHT: { value: 100, doc: "\u8F6E\u62F1 raised B4 \u9AD8\u5EA6/\u907F\u8BA9\u7F29\u77ED\u5E26\uFF08100 mm\uFF09\u3002" },
  STOVE_CUT_FRONT_EXTRA: { value: 100, doc: "\u7076\u53F0\u5207\u5272\u533A y \u2208 [0, FPT+100]\u3002" },
  STOVE_SIDE_PANEL_WIDTH_MM: { value: 100, doc: "Each stove front side panel. The opening between them is the column's front span minus two of these." },
  STOVE_SIDE_NOTCH_X_MM: { value: 20, doc: "Stove side panel inner-top notch, measured in from the edge that faces the opening." },
  STOVE_SIDE_NOTCH_Z_MM: { value: 30, doc: "Stove side panel inner-top notch, measured down from the panel's top." },
  STOVE_LIP_RELIEF_RADIUS_MM: { value: 5.5, doc: "Semicircle cut into each inside corner of the stove shelf lip, into the shelf (depth), so a 10 mm router can pass the corner. The lip stays the full gap between the side panels." },
  SLOT_Z_CLEARANCE: { value: 0.5, doc: "\u69FD z = \u677F z \xB1 0.5\u3002" },
  TONGUE_FALLBACK_SLACK: { value: 0.5, doc: "\u69FD\u4FE1\u606F\u7F3A\u5931\u65F6\u820C\u957F = CPT/2 \u2212 0.5\u3002" },
  EDGE_BAND_THICKNESS_MM: { value: 1, doc: "Edge-tape thickness on each banded outline edge. Door colour on fronts and on a V front that meets the door face; carcass colour on the other visible edges. The bench top's front edge takes the bench colour." },
  BENCH_THICKNESS_MM: { value: 25, doc: "Bench top thickness. The slab sits on the carcass top (z = H .. H + this). A kitchen waterfall drop is the same thickness, from the floor to the bench top, mitred 45\xB0 to the slab. Kitchen and ensuite only; the drop is kitchen only." },
  BENCH_FRONT_OVERHANG_MM: { value: 20, doc: "How far the bench top projects past the door's front face. The back edge stays on the carcass back (y = depth \u2212 door thickness)." },
  LED_GROOVE_WIDTH_MM: { value: 14.5, doc: "B3 bottom-face LED groove width, the same channel as an overhead T3." },
  LED_GROOVE_DEPTH_MM: { value: 6.5, doc: "B3 bottom-face LED groove depth. It is not cut through the board." },
  LED_GROOVE_FRONT_LAND_MM: { value: 18, doc: "Clear strip from B3's front edge to the near wall of the main LED channel." },
  LED_GROOVE_BRANCH_END_INSET_MM: { value: 30, doc: "LED branch centres inset from each end of B3. A branch runs from the main channel to B3's rear edge." },
  APPLIANCE_FLOOR_MIN_CLEAR_WIDTH_MM: { value: 500, doc: "Washer deck: minimum clear width between the column's side panels." },
  APPLIANCE_FLOOR_MIN_DEPTH_MM: { value: 450, doc: "Washer deck: minimum carcass depth (box depth minus the door)." },
  APPLIANCE_FLOOR_MIN_SPAN_MM: { value: 80, doc: "Washer deck: minimum Y span from B3's rear edge to the back upright." }
};

// generators/kitchen/rules.ts
var RULES = defineRules("kitchen", rules_default);

// generators/kitchen/faces.ts
var CARCASS_COLOUR = "White Stipple";
function frontWorldY(b) {
  const edges = boundaryEdgeFaces(b, "-Y");
  const edge = edges[0]?.edge;
  if (!edge) return null;
  const [U, V] = planeAxes(b.profilePlane);
  const c = U === "y" ? 0 : V === "y" ? 1 : -1;
  if (c < 0) return null;
  return b.y0 + (edge.from[c] + edge.to[c]) / 2;
}
function addKitchenB3Led(boards, on) {
  if (!on) return [];
  const decks = boards.filter((b) => b.boardType === "bottom_deck");
  if (!decks.length) return ["B3 LED groove skipped: B3 board missing."];
  return decks.flatMap((b3) => addOneB3Led(b3));
}
function addOneB3Led(b3) {
  const id = b3.id;
  const width = b3.x1 - b3.x0;
  const rear = b3.y1 - b3.y0;
  const W = RULES.LED_GROOVE_WIDTH_MM.value;
  const inset = RULES.LED_GROOVE_BRANCH_END_INSET_MM.value;
  const land = RULES.LED_GROOVE_FRONT_LAND_MM.value;
  const depth = RULES.LED_GROOVE_DEPTH_MM.value;
  if (depth >= b3.materialThickness - 1e-9) {
    return [`B3 LED groove skipped: depth ${depth} would cut through the ${b3.materialThickness} mm board.`];
  }
  if (width <= inset * 2 + W) {
    return [`B3 LED groove skipped: board width ${width.toFixed(1)} too narrow for ${inset} mm end insets.`];
  }
  const v0 = land;
  const v1 = land + W;
  if (v1 > rear + 1e-6) {
    return [`B3 LED groove skipped: main channel leaves board depth ${rear.toFixed(1)}.`];
  }
  if (rear - v1 <= 1e-6) {
    return ["B3 LED groove T-branches skipped: no remaining depth behind the main channel."];
  }
  const KM = `${id}.feat.LED_MAIN`;
  dim(`${KM}.u0`, {}, () => 0);
  dim(`${KM}.u1`, { w: ref(`${id}.x1`), x0: ref(`${id}.x0`) }, (t) => t.w - t.x0);
  dim(`${KM}.v0`, { land: RULES.LED_GROOVE_FRONT_LAND_MM }, (t) => t.land);
  dim(`${KM}.v1`, { land: RULES.LED_GROOVE_FRONT_LAND_MM, W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.land + t.W);
  addFeature(b3, "B", {
    id: `${id}_LED_MAIN`,
    kind: "tgroove",
    u0: 0,
    u1: width,
    v0,
    v1,
    depth,
    for: "led",
    key: KM,
    source: "kitchen",
    group: "B3.LED"
  });
  [0, 1].forEach((i) => {
    const KB = `${id}.feat.LED_BRANCH_${i + 1}`;
    const x0 = i === 0 ? dim(`${KB}.u0`, { INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM, W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.INSET - t.W / 2) : dim(`${KB}.u0`, { w: ref(`${KM}.u1`), INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM, W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.w - t.INSET - t.W / 2);
    const x1 = i === 0 ? dim(`${KB}.u1`, { INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM, W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.INSET + t.W / 2) : dim(`${KB}.u1`, { w: ref(`${KM}.u1`), INSET: RULES.LED_GROOVE_BRANCH_END_INSET_MM, W: RULES.LED_GROOVE_WIDTH_MM }, (t) => t.w - t.INSET + t.W / 2);
    dim(`${KB}.v0`, { v: ref(`${KM}.v1`) }, (t) => t.v);
    dim(`${KB}.v1`, { rear: ref(`${id}.y1`), y0: ref(`${id}.y0`) }, (t) => t.rear - t.y0);
    addFeature(b3, "B", {
      id: `${id}_LED_BRANCH_${i + 1}`,
      kind: "tgroove",
      u0: x0,
      u1: x1,
      v0: v1,
      v1: rear,
      depth,
      for: "led",
      key: KB,
      source: "kitchen",
      group: "B3.LED"
    });
  });
  return [];
}
function buildKitchenFaces(fb) {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  for (const b of fb.boards) {
    b.role = b.category;
    const isFront = b.category === "front_panel" || b.boardType === "front_panel" || b.boardType === "bottom_front" || b.boardType === "stove_side_panel";
    if (isFront) {
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, "A", { semantic: "back", visible: false });
    }
  }
  for (const s of fb.slots) {
    const v = B.get(s.vPanelId);
    if (!v) continue;
    const r = localRect(v, { y: [s.y0, s.y1], z: [s.z0, s.z1] });
    const face = s.side === "right" ? "A" : "B";
    const key = `${s.vPanelId}.feat.${s.id}`;
    const slotY0 = Number.isFinite(valueOf(`kitchen.slot.${s.id}.y0`)) ? ref(`kitchen.slot.${s.id}.y0`) : s.y0;
    const slotZ0 = Number.isFinite(valueOf(`kitchen.slot.${s.id}.z0`)) ? ref(`kitchen.slot.${s.id}.z0`) : s.z0;
    dim(`${key}.y0`, { y0: slotY0, boardY0: ref(`${s.vPanelId}.y0`) }, (t) => t.y0 - t.boardY0);
    dim(`${key}.z0`, { z0: slotZ0, boardZ0: ref(`${s.vPanelId}.z0`) }, (t) => t.z0 - t.boardZ0);
    addFeature(v, face, {
      id: s.id,
      kind: "groove",
      ...r,
      depth: s.depth,
      through: s.through,
      for: s.forBoard,
      key,
      source: "kitchen"
    });
  }
  for (const sc of fb.screws) {
    const v = B.get(sc.vPanelId);
    if (!v) continue;
    const key = `${sc.vPanelId}.feat.${sc.id}`;
    const sy = Number.isFinite(valueOf(`kitchen.screw.${sc.id}.y`)) ? ref(`kitchen.screw.${sc.id}.y`) : sc.y;
    const sz = Number.isFinite(valueOf(`kitchen.screw.${sc.id}.z`)) ? ref(`kitchen.screw.${sc.id}.z`) : sc.z;
    const cy = dim(`${key}.y`, { y: sy, y0: ref(`${sc.vPanelId}.y0`) }, (t) => t.y - t.y0);
    const cz = dim(`${key}.z`, { z: sz, z0: ref(`${sc.vPanelId}.z0`) }, (t) => t.z - t.z0);
    addFeature(v, sc.side === "right" ? "A" : "B", {
      id: sc.id,
      kind: "hole",
      center: [cy, cz],
      diameter: sc.diameter,
      through: true,
      for: sc.forBoard,
      key,
      source: "kitchen.screw"
    });
  }
  for (const tongue of fb.applianceTongues ?? []) {
    for (const [boardId, face] of [[tongue.vLeft, "A"], [tongue.vRight, "B"]]) {
      const v = B.get(boardId);
      if (!v) continue;
      const r = localRect(v, { y: [tongue.y0, tongue.y1], z: [tongue.z0, tongue.z1] });
      addFeature(v, face, {
        id: `${tongue.id}-${boardId}`,
        kind: "groove",
        ...r,
        depth: tongue.depth,
        for: tongue.id,
        source: "kitchen.washer"
      });
    }
  }
  for (const h of fb.hinges) {
    const fp = B.get(h.panelId);
    if (!fp) continue;
    const key = `${h.panelId}.feat.${h.id}`;
    const hx = Number.isFinite(valueOf(`kitchen.hinge.${h.id}.x`)) ? ref(`kitchen.hinge.${h.id}.x`) : h.centerX;
    const hz = Number.isFinite(valueOf(`kitchen.hinge.${h.id}.z`)) ? ref(`kitchen.hinge.${h.id}.z`) : h.centerZ;
    const cx = dim(`${key}.x`, { centerX: hx, x0: ref(`${h.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: hz, z0: ref(`${h.panelId}.z0`) }, (t) => t.centerZ - t.z0);
    addFeature(fp, "A", {
      id: h.id,
      kind: "hole",
      center: [cx, cz],
      diameter: h.diameter,
      depth: h.depth,
      for: "hinge",
      key,
      source: "kitchen"
    });
  }
  for (const lock of fb.locks) {
    const fp = B.get(lock.panelId);
    if (!fp) continue;
    const key = `${lock.panelId}.feat.${lock.id}`;
    const lx = Number.isFinite(valueOf(`kitchen.lock.${lock.id}.x`)) ? ref(`kitchen.lock.${lock.id}.x`) : lock.centerX;
    const lz = Number.isFinite(valueOf(`kitchen.lock.${lock.id}.z`)) ? ref(`kitchen.lock.${lock.id}.z`) : lock.centerZ;
    const cx = dim(`${key}.x`, { centerX: lx, x0: ref(`${lock.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: lz, z0: ref(`${lock.panelId}.z0`) }, (t) => t.centerZ - t.z0);
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
      source: "kitchen"
    });
  }
  for (const n of fb.notches) {
    const p = B.get(n.panelId);
    if (!p || p.profilePlane !== "XY") continue;
    const r = localRect(p, { x: [n.x0, n.x1], y: [n.y0, n.y1] });
    tagEdges(p, "notch", r, { id: n.id, for: "strip", source: "kitchen" });
  }
  const tape = RULES.EDGE_BAND_THICKNESS_MM.value;
  const carcass = CARCASS_COLOUR;
  const band = (b, normal, colour) => {
    for (const f of boundaryEdgeFaces(b, normal)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour });
  };
  for (const b of fb.boards) {
    if (b.boardType === "bench_top" || b.boardType === "bench_waterfall") {
      if (fb.benchColour) {
        if (b.profilePlane === "XZ") {
          annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.benchColour, grain: "u" } });
          annotate(b, "A", { semantic: "back", visible: true, finish: { colour: carcass } });
          const show = b.boardType === "bench_waterfall" ? b.x0 < 0.01 ? "-X" : "+X" : "+Z";
          for (const f of boundaryEdgeFaces(b, show)) {
            annotate(b, f.id, { semantic: show === "+Z" ? "top" : "outer", visible: true, finish: { colour: fb.benchColour, grain: show === "+Z" ? "u" : "v" } });
          }
          if (b.boardType === "bench_top") {
            for (const f of boundaryEdgeFaces(b, "-Z")) annotate(b, f.id, { semantic: "bottom", visible: true, finish: { colour: carcass } });
          }
        } else {
          annotate(b, "A", { semantic: "top", visible: true, finish: { colour: fb.benchColour, grain: "u" } });
          annotate(b, "B", { semantic: "bottom", visible: true, finish: { colour: carcass } });
          band(b, "-Y", fb.benchColour);
        }
      }
      continue;
    }
    if (b.boardType === "front_panel" || b.boardType === "stove_side_panel") {
      for (const f of edgeFaces(b)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: fb.doorColour });
      continue;
    }
    if (b.boardType === "stove_half_divider") {
      band(b, "-Y", fb.doorColour);
      band(b, "+Y", carcass);
      continue;
    }
    if (b.boardType === "stove_full_shelf") {
      for (const f of boundaryEdgeFaces(b, "-Y")) {
        const [U, V] = planeAxes(b.profilePlane);
        const c = U === "y" ? 0 : V === "y" ? 1 : -1;
        const y = c < 0 || !f.edge ? 0 : b.y0 + (f.edge.from[c] + f.edge.to[c]) / 2;
        setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: y < -0.5 ? fb.doorColour : carcass });
      }
      continue;
    }
    if (b.boardType === "vertical_panel") {
      const y = frontWorldY(b);
      band(b, "-Y", y != null && y < -0.5 ? fb.doorColour : carcass);
      continue;
    }
    if (b.boardType === "bottom_deck" || b.boardType === "top_front_rail" || b.boardType === "drawer_divider") {
      band(b, "-Y", carcass);
      band(b, "+Y", carcass);
      continue;
    }
    if (b.boardType === "top_rear_rail" || b.boardType === "full_depth_shelf" || b.boardType === "door_shelf" || b.boardType === "strengthening_strip") {
      band(b, "-Y", carcass);
      continue;
    }
    if (b.boardType === "top_rear_vertical") band(b, "-Z", carcass);
    else if (b.boardType === "bottom_rear_vertical") band(b, "+Z", carcass);
  }
  const pair = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  const skip = /* @__PURE__ */ new Set();
  const hardware = [];
  for (const s of fb.slots) {
    const key = pair(s.vPanelId, s.forBoard);
    if (skip.has(key)) continue;
    skip.add(key);
    const face = s.side === "right" ? "A" : "B";
    hardware.push(joint(`kt_tongue_${s.id}`, "tongue_groove", faceRef(s.vPanelId, [face]), faceRef(s.forBoard, ["A"]), {
      rule: "kitchen_tongue_in_v_slot_v1"
    }));
  }
  for (const sc of fb.screws) {
    const key = pair(sc.vPanelId, sc.forBoard);
    if (skip.has(key)) continue;
    skip.add(key);
    const face = sc.side === "right" ? "B" : "A";
    hardware.push(joint(`kt_screw_${sc.id}`, "butt", faceRef(sc.vPanelId, [face]), faceRef(sc.forBoard, ["A"]), {
      hardware: ["screw_hole"],
      rule: "kitchen_screw_through_v_v1"
    }));
  }
  return [
    ...resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(fb.boards, skip)),
    ...hardware
  ];
}

// generators/kitchen/layout.json
var layout_default = {
  module: "kitchen",
  version: 1,
  boards: {
    B1: {
      axes: {
        y: {
          from: "lo",
          at: "kitchen.toeY - FPT - CPT",
          size: "(toeY + FPT) - (kitchen.toeY)",
          when: { bottomClearanceStyle: "style_1" }
        }
      }
    },
    B2: {
      axes: {
        y: {
          from: "lo",
          at: "toeY - CPT",
          size: "(toeY + FPT + CPT) - (toeY + FPT)",
          when: { bottomClearanceStyle: "style_1" }
        }
      }
    }
  }
};

// generators/kitchen/layout.ts
var LAYOUT = validateLayout(layout_default);

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
          cross: (crossLo + crossHi) / 2,
          aHi: hi(a),
          bLo: lo(b),
          aMid: mid(a),
          bMid: mid(b),
          crossLo,
          crossHi
        });
      }
    }
  }
  return out;
}
function columnOpenings(columns, boards) {
  const panels = boards.filter((b) => b.thicknessAxis === "X" && b.category !== "front_panel");
  const r1 = (v) => Math.round(v * 10) / 10;
  return columns.map((col) => {
    const width = r1(col.x1 - col.x0);
    const left = panels.filter((p) => p.x1 <= col.x0 + 0.8 || p.x0 - 0.2 <= col.x0 && col.x0 <= p.x1 + 0.2).sort((a, b) => b.x0 + b.x1 - (a.x0 + a.x1))[0];
    const right = panels.filter((p) => p.x0 >= col.x1 - 0.8 || p.x0 - 0.2 <= col.x1 && col.x1 <= p.x1 + 0.2).sort((a, b) => a.x0 + a.x1 - (b.x0 + b.x1))[0];
    if (!left || !right) return { id: col.id, width, clear: width, center: width };
    return {
      id: col.id,
      width,
      clear: r1(right.x0 - left.x1),
      center: r1((right.x0 + right.x1) / 2 - (left.x0 + left.x1) / 2)
    };
  });
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
function gapMarks(gaps, toX, toY, scale, mode = "clear", opts = {}) {
  const kind = mode === "center" ? "center" : "clear";
  const color = kind === "center" ? "#e0a34f" : "#8ec5ef";
  const specs = gaps.map((g) => {
    const from = kind === "center" ? g.aMid : g.aHi;
    const to = kind === "center" ? g.bMid : g.bLo;
    return {
      axis: g.axis,
      from,
      to,
      edgeLo: g.crossLo,
      edgeHi: g.crossHi,
      text: fmt(kind === "center" ? g.center : g.clear),
      color
    };
  }).filter((s) => Math.abs(s.to - s.from) * scale >= 18);
  return layoutDimensions([...specs, ...opts.extra ?? []], toX, toY, opts.avoid ?? []);
}
function svgRoot(width, height, data, aria, body) {
  const d = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}" ${d} font-family="${PV.font}"><rect x="0" y="0" width="${width}" height="${height}" fill="${PV.bg}" />` + body + `</svg>`;
}

// generators/kitchen/svgPreview.ts
function notchFloorCorner(panel) {
  const pv = panel.profileVector ?? [];
  if (panel.profilePlane !== "XZ") return null;
  const pts = pv.map((p) => ({ x: Number(p.x), z: Number(p.z) })).filter((p) => Number.isFinite(p.x) && Number.isFinite(p.z));
  if (pts.length < 4) return null;
  const zTop = Math.max(...pts.map((p) => p.z));
  const zBot = Math.min(...pts.map((p) => p.z));
  const floor = pts.filter((p) => p.z > zBot + 0.4 && p.z < zTop - 0.4);
  if (!floor.length) return null;
  const z = Math.min(...floor.map((p) => p.z));
  const at = floor.filter((p) => Math.abs(p.z - z) < 0.4);
  const xMin = Math.min(...pts.map((p) => p.x));
  const xMax = Math.max(...pts.map((p) => p.x));
  const onEdge = at.find((p) => Math.abs(p.x - xMin) < 0.4 || Math.abs(p.x - xMax) < 0.4);
  return { x: onEdge ? onEdge.x : at[0].x, z };
}
var KITCHEN_ZONE_LABELS = {
  left_door: "Door \xB7 hinge left",
  right_door: "Door \xB7 hinge right",
  double_door: "Double door",
  drawer: "Drawer",
  open: "Open",
  down_flap: "Down flap",
  stove: "Stove",
  custom: "Custom",
  unassigned: "Unassigned"
};
function generateKitchenSvgPreview(result, options = {}) {
  if (!result || !result.boards.length) return null;
  const W = result.params.length;
  const H = result.params.height;
  const BCH = result.params.bottomClearanceHeight;
  if (!(W > 0) || !(H > 0)) return null;
  const columns = result.debug?.columns ?? [];
  if (!columns.length) return null;
  const bench = result.boards.find((b) => b.id === "BENCH");
  const fall = result.boards.find((b) => b.id === "WATERFALL");
  const bodyX0 = columns[0].x0;
  const bodyX1 = columns[columns.length - 1].x1;
  const xHi = Math.max(bodyX1, bench?.x1 ?? 0, fall?.x1 ?? 0);
  const xLo = Math.min(bodyX0, bench?.x0 ?? 0, fall?.x0 ?? 0);
  const avoidances = result.debug?.avoidances ?? [];
  const split = result.debug?.split;
  const splitX = split && Number.isFinite(split.x) ? Number(split.x) : null;
  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selZone = options.selectedZoneId ?? null;
  const selCol = options.selectedCol ?? -1;
  const rise = bench ? Math.max(0, bench.z1 - H) : 0;
  const span = Math.max(xHi - xLo, 1);
  const fitted = fitCanvas(span, H, width, options.maxHeight ?? 520, { l: 44, r: 16, t: splitX != null ? 36 : 14, b: showDimensions ? 40 : 14 });
  const extra = rise > 0 ? Math.ceil(rise * fitted.scale) + 6 : 0;
  const scale = fitted.scale;
  const ox = fitted.ox;
  const oy = fitted.oy + extra;
  const height = fitted.height + extra;
  const toX = (x) => ox + (x - xLo) * scale;
  const toY = (z) => oy + (H - z) * scale;
  const rect = (x0, x1, z0, z1) => `x="${px(toX(x0))}" y="${px(toY(z1))}" width="${px(Math.max((x1 - x0) * scale, 0.8))}" height="${px(Math.max((z1 - z0) * scale, 0.8))}"`;
  const isSel = (ci, id) => id === selZone && (selCol < 0 || selCol === ci);
  const parts = [];
  const stoveDims = [];
  const avoidText = [];
  const reserve = (x, y, text, size) => {
    const w = text.length * size * 0.62 + 4;
    const h = size + 6;
    avoidText.push({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
  };
  const stripPoints = (b) => {
    const pv = b.profileVector ?? [];
    if (b.profilePlane !== "XZ" || pv.length < 4) return "";
    return pv.filter((p) => Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.z))).map((p) => `${px(toX(Number(p.x)))},${px(toY(Number(p.z)))}`).join(" ");
  };
  const stripPoly = (b, emphasize) => {
    const points = stripPoints(b);
    if (!points) return "";
    return `<polygon data-board="${b.id}" pointer-events="none" points="${points}" fill="${PV.front}" fill-opacity="${emphasize ? 0.95 : 0.55}" stroke="${emphasize ? "#f4fbff" : PV.frontLine}" stroke-width="${emphasize ? 1.75 : 0.75}" />`;
  };
  parts.push(`<rect ${rect(0, W, 0, BCH)} fill="rgba(255,255,255,0.025)" stroke="none" pointer-events="none" />`);
  columns.forEach((col, ci) => {
    for (const z of col.zones) {
      parts.push(`<rect class="region" data-zone="${z.id}" data-col="${ci}" ${rect(col.x0, col.x1, z.z0, z.z1)} fill="${zoneColor(z.zoneType)}" stroke="none" />`);
    }
  });
  const boards = [...result.boards].sort((a, b) => b.y0 - a.y0);
  for (const b of boards) {
    const r = frontRect(b);
    if (!r || r.x1 - r.x0 < 0.1 || r.z1 - r.z0 < 0.1) continue;
    if (b.boardType === "bench_top" || b.boardType === "bench_waterfall") {
      if (b.profilePlane === "XZ") {
        const poly = stripPoly(b, b.boardType === "bench_waterfall");
        if (poly) parts.push(poly);
        continue;
      }
    }
    if (b.boardType === "stove_side_panel") {
      const poly = stripPoly(b, false);
      if (poly) parts.push(poly);
      continue;
    }
    const door = b.stock?.kind === "door";
    const isFront = b.y0 < -0.01;
    parts.push(
      `<rect data-board="${b.id}" pointer-events="none" ${rect(r.x0, r.x1, r.z0, r.z1)} fill="${door ? PV.front : PV.carcass}" fill-opacity="${isFront ? 0.55 : 0.92}" stroke="${door ? PV.frontLine : PV.carcassLine}" stroke-width="0.75" />`
    );
  }
  for (const av of avoidances) {
    if (!(av.x1 > av.x0) || !(av.height > 0)) continue;
    parts.push(`<rect ${rect(av.x0, av.x1, 0, av.height)} fill="${PV.warn}" fill-opacity="0.10" stroke="${PV.warn}" stroke-dasharray="4 3" pointer-events="none" />`);
    if ((av.x1 - av.x0) * scale > 34) parts.push(label(toX((av.x0 + av.x1) / 2), toY(av.height) + 9, `wheel ${fmt(av.height)}`, { size: 9, fill: "#f08a8d" }));
  }
  columns.forEach((col) => {
    for (const z of col.zones) {
      parts.push(`<rect pointer-events="none" ${rect(col.x0, col.x1, z.z0, z.z1)} fill="${zoneColor(z.zoneType)}" fill-opacity="0.28" stroke="none" />`);
    }
  });
  columns.forEach((col, ci) => {
    const z = col.zones.find((zz) => isSel(ci, zz.id));
    if (z) parts.push(selectRect(rect(col.x0, col.x1, z.z0, z.z1)));
  });
  for (const h of result.hinges) {
    parts.push(`<circle cx="${px(toX(h.centerX))}" cy="${px(toY(h.centerZ))}" r="${px(Math.max(h.diameter / 2 * scale, 2.5))}" fill="none" stroke="#f4fbff" stroke-width="1.5" pointer-events="none" />`);
  }
  for (const l of result.locks) {
    const w = Math.max(l.width * scale, 4);
    const h = Math.max(l.height * scale, 2.5);
    parts.push(`<rect x="${px(toX(l.centerX) - w / 2)}" y="${px(toY(l.centerZ) - h / 2)}" width="${px(w)}" height="${px(h)}" rx="${px(h / 2)}" fill="${PV.lock}" fill-opacity="0.85" stroke="none" pointer-events="none" />`);
  }
  for (const b of result.boards) {
    if (b.boardType !== "stove_side_panel") continue;
    const poly = stripPoly(b, true);
    if (poly) parts.push(poly);
  }
  for (const col of columns) {
    const w = (col.x1 - col.x0) * scale;
    for (const z of col.zones) {
      const h = (z.z1 - z.z0) * scale;
      if (h < 14 || w < 36) continue;
      const name = KITCHEN_ZONE_LABELS[z.zoneType] ?? z.zoneType;
      const short = w < 90 ? name.replace("Door \xB7 hinge ", "Door ").replace("Double door", "Double") : name;
      if (h >= 36) {
        const nameX = toX((col.x0 + col.x1) / 2);
        const nameY = toY(z.z1) + 12;
        parts.push(label(nameX, nameY, short, { size: 11, fill: z.zoneType === "unassigned" ? "#f08a8d" : PV.text }));
        reserve(nameX, nameY, short, 11);
      }
      if (z.zoneType !== "stove") continue;
      const strips = result.boards.filter((b) => b.boardType === "stove_side_panel" && b.id.includes(`-${z.id}-`)).slice().sort((a, b) => a.x0 - b.x0);
      if (strips.length < 2) continue;
      const left = strips[0];
      const right = strips[strips.length - 1];
      const gap = right.x0 - left.x1;
      stoveDims.push({
        axis: "x",
        from: left.x1,
        to: right.x0,
        edgeLo: Math.min(left.z0, right.z0),
        edgeHi: Math.max(left.z1, right.z1),
        text: fmt(gap),
        color: "#d8dde4",
        priority: 0
      });
      const shelf = result.boards.find((b) => b.boardType === "stove_full_shelf" && b.id.includes(`-${z.id}-`));
      const corner = notchFloorCorner(left);
      if (shelf && corner && corner.z > shelf.z1 + 0.5) {
        stoveDims.push({
          axis: "z",
          from: shelf.z1,
          to: corner.z,
          edgeLo: corner.x,
          edgeHi: right.x0,
          text: fmt(corner.z - shelf.z1),
          color: "#d8dde4",
          priority: 0
        });
      }
    }
  }
  if (BCH * scale >= 11) {
    const kick = `kick ${fmt(BCH)}`;
    const kx = toX(0) + 6;
    const ky = toY(BCH / 2);
    parts.push(label(kx, ky, kick, { size: 9, fill: PV.text2, anchor: "start" }));
    const kw = kick.length * 9 * 0.62;
    avoidText.push({ x0: kx, y0: ky - 8, x1: kx + kw, y1: ky + 8 });
  }
  parts.push(`<rect ${rect(bodyX0, bodyX1, 0, H)} fill="none" stroke="${PV.envelope}" stroke-width="1.25" pointer-events="none" />`);
  for (let i = 0; i < columns.length - 1; i += 1) {
    const x = toX(columns[i].x1);
    parts.push(grip(`data-boundary="column" data-axis="x" data-index="${i}"`, x, toY(H), x, toY(BCH)));
  }
  columns.forEach((col, ci) => {
    for (let zi = 0; zi < col.zones.length - 1; zi += 1) {
      const y = toY(col.zones[zi].z0);
      parts.push(grip(`data-boundary="zone" data-axis="z" data-col="${ci}" data-index="${zi}"`, toX(col.x0) + 3, y, toX(col.x1) - 3, y));
    }
  });
  if (splitX != null) {
    const x = toX(splitX);
    const y = toY(H) - 16;
    const arm = 18;
    const head = 6;
    parts.push(
      `<line x1="${px(x)}" y1="${px(toY(H))}" x2="${px(x)}" y2="${px(toY(BCH))}" stroke="#7eb6ff" stroke-width="1.25" stroke-dasharray="3 3" pointer-events="none" />`
    );
    parts.push(
      `<g class="boundary split-arrow" data-boundary="split" data-axis="x"><title>Split \u2014 drag onto a line between columns</title><line x1="${px(x - arm)}" y1="${px(y)}" x2="${px(x + arm)}" y2="${px(y)}" stroke="#7eb6ff" stroke-width="2" /><polygon points="${px(x - arm)},${px(y)} ${px(x - arm + head)},${px(y - head)} ${px(x - arm + head)},${px(y + head)}" fill="#7eb6ff" /><polygon points="${px(x + arm)},${px(y)} ${px(x + arm - head)},${px(y - head)} ${px(x + arm - head)},${px(y + head)}" fill="#7eb6ff" /><line class="hit" x1="${px(x - arm)}" y1="${px(y)}" x2="${px(x + arm)}" y2="${px(y)}" stroke="transparent" stroke-width="14" pointer-events="stroke" /></g>`
    );
  }
  if (showDimensions) {
    parts.push(spacedLabels([
      { y: toY(0), text: "0", fill: PV.text3 },
      { y: toY(BCH), text: fmt(BCH), fill: PV.text3 },
      { y: toY(H), text: fmt(H), fill: PV.text3 }
    ], ox - 6, "end"));
    const openings = columnOpenings(columns, result.boards);
    const centerRead = (options.gaps ?? "clear") === "center";
    const yb = toY(0) + 12;
    columns.forEach((col, ci) => {
      const x0 = toX(col.x0);
      const x1 = toX(col.x1);
      const reading = openings[ci];
      const shown = centerRead ? reading.center : reading.clear;
      parts.push(`<line x1="${px(x0)}" y1="${px(yb - 4)}" x2="${px(x0)}" y2="${px(yb + 4)}" stroke="${PV.text3}" pointer-events="none" />`);
      parts.push(`<line x1="${px(x1)}" y1="${px(yb - 4)}" x2="${px(x1)}" y2="${px(yb + 4)}" stroke="${PV.text3}" pointer-events="none" />`);
      if (x1 - x0 >= 24) {
        const text = fmt(shown);
        const hit = Math.max(36, text.length * 8);
        const mid = (x0 + x1) / 2;
        const editable = columns.length > 1;
        parts.push(
          `<g class="col-dim${editable ? " editable" : ""}" data-col="${ci}" data-width="${reading.width}" data-clear="${reading.clear}" data-center="${reading.center}"><title>${centerRead ? "Centre to centre" : "Clearance"} \xB7 click to type</title>` + (editable ? `<rect x="${px(mid - hit / 2)}" y="${px(yb - 9)}" width="${hit}" height="18" fill="transparent" />` : "") + `<text x="${px(mid)}" y="${px(yb)}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="${editable ? PV.boundary : PV.text2}" pointer-events="none">${text}</text></g>`
        );
        reserve(mid, yb, text, 10);
      }
    });
    const summary = `W ${fmt(xHi - xLo)} \xB7 H ${fmt(H)} \xB7 ${columns.length} column${columns.length === 1 ? "" : "s"}`;
    const sy = yb + 22;
    parts.push(dimText(toX((xLo + xHi) / 2), sy, summary, "middle", PV.text3));
    reserve(toX((xLo + xHi) / 2), sy, summary, 10);
  }
  parts.push(gapMarks(boardGaps(result.boards), toX, toY, scale, options.gaps ?? "clear", { extra: stoveDims, avoid: avoidText }));
  return svgRoot(width, height, { scale, ox, oy, w: W, h: H }, "Kitchen base front elevation", parts.join(""));
}

// generators/kitchen/generator.ts
var asNum = (v, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
var r2 = (v) => Math.round(v * 1e3) / 1e3;
var round12 = (v) => Math.round(v * 10) / 10;
var EPS3 = 1e-3;
function noteBenchSheet(issues, board, alongAxis = "x") {
  if (!board) return;
  const along = round12(alongAxis === "z" ? board.z1 - board.z0 : board.x1 - board.x0);
  const across = round12(board.y1 - board.y0);
  if (across > SHEET_CROSS_MAX_MM) {
    issues.push({
      board: board.id,
      group: "front",
      dir: "horizontal",
      side: "across",
      length: across,
      word: "deep",
      limit: SHEET_CROSS_MAX_MM,
      message: `${board.id} is ${across} deep: horizontal grain allows ${SHEET_CROSS_MAX_MM} across the grain (sheet 1200 \xD7 2400)`
    });
  }
  if (along > SHEET_ALONG_MAX_MM) {
    issues.push({
      board: board.id,
      group: "front",
      dir: "horizontal",
      side: "along",
      length: along,
      word: "wide",
      limit: SHEET_ALONG_MAX_MM,
      message: `${board.id} is ${along} wide: horizontal grain allows ${SHEET_ALONG_MAX_MM} along the grain (sheet 1200 \xD7 2400)`
    });
  }
}
var DEFAULT_SIDE = {
  panelType: "carcass",
  frontVisible: false,
  bchNotchEnabled: true,
  grooveVisible: true,
  extendT2T3B4ToOuterFace: true,
  strengtheningStripEnabled: false
};
var PANEL_ZONE_TYPES = /* @__PURE__ */ new Set(["left_door", "right_door", "double_door", "drawer", "down_flap"]);
var VISIBLE_ZONE_TYPES = /* @__PURE__ */ new Set(["left_door", "right_door", "double_door", "down_flap", "open", "custom"]);
var DRAWER_BOTTOM_TYPES = /* @__PURE__ */ new Set(["drawer", "down_flap"]);
var FULL_SHELF_TYPES = /* @__PURE__ */ new Set(["left_door", "right_door", "double_door", "open", "stove", "custom"]);
function pickSideOptions(col, side) {
  const key = side === "left" ? "leftSidePanelOptions" : "rightSidePanelOptions";
  const zonesWith = col.zones.filter((z) => z[key] != null);
  let zone = zonesWith.find((z) => PANEL_ZONE_TYPES.has(z.zoneType));
  if (!zone) zone = zonesWith.find((z) => z.zoneType === "open" || z.zoneType === "custom");
  if (!zone) zone = zonesWith[0] ?? col.zones[0];
  return { ...DEFAULT_SIDE, ...zone?.[key] ?? {} };
}
function normalize(input) {
  const gs = input.globalSettings ?? {};
  const length = asNum(gs.length, 0);
  const D2 = asNum(gs.depth, 0);
  const H = asNum(gs.height, 0);
  const askedFall = input.waterfall === "left" || input.waterfall === "right" ? input.waterfall : null;
  const waterfall = input.baseKind === "ensuite" ? null : askedFall;
  const x0 = waterfall === "left" ? RULES.BENCH_THICKNESS_MM.value : 0;
  const W = r2(x0 + length);
  const CPT = asNum(input.materialThickness, 15);
  const FPT = asNum(input.frontThickness, 16);
  const fc = asNum(input.frontClearance, RULES.FRONT_CLEARANCE.value);
  const BCH = asNum(input.bottomClearanceHeight, 70);
  const style2 = input.bottomClearanceStyle === "style_2";
  const columns = [];
  let x = x0;
  for (const c of input.columns ?? []) {
    const width = asNum(c.width, 0);
    const zones = [];
    let z = H;
    for (const zone of c.zones ?? []) {
      const zh = asNum(zone.height, 0);
      zones.push({
        id: zone.id,
        zoneType: zone.zoneType ?? "unassigned",
        z0: r2(z - zh),
        z1: r2(z),
        height: zh,
        shelfEnabled: zone.shelfEnabled !== false,
        shelfHeight: zone.shelfHeight,
        hingeSettings: {
          sideDistance: asNum(zone.hingeSettings?.sideDistance, NaN),
          cupDiameter: asNum(zone.hingeSettings?.cupDiameter, RULES.HINGE_CUP_DIAMETER.value),
          cupDepth: asNum(zone.hingeSettings?.cupDepth, RULES.HINGE_CUP_DEPTH.value),
          cupCenterFromEdge: asNum(zone.hingeSettings?.cupCenterFromEdge, RULES.HINGE_CUP_FROM_EDGE.value),
          useThreeHinges: zone.hingeSettings?.useThreeHinges === true
        },
        lockEnabled: zone.lockEnabled !== false,
        withSink: zone.withSink === true,
        lockSideCenterOffset: asNum(zone.lockSideCenterOffset, RULES.LOCK_SIDE_OFFSET.value),
        leftSidePanelOptions: zone.leftSidePanelOptions,
        rightSidePanelOptions: zone.rightSidePanelOptions,
        applianceFloorEnabled: zone.applianceFloorEnabled === true
      });
      z = r2(z - zh);
    }
    columns.push({ id: c.id, x0: r2(x), x1: r2(x + width), width, zones });
    x += width;
  }
  const asked = input.splitAfter;
  const askedN = asked == null || asked === "" ? null : Math.round(Number(asked));
  const splitAfter = askedN != null && Number.isInteger(askedN) && askedN >= 0 && askedN <= columns.length - 2 ? askedN : null;
  const s = {
    W,
    length,
    x0,
    waterfall,
    waterfallRejected: input.baseKind === "ensuite" && askedFall != null,
    D: D2,
    H,
    CPT,
    FPT,
    fc,
    lockOn: input.lockEnabled !== false,
    BCH,
    style2,
    columns,
    xBoundaries: [x0, ...columns.map((c) => c.x1)],
    leftOpts: DEFAULT_SIDE,
    rightOpts: DEFAULT_SIDE,
    cd: r2(D2 - FPT),
    baseKind: input.baseKind === "ensuite" ? "ensuite" : "kitchen",
    splitAfter,
    splitRejected: askedN != null && splitAfter == null,
    avoidances: (input.wheelAvoidances ?? []).map((a) => ({
      id: a.id,
      x0: Math.round(asNum(a.x0, 0)),
      x1: Math.round(asNum(a.x1, 0)),
      height: Math.round(asNum(a.height, 0)),
      depth: Math.round(asNum(a.depth, 0))
    })),
    prefs: new Map((input.vPanelMachiningPreferences ?? []).map((p) => [p.vPanelIndex, p.mode]))
  };
  if (columns.length) {
    s.leftOpts = pickSideOptions(columns[0], "left");
    s.rightOpts = pickSideOptions(columns[columns.length - 1], "right");
  }
  return s;
}
function validate(s, errors, warnings) {
  if (s.W <= 0 || s.cd <= 0 || s.H <= 0 || s.CPT <= 0) errors.push("Invalid global dimensions.");
  if (s.BCH < 0 || s.BCH >= s.H) errors.push("Bottom clearance height must be within [0, height).");
  if (!s.columns.length) errors.push("At least one column is required.");
  for (const col of s.columns) {
    if (col.x1 - col.x0 - s.CPT * 2 <= 0) errors.push(`Column ${col.id} has non-positive clear width.`);
    const zoneSum = col.zones.reduce((a, z) => a + z.height, 0);
    if (Math.abs(zoneSum - (s.H - s.BCH)) > 0.01) {
      warnings.push(`Column ${col.id}: zone heights sum ${r2(zoneSum)} \u2260 H \u2212 BCH (${r2(s.H - s.BCH)}).`);
    }
    for (const z of col.zones) {
      if (z.zoneType === "unassigned") errors.push(`Zone ${z.id} in column ${col.id} has no zone type.`);
      if (s.baseKind === "ensuite" && z.zoneType === "stove") {
        errors.push(`Ensuite has no stove \u2014 zone ${z.id} in column ${col.id}.`);
      }
      if (z.zoneType === "stove" && z !== col.zones[0]) {
        errors.push(`Stove zone ${z.id} must be the top zone in column ${col.id}.`);
      }
    }
  }
  for (const a of s.avoidances) {
    if (a.height < s.BCH) warnings.push(`Wheel avoidance ${a.id} height is below BCH; V panels conflict with the bottom system.`);
    if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) warnings.push(`Wheel avoidance ${a.id} bounds invalid; skipped.`);
  }
  if (s.waterfallRejected) errors.push("Waterfall is only on a kitchen.");
  if (s.splitRejected) warnings.push("Split Kitchen needs a line between two columns.");
  const sheet = RULES.RUN_SHEET_MAX_MM.value;
  if (s.splitAfter == null && s.length > sheet) {
    warnings.push(`This run is ${r2(s.length)} mm long. A board over ${sheet} mm cannot be cut \u2014 split the kitchen.`);
  } else if (s.splitAfter != null) {
    const xb = s.xBoundaries[s.splitAfter + 1];
    const left = r2(xb - s.x0);
    const right = r2(s.W - xb);
    if (left > sheet) warnings.push(`The left side of the split is ${left} mm. A board over ${sheet} mm cannot be cut.`);
    if (right > sheet) warnings.push(`The right side of the split is ${right} mm. A board over ${sheet} mm cannot be cut.`);
  }
}
var planned = /* @__PURE__ */ new Map();
function resetPlans() {
  planned = /* @__PURE__ */ new Map();
}
function plan(id, faces) {
  planned.set(id, { ...planned.get(id), ...faces });
  for (const [face, e] of Object.entries(faces)) {
    dim(`${id}.${face}`, e.terms, e.fn, { formula: e.formula });
  }
}
function flushPlans() {
  for (const [id, faces] of planned) {
    for (const [face, e] of Object.entries(faces)) dim(`${id}.${face}`, e.terms, e.fn, { formula: e.formula });
  }
}
function link(key) {
  return ex({ v: ref(key) }, (t) => t.v, `= ${key}`);
}
function qRound(e, formula) {
  return { terms: e.terms, fn: (t) => Math.round(e.fn(t) * 1e3) / 1e3, formula: formula ?? e.formula };
}
function loopPts(id, axes, pairs, round = false) {
  return recordLoop(id, axes, pairs, round).map(([u, v]) => ({ [axes[0]]: u, [axes[1]]: v }));
}
function traceLocalRect(id, axes, w, h) {
  const o = lit(0);
  return loopPts(id, axes, [[o, o], [w, o], [w, h], [o, h], [o, o]]);
}
function rectXZ(w, h) {
  return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: h }, { x: 0, z: h }, { x: 0, z: 0 }];
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
    profileVector: profileVector.map((p) => ({ ...p }))
  };
}
function edgeNotchRect(x0, x1, v0, h, notches, d, edge, mk, trace) {
  const id = trace?.id;
  if (trace && id) {
    dim(`${id}.q.x0`, trace.x0.terms, trace.x0.fn, { formula: trace.x0.formula });
    dim(`${id}.q.x1`, trace.x1.terms, trace.x1.fn, { formula: trace.x1.formula });
    dim(`${id}.q.yN`, trace.yN.terms, trace.yN.fn, { formula: trace.yN.formula });
    dim(`${id}.q.h`, trace.h.terms, trace.h.fn, { formula: trace.h.formula });
    dim(`${id}.q.d`, trace.d.terms, trace.d.fn, { formula: trace.d.formula });
    dim(`${id}.q.yF`, { yN: ref(`${id}.q.yN`), h: ref(`${id}.q.h`) }, (t) => t.yN + t.h, { formula: "yN + h" });
    trace.notches.forEach((n, i) => {
      dim(`${id}.q.n${i}.a`, n.a.terms, n.a.fn, { formula: n.a.formula });
      dim(`${id}.q.n${i}.b`, n.b.terms, n.b.fn, { formula: n.b.formula });
    });
  }
  const X0 = id ? link(`${id}.q.x0`) : lit(x0);
  const X1 = id ? link(`${id}.q.x1`) : lit(x1);
  const YN = id ? link(`${id}.q.yN`) : lit(v0);
  const YF = id ? link(`${id}.q.yF`) : lit(v0 + h);
  const yFd = id ? ex({ yF: ref(`${id}.q.yF`), d: ref(`${id}.q.d`) }, (t) => t.yF - t.d, "yF - d") : lit(v0 + h - d);
  const yNd = id ? ex({ yN: ref(`${id}.q.yN`), d: ref(`${id}.q.d`) }, (t) => t.yN + t.d, "yN + d") : lit(v0 + d);
  const clipA = (i) => ex(
    { a: ref(`${id}.q.n${i}.a`), x0: ref(`${id}.q.x0`) },
    (t) => Math.max(t.a, t.x0),
    "max(a, x0)"
  );
  const clipB = (i) => ex(
    { b: ref(`${id}.q.n${i}.b`), x1: ref(`${id}.q.x1`) },
    (t) => Math.min(t.b, t.x1),
    "min(b, x1)"
  );
  const N = notches.map(([a, b], i) => ({ a: Math.max(a, x0), b: Math.min(b, x1), ea: id ? clipA(i) : lit(a), eb: id ? clipB(i) : lit(b) })).filter((n) => n.b - n.a > EPS3).sort((p, q) => p.a - q.a);
  const yN = v0, yF = v0 + h;
  const pairs = [];
  const pts = [];
  const push = (u, v, eu, ev) => {
    pts.push(mk(u, v));
    pairs.push([eu, ev]);
  };
  if (edge === "far") {
    push(x0, yN, X0, YN);
    push(x1, yN, X1, YN);
    let zr = yF;
    let zrE = YF;
    if (N.length && N[N.length - 1].b >= x1 - EPS3) {
      zr = yF - d;
      zrE = yFd;
    }
    push(x1, zr, X1, zrE);
    let cur = x1;
    for (let i = N.length - 1; i >= 0; i--) {
      const { a, b, ea, eb } = N[i];
      if (b >= x1 - EPS3) {
        push(a, yF - d, ea, yFd);
        push(a, yF, ea, YF);
      } else if (a <= x0 + EPS3) {
        push(b, yF, eb, YF);
        push(b, yF - d, eb, yFd);
        push(x0, yF - d, X0, yFd);
        cur = x0;
        break;
      } else {
        push(b, yF, eb, YF);
        push(b, yF - d, eb, yFd);
        push(a, yF - d, ea, yFd);
        push(a, yF, ea, YF);
      }
      cur = a;
    }
    if (cur > x0 + EPS3) push(x0, yF, X0, YF);
    push(x0, yN, X0, YN);
  } else {
    const startLift = N.length && N[0].a <= x0 + EPS3;
    push(x0, startLift ? yN + d : yN, X0, startLift ? yNd : YN);
    let cur = x0;
    for (const { a, b, ea, eb } of N) {
      if (a <= x0 + EPS3) {
        push(b, yN + d, eb, yNd);
        push(b, yN, eb, YN);
      } else if (b >= x1 - EPS3) {
        push(a, yN, ea, YN);
        push(a, yN + d, ea, yNd);
        push(x1, yN + d, X1, yNd);
        cur = x1;
        break;
      } else {
        push(a, yN, ea, YN);
        push(a, yN + d, ea, yNd);
        push(b, yN + d, eb, yNd);
        push(b, yN, eb, YN);
      }
      cur = b;
    }
    if (cur < x1 - EPS3) push(x1, yN, X1, YN);
    push(x1, yF, X1, YF);
    push(x0, yF, X0, YF);
    push(x0, startLift ? yN + d : yN, X0, startLift ? yNd : YN);
  }
  if (trace) {
    const rec = recordLoop(trace.id, trace.axes, pairs, true);
    if (rec.length !== pts.length) throw new Error(`${trace.id} trace length ${rec.length} != ${pts.length}`);
    pts.forEach((p, i) => {
      const got = p;
      const av = got[trace.axes[0]];
      const bv = got[trace.axes[1]];
      if (Math.abs(rec[i][0] - av) > 1e-6 || Math.abs(rec[i][1] - bv) > 1e-6) {
        throw new Error(`${trace.id} pv[${i}] ${rec[i][0]},${rec[i][1]} != ${av},${bv}`);
      }
    });
  }
  return pts;
}
function xyNotch(id, x0, x1, y0, h, notches, d, edge) {
  return edgeNotchRect(
    evalExpr(x0),
    evalExpr(x1),
    evalExpr(y0),
    evalExpr(h),
    notches.map((n) => [evalExpr(n.a), evalExpr(n.b)]),
    evalExpr(d),
    edge,
    (u, v) => ({ x: r2(u), y: r2(v) }),
    { id, axes: ["x", "y"], x0, x1, yN: y0, h, d, notches }
  );
}
function xzNotch(id, x0, x1, z0, h, notches, d, edge) {
  return edgeNotchRect(
    evalExpr(x0),
    evalExpr(x1),
    evalExpr(z0),
    evalExpr(h),
    notches.map((n) => [evalExpr(n.a), evalExpr(n.b)]),
    evalExpr(d),
    edge,
    (u, v) => ({ x: r2(u), z: r2(v) }),
    { id, axes: ["x", "z"], x0, x1, yN: z0, h, d, notches }
  );
}
function buildVPanels(s) {
  const vs = [];
  const n = s.columns.length;
  const leftDoor = s.leftOpts.panelType === "door";
  const rightDoor = s.rightOpts.panelType === "door";
  const push = (v, faces) => {
    const index = vs.length;
    const id = `V${index}`;
    vs.push({ ...v, index, id });
    plan(id, faces);
  };
  push({
    x0: 0,
    x1: r2(leftDoor ? s.FPT : s.CPT),
    thickness: leftDoor ? s.FPT : s.CPT,
    kind: leftDoor ? "door" : "carcass",
    leftNeighborCol: -1,
    rightNeighborCol: 0,
    frontVisible: s.leftOpts.frontVisible,
    grooveVisible: s.leftOpts.grooveVisible,
    bchNotch: s.leftOpts.bchNotchEnabled
  }, {
    x0: lit(0),
    x1: leftDoor ? link("kitchen.FPT") : link("kitchen.CPT")
  });
  for (let i = 1; i < n; i++) {
    const xb = s.xBoundaries[i];
    const col = s.columns[i - 1];
    const boundary = ref(`kitchen.col.${col.id}.x1`);
    const atBoundary = ex({ xb: boundary }, (t) => t.xb, `= kitchen.col.${col.id}.x1`);
    if (s.splitAfter === i - 1) {
      push({
        x0: r2(xb - s.CPT),
        x1: xb,
        thickness: s.CPT,
        kind: "carcass",
        leftNeighborCol: i - 1,
        rightNeighborCol: -1,
        frontVisible: false,
        grooveVisible: true,
        bchNotch: true
      }, {
        x0: qRound(ex({ xb: boundary, CPT: ref("kitchen.CPT") }, (t) => t.xb - t.CPT), "boundary - CPT"),
        x1: atBoundary
      });
      push({
        x0: xb,
        x1: r2(xb + s.CPT),
        thickness: s.CPT,
        kind: "carcass",
        leftNeighborCol: -1,
        rightNeighborCol: i,
        frontVisible: false,
        grooveVisible: true,
        bchNotch: true
      }, {
        x0: atBoundary,
        x1: qRound(ex({ xb: boundary, CPT: ref("kitchen.CPT") }, (t) => t.xb + t.CPT), "boundary + CPT")
      });
      continue;
    }
    push({
      x0: r2(xb - s.CPT / 2),
      x1: r2(xb + s.CPT / 2),
      thickness: s.CPT,
      kind: "carcass",
      leftNeighborCol: i - 1,
      rightNeighborCol: i,
      frontVisible: false,
      grooveVisible: true,
      bchNotch: true
    }, {
      x0: qRound(ex({ xb: boundary, CPT: ref("kitchen.CPT") }, (t) => t.xb - t.CPT / 2), "boundary - CPT / 2"),
      x1: qRound(ex({ xb: boundary, CPT: ref("kitchen.CPT") }, (t) => t.xb + t.CPT / 2), "boundary + CPT / 2")
    });
  }
  push({
    x0: r2(s.W - (rightDoor ? s.FPT : s.CPT)),
    x1: s.W,
    thickness: rightDoor ? s.FPT : s.CPT,
    kind: rightDoor ? "door" : "carcass",
    leftNeighborCol: n - 1,
    rightNeighborCol: -1,
    frontVisible: s.rightOpts.frontVisible,
    grooveVisible: s.rightOpts.grooveVisible,
    bchNotch: s.rightOpts.bchNotchEnabled
  }, {
    x1: link("kitchen.W"),
    x0: qRound(ex({ W: ref("kitchen.W"), t: rightDoor ? ref("kitchen.FPT") : ref("kitchen.CPT") }, (t) => t.W - t.t), "W - t")
  });
  return vs;
}
function columnV(vPanels, ci) {
  const left = vPanels.find((v) => v.rightNeighborCol === ci);
  const right = vPanels.find((v) => v.leftNeighborCol === ci);
  return {
    left: left ?? vPanels[Math.min(ci, vPanels.length - 1)],
    right: right ?? vPanels[Math.min(ci + 1, vPanels.length - 1)]
  };
}
function clippedAvoidances(s) {
  if (s.splitAfter == null) return s.avoidances;
  const xb = s.xBoundaries[s.splitAfter + 1];
  const out = [];
  for (const a of s.avoidances) {
    if (!(a.x1 > a.x0)) continue;
    const parts = [
      { x0: Math.max(a.x0, 0), x1: Math.min(a.x1, xb), tag: "L" },
      { x0: Math.max(a.x0, xb), x1: Math.min(a.x1, s.W), tag: "R" }
    ].filter((p) => p.x1 - p.x0 > EPS3);
    for (const p of parts) {
      out.push({
        ...a,
        id: parts.length === 1 ? a.id : `${a.id}-${p.tag}`,
        x0: r2(p.x0),
        x1: r2(p.x1)
      });
    }
  }
  return out;
}
function vPanelOutline(s, v, avoidance, omitFrontTopReceiver = false, flatStove = false) {
  const id = v.id;
  dim(`${id}.t`, v.kind === "door" ? { FPT: ref("kitchen.FPT") } : { CPT: ref("kitchen.CPT") }, v.kind === "door" ? (t) => t.FPT : (t) => t.CPT, { formula: v.kind === "door" ? "FPT" : "CPT" });
  dim(`${id}.na`, { t: ref(`${id}.t`), extra: RULES.NOTCH_ALLOWANCE_EXTRA }, (t) => t.t + t.extra, { formula: "t + NOTCH_ALLOWANCE_EXTRA" });
  const cd = link("kitchen.cd");
  const H = link("kitchen.H");
  const BCH = link("kitchen.BCH");
  const na = link(`${id}.na`);
  const recv = link("kitchen.recv");
  const bsY = link("kitchen.bsY");
  const toe = link("kitchen.toeY");
  const zero = lit(0);
  const frontY = v.frontVisible ? ex({ FPT: ref("kitchen.FPT") }, (t) => -t.FPT, "-FPT") : s.style2 ? link("kitchen.CPT") : toe;
  if (!v.frontVisible && flatStove) {
    if (avoidance) {
      dim(`${id}.avoid.h`, { h: avoidance.height }, (t) => t.h, { formula: "avoidH" });
      dim(`${id}.avoid.d`, { d: avoidance.depth }, (t) => t.d, { formula: "avoidD" });
      const ah = link(`${id}.avoid.h`);
      const ahR = ex({ ah: ref(`${id}.avoid.h`), r: ref("kitchen.recv") }, (t) => t.ah + t.r, "avoidH + r");
      const cdAd = ex({ cd: ref("kitchen.cd"), ad: ref(`${id}.avoid.d`) }, (t) => t.cd - t.ad, "cd - avoidD");
      const cdNa2 = ex({ cd: ref("kitchen.cd"), na: ref(`${id}.na`) }, (t) => t.cd - t.na, "cd - na");
      return draw([
        [frontY, zero],
        [frontY, BCH],
        [bsY, BCH],
        [bsY, BCHna],
        [zero, BCHna],
        [zero, H],
        [cd, H],
        [cd, ahR],
        [cdNa2, ahR],
        [cdNa2, ah],
        [cdAd, ah],
        [cdAd, zero],
        [frontY, zero]
      ]);
    }
    return draw([
      [frontY, zero],
      [frontY, BCH],
      [bsY, BCH],
      [bsY, BCHna],
      [zero, BCHna],
      [zero, H],
      [cd, H],
      [cd, zero],
      [frontY, zero]
    ]);
  }
  const cdNaR = ex({ cd: ref("kitchen.cd"), na: ref(`${id}.na`), r: ref("kitchen.recv") }, (t) => t.cd - t.na - t.r, "cd - na - r");
  const cdNa = ex({ cd: ref("kitchen.cd"), na: ref(`${id}.na`) }, (t) => t.cd - t.na, "cd - na");
  const Hna = ex({ H: ref("kitchen.H"), na: ref(`${id}.na`) }, (t) => t.H - t.na, "H - na");
  const Hr = ex({ H: ref("kitchen.H"), r: ref("kitchen.recv") }, (t) => t.H - t.r, "H - r");
  const BCHna = ex({ BCH: ref("kitchen.BCH"), na: ref(`${id}.na`) }, (t) => t.BCH + t.na, "BCH + na");
  const draw = (pairs) => loopPts(id, ["y", "z"], pairs);
  if (v.frontVisible) {
    if (avoidance) {
      dim(`${id}.avoid.h`, { h: avoidance.height }, (t) => t.h, { formula: "avoidH" });
      dim(`${id}.avoid.d`, { d: avoidance.depth }, (t) => t.d, { formula: "avoidD" });
      const ah = link(`${id}.avoid.h`);
      const ahR = ex({ ah: ref(`${id}.avoid.h`), r: ref("kitchen.recv") }, (t) => t.ah + t.r, "avoidH + r");
      const cdAd = ex({ cd: ref("kitchen.cd"), ad: ref(`${id}.avoid.d`) }, (t) => t.cd - t.ad, "cd - avoidD");
      return draw([
        [frontY, zero],
        [frontY, H],
        [cdNaR, H],
        [cdNaR, Hna],
        [cdNa, Hna],
        [cdNa, ahR],
        [cd, ahR],
        [cd, ah],
        [cdAd, ah],
        [cdAd, zero],
        [frontY, zero]
      ]);
    }
    if (!v.bchNotch) {
      return draw([
        [frontY, zero],
        [frontY, H],
        [cdNaR, H],
        [cdNaR, Hna],
        [cdNa, Hna],
        [cdNa, Hr],
        [cd, Hr],
        [cd, recv],
        [cdNa, recv],
        [cdNa, zero],
        [frontY, zero]
      ]);
    }
    const zExt = ex({ BCH: ref("kitchen.BCH"), t: ref(`${id}.t`), na: ref(`${id}.na`) }, (t) => t.BCH + t.t + t.na, "BCH + t + na");
    return draw([
      [frontY, zExt],
      [frontY, H],
      [recv, H],
      [recv, Hna],
      [zero, Hna],
      [zero, BCHna],
      [bsY, BCHna],
      [bsY, BCH],
      [toe, BCH],
      [toe, zero],
      [cd, zero],
      [cd, recv],
      [cdNa, recv],
      [cdNa, zero],
      [frontY, zero]
    ]);
  }
  const top = omitFrontTopReceiver ? [[zero, H]] : [[recv, Hna], [recv, H]];
  const base = [
    [frontY, zero],
    [frontY, BCH],
    [bsY, BCH],
    [bsY, BCHna],
    [zero, BCHna],
    [zero, Hna],
    ...top,
    [cdNaR, H],
    [cdNaR, Hna],
    [cdNa, Hna],
    [cdNa, Hr],
    [cd, Hr],
    [cd, recv],
    [cdNa, recv],
    [cdNa, zero],
    [frontY, zero]
  ];
  if (avoidance) {
    dim(`${id}.avoid.h`, { h: avoidance.height }, (t) => t.h, { formula: "avoidH" });
    dim(`${id}.avoid.d`, { d: avoidance.depth }, (t) => t.d, { formula: "avoidD" });
    const ah = link(`${id}.avoid.h`);
    const ahR = ex({ ah: ref(`${id}.avoid.h`), r: ref("kitchen.recv") }, (t) => t.ah + t.r, "avoidH + r");
    const cdAd = ex({ cd: ref("kitchen.cd"), ad: ref(`${id}.avoid.d`) }, (t) => t.cd - t.ad, "cd - avoidD");
    return draw([
      ...base.slice(0, 8),
      [cdNaR, H],
      [cdNaR, Hna],
      [cdNa, Hna],
      [cdNa, Hr],
      [cd, Hr],
      [cd, ahR],
      [cdNa, ahR],
      [cdNa, ah],
      [cdAd, ah],
      [cdAd, zero],
      [frontY, zero]
    ]);
  }
  return draw(base);
}
function avoidanceForV(s, v, avoidances) {
  const a = avoidances.find((a2) => a2.x0 < v.x1 && a2.x1 > v.x0 && a2.height > 0 && a2.depth > 0 && a2.x1 > a2.x0);
  return a && a.height < s.H ? { height: a.height, depth: a.depth } : void 0;
}
function screwPositions(y0, y1) {
  const L = y1 - y0;
  const off = RULES.SCREW_END_OFFSET.value;
  const S = L - 2 * off;
  if (S <= EPS3) return [r2(y0 + L / 2)];
  const n = Math.ceil(S / RULES.SCREW_MAX_SPACING.value - 1e-9);
  return Array.from({ length: n + 1 }, (_, k) => r2(y0 + off + k * S / n));
}
function neighborVisible(s, v, face, z0, z1) {
  const colIdx = face === "left" ? v.leftNeighborCol : v.rightNeighborCol;
  if (colIdx < 0) return false;
  const col = s.columns[colIdx];
  if (!col) return false;
  const hit = col.zones.find((z) => z.z1 > z0 && z.z0 < z1);
  if (!hit) return false;
  return VISIBLE_ZONE_TYPES.has(hit.zoneType);
}
var MACHINING_TABLE = {
  left_half_right_none: ["half", "none"],
  right_half_left_none: ["half", "none"],
  left_half_right_through: ["half", "through"],
  right_half_left_through: ["half", "through"],
  left_half: ["half", "none"],
  right_half: ["none", "half"],
  left_through: ["through", "none"],
  right_through: ["none", "through"],
  left_face_half_allowed: ["half", "through"],
  right_face_half_allowed: ["through", "half"],
  through_only: ["through", "through"]
};
function resolveSlots(s, requests, vPanels) {
  const slots = [];
  const screws = [];
  const tongueOf = /* @__PURE__ */ new Map();
  const byV = /* @__PURE__ */ new Map();
  for (const q of requests) {
    const e = byV.get(q.vIndex) ?? { left: [], right: [] };
    e[q.side].push(q);
    byV.set(q.vIndex, e);
  }
  const zc = RULES.SLOT_Z_CLEARANCE.value;
  for (const [vi, sides] of byV) {
    const v = vPanels[vi];
    const kind = /* @__PURE__ */ new Map();
    for (const q of [...sides.left, ...sides.right]) {
      const other = q.side === "left" ? "right" : "left";
      kind.set(q, neighborVisible(s, v, other, q.z0, q.z1) || !v.grooveVisible ? "half" : "through");
    }
    const halves = (list) => list.filter((q) => kind.get(q) === "half");
    const mode = s.prefs.get(vi);
    if (mode && halves(sides.left).length && halves(sides.right).length) {
      const [kl, kr] = MACHINING_TABLE[mode];
      for (const q of sides.left) kind.set(q, kl);
      for (const q of sides.right) kind.set(q, kr);
    } else if (!mode) {
      const hl = halves(sides.left), hr = halves(sides.right);
      if (hl.length && hr.length) {
        const area = (list) => list.reduce((a, q) => a + q.area, 0);
        for (const q of area(hl) < area(hr) ? hl : hr) kind.set(q, "none");
      }
      let changed = true;
      while (changed) {
        changed = false;
        for (const l of sides.left) {
          for (const r of sides.right) {
            if (kind.get(l) === "none" || kind.get(r) === "none") continue;
            const gap = Math.max(r.z0 - zc - (l.z1 + zc), l.z0 - zc - (r.z1 + zc));
            if (gap >= RULES.SLOT_MIN_GAP.value - EPS3) continue;
            kind.set(l.area < r.area ? l : r, "none");
            changed = true;
          }
        }
      }
    }
    const emit = (side, k, q) => {
      const boardSide = side === "right" ? "left" : "right";
      const t = tongueOf.get(q.boardId) ?? { left: 0, right: 0 };
      if (k === "none") {
        t[boardSide] = 0;
        tongueOf.set(q.boardId, t);
        dim(`kitchen.tongue.${q.boardId}.${boardSide}`, {}, () => 0, { formula: "0" });
        const z = r2((q.z0 + q.z1) / 2);
        screwPositions(q.boardY0, q.boardY1).forEach((y, i) => {
          const sid = `${q.boardId}-V${vi}-screw-${i + 1}`;
          const L = q.boardY1 - q.boardY0;
          const off = RULES.SCREW_END_OFFSET.value;
          const span = L - 2 * off;
          if (span <= EPS3) {
            dim(`kitchen.screw.${sid}.y`, { y0: q.boardY0, y1: q.boardY1 }, (t2) => Math.round((t2.y0 + (t2.y1 - t2.y0) / 2) * 1e3) / 1e3, { formula: "y0 + (y1 - y0) / 2" });
          } else {
            const n = Math.ceil(span / RULES.SCREW_MAX_SPACING.value - 1e-9);
            dim(`kitchen.screw.${sid}.y`, { y0: q.boardY0, off: RULES.SCREW_END_OFFSET, span, n, k: i }, (t2) => Math.round((t2.y0 + t2.off + t2.k * t2.span / t2.n) * 1e3) / 1e3, { formula: "y0 + endOffset + k * span / n" });
          }
          dim(`kitchen.screw.${sid}.z`, { z0: ref(`${q.boardId}.z0`), z1: ref(`${q.boardId}.z1`) }, (t2) => Math.round((t2.z0 + t2.z1) / 2 * 1e3) / 1e3, { formula: "(z0 + z1) / 2" });
          dim(`kitchen.screw.${sid}.d`, { d: RULES.SCREW_HOLE_DIAMETER }, (t2) => t2.d, { formula: "SCREW_HOLE_DIAMETER" });
          screws.push({ id: sid, vPanelId: `V${vi}`, side, forBoard: q.boardId, y, z, diameter: RULES.SCREW_HOLE_DIAMETER.value });
        });
        return;
      }
      const tongue = k === "through" ? s.CPT : v.thickness / 2;
      if (k === "through") dim(`kitchen.tongue.${q.boardId}.${boardSide}`, { CPT: ref("kitchen.CPT") }, (t2) => t2.CPT, { formula: "CPT" });
      else dim(`kitchen.tongue.${q.boardId}.${boardSide}`, { t: ref(`${v.id}.t`) }, (t2) => t2.t / 2, { formula: "t / 2" });
      const clrRule = q.isDrawer ? RULES.DRAWER_SLOT_CLEARANCE : RULES.SHELF_SLOT_CLEARANCE;
      const clr = clrRule.value;
      const slotId = `${q.boardId}-V${vi}-${side}`;
      dim(`kitchen.slot.${slotId}.y0`, { y: ref(`kitchen.ty.${q.boardId}.y0`), clr: clrRule }, (t2) => Math.round((t2.y - t2.clr) * 1e3) / 1e3, { formula: "tongueY0 - clearance" });
      dim(`kitchen.slot.${slotId}.y1`, { y: ref(`kitchen.ty.${q.boardId}.y1`), clr: clrRule }, (t2) => Math.round((t2.y + t2.clr) * 1e3) / 1e3, { formula: "tongueY1 + clearance" });
      dim(`kitchen.slot.${slotId}.z0`, { z: ref(`${q.boardId}.z0`), c: RULES.SLOT_Z_CLEARANCE }, (t2) => Math.round((t2.z - t2.c) * 1e3) / 1e3, { formula: "boardZ0 - SLOT_Z_CLEARANCE" });
      dim(`kitchen.slot.${slotId}.z1`, { z: ref(`${q.boardId}.z1`), c: RULES.SLOT_Z_CLEARANCE }, (t2) => Math.round((t2.z + t2.c) * 1e3) / 1e3, { formula: "boardZ1 + SLOT_Z_CLEARANCE" });
      slots.push({
        id: slotId,
        vPanelId: `V${vi}`,
        side,
        through: k === "through",
        depth: k === "through" ? v.thickness : v.thickness / 2,
        y0: r2(q.tongueY0 - clr),
        y1: r2(q.tongueY1 + clr),
        z0: r2(q.z0 - RULES.SLOT_Z_CLEARANCE.value),
        z1: r2(q.z1 + RULES.SLOT_Z_CLEARANCE.value),
        forBoard: q.boardId
      });
      t[boardSide] = tongue;
      tongueOf.set(q.boardId, t);
    };
    for (const q of sides.left) emit("left", kind.get(q), q);
    for (const q of sides.right) emit("right", kind.get(q), q);
  }
  return { slots, screws, tongueOf };
}
function recordColumns(s) {
  let prev = "kitchen.originX";
  dim(prev, { x0: param({ x0: s.x0 }).x0 }, (t) => t.x0, { formula: s.waterfall === "left" ? "waterfall thickness" : "0" });
  for (const col of s.columns) {
    const width = param({ width: col.width }).width;
    dim(`kitchen.col.${col.id}.x0`, { x: ref(prev) }, (t) => t.x, { formula: `= ${prev}` });
    dim(`kitchen.col.${col.id}.x1`, { x0: ref(`kitchen.col.${col.id}.x0`), width }, (t) => Math.round((t.x0 + t.width) * 1e3) / 1e3, { formula: "x0 + width" });
    prev = `kitchen.col.${col.id}.x1`;
    let zKey = "kitchen.H";
    for (const zone of col.zones) {
      const height = param({ height: zone.height }).height;
      const z1 = `kitchen.zone.${col.id}.${zone.id}.z1`;
      const z0 = `kitchen.zone.${col.id}.${zone.id}.z0`;
      dim(z1, { z: ref(zKey) }, (t) => t.z, { formula: `= ${zKey}` });
      dim(z0, { z1: ref(z1), height }, (t) => Math.round((t.z1 - t.height) * 1e3) / 1e3, { formula: "z1 - height" });
      zKey = z0;
    }
  }
}
function wheelHit(col, avoidances) {
  return avoidances.find((a) => a.x1 > a.x0 && a.height > 0 && a.depth > 0 && a.x0 < col.x1 && a.x1 > col.x0);
}
function addWasherFloor(s, col, zone, vL, vR) {
  const errors = [];
  const warnings = [];
  const id = `${col.id}-${zone.id}-appliance-floor`;
  if (s.baseKind !== "ensuite") {
    errors.push(`Appliance floor in ${zone.id} is only on an ensuite.`);
    return { boards: [], tongue: null, errors, warnings };
  }
  if (zone.zoneType !== "left_door" && zone.zoneType !== "right_door") {
    errors.push(`Appliance floor in ${zone.id} requires a left or right door (not ${zone.zoneType}).`);
    return { boards: [], tongue: null, errors, warnings };
  }
  if (s.style2) {
    errors.push(`Appliance floor in ${zone.id} requires Style 1 bottom clearance.`);
    return { boards: [], tongue: null, errors, warnings };
  }
  const hit = wheelHit(col, s.avoidances);
  if (hit) {
    errors.push(`Appliance floor in ${zone.id} is not allowed: column intersects wheel avoidance ${hit.id}.`);
    return { boards: [], tongue: null, errors, warnings };
  }
  const clearX0 = vL.x1;
  const clearX1 = vR.x0;
  const clearW = clearX1 - clearX0;
  const floorY0 = RULES.SUPPORT_STRIP_WIDTH.value;
  const floorY1 = r2(s.cd - s.CPT);
  const span = floorY1 - floorY0;
  if (clearW < RULES.APPLIANCE_FLOOR_MIN_CLEAR_WIDTH_MM.value) {
    errors.push(`Appliance floor in ${zone.id} needs clear width >= ${RULES.APPLIANCE_FLOOR_MIN_CLEAR_WIDTH_MM.value} mm (got ${r2(clearW)}).`);
  }
  if (s.cd < RULES.APPLIANCE_FLOOR_MIN_DEPTH_MM.value) {
    errors.push(`Appliance floor in ${zone.id} needs structural depth >= ${RULES.APPLIANCE_FLOOR_MIN_DEPTH_MM.value} mm (got ${r2(s.cd)}).`);
  }
  if (span < RULES.APPLIANCE_FLOOR_MIN_SPAN_MM.value) {
    errors.push(`Appliance floor in ${zone.id} has insufficient depth behind B3 (${r2(span)} mm).`);
  }
  if (errors.length) return { boards: [], tongue: null, errors, warnings };
  const tongue = s.CPT / 2;
  const tongueY0 = r2(floorY0 + span / 3);
  const tongueY1 = r2(floorY0 + 2 * span / 3);
  const x0 = r2(clearX0 - tongue);
  const x1 = r2(clearX1 + tongue);
  const z0 = s.BCH;
  const z1 = r2(s.BCH + s.CPT);
  const X0 = lit(clearX0);
  const X1 = lit(clearX1);
  const TX0 = lit(x0);
  const TX1 = lit(x1);
  const Y0 = lit(floorY0);
  const Y1 = lit(floorY1);
  const TY0 = lit(tongueY0);
  const TY1 = lit(tongueY1);
  const outline = loopPts(id, ["x", "y"], [
    [X0, Y0],
    [X1, Y0],
    [X1, TY0],
    [TX1, TY0],
    [TX1, TY1],
    [X1, TY1],
    [X1, Y1],
    [X0, Y1],
    [X0, TY1],
    [TX0, TY1],
    [TX0, TY0],
    [X0, TY0],
    [X0, Y0]
  ]);
  const boards = [
    mkBoard(
      id,
      "Washer floor",
      "bottom",
      "appliance_floor",
      s.CPT,
      "carcass",
      "XY",
      "Z",
      x0,
      x1,
      floorY0,
      floorY1,
      z0,
      z1,
      outline
    )
  ];
  [0.35, 0.75].forEach((at, index) => {
    const center = floorY0 + span * at;
    const y0 = r2(center - s.CPT / 2);
    const y1 = r2(center + s.CPT / 2);
    if (y0 < floorY0 + 1 || y1 > floorY1 - 1) return;
    const sid = `${col.id}-${zone.id}-underside-${index + 1}`;
    boards.push(mkBoard(
      sid,
      `Washer support ${index + 1}`,
      "bottom",
      "underside_support",
      s.CPT,
      "carcass",
      "XZ",
      "Y",
      clearX0,
      clearX1,
      y0,
      y1,
      0,
      s.BCH,
      rectXZ(clearX1 - clearX0, s.BCH)
    ));
  });
  if (boards.length < 3) warnings.push(`Appliance floor ${id}: underside supports skipped (floor span too short).`);
  return {
    boards,
    tongue: { id, vLeft: vL.id, vRight: vR.id, y0: tongueY0, y1: tongueY1, z0, z1, depth: tongue },
    errors,
    warnings
  };
}
function layoutForSplitRails(layout, boards) {
  if (layout == null || typeof layout !== "object") return layout;
  const file = structuredClone(layout);
  if (!file.boards) return layout;
  const ids = new Set(boards.map((b) => b.id));
  for (const base of ["B1", "B2"]) {
    const rule = file.boards[base];
    if (!rule || ids.has(base)) continue;
    delete file.boards[base];
    for (const id of ids) {
      if (id.startsWith(`${base}-`)) file.boards[id] = structuredClone(rule);
    }
  }
  return file;
}
function generateKitchenCabinet(input, options = {}) {
  beginProvenance();
  resetPlans();
  const s = normalize(input);
  const P = param({ W: s.W, D: s.D, H: s.H, CPT: s.CPT, FPT: s.FPT, BCH: s.BCH, fc: s.fc, cd: s.cd });
  dim("kitchen.carcassDepth", { D: P.D, FPT: P.FPT }, (t) => t.D - t.FPT);
  dim("kitchen.H", { H: P.H }, (t) => t.H, { formula: "H" });
  dim("kitchen.W", { W: P.W }, (t) => t.W, { formula: "W" });
  dim("kitchen.CPT", { CPT: P.CPT }, (t) => t.CPT, { formula: "CPT" });
  dim("kitchen.FPT", { FPT: P.FPT }, (t) => t.FPT, { formula: "FPT" });
  dim("kitchen.BCH", { BCH: P.BCH }, (t) => t.BCH, { formula: "BCH" });
  dim("kitchen.fc", { fc: P.fc }, (t) => t.fc, { formula: "fc" });
  dim("kitchen.cd", { D: P.D, FPT: P.FPT }, (t) => Math.round((t.D - t.FPT) * 1e3) / 1e3, { formula: "D - FPT" });
  dim("kitchen.toeY", { y: RULES.STYLE1_TOE_KICK_Y }, (t) => t.y, { formula: "STYLE1_TOE_KICK_Y" });
  dim("toeY", { y: RULES.STYLE1_TOE_KICK_Y }, (t) => t.y, { formula: "STYLE1_TOE_KICK_Y" });
  dim("kitchen.bsY", { y: RULES.BOTTOM_SLOT_REAR_Y }, (t) => t.y, { formula: "BOTTOM_SLOT_REAR_Y" });
  dim("kitchen.recv", { r: RULES.RECEIVER_NOTCH_DEPTH }, (t) => t.r, { formula: "RECEIVER_NOTCH_DEPTH" });
  dim("kitchen.stripW", { w: RULES.SUPPORT_STRIP_WIDTH }, (t) => t.w, { formula: "SUPPORT_STRIP_WIDTH" });
  dim("kitchen.notchD", { d: RULES.SUPPORT_STRIP_NOTCH_DEPTH }, (t) => t.d, { formula: "SUPPORT_STRIP_NOTCH_DEPTH" });
  dim("kitchen.b3", { d: RULES.B3_DEPTH }, (t) => t.d, { formula: "B3_DEPTH" });
  recordColumns(s);
  const errors = [];
  const warnings = [];
  validate(s, errors, warnings);
  const boards = [];
  const notches = [];
  const hinges = [];
  const locks = [];
  const cd = s.cd, CPT = s.CPT, FPT = s.FPT, fc = s.fc, H = s.H, BCH = s.BCH;
  const stripW = RULES.SUPPORT_STRIP_WIDTH.value;
  const notchD = RULES.SUPPORT_STRIP_NOTCH_DEPTH.value;
  const vPanels = buildVPanels(s);
  const arches = clippedAvoidances(s);
  if (s.splitAfter != null) {
    for (const ci of [s.splitAfter, s.splitAfter + 1]) {
      const { left, right } = columnV(vPanels, ci);
      if (!(right.x0 - left.x1 > EPS3)) {
        errors.push(`Column ${s.columns[ci].id} is too narrow for a split end (${r2(right.x0 - left.x1)} mm clear).`);
      }
    }
  }
  const lastCol = s.columns.length - 1;
  const stoveAtLeftEdge = s.columns[0]?.zones.some((z) => z.zoneType === "stove") === true;
  const stoveAtRightEdge = lastCol >= 0 && s.columns[lastCol].zones.some((z) => z.zoneType === "stove");
  for (const v of vPanels) {
    const av = avoidanceForV(s, v, arches);
    const edgeStove = v.index === 0 && stoveAtLeftEdge || v.index === vPanels.length - 1 && stoveAtRightEdge;
    const extendOut = v.index === 0 ? s.leftOpts.extendT2T3B4ToOuterFace : s.rightOpts.extendT2T3B4ToOuterFace;
    const flatStove = edgeStove && extendOut === false && !v.frontVisible;
    const omitT1 = edgeStove && !flatStove;
    const outline = vPanelOutline(s, v, av, omitT1 && !v.frontVisible, flatStove);
    const label2 = v.index === 0 ? "Left End Panel" : v.index === vPanels.length - 1 ? "Right End Panel" : v.leftNeighborCol < 0 || v.rightNeighborCol < 0 ? "Split End Panel" : `Vertical Panel ${v.index}`;
    plan(v.id, { y0: lit(0), y1: link("kitchen.cd"), z0: lit(0), z1: link("kitchen.H") });
    boards.push(mkBoard(
      v.id,
      label2,
      "vertical",
      "vertical_panel",
      v.thickness,
      v.kind,
      "YZ",
      "X",
      v.x0,
      v.x1,
      0,
      cd,
      0,
      H,
      outline
    ));
  }
  const leftInner = vPanels[0].x1;
  const rightInner = vPanels[vPanels.length - 1].x0;
  const frontStop = { x0: s.leftOpts.frontVisible ? leftInner : 0, x1: s.rightOpts.frontVisible ? rightInner : s.W };
  const rearStop = {
    x0: s.leftOpts.frontVisible && !s.leftOpts.extendT2T3B4ToOuterFace ? leftInner : 0,
    x1: s.rightOpts.frontVisible && !s.rightOpts.extendT2T3B4ToOuterFace ? rightInner : s.W
  };
  const frontX0 = s.leftOpts.frontVisible ? link("V0.x1") : lit(0);
  const frontX1 = s.rightOpts.frontVisible ? link(`${vPanels[vPanels.length - 1].id}.x0`) : link("kitchen.W");
  const rearX0 = s.leftOpts.frontVisible && !s.leftOpts.extendT2T3B4ToOuterFace ? link("V0.x1") : lit(0);
  const rearX1 = s.rightOpts.frontVisible && !s.rightOpts.extendT2T3B4ToOuterFace ? link(`${vPanels[vPanels.length - 1].id}.x0`) : link("kitchen.W");
  const localW = (boardId) => ex({ x1: ref(`${boardId}.x1`), x0: ref(`${boardId}.x0`) }, (t) => t.x1 - t.x0, "x1 - x0");
  const vNotchRanges = vPanels.map((v) => {
    const c = (v.x0 + v.x1) / 2;
    return [r2(c - (CPT + RULES.NOTCH_ALLOWANCE_EXTRA.value) / 2), r2(c + (CPT + RULES.NOTCH_ALLOWANCE_EXTRA.value) / 2)];
  });
  const vNotchExpr = vPanels.map((v) => {
    dim(`kitchen.vnotch.${v.id}.x0`, {
      c0: ref(`${v.id}.x0`),
      c1: ref(`${v.id}.x1`),
      CPT: ref("kitchen.CPT"),
      extra: RULES.NOTCH_ALLOWANCE_EXTRA
    }, (t) => Math.round(((t.c0 + t.c1) / 2 - (t.CPT + t.extra) / 2) * 1e3) / 1e3, { formula: "centre - (CPT + 1) / 2" });
    dim(`kitchen.vnotch.${v.id}.x1`, {
      c0: ref(`${v.id}.x0`),
      c1: ref(`${v.id}.x1`),
      CPT: ref("kitchen.CPT"),
      extra: RULES.NOTCH_ALLOWANCE_EXTRA
    }, (t) => Math.round(((t.c0 + t.c1) / 2 + (t.CPT + t.extra) / 2) * 1e3) / 1e3, { formula: "centre + (CPT + 1) / 2" });
    return { a: link(`kitchen.vnotch.${v.id}.x0`), b: link(`kitchen.vnotch.${v.id}.x1`) };
  });
  const notchesOn = (x0, x1) => vNotchExpr.filter((_, i) => {
    const v = vPanels[i];
    const c = (v.x0 + v.x1) / 2;
    return c > x0 + EPS3 && c < x1 - EPS3;
  });
  const segmentBy = (x0, x1, cuts) => {
    const extra = [];
    if (s.splitAfter != null) {
      const xb = s.xBoundaries[s.splitAfter + 1];
      if (xb > x0 + EPS3 && xb < x1 - EPS3) extra.push([xb, xb]);
    }
    const pts = [...cuts, ...extra].sort((a, b) => a[0] - b[0]);
    const segs = [];
    let cur = x0;
    for (const [c0, c1] of pts) {
      if (c1 <= x0 || c0 >= x1) continue;
      const a = Math.max(c0, x0), b = Math.min(c1, x1);
      if (a > cur + EPS3) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < x1 - EPS3) segs.push([cur, x1]);
    return segs.filter(([a, b]) => b - a >= RULES.MIN_STRIP_SEGMENT_LENGTH.value);
  };
  const knownX = (n, id, face) => {
    const candidates = [
      { v: evalExpr(frontX0), e: frontX0 },
      { v: evalExpr(frontX1), e: frontX1 },
      { v: evalExpr(rearX0), e: rearX0 },
      { v: evalExpr(rearX1), e: rearX1 }
    ];
    for (const v of vPanels) candidates.push({ v: v.x0, e: link(`${v.id}.x0`) }, { v: v.x1, e: link(`${v.id}.x1`) });
    const hit = candidates.find((c) => Math.abs(c.v - n) < 1e-4);
    if (hit) return hit.e;
    return ex({ x: n }, (t) => t.x, `${id}.${face}`);
  };
  const xPair = (a, b, id, whole) => whole ? [frontX0, frontX1] : [knownX(a, id, "x0"), knownX(b, id, "x1")];
  {
    const segs = segmentBy(frontStop.x0, frontStop.x1, []);
    const whole = segs.length <= 1;
    const placeBottom = (base, name, boardType, thickness, kind, y0, y1, y0e, y1e) => {
      segs.forEach(([a, b], i) => {
        const id = whole ? base : `${base}-${i + 1}`;
        const [x0e, x1e] = xPair(a, b, id, whole);
        plan(id, { x0: x0e, x1: x1e, y0: y0e, y1: y1e, z0: lit(0), z1: link("kitchen.BCH") });
        boards.push(mkBoard(
          id,
          name,
          "bottom",
          boardType,
          thickness,
          kind,
          "XZ",
          "Y",
          a,
          b,
          y0,
          y1,
          0,
          BCH,
          traceLocalRect(id, ["x", "z"], localW(id), link("kitchen.BCH"))
        ));
      });
    };
    if (s.style2) {
      placeBottom("B1", "Bottom Front Panel", "bottom_front", FPT, "door", -FPT, 0, ex({ FPT: ref("kitchen.FPT") }, (t) => -t.FPT, "-FPT"), lit(0));
      placeBottom("B2", "Bottom Carcass Panel", "bottom_carcass", CPT, "carcass", 0, CPT, lit(0), link("kitchen.CPT"));
    } else {
      const toeY0 = RULES.STYLE1_TOE_KICK_Y.value;
      const toeY1 = toeY0 + FPT;
      const toeRear = ex({ y: ref("kitchen.toeY"), FPT: ref("kitchen.FPT") }, (t) => t.y + t.FPT, "toeY + FPT");
      const b2Rear = qRound(ex({ y: ref("kitchen.toeY"), FPT: ref("kitchen.FPT"), CPT: ref("kitchen.CPT") }, (t) => t.y + t.FPT + t.CPT), "toeY + FPT + CPT");
      placeBottom("B1", "Bottom Front Panel", "bottom_front", FPT, "door", toeY0, toeY1, link("kitchen.toeY"), toeRear);
      placeBottom("B2", "Bottom Carcass Panel", "bottom_carcass", CPT, "carcass", toeY1, r2(toeY1 + CPT), toeRear, b2Rear);
    }
  }
  {
    const segs = segmentBy(frontStop.x0, frontStop.x1, []);
    const whole = segs.length <= 1;
    const z1e = qRound(ex({ BCH: ref("kitchen.BCH"), CPT: ref("kitchen.CPT") }, (t) => t.BCH + t.CPT), "BCH + CPT");
    segs.forEach(([a, b], i) => {
      const id = whole ? "B3" : `B3-${i + 1}`;
      const [x0e, x1e] = xPair(a, b, id, whole);
      plan(id, {
        x0: x0e,
        x1: x1e,
        y0: lit(0),
        y1: link("kitchen.stripW"),
        z0: link("kitchen.BCH"),
        z1: z1e
      });
      boards.push(mkBoard(
        id,
        "Bottom Deck",
        "bottom",
        "bottom_deck",
        CPT,
        "carcass",
        "XY",
        "Z",
        a,
        b,
        0,
        stripW,
        BCH,
        r2(BCH + CPT),
        xyNotch(id, x0e, x1e, lit(0), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "far")
      ));
    });
  }
  const requests = [];
  const funcBoards = [];
  const applianceTongues = [];
  const addFuncBoard = (id, name, boardType, ci, z0, z1, z0e, z1e, isDrawer, zone, span) => {
    const { left: vL, right: vR } = columnV(vPanels, ci);
    const clearX0 = vL.x1, clearX1 = vR.x0;
    const area = ((vR.x0 + vR.x1) / 2 - (vL.x0 + vL.x1) / 2) * (zone.z1 - zone.z0);
    const intoRear = !isDrawer && !span && (z0 < stripW || z1 > r2(H - stripW));
    const y0n = span?.y0 ?? 0;
    const depth = span ? span.y1 : isDrawer ? RULES.B3_DEPTH.value : intoRear ? r2(cd - CPT) : cd;
    const y0e = span?.y0e ?? lit(0);
    const y1e = span?.y1e ?? (isDrawer ? link("kitchen.b3") : intoRear ? qRound(ex({ cd: ref("kitchen.cd"), CPT: ref("kitchen.CPT") }, (t) => t.cd - t.CPT), "cd - CPT") : link("kitchen.cd"));
    const ty0 = isDrawer ? RULES.DRAWER_TONGUE_Y0.value : span ? r2(y0n + (depth - y0n) / 3) : r2(cd / 3);
    const ty1 = isDrawer ? RULES.B3_DEPTH.value : span ? r2(y0n + 2 * (depth - y0n) / 3) : r2(2 * cd / 3);
    dim(`kitchen.span.${id}.x0`, { x: ref(`${vL.id}.x1`) }, (t) => t.x, { formula: `= ${vL.id}.x1` });
    dim(`kitchen.span.${id}.x1`, { x: ref(`${vR.id}.x0`) }, (t) => t.x, { formula: `= ${vR.id}.x0` });
    if (isDrawer) {
      dim(`kitchen.ty.${id}.y0`, { y: RULES.DRAWER_TONGUE_Y0 }, (t) => t.y, { formula: "DRAWER_TONGUE_Y0" });
      dim(`kitchen.ty.${id}.y1`, { y: RULES.B3_DEPTH }, (t) => t.y, { formula: "B3_DEPTH" });
    } else if (span) {
      dim(`kitchen.ty.${id}.y0`, { y0: span.y0e, y1: span.y1e }, (t) => Math.round((t.y0 + (t.y1 - t.y0) / 3) * 1e3) / 1e3, { formula: "y0 + (y1 - y0) / 3" });
      dim(`kitchen.ty.${id}.y1`, { y0: span.y0e, y1: span.y1e }, (t) => Math.round((t.y0 + 2 * (t.y1 - t.y0) / 3) * 1e3) / 1e3, { formula: "y0 + 2 * (y1 - y0) / 3" });
    } else {
      dim(`kitchen.ty.${id}.y0`, { cd: ref("kitchen.cd") }, (t) => Math.round(t.cd / 3 * 1e3) / 1e3, { formula: "cd / 3" });
      dim(`kitchen.ty.${id}.y1`, { cd: ref("kitchen.cd") }, (t) => Math.round(2 * t.cd / 3 * 1e3) / 1e3, { formula: "2 * cd / 3" });
    }
    plan(id, { y0: y0e, y1: y1e, z0: z0e, z1: z1e });
    const board = mkBoard(
      id,
      name,
      "functional",
      boardType,
      CPT,
      "carcass",
      "XY",
      "Z",
      clearX0,
      clearX1,
      y0n,
      depth,
      z0,
      z1,
      [{ x: clearX0, y: y0n }, { x: clearX1, y: y0n }, { x: clearX1, y: depth }, { x: clearX0, y: depth }, { x: clearX0, y: y0n }]
    );
    boards.push(board);
    funcBoards.push({ board, isDrawer, clearX0, clearX1, z0, z1, y0e, y1e, ci });
    const at = { boardId: id, tongueY0: ty0, tongueY1: ty1, z0, z1, isDrawer, area, boardY0: y0n, boardY1: depth };
    requests.push({ vIndex: vL.index, side: "right", ...at });
    requests.push({ vIndex: vR.index, side: "left", ...at });
  };
  const shelfBand = (colId, zone) => {
    const zKey = `kitchen.zone.${colId}.${zone.id}.z0`;
    const shelfH = zone.shelfHeight ?? Math.round(zone.height / 2);
    dim(`kitchen.shelf.${zone.id}.top`, { z0: ref(zKey), h: param({ shelfHeight: shelfH }).shelfHeight }, (t) => Math.round((t.z0 + t.h) * 1e3) / 1e3, { formula: "zoneZ0 + shelfHeight" });
    dim(`kitchen.shelf.${zone.id}.center`, { top: ref(`kitchen.shelf.${zone.id}.top`), CPT: ref("kitchen.CPT") }, (t) => Math.round((t.top - t.CPT / 2) * 1e3) / 1e3, { formula: "shelfTop - CPT / 2" });
    return {
      z0e: qRound(ex({ c: ref(`kitchen.shelf.${zone.id}.center`), CPT: ref("kitchen.CPT") }, (t) => t.c - t.CPT / 2), "center - CPT / 2"),
      z1e: qRound(ex({ c: ref(`kitchen.shelf.${zone.id}.center`), CPT: ref("kitchen.CPT") }, (t) => t.c + t.CPT / 2), "center + CPT / 2")
    };
  };
  s.columns.forEach((col, ci) => {
    for (const zone of col.zones) {
      if (zone.z0 <= BCH + EPS3) continue;
      const isDrawer = DRAWER_BOTTOM_TYPES.has(zone.zoneType);
      const isShelf = FULL_SHELF_TYPES.has(zone.zoneType);
      if (!isDrawer && !isShelf) continue;
      const z = r2(zone.z0 - CPT / 2), zc = r2(zone.z0 + CPT / 2);
      const zKey = `kitchen.zone.${col.id}.${zone.id}.z0`;
      const z0e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT / 2), "zoneZ0 - CPT / 2");
      const z1e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z + t.CPT / 2), "zoneZ0 + CPT / 2");
      addFuncBoard(
        `${col.id}-${zone.id}-bottom`,
        isDrawer ? "Drawer Divider" : "Full Depth Shelf",
        isDrawer ? "drawer_divider" : "full_depth_shelf",
        ci,
        z,
        zc,
        z0e,
        z1e,
        isDrawer,
        zone
      );
      if (zone.zoneType === "stove") {
        const below = col.zones[col.zones.indexOf(zone) + 1];
        if (below && PANEL_ZONE_TYPES.has(below.zoneType)) {
          const made = funcBoards[funcBoards.length - 1];
          made.board.boardType = "stove_full_shelf";
          made.lip = true;
          made.ci = ci;
        }
      }
      if (PANEL_ZONE_TYPES.has(zone.zoneType) && zone.zoneType !== "drawer" && zone.zoneType !== "down_flap" && zone.shelfEnabled) {
        if (zone.height < RULES.DOOR_SHELF_MIN_ZONE_HEIGHT.value) {
          warnings.push(`Zone ${zone.id}: height below ${RULES.DOOR_SHELF_MIN_ZONE_HEIGHT.value}; door shelf skipped.`);
          continue;
        }
        const shelfTopZ = r2(zone.z0 + (zone.shelfHeight ?? Math.round(zone.height / 2)));
        if (!(shelfTopZ > zone.z0 && shelfTopZ < zone.z1)) {
          warnings.push(`Zone ${zone.id}: door shelf top outside zone bounds; skipped.`);
          continue;
        }
        const centerZ = r2(shelfTopZ - CPT / 2);
        const band = shelfBand(col.id, zone);
        addFuncBoard(
          `${zone.id}-door-shelf`,
          "Door Shelf",
          "door_shelf",
          ci,
          r2(centerZ - CPT / 2),
          r2(centerZ + CPT / 2),
          band.z0e,
          band.z1e,
          false,
          zone
        );
      }
    }
  });
  s.columns.forEach((col) => {
    col.zones.forEach((zone, index) => {
      if (zone.applianceFloorEnabled && index !== col.zones.length - 1) {
        errors.push(`Appliance floor in ${zone.id} is only allowed on the bottom zone of a column.`);
      }
    });
  });
  s.columns.forEach((col, ci) => {
    const zone = col.zones[col.zones.length - 1];
    if (zone?.applianceFloorEnabled) {
      const made = addWasherFloor(s, col, zone, columnV(vPanels, ci).left, columnV(vPanels, ci).right);
      errors.push(...made.errors);
      warnings.push(...made.warnings);
      boards.push(...made.boards);
      if (made.tongue) applianceTongues.push(made.tongue);
    }
    if (!zone || zone.z0 > BCH + EPS3) return;
    if (!PANEL_ZONE_TYPES.has(zone.zoneType) || zone.zoneType === "drawer" || zone.zoneType === "down_flap") return;
    if (!zone.shelfEnabled) return;
    if (zone.height < RULES.DOOR_SHELF_MIN_ZONE_HEIGHT.value) {
      warnings.push(`Zone ${zone.id}: height below ${RULES.DOOR_SHELF_MIN_ZONE_HEIGHT.value}; door shelf skipped.`);
      return;
    }
    const shelfTopZ = r2(zone.z0 + (zone.shelfHeight ?? Math.round(zone.height / 2)));
    if (!(shelfTopZ > zone.z0 && shelfTopZ < zone.z1)) {
      warnings.push(`Zone ${zone.id}: door shelf top outside zone bounds; skipped.`);
      return;
    }
    const centerZ = r2(shelfTopZ - CPT / 2);
    const band = shelfBand(col.id, zone);
    addFuncBoard(
      `${zone.id}-door-shelf`,
      "Door Shelf",
      "door_shelf",
      ci,
      r2(centerZ - CPT / 2),
      r2(centerZ + CPT / 2),
      band.z0e,
      band.z1e,
      false,
      zone
    );
  });
  s.columns.forEach((col, ci) => {
    const zone = col.zones[0];
    if (!zone || zone.zoneType !== "stove") return;
    const below = col.zones[1];
    if (zone.z0 <= BCH + EPS3) {
      const y0e = link("kitchen.stripW");
      const y1e = qRound(ex({ cd: ref("kitchen.cd"), CPT: ref("kitchen.CPT") }, (t) => t.cd - t.CPT), "cd - CPT");
      const z0e2 = link("kitchen.BCH");
      const z1e2 = qRound(ex({ BCH: ref("kitchen.BCH"), CPT: ref("kitchen.CPT") }, (t) => t.BCH + t.CPT), "BCH + CPT");
      addFuncBoard(
        `${col.id}-${zone.id}-stove-deck`,
        "Stove deck",
        "full_depth_shelf",
        ci,
        BCH,
        r2(BCH + CPT),
        z0e2,
        z1e2,
        false,
        zone,
        { y0: stripW, y1: r2(cd - CPT), y0e, y1e }
      );
      return;
    }
    if (!below || !PANEL_ZONE_TYPES.has(below.zoneType)) return;
    const zKey = `kitchen.zone.${col.id}.${zone.id}.z0`;
    const z0e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT - t.CPT / 2), "zoneZ0 - CPT - CPT / 2");
    const z1e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT / 2), "zoneZ0 - CPT / 2");
    addFuncBoard(
      `${col.id}-${zone.id}-stove-half`,
      "Stove half divider",
      "stove_half_divider",
      ci,
      r2(zone.z0 - CPT - CPT / 2),
      r2(zone.z0 - CPT / 2),
      z0e,
      z1e,
      true,
      zone
    );
  });
  const colHasPanel = (ci) => s.columns[ci].zones.some((z) => PANEL_ZONE_TYPES.has(z.zoneType));
  const frontEdges = (ci) => {
    const col = s.columns[ci];
    const mateL = s.splitAfter != null && ci === s.splitAfter + 1;
    const mateR = s.splitAfter != null && ci === s.splitAfter;
    const x0 = ci === 0 ? s.leftOpts.frontVisible ? r2(leftInner + fc) : fc : mateL || colHasPanel(ci - 1) ? r2(col.x0 + fc / 2) : r2(col.x0 + CPT / 2);
    const x1 = ci === s.columns.length - 1 ? s.rightOpts.frontVisible ? r2(rightInner - fc) : r2(s.W - fc) : mateR || colHasPanel(ci + 1) ? r2(col.x1 - fc / 2) : r2(col.x1 + CPT / 2);
    const x0e = ci === 0 ? s.leftOpts.frontVisible ? qRound(ex({ x: ref("V0.x1"), fc: ref("kitchen.fc") }, (t) => t.x + t.fc), "inner + fc") : link("kitchen.fc") : mateL || colHasPanel(ci - 1) ? qRound(ex({ x: ref(`kitchen.col.${col.id}.x0`), fc: ref("kitchen.fc") }, (t) => t.x + t.fc / 2), "colX0 + fc / 2") : qRound(ex({ x: ref(`kitchen.col.${col.id}.x0`), CPT: ref("kitchen.CPT") }, (t) => t.x + t.CPT / 2), "colX0 + CPT / 2");
    const x1e = ci === s.columns.length - 1 ? s.rightOpts.frontVisible ? qRound(ex({ x: ref(`${vPanels[vPanels.length - 1].id}.x0`), fc: ref("kitchen.fc") }, (t) => t.x - t.fc), "inner - fc") : qRound(ex({ W: ref("kitchen.W"), fc: ref("kitchen.fc") }, (t) => t.W - t.fc), "W - fc") : mateR || colHasPanel(ci + 1) ? qRound(ex({ x: ref(`kitchen.col.${col.id}.x1`), fc: ref("kitchen.fc") }, (t) => t.x - t.fc / 2), "colX1 - fc / 2") : qRound(ex({ x: ref(`kitchen.col.${col.id}.x1`), CPT: ref("kitchen.CPT") }, (t) => t.x - t.CPT / 2), "colX1 - CPT / 2");
    return { x0, x1, x0e, x1e };
  };
  const { slots, screws, tongueOf } = resolveSlots(s, requests, vPanels);
  for (const fb of funcBoards) {
    const t = tongueOf.get(fb.board.id) ?? { left: 0, right: 0 };
    const id = fb.board.id;
    const { clearX0: c0, clearX1: c1 } = fb;
    const x0 = r2(c0 - t.left), x1 = r2(c1 + t.right);
    const C0 = link(`kitchen.span.${id}.x0`);
    const C1 = link(`kitchen.span.${id}.x1`);
    const TY0 = link(`kitchen.ty.${id}.y0`);
    const TY1 = link(`kitchen.ty.${id}.y1`);
    const X0 = qRound(ex({ c0: ref(`kitchen.span.${id}.x0`), tongue: ref(`kitchen.tongue.${id}.left`) }, (tn) => tn.c0 - tn.tongue), "clearX0 - tongue");
    const X1 = qRound(ex({ c1: ref(`kitchen.span.${id}.x1`), tongue: ref(`kitchen.tongue.${id}.right`) }, (tn) => tn.c1 + tn.tongue), "clearX1 + tongue");
    const Y0 = fb.y0e;
    const BY1 = fb.y1e;
    let front = [[C0, Y0], [C1, Y0]];
    if (fb.lip && fb.ci != null) {
      const span = frontEdges(fb.ci);
      dim(`kitchen.stove.${id}.frontX0`, span.x0e.terms, span.x0e.fn, { formula: span.x0e.formula });
      dim(`kitchen.stove.${id}.frontX1`, span.x1e.terms, span.x1e.fn, { formula: span.x1e.formula });
      dim(`kitchen.stove.${id}.lipX0`, { x: ref(`kitchen.stove.${id}.frontX0`), w: RULES.STOVE_SIDE_PANEL_WIDTH_MM }, (t2) => Math.round((t2.x + t2.w) * 1e3) / 1e3, { formula: "frontX0 + side panel" });
      dim(`kitchen.stove.${id}.lipX1`, { x: ref(`kitchen.stove.${id}.frontX1`), w: RULES.STOVE_SIDE_PANEL_WIDTH_MM }, (t2) => Math.round((t2.x - t2.w) * 1e3) / 1e3, { formula: "frontX1 - side panel" });
      const lx0 = link(`kitchen.stove.${id}.lipX0`);
      const lx1 = link(`kitchen.stove.${id}.lipX1`);
      const lipY = ex({ FPT: ref("kitchen.FPT") }, (t2) => -t2.FPT, "-FPT");
      const relief = RULES.STOVE_LIP_RELIEF_RADIUS_MM.value;
      const lx0n = evalExpr(lx0);
      const lx1n = evalExpr(lx1);
      const halfCircle = (xFrom, xTo) => {
        const cx = (xFrom + xTo) / 2;
        const steps = 8;
        const pts = [];
        for (let i = 0; i <= steps; i += 1) {
          const ang = Math.PI - Math.PI * i / steps;
          pts.push([lit(r2(cx + relief * Math.cos(ang))), lit(r2(relief * Math.sin(ang)))]);
        }
        return pts;
      };
      const leftArc = halfCircle(lx0n - 2 * relief, lx0n);
      const rightArc = halfCircle(lx1n, lx1n + 2 * relief);
      front = [[C0, Y0], ...leftArc, [lx0, lipY], [lx1, lipY], ...rightArc, [C1, Y0]];
      fb.board.y0 = r2(-FPT);
      plan(id, { y0: lipY });
    }
    const lastCi = s.columns.length - 1;
    const stripSide = (side) => id.endsWith("-door-shelf") && !fb.lip && (side === "left" ? fb.ci === 0 && s.leftOpts.frontVisible && s.leftOpts.strengtheningStripEnabled : fb.ci === lastCi && s.rightOpts.frontVisible && s.rightOpts.strengtheningStripEnabled);
    if (stripSide("left") || stripSide("right")) {
      const ty0n = evalExpr(TY0);
      const notchY = RULES.STRENGTHENING_STRIP_NOTCH_Y.value;
      const NY = ty0n < notchY ? TY0 : ex({ y: RULES.STRENGTHENING_STRIP_NOTCH_Y }, (tn) => tn.y, "STRENGTHENING_STRIP_NOTCH_Y");
      const na = { CPT: ref("kitchen.CPT"), e: RULES.NOTCH_ALLOWANCE_EXTRA };
      if (stripSide("left")) {
        const NX = qRound(ex({ c0: ref(`kitchen.span.${id}.x0`), ...na }, (tn) => tn.c0 + tn.CPT + tn.e), "clearX0 + CPT + 1");
        front = [[NX, Y0], ...front.slice(1)];
        fb.closeLeft = [[C0, NY], [NX, NY], [NX, Y0]];
      }
      if (stripSide("right")) {
        const NX = qRound(ex({ c1: ref(`kitchen.span.${id}.x1`), ...na }, (tn) => tn.c1 - tn.CPT - tn.e), "clearX1 - CPT - 1");
        front = [...front.slice(0, -1), [NX, Y0], [NX, NY], [C1, NY]];
      }
    }
    const closeLeft = fb.closeLeft;
    let pairs;
    if (fb.isDrawer) {
      pairs = [...front, [C1, TY0], [X1, TY0], [X1, TY1], [X0, TY1], [X0, TY0], [C0, TY0], [C0, Y0]];
    } else if (t.left > 0 && t.right > 0) {
      pairs = [...front, [C1, TY0], [X1, TY0], [X1, TY1], [C1, TY1], [C1, BY1], [C0, BY1], [C0, TY1], [X0, TY1], [X0, TY0], [C0, TY0], [C0, Y0]];
    } else if (t.right > 0) {
      pairs = [...front, [C1, TY0], [X1, TY0], [X1, TY1], [C1, TY1], [C1, BY1], [C0, BY1], [C0, Y0]];
    } else if (t.left > 0) {
      pairs = [...front, [C1, BY1], [C0, BY1], [C0, TY1], [X0, TY1], [X0, TY0], [C0, TY0], [C0, Y0]];
    } else {
      pairs = [...front, [C1, BY1], [C0, BY1], [C0, Y0]];
    }
    if (closeLeft) pairs = [...pairs.slice(0, -1), ...closeLeft];
    const rows = pairs.map(([a, b]) => ({ x: evalExpr(a), y: evalExpr(b), e: [a, b] }));
    const samePt = (p, q) => Math.abs(p.x - q.x) < EPS3 && Math.abs(p.y - q.y) < EPS3;
    const ring = rows.filter((p, i) => i === 0 || !samePt(p, rows[i - 1]));
    if (ring.length > 1 && samePt(ring[0], ring[ring.length - 1])) ring.pop();
    const kept = ring.filter((p, i) => {
      const a = ring[(i - 1 + ring.length) % ring.length];
      const c = ring[(i + 1) % ring.length];
      return Math.abs((p.x - a.x) * (c.y - a.y) - (p.y - a.y) * (c.x - a.x)) > EPS3;
    });
    const finalRows = kept.length >= 3 ? [...kept, kept[0]] : rows;
    plan(id, { x0: X0, x1: X1 });
    fb.board.x0 = x0;
    fb.board.x1 = x1;
    fb.board.profileVector = loopPts(id, ["x", "y"], finalRows.map((p) => p.e));
  }
  const zTop0 = H - CPT;
  const rN = RULES.RECEIVER_NOTCH_DEPTH.value;
  const stoveCuts = s.columns.map((c, i) => {
    if (!c.zones.some((z) => z.zoneType === "stove")) return null;
    const { left: leftV, right: rightV } = columnV(vPanels, i);
    return {
      x0: leftV?.x1 ?? c.x0,
      x1: rightV?.x0 ?? c.x1,
      y0: 0,
      y1: FPT + RULES.STOVE_CUT_FRONT_EXTRA.value
    };
  }).filter((x) => x != null);
  const notchIn = (n, x0, x1) => {
    const a = Math.max(n[0], x0), b = Math.min(n[1], x1);
    return b - a > EPS3 ? [a, b] : null;
  };
  const stoveXCutsForY = (y0, y1) => stoveCuts.filter((c) => !(y1 <= c.y0 || y0 >= c.y1)).map((c) => [c.x0, c.x1]);
  dim("kitchen.t3y0", { cd: ref("kitchen.cd"), CPT: ref("kitchen.CPT") }, (t) => Math.round((t.cd - t.CPT) * 1e3) / 1e3, { formula: "cd - CPT" });
  dim("kitchen.t2y0", { y1: ref("kitchen.t3y0"), w: ref("kitchen.stripW") }, (t) => Math.round((t.y1 - t.w) * 1e3) / 1e3, { formula: "T3 front - stripW" });
  dim("kitchen.topZ0", { H: ref("kitchen.H"), CPT: ref("kitchen.CPT") }, (t) => Math.round((t.H - t.CPT) * 1e3) / 1e3, { formula: "H - CPT" });
  dim("kitchen.t3z0", { H: ref("kitchen.H"), w: ref("kitchen.stripW") }, (t) => Math.round((t.H - t.w) * 1e3) / 1e3, { formula: "H - stripW" });
  {
    const segs = segmentBy(frontStop.x0, frontStop.x1, stoveXCutsForY(0, stripW));
    segs.forEach(([a, b], i) => {
      const id = `T1-${i + 1}`;
      const x0e = knownX(a, id, "x0");
      const x1e = knownX(b, id, "x1");
      plan(id, {
        x0: x0e,
        x1: x1e,
        y0: lit(0),
        y1: link("kitchen.stripW"),
        z0: link("kitchen.topZ0"),
        z1: link("kitchen.H")
      });
      boards.push(mkBoard(
        id,
        "Top Front Rail",
        "top",
        "top_front_rail",
        CPT,
        "carcass",
        "XY",
        "Z",
        a,
        b,
        0,
        stripW,
        zTop0,
        H,
        xyNotch(id, x0e, x1e, lit(0), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "far")
      ));
    });
  }
  {
    const y1 = r2(cd - CPT);
    const y0 = r2(y1 - stripW);
    const segs = segmentBy(rearStop.x0, rearStop.x1, stoveXCutsForY(y0, y1));
    segs.forEach(([a, b], i) => {
      const id = `T2-${i + 1}`;
      const x0e = knownX(a, id, "x0");
      const x1e = knownX(b, id, "x1");
      plan(id, {
        x0: x0e,
        x1: x1e,
        y0: link("kitchen.t2y0"),
        y1: link("kitchen.t3y0"),
        z0: link("kitchen.topZ0"),
        z1: link("kitchen.H")
      });
      boards.push(mkBoard(
        id,
        "Top Rear Rail",
        "top",
        "top_rear_rail",
        CPT,
        "carcass",
        "XY",
        "Z",
        a,
        b,
        y0,
        y1,
        zTop0,
        H,
        xyNotch(id, x0e, x1e, link("kitchen.t2y0"), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "near")
      ));
    });
  }
  {
    const y0 = r2(cd - CPT), z0 = r2(H - stripW);
    const segs = segmentBy(rearStop.x0, rearStop.x1, stoveXCutsForY(y0, cd));
    segs.forEach(([a, b], i) => {
      const id = `T3-${i + 1}`;
      const x0e = knownX(a, id, "x0");
      const x1e = knownX(b, id, "x1");
      plan(id, {
        x0: x0e,
        x1: x1e,
        y0: link("kitchen.t3y0"),
        y1: link("kitchen.cd"),
        z0: link("kitchen.t3z0"),
        z1: link("kitchen.H")
      });
      boards.push(mkBoard(
        id,
        "Top Rear Vertical",
        "top",
        "top_rear_vertical",
        CPT,
        "carcass",
        "XZ",
        "Y",
        a,
        b,
        y0,
        cd,
        z0,
        H,
        xzNotch(id, x0e, x1e, link("kitchen.t3z0"), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "near")
      ));
    });
  }
  {
    const y0 = r2(cd - CPT);
    const avCuts = arches.filter((a) => a.x1 > a.x0 && a.height > 0).map((a) => [a.x0, a.x1]);
    const segs = segmentBy(rearStop.x0, rearStop.x1, avCuts);
    segs.forEach(([a, b], i) => {
      const id = `B4-${i + 1}`;
      const x0e = knownX(a, id, "x0");
      const x1e = knownX(b, id, "x1");
      plan(id, {
        x0: x0e,
        x1: x1e,
        y0: link("kitchen.t3y0"),
        y1: link("kitchen.cd"),
        z0: lit(0),
        z1: link("kitchen.stripW")
      });
      boards.push(mkBoard(
        id,
        "Bottom Rear Vertical",
        "bottom",
        "bottom_rear_vertical",
        CPT,
        "carcass",
        "XZ",
        "Y",
        a,
        b,
        y0,
        cd,
        0,
        stripW,
        xzNotch(id, x0e, x1e, lit(0), link("kitchen.stripW"), notchesOn(a, b), link("kitchen.notchD"), "far")
      ));
    });
  }
  for (const a of arches) {
    if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) continue;
    const ad = a.depth, ah = a.height;
    const idTop = `${a.id}-avoidance-top`;
    dim(`${a.id}.x0`, { x0: param({ x0: a.x0 }).x0 }, (t) => t.x0, { formula: "avoidX0" });
    dim(`${a.id}.x1`, { x1: param({ x1: a.x1 }).x1 }, (t) => t.x1, { formula: "avoidX1" });
    dim(`${a.id}.h`, { h: param({ height: a.height }).height }, (t) => t.h, { formula: "avoidH" });
    dim(`${a.id}.d`, { d: param({ depth: a.depth }).depth }, (t) => t.d, { formula: "avoidD" });
    const y0e = qRound(ex({ cd: ref("kitchen.cd"), d: ref(`${a.id}.d`) }, (t) => t.cd - t.d), "cd - avoidD");
    const z0e = qRound(ex({ h: ref(`${a.id}.h`), CPT: ref("kitchen.CPT") }, (t) => t.h - t.CPT), "avoidH - CPT");
    plan(idTop, {
      x0: link(`${a.id}.x0`),
      x1: link(`${a.id}.x1`),
      y0: y0e,
      y1: link("kitchen.cd"),
      z0: z0e,
      z1: link(`${a.id}.h`)
    });
    boards.push(mkBoard(
      idTop,
      "Avoidance Top",
      "avoidance",
      "avoidance_top",
      CPT,
      "carcass",
      "XY",
      "Z",
      a.x0,
      a.x1,
      r2(cd - ad),
      cd,
      r2(ah - CPT),
      ah,
      xyNotch(idTop, link(`${a.id}.x0`), link(`${a.id}.x1`), y0e, link(`${a.id}.d`), [], link("kitchen.notchD"), "far")
    ));
    if (ah + RULES.RAISED_B4_HEIGHT.value <= H) {
      const id = `${a.id}-B4`;
      const z1e = qRound(ex({ h: ref(`${a.id}.h`), rise: RULES.RAISED_B4_HEIGHT }, (t) => t.h + t.rise), "avoidH + RAISED_B4_HEIGHT");
      plan(id, {
        x0: link(`${a.id}.x0`),
        x1: link(`${a.id}.x1`),
        y0: link("kitchen.t3y0"),
        y1: link("kitchen.cd"),
        z0: link(`${a.id}.h`),
        z1: z1e
      });
      boards.push(mkBoard(
        id,
        "Raised Rear Vertical",
        "avoidance",
        "raised_b4",
        CPT,
        "carcass",
        "XZ",
        "Y",
        a.x0,
        a.x1,
        r2(cd - CPT),
        cd,
        ah,
        r2(ah + RULES.RAISED_B4_HEIGHT.value),
        // Same V notches as B4 (NOTCH_DEPTH down from the top edge): a V panel inside the arch span
        // has its receiver notch for this strip, and a plain rectangle ran 15 mm into it.
        xzNotch(
          id,
          link(`${a.id}.x0`),
          link(`${a.id}.x1`),
          link(`${a.id}.h`),
          ex({ rise: RULES.RAISED_B4_HEIGHT }, (t) => t.rise, "RAISED_B4_HEIGHT"),
          notchesOn(a.x0, a.x1),
          link("kitchen.notchD"),
          "far"
        )
      ));
    } else {
      warnings.push(`Wheel avoidance ${a.id}: raised B4 exceeds height; skipped.`);
    }
    if (ah > CPT) {
      const id = `${a.id}-avoidance-front`;
      const y1e = qRound(ex({ cd: ref("kitchen.cd"), d: ref(`${a.id}.d`), CPT: ref("kitchen.CPT") }, (t) => t.cd - t.d + t.CPT), "cd - avoidD + CPT");
      const hE = qRound(ex({ h: ref(`${a.id}.h`), CPT: ref("kitchen.CPT") }, (t) => t.h - t.CPT), "avoidH - CPT");
      plan(id, {
        x0: link(`${a.id}.x0`),
        x1: link(`${a.id}.x1`),
        y0: y0e,
        y1: y1e,
        z0: lit(0),
        z1: hE
      });
      boards.push(mkBoard(
        id,
        "Avoidance Front",
        "avoidance",
        "avoidance_front",
        CPT,
        "carcass",
        "XZ",
        "Y",
        a.x0,
        a.x1,
        r2(cd - ad),
        r2(cd - ad + CPT),
        0,
        r2(ah - CPT),
        traceLocalRect(id, ["x", "z"], localW(id), hE)
      ));
    } else {
      warnings.push(`Wheel avoidance ${a.id}: front cover height \u2264 CPT; skipped.`);
    }
  }
  for (const fb of funcBoards) {
    for (const a of arches) {
      if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) continue;
      if (!(fb.board.x0 < a.x1 && fb.board.x1 > a.x0)) continue;
      const ad = a.depth, ah = a.height;
      let y1 = fb.board.y1;
      if (fb.z0 < ah) y1 = Math.max(fb.board.y0, r2(cd - ad - CPT));
      else if (fb.z0 < ah + RULES.RAISED_B4_HEIGHT.value) y1 = Math.min(y1, r2(cd - CPT));
      if (y1 < fb.board.y1) {
        fb.board.y1 = y1;
        plan(fb.board.id, {
          y1: fb.z0 < ah ? qRound(ex({ cd: ref("kitchen.cd"), d: ref(`${a.id}.d`), CPT: ref("kitchen.CPT") }, (t) => t.cd - t.d - t.CPT), "cd - avoidD - CPT") : link("kitchen.t3y0")
        });
        warnings.push(`Functional board ${fb.board.id} shortened by wheel avoidance ${a.id}.`);
      }
    }
  }
  const strips = [];
  if (s.leftOpts.frontVisible && s.leftOpts.strengtheningStripEnabled) {
    for (const zone of s.columns[0].zones) {
      if (!PANEL_ZONE_TYPES.has(zone.zoneType)) continue;
      const z0 = Math.max(zone.z0, r2(BCH + CPT));
      const z1 = Math.min(zone.z1, r2(H - CPT));
      if (z1 > z0) strips.push({ zoneId: zone.id, side: "left", z0: r2(z0), z1: r2(z1), x0: leftInner, x1: r2(leftInner + CPT) });
    }
  }
  if (s.rightOpts.frontVisible && s.rightOpts.strengtheningStripEnabled) {
    const lastCol2 = s.columns[s.columns.length - 1];
    for (const zone of lastCol2.zones) {
      if (!PANEL_ZONE_TYPES.has(zone.zoneType)) continue;
      const z0 = Math.max(zone.z0, r2(BCH + CPT));
      const z1 = Math.min(zone.z1, r2(H - CPT));
      if (z1 > z0) strips.push({ zoneId: zone.id, side: "right", z0: r2(z0), z1: r2(z1), x0: r2(rightInner - CPT), x1: rightInner });
    }
  }
  dim("kitchen.deckTop", { BCH: ref("kitchen.BCH"), CPT: ref("kitchen.CPT") }, (t) => Math.round((t.BCH + t.CPT) * 1e3) / 1e3, { formula: "BCH + CPT" });
  for (const st of strips) {
    const id = `${st.side}-side-strengthening-strip-${st.zoneId}`;
    const colId = st.side === "left" ? s.columns[0].id : s.columns[s.columns.length - 1].id;
    const endId = st.side === "left" ? "V0" : vPanels[vPanels.length - 1].id;
    plan(id, {
      x0: st.side === "left" ? link("V0.x1") : qRound(ex({ x: ref(`${endId}.x0`), CPT: ref("kitchen.CPT") }, (t) => t.x - t.CPT), "inner - CPT"),
      x1: st.side === "left" ? qRound(ex({ x: ref("V0.x1"), CPT: ref("kitchen.CPT") }, (t) => t.x + t.CPT), "inner + CPT") : link(`${endId}.x0`),
      y0: lit(0),
      y1: link("kitchen.stripW"),
      z0: qRound(ex({ z: ref(`kitchen.zone.${colId}.${st.zoneId}.z0`), deck: ref("kitchen.deckTop") }, (t) => Math.max(t.z, t.deck)), "max(zoneZ0, BCH + CPT)"),
      z1: qRound(ex({ z: ref(`kitchen.zone.${colId}.${st.zoneId}.z1`), cap: ref("kitchen.topZ0") }, (t) => Math.min(t.z, t.cap)), "min(zoneZ1, H - CPT)")
    });
    const covered = funcBoards.filter((fb) => fb.board.id.endsWith("-door-shelf") && fb.z0 >= st.z0 - EPS3 && fb.z1 <= st.z1 + EPS3);
    let prof;
    if (covered.length) {
      const lo = covered.reduce((a, b) => a.z0 < b.z0 ? a : b);
      const hi = covered.reduce((a, b) => a.z1 > b.z1 ? a : b);
      dim(`${id}.gz0`, { z: ref(`${lo.board.id}.z0`), c: RULES.STRENGTHENING_GROOVE_CLEARANCE }, (t) => Math.round((t.z - t.c) * 1e3) / 1e3, { formula: "shelfZ0 - clearance" });
      dim(`${id}.gz1`, { z: ref(`${hi.board.id}.z1`), c: RULES.STRENGTHENING_GROOVE_CLEARANCE }, (t) => Math.round((t.z + t.c) * 1e3) / 1e3, { formula: "shelfZ1 + clearance" });
      const grooveY = ex({ y: RULES.STRENGTHENING_GROOVE_Y0 }, (t) => t.y, "STRENGTHENING_GROOVE_Y0");
      const sw = link("kitchen.stripW");
      const z0e = link(`${id}.z0`);
      const z1e = link(`${id}.z1`);
      const gz0 = link(`${id}.gz0`);
      const gz1 = link(`${id}.gz1`);
      prof = loopPts(id, ["y", "z"], [
        [lit(0), z0e],
        [sw, z0e],
        [sw, gz0],
        [grooveY, gz0],
        [grooveY, gz1],
        [sw, gz1],
        [sw, z1e],
        [lit(0), z1e],
        [lit(0), z0e]
      ], true);
    } else {
      prof = traceLocalRect(id, ["y", "z"], link("kitchen.stripW"), qRound(ex({ z1: ref(`${id}.z1`), z0: ref(`${id}.z0`) }, (t) => t.z1 - t.z0), "z1 - z0"));
    }
    boards.push(mkBoard(
      id,
      `${st.side === "left" ? "Left" : "Right"} Side Strengthening Strip`,
      "support",
      "strengthening_strip",
      CPT,
      "carcass",
      "YZ",
      "X",
      st.x0,
      st.x1,
      0,
      stripW,
      st.z0,
      st.z1,
      prof
    ));
    for (const fb of covered) {
      const nx0 = st.side === "left" ? fb.clearX0 : r2(fb.clearX1 - CPT - RULES.NOTCH_ALLOWANCE_EXTRA.value);
      notches.push({
        id: `${fb.board.id}-${st.side}-strip-notch`,
        panelId: fb.board.id,
        x0: r2(nx0),
        x1: r2(nx0 + CPT + RULES.NOTCH_ALLOWANCE_EXTRA.value),
        y0: 0,
        y1: RULES.STRENGTHENING_STRIP_NOTCH_Y.value
      });
    }
  }
  const emitDoorPanel = (id, zone, x0, x1, z0, z1, kind, leaf, stoveAbove = false) => {
    const w = r2(x1 - x0), h = r2(z1 - z0);
    if (w <= 0 || h <= 0) {
      warnings.push(`Front panel ${id}: non-positive leaf size; skipped.`);
      return;
    }
    boards.push(mkBoard(
      id,
      "Front Panel",
      "front_panel",
      "front_panel",
      FPT,
      "door",
      "XZ",
      "Y",
      x0,
      x1,
      -FPT,
      0,
      z0,
      z1,
      traceLocalRect(
        id,
        ["x", "z"],
        qRound(ex({ x1: ref(`${id}.x1`), x0: ref(`${id}.x0`) }, (t) => t.x1 - t.x0), "x1 - x0"),
        qRound(ex({ z1: ref(`${id}.z1`), z0: ref(`${id}.z0`) }, (t) => t.z1 - t.z0), "z1 - z0")
      )
    ));
    const hs = zone.hingeSettings;
    if (kind !== "drawer") {
      const L = kind === "down_flap" ? w : h;
      let sd = RULES.HINGE_SD_MIN.value + (L - RULES.HINGE_SD_SPAN.value) * RULES.SD_GAIN_NUM.value / RULES.SD_GAIN_DEN.value;
      sd = Math.min(RULES.HINGE_SD_MAX.value, Math.max(RULES.HINGE_SD_MIN.value, sd));
      dim(`kitchen.hinge.${id}.sd`, {
        min: RULES.HINGE_SD_MIN,
        max: RULES.HINGE_SD_MAX,
        span: RULES.HINGE_SD_SPAN,
        num: RULES.SD_GAIN_NUM,
        den: RULES.SD_GAIN_DEN,
        L
      }, (t) => Math.min(t.max, Math.max(t.min, t.min + (t.L - t.span) * t.num / t.den)), { formula: "clamp(min, max, min + (L - span) * num / den)" });
      const fromEdge = hs.cupCenterFromEdge;
      const edgeTerm = Math.abs(fromEdge - RULES.HINGE_CUP_FROM_EDGE.value) < 1e-9 ? RULES.HINGE_CUP_FROM_EDGE : param({ cupCenterFromEdge: fromEdge }).cupCenterFromEdge;
      let centers;
      if (kind === "down_flap") {
        const ze = qRound(ex({ z0: ref(`${id}.z0`), edge: edgeTerm }, (t) => t.z0 + t.edge), "z0 + cupFromEdge");
        centers = [
          { x: r2(x0 + sd), z: r2(z0 + fromEdge), xe: qRound(ex({ x0: ref(`${id}.x0`), sd: ref(`kitchen.hinge.${id}.sd`) }, (t) => t.x0 + t.sd), "x0 + sd"), ze },
          { x: r2(x1 - sd), z: r2(z0 + fromEdge), xe: qRound(ex({ x1: ref(`${id}.x1`), sd: ref(`kitchen.hinge.${id}.sd`) }, (t) => t.x1 - t.sd), "x1 - sd"), ze }
        ];
      } else {
        const hingeLeft = kind === "left_door" || kind === "double_door" && leaf === "left";
        const cx = hingeLeft ? r2(x0 + fromEdge) : r2(x1 - fromEdge);
        const xe = hingeLeft ? qRound(ex({ x0: ref(`${id}.x0`), edge: edgeTerm }, (t) => t.x0 + t.edge), "x0 + cupFromEdge") : qRound(ex({ x1: ref(`${id}.x1`), edge: edgeTerm }, (t) => t.x1 - t.edge), "x1 - cupFromEdge");
        const sinkDoor = (kind === "left_door" || kind === "right_door") && zone.withSink;
        const askedDrop = sinkDoor ? RULES.SINK_HINGE_DROP_MM.value : 0;
        const room = z1 - sd - (z0 + sd) - hs.cupDiameter;
        const drop = askedDrop > 0 ? Math.min(askedDrop, Math.max(0, r2(room))) : 0;
        if (sinkDoor && drop < askedDrop) {
          warnings.push(`With sink: ${id} can only drop the upper hinge ${drop} mm \u2014 ${askedDrop} mm would meet the lower hinge.`);
        }
        const zeTop = drop > 0 ? qRound(ex(
          { z1: ref(`${id}.z1`), sd: ref(`kitchen.hinge.${id}.sd`), drop: RULES.SINK_HINGE_DROP_MM },
          (t) => t.z1 - t.sd - Math.min(t.drop, drop)
        ), "z1 - sd - sinkDrop") : qRound(ex({ z1: ref(`${id}.z1`), sd: ref(`kitchen.hinge.${id}.sd`) }, (t) => t.z1 - t.sd), "z1 - sd");
        centers = [
          { x: cx, z: r2(z1 - sd - drop), xe, ze: zeTop },
          { x: cx, z: r2(z0 + sd), xe, ze: qRound(ex({ z0: ref(`${id}.z0`), sd: ref(`kitchen.hinge.${id}.sd`) }, (t) => t.z0 + t.sd), "z0 + sd") }
        ];
        if (hs.useThreeHinges) centers.push({ x: cx, z: r2((z0 + z1) / 2), xe, ze: qRound(ex({ z0: ref(`${id}.z0`), z1: ref(`${id}.z1`) }, (t) => (t.z0 + t.z1) / 2), "(z0 + z1) / 2") });
      }
      centers.forEach((c, i) => {
        const hid = `${id}-hinge-${i + 1}`;
        dim(`kitchen.hinge.${hid}.x`, c.xe.terms, c.xe.fn, { formula: c.xe.formula });
        dim(`kitchen.hinge.${hid}.z`, c.ze.terms, c.ze.fn, { formula: c.ze.formula });
        hinges.push({ id: hid, panelId: id, centerX: c.x, centerZ: c.z, diameter: hs.cupDiameter, depth: hs.cupDepth });
      });
    }
    if (s.lockOn && zone.lockEnabled) {
      let cx;
      if (kind === "left_door") cx = r2(x1 - zone.lockSideCenterOffset);
      else if (kind === "right_door") cx = r2(x0 + zone.lockSideCenterOffset);
      else cx = r2((x0 + x1) / 2);
      const dividerCenter = stoveAbove ? r2(zone.z1 - CPT) : zone.z1 >= H - EPS3 ? r2(H - CPT / 2) : zone.z1;
      const cz = r2(dividerCenter - CPT / 2 - RULES.LOCK_DROP.value);
      const lockId = `${id}-lock`;
      const off = Math.abs(zone.lockSideCenterOffset - RULES.LOCK_SIDE_OFFSET.value) < 1e-9 ? RULES.LOCK_SIDE_OFFSET : param({ lockSideCenterOffset: zone.lockSideCenterOffset }).lockSideCenterOffset;
      if (kind === "left_door") dim(`kitchen.lock.${lockId}.x`, { x1: ref(`${id}.x1`), off }, (t) => Math.round((t.x1 - t.off) * 1e3) / 1e3, { formula: "x1 - lockSideOffset" });
      else if (kind === "right_door") dim(`kitchen.lock.${lockId}.x`, { x0: ref(`${id}.x0`), off }, (t) => Math.round((t.x0 + t.off) * 1e3) / 1e3, { formula: "x0 + lockSideOffset" });
      else dim(`kitchen.lock.${lockId}.x`, { x0: ref(`${id}.x0`), x1: ref(`${id}.x1`) }, (t) => Math.round((t.x0 + t.x1) / 2 * 1e3) / 1e3, { formula: "(x0 + x1) / 2" });
      dim(`kitchen.lock.${lockId}.z`, {
        divider: dividerCenter,
        CPT: ref("kitchen.CPT"),
        drop: RULES.LOCK_DROP
      }, (t) => Math.round((t.divider - t.CPT / 2 - t.drop) * 1e3) / 1e3, { formula: stoveAbove ? "stoveHalfCenter - CPT / 2 - LOCK_DROP" : "dividerCenter - CPT / 2 - LOCK_DROP" });
      locks.push({
        id: `${id}-lock`,
        panelId: id,
        centerX: cx,
        centerZ: cz,
        width: RULES.LOCK_WIDTH.value,
        height: RULES.LOCK_HEIGHT.value,
        radius: r2(RULES.LOCK_HEIGHT.value / 2)
      });
    }
  };
  s.columns.forEach((col, ci) => {
    for (const zone of col.zones) {
      if (!PANEL_ZONE_TYPES.has(zone.zoneType)) continue;
      const { x0, x1, x0e, x1e } = frontEdges(ci);
      const zoneAbove = col.zones.find((z) => Math.abs(z.z0 - zone.z1) < EPS3);
      const stoveAbove = zoneAbove?.zoneType === "stove";
      let z1;
      if (zone.z1 >= H - EPS3) z1 = r2(H - fc);
      else if (stoveAbove) z1 = r2(zone.z1 - CPT - fc);
      else if (zoneAbove && PANEL_ZONE_TYPES.has(zoneAbove.zoneType)) z1 = r2(zone.z1 - fc / 2);
      else z1 = r2(zone.z1 + CPT / 2);
      const zoneBelow = col.zones.find((z) => Math.abs(z.z1 - zone.z0) < EPS3);
      let z0;
      if (zone.z0 <= BCH + EPS3) z0 = s.style2 ? r2(BCH + fc) : BCH;
      else if (zoneBelow && PANEL_ZONE_TYPES.has(zoneBelow.zoneType)) z0 = r2(zone.z0 + fc / 2);
      else z0 = r2(zone.z0 - CPT / 2);
      const zKey1 = `kitchen.zone.${col.id}.${zone.id}.z1`;
      const zKey0 = `kitchen.zone.${col.id}.${zone.id}.z0`;
      const z1e = zone.z1 >= H - EPS3 ? qRound(ex({ H: ref("kitchen.H"), fc: ref("kitchen.fc") }, (t) => t.H - t.fc), "H - fc") : stoveAbove ? qRound(ex({ z: ref(zKey1), CPT: ref("kitchen.CPT"), fc: ref("kitchen.fc") }, (t) => t.z - t.CPT - t.fc), "zoneZ1 - CPT - fc") : zoneAbove && PANEL_ZONE_TYPES.has(zoneAbove.zoneType) ? qRound(ex({ z: ref(zKey1), fc: ref("kitchen.fc") }, (t) => t.z - t.fc / 2), "zoneZ1 - fc / 2") : qRound(ex({ z: ref(zKey1), CPT: ref("kitchen.CPT") }, (t) => t.z + t.CPT / 2), "zoneZ1 + CPT / 2");
      const z0e = zone.z0 <= BCH + EPS3 ? s.style2 ? qRound(ex({ BCH: ref("kitchen.BCH"), fc: ref("kitchen.fc") }, (t) => t.BCH + t.fc), "BCH + fc") : link("kitchen.BCH") : zoneBelow && PANEL_ZONE_TYPES.has(zoneBelow.zoneType) ? qRound(ex({ z: ref(zKey0), fc: ref("kitchen.fc") }, (t) => t.z + t.fc / 2), "zoneZ0 + fc / 2") : qRound(ex({ z: ref(zKey0), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT / 2), "zoneZ0 - CPT / 2");
      const y0e = ex({ FPT: ref("kitchen.FPT") }, (t) => -t.FPT, "-FPT");
      const placeLeaf = (leafId, lx0, lx1) => {
        plan(leafId, { x0: lx0, x1: lx1, y0: y0e, y1: lit(0), z0: z0e, z1: z1e });
      };
      const id = `${zone.id}-front-panel`;
      if (zone.zoneType === "double_door") {
        const mid = r2((x0 + x1) / 2);
        dim(`kitchen.leaf.${id}.x0`, x0e.terms, x0e.fn, { formula: x0e.formula });
        dim(`kitchen.leaf.${id}.x1`, x1e.terms, x1e.fn, { formula: x1e.formula });
        dim(`kitchen.leaf.${id}.mid`, { x0: ref(`kitchen.leaf.${id}.x0`), x1: ref(`kitchen.leaf.${id}.x1`) }, (t) => Math.round((t.x0 + t.x1) / 2 * 1e3) / 1e3, { formula: "(x0 + x1) / 2" });
        const leftX1 = qRound(ex({ mid: ref(`kitchen.leaf.${id}.mid`), fc: ref("kitchen.fc") }, (t) => t.mid - t.fc / 2), "mid - fc / 2");
        const rightX0 = qRound(ex({ mid: ref(`kitchen.leaf.${id}.mid`), fc: ref("kitchen.fc") }, (t) => t.mid + t.fc / 2), "mid + fc / 2");
        placeLeaf(`${id}-left`, x0e, leftX1);
        placeLeaf(`${id}-right`, rightX0, x1e);
        emitDoorPanel(`${id}-left`, zone, x0, r2(mid - fc / 2), z0, z1, "double_door", "left", stoveAbove);
        emitDoorPanel(`${id}-right`, zone, r2(mid + fc / 2), x1, z0, z1, "double_door", "right", stoveAbove);
      } else {
        placeLeaf(id, x0e, x1e);
        emitDoorPanel(id, zone, x0, x1, z0, z1, zone.zoneType, void 0, stoveAbove);
      }
    }
  });
  const sideW = RULES.STOVE_SIDE_PANEL_WIDTH_MM.value;
  const notchZ = RULES.STOVE_SIDE_NOTCH_Z_MM.value;
  s.columns.forEach((col, ci) => {
    const zone = col.zones[0];
    const below = col.zones[1];
    if (!zone || zone.zoneType !== "stove" || !below || !PANEL_ZONE_TYPES.has(below.zoneType)) return;
    const { x0, x1, x0e, x1e } = frontEdges(ci);
    const span = r2(x1 - x0);
    if (span < sideW * 2) {
      warnings.push(`Stove side panels skipped in ${zone.id}: front width ${span} is under ${sideW * 2}.`);
      return;
    }
    const splitZ = r2(zone.z0 - CPT);
    const topZ = r2(H - fc);
    if (topZ - splitZ <= notchZ) {
      warnings.push(`Stove side panels skipped in ${zone.id}: height ${r2(topZ - splitZ)} is too short for the ${notchZ} mm top notch.`);
      return;
    }
    const zKey = `kitchen.zone.${col.id}.${zone.id}.z0`;
    const z0e = qRound(ex({ z: ref(zKey), CPT: ref("kitchen.CPT") }, (t) => t.z - t.CPT), "zoneZ0 - CPT");
    const z1e = qRound(ex({ H: ref("kitchen.H"), fc: ref("kitchen.fc") }, (t) => t.H - t.fc), "H - fc");
    const y0e = ex({ FPT: ref("kitchen.FPT") }, (t) => -t.FPT, "-FPT");
    const leftX1 = r2(x0 + sideW);
    const rightX0 = r2(x1 - sideW);
    const leftId = `${col.id}-${zone.id}-stove-side-left`;
    const rightId = `${col.id}-${zone.id}-stove-side-right`;
    plan(leftId, { x0: x0e, y0: y0e, y1: lit(0), z0: z0e, z1: z1e });
    plan(rightId, { x1: x1e, y0: y0e, y1: lit(0), z0: z0e, z1: z1e });
    dim(`kitchen.stove.${leftId}.x1`, { x0: ref(`${leftId}.x0`), w: RULES.STOVE_SIDE_PANEL_WIDTH_MM }, (t) => Math.round((t.x0 + t.w) * 1e3) / 1e3, { formula: "frontX0 + sideWidth" });
    dim(`kitchen.stove.${rightId}.x0`, { x1: ref(`${rightId}.x1`), w: RULES.STOVE_SIDE_PANEL_WIDTH_MM }, (t) => Math.round((t.x1 - t.w) * 1e3) / 1e3, { formula: "frontX1 - sideWidth" });
    const leftX1e = link(`kitchen.stove.${leftId}.x1`);
    const rightX0e = link(`kitchen.stove.${rightId}.x0`);
    plan(leftId, { x1: leftX1e });
    plan(rightId, { x0: rightX0e });
    dim(`kitchen.stove.${leftId}.notchX`, { x: ref(`kitchen.stove.${leftId}.x1`), n: RULES.STOVE_SIDE_NOTCH_X_MM }, (t) => Math.round((t.x - t.n) * 1e3) / 1e3, { formula: "inner - notch" });
    dim(`kitchen.stove.${rightId}.notchX`, { x: ref(`kitchen.stove.${rightId}.x0`), n: RULES.STOVE_SIDE_NOTCH_X_MM }, (t) => Math.round((t.x + t.n) * 1e3) / 1e3, { formula: "inner + notch" });
    dim(`kitchen.stove.${leftId}.notchZ`, { z: ref(`${leftId}.z1`), n: RULES.STOVE_SIDE_NOTCH_Z_MM }, (t) => Math.round((t.z - t.n) * 1e3) / 1e3, { formula: "top - notch" });
    const leftNotchX = link(`kitchen.stove.${leftId}.notchX`);
    const rightNotchX = link(`kitchen.stove.${rightId}.notchX`);
    const notchZe = link(`kitchen.stove.${leftId}.notchZ`);
    boards.push(mkBoard(
      leftId,
      "Stove left side panel",
      "front_panel",
      "stove_side_panel",
      FPT,
      "door",
      "XZ",
      "Y",
      x0,
      leftX1,
      -FPT,
      0,
      splitZ,
      topZ,
      loopPts(leftId, ["x", "z"], [
        [x0e, z0e],
        [leftX1e, z0e],
        [leftX1e, notchZe],
        [leftNotchX, notchZe],
        [leftNotchX, z1e],
        [x0e, z1e],
        [x0e, z0e]
      ])
    ));
    boards.push(mkBoard(
      rightId,
      "Stove right side panel",
      "front_panel",
      "stove_side_panel",
      FPT,
      "door",
      "XZ",
      "Y",
      rightX0,
      x1,
      -FPT,
      0,
      splitZ,
      topZ,
      loopPts(rightId, ["x", "z"], [
        [rightX0e, z0e],
        [x1e, z0e],
        [x1e, z1e],
        [rightNotchX, z1e],
        [rightNotchX, notchZe],
        [rightX0e, notchZe],
        [rightX0e, z0e]
      ])
    ));
  });
  const benchColour = String(input.benchTopColorName || input.benchTopColor || "").trim();
  if (s.waterfall && !benchColour) warnings.push("Waterfall needs a bench top colour.");
  if (benchColour) {
    const y0e = ex(
      { FPT: ref("kitchen.FPT"), over: RULES.BENCH_FRONT_OVERHANG_MM },
      (t) => -(t.FPT + t.over),
      "-(FPT + overhang)"
    );
    const z1e = ex(
      { H: ref("kitchen.H"), t: RULES.BENCH_THICKNESS_MM },
      (t) => t.H + t.t,
      "H + thickness"
    );
    const thick = RULES.BENCH_THICKNESS_MM.value;
    const over = RULES.BENCH_FRONT_OVERHANG_MM.value;
    const y0 = r2(-FPT - over);
    const y1 = cd;
    const z1 = r2(H + thick);
    const fall = s.waterfall;
    const xOuter0 = 0;
    const xOuter1 = fall === "right" ? r2(s.W + thick) : s.W;
    if (!fall) {
      plan("BENCH", {
        x0: lit(0),
        x1: link("kitchen.W"),
        y0: y0e,
        y1: link("kitchen.cd"),
        z0: link("kitchen.H"),
        z1: z1e
      });
      const depth = ex({ y1: ref("BENCH.y1"), y0: ref("BENCH.y0") }, (t) => t.y1 - t.y0, "y1 - y0");
      const bench = mkBoard(
        "BENCH",
        "Bench top",
        "top",
        "bench_top",
        thick,
        "bench",
        "XY",
        "Z",
        0,
        s.W,
        y0,
        y1,
        H,
        z1,
        traceLocalRect("BENCH", ["x", "y"], localW("BENCH"), depth)
      );
      bench.stock = { kind: "bench", thickness: thick, sides: 1, colour: benchColour };
      boards.push(bench);
    } else {
      plan("BENCH", {
        x0: lit(xOuter0),
        x1: lit(xOuter1),
        y0: y0e,
        y1: link("kitchen.cd"),
        z0: link("kitchen.H"),
        z1: z1e
      });
      const benchOutline = fall === "right" ? loopPts("BENCH", ["x", "z"], [
        [lit(0), link("kitchen.H")],
        [link("kitchen.W"), link("kitchen.H")],
        [lit(xOuter1), z1e],
        [lit(0), z1e],
        [lit(0), link("kitchen.H")]
      ]) : loopPts("BENCH", ["x", "z"], [
        [lit(0), z1e],
        [lit(thick), link("kitchen.H")],
        [link("kitchen.W"), link("kitchen.H")],
        [link("kitchen.W"), z1e],
        [lit(0), z1e]
      ]);
      const bench = mkBoard(
        "BENCH",
        "Bench top",
        "top",
        "bench_top",
        thick,
        "bench",
        "XZ",
        "Y",
        0,
        xOuter1,
        y0,
        y1,
        H,
        z1,
        benchOutline
      );
      bench.stock = { kind: "bench", thickness: thick, sides: 1, colour: benchColour };
      boards.push(bench);
      const dropX0 = fall === "right" ? s.W : 0;
      const dropX1 = fall === "right" ? xOuter1 : thick;
      plan("WATERFALL", {
        x0: lit(dropX0),
        x1: lit(dropX1),
        y0: y0e,
        y1: link("kitchen.cd"),
        z0: lit(0),
        z1: z1e
      });
      const dropOutline = fall === "right" ? loopPts("WATERFALL", ["x", "z"], [
        [lit(dropX0), lit(0)],
        [lit(dropX1), lit(0)],
        [lit(dropX1), z1e],
        [lit(dropX0), link("kitchen.H")],
        [lit(dropX0), lit(0)]
      ]) : loopPts("WATERFALL", ["x", "z"], [
        [lit(0), lit(0)],
        [lit(thick), lit(0)],
        [lit(thick), link("kitchen.H")],
        [lit(0), z1e],
        [lit(0), lit(0)]
      ]);
      const drop = mkBoard(
        "WATERFALL",
        "Waterfall",
        "top",
        "bench_waterfall",
        thick,
        "bench",
        "XZ",
        "Y",
        dropX0,
        dropX1,
        y0,
        y1,
        0,
        z1,
        dropOutline
      );
      drop.stock = { kind: "bench", thickness: thick, sides: 1, colour: benchColour };
      boards.push(drop);
    }
  }
  for (const b of boards) refreshBoardBox(b);
  flushPlans();
  applyLayoutDraft(boards, layoutForSplitRails(options.layout != null ? options.layout : LAYOUT, boards), {
    W: P.W,
    D: P.D,
    H: P.H,
    CPT: P.CPT,
    FPT: P.FPT,
    BCH: P.BCH,
    fc: P.fc,
    toeY: RULES.STYLE1_TOE_KICK_Y
  }, errors, warnings, {
    bottomClearanceStyle: s.style2 ? "style_2" : "style_1",
    leftFront: s.leftOpts.frontVisible ? "door" : "carcass",
    rightFront: s.rightOpts.frontVisible ? "door" : "carcass"
  });
  attachFaces(boards);
  const joints = buildKitchenFaces({
    boards,
    slots,
    screws,
    hinges,
    locks,
    notches,
    doorColour: doorColourOf(input),
    applianceTongues,
    benchColour: benchColour || void 0
  });
  warnings.push(...addKitchenB3Led(boards, !s.style2 && input.ledGroove !== false));
  const grain = applyGrain(boards, (b) => b.stock?.kind === "door" ? "front" : null, input, { front: "horizontal" });
  noteBenchSheet(grain.issues, boards.find((b) => b.id === "BENCH"));
  noteBenchSheet(grain.issues, boards.find((b) => b.id === "WATERFALL"), "z");
  applyDoorSides(boards, input);
  const milling = applyMilling(boards);
  const stoves = s.columns.flatMap((c, ci) => {
    const z = c.zones[0];
    if (!z || z.zoneType !== "stove") return [];
    const span = frontEdges(ci);
    return [{
      columnId: c.id,
      zoneId: z.id,
      openingWidth: r2(span.x1 - span.x0 - 2 * RULES.STOVE_SIDE_PANEL_WIDTH_MM.value),
      openingHeight: r2(z.height + s.CPT - s.fc)
    }];
  });
  const result = {
    params: {
      length: s.length,
      depth: s.D,
      height: s.H,
      carcassDepth: cd,
      materialThickness: s.CPT,
      frontThickness: s.FPT,
      bottomClearanceHeight: s.BCH,
      bottomClearanceStyle: s.style2 ? "style_2" : "style_1",
      frontClearance: fc,
      lockEnabled: s.lockOn
    },
    boards,
    grain,
    milling,
    slots,
    screws,
    hinges,
    locks,
    notches,
    joints,
    xBoundaries: s.xBoundaries,
    validation: { errors, warnings }
  };
  result.debug = {
    provenance: endProvenance(),
    boardFrame: "final",
    // Resolved layout for the front-view preview (same numbers the boards were built from).
    columns: s.columns.map((c) => ({
      id: c.id,
      x0: c.x0,
      x1: c.x1,
      zones: c.zones.map((z) => ({ id: z.id, zoneType: z.zoneType, z0: z.z0, z1: z.z1 }))
    })),
    avoidances: s.avoidances,
    split: s.splitAfter == null ? null : { after: s.splitAfter, x: s.xBoundaries[s.splitAfter + 1] },
    waterfall: s.waterfall ? { side: s.waterfall, x0: s.waterfall === "left" ? 0 : s.W, thickness: RULES.BENCH_THICKNESS_MM.value } : null,
    stoves
  };
  return result;
}
export {
  RULES,
  generateKitchenCabinet,
  generateKitchenSvgPreview,
  screwPositions
};
