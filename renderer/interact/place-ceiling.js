// @module interact @owns place.ceiling — ceiling-hung (Overhead) anchor + back-wall rules
// The anchor is a feature point where the flat ceiling meets a solid: a space
// wall, a cabinet's outer box, or a partition (extended up to the roof). That
// face is the cabinet's back, W runs along it, the doors face the room and the
// top stays on the ceiling (the box can only grow down). Three faces may hold
// the 2D rectangle: the ceiling (W×D, pull H down), the back face (W×H, pull D
// into the room) or a face perpendicular to it — the adjacent wall at a corner
// or a neighbour's side (D×H, pull W along the wall).
import { getModule } from "../modules.js";
import * as job from "../job.js";
import { facesOnPoint, facePlanes } from "../snap.js";
import { S, setDimNames, DIM_ORDER, AXIS_OF, DIM_OF } from "./shared.js";

export function ceilingMode() {
  return !!S.placing && getModule(S.placing).placement === "ceiling";
}
export function ceilingFace() {
  return facePlanes().find((f) => f.source === "space" && f.axis === "z" && f.dir < 0) || null;
}
/** Solids the point lies on: space walls, plus a cabinet's outer box or a partition. { axis, value, dir (into the room), label }. */
export function wallsAt(p) {
  const sp = job.getSpace();
  if (!sp) return [];
  const b = sp.bounds;
  const walls = new Set(sp.walls || []);
  const out = [];
  if (walls.has(3) && Math.abs(p.x - b.minX) < 0.5) out.push({ axis: "x", value: b.minX, dir: 1, label: "Left wall" });
  if (walls.has(1) && Math.abs(p.x - b.maxX) < 0.5) out.push({ axis: "x", value: b.maxX, dir: -1, label: "Right wall" });
  if (walls.has(0) && Math.abs(p.y - b.minY) < 0.5) out.push({ axis: "y", value: b.minY, dir: 1, label: "Front wall" });
  if (walls.has(2) && Math.abs(p.y - b.maxY) < 0.5) out.push({ axis: "y", value: b.maxY, dir: -1, label: "Back wall" });
  for (const f of facesOnPoint(p)) {
    if (f.axis === "z" || f.source === "space") continue;
    if (out.some((w) => w.axis === f.axis && Math.abs(w.value - f.value) < 0.5 && w.dir === f.dir)) continue;
    out.push({ axis: f.axis, value: f.value, dir: f.dir, label: f.label });
  }
  return out;
}
/** On the flat ceiling and on at least one wall, cabinet box, or partition. */
export function onCeilingLine(p) {
  const sp = job.getSpace();
  if (!sp || Math.abs(p.z - sp.height) > 0.5) return false;
  if (p.y < (sp.flatFromY ?? sp.bounds.minY) - 0.5) return false;
  return wallsAt(p).length > 0;
}
/** Faces through a ceiling-line anchor that an overhead box may be drawn on (see above). */
export function allowedCeilingFaces(anchor, faces) {
  const walls = wallsAt(anchor);
  const out = [];
  for (const f of faces) {
    if (f.axis === "z") { if (f.source === "space" && f.dir < 0) out.push(f); continue; }
    if (walls.some((w) => w.axis === f.axis && Math.abs(w.value - f.value) < 0.5 && w.dir === f.dir)) { out.push(f); continue; } // the back wall
    if (walls.some((w) => w.axis !== f.axis)) out.push(f); // perpendicular: side wall at a corner, a neighbour's side
  }
  const ceil = ceilingFace();
  if (ceil && !out.includes(ceil)) out.push(ceil);
  return out;
}
/**
 * The back wall for a box drawn from `walls` on `plane`. One wall at the
 * anchor: that wall. A face perpendicular to the only wall (a neighbour's
 * side): that wall. At a corner (two walls) the box decides once it exists:
 * W runs along the wall its longer horizontal edge follows; until then the
 * wall being drawn on counts as the back (front view). Null when unknown yet.
 */
export function backWallFor(walls, plane, b = null) {
  if (!walls.length) return null;
  if (walls.length === 1) return walls[0];
  if (b) {
    const along = (w) => (w.axis === "y" ? b.W : b.D);
    return walls.slice().sort((p, q) => along(q) - along(p))[0];
  }
  if (plane && plane.axis !== "z") return walls.find((w) => w.axis === plane.axis && Math.abs(w.value - plane.value) < 0.5) || null;
  return null;
}
/** Module dimension along each world axis once the back wall is known (W along it, D through it). */
export function termFor(wall) {
  if (!wall) return DIM_OF;
  return { x: wall.axis === "x" ? "D" : "W", y: wall.axis === "y" ? "D" : "W", z: "H" };
}
export function applyCeilingTerm() {
  if (!S.rb || !ceilingMode()) return;
  const wall = backWallFor(S.rb.walls, S.rb.plane);
  S.rb.term = termFor(wall);
  S.rb.backWall = wall;
  setDimNames(DIM_ORDER.map((k) => S.rb.term[AXIS_OF[k]]));
}
