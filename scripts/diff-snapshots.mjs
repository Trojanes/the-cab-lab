#!/usr/bin/env node
// Semantic diff between two cnjob snapshots — the review surface for a
// generator change. Prints a JSON report; exit 1 when the snapshots differ.
//
//   node scripts/diff-snapshots.mjs before.json after.json [--ignore=jobId,exportedAt]
//   node scripts/diff-snapshots.mjs --regen            # live kitchen vs golden fixture
//
// --regen rebuilds the golden fixture's generator inputs and diffs the live
// output against fixtures/snapshot/kitchen-ok.json — the "what did my
// generator edit change" report for agents and reviewers.
import { readFileSync } from "node:fs";
import { diffSnapshots } from "../generators/_lib/snapshotDiff.ts";

const args = process.argv.slice(2);
const ignoreArg = args.find((a) => a.startsWith("--ignore="));
const ignorePaths = ["exportedAt", ...(ignoreArg ? ignoreArg.slice(9).split(",").filter(Boolean) : [])];

const KITCHEN_PARAMS = {
  globalSettings: { length: 887, depth: 270, height: 880 },
  materialThickness: 15, frontThickness: 16, frontClearance: 2.5,
  bottomClearanceHeight: 55, bottomClearanceStyle: "style_1", lockEnabled: true,
  columns: [
    { id: "k-col-1", width: 444, zones: [{ id: "c1", height: 825, zoneType: "left_door", shelfEnabled: true, shelfHeight: 400 }] },
    { id: "k-col-2", width: 443, zones: [{ id: "c2d", height: 300, zoneType: "drawer" }, { id: "c2r", height: 525, zoneType: "right_door" }] },
  ],
};

async function liveKitchenSnapshot() {
  const { generateKitchenCabinet } = await import("../generators/kitchen/generator.ts");
  const { buildCnjob } = await import("../generators/_lib/cnjob.ts");
  const kitchen = generateKitchenCabinet(KITCHEN_PARAMS);
  const built = buildCnjob({ jobId: "kitchen-fixture", cabinets: [{
    id: "k1", moduleId: "kitchen", params: { doorSeries: "hpl", doorColorName: "Chestnut" },
    boards: kitchen.boards, errors: [], grainIssues: [], millingIssues: [],
  }] });
  if (!built.ok) throw new Error(`cnjob build refused: ${built.reasons.join("; ")}`);
  return built.snapshot;
}

const read = (p) => JSON.parse(readFileSync(p, "utf8"));

let before, after, label;
if (args[0] === "--regen") {
  before = read("fixtures/snapshot/kitchen-ok.json");
  after = await liveKitchenSnapshot();
  ignorePaths.push("jobId");
  label = "golden fixture → live kitchen regeneration";
} else {
  const [a, b] = args.filter((x) => !x.startsWith("--"));
  if (!a || !b) {
    console.error("usage: diff-snapshots <before.json> <after.json> [--ignore=paths] | --regen");
    process.exit(2);
  }
  before = read(a);
  after = read(b);
  label = `${a} → ${b}`;
}

const report = diffSnapshots(before, after, { ignorePaths });
const s = report.summary;
const clean = s.materialsChanged + s.materialsAdded + s.materialsRemoved
  + s.workpiecesChanged + s.workpiecesAdded + s.workpiecesRemoved
  + report.header.length + report.diagnostics.length + report.relationships.length === 0;

console.log(JSON.stringify({ label, ignorePaths, clean, summary: s, diff: clean ? undefined : report }, null, 2));
process.exit(clean ? 0 : 1);
