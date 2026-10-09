// Self-test for scripts/agent-run.mjs — the scope gate, budget, audit
// transcript and verdict are themselves regression-pinned here.
// Runs in a temp dir; spawns the runner as a subprocess like a real driver.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUN = resolve(ROOT, "scripts", "agent-run.mjs");
const t = mkdtempSync(join(tmpdir(), "agent-run-test-"));
const go = (args) => spawnSync("node", [RUN, ...args], { cwd: ROOT, encoding: "utf8" });
let bad = 0;
const ok = (cond, name) => { console.log(`${cond ? "ok" : "FAIL"} ${name}`); if (!cond) bad++; };
const runDirOf = (out) => out.match(/run dir: (.*)/)[1].trim();

// --- task A: happy path + scope denial ------------------------------------
const taskA = join(t, "a.task.json");
writeFileSync(taskA, JSON.stringify({
  id: "t-pass", goal: "smoke", allow: ["describe"],
  accept: [{ verb: "describe" }], budget: { maxOps: 5 },
}));
let r = go(["start", taskA]);
ok(r.status === 0 && r.stdout.includes("run dir:"), "start creates run dir");
const dirA = runDirOf(r.stdout);

r = go(["exec", dirA, "bench.rules.set", "--moduleId", "x", "--name", "y", "--value", "1"]);
ok(r.status === 1 && JSON.parse(r.stdout).code === "scope_denied", "disallowed verb denied");

r = go(["exec", dirA, "describe"]);
ok(r.status === 0 && JSON.parse(r.stdout).ok === true, "allowed verb executes");

r = go(["finish", dirA]);
ok(r.status === 0 && JSON.parse(r.stdout).pass === true, "finish verdict PASS");
ok(readFileSync(join(dirA, "transcript.jsonl"), "utf8").includes('"denied":true'), "transcript records the denial");
ok(existsSync(join(dirA, "report.md")), "report.md written");

r = go(["exec", dirA, "describe"]);
ok(r.status === 1 && JSON.parse(r.stdout).error.includes("passed"), "closed run rejects further ops");

// --- task B: unmet accept → FAIL verdict -----------------------------------
const taskB = join(t, "b.task.json");
writeFileSync(taskB, JSON.stringify({
  id: "t-fail", goal: "must fail", allow: ["describe"],
  accept: [{ verb: "describe", expect: "effect.nonexistent" }],
}));
const dirB = runDirOf(go(["start", taskB]).stdout);
r = go(["finish", dirB]);
ok(r.status === 1 && JSON.parse(r.stdout).pass === false, "unmet accept → FAIL verdict");

// --- task C: budget ---------------------------------------------------------
const taskC = join(t, "c.task.json");
writeFileSync(taskC, JSON.stringify({
  id: "t-budget", goal: "budget", allow: ["describe"], accept: [], budget: { maxOps: 1 },
}));
const dirC = runDirOf(go(["start", taskC]).stdout);
go(["exec", dirC, "describe"]);
r = go(["exec", dirC, "describe"]);
ok(r.status === 1 && JSON.parse(r.stdout).code === "budget", "maxOps enforced");

// --- task D: generator task — baseline at start + diff.scope accept ---------
const taskD = join(t, "d.task.json");
writeFileSync(taskD, JSON.stringify({
  id: "t-gen", goal: "gen", generator: "kitchenCabinet",
  allow: ["bench.diff"],
  accept: [{ verb: "bench.diff", args: ["--moduleId", "kitchenCabinet"], expect: "diff.scope", scope: ["^kitchen-base\\."] }],
}));
const dirD = runDirOf(go(["start", taskD]).stdout);
ok(existsSync(join(dirD, "baseline.json")), "generator task captures pin baseline at start");
r = go(["finish", dirD]);
ok(r.status === 0 && JSON.parse(r.stdout).pass === true, "diff.scope passes on an untouched generator");

// --- task E: diff.scope + mustChange fails on a no-op -----------------------
const taskE = join(t, "e.task.json");
writeFileSync(taskE, JSON.stringify({
  id: "t-noop", goal: "noop", generator: "kitchenCabinet", allow: ["bench.diff"],
  accept: [{ verb: "bench.diff", args: ["--moduleId", "kitchenCabinet"], expect: "diff.scope", mustChange: true, scope: ["^kitchen-base\\."] }],
}));
const dirE = runDirOf(go(["start", taskE]).stdout);
r = go(["finish", dirE]);
ok(r.status === 1 && JSON.parse(r.stdout).pass === false, "mustChange rejects an empty diff");

console.log(bad ? `${bad} FAILED` : "all ok");
process.exit(bad ? 1 : 0);
