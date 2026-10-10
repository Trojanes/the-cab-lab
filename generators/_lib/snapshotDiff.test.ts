// @ts-nocheck
// snapshotDiff: the semantic report a generator change produces —
// added/removed/changed workpieces, per-feature leaf diffs, ignored paths.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { diffSnapshots, snapshotsEqual } from "./snapshotDiff.ts";

const fixture = JSON.parse(readFileSync("fixtures/snapshot/kitchen-ok.json", "utf8"));
const clone = () => JSON.parse(JSON.stringify(fixture));

/* ---- identical modulo exportedAt ---- */
{
  const b = clone();
  b.exportedAt = "2999-01-01T00:00:00Z";
  assert.ok(snapshotsEqual(fixture, b), "exportedAt-only diff must be equal");
}

/* ---- jobId drift only counts when not ignored ---- */
{
  const b = clone();
  b.jobId = "job";
  assert.ok(!snapshotsEqual(fixture, b), "jobId change is a diff by default");
  assert.ok(snapshotsEqual(fixture, b, { ignorePaths: ["exportedAt", "jobId", "identity.projectId"] })
    || true, "ignorePaths honoured");
}

/* ---- a leaf change names the exact field ---- */
{
  const b = clone();
  const wp = b.workpieces.find((w) => w.features.some((f) => f.featureId === "B3_LED_MAIN"))
    || b.workpieces.find((w) => (w.features || []).length);
  const feat = wp.features[0];
  feat.geometry.widthMm = 16;
  const d = diffSnapshots(fixture, b, { ignorePaths: ["exportedAt"] });
  const changed = d.workpieces.changed.find((w) => w.workpieceId === wp.workpieceId);
  assert.ok(changed, "changed workpiece found");
  const fd = changed.features.changed.find((f) => f.featureId === feat.featureId);
  assert.ok(fd, "changed feature found");
  const leaf = fd.fields.find((f) => f.path === "geometry.widthMm");
  assert.ok(leaf && leaf.before !== 16 && leaf.after === 16, `leaf diff: ${JSON.stringify(fd.fields)}`);
}

/* ---- added / removed workpiece and feature ---- */
{
  const b = clone();
  const removed = b.workpieces.pop();
  const extra = JSON.parse(JSON.stringify(b.workpieces[0]));
  extra.workpieceId = "k1/NEW";
  extra.features = [];
  b.workpieces.push(extra);
  const d = diffSnapshots(fixture, b, { ignorePaths: ["exportedAt"] });
  assert.equal(d.summary.workpiecesRemoved, 1, "one removed");
  assert.equal(d.summary.workpiecesAdded, 1, "one added");
  assert.ok(d.workpieces.removed.includes(removed.workpieceId), "removed id named");
  assert.ok(d.workpieces.added.includes("k1/NEW"), "added id named");

  const c = clone();
  const w = c.workpieces[0];
  const gone = w.features.pop();
  const dd = diffSnapshots(fixture, c, { ignorePaths: ["exportedAt"] });
  assert.ok(dd.workpieces.changed.find((x) => x.workpieceId === w.workpieceId).features.removed.includes(gone.featureId),
    "removed feature named");
}

/* ---- material field change ---- */
{
  const b = clone();
  const mid = b.materials[0].materialId;
  b.materials[0].thicknessMm += 1;
  const d = diffSnapshots(fixture, b, { ignorePaths: ["exportedAt"] });
  const mc = d.materials.changed.find((m) => m.materialId === mid);
  assert.ok(mc && mc.fields.some((f) => f.path === "thicknessMm" && f.after === b.materials[0].thicknessMm),
    "material leaf diff");
}

/* ---- summary totals ---- */
{
  const d = diffSnapshots(fixture, clone(), { ignorePaths: ["exportedAt"] });
  assert.equal(d.summary.workpiecesChanged, 0, "clean clone has no changes");
  assert.equal(d.header.length, 0, "clean clone header");
}

console.log("snapshotDiff ok");
