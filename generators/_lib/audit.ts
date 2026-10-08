/**
 * Geometry audit: checks a generator result the way a shop would before cutting.
 *
 * Every board is rebuilt as an exact solid in the cabinet frame — its outline
 * extruded through the thickness, minus through cut-outs and minus each groove /
 * blind hole down to its depth — and then:
 *
 *   overlap      two boards share material (a tongue with no groove, two panels
 *                passing through each other, a strip running into a side)
 *   empty-groove a groove or slot cut `for` a board that never enters it
 *   outline      a self-crossing or spiky outline, zero-length edges, tiny
 *                slanted edges where a notch should be square
 *   feature      a groove / hole outside the board, sitting in a notch, deeper
 *                than the board, or breaking out of an edge
 *   size         a board bigger than the sheet
 *   stock        thickness on the box ≠ the stock it is cut from
 *   band         an edge band on a face that is not an edge
 *   model        duplicate ids, empty boxes, plane / thickness axis mismatch
 *
 * plus the checks the generators already run (`milling`, `grain`, validation),
 * collected so one list shows everything.
 *
 * A tongue in its groove does not overlap: the groove is cut out of the
 * receiving board, so correct joinery has zero shared volume. Boards that only
 * touch (two V boards back to back at a split) share no volume either.
 *
 * Pure: no generator imports. `auditResult(result)` → findings.
 */
import polygonClipping from "polygon-clipping/dist/polygon-clipping.esm.js";
import type { MultiPolygon, Polygon, Ring } from "polygon-clipping";

const { difference, intersection } = polygonClipping;

type Pt2 = [number, number];
type Axis = "x" | "y" | "z";

export type Severity = "error" | "warn" | "info";
export interface Finding {
  check: string;
  severity: Severity;
  boards: string[];
  message: string;
  /** Cabinet-frame box of the problem, when it has a place. */
  at?: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  /** Numbers behind the message (volume, depth, size …). */
  data?: Record<string, unknown>;
}

interface BoardLike {
  id: string;
  name?: string;
  category?: string;
  profilePlane?: string;
  thicknessAxis?: string;
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
  materialThickness?: number;
  stock?: { kind?: string; thickness?: number; sides?: number };
  profileVector?: Array<Record<string, number>>;
  profileHoles?: Array<Array<Record<string, number>>>;
  cutProfileVector?: Array<{ y: number; z: number }>;
  slabs?: Array<{ outline: Array<Record<string, number>>; holes?: Array<Array<Record<string, number>>>; z0: number; z1: number }>;
  faces?: Array<{ id: string; features?: FeatureLike[]; finish?: { edgeBand?: unknown } }>;
  tessellated?: boolean;
  [k: string]: unknown;
}

interface FeatureLike {
  id?: string;
  kind?: string;
  u0?: number; u1?: number; v0?: number; v1?: number;
  center?: [number, number];
  diameter?: number;
  radius?: number;
  loop?: [number, number][];
  depth?: number;
  through?: boolean;
  for?: string;
}

interface ResultLike {
  boards?: BoardLike[];
  validation?: { errors?: unknown[]; warnings?: unknown[] };
  milling?: { issues?: Array<{ board?: string; message?: string; reason?: string }> };
  grain?: { issues?: Array<{ board?: string; message?: string }> } | unknown;
  [k: string]: unknown;
}

export interface AuditOptions {
  /** Overlap thinner than this (mm, smallest side of the shared box) is reported as a warning, not an error. */
  overlapErrorMm?: number;
  /** Shared volume below this (mm³) is ignored: arithmetic noise. */
  overlapMinVolume?: number;
  /** Raw sheet (mm). */
  sheet?: [number, number];
  /** Usable sheet after trimming the border (mm). */
  usable?: [number, number];
  /** Also run the generator's own checks (milling, grain, validation). */
  includeGeneratorChecks?: boolean;
}

const DEFAULTS: Required<AuditOptions> = {
  overlapErrorMm: 0.3,
  overlapMinVolume: 2,
  sheet: [2440, 1220],
  usable: [2400, 1200],
  includeGeneratorChecks: true,
};

// --- frames -------------------------------------------------------------------------------

const PLANE_AXES: Record<string, [Axis, Axis, Axis]> = {
  XY: ["x", "y", "z"],
  XZ: ["x", "z", "y"],
  YZ: ["y", "z", "x"],
};

function axesOf(b: BoardLike): [Axis, Axis, Axis] {
  return PLANE_AXES[b.profilePlane ?? "XY"] ?? PLANE_AXES.XY!;
}

const lo = (b: BoardLike, a: Axis) => b[`${a}0`] as number;
const hi = (b: BoardLike, a: Axis) => b[`${a}1`] as number;
const num = (p: Record<string, number>, k: string) => (typeof p[k] === "number" ? p[k]! : 0);

// --- 2D helpers ---------------------------------------------------------------------------

function signedArea(loop: Pt2[]): number {
  let s = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function openLoop(loop: Pt2[]): Pt2[] {
  const out = loop.slice();
  while (out.length > 2) {
    const f = out[0]!;
    const l = out[out.length - 1]!;
    if (Math.abs(f[0] - l[0]) < 1e-9 && Math.abs(f[1] - l[1]) < 1e-9) out.pop();
    else break;
  }
  return out;
}

function ring(loop: Pt2[]): Ring {
  const o = openLoop(loop);
  return [...o, o[0]!] as Ring;
}

function mpArea(mp: MultiPolygon): number {
  let s = 0;
  for (const poly of mp) {
    poly.forEach((r, i) => {
      const a = Math.abs(signedArea(openLoop(r as Pt2[])));
      s += i === 0 ? a : -a;
    });
  }
  return s;
}

function rectRing(u0: number, v0: number, u1: number, v1: number): Ring {
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1], [u0, v0]];
}

function circleRing(cu: number, cv: number, r: number): Ring {
  const n = r < 5 ? 16 : 48;
  const pts: Pt2[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (2 * Math.PI * i) / n;
    pts.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]);
  }
  return ring(pts);
}

function roundedRectRing(u0: number, v0: number, u1: number, v1: number, radius: number): Ring {
  const r = Math.max(0, Math.min(radius, (u1 - u0) / 2, (v1 - v0) / 2));
  if (r < 0.05) return rectRing(u0, v0, u1, v1);
  const pts: Pt2[] = [];
  const corner = (cu: number, cv: number, a0: number) => {
    for (let i = 0; i <= 8; i += 1) {
      const a = a0 + (Math.PI / 2) * (i / 8);
      pts.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]);
    }
  };
  corner(u1 - r, v0 + r, -Math.PI / 2);
  corner(u1 - r, v1 - r, 0);
  corner(u0 + r, v1 - r, Math.PI / 2);
  corner(u0 + r, v0 + r, Math.PI);
  return ring(pts);
}

function mpBounds(mp: MultiPolygon): [number, number, number, number] | null {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const poly of mp) for (const p of poly[0] ?? []) {
    a = Math.min(a, p[0]); b = Math.min(b, p[1]); c = Math.max(c, p[0]); d = Math.max(d, p[1]);
  }
  return Number.isFinite(a) ? [a, b, c, d] : null;
}

const safe = <T>(fn: () => T, fallback: T): T => {
  try { return fn(); } catch { return fallback; }
};

// --- board → solid ------------------------------------------------------------------------

/** The outline in absolute (u, v) — the same placement rules the 3D view and STEP export use. */
export function absOutline(b: BoardLike): Pt2[] | null {
  const [U, V] = axesOf(b);
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector : null;
  let pts: Pt2[] | null = null;
  if (b.profilePlane === "YZ") {
    if (pv) pts = pv.map((p) => [num(p, "y"), num(p, "z")]);
    else if (b.cutProfileVector && b.cutProfileVector.length >= 4) pts = b.cutProfileVector.map((p) => [b.y0 + p.y, b.z0 + p.z]);
  } else if (pv) {
    const du = lo(b, U) - Math.min(...pv.map((p) => num(p, U)));
    const dv = lo(b, V) - Math.min(...pv.map((p) => num(p, V)));
    pts = pv.map((p) => [num(p, U) + du, num(p, V) + dv]);
  }
  if (!pts) return null;
  const o = openLoop(pts);
  return o.length >= 3 ? o : null;
}

function boxOutline(b: BoardLike): Pt2[] {
  const [U, V] = axesOf(b);
  return [[lo(b, U), lo(b, V)], [hi(b, U), lo(b, V)], [hi(b, U), hi(b, V)], [lo(b, U), hi(b, V)]];
}

function profileHoleRings(b: BoardLike): Ring[] {
  if (!b.profileHoles || !b.profileVector || !b.profileVector.length) return [];
  const [U, V] = axesOf(b);
  const pv = b.profileVector;
  if (b.profilePlane === "YZ") return b.profileHoles.map((h) => ring(h.map((p) => [num(p, "y"), num(p, "z")])));
  const du = lo(b, U) - Math.min(...pv.map((p) => num(p, U)));
  const dv = lo(b, V) - Math.min(...pv.map((p) => num(p, V)));
  return b.profileHoles.map((h) => ring(h.map((p) => [num(p, U) + du, num(p, V) + dv])));
}

interface Pocket {
  feature: FeatureLike;
  face: "A" | "B";
  through: boolean;
  depth: number;
  shape: Polygon;
}

function featureShape(b: BoardLike, ft: FeatureLike): Polygon | null {
  const [U, V] = axesOf(b);
  const U0 = lo(b, U);
  const V0 = lo(b, V);
  if (ft.kind === "hole" && Array.isArray(ft.center) && (ft.diameter ?? 0) > 0) {
    return [circleRing(U0 + ft.center[0], V0 + ft.center[1], ft.diameter! / 2)];
  }
  if (ft.kind === "cutout" && Array.isArray(ft.loop) && ft.loop.length >= 3) {
    return [ring(ft.loop.map(([u, v]) => [U0 + u, V0 + v]))];
  }
  if ((ft.kind === "groove" || ft.kind === "tgroove" || ft.kind === "cutout" || ft.kind === "hole") &&
      [ft.u0, ft.u1, ft.v0, ft.v1].every((n) => Number.isFinite(n))) {
    const u0 = U0 + Math.min(ft.u0!, ft.u1!);
    const u1 = U0 + Math.max(ft.u0!, ft.u1!);
    const v0 = V0 + Math.min(ft.v0!, ft.v1!);
    const v1 = V0 + Math.max(ft.v0!, ft.v1!);
    if (u1 - u0 < 1e-6 || v1 - v0 < 1e-6) return null;
    const r = Number(ft.radius) || 0;
    return [r > 0.05 ? roundedRectRing(u0, v0, u1, v1, r) : rectRing(u0, v0, u1, v1)];
  }
  return null;
}

export function pocketsOf(b: BoardLike): Pocket[] {
  const [, , T] = axesOf(b);
  const thick = hi(b, T) - lo(b, T);
  const out: Pocket[] = [];
  for (const face of b.faces ?? []) {
    if (face.id !== "A" && face.id !== "B") continue;
    for (const ft of face.features ?? []) {
      if (!["groove", "tgroove", "hole", "cutout"].includes(String(ft.kind))) continue;
      const shape = featureShape(b, ft);
      if (!shape) continue;
      const through = !!ft.through || ft.kind === "cutout" || (ft.depth ?? 0) >= thick - 1e-6 || ft.depth == null;
      out.push({ feature: ft, face: face.id, through, depth: through ? thick : Math.max(0, ft.depth ?? 0), shape });
    }
  }
  return out;
}

export interface Slice { t0: number; t1: number; region: MultiPolygon }
export interface Solid {
  board: BoardLike;
  axes: [Axis, Axis, Axis];
  slices: Slice[];
  box: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
}

const Q = (n: number) => Math.round(n * 1e4) / 1e4;

/** Exact solid as stacked prisms along the thickness axis, cabinet frame. */
export function solidOf(b: BoardLike, opts: { pockets?: boolean } = {}): Solid {
  const axes = axesOf(b);
  const [, , T] = axes;
  const box = { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1 };
  const usePockets = opts.pockets !== false;

  if (b.slabs && b.slabs.length && b.profilePlane === "XY") {
    const pv = b.profileVector ?? [];
    const dx = pv.length ? b.x0 - Math.min(...pv.map((p) => num(p, "x"))) : 0;
    const dy = pv.length ? b.y0 - Math.min(...pv.map((p) => num(p, "y"))) : 0;
    const slices: Slice[] = [];
    for (const s of b.slabs) {
      const outer = ring(s.outline.map((p) => [num(p, "x") + dx, num(p, "y") + dy]));
      const holes = (s.holes ?? []).map((h) => ring(h.map((p) => [num(p, "x") + dx, num(p, "y") + dy])));
      const region = holes.length ? safe(() => difference([[outer]], ...holes.map((h) => [[h]] as MultiPolygon)), [[outer]]) : [[outer]] as MultiPolygon;
      if (s.z1 - s.z0 > 1e-6) slices.push({ t0: s.z0, t1: s.z1, region });
    }
    return { board: b, axes, slices: slices.sort((p, q) => p.t0 - q.t0), box };
  }

  const t0 = lo(b, T);
  const t1 = hi(b, T);
  const outline = absOutline(b) ?? boxOutline(b);
  let base: MultiPolygon = [[ring(outline)]];
  const holes = profileHoleRings(b);
  const pockets = usePockets ? pocketsOf(b) : [];
  const throughCuts = [...holes.map((h) => [h] as Polygon), ...pockets.filter((p) => p.through).map((p) => p.shape)];
  if (throughCuts.length) base = safe(() => difference(base, ...throughCuts.map((p) => [p] as MultiPolygon)), base);

  const blind = pockets.filter((p) => !p.through && p.depth > 1e-6);
  const stations = new Set<number>([Q(t0), Q(t1)]);
  for (const p of blind) {
    const z = Q(p.face === "A" ? t1 - p.depth : t0 + p.depth);
    if (z > t0 && z < t1) stations.add(z);
  }
  const st = [...stations].sort((a, c) => a - c);
  const slices: Slice[] = [];
  for (let i = 0; i < st.length - 1; i += 1) {
    const a = st[i]!;
    const c = st[i + 1]!;
    if (c - a < 1e-6) continue;
    const mid = (a + c) / 2;
    const cuts = blind.filter((p) => (p.face === "A" ? mid > t1 - p.depth : mid < t0 + p.depth));
    const region = cuts.length ? safe(() => difference(base, ...cuts.map((p) => [p.shape] as MultiPolygon)), base) : base;
    slices.push({ t0: a, t1: c, region });
  }
  return { board: b, axes, slices, box };
}

// --- solid ∩ solid ------------------------------------------------------------------------

/** Length of the line `coord[idx] = s` inside the region (even-odd over all rings). */
function crossLen(mp: MultiPolygon, idx: 0 | 1, s: number): [number, number, number] {
  const other = 1 - idx;
  const xs: number[] = [];
  for (const poly of mp) for (const r of poly) {
    for (let i = 0; i < r.length - 1; i += 1) {
      const a = r[i]!;
      const c = r[i + 1]!;
      const sa = a[idx]!;
      const sc = c[idx]!;
      if ((sa <= s && sc > s) || (sc <= s && sa > s)) {
        const t = (s - sa) / (sc - sa);
        xs.push(a[other]! + t * (c[other]! - a[other]!));
      }
    }
  }
  xs.sort((p, q) => p - q);
  let len = 0, mn = Infinity, mx = -Infinity;
  for (let i = 0; i + 1 < xs.length; i += 2) {
    len += xs[i + 1]! - xs[i]!;
    mn = Math.min(mn, xs[i]!);
    mx = Math.max(mx, xs[i + 1]!);
  }
  return [len, mn, mx];
}

function clipBand(mp: MultiPolygon, idx: 0 | 1, a: number, c: number): MultiPolygon {
  const big = 1e6;
  const band = idx === 0 ? rectRing(a, -big, c, big) : rectRing(-big, a, big, c);
  return safe(() => intersection(mp, [[band]]), []);
}

interface Overlap { volume: number; box: Finding["at"] }

function boxesMeet(p: Solid["box"], q: Solid["box"], eps: number): boolean {
  return p.x0 < q.x1 - eps && q.x0 < p.x1 - eps && p.y0 < q.y1 - eps && q.y0 < p.y1 - eps && p.z0 < q.z1 - eps && q.z0 < p.z1 - eps;
}

export function sharedVolume(P: Solid, R: Solid): Overlap {
  const [Pu, Pv, Pt] = P.axes;
  const [Ru, Rv, Rt] = R.axes;
  let volume = 0;
  const bb = { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity };
  const grow = (a: Axis, v0: number, v1: number) => {
    bb[`${a}0`] = Math.min(bb[`${a}0`], v0);
    bb[`${a}1`] = Math.max(bb[`${a}1`], v1);
  };

  if (Pt === Rt) {
    // Parallel boards in the same plane: area × shared thickness.
    for (const ps of P.slices) for (const rs of R.slices) {
      const t0 = Math.max(ps.t0, rs.t0);
      const t1 = Math.min(ps.t1, rs.t1);
      if (t1 - t0 <= 1e-6) continue;
      const shared = safe(() => intersection(ps.region, rs.region), []);
      const a = mpArea(shared);
      if (a <= 1e-6) continue;
      volume += a * (t1 - t0);
      const bnd = mpBounds(shared);
      if (bnd) { grow(Pu, bnd[0], bnd[2]); grow(Pv, bnd[1], bnd[3]); }
      grow(Pt, t0, t1);
    }
  } else {
    // Perpendicular: the axis neither board is thick along lies in both planes.
    const S = (["x", "y", "z"] as Axis[]).find((a) => a !== Pt && a !== Rt)!;
    const pS = (Pu === S ? 0 : 1) as 0 | 1; // P region: (S, Rt)
    const rS = (Ru === S ? 0 : 1) as 0 | 1; // R region: (S, Pt)
    void Pv; void Rv;
    for (const ps of P.slices) for (const rs of R.slices) {
      // P's region limited to R's thickness range (along Rt), R's limited to P's (along Pt).
      const pr = clipBand(ps.region, (1 - pS) as 0 | 1, rs.t0, rs.t1);
      if (!pr.length) continue;
      const rr = clipBand(rs.region, (1 - rS) as 0 | 1, ps.t0, ps.t1);
      if (!rr.length) continue;
      const pb = mpBounds(pr)!;
      const rb = mpBounds(rr)!;
      const s0 = Math.max(pS === 0 ? pb[0] : pb[1], rS === 0 ? rb[0] : rb[1]);
      const s1 = Math.min(pS === 0 ? pb[2] : pb[3], rS === 0 ? rb[2] : rb[3]);
      if (s1 - s0 <= 1e-6) continue;
      const brk = new Set<number>([s0, s1]);
      for (const [mp, i] of [[pr, pS], [rr, rS]] as Array<[MultiPolygon, 0 | 1]>) {
        for (const poly of mp) for (const r of poly) for (const p of r) {
          const s = p[i]!;
          if (s > s0 && s < s1) brk.add(s);
        }
      }
      const bs = [...brk].sort((a, c) => a - c);
      for (let i = 0; i < bs.length - 1; i += 1) {
        const a = bs[i]!;
        const c = bs[i + 1]!;
        const w = c - a;
        if (w <= 1e-9) continue;
        const e = Math.min(1e-7, w / 10);
        const f = (s: number) => {
          const [lp, pmn, pmx] = crossLen(pr, pS, s);
          const [lr, rmn, rmx] = crossLen(rr, rS, s);
          return { v: lp * lr, pmn, pmx, rmn, rmx };
        };
        const fa = f(a + e);
        const fm = f((a + c) / 2);
        const fc = f(c - e);
        const seg = (w / 6) * (fa.v + 4 * fm.v + fc.v);
        if (seg <= 1e-9) continue;
        volume += seg;
        grow(S, a, c);
        for (const k of [fa, fm, fc]) {
          if (k.v <= 0) continue;
          grow(Rt, k.pmn, k.pmx);
          grow(Pt, k.rmn, k.rmx);
        }
      }
    }
  }
  return { volume, box: Number.isFinite(bb.x0) ? bb : undefined };
}

// --- checks -------------------------------------------------------------------------------

function idsOf(r: ResultLike): BoardLike[] {
  return (r.boards ?? []).filter((b) => b && typeof b.id === "string");
}

function thicknessOf(b: BoardLike): number {
  const [, , T] = axesOf(b);
  return hi(b, T) - lo(b, T);
}

function checkModel(boards: BoardLike[], out: Finding[]) {
  const seen = new Map<string, number>();
  for (const b of boards) seen.set(b.id, (seen.get(b.id) ?? 0) + 1);
  for (const [id, n] of seen) if (n > 1) out.push({ check: "model", severity: "error", boards: [id], message: `${n} boards share the id ${id}` });
  const AX: Record<string, string> = { XY: "Z", XZ: "Y", YZ: "X" };
  for (const b of boards) {
    for (const a of ["x", "y", "z"] as Axis[]) {
      if (!(hi(b, a) - lo(b, a) > 0)) out.push({ check: "model", severity: "error", boards: [b.id], message: `${b.id} has an empty box along ${a.toUpperCase()} (${lo(b, a)} → ${hi(b, a)})` });
    }
    if (b.profilePlane && b.thicknessAxis && AX[b.profilePlane] !== b.thicknessAxis) {
      out.push({ check: "model", severity: "warn", boards: [b.id], message: `${b.id}: plane ${b.profilePlane} with thickness along ${b.thicknessAxis}` });
    }
  }
}

function checkStock(b: BoardLike, out: Finding[]) {
  const t = thicknessOf(b);
  const want = b.slabs?.length ? null : (b.stock?.thickness ?? b.materialThickness);
  if (typeof want === "number" && want > 0 && Math.abs(t - want) > 0.05) {
    out.push({
      check: "stock", severity: "warn", boards: [b.id],
      message: `${b.id} is ${+t.toFixed(2)} thick on the box but cut from ${want} stock`,
      data: { box: t, stock: want },
    });
  }
}

function checkSize(b: BoardLike, o: Required<AuditOptions>, out: Finding[]) {
  const [U, V] = axesOf(b);
  const outline = absOutline(b) ?? boxOutline(b);
  const us = outline.map((p) => p[0]);
  const vs = outline.map((p) => p[1]);
  const du = Math.max(...us) - Math.min(...us);
  const dv = Math.max(...vs) - Math.min(...vs);
  const [L, S] = du >= dv ? [du, dv] : [dv, du];
  const fits = (lim: [number, number]) => L <= lim[0] + 1e-6 && S <= lim[1] + 1e-6;
  if (!fits(o.sheet)) {
    out.push({ check: "size", severity: "error", boards: [b.id], message: `${b.id} is ${+L.toFixed(1)} × ${+S.toFixed(1)}: bigger than a ${o.sheet[0]} × ${o.sheet[1]} sheet`, data: { L, S } });
  } else if (!fits(o.usable)) {
    out.push({ check: "size", severity: "warn", boards: [b.id], message: `${b.id} is ${+L.toFixed(1)} × ${+S.toFixed(1)}: past the ${o.usable[0]} × ${o.usable[1]} usable sheet`, data: { L, S } });
  }
  void U; void V;
}

function segCross(a: Pt2, b: Pt2, c: Pt2, d: Pt2): boolean {
  const o = (p: Pt2, q: Pt2, r: Pt2) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(c, d, a), d2 = o(c, d, b), d3 = o(a, b, c), d4 = o(a, b, d);
  const E = 1e-9;
  return ((d1 > E && d2 < -E) || (d1 < -E && d2 > E)) && ((d3 > E && d4 < -E) || (d3 < -E && d4 > E));
}

function checkOutline(b: BoardLike, out: Finding[]) {
  const pts = absOutline(b);
  if (!pts) return;
  const n = pts.length;
  const [U, V] = axesOf(b);
  const bad: string[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = pts[i]!;
    const c = pts[(i + 1) % n]!;
    const len = Math.hypot(c[0] - a[0], c[1] - a[1]);
    if (len < 0.01) { bad.push(`zero-length edge ${i}`); continue; }
    const slanted = Math.abs(c[0] - a[0]) > 0.01 && Math.abs(c[1] - a[1]) > 0.01;
    // Runs of short chords are an arc drawn as segments (a rounded corner); one short slanted edge on its own is a squashed notch.
    const shortSlant = (k: number) => {
      const p0 = pts[(k + n) % n]!;
      const p1 = pts[(k + 1 + n) % n]!;
      return Math.abs(p1[0] - p0[0]) > 0.01 && Math.abs(p1[1] - p0[1]) > 0.01 && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 3;
    };
    const inArc = shortSlant(i - 1) || shortSlant(i + 1);
    if (slanted && len < 3 && !b.tessellated && !inArc) bad.push(`short slanted edge ${i} (${len.toFixed(2)} mm) at ${U}=${a[0].toFixed(1)} ${V}=${a[1].toFixed(1)}`);
    const p = pts[(i + n - 1) % n]!;
    const v1: Pt2 = [a[0] - p[0], a[1] - p[1]];
    const v2: Pt2 = [c[0] - a[0], c[1] - a[1]];
    const l1 = Math.hypot(...v1);
    if (l1 > 0.01) {
      const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * len);
      if (cos < -0.996) bad.push(`spike at point ${i} (${U}=${a[0].toFixed(1)} ${V}=${a[1].toFixed(1)})`);
    }
  }
  if (n <= 400) {
    outer: for (let i = 0; i < n; i += 1) for (let j = i + 2; j < n; j += 1) {
      if (i === 0 && j === n - 1) continue;
      if (segCross(pts[i]!, pts[(i + 1) % n]!, pts[j]!, pts[(j + 1) % n]!)) { bad.push(`edges ${i} and ${j} cross`); break outer; }
    }
  }
  if (Math.abs(signedArea(pts)) < 1) bad.push("outline has no area");
  // Outline vs box: XY / XZ outlines are moved so their minimum meets the box; their size should match it too.
  // A board-local cut profile (YZ `cutProfileVector`) may leave the box on purpose: a tongue below v = 0.
  if (!b.profileVector && b.cutProfileVector) {
    if (bad.length) out.push({ check: "outline", severity: bad.some((s) => s.includes("cross") || s.includes("no area")) ? "error" : "warn", boards: [b.id], message: `${b.id}: ${bad.slice(0, 4).join("; ")}${bad.length > 4 ? ` (+${bad.length - 4} more)` : ""}` });
    return;
  }
  const us = pts.map((p) => p[0]);
  const vs = pts.map((p) => p[1]);
  const du = Math.max(...us) - Math.min(...us) - (hi(b, U) - lo(b, U));
  const dv = Math.max(...vs) - Math.min(...vs) - (hi(b, V) - lo(b, V));
  if (Math.abs(du) > 0.5 || Math.abs(dv) > 0.5) {
    out.push({
      check: "outline", severity: "warn", boards: [b.id],
      message: `${b.id}: outline is ${du > 0 ? "+" : ""}${du.toFixed(1)} along ${U.toUpperCase()}, ${dv > 0 ? "+" : ""}${dv.toFixed(1)} along ${V.toUpperCase()} against its box`,
      data: { du, dv },
    });
  }
  if (bad.length) {
    const severe = bad.some((s) => s.includes("cross") || s.includes("no area"));
    out.push({ check: "outline", severity: severe ? "error" : "warn", boards: [b.id], message: `${b.id}: ${bad.slice(0, 4).join("; ")}${bad.length > 4 ? ` (+${bad.length - 4} more)` : ""}` });
  }
}

function checkFeatures(b: BoardLike, out: Finding[]) {
  const [U, V, T] = axesOf(b);
  const thick = hi(b, T) - lo(b, T);
  const outline = absOutline(b) ?? boxOutline(b);
  const body: MultiPolygon = [[ring(outline)]];
  for (const p of pocketsOf(b)) {
    const ft = p.feature;
    const name = `${b.id}.${p.face}.${ft.id ?? ft.kind}`;
    if (!p.through && ft.depth != null && ft.depth <= 0) {
      out.push({ check: "feature", severity: "error", boards: [b.id], message: `${name}: depth ${ft.depth}` });
      continue;
    }
    if (!p.through && ft.kind !== "hole" && ft.depth != null && ft.depth > thick - 0.5 && ft.depth < thick) {
      out.push({ check: "feature", severity: "warn", boards: [b.id], message: `${name}: ${ft.depth} deep in a ${+thick.toFixed(2)} board leaves ${+(thick - ft.depth).toFixed(2)} mm` });
    }
    const a = mpArea([p.shape]);
    if (a <= 0) continue;
    const inside = mpArea(safe(() => intersection([p.shape], body), [[p.shape]]));
    const offFrac = 1 - inside / a;
    if (offFrac > 0.999) {
      out.push({ check: "feature", severity: "error", boards: [b.id], message: `${name} is entirely off the board`, data: { feature: ft } });
    } else if (offFrac > 0.002) {
      // Grooves and LED channels may run out through an edge on purpose (an open-ended slot).
      // A blind hole breaking out, or a groove sitting in a notch, is not.
      const ends = mpBounds([p.shape])!;
      const ob = [Math.min(...outline.map((q) => q[0])), Math.min(...outline.map((q) => q[1])), Math.max(...outline.map((q) => q[0])), Math.max(...outline.map((q) => q[1]))];
      const pastBox = ends[0] < ob[0]! - 0.01 || ends[1] < ob[1]! - 0.01 || ends[2] > ob[2]! + 0.01 || ends[3] > ob[3]! + 0.01;
      const kind = ft.kind === "hole" && !p.through ? "breaks out of the edge" : pastBox ? "runs past the board" : "runs into a notch / cut-away part of the outline";
      const sev: Severity = ft.kind === "hole" || !pastBox ? "warn" : "info";
      out.push({
        check: "feature", severity: sev, boards: [b.id],
        message: `${name}: ${(offFrac * 100).toFixed(1)}% ${kind}`,
        at: { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0, [`${U}0`]: ends[0], [`${U}1`]: ends[2], [`${V}0`]: ends[1], [`${V}1`]: ends[3], [`${T}0`]: lo(b, T), [`${T}1`]: hi(b, T) } as Finding["at"],
      });
    }
  }
}

function checkBands(b: BoardLike, out: Finding[]) {
  const n = (absOutline(b) ?? boxOutline(b)).length;
  for (const f of b.faces ?? []) {
    if (!f.finish?.edgeBand) continue;
    if (f.id === "A" || f.id === "B") {
      out.push({ check: "band", severity: "error", boards: [b.id], message: `${b.id}.${f.id}: edge band on a big face` });
      continue;
    }
    const i = Number(String(f.id).slice(1));
    if (!(i >= 0 && i < n)) out.push({ check: "band", severity: "error", boards: [b.id], message: `${b.id}.${f.id}: banded edge not on the outline (${n} edges)` });
  }
}

function round(n: number, d = 2) { return Math.round(n * 10 ** d) / 10 ** d; }

function checkOverlaps(solids: Solid[], o: Required<AuditOptions>, out: Finding[]) {
  for (let i = 0; i < solids.length; i += 1) for (let j = i + 1; j < solids.length; j += 1) {
    const P = solids[i]!;
    const R = solids[j]!;
    if (!boxesMeet(P.box, R.box, 1e-6)) continue;
    const { volume, box } = sharedVolume(P, R);
    if (volume < o.overlapMinVolume || !box) continue;
    const dims = [box.x1 - box.x0, box.y1 - box.y0, box.z1 - box.z0];
    const depth = Math.min(...dims);
    const sev: Severity = depth >= o.overlapErrorMm ? "error" : "warn";
    out.push({
      check: "overlap", severity: sev, boards: [P.board.id, R.board.id],
      message: `${P.board.id} and ${R.board.id} share ${round(volume, 0)} mm³, ${round(dims[0]!, 1)} × ${round(dims[1]!, 1)} × ${round(dims[2]!, 1)} (x × y × z)`,
      at: box, data: { volume, depth },
    });
  }
}

function checkEmptyGrooves(boards: BoardLike[], solids: Map<string, Solid>, out: Finding[]) {
  for (const b of boards) {
    const [, , T] = axesOf(b);
    const t0 = lo(b, T);
    const t1 = hi(b, T);
    for (const p of pocketsOf(b)) {
      const target = p.feature.for;
      if (!target || !solids.has(target) || target === b.id) continue;
      // Holes are pilots, cups and screw clearances: the screw goes through them, the board it is "for" does not.
      if (p.feature.kind === "hole") continue;
      const pocketSolid: Solid = {
        board: { ...b, id: `${b.id}#${p.feature.id ?? "pocket"}` },
        axes: axesOf(b),
        slices: [{
          t0: p.through ? t0 : p.face === "A" ? t1 - p.depth : t0,
          t1: p.through ? t1 : p.face === "A" ? t1 : t0 + p.depth,
          region: [p.shape],
        }],
        box: { x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, z0: b.z0, z1: b.z1 },
      };
      const other = solids.get(target)!;
      if (!boxesMeet(pocketSolid.box, other.box, -0.5)) {
        out.push({ check: "empty-groove", severity: "warn", boards: [b.id, target], message: `${b.id}.${p.face}.${p.feature.id ?? p.feature.kind} is cut for ${target}, which is nowhere near it` });
        continue;
      }
      const { volume } = sharedVolume(pocketSolid, other);
      if (volume < 1) {
        out.push({ check: "empty-groove", severity: "warn", boards: [b.id, target], message: `${b.id}.${p.face}.${p.feature.id ?? p.feature.kind} is cut for ${target}, but ${target} does not enter it` });
      }
    }
  }
}

function generatorChecks(r: ResultLike, out: Finding[]) {
  for (const i of r.milling?.issues ?? []) {
    out.push({ check: "milling", severity: "error", boards: i.board ? [i.board] : [], message: i.message ?? String(i.reason) });
  }
  const g = r.grain as { issues?: Array<{ board?: string; message?: string }> } | undefined;
  for (const i of g?.issues ?? []) out.push({ check: "grain", severity: "warn", boards: i.board ? [i.board] : [], message: i.message ?? "grain" });
  for (const e of r.validation?.errors ?? []) out.push({ check: "validation", severity: "error", boards: [], message: typeof e === "string" ? e : JSON.stringify(e) });
  for (const w of r.validation?.warnings ?? []) out.push({ check: "validation", severity: "info", boards: [], message: typeof w === "string" ? w : JSON.stringify(w) });
}

export function auditResult(result: ResultLike, options: AuditOptions = {}): Finding[] {
  const o = { ...DEFAULTS, ...options };
  const out: Finding[] = [];
  const boards = idsOf(result);
  checkModel(boards, out);
  const solids: Solid[] = [];
  const byId = new Map<string, Solid>();
  for (const b of boards) {
    checkStock(b, out);
    checkSize(b, o, out);
    checkOutline(b, out);
    checkFeatures(b, out);
    checkBands(b, out);
    const s = safe(() => solidOf(b), null);
    if (!s) { out.push({ check: "model", severity: "error", boards: [b.id], message: `${b.id}: could not build a solid` }); continue; }
    solids.push(s);
    if (!byId.has(b.id)) byId.set(b.id, safe(() => solidOf(b, { pockets: false }), s));
  }
  checkOverlaps(solids, o, out);
  checkEmptyGrooves(boards, byId, out);
  if (o.includeGeneratorChecks) generatorChecks(result, out);
  const rank: Record<Severity, number> = { error: 0, warn: 1, info: 2 };
  return out.sort((a, c) => rank[a.severity] - rank[c.severity] || a.check.localeCompare(c.check));
}

/** Volume of one board's solid, for tests of the solid builder. */
export function solidVolume(s: Solid): number {
  return s.slices.reduce((a, sl) => a + mpArea(sl.region) * (sl.t1 - sl.t0), 0);
}
