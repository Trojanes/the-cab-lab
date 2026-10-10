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

// --- task F: proposal gate — undeclared rule denied at exec ---------------
const taskF = join(t, "f.task.json");
writeFileSync(taskF, JSON.stringify({
  id: "t-prop-gate", goal: "gen", generator: "kitchenCabinet",
  allow: ["bench.rules.set", "bench.diff"],
  proposal: {
    changes: [{ surface: "rules", name: "SUPPORT_STRIP_WIDTH", from: 100, to: 95, reason: "test" }],
    scope: ["^kitchen-base\\."],
  },
  accept: [{ verb: "bench.diff", args: ["--moduleId", "kitchenCabinet"] }],
}));
const dirF = runDirOf(go(["start", taskF]).stdout);
ok(existsSync(join(dirF, "run.json")) && JSON.parse(readFileSync(join(dirF, "run.json"), "utf8")).proposalBase?.SUPPORT_STRIP_WIDTH === 100,
  "proposal task captures rule base values at start");
r = go(["exec", dirF, "bench.rules.set", "--moduleId", "kitchenCabinet", "--name", "OTHER_RULE", "--value", "1"]);
ok(r.status === 1 && JSON.parse(r.stdout).code === "scope_denied", "undeclared rule denied at exec");
r = go(["finish", dirF]);
ok(r.status === 1 && r.stdout.includes("proposal.applied"), "unapplied declared change fails finish");

// --- task G: stale `from` → proposal.stale blocks ---------------------------
const taskG = join(t, "g.task.json");
writeFileSync(taskG, JSON.stringify({
  id: "t-prop-stale", goal: "gen", generator: "kitchenCabinet",
  allow: ["bench.diff"],
  proposal: {
    changes: [{ surface: "rules", name: "SUPPORT_STRIP_WIDTH", from: 999, to: 100, reason: "test" }],
    scope: ["^kitchen-base\\."],
  },
  accept: [],
}));
const dirG = runDirOf(go(["start", taskG]).stdout);
r = go(["finish", dirG]);
ok(r.status === 1 && r.stdout.includes("proposal.stale"), "stale from blocks the run");

// --- task H: satisfied proposal (identity change) → PASS -------------------
const taskH = join(t, "h.task.json");
writeFileSync(taskH, JSON.stringify({
  id: "t-prop-pass", goal: "gen", generator: "kitchenCabinet",
  allow: ["bench.diff"],
  proposal: {
    changes: [{ surface: "rules", name: "SUPPORT_STRIP_WIDTH", from: 100, to: 100, reason: "test" }],
    scope: ["^kitchen-base\\."], maxChanges: 5,
  },
  accept: [],
}));
const dirH = runDirOf(go(["start", taskH]).stdout);
go(["exec", dirH, "bench.diff", "--moduleId", "kitchenCabinet"]);
r = go(["finish", dirH]);
ok(r.status === 0 && JSON.parse(r.stdout).pass === true, "satisfied proposal passes finish");

// --- task I: layout.write gated when no layout change declared -------------
const taskI = join(t, "i.task.json");
writeFileSync(taskI, JSON.stringify({
  id: "t-prop-layout", goal: "gen", generator: "kitchenCabinet",
  allow: ["bench.layout.write"],
  proposal: {
    changes: [{ surface: "rules", name: "SUPPORT_STRIP_WIDTH", from: 100, to: 95, reason: "test" }],
    scope: ["^kitchen-base\\."],
  },
  accept: [],
}));
const dirI = runDirOf(go(["start", taskI]).stdout);
r = go(["exec", dirI, "bench.layout.write", "--moduleId", "kitchenCabinet", "--data", "{}"]);
ok(r.status === 1 && JSON.parse(r.stdout).code === "scope_denied", "layout.write denied without declared layout change");

// --- task J: bug task — precondition verifies red, repair flips green ------
const taskJ = join(t, "j.task.json");
writeFileSync(taskJ, JSON.stringify({
  id: "t-bug", goal: "red→green", input: "fixtures/job/case-overlap.json",
  allow: ["validate", "cabinet.move"],
  precondition: [{ verb: "validate", expect: "effect.ok", negate: true }],
  accept: [{ verb: "validate", expect: "effect.ok" }],
}));
const dirJ = runDirOf(go(["start", taskJ]).stdout);
ok(readFileSync(join(dirJ, "transcript.jsonl"), "utf8").includes('"role":"precondition"'), "precondition logged at start");
r = go(["exec", dirJ, "cabinet.move", "--id", "cab-2", "--x", "2500"]);
ok(r.status === 0, "repair op executes inside scope");
r = go(["finish", dirJ]);
ok(r.status === 0 && JSON.parse(r.stdout).pass === true, "red→green arc passes after the repair");

// --- task K: green fixture under a bug task → start aborts as malformed -----
const taskK = join(t, "k.task.json");
writeFileSync(taskK, JSON.stringify({
  id: "t-bug-green", goal: "fixture already green", input: "fixtures/job/job-v2-empty-box.json",
  allow: ["validate"],
  precondition: [{ verb: "validate", expect: "effect.ok", negate: true }],
  accept: [{ verb: "validate" }],
}));
r = go(["start", taskK]);
ok(r.status === 1 && JSON.parse(r.stdout).code === "precondition", "green fixture aborts a red→green task at start");

// --- check: task-file lint ---------------------------------------------------
r = go(["check", taskA]);
ok(r.status === 0 && JSON.parse(r.stdout).ok === true, "check accepts a well-formed task");
const taskBad = join(t, "bad.task.json");
writeFileSync(taskBad, JSON.stringify({ id: "x", allow: ["describe"], accept: [], input: "nope.json" }));
r = go(["check", taskBad]);
ok(r.status === 1 && JSON.parse(r.stdout).errors.length >= 3, "check flags missing goal/accept/input");
// every shipped task file must lint clean — the catalogue is regression-pinned
import { readdirSync } from "node:fs";
for (const f of readdirSync(join(ROOT, "agent", "tasks")).filter((f) => f.endsWith(".task.json"))) {
  r = go(["check", join(ROOT, "agent", "tasks", f)]);
  ok(r.status === 0, `check agent/tasks/${f}`);
}

// --- shipped bug tasks: the full red→green arc through the real harness ------
// start verifies each fixture is actually broken (precondition), the scripted
// repair runs through the scoped verb surface, finish must PASS. A fixture
// that silently stops being broken fails the task at start — the catalogue
// can never rot into vacuous passes.
const bugRepairs = {
  "fix-overlap":     [["cabinet.move", "--id", "cab-2", "--x", "2500"]],
  "fix-cab-overlap": [["cabinet.move", "--id", "cab-2", "--x", "2000"]],
  "fix-wall-overlap":[["cabinet.move", "--id", "cab-2", "--y", "1600"]],
  "fix-zone-height": [["zone.set-height", "--id", "cab-2", "--zone", "zone-2", "--height", "200"]],
};
for (const [id, ops] of Object.entries(bugRepairs)) {
  const d = runDirOf(go(["start", join(ROOT, "agent", "tasks", `${id}.task.json`)]).stdout);
  let passed = true;
  for (const [verb, ...args] of ops) if (go(["exec", d, verb, ...args]).status !== 0) passed = false;
  r = go(["finish", d]);
  ok(passed && r.status === 0 && JSON.parse(r.stdout).pass === true, `bug task ${id}: red fixture repaired to green`);
}

console.log(bad ? `${bad} FAILED` : "all ok");
process.exit(bad ? 1 : 0);
