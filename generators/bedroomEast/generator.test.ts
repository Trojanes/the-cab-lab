import assert from "node:assert/strict";
import { generateBedroomEast, eastWardrobeMax, RULES } from "./generator.ts";
import { checkPins, countPins, type PresetsFile } from "../_lib/pins.ts";
import presetsRaw from "./presets.json" with { type: "json" };

const presets = presetsRaw as PresetsFile;
const bedroom1 = presets.presets.find((p) => p.id === "bedroom1")!;
const gen = (patch: Record<string, unknown> = {}) => generateBedroomEast({ ...(bedroom1.params as object), ...patch } as never);
const zone = (r: ReturnType<typeof gen>, id: string) => r.zones.find((z) => z.id === id)!;

function testPresetsPinned() {
  for (const preset of presets.presets) {
    const r = generateBedroomEast(preset.params as never);
    assert.deepEqual(r.validation.errors, [], preset.id);
    assert.ok(countPins(preset.pins) > 0, preset.id);
    const bad = checkPins(r as never, preset.pins);
    assert.deepEqual(bad, [], `${preset.id}: ${bad.map((m) => `${m.path} expected ${m.expected} got ${m.actual}`).join("; ")}`);
  }
}

/** Boot and wardrobe against the nose (local y = depth), the mattress runs on into the room. */
function testBodyAgainstTheNose() {
  const r = gen();
  const D = RULES.MATTRESS_DEPTH_MM.value;
  const body = RULES.BODY_DEPTH_MM.value;
  assert.deepEqual([zone(r, "boot").y0, zone(r, "boot").y1], [D - body, D]);
  assert.deepEqual([zone(r, "wardrobe").y0, zone(r, "wardrobe").y1], [D - body, D]);
  assert.deepEqual([zone(r, "mattress").y0, zone(r, "mattress").y1], [0, D - body]);
  assert.equal(zone(r, "boot").z1, RULES.BOOT_HEIGHT_MM.value);
  assert.equal(zone(r, "mattress").z1, RULES.BOOT_HEIGHT_MM.value);
}

/** The wardrobe follows the roof: under the Bedroom 1 slope it is 1150 high at the nose. */
function testWardrobeUnderTheRoof() {
  const r = gen();
  const pts = zone(r, "wardrobe").outlineYZ;
  const atNose = pts.filter((p) => p.y === 1570).map((p) => p.z);
  assert.equal(Math.max(...atNose), 1150);
  for (const p of pts) assert.ok(p.z <= 1797 + 0.01, `z ${p.z} above the roof`);
}

/** The wardrobe takes what a queen mattress leaves; narrower is allowed, wider is not. */
function testWardrobeAndMattress() {
  assert.equal(eastWardrobeMax(2275), 395);
  const r = gen();
  assert.equal(r.params.wardrobeWidth, 395);
  assert.equal(r.params.mattressLength, 1880);
  assert.deepEqual(r.validation.warnings, []);
  assert.equal(gen({ wardrobeWidth: 600 }).params.wardrobeWidth, 395);
  const narrow = gen({ wardrobeWidth: 250 });
  assert.equal(narrow.params.mattressLength, 2025);
}

/** A van too narrow for a queen mattress still builds, with a warning. */
function testShortMattressWarns() {
  const r = gen({ width: 1900 });
  assert.equal(r.params.wardrobeWidth, RULES.WARDROBE_MIN_MM.value);
  assert.equal(r.params.mattressLength, 1750);
  assert.deepEqual(r.validation.errors, []);
  assert.ok(r.validation.warnings.some((w) => w.includes("1880")));
}

/** Overhead above the mattress: wardrobe face → right wall, door underside → roof, three equal bays by default. */
function testOverhead() {
  const r = gen();
  const ohc = zone(r, "ohc");
  assert.deepEqual([ohc.x0, ohc.x1, ohc.z0], [395, 2275, RULES.OHC_BOTTOM_DEFAULT_MM.value]);
  assert.equal(ohc.y0, RULES.MATTRESS_DEPTH_MM.value - RULES.BODY_DEPTH_MM.value);
  for (const p of ohc.outlineYZ) assert.ok(p.z <= 1797 + 0.01, "overhead under the roof");
  const bays = r.layout.ohc.zones;
  assert.equal(bays.length, 3);
  assert.equal(Math.round(bays.reduce((s, b) => s + b.width, 0)), 1880);
  assert.equal(bays[0]!.x0, 395);
  assert.equal(bays[2]!.x1, 2275);
  const opening = zone(r, "opening");
  assert.equal(opening.kind, "void");
  assert.deepEqual([opening.z0, opening.z1], [RULES.BOOT_HEIGHT_MM.value, RULES.OHC_BOTTOM_DEFAULT_MM.value]);
}

function testOverheadLimits() {
  assert.ok(gen({ ohcBottom: 800 }).validation.errors.some((e) => e.includes("between the boot deck and the overhead")));
  assert.ok(gen({ ohcBottom: 1700 }).validation.errors.some((e) => e.includes("overhead is only")));
  const two = gen({ ohcZones: [{ id: "a", width: 1 }, { id: "b", width: 1 }] });
  assert.deepEqual(two.layout.ohc.zones.map((b) => b.width), [940, 940]);
}

function testProvenance() {
  const r = gen();
  const entries = (r.debug.provenance as { entries: Record<string, { formula: string }> }).entries;
  assert.ok(entries["body.y0"], "body.y0 recorded");
  assert.ok(entries["mattress.length"], "mattress.length recorded");
}

const tests = { testPresetsPinned, testBodyAgainstTheNose, testWardrobeUnderTheRoof, testWardrobeAndMattress, testShortMattressWarns, testOverhead, testOverheadLimits, testProvenance };
let failed = 0;
for (const [name, fn] of Object.entries(tests)) {
  try { fn(); console.log(`PASS ${name}`); } catch (e) { failed += 1; console.log(`FAIL ${name}`); console.log(e); }
}
if (failed) { console.log(`${failed}/${Object.keys(tests).length} failed`); process.exit(1); }
console.log(`OK ${Object.keys(tests).length}/${Object.keys(tests).length}`);
