// Agent run harness — drives a task file through the verb surface with scope
// enforcement, a budget, an audit transcript, and a scripted verdict.
// The driving model (a human, Devin, another LLM) only ever touches this
// script; it never calls cli.mjs directly during a task run.
//
//   node scripts/agent-run.mjs start  <task.json>            → creates the run dir, runs setup
//   node scripts/agent-run.mjs exec   <runDir> <verb> [args…] → scope+budget check, run, log, print receipt
//   node scripts/agent-run.mjs finish <runDir>               → runs accept checks, writes verdict, exit 0/1
//   node scripts/agent-run.mjs status <runDir>               → summary
//
// Task file (agent/tasks/*.task.json):
// {
//   "id": "fix-overlap",
//   "goal": "human-readable objective",
//   "input": "fixtures/job/x.json",          // opened as the session job at start (optional)
//   "allow": ["describe","validate","cabinet.*","history.*"],  // verb prefixes; unlisted verbs are denied
//   "accept": [ {"verb":"validate","expect":"effect.ok"}, {"verb":"file.export-cnjob"} ],
//   "budget": { "maxOps": 30 }
// }
//
// Run dir: logs/agent/<id>-<ts>/ holds session/ (cwd → own .cablab-session.json),
// transcript.jsonl (one line per op incl. denied), run.json (task + verdict).
import { readFileSync, writeFileSync, mkdirSync, appendFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = dirname(fileURLToPath(import.meta.url));
const CLI = resolve(ROOT, "..", "cli.mjs");
const AGENT_DIR = resolve(ROOT, "..", "logs", "agent");

const [cmd, a1, ...rest] = process.argv.slice(2);

function loadRun(dir) {
  const f = resolve(dir, "run.json");
  if (!existsSync(f)) { console.error(`no run.json in ${dir}`); process.exit(2); }
  return { dir, run: JSON.parse(readFileSync(f, "utf8")), file: f };
}
function saveRun({ run, file }) { writeFileSync(file, JSON.stringify(run, null, 2)); }
function dig(obj, path) { return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj); }

function allowed(verb, patterns) {
  return patterns.some((p) => (p.endsWith(".*") ? verb.startsWith(p.slice(0, -1)) : verb === p));
}

function cli(runDir, verb, args, dryRun) {
  const sessionDir = resolve(runDir, "session");
  mkdirSync(sessionDir, { recursive: true });
  const argv = [CLI, verb, ...args, "--json"];
  if (dryRun) argv.push("--dry-run");
  const r = spawnSync("node", argv, { cwd: sessionDir, encoding: "utf8" });
  try { return JSON.parse(r.stdout.trim().split("\n").pop()); }
  catch { return { ok: false, verb, error: `cli exit ${r.status}: ${(r.stderr || r.stdout || "").slice(-300)}`, code: "internal" }; }
}

function logOp(runDir, entry) {
  appendFileSync(resolve(runDir, "transcript.jsonl"), JSON.stringify(entry) + "\n");
}

/* ------------------------------------------------------------------ */

if (cmd === "start") {
  const task = JSON.parse(readFileSync(resolve(a1), "utf8"));
  for (const k of ["id", "goal", "allow", "accept"]) if (!task[k]) { console.error(`task needs ${k}`); process.exit(2); }
  const id = `${task.id}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const dir = resolve(AGENT_DIR, id);
  mkdirSync(dir, { recursive: true });
  const run = { task, state: "open", ops: 0, startedAt: new Date().toISOString() };
  writeFileSync(resolve(dir, "run.json"), JSON.stringify(run, null, 2));
  logOp(dir, { i: 0, role: "task", goal: task.goal, allow: task.allow });
  if (task.input) {
    const r = cli(dir, "file.open", ["--path", resolve(ROOT, "..", task.input)]);
    logOp(dir, { i: 1, role: "setup", verb: "file.open", args: { path: task.input }, ok: r.ok });
    run.ops = 1;
    if (!r.ok) { console.log(JSON.stringify(r)); saveRun({ run, file: resolve(dir, "run.json") }); process.exit(1); }
  }
  saveRun({ run, file: resolve(dir, "run.json") });
  console.log(`run dir: ${dir}`);
  console.log(`allowed verbs: ${task.allow.join(" ")}`);
  console.log(`accept: ${task.accept.map((c) => (typeof c === "string" ? c : c.verb)).join(", ")}`);
  console.log(`drive it: node scripts/agent-run.mjs exec "${dir}" <verb> [args…]   then  finish`);
}

else if (cmd === "exec") {
  const [verb, ...args] = rest;
  const ctx = loadRun(a1);
  const { run } = ctx;
  if (run.state !== "open") { console.log(JSON.stringify({ ok: false, error: `run is ${run.state}`, code: "internal" })); process.exit(1); }
  run.ops++;
  const i = run.ops;
  if (!allowed(verb, run.task.allow)) {
    const r = { ok: false, verb, error: `verb not in task allow list`, code: "scope_denied" };
    logOp(a1, { i, role: "agent", verb, args, denied: true });
    saveRun(ctx); console.log(JSON.stringify(r)); process.exit(1);
  }
  if (run.task.budget?.maxOps && i > run.task.budget.maxOps) {
    const r = { ok: false, verb, error: `budget exceeded (maxOps ${run.task.budget.maxOps})`, code: "budget" };
    logOp(a1, { i, role: "agent", verb, args, denied: true, why: "budget" });
    saveRun(ctx); console.log(JSON.stringify(r)); process.exit(1);
  }
  const dryRun = args.includes("--dry-run");
  const cleanArgs = args.filter((a) => a !== "--dry-run");
  const t0 = Date.now();
  const r = cli(a1, verb, cleanArgs, dryRun);
  logOp(a1, { i, role: "agent", verb, args: cleanArgs, dryRun, ok: r.ok, code: r.code, ms: Date.now() - t0 });
  saveRun(ctx);
  console.log(JSON.stringify(r));
  if (!r.ok) process.exit(1);
}

else if (cmd === "finish") {
  const ctx = loadRun(a1);
  const { run } = ctx;
  const results = [];
  let pass = true;
  for (const c of run.task.accept) {
    const { verb, args = [], expect = "ok" } = typeof c === "string" ? { verb: c } : c;
    const r = cli(a1, verb, args);
    const got = dig(r, expect);
    const ok = !!got;
    results.push({ verb, expect, ok, value: got });
    logOp(a1, { i: ++run.ops, role: "accept", verb, args, ok, expect, value: got });
    if (!ok) pass = false;
  }
  run.state = pass ? "passed" : "failed";
  run.finishedAt = new Date().toISOString();
  run.verdict = { pass, checks: results };
  saveRun(ctx);
  writeFileSync(resolve(a1, "report.md"), [
    `# agent run ${run.task.id}`, "",
    `- goal: ${run.task.goal}`,
    `- ops: ${run.ops} (budget ${run.task.budget?.maxOps ?? "—"})`,
    `- verdict: **${pass ? "PASS" : "FAIL"}**`, "",
    ...results.map((r) => `- ${r.ok ? "PASS" : "FAIL"} \`${r.verb}\` → \`${r.expect}\` = ${JSON.stringify(r.value)}`),
    "",
  ].join("\n"));
  console.log(JSON.stringify(run.verdict));
  process.exit(pass ? 0 : 1);
}

else if (cmd === "status") {
  const { run } = loadRun(a1);
  console.log(JSON.stringify({ state: run.state, ops: run.ops, verdict: run.verdict ?? null }));
}

else {
  console.error("usage: agent-run.mjs start|exec|finish|status …");
  process.exit(2);
}
