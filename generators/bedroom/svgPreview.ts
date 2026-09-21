/**
 * Bedroom body — 2D front elevation (SVG markup) from the last generation.
 *
 * Seen from the room, looking at the room face: local X left → right, Z up.
 * The five regions are drawn as rectangles (the roof slope runs away from the
 * viewer and is not visible here); each carries `data-region` so the panel can
 * select it. The layout boundaries — boot deck, wardrobe inner faces, overhead
 * underside — carry `data-boundary` (the layout key),
 * `data-axis` (x | z) and `data-side` (−1 | 1 for the mirrored pair) so the
 * panel can drag them. The root `<svg>` carries the mm → px mapping
 * (`data-scale`, `data-ox`, `data-oy`, `data-w`, `data-h`).
 *
 * Display only: nothing here decides geometry.
 */

import type { BedroomResult, BedroomZoneId } from "./types.ts";

export interface BedroomSvgPreviewOptions {
  width?: number;
  height?: number;
  selectedRegion?: BedroomZoneId | null;
  showDimensions?: boolean;
}

function esc(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmt(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(1)));
}

const FILL: Record<BedroomZoneId, string> = {
  boot: "#e8dcc6",
  wardrobeL: "#dbe9f4",
  wardrobeR: "#dbe9f4",
  opening: "#ffffff",
  ohc: "#e5f2ff",
};

export function generateBedroomSvgPreview(result: BedroomResult, options: BedroomSvgPreviewOptions = {}): string | null {
  if (!result || result.validation.errors.length || !result.zones.length) return null;
  const width = options.width ?? 760;
  const p = result.params;
  const W = p.width;
  const H = p.height;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedRegion ?? null;

  const padLeft = 54;
  const padRight = 24;
  const padTop = 20;
  const padBottom = 30;
  const scale = (width - padLeft - padRight) / Math.max(W, 1);
  const height = options.height ?? Math.round(H * scale + padTop + padBottom);
  const ox = padLeft;
  const oy = padTop;
  const toX = (x: number) => ox + x * scale;
  const toY = (z: number) => oy + (H - z) * scale;

  const parts: string[] = [];

  // Regions.
  for (const z of result.zones) {
    const x = toX(z.x0);
    const y = toY(z.z1);
    const w = Math.max((z.x1 - z.x0) * scale, 1);
    const h = Math.max((z.z1 - z.z0) * scale, 1);
    const sel = z.id === selected;
    const isVoid = z.kind === "void";
    parts.push(
      `<rect class="region${sel ? " sel" : ""}${isVoid ? " void" : ""}" data-region="${z.id}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${h.toFixed(2)}" fill="${FILL[z.id]}" stroke="${sel ? "#4f86e0" : "#8a8378"}" stroke-width="${sel ? 2.5 : 1}"${isVoid ? ' stroke-dasharray="6 4"' : ""} />`,
    );
    const cx = x + w / 2;
    const cy = y + h / 2;
    const name = z.label;
    const size = `${fmt(z.x1 - z.x0)} × ${fmt(z.z1 - z.z0)}${z.boards && z.boards.length ? ` · ${z.boards.length} boards` : ""}`;
    const small = w < 70 * 1 || h < 30;
    parts.push(
      `<text class="label" x="${cx.toFixed(2)}" y="${(cy - (small ? 0 : 5)).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="${small ? 9 : 11}" fill="#3b352d" pointer-events="none">${esc(name)}</text>`,
    );
    if (!small) {
      parts.push(
        `<text class="label size" x="${cx.toFixed(2)}" y="${(cy + 9).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="#6b6357" pointer-events="none">${esc(size)}</text>`,
      );
    }
  }

  // The bed frame in the opening: a dimension line just above the deck (display only, not draggable).
  const bedW = result.layout.bedFrameWidth;
  const bx0 = (W - bedW) / 2;
  const bx1 = bx0 + bedW;
  const by = toY(p.bootHeight) - 14;
  parts.push(
    `<g class="bed" pointer-events="none">` +
      `<line x1="${toX(bx0).toFixed(2)}" y1="${by.toFixed(2)}" x2="${toX(bx1).toFixed(2)}" y2="${by.toFixed(2)}" stroke="#6b6357" stroke-width="1" />` +
      `<line x1="${toX(bx0).toFixed(2)}" y1="${(by - 5).toFixed(2)}" x2="${toX(bx0).toFixed(2)}" y2="${(by + 5).toFixed(2)}" stroke="#6b6357" stroke-width="1" />` +
      `<line x1="${toX(bx1).toFixed(2)}" y1="${(by - 5).toFixed(2)}" x2="${toX(bx1).toFixed(2)}" y2="${(by + 5).toFixed(2)}" stroke="#6b6357" stroke-width="1" />` +
      `<text x="${toX(W / 2).toFixed(2)}" y="${(by - 7).toFixed(2)}" text-anchor="middle" dominant-baseline="auto" font-size="10" fill="#6b6357">bed ${fmt(bedW)} · ${fmt(result.layout.bedMargin)} each side</text>` +
      `</g>`,
  );

  const boundary = (key: string, axis: "x" | "z", side: number, x1: number, y1: number, x2: number, y2: number) => {
    parts.push(
      `<g class="boundary" data-boundary="${key}" data-axis="${axis}" data-side="${side}">` +
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="#e0a34f" stroke-width="2" />` +
        `<line class="hit" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="transparent" stroke-width="12" />` +
        `</g>`,
    );
  };
  boundary("bootHeight", "z", 0, toX(0), toY(p.bootHeight), toX(W), toY(p.bootHeight));
  boundary("wardrobeWidth", "x", -1, toX(p.wardrobeWidth), toY(p.bootHeight), toX(p.wardrobeWidth), toY(H));
  boundary("wardrobeWidth", "x", 1, toX(W - p.wardrobeWidth), toY(p.bootHeight), toX(W - p.wardrobeWidth), toY(H));
  boundary("ohcBottom", "z", 0, toX(p.wardrobeWidth), toY(p.ohcBottom), toX(W - p.wardrobeWidth), toY(p.ohcBottom));

  // Outer envelope on top so the edges stay crisp.
  parts.push(`<rect x="${toX(0).toFixed(2)}" y="${toY(H).toFixed(2)}" width="${(W * scale).toFixed(2)}" height="${(H * scale).toFixed(2)}" fill="none" stroke="#3b352d" stroke-width="1.5" pointer-events="none" />`);

  if (showDimensions) {
    const dimText = (x: number, y: number, text: string, anchor = "middle", fill = "#6b6357") =>
      parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" fill="${fill}" pointer-events="none">${esc(text)}</text>`);
    // Heights down the left edge.
    for (const [z, warm] of [[0, false], [p.bootHeight, true], [p.ohcBottom, true], [H, false]] as Array<[number, boolean]>) {
      dimText(ox - 6, toY(z), fmt(z), "end", warm ? "#b5762a" : "#6b6357");
    }
    // Widths along the bottom.
    const yb = toY(0) + 14;
    dimText(toX(p.wardrobeWidth / 2), yb, fmt(p.wardrobeWidth));
    dimText(toX(W / 2), yb, `${fmt(result.layout.openingWidth)} opening`);
    dimText(toX(W - p.wardrobeWidth / 2), yb, fmt(p.wardrobeWidth));
    dimText(toX(W), toY(H) - 9, `W ${fmt(W)} · roof ${fmt(H)} at the room face`, "end");
  }

  return (
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bedroom body front elevation" ` +
    `data-scale="${scale}" data-ox="${ox}" data-oy="${oy}" data-w="${W}" data-h="${H}">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="#f8fbff" />` +
    parts.join("") +
    `</svg>`
  );
}
