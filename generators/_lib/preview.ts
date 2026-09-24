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
        });
      }
    }
  }
  return out;
}

/** One number in the gap: clearance between the faces, or centre line to centre line. */
export function gapMarks(gaps: BoardGap[], toX: (n: number) => number, toY: (n: number) => number, scale: number, mode: "clear" | "center" = "clear"): string {
  const center = mode === "center";
  return gaps.map((g) => {
    if (g.clear * scale < 16) return "";
    const x = g.axis === "x" ? toX(g.at) : toX(g.cross);
    const y = g.axis === "z" ? toY(g.at) : toY(g.cross);
    return label(x, y, fmt(center ? g.center : g.clear), { size: 9, fill: center ? "#e0a34f" : "#8ec5ef" });
  }).join("");
}

export function svgRoot(width: number, height: number, data: Record<string, number>, aria: string, body: string): string {
  const d = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}" ${d} font-family="${PV.font}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${PV.bg}" />` + body + `</svg>`;
}
