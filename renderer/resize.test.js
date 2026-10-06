// Resize command: each module's face rule (zones follow the pulled face), checked through the generators.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
const { MODULES, resizeStack } = await import("./modules.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const sum = (xs) => Math.round(xs.reduce((s, v) => s + v, 0) * 10) / 10;
const ok = (mod, params, what) => {
  const r = mod.generate(params);
  assert(r && r.validation && r.validation.errors.length === 0, `${what}: ${JSON.stringify(r?.validation?.errors)}`);
};

// resizeStack: pull, push, merge, refuse.
{
  const z = [{ h: 300 }, { h: 200 }];
  assert(resizeStack(z, 100, { key: "h", min: 60 })[0].h === 400, "growth goes to the face zone");
  const made = resizeStack(z, 100, { key: "h", min: 60, make: (h) => ({ h, fresh: true }) });
  assert(made.length === 3 && made[0].fresh && made[0].h === 100, "growth ≥ min makes a zone");
  assert(resizeStack(z, 50, { key: "h", min: 60, make: (h) => ({ h }) }).length === 2, "growth < min stays in the face zone");
  const merged = resizeStack(z, -260, { key: "h", min: 60 });
  assert(merged.length === 1 && merged[0].h === 240, "a zone under min merges into its neighbour");
  assert(resizeStack(z, -450, { key: "h", min: 60 }) === null, "the last zone never drops under min");
}

// Small cabinet: top face → top zone only.
{
  const mod = MODULES.smallCabinet;
  const base = mod.defaults(600, 560, 720);
  const lower = 720 - 2 * base.panelThickness - 200;
  const p = { ...base, zones: [{ id: "a", type: "drawer", height: 200 }, { id: "b", type: "left_door", height: lower }] };
  ok(mod, p, "small base");
  const up = mod.resizeFace(p, { axis: "z", dir: 1 }, 820);
  assert(up.zones[0].height === 300 && up.zones[1].height === lower, "small: +100 on the top zone");
  ok(mod, up, "small up");
  const down = mod.resizeFace(p, { axis: "z", dir: 1 }, 560);
  assert(down.zones.length === 1 && down.zones[0].height === lower + 200 - 160, "small: top zone merged below");
  ok(mod, down, "small down");
}

// Overhead: side faces add / trim bays.
{
  const mod = MODULES.overheadCabinet;
  const d = mod.defaults(1200, 350, 400);
  const p = { ...d, zones: [{ ...d.zones[0], id: "zone-1", width: 600 }, { ...d.zones[0], id: "zone-2", width: 600 }] };
  ok(mod, p, "ohc base");
  const w0 = p.zones.map((z) => z.width);
  const right = mod.resizeFace(p, { axis: "x", dir: 1 }, 1500);
  assert(right.zones.length === p.zones.length + 1 && right.zones.at(-1).width === 300 && right.zones.at(-1).type === "up_flap", "ohc: new bay on the right");
  assert(sum(right.zones.map((z) => z.width)) === 1500, "ohc: widths sum to W");
  ok(mod, right, "ohc right");
  const left = mod.resizeFace(p, { axis: "x", dir: -1 }, 1100);
  assert(left.zones.at(-1).width === w0.at(-1) && sum(left.zones.map((z) => z.width)) === 1100, "ohc: left push trims the left bay only");
  ok(mod, left, "ohc left");
  assert(mod.zoneTypes.some((t) => t.id === "rangehood_flap"), "ohc: range hood is a zone type");
  const hood = {
    ...mod.defaults(1000, 400, 400),
    rangehoodPreset: "NCE",
    rangehoodClearHeight: 75,
    rangehoodAlignment: "left",
    rangehoodEdgeOffsetX: 40,
    zones: [{ id: "rangehood", type: "rangehood_flap", width: 1000 }],
  };
  const hoodResult = mod.generate(hood);
  assert(hoodResult.validation.errors.length === 0, `ohc hood: ${JSON.stringify(hoodResult.validation.errors)}`);
  assert(hoodResult.boards.some((b) => b.id === "RGHD_TOP"), "ohc hood: top board");
  assert(hoodResult.boards.some((b) => b.id === "RGHD_FRONT") && hoodResult.boards.some((b) => b.id === "RGHD_BACK"), "ohc hood: front and back");
  const cut = hoodResult.features.find((f) => f && f.type === "rangehood_bp_cutout");
  assert(cut && cut.x[0] === 55 && cut.x[1] === 610 && cut.y[0] === 57.5 && cut.y[1] === 342.5, "ohc hood: NCE opening");
}

// Kitchen: a side face adds a door column (hinge on the pulled side); the top face adds a zone on each column.
{
  const mod = MODULES.kitchenCabinet;
  const p = mod.defaults(887, 570, 880);
  const wide = mod.resizeFace(p, { axis: "x", dir: 1 }, 1287);
  assert(wide.columns.length === 2 && wide.columns[1].width === 400 && wide.columns[1].zones[0].zoneType === "right_door", "kitchen: new column, hinged on the pulled side");
  const left = mod.resizeFace(p, { axis: "x", dir: -1 }, 1287);
  assert(left.columns.length === 2 && left.columns[0].width === 400 && left.columns[0].zones[0].zoneType === "left_door", "kitchen: a column pulled on the left hinges left");
  assert(wide.globalSettings.length === 1287, "kitchen: length follows");
  const wideErrs = mod.generate(wide).validation.errors.filter((e) => !/half-slot conflict/.test(e));
  assert(wideErrs.length === 0, `kitchen wide: ${JSON.stringify(wideErrs)}`);
  const narrow = mod.resizeFace(wide, { axis: "x", dir: 1 }, 1000);
  assert(narrow.columns.length === 1 && narrow.columns[0].width === 1000, "kitchen: a 113 column merges into its neighbour");
  ok(mod, narrow, "kitchen narrow");
  assert(mod.zoneTypes.some((t) => t.id === "stove") && !mod.zoneTypes.some((t) => t.id === "unassigned"), "kitchen lists a stove and not an unassigned zone");
  const ensuite = MODULES.ensuiteCabinet;
  assert(ensuite && !ensuite.zoneTypes.some((t) => t.id === "stove"), "ensuite has no stove type");
  ok(ensuite, ensuite.defaults(887, 270, 880), "ensuite defaults");
  const refused = ensuite.generate({
    ...ensuite.defaults(900, 400, 880),
    columns: [
      { id: "c1", width: 900, zones: [{ id: "st", height: 810, zoneType: "stove" }] },
    ],
  });
  assert(refused.validation.errors.some((e) => e.includes("Ensuite has no stove")), `ensuite stove: ${JSON.stringify(refused.validation.errors)}`);
  const tall = mod.resizeFace(p, { axis: "z", dir: 1 }, 1080);
  assert(tall.columns[0].zones.length === 2 && tall.columns[0].zones[0].height === 200, "kitchen: new top zone");
  ok(mod, tall, "kitchen tall");
  const s1 = mod.generate(mod.defaults(887, 270, 880));
  const s2 = mod.generate({ ...mod.defaults(887, 270, 880), bottomClearanceStyle: "style_2" });
  const b1 = (r) => r.boards.find((b) => b.id === "B1");
  assert(b1(s1) && b1(s2) && b1(s1).y0 !== b1(s2).y0, "kick style 2 moves the kick face");
  const sided = mod.defaults(887, 270, 880);
  sided.columns[0].zones[0].leftSidePanelOptions = {
    panelType: "door", frontVisible: true, bchNotchEnabled: true,
    grooveVisible: true, extendT2T3B4ToOuterFace: true, strengtheningStripEnabled: true,
  };
  const strip = mod.generate(sided);
  assert(strip.boards.some((b) => b.id.startsWith("left-side-strengthening-strip")), "end strip when the front is visible");
}

{
  const mod = MODULES.overheadCabinet;
  const off = mod.defaults(1200, 400, 400);
  assert(off.ledGroove === false, "a new overhead stores the LED groove off");
  assert(!mod.generate(off).features.some((f) => f && f.type === "t3_groove"), "stored off cuts no T3 groove");
  assert(mod.generate({ ...off, ledGroove: true }).features.some((f) => f && f.type === "t3_groove"), "turning the groove on cuts T3");
  const legacy = { ...off };
  delete legacy.ledGroove;
  assert(mod.generate(legacy).features.some((f) => f && f.type === "t3_groove"), "a missing flag still cuts the groove");
}

// General tall: top face scales the zones.
{
  const mod = MODULES.generalTallCabinet;
  const p = mod.defaults(600, 584, 2000);
  const up = mod.resizeFace(p, { axis: "z", dir: 1 }, 2200);
  assert(up && up.cabinetHeight === 2200, "tall: height follows");
  const r0 = p.zones.map((z) => z.height / sum(p.zones.map((q) => q.height)));
  const r1 = up.zones.map((z) => z.height / sum(up.zones.map((q) => q.height)));
  r0.forEach((r, i) => assert(Math.abs(r - r1[i]) < 0.02, `tall: zone ${i} keeps its share (${r} → ${r1[i]})`));
  ok(mod, up, "tall up");
}

console.log("resize ok");
