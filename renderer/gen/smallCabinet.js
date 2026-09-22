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
    z0 = round1(zone.clearZ0 + FC);
    z0Source = below ? "clear_plus_fc_open_neighbor" : "bottom_face_plus_fc";
  }
  let z1;
  let z1Source;
  if (above && zoneHasFront(above.type)) {
    z1 = round1(zone.zTop - FC / 2);
    z1Source = "mid_center_minus_half_fc";
  } else {
    z1 = round1(zone.clearZ1 - FC);
    z1Source = above ? "clear_minus_fc_open_neighbor" : "top_face_minus_fc";
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

// generators/smallCabinet/faces.ts
var EPS = 0.01;
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
    const side = B.get(f.targetBoardId);
    if (!side || f.y0 == null || f.y1 == null || f.z0 == null || f.z1 == null) continue;
    const faceId = side.id === "SIDE_L" ? "A" : "B";
    const r = localRect(side, { y: [f.y0, f.y1], z: [f.z0, f.z1] });
    addFeature(side, faceId, { id: f.id, kind: "groove", ...r, depth: f.depth, for: f.relatedBoardId, source: f.source });
  }
  const t = fb.panelThickness;
  for (const f of fb.features) {
    if (f.type !== "shelf_tongue" && f.type !== "back_tongue") continue;
    const b = B.get(f.targetBoardId);
    if (!b) continue;
    const width = b.x1 - b.x0;
    const uBox = f.side === "left" ? { u0: -EPS, u1: t - EPS } : { u0: width - t + EPS, u1: width + EPS };
    const vBox = f.type === "shelf_tongue" ? { v0: (f.y0 ?? 0) - b.y0 - EPS, v1: (f.y1 ?? 0) - b.y0 + EPS } : { v0: (f.z0 ?? 0) - b.z0 - EPS, v1: (f.z1 ?? 0) - b.z0 + EPS };
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
var GROOVE_THICKNESS_OVERSIZE = 0.5;
var GROOVE_Y_OVERSIZE = GROOVE_LENGTH_OVERSIZE;
var GROOVE_Z_OVERSIZE = GROOVE_THICKNESS_OVERSIZE;
function round12(value) {
  return Math.round(value * 10) / 10;
}
function centeredThirdRange(spanStart, spanEnd) {
  const span = spanEnd - spanStart;
  const length = span * SHELF_TONGUE_DEPTH_FRACTION;
  const a0 = round12(spanStart + (span - length) / 2);
  const a1 = round12(a0 + length);
  return { a0, a1 };
}
function shelfTongueYRange(shelfY0, shelfY1) {
  const { a0, a1 } = centeredThirdRange(shelfY0, shelfY1);
  return { tongueY0: a0, tongueY1: a1 };
}
function shelfProfileWithTongues(bodyX0, bodyX1, y0, y1, tongueLength, tongueY0, tongueY1) {
  const left = Math.max(0, tongueLength);
  const right = Math.max(0, tongueLength);
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
function backProfileWithTongues(bodyX0, bodyX1, z0, z1, tongueLength, tongueZ0, tongueZ1) {
  const left = Math.max(0, tongueLength);
  const right = Math.max(0, tongueLength);
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
function buildShelfTongueSpec(shelf, panelThickness) {
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
    // Through tongue so the side groove reads on the outer face.
    tongueLength: round12(panelThickness),
    z0: shelf.z0,
    z1: shelf.z1
  };
}
function buildBackTongueSpec(back, panelThickness) {
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
    tongueLength: round12(panelThickness)
  };
}
function applyShelfTongues(shelf, spec) {
  shelf.x0 = round12(spec.bodyX0 - spec.tongueLength);
  shelf.x1 = round12(spec.bodyX1 + spec.tongueLength);
  shelf.profileVector = shelfProfileWithTongues(
    spec.bodyX0,
    spec.bodyX1,
    spec.y0,
    spec.y1,
    spec.tongueLength,
    spec.tongueY0,
    spec.tongueY1
  );
  shelf.notes = [
    ...shelf.notes || [],
    `Tongues length=${spec.tongueLength} Y=${spec.tongueY0}..${spec.tongueY1} (depth/3, through)`
  ];
}
function applyBackTongues(back, spec) {
  back.x0 = round12(spec.bodyX0 - spec.tongueLength);
  back.x1 = round12(spec.bodyX1 + spec.tongueLength);
  back.profileVector = backProfileWithTongues(
    spec.bodyX0,
    spec.bodyX1,
    spec.z0,
    spec.z1,
    spec.tongueLength,
    spec.tongueZ0,
    spec.tongueZ1
  );
  back.notes = [
    ...back.notes || [],
    `Tongues length=${spec.tongueLength} Z=${spec.tongueZ0}..${spec.tongueZ1} (height/3, through)`
  ];
}
function buildShelfJoineryFeatures(spec) {
  const grooveY0 = round12(spec.tongueY0 - GROOVE_LENGTH_OVERSIZE);
  const grooveY1 = round12(spec.tongueY1 + GROOVE_LENGTH_OVERSIZE);
  const grooveZ0 = round12(spec.z0 - GROOVE_THICKNESS_OVERSIZE);
  const grooveZ1 = round12(spec.z1 + GROOVE_THICKNESS_OVERSIZE);
  const depth = spec.tongueLength;
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
      insertionDepth: depth,
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
      insertionDepth: depth,
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
      depth,
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
      depth,
      source: "shelf_joinery"
    }
  ];
}
function buildBackJoineryFeatures(spec) {
  const grooveZ0 = round12(spec.tongueZ0 - GROOVE_LENGTH_OVERSIZE);
  const grooveZ1 = round12(spec.tongueZ1 + GROOVE_LENGTH_OVERSIZE);
  const grooveY0 = round12(spec.y0 - GROOVE_THICKNESS_OVERSIZE);
  const grooveY1 = round12(spec.y1 + GROOVE_THICKNESS_OVERSIZE);
  const depth = spec.tongueLength;
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
      insertionDepth: depth,
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
      insertionDepth: depth,
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
      depth,
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
      depth,
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
function applyHorizontalJoinery(board, panelThickness) {
  const spec = buildShelfTongueSpec(board, panelThickness);
  applyShelfTongues(board, spec);
  return buildShelfJoineryFeatures(spec);
}
function applyBackJoinery(board, panelThickness) {
  const spec = buildBackTongueSpec(board, panelThickness);
  applyBackTongues(board, spec);
  return buildBackJoineryFeatures(spec);
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
function round13(value) {
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
    x0: round13(centerX - width / 2),
    x1: round13(centerX + width / 2),
    z0: round13(centerZ - height / 2),
    z1: round13(centerZ + height / 2),
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
  const W = round13(asNum(params.cabinetWidth));
  const D = round13(asNum(params.cabinetDepth));
  const H = round13(asNum(params.cabinetHeight));
  const CPT = round13(asNum(params.panelThickness, DEFAULT_CPT));
  const FPT = round13(asNum(params.frontPanelThickness, DEFAULT_FPT));
  const clearance = round13(asNum(params.frontClearance, DEFAULT_CLEARANCE));
  const locksEnabled = params.locksEnabled !== false;
  const defaultLockSideDistance = round13(asNum(params.lockSideDistance, DEFAULT_LOCK_SIDE_DISTANCE));
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
  const interiorH = round13(H - 2 * CPT);
  const rawZones = Array.isArray(params.zones) ? params.zones : [];
  if (rawZones.length < 1) {
    errors.push("At least one functional zone is required.");
  }
  const parsed = [];
  for (let i = 0; i < rawZones.length; i += 1) {
    const zone = rawZones[i];
    const type = normalizeZoneType(zone?.type);
    const height = round13(asNum(zone?.height));
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
      lockSideDistance: round13(asNum(zone?.lockSideDistance, defaultLockSideDistance))
    });
  }
  const zoneHeightSum = round13(parsed.reduce((sum, z) => sum + z.height, 0));
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
  pushBoard(boards, {
    id: "SIDE_L",
    name: "Left side",
    category: "side_panel",
    boardType: "left_side_panel",
    materialThickness: CPT,
    profilePlane: "YZ",
    thicknessAxis: "X",
    x0: 0,
    x1: CPT,
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
    materialThickness: CPT,
    profilePlane: "YZ",
    thicknessAxis: "X",
    x0: W - CPT,
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
    x0: CPT,
    x1: W - CPT,
    y0: 0,
    y1: D - CPT,
    z0: 0,
    z1: CPT,
    profileVector: rectProfile("XY", CPT, W - CPT, 0, D - CPT)
  };
  const top = {
    id: "TOP",
    name: "Top",
    category: "horizontal",
    boardType: "top_panel",
    materialThickness: CPT,
    profilePlane: "XY",
    thicknessAxis: "Z",
    x0: CPT,
    x1: W - CPT,
    y0: 0,
    y1: D - CPT,
    z0: H - CPT,
    z1: H,
    profileVector: rectProfile("XY", CPT, W - CPT, 0, D - CPT)
  };
  features.push(...applyHorizontalJoinery(bottom, CPT));
  features.push(...applyHorizontalJoinery(top, CPT));
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
    x0: CPT,
    x1: W - CPT,
    y0: D - CPT,
    y1: D,
    z0: CPT,
    z1: H - CPT,
    profileVector: rectProfile("XZ", CPT, W - CPT, CPT, H - CPT)
  };
  features.push(...applyBackJoinery(back, CPT));
  pushBoard(boards, back);
  let zCursor = H - CPT;
  for (let i = 0; i < parsed.length; i += 1) {
    const zone = parsed[i];
    const zTop = zCursor;
    const zBottom = round13(zCursor - zone.height);
    const hasMiddleAbove = i > 0;
    const hasMiddleBelow = i < parsed.length - 1;
    const clearZ1 = round13(zTop - (hasMiddleAbove ? CPT / 2 : 0));
    const clearZ0 = round13(zBottom + (hasMiddleBelow ? CPT / 2 : 0));
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
    const z0 = round13(boundaryZ - CPT / 2);
    const z1 = round13(boundaryZ + CPT / 2);
    const mid = {
      id: `MID_${i + 1}`,
      name: `Middle ${i + 1}`,
      category: "horizontal",
      boardType: "middle_shelf",
      materialThickness: CPT,
      profilePlane: "XY",
      thicknessAxis: "Z",
      x0: CPT,
      x1: W - CPT,
      y0: 0,
      y1: D - CPT,
      z0,
      z1,
      notes: [`Centered on boundary between ${resolvedZones[i].id} and ${resolvedZones[i + 1].id}`],
      profileVector: rectProfile("XY", CPT, W - CPT, 0, D - CPT)
    };
    features.push(...applyHorizontalJoinery(mid, CPT));
    pushBoard(boards, mid);
  }
  const sideL = boards.find((b) => b.id === "SIDE_L");
  const sideR = boards.find((b) => b.id === "SIDE_R");
  if (sideL) attachSideGrooveProfileFeatures(sideL, features);
  if (sideR) attachSideGrooveProfileFeatures(sideR, features);
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
  return {
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
  shelfTongueYRange
};
