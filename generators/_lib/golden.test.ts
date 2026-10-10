// @ts-nocheck
// Generator golden replay — the cnjob snapshot is deterministic: re-running
// the same generator params must reproduce the stored fixture byte-for-byte
// modulo exportedAt. A diff here means a silent output change; update the
// fixture deliberately (emit-replay-cnjob.mjs refuses to overwrite silently).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { generateKitchenCabinet } from "../kitchen/generator.ts";
import { buildCnjob } from "./cnjob.ts";

const params = {
  globalSettings: { length: 887, depth: 270, height: 880 },
  materialThickness: 15, frontThickness: 16, frontClearance: 2.5,
  bottomClearanceHeight: 55, bottomClearanceStyle: "style_1", lockEnabled: true,
  columns: [
    { id: "k-col-1", width: 444, zones: [{ id: "c1", height: 825, zoneType: "left_door", shelfEnabled: true, shelfHeight: 400 }] },
    { id: "k-col-2", width: 443, zones: [{ id: "c2d", height: 300, zoneType: "drawer" }, { id: "c2r", height: 525, zoneType: "right_door" }] },
  ],
};

const build = () => {
  const kitchen = generateKitchenCabinet(params);
  const built = buildCnjob({ jobId: "kitchen-fixture", cabinets: [{
    id: "k1", moduleId: "kitchen", params: { doorSeries: "hpl", doorColorName: "Chestnut" },
    boards: kitchen.boards, errors: [], grainIssues: [], millingIssues: [],
  }] });
  assert.equal(built.ok, true, built.ok ? "" : built.reasons.join("\n"));
  return JSON.stringify({ ...built.snapshot, exportedAt: "-" });
};

const stored = JSON.stringify({ ...JSON.parse(readFileSync("fixtures/snapshot/kitchen-ok.json", "utf8")), exportedAt: "-" });
const again = build();
assert.equal(again, stored, "kitchen snapshot drifted from the golden fixture — review and re-emit deliberately");
assert.equal(build(), again, "kitchen snapshot is not deterministic across runs");

console.log("golden ok");
