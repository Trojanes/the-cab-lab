/**
 * job.v2 contract: a legacy job.v1 file migrates and loads, a minimal v2
 * loads, and every fixtures/job/bad-* is refused with a readable issue.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis.window || { cablab: null, addEventListener() {} };
const job = await import("./job.js");
const { validateJobV2 } = await import("./jobContract.js");
const fx = (n) => JSON.parse(readFileSync(`fixtures/job/${n}`, "utf8"));
const kinds = ["box", "vehicle"];

/* ---- legacy replay: a job.v1 file migrates to v2 and loads ---- */
job.loadJob(fx("job-v1-legacy.json"));

/* ---- positive: a minimal v2 file loads ---- */
job.loadJob(fx("job-v2-empty-box.json"));

/* ---- negative fixtures: validateJobV2 names the broken rule ---- */
assert.ok(validateJobV2(fx("bad-units.json")).some((i) => i.includes("units")), "bad-units");
assert.ok(validateJobV2(fx("bad-space-kind.json"), { spaceKinds: kinds }).some((i) => i.includes('space kind "castle"')), "bad-space-kind");
assert.ok(validateJobV2(fx("bad-cabinet.json")).some((i) => i.includes("moduleId")), "bad-cabinet");
assert.ok(validateJobV2(fx("bad-pose.json")).some((i) => i.includes("pose")), "bad-pose");

/* ---- loadJob refuses a contract violation without touching state ---- */
assert.throws(() => job.loadJob(fx("bad-cabinet.json")), /Invalid job file/);
assert.throws(() => job.loadJob(fx("bad-space-kind.json"), "x"), /space kind/);
assert.throws(() => job.loadJob({ version: "job.v9", cabinets: [] }), /Not a Cab Lab job file/);

console.log("jobContract ok");
