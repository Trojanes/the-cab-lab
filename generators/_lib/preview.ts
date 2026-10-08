/**
 * Shared look for the generator 2D previews (tall / kitchen / lounge): the
 * app's dark panel ground and the 3D board colours — the same palette as
 * bedroom/svgPreview.ts, so every editor view reads as one family.
 *
 * Display only: nothing here decides geometry. Callers pass generator output.
 */
import type { Board } from "./model.ts";

export const PV = {
  bg: "#1d2025",
  carcass: "#c9b799",
  carcassLine: "#4a4034",
  front: "#9ec5d8",
  frontLine: "#3f5a6a",
  boundary: "#e0a34f",
  select: "#0e3f8f",
  text: "#d8dde4",
  text2: "#9aa2ad",
  text3: "#6b737e",
  envelope: "#6b737e",
  hinge: "#243044",
  lock: "#5a3d22",
  warn: "#e5484d",
  font: "'Segoe UI', system-ui, sans-serif",
};

/** Pastel per functional-zone kind. Left and right doors share one blue; flaps share one green. */
const ZONE_COLOR: Record<string, string> = {
  left_door: "#8ec5ef",
  right_door: "#8ec5ef",
  double_door: "#8ec5ef",
  side_door: "#8ec5ef",
  left_side_door: "#8ec5ef",
  right_side_door: "#8ec5ef",
  up_flap: "#b7e3a1",
  down_flap: "#b7e3a1",
  top_flap: "#b7e3a1",
  bottom_flap: "#b7e3a1",
  rangehood_flap: "#d7b8f2",
  drawer: "#f0c27a",
  open: "#f3e39a",
  open_space: "#f3e39a",
  custom: "#e4d0b0",
  stove: "#f0a3a3",
  open_appliance: "#f0a3a3",
  fridge: "#8ed4d0",
  fixed_panel: "#d5dcc4",
  blank_panel: "#d5dcc4",
  unassigned: "#f0a3a3",
};

export function zoneColor(type: string | undefined | null): string {
  return (type && ZONE_COLOR[type]) || "#8ec5ef";
}

/** Deep blue over a zone so the selection reads against every pastel. */
export function selectRect(attrs: string): string {
  return `<rect pointer-events="none" ${attrs} fill="${PV.select}" fill-opacity="0.62" stroke="#d7e6ff" stroke-width="3" />`;
}

export function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

export const px = (v: number) => v.toFixed(2);

/** What a board shows from the front (x, z): its extent at its front-most y. */
export function frontRect(b: Board): { x0: number; x1: number; z0: number; z1: number } | null {
  const pv = (b.profileVector ?? []) as Array<Record<string, number>>;
  if (b.profilePlane === "XZ" || pv.length < 3) return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
  const ys = pv.map((q) => q.y).filter((v) => Number.isFinite(v));
  if (!ys.length) return { x0: b.x0, x1: b.x1, z0: b.z0, z1: b.z1 };
  const yMin = Math.min(...ys);
  const atFront = pv.filter((q) => Math.abs(q.y - yMin) < 0.6);
  if (b.profilePlane === "YZ") {
    const zs = atFront.map((q) => q.z);
    return zs.length >= 2 ? { x0: b.x0, x1: b.x1, z0: Math.min(...zs), z1: Math.max(...zs) } : null;
  }
  const xs = atFront.map((q) => q.x);
  return xs.length >= 2 ? { x0: Math.min(...xs), x1: Math.max(...xs), z0: b.z0, z1: b.z1 } : null;
}

/** Text with a dark halo so it reads over light boards. */
export function label(x: number, y: number, text: string, opts: { size?: number; fill?: string; anchor?: string; weight?: number } = {}): string {
  const { size = 11, fill = PV.text, anchor = "middle", weight } = opts;
  return `<text x="${px(x)}" y="${px(y)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${size}"${weight ? ` font-weight="${weight}"` : ""} fill="${fill}" ` +
    `stroke="${PV.bg}" stroke-opacity="0.85" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round" pointer-events="none">${esc(text)}</text>`;
}

/** Plain dimension text (no halo; sits on the ground outside the body). */
export function dimText(x: number, y: number, text: string, anchor = "middle", fill = PV.text2, size = 10): string {
  return `<text x="${px(x)}" y="${px(y)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="${size}" fill="${fill}" pointer-events="none">${esc(text)}</text>`;
}

/** Draggable boundary: a visible line (first child, styled on hover) + a wide transparent hit line. */
export function grip(attrs: string, x1: number, y1: number, x2: number, y2: number, dashed = false): string {
  const c = `x1="${px(x1)}" y1="${px(y1)}" x2="${px(x2)}" y2="${px(y2)}"`;
  return `<g class="boundary" ${attrs}>` +
    `<line ${c} stroke="${PV.boundary}" stroke-width="2"${dashed ? ` stroke-dasharray="6 4"` : ""} />` +
    `<line class="hit" ${c} stroke="transparent" stroke-width="12" pointer-events="stroke" />` +
    `</g>`;
}

/**
 * Labels down one edge with a minimum gap: entries closer than `gap` px to the
 * last drawn one are skipped (draggable ones win over fixed ones at a tie).
 */
export function spacedLabels(items: Array<{ y: number; text: string; fill: string; strong?: boolean }>, x: number, anchor: string, gap = 11): string {
  const sorted = [...items].sort((a, b) => a.y - b.y || Number(!!b.strong) - Number(!!a.strong));
  const out: string[] = [];
  let last = -Infinity;
  for (const it of sorted) {
    if (it.y - last < gap) continue;
    out.push(dimText(x, it.y, it.text, anchor, it.fill));
    last = it.y;
  }
  return out.join("");
}

/**
 * Fit a W × H body into a canvas `width` wide and at most `maxHeight` high;
 * the body is centred across, the canvas height follows the body.
 */
export function fitCanvas(W: number, H: number, width: number, maxHeight: number, pad: { l: number; r: number; t: number; b: number }) {
  const availW = width - pad.l - pad.r;
  const availH = maxHeight - pad.t - pad.b;
  const scale = Math.min(availW / Math.max(W, 1), availH / Math.max(H, 1));
  const ox = pad.l + (availW - W * scale) / 2;
  const oy = pad.t;
  const height = Math.round(H * scale + pad.t + pad.b);
  return { scale, ox, oy, height };
}

export interface BoardGap {
  axis: "x" | "z";
  clear: number;
  center: number;
  /** Midpoint of the clear gap, cabinet mm. */
  at: number;
  /** Midpoint of the shared run on the other axis, cabinet mm. */
  cross: number;
  /** Facing faces. Clearance runs from `aHi` to `bLo`. */
  aHi: number;
  bLo: number;
  /** Centre line of each board. */
  aMid: number;
  bMid: number;
  /** Shared run on the other axis. The dimension sits on the low edge of this. */
  crossLo: number;
  crossHi: number;
}

/**
 * Adjacent structural boards (thickness along X or Z, not a door). `clear` is the
 * open gap between the facing faces; `center` is centre line to centre line.
 * A pair is adjacent when nothing of the same kind sits between them on the span they share.
 */
export function boardGaps(boards: Board[]): BoardGap[] {
  const out: BoardGap[] = [];
  const structural = boards.filter((b) => b.category !== "front_panel" && b.stock?.kind !== "door");
  for (const axis of ["x", "z"] as const) {
    const thick = axis === "x" ? "X" : "Z";
    const list = structural.filter((b) => b.thicknessAxis === thick);
    const lo = (b: Board) => axis === "x" ? b.x0 : b.z0;
    const hi = (b: Board) => axis === "x" ? b.x1 : b.z1;
    const c0 = (b: Board) => axis === "x" ? b.z0 : b.x0;
    const c1 = (b: Board) => axis === "x" ? b.z1 : b.x1;
    const mid = (b: Board) => (lo(b) + hi(b)) / 2;
    const sorted = [...list].sort((a, b) => mid(a) - mid(b));
    for (let i = 0; i < sorted.length; i += 1) {
      for (let j = i + 1; j < sorted.length; j += 1) {
        const a = sorted[i];
        const b = sorted[j];
        const crossLo = Math.max(c0(a), c0(b));
        const crossHi = Math.min(c1(a), c1(b));
        if (crossHi - crossLo < 30) continue;
        const clear = lo(b) - hi(a);
        if (clear < 8) continue;
        const blocked = sorted.some((m, k) => {
          if (k === i || k === j) return false;
          if (mid(m) <= mid(a) || mid(m) >= mid(b)) return false;
          const share = Math.min(c1(m), crossHi) - Math.max(c0(m), crossLo);
          return share > 20 && lo(m) >= hi(a) - 1 && hi(m) <= lo(b) + 1;
        });
        if (blocked) continue;
        out.push({
          axis,
          clear: Math.round(clear * 10) / 10,
          center: Math.round((mid(b) - mid(a)) * 10) / 10,
          at: (hi(a) + lo(b)) / 2,
          cross: (crossLo + crossHi) / 2,
          aHi: hi(a),
          bLo: lo(b),
          aMid: mid(a),
          bMid: mid(b),
          crossLo,
          crossHi,
        });
      }
    }
  }
  return out;
}

export interface ColumnOpening {
  id: string;
  /** Stored column span: boundary to boundary. */
  width: number;
  /** Open distance between the two panel faces that bound the column. */
  clear: number;
  /** Centre of the left panel to centre of the right panel. */
  center: number;
}

/**
 * Each column as clearance and as centre-to-centre. Both differ from the stored
 * width by a fixed inset of the panels, so a typed clearance and a typed centre
 * distance change that width by the same delta, and switching the readout
 * converts one into the other without moving the cabinet.
 */
export function columnOpenings(
  columns: { id: string; x0: number; x1: number }[],
  boards: Board[],
): ColumnOpening[] {
  const panels = boards.filter((b) => b.thicknessAxis === "X" && b.category !== "front_panel");
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return columns.map((col) => {
    const width = r1(col.x1 - col.x0);
    const left = panels
      .filter((p) => p.x1 <= col.x0 + 0.8 || (p.x0 - 0.2 <= col.x0 && col.x0 <= p.x1 + 0.2))
      .sort((a, b) => (b.x0 + b.x1) - (a.x0 + a.x1))[0];
    const right = panels
      .filter((p) => p.x0 >= col.x1 - 0.8 || (p.x0 - 0.2 <= col.x1 && col.x1 <= p.x1 + 0.2))
      .sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1))[0];
    if (!left || !right) return { id: col.id, width, clear: width, center: width };
    return {
      id: col.id,
      width,
      clear: r1(right.x0 - left.x1),
      center: r1((right.x0 + right.x1) / 2 - (left.x0 + left.x1) / 2),
    };
  });
}

export interface PxBox { x0: number; y0: number; x1: number; y1: number }

/** A dimension to place. Width prefers the bottom edge (`edgeLo`); height prefers the left (`edgeLo`). */
export interface DimSpec {
  axis: "x" | "z";
  from: number;
  to: number;
  edgeLo: number;
  edgeHi: number;
  text: string;
  color: string;
  /** Lower is placed first, so it keeps the near side. */
  priority?: number;
}

function textWidth(text: string, size = 9): number {
  return text.length * size * 0.62 + 4;
}

function hits(a: PxBox, b: PxBox, pad = 3): boolean {
  return a.x0 - pad < b.x1 && a.x1 + pad > b.x0 && a.y0 - pad < b.y1 && a.y1 + pad > b.y0;
}

/**
 * One dimension bar. `side` -1 pulls a width bar up off its edge and a height
 * bar to the left; +1 drops a width bar down and a height bar to the right.
 * The number sits on the inner side of the bar. `toY` is z-up.
 */
function paintDim(
  toX: (n: number) => number,
  toY: (n: number) => number,
  spec: DimSpec,
  edge: number,
  side: 1 | -1,
  offsetPx: number,
  along: number,
): { svg: string; box: PxBox } | null {
  if (!(Math.abs(spec.to - spec.from) > 0.4)) return null;
  const tick = 3.5;
  const color = spec.color;
  const halo = `fill="${color}" stroke="${PV.bg}" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round"`;
  const w = textWidth(spec.text);
  const h = 12;
  if (spec.axis === "x") {
    const x0 = toX(Math.min(spec.from, spec.to));
    const x1 = toX(Math.max(spec.from, spec.to));
    if (x1 - x0 < 18) return null;
    const yEdge = toY(edge);
    const y = yEdge + side * offsetPx;
    const textY = y + side * 8;
    const mid = (x0 + x1) / 2 + along;
    if (mid < x0 || mid > x1) return null;
    const svg = `<g pointer-events="none" stroke="${color}">` +
      `<line x1="${px(x0)}" y1="${px(yEdge)}" x2="${px(x0)}" y2="${px(y + side * tick)}" stroke-width="0.6" />` +
      `<line x1="${px(x1)}" y1="${px(yEdge)}" x2="${px(x1)}" y2="${px(y + side * tick)}" stroke-width="0.6" />` +
      `<line x1="${px(x0)}" y1="${px(y)}" x2="${px(x1)}" y2="${px(y)}" stroke-width="0.8" />` +
      `<line x1="${px(x0)}" y1="${px(y - tick)}" x2="${px(x0)}" y2="${px(y + tick)}" stroke-width="0.8" />` +
      `<line x1="${px(x1)}" y1="${px(y - tick)}" x2="${px(x1)}" y2="${px(y + tick)}" stroke-width="0.8" />` +
      `<text x="${px(mid)}" y="${px(textY)}" text-anchor="middle" dominant-baseline="middle" font-size="9" ${halo} pointer-events="none">${esc(spec.text)}</text>` +
      `</g>`;
    return { svg, box: { x0: mid - w / 2, y0: textY - h / 2, x1: mid + w / 2, y1: textY + h / 2 } };
  }
  const y0 = toY(Math.max(spec.from, spec.to));
  const y1 = toY(Math.min(spec.from, spec.to));
  if (y1 - y0 < 18) return null;
  const xEdge = toX(edge);
  const x = xEdge + side * offsetPx;
  const textX = x + side * 5;
  const mid = (y0 + y1) / 2 + along;
  if (mid < y0 || mid > y1) return null;
  const anchor = side > 0 ? "start" : "end";
  const svg = `<g pointer-events="none" stroke="${color}">` +
    `<line x1="${px(xEdge)}" y1="${px(y0)}" x2="${px(x + side * tick)}" y2="${px(y0)}" stroke-width="0.6" />` +
    `<line x1="${px(xEdge)}" y1="${px(y1)}" x2="${px(x + side * tick)}" y2="${px(y1)}" stroke-width="0.6" />` +
    `<line x1="${px(x)}" y1="${px(y0)}" x2="${px(x)}" y2="${px(y1)}" stroke-width="0.8" />` +
    `<line x1="${px(x - tick)}" y1="${px(y0)}" x2="${px(x + tick)}" y2="${px(y0)}" stroke-width="0.8" />` +
    `<line x1="${px(x - tick)}" y1="${px(y1)}" x2="${px(x + tick)}" y2="${px(y1)}" stroke-width="0.8" />` +
    `<text x="${px(textX)}" y="${px(mid)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="9" ${halo} pointer-events="none">${esc(spec.text)}</text>` +
    `</g>`;
  const box = side > 0
    ? { x0: textX, y0: mid - h / 2, x1: textX + w, y1: mid + h / 2 }
    : { x0: textX - w, y0: mid - h / 2, x1: textX, y1: mid + h / 2 };
  return { svg, box };
}

/**
 * Place every bar so the numbers do not overlap. A width bar starts just above
 * its bottom edge, a height bar just inside its left edge. A number that would
 * land on another moves to the opposite edge, and only then steps further out.
 */
export function layoutDimensions(
  specs: DimSpec[],
  toX: (n: number) => number,
  toY: (n: number) => number,
  avoid: PxBox[] = [],
): string {
  const occupied = avoid.map((b) => ({ ...b }));
  const order = specs
    .map((spec, i) => ({ spec, i }))
    .sort((a, b) => (a.spec.priority ?? 1) - (b.spec.priority ?? 1) || Math.abs(a.spec.to - a.spec.from) - Math.abs(b.spec.to - b.spec.from));
  const out: string[] = [];
  for (const { spec } of order) {
    // Width: -1 is above the bottom edge. Height: +1 is inside the left edge.
    const preferred = spec.axis === "x" ? -1 : 1;
    const alongs = [0, -28, 28, -56, 56, -84, 84, -112, 112, -140, 140];
    let placed: { svg: string; box: PxBox } | null = null;
    for (const offset of [16, 58]) {
      for (const side of [preferred, -preferred] as const) {
        const edge = side === preferred ? spec.edgeLo : spec.edgeHi;
        for (const along of alongs) {
          const attempt = paintDim(toX, toY, spec, edge, side, offset, along);
          if (!attempt) continue;
          if (occupied.some((box) => hits(attempt.box, box))) continue;
          placed = attempt;
          break;
        }
        if (placed) break;
      }
      if (placed) break;
    }
    if (!placed) placed = paintDim(toX, toY, spec, spec.edgeLo, preferred as 1 | -1, 16, 0);
    if (!placed) continue;
    occupied.push(placed.box);
    out.push(placed.svg);
  }
  return out.join("");
}

/**
 * The openings for one readout. Clearance runs face to face. Centre to centre
 * runs centre line to centre line. Only the selected one is drawn.
 */
export function gapMarks(
  gaps: BoardGap[],
  toX: (n: number) => number,
  toY: (n: number) => number,
  scale: number,
  mode: "clear" | "center" = "clear",
  opts: { extra?: DimSpec[]; avoid?: PxBox[] } = {},
): string {
  const kind = mode === "center" ? "center" : "clear";
  const color = kind === "center" ? "#e0a34f" : "#8ec5ef";
  const specs: DimSpec[] = gaps
    .map((g) => {
      const from = kind === "center" ? g.aMid : g.aHi;
      const to = kind === "center" ? g.bMid : g.bLo;
      return {
        axis: g.axis,
        from,
        to,
        edgeLo: g.crossLo,
        edgeHi: g.crossHi,
        text: fmt(kind === "center" ? g.center : g.clear),
        color,
      };
    })
    .filter((s) => Math.abs(s.to - s.from) * scale >= 18);
  return layoutDimensions([...specs, ...(opts.extra ?? [])], toX, toY, opts.avoid ?? []);
}

export function svgRoot(width: number, height: number, data: Record<string, number>, aria: string, body: string): string {
  const d = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}" ${d} font-family="${PV.font}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${PV.bg}" />` + body + `</svg>`;
}
