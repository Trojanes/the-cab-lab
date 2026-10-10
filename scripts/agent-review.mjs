// Agent Review — independent post-run audit. Re-verifies a run dir's audit
// trail instead of trusting the harness's own verdict: scope, budget, denials,
// fresh accept re-runs and (for generator tasks) a fresh scoped bench.diff.
// A green run + a tampered transcript is a BLOCK, not a pass.
//
//   node scripts/agent-review.mjs <runDir> [--json] [--judge x.mjs]
//   node scripts/agent-run.mjs review <runDir>          (same thing)
//
// Verdict: "approved" | "needs_human" | "validation_blocked".
// Exit 0 only on approved — a review is a publish gate, not a report.
// Writes review.json + review.md into the run dir.
//
// Optional semantic layer: --judge <module.mjs> must export
//   export default async function judge(evidence) → { verdict, reasoning }
// It may only DOWNGRADE (approved → needs_human / validation_blocked) — a
// model can flag a mechanically-clean run for a human, never unblock a block.
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { verifyProposal } from "./agent-proposal.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CLI = resolve(ROOT, "cli.mjs");

const [dirArg, ...rest] = process.argv.slice(2);
const asJson = rest.includes("--json");
const judgeIdx = rest.indexOf("--judge");
const judgePath = judgeIdx >= 0 ? rest[judgeIdx + 1] : null;

if (!dirArg) { console.error("usage: agent-review.mjs <runDir> [--json] [--judge x.mjs]"); process.exit(2); }
const DIR = resolve(dirArg);

const runFile = resolve(DIR, "run.json");
if (!existsSync(runFile)) { console.error(`no run.json in ${DIR}`); process.exit(2); }
const run = JSON.parse(readFileSync(runFile, "utf8"));
const task = run.task ?? {};
const transcript = existsSync(resolve(DIR, "transcript.jsonl"))
  ? readFileSync(resolve(DIR, "transcript.jsonl"), "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l))
  : [];
const agentOps = transcript.filter((e) => e.role === "agent");
const denied = agentOps.filter((e) => e.denied);

function allowed(verb, patterns = []) {
  return patterns.some((p) => (p.endsWith(".*") ? verb.startsWith(p.slice(0, -1)) : verb === p));
}

function cli(verb, args) {
  const sessionDir = resolve(DIR, "session");
  mkdirSync(sessionDir, { recursive: true });
  const r = spawnSync("node", [CLI, verb, ...args, "--json"], {
    cwd: sessionDir, encoding: "utf8",
    env: { ...process.env, CABLAB_RUN_DIR: DIR },
  });
  try { return JSON.parse(r.stdout.trim().split("\n").pop()); }
  catch { return { ok: false, verb, error: `cli exit ${r.status}: ${(r.stderr || r.stdout || "").slice(-300)}`, code: "internal" }; }
}
const dig = (o, p) => p.split(".").reduce((x, k) => (x == null ? x : x[k]), o);

const checks = [];
const add = (id, severity, ok, detail) => checks.push({ id, severity, ok, detail });

/* ---- block: run verdict claimed PASS -------------------------------- */
add("verdict", "block", run.verdict?.pass === true, { claimed: run.verdict?.pass ?? null, state: run.state });

/* ---- block: every EXECUTED agent op was inside the verb surface ----- */
// A denied op never ran — the fence held; it shows up under "denials" (warn),
// not here. This check catches what the harness let through or what a forged
// transcript claims ran outside task.allow.
const offScope = agentOps.filter((e) => !e.denied && !allowed(e.verb, task.allow));
add("scope", "block", offScope.length === 0, {
  ops: agentOps.length, offScope: offScope.map((e) => e.verb).slice(0, 10),
});

/* ---- block: op budget held ------------------------------------------ */
const maxOps = task.budget?.maxOps ?? null;
add("budget", "block", maxOps == null || agentOps.length <= maxOps, { ops: agentOps.length, maxOps });

/* ---- warn: denied ops — probing the fence is allowed, worth a look --- */
add("denials", "warn", denied.length === 0, { count: denied.length, verbs: denied.map((e) => e.verb).slice(0, 10) });

/* ---- warn: vacuous pass — zero agent ops yet the task claims PASS ---- */
add("vacuous", "warn", !(agentOps.length === 0 && (task.accept ?? []).length > 0 && run.verdict?.pass === true), { ops: agentOps.length });

/* ---- block: declared preconditions were actually verified ----------- */
// A bug task's premise is "the fixture is broken". If the task declares
// preconditions, the transcript must carry them all green — otherwise the
// red→green arc was never established and the pass is unverifiable.
if (Array.isArray(task.precondition) && task.precondition.length) {
  const logged = transcript.filter((e) => e.role === "precondition");
  const held = logged.filter((e) => e.ok === true).length;
  add("precondition", "block", logged.length === task.precondition.length && held === task.precondition.length, {
    declared: task.precondition.length, logged: logged.length, held,
  });
}

/* ---- block: accept assertions re-run NOW ---------------------------- */
const acceptResults = [];
for (const c of task.accept ?? []) {
  const { verb, args = [], expect = "ok" } = typeof c === "string" ? { verb: c } : c;
  const r = cli(verb, args);
  let ok, got;
  if (expect === "diff.scope") {
    const scope = (c.scope ?? []).map((s) => new RegExp(s));
    const changes = r.effect?.changes ?? [];
    const outside = changes.filter((ch) => !scope.some((re) => re.test(ch.path)));
    ok = r.ok && scope.length > 0 && outside.length === 0 && (!c.mustChange || changes.length > 0);
    got = { changes: changes.length, outside: outside.map((d) => d.path).slice(0, 10) };
  } else { got = dig(r, expect); ok = !!got; }
  acceptResults.push({ verb, expect, ok, value: got });
}
add("accept", "block", acceptResults.every((r) => r.ok), { failed: acceptResults.filter((r) => !r.ok).map((r) => r.verb) });

/* ---- block: generator task → fresh scoped diff ---------------------- */
if (task.generator) {
  const scopeRes = (task.accept ?? [])
    .filter((c) => typeof c === "object" && c.expect === "diff.scope")
    .flatMap((c) => c.scope ?? []);
  // A proposal task declares its drift surface in proposal.scope — the
  // proposal.scoped gate is the equivalent check; no double-warn.
  if (!scopeRes.length && !task.proposal) {
    add("diff.scope", "warn", false, { why: "generator task has no declared diff.scope — drift unbounded" });
  } else if (!scopeRes.length) { /* proposal.scoped covers it */ } else {
    const scope = scopeRes.map((s) => new RegExp(s));
    const r = cli("bench.diff", ["--moduleId", task.generator]);
    const changes = r.effect?.changes ?? [];
    const outside = changes.filter((ch) => !scope.some((re) => re.test(ch.path)));
    add("diff.scope", "block", r.ok && outside.length === 0, {
      changes: changes.length, outside: outside.map((d) => d.path).slice(0, 10),
    });
  }
}

/* ---- block: declared generator intent held -------------------------- */
// A proposal task must end where it said it would: declared rules landed,
// no stale mental model, drift stayed inside scope and budget — re-verified
// live, not from run.json's cached proposal results.
if (task.proposal) {
  const readRules = (moduleId) => {
    const r = cli("bench.rules.read", ["--moduleId", moduleId]);
    return r.ok ? r.effect.data : null;
  };
  const runDiff = () => {
    const r = cli("bench.diff", ["--moduleId", task.generator]);
    return r.effect ?? { changes: [] };
  };
  for (const c of verifyProposal({ task, proposalBase: run.proposalBase ?? {}, readRules, runDiff }))
    checks.push(c);
}

/* ---- block: declared write surface ⊆ repo dirty set (optional) ------ */
if (Array.isArray(task.writes) && task.writes.length) {
  const res = spawnSync("git", ["status", "--porcelain"], { cwd: ROOT, encoding: "utf8" });
  if (res.status === 0) {
    const allowRe = task.writes.map((s) => new RegExp(s));
    const dirty = res.stdout.split(/\r?\n/).filter(Boolean).map((l) => l.slice(3));
    const exempt = (p) => p.startsWith("logs/") || p.startsWith(".cablab-session");
    const outside = dirty.filter((p) => !exempt(p) && !allowRe.some((re) => re.test(p)));
    add("files", "block", outside.length === 0, { dirty: dirty.length, outside: outside.slice(0, 10) });
  }
}

/* ---- verdict -------------------------------------------------------- */
let verdict = checks.some((c) => c.severity === "block" && !c.ok) ? "validation_blocked"
  : checks.some((c) => c.severity === "warn" && !c.ok) ? "needs_human"
  : "approved";

/* ---- judge seam (external semantic layer; downgrade only) ----------- */
let judged = null;
if (judgePath) {
  try {
    const mod = await import(resolve(judgePath));
    const evidence = { task, checks, verdict, transcript: agentOps.map((e) => ({ i: e.i, verb: e.verb, ok: e.ok, denied: e.denied })) };
    const j = await mod.default(evidence);
    if (j && typeof j === "object") {
      judged = { verdict: j.verdict, reasoning: j.reasoning ?? null };
      if (verdict === "approved" && (j.verdict === "needs_human" || j.verdict === "validation_blocked")) verdict = j.verdict;
      else if (verdict === "needs_human" && j.verdict === "validation_blocked") verdict = j.verdict;
    }
  } catch (e) {
    checks.push({ id: "judge", severity: "warn", ok: false, detail: { error: e.message } });
    if (verdict === "approved") verdict = "needs_human";
  }
}

const report = {
  runId: run.task?.id ?? "?",
  state: run.state,
  verdict,
  reviewedAt: new Date().toISOString(),
  ops: agentOps.length,
  checks,
  ...(judged ? { judge: judged } : {}),
};
writeFileSync(resolve(DIR, "review.json"), JSON.stringify(report, null, 2));
writeFileSync(resolve(DIR, "review.md"), [
  `# agent review ${report.runId}`, "",
  `- goal: ${task.goal ?? "?"}`,
  `- run verdict: ${run.verdict?.pass ? "PASS" : "FAIL"} · ops: ${agentOps.length}`,
  `- review verdict: **${verdict}**`, "",
  ...checks.map((c) => `- ${c.ok ? "PASS" : c.severity === "block" ? "BLOCK" : "WARN"} \`${c.id}\` ${JSON.stringify(c.detail)}`),
  ...(judged ? ["", `judge: ${judged.verdict} — ${judged.reasoning ?? ""}`] : []), "",
].join("\n"));

console.log(JSON.stringify(report));
process.exit(verdict === "approved" ? 0 : 1);
