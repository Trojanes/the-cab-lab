import assert from "node:assert/strict";
import { generateUShapeOverhead } from "./generator.ts";

const hood = generateUShapeOverhead({
  totalWidth: 2400,
  leftArmLength: 1500,
  rightArmLength: 1500,
  cabinetDepth: 400,
  cabinetHeight: 400,
  sideClearance: 50,
  frontPanelThickness: 16,
  featureWidth: 15,
  rangehoodClearHeight: 75,
  rangehoodAlignment: "left",
  rangehoodEdgeOffsetX: 40,
  zones: {
    LEFT: [{ id: "left-hood", type: "rangehood_flap", width: 900 }],
    BACK: [{ id: "back-main", type: "up_flap", width: 1200 }],
    RIGHT: [{ id: "right-hood", type: "rangehood_flap", width: 900 }],
  },
});
assert.deepEqual(hood.validation.errors, [], hood.validation.errors.join("\n"));
assert.ok(hood.boards.some((b) => b.id === "LEFT.RGHD_TOP"));
assert.ok(hood.boards.some((b) => b.id === "RIGHT.RGHD_TOP"));
assert.ok(!hood.boards.some((b) => b.id.startsWith("BACK.RGHD_")));

const coerced = generateUShapeOverhead({
  totalWidth: 2400,
  leftArmLength: 1500,
  rightArmLength: 1500,
  cabinetDepth: 400,
  cabinetHeight: 400,
  zones: { BACK: [{ id: "back-hood", type: "rangehood_flap", width: 1200 }] },
});
assert.ok(coerced.validation.warnings.some((w) => /Rangehood on BACK/i.test(w)), coerced.validation.warnings.join("; "));
assert.ok(!coerced.boards.some((b) => b.id.startsWith("BACK.RGHD_")));
assert.equal(coerced.params.zones.BACK[0]?.type, "up_flap");

console.log("u shape overhead: side hoods stay out of the corners");
