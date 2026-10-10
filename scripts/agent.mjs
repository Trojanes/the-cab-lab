// agent.mjs — 一键入口：不用记 run dir、不用打长命令。
//
//   npm run agent                        列出全部任务
//   npm run agent -- fix-overlap         交互模式：进入会话，直接敲动词
//   npm run agent -- fix-overlap --demo  自动演示：红 → 修 → 绿 → 复核，一步到位
//   npm run agent -- ls                  列出历史 run
//   npm run agent -- review [runDir]     复核最近一次（或指定）run
//
// 交互模式内命令：动词原样敲（如 `cabinet.move --id cab-2 --x 2500`）、
// `fix`=跑该任务的内置修复、`finish`=验收+复核、`status`、`ls`、`help`、`quit`
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const RUN = resolve(ROOT, "scripts", "agent-run.mjs");
const TASKS_DIR = resolve(ROOT, "agent", "tasks");
const LOGS = resolve(ROOT, "logs", "agent");

// 每个任务的「标准答案」——和 test:agent 里钉死的修复一致
const CANNED_FIX = {
  "fix-overlap":      [["cabinet.move", "--id", "cab-2", "--x", "2500"]],
  "fix-cab-overlap":  [["cabinet.move", "--id", "cab-2", "--x", "2000"]],
  "fix-wall-overlap": [["cabinet.move", "--id", "cab-2", "--y", "1600"]],
  "fix-zone-height":  [["zone.set-height", "--id", "cab-2", "--zone", "zone-2", "--height", "200"]],
  "kitchen-strip-width": [
    ["bench.rules.set", "--moduleId", "kitchenCabinet", "--name", "SUPPORT_STRIP_WIDTH", "--value", "95"],
    ["bench.pins", "--moduleId", "kitchenCabinet"],
    ["bench.diff", "--moduleId", "kitchenCabinet"],
    ["bench.presets.repin", "--moduleId", "kitchenCabinet", "--allow", "^kitchen-base\\."],
    ["bench.pins", "--moduleId", "kitchenCabinet"],
  ],
};

const [arg, ...flags] = process.argv.slice(2);
const go = (args) => spawnSync("node", [RUN, ...args], { cwd: ROOT, encoding: "utf8" });
const lastJson = (r) => { try { return JSON.parse(r.stdout.trim().split("\n").pop()); } catch { return { ok: r.status === 0 }; } };
const runDirOf = (out) => out.match(/run dir: (.*)/)[1].trim();
const runs = () => existsSync(LOGS) ? readdirSync(LOGS).filter((d) => existsSync(join(LOGS, d, "run.json"))).sort().reverse() : [];

function taskFile(id) {
  const p = resolve(TASKS_DIR, id.endsWith(".task.json") ? id : `${id}.task.json`);
  if (!existsSync(p)) { console.log(`没有任务 ${id}——跑 npm run agent 看列表`); process.exit(2); }
  return p;
}

function showOp(verb, r) {
  const j = lastJson(r);
  const bits = [j.ok ? "ok" : `FAIL${j.code ? `:${j.code}` : ""}`];
  if (j.effect?.ok === false && (j.effect.fitIssues?.length || j.effect.generatorErrors?.length))
    bits.push([...(j.effect.fitIssues ?? []), ...(j.effect.generatorErrors ?? [])].join(" | "));
  if (j.error && !j.ok) bits.push(j.error);
  console.log(`  ${j.ok ? "✓" : "✗"} ${verb}  ${bits.join("  ")}`);
  return j.ok;
}

function exec(dir, verb, args) {
  return showOp(`${verb} ${args.join(" ")}`.trim(), go(["exec", dir, verb, ...args]));
}

function finishAndReview(dir) {
  const f = go(["finish", dir]);
  const v = lastJson(f);
  console.log(`\n== finish: ${v.pass ? "PASS ✓" : "FAIL ✗"} ==`);
  for (const c of v.checks ?? []) console.log(`  ${c.ok ? "✓" : "✗"} ${c.verb}`);
  if (!v.pass) return;
  const rv = go(["review", dir]);
  const out = rv.stdout.trim().split("\n");
  const j = lastJson(rv);
  console.log(`\n== review: ${j.verdict ?? out[out.length - 1]} ==`);
  console.log(`报告: ${join(dir, "review.md")}`);
}

function demo(id) {
  const file = taskFile(id);
  console.log(`> start ${id}（自动验证 fixture 现在是坏的）`);
  const s = go(["start", file]);
  if (s.status !== 0) { console.log(s.stdout + s.stderr); process.exit(1); }
  const dir = runDirOf(s.stdout);
  console.log(`  run dir: ${dir}\n> 修复前:`);
  const task = JSON.parse(readFileSync(file, "utf8"));
  if (task.precondition?.length) exec(dir, task.precondition[0].verb, task.precondition[0].args ?? []);
  const fix = CANNED_FIX[id];
  if (!fix) { console.log(`\n任务 ${id} 没有内置修复，进交互模式手动修：npm run agent -- ${id}`); return; }
  console.log(`> 执行修复:`);
  for (const [verb, ...args] of fix) exec(dir, verb, args);
  finishAndReview(dir);
}

function listTasks() {
  console.log("任务列表（agent/tasks/）:\n");
  for (const f of readdirSync(TASKS_DIR).filter((f) => f.endsWith(".task.json"))) {
    const t = JSON.parse(readFileSync(join(TASKS_DIR, f), "utf8"));
    const kind = t.precondition ? "bug  " : t.proposal ? "gen  " : "task ";
    console.log(`  ${kind} ${t.id.padEnd(22)} ${t.goal.slice(0, 40)}…`);
    console.log(`        npm run agent -- ${t.id}`);
  }
  console.log(`\n历史 run: npm run agent -- ls    复核: npm run agent -- review [runDir]`);
}

async function interactive(id) {
  const file = taskFile(id);
  const task = JSON.parse(readFileSync(file, "utf8"));
  const s = go(["start", file]);
  if (s.status !== 0) { console.log(s.stdout + s.stderr); process.exit(1); }
  const dir = runDirOf(s.stdout);
  console.log(`已进入任务 ${id} 的隔离会话（坏了的 fixture 已加载）。`);
  console.log(`允许动词: ${task.allow.join("  ")}`);
  console.log(`敲动词执行 · 'fix' 用内置修复 · 'finish' 验收+复核 · 'quit' 退出\n`);
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "agent> " });
  rl.prompt();
  for await (const line of rl) {
    const [word, ...args] = line.trim().split(/\s+/).filter(Boolean);
    if (!word) { rl.prompt(); continue; }
    if (word === "quit" || word === "exit") break;
    if (word === "help") console.log(`动词原样敲 · fix(内置修复) · finish(验收+复核) · status · quit`);
    else if (word === "status") console.log(go(["status", dir]).stdout.trim());
    else if (word === "ls") for (const d of runs().slice(0, 10)) console.log(" ", d);
    else if (word === "fix") {
      const fix = CANNED_FIX[id];
      if (!fix) console.log("  这个任务没有内置修复");
      else for (const [verb, ...a] of fix) exec(dir, verb, a);
    }
    else if (word === "finish") { finishAndReview(dir); break; }
    else exec(dir, word, args);
    rl.prompt();
  }
  rl.close();
}

if (!arg) listTasks();
else if (arg === "ls") for (const d of runs().slice(0, 20)) console.log(d);
else if (arg === "review") {
  const dir = flags[0] ?? (runs()[0] ? join(LOGS, runs()[0]) : null);
  if (!dir) { console.log("还没有 run"); process.exit(2); }
  console.log(`复核 ${dir}`);
  finishAndReview(dir);
}
else if (flags.includes("--demo")) demo(arg);
else await interactive(arg);
