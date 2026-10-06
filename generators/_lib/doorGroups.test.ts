/**
 * Two door colours. A is the upper group, B the lower. A one-colour job
 * copies A into B, so a board that asks for B still matches A.
 */
import assert from "node:assert/strict";
import { generateBedroom } from "../bedroom/generator.ts";
import { generateBedroomEast } from "../bedroomEast/generator.ts";
import { generateBunkBed } from "../bunkBed/generator.ts";
import { generateLounge } from "../lounge/generator.ts";
import bedroomPresets from "../bedroom/presets.json" with { type: "json" };
import eastPresets from "../bedroomEast/presets.json" with { type: "json" };
import bunkPresets from "../bunkBed/presets.json" with { type: "json" };

const A = "Chestnut";
const B = "Gloss Ash";

const colour = (board: { faces?: Array<{ id: string; finish?: { colour?: string } }> }, face: string) =>
  board.faces?.find((f) => f.id === face)?.finish?.colour;

const bedroom = bedroomPresets.presets.find((p) => p.id === "style3")!;
const east = eastPresets.presets.find((p) => p.id === "bedroom1")!;
const bunk = bunkPresets.presets.find((p) => p.id === "21-bunk")!;

{
  const r = generateBedroom({ ...bedroom.params, doorColorName: A, doorColorNameB: B } as never);
  const t1 = r.boards.find((b) => b.id === "T1")!;
  assert.equal(t1.stock?.kind, "door");
  assert.equal(colour(t1, "B"), A, "north-south T1 is colour A");
  const door = r.boards.find((b) => b.id === "WARD_L_DOOR")!;
  assert.equal(colour(door, "B"), A);
}

{
  const r = generateBedroomEast({ ...east.params, doorColorName: A, doorColorNameB: B } as never);
  const face = (id: string, f: string) => colour(r.boards.find((b) => b.id === id)!, f);
  assert.equal(face("T1", "B"), A);
  assert.equal(face("WARD_PANEL", "A"), A);
  assert.equal(face("WARD_DOOR", "B"), A);
  assert.equal(face("OHC_FP0", "B"), A);
  assert.equal(face("BS_SHOW", "A"), B, "east bedside skin is colour B");
  assert.equal(face("BS_FRONT_HI", "B"), B);
  assert.equal(face("BS_FRONT_LO", "B"), B);
}

{
  const one = generateBedroomEast(east.params as never);
  const show = one.boards.find((b) => b.id === "BS_SHOW")!;
  assert.equal(colour(show, "A"), "Gloss White", "one colour: bedside uses the same name");
}

{
  const r = generateBunkBed({ ...bunk.params, doorColorName: A, doorColorNameB: B } as never);
  const face = (id: string) => {
    const b = r.boards.find((q) => q.id === id)!;
    return b.faces?.find((f) => f.visible && f.finish?.colour)?.finish?.colour;
  };
  assert.equal(face("END_UPPER"), A);
  assert.equal(face("END_LOWER"), B);
  assert.equal(face("BOOT_DOOR"), B);
}

{
  const seat = generateLounge({
    style: "L_SHAPE", height: 420, partitionPanelThickness: 18, mainWidth: 2087, mainDepth: 560,
    lWidth: 960, lDepth: 560, lPosition: "RIGHT", doorColorName: B,
  });
  const front = seat.boards.find((b) => b.id === "main_front")!;
  assert.equal(front.stock?.kind, "partition", "the seat front stays carcass");
  const drawer = generateLounge({
    style: "L_SHAPE", height: 420, partitionPanelThickness: 18, frontPanelThickness: 16,
    mainWidth: 2087, mainDepth: 560, lWidth: 960, lDepth: 560, lPosition: "RIGHT",
    lFrontAccess: "DRAWER", doorColorName: B,
  });
  const leaf = drawer.boards.find((b) => b.id === "l_drawer_front")!;
  assert.equal(leaf.stock?.kind, "door");
  assert.equal(colour(leaf, "B"), B);
}

console.log("door groups ok");
