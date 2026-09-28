/**
 * Grooves the user drew on a board face (Groove command), merged into a
 * generator result. They live on the cabinet, not in the generator:
 *
 *   cabinet.overrides.boards[roleId].grooves = [
 *     { id, face: "A" | "B", kind: "groove" | "tgroove", u0, u1, v0, v1, depth, group? }
 *   ]
 *
 * (u, v) is the board's face-local frame (`planeAxes`, from the u0 / v0 faces),
 * the same frame generator features use, so role ids keep the grooves on the
 * right board when the cabinet is resized. A groove that no longer fits its
 * board is skipped with a warning, never clipped silently.
 *
 * After merging, the one-side milling check runs again so a user groove on
 * the other face from a hinge cup is reported like any generator feature.
 */
import type { Board, FaceFeature } from "./model.ts";
import { planeAxes } from "./model.ts";
import { applyMilling, type MillingIssue } from "./milling.ts";

export interface UserGroove {
  id: string;
  face: "A" | "B";
  kind: "groove" | "tgroove";
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  depth: number;
  /** T-groove: the rectangles drawn as one T share a group id. */
  group?: string;
}

interface Overrides {
  boards?: Record<string, { grooves?: UserGroove[] } | undefined>;
}

interface Result {
  boards?: Board[];
  milling?: { issues: MillingIssue[] };
  validation?: { errors: string[]; warnings: string[] };
  [k: string]: unknown;
}

/** Deepest a user groove may go: the board keeps at least this much under it. */
export const GROOVE_MIN_FLOOR_MM = 1;
/** Narrowest groove kept. */
export const GROOVE_MIN_WIDTH_MM = 0.5;

/** Face-local size of a board: `{ w, h, t }` along (u, v, thickness). */
export function faceSize(b: Board): { w: number; h: number; t: number } {
  const [U, V, T] = planeAxes(b.profilePlane);
  const span = (a: string) => Math.abs((b as unknown as Record<string, number>)[`${a}1`] - (b as unknown as Record<string, number>)[`${a}0`]);
  return { w: span(U), h: span(V), t: span(T) };
}

/** Why a groove cannot go on this board, or null. */
export function grooveProblem(b: Board, g: UserGroove): string | null {
  const { w, h, t } = faceSize(b);
  const u0 = Math.min(g.u0, g.u1);
  const u1 = Math.max(g.u0, g.u1);
  const v0 = Math.min(g.v0, g.v1);
  const v1 = Math.max(g.v0, g.v1);
  if (u1 - u0 < GROOVE_MIN_WIDTH_MM || v1 - v0 < GROOVE_MIN_WIDTH_MM) return "is narrower than 0.5";
  if (u0 < -0.01 || v0 < -0.01 || u1 > w + 0.01 || v1 > h + 0.01) return `runs off the ${Math.round(w)} × ${Math.round(h)} face`;
  if (!(g.depth > 0)) return "has no depth";
  if (g.depth > t - GROOVE_MIN_FLOOR_MM + 0.001) return `is ${g.depth} deep in ${t} stock (at most ${t - GROOVE_MIN_FLOOR_MM})`;
  return null;
}

/** Same result when no board carries a user groove; otherwise a copy with them merged and milling re-checked. */
export function applyUserGrooves<R extends Result>(result: R, overrides: Overrides | null | undefined): R {
  const byBoard = overrides?.boards;
  if (!result || !result.boards || !byBoard) return result;
  const wanted = Object.entries(byBoard).filter(([, o]) => o && Array.isArray(o.grooves) && o.grooves.length);
  if (!wanted.length) return result;
  const boards: Board[] = structuredClone(result.boards);
  const warnings: string[] = [];
  for (const [roleId, o] of wanted) {
    const b = boards.find((x) => x.id === roleId);
    if (!b) { warnings.push(`Groove on ${roleId}: that board is no longer made`); continue; }
    for (const g of o!.grooves!) {
      const problem = grooveProblem(b, g);
      if (problem) { warnings.push(`Groove ${g.id} on ${roleId} ${problem}: skipped`); continue; }
      const face = b.faces?.find((f) => f.id === g.face);
      if (!face) { warnings.push(`Groove ${g.id} on ${roleId}: face ${g.face} missing`); continue; }
      const feature: FaceFeature = {
        id: `user-${g.id}`,
        kind: g.kind === "tgroove" ? "tgroove" : "groove",
        u0: Math.min(g.u0, g.u1),
        u1: Math.max(g.u0, g.u1),
        v0: Math.min(g.v0, g.v1),
        v1: Math.max(g.v0, g.v1),
        depth: g.depth,
        for: g.group ? `user:${g.group}` : "user",
        source: "user",
      };
      face.features = [...face.features, feature];
    }
  }
  const milling = applyMilling(boards);
  const v = result.validation ?? { errors: [], warnings: [] };
  return {
    ...result,
    boards,
    milling,
    validation: { ...v, warnings: [...(v.warnings ?? []), ...warnings] },
  };
}
