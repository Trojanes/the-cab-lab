// Registers a real project as an accumulated case under fixtures/projects/<name>/:
//   job.json      — the canonical source (serialize() output; migrations applied once)
//   package.cnjob — the deterministic export (exportedAt pinned), OmniCam-replayable
//   CASE.md       — provenance: where it came from, what it covers, its status
//
//   node scripts/add-case.mjs <job.json | crash-dump.json> <name> [--note "..."] [--source "..."]
//
// Then add the printed row to docs/CASES.md and run npm run test:cases.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { zipStore } = require("../cnjobZip.js");

globalThis.window = globalThis.window || { cablab: null, addEventListener() {} };
const { createApp } = await import("../renderer/appApi.js");

const [input, name, ...rest] = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : null; };
const note = arg("note") || "";
const source = arg("source") || input;

if (!input || !name || !/^[a-z0-9][a-z0-9-]*$/.test(name)) {
  console.error('usage: node scripts/add-case.mjs <file> <name>  (name = [a-z0-9-])');
  process.exit(2);
}
const dir = `fixtures/projects/${name}`;
if (existsSync(`${dir}/job.json`)) {
  console.error(`case '${name}' already exists — delete fixtures/projects/${name} to replace it`);
  process.exit(2);
}

const raw = JSON.parse(readFileSync(input, "utf8"));
const jobData = raw?.job?.cabinets ? raw.job : raw?.cabinets ? raw : null;
if (!jobData) { console.error("input has no .job/.cabinets payload"); process.exit(2); }

const app = createApp();
const l = app.loadJob(jobData);
if (!l.ok) { console.error(`loadJob refused: ${l.error}`); process.exit(1); }

const v = app.validate();
const x = app.exportCnjob({ jobId: name });
const exported = x.ok;

const cabinets = app.getJobSummary().cabinets;
const modules = [...new Set(cabinets.map((c) => c.moduleId))];

mkdirSync(dir, { recursive: true });
writeFileSync(`${dir}/job.json`, JSON.stringify(JSON.parse(app.serialize()), null, 2) + "\n");

if (exported) {
  const manifest = JSON.stringify({ format: "cabinetnc.manufacturing-snapshot", schemaVersion: "1.1.0", payload: "snapshot.json" });
  writeFileSync(`${dir}/package.cnjob`, zipStore([
    { name: "manifest.json", data: Buffer.from(manifest) },
    // exportedAt pinned — replay must stay byte-identical (see emit-replay-cnjob.mjs).
    { name: "snapshot.json", data: Buffer.from(JSON.stringify({ ...x.snapshot, exportedAt: "2000-01-01T00:00:00.000Z" })) },
  ]));
}

const lines = [
  `# ${name}`, "",
  `- source: ${source}`,
  `- added: ${new Date().toISOString().slice(0, 10)}`,
  `- space: ${JSON.stringify(app.getJobSummary().space?.params ?? null)}`,
  `- cabinets: ${cabinets.length} (${modules.join(", ")})`,
  `- validate: ${v.ok ? "clean" : `${v.fitIssues.length} fit / ${v.generatorErrors.length} generator issue(s)`}`,
  `- export: ${exported ? `${x.boardCount} workpieces` : `BLOCKED — ${x.error}`}`,
  note ? `- note: ${note}` : null,
].filter(Boolean).join("\n");
writeFileSync(`${dir}/CASE.md`, lines + "\n");

console.log(lines);
console.log(`\nwrote fixtures/projects/${name}/ (${exported ? "job.json + package.cnjob + CASE.md" : "job.json + CASE.md — export blocked, no package"})`);
console.log(`\nregistry row for docs/CASES.md:`);
console.log(`| ${name} | ${source} | ${new Date().toISOString().slice(0, 10)} | ${modules.join(", ")} | ${exported ? "exported" : "export blocked"} |`);
process.exit(0);
