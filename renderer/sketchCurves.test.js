import assert from "node:assert/strict";
import {
  arcItem, arcOf, chamferCorner, circleItem, extendAt, filletCorner, itemPoints, itemProblem, joinItems,
  mirrorItem, offsetItem, offsetSide, rectItem, segIntersections, trimAt, nearestSegment,
  itemCentroid, itemQuadrants, itemTangents, extensionPoint, parallelPoint,
} from "./sketchCurves.js";
import { signedArea } from "./sketch2d.js";

const close = (a, b, tol = 1e-3) => Math.abs(a - b) <= tol;
const closeP = (p, q, tol = 1e-3) => close(p[0], q[0], tol) && close(p[1], q[1], tol);
const area = (item) => Math.abs(signedArea(itemPoints(item)));

/* ---- bulge: a half circle, a quarter both ways ---- */
{
  const half = arcOf([0, 0], [200, 0], 1);
  assert.ok(closeP(half.c, [100, 0]) && close(half.r, 100));
  const q = arcOf([100, 0], [0, 100], Math.tan(Math.PI / 8));
  assert.ok(closeP(q.c, [0, 0]) && close(q.r, 100), "a counter-clockwise quarter turns about the origin");
  const cw = arcOf([0, 100], [100, 0], -Math.tan(Math.PI / 8));
  assert.ok(closeP(cw.c, [0, 0]), "the same quarter backwards");
  const circle = circleItem([0, 0], 100);
  assert.ok(close(area(circle), Math.PI * 100 * 100, 30), "a circle is two half arcs");
  assert.equal(itemProblem(circle), null);
}

/* ---- fillet and chamfer a square corner ---- */
{
  const sq = rectItem([0, 0], [400, 300]);
  const f = filletCorner(sq, 2, 50);
  assert.ok(f.item, f.error);
  assert.equal(f.item.pts.length, 5);
  assert.ok(f.item.pts.some((p) => closeP(p, [400, 250])) && f.item.pts.some((p) => closeP(p, [350, 300])));
  const arc = f.item.b.findIndex((x) => x !== 0);
  assert.ok(close(f.item.b[arc], Math.tan(Math.PI / 8)), "a 90° left turn is a counter-clockwise quarter");
  assert.ok(close(area(f.item), 400 * 300 - (50 * 50 - Math.PI * 50 * 50 / 4), 5));
  assert.ok(filletCorner(sq, 2, 400).error, "radius larger than the edges");
  const c = chamferCorner(sq, 0, 30, 60);
  assert.ok(c.item);
  assert.ok(c.item.pts.some((p) => closeP(p, [0, 30])) && c.item.pts.some((p) => closeP(p, [60, 0])), "back along the incoming edge, then the outgoing one");
  assert.ok(close(area(c.item), 400 * 300 - 900));
}

/* ---- offset: a square in and out, a circle, a filleted square ---- */
{
  const sq = rectItem([0, 0], [400, 300]);
  const side = offsetSide(sq, [200, 150]);
  const inner = offsetItem(sq, 16 * side);
  assert.ok(inner.item, inner.error);
  assert.ok(close(area(inner.item), 368 * 268));
  const outer = offsetItem(sq, -16 * side);
  assert.ok(close(area(outer.item), 432 * 332));
  assert.ok(offsetItem(sq, 200 * side).error, "too far in");
  const ring = circleItem([0, 0], 100);
  const inRing = offsetItem(ring, 20 * offsetSide(ring, [0, 0]));
  assert.ok(close(area(inRing.item), Math.PI * 80 * 80, 30));
  const round = filletCorner(sq, 1, 40).item;
  const inRound = offsetItem(round, 10 * offsetSide(round, [200, 150]));
  assert.ok(inRound.item, inRound.error);
  const arcB = inRound.item.b.find((x) => x !== 0);
  assert.ok(close(arcB, Math.tan(Math.PI / 8)), "the arc keeps its angle, radius 30");
}

/* ---- mirror keeps the size, flips the turn ---- */
{
  const f = filletCorner(rectItem([0, 0], [400, 300]), 2, 50).item;
  const m = mirrorItem(f, [500, 0], [500, 100]);
  assert.ok(close(area(m), area(f)));
  assert.ok(m.pts.every((p) => p[0] >= 600 - 1e-6));
  assert.ok(m.b.some((x) => x < 0), "the arc turns the other way");
}

/* ---- trim two crossing lines, then join what is left into a closed shape ---- */
{
  const h1 = { closed: false, pts: [[-100, 0], [500, 0]], b: [0] };
  const h2 = { closed: false, pts: [[-100, 300], [500, 300]], b: [0] };
  const v1 = { closed: false, pts: [[0, -100], [0, 400]], b: [0] };
  const v2 = { closed: false, pts: [[400, -100], [400, 400]], b: [0] };
  let items = [h1, h2, v1, v2];
  const trim = (p) => {
    const s = nearestSegment(items, p);
    items = trimAt(items, s.index, s.k, s.f);
  };
  for (const p of [[-50, 0], [450, 0], [-50, 300], [450, 300], [0, -50], [0, 350], [400, -50], [400, 350]]) trim(p);
  items = joinItems(items);
  assert.equal(items.length, 1);
  assert.equal(items[0].closed, true);
  assert.ok(close(area(items[0]), 400 * 300));
}

/* ---- trim a rectangle where another crosses it ---- */
{
  const a = rectItem([0, 0], [400, 300]);
  const b = rectItem([300, 100], [600, 200]);
  let items = [a, b];
  // a's right edge where b comes out, and every piece of b that lies inside a.
  for (const p of [[400, 150], [300, 150], [350, 100], [350, 200]]) {
    const s = nearestSegment(items, p);
    items = trimAt(items, s.index, s.k, s.f);
  }
  items = joinItems(items);
  assert.equal(items.length, 1, "the two outlines become one");
  assert.ok(items[0].closed);
  assert.ok(close(area(items[0]), 400 * 300 + 200 * 100));
}

/* ---- extend an end straight on to the next line ---- */
{
  const wall = { closed: false, pts: [[500, -100], [500, 400]], b: [0] };
  const line = { closed: false, pts: [[0, 0], [200, 0], [200, 100]], b: [0, 0] };
  const r = extendAt([wall, line], 1, [0, 0]);
  assert.ok(r.error, "the start points away from the wall");
  const up = { closed: false, pts: [[0, 150], [300, 150]], b: [0] };
  const e = extendAt([wall, up], 1, [290, 150]);
  assert.ok(e.items, e.error);
  assert.deepEqual(e.items[1].pts[1], [500, 150]);
}

/* ---- arc through three points; crossings with arcs ---- */
{
  const a = arcItem([0, 0], [100, 100], [200, 0]);
  assert.ok(a);
  assert.ok(close(a.b[0], -1), "over the top from left to right is clockwise, a half circle");
  assert.equal(arcItem([0, 0], [100, 0], [200, 0]), null);
  const xs = segIntersections({ a: [-200, 50], b: [200, 50], bulge: 0 }, { a: [100, 0], b: [-100, 0], bulge: 1 });
  assert.equal(xs.length, 2);
  assert.ok(xs.every((x) => close(Math.hypot(x.p[0], x.p[1]), 100)));
}

/* ---- snap points: geometric centre, quadrants, tangents, extension, parallel ---- */
{
  assert.ok(closeP(itemCentroid(rectItem([0, 0], [400, 300])), [200, 150]), "rectangle centre");
  assert.ok(closeP(itemCentroid(circleItem([50, -20], 100)), [50, -20], 0.05), "circle centre");
  assert.equal(itemCentroid({ closed: false, pts: [[0, 0], [10, 0]], b: [0] }), null);

  const qs = itemQuadrants(circleItem([0, 0], 100));
  assert.equal(qs.length, 4);
  for (const p of [[100, 0], [0, 100], [-100, 0], [0, -100]]) assert.ok(qs.some((q) => closeP(q, p)), `quadrant ${p}`);
  const upper = itemQuadrants({ closed: false, pts: [[100, 0], [-100, 0]], b: [1] });
  assert.ok(upper.some((q) => closeP(q, [0, 100])) && !upper.some((q) => closeP(q, [0, -100])), "a half arc keeps only its own quadrants");

  const ts = itemTangents(circleItem([0, 0], 100), [200, 0]);
  assert.equal(ts.length, 2);
  for (const t of ts) {
    assert.ok(close(Math.hypot(t[0], t[1]), 100), "on the circle");
    assert.ok(close((t[0] - 200) * t[0] + t[1] * t[1], 0, 1e-6), "radius ⟂ the line from the point");
  }
  assert.equal(itemTangents(circleItem([0, 0], 100), [10, 0]).length, 0, "no tangent from inside");

  const line = [{ closed: false, pts: [[0, 0], [100, 0]], b: [0] }];
  const ext = extensionPoint(line, [160, 3], 5);
  assert.ok(ext && closeP(ext.p, [160, 0]) && closeP(ext.from, [100, 0]), "past the right end");
  assert.equal(extensionPoint(line, [50, 3], 5), null, "over the segment is not an extension");
  assert.equal(extensionPoint(line, [160, 30], 5), null, "too far off the line");

  const slant = [{ closed: false, pts: [[0, 0], [100, 100]], b: [0] }];
  const par = parallelPoint(slant, [500, 0], [600, 102]);
  assert.ok(par && close(par.p[0] - 500, par.p[1]), "pulled onto 45°");
  assert.equal(parallelPoint(slant, [500, 0], [600, 150]), null, "outside the angle tolerance");
  assert.equal(parallelPoint(line, [500, 0], [600, 1]), null, "axis directions are left to Ortho");
}

console.log("sketchCurves: arcs, fillet, chamfer, offset, mirror, trim, extend, join, snap points");
