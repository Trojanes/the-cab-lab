import assert from "node:assert/strict";
import {
  calculateOverheadGeometry,
  generateOHCFrontView,
  generateOHCSvgPreview,
  generateOverheadCabinet,
  ohcZoneOpenings,
} from "./generator.ts";
import { checkPins, countPins, type PresetsFile } from "../_lib/pins.ts";
import presetsRaw from "./presets.json" with { type: "json" };
import layoutRaw from "./layout.json" with { type: "json" };

const presets = presetsRaw as PresetsFile;

const baseParams = {
  style: "style_1",
  cabinetWidth: 2000,
  cabinetDepth: 400,
  cabinetHeight: 400,
  topClearanceHeight: 40,
  featureWidth: 15,
  frontPanelThickness: 16,
  clearance: 2.5,
  routerDiameter: 10,
  zones: [
    { id: "zone-1", type: "up_flap", width: 650 },
    { id: "zone-2", type: "fixed_panel", width: 750 },
    { id: "zone-3", type: "up_flap", width: 600 },
  ],
};

function testV7DividerCenterlinesFromZoneBoundaries() {
  const geometry = calculateOverheadGeometry(baseParams);
  assert.deepEqual(
    geometry.divider_features.map((feature) => feature.XDi),
    [7.5, 650, 1400, 1992.5],
  );
}

function testV7ManufacturingRules() {
  const geometry = calculateOverheadGeometry(baseParams);
  assert.equal(geometry.manufacturing.FGw, 15);
  assert.equal(geometry.manufacturing.FPt, 16);
  assert.equal(geometry.manufacturing.TCH, 40);
  assert.equal(geometry.manufacturing.FZH, 360);
  assert.equal(geometry.manufacturing.FeatureSlotWidth, 16);
  assert.equal(geometry.manufacturing.Dntg_h, 7);
  assert.equal(geometry.bottom_panel.size[2], 15);
}

function testV7GroovesUseSlotWidthAndClampEdges() {
  const geometry = calculateOverheadGeometry(baseParams);
  const features = geometry.divider_features;
  assert.deepEqual(features[0]?.bp_groove.x, [0, 15.5]);
  assert.deepEqual(features[1]?.bp_groove.x, [642, 658]);
  assert.deepEqual(features.at(-1)?.bp_groove.x, [1984.5, 2000]);
  assert.deepEqual(features[0]?.bp_groove.z, [0, -7.5]);
  assert.deepEqual(features[0]?.divider_tongue.y, [138.33333333333334, 261.6666666666667]);
  assert.equal(features[0]?.divider_tongue.length_y, 400 / 3 - 10);
  assert.deepEqual(features[0]?.divider_tongue.z, [-7, 0]);
}

function testV7DividerSideProfileStyle1() {
  const geometry = calculateOverheadGeometry(baseParams);
  assert.deepEqual(geometry.trimmed_vectors.DividerSide.slice(5, 14), [
    [400, 0],
    [400, 350],
    [384, 350],
    [384, 385],
    [70, 385],
    [70, 345],
    [80, 345],
    [80, 329],
    [0, 329],
  ]);
}

function testV7DividerSideProfileStyle2() {
  const geometry = calculateOverheadGeometry({ ...baseParams, style: "style_2" });
  assert.deepEqual(geometry.trimmed_vectors.DividerSide.slice(8, 13), [
    [384, 385],
    [31, 385],
    [31, 345],
    [80, 345],
    [80, 329],
  ]);
}

function testV7FrontPanelsAndHingeHoles() {
  const geometry = calculateOverheadGeometry(baseParams);
  assert.equal(geometry.front_panels.length, 3);
  assert.deepEqual(geometry.front_panels[0]?.opening.x, [15, 642.5]);
  assert.deepEqual(geometry.front_panels[0]?.x, [2.5, 648.75]);
  assert.deepEqual(geometry.front_panels[0]?.z, [-30, 359]);
  assert.equal(geometry.front_panels[0]?.width, 646.25);
  assert.equal(geometry.front_panels[0]?.height, 389);
  assert.equal(geometry.hinge_holes.length, 4);
  assert.deepEqual(geometry.hinge_holes[0]?.center, [100, 366.5]);
  assert.deepEqual(geometry.hinge_holes[1]?.center, [546.25, 366.5]);
}

function testFrontPanelXUsesOuterAndSharedClearance() {
  const geometry = calculateOverheadGeometry({
    ...baseParams,
    clearance: 4,
    zones: [
      { id: "zone-1", type: "up_flap", width: 1000 },
      { id: "zone-2", type: "up_flap", width: 1000 },
    ],
  });
  assert.deepEqual(geometry.front_panels[0]?.x, [4, 998]);
  assert.deepEqual(geometry.front_panels[1]?.x, [1002, 1996]);

  const threeZoneGeometry = calculateOverheadGeometry({
    ...baseParams,
    cabinetWidth: 1500,
    clearance: 4,
    zones: [
      { id: "zone-1", type: "up_flap", width: 500 },
      { id: "zone-2", type: "fixed_panel", width: 500 },
      { id: "zone-3", type: "up_flap", width: 500 },
    ],
  });
  assert.deepEqual(threeZoneGeometry.front_panels[0]?.x, [4, 498]);
  assert.deepEqual(threeZoneGeometry.front_panels[1]?.x, [502, 998]);
  assert.deepEqual(threeZoneGeometry.front_panels[2]?.x, [1002, 1496]);
}

function testOpenZoneDoesNotShiftFollowingPanelDividerIndices() {
  const geometry = calculateOverheadGeometry({
    ...baseParams,
    cabinetWidth: 1500,
    zones: [
      { id: "open", type: "open", width: 500 },
      { id: "rangehood", type: "rangehood_flap", width: 1000 },
    ],
  });
  assert.equal(geometry.front_panels.length, 1);
  assert.equal(geometry.front_panels[0]?.zoneIndex, 1);
  assert.deepEqual(geometry.front_panels[0]?.opening.x, [507.5, 1485]);
}

function testDividerZBaseSitsOnBottomPanelTop() {
  const result = generateOverheadCabinet({
    cabinetWidth: 994,
    cabinetDepth: 250,
    cabinetHeight: 250,
    featureWidth: 15,
    topClearanceHeight: 40,
    zones: [
      { id: "zone-1", type: "up_flap", width: 497 },
      { id: "zone-2", type: "up_flap", width: 497 },
    ],
  });
  assert.equal(result.debug.boardFrame, "final");
  const divider = result.boards.find((board) => board.id === "D1");
  assert.ok(divider, "expected internal divider D1");
  // Outline origin is the BP top face; the tongue (-7) dips into the BP groove.
  assert.equal(divider.z0, 15);
  assert.equal(divider.z1, 250);
  assert.equal(divider.cutProfileVector?.[2]?.z, -7);
  // Solid board thickness must equal CPT (featureWidth), not groove slot width.
  assert.equal(divider.materialThickness, 15);
  assert.equal(divider.x1 - divider.x0, 15);
}

/**
 * Every number a board carries is pinned in presets.json (seeded from the
 * reviewed output, refined from the bench). This replaces the hand-written
 * box() asserts: pinned = protected, and a failure names the face or point.
 */
function testPresetPinsHold() {
  assert.equal(presets.module, "overheadCabinet");
  assert.ok(presets.presets.length >= 4, "expected the four reviewed presets");
  for (const preset of presets.presets) {
    const result = generateOverheadCabinet(preset.params as never);
    assert.deepEqual(result.validation.errors, [], `${preset.id}: validation errors`);
    assert.ok(countPins(preset.pins) > 0, `${preset.id}: no pins — run scripts/pin-presets.ts`);
    const mismatches = checkPins(result, preset.pins);
    assert.deepEqual(
      mismatches,
      [],
      `${preset.id}: ${mismatches.length} pinned value(s) differ:\n${mismatches.slice(0, 12).map((m) => `  ${m.path}: expected ${m.expected} got ${m.actual}`).join("\n")}`,
    );
  }
}

function testBoardsAreEmittedInFinalAssembledPose() {
  // Structure only; the numbers live in presets.json (default-1200-2).
  const preset = presets.presets.find((p) => p.id === "default-1200-2")!;
  const result = generateOverheadCabinet(preset.params as never);
  assert.deepEqual(result.validation.errors, []);
  assert.equal(result.debug.boardFrame, "final");
  const byId = new Map(result.boards.map((board) => [board.id, board]));
  assert.equal(byId.get("T3")?.profilePlane, "XY");
  const t4 = byId.get("T4")!;
  assert.equal(t4.profilePlane, "XZ");
  assert.equal(t4.thicknessAxis, "Y");
  assert.ok((t4.profileVector as Array<{ x: number; z: number }>).every((point) => Number.isFinite(point.x) && Number.isFinite(point.z)));
  // Divider outlines are board-local with the origin on the BP top face.
  const divider = byId.get("D1")!;
  assert.equal(divider.z0, result.params.featureWidth);
  assert.ok(divider.cutProfileVector!.some(({ z }) => z < 0), "tongue dips below the outline origin");
}

function testProvenanceCoversEveryFaceAndPoint() {
  const preset = presets.presets.find((p) => p.id === "golden-2000-3")!;
  const result = generateOverheadCabinet(preset.params as never);
  const prov = result.debug.provenance!;
  const entries = prov.entries;
  for (const board of result.boards) {
    for (const face of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) {
      const e = entries[`${board.id}.${face}`];
      assert.ok(e, `${board.id}.${face} has no provenance`);
      assert.equal(e.value, board[face], `${board.id}.${face} provenance value`);
      assert.ok(e.formula.length > 0, `${board.id}.${face} formula`);
    }
    (board.cutProfileVector ?? []).forEach((p, i) => {
      assert.equal(entries[`${board.id}.cut[${i}].y`]?.value, p.y, `${board.id}.cut[${i}].y`);
      assert.equal(entries[`${board.id}.cut[${i}].z`]?.value, p.z, `${board.id}.cut[${i}].z`);
    });
    if (board.profilePlane !== "YZ") {
      const [a, c] = board.profilePlane === "XZ" ? ["x", "z"] : ["x", "y"];
      (board.profileVector ?? []).forEach((p, i) => {
        const q = p as Record<string, number>;
        assert.equal(entries[`${board.id}.pv[${i}].${a}`]?.value, q[a], `${board.id}.pv[${i}].${a}`);
        assert.equal(entries[`${board.id}.pv[${i}].${c}`]?.value, q[c], `${board.id}.pv[${i}].${c}`);
      });
    }
  }
  // Named quantities show by name and kind; a bare literal stays in the formula.
  const step = entries["D1.cut[13].y"]!;
  assert.equal(step.formula, "frontStepY1 - (T3_DEPTH - 10)");
  assert.equal(step.terms.T3_DEPTH?.kind, "rule");
  assert.equal(step.terms.T3_DEPTH?.name, "T3_DEPTH_MM");
  assert.equal(step.terms.frontStepY1?.kind, "ref");
  assert.equal(entries["T3.z1"]!.terms.H?.kind, "param");
  // A default that the user did not give is a rule, not a param.
  const bare = generateOverheadCabinet({ cabinetWidth: 900, cabinetDepth: 350, cabinetHeight: 400, zones: [{ type: "up_flap", width: 900 }] });
  assert.equal(bare.debug.provenance!.entries["T1.y0"]!.terms.TCH?.kind, "rule");
  assert.ok(Object.keys(prov.rules).includes("T3_DEPTH_MM"));
}

/**
 * Face layer (docs/model-spec.md): every board has A / B / E<i>; every feature
 * sits on the face it is machined into; tongue / notch tags cover only outline
 * edges; joints resolve to faces. Numbers are pinned in presets.json.
 */
function testFaceLayer() {
  const preset = presets.presets.find((p) => p.id === "golden-2000-3")!;
  const result = generateOverheadCabinet(preset.params as never);
  const byId = new Map(result.boards.map((b) => [b.id, b]));
  const prov = result.debug.provenance!.entries;

  for (const b of result.boards) {
    const faces = b.faces!;
    assert.ok(faces, `${b.id} has faces`);
    const A = faces.find((f) => f.id === "A")!;
    const Bf = faces.find((f) => f.id === "B")!;
    // A = +thicknessAxis side, B = - side; their planes are the recorded box faces.
    assert.equal(A.normal, `+${b.thicknessAxis}`);
    assert.equal(Bf.normal, `-${b.thicknessAxis}`);
    assert.equal(A.planeKey, `${b.id}.${b.thicknessAxis.toLowerCase()}1`);
    assert.ok(prov[A.planeKey!], `${A.planeKey} in provenance`);
    assert.ok(prov[Bf.planeKey!], `${Bf.planeKey} in provenance`);
    // One edge face per outline edge (rectangle → 4).
    const edges = faces.filter((f) => f.id.startsWith("E"));
    const outline = b.cutProfileVector ?? b.profileVector;
    const n = outline ? outline.length - 1 : 4;
    assert.equal(edges.length, n, `${b.id} edge faces`);
    for (const e of edges) assert.ok(e.edge && e.segments?.length === 1, `${e.key} has its edge`);
    assert.equal(b.role, b.category);
    assert.equal(b.stock?.thickness, b.materialThickness);
  }

  // BP.A: one groove per divider, matching the geometry's bp_groove (BP sits at the origin so local = cabinet).
  const bp = byId.get("BP")!;
  const grooves = bp.faces!.find((f) => f.id === "A")!.features.filter((f) => f.kind === "groove");
  const geometry = calculateOverheadGeometry(preset.params as never);
  assert.equal(grooves.length, geometry.divider_features.length);
  geometry.divider_features.forEach((df, i) => {
    assert.equal(grooves[i]!.id, df.bp_groove.id);
    assert.equal(grooves[i]!.for, df.id);
    assert.deepEqual([grooves[i]!.u0, grooves[i]!.u1], df.bp_groove.x);
    assert.deepEqual([grooves[i]!.v0, grooves[i]!.v1], df.bp_groove.y);
    assert.equal(grooves[i]!.depth, 7.5);
  });
  assert.equal(bp.faces!.find((f) => f.id === "B")!.features.length, 0, "nothing on the BP underside");

  // D1: the tongue tag covers exactly the three edges below v = 0; the two notch tags exist; nothing on A / B.
  const d1 = byId.get("D1")!;
  const tongueEdges = d1.faces!.filter((f) => f.features.some((x) => x.kind === "tongue"));
  assert.equal(tongueEdges.length, 3);
  for (const e of tongueEdges) {
    assert.ok(e.edge!.from[1] <= 0 && e.edge!.to[1] <= 0, `${e.key} lies below the outline origin`);
    assert.equal(e.features[0]!.for, "BP");
  }
  assert.equal(d1.faces!.filter((f) => f.features.some((x) => x.id === "D1_T3_STEP")).length, 3);
  assert.equal(d1.faces!.filter((f) => f.features.some((x) => x.id === "D1_T4_NOTCH")).length, 2);
  assert.equal(d1.faces!.find((f) => f.id === "A")!.features.length, 0);
  assert.equal(d1.faces!.find((f) => f.id === "B")!.features.length, 0);
  assert.equal(byId.get("D0")!.faces!.find((f) => f.id === "B")!.semantic, "outside");

  // FP0.A (back, +Y): the two hinge cups, same numbers as the flat feature list; B is the visible front.
  const fp0 = byId.get("FP0")!;
  const back = fp0.faces!.find((f) => f.id === "A")!;
  assert.equal(back.semantic, "back");
  const cups = back.features.filter((f) => f.kind === "hole");
  assert.equal(cups.length, 2);
  const hinges = geometry.hinge_holes.filter((h) => h.boardId === "FP0");
  cups.forEach((c, i) => {
    assert.deepEqual(c.center, hinges[i]!.center);
    assert.equal(c.diameter, hinges[i]!.diameter);
    assert.equal(c.key, `FP0.feat.HINGE_${i + 1}`);
    assert.ok(prov[`${c.key}.x`] && prov[`${c.key}.z`], `${c.key} has provenance`);
  });
  const front = fp0.faces!.find((f) => f.id === "B")!;
  assert.equal(front.semantic, "front");
  assert.equal(front.visible, true);
  assert.equal(fp0.stock?.kind, "door");

  // T3.A: four screw pilot holes + LED main + two branches, all with provenance.
  const t3 = byId.get("T3")!;
  const t3A = t3.faces!.find((f) => f.id === "A")!;
  assert.equal(t3A.semantic, "top");
  assert.equal(t3A.features.filter((f) => f.kind === "hole").length, 4);
  const led = t3A.features.filter((f) => f.kind === "tgroove");
  assert.equal(led.length, 3);
  assert.deepEqual([led[0]!.v0, led[0]!.v1], [18, 32.5]);
  assert.equal(led[1]!.v1, 90);
  for (const f of t3A.features) {
    for (const c of ["x", "y"]) {
      const k = f.kind === "hole" ? `${f.key}.${c}` : `${f.key}.${c}0`;
      assert.ok(prov[k], `${k} in provenance`);
    }
  }
  assert.equal(prov["T3.feat.T3SH_D1.y"]!.formula, "T3_DEPTH / 2");
  assert.equal(prov["T3.feat.LED_MAIN.y1"]!.formula, "LAND + W");
  assert.equal(prov["T3.feat.LED_MAIN.y1"]!.terms.LAND?.kind, "rule");

  // T2 screw holes sit on the rail's midline in board-local v.
  const t2 = byId.get("T2")!;
  const t2Holes = t2.faces!.find((f) => f.id === "A")!.features;
  assert.equal(t2Holes.length, 4);
  assert.deepEqual(t2Holes[1]!.center, [666.7, 20]);

  // Joints: the four declarations, resolved to faces.
  assert.equal(result.joints.length, result.relationshipDeclarations.length);
  const j = new Map(result.joints.map((x) => [x.id, x]));
  assert.deepEqual(j.get("oh_bp_d0_back_to_divider")!.a, { board: "BP", faces: ["A"] });
  assert.equal(j.get("oh_bp_d0_back_to_divider")!.kind, "tongue_groove");
  assert.equal(j.get("oh_bp_d0_back_to_divider")!.b.faces.length, 2, "divider body bottom edges either side of the tongue");
  // The front joint uses only the divider's front boundary edge, not every -Y edge (tongue side, steps).
  assert.deepEqual(j.get("oh_d0_fp0_divider_to_front")!.a, { board: "D0", faces: ["E13"] });
  assert.deepEqual(j.get("oh_d0_fp0_divider_to_front")!.b, { board: "FP0", faces: ["A"] });
  assert.deepEqual(j.get("oh_t1_t2_top_rail_stack")!.a, { board: "T1", faces: ["A"] });
  assert.deepEqual(j.get("oh_t1_t2_top_rail_stack")!.b, { board: "T2", faces: ["B"] });

  // Edge tape sits on the visible outer edges. Door colour on fronts, carcass colour inside.
  const door = "Gloss White";
  const carcass = "White Stipple";
  const banded = (board: { faces?: Array<{ id: string; normal: unknown; finish?: { edgeBand?: { thickness: number; colour?: string } } }> }) =>
    (board.faces ?? []).filter((f) => f.id.startsWith("E") && f.finish?.edgeBand);
  const fpBands = banded(fp0);
  assert.equal(fpBands.length, 4, "door: four edges");
  assert.ok(fpBands.every((f) => f.finish!.edgeBand!.colour === door && f.finish!.edgeBand!.thickness === 1));
  assert.equal(banded(byId.get("T1")!).length, 0, "T1 bare");
  assert.equal(banded(byId.get("T2")!).length, 0, "T2 bare");
  for (const id of ["BP", "D0", "D1"] as const) {
    const bands = banded(byId.get(id)!);
    assert.ok(bands.length >= 1, `${id} front edge`);
    assert.ok(bands.every((f) => f.normal === "-Y" && f.finish!.edgeBand!.colour === carcass), id);
  }
  const t3Bands = banded(t3);
  assert.ok(t3Bands.some((f) => f.normal === "-Y") && t3Bands.some((f) => f.normal === "+Y"), "T3 front and back");
  assert.ok(t3Bands.every((f) => (f.normal === "-Y" || f.normal === "+Y") && f.finish!.edgeBand!.colour === carcass));
  const t4Bands = banded(byId.get("T4")!);
  assert.ok(t4Bands.length >= 1 && t4Bands.every((f) => f.normal === "-Z" && f.finish!.edgeBand!.colour === carcass), "T4 bottom");

  // Pins cover the face features too.
  assert.ok(Object.keys(preset.pins.faceFeatures ?? {}).length > 0, "golden preset pins face features — run scripts/pin-presets.ts --write");
  assert.ok(preset.pins.faceFeatures!["BP.A.BG_D1"], "BP.A.BG_D1 pinned");
}

function testFaceLayerRangehood() {
  const preset = presets.presets.find((p) => p.id === "rangehood-1000")!;
  const result = generateOverheadCabinet(preset.params as never);
  const byId = new Map(result.boards.map((b) => [b.id, b]));
  const bpA = byId.get("BP")!.faces!.find((f) => f.id === "A")!;
  const cutout = bpA.features.find((f) => f.kind === "cutout")!;
  assert.ok(cutout, "rangehood cutout on BP.A");
  assert.equal(cutout.through, true);
  assert.deepEqual([cutout.u0, cutout.u1], [55, 610]);
  assert.deepEqual([cutout.v0, cutout.v1], [57.5, 342.5]);
  assert.equal(result.debug.provenance!.entries["BP.feat.RGHD_CUTOUT.x0"]!.formula, "rghdX0 + edgeOffsetX");
  // Side grooves: D0 inside face (+X = A), D1 inside face (-X = B).
  const d0 = byId.get("D0")!;
  const d1 = byId.get("D1")!;
  assert.equal(d0.faces!.find((f) => f.id === "A")!.features.filter((f) => f.kind === "groove").length, 1);
  assert.equal(d0.faces!.find((f) => f.id === "B")!.features.length, 0);
  assert.equal(d1.faces!.find((f) => f.id === "B")!.features.filter((f) => f.kind === "groove").length, 1);
  const g = d1.faces!.find((f) => f.id === "B")!.features[0]!;
  // z 90..106 cabinet → local v = z - z0 (D1.z0 = 15).
  assert.deepEqual([g.v0, g.v1], [75, 91]);
  const topBands = (byId.get("RGHD_TOP")!.faces ?? []).filter((f) => f.finish?.edgeBand);
  assert.ok(topBands.length >= 1 && topBands.every((f) => f.normal === "-Y" && f.finish!.edgeBand!.colour === "White Stipple"), "rangehood top front");
  assert.equal((byId.get("RGHD_FRONT")!.faces ?? []).some((f) => f.finish?.edgeBand), false, "rangehood front bare");
  assert.equal((byId.get("RGHD_BACK")!.faces ?? []).some((f) => f.finish?.edgeBand), false, "rangehood back bare");
  const flap = [...byId.values()].find((b) => b.category === "front_panel")!;
  const flapBands = (flap.faces ?? []).filter((f) => f.finish?.edgeBand);
  assert.equal(flapBands.length, 4);
  assert.ok(flapBands.every((f) => f.finish!.edgeBand!.colour === "Gloss White"));
}

function testDividerBoardThicknessUsesCptNotGrooveSlot() {
  const result = generateOverheadCabinet(baseParams);
  const dividers = result.boards.filter((board) => String(board.category) === "divider");
  assert.ok(dividers.length >= 2, "expected edge + internal dividers");
  for (const divider of dividers) {
    assert.equal(divider.materialThickness, 15, `${divider.id} materialThickness`);
    assert.equal(divider.x1 - divider.x0, 15, `${divider.id} solid X span must be CPT`);
  }
  // Groove features remain CPT + clearance (16 mm) for machining clearance.
  const geometry = calculateOverheadGeometry(baseParams);
  assert.equal(geometry.manufacturing.FeatureSlotWidth, 16);
  assert.deepEqual(geometry.divider_features[1]?.bp_groove.x, [642, 658]);
}

function testGenerateOverheadCabinetBoardsAndFeatures() {
  const result = generateOverheadCabinet(baseParams);
  assert.equal(result.validation.errors.length, 0);
  assert.equal(result.debug.phase, "geometry_v1");
  assert.deepEqual(result.debug.dividerCenterlines, [7.5, 650, 1400, 1992.5]);
  const boardIds = new Set(result.boards.map((board) => board.id));
  ["BP", "T1", "T2", "T3", "T4", "D0", "D1", "D2", "D3", "FP0", "FP1", "FP2"].forEach((id) => {
    assert.ok(boardIds.has(id), `expected board ${id}`);
  });
  assert.equal(result.features.length, 12);
  const led = result.features.find((feature) => feature && feature.type === "t3_groove" && feature.targetBoardId === "T3");
  assert.ok(led, "expected T3 LED groove feature");
  assert.equal(led.face, "top");
  assert.equal(led.depth, 6.5);
  assert.equal(led.width, 14.5);
  assert.equal(led.branches?.length, 2);
  const t3 = result.boards.find((board) => board.id === "T3");
  assert.ok(t3?.notes?.some((note) => /LED groove/i.test(note)));
  const fp0 = result.boards.find((board) => board.id === "FP0");
  assert.deepEqual(fp0?.profileVector, [
    { x: 0, z: 0 },
    { x: 646.25, z: 0 },
    { x: 646.25, z: 389 },
    { x: 0, z: 389 },
    { x: 0, z: 0 },
  ]);
  assert.ok(result.debug.svgPreview?.includes("OHC front elevation geometry preview"));
}

function testRelationshipDeclarationsEmbeddedInResult() {
  const result = generateOverheadCabinet({
    cabinetWidth: 900,
    cabinetDepth: 350,
    cabinetHeight: 720,
    zones: [{ id: "zone-1", type: "up_flap", width: 900 }],
  });
  assert.equal(result.relationshipDeclarations.length, 4);
  const ids = new Set(result.relationshipDeclarations.map((item) => item.declarationId));
  assert.ok(ids.has("oh_bp_d0_back_to_divider"));
  assert.ok(ids.has("oh_t1_t2_top_rail_stack"));
}

function testSvgPreviewUsesResolvedGeometry() {
  const geometry = calculateOverheadGeometry(baseParams);
  const svg = generateOHCSvgPreview(geometry, { selectedZoneIndex: 1 });
  assert.ok(svg.includes("BP 15 mm"));
  assert.ok(svg.includes("T1/T2 / TCH 40"));
  assert.ok(svg.includes("D1 15 mm"));
  assert.ok(svg.includes("FP0"));
  assert.ok(svg.includes("opening 627.5 mm"));
  assert.ok(svg.includes("<circle"));
}

function testFrontViewOpeningsFollowTheBoards() {
  // Dividers are CPT 15 on each zone line; the end dividers sit inside the cabinet.
  const result = generateOverheadCabinet(baseParams);
  const open = ohcZoneOpenings(result);
  assert.deepEqual(open.map((o) => o.width), [650, 750, 600]);
  assert.deepEqual(open.map((o) => o.clear), [627.5, 735, 577.5]);
  assert.deepEqual(open.map((o) => o.center), [642.5, 750, 592.5]);

  const clear = generateOHCFrontView(result, { selectedZoneIndex: 1 }) ?? "";
  assert.ok(clear.includes('data-zone-index="2"'));
  assert.ok(clear.includes('class="col-dim editable" data-col="1" data-width="750" data-clear="735" data-center="750"'));
  assert.ok(clear.includes(">627.5<"));
  const center = generateOHCFrontView(result, { gaps: "center" }) ?? "";
  assert.ok(center.includes(">642.5<"));
  assert.ok(!center.includes(">627.5<"), "one readout at a time");

  // A split puts two dividers back to back; each side's opening stops on its own divider.
  const split = generateOverheadCabinet({ ...baseParams, splitAfter: 0 });
  const s = ohcZoneOpenings(split);
  assert.deepEqual(s.map((o) => o.clear), [620, 727.5, 577.5]);
  assert.ok((generateOHCFrontView(split) ?? "").includes('stroke-dasharray="3 3"'));
}

function testInvalidWidthReportsError() {
  const result = generateOverheadCabinet({
    cabinetWidth: 0,
    cabinetDepth: 350,
  });
  assert.ok(result.validation.errors.some((error) => error.includes("cabinetWidth")));
  assert.equal(result.boards.length, 0);
}

function testT3LedGrooveOption() {
  const on = generateOverheadCabinet(baseParams);
  const onLed = on.features.filter((feature) => feature && feature.type === "t3_groove" && feature.targetBoardId === "T3");
  assert.equal(onLed.length, 1);
  assert.equal(onLed[0].face, "top");
  // Front land 18 mm → centerline 25.25 (= 20 + (18 - 12.75)).
  assert.equal(onLed[0].frontLand, 18);
  assert.equal(onLed[0].frontOffset, 18 + 14.5 / 2);
  assert.equal(onLed[0].main.y0, 18);
  assert.equal(onLed[0].main.y1, 18 + 14.5);
  assert.equal(onLed[0].branches[0].y1, 90);

  const off = generateOverheadCabinet({ ...baseParams, ledGroove: false });
  assert.equal(
    off.features.filter((feature) => feature && (feature.type === "t3_groove" || feature.type === "b3_groove")).length,
    0,
  );

  const style2 = generateOverheadCabinet({ ...baseParams, style: "style_2" });
  assert.equal(
    style2.features.filter((feature) => feature && feature.type === "t3_groove" && feature.targetBoardId === "T3").length,
    1,
    "Style 2 still has T3, so LED remains available when checkbox is on",
  );
}

function testNceSingleRangehoodZoneGeometry() {
  const result = generateOverheadCabinet({
    cabinetWidth: 1000,
    cabinetDepth: 400,
    cabinetHeight: 400,
    featureWidth: 15,
    topClearanceHeight: 40,
    rangehoodPreset: "NCE",
    rangehoodClearHeight: 75,
    rangehoodAlignment: "left",
    rangehoodEdgeOffsetX: 40,
    zones: [{ id: "rangehood", type: "rangehood_flap", width: 1000 }],
  });
  assert.deepEqual(result.validation.errors, []);
  const byId = new Map(result.boards.map((board) => [board.id, board]));
  // Board boxes are pinned in presets.json (rangehood-1000); features below.
  assert.ok(byId.get("RGHD_TOP") && byId.get("RGHD_FRONT") && byId.get("RGHD_BACK"));
  const cutout = result.features.find((feature) => feature?.type === "rangehood_bp_cutout");
  assert.deepEqual(cutout?.x, [55, 610]);
  assert.deepEqual(cutout?.y, [57.5, 342.5]);
  const sideGrooves = result.features.filter((feature) => feature?.type === "rangehood_divider_side_groove");
  assert.equal(sideGrooves.length, 2);
  assert.deepEqual(sideGrooves[0]?.z, [90, 106]);
  assert.equal(result.features.filter((feature) => feature?.purpose === "hinge").length, 2);
}

function testAdjacentRangehoodZonesMergeAndMoveInternalDivider() {
  const result = generateOverheadCabinet({
    cabinetWidth: 1000,
    cabinetDepth: 400,
    cabinetHeight: 400,
    featureWidth: 15,
    topClearanceHeight: 40,
    rangehoodAlignment: "right",
    rangehoodEdgeOffsetX: 40,
    zones: [
      { id: "rangehood-left", type: "rangehood_flap", width: 500 },
      { id: "rangehood-right", type: "rangehood_flap", width: 500 },
    ],
  });
  assert.deepEqual(result.validation.errors, []);
  assert.equal(result.boards.filter((board) => board.id.startsWith("RGHD_")).length, 3);
  const middleDivider = result.boards.find((board) => board.id === "D1");
  assert.ok(middleDivider);
  assert.equal(middleDivider.z0, 105);
  assert.ok(middleDivider.notes?.some((note) => note.includes("BP groove suppressed")));
  const d1Feature = result.features.find((feature) => feature?.id === "D1");
  assert.equal(d1Feature?.bp_groove, undefined);
  const topGroove = result.features.find((feature) => feature?.type === "rangehood_top_divider_groove");
  assert.deepEqual(topGroove?.x, [492, 508]);
  assert.deepEqual(topGroove?.y, [400 / 3, 800 / 3]);
  const cutout = result.features.find((feature) => feature?.type === "rangehood_bp_cutout");
  assert.deepEqual(cutout?.x, [390, 945]);
  assert.equal(result.features.filter((feature) => feature?.purpose === "hinge").length, 4);
}

function testRangehoodValidation() {
  const exactMinimum = generateOverheadCabinet({
    cabinetWidth: 665, // Edge D inner faces are x=15 and x=650: exactly 635 clear.
    cabinetDepth: 365,
    cabinetHeight: 400,
    featureWidth: 15,
    rangehoodEdgeOffsetX: 40,
    zones: [{ type: "rangehood_flap", width: 665 }],
  });
  assert.deepEqual(exactMinimum.validation.errors, []);

  const exactMaximumHeight = generateOverheadCabinet({
    cabinetWidth: 1000,
    cabinetDepth: 400,
    cabinetHeight: 400,
    topClearanceHeight: 40,
    featureWidth: 15,
    rangehoodClearHeight: 315, // Ch - TCH - 3*CPT
    zones: [{ type: "rangehood_flap", width: 1000 }],
  });
  assert.deepEqual(exactMaximumHeight.validation.errors, []);
  const tooTall = generateOverheadCabinet({
    cabinetWidth: 1000,
    cabinetDepth: 400,
    cabinetHeight: 400,
    topClearanceHeight: 40,
    featureWidth: 15,
    rangehoodClearHeight: 316,
    zones: [{ type: "rangehood_flap", width: 1000 }],
  });
  assert.ok(tooTall.validation.errors.some((error) => error.includes("top-clearance")));

  const shallow = generateOverheadCabinet({
    cabinetWidth: 700,
    cabinetDepth: 360,
    cabinetHeight: 400,
    featureWidth: 15,
    zones: [{ type: "rangehood_flap", width: 700 }],
  });
  assert.ok(shallow.validation.errors.some((error) => error.includes("BP depth >= 365")));

  const nonContiguous = generateOverheadCabinet({
    cabinetWidth: 1800,
    cabinetDepth: 400,
    cabinetHeight: 400,
    featureWidth: 15,
    zones: [
      { type: "rangehood_flap", width: 700 },
      { type: "up_flap", width: 400 },
      { type: "rangehood_flap", width: 700 },
    ],
  });
  assert.ok(nonContiguous.validation.errors.some((error) => error.includes("one contiguous rangehood group")));
}

function testPlacementRuleMovesADivider() {
  const preset = presets.presets.find((p) => p.id === "golden-2000-3")!;
  const base = generateOverheadCabinet(preset.params as never);
  const d2 = base.boards.find((b) => b.id === "D2")!;
  const layout = structuredClone(layoutRaw) as typeof layoutRaw & { boards: Record<string, unknown> };
  layout.boards.D2 = {
    axes: {
      x: { from: "lo", at: String(d2.x0 + 20), size: String(d2.x1 - d2.x0) },
      y: { from: "lo", at: String(d2.y0), size: String(d2.y1 - d2.y0) },
      z: { from: "lo", at: String(d2.z0), size: String(d2.z1 - d2.z0) },
    },
  };
  const moved = generateOverheadCabinet(preset.params as never, { layout });
  assert.deepEqual(moved.validation.errors, []);
  const next = moved.boards.find((b) => b.id === "D2")!;
  assert.ok(Math.abs(next.x0 - (d2.x0 + 20)) < 0.05, `D2 moved to ${next.x0}`);
  assert.ok(Math.abs((next.x1 - next.x0) - (d2.x1 - d2.x0)) < 0.05, "the divider keeps its thickness");
  const plain = generateOverheadCabinet(preset.params as never);
  const again = plain.boards.find((b) => b.id === "D2")!;
  assert.ok(Math.abs(again.x0 - d2.x0) < 0.05, "without the rule the divider stays where the generator put it");
}

function testSplitOnAZoneLineButtsTwoDividers() {
  const split = generateOverheadCabinet({ ...baseParams, splitAfter: 0 });
  assert.deepEqual(split.validation.errors, []);
  assert.equal(split.debug.split?.x, 650);
  const cpt = 15;
  const xb = 650;
  const mates = split.boards.filter((b) => b.category === "divider" && b.x1 > xb - cpt - 0.1 && b.x0 < xb + cpt + 0.1);
  const left = mates.find((b) => Math.abs(b.x0 - (xb - cpt)) < 0.01 && Math.abs(b.x1 - xb) < 0.01);
  const right = mates.find((b) => Math.abs(b.x0 - xb) < 0.01 && Math.abs(b.x1 - (xb + cpt)) < 0.01);
  assert.ok(left && right, "two CPT dividers meet on the zone line");
  const flap = split.boards.find((b) => b.id === "FP0")!;
  const next = split.boards.find((b) => b.id === "FP1")!;
  assert.equal(flap.x1, xb - 1.25);
  assert.equal(next.x0, xb + 1.25);
  const bp = split.boards.filter((b) => b.boardType === "BP").sort((a, b) => a.x0 - b.x0);
  assert.equal(bp.length, 2);
  assert.equal(bp[0]!.x1, xb);
  assert.equal(bp[1]!.x0, xb);
  const slanted = (board: { id: string; profileVector?: { x: number; y?: number; z?: number }[] | null }) => {
    const pts = board.profileVector ?? [];
    for (let i = 1; i < pts.length; i += 1) {
      const a = pts[i - 1]!, b = pts[i]!;
      const sameX = Math.abs(a.x - b.x) < 0.02;
      const av = a.y ?? a.z ?? 0;
      const bv = b.y ?? b.z ?? 0;
      assert.ok(sameX || Math.abs(av - bv) < 0.02, `${board.id} edge is not rectangular`);
    }
  };
  for (const id of ["T3", "T3-2", "T4", "T4-2"]) slanted(split.boards.find((b) => b.id === id)!);
  const crossing = split.boards.filter((b) => b.x0 < xb - 0.01 && b.x1 > xb + 0.01);
  assert.deepEqual(crossing.map((b) => b.id), []);
  const refused = generateOverheadCabinet({
    ...baseParams,
    splitAfter: 0,
    zones: [
      { id: "h1", type: "rangehood_flap", width: 1000 },
      { id: "h2", type: "rangehood_flap", width: 1000 },
    ],
  });
  assert.ok(refused.validation.warnings.some((w) => w.includes("rangehood")));
  assert.equal(refused.debug.split, null);
}

function testEndPanelIsDoorStockOutsideTheCarcass() {
  const left = generateOverheadCabinet({ ...baseParams, endPanel: "left" });
  assert.deepEqual(left.validation.errors, []);
  const ep = left.boards.find((b) => b.id === "END_PANEL")!;
  assert.ok(ep, "END_PANEL built");
  assert.equal(ep.stock?.kind, "door");
  assert.deepEqual([ep.x0, ep.x1], [-16, 0], "left: just outside the end divider");
  assert.deepEqual([ep.y0, ep.y1], [-16, 400], "flush with the door face, back on the wall");
  assert.equal(ep.z0, left.boards.find((b) => b.id === "FP0")!.z0, "from the door underside");
  assert.equal(ep.z1, 400, "to the top");
  const outside = ep.faces!.find((f) => f.id === "B")!;
  assert.equal(outside.semantic, "outside");
  assert.equal(outside.visible, true);
  assert.equal(ep.faces!.find((f) => f.id === "A")!.visible, false);
  assert.equal(left.grain?.boards?.END_PANEL ?? left.boards.find((b) => b.id === "END_PANEL")!.faces!.find((f) => f.id === "B")!.finish?.grain, "v", "vertical grain");
  // The carcass frame did not move.
  assert.equal(left.boards.find((b) => b.id === "D0")!.x0, 0);
  const right = generateOverheadCabinet({ ...baseParams, endPanel: "right" });
  const epR = right.boards.find((b) => b.id === "END_PANEL")!;
  assert.deepEqual([epR.x0, epR.x1], [2000, 2016]);
  assert.equal(epR.faces!.find((f) => f.id === "A")!.semantic, "outside");
  assert.ok(generateOverheadCabinet(baseParams).boards.every((b) => b.id !== "END_PANEL"), "no end panel unless asked");
}

function testControlPanelCutsThroughTheStackAndStopsOnAHalfSlot() {
  // 35 deep: end panel 16 through, D0 15 through (31), 4 left → a 10 mm half slot on one backing divider.
  const cp = { id: "cp-1", fromCeiling: 150, fromBack: 200, width: 175, height: 105, depth: 35 };
  const r = generateOverheadCabinet({ ...baseParams, endPanel: "left", controlPanels: [cp] });
  assert.deepEqual(r.validation.errors, []);
  // A through cut is listed on the board's milling face (the end panel's inside, away from the colour);
  // a half slot stays on the face it is cut into (−X, toward the room on the left end).
  const feat = (id: string, face: "A" | "B") => {
    const b = r.boards.find((x) => x.id === id)!;
    assert.ok(b, `${id} built`);
    const f = b.faces!.find((x) => x.id === face)!.features.find((x) => String(x.id).startsWith("CP_cp-1"));
    const other = b.faces!.find((x) => x.id === (face === "A" ? "B" : "A"))!.features.filter((x) => String(x.id).startsWith("CP_"));
    assert.deepEqual(other, [], `${id}: the cut is on one face only`);
    return { b, f };
  };
  const ep = feat("END_PANEL", "A");
  assert.equal(ep.f?.kind, "cutout");
  assert.equal(ep.f?.through, true);
  assert.equal(r.milling?.issues?.length ?? 0, 0, "no milling issue: the through cut sits on the inside face");
  // Opening: centre y = 400 − 200 = 200, z = 400 − 150 = 250; local u = y − y0 (y0 = −16), v = z − z0.
  assert.deepEqual([ep.f!.u0, ep.f!.u1], [200 - 87.5 + 16, 200 + 87.5 + 16]);
  assert.deepEqual([ep.f!.v0, ep.f!.v1], [250 - 52.5 - ep.b.z0, 250 + 52.5 - ep.b.z0]);
  const d0 = feat("D0", "B");
  assert.equal(d0.f?.kind, "cutout");
  assert.deepEqual([d0.f!.u0, d0.f!.u1], [112.5, 287.5]);
  const back = feat("D_CP_L1", "B");
  assert.deepEqual([back.b.x0, back.b.x1], [15, 30], "backing divider right behind D0");
  assert.equal(back.b.z0, 15);
  assert.equal(back.f?.kind, "groove");
  assert.equal(back.f?.depth, 10);
  assert.deepEqual([back.f!.u0, back.f!.u1], [112.5, 400.5], "the half slot runs 0.5 mm past the back edge so the wiring cut breaks through");
  assert.ok(r.boards.every((b) => b.id !== "D_CP_L2"), "one backing board is enough");
  // The backing divider is built like a divider: BP groove, T3 / T4 notches, screw holes.
  const bp = r.boards.find((b) => b.id === "BP")!;
  assert.ok(bp.faces!.find((f) => f.id === "A")!.features.some((f) => f.kind === "groove" && f.for === "D_CP_L1"));
  assert.ok(back.b.faces!.some((f) => f.features.some((x) => x.id === "D_CP_L1_T3_STEP")));
  const t3 = r.boards.find((b) => b.id === "T3")!;
  assert.ok(t3.faces!.find((f) => f.id === "A")!.features.some((f) => f.kind === "hole" && f.for === "D_CP_L1"), "T3 screw holes into it");
  assert.ok((t3.profileVector ?? []).some((p) => Math.abs(p.x - 30) < 1.3 || Math.abs(p.x - 15) < 1.3), "T3 notched round the backing divider");

  // A wall host, 55 deep on the right: wall 18 through, D3 15 through (33), D_CP_R1 15 through (48), D_CP_R2 half slot.
  const wall = { ...cp, id: "cp-2", host: "wall", side: "right", wallThickness: 18, depth: 55 };
  const w = generateOverheadCabinet({ ...baseParams, controlPanels: [wall] });
  assert.deepEqual(w.validation.errors, []);
  const on = (id: string) => w.boards.find((x) => x.id === id)!.faces!.find((f) => f.id === "A")!.features.find((x) => String(x.id).startsWith("CP_cp-2"));
  assert.equal(on("D3")?.kind, "cutout");
  assert.equal(on("D_CP_R1")?.kind, "cutout");
  assert.equal(on("D_CP_R2")?.kind, "groove");
  const r2 = w.boards.find((x) => x.id === "D_CP_R2")!;
  assert.deepEqual([r2.x0, r2.x1], [2000 - 45, 2000 - 30]);
  assert.ok(w.boards.every((b) => b.id !== "END_PANEL"));

  // Off the carcass → warned, nothing cut.
  const off = generateOverheadCabinet({ ...baseParams, endPanel: "left", controlPanels: [{ ...cp, fromCeiling: 30 }] });
  assert.ok(off.validation.warnings.some((x) => x.includes("runs past the overhead carcass")));
  assert.ok(off.boards.every((b) => b.id !== "D_CP_L1"));
}

function testControlPanelOnARangehoodEndUsesTheShortDivider() {
  const r = generateOverheadCabinet({
    ...baseParams,
    cabinetWidth: 1700,
    zones: [
      { id: "h", type: "rangehood_flap", width: 1000 },
      { id: "z", type: "up_flap", width: 700 },
    ],
    endPanel: "left",
    controlPanels: [{ id: "cp-1", fromCeiling: 100, fromBack: 200, width: 175, height: 60, depth: 35 }],
  });
  assert.deepEqual(r.validation.errors, []);
  const back = r.boards.find((b) => b.id === "D_CP_L1")!;
  assert.ok(back, "backing divider built");
  const hoodTop = r.boards.find((b) => b.id === "RGHD_TOP")!;
  assert.equal(back.z0, hoodTop.z1, "stands on RGHD_TOP");
  const groove = r.features.find((f) => f.id === "RGHD_TOP_D_CP_L1_GROOVE");
  assert.ok(groove, "RGHD_TOP gets the groove for it");
  assert.equal(groove!.type, "rangehood_top_divider_groove");
  const bp = r.boards.find((b) => b.id === "BP")!;
  assert.ok(!bp.faces!.find((f) => f.id === "A")!.features.some((f) => f.for === "D_CP_L1"), "no BP groove under a short divider");
  assert.equal(back.faces!.find((f) => f.id === "B")!.features.find((f) => String(f.id).startsWith("CP_"))?.kind, "groove");
}

const tests = [
  testEndPanelIsDoorStockOutsideTheCarcass,
  testControlPanelCutsThroughTheStackAndStopsOnAHalfSlot,
  testControlPanelOnARangehoodEndUsesTheShortDivider,
  testV7DividerCenterlinesFromZoneBoundaries,
  testV7ManufacturingRules,
  testV7GroovesUseSlotWidthAndClampEdges,
  testV7DividerSideProfileStyle1,
  testV7DividerSideProfileStyle2,
  testV7FrontPanelsAndHingeHoles,
  testFrontPanelXUsesOuterAndSharedClearance,
  testOpenZoneDoesNotShiftFollowingPanelDividerIndices,
  testDividerZBaseSitsOnBottomPanelTop,
  testPresetPinsHold,
  testPlacementRuleMovesADivider,
  testBoardsAreEmittedInFinalAssembledPose,
  testProvenanceCoversEveryFaceAndPoint,
  testFaceLayer,
  testFaceLayerRangehood,
  testDividerBoardThicknessUsesCptNotGrooveSlot,
  testGenerateOverheadCabinetBoardsAndFeatures,
  testRelationshipDeclarationsEmbeddedInResult,
  testSvgPreviewUsesResolvedGeometry,
  testFrontViewOpeningsFollowTheBoards,
  testInvalidWidthReportsError,
  testT3LedGrooveOption,
  testNceSingleRangehoodZoneGeometry,
  testAdjacentRangehoodZonesMergeAndMoveInternalDivider,
  testRangehoodValidation,
  testSplitOnAZoneLineButtsTwoDividers,
];

for (const test of tests) {
  test();
  console.log(`TEST ${test.name}: PASS`);
}
