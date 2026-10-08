/**
 * Ensuite as drawn — a fixed copy of the two ensuite cabinets in the Fusion
 * model (Main_Design_second_van.step): the lower vanity cabinet and the tall
 * "through" cabinet. Every board, notch, opening, hinge cup and groove is read
 * from the drawing (drawing.json), not computed: nothing here is a formula,
 * and nothing can be resized. It is the reference the parametric version will
 * be checked against.
 *
 * Cabinet frame (core contract): x left → right seen from the front, y from the
 * front carcass face (0) toward the back, z up; fronts sit at negative y.
 *
 *   part "lower"  964 × 434 × 890. Left bay: a lid at 383–398 over the cavity,
 *                 the left side and the back stile cut away below it. Right bay:
 *                 open to the floor. Two doors.
 *   part "tall"   523 × 464 × 1963. A lid at 383–398 over the cavity (inferred:
 *                 the STEP has no body for it), 398–697 behind a fixed panel
 *                 with a 427 × 200 R30 access opening, the base top at 697;
 *                 stiles from 398; an 80 filler at the wall side; two doors above.
 */
import { addFeature, annotate, attachFaces, edgeFaces, expandBulgeRing, planeAxes, type AxisDir, type Board, type Face, type FaceFeature, type Plane, type ProfilePoint } from "../_lib/model.ts";
import { applyDoorSides, carcassColourOf, doorColourOf } from "../_lib/finish.ts";
import { applyMilling } from "../_lib/milling.ts";
import { setEdgeBand } from "../_lib/edgeBand.ts";
import raw from "./drawing.json" with { type: "json" };

export type EnsuitePart = "lower" | "tall";

export interface EnsuiteDrawingParams {
  part?: EnsuitePart;
  carcassColor?: string;
  carcassColorName?: string;
  doorColor?: string;
  doorColorName?: string;
  doorSides?: string;
}

interface DrawnFeature {
  face: "A" | "B";
  kind: string;
  center?: [number, number];
  diameter?: number;
  u0?: number;
  u1?: number;
  v0?: number;
  v1?: number;
  depth: number;
  loop?: Array<[number, number, number]>;
}

interface DrawnBoard {
  id: string;
  comp: string;
  name: string;
  category: string;
  plane: Plane;
  t: number;
  box: [number, number, number, number, number, number];
  outline: Array<[number, number, number]>;
  holes: Array<Array<[number, number, number]>>;
  features: DrawnFeature[];
  moved?: number[];
  /** Not in the STEP: worked out from the boards around it (the reason). */
  inferred?: string;
}

interface Drawing {
  source: string;
  corrections: Record<EnsuitePart, string[]>;
  size: Record<EnsuitePart, { W: number; D: number; H: number }>;
  parts: Record<EnsuitePart, DrawnBoard[]>;
}

const DRAWING = raw as unknown as Drawing;

export const ENSUITE_DRAWING_SOURCE = DRAWING.source;

export function partOf(params: EnsuiteDrawingParams | null | undefined): EnsuitePart {
  return params && params.part === "tall" ? "tall" : "lower";
}

/** The fixed outer size of a part (carcass; the fronts stand 16 in front of y = 0). */
export function ensuiteDrawingSize(part: EnsuitePart): { W: number; D: number; H: number } {
  return { ...DRAWING.size[part] };
}

const round1 = (n: number) => Math.round(n * 10) / 10;

const AXES: Record<Plane, [string, string]> = { XY: ["x", "y"], XZ: ["x", "z"], YZ: ["y", "z"] };
const THICK: Record<Plane, "X" | "Y" | "Z"> = { XY: "Z", XZ: "Y", YZ: "X" };

function ring(plane: Plane, pts: Array<[number, number, number]>): ProfilePoint[] {
  const [U, V] = AXES[plane];
  return pts.map(([u, v, bulge]) => {
    const p: Record<string, number> = { [U]: u, [V]: v };
    if (bulge) p.bulge = bulge;
    return p as unknown as ProfilePoint;
  });
}

/**
 * Edge tape, 1 mm, on outline edges only (a cutout rim, such as the access
 * opening, is not an outline edge). Outside, where the room sees the edge with
 * the doors shut: door colour. Inside, where it shows once a door is open or
 * through the access opening: carcass colour. Not banded: the floor, the rear
 * wall, the tall cabinet's left wall, the ceiling (the side panel's top is the
 * exception — it is 2 mm under a 1965 roof and is still taped), a notch or
 * tongue shorter than 40 mm, and an edge buried against another board.
 */
const EDGE_BAND_MM = 1;
const EDGE_BAND_MIN_MM = 40;

function edgeLength(f: Face): number {
  const e = f.edge!;
  return Math.hypot(e.to[0] - e.from[0], e.to[1] - e.from[1]);
}

function edgeMid(b: Board, f: Face): { x: number; y: number; z: number } {
  const [U, V] = planeAxes(b.profilePlane);
  const p = { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 };
  p[U] = b[`${U}0`] + (f.edge!.from[0] + f.edge!.to[0]) / 2;
  p[V] = b[`${V}0`] + (f.edge!.from[1] + f.edge!.to[1]) / 2;
  return p;
}

function band(b: Board, f: Face, colour: string) {
  setEdgeBand(b, Number(f.id.slice(1)), { thickness: EDGE_BAND_MM, colour });
}

/** Every outline edge of this normal longer than a notch cheek. */
function bandLong(b: Board, normal: AxisDir, colour: string, min = EDGE_BAND_MIN_MM) {
  for (const f of edgeFaces(b)) {
    if (f.normal === normal && edgeLength(f) >= min) band(b, f, colour);
  }
}

function bandAll(b: Board, colour: string) {
  for (const f of edgeFaces(b)) band(b, f, colour);
}

/**
 * Show edges (door colour) and the edges seen inside (carcass colour).
 * Board ids are the drawing's. A long edge is one outline segment: a shelf
 * crossing in front of a stile does not split the tape.
 */
function bandEnsuiteEdges(boards: Board[], part: EnsuitePart, door: string, carcass: string) {
  const byId = new Map(boards.map((b) => [b.id, b]));
  const at = (id: string) => byId.get(id);

  if (part === "tall") {
    // Right side panel (door stock): top, asked for explicitly, and the front
    // edge beside the doors. The back is the rear wall; the bottom is in the floor.
    const side = at("C74");
    if (side) {
      bandLong(side, "+Z", door);
      bandLong(side, "-Y", door);
      // Below the cavity lid the panel is only a front strip; its rear edge looks into the cavity.
      for (const f of edgeFaces(side)) {
        if (f.normal === "+Y" && edgeLength(f) >= EDGE_BAND_MIN_MM && edgeMid(side, f).y < 400) band(side, f, carcass);
      }
    }
    // Fixed panel with the access opening: the top edge, between the panel and the door.
    const fixed = at("C76");
    if (fixed) bandLong(fixed, "+Z", door);
    // Wall-side filler, the left strip in the door plane: all four edges.
    const filler = at("C95");
    if (filler) bandAll(filler, door);
    for (const id of ["C98", "C99"]) {
      const doorBoard = at(id);
      if (doorBoard) bandAll(doorBoard, door);
    }
    // Inside, once a door is open or through the access opening.
    for (const id of ["C77", "C78"]) {
      const stile = at(id);
      if (stile) bandLong(stile, "-Y", carcass); // front of a back stile
    }
    const rightFront = at("C79");
    if (rightFront) {
      bandLong(rightFront, "-Y", carcass);
      bandLong(rightFront, "+Y", carcass);
    }
    // Left front stile's front sits behind the filler; only its back edge shows.
    const leftFront = at("C80");
    if (leftFront) bandLong(leftFront, "+Y", carcass);
    const shelf = at("C81");
    if (shelf) bandLong(shelf, "-Y", carcass);
    const topStrip = at("C83");
    if (topStrip) {
      bandLong(topStrip, "-Y", carcass);
      bandLong(topStrip, "+Y", carcass);
    }
    for (const id of ["C86", "C87", "C88", "C89", "C90", "C91", "C92", "C93", "C94"]) {
      const rail = at(id);
      if (rail) bandLong(rail, "-Z", carcass);
    }
    const fillerStile = at("C96");
    if (fillerStile) bandLong(fillerStile, "+Y", carcass);
    return;
  }

  for (const id of ["C38", "C39"]) {
    const doorBoard = at(id);
    if (doorBoard) bandAll(doorBoard, door);
  }
  // End panels: the front edge beside the doors, and the top edge of the counter.
  for (const id of ["C19", "C20"]) {
    const side = at(id);
    if (!side) continue;
    bandLong(side, "-Y", door);
    bandLong(side, "+Z", door);
  }
  // Left end panel is cut away under the cavity lid; that rear edge looks into the cavity.
  const leftSide = at("C20");
  if (leftSide) {
    for (const f of edgeFaces(leftSide)) {
      if (f.normal === "+Y" && edgeLength(f) >= EDGE_BAND_MIN_MM && edgeMid(leftSide, f).y < 200) band(leftSide, f, carcass);
    }
  }
  // Open top (no deck): the edges around the opening are the counter the room looks down on.
  const topBack = at("C24");
  if (topBack) bandLong(topBack, "-Y", door);
  const topFront = at("C25");
  if (topFront) {
    bandLong(topFront, "+Y", door);
    bandLong(topFront, "-Y", carcass); // behind the doors
  }
  const rightBatten = at("C26");
  if (rightBatten) bandLong(rightBatten, "-X", door);
  const leftBatten = at("C27");
  if (leftBatten) bandLong(leftBatten, "+X", door);
  const divider = at("C21");
  if (divider) {
    bandLong(divider, "+Z", door); // top, flush with the counter
    bandLong(divider, "-Y", carcass);
  }
  // A rail that runs out to the right-hand face shows there. The left face is against the tall cabinet.
  const width = 964;
  for (const b of boards) {
    if (b.category === "door" || b.category === "side_panel") continue;
    for (const f of edgeFaces(b)) {
      if (f.normal !== "+X" || edgeLength(f) < 30) continue;
      if (edgeMid(b, f).x >= width - 1) band(b, f, door);
    }
  }
  for (const id of ["C22"]) {
    const rail = at(id);
    if (rail) bandLong(rail, "-Z", carcass);
  }
  const bottomBack = at("C23");
  if (bottomBack) bandLong(bottomBack, "+Z", carcass);
  const bottomFront = at("C28");
  if (bottomFront) {
    bandLong(bottomFront, "-Y", carcass);
    bandLong(bottomFront, "+Y", carcass);
  }
  for (const id of ["C30", "C32"]) {
    const stile = at(id);
    if (!stile) continue;
    bandLong(stile, "-Y", carcass);
    bandLong(stile, "+Y", carcass);
  }
  for (const id of ["C31", "C33"]) {
    const stile = at(id);
    if (stile) bandLong(stile, "-Y", carcass);
  }
  for (const id of ["C34", "C35"]) {
    const stile = at(id);
    if (!stile) continue;
    bandLong(stile, "-Y", carcass);
    bandLong(stile, "+Z", carcass);
  }
  const lid = at("C37");
  if (lid) bandLong(lid, "-Y", carcass);
}

/** Door stock: 16 mm boards. Their colour face is the one looking out of the cabinet. */
function colourFace(d: DrawnBoard, part: EnsuitePart): "A" | "B" {
  // A is +thickness axis, B is −. Fronts (thin in y) show B (−y). The tall cabinet's
  // side panel (thin in x, at the right end) shows A (+x).
  if (d.plane === "YZ") return d.box[0] > DRAWING.size[part].W / 2 ? "A" : "B";
  if (d.plane === "XY") return "A";
  return "B";
}

export function generateEnsuiteDrawing(params: EnsuiteDrawingParams = {}, _options: { layout?: unknown } = {}) {
  const part = partOf(params);
  const size = ensuiteDrawingSize(part);
  const carcass = carcassColourOf(params);
  const door = doorColourOf(params);
  const warnings: string[] = [];
  const boards: Board[] = [];

  for (const d of DRAWING.parts[part]) {
    const [x0, x1, y0, y1, z0, z1] = d.box;
    const isDoorStock = d.t >= 15.95;
    const b: Board = {
      id: d.id,
      name: d.name,
      category: d.category,
      boardType: d.category,
      role: d.category,
      materialThickness: d.t,
      profilePlane: d.plane,
      thicknessAxis: THICK[d.plane],
      x0, x1, y0, y1, z0, z1,
      source: "ensuiteDrawing",
      notes: [`Drawing: ${d.comp}`],
      stock: { kind: isDoorStock ? "door" : "carcass", thickness: d.t, colour: isDoorStock ? door : carcass },
    };
    const plain = d.outline.length === 4 && d.outline.every((p) => !p[2]);
    if (!plain) b.profileVector = ring(d.plane, d.outline);
    if (d.outline.some((p) => p[2])) b.tessellated = true;
    if (d.inferred) b.notes!.push(`Inferred: ${d.inferred}`);
    if (d.moved) b.notes!.push(`Moved ${d.moved.join(" / ")} mm (x / y / z) to line up with the cabinet; see drawing.json corrections`);
    boards.push(b);
  }
  attachFaces(boards);

  DRAWING.parts[part].forEach((d, i) => {
    const b = boards[i]!;
    d.features.forEach((f, k) => {
      const id = `${f.kind[0]!.toUpperCase()}${k + 1}`;
      const feat: FaceFeature = { id, kind: f.kind, depth: f.depth, source: "drawing" };
      // ⌀35 cups on a door's inside face are hinge cups.
      if (f.kind === "hole" && f.diameter === 35 && d.category === "door") feat.for = "hinge";
      if (f.kind === "hole" && f.center && f.diameter) {
        feat.center = f.center;
        feat.diameter = f.diameter;
      } else {
        feat.u0 = f.u0;
        feat.u1 = f.u1;
        feat.v0 = f.v0;
        feat.v1 = f.v1;
        if (f.loop) {
          feat.loop = expandBulgeRing(f.loop.map(([u, v, bulge]) => ({ u, v, b: bulge }))).map((p) => [p.u, p.v] as [number, number]);
          if (f.loop.some((p) => p[2])) b.tessellated = true;
        }
      }
      addFeature(b, f.face, feat);
    });
    // Openings through the board (the access opening, a door's finger slot): through cutouts, listed on A.
    const [U, V] = AXES[d.plane];
    const u0 = (b as unknown as Record<string, number>)[`${U}0`]!;
    const v0 = (b as unknown as Record<string, number>)[`${V}0`]!;
    d.holes.forEach((h, k) => {
      const loop = expandBulgeRing(h.map(([u, v, bulge]) => ({ u: u - u0, v: v - v0, b: bulge }))).map((p) => [round1(p.u), round1(p.v)] as [number, number]);
      const us = loop.map((p) => p[0]);
      const vs = loop.map((p) => p[1]);
      addFeature(b, "A", { id: `O${k + 1}`, kind: "cutout", through: true, u0: Math.min(...us), u1: Math.max(...us), v0: Math.min(...vs), v1: Math.max(...vs), loop, source: "drawing" });
      if (h.some((p) => p[2])) b.tessellated = true;
    });
    if (b.stock?.kind === "door") {
      const face = colourFace(d, part);
      annotate(b, face, { semantic: d.category === "door" ? "front" : face === "A" && d.plane === "YZ" ? "side" : "front", visible: true, finish: { colour: door } });
    }
  });
  applyDoorSides(boards, params);
  bandEnsuiteEdges(boards, part, door, carcass);
  const milling = applyMilling(boards);

  return {
    params: { part, width: size.W, depth: size.D, height: size.H, source: DRAWING.source, corrections: DRAWING.corrections[part] ?? [] },
    zones: [],
    boards,
    joints: [],
    layout: {},
    milling,
    validation: { errors: [] as string[], warnings },
    debug: { boardFrame: "final" },
  };
}
