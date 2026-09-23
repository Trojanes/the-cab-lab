/**
 * Bedroom body — 2D front elevation (SVG markup) from the last generation.
 *
 * Seen from the room, looking at the room face: local X left → right, Z up.
 * What is drawn is the boards the generator emitted, each as its outline seen
 * from the front (the edge a YZ / XY board shows at its front, an XZ board's
 * face), in the 3D colours: carcass stock, door stock see-through so the
 * carcass behind a door still reads. The five regions sit underneath as faint
 * pick areas with `data-region` so the panel can select them. The layout
 * boundaries — boot deck, wardrobe inner faces, overhead underside, Style 1
 * fixed-panel split, overhead bays — carry `data-boundary` (the layout key),
 * `data-axis` (x | z) and `data-side` (−1 | 1 for the mirrored pair) so the
 * panel can drag them. The root `<svg>` carries the mm → px mapping
 * (`data-scale`, `data-ox`, `data-oy`, `data-w`, `data-h`).
 *
 * Display only: nothing here decides geometry.
 */

import type { Board, BedroomResult, BedroomZoneId } from "./types.ts";

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

/** The app's dark panel and the 3D board colours, so the three views read as one. */
const C = {
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
};

const REGION_FILL: Record<BedroomZoneId, string> = {
  boot: "rgba(201,183,153,0.07)",
  wardrobeL: "rgba(79,134,224,0.06)",
  wardrobeR: "rgba(79,134,224,0.06)",
  opening: "rgba(255,255,255,0.015)",
  ohc: "rgba(79,134,224,0.06)",
};

/** What a board shows from the front, in body (x, z): its extent at its front-most y. */
function frontRect(b: Board): { x0: number; x1: number; z0: number; z1: number } | null {
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
  const padTop = 22;
  const padBottom = 30;
  const scale = (width - padLeft - padRight) / Math.max(W, 1);
  const height = options.height ?? Math.round(H * scale + padTop + padBottom);
  const ox = padLeft;
  const oy = padTop;
  const toX = (x: number) => ox + x * scale;
  const toY = (z: number) => oy + (H - z) * scale;
  const rectAttrs = (x0: number, x1: number, z0: number, z1: number) =>
    `x="${toX(x0).toFixed(2)}" y="${toY(z1).toFixed(2)}" width="${Math.max((x1 - x0) * scale, 0.8).toFixed(2)}" height="${Math.max((z1 - z0) * scale, 0.8).toFixed(2)}"`;

  const parts: string[] = [];

  // Regions: faint pick areas under the boards.
  for (const z of result.zones) {
    const sel = z.id === selected;
    const isVoid = z.kind === "void";
    parts.push(
      `<rect class="region${sel ? " sel" : ""}${isVoid ? " void" : ""}" data-region="${z.id}" ${rectAttrs(z.x0, z.x1, z.z0, z.z1)} fill="${REGION_FILL[z.id]}" stroke="none" />`,
    );
  }

  // Boards, back to front; door stock last and see-through.
  const boards = [...result.boards].sort((a, b) => b.y0 - a.y0);
  for (const b of boards) {
    const r = frontRect(b);
    if (!r || r.x1 - r.x0 < 0.1 || r.z1 - r.z0 < 0.1) continue;
    const isFront = b.y0 < -0.01;
    const doorStock = b.stock?.kind === "door";
    const kind = b.id.endsWith("_DOOR") ? "front door" : b.id.startsWith("OHC_FP") ? "front flap" : b.id.endsWith("_FIXED") ? "front fixed" : isFront ? "front" : "board";
    const fill = doorStock ? C.front : C.carcass;
    const line = doorStock ? C.frontLine : C.carcassLine;
    const opacity = isFront ? 0.55 : 0.92;
    parts.push(
      `<rect class="${kind}" data-board="${esc(b.id)}" pointer-events="none" ${rectAttrs(r.x0, r.x1, r.z0, r.z1)} fill="${fill}" fill-opacity="${opacity}" stroke="${line}" stroke-width="0.75" />`,
    );
  }

  // Hinge cups on the doors (face-local on the door), projected onto this elevation.
  for (const b of result.boards) {
    if (b.profilePlane !== "XZ") continue;
    const face = b.faces?.find((f) => f.id === "A");
    if (!face) continue;
    for (const ft of face.features) {
      if (ft.kind !== "hole" || ft.for !== "hinge" || !ft.center) continue;
      const x = b.x0 + ft.center[0];
      const z = b.z0 + ft.center[1];
      const r = Math.max(((ft.diameter || 35) / 2) * scale, 1.5);
      parts.push(`<circle class="hinge" cx="${toX(x).toFixed(2)}" cy="${toY(z).toFixed(2)}" r="${r.toFixed(2)}" fill="none" stroke="${C.hinge}" stroke-width="1" pointer-events="none" />`);
    }
  }

  // Region names, with a dark halo so they read over light boards.
  for (const z of result.zones) {
    const w = (z.x1 - z.x0) * scale;
    const h = (z.z1 - z.z0) * scale;
    if (w < 40 || h < 22) continue;
    const cx = toX((z.x0 + z.x1) / 2);
    const cy = toY((z.z0 + z.z1) / 2);
    const halo = `stroke="${C.bg}" stroke-opacity="0.85" stroke-width="2.5" paint-order="stroke" stroke-linejoin="round"`;
    parts.push(`<text class="label" x="${cx.toFixed(2)}" y="${(cy - 5).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="11" fill="${C.text}" ${halo} pointer-events="none">${esc(z.label)}</text>`);
    if (w >= 70 && h >= 34) {
      parts.push(`<text class="label size" x="${cx.toFixed(2)}" y="${(cy + 9).toFixed(2)}" text-anchor="middle" dominant-baseline="middle" font-size="10" fill="${C.text2}" ${halo} pointer-events="none">${esc(`${fmt(z.x1 - z.x0)} × ${fmt(z.z1 - z.z0)}`)}</text>`);
    }
  }

  // The bed frame in the opening: a dimension line just above the deck.
  const bedW = result.layout.bedFrameWidth;
  const bx0 = (W - bedW) / 2;
  const bx1 = bx0 + bedW;
  const by = toY(p.bootHeight) - 14;
  parts.push(
    `<g class="bed" pointer-events="none" stroke="${C.text2}" stroke-width="1">` +
      `<line x1="${toX(bx0).toFixed(2)}" y1="${by.toFixed(2)}" x2="${toX(bx1).toFixed(2)}" y2="${by.toFixed(2)}" />` +
      `<line x1="${toX(bx0).toFixed(2)}" y1="${(by - 5).toFixed(2)}" x2="${toX(bx0).toFixed(2)}" y2="${(by + 5).toFixed(2)}" />` +
      `<line x1="${toX(bx1).toFixed(2)}" y1="${(by - 5).toFixed(2)}" x2="${toX(bx1).toFixed(2)}" y2="${(by + 5).toFixed(2)}" />` +
      `<text x="${toX(W / 2).toFixed(2)}" y="${(by - 7).toFixed(2)}" text-anchor="middle" dominant-baseline="auto" font-size="10" fill="${C.text2}" stroke="none">bed ${fmt(bedW)} · ${fmt(result.layout.bedMargin)} each side</text>` +
      `</g>`,
  );

  // Selected region: an outline over the boards.
  const selZone = result.zones.find((z) => z.id === selected);
  if (selZone) {
    parts.push(`<rect class="region-outline" pointer-events="none" ${rectAttrs(selZone.x0, selZone.x1, selZone.z0, selZone.z1)} fill="${C.select}" fill-opacity="0.12" stroke="${C.select}" stroke-width="2" />`);
  }

  // Outer envelope.
  parts.push(`<rect ${rectAttrs(0, W, 0, H)} fill="none" stroke="${C.envelope}" stroke-width="1.25" pointer-events="none" />`);

  // Draggable layout boundaries, on top of everything.
  const front = result.layout.front;
  const boundary = (key: string, axis: "x" | "z", side: number, x1: number, y1: number, x2: number, y2: number, index?: number) => {
    parts.push(
      `<g class="boundary" data-boundary="${key}" data-axis="${axis}" data-side="${side}"${index != null ? ` data-index="${index}"` : ""}>` +
        `<line x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="${C.boundary}" stroke-width="2" />` +
        `<line class="hit" x1="${x1.toFixed(2)}" y1="${y1.toFixed(2)}" x2="${x2.toFixed(2)}" y2="${y2.toFixed(2)}" stroke="transparent" stroke-width="12" pointer-events="stroke" />` +
        `</g>`,
    );
  };
  boundary("bootHeight", "z", 0, toX(0), toY(p.bootHeight), toX(W), toY(p.bootHeight));
  boundary("wardrobeWidth", "x", -1, toX(p.wardrobeWidth), toY(p.bootHeight), toX(p.wardrobeWidth), toY(H));
  boundary("wardrobeWidth", "x", 1, toX(W - p.wardrobeWidth), toY(p.bootHeight), toX(W - p.wardrobeWidth), toY(H));
  boundary("ohcBottom", "z", 0, toX(p.wardrobeWidth), toY(p.ohcBottom), toX(W - p.wardrobeWidth), toY(p.ohcBottom));
  if (front && front.style === "style1") {
    boundary("fixedPanelTop", "z", -1, toX(0), toY(front.fixedPanelTop), toX(p.wardrobeWidth), toY(front.fixedPanelTop));
    boundary("fixedPanelTop", "z", 1, toX(W - p.wardrobeWidth), toY(front.fixedPanelTop), toX(W), toY(front.fixedPanelTop));
  }
  const ohc = result.layout.ohc;
  if (ohc) {
    ohc.zones.slice(0, -1).forEach((zone, i) => {
      boundary("ohcZone", "x", 0, toX(zone.x1), toY(p.ohcBottom), toX(zone.x1), toY(H), i);
    });
  }

  if (showDimensions) {
    const dimText = (x: number, y: number, text: string, anchor = "middle", fill = C.text2) =>
      parts.push(`<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${anchor}" dominant-baseline="middle" font-size="10" fill="${fill}" pointer-events="none">${esc(text)}</text>`);
    // Heights down the left edge: the draggable ones in the boundary colour.
    const heights: Array<[number, boolean]> = [[0, false], [p.bootHeight, true], [p.ohcBottom, true], [H, false]];
    if (front && front.style === "style1") heights.push([front.fixedPanelTop, true]);
    for (const [z, drag] of heights) dimText(ox - 6, toY(z), fmt(z), "end", drag ? C.boundary : C.text3);
    // Widths along the bottom.
    const yb = toY(0) + 14;
    dimText(toX(p.wardrobeWidth / 2), yb, fmt(p.wardrobeWidth), "middle", C.boundary);
    dimText(toX(W / 2), yb, `${fmt(result.layout.openingWidth)} opening`);
    dimText(toX(W - p.wardrobeWidth / 2), yb, fmt(p.wardrobeWidth), "middle", C.boundary);
    dimText(toX(W), toY(H) - 11, `W ${fmt(W)} · roof ${fmt(H)} at the room face`, "end", C.text3);
  }

  return (
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Bedroom body front elevation" ` +
    `data-scale="${scale}" data-ox="${ox}" data-oy="${oy}" data-w="${W}" data-h="${H}" font-family="'Segoe UI', system-ui, sans-serif">` +
    `<rect x="0" y="0" width="${width}" height="${height}" fill="${C.bg}" />` +
    parts.join("") +
    `</svg>`
  );
}
