// Every Acrylic door colour in the catalogue has a screen swatch; HPL has none yet.
import assert from "node:assert/strict";
import { DOOR_SWATCHES, METALLIC_FLAKES, doorSwatch } from "./doorSwatches.js";

// materials.js → settings.js → log.js reads window.cablab at load.
globalThis.window ??= { cablab: null, addEventListener() {}, removeEventListener() {} };
const { DOOR_SERIES, doorColorList } = await import("./materials.js");

for (const name of doorColorList("acrylic")) {
  const sw = doorSwatch(name);
  assert.ok(sw, `${name}: no swatch`);
  assert.ok(Number.isInteger(sw.hex) && sw.hex >= 0 && sw.hex <= 0xffffff, `${name}: hex`);
  assert.ok(["matte", "gloss", "metallic"].includes(sw.finish), `${name}: finish ${sw.finish}`);
  assert.ok(sw.source, `${name}: source`);
}
for (const name of DOOR_SERIES.hpl.colors) assert.equal(doorSwatch(name), null, `${name}: HPL has no swatch yet`);
for (const name of Object.keys(DOOR_SWATCHES)) assert.ok(doorColorList("acrylic").includes(name), `${name}: not in the catalogue`);

// Finishes follow the series: Gloss → gloss, Metallic → metallic, SuperMatt → matte.
for (const g of DOOR_SERIES.acrylic.groups) {
  const want = { gloss: "gloss", metallic: "metallic", supermatt: "matte" }[g.id];
  for (const name of g.colors) assert.equal(doorSwatch(name).finish, want, `${name}: finish`);
}
// SuperMatt Silver must read apart from SuperMatt Ash.
assert.notEqual(doorSwatch("SuperMatt Silver").hex, doorSwatch("SuperMatt Ash").hex);
assert.ok(METALLIC_FLAKES.diameterMm > 0 && METALLIC_FLAKES.perCm2 > 0 && METALLIC_FLAKES.tileMm > 0);

console.log("doorSwatches: every Acrylic colour has a swatch");
