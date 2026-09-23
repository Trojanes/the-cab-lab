/**
 * LED channels of the bedroom body. Display and machining data only: face
 * features on the boards that already exist, every number through dim().
 *
 *   T3 tops (WARD_L_T3 · WARD_R_T3 · OHC_T3), face A (up):
 *     main    the full width of that T3, LED_GROOVE_WIDTH wide, its back wall
 *             LED_T3_T1_GAP in front of T1's front face — the channel sits on the
 *             strip of T3 that shows in front of T1
 *     branch  one near each end of that T3, LED_T3_BRANCH_WIDTH wide, centre
 *             LED_T3_BRANCH_END_INSET from that end, from the main channel's
 *             back wall to the rear edge (the cable feed)
 *   Nook shelf (WARD_L/R_NOOK), face B (down): one straight channel centred
 *     across the shelf, from LED_NOOK_SHELF_FROM_ROOM_FACE to the rear edge.
 *
 * Everything is LED_GROOVE_DEPTH deep and never through.
 */

import type { Board } from "./types.ts";
import { RULES as R } from "./rules.ts";
import { dim, ref } from "../_lib/dim.ts";
import { addFeature } from "../_lib/model.ts";

const EPS = 1e-6;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export interface T3LedOptions {
  /** Provenance key of T1's front face (cabinet y). */
  t1FrontKey: string;
  /** Rear edge (cabinet y) of the T3 over a cabinet x range, or null when a branch may not go there. */
  rearAt: (x0: number, x1: number) => number | null;
  source: string;
}

/** Cut the LED channels into one T3 top. Skips (with a warning) what the board cannot take. */
export function addT3LedChannels(t3: Board, opts: T3LedOptions, warnings: string[]): void {
  const id = t3.id;
  const K = `${id}.feat.LED_MAIN`;
  const width = dim(`${K}.u1`, { x1: ref(`${id}.x1`), x0: ref(`${id}.x0`) }, (t) => t.x1 - t.x0);
  dim(`${K}.u0`, {}, () => 0, { formula: "0" });
  const v1 = dim(`${K}.v1`, { t1: ref(opts.t1FrontKey), y0: ref(`${id}.y0`), GAP: R.LED_T3_T1_GAP_MM }, (t) => t.t1 - t.y0 - t.GAP);
  const v0 = dim(`${K}.v0`, { v1: ref(`${K}.v1`), W: R.LED_GROOVE_WIDTH_MM }, (t) => t.v1 - t.W);
  if (v0 < -EPS) {
    warnings.push(`${id} LED channel skipped: T1 stands only ${round1(v1 + R.LED_GROOVE_WIDTH_MM.value)} mm behind the T3 front — no room for a ${R.LED_GROOVE_WIDTH_MM.value} mm channel`);
    return;
  }
  addFeature(t3, "A", {
    id: `${id}_LED_MAIN`,
    kind: "tgroove",
    u0: 0,
    u1: round1(width),
    v0: round1(v0),
    v1: round1(v1),
    depth: R.LED_GROOVE_DEPTH_MM.value,
    through: false,
    for: "led",
    key: K,
    source: opts.source,
  });
  t3.notes = [...(t3.notes ?? []), `LED channel on the top: ${R.LED_GROOVE_WIDTH_MM.value} × ${R.LED_GROOVE_DEPTH_MM.value} along the front, ${R.LED_T3_T1_GAP_MM.value} mm in front of T1; ${R.LED_T3_BRANCH_WIDTH_MM.value} wide feed branches to the rear near each end`];

  const BW = R.LED_T3_BRANCH_WIDTH_MM;
  const INSET = R.LED_T3_BRANCH_END_INSET_MM;
  if (width <= 2 * INSET.value + BW.value) {
    warnings.push(`${id} LED feed branches skipped: the board is only ${round1(width)} mm wide`);
    return;
  }
  const ends: Array<[string, (t: Record<string, number>) => number, Record<string, unknown>]> = [
    ["LED_BRANCH_1", (t) => t.INSET, { INSET }],
    ["LED_BRANCH_2", (t) => t.width - t.INSET, { width: ref(`${K}.u1`), INSET }],
  ];
  for (const [name, centre, terms] of ends) {
    const KB = `${id}.feat.${name}`;
    const c = dim(`${KB}.c`, terms as never, centre);
    const u0 = dim(`${KB}.u0`, { c: ref(`${KB}.c`), BW }, (t) => t.c - t.BW / 2);
    const u1 = dim(`${KB}.u1`, { c: ref(`${KB}.c`), BW }, (t) => t.c + t.BW / 2);
    const rear = opts.rearAt(t3.x0 + u0, t3.x0 + u1);
    if (rear == null) {
      warnings.push(`${id} ${name} skipped: no straight rear edge at x ${round1(t3.x0 + u0)} – ${round1(t3.x0 + u1)}`);
      continue;
    }
    const bv0 = dim(`${KB}.v0`, { main: ref(`${K}.v1`) }, (t) => t.main);
    const bv1 = dim(`${KB}.v1`, { rear, y0: ref(`${id}.y0`) }, (t) => t.rear - t.y0, { formula: "rear - y0" });
    if (bv1 - bv0 < EPS) {
      warnings.push(`${id} ${name} skipped: nothing behind the main channel`);
      continue;
    }
    void c;
    addFeature(t3, "A", {
      id: `${id}_${name}`,
      kind: "tgroove",
      u0: round1(u0),
      u1: round1(u1),
      v0: round1(bv0),
      v1: round1(bv1),
      depth: R.LED_GROOVE_DEPTH_MM.value,
      through: false,
      for: "led",
      key: KB,
      source: opts.source,
    });
  }
}

/** One straight LED channel on the underside of a nook shelf, centred across it. */
export function addNookShelfLed(shelf: Board, source: string, warnings: string[]): void {
  const id = shelf.id;
  const K = `${id}.feat.LED`;
  const width = dim(`${K}.width`, { x1: ref(`${id}.x1`), x0: ref(`${id}.x0`) }, (t) => t.x1 - t.x0);
  const depth = dim(`${K}.depth`, { y1: ref(`${id}.y1`), y0: ref(`${id}.y0`) }, (t) => t.y1 - t.y0);
  const v0 = dim(`${K}.v0`, { FROM: R.LED_NOOK_SHELF_FROM_ROOM_FACE_MM }, (t) => t.FROM);
  const v1 = dim(`${K}.v1`, { depth: ref(`${K}.depth`) }, (t) => t.depth);
  if (width < R.LED_GROOVE_WIDTH_MM.value + 20 || v1 - v0 < 20) {
    warnings.push(`${id} LED channel skipped: the shelf is too small for it`);
    return;
  }
  const u0 = dim(`${K}.u0`, { width: ref(`${K}.width`), W: R.LED_GROOVE_WIDTH_MM }, (t) => (t.width - t.W) / 2);
  const u1 = dim(`${K}.u1`, { u0: ref(`${K}.u0`), W: R.LED_GROOVE_WIDTH_MM }, (t) => t.u0 + t.W);
  addFeature(shelf, "B", {
    id: `${id}_LED`,
    kind: "groove",
    u0: round1(u0),
    u1: round1(u1),
    v0: round1(v0),
    v1: round1(v1),
    depth: R.LED_GROOVE_DEPTH_MM.value,
    through: false,
    for: "led",
    key: K,
    source,
  });
  shelf.notes = [...(shelf.notes ?? []), `LED channel on the underside: ${R.LED_GROOVE_WIDTH_MM.value} × ${R.LED_GROOVE_DEPTH_MM.value}, centred, from ${R.LED_NOOK_SHELF_FROM_ROOM_FACE_MM.value} behind the room face to the rear edge`];
}
