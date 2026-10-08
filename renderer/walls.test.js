// Partition walls cut into 1200 × 2400 boards.
globalThis.window = globalThis.window || { cablab: null, addEventListener() {} };
const { resolveSpace } = await import("./spaces.js");
const { wallBoards, fitsSheet, normalizeWall, placeSplit, fitOutline, wallSolid, wallAnchors, bindCabinets, settleClearanceZ } = await import("./walls.js");
const { arcOf } = await import("./sketchCurves.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function near(a, b, eps = 0.2) {
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
}

const stock = {
  carcass: { thickness: 15 },
  partition: { thickness: 18, floorClearance: 0, ceilingClearance: 0 },
  door: { thickness: 16 },
};

function space(height) {
  return resolveSpace({ kind: "box", params: { width: 4000, depth: 6000, height, walls: [0, 1, 2, 3] } });
}

function wall(extra = {}) {
  return {
    id: "wall-1", axis: "y", at: 1000, u0: 0, u1: 1965, side: 1, openings: [],
    ...extra,
  };
}

function shower(offset, width, id = "op-1") {
  return { id, type: "showerDoor", from: "lo", offset, width, bottom: 100, top: 100 };
}

function sliding(offset, width, id = "op-1") {
  return { id, type: "slidingDoor", from: "lo", offset, width, bottom: 0, top: 100, side: 1, overlap: 40, doorHeight: 1880 };
}

function holeSpan(holes) {
  if (!holes.length) return null;
  const us = holes.flatMap((h) => h.map((p) => p.u));
  return [Math.min(...us), Math.max(...us)];
}

assert(fitsSheet(1200, 2400), "1200 × 2400 fits");
assert(fitsSheet(2400, 1200), "turned 2400 × 1200 fits");
assert(!fitsSheet(1965, 2275), "1965 × 2275 does not fit");
assert(!fitsSheet(1201, 2000), "both sides over 1200 do not fit");

// No door: one vertical cut in the legal band [765, 1200], at its midpoint.
{
  const cut = wallBoards(wall(), space(2275), stock);
  assert(cut.split && cut.split.axis === "u", "no-door cut is vertical");
  near(cut.split.at, 982.5);
  assert(cut.boards.length === 2, "two boards");
  near(cut.boards[0].length, 982.5);
  near(cut.boards[1].length, 982.5);
  assert(cut.boards.every((b) => b.fits && b.height === 2275), "both pieces fit");
  assert(cut.issues.length === 0 && cut.warnings.length === 0, "no flags without a door");
  near(cut.boards[0].u1, cut.boards[1].u0);
}

// Sliding door 900–1600: the hole's midpoint 1250 is illegal. Use 1050.
{
  const cut = wallBoards(wall({ openings: [sliding(900, 700)] }), space(2275), stock);
  assert(cut.split.axis === "u", "sliding cut is vertical");
  near(cut.split.at, 1050);
  near(cut.boards[0].length, 1050);
  near(cut.boards[1].length, 915);
  assert(cut.boards.every((b) => b.fits), "both sides of the sliding cut fit");
  near(holeSpan(cut.boards[0].holes)[0], 900);
  near(holeSpan(cut.boards[0].holes)[1], 1050);
  near(holeSpan(cut.boards[1].holes)[0], 1050);
  near(holeSpan(cut.boards[1].holes)[1], 1600);
  assert(cut.warnings.length === 0, "a sliding door has no joint warning");
}

// Shower door 200–700: farthest legal cut that misses the hole is 1200.
{
  const cut = wallBoards(wall({ openings: [shower(200, 500)] }), space(2275), stock);
  assert(cut.split.axis === "u", "shower cut is vertical");
  near(cut.split.at, 1200);
  near(cut.boards[0].length, 1200);
  near(cut.boards[1].length, 765);
  assert(cut.boards.every((b) => b.fits), "both sides of the shower cut fit");
  assert(cut.boards[0].holes.length === 1 && cut.boards[1].holes.length === 0, "the hole stays on the left board");
  assert(cut.warnings.length === 1 && cut.warnings[0].includes("joint on the shower door board P0"), cut.warnings.join(";"));
}

// Shower door covering the legal band: cut at the top of the hole, lower piece marked.
{
  const cut = wallBoards(wall({ openings: [shower(600, 800)] }), space(2275), stock);
  assert(cut.split.axis === "z", `expected a top cut, got ${cut.split && cut.split.axis}`);
  near(cut.split.at, 2175);
  assert(!cut.boards[0].fits, "the lower piece is past the sheet");
  assert(cut.boards[1].fits, "the strip above the door fits");
  near(cut.boards[1].height, 100);
  assert(cut.boards[0].holes.length === 1 && cut.boards[1].holes.length === 0, "the shower hole stays below the cut");
  assert(cut.issues.length === 1, "the oversized piece is marked");
  assert(cut.warnings.some((m) => m.includes("joint")), "yellow joint warning");
}

// A wall that fits is one board, even with a shower door — no joint, no warning.
{
  const cut = wallBoards(wall({ u1: 800, openings: [shower(100, 400)] }), space(2000), stock);
  assert(cut.split === null && cut.boards.length === 1 && cut.boards[0].fits, "one fitting board");
  assert(cut.warnings.length === 0 && cut.issues.length === 0, "no joint when there is no cut");
}

// One cut cannot legalise 2500 × 2275. Cut at 1200 and mark the remainder.
{
  const cut = wallBoards(wall({ u1: 2500 }), space(2275), stock);
  assert(cut.split.axis === "u", "fallback is a vertical cut");
  near(cut.split.at, 1200);
  assert(cut.boards[0].fits && !cut.boards[1].fits, "only the 1200 piece fits");
  assert(cut.issues.length === 1, "the long piece is marked");
}

// A dragged cut inside a shower hole is pulled onto the nearer jamb.
{
  const cut = wallBoards(wall({ openings: [shower(200, 500)], split: { axis: "u", at: 500 } }), space(2275), stock);
  near(cut.split.at, 700);
  assert(cut.boards[0].holes.length === 1, "the hole is still whole");
}

// A dragged cut outside the legal band is kept, and the piece that no longer fits is marked.
{
  const cut = wallBoards(wall({ split: { axis: "u", at: 400 } }), space(2275), stock);
  near(cut.split.at, 400);
  assert(cut.boards[0].fits && !cut.boards[1].fits, "dragging short of the legal band marks the long piece");
}

{
  const w = normalizeWall({ axis: "y", at: 10, u0: 0, u1: 500, side: 1, split: { axis: "z", at: 800.04 } });
  assert(w.split.axis === "z" && w.split.at === 800, "split is stored on the wall");
}

{
  const cut = wallBoards(wall(), space(2275), stock);
  const moved = placeSplit(cut.solid, { axis: "u", at: 50 });
  near(moved.at, 50);
}

// Fit outline: back at u 0, fronts toward +u. Base top 880, overhead underside 1400.
{
  const fitted = fitOutline({
    backU: 0, sign: 1, z0: 0, topAt: () => 2400,
    kitchenTop: 880, kitchenDepth: 270, ohcBottom: 1400, ohcDepth: 366,
  });
  assert(fitted.outline, "outline");
  const has = (u, z) => fitted.outline.some((p) => Math.abs(p.u - u) < 0.2 && Math.abs(p.z - z) < 0.2);
  assert(has(0, 0) && has(300, 0) && has(300, 930), "base step is depth + 30 and 50 above the base");
  assert(has(100, 930) && has(100, 1355), "neck is 100 deep down to 15 mm below the overhead door");
  assert(has(386, 1355) && has(386, 2400) && has(0, 2400), "overhead step is its outer depth + 20, up to the roof");
  near(fitted.steps.kitchenDepth, 300);
  near(fitted.steps.overheadDepth, 386);
  near(fitted.steps.overheadBottom, 1355);
  const rounded = fitOutline({
    backU: 0, sign: 1, z0: 0, topAt: () => 2400,
    kitchenTop: 880, kitchenDepth: 270, ohcBottom: 1400, ohcDepth: 366, radius: 50,
  });
  const sharp = (u, z) => rounded.outline.some((p) => Math.abs(p.u - u) < 0.2 && Math.abs(p.z - z) < 0.2);
  assert(!sharp(300, 930) && !sharp(100, 930) && !sharp(100, 1355) && !sharp(386, 1355), "the four step corners are no longer sharp");
  assert(sharp(300, 880) && sharp(250, 930), "outer corner at the base step is R50");
  const arcMid = (u, z) => {
    const i = rounded.outline.findIndex((p) => Math.abs(p.u - u) < 0.2 && Math.abs(p.z - z) < 0.2 && p.bulge);
    assert(i >= 0, `arc starts at ${u},${z}`);
    const a = rounded.outline[i];
    const b = rounded.outline[i + 1];
    const arc = arcOf([a.u, a.z], [b.u, b.z], a.bulge);
    assert(arc && Math.abs(Math.abs(arc.sweep) - Math.PI / 2) < 0.02, "corner is a quarter circle");
    const t = arc.a0 + arc.sweep / 2;
    return [arc.c[0] + arc.r * Math.cos(t), arc.c[1] + arc.r * Math.sin(t)];
  };
  const outer = arcMid(300, 880);
  assert(Math.hypot(outer[0] - 285.35, outer[1] - 915.35) < 0.2, "outer arc passes inside the base corner");
  const inner = arcMid(150, 930);
  assert(Math.hypot(inner[0] - 114.65, inner[1] - 944.65) < 0.2, "inner arc rounds the neck");
  const THREE = await import("three");
  const { prismYZ, prismXZ } = await import("./boardGeom.js");
  const hits = (geo, origin, dir) => new THREE.Raycaster(origin, dir).intersectObject(new THREE.Mesh(geo)).length > 0;
  const yz = prismYZ(rounded.outline.map((p) => ({ y: p.u, z: p.z, bulge: p.bulge })), 0, 18);
  const xz = prismXZ(rounded.outline.map((p) => ({ x: p.u, z: p.z, bulge: p.bulge })), 0, 18);
  // Just inside the arc is solid; the old square corner is cut away. Both wall orientations.
  assert(hits(yz, new THREE.Vector3(-10, 284, 914), new THREE.Vector3(1, 0, 0)), "YZ arc keeps the solid inside the curve");
  assert(!hits(yz, new THREE.Vector3(-10, 298, 925), new THREE.Vector3(1, 0, 0)), "YZ arc cuts off the square corner");
  assert(hits(xz, new THREE.Vector3(284, -10, 914), new THREE.Vector3(0, 1, 0)), "XZ arc keeps the solid inside the curve");
  assert(!hits(xz, new THREE.Vector3(298, -10, 925), new THREE.Vector3(0, 1, 0)), "XZ arc cuts off the square corner");
}

// A wall beside a base and an overhead picks up that outline. Backs share y = 2000.
{
  const kitchen = {
    id: "cab-k", moduleId: "kitchenCabinet",
    pose: { x: 400, y: 1746, z: 0, rotZ: 0 },
    params: { globalSettings: { length: 800, depth: 270, height: 880 }, frontThickness: 16 },
  };
  const overhead = {
    id: "cab-o", moduleId: "overheadCabinet",
    pose: { x: 400, y: 1650, z: 1418, rotZ: 0 },
    params: { cabinetWidth: 800, cabinetDepth: 350, cabinetHeight: 400, frontPanelThickness: 16 },
  };
  bindCabinets(() => [kitchen, overhead]);
  const w = wall({
    axis: "x", at: 400, u0: 1600, u1: 2100,
    fit: { overheadId: "cab-o", kitchenId: "cab-k", radius: 0 },
  });
  const solid = wallSolid(w, space(2400), stock);
  assert(solid.fitWarnings.length === 0, solid.fitWarnings.join("; "));
  const has = (u, z) => solid.outline.some((p) => Math.abs(p.u - u) < 0.2 && Math.abs(p.z - z) < 0.2);
  // The wall's end (2100) stays the back, even though the carcass backs are at 2000.
  assert(has(2100, 0) && has(1700, 0) && has(1700, 930), "base front stays 30 mm past the door");
  assert(has(2000, 930) && has(2000, 1373), "neck is 100 from the wall end, down to 15 mm below the door");
  assert(has(1614, 1373), "overhead front is 20 mm past its door");
  // The base carcass stops 16 mm short of the back wall (the door is at the front).
  // The partition must stay on the back wall, or it is free-standing and turns red.
  const kitchenShort = {
    id: "cab-k2", moduleId: "kitchenCabinet",
    pose: { x: 0, y: 2096, z: 0, rotZ: 0 },
    params: { globalSettings: { length: 1800, depth: 904, height: 990 }, frontThickness: 16 },
  };
  const overheadOnWall = {
    id: "cab-o2", moduleId: "overheadCabinet",
    pose: { x: 0, y: 2436, z: 1960, rotZ: 0 },
    params: { cabinetWidth: 1800, cabinetDepth: 564, cabinetHeight: 440, frontPanelThickness: 16 },
  };
  bindCabinets(() => [kitchenShort, overheadOnWall]);
  const room = resolveSpace({ kind: "box", params: { width: 4000, depth: 3000, height: 2400, walls: [0, 1, 2, 3] } });
  const fittedWall = wallSolid(wall({
    axis: "x", at: 1800, u0: 2200, u1: 3000,
    fit: { overheadId: "cab-o2", kitchenId: "cab-k2" },
  }), room, stock);
  assert(fittedWall.fitWarnings.length === 0, fittedWall.fitWarnings.join("; "));
  assert(Math.max(...fittedWall.outline.map((p) => p.u)) === 3000, "back edge stays on the back wall");
  const frontU = Math.min(...fittedWall.outline.map((p) => p.u));
  near(frontU, 2050);
  const anchors = wallAnchors(fittedWall, room, []);
  assert(anchors.lo === "back wall" || anchors.hi === "back wall", JSON.stringify(anchors));
  bindCabinets(() => []);
  const missing = wallSolid(w, space(2400), stock);
  assert(missing.fitWarnings.some((m) => m.includes("missing")), missing.fitWarnings.join("; "));
}

{
  const kept = normalizeWall({ id: "wall-9", axis: "y", at: 1, u0: 0, u1: 100, side: 1, hidden: true });
  assert(kept.hidden === true, "hidden survives load");
  const shown = normalizeWall({ id: "wall-9", axis: "y", at: 1, u0: 0, u1: 100, side: 1 });
  assert(shown.hidden !== true, "a shown wall omits hidden");
}

const jobMod = await import("./job.js");
jobMod.resetJob();
const added = jobMod.addWall({ axis: "y", at: 1000, u0: 0, u1: 500, side: 1 });
assert(added && added.hidden !== true, "a new wall is shown");
assert(jobMod.toggleWallVisible(added.id) === true, "V hides the wall");
assert(jobMod.getWall(added.id).hidden === true, "hidden is stored");
assert(jobMod.toggleSelectionVisible() === true, "V shows it again");
assert(jobMod.getWall(added.id).hidden !== true, "hidden is cleared");

// Partition ↔ waterfall + overhead end panel, and a control panel riding along.
{
  jobMod.resetJob();
  jobMod.defineSpace("box", { width: 4000, depth: 3000, height: 2400, walls: [0, 1, 2, 3] }, { history: false });
  const kit = jobMod.addCabinet("kitchenCabinet", { x: 1018, y: 2416, z: 0, rotZ: 0 }, { W: 1200, D: 600, H: 900 });
  const ohc = jobMod.addCabinet("overheadCabinet", { x: 1018, y: 2650, z: 2000, rotZ: 0 }, { W: 1200, D: 350, H: 400 });
  const w = jobMod.addWall({ axis: "x", at: 1000, side: 1, u0: 2200, u1: 3000 });
  const { waterfallPlan, partitionPlan } = await import("./waterfall.js");
  const cabs = () => jobMod.getJob().cabinets;
  const stk = () => jobMod.getStock();
  assert(!waterfallPlan(jobMod.getWall(w.id), { stock: stk(), cabinets: cabs() }).ok, "no waterfall without a fit");
  jobMod.setWallFit(w.id, { overheadId: ohc.id, kitchenId: kit.id });
  const plan = waterfallPlan(jobMod.getWall(w.id), { stock: stk(), cabinets: cabs() });
  assert(plan.ok, `plan refused: ${plan.reason}`);
  assert(plan.kitchen.side === "left" && plan.overhead.side === "left", "the partition is at the left ends");
  near(plan.kitchen.delta, -7); // 18 partition → 25 waterfall: the column gives 7
  near(plan.overhead.delta, 2); // 18 partition → 16 door stock: the zone gains 2
  near(plan.outer, 1000);

  // A control panel on the partition: the wall is cut and the overhead derives its share.
  const cp = jobMod.addControlPanel(w.id, { fromCeiling: 200, fromBack: 150, width: 175, height: 105, depth: 35 });
  assert(cp && cp.id, "control panel added");
  const solid = wallSolid(jobMod.getWall(w.id), jobMod.getSpace(), stk());
  const hole = solid.holes.find((h) => h.some((p) => Math.abs(p.u - 2762.5) < 0.1));
  assert(hole, `the wall has the opening: ${JSON.stringify(solid.holes)}`);
  assert(hole.some((p) => Math.abs(p.z - 2147.5) < 0.1) && hole.some((p) => Math.abs(p.z - 2252.5) < 0.1), "opening 105 high, centre 200 under the ceiling");
  const derived = (cabs().find((c) => c.id === ohc.id).params.controlPanels || [])[0];
  assert(derived && derived.host === "wall" && derived.side === "left", `overhead derives the panel: ${JSON.stringify(derived)}`);
  near(derived.fromCeiling, 200);
  near(derived.fromBack, 150);
  near(derived.wallThickness, 18);
  const ohcResult = jobMod.resultFor(ohc.id);
  assert(ohcResult.boards.some((b) => b.id === "D_CP_L1"), "overhead builds the backing divider");
  assert(ohcResult.boards.find((b) => b.id === "D0").faces.some((f) => f.features.some((x) => x.kind === "cutout" && x.for === "control_panel")), "end divider cut through");

  // Change to waterfall.
  const done = jobMod.changeToWaterfall(w.id, { column: 0, zone: 0 });
  assert(done.ok, `conversion refused: ${done.reason}`);
  assert(!jobMod.getWall(w.id), "the partition is gone");
  const k1 = cabs().find((c) => c.id === kit.id);
  const o1 = cabs().find((c) => c.id === ohc.id);
  assert(k1.params.waterfall === "left", "kitchen has a left waterfall");
  near(k1.pose.x, 1000);
  near(k1.params.globalSettings.length, 1193);
  near(k1.params.columns[0].width, 1193);
  assert(o1.params.endPanel === "left", "overhead has a left end panel");
  near(o1.pose.x, 1016);
  near(o1.params.cabinetWidth, 1202);
  near(o1.params.zones[0].width, 1202);
  const { getModule } = await import("./modules.js");
  const { worldOf } = await import("./pose.js");
  const xSpan = (c) => {
    const b = getModule(c.moduleId).localBox(c.params);
    return [worldOf(c.pose, [b.x0, 0, 0])[0], worldOf(c.pose, [b.x1, 0, 0])[0]];
  };
  near(xSpan(k1)[0], 1000);
  near(xSpan(k1)[1], 2218);
  near(xSpan(o1)[0], 1000);
  near(xSpan(o1)[1], 2218);
  const carried = (o1.params.controlPanels || []).find((p) => p.host === "endPanel");
  assert(carried && carried.side === "left" && Math.abs(carried.fromCeiling - 200) < 0.1, `the control panel moved onto the end panel: ${JSON.stringify(o1.params.controlPanels)}`);
  assert(!(o1.params.controlPanels || []).some((p) => p.host === "wall"), "no derived panel without the wall");
  const r1 = jobMod.resultFor(ohc.id);
  assert(r1.validation.errors.length === 0, r1.validation.errors.join("; "));
  assert(r1.boards.some((b) => b.id === "END_PANEL"), "end panel built");
  assert(r1.boards.find((b) => b.id === "END_PANEL").faces.some((f) => f.features.some((x) => x.kind === "cutout" && x.for === "control_panel")), "end panel cut through");
  assert(!partitionPlan(cabs().find((c) => c.id === ohc.id), { stock: stk(), cabinets: cabs().filter((c) => c.id !== kit.id) }).ok, "no reverse without the waterfall");

  // And back.
  const back = jobMod.changeToPartition(kit.id, { column: 0, zone: 0 });
  assert(back.ok, `reverse refused: ${back.reason}`);
  const k2 = cabs().find((c) => c.id === kit.id);
  const o2 = cabs().find((c) => c.id === ohc.id);
  assert(!k2.params.waterfall && !o2.params.endPanel, "both boards are gone");
  near(k2.pose.x, 1018);
  near(k2.params.globalSettings.length, 1200);
  near(o2.pose.x, 1018);
  near(o2.params.cabinetWidth, 1200);
  const w2 = jobMod.getWall(back.wallId);
  assert(w2 && w2.axis === "x" && w2.side === 1 && Math.abs(w2.at - 1000) < 0.1, `new partition on the outer face: ${JSON.stringify(w2)}`);
  assert(w2.fit && w2.fit.kitchenId === kit.id && w2.fit.overheadId === ohc.id, "fitted again");
  near(w2.u1, 3000);
  near(w2.u0, 2370);
  assert((w2.controlPanels || []).length === 1, "the control panel is back on the partition");
  const d2 = (o2.params.controlPanels || []).find((p) => p.host === "wall");
  assert(d2 && d2.wall === w2.id, "and derived on the overhead again");
  const s2 = wallSolid(w2, jobMod.getSpace(), stk());
  assert(s2.fitWarnings.length === 0, s2.fitWarnings.join("; "));
  assert(s2.holes.length === 1, "one opening in the new partition");
  jobMod.undo();
  assert(cabs().find((c) => c.id === kit.id).params.waterfall === "left" && !jobMod.getWall(back.wallId), "one undo step restores the waterfall");
}

{
  const room = space(1965);
  const cl = { floor: 2, ceiling: 2 };
  assert(settleClearanceZ(2, 100, 200, room, cl) === 0, "the board bottom is the floor point");
  assert(settleClearanceZ(1963, 100, 200, room, cl) === 1965, "the board top is the ceiling point");
  assert(settleClearanceZ(1863, 100, 200, room, cl) === 1863, "a door head stays put");
  assert(settleClearanceZ(102, 100, 200, room, cl) === 102, "a shower sill stays put");
}

console.log("walls ok");
