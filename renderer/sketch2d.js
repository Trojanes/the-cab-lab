// Plane geometry for the Board sketch, in the face's (u, v). No Three.js, no
// DOM: interact.js projects to the screen and calls these. Everything here is
// a few loops over the drawn points, cheap enough for every pointer move.

const EPS = 1e-6;

// (u, v) match generators/_lib/model.ts planeAxes: YZ (y, z), XZ (x, z), XY (x, y).
const UV = { x: ["y", "z"], y: ["x", "z"], z: ["x", "y"] };

export function toUV(face, p) {
  const [u, v] = UV[face.axis];
  return [p[u], p[v]];
}

export function fromUV(face, u, v) {
  const [a, b] = UV[face.axis];
  const p = { x: 0, y: 0, z: 0 };
  p[a] = u;
  p[b] = v;
  p[face.axis] = face.value;
  return p;
}

const r3 = (n) => Math.round(n * 1000) / 1000;

/** Along whichever in-plane axis the cursor has moved further. */
export function orthoPoint(last, cur) {
  const du = cur[0] - last[0];
  const dv = cur[1] - last[1];
  return Math.abs(du) >= Math.abs(dv) ? [cur[0], last[1]] : [last[0], cur[1]];
}

/**
 * Snap the direction last → cur to a multiple of `stepDeg` when it is within
 * `tolDeg`. The length is the cursor's projection on that direction. Null
 * when no step is close enough.
 */
export function polarPoint(last, cur, stepDeg = 45, tolDeg = 4) {
  const du = cur[0] - last[0];
  const dv = cur[1] - last[1];
  const len = Math.hypot(du, dv);
  if (len < EPS) return null;
  const deg = (Math.atan2(dv, du) * 180) / Math.PI;
  const k = Math.round(deg / stepDeg) * stepDeg;
  if (Math.abs(deg - k) > tolDeg) return null;
  const a = (k * Math.PI) / 180;
  const t = du * Math.cos(a) + dv * Math.sin(a);
  return [last[0] + Math.cos(a) * t, last[1] + Math.sin(a) * t];
}

/** Keep the direction last → p and round its length to `step`. */
export function roundLength(last, p, step = 10) {
  const du = p[0] - last[0];
  const dv = p[1] - last[1];
  const len = Math.hypot(du, dv);
  if (len < EPS || !(step > 0)) return p;
  const k = Math.round(len / step) * step / len;
  return [r3(last[0] + du * k), r3(last[1] + dv * k)];
}

function orient(a, b, c) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function onSegment(a, b, p) {
  return Math.min(a[0], b[0]) - EPS <= p[0] && p[0] <= Math.max(a[0], b[0]) + EPS
    && Math.min(a[1], b[1]) - EPS <= p[1] && p[1] <= Math.max(a[1], b[1]) + EPS;
}

/** Segments ab and cd share any point (crossing, touching or overlapping). */
export function segmentsTouch(a, b, c, d) {
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  const s = (x) => (Math.abs(x) < EPS ? 0 : Math.sign(x));
  if (s(o1) * s(o2) < 0 && s(o3) * s(o4) < 0) return true;
  if (s(o1) === 0 && onSegment(a, b, c)) return true;
  if (s(o2) === 0 && onSegment(a, b, d)) return true;
  if (s(o3) === 0 && onSegment(c, d, a)) return true;
  if (s(o4) === 0 && onSegment(c, d, b)) return true;
  return false;
}

/** Proper crossing point of ab and cd, or null. */
export function segmentIntersection(a, b, c, d) {
  const r = [b[0] - a[0], b[1] - a[1]];
  const s = [d[0] - c[0], d[1] - c[1]];
  const den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < EPS) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den;
  const w = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  if (t < -EPS || t > 1 + EPS || w < -EPS || w > 1 + EPS) return null;
  return [a[0] + r[0] * t, a[1] + r[1] * t];
}

/**
 * Would the segment a → b touch the open path `pts` anywhere except where it
 * is meant to? It starts at the last point (so the last segment is its
 * neighbour); `closing` means b is pts[0] (so the first segment is too).
 */
export function segmentHitsPath(pts, a, b, { closing = false } = {}) {
  const n = pts.length;
  if (n >= 2 && reverses(pts[n - 2], a, b)) return true;
  if (closing && n >= 2 && reverses(a, b, pts[1])) return true;
  for (let i = 0; i < n - 1; i += 1) {
    const last = i === n - 2;
    const first = i === 0;
    if (last) continue;
    if (closing && first) continue;
    if (segmentsTouch(pts[i], pts[i + 1], a, b)) return true;
  }
  return false;
}

/** p → q → r doubles back on the same line. */
function reverses(p, q, r) {
  if (Math.abs(orient(p, q, r)) > EPS) return false;
  return (q[0] - p[0]) * (r[0] - q[0]) + (q[1] - p[1]) * (r[1] - q[1]) < -EPS;
}

/** A closed ring whose edges touch anywhere other than at shared corners, or that doubles back. */
export function ringCrosses(pts) {
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i += 1) {
    if (reverses(pts[(i + n - 1) % n], pts[i], pts[(i + 1) % n])) return true;
  }
  for (let i = 0; i < n; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      if (segmentsTouch(a, b, pts[j], pts[(j + 1) % n])) return true;
    }
  }
  return false;
}

/** Two closed rings share any point (crossing or touching edges). */
export function ringsTouch(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    const p = a[i];
    const q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j += 1) {
      if (segmentsTouch(p, q, b[j], b[(j + 1) % b.length])) return true;
    }
  }
  return false;
}

/** Point strictly inside a closed ring (even-odd). */
export function pointInRing(p, ring) {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const a = ring[i];
    const b = ring[j];
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < ((b[0] - a[0]) * (p[1] - a[1])) / (b[1] - a[1]) + a[0]) hit = !hit;
  }
  return hit;
}

function onRingEdge(p, ring) {
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    if (Math.abs(orient(a, b, p)) < 1e-3 * Math.max(1, Math.hypot(b[0] - a[0], b[1] - a[1])) && onSegment(a, b, p)) return true;
  }
  return false;
}

/** Vertices and edge midpoints: enough to tell inside from outside when edges may touch. */
function probes(ring) {
  const out = ring.slice();
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % ring.length];
    out.push([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
  }
  return out;
}

function properCross(a, b, c, d) {
  const s = (x) => (Math.abs(x) < EPS ? 0 : Math.sign(x));
  return s(orient(a, b, c)) * s(orient(a, b, d)) < 0 && s(orient(c, d, a)) * s(orient(c, d, b)) < 0;
}

/**
 * How closed ring `a` sits against ring `b`:
 *   "cross"    they overlap (edges cross, or `a` is partly inside `b`)
 *   "inside"   `a` lies within `b` (edges may touch)
 *   "contains" `b` lies within `a`
 *   "same"     every probe of both lies on the other's edges
 *   "apart"    neither covers the other (edges may touch: two boards side by side)
 */
export function ringRelation(a, b) {
  for (let i = 0; i < a.length; i += 1) {
    for (let j = 0; j < b.length; j += 1) {
      if (properCross(a[i], a[(i + 1) % a.length], b[j], b[(j + 1) % b.length])) return "cross";
    }
  }
  const side = (x, y) => {
    let inn = 0;
    let out = 0;
    for (const p of probes(x)) {
      if (onRingEdge(p, y)) continue;
      if (pointInRing(p, y)) inn += 1; else out += 1;
    }
    return { inn, out };
  };
  const ab = side(a, b);
  const ba = side(b, a);
  if (!ab.inn && !ab.out && !ba.inn && !ba.out) return "same";
  if (ab.inn && ab.out) return "cross";
  if (ba.inn && ba.out) return "cross";
  if (ab.inn) return "inside";
  if (ba.inn) return "contains";
  return "apart";
}

/**
 * Rings that do not overlap, sorted into boards: a ring inside an even number
 * of others is a board outline, inside an odd number it is a through opening
 * of the smallest ring around it. `{ outer, holes }[]` with indices into `rings`.
 */
export function nestRings(rings) {
  const area = rings.map((r) => Math.abs(signedArea(r)));
  const parents = rings.map((r, i) => rings
    .map((o, j) => j)
    .filter((j) => j !== i && area[j] > area[i] && ringRelation(r, rings[j]) === "inside"));
  const boards = [];
  const byOuter = new Map();
  rings.forEach((_, i) => {
    if (parents[i].length % 2 === 0) {
      byOuter.set(i, { outer: i, holes: [] });
      boards.push(byOuter.get(i));
    }
  });
  rings.forEach((_, i) => {
    if (parents[i].length % 2 === 0) return;
    const parent = parents[i].reduce((best, j) => (best == null || area[j] < area[best] ? j : best), null);
    byOuter.get(parent)?.holes.push(i);
  });
  return boards;
}

export function signedArea(pts) {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Foot of the perpendicular from p onto segment ab, or null when it falls outside. */
export function perpendicularFoot(p, a, b) {
  const du = b[0] - a[0];
  const dv = b[1] - a[1];
  const len2 = du * du + dv * dv;
  if (len2 < EPS) return null;
  const t = ((p[0] - a[0]) * du + (p[1] - a[1]) * dv) / len2;
  if (t <= EPS || t >= 1 - EPS) return null;
  return [a[0] + du * t, a[1] + dv * t];
}

/**
 * Object-snap candidates from the drawn path, in (u, v):
 * endpoints, midpoints, crossings between non-adjacent segments, and the
 * perpendicular foot from the last point onto each earlier segment.
 */
export function pathSnaps(pts, { from = null } = {}) {
  const out = [];
  const n = pts.length;
  for (let i = 0; i < n; i += 1) out.push({ uv: pts[i], kind: i === 0 && n >= 3 ? "close" : "endpoint", index: i });
  for (let i = 0; i < n - 1; i += 1) {
    out.push({ uv: [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2], kind: "midpoint", index: i });
  }
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = i + 2; j < n - 1; j += 1) {
      const x = segmentIntersection(pts[i], pts[i + 1], pts[j], pts[j + 1]);
      if (x) out.push({ uv: x, kind: "intersection", index: i });
    }
  }
  if (from) {
    for (let i = 0; i < n - 2; i += 1) {
      const f = perpendicularFoot(from, pts[i], pts[i + 1]);
      if (f) out.push({ uv: f, kind: "perpendicular", index: i });
    }
  }
  return out;
}

/**
 * Typed entry while drawing:
 *   600         length along the current direction
 *   @100,-50    offset from the last point (screen right, screen up)
 *   600<45      length at an angle (screen, counter-clockwise from right); "@" optional
 *   400,600     two sizes (a rectangle's width and height)
 */
export function parseEntry(text) {
  const s = String(text || "").trim().replace(/\s+/g, "");
  if (!s) return null;
  const num = "[-+]?(?:\\d+\\.?\\d*|\\.\\d+)";
  let m = s.match(new RegExp(`^@?(${num})<(${num})$`));
  if (m) return { kind: "polar", len: Number(m[1]), deg: Number(m[2]) };
  m = s.match(new RegExp(`^@(${num}),(${num})$`));
  if (m) return { kind: "rel", dx: Number(m[1]), dy: Number(m[2]) };
  m = s.match(new RegExp(`^(${num}),(${num})$`));
  if (m) return { kind: "pair", a: Number(m[1]), b: Number(m[2]) };
  m = s.match(new RegExp(`^(${num})$`));
  if (m) return { kind: "length", value: Number(m[1]) };
  return null;
}

/**
 * The in-plane axis closest to a screen direction. `su` / `sv` are the screen
 * images (client px, y down) of one millimetre along +u and +v; `sx` / `sy`
 * is the screen direction wanted (y down). Returns a unit [du, dv].
 */
export function axisForScreen(su, sv, sx, sy) {
  const cands = [[1, 0, su], [-1, 0, [-su[0], -su[1]]], [0, 1, sv], [0, -1, [-sv[0], -sv[1]]]];
  let best = null;
  let bestDot = -Infinity;
  for (const [du, dv, s] of cands) {
    const l = Math.hypot(s[0], s[1]) || 1;
    const dot = (s[0] * sx + s[1] * sy) / l;
    if (dot > bestDot) { bestDot = dot; best = [du, dv]; }
  }
  return best;
}

/** Screen right / screen up as in-plane unit axes. */
export function screenAxes(su, sv) {
  return { right: axisForScreen(su, sv, 1, 0), up: axisForScreen(su, sv, 0, -1) };
}

/**
 * Next point for a typed entry. `dir` is the current rubber-band direction
 * (unit [du, dv]) for a bare length; `axes` maps screen right / up.
 */
export function pointFromEntry(last, entry, { dir = null, axes }) {
  if (!entry || !last) return null;
  if (entry.kind === "length") {
    if (!dir || !(entry.value > 0)) return null;
    return [r3(last[0] + dir[0] * entry.value), r3(last[1] + dir[1] * entry.value)];
  }
  if (entry.kind === "rel") {
    const du = axes.right[0] * entry.dx + axes.up[0] * entry.dy;
    const dv = axes.right[1] * entry.dx + axes.up[1] * entry.dy;
    return [r3(last[0] + du), r3(last[1] + dv)];
  }
  if (entry.kind === "polar") {
    if (!(entry.len > 0)) return null;
    const a = (entry.deg * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a);
    const du = axes.right[0] * c + axes.up[0] * s;
    const dv = axes.right[1] * c + axes.up[1] * s;
    return [r3(last[0] + du * entry.len), r3(last[1] + dv * entry.len)];
  }
  return null;
}

/**
 * Opposite corner of a rectangle from typed sizes. Width runs along screen
 * right, height along screen up; each sign follows the side the cursor is on.
 */
export function cornerFromPair(anchor, entry, { axes, cursor }) {
  if (!entry || entry.kind !== "pair" || !(entry.a > 0) || !(entry.b > 0)) return null;
  const side = (ax) => {
    if (!cursor) return 1;
    const d = (cursor[0] - anchor[0]) * ax[0] + (cursor[1] - anchor[1]) * ax[1];
    return d < 0 ? -1 : 1;
  };
  const sr = side(axes.right);
  const su = side(axes.up);
  return [
    r3(anchor[0] + axes.right[0] * entry.a * sr + axes.up[0] * entry.b * su),
    r3(anchor[1] + axes.right[1] * entry.a * sr + axes.up[1] * entry.b * su),
  ];
}

/** Why a ring cannot become a board, or null. */
export function ringProblem(pts, min) {
  if (pts.length < 3) return "needs at least 3 points";
  if (Math.abs(signedArea(pts)) < 1) return "has no area";
  if (ringCrosses(pts)) return "crosses itself";
  const us = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1]);
  if (Math.max(...us) - Math.min(...us) < min || Math.max(...vs) - Math.min(...vs) < min) return `is under ${min} × ${min}`;
  return null;
}
