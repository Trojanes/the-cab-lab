/**
 * Milling face (the CNC cuts from above only) and the kitchen V-panel rules
 * that keep every board machinable in one setup.
 */
import assert from "node:assert/strict";
import { generateKitchenCabinet, screwPositions } from "../kitchen/generator.ts";
import { generateGeneralTall } from "../generalTall/generator.ts";
import { generateBedroom } from "../bedroom/generator.ts";
import { generateOverheadCabinet } from "../overheadCabinet/generator.ts";
import { applyMilling } from "./milling.ts";
import { attachFaces, addFeature, type Board } from "./model.ts";

/* ---- screw positions: 100 from each end, the span split at ≤ 150, symmetric; < 200 → one in the middle ---- */
assert.deepEqual(screwPositions(0, 650), [100, 250, 400, 550]);
assert.deepEqual(screwPositions(0, 500), [100, 250, 400]);
assert.deepEqual(screwPositions(0, 600), [100, 233.333, 366.667, 500]);
assert.deepEqual(screwPositions(0, 254), [100, 154]);
assert.deepEqual(screwPositions(0, 150), [75]);

/* ---- one face per board: partial-depth work on one face only; through work listed on it ---- */
const rect = (id: string, extra: Partial<Board> = {}): Board => ({
  id, name: id, category: "panel", boardType: "panel", materialThickness: 15,
  profilePlane: "XZ", thicknessAxis: "Y", x0: 0, x1: 400, y0: 0, y1: 15, z0: 0, z1: 600, ...extra,
});
{
  const both = rect("BOTH");
  const clean = rect("CLEAN");
  const door = rect("DOOR", { stock: { kind: "door", thickness: 16, sides: 1 } });
  attachFaces([both, clean, door]);
  addFeature(both, "A", { id: "g1", kind: "groove", u0: 0, u1: 10, v0: 0, v1: 10, depth: 5 });
  addFeature(both, "B", { id: "g2", kind: "groove", u0: 0, u1: 10, v0: 50, v1: 60, depth: 5 });
  addFeature(clean, "B", { id: "h1", kind: "hole", center: [50, 50], diameter: 3, through: true });
  door.faces!.find((f) => f.id === "B")!.visible = true;
  door.faces!.find((f) => f.id === "B")!.finish = { colour: "Gloss White" };
  addFeature(door, "B", { id: "cup", kind: "hole", center: [22, 100], diameter: 35, depth: 12 });
  const m = applyMilling([both, clean, door]);
  assert.deepEqual(m.issues.map((i) => [i.board, i.reason]), [["BOTH", "both-faces"], ["DOOR", "colour-face"]]);
  assert.equal(clean.milling, "B", "a board with only a through hole keeps the face it is listed on");
}

/* ---- kitchen: left door zone with a mid shelf, right drawer over a door zone ---- */
const kitchen = (right: unknown[], leftShelf = 400) => generateKitchenCabinet({
  globalSettings: { length: 900, depth: 560, height: 880 }, materialThickness: 15, frontThickness: 16,
  bottomClearanceHeight: 70, bottomClearanceStyle: "style_1",
  columns: [
    { id: "L", width: 450, zones: [{ id: "L1", height: 810, zoneType: "left_door", shelfEnabled: true, shelfHeight: leftShelf }] },
    { id: "R", width: 450, zones: right },
  ],
} as never);

{
  // Right: one drawer over a door zone. V1 would carry half slots on both faces
  // (the left shelf faces the right door zone, the drawer divider faces the left door zone).
  const r = kitchen([{ id: "R1", height: 200, zoneType: "drawer" }, { id: "R2", height: 610, zoneType: "right_door" }]);
  assert.deepEqual(r.validation.errors, [], "no unresolved conflict");
  const v1 = r.slots.filter((s) => s.vPanelId === "V1");
  const halves = new Set(v1.filter((s) => !s.through).map((s) => s.side));
  assert.ok(halves.size <= 1, "V1: half slots on one face only");
  // The left door zone (810 high) outweighs the drawer (200): the drawer divider is screwed.
  assert.ok(r.screws.some((s) => s.vPanelId === "V1" && s.forBoard === "R-R1-bottom"), "drawer divider screwed through V1");
  assert.equal(v1.some((s) => s.forBoard === "R-R1-bottom"), false);
  // The divider is 150 deep (< 200): one screw in the middle of its depth, at its mid-thickness.
  const sc = r.screws.filter((s) => s.forBoard === "R-R1-bottom");
  const div = r.boards.find((b) => b.id === "R-R1-bottom")!;
  assert.deepEqual(sc.map((s) => [s.y, s.z]), [[75, (div.z0 + div.z1) / 2]]);
  assert.equal(r.milling!.issues.length, 0, "every board machinable in one setup");
  const V1 = r.boards.find((b) => b.id === "V1")!;
  const onFace = V1.faces!.find((f) => f.id === V1.milling)!.features;
  assert.ok(onFace.some((f) => f.id === sc[0].id), "the screw hole is listed on V1's milling face");
}

{
  // Both sides drawers: the other face is never a visible zone, so every slot is through.
  const r = generateKitchenCabinet({
    globalSettings: { length: 900, depth: 560, height: 880 }, materialThickness: 15, frontThickness: 16,
    bottomClearanceHeight: 70, bottomClearanceStyle: "style_1",
    columns: [
      { id: "L", width: 450, zones: [{ id: "L1", height: 300, zoneType: "drawer" }, { id: "L2", height: 510, zoneType: "drawer" }] },
      { id: "R", width: 450, zones: [{ id: "R1", height: 310, zoneType: "drawer" }, { id: "R2", height: 500, zoneType: "drawer" }] },
    ],
  } as never);
  const v1 = r.slots.filter((s) => s.vPanelId === "V1");
  assert.ok(v1.every((s) => s.through), "drawer beside drawer: through slots");
  // The two dividers sit 10 mm apart (580 / 570): closer than 20 → the smaller zone's divider is screwed.
  assert.equal(v1.length, 1, "one of the two close slots is dropped");
  assert.ok(r.screws.some((s) => s.vPanelId === "V1"));
  assert.equal(r.milling!.issues.length, 0);
}

{
  // A preference chosen for the V still wins over the automatic rule.
  const r = generateKitchenCabinet({
    globalSettings: { length: 900, depth: 560, height: 880 }, materialThickness: 15, frontThickness: 16,
    bottomClearanceHeight: 70, bottomClearanceStyle: "style_1",
    columns: [
      { id: "L", width: 450, zones: [{ id: "L1", height: 810, zoneType: "left_door", shelfEnabled: true, shelfHeight: 400 }] },
      { id: "R", width: 450, zones: [{ id: "R1", height: 200, zoneType: "drawer" }, { id: "R2", height: 610, zoneType: "right_door" }] },
    ],
    vPanelMachiningPreferences: [{ vPanelIndex: 1, mode: "through_only" }],
  } as never);
  assert.ok(r.slots.filter((s) => s.vPanelId === "V1").every((s) => s.through));
  assert.equal(r.screws.length, 0);
}

/* ---- every module's presets: no board needs a second setup; door work on the back ---- */
for (const [name, r] of [
  ["tall", generateGeneralTall({ cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584, topSystem: { style: "style_1", frontRailHeight: 40 }, bottomSystem: { style: "style_1", frontRailHeight: 53 }, zones: [{ id: "zone-1", type: "side_door", height: 600 }, { id: "zone-2", type: "drawer", height: 300 }, { id: "zone-3", type: "double_door", height: 945, verticalDivider: true }] } as never)],
  ["bedroom", generateBedroom({ width: 2275, depth: 756, height: 1788, roofProfile: [[0, 1788], [177, 1749], [756, 1150]], bootHeight: 398, wardrobeWidth: 330, ohcBottom: 1418 })],
  ["ohc", generateOverheadCabinet({ cabinetWidth: 2000, cabinetDepth: 400, cabinetHeight: 400, zones: [{ type: "up_flap", width: 1000 }, { type: "up_flap", width: 1000 }] } as never)],
] as const) {
  assert.deepEqual((r as { milling?: { issues: unknown[] } }).milling!.issues, [], `${name}: milling issues`);
  for (const b of (r as { boards: Board[] }).boards) {
    assert.ok(b.milling === "A" || b.milling === "B", `${name} ${b.id}: milling face`);
    if (b.stock?.kind === "door" && b.stock.sides === 1) {
      const colour = b.faces!.find((f) => f.visible === true && f.finish?.colour && !/stipple/i.test(f.finish.colour));
      if (colour) assert.notEqual(b.milling, colour.id, `${name} ${b.id}: milled from the back`);
    }
  }
}

console.log("milling: one face per board, kitchen V-panel rules, screws OK");
