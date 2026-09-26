/**
 * Kitchen 黄金测试 — 数值取自规格 §8（kitchen_base 黄金参数）。
 * 厨房 Y：y=0 为前缘，数值直接对拍，无坐标转换。
 * 预期含 1 条 error（V1 双侧半槽冲突，黄金集本身如此）。
 */
import assert from "node:assert/strict";
import { generateKitchenCabinet } from "./generator.ts";

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
assert.deepEqual(place("B1"), { x0: 16, x1: 887, y0: 70, y1: 86, z0: 0, z1: 55 });
assert.equal(b("B1").materialThickness, 16);
assert.deepEqual(place("B2"), { x0: 16, x1: 887, y0: 86, y1: 101, z0: 0, z1: 55 });
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
assert.deepEqual(b("c1-door-door-shelf").profileVector, [
  { x: 16, y: 0 }, { x: 436.5, y: 0 }, { x: 436.5, y: 84.667 }, { x: 444, y: 84.667 },
  { x: 444, y: 169.333 }, { x: 436.5, y: 169.333 }, { x: 436.5, y: 254 }, { x: 16, y: 254 },
  { x: 16, y: 169.333 }, { x: 1, y: 169.333 }, { x: 1, y: 84.667 }, { x: 16, y: 84.667 }, { x: 16, y: 0 },
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

console.log("kitchen: all golden tests passed");
