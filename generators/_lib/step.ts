/**
 * STEP AP214 for Fusion. One solid per board, already moved into the space
 * (millimetres, Z up). The solid is the outline extruded through the thickness,
 * with the same cuts the 3D view draws: grooves, T-grooves / LED channels,
 * blind holes (hinge cups), through holes and lock slots. A board that carries
 * `slabs` (a rebated lid) is those slabs instead.
 *
 * Circles are many-sided so the file stays a closed shell of flat faces.
 * Red CNC checks do not belong here; the caller exports the boards it has.
 */
import type { Board } from "./model.ts";
import { expandBulgeRing, planeAxes } from "./model.ts";
import polygonClipping from "polygon-clipping/dist/polygon-clipping.esm.js";
import type { MultiPolygon, Polygon, Ring } from "polygon-clipping";

const { difference, union } = polygonClipping;

type Pt2 = [number, number];
type Vec = [number, number, number];
type Pose = { x?: number; y?: number; z?: number; rotX?: number; rotY?: number; rotZ?: number };

interface Region { outer: Pt2[]; holes: Pt2[] }
interface Slice { t0: number; t1: number; regions: Region[] }
export interface Face3 { loops: Vec[][] }

export interface StepCabinet {
  id: string;
  pose?: Pose;
  boards: Board[];
  overrides?: Record<string, Pose | undefined>;
}

export interface StepSkipped { cabinetId: string; boardId: string; reason: string }
export interface StepResult {
  ok: boolean;
  text: string;
  boardCount: number;
  skipped: StepSkipped[];
}

const Q = 1000;
const q = (n: number) => Math.round(n * Q) / Q;
const q2 = (p: Pt2): Pt2 => [q(p[0]), q(p[1])];
const q3 = (p: Vec): Vec => [q(p[0]), q(p[1]), q(p[2])];

function area(loop: Pt2[]): number {
  let s = 0;
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

function dedupe2(loop: Pt2[]): Pt2[] {
  const out: Pt2[] = [];
  for (const p of loop) {
    const v = q2(p);
    const prev = out[out.length - 1];
    if (prev && prev[0] === v[0] && prev[1] === v[1]) continue;
    out.push(v);
  }
  if (out.length > 1) {
    const a = out[0]!;
    const b = out[out.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) out.pop();
  }
  return out;
}

function ccw(loop: Pt2[]): Pt2[] {
  const d = dedupe2(loop);
  return area(d) < 0 ? d.slice().reverse() : d;
}
function cw(loop: Pt2[]): Pt2[] {
  const d = dedupe2(loop);
  return area(d) > 0 ? d.slice().reverse() : d;
}

function close(loop: Pt2[]): Ring {
  const d = dedupe2(loop);
  if (!d.length) return [];
  const a = d[0]!;
  const b = d[d.length - 1]!;
  if (a[0] !== b[0] || a[1] !== b[1]) d.push([a[0], a[1]]);
  return d;
}
function openRing(ring: Ring): Pt2[] {
  const d = dedupe2(ring.map((p) => [p[0], p[1]]));
  return d;
}

function pointIn(loop: Pt2[], u: number, v: number): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
    const ui = loop[i]![0];
    const vi = loop[i]![1];
    const uj = loop[j]![0];
    const vj = loop[j]![1];
    if ((vi > v) !== (vj > v) && u < ((uj - ui) * (v - vi)) / ((vj - vi) || 1e-12) + ui) inside = !inside;
  }
  return inside;
}

function pointInRegion(r: Region, u: number, v: number): boolean {
  if (!pointIn(r.outer, u, v)) return false;
  return !r.holes.some((h) => pointIn(h, u, v));
}

function asMulti(regions: Region[]): MultiPolygon {
  const mp: MultiPolygon = [];
  for (const r of regions) {
    const outer = close(ccw(r.outer));
    if (outer.length < 4) continue;
    const holes = r.holes.map((h) => close(cw(h))).filter((h) => h.length >= 4);
    mp.push([outer, ...holes]);
  }
  return mp;
}

function fromMulti(mp: MultiPolygon): Region[] {
  const out: Region[] = [];
  for (const poly of mp) {
    if (!poly.length) continue;
    const outer = openRing(poly[0]!);
    if (Math.abs(area(outer)) < 0.5) continue;
    const holes = poly.slice(1).map(openRing).filter((h) => Math.abs(area(h)) >= 0.5);
    out.push({ outer: ccw(outer), holes: holes.map(cw) });
  }
  return out;
}

function diffRegions(a: Region[], b: Region[]): Region[] {
  const A = asMulti(a);
  const B = asMulti(b);
  if (!A.length) return [];
  if (!B.length) return fromMulti(A);
  return fromMulti(difference(A, B));
}

function unionDisks(loops: Pt2[][]): Pt2[][] {
  const geoms: Polygon[] = [];
  for (const loop of loops) {
    const ring = close(ccw(loop));
    if (ring.length >= 4) geoms.push([ring]);
  }
  if (!geoms.length) return [];
  const merged = geoms.length === 1 ? [geoms[0]!] : union(geoms[0]!, ...geoms.slice(1));
  return fromMulti(merged).map((r) => ccw(r.outer));
}

// --- outline (cabinet frame, same shifts as renderer/boardGeom.js) -----------------

function numOf(p: Record<string, number>, key: string): number {
  const v = p[key];
  return typeof v === "number" ? v : 0;
}

function profileRing(pv: Array<Record<string, number>>, u: string, v: string): Pt2[] {
  if (!pv.some((p) => Math.abs(Number(p.bulge) || 0) > 1e-9)) return pv.map((p) => [numOf(p, u), numOf(p, v)]);
  const raw = pv.map((p) => ({ u: numOf(p, u), v: numOf(p, v), b: Number(p.bulge) || 0 }));
  if (raw.length > 2) {
    const a = raw[0]!;
    const c = raw[raw.length - 1]!;
    if (Math.abs(a.u - c.u) < 1e-9 && Math.abs(a.v - c.v) < 1e-9) raw.pop();
  }
  return expandBulgeRing(raw).map((p) => [p.u, p.v]);
}

function boardOutline(b: Board): Pt2[] | null {
  const pv = b.profileVector && b.profileVector.length >= 4 ? b.profileVector as Array<Record<string, number>> : null;
  if (b.profilePlane === "YZ" && b.thicknessAxis === "X") {
    if (pv) return ccw(profileRing(pv, "y", "z"));
    if (b.cutProfileVector && b.cutProfileVector.length >= 4) {
      return ccw(b.cutProfileVector.map((p) => [b.y0 + p.y, b.z0 + p.z]));
    }
    return null;
  }
  if (b.profilePlane === "XY" && b.thicknessAxis === "Z" && pv) {
    const ring = profileRing(pv, "x", "y");
    const dx = b.x0 - Math.min(...ring.map((p) => p[0]));
    const dy = b.y0 - Math.min(...ring.map((p) => p[1]));
    return ccw(ring.map((p) => [p[0] + dx, p[1] + dy]));
  }
  if (b.profilePlane === "XZ" && b.thicknessAxis === "Y" && pv) {
    const ring = profileRing(pv, "x", "z");
    const dx = b.x0 - Math.min(...ring.map((p) => p[0]));
    const dz = b.z0 - Math.min(...ring.map((p) => p[1]));
    return ccw(ring.map((p) => [p[0] + dx, p[1] + dz]));
  }
  return null;
}

function profileHoles(b: Board): Pt2[][] {
  if (!b.profileHoles || b.profilePlane !== "XY" || b.thicknessAxis !== "Z" || !b.profileVector) return [];
  const pv = b.profileVector as Array<Record<string, number>>;
  const dx = b.x0 - Math.min(...pv.map((p) => numOf(p, "x")));
  const dy = b.y0 - Math.min(...pv.map((p) => numOf(p, "y")));
  return b.profileHoles.map((hole) => ccw((hole as Array<Record<string, number>>).map((p) => [numOf(p, "x") + dx, numOf(p, "y") + dy])));
}

function rectOutline(b: Board): Pt2[] {
  const [U, V] = planeAxes(b.profilePlane);
  const u0 = b[`${U}0`];
  const u1 = b[`${U}1`];
  const v0 = b[`${V}0`];
  const v1 = b[`${V}1`];
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

// --- pockets ---------------------------------------------------------------------------

interface Rect { u0: number; u1: number; v0: number; v1: number }
interface Cut {
  kind: "notch" | "hole" | "through";
  loop: Pt2[];
  depth: number;
  side: "A" | "B";
  rect?: Rect;
}

function circle(cu: number, cv: number, r: number, n: number): Pt2[] {
  const pts: Pt2[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (2 * Math.PI * i) / n;
    pts.push([cu + r * Math.cos(a), cv + r * Math.sin(a)]);
  }
  return pts;
}

function roundedRect(u0: number, v0: number, u1: number, v1: number, radius: number): Pt2[] {
  const r = Math.max(0, Math.min(radius, (u1 - u0) / 2, (v1 - v0) / 2));
  if (r < 0.05) return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
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
  return pts;
}

function collectCuts(b: Board): Cut[] {
  const [U, V, T] = planeAxes(b.profilePlane);
  const U0 = b[`${U}0`];
  const U1 = b[`${U}1`];
  const V0 = b[`${V}0`];
  const V1 = b[`${V}1`];
  const thick = b[`${T}1`] - b[`${T}0`];
  const cuts: Cut[] = [];
  for (const loop of profileHoles(b)) cuts.push({ kind: "through", loop, depth: thick, side: "A" });
  for (const face of b.faces || []) {
    if (face.id !== "A" && face.id !== "B") continue;
    const side = face.id;
    for (const ft of face.features || []) {
      if (ft.kind === "hole" && Array.isArray(ft.center) && (ft.diameter ?? 0) > 0.8) {
        const r = ft.diameter! / 2;
        const cu = U0 + ft.center[0];
        const cv = V0 + ft.center[1];
        if (cu - r < U0 + 0.4 || cu + r > U1 - 0.4 || cv - r < V0 + 0.4 || cv + r > V1 - 0.4) continue;
        const loop = circle(cu, cv, r, (ft.diameter ?? 0) < 10 ? 16 : 48);
        const through = !!ft.through || (ft.depth ?? 0) >= thick - 0.2;
        cuts.push({ kind: through ? "through" : "hole", loop, depth: Math.min(ft.depth ?? thick, thick - 0.6), side });
        continue;
      }
      if ((ft.kind === "groove" || ft.kind === "tgroove" || ft.kind === "cutout") && Number.isFinite(ft.u0) && Number.isFinite(ft.v0)) {
        if (ft.kind === "cutout" && Array.isArray(ft.loop) && ft.loop.length >= 3) {
          cuts.push({
            kind: "through",
            loop: ft.loop.map(([u, v]) => [U0 + u, V0 + v]),
            depth: thick,
            side,
          });
          continue;
        }
        let u0 = U0 + Math.min(ft.u0!, ft.u1!);
        let u1 = U0 + Math.max(ft.u0!, ft.u1!);
        let v0 = V0 + Math.min(ft.v0!, ft.v1!);
        let v1 = V0 + Math.max(ft.v0!, ft.v1!);
        if (u1 - u0 < 0.5 || v1 - v0 < 0.5) continue;
        const through = !!ft.through || ft.kind === "cutout" || (ft.depth ?? 0) >= thick - 0.2;
        const touches = u0 <= U0 + 0.3 || u1 >= U1 - 0.3 || v0 <= V0 + 0.3 || v1 >= V1 - 0.3;
        const breakPast = !through && touches ? (ft.for === "led" ? 2 : ft.for === "control_panel" ? 0.5 : 0) : 0;
        if (breakPast) {
          const past = breakPast;
          const rect = {
            u0: u0 <= U0 + 0.3 ? U0 - past : u0,
            u1: u1 >= U1 - 0.3 ? U1 + past : u1,
            v0: v0 <= V0 + 0.3 ? V0 - past : v0,
            v1: v1 >= V1 - 0.3 ? V1 + past : v1,
          };
          cuts.push({
            kind: "notch",
            loop: [[u0, v0], [u1, v0], [u1, v1], [u0, v1]],
            depth: Math.min(ft.depth ?? 0, thick - 0.6),
            side,
            rect,
          });
          continue;
        }
        if (!through && touches) {
          const land = 0.4;
          if (u0 <= U0 + 0.3) u0 = U0 + land;
          if (u1 >= U1 - 0.3) u1 = U1 - land;
          if (v0 <= V0 + 0.3) v0 = V0 + land;
          if (v1 >= V1 - 0.3) v1 = V1 - land;
          if (u1 - u0 < 0.8 || v1 - v0 < 0.8) continue;
        }
        const radius = Math.max(0, Number(ft.radius) || 0);
        const loop = radius > 0.05 ? roundedRect(u0, v0, u1, v1, radius) : [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
        cuts.push({
          kind: through ? "through" : "hole",
          loop,
          depth: Math.min(ft.depth ?? thick, thick - 0.6),
          side,
        });
      }
    }
  }
  return cuts.filter((c) => c.kind === "through" || c.depth > 0.2);
}

function clipPoly(poly: Pt2[], inside: (p: Pt2) => boolean, cross: (a: Pt2, c: Pt2) => Pt2): Pt2[] {
  if (poly.length < 3) return [];
  const out: Pt2[] = [];
  for (let i = 0; i < poly.length; i += 1) {
    const a = poly[i]!;
    const c = poly[(i + 1) % poly.length]!;
    const ain = inside(a);
    const cin = inside(c);
    if (ain && cin) out.push(c);
    else if (ain && !cin) out.push(cross(a, c));
    else if (!ain && cin) { out.push(cross(a, c)); out.push(c); }
  }
  return dedupe2(out);
}

function clipVertical(poly: Pt2[], x: number, keepLeft: boolean): Pt2[] {
  return clipPoly(
    poly,
    (p) => (keepLeft ? p[0] <= x + 1e-6 : p[0] >= x - 1e-6),
    (a, c) => {
      const dx = c[0] - a[0];
      const t = Math.abs(dx) < 1e-9 ? 0 : (x - a[0]) / dx;
      const u = Math.min(1, Math.max(0, t));
      return [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u];
    },
  );
}

function clipHorizontal(poly: Pt2[], y: number, keepBelow: boolean): Pt2[] {
  return clipPoly(
    poly,
    (p) => (keepBelow ? p[1] <= y + 1e-6 : p[1] >= y - 1e-6),
    (a, c) => {
      const dy = c[1] - a[1];
      const t = Math.abs(dy) < 1e-9 ? 0 : (y - a[1]) / dy;
      const u = Math.min(1, Math.max(0, t));
      return [a[0] + (c[0] - a[0]) * u, a[1] + (c[1] - a[1]) * u];
    },
  );
}

/**
 * Polygon minus an axis-aligned rectangle. A rectangle that misses the polygon
 * must leave it in one piece: clipping on x alone would draw the cut's line
 * across the board past the end of the groove (the LED branches did this).
 */
function subtractRect(poly: Pt2[], r: Rect): Pt2[][] {
  const left = clipVertical(poly, r.u0, true);
  const right = clipVertical(poly, r.u1, false);
  const mid = clipVertical(clipVertical(poly, r.u0, false), r.u1, true);
  const below = clipHorizontal(mid, r.v0, true);
  const above = clipHorizontal(mid, r.v1, false);
  const parts = [left, right, below, above].filter((p) => p.length >= 3 && Math.abs(area(p)) > 0.5);
  const kept = parts.reduce((s, p) => s + Math.abs(area(p)), 0);
  if (Math.abs(Math.abs(area(poly)) - kept) < 0.5) return [ccw(poly)];
  return parts.map(ccw);
}

function active(cut: Cut, t0: number, t1: number, mid: number): boolean {
  if (cut.kind === "through") return true;
  if (cut.side === "B") return mid < t0 + cut.depth - 1e-4;
  return mid > t1 - cut.depth + 1e-4;
}

function regionsAt(outer: Pt2[], cuts: Cut[], t0: number, t1: number, mid: number): Region[] {
  let pieces = [ccw(outer)];
  for (const cut of cuts) {
    if (cut.kind !== "notch" || !cut.rect || !active(cut, t0, t1, mid)) continue;
    pieces = pieces.flatMap((p) => subtractRect(p, cut.rect!));
  }
  pieces = pieces.map(ccw).filter((p) => p.length >= 3 && Math.abs(area(p)) > 0.5);
  const disks = cuts.filter((c) => c.kind !== "notch" && active(c, t0, t1, mid)).map((c) => c.loop);
  const holes = unionDisks(disks);
  const regions: Region[] = pieces.map((p) => ({ outer: p, holes: [] as Pt2[] }));
  for (const hole of holes) {
    let sx = 0;
    let sy = 0;
    for (const p of hole) { sx += p[0]; sy += p[1]; }
    const cu = sx / hole.length;
    const cv = sy / hole.length;
    const home = regions.find((r) => pointIn(r.outer, cu, cv));
    if (home) home.holes.push(cw(hole));
  }
  return regions;
}

function featureSlices(b: Board): Slice[] {
  const [, , T] = planeAxes(b.profilePlane);
  const t0 = q(b[`${T}0`]);
  const t1 = q(b[`${T}1`]);
  if (!(t1 - t0 > 0.2)) return [];
  const outer = boardOutline(b) ?? rectOutline(b);
  const cuts = collectCuts(b);
  const zs = new Set<number>([t0, t1]);
  for (const cut of cuts) {
    if (cut.kind === "through") continue;
    const z = q(cut.side === "B" ? t0 + cut.depth : t1 - cut.depth);
    if (z > t0 + 0.05 && z < t1 - 0.05) zs.add(z);
  }
  const stations = [...zs].sort((a, c) => a - c);
  const slices: Slice[] = [];
  for (let i = 0; i < stations.length - 1; i += 1) {
    const za = stations[i]!;
    const zb = stations[i + 1]!;
    if (zb - za < 0.05) continue;
    const regions = regionsAt(outer, cuts, t0, t1, (za + zb) / 2);
    if (regions.length) slices.push({ t0: za, t1: zb, regions });
  }
  return slices;
}

function slabSlices(b: Board): Slice[] | null {
  if (!b.slabs || !b.slabs.length || b.profilePlane !== "XY" || b.thicknessAxis !== "Z") return null;
  const pv = b.profileVector as Array<Record<string, number>> | undefined;
  const dx = pv && pv.length ? b.x0 - Math.min(...pv.map((p) => numOf(p, "x"))) : 0;
  const dy = pv && pv.length ? b.y0 - Math.min(...pv.map((p) => numOf(p, "y"))) : 0;
  const slices: Slice[] = [];
  for (const slab of b.slabs) {
    const outer = ccw((slab.outline as Array<Record<string, number>>).map((p) => [numOf(p, "x") + dx, numOf(p, "y") + dy]));
    const holes = (slab.holes || []).map((h) => cw((h as Array<Record<string, number>>).map((p) => [numOf(p, "x") + dx, numOf(p, "y") + dy])));
    if (outer.length >= 3 && slab.z1 - slab.z0 > 0.05) {
      slices.push({ t0: q(slab.z0), t1: q(slab.z1), regions: [{ outer, holes }] });
    }
  }
  slices.sort((a, c) => a.t0 - c.t0);
  return slices.length ? slices : null;
}

// --- faces -----------------------------------------------------------------------------

function uvz(b: Board, u: number, v: number, t: number): Vec {
  const [U, V, T] = planeAxes(b.profilePlane);
  const p = { x: 0, y: 0, z: 0 };
  p[U] = u;
  p[V] = v;
  p[T] = t;
  return [p.x, p.y, p.z];
}

function horiz(b: Board, regions: Region[], z: number, up: boolean): Face3[] {
  const faces: Face3[] = [];
  for (const r of regions) {
    if (r.outer.length < 3 || Math.abs(area(r.outer)) < 0.5) continue;
    const outer = up ? r.outer : r.outer.slice().reverse();
    const holes = r.holes.map((h) => (up ? h : h.slice().reverse()));
    faces.push({ loops: [outer, ...holes].map((loop) => loop.map(([u, v]) => uvz(b, u, v, z))) });
  }
  return faces;
}

function key2(a: Pt2, b: Pt2): string {
  return `${a[0]},${a[1]}>${b[0]},${b[1]}`;
}

function walls(b: Board, slice: Slice): Face3[] {
  const bag = new Map<string, { a: Pt2; b: Pt2; n: number }>();
  const push = (a: Pt2, c: Pt2) => {
    if (a[0] === c[0] && a[1] === c[1]) return;
    const rev = bag.get(key2(c, a));
    if (rev) {
      rev.n -= 1;
      if (rev.n <= 0) bag.delete(key2(c, a));
      return;
    }
    const hit = bag.get(key2(a, c));
    if (hit) hit.n += 1;
    else bag.set(key2(a, c), { a, b: c, n: 1 });
  };
  const walk = (loop: Pt2[]) => {
    for (let i = 0; i < loop.length; i += 1) push(loop[i]!, loop[(i + 1) % loop.length]!);
  };
  for (const r of slice.regions) {
    walk(ccw(r.outer));
    for (const h of r.holes) walk(cw(h));
  }
  const faces: Face3[] = [];
  for (const e of bag.values()) {
    faces.push({
      loops: [[
        uvz(b, e.a[0], e.a[1], slice.t0),
        uvz(b, e.b[0], e.b[1], slice.t0),
        uvz(b, e.b[0], e.b[1], slice.t1),
        uvz(b, e.a[0], e.a[1], slice.t1),
      ]],
    });
  }
  return faces;
}

function facesFromSlices(b: Board, slices: Slice[]): Face3[] {
  if (!slices.length) return [];
  const faces: Face3[] = [];
  for (const s of slices) faces.push(...walls(b, s));
  faces.push(...horiz(b, slices[0]!.regions, slices[0]!.t0, false));
  const last = slices[slices.length - 1]!;
  faces.push(...horiz(b, last.regions, last.t1, true));
  for (let i = 0; i < slices.length - 1; i += 1) {
    const below = slices[i]!;
    const above = slices[i + 1]!;
    if (Math.abs(above.t0 - below.t1) > 0.05) continue;
    const z = below.t1;
    faces.push(...horiz(b, diffRegions(below.regions, above.regions), z, true));
    faces.push(...horiz(b, diffRegions(above.regions, below.regions), z, false));
  }
  return faces;
}

function dedupe3(loop: Vec[]): Vec[] {
  const out: Vec[] = [];
  for (const p of loop) {
    const v = q3(p);
    const prev = out[out.length - 1];
    if (prev && prev[0] === v[0] && prev[1] === v[1] && prev[2] === v[2]) continue;
    out.push(v);
  }
  if (out.length > 1) {
    const a = out[0]!;
    const c = out[out.length - 1]!;
    if (a[0] === c[0] && a[1] === c[1] && a[2] === c[2]) out.pop();
  }
  return out;
}

function newell(loop: Vec[]): Vec {
  const n: Vec = [0, 0, 0];
  for (let i = 0; i < loop.length; i += 1) {
    const a = loop[i]!;
    const b = loop[(i + 1) % loop.length]!;
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

function splitEdges(faces: Face3[]): Face3[] {
  const pts: Vec[] = [];
  for (const f of faces) for (const loop of f.loops) for (const p of loop) pts.push(p);
  const uniq: Vec[] = [];
  const seen = new Set<string>();
  for (const p of pts) {
    const k = `${p[0]},${p[1]},${p[2]}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(p);
  }
  const insert = (loop: Vec[]): Vec[] => {
    const out: Vec[] = [];
    for (let i = 0; i < loop.length; i += 1) {
      const a = loop[i]!;
      const b = loop[(i + 1) % loop.length]!;
      out.push(a);
      const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]] as Vec;
      const len2 = ab[0] * ab[0] + ab[1] * ab[1] + ab[2] * ab[2];
      if (len2 < 1e-8) continue;
      const on: { t: number; p: Vec }[] = [];
      for (const p of uniq) {
        const ap = [p[0] - a[0], p[1] - a[1], p[2] - a[2]] as Vec;
        const t = (ap[0] * ab[0] + ap[1] * ab[1] + ap[2] * ab[2]) / len2;
        if (t <= 0.002 || t >= 0.998) continue;
        const d2 = (ap[0] - ab[0] * t) ** 2 + (ap[1] - ab[1] * t) ** 2 + (ap[2] - ab[2] * t) ** 2;
        if (d2 <= 0.02 * 0.02) on.push({ t, p });
      }
      on.sort((x, y) => x.t - y.t);
      for (const hit of on) out.push(hit.p);
    }
    return dedupe3(out);
  };
  return faces
    .map((f) => ({ loops: f.loops.map(insert).filter((loop) => loop.length >= 3) }))
    .filter((f) => f.loops.length && f.loops[0]!.length >= 3 && Math.hypot(...newell(f.loops[0]!)) > 1e-4);
}

function unitNormal(loop: Vec[]): Vec | null {
  const n = newell(loop);
  const len = Math.hypot(n[0], n[1], n[2]);
  if (len < 1e-8) return null;
  return [n[0] / len, n[1] / len, n[2] / len];
}

/**
 * Fusion draws every edge of the solid. A groove is cut as two slices, so the
 * board's outer face is two coplanar quads with a line between them at the
 * groove depth, and a T-groove's rectangles can meet on the floor. Join faces
 * that lie on one plane and share an edge; the line goes away, the cut stays.
 */
function mergeCoplanar(faces: Face3[]): Face3[] {
  const pts = new Map<string, Vec>();
  const remember = (loop: Vec[]) => { for (const p of loop) pts.set(vid(p), p); };
  for (const f of faces) for (const loop of f.loops) remember(loop);

  const edgesOf = (face: Face3): [string, string][] => {
    const out: [string, string][] = [];
    for (const loop of face.loops) {
      for (let i = 0; i < loop.length; i += 1) out.push([vid(loop[i]!), vid(loop[(i + 1) % loop.length]!)]);
    }
    return out;
  };

  const tryMerge = (a: Face3, b: Face3): Face3 | null => {
    const na = unitNormal(a.loops[0]!);
    const nb = unitNormal(b.loops[0]!);
    if (!na || !nb || dot(na, nb) < 0.999) return null;
    const gap = Math.abs(dot(na, sub(b.loops[0]![0]!, a.loops[0]![0]!)));
    if (gap > 0.05) return null;
    const eb = new Map<string, number>();
    for (const [s, t] of edgesOf(b)) {
      const k = `${s}>${t}`;
      eb.set(k, (eb.get(k) ?? 0) + 1);
    }
    let shared = 0;
    const remain: [string, string][] = [];
    for (const [s, t] of edgesOf(a)) {
      const rev = `${t}>${s}`;
      const n = eb.get(rev) ?? 0;
      if (n > 0) {
        shared += 1;
        if (n === 1) eb.delete(rev);
        else eb.set(rev, n - 1);
      } else remain.push([s, t]);
    }
    if (!shared) return null;
    for (const [k, n] of eb) {
      const [s, t] = k.split(">");
      for (let i = 0; i < n; i += 1) remain.push([s!, t!]);
    }
    const outCount = new Map<string, number>();
    const inCount = new Map<string, number>();
    for (const [s, t] of remain) {
      outCount.set(s, (outCount.get(s) ?? 0) + 1);
      inCount.set(t, (inCount.get(t) ?? 0) + 1);
    }
    if ([...outCount.values()].some((n) => n !== 1) || [...inCount.values()].some((n) => n !== 1)) return null;
    const used = new Set<string>();
    const loops: Vec[][] = [];
    for (const [s0] of remain) {
      if ([...used].some((k) => k.startsWith(`${s0}>`))) continue;
      const loop: Vec[] = [];
      let cur = s0;
      let closed = false;
      for (let guard = 0; guard <= remain.length; guard += 1) {
        const nxt = remain.find(([s, t]) => s === cur && !used.has(`${s}>${t}`));
        if (!nxt) break;
        used.add(`${nxt[0]}>${nxt[1]}`);
        const p = pts.get(cur);
        if (!p) return null;
        loop.push(p);
        cur = nxt[1];
        if (cur === s0) { closed = true; break; }
      }
      if (!closed || loop.length < 3) return null;
      loops.push(loop);
    }
    if (used.size !== remain.length || loops.reduce((n, loop) => n + loop.length, 0) !== remain.length) return null;
    loops.sort((p, q) => Math.hypot(...newell(q)) - Math.hypot(...newell(p)));
    const outward = unitNormal(loops[0]!);
    if (outward && dot(outward, na) < 0) {
      for (const loop of loops) loop.reverse();
    }
    return { loops };
  };

  let list = faces.slice();
  for (let step = 0; step < faces.length; step += 1) {
    let merged = false;
    for (let i = 0; i < list.length && !merged; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        const next = tryMerge(list[i]!, list[j]!);
        if (!next) continue;
        const kept = list.filter((_, k) => k !== i && k !== j);
        kept.push(next);
        list = kept;
        merged = true;
        break;
      }
    }
    if (!merged) break;
  }
  return list;
}

/**
 * A pocket's depth used to leave a point on every straight edge it didn't
 * actually cut — the hinge-cup depth on a door edge, the LED depth on B3's
 * edge. Where a point only sits between two points of one straight line,
 * drop it. A corner of a real opening has a third edge and stays.
 */
function dissolveCollinear(faces: Face3[]): Face3[] {
  const pts = new Map<string, Vec>();
  const neighbors = new Map<string, Set<string>>();
  const link = (a: Vec, b: Vec) => {
    const ia = vid(a);
    const ib = vid(b);
    pts.set(ia, a);
    pts.set(ib, b);
    if (!neighbors.has(ia)) neighbors.set(ia, new Set());
    if (!neighbors.has(ib)) neighbors.set(ib, new Set());
    neighbors.get(ia)!.add(ib);
    neighbors.get(ib)!.add(ia);
  };
  for (const face of faces) {
    for (const loop of face.loops) {
      for (let i = 0; i < loop.length; i += 1) link(loop[i]!, loop[(i + 1) % loop.length]!);
    }
  }
  const drop = new Set<string>();
  for (const [id, ns] of neighbors) {
    if (ns.size !== 2) continue;
    const [i, j] = [...ns];
    const p = pts.get(id)!;
    const a = pts.get(i!)!;
    const b = pts.get(j!)!;
    const ab = sub(b, a);
    const ap = sub(p, a);
    const cross: Vec = [
      ab[1] * ap[2] - ab[2] * ap[1],
      ab[2] * ap[0] - ab[0] * ap[2],
      ab[0] * ap[1] - ab[1] * ap[0],
    ];
    const span = Math.hypot(ab[0], ab[1], ab[2]) || 1;
    if (Math.hypot(cross[0], cross[1], cross[2]) / span > 0.02) continue;
    const t = dot(ap, ab) / (span * span);
    if (t <= 0.002 || t >= 0.998) continue;
    drop.add(id);
  }
  if (!drop.size) return faces;
  return faces.map((face) => ({
    loops: face.loops
      .map((loop) => loop.filter((p) => !drop.has(vid(p))))
      .filter((loop) => loop.length >= 3),
  })).filter((face) => face.loops.length > 0 && face.loops[0]!.length >= 3);
}

/** Closed shell of one board, in the cabinet frame. */
export function boardFaces(board: Board): Face3[] {
  const slices = slabSlices(board) ?? featureSlices(board);
  const faces = splitEdges(facesFromSlices(board, slices).map((f) => ({ loops: f.loops.map(dedupe3) })));
  return dissolveCollinear(mergeCoplanar(faces));
}

function vid(p: Vec): string {
  return `${p[0]},${p[1]},${p[2]}`;
}

/** Null when every edge is shared by exactly two faces, in opposite directions. */
export function solidError(faces: Face3[]): string | null {
  if (faces.length < 4) return "no solid";
  const count = new Map<string, number>();
  for (const f of faces) {
    for (const loop of f.loops) {
      if (loop.length < 3) return "broken face";
      for (let i = 0; i < loop.length; i += 1) {
        const k = `${vid(loop[i]!)}>${vid(loop[(i + 1) % loop.length]!)}`;
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
  }
  for (const [k, n] of count) {
    const [a, b] = k.split(">");
    const m = count.get(`${b}>${a}`) ?? 0;
    if (n !== 1 || m !== 1) return `open edge ${k} (${n} / ${m})`;
  }
  return null;
}

function dot(a: Vec, b: Vec): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function sub(a: Vec, b: Vec): Vec {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

/** Even-odd ray cast. The point must not sit on a face. */
export function solidContains(faces: Face3[], origin: Vec): boolean {
  const dir: Vec = [0.41, 0.17, 0.89];
  let hits = 0;
  for (const face of faces) {
    const outer = face.loops[0];
    if (!outer || outer.length < 3) continue;
    const n = newell(outer);
    const denom = dot(n, dir);
    if (Math.abs(denom) < 1e-9) continue;
    const t = dot(n, sub(outer[0]!, origin)) / denom;
    if (t < 1e-6) continue;
    const p: Vec = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
    const ax = Math.abs(n[0]) > Math.abs(n[1]) && Math.abs(n[0]) > Math.abs(n[2]) ? 0 : Math.abs(n[1]) > Math.abs(n[2]) ? 1 : 2;
    const u = (ax + 1) % 3;
    const v = (ax + 2) % 3;
    const inside = (loop: Vec[]) => {
      let inn = false;
      for (let i = 0, j = loop.length - 1; i < loop.length; j = i, i += 1) {
        const ui = loop[i]![u];
        const vi = loop[i]![v];
        const uj = loop[j]![u];
        const vj = loop[j]![v];
        if ((vi > p[v]) !== (vj > p[v]) && p[u] < ((uj - ui) * (p[v] - vi)) / ((vj - vi) || 1e-12) + ui) inn = !inn;
      }
      return inn;
    };
    if (!inside(outer)) continue;
    if (face.loops.slice(1).some(inside)) continue;
    hits += 1;
  }
  return hits % 2 === 1;
}

// --- pose (renderer/pose.js rotationMatrix, Euler XYZ) --------------------------------

function rotationMatrix(rotX = 0, rotY = 0, rotZ = 0): number[][] {
  const x = rotX * Math.PI / 180;
  const y = rotY * Math.PI / 180;
  const z = rotZ * Math.PI / 180;
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    [c * e, -c * f, d],
    [af + be * d, ae - bf * d, -b * c],
    [bf - ae * d, be + af * d, a * c],
  ];
}

function mulVec(m: number[][], v: Vec): Vec {
  return [
    m[0]![0]! * v[0] + m[0]![1]! * v[1] + m[0]![2]! * v[2],
    m[1]![0]! * v[0] + m[1]![1]! * v[1] + m[1]![2]! * v[2],
    m[2]![0]! * v[0] + m[2]![1]! * v[1] + m[2]![2]! * v[2],
  ];
}

function worldOf(pose: Pose, override: Pose | undefined, board: Board, p: Vec): Vec {
  let v = p;
  const ov = override || {};
  if (ov.x || ov.y || ov.z || ov.rotX || ov.rotY || ov.rotZ) {
    const c: Vec = [(board.x0 + board.x1) / 2, (board.y0 + board.y1) / 2, (board.z0 + board.z1) / 2];
    const r = mulVec(rotationMatrix(ov.rotX, ov.rotY, ov.rotZ), sub(v, c));
    v = [c[0] + r[0] + (ov.x || 0), c[1] + r[1] + (ov.y || 0), c[2] + r[2] + (ov.z || 0)];
  }
  const w = mulVec(rotationMatrix(pose.rotX, pose.rotY, pose.rotZ), v);
  return q3([w[0] + (pose.x || 0), w[1] + (pose.y || 0), w[2] + (pose.z || 0)]);
}

// --- STEP --------------------------------------------------------------------------------

function stepStr(s: string): string {
  return `'${s.replace(/'/g, "''").replace(/[^\x20-\x7E]/g, " ")}'`;
}

function num(n: number): string {
  const v = q(n);
  return Object.is(v, -0) ? "0." : String(v).includes(".") ? String(v) : `${v}.`;
}

function vecText(p: Vec): string {
  return `(${num(p[0])},${num(p[1])},${num(p[2])})`;
}

class StepWriter {
  private ents: string[] = [];
  private ctx = 0;
  private add(body: string): number {
    this.ents.push(body);
    return this.ents.length;
  }
  private ref(n: number): string { return `#${n}`; }

  constructor() {
    const app = this.add("APPLICATION_CONTEXT('core data for automotive mechanical design processes')");
    this.add(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,${this.ref(app)})`);
    const len = this.add("(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))");
    const rad = this.add("(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))");
    const sr = this.add("(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())");
    const unc = this.add(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(0.001),${this.ref(len)},'distance_accuracy_value','confusion accuracy')`);
    this.ctx = this.add(`(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((${this.ref(unc)}))GLOBAL_UNIT_ASSIGNED_CONTEXT((${this.ref(len)},${this.ref(rad)},${this.ref(sr)}))REPRESENTATION_CONTEXT('Context','3D'))`);
    this.productContext = this.add(`PRODUCT_CONTEXT('',${this.ref(app)},'mechanical')`);
    this.defContext = this.add(`PRODUCT_DEFINITION_CONTEXT('part definition',${this.ref(app)},'design')`);
  }

  private productContext: number;
  private defContext: number;

  private point(p: Vec): number {
    return this.add(`CARTESIAN_POINT('',${vecText(p)})`);
  }
  private direction(p: Vec): number {
    const len = Math.hypot(p[0], p[1], p[2]) || 1;
    return this.add(`DIRECTION('',${vecText([p[0] / len, p[1] / len, p[2] / len])})`);
  }
  placement(origin: Vec, axis: Vec, refDir: Vec): number {
    return this.add(`AXIS2_PLACEMENT_3D('',${this.ref(this.point(origin))},${this.ref(this.direction(axis))},${this.ref(this.direction(refDir))})`);
  }

  private solid(name: string, faces: Face3[]): number {
    const vId = new Map<string, number>();
    const vertex = (p: Vec) => {
      const k = vid(p);
      const hit = vId.get(k);
      if (hit) return hit;
      const id = this.add(`VERTEX_POINT('',${this.ref(this.point(p))})`);
      vId.set(k, id);
      return id;
    };
    const eId = new Map<string, { id: number; flipFrom: string }>();
    const edge = (a: Vec, b: Vec) => {
      const ka = vid(a);
      const kb = vid(b);
      const forward = ka < kb;
      const key = forward ? `${ka}|${kb}` : `${kb}|${ka}`;
      let rec = eId.get(key);
      if (!rec) {
        const s = forward ? a : b;
        const t = forward ? b : a;
        const dir = sub(t, s);
        const line = this.add(`LINE('',${this.ref(this.point(s))},${this.ref(this.add(`VECTOR('',${this.ref(this.direction(dir))},${num(Math.hypot(dir[0], dir[1], dir[2]))})`))})`);
        const id = this.add(`EDGE_CURVE('',${this.ref(vertex(s))},${this.ref(vertex(t))},${this.ref(line)},.T.)`);
        rec = { id, flipFrom: vid(s) };
        eId.set(key, rec);
      }
      const same = vid(a) === rec.flipFrom;
      return this.add(`ORIENTED_EDGE('',*,*,${this.ref(rec.id)},${same ? ".T." : ".F."})`);
    };
    const faceIds: number[] = [];
    for (const face of faces) {
      const bounds: number[] = [];
      face.loops.forEach((loop, li) => {
        const edges = [];
        for (let i = 0; i < loop.length; i += 1) edges.push(this.ref(edge(loop[i]!, loop[(i + 1) % loop.length]!)));
        const loopId = this.add(`EDGE_LOOP('',(${edges.join(",")}))`);
        const bound = li === 0 ? "FACE_OUTER_BOUND" : "FACE_BOUND";
        bounds.push(this.add(`${bound}('',${this.ref(loopId)},.T.)`));
      });
      const outer = face.loops[0]!;
      const n = newell(outer);
      const edge0 = sub(outer[1]!, outer[0]!);
      const along = dot(edge0, n);
      const nn = Math.hypot(n[0], n[1], n[2]) || 1;
      let ref = sub(edge0, [n[0] * along / (nn * nn), n[1] * along / (nn * nn), n[2] * along / (nn * nn)]);
      if (Math.hypot(ref[0], ref[1], ref[2]) < 1e-8) {
        const ax: Vec = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
        ref = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
      }
      const plane = this.add(`PLANE('',${this.ref(this.placement(outer[0]!, n, ref))})`);
      faceIds.push(this.add(`ADVANCED_FACE('',(${bounds.map((id) => this.ref(id)).join(",")}),${this.ref(plane)},.T.)`));
    }
    const shell = this.add(`CLOSED_SHELL('',(${faceIds.map((id) => this.ref(id)).join(",")}))`);
    return this.add(`MANIFOLD_SOLID_BREP(${stepStr(name)},${this.ref(shell)})`);
  }

  private product(name: string, items: number[], brep = false): { pd: number; rep: number } {
    const prod = this.add(`PRODUCT(${stepStr(name)},${stepStr(name)},'',(${this.ref(this.productContext)}))`);
    const form = this.add(`PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',${this.ref(prod)},.NOT_KNOWN.)`);
    const pd = this.add(`PRODUCT_DEFINITION('design','',${this.ref(form)},${this.ref(this.defContext)})`);
    const pds = this.add(`PRODUCT_DEFINITION_SHAPE('','',${this.ref(pd)})`);
    const kind = brep ? "ADVANCED_BREP_SHAPE_REPRESENTATION" : "SHAPE_REPRESENTATION";
    const rep = this.add(`${kind}('',(${items.map((id) => this.ref(id)).join(",")}),${this.ref(this.ctx)})`);
    this.add(`SHAPE_DEFINITION_REPRESENTATION(${this.ref(pds)},${this.ref(rep)})`);
    return { pd, rep };
  }

  /**
   * Geometry is already in world space, so every placement is the identity.
   * The assembly still groups boards under their cabinet. transform_item_1 is
   * the component origin and transform_item_2 is where it sits in the parent
   * (ISO 10303-1345). Both are the origin, so the world coordinates stay put.
   */
  file(cabinets: { id: string; boards: { name: string; faces: Face3[] }[] }[]): string {
    const ident = () => this.placement([0, 0, 0], [0, 0, 1], [1, 0, 0]);
    const rootOrigin = ident();
    const cabNodes: { id: string; pd: number; rep: number; origin: number }[] = [];
    for (const cab of cabinets) {
      const origin = ident();
      const boards = cab.boards.map((board) => {
        const originB = ident();
        const solid = this.solid(board.name, board.faces);
        const node = this.product(board.name, [originB, solid], true);
        return { ...node, origin: originB };
      });
      const node = this.product(cab.id, [origin]);
      for (const board of boards) this.occur(node, board, board.origin, origin);
      cabNodes.push({ id: cab.id, ...node, origin });
    }
    const root = this.product("export", [rootOrigin]);
    for (const cab of cabNodes) this.occur(root, cab, cab.origin, rootOrigin);
    const body = this.ents.map((ent, i) => `#${i + 1}=${ent};`).join("\n");
    const now = new Date().toISOString().replace(/\.\d+Z$/, "");
    return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('The Cab Lab'),'2;1');\nFILE_NAME('export.stp','${now}',('The Cab Lab'),('The Cab Lab'),'The Cab Lab','The Cab Lab','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n${body}\nENDSEC;\nEND-ISO-10303-21;\n`;
  }

  private occur(parent: { pd: number; rep: number }, child: { pd: number; rep: number }, childOrigin: number, parentPlace: number) {
    const nauo = this.add(`NEXT_ASSEMBLY_USAGE_OCCURRENCE(${stepStr(String(child.pd))},'','',${this.ref(parent.pd)},${this.ref(child.pd)},'')`);
    const pds = this.add(`PRODUCT_DEFINITION_SHAPE('','',${this.ref(nauo)})`);
    const idt = this.add(`ITEM_DEFINED_TRANSFORMATION('','',${this.ref(childOrigin)},${this.ref(parentPlace)})`);
    const rel = this.add(`(REPRESENTATION_RELATIONSHIP('','',${this.ref(child.rep)},${this.ref(parent.rep)})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(${this.ref(idt)})SHAPE_REPRESENTATION_RELATIONSHIP())`);
    this.add(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(${this.ref(rel)},${this.ref(pds)})`);
  }
}

export function buildStep(input: { cabinets: StepCabinet[] }): StepResult {
  const skipped: StepSkipped[] = [];
  const cabinets: { id: string; boards: { name: string; faces: Face3[] }[] }[] = [];
  for (const cab of input.cabinets) {
    const boards: { name: string; faces: Face3[] }[] = [];
    const pose = cab.pose || {};
    for (const board of cab.boards) {
      const name = `${cab.id}/${board.id}`;
      let faces: Face3[];
      try {
        faces = boardFaces(board);
      } catch (err) {
        skipped.push({ cabinetId: cab.id, boardId: board.id, reason: err instanceof Error ? err.message : String(err) });
        continue;
      }
      const error = solidError(faces);
      if (error) {
        skipped.push({ cabinetId: cab.id, boardId: board.id, reason: error });
        continue;
      }
      const ov = cab.overrides?.[board.id];
      boards.push({
        name,
        faces: faces.map((f) => ({ loops: f.loops.map((loop) => loop.map((p) => worldOf(pose, ov, board, p))) })),
      });
    }
    if (boards.length) cabinets.push({ id: cab.id, boards });
  }
  const boardCount = cabinets.reduce((n, c) => n + c.boards.length, 0);
  if (!boardCount) return { ok: false, text: "", boardCount: 0, skipped };
  return { ok: true, text: new StepWriter().file(cabinets), boardCount, skipped };
}
