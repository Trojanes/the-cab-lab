import assert from "node:assert/strict";
import { edgeBandPart, setEdgeBand } from "./edgeBand.ts";
import { faceOf, type Board } from "./model.ts";

function box(over: Partial<Board> & Pick<Board, "id" | "profilePlane" | "thicknessAxis">): Board {
  return {
    name: over.id,
    category: "panel",
    boardType: "panel",
    materialThickness: 18,
    x0: 0, x1: 100, y0: 0, y1: 100, z0: 0, z1: 18,
    ...over,
  };
}

/* Rectangle door in XZ: four edges, two banded. Absent entries are not banded. */
{
  const door = box({
    id: "FP0",
    profilePlane: "XZ",
    thicknessAxis: "Y",
    x0: 0, x1: 596, y0: -18, y1: 0, z0: 0, z1: 400,
  });
  setEdgeBand(door, 0, { thickness: 1, colour: "White Stipple" });
  setEdgeBand(door, 2, { thickness: 0.8 });
  const part = edgeBandPart(door);
  assert.deepEqual(part.axes, { u: "X", v: "Z" });
  assert.deepEqual(part.outline, [[0, 0], [596, 0], [596, 400], [0, 400]]);
  assert.deepEqual(part.edgeBand, [
    { i: 0, t: 1, colour: "White Stipple" },
    { i: 2, t: 0.8 },
  ]);
  assert.equal(part.edgeBand.some((m) => m.i === 1 || m.i === 3), false);
}

/* Clearing one edge drops it from the export and keeps a face colour. */
{
  const door = box({ id: "FP1", profilePlane: "XZ", thicknessAxis: "Y", x0: 0, x1: 100, z0: 0, z1: 200, y0: -18, y1: 0 });
  setEdgeBand(door, 1, { thickness: 2, colour: "oak" });
  faceOf(door, "E1").finish!.colour = "oak-face";
  setEdgeBand(door, 1, null);
  assert.deepEqual(faceOf(door, "E1").finish, { colour: "oak-face" });
  assert.deepEqual(edgeBandPart(door).edgeBand, []);
}

/* A notched shelf keeps every outline point. Only the listed index is banded. */
{
  const shelf = box({
    id: "MID_1",
    profilePlane: "XY",
    thicknessAxis: "Z",
    x0: 18, x1: 582, y0: 0, y1: 540, z0: 100, z1: 118,
    profileVector: [
      { x: 18, y: 0 }, { x: 582, y: 0 }, { x: 582, y: 540 }, { x: 562, y: 540 },
      { x: 562, y: 500 }, { x: 38, y: 500 }, { x: 38, y: 540 }, { x: 18, y: 540 },
    ],
  });
  setEdgeBand(shelf, 0, { thickness: 1 });
  const part = edgeBandPart(shelf);
  assert.deepEqual(part.axes, { u: "X", v: "Y" });
  assert.equal(part.outline.length, 8);
  assert.deepEqual(part.outline[0], [0, 0]);
  assert.deepEqual(part.outline[1], [564, 0]);
  assert.deepEqual(part.edgeBand, [{ i: 0, t: 1 }]);
}

/* YZ side: u is Y, v is Z. */
{
  const side = box({
    id: "SIDE_L",
    profilePlane: "YZ",
    thicknessAxis: "X",
    x0: 0, x1: 16, y0: 0, y1: 500, z0: 0, z1: 720,
  });
  setEdgeBand(side, 3, { thickness: 1 });
  const part = edgeBandPart(side);
  assert.deepEqual(part.axes, { u: "Y", v: "Z" });
  assert.deepEqual(part.outline, [[0, 0], [500, 0], [500, 720], [0, 720]]);
  assert.deepEqual(part.edgeBand, [{ i: 3, t: 1 }]);
}

for (const [i, band] of [[4, { thickness: 1 }], [-1, { thickness: 1 }], [1.5, { thickness: 1 }], [0, { thickness: 0 }], [0, { thickness: Number.NaN }]] as const) {
  const door = box({ id: "BAD", profilePlane: "XZ", thicknessAxis: "Y" });
  assert.throws(() => setEdgeBand(door, i as number, band), `${i} ${JSON.stringify(band)}`);
}

console.log("edgeBand ok");
