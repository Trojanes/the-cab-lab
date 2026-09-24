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
function relationshipDeclarationsForBoards(boardIds) {
  const extra = [];
  const vs = ["V1", "V2", "V3", "V4", "V5"].filter((id) => boardIds.has(id));
  const bottoms = [...boardIds].filter((id) => /^H\d+_(bottom|fridge)$/.test(id));
  const deck = boardIds.has("B3") ? "B3" : boardIds.has("BH1") ? "BH1" : null;
  if (deck) {
    for (const v of vs) extra.push(D(`gt_${deck.toLowerCase()}_${v.toLowerCase()}`, deck, v, "face_contact", "surface_to_surface", []));
    for (const h of bottoms) extra.push(D(`gt_${deck.toLowerCase()}_${h.toLowerCase()}`, deck, h, "structural_butt_joint", "edge_to_surface", ["screw_hole"]));
  }
  const seen = /* @__PURE__ */ new Set();
  return [...GT_RELATIONSHIP_DECLARATIONS, ...extra].filter((d) => {
    if (!present(d, boardIds) || seen.has(d.declarationId)) return false;
    seen.add(d.declarationId);
    return true;
  });
}

// generators/generalTall/faces.ts
function buildTallFaces(fb) {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  for (const b of fb.boards) {
    b.role = b.category;
    if (b.category === "front_panel" || b.boardType === "front_panel") {
      annotate(b, "B", { semantic: "front", visible: true });
      annotate(b, "A", { semantic: "back", visible: false });
    }
  }
  for (const s of fb.ziSlots) {
    const v = B.get(s.vPanelId);
    if (!v) continue;
    const r = localRect(v, { y: [s.y0, s.y1], z: [s.z0, s.z1] });
    const left = s.vPanelId === "V1" || s.vPanelId === "V3";
    addFeature(v, left ? "A" : "B", {
      id: s.id,
      kind: "groove",
      ...r,
      depth: s.depth,
      for: `Zi_${s.boundaryId}`,
      source: "generalTall"
    });
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
  return resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(new Set(fb.boards.map((b) => b.id))));
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
  HINGE_CUP_DIAMETER: { value: 35, doc: "\u94F0\u94FE\u676F\u76F4\u5F84\u3002" },
  HINGE_CUP_DEPTH: { value: 12.5, doc: "\u94F0\u94FE\u676F\u6DF1\u3002" },
  HINGE_CUP_FROM_EDGE: { value: 22.5, doc: "\u676F\u5FC3\u8DDD\u95E8\u8FB9\u3002" },
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
  FRIDGE_WIDTH_ALLOWANCE: { value: 45, doc: "CW = applianceWidth + 45\uFF08\u65E0\u5916\u9970\u4FA7\u677F\uFF09\u3002" },
  FRIDGE_WIDTH_ALLOWANCE_WITH_EXTERIOR: { value: 61, doc: "CW = applianceWidth + 61\uFF08\u6709 16 mm \u5916\u9970\u4FA7\u677F\uFF09\u3002" },
  FRIDGE_EXTERIOR_THICKNESS: { value: 16, doc: "\u51B0\u7BB1\u5916\u9970\u4FA7\u677F\u539A\uFF08Fridge recipe \u56FA\u5B9A 16\uFF09\u3002" },
  FRIDGE_RAISED_THRESHOLD: { value: 105, doc: "fridgeBaseBottomZ \u2212 avoidH < 105 \u2192 raised\u3002" },
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

// generators/generalTall/generator.ts
var asNum = (v, fb) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fb;
};
var r2 = (v) => Math.round(v * 1e3) / 1e3;
var EPS2 = 1e-3;
var PANEL_TYPES = /* @__PURE__ */ new Set(["side_door", "left_side_door", "right_side_door", "double_door", "drawer", "top_flap", "bottom_flap"]);
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
  const sideMm = RULES.FRIDGE_EXTERIOR_THICKNESS.value;
  if (exteriorSide === "left") {
    next.leftSidePanelThickness = sideMm;
    notes.push("Fridge exteriorSide=left \u2192 SidePanel_L thickness 16mm.");
  } else if (exteriorSide === "right") {
    next.rightSidePanelThickness = sideMm;
    notes.push("Fridge exteriorSide=right \u2192 SidePanel_R thickness 16mm.");
  }
  const sync = input.syncCabinetWidthFromFridge !== false;
  const applianceWidth = Number(fridgeZones[0].applianceWidthMm);
  if (sync && Number.isFinite(applianceWidth) && applianceWidth > 0) {
    const allowance = exteriorSide === "none" ? RULES.FRIDGE_WIDTH_ALLOWANCE.value : RULES.FRIDGE_WIDTH_ALLOWANCE_WITH_EXTERIOR.value;
    const targetWidth = applianceWidth + allowance;
    if (Math.abs(asNum(input.cabinetWidth, 0) - targetWidth) > 0.01) {
      notes.push(`Cabinet width synced from fridge appliance (${applianceWidth}+${allowance}=${targetWidth}).`);
    }
    next.cabinetWidth = targetWidth;
  }
  return next;
}
function normalize(input, errors) {
  const CH = asNum(input.cabinetHeight, 0);
  const CW = asNum(input.cabinetWidth, 0);
  const CD = asNum(input.cabinetDepth, 0);
  const CPT = asNum(input.panelThickness, RULES.DEFAULT_PANEL_THICKNESS.value);
  const FPT = asNum(input.frontPanelThickness ?? input.frontFaceAllowance ?? input.doorPanelThickness, RULES.DEFAULT_FRONT_FACE_ALLOWANCE.value);
  const ziT = asNum(input.ziThickness, RULES.DEFAULT_ZI_THICKNESS.value);
  const hT = asNum(input.hThickness, RULES.DEFAULT_H_THICKNESS.value);
  const dividerT = asNum(input.dividerThickness, RULES.DEFAULT_DIVIDER_THICKNESS.value);
  const fc = asNum(input.frontHardware?.frontClearance, RULES.DEFAULT_FRONT_CLEARANCE.value);
  const leftT = asNum(input.leftSidePanelThickness, 0);
  const rightT = asNum(input.rightSidePanelThickness, 0);
  for (const [name, t] of [["Left", leftT], ["Right", rightT]]) {
    if (t !== 0 && t !== RULES.SIDE_PANEL_WHITELIST_15.value && t !== RULES.SIDE_PANEL_WHITELIST_16.value) {
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
function fitTallCabinetHeight(input, cabinetHeight) {
  const zones = (input.zones ?? []).map((zone) => ({ ...zone }));
  const H = r2(cabinetHeight);
  if (!zones.length) return { ...input, cabinetHeight: H };
  const named = zones.findIndex((zone) => zone.id === "zone-3" && zone.type !== "fridge");
  let fallback = -1;
  for (let i = zones.length - 1; i >= 0; i -= 1) {
    if (zones[i].type !== "fridge") {
      fallback = i;
      break;
    }
  }
  const index = named >= 0 ? named : fallback >= 0 ? fallback : zones.length - 1;
  const trial = zones.map((zone, i) => i === index ? { ...zone, height: 0 } : zone);
  const scratch = [];
  const stacked = computeStack(normalize({ ...input, cabinetHeight: H, zones: trial }, scratch), scratch, scratch);
  const room = r2(H - stacked.calculatedHeight);
  const height = Math.max(SLACK_ZONE_MIN, room);
  const nextZones = zones.map((zone, i) => i === index ? { ...zone, height } : zone);
  const fitted = height === room ? H : r2(stacked.calculatedHeight + height);
  return { ...input, cabinetHeight: fitted, zones: nextZones };
}
function yz(pts) {
  return pts.map(([y, z]) => ({ y: r2(y), z: r2(z) }));
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
function v12Profile(s, slots, yOrigin) {
  const CH = s.CH;
  const tRear = RULES.V12_Y_REAR.value;
  const slotY = RULES.V12_ZI_SLOT_INNER.value;
  const frontY = RULES.V12_Y_FRONT_FACE.value;
  const stepY = RULES.V12_Y_STEP_INNER.value;
  const topStyle1 = s.topSys.style === "style_1";
  const botStyle1 = s.botSys.style === "style_1";
  const notchD = RULES.STYLE_2_END_NOTCH_DEPTH.value;
  const notchT = RULES.V34_END_NOTCH_THICKNESS.value;
  const pts = botStyle1 ? [[frontY, 0], [tRear, 0]] : [[tRear, 0]];
  for (const sl of slots) {
    pts.push([tRear, r2(sl.z0)], [slotY, r2(sl.z0)], [slotY, r2(sl.z1)], [tRear, r2(sl.z1)]);
  }
  pts.push([tRear, CH]);
  if (topStyle1) {
    const insT = RULES.STYLE_1_INSERT_SLOT_THICKNESS.value;
    const topFrontRail = r2(CH - (s.topSys.railH - insT));
    pts.push(
      [frontY, CH],
      [frontY, topFrontRail],
      [stepY, topFrontRail],
      [stepY, r2(topFrontRail - insT)],
      [0, r2(topFrontRail - insT)]
    );
  } else {
    pts.push([notchD, CH], [notchD, r2(CH - notchT)], [0, r2(CH - notchT)]);
  }
  if (botStyle1) {
    const insT = RULES.STYLE_1_INSERT_SLOT_THICKNESS.value;
    const botRail = s.botSys.railH;
    pts.push(
      [0, r2(botRail)],
      [stepY, r2(botRail)],
      [stepY, r2(botRail - insT)],
      [frontY, r2(botRail - insT)],
      [frontY, 0]
    );
  } else {
    pts.push([0, notchT], [notchD, notchT], [notchD, 0], [tRear, 0]);
  }
  return yz(pts.map(([y, z]) => [y + yOrigin, z]));
}
function v34Profile(s, slots, warnings, yOff) {
  const CH = s.CH;
  const tRear = RULES.V34_Y_REAR.value;
  const slotY = RULES.V34_ZI_SLOT_INNER.value;
  const nh = RULES.V34_NOTCH_HEIGHT.value;
  const nf = RULES.V34_TOP_NOTCH_FRONT_Y.value;
  const ni = RULES.V34_TOP_NOTCH_INNER_Y.value;
  const nt = RULES.V34_END_NOTCH_THICKNESS.value;
  const Y = (y) => r2(y + yOff);
  const kept = [];
  for (const sl of slots) {
    if (sl.z0 < CH - nh && sl.z1 > 0) kept.push(sl);
    else warnings.push(`Zi slot at z [${r2(sl.z0)}, ${r2(sl.z1)}] intersects avoidance/edge on V3/V4; slot omitted.`);
  }
  kept.sort((a, b) => b.z1 - a.z1);
  let start;
  if (s.avoid.enabled && s.avoid.height > 0 && s.avoid.depth > 0) {
    const ah = s.avoid.height, ad = s.avoid.depth;
    if (ad <= 150) {
      start = [
        [0, 0],
        [RULES.V_AVOIDANCE_PARTIAL_FRONT_Y.value, 0],
        [RULES.V_AVOIDANCE_PARTIAL_FRONT_Y.value, ah],
        [tRear, ah]
      ];
    } else {
      start = [[0, ah], [tRear, ah]];
    }
  } else {
    start = [[0, 0], [tRear, 0]];
  }
  const pts = [
    ...start,
    [tRear, r2(CH - nh)],
    [ni, r2(CH - nh)],
    [ni, r2(CH - nt)],
    [nf, r2(CH - nt)],
    [nf, CH],
    [0, CH]
  ];
  for (const sl of kept) {
    pts.push([0, r2(sl.z1)], [slotY, r2(sl.z1)], [slotY, r2(sl.z0)], [0, r2(sl.z0)]);
  }
  pts.push([0, start[0][1]]);
  return yz(pts.map(([y, z]) => [Y(y), z]));
}
function fullZiProfile(s) {
  const x = (v) => r2(v + s.dx);
  const mw = s.midWidth, md = s.midDepth, nd = RULES.ZI_FULL_FRONT_REAR_NOTCH_DEPTH.value;
  return [
    { x: x(s.CPT), y: 0 },
    { x: x(s.CPT), y: nd },
    { x: x(0), y: nd },
    { x: x(0), y: r2(md - nd) },
    { x: x(s.CPT), y: r2(md - nd) },
    { x: x(s.CPT), y: md },
    { x: x(mw - s.CPT), y: md },
    { x: x(mw - s.CPT), y: r2(md - nd) },
    { x: x(mw), y: r2(md - nd) },
    { x: x(mw), y: nd },
    { x: x(mw - s.CPT), y: nd },
    { x: x(mw - s.CPT), y: 0 },
    { x: x(s.CPT), y: 0 }
  ];
}
function halfZiProfile(s) {
  const x = (v) => r2(v + s.dx);
  const mw = s.midWidth;
  const nd = RULES.ZI_HALF_FRONT_NOTCH_DEPTH.value;
  const dep = RULES.ZI_HALF_DEPTH.value;
  return [
    { x: x(0), y: 0 },
    { x: x(0), y: nd },
    { x: x(s.CPT), y: nd },
    { x: x(s.CPT), y: dep },
    { x: x(mw - s.CPT), y: dep },
    { x: x(mw - s.CPT), y: nd },
    { x: x(mw), y: nd },
    { x: x(mw), y: 0 },
    { x: x(0), y: 0 }
  ];
}
function generateGeneralTall(input) {
  beginProvenance();
  const errors = [];
  const warnings = [];
  const fridgeNotes = [];
  const prepared = applyFridgePrep(input, fridgeNotes);
  const s = normalize(prepared, errors);
  warnings.push(...fridgeNotes);
  const P = param({ CH: s.CH, CW: s.CW, CD: s.CD, CPT: s.CPT, FPT: s.FPT });
  dim("tall.midDepth", { CD: P.CD, FPT: P.FPT }, (t) => t.CD - t.FPT);
  const stileY0 = dim("tall.stileY0", { FPT: P.FPT }, () => 0);
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
  const fridgeZoneItem = zoneItems.find((zi) => zi.zone.type === "fridge");
  if (fridgeZoneItem) {
    const below = boundaries.find((b) => b.id === `boundary-${fridgeZoneItem.zone.id}`);
    fridgeBaseBottomZ = below ? below.z0 : fridgeZoneItem.z0;
    const aw = Number(fridgeZoneItem.zone.applianceWidthMm);
    const adp = Number(fridgeZoneItem.zone.applianceDepthMm);
    if (Number.isFinite(aw) && aw > mw + 0.01) {
      warnings.push(`Fridge zone ${fridgeZoneItem.zone.id} applianceWidthMm=${aw} exceeds interior midWidth=${mw}.`);
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
  const v12Slots = boundaries.filter((b) => b.boundaryType === "full_zi" || b.boundaryType === "half_zi").map((b) => ({ z0: r2(b.centerZ - (s.ziT + RULES.ZI_SLOT_CLEARANCE.value) / 2), z1: r2(b.centerZ + (s.ziT + RULES.ZI_SLOT_CLEARANCE.value) / 2), boundaryId: b.id }));
  const v34Slots = boundaries.filter((b) => b.boundaryType === "full_zi").map((b) => ({ z0: r2(b.centerZ - (s.ziT + RULES.ZI_SLOT_CLEARANCE.value) / 2), z1: r2(b.centerZ + (s.ziT + RULES.ZI_SLOT_CLEARANCE.value) / 2), boundaryId: b.id }));
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
    v12Profile(s, v12Slots, v12Y0)
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
    v12Profile(s, v12Slots, v12Y0)
  ));
  const v34Y0 = r2(stileY0 + Math.max(0, md - RULES.V34_Y_REAR.value));
  const v34Y1 = r2(stileY0 + md);
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
    v34Y1,
    0,
    CH,
    v34Profile(s, v34Slots, warnings, v34Y0)
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
    v34Y1,
    0,
    CH,
    v34Profile(s, v34Slots, warnings, v34Y0)
  ));
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
      sideY0,
      sideY1,
      fridgeZoneItem.z0,
      fridgeZoneItem.z1,
      yz([
        [sideY0, fridgeZoneItem.z0],
        [sideY1, fridgeZoneItem.z0],
        [sideY1, fridgeZoneItem.z1],
        [sideY0, fridgeZoneItem.z1],
        [sideY0, fridgeZoneItem.z0]
      ])
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
    const notch = RULES.STYLE_1_INSERT_FRONT_NOTCH_DEPTH.value;
    const t1H = RULES.STYLE_1_FIRST_RAIL_THICKNESS.value;
    const t2H = RULES.STYLE_1_SECOND_RAIL_THICKNESS.value;
    const insT = RULES.STYLE_1_INSERT_SLOT_THICKNESS.value;
    const insertProfile = () => [
      { x: dx, y: 0 },
      { x: dx, y: notch },
      { x: r2(dx + CPT), y: notch },
      { x: r2(dx + CPT), y: insDepth },
      { x: r2(dx + mw - CPT), y: insDepth },
      { x: r2(dx + mw - CPT), y: notch },
      { x: r2(dx + mw), y: notch },
      { x: r2(dx + mw), y: 0 }
    ];
    if (s.topSys.style === "style_1") {
      const topBand0 = r2(CH - s.topSys.railH);
      const topRail0 = r2(CH - s.topSys.frontRail);
      boards.push(mkBoard(
        "T1",
        "Top Front Rail",
        "top_system",
        "T1",
        t1H,
        "carcass",
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
        topBand0,
        topRail0,
        insertProfile()
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
        r2(CH - 16),
        r2(CH - inset),
        void 0
      ));
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
    if (s.botSys.style === "style_1") {
      const botRail1 = r2(s.botSys.frontRail);
      const botBand1 = r2(s.botSys.railH);
      boards.push(mkBoard(
        "B1",
        "Bottom Front Rail",
        "bottom_system",
        "B1",
        t1H,
        "carcass",
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
        botBand1,
        insertProfile()
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
      prof = halfZiProfile(s);
    } else {
      prof = fullZiProfile(s);
      if (hitsAvoid) {
        type = "shortened_zi";
        y1 = avoidShortY;
        prof = fullZiProfile(s).map((p) => "y" in p && !("z" in p) ? { ...p, y: Math.min(p.y, y1) } : p);
      }
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
    const below1 = r2(vdShelf.z0 - 1);
    const above0 = r2(vdShelf.z1 - 1);
    for (const h of hMid) {
      if (h.name === "H34_mid") {
        h.z0 = above0;
        h.z1 = r2(above0 + Hspan);
      } else {
        h.z1 = below1;
        h.z0 = r2(below1 - Hspan);
      }
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
        const nz0 = r2(zi.z1 - 1), nz1 = r2(zi.z1 - 1 + H);
        if (nz1 > CH) {
          hZiConflicts.push(`${h.name} movement above Zi would exceed cabinet bounds; movement skipped.`);
          continue;
        }
        h.z0 = nz0;
        h.z1 = nz1;
      } else {
        const nz1 = r2(zi.z0 - 1), nz0 = r2(zi.z0 - 1 - H);
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
      boards.push(mkBoard(
        h.name,
        "H Bridge Rear",
        "h_support",
        h.name,
        s.hT,
        "carcass",
        "XZ",
        "Y",
        r2(dx + RULES.H_SUPPORT_THICKNESS.value),
        r2(dx + mw - RULES.H_SUPPORT_THICKNESS.value),
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
        boards.push(mkBoard(
          h.name,
          "H34 fridge",
          "h_support",
          "H34_fridge",
          s.hT,
          "carcass",
          "XZ",
          "Y",
          r2(dx + RULES.H_SUPPORT_THICKNESS.value),
          r2(dx + mw - RULES.H_SUPPORT_THICKNESS.value),
          r2(md - RULES.H34_DEPTH.value),
          md,
          h.z0,
          h.z1,
          void 0
        ));
      }
    }
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
        "XY",
        "Z",
        dx,
        r2(dx + mw),
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
        "XY",
        "Z",
        dx,
        r2(dx + mw),
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
        "XY",
        "Z",
        dx,
        r2(dx + mw),
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
    const h34Bands = boards.filter((board) => board.id.startsWith("H34")).map((board) => ({ z0: Math.max(board.z0, z0), z1: Math.min(board.z1, z1) })).filter((band) => band.z1 - band.z0 > EPS2);
    const t5z0 = r2(CH - RULES.T5_REAR_VERTICAL_HEIGHT.value - RULES.H34_Z_BELOW.value);
    const t5Top = r2(Math.min(z1, CH));
    if (t5Top > Math.max(z0, t5z0) + EPS2) h34Bands.push({ z0: r2(Math.max(z0, t5z0)), z1: t5Top });
    h34Bands.sort((a, b) => a.z0 - b.z0);
    for (const band of h34Bands) {
      const prev = h34Cuts[h34Cuts.length - 1];
      if (prev && band.z0 <= prev.z1 + EPS2) prev.z1 = r2(Math.max(prev.z1, band.z1));
      else h34Cuts.push({ z0: r2(band.z0), z1: r2(band.z1) });
    }
    const rear = [[md, rearBottomZ]];
    let zCursor = rearBottomZ;
    for (const cut of h34Cuts) {
      const cz0 = r2(Math.max(cut.z0, zCursor));
      const cz1 = r2(cut.z1);
      if (cz1 <= zCursor + EPS2) continue;
      if (cz0 > zCursor + EPS2) rear.push([md, cz0]);
      rear.push([h34CutY0, cz0], [h34CutY0, cz1]);
      if (cz1 < z1 - EPS2) rear.push([md, cz1]);
      zCursor = cz1;
    }
    if (z1 > zCursor + EPS2) rear.push([md, z1]);
    const prof = yz([
      [0, rearBottomZ],
      [ty0, rearBottomZ],
      [ty0, z0],
      [ty1, z0],
      [ty1, rearBottomZ],
      ...rear,
      [0, z1],
      [0, rearBottomZ]
    ]);
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
      const isUpper = Math.abs(b.z0 - z1) < EPS2;
      const isLower = Math.abs(b.z1 - z0) < EPS2;
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
    if (!PANEL_TYPES.has(zt) || zt === "drawer" || zt === "top_flap" || zt === "bottom_flap") continue;
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
      "Front Panel",
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
    if (zt !== "drawer") {
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
      if (lp === "top") {
        cz = r2(fp.z1 - RULES.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
        mountingFace = "top";
      } else if (lp === "bottom") {
        cz = r2(fp.z0 + RULES.LOCK_MOUNTING_SURFACE_TO_SLOT_CENTER.value);
        mountingFace = "bottom";
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
  const mkSidePanel = (side, t, adapt) => {
    const x0 = side === "L" ? 0 : r2(s.CW - t);
    let prof;
    if (s.avoid.enabled && s.avoid.depth > 0 && s.avoid.height > 0 && adapt) {
      const ad = s.avoid.depth, ah = s.avoid.height;
      prof = yz([[-FPT, 0], [r2(md - ad), 0], [r2(md - ad), ah], [md, ah], [md, CH], [-FPT, CH]]);
    }
    boards.push(mkBoard(
      `SidePanel_${side}`,
      `Side Panel ${side === "L" ? "Left" : "Right"}`,
      "side_panel",
      "side_panel",
      t,
      "carcass",
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
  if (s.leftT > 0) mkSidePanel("L", s.leftT, s.leftAdapt);
  if (s.rightT > 0) mkSidePanel("R", s.rightT, s.rightAdapt);
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
  attachFaces(boards);
  const joints = buildTallFaces({ boards, ziSlots, ziGrooves, hinges, locks });
  const result = {
    params: {
      cabinetHeight: CH,
      cabinetWidth: s.CW,
      cabinetDepth: CD,
      midWidth: mw,
      midDepth: md,
      panelThickness: CPT,
      frontPanelThickness: FPT,
      ziThickness: s.ziT
    },
    boards,
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
  fitTallCabinetHeight,
  generateGeneralTall
};
