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
function edgeFaces(b) {
  return (b.faces ?? (b.faces = facesOf(b))).filter((f) => f.id.startsWith("E"));
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
function doorColourOf(params) {
  const raw = params ? params.doorColorName || params.doorColor : "";
  return String(raw || "").trim() || DEFAULT_DOOR_COLOUR;
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
var EPS = 0.6;
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
    if (gapRight >= -EPS && (best == null || Math.abs(gapRight) < Math.abs(best.gap))) {
      best = { axis: ax.axis, aSide: "+", gap: gapRight };
    }
    if (gapLeft >= -EPS && (best == null || Math.abs(gapLeft) < Math.abs(best.gap))) {
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
function relationshipDeclarationsForBoards(boardIds) {
  const vs = [...boardIds].filter((id) => /^V\d+$/.test(id)).sort((a, b) => a.localeCompare(b, void 0, { numeric: true }));
  const extra = [];
  if (boardIds.has("B3")) {
    for (const v of vs) extra.push(D(`kt_${v.toLowerCase()}_b3`, v, "B3"));
    const funcs = [...boardIds].filter((id) => /door-shelf$/.test(id) || /-(bottom)$/.test(id));
    for (const id of funcs) extra.push(D(`kt_b3_${id.replace(/-/g, "_")}`, "B3", id));
  }
  const rails = [...boardIds].filter((id) => /^(T[123]|B4)(-\d+)?$/.test(id));
  const endVs = vs.length ? [vs[0], vs[vs.length - 1]].filter((v, i, a) => a.indexOf(v) === i) : [];
  for (const rail of rails) {
    for (const v of endVs) extra.push(D(`kt_${rail.replace(/-/g, "_")}_${v.toLowerCase()}`, rail, v));
  }
  return [...STATIC, ...extra].filter((d) => present(d, boardIds));
}

// generators/kitchen/rules.json
var rules_default = {
  NOTCH_ALLOWANCE_EXTRA: { value: 1, doc: "\u8BA9\u4F4D\u7F3A\u53E3/\u69FD\u5BBD\u4F59\u91CF\uFF1Bna = \u677F\u539A + 1\u3002" },
  STYLE1_TOE_KICK_Y: { value: 70, doc: "style_1 \u8DBE\u8E22\uFF1AV \u677F\u5E95\u6BB5\u524D\u7F18 Y\uFF1BB1 \u524D\u8138 = 70 \u2212 CPT \u2212 FPT\u3002" },
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
  HINGE_CUP_DIAMETER: { value: 35, doc: "\u94F0\u94FE\u676F\u76F4\u5F84\u3002" },
  HINGE_CUP_DEPTH: { value: 12.5, doc: "\u94F0\u94FE\u676F\u6DF1\u3002" },
  HINGE_CUP_FROM_EDGE: { value: 22.5, doc: "\u676F\u5FC3\u8DDD\u95E8\u4FA7\u6CBF\u3002" },
  HINGE_SD_MIN: { value: 75, doc: "\u94F0\u94FE\u4FA7\u8DDD\u4E0B\u9650\u3002" },
  HINGE_SD_MAX: { value: 100, doc: "\u94F0\u94FE\u4FA7\u8DDD\u4E0A\u9650\u3002" },
  HINGE_SD_SPAN: { value: 300, doc: "\u4FA7\u8DDD\u516C\u5F0F\u53C2\u8003\u957F\uFF1Asd = clamp[75,100](75 + (\u957F\u8FB9\u2212300)\xB725/300)\u3002" },
  SD_GAIN_NUM: { value: 25, doc: "\u4FA7\u8DDD\u516C\u5F0F\u589E\u76CA\u5206\u5B50\u3002" },
  SD_GAIN_DEN: { value: 300, doc: "\u4FA7\u8DDD\u516C\u5F0F\u589E\u76CA\u5206\u6BCD\u3002" },
  FRONT_CLEARANCE: { value: 2.5, doc: "\u95E8\u7F1D fc\uFF08\u9690\u85CF\u53C2\u6570\u9ED8\u8BA4\uFF09\u3002" },
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
  SLOT_Z_CLEARANCE: { value: 0.5, doc: "\u69FD z = \u677F z \xB1 0.5\u3002" },
  TONGUE_FALLBACK_SLACK: { value: 0.5, doc: "\u69FD\u4FE1\u606F\u7F3A\u5931\u65F6\u820C\u957F = CPT/2 \u2212 0.5\u3002" },
  EDGE_BAND_THICKNESS_MM: { value: 1, doc: "Edge-tape thickness on each banded outline edge. Door colour on fronts and on a V front that meets the door face; carcass colour on the other visible edges." }
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
function buildKitchenFaces(fb) {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  for (const b of fb.boards) {
    b.role = b.category;
    const isFront = b.category === "front_panel" || b.boardType === "front_panel" || b.id === "B1";
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
    dim(`${key}.y0`, { y0: s.y0, boardY0: ref(`${s.vPanelId}.y0`) }, (t) => t.y0 - t.boardY0);
    dim(`${key}.z0`, { z0: s.z0, boardZ0: ref(`${s.vPanelId}.z0`) }, (t) => t.z0 - t.boardZ0);
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
      source: "kitchen"
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
      source: "kitchen"
    });
  }
  for (const n of fb.notches) {
    const p = B.get(n.panelId);
    if (!p || p.profilePlane !== "XY") continue;
    const r = localRect(p, { x: [n.x0, n.x1], y: [n.y0, n.y1] });
    addFeature(p, "A", { id: n.id, kind: "notch", ...r, for: "strip", source: "kitchen" });
  }
  const tape = RULES.EDGE_BAND_THICKNESS_MM.value;
  const carcass = CARCASS_COLOUR;
  const band = (b, normal, colour) => {
    for (const f of boundaryEdgeFaces(b, normal)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour });
  };
  for (const b of fb.boards) {
    if (b.boardType === "front_panel") {
      for (const f of edgeFaces(b)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: fb.doorColour });
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
  return resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(new Set(fb.boards.map((b) => b.id))));
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
          cross: (crossLo + crossHi) / 2
        });
      }
    }
  }
  return out;
}
function gapMarks(gaps, toX, toY, scale, mode = "clear") {
  const center = mode === "center";
  return gaps.map((g) => {
    if (g.clear * scale < 16) return "";
    const x = g.axis === "x" ? toX(g.at) : toX(g.cross);
    const y = g.axis === "z" ? toY(g.at) : toY(g.cross);
    return label(x, y, fmt(center ? g.center : g.clear), { size: 9, fill: center ? "#e0a34f" : "#8ec5ef" });
  }).join("");
}
function svgRoot(width, height, data, aria, body) {
  const d = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}" ${d} font-family="${PV.font}"><rect x="0" y="0" width="${width}" height="${height}" fill="${PV.bg}" />` + body + `</svg>`;
}

// generators/kitchen/svgPreview.ts
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
  const avoidances = result.debug?.avoidances ?? [];
  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selZone = options.selectedZoneId ?? null;
  const selCol = options.selectedCol ?? -1;
  const { scale, ox, oy, height } = fitCanvas(W, H, width, options.maxHeight ?? 520, { l: 44, r: 16, t: 14, b: showDimensions ? 40 : 14 });
  const toX = (x) => ox + x * scale;
  const toY = (z) => oy + (H - z) * scale;
  const rect = (x0, x1, z0, z1) => `x="${px(toX(x0))}" y="${px(toY(z1))}" width="${px(Math.max((x1 - x0) * scale, 0.8))}" height="${px(Math.max((z1 - z0) * scale, 0.8))}"`;
  const isSel = (ci, id) => id === selZone && (selCol < 0 || selCol === ci);
  const parts = [];
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
      parts.push(`<rect pointer-events="none" ${rect(col.x0, col.x1, z.z0, z.z1)} fill="${zoneColor(z.zoneType)}" fill-opacity="0.9" stroke="none" />`);
    }
  });
  for (const h of result.hinges) {
    parts.push(`<circle cx="${px(toX(h.centerX))}" cy="${px(toY(h.centerZ))}" r="${px(Math.max(h.diameter / 2 * scale, 1.5))}" fill="none" stroke="${PV.hinge}" stroke-width="1" pointer-events="none" />`);
  }
  for (const l of result.locks) {
    const w = Math.max(l.width * scale, 4);
    const h = Math.max(l.height * scale, 2.5);
    parts.push(`<rect x="${px(toX(l.centerX) - w / 2)}" y="${px(toY(l.centerZ) - h / 2)}" width="${px(w)}" height="${px(h)}" rx="${px(h / 2)}" fill="${PV.lock}" fill-opacity="0.55" stroke="none" pointer-events="none" />`);
  }
  columns.forEach((col, ci) => {
    const z = col.zones.find((zz) => isSel(ci, zz.id));
    if (z) parts.push(selectRect(rect(col.x0, col.x1, z.z0, z.z1)));
  });
  for (const col of columns) {
    const w = (col.x1 - col.x0) * scale;
    for (const z of col.zones) {
      const h = (z.z1 - z.z0) * scale;
      if (h < 14 || w < 36) continue;
      const cx = toX((col.x0 + col.x1) / 2);
      const cy = toY((z.z0 + z.z1) / 2);
      const name = KITCHEN_ZONE_LABELS[z.zoneType] ?? z.zoneType;
      const short = w < 90 ? name.replace("Door \xB7 hinge ", "Door ").replace("Double door", "Double") : name;
      if (h >= 32) {
        parts.push(label(cx, cy - 6, short, { size: 11, fill: z.zoneType === "unassigned" ? "#f08a8d" : PV.text }));
        parts.push(label(cx, cy + 8, fmt(z.z1 - z.z0), { size: 10, fill: PV.text2 }));
      } else {
        parts.push(label(cx, cy, `${short} \xB7 ${fmt(z.z1 - z.z0)}`, { size: 10 }));
      }
    }
  }
  if (BCH * scale >= 11) parts.push(label(toX(0) + 6, toY(BCH / 2), `kick ${fmt(BCH)}`, { size: 9, fill: PV.text2, anchor: "start" }));
  parts.push(`<rect ${rect(0, W, 0, H)} fill="none" stroke="${PV.envelope}" stroke-width="1.25" pointer-events="none" />`);
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
  if (showDimensions) {
    parts.push(spacedLabels([
      { y: toY(0), text: "0", fill: PV.text3 },
      { y: toY(BCH), text: fmt(BCH), fill: PV.text3 },
      { y: toY(H), text: fmt(H), fill: PV.text3 }
    ], ox - 6, "end"));
    const yb = toY(0) + 12;
    columns.forEach((col) => {
      const x0 = toX(col.x0);
      const x1 = toX(col.x1);
      parts.push(`<line x1="${px(x0)}" y1="${px(yb - 4)}" x2="${px(x0)}" y2="${px(yb + 4)}" stroke="${PV.text3}" pointer-events="none" />`);
      parts.push(`<line x1="${px(x1)}" y1="${px(yb - 4)}" x2="${px(x1)}" y2="${px(yb + 4)}" stroke="${PV.text3}" pointer-events="none" />`);
      if (x1 - x0 >= 24) parts.push(dimText((x0 + x1) / 2, yb, fmt(col.x1 - col.x0), "middle", columns.length > 1 ? PV.boundary : PV.text2));
    });
    parts.push(dimText(toX(W / 2), yb + 15, `W ${fmt(W)} \xB7 H ${fmt(H)} \xB7 ${columns.length} column${columns.length === 1 ? "" : "s"}`, "middle", PV.text3));
  }
  parts.push(gapMarks(boardGaps(result.boards), toX, toY, scale, options.gaps ?? "clear"));
  return svgRoot(width, height, { scale, ox, oy, w: W, h: H }, "Kitchen base front elevation", parts.join(""));
}

// generators/kitchen/generator.ts
var asNum = (v, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
var r2 = (v) => Math.round(v * 1e3) / 1e3;
var EPS2 = 1e-3;
var DEFAULT_SIDE = {
  panelType: "carcass",
  frontVisible: false,
  bchNotchEnabled: true,
  grooveVisible: true,
  extendT2T3B4ToOuterFace: true,
  strengtheningStripEnabled: false
};
var PANEL_ZONE_TYPES = /* @__PURE__ */ new Set(["left_door", "right_door", "double_door", "drawer", "down_flap"]);
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
  const W = asNum(gs.length, 0);
  const D2 = asNum(gs.depth, 0);
  const H = asNum(gs.height, 0);
  const CPT = asNum(input.materialThickness, 15);
  const FPT = asNum(input.frontThickness, 16);
  const fc = asNum(input.frontClearance, RULES.FRONT_CLEARANCE.value);
  const BCH = asNum(input.bottomClearanceHeight, 70);
  const style2 = input.bottomClearanceStyle === "style_2";
  const columns = [];
  let x = 0;
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
        lockSideCenterOffset: asNum(zone.lockSideCenterOffset, RULES.LOCK_SIDE_OFFSET.value),
        leftSidePanelOptions: zone.leftSidePanelOptions,
        rightSidePanelOptions: zone.rightSidePanelOptions
      });
      z = r2(z - zh);
    }
    columns.push({ id: c.id, x0: r2(x), x1: r2(x + width), width, zones });
    x += width;
  }
  const s = {
    W,
    D: D2,
    H,
    CPT,
    FPT,
    fc,
    lockOn: input.lockEnabled !== false,
    BCH,
    style2,
    columns,
    xBoundaries: [0, ...columns.map((c) => c.x1)],
    leftOpts: DEFAULT_SIDE,
    rightOpts: DEFAULT_SIDE,
    cd: r2(D2 - FPT),
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
    }
  }
  for (const a of s.avoidances) {
    if (a.height < s.BCH) warnings.push(`Wheel avoidance ${a.id} height is below BCH; V panels conflict with the bottom system.`);
    if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) warnings.push(`Wheel avoidance ${a.id} bounds invalid; skipped.`);
  }
}
function rectXZ(w, h) {
  return [{ x: 0, z: 0 }, { x: w, z: 0 }, { x: w, z: h }, { x: 0, z: h }, { x: 0, z: 0 }];
}
function rectYZ(w, h) {
  return [{ y: 0, z: 0 }, { y: w, z: 0 }, { y: w, z: h }, { y: 0, z: h }, { y: 0, z: 0 }];
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
function edgeNotchRect(x0, x1, v0, h, notches, d, edge, mk) {
  const N = notches.map(([a, b]) => [Math.max(a, x0), Math.min(b, x1)]).filter(([a, b]) => b - a > EPS2).sort((p, q) => p[0] - q[0]);
  const yN = v0, yF = v0 + h;
  if (edge === "far") {
    const pts2 = [mk(x0, yN), mk(x1, yN)];
    let zr = yF;
    if (N.length && N[N.length - 1][1] >= x1 - EPS2) zr = yF - d;
    pts2.push(mk(x1, zr));
    let cur2 = x1;
    for (let i = N.length - 1; i >= 0; i--) {
      const [a, b] = N[i];
      if (b >= x1 - EPS2) {
        pts2.push(mk(a, yF - d), mk(a, yF));
      } else if (a <= x0 + EPS2) {
        pts2.push(mk(b, yF), mk(b, yF - d), mk(x0, yF - d));
        cur2 = x0;
        break;
      } else {
        pts2.push(mk(b, yF), mk(b, yF - d), mk(a, yF - d), mk(a, yF));
      }
      cur2 = a;
    }
    if (cur2 > x0 + EPS2) pts2.push(mk(x0, yF));
    pts2.push(mk(x0, yN));
    return pts2;
  }
  const pts = [];
  const startLift = N.length && N[0][0] <= x0 + EPS2;
  pts.push(mk(x0, startLift ? yN + d : yN));
  let cur = x0;
  for (const [a, b] of N) {
    if (a <= x0 + EPS2) {
      pts.push(mk(b, yN + d), mk(b, yN));
    } else if (b >= x1 - EPS2) {
      pts.push(mk(a, yN), mk(a, yN + d), mk(x1, yN + d));
      cur = x1;
      break;
    } else {
      pts.push(mk(a, yN), mk(a, yN + d), mk(b, yN + d), mk(b, yN));
    }
    cur = b;
  }
  if (cur < x1 - EPS2) pts.push(mk(x1, yN));
  pts.push(mk(x1, yF), mk(x0, yF));
  pts.push(pts[0]);
  return pts;
}
var xyNotch = (x0, x1, y0, h, notches, d, edge) => edgeNotchRect(x0, x1, y0, h, notches, d, edge, (u, v) => ({ x: r2(u), y: r2(v) }));
var xzNotch = (x0, x1, z0, h, notches, d, edge) => edgeNotchRect(x0, x1, z0, h, notches, d, edge, (u, v) => ({ x: r2(u), z: r2(v) }));
function buildVPanels(s) {
  const vs = [];
  const n = s.columns.length;
  vs.push({
    index: 0,
    id: "V0",
    x0: 0,
    x1: r2(s.leftOpts.panelType === "door" ? s.FPT : s.CPT),
    thickness: s.leftOpts.panelType === "door" ? s.FPT : s.CPT,
    kind: s.leftOpts.panelType === "door" ? "door" : "carcass",
    leftNeighborCol: -1,
    rightNeighborCol: 0,
    frontVisible: s.leftOpts.frontVisible,
    grooveVisible: s.leftOpts.grooveVisible,
    bchNotch: s.leftOpts.bchNotchEnabled
  });
  for (let i = 1; i < n; i++) {
    const xb = s.xBoundaries[i];
    vs.push({
      index: i,
      id: `V${i}`,
      x0: r2(xb - s.CPT / 2),
      x1: r2(xb + s.CPT / 2),
      thickness: s.CPT,
      kind: "carcass",
      leftNeighborCol: i - 1,
      rightNeighborCol: i,
      frontVisible: false,
      grooveVisible: true,
      bchNotch: true
    });
  }
  vs.push({
    index: n,
    id: `V${n}`,
    x0: r2(s.W - (s.rightOpts.panelType === "door" ? s.FPT : s.CPT)),
    x1: s.W,
    thickness: s.rightOpts.panelType === "door" ? s.FPT : s.CPT,
    kind: s.rightOpts.panelType === "door" ? "door" : "carcass",
    leftNeighborCol: n - 1,
    rightNeighborCol: -1,
    frontVisible: s.rightOpts.frontVisible,
    grooveVisible: s.rightOpts.grooveVisible,
    bchNotch: s.rightOpts.bchNotchEnabled
  });
  return vs;
}
function vPanelOutline(s, v, avoidance, omitFrontTopReceiver = false) {
  const t = v.thickness;
  const na = t + RULES.NOTCH_ALLOWANCE_EXTRA.value;
  const cd = s.cd, H = s.H, BCH = s.BCH;
  const r = RULES.RECEIVER_NOTCH_DEPTH.value;
  const bsY = RULES.BOTTOM_SLOT_REAR_Y.value;
  const toeY = RULES.STYLE1_TOE_KICK_Y.value;
  if (v.frontVisible) {
    const frontY2 = -s.FPT;
    if (avoidance) {
      const ad = avoidance.depth, ah = avoidance.height;
      return [
        { y: frontY2, z: 0 },
        { y: frontY2, z: H },
        { y: cd - na - r, z: H },
        { y: cd - na - r, z: H - na },
        { y: cd - na, z: H - na },
        { y: cd - na, z: ah + r },
        { y: cd, z: ah + r },
        { y: cd, z: ah },
        { y: cd - ad, z: ah },
        { y: cd - ad, z: 0 },
        { y: frontY2, z: 0 }
      ];
    }
    if (!v.bchNotch) {
      return [
        { y: frontY2, z: 0 },
        { y: frontY2, z: H },
        { y: cd - na - r, z: H },
        { y: cd - na - r, z: H - na },
        { y: cd - na, z: H - na },
        { y: cd - na, z: H - r },
        { y: cd, z: H - r },
        { y: cd, z: r },
        { y: cd - na, z: r },
        { y: cd - na, z: 0 },
        { y: frontY2, z: 0 }
      ];
    }
    const zExt = BCH + t + na;
    return [
      { y: frontY2, z: zExt },
      { y: frontY2, z: H },
      { y: r, z: H },
      { y: r, z: H - na },
      { y: 0, z: H - na },
      { y: 0, z: BCH + na },
      { y: bsY, z: BCH + na },
      { y: bsY, z: BCH },
      { y: toeY, z: BCH },
      { y: toeY, z: 0 },
      { y: cd, z: 0 },
      { y: cd, z: r },
      { y: cd - na, z: r },
      { y: cd - na, z: 0 },
      { y: frontY2, z: 0 }
    ];
  }
  const frontY = s.style2 ? s.CPT : toeY;
  const base = [
    { y: frontY, z: 0 },
    { y: frontY, z: BCH },
    { y: bsY, z: BCH },
    { y: bsY, z: BCH + na },
    { y: 0, z: BCH + na },
    { y: 0, z: H - na },
    ...omitFrontTopReceiver ? [{ y: 0, z: H }] : [{ y: r, z: H - na }, { y: r, z: H }],
    { y: cd - na - r, z: H },
    { y: cd - na - r, z: H - na },
    { y: cd - na, z: H - na },
    { y: cd - na, z: H - r },
    { y: cd, z: H - r },
    { y: cd, z: r },
    { y: cd - na, z: r },
    { y: cd - na, z: 0 },
    { y: frontY, z: 0 }
  ];
  if (avoidance) {
    const ad = avoidance.depth, ah = avoidance.height;
    return [
      ...base.slice(0, 8),
      { y: cd - na - r, z: H },
      { y: cd - na - r, z: H - na },
      { y: cd - na, z: H - na },
      { y: cd - na, z: H - r },
      { y: cd, z: H - r },
      { y: cd, z: ah + r },
      { y: cd - na, z: ah + r },
      { y: cd - na, z: ah },
      { y: cd - ad, z: ah },
      { y: cd - ad, z: 0 },
      { y: frontY, z: 0 }
    ];
  }
  return base;
}
function avoidanceForV(s, v) {
  const a = s.avoidances.find((a2) => a2.x0 < v.x1 && a2.x1 > v.x0 && a2.height > 0 && a2.depth > 0 && a2.x1 > a2.x0);
  return a && a.height < s.H ? { height: a.height, depth: a.depth } : void 0;
}
function neighborVisible(s, v, face, z0, z1) {
  const colIdx = face === "left" ? v.leftNeighborCol : v.rightNeighborCol;
  if (colIdx < 0) return false;
  const col = s.columns[colIdx];
  if (!col) return false;
  const hit = col.zones.find((z) => z.z1 > z0 && z.z0 < z1);
  if (!hit) return false;
  return PANEL_ZONE_TYPES.has(hit.zoneType) || hit.zoneType === "open" || hit.zoneType === "custom";
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
function resolveSlots(s, requests, vPanels, errors) {
  const slots = [];
  const tongueOf = /* @__PURE__ */ new Map();
  const byV = /* @__PURE__ */ new Map();
  for (const q of requests) {
    const e = byV.get(q.vIndex) ?? {};
    e[q.side] = q;
    byV.set(q.vIndex, e);
  }
  for (const [vi, pair] of byV) {
    const v = vPanels[vi];
    const wantLeft = pair.left ? neighborVisible(s, v, "right", pair.left.z0, pair.left.z1) || !v.grooveVisible : false;
    const wantRight = pair.right ? neighborVisible(s, v, "left", pair.right.z0, pair.right.z1) || !v.grooveVisible : false;
    let resolveLeft = null;
    let resolveRight = null;
    if (wantLeft && wantRight) {
      const mode = s.prefs.get(vi);
      if (!mode) {
        errors.push(`Unresolved double-sided half-slot conflict on V${vi}.`);
        resolveLeft = "half";
        resolveRight = "half";
      } else {
        [resolveLeft, resolveRight] = MACHINING_TABLE[mode];
      }
    } else {
      resolveLeft = pair.left ? wantLeft ? "half" : "through" : null;
      resolveRight = pair.right ? wantRight ? "half" : "through" : null;
    }
    const emit = (side, kind, q) => {
      const boardSide = side === "right" ? "left" : "right";
      const t = tongueOf.get(q.boardId) ?? { left: 0, right: 0 };
      if (kind === "none") {
        t[boardSide] = 0;
        tongueOf.set(q.boardId, t);
        return;
      }
      const tongue = kind === "through" ? s.CPT : v.thickness / 2;
      const clr = q.isDrawer ? RULES.DRAWER_SLOT_CLEARANCE.value : RULES.SHELF_SLOT_CLEARANCE.value;
      slots.push({
        id: `${q.boardId}-V${vi}-${side}`,
        vPanelId: `V${vi}`,
        side,
        through: kind === "through",
        depth: kind === "through" ? v.thickness : v.thickness / 2,
        y0: r2(q.tongueY0 - clr),
        y1: r2(q.tongueY1 + clr),
        z0: r2(q.z0 - RULES.SLOT_Z_CLEARANCE.value),
        z1: r2(q.z1 + RULES.SLOT_Z_CLEARANCE.value),
        forBoard: q.boardId
      });
      t[boardSide] = tongue;
      tongueOf.set(q.boardId, t);
    };
    if (pair.left && resolveLeft) emit("left", resolveLeft, pair.left);
    if (pair.right && resolveRight) emit("right", resolveRight, pair.right);
  }
  return { slots, tongueOf };
}
function generateKitchenCabinet(input) {
  beginProvenance();
  const s = normalize(input);
  const P = param({ W: s.W, D: s.D, H: s.H, CPT: s.CPT, FPT: s.FPT, BCH: s.BCH, fc: s.fc, cd: s.cd });
  dim("kitchen.carcassDepth", { D: P.D, FPT: P.FPT }, (t) => t.D - t.FPT);
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
  const lastCol = s.columns.length - 1;
  const stoveAtLeftEdge = s.columns[0]?.zones.some((z) => z.zoneType === "stove") === true;
  const stoveAtRightEdge = lastCol >= 0 && s.columns[lastCol].zones.some((z) => z.zoneType === "stove");
  for (const v of vPanels) {
    const av = avoidanceForV(s, v);
    const omitT1 = v.index === 0 && stoveAtLeftEdge || v.index === vPanels.length - 1 && stoveAtRightEdge;
    const outline = vPanelOutline(s, v, av, omitT1 && !v.frontVisible);
    const label2 = v.index === 0 ? "Left End Panel" : v.index === vPanels.length - 1 ? "Right End Panel" : `Vertical Panel ${v.index}`;
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
  const vNotchRanges = vPanels.map((v) => {
    const c = (v.x0 + v.x1) / 2;
    return [r2(c - (CPT + RULES.NOTCH_ALLOWANCE_EXTRA.value) / 2), r2(c + (CPT + RULES.NOTCH_ALLOWANCE_EXTRA.value) / 2)];
  });
  if (s.style2) {
    boards.push(mkBoard(
      "B1",
      "Bottom Front Panel",
      "bottom",
      "bottom_front",
      FPT,
      "door",
      "XZ",
      "Y",
      frontStop.x0,
      frontStop.x1,
      -FPT,
      0,
      0,
      BCH,
      rectXZ(frontStop.x1 - frontStop.x0, BCH)
    ));
    boards.push(mkBoard(
      "B2",
      "Bottom Carcass Panel",
      "bottom",
      "bottom_carcass",
      CPT,
      "carcass",
      "XZ",
      "Y",
      frontStop.x0,
      frontStop.x1,
      0,
      CPT,
      0,
      BCH,
      rectXZ(frontStop.x1 - frontStop.x0, BCH)
    ));
  } else {
    const toeY1 = RULES.STYLE1_TOE_KICK_Y.value - CPT;
    const toeY0 = toeY1 - FPT;
    boards.push(mkBoard(
      "B1",
      "Bottom Front Panel",
      "bottom",
      "bottom_front",
      FPT,
      "door",
      "XZ",
      "Y",
      frontStop.x0,
      frontStop.x1,
      toeY0,
      toeY1,
      0,
      BCH,
      rectXZ(frontStop.x1 - frontStop.x0, BCH)
    ));
    boards.push(mkBoard(
      "B2",
      "Bottom Carcass Panel",
      "bottom",
      "bottom_carcass",
      CPT,
      "carcass",
      "XZ",
      "Y",
      frontStop.x0,
      frontStop.x1,
      toeY1,
      RULES.STYLE1_TOE_KICK_Y.value,
      0,
      BCH,
      rectXZ(frontStop.x1 - frontStop.x0, BCH)
    ));
  }
  {
    boards.push(mkBoard(
      "B3",
      "Bottom Deck",
      "bottom",
      "bottom_deck",
      CPT,
      "carcass",
      "XY",
      "Z",
      frontStop.x0,
      frontStop.x1,
      0,
      stripW,
      BCH,
      r2(BCH + CPT),
      xyNotch(frontStop.x0, frontStop.x1, 0, stripW, vNotchRanges, notchD, "far")
    ));
  }
  const requests = [];
  const funcBoards = [];
  const addFuncBoard = (id, name, boardType, ci, z0, z1, isDrawer) => {
    const vL = vPanels[ci], vR = vPanels[ci + 1];
    const clearX0 = vL.x1, clearX1 = vR.x0;
    const intoRear = !isDrawer && (z0 < stripW || z1 > r2(H - stripW));
    const depth = isDrawer ? RULES.B3_DEPTH.value : intoRear ? r2(cd - CPT) : cd;
    const ty0 = isDrawer ? RULES.DRAWER_TONGUE_Y0.value : r2(cd / 3);
    const ty1 = isDrawer ? RULES.B3_DEPTH.value : r2(2 * cd / 3);
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
      0,
      depth,
      z0,
      z1,
      [{ x: clearX0, y: 0 }, { x: clearX1, y: 0 }, { x: clearX1, y: depth }, { x: clearX0, y: depth }, { x: clearX0, y: 0 }]
    );
    boards.push(board);
    funcBoards.push({ board, isDrawer, clearX0, clearX1, z0, z1 });
    requests.push({ vIndex: vL.index, side: "right", boardId: id, tongueY0: ty0, tongueY1: ty1, z0, z1, isDrawer });
    requests.push({ vIndex: vR.index, side: "left", boardId: id, tongueY0: ty0, tongueY1: ty1, z0, z1, isDrawer });
  };
  s.columns.forEach((col, ci) => {
    for (const zone of col.zones) {
      if (zone.z0 <= BCH + EPS2) continue;
      const isDrawer = DRAWER_BOTTOM_TYPES.has(zone.zoneType);
      const isShelf = FULL_SHELF_TYPES.has(zone.zoneType);
      if (!isDrawer && !isShelf) continue;
      const z = r2(zone.z0 - CPT / 2), zc = r2(zone.z0 + CPT / 2);
      addFuncBoard(
        `${col.id}-${zone.id}-bottom`,
        isDrawer ? "Drawer Divider" : "Full Depth Shelf",
        isDrawer ? "drawer_divider" : "full_depth_shelf",
        ci,
        z,
        zc,
        isDrawer
      );
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
        addFuncBoard(
          `${zone.id}-door-shelf`,
          "Door Shelf",
          "door_shelf",
          ci,
          r2(centerZ - CPT / 2),
          r2(centerZ + CPT / 2),
          false
        );
      }
    }
  });
  s.columns.forEach((col, ci) => {
    const zone = col.zones[col.zones.length - 1];
    if (!zone || zone.z0 > BCH + EPS2) return;
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
    addFuncBoard(
      `${zone.id}-door-shelf`,
      "Door Shelf",
      "door_shelf",
      ci,
      r2(centerZ - CPT / 2),
      r2(centerZ + CPT / 2),
      false
    );
  });
  const { slots, tongueOf } = resolveSlots(s, requests, vPanels, errors);
  for (const fb of funcBoards) {
    const t = tongueOf.get(fb.board.id) ?? { left: 0, right: 0 };
    const { clearX0: c0, clearX1: c1 } = fb;
    const x0 = r2(c0 - t.left), x1 = r2(c1 + t.right);
    const by1 = fb.isDrawer ? RULES.B3_DEPTH.value : cd;
    const ty0 = fb.isDrawer ? RULES.DRAWER_TONGUE_Y0.value : r2(cd / 3);
    const ty1 = fb.isDrawer ? RULES.B3_DEPTH.value : r2(2 * cd / 3);
    let prof;
    if (fb.isDrawer) {
      prof = [
        { x: c0, y: 0 },
        { x: c1, y: 0 },
        { x: c1, y: ty0 },
        { x: x1, y: ty0 },
        { x: x1, y: ty1 },
        { x: x0, y: ty1 },
        { x: x0, y: ty0 },
        { x: c0, y: ty0 },
        { x: c0, y: 0 }
      ];
    } else if (t.left > 0 && t.right > 0) {
      prof = [
        { x: c0, y: 0 },
        { x: c1, y: 0 },
        { x: c1, y: ty0 },
        { x: x1, y: ty0 },
        { x: x1, y: ty1 },
        { x: c1, y: ty1 },
        { x: c1, y: by1 },
        { x: c0, y: by1 },
        { x: c0, y: ty1 },
        { x: x0, y: ty1 },
        { x: x0, y: ty0 },
        { x: c0, y: ty0 },
        { x: c0, y: 0 }
      ];
    } else if (t.right > 0) {
      prof = [
        { x: c0, y: 0 },
        { x: c1, y: 0 },
        { x: c1, y: ty0 },
        { x: x1, y: ty0 },
        { x: x1, y: ty1 },
        { x: c1, y: ty1 },
        { x: c1, y: by1 },
        { x: c0, y: by1 },
        { x: c0, y: 0 }
      ];
    } else if (t.left > 0) {
      prof = [
        { x: c0, y: 0 },
        { x: c1, y: 0 },
        { x: c1, y: by1 },
        { x: c0, y: by1 },
        { x: c0, y: ty1 },
        { x: x0, y: ty1 },
        { x: x0, y: ty0 },
        { x: c0, y: ty0 },
        { x: c0, y: 0 }
      ];
    } else {
      prof = [{ x: c0, y: 0 }, { x: c1, y: 0 }, { x: c1, y: by1 }, { x: c0, y: by1 }, { x: c0, y: 0 }];
    }
    fb.board.x0 = x0;
    fb.board.x1 = x1;
    fb.board.profileVector = prof.map((p) => ({ ...p }));
  }
  const zTop0 = H - CPT;
  const rN = RULES.RECEIVER_NOTCH_DEPTH.value;
  const stoveCuts = s.columns.map((c, i) => {
    if (!c.zones.some((z) => z.zoneType === "stove")) return null;
    const leftV = vPanels[i], rightV = vPanels[i + 1];
    return {
      x0: leftV?.x1 ?? c.x0,
      x1: rightV?.x0 ?? c.x1,
      y0: 0,
      y1: FPT + RULES.STOVE_CUT_FRONT_EXTRA.value
    };
  }).filter((x) => x != null);
  const segmentBy = (x0, x1, cuts) => {
    const pts = [...cuts].sort((a, b) => a[0] - b[0]);
    const segs = [];
    let cur = x0;
    for (const [c0, c1] of pts) {
      if (c1 <= x0 || c0 >= x1) continue;
      const a = Math.max(c0, x0), b = Math.min(c1, x1);
      if (a > cur) segs.push([cur, a]);
      cur = Math.max(cur, b);
    }
    if (cur < x1) segs.push([cur, x1]);
    return segs.filter(([a, b]) => b - a >= RULES.MIN_STRIP_SEGMENT_LENGTH.value);
  };
  const notchIn = (n, x0, x1) => {
    const a = Math.max(n[0], x0), b = Math.min(n[1], x1);
    return b - a > EPS2 ? [a, b] : null;
  };
  const stoveXCutsForY = (y0, y1) => stoveCuts.filter((c) => !(y1 <= c.y0 || y0 >= c.y1)).map((c) => [c.x0, c.x1]);
  {
    const segs = segmentBy(frontStop.x0, frontStop.x1, stoveXCutsForY(0, stripW));
    segs.forEach(([a, b], i) => {
      const ns = vNotchRanges.map((n) => notchIn(n, a, b)).filter(Boolean);
      boards.push(mkBoard(
        `T1-${i + 1}`,
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
        xyNotch(a, b, 0, stripW, ns, notchD, "far")
      ));
    });
  }
  {
    const y1 = r2(cd - CPT);
    const y0 = r2(y1 - stripW);
    const segs = segmentBy(rearStop.x0, rearStop.x1, stoveXCutsForY(y0, y1));
    segs.forEach(([a, b], i) => {
      const ns = vNotchRanges.map((n) => notchIn(n, a, b)).filter(Boolean);
      boards.push(mkBoard(
        `T2-${i + 1}`,
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
        xyNotch(a, b, y0, stripW, ns, notchD, "near")
      ));
    });
  }
  {
    const y0 = r2(cd - CPT), z0 = r2(H - stripW);
    const segs = segmentBy(rearStop.x0, rearStop.x1, stoveXCutsForY(y0, cd));
    segs.forEach(([a, b], i) => {
      const ns = vNotchRanges.map((n) => notchIn(n, a, b)).filter(Boolean);
      boards.push(mkBoard(
        `T3-${i + 1}`,
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
        xzNotch(a, b, z0, stripW, ns, notchD, "near")
      ));
    });
  }
  {
    const y0 = r2(cd - CPT);
    const avCuts = s.avoidances.filter((a) => a.x1 > a.x0 && a.height > 0).map((a) => [a.x0, a.x1]);
    const segs = segmentBy(rearStop.x0, rearStop.x1, avCuts);
    segs.forEach(([a, b], i) => {
      const ns = vNotchRanges.map((n) => notchIn(n, a, b)).filter(Boolean);
      boards.push(mkBoard(
        `B4-${i + 1}`,
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
        xzNotch(a, b, 0, stripW, ns, notchD, "far")
      ));
    });
  }
  for (const a of s.avoidances) {
    if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) continue;
    const ad = a.depth, ah = a.height;
    boards.push(mkBoard(
      `${a.id}-avoidance-top`,
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
      xyNotch(a.x0, a.x1, r2(cd - ad), ad, [], notchD, "far")
    ));
    if (ah + RULES.RAISED_B4_HEIGHT.value <= H) {
      boards.push(mkBoard(
        `${a.id}-B4`,
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
        rectXZ(r2(a.x1 - a.x0), RULES.RAISED_B4_HEIGHT.value)
      ));
    } else {
      warnings.push(`Wheel avoidance ${a.id}: raised B4 exceeds height; skipped.`);
    }
    if (ah > CPT) {
      boards.push(mkBoard(
        `${a.id}-avoidance-front`,
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
        rectXZ(r2(a.x1 - a.x0), r2(ah - CPT))
      ));
    } else {
      warnings.push(`Wheel avoidance ${a.id}: front cover height \u2264 CPT; skipped.`);
    }
  }
  for (const fb of funcBoards) {
    for (const a of s.avoidances) {
      if (!(a.x1 > a.x0) || !(a.height > 0) || !(a.depth > 0)) continue;
      if (!(fb.board.x0 < a.x1 && fb.board.x1 > a.x0)) continue;
      const ad = a.depth, ah = a.height;
      let y1 = fb.board.y1;
      if (fb.z0 < ah) y1 = Math.max(fb.board.y0, r2(cd - ad - CPT));
      else if (fb.z0 < ah + RULES.RAISED_B4_HEIGHT.value) y1 = Math.min(y1, r2(cd - CPT));
      if (y1 < fb.board.y1) {
        fb.board.y1 = y1;
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
  for (const st of strips) {
    const id = `${st.side}-side-strengthening-strip-${st.zoneId}`;
    const covered = funcBoards.filter((fb) => fb.board.id.endsWith("-door-shelf") && fb.z0 >= st.z0 - EPS2 && fb.z1 <= st.z1 + EPS2);
    let prof;
    if (covered.length) {
      const sz0 = r2(Math.min(...covered.map((f) => f.z0)) - RULES.STRENGTHENING_GROOVE_CLEARANCE.value);
      const sz1 = r2(Math.max(...covered.map((f) => f.z1)) + RULES.STRENGTHENING_GROOVE_CLEARANCE.value);
      prof = [
        { y: 0, z: st.z0 },
        { y: stripW, z: st.z0 },
        { y: stripW, z: sz0 },
        { y: RULES.STRENGTHENING_GROOVE_Y0.value, z: sz0 },
        { y: RULES.STRENGTHENING_GROOVE_Y0.value, z: sz1 },
        { y: stripW, z: sz1 },
        { y: stripW, z: st.z1 },
        { y: 0, z: st.z1 },
        { y: 0, z: st.z0 }
      ];
    } else {
      prof = rectYZ(stripW, r2(st.z1 - st.z0));
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
  const colHasPanel = (ci) => s.columns[ci].zones.some((z) => PANEL_ZONE_TYPES.has(z.zoneType));
  const emitDoorPanel = (id, zone, x0, x1, z0, z1, kind, leaf) => {
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
      rectXZ(w, h)
    ));
    const hs = zone.hingeSettings;
    if (kind !== "drawer") {
      const L = kind === "down_flap" ? w : h;
      let sd = RULES.HINGE_SD_MIN.value + (L - RULES.HINGE_SD_SPAN.value) * RULES.SD_GAIN_NUM.value / RULES.SD_GAIN_DEN.value;
      sd = Math.min(RULES.HINGE_SD_MAX.value, Math.max(RULES.HINGE_SD_MIN.value, sd));
      const fromEdge = hs.cupCenterFromEdge;
      let centers;
      if (kind === "down_flap") {
        centers = [{ x: r2(x0 + sd), z: r2(z0 + fromEdge) }, { x: r2(x1 - sd), z: r2(z0 + fromEdge) }];
      } else {
        const hingeLeft = kind === "left_door" || kind === "double_door" && leaf === "left";
        const cx = hingeLeft ? r2(x0 + fromEdge) : r2(x1 - fromEdge);
        centers = [{ x: cx, z: r2(z1 - sd) }, { x: cx, z: r2(z0 + sd) }];
        if (hs.useThreeHinges) centers.push({ x: cx, z: r2((z0 + z1) / 2) });
      }
      centers.forEach((c, i) => {
        hinges.push({ id: `${id}-hinge-${i + 1}`, panelId: id, centerX: c.x, centerZ: c.z, diameter: hs.cupDiameter, depth: hs.cupDepth });
      });
    }
    if (s.lockOn && zone.lockEnabled) {
      let cx;
      if (kind === "left_door") cx = r2(x1 - zone.lockSideCenterOffset);
      else if (kind === "right_door") cx = r2(x0 + zone.lockSideCenterOffset);
      else cx = r2((x0 + x1) / 2);
      const dividerCenter = zone.z1 >= H - EPS2 ? r2(H - CPT / 2) : zone.z1;
      const cz = r2(dividerCenter - CPT / 2 - RULES.LOCK_DROP.value);
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
      const x0 = ci === 0 ? s.leftOpts.frontVisible ? r2(leftInner + fc) : fc : colHasPanel(ci - 1) ? r2(col.x0 + fc / 2) : r2(col.x0 + CPT / 2);
      const x1 = ci === s.columns.length - 1 ? s.rightOpts.frontVisible ? r2(rightInner - fc) : r2(s.W - fc) : colHasPanel(ci + 1) ? r2(col.x1 - fc / 2) : r2(col.x1 + CPT / 2);
      const zoneAbove = col.zones.find((z) => Math.abs(z.z0 - zone.z1) < EPS2);
      let z1;
      if (zone.z1 >= H - EPS2) z1 = r2(H - fc);
      else if (zoneAbove && PANEL_ZONE_TYPES.has(zoneAbove.zoneType)) z1 = r2(zone.z1 - fc / 2);
      else z1 = r2(zone.z1 + CPT / 2);
      const zoneBelow = col.zones.find((z) => Math.abs(z.z1 - zone.z0) < EPS2);
      let z0;
      if (zone.z0 <= BCH + EPS2) z0 = s.style2 ? r2(BCH + fc) : BCH;
      else if (zoneBelow && PANEL_ZONE_TYPES.has(zoneBelow.zoneType)) z0 = r2(zone.z0 + fc / 2);
      else z0 = r2(zone.z0 - CPT / 2);
      const id = `${zone.id}-front-panel`;
      if (zone.zoneType === "double_door") {
        const mid = r2((x0 + x1) / 2);
        emitDoorPanel(`${id}-left`, zone, x0, r2(mid - fc / 2), z0, z1, "double_door", "left");
        emitDoorPanel(`${id}-right`, zone, r2(mid + fc / 2), x1, z0, z1, "double_door", "right");
      } else {
        emitDoorPanel(id, zone, x0, x1, z0, z1, zone.zoneType);
      }
    }
  });
  for (const b of boards) refreshBoardBox(b);
  attachFaces(boards);
  const joints = buildKitchenFaces({ boards, slots, hinges, locks, notches, doorColour: doorColourOf(input) });
  const result = {
    params: {
      length: s.W,
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
    slots,
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
    avoidances: s.avoidances
  };
  return result;
}
export {
  generateKitchenCabinet,
  generateKitchenSvgPreview
};
