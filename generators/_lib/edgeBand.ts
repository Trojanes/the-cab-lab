/**
 * Edge banding on a board's outline.
 *
 * Storage is one optional `finish.edgeBand` on the edge face E<i>. No record
 * means that edge is not banded. The export (`edgeBandPart`) is the outline
 * in board-local (u, v) plus a sparse list keyed by the same segment index
 * the SVG path uses: edge i runs outline[i] → outline[(i+1) % n].
 *
 * Which edges receive a band is a later decision. Nothing here chooses them.
 */
import { faceOf, localOutline, planeAxes, rectOutline, type Axis, type Board, type EdgeBand } from "./model.ts";

/** One banded outline segment, as every client reads it. */
export interface EdgeBandMark {
  /** Outline segment index. Same i as face id E<i>. */
  i: number;
  /** Tape thickness, millimetres. */
  t: number;
  colour?: string;
}

/**
 * One board, flat, for export. `axes` names which cabinet axes u and v are.
 * `outline` is millimetres from the board's (u0, v0) corner — the same point
 * list `localOutline` returns. Screen Y-down is a view transform, not stored.
 */
export interface EdgeBandPart {
  id: string;
  axes: { u: Axis; v: Axis };
  outline: [number, number][];
  edgeBand: EdgeBandMark[];
}

const AXIS: Record<"x" | "y" | "z", Axis> = { x: "X", y: "Y", z: "Z" };

function outlineOf(b: Board): [number, number][] {
  return localOutline(b) ?? rectOutline(b);
}

/** Write or clear the band on outline edge i. Clearing leaves any face colour in place. */
export function setEdgeBand(b: Board, i: number, band: EdgeBand | null): void {
  if (!Number.isInteger(i) || i < 0) throw new Error(`${b.id}: edge ${i} is not an outline index`);
  const n = outlineOf(b).length;
  if (i >= n) throw new Error(`${b.id}: edge ${i} is past the outline (${n} edges)`);
  const face = faceOf(b, `E${i}`);
  if (!band) {
    if (!face.finish?.edgeBand) return;
    delete face.finish.edgeBand;
    if (face.finish.colour == null) delete face.finish;
    return;
  }
  if (!Number.isFinite(band.thickness) || band.thickness <= 0) {
    throw new Error(`${b.id}.E${i}: edge band thickness must be millimetres above 0`);
  }
  const stored: EdgeBand = { thickness: band.thickness };
  if (band.colour) stored.colour = band.colour;
  face.finish = { ...face.finish, edgeBand: stored };
}

/** The export record. Edges without a band are absent from `edgeBand`. */
export function edgeBandPart(b: Board): EdgeBandPart {
  const [u, v] = planeAxes(b.profilePlane);
  const outline = outlineOf(b);
  const edgeBand: EdgeBandMark[] = [];
  for (const f of b.faces ?? []) {
    const band = f.finish?.edgeBand;
    if (!band || !f.id.startsWith("E")) continue;
    const i = Number(f.id.slice(1));
    if (!Number.isInteger(i) || i < 0 || i >= outline.length) {
      throw new Error(`${b.id}.${f.id}: edge band index is outside the outline`);
    }
    const mark: EdgeBandMark = { i, t: band.thickness };
    if (band.colour) mark.colour = band.colour;
    edgeBand.push(mark);
  }
  edgeBand.sort((a, c) => a.i - c.i);
  return { id: b.id, axes: { u: AXIS[u], v: AXIS[v] }, outline, edgeBand };
}

export function edgeBandParts(boards: Board[]): EdgeBandPart[] {
  return boards.map(edgeBandPart);
}
