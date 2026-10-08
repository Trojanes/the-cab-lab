// @ts-nocheck
// Board/Feature contract — generated boards must satisfy the rules the cnjob
// boundary enforces; synthetic violations must be named.
import assert from "node:assert/strict";
import { generateKitchenCabinet } from "../kitchen/generator.ts";
import { sheetMaterial } from "./material.ts";
import { boardIssues, featureIssue, MACHINED_FEATURE_KINDS } from "./boardContract.ts";

const params = {
  globalSettings: { length: 887, depth: 270, height: 880 },
  materialThickness: 15, frontThickness: 16, frontClearance: 2.5,
  bottomClearanceHeight: 55, bottomClearanceStyle: "style_1", lockEnabled: true,
  columns: [
    { id: "k-col-1", width: 444, zones: [{ id: "c1", height: 825, zoneType: "left_door", shelfEnabled: true, shelfHeight: 400 }] },
    { id: "k-col-2", width: 443, zones: [{ id: "c2d", height: 300, zoneType: "drawer" }, { id: "c2r", height: 525, zoneType: "right_door" }] },
  ],
};

// A real generator result is contract-clean: every machined feature passes
// and every board passes the board-level rules.
const kitchen = generateKitchenCabinet(params);
assert.ok(Array.isArray(kitchen.boards) && kitchen.boards.length > 0);
const bad = [];
for (const b of kitchen.boards) {
  const sheet = sheetMaterial(b, { doorSeries: "hpl", doorColorName: "Chestnut" });
  bad.push(...boardIssues(b, sheet).map((s) => `${b.id}: ${s}`));
  for (const face of b.faces ?? []) {
    for (const f of face.features) {
      if (!MACHINED_FEATURE_KINDS.has(f.kind)) continue;
      const why = featureIssue(f, !f.through, sheet.thicknessMm);
      if (why) bad.push(`${b.id}/${f.id ?? "?"}: ${why}`);
    }
  }
}
assert.deepEqual(bad, []);

// Synthetic violations each name their rule. Boards use the real model:
// profilePlane + box coords (x0..z1), optionally a profileVector outline.
const mk = (over) => ({
  id: "B1",
  profilePlane: "YZ",
  x0: 0, x1: 16, y0: 0, y1: 800, z0: 0, z1: 560,
  faces: [{ id: "A", features: [] }],
  ...over,
});
assert.deepEqual(boardIssues(mk({ id: "" }), { thicknessMm: 16 }), ["board has no id"]);
assert.deepEqual(
  boardIssues(mk({ y0: undefined }), { thicknessMm: 16 }),
  ["the outline has non-finite points"],
);
assert.deepEqual(
  boardIssues(mk({ y0: 100, y1: 100 }), { thicknessMm: 16 }),
  ["the outline has no area"],
);
assert.deepEqual(
  boardIssues(mk({}), { thicknessMm: 16, grained: true }),
  ["textured HPL has no grain direction"],
);
assert.deepEqual(
  boardIssues(mk({ faces: [{ id: "A", features: [], visible: true, finish: { grain: "v" } }] }), { thicknessMm: 16, grained: true }),
  [],
);

// Feature-level rules.
assert.equal(featureIssue({ kind: "hole", through: false, depth: 0, center: [1, 2], diameter: 5 }, true, 16), "has no depth");
assert.equal(featureIssue({ kind: "hole", through: false, depth: 20, center: [1, 2], diameter: 5 }, true, 16), "is 20 deep on a 16 mm board");
assert.equal(featureIssue({ kind: "hole", through: false, depth: 5, diameter: 5 }, true, 16), "has no centre or diameter");
assert.equal(featureIssue({ kind: "groove", through: false, depth: 5, u0: 0, u1: 0, v0: 0, v1: 10 }, true, 16), "has no slot");
assert.equal(featureIssue({ kind: "cutout", through: true }, false, 16), "has no outline");
assert.equal(featureIssue({ kind: "hole", through: true, center: [1, 2], diameter: 5 }, false, 16), null);
assert.equal(featureIssue({ kind: "cutout", through: true, u0: 0, u1: 5, v0: 0, v1: 5 }, false, 16), null);

console.log("boardContract ok");
