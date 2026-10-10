/**
 * Snapshot contract validation: a real generator output validates clean,
 * the stored kitchen fixture replays clean, and every fixture in
 * fixtures/snapshot fails (or warns) the way OmniCam's importer would.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { generateKitchenCabinet } from "../kitchen/generator.ts";
import { buildCnjob } from "./cnjob.ts";
import { validateSnapshot } from "./snapshotContract.ts";

const fixture = (name) => JSON.parse(readFileSync(`fixtures/snapshot/${name}`, "utf8"));
const codes = (v) => ({ errors: v.errors.map((e) => e.code), warnings: v.warnings.map((w) => w.code) });

/* ---- live emission: a real kitchen export passes the contract ---- */
const kitchen = generateKitchenCabinet({
  globalSettings: { length: 887, depth: 270, height: 880 },
  materialThickness: 15, frontThickness: 16, frontClearance: 2.5,
  bottomClearanceHeight: 55, bottomClearanceStyle: "style_1", lockEnabled: true,
  columns: [
    { id: "k-col-1", width: 444, zones: [{ id: "c1", height: 825, zoneType: "left_door", shelfEnabled: true, shelfHeight: 400 }] },
    { id: "k-col-2", width: 443, zones: [{ id: "c2d", height: 300, zoneType: "drawer" }, { id: "c2r", height: 525, zoneType: "right_door" }] },
  ],
});
const emitted = buildCnjob({ jobId: "job", cabinets: [{
  id: "k1", moduleId: "kitchen", params: { doorSeries: "hpl", doorColorName: "Chestnut" },
  boards: kitchen.boards, errors: [], grainIssues: [], millingIssues: [],
}]});
assert.equal(emitted.ok, true, emitted.ok ? "" : emitted.reasons.join("\n"));
if (emitted.ok) assert.deepEqual(codes(validateSnapshot(emitted.snapshot)), { errors: [], warnings: [] });

/* ---- stored replay: the committed kitchen snapshot still validates ---- */
assert.deepEqual(codes(validateSnapshot(fixture("kitchen-ok.json"))), { errors: [], warnings: [] });

/* ---- negative fixtures: each rejects with the importer's code ---- */
const expected = {
  "bad-schema.json": { errors: ["schema"] },
  "bad-units.json": { errors: ["units"] },
  "bad-blind-no-depth.json": { errors: ["feature_depth"] },
  "bad-double-side.json": { errors: ["double_side_unsupported"] },
  "bad-depth-over.json": { errors: ["feature_depth"] },
  "bad-dup-feature.json": { errors: ["featureId_duplicate"] },
  "bad-edgeband.json": { errors: ["edge_band_index"] },
  "bad-bore-geom.json": { errors: ["bore_geometry"] },
  "bad-machining-face.json": { errors: ["machining_face_mismatch"] },
  "warn-kind.json": { errors: [], warnings: ["feature_kind_unsupported"] },
  "warn-grain.json": { errors: [], warnings: ["grain_missing"] },
};
const files = readdirSync("fixtures/snapshot").filter((f) => f.endsWith(".json") && f !== "kitchen-ok.json").sort();
for (const file of files) {
  const v = validateSnapshot(fixture(file));
  const want = expected[file];
  assert.ok(want, `${file}: no expectation registered`);
  for (const code of want.errors ?? []) {
    assert.ok(v.errors.some((e) => e.code === code), `${file}: expected error ${code}, got ${JSON.stringify(codes(v))}`);
  }
  assert.equal(v.errors.length, (want.errors ?? []).length, `${file}: unexpected extra errors ${JSON.stringify(codes(v))}`);
  for (const code of want.warnings ?? []) {
    assert.ok(v.warnings.some((w) => w.code === code), `${file}: expected warning ${code}, got ${JSON.stringify(codes(v))}`);
  }
}

/* ---- buildCnjob refuses a board its own contract rejects (self-check) ---- */
const board = {
  id: "P1", name: "p", category: "c", boardType: "carcass",
  materialThickness: 15, profilePlane: "XY", thicknessAxis: "Z",
  x0: 0, x1: 100, y0: 0, y1: 50, z0: 0, z1: 15,
  stock: { kind: "carcass", thickness: 15 },
  faces: [
    { id: "A", key: "P1.A", normal: "+Z", features: [{ id: "h", kind: "hole", center: [10, 10], diameter: 5 }] },
    { id: "B", key: "P1.B", normal: "-Z", features: [] },
  ],
};
const refused = buildCnjob({ jobId: "job", cabinets: [{ id: "c", moduleId: "m", params: null, boards: [board], errors: [] }] });
assert.equal(refused.ok, false);
if (!refused.ok) assert.ok(refused.reasons.some((r) => r.includes("no depth")), refused.reasons.join("\n"));

console.log("snapshotContract ok");
