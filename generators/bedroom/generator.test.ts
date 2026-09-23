import assert from "node:assert/strict";
import {
  bedBoxSizeFor,
  bedFrameWidth,
  equalOhcZones,
  generateBedroom,
  generateBedroomSvgPreview,
  layoutLimits,
  RULES,
  sectionYZ,
  setLayout,
  setOhcBoundary,
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
  // Style 1 split: floor (boot + 197) + 80 … T3 top − 4 − 300.
  assert.deepEqual(layoutLimits(p, "fixedPanelTop"), { min: 398 + 197 + 80, max: 1737.5 - 4 - 300 });
  // setLayout clamps, rounds to 0.1 and returns the same object when nothing changes.
  assert.equal(setLayout(p, "ohcBottom", 5000).ohcBottom, 1638);
  assert.equal(setLayout(p, "bootHeight", 0).bootHeight, 200);
  assert.equal(setLayout(p, "wardrobeWidth", 360.04).wardrobeWidth, 360);
  assert.equal(setLayout(p, "wardrobeWidth", 330), p);
  assert.equal(setLayout(p, "wardrobeWidth", 900).wardrobeWidth, 383.5);
  assert.equal(setLayout(p, "fixedPanelTop", 50).fixedPanelTop, 398 + 197 + 80);
  assert.equal(setLayout(p, "fixedPanelTop", 2000).fixedPanelTop, 1737.5 - 4 - 300);
  // Raising the boot pushes the wardrobe floor through the split — clamp the split up with it.
  assert.equal(setLayout(p, "bootHeight", 700).fixedPanelTop, 700 + 197 + 80);
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
  assert.match(errs({ fixedPanelTop: 600 }).join(";"), /fixed panel top 600 leaves only 5 mm of panel/);
  assert.match(errs({ fixedPanelTop: 1500 }).join(";"), /fixed panel top 1500 leaves only 233.5 mm of door/);
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
  assert.equal(r.zones.find((z) => z.id === "opening")!.boards, undefined);
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
  const wardIds = r.boards.map((b) => b.id).filter((id) => !id.startsWith("OHC_"));
  assert.deepEqual(wardIds.slice(3), ["WARD_L_STRIP", "WARD_R_STRIP", "WARD_L_PANEL", "WARD_R_PANEL", "WARD_L_SHELF", "WARD_R_SHELF", "WARD_L_T3", "WARD_R_T3", "T2", "T1", "WARD_L_FIXED", "WARD_R_FIXED", "WARD_L_DOOR", "WARD_R_DOOR"]);
  const strip = by.get("WARD_L_STRIP")!;
  assert.equal(strip.stock!.kind, "carcass");
  assert.equal(strip.materialThickness, 15);
  assert.deepEqual([strip.x0, strip.x1, strip.y0, strip.y1, strip.z0], [0, 15, 0, 175, 398]);
  assert.deepEqual(strip.profileVector!.map((q) => [(q as { y: number }).y, (q as { z: number }).z]), [
    [0, 398], [175, 398], [175, 604.5], [75, 604.5], [75, 620.5], [175, 620.5], [175, 1749.4], [66, 1773.5], [66, 1738.5], [82, 1738.5], [82, 1722.5], [0, 1722.5],
  ]);
  const shelf = by.get("WARD_L_SHELF")!;
  assert.equal(shelf.stock!.kind, "carcass");
  assert.deepEqual([shelf.x0, shelf.x1, shelf.y0, shelf.y1, shelf.z0, shelf.z1], [0, 321.5, 0, 756, 605, 620]);
  assert.deepEqual(shelf.profileVector!.map((q) => [(q as { x: number }).x, (q as { y: number }).y]), [
    [15.5, 0], [314, 0], [314, 257], [321.5, 257], [321.5, 499], [314, 499], [314, 756], [0, 756], [0, 75], [15.5, 75],
  ]);
  const groove = by.get("WARD_L_PANEL")!.faces!.find((f) => f.id === "B")!.features.find((f) => f.id === "GR_SHELF")!;
  assert.equal(groove.kind, "groove");
  assert.equal(groove.depth, 8);
  assert.equal(groove.through, false);
  assert.deepEqual([by.get("WARD_R_STRIP")!.x0, by.get("WARD_R_STRIP")!.x1], [2260, 2275]);
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
  assert.deepEqual(r.zones.find((z) => z.id === "wardrobeL")!.boards, ["WARD_L_STRIP", "WARD_L_PANEL", "WARD_L_SHELF", "WARD_L_T3", "WARD_L_FIXED", "WARD_L_DOOR"]);
  assert.ok(r.zones.find((z) => z.id === "ohc")!.boards!.length > 0);
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

function testStyle1WardrobeFronts() {
  const r = generateBedroom(style3.params as never);
  const by = new Map(r.boards.map((b) => [b.id, b]));
  assert.deepEqual(r.layout.front, { style: "style1", floorTop: 595, fixedPanelTop: 775, doorBottom: 779, doorTop: 1737.5, clearance: 4 });
  const fl = by.get("WARD_L_FIXED")!;
  const fr = by.get("WARD_R_FIXED")!;
  const dl = by.get("WARD_L_DOOR")!;
  const dr = by.get("WARD_R_DOOR")!;
  // Fixed panel: wall → colour-panel opening face, wardrobe floor → the dragged split; hangs at y −16…0.
  assert.deepEqual([fl.x0, fl.x1, fl.y0, fl.y1, fl.z0, fl.z1], [0, 330, -16, 0, 595, 775]);
  assert.deepEqual([fr.x0, fr.x1, fr.y0, fr.y1, fr.z0, fr.z1], [1945, 2275, -16, 0, 595, 775]);
  // Door: wall + 4 → colour panel, split + 4 → T3 top.
  assert.deepEqual([dl.x0, dl.x1, dl.y0, dl.y1, dl.z0, dl.z1], [4, 330, -16, 0, 779, 1737.5]);
  assert.deepEqual([dr.x0, dr.x1, dr.y0, dr.y1, dr.z0, dr.z1], [1945, 2271, -16, 0, 779, 1737.5]);
  for (const b of [fl, fr, dl, dr]) {
    assert.equal(b.stock!.kind, "door");
    assert.equal(b.materialThickness, 16);
    assert.equal(b.profilePlane, "XZ");
    assert.equal(b.thicknessAxis, "Y");
    assert.equal(b.faces!.find((f) => f.id === "B")!.semantic, "front");
    assert.equal(b.faces!.find((f) => f.id === "B")!.normal, "-Y");
    assert.equal(b.faces!.find((f) => f.id === "A")!.semantic, "inside");
  }
  // Three cups on the inside (A = +Y = y = 0): 100 from each end, midway, 22.5 from the wall-side edge.
  const cups = dl.faces!.find((f) => f.id === "A")!.features.filter((f) => f.for === "hinge");
  assert.equal(cups.length, 3);
  assert.deepEqual(cups.map((c) => c.center), [[22.5, 100], [22.5, 479.3], [22.5, 858.5]]);
  assert.equal(cups[0]!.diameter, 35);
  assert.equal(cups[0]!.depth, 12);
  const cupsR = dr.faces!.find((f) => f.id === "A")!.features.filter((f) => f.for === "hinge");
  assert.deepEqual(cupsR.map((c) => c.center), [[303.5, 100], [303.5, 479.3], [303.5, 858.5]]);
  const e = r.debug.provenance.entries;
  assert.equal(e["front.floor.z1"].formula, "boot + RAISE");
  assert.equal(e["front.floor.z1"].terms.RAISE.name, "WARDROBE_FLOOR_RAISE_MM");
  assert.equal(e["front.door.z0"].formula, "split + CL");
  assert.equal(e["front.y0"].formula, "-DPT");
  assert.equal(e["WARD_L_DOOR.y0"].formula, "= front.y0");
  assert.equal(e["front.door.z1"].formula, "= top.T3.z1");
  assert.equal(e["WARD_L_DOOR.z1"].formula, "= front.door.z1");
  // Nook: no wardrobe fronts. The overhead divider is still a boundary.
  const nook = generateBedroom({ ...(style3.params as object), style: "nook" } as never);
  assert.equal(nook.layout.front, null);
  assert.equal(nook.boards.filter((b) => /_(DOOR|FIXED|SHELF)$/.test(b.id)).length, 0);
  assert.deepEqual(nook.boards.find((b) => b.id === "WARD_L_STRIP")!.profileVector!.slice(1, 3).map((q) => [(q as { y: number }).y, (q as { z: number }).z]), [[175, 398], [175, 1749.4]]);
  assert.deepEqual([nook.boards.find((b) => b.id === "WARD_L_PANEL")!.x0, nook.boards.find((b) => b.id === "T2")!.y1], [314, 66]);
  const nookSvg = generateBedroomSvgPreview(nook)!;
  assert.equal((nookSvg.match(/data-boundary="/g) || []).length, 5);
  assert.equal((nookSvg.match(/class="front door"/g) || []).length, 0);
}

function testMiddleOverhead() {
  const r = generateBedroom(style3.params as never);
  const by = new Map(r.boards.map((b) => [b.id, b]));
  assert.ok(r.validation.warnings.some((w) => /bottom panel is cut 18 mm past the roof/.test(w)));
  assert.equal(r.boards.some((b) => b.id === "T4" || b.id === "OHC_T4"), false);
  const bp = by.get("OHC_BP")!;
  const t3 = by.get("OHC_T3")!;
  // Door underside 1418, panel 30 above, 15 thick. Back is the roof at the panel top (453.5) plus 18.
  assert.deepEqual([bp.x0, bp.x1, bp.y0, bp.z0, bp.z1], [330, 1945, 0, 1448, 1463]);
  assert.equal(bp.y1, 471.5);
  assert.equal(r.layout.ohc!.uprightBack, 453.5);
  assert.deepEqual([t3.x0, t3.x1, t3.y0, t3.y1, t3.z0, t3.z1], [330, 1945, 0, 188, 1722.5, 1737.5]);
  // Two equal bays: side panels on the opening faces, one divider on the van centre.
  assert.deepEqual([by.get("OHC_D0")!.x0, by.get("OHC_D0")!.x1], [330, 345]);
  assert.deepEqual([by.get("OHC_D1")!.x0, by.get("OHC_D1")!.x1], [1130, 1145]);
  assert.deepEqual([by.get("OHC_D2")!.x0, by.get("OHC_D2")!.x1], [1930, 1945]);
  assert.equal(by.get("OHC_D1")!.y1, 453.5);
  assert.ok(by.get("OHC_D1")!.y1 < bp.y1);
  // T3 rear notches for this cabinet's three uprights, opening through both ends.
  const pv = t3.profileVector!.map((q) => [(q as { x: number }).x, (q as { y: number }).y]);
  assert.ok(pv.some((p) => p[0] === 330 && p[1] === 168));
  assert.ok(pv.some((p) => p[0] === 1945 && p[1] === 168));
  assert.ok(pv.some((p) => p[0] === 1129.5 && p[1] === 168));
  // Groove for the centre divider, and two cups 150 from the outer face / the centreline.
  const groove = bp.faces!.find((f) => f.id === "A")!.features.find((f) => f.id === "BG_OHC_D1")!;
  assert.equal(groove.kind, "groove");
  assert.equal(groove.depth, 7.5);
  const door = by.get("OHC_FP0")!;
  assert.deepEqual([door.x0, door.x1, door.y0, door.y1, door.z0, door.z1], [332.5, 1136.3, -16, 0, 1418, 1737.5]);
  const cups = door.faces!.find((f) => f.id === "A")!.features.filter((f) => f.for === "hinge");
  assert.equal(cups.length, 2);
  assert.equal(cups[0]!.center![0], 147.5);
  assert.equal(cups[1]!.center![0], 655);
  assert.equal(cups[0]!.center![1], 297);
  const svg = generateBedroomSvgPreview(r)!;
  assert.equal((svg.match(/class="hinge"/g) || []).length, 10);
  // Three bays: 100 from each door edge, two internal dividers.
  const three = generateBedroom({ ...(style3.params as object), ohcZones: equalOhcZones(1615, 3) } as never);
  const d3 = three.boards.find((b) => b.id === "OHC_FP0")!;
  const cups3 = d3.faces!.find((f) => f.id === "A")!.features.filter((f) => f.for === "hinge");
  assert.deepEqual(cups3.map((c) => c.center![0]), [100, round1(d3.x1 - d3.x0 - 100)]);
  assert.equal(three.boards.filter((b) => b.id.startsWith("OHC_D")).length, 4);
  const moved = setOhcBoundary(style3.params as never, 0, 1000);
  assert.equal(moved![0]!.width, 1000 - 330);
  assert.equal(round1(moved![0]!.width + moved![1]!.width), 1615);
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function testFrontViewMarksRegionsAndBoundaries() {
  const r = generateBedroom(style3.params as never);
  const svg = generateBedroomSvgPreview(r, { selectedRegion: "opening" })!;
  assert.ok(svg.startsWith("<svg"));
  assert.equal((svg.match(/data-region="/g) || []).length, 5);
  assert.equal((svg.match(/data-boundary="/g) || []).length, 7);
  assert.equal((svg.match(/data-boundary="ohcZone"/g) || []).length, 1);
  assert.equal((svg.match(/data-boundary="wardrobeWidth"/g) || []).length, 2);
  assert.equal((svg.match(/data-boundary="fixedPanelTop"/g) || []).length, 2);
  assert.match(svg, /class="front door"/);
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
  testStyle1WardrobeFronts,
  testMiddleOverhead,
  testProvenanceCoversEveryBoardFace,
  testProvenanceNamesTheLayout,
  testFrontViewMarksRegionsAndBoundaries,
];
for (const t of tests) {
  t();
  console.log("ok", t.name);
}
console.log(`bedroom generator: ${tests.length} tests passed`);
