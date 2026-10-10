// Self-test for scripts/agent-review.mjs — the review verdict matrix is
// regression-pinned: a clean run approves, denials/vacuous flag for a human,
// and a tampered transcript or a failed verdict blocks — even when run.json
// itself claims PASS. Spawns the real harness + reviewer as subprocesses.
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUN = resolve(ROOT, "scripts", "agent-run.mjs");
const REVIEW = resolve(ROOT, "scripts", "agent-review.mjs");
const t = mkdtempSync(join(tmpdir(), "agent-review-test-"));
const go = (bin, args) => spawnSync("node", [bin, ...args], { cwd: ROOT, encoding: "utf8" });
let bad = 0;
const ok = (cond, name) => { console.log(`${cond ? "ok" : "FAIL"} ${name}`); if (!cond) bad++; };
const runDirOf = (out) => out.match(/run dir: (.*)/)[1].trim();
const verdictOf = (out) => JSON.parse(out.trim().split("\n").pop()).verdict;
const mkTask = (name, task) => { const p = join(t, name); writeFileSync(p, JSON.stringify(task)); return p; };
// run + finish in one go; returns the run dir
const execFinish = (dir, ops = []) => {
  for (const [verb, ...args] of ops) go(RUN, ["exec", dir, verb, ...args]);
  go(RUN, ["finish", dir]);
  return dir;
};

/* --- A: clean passed run → approved ----------------------------------- */
const dirA = runDirOf(go(RUN, ["start", mkTask("a.json", {
  id: "rv-pass", goal: "smoke", allow: ["describe"], accept: [{ verb: "describe" }],
})]).stdout);
execFinish(dirA, [["describe"]]);
let r = go(REVIEW, [dirA]);
ok(r.status === 0 && verdictOf(r.stdout) === "approved", "clean run → approved");
ok(existsSync(join(dirA, "review.json")) && existsSync(join(dirA, "review.md")), "review.json + review.md written");

/* --- B: denied op in transcript → needs_human ------------------------- */
const dirB = runDirOf(go(RUN, ["start", mkTask("b.json", {
  id: "rv-denied", goal: "smoke", allow: ["describe"], accept: [{ verb: "describe" }],
})]).stdout);
go(RUN, ["exec", dirB, "bench.rules.set", "--moduleId", "x", "--name", "y", "--value", "1"]); // denied
execFinish(dirB, [["describe"]]);
r = go(REVIEW, [dirB]);
ok(r.status === 1 && verdictOf(r.stdout) === "needs_human", "denied op → needs_human");

/* --- C: transcript tampered post-run → validation_blocked ------------- */
const dirC = runDirOf(go(RUN, ["start", mkTask("c.json", {
  id: "rv-tamper", goal: "smoke", allow: ["describe"], accept: [{ verb: "describe" }],
})]).stdout);
execFinish(dirC, [["describe"]]);
appendFileSync(join(dirC, "transcript.jsonl"), JSON.stringify({ i: 9, role: "agent", verb: "bench.presets.repin", ok: true }) + "\n");
r = go(REVIEW, [dirC]);
ok(r.status === 1 && verdictOf(r.stdout) === "validation_blocked", "forged transcript → validation_blocked");

/* --- D: failed run verdict → validation_blocked ----------------------- */
const dirD = runDirOf(go(RUN, ["start", mkTask("d.json", {
  id: "rv-fail", goal: "fail", allow: ["describe"], accept: [{ verb: "describe", expect: "effect.nonexistent" }],
})]).stdout);
go(RUN, ["finish", dirD]);
r = go(REVIEW, [dirD]);
ok(r.status === 1 && verdictOf(r.stdout) === "validation_blocked", "failed run → validation_blocked");

/* --- E: vacuous pass (0 agent ops) → needs_human ---------------------- */
const dirE = runDirOf(go(RUN, ["start", mkTask("e.json", {
  id: "rv-vacuous", goal: "noop", allow: ["describe"], accept: [{ verb: "describe" }],
})]).stdout);
go(RUN, ["finish", dirE]); // accept passes, agent never acted
r = go(REVIEW, [dirE]);
ok(r.status === 1 && verdictOf(r.stdout) === "needs_human", "vacuous pass → needs_human");

/* --- F: generator task, diff inside scope → approved ------------------ */
const dirF = runDirOf(go(RUN, ["start", mkTask("f.json", {
  id: "rv-gen", goal: "gen", generator: "kitchenCabinet", allow: ["bench.diff"],
  accept: [{ verb: "bench.diff", args: ["--moduleId", "kitchenCabinet"], expect: "diff.scope", scope: ["^kitchen-base\\."] }],
})]).stdout);
go(RUN, ["exec", dirF, "bench.diff", "--moduleId", "kitchenCabinet"]);
go(RUN, ["finish", dirF]);
r = go(REVIEW, [dirF]);
ok(r.status === 0 && verdictOf(r.stdout) === "approved", "generator clean diff → approved");

/* --- G: hand-built run, drift outside declared scope → blocked -------- */
const dirG = join(t, "g-run");
spawnSync("node", ["-e", `require("fs").mkdirSync(process.argv[1],{recursive:true})`, dirG]);
writeFileSync(join(dirG, "run.json"), JSON.stringify({
  state: "passed", verdict: { pass: true },
  task: { id: "rv-drift", goal: "gen", generator: "kitchenCabinet", allow: ["bench.diff"],
    accept: [{ verb: "bench.diff", args: ["--moduleId", "kitchenCabinet"], expect: "diff.scope", scope: ["^kitchen-base\\.B3\\."] }] },
}));
writeFileSync(join(dirG, "transcript.jsonl"), JSON.stringify({ i: 1, role: "agent", verb: "bench.diff", ok: true }) + "\n");
// a drift the declared scope does not cover: ZZZ.x0 existed at baseline, now gone
writeFileSync(join(dirG, "baseline.json"), JSON.stringify({ "kitchen-base": { "ZZZ.x0": 42 } }));
r = go(REVIEW, [dirG]);
ok(r.status === 1 && verdictOf(r.stdout) === "validation_blocked", "out-of-scope drift → validation_blocked");

/* --- H: --judge seam — downgrades approved, never upgrades a block ---- */
const judgeNh = join(t, "judge-nh.mjs");
writeFileSync(judgeNh, `export default async (e) => ({ verdict: "needs_human", reasoning: "model flagged" });\n`);
r = go(REVIEW, [dirA, "--judge", judgeNh]);
ok(r.status === 1 && verdictOf(r.stdout) === "needs_human", "judge downgrades approved → needs_human");
const judgeUp = join(t, "judge-up.mjs");
writeFileSync(judgeUp, `export default async (e) => ({ verdict: "approved", reasoning: "model approves" });\n`);
r = go(REVIEW, [dirC, "--judge", judgeUp]);
ok(r.status === 1 && verdictOf(r.stdout) === "validation_blocked", "judge cannot upgrade a block");

/* --- I: agent-run passthrough ------------------------------------------ */
r = go(RUN, ["review", dirF]);
ok(r.status === 0, "agent-run review passthrough works");

/* --- J: proposal unapplied (declared to≠live) → blocked ------------------ */
const mkRun = (name, task, extra = {}) => {
  const d = join(t, name);
  spawnSync("node", ["-e", `require("fs").mkdirSync(process.argv[1],{recursive:true})`, d]);
  writeFileSync(join(d, "run.json"), JSON.stringify({ state: "passed", verdict: { pass: true }, task, ...extra }));
  writeFileSync(join(d, "transcript.jsonl"), JSON.stringify({ i: 1, role: "agent", verb: "bench.diff", ok: true }) + "\n");
  return d;
};
const dirJ = mkRun("j-run", {
  id: "rv-prop", goal: "gen", generator: "kitchenCabinet", allow: ["bench.diff"],
  proposal: {
    changes: [{ surface: "rules", name: "SUPPORT_STRIP_WIDTH", from: 100, to: 95, reason: "x" }],
    scope: ["^kitchen-base\\."],
  },
  accept: [],
}, { proposalBase: { SUPPORT_STRIP_WIDTH: 100 } });
r = go(REVIEW, [dirJ]);
ok(r.status === 1 && verdictOf(r.stdout) === "validation_blocked", "unapplied proposal → validation_blocked");

/* --- K: satisfied proposal → approved ------------------------------------ */
const dirK = mkRun("k-run", {
  id: "rv-prop-ok", goal: "gen", generator: "kitchenCabinet", allow: ["bench.diff"],
  proposal: {
    changes: [{ surface: "rules", name: "SUPPORT_STRIP_WIDTH", from: 100, to: 100, reason: "x" }],
    scope: ["^kitchen-base\\."], maxChanges: 5,
  },
  accept: [],
}, { proposalBase: { SUPPORT_STRIP_WIDTH: 100 } });
r = go(REVIEW, [dirK]);
ok(r.status === 0 && verdictOf(r.stdout) === "approved", "satisfied proposal → approved");

console.log(bad ? `${bad} FAILED` : "all ok");
process.exit(bad ? 1 : 0);
