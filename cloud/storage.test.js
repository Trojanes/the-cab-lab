// Cloud storage layer checks. Offline part always runs; the real-GCS roundtrip
// only runs when the env opts in:
//   CAB_CLOUD_ENABLED=1 CAB_CLOUD_PROVIDER=gcp CAB_GCP_BUCKET=<bucket>
//   node cloud/storage.test.js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { loadCloudConfig } = require("./config.js");
const { cloudKey, isSafeRelKey } = require("./paths.js");
const { LocalStorageProvider, createStorageProvider } = require("./providers.js");
const cloud = require("./index.js");

async function main() {
  // Snapshot the caller's env before the local-provider section mutates it.
  const wantGcs = process.env.CAB_CLOUD_PROVIDER === "gcp" && !!process.env.CAB_GCP_BUCKET;

  // --- config ---
  let cfg = loadCloudConfig({});
  assert.equal(cfg.enabled, false, "default disabled");
  assert.equal(cfg.provider, "gcp", "default provider");
  assert.equal(cfg.root, "cablab", "default root");
  assert.equal(cfg.gcp.region, "asia-southeast1", "default region");

  cfg = loadCloudConfig({
    CAB_CLOUD_ENABLED: "1",
    CAB_CLOUD_PROVIDER: "local",
    CAB_CLOUD_LOCAL_ROOT: "/tmp/x",
    CAB_GCP_BUCKET: "b",
  });
  assert.equal(cfg.enabled, true);
  assert.equal(cfg.provider, "local");
  assert.equal(cfg.localRoot, "/tmp/x");

  // --- path rules ---
  assert.equal(cloudKey("cablab", "jobs/a.json"), "cablab/jobs/a.json");
  assert.equal(cloudKey("shared/cnjob", "x.cnjob"), "shared/cnjob/x.cnjob");
  assert.throws(() => cloudKey("jobs", "a.json"), /must start with/);
  assert.throws(() => cloudKey("cablab", "../escape"), /unsafe/);
  assert.throws(() => cloudKey("cablab", "C:/abs"), /unsafe/);
  assert.equal(isSafeRelKey("a/b/c.txt"), true);
  assert.equal(isSafeRelKey("a//b"), true); // normalised by joinKey
  assert.equal(isSafeRelKey("/abs"), false);
  assert.equal(isSafeRelKey("a/../b"), false);

  // --- local provider roundtrip ---
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cablab-local-"));
  const local = new LocalStorageProvider(dir);
  const payload = `cablab test ${Date.now()}`;
  await local.upload("cablab/jobs/t.json", payload);
  assert.equal(await local.exists("cablab/jobs/t.json"), true);
  assert.equal((await local.download("cablab/jobs/t.json")).toString(), payload);
  const names = (await local.list("cablab/")).map((i) => i.key);
  assert.ok(names.includes("cablab/jobs/t.json"), `list contains key: ${names}`);
  await local.delete("cablab/jobs/t.json");
  assert.equal(await local.exists("cablab/jobs/t.json"), false);
  await assert.rejects(() => local.upload("../bad", "x"), /unsafe/);
  fs.rmSync(dir, { recursive: true, force: true });

  // --- facade: disabled → null result, no throw ---
  delete process.env.CAB_CLOUD_ENABLED;
  delete process.env.CAB_CLOUD_CONFIG;
  cloud._reset();
  assert.equal(await cloud.uploadText("cablab", "x.txt", "hi"), null, "disabled sync is null");
  assert.equal(cloud.status().enabled, false);

  // --- facade over local provider ---
  const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), "cablab-cloud-"));
  process.env.CAB_CLOUD_ENABLED = "1";
  process.env.CAB_CLOUD_PROVIDER = "local";
  process.env.CAB_CLOUD_LOCAL_ROOT = dir2;
  cloud._reset();
  const up = await cloud.uploadText("cablab/jobs", "job.json", '{"a":1}');
  assert.equal(up.ok, true);
  assert.equal(up.key, "cablab/jobs/job.json");
  const down = await cloud.downloadText("cablab", "jobs/job.json");
  assert.equal(down.text, '{"a":1}');
  const list = await cloud.listPrefix("cablab", "jobs");
  assert.equal(list.items.length, 1);
  const del = await cloud.deleteKey("cablab", "jobs/job.json");
  assert.equal(del.ok, true);
  assert.equal(cloud.status().lastSync.ok, true);
  const gone = await cloud.downloadText("cablab", "jobs/job.json");
  assert.equal(gone.ok, false, "missing object errors cleanly");
  fs.rmSync(dir2, { recursive: true, force: true });

  // --- real GCS roundtrip (opt-in) ---
  if (wantGcs) {
    process.env.CAB_CLOUD_ENABLED = "1";
    process.env.CAB_CLOUD_PROVIDER = "gcp";
    cloud._reset();
    const key = `temp/storage-test-${Date.now()}.txt`;
    const text = `gcs roundtrip ${Date.now()}`;
    const u = await cloud.uploadText("temp", key.slice("temp/".length), text);
    assert.equal(u.ok, true, `gcs upload: ${u.error || ""}`);
    const d = await cloud.downloadText("temp", key.slice("temp/".length));
    assert.equal(d.text, text, "gcs content matches");
    const l = await cloud.listPrefix("temp", "storage-test-");
    assert.ok(l.items.some((i) => i.key === key), "gcs list");
    const g = await cloud.deleteKey("temp", key.slice("temp/".length));
    assert.equal(g.ok, true);
    assert.equal(cloud.status().provider, "gcp");
    console.log("gcs roundtrip ok:", key);
  } else {
    console.log("gcs roundtrip skipped (set CAB_CLOUD_PROVIDER=gcp + CAB_GCP_BUCKET)");
  }

  console.log("cloud storage ok");
}

main().catch((err) => { console.error(err); process.exit(1); });
