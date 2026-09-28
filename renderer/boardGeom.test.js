// A through opening in a sketched board has to read as a hole in the 3D view:
// the solid and the colour sheets on both faces.
import assert from "node:assert/strict";
import * as THREE from "three";
import { generateSketchBoard } from "./gen/sketchBoard.js";
import { boardGeometry, faceSheetGeometry } from "./boardGeom.js";

const r = generateSketchBoard({
  plane: "YZ",
  pull: 1,
  outline: [
    { u: 0, v: 0 },
    { u: 1150, v: 0 },
    { u: 1150, v: 930 },
    { u: 0, v: 930 },
  ],
  holes: [[
    { u: 350, v: 340 },
    { u: 360, v: 680 },
    { u: 780, v: 720 },
    { u: 800, v: 320 },
  ]],
  stock: { kind: "carcass", thickness: 15 },
  carcassColorName: "White Stipple",
  colorFace: "pull",
});
assert.deepEqual(r.validation.errors, []);
const b = r.boards[0];

function hits(geo, y, z) {
  const mesh = new THREE.Mesh(geo);
  const ray = new THREE.Raycaster(new THREE.Vector3(-10, y, z), new THREE.Vector3(1, 0, 0));
  return ray.intersectObject(mesh).length;
}

const { geo } = boardGeometry(b);
assert.ok(hits(geo, 20, 20) > 0, "the board itself is solid");
assert.equal(hits(geo, 500, 500), 0, "the opening goes through the board");

for (const id of ["A", "B"]) {
  const sheet = faceSheetGeometry(b, b.faces.find((f) => f.id === id), 0.6);
  assert.ok(hits(sheet, 20, 20) > 0, `face ${id} still covers the board`);
  assert.equal(hits(sheet, 500, 500), 0, `face ${id} is open where the board is open`);
}

console.log("boardGeom: a through opening is open in the solid and on both faces");

/* A rectangular door has no outline. The colour sheet must still be open at the lock. */
{
  const door = {
    id: "FP", name: "Door", category: "front_panel", boardType: "front_panel",
    materialThickness: 16, profilePlane: "XZ", thicknessAxis: "Y",
    x0: 0, x1: 400, y0: -16, y1: 0, z0: 0, z1: 600,
    faces: [
      { id: "A", features: [{ id: "lock", kind: "cutout", u0: 180, u1: 220, v0: 400, v1: 455, radius: 7.75, through: true, for: "lock" }] },
      { id: "B", features: [], finish: { colour: "Gloss White" } },
    ],
  };
  const along = new THREE.Vector3(0, 1, 0);
  const throughLock = (geo) => new THREE.Raycaster(new THREE.Vector3(200, -40, 427), along).intersectObject(new THREE.Mesh(geo)).length;
  const onFace = (geo) => new THREE.Raycaster(new THREE.Vector3(30, -40, 30), along).intersectObject(new THREE.Mesh(geo)).length;
  const { geo } = boardGeometry(door);
  assert.equal(throughLock(geo), 0, "the lock goes through the door");
  assert.ok(onFace(geo) > 0, "the door itself is solid");
  for (const id of ["A", "B"]) {
    const sheet = faceSheetGeometry(door, door.faces.find((f) => f.id === id), 0.6);
    assert.equal(throughLock(sheet), 0, `colour face ${id} is open at the lock`);
    assert.ok(onFace(sheet) > 0, `colour face ${id} still covers the door`);
  }
}

/* LED main channel runs to both ends; the carcass sheet must not cover it. */
{
  const t3 = {
    id: "T3", name: "T3", category: "top", boardType: "top",
    materialThickness: 15, profilePlane: "XY", thicknessAxis: "Z",
    x0: 0, x1: 400, y0: 0, y1: 200, z0: 0, z1: 15,
    faces: [
      { id: "A", finish: { colour: "White Stipple" }, features: [
        { id: "LED_MAIN", kind: "tgroove", u0: 0, u1: 400, v0: 18, v1: 32.5, depth: 6.5, for: "led" },
        { id: "LED_B1", kind: "tgroove", u0: 70, u1: 90, v0: 32.5, v1: 200, depth: 6.5, for: "led" },
        { id: "LED_B2", kind: "tgroove", u0: 310, u1: 330, v0: 32.5, v1: 200, depth: 6.5, for: "led" },
      ] },
      { id: "B", features: [] },
    ],
  };
  const down = new THREE.Vector3(0, 0, -1);
  const sheet = faceSheetGeometry(t3, t3.faces[0], 0.6);
  const sheetMesh = new THREE.Mesh(sheet);
  const see = (x, y) => new THREE.Raycaster(new THREE.Vector3(x, y, 30), down).intersectObject(sheetMesh).length;
  assert.ok(see(200, 8) > 0, "carcass colour covers the land in front of the channel");
  assert.equal(see(200, 25), 0, "carcass colour is open over the LED channel");
  assert.equal(see(80, 100), 0, "carcass colour is open over a branch");
  const { geo } = boardGeometry(t3);
  const solid = new THREE.Mesh(geo);
  const end = new THREE.Raycaster(new THREE.Vector3(-5, 25, 12), new THREE.Vector3(1, 0, 0)).intersectObject(solid);
  assert.equal(end.length, 0, "the LED channel is open at both ends");
  const rear = new THREE.Raycaster(new THREE.Vector3(80, 210, 12), new THREE.Vector3(0, -1, 0)).intersectObject(solid);
  assert.ok(rear.length > 0 && rear[0].point.y < 40, `a branch opens at the rear (hit y ${rear[0] && rear[0].point.y})`);
}

console.log("boardGeom: lock slots and LED channels stay open through the colour skin");

/* Hinge cups: blind round pockets on face A (the back of the flap); the front face stays whole. */
{
  const flap = {
    id: "FP_zone-1", name: "Front Panel", category: "front_panel", boardType: "front_panel",
    materialThickness: 16, profilePlane: "XZ", thicknessAxis: "Y",
    x0: 19, x1: 590, y0: -16, y1: 0, z0: 55, z1: 249,
    faces: [
      { id: "A", features: [
        { id: "h1", kind: "hole", center: [100, 22.5], diameter: 35, depth: 12, for: "hinge" },
        { id: "h2", kind: "hole", center: [471, 22.5], diameter: 35, depth: 12, for: "hinge" },
      ] },
      { id: "B", features: [], finish: { colour: "Gloss White" } },
    ],
  };
  const solid = new THREE.Mesh(boardGeometry(flap).geo);
  const fromBack = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, 40, z), new THREE.Vector3(0, -1, 0)).intersectObject(solid)[0];
  const fromFront = (x, z) => new THREE.Raycaster(new THREE.Vector3(x, -40, z), new THREE.Vector3(0, 1, 0)).intersectObject(solid)[0];
  const cup = fromBack(119, 77.5);
  assert.ok(cup && Math.abs(cup.point.y - -12) < 0.05, `the cup floor is 12 deep from the back (hit y ${cup && cup.point.y})`);
  const plain = fromBack(300, 150);
  assert.ok(plain && Math.abs(plain.point.y) < 0.05, "the back face is flat away from the cups");
  const front = fromFront(119, 77.5);
  assert.ok(front && Math.abs(front.point.y - -16) < 0.05, "the front face is not cut at the cup");
}

console.log("boardGeom: hinge cups are cut 12 deep into the back, the front stays whole");

/* A lid's finger hole: a round through hole, open in the solid. */
{
  const { generateLounge } = await import("./gen/lounge.js");
  const r = generateLounge({ style: "L_SHAPE", mainWidth: 2087, mainDepth: 560, lWidth: 960, lDepth: 560, height: 420 });
  const lid = r.boards.find((q) => q.id === "main_lid");
  const solid = new THREE.Mesh(boardGeometry(lid).geo);
  const down = new THREE.Vector3(0, 0, -1);
  const cx = (lid.x0 + lid.x1) / 2, cy = (lid.y0 + lid.y1) / 2;
  assert.equal(new THREE.Raycaster(new THREE.Vector3(cx, cy, 500), down).intersectObject(solid).length, 0, "the finger hole goes through the lid");
  assert.ok(new THREE.Raycaster(new THREE.Vector3(cx + 100, cy, 500), down).intersectObject(solid).length > 0, "the lid is solid beside the hole");
}

console.log("boardGeom: a lid's finger hole is open");

