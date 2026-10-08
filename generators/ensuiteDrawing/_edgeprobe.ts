/** Throwaway: which ensuite outline edges are uncovered once both cabinets stand as placed. */
import { generateEnsuiteDrawing } from "./generator.ts";
import type { Board, Face } from "../_lib/model.ts";

type Box = { id: string; name: string; part: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number; plane: Board["profilePlane"]; poly: [number, number][] };

const tall = generateEnsuiteDrawing({ part: "tall" }).boards;
const lower = generateEnsuiteDrawing({ part: "lower" }).boards;

function polyOf(b: Board): [number, number][] {
  const plane = b.profilePlane;
  if (b.profileVector && b.profileVector.length >= 4) {
    const pts = b.profileVector as Array<Record<string, number>>;
    const U = plane[0]!.toLowerCase();
    const V = plane[1]!.toLowerCase();
    const raw = pts.map((p) => [Number(p[U]), Number(p[V])] as [number, number]);
    const a = raw[0]!;
    const c = raw[raw.length - 1]!;
    if (Math.abs(a[0] - c[0]) < 1e-6 && Math.abs(a[1] - c[1]) < 1e-6) raw.pop();
    return raw;
  }
  const U = plane[0]!.toLowerCase() as "x" | "y" | "z";
  const V = plane[1]!.toLowerCase() as "x" | "y" | "z";
  const u0 = b[`${U}0`], u1 = b[`${U}1`], v0 = b[`${V}0`], v1 = b[`${V}1`];
  return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
}

function place(b: Board, part: "tall" | "lower"): Box {
  const dx = part === "lower" ? 523 : 0;
  const dy = part === "lower" ? 30 : 0;
  const poly = polyOf(b).map(([u, v]) => [u + (b.profilePlane[0] === "X" ? dx : b.profilePlane[0] === "Y" ? dy : 0), v + (b.profilePlane[1] === "Y" ? dy : 0)] as [number, number]);
  return {
    id: b.id, name: b.name ?? b.id, part, plane: b.profilePlane,
    x0: b.x0 + dx, x1: b.x1 + dx, y0: b.y0 + dy, y1: b.y1 + dy, z0: b.z0, z1: b.z1,
    poly,
  };
}

const solids = [
  ...tall.map((b) => place(b, "tall")),
  ...lower.map((b) => place(b, "lower")),
];

function insidePoly(poly: [number, number][], u: number, v: number): boolean {
  let n = 0;
  for (let i = 0; i < poly.length; i += 1) {
    const [x0, y0] = poly[i]!;
    const [x1, y1] = poly[(i + 1) % poly.length]!;
    if ((y0 > v) === (y1 > v)) continue;
    const x = x0 + ((v - y0) * (x1 - x0)) / (y1 - y0);
    if (x > u) n += 1;
  }
  return n % 2 === 1;
}

function contains(s: Box, p: { x: number; y: number; z: number }, tol = 0.4): boolean {
  if (p.x < s.x0 - tol || p.x > s.x1 + tol || p.y < s.y0 - tol || p.y > s.y1 + tol || p.z < s.z0 - tol || p.z > s.z1 + tol) return false;
  const plane = s.plane;
  const U = plane[0] === "X" ? p.x : plane[0] === "Y" ? p.y : p.z;
  const V = plane[1] === "Y" ? p.y : plane[1] === "Z" ? p.z : p.x;
  // Inset the polygon test slightly so a point on the shared face still counts as covered.
  return insidePoly(s.poly, U, V) || insidePoly(s.poly, U, V);
}

function edgeWorld(b: Board, f: Face, dx: number, dy: number) {
  const plane = b.profilePlane;
  const U = plane[0]!.toLowerCase() as "x" | "y" | "z";
  const V = plane[1]!.toLowerCase() as "x" | "y" | "z";
  const T = ({ XY: "z", XZ: "y", YZ: "x" } as const)[plane];
  // Face edge is board-local. Recover cabinet coords from the outline origin used by facesOf.
  let ou = b[`${U}0`];
  let ov = b[`${V}0`];
  if (plane !== "YZ" && b.profileVector) {
    const pts = b.profileVector as Array<Record<string, number>>;
    ou = Math.min(...pts.map((p) => Number(p[U])));
    ov = Math.min(...pts.map((p) => Number(p[V])));
  }
  const [u0, v0] = f.edge!.from;
  const [u1, v1] = f.edge!.to;
  const p0 = { x: 0, y: 0, z: 0 };
  const p1 = { x: 0, y: 0, z: 0 };
  p0[U] = ou + u0; p0[V] = ov + v0;
  p1[U] = ou + u1; p1[V] = ov + v1;
  p0.x += dx; p1.x += dx; p0.y += dy; p1.y += dy;
  const t0 = b[`${T}0`] + (T === "x" ? dx : T === "y" ? dy : 0);
  const t1 = b[`${T}1`] + (T === "x" ? dx : T === "y" ? dy : 0);
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y, p1.z - p0.z);
  const n = f.normal;
  const normal = typeof n === "string"
    ? { x: n[1] === "X" ? (n[0] === "+" ? 1 : -1) : 0, y: n[1] === "Y" ? (n[0] === "+" ? 1 : -1) : 0, z: n[1] === "Z" ? (n[0] === "+" ? 1 : -1) : 0, label: n }
    : { x: n[0], y: n[1], z: n[2], label: "slant" };
  return { p0, p1, t0, t1, T, len, normal };
}

const SHOW = new Set(["C98", "C99", "C38", "C39"]);

function covered(self: string, e: ReturnType<typeof edgeWorld>): number {
  const steps = Math.max(3, Math.ceil(e.len / 15));
  let hit = 0;
  let tot = 0;
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    const x = e.p0.x + (e.p1.x - e.p0.x) * t;
    const y = e.p0.y + (e.p1.y - e.p0.y) * t;
    const z = e.p0.z + (e.p1.z - e.p0.z) * t;
    const tm = (e.t0 + e.t1) / 2;
    const p = { x, y, z };
    p[e.T] = tm;
    p.x += e.normal.x * 1.2;
    p.y += e.normal.y * 1.2;
    p.z += e.normal.z * 1.2;
    tot += 1;
    // Fronts and doors hide an edge only while they are shut. Inside-visible edges are judged with them open.
    if (solids.some((s) => s.id !== self && !SHOW.has(s.id) && contains(s, p))) hit += 1;
  }
  return tot ? hit / tot : 0;
}

for (const part of ["tall", "lower"] as const) {
  const boards = part === "tall" ? tall : lower;
  const dx = part === "lower" ? 523 : 0;
  const dy = part === "lower" ? 30 : 0;
  console.log("\n==== " + part + " exposed ====");
  for (const b of boards) {
    const self = part === "lower" ? `L${b.id}` : b.id;
    // tag lower ids in the solid list? I used raw ids, collision between C19 tall and lower doesn't exist. Both have unique ids. Good.
    // BUT contains() compares s.id !== self. Lower and tall ids don't overlap. OK.
    const lines: string[] = [];
    for (const f of b.faces ?? []) {
      if (!f.id.startsWith("E") || !f.edge) continue;
      const e = edgeWorld(b, f, dx, dy);
      if (e.len < 8) continue;
      const c = covered(b.id, e);
      if (c >= 0.6) continue;
      const mid = {
        x: (e.p0.x + e.p1.x) / 2,
        y: (e.p0.y + e.p1.y) / 2,
        z: (e.p0.z + e.p1.z) / 2,
      };
      mid[e.T] = (e.t0 + e.t1) / 2;
      const where = `x${mid.x.toFixed(0)} y${mid.y.toFixed(0)} z${mid.z.toFixed(0)}`;
      lines.push(`  ${f.id} ${e.normal.label} ${e.len.toFixed(0)}mm @ ${where} cover ${(c * 100).toFixed(0)}%`);
    }
    if (lines.length) console.log(b.id, b.name, "\n" + lines.join("\n"));
  }
}
