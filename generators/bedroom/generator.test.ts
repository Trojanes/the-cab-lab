import assert from "node:assert/strict";
import {
  bedBoxSizeFor,
  bedFrameWidth,
  generateBedroom,
  generateBedroomSvgPreview,
  layoutLimits,
  RULES,
  sectionYZ,
  setLayout,
} from "./generator.ts";
import { checkPins, countPins, type PresetsFile } from "../_lib/pins.ts";
import presetsRaw from "./presets.json" with { type: "json" };

const presets = presetsRaw as PresetsFile;
const style3 = presets.presets.find((p) => p.id === "style3")!;

function testPresetsPinned() {
  for (const preset of presets.presets) {
    const result = generateBedroom(preset.params as never);
    assert.deepEqual(result.validation.errors, [], `${preset.id}: ${result.validation.errors.join("; ")}`);
    assert.ok(countPins(preset.pins) > 0, `${preset.id} has no pins`);
    const bad = checkPins(result, preset.pins);
    assert.deepEqual(bad, [], `${preset.id}: ${bad.map((m) => `${m.path} expected ${m.expected} got ${m.actual}`).join("; ")}`);
  }
}

function testRegionsTileTheEnvelopeWithoutOverlap() {
  const r = generateBedroom(style3.params as never);
  assert.equal(r.zones.length, 5);
  assert.deepEqual(r.zones.map((z) => z.id), ["boot", "wardrobeL", "wardrobeR", "opening", "ohc"]);
  // No two regions share volume: compare boxes at the room face (y = 0 slice).
  for (let i = 0; i < r.zones.length; i += 1) {
    for (let j = i + 1; j < r.zones.length; j += 1) {
      const a = r.zones[i];
      const b = r.zones[j];
      const overlapX = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
      const overlapZ = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
      assert.ok(overlapX <= 1e-6 || overlapZ <= 1e-6, `${a.id} overlaps ${b.id}`);
    }
  }
  // Together they cover the room-face rectangle exactly (areas add up).
  const area = r.zones.reduce((s, z) => s + (z.x1 - z.x0) * (z.z1 - z.z0), 0);
  assert.equal(Math.round(area), 2275 * 1788);
  // Only the opening is a void.
  assert.deepEqual(r.zones.filter((z) => z.kind === "void").map((z) => z.id), ["opening"]);
  // Derived numbers.
  assert.equal(r.layout.openingWidth, 1615);
  assert.equal(r.layout.openingHeight, 1020);
  assert.equal(r.layout.ohcHeight, 370);
  assert.equal(r.layout.bedFrameWidth, 1508);
  assert.equal(r.layout.bedMargin, 53.5);
  assert.equal(r.layout.roofMin, 1150);
}

function testRoofCutsTheUpperRegions() {
  const r = generateBedroom(style3.params as never);
  const ward = r.zones.find((z) => z.id === "wardrobeL")!;
  // Wardrobe section: floor at the boot deck, full depth, the ceiling sloping 12° from the room face (1788) to
  // y 177 (1749), then the 46° nose down to 1150.
  assert.deepEqual(ward.outlineYZ, [
    { y: 0, z: 398 }, { y: 756, z: 398 }, { y: 756, z: 1150 }, { y: 177, z: 1749 }, { y: 0, z: 1788 }, { y: 0, z: 398 },
  ]);
  // Overhead: ends where the nose meets its underside (1418) — 177 + (1749 − 1418) × 579 / 599.
  const ohc = r.zones.find((z) => z.id === "ohc")!;
  assert.equal(ohc.y1, 496.9);
  assert.deepEqual(ohc.outlineYZ, [
    { y: 0, z: 1418 }, { y: 496.9, z: 1418 }, { y: 177, z: 1749 }, { y: 0, z: 1788 }, { y: 0, z: 1418 },
  ]);
  // The opening's top follows the overhead underside, then the roof.
  const opening = r.zones.find((z) => z.id === "opening")!;
  assert.deepEqual(opening.outlineYZ.map((p) => [p.y, p.z]), [[0, 398], [756, 398], [756, 1150], [496.9, 1418], [177, 1418], [0, 1418], [0, 398]]);
  // A region entirely above the roof at the room face does not exist.
  assert.equal(sectionYZ([[0, 1000], [700, 800]], 700, 1000, 1200, 1500), null);
}

function testLayoutLimitsAndClamping() {
  const p = style3.params as never as Parameters<typeof setLayout>[0];
  assert.deepEqual(layoutLimits(p, "bootHeight"), { min: RULES.BOOT_HEIGHT_MIN_MM.value, max: 1418 - RULES.OPENING_HEIGHT_MIN_MM.value });
  assert.deepEqual(layoutLimits(p, "ohcBottom"), { min: 398 + RULES.OPENING_HEIGHT_MIN_MM.value, max: 1788 - RULES.OHC_HEIGHT_MIN_MM.value });
  // The wardrobes may close in only until the opening equals the bed frame.
  assert.deepEqual(layoutLimits(p, "wardrobeWidth"), { min: RULES.WARDROBE_WIDTH_MIN_MM.value, max: (2275 - RULES.BED_FRAME_QUEEN_WIDTH_MM.value) / 2 });
  // setLayout clamps, rounds to 0.1 and returns the same object when nothing changes.
  assert.equal(setLayout(p, "ohcBottom", 5000).ohcBottom, 1638);
  assert.equal(setLayout(p, "bootHeight", 0).bootHeight, 200);
  assert.equal(setLayout(p, "wardrobeWidth", 360.04).wardrobeWidth, 360);
  assert.equal(setLayout(p, "wardrobeWidth", 330), p);
  assert.equal(setLayout(p, "wardrobeWidth", 900).wardrobeWidth, 383.5);
  // Symmetry is a rule: one wardrobe width moves both inner faces.
  const r = generateBedroom(setLayout(p, "wardrobeWidth", 360));
  assert.equal(r.zones.find((z) => z.id === "wardrobeL")!.x1, 360);
  assert.equal(r.zones.find((z) => z.id === "wardrobeR")!.x0, 1915);
  assert.equal(r.zones.find((z) => z.id === "ohc")!.x0, 360);
}

function testValidationReportsEveryLimit() {
  const p = style3.params as never as Record<string, unknown>;
  const errs = (patch: Record<string, unknown>) => generateBedroom({ ...p, ...patch } as never).validation.errors;
  assert.match(errs({ bootHeight: 100 }).join(";"), /tunnel boot 100 is lower than/);
  assert.match(errs({ wardrobeWidth: 100 }).join(";"), /wardrobe 100 is narrower/);
  assert.match(errs({ wardrobeWidth: 400 }).join(";"), /leave only 1475 mm between them — the queen bed frame needs 1508/);
  assert.match(errs({ ohcBottom: 600 }).join(";"), /only 202 mm between the boot deck and the overhead/);
  assert.match(errs({ ohcBottom: 1700 }).join(";"), /overhead is only 88 mm high/);
  // Errors → no regions, no boards, no front view.
  const bad = generateBedroom({ ...p, ohcBottom: 600 } as never);
  assert.equal(bad.zones.length, 0);
  assert.equal(bad.boards.length, 0);
  assert.equal(generateBedroomSvgPreview(bad), null);
  // An unknown bed frame falls back to queen.
  assert.equal(generateBedroom({ ...p, bedFrame: "kingsize" } as never).params.bedFrame, "queen");
}

function testBedFrameSetsTheBedBox() {
  const p = style3.params as never as Parameters<typeof bedBoxSizeFor>[0];
  assert.equal(bedFrameWidth("queen"), 1508);
  assert.deepEqual(bedBoxSizeFor(p), { W: 1508, H: 398 });
  assert.deepEqual(bedBoxSizeFor(setLayout(p, "bootHeight", 418)), { W: 1508, H: 418 });
  const r = generateBedroom(p);
  const e = r.debug.provenance.entries;
  assert.equal(e["bedBox.W"].terms.BED.kind, "rule");
  assert.equal(e["bedBox.W"].terms.BED.name, "BED_FRAME_QUEEN_WIDTH_MM");
  assert.equal(e["bedBox.x0"].value, (2275 - 1508) / 2);
  assert.equal(e["layout.bedMargin"].value, 53.5);
}

function testTunnelBootBoards() {
  const r = generateBedroom(style3.params as never);
  assert.deepEqual(r.boards.map((b) => b.id).slice(0, 3), ["BOOT_DECK", "BOOT_BACK", "BOOT_FRONT"]);
  const bootBoards = r.boards.filter((b) => b.zoneId === "boot");
  const bootJoints = r.joints.filter((j) => j.id.startsWith("BOOT_"));
  const by = new Map(r.boards.map((b) => [b.id, b]));
  const deck = by.get("BOOT_DECK")!;
  const back = by.get("BOOT_BACK")!;
  const front = by.get("BOOT_FRONT")!;
  // Deck: wall to wall, full depth, 18 thick, top at bootHeight.
  assert.equal(deck.materialThickness, RULES.BOOT_DECK_THICKNESS_MM.value);
  assert.deepEqual([deck.x0, deck.x1, deck.y0, deck.y1, deck.z0, deck.z1], [0, 2275, 0, 756, 380, 398]);
  assert.equal(deck.profilePlane, "XY");
  assert.equal(deck.thicknessAxis, "Z");
  // Uprights: carcass stock (15 here), floor → deck underside, outer faces on the room face / at the depth.
  for (const up of [back, front]) {
    assert.equal(up.materialThickness, 15);
    assert.equal(up.profilePlane, "XZ");
    assert.deepEqual([up.x0, up.x1, up.z0, up.z1], [0, 2275, 0, 380]);
    assert.equal(up.z1, deck.z0);
  }
  assert.deepEqual([back.y0, back.y1], [0, 15]);
  assert.deepEqual([front.y0, front.y1], [741, 756]);
  // The boot region lists its boards; the opening and overhead are still blocks.
  assert.deepEqual(r.zones.find((z) => z.id === "boot")!.boards, ["BOOT_DECK", "BOOT_BACK", "BOOT_FRONT"]);
  assert.ok(r.zones.filter((z) => z.id === "opening" || z.id === "ohc").every((z) => !z.boards));
  assert.equal(bootBoards.length, 3);
  // Face layer: A / B + four edges each, stock and the room-side annotation.
  for (const b of bootBoards) {
    assert.equal(b.faces!.length, 6, `${b.id} faces`);
    assert.equal(b.stock!.kind, "carcass");
    assert.equal(b.stock!.thickness, b.materialThickness);
  }
  assert.equal(deck.faces!.find((f) => f.id === "A")!.semantic, "top");
  assert.equal(back.faces!.find((f) => f.id === "B")!.semantic, "front");
  assert.equal(back.faces!.find((f) => f.id === "B")!.normal, "-Y");
  // Joints: the deck rests on the top edge of each upright.
  assert.deepEqual(bootJoints.map((j) => [j.id, j.kind, j.a.board, j.b.board]), [
    ["BOOT_BACK_deck", "butt", "BOOT_DECK", "BOOT_BACK"],
    ["BOOT_FRONT_deck", "butt", "BOOT_DECK", "BOOT_FRONT"],
  ]);
  for (const j of bootJoints) {
    assert.deepEqual(j.a.faces, ["B"]);
    assert.equal(j.b.faces.length, 1);
    const up = by.get(j.b.board)!;
    assert.equal(up.faces!.find((f) => f.id === j.b.faces[0])!.normal, "+Z");
  }
  // The boot follows bootHeight; the uprights follow the carcass stock.
  const r2 = generateBedroom({ ...(style3.params as object), bootHeight: 418, panelThickness: 18 } as never);
  const deck2 = r2.boards.find((b) => b.id === "BOOT_DECK")!;
  const back2 = r2.boards.find((b) => b.id === "BOOT_BACK")!;
  assert.deepEqual([deck2.z0, deck2.z1], [400, 418]);
  assert.deepEqual([back2.y1, back2.z1], [18, 400]);
  // A roof that comes down onto the deck before the nose is an error, not a shortened boot.
  const low = generateBedroom({ ...(style3.params as object), roofProfile: [[0, 1797], [300, 1797], [756, 200]] } as never);
  assert.match(low.validation.errors.join(";"), /roof comes down to 200 mm at the nose, below the boot deck/);
  assert.equal(low.boards.length, 0);
}

function testWardrobeTop() {
  const r = generateBedroom(style3.params as never);
  const by = new Map(r.boards.map((b) => [b.id, b]));
  assert.deepEqual(r.boards.map((b) => b.id).slice(3), ["WARD_L_PANEL", "WARD_R_PANEL", "WARD_L_T3", "WARD_R_T3", "T2", "T1"]);
  // One fixed distance (T2 back 66) + the roof there set the T3 seat: roof(66) = 1788 − 66 × 39 / 177 = 1773.5.
  assert.deepEqual(r.layout.top, { seat: 1722.5, t3Top: 1737.5, roofAtT2: 1773.5, t2Height: 35 });
  // Colour panel: door stock on the opening side, deck → roof, seat in front of the T2 back, pocket behind it.
  const pl = by.get("WARD_L_PANEL")!;
  assert.equal(pl.stock!.kind, "door");
  assert.equal(pl.materialThickness, 16);
  assert.deepEqual([pl.x0, pl.x1, pl.y0, pl.y1, pl.z0, pl.z1], [314, 330, 0, 756, 398, 1773.5]);
  assert.deepEqual(pl.profileVector!.map((q) => [(q as { y: number }).y, (q as { z: number }).z]), [
    [0, 398], [756, 398], [756, 1150], [177, 1749], [66, 1773.5], [66, 1738.5], [82, 1738.5], [82, 1722.5], [0, 1722.5],
  ]);
  assert.equal(pl.faces!.find((f) => f.id === "A")!.visible, true); // +X: into the opening
  assert.equal(pl.faces!.find((f) => f.id === "A")!.finish!.colour, "Gloss White");
  const pr = by.get("WARD_R_PANEL")!;
  assert.deepEqual([pr.x0, pr.x1], [1945, 1961]);
  assert.equal(pr.faces!.find((f) => f.id === "B")!.visible, true); // −X: into the opening
  // The seat edge is tagged as a notch for T3 and joined to it.
  const seatTags = pl.faces!.filter((f) => f.features.some((ft) => ft.kind === "notch" && ft.for === "WARD_L_T3"));
  assert.equal(seatTags.length, 1);
  assert.equal(r.joints.find((j) => j.id === "WARD_L_T3_seat")!.b.faces[0], seatTags[0].id);
  // T3: on the seat, 188 deep, over the panel for its 77 tail, then notched back to the panel's wall side.
  const t3 = by.get("WARD_L_T3")!;
  assert.deepEqual([t3.x0, t3.x1, t3.y0, t3.y1, t3.z0, t3.z1], [0, 330, 0, 188, 1722.5, 1737.5]);
  assert.deepEqual(t3.profileVector!.map((q) => [(q as { x: number }).x, (q as { y: number }).y]), [[0, 0], [330, 0], [330, 77], [314, 77], [314, 188], [0, 188]]);
  const t3r = by.get("WARD_R_T3")!;
  assert.deepEqual(t3r.profileVector!.map((q) => [(q as { x: number }).x, (q as { y: number }).y]), [[1945, 0], [2275, 0], [2275, 188], [1961, 188], [1961, 77], [1945, 77]]);
  // T2 stands on T3 (+1), back at 66, top at the roof there; T1 in front of it, 20 above the roof at its back.
  const t2 = by.get("T2")!;
  assert.deepEqual([t2.x0, t2.x1, t2.y0, t2.y1, t2.z0, t2.z1], [0, 2275, 51, 66, 1738.5, 1773.5]);
  const t1 = by.get("T1")!;
  assert.deepEqual([t1.y0, t1.y1, t1.z0, t1.z1], [35, 51, 1738.5, 1796.8]);
  assert.ok(t1.z1 > 1788, "T1 is oversize above the room-face ceiling");
  assert.match(r.validation.warnings.join(";"), /T1 is cut 20 mm above the roof by design/);
  // Regions: wardrobes list their boards; the opening and overhead are still blocks.
  assert.deepEqual(r.zones.find((z) => z.id === "wardrobeL")!.boards, ["WARD_L_PANEL", "WARD_L_T3"]);
  assert.equal(r.zones.find((z) => z.id === "ohc")!.boards, undefined);
  // A steeper roof lowers the whole top; a flat one raises it — the T2 back stays at 66 and T2 stays 35 high.
  const steep = generateBedroom({ ...(style3.params as object), roofProfile: [[0, 1788], [66, 1700], [756, 1150]] } as never);
  assert.equal(steep.layout.top!.seat, 1700 - 36 - 15);
  assert.equal(steep.layout.top!.t2Height, 35);
  const flat = generateBedroom({ ...(style3.params as object), height: 1965, roofProfile: [[0, 1965], [756, 1965]] } as never);
  assert.equal(flat.layout.top!.seat, 1965 - 36 - 15);
  assert.equal(flat.boards.find((b) => b.id === "T1")!.z1, 1985);
  // Provenance: the seat traces back to the rule constants and the roof read at the T2 back.
  const e = r.debug.provenance.entries;
  assert.equal(e["top.roofAtT2"].formula, "roof(T2.y1)");
  assert.equal(e["top.T3.z1"].formula, "roof - T2H - CL");
  assert.equal(e["top.T3.z1"].terms.T2H.name, "WARDROBE_T2_HEIGHT_MM");
  assert.equal(e["WARD_L_PANEL.pv[6].y"].value, 82);
  assert.equal(e["T1.z1"].formula, "= top.T1.z1");
}

function testProvenanceCoversEveryBoardFace() {
  const r = generateBedroom(style3.params as never);
  const e = r.debug.provenance.entries;
  for (const b of r.boards) {
    for (const f of ["x0", "x1", "y0", "y1", "z0", "z1"] as const) {
      const entry = e[`${b.id}.${f}`];
      assert.ok(entry, `${b.id}.${f} has no provenance`);
      assert.equal(entry.value, b[f], `${b.id}.${f}`);
    }
  }
  assert.equal(e["BOOT_DECK.z1"].formula, "= boot.z1");
  assert.equal(e["BOOT_DECK.z0"].terms.DECK.kind, "rule");
  assert.equal(e["BOOT_DECK.z0"].terms.DECK.name, "BOOT_DECK_THICKNESS_MM");
  assert.equal(e["BOOT_BACK.y1"].terms.CPT.kind, "param");
  assert.equal(e["BOOT_FRONT.y0"].formula, "D - CPT");
  assert.equal(e["BOOT_BACK.z1"].formula, "= BOOT_DECK.z0");
}

function testProvenanceNamesTheLayout() {
  const r = generateBedroom(style3.params as never);
  const e = r.debug.provenance.entries;
  assert.equal(e["boot.z1"].value, 398);
  assert.equal(e["wardrobeR.x0"].formula, "W - wardrobeWidth");
  assert.equal(e["wardrobeR.x0"].terms.wardrobeWidth.kind, "param");
  assert.equal(e["layout.openingWidth"].value, 1615);
  assert.equal(e["layout.openingWidth"].terms.x1.kind, "ref");
  assert.equal(e["bedBox.W"].terms.BED.kind, "rule");
  assert.equal(e["bedBox.W"].value, 1508);
}

function testFrontViewMarksRegionsAndBoundaries() {
  const r = generateBedroom(style3.params as never);
  const svg = generateBedroomSvgPreview(r, { selectedRegion: "opening" })!;
  assert.ok(svg.startsWith("<svg"));
  assert.equal((svg.match(/data-region="/g) || []).length, 5);
  assert.equal((svg.match(/data-boundary="/g) || []).length, 4);
  assert.equal((svg.match(/data-boundary="wardrobeWidth"/g) || []).length, 2);
  assert.match(svg, /bed 1508 · 53.5 each side/);
  assert.match(svg, /class="region sel void" data-region="opening"/);
  assert.match(svg, /data-w="2275" data-h="1788"/);
}

const tests = [
  testPresetsPinned,
  testRegionsTileTheEnvelopeWithoutOverlap,
  testRoofCutsTheUpperRegions,
  testLayoutLimitsAndClamping,
  testValidationReportsEveryLimit,
  testBedFrameSetsTheBedBox,
  testTunnelBootBoards,
  testWardrobeTop,
  testProvenanceCoversEveryBoardFace,
  testProvenanceNamesTheLayout,
  testFrontViewMarksRegionsAndBoundaries,
];
for (const t of tests) {
  t();
  console.log("ok", t.name);
}
console.log(`bedroom generator: ${tests.length} tests passed`);
