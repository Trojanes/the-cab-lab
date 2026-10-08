#!/usr/bin/env node
// The Cab Lab command-line host — every verb in renderer/commands.js plus the
// host verbs that need a filesystem or a subprocess (file I/O, bench.*,
// omnicam.*). Contract: docs/AGENT-COMMANDS.md.
//
//   node cli.mjs space.define --kind box --params '{"width":4000,"depth":2600,"height":2400}'
//   node cli.mjs cabinet.add kitchenCabinet x=0 y=16 W=887 D=270 H=880
//   node cli.mjs zone.set-type cab-1 --zone zone-1 --type drawer --json
//   node cli.mjs --repl                    # stdin: one command per line
//   node cli.mjs --batch ops.jsonl         # lines of {verb, args}
//
// Exit codes: 0 ok · 1 a command failed · 2 usage / protocol error.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import readline from "node:readline";

const SESSION = resolve(process.cwd(), ".cablab-session.json");

globalThis.window = globalThis.window || { cablab: null, addEventListener() {} };

const ROOT = dirname(fileURLToPath(import.meta.url));
const { invoke, listVerbs, verbSpec } = await import("./renderer/commands.js");

/* ---------- arg parsing ---------- */

function coerce(v) {
  if (v === "true") return true;
  if (v === "false") return false;
  if (v === "null") return null;
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if ((v.startsWith("{") && v.endsWith("}")) || (v.startsWith("[") && v.endsWith("]"))) {
    try { return JSON.parse(v); } catch { /* keep string */ }
  }
  return v;
}

/** "cabinet.add" + ["kitchenCabinet","x=0","--W","887","--params","{...}"] → args object */
export function parseArgs(argv) {
  const args = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t.startsWith("--")) {
      const eq = t.indexOf("=");
      if (eq > 2) args[t.slice(2, eq)] = coerce(t.slice(eq + 1));
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) args[t.slice(2)] = coerce(argv[++i]);
      else args[t.slice(2)] = true;
    } else if (/^[A-Za-z_]\w*=/.test(t)) {
      const eq = t.indexOf("=");
      args[t.slice(0, eq)] = coerce(t.slice(eq + 1));
    } else pos.push(coerce(t));
  }
  return { args, pos };
}

/** Positional words map onto the verb's declared args in order (required first). */
function bindPositional(verb, { args, pos }) {
  const spec = verbSpec(verb);
  if (!spec) return args;
  const want = spec.args.filter((s) => args[s.name] === undefined);
  for (let i = 0; i < pos.length && i < want.length; i++) args[want[i].name] = pos[i];
  return args;
}

/* ---------- host verbs (fs / subprocess) ---------- */

const GENERATORS = resolve(ROOT, "generators");
const genFile = (moduleId, name) => {
  // generators/<dir>/<name>.json — dir names differ from module ids
  const dirs = {
    overheadCabinet: "overheadCabinet", uShapeOverheadCabinet: "uShapeOverhead",
    kitchenCabinet: "kitchen", ensuiteCabinet: "kitchen",
    generalTallCabinet: "generalTall", tallFridgeCabinet: "generalTall",
    smallCabinet: "smallCabinet", loungeGenerator: "lounge",
    bedroom: "bedroom", bedroomEast: "bedroomEast", bedBox: "bedBox",
    bunkBed: "bunkBed", bedSideTable: "bedSideTable", sketchBoard: "sketchBoard",
  };
  const dir = dirs[moduleId];
  return dir ? resolve(GENERATORS, dir, `${name}.json`) : null;
};

const HOST = {
  "file.open": (a) => {
    if (a.job) return invoke("file.open", a);
    if (!a.path) return { ok: false, error: "file.open needs --path or --job", code: "bad_args" };
    try { return invoke("file.open", { job: JSON.parse(readFileSync(resolve(a.path), "utf8")), path: a.path }); }
    catch (e) { return { ok: false, verb: "file.open", error: e.message, code: "internal" }; }
  },
  "file.save": (a) => {
    const r = invoke("file.serialize", {});
    const path = a.path ? resolve(a.path) : null;
    if (path) writeFileSync(path, r.effect.json);
    return { ...r, verb: "file.save", effect: { path, bytes: r.effect.json.length } };
  },
  "file.export-cnjob": (a) => {
    const r = invoke("file.export-cnjob", a);
    if (!r.ok) return r;
    if (a.path) { writeFileSync(resolve(a.path), JSON.stringify(r.effect.snapshot, null, 2)); r.effect.path = a.path; delete r.effect.snapshot; }
    return r;
  },
  "bench.modules": () => invoke("module.list", {}),
  "bench.presets.read": (a) => readGenJson(a, "presets"),
  "bench.presets.write": (a) => writeGenJson(a, "presets"),
  "bench.rules.read": (a) => readGenJson(a, "rules"),
  "bench.rules.set": (a) => {
    const r = readGenJson(a, "rules");
    if (!r.ok) return r;
    const doc = r.effect.data;
    if (!a.name) return { ok: false, error: "bench.rules.set needs --name --value", code: "bad_args" };
    if (!doc[a.name] || typeof doc[a.name] !== "object") doc[a.name] = { value: a.value, doc: "" };
    else doc[a.name].value = a.value;
    writeFileSync(genFile(a.moduleId, "rules"), JSON.stringify(doc, null, 2));
    return { ok: true, verb: "bench.rules.set", effect: { moduleId: a.moduleId, name: a.name, value: a.value } };
  },
  "bench.layout.read": (a) => readGenJson(a, "layout"),
  "bench.layout.write": (a) => writeGenJson(a, "layout"),
  "bench.diff": () => ({ ok: false, error: "use scripts/diff-snapshots.mjs for the semantic diff", code: "bad_args" }),
  "omnicam.run": (a) => {
    const target = a.file || a._pos?.[0];
    if (!target) return { ok: false, error: "omnicam.run needs a .cnjob path or --demo", code: "bad_args" };
    const verify = resolve(ROOT, "..", "cabinetnc-cut", "dotnet", "tools", "VerifyJob", "bin", "Release", "net10.0", "VerifyJob.dll");
    const exe = existsSync(verify) ? ["dotnet", verify] : null;
    if (!exe) return { ok: false, error: `VerifyJob not built at ${verify} — dotnet build -c Release first`, code: "internal" };
    const argv = target === "--demo" || a.demo ? ["--demo", "--json"] : [resolve(String(target)), "--json"];
    const run = spawnSync(exe[0], [exe[1], ...argv], { encoding: "utf8", timeout: 300000 });
    let report = null;
    try { report = JSON.parse(run.stdout || "{}"); } catch { /* raw text */ }
    return { ok: run.status === 0, verb: "omnicam.run", effect: { exitCode: run.status, report }, error: run.status ? (run.stderr || "verify failed") : undefined, code: run.status ? "blocked" : undefined };
  },
};

function readGenJson(a, name) {
  const p = genFile(needS(a, "moduleId"), name);
  if (!p || !existsSync(p)) return { ok: false, error: `no ${name}.json for module '${a.moduleId}'`, code: "unknown_id" };
  return { ok: true, verb: `bench.${name}.read`, effect: { path: p, data: JSON.parse(readFileSync(p, "utf8")) } };
}
function writeGenJson(a, name) {
  const p = genFile(needS(a, "moduleId"), name);
  if (!p) return { ok: false, error: `no ${name}.json target for module '${a.moduleId}'`, code: "unknown_id" };
  const data = a.data ?? a.json ?? (a.path ? JSON.parse(readFileSync(resolve(a.path), "utf8")) : null);
  if (data == null) return { ok: false, error: `bench.${name}.write needs --data/--json/--path`, code: "bad_args" };
  writeFileSync(p, typeof data === "string" ? data : JSON.stringify(data, null, 2));
  return { ok: true, verb: `bench.${name}.write`, effect: { path: p } };
}
const needS = (a, k) => a[k];

/* ---------- output ---------- */

const toText = (r) => {
  if (!r.ok) return `ERR ${r.code || "?"}: ${r.error}`;
  const e = r.effect ?? {};
  const keys = Object.keys(e);
  if (!keys.length) return "ok";
  return `ok ${keys.map((k) => `${k}=${typeof e[k] === "object" ? JSON.stringify(e[k]) : e[k]}`).join(" ")}`;
};

function emit(r, json) {
  if (json) console.log(JSON.stringify(r));
  else console.log(toText(r));
  return r.ok ? 0 : 1;
}

/* ---------- main ---------- */

async function main() {
  const argv = process.argv.slice(2);
  const json = argv.includes("--json");
  const dryRun = argv.includes("--dry-run");
  const clean = argv.filter((t) => !["--json", "--dry-run"].includes(t));

  if (!clean.length || clean[0] === "help" || clean[0] === "--help") {
    console.log(`cab-lab CLI — ${listVerbs().length} verbs (+ host verbs: file.save file.open bench.* omnicam.run)\n`);
    for (const v of listVerbs()) console.log(`  ${v}`);
    console.log(`\nUsage: node cli.mjs <verb> [pos…] [--key value]… [--json] [--dry-run]`);
    return 0;
  }

  if (clean[0] === "--repl") {
    const rl = readline.createInterface({ input: process.stdin, terminal: false });
    for await (const line of rl) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const [verb, ...rest] = t.split(/\s+/);
      const args = bindPositional(verb, parseArgs(rest));
      const r = await runVerb(verb, args, { dryRun });
      if (r.ok && !dryRun && verbSpec(verb)?.mutates) saveSession();
      emit(r, true); // repl is always --json lines
    }
    return 0;
  }

  if (clean[0] === "--batch") {
    const file = clean[1];
    loadSession();
    let worst = 0;
    for (const line of readFileSync(resolve(file), "utf8").split(/\r?\n/)) {
      const t = line.trim();
      if (!t) continue;
      const { verb, args } = JSON.parse(t);
      const rr = await runVerb(verb, args || {}, { dryRun });
      worst = Math.max(worst, emit(rr, json));
    }
    saveSession();
    return worst;
  }

  const verb = clean[0];
  const args = bindPositional(verb, parseArgs(clean.slice(1)));
  loadSession();
  const r = await runVerb(verb, args, { dryRun });
  const spec = verbSpec(verb);
  if (r.ok && !dryRun && (spec?.mutates || HOST[verb])) saveSession();
  return emit(r, json);
}

/** cwd session: each invocation resumes the last job so commands chain like CMD. */
function loadSession() {
  if (!existsSync(SESSION)) return;
  try { invoke("file.open", { job: JSON.parse(readFileSync(SESSION, "utf8")), path: SESSION }); }
  catch { /* a stale/foreign session file is ignored */ }
}
function saveSession() {
  const r = invoke("file.serialize", {});
  if (r.ok) writeFileSync(SESSION, r.effect.json);
}

function runVerb(verb, args, opts = {}) {
  if (HOST[verb]) {
    const r = HOST[verb]({ ...args });
    return r && r.then ? r : Promise.resolve(r);
  }
  return Promise.resolve(invoke(verb, args, opts));
}

main().then((c) => process.exit(c)).catch(async (e) => {
  console.log(JSON.stringify({ ok: false, error: e.message, code: "internal" }));
  process.exit(2);
});
