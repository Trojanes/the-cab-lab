/**
 * Board-level contract — the invariants a generator's `boards` output must
 * satisfy before the cnjob boundary can turn them into workpieces.
 * `buildCnjob` enforces these; generator tests may call them directly to
 * prove a result is contract-clean without exporting.
 *
 * The feature checks mirror what the OmniCam importer rejects downstream
 * (blind needs a positive depth within the sheet, a hole needs centre and
 * diameter, a groove needs a slot, a cutout needs an outline).
 */
import type { Board, FaceFeature } from "./model.ts";
import { localOutline, rectOutline } from "./model.ts";

/** FaceFeature kinds the cnjob boundary machines. tongue / notch stay as
 * edge tags in the outline; unknown kinds are skipped by the emitter. */
export const MACHINED_FEATURE_KINDS = new Set(["groove", "tgroove", "hole", "cutout"]);

/** First failing rule for one face feature, or null. `blind` = !through. */
export function featureIssue(f: FaceFeature, blind: boolean, sheetThicknessMm: number): string | null {
  if (blind && !(typeof f.depth === "number" && f.depth > 0)) return "has no depth";
  if (blind && f.depth! > sheetThicknessMm + 0.01) return `is ${f.depth} deep on a ${sheetThicknessMm} mm board`;
  if (f.kind === "hole") {
    if (!f.center || !(f.diameter && f.diameter > 0)) return "has no centre or diameter";
    return null;
  }
  if (f.kind === "groove" || f.kind === "tgroove") {
    if (f.u0 == null || f.u1 == null || f.v0 == null || f.v1 == null) return "has no slot";
    const w = Math.min(Math.abs(f.u1 - f.u0), Math.abs(f.v1 - f.v0));
    if (w <= 0.01) return "has no slot";
    return null;
  }
  if (f.u0 == null || f.u1 == null || f.v0 == null || f.v1 == null) return "has no outline";
  return null;
}

function signedArea(pts: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

/** The board's grain direction on the sheet, from a visible A/B face finish
 * (`u` runs along the board's local u axis = sheet X, `v` = sheet Y). */
export function grainAxis(board: Board, grained: boolean): "X" | "Y" | undefined {
  if (!grained) return undefined;
  const faces = (board.faces ?? []).filter((f) => f.id === "A" || f.id === "B");
  const coloured = faces.find((f) => f.finish?.grain && f.visible) ?? faces.find((f) => f.finish?.grain);
  const axis = coloured?.finish?.grain;
  if (axis === "u") return "X";
  if (axis === "v") return "Y";
  return undefined;
}

/**
 * Board-level issues: an outline with ≥3 points and real area, and (when the
 * sheet is grained) a grain direction. Feature-level problems are reported
 * separately by `featureIssue` — this only checks what a board needs even
 * before its features are looked at.
 */
export function boardIssues(board: Board, sheet: { thicknessMm: number; grained?: boolean }): string[] {
  const issues: string[] = [];
  if (!board.id) issues.push("board has no id");
  const outline = localOutline(board) ?? rectOutline(board);
  if (outline.length < 3) issues.push("the outline has fewer than 3 points");
  else if (outline.some((p) => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
    issues.push("the outline has non-finite points");
  } else if (Math.abs(signedArea(outline)) < 1e-6) issues.push("the outline has no area");
  if (sheet.grained && !grainAxis(board, true)) issues.push("textured HPL has no grain direction");
  return issues;
}
