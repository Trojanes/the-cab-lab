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
  select: "#4f86e0",
  text: "#d8dde4",
  text2: "#9aa2ad",
  text3: "#6b737e",
  envelope: "#6b737e",
  hinge: "#243044",
  lock: "#5a3d22",
  warn: "#e5484d",
  font: "'Segoe UI', system-ui, sans-serif",
};

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

export function svgRoot(width: number, height: number, data: Record<string, number>, aria: string, body: string): string {
  const d = Object.entries(data).map(([k, v]) => `data-${k}="${v}"`).join(" ");
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${esc(aria)}" ${d} font-family="${PV.font}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${PV.bg}" />` + body + `</svg>`;
}
