/**
 * Pins: expected values for a generator preset, stored in
 * generators/<module>/presets.json and checked by the generator test.
 *
 *   pins.boards["T3"]        = { x0, x1, y0, y1, z0, z1 }      cabinet frame
 *   pins.points["D1.cut"]    = [[y, z], ...]                   board-local (cutProfileVector)
 *   pins.points["T3.pv"]     = [[x, y], ...]                   as emitted (profileVector)
 *   pins.features["FP0.HINGE_1"] = { x, z }                    hinge cup centre, board-local
 *   pins.faceFeatures["BP.A.BG_D0"] = { u0, u1, v0, v1, depth } face feature (groove / hole / cutout), face-local
 *
 * The bench writes pins for what the user confirmed; `collectPins()` pins
 * everything a result has (used to seed a preset). `checkPins()` compares at
 * TOL mm and returns every mismatch, so a failing test names the board, the
 * face or the point index.
 */

export const PIN_TOL_MM = 0.01;

export interface BoardLike {
  id: string;
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
  profilePlane?: string;
  profileVector?: Array<Record<string, number>>;
  cutProfileVector?: Array<{ y: number; z: number }>;
  faces?: Array<{ id: string; features: Array<Record<string, unknown>> }>;
}

export interface ResultLike {
  boards: BoardLike[];
  features?: unknown[];
  /** Layout regions of a volume-only module (bedroom body): pinned like boards, by id. */
  zones?: Array<{ id: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }>;
}

export interface Pins {
  boards?: Record<string, { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }>;
  /** Region boxes (`result.zones[]`) of a module that has no boards yet. */
  zones?: Record<string, { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }>;
  points?: Record<string, number[][]>;
  features?: Record<string, Record<string, number>>;
  /** `${boardId}.${faceId}.${featureId}` → numeric fields of a face feature (u0 u1 v0 v1 cx cy diameter depth radius). */
  faceFeatures?: Record<string, Record<string, number>>;
}

const FACE_FEATURE_FIELDS = ["u0", "u1", "v0", "v1", "diameter", "depth", "radius"] as const;

/** Numeric fields of one face feature (centre as cx / cy); null for a tag with no numbers (tongue / notch). */
function faceFeatureValues(f: Record<string, unknown>, rounder: (v: number) => number = (v) => v): Record<string, number> | null {
  const out: Record<string, number> = {};
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

/** Every face feature of a result by pin key. */
function faceFeaturesOf(result: ResultLike): Map<string, Record<string, number>> {
  const out = new Map<string, Record<string, number>>();
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

export interface Preset {
  id: string;
  label: string;
  params: Record<string, unknown>;
  pins: Pins;
}

export interface PresetsFile {
  module: string;
  presets: Preset[];
}

export interface PinMismatch {
  path: string;
  expected: number | null;
  actual: number | null;
}

const FACES = ["x0", "x1", "y0", "y1", "z0", "z1"] as const;

/** Axis names of a profileVector point for a plane ("XY" → ["x","y"]). */
export function planeAxes(plane: string | undefined): [string, string] {
  if (plane === "YZ") return ["y", "z"];
  if (plane === "XZ") return ["x", "z"];
  return ["x", "y"];
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

/** Pin every board face, every outline point and every hinge hole of a result. */
export function collectPins(result: ResultLike): Pins {
  const pins: Pins = { boards: {}, points: {}, features: {}, faceFeatures: {} };
  for (const b of result.boards) {
    pins.boards![b.id] = { x0: round(b.x0), x1: round(b.x1), y0: round(b.y0), y1: round(b.y1), z0: round(b.z0), z1: round(b.z1) };
    if (b.cutProfileVector && b.cutProfileVector.length) {
      pins.points![`${b.id}.cut`] = b.cutProfileVector.map((p) => [round(p.y), round(p.z)]);
    }
    if (b.profileVector && b.profileVector.length) {
      const [a, c] = planeAxes(b.profilePlane);
      pins.points![`${b.id}.pv`] = b.profileVector.map((p) => [round(Number(p[a])), round(Number(p[c]))]);
    }
  }
  for (const f of result.features ?? []) {
    const h = f as { purpose?: string; boardId?: string; id?: string; center?: [number, number] };
    if (h && h.purpose === "hinge" && h.boardId && h.center) {
      const n = String(h.id).replace(`${h.boardId}_`, "");
      pins.features![`${h.boardId}.${n}`] = { x: round(h.center[0]), z: round(h.center[1]) };
    }
  }
  for (const [key, vals] of faceFeaturesOf(result)) {
    const rounded: Record<string, number> = {};
    for (const [k, v] of Object.entries(vals)) rounded[k] = round(v);
    pins.faceFeatures![key] = rounded;
  }
  if (result.zones && result.zones.length) {
    pins.zones = {};
    for (const z of result.zones) pins.zones[z.id] = { x0: round(z.x0), x1: round(z.x1), y0: round(z.y0), y1: round(z.y1), z0: round(z.z0), z1: round(z.z1) };
  }
  return pins;
}

/** Pins for one board only (bench "Pin board"). */
export function pinsForBoard(result: ResultLike, boardId: string): Pins {
  const all = collectPins(result);
  const out: Pins = { boards: {}, points: {}, features: {}, faceFeatures: {} };
  if (all.boards?.[boardId]) out.boards![boardId] = all.boards[boardId]!;
  for (const [k, v] of Object.entries(all.points ?? {})) if (k.startsWith(`${boardId}.`)) out.points![k] = v;
  for (const [k, v] of Object.entries(all.features ?? {})) if (k.startsWith(`${boardId}.`)) out.features![k] = v;
  for (const [k, v] of Object.entries(all.faceFeatures ?? {})) if (k.startsWith(`${boardId}.`)) out.faceFeatures![k] = v;
  return out;
}

/** Merge `add` into `base` (add wins). */
export function mergePins(base: Pins, add: Pins): Pins {
  return {
    boards: { ...(base.boards ?? {}), ...(add.boards ?? {}) },
    points: { ...(base.points ?? {}), ...(add.points ?? {}) },
    features: { ...(base.features ?? {}), ...(add.features ?? {}) },
    faceFeatures: { ...(base.faceFeatures ?? {}), ...(add.faceFeatures ?? {}) },
    ...(base.zones || add.zones ? { zones: { ...(base.zones ?? {}), ...(add.zones ?? {}) } } : {}),
  };
}

/** Every pinned value that the result does not reproduce within PIN_TOL_MM. */
export function checkPins(result: ResultLike, pins: Pins, tol = PIN_TOL_MM): PinMismatch[] {
  const out: PinMismatch[] = [];
  const byId = new Map(result.boards.map((b) => [b.id, b]));
  const near = (a: number | null | undefined, b: number | null | undefined) =>
    a != null && b != null && Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tol;

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
    let actual: number[][] | null = null;
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
        if (!near(v, actual![i]![k])) out.push({ path: `${key}[${i}][${k}]`, expected: v, actual: actual![i]![k] ?? null });
      });
    });
  }
  const hinges = new Map<string, [number, number]>();
  for (const f of result.features ?? []) {
    const h = f as { purpose?: string; boardId?: string; id?: string; center?: [number, number] };
    if (h && h.purpose === "hinge" && h.boardId && h.center) hinges.set(`${h.boardId}.${String(h.id).replace(`${h.boardId}_`, "")}`, h.center);
  }
  for (const [key, expected] of Object.entries(pins.features ?? {})) {
    const c = hinges.get(key);
    if (!c) {
      out.push({ path: key, expected: null, actual: null });
      continue;
    }
    if (!near(expected.x, c[0])) out.push({ path: `${key}.x`, expected: expected.x!, actual: c[0] });
    if (!near(expected.z, c[1])) out.push({ path: `${key}.z`, expected: expected.z!, actual: c[1] });
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

/** Number of pinned values in a Pins object. */
export function countPins(pins: Pins): number {
  let n = 0;
  for (const f of Object.values(pins.boards ?? {})) n += Object.keys(f).length;
  for (const f of Object.values(pins.zones ?? {})) n += Object.keys(f).length;
  for (const pts of Object.values(pins.points ?? {})) n += pts.reduce((s, p) => s + p.length, 0);
  for (const f of Object.values(pins.features ?? {})) n += Object.keys(f).length;
  for (const f of Object.values(pins.faceFeatures ?? {})) n += Object.keys(f).length;
  return n;
}
