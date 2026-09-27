// A closed shape sketched on an axis-aligned face, turned into one board's params.
// The preview uses the returned world box directly. The generator runs once,
// when the board is committed — not while the cursor is moving.
//
// Cabinet origin sits on the sketch plane at the shape's minimum corner (arcs
// included). The outline is stored relative to it, with each edge's bulge.
// Thickness grows along the face normal (`pull` +1 with the positive axis, −1
// against it), by the stock thickness copied into `choice`. It is not a free
// distance.
import { tessellateRing } from "./gen/sketchBoard.js";

export const BOARD_MIN = 50;

/** A feature point lies on the sketch plane (the face normal is `face.axis`). */
export function onSketchPlane(p, face, tol = 0.5) {
  return !!p && !!face && Number.isFinite(p[face.axis]) && Math.abs(p[face.axis] - face.value) <= tol;
}

/** On the plane and inside the face's own rectangle: that face's corners. */
export function onSketchFace(p, face, tol = 0.5) {
  if (!onSketchPlane(p, face, tol) || !face.ext) return false;
  const [u, v] = UV[face.axis] || [];
  const eu = u && face.ext[u];
  const ev = v && face.ext[v];
  if (!eu || !ev) return false;
  return p[u] >= eu[0] - tol && p[u] <= eu[1] + tol && p[v] >= ev[0] - tol && p[v] <= ev[1] + tol;
}

/**
 * Where the camera sits to look straight at `face`. Floor and ceiling are
 * tilted a hair off ±Z, the same way the top view avoids a degenerate orbit.
 * `normal` points from the face toward the camera (the room side).
 */
export function faceViewFrame(face) {
  const center = { x: 0, y: 0, z: 0 };
  for (const a of ["x", "y", "z"]) {
    const e = face.ext && face.ext[a];
    center[a] = e ? (Number(e[0]) + Number(e[1])) / 2 : 0;
  }
  center[face.axis] = face.value;
  const [u, v] = UV[face.axis] || ["x", "y"];
  const du = face.ext && face.ext[u] ? Math.abs(face.ext[u][1] - face.ext[u][0]) : 0;
  const dv = face.ext && face.ext[v] ? Math.abs(face.ext[v][1] - face.ext[v][0]) : 0;
  const sign = face.dir < 0 ? -1 : 1;
  const n = {
    x: face.axis === "x" ? sign : 0,
    y: face.axis === "y" ? sign : 0,
    z: face.axis === "z" ? sign : 0,
  };
  if (face.axis === "z") n.y -= 0.02 * sign;
  const len = Math.hypot(n.x, n.y, n.z) || 1;
  return {
    center,
    normal: { x: n.x / len, y: n.y / len, z: n.z / len },
    radius: Math.max(du, dv) / 2 || 500,
  };
}

const PLANE = { x: "YZ", y: "XZ", z: "XY" };
// (u, v) match generators/_lib/model.ts planeAxes: YZ (y, z), XZ (x, z), XY (x, y).
const UV = { x: ["y", "z"], y: ["x", "z"], z: ["x", "y"] };
const BOX = { x: ["x0", "x1"], y: ["y0", "y1"], z: ["z0", "z1"] };

const r3 = (n) => Math.round(Number(n) * 1000) / 1000;

function span(face, a, b) {
  const [u, v] = UV[face.axis] || [];
  if (!u) return null;
  const du = r3(Math.abs(a[u] - b[u]));
  const dv = r3(Math.abs(a[v] - b[v]));
  if (!(du >= BOARD_MIN) || !(dv >= BOARD_MIN)) return null;
  return { u, v, du, dv, u0: r3(Math.min(a[u], b[u])), v0: r3(Math.min(a[v], b[v])) };
}

/** Catalogue rows for the commit card: carcass, partition, and each door colour. */
export function stockChoices(finish, stock) {
  const carcassName = (finish && finish.carcass && finish.carcass.name) || "White Stipple";
  const door = finish && finish.door;
  const sides = door && door.sides === "double" ? "double" : "single";
  const series = door && door.series === "hpl" ? "hpl" : "acrylic";
  const t = (key, fallback) => {
    const n = Number(stock && stock[key] && stock[key].thickness);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  const list = [
    { id: "carcass", label: `Carcass · ${t("carcass", 16)} mm`, kind: "carcass", thickness: t("carcass", 16), carcassColorName: carcassName, single: false },
    { id: "partition", label: `Partition · ${t("partition", 18)} mm`, kind: "partition", thickness: t("partition", 18), carcassColorName: carcassName, single: false },
  ];
  for (const c of (door && door.colors) || []) {
    if (!c || !c.name) continue;
    list.push({
      id: `door:${c.id || c.name}`,
      label: `${c.name} · ${t("door", 16)} mm`,
      kind: "door",
      thickness: t("door", 16),
      colour: c.name,
      doorSides: sides,
      doorSeries: c.series === "hpl" ? "hpl" : series,
      carcassColorName: carcassName,
      single: sides === "single",
    });
  }
  return list;
}

/**
 * Last commit, or the first row. `colorFace` stays with the remembered door
 * even when the current row is carcass, so switching back keeps the same side.
 */
export function remembered(memory, choices) {
  if (!choices || !choices.length) return null;
  const found = choices.find((c) => c.id === (memory && memory.stockId)) || choices[0];
  const colorFace = memory && memory.colorFace === "sketch" ? "sketch" : "pull";
  return { ...found, colorFace: found.single ? colorFace : "pull" };
}

/** World position of the colour face. Single-sided uses `colorFace`; anything else is the outer face. */
export function colourFaceValue(face, thickness, colorFace) {
  if (colorFace === "sketch") return face.value;
  return face.value + (face.dir < 0 ? -thickness : thickness);
}

/** Local AABB of a sketch-board params object. Matches `generateSketchBoard`. */
export function localBoxOf(params) {
  const plane = params && PLANE_AXES[params.plane] ? params.plane : "XY";
  const [U, V, T] = PLANE_AXES[plane];
  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  const outline = (params && params.outline) || [];
  for (const p of outline.some((q) => q && q.b) ? tessellateRing(outline) : outline) {
    const u = Number(p.u);
    const v = Number(p.v);
    if (!Number.isFinite(u) || !Number.isFinite(v)) continue;
    minU = Math.min(minU, u);
    maxU = Math.max(maxU, u);
    minV = Math.min(minV, v);
    maxV = Math.max(maxV, v);
  }
  if (!Number.isFinite(minU)) { minU = 0; maxU = 0; minV = 0; maxV = 0; }
  const thickness = Number(params && params.stock && params.stock.thickness) || 0;
  const pull = params && params.pull === -1 ? -1 : 1;
  const t0 = pull === 1 ? 0 : -thickness;
  const t1 = pull === 1 ? thickness : 0;
  const box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0, fpt: 0 };
  box[`${U}0`] = minU;
  box[`${U}1`] = maxU;
  box[`${V}0`] = minV;
  box[`${V}1`] = maxV;
  box[`${T}0`] = t0;
  box[`${T}1`] = t1;
  box.W = box.x1 - box.x0;
  box.D = box.y1 - box.y0;
  box.H = box.z1 - box.z0;
  return box;
}

const PLANE_AXES = { XY: ["x", "y", "z"], XZ: ["x", "z", "y"], YZ: ["y", "z", "x"] };

/** In-plane size of the stored outline. */
export function outlineSpan(params) {
  const box = localBoxOf(params);
  const [U, V] = PLANE_AXES[params && params.plane] || PLANE_AXES.XY;
  const u = box[`${U}1`] - box[`${U}0`];
  const v = box[`${V}1`] - box[`${V}0`];
  return { u: r3(u), v: r3(v), t: Number(params && params.stock && params.stock.thickness) || 0 };
}

/**
 * Rectangle from two opposite corners. `{ pose, params, du, dv, box }` or null
 * when it is under BOARD_MIN. `box` is the world AABB of the slab (the
 * preview). `pose` + the generator's local box lands on the same AABB.
 */
export function sketchBoardPlacement(face, a, b, choice) {
  if (!face || !a || !b) return null;
  const s = span(face, a, b);
  if (!s) return null;
  const [u, v] = [s.u, s.v];
  const corner = (cu, cv) => ({ ...a, [u]: cu, [v]: cv, [face.axis]: face.value });
  return sketchBoardFromPoints(face, [
    corner(s.u0, s.v0),
    corner(s.u0 + s.du, s.v0),
    corner(s.u0 + s.du, s.v0 + s.dv),
    corner(s.u0, s.v0 + s.dv),
  ], choice);
}

/**
 * A closed outline of world points on the face plane (no repeated closing
 * point). Cabinet origin at the outline's minimum (u, v); the stored outline
 * is relative to it. Null when the bounding box is under BOARD_MIN.
 */
export function sketchBoardFromPoints(face, pts, choice, holes = []) {
  if (!face || !Array.isArray(pts)) return null;
  const [u, v] = UV[face.axis] || [];
  if (!u) return null;
  const item = (list) => ({ pts: list.map((p) => [Number(p[u]), Number(p[v])]), b: [] });
  return sketchBoardFromUV(face, item(pts), choice, holes.map(item));
}

/**
 * A sketch item `{ pts: [[u, v]], b: [bulge] }` (closed) with its opening
 * items, on the face plane. Null when the shape's box is under BOARD_MIN.
 */
export function sketchBoardFromUV(face, item, choice, holes = []) {
  if (!face || !item || !Array.isArray(item.pts) || item.pts.length < 2 || !choice || !(choice.thickness > 0)) return null;
  const [u, v] = UV[face.axis] || [];
  if (!u) return null;
  const ring = (it) => it.pts.map((p, i) => {
    const b = (it.b && it.b[i]) || 0;
    return b ? { u: Number(p[0]), v: Number(p[1]), b } : { u: Number(p[0]), v: Number(p[1]) };
  });
  const outer = ring(item);
  if (outer.length < 3 && !outer.some((p) => p.b)) return null;
  const flat = tessellateRing(outer);
  const u0 = r3(Math.min(...flat.map((p) => p.u)));
  const v0 = r3(Math.min(...flat.map((p) => p.v)));
  const du = r3(Math.max(...flat.map((p) => p.u)) - u0);
  const dv = r3(Math.max(...flat.map((p) => p.v)) - v0);
  if (!(du >= BOARD_MIN) || !(dv >= BOARD_MIN)) return null;
  const rel = (p) => (p.b ? { u: r3(p.u - u0), v: r3(p.v - v0), b: p.b } : { u: r3(p.u - u0), v: r3(p.v - v0) });
  const s = { u, v, du, dv, u0, v0 };
  const pull = face.dir < 0 ? -1 : 1;
  const pose = { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0 };
  pose[face.axis] = r3(face.value);
  pose[s.u] = s.u0;
  pose[s.v] = s.v0;
  const colorFace = choice.colorFace === "sketch" ? "sketch" : "pull";
  const params = {
    plane: PLANE[face.axis],
    pull,
    outline: outer.map(rel),
    ...(holes.length ? { holes: holes.map((h) => ring(h).map(rel)) } : {}),
    stock: {
      kind: choice.kind,
      thickness: choice.thickness,
      ...(choice.kind === "door" && choice.colour ? { colour: choice.colour } : {}),
    },
    carcassColorName: choice.carcassColorName || "White Stipple",
    colorFace: choice.single ? colorFace : "pull",
    ...(choice.kind === "door" ? {
      doorSides: choice.doorSides === "double" ? "double" : "single",
      doorSeries: choice.doorSeries === "hpl" ? "hpl" : "acrylic",
      doorColorName: choice.colour,
    } : {}),
  };
  const thick = choice.thickness;
  const t0 = pull === 1 ? pose[face.axis] : pose[face.axis] - thick;
  const t1 = pull === 1 ? pose[face.axis] + thick : pose[face.axis];
  const box = { x0: 0, x1: 0, y0: 0, y1: 0, z0: 0, z1: 0 };
  box[BOX[s.u][0]] = s.u0;
  box[BOX[s.u][1]] = r3(s.u0 + s.du);
  box[BOX[s.v][0]] = s.v0;
  box[BOX[s.v][1]] = r3(s.v0 + s.dv);
  box[BOX[face.axis][0]] = r3(Math.min(t0, t1));
  box[BOX[face.axis][1]] = r3(Math.max(t0, t1));
  return { pose, params, du: s.du, dv: s.dv, box };
}
