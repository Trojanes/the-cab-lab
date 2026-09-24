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
  const tall = mod.resizeFace(p, { axis: "z", dir: 1 }, 1080);
  assert(tall.columns[0].zones.length === 2 && tall.columns[0].zones[0].height === 200, "kitchen: new top zone");
  ok(mod, tall, "kitchen tall");
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
