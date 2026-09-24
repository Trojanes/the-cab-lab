/**
 * Lounge group — 2D plan (top-down SVG markup) from the last generation.
 *
 * A seat is ~420 high: its layout lives in XY, so the informative projection
 * is the plan. y = 0 is the room side, the wall is at the top of the drawing.
 * Runs come from `result.footprint` and sit underneath as faint pick areas with
 * `data-run`. On them: the standing boards (fronts, sides, partitions) as solid
 * strips — they read like walls on a floor plan — then the tops see-through,
 * the lids with their finger hole, top openings dashed, wheel-arch covers and
 * the middle cabinet outlined. Edge grips carry `data-boundary="edge"
 * data-param=<param> data-axis=x|y`, drawn only along an edge the run really
 * exposes (which param an edge drives is a module decision — see setRunEdge).
 * The root `<svg>` carries the mm → px mapping (`data-h` = plan depth).
 *
 * Display only: nothing here decides geometry.
 */
import type { LoungeResult } from "./types.ts";
import { PV, dimText, fitCanvas, fmt, grip, label, px, svgRoot } from "../_lib/preview.ts";

export interface LoungeSvgPreviewOptions {
  width?: number;
  maxHeight?: number;
  /** Selected run key: "i" | "main" | "l" | "left" | "right". */
  selectedRun?: string | null;
  showDimensions?: boolean;
}

interface XYRect { x0: number; x1: number; y0: number; y1: number }

export const LOUNGE_RUN_LABELS: Record<string, string> = {
  i: "Run",
  main: "Main run",
  l: "L wing",
  left: "Left leg",
  right: "Right leg",
};

const STYLE_LABEL: Record<string, string> = { I_SHAPE: "I", L_SHAPE: "L", U_SHAPE: "U", PARALLEL: "Parallel" };

export function generateLoungeSvgPreview(result: LoungeResult, options: LoungeSvgPreviewOptions = {}): string | null {
  if (!result || !result.boards.length) return null;
  const fp = result.footprint || {};
  const runs = (["i", "main", "l", "left", "right"] as const)
    .map((key) => ({ key, r: fp[key] as XYRect | undefined }))
    .filter((it): it is { key: "i" | "main" | "l" | "left" | "right"; r: XYRect } => !!it.r);
  if (!runs.length) return null;
  const style = result.params.style;
  const planW = Math.max(...runs.map((it) => it.r.x1), ...result.boards.map((b) => b.x1));
  const planH = Math.max(...runs.map((it) => it.r.y1));
  if (!(planW > 0) || !(planH > 0)) return null;

  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedRun ?? null;
  const { scale, ox, oy, height } = fitCanvas(planW, planH, width, options.maxHeight ?? 460, { l: 40, r: 16, t: 22, b: showDimensions ? 34 : 14 });
  const toX = (x: number) => ox + x * scale;
  const toY = (y: number) => oy + (planH - y) * scale; // wall (+y) at the top
  const rect = (r: XYRect) =>
    `x="${px(toX(r.x0))}" y="${px(toY(r.y1))}" width="${px(Math.max((r.x1 - r.x0) * scale, 0.8))}" height="${px(Math.max((r.y1 - r.y0) * scale, 0.8))}"`;
  const parts: string[] = [];

  // The wall line along the back.
  parts.push(`<line x1="${px(toX(0) - 8)}" y1="${px(toY(planH))}" x2="${px(toX(planW) + 8)}" y2="${px(toY(planH))}" stroke="${PV.text3}" stroke-width="3" stroke-opacity="0.55" pointer-events="none" />`);

  // Runs: the pick areas.
  for (const { key, r } of runs) {
    parts.push(`<rect class="region" data-run="${key}" ${rect(r)} fill="rgba(79,134,224,0.06)" stroke="none" />`);
  }

  // Tops see-through, then lids, then the standing boards as solid strips.
  const flat = result.boards.filter((b) => b.profilePlane === "XY");
  const standing = result.boards.filter((b) => b.profilePlane !== "XY");
  for (const b of flat.filter((bb) => bb.category !== "lid").sort((a, c) => a.z1 - c.z1)) {
    const warn = b.category === "avoidance_top";
    parts.push(`<rect data-board="${b.id}" pointer-events="none" ${rect(b)} fill="${warn ? PV.warn : PV.carcass}" fill-opacity="${warn ? 0.12 : 0.22}" stroke="${warn ? PV.warn : PV.carcassLine}" stroke-width="0.75"${warn ? ` stroke-dasharray="4 3"` : ""} />`);
  }
  for (const o of result.openings) {
    parts.push(`<rect pointer-events="none" ${rect({ x0: o.x0, x1: o.x0 + o.width, y0: o.y0, y1: o.y0 + o.depth })} fill="${PV.bg}" fill-opacity="0.35" stroke="${PV.text3}" stroke-dasharray="4 3" stroke-width="1" />`);
  }
  for (const lid of result.lids) {
    const r = { x0: lid.x0, x1: lid.x0 + lid.width, y0: lid.y0, y1: lid.y0 + lid.depth };
    parts.push(`<rect pointer-events="none" ${rect(r)} fill="${PV.carcass}" fill-opacity="0.5" stroke="${PV.carcassLine}" stroke-width="0.75" />`);
    parts.push(`<circle pointer-events="none" cx="${px(toX((r.x0 + r.x1) / 2))}" cy="${px(toY((r.y0 + r.y1) / 2))}" r="${px(Math.max((lid.holeDiameter / 2) * scale, 2))}" fill="${PV.bg}" stroke="${PV.carcassLine}" stroke-width="0.75" />`);
  }
  for (const b of standing) {
    parts.push(`<rect data-board="${b.id}" pointer-events="none" ${rect(b)} fill="${PV.carcass}" fill-opacity="0.95" stroke="${PV.carcassLine}" stroke-width="0.6" />`);
  }

  // The middle cabinet (parallel): outlined, it is not a run.
  const mid = result.boards.filter((b) => b.id.startsWith("middle_cabinet"));
  if (mid.length) {
    const r = { x0: Math.min(...mid.map((b) => b.x0)), x1: Math.max(...mid.map((b) => b.x1)), y0: Math.min(...mid.map((b) => b.y0)), y1: Math.max(...mid.map((b) => b.y1)) };
    parts.push(`<rect pointer-events="none" ${rect(r)} fill="none" stroke="${PV.select}" stroke-dasharray="6 3" stroke-width="1.25" />`);
    if ((r.x1 - r.x0) * scale > 50) parts.push(label(toX((r.x0 + r.x1) / 2), toY((r.y0 + r.y1) / 2), "middle cabinet", { size: 10, fill: "#8fb3ef" }));
  }

  // Run names + sizes.
  for (const { key, r } of runs) {
    const w = (r.x1 - r.x0) * scale;
    const h = (r.y1 - r.y0) * scale;
    if (w < 44 || h < 18) continue;
    const cx = toX((r.x0 + r.x1) / 2);
    const cy = toY((r.y0 + r.y1) / 2);
    const vertical = h > w * 1.6 && w < 70;
    if (vertical) {
      parts.push(`<g transform="rotate(-90 ${px(cx)} ${px(cy)})">${label(cx, cy, `${LOUNGE_RUN_LABELS[key]} · ${fmt(r.y1 - r.y0)} × ${fmt(r.x1 - r.x0)}`, { size: 10 })}</g>`);
    } else if (h >= 60) {
      // Near the wall edge of the run: the lid's finger hole sits in the middle.
      const top = toY(r.y1);
      parts.push(label(cx, top + 14, LOUNGE_RUN_LABELS[key], { size: 11 }));
      parts.push(label(cx, top + 28, `${fmt(r.x1 - r.x0)} × ${fmt(r.y1 - r.y0)}`, { size: 10, fill: PV.text2 }));
    } else if (h >= 34) {
      parts.push(label(cx, cy - 7, LOUNGE_RUN_LABELS[key], { size: 11 }));
      parts.push(label(cx, cy + 8, `${fmt(r.x1 - r.x0)} × ${fmt(r.y1 - r.y0)}`, { size: 10, fill: PV.text2 }));
    } else {
      parts.push(label(cx, cy, `${LOUNGE_RUN_LABELS[key]} · ${fmt(r.x1 - r.x0)} × ${fmt(r.y1 - r.y0)}`, { size: 10 }));
    }
  }

  // Selected run: an outline over everything.
  const sel = runs.find((it) => it.key === selected);
  if (sel) parts.push(`<rect pointer-events="none" ${rect(sel.r)} fill="${PV.select}" fill-opacity="0.12" stroke="${PV.select}" stroke-width="2" />`);

  // Edge grips → params (per style), only along edges a run exposes.
  const vline = (param: string, x: number, y0: number, y1: number) => parts.push(grip(`data-boundary="edge" data-param="${param}" data-axis="x"`, toX(x), toY(y0), toX(x), toY(y1)));
  const hline = (param: string, y: number, x0: number, x1: number) => parts.push(grip(`data-boundary="edge" data-param="${param}" data-axis="y"`, toX(x0), toY(y), toX(x1), toY(y)));
  if (style === "I_SHAPE" && fp.i) {
    vline("mainWidth", fp.i.x1, fp.i.y0, fp.i.y1);
    hline("mainDepth", fp.i.y1, fp.i.x0, fp.i.x1);
  } else if (style === "U_SHAPE" && fp.left && fp.right) {
    vline("mainWidth", fp.right.x1, fp.right.y0, fp.right.y1);
    vline("lDepth", fp.right.x0, fp.right.y0, fp.main ? fp.main.y0 : fp.right.y1);
    hline("mainDepth", fp.right.y1, fp.left.x0, fp.right.x1);
  } else if (style === "PARALLEL" && fp.left && fp.right) {
    vline("totalWidth", fp.right.x1, fp.right.y0, fp.right.y1);
    vline("singleLoungeWidth", fp.right.x0, fp.right.y0, fp.right.y1);
    hline("depth", fp.right.y1, fp.left.x0, fp.right.x1);
  } else if (fp.main && fp.l) {
    // L: main hugs the wall, the wing reaches toward the room. The wing's
    // inner edge faces the main run: LEFT wing x1, RIGHT wing x0.
    const wing = fp.l;
    const main = fp.main;
    const leftWing = wing.x0 <= main.x0;
    const innerX = leftWing ? wing.x1 : wing.x0;
    const far = leftWing ? main : wing; // the rect whose right edge is mainWidth
    vline("mainWidth", far.x1, far.y0, far.y1);
    vline("lDepth", innerX, wing.y0, main.y0);
    hline("lWidth", wing.y1, 0, planW);
    hline("mainDepth", main.y0, main.x0, main.x1);
  }

  if (showDimensions) {
    const wy = toY(planH) - 11;
    parts.push(dimText(toX(0), wy, "wall", "start", PV.text3));
    parts.push(dimText(toX(planW), wy, `W ${fmt(planW)}`, "end", PV.text2));
    parts.push(dimText(ox - 6, toY(planH / 2), fmt(planH), "end", PV.text2));
    parts.push(dimText(toX(planW / 2), toY(0) + 14, `room side · ${STYLE_LABEL[style] ?? style} · seat ${fmt(result.params.height)} high`, "middle", PV.text3));
  }

  return svgRoot(width, height, { scale, ox, oy, w: planW, h: planH }, "Lounge plan view", parts.join(""));
}
