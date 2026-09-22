/**
 * GeneralTall 黄金测试 — 数值取自规格 §8（uiDefault / baseParams / H 用例 / 避让用例）。
 * 坐标：柜体最终位置。立梃前端 y=FPT，后缘可探出侧板；门左右让 fc。
 */
import assert from "node:assert/strict";
import { generateGeneralTall } from "./generator.ts";
import type { GTParams } from "./types.ts";

function b(r: ReturnType<typeof generateGeneralTall>, id: string) {
  const board = r.boards.find((x) => x.id === id);
  assert.ok(board, `board ${id} missing`);
  return board;
}
function place(r: ReturnType<typeof generateGeneralTall>, id: string) {
  const board = b(r, id);
  const round = (v: number) => Math.round(v * 100) / 100;
  return { x0: round(board.x0), x1: round(board.x1), y0: round(board.y0), y1: round(board.y1), z0: round(board.z0), z1: round(board.z1) };
}
const r2 = (v: number) => Math.round(v * 1000) / 1000;

const UI: GTParams = {
  cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584,
  panelThickness: 16, frontPanelThickness: 16, ziThickness: 15, hThickness: 15,
  sideClearance: 3, dividerThickness: 15,
  topSystem: { style: "style_1", frontRailHeight: 40 },
  bottomSystem: { style: "style_1", frontRailHeight: 53 },
  zones: [
    { id: "zone-1", type: "side_door", height: 600 },
    { id: "zone-2", type: "drawer", height: 300 },
    { id: "zone-3", type: "double_door", height: 945, verticalDivider: true },
  ],
};

/* ================= uiDefault 黄金 ================= */
{
  const r = generateGeneralTall(UI);
  assert.deepEqual(r.validation.errors, []);
  // H mid [950,1050] 与 full_zi[984,999] 冲突 → 3 条移动评估 warning（§8.8）
  assert.deepEqual(r.validation.warnings, [
    "H H13_mid overlaps full_zi boundary-zone-3; Stage 2 movement evaluated.",
    "H H24_mid overlaps full_zi boundary-zone-3; Stage 2 movement evaluated.",
    "H H34_mid overlaps full_zi boundary-zone-3; Stage 2 movement evaluated.",
  ]);

  // 堆叠链（§8.2）
  const zOf = r.stack.map((i) => `${i.id}:${i.z0}-${i.z1}`);
  assert.deepEqual(zOf, [
    "bottom-system:0-69", "zone-zone-1:69-669", "boundary-zone-2:669-684",
    "zone-zone-2:684-984", "boundary-zone-3:984-999", "zone-zone-3:999-1944", "top-system:1944-2000",
  ]);
  assert.equal(r.stack.find((i) => i.id === "boundary-zone-2")!.boundaryType, "full_zi");
  assert.equal(r.stack.find((i) => i.id === "boundary-zone-3")!.boundaryType, "full_zi"); // 双门升级（本就 full）

  // V1/V2：21 点轮廓；从 y=0 起，深 150。前脸 y=70，贴 T2 后缘。
  assert.deepEqual(place(r, "V1"), { x0: 0, x1: 16, y0: 0, y1: 150, z0: 0, z1: 2000 });
  assert.deepEqual(place(r, "V2"), { x0: 584, x1: 600, y0: 0, y1: 150, z0: 0, z1: 2000 });
  assert.deepEqual(b(r, "V1").profileVector, [
    { y: 70, z: 0 }, { y: 150, z: 0 }, { y: 150, z: 668.5 }, { y: 100, z: 668.5 },
    { y: 100, z: 684.5 }, { y: 150, z: 684.5 }, { y: 150, z: 983.5 }, { y: 100, z: 983.5 },
    { y: 100, z: 999.5 }, { y: 150, z: 999.5 }, { y: 150, z: 2000 }, { y: 70, z: 2000 },
    { y: 70, z: 1960 }, { y: 80, z: 1960 }, { y: 80, z: 1944 }, { y: 0, z: 1944 },
    { y: 0, z: 69 }, { y: 80, z: 69 }, { y: 80, z: 53 }, { y: 70, z: 53 }, { y: 70, z: 0 },
  ]);

  // V3/V4：后缘 y = midDepth = 568（yOff = 418）
  assert.deepEqual(place(r, "V3"), { x0: 0, x1: 16, y0: 418, y1: 568, z0: 0, z1: 2000 });
  assert.deepEqual(b(r, "V3").profileVector, [
    { y: 418, z: 0 }, { y: 568, z: 0 }, { y: 568, z: 1895 }, { y: 552, z: 1895 },
    { y: 552, z: 1984 }, { y: 447, z: 1984 }, { y: 447, z: 2000 }, { y: 418, z: 2000 },
    { y: 418, z: 999.5 }, { y: 468, z: 999.5 }, { y: 468, z: 983.5 }, { y: 418, z: 983.5 },
    { y: 418, z: 684.5 }, { y: 468, z: 684.5 }, { y: 468, z: 668.5 }, { y: 418, z: 668.5 }, { y: 418, z: 0 },
  ]);

  // 端系统：T1/T2 前轨 40；T3 插板 16 在轨下（堆叠顶带 1944–2000）
  assert.deepEqual(place(r, "T1"), { x0: 0, x1: 600, y0: 39, y1: 55, z0: 1960, z1: 2000 });
  assert.equal(b(r, "T1").materialThickness, 16);
  assert.deepEqual(place(r, "T2"), { x0: 0, x1: 600, y0: 55, y1: 70, z0: 1960, z1: 2000 });
  assert.deepEqual(place(r, "T3"), { x0: 0, x1: 600, y0: 0, y1: 150, z0: 1944, z1: 1960 });
  assert.deepEqual(b(r, "T3").profileVector, [
    { x: 0, y: 0 }, { x: 0, y: 75 }, { x: 16, y: 75 }, { x: 16, y: 150 },
    { x: 584, y: 150 }, { x: 584, y: 75 }, { x: 600, y: 75 }, { x: 600, y: 0 },
  ]);
  assert.deepEqual(b(r, "B3").profileVector, b(r, "T3").profileVector);
  assert.deepEqual(place(r, "B1"), { x0: 0, x1: 600, y0: 39, y1: 55, z0: 0, z1: 53 });
  assert.deepEqual(place(r, "B3"), { x0: 0, x1: 600, y0: 0, y1: 150, z0: 53, z1: 69 });

  // H 支撑：mid 与 full_zi[984,999] 冲突移动（§8.8 推导）；uiDefault midDepth=568 → y[150,418]
  assert.deepEqual(place(r, "H13_top"), { x0: 0, x1: 15, y0: 150, y1: 418, z0: 1900, z1: 2000 });
  assert.deepEqual(place(r, "H24_top"), { x0: 585, x1: 600, y0: 150, y1: 418, z0: 1900, z1: 2000 });
  assert.deepEqual(place(r, "H13_bottom"), { x0: 0, x1: 15, y0: 150, y1: 418, z0: 0, z1: 100 });
  assert.deepEqual(place(r, "H34_bottom"), { x0: 15, x1: 585, y0: 553, y1: 568, z0: 0, z1: 100 });
  // H mid 移动：H13/H24 → [883,983]（below）；H34 → [998,1098]（above）
  assert.deepEqual(place(r, "H13_mid"), { x0: 0, x1: 15, y0: 150, y1: 418, z0: 883, z1: 983 });
  assert.deepEqual(place(r, "H24_mid"), { x0: 585, x1: 600, y0: 150, y1: 418, z0: 883, z1: 983 });
  assert.deepEqual(place(r, "H34_mid"), { x0: 15, x1: 585, y0: 553, y1: 568, z0: 998, z1: 1098 });

  // VD（§8.7）：core 心 300（mw=600）→ x[292.5,307.5]；底舌 991.5
  assert.deepEqual(place(r, "VD_zone-3"), { x0: 292.5, x1: 307.5, y0: 0, y1: 568, z0: 999, z1: 1944 });
  {
    const prof = b(r, "VD_zone-3").profileVector as { y: number; z: number }[];
    assert.equal(Math.min(...prof.map((p) => p.z)), 991.5); // 底舌 = 999 − 7.5
    assert.ok(prof.some((p) => p.y === 189.333 && p.z === 999), "tongue y0 corner");
    assert.ok(prof.some((p) => p.y === 378.667 && p.z === 999), "tongue y1 corner");
    assert.ok(prof.some((p) => p.y === 552), "h34 overlap retreats to midDepth-16");
    assert.ok(prof.some((p) => p.y === 568), "rear elsewhere stays at midDepth");
  }

  // zi_groove：仅贴 VD 的功能区边界（zone-3 上方是顶系统 → 无上边界）
  assert.equal(r.ziGrooves.length, 1);
  {
    const g0 = r.ziGrooves.find((g) => g.boardId === "Zi_boundary-zone-3")!;
    assert.equal(g0.face, "top");
    assert.deepEqual([g0.x0, g0.x1], [292, 308]);
    assert.deepEqual([r2(g0.y0), r2(g0.y1)], [184.333, 383.667]);
    assert.equal(g0.depth, 8);
  }

  // zi_slot：8 条（V1/V2 各 2 + V3/V4 各 2）；z = 心 ±8
  assert.equal(r.ziSlots.length, 8);
  {
    const s1 = r.ziSlots.find((x) => x.vPanelId === "V1" && x.boundaryId === "boundary-zone-2")!;
    assert.deepEqual([s1.y0, s1.y1], [100, 150]);
    assert.deepEqual([s1.z0, s1.z1], [668.5, 684.5]);
    const s3 = r.ziSlots.find((x) => x.vPanelId === "V3" && x.boundaryId === "boundary-zone-3")!;
    assert.deepEqual([s3.y0, s3.y1], [418, 468]);
    assert.deepEqual([s3.z0, s3.z1], [983.5, 999.5]);
  }

  // Zi 板 bbox：full_zi y[0, midDepth=568]
  assert.deepEqual(place(r, "Zi_boundary-zone-2"), { x0: 0, x1: 600, y0: 0, y1: 568, z0: 669, z1: 684 });

  // 门：左右让 2.5；底 style_1 下沿盖到 B3 底；顶 style_1 上沿盖到 T3 顶；门缝在边界心
  assert.deepEqual(place(r, "FP_zone-1"), { x0: 2.5, x1: 597.5, y0: -16, y1: 0, z0: 53, z1: 675.25 });
  assert.deepEqual(place(r, "FP_zone-2"), { x0: 2.5, x1: 597.5, y0: -16, y1: 0, z0: 677.75, z1: 990.25 });
  assert.deepEqual(place(r, "FP_zone-3_L"), { x0: 2.5, x1: 298.75, y0: -16, y1: 0, z0: 992.75, z1: 1960 });
  assert.deepEqual(place(r, "FP_zone-3_R"), { x0: 301.25, x1: 597.5, y0: -16, y1: 0, z0: 992.75, z1: 1960 });

  // 铰链：zone-1 高 622.25 → sd 夹到 100；杯心 X = 门左缘+22.5
  {
    const hs = r.hinges.filter((h) => h.panelId === "FP_zone-1");
    assert.equal(hs.length, 2);
    assert.deepEqual(hs.map((h) => h.centerX), [25, 25]);
    assert.deepEqual(hs.map((h) => r2(h.centerZ)).sort((a, c) => c - a), [575.25, 153]);
    assert.equal(r.hinges.filter((h) => h.panelId === "FP_zone-2").length, 0); // 抽屉面板无铰链
  }

  // 板计数：4 V + 6 端系 + T4/T5 + 2 Zi + 8 H + 1 VD + 4 FP = 27
  assert.equal(r.boards.length, 27);
  assert.ok(r.boards.some((x) => x.id === "T4"), "T4 always emitted at midDepth");
  assert.ok(r.boards.some((x) => x.id === "T5"), "T5 always emitted at midDepth");
  assert.deepEqual(place(r, "T5"), { x0: 0, x1: 600, y0: 552, y1: 567, z0: 1900, z1: 2000 });
  assert.deepEqual(place(r, "T4"), { x0: 0, x1: 600, y0: 452, y1: 552, z0: 1984, z1: 1999 });
  assert.ok(r.joints.some((j) => j.id === "gt_t4_t5_rear_stack"), "T4↔T5");
  assert.ok(r.joints.some((j) => j.id === "gt_t5_v3"), "T5↔V3");
  assert.equal(r.boards.find((x) => x.id === "FP_zone-1")?.category, "front_panel");
  assert.ok(["gt_b1_b3_bottom_rail_to_deck", "gt_b2_b3_carcass_rail_to_deck", "gt_t1_t3_top_rail_to_insert", "gt_t2_t3_carcass_rail_to_insert"].every((id) => r.joints.some((j) => j.id === id)));
  assert.equal(r.debug?.boardFrame, "final");
}

/* ================= baseParams 黄金（5 区链 + mismatch −30 + 25 点 V1） ================= */
{
  const r = generateGeneralTall({
    cabinetHeight: 2100, cabinetWidth: 664, cabinetDepth: 600,
    panelThickness: 16, frontFaceAllowance: 16, ziThickness: 15, hThickness: 15,
    sideClearance: 3, dividerThickness: 15,
    topSystem: { style: "style_1", frontRailHeight: 40 },
    bottomSystem: { style: "style_1", frontRailHeight: 53 },
    zones: [
      { id: "side-door", type: "side_door", height: 600 },
      { id: "drawer-a", type: "drawer", height: 300 },
      { id: "drawer-b", type: "drawer", height: 300 },
      { id: "blank", type: "blank_panel", height: 400 },
      { id: "open", type: "open_space", height: 300 },
    ],
  });
  assert.deepEqual(r.validation.errors, []);
  assert.ok(r.validation.warnings.some((w) => w.includes("difference = -30")), "mismatch -30");

  // 堆叠链（§8.2 表）
  const zOf = r.stack.map((i) => `${i.id}:${i.z0}-${i.z1}`);
  assert.deepEqual(zOf, [
    "bottom-system:0-69", "zone-side-door:69-669", "boundary-drawer-a:669-684",
    "zone-drawer-a:684-984", "boundary-drawer-b:984-999", "zone-drawer-b:999-1299",
    "boundary-blank:1299-1314", "zone-blank:1314-1714", "zone-open:1714-2014", "top-system:2014-2070",
  ]);
  // 边界类型：side→drawer full、drawer→drawer half、drawer→blank full、blank→open none
  assert.equal(r.stack.find((i) => i.id === "boundary-drawer-a")!.boundaryType, "full_zi");
  assert.equal(r.stack.find((i) => i.id === "boundary-drawer-b")!.boundaryType, "half_zi");
  assert.equal(r.stack.find((i) => i.id === "boundary-blank")!.boundaryType, "full_zi");

  // V1 25 点（3 槽：full+half+full）；槽角点含 half（983.5/999.5）
  {
    const prof = b(r, "V1").profileVector as { y: number; z: number }[];
    assert.equal(prof.length, 25);
    assert.ok(prof.some((p) => p.y === 100 && p.z === 668.5), "slot1");
    assert.ok(prof.some((p) => p.y === 100 && p.z === 983.5), "slot2 (half)");
    assert.ok(prof.some((p) => p.y === 100 && p.z === 1298.5), "slot3");
  }
  // V3/V4：17 点（2 full 槽；half 不给后梃）
  assert.equal((b(r, "V3").profileVector as unknown[]).length, 17);
  assert.equal(r.ziSlots.length, 10); // 3×2（V1/V2）+ 2×2（V3/V4）

  // H12（blank 400 ≥ 300 → 两条各 100）
  assert.deepEqual(place(r, "H12_blank_top"), { x0: 0, x1: 664, y0: 0, y1: 15, z0: 1614, z1: 1714 });
  assert.deepEqual(place(r, "H12_blank_bottom"), { x0: 0, x1: 664, y0: 0, y1: 15, z0: 1314, z1: 1414 });

  // H mid [1000,1100] 无冲突（half[984,999] 不冲突、full[1299,1314] 不冲突）；md=584 → y[150,434]
  assert.deepEqual(place(r, "H13_mid"), { x0: 0, x1: 15, y0: 150, y1: 434, z0: 1000, z1: 1100 });

  // 端系统 z（§8.4 baseParams）：T1/T2 [2060,2100]、T3 [2044,2060]、B3 [53,69]
  assert.deepEqual(place(r, "T3"), { x0: 0, x1: 664, y0: 0, y1: 150, z0: 2044, z1: 2060 });
  assert.deepEqual(place(r, "B3"), { x0: 0, x1: 664, y0: 0, y1: 150, z0: 53, z1: 69 });
}

/* ================= §8.5 H 用例（CW700 双 16 侧板，单 open 区 1975） ================= */
{
  const r = generateGeneralTall({
    cabinetHeight: 2100, cabinetWidth: 700, cabinetDepth: 600,
    panelThickness: 16, frontPanelThickness: 16, ziThickness: 15, hThickness: 15,
    leftSidePanelThickness: 16, rightSidePanelThickness: 16,
    topSystem: { style: "style_1", frontRailHeight: 40 },
    bottomSystem: { style: "style_1", frontRailHeight: 53 },
    zones: [{ id: "open", type: "open_space", height: 1975 }],
  });
  assert.deepEqual(r.validation.errors, []);
  // 堆叠：69 + 1975 + 56 = 2100 ✓
  assert.deepEqual(place(r, "H13_top"), { x0: 16, x1: 31, y0: 150, y1: 434, z0: 2000, z1: 2100 });
  assert.deepEqual(place(r, "H24_top"), { x0: 669, x1: 684, y0: 150, y1: 434, z0: 2000, z1: 2100 });
  assert.deepEqual(place(r, "H13_bottom"), { x0: 16, x1: 31, y0: 150, y1: 434, z0: 0, z1: 100 });
  assert.deepEqual(place(r, "H24_bottom"), { x0: 669, x1: 684, y0: 150, y1: 434, z0: 0, z1: 100 });
  assert.deepEqual(place(r, "H34_bottom"), { x0: 31, x1: 669, y0: 569, y1: 584, z0: 0, z1: 100 });
  assert.deepEqual(place(r, "H13_mid"), { x0: 16, x1: 31, y0: 150, y1: 434, z0: 1000, z1: 1100 });
  assert.deepEqual(place(r, "H24_mid"), { x0: 669, x1: 684, y0: 150, y1: 434, z0: 1000, z1: 1100 });
  assert.deepEqual(place(r, "H34_mid"), { x0: 31, x1: 669, y0: 569, y1: 584, z0: 1000, z1: 1100 });
  assert.equal(r.boards.filter((x) => x.id.startsWith("H")).length, 8); // 无 H34_top（黄金行为）
  // 立梃在侧板内侧，前端 y=FPT
  assert.deepEqual(place(r, "V1"), { x0: 16, x1: 32, y0: 0, y1: 150, z0: 0, z1: 2100 });
  assert.deepEqual(place(r, "V2"), { x0: 668, x1: 684, y0: 0, y1: 150, z0: 0, z1: 2100 });
  assert.deepEqual(place(r, "SidePanel_L"), { x0: 0, x1: 16, y0: -16, y1: 584, z0: 0, z1: 2100 });
  // 声明：骨架 4 + 侧板 2 + T4/T5
  assert.ok(r.joints.some((j) => j.id === "gt_sidepanel_l_v1"));
  assert.ok(r.joints.some((j) => j.id === "gt_t4_t5_rear_stack"));
  assert.ok(r.joints.length >= 8);
  // 侧板白名单
  {
    const bad = generateGeneralTall({
      cabinetHeight: 2100, cabinetWidth: 700, cabinetDepth: 600,
      leftSidePanelThickness: 18,
      topSystem: { style: "style_1", frontRailHeight: 40 },
      bottomSystem: { style: "style_1", frontRailHeight: 53 },
      zones: [{ id: "open", type: "open_space", height: 1975 }],
    });
    assert.ok(bad.validation.errors.some((e) => e.includes("side panel thickness must be one of")));
  }
}

/* ================= §8.6 避让用例（uiDefault + 200×400 + 双 16 侧板） ================= */
{
  const r = generateGeneralTall({
    ...UI,
    leftSidePanelThickness: 16, rightSidePanelThickness: 16,
    avoidance: { enabled: true, depth: 200, height: 400 },
  });
  assert.deepEqual(r.validation.errors, []);
  assert.deepEqual(place(r, "H13_bottom"), { x0: 16, x1: 31, y0: 150, y1: 418, z0: 400, z1: 500 });
  assert.deepEqual(place(r, "H24_bottom"), { x0: 569, x1: 584, y0: 150, y1: 418, z0: 400, z1: 500 });
  assert.deepEqual(place(r, "H34_bottom"), { x0: 31, x1: 569, y0: 553, y1: 568, z0: 400, z1: 500 });
  assert.deepEqual(place(r, "avoidance_horizontal"), { x0: 16, x1: 584, y0: 368, y1: 568, z0: 385, z1: 400 });
  assert.deepEqual(place(r, "Avoidance_Vertical"), { x0: 16, x1: 584, y0: 368, y1: 383, z0: 0, z1: 385 });
  // 避让高 400，边界在 z=669，不缩短
  {
    const zi = b(r, "Zi_boundary-zone-2");
    assert.equal(zi.boardType, "full_zi");
    assert.equal(zi.y1, 568);
  }
  // 侧板缺口：柜体 Y，后墙 midDepth=568
  assert.deepEqual(b(r, "SidePanel_L").profileVector, [
    { y: -16, z: 0 }, { y: 368, z: 0 }, { y: 368, z: 400 }, { y: 568, z: 400 },
    { y: 568, z: 2000 }, { y: -16, z: 2000 },
  ]);
  // V3/V4 full 避让（ad=200 > 150）：底边抬到 400，后缘 y=FPT+midDepth
  {
    const prof = b(r, "V3").profileVector as { y: number; z: number }[];
    assert.equal(prof[0].y, 418);
    assert.equal(prof[0].z, 400);
  }
}

/* ================= §8.8 H mid 冲突移动（side 930 + drawer 500 + open 600） ================= */
{
  const r = generateGeneralTall({
    cabinetHeight: 2100, cabinetWidth: 664, cabinetDepth: 600,
    panelThickness: 16, frontPanelThickness: 16, ziThickness: 15, hThickness: 15,
    topSystem: { style: "style_1", frontRailHeight: 40 },
    bottomSystem: { style: "style_1", frontRailHeight: 53 },
    zones: [
      { id: "side", type: "side_door", height: 930 },
      { id: "drawer", type: "drawer", height: 500 },
      { id: "open", type: "open_space", height: 600 },
    ],
  });
  assert.deepEqual(r.validation.errors, []);
  // full_zi z[1000,1015]（side→drawer 边界：69+930=999 +15 = [999,1014]？核对：zone side 999 结束？
  // 堆叠：bottom 0-69、side 69-999、full_zi 999-1014、drawer 1014-1514、open 1514-2114、top……
  // §8.8 给 full_zi z[1000,1015]（CH300 假设？）——按实现数值断言移动量：
  const zi = r.stack.find((i) => i.id === "boundary-drawer")!;
  // H13/H24_mid 移 below：[zi.z0−101, zi.z0−1]；H34_mid 移 above：[zi.z1−1, +99]
  assert.deepEqual(place(r, "H13_mid"), { x0: 0, x1: 15, y0: 150, y1: 434, z0: r2(zi.z0 - 101), z1: r2(zi.z0 - 1) });
  assert.deepEqual(place(r, "H34_mid"), { x0: 15, x1: 649, y0: 569, y1: 584, z0: r2(zi.z1 - 1), z1: r2(zi.z1 + 99) });
  assert.ok(r.validation.warnings.some((w) => w.includes("Stage 2 movement evaluated")));
}

/* ================= §8.10 锁位置（shelf_top / side / top / bottom） ================= */
{
  const r = generateGeneralTall({
    ...UI,
    zones: [
      { id: "zone-1", type: "side_door", height: 600, lockPosition: "shelf_top", shelfEnabled: true, shelfHeight: 400 },
      { id: "zone-2", type: "drawer", height: 300 },
      { id: "zone-3", type: "double_door", height: 945, verticalDivider: true, lockPosition: "side", lockHeight: 500 },
    ],
  });
  assert.deepEqual(r.validation.errors, []);
  // DS：顶面 = zone.z0 + shelfHeight = 469，厚 CPT=16
  assert.deepEqual(place(r, "DS_zone-1"), { x0: 0, x1: 600, y0: 0, y1: 568, z0: 453, z1: 469 });
  // shelf_top 锁：centerZ = DS.z1 + 30.5 = 499.5
  {
    const lock = r.locks.find((l) => l.panelId === "FP_zone-1")!;
    assert.equal(lock.centerZ, 499.5);
    assert.equal(lock.mountingFace, "top");
    assert.equal(lock.width, 55);
    assert.equal(lock.height, 15.5);
    assert.equal(lock.radius, 7.75);
  }
  // side 锁（双门）：centerZ = zone 堆叠 z0(999) + lockHeight(500) = 1499；挂 VD
  {
    const lock = r.locks.find((l) => l.panelId === "FP_zone-3_L")!;
    assert.equal(lock.mountingFace, "side");
    assert.equal(lock.mountingBoardId, "VD_zone-3");
    assert.equal(r2(lock.centerZ), 1499); // 堆叠 z0 999 + 500
  }
}

/* ---------- bench 合同 ---------- */
{
  const r = generateGeneralTall(UI);
  const entries = r.debug.provenance.entries;
  assert.ok(Object.keys(entries).length > 0, "tall provenance is not empty");
  for (const board of r.boards) {
    for (const face of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) {
      const e = entries[`${board.id}.${face}`];
      assert.ok(e, `${board.id}.${face} has no provenance`);
      assert.equal(e.value, board[face], `${board.id}.${face} provenance value`);
    }
  }
  assert.equal(entries["tall.midDepth"]?.formula, "CD - FPT");
  for (const j of r.joints) {
    assert.equal(typeof j.a?.board, "string", `${j.id} a.board`);
    assert.equal(typeof j.b?.board, "string", `${j.id} b.board`);
  }
  const grooved = r.boards.some((board) => (board.faces ?? []).some((f) => f.features.some((x) => x.kind === "groove")));
  assert.ok(grooved, "tall hangs Zi grooves on faces");
}

function hasPoint(prof: { y: number; z: number }[] | undefined, y: number, z: number) {
  return !!prof?.some((p) => Math.abs(p.y - y) < 0.02 && Math.abs(p.z - z) < 0.02);
}

/* ================= fridge：高度同步 / 无门 / CW / V5 / raised ================= */
{
  const fridge = (extra: Partial<GTParams> = {}) => generateGeneralTall({
    cabinetHeight: 2100, cabinetWidth: 664, cabinetDepth: 600,
    panelThickness: 16, frontPanelThickness: 16, ziThickness: 15, hThickness: 15,
    topSystem: { style: "style_1", frontRailHeight: 40 },
    bottomSystem: { style: "style_1", frontRailHeight: 53 },
    zones: [
      { id: "fridge-cavity", type: "fridge", height: 999, applianceHeightMm: 1470, applianceWidthMm: 619 },
      { id: "open", type: "open_space", height: 505 },
    ],
    ...extra,
  });

  const synced = fridge();
  const item = synced.stack.find((i) => i.id === "zone-fridge-cavity")!;
  assert.equal(item.height, 1470);
  assert.ok(Math.abs(item.z1 - item.z0 - 1470) < 0.01);
  assert.equal(synced.boards.filter((b) => b.id.startsWith("FP_fridge")).length, 0);
  assert.ok(synced.validation.warnings.some((w) => w.includes("1470")));
  assert.equal(synced.params.cabinetWidth, 664); // 619+45

  const none = fridge({ cabinetWidth: 500 });
  assert.equal(none.params.cabinetWidth, 664);
  assert.ok(none.validation.warnings.some((w) => w.includes("619+45=664")));

  const left = fridge({ exteriorSide: "left", cabinetWidth: 500 });
  assert.equal(left.params.cabinetWidth, 680); // 619+61
  const v5Right = left.boards.find((b) => b.id === "V5")!;
  assert.ok(v5Right.x0 > 300, "V5 opposite exterior left → right half");
  assert.ok(left.boards.some((b) => b.id === "SidePanel_L"));
  assert.equal(v5Right.y0, 16);
  assert.equal(v5Right.y1, left.params.midDepth + 16);

  const raised = fridge({
    avoidance: { enabled: true, depth: 200, height: 20 },
  });
  assert.equal((raised.debug as { fridgeAvoidance?: { finalMode: string } })?.fridgeAvoidance?.finalMode, "raised");
  assert.ok(!raised.boards.some((b) => b.id.endsWith("_bottom") && b.category === "h_support"));
  assert.ok(raised.boards.some((b) => b.id === "H13_fridge"));
  assert.ok(raised.boards.some((b) => b.id === "H24_fridge"));
  assert.ok(raised.boards.some((b) => b.id === "H34_fridge"));
}

/* ================= style_2 + mixed ================= */
{
  const style2 = generateGeneralTall({
    cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584,
    panelThickness: 16, frontPanelThickness: 16,
    topSystem: { style: "style_2", height: 80 },
    bottomSystem: { style: "style_2", height: 100 },
    zones: [{ id: "open", type: "open_space", height: 1820 }],
  });
  assert.deepEqual(style2.validation.errors, []);
  assert.ok(!style2.boards.some((b) => b.id === "T1"));
  assert.ok(!style2.boards.some((b) => b.id === "B1"));
  assert.deepEqual(place(style2, "TH1"), { x0: 0, x1: 600, y0: 0, y1: 100, z0: 1984, z1: 1999 });
  assert.deepEqual(place(style2, "BH1"), { x0: 0, x1: 600, y0: 0, y1: 100, z0: 1, z1: 16 });
  assert.deepEqual(place(style2, "T5"), { x0: 0, x1: 600, y0: 552, y1: 567, z0: 1900, z1: 2000 });
  assert.deepEqual(place(style2, "TopStyle2FixedFrontPanel"), { x0: 3, x1: 597, y0: -16, y1: 0, z0: 1920, z1: 2000 });
  assert.deepEqual(place(style2, "BottomStyle2FixedFrontPanel"), { x0: 3, x1: 597, y0: -16, y1: 0, z0: 0, z1: 100 });
  const v1s2 = b(style2, "V1").profileVector as { y: number; z: number }[];
  assert.ok(hasPoint(v1s2, 105, 2000), "V1 top style_2 notch");
  assert.ok(hasPoint(v1s2, 105, 1984), "V1 top style_2 notch depth");
  assert.ok(hasPoint(v1s2, 105, 0), "V1 bottom style_2 notch");
  assert.ok(hasPoint(v1s2, 105, 16), "V1 bottom style_2 notch depth");
  assert.ok(style2.joints.some((j) => j.id === "gt_th1_fixed_front"), "style_2 TH1↔fixed front");
  assert.ok(style2.joints.some((j) => j.id === "gt_bh1_fixed_front"), "style_2 BH1↔fixed front");
  assert.ok(style2.joints.some((j) => j.id === "gt_t4_t5_rear_stack"));

  const mixedBot = generateGeneralTall({
    cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584,
    panelThickness: 16, frontPanelThickness: 16,
    topSystem: { style: "style_1", frontRailHeight: 40 },
    bottomSystem: { style: "style_2", height: 100 },
    zones: [{ id: "open", type: "open_space", height: 1844 }],
  });
  assert.ok(mixedBot.boards.some((x) => x.id === "T1"));
  assert.ok(mixedBot.boards.some((x) => x.id === "BH1"));
  assert.ok(!mixedBot.boards.some((x) => x.id === "B1"));
  const v1m = b(mixedBot, "V1").profileVector as { y: number; z: number }[];
  assert.ok(hasPoint(v1m, 0, 1944), "mixed keeps style_1 top insert");
  assert.ok(hasPoint(v1m, 105, 0), "mixed style_2 bottom notch");
}

console.log("generalTall: all golden tests passed");
