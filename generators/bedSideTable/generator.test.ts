import assert from "node:assert/strict";
import { generateBedSideTable, mirrorZoneType, shelfLimits, RULES } from "./generator.ts";
import { checkPins, countPins, type PresetsFile } from "../_lib/pins.ts";
import presetsRaw from "./presets.json" with { type: "json" };

const presets = presetsRaw as PresetsFile;

/** Style 3 left bedside: wardrobe 330 wide, 200 deep, top at the fixed panel's underside 595, middle shelf 387.5–402.5. */
function table(side: "left" | "right" = "left", patch: Record<string, unknown> = {}) {
  return generateBedSideTable({
    width: 330, depth: 200, height: 595, side, shelfCenter: 395, clearance: 2.5, ...patch,
  });
}

function testPresetsPinned() {
  for (const preset of presets.presets) {
    const result = generateBedSideTable(preset.params as never);
    assert.deepEqual(result.validation.errors, [], preset.id);
    assert.ok(countPins(preset.pins) > 0);
    const bad = checkPins(result, preset.pins);
    assert.deepEqual(bad, [], bad.map((m) => `${m.path} expected ${m.expected} got ${m.actual}`).join("; "));
  }
}

const by = (r: ReturnType<typeof table>, id: string) => r.boards.find((b) => b.id === id)!;
const xy = (b: { profileVector?: unknown[] }) => (b.profileVector as Array<{ x: number; y: number }>).map((q) => [q.x, q.y]);
const yz = (b: { profileVector?: unknown[] }) => (b.profileVector as Array<{ y: number; z: number }>).map((q) => [q.y, q.z]);

/** Model (left table, x from the bed side): show 0–16, bed side 16–31, wall side 315–330 — mirrored from the wall it is 314–330 / 299–314 / 0–15. */
function testCarcassMatchesTheModel() {
  const L = table("left");
  const R = table("right");
  assert.deepEqual(L.validation.errors, []);
  assert.deepEqual([by(L, "SHOW").x0, by(L, "SHOW").x1], [0, 16]);
  assert.deepEqual([by(L, "SIDE_BED").x0, by(L, "SIDE_BED").x1], [16, 31]);
  assert.deepEqual([by(L, "SIDE_WALL").x0, by(L, "SIDE_WALL").x1], [315, 330]);
  assert.deepEqual([by(R, "SIDE_WALL").x0, by(R, "SIDE_WALL").x1], [0, 15]);
  assert.deepEqual([by(R, "SIDE_BED").x0, by(R, "SIDE_BED").x1], [299, 314]);
  assert.deepEqual([by(R, "SHOW").x0, by(R, "SHOW").x1], [314, 330]);
  assert.equal(by(L, "SHOW").stock!.kind, "door");
  assert.equal(by(L, "SHOW").materialThickness, 16);
  assert.equal(by(L, "SIDE_BED").stock!.kind, "carcass");
  assert.deepEqual([by(L, "SHELF_BOT").z0, by(L, "SHELF_BOT").z1], [0, 15]);
  assert.deepEqual([by(L, "SHELF_MID").z0, by(L, "SHELF_MID").z1], [387.5, 402.5]);
  assert.deepEqual([by(L, "SHELF_TOP").z0, by(L, "SHELF_TOP").z1], [580, 595]);
}

/** Shelves: body between the sides, a through tongue to each side's outer face over the middle third of the depth. */
function testShelfTonguesGoThrough() {
  const R = table("right");
  const mid = by(R, "SHELF_MID");
  assert.deepEqual([mid.x0, mid.x1], [0, 314]);
  assert.deepEqual(xy(mid), [
    [15, 0], [299, 0], [299, 66.7], [314, 66.7], [314, 133.3], [299, 133.3],
    [299, 200], [15, 200], [15, 133.3], [0, 133.3], [0, 66.7], [15, 66.7],
  ]);
  const tongues = mid.faces!.filter((f) => f.features.some((ft) => ft.kind === "tongue"));
  assert.equal(tongues.length, 6, "three edges per tongue");
}

/** Sides: a through slot per shelf, 5 past the tongue each end, 1 taller than the shelf. Top / bottom are outline notches. */
function testSideSlots() {
  const R = table("right");
  const wall = by(R, "SIDE_WALL");
  assert.deepEqual(yz(wall), [
    [0, 0], [61.7, 0], [61.7, 16], [138.3, 16], [138.3, 0], [200, 0],
    [200, 595], [138.3, 595], [138.3, 579], [61.7, 579], [61.7, 595], [0, 595],
  ]);
  const hole = wall.faces!.find((f) => f.id === "A")!.features.find((f) => f.id === "SLOT_SHELF_MID")!;
  assert.equal(hole.kind, "cutout");
  assert.equal(hole.through, true);
  assert.deepEqual([hole.u0, hole.u1, hole.v0, hole.v1], [61.7, 138.3, 387, 403]);
  const notched = wall.faces!.filter((f) => f.features.some((ft) => ft.kind === "notch"));
  assert.equal(notched.length, 6, "three edges per notch");
  const bed = by(R, "SIDE_BED");
  assert.ok(bed.faces!.find((f) => f.id === "B")!.features.some((f) => f.id === "SLOT_SHELF_MID"), "bed side slot is on its inner face");
  assert.equal(R.joints.length, 6);
}

/** Fronts cover the whole table with one side clearance everywhere. */
function testFrontsCover() {
  const L = table("left");
  assert.equal(L.params.zones[0]!.type, "left_door");
  assert.equal(L.params.zones[1]!.type, "drawer");
  const lo = by(L, "FRONT_LO");
  const hi = by(L, "FRONT_HI");
  assert.deepEqual([lo.x0, lo.x1, lo.y0, lo.y1, lo.z0, lo.z1], [2.5, 327.5, -16, 0, 2.5, 393.8]);
  assert.deepEqual([hi.x0, hi.x1, hi.z0, hi.z1], [2.5, 327.5, 396.3, 592.5]);
  assert.equal(round1(hi.z0 - lo.z1), 2.5);
  assert.equal(lo.faces!.find((f) => f.id === "A")!.features.filter((f) => f.for === "hinge").length, 2);
  assert.equal(hi.faces!.find((f) => f.id === "A")!.features.filter((f) => f.for === "hinge").length, 0);
  const three = table("left", { clearance: 3 });
  assert.deepEqual([by(three, "FRONT_LO").z0, by(three, "FRONT_LO").x0, by(three, "FRONT_HI").z1], [3, 3, 592]);
}

function testProvenance() {
  const L = table("left");
  for (const b of L.boards) {
    for (const f of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) {
      const e = L.debug.provenance.entries[`${b.id}.${f}`];
      assert.ok(e, `${b.id}.${f}`);
      assert.equal(round1(e.value), b[f], `${b.id}.${f}`);
    }
  }
  assert.ok(L.debug.provenance.entries["SIDE_BED.pv[2].z"]);
  assert.ok(L.debug.provenance.entries["SHELF_MID.pv[3].x"]);
}

function testShelfClamps() {
  const lim = shelfLimits({ height: 595, clearance: 2.5, panelThickness: 15 });
  const low = table("left", { shelfCenter: 0 });
  assert.equal(low.params.shelfCenter, lim.min);
  assert.equal(mirrorZoneType("left_door"), "right_door");
  assert.equal(RULES.ROUTER_DIAMETER_MM.value, 10);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

const tests = [testCarcassMatchesTheModel, testShelfTonguesGoThrough, testSideSlots, testFrontsCover, testProvenance, testShelfClamps];
for (const t of tests) {
  t();
  console.log("ok", t.name);
}
if (presets.presets.length) {
  testPresetsPinned();
  console.log("ok testPresetsPinned");
}
console.log("bedside table: tests passed");
