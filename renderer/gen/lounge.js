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
function defaultFace(A, B, colour) {
  if (colour) return colour.id === "A" ? "B" : "A";
  const inward = (f) => f.semantic === "inside" || f.semantic === "back" || f.semantic === "wall";
  if (inward(B) && !inward(A)) return "B";
  if (inward(A) && !inward(B)) return "A";
  if (A.visible === true && B.visible !== true) return "B";
  if (B.visible === true && A.visible !== true) return "A";
  if (B.features.some(through) && !A.features.some(through)) return "B";
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
      face = defaultFace(A, B, colour);
      issues.push({ board: b.id, reason: "both-faces", message: `${b.id} has partial-depth machining on both faces: the CNC cuts from one side only` });
    } else if (onA || onB) {
      face = onA ? "A" : "B";
      if (colour && colour.id === face) {
        issues.push({ board: b.id, reason: "colour-face", message: `${b.id} is single-sided and has partial-depth machining on its colour face (${face})` });
      }
    } else {
      face = defaultFace(A, B, colour);
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

// generators/lounge/relationshipDeclarations.ts
var P = (declarationId, a, b) => ({
  declarationId,
  generator: "lounge",
  panelAId: a,
  panelBId: b,
  hostPanelId: a,
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
  P("lg_right_strip_to_top", "right_support_strip", "right_top")
];
function relationshipDeclarationsForBoards(ids) {
  return LOUNGE_RELATIONSHIP_DECLARATIONS.filter((d) => ids.has(d.panelAId) && ids.has(d.panelBId));
}

// generators/lounge/faces.ts
function buildLoungeFaces(fb) {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  for (const b of fb.boards) {
    b.role = b.category;
    if (b.boardType === "front" || b.category === "front_panel") {
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
    const top = B.get(topId);
    if (!top) continue;
    const r = localRect(top, { x: [op.x0, op.x0 + op.width], y: [op.y0, op.y0 + op.depth] });
    const lidId = `${topId.replace(/_top$/, "")}_lid`;
    addFeature(top, "A", {
      id: op.id,
      kind: "cutout",
      ...r,
      through: true,
      ...B.has(lidId) ? { for: lidId } : {},
      source: "lounge"
    });
  }
  for (const lid of fb.lids) {
    const board = B.get(lid.id);
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
      source: "lounge"
    });
  }
  for (const lock of fb.locks ?? []) {
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
      source: "lounge"
    });
  }
  for (const g of fb.grooves ?? []) {
    const board = B.get(g.boardId);
    if (!board) continue;
    addFeature(board, g.face, {
      id: g.id,
      kind: "groove",
      u0: g.u0,
      u1: g.u1,
      v0: g.v0,
      v1: g.v1,
      depth: g.depth,
      for: "middle_cabinet_mid_divider",
      source: "lounge"
    });
  }
  return resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(new Set(fb.boards.map((b) => b.id))));
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
  MIDDLE_CABINET_DOOR_THICKNESS: { value: 15, doc: "\u4E2D\u67DC\u95E8/\u67DC\u8EAB\u539A\u7F3A\u7701\u3002" },
  MIDDLE_CABINET_DOOR_CLEARANCE: { value: 2, doc: "\u4E2D\u67DC\u95E8\u7F1D\u3002" },
  MIDDLE_CABINET_LOCK_SIDE: { value: 30, doc: "\u4E2D\u67DC\u9501\u5FC3\u8DDD\u95E8\u4FA7\u3002" },
  MIDDLE_CABINET_HINGE_SIDE: { value: 80, doc: "\u4E2D\u67DC\u94F0\u94FE\u4FA7\u8DDD\u3002" },
  MIDDLE_CABINET_HINGE_FROM_EDGE: { value: 22.5, doc: "\u4E2D\u67DC\u94F0\u94FE\u676F\u5FC3\u8DDD\u95E8\u8FB9\u3002" },
  MIDDLE_CABINET_HINGE_DIAMETER: { value: 35, doc: "\u4E2D\u67DC\u94F0\u94FE\u676F\u5F84\u3002" },
  MIDDLE_CABINET_HINGE_DEPTH: { value: 12.5, doc: "\u4E2D\u67DC\u94F0\u94FE\u676F\u6DF1\u3002" },
  LOCK_WIDTH: { value: 55, doc: "razor_long_rounded_1 \u9501\u69FD\u5BBD\u3002" },
  LOCK_HEIGHT: { value: 15.5, doc: "\u9501\u69FD\u9AD8\u3002" },
  LOCK_DROP: { value: 30.5, doc: "\u9501\u5FC3\u4F4E\u4E8E\u4E0A\u5206\u9694\u5B89\u88C5\u9762\u3002" }
};

// generators/lounge/rules.ts
var RULES = defineRules("lounge", rules_default);

// generators/lounge/place.ts
var r2 = (v) => Math.round(v * 1e3) / 1e3;
var asNum = (v, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
function boxesFromParams(p) {
  const style = p.style ?? "L_SHAPE";
  if (style === "I_SHAPE") {
    const W = asNum(p.mainWidth, 2e3);
    const D = asNum(p.mainDepth, 600);
    return [{ id: "i", x0: 0, x1: W, y0: 0, y1: D }];
  }
  if (style === "U_SHAPE") {
    const W = asNum(p.mainWidth, 2e3);
    const D = asNum(p.mainDepth, 1600);
    const runD = asNum(p.lDepth, 600);
    return [
      { id: "left", x0: 0, x1: runD, y0: 0, y1: D },
      { id: "back", x0: 0, x1: W, y0: r2(D - runD), y1: D },
      { id: "right", x0: r2(W - runD), x1: W, y0: 0, y1: D }
    ];
  }
  if (style === "PARALLEL") {
    const totalW = asNum(p.totalWidth, 4e3);
    const SW = asNum(p.singleLoungeWidth, 1500);
    const D = asNum(p.depth, 800);
    return [
      { id: "left", x0: 0, x1: SW, y0: 0, y1: D },
      { id: "right", x0: r2(totalW - SW), x1: totalW, y0: 0, y1: D }
    ];
  }
  const mainW = asNum(p.mainWidth, 2e3);
  const mainD = asNum(p.mainDepth, 600);
  const ret = asNum(p.lWidth, 1600);
  const thick = asNum(p.lDepth, 600);
  const right = (p.lPosition ?? "RIGHT") !== "LEFT";
  const mainX0 = right ? 0 : thick;
  const mainX1 = right ? r2(mainW - thick) : mainW;
  const lX0 = right ? mainX1 : 0;
  const lX1 = right ? mainW : thick;
  return [
    { id: "main", x0: mainX0, x1: mainX1, y0: r2(ret - mainD), y1: ret },
    { id: "l", x0: lX0, x1: lX1, y0: 0, y1: ret }
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
function pointInFootprintBoxes(x, y, boxes) {
  return boxes.some((b) => x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1);
}
function loungePolyline(params) {
  const style = params.style ?? "L_SHAPE";
  if (style === "I_SHAPE") {
    const W = asNum(params.mainWidth, 2e3);
    const D = asNum(params.mainDepth, 600);
    return [{ x: 0, y: D }, { x: W, y: D }];
  }
  if (style === "U_SHAPE") {
    const W = asNum(params.mainWidth, 2e3);
    const D = asNum(params.mainDepth, 1600);
    return [{ x: 0, y: 0 }, { x: 0, y: D }, { x: W, y: D }, { x: W, y: 0 }];
  }
  if (style === "PARALLEL") {
    const totalW = asNum(params.totalWidth, 4e3);
    const SW = asNum(params.singleLoungeWidth, 1500);
    const D = asNum(params.depth, 800);
    return [{ x: 0, y: D }, { x: SW, y: D }, { x: totalW, y: D }];
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
  const rotZ = r2(Math.atan2(uy, ux) * 180 / Math.PI) || 0;
  const H = asNum(input.height, 420);
  const ppt = asNum(input.partitionPanelThickness, 18);
  const frontLeft = {
    x: r2(left.x + rx * depth),
    y: r2(left.y + ry * depth)
  };
  if (input.style === "I") {
    return {
      params: {
        style: "I_SHAPE",
        mainWidth: r2(len),
        mainDepth: r2(depth),
        height: H,
        partitionPanelThickness: ppt
      },
      pose: { x: frontLeft.x, y: frontLeft.y, z: 0, rotZ }
    };
  }
  const wing = input.wing ?? 0;
  if (!(wing > depth)) throw new Error("lounge return must extend past the middle front");
  const side = input.side === "LEFT" ? "LEFT" : "RIGHT";
  if (input.style === "U") {
    return {
      params: {
        style: "U_SHAPE",
        mainWidth: r2(len),
        mainDepth: r2(wing),
        lDepth: r2(depth),
        height: H,
        partitionPanelThickness: ppt
      },
      pose: { x: r2(left.x + rx * wing), y: r2(left.y + ry * wing), z: 0, rotZ }
    };
  }
  const origin = side === "LEFT" ? { x: r2(left.x - ux * depth + rx * wing), y: r2(left.y - uy * depth + ry * wing) } : { x: r2(left.x + rx * wing), y: r2(left.y + ry * wing) };
  return {
    params: {
      style: "L_SHAPE",
      mainWidth: r2(len),
      mainDepth: r2(depth),
      lWidth: r2(wing),
      lDepth: r2(depth),
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
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const toPlace = (p) => {
    const wx = p.x - p0.x;
    const wy = p.y - p0.y;
    return { U: wx * c + wy * s, V: wx * s - wy * c };
  };
  const local = points.map(toPlace);
  const H = asNum(base.height, 420);
  const ppt = asNum(base.partitionPanelThickness, 18);
  const rotZ = r2(rot * 180 / Math.PI);
  const poseFromDepth = (depth) => ({
    x: r2(p0.x + depth * s),
    y: r2(p0.y - depth * c),
    z: 0,
    rotZ
  });
  if (points.length === 2) {
    const D2 = asNum(base.mainDepth, 600);
    return {
      params: { ...base, style: "I_SHAPE", mainWidth: r2(len), mainDepth: D2, height: H, partitionPanelThickness: ppt },
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
          totalWidth: r2(Math.abs(p2.U)),
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
    const lD = r2(mainD + Math.abs(p2.V));
    const right = p2.U >= len / 2;
    return {
      params: {
        ...base,
        style: "L_SHAPE",
        mainWidth: r2(len),
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
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const W = r2(Math.max(...xs) - minX);
  const D = r2(Math.max(...ys) - minY);
  const runD = asNum(base.lDepth, 600);
  return {
    params: {
      ...base,
      style: "U_SHAPE",
      mainWidth: W,
      mainDepth: D,
      lDepth: runD,
      height: H,
      partitionPanelThickness: ppt
    },
    pose: { x: r2(minX), y: r2(minY), z: 0, rotZ: 0 }
  };
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
var px = (v) => v.toFixed(2);
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
function fitCanvas(W, H, width, maxHeight, pad) {
  const availW = width - pad.l - pad.r;
  const availH = maxHeight - pad.t - pad.b;
  const scale = Math.min(availW / Math.max(W, 1), availH / Math.max(H, 1));
  const ox = pad.l + (availW - W * scale) / 2;
  const oy = pad.t;
  const height = Math.round(H * scale + pad.t + pad.b);
  return { scale, ox, oy, height };
}
function svgRoot(width, height, data, aria, body) {
  const d = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}" ${d} font-family="${PV.font}"><rect x="0" y="0" width="${width}" height="${height}" fill="${PV.bg}" />` + body + `</svg>`;
}

// generators/lounge/svgPreview.ts
var LOUNGE_RUN_LABELS = {
  i: "Run",
  main: "Main run",
  l: "L wing",
  left: "Left leg",
  right: "Right leg"
};
var STYLE_LABEL = { I_SHAPE: "I", L_SHAPE: "L", U_SHAPE: "U", PARALLEL: "Parallel" };
function generateLoungeSvgPreview(result, options = {}) {
  if (!result || !result.boards.length) return null;
  const fp = result.footprint || {};
  const runs = ["i", "main", "l", "left", "right"].map((key) => ({ key, r: fp[key] })).filter((it) => !!it.r);
  if (!runs.length) return null;
  const style = result.params.style;
  const planW = Math.max(...runs.map((it) => it.r.x1), ...result.boards.map((b) => b.x1));
  const planH = Math.max(...runs.map((it) => it.r.y1));
  if (!(planW > 0) || !(planH > 0)) return null;
  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedRun ?? null;
  const { scale, ox, oy, height } = fitCanvas(planW, planH, width, options.maxHeight ?? 460, { l: 40, r: 16, t: 22, b: showDimensions ? 34 : 14 });
  const toX = (x) => ox + x * scale;
  const toY = (y) => oy + (planH - y) * scale;
  const rect = (r) => `x="${px(toX(r.x0))}" y="${px(toY(r.y1))}" width="${px(Math.max((r.x1 - r.x0) * scale, 0.8))}" height="${px(Math.max((r.y1 - r.y0) * scale, 0.8))}"`;
  const parts = [];
  parts.push(`<line x1="${px(toX(0) - 8)}" y1="${px(toY(planH))}" x2="${px(toX(planW) + 8)}" y2="${px(toY(planH))}" stroke="${PV.text3}" stroke-width="3" stroke-opacity="0.55" pointer-events="none" />`);
  for (const { key, r } of runs) {
    parts.push(`<rect class="region" data-run="${key}" ${rect(r)} fill="rgba(79,134,224,0.06)" stroke="none" />`);
  }
  const flat = result.boards.filter((b) => b.profilePlane === "XY");
  const standing = result.boards.filter((b) => b.profilePlane !== "XY");
  for (const b of flat.filter((bb) => bb.category !== "lid").sort((a, c) => a.z1 - c.z1)) {
    const warn = b.category === "avoidance_top";
    parts.push(`<rect data-board="${b.id}" pointer-events="none" ${rect(b)} fill="${warn ? PV.warn : PV.carcass}" fill-opacity="${warn ? 0.12 : 0.22}" stroke="${warn ? PV.warn : PV.carcassLine}" stroke-width="0.75"${warn ? ` stroke-dasharray="4 3"` : ""} />`);
  }
  for (const o of result.openings) {
    parts.push(`<rect pointer-events="none" ${rect({ x0: o.x0, x1: o.x0 + o.width, y0: o.y0, y1: o.y0 + o.depth })} fill="${PV.bg}" fill-opacity="0.35" stroke="${PV.text3}" stroke-dasharray="4 3" stroke-width="1" />`);
  }
  for (const lid of result.lids) {
    const r = { x0: lid.x0, x1: lid.x0 + lid.width, y0: lid.y0, y1: lid.y0 + lid.depth };
    parts.push(`<rect pointer-events="none" ${rect(r)} fill="${PV.carcass}" fill-opacity="0.5" stroke="${PV.carcassLine}" stroke-width="0.75" />`);
    parts.push(`<circle pointer-events="none" cx="${px(toX((r.x0 + r.x1) / 2))}" cy="${px(toY((r.y0 + r.y1) / 2))}" r="${px(Math.max(lid.holeDiameter / 2 * scale, 2))}" fill="${PV.bg}" stroke="${PV.carcassLine}" stroke-width="0.75" />`);
  }
  for (const b of standing) {
    parts.push(`<rect data-board="${b.id}" pointer-events="none" ${rect(b)} fill="${PV.carcass}" fill-opacity="0.95" stroke="${PV.carcassLine}" stroke-width="0.6" />`);
  }
  const mid = result.boards.filter((b) => b.id.startsWith("middle_cabinet"));
  if (mid.length) {
    const r = { x0: Math.min(...mid.map((b) => b.x0)), x1: Math.max(...mid.map((b) => b.x1)), y0: Math.min(...mid.map((b) => b.y0)), y1: Math.max(...mid.map((b) => b.y1)) };
    parts.push(`<rect pointer-events="none" ${rect(r)} fill="none" stroke="${PV.select}" stroke-dasharray="6 3" stroke-width="1.25" />`);
    if ((r.x1 - r.x0) * scale > 50) parts.push(label(toX((r.x0 + r.x1) / 2), toY((r.y0 + r.y1) / 2), "middle cabinet", { size: 10, fill: "#8fb3ef" }));
  }
  for (const { key, r } of runs) {
    const w = (r.x1 - r.x0) * scale;
    const h = (r.y1 - r.y0) * scale;
    if (w < 44 || h < 18) continue;
    const cx = toX((r.x0 + r.x1) / 2);
    const cy = toY((r.y0 + r.y1) / 2);
    const vertical = h > w * 1.6 && w < 70;
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
  const vline = (param2, x, y0, y1) => parts.push(grip(`data-boundary="edge" data-param="${param2}" data-axis="x"`, toX(x), toY(y0), toX(x), toY(y1)));
  const hline = (param2, y, x0, x1) => parts.push(grip(`data-boundary="edge" data-param="${param2}" data-axis="y"`, toX(x0), toY(y), toX(x1), toY(y)));
  if (style === "I_SHAPE" && fp.i) {
    vline("mainWidth", fp.i.x1, fp.i.y0, fp.i.y1);
    hline("mainDepth", fp.i.y1, fp.i.x0, fp.i.x1);
  } else if (style === "U_SHAPE" && fp.left && fp.right) {
    vline("mainWidth", fp.right.x1, fp.right.y0, fp.right.y1);
    vline("lDepth", fp.right.x0, fp.right.y0, fp.main ? fp.main.y0 : fp.right.y1);
    hline("mainDepth", fp.right.y1, fp.left.x0, fp.right.x1);
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
  return svgRoot(width, height, { scale, ox, oy, w: planW, h: planH }, "Lounge plan view", parts.join(""));
}

// generators/lounge/generator.ts
var asNum2 = (v, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
var r22 = (v) => Math.round(v * 1e3) / 1e3;
function mkBoard(id, name, boardType, thickness, plane, axis, x0, x1, y0, y1, z0, z1, profileVector) {
  const box = recordBoardBox(id, r22(x0), r22(x1), r22(y0), r22(y1), r22(z0), r22(z1));
  return {
    id,
    name,
    category: boardType === "front" || boardType === "cabinet_door" ? "front_panel" : boardType,
    boardType,
    materialThickness: thickness,
    profilePlane: plane,
    thicknessAxis: axis,
    stock: { kind: "partition", thickness },
    ...box,
    profileVector
  };
}
function openingAndLid(id, x0, y0, W, D, z0, z1, ppt, lidOn, boards, openings, lids) {
  const ox = r22(x0 + W / 4), oy = r22(y0 + D / 4);
  const ow = r22(W / 2), od = r22(D / 2);
  openings.push({ id: `${id}_opening`, x0: ox, y0: oy, width: ow, depth: od });
  const top = boards.find((board) => board.id === `${id}_top`);
  const rad = RULES.OPENING_RADIUS.value;
  const step = r22(ppt / 2);
  const holeX0 = ox, holeY0 = oy, holeX1 = r22(ox + ow), holeY1 = r22(oy + od);
  if (top) {
    top.profileVector = [
      { x: top.x0, y: top.y0 },
      { x: top.x1, y: top.y0 },
      { x: top.x1, y: top.y1 },
      { x: top.x0, y: top.y1 },
      { x: top.x0, y: top.y0 }
    ];
    const mouth = roundedLoop(holeX0, holeY0, holeX1, holeY1, rad, true);
    const through2 = roundedLoop(r22(holeX0 + step), r22(holeY0 + step), r22(holeX1 - step), r22(holeY1 - step), r22(rad - step), true);
    top.profileHoles = [through2];
    const seat2 = r22(top.z0 + step);
    top.slabs = [
      { outline: top.profileVector, holes: [mouth], z0: top.z0, z1: seat2 },
      { outline: top.profileVector, holes: [through2], z0: seat2, z1: top.z1 }
    ];
  }
  if (!lidOn) return;
  const c = RULES.LID_CLEARANCE_EACH_SIDE.value;
  lids.push({
    id: `${id}_lid`,
    x0: r22(ox + c),
    y0: r22(oy + c),
    width: r22(ow - 2 * c),
    depth: r22(od - 2 * c),
    holeDiameter: RULES.FINGER_HOLE_DIAMETER.value
  });
  const lid = mkBoard(
    `${id}_lid`,
    "Lid",
    "lid",
    ppt,
    "XY",
    "Z",
    ox + c,
    ox + ow - c,
    oy + c,
    oy + od - c,
    z0,
    z1
  );
  const lidRad = r22(rad - c);
  const finger = circleHole((lid.x0 + lid.x1) / 2, (lid.y0 + lid.y1) / 2, RULES.FINGER_HOLE_DIAMETER.value);
  lid.profileVector = roundedLoop(lid.x0, lid.y0, lid.x1, lid.y1, lidRad, false);
  lid.profileHoles = [finger];
  const tongue = roundedLoop(r22(lid.x0 + step), r22(lid.y0 + step), r22(lid.x1 - step), r22(lid.y1 - step), r22(lidRad - step), false);
  const seat = r22(lid.z0 + step);
  lid.slabs = [
    { outline: tongue, holes: [finger], z0: lid.z0, z1: seat },
    { outline: lid.profileVector, holes: [finger], z0: seat, z1: lid.z1 }
  ];
  boards.push(lid);
}
function arcPts(cx, cy, rad, a0, a1, steps = 4) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const a = a0 + (a1 - a0) * (i / steps);
    pts.push({ x: r22(cx + rad * Math.cos(a)), y: r22(cy + rad * Math.sin(a)) });
  }
  return pts;
}
function roundedLoop(x0, y0, x1, y1, rad, hole) {
  const r = Math.max(0, Math.min(rad, (x1 - x0) / 2, (y1 - y0) / 2));
  if (r < 0.05) {
    return hole ? [{ x: x0, y: y0 }, { x: x0, y: y1 }, { x: x1, y: y1 }, { x: x1, y: y0 }, { x: x0, y: y0 }] : [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }, { x: x0, y: y0 }];
  }
  const corners = hole ? [
    [x0 + r, y1 - r, Math.PI, Math.PI / 2],
    [x1 - r, y1 - r, Math.PI / 2, 0],
    [x1 - r, y0 + r, 0, -Math.PI / 2],
    [x0 + r, y0 + r, -Math.PI / 2, -Math.PI]
  ] : [
    [x0 + r, y0 + r, Math.PI, Math.PI * 1.5],
    [x1 - r, y0 + r, Math.PI * 1.5, Math.PI * 2],
    [x1 - r, y1 - r, 0, Math.PI * 0.5],
    [x0 + r, y1 - r, Math.PI * 0.5, Math.PI]
  ];
  return corners.flatMap(([cx, cy, a0, a1]) => arcPts(cx, cy, r, a0, a1));
}
function circleHole(cx, cy, diameter) {
  return arcPts(cx, cy, diameter / 2, 0, -Math.PI * 2, 16);
}
function wallCutoutProfile(y0, y1, Hprime, AD, AH) {
  const span = r22(y1 - y0);
  if (!(AD > 0 && AD < span && AH > 0 && AH < Hprime)) return void 0;
  const cut = r22(span - AD);
  return [
    { y: 0, z: 0 },
    { y: cut, z: 0 },
    { y: cut, z: AH },
    { y: span, z: AH },
    { y: span, z: Hprime },
    { y: 0, z: Hprime },
    { y: 0, z: 0 }
  ];
}
function addAvoidanceCovers(prefix, x0, x1, D, AD, AH, ppt, boards) {
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
    r22(D - AD),
    D,
    r22(AH - ppt),
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
    r22(D - AD),
    r22(D - AD + ppt),
    0,
    r22(AH - ppt)
  ));
}
function addRun(ids, names, x0, x1, y0, y1, H, ppt, Hprime, lidOn, boards, openings, lids, cuts) {
  const frontY1 = r22(y0 + ppt);
  boards.push(mkBoard(ids.front, names.front, "front", ppt, "XZ", "Y", x0, x1, y0, frontY1, 0, Hprime));
  if (!cuts?.omitLeft) boards.push(mkBoard(ids.left, names.left, "side", ppt, "YZ", "X", x0, r22(x0 + ppt), frontY1, y1, 0, Hprime, cuts?.left));
  if (!cuts?.omitRight) boards.push(mkBoard(ids.right, names.right, "side", ppt, "YZ", "X", r22(x1 - ppt), x1, frontY1, y1, 0, Hprime, cuts?.right));
  boards.push(mkBoard(ids.top, names.top, "top_panel", ppt, "XY", "Z", x0, x1, y0, y1, H - ppt, H));
  openingAndLid(ids.key, x0, y0, r22(x1 - x0), r22(y1 - y0), H - ppt, H, ppt, lidOn, boards, openings, lids);
}
function addIRun(prefix, x0, x1, depth, H, ppt, Hprime, lidOn, boards, openings, lids, wheel) {
  const cut = wheel ? wallCutoutProfile(ppt, depth, Hprime, wheel.AD, wheel.AH) : void 0;
  const key = prefix.replace(/_$/, "") || "i";
  addRun(
    { key, front: `${prefix}front`, left: `${prefix}left_side`, right: `${prefix}right_side`, top: `${prefix}top` },
    { front: "Front", left: "Left Side", right: "Right Side", top: "Top" },
    x0,
    x1,
    0,
    depth,
    H,
    ppt,
    Hprime,
    lidOn,
    boards,
    openings,
    lids,
    { left: cut, right: cut }
  );
  if (wheel && cut) addAvoidanceCovers(prefix, x0, x1, depth, wheel.AD, wheel.AH, ppt, boards);
}
function addParallelRun(prefix, label2, xStart, xEnd, D, H, ppt, Hprime, lidOn, boards, openings, lids, wheel) {
  const SW = r22(xEnd - xStart);
  const isLeft = prefix === "left";
  const sideX0 = isLeft ? xEnd - ppt : xStart;
  const frontX0 = isLeft ? xStart : xStart + ppt;
  const frontX1 = isLeft ? xEnd - ppt : xEnd;
  const stripX0 = isLeft ? xStart : xEnd - ppt;
  const cut = wheel ? wallCutoutProfile(0, D, Hprime, wheel.AD, wheel.AH) : void 0;
  boards.push(mkBoard(
    `${prefix}_front`,
    `${label2} Front`,
    "front",
    ppt,
    "XZ",
    "Y",
    frontX0,
    frontX1,
    0,
    ppt,
    0,
    Hprime
  ));
  boards.push(mkBoard(
    `${prefix}_side`,
    `${label2} Side`,
    "side",
    ppt,
    "YZ",
    "X",
    sideX0,
    r22(sideX0 + ppt),
    0,
    D,
    0,
    Hprime,
    cut
  ));
  boards.push(mkBoard(
    `${prefix}_top`,
    `${label2} Top`,
    "top_panel",
    ppt,
    "XY",
    "Z",
    xStart,
    xEnd,
    0,
    D,
    H - ppt,
    H
  ));
  openingAndLid(prefix, xStart, 0, SW, D, H - ppt, H, ppt, lidOn, boards, openings, lids);
  const stripH = RULES.TOP_SUPPORT_STRIP_HEIGHT.value;
  boards.push(mkBoard(
    `${prefix}_support_strip`,
    `${label2} Support Strip`,
    "support_strip",
    ppt,
    "YZ",
    "X",
    stripX0,
    r22(stripX0 + ppt),
    ppt,
    D,
    r22(Hprime - stripH),
    Hprime
  ));
}
function addMiddleCabinet(raw, totalW, D, boards, hinges, locks, grooves, warnings) {
  const mc = raw.middleCabinet ?? {};
  const CW = asNum2(mc.width, RULES.MIDDLE_CABINET_WIDTH.value);
  const CD = asNum2(mc.depth, RULES.MIDDLE_CABINET_DEPTH.value);
  const CH = asNum2(mc.height, RULES.MIDDLE_CABINET_HEIGHT.value);
  const CSH = asNum2(mc.startHeight, RULES.MIDDLE_CABINET_START_HEIGHT.value);
  const dpt = Math.max(1, asNum2(mc.doorPanelThickness, RULES.MIDDLE_CABINET_DOOR_THICKNESS.value));
  const dc = Math.max(0, asNum2(mc.doorClearance, RULES.MIDDLE_CABINET_DOOR_CLEARANCE.value));
  const lockStyle = mc.doorLockStyle === "NONE" ? "NONE" : "RAZOR_ROUNDED";
  const lockSide = asNum2(mc.lockSideDistance, RULES.MIDDLE_CABINET_LOCK_SIDE.value);
  const hingeSide = asNum2(mc.hingeSideDistance, RULES.MIDDLE_CABINET_HINGE_SIDE.value);
  const hingeEdge = asNum2(mc.hingeCupCenterFromEdge, RULES.MIDDLE_CABINET_HINGE_FROM_EDGE.value);
  const cupD = asNum2(mc.hingeCupDiameter, RULES.MIDDLE_CABINET_HINGE_DIAMETER.value);
  const cupDepth = Math.min(Math.max(0.5, asNum2(mc.hingeCupDepth, RULES.MIDDLE_CABINET_HINGE_DEPTH.value)), dpt);
  const gap = totalW - asNum2(raw.singleLoungeWidth, 1500) * 2;
  if (raw.wheelAvoidanceEnabled && !(CSH > asNum2(raw.avoidanceHeight, RULES.DEFAULT_AVOIDANCE_HEIGHT.value))) {
    warnings.push("Middle cabinet start height must be greater than avoidance height.");
  }
  if (CW > Math.max(0, gap)) warnings.push("Middle cabinet width exceeds the middle gap.");
  if (CD > D) warnings.push("Middle cabinet depth exceeds lounge depth.");
  if (!(CW > 3 * dc)) warnings.push("Middle cabinet width must exceed 3 x door clearance.");
  if (!(CH > 2 * dc)) warnings.push("Middle cabinet height must exceed 2 x door clearance.");
  if (!(hingeSide * 2 < CH - 2 * dc)) warnings.push("Hinge side distance is too large for the door height.");
  const x0 = r22((totalW - CW) / 2);
  const y0 = r22(D - CD);
  const dividerDepth = Math.max(0, CD - dpt);
  const tongueWidth = dividerDepth / 2;
  const tongueDepth = dpt / 2 - 0.5;
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
    r22(x0 + CW),
    y0,
    D,
    CSH,
    r22(CSH + dpt)
  ));
  boards.push(mkBoard(
    "middle_cabinet_top",
    "Middle Cabinet Top",
    "cabinet_top",
    dpt,
    "XY",
    "Z",
    x0,
    r22(x0 + CW),
    y0,
    D,
    r22(CSH + CH - dpt),
    r22(CSH + CH)
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
    r22(x0 + dpt),
    y0,
    D,
    r22(CSH + dpt),
    r22(CSH + dpt + sideH)
  ));
  boards.push(mkBoard(
    "middle_cabinet_right",
    "Middle Cabinet Right",
    "cabinet_side",
    dpt,
    "YZ",
    "X",
    r22(x0 + CW - dpt),
    r22(x0 + CW),
    y0,
    D,
    r22(CSH + dpt),
    r22(CSH + dpt + sideH)
  ));
  const grooveU0 = Math.max(0, CD - tongueWidth - 5);
  const grooveV0 = (CH - dpt) / 2 - dpt - 0.5;
  grooves.push({
    id: "middle_cabinet_left_groove",
    boardId: "middle_cabinet_left",
    face: "A",
    u0: grooveU0,
    u1: CD,
    v0: grooveV0,
    v1: grooveV0 + dpt + 1,
    depth: dpt / 2
  });
  grooves.push({
    id: "middle_cabinet_right_groove",
    boardId: "middle_cabinet_right",
    face: "B",
    u0: grooveU0,
    u1: CD,
    v0: grooveV0,
    v1: grooveV0 + dpt + 1,
    depth: dpt / 2
  });
  const dividerZ0 = CSH + (CH - dpt) / 2;
  boards.push(mkBoard(
    "middle_cabinet_mid_divider",
    "Middle Cabinet Mid Horizontal Divider",
    "cabinet_divider",
    dpt,
    "XY",
    "Z",
    r22(x0 + dpt),
    r22(x0 + CW - dpt),
    r22(y0 + dpt),
    D,
    dividerZ0,
    r22(dividerZ0 + dpt),
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
  const lockCenterZ = CSH + dc + dpt + (CH - dc - 2 * dpt - RULES.LOCK_DROP.value);
  const addDoor = (id, doorX0, isLeft) => {
    boards.push(mkBoard(
      id,
      isLeft ? "Middle Cabinet Left Door" : "Middle Cabinet Right Door",
      "cabinet_door",
      dpt,
      "XZ",
      "Y",
      doorX0,
      r22(doorX0 + doorWidth),
      y0,
      r22(y0 + dpt),
      r22(CSH + dc + dpt),
      r22(CSH + dc + dpt + doorHeight)
    ));
    const hingeX = isLeft ? doorX0 + hingeEdge : doorX0 + doorWidth - hingeEdge;
    const z0 = CSH + dc + dpt;
    hinges.push({ id: `${id}_hinge_bottom`, panelId: id, centerX: hingeX, centerZ: z0 + hingeSide, diameter: cupD, depth: cupDepth });
    hinges.push({ id: `${id}_hinge_top`, panelId: id, centerX: hingeX, centerZ: z0 + doorHeight - hingeSide, diameter: cupD, depth: cupDepth });
    if (lockStyle !== "NONE") {
      const lockX = isLeft ? doorX0 + doorWidth - lockSide : doorX0 + lockSide;
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
}
function generateLounge(raw) {
  beginProvenance();
  const warnings = [];
  const errors = [];
  const style = raw.style ?? "L_SHAPE";
  const H = asNum2(raw.height, RULES.DEFAULT_HEIGHT.value);
  const ppt = Math.max(1, asNum2(raw.partitionPanelThickness, RULES.DEFAULT_PPT.value));
  const P2 = param({ H, ppt });
  const Hprime = dim("lounge.panelHeight", { H: P2.H, ppt: P2.ppt }, (t) => t.H - t.ppt);
  const lidOn = raw.topLidEnabled !== false;
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
  if (raw.lFrontAccess && raw.lFrontAccess !== "NONE") warnings.push("lFrontAccess is a placeholder and does not change geometry.");
  if (style === "I_SHAPE") {
    const W = asNum2(raw.mainWidth, 2e3);
    const D = asNum2(raw.mainDepth, 600);
    if (!(W > 2 * ppt && D > 2 * ppt && H > ppt)) warnings.push("I-shape sizes should exceed two panel thicknesses.");
    if (wheelOn) {
      if (!(AD < D)) warnings.push("Avoidance Depth must be less than Depth.");
      if (!(AH < H - ppt)) warnings.push("Avoidance Height must be less than Height - PPT.");
    }
    footprint.i = { x0: 0, x1: W, y0: 0, y1: D };
    addIRun("i_", 0, W, D, H, ppt, Hprime, lidOn, boards, openings, lids, wheel);
  } else if (style === "U_SHAPE") {
    const W = asNum2(raw.mainWidth, 2e3);
    const D = asNum2(raw.mainDepth, 1600);
    const runD = asNum2(raw.lDepth, 600);
    if (!(runD < D && runD * 2 < W)) warnings.push("U: leg thickness must be less than the depth and half the width.");
    const backY0 = r22(D - runD);
    const midX0 = runD;
    const midX1 = r22(W - runD);
    footprint.left = { x0: 0, x1: runD, y0: 0, y1: D };
    footprint.main = { x0: midX0, x1: midX1, y0: backY0, y1: D };
    footprint.right = { x0: midX1, x1: W, y0: 0, y1: D };
    addIRun("left_", 0, runD, D, H, ppt, Hprime, lidOn, boards, openings, lids);
    addRun(
      { key: "back", front: "back_front", left: "back_left_side", right: "back_right_side", top: "back_top" },
      { front: "Front", left: "Left Side", right: "Right Side", top: "Top" },
      midX0,
      midX1,
      backY0,
      D,
      H,
      ppt,
      Hprime,
      lidOn,
      boards,
      openings,
      lids,
      { omitLeft: true, omitRight: true }
    );
    addIRun("right_", midX1, W, D, H, ppt, Hprime, lidOn, boards, openings, lids);
  } else if (style === "PARALLEL") {
    const totalW = asNum2(raw.totalWidth, 4e3);
    const SW = asNum2(raw.singleLoungeWidth, 1500);
    const D = asNum2(raw.depth, 800);
    if (totalW < 2 * SW) warnings.push("PARALLEL totalWidth < 2\xD7singleLoungeWidth; runs overlap.");
    if (wheelOn) {
      if (!(AD < D)) warnings.push("Avoidance Depth must be less than Depth.");
      if (!(AH < H - ppt)) warnings.push("Avoidance Height must be less than Height - PPT.");
    }
    footprint.left = { x0: 0, x1: SW, y0: 0, y1: D };
    footprint.right = { x0: r22(totalW - SW), x1: totalW, y0: 0, y1: D };
    addParallelRun("left", "Left", 0, SW, D, H, ppt, Hprime, lidOn, boards, openings, lids, wheel);
    addParallelRun("right", "Right", r22(totalW - SW), totalW, D, H, ppt, Hprime, lidOn, boards, openings, lids, wheel);
    if (wheelOn) addAvoidanceCovers("parallel_", 0, totalW, D, AD, AH, ppt, boards);
    if (raw.hasMiddleCabinet) addMiddleCabinet(raw, totalW, D, boards, hinges, locks, grooves, warnings);
  } else {
    const mainW = asNum2(raw.mainWidth, 2e3);
    const mainD = asNum2(raw.mainDepth, 600);
    const ret = asNum2(raw.lWidth, 1600);
    const thick = asNum2(raw.lDepth, 600);
    const right = (raw.lPosition ?? "RIGHT") !== "LEFT";
    if (!(ret > mainD)) warnings.push("L: the return should extend past the middle front.");
    if (!(thick < mainW)) warnings.push("L: return thickness should be less than the back length.");
    if (wheelOn) {
      if (!(AD < Math.min(mainD, ret - ppt))) warnings.push("Avoidance Depth must be less than the middle depth and the return.");
      if (!(AH < H - ppt)) warnings.push("Avoidance Height must be less than Height - PPT.");
    }
    const back = dim("lounge.back", { ret }, (t) => t.ret);
    const mainY0 = dim("lounge.mainFront", { back: ref("lounge.back"), mainD }, (t) => t.back - t.mainD);
    const mainX0 = right ? 0 : thick;
    const mainX1 = right ? r22(mainW - thick) : mainW;
    const lX0 = right ? mainX1 : 0;
    const lX1 = right ? mainW : thick;
    footprint.main = { x0: mainX0, x1: mainX1, y0: mainY0, y1: back };
    footprint.l = { x0: lX0, x1: lX1, y0: 0, y1: back };
    addRun(
      { key: "main", front: "main_front", left: "main_left_side", right: "main_right_side", top: "main_top" },
      { front: "Main Front", left: "Main Left Side", right: "Main Right Side", top: "Main Top" },
      mainX0,
      mainX1,
      mainY0,
      back,
      H,
      ppt,
      Hprime,
      lidOn,
      boards,
      openings,
      lids,
      right ? { omitRight: true } : { omitLeft: true }
    );
    const innerOnLeft = right;
    const lCut = wheel ? wallCutoutProfile(ppt, back, Hprime, AD, AH) : void 0;
    addRun(
      {
        key: "l",
        front: "l_front",
        top: "l_top",
        left: innerOnLeft ? "l_side" : "l_outer_side",
        right: innerOnLeft ? "l_outer_side" : "l_side"
      },
      {
        front: "L Front",
        top: "L Top",
        left: innerOnLeft ? "L Side" : "L Outer Side",
        right: innerOnLeft ? "L Outer Side" : "L Side"
      },
      lX0,
      lX1,
      0,
      back,
      H,
      ppt,
      Hprime,
      lidOn,
      boards,
      openings,
      lids,
      { left: innerOnLeft ? lCut : void 0, right: innerOnLeft ? void 0 : lCut }
    );
    if (lCut) {
      addAvoidanceCovers("l_", lX0, lX1, back, AD, AH, ppt, boards);
      addAvoidanceCovers("main_", mainX0, mainX1, back, AD, AH, ppt, boards);
    }
  }
  attachFaces(boards);
  const joints = buildLoungeFaces({ boards, openings, lids, hinges, locks, grooves, doorColour: doorColourOf(raw) });
  applyDoorSides(boards, raw);
  const milling = applyMilling(boards);
  return {
    params: { style, height: H, partitionPanelThickness: ppt, panelHeight: Hprime },
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
