// Generated from generators/lounge/generator.ts - do not edit.

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
      const m2 = body.match(/return\s+([\s\S]*?);?\s*}$/);
      body = m2 ? m2[1] : body;
    }
  } else {
    const m2 = src.match(/return\s+([\s\S]*?);?\s*}$/);
    body = m2 ? m2[1] : src;
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
function lit(v2) {
  return { terms: {}, fn: () => v2, formula: String(v2) };
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
    const c2 = src[i];
    if (/\s/.test(c2)) {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(c2)) {
      const m2 = /^[0-9]*\.?[0-9]+(?:e[+-]?[0-9]+)?/i.exec(src.slice(i));
      if (!m2) throw new Error(`bad number at ${i} in "${src}"`);
      out.push({ t: "num", v: Number(m2[0]) });
      i += m2[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c2)) {
      const m2 = /^[A-Za-z_][\w-]*(?:\[\d+\])?(?:\.[A-Za-z_][\w-]*(?:\[\d+\])?)*/.exec(src.slice(i));
      out.push({ t: "id", v: m2[0] });
      i += m2[0].length;
      continue;
    }
    if ("+-*/%^(),".includes(c2)) {
      out.push({ t: c2 });
      i += 1;
      continue;
    }
    throw new Error(`unexpected "${c2}" in "${src}"`);
  }
  return out;
}
function parse(src) {
  const toks = tokenize(src);
  let p2 = 0;
  const peek = () => toks[p2];
  const take = (t) => {
    const k2 = toks[p2];
    if (!k2 || t && k2.t !== t) throw new Error(`expected ${t || "a value"} in "${src}"`);
    p2 += 1;
    return k2;
  };
  const primary = () => {
    const k2 = peek();
    if (!k2) throw new Error(`unexpected end of "${src}"`);
    if (k2.t === "num") {
      p2 += 1;
      return { k: "num", v: k2.v };
    }
    if (k2.t === "(") {
      p2 += 1;
      const v2 = sum2();
      take(")");
      return v2;
    }
    if (k2.t === "-") {
      p2 += 1;
      return { k: "neg", a: primary() };
    }
    if (k2.t === "+") {
      p2 += 1;
      return primary();
    }
    if (k2.t === "id") {
      p2 += 1;
      const name = k2.v;
      if (peek()?.t === "(") {
        p2 += 1;
        if (!(name in FUNCS)) throw new Error(`unknown function ${name} in "${src}"`);
        const args = [];
        if (peek()?.t !== ")") {
          args.push(sum2());
          while (peek()?.t === ",") {
            p2 += 1;
            args.push(sum2());
          }
        }
        take(")");
        return { k: "call", f: name, args };
      }
      return { k: "id", v: name };
    }
    throw new Error(`unexpected ${k2.t} in "${src}"`);
  };
  const power = () => {
    let a2 = primary();
    while (peek()?.t === "^") {
      p2 += 1;
      a2 = { k: "bin", op: "^", a: a2, b: primary() };
    }
    return a2;
  };
  const product = () => {
    let a2 = power();
    while (peek() && ["*", "/", "%"].includes(peek().t)) {
      const op = take().t;
      a2 = { k: "bin", op, a: a2, b: power() };
    }
    return a2;
  };
  const sum2 = () => {
    let a2 = product();
    while (peek() && ["+", "-"].includes(peek().t)) {
      const op = take().t;
      a2 = { k: "bin", op, a: a2, b: product() };
    }
    return a2;
  };
  if (!toks.length) throw new Error("empty expression");
  const node = sum2();
  if (p2 !== toks.length) throw new Error(`trailing input in "${src}"`);
  return node;
}
function namesOf(n, out) {
  if (n.k === "id") out.add(n.v);
  else if (n.k === "neg") namesOf(n.a, out);
  else if (n.k === "bin") {
    namesOf(n.a, out);
    namesOf(n.b, out);
  } else if (n.k === "call") for (const a2 of n.args) namesOf(a2, out);
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
      return FUNCS[n.f](...n.args.map((a2) => run(a2, lookup)));
    case "bin": {
      const a2 = run(n.a, lookup);
      const b = run(n.b, lookup);
      switch (n.op) {
        case "+":
          return a2 + b;
        case "-":
          return a2 - b;
        case "*":
          return a2 * b;
        case "/":
          return a2 / b;
        case "%":
          return a2 % b;
        default:
          return a2 ** b;
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
  const hit = list.filter((c2) => !c2.when || Object.entries(c2.when).every(([k2, v2]) => situation[k2] === v2));
  hit.sort((a2, b) => Object.keys(b.when || {}).length - Object.keys(a2.when || {}).length);
  return hit[0] || null;
}
var CORNERS = ["FL", "FR", "RR", "RL"];
var LayoutError = class extends Error {
};
var FACE_REF = /^([A-Za-z][\w-]*)\.([xyz])([01])$/;
function planeOf(ref2) {
  const face = FACE_REF.exec(ref2);
  if (face) return { board: face[1], axis: face[2] };
  const m2 = /^([A-Za-z][\w-]*)\.(.+)$/.exec(ref2);
  if (!m2) return null;
  const ax = /([xyz])\d*$/i.exec(m2[2]);
  if (!ax) return null;
  return { board: m2[1], axis: ax[1].toLowerCase() };
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
  for (const k2 of ["at", "size"]) {
    if (typeof r[k2] !== "string" || !r[k2].trim()) throw new LayoutError(`layout: ${id}.${axis} ${k2} missing`);
    try {
      compile(r[k2]);
    } catch (err) {
      throw new LayoutError(`layout: ${id}.${axis} ${k2}: ${err.message}`);
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
  const f2 = raw;
  if (!f2 || typeof f2 !== "object") throw new LayoutError("layout: not an object");
  if (typeof f2.module !== "string") throw new LayoutError("layout: module missing");
  if (!Number.isFinite(f2.version)) throw new LayoutError("layout: version missing");
  if (!f2.boards || typeof f2.boards !== "object") throw new LayoutError("layout: boards missing");
  for (const [id, b] of Object.entries(f2.boards)) {
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
      for (const c2 of CORNERS) {
        const p2 = b.outline.corners?.[c2];
        if (!p2) throw new LayoutError(`layout: ${id} outline has no corner ${c2}`);
        check(`corner ${c2} u`, p2.u);
        check(`corner ${c2} v`, p2.v);
      }
    }
    for (const [fid, feat] of Object.entries(b.features ?? {})) check(`feature ${fid} depth`, feat?.depth);
  }
  return f2;
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
    const m2 = FACE_REF.exec(name);
    if (m2 && placing.has(m2[1])) {
      placeAxis(m2[1], m2[2]);
      return ref(name);
    }
    if (Number.isFinite(valueOf(name))) return ref(name);
    if (m2) throw new LayoutError(`layout: ${from} uses ${name}: ${m2[1]} is placed in code after these boards, so its faces cannot be referenced yet`);
    throw new LayoutError(`layout: ${from} uses ${name}, which is not an input, a rule or a placed face`);
  };
  const record = (key, c2, from) => {
    const terms = {};
    for (const n of c2.names) terms[n] = termOf(n, from);
    return dim(key, terms, (t) => c2.run((n) => t[n]), { formula: c2.src });
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
      const ok = AXES.filter((k2) => k2 !== axis).every((k2) => {
        const a0 = out[id][`${k2}0`] ?? valueOf(`${id}.${k2}0`);
        const a1 = out[id][`${k2}1`] ?? valueOf(`${id}.${k2}1`);
        const b0 = valueOf(`${other}.${k2}0`);
        const b1 = valueOf(`${other}.${k2}1`);
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
  board.profileVector = board.profileVector.map((p2) => {
    const q = { ...p2 };
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
        const v2 = box[face];
        if (typeof v2 === "number") b[face] = v2;
      }
      followOutline(b, before);
    }
  } catch (err) {
    if (err instanceof LayoutError) errors.push(err.message);
    else throw err;
  }
}

// generators/lounge/layout.json
var layout_default = {
  module: "lounge",
  version: 1,
  boards: {}
};

// generators/lounge/layout.ts
var LAYOUT = validateLayout(layout_default);

// generators/_lib/model.ts
function planeAxes(plane) {
  if (plane === "YZ") return ["y", "z", "x"];
  if (plane === "XZ") return ["x", "z", "y"];
  return ["x", "y", "z"];
}
var ARC_CHORD_MM = 0.05;
var ARC_STEP_MAX = 5 * Math.PI / 180;
function bulgeOf(p2) {
  const b = Number(p2.bulge);
  return Number.isFinite(b) ? b : 0;
}
function expandBulgeRing(pts) {
  if (!pts.some((p2) => p2.b && Math.abs(p2.b) > 1e-9)) return pts.map((p2) => ({ u: p2.u, v: p2.v }));
  const n = pts.length;
  const out = [];
  for (let i = 0; i < n; i += 1) {
    const a2 = pts[i];
    const c2 = pts[(i + 1) % n];
    out.push({ u: a2.u, v: a2.v });
    const bulge = a2.b ?? 0;
    const chord = Math.hypot(c2.u - a2.u, c2.v - a2.v);
    if (!bulge || chord < 1e-9) continue;
    const sweep = 4 * Math.atan(bulge);
    const du = (c2.u - a2.u) / chord;
    const dv = (c2.v - a2.v) / chord;
    const h = chord / 2 / Math.tan(sweep / 2);
    const cu = (a2.u + c2.u) / 2 - dv * h;
    const cv = (a2.v + c2.v) / 2 + du * h;
    const r = Math.hypot(a2.u - cu, a2.v - cv);
    if (!(r > 1e-6)) continue;
    const a0 = Math.atan2(a2.v - cv, a2.u - cu);
    const step = Math.min(ARC_STEP_MAX, 2 * Math.acos(Math.max(-1, 1 - ARC_CHORD_MM / r)));
    const k2 = Math.max(2, Math.ceil(Math.abs(sweep) / step));
    for (let j = 1; j < k2; j += 1) {
      const t = a0 + sweep * j / k2;
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
    if (pv) raw = pv.map((p2) => ({ u: Number(p2.y), v: Number(p2.z), b: bulgeOf(p2) }));
    else if (b.cutProfileVector && b.cutProfileVector.length >= 4) {
      raw = b.cutProfileVector.map((p2) => ({ u: p2.y, v: p2.z }));
      local = true;
    }
  } else if (pv) {
    raw = pv.map((p2) => ({ u: Number(p2[U]), v: Number(p2[V]), b: bulgeOf(p2) }));
  }
  if (!raw) return null;
  if (raw.length > 2) {
    const a2 = raw[0];
    const c2 = raw[raw.length - 1];
    if (Math.abs(a2.u - c2.u) < 1e-9 && Math.abs(a2.v - c2.v) < 1e-9) raw.pop();
  }
  const expanded = expandBulgeRing(raw);
  if (expanded.length < 3) return null;
  if (local) return expanded.map((p2) => [p2.u, p2.v]);
  const ou = b.profilePlane === "YZ" ? b.y0 : Math.min(...expanded.map((p2) => p2.u));
  const ov = b.profilePlane === "YZ" ? b.z0 : Math.min(...expanded.map((p2) => p2.v));
  return expanded.map((p2) => [p2.u - ou, p2.v - ov]);
}
function rectOutline(b) {
  const [U, V] = planeAxes(b.profilePlane);
  const w2 = b[`${U}1`] - b[`${U}0`];
  const h = b[`${V}1`] - b[`${V}0`];
  return [[0, 0], [w2, 0], [w2, h], [0, h]];
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
  const vec2 = [0, 0, 0];
  const idx = { x: 0, y: 1, z: 2 };
  vec2[idx[U]] = nu;
  vec2[idx[V]] = nv;
  return vec2;
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
  const f2 = (b.faces ?? (b.faces = facesOf(b))).find((x2) => x2.id === id);
  if (!f2) throw new Error(`${b.id}: no face ${id}`);
  return f2;
}
function addFeature(b, faceId, feature) {
  faceOf(b, faceId).features.push(feature);
  return feature;
}
function edgeFaces(b) {
  return (b.faces ?? (b.faces = facesOf(b))).filter((f2) => f2.id.startsWith("E"));
}
function boundaryEdgeFaces(b, normal, tol = 0.01) {
  const [U, V] = planeAxes(b.profilePlane);
  const axis = normal[1].toLowerCase();
  const c2 = axis === U ? 0 : axis === V ? 1 : -1;
  if (c2 < 0) return [];
  const all = edgeFaces(b);
  const coords = all.flatMap((f2) => [f2.edge.from[c2], f2.edge.to[c2]]);
  const extreme = normal[0] === "+" ? Math.max(...coords) : Math.min(...coords);
  return all.filter((f2) => f2.normal === normal && Math.abs(f2.edge.from[c2] - extreme) <= tol && Math.abs(f2.edge.to[c2] - extreme) <= tol);
}
function annotate(b, faceId, a2) {
  Object.assign(faceOf(b, faceId), a2);
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
function joint(id, kind, a2, b, extra = {}) {
  return { id, kind, a: a2, b, ...extra };
}
function faceRef(board, faces) {
  return { board, faces: faces.map((f2) => typeof f2 === "string" ? f2 : f2.id) };
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
var bigFaces = (b) => (b.faces ?? []).filter((f2) => f2.id === "A" || f2.id === "B");
function applyDoorSides(boards, params) {
  const sides = doorSidesOf(params);
  const carcass = carcassColourOf(params);
  for (const b of boards) {
    if (b.stock?.kind !== "door") continue;
    const faces = bigFaces(b);
    const front = faces.find((f2) => f2.visible === true && f2.finish?.colour && f2.finish.colour !== carcass);
    if (!front) continue;
    const back = faces.find((f2) => f2 !== front);
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
var partial = (f2) => WORK.has(f2.kind) && !f2.through;
var through = (f2) => WORK.has(f2.kind) && !!f2.through;
function bboxArea(pts) {
  if (!pts || !pts.length) return 0;
  const xs = pts.map((p2) => Number(p2.x ?? 0));
  const ys = pts.map((p2) => Number(p2.y ?? 0));
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}
function slabRebateFace(b) {
  if (!b.slabs || b.slabs.length < 2 || b.thicknessAxis !== "Z") return null;
  const material = (s) => bboxArea(s.outline) - (s.holes ?? []).reduce((a2, h) => a2 + bboxArea(h), 0);
  const bottom = b.slabs.reduce((a2, s) => s.z0 < a2.z0 ? s : a2);
  const top = b.slabs.reduce((a2, s) => s.z1 > a2.z1 ? s : a2);
  if (material(bottom) < material(top) - EPS) return "B";
  if (material(top) < material(bottom) - EPS) return "A";
  return null;
}
function colourFaceOf(b, A, B2) {
  const coloured = b.stock?.kind === "door" || b.stock?.kind === "bench";
  if (!coloured || b.stock?.sides === 2) return null;
  return [A, B2].find((f2) => f2.visible === true && f2.finish?.colour && !CARCASS.test(f2.finish.colour)) ?? null;
}
function reportFace(A, B2, colour) {
  if (colour) return colour.id === "A" ? "B" : "A";
  const inward = (f2) => f2.semantic === "inside" || f2.semantic === "back" || f2.semantic === "wall";
  if (inward(B2) && !inward(A)) return "B";
  return "A";
}
function applyMilling(boards) {
  const issues = [];
  for (const b of boards) {
    const A = b.faces?.find((f2) => f2.id === "A");
    const B2 = b.faces?.find((f2) => f2.id === "B");
    if (!A || !B2) continue;
    const rebate = slabRebateFace(b);
    const onA = A.features.some(partial) || rebate === "A";
    const onB = B2.features.some(partial) || rebate === "B";
    const colour = colourFaceOf(b, A, B2);
    let face;
    if (onA && onB) {
      face = reportFace(A, B2, colour);
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
    const [to, from] = face === "A" ? [A, B2] : [B2, A];
    const moving = from.features.filter(through);
    if (moving.length) {
      from.features = from.features.filter((f2) => !through(f2));
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

// generators/lounge/rules.json
var rules_default = {
  DEFAULT_HEIGHT: { value: 420, doc: "\u4F11\u95F2\u67DC\u603B\u9AD8\u7F3A\u7701\u3002" },
  DEFAULT_PPT: { value: 18, doc: "\u7EDF\u4E00\u677F\u539A\u7F3A\u7701\u3002" },
  OPENING_RADIUS: { value: 50, doc: "\u9876\u677F\u6B63\u4E2D\u5F00\u53E3\u7684\u5706\u89D2\u3002\u5F00\u53E3\u662F\u6BB5\u9762\u7684\u4E00\u534A\uFF0C\u4E0A\u534A\u5C42\u518D\u6536\u8FDB\u534A\u4E2A\u677F\u539A\u3002" },
  LID_CLEARANCE_EACH_SIDE: { value: 1.5, doc: "\u76D6\u677F\u56DB\u5468\u5355\u8FB9\u7F29\u91CF\u3002" },
  FINGER_HOLE_DIAMETER: { value: 40, doc: "\u76D6\u677F\u6307\u5B54\u5F84\uFF08\u8D2F\u901A\uFF09\u3002" },
  L_LEG_WIDTH: { value: 100, doc: "\u65E7 L \u5F62\u817F\u5BBD\u3002\u76F4\u6BB5\u4FA7\u677F\u73B0\u5728\u662F\u901A\u9AD8\u6574\u677F\uFF0C\u4E0D\u518D\u7528\u8FD9\u4E2A\u503C\u3002" },
  TOP_SUPPORT_STRIP_HEIGHT: { value: 100, doc: "\u9876\u90E8\u652F\u6491\u6761\u9AD8\u3002" },
  DEFAULT_AVOIDANCE_DEPTH: { value: 300, doc: "\u8F6E\u62F1\u907F\u8BA9\u6DF1\u7F3A\u7701\u3002" },
  DEFAULT_AVOIDANCE_HEIGHT: { value: 250, doc: "\u8F6E\u62F1\u907F\u8BA9\u9AD8\u7F3A\u7701\u3002" },
  MIDDLE_CABINET_WIDTH: { value: 600, doc: "Parallel \u4E2D\u67DC\u5BBD\u7F3A\u7701\u3002" },
  MIDDLE_CABINET_DEPTH: { value: 350, doc: "Parallel \u4E2D\u67DC\u6DF1\u7F3A\u7701\u3002" },
  MIDDLE_CABINET_HEIGHT: { value: 500, doc: "Parallel \u4E2D\u67DC\u9AD8\u7F3A\u7701\u3002" },
  MIDDLE_CABINET_START_HEIGHT: { value: 300, doc: "Parallel \u4E2D\u67DC\u79BB\u5730\u8D77\u59CB\u9AD8\u3002" },
  MIDDLE_CABINET_DOOR_THICKNESS: { value: 16, doc: "\u4E2D\u67DC\u95E8/\u67DC\u8EAB\u539A\u7F3A\u7701\uFF08\u63D2\u4EF6\u7F3A\u7701 16\uFF0C19'6 Rear Door 16\uFF09\u3002" },
  MIDDLE_CABINET_DOOR_CLEARANCE: { value: 2, doc: "\u4E2D\u67DC\u95E8\u7F1D\u3002" },
  MIDDLE_CABINET_LOCK_SIDE: { value: 30, doc: "\u4E2D\u67DC\u9501\u5FC3\u8DDD\u95E8\u4FA7\u3002" },
  MIDDLE_CABINET_HINGE_SIDE: { value: 80, doc: "\u4E2D\u67DC\u94F0\u94FE\u4FA7\u8DDD\u3002" },
  MIDDLE_CABINET_HINGE_FROM_EDGE: { value: 22.5, doc: "\u4E2D\u67DC\u94F0\u94FE\u676F\u5FC3\u8DDD\u95E8\u8FB9\u3002" },
  MIDDLE_CABINET_HINGE_DIAMETER: { value: 35, doc: "\u4E2D\u67DC\u94F0\u94FE\u676F\u5F84\u3002" },
  MIDDLE_CABINET_HINGE_DEPTH: { value: 12.5, doc: "\u4E2D\u67DC\u94F0\u94FE\u676F\u6DF1\u3002" },
  LOCK_WIDTH: { value: 55, doc: "razor_long_rounded_1 \u9501\u69FD\u5BBD\u3002" },
  LOCK_HEIGHT: { value: 15.5, doc: "\u9501\u69FD\u9AD8\u3002" },
  LOCK_DROP: { value: 30.5, doc: "\u9501\u5FC3\u4F4E\u4E8E\u4E0A\u5206\u9694\u5B89\u88C5\u9762\u3002" },
  FRAME_LID_GAP: { value: 2, doc: "\u6846\u67B6\u5F0F L\uFF1A\u76D6\u5B50\u56DB\u5468\u6BCF\u8FB9\u7559\u7F1D\uFF08\u76D6\u5B50\u5D4C\u5728\u5916\u677F\u4E4B\u95F4\uFF0C\u9876\u9762\u4E0E\u5916\u677F\u9F50\u5E73\uFF09\u3002" },
  FRAME_FINGER_HOLE_DIAMETER: { value: 50, doc: "\u6846\u67B6\u5F0F L\uFF1A\u76D6\u5B50\u6B63\u4E2D\u7684\u62C9\u624B\u5B54\u5F84\uFF08\u8D2F\u901A\uFF09\u3002" },
  FRAME_WALL_GAP: { value: 1, doc: "\u6846\u67B6\u5F0F L\uFF1A\u8D34\u5899\u540E\u6A2A\u6761\u79BB\u5899\uFF1B\u5185\u90E8\u6258\u6761\u79BB\u540E\u6A2A\u6761 / \u524D\u677F\u4E5F\u662F\u8FD9\u4E48\u591A\u3002" },
  FRAME_SLOT_CLEARANCE: { value: 1, doc: "\u6846\u67B6\u5F0F L\uFF1A\u54AC\u5408\u7F3A\u53E3\u6BD4\u677F\u539A\u5BBD\u8FD9\u4E48\u591A\uFF08\u7F3A\u53E3\u5BBD = \u677F\u539A + 1\uFF09\u3002" },
  FRAME_INNER_RAIL_HEIGHT: { value: 100, doc: "\u6846\u67B6\u5F0F L\uFF1A\u4E3B\u6BB5\u524D\u540E\u6258\u6761\u9AD8\uFF0C\u9876\u9762\u5728 H \u2212 \u677F\u539A\uFF1B\u8D34\u5899\u540E\u6A2A\u6761\u9AD8 = \u8FD9\u4E2A + \u677F\u539A\u3002" },
  FRAME_HALVING_NOTCH: { value: 20, doc: "\u6846\u67B6\u5F0F L\uFF1A\u6A2A\u6761 / \u6258\u6761\u4ECE\u5E95\u8FB9\u5F80\u4E0A\u5F00\u7684\u54AC\u5408\u7F3A\u53E3\u6DF1\u3002" },
  FRAME_HALVING_GAP: { value: 5, doc: "\u6846\u67B6\u5F0F L\uFF1A\u54AC\u5408\u5904\u6A2A\u6761\u7F3A\u53E3\u9876\u4E0E\u7AD6\u677F\u7F3A\u53E3\u5E95\u4E4B\u95F4\u7684\u95F4\u9699\uFF08\u7AD6\u677F\u7F3A\u53E3\u4ECE\u6A2A\u6761\u5E95 + 20 \u2212 5 \u5F00\u5230\u9876\uFF09\u3002" },
  MIDDLE_CABINET_MIN_WIDTH: { value: 300, doc: "\u6846\u67B6\u5E73\u884C\u6C99\u53D1\uFF1A\u4E24\u6BB5\u4E4B\u95F4\u81F3\u5C11\u8FD9\u4E48\u5BBD\u624D\u81EA\u52A8\u653E\u4E2D\u67DC\uFF08hasMiddleCabinet \u6CA1\u8BBE\u65F6\uFF09\uFF1B\u5BBD\u5EA6\u6CA1\u8BBE\u65F6\u53D6 MIDDLE_CABINET_WIDTH \u548C\u4E2D\u95F4\u7A7A\u9699\u91CC\u5C0F\u7684\u90A3\u4E2A\u3002" },
  MIDDLE_CABINET_DIVIDER_THICKNESS: { value: 15, doc: "\u5E73\u884C\u6C99\u53D1\u4E2D\u67DC\u4E2D\u95F4\u9694\u677F\uFF1A\u67DC\u4F53\u6599\u539A\uFF0819'6 Rear Door\uFF1A15\uFF0C\u67DC\u4F53 / \u95E8 16\uFF09\u3002\u69FD\u9AD8 = \u5B83 + 1\uFF0C\u69FD\u6DF1 = \u5B83 / 2\uFF0C\u820C\u5934 = \u5B83 / 2 \u2212 0.5\u3002" },
  MIDDLE_CABINET_LOCK_EXTRA: { value: 35, doc: "\u4E2D\u67DC\u95E8\u9501\u4E2D\u5FC3\u79BB\u4E24\u6247\u95E8\u5BF9\u7F1D = lockSideDistance + 35\uFF08\u63D2\u4EF6\u89C4\u5219\uFF1B19'6 Rear Door 30 + 35 = 65\uFF09\u3002\u9501\u4E2D\u5FC3\u9AD8 = \u4E2D\u95F4\u9694\u677F\u5E95 \u2212 LOCK_DROP\u3002" },
  FRAME_HALF_SLOT_TONGUE_GAP: { value: 0.5, doc: "\u6846\u67B6\u534A\u69FD\uFF08\u4E0D\u6253\u901A\uFF0C\u540C\u53A8\u623F V \u677F\u534A\u69FD\uFF09\uFF1A\u69FD\u6DF1 = \u88AB\u5F00\u69FD\u677F\u539A / 2\uFF0C\u69FD\u5BBD = \u63D2\u5165\u677F\u539A + FRAME_SLOT_CLEARANCE\uFF08\u6BCF\u8FB9 0.5\uFF09\uFF0C\u63D2\u5165\u677F\u820C\u5934 = \u69FD\u6DF1 \u2212 0.5\u3002\u5E73\u884C\u6C99\u53D1\u540E\u6A2A\u6761\u63D2\u5EA7\u9762\u677F\u5185\u4FA7\u5C31\u662F\u8FD9\u79CD\uFF0C\u4ECE\u4E2D\u7F1D\u770B\u4E0D\u5230\u3002" },
  FRAME_LID_MAX_LENGTH: { value: 1600, doc: "\u6846\u67B6\u5361\u5EA7\uFF1A\u4E00\u6BB5\uFF08I \u6574\u6761 / L \u4E3B\u6BB5\uFF09\u76D6\u5B50\u6CBF\u5899\u7684\u6700\u957F\u957F\u5EA6\uFF1B\u8D85\u8FC7\u5C31\u5206\u6210\u51E0\u5757\u7B49\u957F\u7684\u76D6\u5B50\uFF0C\u76F8\u9694 FRAME_LID_GAP\uFF0C\u6BCF\u6761\u7F1D\u4E0B\u4E00\u5757\u4E2D\u95F4\u6258\u677F\uFF08\u548C\u4E24\u6839\u5185\u6258\u6761\u5341\u5B57\u534A\u642D\uFF09\u300221 Bunk \u4E3B\u6BB5 1505 \u4E00\u6574\u5757\u3002" },
  FRAME_DRAWER_STRIP_REVEAL: { value: 100, doc: "\u6846\u67B6 L \u7AEF\u62BD\u5C49\uFF1A\u56FA\u5B9A\u6761\u5728\u76D6\u5B50\u5E95\u4E0B\u9732\u51FA\u7684\u9AD8\u5EA6\u300221 Bunk classic \u5361\u5EA7\u662F 100 \u9AD8\u7684\u56FA\u5B9A\u6761\u4E0A\u538B 18 \u9876\u677F\uFF1B\u6846\u67B6\u6CA1\u6709\u9876\u677F\uFF0C\u6240\u4EE5\u56FA\u5B9A\u6761\u9AD8 = 100 + \u677F\u539A\u3002" },
  FRAME_DRAWER_FRONT_THICKNESS: { value: 16, doc: "\u6846\u67B6 L \u7AEF\u62BD\u5C49\u9762\u548C\u56FA\u5B9A\u6761\u7684\u95E8\u677F\u6599\u539A\uFF08\u6CA1\u6709 frontPanelThickness \u53C2\u6570\u65F6\uFF09\u3002" },
  FRAME_DRAWER_GAP: { value: 2, doc: "\u6846\u67B6 L \u7AEF\u62BD\u5C49\u9762\u56DB\u5468\u7559\u7F1D\uFF1A\u79BB\u4E24\u4FA7\u677F\u677F\u9762\u3001\u79BB\u56FA\u5B9A\u6761\u3001\u79BB\u5730\u3002" },
  FRAME_DRAWER_RAIL_DEPTH: { value: 100, doc: "\u6846\u67B6 L \u7AEF\u62BD\u5C49\u9876\u6A2A\u6761\uFF08\u56FA\u5B9A\u6761\u540E\u9762\uFF09\u4ECE\u56FA\u5B9A\u6761\u80CC\u9762\u5F80\u5899\u7684\u6DF1\u5EA6\u3002" },
  FRAME_DRAWER_RAIL_PLAIN_FRONT: { value: 30, doc: "\u62BD\u5C49\u9876\u6A2A\u6761\u9760\u56FA\u5B9A\u6761\u90A3\u5934\u4E0D\u5E26\u820C\u5934\u7684\u957F\u5EA6\uFF1B\u820C\u5934\u5728\u540E\u9762\u7684 RAIL_DEPTH - 30\u3002" },
  FRAME_DRAWER_TONGUE_GAP: { value: 0.5, doc: "\u62BD\u5C49\u9876\u6A2A\u6761\u820C\u5934 = \u6258\u677F\u69FD\u6DF1 - 0.5\uFF08\u69FD\u6DF1\u4E3A\u6258\u677F\u534A\u539A\uFF09\u3002" },
  FRAME_DRAWER_POCKET_OVERRUN: { value: 5, doc: "\u6258\u677F\u4E0A\u7684\u6A2A\u6761\u69FD\u6BD4\u820C\u5934\u6BCF\u5934\u957F 5\uFF1B\u69FD\u9AD8 = \u677F\u539A + FRAME_SLOT_CLEARANCE\u3002" },
  L_MIN_WING_WIDTH: { value: 300, doc: "\u6846\u67B6\u5F0F L\uFF1A\u62D0\u89D2\u6BB5\u6CBF\u5899\u5BBD\u5EA6\u4E0B\u9650\u3002" },
  BACK_PANEL_ABOVE_SEAT: { value: 530, doc: "\u80CC\u677F\u6BD4\u5EA7\u9762\u9AD8\u51FA\u7684\u9AD8\u5EA6\u3002\u5EA7\u9AD8 420 \u65F6\u677F\u9AD8 950\uFF1B\u5EA7\u9AD8\u518D\u52A0\uFF0C\u677F\u9AD8\u52A0\u540C\u6837\u7684\u6570\u3002" },
  BACK_PANEL_OVERHANG: { value: 50, doc: "\u80CC\u677F\u6BD4\u8FD9\u4E00\u622A\u7684\u623F\u95F4\u9762\u518D\u5F80\u623F\u95F4\u4F38\u51FA\u7684\u8DDD\u79BB\u3002\u5EA7\u4F53\u4E0D\u52A8\u3002backPanelOverhang \u6CA1\u8BBE\u65F6\u7528\u8FD9\u4E2A\u3002" },
  BACK_PANEL_CORNER_RADIUS: { value: 50, doc: "\u80CC\u677F\u9760\u623F\u95F4\u7684\u4E0A\u89D2\u5706\u89D2\u534A\u5F84\u3002\u9760\u5899\u7684\u4E0A\u89D2\u4FDD\u6301\u76F4\u89D2\u3002" },
  EDGE_BAND_THICKNESS_MM: { value: 1, doc: "\u6846\u67B6\u5F0F L \u5C01\u8FB9\u5E26\u539A\uFF0C\u5168\u90E8\u67DC\u4F53\u8272\uFF1A\u5EA7\u9762\u4E00\u5708\u7684\u4E0A\u8FB9\uFF08\u524D\u677F\u3001\u4FA7\u677F\u3001\u540E\u6A2A\u6761\uFF09\u3001\u62D0\u89D2\u6BB5\u4E24\u5757\u4FA7\u677F\u671D\u623F\u95F4\u7684\u524D\u8FB9\u3001\u76D6\u5B50\u56DB\u8FB9\u3001\u50A8\u7269\u683C\u91CC\u770B\u5F97\u89C1\u7684\u6258\u6761\u548C\u540E\u6A2A\u6761\u4E0B\u8FB9\u3002\u7AEF\u5934\u4E00\u5F8B\u5F53\u4F5C\u9876\u5899\uFF0C\u4E0D\u5C01\u3002" }
};

// generators/lounge/rules.ts
var RULES = defineRules("lounge", rules_default);

// generators/_lib/resolveJoints.ts
var EPS2 = 0.6;
function overlap(a0, a1, b0, b1) {
  return a0 < b1 - 0.01 && b0 < a1 - 0.01;
}
function contact(a2, b) {
  const axes = [
    { axis: "x", a0: a2.x0, a1: a2.x1, b0: b.x0, b1: b.x1, o1: overlap(a2.y0, a2.y1, b.y0, b.y1), o2: overlap(a2.z0, a2.z1, b.z0, b.z1) },
    { axis: "y", a0: a2.y0, a1: a2.y1, b0: b.y0, b1: b.y1, o1: overlap(a2.x0, a2.x1, b.x0, b.x1), o2: overlap(a2.z0, a2.z1, b.z0, b.z1) },
    { axis: "z", a0: a2.z0, a1: a2.z1, b0: b.z0, b1: b.z1, o1: overlap(a2.x0, a2.x1, b.x0, b.x1), o2: overlap(a2.y0, a2.y1, b.y0, b.y1) }
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
  return boundaryEdgeFaces(board, dir).map((f2) => f2.id);
}
function resolveDeclaredJoints(boards, declarations) {
  const B2 = new Map(boards.map((b) => [b.id, b]));
  const out = [];
  for (const d2 of declarations) {
    const host = B2.get(d2.hostPanelId);
    const target = B2.get(d2.targetPanelId);
    if (!host || !target) continue;
    const c2 = contact(host, target);
    const faceContact = d2.relationshipType === "face_contact";
    const kind = faceContact ? "face_contact" : "butt";
    if (!c2) {
      const hostFaces2 = faceContact ? ["A"] : [];
      const targetFaces2 = [];
      out.push(joint(d2.declarationId, kind, faceRef(host.id, hostFaces2), faceRef(target.id, targetFaces2), {
        hardware: d2.allowedHardware,
        rule: d2.ruleId
      }));
      continue;
    }
    const hostFaces = facesToward(host, c2.axis, c2.aSide, faceContact);
    const targetSide = c2.aSide === "+" ? "-" : "+";
    const targetFaces = facesToward(target, c2.axis, targetSide, faceContact);
    out.push(joint(d2.declarationId, kind, faceRef(host.id, hostFaces), faceRef(target.id, targetFaces), {
      hardware: d2.allowedHardware,
      rule: d2.ruleId
    }));
  }
  return out;
}

// generators/lounge/relationshipDeclarations.ts
var P = (declarationId, a2, b) => ({
  declarationId,
  generator: "lounge",
  panelAId: a2,
  panelBId: b,
  hostPanelId: a2,
  targetPanelId: b
});
var LOUNGE_RELATIONSHIP_DECLARATIONS = [
  P("lg_main_front_to_top", "main_front", "main_top"),
  P("lg_l_front_to_side", "l_front", "l_side"),
  P("lg_l_front_to_top", "l_front", "l_top"),
  P("lg_main_left_to_top", "main_left_side", "main_top"),
  P("lg_main_right_to_top", "main_right_side", "main_top"),
  P("lg_l_side_to_top", "l_side", "l_top"),
  P("lg_l_outer_to_top", "l_outer_side", "l_top"),
  P("lg_i_front_to_top", "i_front", "i_top"),
  P("lg_i_left_to_top", "i_left_side", "i_top"),
  P("lg_i_right_to_top", "i_right_side", "i_top"),
  P("lg_left_front_to_top", "left_front", "left_top"),
  P("lg_left_left_to_top", "left_left_side", "left_top"),
  P("lg_left_right_to_top", "left_right_side", "left_top"),
  P("lg_left_side_to_top", "left_side", "left_top"),
  P("lg_left_strip_to_top", "left_support_strip", "left_top"),
  P("lg_back_front_to_top", "back_front", "back_top"),
  P("lg_back_left_to_top", "back_left_side", "back_top"),
  P("lg_back_right_to_top", "back_right_side", "back_top"),
  P("lg_right_front_to_top", "right_front", "right_top"),
  P("lg_right_left_to_top", "right_left_side", "right_top"),
  P("lg_right_right_to_top", "right_right_side", "right_top"),
  P("lg_right_side_to_top", "right_side", "right_top"),
  P("lg_right_strip_to_top", "right_support_strip", "right_top"),
  // Frame L: rails drop into slots, supports sit against the panels, lids rest on the frame.
  P("lg_rear_rail_main_end", "back_rail", "main_end"),
  P("lg_rear_rail_l_side", "back_rail", "l_side"),
  P("lg_rear_rail_l_outer", "back_rail", "l_outer_side"),
  P("lg_main_front_to_end", "main_front", "main_end"),
  P("lg_main_front_to_l_side", "main_front", "l_side"),
  P("lg_l_front_to_outer", "l_front", "l_outer_side"),
  P("lg_main_end_support", "main_end_support", "main_end"),
  P("lg_main_l_support", "main_l_support", "l_side"),
  P("lg_rail_back_end", "main_rail_back", "main_end_support"),
  P("lg_rail_back_l", "main_rail_back", "main_l_support"),
  P("lg_rail_front_end", "main_rail_front", "main_end_support"),
  P("lg_rail_front_l", "main_rail_front", "main_l_support"),
  P("lg_l_support_inner", "l_support_inner", "l_side"),
  P("lg_l_support_outer", "l_support_outer", "l_outer_side"),
  P("lg_main_lid_on_rail", "main_lid", "main_rail_back"),
  P("lg_l_lid_on_support", "l_lid", "l_support_inner"),
  // Frame L wing drawer: the strip stands between the sides on the rail, the rail tongues into the supports.
  P("lg_l_strip_to_side", "l_drawer_strip", "l_side"),
  P("lg_l_strip_to_outer", "l_drawer_strip", "l_outer_side"),
  P("lg_l_strip_on_rail", "l_drawer_strip", "l_drawer_rail"),
  P("lg_l_drawer_rail_inner", "l_drawer_rail", "l_support_inner"),
  P("lg_l_drawer_rail_outer", "l_drawer_rail", "l_support_outer"),
  // Frame I: the L main run on its own, an end panel at each end.
  P("lg_i_rear_rail_left", "back_rail", "i_left_end"),
  P("lg_i_rear_rail_right", "back_rail", "i_right_end"),
  P("lg_i_front_to_left", "i_front", "i_left_end"),
  P("lg_i_front_to_right", "i_front", "i_right_end"),
  P("lg_i_left_support", "i_left_support", "i_left_end"),
  P("lg_i_right_support", "i_right_support", "i_right_end"),
  P("lg_i_rail_back_left", "i_rail_back", "i_left_support"),
  P("lg_i_rail_back_right", "i_rail_back", "i_right_support"),
  P("lg_i_rail_front_left", "i_rail_front", "i_left_support"),
  P("lg_i_rail_front_right", "i_rail_front", "i_right_support"),
  P("lg_i_lid_on_rail", "i_lid", "i_rail_back"),
  // Frame parallel: each run like the L wing, the rear rail on the wall in a half slot on the seat front.
  ...["left", "right"].flatMap((s) => [
    P(`lg_${s}_rear_rail_side`, `${s}_rear_rail`, `${s}_side`),
    P(`lg_${s}_front_to_side`, `${s}_front`, `${s}_side`),
    P(`lg_${s}_inner_support`, `${s}_inner_support`, `${s}_side`),
    P(`lg_${s}_outer_support_front`, `${s}_outer_support`, `${s}_front`),
    P(`lg_${s}_lid_on_support`, `${s}_lid`, `${s}_inner_support`),
    P(`lg_${s}_strip_to_side`, `${s}_drawer_strip`, `${s}_side`),
    P(`lg_${s}_strip_on_rail`, `${s}_drawer_strip`, `${s}_drawer_rail`),
    P(`lg_${s}_drawer_rail_outer`, `${s}_drawer_rail`, `${s}_outer_support`),
    P(`lg_${s}_drawer_rail_inner`, `${s}_drawer_rail`, `${s}_inner_support`)
  ])
];
function frameSplitDeclarations(ids) {
  const out = [];
  for (const id of ids) {
    const mid = /^(main|i|left|right)_mid_support_(\d+)$/.exec(id);
    if (mid) {
      out.push(P(`lg_${mid[1]}_rail_back_mid_${mid[2]}`, `${mid[1]}_rail_back`, id));
      out.push(P(`lg_${mid[1]}_rail_front_mid_${mid[2]}`, `${mid[1]}_rail_front`, id));
    }
    const lid = /^(main|i|left|right)_lid_(\d+)$/.exec(id);
    if (lid) out.push(P(`lg_${id}_on_rail`, id, `${lid[1]}_rail_back`));
  }
  return out;
}
function relationshipDeclarationsForBoards(ids) {
  return [...LOUNGE_RELATIONSHIP_DECLARATIONS, ...frameSplitDeclarations(ids)].filter((d2) => ids.has(d2.panelAId) && ids.has(d2.panelBId));
}

// generators/lounge/faces.ts
function buildLoungeFaces(fb) {
  const B2 = new Map(fb.boards.map((b) => [b.id, b]));
  for (const b of fb.boards) {
    b.role = b.category;
    if (b.boardType === "cabinet_door" || b.boardType === "drawer_front" || b.boardType === "fixed_front") {
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, "A", { semantic: "back", visible: false });
    }
    if (b.boardType === "top_panel") {
      annotate(b, "A", { semantic: "top", visible: true });
      annotate(b, "B", { semantic: "bottom" });
    }
  }
  for (const op of fb.openings) {
    const topId = `${op.id.replace(/_opening$/, "")}_top`;
    const top = B2.get(topId);
    if (!top) continue;
    const r = localRect(top, { x: [op.x0, op.x0 + op.width], y: [op.y0, op.y0 + op.depth] });
    const lidId = `${topId.replace(/_top$/, "")}_lid`;
    addFeature(top, "A", {
      id: op.id,
      kind: "cutout",
      ...r,
      through: true,
      ...B2.has(lidId) ? { for: lidId } : {},
      source: "lounge"
    });
  }
  for (const lid of fb.lids) {
    const board = B2.get(lid.id);
    if (!board) continue;
    const key = `${lid.id}.feat.finger`;
    const cx = dim(`${key}.x`, { width: ref(`${lid.id}.x1`), x0: ref(`${lid.id}.x0`) }, (t) => (t.width - t.x0) / 2);
    const cy = dim(`${key}.y`, { depth: ref(`${lid.id}.y1`), y0: ref(`${lid.id}.y0`) }, (t) => (t.depth - t.y0) / 2);
    addFeature(board, "A", {
      id: `${lid.id}_finger`,
      kind: "hole",
      center: [cx, cy],
      diameter: lid.holeDiameter,
      through: true,
      for: "finger",
      key,
      source: "lounge"
    });
  }
  for (const h of fb.hinges ?? []) {
    const fp = B2.get(h.panelId);
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
      source: "lounge"
    });
  }
  for (const lock of fb.locks ?? []) {
    const fp = B2.get(lock.panelId);
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
      source: "lounge"
    });
  }
  for (const g2 of fb.grooves ?? []) {
    const board = B2.get(g2.boardId);
    if (!board) continue;
    addFeature(board, g2.face, {
      id: g2.id,
      kind: "groove",
      u0: g2.u0,
      u1: g2.u1,
      v0: g2.v0,
      v1: g2.v1,
      depth: g2.depth,
      for: g2.for ?? "middle_cabinet_mid_divider",
      source: "lounge"
    });
  }
  if (fb.boards.some((b) => b.boardType === "rear_rail")) bandFrameEdges(fb.boards, fb.carcassColour ?? "White Stipple", fb.doorColour);
  return resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(new Set(fb.boards.map((b) => b.id))));
}
function bandFrameEdges(boards, colour, doorColour) {
  const tape = { thickness: RULES.EDGE_BAND_THICKNESS_MM.value, colour };
  const band = (b, normal) => {
    if (!b) return;
    for (const f2 of boundaryEdgeFaces(b, normal)) setEdgeBand(b, Number(f2.id.slice(1)), tape);
  };
  const by = (id) => boards.find((b) => b.id === id);
  for (const id of ["main_front", "l_front", "main_end", "l_side", "l_outer_side", "i_front", "i_left_end", "i_right_end", "back_rail"]) band(by(id), "+Z");
  band(by("l_side"), "-Y");
  band(by("l_outer_side"), "-Y");
  for (const id of ["i_rail_back", "i_rail_front"]) band(by(id), "-Z");
  const cover = by("parallel_avoidance_top");
  for (const side of ["left", "right"]) {
    if (!by(`${side}_rear_rail`)) continue;
    for (const id of [`${side}_front`, `${side}_side`, `${side}_rear_rail`]) band(by(id), "+Z");
    band(by(`${side}_side`), "-Y");
    if (!cover) band(by(`${side}_rear_rail`), "-Z");
  }
  if (by("left_rear_rail")) band(cover, "-Y");
  const doorTape = { thickness: RULES.EDGE_BAND_THICKNESS_MM.value, colour: doorColour };
  for (const b of boards.filter((q) => q.id.startsWith("middle_cabinet_"))) {
    const isDoor = b.boardType === "cabinet_door";
    if (b.boardType === "cabinet_divider") {
      band(b, "-Y");
      continue;
    }
    for (const f2 of edgeFaces(b)) {
      if (!isDoor && f2.normal === "+Y") continue;
      if (b.boardType === "cabinet_side" && (f2.normal === "+Z" || f2.normal === "-Z")) continue;
      setEdgeBand(b, Number(f2.id.slice(1)), isDoor ? doorTape : tape);
    }
  }
  const drawers = {
    l: { frame: ["l_side", "l_outer_side"], supports: ["l_support_inner", "l_support_outer"] },
    left: { frame: ["left_side"], supports: ["left_outer_support", "left_inner_support"] },
    right: { frame: ["right_side"], supports: ["right_outer_support", "right_inner_support"] }
  };
  for (const [p2, d2] of Object.entries(drawers)) {
    if (!by(`${p2}_drawer_front`)) continue;
    for (const id of [`${p2}_drawer_front`, `${p2}_drawer_strip`]) {
      const b = by(id);
      for (const f2 of edgeFaces(b)) setEdgeBand(b, Number(f2.id.slice(1)), doorTape);
    }
    for (const id of d2.frame) {
      const b = by(id);
      if (b) for (const f2 of boundaryEdgeFaces(b, "-Y")) setEdgeBand(b, Number(f2.id.slice(1)), doorTape);
    }
    band(by(`${p2}_drawer_rail`), "+Y");
    for (const id of d2.supports) band(by(id), "-Y");
  }
  for (const id of ["main_rail_back", "main_rail_front", "back_rail"]) band(by(id), "-Z");
  for (const id of ["l_back", "left_back", "right_back"]) {
    const b = by(id);
    if (!b) continue;
    for (const f2 of edgeFaces(b)) {
      if (f2.normal === "+Y" || f2.normal === "-Z") continue;
      setEdgeBand(b, Number(f2.id.slice(1)), tape);
    }
  }
  for (const lid of boards.filter((b) => b.boardType === "lid")) {
    for (const f2 of edgeFaces(lid)) setEdgeBand(lid, Number(f2.id.slice(1)), tape);
  }
}

// node_modules/splaytree/dist/splaytree.js
var f = class {
  constructor(t, e) {
    this.next = null, this.key = t, this.data = e, this.left = null, this.right = null;
  }
};
function d(n, t) {
  return n > t ? 1 : n < t ? -1 : 0;
}
function u(n, t, e) {
  const r = new f(null, null);
  let l = r, i = r;
  for (; ; ) {
    const o = e(n, t.key);
    if (o < 0) {
      if (t.left === null) break;
      if (e(n, t.left.key) < 0) {
        const s = t.left;
        if (t.left = s.right, s.right = t, t = s, t.left === null) break;
      }
      i.left = t, i = t, t = t.left;
    } else if (o > 0) {
      if (t.right === null) break;
      if (e(n, t.right.key) > 0) {
        const s = t.right;
        if (t.right = s.left, s.left = t, t = s, t.right === null) break;
      }
      l.right = t, l = t, t = t.right;
    } else break;
  }
  return l.right = t.left, i.left = t.right, t.left = r.right, t.right = r.left, t;
}
function c(n, t, e, r) {
  const l = new f(n, t);
  if (e === null)
    return l.left = l.right = null, l;
  e = u(n, e, r);
  const i = r(n, e.key);
  return i < 0 ? (l.left = e.left, l.right = e, e.left = null) : i >= 0 && (l.right = e.right, l.left = e, e.right = null), l;
}
function m(n, t, e) {
  let r = null, l = null;
  if (t) {
    t = u(n, t, e);
    const i = e(t.key, n);
    i === 0 ? (r = t.left, l = t.right) : i < 0 ? (l = t.right, t.right = null, r = t) : (r = t.left, t.left = null, l = t);
  }
  return { left: r, right: l };
}
function w(n, t, e) {
  return t === null ? n : (n === null || (t = u(n.key, t, e), t.left = n), t);
}
function _(n, t, e, r, l) {
  if (n) {
    r(`${t}${e ? "\u2514\u2500\u2500 " : "\u251C\u2500\u2500 "}${l(n)}
`);
    const i = t + (e ? "    " : "\u2502   ");
    n.left && _(n.left, i, false, r, l), n.right && _(n.right, i, true, r, l);
  }
}
var z = class {
  constructor(t = d) {
    this._root = null, this._size = 0, this._comparator = t;
  }
  /**
   * Inserts a key, allows duplicates
   */
  insert(t, e) {
    return this._size++, this._root = c(t, e, this._root, this._comparator);
  }
  /**
   * Adds a key, if it is not present in the tree
   */
  add(t, e) {
    const r = new f(t, e);
    this._root === null && (r.left = r.right = null, this._size++, this._root = r);
    const l = this._comparator, i = u(t, this._root, l), o = l(t, i.key);
    return o === 0 ? this._root = i : (o < 0 ? (r.left = i.left, r.right = i, i.left = null) : o > 0 && (r.right = i.right, r.left = i, i.right = null), this._size++, this._root = r), this._root;
  }
  /**
   * @param  {Key} key
   * @return {Node|null}
   */
  remove(t) {
    this._root = this._remove(t, this._root, this._comparator);
  }
  /**
   * Deletes i from the tree if it's there
   */
  _remove(t, e, r) {
    let l;
    return e === null ? null : (e = u(t, e, r), r(t, e.key) === 0 ? (e.left === null ? l = e.right : (l = u(t, e.left, r), l.right = e.right), this._size--, l) : e);
  }
  /**
   * Removes and returns the node with smallest key
   */
  pop() {
    let t = this._root;
    if (t) {
      for (; t.left; ) t = t.left;
      return this._root = u(t.key, this._root, this._comparator), this._root = this._remove(t.key, this._root, this._comparator), { key: t.key, data: t.data };
    }
    return null;
  }
  /**
   * Find without splaying
   */
  findStatic(t) {
    let e = this._root;
    const r = this._comparator;
    for (; e; ) {
      const l = r(t, e.key);
      if (l === 0) return e;
      l < 0 ? e = e.left : e = e.right;
    }
    return null;
  }
  find(t) {
    return this._root && (this._root = u(t, this._root, this._comparator), this._comparator(t, this._root.key) !== 0) ? null : this._root;
  }
  contains(t) {
    let e = this._root;
    const r = this._comparator;
    for (; e; ) {
      const l = r(t, e.key);
      if (l === 0) return true;
      l < 0 ? e = e.left : e = e.right;
    }
    return false;
  }
  forEach(t, e) {
    let r = this._root;
    const l = [];
    let i = false;
    for (; !i; )
      r !== null ? (l.push(r), r = r.left) : l.length !== 0 ? (r = l.pop(), t.call(e, r), r = r.right) : i = true;
    return this;
  }
  /**
   * Walk key range from `low` to `high`. Stops if `fn` returns a value.
   */
  range(t, e, r, l) {
    const i = [], o = this._comparator;
    let s = this._root, h;
    for (; i.length !== 0 || s; )
      if (s)
        i.push(s), s = s.left;
      else {
        if (s = i.pop(), h = o(s.key, e), h > 0)
          break;
        if (o(s.key, t) >= 0 && r.call(l, s))
          return this;
        s = s.right;
      }
    return this;
  }
  /**
   * Returns array of keys
   */
  keys() {
    const t = [];
    return this.forEach(({ key: e }) => {
      t.push(e);
    }), t;
  }
  /**
   * Returns array of all the data in the nodes
   */
  values() {
    const t = [];
    return this.forEach(({ data: e }) => {
      t.push(e);
    }), t;
  }
  min() {
    return this._root ? this.minNode(this._root).key : null;
  }
  max() {
    return this._root ? this.maxNode(this._root).key : null;
  }
  minNode(t = this._root) {
    if (t) for (; t.left; ) t = t.left;
    return t;
  }
  maxNode(t = this._root) {
    if (t) for (; t.right; ) t = t.right;
    return t;
  }
  /**
   * Returns node at given index
   */
  at(t) {
    let e = this._root, r = false, l = 0;
    const i = [];
    for (; !r; )
      if (e)
        i.push(e), e = e.left;
      else if (i.length > 0) {
        if (e = i.pop(), l === t) return e;
        l++, e = e.right;
      } else r = true;
    return null;
  }
  next(t) {
    let e = this._root, r = null;
    if (t.right) {
      for (r = t.right; r.left; ) r = r.left;
      return r;
    }
    const l = this._comparator;
    for (; e; ) {
      const i = l(t.key, e.key);
      if (i === 0) break;
      i < 0 ? (r = e, e = e.left) : e = e.right;
    }
    return r;
  }
  prev(t) {
    let e = this._root, r = null;
    if (t.left !== null) {
      for (r = t.left; r.right; ) r = r.right;
      return r;
    }
    const l = this._comparator;
    for (; e; ) {
      const i = l(t.key, e.key);
      if (i === 0) break;
      i < 0 ? e = e.left : (r = e, e = e.right);
    }
    return r;
  }
  clear() {
    return this._root = null, this._size = 0, this;
  }
  toList() {
    return k(this._root);
  }
  /**
   * Bulk-load items. Both array have to be same size
   */
  load(t, e = [], r = false) {
    let l = t.length;
    const i = this._comparator;
    if (r && g(t, e, 0, l - 1, i), this._root === null)
      this._root = a(t, e, 0, l), this._size = l;
    else {
      const o = y(
        this.toList(),
        x(t, e),
        i
      );
      l = this._size + l, this._root = p({ head: o }, 0, l);
    }
    return this;
  }
  isEmpty() {
    return this._root === null;
  }
  get size() {
    return this._size;
  }
  get root() {
    return this._root;
  }
  toString(t = (e) => String(e.key)) {
    const e = [];
    return _(this._root, "", true, (r) => e.push(r), t), e.join("");
  }
  update(t, e, r) {
    const l = this._comparator;
    let { left: i, right: o } = m(t, this._root, l);
    l(t, e) < 0 ? o = c(e, r, o, l) : i = c(e, r, i, l), this._root = w(i, o, l);
  }
  split(t) {
    return m(t, this._root, this._comparator);
  }
  *[Symbol.iterator]() {
    let t = this._root;
    const e = [];
    let r = false;
    for (; !r; )
      t !== null ? (e.push(t), t = t.left) : e.length !== 0 ? (t = e.pop(), yield t, t = t.right) : r = true;
  }
};
function a(n, t, e, r) {
  const l = r - e;
  if (l > 0) {
    const i = e + Math.floor(l / 2), o = n[i], s = t[i], h = new f(o, s);
    return h.left = a(n, t, e, i), h.right = a(n, t, i + 1, r), h;
  }
  return null;
}
function x(n, t) {
  const e = new f(null, null);
  let r = e;
  for (let l = 0; l < n.length; l++)
    r = r.next = new f(n[l], t[l]);
  return r.next = null, e.next;
}
function k(n) {
  let t = n;
  const e = [];
  let r = false;
  const l = new f(null, null);
  let i = l;
  for (; !r; )
    t ? (e.push(t), t = t.left) : e.length > 0 ? (t = i = i.next = e.pop(), t = t.right) : r = true;
  return i.next = null, l.next;
}
function p(n, t, e) {
  const r = e - t;
  if (r > 0) {
    const l = t + Math.floor(r / 2), i = p(n, t, l), o = n.head;
    return o.left = i, n.head = n.head.next, o.right = p(n, l + 1, e), o;
  }
  return null;
}
function y(n, t, e) {
  const r = new f(null, null);
  let l = r, i = n, o = t;
  for (; i !== null && o !== null; )
    e(i.key, o.key) < 0 ? (l.next = i, i = i.next) : (l.next = o, o = o.next), l = l.next;
  return i !== null ? l.next = i : o !== null && (l.next = o), r.next;
}
function g(n, t, e, r, l) {
  if (e >= r) return;
  const i = n[e + r >> 1];
  let o = e - 1, s = r + 1;
  for (; ; ) {
    do
      o++;
    while (l(n[o], i) < 0);
    do
      s--;
    while (l(n[s], i) > 0);
    if (o >= s) break;
    let h = n[o];
    n[o] = n[s], n[s] = h, h = t[o], t[o] = t[s], t[s] = h;
  }
  g(n, t, e, s, l), g(n, t, s + 1, r, l);
}

// node_modules/robust-predicates/esm/util.js
var epsilon = 11102230246251565e-32;
var splitter = 134217729;
var resulterrbound = (3 + 8 * epsilon) * epsilon;
function sum(elen, e, flen, f2, h) {
  let Q, Qnew, hh, bvirt;
  let enow = e[0];
  let fnow = f2[0];
  let eindex = 0;
  let findex = 0;
  if (fnow > enow === fnow > -enow) {
    Q = enow;
    enow = e[++eindex];
  } else {
    Q = fnow;
    fnow = f2[++findex];
  }
  let hindex = 0;
  if (eindex < elen && findex < flen) {
    if (fnow > enow === fnow > -enow) {
      Qnew = enow + Q;
      hh = Q - (Qnew - enow);
      enow = e[++eindex];
    } else {
      Qnew = fnow + Q;
      hh = Q - (Qnew - fnow);
      fnow = f2[++findex];
    }
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
    while (eindex < elen && findex < flen) {
      if (fnow > enow === fnow > -enow) {
        Qnew = Q + enow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (enow - bvirt);
        enow = e[++eindex];
      } else {
        Qnew = Q + fnow;
        bvirt = Qnew - Q;
        hh = Q - (Qnew - bvirt) + (fnow - bvirt);
        fnow = f2[++findex];
      }
      Q = Qnew;
      if (hh !== 0) {
        h[hindex++] = hh;
      }
    }
  }
  while (eindex < elen) {
    Qnew = Q + enow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (enow - bvirt);
    enow = e[++eindex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  while (findex < flen) {
    Qnew = Q + fnow;
    bvirt = Qnew - Q;
    hh = Q - (Qnew - bvirt) + (fnow - bvirt);
    fnow = f2[++findex];
    Q = Qnew;
    if (hh !== 0) {
      h[hindex++] = hh;
    }
  }
  if (Q !== 0 || hindex === 0) {
    h[hindex++] = Q;
  }
  return hindex;
}
function estimate(elen, e) {
  let Q = e[0];
  for (let i = 1; i < elen; i++) Q += e[i];
  return Q;
}
function vec(n) {
  return new Float64Array(n);
}

// node_modules/robust-predicates/esm/orient2d.js
var ccwerrboundA = (3 + 16 * epsilon) * epsilon;
var ccwerrboundB = (2 + 12 * epsilon) * epsilon;
var ccwerrboundC = (9 + 64 * epsilon) * epsilon * epsilon;
var B = vec(4);
var C1 = vec(8);
var C2 = vec(12);
var D = vec(16);
var u2 = vec(4);
function orient2dadapt(ax, ay, bx, by, cx, cy, detsum) {
  let acxtail, acytail, bcxtail, bcytail;
  let bvirt, c2, ahi, alo, bhi, blo, _i, _j, _0, s1, s0, t1, t0, u32;
  const acx = ax - cx;
  const bcx = bx - cx;
  const acy = ay - cy;
  const bcy = by - cy;
  s1 = acx * bcy;
  c2 = splitter * acx;
  ahi = c2 - (c2 - acx);
  alo = acx - ahi;
  c2 = splitter * bcy;
  bhi = c2 - (c2 - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcx;
  c2 = splitter * acy;
  ahi = c2 - (c2 - acy);
  alo = acy - ahi;
  c2 = splitter * bcx;
  bhi = c2 - (c2 - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  B[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  B[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  B[2] = _j - (u32 - bvirt) + (_i - bvirt);
  B[3] = u32;
  let det = estimate(4, B);
  let errbound = ccwerrboundB * detsum;
  if (det >= errbound || -det >= errbound) {
    return det;
  }
  bvirt = ax - acx;
  acxtail = ax - (acx + bvirt) + (bvirt - cx);
  bvirt = bx - bcx;
  bcxtail = bx - (bcx + bvirt) + (bvirt - cx);
  bvirt = ay - acy;
  acytail = ay - (acy + bvirt) + (bvirt - cy);
  bvirt = by - bcy;
  bcytail = by - (bcy + bvirt) + (bvirt - cy);
  if (acxtail === 0 && acytail === 0 && bcxtail === 0 && bcytail === 0) {
    return det;
  }
  errbound = ccwerrboundC * detsum + resulterrbound * Math.abs(det);
  det += acx * bcytail + bcy * acxtail - (acy * bcxtail + bcx * acytail);
  if (det >= errbound || -det >= errbound) return det;
  s1 = acxtail * bcy;
  c2 = splitter * acxtail;
  ahi = c2 - (c2 - acxtail);
  alo = acxtail - ahi;
  c2 = splitter * bcy;
  bhi = c2 - (c2 - bcy);
  blo = bcy - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcx;
  c2 = splitter * acytail;
  ahi = c2 - (c2 - acytail);
  alo = acytail - ahi;
  c2 = splitter * bcx;
  bhi = c2 - (c2 - bcx);
  blo = bcx - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u2[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u2[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u2[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u2[3] = u32;
  const C1len = sum(4, B, 4, u2, C1);
  s1 = acx * bcytail;
  c2 = splitter * acx;
  ahi = c2 - (c2 - acx);
  alo = acx - ahi;
  c2 = splitter * bcytail;
  bhi = c2 - (c2 - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acy * bcxtail;
  c2 = splitter * acy;
  ahi = c2 - (c2 - acy);
  alo = acy - ahi;
  c2 = splitter * bcxtail;
  bhi = c2 - (c2 - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u2[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u2[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u2[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u2[3] = u32;
  const C2len = sum(C1len, C1, 4, u2, C2);
  s1 = acxtail * bcytail;
  c2 = splitter * acxtail;
  ahi = c2 - (c2 - acxtail);
  alo = acxtail - ahi;
  c2 = splitter * bcytail;
  bhi = c2 - (c2 - bcytail);
  blo = bcytail - bhi;
  s0 = alo * blo - (s1 - ahi * bhi - alo * bhi - ahi * blo);
  t1 = acytail * bcxtail;
  c2 = splitter * acytail;
  ahi = c2 - (c2 - acytail);
  alo = acytail - ahi;
  c2 = splitter * bcxtail;
  bhi = c2 - (c2 - bcxtail);
  blo = bcxtail - bhi;
  t0 = alo * blo - (t1 - ahi * bhi - alo * bhi - ahi * blo);
  _i = s0 - t0;
  bvirt = s0 - _i;
  u2[0] = s0 - (_i + bvirt) + (bvirt - t0);
  _j = s1 + _i;
  bvirt = _j - s1;
  _0 = s1 - (_j - bvirt) + (_i - bvirt);
  _i = _0 - t1;
  bvirt = _0 - _i;
  u2[1] = _0 - (_i + bvirt) + (bvirt - t1);
  u32 = _j + _i;
  bvirt = u32 - _j;
  u2[2] = _j - (u32 - bvirt) + (_i - bvirt);
  u2[3] = u32;
  const Dlen = sum(C2len, C2, 4, u2, D);
  return D[Dlen - 1];
}
function orient2d(ax, ay, bx, by, cx, cy) {
  const detleft = (ay - cy) * (bx - cx);
  const detright = (ax - cx) * (by - cy);
  const det = detleft - detright;
  const detsum = Math.abs(detleft + detright);
  if (Math.abs(det) >= ccwerrboundA * detsum) return det;
  return -orient2dadapt(ax, ay, bx, by, cx, cy, detsum);
}

// node_modules/robust-predicates/esm/orient3d.js
var o3derrboundA = (7 + 56 * epsilon) * epsilon;
var o3derrboundB = (3 + 28 * epsilon) * epsilon;
var o3derrboundC = (26 + 288 * epsilon) * epsilon * epsilon;
var bc = vec(4);
var ca = vec(4);
var ab = vec(4);
var at_b = vec(4);
var at_c = vec(4);
var bt_c = vec(4);
var bt_a = vec(4);
var ct_a = vec(4);
var ct_b = vec(4);
var bct = vec(8);
var cat = vec(8);
var abt = vec(8);
var u3 = vec(4);
var _8 = vec(8);
var _8b = vec(8);
var _16 = vec(16);
var _12 = vec(12);
var fin = vec(192);
var fin2 = vec(192);

// node_modules/robust-predicates/esm/incircle.js
var iccerrboundA = (10 + 96 * epsilon) * epsilon;
var iccerrboundB = (4 + 48 * epsilon) * epsilon;
var iccerrboundC = (44 + 576 * epsilon) * epsilon * epsilon;
var bc2 = vec(4);
var ca2 = vec(4);
var ab2 = vec(4);
var aa = vec(4);
var bb = vec(4);
var cc = vec(4);
var u4 = vec(4);
var v = vec(4);
var axtbc = vec(8);
var aytbc = vec(8);
var bxtca = vec(8);
var bytca = vec(8);
var cxtab = vec(8);
var cytab = vec(8);
var abt2 = vec(8);
var bct2 = vec(8);
var cat2 = vec(8);
var abtt = vec(4);
var bctt = vec(4);
var catt = vec(4);
var _82 = vec(8);
var _162 = vec(16);
var _16b = vec(16);
var _16c = vec(16);
var _32 = vec(32);
var _32b = vec(32);
var _48 = vec(48);
var _64 = vec(64);
var fin3 = vec(1152);
var fin22 = vec(1152);

// node_modules/robust-predicates/esm/insphere.js
var isperrboundA = (16 + 224 * epsilon) * epsilon;
var isperrboundB = (5 + 72 * epsilon) * epsilon;
var isperrboundC = (71 + 1408 * epsilon) * epsilon * epsilon;
var ab3 = vec(4);
var bc3 = vec(4);
var cd = vec(4);
var de = vec(4);
var ea = vec(4);
var ac = vec(4);
var bd = vec(4);
var ce = vec(4);
var da = vec(4);
var eb = vec(4);
var abc = vec(24);
var bcd = vec(24);
var cde = vec(24);
var dea = vec(24);
var eab = vec(24);
var abd = vec(24);
var bce = vec(24);
var cda = vec(24);
var deb = vec(24);
var eac = vec(24);
var adet = vec(1152);
var bdet = vec(1152);
var cdet = vec(1152);
var ddet = vec(1152);
var edet = vec(1152);
var abdet = vec(2304);
var cddet = vec(2304);
var cdedet = vec(3456);
var deter = vec(5760);
var _83 = vec(8);
var _8b2 = vec(8);
var _8c = vec(8);
var _163 = vec(16);
var _24 = vec(24);
var _482 = vec(48);
var _48b = vec(48);
var _96 = vec(96);
var _192 = vec(192);
var _384x = vec(384);
var _384y = vec(384);
var _384z = vec(384);
var _768 = vec(768);
var xdet = vec(96);
var ydet = vec(96);
var zdet = vec(96);
var fin4 = vec(1152);

// node_modules/polygon-clipping/dist/polygon-clipping.esm.js
var isInBbox = (bbox, point) => {
  return bbox.ll.x <= point.x && point.x <= bbox.ur.x && bbox.ll.y <= point.y && point.y <= bbox.ur.y;
};
var getBboxOverlap = (b1, b2) => {
  if (b2.ur.x < b1.ll.x || b1.ur.x < b2.ll.x || b2.ur.y < b1.ll.y || b1.ur.y < b2.ll.y) return null;
  const lowerX = b1.ll.x < b2.ll.x ? b2.ll.x : b1.ll.x;
  const upperX = b1.ur.x < b2.ur.x ? b1.ur.x : b2.ur.x;
  const lowerY = b1.ll.y < b2.ll.y ? b2.ll.y : b1.ll.y;
  const upperY = b1.ur.y < b2.ur.y ? b1.ur.y : b2.ur.y;
  return {
    ll: {
      x: lowerX,
      y: lowerY
    },
    ur: {
      x: upperX,
      y: upperY
    }
  };
};
var epsilon2 = Number.EPSILON;
if (epsilon2 === void 0) epsilon2 = Math.pow(2, -52);
var EPSILON_SQ = epsilon2 * epsilon2;
var cmp = (a2, b) => {
  if (-epsilon2 < a2 && a2 < epsilon2) {
    if (-epsilon2 < b && b < epsilon2) {
      return 0;
    }
  }
  const ab4 = a2 - b;
  if (ab4 * ab4 < EPSILON_SQ * a2 * b) {
    return 0;
  }
  return a2 < b ? -1 : 1;
};
var PtRounder = class {
  constructor() {
    this.reset();
  }
  reset() {
    this.xRounder = new CoordRounder();
    this.yRounder = new CoordRounder();
  }
  round(x2, y2) {
    return {
      x: this.xRounder.round(x2),
      y: this.yRounder.round(y2)
    };
  }
};
var CoordRounder = class {
  constructor() {
    this.tree = new z();
    this.round(0);
  }
  // Note: this can rounds input values backwards or forwards.
  //       You might ask, why not restrict this to just rounding
  //       forwards? Wouldn't that allow left endpoints to always
  //       remain left endpoints during splitting (never change to
  //       right). No - it wouldn't, because we snap intersections
  //       to endpoints (to establish independence from the segment
  //       angle for t-intersections).
  round(coord) {
    const node = this.tree.add(coord);
    const prevNode = this.tree.prev(node);
    if (prevNode !== null && cmp(node.key, prevNode.key) === 0) {
      this.tree.remove(coord);
      return prevNode.key;
    }
    const nextNode = this.tree.next(node);
    if (nextNode !== null && cmp(node.key, nextNode.key) === 0) {
      this.tree.remove(coord);
      return nextNode.key;
    }
    return coord;
  }
};
var rounder = new PtRounder();
var crossProduct = (a2, b) => a2.x * b.y - a2.y * b.x;
var dotProduct = (a2, b) => a2.x * b.x + a2.y * b.y;
var compareVectorAngles = (basePt, endPt1, endPt2) => {
  const res = orient2d(basePt.x, basePt.y, endPt1.x, endPt1.y, endPt2.x, endPt2.y);
  if (res > 0) return -1;
  if (res < 0) return 1;
  return 0;
};
var length = (v2) => Math.sqrt(dotProduct(v2, v2));
var sineOfAngle = (pShared, pBase, pAngle) => {
  const vBase = {
    x: pBase.x - pShared.x,
    y: pBase.y - pShared.y
  };
  const vAngle = {
    x: pAngle.x - pShared.x,
    y: pAngle.y - pShared.y
  };
  return crossProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
var cosineOfAngle = (pShared, pBase, pAngle) => {
  const vBase = {
    x: pBase.x - pShared.x,
    y: pBase.y - pShared.y
  };
  const vAngle = {
    x: pAngle.x - pShared.x,
    y: pAngle.y - pShared.y
  };
  return dotProduct(vAngle, vBase) / length(vAngle) / length(vBase);
};
var horizontalIntersection = (pt, v2, y2) => {
  if (v2.y === 0) return null;
  return {
    x: pt.x + v2.x / v2.y * (y2 - pt.y),
    y: y2
  };
};
var verticalIntersection = (pt, v2, x2) => {
  if (v2.x === 0) return null;
  return {
    x: x2,
    y: pt.y + v2.y / v2.x * (x2 - pt.x)
  };
};
var intersection$1 = (pt1, v1, pt2, v2) => {
  if (v1.x === 0) return verticalIntersection(pt2, v2, pt1.x);
  if (v2.x === 0) return verticalIntersection(pt1, v1, pt2.x);
  if (v1.y === 0) return horizontalIntersection(pt2, v2, pt1.y);
  if (v2.y === 0) return horizontalIntersection(pt1, v1, pt2.y);
  const kross = crossProduct(v1, v2);
  if (kross == 0) return null;
  const ve = {
    x: pt2.x - pt1.x,
    y: pt2.y - pt1.y
  };
  const d1 = crossProduct(ve, v1) / kross;
  const d2 = crossProduct(ve, v2) / kross;
  const x1 = pt1.x + d2 * v1.x, x2 = pt2.x + d1 * v2.x;
  const y1 = pt1.y + d2 * v1.y, y2 = pt2.y + d1 * v2.y;
  const x3 = (x1 + x2) / 2;
  const y3 = (y1 + y2) / 2;
  return {
    x: x3,
    y: y3
  };
};
var SweepEvent = class _SweepEvent {
  // for ordering sweep events in the sweep event queue
  static compare(a2, b) {
    const ptCmp = _SweepEvent.comparePoints(a2.point, b.point);
    if (ptCmp !== 0) return ptCmp;
    if (a2.point !== b.point) a2.link(b);
    if (a2.isLeft !== b.isLeft) return a2.isLeft ? 1 : -1;
    return Segment.compare(a2.segment, b.segment);
  }
  // for ordering points in sweep line order
  static comparePoints(aPt, bPt) {
    if (aPt.x < bPt.x) return -1;
    if (aPt.x > bPt.x) return 1;
    if (aPt.y < bPt.y) return -1;
    if (aPt.y > bPt.y) return 1;
    return 0;
  }
  // Warning: 'point' input will be modified and re-used (for performance)
  constructor(point, isLeft) {
    if (point.events === void 0) point.events = [this];
    else point.events.push(this);
    this.point = point;
    this.isLeft = isLeft;
  }
  link(other) {
    if (other.point === this.point) {
      throw new Error("Tried to link already linked events");
    }
    const otherEvents = other.point.events;
    for (let i = 0, iMax = otherEvents.length; i < iMax; i++) {
      const evt = otherEvents[i];
      this.point.events.push(evt);
      evt.point = this.point;
    }
    this.checkForConsuming();
  }
  /* Do a pass over our linked events and check to see if any pair
   * of segments match, and should be consumed. */
  checkForConsuming() {
    const numEvents = this.point.events.length;
    for (let i = 0; i < numEvents; i++) {
      const evt1 = this.point.events[i];
      if (evt1.segment.consumedBy !== void 0) continue;
      for (let j = i + 1; j < numEvents; j++) {
        const evt2 = this.point.events[j];
        if (evt2.consumedBy !== void 0) continue;
        if (evt1.otherSE.point.events !== evt2.otherSE.point.events) continue;
        evt1.segment.consume(evt2.segment);
      }
    }
  }
  getAvailableLinkedEvents() {
    const events = [];
    for (let i = 0, iMax = this.point.events.length; i < iMax; i++) {
      const evt = this.point.events[i];
      if (evt !== this && !evt.segment.ringOut && evt.segment.isInResult()) {
        events.push(evt);
      }
    }
    return events;
  }
  /**
   * Returns a comparator function for sorting linked events that will
   * favor the event that will give us the smallest left-side angle.
   * All ring construction starts as low as possible heading to the right,
   * so by always turning left as sharp as possible we'll get polygons
   * without uncessary loops & holes.
   *
   * The comparator function has a compute cache such that it avoids
   * re-computing already-computed values.
   */
  getLeftmostComparator(baseEvent) {
    const cache2 = /* @__PURE__ */ new Map();
    const fillCache = (linkedEvent) => {
      const nextEvent = linkedEvent.otherSE;
      cache2.set(linkedEvent, {
        sine: sineOfAngle(this.point, baseEvent.point, nextEvent.point),
        cosine: cosineOfAngle(this.point, baseEvent.point, nextEvent.point)
      });
    };
    return (a2, b) => {
      if (!cache2.has(a2)) fillCache(a2);
      if (!cache2.has(b)) fillCache(b);
      const {
        sine: asine,
        cosine: acosine
      } = cache2.get(a2);
      const {
        sine: bsine,
        cosine: bcosine
      } = cache2.get(b);
      if (asine >= 0 && bsine >= 0) {
        if (acosine < bcosine) return 1;
        if (acosine > bcosine) return -1;
        return 0;
      }
      if (asine < 0 && bsine < 0) {
        if (acosine < bcosine) return -1;
        if (acosine > bcosine) return 1;
        return 0;
      }
      if (bsine < asine) return -1;
      if (bsine > asine) return 1;
      return 0;
    };
  }
};
var segmentId = 0;
var Segment = class _Segment {
  /* This compare() function is for ordering segments in the sweep
   * line tree, and does so according to the following criteria:
   *
   * Consider the vertical line that lies an infinestimal step to the
   * right of the right-more of the two left endpoints of the input
   * segments. Imagine slowly moving a point up from negative infinity
   * in the increasing y direction. Which of the two segments will that
   * point intersect first? That segment comes 'before' the other one.
   *
   * If neither segment would be intersected by such a line, (if one
   * or more of the segments are vertical) then the line to be considered
   * is directly on the right-more of the two left inputs.
   */
  static compare(a2, b) {
    const alx = a2.leftSE.point.x;
    const blx = b.leftSE.point.x;
    const arx = a2.rightSE.point.x;
    const brx = b.rightSE.point.x;
    if (brx < alx) return 1;
    if (arx < blx) return -1;
    const aly = a2.leftSE.point.y;
    const bly = b.leftSE.point.y;
    const ary = a2.rightSE.point.y;
    const bry = b.rightSE.point.y;
    if (alx < blx) {
      if (bly < aly && bly < ary) return 1;
      if (bly > aly && bly > ary) return -1;
      const aCmpBLeft = a2.comparePoint(b.leftSE.point);
      if (aCmpBLeft < 0) return 1;
      if (aCmpBLeft > 0) return -1;
      const bCmpARight = b.comparePoint(a2.rightSE.point);
      if (bCmpARight !== 0) return bCmpARight;
      return -1;
    }
    if (alx > blx) {
      if (aly < bly && aly < bry) return -1;
      if (aly > bly && aly > bry) return 1;
      const bCmpALeft = b.comparePoint(a2.leftSE.point);
      if (bCmpALeft !== 0) return bCmpALeft;
      const aCmpBRight = a2.comparePoint(b.rightSE.point);
      if (aCmpBRight < 0) return 1;
      if (aCmpBRight > 0) return -1;
      return 1;
    }
    if (aly < bly) return -1;
    if (aly > bly) return 1;
    if (arx < brx) {
      const bCmpARight = b.comparePoint(a2.rightSE.point);
      if (bCmpARight !== 0) return bCmpARight;
    }
    if (arx > brx) {
      const aCmpBRight = a2.comparePoint(b.rightSE.point);
      if (aCmpBRight < 0) return 1;
      if (aCmpBRight > 0) return -1;
    }
    if (arx !== brx) {
      const ay = ary - aly;
      const ax = arx - alx;
      const by = bry - bly;
      const bx = brx - blx;
      if (ay > ax && by < bx) return 1;
      if (ay < ax && by > bx) return -1;
    }
    if (arx > brx) return 1;
    if (arx < brx) return -1;
    if (ary < bry) return -1;
    if (ary > bry) return 1;
    if (a2.id < b.id) return -1;
    if (a2.id > b.id) return 1;
    return 0;
  }
  /* Warning: a reference to ringWindings input will be stored,
   *  and possibly will be later modified */
  constructor(leftSE, rightSE, rings, windings) {
    this.id = ++segmentId;
    this.leftSE = leftSE;
    leftSE.segment = this;
    leftSE.otherSE = rightSE;
    this.rightSE = rightSE;
    rightSE.segment = this;
    rightSE.otherSE = leftSE;
    this.rings = rings;
    this.windings = windings;
  }
  static fromRing(pt1, pt2, ring) {
    let leftPt, rightPt, winding;
    const cmpPts = SweepEvent.comparePoints(pt1, pt2);
    if (cmpPts < 0) {
      leftPt = pt1;
      rightPt = pt2;
      winding = 1;
    } else if (cmpPts > 0) {
      leftPt = pt2;
      rightPt = pt1;
      winding = -1;
    } else throw new Error(`Tried to create degenerate segment at [${pt1.x}, ${pt1.y}]`);
    const leftSE = new SweepEvent(leftPt, true);
    const rightSE = new SweepEvent(rightPt, false);
    return new _Segment(leftSE, rightSE, [ring], [winding]);
  }
  /* When a segment is split, the rightSE is replaced with a new sweep event */
  replaceRightSE(newRightSE) {
    this.rightSE = newRightSE;
    this.rightSE.segment = this;
    this.rightSE.otherSE = this.leftSE;
    this.leftSE.otherSE = this.rightSE;
  }
  bbox() {
    const y1 = this.leftSE.point.y;
    const y2 = this.rightSE.point.y;
    return {
      ll: {
        x: this.leftSE.point.x,
        y: y1 < y2 ? y1 : y2
      },
      ur: {
        x: this.rightSE.point.x,
        y: y1 > y2 ? y1 : y2
      }
    };
  }
  /* A vector from the left point to the right */
  vector() {
    return {
      x: this.rightSE.point.x - this.leftSE.point.x,
      y: this.rightSE.point.y - this.leftSE.point.y
    };
  }
  isAnEndpoint(pt) {
    return pt.x === this.leftSE.point.x && pt.y === this.leftSE.point.y || pt.x === this.rightSE.point.x && pt.y === this.rightSE.point.y;
  }
  /* Compare this segment with a point.
   *
   * A point P is considered to be colinear to a segment if there
   * exists a distance D such that if we travel along the segment
   * from one * endpoint towards the other a distance D, we find
   * ourselves at point P.
   *
   * Return value indicates:
   *
   *   1: point lies above the segment (to the left of vertical)
   *   0: point is colinear to segment
   *  -1: point lies below the segment (to the right of vertical)
   */
  comparePoint(point) {
    if (this.isAnEndpoint(point)) return 0;
    const lPt = this.leftSE.point;
    const rPt = this.rightSE.point;
    const v2 = this.vector();
    if (lPt.x === rPt.x) {
      if (point.x === lPt.x) return 0;
      return point.x < lPt.x ? 1 : -1;
    }
    const yDist = (point.y - lPt.y) / v2.y;
    const xFromYDist = lPt.x + yDist * v2.x;
    if (point.x === xFromYDist) return 0;
    const xDist = (point.x - lPt.x) / v2.x;
    const yFromXDist = lPt.y + xDist * v2.y;
    if (point.y === yFromXDist) return 0;
    return point.y < yFromXDist ? -1 : 1;
  }
  /**
   * Given another segment, returns the first non-trivial intersection
   * between the two segments (in terms of sweep line ordering), if it exists.
   *
   * A 'non-trivial' intersection is one that will cause one or both of the
   * segments to be split(). As such, 'trivial' vs. 'non-trivial' intersection:
   *
   *   * endpoint of segA with endpoint of segB --> trivial
   *   * endpoint of segA with point along segB --> non-trivial
   *   * endpoint of segB with point along segA --> non-trivial
   *   * point along segA with point along segB --> non-trivial
   *
   * If no non-trivial intersection exists, return null
   * Else, return null.
   */
  getIntersection(other) {
    const tBbox = this.bbox();
    const oBbox = other.bbox();
    const bboxOverlap = getBboxOverlap(tBbox, oBbox);
    if (bboxOverlap === null) return null;
    const tlp = this.leftSE.point;
    const trp = this.rightSE.point;
    const olp = other.leftSE.point;
    const orp = other.rightSE.point;
    const touchesOtherLSE = isInBbox(tBbox, olp) && this.comparePoint(olp) === 0;
    const touchesThisLSE = isInBbox(oBbox, tlp) && other.comparePoint(tlp) === 0;
    const touchesOtherRSE = isInBbox(tBbox, orp) && this.comparePoint(orp) === 0;
    const touchesThisRSE = isInBbox(oBbox, trp) && other.comparePoint(trp) === 0;
    if (touchesThisLSE && touchesOtherLSE) {
      if (touchesThisRSE && !touchesOtherRSE) return trp;
      if (!touchesThisRSE && touchesOtherRSE) return orp;
      return null;
    }
    if (touchesThisLSE) {
      if (touchesOtherRSE) {
        if (tlp.x === orp.x && tlp.y === orp.y) return null;
      }
      return tlp;
    }
    if (touchesOtherLSE) {
      if (touchesThisRSE) {
        if (trp.x === olp.x && trp.y === olp.y) return null;
      }
      return olp;
    }
    if (touchesThisRSE && touchesOtherRSE) return null;
    if (touchesThisRSE) return trp;
    if (touchesOtherRSE) return orp;
    const pt = intersection$1(tlp, this.vector(), olp, other.vector());
    if (pt === null) return null;
    if (!isInBbox(bboxOverlap, pt)) return null;
    return rounder.round(pt.x, pt.y);
  }
  /**
   * Split the given segment into multiple segments on the given points.
   *  * Each existing segment will retain its leftSE and a new rightSE will be
   *    generated for it.
   *  * A new segment will be generated which will adopt the original segment's
   *    rightSE, and a new leftSE will be generated for it.
   *  * If there are more than two points given to split on, new segments
   *    in the middle will be generated with new leftSE and rightSE's.
   *  * An array of the newly generated SweepEvents will be returned.
   *
   * Warning: input array of points is modified
   */
  split(point) {
    const newEvents = [];
    const alreadyLinked = point.events !== void 0;
    const newLeftSE = new SweepEvent(point, true);
    const newRightSE = new SweepEvent(point, false);
    const oldRightSE = this.rightSE;
    this.replaceRightSE(newRightSE);
    newEvents.push(newRightSE);
    newEvents.push(newLeftSE);
    const newSeg = new _Segment(newLeftSE, oldRightSE, this.rings.slice(), this.windings.slice());
    if (SweepEvent.comparePoints(newSeg.leftSE.point, newSeg.rightSE.point) > 0) {
      newSeg.swapEvents();
    }
    if (SweepEvent.comparePoints(this.leftSE.point, this.rightSE.point) > 0) {
      this.swapEvents();
    }
    if (alreadyLinked) {
      newLeftSE.checkForConsuming();
      newRightSE.checkForConsuming();
    }
    return newEvents;
  }
  /* Swap which event is left and right */
  swapEvents() {
    const tmpEvt = this.rightSE;
    this.rightSE = this.leftSE;
    this.leftSE = tmpEvt;
    this.leftSE.isLeft = true;
    this.rightSE.isLeft = false;
    for (let i = 0, iMax = this.windings.length; i < iMax; i++) {
      this.windings[i] *= -1;
    }
  }
  /* Consume another segment. We take their rings under our wing
   * and mark them as consumed. Use for perfectly overlapping segments */
  consume(other) {
    let consumer = this;
    let consumee = other;
    while (consumer.consumedBy) consumer = consumer.consumedBy;
    while (consumee.consumedBy) consumee = consumee.consumedBy;
    const cmp2 = _Segment.compare(consumer, consumee);
    if (cmp2 === 0) return;
    if (cmp2 > 0) {
      const tmp = consumer;
      consumer = consumee;
      consumee = tmp;
    }
    if (consumer.prev === consumee) {
      const tmp = consumer;
      consumer = consumee;
      consumee = tmp;
    }
    for (let i = 0, iMax = consumee.rings.length; i < iMax; i++) {
      const ring = consumee.rings[i];
      const winding = consumee.windings[i];
      const index2 = consumer.rings.indexOf(ring);
      if (index2 === -1) {
        consumer.rings.push(ring);
        consumer.windings.push(winding);
      } else consumer.windings[index2] += winding;
    }
    consumee.rings = null;
    consumee.windings = null;
    consumee.consumedBy = consumer;
    consumee.leftSE.consumedBy = consumer.leftSE;
    consumee.rightSE.consumedBy = consumer.rightSE;
  }
  /* The first segment previous segment chain that is in the result */
  prevInResult() {
    if (this._prevInResult !== void 0) return this._prevInResult;
    if (!this.prev) this._prevInResult = null;
    else if (this.prev.isInResult()) this._prevInResult = this.prev;
    else this._prevInResult = this.prev.prevInResult();
    return this._prevInResult;
  }
  beforeState() {
    if (this._beforeState !== void 0) return this._beforeState;
    if (!this.prev) this._beforeState = {
      rings: [],
      windings: [],
      multiPolys: []
    };
    else {
      const seg = this.prev.consumedBy || this.prev;
      this._beforeState = seg.afterState();
    }
    return this._beforeState;
  }
  afterState() {
    if (this._afterState !== void 0) return this._afterState;
    const beforeState = this.beforeState();
    this._afterState = {
      rings: beforeState.rings.slice(0),
      windings: beforeState.windings.slice(0),
      multiPolys: []
    };
    const ringsAfter = this._afterState.rings;
    const windingsAfter = this._afterState.windings;
    const mpsAfter = this._afterState.multiPolys;
    for (let i = 0, iMax = this.rings.length; i < iMax; i++) {
      const ring = this.rings[i];
      const winding = this.windings[i];
      const index2 = ringsAfter.indexOf(ring);
      if (index2 === -1) {
        ringsAfter.push(ring);
        windingsAfter.push(winding);
      } else windingsAfter[index2] += winding;
    }
    const polysAfter = [];
    const polysExclude = [];
    for (let i = 0, iMax = ringsAfter.length; i < iMax; i++) {
      if (windingsAfter[i] === 0) continue;
      const ring = ringsAfter[i];
      const poly = ring.poly;
      if (polysExclude.indexOf(poly) !== -1) continue;
      if (ring.isExterior) polysAfter.push(poly);
      else {
        if (polysExclude.indexOf(poly) === -1) polysExclude.push(poly);
        const index2 = polysAfter.indexOf(ring.poly);
        if (index2 !== -1) polysAfter.splice(index2, 1);
      }
    }
    for (let i = 0, iMax = polysAfter.length; i < iMax; i++) {
      const mp = polysAfter[i].multiPoly;
      if (mpsAfter.indexOf(mp) === -1) mpsAfter.push(mp);
    }
    return this._afterState;
  }
  /* Is this segment part of the final result? */
  isInResult() {
    if (this.consumedBy) return false;
    if (this._isInResult !== void 0) return this._isInResult;
    const mpsBefore = this.beforeState().multiPolys;
    const mpsAfter = this.afterState().multiPolys;
    switch (operation.type) {
      case "union": {
        const noBefores = mpsBefore.length === 0;
        const noAfters = mpsAfter.length === 0;
        this._isInResult = noBefores !== noAfters;
        break;
      }
      case "intersection": {
        let least;
        let most;
        if (mpsBefore.length < mpsAfter.length) {
          least = mpsBefore.length;
          most = mpsAfter.length;
        } else {
          least = mpsAfter.length;
          most = mpsBefore.length;
        }
        this._isInResult = most === operation.numMultiPolys && least < most;
        break;
      }
      case "xor": {
        const diff = Math.abs(mpsBefore.length - mpsAfter.length);
        this._isInResult = diff % 2 === 1;
        break;
      }
      case "difference": {
        const isJustSubject = (mps) => mps.length === 1 && mps[0].isSubject;
        this._isInResult = isJustSubject(mpsBefore) !== isJustSubject(mpsAfter);
        break;
      }
      default:
        throw new Error(`Unrecognized operation type found ${operation.type}`);
    }
    return this._isInResult;
  }
};
var RingIn = class {
  constructor(geomRing, poly, isExterior) {
    if (!Array.isArray(geomRing) || geomRing.length === 0) {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    this.poly = poly;
    this.isExterior = isExterior;
    this.segments = [];
    if (typeof geomRing[0][0] !== "number" || typeof geomRing[0][1] !== "number") {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    const firstPoint = rounder.round(geomRing[0][0], geomRing[0][1]);
    this.bbox = {
      ll: {
        x: firstPoint.x,
        y: firstPoint.y
      },
      ur: {
        x: firstPoint.x,
        y: firstPoint.y
      }
    };
    let prevPoint = firstPoint;
    for (let i = 1, iMax = geomRing.length; i < iMax; i++) {
      if (typeof geomRing[i][0] !== "number" || typeof geomRing[i][1] !== "number") {
        throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
      }
      let point = rounder.round(geomRing[i][0], geomRing[i][1]);
      if (point.x === prevPoint.x && point.y === prevPoint.y) continue;
      this.segments.push(Segment.fromRing(prevPoint, point, this));
      if (point.x < this.bbox.ll.x) this.bbox.ll.x = point.x;
      if (point.y < this.bbox.ll.y) this.bbox.ll.y = point.y;
      if (point.x > this.bbox.ur.x) this.bbox.ur.x = point.x;
      if (point.y > this.bbox.ur.y) this.bbox.ur.y = point.y;
      prevPoint = point;
    }
    if (firstPoint.x !== prevPoint.x || firstPoint.y !== prevPoint.y) {
      this.segments.push(Segment.fromRing(prevPoint, firstPoint, this));
    }
  }
  getSweepEvents() {
    const sweepEvents = [];
    for (let i = 0, iMax = this.segments.length; i < iMax; i++) {
      const segment = this.segments[i];
      sweepEvents.push(segment.leftSE);
      sweepEvents.push(segment.rightSE);
    }
    return sweepEvents;
  }
};
var PolyIn = class {
  constructor(geomPoly, multiPoly) {
    if (!Array.isArray(geomPoly)) {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    this.exteriorRing = new RingIn(geomPoly[0], this, true);
    this.bbox = {
      ll: {
        x: this.exteriorRing.bbox.ll.x,
        y: this.exteriorRing.bbox.ll.y
      },
      ur: {
        x: this.exteriorRing.bbox.ur.x,
        y: this.exteriorRing.bbox.ur.y
      }
    };
    this.interiorRings = [];
    for (let i = 1, iMax = geomPoly.length; i < iMax; i++) {
      const ring = new RingIn(geomPoly[i], this, false);
      if (ring.bbox.ll.x < this.bbox.ll.x) this.bbox.ll.x = ring.bbox.ll.x;
      if (ring.bbox.ll.y < this.bbox.ll.y) this.bbox.ll.y = ring.bbox.ll.y;
      if (ring.bbox.ur.x > this.bbox.ur.x) this.bbox.ur.x = ring.bbox.ur.x;
      if (ring.bbox.ur.y > this.bbox.ur.y) this.bbox.ur.y = ring.bbox.ur.y;
      this.interiorRings.push(ring);
    }
    this.multiPoly = multiPoly;
  }
  getSweepEvents() {
    const sweepEvents = this.exteriorRing.getSweepEvents();
    for (let i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
      const ringSweepEvents = this.interiorRings[i].getSweepEvents();
      for (let j = 0, jMax = ringSweepEvents.length; j < jMax; j++) {
        sweepEvents.push(ringSweepEvents[j]);
      }
    }
    return sweepEvents;
  }
};
var MultiPolyIn = class {
  constructor(geom, isSubject) {
    if (!Array.isArray(geom)) {
      throw new Error("Input geometry is not a valid Polygon or MultiPolygon");
    }
    try {
      if (typeof geom[0][0][0] === "number") geom = [geom];
    } catch (ex) {
    }
    this.polys = [];
    this.bbox = {
      ll: {
        x: Number.POSITIVE_INFINITY,
        y: Number.POSITIVE_INFINITY
      },
      ur: {
        x: Number.NEGATIVE_INFINITY,
        y: Number.NEGATIVE_INFINITY
      }
    };
    for (let i = 0, iMax = geom.length; i < iMax; i++) {
      const poly = new PolyIn(geom[i], this);
      if (poly.bbox.ll.x < this.bbox.ll.x) this.bbox.ll.x = poly.bbox.ll.x;
      if (poly.bbox.ll.y < this.bbox.ll.y) this.bbox.ll.y = poly.bbox.ll.y;
      if (poly.bbox.ur.x > this.bbox.ur.x) this.bbox.ur.x = poly.bbox.ur.x;
      if (poly.bbox.ur.y > this.bbox.ur.y) this.bbox.ur.y = poly.bbox.ur.y;
      this.polys.push(poly);
    }
    this.isSubject = isSubject;
  }
  getSweepEvents() {
    const sweepEvents = [];
    for (let i = 0, iMax = this.polys.length; i < iMax; i++) {
      const polySweepEvents = this.polys[i].getSweepEvents();
      for (let j = 0, jMax = polySweepEvents.length; j < jMax; j++) {
        sweepEvents.push(polySweepEvents[j]);
      }
    }
    return sweepEvents;
  }
};
var RingOut = class _RingOut {
  /* Given the segments from the sweep line pass, compute & return a series
   * of closed rings from all the segments marked to be part of the result */
  static factory(allSegments) {
    const ringsOut = [];
    for (let i = 0, iMax = allSegments.length; i < iMax; i++) {
      const segment = allSegments[i];
      if (!segment.isInResult() || segment.ringOut) continue;
      let prevEvent = null;
      let event = segment.leftSE;
      let nextEvent = segment.rightSE;
      const events = [event];
      const startingPoint = event.point;
      const intersectionLEs = [];
      while (true) {
        prevEvent = event;
        event = nextEvent;
        events.push(event);
        if (event.point === startingPoint) break;
        while (true) {
          const availableLEs = event.getAvailableLinkedEvents();
          if (availableLEs.length === 0) {
            const firstPt = events[0].point;
            const lastPt = events[events.length - 1].point;
            throw new Error(`Unable to complete output ring starting at [${firstPt.x}, ${firstPt.y}]. Last matching segment found ends at [${lastPt.x}, ${lastPt.y}].`);
          }
          if (availableLEs.length === 1) {
            nextEvent = availableLEs[0].otherSE;
            break;
          }
          let indexLE = null;
          for (let j = 0, jMax = intersectionLEs.length; j < jMax; j++) {
            if (intersectionLEs[j].point === event.point) {
              indexLE = j;
              break;
            }
          }
          if (indexLE !== null) {
            const intersectionLE = intersectionLEs.splice(indexLE)[0];
            const ringEvents = events.splice(intersectionLE.index);
            ringEvents.unshift(ringEvents[0].otherSE);
            ringsOut.push(new _RingOut(ringEvents.reverse()));
            continue;
          }
          intersectionLEs.push({
            index: events.length,
            point: event.point
          });
          const comparator = event.getLeftmostComparator(prevEvent);
          nextEvent = availableLEs.sort(comparator)[0].otherSE;
          break;
        }
      }
      ringsOut.push(new _RingOut(events));
    }
    return ringsOut;
  }
  constructor(events) {
    this.events = events;
    for (let i = 0, iMax = events.length; i < iMax; i++) {
      events[i].segment.ringOut = this;
    }
    this.poly = null;
  }
  getGeom() {
    let prevPt = this.events[0].point;
    const points = [prevPt];
    for (let i = 1, iMax = this.events.length - 1; i < iMax; i++) {
      const pt2 = this.events[i].point;
      const nextPt2 = this.events[i + 1].point;
      if (compareVectorAngles(pt2, prevPt, nextPt2) === 0) continue;
      points.push(pt2);
      prevPt = pt2;
    }
    if (points.length === 1) return null;
    const pt = points[0];
    const nextPt = points[1];
    if (compareVectorAngles(pt, prevPt, nextPt) === 0) points.shift();
    points.push(points[0]);
    const step = this.isExteriorRing() ? 1 : -1;
    const iStart = this.isExteriorRing() ? 0 : points.length - 1;
    const iEnd = this.isExteriorRing() ? points.length : -1;
    const orderedPoints = [];
    for (let i = iStart; i != iEnd; i += step) orderedPoints.push([points[i].x, points[i].y]);
    return orderedPoints;
  }
  isExteriorRing() {
    if (this._isExteriorRing === void 0) {
      const enclosing = this.enclosingRing();
      this._isExteriorRing = enclosing ? !enclosing.isExteriorRing() : true;
    }
    return this._isExteriorRing;
  }
  enclosingRing() {
    if (this._enclosingRing === void 0) {
      this._enclosingRing = this._calcEnclosingRing();
    }
    return this._enclosingRing;
  }
  /* Returns the ring that encloses this one, if any */
  _calcEnclosingRing() {
    let leftMostEvt = this.events[0];
    for (let i = 1, iMax = this.events.length; i < iMax; i++) {
      const evt = this.events[i];
      if (SweepEvent.compare(leftMostEvt, evt) > 0) leftMostEvt = evt;
    }
    let prevSeg = leftMostEvt.segment.prevInResult();
    let prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
    while (true) {
      if (!prevSeg) return null;
      if (!prevPrevSeg) return prevSeg.ringOut;
      if (prevPrevSeg.ringOut !== prevSeg.ringOut) {
        if (prevPrevSeg.ringOut.enclosingRing() !== prevSeg.ringOut) {
          return prevSeg.ringOut;
        } else return prevSeg.ringOut.enclosingRing();
      }
      prevSeg = prevPrevSeg.prevInResult();
      prevPrevSeg = prevSeg ? prevSeg.prevInResult() : null;
    }
  }
};
var PolyOut = class {
  constructor(exteriorRing) {
    this.exteriorRing = exteriorRing;
    exteriorRing.poly = this;
    this.interiorRings = [];
  }
  addInterior(ring) {
    this.interiorRings.push(ring);
    ring.poly = this;
  }
  getGeom() {
    const geom = [this.exteriorRing.getGeom()];
    if (geom[0] === null) return null;
    for (let i = 0, iMax = this.interiorRings.length; i < iMax; i++) {
      const ringGeom = this.interiorRings[i].getGeom();
      if (ringGeom === null) continue;
      geom.push(ringGeom);
    }
    return geom;
  }
};
var MultiPolyOut = class {
  constructor(rings) {
    this.rings = rings;
    this.polys = this._composePolys(rings);
  }
  getGeom() {
    const geom = [];
    for (let i = 0, iMax = this.polys.length; i < iMax; i++) {
      const polyGeom = this.polys[i].getGeom();
      if (polyGeom === null) continue;
      geom.push(polyGeom);
    }
    return geom;
  }
  _composePolys(rings) {
    const polys = [];
    for (let i = 0, iMax = rings.length; i < iMax; i++) {
      const ring = rings[i];
      if (ring.poly) continue;
      if (ring.isExteriorRing()) polys.push(new PolyOut(ring));
      else {
        const enclosingRing = ring.enclosingRing();
        if (!enclosingRing.poly) polys.push(new PolyOut(enclosingRing));
        enclosingRing.poly.addInterior(ring);
      }
    }
    return polys;
  }
};
var SweepLine = class {
  constructor(queue) {
    let comparator = arguments.length > 1 && arguments[1] !== void 0 ? arguments[1] : Segment.compare;
    this.queue = queue;
    this.tree = new z(comparator);
    this.segments = [];
  }
  process(event) {
    const segment = event.segment;
    const newEvents = [];
    if (event.consumedBy) {
      if (event.isLeft) this.queue.remove(event.otherSE);
      else this.tree.remove(segment);
      return newEvents;
    }
    const node = event.isLeft ? this.tree.add(segment) : this.tree.find(segment);
    if (!node) throw new Error(`Unable to find segment #${segment.id} [${segment.leftSE.point.x}, ${segment.leftSE.point.y}] -> [${segment.rightSE.point.x}, ${segment.rightSE.point.y}] in SweepLine tree.`);
    let prevNode = node;
    let nextNode = node;
    let prevSeg = void 0;
    let nextSeg = void 0;
    while (prevSeg === void 0) {
      prevNode = this.tree.prev(prevNode);
      if (prevNode === null) prevSeg = null;
      else if (prevNode.key.consumedBy === void 0) prevSeg = prevNode.key;
    }
    while (nextSeg === void 0) {
      nextNode = this.tree.next(nextNode);
      if (nextNode === null) nextSeg = null;
      else if (nextNode.key.consumedBy === void 0) nextSeg = nextNode.key;
    }
    if (event.isLeft) {
      let prevMySplitter = null;
      if (prevSeg) {
        const prevInter = prevSeg.getIntersection(segment);
        if (prevInter !== null) {
          if (!segment.isAnEndpoint(prevInter)) prevMySplitter = prevInter;
          if (!prevSeg.isAnEndpoint(prevInter)) {
            const newEventsFromSplit = this._splitSafely(prevSeg, prevInter);
            for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
        }
      }
      let nextMySplitter = null;
      if (nextSeg) {
        const nextInter = nextSeg.getIntersection(segment);
        if (nextInter !== null) {
          if (!segment.isAnEndpoint(nextInter)) nextMySplitter = nextInter;
          if (!nextSeg.isAnEndpoint(nextInter)) {
            const newEventsFromSplit = this._splitSafely(nextSeg, nextInter);
            for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
        }
      }
      if (prevMySplitter !== null || nextMySplitter !== null) {
        let mySplitter = null;
        if (prevMySplitter === null) mySplitter = nextMySplitter;
        else if (nextMySplitter === null) mySplitter = prevMySplitter;
        else {
          const cmpSplitters = SweepEvent.comparePoints(prevMySplitter, nextMySplitter);
          mySplitter = cmpSplitters <= 0 ? prevMySplitter : nextMySplitter;
        }
        this.queue.remove(segment.rightSE);
        newEvents.push(segment.rightSE);
        const newEventsFromSplit = segment.split(mySplitter);
        for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
          newEvents.push(newEventsFromSplit[i]);
        }
      }
      if (newEvents.length > 0) {
        this.tree.remove(segment);
        newEvents.push(event);
      } else {
        this.segments.push(segment);
        segment.prev = prevSeg;
      }
    } else {
      if (prevSeg && nextSeg) {
        const inter = prevSeg.getIntersection(nextSeg);
        if (inter !== null) {
          if (!prevSeg.isAnEndpoint(inter)) {
            const newEventsFromSplit = this._splitSafely(prevSeg, inter);
            for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
          if (!nextSeg.isAnEndpoint(inter)) {
            const newEventsFromSplit = this._splitSafely(nextSeg, inter);
            for (let i = 0, iMax = newEventsFromSplit.length; i < iMax; i++) {
              newEvents.push(newEventsFromSplit[i]);
            }
          }
        }
      }
      this.tree.remove(segment);
    }
    return newEvents;
  }
  /* Safely split a segment that is currently in the datastructures
   * IE - a segment other than the one that is currently being processed. */
  _splitSafely(seg, pt) {
    this.tree.remove(seg);
    const rightSE = seg.rightSE;
    this.queue.remove(rightSE);
    const newEvents = seg.split(pt);
    newEvents.push(rightSE);
    if (seg.consumedBy === void 0) this.tree.add(seg);
    return newEvents;
  }
};
var POLYGON_CLIPPING_MAX_QUEUE_SIZE = typeof process !== "undefined" && process.env.POLYGON_CLIPPING_MAX_QUEUE_SIZE || 1e6;
var POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS = typeof process !== "undefined" && process.env.POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS || 1e6;
var Operation = class {
  run(type, geom, moreGeoms) {
    operation.type = type;
    rounder.reset();
    const multipolys = [new MultiPolyIn(geom, true)];
    for (let i = 0, iMax = moreGeoms.length; i < iMax; i++) {
      multipolys.push(new MultiPolyIn(moreGeoms[i], false));
    }
    operation.numMultiPolys = multipolys.length;
    if (operation.type === "difference") {
      const subject = multipolys[0];
      let i = 1;
      while (i < multipolys.length) {
        if (getBboxOverlap(multipolys[i].bbox, subject.bbox) !== null) i++;
        else multipolys.splice(i, 1);
      }
    }
    if (operation.type === "intersection") {
      for (let i = 0, iMax = multipolys.length; i < iMax; i++) {
        const mpA = multipolys[i];
        for (let j = i + 1, jMax = multipolys.length; j < jMax; j++) {
          if (getBboxOverlap(mpA.bbox, multipolys[j].bbox) === null) return [];
        }
      }
    }
    const queue = new z(SweepEvent.compare);
    for (let i = 0, iMax = multipolys.length; i < iMax; i++) {
      const sweepEvents = multipolys[i].getSweepEvents();
      for (let j = 0, jMax = sweepEvents.length; j < jMax; j++) {
        queue.insert(sweepEvents[j]);
        if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) {
          throw new Error("Infinite loop when putting segment endpoints in a priority queue (queue size too big).");
        }
      }
    }
    const sweepLine = new SweepLine(queue);
    let prevQueueSize = queue.size;
    let node = queue.pop();
    while (node) {
      const evt = node.key;
      if (queue.size === prevQueueSize) {
        const seg = evt.segment;
        throw new Error(`Unable to pop() ${evt.isLeft ? "left" : "right"} SweepEvent [${evt.point.x}, ${evt.point.y}] from segment #${seg.id} [${seg.leftSE.point.x}, ${seg.leftSE.point.y}] -> [${seg.rightSE.point.x}, ${seg.rightSE.point.y}] from queue.`);
      }
      if (queue.size > POLYGON_CLIPPING_MAX_QUEUE_SIZE) {
        throw new Error("Infinite loop when passing sweep line over endpoints (queue size too big).");
      }
      if (sweepLine.segments.length > POLYGON_CLIPPING_MAX_SWEEPLINE_SEGMENTS) {
        throw new Error("Infinite loop when passing sweep line over endpoints (too many sweep line segments).");
      }
      const newEvents = sweepLine.process(evt);
      for (let i = 0, iMax = newEvents.length; i < iMax; i++) {
        const evt2 = newEvents[i];
        if (evt2.consumedBy === void 0) queue.insert(evt2);
      }
      prevQueueSize = queue.size;
      node = queue.pop();
    }
    rounder.reset();
    const ringsOut = RingOut.factory(sweepLine.segments);
    const result = new MultiPolyOut(ringsOut);
    return result.getGeom();
  }
};
var operation = new Operation();
var union = function(geom) {
  for (var _len = arguments.length, moreGeoms = new Array(_len > 1 ? _len - 1 : 0), _key = 1; _key < _len; _key++) {
    moreGeoms[_key - 1] = arguments[_key];
  }
  return operation.run("union", geom, moreGeoms);
};
var intersection = function(geom) {
  for (var _len2 = arguments.length, moreGeoms = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
    moreGeoms[_key2 - 1] = arguments[_key2];
  }
  return operation.run("intersection", geom, moreGeoms);
};
var xor = function(geom) {
  for (var _len3 = arguments.length, moreGeoms = new Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
    moreGeoms[_key3 - 1] = arguments[_key3];
  }
  return operation.run("xor", geom, moreGeoms);
};
var difference = function(subjectGeom) {
  for (var _len4 = arguments.length, clippingGeoms = new Array(_len4 > 1 ? _len4 - 1 : 0), _key4 = 1; _key4 < _len4; _key4++) {
    clippingGeoms[_key4 - 1] = arguments[_key4];
  }
  return operation.run("difference", subjectGeom, clippingGeoms);
};
var index = {
  union,
  intersection,
  xor,
  difference
};

// generators/lounge/planArch.ts
var { difference: difference2 } = index;
var r2 = (n) => Math.round(n * 1e3) / 1e3;
function overlap2(a0, a1, b0, b1) {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return hi - lo > 0.5 ? [lo, hi] : null;
}
function gapCovers(arches, gap0, gap1, depth, height, thickness) {
  const out = [];
  for (const a2 of arches || []) {
    const x2 = overlap2(gap0, gap1, a2.x0, a2.x1);
    const y2 = overlap2(0, depth, a2.y0, a2.y1);
    const z1 = Math.min(a2.z1, height - thickness);
    if (!x2 || !y2 || !(z1 > thickness) || y2[1] < depth - 1) continue;
    out.push({ id: a2.id || `arch-${out.length + 1}`, x0: r2(x2[0]), x1: r2(x2[1]), y0: r2(y2[0]), y1: r2(y2[1]), z1: r2(z1) });
  }
  return out;
}
function uv(p2, plane) {
  if (plane === "XY") return [p2.x ?? 0, p2.y ?? 0];
  if (plane === "XZ") return [p2.x ?? 0, p2.z ?? 0];
  return [p2.y ?? 0, p2.z ?? 0];
}
function fromUv(u5, v2, plane) {
  if (plane === "XY") return { x: r2(u5), y: r2(v2) };
  if (plane === "XZ") return { x: r2(u5), z: r2(v2) };
  return { y: r2(u5), z: r2(v2) };
}
function boardRing(board) {
  const pv = board.profileVector;
  if (pv && pv.length >= 4) {
    if (pv.some((p2) => Math.abs(Number(p2.bulge) || 0) > 1e-9)) {
      const raw = pv.map((p2) => {
        const [u5, v2] = uv(p2, board.profilePlane);
        return { u: u5, v: v2, b: Number(p2.bulge) || 0 };
      });
      const a2 = raw[0];
      const c2 = raw[raw.length - 1];
      if (raw.length > 2 && a2.u === c2.u && a2.v === c2.v) raw.pop();
      return expandBulgeRing(raw).map((p2) => [p2.u, p2.v]);
    }
    return pv.map((p2) => uv(p2, board.profilePlane));
  }
  const plane = board.profilePlane;
  if (plane === "YZ") return [[board.y0, board.z0], [board.y1, board.z0], [board.y1, board.z1], [board.y0, board.z1]];
  if (plane === "XZ") return [[board.x0, board.z0], [board.x1, board.z0], [board.x1, board.z1], [board.x0, board.z1]];
  return [[board.x0, board.y0], [board.x1, board.y0], [board.x1, board.y1], [board.x0, board.y1]];
}
function close(ring) {
  if (!ring.length) return ring;
  const a2 = ring[0];
  const b = ring[ring.length - 1];
  if (a2[0] === b[0] && a2[1] === b[1]) return ring;
  return [...ring, [a2[0], a2[1]]];
}
function area(ring) {
  let s = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a2 = ring[i];
    const b = ring[(i + 1) % ring.length];
    s += a2[0] * b[1] - b[0] * a2[1];
  }
  return Math.abs(s) / 2;
}
function notchPlanArches(boards, arches) {
  const list = (arches || []).filter((a2) => a2.x1 > a2.x0 && a2.y1 > a2.y0 && a2.z1 > a2.z0);
  if (!list.length) return;
  for (const board of boards) {
    if (board.boardType === "avoidance_top" || board.boardType === "avoidance_front") continue;
    let ring = boardRing(board);
    const before = area(ring);
    for (const arch of list) {
      const hit = hitOf(board, arch);
      if (!hit) continue;
      const cut = difference2([close(ring)], [close(hit)]);
      let best = null;
      let bestArea = 0;
      for (const poly of cut) {
        const outer = poly[0];
        if (!outer || outer.length < 4) continue;
        const a3 = area(outer);
        if (a3 > bestArea) {
          best = outer;
          bestArea = a3;
        }
      }
      if (best && before - bestArea > 1) ring = best;
    }
    if (Math.abs(area(ring) - before) <= 1) continue;
    const open = ring.slice();
    const a2 = open[0];
    const b = open[open.length - 1];
    if (a2[0] === b[0] && a2[1] === b[1]) open.pop();
    const pts = open.map(([u5, v2]) => fromUv(u5, v2, board.profilePlane));
    pts.push(fromUv(open[0][0], open[0][1], board.profilePlane));
    board.profileVector = pts;
  }
}
function hitOf(board, arch) {
  const plane = board.profilePlane;
  if (plane === "YZ") {
    if (!overlap2(board.x0, board.x1, arch.x0, arch.x1)) return null;
    const y3 = overlap2(board.y0, board.y1, arch.y0, arch.y1);
    const z2 = overlap2(board.z0, board.z1, arch.z0, arch.z1);
    if (!y3 || !z2) return null;
    return [[y3[0], z2[0]], [y3[1], z2[0]], [y3[1], z2[1]], [y3[0], z2[1]]];
  }
  if (plane === "XZ") {
    if (!overlap2(board.y0, board.y1, arch.y0, arch.y1)) return null;
    const x3 = overlap2(board.x0, board.x1, arch.x0, arch.x1);
    const z2 = overlap2(board.z0, board.z1, arch.z0, arch.z1);
    if (!x3 || !z2) return null;
    return [[x3[0], z2[0]], [x3[1], z2[0]], [x3[1], z2[1]], [x3[0], z2[1]]];
  }
  if (!overlap2(board.z0, board.z1, arch.z0, arch.z1)) return null;
  const x2 = overlap2(board.x0, board.x1, arch.x0, arch.x1);
  const y2 = overlap2(board.y0, board.y1, arch.y0, arch.y1);
  if (!x2 || !y2) return null;
  return [[x2[0], y2[0]], [x2[1], y2[0]], [x2[1], y2[1]], [x2[0], y2[1]]];
}

// generators/lounge/place.ts
var r22 = (v2) => Math.round(v2 * 1e3) / 1e3;
var asNum = (v2, fb) => {
  const n = Number(v2);
  return Number.isFinite(n) ? n : fb;
};
function boxesFromParams(p2) {
  const style = p2.style ?? "L_SHAPE";
  if (style === "I_SHAPE") {
    const W = asNum(p2.mainWidth, 2e3);
    const D2 = asNum(p2.mainDepth, 600);
    return [{ id: "i", x0: 0, x1: W, y0: 0, y1: D2 }];
  }
  if (style === "PARALLEL") {
    const totalW = asNum(p2.totalWidth, 4e3);
    const SW = asNum(p2.singleLoungeWidth, 1500);
    const D2 = asNum(p2.depth, 800);
    const t = Math.max(1, asNum(p2.partitionPanelThickness, 18));
    const left = p2.leftBackPanel === true ? t : 0;
    const rightIn = p2.rightBackPanel === true ? t : 0;
    const over2 = (on) => on ? Math.max(0, p2.backPanelOverhang == null ? 50 : asNum(p2.backPanelOverhang, 50)) : 0;
    return [
      { id: "left", x0: 0, x1: r22(SW + left), y0: p2.leftBackPanel === true ? r22(-over2(true)) : 0, y1: D2 },
      { id: "right", x0: r22(totalW - SW - rightIn), x1: totalW, y0: p2.rightBackPanel === true ? r22(-over2(true)) : 0, y1: D2 }
    ];
  }
  const mainW = asNum(p2.mainWidth, 2e3);
  const mainD = asNum(p2.mainDepth, 600);
  const ret = asNum(p2.lWidth, 1600);
  const thick = asNum(p2.lDepth, 600);
  const right = (p2.lPosition ?? "RIGHT") !== "LEFT";
  const inset = p2.backPanel === true ? Math.max(1, asNum(p2.partitionPanelThickness, 18)) : 0;
  const over = p2.backPanel === true ? Math.max(0, p2.backPanelOverhang == null ? 50 : asNum(p2.backPanelOverhang, 50)) : 0;
  const mainX0 = right ? 0 : r22(thick + inset);
  const mainX1 = right ? r22(mainW - thick - inset) : mainW;
  const lX0 = right ? mainX1 : 0;
  const lX1 = right ? mainW : r22(thick + inset);
  return [
    { id: "main", x0: mainX0, x1: mainX1, y0: r22(ret - mainD), y1: ret },
    { id: "l", x0: lX0, x1: lX1, y0: over ? r22(-over) : 0, y1: ret }
  ];
}
function loungeFootprintBoxes(params, result) {
  const fp = result?.footprint;
  if (fp) {
    const out = [];
    if (fp.i) out.push({ id: "i", ...fp.i });
    if (fp.main) out.push({ id: "main", ...fp.main });
    if (fp.l) out.push({ id: "l", ...fp.l });
    if (fp.left) out.push({ id: "left", ...fp.left });
    if (fp.right) out.push({ id: "right", ...fp.right });
    if (out.length) return out;
  }
  return boxesFromParams(params);
}
function pointInFootprintBoxes(x2, y2, boxes) {
  return boxes.some((b) => x2 >= b.x0 && x2 <= b.x1 && y2 >= b.y0 && y2 <= b.y1);
}
function loungePolyline(params) {
  const style = params.style ?? "L_SHAPE";
  if (style === "I_SHAPE") {
    const W = asNum(params.mainWidth, 2e3);
    const D2 = asNum(params.mainDepth, 600);
    return [{ x: 0, y: D2 }, { x: W, y: D2 }];
  }
  if (style === "PARALLEL") {
    const totalW = asNum(params.totalWidth, 4e3);
    const SW = asNum(params.singleLoungeWidth, 1500);
    const D2 = asNum(params.depth, 800);
    return [{ x: 0, y: D2 }, { x: SW, y: D2 }, { x: totalW, y: D2 }];
  }
  const mainW = asNum(params.mainWidth, 2e3);
  const ret = asNum(params.lWidth, 1600);
  const right = (params.lPosition ?? "RIGHT") !== "LEFT";
  if (right) return [{ x: 0, y: ret }, { x: mainW, y: ret }, { x: mainW, y: 0 }];
  return [{ x: 0, y: 0 }, { x: 0, y: ret }, { x: mainW, y: ret }];
}
function loungeFromDrawnRun(input) {
  const a0 = input.a;
  const b0 = input.b;
  const dx = b0.x - a0.x;
  const dy = b0.y - a0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) throw new Error("lounge back edge is too short");
  const depth = input.depth;
  if (!(depth > 0)) throw new Error("lounge depth must be positive");
  const sign = input.roomSign < 0 ? -1 : 1;
  let ux = dx / len;
  let uy = dy / len;
  let rx = uy;
  let ry = -ux;
  let left = a0;
  let right = b0;
  if (sign < 0) {
    ux = -ux;
    uy = -uy;
    rx = -rx;
    ry = -ry;
    left = b0;
    right = a0;
  }
  const rotZ = r22(Math.atan2(uy, ux) * 180 / Math.PI) || 0;
  const H = asNum(input.height, 420);
  const ppt = asNum(input.partitionPanelThickness, 18);
  const frontLeft = {
    x: r22(left.x + rx * depth),
    y: r22(left.y + ry * depth)
  };
  if (input.style === "I") {
    return {
      params: {
        style: "I_SHAPE",
        mainWidth: r22(len),
        mainDepth: r22(depth),
        height: H,
        partitionPanelThickness: ppt
      },
      pose: { x: frontLeft.x, y: frontLeft.y, z: 0, rotZ }
    };
  }
  const wing = input.wing ?? 0;
  if (!(wing > depth)) throw new Error("lounge return must extend past the middle front");
  const side = input.side === "LEFT" ? "LEFT" : "RIGHT";
  const origin = side === "LEFT" ? { x: r22(left.x - ux * depth + rx * wing), y: r22(left.y - uy * depth + ry * wing) } : { x: r22(left.x + rx * wing), y: r22(left.y + ry * wing) };
  return {
    params: {
      style: "L_SHAPE",
      mainWidth: r22(len),
      mainDepth: r22(depth),
      lWidth: r22(wing),
      lDepth: r22(depth),
      lPosition: side,
      height: H,
      partitionPanelThickness: ppt
    },
    pose: { x: origin.x, y: origin.y, z: 0, rotZ }
  };
}
function loungeFromPolyline(points, base = {}) {
  if (points.length < 2) throw new Error("lounge polyline needs at least 2 points");
  const p0 = points[0];
  const p1 = points[1];
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const len = Math.hypot(dx, dy);
  if (len < 1) throw new Error("lounge polyline first segment is too short");
  const rot = Math.atan2(dy, dx);
  const c2 = Math.cos(rot);
  const s = Math.sin(rot);
  const toPlace = (p2) => {
    const wx = p2.x - p0.x;
    const wy = p2.y - p0.y;
    return { U: wx * c2 + wy * s, V: wx * s - wy * c2 };
  };
  const local = points.map(toPlace);
  const H = asNum(base.height, 420);
  const ppt = asNum(base.partitionPanelThickness, 18);
  const rotZ = r22(rot * 180 / Math.PI);
  const poseFromDepth = (depth) => ({
    x: r22(p0.x + depth * s),
    y: r22(p0.y - depth * c2),
    z: 0,
    rotZ
  });
  if (points.length === 2) {
    const D2 = asNum(base.mainDepth, 600);
    return {
      params: { ...base, style: "I_SHAPE", mainWidth: r22(len), mainDepth: D2, height: H, partitionPanelThickness: ppt },
      pose: poseFromDepth(D2)
    };
  }
  if (points.length === 3) {
    const p2 = local[2];
    const colinear = Math.abs(p2.V) < 1;
    if (colinear) {
      const D2 = asNum(base.depth ?? base.mainDepth, 800);
      const SW = asNum(base.singleLoungeWidth, 1500);
      return {
        params: {
          ...base,
          style: "PARALLEL",
          totalWidth: r22(Math.abs(p2.U)),
          singleLoungeWidth: SW,
          depth: D2,
          height: H,
          partitionPanelThickness: ppt
        },
        pose: poseFromDepth(D2)
      };
    }
    const mainD = asNum(base.mainDepth, 600);
    const lW = asNum(base.lWidth, 1600);
    const lD = r22(mainD + Math.abs(p2.V));
    const right = p2.U >= len / 2;
    return {
      params: {
        ...base,
        style: "L_SHAPE",
        mainWidth: r22(len),
        mainDepth: mainD,
        lWidth: lW,
        lDepth: lD,
        lPosition: right ? "RIGHT" : "LEFT",
        height: H,
        partitionPanelThickness: ppt
      },
      pose: poseFromDepth(mainD)
    };
  }
  throw new Error("a lounge is an I (2 points), an L or a parallel pair (3 points); the U lounge was retired");
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
var px = (v2) => v2.toFixed(2);
function label(x2, y2, text, opts = {}) {
  const { size = 11, fill = PV.text, anchor = "middle", weight } = opts;
  return `<text x="${px(x2)}" y="${px(y2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${size}"${weight ? ` font-weight="${weight}"` : ""} fill="${fill}" stroke="${PV.bg}" stroke-opacity="0.85" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(text)}</text>`;
}
function dimText(x2, y2, text, anchor = "middle", fill = PV.text2, size = 10) {
  return `<text x="${px(x2)}" y="${px(y2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${size}" fill="${fill}" pointer-events="none">${esc(text)}</text>`;
}
function grip(attrs, x1, y1, x2, y2, dashed = false) {
  const c2 = `x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}"`;
  return `<g class="boundary" ${attrs}><line ${c2} stroke="${PV.boundary}" stroke-width="2"${dashed ? ` stroke-dasharray="6 4"` : ""} /><line class="hit" ${c2} stroke="transparent" stroke-width="12" pointer-events="stroke" /></g>`;
}
function fitCanvas(W, H, width, maxHeight, pad) {
  const availW = width - pad.l - pad.r;
  const availH = maxHeight - pad.t - pad.b;
  const scale2 = Math.min(availW / Math.max(W, 1), availH / Math.max(H, 1));
  const ox = pad.l + (availW - W * scale2) / 2;
  const oy = pad.t;
  const height = Math.round(H * scale2 + pad.t + pad.b);
  return { scale: scale2, ox, oy, height };
}
function svgRoot(width, height, data, aria, body) {
  const d2 = Object.entries(data).map(([k2, v2]) => `data-${k2}="${v2}"`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}" ${d2} font-family="${PV.font}"><rect x="0" y="0" width="${width}" height="${height}" fill="${PV.bg}" />` + body + `</svg>`;
}

// generators/lounge/svgPreview.ts
var LOUNGE_RUN_LABELS = {
  i: "Run",
  main: "Main run",
  l: "L wing",
  left: "Left leg",
  right: "Right leg"
};
var STYLE_LABEL = { I_SHAPE: "I", L_SHAPE: "L", PARALLEL: "Parallel" };
function generateLoungeSvgPreview(result, options = {}) {
  if (!result || !result.boards.length) return null;
  const fp = result.footprint || {};
  const runs = ["i", "main", "l", "left", "right"].map((key) => ({ key, r: fp[key] })).filter((it) => !!it.r);
  if (!runs.length) return null;
  const style = result.params.style;
  const planW = Math.max(...runs.map((it) => it.r.x1), ...result.boards.map((b) => b.x1));
  const yMax = Math.max(...runs.map((it) => it.r.y1));
  const yMin = Math.min(0, ...runs.map((it) => it.r.y0));
  const planH = yMax;
  const span = yMax - yMin;
  if (!(planW > 0) || !(span > 0)) return null;
  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedRun ?? null;
  const { scale: scale2, ox, oy, height } = fitCanvas(planW, span, width, options.maxHeight ?? 460, { l: 40, r: 16, t: 22, b: showDimensions ? 34 : 14 });
  const toX = (x2) => ox + x2 * scale2;
  const toY = (y2) => oy + (yMax - y2) * scale2;
  const rect = (r) => `x="${px(toX(r.x0))}" y="${px(toY(r.y1))}" width="${px(Math.max((r.x1 - r.x0) * scale2, 0.8))}" height="${px(Math.max((r.y1 - r.y0) * scale2, 0.8))}"`;
  const parts = [];
  parts.push(`<line x1="${px(toX(0) - 8)}" y1="${px(toY(planH))}" x2="${px(toX(planW) + 8)}" y2="${px(toY(planH))}" stroke="${PV.text3}" stroke-width="3" stroke-opacity="0.55" pointer-events="none" />`);
  for (const { key, r } of runs) {
    parts.push(`<rect class="region" data-run="${key}" ${rect(r)} fill="rgba(79,134,224,0.06)" stroke="none" />`);
  }
  const flat = result.boards.filter((b) => b.profilePlane === "XY");
  const standing = result.boards.filter((b) => b.profilePlane !== "XY");
  for (const b of flat.filter((bb2) => bb2.category !== "lid").sort((a2, c2) => a2.z1 - c2.z1)) {
    const warn = b.category === "avoidance_top";
    parts.push(`<rect data-board="${b.id}" pointer-events="none" ${rect(b)} fill="${warn ? PV.warn : PV.carcass}" fill-opacity="${warn ? 0.12 : 0.22}" stroke="${warn ? PV.warn : PV.carcassLine}" stroke-width="0.75"${warn ? ` stroke-dasharray="4 3"` : ""} />`);
  }
  for (const o of result.openings) {
    parts.push(`<rect pointer-events="none" ${rect({ x0: o.x0, x1: o.x0 + o.width, y0: o.y0, y1: o.y0 + o.depth })} fill="${PV.bg}" fill-opacity="0.35" stroke="${PV.text3}" stroke-dasharray="4 3" stroke-width="1" />`);
  }
  for (const lid of result.lids) {
    const r = { x0: lid.x0, x1: lid.x0 + lid.width, y0: lid.y0, y1: lid.y0 + lid.depth };
    parts.push(`<rect pointer-events="none" ${rect(r)} fill="${PV.carcass}" fill-opacity="0.5" stroke="${PV.carcassLine}" stroke-width="0.75" />`);
    parts.push(`<circle pointer-events="none" cx="${px(toX((r.x0 + r.x1) / 2))}" cy="${px(toY((r.y0 + r.y1) / 2))}" r="${px(Math.max(lid.holeDiameter / 2 * scale2, 2))}" fill="${PV.bg}" stroke="${PV.carcassLine}" stroke-width="0.75" />`);
  }
  for (const b of standing) {
    parts.push(`<rect data-board="${b.id}" pointer-events="none" ${rect(b)} fill="${PV.carcass}" fill-opacity="0.95" stroke="${PV.carcassLine}" stroke-width="0.6" />`);
  }
  const mid = result.boards.filter((b) => b.id.startsWith("middle_cabinet"));
  if (mid.length) {
    const r = { x0: Math.min(...mid.map((b) => b.x0)), x1: Math.max(...mid.map((b) => b.x1)), y0: Math.min(...mid.map((b) => b.y0)), y1: Math.max(...mid.map((b) => b.y1)) };
    parts.push(`<rect pointer-events="none" ${rect(r)} fill="none" stroke="${PV.select}" stroke-dasharray="6 3" stroke-width="1.25" />`);
    if ((r.x1 - r.x0) * scale2 > 50) parts.push(label(toX((r.x0 + r.x1) / 2), toY((r.y0 + r.y1) / 2), "middle cabinet", { size: 10, fill: "#8fb3ef" }));
  }
  for (const { key, r } of runs) {
    const w2 = (r.x1 - r.x0) * scale2;
    const h = (r.y1 - r.y0) * scale2;
    if (w2 < 44 || h < 18) continue;
    const cx = toX((r.x0 + r.x1) / 2);
    const cy = toY((r.y0 + r.y1) / 2);
    const vertical = h > w2 * 1.6 && w2 < 70;
    if (vertical) {
      parts.push(`<g transform="rotate(-90 ${px(cx)} ${px(cy)})">${label(cx, cy, `${LOUNGE_RUN_LABELS[key]} \xB7 ${fmt(r.y1 - r.y0)} \xD7 ${fmt(r.x1 - r.x0)}`, { size: 10 })}</g>`);
    } else if (h >= 60) {
      const top = toY(r.y1);
      parts.push(label(cx, top + 14, LOUNGE_RUN_LABELS[key], { size: 11 }));
      parts.push(label(cx, top + 28, `${fmt(r.x1 - r.x0)} \xD7 ${fmt(r.y1 - r.y0)}`, { size: 10, fill: PV.text2 }));
    } else if (h >= 34) {
      parts.push(label(cx, cy - 7, LOUNGE_RUN_LABELS[key], { size: 11 }));
      parts.push(label(cx, cy + 8, `${fmt(r.x1 - r.x0)} \xD7 ${fmt(r.y1 - r.y0)}`, { size: 10, fill: PV.text2 }));
    } else {
      parts.push(label(cx, cy, `${LOUNGE_RUN_LABELS[key]} \xB7 ${fmt(r.x1 - r.x0)} \xD7 ${fmt(r.y1 - r.y0)}`, { size: 10 }));
    }
  }
  const sel = runs.find((it) => it.key === selected);
  if (sel) parts.push(`<rect pointer-events="none" ${rect(sel.r)} fill="${PV.select}" fill-opacity="0.12" stroke="${PV.select}" stroke-width="2" />`);
  const vline = (param2, x2, y0, y1) => parts.push(grip(`data-boundary="edge" data-param="${param2}" data-axis="x"`, toX(x2), toY(y0), toX(x2), toY(y1)));
  const hline = (param2, y2, x0, x1) => parts.push(grip(`data-boundary="edge" data-param="${param2}" data-axis="y"`, toX(x0), toY(y2), toX(x1), toY(y2)));
  if (style === "I_SHAPE" && fp.i) {
    vline("mainWidth", fp.i.x1, fp.i.y0, fp.i.y1);
    hline("mainDepth", fp.i.y1, fp.i.x0, fp.i.x1);
  } else if (style === "PARALLEL" && fp.left && fp.right) {
    vline("totalWidth", fp.right.x1, fp.right.y0, fp.right.y1);
    vline("singleLoungeWidth", fp.right.x0, fp.right.y0, fp.right.y1);
    hline("depth", fp.right.y1, fp.left.x0, fp.right.x1);
  } else if (fp.main && fp.l) {
    const wing = fp.l;
    const main = fp.main;
    const leftWing = wing.x0 <= main.x0;
    const innerX = leftWing ? wing.x1 : wing.x0;
    const far = leftWing ? main : wing;
    vline("mainWidth", far.x1, far.y0, far.y1);
    vline("lDepth", innerX, wing.y0, main.y0);
    hline("lWidth", wing.y1, 0, planW);
    hline("mainDepth", main.y0, main.x0, main.x1);
  }
  if (showDimensions) {
    const wy = toY(planH) - 11;
    parts.push(dimText(toX(0), wy, "wall", "start", PV.text3));
    parts.push(dimText(toX(planW), wy, `W ${fmt(planW)}`, "end", PV.text2));
    parts.push(dimText(ox - 6, toY(planH / 2), fmt(planH), "end", PV.text2));
    parts.push(dimText(toX(planW / 2), toY(0) + 14, `room side \xB7 ${STYLE_LABEL[style] ?? style} \xB7 seat ${fmt(result.params.height)} high`, "middle", PV.text3));
  }
  return svgRoot(width, height, { scale: scale2, ox, oy, w: planW, h: planH }, "Lounge plan view", parts.join(""));
}

// generators/lounge/generator.ts
var asNum2 = (v2, fb) => {
  const n = Number(v2);
  return Number.isFinite(n) ? n : fb;
};
var r23 = (v2) => Math.round(v2 * 1e3) / 1e3;
var QUARTER = Math.tan(Math.PI / 8);
var FRONT_TYPES = /* @__PURE__ */ new Set(["front", "cabinet_door", "drawer_front", "fixed_front"]);
function mkBoard(id, name, boardType, thickness, plane, axis, x0, x1, y0, y1, z0, z1, profileVector) {
  const box = recordBoardBox(id, r23(x0), r23(x1), r23(y0), r23(y1), r23(z0), r23(z1));
  return {
    id,
    name,
    category: FRONT_TYPES.has(boardType) ? "front_panel" : boardType,
    boardType,
    materialThickness: thickness,
    profilePlane: plane,
    thicknessAxis: axis,
    stock: { kind: "partition", thickness },
    ...box,
    profileVector
  };
}
function arcPts(cx, cy, rad, a0, a1, steps = 4) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a2 = a0 + (a1 - a0) * (i / steps);
    pts.push({ x: r23(cx + rad * Math.cos(a2)), y: r23(cy + rad * Math.sin(a2)) });
  }
  return pts;
}
function circleHole(cx, cy, diameter) {
  return arcPts(cx, cy, diameter / 2, 0, -Math.PI * 2, 16);
}
function addAvoidanceCovers(prefix, x0, x1, D2, AD, AH, ppt, boards) {
  if (!(AD > 0 && AH > ppt)) return;
  boards.push(mkBoard(
    `${prefix}avoidance_top`,
    "Avoidance Top",
    "avoidance_top",
    ppt,
    "XY",
    "Z",
    x0,
    x1,
    r23(D2 - AD),
    D2,
    r23(AH - ppt),
    AH
  ));
  boards.push(mkBoard(
    `${prefix}avoidance_front`,
    "Avoidance Front",
    "avoidance_front",
    ppt,
    "XZ",
    "Y",
    x0,
    x1,
    r23(D2 - AD),
    r23(D2 - AD + ppt),
    0,
    r23(AH - ppt)
  ));
}
function addMiddleCabinet(raw, totalW, D2, boards, hinges, locks, grooves, warnings, fit, standOn = null, span = null) {
  const mc = raw.middleCabinet ?? {};
  const gap0 = span ? span.x1 - span.x0 : totalW - asNum2(raw.singleLoungeWidth, 1500) * 2;
  const CW = asNum2(mc.width, Math.min(RULES.MIDDLE_CABINET_WIDTH.value, Math.max(0, gap0)));
  const CD = asNum2(mc.depth, RULES.MIDDLE_CABINET_DEPTH.value);
  const CH = asNum2(mc.height, RULES.MIDDLE_CABINET_HEIGHT.value);
  const CSH = standOn ?? asNum2(mc.startHeight, RULES.MIDDLE_CABINET_START_HEIGHT.value);
  const dpt = Math.max(1, asNum2(mc.doorPanelThickness, RULES.MIDDLE_CABINET_DOOR_THICKNESS.value));
  const dc = Math.max(0, asNum2(mc.doorClearance, RULES.MIDDLE_CABINET_DOOR_CLEARANCE.value));
  const lockStyle = mc.doorLockStyle === "NONE" ? "NONE" : "RAZOR_ROUNDED";
  const lockSide = asNum2(mc.lockSideDistance, RULES.MIDDLE_CABINET_LOCK_SIDE.value);
  const hingeSide = asNum2(mc.hingeSideDistance, RULES.MIDDLE_CABINET_HINGE_SIDE.value);
  const hingeEdge = asNum2(mc.hingeCupCenterFromEdge, RULES.MIDDLE_CABINET_HINGE_FROM_EDGE.value);
  const cupD = asNum2(mc.hingeCupDiameter, RULES.MIDDLE_CABINET_HINGE_DIAMETER.value);
  const cupDepth = Math.min(Math.max(0.5, asNum2(mc.hingeCupDepth, RULES.MIDDLE_CABINET_HINGE_DEPTH.value)), dpt);
  const gap = gap0;
  if (standOn == null && raw.wheelAvoidanceEnabled && !(CSH > asNum2(raw.avoidanceHeight, RULES.DEFAULT_AVOIDANCE_HEIGHT.value))) {
    warnings.push("Middle cabinet start height must be greater than avoidance height.");
  }
  if (CW > Math.max(0, gap)) fit.push(`Middle cabinet width ${CW} exceeds the middle gap ${Math.max(0, gap)}.`);
  if (CD > D2) warnings.push("Middle cabinet depth exceeds lounge depth.");
  if (!(CW > 3 * dc)) warnings.push("Middle cabinet width must exceed 3 x door clearance.");
  if (!(CH > 2 * dc)) warnings.push("Middle cabinet height must exceed 2 x door clearance.");
  if (!(hingeSide * 2 < CH - 2 * dc)) warnings.push("Hinge side distance is too large for the door height.");
  const dvt = Math.max(1, asNum2(mc.dividerThickness, RULES.MIDDLE_CABINET_DIVIDER_THICKNESS.value));
  const x0 = span ? r23(span.x0 + Math.max(0, gap - CW) / 2) : r23((totalW - CW) / 2);
  const y0 = r23(D2 - CD);
  const dividerDepth = Math.max(0, CD - dpt);
  const tongueWidth = dividerDepth / 2;
  const tongueDepth = dvt / 2 - 0.5;
  const dividerBodyWidth = Math.max(0, CW - 2 * dpt);
  const doorSlotWidth = Math.max(0, (CW - 3 * dc) / 2);
  const doorWidth = Math.max(0, doorSlotWidth - dpt);
  const doorHeight = Math.max(0, CH - 2 * dc - 2 * dpt);
  boards.push(mkBoard(
    "middle_cabinet_bottom",
    "Middle Cabinet Bottom",
    "cabinet_bottom",
    dpt,
    "XY",
    "Z",
    x0,
    r23(x0 + CW),
    y0,
    D2,
    CSH,
    r23(CSH + dpt)
  ));
  boards.push(mkBoard(
    "middle_cabinet_top",
    "Middle Cabinet Top",
    "cabinet_top",
    dpt,
    "XY",
    "Z",
    x0,
    r23(x0 + CW),
    y0,
    D2,
    r23(CSH + CH - dpt),
    r23(CSH + CH)
  ));
  const sideH = Math.max(0, CH - 2 * dpt);
  boards.push(mkBoard(
    "middle_cabinet_left",
    "Middle Cabinet Left",
    "cabinet_side",
    dpt,
    "YZ",
    "X",
    x0,
    r23(x0 + dpt),
    y0,
    D2,
    r23(CSH + dpt),
    r23(CSH + dpt + sideH)
  ));
  boards.push(mkBoard(
    "middle_cabinet_right",
    "Middle Cabinet Right",
    "cabinet_side",
    dpt,
    "YZ",
    "X",
    r23(x0 + CW - dpt),
    r23(x0 + CW),
    y0,
    D2,
    r23(CSH + dpt),
    r23(CSH + dpt + sideH)
  ));
  const grooveU0 = Math.max(0, CD - tongueWidth - 5);
  const grooveV0 = (CH - dvt) / 2 - dpt - 0.5;
  grooves.push({
    id: "middle_cabinet_left_groove",
    boardId: "middle_cabinet_left",
    face: "A",
    u0: grooveU0,
    u1: CD,
    v0: grooveV0,
    v1: grooveV0 + dvt + 1,
    depth: dvt / 2
  });
  grooves.push({
    id: "middle_cabinet_right_groove",
    boardId: "middle_cabinet_right",
    face: "B",
    u0: grooveU0,
    u1: CD,
    v0: grooveV0,
    v1: grooveV0 + dvt + 1,
    depth: dvt / 2
  });
  const dividerZ0 = CSH + (CH - dvt) / 2;
  boards.push(mkBoard(
    "middle_cabinet_mid_divider",
    "Middle Cabinet Mid Horizontal Divider",
    "cabinet_divider",
    dvt,
    "XY",
    "Z",
    r23(x0 + dpt - tongueDepth),
    r23(x0 + CW - dpt + tongueDepth),
    r23(y0 + dpt),
    D2,
    dividerZ0,
    r23(dividerZ0 + dvt),
    [
      { x: 0, y: 0 },
      { x: dividerBodyWidth, y: 0 },
      { x: dividerBodyWidth, y: dividerDepth - tongueWidth },
      { x: dividerBodyWidth + tongueDepth, y: dividerDepth - tongueWidth },
      { x: dividerBodyWidth + tongueDepth, y: dividerDepth },
      { x: -tongueDepth, y: dividerDepth },
      { x: -tongueDepth, y: dividerDepth - tongueWidth },
      { x: 0, y: dividerDepth - tongueWidth },
      { x: 0, y: 0 }
    ]
  ));
  const lockCenterZ = r23(dividerZ0 - RULES.LOCK_DROP.value);
  const lockFromMeeting = lockSide + RULES.MIDDLE_CABINET_LOCK_EXTRA.value;
  const addDoor = (id, doorX0, isLeft) => {
    boards.push(mkBoard(
      id,
      isLeft ? "Middle Cabinet Left Door" : "Middle Cabinet Right Door",
      "cabinet_door",
      dpt,
      "XZ",
      "Y",
      doorX0,
      r23(doorX0 + doorWidth),
      y0,
      r23(y0 + dpt),
      r23(CSH + dc + dpt),
      r23(CSH + dc + dpt + doorHeight)
    ));
    const hingeX = isLeft ? doorX0 + hingeEdge : doorX0 + doorWidth - hingeEdge;
    const z0 = CSH + dc + dpt;
    hinges.push({ id: `${id}_hinge_bottom`, panelId: id, centerX: hingeX, centerZ: z0 + hingeSide, diameter: cupD, depth: cupDepth });
    hinges.push({ id: `${id}_hinge_top`, panelId: id, centerX: hingeX, centerZ: z0 + doorHeight - hingeSide, diameter: cupD, depth: cupDepth });
    if (lockStyle !== "NONE") {
      const lockX = isLeft ? doorX0 + doorWidth - lockFromMeeting : doorX0 + lockFromMeeting;
      locks.push({
        id: `${id}_lock`,
        panelId: id,
        centerX: lockX,
        centerZ: lockCenterZ,
        width: RULES.LOCK_WIDTH.value,
        height: RULES.LOCK_HEIGHT.value,
        radius: RULES.LOCK_HEIGHT.value / 2
      });
    }
  };
  addDoor("middle_cabinet_left_door", x0 + dc + dpt, true);
  addDoor("middle_cabinet_right_door", x0 + dc + doorSlotWidth + dc, false);
  return { width: CW, depth: CD, height: CH, startHeight: CSH };
}
function frameHeights(H, T) {
  const P2 = param({ H, T });
  const railZ0 = dim("lounge.frame.railBottom", { H: P2.H, T: P2.T, hr: RULES.FRAME_INNER_RAIL_HEIGHT }, (t) => r23(t.H - t.T - t.hr), { formula: "H - T - FRAME_INNER_RAIL_HEIGHT" });
  const slotZ = dim("lounge.frame.slotBottom", { z: ref("lounge.frame.railBottom"), nd: RULES.FRAME_HALVING_NOTCH, hg: RULES.FRAME_HALVING_GAP }, (t) => r23(t.z + t.nd - t.hg), { formula: "railBottom + FRAME_HALVING_NOTCH - FRAME_HALVING_GAP" });
  const seat = dim("lounge.frame.lidSeat", { H: P2.H, T: P2.T }, (t) => r23(t.H - t.T), { formula: "H - T" });
  return { railZ0, slotZ, seat, n: r23(railZ0 + RULES.FRAME_HALVING_NOTCH.value) };
}
function frameKit(L, back, H, T, right, boards, lids, xShift = 0) {
  const X = (a2, b) => {
    const a22 = a2 + xShift, b2 = b + xShift;
    return right ? [r23(a22), r23(b2)] : [r23(L - b2), r23(L - a22)];
  };
  const px2 = (x2) => {
    const s = x2 + xShift;
    return r23(right ? s : L - s);
  };
  const Y = (d0, d1) => [r23(back - d1), r23(back - d0)];
  const yz = (pts) => [...pts, pts[0]].map(([d2, z2]) => ({ y: r23(back - d2), z: r23(z2) }));
  const xz = (pts) => [...pts, pts[0]].map(([x2, z2]) => ({ x: px2(x2), z: r23(z2) }));
  const xy = (pts) => [...pts, pts[0]].map(([x2, d2]) => ({ x: px2(x2), y: r23(back - d2) }));
  const push = (id, name, type, plane, axis, x2, y2, z2, pv, th = T) => {
    const [x0, x1] = X(x2[0], x2[1]);
    const board = mkBoard(id, name, type, th, plane, axis, x0, x1, y2[0], y2[1], z2[0], z2[1], pv);
    boards.push(board);
    return board;
  };
  const lid = (id, name, x2, d2) => {
    const b = push(id, name, "lid", "XY", "Z", x2, Y(d2[0], d2[1]), [r23(H - T), H]);
    b.profileVector = [
      { x: b.x0, y: b.y0 },
      { x: b.x1, y: b.y0 },
      { x: b.x1, y: b.y1 },
      { x: b.x0, y: b.y1 },
      { x: b.x0, y: b.y0 }
    ];
    b.profileHoles = [circleHole((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, RULES.FRAME_FINGER_HOLE_DIAMETER.value)];
    lids.push({ id, x0: b.x0, y0: b.y0, width: r23(b.x1 - b.x0), depth: r23(b.y1 - b.y0), holeDiameter: RULES.FRAME_FINGER_HOLE_DIAMETER.value });
  };
  const wallPanel = (dEnd, slotZ) => {
    const atWall = r23(RULES.FRAME_WALL_GAP.value + T);
    return [[0, 0], [dEnd, 0], [dEnd, H], [atWall, H], [atWall, slotZ], [0, slotZ]];
  };
  return { H, X, px: px2, Y, yz, xz, xy, push, lid, wallPanel };
}
function frameRun(kit, ids, x0, x1, Dm, T, h) {
  const c2 = RULES.FRAME_WALL_GAP.value, s = RULES.FRAME_SLOT_CLEARANCE.value, g2 = RULES.FRAME_LID_GAP.value;
  const { railZ0, slotZ, seat, n } = h;
  const railBackD = [T + 2 * c2, 2 * T + 2 * c2];
  const railFrontD = [Dm - 2 * T - c2, Dm - T - c2];
  const support = [
    [T + c2, 0],
    [Dm - T, 0],
    [Dm - T, slotZ],
    [railFrontD[0], slotZ],
    [railFrontD[0], seat],
    [railBackD[1], seat],
    [railBackD[1], slotZ],
    [T + c2, slotZ]
  ];
  const sd = kit.Y(T + c2, Dm - T);
  const pushSupport = (id, name, x2) => {
    kit.push(id, name, "lid_support", "YZ", "X", x2, sd, [0, seat], kit.yz(support));
  };
  pushSupport(ids.supportL[0], ids.supportL[1], [x0, x0 + T]);
  pushSupport(ids.supportR[0], ids.supportR[1], [x1 - T, x1]);
  const a2 = x0 + g2, b = x1 - g2;
  const count = Math.max(1, Math.ceil((b - a2) / RULES.FRAME_LID_MAX_LENGTH.value - 1e-9));
  const lidLen = (b - a2 - (count - 1) * g2) / count;
  const mids = [];
  for (let j = 1; j < count; j++) mids.push(r23(a2 + j * (lidLen + g2) - g2 / 2));
  mids.forEach((cx, j) => pushSupport(`${ids.prefix}_mid_support_${j + 1}`, `${ids.label} Middle Support ${j + 1}`, [cx - T / 2, cx + T / 2]));
  const rail = [[x0, n], [x0 + T + s, n], [x0 + T + s, railZ0]];
  for (const cx of mids) rail.push([cx - T / 2 - s / 2, railZ0], [cx - T / 2 - s / 2, n], [cx + T / 2 + s / 2, n], [cx + T / 2 + s / 2, railZ0]);
  rail.push([x1 - T - s, railZ0], [x1 - T - s, n], [x1, n], [x1, seat], [x0, seat]);
  kit.push(`${ids.prefix}_rail_back`, `${ids.label} Rear Inner Rail`, "lid_rail", "XZ", "Y", [x0, x1], kit.Y(railBackD[0], railBackD[1]), [railZ0, seat], kit.xz(rail));
  kit.push(`${ids.prefix}_rail_front`, `${ids.label} Front Inner Rail`, "lid_rail", "XZ", "Y", [x0, x1], kit.Y(railFrontD[0], railFrontD[1]), [railZ0, seat], kit.xz(rail));
  const ld = [T + c2 + g2, Dm - T - g2];
  if (count === 1) kit.lid(`${ids.prefix}_lid`, `${ids.label} Lid`, [a2, b], ld);
  else for (let j = 0; j < count; j++) {
    const l0 = a2 + j * (lidLen + g2);
    kit.lid(`${ids.prefix}_lid_${j + 1}`, `${ids.label} Lid ${j + 1}`, [l0, l0 + lidLen], ld);
  }
}
function addFrameI(L, D2, H, T, boards, lids, errors) {
  const s = RULES.FRAME_SLOT_CLEARANCE.value, g2 = RULES.FRAME_LID_GAP.value, c2 = RULES.FRAME_WALL_GAP.value;
  const h = frameHeights(H, T);
  if (!(L > 4 * T + 2 * s + 2 * g2)) errors.push(`I: the run is only ${L} long.`);
  if (!(D2 > 4 * T + 3 * s + 2 * g2)) errors.push(`I: the depth ${D2} does not fit the rear rail, both inner rails and the front.`);
  if (!(h.railZ0 > 0 && h.slotZ < h.seat)) errors.push(`I: height ${H} is too low for the rails (${RULES.FRAME_INNER_RAIL_HEIGHT.value} + ${T}).`);
  if (errors.length) return;
  const kit = frameKit(L, D2, H, T, true, boards, lids);
  const slot = r23(T + s);
  kit.push("i_front", "Front", "seat_front", "XZ", "Y", [0, L], kit.Y(D2 - T, D2), [0, H]);
  kit.push("i_left_end", "Left End", "side", "YZ", "X", [0, T], kit.Y(0, D2 - T), [0, H], kit.yz(kit.wallPanel(D2 - T, h.slotZ)));
  kit.push("i_right_end", "Right End", "side", "YZ", "X", [L - T, L], kit.Y(0, D2 - T), [0, H], kit.yz(kit.wallPanel(D2 - T, h.slotZ)));
  kit.push("back_rail", "Rear Rail", "rear_rail", "XZ", "Y", [0, L], kit.Y(c2, c2 + T), [h.railZ0, H], kit.xz([
    [0, H],
    [0, h.n],
    [slot, h.n],
    [slot, h.railZ0],
    [L - slot, h.railZ0],
    [L - slot, h.n],
    [L, h.n],
    [L, H]
  ]));
  frameRun(kit, { prefix: "i", label: "I", supportL: ["i_left_support", "Left End Support"], supportR: ["i_right_support", "Right End Support"] }, T, L - T, D2, T, h);
}
function addFrameParallel(totalW, SW, D2, H, T, wheel, ft, boards, lids, locks, grooves, errors, backs, back) {
  const s = RULES.FRAME_SLOT_CLEARANCE.value, g2 = RULES.FRAME_LID_GAP.value, c2 = RULES.FRAME_WALL_GAP.value;
  const h = frameHeights(H, T);
  const rearZ0 = wheel ? wheel.AH : h.railZ0;
  if (!(totalW >= 2 * SW)) errors.push(`Parallel: the total width ${totalW} is less than two runs of ${SW}.`);
  if (!(SW > 3 * T + 2 * g2)) errors.push(`Parallel: the run width ${SW} does not fit both supports and the seat front.`);
  if (!(D2 > 3 * T + c2 + 2 * g2)) errors.push(`Parallel: the run is only ${D2} deep.`);
  if (!(h.railZ0 > 0)) errors.push(`Parallel: height ${H} is too low for the rear rail (${RULES.FRAME_INNER_RAIL_HEIGHT.value} + ${T}).`);
  if (wheel) {
    if (!(wheel.AD > 2 * T + c2 && wheel.AD < D2 - 2 * T)) errors.push(`Parallel: the wheel-arch depth ${wheel.AD} must lie between the rear rail and the aisle end (${2 * T + c2} to ${D2 - 2 * T}).`);
    if (!(wheel.AH > T && wheel.AH <= h.railZ0)) errors.push(`Parallel: the wheel-arch height ${wheel.AH} leaves the rear rail under ${RULES.FRAME_INNER_RAIL_HEIGHT.value} + ${T} (${T} to ${h.railZ0}).`);
  }
  const dz = ft != null ? frameDrawerHeights(H, T, "Parallel", errors) : null;
  if (ft != null && wheel && !(wheel.AD < D2 - ft - RULES.FRAME_DRAWER_RAIL_DEPTH.value - RULES.FRAME_DRAWER_POCKET_OVERRUN.value)) {
    errors.push(`Parallel drawer: the wheel-arch depth ${wheel.AD} reaches the drawer rail.`);
  }
  if (errors.length) return;
  const seat = h.seat;
  const tg = r23(T / 2 - RULES.FRAME_HALF_SLOT_TONGUE_GAP.value);
  const endT = ft ?? T;
  for (const side of ["left", "right"]) {
    const label2 = side === "left" ? "Left" : "Right";
    const shift = backs[side] ? T : 0;
    const kit = frameKit(totalW, D2, H, T, side === "left", boards, lids, shift);
    const { Y } = kit;
    const seatFront = wheel ? kit.yz([[0, wheel.AH], [wheel.AD, wheel.AH], [wheel.AD, 0], [D2, 0], [D2, H], [0, H]]) : void 0;
    const sf = kit.push(`${side}_side`, `${label2} Seat Front`, "seat_front", "YZ", "X", [SW - T, SW], Y(0, D2), [0, H], seatFront);
    if (ft == null) kit.push(`${side}_front`, `${label2} Aisle End`, "seat_front", "XZ", "Y", [0, SW - T], Y(D2 - T, D2), [0, H]);
    kit.push(`${side}_rear_rail`, `${label2} Rear Rail`, "rear_rail", "XZ", "Y", [0, SW - T + tg], Y(c2, c2 + T), [rearZ0, H]);
    const [py0, py1] = Y(c2 - s / 2, c2 + T + s / 2);
    grooves.push({
      id: `${side}_side_rear_rail_slot`,
      boardId: sf.id,
      face: side === "left" ? "B" : "A",
      u0: r23(py0 - sf.y0),
      u1: r23(py1 - sf.y0),
      v0: r23(rearZ0 - s / 2 - sf.z0),
      v1: r23(H - sf.z0),
      depth: r23(T / 2),
      for: `${side}_rear_rail`
    });
    const support = wheel ? kit.yz([[T + c2, wheel.AH], [wheel.AD, wheel.AH], [wheel.AD, 0], [D2 - endT, 0], [D2 - endT, seat], [T + c2, seat]]) : void 0;
    const outer = kit.push(`${side}_outer_support`, `${label2} Outer Support`, "lid_support", "YZ", "X", [0, T], Y(T + c2, D2 - endT), [0, seat], support);
    const inner = kit.push(`${side}_inner_support`, `${label2} Inner Support`, "lid_support", "YZ", "X", [SW - 2 * T, SW - T], Y(T + c2, D2 - endT), [0, seat], support);
    if (ft != null && dz) frameDrawer(kit, side, label2, [0, SW - T], [outer, inner], [T, SW - 2 * T], D2, T, ft, dz, locks, grooves);
    kit.lid(`${side}_lid`, `${label2} Lid`, [g2, SW - T - g2], [T + c2 + g2, D2 - endT - g2]);
    if (backs[side] && back) {
      const yRoom = r23(-back.over);
      const x0 = side === "left" ? 0 : r23(totalW - T);
      const panel = mkBoard(`${side}_back`, `${label2} Back Panel`, "back_panel", T, "YZ", "X", x0, r23(x0 + T), yRoom, D2, 0, back.zTop, backOutline(yRoom, D2, back.zTop, back.radius));
      panel.tessellated = true;
      boards.push(panel);
    }
  }
}
function frameDrawerHeights(H, T, label2, errors) {
  const P2 = param({ H, T });
  const gd = RULES.FRAME_DRAWER_GAP.value;
  const stripH = dim("lounge.frame.drawer.stripHeight", { rev: RULES.FRAME_DRAWER_STRIP_REVEAL, T: P2.T }, (t) => r23(t.rev + t.T), { formula: "FRAME_DRAWER_STRIP_REVEAL + T" });
  const stripZ0 = dim("lounge.frame.drawer.stripBottom", { H: P2.H, s: ref("lounge.frame.drawer.stripHeight") }, (t) => r23(t.H - t.s), { formula: "H - stripHeight" });
  const frontTop = dim("lounge.frame.drawer.frontTop", { z: ref("lounge.frame.drawer.stripBottom"), g: RULES.FRAME_DRAWER_GAP }, (t) => r23(t.z - t.g), { formula: "stripBottom - FRAME_DRAWER_GAP" });
  const room = r23(frontTop - gd);
  if (!(room > RULES.LOCK_DROP.value + RULES.LOCK_HEIGHT.value / 2)) {
    errors.push(`${label2} drawer: height ${H} leaves only ${room} for the drawer front under the ${stripH} strip.`);
  }
  return { stripZ0, frontTop };
}
function frameDrawer(kit, prefix, label2, span, supports, rail, Dl, T, ft, z2, locks, grooves) {
  const { Y, push, px: px2, xy } = kit;
  const gd = RULES.FRAME_DRAWER_GAP.value, s = RULES.FRAME_SLOT_CLEARANCE.value;
  const { stripZ0, frontTop } = z2;
  push(`${prefix}_drawer_strip`, `${label2} Drawer Fixed Strip`, "fixed_front", "XZ", "Y", span, Y(Dl - ft, Dl), [stripZ0, kit.H], void 0, ft);
  push(`${prefix}_drawer_front`, `${label2} Drawer Front`, "drawer_front", "XZ", "Y", [span[0] + gd, span[1] - gd], Y(Dl - ft, Dl), [gd, frontTop], void 0, ft);
  locks.push({
    id: `${prefix}_drawer_front_lock`,
    panelId: `${prefix}_drawer_front`,
    centerX: px2((span[0] + span[1]) / 2),
    centerZ: r23(frontTop - RULES.LOCK_DROP.value),
    width: RULES.LOCK_WIDTH.value,
    height: RULES.LOCK_HEIGHT.value,
    radius: RULES.LOCK_HEIGHT.value / 2
  });
  const tg = r23(T / 2 - RULES.FRAME_DRAWER_TONGUE_GAP.value);
  const [xl, xr] = rail;
  const d1 = Dl - ft, d0 = d1 - RULES.FRAME_DRAWER_RAIL_DEPTH.value, dt = d1 - RULES.FRAME_DRAWER_RAIL_PLAIN_FRONT.value;
  push(`${prefix}_drawer_rail`, `${label2} Drawer Rail`, "drawer_rail", "XY", "Z", [xl - tg, xr + tg], Y(d0, d1), [stripZ0, stripZ0 + T], xy([
    [xl - tg, d0],
    [xr + tg, d0],
    [xr + tg, dt],
    [xr, dt],
    [xr, d1],
    [xl, d1],
    [xl, dt],
    [xl - tg, dt]
  ]));
  const ov = RULES.FRAME_DRAWER_POCKET_OVERRUN.value;
  const [py0, py1] = Y(d0 - ov, dt + ov);
  const mid = px2((xl + xr) / 2);
  for (const sup of supports) {
    grooves.push({
      id: `${sup.id}_drawer_rail_pocket`,
      boardId: sup.id,
      face: (sup.x0 + sup.x1) / 2 < mid ? "A" : "B",
      u0: r23(py0 - sup.y0),
      u1: r23(py1 - sup.y0),
      v0: r23(stripZ0 - s / 2 - sup.z0),
      v1: r23(stripZ0 + T + s / 2 - sup.z0),
      depth: r23(T / 2),
      for: `${prefix}_drawer_rail`
    });
  }
}
function backOutline(yRoom, yWall, zTop, radius) {
  const r = Math.max(0, Math.min(radius, (yWall - yRoom) / 2, zTop / 2));
  if (r < 0.5) {
    return [
      { y: yRoom, z: 0 },
      { y: yWall, z: 0 },
      { y: yWall, z: zTop },
      { y: yRoom, z: zTop },
      { y: yRoom, z: 0 }
    ];
  }
  return [
    { y: yRoom, z: 0 },
    { y: yWall, z: 0 },
    { y: yWall, z: zTop },
    { y: r23(yRoom + r), z: zTop, bulge: QUARTER },
    { y: yRoom, z: r23(zTop - r) },
    { y: yRoom, z: 0 }
  ];
}
function backMetrics(raw, H) {
  const P2 = param({ H });
  const overIn = raw.backPanelOverhang == null ? RULES.BACK_PANEL_OVERHANG : lit(Math.max(0, asNum2(raw.backPanelOverhang, 0)));
  const over = dim("lounge.back.overhang", { d: overIn }, (t) => Math.max(0, t.d), { formula: "BACK_PANEL_OVERHANG" });
  const zTop = dim("lounge.back.height", { H: P2.H, above: RULES.BACK_PANEL_ABOVE_SEAT }, (t) => r23(t.H + t.above), { formula: "H + BACK_PANEL_ABOVE_SEAT" });
  return { over, zTop, radius: RULES.BACK_PANEL_CORNER_RADIUS.value };
}
function addFrameL(L, Dm, Dl, Wl, H, T, right, ft, boards, lids, locks, grooves, errors, back = null) {
  const c2 = RULES.FRAME_WALL_GAP.value;
  const s = RULES.FRAME_SLOT_CLEARANCE.value;
  const g2 = RULES.FRAME_LID_GAP.value;
  const hr = RULES.FRAME_INNER_RAIL_HEIGHT.value;
  const P2 = param({ L, Wl, H, T });
  const end = back ? r23(L - T) : L;
  const Lm = back ? dim("lounge.frame.mainLength", { L: P2.L, Wl: P2.Wl, T: P2.T }, (t) => r23(t.L - t.Wl - t.T), { formula: "L - Wl - T" }) : dim("lounge.frame.mainLength", { L: P2.L, Wl: P2.Wl }, (t) => r23(t.L - t.Wl), { formula: "L - Wl" });
  const h = frameHeights(H, T);
  const { railZ0, slotZ, seat } = h;
  const slot = r23(T + s);
  if (Wl < RULES.L_MIN_WING_WIDTH.value) errors.push(`L: the wing is only ${Wl} wide \u2014 at least ${RULES.L_MIN_WING_WIDTH.value}.`);
  if (!(Lm > 3 * T + 2 * s)) errors.push(`L: the main run is only ${Lm} long.`);
  if (!(Dm > 4 * T + 3 * s + 2 * g2)) errors.push(`L: the main depth ${Dm} does not fit the rear rail, both inner rails and the front.`);
  if (!(Dl > Dm)) errors.push(`L: the wing (${Dl}) must reach past the main front (${Dm}).`);
  if (!(railZ0 > 0 && slotZ < seat)) errors.push(`L: height ${H} is too low for the rails (${hr} + ${T}).`);
  const dz = ft != null ? frameDrawerHeights(H, T, "L", errors) : null;
  if (errors.length) return;
  const wall = Dl;
  const kit = frameKit(L, wall, H, T, right, boards, lids);
  const { Y, push } = kit;
  push("main_end", "Main End", "side", "YZ", "X", [0, T], Y(0, Dm - T), [0, H], kit.yz(kit.wallPanel(Dm - T, slotZ)));
  push("main_front", "Main Front", "seat_front", "XZ", "Y", [0, Lm], Y(Dm - T, Dm), [0, H]);
  push("l_side", "L Side (junction)", "side", "YZ", "X", [Lm, Lm + T], Y(0, Dl), [0, H], kit.yz(kit.wallPanel(Dl, slotZ)));
  push("l_outer_side", "L Outer Side", "side", "YZ", "X", [end - T, end], Y(0, Dl), [0, H], kit.yz(kit.wallPanel(Dl, slotZ)));
  if (ft == null) push("l_front", "L Front", "seat_front", "XZ", "Y", [Lm + T, end - T], Y(Dl - T, Dl), [0, H]);
  const n = h.n;
  push("back_rail", "Rear Rail", "rear_rail", "XZ", "Y", [0, end], Y(c2, c2 + T), [railZ0, H], kit.xz([
    [0, H],
    [0, n],
    [slot, n],
    [slot, railZ0],
    [Lm - s / 2, railZ0],
    [Lm - s / 2, n],
    [Lm + T + s / 2, n],
    [Lm + T + s / 2, railZ0],
    [end - slot, railZ0],
    [end - slot, n],
    [end, n],
    [end, H]
  ]));
  frameRun(kit, { prefix: "main", label: "Main", supportL: ["main_end_support", "Main End Support"], supportR: ["main_l_support", "Main Junction Support"] }, T, Lm, Dm, T, h);
  const wingFront = ft == null ? T : ft;
  const supIn = push("l_support_inner", "L Inner Support", "lid_support", "YZ", "X", [Lm + T, Lm + 2 * T], Y(T + c2, Dl - wingFront), [0, seat]);
  const supOut = push("l_support_outer", "L Outer Support", "lid_support", "YZ", "X", [end - 2 * T, end - T], Y(T + c2, Dl - wingFront), [0, seat]);
  if (ft != null && dz) {
    frameDrawer(kit, "l", "L", [Lm + T, end - T], [supIn, supOut], [Lm + 2 * T, end - 2 * T], Dl, T, ft, dz, locks, grooves);
  }
  kit.lid("l_lid", "L Lid", [Lm + T + g2, end - T - g2], [T + c2 + g2, Dl - wingFront - g2]);
  if (back) {
    const yRoom = r23(-back.over);
    const panel = push("l_back", "Wing Back Panel", "back_panel", "YZ", "X", [end, L], [yRoom, wall], [0, back.zTop], backOutline(yRoom, wall, back.zTop, back.radius));
    panel.tessellated = true;
  }
}
function generateLounge(raw, options = {}) {
  beginProvenance();
  const warnings = [];
  const errors = [];
  const style = raw.style ?? "L_SHAPE";
  if (raw.construction === "classic") {
    warnings.push("The classic lounge construction was retired; this lounge is built as the frame construction.");
  }
  if (style === "U_SHAPE") {
    errors.push("The U-shaped lounge was retired. Draw it again as an L or I lounge.");
    endProvenance();
    return { params: { style, height: asNum2(raw.height, RULES.DEFAULT_HEIGHT.value) }, boards: [], milling: { issues: [] }, openings: [], lids: [], footprint: {}, hinges: [], locks: [], grooves: [], joints: [], validation: { errors, warnings }, debug: { boardFrame: "final" } };
  }
  const H = asNum2(raw.height, RULES.DEFAULT_HEIGHT.value);
  const ppt = Math.max(1, asNum2(raw.partitionPanelThickness, RULES.DEFAULT_PPT.value));
  const P2 = param({ H, ppt });
  const Hprime = dim("lounge.panelHeight", { H: P2.H, ppt: P2.ppt }, (t) => t.H - t.ppt);
  const boards = [];
  const openings = [];
  const lids = [];
  const hinges = [];
  const locks = [];
  const grooves = [];
  const footprint = {};
  const AD = asNum2(raw.avoidanceDepth, RULES.DEFAULT_AVOIDANCE_DEPTH.value);
  const AH = asNum2(raw.avoidanceHeight, RULES.DEFAULT_AVOIDANCE_HEIGHT.value);
  const wheelOn = raw.wheelAvoidanceEnabled === true;
  const wheel = wheelOn ? { AD, AH } : void 0;
  if (H <= ppt) warnings.push("Height should be greater than panel thickness.");
  const frameL = style === "L_SHAPE";
  const frameP = style === "PARALLEL";
  let middleCabinet = null;
  let backBuilt = null;
  const backFlags = {};
  const lDrawer = frameL && raw.lFrontAccess === "DRAWER";
  if (raw.lFrontAccess && raw.lFrontAccess !== "NONE" && !lDrawer) {
    warnings.push(`lFrontAccess ${raw.lFrontAccess} is only built as a drawer on the frame L; ignored.`);
  }
  if (style === "I_SHAPE") {
    const W = asNum2(raw.mainWidth, 2e3);
    const D2 = asNum2(raw.mainDepth, 600);
    footprint.i = { x0: 0, x1: W, y0: 0, y1: D2 };
    if (wheelOn) warnings.push("I frame: wheel arch avoidance is not in the frame lounge yet; ignored.");
    addFrameI(W, D2, H, ppt, boards, lids, errors);
  } else if (style === "PARALLEL") {
    const totalW = asNum2(raw.totalWidth, 4e3);
    const SW = asNum2(raw.singleLoungeWidth, 1500);
    const D2 = asNum2(raw.depth, 800);
    if (totalW < 2 * SW) warnings.push("PARALLEL totalWidth < 2\xD7singleLoungeWidth; runs overlap.");
    if (wheelOn) {
      if (!(AD < D2)) warnings.push("Avoidance Depth must be less than Depth.");
      if (!(AH < H - ppt)) warnings.push("Avoidance Height must be less than Height - PPT.");
    }
    const leftOn = raw.leftBackPanel === true;
    const rightOn = raw.rightBackPanel === true;
    if (leftOn || rightOn) backBuilt = backMetrics(raw, H);
    if (leftOn) backFlags.leftBackPanel = true;
    if (rightOn) backFlags.rightBackPanel = true;
    const leftInner = r23(SW + (leftOn ? ppt : 0));
    const rightInner = r23(totalW - SW - (rightOn ? ppt : 0));
    footprint.left = { x0: 0, x1: leftInner, y0: leftOn && backBuilt ? r23(-backBuilt.over) : 0, y1: D2 };
    footprint.right = { x0: rightInner, x1: totalW, y0: rightOn && backBuilt ? r23(-backBuilt.over) : 0, y1: D2 };
    const ftP = raw.aisleAccess === "DRAWER" ? Math.max(1, asNum2(raw.frontPanelThickness, RULES.FRAME_DRAWER_FRONT_THICKNESS.value)) : null;
    addFrameParallel(totalW, SW, D2, H, ppt, wheel ?? null, ftP, boards, lids, locks, grooves, errors, { left: leftOn, right: rightOn }, backBuilt);
    if (wheelOn && !errors.length) addAvoidanceCovers("parallel_", 0, totalW, D2, AD, AH, ppt, boards);
    const gapW = rightInner - leftInner;
    const mcOn = raw.hasMiddleCabinet ?? gapW >= RULES.MIDDLE_CABINET_MIN_WIDTH.value;
    const planCovers = mcOn ? gapCovers(raw.planWheelArches, leftInner, rightInner, D2, H, ppt) : [];
    const planTop = planCovers.reduce((m2, c2) => Math.max(m2, c2.z1), 0);
    const standOn = planCovers.length ? planTop : wheelOn ? AH : 0;
    if (mcOn && !errors.length) middleCabinet = addMiddleCabinet(raw, totalW, D2, boards, hinges, locks, grooves, warnings, errors, standOn, { x0: leftInner, x1: rightInner });
    if (planCovers.length && !errors.length) {
      planCovers.forEach((c2, i) => {
        const id = planCovers.length === 1 ? "mid_avoidance" : `mid_avoidance_${i + 1}`;
        const z0 = r23(c2.z1 - ppt);
        boards.push(mkBoard(`${id}_top`, "Avoidance Top", "avoidance_top", ppt, "XY", "Z", c2.x0, c2.x1, c2.y0, c2.y1, z0, c2.z1));
        if (c2.y0 + ppt < c2.y1) {
          boards.push(mkBoard(`${id}_front`, "Avoidance Front", "avoidance_front", ppt, "XZ", "Y", c2.x0, c2.x1, c2.y0, r23(c2.y0 + ppt), 0, z0));
        }
      });
    }
  } else {
    const mainW = asNum2(raw.mainWidth, 2e3);
    const mainD = asNum2(raw.mainDepth, 600);
    const ret = asNum2(raw.lWidth, 1600);
    const thick = asNum2(raw.lDepth, 600);
    const right = (raw.lPosition ?? "RIGHT") !== "LEFT";
    if (wheelOn) warnings.push("L frame: wheel arch avoidance is not in the frame lounge yet; ignored.");
    const ft = lDrawer ? Math.max(1, asNum2(raw.frontPanelThickness, RULES.FRAME_DRAWER_FRONT_THICKNESS.value)) : null;
    if (raw.backPanel === true) {
      backBuilt = backMetrics(raw, H);
      backFlags.backPanel = true;
    }
    const wallY = r23(ret);
    const inset = backBuilt ? ppt : 0;
    const overY = backBuilt ? backBuilt.over : 0;
    footprint.main = right ? { x0: 0, x1: r23(mainW - thick - inset), y0: r23(wallY - mainD), y1: wallY } : { x0: r23(thick + inset), x1: mainW, y0: r23(wallY - mainD), y1: wallY };
    footprint.l = right ? { x0: r23(mainW - thick - inset), x1: mainW, y0: overY ? r23(-overY) : 0, y1: wallY } : { x0: 0, x1: r23(thick + inset), y0: overY ? r23(-overY) : 0, y1: wallY };
    addFrameL(mainW, mainD, ret, thick, H, ppt, right, ft, boards, lids, locks, grooves, errors, backBuilt);
  }
  notchPlanArches(boards, raw.planWheelArches);
  applyLayoutDraft(boards, options.layout != null ? options.layout : LAYOUT, {}, errors, warnings, {
    style,
    construction: "frame",
    lFrontAccess: raw.lFrontAccess === "DRAWER" ? "DRAWER" : "NONE",
    aisleAccess: raw.aisleAccess === "DRAWER" ? "DRAWER" : "NONE"
  });
  attachFaces(boards);
  const joints = buildLoungeFaces({ boards, openings, lids, hinges, locks, grooves, doorColour: doorColourOf(raw) });
  applyDoorSides(boards, raw);
  const milling = applyMilling(boards);
  return {
    params: {
      style,
      height: H,
      partitionPanelThickness: ppt,
      panelHeight: Hprime,
      construction: "frame",
      ...frameL ? { lFrontAccess: lDrawer ? "DRAWER" : "NONE" } : {},
      ...frameP ? { aisleAccess: raw.aisleAccess === "DRAWER" ? "DRAWER" : "NONE" } : {},
      ...style === "PARALLEL" ? { middleCabinet } : {},
      ...backFlags,
      ...backBuilt ? { backPanelOverhang: backBuilt.over, backPanelHeight: backBuilt.zTop } : {}
    },
    boards,
    milling,
    openings,
    lids,
    footprint,
    hinges,
    locks,
    grooves,
    joints,
    validation: { errors, warnings },
    debug: { provenance: endProvenance(), boardFrame: "final" }
  };
}
export {
  generateLounge,
  generateLoungeSvgPreview,
  loungeFootprintBoxes,
  loungeFromDrawnRun,
  loungeFromPolyline,
  loungePolyline,
  pointInFootprintBoxes
};
