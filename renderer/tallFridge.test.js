// Tall split: storage (outer width fixed) and fridge (cut-out fixed), the fridge cabinet's zone rules,
// and the neighbour yield plan (which face gives way, how far) — through the modules and the generator.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
const { MODULES, MODULE_GROUPS, fridgeFix, fridgeParts, fridgeRuleIssues } = await import("./modules.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const fridgeMod = MODULES.tallFridgeCabinet;
const storage = MODULES.generalTallCabinet;
const clean = (params, what) => {
  const r = fridgeMod.generate(params);
  assert(r.validation.errors.length === 0, `${what}: ${JSON.stringify(r.validation.errors)}`);
  return r;
};

// Rail: one Tall group with both; storage no longer offers a fridge.
{
  const g = MODULE_GROUPS.find((x) => x.id === "tall");
  assert(g && g.items.map((i) => i.moduleId).join() === "generalTallCabinet,tallFridgeCabinet", "Tall group: storage, fridge");
  assert(!storage.zoneTypes.some((t) => t.id === "fridge"), "storage has no fridge zone type");
  assert(!storage.presets.some((pr) => pr.params.zones.some((z) => z.type === "fridge")), "storage presets have no fridge");
  assert(fridgeMod.presets.some((pr) => pr.id === "rogue-dometic"), "the fridge cabinet offers Rogue Dometic");
  assert(storage.moduleIdFor({ zones: [{ type: "fridge" }] }) === "tallFridgeCabinet", "an old tall with a fridge opens as a fridge cabinet");
  assert(storage.moduleIdFor({ zones: [{ type: "drawer" }] }) === "generalTallCabinet", "an old tall without one stays storage");
}

// Defaults: Rogue Dometic with the job's stock; the width follows the cut-out.
const stock = (carcass, door) => ({ stock: { carcass: { thickness: carcass }, door: { thickness: door }, partition: { thickness: 18 } } });
{
  const p = fridgeMod.defaults(700, 624, 1965, stock(15, 16));
  const f = fridgeParts(p.zones).fridge;
  assert(p.cabinetWidth === 593, `Rogue width 532 + 16 + 3 × 15 = 593, got ${p.cabinetWidth}`);
  assert(p.exteriorSide === "left" && f.height === 1344, "exterior follows the left colour panel; fridge = cut-out height");
  const r = clean(p, "defaults");
  assert(r.params.fridgeOpening === 532, "opening = cut-out");
  assert(fridgeRuleIssues(p).length === 0, "Rogue keeps every fridge-cabinet rule");
  assert(fridgeMod.presetOf(p) === "rogue-dometic", "defaults with 15 / 16 stock still read as the preset");

  const p16 = fridgeMod.defaults(700, 624, 1965, stock(16, 16));
  assert(p16.cabinetWidth === 532 + 16 + 48, "16 carcass: three 16 stiles");
  assert(clean(p16, "16 carcass").params.fridgeOpening === 532, "the opening does not move with the stock");
}

// Side panel stock: 15 carcass ↔ 16 door moves the outer width by 1, the opening never.
{
  const p = fridgeMod.defaults(700, 624, 1965, stock(15, 16));
  const carcass = fridgeFix({ ...p, leftSidePanelThickness: 15, leftSidePanelFinish: "carcass" });
  assert(p.cabinetWidth - carcass.cabinetWidth === 1, "carcass side: 1 narrower");
  assert(clean(carcass, "carcass side").params.fridgeOpening === 532, "carcass side: same opening");
  const right = fridgeFix({ ...p, leftSidePanelThickness: 0, rightSidePanelThickness: 16, rightSidePanelFinish: "colour" });
  assert(right.exteriorSide === "right", "exterior side follows the panel");
  assert(fridgeMod.widthAnchor(p) === 1 && fridgeMod.widthAnchor(right) === -1, "the face away from the side panel stays");
  const none = fridgeFix({ ...p, leftSidePanelThickness: 0 });
  assert(none.exteriorSide === "none" && none.cabinetWidth === 577, "no side panel: 532 + 45");
  assert(fridgeMod.widthAnchor(none, { placeCorner: { x: 1 } }) === 1, "no side panel: the corner it was drawn from");
  assert(fridgeRuleIssues({ ...p, rightSidePanelThickness: 16 }).some((m) => m.includes("both sides")), "two side panels are flagged");
}

// Above the fridge: up flap / fixed panel grow the cabinet; nothing else is allowed there.
{
  const p = fridgeMod.defaults(700, 624, 1965, stock(15, 16));
  for (const type of ["top_flap", "fixed_panel"]) {
    const next = fridgeFix({ ...p, zones: [...p.zones, { id: "zone-4", type, height: 300 }] }, { H: 1965 + 300 + 15 });
    assert(next.cabinetHeight === 2280, `${type}: H 2280, got ${next.cabinetHeight}`);
    assert(fridgeParts(next.zones).above[0].height === 300, `${type}: 300 above`);
    clean(next, type);
    const taller = fridgeMod.resizeFace(next, { axis: "z", dir: 1 }, 2330);
    assert(fridgeParts(taller.zones).above[0].height === 350 && fridgeParts(taller.zones).fridge.height === 1344, `${type}: the top face goes to the zone above`);
  }
  assert(fridgeRuleIssues({ ...p, zones: [...p.zones, { id: "z", type: "drawer", height: 200 }] }).some((m) => m.includes("above the fridge")), "a drawer above is flagged");
  assert(fridgeRuleIssues({ ...p, zones: [{ id: "z", type: "double_door", height: 200 }, ...p.zones] }).some((m) => m.includes("under the fridge")), "a door below is flagged");
  assert(fridgeMod.resizeFace(p, { axis: "x", dir: 1 }, 700) === null, "the width face never pulls");
  assert(!fridgeMod.resizeFaces.some((f) => f.startsWith("x")), "no x faces to pull");
}

// The fridge's edges stay put in the front view; a boundary between two zones under it moves.
{
  const p = fridgeMod.defaults(700, 624, 1965, stock(15, 16));
  const r = clean(p, "drag base");
  const items = r.stack.filter((it) => it.kind === "functional_zone");
  assert(fridgeMod.setDivider(p, r, 1, 1000) === p, "the boundary under the fridge does not move");
  const centre = (items[0].z1 + items[1].z0) / 2;
  const moved = fridgeMod.setDivider(p, r, 0, centre + 20);
  assert(moved.zones[0].height === 192 && moved.zones[1].height === 227 && moved.cabinetHeight === 1965, "flap / drawer trade 20");
}

// A preset that changes the depth keeps the back on the wall (the corner that was drawn there).
{
  const { keepCorner, worldOf } = await import("./pose.js");
  const pose = { x: 634, y: 4459, z: 0, rotZ: 90 };
  const before = { x0: 0, x1: 593, y0: -16, y1: 634, z0: 0, z1: 1965 };
  const after = { x0: 0, x1: 593, y0: -16, y1: 624, z0: 0, z1: 1965 };
  const corner = { x: 1, y: 1, z: -1 };
  const back0 = worldOf(pose, [593, 634, 0]);
  const next = keepCorner(pose, before, after, corner);
  const back1 = worldOf(next, [593, 624, 0]);
  assert(Math.abs(back0[0] - back1[0]) < 0.01 && Math.abs(back0[1] - back1[1]) < 0.01, `back left the wall: ${back0} → ${back1}`);
  assert(Math.abs(next.x - 624) < 0.01, `front should come back to 624, got ${next.x}`);
}

console.log("tallFridge ok");
