/**
 * Wood grain: defaults per module, the stored choice, `finish.grain` on the
 * colour faces, and the HPL sheet limit (1180 across the grain).
 */
import assert from "node:assert/strict";
import { generateGeneralTall } from "../generalTall/generator.ts";
import { generateKitchenCabinet } from "../kitchen/generator.ts";
import { generateBedroom } from "../bedroom/generator.ts";
import { SHEET_CROSS_MAX_MM } from "./grain.ts";

const colourFace = (b: { faces?: Array<{ id: string; visible?: boolean; finish?: { colour?: string; grain?: string } }> }) =>
  (b.faces ?? []).find((f) => (f.id === "A" || f.id === "B") && f.visible === true && f.finish?.colour && f.finish.colour !== "White Stipple");

/* ---- tall: one door 1400 high ---- */
const tallParams = (extra: Record<string, unknown> = {}) => ({
  cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584,
  panelThickness: 15, frontPanelThickness: 16,
  topSystem: { style: "style_1", frontRailHeight: 40 },
  bottomSystem: { style: "style_1", frontRailHeight: 53 },
  zones: [{ id: "zone-1", type: "side_door", height: 1400 }, { id: "zone-2", type: "drawer", height: 445 }],
  doorColorName: "Urban Walnut",
  ...extra,
});

{
  const acrylic = generateGeneralTall(tallParams({ doorSeries: "acrylic", doorColorName: "Gloss White" }) as never);
  assert.equal(acrylic.grain!.checked, false, "acrylic is not checked");
  assert.equal(acrylic.grain!.issues.length, 0, "acrylic: no sheet issue");

  const hpl = generateGeneralTall(tallParams({ doorSeries: "hpl" }) as never);
  assert.equal(hpl.grain!.groups.front, "horizontal", "tall fronts default horizontal");
  const door = hpl.boards.find((b) => b.id === "FP_zone-1")!;
  assert.equal(colourFace(door)!.finish!.grain, "u", "horizontal = along the door's width");
  assert.ok(door.z1 - door.z0 > SHEET_CROSS_MAX_MM, "the test door is over the limit");
  const issue = hpl.grain!.issues.find((i) => i.board === "FP_zone-1")!;
  assert.ok(issue, "tall door over 1180 high with horizontal grain is an issue");
  assert.equal(issue.side, "across");
  assert.equal(issue.limit, 1180);
  assert.equal(hpl.validation.errors.length, 0, "a grain issue is not a validation error");

  const vertical = generateGeneralTall(tallParams({ doorSeries: "hpl", grain: { front: "vertical" } }) as never);
  assert.equal(colourFace(vertical.boards.find((b) => b.id === "FP_zone-1")!)!.finish!.grain, "v");
  assert.equal(vertical.grain!.issues.filter((i) => i.board === "FP_zone-1").length, 0, "vertical grain fits");
}

/* ---- tall side panels: carcass by default, colour panel on request (door stock, vertical grain) ---- */
{
  const carcass = generateGeneralTall(tallParams({ doorSeries: "hpl", leftSidePanelThickness: 15 }) as never);
  const sideC = carcass.boards.find((b) => b.id === "SidePanel_L")!;
  assert.equal(sideC.stock!.kind, "carcass");
  assert.equal(colourFace(sideC), undefined, "a carcass side has no colour face");
  assert.ok(!carcass.grain!.present.includes("side"));

  const colour = generateGeneralTall(tallParams({ doorSeries: "hpl", leftSidePanelThickness: 16, leftSidePanelFinish: "colour" }) as never);
  assert.equal(colour.validation.errors.length, 0, colour.validation.errors.join("; "));
  const side = colour.boards.find((b) => b.id === "SidePanel_L")!;
  assert.equal(side.stock!.kind, "door");
  assert.equal(side.faces!.find((f) => f.id === "B")!.finish!.colour, "Urban Walnut", "left side: outside face B");
  assert.equal(colour.grain!.groups.side, "vertical", "side panels default vertical");
  assert.equal(colourFace(side)!.finish!.grain, "v", "vertical on a YZ board = along z");
  assert.ok(colour.grain!.present.includes("side"));
}

/* ---- kitchen: fronts and the kick horizontal ---- */
{
  const k = generateKitchenCabinet({
    globalSettings: { length: 887, depth: 270, height: 880 },
    materialThickness: 15, frontThickness: 16, bottomClearanceHeight: 70, bottomClearanceStyle: "style_1",
    columns: [{ id: "c1", width: 887, zones: [{ id: "z1", height: 810, zoneType: "left_door" }] }],
    doorSeries: "hpl", doorColorName: "Chestnut",
  } as never);
  assert.equal(k.grain!.groups.front, "horizontal");
  const b1 = k.boards.find((b) => b.id === "B1")!;
  assert.equal(colourFace(b1)!.finish!.grain, "u", "the kick is a front");
  assert.equal(k.grain!.issues.length, 0);
}

/* ---- bedroom: doors horizontal fit; colour panels (1375 high) default vertical ---- */
{
  const body = generateBedroom({
    width: 2275, depth: 756, height: 1788,
    roofProfile: [[0, 1788], [177, 1749], [756, 1150]],
    bootHeight: 398, wardrobeWidth: 330, ohcBottom: 1418,
    doorSeries: "hpl", doorColorName: "Bleached Oak",
  });
  assert.equal(body.grain!.groups.front, "horizontal");
  assert.equal(body.grain!.groups.side, "vertical");
  assert.equal(body.grain!.issues.length, 0, body.grain!.issues.map((i) => i.message).join("; "));
  const across = generateBedroom({
    width: 2275, depth: 756, height: 1788,
    roofProfile: [[0, 1788], [177, 1749], [756, 1150]],
    bootHeight: 398, wardrobeWidth: 330, ohcBottom: 1418,
    doorSeries: "hpl", doorColorName: "Bleached Oak", grain: { side: "horizontal" },
  });
  assert.ok(across.grain!.issues.some((i) => i.board === "WARD_L_PANEL" && i.side === "across"), "a horizontal colour panel is refused");
}

/* ---- door sides: single (default) = back is the carcass colour; double = colour and grain on both ---- */
{
  const single = generateGeneralTall(tallParams({ doorSeries: "hpl" }) as never);
  const d1 = single.boards.find((b) => b.id === "FP_zone-1")!;
  const back1 = d1.faces!.find((f) => f.id === "A")!;
  assert.equal(back1.finish!.colour, "White Stipple", "single-sided: back is the carcass colour");
  assert.equal(back1.finish!.grain, undefined, "single-sided back has no grain");
  assert.equal(d1.stock!.sides, 1);

  const double = generateGeneralTall(tallParams({ doorSeries: "hpl", doorSides: "double" }) as never);
  const d2 = double.boards.find((b) => b.id === "FP_zone-1")!;
  const back2 = d2.faces!.find((f) => f.id === "A")!;
  assert.equal(back2.finish!.colour, "Urban Walnut", "double-sided: back carries the colour");
  assert.equal(back2.finish!.grain, "u", "double-sided back has the same grain");
  assert.equal(d2.stock!.sides, 2);

  const carcass = double.boards.find((b) => b.id === "V1")!;
  assert.equal(carcass.stock!.sides, undefined, "carcass stock is not door-sided");
}

console.log("grain: defaults, stored choice, face grain, HPL sheet limit, door sides OK");
