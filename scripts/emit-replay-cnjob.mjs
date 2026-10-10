// Emits fixtures/replay/kitchen.cnjob — the real .cnjob zip OmniCam replays
// in its golden regression (cabinetnc-cut testdata keeps a synced copy).
// Run: node scripts/emit-replay-cnjob.mjs [--check]
//   --check  only verifies the regenerated snapshot still matches
//            fixtures/snapshot/kitchen-ok.json modulo exportedAt/jobId,
//            without writing the zip.
import { writeFileSync, readFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { zipStore } = require("../cnjobZip.js");

const { generateKitchenCabinet } = await import("../generators/kitchen/generator.ts");
const { buildCnjob } = await import("../generators/_lib/cnjob.ts");

export const KITCHEN_PARAMS = {
  globalSettings: { length: 887, depth: 270, height: 880 },
  materialThickness: 15, frontThickness: 16, frontClearance: 2.5,
  bottomClearanceHeight: 55, bottomClearanceStyle: "style_1", lockEnabled: true,
  columns: [
    { id: "k-col-1", width: 444, zones: [{ id: "c1", height: 825, zoneType: "left_door", shelfEnabled: true, shelfHeight: 400 }] },
    { id: "k-col-2", width: 443, zones: [{ id: "c2d", height: 300, zoneType: "drawer" }, { id: "c2r", height: 525, zoneType: "right_door" }] },
  ],
};

export function buildKitchenSnapshot() {
  const kitchen = generateKitchenCabinet(KITCHEN_PARAMS);
  const built = buildCnjob({ jobId: "kitchen-fixture", cabinets: [{
    id: "k1", moduleId: "kitchen", params: { doorSeries: "hpl", doorColorName: "Chestnut" },
    boards: kitchen.boards, errors: [], grainIssues: [], millingIssues: [],
  }] });
  if (!built.ok) throw new Error("buildCnjob refused: " + built.reasons.join("; "));
  return built.snapshot;
}

const snapshot = buildKitchenSnapshot();
const stored = JSON.parse(readFileSync("fixtures/snapshot/kitchen-ok.json", "utf8"));
const same = JSON.stringify({ ...snapshot, exportedAt: "-" }) === JSON.stringify({ ...stored, exportedAt: "-" });
if (process.argv.includes("--check")) {
  console.log("replay check:", same ? "unchanged" : "DIFFERS");
  process.exit(same ? 0 : 1);
}
if (!same) throw new Error("regenerated snapshot differs from fixtures/snapshot/kitchen-ok.json — update the golden fixture first");

mkdirSync("fixtures/replay", { recursive: true });
const manifest = JSON.stringify({ format: "cabinetnc.manufacturing-snapshot", schemaVersion: "1.1.0", payload: "snapshot.json" });
writeFileSync("fixtures/replay/kitchen.cnjob", zipStore([
  { name: "manifest.json", data: Buffer.from(manifest) },
  // exportedAt is the only nondeterministic field — pin it so replay runs
  // produce a byte-identical fixture and don't dirty the tree.
  { name: "snapshot.json", data: Buffer.from(JSON.stringify({ ...snapshot, exportedAt: "2000-01-01T00:00:00.000Z" })) },
]));
console.log("wrote fixtures/replay/kitchen.cnjob");
