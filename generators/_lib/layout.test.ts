/**
 * Placement rules as data: expression parsing, whole-board moves along one
 * axis, formulas kept as formulas, face references, cycles and bad drafts.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { compile } from "./expr.ts";
import { beginProvenance, endProvenance, param } from "./dim.ts";
import { LayoutError, placeBoards, validateLayout, type LayoutFile } from "./layout.ts";
import { generateOverheadCabinet } from "../overheadCabinet/generator.ts";
import { LAYOUT } from "../overheadCabinet/layout.ts";

/* ---- expressions ---- */
{
  const c = compile("max(Cw - 2 * CPT, T1.y1) / 2 + -1");
  assert.deepEqual(c.names.sort(), ["CPT", "Cw", "T1.y1"]);
  assert.equal(c.run((n) => ({ Cw: 600, CPT: 15, "T1.y1": 10 })[n]!), 284);
  assert.equal(compile("2 ^ 3 % 5").run(() => 0), 3);
  assert.throws(() => compile("Cw +"), /unexpected end/);
  assert.throws(() => compile("foo(1)"), /unknown function/);
  assert.throws(() => compile("1 2"), /trailing/);
}

const box = (file: LayoutFile, ids: string[], scope = {}) => {
  beginProvenance();
  try {
    return { boxes: placeBoards(file, ids, scope), prov: endProvenance() };
  } catch (err) {
    endProvenance();
    throw err;
  }
};
const P = param({ Cw: 600, CPT: 15 });
const rect = (x: string, size = "Cw") => ({ from: "lo" as const, at: x, size });
const flat = { y: rect("0", "100"), z: rect("0", "CPT") };

/* ---- one axis moves the whole board; formulas stay formulas ---- */
{
  const file: LayoutFile = { module: "t", version: 1, boards: { A: { axes: { x: rect("CPT"), ...flat } } } };
  const { boxes, prov } = box(file, ["A"], P);
  assert.deepEqual([boxes.A!.x0, boxes.A!.x1], [15, 615], "left at CPT: the right face moves the same distance");
  assert.equal(prov.entries["A.x0"]!.formula, "CPT");
  assert.equal(prov.entries["A.x0"]!.terms.CPT!.kind, "param");
  assert.equal(prov.entries["A.x1"]!.formula, "A.x0 + A.xSize");
  assert.equal(prov.entries["A.xSize"]!.value, 600, "size unchanged");

  const twice: LayoutFile = { ...file, boards: { A: { axes: { x: rect("2 * CPT"), ...flat } } } };
  assert.deepEqual([box(twice, ["A"], P).boxes.A!.x0, box(twice, ["A"], P).boxes.A!.x1], [30, 630], "no drift from the previous offset");
  const thicker = box(file, ["A"], param({ Cw: 600, CPT: 18 })).boxes.A!;
  assert.deepEqual([thicker.x0, thicker.x1], [18, 618], "the offset follows CPT, not a stored 15");

  const fromRight: LayoutFile = { ...file, boards: { A: { axes: { x: { from: "hi", at: "Cw - CPT", size: "Cw" }, ...flat } } } };
  const r = box(fromRight, ["A"], P).boxes.A!;
  assert.deepEqual([r.x0, r.x1], [-15, 585], "driving the right face works the same way");
}

/* ---- a face can follow another board's face, in any file order ---- */
{
  const file: LayoutFile = {
    module: "t", version: 1, boards: {
      B: { axes: { x: rect("0"), y: { from: "lo", at: "A.y1", size: "CPT" }, z: rect("0", "CPT") } },
      A: { axes: { x: rect("0"), y: rect("10", "16"), z: rect("0", "CPT") } },
    },
  };
  const { boxes, prov } = box(file, ["B", "A"], P);
  assert.equal(boxes.B!.y0, 26);
  assert.equal(prov.entries["B.y0"]!.terms["A.y1"]!.kind, "ref");
}

/* ---- refusals ---- */
{
  const loop: LayoutFile = {
    module: "t", version: 1, boards: {
      A: { axes: { x: rect("B.x1"), ...flat } },
      B: { axes: { x: rect("A.x0"), ...flat } },
    },
  };
  assert.throws(() => box(loop, ["A", "B"], P), (e: Error) => e instanceof LayoutError && /circle/.test(e.message));
  const unknown: LayoutFile = { module: "t", version: 1, boards: { A: { axes: { x: rect("Q"), ...flat } } } };
  assert.throws(() => box(unknown, ["A"], P), /uses Q/);
  const empty: LayoutFile = { module: "t", version: 1, boards: { A: { axes: { x: rect("0", "Cw - Cw"), ...flat } } } };
  assert.throws(() => box(empty, ["A"], P), /must be above 0/);
  assert.throws(() => validateLayout({ module: "t", version: 1, boards: { A: { axes: { x: { from: "mid", at: "0", size: "1" } } } } }), /lo or hi/);
  assert.throws(() => validateLayout({ module: "t", version: 1, boards: { A: { axes: { w: rect("0") } } } }), /unknown axis/);
}

/* ---- the overhead cabinet reads layout.json, and a draft replaces it ---- */
{
  const presets = JSON.parse(readFileSync(new URL("../overheadCabinet/presets.json", import.meta.url), "utf8"));
  const golden = presets.presets.find((p: { id: string }) => p.id === "golden-2000-3").params;
  const base = generateOverheadCabinet(golden);
  const t4 = base.boards.find((b) => b.id === "T4")!;
  assert.deepEqual([t4.y0, t4.y1, t4.z0, t4.z1], [367.5, 382.5, 350, 400]);
  assert.equal(base.debug.provenance!.entries["T4.y1"]!.formula, "Cd - CPT - clearance");
  assert.deepEqual(Object.keys(base.debug.placement!), ["T1", "T2", "T3", "T4"]);

  const draft = structuredClone(LAYOUT);
  draft.boards.T4!.axes.x = { from: "lo", at: "CPT", size: "Cw" };
  const moved = generateOverheadCabinet(golden, { layout: draft });
  const t4m = moved.boards.find((b) => b.id === "T4")!;
  assert.deepEqual([t4m.x0, t4m.x1, t4m.y0, t4m.y1, t4m.z0, t4m.z1], [15, 2015, 367.5, 382.5, 350, 400], "only T4's x moved");
  for (const id of ["T1", "T2", "T3", "BP"]) {
    const a = base.boards.find((b) => b.id === id)!;
    const b = moved.boards.find((x) => x.id === id)!;
    assert.deepEqual([b.x0, b.x1, b.y0, b.y1, b.z0, b.z1], [a.x0, a.x1, a.y0, a.y1, a.z0, a.z1], `${id} untouched`);
  }

  // The divider notches belong to the dividers: T3 / T4 moved along X keep them where the dividers are.
  const world = (b: { x0: number; profileVector?: Array<Record<string, unknown>> }) => {
    const xs = b.profileVector!.map((p) => Number(p.x));
    const lo = Math.min(...xs);
    return new Set(xs.map((x) => Math.round((x - lo + b.x0) * 1000) / 1000));
  };
  const d1 = base.boards.find((b) => b.id === "D1")!;
  const slotEdges = [d1.x0 - 0.5, d1.x1 + 0.5];
  for (const id of ["T3", "T4"]) {
    const shifted = structuredClone(LAYOUT);
    shifted.boards[id]!.axes.x = { from: "lo", at: "CPT", size: "Cw" };
    const r = generateOverheadCabinet(golden, { layout: shifted });
    const b = r.boards.find((x) => x.id === id)!;
    assert.equal(b.x0, 15);
    assert.ok(slotEdges.every((e) => world(b).has(e)), `${id} moved: notch edges ${slotEdges} still at D1 (got ${[...world(b)].filter((x) => x > 600 && x < 720)})`);
    assert.deepEqual(r.validation.warnings, []);
  }
  const t4tall = structuredClone(LAYOUT);
  t4tall.boards.T4!.axes.z = { from: "hi", at: "H", size: "T4_HEIGHT_MM + 10" };
  const tall = generateOverheadCabinet(golden, { layout: t4tall });
  assert.equal(Math.max(...tall.boards.find((b) => b.id === "T4")!.profileVector!.map((p) => Number(p.z))), 60, "T4's outline follows its height");
  assert.deepEqual(tall.validation.warnings, []);

  const follow = structuredClone(LAYOUT);
  follow.boards.T1!.axes.y = { from: "lo", at: "TCH + 5", size: "FPT" };
  const f = generateOverheadCabinet(golden, { layout: follow });
  const t1 = f.boards.find((b) => b.id === "T1")!;
  const t2 = f.boards.find((b) => b.id === "T2")!;
  assert.equal(t2.y0, t1.y1, "T2's front face follows T1's back face");

  // T3's outline follows its frame: a deeper frame rebuilds the outline (notches on the new rear edge).
  const deeper = structuredClone(LAYOUT);
  deeper.boards.T3!.axes.y = { from: "lo", at: "0", size: "T3_DEPTH_MM + 10" };
  const dr = generateOverheadCabinet(golden, { layout: deeper });
  const t3d = dr.boards.find((b) => b.id === "T3")!;
  assert.equal(t3d.y1, 100);
  assert.equal(Math.max(...t3d.profileVector!.map((p) => Number(p.y))), 100);
  assert.ok(t3d.profileVector!.some((p) => Number(p.y) === 80), "divider notches 20 deep on the new rear edge");
  assert.deepEqual(dr.validation.warnings, []);

  /* ---- board edit: corners and the LED depth ---- */
  const t3base = base.boards.find((b) => b.id === "T3")!;
  const pvBase = t3base.profileVector!.map((p) => [Number(p.x), Number(p.y)]);
  // B01: only the rear-left corner out by one board thickness.
  const b01 = structuredClone(LAYOUT);
  b01.boards.T3!.outline!.corners.RL = { u: "-CPT", v: "T3.ySize" };
  const r01 = generateOverheadCabinet(golden, { layout: b01 });
  const t301 = r01.boards.find((b) => b.id === "T3")!;
  assert.deepEqual([t301.x0, t301.x1, t301.y0, t301.y1], [-15, 2000, 0, 90], "left grows, right stays, no re-centring");
  const pv01 = t301.profileVector!.map((p) => [Number(p.x), Number(p.y)]);
  assert.deepEqual(pv01[0], [0, 0], "front-left corner did not move");
  assert.deepEqual(pv01[1], [2000, 0], "front-right corner did not move");
  assert.ok(pv01.some(([x, y]) => x === -15 && y === 90), "rear-left corner at -CPT");
  assert.equal(r01.debug.provenance!.entries["T3.corner.RL.u"]!.formula, "-CPT");
  assert.equal(r01.debug.provenance!.entries["T3.frame.x0"]!.value, 0, "the frame stays at 0");
  assert.equal(r01.boards.find((b) => b.id === "T4")!.x0, 0, "other boards untouched");
  // B02: both left corners out → the whole left edge, length + CPT.
  const b02 = structuredClone(b01);
  b02.boards.T3!.outline!.corners.FL = { u: "-CPT", v: "0" };
  const t302 = generateOverheadCabinet(golden, { layout: b02 }).boards.find((b) => b.id === "T3")!;
  assert.deepEqual([t302.x0, t302.x1], [-15, 2000]);
  assert.ok(t302.profileVector!.some((p) => Number(p.x) === -15 && Number(p.y) === 0));
  // A corner edit that turns the outline inside out is refused.
  const bad01 = structuredClone(LAYOUT);
  bad01.boards.T3!.outline!.corners.RL = { u: "T3.xSize + 100", v: "-50" };
  assert.ok(generateOverheadCabinet(golden, { layout: bad01 }).validation.errors.some((e) => /crosses itself/.test(e)));
  // Defaults keep the original outline point for point.
  assert.deepEqual(pvBase, generateOverheadCabinet(golden, { layout: structuredClone(LAYOUT) }).boards.find((b) => b.id === "T3")!.profileVector!.map((p) => [Number(p.x), Number(p.y)]));
  // B04: one depth for the whole LED groove (main + both branches).
  const led = (r: ReturnType<typeof generateOverheadCabinet>) => r.boards.find((b) => b.id === "T3")!.faces!.flatMap((f) => f.features).filter((f) => f.group === "T3.LED");
  const ledOn = { ...golden, ledGroove: true };
  assert.deepEqual(led(generateOverheadCabinet(ledOn)).map((f) => f.depth), [6.5, 6.5, 6.5]);
  const b04 = structuredClone(LAYOUT);
  b04.boards.T3!.features!.LED!.depth = "CPT / 2";
  const r04 = generateOverheadCabinet(ledOn, { layout: b04 });
  assert.deepEqual(led(r04).map((f) => [f.id, f.depth]), [["T3_LED_MAIN", 7.5], ["T3_LED_BRANCH_1", 7.5], ["T3_LED_BRANCH_2", 7.5]]);
  assert.deepEqual(led(r04).map((f) => [f.u0, f.v0]), led(generateOverheadCabinet(ledOn)).map((f) => [f.u0, f.v0]), "the groove openings do not move");
  assert.equal(r04.debug.provenance!.entries["T3.feat.LED.depth"]!.formula, "CPT / 2");
  // B09: through, and deeper than the board.
  const b09 = structuredClone(LAYOUT);
  b09.boards.T3!.features!.LED!.depth = "CPT";
  assert.ok(generateOverheadCabinet(ledOn, { layout: b09 }).validation.warnings.some((w) => /切穿/.test(w)));
  b09.boards.T3!.features!.LED!.depth = "CPT + 1";
  assert.ok(generateOverheadCabinet(ledOn, { layout: b09 }).validation.errors.some((e) => /深过板厚/.test(e)));
  const slant = structuredClone(LAYOUT);
  slant.boards.T3!.outline!.corners.RR = { u: "T3.xSize", v: "T3.ySize - 10" };
  const slanted = generateOverheadCabinet(golden, { layout: slant });
  assert.ok(slanted.validation.errors.some((e) => /后边不直/.test(e)), slanted.validation.errors.join("; "));
  assert.equal(slanted.boards.length, 0);

  // Face relations: contact must keep touching; the record must be consistent.
  const contact = structuredClone(LAYOUT);
  contact.boards.T2!.axes.y = { from: "lo", at: "T1.y1", size: "CPT", relation: { kind: "contact", ref: "T1.y1" } };
  assert.deepEqual(generateOverheadCabinet(golden, { layout: contact }).validation.warnings, []);
  contact.boards.T2!.axes.x = { from: "lo", at: "Cw + 10", size: "Cw" };
  assert.ok(generateOverheadCabinet(golden, { layout: contact }).validation.warnings.some((w) => /contact with T1\.y1 no longer touches/.test(w)), "a contact moved apart is reported");
  const flushApart = structuredClone(contact);
  flushApart.boards.T2!.axes.y = { from: "lo", at: "T1.y1", size: "CPT", relation: { kind: "flush", ref: "T1.y1" } };
  assert.ok(!generateOverheadCabinet(golden, { layout: flushApart }).validation.warnings.some((w) => /no longer touches/.test(w)), "flush does not need to touch");
  const mismatch = structuredClone(LAYOUT);
  mismatch.boards.T2!.axes.y = { from: "lo", at: "T1.y1 + 1", size: "CPT", relation: { kind: "contact", ref: "T1.y1" } };
  assert.ok(generateOverheadCabinet(golden, { layout: mismatch }).validation.errors.some((e) => /differs from at/.test(e)));
  const wrongAxis = structuredClone(LAYOUT);
  wrongAxis.boards.T2!.axes.y = { from: "lo", at: "T1.x1", size: "CPT", relation: { kind: "flush", ref: "T1.x1" } };
  assert.ok(generateOverheadCabinet(golden, { layout: wrongAxis }).validation.errors.some((e) => /another axis/.test(e)));
  const later = structuredClone(LAYOUT);
  later.boards.T4!.axes.x = { from: "lo", at: "D1.x1", size: "Cw" };
  assert.ok(generateOverheadCabinet(golden, { layout: later }).validation.errors.some((e) => /D1 is placed in code after these boards/.test(e)));
  const notch = structuredClone(LAYOUT);
  notch.boards.T4!.axes.y = { from: "lo", at: "D3.cut.rearY0", size: "CPT", relation: { kind: "contact", ref: "D3.cut.rearY0" } };
  const notchResult = generateOverheadCabinet(golden, { layout: notch });
  assert.deepEqual(notchResult.validation.errors, [], notchResult.validation.errors.join("; "));
  const notchT4 = notchResult.boards.find((b) => b.id === "T4")!;
  assert.ok(Math.abs(notchT4.y0 - (400 - 16)) < 0.05, `T4 should sit on the divider rear notch, y0=${notchT4.y0}`);
  const gapped = structuredClone(LAYOUT);
  gapped.boards.T4!.axes.y = { from: "lo", at: "D3.cut.rearY0 + 0.5", size: "CPT", relation: { kind: "contact", ref: "D3.cut.rearY0", offset: 0.5 } };
  const gappedResult = generateOverheadCabinet(golden, { layout: gapped });
  assert.deepEqual(gappedResult.validation.errors, [], gappedResult.validation.errors.join("; "));
  assert.ok(Math.abs(gappedResult.boards.find((b) => b.id === "T4")!.y0 - (400 - 16 + 0.5)) < 0.05);
  const onBp = structuredClone(LAYOUT);
  onBp.boards.T4!.axes.z = { from: "lo", at: "BP.z1", size: "T4_HEIGHT_MM" };
  assert.equal(generateOverheadCabinet(golden, { layout: onBp }).boards.find((b) => b.id === "T4")!.z0, 15, "the bottom panel is placed first and can be referenced");

  const broken = structuredClone(LAYOUT);
  broken.boards.T2!.axes.y = { from: "lo", at: "T9.y1", size: "CPT" };
  const bad = generateOverheadCabinet(golden, { layout: broken });
  assert.equal(bad.boards.length, 0);
  assert.ok(bad.validation.errors.some((e) => /uses T9\.y1/.test(e)), bad.validation.errors.join("; "));
  assert.ok(generateOverheadCabinet(golden, { layout: { module: "x" } }).validation.errors.some((e) => /version missing/.test(e)));
}

console.log("layout: placement rules OK");
