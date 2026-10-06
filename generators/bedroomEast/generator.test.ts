import assert from "node:assert/strict";
import { generateBedroomEast, eastWardrobeMax, RULES } from "./generator.ts";
import { checkPins, countPins, type PresetsFile } from "../_lib/pins.ts";
import presetsRaw from "./presets.json" with { type: "json" };
import modelRaw from "./bedroom1.model.json" with { type: "json" };

const presets = presetsRaw as PresetsFile;
const bedroom1 = presets.presets.find((p) => p.id === "bedroom1")!;
const gen = (patch: Record<string, unknown> = {}) => generateBedroomEast({ ...(bedroom1.params as object), ...patch } as never);
const zone = (r: ReturnType<typeof gen>, id: string) => r.zones.find((z) => z.id === id) as Record<string, any>;
const board = (r: ReturnType<typeof gen>, id: string) => r.boards.find((b) => b.id === id)!;

function testPresetsPinned() {
  for (const preset of presets.presets) {
    const r = generateBedroomEast(preset.params as never);
    assert.deepEqual(r.validation.errors, [], preset.id);
    assert.ok(countPins(preset.pins) > 0, preset.id);
    const bad = checkPins(r as never, preset.pins);
    assert.deepEqual(bad, [], `${preset.id}: ${bad.map((m) => `${m.path} expected ${m.expected} got ${m.actual}`).join("; ")}`);
  }
}

/** Every board of Bedroom 1, where the model has it: within 0.5 mm on every face. */
function testMatchesBedroom1() {
  const r = gen();
  const model = (modelRaw as { boards: Record<string, Record<string, number>> }).boards;
  assert.equal(r.boards.length, Object.keys(model).length);
  for (const [id, want] of Object.entries(model)) {
    const b = board(r, id);
    assert.ok(b, `${id} missing`);
    for (const k of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) {
      assert.ok(Math.abs((b as never as Record<string, number>)[k] - want[k]!) <= 0.5, `${id}.${k} ${(b as never as Record<string, number>)[k]} vs model ${want[k]}`);
    }
  }
  assert.deepEqual((r as { milling: { issues: unknown[] } }).milling.issues, []);
}

/** Boot, wardrobe and overhead against the nose; bedside cabinet and bed box in front of it. */
function testLayout() {
  const r = gen();
  const D = RULES.MATTRESS_DEPTH_MM.value;
  const B0 = D - RULES.BODY_DEPTH_MM.value;
  assert.deepEqual([zone(r, "boot").y0, zone(r, "boot").y1], [B0, D]);
  assert.deepEqual([zone(r, "wardrobe").y0, zone(r, "wardrobe").x1], [B0, 330]);
  assert.deepEqual([zone(r, "bedbox").x0, zone(r, "bedbox").y1], [395, B0]);
  assert.deepEqual([zone(r, "bedside").y0, zone(r, "bedside").y1, zone(r, "bedside").z1], [B0 - 200, B0, 615]);
  assert.equal(zone(r, "opening").kind, "void");
  for (const id of ["boot", "wardrobe", "bedside", "bedbox", "ohc"]) assert.ok(zone(r, id).boards.length > 0, `${id} lists its boards`);
}

/** The wardrobe takes what a queen mattress and the bed-side gap leave; narrower is allowed, wider is not. */
function testWardrobeAndMattress() {
  assert.equal(eastWardrobeMax(2275), 330);
  const r = gen();
  assert.equal(r.params.wardrobeWidth, 330);
  assert.equal(r.params.bedX0, 395);
  assert.equal(r.params.mattressLength, 1880);
  assert.deepEqual(r.validation.warnings, []);
  assert.equal(gen({ wardrobeWidth: 600 }).params.wardrobeWidth, 330);
  assert.equal(gen({ wardrobeWidth: 250 }).params.mattressLength, 1960);
}

function testShortMattressWarns() {
  const r = gen({ width: 1900, ohcZones: undefined });
  assert.equal(r.params.wardrobeWidth, RULES.WARDROBE_MIN_MM.value);
  assert.equal(r.params.mattressLength, 1685);
  assert.deepEqual(r.validation.errors, []);
  assert.ok(r.validation.warnings.some((w) => w.includes("1880")));
}

/** Every board that follows the roof stays under it. */
function testUnderTheRoof() {
  const r = gen();
  const roof = (y: number) => {
    const pr = r.params.roofProfile;
    for (let i = 0; i < pr.length - 1; i += 1) {
      const [y0, z0] = pr[i]!; const [y1, z1] = pr[i + 1]!;
      if (y <= y1 + 1e-9) return z0 + ((z1 - z0) * (y - y0)) / (y1 - y0);
    }
    return pr[pr.length - 1]![1];
  };
  for (const id of ["WARD_PANEL", "WARD_STRIP", "OHC_D0", "OHC_D1", "OHC_D2", "OHC_D3"]) {
    for (const p of board(r, id).profileVector as Array<{ y: number; z: number }>) assert.ok(p.z <= roof(p.y) + 0.05, `${id} above the roof at y ${p.y}`);
  }
  assert.equal(board(r, "T1").z1, 1797);
}

function testOverhead() {
  const r = gen();
  assert.deepEqual(["OHC_D0", "OHC_D1", "OHC_D2", "OHC_D3"].map((id) => board(r, id).x0), [330, 945, 1567.5, 2260]);
  assert.deepEqual(r.layout.top!.doors, [{ x0: 332, x1: 950.8 }, { x0: 954.3, x1: 1573.3 }, { x0: 1576.8, x1: 2158 }]);
  assert.ok(gen({ ohcBottom: 800 }).validation.errors.some((e) => e.includes("between the boot deck and the overhead")));
  const two = gen({ ohcZones: [{ id: "a", width: 1 }, { id: "b", width: 1 }] });
  assert.deepEqual(two.layout.ohc.zones.map((b) => b.width), [972.5, 972.5]);
  assert.ok(board(two, "OHC_D2") && !two.boards.find((b) => b.id === "OHC_D3"));
}

/** Lock slots are stadiums as in the model: overall length with half-circle ends, not rectangles. */
function testLockSlots() {
  const r = gen();
  const lockOf = (id: string) => board(r, id).faces!.flatMap((f) => f.features).find((f) => f.for === "lock")!;
  const door = lockOf("WARD_DOOR");
  assert.deepEqual([door.u1! - door.u0!, door.v1! - door.v0!, door.radius, door.through], [16, 55, 8, true]);
  assert.equal(board(r, "WARD_DOOR").x0 + (door.u0! + door.u1!) / 2, 283.3);
  assert.equal(board(r, "WARD_DOOR").z0 + door.v0!, 1230.9);
  for (const [id, cx] of [["BS_FRONT_HI", 165], ["BS_FRONT_LO", 238.5]] as const) {
    const s = lockOf(id);
    assert.deepEqual([Math.round((s.u1! - s.u0!) * 10) / 10, Math.round((s.v1! - s.v0!) * 10) / 10, s.radius], [54.5, 16.2, 8.1], id);
    assert.ok(Math.abs(board(r, id).x0 + (s.u0! + s.u1!) / 2 - cx) <= 0.5, `${id} centre`);
  }
}

function testLedChannels() {
  const led = (r: ReturnType<typeof gen>) => board(r, "T3").faces!.find((f) => f.id === "A")!.features.filter((f) => f.for === "led");
  assert.equal(led(gen()).length, 3);
  assert.equal(led(gen({ ledGroove: false })).length, 0);
}

function testProvenance() {
  const r = gen();
  const entries = r.debug.provenance.entries as Record<string, { value: number; formula?: string }>;
  for (const k of ["body.y0", "bed.x0", "mattress.length", "top.T3.z1", "OHC_BP.z0", "BB_SIDE_IN.x0"]) assert.ok(entries[k], `${k} recorded`);
  for (const b of r.boards) {
    for (const f of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) {
      const e = entries[`${b.id}.${f}`];
      assert.ok(e, `${b.id}.${f} has no provenance`);
      assert.ok(Math.abs(e.value - b[f]) <= 0.051, `${b.id}.${f} ${e?.value} vs ${b[f]}`);
    }
  }
  assert.equal(entries["BOOT_DECK.z0"]!.formula, "BH - deck");
}

const tests = { testPresetsPinned, testMatchesBedroom1, testLayout, testWardrobeAndMattress, testShortMattressWarns, testUnderTheRoof, testOverhead, testLockSlots, testLedChannels, testProvenance };
let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`PASS ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}`); console.log(e); }
}
if (failed) { console.log(`${failed}/${Object.keys(tests).length} failed`); process.exit(1); }
console.log(`OK ${Object.keys(tests).length}/${Object.keys(tests).length}`);
