// Generator Rules editor: pure parts (names, drafts, face picking / contact).
// node renderer/bench/rules.test.js
import assert from "node:assert/strict";
import { nameTable, toDisplay, fromDisplay, withOffset, sizeFormula, addParam, removeParam, formulaPieces } from "./ruleText.js";
import { flatFormula } from "./provenance.js";
import { createDraft, isDirty, commitEdit, undo, redo, discard, rebase, setFace, setRelation, setCorner, setFeatureDepth, diffLayouts, movedBoards, ensureBoard, ensureAxis, relationAt } from "./draft.js";

const INPUTS = [{ group: "g", fields: [
  { sym: "Cw", label: "柜宽" }, { sym: "Cd", label: "柜身深度（不含门）" }, { sym: "CPT", label: "柜身板厚" }, { sym: "clearance", label: "门缝" },
] }];
const RULES = { T4_HEIGHT_MM: { value: 50, label: "T4 高度" }, T3_DEPTH_MM: { value: 90, label: "T3 深度" } };
const N = nameTable(INPUTS, RULES);

/* ---- names ---- */
{
  assert.equal(N.Cd, "柜身深度", "the bracket note is not part of the name");
  assert.equal(toDisplay("Cd - CPT - clearance", N), "Cd − CPT − clearance");
  assert.equal(toDisplay("T1.y1", N), "T1.y1");
  assert.equal(toDisplay("2 * CPT", N), "2 × CPT");
  assert.equal(toDisplay("T4_HEIGHT_MM", N), "T4_HEIGHT_MM", "a rule id is not rewritten as its Chinese label");
  assert.equal(toDisplay("-FPT", N), "−FPT");
  assert.equal(fromDisplay("柜身深度 − 柜身板厚 − 门缝", N), "Cd - CPT - clearance");
  assert.equal(fromDisplay("T1.后表面", N), "T1.y1");
  assert.equal(fromDisplay("2 × 柜身板厚", N), "2 * CPT");
  assert.equal(fromDisplay("Cd - CPT", N), "Cd - CPT", "symbols pass through");
  assert.equal(fromDisplay("= kitchen.toeY - FPT", N), "kitchen.toeY - FPT");
  assert.equal(fromDisplay("= = V0.x1", N), "V0.x1");
  assert.equal(fromDisplay("T4 高度 + 5", N), "T4_HEIGHT_MM + 5");
  for (const e of ["Cd - CPT - clearance", "T1.y1 + 2 * CPT", "max(Cw, T3_DEPTH_MM) / 2"]) assert.equal(fromDisplay(toDisplay(e, N), N).replace(/\s/g, ""), e.replace(/\s/g, ""), `round trip ${e}`);
  assert.equal(withOffset("T3.xSize", 12.4), "T3.xSize + 12.5");
  assert.equal(withOffset("T3.xSize + 12.5", -12.5), "T3.xSize");
  assert.equal(withOffset("0", -15), "-15");
  assert.equal(withOffset("CPT - 5", 2), "CPT - 3");
}

/* ---- a point's formula, expanded to params and rule constants ---- */
{
  const prov = { entries: {
    "k.dividerHeight": { formula: "H - CPT", value: 385, terms: { H: { kind: "param" }, CPT: { kind: "param" } } },
    "k.frontZ0": { formula: "dividerHeight - TCH", value: 345, terms: { dividerHeight: { kind: "ref", ref: "k.dividerHeight" }, TCH: { kind: "param" } } },
    "D.z": { formula: "frontZ0 - slot", value: 329, terms: { frontZ0: { kind: "ref", ref: "k.frontZ0" }, slot: { kind: "rule", name: "FEATURE_GROOVE_WIDTH_MM" } } },
    "D.y": { formula: "0", value: 0, terms: {} },
    "D.whole": { formula: "frontZ0", value: 345, terms: { frontZ0: { kind: "ref", ref: "k.frontZ0" } } },
  } };
  assert.equal(flatFormula(prov, "D.z"), "((H - CPT) - TCH) - FEATURE_GROOVE_WIDTH_MM");
  assert.equal(flatFormula(prov, "D.whole"), "(H - CPT) - TCH");
  assert.equal(flatFormula(prov, "D.y"), "0");
  assert.equal(sizeFormula("0", "Cd"), "Cd");
  assert.equal(sizeFormula("CPT", "H"), "H - CPT");
  assert.equal(sizeFormula("max(0, 10 - CPT / 2)", "Cw"), "Cw - (max(0, 10 - CPT / 2))");
  assert.equal(addParam("Cd - clearance", "CPT"), "Cd - clearance + CPT");
  assert.equal(addParam("0", "CPT"), "CPT");
  assert.equal(addParam("", "H"), "H");
  assert.equal(removeParam("Cd - CPT - clearance", "CPT"), "Cd - clearance");
  assert.equal(removeParam("CPT + H", "CPT"), "H");
  assert.equal(removeParam("H - TCH - 1", "TCH"), "H - 1");
  assert.equal(removeParam("CPT", "CPT"), "0");
  assert.equal(removeParam("2 * CPT", "CPT"), "0");
  assert.equal(removeParam("max(0, 1333.4 - CPT / 2)", "CPT"), "max(0, 1333.4)");
  assert.equal(removeParam("T1.y1 + CPT", "T1.y1"), "CPT");
  assert.equal(removeParam("toeY + FPT", "toeY"), "FPT");
  assert.deepEqual(formulaPieces("Cd - CPT").map((p) => p.sym || p.text), ["Cd", " - ", "CPT"]);
  assert.deepEqual(formulaPieces("toeY + FPT").filter((p) => p.kind === "param").map((p) => p.sym), ["toeY", "FPT"]);
  assert.deepEqual(formulaPieces("T1.y1 + CPT").filter((p) => p.kind === "param").map((p) => p.sym), ["T1.y1", "CPT"]);
  assert.deepEqual(formulaPieces("max(0, H - CPT)").filter((p) => p.kind === "param").map((p) => p.sym), ["H", "CPT"]);
  const bare = { module: "t", version: 1, boards: {} };
  const seeded = ensureBoard(bare, "D2", { x: { from: "lo", at: "0", size: "CPT" }, y: { from: "lo", at: "0", size: "Cd" }, z: { from: "lo", at: "CPT", size: "H - CPT" } });
  assert.equal(seeded.boards.D2.axes.y.size, "Cd");
  assert.equal(ensureBoard(seeded, "D2", { x: { from: "hi", at: "1", size: "2" } }).boards.D2.axes.x.at, "0", "an existing rule is left alone");
  const onlyY = ensureAxis(bare, "B1", "y", { from: "lo", at: "toeY - FPT - CPT", size: "FPT" });
  assert.equal(onlyY.boards.B1.axes.x, undefined);
  assert.equal(onlyY.boards.B1.axes.y.at, "toeY - FPT - CPT");
  assert.equal(bare.boards.D2, undefined);
  const recessed = ensureAxis(bare, "B1", "y", { from: "lo", at: "toeY - FPT - CPT", size: "FPT" }, { bottomClearanceStyle: "style_1" });
  const both = ensureAxis(recessed, "B1", "y", { from: "lo", at: "-FPT", size: "FPT" }, { bottomClearanceStyle: "style_2" });
  assert.equal(both.boards.B1.axes.y.cases.length, 2);
  assert.equal(ensureAxis(both, "B1", "y", { from: "lo", at: "nope", size: "FPT" }, { bottomClearanceStyle: "style_1" }), both);
  const edited = setFace(both, "B1", "y0", "toeY - FPT", { bottomClearanceStyle: "style_1" });
  assert.equal(edited.boards.B1.axes.y.cases[0].at, "toeY - FPT");
  assert.equal(edited.boards.B1.axes.y.cases[1].at, "-FPT");
  const all = setFace(both, "B1", "y0", "-FPT", undefined, true);
  assert.equal(all.boards.B1.axes.y.at, "-FPT");
  assert.equal(all.boards.B1.axes.y.when, undefined);
  assert.equal(all.boards.B1.axes.y.cases, undefined);
}

/* ---- drafts ---- */
const LAYOUT = {
  module: "t", version: 1, boards: {
    T4: { axes: { x: { from: "lo", at: "0", size: "Cw" }, y: { from: "hi", at: "Cd - CPT - clearance", size: "CPT" }, z: { from: "hi", at: "H", size: "T4_HEIGHT_MM" } } },
    T3: {
      axes: { x: { from: "lo", at: "0", size: "Cw" }, y: { from: "lo", at: "0", size: "T3_DEPTH_MM" }, z: { from: "hi", at: "H - TCH - 1", size: "CPT" } },
      outline: { corners: { FL: { u: "0", v: "0" }, FR: { u: "T3.xSize", v: "0" }, RR: { u: "T3.xSize", v: "T3.ySize" }, RL: { u: "0", v: "T3.ySize" } } },
      features: { LED: { label: "LED 灯槽", depth: "LED_GROOVE_DEPTH_MM" } },
    },
  },
};
{
  let d = createDraft(LAYOUT);
  assert.equal(isDirty(d), false);
  // Default mode: the right face of T4 at Cw − CPT → the right face drives, the size stays.
  const a = setFace(d.layout, "T4", "x1", "Cw - CPT");
  assert.deepEqual(a.boards.T4.axes.x, { from: "hi", at: "Cw - CPT", size: "Cw" });
  assert.equal(LAYOUT.boards.T4.axes.x.from, "lo", "the input is not mutated");
  d = commitEdit(d, a, "T4 right");
  assert.equal(isDirty(d), true);
  // Face mode on the same axis replaces it, and records the relation.
  const b = setRelation(d.layout, "T4", "x0", "T3.x0", "flush");
  assert.deepEqual(b.boards.T4.axes.x, { from: "lo", at: "T3.x0", size: "Cw", relation: { kind: "flush", ref: "T3.x0" } });
  d = commitEdit(d, b, "T4 flush");
  // A default-mode edit drops the relation.
  assert.equal(setFace(d.layout, "T4", "x0", "5").boards.T4.axes.x.relation, undefined);
  assert.equal(diffLayouts(LAYOUT, d.layout).length, 1);
  d = undo(d);
  assert.deepEqual(d.layout.boards.T4.axes.x, a.boards.T4.axes.x);
  d = redo(d);
  assert.equal(d.layout.boards.T4.axes.x.relation.kind, "flush");
  assert.equal(isDirty(discard(d)), false);
  assert.equal(isDirty(rebase(d)), false);
  assert.deepEqual(rebase(d).base, d.layout);
  assert.throws(() => setFace(LAYOUT, "T9", "x0", "0"), /no x rule/);
  assert.throws(() => setFace(LAYOUT, "T4", "w0", "0"), /not a box face/);
  assert.throws(() => setRelation(LAYOUT, "T4", "x0", "T3.x0", "parallel"), /unknown relation/);
  assert.equal(relationAt("T3.y0", "y1", 0.5), "T3.y0 - 0.5");
  assert.equal(relationAt("T3.y1", "y0", 0.5), "T3.y1 + 0.5");
  assert.equal(setRelation(LAYOUT, "T4", "y1", "T3.y0", "contact", 0.5).boards.T4.axes.y.at, "T3.y0 - 0.5");
  const c = setCorner(LAYOUT, "T3", "RL", "u", "-CPT");
  assert.equal(c.boards.T3.outline.corners.RL.u, "-CPT");
  const f = setFeatureDepth(LAYOUT, "T3", "LED", "CPT / 2");
  const diff = diffLayouts(LAYOUT, f);
  assert.deepEqual(diff.map((x) => [x.board, x.what, x.key]), [["T3", "feature", "LED"]]);
  assert.deepEqual(diffLayouts(LAYOUT, c).map((x) => [x.what, x.key]), [["corner", "RL"]]);
  const mv = movedBoards({ boards: [{ id: "A", x0: 0, x1: 1, y0: 0, y1: 1, z0: 0, z1: 1 }] }, { boards: [{ id: "A", x0: 2, x1: 3, y0: 0, y1: 1, z0: 0, z1: 1 }] });
  assert.deepEqual(mv, [{ id: "A", faces: ["x0", "x1"], delta: { x0: 2, x1: 2 } }]);
}

/* ---- face mode geometry ---- */
{
  const { faceAt, faceRegion, overlapArea } = await import("./faceRegion.js");
  const plate = (id, x0, x1, y0, y1, z0, z1, extra = {}) => ({ id, x0, x1, y0, y1, z0, z1, profilePlane: "XZ", thicknessAxis: "Y", ...extra });
  const T1 = plate("T1", 0, 2000, 39, 55, 360, 400);
  const T2 = plate("T2", 0, 2000, 55, 70, 360, 400);
  assert.equal(overlapArea(faceRegion(T2, "y0"), faceRegion(T1, "y1")), 2000 * 40, "two plates face to face");
  assert.equal(overlapArea(faceRegion(plate("T2", 2010, 4010, 55, 70, 360, 400), "y0"), faceRegion(T1, "y1")), 0, "coplanar but side by side: no contact");
  assert.equal(overlapArea(faceRegion(plate("T2", 0, 2000, 56, 71, 360, 400), "y0"), faceRegion(T1, "y1")), 0, "1 mm apart: not the same plane");
  // A board with a notch in its rear edge: the notch is not solid.
  const outline = [[0, 0], [100, 0], [100, 90], [60, 90], [60, 70], [40, 70], [40, 90], [0, 90]].map(([x, y]) => ({ x, y }));
  const T3 = { id: "T3", x0: 0, x1: 100, y0: 0, y1: 90, z0: 344, z1: 359, profilePlane: "XY", thicknessAxis: "Z", profileVector: outline };
  const rear = faceRegion(T3, "y1");
  assert.deepEqual(rear.intervals, [[60, 100], [0, 40]]);
  const inNotch = { id: "P", x0: 42, x1: 58, y0: 90, y1: 105, z0: 340, z1: 360, profilePlane: "XZ", thicknessAxis: "Y" };
  assert.equal(overlapArea(faceRegion(inNotch, "y0"), rear), 0, "a board against the notch does not touch");
  const across = { ...inNotch, x0: 0, x1: 100 };
  assert.ok(Math.abs(overlapArea(faceRegion(across, "y0"), rear) - 80 * 15) < 1, "only the solid parts count");
  // The big face is the outline polygon, not the bounding box.
  const lid = { id: "L", x0: 45, x1: 55, y0: 75, y1: 88, z0: 359, z1: 375, profilePlane: "XY", thicknessAxis: "Z" };
  assert.equal(overlapArea(faceRegion(lid, "z0"), faceRegion(T3, "z1")), 0, "sitting over the notch: no contact");
  assert.equal(faceAt(T3, { x: 0, y: 1, z: 0 }, { x: 10, y: 90, z: 350 }).face, "y1");
  const notch = faceAt(T3, { x: 0, y: 1, z: 0 }, { x: 50, y: 70, z: 350 });
  assert.equal(notch.error, undefined, "a step inside the outline is a face");
  assert.equal(notch.notch, true);
  assert.equal(notch.value, 70);
  assert.equal(notch.axis, "y");
  const side = faceAt(T3, { x: -1, y: 0, z: 0 }, { x: 40, y: 80, z: 350 });
  assert.equal(side.notch, true, "the side wall of a notch is a face");
  assert.equal(side.value, 40);
  assert.equal(side.axis, "x");
  assert.match(faceAt(T3, { x: 0.6, y: 0.8, z: 0 }, { x: 10, y: 90, z: 350 }).error, /斜面/);
  // Half-slot: walls and floor are not outline edges. Through opening: walls only.
  const BP = {
    id: "BP", x0: 0, x1: 2000, y0: 0, y1: 400, z0: 0, z1: 16, profilePlane: "XY", thicknessAxis: "Z",
    faces: [{
      id: "A",
      features: [
        { id: "BG_D1", kind: "groove", u0: 642, u1: 658, v0: 133, v1: 267, depth: 8 },
        { id: "RGHD_CUTOUT", kind: "cutout", u0: 100, u1: 655, v0: 50, v1: 335, through: true },
      ],
    }],
  };
  assert.equal(faceAt(BP, { x: 0, y: 0, z: 1 }, { x: 650, y: 200, z: 16 }).notch, false, "the outer face stays the outer face");
  const wall = faceAt(BP, { x: 1, y: 0, z: 0 }, { x: 642, y: 200, z: 12 });
  assert.equal(wall.pocket, "groove");
  assert.equal(wall.value, 642);
  assert.deepEqual(wall.spanCross, [8, 16]);
  const floor = faceAt(BP, { x: 0, y: 0, z: 1 }, { x: 650, y: 200, z: 8 });
  assert.equal(floor.pocket, "groove");
  assert.equal(floor.value, 8);
  assert.equal(floor.axis, "z");
  const opening = faceAt(BP, { x: 0, y: -1, z: 0 }, { x: 400, y: 50, z: 8 });
  assert.equal(opening.pocket, "cutout");
  assert.equal(opening.value, 50);
  assert.ok(faceAt(BP, { x: 1, y: 0, z: 0 }, { x: 642, y: 200, z: 4 }).error, "below the slot floor there is no wall");
  assert.ok(faceAt(BP, { x: 0, y: 0, z: 1 }, { x: 10, y: 10, z: 4 }).error, "a miss stays a miss");
}

console.log("bench rules: names, drafts, face geometry OK");
