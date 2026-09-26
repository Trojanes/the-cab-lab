/**
 * Kitchen base run — 2D front elevation (SVG markup) from the last generation.
 *
 * Seen from the room: local X left → right, Z up. The boards the generator
 * emitted are drawn as their outline seen from the front, in the 3D colours
 * (carcass stock solid, door stock see-through). The cells come from
 * `result.debug.columns` — the same resolved column / zone rectangles the
 * boards were built from (zones top → bottom inside a column, over the kick at
 * BCH) — and sit underneath as faint pick areas with `data-zone` + `data-col`.
 * Column grips carry `data-boundary="column" data-axis="x" data-index=<left
 * column>`; zone grips carry `data-boundary="zone" data-axis="z" data-col
 * data-index=<upper zone>`. The root `<svg>` carries the mm → px mapping.
 *
 * This does not refuse on `validation.errors`: the elevation is still the
 * truthful picture of what was emitted.
 *
 * Display only: nothing here decides geometry.
 */
import type { KitchenResult, KitchenZoneType } from "./types.ts";
import { PV, boardGaps, dimText, fitCanvas, fmt, frontRect, gapMarks, grip, label, px, selectRect, spacedLabels, svgRoot, zoneColor } from "../_lib/preview.ts";

export interface KitchenSvgPreviewOptions {
  width?: number;
  maxHeight?: number;
  /** Selected cell: the zone id (unique inside its column) … */
  selectedZoneId?: string | null;
  /** … and its column index (zone ids may repeat across columns). */
  selectedCol?: number;
  showDimensions?: boolean;
  /** Board-to-board distance: clearance between faces, or centre to centre. */
  gaps?: "clear" | "center";
}

interface PreviewColumn {
  id: string;
  x0: number;
  x1: number;
  zones: { id: string; zoneType: KitchenZoneType; z0: number; z1: number }[];
}

export const KITCHEN_ZONE_LABELS: Record<string, string> = {
  left_door: "Door · hinge left",
  right_door: "Door · hinge right",
  double_door: "Double door",
  drawer: "Drawer",
  open: "Open",
  down_flap: "Down flap",
  stove: "Stove",
  custom: "Custom",
  unassigned: "Unassigned",
};


export function generateKitchenSvgPreview(result: KitchenResult, options: KitchenSvgPreviewOptions = {}): string | null {
  if (!result || !result.boards.length) return null;
  const W = result.params.length;
  const H = result.params.height;
  const BCH = result.params.bottomClearanceHeight;
  if (!(W > 0) || !(H > 0)) return null;
  const columns = (result.debug?.columns ?? []) as PreviewColumn[];
  if (!columns.length) return null;
  const avoidances = (result.debug?.avoidances ?? []) as { id: string; x0: number; x1: number; height: number; depth: number }[];

  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selZone = options.selectedZoneId ?? null;
  const selCol = options.selectedCol ?? -1;
  const { scale, ox, oy, height } = fitCanvas(W, H, width, options.maxHeight ?? 520, { l: 44, r: 16, t: 14, b: showDimensions ? 40 : 14 });
  const toX = (x: number) => ox + x * scale;
  const toY = (z: number) => oy + (H - z) * scale;
  const rect = (x0: number, x1: number, z0: number, z1: number) =>
    `x="${px(toX(x0))}" y="${px(toY(z1))}" width="${px(Math.max((x1 - x0) * scale, 0.8))}" height="${px(Math.max((z1 - z0) * scale, 0.8))}"`;
  const isSel = (ci: number, id: string) => id === selZone && (selCol < 0 || selCol === ci);
  const parts: string[] = [];

  // Cells: the pick areas under the boards; the kick a faint band.
  parts.push(`<rect ${rect(0, W, 0, BCH)} fill="rgba(255,255,255,0.025)" stroke="none" pointer-events="none" />`);
  columns.forEach((col, ci) => {
    for (const z of col.zones) {
      parts.push(`<rect class="region" data-zone="${z.id}" data-col="${ci}" ${rect(col.x0, col.x1, z.z0, z.z1)} fill="${zoneColor(z.zoneType)}" stroke="none" />`);
    }
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

  // Wheel arches: display only.
  for (const av of avoidances) {
    if (!(av.x1 > av.x0) || !(av.height > 0)) continue;
    parts.push(`<rect ${rect(av.x0, av.x1, 0, av.height)} fill="${PV.warn}" fill-opacity="0.10" stroke="${PV.warn}" stroke-dasharray="4 3" pointer-events="none" />`);
    if ((av.x1 - av.x0) * scale > 34) parts.push(label(toX((av.x0 + av.x1) / 2), toY(av.height) + 9, `wheel ${fmt(av.height)}`, { size: 9, fill: "#f08a8d" }));
  }

  // Type colour over the boards. Clicks still hit the region underneath.
  columns.forEach((col) => {
    for (const z of col.zones) {
      parts.push(`<rect pointer-events="none" ${rect(col.x0, col.x1, z.z0, z.z1)} fill="${zoneColor(z.zoneType)}" fill-opacity="0.9" stroke="none" />`);
    }
  });

  // Hinge cups and lock mortises (absolute cabinet x / z).
  for (const h of result.hinges) {
    parts.push(`<circle cx="${px(toX(h.centerX))}" cy="${px(toY(h.centerZ))}" r="${px(Math.max((h.diameter / 2) * scale, 1.5))}" fill="none" stroke="${PV.hinge}" stroke-width="1" pointer-events="none" />`);
  }
  for (const l of result.locks) {
    const w = Math.max(l.width * scale, 4);
    const h = Math.max(l.height * scale, 2.5);
    parts.push(`<rect x="${px(toX(l.centerX) - w / 2)}" y="${px(toY(l.centerZ) - h / 2)}" width="${px(w)}" height="${px(h)}" rx="${px(h / 2)}" fill="${PV.lock}" fill-opacity="0.55" stroke="none" pointer-events="none" />`);
  }

  columns.forEach((col, ci) => {
    const z = col.zones.find((zz) => isSel(ci, zz.id));
    if (z) parts.push(selectRect(rect(col.x0, col.x1, z.z0, z.z1)));
  });

  // Cell names (type + height), haloed.
  for (const col of columns) {
    const w = (col.x1 - col.x0) * scale;
    for (const z of col.zones) {
      const h = (z.z1 - z.z0) * scale;
      if (h < 14 || w < 36) continue;
      const cx = toX((col.x0 + col.x1) / 2);
      const cy = toY((z.z0 + z.z1) / 2);
      const name = KITCHEN_ZONE_LABELS[z.zoneType] ?? z.zoneType;
      const short = w < 90 ? name.replace("Door · hinge ", "Door ").replace("Double door", "Double") : name;
      if (h >= 32) {
        parts.push(label(cx, cy - 6, short, { size: 11, fill: z.zoneType === "unassigned" ? "#f08a8d" : PV.text }));
        parts.push(label(cx, cy + 8, fmt(z.z1 - z.z0), { size: 10, fill: PV.text2 }));
      } else {
        parts.push(label(cx, cy, `${short} · ${fmt(z.z1 - z.z0)}`, { size: 10 }));
      }
    }
  }
  if ((BCH * scale) >= 11) parts.push(label(toX(0) + 6, toY(BCH / 2), `kick ${fmt(BCH)}`, { size: 9, fill: PV.text2, anchor: "start" }));

  // Outer envelope.
  parts.push(`<rect ${rect(0, W, 0, H)} fill="none" stroke="${PV.envelope}" stroke-width="1.25" pointer-events="none" />`);

  // Draggable boundaries: between columns (over the zone area), and between zones inside a column.
  for (let i = 0; i < columns.length - 1; i += 1) {
    const x = toX(columns[i].x1);
    parts.push(grip(`data-boundary="column" data-axis="x" data-index="${i}"`, x, toY(H), x, toY(BCH)));
  }
  columns.forEach((col, ci) => {
    for (let zi = 0; zi < col.zones.length - 1; zi += 1) {
      const y = toY(col.zones[zi].z0);
      parts.push(grip(`data-boundary="zone" data-axis="z" data-col="${ci}" data-index="${zi}"`, toX(col.x0) + 3, y, toX(col.x1) - 3, y));
    }
  });

  if (showDimensions) {
    parts.push(spacedLabels([
      { y: toY(0), text: "0", fill: PV.text3 },
      { y: toY(BCH), text: fmt(BCH), fill: PV.text3 },
      { y: toY(H), text: fmt(H), fill: PV.text3 },
    ], ox - 6, "end"));
    // Column widths along the bottom (draggable when there is more than one).
    const yb = toY(0) + 12;
    columns.forEach((col) => {
      const x0 = toX(col.x0);
      const x1 = toX(col.x1);
      parts.push(`<line x1="${px(x0)}" y1="${px(yb - 4)}" x2="${px(x0)}" y2="${px(yb + 4)}" stroke="${PV.text3}" pointer-events="none" />`);
      parts.push(`<line x1="${px(x1)}" y1="${px(yb - 4)}" x2="${px(x1)}" y2="${px(yb + 4)}" stroke="${PV.text3}" pointer-events="none" />`);
      if (x1 - x0 >= 24) parts.push(dimText((x0 + x1) / 2, yb, fmt(col.x1 - col.x0), "middle", columns.length > 1 ? PV.boundary : PV.text2));
    });
    parts.push(dimText(toX(W / 2), yb + 15, `W ${fmt(W)} · H ${fmt(H)} · ${columns.length} column${columns.length === 1 ? "" : "s"}`, "middle", PV.text3));
  }
  parts.push(gapMarks(boardGaps(result.boards), toX, toY, scale, options.gaps ?? "clear"));

  return svgRoot(width, height, { scale, ox, oy, w: W, h: H }, "Kitchen base front elevation", parts.join(""));
}
