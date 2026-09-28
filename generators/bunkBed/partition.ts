/**
 * Board outlines for the bunk (front partition, sill): plain 2D geometry, no provenance.
 * Rings are closed without a repeated first point; `b` on a point is the bulge of the
 * edge that starts there (tan(sweep / 4), + counter-clockwise), as in the sketch board.
 * Outer rings run counter-clockwise, holes clockwise, so the material is always on the left.
 */
import { tessellateRing, type SketchPoint } from "../sketchBoard/generator.ts";

export type Pt = SketchPoint;
type Ring = Pt[];

const QUARTER = Math.tan(Math.PI / 8); // bulge of a 90° arc

/** Rounded rectangle, counter-clockwise. */
export function roundedRect(x0: number, x1: number, z0: number, z1: number, r: number): Ring {
  if (r <= 0) return [{ u: x0, v: z0 }, { u: x1, v: z0 }, { u: x1, v: z1 }, { u: x0, v: z1 }];
  return [
    { u: x0 + r, v: z0 }, { u: x1 - r, v: z0, b: QUARTER },
    { u: x1, v: z0 + r }, { u: x1, v: z1 - r, b: QUARTER },
    { u: x1 - r, v: z1 }, { u: x0 + r, v: z1, b: QUARTER },
    { u: x0, v: z1 - r }, { u: x0, v: z0 + r, b: QUARTER },
  ];
}

/** Same ring the other way round; each edge keeps its curve, so its bulge changes sign. */
export function reverseRing(pts: Ring): Ring {
  const n = pts.length;
  const out: Ring = [];
  for (let i = 0; i < n; i += 1) {
    const p = pts[(n - i) % n]!;
    const b = -(pts[(n - 1 - i) % n]!.b ?? 0);
    out.push(b ? { u: p.u, v: p.v, b } : { u: p.u, v: p.v });
  }
  return out;
}

/**
 * Board outline, counter-clockwise: the rectangle x 0..W, z z0..z1 with a square notch
 * up from the bottom edge (`bottom` x range, up to `bottomTop`) and a notch down from the
 * top edge (`top` x range, down to `topBottom`, its two lower corners rounded `r`).
 */
export function notchedOutline(W: number, z0: number, z1: number, bottom: [number, number], bottomTop: number, top: [number, number], topBottom: number, r: number): Ring {
  const [a0, a1] = bottom;
  const [u0, u1] = top;
  return [
    { u: 0, v: z0 }, { u: a0, v: z0 }, { u: a0, v: bottomTop }, { u: a1, v: bottomTop }, { u: a1, v: z0 },
    { u: W, v: z0 }, { u: W, v: z1 }, { u: u1, v: z1 },
    { u: u1, v: topBottom + r, b: -QUARTER }, { u: u1 - r, v: topBottom },
    { u: u0 + r, v: topBottom, b: -QUARTER }, { u: u0, v: topBottom + r },
    { u: u0, v: z1 }, { u: 0, v: z1 },
  ];
}

/**
 * Sill in plan, counter-clockwise: the body x m0..m1, y y1..y2 with a tongue x t0..t1
 * forward to y 0, and a half-circle relief of diameter `d` cut into the body along its
 * front edge beside each tongue corner.
 */
export function sillOutline(m0: number, m1: number, t0: number, t1: number, y1: number, y2: number, d: number): Ring {
  return [
    { u: m0, v: y1 }, { u: t0 - d, v: y1, b: -1 }, { u: t0, v: y1 }, { u: t0, v: 0 }, { u: t1, v: 0 },
    { u: t1, v: y1, b: -1 }, { u: t1 + d, v: y1 }, { u: m1, v: y1 }, { u: m1, v: y2 }, { u: m0, v: y2 },
  ];
}

export function flatten(ring: Ring): Ring {
  return tessellateRing(ring);
}

function inside(poly: Ring, u: number, v: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const a = poly[i]!;
    const b = poly[j]!;
    if ((a.v > v) !== (b.v > v) && u < ((b.u - a.u) * (v - a.v)) / (b.v - a.v) + a.u) hit = !hit;
  }
  return hit;
}

/** One piece: an outer ring and the holes inside it (flat points). */
export interface Piece {
  outer: Ring;
  holes: Ring[];
}

/**
 * Cut a flat outer ring with flat holes along x = c and keep one side (`keepLeft`).
 * Boundary runs inside the kept side are joined along the cut line, travelling so the
 * material stays on the left (up for the left side, down for the right side). Holes the
 * line does not touch go to the piece that contains them. Null when the runs cannot be
 * joined (a ring touching the line only at a vertex).
 */
export function cutAt(outer: Ring, holes: Ring[], c: number, keepLeft: boolean): Piece[] | null {
  const keep = (u: number) => (keepLeft ? u < c : u > c);
  const chains: Ring[] = [];
  const whole: Ring[] = [];
  const wholeHoles: Ring[] = [];
  for (const [ring, isHole] of [[outer, false], ...holes.map((h) => [h, true] as const)] as Array<[Ring, boolean]>) {
    const ins = ring.map((p) => keep(p.u));
    if (ins.every(Boolean)) { (isHole ? wholeHoles : whole).push(ring); continue; }
    if (!ins.some(Boolean)) continue;
    const n = ring.length;
    const s = ins.findIndex((v) => !v);
    let cur: Ring | null = null;
    for (let k = 0; k < n; k += 1) {
      const i = (s + k) % n;
      const j = (i + 1) % n;
      const a = ring[i]!;
      const b = ring[j]!;
      const hit = () => ({ u: c, v: a.v + ((c - a.u) / (b.u - a.u)) * (b.v - a.v) });
      if (ins[i] && ins[j]) cur!.push({ u: b.u, v: b.v });
      else if (ins[i] && !ins[j]) { cur!.push(hit()); chains.push(cur!); cur = null; }
      else if (!ins[i] && ins[j]) cur = [hit(), { u: b.u, v: b.v }];
    }
  }
  const rings: Ring[] = [...whole];
  const used = new Set<number>();
  for (let i = 0; i < chains.length; i += 1) {
    if (used.has(i)) continue;
    const ring: Ring = [];
    let k = i;
    for (let guard = 0; guard <= chains.length; guard += 1) {
      used.add(k);
      ring.push(...chains[k]!);
      const end = chains[k]!.at(-1)!.v;
      let next = -1;
      for (let m = 0; m < chains.length; m += 1) {
        const start = chains[m]!.at(0)!.v;
        const ahead = keepLeft ? start > end : start < end;
        if (!ahead) continue;
        if (next < 0 || (keepLeft ? start < chains[next]![0]!.v : start > chains[next]![0]!.v)) next = m;
      }
      if (next < 0) return null;
      if (next === i) break;
      if (used.has(next)) return null;
      k = next;
    }
    rings.push(ring);
  }
  return rings.map((r) => ({ outer: r, holes: wholeHoles.filter((h) => inside(r, h[0]!.u, h[0]!.v)) }));
}
