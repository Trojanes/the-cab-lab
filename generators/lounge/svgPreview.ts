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
import { PV, dimText, fitCanvas, fmt, grip, label, layoutDimensions, px, svgRoot, type DimSpec, type PxBox } from "../_lib/preview.ts";

export interface LoungeSvgPreviewOptions {
  width?: number;
  maxHeight?: number;
  /** Selected run key: "i" | "main" | "l" | "left" | "right". */
  selectedRun?: string | null;
  showDimensions?: boolean;
  /** The cabinet's stored params (seat widths the footprint does not carry). */
  params?: Record<string, unknown> & { singleLoungeWidth?: number; lDepth?: number; leftBackPanel?: boolean; rightBackPanel?: boolean };
  /** Which end stays along the wall when the width changes: −1 x = 0, +1 x = W (the drag grip goes on the other end). */
  widthAnchor?: number;
}

interface XYRect { x0: number; x1: number; y0: number; y1: number }

export const LOUNGE_RUN_LABELS: Record<string, string> = {
  i: "Run",
  main: "Main run",
  l: "L wing",
  left: "Left leg",
  right: "Right leg",
};

const STYLE_LABEL: Record<string, string> = { I_SHAPE: "I", L_SHAPE: "L", PARALLEL: "Parallel" };

export function generateLoungeSvgPreview(result: LoungeResult, options: LoungeSvgPreviewOptions = {}): string | null {
  if (!result || !result.boards.length) return null;
  const fp = result.footprint || {};
  const runs = (["i", "main", "l", "left", "right"] as const)
    .map((key) => ({ key, r: fp[key] as XYRect | undefined }))
    .filter((it): it is { key: "i" | "main" | "l" | "left" | "right"; r: XYRect } => !!it.r);
  if (!runs.length) return null;
  const style = result.params.style;
  const planW = Math.max(...runs.map((it) => it.r.x1), ...result.boards.map((b) => b.x1));
  const yMax = Math.max(...runs.map((it) => it.r.y1));
  const yMin = Math.min(0, ...runs.map((it) => it.r.y0));
  const planH = yMax;
  const span = yMax - yMin;
  if (!(planW > 0) || !(span > 0)) return null;

  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedRun ?? null;
  const { scale, ox, oy, height } = fitCanvas(planW, span, width, options.maxHeight ?? 460, { l: 52, r: 52, t: 34, b: showDimensions ? 30 : 14 });
  const toX = (x: number) => ox + x * scale;
  // y = 0 stays at the bottom when nothing hangs past the room face, so a drag still reads y from data-h.
  const toY = (y: number) => oy + (yMax - y) * scale; // wall (+y) at the top
  const rect = (r: XYRect) =>
    `x="${px(toX(r.x0))}" y="${px(toY(r.y1))}" width="${px(Math.max((r.x1 - r.x0) * scale, 0.8))}" height="${px(Math.max((r.y1 - r.y0) * scale, 0.8))}"`;
  const parts: string[] = [];
  const avoid: PxBox[] = []; // names the dimension numbers keep off

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
    if ((r.x1 - r.x0) * scale > 50) {
      const cx = toX((r.x0 + r.x1) / 2);
      const cy = toY((r.y0 + r.y1) / 2);
      parts.push(label(cx, cy, "middle cabinet", { size: 10, fill: "#8fb3ef" }));
      avoid.push({ x0: cx - 42, y0: cy - 9, x1: cx + 42, y1: cy + 9 });
    }
  }

  // Run names: the sizes are dimension bars along the edges (below), kept off the names.
  const nameBox = (x: number, y: number, text: string, size: number, vertical = false) => {
    const w = text.length * size * 0.6 + 6;
    avoid.push(vertical ? { x0: x - size, y0: y - w / 2, x1: x + size, y1: y + w / 2 } : { x0: x - w / 2, y0: y - size, x1: x + w / 2, y1: y + size });
  };
  for (const { key, r } of runs) {
    const w = (r.x1 - r.x0) * scale;
    const h = (r.y1 - r.y0) * scale;
    if (w < 44 || h < 18) continue;
    const cx = toX((r.x0 + r.x1) / 2);
    const cy = toY((r.y0 + r.y1) / 2);
    const name = LOUNGE_RUN_LABELS[key];
    if (h > w * 1.6 && w < 70) {
      parts.push(`<g transform="rotate(-90 ${px(cx)} ${px(cy)})">${label(cx, cy, name, { size: 10 })}</g>`);
      nameBox(cx, cy, name, 10, true);
    } else {
      const y = h >= 60 ? toY(r.y1) + 14 : cy;
      parts.push(label(cx, y, name, { size: 11 }));
      nameBox(cx, y, name, 11);
    }
  }

  // Selected run: an outline over everything.
  const sel = runs.find((it) => it.key === selected);
  if (sel) parts.push(`<rect pointer-events="none" ${rect(sel.r)} fill="${PV.select}" fill-opacity="0.12" stroke="${PV.select}" stroke-width="2" />`);

  // Edge grips → params (per style), only along edges a run exposes. The wall (y = D) never moves and
  // the end that stays along the wall (`widthAnchor`) has no grip: the other end and the room side do.
  const vline = (param: string, x: number, y0: number, y1: number) => parts.push(grip(`data-boundary="edge" data-param="${param}" data-axis="x"`, toX(x), toY(y0), toX(x), toY(y1)));
  const hline = (param: string, y: number, x0: number, x1: number) => parts.push(grip(`data-boundary="edge" data-param="${param}" data-axis="y"`, toX(x0), toY(y), toX(x1), toY(y)));
  const keepHi = (options.widthAnchor ?? -1) > 0;
  const p = options.params ?? {};
  const T = result.params.partitionPanelThickness ?? 18;
  const specs: DimSpec[] = [];
  const total = "#8ec5ef";
  const run = PV.text2;
  const edit = (param: string, value: number, title: string) => ({
    attrs: `data-param="${param}" data-value="${fmt(value)}"`,
    title: `${title} · click to type`,
  });
  if (style === "I_SHAPE" && fp.i) {
    const r = fp.i;
    if (keepHi) vline("mainWidthLo", r.x0, r.y0, r.y1); else vline("mainWidth", r.x1, r.y0, r.y1);
    hline("mainDepthFront", r.y0, r.x0, r.x1);
    specs.push({ axis: "x", from: r.x0, to: r.x1, edgeLo: r.y1, edgeHi: r.y0, side: -1, text: fmt(r.x1 - r.x0), color: total, priority: 0, ...edit("mainWidth", r.x1 - r.x0, "Length along the wall") });
    specs.push({ axis: "z", from: r.y0, to: r.y1, edgeLo: keepHi ? r.x0 : r.x1, edgeHi: keepHi ? r.x1 : r.x0, side: keepHi ? -1 : 1, text: fmt(r.y1 - r.y0), color: total, priority: 0, ...edit("mainDepth", r.y1 - r.y0, "Seat depth, wall to the room side") });
  } else if (style === "PARALLEL" && fp.left && fp.right) {
    const L = fp.left;
    const R = fp.right;
    const W = R.x1 - L.x0;
    const D = Math.max(L.y1, R.y1);
    if (keepHi) vline("totalWidthLo", L.x0, L.y0, L.y1); else vline("totalWidth", R.x1, R.y0, R.y1);
    vline("singleLoungeWidth", R.x0, Math.max(0, R.y0), R.y1);
    hline("depthFront", 0, L.x0, R.x1);
    const SW = Number(p.singleLoungeWidth) || (L.x1 - L.x0);
    const lIn = p.leftBackPanel === true ? T : 0;
    const rIn = p.rightBackPanel === true ? T : 0;
    const lSeat = [L.x0 + lIn, L.x0 + lIn + SW];
    const rSeat = [R.x1 - rIn - SW, R.x1 - rIn];
    specs.push({ axis: "x", from: L.x0, to: R.x1, edgeLo: D, edgeHi: 0, side: -1, text: fmt(W), color: total, priority: 0, ...edit("totalWidth", W, "Outer face to outer face") });
    specs.push({ axis: "z", from: 0, to: D, edgeLo: keepHi ? R.x1 : L.x0, edgeHi: keepHi ? L.x0 : R.x1, side: keepHi ? 1 : -1, text: fmt(D), color: total, priority: 0, ...edit("depth", D, "Run length, wall to the aisle end") });
    specs.push({ axis: "x", from: lSeat[0], to: lSeat[1], edgeLo: 0, edgeHi: D, text: fmt(SW), color: run, ...edit("singleLoungeWidth", SW, "Run width (both runs)") });
    specs.push({ axis: "x", from: rSeat[0], to: rSeat[1], edgeLo: 0, edgeHi: D, text: fmt(SW), color: run, ...edit("singleLoungeWidth", SW, "Run width (both runs)") });
    if (rSeat[0] - lSeat[1] > 1) specs.push({ axis: "x", from: lSeat[1], to: rSeat[0], edgeLo: 0, edgeHi: D, text: fmt(rSeat[0] - lSeat[1]), color: PV.text3 });
  } else if (fp.main && fp.l) {
    // L: main hugs the wall, the wing reaches toward the room. The wing's
    // inner edge faces the main run: LEFT wing x1, RIGHT wing x0.
    const wing = fp.l;
    const main = fp.main;
    const leftWing = wing.x0 <= main.x0;
    const innerX = leftWing ? wing.x1 : wing.x0;
    const W = Math.max(wing.x1, main.x1) - Math.min(wing.x0, main.x0);
    const D = main.y1;
    // The wing end stays on its side wall: the free end is the main run's far end.
    if (leftWing) vline("mainWidth", main.x1, main.y0, main.y1); else vline("mainWidthLo", main.x0, main.y0, main.y1);
    vline("lDepth", innerX, Math.max(0, wing.y0), main.y0);
    hline("lWidthFront", 0, wing.x0, wing.x1);
    hline("mainDepth", main.y0, main.x0, main.x1);
    const seat = Number(p.lDepth) || (wing.x1 - wing.x0);
    const wingSeat = leftWing ? [innerX - seat, innerX] : [innerX, innerX + seat];
    const outerX = leftWing ? wing.x0 : wing.x1;
    const freeX = leftWing ? main.x1 : main.x0;
    specs.push({ axis: "x", from: Math.min(wing.x0, main.x0), to: Math.max(wing.x1, main.x1), edgeLo: D, edgeHi: 0, side: -1, text: fmt(W), color: total, priority: 0, ...edit("mainWidth", W, "Overall width along the wall") });
    specs.push({ axis: "z", from: 0, to: D, edgeLo: outerX, edgeHi: freeX, side: leftWing ? -1 : 1, text: fmt(D), color: total, priority: 0, ...edit("lWidth", D, "Wall to the room end of the wing") });
    specs.push({ axis: "z", from: main.y0, to: main.y1, edgeLo: freeX, edgeHi: innerX, side: leftWing ? -1 : 1, text: fmt(main.y1 - main.y0), color: run, ...edit("mainDepth", main.y1 - main.y0, "Main run seat depth") });
    specs.push({ axis: "x", from: wingSeat[0], to: wingSeat[1], edgeLo: 0, edgeHi: main.y0, text: fmt(seat), color: run, ...edit("lDepth", seat, "Wing seat width") });
    specs.push({ axis: "x", from: main.x0, to: main.x1, edgeLo: main.y0, edgeHi: main.y1, text: fmt(main.x1 - main.x0), color: PV.text3 });
  }
  // The middle cabinet (parallel): its width along its room edge, its depth up its side.
  if (mid.length) {
    const r = { x0: Math.min(...mid.map((b) => b.x0)), x1: Math.max(...mid.map((b) => b.x1)), y0: Math.min(...mid.map((b) => b.y0)), y1: Math.max(...mid.map((b) => b.y1)) };
    specs.push({ axis: "x", from: r.x0, to: r.x1, edgeLo: r.y0, edgeHi: r.y1, text: fmt(r.x1 - r.x0), color: "#8fb3ef", ...edit("middleCabinet.width", r.x1 - r.x0, "Middle cabinet width") });
    specs.push({ axis: "z", from: r.y0, to: r.y1, edgeLo: r.x0, edgeHi: r.x1, text: fmt(r.y1 - r.y0), color: "#8fb3ef", ...edit("middleCabinet.depth", r.y1 - r.y0, "Middle cabinet depth") });
  }

  if (showDimensions) {
    parts.push(layoutDimensions(specs.filter((sp) => Math.abs(sp.to - sp.from) * scale >= 18), toX, toY, avoid));
    parts.push(dimText(toX(planW / 2), toY(yMin) + 16, `room side · ${STYLE_LABEL[style] ?? style} · seat ${fmt(result.params.height)} high`, "middle", PV.text3));
  }

  return svgRoot(width, height, { scale, ox, oy, w: planW, h: planH }, "Lounge plan view", parts.join(""));
}
