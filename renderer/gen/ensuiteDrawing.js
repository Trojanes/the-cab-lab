// Generated from generators/ensuiteDrawing/generator.ts - do not edit.

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
function annotate(b, faceId, a) {
  Object.assign(faceOf(b, faceId), a);
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

// generators/_lib/edgeBand.ts
function outlineOf(b) {
  return localOutline(b) ?? rectOutline(b);
}
function setEdgeBand(b, i, band2) {
  if (!Number.isInteger(i) || i < 0) throw new Error(`${b.id}: edge ${i} is not an outline index`);
  const n = outlineOf(b).length;
  if (i >= n) throw new Error(`${b.id}: edge ${i} is past the outline (${n} edges)`);
  const face = faceOf(b, `E${i}`);
  if (!band2) {
    if (!face.finish?.edgeBand) return;
    delete face.finish.edgeBand;
    if (face.finish.colour == null) delete face.finish;
    return;
  }
  if (!Number.isFinite(band2.thickness) || band2.thickness <= 0) {
    throw new Error(`${b.id}.E${i}: edge band thickness must be millimetres above 0`);
  }
  const stored = { thickness: band2.thickness };
  if (band2.colour) stored.colour = band2.colour;
  face.finish = { ...face.finish, edgeBand: stored };
}

// generators/ensuiteDrawing/drawing.json
var drawing_default = {
  source: "Main_Design_second_van.step (Fusion, 2026-10-05) \xB7 Ensuite_lower_cabinet:1 and Ensuite_Cabinet_Through:1",
  frame: "Cabinet frame: x = drawing Y \u2212 Y0 (left \u2192 right seen from the front), y = front carcass face X \u2212 drawing X (front 0 \u2192 back), z = drawing Z. Lower: Y0 \u2212211, front face X \u22121662. Tall: Y0 \u2212734, front face X \u22121631.9.",
  outline: "[u, v, bulge] in the board's plane axes (XY: x,y \xB7 XZ: x,z \xB7 YZ: y,z), cabinet millimetres. Features: face-local u/v from the board's u0/v0.",
  corrections: {
    lower: [
      "lower C19 (right side panel) sat 1.87 / \u22122.77 / 7.97 mm off its neighbours in the drawing (x, y, z); moved to x 949\u2013964, y \u221216\u2013434, z 0\u2013890 like the left side panel.",
      "lower C28 (bottom front strip): a 0.1 mm step at its back edge (y 74.9 \u2192 75) closed so the board and its pocket meet one edge."
    ],
    tall: []
  },
  size: {
    lower: {
      W: 964,
      D: 434,
      H: 890
    },
    tall: {
      W: 523,
      D: 464,
      H: 1963
    }
  },
  parts: {
    lower: [
      {
        id: "C19",
        comp: "Component19",
        name: "Right side panel",
        category: "side_panel",
        plane: "YZ",
        t: 15,
        box: [
          949,
          964,
          -16,
          434,
          0,
          890
        ],
        outline: [
          [
            418,
            0,
            0
          ],
          [
            -16,
            0,
            0
          ],
          [
            -16,
            890,
            0
          ],
          [
            394,
            890,
            0
          ],
          [
            394,
            874,
            0
          ],
          [
            418,
            874,
            0
          ],
          [
            418,
            789,
            0
          ],
          [
            434,
            789,
            0
          ],
          [
            434,
            85,
            0
          ],
          [
            418,
            85,
            0
          ]
        ],
        holes: [],
        features: [],
        moved: [
          1.9,
          -2.8,
          8
        ]
      },
      {
        id: "C20",
        comp: "Component20",
        name: "Left side panel",
        category: "side_panel",
        plane: "YZ",
        t: 15,
        box: [
          0,
          15,
          -16,
          434,
          0,
          890
        ],
        outline: [
          [
            54.9,
            398,
            0
          ],
          [
            54.9,
            382,
            0
          ],
          [
            74.9,
            382,
            0
          ],
          [
            74.9,
            0,
            0
          ],
          [
            -16,
            0,
            0
          ],
          [
            -16,
            890,
            0
          ],
          [
            394,
            890,
            0
          ],
          [
            394,
            874,
            0
          ],
          [
            418,
            874,
            0
          ],
          [
            418,
            789,
            0
          ],
          [
            434,
            789,
            0
          ],
          [
            434,
            398,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C21",
        comp: "Component21",
        name: "Middle divider",
        category: "divider",
        plane: "YZ",
        t: 15,
        box: [
          483,
          498,
          0,
          434,
          0,
          890
        ],
        outline: [
          [
            50,
            890,
            0
          ],
          [
            50,
            874,
            0
          ],
          [
            0,
            874,
            0
          ],
          [
            0,
            70,
            0
          ],
          [
            60.5,
            70,
            0
          ],
          [
            60.5,
            0,
            0
          ],
          [
            418,
            0,
            0
          ],
          [
            418,
            85,
            0
          ],
          [
            434,
            85,
            0
          ],
          [
            434,
            789,
            0
          ],
          [
            418,
            789,
            0
          ],
          [
            418,
            874,
            0
          ],
          [
            394,
            874,
            0
          ],
          [
            394,
            890,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C22",
        comp: "Component22",
        name: "Back top rail",
        category: "rail",
        plane: "XZ",
        t: 15,
        box: [
          0,
          964,
          418,
          433,
          774,
          874
        ],
        outline: [
          [
            16,
            774,
            0
          ],
          [
            16,
            794,
            0
          ],
          [
            0,
            794,
            0
          ],
          [
            0,
            874,
            0
          ],
          [
            964,
            874,
            0
          ],
          [
            964,
            794,
            0
          ],
          [
            948,
            794,
            0
          ],
          [
            948,
            774,
            0
          ],
          [
            498.5,
            774,
            0
          ],
          [
            498.5,
            794,
            0
          ],
          [
            482.5,
            794,
            0
          ],
          [
            482.5,
            774,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C23",
        comp: "Component23",
        name: "Back bottom rail \xB7 right bay",
        category: "rail",
        plane: "XZ",
        t: 15,
        box: [
          483,
          964,
          418,
          433,
          0,
          100
        ],
        outline: [
          [
            498.5,
            80,
            0
          ],
          [
            483,
            80,
            0
          ],
          [
            483,
            0,
            0
          ],
          [
            964,
            0,
            0
          ],
          [
            964,
            80,
            0
          ],
          [
            948,
            80,
            0
          ],
          [
            948,
            100,
            0
          ],
          [
            498.5,
            100,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C24",
        comp: "Component24",
        name: "Top back strip",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          0,
          964,
          383,
          433,
          874,
          889
        ],
        outline: [
          [
            964,
            398,
            0
          ],
          [
            964,
            433,
            0
          ],
          [
            0,
            433,
            0
          ],
          [
            0,
            399,
            0
          ],
          [
            16,
            399,
            0
          ],
          [
            16,
            383,
            0
          ],
          [
            482.5,
            383,
            0
          ],
          [
            482.5,
            399,
            0
          ],
          [
            498.5,
            399,
            0
          ],
          [
            498.5,
            383,
            0
          ],
          [
            948,
            383,
            0
          ],
          [
            948,
            398,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C25",
        comp: "Component25",
        name: "Top front strip",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          15.1,
          949.1,
          0,
          60,
          874,
          889
        ],
        outline: [
          [
            498.6,
            60,
            0
          ],
          [
            498.6,
            44,
            0
          ],
          [
            482.6,
            44,
            0
          ],
          [
            482.6,
            60,
            0
          ],
          [
            15.1,
            60,
            0
          ],
          [
            15.1,
            0,
            0
          ],
          [
            949.1,
            0,
            0
          ],
          [
            949.1,
            60,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C26",
        comp: "Component26",
        name: "Top right batten",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          909,
          949,
          59,
          383,
          873,
          888
        ],
        outline: [
          [
            909,
            383,
            0
          ],
          [
            909,
            59,
            0
          ],
          [
            949,
            59,
            0
          ],
          [
            949,
            383,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C27",
        comp: "Component27",
        name: "Top left batten",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          15.1,
          115.1,
          60,
          383,
          874,
          889
        ],
        outline: [
          [
            15.1,
            383,
            0
          ],
          [
            15.1,
            60,
            0
          ],
          [
            115.1,
            60,
            0
          ],
          [
            115.1,
            383,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C28",
        comp: "Component28",
        name: "Bottom front strip",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          15,
          949,
          0,
          75,
          55,
          70
        ],
        outline: [
          [
            15,
            75,
            0
          ],
          [
            15,
            0,
            0
          ],
          [
            949,
            0,
            0
          ],
          [
            949,
            75,
            0
          ],
          [
            498.5,
            75,
            0
          ],
          [
            498.5,
            60,
            0
          ],
          [
            482.5,
            60,
            0
          ],
          [
            482.5,
            75,
            0
          ]
        ],
        holes: [],
        features: [
          {
            face: "B",
            kind: "groove",
            u0: 0,
            u1: 934,
            v0: 17.5,
            v1: 32,
            depth: 6.5
          },
          {
            face: "B",
            kind: "groove",
            u0: 38.7,
            u1: 53.7,
            v0: 32,
            v1: 75,
            depth: 6.5
          },
          {
            face: "B",
            kind: "groove",
            u0: 895.1,
            u1: 910.1,
            v0: 32,
            v1: 75,
            depth: 6.5
          }
        ]
      },
      {
        id: "C29",
        comp: "Component29",
        name: "Kick rail",
        category: "rail",
        plane: "XZ",
        t: 15,
        box: [
          15,
          949,
          44.5,
          59.5,
          1,
          55
        ],
        outline: [
          [
            15,
            55,
            0
          ],
          [
            15,
            1,
            0
          ],
          [
            949,
            1,
            0
          ],
          [
            949,
            55,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C30",
        comp: "Component30",
        name: "Left front stile",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          15,
          30,
          0,
          75,
          70,
          873
        ],
        outline: [
          [
            54.9,
            398,
            0
          ],
          [
            75,
            398,
            0
          ],
          [
            75,
            873,
            0
          ],
          [
            0,
            873,
            0
          ],
          [
            0,
            70,
            0
          ],
          [
            74.9,
            70,
            0
          ],
          [
            74.9,
            382,
            0
          ],
          [
            54.9,
            382,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C31",
        comp: "Component31",
        name: "Left back stile \xB7 above the lid",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          15,
          30,
          334,
          434,
          398,
          873
        ],
        outline: [
          [
            334,
            398,
            0
          ],
          [
            434,
            398,
            0
          ],
          [
            434,
            768,
            0
          ],
          [
            418,
            768,
            0
          ],
          [
            418,
            873,
            0
          ],
          [
            334,
            873,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C32",
        comp: "Component32",
        name: "Right front stile",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          934,
          949,
          0,
          100,
          70,
          873
        ],
        outline: [
          [
            0,
            873,
            0
          ],
          [
            0,
            70,
            0
          ],
          [
            100,
            70,
            0
          ],
          [
            100,
            873,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C33",
        comp: "Component33",
        name: "Right back stile",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          934,
          949,
          334,
          434,
          0,
          873
        ],
        outline: [
          [
            418,
            0,
            0
          ],
          [
            418,
            105,
            0
          ],
          [
            434,
            105,
            0
          ],
          [
            434,
            768,
            0
          ],
          [
            418,
            768,
            0
          ],
          [
            418,
            873,
            0
          ],
          [
            334,
            873,
            0
          ],
          [
            334,
            0,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C34",
        comp: "Component34",
        name: "Divider back stile \xB7 left",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          468,
          483,
          334,
          434,
          0,
          873
        ],
        outline: [
          [
            334,
            382,
            0
          ],
          [
            354,
            382,
            0
          ],
          [
            354,
            398,
            0
          ],
          [
            334,
            398,
            0
          ],
          [
            334,
            873,
            0
          ],
          [
            418,
            873,
            0
          ],
          [
            418,
            768,
            0
          ],
          [
            434,
            768,
            0
          ],
          [
            434,
            0,
            0
          ],
          [
            334,
            0,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C35",
        comp: "Component35",
        name: "Divider back stile \xB7 right",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          498,
          513,
          334,
          434,
          0,
          873
        ],
        outline: [
          [
            418,
            0,
            0
          ],
          [
            418,
            105,
            0
          ],
          [
            434,
            105,
            0
          ],
          [
            434,
            768,
            0
          ],
          [
            418,
            768,
            0
          ],
          [
            418,
            873,
            0
          ],
          [
            334,
            873,
            0
          ],
          [
            334,
            0,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C37",
        comp: "Component37",
        name: "Lid over the cavity \xB7 left bay",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          0,
          483,
          0,
          434,
          383,
          398
        ],
        outline: [
          [
            30.5,
            59.9,
            0
          ],
          [
            0,
            59.9,
            0
          ],
          [
            0,
            434,
            0
          ],
          [
            467.5,
            434,
            0
          ],
          [
            467.5,
            349,
            0
          ],
          [
            483,
            349,
            0
          ],
          [
            483,
            0,
            0
          ],
          [
            30.5,
            0,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C38",
        comp: "Component38",
        name: "Door \xB7 left",
        category: "door",
        plane: "XZ",
        t: 16,
        box: [
          17.6,
          488.6,
          -16,
          0,
          55,
          887
        ],
        outline: [
          [
            17.6,
            55,
            0
          ],
          [
            488.6,
            55,
            0
          ],
          [
            488.6,
            887,
            0
          ],
          [
            17.6,
            887,
            0
          ]
        ],
        holes: [
          [
            [
              408.1,
              850.5,
              -1
            ],
            [
              408.1,
              834.5,
              0
            ],
            [
              369.1,
              834.5,
              -1
            ],
            [
              369.1,
              850.5,
              0
            ]
          ]
        ],
        features: [
          {
            face: "A",
            kind: "hole",
            center: [
              22.5,
              682
            ],
            diameter: 35,
            depth: 12.5
          },
          {
            face: "A",
            kind: "hole",
            center: [
              22.5,
              150
            ],
            diameter: 35,
            depth: 12.5
          }
        ]
      },
      {
        id: "C39",
        comp: "Component39",
        name: "Door \xB7 right",
        category: "door",
        plane: "XZ",
        t: 16,
        box: [
          491.6,
          946.1,
          -16,
          0,
          55,
          887
        ],
        outline: [
          [
            491.6,
            55,
            0
          ],
          [
            946.1,
            55,
            0
          ],
          [
            946.1,
            887,
            0
          ],
          [
            491.6,
            887,
            0
          ]
        ],
        holes: [
          [
            [
              572.1,
              834.5,
              -1
            ],
            [
              572.1,
              850.5,
              0
            ],
            [
              611.1,
              850.5,
              -1
            ],
            [
              611.1,
              834.5,
              0
            ]
          ]
        ],
        features: [
          {
            face: "A",
            kind: "hole",
            center: [
              432,
              682
            ],
            diameter: 35,
            depth: 12.5
          },
          {
            face: "A",
            kind: "hole",
            center: [
              432,
              150
            ],
            diameter: 35,
            depth: 12.5
          }
        ]
      },
      {
        id: "C266",
        comp: "Component266",
        name: "Kickboard",
        category: "front_panel",
        plane: "XZ",
        t: 16,
        box: [
          15,
          949,
          28.5,
          44.5,
          0,
          55
        ],
        outline: [
          [
            15,
            55,
            0
          ],
          [
            15,
            0,
            0
          ],
          [
            949,
            0,
            0
          ],
          [
            949,
            55,
            0
          ]
        ],
        holes: [],
        features: []
      }
    ],
    tall: [
      {
        id: "C74",
        comp: "Component74",
        name: "Right side panel",
        category: "side_panel",
        plane: "YZ",
        t: 16,
        box: [
          507,
          523,
          -16,
          464,
          -2,
          1963
        ],
        outline: [
          [
            85,
            398,
            0
          ],
          [
            85,
            382,
            0
          ],
          [
            105,
            382,
            0
          ],
          [
            105,
            -2,
            0
          ],
          [
            -16,
            -2,
            0
          ],
          [
            -16,
            1963,
            0
          ],
          [
            464,
            1963,
            0
          ],
          [
            464,
            398,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C75",
        comp: "Component75",
        name: "Lid over the cavity (inferred)",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          0,
          523,
          -8,
          464,
          383,
          398
        ],
        outline: [
          [
            0,
            0,
            0
          ],
          [
            123.5,
            0,
            0
          ],
          [
            123.5,
            -8,
            0
          ],
          [
            383.5,
            -8,
            0
          ],
          [
            383.5,
            0,
            0
          ],
          [
            507,
            0,
            0
          ],
          [
            507,
            90,
            0
          ],
          [
            523,
            90,
            0
          ],
          [
            523,
            464,
            0
          ],
          [
            0,
            464,
            0
          ]
        ],
        holes: [],
        features: [],
        inferred: "Not in the STEP (Component75 has no body). From: stiles start at 398; side panel C74 notch y 85\u2013105 \xD7 z 382\u2013398 (the lid passes it from y 90: 5 mm relief); front panel C76 groove x 118.5\u2013388.5 \xD7 z 383\u2013399 \xD7 8 deep (tongue 5 mm narrower each side for the 10 mm router bit: x 123.5\u2013383.5, 8 long); same as the lower lid C37."
      },
      {
        id: "C76",
        comp: "Component76",
        name: "Front fixed panel \xB7 access opening",
        category: "front_panel",
        plane: "XZ",
        t: 16,
        box: [
          0,
          507,
          -16,
          0,
          0,
          705
        ],
        outline: [
          [
            0,
            705,
            0
          ],
          [
            0,
            0,
            0
          ],
          [
            507,
            0,
            0
          ],
          [
            507,
            705,
            0
          ]
        ],
        holes: [
          [
            [
              437,
              455,
              0
            ],
            [
              70,
              455,
              -0.414214
            ],
            [
              40,
              485,
              0
            ],
            [
              40,
              625,
              -0.414214
            ],
            [
              70,
              655,
              0
            ],
            [
              437,
              655,
              -0.414214
            ],
            [
              467,
              625,
              0
            ],
            [
              467,
              485,
              -0.414214
            ]
          ]
        ],
        features: [
          {
            face: "A",
            kind: "groove",
            u0: 118.5,
            u1: 388.5,
            v0: 383,
            v1: 399,
            depth: 8
          }
        ]
      },
      {
        id: "C77",
        comp: "Component77",
        name: "Right back stile",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          492,
          507,
          364,
          464,
          398,
          1963
        ],
        outline: [
          [
            364,
            713,
            0
          ],
          [
            364,
            1297,
            0
          ],
          [
            384,
            1297,
            0
          ],
          [
            384,
            1313,
            0
          ],
          [
            364,
            1313,
            0
          ],
          [
            364,
            1963,
            0
          ],
          [
            464,
            1963,
            0
          ],
          [
            464,
            398,
            0
          ],
          [
            364,
            398,
            0
          ],
          [
            364,
            697,
            0
          ],
          [
            384,
            697,
            0
          ],
          [
            384,
            713,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C78",
        comp: "Component78",
        name: "Left back stile",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          0,
          15,
          364,
          464,
          398,
          1963
        ],
        outline: [
          [
            364,
            713,
            0
          ],
          [
            364,
            1297,
            0
          ],
          [
            384,
            1297,
            0
          ],
          [
            384,
            1313,
            0
          ],
          [
            364,
            1313,
            0
          ],
          [
            364,
            1963,
            0
          ],
          [
            464,
            1963,
            0
          ],
          [
            464,
            398,
            0
          ],
          [
            364,
            398,
            0
          ],
          [
            364,
            697,
            0
          ],
          [
            384,
            697,
            0
          ],
          [
            384,
            713,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C79",
        comp: "Component79",
        name: "Right front stile",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          492,
          507,
          0,
          100,
          398,
          1963
        ],
        outline: [
          [
            60,
            1897,
            0
          ],
          [
            0,
            1897,
            0
          ],
          [
            0,
            398,
            0
          ],
          [
            100,
            398,
            0
          ],
          [
            100,
            697,
            0
          ],
          [
            80,
            697,
            0
          ],
          [
            80,
            713,
            0
          ],
          [
            100,
            713,
            0
          ],
          [
            100,
            1297,
            0
          ],
          [
            80,
            1297,
            0
          ],
          [
            80,
            1313,
            0
          ],
          [
            100,
            1313,
            0
          ],
          [
            100,
            1963,
            0
          ],
          [
            50,
            1963,
            0
          ],
          [
            50,
            1913,
            0
          ],
          [
            60,
            1913,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C80",
        comp: "Component80",
        name: "Left front stile",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          0,
          15,
          0,
          100,
          398,
          1963
        ],
        outline: [
          [
            60,
            1897,
            0
          ],
          [
            0,
            1897,
            0
          ],
          [
            0,
            398,
            0
          ],
          [
            100,
            398,
            0
          ],
          [
            100,
            697,
            0
          ],
          [
            80,
            697,
            0
          ],
          [
            80,
            713,
            0
          ],
          [
            100,
            713,
            0
          ],
          [
            100,
            1297,
            0
          ],
          [
            80,
            1297,
            0
          ],
          [
            80,
            1313,
            0
          ],
          [
            100,
            1313,
            0
          ],
          [
            100,
            1963,
            0
          ],
          [
            50,
            1963,
            0
          ],
          [
            50,
            1913,
            0
          ],
          [
            60,
            1913,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C81",
        comp: "Component81",
        name: "Middle shelf",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          0,
          507,
          0,
          464,
          1297,
          1312
        ],
        outline: [
          [
            16,
            16,
            0
          ],
          [
            64,
            16,
            0
          ],
          [
            64,
            85,
            0
          ],
          [
            80,
            85,
            0
          ],
          [
            80,
            0,
            0
          ],
          [
            491,
            0,
            0
          ],
          [
            491,
            85,
            0
          ],
          [
            507,
            85,
            0
          ],
          [
            507,
            379,
            0
          ],
          [
            491,
            379,
            0
          ],
          [
            491,
            464,
            0
          ],
          [
            16,
            464,
            0
          ],
          [
            16,
            379,
            0
          ],
          [
            0,
            379,
            0
          ],
          [
            0,
            85,
            0
          ],
          [
            16,
            85,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C83",
        comp: "Component83",
        name: "Top front strip",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          0,
          507,
          0,
          100,
          1897,
          1912
        ],
        outline: [
          [
            16,
            55,
            0
          ],
          [
            0,
            55,
            0
          ],
          [
            0,
            0,
            0
          ],
          [
            507,
            0,
            0
          ],
          [
            507,
            55,
            0
          ],
          [
            491,
            55,
            0
          ],
          [
            491,
            100,
            0
          ],
          [
            16,
            100,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C84",
        comp: "Component84",
        name: "Top front rail",
        category: "rail",
        plane: "XZ",
        t: 15,
        box: [
          0,
          507,
          35,
          50,
          1912,
          1963
        ],
        outline: [
          [
            0,
            1912,
            0
          ],
          [
            507,
            1912,
            0
          ],
          [
            507,
            1963,
            0
          ],
          [
            0,
            1963,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C85",
        comp: "Component85",
        name: "Top front fascia",
        category: "front_panel",
        plane: "XZ",
        t: 16,
        box: [
          0,
          507,
          19,
          35,
          1912,
          1963
        ],
        outline: [
          [
            0,
            1912,
            0
          ],
          [
            507,
            1912,
            0
          ],
          [
            507,
            1963,
            0
          ],
          [
            0,
            1963,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C86",
        comp: "Component86",
        name: "Right top side rail",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          492,
          507,
          100,
          364,
          1863,
          1963
        ],
        outline: [
          [
            364,
            1863,
            0
          ],
          [
            100,
            1863,
            0
          ],
          [
            100,
            1963,
            0
          ],
          [
            364,
            1963,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C87",
        comp: "Component87",
        name: "Left top side rail",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          0,
          15,
          100,
          364,
          1863,
          1963
        ],
        outline: [
          [
            364,
            1863,
            0
          ],
          [
            100,
            1863,
            0
          ],
          [
            100,
            1963,
            0
          ],
          [
            364,
            1963,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C88",
        comp: "Component88",
        name: "Left middle side rail",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          0,
          15,
          100,
          364,
          1197,
          1297
        ],
        outline: [
          [
            364,
            1197,
            0
          ],
          [
            100,
            1197,
            0
          ],
          [
            100,
            1297,
            0
          ],
          [
            364,
            1297,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C89",
        comp: "Component89",
        name: "Right middle side rail",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          492,
          507,
          100,
          364,
          1197,
          1297
        ],
        outline: [
          [
            364,
            1197,
            0
          ],
          [
            100,
            1197,
            0
          ],
          [
            100,
            1297,
            0
          ],
          [
            364,
            1297,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C90",
        comp: "Component90",
        name: "Left base side rail",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          0,
          15,
          100,
          364,
          597,
          697
        ],
        outline: [
          [
            364,
            597,
            0
          ],
          [
            100,
            597,
            0
          ],
          [
            100,
            697,
            0
          ],
          [
            364,
            697,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C91",
        comp: "Component91",
        name: "Right base side rail",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          492,
          507,
          100,
          364,
          597,
          697
        ],
        outline: [
          [
            364,
            597,
            0
          ],
          [
            100,
            597,
            0
          ],
          [
            100,
            697,
            0
          ],
          [
            364,
            697,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C92",
        comp: "Component92",
        name: "Back top rail",
        category: "rail",
        plane: "XZ",
        t: 15,
        box: [
          15,
          492,
          449,
          464,
          1863,
          1963
        ],
        outline: [
          [
            492,
            1863,
            0
          ],
          [
            15,
            1863,
            0
          ],
          [
            15,
            1963,
            0
          ],
          [
            492,
            1963,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C93",
        comp: "Component93",
        name: "Back middle rail",
        category: "rail",
        plane: "XZ",
        t: 15,
        box: [
          16,
          493,
          449,
          464,
          1198,
          1298
        ],
        outline: [
          [
            493,
            1198,
            0
          ],
          [
            16,
            1198,
            0
          ],
          [
            16,
            1298,
            0
          ],
          [
            493,
            1298,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C94",
        comp: "Component94",
        name: "Back base rail",
        category: "rail",
        plane: "XZ",
        t: 15,
        box: [
          15,
          492,
          449,
          464,
          598,
          698
        ],
        outline: [
          [
            492,
            598,
            0
          ],
          [
            15,
            598,
            0
          ],
          [
            15,
            698,
            0
          ],
          [
            492,
            698,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C95",
        comp: "Component95",
        name: "Wall-side filler",
        category: "front_panel",
        plane: "XZ",
        t: 16,
        box: [
          0,
          80,
          -16,
          0,
          705,
          1912
        ],
        outline: [
          [
            0,
            705,
            0
          ],
          [
            80,
            705,
            0
          ],
          [
            80,
            1912,
            0
          ],
          [
            0,
            1912,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C96",
        comp: "Component96",
        name: "Filler stile",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          64,
          79,
          0,
          100,
          713,
          1897
        ],
        outline: [
          [
            0,
            713,
            0
          ],
          [
            0,
            1897,
            0
          ],
          [
            100,
            1897,
            0
          ],
          [
            100,
            1313.5,
            0
          ],
          [
            76.5,
            1313.5,
            0
          ],
          [
            76.5,
            1297.5,
            0
          ],
          [
            100,
            1297.5,
            0
          ],
          [
            100,
            713,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C97",
        comp: "Component97",
        name: "Filler cleat",
        category: "rail",
        plane: "XZ",
        t: 15,
        box: [
          16,
          64,
          1,
          16,
          697,
          1897
        ],
        outline: [
          [
            16,
            1897,
            0
          ],
          [
            16,
            697,
            0
          ],
          [
            64,
            697,
            0
          ],
          [
            64,
            1897,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C98",
        comp: "Component98",
        name: "Door \xB7 upper",
        category: "door",
        plane: "XZ",
        t: 16,
        box: [
          82.5,
          504.5,
          -15.9,
          0.1,
          1307.3,
          1912.3
        ],
        outline: [
          [
            82.5,
            1912.3,
            0
          ],
          [
            504.5,
            1912.3,
            0
          ],
          [
            504.5,
            1307.3,
            0
          ],
          [
            82.5,
            1307.3,
            0
          ]
        ],
        holes: [
          [
            [
              453,
              1426.8,
              -1
            ],
            [
              469,
              1426.8,
              0
            ],
            [
              469,
              1387.8,
              -1
            ],
            [
              453,
              1387.8,
              0
            ]
          ]
        ],
        features: [
          {
            face: "A",
            kind: "hole",
            center: [
              22.5,
              120
            ],
            diameter: 35,
            depth: 12.5
          },
          {
            face: "A",
            kind: "hole",
            center: [
              22.5,
              485
            ],
            diameter: 35,
            depth: 12.5
          }
        ]
      },
      {
        id: "C99",
        comp: "Component99",
        name: "Door \xB7 lower",
        category: "door",
        plane: "XZ",
        t: 16,
        box: [
          82.5,
          504.5,
          -15.9,
          0.1,
          708,
          1304
        ],
        outline: [
          [
            82.5,
            1304,
            0
          ],
          [
            504.5,
            1304,
            0
          ],
          [
            504.5,
            708,
            0
          ],
          [
            82.5,
            708,
            0
          ]
        ],
        holes: [
          [
            [
              453,
              1025.5,
              -1
            ],
            [
              469,
              1025.5,
              0
            ],
            [
              469,
              986.5,
              -1
            ],
            [
              453,
              986.5,
              0
            ]
          ]
        ],
        features: [
          {
            face: "A",
            kind: "hole",
            center: [
              22.5,
              120
            ],
            diameter: 35,
            depth: 12.5
          },
          {
            face: "A",
            kind: "hole",
            center: [
              22.5,
              476
            ],
            diameter: 35,
            depth: 12.5
          }
        ]
      },
      {
        id: "C101",
        comp: "Component101",
        name: "Base top \xB7 over the cavity",
        category: "horizontal",
        plane: "XY",
        t: 15,
        box: [
          0,
          507,
          0,
          464,
          697,
          712
        ],
        outline: [
          [
            16,
            16,
            0
          ],
          [
            64,
            16,
            0
          ],
          [
            64,
            85,
            0
          ],
          [
            80,
            85,
            0
          ],
          [
            80,
            0,
            0
          ],
          [
            491,
            0,
            0
          ],
          [
            491,
            85,
            0
          ],
          [
            507,
            85,
            0
          ],
          [
            507,
            379,
            0
          ],
          [
            491,
            379,
            0
          ],
          [
            491,
            464,
            0
          ],
          [
            16,
            464,
            0
          ],
          [
            16,
            379,
            0
          ],
          [
            0,
            379,
            0
          ],
          [
            0,
            85,
            0
          ],
          [
            16,
            85,
            0
          ]
        ],
        holes: [],
        features: []
      },
      {
        id: "C76S",
        comp: "Component76",
        name: "Stub behind the fixed panel",
        category: "rail",
        plane: "YZ",
        t: 15,
        box: [
          64,
          79,
          0,
          80,
          698,
          713
        ],
        outline: [
          [
            0,
            698,
            0
          ],
          [
            80,
            698,
            0
          ],
          [
            80,
            713,
            0
          ],
          [
            0,
            713,
            0
          ]
        ],
        holes: [],
        features: []
      }
    ]
  }
};

// generators/ensuiteDrawing/generator.ts
var DRAWING = drawing_default;
var ENSUITE_DRAWING_SOURCE = DRAWING.source;
function partOf(params) {
  return params && params.part === "tall" ? "tall" : "lower";
}
function ensuiteDrawingSize(part) {
  return { ...DRAWING.size[part] };
}
var round1 = (n) => Math.round(n * 10) / 10;
var AXES = { XY: ["x", "y"], XZ: ["x", "z"], YZ: ["y", "z"] };
var THICK = { XY: "Z", XZ: "Y", YZ: "X" };
function ring(plane, pts) {
  const [U, V] = AXES[plane];
  return pts.map(([u, v, bulge]) => {
    const p = { [U]: u, [V]: v };
    if (bulge) p.bulge = bulge;
    return p;
  });
}
var EDGE_BAND_MM = 1;
var EDGE_BAND_MIN_MM = 40;
function edgeLength(f) {
  const e = f.edge;
  return Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]);
}
function edgeMid(b, f) {
  const [U, V] = planeAxes(b.profilePlane);
  const p = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 };
  p[U] = b[`${U}0`] + (f.edge.from[0] + f.edge.to[0]) / 2;
  p[V] = b[`${V}0`] + (f.edge.from[1] + f.edge.to[1]) / 2;
  return p;
}
function band(b, f, colour) {
  setEdgeBand(b, Number(f.id.slice(1)), { thickness: EDGE_BAND_MM, colour });
}
function bandLong(b, normal, colour, min = EDGE_BAND_MIN_MM) {
  for (const f of edgeFaces(b)) {
    if (f.normal === normal && edgeLength(f) >= min) band(b, f, colour);
  }
}
function bandAll(b, colour) {
  for (const f of edgeFaces(b)) band(b, f, colour);
}
function bandEnsuiteEdges(boards, part, door, carcass) {
  const byId = new Map(boards.map((b) => [b.id, b]));
  const at = (id) => byId.get(id);
  if (part === "tall") {
    const side = at("C74");
    if (side) {
      bandLong(side, "+Z", door);
      bandLong(side, "-Y", door);
      for (const f of edgeFaces(side)) {
        if (f.normal === "+Y" && edgeLength(f) >= EDGE_BAND_MIN_MM && edgeMid(side, f).y < 400) band(side, f, carcass);
      }
    }
    const fixed = at("C76");
    if (fixed) bandLong(fixed, "+Z", door);
    const filler = at("C95");
    if (filler) bandAll(filler, door);
    for (const id of ["C98", "C99"]) {
      const doorBoard = at(id);
      if (doorBoard) bandAll(doorBoard, door);
    }
    for (const id of ["C77", "C78"]) {
      const stile = at(id);
      if (stile) bandLong(stile, "-Y", carcass);
    }
    const rightFront = at("C79");
    if (rightFront) {
      bandLong(rightFront, "-Y", carcass);
      bandLong(rightFront, "+Y", carcass);
    }
    const leftFront = at("C80");
    if (leftFront) bandLong(leftFront, "+Y", carcass);
    const shelf = at("C81");
    if (shelf) bandLong(shelf, "-Y", carcass);
    const topStrip = at("C83");
    if (topStrip) {
      bandLong(topStrip, "-Y", carcass);
      bandLong(topStrip, "+Y", carcass);
    }
    for (const id of ["C86", "C87", "C88", "C89", "C90", "C91", "C92", "C93", "C94"]) {
      const rail = at(id);
      if (rail) bandLong(rail, "-Z", carcass);
    }
    const fillerStile = at("C96");
    if (fillerStile) bandLong(fillerStile, "+Y", carcass);
    return;
  }
  for (const id of ["C38", "C39"]) {
    const doorBoard = at(id);
    if (doorBoard) bandAll(doorBoard, door);
  }
  for (const id of ["C19", "C20"]) {
    const side = at(id);
    if (!side) continue;
    bandLong(side, "-Y", door);
    bandLong(side, "+Z", door);
  }
  const leftSide = at("C20");
  if (leftSide) {
    for (const f of edgeFaces(leftSide)) {
      if (f.normal === "+Y" && edgeLength(f) >= EDGE_BAND_MIN_MM && edgeMid(leftSide, f).y < 200) band(leftSide, f, carcass);
    }
  }
  const topBack = at("C24");
  if (topBack) bandLong(topBack, "-Y", door);
  const topFront = at("C25");
  if (topFront) {
    bandLong(topFront, "+Y", door);
    bandLong(topFront, "-Y", carcass);
  }
  const rightBatten = at("C26");
  if (rightBatten) bandLong(rightBatten, "-X", door);
  const leftBatten = at("C27");
  if (leftBatten) bandLong(leftBatten, "+X", door);
  const divider = at("C21");
  if (divider) {
    bandLong(divider, "+Z", door);
    bandLong(divider, "-Y", carcass);
  }
  const width = 964;
  for (const b of boards) {
    if (b.category === "door" || b.category === "side_panel") continue;
    for (const f of edgeFaces(b)) {
      if (f.normal !== "+X" || edgeLength(f) < 30) continue;
      if (edgeMid(b, f).x >= width - 1) band(b, f, door);
    }
  }
  for (const id of ["C22"]) {
    const rail = at(id);
    if (rail) bandLong(rail, "-Z", carcass);
  }
  const bottomBack = at("C23");
  if (bottomBack) bandLong(bottomBack, "+Z", carcass);
  const bottomFront = at("C28");
  if (bottomFront) {
    bandLong(bottomFront, "-Y", carcass);
    bandLong(bottomFront, "+Y", carcass);
  }
  for (const id of ["C30", "C32"]) {
    const stile = at(id);
    if (!stile) continue;
    bandLong(stile, "-Y", carcass);
    bandLong(stile, "+Y", carcass);
  }
  for (const id of ["C31", "C33"]) {
    const stile = at(id);
    if (stile) bandLong(stile, "-Y", carcass);
  }
  for (const id of ["C34", "C35"]) {
    const stile = at(id);
    if (!stile) continue;
    bandLong(stile, "-Y", carcass);
    bandLong(stile, "+Z", carcass);
  }
  const lid = at("C37");
  if (lid) bandLong(lid, "-Y", carcass);
}
function colourFace(d, part) {
  if (d.plane === "YZ") return d.box[0] > DRAWING.size[part].W / 2 ? "A" : "B";
  if (d.plane === "XY") return "A";
  return "B";
}
function generateEnsuiteDrawing(params = {}, _options = {}) {
  const part = partOf(params);
  const size = ensuiteDrawingSize(part);
  const carcass = carcassColourOf(params);
  const door = doorColourOf(params);
  const warnings = [];
  const boards = [];
  for (const d of DRAWING.parts[part]) {
    const [x0, x1, y0, y1, z0, z1] = d.box;
    const isDoorStock = d.t >= 15.95;
    const b = {
      id: d.id,
      name: d.name,
      category: d.category,
      boardType: d.category,
      role: d.category,
      materialThickness: d.t,
      profilePlane: d.plane,
      thicknessAxis: THICK[d.plane],
      x0,
      x1,
      y0,
      y1,
      z0,
      z1,
      source: "ensuiteDrawing",
      notes: [`Drawing: ${d.comp}`],
      stock: { kind: isDoorStock ? "door" : "carcass", thickness: d.t, colour: isDoorStock ? door : carcass }
    };
    const plain = d.outline.length === 4 && d.outline.every((p) => !p[2]);
    if (!plain) b.profileVector = ring(d.plane, d.outline);
    if (d.outline.some((p) => p[2])) b.tessellated = true;
    if (d.inferred) b.notes.push(`Inferred: ${d.inferred}`);
    if (d.moved) b.notes.push(`Moved ${d.moved.join(" / ")} mm (x / y / z) to line up with the cabinet; see drawing.json corrections`);
    boards.push(b);
  }
  attachFaces(boards);
  DRAWING.parts[part].forEach((d, i) => {
    const b = boards[i];
    d.features.forEach((f, k) => {
      const id = `${f.kind[0].toUpperCase()}${k + 1}`;
      const feat = { id, kind: f.kind, depth: f.depth, source: "drawing" };
      if (f.kind === "hole" && f.diameter === 35 && d.category === "door") feat.for = "hinge";
      if (f.kind === "hole" && f.center && f.diameter) {
        feat.center = f.center;
        feat.diameter = f.diameter;
      } else {
        feat.u0 = f.u0;
        feat.u1 = f.u1;
        feat.v0 = f.v0;
        feat.v1 = f.v1;
        if (f.loop) {
          feat.loop = expandBulgeRing(f.loop.map(([u, v, bulge]) => ({ u, v, b: bulge }))).map((p) => [p.u, p.v]);
          if (f.loop.some((p) => p[2])) b.tessellated = true;
        }
      }
      addFeature(b, f.face, feat);
    });
    const [U, V] = AXES[d.plane];
    const u0 = b[`${U}0`];
    const v0 = b[`${V}0`];
    d.holes.forEach((h, k) => {
      const loop = expandBulgeRing(h.map(([u, v, bulge]) => ({ u: u - u0, v: v - v0, b: bulge }))).map((p) => [round1(p.u), round1(p.v)]);
      const us = loop.map((p) => p[0]);
      const vs = loop.map((p) => p[1]);
      addFeature(b, "A", { id: `O${k + 1}`, kind: "cutout", through: true, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), loop, source: "drawing" });
      if (h.some((p) => p[2])) b.tessellated = true;
    });
    if (b.stock?.kind === "door") {
      const face = colourFace(d, part);
      annotate(b, face, { semantic: d.category === "door" ? "front" : face === "A" && d.plane === "YZ" ? "side" : "front", visible: true, finish: { colour: door } });
    }
  });
  applyDoorSides(boards, params);
  bandEnsuiteEdges(boards, part, door, carcass);
  const milling = applyMilling(boards);
  return {
    params: { part, width: size.W, depth: size.D, height: size.H, source: DRAWING.source, corrections: DRAWING.corrections[part] ?? [] },
    zones: [],
    boards,
    joints: [],
    layout: {},
    milling,
    validation: { errors: [], warnings },
    debug: { boardFrame: "final" }
  };
}
export {
  ENSUITE_DRAWING_SOURCE,
  ensuiteDrawingSize,
  generateEnsuiteDrawing,
  partOf
};
