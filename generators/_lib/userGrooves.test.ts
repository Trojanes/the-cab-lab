/** User grooves (Groove command): merged onto the right face, refused when they do not fit, milling re-checked. */
import assert from "node:assert/strict";
import { applyUserGrooves, grooveProblem, faceSize } from "./userGrooves.ts";
import { attachFaces, addFeature, type Board } from "./model.ts";

const rect = (id: string): Board => ({
  id, name: id, category: "panel", boardType: "panel", materialThickness: 15,
  profilePlane: "XZ", thicknessAxis: "Y", x0: 0, x1: 400, y0: 0, y1: 15, z0: 0, z1: 600,
});

const side = rect("SIDE");
const cupped = rect("DOOR");
attachFaces([side, cupped]);
addFeature(cupped, "B", { id: "cup", kind: "hole", center: [22, 100], diameter: 35, depth: 12 });
const result = { boards: [side, cupped], milling: { issues: [] }, validation: { errors: [], warnings: [] } };

assert.deepEqual(faceSize(side), { w: 400, h: 600, t: 15 });
assert.equal(applyUserGrooves(result, null), result, "nothing to merge: same result object");
assert.equal(applyUserGrooves(result, { boards: {} }), result);

const merged = applyUserGrooves(result, {
  boards: {
    SIDE: { grooves: [{ id: "G1", face: "A", kind: "groove", u0: 100, u1: 108, v0: 0, v1: 600, depth: 8 }] },
    DOOR: { grooves: [{ id: "G2", face: "A", kind: "tgroove", u0: 10, u1: 30, v0: 10, v1: 300, depth: 6, group: "T1" }] },
  },
});
assert.notEqual(merged, result);
const onA = merged.boards.find((b) => b.id === "SIDE")!.faces!.find((f) => f.id === "A")!;
assert.ok(onA.features.some((f) => f.id === "user-G1" && f.kind === "groove" && f.depth === 8 && f.u0 === 100 && f.v1 === 600));
assert.equal(side.faces!.find((f) => f.id === "A")!.features.length, 0, "the cached generator board is not touched");
assert.equal(merged.boards.find((b) => b.id === "SIDE")!.milling, "A", "milling face follows the new groove");
assert.ok(merged.milling!.issues.some((i) => i.board === "DOOR" && i.reason === "both-faces"), "a groove opposite a hinge cup needs a second setup");
const t = merged.boards.find((b) => b.id === "DOOR")!.faces!.find((f) => f.id === "A")!.features.find((f) => f.id === "user-G2")!;
assert.equal(t.kind, "tgroove");
assert.equal(t.for, "user:T1");

assert.match(grooveProblem(side, { id: "x", face: "A", kind: "groove", u0: 390, u1: 410, v0: 0, v1: 10, depth: 5 })!, /runs off/);
assert.match(grooveProblem(side, { id: "x", face: "A", kind: "groove", u0: 0, u1: 10, v0: 0, v1: 10, depth: 15 })!, /deep/);
const skipped = applyUserGrooves(result, { boards: { SIDE: { grooves: [{ id: "G9", face: "B", kind: "groove", u0: 0, u1: 10, v0: 0, v1: 10, depth: 20 }] }, GONE: { grooves: [{ id: "G8", face: "A", kind: "groove", u0: 0, u1: 1, v0: 0, v1: 1, depth: 1 }] } } });
assert.ok(skipped.validation!.warnings.some((w) => w.includes("G9") && w.includes("skipped")));
assert.ok(skipped.validation!.warnings.some((w) => w.includes("GONE")));
assert.equal(skipped.boards.find((b) => b.id === "SIDE")!.faces!.find((f) => f.id === "B")!.features.length, 0);

console.log("userGrooves: merge, refuse, milling");
