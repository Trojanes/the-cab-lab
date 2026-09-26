/**
 * Milling face: the CNC cuts from above only, so every board is machined from
 * one big face (A or B) — the face that lies up on the table.
 *
 *   - Partial-depth work (a groove, T-groove, blind hole such as a hinge cup,
 *     a pocket, or a rebate in stacked slabs) must all be on that face.
 *   - Through work (outline, through holes / slots) is cut from any side; it is
 *     listed on the milling face (A and B share one (u, v) frame, so the numbers
 *     do not change when a through feature moves face).
 *   - Single-sided door stock (`stock.sides` 1): the colour face lies on the
 *     table, so the milling face is the back.
 *   - Double-sided / carcass stock: the face that carries the work; with no
 *     partial-depth work, the back / inside face (else A).
 *
 * A board with partial-depth work on both faces, or on the colour face of
 * single-sided stock, cannot be made in one setup: a milling issue, reported
 * on `result.milling.issues` (not a validation error).
 */
import type { Board, Face, FaceId, ProfilePoint } from "./model.ts";

export interface MillingIssue {
  board: string;
  reason: "both-faces" | "colour-face";
  message: string;
}

export interface MillingResult {
  issues: MillingIssue[];
}

const WORK = new Set(["groove", "tgroove", "hole", "cutout"]);
const CARCASS = /stipple/i;
const EPS = 0.01;

const partial = (f: { kind: string; through?: boolean }) => WORK.has(f.kind) && !f.through;
const through = (f: { kind: string; through?: boolean }) => WORK.has(f.kind) && !!f.through;

function bboxArea(pts: ProfilePoint[] | undefined): number {
  if (!pts || !pts.length) return 0;
  const xs = pts.map((p) => Number((p as { x?: number }).x ?? 0));
  const ys = pts.map((p) => Number((p as { y?: number }).y ?? 0));
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}

/** A rebate in stacked XY slabs: the face on the side of the slab with less material, or null. */
function slabRebateFace(b: Board): FaceId | null {
  if (!b.slabs || b.slabs.length < 2 || b.thicknessAxis !== "Z") return null;
  const material = (s: NonNullable<Board["slabs"]>[number]) => bboxArea(s.outline) - (s.holes ?? []).reduce((a, h) => a + bboxArea(h), 0);
  const bottom = b.slabs.reduce((a, s) => (s.z0 < a.z0 ? s : a));
  const top = b.slabs.reduce((a, s) => (s.z1 > a.z1 ? s : a));
  if (material(bottom) < material(top) - EPS) return "B"; // −Z
  if (material(top) < material(bottom) - EPS) return "A"; // +Z
  return null;
}

/** The colour face of single-sided door stock (it lies on the table), or null. */
function colourFaceOf(b: Board, A: Face, B: Face): Face | null {
  if (b.stock?.kind !== "door" || b.stock.sides === 2) return null;
  return [A, B].find((f) => f.visible === true && f.finish?.colour && !CARCASS.test(f.finish.colour)) ?? null;
}

/**
 * The face used when nothing forces one: the back / inside face; else the face
 * the generator already lists the through work on; else A.
 */
function defaultFace(A: Face, B: Face, colour: Face | null): FaceId {
  if (colour) return colour.id === "A" ? "B" : "A";
  const inward = (f: Face) => f.semantic === "inside" || f.semantic === "back" || f.semantic === "wall";
  if (inward(B) && !inward(A)) return "B";
  if (inward(A) && !inward(B)) return "A";
  if (A.visible === true && B.visible !== true) return "B";
  if (B.visible === true && A.visible !== true) return "A";
  if (B.features.some(through) && !A.features.some(through)) return "B";
  return "A";
}

/** Sets `board.milling`, moves through features onto that face, and lists the boards that need a second setup. */
export function applyMilling(boards: Board[]): MillingResult {
  const issues: MillingIssue[] = [];
  for (const b of boards) {
    const A = b.faces?.find((f) => f.id === "A");
    const B = b.faces?.find((f) => f.id === "B");
    if (!A || !B) continue;
    const rebate = slabRebateFace(b);
    const onA = A.features.some(partial) || rebate === "A";
    const onB = B.features.some(partial) || rebate === "B";
    const colour = colourFaceOf(b, A, B);
    let face: FaceId;
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
