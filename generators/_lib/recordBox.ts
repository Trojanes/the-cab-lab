import { dim } from "./dim.ts";

/** Record the six cabinet-frame faces of a board. Values stay identical. */
export function recordBoardBox(
  id: string,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
): { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number } {
  return {
    x0: dim(`${id}.x0`, { x0 }, (t) => t.x0),
    x1: dim(`${id}.x1`, { x1 }, (t) => t.x1),
    y0: dim(`${id}.y0`, { y0 }, (t) => t.y0),
    y1: dim(`${id}.y1`, { y1 }, (t) => t.y1),
    z0: dim(`${id}.z0`, { z0 }, (t) => t.z0),
    z1: dim(`${id}.z1`, { z1 }, (t) => t.z1),
  };
}

/** Re-record faces after a board box was rewritten (kitchen function boards). */
export function refreshBoardBox<B extends { id: string; x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }>(b: B): B {
  Object.assign(b, recordBoardBox(b.id, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1));
  return b;
}
