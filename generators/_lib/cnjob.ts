/**
 * Manufacturing snapshot (.cnjob) for OmniCAM.
 *
 * One workpiece per board. Snapshot A is the face the cutter looks down on:
 * a board whose milling face is B is mirrored in v first, then every ring is
 * wound the way the snapshot requires (outer counter-clockwise, openings
 * clockwise). The closing point is not repeated.
 *
 * Red checks refuse the whole job. Yellow warnings do not. Callers pass every
 * board, including ones hidden in the 3D view. `edgeBands` stays empty until
 * a module's edges are confirmed (`cnjobEdgeBands`).
 */
import type { Board, FaceFeature } from "./model.ts";
import { localOutline, rectOutline } from "./model.ts";
import { decorSlug, sheetMaterial, type SheetParams } from "./material.ts";
import { cnjobEdgeBands } from "./edgeBand.ts";

export const CNJOB_SCHEMA = "cabinetnc.manufacturing-snapshot";
export const CNJOB_VERSION = "1.1.0";
export const PRODUCER = "the-cab-lab";
export const PRODUCER_VERSION = "0.2.0";

type Pt = [number, number];

export interface CnjobCabinet {
  id: string;
  moduleId: string;
  params?: SheetParams | null;
  boards: Board[];
  errors?: string[];
  grainIssues?: string[];
  millingIssues?: string[];
}

export interface CnjobInput {
  jobId: string;
  /** Red lines that are not on a cabinet result: outside the space, overlaps, an illegal wall. */
  fitIssues?: string[];
  cabinets: CnjobCabinet[];
}

export type CnjobOutcome =
  | { ok: true; snapshot: Record<string, unknown>; boardCount: number; materialIds: string[] }
  | { ok: false; reasons: string[] };

const r3 = (n: number) => Math.round(n * 1000) / 1000;
const ARC_STEPS = 4;

function signedArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of pts) {
    const q: Pt = [r3(p[0]), r3(p[1])];
    const prev = out[out.length - 1];
    if (prev && Math.abs(prev[0] - q[0]) < 0.001 && Math.abs(prev[1] - q[1]) < 0.001) continue;
    out.push(q);
  }
  if (out.length > 1) {
    const a = out[0]!;
    const b = out[out.length - 1]!;
    if (Math.abs(a[0] - b[0]) < 0.001 && Math.abs(a[1] - b[1]) < 0.001) out.pop();
  }
  return out;
}

function wind(pts: Pt[], ccw: boolean): Pt[] {
  const ring = dedupe(pts);
  if (ring.length < 3) return ring;
  const positive = signedArea(ring) > 0;
  return positive === ccw ? ring : ring.slice().reverse();
}

/** Corner arcs of a rounded rectangle, counter-clockwise, radius clamped to the short side. */
function roundedRect(u0: number, v0: number, u1: number, v1: number, radius: number): Pt[] {
  const left = Math.min(u0, u1);
  const right = Math.max(u0, u1);
  const bottom = Math.min(v0, v1);
  const top = Math.max(v0, v1);
  const r = Math.min(Math.max(0, radius), (right - left) / 2, (top - bottom) / 2);
  if (r < 0.05) return [[left, bottom], [right, bottom], [right, top], [left, top]];
  const corner = (cx: number, cy: number, a0: number, a1: number): Pt[] => {
    const pts: Pt[] = [];
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
    ...corner(left + r, bottom + r, Math.PI, Math.PI * 3 / 2),
  ];
}

interface Frame { mirrorV: boolean; vPivot: number }

function frameOf(milling: string | undefined, outline: Pt[]): Frame {
  if (milling !== "B") return { mirrorV: false, vPivot: 0 };
  let min = Infinity;
  let max = -Infinity;
  for (const p of outline) {
    min = Math.min(min, p[1]);
    max = Math.max(max, p[1]);
  }
  return { mirrorV: true, vPivot: min + max };
}

function mapPt(p: Pt, frame: Frame): Pt {
  return [p[0], frame.mirrorV ? frame.vPivot - p[1] : p[1]];
}

function mapRing(pts: Pt[], frame: Frame, ccw: boolean): Pt[] {
  return wind(pts.map((p) => mapPt(p, frame)), ccw);
}

function slotOf(f: FaceFeature): { width: number; line: [Pt, Pt] } | null {
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

function finishOf(colour: string | undefined): { finishId: string; finishName: string } | undefined {
  const name = String(colour || "").trim();
  if (!name) return undefined;
  return { finishId: decorSlug(name), finishName: name };
}

interface Workpiece {
  workpieceId: string;
  panelId: string;
  name: string;
  quantity: number;
  identity: { projectId: string; moduleId: string; role: string };
  material: Record<string, unknown>;
  geometry: Record<string, unknown>;
  faces: Record<string, unknown>[];
  features: Record<string, unknown>[];
  manufacturing: { mode: "singleSide"; machiningFace: "A" | "EITHER" };
  grainDirection?: "X" | "Y";
  edgeBands: [];
}

function grainAxis(board: Board, grained: boolean): "X" | "Y" | undefined {
  if (!grained) return undefined;
  const faces = (board.faces ?? []).filter((f) => f.id === "A" || f.id === "B");
  const coloured = faces.find((f) => f.finish?.grain && f.visible) ?? faces.find((f) => f.finish?.grain);
  const axis = coloured?.finish?.grain;
  if (axis === "u") return "X";
  if (axis === "v") return "Y";
  return undefined;
}

function buildBoard(
  jobId: string,
  cab: CnjobCabinet,
  board: Board,
  reasons: string[],
): { workpiece: Workpiece; material: Record<string, unknown> } | null {
  const where = `${cab.id}/${board.id}`;
  const outline0 = localOutline(board) ?? rectOutline(board);
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
  const features: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  const tessellated = { value: false };
  const sources = either
    ? (board.faces ?? []).filter((f) => f.id === "A" || f.id === "B")
    : (millingFace ? [millingFace] : []);
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
      if (blind && f.depth! > sheet.thicknessMm + 0.01) {
        reasons.push(`${where}: ${id} is ${f.depth} deep on a ${sheet.thicknessMm} mm board`);
        continue;
      }
      if (f.kind === "hole") {
        if (!f.center || !(f.diameter && f.diameter > 0)) {
          reasons.push(`${where}: ${id} has no centre or diameter`);
          continue;
        }
        const c = mapPt(f.center, frame);
        const feat: Record<string, unknown> = {
          featureId: id,
          kind: "bore",
          sourceFace: "A",
          through: !blind,
          geometry: { center: [r3(c[0]), r3(c[1])], diameterMm: f.diameter },
        };
        if (blind) feat.depthMm = f.depth;
        if (f.for) feat.intent = { purpose: f.for };
        features.push(feat);
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
        const feat: Record<string, unknown> = {
          featureId: id,
          kind: "groove",
          sourceFace: "A",
          through: !blind,
          geometry: {
            centerline: [[r3(a[0]), r3(a[1])], [r3(b[0]), r3(b[1])]],
            widthMm: r3(slot.width),
          },
        };
        if (blind) feat.depthMm = f.depth;
        if (f.for) feat.intent = { purpose: f.for };
        features.push(feat);
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
      const feat: Record<string, unknown> = {
        featureId: id,
        kind: f.through ? "throughProfile" : "pocket",
        sourceFace: f.through ? "THROUGH" : "A",
        through: !!f.through,
        geometry: { profile: { closed: true, points: loop } },
        hasArc: radius > 0.05,
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
    displayName: `${sheet.colorName} · ${single ? "single" : "double"}-sided · ${sheet.thicknessMm} mm`,
  };
  const workpiece: Workpiece = {
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
      decorId: decorSlug(sheet.colorName),
    },
    geometry: {
      quality: tessellated.value ? "tessellated" : "exact",
      toleranceMm: tessellated.value ? 0.3 : 0.01,
      outerProfile: { closed: true, points: outer },
      nestingPolygon: outer,
    },
    faces: [
      {
        faceId: "A",
        role: "machining",
        machiningPermission: either ? "ALLOWED" : "PRIMARY",
        ...(finishOf(millingFace?.finish?.colour) ? { finish: finishOf(millingFace?.finish?.colour) } : {}),
      },
      {
        faceId: "B",
        role: single ? "colour" : "back",
        machiningPermission: single ? "NOT_ALLOWED" : "ALLOWED",
        ...(finishOf(otherFace?.finish?.colour) ? { finish: finishOf(otherFace?.finish?.colour) } : {}),
      },
    ],
    features,
    manufacturing: { mode: "singleSide", machiningFace: either ? "EITHER" : "A" },
    edgeBands: cnjobEdgeBands(board),
  };
  if (grain) workpiece.grainDirection = grain;
  return { workpiece, material };
}

/** The snapshot, or the red lines that refuse it. An empty job is refused too. */
export function buildCnjob(input: CnjobInput): CnjobOutcome {
  const reasons: string[] = [...(input.fitIssues ?? [])];
  for (const cab of input.cabinets) {
    for (const msg of cab.errors ?? []) reasons.push(`${cab.id}: ${msg}`);
    for (const msg of cab.grainIssues ?? []) reasons.push(`${cab.id}: ${msg}`);
    for (const msg of cab.millingIssues ?? []) reasons.push(`${cab.id}: ${msg}`);
  }
  const workpieces: Workpiece[] = [];
  const materials = new Map<string, Record<string, unknown>>();
  if (!reasons.length) {
    for (const cab of input.cabinets) {
      for (const board of cab.boards) {
        const built = buildBoard(input.jobId || "job", cab, board, reasons);
        if (!built) continue;
        workpieces.push(built.workpiece);
        if (!materials.has(built.material.materialId as string)) materials.set(built.material.materialId as string, built.material);
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
      exportedAt: new Date().toISOString(),
      source: { producer: PRODUCER, producerVersion: PRODUCER_VERSION },
      materials: [...materials.values()],
      workpieces,
      relationships: [],
      diagnostics: [],
    },
  };
}
