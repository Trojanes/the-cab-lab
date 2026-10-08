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
import { PV, dimText, fitCanvas, fmt, frontRect, grip, label, layoutDimensions, px, selectRect, spacedLabels, svgRoot, zoneColor, type DimSpec, type PxBox } from "../_lib/preview.ts";
import type { Board } from "../_lib/model.ts";

export interface GTSvgPreviewOptions {
  width?: number;
  maxHeight?: number;
  selectedZoneId?: string | null;
  showDimensions?: boolean;
  gaps?: "clear" | "center";
  /**
   * The fridge page: the numbers beside the body are the dropdown's reading (clearance or centre to
   * centre) instead of the stored zone heights, and a zone you may resize carries `class="zone-dim
   * editable"` (`data-zone`, `data-height` stored, `data-clear`, `data-center`) so the panel can type it.
   */
  readout?: boolean;
  /** With `readout`: mark the resizable zones' numbers clickable (the fridge page handles the click; the bench does not). */
  editable?: boolean;
}

/** One opening across a zone: the faces of the two upright boards that bound it at the front. */
export interface GTSpan { aHi: number; bLo: number; aMid: number; bMid: number; clear: number; center: number }

/** Per functional zone: its height and widths measured board to board, as the elevation draws them. */
export interface GTZoneOpening {
  id: string;
  index: number;
  zoneType: string;
  z0: number;
  z1: number;
  /** Stored zone height. */
  height: number;
  /** Clear height, face to face (the cut-out for an appliance-owned zone). */
  clear: number;
  /** Centre line to centre line (the cut-out for an appliance-owned zone). */
  center: number;
  owned: boolean;
  /** Faces the height runs between (clear) and their centre lines (center). */
  lo: number; hi: number; loMid: number; hiMid: number;
  /** Inner faces of the outer uprights: the height bar sits inside the left one. */
  xLo: number; xHi: number;
  widths: GTSpan[];
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
  fixed_panel: "Fixed panel",
};


/** Zones whose height is owned by the appliance: their edges do not drag. */
const OWNED_HEIGHT = new Set<GTZoneType>(["fridge"]);

type ZoneRow = StackItem & { zone?: GTZone };

const r1 = (v: number) => Math.round(v * 10) / 10;

/**
 * Openings per zone from the boards at the front of the carcass (the back uprights and the side
 * supports repeat the same gaps, so only boards touching the front count). Heights run from the
 * board under the zone to the board over it; widths run between neighbouring uprights across it.
 * An appliance-owned zone (the fridge) reads its own cut-out in both modes.
 */
export function gtZoneOpenings(result: GTResult): GTZoneOpening[] {
  // No elevation is drawn while the checks fail, so there is no reading either.
  if (!result || result.validation?.errors?.length || !result.boards?.length || !result.stack?.length) return [];
  const CW = result.params.cabinetWidth;
  const rows = result.stack as ZoneRow[];
  const zones = rows.filter((it) => it.kind === "functional_zone");
  const zid = (it: ZoneRow) => it.zoneId ?? it.zone?.id ?? it.id;
  const carcass = (result.boards as Board[]).filter((b) => b.category !== "front_panel" && b.stock?.kind !== "door");
  // "At the front": within a door thickness or so of the front-most carcass face. The fridge stile
  // under an up flap stands back by the door thickness (y0 = FPT) and still bounds the cut-out.
  const yFront = Math.min(...carcass.map((b) => b.y0));
  const front = carcass.filter((b) => b.y0 <= yFront + 20);
  const flats = front.filter((b) => b.thicknessAxis === "Z" && Math.min(b.x1, CW * 0.7) - Math.max(b.x0, CW * 0.3) > 1);
  const uprights = front.filter((b) => b.thicknessAxis === "X");
  return zones.map((it, index) => {
    const z0 = it.z0;
    const z1 = it.z1;
    const owned = OWNED_HEIGHT.has(it.zoneType as GTZoneType);
    const below = flats
      .filter((b) => b.z1 <= z0 + 0.8 || (b.z0 - 0.2 <= z0 && z0 <= b.z1 + 0.2))
      .sort((a, b) => (b.z0 + b.z1) - (a.z0 + a.z1))[0];
    const above = flats
      .filter((b) => b.z0 >= z1 - 0.8 || (b.z0 - 0.2 <= z1 && z1 <= b.z1 + 0.2))
      .sort((a, b) => (a.z0 + a.z1) - (b.z0 + b.z1))[0];
    // Next to an end system the front rail closes the opening at the row's edge, not the flat board
    // behind it (the top board of a fridge cabinet sits far above its top flap).
    const k = rows.indexOf(it);
    const prev = rows[k - 1];
    const next = rows[k + 1];
    const floorAt = prev && prev.kind === "bottom_system" ? prev.z1 : null;
    const ceilAt = next && next.kind === "top_system" ? next.z0 : null;
    let lo = owned || !below ? z0 : below.z1;
    let hi = owned || !above ? z1 : above.z0;
    let loMid = owned || !below ? z0 : (below.z0 + below.z1) / 2;
    let hiMid = owned || !above ? z1 : (above.z0 + above.z1) / 2;
    if (!owned && floorAt != null && floorAt > lo) { lo = floorAt; loMid = floorAt; }
    if (!owned && ceilAt != null && ceilAt < hi) { hi = ceilAt; hiMid = ceilAt; }
    const need = Math.min(50, (z1 - z0) * 0.3);
    const across = uprights
      .filter((b) => Math.min(b.z1, z1) - Math.max(b.z0, z0) > need)
      .sort((a, b) => a.x0 - b.x0 || a.x1 - b.x1);
    const widths: GTSpan[] = [];
    for (let i = 0; i < across.length - 1; i += 1) {
      const a = across[i];
      const b = across[i + 1];
      if (b.x0 - a.x1 < 8) continue;
      widths.push({ aHi: a.x1, bLo: b.x0, aMid: (a.x0 + a.x1) / 2, bMid: (b.x0 + b.x1) / 2, clear: r1(b.x0 - a.x1), center: r1((b.x0 + b.x1) / 2 - (a.x0 + a.x1) / 2) });
    }
    return {
      id: String(zid(it)),
      index,
      zoneType: String(it.zoneType ?? ""),
      z0, z1,
      height: Number(it.height ?? r1(z1 - z0)),
      clear: r1(hi - lo),
      center: r1(hiMid - loMid),
      owned,
      lo, hi, loMid, hiMid,
      xLo: widths.length ? widths[0].aHi : 0,
      xHi: widths.length ? widths[widths.length - 1].bLo : CW,
      widths,
    };
  });
}

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
  const avoid: PxBox[] = [];
  const reserve = (x: number, y: number, text: string, size: number, anchor: "middle" | "start" = "middle") => {
    const w = text.length * size * 0.62 + 4;
    const h = size + 6;
    const x0 = anchor === "start" ? x : x - w / 2;
    avoid.push({ x0, y0: y - h / 2, x1: x0 + w, y1: y + h / 2 });
  };
  const mode = options.gaps === "center" ? "center" : "clear";
  const openings = gtZoneOpenings(result);

  // Stack rows: zones are the pick areas; the end systems are faint bands.
  for (const it of rows) {
    if (it.kind === "functional_zone") {
      parts.push(`<rect class="region" data-zone="${zid(it)}" ${rect(0, CW, it.z0, it.z1)} fill="${zoneColor(it.zoneType)}" stroke="none" />`);
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

  for (const it of zones) {
    parts.push(`<rect pointer-events="none" ${rect(0, CW, it.z0, it.z1)} fill="${zoneColor(it.zoneType)}" fill-opacity="0.9" stroke="none" />`);
  }
  const sel = zones.find((it) => zid(it) === selected);
  if (sel) parts.push(selectRect(rect(0, CW, sel.z0, sel.z1)));

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
    if (options.readout) {
      // The height is the bar inside the zone and the number beside it: the name alone here.
      parts.push(label(cx, cy, name, { size: 11 }));
      reserve(cx, cy, name, 11);
      continue;
    }
    if (h >= 32) {
      parts.push(label(cx, cy - 6, name, { size: 11 }));
      parts.push(label(cx, cy + 8, fmt(it.height), { size: 10, fill: PV.text2 }));
      reserve(cx, cy - 6, name, 11);
      reserve(cx, cy + 8, fmt(it.height), 10);
    } else {
      parts.push(label(cx, cy, `${name} · ${fmt(it.height)}`, { size: 10 }));
      reserve(cx, cy, `${name} · ${fmt(it.height)}`, 10);
    }
  }

  // Selected zone: an outline over the boards.
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
    // Zone heights down the right edge with ticks: the stored height, or (fridge page) the reading
    // the dropdown asks for — a zone you may resize can be typed there.
    const right = toX(CW);
    zones.forEach((it, i) => {
      parts.push(`<line x1="${px(right + 3)}" y1="${px(toY(it.z1))}" x2="${px(right + 8)}" y2="${px(toY(it.z1))}" stroke="${PV.text3}" pointer-events="none" />`);
      parts.push(`<line x1="${px(right + 3)}" y1="${px(toY(it.z0))}" x2="${px(right + 8)}" y2="${px(toY(it.z0))}" stroke="${PV.text3}" pointer-events="none" />`);
      if ((it.z1 - it.z0) * scale < 12) return;
      const y = toY((it.z0 + it.z1) / 2);
      const o = openings[i];
      if (!options.readout || !o) {
        parts.push(dimText(right + 11, y, fmt(it.height), "start"));
        reserve(right + 11, y, fmt(it.height), 10, "start");
        return;
      }
      const text = fmt(mode === "center" ? o.center : o.clear);
      const editable = options.editable === true && !o.owned && zones.length > 1;
      const hit = Math.max(36, text.length * 8);
      parts.push(
        `<g class="zone-dim${editable ? " editable" : ""}" data-zone="${zid(it)}" data-height="${o.height}" data-clear="${o.clear}" data-center="${o.center}">` +
        `<title>${o.owned ? "The fridge cut-out" : `${mode === "center" ? "Centre to centre" : "Clearance"}${editable ? " · click to type" : ""}`}</title>` +
        (editable ? `<rect x="${px(right + 9)}" y="${px(y - 9)}" width="${hit}" height="18" fill="transparent" />` : "") +
        `<text x="${px(right + 11)}" y="${px(y)}" text-anchor="start" dominant-baseline="middle" font-size="10" fill="${editable ? PV.boundary : PV.text2}" pointer-events="none">${text}</text>` +
        `</g>`,
      );
      reserve(right + 11, y, text, 10, "start");
    });
    parts.push(dimText(toX(CW / 2), toY(0) + 15, `W ${fmt(CW)} · H ${fmt(CH)}`, "middle", PV.text3));
    reserve(toX(CW / 2), toY(0) + 15, `W ${fmt(CW)} · H ${fmt(CH)}`, 10);
  }

  // Inside each zone: its width(s) above the board under it, its height inside the left upright.
  // One reading at a time; a number that would land on another moves to the other edge.
  const color = mode === "center" ? "#e0a34f" : "#8ec5ef";
  const specs: DimSpec[] = [];
  for (const o of openings) {
    for (const w of o.widths) {
      specs.push({
        axis: "x",
        from: mode === "center" ? w.aMid : w.aHi,
        to: mode === "center" ? w.bMid : w.bLo,
        edgeLo: o.lo, edgeHi: o.hi,
        text: fmt(mode === "center" ? w.center : w.clear),
        color,
      });
    }
    specs.push({
      axis: "z",
      from: mode === "center" ? o.loMid : o.lo,
      to: mode === "center" ? o.hiMid : o.hi,
      edgeLo: o.xLo, edgeHi: o.xHi,
      text: fmt(mode === "center" ? o.center : o.clear),
      color: o.owned ? PV.text : color,
      priority: o.owned ? 0 : 1,
    });
  }
  parts.push(layoutDimensions(specs.filter((sp) => Math.abs(sp.to - sp.from) * scale >= 18), toX, toY, avoid));

  return svgRoot(width, height, { scale, ox, oy, w: CW, h: CH }, "Tall cabinet front elevation", parts.join(""));
}
