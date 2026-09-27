/**
 * Sheet ids: one materialId per nestable sheet. Role is not part of the id.
 */
import assert from "node:assert/strict";
import { generateKitchenCabinet } from "../kitchen/generator.ts";
import { generateGeneralTall } from "../generalTall/generator.ts";
import { attachFaces, type Board } from "./model.ts";
import { decorSlug, sheetMaterial } from "./material.ts";

const board = (extra: Partial<Board>): Board => ({
  id: "X", name: "X", category: "panel", boardType: "panel", materialThickness: 15,
  profilePlane: "XZ", thicknessAxis: "Y", x0: 0, x1: 400, y0: 0, y1: 15, z0: 0, z1: 600,
  ...extra,
});

assert.equal(decorSlug("Gloss White"), "gloss-white");
assert.equal(decorSlug("SuperMatt Forest Green"), "supermatt-forest-green");
assert.equal(decorSlug("Nordic Grey Oak"), "nordic-grey-oak");
assert.equal(decorSlug("White Stipple"), "white-stipple");

{
  const carcass = board({ stock: { kind: "carcass", thickness: 15 } });
  const sheet = sheetMaterial(carcass, { carcassColor: "white_stipple" });
  assert.equal(sheet.materialId, "pvc-white-stipple-2s-15");
  assert.equal(sheet.series, "pvc");
  assert.equal(sheet.surfaceMode, "DOUBLE_SIDED");
  assert.equal(sheet.grained, false);
  assert.equal(sheet.colorName, "White Stipple");

  const partition = board({ materialThickness: 18, stock: { kind: "partition", thickness: 18 } });
  assert.equal(sheetMaterial(partition).materialId, "pvc-white-stipple-2s-18");
}

{
  const door = board({ materialThickness: 16, stock: { kind: "door", thickness: 16, sides: 1 } });
  attachFaces([door]);
  const front = door.faces!.find((f) => f.id === "B")!;
  front.visible = true;
  front.finish = { colour: "Gloss White" };
  door.faces!.find((f) => f.id === "A")!.finish = { colour: "White Stipple" };
  const single = sheetMaterial(door, { doorSeries: "acrylic", doorSides: "single", doorColorName: "Gloss White" });
  assert.equal(single.materialId, "acrylic-gloss-white-1s-16");
  assert.equal(single.surfaceMode, "SINGLE_SIDED");
  assert.equal(single.grained, false);
  assert.equal(single.colorName, "Gloss White");

  door.stock = { kind: "door", thickness: 16, sides: 2 };
  const doubled = sheetMaterial(door, { doorSeries: "acrylic", doorSides: "double", doorColorName: "Gloss White" });
  assert.equal(doubled.materialId, "acrylic-gloss-white-2s-16");
  assert.equal(doubled.surfaceMode, "DOUBLE_SIDED");

  front.finish = { colour: "SuperMatt Forest Green" };
  assert.equal(
    sheetMaterial(door, { doorSeries: "acrylic", doorColorName: "Gloss White" }).materialId,
    "acrylic-supermatt-forest-green-2s-16",
    "the colour face wins over the cabinet colour name",
  );
}

{
  const hpl = board({ materialThickness: 16, stock: { kind: "door", thickness: 16, sides: 1 } });
  attachFaces([hpl]);
  const front = hpl.faces!.find((f) => f.id === "B")!;
  front.visible = true;
  front.finish = { colour: "Chestnut" };
  const chestnut = sheetMaterial(hpl, { doorSeries: "hpl", doorColorName: "Chestnut" });
  assert.equal(chestnut.materialId, "hpl-chestnut-1s-16");
  assert.equal(chestnut.grained, true);

  front.finish = { colour: "Felt Grey" };
  const felt = sheetMaterial(hpl, { doorSeries: "hpl", doorColorName: "Felt Grey" });
  assert.equal(felt.materialId, "hpl-felt-grey-1s-16");
  assert.equal(felt.grained, false);
}

{
  const params = {
    globalSettings: { length: 887, depth: 270, height: 880 },
    materialThickness: 15, frontThickness: 16, bottomClearanceHeight: 70, bottomClearanceStyle: "style_1",
    columns: [{ id: "c1", width: 887, zones: [{ id: "z1", height: 810, zoneType: "left_door" }] }],
    doorSeries: "hpl", doorColorName: "Chestnut", doorSides: "single",
  };
  const k = generateKitchenCabinet(params as never);
  const side = k.boards.find((b) => b.stock?.kind === "carcass")!;
  const door = k.boards.find((b) => b.id === "B1")!;
  assert.equal(sheetMaterial(side, params).materialId, "pvc-white-stipple-2s-15");
  assert.equal(sheetMaterial(door, params).materialId, "hpl-chestnut-1s-16");
  assert.equal(sheetMaterial(door, params).grained, true);
}

{
  const params = {
    cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584,
    panelThickness: 15, frontPanelThickness: 16,
    topSystem: { style: "style_1", frontRailHeight: 40 },
    bottomSystem: { style: "style_1", frontRailHeight: 53 },
    zones: [{ id: "zone-1", type: "side_door", height: 1400 }],
    doorSeries: "acrylic", doorColorName: "Gloss Ash", doorSides: "double",
    leftSidePanelThickness: 16, leftSidePanelFinish: "colour",
  };
  const tall = generateGeneralTall(params as never);
  const side = tall.boards.find((b) => b.id === "SidePanel_L")!;
  assert.equal(side.stock!.kind, "door");
  assert.equal(sheetMaterial(side, params).materialId, "acrylic-gloss-ash-2s-16");
  const carcass = tall.boards.find((b) => b.stock?.kind === "carcass")!;
  assert.equal(sheetMaterial(carcass, params).materialId, "pvc-white-stipple-2s-15");
}
