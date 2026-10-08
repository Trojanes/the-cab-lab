/**
 * Kitchen 黄金测试 — 数值取自规格 §8（kitchen_base 黄金参数）。
 * 厨房 Y：y=0 为前缘，数值直接对拍，无坐标转换。
 * 预期含 1 条 error（V1 双侧半槽冲突，黄金集本身如此）。
 */
import assert from "node:assert/strict";
import { generateKitchenCabinet } from "./generator.ts";
import { columnOpenings } from "../_lib/preview.ts";

const PARAMS = {
  globalSettings: { length: 887, depth: 270, height: 880 },
  materialThickness: 15,
  frontThickness: 16,
  frontClearance: 2.5,
  bottomClearanceHeight: 55,
  bottomClearanceStyle: "style_1",
  lockEnabled: true,
  columns: [
    {
      id: "k-col-1", width: 444,
      zones: [{
        id: "c1-door", height: 825, zoneType: "left_door" as const,
        shelfEnabled: true, shelfHeight: 400,
        leftSidePanelOptions: {
          panelType: "door" as const, frontVisible: true,
          bchNotchEnabled: false, strengtheningStripEnabled: true,
        },
      }],
    },
    {
      id: "k-col-2", width: 443,
      zones: [
        { id: "c2-drawer", height: 300, zoneType: "drawer" as const },
        { id: "c2-door", height: 525, zoneType: "right_door" as const, shelfEnabled: false },
      ],
    },
  ],
};

const r = generateKitchenCabinet(PARAMS);

function b(id: string) {
  const board = r.boards.find((x) => x.id === id);
  assert.ok(board, `board ${id} missing`);
  return board;
}
function place(id: string) {
  const board = b(id);
  return {
    x0: Math.round(board.x0 * 100) / 100, x1: Math.round(board.x1 * 100) / 100,
    y0: Math.round(board.y0 * 100) / 100, y1: Math.round(board.y1 * 100) / 100,
    z0: Math.round(board.z0 * 100) / 100, z1: Math.round(board.z1 * 100) / 100,
  };
}
const r2 = (v: number) => Math.round(v * 1000) / 1000;

/* ---------- 校验：V1 双侧半槽不再报错，自动解析（面积小的一侧改螺丝） ---------- */
assert.deepEqual(r.validation.errors, []);
assert.deepEqual(r.validation.warnings, []);
assert.deepEqual(r.xBoundaries, [0, 444, 887]);

/* ---------- column openings: clearance and centre distance, converted from the same width ---------- */
{
  const open = columnOpenings(r.debug.columns, r.boards);
  assert.equal(open.length, 2);
  // Door end 16, divider 15 centred on 444: clear 444 - 16 - 7.5, centre 444 - 8.
  assert.equal(open[0].width, 444);
  assert.equal(open[0].clear, 420.5);
  assert.equal(open[0].center, 436);
  // Divider centre 444 to carcass end centre 887 - 7.5; clear from 451.5 to 872.
  assert.equal(open[1].width, 443);
  assert.equal(open[1].clear, 420.5);
  assert.equal(open[1].center, 435.5);
  const typedClear = 400;
  const nextWidth = Math.round((open[0].width + (typedClear - open[0].clear)) * 10) / 10;
  assert.equal(nextWidth, 423.5);
}

/* ---------- 计数：7 骨架 + 3 V + 2 功能 + 1 加强条 + 3 门板 = 16 ---------- */
assert.equal(r.boards.length, 16);
assert.equal(r.slots.length, 3); // V1 drawer slot became screws
assert.equal(r.hinges.length, 4);
assert.equal(r.locks.length, 3);
assert.ok(r.joints.some((j) => j.id === "kt_b1_b2_front_to_carcass_rail"), "B1↔B2 for style_1/2 explode");
assert.ok(r.joints.some((j) => j.id === "kt_b1_b3_bottom_rail_to_deck"));
assert.ok(r.joints.some((j) => j.id === "kt_b2_b3_carcass_rail_to_deck"));
assert.ok(r.joints.length >= 6, "V↔B3 and top rails declared");

/* ---------- V 板 ---------- */
{
  const v0 = b("V0");
  assert.equal(v0.materialThickness, 16);
  assert.equal(v0.stock?.kind, "door");
  assert.deepEqual(place("V0"), { x0: 0, x1: 16, y0: 0, y1: 254, z0: 0, z1: 880 });
  assert.deepEqual(v0.profileVector, [
    { y: -16, z: 0 }, { y: -16, z: 880 }, { y: 152, z: 880 }, { y: 152, z: 863 },
    { y: 237, z: 863 }, { y: 237, z: 795 }, { y: 254, z: 795 }, { y: 254, z: 85 },
    { y: 237, z: 85 }, { y: 237, z: 0 }, { y: -16, z: 0 },
  ]);
  assert.deepEqual(place("V1"), { x0: 436.5, x1: 451.5, y0: 0, y1: 254, z0: 0, z1: 880 });
  assert.deepEqual(place("V2"), { x0: 872, x1: 887, y0: 0, y1: 254, z0: 0, z1: 880 });
  const expect17 = [
    { y: 70, z: 0 }, { y: 70, z: 55 }, { y: 80, z: 55 }, { y: 80, z: 71 },
    { y: 0, z: 71 }, { y: 0, z: 864 }, { y: 85, z: 864 }, { y: 85, z: 880 },
    { y: 153, z: 880 }, { y: 153, z: 864 }, { y: 238, z: 864 }, { y: 238, z: 795 },
    { y: 254, z: 795 }, { y: 254, z: 85 }, { y: 238, z: 85 }, { y: 238, z: 0 },
    { y: 70, z: 0 },
  ];
  assert.deepEqual(b("V1").profileVector, expect17);
  assert.deepEqual(b("V2").profileVector, expect17);
}

/* ---------- B 系统骨架 ---------- */
assert.deepEqual(place("B1"), { x0: 16, x1: 887, y0: 39, y1: 55, z0: 0, z1: 55 });
assert.equal(b("B1").materialThickness, 16);
assert.deepEqual(place("B2"), { x0: 16, x1: 887, y0: 55, y1: 70, z0: 0, z1: 55 });
assert.deepEqual(place("B3"), { x0: 16, x1: 887, y0: 0, y1: 100, z0: 55, z1: 70 });
// B3 V 缺口：V1 [436,452]、V2 [871.5,887]（V0 零宽自然消失）
{
  const p = b("B3").profileVector as { x: number; y: number }[];
  assert.ok(p.some((q) => q.x === 452 && q.y === 100), "B3 V1 notch");
  assert.ok(p.some((q) => q.x === 436 && q.y === 100), "B3 V1 notch far edge");
  assert.ok(p.some((q) => q.x === 871.5 && q.y === 80), "B3 V2 notch (clamped to right edge)");
  assert.ok(p.some((q) => q.x === 887 && q.y === 80), "B3 right edge cut by V2 notch");
}

/* ---------- T 系统 + B4 ---------- */
assert.deepEqual(place("T1-1"), { x0: 16, x1: 887, y0: 0, y1: 100, z0: 865, z1: 880 });
assert.deepEqual(place("T2-1"), { x0: 0, x1: 887, y0: 139, y1: 239, z0: 865, z1: 880 });
assert.deepEqual(place("T3-1"), { x0: 0, x1: 887, y0: 239, y1: 254, z0: 780, z1: 880 });
assert.deepEqual(place("B4-1"), { x0: 0, x1: 887, y0: 239, y1: 254, z0: 0, z1: 100 });
// T2 前缘 V 缺口 y∈[139,159]（后边贴在 T3 的 y=239）
{
  const p = b("T2-1").profileVector as { x: number; y: number }[];
  assert.ok(p.some((q) => q.x === 16 && q.y === 159), "T2 V0 notch");
  assert.ok(p.some((q) => q.x === 452 && q.y === 159), "T2 V1 notch");
}
// B4 顶缘 V 缺口 z∈[80,100]
{
  const p = b("B4-1").profileVector as { x: number; z: number }[];
  assert.ok(p.some((q) => q.x === 16 && q.z === 80), "B4 V0 notch");
  assert.ok(p.some((q) => q.x === 436 && q.z === 80), "B4 V1 notch");
}
// T3 底缘 V 缺口 z∈[780,800]
{
  const p = b("T3-1").profileVector as { x: number; z: number }[];
  assert.ok(p.some((q) => q.x === 16 && q.z === 800), "T3 V0 notch");
  assert.ok(p.some((q) => q.x === 452 && q.z === 800), "T3 V1 notch");
}

/* ---------- 功能板 ---------- */
assert.deepEqual(place("c1-door-door-shelf"), { x0: 1, x1: 444, y0: 0, y1: 254, z0: 440, z1: 455 });
// The front-left corner is notched round the strengthening strip (x 16..32 = CPT + 1, y up to the tongue at 84.667).
assert.deepEqual(b("c1-door-door-shelf").profileVector, [
  { x: 32, y: 0 }, { x: 436.5, y: 0 }, { x: 436.5, y: 84.667 }, { x: 444, y: 84.667 },
  { x: 444, y: 169.333 }, { x: 436.5, y: 169.333 }, { x: 436.5, y: 254 }, { x: 16, y: 254 },
  { x: 16, y: 169.333 }, { x: 1, y: 169.333 }, { x: 1, y: 84.667 }, { x: 32, y: 84.667 }, { x: 32, y: 0 },
].map((q) => ({ x: r2(q.x), y: r2(q.y) })));
// No tongue into V1 (screwed): the board stops flush on V1's right face (451.5).
assert.deepEqual(place("k-col-2-c2-drawer-bottom"), { x0: 451.5, x1: 887, y0: 0, y1: 150, z0: 572.5, z1: 587.5 });
assert.deepEqual(b("k-col-2-c2-drawer-bottom").profileVector, [
  { x: 451.5, y: 0 }, { x: 872, y: 0 }, { x: 872, y: 50 }, { x: 887, y: 50 },
  { x: 887, y: 150 }, { x: 451.5, y: 150 }, { x: 451.5, y: 0 },
]);

/* ---------- 加强条 ---------- */
assert.deepEqual(place("left-side-strengthening-strip-c1-door"), { x0: 16, x1: 31, y0: 0, y1: 100, z0: 70, z1: 865 });
assert.deepEqual(b("left-side-strengthening-strip-c1-door").profileVector, [
  { y: 0, z: 70 }, { y: 100, z: 70 }, { y: 100, z: 439.5 }, { y: 80, z: 439.5 },
  { y: 80, z: 455.5 }, { y: 100, z: 455.5 }, { y: 100, z: 865 }, { y: 0, z: 865 }, { y: 0, z: 70 },
]);
// 层板前缘让位缺口
{
  const n = r.notches.find((x) => x.panelId === "c1-door-door-shelf");
  assert.ok(n, "shelf strip notch");
  assert.equal(n!.x0, 16);
  assert.equal(n!.x1, 32);
  assert.equal(n!.y0, 0);
  assert.equal(n!.y1, 85);
}

/* ---------- 门板 ---------- */
assert.deepEqual(place("c1-door-front-panel"), { x0: 18.5, x1: 442.75, y0: -16, y1: 0, z0: 55, z1: 877.5 });
assert.deepEqual(place("c2-drawer-front-panel"), { x0: 445.25, x1: 884.5, y0: -16, y1: 0, z0: 581.25, z1: 877.5 });
assert.deepEqual(place("c2-door-front-panel"), { x0: 445.25, x1: 884.5, y0: -16, y1: 0, z0: 55, z1: 578.75 });
assert.equal(b("c1-door-front-panel").stock?.kind, "door");

/* ---------- 铰链（杯心 + sd 推导） ---------- */
{
  const left = r.hinges.filter((h) => h.panelId === "c1-door-front-panel");
  assert.equal(left.length, 2);
  const xs = left.map((h) => h.centerX);
  const zs = left.map((h) => h.centerZ).sort((a, c) => c - a);
  assert.deepEqual(xs, [41, 41]); // 22.5 距铰链侧（左）；sd 夹取 100
  assert.deepEqual(zs, [777.5, 155]);
  assert.equal(left[0].diameter, 35);
  assert.equal(left[0].depth, 12.5);
  const right = r.hinges.filter((h) => h.panelId === "c2-door-front-panel");
  assert.equal(right.length, 2);
  assert.deepEqual(right.map((h) => h.centerX), [862, 862]); // 距右侧 22.5
  assert.deepEqual(right.map((h) => r2(h.centerZ)).sort((a, c) => c - a), [485.104, 148.646]); // sd = 93.6458
  assert.equal(r.hinges.filter((h) => h.panelId === "c2-drawer-front-panel").length, 0); // 抽屉面板无铰链
  const sink = generateKitchenCabinet({
    ...PARAMS,
    columns: PARAMS.columns.map((c) => c.id === "k-col-1"
      ? { ...c, zones: c.zones.map((z) => ({ ...z, withSink: true })) }
      : c),
  });
  const sunk = sink.hinges.filter((h) => h.panelId === "c1-door-front-panel").map((h) => h.centerZ).sort((a, c) => c - a);
  assert.deepEqual(sunk, [777.5 - 130, 155], "upper hinge drops 130 mm for a sink; the lower hinge stays");
}

/* ---------- 锁 ---------- */
{
  const lock = (id: string) => r.locks.find((l) => l.panelId === id)!;
  const l1 = lock("c1-door-front-panel");
  assert.equal(r2(l1.centerX), 362.75); // x1 − 80
  assert.equal(r2(l1.centerZ), 834.5); // 顶区：H − CPT/2 − CPT/2 − 30.5
  assert.equal(l1.width, 55);
  assert.equal(l1.height, 15.5);
  assert.equal(l1.radius, 7.75);
  const l2 = lock("c2-drawer-front-panel");
  assert.equal(r2(l2.centerX), 664.875); // 宽中点
  assert.equal(r2(l2.centerZ), 834.5);
  const l3 = lock("c2-door-front-panel");
  assert.equal(r2(l3.centerX), 525.25); // x0 + 80
  assert.equal(r2(l3.centerZ), 542); // zone.z1 − 7.5 − 30.5
}

/* ---------- 槽 ---------- */
{
  const s0 = r.slots.find((x) => x.vPanelId === "V0" && x.forBoard === "c1-door-door-shelf")!;
  assert.ok(s0.through, "V0 slot through");
  assert.equal(s0.depth, 16); // V 板全厚
  assert.deepEqual([r2(s0.y0), r2(s0.y1)], [78.667, 175.333]); // 舌 ±6
  assert.deepEqual([s0.z0, s0.z1], [439.5, 455.5]); // 板 z ± 0.5
  const s1 = r.slots.find((x) => x.vPanelId === "V1" && x.forBoard === "c1-door-door-shelf")!;
  assert.ok(!s1.through, "V1 left half");
  assert.equal(s1.depth, 7.5);
  // V1 would carry half slots on both faces. Column 1's door zone (825 high) outweighs the
  // drawer zone (300): the drawer divider keeps no slot on V1 and is screwed through it.
  assert.equal(r.slots.some((x) => x.vPanelId === "V1" && x.forBoard === "k-col-2-c2-drawer-bottom"), false, "V1 drawer: no slot");
  const screws = r.screws.filter((x) => x.vPanelId === "V1" && x.forBoard === "k-col-2-c2-drawer-bottom");
  assert.deepEqual(screws.map((x) => [x.y, x.z, x.diameter]), [[75, 580, 3]], "150 deep < 2 × 100: one screw in the middle");
  const v1 = b("V1");
  const hole = v1.faces!.flatMap((f) => f.features).find((f) => f.id === screws[0].id)!;
  assert.equal(hole.kind, "hole");
  assert.equal(hole.through, true);
  const d2 = r.slots.find((x) => x.vPanelId === "V2" && x.forBoard === "k-col-2-c2-drawer-bottom")!;
  assert.ok(d2.through, "V2 through");
  assert.deepEqual([d2.y0, d2.y1], [45, 155]); // 舌 ±5
  assert.deepEqual([d2.z0, d2.z1], [572, 588]);
}

/* ---------- 板面层挂载 ---------- */
assert.ok(Array.isArray(r.boards[0].faces) && r.boards[0].faces.length >= 2, "faces attached");
assert.equal(r.debug?.boardFrame, "final");

/* ---------- bench 合同：公式 + FaceRef 接缝 + 槽挂面 ---------- */
{
  const entries = r.debug.provenance.entries;
  assert.ok(Object.keys(entries).length > 0, "kitchen provenance is not empty");
  for (const board of r.boards) {
    for (const face of ["x0", "x1", "y0", "y1", "z0", "z1"]) {
      const e = entries[`${board.id}.${face}`];
      assert.ok(e, `${board.id}.${face} has no provenance`);
      assert.equal(e.value, board[face], `${board.id}.${face} provenance value`);
    }
  }
  assert.equal(entries["kitchen.carcassDepth"]?.formula, "D - FPT");
  assert.equal(entries["kitchen.carcassDepth"]?.terms.D?.kind, "param");
  for (const j of r.joints) {
    assert.equal(typeof j.a?.board, "string", `${j.id} a.board`);
    assert.equal(typeof j.b?.board, "string", `${j.id} b.board`);
    assert.ok(Array.isArray(j.a.faces) && Array.isArray(j.b.faces), `${j.id} faces`);
  }
  const v0 = b("V0");
  const grooves = v0.faces.flatMap((f) => f.features.filter((x) => x.kind === "groove"));
  assert.ok(grooves.some((g) => g.for === "c1-door-door-shelf"), "V0 groove for shelf");
  const door = b("c1-door-front-panel");
  assert.ok(door.faces.find((f) => f.id === "A").features.some((x) => x.kind === "hole" && x.for === "hinge"));
}

/* ---------- style_2 趾踢 + 灶台 T1/T2/T3 切分 ---------- */
{
  const s2 = generateKitchenCabinet({
    ...PARAMS,
    bottomClearanceStyle: "style_2",
  });
  const p = (id: string) => {
    const board = s2.boards.find((x) => x.id === id)!;
    const q = (v: number) => Math.round(v * 100) / 100;
    return { x0: q(board.x0), x1: q(board.x1), y0: q(board.y0), y1: q(board.y1), z0: q(board.z0), z1: q(board.z1) };
  };
  assert.deepEqual(p("B1"), { x0: 16, x1: 887, y0: -16, y1: 0, z0: 0, z1: 55 });
  assert.deepEqual(p("B2"), { x0: 16, x1: 887, y0: 0, y1: 15, z0: 0, z1: 55 });
  const b1b2 = s2.joints.find((j) => j.id === "kt_b1_b2_front_to_carcass_rail");
  assert.ok(b1b2 && b1b2.a.faces.length + b1b2.b.faces.length > 0, "style_2 B1↔B2 has faces");
  assert.equal(s2.boards.find((x) => x.id === "c1-door-front-panel")?.category, "front_panel");
  const v1 = s2.boards.find((x) => x.id === "V1")!.profileVector as { y: number }[];
  assert.ok(v1.some((q) => q.y === 15), "style_2 V frontY = CPT");
}

{
  const stove = generateKitchenCabinet({
    globalSettings: { length: 900, depth: 400, height: 880 },
    materialThickness: 15,
    frontThickness: 16,
    bottomClearanceHeight: 70,
    bottomClearanceStyle: "style_1",
    columns: [
      { id: "stove-col", width: 300, zones: [{ id: "st", height: 810, zoneType: "stove" }] },
      { id: "door-col", width: 600, zones: [{ id: "d", height: 810, zoneType: "left_door" }] },
    ],
  });
  const t1s = stove.boards.filter((x) => x.id.startsWith("T1-"));
  assert.ok(t1s.length >= 1, "T1 still emitted beside stove");
  assert.ok(t1s.every((b) => b.x1 <= 15.01 || b.x0 >= 292.49), "T1 omitted over stove clear X");
  assert.ok(stove.boards.some((x) => x.id === "T2-1" && x.x0 === 0 && x.x1 === 900), "T2 kept full (y does not meet stove cut)");
  assert.ok(stove.boards.some((x) => x.id === "T3-1" && x.x0 === 0 && x.x1 === 900), "T3 kept full (y does not meet stove cut)");
  const v0p = stove.boards.find((x) => x.id === "V0")!.profileVector as { y: number; z: number }[];
  assert.ok(v0p.some((q) => q.y === 0 && q.z === 880), "edge stove V0 drops T1 front receiver");
  assert.ok(!stove.validation.errors.some((e) => e.includes("Ensuite has no stove")), "a kitchen run may have a stove");
}

{
  const ensuiteStove = generateKitchenCabinet({
    baseKind: "ensuite",
    globalSettings: { length: 900, depth: 400, height: 880 },
    materialThickness: 15,
    frontThickness: 16,
    bottomClearanceHeight: 70,
    columns: [
      { id: "stove-col", width: 300, zones: [{ id: "st", height: 810, zoneType: "stove" }] },
      { id: "door-col", width: 600, zones: [{ id: "d", height: 810, zoneType: "left_door" }] },
    ],
  });
  assert.ok(
    ensuiteStove.validation.errors.some((e) => e === "Ensuite has no stove — zone st in column stove-col."),
    `ensuite stove refused: ${JSON.stringify(ensuiteStove.validation.errors)}`,
  );
  assert.ok(ensuiteStove.boards.some((b) => b.id.startsWith("T1-")), "the stove zone is not rewritten as a door");
}

/* ---------- 灶台：半深隔板的槽和门板色前边，侧板，贴踢脚的满深底板 ---------- */
{
  const pair = generateKitchenCabinet({
    globalSettings: { length: 1200, depth: 500, height: 880 },
    materialThickness: 15,
    frontThickness: 16,
    frontClearance: 2.5,
    bottomClearanceHeight: 70,
    doorColorName: "Gloss White",
    columns: [
      { id: "stove-col", width: 600, zones: [
        { id: "st", height: 400, zoneType: "stove" },
        { id: "dr", height: 410, zoneType: "drawer" },
      ] },
      { id: "door-col", width: 600, zones: [
        { id: "d", height: 810, zoneType: "left_door", shelfEnabled: false },
      ] },
    ],
  });
  assert.deepEqual(pair.validation.errors, [], pair.validation.errors.join("; "));
  const full = pair.boards.find((b) => b.id === "stove-col-st-bottom")!;
  const half = pair.boards.find((b) => b.id === "stove-col-st-stove-half")!;
  assert.ok(full && half, "stove shelf and half divider");
  assert.equal(half.boardType, "stove_half_divider");
  assert.equal(half.y0, 0);
  assert.equal(half.y1, 150);
  assert.equal(half.z1, full.z0, "half top touches the shelf underside");
  const halfSlots = pair.slots.filter((s) => s.forBoard === half.id);
  assert.equal(halfSlots.length, 2, "both ends slotted");
  const leftSlot = halfSlots.find((s) => s.vPanelId === "V0")!;
  const rightSlot = halfSlots.find((s) => s.vPanelId === "V1")!;
  assert.equal(leftSlot.through, true, "end beside the room is a through slot");
  assert.equal(rightSlot.through, false, "end beside the door is a half slot");
  assert.equal(leftSlot.y0, 45, "drawer slot starts 5 mm in front of the tongue");
  assert.equal(leftSlot.y1, 155, "drawer slot runs 5 mm past the tongue");
  assert.equal(leftSlot.z0, half.z0 - 0.5, "slot is 0.5 mm above the board");
  assert.equal(leftSlot.z1, half.z1 + 0.5, "slot is 0.5 mm below the board");
  const lip = (full.profileVector as { x: number; y: number }[]);
  assert.equal(full.y0, -16, "full shelf lip is one door thickness proud");
  assert.equal(full.boardType, "stove_full_shelf");
  const lipBand = (full.faces ?? []).filter((f) => f.finish?.edgeBand?.colour === "Gloss White");
  assert.ok(lipBand.length >= 1, "the proud front edge is the door colour");
  const bands = (half.faces ?? []).filter((f) => f.id.startsWith("E") && f.finish?.edgeBand).map((f) => ({ n: String(f.normal), c: f.finish!.edgeBand!.colour }));
  assert.ok(bands.some((x) => x.n === "-Y" && x.c === "Gloss White"), `front edge is the door colour ${JSON.stringify(bands)}`);
  assert.ok(bands.filter((x) => x.n === "+Y").every((x) => x.c === "White Stipple"), `back edge stays carcass ${JSON.stringify(bands)}`);
  const left = pair.boards.find((b) => b.id === "stove-col-st-stove-side-left")!;
  const right = pair.boards.find((b) => b.id === "stove-col-st-stove-side-right")!;
  assert.equal(left.x1 - left.x0, 100);
  assert.equal(right.x1 - right.x0, 100);
  assert.ok(lip.some((p) => p.y === -16 && Math.abs(p.x - left.x1) < 0.05), `lip starts at the left side panel ${JSON.stringify(lip.filter((p) => p.y === -16))}`);
  assert.ok(lip.some((p) => p.y === -16 && Math.abs(p.x - right.x0) < 0.05), `lip ends at the right side panel ${JSON.stringify(lip.filter((p) => p.y === -16))}`);
  assert.ok(lip.some((p) => Math.abs(p.x - (left.x1 - 5.5)) < 0.05 && Math.abs(p.y - 5.5) < 0.05), "left corner relief is a 5.5 mm semicircle into the shelf");
  assert.ok(lip.some((p) => Math.abs(p.x - (right.x0 + 5.5)) < 0.05 && Math.abs(p.y - 5.5) < 0.05), "right corner relief is a 5.5 mm semicircle into the shelf");
  assert.equal(left.y0, -16);
  assert.equal(left.z0, half.z0 + (half.z1 - half.z0) / 2, "side panel starts at the half divider's centre");
  assert.equal(left.z1, 880 - 2.5);
  const notch = (left.profileVector as { x: number; z: number }[]).map((p) => [p.x, p.z]);
  assert.ok(notch.some((p) => p[0] === left.x1 - 20 && p[1] === left.z1 - 30), `left inner top notch ${JSON.stringify(notch)}`);
  const below = pair.boards.find((b) => b.id === "dr-front-panel")!;
  assert.equal(below.z1, (half.z0 + half.z1) / 2 - 2.5, "drawer front stops under the half divider");
  const opening = (pair.debug as { stoves: { openingWidth: number; openingHeight: number }[] }).stoves[0];
  assert.ok(Math.abs(opening.openingWidth - (right.x0 - left.x1)) < 0.05, `opening ${opening.openingWidth} vs ${right.x0 - left.x1}`);
  assert.equal(opening.openingHeight, 400 + 15 - 2.5);

  const lone = generateKitchenCabinet({
    globalSettings: { length: 700, depth: 500, height: 880 },
    materialThickness: 15,
    frontThickness: 16,
    bottomClearanceHeight: 55,
    columns: [{ id: "c", width: 700, zones: [{ id: "st", height: 825, zoneType: "stove" }] }],
  });
  assert.deepEqual(lone.validation.errors, [], lone.validation.errors.join("; "));
  const deck = lone.boards.find((b) => b.id === "c-st-stove-deck")!;
  const b3 = lone.boards.find((b) => b.id === "B3")!;
  assert.ok(deck, "lone stove rear deck");
  assert.equal(lone.boards.some((b) => b.boardType === "stove_side_panel"), false);
  assert.equal(lone.boards.some((b) => b.boardType === "stove_half_divider"), false);
  assert.equal(deck.y0, 100);
  assert.equal(deck.y1, 500 - 16 - 15);
  assert.equal(deck.z0, b3.z0);
  assert.equal(deck.z1, b3.z1);

  const openBelow = generateKitchenCabinet({
    globalSettings: { length: 700, depth: 500, height: 880 },
    bottomClearanceHeight: 70,
    columns: [{ id: "c", width: 700, zones: [
      { id: "st", height: 400, zoneType: "stove" },
      { id: "op", height: 410, zoneType: "open" },
    ] }],
  });
  assert.equal(openBelow.boards.some((b) => b.boardType === "stove_half_divider"), false);
  assert.equal(openBelow.boards.some((b) => b.boardType === "stove_side_panel"), false);

  const notTop = generateKitchenCabinet({
    globalSettings: { length: 700, depth: 500, height: 880 },
    bottomClearanceHeight: 70,
    columns: [{ id: "c", width: 700, zones: [
      { id: "up", height: 200, zoneType: "drawer" },
      { id: "st", height: 610, zoneType: "stove" },
    ] }],
  });
  assert.ok(notTop.validation.errors.some((e) => e.includes("must be the top zone")), notTop.validation.errors.join("; "));
}

/* ---------- 封边：门板颜色 / 柜体颜色，缺口和短边不封 ---------- */
{
  const colours = (id: string) => (b(id).faces ?? [])
    .filter((f) => f.id.startsWith("E") && f.finish?.edgeBand)
    .map((f) => ({ n: f.normal, c: f.finish!.edgeBand!.colour }));
  const only = (id: string, normals: string[], colour: string) => {
    const bands = colours(id);
    assert.ok(bands.length >= 1, `${id} banded`);
    assert.ok(bands.every((x) => normals.includes(String(x.n)) && x.c === colour), `${id} ${JSON.stringify(bands)}`);
  };
  const fp = colours("c1-door-front-panel");
  assert.equal(fp.length, 4, "door four edges");
  assert.ok(fp.every((x) => x.c === "Gloss White"));
  assert.equal(colours("c2-drawer-front-panel").length, 4);
  only("V0", ["-Y"], "Gloss White");
  only("V2", ["-Y"], "White Stipple");
  assert.equal(colours("B1").length, 0, "B1 bare");
  assert.equal(colours("B2").length, 0, "B2 bare");
  only("B3", ["-Y", "+Y"], "White Stipple");
  only("T1-1", ["-Y", "+Y"], "White Stipple");
  only("T2-1", ["-Y"], "White Stipple");
  only("T3-1", ["-Z"], "White Stipple");
  only("B4-1", ["+Z"], "White Stipple");
  only("k-col-2-c2-drawer-bottom", ["-Y", "+Y"], "White Stipple");
  only("c1-door-door-shelf", ["-Y"], "White Stipple");
  only("left-side-strengthening-strip-c1-door", ["-Y"], "White Stipple");
}

{
  const entries = r.debug.provenance.entries;
  const identity = (e: { formula: string; terms: Record<string, unknown> }) => {
    const names = Object.keys(e.terms);
    return names.length === 1 && e.formula === names[0];
  };
  for (const board of r.boards) {
    for (const face of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) {
      const e = entries[`${board.id}.${face}`];
      assert.ok(e, `${board.id}.${face} formula`);
      assert.ok(Math.abs(e.value - board[face]) < 1e-6, `${board.id}.${face} value`);
      assert.equal(identity(e), false, `${board.id}.${face} ${e.formula}`);
    }
    const pv = board.profileVector ?? [];
    const [A, B] = board.profilePlane === "YZ" ? ["y", "z"] : board.profilePlane === "XZ" ? ["x", "z"] : ["x", "y"];
    pv.forEach((p, i) => {
      for (const axis of [A, B]) {
        const e = entries[`${board.id}.pv[${i}].${axis}`];
        assert.ok(e, `${board.id}.pv[${i}].${axis}`);
        assert.ok(Math.abs(e.value - Number((p as Record<string, number>)[axis])) < 1e-6);
      }
    });
  }
  for (const j of r.joints) assert.equal(typeof j.rule, "string", j.id);
  const notch = entries["V1.pv[2].y"];
  assert.ok(Object.values(notch.terms).some((t) => t.kind === "rule" || t.kind === "ref"));
}

{
  const ledOf = (result: ReturnType<typeof generateKitchenCabinet>) => {
    const face = result.boards.find((b) => b.id === "B3")?.faces?.find((f) => f.id === "B");
    return (face?.features ?? []).filter((f) => f.kind === "tgroove").map((f) => f.id);
  };
  const base = {
    globalSettings: { length: 887, depth: 270, height: 880 },
    materialThickness: 15, frontThickness: 16, bottomClearanceHeight: 70, bottomClearanceStyle: "style_1" as const,
    columns: [{ id: "c1", width: 887, zones: [{ id: "z1", height: 810, zoneType: "left_door" as const }] }],
  };
  assert.deepEqual(ledOf(generateKitchenCabinet(base)), ["B3_LED_MAIN", "B3_LED_BRANCH_1", "B3_LED_BRANCH_2"]);
  assert.deepEqual(ledOf(generateKitchenCabinet({ ...base, ledGroove: false })), []);
  assert.deepEqual(ledOf(generateKitchenCabinet({ ...base, bottomClearanceStyle: "style_2" })), []);
  const narrow = generateKitchenCabinet({
    ...base,
    globalSettings: { ...base.globalSettings, length: 70 },
    columns: [{ id: "c1", width: 70, zones: [{ id: "z1", height: 810, zoneType: "left_door" }] }],
  });
  assert.ok(narrow.validation.warnings.some((w) => w.includes("too narrow")), narrow.validation.warnings.join("; "));

  const deep = {
    baseKind: "ensuite" as const,
    globalSettings: { length: 887, depth: 570, height: 880 },
    materialThickness: 15, frontThickness: 16, bottomClearanceHeight: 70, bottomClearanceStyle: "style_1" as const,
    columns: [{ id: "c1", width: 887, zones: [{ id: "z1", height: 810, zoneType: "left_door" as const, applianceFloorEnabled: true }] }],
  };
  const washer = generateKitchenCabinet(deep);
  assert.deepEqual(washer.validation.errors, [], washer.validation.errors.join("; "));
  assert.ok(washer.boards.some((b) => b.id === "c1-z1-appliance-floor"));
  assert.equal(washer.boards.filter((b) => b.id.startsWith("c1-z1-underside-")).length, 2);
  const kitchenFloor = generateKitchenCabinet({ ...deep, baseKind: "kitchen" });
  assert.ok(kitchenFloor.validation.errors.some((e) => e.includes("only on an ensuite")));
  assert.ok(!kitchenFloor.boards.some((b) => b.boardType === "appliance_floor"));
  const blocked = generateKitchenCabinet({
    ...deep,
    wheelAvoidances: [{ id: "w1", x0: 100, x1: 500, height: 300, depth: 200 }],
  });
  assert.ok(blocked.validation.errors.some((e) => e.includes("wheel avoidance w1")));
  assert.ok(!blocked.boards.some((b) => b.boardType === "appliance_floor"));
}

/* ---------- bench top: full width, 25 thick, 20 past the door face, front edge only ---------- */
{
  const plain = generateKitchenCabinet({
    globalSettings: { length: 887, depth: 270, height: 880 },
    materialThickness: 15, frontThickness: 16, bottomClearanceHeight: 70,
    columns: [{ id: "c1", width: 887, zones: [{ id: "z1", height: 810, zoneType: "left_door" as const }] }],
  });
  assert.equal(plain.boards.some((b) => b.id === "BENCH"), false, "no colour, no bench top");

  const topped = generateKitchenCabinet({
    ...plain.params,
    globalSettings: { length: 887, depth: 270, height: 880 },
    columns: [{ id: "c1", width: 887, zones: [{ id: "z1", height: 810, zoneType: "left_door" as const }] }],
    benchTopColorName: "Chestnut",
    doorSeries: "acrylic",
  });
  const bench = topped.boards.find((b) => b.id === "BENCH");
  assert.ok(bench, "bench board");
  assert.equal(bench!.x0, 0);
  assert.equal(bench!.x1, 887);
  assert.equal(bench!.y0, -36, "16 mm door + 20 mm past its face");
  assert.equal(bench!.y1, 254, "carcass back, depth 270 − door 16");
  assert.equal(bench!.z0, 880);
  assert.equal(bench!.z1, 905);
  assert.equal(bench!.materialThickness, 25);
  assert.equal(bench!.stock?.kind, "bench");
  assert.equal(bench!.stock?.sides, 1);
  assert.equal(bench!.milling, "B", "colour face stays up");
  const top = bench!.faces?.find((f) => f.id === "A");
  const underside = bench!.faces?.find((f) => f.id === "B");
  assert.equal(top?.finish?.colour, "Chestnut");
  assert.equal(top?.finish?.grain, "u");
  assert.equal(underside?.finish?.colour, "White Stipple");
  const bands = (bench!.faces ?? []).filter((f) => f.finish?.edgeBand);
  assert.equal(bands.length, 1, "front edge only");
  assert.equal(bands[0].normal, "-Y");
  assert.equal(bands[0].finish?.edgeBand?.colour, "Chestnut");
  assert.equal(bands[0].finish?.edgeBand?.thickness, 1);
  assert.equal(topped.grain?.issues.length ?? 0, 0);

  const long = generateKitchenCabinet({
    globalSettings: { length: 2500, depth: 270, height: 880 },
    materialThickness: 15, frontThickness: 16, bottomClearanceHeight: 70,
    columns: [{ id: "c1", width: 2500, zones: [{ id: "z1", height: 810, zoneType: "left_door" as const }] }],
    benchTopColorName: "Chestnut",
  });
  assert.ok(long.grain?.issues.some((i) => i.board === "BENCH" && i.side === "along"), JSON.stringify(long.grain?.issues));
}

/* ---------- waterfall: 25 mm drop, 45° mitre, carcass inboard of the outer width ---------- */
{
  const base = {
    globalSettings: { length: 862, depth: 270, height: 880 },
    materialThickness: 15, frontThickness: 16, bottomClearanceHeight: 70,
    columns: [{ id: "c1", width: 862, zones: [{ id: "z1", height: 810, zoneType: "left_door" as const }] }],
    benchTopColorName: "Chestnut",
  };
  const right = generateKitchenCabinet({ ...base, waterfall: "right" });
  assert.deepEqual(right.validation.errors, [], right.validation.errors.join("; "));
  const bench = right.boards.find((b) => b.id === "BENCH")!;
  const drop = right.boards.find((b) => b.id === "WATERFALL")!;
  assert.equal(bench.profilePlane, "XZ");
  assert.equal(bench.x0, 0);
  assert.equal(bench.x1, 887);
  assert.equal(bench.z0, 880);
  assert.equal(bench.z1, 905);
  assert.equal(drop.x0, 862);
  assert.equal(drop.x1, 887);
  assert.equal(drop.z0, 0);
  assert.equal(drop.z1, 905);
  assert.equal(drop.y0, bench.y0);
  assert.equal(drop.y1, bench.y1);
  const xz = (b: { profileVector?: Array<Record<string, number>> }) =>
    (b.profileVector ?? []).map((p) => `${p.x},${p.z}`);
  const shared = ["862,880", "887,905"];
  for (const p of shared) {
    assert.ok(xz(bench).includes(p), `bench missing ${p}`);
    assert.ok(xz(drop).includes(p), `drop missing ${p}`);
  }
  const col = right.debug?.columns?.[0];
  assert.equal(col?.x0, 0);
  assert.equal(col?.x1, 862);
  const top = bench.faces?.find((f) => f.semantic === "top");
  assert.equal(top?.finish?.colour, "Chestnut");
  const outer = drop.faces?.find((f) => f.semantic === "outer");
  assert.equal(outer?.finish?.colour, "Chestnut");

  const left = generateKitchenCabinet({ ...base, waterfall: "left" });
  const leftDrop = left.boards.find((b) => b.id === "WATERFALL")!;
  const leftBench = left.boards.find((b) => b.id === "BENCH")!;
  assert.equal(leftDrop.x0, 0);
  assert.equal(leftDrop.x1, 25);
  assert.equal(leftBench.x1, 887);
  assert.equal(left.debug?.columns?.[0]?.x0, 25);
  for (const p of ["0,905", "25,880"]) {
    assert.ok(xz(leftBench).includes(p), `left bench missing ${p}`);
    assert.ok(xz(leftDrop).includes(p), `left drop missing ${p}`);
  }

  const ensuite = generateKitchenCabinet({ ...base, baseKind: "ensuite", waterfall: "right" });
  assert.ok(ensuite.validation.errors.some((e) => e.includes("Waterfall is only on a kitchen")));
  assert.equal(ensuite.boards.some((b) => b.id === "WATERFALL"), false);
}

/* ---------- 放置草稿：空文件不改板；写上的板按规则挪盒子，尺寸不变 ---------- */
{
  const empty = generateKitchenCabinet(PARAMS, { layout: { module: "kitchen", version: 1, boards: {} } });
  assert.deepEqual(empty.validation.errors, []);
  const b2 = b("B2");
  const e2 = empty.boards.find((x) => x.id === "B2")!;
  assert.equal(e2.y0, 86, "an empty draft leaves the code position");
  assert.equal(e2.y1, 101);
  const size = (board: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }, axis: "x" | "y" | "z") =>
    String(Math.round((board[`${axis}1`] - board[`${axis}0`]) * 1000) / 1000);
  const y1 = 120;
  const moved = generateKitchenCabinet(PARAMS, {
    layout: {
      module: "kitchen", version: 1,
      boards: {
        B2: {
          axes: {
            x: { from: "lo", at: String(b2.x0), size: size(b2, "x") },
            y: { from: "hi", at: String(y1), size: size(b2, "y") },
            z: { from: "lo", at: String(b2.z0), size: size(b2, "z") },
          },
        },
      },
    },
  });
  assert.deepEqual(moved.validation.errors, []);
  const m2 = moved.boards.find((x) => x.id === "B2")!;
  assert.equal(m2.y1, y1);
  assert.equal(Math.round((m2.y1 - m2.y0) * 1000) / 1000, Math.round((b2.y1 - b2.y0) * 1000) / 1000);
  assert.equal(m2.x0, b2.x0);
  assert.equal(m2.z0, b2.z0);

  const v2 = b("V2");
  const notchY = r.debug?.provenance?.entries?.["V2.pv[0].y"]?.value;
  assert.equal(typeof notchY, "number");
  const contact = generateKitchenCabinet(PARAMS, {
    layout: {
      module: "kitchen", version: 1,
      boards: {
        B2: {
          axes: {
            x: { from: "lo", at: String(b2.x0), size: size(b2, "x") },
            y: { from: "hi", at: "V2.pv[0].y", size: size(b2, "y"), relation: { kind: "contact", ref: "V2.pv[0].y" } },
            z: { from: "lo", at: String(b2.z0), size: size(b2, "z") },
          },
        },
      },
    },
  });
  assert.deepEqual(contact.validation.errors, [], JSON.stringify(contact.validation.errors));
  const c2 = contact.boards.find((x) => x.id === "B2")!;
  assert.equal(c2.y1, notchY);
  // toeY is the 70 mm constant. The front can move by FPT + CPT; the thickness stays FPT.
  const b1 = b("B1");
  const shifted = generateKitchenCabinet(PARAMS, {
    layout: {
      module: "kitchen", version: 1,
      boards: {
        B1: {
          axes: {
            x: { from: "lo", at: String(b1.x0), size: size(b1, "x") },
            y: { from: "lo", at: "toeY - FPT - CPT", size: "(toeY + FPT) - kitchen.toeY" },
            z: { from: "lo", at: String(b1.z0), size: size(b1, "z") },
          },
        },
      },
    },
  });
  assert.deepEqual(shifted.validation.errors, [], JSON.stringify(shifted.validation.errors));
  const s1 = shifted.boards.find((x) => x.id === "B1")!;
  assert.equal(s1.y0, 70 - 16 - 15);
  assert.equal(s1.y1, s1.y0 + 16);
  const still = shifted.boards.find((x) => x.id === "B2")!;
  assert.equal(still.y0, 86, "a rule for B1 does not move B2");
  assert.equal(Math.round((c2.y1 - c2.y0) * 1000) / 1000, Math.round((b2.y1 - b2.y0) * 1000) / 1000);

  const vBefore = v2.profileVector?.map((p) => ("y" in p ? p.y : null)) ?? [];
  const slid = generateKitchenCabinet(PARAMS, {
    layout: {
      module: "kitchen", version: 1,
      boards: {
        V2: {
          axes: {
            x: { from: "lo", at: String(v2.x0), size: size(v2, "x") },
            y: { from: "lo", at: String(Math.round((v2.y0 + 10) * 1000) / 1000), size: size(v2, "y") },
            z: { from: "lo", at: String(v2.z0), size: size(v2, "z") },
          },
        },
      },
    },
  });
  assert.deepEqual(slid.validation.errors, []);
  const sv = slid.boards.find((x) => x.id === "V2")!;
  assert.equal(Math.round((sv.y0 - v2.y0) * 1000) / 1000, 10);
  const vAfter = sv.profileVector?.map((p) => ("y" in p ? p.y : null)) ?? [];
  assert.equal(vAfter.length, vBefore.length);
  assert.ok(vBefore.every((y, i) => y == null || Math.abs((vAfter[i] as number) - (y as number) - 10) < 1e-6), "YZ outline follows the box");

  const bad = generateKitchenCabinet(PARAMS, {
    layout: { module: "kitchen", version: 1, boards: { NOPE: { axes: { x: { from: "lo", at: "0", size: "10" }, y: { from: "lo", at: "0", size: "10" }, z: { from: "lo", at: "0", size: "10" } } } } },
  });
  assert.ok(bad.validation.warnings.some((e) => e.includes("NOPE")));
  assert.equal(bad.boards.find((x) => x.id === "B2")!.y1, 101, "a rule for a board that is not in this cabinet does not move the others");
}

/* ---------- Split Kitchen: two CPT end panels, half a front clearance, rails meet ---------- */
{
  const xb = 444;
  const cpt = 15;
  const fc = 2.5;
  const split = generateKitchenCabinet({ ...PARAMS, splitAfter: 0 });
  assert.deepEqual(split.validation.errors, []);
  assert.equal(split.debug?.split?.x, xb);
  const mates = split.boards.filter((x) => x.boardType === "vertical_panel" && x.x1 > xb - cpt - 0.1 && x.x0 < xb + cpt + 0.1 && x.id !== "V0");
  const leftV = mates.find((x) => Math.abs(x.x1 - xb) < 0.01 && Math.abs(x.x0 - (xb - cpt)) < 0.01);
  const rightV = mates.find((x) => Math.abs(x.x0 - xb) < 0.01 && Math.abs(x.x1 - (xb + cpt)) < 0.01);
  assert.ok(leftV && rightV, "two CPT panels meet on the column line");
  assert.equal(leftV!.materialThickness, cpt);
  assert.equal(rightV!.materialThickness, cpt);
  assert.equal(leftV!.stock?.kind, "carcass");
  const doorL = split.boards.find((x) => x.id === "c1-door-front-panel")!;
  const doorR = split.boards.find((x) => x.id === "c2-drawer-front-panel")!;
  assert.equal(doorL.x1, r2(xb - fc / 2));
  assert.equal(doorR.x0, r2(xb + fc / 2));
  const b1s = split.boards.filter((x) => x.boardType === "bottom_front").sort((a, b) => a.x0 - b.x0);
  assert.equal(b1s.length, 2);
  assert.equal(b1s[0].x1, xb);
  assert.equal(b1s[1].x0, xb);
  assert.equal(b1s[0].y0, 39, "split kick keeps the style 1 placement");
  const crossing = split.boards.filter((x) => x.x0 < xb - 0.01 && x.x1 > xb + 0.01 && x.boardType !== "bench_top");
  assert.deepEqual(crossing.map((x) => x.id), [], "no carcass board crosses the split");
  const shelfSlot = split.slots.find((x) => x.vPanelId === leftV!.id && x.forBoard === "c1-door-door-shelf");
  const drawerSlot = split.slots.find((x) => x.vPanelId === rightV!.id && x.forBoard === "k-col-2-c2-drawer-bottom");
  assert.equal(shelfSlot?.through, true, "split end takes a through slot");
  assert.equal(drawerSlot?.through, true);
  assert.equal(split.screws.some((x) => x.vPanelId === leftV!.id || x.vPanelId === rightV!.id), false);
  // The notch of the V across the cut overlaps this piece by 0.5 mm. Keeping it
  // draws a diagonal. Each piece notches only the V whose centre it contains.
  const slanted = (id: string) => {
    const pts = split.boards.find((x) => x.id === id)?.profileVector as { x: number; y?: number; z?: number }[] | undefined;
    assert.ok(pts, id);
    for (let i = 1; i < pts!.length; i += 1) {
      const a = pts![i - 1], b = pts![i];
      const sameX = Math.abs(a.x - b.x) < 0.02;
      const av = a.y ?? a.z ?? 0, bv = b.y ?? b.z ?? 0;
      assert.ok(sameX || Math.abs(av - bv) < 0.02, `${id} edge ${a.x},${av} → ${b.x},${bv} is not rectangular`);
    }
  };
  for (const id of ["B3-1", "B3-2", "T1-1", "T1-2", "T2-1", "T2-2", "T3-1", "T3-2", "B4-1", "B4-2"]) slanted(id);

  // An open neighbour would normally cover the shared V. On a split it still stops half a clearance short.
  const openRight = generateKitchenCabinet({
    ...PARAMS,
    splitAfter: 0,
    columns: [
      PARAMS.columns[0],
      { id: "k-col-2", width: 443, zones: [{ id: "open-1", height: 825, zoneType: "open" as const }] },
    ],
  });
  assert.equal(openRight.boards.find((x) => x.id === "c1-door-front-panel")!.x1, r2(xb - fc / 2));

  const long = generateKitchenCabinet({
    ...PARAMS,
    globalSettings: { length: 2460, depth: 270, height: 880 },
    columns: [
      { ...PARAMS.columns[0], width: 1200 },
      { ...PARAMS.columns[1], width: 1260 },
    ],
  });
  assert.ok(long.validation.warnings.some((w) => w.includes("2400")), JSON.stringify(long.validation.warnings));
  const cut = generateKitchenCabinet({
    ...long.params ? {} : {},
    ...PARAMS,
    splitAfter: 0,
    globalSettings: { length: 2460, depth: 270, height: 880 },
    columns: [
      { ...PARAMS.columns[0], width: 1200 },
      { ...PARAMS.columns[1], width: 1260 },
    ],
  });
  assert.equal(cut.validation.warnings.some((w) => w.includes("2400")), false, JSON.stringify(cut.validation.warnings));

  // A wheel arch on one side is cut only on that side.
  const archL = generateKitchenCabinet({
    ...PARAMS,
    splitAfter: 0,
    wheelAvoidances: [{ id: "wa", x0: 0, x1: 300, height: 200, depth: 120 }],
  });
  const coversL = archL.boards.filter((x) => x.boardType === "avoidance_top" || x.boardType === "avoidance_front" || x.boardType === "raised_b4");
  assert.ok(coversL.length > 0);
  assert.ok(coversL.every((x) => x.x1 <= xb + 0.01), coversL.map((x) => `${x.id} ${x.x0}-${x.x1}`).join(", "));
  const archR = generateKitchenCabinet({
    ...PARAMS,
    splitAfter: 0,
    wheelAvoidances: [{ id: "wa", x0: 500, x1: 800, height: 200, depth: 120 }],
  });
  const coversR = archR.boards.filter((x) => x.boardType === "avoidance_top" || x.boardType === "avoidance_front" || x.boardType === "raised_b4");
  assert.ok(coversR.length > 0);
  assert.ok(coversR.every((x) => x.x0 >= xb - 0.01), coversR.map((x) => `${x.id} ${x.x0}-${x.x1}`).join(", "));
}

console.log("kitchen: all golden tests passed");
