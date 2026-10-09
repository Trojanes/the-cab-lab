// @module modules @owns zone/stack resize + fit math
// Pure zone-stack helpers shared by every module descriptor's resize handles:
// shrink/merge rules, proportional fitting, id minting. No DOM, no generator
// imports — the same math a headless test runs.
export const round1 = (v) => Math.round(v * 10) / 10;

export const MIN_ZONE_HEIGHT = 60;
export const MIN_ZONE_WIDTH = 150;

/** Envelope dimension along a local axis. */
export const DIM_OF_AXIS = { x: "W", y: "D", z: "H" };

/**
 * Resize command on a row of zones. `items` are ordered from the moved face
 * inward; `delta` is how far the face moved outward (negative = pushed in).
 * Growth: `make(delta)` becomes a new zone at the face once delta reaches
 * `min`; without `make`, or below `min`, the face zone takes it. Shrink: the
 * face zone gives; a zone that would drop under `min` merges into its
 * neighbour, which keeps giving. Returns the list in the same order, or null
 * when the last zone would drop under `min`.
 */
export function resizeStack(items, delta, { key, min, make = null }) {
  const out = items.map((it) => ({ ...it }));
  if (!out.length) return null;
  if (delta >= 0) {
    if (make && delta >= min) out.unshift(make(round1(delta)));
    else out[0][key] = round1(out[0][key] + delta);
    return out;
  }
  const give = -delta;
  while (out.length > 1 && out[0][key] - give < min) {
    const gone = out.shift();
    out[0] = { ...out[0], [key]: round1(out[0][key] + gone[key]) };
  }
  if (out[0][key] - give < min) return null;
  out[0][key] = round1(out[0][key] - give);
  return out;
}

/** First `${prefix}${n}` not already taken. */
export function freshId(prefix, taken) {
  const used = new Set(taken);
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

/** Zones along W (left → right) resized from the left (x−) or right (x+) face. */
export function resizeRow(zones, side, delta, opts) {
  const fromLeft = side.dir < 0;
  const ordered = fromLeft ? zones : zones.slice().reverse();
  const next = resizeStack(ordered, delta, opts);
  if (!next) return null;
  return fromLeft ? next : next.reverse();
}

/** Scale zone heights so they sum to `interior`, absorbing rounding in the last zone. */
export function fitZones(zones, interior) {
  if (!zones.length) return [];
  const sum = zones.reduce((s, z) => s + z.height, 0) || 1;
  // Whole millimetres for all but the last zone, which absorbs the remainder.
  const out = zones.map((z) => ({ ...z, height: Math.max(MIN_ZONE_HEIGHT, Math.round((z.height / sum) * interior)) }));
  const partial = out.slice(0, -1).reduce((s, z) => s + z.height, 0);
  out[out.length - 1].height = round1(interior - partial);
  if (out[out.length - 1].height < MIN_ZONE_HEIGHT) {
    // Interior too small for this many zones; distribute evenly instead.
    const even = round1(interior / out.length);
    out.forEach((z) => (z.height = even));
    out[out.length - 1].height = round1(interior - even * (out.length - 1));
  }
  return out;
}

/** Scale zone widths so they sum to `total` (whole mm, last zone absorbs the remainder, none under MIN_ZONE_WIDTH). */
export function fitZoneWidths(zones, total) {
  if (!zones.length) return [];
  const sum = zones.reduce((s, z) => s + z.width, 0) || 1;
  const out = zones.map((z) => ({ ...z, width: Math.max(MIN_ZONE_WIDTH, Math.round((z.width / sum) * total)) }));
  const partial = out.slice(0, -1).reduce((s, z) => s + z.width, 0);
  out[out.length - 1].width = round1(total - partial);
  if (out[out.length - 1].width < MIN_ZONE_WIDTH) {
    const even = round1(total / out.length);
    out.forEach((z) => (z.width = even));
    out[out.length - 1].width = round1(total - even * (out.length - 1));
  }
  return out;
}
