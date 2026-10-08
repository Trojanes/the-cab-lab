// Wheel-arch pair: two boxes, a base whose back sits in one, a partition notch.
globalThis.window = globalThis.window || { cablab: null, addEventListener() {} };
const { resolveSpace } = await import("./spaces.js");
const { wallBoards } = await import("./walls.js");
const { archBoxes, baseAvoidances, notchFloor } = await import("./wheelArch.js");

function assert(cond, msg) {
  if (!cond) throw new Error(msg || "assertion failed");
}

const bounds = { minX: 0, minY: 0, maxX: 4000, maxY: 6000 };
const pair = archBoxes({ id: "wa-1", yRear: 6000, length: 800, width: 400, height: 300 }, bounds);
assert(pair.length === 2, "a pair");
assert(pair[0].x0 === 0 && pair[0].x1 === 400 && pair[0].y0 === 5200 && pair[0].y1 === 6000 && pair[0].z1 === 300, "left box");
assert(pair[1].x0 === 3600 && pair[1].x1 === 4000 && pair[1].y0 === 5200 && pair[1].y1 === 6000, "right box mirrors");

// Cabinet against the left wall: local +Y points to −world X (rotZ 90), back on x = 0.
const cd = 570 - 16;
const hit = baseAvoidances({
  pose: { x: cd, y: 5200, z: 0, rotZ: 90 },
  W: 800, D: 570, H: 880, frontThickness: 16,
}, pair);
assert(hit.length === 1 && hit[0].id === "wa-1-L", "only the left arch");
assert(hit[0].x0 === 0 && hit[0].x1 === 800, `x ${hit[0].x0}..${hit[0].x1}`);
assert(hit[0].depth === 400 && hit[0].height === 300, `depth ${hit[0].depth} height ${hit[0].height}`);

// Same cabinet shifted forward so the arch no longer reaches its back.
const miss = baseAvoidances({
  pose: { x: cd, y: 2000, z: 0, rotZ: 90 },
  W: 800, D: 570, H: 880, frontThickness: 16,
}, pair);
assert(miss.length === 0, "arch that misses the back is not a rear cut");

const outline = notchFloor(
  [{ u: 0, z: 0 }, { u: 1000, z: 0 }, { u: 1000, z: 800 }, { u: 0, z: 800 }, { u: 0, z: 0 }],
  [{ u0: 200, u1: 500, z: 300 }],
);
const step = outline.filter((p) => p.z === 300);
assert(step.length === 2 && step[0].u === 200 && step[1].u === 500, "floor edge steps up over the arch");

const stock = {
  carcass: { thickness: 15 },
  partition: { thickness: 18, floorClearance: 0, ceilingClearance: 0 },
  door: { thickness: 16 },
};
const space = resolveSpace({
  kind: "box",
  params: {
    width: 4000, depth: 6000, height: 2400, walls: [0, 1, 2, 3],
    wheelArches: [{ id: "wa-1", yRear: 5000, length: 800, width: 400, height: 300 }],
  },
});
assert(space.wheelArches.length === 2, "resolveSpace publishes the pair");
const cut = wallBoards({ id: "wall-1", axis: "x", at: 200, u0: 4500, u1: 5500, side: 1, openings: [] }, space, stock);
const pts = cut.boards[0].outline;
assert(pts.some((p) => p.u === 4500 && p.z === 300) && pts.some((p) => p.u === 5000 && p.z === 300), "partition outline notched to the arch height");

console.log("wheelArch: pair, base projection, partition notch OK");
