// Measure: distances and angles between points and faces.
// Pure numbers. The command (renderer/measureTool.js) picks and draws.
// Nothing here is stored. A face is an infinite plane: the distance runs along
// the normal, not across the shortest gap between two finite patches.
import { planeAxes } from "./boardModel.js";

const PARALLEL = 0.999; // about 2.6°: closer than this, the faces are parallel
const MIN_LINE_MM = 0.5;
export const MEASURE_LIMIT = 12;

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function unit(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  if (l < 1e-9) return [0, 0, 1];
  return [v[0] / l, v[1] / l, v[2] / l];
}

function xyz(p) {
  if (!p) return [0, 0, 0];
  if (Array.isArray(p)) return p;
  return [p.x, p.y, p.z];
}

export function fmtMm(v) {
  const r = Math.round(v * 10) / 10;
  if (!Number.isFinite(r)) return "—";
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function parallel(n1, n2) {
  return Math.abs(dot(unit(n1), unit(n2))) >= PARALLEL;
}

/** Angle between two planes, in degrees. 0 is parallel, 90 is square. */
export function planeAngle(n1, n2) {
  const c = Math.min(1, Math.max(-1, Math.abs(dot(unit(n1), unit(n2)))));
  return (Math.acos(c) * 180) / Math.PI;
}

function sub3(a, b) {
  return [a.x - b.x, a.y - b.y, a.z - b.z];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

/** Straight length, or the arc length when `bulge` is tan(sweep / 4). Not the chord. */
export function segmentLength(ax, ay, bx, by, bulge) {
  const chord = Math.hypot(bx - ax, by - ay);
  if (!bulge || Math.abs(bulge) < 1e-9) return chord;
  const sweep = 4 * Math.atan(bulge);
  const s = Math.sin(sweep / 2);
  if (Math.abs(s) < 1e-6) return chord;
  return Math.abs((chord / (2 * s)) * sweep);
}

function edgeSamples(edge) {
  return edge.samples && edge.samples.length > 1 ? edge.samples : [edge.a, edge.b];
}

/** Closest point on an edge (the arc samples, or the straight chord) and the distance. */
export function closestOnEdge(edge, p) {
  const samples = edgeSamples(edge);
  let best = samples[0];
  let bestD = Infinity;
  for (let i = 1; i < samples.length; i += 1) {
    const a = samples[i - 1];
    const b = samples[i];
    const ab = sub3(b, a);
    const l2 = dot(ab, ab) || 1;
    let t = dot(sub3(p, a), ab) / l2;
    t = Math.max(0, Math.min(1, t));
    const q = { x: a.x + ab[0] * t, y: a.y + ab[1] * t, z: a.z + ab[2] * t };
    const d = Math.hypot(q.x - p.x, q.y - p.y, q.z - p.z);
    if (d < bestD) { bestD = d; best = q; }
  }
  return { point: best, distance: bestD };
}

function edgeDir(edge) {
  return unit(sub3(edge.b, edge.a));
}

function faceGap(face, p) {
  const n = unit(face.normal);
  const o = xyz(face.point);
  return { n, gap: dot(n, [p.x - o[0], p.y - o[1], p.z - o[2]]) };
}

/**
 * Distance or angle between two picks.
 * `point` is `{ kind, x, y, z }`.
 * `face` is `{ kind, point, normal, at }`. The plane is infinite.
 * `edge` is `{ kind, a, b, samples, length }`. `length` is the arc length when the edge is a fillet.
 */
export function measureBetween(a, b) {
  if (!a || !b) return null;
  if (a.kind === "point" && b.kind === "point") {
    const d = [b.x - a.x, b.y - a.y, b.z - a.z];
    return { kind: "point-point", distance: Math.hypot(d[0], d[1], d[2]), delta: d, angle: null };
  }
  if (a.kind === "edge" && b.kind === "edge") {
    const d1 = edgeDir(a);
    const d2 = edgeDir(b);
    if (parallel(d1, d2)) {
      const gap = Math.hypot(...cross(d1, sub3(b.a, a.a)));
      return { kind: "edge-edge", distance: gap, delta: null, angle: null };
    }
    return { kind: "angle", distance: null, delta: null, angle: planeAngle(d1, d2), between: "edges" };
  }
  if (a.kind === "edge" && b.kind === "point" || b.kind === "edge" && a.kind === "point") {
    const edge = a.kind === "edge" ? a : b;
    const pt = a.kind === "point" ? a : b;
    const hit = closestOnEdge(edge, pt);
    return { kind: "edge-point", distance: hit.distance, delta: null, angle: null, foot: hit.point };
  }
  if (a.kind === "edge" && b.kind === "face" || b.kind === "edge" && a.kind === "face") {
    const edge = a.kind === "edge" ? a : b;
    const face = a.kind === "face" ? a : b;
    const dir = edgeDir(edge);
    const n = unit(face.normal);
    if (Math.abs(dot(dir, n)) < 0.03) {
      return { kind: "edge-face", distance: Math.abs(faceGap(face, edge.a).gap), delta: null, angle: null };
    }
    return { kind: "angle", distance: null, delta: null, angle: (Math.asin(Math.min(1, Math.abs(dot(dir, n)))) * 180) / Math.PI, between: "edge-face" };
  }
  if (a.kind === "face" && b.kind === "face") {
    if (parallel(a.normal, b.normal)) {
      const n = unit(a.normal);
      const gap = Math.abs(dot(n, [b.point[0] - a.point[0], b.point[1] - a.point[1], b.point[2] - a.point[2]]));
      return { kind: "face-face", distance: gap, delta: null, angle: null };
    }
    return { kind: "angle", distance: null, delta: null, angle: planeAngle(a.normal, b.normal), between: "faces" };
  }
  const face = a.kind === "face" ? a : b;
  const pt = a.kind === "point" ? a : b;
  if (!face || face.kind !== "face" || !pt || pt.kind !== "point") return null;
  return { kind: "point-face", distance: Math.abs(faceGap(face, pt).gap), delta: null, angle: null };
}

/** The world point a pick names: the point, the edge midpoint, or the click on a face. */
export function pickPoint(p) {
  if (!p) return null;
  if (p.kind === "point") return { x: p.x, y: p.y, z: p.z };
  if (p.kind === "edge") return p.at || p.a;
  if (p.at) return { x: p.at.x, y: p.at.y, z: p.at.z };
  return null;
}

function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 };
}

/**
 * Where to draw the dimension. `line` is the two ends, or null when there is
 * nothing to draw (an angle, or a gap under half a millimetre). `at` is the
 * label position.
 */
export function measureEnds(a, b, result) {
  if (!result || result.kind === "angle") return null;
  if (result.kind === "point-point") return [pickPoint(a), pickPoint(b)];
  if (result.kind === "edge-point") {
    const edge = a.kind === "edge" ? a : b;
    const pt = a.kind === "point" ? a : b;
    return [pt, result.foot || closestOnEdge(edge, pt).point];
  }
  if (result.kind === "edge-edge") {
    const q = closestOnEdge(b, a.at || a.a).point;
    return [a.at || a.a, q];
  }
  if (result.kind === "edge-face") {
    const edge = a.kind === "edge" ? a : b;
    const face = a.kind === "face" ? a : b;
    const from = edge.at || edge.a;
    const { n, gap } = faceGap(face, from);
    return [from, { x: from.x - n[0] * gap, y: from.y - n[1] * gap, z: from.z - n[2] * gap }];
  }
  if (result.kind === "point-face") {
    const pt = a.kind === "point" ? a : b;
    const face = a.kind === "face" ? a : b;
    const { n, gap } = faceGap(face, pt);
    return [pt, { x: pt.x - n[0] * gap, y: pt.y - n[1] * gap, z: pt.z - n[2] * gap }];
  }
  const n = unit(a.normal);
  const d = dot(n, [b.point[0] - a.point[0], b.point[1] - a.point[1], b.point[2] - a.point[2]]);
  const s = a.at;
  return [s, { x: s.x + n[0] * d, y: s.y + n[1] * d, z: s.z + n[2] * d }];
}

export function measureSummary(result) {
  if (!result) return { title: "", detail: "" };
  if (result.kind === "point-point") {
    const [dx, dy, dz] = result.delta;
    return {
      title: `${fmtMm(result.distance)} mm`,
      detail: `ΔX ${fmtMm(dx)}   ΔY ${fmtMm(dy)}   ΔZ ${fmtMm(dz)}`,
    };
  }
  if (result.kind === "angle") {
    const detail = result.between === "edges" ? "Between the two edges"
      : result.between === "edge-face" ? "Between the edge and the face"
        : "Between the two faces";
    return { title: `${fmtMm(result.angle)}°`, detail };
  }
  if (result.kind === "face-face") return { title: `${fmtMm(result.distance)} mm`, detail: "Parallel, along the normal" };
  if (result.kind === "edge-edge") return { title: `${fmtMm(result.distance)} mm`, detail: "Parallel edges" };
  if (result.kind === "edge-face") return { title: `${fmtMm(result.distance)} mm`, detail: "Edge parallel to the face" };
  if (result.kind === "edge-point") return { title: `${fmtMm(result.distance)} mm`, detail: "To the edge" };
  return { title: `${fmtMm(result.distance)} mm`, detail: "Perpendicular to the face" };
}

/** Label text plus the dimension line for one pair. */
export function measureMark(a, b, result) {
  const summary = measureSummary(result);
  const ends = measureEnds(a, b, result);
  let at = null;
  let line = null;
  if (ends && ends[0] && ends[1]) {
    const d = Math.hypot(ends[1].x - ends[0].x, ends[1].y - ends[0].y, ends[1].z - ends[0].z);
    at = mid(ends[0], ends[1]);
    if (d >= MIN_LINE_MM) line = ends;
  } else {
    const p = pickPoint(a);
    const q = pickPoint(b);
    if (p && q) at = mid(p, q);
  }
  return { text: summary.title, detail: summary.detail, at, line };
}

/** Overall size of one board: the two in-plane spans, then the thickness. */
export function boardSize(board) {
  if (!board) return null;
  const [uAxis, vAxis, tAxis] = planeAxes(board.profilePlane);
  const span = (k) => Math.abs(Number(board[`${k}1`]) - Number(board[`${k}0`]));
  return { u: span(uAxis), v: span(vAxis), thickness: span(tAxis), stock: board.stock?.kind || null };
}

export function boardSummary(size) {
  if (!size || !Number.isFinite(size.u) || !Number.isFinite(size.v) || !Number.isFinite(size.thickness)) return "";
  const stock = size.stock ? ` · ${size.stock}` : "";
  return `${fmtMm(size.u)} × ${fmtMm(size.v)} mm, ${fmtMm(size.thickness)} thick${stock}`;
}

export function emptyMeasure() {
  return { anchor: null, segments: [] };
}

/**
 * One click. Shift, with a finished chain and no anchor waiting, continues
 * from the last point. A plain click after a finished chain starts again.
 * Returns a new state; `state` is left as it was.
 */
export function measureClick(state, hit, { shift = false, limit = MEASURE_LIMIT } = {}) {
  const events = [];
  if (!hit) return { state, events };
  let anchor = state.anchor;
  let segments = state.segments;
  let chained = false;
  if (!anchor && segments.length) {
    if (shift) {
      anchor = segments[segments.length - 1].b;
      chained = true;
    } else {
      events.push({ kind: "clear", how: "next", count: segments.length });
      segments = [];
    }
  }
  if (!anchor) {
    events.push({ kind: "pick", which: "anchor", pick: hit });
    return { state: { anchor: hit, segments }, events };
  }
  if (segments.length >= limit) {
    events.push({ kind: "blocked", reason: "too many" });
    return { state, events };
  }
  const result = measureBetween(anchor, hit);
  events.push({ kind: "pick", which: "target", pick: hit });
  events.push({ kind: "result", result, a: anchor, b: hit, chain: chained });
  return { state: { anchor: null, segments: segments.concat([{ a: anchor, b: hit, result }]) }, events };
}

/** The pair the cursor would add, or null when a click would only set an anchor. */
export function measurePreview(state, hit, { shift = false, limit = MEASURE_LIMIT } = {}) {
  if (!hit || !state) return null;
  let anchor = state.anchor;
  if (!anchor && shift && state.segments.length) {
    if (state.segments.length >= limit) return null;
    anchor = state.segments[state.segments.length - 1].b;
  }
  if (!anchor) return null;
  return { a: anchor, b: hit, result: measureBetween(anchor, hit) };
}

/** A pick as it goes into the usage log. Nested, so its `kind` is not the event kind. */
export function measureLogPick(p) {
  const r = (v) => Math.round(v * 10) / 10;
  const o = { kind: p.kind, label: p.label };
  if (p.cabId) o.cabId = p.cabId;
  if (p.boardId) o.boardId = p.boardId;
  if (p.faceId) o.faceId = p.faceId;
  if (p.kind === "point") {
    o.x = r(p.x);
    o.y = r(p.y);
    o.z = r(p.z);
  } else if (p.kind === "edge") {
    o.length = r(p.length);
    o.x = r(p.a.x);
    o.y = r(p.a.y);
    o.z = r(p.a.z);
  } else {
    o.x = r(p.at.x);
    o.y = r(p.at.y);
    o.z = r(p.at.z);
    o.normal = p.normal.map(r);
  }
  return o;
}

/** `pair` is the measurement. Top-level `kind` is reserved for the event name. */
export function measureLogResult(result) {
  const r = (v) => Math.round(v * 10) / 10;
  const o = { pair: result.kind };
  if (result.distance != null) o.distance = r(result.distance);
  if (result.delta) o.delta = result.delta.map(r);
  if (result.kind === "angle") o.angle = r(result.angle);
  return o;
}
