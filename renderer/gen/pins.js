// Generated from generators/_lib/pins.ts - do not edit.

// generators/_lib/pins.ts
var PIN_TOL_MM = 0.01;
var FACE_FEATURE_FIELDS = ["u0", "u1", "v0", "v1", "diameter", "depth", "radius"];
function faceFeatureValues(f, rounder = (v) => v) {
  const out = {};
  for (const k of FACE_FEATURE_FIELDS) {
    const v = f[k];
    if (typeof v === "number" && Number.isFinite(v)) out[k] = rounder(v);
  }
  const c = f.center;
  if (Array.isArray(c) && c.length === 2 && Number.isFinite(c[0]) && Number.isFinite(c[1])) {
    out.cx = rounder(Number(c[0]));
    out.cy = rounder(Number(c[1]));
  }
  return Object.keys(out).length ? out : null;
}
function faceFeaturesOf(result) {
  const out = /* @__PURE__ */ new Map();
  for (const b of result.boards) {
    for (const face of b.faces ?? []) {
      for (const f of face.features ?? []) {
        const vals = faceFeatureValues(f);
        if (vals) out.set(`${b.id}.${face.id}.${String(f.id)}`, vals);
      }
    }
  }
  return out;
}
var FACES = ["x0", "x1", "y0", "y1", "z0", "z1"];
function planeAxes(plane) {
  if (plane === "YZ") return ["y", "z"];
  if (plane === "XZ") return ["x", "z"];
  return ["x", "y"];
}
function round(v) {
  return Math.round(v * 1e3) / 1e3;
}
function collectPins(result) {
  const pins = { boards: {}, points: {}, features: {}, faceFeatures: {} };
  for (const b of result.boards) {
    pins.boards[b.id] = { x0: round(b.x0), x1: round(b.x1), y0: round(b.y0), y1: round(b.y1), z0: round(b.z0), z1: round(b.z1) };
    if (b.cutProfileVector && b.cutProfileVector.length) {
      pins.points[`${b.id}.cut`] = b.cutProfileVector.map((p) => [round(p.y), round(p.z)]);
    }
    if (b.profileVector && b.profileVector.length) {
      const [a, c] = planeAxes(b.profilePlane);
      pins.points[`${b.id}.pv`] = b.profileVector.map((p) => [round(Number(p[a])), round(Number(p[c]))]);
    }
  }
  for (const f of result.features ?? []) {
    const h = f;
    if (h && h.purpose === "hinge" && h.boardId && h.center) {
      const n = String(h.id).replace(`${h.boardId}_`, "");
      pins.features[`${h.boardId}.${n}`] = { x: round(h.center[0]), z: round(h.center[1]) };
    }
  }
  for (const [key, vals] of faceFeaturesOf(result)) {
    const rounded = {};
    for (const [k, v] of Object.entries(vals)) rounded[k] = round(v);
    pins.faceFeatures[key] = rounded;
  }
  if (result.zones && result.zones.length) {
    pins.zones = {};
    for (const z of result.zones) pins.zones[z.id] = { x0: round(z.x0), x1: round(z.x1), y0: round(z.y0), y1: round(z.y1), z0: round(z.z0), z1: round(z.z1) };
  }
  return pins;
}
function pinsForBoard(result, boardId) {
  const all = collectPins(result);
  const out = { boards: {}, points: {}, features: {}, faceFeatures: {} };
  if (all.boards?.[boardId]) out.boards[boardId] = all.boards[boardId];
  for (const [k, v] of Object.entries(all.points ?? {})) if (k.startsWith(`${boardId}.`)) out.points[k] = v;
  for (const [k, v] of Object.entries(all.features ?? {})) if (k.startsWith(`${boardId}.`)) out.features[k] = v;
  for (const [k, v] of Object.entries(all.faceFeatures ?? {})) if (k.startsWith(`${boardId}.`)) out.faceFeatures[k] = v;
  return out;
}
function mergePins(base, add) {
  return {
    boards: { ...base.boards ?? {}, ...add.boards ?? {} },
    points: { ...base.points ?? {}, ...add.points ?? {} },
    features: { ...base.features ?? {}, ...add.features ?? {} },
    faceFeatures: { ...base.faceFeatures ?? {}, ...add.faceFeatures ?? {} },
    ...base.zones || add.zones ? { zones: { ...base.zones ?? {}, ...add.zones ?? {} } } : {}
  };
}
function checkPins(result, pins, tol = PIN_TOL_MM) {
  const out = [];
  const byId = new Map(result.boards.map((b) => [b.id, b]));
  const near = (a, b) => a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;
  for (const [id, faces] of Object.entries(pins.boards ?? {})) {
    const b = byId.get(id);
    if (!b) {
      out.push({ path: id, expected: null, actual: null });
      continue;
    }
    for (const f of FACES) {
      if (!near(faces[f], b[f])) out.push({ path: `${id}.${f}`, expected: faces[f], actual: b[f] });
    }
  }
  const zoneById = new Map((result.zones ?? []).map((z) => [z.id, z]));
  for (const [id, faces] of Object.entries(pins.zones ?? {})) {
    const z = zoneById.get(id);
    if (!z) {
      out.push({ path: `zone ${id}`, expected: null, actual: null });
      continue;
    }
    for (const f of FACES) {
      if (!near(faces[f], z[f])) out.push({ path: `zone ${id}.${f}`, expected: faces[f], actual: z[f] });
    }
  }
  for (const [key, expected] of Object.entries(pins.points ?? {})) {
    const dot = key.lastIndexOf(".");
    const id = key.slice(0, dot);
    const which = key.slice(dot + 1);
    const b = byId.get(id);
    let actual = null;
    if (b && which === "cut" && b.cutProfileVector) actual = b.cutProfileVector.map((p) => [p.y, p.z]);
    if (b && which === "pv" && b.profileVector) {
      const [a, c] = planeAxes(b.profilePlane);
      actual = b.profileVector.map((p) => [Number(p[a]), Number(p[c])]);
    }
    if (!actual) {
      out.push({ path: key, expected: expected.length, actual: null });
      continue;
    }
    if (actual.length !== expected.length) {
      out.push({ path: `${key}.length`, expected: expected.length, actual: actual.length });
      continue;
    }
    expected.forEach((pt, i) => {
      pt.forEach((v, k) => {
        if (!near(v, actual[i][k])) out.push({ path: `${key}[${i}][${k}]`, expected: v, actual: actual[i][k] ?? null });
      });
    });
  }
  const hinges = /* @__PURE__ */ new Map();
  for (const f of result.features ?? []) {
    const h = f;
    if (h && h.purpose === "hinge" && h.boardId && h.center) hinges.set(`${h.boardId}.${String(h.id).replace(`${h.boardId}_`, "")}`, h.center);
  }
  for (const [key, expected] of Object.entries(pins.features ?? {})) {
    const c = hinges.get(key);
    if (!c) {
      out.push({ path: key, expected: null, actual: null });
      continue;
    }
    if (!near(expected.x, c[0])) out.push({ path: `${key}.x`, expected: expected.x, actual: c[0] });
    if (!near(expected.z, c[1])) out.push({ path: `${key}.z`, expected: expected.z, actual: c[1] });
  }
  const faceFeatures = faceFeaturesOf(result);
  for (const [key, expected] of Object.entries(pins.faceFeatures ?? {})) {
    const actual = faceFeatures.get(key);
    if (!actual) {
      out.push({ path: key, expected: null, actual: null });
      continue;
    }
    for (const [field, v] of Object.entries(expected)) {
      if (!near(v, actual[field])) out.push({ path: `${key}.${field}`, expected: v, actual: actual[field] ?? null });
    }
  }
  return out;
}
function countPins(pins) {
  let n = 0;
  for (const f of Object.values(pins.boards ?? {})) n += Object.keys(f).length;
  for (const f of Object.values(pins.zones ?? {})) n += Object.keys(f).length;
  for (const pts of Object.values(pins.points ?? {})) n += pts.reduce((s, p) => s + p.length, 0);
  for (const f of Object.values(pins.features ?? {})) n += Object.keys(f).length;
  for (const f of Object.values(pins.faceFeatures ?? {})) n += Object.keys(f).length;
  return n;
}
export {
  PIN_TOL_MM,
  checkPins,
  collectPins,
  countPins,
  mergePins,
  pinsForBoard,
  planeAxes
};
