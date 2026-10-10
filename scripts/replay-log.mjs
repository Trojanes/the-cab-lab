/**
 * Turn a usage/crash report into a replayable check — bug reports become
 * regression fixtures instead of "what were you clicking when it broke?".
 *
 *   node scripts/replay-log.mjs logs/crash-….json     load that job state,
 *                                                     regenerate all cabinets,
 *                                                     validate + export cnjob
 *   node scripts/replay-log.mjs --all                 every logs/crash-*.json
 *   node scripts/replay-log.mjs --pin <file> <name>   lift the job into
 *                                                     fixtures/crash/<name>.json
 *   node scripts/replay-log.mjs fixtures/crash        replay every pinned
 *                                                     fixture, exit 1 on a failure
 *
 * The dump format (renderer/log.js `dump`): { reason, t, job, selected, trace }.
 * A bare job.json is accepted too — anything with .cabinets is treated as a job.
 */
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
globalThis.window = globalThis.window || { cablab: null, addEventListener() {}, removeEventListener() {} };
const { createApp } = await import("../renderer/appApi.js");

const asJob = (data) => (data?.job?.cabinets ? data.job : data?.cabinets ? data : null);
const relative = (p) => p.replace(root, "").replace(/^[\\/]/, "").replace(/\\/g, "/");

function replay(file) {
  let data;
  try { data = JSON.parse(readFileSync(file, "utf8")); }
  catch (e) { return { file, ok: false, error: `unreadable: ${e.message}` }; }
  const jobData = asJob(data);
  if (!jobData) return { file, ok: false, error: "no .job/.cabinets payload" };

  const app = createApp();
  const meta = data.reason ? `${data.reason} @ ${data.t}` : basename(file);
  const steps = [];
  try {
    const l = app.loadJob(jobData);
    if (!l.ok) return { file, ok: false, error: `loadJob: ${l.error}`, meta, steps };
    steps.push(`loaded ${l.cabinets} cabinets`);
    const g = app.generate();
    steps.push(g.ok === false ? `generate FAILED: ${g.error}` : `generated, ${g.errors ?? 0} gen error(s)`);
    const v = app.validate();
    steps.push(`validate: ${v.issues?.length ?? 0} issue(s)`);
    const x = app.exportCnjob({ jobId: "replay" });
    // "export blocked" is not a replay failure: the snapshot may legitimately
    // carry validation errors (that's often WHY it crashed). The check is
    // that the state loads, regenerates, and validates without throwing.
    steps.push(x.ok ? `cnjob: ${x.boards ?? "?"} boards` : `export blocked (expected if the state has errors)`);
    const bad = (v.issues ?? []).filter((i) => i.severity === "error" || i.level === "error");
    return { file, ok: true, meta, steps, note: bad.length ? `${bad.length} validation error(s)` : null };
  } catch (e) {
    return { file, ok: false, error: `crash during replay: ${e.message}`, meta, steps };
  }
}

const args = process.argv.slice(2);
let targets = [];
if (args[0] === "--all") {
  const d = join(root, "logs");
  targets = readdirSync(d).filter((f) => f.startsWith("crash-")).map((f) => join(d, f));
} else if (args[0] === "--pin") {
  const [, src, name] = args;
  const jobData = asJob(JSON.parse(readFileSync(src, "utf8")));
  if (!jobData) { console.error(`${src}: no job payload`); process.exit(2); }
  const dir = join(root, "fixtures", "crash");
  mkdirSync(dir, { recursive: true });
  const dest = join(dir, name.endsWith(".json") ? name : `${name}.json`);
  writeFileSync(dest, JSON.stringify(jobData, null, 2) + "\n");
  console.log(`pinned ${src} → ${relative(dest)}`);
  process.exit(0);
} else {
  const t = args[0] ?? join(root, "logs", "latest.json");
  const s = isAbsolute(t) ? t : join(root, t);
  if (!existsSync(s)) { console.log(`no ${relative(s)} — nothing to replay`); process.exit(0); }
  targets = !s.endsWith(".json")
    ? readdirSync(s).filter((f) => f.endsWith(".json")).map((f) => join(s, f))
    : [s];
}

let bad = 0;
for (const t of targets) {
  const r = replay(isAbsolute(t) ? t : join(root, t));
  const tag = r.ok ? (r.note ? "WARN" : "PASS") : "FAIL";
  console.log(`${tag}  ${relative(r.file)}  ${r.meta ?? ""}${r.note ? `  (${r.note})` : ""}`);
  for (const s of r.steps ?? []) console.log(`      ${s}`);
  if (!r.ok) { bad++; console.log(`      ✖ ${r.error ?? r.note}`); }
}
console.log(`\n${targets.length} replayed, ${bad} failed`);
process.exit(bad ? 1 : 0);
