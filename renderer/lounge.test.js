// Lounge: a size change keeps the lounge on its walls (the back on the wall, the L wing end on its
// side wall, else the corner it was drawn from), the plan-view edges on the room side / the free end,
// and the plan's numbers sit on the edges, clickable.
globalThis.window ??= { addEventListener() {}, removeEventListener() {} };
const { MODULES } = await import("./modules.js");
const job = await import("./job.js");
const { worldOf } = await import("./pose.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
const mod = MODULES.loungeGenerator;
const near = (a, b) => Math.abs(a - b) < 0.01;
const cabOf = (id) => job.getJob().cabinets.find((c) => c.id === id);
/** World point of a local box corner. */
const at = (cab, x, y) => worldOf(cab.pose, [x, y, 0]);

// Anchors.
{
  assert(mod.depthAnchor({}) === 1, "the back (y = D) is the wall");
  assert(mod.widthAnchor({ style: "L_SHAPE", lPosition: "RIGHT" }) === 1, "L right wing: x = W stays");
  assert(mod.widthAnchor({ style: "L_SHAPE", lPosition: "LEFT" }) === -1, "L left wing: x = 0 stays");
  assert(mod.widthAnchor({ style: "I_SHAPE" }, { placeCorner: { x: 1 } }) === 1, "I: the corner drawn first");
  assert(mod.widthAnchor({ style: "PARALLEL" }, {}) === -1, "parallel with no corner: x = 0");
}

// I along a wall, turned (rotZ 90): a deeper seat keeps the back on the wall; the room side moves.
{
  const cab = job.addCabinet("loungeGenerator", { x: 1000, y: 500, z: 0, rotZ: 90 }, { W: 2000, D: 600, H: 420 },
    { history: false, params: { style: "I_SHAPE", mainWidth: 2000, mainDepth: 600, height: 420 }, corner: { x: -1, y: -1, z: -1 } });
  const wall0 = at(cabOf(cab.id), 0, 600);
  const front0 = at(cabOf(cab.id), 0, 0);
  job.setParams(cab.id, { ...cabOf(cab.id).params, mainDepth: 700 });
  const now = cabOf(cab.id);
  const wall1 = at(now, 0, 700);
  assert(near(wall0[0], wall1[0]) && near(wall0[1], wall1[1]), `back stays on the wall: ${wall0} → ${wall1}`);
  const front1 = at(now, 0, 0);
  assert(Math.abs(Math.hypot(front1[0] - front0[0], front1[1] - front0[1]) - 100) < 0.01, "the room side moved 100");
  // Longer: the left end (the corner drawn first) stays.
  const left0 = at(now, 0, 700);
  job.setParams(cab.id, { ...now.params, mainWidth: 2300 });
  const left1 = at(cabOf(cab.id), 0, 700);
  assert(near(left0[0], left1[0]) && near(left0[1], left1[1]), "the drawn corner stays when it grows");
}

// L with the wing on the right: a wider lounge keeps the wing end (x = W) and the wall.
{
  const p = { style: "L_SHAPE", mainWidth: 2200, mainDepth: 600, lWidth: 1600, lDepth: 600, lPosition: "RIGHT", height: 420 };
  const cab = job.addCabinet("loungeGenerator", { x: 0, y: 0, z: 0, rotZ: 0 }, { W: 2200, D: 1600, H: 420 }, { history: false, params: p });
  const end0 = at(cabOf(cab.id), 2200, 1600);
  job.setParams(cab.id, { ...cabOf(cab.id).params, mainWidth: 2000 });
  const end1 = at(cabOf(cab.id), 2000, 1600);
  assert(near(end0[0], end1[0]) && near(end0[1], end1[1]), `wing end and wall stay: ${end0} → ${end1}`);
  job.setParams(cab.id, { ...cabOf(cab.id).params, lWidth: 1500 });
  const end2 = at(cabOf(cab.id), 2000, 1500);
  assert(near(end0[0], end2[0]) && near(end0[1], end2[1]), "a shorter wing keeps the wall");
  // Switching the style keeps the wall too (the depth changes from lWidth to the seat).
  job.setParams(cab.id, mod.setStyle(cabOf(cab.id).params, "I_SHAPE"));
  const env = mod.envelope(cabOf(cab.id).params);
  const end3 = at(cabOf(cab.id), env.W, env.D);
  assert(near(end0[0], end3[0]) && near(end0[1], end3[1]), "a new style keeps the wall and the wing end");
}

// Plan-view edges: room-side / free-end grips, read in the plan as it was when the drag started.
{
  const I = { style: "I_SHAPE", mainWidth: 2000, mainDepth: 600 };
  assert(mod.setRunEdge(I, "mainDepthFront", -50).mainDepth === 650, "I: room edge pulled 50 into the room");
  assert(mod.setRunEdge(I, "mainWidthLo", 100).mainWidth === 1900, "I: left end moved in 100");
  const L = { style: "L_SHAPE", mainWidth: 2200, mainDepth: 600, lWidth: 1600, lDepth: 600, lPosition: "RIGHT" };
  assert(mod.setRunEdge(L, "lWidthFront", 100).lWidth === 1500, "L: the wing's room end moved toward the wall");
  assert(mod.setRunEdge(L, "mainWidthLo", -200).mainWidth === 2400, "L: the main run's far end moved out 200");
  const P = { style: "PARALLEL", totalWidth: 2200, singleLoungeWidth: 600, depth: 900 };
  assert(mod.setRunEdge(P, "depthFront", -100).depth === 1000, "parallel: the aisle ends moved out 100");
  assert(mod.setRunEdge(P, "totalWidthLo", 50).totalWidth === 2150, "parallel: the left outer face moved in 50");
}

// Plan view: grips on the free end and the room side; numbers on the edges, clickable to type.
{
  const p = { style: "L_SHAPE", mainWidth: 2200, mainDepth: 600, lWidth: 1600, lDepth: 600, lPosition: "RIGHT", height: 420 };
  const svg = mod.frontView(mod.generate(p), { params: p, widthAnchor: 1 });
  assert(svg.includes('data-param="mainWidthLo"') && !svg.includes('data-param="mainWidth" data-axis'), "right wing: the width grip is on the left end");
  assert(svg.includes('data-param="lWidthFront"'), "the wing's grip is its room end, not the wall");
  for (const k of ["mainWidth", "lWidth", "mainDepth", "lDepth"]) {
    assert(new RegExp(`class="col-dim editable" data-param="${k}" data-value="\\d+"`).test(svg), `${k} is a clickable number`);
  }
  assert(!/>2200 × 1600</.test(svg) && !/>1582 × 600</.test(svg), "no sizes written in the middle of a run");
}

// A board longer than a sheet is a red check line.
{
  const r = mod.generate({ style: "I_SHAPE", mainWidth: 2600, mainDepth: 560, height: 420 });
  assert(r.validation.errors.some((e) => e.startsWith("i_front is 2600 long")), "2600 I: the front is past the sheet");
  assert(mod.generate({ style: "I_SHAPE", mainWidth: 2380, mainDepth: 560 }).validation.errors.length === 0, "2380 still fits");
}

console.log("lounge.test.js: ok");
