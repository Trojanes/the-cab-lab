// Replays every accumulated project case in fixtures/projects/<name>/:
// load job.json → validate → exportCnjob → compare the snapshot against the
// stored package.cnjob (modulo exportedAt). Drift means a generator change
// altered a real project's manufacturing output — review the semantic diff
// (scripts/diff-snapshots.mjs), then either fix the regression or re-run
// scripts/add-case.mjs to re-emit the package. Exit 1 on any drift.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import zlib from "node:zlib";

globalThis.window = globalThis.window || { cablab: null, addEventListener() {} };
const { createApp } = await import("../renderer/appApi.js");

/** Minimal reader for our own stored zips (method=store, written by cnjobZip). */
function zipReadStored(buf) {
  const out = {};
  for (let p = 0; p < buf.length - 4;) {
    if (buf.readUInt32LE(p) !== 0x04034b50) break;
    const method = buf.readUInt16LE(p + 8);
    const csize = buf.readUInt32LE(p + 18);
    const nlen = buf.readUInt16LE(p + 26);
    const elen = buf.readUInt16LE(p + 28);
    const name = buf.subarray(p + 30, p + 30 + nlen).toString();
    const data = buf.subarray(p + 30 + nlen + elen, p + 30 + nlen + elen + csize);
    out[name] = method === 8 ? zlib.inflateRawSync(data) : data;
    p += 30 + nlen + elen + csize;
  }
  return out;
}

const root = "fixtures/projects";
const names = existsSync(root)
  ? readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
  : [];

if (names.length === 0) {
  console.log("no project cases under fixtures/projects/ — skipping");
  process.exit(0);
}

let bad = 0;
for (const name of names) {
  const app = createApp();
  const l = app.loadJob(JSON.parse(readFileSync(`${root}/${name}/job.json`, "utf8")));
  if (!l.ok) { console.log(`FAIL ${name}: loadJob — ${l.error}`); bad++; continue; }

  const x = app.exportCnjob({ jobId: name });
  const pkg = `${root}/${name}/package.cnjob`;
  if (!existsSync(pkg)) {
    // Export-blocked cases are recorded without a package — re-export must stay blocked.
    if (x.ok) { console.log(`FAIL ${name}: export now succeeds but no package stored — re-add case`); bad++; }
    else console.log(`PASS ${name} (export still blocked: ${x.error})`);
    continue;
  }
  if (!x.ok) { console.log(`FAIL ${name}: export now blocked — ${x.error}`); bad++; continue; }

  const stored = JSON.parse(zipReadStored(readFileSync(pkg))["snapshot.json"].toString());
  const norm = (s) => JSON.stringify({ ...s, exportedAt: "-" });
  if (norm(x.snapshot) === norm(stored)) console.log(`PASS ${name}`);
  else { console.log(`FAIL ${name}: snapshot drifted vs package.cnjob — diff with scripts/diff-snapshots.mjs, then re-add case if intended`); bad++; }
}

console.log(`${names.length - bad}/${names.length} cases replayed clean`);
process.exit(bad ? 1 : 0);
