/**
 * The Cab Lab model — module / board / face (see docs/model-spec.md).
 *
 *   module  (模块层)  job.cabinets[i] = { moduleId, params, pose } → one generator run
 *   board   (板件层)  one piece of stock: role id, AABB in the cabinet frame, outline
 *   face    (面层)    A / B (the two big faces) + E<i> (one per outline edge);
 *                     every machining feature, colour and joint hangs on a face
 *
 * The outline is the geometric truth: anything that changes the cut shape
 * (tongue, notch, roof cut) lives in the outline, and the edge faces only tag
 * which segments belong to it. Anything that does not change the outline
 * (groove, hole, T-groove, through cutout) is a FaceFeature on A or B in
 * face-local 2D. Nothing here does geometry: `facesOf()` only reads the
 * board's box and outline and names what is already there.
 *
 * Face ids are geometric, not semantic: A = the face on the +thicknessAxis
 * side (x1 / y1 / z1), B = the -side (x0 / y0 / z0). Modules add `semantic`
 * ("front", "outside" …) as an annotation; algorithms never key on it.
 */

export type Plane = "XY" | "XZ" | "YZ";
export type Axis = "X" | "Y" | "Z";
export type AxisLower = "x" | "y" | "z";
export type AxisDir = "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z";
export type FaceId = "A" | "B" | `E${number}`;

export type ProfilePoint =
  | { x: number; y: number }
  | { y: number; z: number }
  | { x: number; z: number };

/** Which sheet a board is cut from. `kind` matches job.stock (carcass / partition / door). */
export interface Stock {
  kind: "carcass" | "partition" | "door" | string;
  thickness: number;
  colour?: string;
  /** Door stock: 1 = colour outside only (back = carcass colour), 2 = colour both faces (_lib/finish.ts). */
  sides?: 1 | 2;
}

/**
 * One machining feature on a face, in face-local 2D: `u` / `v` are the
 * board's in-plane axes (see `planeAxes`), measured from the board's
 * (`u0`, `v0`) faces. A and B share the same (u, v) frame so a through
 * feature reads the same from either side; CNC flips the board, not the numbers.
 */
export interface FaceFeature {
  id: string;
  /** groove / tgroove / hole / cutout — face features. tongue / notch — tags on edge faces. */
  kind: "groove" | "tgroove" | "hole" | "cutout" | "tongue" | "notch" | string;
  u0?: number;
  u1?: number;
  v0?: number;
  v1?: number;
  center?: [number, number];
  diameter?: number;
  /** Corner radius of a rounded slot. */
  radius?: number;
  /** Into the board along -normal. Omitted on through features and tags. */
  depth?: number;
  through?: boolean;
  /** The board (or hardware) this feature exists for: the divider a groove receives, the panel a tongue enters. */
  for?: string;
  /** Provenance key prefix (`BP.feat.BG_D0`); entries `${key}.x0` … may exist in debug.provenance. */
  key?: string;
  source?: string;
}

/**
 * Tape on one outline edge. Absent on a face means that edge is not banded.
 * `setEdgeBand` / `edgeBandPart` in `edgeBand.ts` are the only writers and the export shape.
 */
export interface EdgeBand {
  /** Tape thickness, millimetres. */
  thickness: number;
  /** Catalogue colour name. Omitted when the edge takes the board face colour. */
  colour?: string;
}

export interface Face {
  id: FaceId;
  /** `${boardId}.${faceId}` */
  key: string;
  normal: AxisDir | [number, number, number];
  /** A / B: the provenance key of the plane (`D0.x1`). */
  planeKey?: string;
  /** E<i>: the outline edge indices this face covers (one today; kept as a list for merged collinear edges). */
  segments?: number[];
  /** E<i>: the edge in board-local (u, v). */
  edge?: { from: [number, number]; to: [number, number] };
  /** Module annotation only: front / back / top / bottom / inside / outside … */
  semantic?: string;
  /** Exposed after assembly, when the module knows. */
  visible?: boolean;
  /** `grain`: board-local axis the wood grain runs along on a colour face (generators/_lib/grain.ts). */
  finish?: { colour?: string; edgeBand?: EdgeBand; grain?: "u" | "v" };
  features: FaceFeature[];
}

/**
 * Board record every generator emits. Field names are the ones the renderer,
 * bench and pins already read; `role` / `stock` / `faces` are the model layer.
 */
export interface Board {
  id: string;
  name: string;
  category: string;
  boardType: string;
  materialThickness: number;
  profilePlane: Plane;
  thicknessAxis: Axis;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  source?: string;
  notes?: string[];
  /** Outline as emitted: cabinet frame (XY / XZ aligned to the box; YZ cabinet-local). */
  profileVector?: ProfilePoint[];
  /** Closed loops cut out of the outline, same coordinates as `profileVector`. */
  profileHoles?: ProfilePoint[][];
  /** Stacked XY extrusions (a rebated opening). Each slab is already in cabinet XY. */
  slabs?: Array<{ outline: ProfilePoint[]; holes?: ProfilePoint[][]; z0: number; z1: number }>;
  /** Board-local YZ outline (origin at y0 / z0); may dip below 0 (a tongue). */
  cutProfileVector?: Array<{ y: number; z: number }>;
  profileFeatures?: Array<Record<string, unknown>>;
  /** Same as `category`; the model-layer name. */
  role?: string;
  stock?: Stock;
  faces?: Face[];
  /** The big face up on the CNC: all partial-depth work is on it, through work is listed on it (_lib/milling.ts). */
  milling?: "A" | "B";
}

export interface FaceRef {
  board: string;
  faces: FaceId[];
}

export interface Joint {
  id: string;
  kind: "butt" | "tongue_groove" | "face_contact" | string;
  a: FaceRef;
  b: FaceRef;
  hardware?: string[];
  rule?: string;
}

// --- frames ------------------------------------------------------------------

/** In-plane axes (u, v) then the thickness axis, lowercase for property access. */
export function planeAxes(plane: Plane): [AxisLower, AxisLower, AxisLower] {
  if (plane === "YZ") return ["y", "z", "x"];
  if (plane === "XZ") return ["x", "z", "y"];
  return ["x", "y", "z"];
}

/** Board-local (u, v) outline without the closing duplicate, or null for a plain box. */
export function localOutline(b: Board): [number, number][] | null {
  const [U, V] = planeAxes(b.profilePlane);
  let pts: [number, number][] | null = null;
  const pv = b.profileVector && b.profileVector.length >= 4 ? (b.profileVector as Array<Record<string, number>>) : null;
  if (b.profilePlane === "YZ") {
    if (pv) pts = pv.map((p) => [Number(p.y) - b.y0, Number(p.z) - b.z0]);
    else if (b.cutProfileVector && b.cutProfileVector.length >= 4) pts = b.cutProfileVector.map((p) => [p.y, p.z]);
  } else if (pv) {
    // XY / XZ outlines are aligned so their minimum meets the box (boardGeom.js does the same when drawing).
    const mu = Math.min(...pv.map((p) => Number(p[U])));
    const mv = Math.min(...pv.map((p) => Number(p[V])));
    pts = pv.map((p) => [Number(p[U]) - mu, Number(p[V]) - mv]);
  }
  if (!pts) return null;
  const out = pts.slice();
  const first = out[0]!;
  const last = out[out.length - 1]!;
  if (out.length > 2 && Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) out.pop();
  return out.length >= 3 ? out : null;
}

/** Rectangle outline (u0 .. u1, v0 .. v1 local) for a board without one. */
export function rectOutline(b: Board): [number, number][] {
  const [U, V] = planeAxes(b.profilePlane);
  const w = b[`${U}1`] - b[`${U}0`];
  const h = b[`${V}1`] - b[`${V}0`];
  return [[0, 0], [w, 0], [w, h], [0, h]];
}

function signedArea(pts: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const [x0, y0] = pts[i]!;
    const [x1, y1] = pts[(i + 1) % pts.length]!;
    s += x0 * y1 - x1 * y0;
  }
  return s / 2;
}

const AXIS_UPPER: Record<AxisLower, Axis> = { x: "X", y: "Y", z: "Z" };

/** Outward normal of an outline edge as a world direction; a vector for slanted edges (a roof cut). */
export function edgeNormal(plane: Plane, from: [number, number], to: [number, number], ccw: boolean): AxisDir | [number, number, number] {
  const [U, V] = planeAxes(plane);
  const du = to[0] - from[0];
  const dv = to[1] - from[1];
  // CCW polygon: outward = (dv, -du); CW: the opposite.
  let nu = ccw ? dv : -dv;
  let nv = ccw ? -du : du;
  const len = Math.hypot(nu, nv) || 1;
  nu /= len;
  nv /= len;
  const eps = 1e-9;
  if (Math.abs(nv) < eps) return `${nu > 0 ? "+" : "-"}${AXIS_UPPER[U]}` as AxisDir;
  if (Math.abs(nu) < eps) return `${nv > 0 ? "+" : "-"}${AXIS_UPPER[V]}` as AxisDir;
  const vec: [number, number, number] = [0, 0, 0];
  const idx: Record<AxisLower, number> = { x: 0, y: 1, z: 2 };
  vec[idx[U]] = nu;
  vec[idx[V]] = nv;
  return vec;
}

// --- faces -----------------------------------------------------------------------

/** Derive A, B and E<i> from the board's box and outline. Features start empty. */
export function facesOf(b: Board): Face[] {
  const [, , T] = planeAxes(b.profilePlane);
  const t = AXIS_UPPER[T];
  const faces: Face[] = [
    { id: "A", key: `${b.id}.A`, normal: `+${t}` as AxisDir, planeKey: `${b.id}.${T}1`, features: [] },
    { id: "B", key: `${b.id}.B`, normal: `-${t}` as AxisDir, planeKey: `${b.id}.${T}0`, features: [] },
  ];
  const outline = localOutline(b) ?? rectOutline(b);
  const ccw = signedArea(outline) > 0;
  for (let i = 0; i < outline.length; i += 1) {
    const from = outline[i]!;
    const to = outline[(i + 1) % outline.length]!;
    faces.push({
      id: `E${i}`,
      key: `${b.id}.E${i}`,
      normal: edgeNormal(b.profilePlane, from, to, ccw),
      segments: [i],
      edge: { from: [from[0], from[1]], to: [to[0], to[1]] },
      features: [],
    });
  }
  return faces;
}

/** Give every board its faces (in place) and return the list. */
export function attachFaces<B extends Board>(boards: B[]): B[] {
  for (const b of boards) b.faces = facesOf(b);
  return boards;
}

export function faceOf(b: Board, id: FaceId): Face {
  const f = (b.faces ?? (b.faces = facesOf(b))).find((x) => x.id === id);
  if (!f) throw new Error(`${b.id}: no face ${id}`);
  return f;
}

/** Push a feature onto a face and return it. */
export function addFeature(b: Board, faceId: FaceId, feature: FaceFeature): FaceFeature {
  faceOf(b, faceId).features.push(feature);
  return feature;
}

/** Edge faces (E<i>) of a board. */
export function edgeFaces(b: Board): Face[] {
  return (b.faces ?? (b.faces = facesOf(b))).filter((f) => f.id.startsWith("E"));
}

/** Edge faces whose midpoint lies inside a board-local (u, v) box. */
export function edgeFacesIn(b: Board, box: { u0: number; u1: number; v0: number; v1: number }): Face[] {
  return edgeFaces(b).filter((f) => {
    const mu = (f.edge!.from[0] + f.edge!.to[0]) / 2;
    const mv = (f.edge!.from[1] + f.edge!.to[1]) / 2;
    return mu >= box.u0 && mu <= box.u1 && mv >= box.v0 && mv <= box.v1;
  });
}

/** Edge faces with a given outward direction. */
export function edgeFacesByNormal(b: Board, normal: AxisDir): Face[] {
  return edgeFaces(b).filter((f) => f.normal === normal);
}

/**
 * Edge faces that form the board's outer boundary in a direction: the ones
 * with that normal lying on the outline's extreme (a divider's front edge,
 * not the tongue side or a step that happens to face the same way).
 */
export function boundaryEdgeFaces(b: Board, normal: AxisDir, tol = 0.01): Face[] {
  const [U, V] = planeAxes(b.profilePlane);
  const axis = normal[1]!.toLowerCase() as AxisLower;
  const c = axis === U ? 0 : axis === V ? 1 : -1;
  if (c < 0) return [];
  const all = edgeFaces(b);
  const coords = all.flatMap((f) => [f.edge!.from[c], f.edge!.to[c]]);
  const extreme = normal[0] === "+" ? Math.max(...coords) : Math.min(...coords);
  return all.filter((f) => f.normal === normal && Math.abs(f.edge!.from[c] - extreme) <= tol && Math.abs(f.edge!.to[c] - extreme) <= tol);
}

/**
 * Tag every edge face inside `box` with a tongue / notch feature (the outline
 * already has the shape; this only names it). Returns the tagged face ids.
 */
export function tagEdges(
  b: Board,
  kind: "tongue" | "notch",
  box: { u0: number; u1: number; v0: number; v1: number },
  meta: { id: string; for?: string; key?: string; source?: string },
): FaceId[] {
  const hit = edgeFacesIn(b, box);
  for (const f of hit) f.features.push({ kind, ...meta });
  return hit.map((f) => f.id);
}

/** Set a face's annotation fields without touching its features. */
export function annotate(b: Board, faceId: FaceId, a: Partial<Pick<Face, "semantic" | "visible" | "finish">>): void {
  Object.assign(faceOf(b, faceId), a);
}

/** Convert a cabinet-frame rectangle on a board into face-local (u, v). */
export function localRect(
  b: Board,
  r: { x?: [number, number]; y?: [number, number]; z?: [number, number] },
): { u0: number; u1: number; v0: number; v1: number } {
  const [U, V] = planeAxes(b.profilePlane);
  const ru = r[U];
  const rv = r[V];
  if (!ru || !rv) throw new Error(`${b.id}: rectangle needs ${U} and ${V} ranges`);
  return {
    u0: Math.min(...ru) - b[`${U}0`],
    u1: Math.max(...ru) - b[`${U}0`],
    v0: Math.min(...rv) - b[`${V}0`],
    v1: Math.max(...rv) - b[`${V}0`],
  };
}

/** Face of a board that faces a world direction (A or B), or null when the board's thickness axis differs. */
export function bigFaceToward(b: Board, dir: AxisDir): Face | null {
  const [, , T] = planeAxes(b.profilePlane);
  if (dir[1] !== AXIS_UPPER[T]) return null;
  return faceOf(b, dir[0] === "+" ? "A" : "B");
}

// --- joints ----------------------------------------------------------------------

export function joint(id: string, kind: Joint["kind"], a: FaceRef, b: FaceRef, extra: Partial<Pick<Joint, "hardware" | "rule">> = {}): Joint {
  return { id, kind, a, b, ...extra };
}

export function faceRef(board: string, faces: FaceId[] | Face[]): FaceRef {
  return { board, faces: faces.map((f) => (typeof f === "string" ? f : f.id)) };
}
