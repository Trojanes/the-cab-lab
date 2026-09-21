import assert from "node:assert/strict";
import { generateBedBox, minHeight, minLength, RULES } from "./generator.ts";
import { checkPins, countPins, type PresetsFile } from "../_lib/pins.ts";
import presetsRaw from "./presets.json" with { type: "json" };

const presets = presetsRaw as PresetsFile;
const style3 = presets.presets.find((p) => p.id === "style3-queen")!;
const gen = (patch: Record<string, unknown> = {}) => generateBedBox({ ...(style3.params as object), ...patch } as never);

function testPresetsPinned() {
  for (const preset of presets.presets) {
    const result = generateBedBox(preset.params as never);
    assert.deepEqual(result.validation.errors, [], `${preset.id}: ${result.validation.errors.join("; ")}`);
    assert.ok(countPins(preset.pins) > 0);
    const bad = checkPins(result, preset.pins);
    assert.deepEqual(bad, [], `${preset.id}: ${bad.map((m) => `${m.path} expected ${m.expected} got ${m.actual}`).join("; ")}`);
  }
}

function testTwelveBoardsOneStock() {
  const r = gen();
  assert.equal(r.boards.length, 12);
  assert.deepEqual(r.boards.map((b) => b.id).sort(), [
    "DIVIDER", "END", "RAIL_BODY_HIGH", "RAIL_BODY_LOW", "RAIL_END_HIGH", "RAIL_END_LOW",
    "RAIL_L_HIGH", "RAIL_L_LOW", "RAIL_R_HIGH", "RAIL_R_LOW", "SIDE_L", "SIDE_R",
  ]);
  for (const b of r.boards) {
    assert.equal(b.materialThickness, 18, b.id);
    assert.equal(b.stock!.thickness, 18, b.id);
    assert.equal(b.faces!.length, b.profileVector || b.cutProfileVector ? (b.id === "DIVIDER" ? 14 : 10) : 6, `${b.id} faces`);
  }
  // No board below the floor, above the top, or past the body face; only the end panel past the sides.
  for (const b of r.boards) {
    assert.ok(b.z0 >= 0 && b.z1 <= 398, `${b.id} z`);
    assert.ok(b.y0 >= 0 && b.y1 <= 979, `${b.id} y`);
    if (b.id !== "END") assert.ok(b.x0 >= 0 && b.x1 <= 1508, `${b.id} x`);
  }
  const end = r.boards.find((b) => b.id === "END")!;
  assert.deepEqual([end.x0, end.x1], [-RULES.END_PANEL_OVERSIZE_MM.value, 1508 + RULES.END_PANEL_OVERSIZE_MM.value]);
}

function testNoTwoBoardsOverlap() {
  const r = gen();
  const ov = (a: number, b: number, c: number, d: number) => Math.min(b, d) - Math.max(a, c);
  for (let i = 0; i < r.boards.length; i += 1) {
    for (let j = i + 1; j < r.boards.length; j += 1) {
      const a = r.boards[i];
      const b = r.boards[j];
      const x = ov(a.x0, a.x1, b.x0, b.x1);
      const y = ov(a.y0, a.y1, b.y0, b.y1);
      const z = ov(a.z0, a.z1, b.z0, b.z1);
      const boxesOverlap = x > 1e-6 && y > 1e-6 && z > 1e-6;
      // The only box overlaps are the half-laps (divider × short rails); there the notches keep the solids apart.
      const halfLap = (a.id === "DIVIDER" && b.id.startsWith("RAIL_") && !b.id.match(/_[LR]_/)) || (b.id === "DIVIDER" && a.id.startsWith("RAIL_") && !a.id.match(/_[LR]_/));
      assert.ok(!boxesOverlap || halfLap, `${a.id} overlaps ${b.id} (${x} × ${y} × ${z})`);
    }
  }
  // Half-lap: divider tongue (z 85..313) passes through the rails' 20 mm notches; the rails' remaining 80 mm sits in the divider's 85 mm notch.
  const div = r.boards.find((b) => b.id === "DIVIDER")!;
  const cut = div.cutProfileVector!;
  assert.deepEqual(cut[0], { y: 19, z: 0 }); // the divider's bottom edge starts 19 in: the notch for the end rail
  assert.deepEqual(cut[2], { y: 942, z: 85 }); // notch 85 high at the body end
  const low = r.boards.find((b) => b.id === "RAIL_END_LOW")!;
  assert.deepEqual(low.profileVector!.slice(3, 7), [{ x: 764, z: 100 }, { x: 764, z: 80 }, { x: 744, z: 80 }, { x: 744, z: 100 }]);
  // Notch 20 wide centred on the divider (745..763 → 744..764), 20 deep from the top of the low rail.
  assert.equal(764 - 744, 18 + RULES.RAIL_NOTCH_CLEARANCE_MM.value);
}

function testRulesDriveTheGeometry() {
  // Length: side panels = L − end panel; long rails = L − end − short rail − gap − short rail.
  const r = gen({ depth: 1200 });
  const side = r.boards.find((b) => b.id === "SIDE_L")!;
  const lr = r.boards.find((b) => b.id === "RAIL_L_LOW")!;
  const rb = r.boards.find((b) => b.id === "RAIL_BODY_LOW")!;
  assert.deepEqual([side.y0, side.y1], [18, 1200]);
  assert.deepEqual([lr.y0, lr.y1], [36, 1200 - RULES.REAR_RAIL_GAP_MM.value - 18]);
  assert.deepEqual([rb.y0, rb.y1], [1200 - 1 - 18, 1200 - 1]);
  // Height: the high rails hang from the top; the divider notches follow.
  const r2 = gen({ height: 418 });
  const hi = r2.boards.find((b) => b.id === "RAIL_L_HIGH")!;
  assert.deepEqual([hi.z0, hi.z1], [318, 418]);
  const div = r2.boards.find((b) => b.id === "DIVIDER")!;
  assert.deepEqual(div.cutProfileVector![4], { y: 961, z: 418 - 85 });
  // Width: everything inside follows the side panels; the divider stays centred.
  const r3 = gen({ width: 1400 });
  const div3 = r3.boards.find((b) => b.id === "DIVIDER")!;
  assert.deepEqual([div3.x0, div3.x1], [691, 709]);
  assert.deepEqual(r3.boards.find((b) => b.id === "RAIL_END_LOW")!.profileVector!.slice(4, 6), [{ x: 700 + 10, z: 80 }, { x: 700 - 10, z: 80 }]);
  // Too short / too low → errors, no boards.
  assert.match(gen({ depth: 100 }).validation.errors.join(";"), new RegExp(`length must be at least ${Math.max(300, minLength())}`));
  assert.match(gen({ height: 150 }).validation.errors.join(";"), new RegExp(`height must be at least ${minHeight()}`));
  assert.equal(gen({ height: 150 }).boards.length, 0);
}

function testJointsAndTags() {
  const r = gen();
  const byId = new Map(r.joints.map((j) => [j.id, j]));
  // Four half-laps, each between the divider's notch edges and a short rail's notch edges.
  for (const rail of ["RAIL_END_LOW", "RAIL_END_HIGH", "RAIL_BODY_LOW", "RAIL_BODY_HIGH"]) {
    const j = byId.get(`${rail}_halflap`)!;
    assert.equal(j.kind, "half_lap");
    assert.equal(j.a.board, "DIVIDER");
    assert.equal(j.b.board, rail);
    assert.ok(j.a.faces.length >= 2 && j.b.faces.length >= 3, `${rail} tagged edges`);
    const railBoard = r.boards.find((b) => b.id === rail)!;
    for (const fid of j.b.faces) {
      const f = railBoard.faces!.find((x) => x.id === fid)!;
      assert.ok(f.features.some((ft) => ft.kind === "notch" && ft.for === "DIVIDER"), `${rail}.${fid} notch tag`);
    }
  }
  const div = r.boards.find((b) => b.id === "DIVIDER")!;
  const tagged = div.faces!.filter((f) => f.features.some((ft) => ft.kind === "notch"));
  assert.equal(tagged.length, 8, "two edges per divider notch × four notches");
  // Butt joints: three panels into the end panel; eight long-rail ends into short rails; face contacts on the sides / end.
  assert.equal(r.joints.filter((j) => j.kind === "butt").length, 3 + 8);
  assert.equal(r.joints.filter((j) => j.kind === "face_contact").length, 4 + 2);
  // Visible faces: end panel room side, side panel outsides.
  const end = r.boards.find((b) => b.id === "END")!;
  assert.equal(end.faces!.find((f) => f.id === "B")!.semantic, "front");
  assert.equal(r.boards.find((b) => b.id === "SIDE_L")!.faces!.find((f) => f.id === "B")!.visible, true);
  assert.equal(r.boards.find((b) => b.id === "SIDE_R")!.faces!.find((f) => f.id === "A")!.visible, true);
}

function testProvenanceCoversEveryFaceAndPoint() {
  const r = gen();
  const e = r.debug.provenance.entries;
  for (const b of r.boards) {
    for (const f of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) {
      assert.ok(e[`${b.id}.${f}`], `${b.id}.${f}`);
      assert.equal(e[`${b.id}.${f}`].value, b[f], `${b.id}.${f}`);
    }
    if (b.cutProfileVector) b.cutProfileVector.forEach((p, i) => { assert.equal(e[`${b.id}.cut[${i}].y`].value, p.y); assert.equal(e[`${b.id}.cut[${i}].z`].value, p.z); });
    if (b.profileVector) b.profileVector.forEach((p, i) => { assert.equal(e[`${b.id}.pv[${i}].x`].value, (p as { x: number }).x); assert.equal(e[`${b.id}.pv[${i}].z`].value, (p as { z: number }).z); });
  }
  assert.equal(e["END.x0"].terms.OVER.kind, "rule");
  assert.equal(e["DIVIDER.notchH"].formula, "RH - UNDER");
  assert.equal(e["RAIL_BODY_LOW.y1"].formula, "D - GAP");
  assert.equal(e["RAIL_L_LOW.y1"].formula, "= RAIL_BODY_LOW.y0");
  assert.equal(e["RAIL_END_LOW.notchW"].terms.CL.name, "RAIL_NOTCH_CLEARANCE_MM");
}

const tests = [testPresetsPinned, testTwelveBoardsOneStock, testNoTwoBoardsOverlap, testRulesDriveTheGeometry, testJointsAndTags, testProvenanceCoversEveryFaceAndPoint];
for (const t of tests) {
  t();
  console.log("ok", t.name);
}
console.log(`bedBox generator: ${tests.length} tests passed`);
