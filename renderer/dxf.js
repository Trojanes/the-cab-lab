// Minimal DXF reader for the Vehicle nose: a 2D side view (DXF X along the
// van, DXF Y up) made of LINE / LWPOLYLINE (with bulges) / POLYLINE / ARC /
// SPLINE entities. Arcs are flattened to short segments, segments are chained
// by shared end points, and the longest chain becomes the nose points
// ([y, z] in mm). No dependency: the file is read as group-code / value pairs.
// Nothing here is kept at run time — the resulting points live in job.json.

const UNIT_SCALE = { 0: null, 1: 25.4, 2: 304.8, 4: 1, 5: 10, 6: 1000, 14: 0.1 };
const UNIT_NAME = { 1: "in", 2: "ft", 4: "mm", 5: "cm", 6: "m", 14: "dm" };
const ARC_STEP_DEG = 5;
const JOIN_TOL = 0.5; // mm

function pairs(text) {
  const lines = text.split(/\r\n|\r|\n/);
  const out = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = parseInt(lines[i].trim(), 10);
    if (Number.isNaN(code)) continue;
    out.push([code, lines[i + 1].trim()]);
  }
  return out;
}

function arcPoints(cx, cy, r, a0, a1) {
  // a0 → a1 counter-clockwise, degrees.
  let sweep = a1 - a0;
  while (sweep <= 0) sweep += 360;
  const n = Math.max(2, Math.ceil(sweep / ARC_STEP_DEG));
  const pts = [];
  for (let i = 0; i <= n; i += 1) {
    const a = ((a0 + (sweep * i) / n) * Math.PI) / 180;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}

/** Points along a polyline vertex list, expanding bulges into arcs. */
function expandBulges(verts, closed) {
  const out = [];
  const n = verts.length;
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i += 1) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    if (!out.length) out.push([a.x, a.y]);
    const bulge = a.bulge || 0;
    if (Math.abs(bulge) < 1e-9) { out.push([b.x, b.y]); continue; }
    const theta = 4 * Math.atan(bulge); // included angle, signed
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-9) continue;
    const r = d / (2 * Math.sin(Math.abs(theta) / 2));
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const h = Math.sqrt(Math.max(0, r * r - (d / 2) * (d / 2)));
    const sgn = bulge > 0 ? 1 : -1;
    const cx = mx - (sgn * h * dy) / d;
    const cy = my + (sgn * h * dx) / d;
    const sa = Math.atan2(a.y - cy, a.x - cx);
    const steps = Math.max(2, Math.ceil((Math.abs(theta) * 180) / Math.PI / ARC_STEP_DEG));
    for (let s = 1; s <= steps; s += 1) {
      const ang = sa + (theta * s) / steps;
      out.push([cx + r * Math.cos(ang), cy + r * Math.sin(ang)]);
    }
  }
  return out;
}

/**
 * Parse a DXF text. Returns { polylines: [[[x, y], ...]], units, scale, counts, warnings }.
 * Coordinates are already scaled to mm.
 */
export function parseDxf(text) {
  const P = pairs(text);
  const counts = {};
  const warnings = [];
  const raw = []; // polylines in file units
  let insunits = null;

  // Header: $INSUNITS.
  for (let i = 0; i < P.length - 1; i += 1) {
    if (P[i][0] === 9 && P[i][1] === "$INSUNITS" && P[i + 1][0] === 70) { insunits = parseInt(P[i + 1][1], 10); break; }
    if (P[i][0] === 0 && P[i][1] === "ENDSEC" && P[i - 1] && P[i - 1][1] === "HEADER") break;
  }

  // Entities section only (blocks are ignored).
  let i = 0;
  while (i < P.length && !(P[i][0] === 2 && P[i][1] === "ENTITIES")) i += 1;
  i += 1;
  const readEntity = (start) => {
    // Collect the group codes of one entity until the next 0 code.
    const groups = [];
    let j = start;
    while (j < P.length && P[j][0] !== 0) { groups.push(P[j]); j += 1; }
    return { groups, next: j };
  };
  const num = (groups, code, dflt = 0) => { const g = groups.find((p) => p[0] === code); return g ? Number(g[1]) : dflt; };

  while (i < P.length) {
    const [code, value] = P[i];
    if (code === 0 && value === "ENDSEC") break;
    if (code !== 0) { i += 1; continue; }
    const type = value;
    const { groups, next } = readEntity(i + 1);
    i = next;
    counts[type] = (counts[type] || 0) + 1;

    if (type === "LINE") {
      raw.push([[num(groups, 10), num(groups, 20)], [num(groups, 11), num(groups, 21)]]);
    } else if (type === "LWPOLYLINE") {
      const verts = [];
      let cur = null;
      for (const [c, v] of groups) {
        if (c === 10) { cur = { x: Number(v), y: 0, bulge: 0 }; verts.push(cur); }
        else if (c === 20 && cur) cur.y = Number(v);
        else if (c === 42 && cur) cur.bulge = Number(v);
      }
      const closed = (num(groups, 70) & 1) === 1;
      if (verts.length >= 2) raw.push(expandBulges(verts, closed));
    } else if (type === "POLYLINE") {
      const closed = (num(groups, 70) & 1) === 1;
      const verts = [];
      while (i < P.length) {
        if (P[i][0] !== 0) { i += 1; continue; }
        if (P[i][1] === "SEQEND") { const e = readEntity(i + 1); i = e.next; break; }
        if (P[i][1] !== "VERTEX") break;
        const e = readEntity(i + 1);
        i = e.next;
        verts.push({ x: num(e.groups, 10), y: num(e.groups, 20), bulge: num(e.groups, 42) });
      }
      if (verts.length >= 2) raw.push(expandBulges(verts, closed));
    } else if (type === "ARC") {
      raw.push(arcPoints(num(groups, 10), num(groups, 20), num(groups, 40), num(groups, 50), num(groups, 51)));
    } else if (type === "SPLINE") {
      const fit = [];
      const ctrl = [];
      let f = null;
      let c = null;
      for (const [gc, v] of groups) {
        if (gc === 11) { f = [Number(v), 0]; fit.push(f); }
        else if (gc === 21 && f) f[1] = Number(v);
        else if (gc === 10) { c = [Number(v), 0]; ctrl.push(c); }
        else if (gc === 20 && c) c[1] = Number(v);
      }
      if (fit.length >= 2) raw.push(fit);
      else if (ctrl.length >= 2) { raw.push(ctrl); warnings.push("SPLINE without fit points: control polygon used."); }
    } else if (type === "CIRCLE" || type === "ELLIPSE") {
      warnings.push(`${type} ignored (a nose profile is an open side view).`);
    }
  }

  const scale = UNIT_SCALE[insunits] ?? null;
  if (scale == null) warnings.push(insunits ? `Unknown $INSUNITS ${insunits}: assuming mm.` : "No $INSUNITS in the file: assuming mm.");
  const k = scale ?? 1;
  const polylines = raw.map((pl) => pl.map(([x, y]) => [x * k, y * k]));
  return { polylines, units: UNIT_NAME[insunits] || "mm", scale: k, counts, warnings };
}

function samePt(a, b, tol = JOIN_TOL) {
  return Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol;
}

/** Join polylines that share end points into chains. */
export function chainPolylines(polylines) {
  const pool = polylines.filter((pl) => pl.length >= 2).map((pl) => pl.slice());
  const chains = [];
  while (pool.length) {
    const chain = pool.shift();
    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pool.length; i += 1) {
        const pl = pool[i];
        const head = chain[0];
        const tail = chain[chain.length - 1];
        if (samePt(tail, pl[0])) { chain.push(...pl.slice(1)); }
        else if (samePt(tail, pl[pl.length - 1])) { chain.push(...pl.slice(0, -1).reverse()); }
        else if (samePt(head, pl[pl.length - 1])) { chain.unshift(...pl.slice(0, -1)); }
        else if (samePt(head, pl[0])) { chain.unshift(...pl.slice(1).reverse()); }
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    chains.push(chain);
  }
  return chains;
}

function length(pl) {
  let l = 0;
  for (let i = 1; i < pl.length; i += 1) l += Math.hypot(pl[i][0] - pl[i - 1][0], pl[i][1] - pl[i - 1][1]);
  return l;
}

/**
 * DXF side view → nose points [[y, z], ...] in mm (DXF X → Y along the van, DXF Y → Z).
 * The longest chain wins; the nose is moved so its min X / min Y sit at 0.
 * Returns { points, chains, units, warnings, counts } or { error }.
 */
export function noseFromDxf(text) {
  const parsed = parseDxf(text);
  const chains = chainPolylines(parsed.polylines);
  if (!chains.length) return { error: "No LINE / POLYLINE / ARC / SPLINE entities found in the DXF.", ...parsed };
  chains.sort((a, b) => length(b) - length(a));
  const best = chains[0];
  const minX = Math.min(...best.map((p) => p[0]));
  const minY = Math.min(...best.map((p) => p[1]));
  const points = best.map(([x, y]) => [Math.round((x - minX) * 100) / 100, Math.round((y - minY) * 100) / 100]);
  const warnings = [...parsed.warnings];
  if (chains.length > 1) warnings.push(`${chains.length} separate chains: the longest (${points.length} points) is used.`);
  return { points, chains: chains.length, units: parsed.units, scale: parsed.scale, counts: parsed.counts, warnings };
}
