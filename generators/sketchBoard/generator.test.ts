import assert from "node:assert/strict";
import { generateSketchBoard, type SketchBoardParams } from "./generator.ts";
import { sheetMaterial } from "../_lib/material.ts";
import { localOutline } from "../_lib/model.ts";
import { buildCnjob } from "../_lib/cnjob.ts";

const carcass: SketchBoardParams = {
  plane: "XY",
  pull: 1,
  outline: [
    { u: 0, v: 0 },
    { u: 400, v: 0 },
    { u: 400, v: 600 },
    { u: 0, v: 600 },
  ],
  stock: { kind: "carcass", thickness: 16 },
};

function area(pts: Array<{ u: number; v: number }> | Array<[number, number]>): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const au = Array.isArray(a) ? a[0] : a.u;
    const av = Array.isArray(a) ? a[1] : a.v;
    const bu = Array.isArray(b) ? b[0] : b.u;
    const bv = Array.isArray(b) ? b[1] : b.v;
    s += au * bv - bu * av;
  }
  return s / 2;
}

function face(board: { faces?: Array<{ id: string; finish?: { colour?: string; grain?: string }; visible?: boolean }> }, id: string) {
  const f = board.faces?.find((x) => x.id === id);
  assert.ok(f, `face ${id}`);
  return f;
}

/* ---- carcass slab, thickness along +Z, outline unchanged ---- */
{
  const r = generateSketchBoard(carcass);
  assert.deepEqual(r.validation.errors, []);
  assert.equal(r.boards.length, 1);
  const b = r.boards[0]!;
  assert.equal(b.id, "BOARD");
  assert.deepEqual([b.x0, b.x1, b.y0, b.y1, b.z0, b.z1], [0, 400, 0, 600, 0, 16]);
  assert.equal(b.materialThickness, 16);
  assert.equal(b.stock?.kind, "carcass");
  assert.equal(b.stock?.thickness, 16);
  assert.equal(b.profilePlane, "XY");
  assert.equal(b.thicknessAxis, "Z");
  assert.equal(b.milling, "either");
  assert.deepEqual(b.profileVector, [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 600 },
    { x: 0, y: 600 },
    { x: 0, y: 0 },
  ]);
  assert.equal(b.profileHoles, undefined);
  assert.equal(b.faces?.length, 6);
  assert.equal(face(b, "A").finish?.colour, "White Stipple");
  assert.equal(face(b, "B").finish?.colour, "White Stipple");
  assert.equal(sheetMaterial(b, r.params).materialId, "pvc-white-stipple-2s-16");
  const local = localOutline(b);
  assert.ok(local);
  assert.ok(area(local) > 0, "outer ring is counter-clockwise");
  const pt = r.debug.provenance.entries["BOARD.pt[0].u"];
  assert.equal(pt?.value, 0);
  assert.equal(pt?.terms.u?.kind, "param");
  assert.equal(r.debug.provenance.entries["BOARD.z1"]?.value, 16);
}

/* ---- a clockwise sketch is stored counter-clockwise ---- */
{
  const r = generateSketchBoard({
    ...carcass,
    outline: [
      { u: 0, v: 0 },
      { u: 0, v: 600 },
      { u: 400, v: 600 },
      { u: 400, v: 0 },
    ],
  });
  assert.deepEqual(r.validation.errors, []);
  const local = localOutline(r.boards[0]!);
  assert.ok(local && area(local) > 0);
  assert.deepEqual([r.boards[0]!.x0, r.boards[0]!.x1, r.boards[0]!.z0, r.boards[0]!.z1], [0, 400, 0, 16]);
}

/* ---- single-sided door, colour on the pulled face, milled from the back ---- */
{
  const r = generateSketchBoard({
    ...carcass,
    stock: { kind: "door", thickness: 16, colour: "Gloss White" },
    doorSides: "single",
    doorSeries: "acrylic",
    colorFace: "pull",
  });
  assert.deepEqual(r.validation.errors, []);
  const b = r.boards[0]!;
  assert.equal(b.stock?.kind, "door");
  assert.equal(b.stock?.sides, 1);
  assert.equal(b.milling, "B");
  const A = face(b, "A");
  const B = face(b, "B");
  assert.equal(A.visible, true);
  assert.equal(A.finish?.colour, "Gloss White");
  assert.equal(A.finish?.grain, "u");
  assert.equal(B.visible, false);
  assert.equal(B.finish?.colour, "White Stipple");
  assert.equal(sheetMaterial(b, r.params).materialId, "acrylic-gloss-white-1s-16");
  assert.deepEqual(r.milling.issues, []);
}

/* ---- pull the other way: the sketch plane is A, and the colour stays on it ---- */
{
  const r = generateSketchBoard({
    ...carcass,
    pull: -1,
    stock: { kind: "door", thickness: 16, colour: "Gloss White" },
    doorSides: "single",
    doorSeries: "acrylic",
    colorFace: "sketch",
  });
  assert.deepEqual(r.validation.errors, []);
  const b = r.boards[0]!;
  assert.deepEqual([b.z0, b.z1], [-16, 0]);
  assert.equal(face(b, "A").finish?.colour, "Gloss White");
  assert.equal(face(b, "A").visible, true);
  assert.equal(face(b, "B").finish?.colour, "White Stipple");
  assert.equal(b.milling, "B");
}

/* ---- double-sided door paints both faces and may be flipped ---- */
{
  const r = generateSketchBoard({
    ...carcass,
    stock: { kind: "door", thickness: 16, colour: "Gloss White" },
    doorSides: "double",
    doorSeries: "acrylic",
  });
  assert.deepEqual(r.validation.errors, []);
  const b = r.boards[0]!;
  assert.equal(b.stock?.sides, 2);
  assert.equal(b.milling, "either");
  assert.equal(face(b, "A").visible, true);
  assert.equal(face(b, "B").visible, true);
  assert.equal(face(b, "A").finish?.colour, "Gloss White");
  assert.equal(face(b, "B").finish?.colour, "Gloss White");
  assert.equal(sheetMaterial(b, r.params).materialId, "acrylic-gloss-white-2s-16");
}

/* ---- a through opening is a clockwise hole in the outline ---- */
{
  const r = generateSketchBoard({
    ...carcass,
    holes: [[
      { u: 100, v: 100 },
      { u: 200, v: 100 },
      { u: 200, v: 200 },
      { u: 100, v: 200 },
    ]],
  });
  assert.deepEqual(r.validation.errors, []);
  const b = r.boards[0]!;
  const cut = b.faces!.flatMap((f) => f.features).find((f) => f.kind === "cutout");
  assert.ok(cut && cut.through, "the opening is a through cutout");
  assert.deepEqual([cut.u0, cut.u1, cut.v0, cut.v1], [100, 200, 100, 200]);
  assert.equal(cut.loop!.length, 4);
  assert.ok(area(cut.loop!) < 0, "opening is clockwise");
  const built = buildCnjob({ jobId: "t", cabinets: [{ id: "cab-1", moduleId: "sketchBoard", params: r.params, boards: r.boards }] });
  assert.ok(built.ok, built.ok ? "" : built.reasons.join("; "));
  const part = (built as { snapshot: { workpieces: Array<{ features: Array<{ kind: string; through: boolean; geometry: { profile: { points: unknown[] } } }> }> } }).snapshot.workpieces[0]!;
  const hole = part.features.find((f) => f.kind === "throughProfile");
  assert.ok(hole && hole.through && hole.geometry.profile.points.length === 4, "the export cuts the opening");
  assert.deepEqual(r.params.holes[0], [
    { u: 100, v: 200 },
    { u: 200, v: 200 },
    { u: 200, v: 100 },
    { u: 100, v: 100 },
  ]);
}

/* ---- an opening outside the outline is refused ---- */
{
  const r = generateSketchBoard({
    ...carcass,
    holes: [[
      { u: 500, v: 500 },
      { u: 700, v: 500 },
      { u: 700, v: 700 },
      { u: 500, v: 700 },
    ]],
  });
  assert.deepEqual(r.boards, []);
  assert.ok(r.validation.errors.some((e) => e.includes("not inside the outline")));
}

/* ---- an L outline is one board; a bow-tie is refused ---- */
{
  const r = generateSketchBoard({
    ...carcass,
    outline: [
      { u: 0, v: 0 }, { u: 600, v: 0 }, { u: 600, v: 200 },
      { u: 200, v: 200 }, { u: 200, v: 500 }, { u: 0, v: 500 },
    ],
  });
  assert.deepEqual(r.validation.errors, []);
  const b = r.boards[0]!;
  assert.deepEqual([b.x0, b.x1, b.y0, b.y1], [0, 600, 0, 500]);
  assert.equal(b.faces?.length, 2 + 6, "A, B and one edge face per outline edge");
  const bow = generateSketchBoard({
    ...carcass,
    outline: [{ u: 0, v: 0 }, { u: 400, v: 600 }, { u: 400, v: 0 }, { u: 0, v: 600 }],
  });
  assert.deepEqual(bow.boards, []);
  assert.ok(bow.validation.errors.some((e) => e.includes("crosses itself")));
}

/* ---- an open sketch is refused ---- */
{
  const r = generateSketchBoard({ ...carcass, outline: [{ u: 0, v: 0 }, { u: 400, v: 0 }] });
  assert.deepEqual(r.boards, []);
  assert.ok(r.validation.errors.some((e) => e.includes("at least 3 points")));
}

/* ---- XZ partition: thickness runs along Y ---- */
{
  const r = generateSketchBoard({
    plane: "XZ",
    pull: 1,
    outline: carcass.outline,
    stock: { kind: "partition", thickness: 18 },
  });
  assert.deepEqual(r.validation.errors, []);
  const b = r.boards[0]!;
  assert.deepEqual([b.x0, b.x1, b.y0, b.y1, b.z0, b.z1], [0, 400, 0, 18, 0, 600]);
  assert.equal(b.profilePlane, "XZ");
  assert.equal(b.thicknessAxis, "Y");
  assert.equal(b.stock?.kind, "partition");
  assert.equal(b.milling, "either");
  assert.equal(sheetMaterial(b, r.params).materialId, "pvc-white-stipple-2s-18");
}

/* ---- one run stays inside the generator budget ---- */
{
  const runs = 30;
  const t0 = performance.now();
  for (let i = 0; i < runs; i += 1) generateSketchBoard(carcass);
  const ms = (performance.now() - t0) / runs;
  assert.ok(ms < 5, `generate takes ${ms.toFixed(2)} ms`);
}

console.log("sketchBoard: one board from a closed sketch");
