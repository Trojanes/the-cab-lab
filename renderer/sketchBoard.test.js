import assert from "node:assert/strict";
import { generateSketchBoard } from "../generators/sketchBoard/generator.ts";
import {
  BOARD_MIN, colourFaceValue, faceViewFrame, localBoxOf, onSketchFace, onSketchPlane, originDelta, outlineSpan, remembered,
  shiftGrooves, sketchBoardFromPoints, sketchBoardFromUV, sketchBoardPlacement, sketchItemsFromBoard, stockChoices,
} from "./sketchBoard.js";
import { fromUV } from "./sketch2d.js";

const finish = {
  carcass: { name: "White Stipple" },
  door: {
    series: "acrylic",
    sides: "single",
    colors: [{ id: "A", name: "Gloss White" }, { id: "B", name: "Gloss Ash" }],
  },
};
const stock = {
  carcass: { thickness: 16 },
  partition: { thickness: 18 },
  door: { thickness: 16 },
};

function worldOf(pose, board) {
  return {
    x0: pose.x + board.x0, x1: pose.x + board.x1,
    y0: pose.y + board.y0, y1: pose.y + board.y1,
    z0: pose.z + board.z0, z1: pose.z + board.z1,
  };
}

const carcass = { id: "carcass", kind: "carcass", thickness: 16, carcassColorName: "White Stipple", single: false, colorFace: "pull" };

/* ---- floor face, thickness up, generator box sits on the rectangle ---- */
{
  const face = { axis: "z", value: 0, dir: 1 };
  const placed = sketchBoardPlacement(face, { x: 100, y: 200, z: 0 }, { x: 500, y: 800, z: 0 }, carcass);
  assert.ok(placed);
  assert.deepEqual(placed.pose, { x: 100, y: 200, z: 0, rotX: 0, rotY: 0, rotZ: 0 });
  assert.equal(placed.params.plane, "XY");
  assert.equal(placed.params.pull, 1);
  assert.deepEqual(placed.params.outline, [
    { u: 0, v: 0 }, { u: 400, v: 0 }, { u: 400, v: 600 }, { u: 0, v: 600 },
  ]);
  const gen = generateSketchBoard(placed.params);
  assert.deepEqual(gen.validation.errors, []);
  const b = gen.boards[0];
  const local = localBoxOf(placed.params);
  assert.deepEqual([b.x0, b.x1, b.y0, b.y1, b.z0, b.z1], [local.x0, local.x1, local.y0, local.y1, local.z0, local.z1]);
  assert.deepEqual(worldOf(placed.pose, b), placed.box);
  assert.deepEqual(placed.box, { x0: 100, x1: 500, y0: 200, y1: 800, z0: 0, z1: 16 });
  assert.equal(b.milling, "either");
}

/* ---- underside: the slab hangs below the face ---- */
{
  const face = { axis: "z", value: 400, dir: -1 };
  const placed = sketchBoardPlacement(face, { x: 0, y: 0, z: 400 }, { x: 200, y: 300, z: 400 }, carcass);
  const b = generateSketchBoard(placed.params).boards[0];
  assert.equal(placed.params.pull, -1);
  assert.deepEqual([b.z0, b.z1], [-16, 0]);
  assert.deepEqual(worldOf(placed.pose, b), placed.box);
  assert.deepEqual([placed.box.z0, placed.box.z1], [384, 400]);
}

/* ---- a side face grows along X, opposite the positive axis ---- */
{
  const face = { axis: "x", value: 1000, dir: -1 };
  const placed = sketchBoardPlacement(face, { x: 1000, y: 10, z: 20 }, { x: 1000, y: 410, z: 220 }, carcass);
  assert.equal(placed.params.plane, "YZ");
  assert.equal(placed.params.pull, -1);
  assert.deepEqual(placed.pose, { x: 1000, y: 10, z: 20, rotX: 0, rotY: 0, rotZ: 0 });
  const b = generateSketchBoard(placed.params).boards[0];
  assert.deepEqual(worldOf(placed.pose, b), placed.box);
  assert.deepEqual([placed.box.x0, placed.box.x1], [984, 1000]);
  assert.deepEqual([placed.box.y0, placed.box.y1, placed.box.z0, placed.box.z1], [10, 410, 20, 220]);
}

/* ---- a polyline L on the right wall: same world box as the generator, outline kept ---- */
{
  const face = { axis: "x", value: 1000, dir: -1 };
  const uv = [[100, 50], [700, 50], [700, 250], [300, 250], [300, 650], [100, 650]];
  const placed = sketchBoardFromPoints(face, uv.map(([u, v]) => fromUV(face, u, v)), carcass);
  assert.ok(placed);
  assert.deepEqual(placed.pose, { x: 1000, y: 100, z: 50, rotX: 0, rotY: 0, rotZ: 0 });
  assert.deepEqual(placed.params.outline, [
    { u: 0, v: 0 }, { u: 600, v: 0 }, { u: 600, v: 200 }, { u: 200, v: 200 }, { u: 200, v: 600 }, { u: 0, v: 600 },
  ]);
  const gen = generateSketchBoard(placed.params);
  assert.deepEqual(gen.validation.errors, []);
  const b = gen.boards[0];
  assert.deepEqual(worldOf(placed.pose, b), placed.box);
  assert.deepEqual([placed.box.x0, placed.box.x1, placed.box.y0, placed.box.y1, placed.box.z0, placed.box.z1], [984, 1000, 100, 700, 50, 650]);
  assert.equal(b.faces.filter((f) => f.id.startsWith("E")).length, 6, "one edge face per outline edge");
}

/* ---- a disc and a filleted rectangle: the placement box is the generated box ---- */
{
  const face = { axis: "z", value: 0, dir: 1 };
  const disc = sketchBoardFromUV(face, { pts: [[600, 300], [400, 300]], b: [1, 1] }, carcass);
  assert.ok(disc);
  const d = generateSketchBoard(disc.params);
  assert.deepEqual(d.validation.errors, []);
  const w = worldOf(disc.pose, d.boards[0]);
  for (const k of ["x0", "x1", "y0", "y1", "z0", "z1"]) assert.ok(Math.abs(w[k] - disc.box[k]) < 0.01, `disc ${k}`);
  assert.ok(Math.abs(disc.box.x0 - 400) < 0.01 && Math.abs(disc.box.y0 - 200) < 0.01 && Math.abs(disc.box.y1 - 400) < 0.01);
  const q = Math.tan(Math.PI / 8);
  const round = sketchBoardFromUV(face, { pts: [[0, 0], [500, 0], [500, 350], [450, 400], [0, 400]], b: [0, 0, q, 0, 0] }, carcass);
  const g = generateSketchBoard(round.params);
  assert.deepEqual(g.validation.errors, []);
  assert.deepEqual(worldOf(round.pose, g.boards[0]), round.box);
  assert.equal(round.params.outline[2].b, q);
}

/* ---- under the minimum, no board ---- */
{
  const face = { axis: "z", value: 0, dir: 1 };
  assert.equal(sketchBoardPlacement(face, { x: 0, y: 0, z: 0 }, { x: BOARD_MIN - 1, y: 200, z: 0 }, carcass), null);
}

/* ---- single-sided colour face is remembered with the door, not with carcass ---- */
{
  const choices = stockChoices(finish, stock);
  assert.deepEqual(choices.map((c) => c.id), ["carcass", "partition", "door:A", "door:B"]);
  const again = remembered({ stockId: "door:B", colorFace: "sketch" }, choices);
  assert.equal(again.id, "door:B");
  assert.equal(again.colorFace, "sketch");
  assert.equal(again.colour, "Gloss Ash");
  const carcassRow = remembered({ stockId: "carcass", colorFace: "sketch" }, choices);
  assert.equal(carcassRow.colorFace, "pull");
  const back = remembered({ stockId: "door:A", colorFace: "sketch" }, choices);
  assert.equal(back.colorFace, "sketch");
  assert.equal(colourFaceValue({ axis: "z", value: 0, dir: 1 }, 16, "pull"), 16);
  assert.equal(colourFaceValue({ axis: "z", value: 0, dir: 1 }, 16, "sketch"), 0);
  assert.equal(colourFaceValue({ axis: "z", value: 400, dir: -1 }, 16, "pull"), 384);
}

/* ---- a single-sided pull paints the outer face; the local box is unchanged ---- */
{
  const choice = {
    id: "door:A", kind: "door", thickness: 16, colour: "Gloss White",
    doorSides: "single", doorSeries: "acrylic", carcassColorName: "White Stipple",
    single: true, colorFace: "pull",
  };
  const placed = sketchBoardPlacement({ axis: "z", value: 0, dir: 1 }, { x: 0, y: 0, z: 0 }, { x: 400, y: 600, z: 0 }, choice);
  const gen = generateSketchBoard(placed.params);
  const b = gen.boards[0];
  assert.equal(b.milling, "B");
  assert.equal(b.faces.find((f) => f.id === "A").finish.colour, "Gloss White");
  assert.equal(outlineSpan(placed.params).u, 400);
  assert.equal(outlineSpan(placed.params).v, 600);
  assert.equal(outlineSpan(placed.params).t, 16);
}

/* ---- the face view looks along the normal, tilted off ±Z ---- */
{
  const floor = faceViewFrame({ axis: "z", value: 0, dir: 1, ext: { x: [0, 4000], y: [0, 2000], z: [0, 0] } });
  assert.deepEqual(floor.center, { x: 2000, y: 1000, z: 0 });
  assert.ok(floor.normal.z > 0.9);
  assert.ok(floor.normal.y < 0);
  assert.equal(floor.radius, 2000);
  const ceiling = faceViewFrame({ axis: "z", value: 1800, dir: -1, ext: { x: [0, 1000], y: [0, 1000], z: [1800, 1800] } });
  assert.ok(ceiling.normal.z < 0);
  const wall = faceViewFrame({ axis: "x", value: 4000, dir: -1, ext: { x: [4000, 4000], y: [0, 3000], z: [0, 1800] } });
  assert.ok(wall.normal.x < -0.9);
  assert.equal(wall.normal.y, 0);
  assert.equal(wall.normal.z, 0);
}

/* ---- corners on this face first; other corners only when they lie in the plane ---- */
{
  const face = { axis: "z", value: 0, dir: 1, ext: { x: [0, 1000], y: [0, 800], z: [0, 0] } };
  assert.equal(onSketchFace({ x: 0, y: 0, z: 0 }, face), true);
  assert.equal(onSketchFace({ x: 0, y: 0, z: 1800 }, face), false);
  assert.equal(onSketchPlane({ x: 500, y: 2000, z: 0 }, face), true);
  assert.equal(onSketchFace({ x: 500, y: 2000, z: 0 }, face), false);
  const wall = { axis: "x", value: 1000, dir: -1, ext: { x: [1000, 1000], y: [0, 2000], z: [0, 1800] } };
  assert.equal(onSketchFace({ x: 1000, y: 0, z: 0 }, wall), true);
  assert.equal(onSketchPlane({ x: 1000, y: 4000, z: 900 }, wall), true);
  assert.equal(onSketchPlane({ x: 1100, y: 0, z: 0 }, wall), false);
}

/* ---- edit sketch: the stored outline opens back to the same board ---- */
{
  const face = { axis: "z", value: 0, dir: 1 };
  const placed = sketchBoardPlacement(face, { x: 100, y: 200, z: 0 }, { x: 500, y: 800, z: 0 }, carcass);
  const hole = { pts: [[200, 300], [350, 300], [350, 450], [200, 450]], b: [0, 0, 0, 0] };
  const withHole = sketchBoardFromUV(face, { pts: [[100, 200], [500, 200], [500, 800], [100, 800]], b: [0, 0, 0, 0] }, carcass, [hole]);
  const cab = { id: "cab-1", pose: withHole.pose, params: { ...withHole.params, grain: { front: "horizontal" } } };
  const opened = sketchItemsFromBoard(cab);
  assert.equal(opened.ok, true);
  assert.equal(opened.items.length, 2);
  assert.equal(opened.face.axis, "z");
  assert.equal(opened.face.value, 0);
  assert.equal(opened.face.dir, 1);
  const again = sketchBoardFromUV(opened.face, opened.items[0], opened.choice, opened.items.slice(1));
  assert.deepEqual(again.pose, withHole.pose);
  assert.deepEqual(again.params.outline, withHole.params.outline);
  assert.deepEqual(again.params.holes, withHole.params.holes);
  assert.equal(sketchItemsFromBoard({ ...cab, pose: { ...cab.pose, rotZ: 90 } }).reason, "this board was rotated");
  assert.equal(sketchItemsFromBoard({ ...cab, overrides: { boards: { BOARD: { x: 12 } } } }).reason, "this board was nudged");
  const q = Math.tan(Math.PI / 8);
  const round = sketchBoardFromUV(face, { pts: [[0, 0], [500, 0], [500, 350], [450, 400], [0, 400]], b: [0, 0, q, 0, 0] }, carcass);
  const roundOpen = sketchItemsFromBoard({ id: "cab-2", pose: round.pose, params: round.params });
  const roundAgain = sketchBoardFromUV(roundOpen.face, roundOpen.items[0], roundOpen.choice);
  assert.equal(roundAgain.params.outline[2].b, q);
  assert.ok(Math.abs(roundAgain.pose.x - round.pose.x) < 0.001 && Math.abs(roundAgain.pose.y - round.pose.y) < 0.001);
  const disc = sketchBoardFromUV(face, { pts: [[600, 300], [400, 300]], b: [1, 1] }, carcass);
  const discOpen = sketchItemsFromBoard({ id: "cab-3", pose: disc.pose, params: disc.params });
  const discAgain = sketchBoardFromUV(discOpen.face, discOpen.items[0], discOpen.choice);
  for (const k of ["x", "y", "z"]) assert.ok(Math.abs(discAgain.pose[k] - disc.pose[k]) < 0.001, `disc pose ${k}`);
  assert.deepEqual(discAgain.params.outline.map((p) => p.b), [1, 1]);
  const moved = sketchItemsFromBoard(cab);
  moved.items[0].pts[0][0] -= 30;
  moved.items[0].pts[3][0] -= 30;
  const shifted = sketchBoardFromUV(moved.face, moved.items[0], moved.choice, moved.items.slice(1));
  const delta = originDelta(moved.face, cab.pose, shifted.pose);
  assert.equal(delta.du, -30);
  assert.deepEqual(
    shiftGrooves([{ id: "G1", face: "A", kind: "groove", u0: 10, u1: 40, v0: 5, v1: 8, depth: 4 }], delta.du, delta.dv),
    [{ id: "G1", face: "A", kind: "groove", u0: 40, u1: 70, v0: 5, v1: 8, depth: 4 }],
  );
  assert.equal(placed.params.plane, "XY");
}

console.log("sketchBoard placement: rectangle on a face, one board");
