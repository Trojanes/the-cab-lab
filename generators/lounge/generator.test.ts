/**
 * Lounge 黄金测试 — L 默认参数按 spec §8，数值已翻到 Cab Lab（前脸 y∈[0,ppt]）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { generateLounge } from "./generator.ts";
import { checkPins, countPins, type PresetsFile } from "../_lib/pins.ts";
import { loungeFootprintBoxes, loungeFromDrawnRun, loungeFromPolyline, loungePolyline, pointInFootprintBoxes } from "./place.ts";

const r2 = (v: number) => Math.round(v * 1000) / 1000;
function b(id: string) {
  const board = r.boards.find((x) => x.id === id);
  assert.ok(board, `missing ${id}`);
  return board;
}
function place(id: string) {
  const board = b(id);
  const q = (v: number) => Math.round(v * 100) / 100;
  return { x0: q(board.x0), x1: q(board.x1), y0: q(board.y0), y1: q(board.y1), z0: q(board.z0), z1: q(board.z1) };
}

// The frame L (the only construction since the classic top panel was retired on 2026-10-08).
const r = generateLounge({
  style: "L_SHAPE",
  height: 420,
  partitionPanelThickness: 18,
  mainWidth: 2000,
  mainDepth: 600,
  lWidth: 1600,
  lDepth: 600,
  lPosition: "RIGHT",
});

assert.equal(r.validation.errors.length, 0);
assert.equal(r.params.construction, "frame");
assert.deepEqual(r.openings, [], "no top panel opening: the lids lie between the panels");
assert.ok(r.lids.length >= 2);
assert.ok(!r.boards.some((x) => x.slabs), "no rebated slabs");
assert.equal(r.debug?.boardFrame, "final");

{
  const entries = r.debug.provenance.entries;
  assert.ok(Object.keys(entries).length > 0, "lounge provenance is not empty");
  for (const board of r.boards) {
    for (const face of ["x0", "x1", "y0", "y1", "z0", "z1"]) {
      const e = entries[`${board.id}.${face}`];
      assert.ok(e, `${board.id}.${face} has no provenance`);
      assert.equal(e.value, board[face]);
    }
  }
  assert.equal(entries["lounge.panelHeight"]?.formula, "H - ppt");
  for (const j of r.joints) {
    assert.equal(typeof j.a?.board, "string", `${j.id} a.board`);
    assert.equal(typeof j.b?.board, "string", `${j.id} b.board`);
  }
}

/* ---------- retired: classic construction builds the frame; U is refused ---------- */
{
  const old = generateLounge({ style: "I_SHAPE", construction: "classic", mainWidth: 2000, mainDepth: 600, height: 420 } as never);
  assert.equal(old.params.construction, "frame");
  assert.ok(old.validation.warnings.some((w) => w.includes("classic lounge construction was retired")));
  assert.ok(!old.boards.some((x) => x.id === "i_top"), "no classic top panel");
  const u = generateLounge({ style: "U_SHAPE", mainWidth: 2000, mainDepth: 1600, lDepth: 600, height: 420 } as never);
  assert.ok(u.validation.errors.some((e) => e.includes("U-shaped lounge was retired")));
  assert.equal(u.boards.length, 0);
}

/* ---------- 折线放置 + L 缺口不进包络 ---------- */
{
  const boxes = loungeFootprintBoxes({
    style: "L_SHAPE", mainWidth: 2000, mainDepth: 600, lWidth: 1600, lDepth: 800, lPosition: "RIGHT",
  }, r);
  assert.equal(boxes.length, 2);
  assert.ok(pointInFootprintBoxes(200, 1200, boxes), "main leg against the back wall");
  assert.ok(pointInFootprintBoxes(1600, 200, boxes), "return toward the room");
  assert.equal(pointInFootprintBoxes(200, 100, boxes), false, "the near-left notch is empty");
  const poly = loungePolyline({ style: "L_SHAPE", mainWidth: 2000, mainDepth: 600, lWidth: 1600, lDepth: 800, lPosition: "RIGHT" });
  assert.equal(poly.length, 3);

  const iPlace = loungeFromPolyline([{ x: 100, y: 700 }, { x: 2100, y: 700 }], { mainDepth: 600, height: 420 });
  assert.equal(iPlace.params.style, "I_SHAPE");
  assert.equal(iPlace.params.mainWidth, 2000);
  assert.equal(iPlace.pose.rotZ, 0);

  const lPlace = loungeFromPolyline(
    [{ x: 0, y: 600 }, { x: 2000, y: 600 }, { x: 2000, y: 800 }],
    { mainDepth: 600, lWidth: 1600, height: 420 },
  );
  assert.equal(lPlace.params.style, "L_SHAPE");
  assert.equal(lPlace.params.lPosition, "RIGHT");
  assert.equal(lPlace.params.lDepth, 800);

  const pPlace = loungeFromPolyline(
    [{ x: 0, y: 800 }, { x: 1500, y: 800 }, { x: 4000, y: 800 }],
    { depth: 800, singleLoungeWidth: 1500 },
  );
  assert.equal(pPlace.params.style, "PARALLEL");
  assert.equal(pPlace.params.totalWidth, 4000);

  assert.throws(() => loungeFromPolyline(
    [{ x: 0, y: 0 }, { x: 0, y: 1600 }, { x: 2000, y: 1600 }, { x: 2000, y: 0 }],
    { lDepth: 600 },
  ), /U lounge was retired/);

  const drawnI = loungeFromDrawnRun({
    a: { x: 0, y: 800 }, b: { x: 2000, y: 800 }, depth: 600, roomSign: 1, style: "I", height: 420,
  });
  assert.equal(drawnI.params.mainWidth, 2000);
  assert.equal(drawnI.params.mainDepth, 600);
  assert.deepEqual(drawnI.pose, { x: 0, y: 200, z: 0, rotZ: 0 });

  const drawnRev = loungeFromDrawnRun({
    a: { x: 2000, y: 800 }, b: { x: 0, y: 800 }, depth: 600, roomSign: -1, style: "I", height: 420,
  });
  assert.deepEqual(drawnRev.pose, { x: 0, y: 200, z: 0, rotZ: 0 });
  assert.equal(drawnRev.params.mainWidth, 2000);

  const drawnRight = loungeFromDrawnRun({
    a: { x: 0, y: 800 }, b: { x: 400, y: 800 }, depth: 600, roomSign: 1,
    style: "L", side: "RIGHT", wing: 1600, height: 420,
  });
  assert.equal(drawnRight.params.style, "L_SHAPE");
  assert.equal(drawnRight.params.lPosition, "RIGHT");
  assert.equal(drawnRight.params.mainWidth, 400);
  assert.equal(drawnRight.params.lWidth, 1600);
  assert.equal(drawnRight.params.mainDepth, 600);
  assert.equal(drawnRight.params.lDepth, 600);
  assert.deepEqual(drawnRight.pose, { x: 0, y: -800, z: 0, rotZ: 0 });

  const drawnLeft = loungeFromDrawnRun({
    a: { x: 1600, y: 800 }, b: { x: 2000, y: 800 }, depth: 600, roomSign: 1,
    style: "L", side: "LEFT", wing: 1600, height: 420,
  });
  assert.equal(drawnLeft.params.lPosition, "LEFT");
  assert.equal(drawnLeft.params.mainWidth, 400);
  assert.deepEqual(drawnLeft.pose, { x: 1000, y: -800, z: 0, rotZ: 0 });
}

/* ---------- 框架式平行沙发（缺省）：19'6 Rear Door，两段 560 × 900，中柜 502 × 270 × 457 ---------- */
{
  const f = generateLounge({
    style: "PARALLEL", height: 420, partitionPanelThickness: 18, totalWidth: 1880, singleLoungeWidth: 560, depth: 900,
    wheelAvoidanceEnabled: true, avoidanceDepth: 380, avoidanceHeight: 270,
    hasMiddleCabinet: true, middleCabinet: { width: 502, depth: 270, height: 457, startHeight: 319 /* ignored: on the cover */ },
  });
  const fb = (id: string) => { const x = f.boards.find((q) => q.id === id); assert.ok(x, `missing ${id}`); return x!; };
  const fp = (id: string) => { const x = fb(id); const q = (v: number) => Math.round(v * 100) / 100; return { x0: q(x.x0), x1: q(x.x1), y0: q(x.y0), y1: q(x.y1), z0: q(x.z0), z1: q(x.z1) }; };
  assert.deepEqual(f.validation.errors, []);
  assert.deepEqual(f.validation.warnings, []);
  assert.equal(f.params.construction, "frame");
  assert.equal(f.boards.length, 21);
  // Left run, like the L wing: seat front facing the gap, aisle end, a support on each side, lid on them.
  assert.deepEqual(fp("left_side"), { x0: 542, x1: 560, y0: 0, y1: 900, z0: 0, z1: 420 });
  assert.deepEqual(fp("left_front"), { x0: 0, x1: 542, y0: 0, y1: 18, z0: 0, z1: 420 });
  assert.deepEqual(fp("left_outer_support"), { x0: 0, x1: 18, y0: 18, y1: 881, z0: 0, z1: 402 });
  assert.deepEqual(fp("left_inner_support"), { x0: 524, x1: 542, y0: 18, y1: 881, z0: 0, z1: 402 });
  assert.deepEqual(fp("left_lid"), { x0: 2, x1: 540, y0: 20, y1: 879, z0: 402, z1: 420 });
  // The rear rail always lies on the wall, down onto the cover, tongue 8.5 into a half slot on the seat front.
  assert.deepEqual(fp("left_rear_rail"), { x0: 0, x1: 550.5, y0: 881, y1: 899, z0: 270, z1: 420 });
  const slot = fb("left_side").faces!.find((q) => q.id === "B")!.features.find((x) => x.for === "left_rear_rail")!;
  assert.deepEqual([slot.kind, slot.u0, slot.u1, slot.v0, slot.v1, slot.depth, slot.through], ["groove", 880.5, 899.5, 269.5, 420, 9, undefined]);
  assert.equal(fb("left_side").milling, "B");
  // Right run mirrors it about the middle; its slot is on the seat front's other face.
  assert.deepEqual(fp("right_side"), { x0: 1320, x1: 1338, y0: 0, y1: 900, z0: 0, z1: 420 });
  assert.deepEqual(fp("right_rear_rail"), { x0: 1329.5, x1: 1880, y0: 881, y1: 899, z0: 270, z1: 420 });
  assert.ok(fb("right_side").faces!.find((q) => q.id === "A")!.features.some((x) => x.for === "right_rear_rail"));
  const pts = (id: string) => (fb(id).profileVector as Array<Record<string, number>>).map((p) => `${p.y ?? p.x},${p.z}`);
  assert.ok(pts("left_side").includes("520,270") && pts("left_side").includes("900,270"), "seat front cut round the wheel-arch cover");
  assert.ok(pts("left_inner_support").includes("520,270") && pts("left_outer_support").includes("881,270"), "supports cut round the cover");
  assert.deepEqual(fp("parallel_avoidance_top"), { x0: 0, x1: 1880, y0: 520, y1: 900, z0: 252, z1: 270 });
  // Middle cabinet: centred, 16 stock, divider 15 carcass, lock 30.5 under the divider and 30 + 35 from the meeting edge.
  // It stands on the wheel-arch cover's top (270): width, depth and height are all it takes.
  assert.deepEqual(fp("middle_cabinet_bottom"), { x0: 689, x1: 1191, y0: 630, y1: 900, z0: 270, z1: 286 });
  assert.deepEqual(fp("middle_cabinet_top"), { x0: 689, x1: 1191, y0: 630, y1: 900, z0: 711, z1: 727 });
  assert.deepEqual(fp("middle_cabinet_mid_divider"), { x0: 698, x1: 1182, y0: 646, y1: 900, z0: 491, z1: 506 }); // tongues 7 each side
  assert.deepEqual(f.locks.map((l) => [l.panelId, l.centerX, l.centerZ]), [["middle_cabinet_left_door", 874, 460.5], ["middle_cabinet_right_door", 1006, 460.5]]);
  assert.deepEqual(f.params.middleCabinet, { width: 502, depth: 270, height: 457, startHeight: 270 });
  const groove = f.grooves.find((g) => g.boardId === "middle_cabinet_left")!;
  assert.deepEqual([groove.v0, groove.v1, groove.depth], [204.5, 220.5, 7.5]);
  // Bands.
  const bands = (id: string) => fb(id).faces!.filter((q) => q.id.startsWith("E") && q.finish?.edgeBand).map((q) => `${q.normal}${q.finish!.edgeBand!.colour === "White Stipple" ? "" : "*"}`).sort();
  assert.deepEqual(bands("left_front"), ["+Z"]);
  assert.deepEqual(bands("left_side"), ["+Z", "-Y"]);
  assert.deepEqual(bands("left_rear_rail"), ["+Z"], "on the cover: its underside is hidden");
  for (const id of ["left_outer_support", "left_inner_support"]) assert.deepEqual(bands(id), [], id);
  assert.deepEqual(bands("left_lid").length, 4);
  assert.deepEqual(bands("parallel_avoidance_top"), ["-Y"]);
  assert.deepEqual(bands("middle_cabinet_left_door"), ["+X*", "+Z*", "-X*", "-Z*"]);
  assert.deepEqual(bands("middle_cabinet_top"), ["+X", "-X", "-Y"]);
  assert.deepEqual(bands("middle_cabinet_mid_divider"), ["-Y"]);
  for (const id of ["lg_left_rear_rail_side", "lg_right_inner_support", "lg_right_lid_on_support"]) assert.ok(f.joints.some((j) => j.id === id), id);
  // Without the cover the rear rail is 100 + T high and its underside shows.
  const bare = generateLounge({ style: "PARALLEL", totalWidth: 1880, singleLoungeWidth: 560, depth: 900, height: 420 });
  assert.equal(bare.boards.find((q) => q.id === "left_rear_rail")!.z0, 302);
  assert.ok(bare.boards.find((q) => q.id === "left_rear_rail")!.faces!.some((q) => q.normal === "-Z" && q.finish?.edgeBand));
  // Middle cabinet on by default when the gap takes 300: rule width 600, or the gap when narrower.
  assert.deepEqual(bare.params.middleCabinet, { width: 600, depth: 350, height: 500, startHeight: 0 }, "no cover: on the floor");
  const narrow = generateLounge({ style: "PARALLEL", totalWidth: 1600, singleLoungeWidth: 560, depth: 900 });
  assert.equal(narrow.params.middleCabinet!.width, 480);
  assert.equal(generateLounge({ style: "PARALLEL", totalWidth: 1300, singleLoungeWidth: 560, depth: 900 }).params.middleCabinet, null);
  assert.equal(generateLounge({ style: "PARALLEL", totalWidth: 1880, singleLoungeWidth: 560, depth: 900, hasMiddleCabinet: false }).params.middleCabinet, null);
  assert.ok(generateLounge({ style: "PARALLEL", totalWidth: 1600, singleLoungeWidth: 560, depth: 900, middleCabinet: { width: 600 } })
    .validation.errors.some((e) => e.includes("exceeds the middle gap")), "a cabinet in the seats is an error");
  // Aisle drawers: the L wing drawer at both aisle ends.
  const dr = generateLounge({
    style: "PARALLEL", height: 420, partitionPanelThickness: 18, frontPanelThickness: 16, totalWidth: 1880, singleLoungeWidth: 560, depth: 900,
    wheelAvoidanceEnabled: true, avoidanceDepth: 380, avoidanceHeight: 270, aisleAccess: "DRAWER",
  });
  const db = (id: string) => { const x = dr.boards.find((q) => q.id === id); assert.ok(x, `missing ${id}`); return x!; };
  assert.deepEqual(dr.validation.errors, []);
  assert.equal(dr.params.aisleAccess, "DRAWER");
  assert.ok(!dr.boards.some((q) => q.id === "left_front" || q.id === "right_front"), "the aisle ends give way to the drawers");
  assert.deepEqual([db("left_drawer_strip").x0, db("left_drawer_strip").x1, db("left_drawer_strip").z0], [0, 542, 302]);
  assert.deepEqual([db("left_drawer_front").x0, db("left_drawer_front").x1, db("left_drawer_front").z0, db("left_drawer_front").z1], [2, 540, 2, 300]);
  assert.deepEqual([db("right_drawer_front").x0, db("right_drawer_front").x1], [1340, 1878]);
  assert.deepEqual([db("left_drawer_rail").x0, db("left_drawer_rail").x1], [9.5, 532.5]);
  assert.equal(db("left_inner_support").y0, 16);
  assert.deepEqual([db("left_lid").y0, db("left_lid").y1], [18, 879]);
  const pocketFace = (id: string) => db(id).faces!.find((q) => q.features.some((x) => x.for === `${id.split("_")[0]}_drawer_rail`))?.id;
  assert.deepEqual(["left_outer_support", "left_inner_support", "right_outer_support", "right_inner_support"].map(pocketFace), ["A", "B", "B", "A"]);
  assert.ok(dr.locks.some((l) => l.panelId === "left_drawer_front" && l.centerZ === 269.5));
  const dband = (id: string) => db(id).faces!.filter((q) => q.id.startsWith("E") && q.finish?.edgeBand).map((q) => `${q.normal}:${q.finish!.edgeBand!.colour}`).sort();
  assert.deepEqual(dband("left_side"), ["+Z:White Stipple", "-Y:Gloss White"], "the seat front's aisle end frames the drawer");
  assert.equal(dband("left_drawer_front").length, 4);
  // The cover must leave the rear rail at least 100 + T.
  assert.ok(generateLounge({ style: "PARALLEL", totalWidth: 1880, singleLoungeWidth: 560, depth: 900, wheelAvoidanceEnabled: true, avoidanceDepth: 380, avoidanceHeight: 320 })
    .validation.errors.some((e) => e.includes("wheel-arch height")));
}

/* ---------- 框架式 L（默认）：21 Bunk 新卡座，拐角段 960、盖缝 2 ---------- */
{
  const f = generateLounge({ style: "L_SHAPE", height: 420, partitionPanelThickness: 18, mainWidth: 2087, mainDepth: 560, lWidth: 960, lDepth: 560, lPosition: "RIGHT" });
  const fb = (id: string) => { const x = f.boards.find((q) => q.id === id); assert.ok(x, `missing ${id}`); return x!; };
  const fp = (id: string) => { const x = fb(id); const q = (v: number) => Math.round(v * 100) / 100; return { x0: q(x.x0), x1: q(x.x1), y0: q(x.y0), y1: q(x.y1), z0: q(x.z0), z1: q(x.z1) }; };
  assert.deepEqual(f.validation.errors, []);
  assert.equal(f.params.construction, "frame");
  assert.equal(f.boards.length, 14);
  assert.ok(f.boards.every((x) => x.stock?.kind === "partition" && x.materialThickness === 18), "all 18 mm partition stock");
  assert.deepEqual(f.openings, []);
  assert.deepEqual(f.footprint.main, { x0: 0, x1: 1527, y0: 400, y1: 960 });
  assert.deepEqual(f.footprint.l, { x0: 1527, x1: 2087, y0: 0, y1: 960 });
  // Outer shell, full height.
  assert.deepEqual(fp("main_front"), { x0: 0, x1: 1527, y0: 400, y1: 418, z0: 0, z1: 420 });
  assert.deepEqual(fp("main_end"), { x0: 0, x1: 18, y0: 418, y1: 960, z0: 0, z1: 420 });
  assert.deepEqual(fp("l_side"), { x0: 1527, x1: 1545, y0: 0, y1: 960, z0: 0, z1: 420 });
  assert.deepEqual(fp("l_outer_side"), { x0: 2069, x1: 2087, y0: 0, y1: 960, z0: 0, z1: 420 });
  assert.deepEqual(fp("l_front"), { x0: 1545, x1: 2069, y0: 0, y1: 18, z0: 0, z1: 420 });
  // Rear rail 1 off the wall, 118 high; main inner frame; wing supports.
  assert.deepEqual(fp("back_rail"), { x0: 0, x1: 2087, y0: 941, y1: 959, z0: 302, z1: 420 });
  assert.deepEqual(fp("main_end_support"), { x0: 18, x1: 36, y0: 418, y1: 941, z0: 0, z1: 402 });
  assert.deepEqual(fp("main_rail_back"), { x0: 18, x1: 1527, y0: 922, y1: 940, z0: 302, z1: 402 });
  assert.deepEqual(fp("main_rail_front"), { x0: 18, x1: 1527, y0: 419, y1: 437, z0: 302, z1: 402 });
  assert.deepEqual(fp("l_support_inner"), { x0: 1545, x1: 1563, y0: 18, y1: 941, z0: 0, z1: 402 });
  assert.deepEqual(fp("l_support_outer"), { x0: 2051, x1: 2069, y0: 18, y1: 941, z0: 0, z1: 402 });
  // Lids: the whole top, 2 clear all round, flush at 420, Ø50 finger hole in the middle.
  assert.deepEqual(fp("main_lid"), { x0: 20, x1: 1525, y0: 420, y1: 939, z0: 402, z1: 420 });
  assert.deepEqual(fp("l_lid"), { x0: 1547, x1: 2067, y0: 20, y1: 939, z0: 402, z1: 420 });
  assert.deepEqual(f.lids.map((l) => [l.id, l.width, l.depth, l.holeDiameter]), [["main_lid", 1505, 519, 50], ["l_lid", 520, 919, 50]]);
  // Halving slots: rail notches 20 up from its bottom, panel slots from 317 to the top, 19 wide.
  const pts = (id: string) => (fb(id).profileVector as Array<Record<string, number>>).map((p) => `${p.y ?? p.x},${p.z}`);
  assert.ok(pts("main_end").includes("941,317") && pts("main_end").includes("941,420"), "main_end slot at the wall");
  assert.ok(pts("back_rail").includes("19,322") && pts("back_rail").includes("1526.5,302") && pts("back_rail").includes("1545.5,322"), "rear rail notches");
  assert.ok(pts("main_end_support").includes("922,317") && pts("main_end_support").includes("437,402"), "support slots for both rails");
  // Edge bands, carcass colour: seat ring tops, the wing sides' room ends, lids all round, rail edges facing into the storage.
  const bands = (id: string) => fb(id).faces!.filter((q) => q.id.startsWith("E") && q.finish?.edgeBand).map((q) => q.normal).sort();
  for (const id of ["main_front", "l_front", "main_end"]) assert.deepEqual(bands(id), ["+Z"], id);
  for (const id of ["l_side", "l_outer_side"]) assert.deepEqual(bands(id), ["+Z", "-Y"], id);
  assert.deepEqual(bands("back_rail"), ["+Z", "-Z", "-Z"]);
  for (const id of ["main_rail_back", "main_rail_front"]) assert.deepEqual(bands(id), ["-Z"], id);
  for (const id of ["main_lid", "l_lid"]) assert.equal(bands(id).length, 4, id);
  for (const id of ["main_end_support", "main_l_support", "l_support_inner", "l_support_outer"]) assert.deepEqual(bands(id), [], id);
  assert.ok(f.boards.every((q) => (q.faces ?? []).every((e) => !e.finish?.edgeBand || e.finish.edgeBand.colour === "White Stipple")));
  assert.ok(f.joints.some((j) => j.id === "lg_rear_rail_l_side"));
  assert.ok(f.joints.some((j) => j.id === "lg_main_lid_on_rail"));
  // Mirrored, and the wing minimum.
  const left = generateLounge({ style: "L_SHAPE", mainWidth: 2087, mainDepth: 560, lWidth: 960, lDepth: 560, lPosition: "LEFT" });
  assert.deepEqual(left.footprint.l, { x0: 0, x1: 560, y0: 0, y1: 960 });
  assert.equal(left.boards.find((q) => q.id === "main_end")!.x0, 2069);
  assert.ok(generateLounge({ style: "L_SHAPE", mainWidth: 2087, mainDepth: 560, lWidth: 960, lDepth: 280 }).validation.errors.some((e) => e.includes("at least 300")));
}

/* ---------- 框架式 I（默认）：L 主段单独成段，前板盖两端，盖子超长分块 ---------- */
{
  const f = generateLounge({ style: "I_SHAPE", height: 420, partitionPanelThickness: 18, mainWidth: 2000, mainDepth: 600 });
  const fb = (id: string) => { const x = f.boards.find((q) => q.id === id); assert.ok(x, `missing ${id}`); return x!; };
  const fp = (id: string) => { const x = fb(id); const q = (v: number) => Math.round(v * 100) / 100; return { x0: q(x.x0), x1: q(x.x1), y0: q(x.y0), y1: q(x.y1), z0: q(x.z0), z1: q(x.z1) }; };
  assert.deepEqual(f.validation.errors, []);
  assert.equal(f.params.construction, "frame");
  assert.equal(f.boards.length, 11);
  assert.ok(f.boards.every((x) => x.stock?.kind === "partition" && x.materialThickness === 18));
  assert.deepEqual(fp("i_front"), { x0: 0, x1: 2000, y0: 0, y1: 18, z0: 0, z1: 420 });
  assert.deepEqual(fp("i_left_end"), { x0: 0, x1: 18, y0: 18, y1: 600, z0: 0, z1: 420 });
  assert.deepEqual(fp("i_right_end"), { x0: 1982, x1: 2000, y0: 18, y1: 600, z0: 0, z1: 420 });
  assert.deepEqual(fp("back_rail"), { x0: 0, x1: 2000, y0: 581, y1: 599, z0: 302, z1: 420 });
  assert.deepEqual(fp("i_rail_back"), { x0: 18, x1: 1982, y0: 562, y1: 580, z0: 302, z1: 402 });
  // 2000 long: the lid area 1960 is past FRAME_LID_MAX_LENGTH 1600 → two lids 2 apart over a middle support.
  assert.deepEqual(fp("i_mid_support_1"), { x0: 991, x1: 1009, y0: 18, y1: 581, z0: 0, z1: 402 });
  assert.deepEqual(f.lids.map((l) => [l.id, l.x0, l.width, l.depth]), [["i_lid_1", 20, 979, 559], ["i_lid_2", 1001, 979, 559]]);
  const pts = (id: string) => (fb(id).profileVector as Array<Record<string, number>>).map((p) => `${p.x ?? p.y},${p.z}`);
  assert.ok(pts("i_rail_back").includes("990.5,322") && pts("i_rail_back").includes("1009.5,302"), "rail halving notch over the middle support");
  assert.ok(pts("i_mid_support_1").includes("562,317") && pts("i_mid_support_1").includes("37,402"), "middle support slots for both rails");
  const bands = (id: string) => fb(id).faces!.filter((q) => q.id.startsWith("E") && q.finish?.edgeBand).map((q) => q.normal).sort();
  for (const id of ["i_front", "i_left_end", "i_right_end"]) assert.deepEqual(bands(id), ["+Z"], id);
  for (const id of ["i_rail_back", "i_rail_front"]) assert.deepEqual(bands(id), ["-Z", "-Z"], id);
  for (const id of ["i_lid_1", "i_lid_2"]) assert.equal(bands(id).length, 4, id);
  for (const id of ["lg_i_rail_back_mid_1", "lg_i_lid_2_on_rail", "lg_i_front_to_left"]) assert.ok(f.joints.some((j) => j.id === id), id);
  // Short run: one lid.
  const short = generateLounge({ style: "I_SHAPE", mainWidth: 1400, mainDepth: 600, height: 420 });
  assert.deepEqual(short.lids.map((l) => [l.id, l.width]), [["i_lid", 1360]]);
  assert.ok(!short.boards.some((q) => q.id.includes("mid_support")));
}

/* ---------- 框架 L 端抽屉：固定条 100 + 板厚，抽屉面四周 2 缝，横条舌头进托板 ---------- */
{
  const f = generateLounge({ style: "L_SHAPE", height: 420, partitionPanelThickness: 18, frontPanelThickness: 16, mainWidth: 2087, mainDepth: 560, lWidth: 960, lDepth: 560, lPosition: "RIGHT", lFrontAccess: "DRAWER" });
  const fb = (id: string) => { const x = f.boards.find((q) => q.id === id); assert.ok(x, `missing ${id}`); return x!; };
  const fp = (id: string) => { const x = fb(id); const q = (v: number) => Math.round(v * 100) / 100; return { x0: q(x.x0), x1: q(x.x1), y0: q(x.y0), y1: q(x.y1), z0: q(x.z0), z1: q(x.z1) }; };
  assert.deepEqual(f.validation.errors, []);
  assert.deepEqual(f.validation.warnings, []);
  assert.equal(f.params.lFrontAccess, "DRAWER");
  assert.ok(!f.boards.some((q) => q.id === "l_front"), "the seat front gives way to the drawer");
  assert.equal(f.boards.length, 16);
  assert.deepEqual(fp("l_drawer_strip"), { x0: 1545, x1: 2069, y0: 0, y1: 16, z0: 302, z1: 420 });
  assert.deepEqual(fp("l_drawer_front"), { x0: 1547, x1: 2067, y0: 0, y1: 16, z0: 2, z1: 300 });
  for (const id of ["l_drawer_strip", "l_drawer_front"]) assert.equal(fb(id).stock?.kind, "door", id);
  assert.deepEqual(fp("l_drawer_rail"), { x0: 1554.5, x1: 2059.5, y0: 16, y1: 116, z0: 302, z1: 320 });
  assert.deepEqual(fp("l_support_inner"), { x0: 1545, x1: 1563, y0: 16, y1: 941, z0: 0, z1: 402 });
  assert.deepEqual(fp("l_lid"), { x0: 1547, x1: 2067, y0: 18, y1: 939, z0: 402, z1: 420 });
  // Lock 55 × 15.5, top edge 22.75 under the drawer front's top, centred.
  const lock = f.locks.find((l) => l.id === "l_drawer_front_lock")!;
  assert.deepEqual([lock.centerX, lock.centerZ + lock.height / 2, lock.width, lock.height], [1807, 300 - 22.75, 55, 15.5]);
  // Rail tongues 8.5 over its rear 70; pockets 9 deep, 5 longer each end, 1 taller, on the drawer side of each support.
  const rail = (fb("l_drawer_rail").profileVector as Array<{ x: number; y: number }>).map((p) => `${p.x},${p.y}`);
  assert.ok(rail.includes("1554.5,116") && rail.includes("1554.5,46") && rail.includes("1563,46") && rail.includes("1563,16"), "rail tongue");
  const pocket = (id: string) => fb(id).faces!.flatMap((q) => q.features.filter((x) => x.for === "l_drawer_rail").map((x) => [q.id, x.u0, x.u1, x.v0, x.v1, x.depth]));
  assert.deepEqual(pocket("l_support_inner"), [["A", 25, 105, 301.5, 320.5, 9]]);
  assert.deepEqual(pocket("l_support_outer"), [["B", 25, 105, 301.5, 320.5, 9]]);
  // Bands: door colour all round the front and strip; rail rear edge and support fronts in the carcass colour.
  const bands = (id: string) => fb(id).faces!.filter((q) => q.id.startsWith("E") && q.finish?.edgeBand).map((q) => `${q.normal}:${q.finish!.edgeBand!.colour}`).sort();
  for (const id of ["l_drawer_strip", "l_drawer_front"]) assert.deepEqual(bands(id), ["+X:Gloss White", "+Z:Gloss White", "-X:Gloss White", "-Z:Gloss White"], id);
  assert.deepEqual(bands("l_drawer_rail"), ["+Y:White Stipple"]);
  for (const id of ["l_side", "l_outer_side"]) assert.deepEqual(bands(id), ["+Z:White Stipple", "-Y:Gloss White"], id);
  for (const id of ["l_support_inner", "l_support_outer"]) assert.deepEqual(bands(id), ["-Y:White Stipple"], id);
  for (const id of ["lg_l_strip_on_rail", "lg_l_drawer_rail_inner", "lg_l_drawer_rail_outer"]) assert.ok(f.joints.some((j) => j.id === id), id);
  // Mirrored: pockets swap faces.
  const left = generateLounge({ style: "L_SHAPE", mainWidth: 2087, mainDepth: 560, lWidth: 960, lDepth: 560, lPosition: "LEFT", lFrontAccess: "DRAWER" });
  assert.deepEqual(left.validation.errors, []);
  assert.equal(left.boards.find((q) => q.id === "l_drawer_front")!.x0, 20);
  assert.ok(left.boards.find((q) => q.id === "l_support_inner")!.faces!.find((q) => q.id === "B")!.features.some((x) => x.for === "l_drawer_rail"));
  // Too low for a drawer front under the strip.
  assert.ok(generateLounge({ style: "L_SHAPE", height: 160, mainWidth: 2087, mainDepth: 560, lWidth: 960, lDepth: 560, lFrontAccess: "DRAWER" }).validation.errors.some((e) => e.startsWith("L drawer:") || e.includes("too low")));
}

/* ---------- floor-plan arches: I/L notch only, parallel middle cabinet sits on the cover ---------- */
{
  const arch = { id: "wa-1-L", x0: 0, x1: 80, y0: 400, y1: 600, z0: 0, z1: 200 };
  const cut = generateLounge({ style: "I_SHAPE", mainWidth: 2000, mainDepth: 600, height: 420, planWheelArches: [arch] });
  assert.deepEqual(cut.validation.errors, [], cut.validation.errors.join("; "));
  const left = cut.boards.find((b) => b.id === "i_left_end")!;
  const right = cut.boards.find((b) => b.id === "i_right_end")!;
  assert.equal(left.z0, 0);
  assert.equal(left.z1, 420, "end panel stays full height");
  const step = (left.profileVector as { y: number; z: number }[]).some((p) => p.z === 200);
  assert.ok(step, "left end, inside the arch, is notched");
  assert.ok(!(right.profileVector as { y: number; z: number }[]).some((p) => p.z === 200), "right end, outside the arch, stays full size");
  assert.equal(cut.boards.some((b) => b.boardType === "avoidance_top"), false, "I has no cover boards");

  const parallel = generateLounge({
    style: "PARALLEL", totalWidth: 1880, singleLoungeWidth: 560, depth: 900, height: 420,
    planWheelArches: [{ id: "wa-1-L", x0: 500, x1: 1400, y0: 520, y1: 900, z0: 0, z1: 270 }],
  });
  assert.deepEqual(parallel.validation.errors, [], parallel.validation.errors.join("; "));
  const top = parallel.boards.find((b) => b.id === "mid_avoidance_top")!;
  const front = parallel.boards.find((b) => b.id === "mid_avoidance_front")!;
  const bottom = parallel.boards.find((b) => b.id === "middle_cabinet_bottom")!;
  assert.ok(top && front, "the gap gets the two visible covers");
  assert.equal(top.z1, 270);
  assert.equal(bottom.z0, top.z1, "middle cabinet bottom sits on the top cover");
  assert.equal(bottom.z1 - bottom.z0, 16);
  assert.equal(parallel.boards.some((b) => b.id === "parallel_avoidance_top"), false, "covers stay in the gap, not across both seats");
  const missed = generateLounge({
    style: "PARALLEL", totalWidth: 1880, singleLoungeWidth: 560, depth: 900, height: 420,
    planWheelArches: [{ id: "wa-1-L", x0: 0, x1: 200, y0: 520, y1: 900, z0: 0, z1: 270 }],
  });
  assert.equal(missed.boards.some((b) => b.id === "mid_avoidance_top"), false, "arch outside the gap: no cover");
  assert.equal(missed.boards.find((b) => b.id === "middle_cabinet_bottom")!.z0, 0, "cabinet stays on the floor");
}

/* ---------- back panel: outer side, seat shifts inward, room-end top corner is a real arc ---------- */
{
  const base = { style: "L_SHAPE" as const, height: 420, partitionPanelThickness: 18, mainWidth: 2087, mainDepth: 560, lWidth: 960, lDepth: 560, lPosition: "RIGHT" as const };
  const f = generateLounge({ ...base, backPanel: true });
  assert.deepEqual(f.validation.errors, [], f.validation.errors.join("; "));
  assert.equal(f.params.backPanelHeight, 950);
  assert.equal(f.params.backPanelOverhang, 50);
  assert.equal(f.boards.length, 15);
  const box = (id: string) => {
    const b = f.boards.find((q) => q.id === id);
    assert.ok(b, id);
    const q = (v: number) => Math.round(v * 100) / 100;
    return { x0: q(b!.x0), x1: q(b!.x1), y0: q(b!.y0), y1: q(b!.y1), z0: q(b!.z0), z1: q(b!.z1) };
  };
  // Main loses one thickness; the wing seating moves in; the panel takes the outer 18.
  assert.deepEqual(box("main_front"), { x0: 0, x1: 1509, y0: 400, y1: 418, z0: 0, z1: 420 });
  assert.deepEqual(box("l_outer_side"), { x0: 2051, x1: 2069, y0: 0, y1: 960, z0: 0, z1: 420 });
  assert.deepEqual(box("l_back"), { x0: 2069, x1: 2087, y0: -50, y1: 960, z0: 0, z1: 950 });
  assert.deepEqual(f.footprint.main, { x0: 0, x1: 1509, y0: 400, y1: 960 });
  assert.deepEqual(f.footprint.l, { x0: 1509, x1: 2087, y0: -50, y1: 960 });
  const pv = f.boards.find((b) => b.id === "l_back")!.profileVector as Array<{ y: number; z: number; bulge?: number }>;
  const i = pv.findIndex((p) => p.bulge);
  assert.ok(i > 0, "the room-end top corner carries a bulge");
  const a = pv[i]!, b = pv[i + 1]!;
  assert.equal(a.y, 0);
  assert.equal(a.z, 950);
  assert.equal(b.y, -50);
  assert.equal(b.z, 900);
  const chord = Math.hypot(b.y - a.y, b.z - a.z);
  const sweep = 4 * Math.atan(a.bulge!);
  const du = (b.y - a.y) / chord, dv = (b.z - a.z) / chord;
  const h = chord / 2 / Math.tan(sweep / 2);
  const cu = (a.y + b.y) / 2 - dv * h, cv = (a.z + b.z) / 2 + du * h;
  const r = Math.hypot(a.y - cu, a.z - cv);
  assert.ok(Math.abs(r - 50) < 0.01 && Math.abs(cu - 0) < 0.01 && Math.abs(cv - 900) < 0.01, `arc centre (${cu}, ${cv}) r ${r}`);
  const midA = Math.atan2(a.z - cv, a.y - cu) + sweep / 2;
  const my = cu + r * Math.cos(midA), mz = cv + r * Math.sin(midA);
  const corner = Math.hypot(my - (-50), mz - 950);
  const chordMid = Math.hypot((a.y + b.y) / 2 - (-50), (a.z + b.z) / 2 - 950);
  assert.ok(corner < chordMid, "the arc bows out to the corner, it is not a straight cut");
  const bands = f.boards.find((b) => b.id === "l_back")!.faces!.filter((q) => q.id.startsWith("E") && q.finish?.edgeBand);
  assert.ok(bands.some((q) => q.normal === "+Z") && bands.some((q) => q.normal === "-Y"), "top and room end are banded");
  assert.ok(bands.every((q) => q.normal !== "+Y" && q.normal !== "-Z"), "wall end and floor stay bare");
  const taller = generateLounge({ ...base, backPanel: true, height: 450 });
  assert.equal(taller.boards.find((b) => b.id === "l_back")!.z1, 980);
  const left = generateLounge({ ...base, backPanel: true, lPosition: "LEFT" });
  const lp = left.boards.find((b) => b.id === "l_back")!;
  assert.deepEqual([lp.x0, lp.x1, lp.y0], [0, 18, -50], "left wing: panel on the outer end, radius still at the room");
  const plain = generateLounge(base);
  assert.equal(plain.boards.some((b) => b.id === "l_back"), false);

  const par = generateLounge({
    style: "PARALLEL", height: 420, partitionPanelThickness: 18, totalWidth: 1880, singleLoungeWidth: 560, depth: 900,
    leftBackPanel: true,
  });
  assert.deepEqual(par.validation.errors, [], par.validation.errors.join("; "));
  const side = par.boards.find((b) => b.id === "left_side")!;
  const back = par.boards.find((b) => b.id === "left_back")!;
  assert.equal(Math.round(side.x0), 560, "the left run moved toward the gap");
  assert.deepEqual([back.x0, back.x1, back.y0, back.z1], [0, 18, -50, 950]);
  assert.equal(par.boards.some((b) => b.id === "right_back"), false);
  const bare = generateLounge({ style: "PARALLEL", totalWidth: 1880, singleLoungeWidth: 560, depth: 900, height: 420 });
  assert.equal(bare.boards.find((b) => b.id === "right_side")!.x0, par.boards.find((b) => b.id === "right_side")!.x0, "the right run stays");
  const both = generateLounge({
    style: "PARALLEL", height: 420, partitionPanelThickness: 18, totalWidth: 1880, singleLoungeWidth: 560, depth: 900,
    leftBackPanel: true, rightBackPanel: true, hasMiddleCabinet: true, middleCabinet: { width: 600 },
  });
  const cab = both.boards.find((b) => b.id === "middle_cabinet_left")!;
  const leftSeat = both.boards.find((b) => b.id === "left_side")!;
  const rightSeat = both.boards.find((b) => b.id === "right_side")!;
  assert.ok(cab.x0 >= leftSeat.x1 - 0.01 && cab.x0 + 1 < rightSeat.x0, `middle cabinet ${cab.x0} sits in the gap ${leftSeat.x1}..${rightSeat.x0}`);
}

{
  const file = join(dirname(fileURLToPath(import.meta.url)), "presets.json");
  const presets = JSON.parse(readFileSync(file, "utf8")) as PresetsFile;
  assert.equal(presets.module, "lounge");
  for (const preset of presets.presets) {
    const result = generateLounge(preset.params);
    assert.ok(countPins(preset.pins) > 0, `${preset.id}: no pins`);
    assert.deepEqual(checkPins(result, preset.pins), [], `${preset.id}: pin mismatch`);
  }
}

console.log("lounge: all golden tests passed");
