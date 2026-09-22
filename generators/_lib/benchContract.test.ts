/**
 * Migrated generators must feed bench explode + formula display.
 */
import assert from "node:assert/strict";
import { planExplode, isStrong } from "../../renderer/bench/explode.js";
import { generateKitchenCabinet } from "../kitchen/generator.ts";
import { generateGeneralTall } from "../generalTall/generator.ts";
import { generateLounge } from "../lounge/generator.ts";

function assertBench(name: string, result: {
  boards: Array<{ id: string; category?: string }>;
  joints: Array<{ id?: string; a?: { board?: string; faces?: string[] }; b?: { board?: string; faces?: string[] } }>;
  debug?: { provenance?: { entries?: Record<string, unknown> } };
}, expectRoot?: string | ((id: string) => boolean)) {
  const n = Object.keys(result.debug?.provenance?.entries ?? {}).length;
  assert.ok(n > 0, `${name}: provenance entries`);
  for (const j of result.joints) {
    assert.equal(typeof j.a?.board, "string", `${name} ${j.id} a.board`);
    assert.equal(typeof j.b?.board, "string", `${name} ${j.id} b.board`);
  }
  const { rels, order, plan } = planExplode(result);
  assert.ok(rels.size > 0, `${name}: explode relations`);
  assert.ok([...rels.values()].some(isStrong), `${name}: at least one declared/feature relation`);
  const fronts = result.boards.filter((b) => b.category === "front_panel").map((b) => b.id);
  if (fronts.length) {
    const firstFront = Math.min(...fronts.map((id) => order.indexOf(id)));
    assert.ok(firstFront >= 0, `${name}: fronts in order`);
    assert.ok(order.slice(firstFront).every((id) => fronts.includes(id)), `${name}: fronts last, got ${order.slice(-6).join(",")}`);
  }
  const t4 = plan.get("T4");
  const t5 = plan.get("T5");
  if (t4 && !t4.fixed) assert.equal(t4.axis, "y", `${name}: T4 pulls along Y`);
  if (t5 && !t5.fixed) assert.equal(t5.axis, "y", `${name}: T5 pulls along Y`);
  if (expectRoot) {
    const ok = typeof expectRoot === "function" ? expectRoot(order[0]) : order[0] === expectRoot;
    assert.ok(ok, `${name}: root ${order[0]}`);
  }
}

assertBench("kitchen", generateKitchenCabinet({
  globalSettings: { length: 887, depth: 270, height: 880 },
  materialThickness: 15, frontThickness: 16, frontClearance: 2.5,
  bottomClearanceHeight: 55, bottomClearanceStyle: "style_1", lockEnabled: true,
  columns: [
    { id: "k-col-1", width: 444, zones: [{ id: "c1-door", height: 825, zoneType: "left_door", shelfEnabled: true, shelfHeight: 400, leftSidePanelOptions: { panelType: "door", frontVisible: true, bchNotchEnabled: false, strengtheningStripEnabled: true } }] },
    { id: "k-col-2", width: 443, zones: [{ id: "c2-drawer", height: 300, zoneType: "drawer" }, { id: "c2-door", height: 525, zoneType: "right_door", shelfEnabled: false }] },
  ],
}), "B3");

assertBench("kitchen-style2", generateKitchenCabinet({
  globalSettings: { length: 887, depth: 270, height: 880 },
  materialThickness: 15, frontThickness: 16, frontClearance: 2.5,
  bottomClearanceHeight: 55, bottomClearanceStyle: "style_2", lockEnabled: true,
  columns: [
    { id: "k-col-1", width: 444, zones: [{ id: "c1-door", height: 825, zoneType: "left_door", shelfEnabled: true, shelfHeight: 400 }] },
    { id: "k-col-2", width: 443, zones: [{ id: "c2-drawer", height: 300, zoneType: "drawer" }, { id: "c2-door", height: 525, zoneType: "right_door" }] },
  ],
}), (id) => id === "B3" || id === "B2");

assertBench("generalTall", generateGeneralTall({
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
}), "B3");

assertBench("generalTall-style2", generateGeneralTall({
  cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584,
  panelThickness: 16, frontPanelThickness: 16,
  topSystem: { style: "style_2" },
  bottomSystem: { style: "style_2" },
  zones: [{ id: "open", type: "open_space", height: 1820 }],
}), (id) => id === "BH1" || id === "B3");

assertBench("lounge-L", generateLounge({
  style: "L_SHAPE", height: 420, partitionPanelThickness: 18,
  mainWidth: 2000, mainDepth: 600, lWidth: 1600, lDepth: 800, lPosition: "RIGHT", topLidEnabled: true,
}));

assertBench("lounge-I", generateLounge({
  style: "I_SHAPE", height: 420, partitionPanelThickness: 18, mainWidth: 2000, mainDepth: 600, topLidEnabled: true,
}));

assertBench("lounge-U", generateLounge({
  style: "U_SHAPE", height: 420, partitionPanelThickness: 18, mainWidth: 2000, mainDepth: 1600, lDepth: 600, topLidEnabled: false,
}));

assertBench("lounge-Parallel", generateLounge({
  style: "PARALLEL", height: 420, partitionPanelThickness: 18, totalWidth: 4000, singleLoungeWidth: 1500, depth: 800, topLidEnabled: true,
}));

console.log("bench contract: kitchen / tall / lounge explode + provenance OK");
