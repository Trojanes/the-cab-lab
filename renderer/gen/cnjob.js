// Generated from generators/_lib/cnjob.ts - do not edit.

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

// generators/_lib/material.ts
var UNGRAINED_HPL = /* @__PURE__ */ new Set(["Felt Grey"]);
function decorSlug(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function thicknessToken(mm) {
  const r = Math.round(mm * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r);
}
function seriesOf(board, params) {
  if (board.stock?.kind === "bench") return "hpl";
  if (board.stock?.kind === "door") return params && params.doorSeries === "hpl" ? "hpl" : "acrylic";
  return "pvc";
}
function colourFace(board, carcass) {
  const faces = (board.faces ?? []).filter((f) => (f.id === "A" || f.id === "B") && f.finish?.colour && f.finish.colour !== carcass);
  return faces.find((f) => f.visible === true) ?? faces[0];
}
function thicknessOf(board) {
  const t = board.stock?.thickness;
  return typeof t === "number" && Number.isFinite(t) ? t : board.materialThickness;
}
function sheetMaterial(board, params) {
  const series = seriesOf(board, params);
  const carcass = carcassColourOf(params);
  const colorName = series === "pvc" ? carcass : colourFace(board, carcass)?.finish?.colour || doorColourOf(params);
  const single = series !== "pvc" && (board.stock?.sides === 1 || board.stock?.sides !== 2 && doorSidesOf(params) === "single");
  const surfaceMode = single ? "SINGLE_SIDED" : "DOUBLE_SIDED";
  const sides = single ? "1s" : "2s";
  const thicknessMm = thicknessOf(board);
  return {
    materialId: `${series}-${decorSlug(colorName)}-${sides}-${thicknessToken(thicknessMm)}`,
    thicknessMm,
    colorName,
    surfaceMode,
    series,
    grained: series === "hpl" && !UNGRAINED_HPL.has(colorName)
  };
}

// generators/_lib/edgeBand.ts
function cnjobEdgeBands(_board) {
  return [];
}

// generators/_lib/cnjob.ts
var CNJOB_SCHEMA = "cabinetnc.manufacturing-snapshot";
var CNJOB_VERSION = "1.1.0";
var PRODUCER = "the-cab-lab";
var PRODUCER_VERSION = "0.2.0";
var r3 = (n) => Math.round(n * 1e3) / 1e3;
var ARC_STEPS = 4;
function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}
function dedupe(pts) {
  const out = [];
  for (const p of pts) {
    const q = [r3(p[0]), r3(p[1])];
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev[0] - q[0]) < 1e-3 && Math.abs(prev[1] - q[1]) < 1e-3) continue;
    out.push(q);
  }
  if (out.length > 1) {
    const a = out[0];
    const b = out[out.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-3 && Math.abs(a[1] - b[1]) < 1e-3) out.pop();
  }
  return out;
}
function wind(pts, ccw) {
  const ring = dedupe(pts);
  if (ring.length < 3) return ring;
  const positive = signedArea(ring) > 0;
  return positive === ccw ? ring : ring.slice().reverse();
}
function roundedRect(u0, v0, u1, v1, radius) {
  const left = Math.min(u0, u1);
  const right = Math.max(u0, u1);
  const bottom = Math.min(v0, v1);
  const top = Math.max(v0, v1);
  const r = Math.min(Math.max(0, radius), (right - left) / 2, (top - bottom) / 2);
  if (r < 0.05) return [[left, bottom], [right, bottom], [right, top], [left, top]];
  const corner = (cx, cy, a0, a1) => {
    const pts = [];
    for (let i = 0; i <= ARC_STEPS; i += 1) {
      const a = a0 + (a1 - a0) * (i / ARC_STEPS);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    return pts;
  };
  return [
    ...corner(right - r, bottom + r, -Math.PI / 2, 0),
    ...corner(right - r, top - r, 0, Math.PI / 2),
    ...corner(left + r, top - r, Math.PI / 2, Math.PI),
    ...corner(left + r, bottom + r, Math.PI, Math.PI * 3 / 2)
  ];
}
function frameOf(milling, outline) {
  if (milling !== "B") return { mirrorV: false, vPivot: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const p of outline) {
    min = Math.min(min, p[1]);
    max = Math.max(max, p[1]);
  }
  return { mirrorV: true, vPivot: min + max };
}
function mapPt(p, frame) {
  return [p[0], frame.mirrorV ? frame.vPivot - p[1] : p[1]];
}
function mapRing(pts, frame, ccw) {
  return wind(pts.map((p) => mapPt(p, frame)), ccw);
}
function slotOf(f) {
  if (f.u0 == null || f.u1 == null || f.v0 == null || f.v1 == null) return null;
  const du = Math.abs(f.u1 - f.u0);
  const dv = Math.abs(f.v1 - f.v0);
  const um = (f.u0 + f.u1) / 2;
  const vm = (f.v0 + f.v1) / 2;
  if (du >= dv) {
    return { width: dv, line: [[Math.min(f.u0, f.u1), vm], [Math.max(f.u0, f.u1), vm]] };
  }
  return { width: du, line: [[um, Math.min(f.v0, f.v1)], [um, Math.max(f.v0, f.v1)]] };
}
function finishOf(colour) {
  const name = String(colour || "").trim();
  if (!name) return void 0;
  return { finishId: decorSlug(name), finishName: name };
}
function grainAxis(board, grained) {
  if (!grained) return void 0;
  const faces = (board.faces ?? []).filter((f) => f.id === "A" || f.id === "B");
  const coloured = faces.find((f) => f.finish?.grain && f.visible) ?? faces.find((f) => f.finish?.grain);
  const axis = coloured?.finish?.grain;
  if (axis === "u") return "X";
  if (axis === "v") return "Y";
  return void 0;
}
function sheetOutline(board) {
  if (board.profilePlane !== "XZ" || board.boardType !== "bench_top" && board.boardType !== "bench_waterfall") return null;
  const along = board.boardType === "bench_waterfall" ? Math.abs(board.z1 - board.z0) : Math.abs(board.x1 - board.x0);
  const across = Math.abs(board.y1 - board.y0);
  if (!(along > 0) || !(across > 0)) return null;
  return [[0, 0], [along, 0], [along, across], [0, across]];
}
function buildBoard(jobId, cab, board, reasons) {
  const where = `${cab.id}/${board.id}`;
  const outline0 = sheetOutline(board) ?? localOutline(board) ?? rectOutline(board);
  if (outline0.length < 3) {
    reasons.push(`${where}: the outline has fewer than 3 points`);
    return null;
  }
  const frame = frameOf(board.milling, outline0);
  const outer = mapRing(outline0, frame, true);
  if (outer.length < 3 || Math.abs(signedArea(outer)) < 1e-6) {
    reasons.push(`${where}: the outline has no area`);
    return null;
  }
  const sheet = sheetMaterial(board, cab.params);
  const either = board.milling === "either";
  const single = sheet.surfaceMode === "SINGLE_SIDED";
  const millingId = board.milling === "B" ? "B" : "A";
  const millingFace = (board.faces ?? []).find((f) => f.id === millingId);
  const otherFace = (board.faces ?? []).find((f) => f.id === (millingId === "A" ? "B" : "A"));
  const features = [];
  const seen = /* @__PURE__ */ new Set();
  const tessellated = { value: false };
  const sources = either ? (board.faces ?? []).filter((f) => f.id === "A" || f.id === "B") : millingFace ? [millingFace] : [];
  for (const face of sources) {
    for (const f of face.features) {
      if (f.kind === "tongue" || f.kind === "notch") continue;
      if (f.kind !== "groove" && f.kind !== "tgroove" && f.kind !== "hole" && f.kind !== "cutout") continue;
      let id = f.id || `${face.id}-${features.length + 1}`;
      if (seen.has(id)) id = `${face.id}:${id}`;
      seen.add(id);
      const blind = !f.through;
      if (blind && !(typeof f.depth === "number" && f.depth > 0)) {
        reasons.push(`${where}: ${id} has no depth`);
        continue;
      }
      if (blind && f.depth > sheet.thicknessMm + 0.01) {
        reasons.push(`${where}: ${id} is ${f.depth} deep on a ${sheet.thicknessMm} mm board`);
        continue;
      }
      if (f.kind === "hole") {
        if (!f.center || !(f.diameter && f.diameter > 0)) {
          reasons.push(`${where}: ${id} has no centre or diameter`);
          continue;
        }
        const c = mapPt(f.center, frame);
        const feat2 = {
          featureId: id,
          kind: "bore",
          sourceFace: "A",
          through: !blind,
          geometry: { center: [r3(c[0]), r3(c[1])], diameterMm: f.diameter }
        };
        if (blind) feat2.depthMm = f.depth;
        if (f.for) feat2.intent = { purpose: f.for };
        features.push(feat2);
        continue;
      }
      if (f.kind === "groove" || f.kind === "tgroove") {
        const slot = slotOf(f);
        if (!slot || slot.width <= 0.01) {
          reasons.push(`${where}: ${id} has no slot`);
          continue;
        }
        const a = mapPt(slot.line[0], frame);
        const b = mapPt(slot.line[1], frame);
        const feat2 = {
          featureId: id,
          kind: "groove",
          sourceFace: "A",
          through: !blind,
          geometry: {
            centerline: [[r3(a[0]), r3(a[1])], [r3(b[0]), r3(b[1])]],
            widthMm: r3(slot.width)
          }
        };
        if (blind) feat2.depthMm = f.depth;
        if (f.for) feat2.intent = { purpose: f.for };
        features.push(feat2);
        continue;
      }
      if (f.u0 == null || f.u1 == null || f.v0 == null || f.v1 == null) {
        reasons.push(`${where}: ${id} has no outline`);
        continue;
      }
      const radius = f.loop ? 0 : f.radius ?? 0;
      if (radius > 0.05) tessellated.value = true;
      const loop = mapRing(f.loop ?? roundedRect(f.u0, f.v0, f.u1, f.v1, radius), frame, !f.through);
      if (loop.length < 3) {
        reasons.push(`${where}: ${id} has no outline`);
        continue;
      }
      const feat = {
        featureId: id,
        kind: f.through ? "throughProfile" : "pocket",
        sourceFace: f.through ? "THROUGH" : "A",
        through: !!f.through,
        geometry: { profile: { closed: true, points: loop } },
        hasArc: radius > 0.05
      };
      if (blind) feat.depthMm = f.depth;
      if (f.for) feat.intent = { purpose: f.for };
      features.push(feat);
    }
  }
  const grain = grainAxis(board, sheet.grained);
  if (sheet.grained && !grain) reasons.push(`${where}: textured HPL has no grain direction`);
  const material = {
    materialId: sheet.materialId,
    thicknessMm: sheet.thicknessMm,
    colorName: sheet.colorName,
    surfaceMode: sheet.surfaceMode,
    series: sheet.series,
    grained: sheet.grained,
    decorId: decorSlug(sheet.colorName),
    displayName: `${sheet.colorName} \xB7 ${single ? "single" : "double"}-sided \xB7 ${sheet.thicknessMm} mm`
  };
  const workpiece = {
    workpieceId: where,
    panelId: where,
    name: board.name || board.id,
    quantity: 1,
    identity: { projectId: jobId, moduleId: cab.moduleId, role: board.id },
    material: {
      materialId: sheet.materialId,
      thicknessMm: sheet.thicknessMm,
      colorName: sheet.colorName,
      surfaceMode: sheet.surfaceMode,
      series: sheet.series,
      grained: sheet.grained,
      decorId: decorSlug(sheet.colorName)
    },
    geometry: {
      quality: tessellated.value || board.tessellated ? "tessellated" : "exact",
      toleranceMm: tessellated.value ? 0.3 : board.tessellated ? 0.05 : 0.01,
      outerProfile: { closed: true, points: outer },
      nestingPolygon: outer
    },
    faces: [
      {
        faceId: "A",
        role: "machining",
        machiningPermission: either ? "ALLOWED" : "PRIMARY",
        ...finishOf(millingFace?.finish?.colour) ? { finish: finishOf(millingFace?.finish?.colour) } : {}
      },
      {
        faceId: "B",
        role: single ? "colour" : "back",
        machiningPermission: single ? "NOT_ALLOWED" : "ALLOWED",
        ...finishOf(otherFace?.finish?.colour) ? { finish: finishOf(otherFace?.finish?.colour) } : {}
      }
    ],
    features,
    manufacturing: { mode: "singleSide", machiningFace: either ? "EITHER" : "A" },
    edgeBands: cnjobEdgeBands(board)
  };
  if (grain) workpiece.grainDirection = grain;
  return { workpiece, material };
}
function buildCnjob(input) {
  const reasons = [...input.fitIssues ?? []];
  for (const cab of input.cabinets) {
    for (const msg of cab.errors ?? []) reasons.push(`${cab.id}: ${msg}`);
    for (const msg of cab.grainIssues ?? []) reasons.push(`${cab.id}: ${msg}`);
    for (const msg of cab.millingIssues ?? []) reasons.push(`${cab.id}: ${msg}`);
  }
  const workpieces = [];
  const materials = /* @__PURE__ */ new Map();
  if (!reasons.length) {
    for (const cab of input.cabinets) {
      for (const board of cab.boards) {
        const built = buildBoard(input.jobId || "job", cab, board, reasons);
        if (!built) continue;
        workpieces.push(built.workpiece);
        if (!materials.has(built.material.materialId)) materials.set(built.material.materialId, built.material);
      }
    }
  }
  if (reasons.length) return { ok: false, reasons };
  if (!workpieces.length) return { ok: false, reasons: ["Nothing to export."] };
  return {
    ok: true,
    boardCount: workpieces.length,
    materialIds: [...materials.keys()],
    snapshot: {
      schema: CNJOB_SCHEMA,
      schemaVersion: CNJOB_VERSION,
      jobId: input.jobId || "job",
      units: "mm",
      exportedAt: (/* @__PURE__ */ new Date()).toISOString(),
      source: { producer: PRODUCER, producerVersion: PRODUCER_VERSION },
      materials: [...materials.values()],
      workpieces,
      relationships: [],
      diagnostics: []
    }
  };
}
export {
  CNJOB_SCHEMA,
  CNJOB_VERSION,
  PRODUCER,
  PRODUCER_VERSION,
  buildCnjob
};
