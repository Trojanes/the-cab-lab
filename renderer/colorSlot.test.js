// Right-click a placed cabinet onto the job's other door colour.
globalThis.window ??= { cablab: null, addEventListener() {}, removeEventListener() {} };

import assert from "node:assert/strict";

const { colorSlotOf, otherDoorColor, withColorSlot } = await import("./materials.js");
const { MODULES } = await import("./modules.js");
const job = await import("./job.js");

const two = {
  carcass: { name: "White Stipple" },
  door: {
    series: "acrylic",
    mode: "two",
    sides: "single",
    colors: [
      { id: "A", series: "acrylic", name: "Gloss White" },
      { id: "B", series: "acrylic", name: "Gloss Ash" },
    ],
  },
};
const one = {
  carcass: { name: "White Stipple" },
  door: {
    series: "acrylic",
    mode: "one",
    sides: "single",
    colors: [{ id: "A", series: "acrylic", name: "Gloss White" }],
  },
};

const doorColour = (id) => {
  const boards = job.resultFor(id).boards.filter((b) => b.stock?.kind === "door");
  assert.ok(boards.length, "a door board");
  const colours = new Set();
  for (const b of boards) {
    for (const f of b.faces || []) {
      if (f.finish?.colour && f.finish.colour !== "White Stipple") colours.add(f.finish.colour);
    }
  }
  assert.equal(colours.size, 1, [...colours].join(","));
  return [...colours][0];
};

job.setMaterials(two, job.getJob().stock);

assert.equal(colorSlotOf({ doorColorName: "Gloss Ash" }, two), "B");
assert.equal(colorSlotOf({ doorColorName: "Gloss White" }, two), "A");
assert.equal(colorSlotOf({}, two), "A");
assert.equal(otherDoorColor({ colorSlot: "B" }, two).name, "Gloss White");
assert.equal(otherDoorColor({ colorSlot: "A" }, one).enabled, false);

const kitchen = job.addCabinet("kitchenCabinet", { x: 0, y: 0, z: 0, rotZ: 0 }, { W: 600, D: 560, H: 720 }, { history: false });
assert.equal(kitchen.params.colorSlot, "B");
assert.equal(kitchen.params.benchTopColorName, "Pale Driftwood");
{
  const bench = job.resultFor(kitchen.id).boards.find((b) => b.id === "BENCH");
  assert.ok(bench, "a new base cabinet carries a bench top");
  assert.equal(bench.faces.find((f) => f.id === "A").finish.colour, "Pale Driftwood");
}
assert.equal(kitchen.params.doorColorName, "Gloss Ash");
assert.equal(doorColour(kitchen.id), "Gloss Ash");

assert.equal(job.setColorSlot(kitchen.id, "A"), true);
assert.equal(job.getJob().cabinets.find((c) => c.id === kitchen.id).params.colorSlot, "A");
assert.equal(job.getJob().cabinets.find((c) => c.id === kitchen.id).params.doorColorName, "Gloss White");
assert.equal(job.getJob().cabinets.find((c) => c.id === kitchen.id).params.doorColorNameB, "Gloss Ash");
assert.equal(doorColour(kitchen.id), "Gloss White");
assert.equal(job.setColorSlot(kitchen.id, "A"), false);

job.undo();
assert.equal(job.getJob().cabinets.find((c) => c.id === kitchen.id).params.doorColorName, "Gloss Ash");
assert.equal(doorColour(kitchen.id), "Gloss Ash");

const overhead = job.addCabinet("overheadCabinet", { x: 0, y: 0, z: 0, rotZ: 0 }, { W: 800, D: 320, H: 400 }, { history: false });
assert.equal(overhead.params.colorSlot, "A");
const flipped = withColorSlot(overhead.params, two, "B");
assert.equal(flipped.doorColorName, "Gloss Ash");
assert.equal(flipped.colorSlot, "B");
assert.equal(job.setColorSlot(overhead.id, "B"), true);
assert.equal(doorColour(overhead.id), "Gloss Ash");

job.setMaterials(one, job.getJob().stock);
assert.equal(job.setColorSlot(kitchen.id, "A"), false);

const side = MODULES.bedSideTable;
const shared = { shelfCenter: 200, depth: 145, height: 400, clearance: 2, zones: [{ id: "upper", type: "drawer" }] };
const source = { ...shared, side: "left", doorColor: "Gloss White", doorColorName: "Gloss White", doorColorB: "Gloss Ash", doorColorNameB: "Gloss Ash", colorSlot: "A" };
const twin = { ...shared, side: "right", doorColor: "Gloss Ash", doorColorName: "Gloss Ash", doorColorB: "Gloss Ash", doorColorNameB: "Gloss Ash", colorSlot: "B" };
const mirrored = side.mirrorParams(source, twin);
assert.equal(mirrored.colorSlot, "A");
assert.equal(mirrored.doorColorName, "Gloss White");
assert.equal(mirrored.side, "right");
assert.equal(side.mirrorParams(source, source), source);

console.log("color slot ok");
