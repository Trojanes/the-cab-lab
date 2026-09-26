/**
 * Small cabinet — 2D front elevation. One column, zones stacked top → bottom.
 * Display only.
 */
import type { SmallCabinetResult } from "./types.ts";
import { PV, fmt, frontRect, grip, label, px, svgRoot, zoneColor } from "../_lib/preview.ts";

export interface SmallSvgOptions {
  width?: number;
  maxHeight?: number;
  selectedZoneId?: string | null;
}

const LABELS: Record<string, string> = {
  left_door: "Door · hinge left",
  right_door: "Door · hinge right",
  drawer: "Drawer",
};

export function generateSmallCabinetSvgPreview(result: SmallCabinetResult, options: SmallSvgOptions = {}): string | null {
  if (!result?.boards?.length) return null;
  const W = result.params.cabinetWidth;
  const H = result.params.cabinetHeight;
  const zones = result.zones || [];
  if (!(W > 0) || !(H > 0) || !zones.length) return null;

  const width = options.width ?? 520;
  const selected = options.selectedZoneId ?? null;
  const scale = Math.min((width - 64) / W, ((options.maxHeight ?? 520) - 42) / H);
  const ox = 48;
  const oy = 14;
  const height = Math.ceil(oy + H * scale + 28);
  const toX = (x: number) => ox + x * scale;
  const toY = (z: number) => oy + (H - z) * scale;
  const rect = (x0: number, x1: number, z0: number, z1: number) =>
    `x="${px(toX(x0))}" y="${px(toY(z1))}" width="${px(Math.max((x1 - x0) * scale, 0.8))}" height="${px(Math.max((z1 - z0) * scale, 0.8))}"`;

  const parts: string[] = [];
  for (const z of zones) {
    parts.push(`<rect class="region" data-zone="${z.id}" ${rect(0, W, z.zBottom, z.zTop)} fill="${zoneColor(z.type)}" stroke="none" />`);
  }
  const boards = [...result.boards].sort((a, b) => b.y0 - a.y0);
  for (const b of boards) {
    const r = frontRect(b);
    if (!r || r.x1 - r.x0 < 0.1 || r.z1 - r.z0 < 0.1) continue;
    const door = b.category === "front_panel";
    parts.push(`<rect ${rect(r.x0, r.x1, r.z0, r.z1)} fill="${door ? PV.front : PV.carcass}" fill-opacity="${door ? 0.45 : 0.92}" stroke="${door ? PV.frontLine : PV.carcassLine}" stroke-width="0.6" pointer-events="none" />`);
  }
  for (const z of zones) {
    const h = (z.zTop - z.zBottom) * scale;
    if (h < 14) continue;
    const name = LABELS[z.type] ?? z.type;
    const cx = toX(W / 2);
    const cy = toY((z.zTop + z.zBottom) / 2);
    parts.push(label(cx, cy, h >= 28 ? name : `${name} · ${fmt(z.height)}`, { size: 11 }));
    if (h >= 28) parts.push(label(cx, cy + 14, fmt(z.height), { size: 10, fill: PV.text2 }));
    if (z.id === selected) parts.push(`<rect ${rect(0, W, z.zBottom, z.zTop)} fill="none" stroke="${PV.select}" stroke-width="2" pointer-events="none" />`);
  }
  parts.push(`<rect ${rect(0, W, 0, H)} fill="none" stroke="${PV.envelope}" stroke-width="1.25" pointer-events="none" />`);
  for (let i = 0; i < zones.length - 1; i += 1) {
    const z = zones[i].zBottom;
    parts.push(grip(`data-boundary="zone" data-axis="z" data-index="${i}"`, toX(0), toY(z), toX(W), toY(z)));
  }
  return svgRoot(width, height, { scale, ox, oy, h: H, w: W }, "Small cabinet front", parts.join(""));
}
