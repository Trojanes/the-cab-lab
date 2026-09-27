import assert from "node:assert/strict";
import {
  axisForScreen, cornerFromPair, fromUV, nestRings, orthoPoint, parseEntry, pathSnaps, perpendicularFoot,
  pointFromEntry, polarPoint, ringCrosses, ringProblem, ringRelation, ringsTouch, roundLength, screenAxes, segmentHitsPath, toUV,
} from "./sketch2d.js";

/* ---- face frame: (u, v) are the model's planeAxes ---- */
{
  const wall = { axis: "x", value: 1000 };
  assert.deepEqual(toUV(wall, { x: 1000, y: 200, z: 300 }), [200, 300]);
  assert.deepEqual(fromUV(wall, 200, 300), { x: 1000, y: 200, z: 300 });
  const front = { axis: "y", value: 0 };
  assert.deepEqual(fromUV(front, 50, 60), { x: 50, y: 0, z: 60 });
}

/* ---- ortho, polar, length rounding ---- */
{
  assert.deepEqual(orthoPoint([0, 0], [300, 40]), [300, 0]);
  assert.deepEqual(orthoPoint([0, 0], [30, -400]), [0, -400]);
  const p = polarPoint([0, 0], [100, 102]);
  assert.ok(p && Math.abs(p[0] - p[1]) < 1e-9, "snaps to 45°");
  assert.equal(polarPoint([0, 0], [100, 60]), null, "31° is not near a 45° step");
  assert.deepEqual(roundLength([0, 0], [0, 604]), [0, 600]);
}

/* ---- crossing: the new segment, the closing segment, a ring ---- */
{
  const path = [[0, 0], [400, 0], [400, 400], [0, 400]];
  assert.equal(segmentHitsPath(path, [0, 400], [0, 0], { closing: true }), false, "a square closes cleanly");
  assert.equal(segmentHitsPath(path, [0, 400], [200, -100]), true, "crosses the first edge");
  assert.equal(segmentHitsPath([[0, 0], [400, 0]], [400, 0], [100, 0]), true, "doubles back along the last edge");
  assert.equal(ringCrosses([[0, 0], [400, 400], [400, 0], [0, 400]]), true, "bow-tie");
  assert.equal(ringCrosses([[0, 0], [600, 0], [600, 200], [200, 200], [200, 500], [0, 500]]), false, "L shape");
  assert.equal(ringProblem([[0, 0], [600, 0], [600, 200], [200, 200], [200, 500], [0, 500]], 50), null);
  assert.equal(ringProblem([[0, 0], [30, 0], [30, 400]], 50), "is under 50 × 50");
  assert.equal(ringProblem([[0, 0], [400, 0]], 50), "needs at least 3 points");
}

/* ---- object snaps from the path ---- */
{
  const snaps = pathSnaps([[0, 0], [400, 0], [400, 400], [200, -100]], { from: [200, -100] });
  const kinds = new Set(snaps.map((s) => s.kind));
  assert.ok(kinds.has("close"), "the first point closes once there are 3 points");
  assert.ok(kinds.has("midpoint"));
  assert.ok(snaps.some((s) => s.kind === "midpoint" && s.uv[0] === 200 && s.uv[1] === 0));
  assert.ok(snaps.some((s) => s.kind === "perpendicular" && s.uv[0] === 200 && s.uv[1] === 0), "foot on the first edge");
  const xs = pathSnaps([[0, 0], [400, 0], [400, 400], [200, -100], [200, 200]]).filter((s) => s.kind === "intersection");
  const at = (u) => xs.some((s) => Math.abs(s.uv[0] - u) < 1e-6 && Math.abs(s.uv[1]) < 1e-6);
  assert.ok(at(240), "the third edge crosses the first at u 240");
  assert.ok(at(200), "the fourth edge crosses the first at u 200");
  assert.deepEqual(perpendicularFoot([100, 50], [0, 0], [200, 0]), [100, 0]);
  assert.equal(perpendicularFoot([300, 50], [0, 0], [200, 0]), null);
}

/* ---- typed entry ---- */
{
  assert.deepEqual(parseEntry("600"), { kind: "length", value: 600 });
  assert.deepEqual(parseEntry("@100,-50"), { kind: "rel", dx: 100, dy: -50 });
  assert.deepEqual(parseEntry("600<45"), { kind: "polar", len: 600, deg: 45 });
  assert.deepEqual(parseEntry("@600<90"), { kind: "polar", len: 600, deg: 90 });
  assert.deepEqual(parseEntry("400, 600"), { kind: "pair", a: 400, b: 600 });
  assert.equal(parseEntry("abc"), null);

  // Screen: +u points left, +v points up (y down on screen) — a wall seen from the room.
  const su = [-1, 0];
  const sv = [0, -1];
  assert.deepEqual(axisForScreen(su, sv, 1, 0), [-1, 0]);
  const axes = screenAxes(su, sv);
  assert.deepEqual(axes, { right: [-1, 0], up: [0, 1] });
  assert.deepEqual(pointFromEntry([1000, 0], parseEntry("@100,50"), { axes }), [900, 50]);
  const up = pointFromEntry([1000, 0], parseEntry("200<90"), { axes });
  assert.ok(Math.abs(up[0] - 1000) < 1e-6 && Math.abs(up[1] - 200) < 1e-6);
  assert.deepEqual(pointFromEntry([0, 0], parseEntry("600"), { dir: [0, 1], axes }), [0, 600]);
  assert.deepEqual(cornerFromPair([1000, 0], parseEntry("400,600"), { axes, cursor: [700, 300] }), [600, 600]);
  assert.deepEqual(cornerFromPair([1000, 0], parseEntry("400,600"), { axes, cursor: [1300, 300] }), [1400, 600], "cursor on the other side flips width");
}

/* ---- several shapes in one sketch: boards, openings, islands ---- */
{
  const sq = (u0, v0, u1, v1) => [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
  const panel = sq(0, 0, 1000, 800);
  const hole = sq(200, 200, 400, 400);
  const island = sq(250, 250, 350, 350);
  const beside = sq(1000, 0, 1500, 800);
  assert.equal(ringRelation(hole, panel), "inside");
  assert.equal(ringRelation(panel, hole), "contains");
  assert.equal(ringRelation(beside, panel), "apart", "two boards sharing an edge");
  assert.equal(ringRelation(sq(900, 100, 1200, 300), panel), "cross");
  assert.equal(ringRelation(sq(0, 0, 1000, 800), panel), "same");
  assert.equal(ringsTouch(sq(0, 200, 300, 400), panel), true, "an opening on the edge touches");
  const plan = nestRings([panel, hole, island, beside]);
  assert.deepEqual(plan, [
    { outer: 0, holes: [1] },
    { outer: 2, holes: [] },
    { outer: 3, holes: [] },
  ]);
}

console.log("sketch2d: ortho, polar, crossings, snaps, typed entry, nesting");
