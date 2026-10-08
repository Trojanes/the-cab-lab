// Ensuite as drawn: the copy holds what the Fusion drawing holds.
import assert from "node:assert/strict";
import { ensuiteDrawingSize, generateEnsuiteDrawing } from "./generator.ts";

const feat = (b: { faces?: Array<{ id: string; features: Array<Record<string, unknown>> }> }, kind: string) =>
  (b.faces ?? []).flatMap((f) => f.features.filter((x) => x.kind === kind).map((x) => ({ face: f.id, ...x })));

for (const part of ["lower", "tall"] as const) {
  const r = generateEnsuiteDrawing({ part, doorColorName: "Gloss White" });
  const S = ensuiteDrawingSize(part);
  assert.equal(r.validation.errors.length, 0, `${part}: no errors`);
  assert.equal(r.boards.length, part === "lower" ? 21 : 27, `${part}: board count`);
  assert.equal(new Set(r.boards.map((b) => b.id)).size, r.boards.length, `${part}: ids unique`);
  for (const b of r.boards) {
    assert.ok(b.x0 >= -0.05 && b.x1 <= S.W + 0.05, `${part} ${b.id} inside W`);
    assert.ok(b.y0 >= -16.05 && b.y1 <= S.D + 0.05, `${part} ${b.id} inside D (fronts to −16)`);
    assert.ok(b.z1 <= S.H + 0.05, `${part} ${b.id} under H`);
    assert.ok(b.materialThickness === 15 || b.materialThickness === 16, `${part} ${b.id} 15 or 16`);
    if (b.stock?.kind === "door") {
      const shown = (b.faces ?? []).filter((f) => (f.id === "A" || f.id === "B") && f.visible === true);
      assert.equal(shown.length, 1, `${part} ${b.id} one colour face`);
      assert.equal(shown[0]!.finish?.colour, "Gloss White", `${part} ${b.id} door colour`);
    }
  }
  const doors = r.boards.filter((b) => b.category === "door");
  assert.equal(doors.length, 2, `${part}: two doors`);
  for (const d of doors) {
    assert.equal(feat(d, "hole").length, 2, `${part} ${d.id}: two hinge cups`);
    assert.ok(feat(d, "hole").every((h) => h.diameter === 35 && h.depth === 12.5), `${part} ${d.id}: cups ⌀35 × 12.5`);
    assert.equal(feat(d, "cutout").filter((c) => c.through).length, 1, `${part} ${d.id}: one finger slot`);
  }
}

{
  const r = generateEnsuiteDrawing({ part: "lower" });
  const lid = r.boards.find((b) => b.id === "C37")!;
  assert.deepEqual([lid.z0, lid.z1, lid.x0, lid.x1], [383, 398, 0, 483], "lower: lid over the left bay at 383–398");
  const right = r.boards.find((b) => b.id === "C19")!;
  assert.deepEqual([right.x0, right.x1, right.y0, right.y1, right.z0, right.z1], [949, 964, -16, 434, 0, 890], "lower: right side panel lined up (drawing fix)");
  assert.ok((r.params.corrections as string[]).length === 2, "lower: the fixes are reported");
}

{
  const r = generateEnsuiteDrawing({ part: "tall" });
  const panel = r.boards.find((b) => b.id === "C76")!;
  const [open] = feat(panel, "cutout").filter((c) => c.through);
  assert.ok(open, "tall: access opening");
  assert.deepEqual([open!.u0, open!.u1, open!.v0, open!.v1], [40, 467, 455, 655], "tall: opening 427 × 200 at 455–655");
  assert.equal(feat(panel, "groove").length, 1, "tall: the groove on the panel's back");
  const base = r.boards.find((b) => b.id === "C101")!;
  assert.deepEqual([base.z0, base.z1], [697, 712], "tall: base top over the cavity at 697");
  for (const id of ["C77", "C78", "C79", "C80"]) assert.equal(r.boards.find((b) => b.id === id)!.z0, 398, `tall: ${id} starts at 398`);
  // The lid the STEP lost (Component75): the stiles stand on it, its tongue fills the fixed panel's groove,
  // it passes the side panel's notch.
  const lid = r.boards.find((b) => b.id === "C75")!;
  assert.deepEqual([lid.z0, lid.z1, lid.x0, lid.x1, lid.y0, lid.y1], [383, 398, 0, 523, -8, 464], "tall: inferred lid 383–398");
  assert.ok(lid.notes!.some((n) => n.startsWith("Inferred")), "tall: the lid says it is inferred");
  // Tongue 5 mm narrower than the groove each side (10 mm router bit); 5 mm relief behind the side panel's notch.
  const pv = (lid.profileVector as Array<{ x: number; y: number }>).map((p) => [p.x, p.y]);
  const tongue = pv.filter((p) => p[1] === -8).map((p) => p[0]).sort((a, b) => a - b);
  assert.deepEqual(tongue, [123.5, 383.5], "tall: tongue x 123.5–383.5 in the 118.5–388.5 groove");
  assert.ok(pv.some((p) => p[0] === 523 && p[1] === 90), "tall: lid passes the side panel from y 90 (notch at 85)");
}

console.log("ensuiteDrawing ok");
