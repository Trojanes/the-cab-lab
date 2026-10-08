/**
 * Floor-plan wheel arches in the lounge frame.
 * I and L: a notch in whatever board the box hits, no cover boards. The board's
 * box stays put, so an end panel outside the box is still the full rectangle,
 * and one inside it stays full height with a bite out of the corner.
 * Parallel middle: a top and a front cover in the gap where a box meets the
 * wall. The cabinet's bottom sits on that top cover.
 */
import polygonClipping from "polygon-clipping/dist/polygon-clipping.esm.js";
import { expandBulgeRing } from "../_lib/model.ts";
import type { Board } from "./types.ts";

const { difference } = polygonClipping;

export interface PlanArch {
  id: string;
  x0: number; x1: number;
  y0: number; y1: number;
  z0: number; z1: number;
}

export interface GapCover {
  id: string;
  x0: number; x1: number;
  y0: number; y1: number;
  /** Top of the cover, and the height the middle cabinet stands on. */
  z1: number;
}

const r2 = (n: number) => Math.round(n * 1000) / 1000;

function overlap(a0: number, a1: number, b0: number, b1: number): [number, number] | null {
  const lo = Math.max(Math.min(a0, a1), Math.min(b0, b1));
  const hi = Math.min(Math.max(a0, a1), Math.max(b0, b1));
  return hi - lo > 0.5 ? [lo, hi] : null;
}

/** Covers for the parallel gap, one per arch that reaches the wall inside the gap. The cabinet stands on the highest. */
export function gapCovers(arches: PlanArch[] | undefined, gap0: number, gap1: number, depth: number, height: number, thickness: number): GapCover[] {
  const out: GapCover[] = [];
  for (const a of arches || []) {
    const x = overlap(gap0, gap1, a.x0, a.x1);
    const y = overlap(0, depth, a.y0, a.y1);
    const z1 = Math.min(a.z1, height - thickness);
    if (!x || !y || !(z1 > thickness) || y[1] < depth - 1) continue;
    out.push({ id: a.id || `arch-${out.length + 1}`, x0: r2(x[0]), x1: r2(x[1]), y0: r2(y[0]), y1: r2(y[1]), z1: r2(z1) });
  }
  return out;
}

type Ring = [number, number][];

function uv(p: { x?: number; y?: number; z?: number }, plane: Board["profilePlane"]): [number, number] {
  if (plane === "XY") return [p.x ?? 0, p.y ?? 0];
  if (plane === "XZ") return [p.x ?? 0, p.z ?? 0];
  return [p.y ?? 0, p.z ?? 0];
}

function fromUv(u: number, v: number, plane: Board["profilePlane"]): { x?: number; y?: number; z?: number } {
  if (plane === "XY") return { x: r2(u), y: r2(v) };
  if (plane === "XZ") return { x: r2(u), z: r2(v) };
  return { y: r2(u), z: r2(v) };
}

function boardRing(board: Board): Ring {
  const pv = board.profileVector;
  if (pv && pv.length >= 4) {
    if (pv.some((p) => Math.abs(Number((p as { bulge?: number }).bulge) || 0) > 1e-9)) {
      const raw = pv.map((p) => {
        const [u, v] = uv(p, board.profilePlane);
        return { u, v, b: Number((p as { bulge?: number }).bulge) || 0 };
      });
      const a = raw[0]!;
      const c = raw[raw.length - 1]!;
      if (raw.length > 2 && a.u === c.u && a.v === c.v) raw.pop();
      return expandBulgeRing(raw).map((p) => [p.u, p.v]);
    }
    return pv.map((p) => uv(p, board.profilePlane));
  }
  const plane = board.profilePlane;
  if (plane === "YZ") return [[board.y0, board.z0], [board.y1, board.z0], [board.y1, board.z1], [board.y0, board.z1]];
  if (plane === "XZ") return [[board.x0, board.z0], [board.x1, board.z0], [board.x1, board.z1], [board.x0, board.z1]];
  return [[board.x0, board.y0], [board.x1, board.y0], [board.x1, board.y1], [board.x0, board.y1]];
}

function close(ring: Ring): Ring {
  if (!ring.length) return ring;
  const a = ring[0]!;
  const b = ring[ring.length - 1]!;
  if (a[0] === b[0] && a[1] === b[1]) return ring;
  return [...ring, [a[0], a[1]]];
}

function area(ring: Ring): number {
  let s = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return Math.abs(s) / 2;
}

/** Bite each arch out of the boards it crosses. The box of the board does not change. */
export function notchPlanArches(boards: Board[], arches: PlanArch[] | undefined): void {
  const list = (arches || []).filter((a) => a.x1 > a.x0 && a.y1 > a.y0 && a.z1 > a.z0);
  if (!list.length) return;
  for (const board of boards) {
    if (board.boardType === "avoidance_top" || board.boardType === "avoidance_front") continue;
    let ring = boardRing(board);
    const before = area(ring);
    for (const arch of list) {
      const hit = hitOf(board, arch);
      if (!hit) continue;
      const cut = difference([close(ring)], [close(hit)]);
      let best: Ring | null = null;
      let bestArea = 0;
      for (const poly of cut) {
        const outer = poly[0];
        if (!outer || outer.length < 4) continue;
        const a = area(outer);
        if (a > bestArea) { best = outer; bestArea = a; }
      }
      if (best && before - bestArea > 1) ring = best;
    }
    if (Math.abs(area(ring) - before) <= 1) continue;
    const open = ring.slice();
    const a = open[0]!;
    const b = open[open.length - 1]!;
    if (a[0] === b[0] && a[1] === b[1]) open.pop();
    const pts = open.map(([u, v]) => fromUv(u, v, board.profilePlane));
    pts.push(fromUv(open[0]![0], open[0]![1], board.profilePlane));
    board.profileVector = pts;
  }
}

function hitOf(board: Board, arch: PlanArch): Ring | null {
  const plane = board.profilePlane;
  if (plane === "YZ") {
    if (!overlap(board.x0, board.x1, arch.x0, arch.x1)) return null;
    const y = overlap(board.y0, board.y1, arch.y0, arch.y1);
    const z = overlap(board.z0, board.z1, arch.z0, arch.z1);
    if (!y || !z) return null;
    return [[y[0], z[0]], [y[1], z[0]], [y[1], z[1]], [y[0], z[1]]];
  }
  if (plane === "XZ") {
    if (!overlap(board.y0, board.y1, arch.y0, arch.y1)) return null;
    const x = overlap(board.x0, board.x1, arch.x0, arch.x1);
    const z = overlap(board.z0, board.z1, arch.z0, arch.z1);
    if (!x || !z) return null;
    return [[x[0], z[0]], [x[1], z[0]], [x[1], z[1]], [x[0], z[1]]];
  }
  if (!overlap(board.z0, board.z1, arch.z0, arch.z1)) return null;
  const x = overlap(board.x0, board.x1, arch.x0, arch.x1);
  const y = overlap(board.y0, board.y1, arch.y0, arch.y1);
  if (!x || !y) return null;
  return [[x[0], y[0]], [x[1], y[0]], [x[1], y[1]], [x[0], y[1]]];
}
