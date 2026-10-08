/**
 * The post-change gate. Every AI/dev change ends with one of:
 *
 *   node scripts/verify.mjs --quick   deps+map+job+app contract   (~15 s)
 *   node scripts/verify.mjs           all renderer suites + audit  (~1–2 min)
 *   node scripts/verify.mjs --ci      + generators (CI: no Electron / no sibling repo)
 *   node scripts/verify.mjs --full    + generators + replay + E2E  (~4 min)
 *
 * Which tier the change owes (rule: cab-lab-dev-loop.mdc):
 *   docs/rules/scripts edits        → --quick
 *   renderer/panel or interact      → default
 *   generators/*, cnjob, job.js     → --full (golden drift needs --regen review)
 *
 * Runs every step even after a failure, prints one line per step, exits 1
 * if anything failed — the tail of the first failure is shown for context.
 */
import { spawnSync } from "node:child_process";
import { argv } from "node:process";

const quick = process.argv.includes("--quick");
const full = process.argv.includes("--full");
const ci = process.argv.includes("--ci");

const STEPS = [
  ["check:deps", "layering / import direction"],
  ["check:map", "module map not stale"],
  ["test:job", "job.json contract"],
  ["test:app", "app API headless flow"],
  ...(quick ? [] : [
    ["test:pose", "pose math"],
    ["test:grab", "grab/extrude"],
    ["test:resize", "resize faces"],
    ["test:fridge", "tall fridge editor math"],
    ["test:groove", "user grooves"],
    ["test:selection", "selection model"],
    ["test:step", "STEP export lib"],
    ["test:measure", "measure tool"],
    ["test:swatches", "door colour slots"],
    ["test:walls", "partition walls"],
    ["test:wheelarch", "wheel arch avoidance"],
    ["test:bench", "generator-rules bench"],
    ["test:sketch", "board sketch geometry"],
    ["test:commands", "command registry"],
    ["audit", "geometry audit (known-bad allowed)"],
  ]),
  ...(full || ci ? [
    ["test:generators", "generator golden/pin suite"],
    // test:replay needs the sibling OmniCam repo + dotnet — local/CI-gated via --full only.
    ...(full ? [["test:replay", "cross-repo cnjob replay"]] : []),
  ] : []),
];

let failed = null;
const t0 = Date.now();
for (const [script, what] of STEPS) {
  const r = spawnSync("npm", ["run", script, "--silent"], { encoding: "utf8", shell: true });
  const ok = r.status === 0;
  console.log(`${ok ? "PASS" : "FAIL"}  ${script.padEnd(18)} ${what}`);
  if (!ok && !failed) {
    failed = script;
    const tail = (r.stderr + r.stdout).trim().split("\n").slice(-12).join("\n");
    console.log(`─── ${script} tail ───\n${tail}\n──────`);
  }
}
if (full && !failed) {
  const r = spawnSync("node", ["scripts/e2e-drive.mjs"], { encoding: "utf8", shell: false, timeout: 300000 });
  const ok = r.status === 0 && /all passed/.test(r.stdout || "");
  console.log(`${ok ? "PASS" : "FAIL"}  ${"e2e-drive".padEnd(18)} real-app pointer/keyboard flow`);
  if (!ok) { failed = "e2e-drive"; console.log((r.stdout + r.stderr).split("\n").slice(-15).join("\n")); }
}
console.log(`\n${failed ? `FAILED at ${failed}` : "all green"} (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
process.exit(failed ? 1 : 0);
