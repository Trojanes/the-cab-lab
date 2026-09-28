// Sketch curves with arcs, in the face's (u, v). Pure geometry: no Three.js, no DOM.
//
// An item is { closed, pts: [[u, v], ...], b: [bulge, ...] }. Segment i runs
// pts[i] → pts[i + 1] (the last one wraps back to pts[0] when closed) and b[i]
// is its bulge: tan(sweep / 4), positive = counter-clockwise, 0 = straight.
// A circle is two points with bulges [1, 1]. The generator tessellates the
// same bulges (generators/sketchBoard/generator.ts tessellateRing).
import { pointInRing, ringCrosses, signedArea, segmentsTouch } from "./sketch2d.js";

const TAU = Math.PI * 2;
const EPS = 1e-9;
/** Arcs are drawn as chords at most this far from the true curve, and at most ARC_STEP_MAX apart. */
const ARC_CHORD_MM = 0.05;
const ARC_STEP_MAX = (5 * Math.PI) / 180;
/** How far Extend looks along an end. */
const EXTEND_REACH_MM = 100000;
/** Ends this close are one point when lines are joined. */
export const JOIN_TOL_MM = 0.5;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const addv = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const cross = (a, b) => a[0] * b[1] - a[1] * b[0];
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const wrap = (x) => { const y = x % TAU; return y < 0 ? y + TAU : y; };
const r3 = (n) => Math.round(n * 1000) / 1000;
const rp = (p) => [r3(p[0]), r3(p[1])];

// --- one segment ------------------------------------------------------------------------

/** `{ c, r, a0, sweep }` of a bulged segment, or null when it is straight. */
export function arcOf(a, b, bulge) {
  if (!bulge || Math.abs(bulge) < EPS) return null;
  const chord = dist(a, b);
  if (chord < EPS) return null;
  const sweep = 4 * Math.atan(bulge);
  const d = [(b[0] - a[0]) / chord, (b[1] - a[1]) / chord];
  const h = (chord / 2) / Math.tan(sweep / 2);
  const c = [(a[0] + b[0]) / 2 - d[1] * h, (a[1] + b[1]) / 2 + d[0] * h];
  return { c, r: dist(a, c), a0: Math.atan2(a[1] - c[1], a[0] - c[0]), sweep };
}

function arcPoint(arc, f) {
  const t = arc.a0 + arc.sweep * f;
  return [arc.c[0] + arc.r * Math.cos(t), arc.c[1] + arc.r * Math.sin(t)];
}

/** 0 at the arc's start, 1 at its end; above 1 when p is off the arc's span. */
function fracOnArc(arc, p) {
  const ang = Math.atan2(p[1] - arc.c[1], p[0] - arc.c[0]);
  let d = arc.sweep > 0 ? wrap(ang - arc.a0) : wrap(arc.a0 - ang);
  if (d > TAU - 1e-9) d = 0;
  return d / Math.abs(arc.sweep);
}

export function segPointAt(s, f) {
  const arc = arcOf(s.a, s.b, s.bulge);
  return arc ? arcPoint(arc, f) : lerp(s.a, s.b, f);
}

/** The part of a segment from f0 to f1. */
export function segPart(s, f0, f1) {
  const arc = arcOf(s.a, s.b, s.bulge);
  const bulge = arc ? Math.tan((arc.sweep * (f1 - f0)) / 4) : 0;
  return { a: f0 <= 0 ? s.a : segPointAt(s, f0), b: f1 >= 1 ? s.b : segPointAt(s, f1), bulge };
}

/** Unit tangent at f along the segment's direction. */
function tangentAt(s, f) {
  const arc = arcOf(s.a, s.b, s.bulge);
  if (!arc) return unit(sub(s.b, s.a));
  const t = arc.a0 + arc.sweep * f;
  const k = Math.sign(arc.sweep);
  return [-Math.sin(t) * k, Math.cos(t) * k];
}

/** Points after `a` up to and including `b`. */
export function segmentPoints(a, b, bulge) {
  const arc = arcOf(a, b, bulge);
  if (!arc) return [b];
  const step = Math.min(ARC_STEP_MAX, 2 * Math.acos(Math.max(-1, 1 - ARC_CHORD_MM / arc.r)));
  const n = Math.max(2, Math.ceil(Math.abs(arc.sweep) / step));
  const out = [];
  for (let k = 1; k < n; k += 1) out.push(arcPoint(arc, k / n));
  out.push(b);
  return out;
}

/** Nearest point of a segment to p: `{ d, f, q }`. */
export function segDistance(s, p) {
  const arc = arcOf(s.a, s.b, s.bulge);
  if (!arc) {
    const d = sub(s.b, s.a);
    const l2 = dot(d, d);
    const f = l2 < EPS ? 0 : Math.max(0, Math.min(1, dot(sub(p, s.a), d) / l2));
    const q = lerp(s.a, s.b, f);
    return { d: dist(p, q), f, q };
  }
  const f = fracOnArc(arc, p);
  if (f <= 1) {
    const q = arcPoint(arc, f);
    return { d: dist(p, q), f, q };
  }
  const da = dist(p, s.a);
  const db = dist(p, s.b);
  return da < db ? { d: da, f: 0, q: s.a } : { d: db, f: 1, q: s.b };
}

function lineParams(a, b, c, d) {
  const r = sub(b, a);
  const s = sub(d, c);
  const den = cross(r, s);
  if (Math.abs(den) < EPS) return null;
  const w = sub(c, a);
  return { t: cross(w, s) / den, u: cross(w, r) / den };
}

/** Line through a → b against a full circle: the line parameters of the crossings. */
function lineCircle(a, b, c, r) {
  const d = sub(b, a);
  const f = sub(a, c);
  const A = dot(d, d);
  if (A < EPS) return [];
  const B = 2 * dot(f, d);
  const C = dot(f, f) - r * r;
  const disc = B * B - 4 * A * C;
  if (disc < -1e-9) return [];
  const sq = Math.sqrt(Math.max(0, disc));
  return sq < 1e-12 ? [-B / (2 * A)] : [(-B - sq) / (2 * A), (-B + sq) / (2 * A)];
}

function circleCircle(c1, r1, c2, r2) {
  const d = dist(c1, c2);
  if (d < EPS || d > r1 + r2 + 1e-9 || d < Math.abs(r1 - r2) - 1e-9) return [];
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
  const e = [(c2[0] - c1[0]) / d, (c2[1] - c1[1]) / d];
  const m = addv(c1, mul(e, a));
  if (h < 1e-12) return [m];
  return [[m[0] - e[1] * h, m[1] + e[0] * h], [m[0] + e[1] * h, m[1] - e[0] * h]];
}

const IN = (f) => f >= -1e-9 && f <= 1 + 1e-9;

/** Crossings of two segments: `{ p, f1, f2 }` with the fraction along each. */
export function segIntersections(s1, s2) {
  const A1 = arcOf(s1.a, s1.b, s1.bulge);
  const A2 = arcOf(s2.a, s2.b, s2.bulge);
  const out = [];
  if (!A1 && !A2) {
    const x = lineParams(s1.a, s1.b, s2.a, s2.b);
    if (x && IN(x.t) && IN(x.u)) out.push({ p: lerp(s1.a, s1.b, x.t), f1: x.t, f2: x.u });
    return out;
  }
  if (!A1 || !A2) {
    const [L, C, swap] = A1 ? [s2, A1, true] : [s1, A2, false];
    for (const t of lineCircle(L.a, L.b, C.c, C.r)) {
      if (!IN(t)) continue;
      const p = lerp(L.a, L.b, t);
      const g = fracOnArc(C, p);
      if (!IN(g)) continue;
      out.push(swap ? { p, f1: g, f2: t } : { p, f1: t, f2: g });
    }
    return out;
  }
  for (const p of circleCircle(A1.c, A1.r, A2.c, A2.r)) {
    const f1 = fracOnArc(A1, p);
    const f2 = fracOnArc(A2, p);
    if (IN(f1) && IN(f2)) out.push({ p, f1, f2 });
  }
  return out;
}

// --- whole items ------------------------------------------------------------------------

export function itemSegments(item) {
  const n = item.pts.length;
  const count = item.closed ? n : n - 1;
  const out = [];
  for (let i = 0; i < count; i += 1) out.push({ a: item.pts[i], b: item.pts[(i + 1) % n], bulge: (item.b && item.b[i]) || 0, i });
  return out;
}

/** The item as chords (arcs tessellated). Closed items do not repeat the first point. */
export function itemPoints(item) {
  const out = [item.pts[0]];
  for (const s of itemSegments(item)) out.push(...segmentPoints(s.a, s.b, s.bulge));
  if (item.closed) out.pop();
  return out;
}

function fromSegments(segs, closed) {
  const pts = closed ? segs.map((s) => s.a) : [segs[0].a, ...segs.map((s) => s.b)];
  return clean({ closed, pts: pts.map(rp), b: segs.map((s) => s.bulge) });
}

/** Drop repeated points (a zero-length segment) and keep the bulges in step. */
export function clean(item) {
  const pts = [];
  const b = [];
  const n = item.pts.length;
  for (let i = 0; i < n; i += 1) {
    const p = item.pts[i];
    if (pts.length && dist(p, pts[pts.length - 1]) < 1e-6) { b[b.length - 1] = (item.b && item.b[i]) || 0; continue; }
    pts.push(p);
    b.push((item.b && item.b[i]) || 0);
  }
  if (item.closed && pts.length > 1 && dist(pts[0], pts[pts.length - 1]) < 1e-6) { pts.pop(); b.pop(); }
  if (!item.closed) b.length = Math.max(0, pts.length - 1);
  return { closed: item.closed, pts, b };
}

export function reverseItem(item) {
  const pts = item.pts.slice().reverse();
  if (!item.closed) return { closed: false, pts, b: item.b.slice().reverse().map((x) => -x) };
  // Closed: segment i (p_i → p_i+1) becomes (p_i+1 → p_i); keep pts[0] first.
  const n = item.pts.length;
  const rp2 = [item.pts[0], ...item.pts.slice(1).reverse()];
  const rb = [];
  for (let i = 0; i < n; i += 1) rb.push(-(item.b[(n - 1 - i) % n] || 0));
  return { closed: true, pts: rp2, b: rb };
}

export function circleItem(c, r) {
  return { closed: true, pts: [rp([c[0] + r, c[1]]), rp([c[0] - r, c[1]])], b: [1, 1] };
}

export function rectItem(a, b) {
  return { closed: true, pts: [[a[0], a[1]], [b[0], a[1]], [b[0], b[1]], [a[0], b[1]]].map(rp), b: [0, 0, 0, 0] };
}

/** Open arc from a to b through m, or null when the three are in line. */
export function arcItem(a, m, b) {
  const d = 2 * (a[0] * (m[1] - b[1]) + m[0] * (b[1] - a[1]) + b[0] * (a[1] - m[1]));
  if (Math.abs(d) < 1e-9 || dist(a, b) < 1e-6) return null;
  const a2 = dot(a, a);
  const m2 = dot(m, m);
  const b2 = dot(b, b);
  const c = [(a2 * (m[1] - b[1]) + m2 * (b[1] - a[1]) + b2 * (a[1] - m[1])) / d, (a2 * (b[0] - m[0]) + m2 * (a[0] - b[0]) + b2 * (m[0] - a[0])) / d];
  const ccw = cross(sub(m, a), sub(b, m)) > 0;
  const angA = Math.atan2(a[1] - c[1], a[0] - c[0]);
  const angB = Math.atan2(b[1] - c[1], b[0] - c[0]);
  const sweep = ccw ? wrap(angB - angA) : -wrap(angA - angB);
  return { closed: false, pts: [rp(a), rp(b)], b: [Math.tan(sweep / 4)] };
}

/** Centres of the arcs in an item (snap points). */
export function arcCentres(item) {
  const out = [];
  for (const s of itemSegments(item)) {
    const arc = arcOf(s.a, s.b, s.bulge);
    if (arc && !out.some((c) => dist(c, arc.c) < 1e-6)) out.push(arc.c);
  }
  return out;
}

/** Why an item cannot stay in the sketch, or null. */
export function itemProblem(item) {
  const pts = itemPoints(item);
  if (item.closed) {
    if (pts.length < 3 || Math.abs(signedArea(pts)) < 1) return "has no area";
    if (ringCrosses(pts)) return "crosses itself";
    return null;
  }
  for (let i = 0; i < pts.length - 1; i += 1) {
    for (let j = i + 2; j < pts.length - 1; j += 1) {
      if (segmentsTouch(pts[i], pts[i + 1], pts[j], pts[j + 1])) return "crosses itself";
    }
  }
  return null;
}

/** Nearest segment of any item to p within `tol`: `{ index, k, d, f, q }` or null. */
export function nearestSegment(items, p, tol = Infinity) {
  let best = null;
  items.forEach((item, index) => {
    itemSegments(item).forEach((s, k) => {
      const q = segDistance(s, p);
      if (q.d <= tol && (!best || q.d < best.d)) best = { index, k, ...q };
    });
  });
  return best;
}

/** Every crossing between segments of the items (snap points). */
export function allIntersections(items) {
  const segs = [];
  items.forEach((item, index) => itemSegments(item).forEach((s, k) => segs.push({ ...s, index, k, n: item.pts.length, closed: item.closed })));
  const out = [];
  for (let i = 0; i < segs.length; i += 1) {
    for (let j = i + 1; j < segs.length; j += 1) {
      const A = segs[i];
      const B = segs[j];
      if (A.index === B.index) {
        const adj = Math.abs(A.k - B.k) === 1 || (A.closed && Math.abs(A.k - B.k) === A.n - 1);
        if (adj) continue;
      }
      for (const x of segIntersections(A, B)) out.push(x.p);
    }
  }
  return out;
}

// --- trim / extend / join ---------------------------------------------------------------

/** Where Trim would cut segment k of items[index] around p: `{ lo, hi, piece }`. */
export function trimSpan(items, index, k, f) {
  const segs = itemSegments(items[index]);
  const s = segs[k];
  const cuts = [];
  items.forEach((other, j) => {
    itemSegments(other).forEach((o, kk) => {
      if (j === index && kk === k) return;
      for (const x of segIntersections(s, o)) if (x.f1 > 1e-6 && x.f1 < 1 - 1e-6) cuts.push(x.f1);
    });
  });
  const lo = cuts.filter((c) => c < f).reduce((m, c) => Math.max(m, c), 0);
  const hi = cuts.filter((c) => c > f).reduce((m, c) => Math.min(m, c), 1);
  return { lo, hi, piece: segPart(s, lo, hi) };
}

/**
 * Trim the piece of segment k of items[index] between the crossings around f
 * (or up to the segment's corner). A closed item opens; an open one may split.
 */
export function trimAt(items, index, k, f) {
  const item = items[index];
  const segs = itemSegments(item);
  const s = segs[k];
  const { lo, hi } = trimSpan(items, index, k, f);
  const left = lo > 1e-6 ? segPart(s, 0, lo) : null;
  const right = hi < 1 - 1e-6 ? segPart(s, hi, 1) : null;
  let pieces;
  if (item.closed) {
    const chain = [...(right ? [right] : []), ...segs.slice(k + 1), ...segs.slice(0, k), ...(left ? [left] : [])];
    pieces = chain.length ? [chain] : [];
  } else {
    pieces = [[...segs.slice(0, k), ...(left ? [left] : [])], [...(right ? [right] : []), ...segs.slice(k + 1)]].filter((c) => c.length);
  }
  const made = pieces.map((c) => {
    const it = fromSegments(c, false);
    if (item.construction) it.construction = true;
    return it;
  }).filter((it) => it.pts.length >= 2);
  return [...items.slice(0, index), ...made, ...items.slice(index + 1)];
}

/**
 * Extend the open end of items[index] nearest p, straight on, to the first
 * segment it meets. `{ items, from, to }`, or `{ error }`.
 */
export function extendAt(items, index, p) {
  const item = items[index];
  if (item.closed) return { error: "Extend works on open lines" };
  const n = item.pts.length;
  const atEnd = dist(p, item.pts[n - 1]) <= dist(p, item.pts[0]);
  const k = atEnd ? n - 2 : 0;
  if (Math.abs(item.b[k] || 0) > EPS) return { error: "That end is an arc" };
  const tip = atEnd ? item.pts[n - 1] : item.pts[0];
  const back = atEnd ? item.pts[n - 2] : item.pts[1];
  const dir = unit(sub(tip, back));
  const ray = { a: tip, b: addv(tip, mul(dir, EXTEND_REACH_MM)), bulge: 0 };
  let best = Infinity;
  items.forEach((other, j) => {
    itemSegments(other).forEach((o, kk) => {
      if (j === index && kk === k) return;
      for (const x of segIntersections(ray, o)) if (x.f1 * EXTEND_REACH_MM > 1e-3 && x.f1 < best) best = x.f1;
    });
  });
  if (!Number.isFinite(best)) return { error: "Nothing to extend to" };
  const to = rp(lerp(ray.a, ray.b, best));
  const pts = item.pts.slice();
  pts[atEnd ? n - 1 : 0] = to;
  return { items: [...items.slice(0, index), { ...item, pts }, ...items.slice(index + 1)], from: tip, to };
}

/** Open items whose ends meet become one; one whose ends meet closes. */
export function joinItems(items, tol = JOIN_TOL_MM) {
  const list = items.map((it) => ({ closed: it.closed, pts: it.pts.slice(), b: it.b.slice() }));
  const near = (a, b) => dist(a, b) <= tol;
  const first = (it) => it.pts[0];
  const lastPt = (it) => it.pts[it.pts.length - 1];
  const join = (A, B) => ({ closed: false, pts: [...A.pts, ...B.pts.slice(1)], b: [...A.b, ...B.b] });
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < list.length && !changed; i += 1) {
      const A = list[i];
      if (A.closed) continue;
      if (A.pts.length >= 3 && near(first(A), lastPt(A))) {
        const pts = A.pts.slice(0, -1);
        if (pts.length >= 3 || A.b.some((x) => Math.abs(x) > EPS)) {
          list[i] = clean({ closed: true, pts, b: A.b });
          changed = true;
          break;
        }
      }
      for (let j = 0; j < list.length; j += 1) {
        if (j === i || list[j].closed) continue;
        const B = list[j];
        let merged = null;
        if (near(lastPt(A), first(B))) merged = join(A, B);
        else if (near(lastPt(A), lastPt(B))) merged = join(A, reverseItem(B));
        else if (near(first(A), lastPt(B))) merged = join(B, A);
        else if (near(first(A), first(B))) merged = join(reverseItem(A), B);
        if (merged) {
          list[i] = clean(merged);
          list.splice(j, 1);
          changed = true;
          break;
        }
      }
    }
  }
  return list;
}

// --- corners ----------------------------------------------------------------------------

/** Nearest vertex of any item within `tol`: `{ index, vi, d }` or null. */
export function nearestVertex(items, p, tol = Infinity) {
  let best = null;
  items.forEach((item, index) => item.pts.forEach((q, vi) => {
    const d = dist(p, q);
    if (d <= tol && (!best || d < best.d)) best = { index, vi, d };
  }));
  return best;
}

function corner(item, vi) {
  const n = item.pts.length;
  if (!item.closed && (vi <= 0 || vi >= n - 1)) return { error: "Pick a corner, not an end" };
  const prev = (vi - 1 + n) % n;
  const next = (vi + 1) % n;
  if (Math.abs(item.b[prev] || 0) > EPS || Math.abs(item.b[vi] || 0) > EPS) return { error: "Only a corner between two straight edges" };
  const A = item.pts[prev];
  const P = item.pts[vi];
  const B = item.pts[next];
  const din = unit(sub(P, A));
  const dout = unit(sub(B, P));
  const turn = cross(din, dout);
  if (Math.abs(turn) < 1e-9) return { error: "The two edges are in line" };
  return { A, P, B, la: dist(A, P), lb: dist(P, B), din, dout, turn };
}

function spliceCorner(item, vi, pts, bulge) {
  const out = {
    closed: item.closed,
    pts: [...item.pts.slice(0, vi), ...pts.map(rp), ...item.pts.slice(vi + 1)],
    b: [...item.b.slice(0, vi), bulge, item.b[vi] || 0, ...item.b.slice(vi + 1)],
  };
  return clean(out);
}

/** Round corner vi with radius r. `{ item }` or `{ error }`. */
export function filletCorner(item, vi, r) {
  const c = corner(item, vi);
  if (c.error) return c;
  if (!(r > 0)) return { error: "Type a radius above 0" };
  const half = Math.acos(Math.max(-1, Math.min(1, dot(mul(c.din, -1), c.dout)))) / 2;
  const t = r / Math.tan(half);
  if (t > Math.min(c.la, c.lb) + 1e-6) return { error: `This corner takes a radius up to ${Math.floor(Math.min(c.la, c.lb) * Math.tan(half))}` };
  const sweep = Math.sign(c.turn) * (Math.PI - 2 * half);
  return { item: spliceCorner(item, vi, [sub(c.P, mul(c.din, t)), addv(c.P, mul(c.dout, t))], Math.tan(sweep / 4)) };
}

/** Cut corner vi d1 back along the incoming edge and d2 along the outgoing one. */
export function chamferCorner(item, vi, d1, d2 = d1) {
  const c = corner(item, vi);
  if (c.error) return c;
  if (!(d1 > 0) || !(d2 > 0)) return { error: "Type distances above 0" };
  if (d1 > c.la + 1e-6 || d2 > c.lb + 1e-6) return { error: `This corner takes up to ${Math.floor(c.la)} × ${Math.floor(c.lb)}` };
  return { item: spliceCorner(item, vi, [sub(c.P, mul(c.din, d1)), addv(c.P, mul(c.dout, d2))], 0) };
}

// --- offset / mirror --------------------------------------------------------------------

/** +1 = offset to the left of the item's direction reaches p's side, −1 = the right. */
export function offsetSide(item, p) {
  if (item.closed) {
    const pts = itemPoints(item);
    const inside = pointInRing(p, pts);
    const leftIsInside = signedArea(pts) > 0;
    return inside === leftIsInside ? 1 : -1;
  }
  const near = nearestSegment([item], p);
  const s = itemSegments(item)[near.k];
  return cross(tangentAt(s, near.f), sub(p, near.q)) >= 0 ? 1 : -1;
}

function prim(s, D) {
  const arc = arcOf(s.a, s.b, s.bulge);
  if (!arc) {
    const d = unit(sub(s.b, s.a));
    const n = [-d[1], d[0]];
    return { line: true, a: addv(s.a, mul(n, D)), b: addv(s.b, mul(n, D)), d };
  }
  const r = arc.r - D * Math.sign(arc.sweep);
  if (r <= 1e-6) return null;
  return { line: false, c: arc.c, r, sweep: arc.sweep, a: addv(arc.c, mul(unit(sub(s.a, arc.c)), r)), b: addv(arc.c, mul(unit(sub(s.b, arc.c)), r)) };
}

/** Where two offset primitives meet near `near`. */
function meet(p, q, near) {
  let cands = [];
  if (p.line && q.line) {
    const x = lineParams(p.a, p.b, q.a, q.b);
    if (x) cands.push(lerp(p.a, p.b, x.t));
  } else if (p.line || q.line) {
    const [L, C] = p.line ? [p, q] : [q, p];
    cands = lineCircle(L.a, L.b, C.c, C.r).map((t) => lerp(L.a, L.b, t));
  } else {
    cands = circleCircle(p.c, p.r, q.c, q.r);
  }
  if (!cands.length) return null;
  return cands.reduce((best, c) => (dist(c, near) < dist(best, near) ? c : best));
}

/** The item moved `D` mm to its left (negative: right). `{ item }` or `{ error }`. */
export function offsetItem(item, D) {
  const segs = itemSegments(item);
  const prims = segs.map((s) => prim(s, D));
  if (prims.some((p) => !p)) return { error: "Too far: an arc in the shape would vanish" };
  const n = segs.length;
  const pts = [];
  const count = item.closed ? n : n + 1;
  for (let k = 0; k < count; k += 1) {
    if (!item.closed && k === 0) { pts.push(prims[0].a); continue; }
    if (!item.closed && k === n) { pts.push(prims[n - 1].b); continue; }
    const pk = (k - 1 + n) % n;
    const qk = k % n;
    const p = prims[pk];
    const q = prims[qk];
    const shifted = lerp(p.b, q.a, 0.5);
    const tangent = dot(tangentAt(segs[pk], 1), tangentAt(segs[qk], 0)) > 1 - 1e-6;
    pts.push(tangent ? shifted : meet(p, q, shifted) || shifted);
  }
  const b = [];
  for (let k = 0; k < n; k += 1) {
    const p = prims[k];
    const a = pts[k];
    const e = pts[(k + 1) % pts.length];
    if (p.line) {
      if (dot(sub(e, a), p.d) <= 1e-6) return { error: "Too far: an edge would turn inside out" };
      b.push(0);
      continue;
    }
    const angA = Math.atan2(a[1] - p.c[1], a[0] - p.c[0]);
    const angB = Math.atan2(e[1] - p.c[1], e[0] - p.c[0]);
    let sweep = p.sweep > 0 ? wrap(angB - angA) : -wrap(angA - angB);
    // A full half-circle (a circle's two arcs) keeps its size; 0 would mean it vanished.
    if (Math.abs(sweep) < 1e-6) sweep = p.sweep;
    b.push(Math.tan(sweep / 4));
  }
  const out = clean({ closed: item.closed, pts: pts.map(rp), b });
  const problem = itemProblem(out);
  if (problem) return { error: `The offset ${problem}` };
  return { item: out };
}

/** Reflected across the line p → q; arcs turn the other way. */
export function mirrorItem(item, p, q) {
  const d = unit(sub(q, p));
  const pts = item.pts.map((pt) => {
    const v = sub(pt, p);
    const along = mul(d, dot(v, d) * 2);
    return rp(addv(p, sub(along, v)));
  });
  return { closed: item.closed, pts, b: item.b.map((x) => -x) };
}
