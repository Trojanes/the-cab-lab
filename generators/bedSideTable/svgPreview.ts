import type { BedSideResult } from "./types.ts";

function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(1)));
}

/** Front elevation of one table, from the room. The orange line is the middle shelf centreline. */
export function generateBedSideSvg(result: BedSideResult, options: { width?: number } = {}): string | null {
  if (!result || result.validation.errors.length || !result.boards.length) return null;
  const p = result.params;
  const width = options.width ?? 420;
  const pad = 36;
  const scale = (width - pad * 2) / Math.max(p.width, 1);
  const height = Math.round(p.height * scale + pad * 2);
  const toX = (x: number) => pad + x * scale;
  const toY = (z: number) => pad + (p.height - z) * scale;
  const parts: string[] = [];
  const labelOf = (type: string) => type === "drawer" ? "Drawer" : type === "left_door" ? "Door · left" : "Door · right";
  for (const id of ["FRONT_LO", "FRONT_HI"]) {
    const b = result.boards.find((board) => board.id === id);
    const zone = id === "FRONT_LO" ? p.zones[0] : p.zones[1];
    if (!b || !zone) continue;
    parts.push(
      `<rect class="region" x="${toX(b.x0).toFixed(1)}" y="${toY(b.z1).toFixed(1)}" width="${((b.x1 - b.x0) * scale).toFixed(1)}" height="${((b.z1 - b.z0) * scale).toFixed(1)}" fill="${zone.type === "drawer" ? "#f0c27a" : "#8ec5ef"}" stroke="#5c6b78" pointer-events="none" />`,
      `<text x="${toX((b.x0 + b.x1) / 2).toFixed(1)}" y="${toY((b.z0 + b.z1) / 2).toFixed(1)}" text-anchor="middle" dominant-baseline="middle" font-size="12" fill="#3b352d" pointer-events="none">${labelOf(zone.type)}</text>`,
    );
  }
  parts.push(`<rect x="${toX(0).toFixed(1)}" y="${toY(p.height).toFixed(1)}" width="${(p.width * scale).toFixed(1)}" height="${(p.height * scale).toFixed(1)}" fill="none" stroke="#5c4b37" pointer-events="none" />`);
  const y = toY(p.shelfCenter);
  parts.push(
    `<g class="boundary" data-boundary="shelfCenter" data-axis="z">` +
    `<rect x="${toX(0).toFixed(1)}" y="${(y - 8).toFixed(1)}" width="${(p.width * scale).toFixed(1)}" height="16" fill="transparent" pointer-events="all" />` +
    `<line x1="${toX(0).toFixed(1)}" y1="${y.toFixed(1)}" x2="${toX(p.width).toFixed(1)}" y2="${y.toFixed(1)}" stroke="#e0a34f" stroke-width="3" pointer-events="none" />` +
    `</g>`,
  );
  for (const b of result.boards) {
    if (b.category !== "front_panel") continue;
    const face = b.faces?.find((f) => f.id === "A");
    for (const ft of face?.features || []) {
      if (ft.kind !== "hole" || !ft.center) continue;
      const cx = toX(b.x0 + ft.center[0]);
      const cy = toY(b.z0 + ft.center[1]);
      const r = Math.max(((ft.diameter || 35) / 2) * scale, 2);
      parts.push(`<circle class="hinge" cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="none" stroke="#3d4d63" pointer-events="none" />`);
    }
  }
  parts.push(`<text x="${(width / 2).toFixed(1)}" y="${(height - 12).toFixed(1)}" text-anchor="middle" font-size="11" fill="#6b6357">${p.side} · shelf ${fmt(p.shelfCenter)} · ${p.zones.map((z) => z.type).join(" / ")}</text>`);
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" data-scale="${scale}" data-ox="${pad}" data-oy="${pad}" data-h="${p.height}" data-w="${p.width}">` +
    `<rect width="${width}" height="${height}" fill="#f8fbff" />` + parts.join("") + `</svg>`;
}
