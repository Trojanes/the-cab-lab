// Generated from generators/sketchBoard/generator.ts - do not edit.

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

// generators/sketchBoard/generator.ts
var BOARD_ID = "BOARD";
var PLANES = /* @__PURE__ */ new Set(["XY", "XZ", "YZ"]);
var KINDS = /* @__PURE__ */ new Set(["carcass", "partition", "door"]);
var r3 = (n) => Math.round(n * 1e3) / 1e3;
var emptyGrain = () => ({ groups: {}, present: [], checked: false, issues: [] });
var emptyMilling = () => ({ issues: [] });
function num(v) {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? r3(n) : null;
}
function openRing(raw, label, errors) {
  if (!Array.isArray(raw)) {
    errors.push(`${label} is missing`);
    return null;
  }
  const pts = [];
  for (const p of raw) {
    const u = num(p?.u);
    const v = num(p?.v);
    if (u == null || v == null) {
      errors.push(`${label} has a point that is not a number`);
      return null;
    }
    const b = Number(p?.b);
    const bulge = Number.isFinite(b) && Math.abs(b) > 1e-9 ? b : 0;
    const prev = pts[pts.length - 1];
    if (prev && prev.u === u && prev.v === v) continue;
    pts.push(bulge ? { u, v, b: bulge } : { u, v });
  }
  if (pts.length > 1) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    if (a.u === b.u && a.v === b.v) pts.pop();
  }
  return pts;
}
function signedArea2(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.u * b.v - b.u * a.v;
  }
  return s / 2;
}
var ARC_CHORD_MM = 0.05;
var ARC_STEP_MAX = 5 * Math.PI / 180;
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
    const step = Math.min(ARC_STEP_MAX, 2 * Math.acos(Math.max(-1, 1 - ARC_CHORD_MM / r)));
    const k = Math.max(2, Math.ceil(Math.abs(sweep) / step));
    for (let j = 1; j < k; j += 1) {
      const t = a0 + sweep * j / k;
      out.push({ u: r3(cu + r * Math.cos(t)), v: r3(cv + r * Math.sin(t)) });
    }
  }
  return out;
}
var hasArcs = (pts) => pts.some((p) => !!p.b);
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
function wind(pts, ccw) {
  if (pts.length < 2) return pts;
  return signedArea2(tessellateRing(pts)) > 0 === ccw ? pts.slice() : reverseRing(pts);
}
function onBoundary(poly, u, v) {
  const eps = 0.01;
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const dx = b.u - a.u;
    const dy = b.v - a.v;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    const t = Math.max(0, Math.min(1, ((u - a.u) * dx + (v - a.v) * dy) / len2));
    const px = a.u + t * dx;
    const py = a.v + t * dy;
    if ((u - px) * (u - px) + (v - py) * (v - py) <= eps * eps) return true;
  }
  return false;
}
function inside(poly, u, v) {
  if (onBoundary(poly, u, v)) return false;
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i];
    const b = poly[j];
    const cross = a.v > v !== b.v > v && u < (b.u - a.u) * (v - a.v) / (b.v - a.v) + a.u;
    if (cross) hit = !hit;
  }
  return hit;
}
function crosses(a, b, c, d) {
  const side = (p, q, r) => (q.u - p.u) * (r.v - p.v) - (q.v - p.v) * (r.u - p.u);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  return (d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) && (d3 > 0 && d4 < 0 || d3 < 0 && d4 > 0);
}
function ringCrosses(pts) {
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      if (crosses(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}
function holeInside(outer, hole) {
  if (hole.some((p) => !inside(outer, p.u, p.v))) return false;
  for (let i = 0; i < hole.length; i += 1) {
    const a = hole[i];
    const b = hole[(i + 1) % hole.length];
    for (let k = 0; k < outer.length; k += 1) {
      if (crosses(a, b, outer[k], outer[(k + 1) % outer.length])) return false;
    }
  }
  return true;
}
function colourFaceId(pull, colorFace) {
  const sketch = pull === 1 ? "B" : "A";
  return colorFace === "sketch" ? sketch : sketch === "A" ? "B" : "A";
}
function profilePoint(plane, u, v) {
  if (plane === "YZ") return { y: u, z: v };
  if (plane === "XZ") return { x: u, z: v };
  return { x: u, y: v };
}
function closedProfile(plane, pts) {
  const ring = pts.map((p) => profilePoint(plane, p.u, p.v));
  ring.push(ring[0]);
  return ring;
}
function recordRing(prefix, pts) {
  const outline = new Outline(prefix, ["u", "v"]);
  for (const p of pts) {
    const u = param({ u: p.u });
    const v = param({ v: p.v });
    outline.add(ex({ u: u.u }, (t) => t.u), ex({ v: v.v }, (t) => t.v));
  }
  return outline.points.map(([u, v]) => ({ u, v }));
}
function generateSketchBoard(raw) {
  beginProvenance();
  const errors = [];
  const warnings = [];
  const plane = raw?.plane;
  if (!PLANES.has(plane)) errors.push("the sketch plane is not XY, XZ or YZ");
  const pull = raw?.pull;
  if (pull !== 1 && pull !== -1) errors.push("the thickness direction is not set");
  const kind = raw?.stock?.kind;
  if (!KINDS.has(kind)) errors.push("the board stock is not carcass, partition or door");
  const thickness = num(raw?.stock?.thickness);
  if (thickness == null || thickness <= 0) errors.push("the board has no thickness");
  const outline = openRing(raw?.outline, "the outline", errors);
  const enough = (r) => r.length >= 3 || r.length === 2 && hasArcs(r);
  const flat = outline && enough(outline) ? tessellateRing(outline) : [];
  if (outline && !enough(outline)) errors.push("the outline needs at least 3 points");
  if (outline && enough(outline) && Math.abs(signedArea2(flat)) < 1e-6) errors.push("the outline has no area");
  if (flat.length >= 4 && ringCrosses(flat)) errors.push("the outline crosses itself");
  const outer = outline && enough(outline) && Math.abs(signedArea2(flat)) >= 1e-6 ? wind(outline, true) : [];
  const outerFlat = outer.length ? tessellateRing(outer) : [];
  const holes = [];
  const rawHoles = raw?.holes ?? [];
  if (raw?.holes != null && !Array.isArray(raw.holes)) errors.push("the openings are missing");
  if (Array.isArray(rawHoles)) {
    rawHoles.forEach((loop, i) => {
      const label = `opening ${i + 1}`;
      const ring = openRing(loop, label, errors);
      if (!ring) return;
      if (!enough(ring)) {
        errors.push(`${label} needs at least 3 points`);
        return;
      }
      if (Math.abs(signedArea2(tessellateRing(ring))) < 1e-6) {
        errors.push(`${label} has no area`);
        return;
      }
      const wound = wind(ring, false);
      if (outerFlat.length && !holeInside(outerFlat, tessellateRing(wound))) errors.push(`${label} is not inside the outline`);
      holes.push(wound);
    });
  }
  const doorSides = doorSidesOf(raw);
  const carcassColorName = carcassColourOf(raw);
  const doorColorName = kind === "door" ? doorColourOf({ doorColorName: raw?.stock?.colour || raw?.doorColorName }) : void 0;
  let colorFace = "pull";
  if (kind === "door" && doorSides === "single") {
    if (raw?.colorFace == null) colorFace = "pull";
    else if (raw.colorFace === "sketch" || raw.colorFace === "pull") colorFace = raw.colorFace;
    else errors.push("the colour face is not sketch or pull");
  }
  const params = {
    plane: PLANES.has(plane) ? plane : "XY",
    pull: pull === 1 || pull === -1 ? pull : 1,
    outline: outer,
    holes,
    stock: {
      kind: KINDS.has(kind) ? kind : "carcass",
      thickness: thickness != null && thickness > 0 ? thickness : 0,
      ...doorColorName ? { colour: doorColorName } : {}
    },
    doorSides,
    ...raw?.doorSeries === "acrylic" || raw?.doorSeries === "hpl" ? { doorSeries: raw.doorSeries } : {},
    ...doorColorName ? { doorColorName } : {},
    carcassColorName,
    colorFace,
    ...raw?.grain ? { grain: raw.grain } : {}
  };
  const fail = () => ({
    params,
    boards: [],
    joints: [],
    features: [],
    validation: { errors, warnings },
    grain: emptyGrain(),
    milling: emptyMilling(),
    debug: { boardFrame: "final", provenance: endProvenance() }
  });
  if (errors.length || !PLANES.has(plane) || pull !== 1 && pull !== -1 || !KINDS.has(kind) || thickness == null || thickness <= 0) {
    return fail();
  }
  const recorded = recordRing(`${BOARD_ID}.pt`, outerFlat);
  const recordedHoles = holes.map((loop, i) => recordRing(`${BOARD_ID}.hole${i}`, tessellateRing(loop)));
  const curved = hasArcs(outer) || holes.some(hasArcs);
  const [U, V, T] = planeAxes(plane);
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (const p of recorded) {
    minU = Math.min(minU, p.u);
    maxU = Math.max(maxU, p.u);
    minV = Math.min(minV, p.v);
    maxV = Math.max(maxV, p.v);
  }
  const t0 = pull === 1 ? 0 : -thickness;
  const t1 = pull === 1 ? thickness : 0;
  const box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
  box[`${U}0`] = minU;
  box[`${U}1`] = maxU;
  box[`${V}0`] = minV;
  box[`${V}1`] = maxV;
  box[`${T}0`] = t0;
  box[`${T}1`] = t1;
  const board = {
    id: BOARD_ID,
    name: "Board",
    category: kind,
    role: kind,
    boardType: kind,
    materialThickness: thickness,
    profilePlane: plane,
    thicknessAxis: T.toUpperCase(),
    stock: {
      kind,
      thickness,
      ...kind === "door" ? { colour: doorColorName, sides: doorSides === "double" ? 2 : 1 } : {}
    },
    ...recordBoardBox(BOARD_ID, box.x0, box.x1, box.y0, box.y1, box.z0, box.z1),
    profileVector: closedProfile(plane, recorded),
    ...curved ? { tessellated: true } : {}
  };
  attachFaces([board]);
  recordedHoles.forEach((loop, i) => {
    const pts = loop.map((p) => [r3(p.u - minU), r3(p.v - minV)]);
    const us = pts.map((p) => p[0]);
    const vs = pts.map((p) => p[1]);
    addFeature(board, "A", {
      id: `HOLE_${i + 1}`,
      kind: "cutout",
      through: true,
      u0: Math.min(...us),
      u1: Math.max(...us),
      v0: Math.min(...vs),
      v1: Math.max(...vs),
      loop: pts,
      key: `${BOARD_ID}.hole${i}`
    });
  });
  annotate(board, "A", { finish: { colour: carcassColorName } });
  annotate(board, "B", { finish: { colour: carcassColorName } });
  if (kind === "door") {
    const face = colourFaceId(pull, colorFace);
    const other = face === "A" ? "B" : "A";
    annotate(board, face, { semantic: "outside", visible: true, finish: { colour: doorColorName } });
    annotate(board, other, doorSides === "double" ? { semantic: "outside", visible: true, finish: { colour: doorColorName } } : { semantic: "back", visible: false, finish: { colour: carcassColorName } });
  }
  const grain = kind === "door" ? applyGrain([board], () => "front", params, { front: "horizontal" }) : emptyGrain();
  applyDoorSides([board], params);
  const milling = applyMilling([board]);
  return {
    params,
    boards: [board],
    joints: [],
    features: [],
    validation: { errors, warnings },
    grain,
    milling,
    debug: { boardFrame: "final", provenance: endProvenance() }
  };
}
export {
  generateSketchBoard,
  tessellateRing
};
