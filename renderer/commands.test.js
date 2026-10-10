/**
 * Command registry contract test — the agent/CLI surface from
 * docs/AGENT-COMMANDS.md, proven headless: envelope shape, validation gate,
 * diff, dry-run, undo groups, error codes. No DOM required.
 */
import assert from "node:assert/strict";

globalThis.window = globalThis.window || { cablab: null, addEventListener() {} };
const { invoke, listVerbs, verbSpec } = await import("./commands.js");

const run = (verb, args, opts) => invoke(verb, args, opts);

/* ---- discovery ---- */
const verbs = listVerbs();
assert.ok(verbs.length >= 80, `verb surface (${verbs.length})`);
for (const v of ["space.define", "cabinet.add", "zone.set-type", "kitchen.cell.set",
  "wall.add", "board.set-grooves", "material.set", "history.undo", "file.export-cnjob",
  "validate", "help", "schema"]) {
  assert.ok(verbs.includes(v), `verb ${v} registered`);
}

/* ---- envelope + error codes ---- */
assert.equal(run("nope.verb").code, "unknown_verb");
assert.equal(run("cabinet.get").code, "bad_args"); // missing required id
assert.equal(run("cabinet.get", { id: "ghost" }).code, "unknown_id");
{
  const r = run("schema", { verb: "cabinet.add" });
  assert.ok(r.ok && r.effect.args.some((x) => x.name === "moduleId"), "schema reports args");
}

/* ---- a real workflow ---- */
run("file.new");
{
  const r = run("space.define", { kind: "box", width: 4000, depth: 2600, height: 2400 });
  assert.ok(r.ok, "space.define");
  assert.equal(r.effect.space.params.width, 4000, "spread args land as params");
  assert.equal(r.validate.ok, true, "validation gate rides the envelope");
}
{
  const r = run("cabinet.add", { moduleId: "kitchenCabinet", x: 0, y: 200, z: 0, rotZ: 0, W: 887, D: 270, H: 880 });
  assert.ok(r.ok && r.effect.id, `cabinet.add (${JSON.stringify(r.error || "")})`);
  assert.ok(r.effect.boardCount > 0, "generated boards");
  assert.equal(typeof r.effect.fits, "boolean");
  const id = r.effect.id;

  // set-param merges (does not wholesale-replace params)
  const before = run("cabinet.get", { id }).effect.params;
  const r2 = run("cabinet.set-param", { id, key: "bottomClearanceStyle", value: "style_2" });
  assert.ok(r2.ok, "set-param");
  const after = run("cabinet.get", { id }).effect.params;
  assert.equal(after.bottomClearanceStyle, "style_2");
  assert.equal(after.cabinetWidth, before.cabinetWidth, "merge keeps other params");
  assert.ok(r2.diff.some((d) => d.path === "params.bottomClearanceStyle"), "diff reports the leaf");

  // zone ops on the kitchen columns
  const zl = run("zone.list", { id }).effect;
  assert.equal(zl.scope, "columns");
  const col0 = zl.columns[0];
  const r3 = run("kitchen.cell.set", { id, column: 0, zone: col0.zones[0].id, key: "type", value: "drawer" });
  assert.ok(r3.ok, `cell.set (${JSON.stringify(r3.error || "")})`);
  const col0b = run("zone.list", { id }).effect.columns[0];
  assert.equal(col0b.zones[0].zoneType, "drawer");

  // module guard: kitchen verbs refuse a non-kitchen
  const r4 = run("kitchen.kick", { id, style: "style_9" });
  assert.equal(r4.code, "bad_args", "enum enforced");

  // history group = one undo step
  run("history.begin");
  run("cabinet.set-param", { id, key: "bottomClearanceStyle", value: "style_1" });
  run("cabinet.set-param", { id, key: "lockEnabled", value: false });
  run("history.end");
  run("history.undo");
  assert.equal(run("cabinet.get", { id }).effect.params.bottomClearanceStyle, "style_2", "group undo reverts both");

  // dry-run: reports the change, restores state — and leaves the undo/redo stacks untouched
  const st = run("cabinet.get", { id }).effect.params.bottomClearanceStyle;
  const u0 = run("history.can-undo").effect.value, r0 = run("history.can-redo").effect.value;
  const r5 = run("cabinet.set-param", { id, key: "bottomClearanceStyle", value: "style_2" }, { dryRun: true });
  assert.ok(r5.ok && r5.dryRun, "dry-run flag");
  assert.equal(run("cabinet.get", { id }).effect.params.bottomClearanceStyle, st, "dry-run restored");
  assert.equal(run("history.can-undo").effect.value, u0, "dry-run does not grow undo");
  assert.equal(run("history.can-redo").effect.value, r0, "dry-run does not wipe redo");

  // move + orient
  assert.ok(run("cabinet.move", { id, dx: 100 }).ok, "cabinet.move");
  const o = run("cabinet.orient", { id, axis: "x", dir: 1 });
  assert.ok(o.ok || o.code === "blocked", "orient returns or blocks cleanly");

  // copy + remove
  const cp = run("cabinet.copy", { id });
  assert.ok(cp.ok && cp.effect.newId && cp.effect.newId !== id, "copy");
  assert.ok(run("cabinet.remove", { id: cp.effect.newId }).ok, "remove copy");
}

/* ---- walls ---- */
{
  const w = run("wall.add", { axis: "x", at: 2000, u0: 0, u1: 900 });
  assert.ok(w.ok && w.effect.wall.id, "wall.add");
  const wid = w.effect.wall.id;
  const op = run("wall.add-opening", { id: wid, type: "slidingDoor", from: "lo", offset: 10, width: 700 });
  assert.ok(op.ok, "add-opening");
  const oi = op.effect.wall.openings[0];
  assert.ok(oi && oi.doorHeight === 1880, "opening normalized (doorHeight default)");
  assert.ok(run("wall.set-opening", { id: wid, op: oi.id, patch: { width: 800 } }).ok, "set-opening");
  assert.equal(run("wall.get", { id: wid }).effect.wall.openings[0].width, 800);
  assert.ok(run("wall.remove-opening", { id: wid, op: oi.id }).ok, "remove-opening");
  assert.ok(run("wall.remove", { id: wid }).ok, "remove wall");
}

/* ---- export gate ---- */
{
  const v = run("validate");
  assert.ok(typeof v.effect.ok === "boolean" && Array.isArray(v.effect.fitIssues), "validate payload {ok,fitIssues,generatorErrors}");
  const ex = run("file.export-cnjob", { jobId: "t05" });
  assert.ok(ex.ok === true || ex.code === "contract", "cnjob export structured either way");
  if (ex.ok) assert.ok(ex.effect.boardCount > 0 && ex.effect.snapshot.workpieces.length === ex.effect.boardCount);
}

console.log("commands registry: envelope, diff, dry-run, undo-group, error codes OK");
