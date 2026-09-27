/**
 * The nesting sheet a board is cut from. Not stored on the board or in
 * job.json: `sheetMaterial` reads `stock`, the colour face and the cabinet
 * params already copied from the job catalogue.
 *
 * materialId is one sheet: `{series}-{decor}-{1s|2s}-{thickness}`, lower-case,
 * hyphen-separated. Two boards share an id only when they can be nested on the
 * same sheet. The part's role stays `board.id`.
 *
 *   carcass / partition → pvc, White Stipple, always 2s
 *     pvc-white-stipple-2s-15
 *   door → params.doorSeries (acrylic | hpl), the colour face's name, sides
 *     acrylic-gloss-white-1s-16
 *     hpl-chestnut-1s-16
 *
 * `colorName` is the display name. `grained` is true for textured HPL; Felt
 * Grey is the HPL decor with no grain direction (renderer/doorSwatches.js).
 */
import type { Board, Face } from "./model.ts";
import { carcassColourOf, doorColourOf, doorSidesOf } from "./finish.ts";

export type SheetSeries = "pvc" | "acrylic" | "hpl";
export type SurfaceMode = "SINGLE_SIDED" | "DOUBLE_SIDED";

export interface SheetMaterial {
  materialId: string;
  thicknessMm: number;
  colorName: string;
  surfaceMode: SurfaceMode;
  series: SheetSeries;
  grained: boolean;
}

/** HPL decors with no wood-grain direction. Keep in step with doorSwatches.js. */
const UNGRAINED_HPL = new Set(["Felt Grey"]);

export interface SheetParams {
  doorSeries?: unknown;
  doorSides?: unknown;
  doorColorName?: unknown;
  doorColor?: unknown;
  carcassColorName?: unknown;
  carcassColor?: unknown;
}

/** "SuperMatt Forest Green" → supermatt-forest-green. */
export function decorSlug(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function thicknessToken(mm: number): string {
  const r = Math.round(mm * 10) / 10;
  return Number.isInteger(r) ? String(r) : String(r);
}

function seriesOf(board: Board, params: SheetParams | null | undefined): SheetSeries {
  if (board.stock?.kind === "door") return params && params.doorSeries === "hpl" ? "hpl" : "acrylic";
  return "pvc";
}

function colourFace(board: Board, carcass: string): Face | undefined {
  const faces = (board.faces ?? []).filter((f) => (f.id === "A" || f.id === "B") && f.finish?.colour && f.finish.colour !== carcass);
  return faces.find((f) => f.visible === true) ?? faces[0];
}

function thicknessOf(board: Board): number {
  const t = board.stock?.thickness;
  return typeof t === "number" && Number.isFinite(t) ? t : board.materialThickness;
}

/** The sheet this board is cut from. */
export function sheetMaterial(board: Board, params?: SheetParams | null): SheetMaterial {
  const series = seriesOf(board, params);
  const carcass = carcassColourOf(params);
  const colorName = series === "pvc"
    ? carcass
    : (colourFace(board, carcass)?.finish?.colour || doorColourOf(params));
  const single = series !== "pvc" && (board.stock?.sides === 1 || (board.stock?.sides !== 2 && doorSidesOf(params) === "single"));
  const surfaceMode: SurfaceMode = single ? "SINGLE_SIDED" : "DOUBLE_SIDED";
  const sides = single ? "1s" : "2s";
  const thicknessMm = thicknessOf(board);
  return {
    materialId: `${series}-${decorSlug(colorName)}-${sides}-${thicknessToken(thicknessMm)}`,
    thicknessMm,
    colorName,
    surfaceMode,
    series,
    grained: series === "hpl" && !UNGRAINED_HPL.has(colorName),
  };
}
