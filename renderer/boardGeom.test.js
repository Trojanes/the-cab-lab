// A through opening in a sketched board has to read as a hole in the 3D view:
// the solid and the colour sheets on both faces.
import assert from "node:assert/strict";
import * as THREE from "three";
import { generateSketchBoard } from "./gen/sketchBoard.js";
import { boardGeometry, faceSheetGeometry, boardEdges, grooveFigures } from "./boardGeom.js";

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

/* A mitred bench is extruded along its depth, so the top and the waterfall's
   outer face are edge sheets. They have to face outward or the colour is culled. */
{
  const { generateKitchenCabinet } = await import("./gen/kitchen.js");
  const base = {
    globalSettings: { length: 862, depth: 270, height: 880 },
    materialThickness: 15, frontThickness: 16, bottomClearanceHeight: 70,
    columns: [{ id: "c1", width: 862, zones: [{ id: "z1", height: 810, zoneType: "left_door" }] }],
    benchTopColorName: "Chestnut",
  };
  const see = (board, face, from, dir) => {
    const sheet = faceSheetGeometry(board, face, 0.6);
    return new THREE.Raycaster(from, dir).intersectObject(new THREE.Mesh(sheet)).length;
  };
  for (const side of ["right", "left"]) {
    const r = generateKitchenCabinet({ ...base, waterfall: side });
    const bench = r.boards.find((q) => q.id === "BENCH");
    const drop = r.boards.find((q) => q.id === "WATERFALL");
    const top = bench.faces.find((f) => f.semantic === "top");
    const outer = drop.faces.find((f) => f.semantic === "outer");
    const midY = (bench.y0 + bench.y1) / 2;
    const midX = (bench.x0 + bench.x1) / 2;
    assert.ok(see(bench, top, new THREE.Vector3(midX, midY, bench.z1 + 40), new THREE.Vector3(0, 0, -1)) > 0, `${side} bench top faces up`);
    const fromX = side === "right" ? drop.x1 + 40 : drop.x0 - 40;
    const dirX = side === "right" ? -1 : 1;
    const midZ = (drop.z0 + drop.z1) / 2;
    assert.ok(see(drop, outer, new THREE.Vector3(fromX, midY, midZ), new THREE.Vector3(dirX, 0, 0)) > 0, `${side} waterfall faces out`);
  }
}

console.log("boardGeom: a mitred bench top and waterfall face outward");

/* An LED channel that runs out to the board edge is an open mouth. The rim line
   and the groove stroke stop there; they do not cross the cut. */
{
  const board = {
    id: "T3",
    profilePlane: "XY",
    thicknessAxis: "Z",
    x0: 0, x1: 200, y0: 0, y1: 100, z0: 0, z1: 15,
    profileVector: [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 100 }, { x: 0, y: 100 }],
    faces: [{
      id: "A",
      features: [
        { kind: "tgroove", for: "led", u0: 0, u1: 200, v0: 18, v1: 32.5, depth: 6.5 },
        { kind: "tgroove", for: "led", u0: 22.75, u1: 37.25, v0: 32.5, v1: 100, depth: 6.5 },
        { kind: "tgroove", for: "led", u0: 162.75, u1: 177.25, v0: 32.5, v1: 100, depth: 6.5 },
      ],
    }],
  };
  const lines = boardEdges(board, new THREE.LineBasicMaterial());
  const pos = lines.geometry.getAttribute("position").array;
  const shift = lines.position;
  const crosses = (pred) => {
    for (let i = 0; i < pos.length; i += 6) {
      const a = { x: pos[i] + shift.x, y: pos[i + 1] + shift.y, z: pos[i + 2] + shift.z };
      const c = { x: pos[i + 3] + shift.x, y: pos[i + 4] + shift.y, z: pos[i + 5] + shift.z };
      if (pred(a, c)) return true;
    }
    return false;
  };
  const onTop = (p) => Math.abs(p.z - 15) < 0.2;
  assert.equal(crosses((a, c) => onTop(a) && onTop(c) && Math.abs(a.y - 100) < 0.2 && Math.abs(c.y - 100) < 0.2
    && Math.min(a.x, c.x) < 30 && Math.max(a.x, c.x) > 30), false, "no rim line across the branch mouth");
  assert.equal(crosses((a, c) => onTop(a) && onTop(c) && Math.abs(a.x) < 0.2 && Math.abs(c.x) < 0.2
    && Math.min(a.y, c.y) < 25 && Math.max(a.y, c.y) > 25), false, "no rim line across the side opening");
  assert.equal(crosses((a, c) => onTop(a) && onTop(c) && Math.abs(a.y - 100) < 0.2 && Math.abs(c.y - 100) < 0.2
    && Math.min(a.x, c.x) < 10 && Math.max(a.x, c.x) > 10), true, "the rim beside the opening stays");
  assert.equal(crosses((a, c) => Math.abs(a.z) < 0.2 && Math.abs(c.z) < 0.2 && Math.abs(a.y - 100) < 0.2 && Math.abs(c.y - 100) < 0.2
    && Math.min(a.x, c.x) < 30 && Math.max(a.x, c.x) > 30), true, "the other face keeps its edge");
  const walls = grooveFigures(board, "A").flatMap((f) => f.walls);
  assert.equal(walls.some(([a, c]) => Math.abs(a[1] - 100) < 0.2 && Math.abs(c[1] - 100) < 0.2), false, "the groove stroke stops at the open end");
  assert.equal(walls.some(([a, c]) => Math.abs(a[1] - 32.5) < 0.2 && Math.abs(c[1] - 32.5) < 0.2
    && Math.min(a[0], c[0]) >= 22.7 && Math.max(a[0], c[0]) <= 37.3), false, "no stroke across the T");
}

console.log("boardGeom: an open LED mouth has no line across it");

/* A back-panel corner stores a bulge. The solid and the colour sheet follow the
   arc; the straight join of the two ends is the chamfer and stays outside. */
{
  const q = Math.tan(Math.PI / 8);
  const board = {
    id: "l_back",
    profilePlane: "YZ",
    thicknessAxis: "X",
    x0: 0, x1: 18, y0: 0, y1: 100, z0: 0, z1: 100,
    profileVector: [
      { y: 0, z: 0 }, { y: 100, z: 0 }, { y: 100, z: 100 },
      { y: 50, z: 100, bulge: q }, { y: 0, z: 50 },
    ],
    faces: [{ id: "A", normal: "+X" }, { id: "B", normal: "-X" }],
  };
  const { geo } = boardGeometry(board);
  const solid = new THREE.Mesh(geo);
  const hit = (y, z) => new THREE.Raycaster(new THREE.Vector3(-5, y, z), new THREE.Vector3(1, 0, 0)).intersectObject(solid).length;
  assert.ok(hit(20, 80) > 0, "the arc fills out past the straight cut");
  assert.equal(hit(5, 95), 0, "the old sharp corner stays cut away");
  const sheet = new THREE.Mesh(faceSheetGeometry(board, board.faces[0], 0.6));
  const hitSheet = (y, z) => new THREE.Raycaster(new THREE.Vector3(30, y, z), new THREE.Vector3(-1, 0, 0)).intersectObject(sheet).length;
  assert.ok(hitSheet(20, 80) > 0, "the colour sheet follows the arc");
  assert.equal(hitSheet(5, 95), 0, "the colour sheet does not fill the chamfer");
}

console.log("boardGeom: a bulged corner is an arc, not a chamfer");

