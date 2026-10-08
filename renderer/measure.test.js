// Measure: distances, angles, and the click chain. No scene, no job.
import {
  MEASURE_LIMIT, boardSize, boardSummary, emptyMeasure, measureBetween, measureClick, measureEnds,
  measureLogPick, measureLogResult, measureMark, measurePreview, measureSummary, planeAngle, segmentLength,
} from "./measure.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}
function near(a, b, eps = 1e-6, msg) {
  assert(Math.abs(a - b) < eps, msg || `${a} != ${b}`);
}

const pt = (x, label = String(x)) => ({ kind: "point", x, y: 0, z: 0, label });
const face = (z, normal, at, label) => ({
  kind: "face",
  point: [at?.x || 0, at?.y || 0, z],
  normal,
  at: at || { x: 0, y: 0, z },
  label,
});

// Two points: 3-4-5, and the signed deltas.
{
  const r = measureBetween(pt(0, "a"), { kind: "point", x: 3, y: 4, z: 0, label: "b" });
  assert(r.kind === "point-point", "point-point");
  near(r.distance, 5);
  near(r.delta[0], 3);
  near(r.delta[1], 4);
  assert(measureSummary(r).title === "5 mm", measureSummary(r).title);
  assert(measureSummary(r).detail === "ΔX 3   ΔY 4   ΔZ 0", measureSummary(r).detail);
  const neg = measureBetween(pt(0, "a"), { kind: "point", x: -5, y: 0, z: 10, label: "c" });
  assert(measureSummary(neg).detail.includes("ΔX -5") && measureSummary(neg).detail.includes("ΔZ 10"), measureSummary(neg).detail);
  const third = measureSummary({ kind: "point-point", distance: 100 / 3, delta: [100 / 3, 0, 0], angle: null });
  assert(third.title === "33.3 mm", third.title);
}

// Point to a face, either order: perpendicular, the click's x stays.
{
  const floor = face(0, [0, 0, 1], { x: 0, y: 0, z: 0 }, "Floor");
  const p = { kind: "point", x: 5, y: 5, z: 40, label: "p" };
  const r = measureBetween(p, floor);
  assert(r.kind === "point-face", r.kind);
  near(r.distance, 40);
  near(measureBetween(floor, p).distance, 40);
  const ends = measureEnds(p, floor, r);
  near(ends[0].z, 40);
  near(ends[1].z, 0);
  near(ends[1].x, 5);
  const down = face(0, [0, 0, -1], { x: 0, y: 0, z: 0 }, "Floor down");
  const ends2 = measureEnds(p, down, measureBetween(p, down));
  near(ends2[1].z, 0, 1e-6, "foot lands on the plane when the normal points the other way");
}

// Parallel faces: the gap along the normal, not the distance between the two clicks.
{
  const a = face(0, [0, 0, 1], { x: 0, y: 0, z: 0 }, "A");
  const b = face(18, [0, 0, -1], { x: 100, y: 0, z: 18 }, "B");
  b.point = [100, 0, 18];
  const r = measureBetween(a, b);
  assert(r.kind === "face-face", r.kind);
  near(r.distance, 18);
  assert(r.angle == null, "parallel faces have no angle");
  const mark = measureMark(a, b, r);
  near(mark.line[0].x, 0);
  near(mark.line[1].x, 0, 1e-6, "the line leaves the first click along the normal");
  near(mark.line[1].z, 18);
  assert(mark.text === "18 mm", mark.text);
}

// Not parallel: the angle between the planes, 0 to 90.
{
  const a = face(0, [0, 0, 1], { x: 0, y: 0, z: 0 }, "A");
  const c = face(0, [1, 0, 0], { x: 0, y: 0, z: 0 }, "C");
  const r = measureBetween(a, c);
  assert(r.kind === "angle", r.kind);
  assert(r.distance == null, "an angle has no single distance");
  near(r.angle, 90);
  near(planeAngle([0, 0, 1], [0, 0, -1]), 0);
  const mark = measureMark(a, c, r);
  assert(mark.line == null, "an angle draws no length");
  assert(mark.text === "90°", mark.text);
  assert(mark.at, "the angle label still has a place");
  const tilted = measureBetween(a, face(10, [0.1, 0, 1], { x: 0, y: 0, z: 10 }, "T"));
  assert(tilted.kind === "angle", "a 0.1 tilt is not parallel");
  assert(tilted.angle > 5 && tilted.angle < 6, String(tilted.angle));
  const almost = measureBetween(a, face(10, [0.02, 0, 1], { x: 0, y: 0, z: 10 }, "N"));
  assert(almost.kind === "face-face", "under 2.6° stays a distance");
  near(almost.distance, 10);
}

// A board's overall size, in its profile plane.
{
  const shelf = boardSize({ profilePlane: "XY", x0: 0, x1: 600, y0: 0, y1: 560, z0: 0, z1: 18, stock: { kind: "carcass" } });
  near(shelf.u, 600);
  near(shelf.v, 560);
  near(shelf.thickness, 18);
  assert(boardSummary(shelf) === "600 × 560 mm, 18 thick · carcass", boardSummary(shelf));
  const side = boardSize({ profilePlane: "YZ", x0: 0, x1: 16, y0: 10, y1: 400, z0: 0, z1: 700 });
  near(side.u, 390);
  near(side.v, 700);
  near(side.thickness, 16);
  assert(boardSummary(side) === "390 × 700 mm, 16 thick", boardSummary(side));
}

// Clicks: a pair, a Shift chain, a plain click that starts again, then the cap.
{
  const s0 = emptyMeasure();
  const first = measureClick(s0, pt(0, "a"));
  assert(s0.anchor == null && s0.segments.length === 0, "the previous state stays");
  assert(first.events.length === 1 && first.events[0].which === "anchor", "first click is the anchor");
  assert(first.state.anchor.label === "a");
  const second = measureClick(first.state, pt(10, "b"));
  assert(first.state.segments.length === 0, "the anchor state stays");
  assert(second.state.anchor == null && second.state.segments.length === 1, "a pair clears the anchor");
  near(second.state.segments[0].result.distance, 10);
  assert(second.events.some((e) => e.kind === "result" && e.chain === false), "the first pair is not a chain");
  assert(measurePreview(second.state, pt(20, "c"), { shift: false }) == null, "without Shift a finished chain does not preview");
  const preview = measurePreview(second.state, pt(20, "c"), { shift: true });
  near(preview.result.distance, 10);
  const third = measureClick(second.state, pt(20, "c"), { shift: true });
  assert(third.state.segments.length === 2, "Shift adds a length");
  assert(third.events.some((e) => e.kind === "result" && e.chain === true), "the added length is marked as a chain");
  assert(second.state.segments.length === 1, "the chain does not rewrite the earlier state");
  const again = measureClick(third.state, pt(0, "d"));
  assert(again.events[0].kind === "clear" && again.events[0].how === "next" && again.events[0].count === 2, "a plain click drops the chain");
  assert(again.state.segments.length === 0 && again.state.anchor.label === "d", "and becomes the new anchor");

  let s = emptyMeasure();
  s = measureClick(s, pt(0)).state;
  s = measureClick(s, pt(10)).state;
  for (let i = 2; i <= MEASURE_LIMIT; i += 1) {
    const r = measureClick(s, pt(i * 10), { shift: true });
    assert(!r.events.some((e) => e.kind === "blocked"), `length ${i} should fit`);
    s = r.state;
  }
  assert(s.segments.length === MEASURE_LIMIT, String(s.segments.length));
  const blocked = measureClick(s, pt(9999), { shift: true });
  assert(blocked.events.some((e) => e.kind === "blocked" && e.reason === "too many"), "past 12 is refused");
  assert(blocked.state.segments.length === MEASURE_LIMIT && blocked.state.anchor == null, "a refused click changes nothing");
  assert(measurePreview(s, pt(9999), { shift: true }) == null, "no preview past the cap");
}

// The log record keeps the pick's own kind nested, and does not carry the hint.
{
  const logged = measureLogPick({
    kind: "face", label: "Floor", at: { x: 1.26, y: 2, z: 3 }, normal: [0, 0, 1],
    hint: { secret: true }, size: { u: 1 }, cabId: "cab-1",
  });
  assert(logged.kind === "face" && logged.hint == null && logged.size == null, "hint and size stay out of the log");
  assert(logged.x === 1.3 && logged.normal[2] === 1 && logged.cabId === "cab-1", JSON.stringify(logged));
  const rec = measureLogResult(measureBetween(pt(0), pt(3)));
  assert(rec.pair === "point-point" && rec.kind == null && rec.distance === 3, JSON.stringify(rec));
  const ang = measureLogResult(measureBetween(
    face(0, [0, 0, 1], { x: 0, y: 0, z: 0 }, "A"),
    face(0, [1, 0, 0], { x: 0, y: 0, z: 0 }, "C"),
  ));
  assert(ang.pair === "angle" && ang.distance == null && ang.angle === 90, JSON.stringify(ang));
}

// An edge: straight length, fillet arc length, parallel gap, square angle.
{
  near(segmentLength(0, 0, 200, 0, 0), 200);
  near(segmentLength(0, 0, 200, 0, 1), 100 * Math.PI, 1e-6, "semicircle");
  const edge = (x0, y0, x1, y1) => ({
    kind: "edge",
    a: { x: x0, y: y0, z: 0 },
    b: { x: x1, y: y1, z: 0 },
    at: { x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: 0 },
    samples: [{ x: x0, y: y0, z: 0 }, { x: x1, y: y1, z: 0 }],
    length: Math.hypot(x1 - x0, y1 - y0),
    label: "edge",
  });
  const along = edge(0, 0, 100, 0);
  const parallel = edge(0, 40, 100, 40);
  const up = { ...edge(0, 0, 0, 0), b: { x: 0, y: 0, z: 100 }, at: { x: 0, y: 0, z: 50 }, samples: [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 100 }] };
  const gap = measureBetween(along, parallel);
  assert(gap.kind === "edge-edge", gap.kind);
  near(gap.distance, 40);
  const square = measureBetween(along, up);
  assert(square.kind === "angle" && square.between === "edges", JSON.stringify(square));
  near(square.angle, 90);
  const toPoint = measureBetween(along, { kind: "point", x: 50, y: 30, z: 0, label: "p" });
  near(toPoint.distance, 30);
  const floor = face(0, [0, 0, 1], { x: 0, y: 0, z: 0 }, "Floor");
  const raised = { ...along, a: { x: 0, y: 0, z: 18 }, b: { x: 100, y: 0, z: 18 }, at: { x: 50, y: 0, z: 18 }, samples: [{ x: 0, y: 0, z: 18 }, { x: 100, y: 0, z: 18 }] };
  const off = measureBetween(raised, floor);
  assert(off.kind === "edge-face", off.kind);
  near(off.distance, 18);
  const logged = measureLogPick(along);
  assert(logged.kind === "edge" && logged.length === 100 && logged.normal == null, JSON.stringify(logged));
}

console.log("measure.test.js ok");
