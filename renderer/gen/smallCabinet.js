// Generated from generators/smallCabinet/generator.ts - do not edit.

// generators/smallCabinet/frontPanelCalculator.ts
function round1(value) {
  return Math.round(value * 10) / 10;
}
function zoneHasFront(type) {
  return type === "left_door" || type === "right_door" || type === "drawer";
}
function computeFrontPanelBounds(input) {
  const W = input.cabinetWidth;
  const H = input.cabinetHeight;
  const CPT = input.panelThickness;
  const FC = input.frontClearance;
  const { zone, zoneIndex, zones } = input;
  const x0 = round1(FC);
  const x1 = round1(W - FC);
  const above = zoneIndex > 0 ? zones[zoneIndex - 1] : null;
  const below = zoneIndex < zones.length - 1 ? zones[zoneIndex + 1] : null;
  let z0;
  let z0Source;
  if (below && zoneHasFront(below.type)) {
    z0 = round1(zone.zBottom + FC / 2);
    z0Source = "mid_center_plus_half_fc";
  } else {
    z0 = round1(FC);
    z0Source = "cabinet_bottom_plus_fc";
  }
  let z1;
  let z1Source;
  if (above && zoneHasFront(above.type)) {
    z1 = round1(zone.zTop - FC / 2);
    z1Source = "mid_center_minus_half_fc";
  } else {
    z1 = round1(H - FC);
    z1Source = "cabinet_top_minus_fc";
  }
  return {
    x0,
    x1,
    z0,
    z1,
    sources: { x: "outer_fc", z0: z0Source, z1: z1Source }
  };
}
function frontPanelIsValid(bounds, eps = 1e-6) {
  return bounds.x1 - bounds.x0 > eps && bounds.z1 - bounds.z0 > eps;
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
var round12 = (v) => Math.round(v * 10) / 10;
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
    const len = (a) => round12(b[`${a}1`] - b[`${a}0`]);
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

// generators/smallCabinet/faces.ts
var EPS2 = 0.01;
function buildSmallCabinetFaces(fb) {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  const joints = [];
  for (const b of fb.boards) {
    b.role = b.category;
    const isFront = b.category === "front_panel";
    b.stock = { kind: isFront ? "door" : "carcass", thickness: b.materialThickness, colour: isFront ? fb.doorColorName : fb.carcassColorName };
    if (isFront) {
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColorName } });
      annotate(b, "A", { semantic: "back", visible: false, finish: { colour: fb.doorColorName } });
    } else {
      annotate(b, "A", { finish: { colour: fb.carcassColorName } });
      annotate(b, "B", { finish: { colour: fb.carcassColorName } });
    }
  }
  const sideL = B.get("SIDE_L");
  const sideR = B.get("SIDE_R");
  if (sideL) {
    annotate(sideL, "A", { semantic: "inside" });
    annotate(sideL, "B", { semantic: "outside", finish: { colour: sideL.useDoorColor ? fb.doorColorName : fb.carcassColorName } });
  }
  if (sideR) {
    annotate(sideR, "B", { semantic: "inside" });
    annotate(sideR, "A", { semantic: "outside", finish: { colour: sideR.useDoorColor ? fb.doorColorName : fb.carcassColorName } });
  }
  for (const id of ["TOP", "BOTTOM"]) {
    const b = B.get(id);
    if (!b) continue;
    annotate(b, "A", { semantic: id === "TOP" ? "top" : "inside" });
    annotate(b, "B", { semantic: id === "TOP" ? "inside" : "bottom" });
  }
  const back = B.get("BACK");
  if (back) {
    annotate(back, "A", { semantic: "back" });
    annotate(back, "B", { semantic: "inside" });
  }
  for (const f of fb.features) {
    if (f.type !== "side_groove") continue;
    const board = B.get(f.targetBoardId);
    if (!board) continue;
    if (board.id === "BACK") {
      if (f.x0 == null || f.x1 == null || f.z0 == null || f.z1 == null) continue;
      const r2 = localRect(board, { x: [f.x0, f.x1], z: [f.z0, f.z1] });
      addFeature(board, "B", { id: f.id, kind: "groove", ...r2, depth: f.depth, for: f.relatedBoardId, source: f.source });
      continue;
    }
    if (f.y0 == null || f.y1 == null || f.z0 == null || f.z1 == null) continue;
    const opensEdge = f.through && (f.z0 <= 0.05 || f.z1 >= board.z1 - 0.05 || f.y1 >= board.y1 - 0.05);
    if (opensEdge) continue;
    const faceId = board.id === "SIDE_L" ? "A" : "B";
    const r = localRect(board, { y: [f.y0, f.y1], z: [f.z0, f.z1] });
    addFeature(board, faceId, f.through ? { id: f.id, kind: "cutout", ...r, through: true, for: f.relatedBoardId, source: f.source } : { id: f.id, kind: "groove", ...r, depth: f.depth, for: f.relatedBoardId, source: f.source });
  }
  const t = fb.panelThickness;
  for (const f of fb.features) {
    if (f.type !== "shelf_tongue" && f.type !== "back_tongue") continue;
    const b = B.get(f.targetBoardId);
    if (!b) continue;
    const width = b.x1 - b.x0;
    const uBox = f.side === "left" ? { u0: -EPS2, u1: t - EPS2 } : { u0: width - t + EPS2, u1: width + EPS2 };
    const vBox = f.type === "shelf_tongue" ? { v0: (f.y0 ?? 0) - b.y0 - EPS2, v1: (f.y1 ?? 0) - b.y0 + EPS2 } : { v0: (f.z0 ?? 0) - b.z0 - EPS2, v1: (f.z1 ?? 0) - b.z0 + EPS2 };
    const tagged = tagEdges(b, "tongue", { ...uBox, ...vBox }, { id: f.id, for: f.relatedBoardId, source: f.source });
    const side = f.relatedBoardId ? B.get(f.relatedBoardId) : void 0;
    if (side && tagged.length) {
      joints.push(joint(`${f.id}_joint`, "tongue_groove", faceRef(side.id, [side.id === "SIDE_L" ? "A" : "B"]), faceRef(b.id, tagged), { hardware: [], rule: "small_tongue_groove_v1" }));
    }
  }
  for (const b of fb.boards) {
    if (!b.lockCutout) continue;
    const r = localRect(b, { x: [b.lockCutout.x0, b.lockCutout.x1], z: [b.lockCutout.z0, b.lockCutout.z1] });
    addFeature(b, "B", { id: `${b.id}_door_lock`, kind: "cutout", ...r, radius: b.lockCutout.radius, through: true, for: "door_lock", source: "door_lock" });
  }
  return joints;
}

// generators/smallCabinet/shelfJoinery.ts
var SHELF_TONGUE_DEPTH_FRACTION = 1 / 3;
var GROOVE_LENGTH_OVERSIZE = 5;
var GROOVE_THICKNESS_OVERSIZE = 1;
var HALF_TONGUE_SHORT_MM = 0.5;
var GROOVE_Y_OVERSIZE = GROOVE_LENGTH_OVERSIZE;
var GROOVE_Z_OVERSIZE = GROOVE_THICKNESS_OVERSIZE;
function round13(value) {
  return Math.round(value * 10) / 10;
}
function centeredThirdRange(spanStart, spanEnd) {
  const span = spanEnd - spanStart;
  const length = span * SHELF_TONGUE_DEPTH_FRACTION;
  const a0 = round13(spanStart + (span - length) / 2);
  const a1 = round13(a0 + length);
  return { a0, a1 };
}
function shelfTongueYRange(shelfY0, shelfY1) {
  const { a0, a1 } = centeredThirdRange(shelfY0, shelfY1);
  return { tongueY0: a0, tongueY1: a1 };
}
function shelfProfileWithTongues(bodyX0, bodyX1, y0, y1, leftLength, rightLength, tongueY0, tongueY1) {
  const left = Math.max(0, leftLength);
  const right = Math.max(0, rightLength);
  return [
    { x: bodyX0, y: y0 },
    { x: bodyX1, y: y0 },
    { x: bodyX1, y: tongueY0 },
    { x: bodyX1 + right, y: tongueY0 },
    { x: bodyX1 + right, y: tongueY1 },
    { x: bodyX1, y: tongueY1 },
    { x: bodyX1, y: y1 },
    { x: bodyX0, y: y1 },
    { x: bodyX0, y: tongueY1 },
    { x: bodyX0 - left, y: tongueY1 },
    { x: bodyX0 - left, y: tongueY0 },
    { x: bodyX0, y: tongueY0 },
    { x: bodyX0, y: y0 }
  ];
}
function backProfileWithTongues(bodyX0, bodyX1, z0, z1, leftLength, rightLength, tongueZ0, tongueZ1) {
  const left = Math.max(0, leftLength);
  const right = Math.max(0, rightLength);
  return [
    { x: bodyX0, z: z0 },
    { x: bodyX1, z: z0 },
    { x: bodyX1, z: tongueZ0 },
    { x: bodyX1 + right, z: tongueZ0 },
    { x: bodyX1 + right, z: tongueZ1 },
    { x: bodyX1, z: tongueZ1 },
    { x: bodyX1, z: z1 },
    { x: bodyX0, z: z1 },
    { x: bodyX0, z: tongueZ1 },
    { x: bodyX0 - left, z: tongueZ1 },
    { x: bodyX0 - left, z: tongueZ0 },
    { x: bodyX0, z: tongueZ0 },
    { x: bodyX0, z: z0 }
  ];
}
function tongueStickOut(thickness, through2) {
  if (through2) return round13(thickness);
  return round13(Math.max(1, thickness / 2 - HALF_TONGUE_SHORT_MM));
}
function grooveDepthFor(thickness, through2) {
  if (through2) return round13(thickness);
  return round13(tongueStickOut(thickness, false) + HALF_TONGUE_SHORT_MM);
}
function grooveCrossSpan(a, b, edge0, edge1) {
  const extra = GROOVE_THICKNESS_OVERSIZE;
  if (a <= edge0 + 0.05) return { g0: round13(edge0), g1: round13(b + extra) };
  if (b >= edge1 - 0.05) return { g0: round13(a - extra), g1: round13(edge1) };
  return { g0: round13(a - extra / 2), g1: round13(b + extra / 2) };
}
function buildShelfTongueSpec(shelf, left, right) {
  const bodyX0 = shelf.x0;
  const bodyX1 = shelf.x1;
  const { tongueY0, tongueY1 } = shelfTongueYRange(shelf.y0, shelf.y1);
  return {
    shelfId: shelf.id,
    bodyX0,
    bodyX1,
    y0: shelf.y0,
    y1: shelf.y1,
    tongueY0,
    tongueY1,
    tongueLength: round13(Math.max(tongueStickOut(left.thickness, left.through), tongueStickOut(right.thickness, right.through))),
    z0: shelf.z0,
    z1: shelf.z1,
    left,
    right
  };
}
function buildBackTongueSpec(back, left, right) {
  const { a0: tongueZ0, a1: tongueZ1 } = centeredThirdRange(back.z0, back.z1);
  return {
    backId: back.id,
    bodyX0: back.x0,
    bodyX1: back.x1,
    y0: back.y0,
    y1: back.y1,
    z0: back.z0,
    z1: back.z1,
    tongueZ0,
    tongueZ1,
    tongueLength: round13(Math.max(tongueStickOut(left.thickness, left.through), tongueStickOut(right.thickness, right.through))),
    left,
    right
  };
}
function applyShelfTongues(shelf, spec) {
  const left = tongueStickOut(spec.left.thickness, spec.left.through);
  const right = tongueStickOut(spec.right.thickness, spec.right.through);
  shelf.x0 = round13(spec.bodyX0 - left);
  shelf.x1 = round13(spec.bodyX1 + right);
  shelf.profileVector = shelfProfileWithTongues(
    spec.bodyX0,
    spec.bodyX1,
    spec.y0,
    spec.y1,
    left,
    right,
    spec.tongueY0,
    spec.tongueY1
  );
  shelf.notes = [
    ...shelf.notes || [],
    `Tongues length=${spec.tongueLength} Y=${spec.tongueY0}..${spec.tongueY1} (depth/3, through)`
  ];
}
function applyBackTongues(back, spec) {
  const left = tongueStickOut(spec.left.thickness, spec.left.through);
  const right = tongueStickOut(spec.right.thickness, spec.right.through);
  back.x0 = round13(spec.bodyX0 - left);
  back.x1 = round13(spec.bodyX1 + right);
  back.profileVector = backProfileWithTongues(
    spec.bodyX0,
    spec.bodyX1,
    spec.z0,
    spec.z1,
    left,
    right,
    spec.tongueZ0,
    spec.tongueZ1
  );
  back.notes = [
    ...back.notes || [],
    `Tongues length=${spec.tongueLength} Z=${spec.tongueZ0}..${spec.tongueZ1} (height/3, through)`
  ];
}
function buildShelfJoineryFeatures(spec, sideY1, sideZ1) {
  const grooveY0 = round13(Math.max(0, spec.tongueY0 - GROOVE_LENGTH_OVERSIZE));
  const grooveY1 = round13(Math.min(sideY1, spec.tongueY1 + GROOVE_LENGTH_OVERSIZE));
  const { g0: grooveZ0, g1: grooveZ1 } = grooveCrossSpan(spec.z0, spec.z1, 0, sideZ1);
  const leftDepth = grooveDepthFor(spec.left.thickness, spec.left.through);
  const rightDepth = grooveDepthFor(spec.right.thickness, spec.right.through);
  return [
    {
      id: `${spec.shelfId}_tongue_L`,
      type: "shelf_tongue",
      targetBoardId: spec.shelfId,
      relatedBoardId: "SIDE_L",
      side: "left",
      y0: spec.tongueY0,
      y1: spec.tongueY1,
      z0: spec.z0,
      z1: spec.z1,
      insertionDepth: tongueStickOut(spec.left.thickness, spec.left.through),
      source: "shelf_joinery"
    },
    {
      id: `${spec.shelfId}_tongue_R`,
      type: "shelf_tongue",
      targetBoardId: spec.shelfId,
      relatedBoardId: "SIDE_R",
      side: "right",
      y0: spec.tongueY0,
      y1: spec.tongueY1,
      z0: spec.z0,
      z1: spec.z1,
      insertionDepth: tongueStickOut(spec.right.thickness, spec.right.through),
      source: "shelf_joinery"
    },
    {
      id: `SIDE_L_${spec.shelfId}_groove`,
      type: "side_groove",
      targetBoardId: "SIDE_L",
      relatedBoardId: spec.shelfId,
      side: "left",
      y0: grooveY0,
      y1: grooveY1,
      z0: grooveZ0,
      z1: grooveZ1,
      depth: leftDepth,
      through: spec.left.through,
      source: "shelf_joinery"
    },
    {
      id: `SIDE_R_${spec.shelfId}_groove`,
      type: "side_groove",
      targetBoardId: "SIDE_R",
      relatedBoardId: spec.shelfId,
      side: "right",
      y0: grooveY0,
      y1: grooveY1,
      z0: grooveZ0,
      z1: grooveZ1,
      depth: rightDepth,
      through: spec.right.through,
      source: "shelf_joinery"
    }
  ];
}
function buildBackJoineryFeatures(spec, sideZ1) {
  const grooveZ0 = round13(Math.max(0, spec.tongueZ0 - GROOVE_LENGTH_OVERSIZE));
  const grooveZ1 = round13(Math.min(sideZ1, spec.tongueZ1 + GROOVE_LENGTH_OVERSIZE));
  const { g0: grooveY0, g1: grooveY1 } = grooveCrossSpan(spec.y0, spec.y1, 0, spec.y1);
  const leftDepth = grooveDepthFor(spec.left.thickness, spec.left.through);
  const rightDepth = grooveDepthFor(spec.right.thickness, spec.right.through);
  return [
    {
      id: `${spec.backId}_tongue_L`,
      type: "back_tongue",
      targetBoardId: spec.backId,
      relatedBoardId: "SIDE_L",
      side: "left",
      y0: spec.y0,
      y1: spec.y1,
      z0: spec.tongueZ0,
      z1: spec.tongueZ1,
      insertionDepth: tongueStickOut(spec.left.thickness, spec.left.through),
      source: "back_joinery"
    },
    {
      id: `${spec.backId}_tongue_R`,
      type: "back_tongue",
      targetBoardId: spec.backId,
      relatedBoardId: "SIDE_R",
      side: "right",
      y0: spec.y0,
      y1: spec.y1,
      z0: spec.tongueZ0,
      z1: spec.tongueZ1,
      insertionDepth: tongueStickOut(spec.right.thickness, spec.right.through),
      source: "back_joinery"
    },
    {
      id: `SIDE_L_${spec.backId}_groove`,
      type: "side_groove",
      targetBoardId: "SIDE_L",
      relatedBoardId: spec.backId,
      side: "left",
      y0: grooveY0,
      y1: grooveY1,
      z0: grooveZ0,
      z1: grooveZ1,
      depth: leftDepth,
      through: spec.left.through,
      source: "back_joinery"
    },
    {
      id: `SIDE_R_${spec.backId}_groove`,
      type: "side_groove",
      targetBoardId: "SIDE_R",
      relatedBoardId: spec.backId,
      side: "right",
      y0: grooveY0,
      y1: grooveY1,
      z0: grooveZ0,
      z1: grooveZ1,
      depth: rightDepth,
      through: spec.right.through,
      source: "back_joinery"
    }
  ];
}
function attachSideGrooveProfileFeatures(side, features) {
  const grooves = features.filter(
    (feature) => feature.type === "side_groove" && feature.targetBoardId === side.id
  );
  if (!grooves.length) return;
  side.profileFeatures = [
    ...side.profileFeatures || [],
    ...grooves.map((groove) => ({
      id: groove.id,
      type: "side_groove",
      y0: groove.y0,
      y1: groove.y1,
      z0: groove.z0,
      z1: groove.z1,
      depth: groove.depth,
      relatedBoardId: groove.relatedBoardId,
      source: groove.source
    }))
  ];
}
function applyShelfBackTongue(shelf, bodyX0, bodyX1, backThickness, sideZ1) {
  const stick = tongueStickOut(backThickness, false);
  const yBody = round13(shelf.y1);
  const { a0, a1 } = centeredThirdRange(bodyX0, bodyX1);
  const pts = shelf.profileVector || [];
  const next = [];
  for (let i = 0; i < pts.length; i += 1) {
    const p = pts[i];
    next.push(p);
    const q = pts[(i + 1) % pts.length];
    if (!("x" in p) || !("y" in p) || !("x" in q) || !("y" in q)) continue;
    if (Math.abs(p.y - yBody) < 0.05 && Math.abs(q.y - yBody) < 0.05 && p.x > q.x) {
      next.push({ x: a1, y: yBody }, { x: a1, y: round13(yBody + stick) }, { x: a0, y: round13(yBody + stick) }, { x: a0, y: yBody });
    }
  }
  shelf.profileVector = next;
  shelf.y1 = round13(yBody + stick);
  const { g0, g1 } = grooveCrossSpan(shelf.z0, shelf.z1, 0, sideZ1);
  return {
    id: `BACK_${shelf.id}_groove`,
    type: "side_groove",
    targetBoardId: "BACK",
    relatedBoardId: shelf.id,
    x0: round13(a0 - GROOVE_LENGTH_OVERSIZE),
    x1: round13(a1 + GROOVE_LENGTH_OVERSIZE),
    z0: g0,
    z1: g1,
    depth: grooveDepthFor(backThickness, false),
    through: false,
    source: "shelf_back_joinery"
  };
}
function sideOutlineWithGrooves(depth, height, grooves) {
  const bot = grooves.filter((g) => g.through && (g.z0 ?? 0) <= 0.05).sort((a, b) => (a.y0 ?? 0) - (b.y0 ?? 0));
  const back = grooves.filter((g) => g.through && (g.y1 ?? 0) >= depth - 0.05 && (g.z0 ?? 0) > 0.05 && (g.z1 ?? 0) < height - 0.05).sort((a, b) => (a.z0 ?? 0) - (b.z0 ?? 0));
  const top = grooves.filter((g) => g.through && (g.z1 ?? 0) >= height - 0.05).sort((a, b) => (b.y0 ?? 0) - (a.y0 ?? 0));
  const pts = [];
  const push = (y, z) => {
    const last = pts[pts.length - 1];
    if (last && Math.abs((last.y ?? 0) - y) < 1e-6 && Math.abs((last.z ?? 0) - z) < 1e-6) return;
    pts.push({ y: round13(y), z: round13(z) });
  };
  push(0, 0);
  for (const n of bot) {
    push(n.y0 ?? 0, 0);
    push(n.y0 ?? 0, n.z1 ?? 0);
    push(n.y1 ?? 0, n.z1 ?? 0);
    push(n.y1 ?? 0, 0);
  }
  push(depth, 0);
  for (const n of back) {
    push(depth, n.z0 ?? 0);
    push(n.y0 ?? 0, n.z0 ?? 0);
    push(n.y0 ?? 0, n.z1 ?? 0);
    push(depth, n.z1 ?? 0);
  }
  push(depth, height);
  for (const n of top) {
    push(n.y1 ?? 0, height);
    push(n.y1 ?? 0, n.z0 ?? 0);
    push(n.y0 ?? 0, n.z0 ?? 0);
    push(n.y0 ?? 0, height);
  }
  push(0, height);
  push(0, 0);
  return pts;
}
function applyHorizontalJoinery(board, left, right, sideY1, sideZ1) {
  const spec = buildShelfTongueSpec(board, left, right);
  applyShelfTongues(board, spec);
  return buildShelfJoineryFeatures(spec, sideY1, sideZ1);
}
function applyBackJoinery(board, left, right, sideZ1) {
  const spec = buildBackTongueSpec(board, left, right);
  applyBackTongues(board, spec);
  return buildBackJoineryFeatures(spec, sideZ1);
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
function grip(attrs, x1, y1, x2, y2, dashed = false) {
  const c = `x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}"`;
  return `<g class="boundary" ${attrs}><line ${c} stroke="${PV.boundary}" stroke-width="2"${dashed ? ` stroke-dasharray="6 4"` : ""} /><line class="hit" ${c} stroke="transparent" stroke-width="12" pointer-events="stroke" /></g>`;
}
function svgRoot(width, height, data, aria, body) {
  const d = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}" ${d} font-family="${PV.font}"><rect x="0" y="0" width="${width}" height="${height}" fill="${PV.bg}" />` + body + `</svg>`;
}

// generators/smallCabinet/svgPreview.ts
var LABELS = {
  left_door: "Door \xB7 hinge left",
  right_door: "Door \xB7 hinge right",
  drawer: "Drawer"
};
function generateSmallCabinetSvgPreview(result, options = {}) {
  if (!result?.boards?.length) return null;
  const W = result.params.cabinetWidth;
  const H = result.params.cabinetHeight;
  const zones = result.zones || [];
  if (!(W > 0) || !(H > 0) || !zones.length) return null;
  const width = options.width ?? 520;
  const selected = options.selectedZoneId ?? null;
  const scale = Math.min((width - 64) / W, ((options.maxHeight ?? 520) - 42) / H);
  const ox = 48;
  const oy = 14;
  const height = Math.ceil(oy + H * scale + 28);
  const toX = (x) => ox + x * scale;
  const toY = (z) => oy + (H - z) * scale;
  const rect = (x0, x1, z0, z1) => `x="${px(toX(x0))}" y="${px(toY(z1))}" width="${px(Math.max((x1 - x0) * scale, 0.8))}" height="${px(Math.max((z1 - z0) * scale, 0.8))}"`;
  const parts = [];
  for (const z of zones) {
    parts.push(`<rect class="region" data-zone="${z.id}" ${rect(0, W, z.zBottom, z.zTop)} fill="${zoneColor(z.type)}" stroke="none" />`);
  }
  const boards = [...result.boards].sort((a, b) => b.y0 - a.y0);
  for (const b of boards) {
    const r = frontRect(b);
    if (!r || r.x1 - r.x0 < 0.1 || r.z1 - r.z0 < 0.1) continue;
    const door = b.category === "front_panel";
    parts.push(`<rect ${rect(r.x0, r.x1, r.z0, r.z1)} fill="${door ? PV.front : PV.carcass}" fill-opacity="${door ? 0.45 : 0.92}" stroke="${door ? PV.frontLine : PV.carcassLine}" stroke-width="0.6" pointer-events="none" />`);
  }
  for (const z of zones) {
    const h = (z.zTop - z.zBottom) * scale;
    if (h < 14) continue;
    const name = LABELS[z.type] ?? z.type;
    const cx = toX(W / 2);
    const cy = toY((z.zTop + z.zBottom) / 2);
    parts.push(label(cx, cy, h >= 28 ? name : `${name} \xB7 ${fmt(z.height)}`, { size: 11 }));
    if (h >= 28) parts.push(label(cx, cy + 14, fmt(z.height), { size: 10, fill: PV.text2 }));
    if (z.id === selected) parts.push(`<rect ${rect(0, W, z.zBottom, z.zTop)} fill="none" stroke="${PV.select}" stroke-width="2" pointer-events="none" />`);
  }
  parts.push(`<rect ${rect(0, W, 0, H)} fill="none" stroke="${PV.envelope}" stroke-width="1.25" pointer-events="none" />`);
  for (let i = 0; i < zones.length - 1; i += 1) {
    const z = zones[i].zBottom;
    parts.push(grip(`data-boundary="zone" data-axis="z" data-index="${i}"`, toX(0), toY(z), toX(W), toY(z)));
  }
  return svgRoot(width, height, { scale, ox, oy, h: H, w: W }, "Small cabinet front", parts.join(""));
}

// generators/smallCabinet/generator.ts
var DEFAULT_CPT = 16;
var DEFAULT_FPT = 16;
var DEFAULT_CLEARANCE = 2.5;
var DEFAULT_LOCK_SIDE_DISTANCE = 80;
var DEFAULT_CARCASS_COLOR = "White Stipple";
var LOCK_SLOT_LENGTH = 55;
var LOCK_SLOT_WIDTH = 15.5;
var LOCK_SLOT_RADIUS = 7.75;
function round14(value) {
  return Math.round(value * 10) / 10;
}
function asNum(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}
function normalizeZoneType(raw) {
  const t = String(raw || "").trim().toLowerCase();
  if (t === "left_door" || t === "left-door" || t === "left") return "left_door";
  if (t === "right_door" || t === "right-door" || t === "right") return "right_door";
  if (t === "drawer" || t === "draw") return "drawer";
  return null;
}
function rectProfile(plane, a0, a1, b0, b1) {
  const w = Math.max(0, a1 - a0);
  const h = Math.max(0, b1 - b0);
  if (plane === "YZ") {
    return [
      { y: 0, z: 0 },
      { y: w, z: 0 },
      { y: w, z: h },
      { y: 0, z: h },
      { y: 0, z: 0 }
    ];
  }
  if (plane === "XZ") {
    return [
      { x: 0, z: 0 },
      { x: w, z: 0 },
      { x: w, z: h },
      { x: 0, z: h },
      { x: 0, z: 0 }
    ];
  }
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
    { x: 0, y: 0 }
  ];
}
function pushBoard(boards, board) {
  boards.push(board);
}
function lockCutoutFromCenter(centerX, centerZ) {
  const width = LOCK_SLOT_WIDTH;
  const height = LOCK_SLOT_LENGTH;
  return {
    x0: round14(centerX - width / 2),
    x1: round14(centerX + width / 2),
    z0: round14(centerZ - height / 2),
    z1: round14(centerZ + height / 2),
    radius: LOCK_SLOT_RADIUS,
    orientation: "vertical"
  };
}
function emptyParamsResult(params, W, D, H, CPT, FPT, clearance, locksEnabled, lockSideDistance, leftSideDoorColor, rightSideDoorColor, carcassColor, carcassColorName, errors, warnings) {
  return {
    params: {
      cabinetWidth: W,
      cabinetDepth: D,
      cabinetHeight: H,
      panelThickness: CPT,
      frontPanelThickness: FPT,
      frontClearance: clearance,
      locksEnabled,
      lockSideDistance,
      carcassColor,
      carcassColorName,
      leftSideDoorColor,
      rightSideDoorColor
    },
    zones: [],
    boards: [],
    features: [],
    joints: [],
    validation: { errors, warnings }
  };
}
function generateSmallCabinet(params) {
  const errors = [];
  const warnings = [];
  const W = round14(asNum(params.cabinetWidth));
  const D = round14(asNum(params.cabinetDepth));
  const H = round14(asNum(params.cabinetHeight));
  const CPT = round14(asNum(params.panelThickness, DEFAULT_CPT));
  const FPT = round14(asNum(params.frontPanelThickness, DEFAULT_FPT));
  const clearance = round14(asNum(params.frontClearance, DEFAULT_CLEARANCE));
  const locksEnabled = params.locksEnabled !== false;
  const defaultLockSideDistance = round14(asNum(params.lockSideDistance, DEFAULT_LOCK_SIDE_DISTANCE));
  const leftSideDoorColor = Boolean(params.leftSideDoorColor);
  const rightSideDoorColor = Boolean(params.rightSideDoorColor);
  const carcassColor = String(params.carcassColor || DEFAULT_CARCASS_COLOR).trim() || DEFAULT_CARCASS_COLOR;
  const carcassColorName = String(params.carcassColorName || carcassColor).trim() || carcassColor;
  if (W <= 0) errors.push("cabinetWidth must be > 0.");
  if (D <= 0) errors.push("cabinetDepth must be > 0.");
  if (H <= 0) errors.push("cabinetHeight must be > 0.");
  if (CPT <= 0) errors.push("panelThickness must be > 0.");
  if (FPT <= 0) errors.push("frontPanelThickness must be > 0.");
  if (clearance < 0) errors.push("frontClearance must be >= 0.");
  if (W <= 2 * CPT) errors.push("cabinetWidth must be greater than 2 \xD7 panelThickness.");
  if (D <= CPT) errors.push("cabinetDepth must be greater than panelThickness.");
  if (H <= 2 * CPT) errors.push("cabinetHeight must be greater than 2 \xD7 panelThickness.");
  const interiorH = round14(H - 2 * CPT);
  const rawZones = Array.isArray(params.zones) ? params.zones : [];
  if (rawZones.length < 1) {
    errors.push("At least one functional zone is required.");
  }
  const parsed = [];
  for (let i = 0; i < rawZones.length; i += 1) {
    const zone = rawZones[i];
    const type = normalizeZoneType(zone?.type);
    const height = round14(asNum(zone?.height));
    if (!type) {
      errors.push(`Zone ${i + 1}: unsupported type "${zone?.type}". Use left_door, right_door, or drawer.`);
      continue;
    }
    if (height <= 0) {
      errors.push(`Zone ${i + 1}: height must be > 0.`);
      continue;
    }
    const isDoor = type === "left_door" || type === "right_door";
    parsed.push({
      id: String(zone?.id || `zone-${i + 1}`),
      type,
      height,
      lockEnabled: isDoor && locksEnabled && zone?.lockEnabled !== false,
      lockSideDistance: round14(asNum(zone?.lockSideDistance, defaultLockSideDistance))
    });
  }
  const zoneHeightSum = round14(parsed.reduce((sum, z) => sum + z.height, 0));
  if (parsed.length > 0 && Math.abs(zoneHeightSum - interiorH) > 0.05) {
    errors.push(
      `Zone heights sum to ${zoneHeightSum} mm but interior height is ${interiorH} mm (cabinetHeight \u2212 2\xD7CPT).`
    );
  }
  if (errors.length > 0) {
    return emptyParamsResult(
      params,
      W,
      D,
      H,
      CPT,
      FPT,
      clearance,
      locksEnabled,
      defaultLockSideDistance,
      leftSideDoorColor,
      rightSideDoorColor,
      carcassColor,
      carcassColorName,
      errors,
      warnings
    );
  }
  const boards = [];
  const features = [];
  const resolvedZones = [];
  const leftThick = leftSideDoorColor ? FPT : CPT;
  const rightThick = rightSideDoorColor ? FPT : CPT;
  const leftJoin = { thickness: leftThick, through: !leftSideDoorColor };
  const rightJoin = { thickness: rightThick, through: !rightSideDoorColor };
  const shelfY1 = round14(D - CPT);
  pushBoard(boards, {
    id: "SIDE_L",
    name: "Left side",
    category: "side_panel",
    boardType: "left_side_panel",
    materialThickness: leftThick,
    profilePlane: "YZ",
    thicknessAxis: "X",
    x0: 0,
    x1: leftThick,
    y0: 0,
    y1: D,
    z0: 0,
    z1: H,
    useDoorColor: leftSideDoorColor,
    profileVector: rectProfile("YZ", 0, D, 0, H)
  });
  pushBoard(boards, {
    id: "SIDE_R",
    name: "Right side",
    category: "side_panel",
    boardType: "right_side_panel",
    materialThickness: rightThick,
    profilePlane: "YZ",
    thicknessAxis: "X",
    x0: W - rightThick,
    x1: W,
    y0: 0,
    y1: D,
    z0: 0,
    z1: H,
    useDoorColor: rightSideDoorColor,
    profileVector: rectProfile("YZ", 0, D, 0, H)
  });
  const bottom = {
    id: "BOTTOM",
    name: "Bottom",
    category: "horizontal",
    boardType: "bottom_panel",
    materialThickness: CPT,
    profilePlane: "XY",
    thicknessAxis: "Z",
    x0: leftThick,
    x1: W - rightThick,
    y0: 0,
    y1: shelfY1,
    z0: 0,
    z1: CPT,
    profileVector: rectProfile("XY", leftThick, W - rightThick, 0, shelfY1)
  };
  const top = {
    id: "TOP",
    name: "Top",
    category: "horizontal",
    boardType: "top_panel",
    materialThickness: CPT,
    profilePlane: "XY",
    thicknessAxis: "Z",
    x0: leftThick,
    x1: W - rightThick,
    y0: 0,
    y1: shelfY1,
    z0: H - CPT,
    z1: H,
    profileVector: rectProfile("XY", leftThick, W - rightThick, 0, shelfY1)
  };
  features.push(...applyHorizontalJoinery(bottom, leftJoin, rightJoin, D, H));
  features.push(...applyHorizontalJoinery(top, leftJoin, rightJoin, D, H));
  pushBoard(boards, bottom);
  pushBoard(boards, top);
  const back = {
    id: "BACK",
    name: "Rear vertical",
    category: "back_panel",
    boardType: "rear_vertical",
    materialThickness: CPT,
    profilePlane: "XZ",
    thicknessAxis: "Y",
    x0: leftThick,
    x1: W - rightThick,
    y0: shelfY1,
    y1: D,
    z0: 0,
    z1: H,
    profileVector: rectProfile("XZ", leftThick, W - rightThick, 0, H)
  };
  features.push(...applyBackJoinery(back, leftJoin, rightJoin, H));
  pushBoard(boards, back);
  let zCursor = H - CPT;
  for (let i = 0; i < parsed.length; i += 1) {
    const zone = parsed[i];
    const zTop = zCursor;
    const zBottom = round14(zCursor - zone.height);
    const hasMiddleAbove = i > 0;
    const hasMiddleBelow = i < parsed.length - 1;
    const clearZ1 = round14(zTop - (hasMiddleAbove ? CPT / 2 : 0));
    const clearZ0 = round14(zBottom + (hasMiddleBelow ? CPT / 2 : 0));
    resolvedZones.push({
      id: zone.id,
      type: zone.type,
      height: zone.height,
      zTop,
      zBottom,
      clearZ0,
      clearZ1,
      lockEnabled: zone.lockEnabled,
      lockSideDistance: zone.lockSideDistance
    });
    zCursor = zBottom;
  }
  for (let i = 0; i < resolvedZones.length - 1; i += 1) {
    const boundaryZ = resolvedZones[i].zBottom;
    const z0 = round14(boundaryZ - CPT / 2);
    const z1 = round14(boundaryZ + CPT / 2);
    const mid = {
      id: `MID_${i + 1}`,
      name: `Middle ${i + 1}`,
      category: "horizontal",
      boardType: "middle_shelf",
      materialThickness: CPT,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: leftThick,
      x1: W - rightThick,
      y0: 0,
      y1: shelfY1,
      z0,
      z1,
      notes: [`Centered on boundary between ${resolvedZones[i].id} and ${resolvedZones[i + 1].id}`],
      profileVector: rectProfile("XY", leftThick, W - rightThick, 0, shelfY1)
    };
    features.push(...applyHorizontalJoinery(mid, leftJoin, rightJoin, D, H));
    pushBoard(boards, mid);
  }
  for (const shelf of boards.filter((b) => b.category === "horizontal")) {
    features.push(applyShelfBackTongue(shelf, leftThick, W - rightThick, CPT, H));
  }
  for (const side of boards.filter((b) => b.id === "SIDE_L" || b.id === "SIDE_R")) {
    const grooves = features.filter((f) => f.type === "side_groove" && f.targetBoardId === side.id);
    side.profileVector = sideOutlineWithGrooves(D, H, grooves);
    attachSideGrooveProfileFeatures(side, features);
  }
  for (let i = 0; i < resolvedZones.length; i += 1) {
    const zone = resolvedZones[i];
    const bounds = computeFrontPanelBounds({
      cabinetWidth: W,
      cabinetHeight: H,
      panelThickness: CPT,
      frontClearance: clearance,
      zone,
      zoneIndex: i,
      zones: resolvedZones
    });
    if (!frontPanelIsValid(bounds)) {
      errors.push(`Zone ${zone.id}: front panel degenerates after clearance.`);
      continue;
    }
    let boardType;
    let hingeSide;
    if (zone.type === "left_door") {
      boardType = "left_door";
      hingeSide = "left";
    } else if (zone.type === "right_door") {
      boardType = "right_door";
      hingeSide = "right";
    } else {
      boardType = "drawer_front";
    }
    const front = {
      id: `FP_${i + 1}`,
      name: `Front ${i + 1} (${zone.type})`,
      category: "front_panel",
      boardType,
      materialThickness: FPT,
      profilePlane: "XZ",
      thicknessAxis: "Y",
      x0: bounds.x0,
      x1: bounds.x1,
      y0: -FPT,
      y1: 0,
      z0: bounds.z0,
      z1: bounds.z1,
      hingeSide,
      zoneId: zone.id,
      notes: [`clearance ${bounds.sources.z0}/${bounds.sources.z1}`],
      profileVector: rectProfile("XZ", bounds.x0, bounds.x1, bounds.z0, bounds.z1)
    };
    if (zone.lockEnabled && hingeSide) {
      const handleIsRight = hingeSide === "left";
      const inset = zone.lockSideDistance;
      let centerX = handleIsRight ? front.x1 - inset : front.x0 + inset;
      let centerZ = front.z1 - inset;
      const halfW = LOCK_SLOT_WIDTH / 2;
      const halfH = LOCK_SLOT_LENGTH / 2;
      centerX = Math.max(front.x0 + halfW, Math.min(front.x1 - halfW, centerX));
      centerZ = Math.max(front.z0 + halfH, Math.min(front.z1 - halfH, centerZ));
      front.lockCutout = lockCutoutFromCenter(centerX, centerZ);
      front.thickness = FPT;
      features.push({
        id: `${front.id}_door_lock`,
        type: "door_lock",
        targetBoardId: front.id,
        x0: front.lockCutout.x0,
        x1: front.lockCutout.x1,
        z0: front.lockCutout.z0,
        z1: front.lockCutout.z1,
        source: "door_lock"
      });
      front.profileFeatures = [
        {
          id: `${front.id}_door_lock`,
          type: "door_lock",
          thickness: FPT,
          ...front.lockCutout
        }
      ];
    }
    pushBoard(boards, front);
  }
  if (errors.length > 0) {
    return emptyParamsResult(
      params,
      W,
      D,
      H,
      CPT,
      FPT,
      clearance,
      locksEnabled,
      defaultLockSideDistance,
      leftSideDoorColor,
      rightSideDoorColor,
      carcassColor,
      carcassColorName,
      errors,
      warnings
    );
  }
  attachFaces(boards);
  const doorColorName = params.doorColorName || params.doorColor;
  const joints = buildSmallCabinetFaces({
    boards,
    features,
    panelThickness: CPT,
    carcassColorName,
    doorColorName: doorColorName ? String(doorColorName) : void 0,
    params
  });
  const grain = applyGrain(
    boards,
    (b) => b.category === "front_panel" ? "front" : (b.id === "SIDE_L" || b.id === "SIDE_R") && b.useDoorColor ? "side" : null,
    params,
    { front: "horizontal", side: "horizontal" }
  );
  applyDoorSides(boards, { ...params, carcassColorName });
  const milling = applyMilling(boards);
  return {
    grain,
    milling,
    params: {
      cabinetWidth: W,
      cabinetDepth: D,
      cabinetHeight: H,
      panelThickness: CPT,
      frontPanelThickness: FPT,
      frontClearance: clearance,
      locksEnabled,
      lockSideDistance: defaultLockSideDistance,
      carcassColor,
      carcassColorName,
      leftSideDoorColor,
      rightSideDoorColor
    },
    zones: resolvedZones,
    boards,
    features,
    joints,
    validation: { errors, warnings },
    debug: {
      interiorHeight: interiorH,
      zoneHeightSum,
      boardCounts: {
        sides: 2,
        back: 1,
        top: 1,
        bottom: 1,
        middles: Math.max(0, resolvedZones.length - 1),
        fronts: resolvedZones.length,
        total: boards.length
      },
      featureCounts: {
        shelfTongues: features.filter((f) => f.type === "shelf_tongue").length,
        backTongues: features.filter((f) => f.type === "back_tongue").length,
        sideGrooves: features.filter((f) => f.type === "side_groove").length,
        doorLocks: features.filter((f) => f.type === "door_lock").length
      },
      frontFaceAllowance: FPT,
      spec: {
        form: "simple_floor_box",
        rearJoin: "tongue_height_1_3",
        middleAnchor: "center_on_boundary",
        shelfJoinery: "tongue_depth_1_3_through_groove_plus5_plus0_5",
        zoneTypes: ["left_door", "right_door", "drawer"]
      }
    }
  };
}
export {
  GROOVE_LENGTH_OVERSIZE,
  GROOVE_THICKNESS_OVERSIZE,
  GROOVE_Y_OVERSIZE,
  GROOVE_Z_OVERSIZE,
  computeFrontPanelBounds,
  generateSmallCabinet,
  generateSmallCabinetSvgPreview,
  shelfTongueYRange
};
