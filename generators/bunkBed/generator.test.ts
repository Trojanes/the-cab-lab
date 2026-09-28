import assert from "node:assert/strict";
import { generateBunkBed, bunkUpperLimits, bunkMinSize, RULES } from "./generator.ts";
import { checkPins, countPins, type PresetsFile } from "../_lib/pins.ts";
import presetsRaw from "./presets.json" with { type: "json" };

const presets = presetsRaw as PresetsFile;
const bunk21 = presets.presets.find((p) => p.id === "21-bunk")!;
const gen = (patch: Record<string, unknown> = {}) => generateBunkBed({ ...(bunk21.params as object), ...patch } as never);
const zone = (r: ReturnType<typeof gen>, id: string) => r.zones.find((z) => z.id === id)!;
const fp = (r: ReturnType<typeof gen>) => r.boards.filter((b) => b.role === "front_partition");
const board = (r: ReturnType<typeof gen>, id: string) => r.boards.find((b) => b.id === id)!;
const box6 = (b: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number }) => [b.x0, b.x1, b.y0, b.y1, b.z0, b.z1];
/** Through cutouts wherever milling listed them (face A, or B when A carries the colour). */
const cutouts = (b: ReturnType<typeof board>) => b.faces!.filter((f) => f.id === "A" || f.id === "B").flatMap((f) => f.features.filter((x) => x.kind === "cutout"));

function testPresetsPinned() {
  for (const preset of presets.presets) {
    const r = generateBunkBed(preset.params as never);
    assert.deepEqual(r.validation.errors, [], preset.id);
    assert.ok(countPins(preset.pins) > 0, preset.id);
    const bad = checkPins(r as never, preset.pins);
    assert.deepEqual(bad, [], `${preset.id}: ${bad.map((m) => `${m.path} expected ${m.expected} got ${m.actual}`).join("; ")}`);
  }
}

/** 21 Bunk: boot 400, deck 18, both bunks 759.5 clear, mattress 730. */
function testStack21Bunk() {
  const r = gen();
  assert.equal(zone(r, "boot").z1, 400);
  assert.deepEqual([zone(r, "deck").z0, zone(r, "deck").z1], [400, 418]);
  assert.deepEqual([zone(r, "upperBase").z0, zone(r, "upperBase").z1], [1177.5, 1201.5]);
  assert.equal(r.layout.lowerClear, 759.5);
  assert.equal(r.layout.upperClear, 759.5);
  assert.equal(r.layout.mattressWidth, 730);
  // The regions stand behind the front partition (y 0 → 18).
  for (const z of r.zones) assert.deepEqual([z.x0, z.x1, z.y0, z.y1], [0, 2275, 18, 748], z.id);
}

/** 21 Bunk front partition: two sheets cut at 1140, openings and ladder holes where the STEP has them. */
function testFrontPartition21Bunk() {
  const r = gen();
  assert.deepEqual(fp(r).map((b) => b.id), ["FP_1", "FP_2"]);
  const [left, right] = fp(r);
  assert.deepEqual([left!.x0, left!.x1, left!.y0, left!.y1, left!.z0, left!.z1], [0, 1140, 0, 18, 2, 1961]);
  assert.deepEqual([right!.x0, right!.x1, right!.z0, right!.z1], [1140, 2275, 2, 1961]);
  const p = r.layout.partition;
  assert.equal(p.cut, 1140);
  assert.deepEqual(p.lowerOpening, { x0: 600, x1: 1325, z0: 548, z1: 1147.5 });
  assert.deepEqual(p.upperOpening, { x0: 600, x1: 1675, z0: 1326.5 });
  assert.deepEqual(p.ladder, { x0: 1405, x1: 1655, h: 166.5 });
  assert.deepEqual(p.bootAccess, { x0: 925, x1: 1360.5, z1: 400 });
  const holes = (b: typeof left) => b!.faces!.find((f) => f.id === "A")!.features.filter((f) => f.kind === "cutout");
  assert.equal(holes(left).length, 0, "the lower opening is split by the cut: a notch in each piece, not a hole");
  // STEP Component6: ladder holes u 265 → 515 from the cut; v measured from the board bottom (z 2).
  assert.deepEqual(holes(right).map((h) => [h.u0, h.u1, h.v0, h.v1]), [[265, 515, 546, 712.5], [265, 515, 762.5, 929], [265, 515, 979, 1145.5]]);
  for (const b of fp(r)) {
    assert.equal(b.stock!.kind, "partition");
    assert.equal(b.materialThickness, 18);
    assert.ok(b.x1 - b.x0 <= RULES.SHEET_SHORT_MM.value && b.z1 - b.z0 <= RULES.SHEET_LONG_MM.value, `${b.id} fits the sheet`);
    for (const pt of b.profileVector!) assert.ok(pt.z! >= 2 - 1e-6 && pt.z! <= 1961 + 1e-6, `${b.id} stays between the clearances`);
  }
  const cutJoint = r.joints.find((j) => j.id === "FP_1_FP_2_cut")!;
  assert.equal(cutJoint.kind, "butt");
}

/** 21 Bunk boards behind the partition, the boot door and the sill: positions from the STEP (local x = STEP y, local y = 748 − STEP x). */
function testInteriorBoards21Bunk() {
  const r = gen();
  assert.deepEqual(r.boards.map((b) => b.id), ["FP_1", "FP_2", "BOOT_BACK", "BOOT_SIDE_L", "BOOT_SIDE_R", "DECK", "UPPER_BASE", "LEDGER_FRONT_L", "LEDGER_FRONT_R", "LEDGER_BACK", "END_LOWER", "END_UPPER", "BOOT_DOOR", "SILL"]);
  // Component1 / Component3: carcass 15, 400 high, the inner sides either side of the access.
  assert.deepEqual(box6(board(r, "BOOT_BACK")), [0, 2275, 733, 748, 0, 400]);
  assert.deepEqual(box6(board(r, "BOOT_SIDE_L")), [0, 925, 18, 33, 0, 400]);
  assert.deepEqual(box6(board(r, "BOOT_SIDE_R")), [1360.5, 2275, 18, 33, 0, 400]);
  // Component4 / Component5: 730 deep from the partition's back face; 18 and 24.
  assert.deepEqual(box6(board(r, "DECK")), [0, 2275, 18, 748, 400, 418]);
  assert.deepEqual(box6(board(r, "UPPER_BASE")), [0, 2275, 18, 748, 1177.5, 1201.5]);
  // Component8 / Component7: door stock at STEP y 1975 → 1991, hand hole 80 → 650 × 429.5 → 679.5, colour toward the bunk (−X = B).
  for (const [id, z0, z1] of [["END_LOWER", 418, 1177.5], ["END_UPPER", 1201.5, 1961]] as const) {
    const b = board(r, id);
    assert.deepEqual(box6(b), [1975, 1991, 18, 748, z0, z1]);
    assert.equal(b.stock!.kind, "door");
    assert.deepEqual(cutouts(b).map((h) => [h.u0, h.u1, h.v0, h.v1]), [[80, 650, 429.5, 679.5]]);
    assert.equal(b.faces!.find((f) => f.id === "B")!.finish!.colour, "Metallic White");
  }
  // Component545: a down flap, 455.5 × 405 on the room face, 3.5 off the floor. Catch: the STEP slot (straight 39 + ends 16 = 55 × 16),
  // centre 30.75 under the deck underside. Hinges: two Ø35 × 12 cups on the inside face, 22.5 up, 100 from each side.
  const door = board(r, "BOOT_DOOR");
  assert.deepEqual(box6(door), [915, 1370.5, -16, 0, 3.5, 408.5]);
  const lock = cutouts(door).find((h) => h.for === "lock")!;
  assert.deepEqual([lock.u0, lock.u1, lock.v0, lock.v1, lock.radius], [200.25, 255.25, 357.75, 373.75, 8]);
  const cups = door.faces!.find((f) => f.id === "A")!.features.filter((f) => f.for === "hinge");
  assert.deepEqual(cups.map((c) => [...c.center!, c.diameter, c.depth]), [[100, 22.5, 35, 12], [355.5, 22.5, 35, 12]]);
  assert.ok(door.z0 + 22.5 > board(r, "SILL").z1, "the cups sit above the sill the hinge plates fix to");
  assert.equal(r.joints.find((j) => j.id === "BOOT_DOOR_hinge_SILL")!.kind, "hinge");
  assert.equal(door.faces!.find((f) => f.id === "B")!.finish!.colour, "Metallic White");
  // Strips under the upper base: 18 on edge, 100 high, top at the underside; rear wall to wall, front from each wall to the first opening.
  assert.deepEqual(box6(board(r, "LEDGER_BACK")), [0, 2275, 730, 748, 1077.5, 1177.5]);
  assert.deepEqual(box6(board(r, "LEDGER_FRONT_L")), [0, 600, 18, 36, 1077.5, 1177.5]);
  assert.deepEqual(box6(board(r, "LEDGER_FRONT_R")), [1655, 2275, 18, 36, 1077.5, 1177.5]);
  // The lower end panel lets the rear strip and the ladder-side front strip through notches 18 × 100 in its top corners.
  assert.deepEqual(board(r, "END_LOWER").profileVector!.map((p) => [p.y, p.z]), [[18, 418], [748, 418], [748, 1077.5], [730, 1077.5], [730, 1177.5], [36, 1177.5], [36, 1077.5], [18, 1077.5], [18, 418]]);
  assert.ok(r.joints.some((j) => j.id === "END_LOWER_LEDGER_BACK_notch") && r.joints.some((j) => j.id === "END_LOWER_LEDGER_FRONT_R_notch"));
  assert.equal(board(r, "END_UPPER").profileVector, undefined, "the upper end panel has no strips to pass");
  // Component539: 18 on the floor, tongue 925 → 1360 through partition + inner side (y 0 → 33), body 870 → 1415 × 45, Ø11 reliefs.
  const sill = board(r, "SILL");
  assert.deepEqual(box6(sill), [870, 1415, 0, 78, 0, 18]);
  const pv = sill.profileVector!;
  assert.ok(pv.some((p) => p.x === 925 && p.y === 0) && pv.some((p) => p.x === 1360 && p.y === 0), "tongue corners");
  assert.ok(pv.some((p) => Math.abs(p.x! - 919.5) < 1e-6 && Math.abs(p.y! - 38.5) < 1e-6), "left relief reaches 5.5 into the body");
  assert.ok(pv.some((p) => Math.abs(p.x! - 1365.5) < 1e-6 && Math.abs(p.y! - 38.5) < 1e-6), "right relief reaches 5.5 into the body");
  // Stocks copied from the setup.
  const kinds = Object.fromEntries(r.boards.map((b) => [b.id, `${b.stock!.kind} ${b.materialThickness}`]));
  assert.deepEqual([kinds.BOOT_BACK, kinds.DECK, kinds.UPPER_BASE, kinds.END_LOWER, kinds.BOOT_DOOR, kinds.SILL], ["carcass 15", "partition 18", "partition 24", "door 16", "door 16", "partition 18"]);
  // Regions made of boards are drawn as those boards.
  assert.deepEqual(zone(r, "boot").boards, ["BOOT_BACK", "BOOT_SIDE_L", "BOOT_SIDE_R", "SILL"]);
  assert.deepEqual(zone(r, "deck").boards, ["DECK"]);
  assert.deepEqual(r.layout.bootDoor, { x0: 915, x1: 1370.5, y0: -16, y1: 0, z0: 3.5, z1: 408.5 });
  assert.deepEqual(r.milling.issues, []);
}

/**
 * No two boards overlap. The only box overlaps: the sill's tongue in the partition's notch and between the inner sides,
 * and the strips through the lower end panel's notches — the outlines keep them apart.
 */
function testNoOverlap() {
  for (const side of ["RIGHT", "LEFT"]) {
    const r = gen({ endSide: side });
    const ov = (a: number, b: number, c: number, d: number) => Math.min(b, d) - Math.max(a, c);
    for (let i = 0; i < r.boards.length; i += 1) {
      for (let j = i + 1; j < r.boards.length; j += 1) {
        const a = r.boards[i]!;
        const b = r.boards[j]!;
        const hit = ov(a.x0, a.x1, b.x0, b.x1) > 1e-6 && ov(a.y0, a.y1, b.y0, b.y1) > 1e-6 && ov(a.z0, a.z1, b.z0, b.z1) > 1e-6;
        const sillPair = [a.id, b.id].includes("SILL") && [a.id, b.id].some((id) => id.startsWith("FP") || id.startsWith("BOOT_SIDE"));
        const notched = [a.id, b.id].includes("END_LOWER") && [a.id, b.id].some((id) => id.startsWith("LEDGER"))
          && r.joints.some((jt) => jt.id === `END_LOWER_${a.id === "END_LOWER" ? b.id : a.id}_notch`);
        assert.ok(!hit || sillPair || notched, `${side}: ${a.id} overlaps ${b.id}`);
      }
    }
    // The sill's tongue: inside the access opening (the partition's notch, between the inner sides), as deep as partition + inner side.
    const acc = r.layout.partition.bootAccess;
    const sill = board(r, "SILL");
    const tongue = sill.profileVector!.filter((p) => Math.abs(p.y!) < 1e-6).map((p) => p.x!);
    assert.ok(Math.min(...tongue) >= acc.x0 - 1e-6 && Math.max(...tongue) <= acc.x1 + 1e-6, `${side}: tongue inside the access`);
    assert.equal(Math.max(...tongue) - Math.min(...tongue), acc.x1 - acc.x0 - RULES.SILL_TONGUE_CLEARANCE_MM.value);
    assert.equal(board(r, "BOOT_SIDE_L").x1, acc.x0);
    assert.equal(board(r, "BOOT_SIDE_R").x0, acc.x1);
    assert.equal(board(r, "BOOT_SIDE_L").y1, sill.profileVector!.find((p) => p.y! > 1e-6 && Math.abs(p.x! - Math.min(...tongue)) < 1e-6)!.y);
  }
}

/** LEFT: the end cubby, the boot door and the sill follow the mirrored access; the end panels' colour faces the bunk (+X = A). */
function testInteriorMirrors() {
  const r = gen({ endSide: "LEFT" });
  assert.deepEqual(box6(board(r, "END_LOWER")), [284, 300, 18, 748, 418, 1177.5]);
  assert.equal(board(r, "END_LOWER").faces!.find((f) => f.id === "A")!.finish!.colour, "Metallic White");
  assert.equal(cutouts(board(r, "END_LOWER")).length, 1);
  assert.deepEqual([board(r, "BOOT_DOOR").x0, board(r, "BOOT_DOOR").x1], [2275 - 1370.5, 2275 - 915]);
  assert.deepEqual([board(r, "SILL").x0, board(r, "SILL").x1], [2275 - 1415, 2275 - 870]);
  assert.deepEqual(r.layout.cubby, { x0: 0, x1: 284 });
  // The ladder is on the left now: the left front strip stops at the ladder holes, the right one at the lower opening.
  assert.deepEqual([board(r, "LEDGER_FRONT_L").x0, board(r, "LEDGER_FRONT_L").x1], [0, 620]);
  assert.deepEqual([board(r, "LEDGER_FRONT_R").x0, board(r, "LEDGER_FRONT_R").x1], [1675, 2275]);
  assert.ok(r.joints.some((j) => j.id === "END_LOWER_LEDGER_FRONT_L_notch"));
}

/** LEFT mirrors every opening; the regions never enter the partition. */
function testFrontPartitionMirrors() {
  const l = gen({ endSide: "LEFT" }).layout.partition;
  const rt = gen().layout.partition;
  const mirror = (a: { x0: number; x1: number }) => [2275 - a.x1, 2275 - a.x0];
  assert.deepEqual([l.ladder.x0, l.ladder.x1], mirror(rt.ladder));
  assert.deepEqual([l.lowerOpening.x0, l.lowerOpening.x1], mirror(rt.lowerOpening));
  assert.deepEqual([l.bootAccess.x0, l.bootAccess.x1], mirror(rt.bootAccess));
  const r = gen({ endSide: "LEFT" });
  const cut = r.boards[0]!.faces!.find((f) => f.id === "A")!.features.filter((f) => f.kind === "cutout");
  assert.equal(cut.length, 3, "the ladder holes are on the left piece");
  for (const z of r.zones) for (const b of fp(r)) assert.ok(z.y0 >= b.y1 - 1e-6, `${z.id} behind ${b.id}`);
}

/** A bunk that fits one sheet stays one board; a thicker partition stock is copied through. */
function testFrontPartitionOneSheetAndStock() {
  const short = gen({ length: 1900, height: 1150, deckTop: 118, upperZ: 618 });
  assert.deepEqual(short.validation.errors, []);
  assert.deepEqual(fp(short).map((b) => b.id), ["FP"], "1900 × 1148 fits one sheet turned");
  assert.equal(short.layout.partition.cut, null);
  const one = gen({ partitionThickness: 25 });
  assert.equal(one.boards[0]!.y1, 25);
  assert.equal(one.layout.mattressWidth, 723);
  assert.ok(gen({ length: 1500 }).validation.errors.some((e) => e.includes("lower opening is only")), "too short for opening + ladder + margins");
}

/** Without upperZ the upper base sits where both bunks get the same clear height — for 21 Bunk that is its own 1177.5. */
function testEqualClearDefault() {
  const r = gen({ upperZ: undefined });
  assert.equal(r.params.upperZ, 1177.5);
  assert.equal(bunkUpperLimits({ deckTop: 418, height: 1961 }).equal, 1177.5);
  const lim = bunkUpperLimits({ deckTop: 418, height: 1961 });
  assert.equal(lim.min, 418 + RULES.BUNK_CLEAR_MIN_MM.value);
  assert.equal(lim.max, 1961 - RULES.UPPER_BASE_THICKNESS_MM.value - RULES.BUNK_CLEAR_MIN_MM.value);
}

function testLimits() {
  assert.ok(gen({ upperZ: 800 }).validation.errors.some((e) => e.includes("lower bunk has only")));
  assert.ok(gen({ upperZ: 1500 }).validation.errors.some((e) => e.includes("upper bunk has only")));
  assert.ok(gen({ deckTop: 60 }).validation.errors.some((e) => e.includes("boot")));
  assert.ok(gen({ length: 1200 }).validation.errors.some((e) => e.includes("long")));
  assert.equal(gen({ upperZ: 800 }).zones.length, 0);
  const min = bunkMinSize();
  assert.equal(min.H, RULES.BOOT_HEIGHT_MIN_MM.value + RULES.DECK_THICKNESS_MM.value + 2 * RULES.BUNK_CLEAR_MIN_MM.value + RULES.UPPER_BASE_THICKNESS_MM.value);
  assert.equal(gen({ endSide: "sideways" }).params.endSide, "RIGHT");
  assert.equal(gen({ endSide: "LEFT" }).layout.endSide, "LEFT");
}

/** The front partition keeps the job's partition clearances: it starts above the floor and ends at the bunk top, which already leaves the ceiling gap. */
function testPartitionClearances() {
  const p = gen().layout.partition;
  assert.deepEqual([p.z0, p.z1], [2, 1961]);
  assert.deepEqual([p.floorClearance, p.ceilingClearance], [2, 4]);
  const e = gen({ floorClearance: 5 }).debug.provenance.entries;
  assert.equal(e["partition.z0"].value, 5);
  assert.equal(e["partition.z0"].terms.floorClearance.kind, "param");
  assert.equal(e["partition.z1"].formula, "H");
}

function testProvenance() {
  const e = gen().debug.provenance.entries;
  assert.equal(e["boot.z1"].formula, "top - T");
  assert.equal(e["boot.z1"].terms.T.kind, "rule");
  assert.equal(e["upperBase.z1"].value, 1201.5);
  assert.equal(e["mattress.width"].terms.T.kind, "param");
  assert.equal(e["opening.lower.z0"].formula, "deckTop + RAIL");
  assert.equal(e["opening.lower.z0"].terms.RAIL.name, "LOWER_RAIL_MM");
  assert.equal(e["ladder.near"].formula, "W - (M + EDGE)");
  assert.equal(e["partition.cut"].value, 1140);
  const r = gen();
  for (const b of r.boards) {
    for (const f of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) assert.equal(r.debug.provenance.entries[`${b.id}.${f}`]!.value, b[f], `${b.id}.${f}`);
    const [ua, va] = b.profilePlane === "XY" ? ["x", "y"] as const : b.profilePlane === "YZ" ? ["y", "z"] as const : ["x", "z"] as const;
    (b.profileVector ?? []).slice(0, -1).forEach((p, i) => {
      assert.equal(r.debug.provenance.entries[`${b.id}.pv[${i}].${ua}`]!.value, p[ua], `${b.id}.pv[${i}].${ua}`);
      assert.equal(r.debug.provenance.entries[`${b.id}.pv[${i}].${va}`]!.value, p[va], `${b.id}.pv[${i}].${va}`);
    });
  }
  assert.equal(r.debug.provenance.entries["FP_1.z0"]!.formula, "= partition.z0");
  assert.equal(e["BOOT_BACK.y0"].formula, "D - Tc");
  assert.equal(e["BOOT_SIDE_L.x1"].formula, "= access.far");
  assert.equal(e["BOOT_DOOR.x0"].formula, "access.far - OV");
  assert.equal(e["BOOT_DOOR.lock.v"].terms.DROP.name, "BOOT_DOOR_LOCK_DROP_MM");
  assert.equal(e["BOOT_DOOR.hinge2.u"].formula, "w - SIDE");
  assert.equal(e["LEDGER_BACK.z0"].formula, "upperBase.z0 - LH");
  assert.equal(e["LEDGER_FRONT_R.x0"].formula, "= ladder.near");
  assert.equal(e["LEDGER_FRONT_L.x1"].formula, "= opening.lower.far");
  assert.equal(e["BOOT_DOOR.z1"].terms.TOP.name, "BOOT_DOOR_TOP_OVERLAP_MM");
  assert.equal(e["END_LOWER.x0"].formula, "face - Td");
  assert.equal(e["cubby.face"].terms.CUBBY.name, "CUBBY_WIDTH_MM");
  assert.equal(e["SILL.body.x0"].formula, "tongue.x0 - OH");
  assert.equal(e["SILL.tongue.x1"].formula, "access.near - CL");
}

const tests = { testPresetsPinned, testStack21Bunk, testFrontPartition21Bunk, testInteriorBoards21Bunk, testNoOverlap, testInteriorMirrors, testFrontPartitionMirrors, testFrontPartitionOneSheetAndStock, testEqualClearDefault, testLimits, testPartitionClearances, testProvenance };
let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`PASS ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}`); console.log(e); }
}
if (failed) { console.log(`${failed}/${Object.keys(tests).length} failed`); process.exit(1); }
console.log(`OK ${Object.keys(tests).length}/${Object.keys(tests).length}`);
