/**
 * General tall cabinet — 2D front elevation (SVG markup) from the last generation.
 *
 * Seen from the room: local X left → right, Z up. The boards the generator
 * emitted are drawn as their outline seen from the front, in the 3D colours
 * (carcass stock solid, door stock see-through so the carcass behind still
 * reads). The stack rows of `result.stack` sit underneath as faint pick areas:
 * functional zones carry `data-zone` (the zone id). Horizontal grips between
 * two zones carry `data-boundary="zone" data-axis="z" data-index=<lower zone's
 * index in the stack>`; a double door's vertical divider carries
 * `data-boundary="divider" data-axis="x" data-zone`. The root `<svg>` carries
 * the mm → px mapping (`data-scale`, `data-ox`, `data-oy`, `data-w`, `data-h`).
 *
 * Display only: nothing here decides geometry.
 */
import type { GTResult, GTZone, GTZoneType, StackItem } from "./types.ts";
import { PV, dimText, fitCanvas, fmt, frontRect, grip, label, px, spacedLabels, svgRoot } from "../_lib/preview.ts";

export interface GTSvgPreviewOptions {
  width?: number;
  maxHeight?: number;
  selectedZoneId?: string | null;
  showDimensions?: boolean;
}

export const GT_ZONE_LABELS: Record<string, string> = {
  side_door: "Door",
  left_side_door: "Door · hinge left",
  right_side_door: "Door · hinge right",
  double_door: "Double door",
  drawer: "Drawer",
  open_space: "Open",
  open_appliance: "Appliance",
  fridge: "Fridge",
  top_flap: "Top flap",
  bottom_flap: "Bottom flap",
  blank_panel: "Blank panel",
};

function zoneTint(type: GTZoneType | undefined): string {
  if (type === "drawer") return "rgba(224,163,79,0.10)";
  if (type === "open_space" || type === "open_appliance") return "rgba(255,255,255,0.03)";
  if (type === "fridge") return "rgba(110,200,200,0.10)";
  if (type === "top_flap" || type === "bottom_flap") return "rgba(180,140,230,0.10)";
  if (type === "blank_panel") return "rgba(160,200,150,0.08)";
  return "rgba(79,134,224,0.07)";
}

/** Zones whose height is owned by the appliance: their edges do not drag. */
const OWNED_HEIGHT = new Set<GTZoneType>(["fridge"]);

type ZoneRow = StackItem & { zone?: GTZone };

export function generateGTSvgPreview(result: GTResult, options: GTSvgPreviewOptions = {}): string | null {
  if (!result || result.validation.errors.length || !result.boards.length || !result.stack?.length) return null;
  const CW = result.params.cabinetWidth;
  const CH = result.params.cabinetHeight;
  if (!(CW > 0) || !(CH > 0)) return null;

  const width = options.width ?? 520;
  const showDimensions = options.showDimensions ?? true;
  const selected = options.selectedZoneId ?? null;
  const { scale, ox, oy, height } = fitCanvas(CW, CH, width, options.maxHeight ?? 600, { l: 48, r: 56, t: 14, b: 28 });
  const toX = (x: number) => ox + x * scale;
  const toY = (z: number) => oy + (CH - z) * scale;
  const rect = (x0: number, x1: number, z0: number, z1: number) =>
    `x="${px(toX(x0))}" y="${px(toY(z1))}" width="${px(Math.max((x1 - x0) * scale, 0.8))}" height="${px(Math.max((z1 - z0) * scale, 0.8))}"`;

  const rows = result.stack as ZoneRow[];
  const zones = rows.filter((it) => it.kind === "functional_zone");
  const zid = (it: ZoneRow) => it.zoneId ?? it.zone?.id ?? it.id;
  const parts: string[] = [];

  // Stack rows: zones are the pick areas; the end systems are faint bands.
  for (const it of rows) {
    if (it.kind === "functional_zone") {
      parts.push(`<rect class="region" data-zone="${zid(it)}" ${rect(0, CW, it.z0, it.z1)} fill="${zoneTint(it.zoneType)}" stroke="none" />`);
    } else if (it.kind !== "boundary_panel") {
      parts.push(`<rect ${rect(0, CW, it.z0, it.z1)} fill="rgba(255,255,255,0.025)" stroke="none" pointer-events="none" />`);
    }
  }

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

  // Hinge cups and lock mortises (absolute cabinet x / z).
  for (const h of result.hinges) {
    parts.push(`<circle cx="${px(toX(h.centerX))}" cy="${px(toY(h.centerZ))}" r="${px(Math.max((h.diameter / 2) * scale, 1.5))}" fill="none" stroke="${PV.hinge}" stroke-width="1" pointer-events="none" />`);
  }
  for (const l of result.locks) {
    const w = Math.max(l.width * scale, 4);
    const h = Math.max(l.height * scale, 2.5);
    parts.push(`<rect x="${px(toX(l.centerX) - w / 2)}" y="${px(toY(l.centerZ) - h / 2)}" width="${px(w)}" height="${px(h)}" rx="${px(h / 2)}" fill="${PV.lock}" fill-opacity="0.55" stroke="none" pointer-events="none" />`);
  }

  // Zone names (type + height), haloed over the boards.
  for (const it of zones) {
    const w = CW * scale;
    const h = (it.z1 - it.z0) * scale;
    if (h < 14 || w < 40) continue;
    // A vertical divider runs down the middle: centre the name on the left leaf instead.
    const cx = toX(it.zone?.verticalDivider === true ? CW / 4 : CW / 2);
    const cy = toY((it.z0 + it.z1) / 2);
    const name = GT_ZONE_LABELS[it.zoneType ?? ""] ?? it.zoneType ?? it.id;
    if (h >= 32) {
      parts.push(label(cx, cy - 6, name, { size: 11 }));
      parts.push(label(cx, cy + 8, fmt(it.height), { size: 10, fill: PV.text2 }));
    } else {
      parts.push(label(cx, cy, `${name} · ${fmt(it.height)}`, { size: 10 }));
    }
  }

  // Selected zone: an outline over the boards.
  const sel = zones.find((it) => zid(it) === selected);
  if (sel) parts.push(`<rect pointer-events="none" ${rect(0, CW, sel.z0, sel.z1)} fill="${PV.select}" fill-opacity="0.12" stroke="${PV.select}" stroke-width="2" />`);

  // Outer envelope.
  parts.push(`<rect ${rect(0, CW, 0, CH)} fill="none" stroke="${PV.envelope}" stroke-width="1.25" pointer-events="none" />`);

  // Draggable boundaries, on top: between two zones (not an appliance-owned edge), and each vertical divider.
  const draggable = new Set<number>();
  for (let i = 0; i < zones.length - 1; i += 1) {
    const lo = zones[i];
    const hi = zones[i + 1];
    if (OWNED_HEIGHT.has(lo.zoneType as GTZoneType) || OWNED_HEIGHT.has(hi.zoneType as GTZoneType)) continue;
    // The boundary panel between them: grip on its centre line.
    const z = (lo.z1 + hi.z0) / 2;
    draggable.add(i);
    parts.push(grip(`data-boundary="zone" data-axis="z" data-index="${i}"`, toX(0), toY(z), toX(CW), toY(z)));
  }
  for (const it of zones) {
    if (it.zone?.verticalDivider !== true) continue;
    const vd = result.boards.find((b) => b.category === "vertical_divider" && b.id.endsWith(`_${zid(it)}`));
    const cx = vd ? (vd.x0 + vd.x1) / 2 : Number(it.zone.dividerCenterX ?? result.params.midWidth / 2);
    parts.push(grip(`data-boundary="divider" data-axis="x" data-zone="${zid(it)}"`, toX(cx), toY(it.z1), toX(cx), toY(it.z0), true));
  }

  if (showDimensions) {
    // Heights down the left edge: zone edges, draggable ones in the boundary colour.
    const items: Array<{ y: number; text: string; fill: string; strong?: boolean }> = [
      { y: toY(0), text: "0", fill: PV.text3 },
      { y: toY(CH), text: fmt(CH), fill: PV.text3 },
    ];
    zones.forEach((it, i) => {
      if (i === 0) items.push({ y: toY(it.z0), text: fmt(it.z0), fill: PV.text3 });
      const drag = draggable.has(i);
      items.push({ y: toY(i < zones.length - 1 ? (it.z1 + zones[i + 1].z0) / 2 : it.z1), text: fmt(i < zones.length - 1 ? (it.z1 + zones[i + 1].z0) / 2 : it.z1), fill: drag ? PV.boundary : PV.text3, strong: drag });
    });
    parts.push(spacedLabels(items, ox - 6, "end"));
    // Zone heights down the right edge with ticks.
    const right = toX(CW);
    for (const it of zones) {
      parts.push(`<line x1="${px(right + 3)}" y1="${px(toY(it.z1))}" x2="${px(right + 8)}" y2="${px(toY(it.z1))}" stroke="${PV.text3}" pointer-events="none" />`);
      parts.push(`<line x1="${px(right + 3)}" y1="${px(toY(it.z0))}" x2="${px(right + 8)}" y2="${px(toY(it.z0))}" stroke="${PV.text3}" pointer-events="none" />`);
      if ((it.z1 - it.z0) * scale >= 12) parts.push(dimText(right + 11, toY((it.z0 + it.z1) / 2), fmt(it.height), "start"));
    }
    parts.push(dimText(toX(CW / 2), toY(0) + 15, `W ${fmt(CW)} · H ${fmt(CH)}`, "middle", PV.text3));
  }

  return svgRoot(width, height, { scale, ox, oy, w: CW, h: CH }, "Tall cabinet front elevation", parts.join(""));
}
