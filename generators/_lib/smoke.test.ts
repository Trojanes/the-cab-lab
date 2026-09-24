/**
 * Cross-module smoke: every wired generator runs, bench contract holds,
 * bedroom layout + lounge polyline still work after the upstream merge.
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { planExplode, isStrong } from "../../renderer/bench/explode.js";
import { generateSmallCabinet } from "../smallCabinet/generator.ts";
import { generateOverheadCabinet } from "../overheadCabinet/generator.ts";
import { generateBedroom, setLayout, bedBoxSizeFor } from "../bedroom/generator.ts";
import { generateBedBox } from "../bedBox/generator.ts";
import { generateKitchenCabinet } from "../kitchen/generator.ts";
import { generateGeneralTall } from "../generalTall/generator.ts";
import { generateLounge } from "../lounge/generator.ts";
import { loungeFootprintBoxes, loungeFromPolyline, pointInFootprintBoxes } from "../lounge/place.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function faceRefs(name: string, result: { joints?: Array<{ id?: string; a?: { board?: string }; b?: { board?: string } }> }) {
  for (const j of result.joints ?? []) {
    assert.equal(typeof j.a?.board, "string", `${name} ${j.id} a.board`);
    assert.equal(typeof j.b?.board, "string", `${name} ${j.id} b.board`);
  }
}

function provenance(name: string, result: { boards?: Array<{ id: string; x0: number }>; debug?: { provenance?: { entries?: Record<string, { value: number }> }; boardFrame?: string } }) {
  const entries = result.debug?.provenance?.entries ?? {};
  assert.ok(Object.keys(entries).length > 0, `${name}: provenance`);
  assert.equal(result.debug?.boardFrame, "final", `${name}: boardFrame`);
  for (const b of result.boards ?? []) {
    const e = entries[`${b.id}.x0`];
    assert.ok(e, `${name} ${b.id}.x0 missing`);
    assert.equal(e.value, b.x0, `${name} ${b.id}.x0`);
  }
}

function explode(name: string, result: { boards: Array<{ id: string; category?: string }>; joints?: unknown[] }) {
  const { rels, order } = planExplode(result);
  assert.ok(rels.size > 0, `${name}: explode relations`);
  assert.ok([...rels.values()].some(isStrong), `${name}: strong explode relation`);
  const fronts = result.boards.filter((b) => b.category === "front_panel").map((b) => b.id);
  if (fronts.length) {
    const firstFront = Math.min(...fronts.map((id) => order.indexOf(id)));
    assert.ok(order.slice(firstFront).every((id) => fronts.includes(id)), `${name}: fronts last`);
  }
}

/* ---- small / OHC ---- */
{
  const small = generateSmallCabinet({ cabinetWidth: 600, cabinetDepth: 560, cabinetHeight: 720, zones: [{ id: "z", type: "left_door", height: 688 }] });
  assert.equal(small.validation.errors.length, 0, "small errors");
  assert.ok(small.boards.length >= 4, "small boards");
}

{
  const ohc = generateOverheadCabinet({
    cabinetWidth: 2000, cabinetDepth: 400, cabinetHeight: 400,
    zones: [{ type: "up_flap", width: 2000 / 3 }, { type: "up_flap", width: 2000 / 3 }, { type: "up_flap", width: 2000 / 3 }],
  });
  assert.equal(ohc.validation.errors.length, 0, "ohc errors");
  provenance("ohc", ohc);
  faceRefs("ohc", ohc);
  explode("ohc", ohc);
}

/* ---- bedroom + bed box (upstream) ---- */
{
  const body = generateBedroom({
    width: 2275, depth: 756, height: 1788,
    roofProfile: [[0, 1788], [177, 1749], [756, 1150]],
    bootHeight: 398, wardrobeWidth: 330, ohcBottom: 1418,
  });
  assert.equal(body.validation.errors.length, 0, `bedroom errors: ${body.validation.errors.join("; ")}`);
  assert.ok(body.zones?.length >= 5, "bedroom 5 regions");
  assert.ok(body.boards.some((b) => b.id === "BOOT_DECK"), "BOOT_DECK");
  assert.ok(body.boards.some((b) => b.id === "WARD_L_PANEL"), "WARD_L_PANEL");
  provenance("bedroom", body);
  faceRefs("bedroom", body);
  explode("bedroom", body);
  const size = bedBoxSizeFor(body.params);
  assert.equal(size.W, 1508, "queen frame width");
  assert.equal(size.H, 398, "boot height drives bed box H");
  const next = setLayout(body.params, "bootHeight", 420);
  assert.equal(next.bootHeight, 420);
  const box = generateBedBox({ width: size.W, depth: 979, height: size.H });
  assert.equal(box.validation.errors.length, 0, "bedBox errors");
  assert.equal(box.boards.length, 12, "bedBox 12 boards");
  provenance("bedBox", box);
  faceRefs("bedBox", box);
  explode("bedBox", box);
}

/* ---- kitchen / tall / lounge (local) ---- */
{
  const kitchen = generateKitchenCabinet({
    globalSettings: { length: 887, depth: 270, height: 880 },
    materialThickness: 15, frontThickness: 16, frontClearance: 2.5,
    bottomClearanceHeight: 55, bottomClearanceStyle: "style_1", lockEnabled: true,
    columns: [
      { id: "k-col-1", width: 444, zones: [{ id: "c1-door", height: 825, zoneType: "left_door", shelfEnabled: true, shelfHeight: 400, leftSidePanelOptions: { panelType: "door", frontVisible: true, bchNotchEnabled: false, strengtheningStripEnabled: true } }] },
      { id: "k-col-2", width: 443, zones: [{ id: "c2-drawer", height: 300, zoneType: "drawer" }, { id: "c2-door", height: 525, zoneType: "right_door", shelfEnabled: false }] },
    ],
  });
  assert.ok(kitchen.boards.length >= 16, "kitchen boards");
  provenance("kitchen", kitchen);
  faceRefs("kitchen", kitchen);
  explode("kitchen", kitchen);
}

{
  const tall = generateGeneralTall({
    cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584,
    panelThickness: 16, frontPanelThickness: 16, ziThickness: 15, hThickness: 15,
    sideClearance: 3, dividerThickness: 15,
    topSystem: { style: "style_1", frontRailHeight: 40 },
    bottomSystem: { style: "style_1", frontRailHeight: 53 },
    zones: [
      { id: "zone-1", type: "side_door", height: 600 },
      { id: "zone-2", type: "drawer", height: 300 },
      { id: "zone-3", type: "double_door", height: 945, verticalDivider: true },
    ],
  });
  assert.equal(tall.validation.errors.length, 0, `tall errors: ${tall.validation.errors.join("; ")}`);
  provenance("tall", tall);
  faceRefs("tall", tall);
  explode("tall", tall);
}

{
  const lounge = generateLounge({
    style: "L_SHAPE", height: 420, partitionPanelThickness: 18,
    mainWidth: 2000, mainDepth: 600, lWidth: 1600, lDepth: 800, lPosition: "RIGHT", topLidEnabled: true,
  });
  assert.equal(lounge.validation.errors.length, 0);
  provenance("lounge", lounge);
  faceRefs("lounge", lounge);
  explode("lounge", lounge);
  const boxes = loungeFootprintBoxes(lounge.params, lounge);
  assert.equal(pointInFootprintBoxes(200, 100, boxes), false, "L notch empty");
  assert.ok(pointInFootprintBoxes(200, 1200, boxes), "main run");
  assert.ok(pointInFootprintBoxes(1600, 200, boxes), "L return");
  assert.equal(loungeFromPolyline([{ x: 0, y: 600 }, { x: 2000, y: 600 }]).params.style, "I_SHAPE");
  assert.equal(loungeFromPolyline([{ x: 0, y: 600 }, { x: 2000, y: 600 }, { x: 2000, y: 800 }]).params.style, "L_SHAPE");
  assert.equal(loungeFromPolyline([{ x: 0, y: 800 }, { x: 1500, y: 800 }, { x: 4000, y: 800 }]).params.style, "PARALLEL");
  assert.equal(loungeFromPolyline([{ x: 0, y: 0 }, { x: 0, y: 1600 }, { x: 2000, y: 1600 }, { x: 2000, y: 0 }]).params.style, "U_SHAPE");
  explode("lounge-U", generateLounge({ style: "U_SHAPE", height: 420, mainWidth: 2000, mainDepth: 1600, lDepth: 600, topLidEnabled: false }));
  explode("lounge-Parallel", generateLounge({ style: "PARALLEL", height: 420, totalWidth: 4000, singleLoungeWidth: 1500, depth: 800, topLidEnabled: true }));
  explode("tall-style2", generateGeneralTall({
    cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584,
    panelThickness: 16, frontPanelThickness: 16,
    topSystem: { style: "style_2" }, bottomSystem: { style: "style_2" },
    zones: [{ id: "open", type: "open_space", height: 1820 }],
  }));
}

/* ---- bench + bundle wiring ---- */
{
  const genDir = join(root, "generators");
  const benchable = readdirSync(genDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && existsSync(join(genDir, d.name, "presets.json")))
    .map((d) => d.name)
    .sort();
  for (const id of ["overheadCabinet", "bedroom", "bedBox", "kitchen", "generalTall", "lounge"]) {
    assert.ok(benchable.includes(id), `bench lists ${id}`);
  }
  const bundles = ["smallCabinet", "overheadCabinet", "bedroom", "bedBox", "kitchen", "generalTall", "lounge", "pins"];
  for (const name of bundles) {
    assert.ok(existsSync(join(root, "renderer", "gen", `${name}.js`)), `bundle ${name}.js`);
  }
}

/* ---- renderer adapters + upstream wall trim + floor-plan lounge hook ---- */
{
  if (!globalThis.window) {
    globalThis.window = { cablab: null, addEventListener() {}, removeEventListener() {} };
  } else if (typeof globalThis.window.addEventListener !== "function") {
    globalThis.window.addEventListener = () => {};
    globalThis.window.removeEventListener = () => {};
  }
  const { MODULES, generatorDir, moduleIdForGenerator } = await import("../../renderer/modules.js");
  const { resolveSpace } = await import("../../renderer/spaces.js");
  const { builtInStock } = await import("../../renderer/materials.js");
  const { trimToFaces, wallBoxes } = await import("../../renderer/walls.js");
  const { readFileSync } = await import("node:fs");

  for (const id of ["smallCabinet", "overheadCabinet", "bedroom", "bedBox", "kitchenCabinet", "generalTallCabinet", "loungeGenerator"]) {
    const m = MODULES[id];
    assert.ok(m, `MODULES.${id}`);
    const { W, D, H } = m.defaultSize;
    const params = m.defaults(W, D, H);
    const result = m.generate(params);
    const errs = result.validation?.errors ?? [];
    assert.equal(errs.length, 0, `${id} defaults: ${errs.join("; ")}`);
    const env = m.envelope(params);
    assert.ok(env.W > 0 && env.D > 0 && env.H > 0, `${id} envelope`);
    // Colour faces: every visible door-stock face carries the cabinet's door colour name.
    if (params.doorColorName) {
      for (const b of result.boards ?? []) {
        if (b.stock?.kind !== "door") continue;
        const shown = (b.faces ?? []).filter((f) => (f.id === "A" || f.id === "B") && f.visible === true);
        assert.ok(shown.length > 0, `${id} ${b.id}: door stock without a visible face`);
        for (const f of shown) assert.equal(f.finish?.colour, params.doorColorName, `${id} ${b.id}.${f.id} colour`);
      }
    }
    if (typeof m.footprintBoxes === "function") {
      const boxes = m.footprintBoxes(params, result);
      assert.ok(boxes.length >= 2, `${id} multi-rect footprint`);
    }
    if (id === "bedroom") {
      assert.ok((result.zones ?? []).length >= 5, "bedroom adapter zones");
      assert.ok(result.boards.some((b) => b.id === "BOOT_DECK"), "bedroom adapter BOOT_DECK");
    }
    if (id === "bedBox") assert.equal(result.boards.length, 12, "bedBox adapter 12 boards");
  }

  const resolved = resolveSpace({ kind: "box", params: { width: 4000, depth: 3000, height: 2400, walls: [0, 1, 2, 3] } });
  const stock = builtInStock();
  const host = { id: "W-host", axis: "y", at: 1500, u0: 0, u1: 2000, side: 1, openings: [] };
  const incoming = { id: "W-in", axis: "x", at: 1000, u0: 1509, u1: 2500, side: 1, openings: [] };
  const others = wallBoxes([host], resolved, stock);
  const trim = trimToFaces(incoming, resolved, stock, others);
  assert.equal(trim.wall.u0, 1518, "trimToFaces stops on host face");
  assert.ok(trim.trimmed.lo, "trimToFaces records lo");

  assert.equal(moduleIdForGenerator("kitchen"), "kitchenCabinet");
  assert.equal(moduleIdForGenerator("generalTall"), "generalTallCabinet");
  assert.equal(moduleIdForGenerator("lounge"), "loungeGenerator");
  assert.equal(generatorDir("kitchenCabinet"), "kitchen");
  for (const id of Object.keys(MODULES)) {
    assert.ok(existsSync(join(root, "generators", generatorDir(id), "presets.json")) || id === "smallCabinet", `${id} presets or smallCabinet`);
  }

  const html = readFileSync(join(root, "renderer", "index.html"), "utf8");
  assert.ok(html.includes('data-fp-tool="lounge"'), "Lounge tool button");
  const fp = readFileSync(join(root, "renderer", "floorplan.js"), "utf8");
  assert.ok(fp.includes("loungeFromDrawnRun"), "floorplan loungeFromDrawnRun");
  assert.ok(fp.includes('step: "corner"') && fp.includes('step === "height"'), "floorplan lounge face then height");
  const modulesSrc = readFileSync(join(root, "renderer", "modules.js"), "utf8");
  assert.ok(modulesSrc.includes('lounge: "I"') && modulesSrc.includes('lounge: "L"') && !modulesSrc.includes('lounge: "U"'), "Lounge rail is I and L");
  const interact = readFileSync(join(root, "renderer", "interact.js"), "utf8");
  assert.ok(interact.includes("startLounge") && interact.includes("loungeFromDrawnRun"), "lounge draws in the 3D view");
  assert.ok(fp.includes('e.key === "g"'), "floorplan G shortcut");
  const c3 = readFileSync(join(root, "renderer", "cabinets3d.js"), "utf8");
  assert.ok(c3.includes("export function cabinetFootprints"), "cabinetFootprints");
}

console.log("smoke: all wired generators + bench + lounge place + bedroom layout + renderer adapters OK");
