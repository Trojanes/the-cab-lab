import type { OverheadLegacyGeometry } from "./geometry.ts";
import type { OverheadCabinetResult } from "./types.ts";
import { PV, columnOpenings, dimText, fitCanvas, fmt as fmtDim, frontRect, label, layoutDimensions, px, selectRect, spacedLabels, svgRoot, zoneColor, type ColumnOpening, type DimSpec, type PxBox } from "../_lib/preview.ts";

export interface OHCSvgPreviewOptions {
  width?: number;
  height?: number;
  selectedZoneIndex?: number;
  showDimensions?: boolean;
  gaps?: "clear" | "center";
  /** Split line, cabinet x. Drawn across the elevation. */
  splitX?: number | null;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));
}

function panelFill(type: string): string {
  if (type === "rangehood_flap") return "#d7b8f2";
  if (type === "fixed_panel") return "#d5dcc4";
  if (type === "open") return "#f3e39a";
  if (type === "up_flap") return "#b7e3a1";
  return "#8ec5ef";
}

export function generateOHCSvgPreview(
  geometry: OverheadLegacyGeometry,
  options: OHCSvgPreviewOptions = {},
): string {
  const width = options.width ?? 760;
  const height = options.height ?? 390;
  const showDimensions = options.showDimensions ?? true;
  const selectedZoneIndex = options.selectedZoneIndex ?? -1;
  const splitX = options.splitX != null && Number.isFinite(options.splitX) ? Number(options.splitX) : null;
  const centerGaps = options.gaps === "center";

  const cw = geometry.cabinet.Cw;
  const ch = geometry.cabinet.Ch ?? geometry.manufacturing.TCH;
  const fg = geometry.manufacturing.FGw;
  const fpThickness = geometry.manufacturing.FPt;
  const tch = geometry.manufacturing.TCH;
  const fzh = geometry.manufacturing.FZH;
  const clearance = geometry.front_panels[0]?.clearance ?? 0;

  const padLeft = 46;
  const padTop = 36;
  const scale = Math.min((width - padLeft - 30) / Math.max(cw, 1), (height - padTop - 96) / Math.max(ch, 1));
  const ox = padLeft;
  const oy = padTop;
  const bodyW = cw * scale;
  const bodyH = ch * scale;
  const toX = (x: number) => ox + x * scale;
  const toY = (z: number) => oy + (ch - z) * scale;
  const rectFromXZ = (x0: number, z0: number, x1: number, z1: number) => ({
    x: toX(x0),
    y: toY(z1),
    w: Math.max((x1 - x0) * scale, 1),
    h: Math.max((z1 - z0) * scale, 1),
  });

  const dividerRects = geometry.divider_features.map((feature, index) => {
    const x0 = feature.XDi - fg / 2;
    const x1 = feature.XDi + fg / 2;
    const clampedX0 = Math.max(0, x0);
    const clampedX1 = Math.min(cw, x1);
    const r = rectFromXZ(clampedX0, 0, clampedX1, ch);
    const isEdge = feature.XDi <= fg + 0.1 || feature.XDi >= cw - fg - 0.1;
    const centerX = toX(feature.XDi);
    const labelY = oy + bodyH + 56 + (index % 2) * 14;
    return `
      <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="rgba(92,75,55,0.45)" stroke="#6e5a42"></rect>
      ${isEdge ? `<text x="${fmt(centerX)}" y="${fmt(oy - 11)}" text-anchor="middle" fill="#6e5a42" font-size="10">edge divider</text>` : `
        <line x1="${fmt(centerX)}" y1="${fmt(oy - 8)}" x2="${fmt(centerX)}" y2="${fmt(oy + bodyH + 12)}" stroke="#e5484d" stroke-dasharray="5 4"></line>
        <text x="${fmt(centerX)}" y="${fmt(oy - 11)}" text-anchor="middle" fill="#e5484d" font-size="10">drag boundary</text>`}
      ${showDimensions ? `
        <line x1="${fmt(r.x)}" y1="${fmt(labelY)}" x2="${fmt(r.x + r.w)}" y2="${fmt(labelY)}" stroke="#6e5a42"></line>
        <line x1="${fmt(r.x)}" y1="${fmt(labelY - 4)}" x2="${fmt(r.x)}" y2="${fmt(labelY + 4)}" stroke="#6e5a42"></line>
        <line x1="${fmt(r.x + r.w)}" y1="${fmt(labelY - 4)}" x2="${fmt(r.x + r.w)}" y2="${fmt(labelY + 4)}" stroke="#6e5a42"></line>
        <text x="${fmt(r.x + r.w / 2)}" y="${fmt(labelY - 4)}" text-anchor="middle" fill="#6e5a42" font-size="10">${esc(feature.id)} ${fmt(fg)} mm</text>` : ""}
    `;
  }).join("");

  const dividers = [...geometry.divider_features].sort((a, b) => a.XDi - b.XDi);
  const bayGaps = dividers.slice(0, -1).map((a, i) => {
    const b = dividers[i + 1];
    const clear = Math.round((b.XDi - fg / 2 - (a.XDi + fg / 2)) * 10) / 10;
    const center = Math.round((b.XDi - a.XDi) * 10) / 10;
    if (clear < 8 || clear * scale < 16) return "";
    const x = toX((a.XDi + b.XDi) / 2);
    const y = toY(fzh / 2);
    const n = centerGaps ? center : clear;
    return `<text x="${fmt(x)}" y="${fmt(y)}" text-anchor="middle" fill="${centerGaps ? "#9a6b12" : "#2a6f97"}" font-size="10">${fmt(n)}</text>`;
  }).join("");
  const topClear = Math.round((ch - tch - fg) * 10) / 10;
  const topCenter = Math.round(((ch - tch / 2) - fg / 2) * 10) / 10;
  const heightGap = topClear >= 8 && topClear * scale >= 16
    ? `<text x="${fmt(toX(cw / 2))}" y="${fmt(toY((fg + ch - tch) / 2))}" text-anchor="middle" fill="${centerGaps ? "#9a6b12" : "#2a6f97"}" font-size="10">${fmt(centerGaps ? topCenter : topClear)}</text>`
    : "";

  const openingRects = geometry.front_panels.map((panel) => {
    const opening = rectFromXZ(panel.opening.x[0], 0, panel.opening.x[1], fzh);
    const selected = panel.zoneIndex === selectedZoneIndex;
    const dimensionY = oy + bodyH + 20 + (panel.zoneIndex % 2) * 15;
    return `
      <rect x="${fmt(opening.x)}" y="${fmt(opening.y)}" width="${fmt(opening.w)}" height="${fmt(opening.h)}" fill="${panelFill(panel.type)}" stroke="#6a7d90" stroke-width="1"></rect>
      ${selected ? `<rect x="${fmt(opening.x)}" y="${fmt(opening.y)}" width="${fmt(opening.w)}" height="${fmt(opening.h)}" fill="#0e3f8f" fill-opacity="0.62" stroke="#d7e6ff" stroke-width="3"></rect>` : ""}
      ${showDimensions ? `
        <line x1="${fmt(opening.x)}" y1="${fmt(dimensionY)}" x2="${fmt(opening.x + opening.w)}" y2="${fmt(dimensionY)}" stroke="#0f6bff"></line>
        <line x1="${fmt(opening.x)}" y1="${fmt(dimensionY - 4)}" x2="${fmt(opening.x)}" y2="${fmt(dimensionY + 4)}" stroke="#0f6bff"></line>
        <line x1="${fmt(opening.x + opening.w)}" y1="${fmt(dimensionY - 4)}" x2="${fmt(opening.x + opening.w)}" y2="${fmt(dimensionY + 4)}" stroke="#0f6bff"></line>
        <text x="${fmt(opening.x + opening.w / 2)}" y="${fmt(dimensionY - 3)}" text-anchor="middle" fill="#0f6bff" font-size="10">opening ${fmt(panel.opening.width)} mm</text>` : ""}
    `;
  }).join("");

  const frontPanelRects = geometry.front_panels.map((panel) => {
    const r = rectFromXZ(panel.x[0], panel.z[0], panel.x[1], panel.z[1]);
    const label = panel.type === "fixed_panel"
      ? "Fixed Panel"
      : panel.type === "rangehood_flap"
        ? "Rangehood Flap"
        : "Up Flap";
    return `
      <rect x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}" fill="none" stroke="#66758a" stroke-width="1.2"></rect>
      <text x="${fmt(r.x + r.w / 2)}" y="${fmt(r.y + r.h / 2 - 4)}" text-anchor="middle" fill="#22344d" font-size="12">${esc(label)}</text>
      <text x="${fmt(r.x + r.w / 2)}" y="${fmt(r.y + r.h / 2 + 13)}" text-anchor="middle" fill="#22344d" font-size="11">${esc(panel.id)}</text>
    `;
  }).join("");

  const hingeHoles = geometry.hinge_holes.map((hole) => {
    const panel = geometry.front_panels.find((candidate) => candidate.id === hole.boardId);
    if (!panel) return "";
    const x = panel.x[0] + hole.center[0];
    const z = panel.z[0] + hole.center[1];
    return `<circle cx="${fmt(toX(x))}" cy="${fmt(toY(z))}" r="${fmt(Math.max(hole.diameter / 2 * scale, 4))}" fill="none" stroke="#66758a" stroke-dasharray="4 2"></circle>`;
  }).join("");

  const bp = rectFromXZ(0, 0, cw, fg);
  const topArea = rectFromXZ(0, ch - tch, cw, ch);

  return `
    <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="OHC front elevation geometry preview">
      <rect x="0" y="0" width="${width}" height="${height}" fill="#f8fbff"></rect>
      ${showDimensions ? `
        <line x1="${fmt(ox)}" y1="${fmt(oy - 14)}" x2="${fmt(ox + bodyW)}" y2="${fmt(oy - 14)}" stroke="#222"></line>
        <text x="${fmt(ox + bodyW / 2)}" y="${fmt(oy - 18)}" text-anchor="middle" fill="#222" font-size="11">${fmt(cw)}</text>
        <line x1="${fmt(ox - 14)}" y1="${fmt(oy)}" x2="${fmt(ox - 14)}" y2="${fmt(oy + bodyH)}" stroke="#222"></line>
        <text x="${fmt(ox - 20)}" y="${fmt(oy + bodyH / 2)}" text-anchor="middle" fill="#222" font-size="11" transform="rotate(-90 ${fmt(ox - 20)} ${fmt(oy + bodyH / 2)})">${fmt(ch)}</text>` : ""}
      <rect x="${fmt(ox)}" y="${fmt(oy)}" width="${fmt(bodyW)}" height="${fmt(bodyH)}" fill="#f4f0e6" stroke="#5c4b37" stroke-width="2"></rect>
      <rect x="${fmt(topArea.x)}" y="${fmt(topArea.y)}" width="${fmt(topArea.w)}" height="${fmt(topArea.h)}" fill="rgba(15,107,255,0.06)" stroke="#85b5ff" stroke-dasharray="5 3"></rect>
      <text x="${fmt(topArea.x + topArea.w - 6)}" y="${fmt(topArea.y + 14)}" text-anchor="end" fill="#0b57d0" font-size="10">T1/T2 / TCH ${fmt(tch)}</text>
      ${openingRects}
      ${bayGaps}
      ${heightGap}
      ${frontPanelRects}
      <rect x="${fmt(bp.x)}" y="${fmt(bp.y)}" width="${fmt(bp.w)}" height="${fmt(bp.h)}" fill="#c7b9a2" stroke="#6e5a42"></rect>
      <text x="${fmt(bp.x + 6)}" y="${fmt(bp.y - 4)}" fill="#6e5a42" font-size="10">BP ${fmt(fg)} mm</text>
      ${dividerRects}
      ${splitX == null ? "" : `<line x1="${fmt(toX(splitX))}" y1="${fmt(oy - 6)}" x2="${fmt(toX(splitX))}" y2="${fmt(oy + bodyH + 8)}" stroke="#7eb6ff" stroke-width="1.5" stroke-dasharray="3 3"></line>`}
      ${hingeHoles}
      <text x="${fmt(ox + 4)}" y="${fmt(oy + bodyH + 18)}" fill="#6d7a8d" font-size="11">FGw ${fmt(fg)} mm, FPt/T1 ${fmt(fpThickness)} mm, clearance ${fmt(clearance)} mm</text>
    </svg>`;
}

// --- editor front view -------------------------------------------------------------------
//
// The wide editor page draws this one (the legacy picture above stays the
// generator's `debug.svgPreview`). Same family as the kitchen elevation: the
// emitted boards on the dark ground, the zone colours, and the board-to-board
// openings placed on the edges by `_lib/preview.ts` (width above the bottom
// edge, height beside the left edge, one readout at a time, no number on top of
// another). Each zone is a pick area with `data-zone-index`; the number under a
// zone (`.col-dim`, `data-col` = zone index) is the clearance or centre distance
// the panel lets you type.
//
// Display only: nothing here decides geometry.

export interface OHCFrontViewOptions {
  width?: number;
  maxHeight?: number;
  selectedZoneIndex?: number;
  showDimensions?: boolean;
  gaps?: "clear" | "center";
}

interface FrontViewPanel {
  id: string;
  zoneIndex: number;
  type: string;
  x: [number, number];
  z: [number, number];
}

/** Stored zone spans (boundary to boundary) and their two readouts, from the boards that bound each zone. */
export function ohcZoneOpenings(result: OverheadCabinetResult): Array<ColumnOpening & { index: number; x0: number; x1: number }> {
  const W = Number(result?.params?.cabinetWidth) || 0;
  const lines = (result?.debug?.dividerCenterlines ?? []).map(Number).filter((v) => Number.isFinite(v));
  const bounds = [0, ...lines.slice(1, -1), W];
  const spans = bounds.slice(0, -1).map((x0, i) => ({ id: String(i), x0, x1: bounds[i + 1] }));
  return columnOpenings(spans, result.boards).map((o, i) => ({ ...o, index: i, x0: spans[i].x0, x1: spans[i].x1 }));
}

const OHC_ZONE_LABELS: Record<string, string> = {
  up_flap: "Up flap",
  rangehood_flap: "Range hood",
  fixed_panel: "Fixed panel",
  open: "Open",
};

export function generateOHCFrontView(result: OverheadCabinetResult, options: OHCFrontViewOptions = {}): string | null {
  if (!result || !result.boards?.length) return null;
  const W = Number(result.params.cabinetWidth);
  const H = Number(result.params.cabinetHeight);
  if (!(W > 0) || !(H > 0)) return null;
  const geo = (result.debug?.legacyGeometry ?? null) as { front_panels?: FrontViewPanel[]; hinge_holes?: Array<{ boardId: string; center: [number, number]; diameter: number }> } | null;
  const panels = (geo?.front_panels ?? []).slice().sort((a, b) => a.zoneIndex - b.zoneIndex);
  const split = (result.debug as { split?: { x?: number } | null }).split;
  const splitX = split && Number.isFinite(split.x) ? Number(split.x) : null;
  const zones = ohcZoneOpenings(result);

  // The flaps hang below the bottom panel, so the drawing runs from the lowest board up to the top.
  const zLo = Math.min(0, ...result.boards.map((b) => b.z0));
  const span = H - zLo;
  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedZoneIndex ?? -1;
  const fitted = fitCanvas(W, span, width, options.maxHeight ?? 360, { l: 44, r: 16, t: 14, b: showDimensions ? 40 : 14 });
  const { scale, ox, oy, height } = fitted;
  const toX = (x: number) => ox + x * scale;
  const toY = (z: number) => oy + (H - z) * scale;
  const rect = (x0: number, x1: number, z0: number, z1: number) =>
    `x="${px(toX(x0))}" y="${px(toY(z1))}" width="${px(Math.max((x1 - x0) * scale, 0.8))}" height="${px(Math.max((z1 - z0) * scale, 0.8))}"`;
  const parts: string[] = [];
  const avoid: PxBox[] = [];
  const reserve = (x: number, y: number, text: string, size: number) => {
    const w = text.length * size * 0.62 + 4;
    const h = size + 6;
    avoid.push({ x0: x - w / 2, y0: y - h / 2, x1: x + w / 2, y1: y + h / 2 });
  };
  const panelOf = (i: number) => panels.find((p) => p.zoneIndex === i) ?? null;

  // Pick areas under everything: one per zone, full height.
  zones.forEach((z) => {
    const p = panelOf(z.index);
    parts.push(`<rect class="region" data-zone-index="${z.index}" ${rect(z.x0, z.x1, zLo, H)} fill="${zoneColor(p?.type)}" fill-opacity="0.18" stroke="none" />`);
  });

  // Boards, back to front; door stock last and see-through.
  const boards = [...result.boards].sort((a, b) => b.y0 - a.y0);
  for (const b of boards) {
    const r = frontRect(b);
    if (!r || r.x1 - r.x0 < 0.1 || r.z1 - r.z0 < 0.1) continue;
    const door = b.stock?.kind === "door";
    const isFront = b.y0 < -0.01;
    parts.push(
      `<rect data-board="${b.id}" pointer-events="none" ${rect(r.x0, r.x1, r.z0, r.z1)} fill="${door ? PV.front : PV.carcass}" ` +
      `fill-opacity="${isFront ? 0.55 : 0.92}" stroke="${door ? PV.frontLine : PV.carcassLine}" stroke-width="0.75" />`,
    );
  }

  // Type colour over each flap, light enough that the boards still read.
  for (const p of panels) parts.push(`<rect pointer-events="none" ${rect(p.x[0], p.x[1], p.z[0], p.z[1])} fill="${zoneColor(p.type)}" fill-opacity="0.28" stroke="none" />`);
  const sel = panelOf(selected);
  if (sel) parts.push(selectRect(rect(sel.x[0], sel.x[1], sel.z[0], sel.z[1])));

  // Hinge cups above the colour and the selection, so they stay visible.
  for (const h of geo?.hinge_holes ?? []) {
    const p = panels.find((pp) => pp.id === h.boardId);
    if (!p) continue;
    parts.push(`<circle cx="${px(toX(p.x[0] + h.center[0]))}" cy="${px(toY(p.z[0] + h.center[1]))}" r="${px(Math.max((h.diameter / 2) * scale, 2.5))}" fill="none" stroke="#f4fbff" stroke-width="1.5" pointer-events="none" />`);
  }

  // Outer envelope (carcass) and the split line.
  parts.push(`<rect ${rect(0, W, 0, H)} fill="none" stroke="${PV.envelope}" stroke-width="1.25" pointer-events="none" />`);
  if (splitX != null) {
    parts.push(`<line x1="${px(toX(splitX))}" y1="${px(toY(H) - 6)}" x2="${px(toX(splitX))}" y2="${px(toY(zLo) + 6)}" stroke="#7eb6ff" stroke-width="1.5" stroke-dasharray="3 3" pointer-events="none" />`);
  }

  // Zone name near the top of each flap.
  for (const p of panels) {
    const w = (p.x[1] - p.x[0]) * scale;
    if (w < 36) continue;
    const name = OHC_ZONE_LABELS[p.type] ?? p.type;
    const nx = toX((p.x[0] + p.x[1]) / 2);
    const ny = toY(p.z[1]) + 12;
    parts.push(label(nx, ny, w < 70 ? name.split(" ")[0] : name, { size: 11 }));
    reserve(nx, ny, name, 11);
  }

  const mode = options.gaps === "center" ? "center" : "clear";
  const color = mode === "center" ? "#e0a34f" : "#8ec5ef";
  const specs: DimSpec[] = [];
  if (showDimensions) {
    parts.push(spacedLabels([
      { y: toY(0), text: "0", fill: PV.text3 },
      { y: toY(H), text: fmtDim(H), fill: PV.text3 },
    ], ox - 6, "end"));

    // Under each zone: the number you can type (clearance or centre to centre).
    const yb = toY(zLo) + 12;
    zones.forEach((z) => {
      const x0 = toX(z.x0);
      const x1 = toX(z.x1);
      parts.push(`<line x1="${px(x0)}" y1="${px(yb - 4)}" x2="${px(x0)}" y2="${px(yb + 4)}" stroke="${PV.text3}" pointer-events="none" />`);
      parts.push(`<line x1="${px(x1)}" y1="${px(yb - 4)}" x2="${px(x1)}" y2="${px(yb + 4)}" stroke="${PV.text3}" pointer-events="none" />`);
      if (x1 - x0 < 24) return;
      const text = fmtDim(mode === "center" ? z.center : z.clear);
      const hit = Math.max(36, text.length * 8);
      const mid = (x0 + x1) / 2;
      const editable = zones.length > 1;
      parts.push(
        `<g class="col-dim${editable ? " editable" : ""}" data-col="${z.index}" data-width="${z.width}" data-clear="${z.clear}" data-center="${z.center}">` +
        `<title>${mode === "center" ? "Centre to centre" : "Clearance"} · click to type</title>` +
        (editable ? `<rect x="${px(mid - hit / 2)}" y="${px(yb - 9)}" width="${hit}" height="18" fill="transparent" />` : "") +
        `<text x="${px(mid)}" y="${px(yb)}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="${editable ? PV.boundary : PV.text2}" pointer-events="none">${text}</text>` +
        `</g>`,
      );
      reserve(mid, yb, text, 10);
    });
    const summary = `W ${fmtDim(W)} · H ${fmtDim(H)} · ${zones.length} zone${zones.length === 1 ? "" : "s"}`;
    const sy = yb + 22;
    parts.push(dimText(toX(W / 2), sy, summary, "middle", PV.text3));
    reserve(toX(W / 2), sy, summary, 10);

    // Inside each zone: its width above the bottom panel, and every opening up its left edge.
    const structural = result.boards.filter((b) => b.category !== "front_panel" && b.stock?.kind !== "door");
    const xPanels = structural.filter((b) => b.thicknessAxis === "X");
    const zPanels = structural.filter((b) => b.thicknessAxis === "Z");
    for (const z of zones) {
      const left = xPanels
        .filter((p) => p.x1 <= z.x0 + 0.8 || (p.x0 - 0.2 <= z.x0 && z.x0 <= p.x1 + 0.2))
        .sort((a, b) => (b.x0 + b.x1) - (a.x0 + a.x1))[0];
      const right = xPanels
        .filter((p) => p.x0 >= z.x1 - 0.8 || (p.x0 - 0.2 <= z.x1 && z.x1 <= p.x1 + 0.2))
        .sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1))[0];
      if (!left || !right) continue;
      const inLo = left.x1;
      const inHi = right.x0;
      const stack = zPanels
        .filter((b) => Math.min(b.x1, inHi) - Math.max(b.x0, inLo) > 20)
        .sort((a, b) => (a.z0 + a.z1) - (b.z0 + b.z1));
      const floor = stack[0];
      specs.push({
        axis: "x",
        from: mode === "center" ? (left.x0 + left.x1) / 2 : inLo,
        to: mode === "center" ? (right.x0 + right.x1) / 2 : inHi,
        edgeLo: floor ? floor.z1 : 0,
        edgeHi: stack.length > 1 ? stack[stack.length - 1].z0 : H,
        text: fmtDim(mode === "center" ? z.center : z.clear),
        color,
      });
      for (let k = 0; k < stack.length - 1; k += 1) {
        const a = stack[k];
        const b = stack[k + 1];
        const clear = b.z0 - a.z1;
        if (clear < 8) continue;
        const from = mode === "center" ? (a.z0 + a.z1) / 2 : a.z1;
        const to = mode === "center" ? (b.z0 + b.z1) / 2 : b.z0;
        specs.push({
          axis: "z", from, to, edgeLo: inLo, edgeHi: inHi,
          text: fmtDim(Math.round((to - from) * 10) / 10),
          color,
        });
      }
    }
  }
  parts.push(layoutDimensions(specs.filter((s) => Math.abs(s.to - s.from) * scale >= 18), toX, toY, avoid));

  return svgRoot(width, height, { scale, ox, oy, w: W, h: H }, "Overhead front elevation", parts.join(""));
}
