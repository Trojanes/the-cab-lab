/**
 * Application API: the whole job workflow — space, cabinet, params, generate,
 * validate, export — runs headless and returns structured outcomes. This is
 * the surface an agent drives; the test proves no DOM is required.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

globalThis.window = globalThis.window || { cablab: null, addEventListener() {} };
const { createApp } = await import("./appApi.js");
const fx = (n) => JSON.parse(readFileSync(`fixtures/job/${n}`, "utf8"));

const app = createApp();

/* ---- catalogue reads ---- */
const modules = app.listModules();
assert.ok(modules.length >= 10, "module catalogue");
assert.ok(modules.every((m) => m.id && m.defaultSize), "module defaultSize");
assert.ok(app.listSpaceKinds().includes("box"), "space kinds");

/* ---- space + materials ---- */
assert.ok(app.defineSpace("box", { width: 4000, depth: 2600, height: 2400 }).ok, "defineSpace");
assert.ok(app.setMaterials().ok !== false, "setMaterials keeps defaults");

/* ---- add a cabinet, inspect it ---- */
const add = app.addCabinet("smallCabinet", { pose: { x: 500, y: 200 }, size: { W: 600, D: 500, H: 720 } });
assert.ok(add.ok, JSON.stringify(add));
assert.ok(add.id && add.boardCount > 0 && add.envelope?.W === 600, "cabinet generated");

const summary = app.getJobSummary();
assert.equal(summary.cabinets.length, 1, "summary cabinets");
assert.equal(summary.cabinets[0].id, add.id, "summary id");
assert.ok(summary.space?.kind === "box", "summary space");

/* ---- unknown ids fail as structured errors, not throws ---- */
assert.equal(app.addCabinet("noSuchModule").ok, false, "unknown module");
assert.equal(app.updateCabinet("cab-999", { params: {} }).ok, false, "unknown cabinet");

/* ---- param + pose edits regenerate ---- */
const upd = app.updateCabinet(add.id, { params: { cabinetWidth: 650 }, pose: { x: 600 } });
assert.ok(upd.ok, "updateCabinet");
assert.equal(upd.envelope.W, 650, "envelope follows params");
assert.ok(upd.boardCount > 0, "updateCabinet reports boardCount");
assert.equal(typeof upd.fits, "boolean", "updateCabinet reports fits");

/* ---- validate + export ---- */
const val = app.validate();
assert.ok(val.ok, `validate: ${val.fitIssues.join("; ")} ${val.generatorErrors.join("; ")}`);

const exp = app.exportCnjob();
assert.ok(exp.ok, `exportCnjob: ${exp.reasons?.join("; ")}`);
assert.equal(exp.snapshot.schemaVersion, "1.1.0", "cnjob schema");
assert.ok(exp.boardCount > 0, "workpieces");

/* ---- legacy replay through the API path ---- */
app.reset();
assert.ok(app.loadJob(fx("job-v1-legacy.json")).ok, "v1 replay loads");
assert.equal(app.loadJob(fx("bad-cabinet.json")).ok, false, "bad file refused");

/* ---- undo chain ---- */
app.reset();
app.defineSpace("box", { width: 3000, depth: 2000, height: 2400 });
const c = app.addCabinet("smallCabinet", { pose: { x: 300, y: 300 }, size: { W: 500 } });
assert.ok(app.undo().applied, "undo add");
assert.equal(app.getJobSummary().cabinets.length, 0, "cabinet undone");
assert.ok(app.redo().applied, "redo add");
assert.equal(app.getJobSummary().cabinets.length, 1, "cabinet redone");

console.log("appApi ok");
