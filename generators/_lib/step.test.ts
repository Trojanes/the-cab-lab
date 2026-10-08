/**
 * STEP solids: a plain board, a hinge cup, a groove, an LED channel that runs
 * off the edge, and a real kitchen (every board a closed shell).
 */
import assert from "node:assert/strict";
import type { Board, Face } from "./model.ts";
import { boardFaces, buildStep, solidContains, solidError } from "./step.ts";
import { generateKitchenCabinet } from "../kitchen/generator.ts";

function board(partial: Partial<Board> & Pick<Board, "id" | "profilePlane" | "thicknessAxis" | "x0" | "x1" | "y0" | "y1" | "z0" | "z1">): Board {
  return {
    name: partial.id,
    category: "panel",
    boardType: "panel",
    materialThickness: partial.x1 - partial.x0 || partial.y1 - partial.y0 || partial.z1 - partial.z0,
    faces: [],
    ...partial,
  };
}

function check(b: Board, inside: [number, number, number][], outside: [number, number, number][]) {
  const faces = boardFaces(b);
  const err = solidError(faces);
  assert.equal(err, null, `${b.id}: ${err}`);
  for (const p of inside) assert.equal(solidContains(faces, p), true, `${b.id} should contain ${p}`);
  for (const p of outside) assert.equal(solidContains(faces, p), false, `${b.id} should miss ${p}`);
}

const plain = board({
  id: "plain", profilePlane: "YZ", thicknessAxis: "X",
  x0: 0, x1: 18, y0: 0, y1: 200, z0: 0, z1: 100,
});
check(plain, [[9, 100, 50]], [[9, 100, 150], [-5, 100, 50]]);

const grooved = board({
  id: "groove", profilePlane: "YZ", thicknessAxis: "X",
  x0: 0, x1: 18, y0: 0, y1: 200, z0: 0, z1: 100,
  faces: [{
    id: "A", key: "groove.A", normal: "+X", features: [
      { id: "G", kind: "groove", u0: 80, u1: 120, v0: 40, v1: 60, depth: 6 },
    ],
  } as Face],
});
// Face A is +X. The pocket is the last 6 mm, y 80..120, z 40..60.
check(grooved, [[6, 100, 50], [15, 10, 10]], [[15, 100, 50]]);

const cupped = board({
  id: "cup", profilePlane: "YZ", thicknessAxis: "X",
  x0: 0, x1: 18, y0: 0, y1: 200, z0: 0, z1: 100,
  faces: [{
    id: "A", key: "cup.A", normal: "+X", features: [
      { id: "H", kind: "hole", center: [100, 50], diameter: 35, depth: 12, for: "hinge" },
    ],
  } as Face],
});
check(cupped, [[3, 100, 50], [16, 100, 80]], [[16, 100, 50]]);

const led = board({
  id: "led", profilePlane: "XY", thicknessAxis: "Z",
  x0: 0, x1: 400, y0: 0, y1: 200, z0: 0, z1: 18,
  faces: [{
    id: "B", key: "led.B", normal: "-Z", features: [
      { id: "LED", kind: "tgroove", u0: 0, u1: 400, v0: 20, v1: 34, depth: 6.5, for: "led" },
    ],
  } as Face],
});
// Channel runs off both ends, so the underside is open. z 0..6.5, y 20..34.
check(led, [[200, 27, 10], [200, 10, 3]], [[200, 27, 3]]);

const rebated = board({
  id: "lid", profilePlane: "XY", thicknessAxis: "Z",
  x0: 0, x1: 100, y0: 0, y1: 80, z0: 0, z1: 18,
  slabs: [
    { outline: [{ x: 10, y: 10 }, { x: 90, y: 10 }, { x: 90, y: 70 }, { x: 10, y: 70 }], z0: 0, z1: 8 },
    { outline: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 80 }, { x: 0, y: 80 }], z0: 8, z1: 18 },
  ],
});
check(rebated, [[50, 40, 4], [50, 40, 12], [5, 5, 12]], [[5, 5, 4]]);

const step = buildStep({
  cabinets: [{ id: "cab-1", pose: { x: 500, y: 0, z: 0, rotZ: 90 }, boards: [plain] }],
});
assert.equal(step.ok, true);
assert.equal(step.boardCount, 1);
assert.equal(step.skipped.length, 0);
// Local (18, 0, 0) yawed 90° about Z lands at (500, 18, 0).
assert.ok(step.text.includes("(500.,18.,0.)"), "pose is baked into the solid");
assert.ok(step.text.includes("MANIFOLD_SOLID_BREP('cab-1/plain'"), "board name");
assert.ok(step.text.includes("NEXT_ASSEMBLY_USAGE_OCCURRENCE"), "assembly");

const kitchen = generateKitchenCabinet({
  globalSettings: { length: 887, depth: 270, height: 880 },
  materialThickness: 15,
  frontThickness: 16,
  frontClearance: 2.5,
  bottomClearanceHeight: 55,
  bottomClearanceStyle: "style_1",
  lockEnabled: true,
  ledGroove: true,
  columns: [
    {
      id: "k-col-1", width: 444,
      zones: [{
        id: "c1-door", height: 825, zoneType: "left_door" as const,
        shelfEnabled: true, shelfHeight: 400,
        leftSidePanelOptions: {
          panelType: "door" as const, frontVisible: true,
          bchNotchEnabled: false, strengtheningStripEnabled: true,
        },
      }],
    },
    {
      id: "k-col-2", width: 443,
      zones: [
        { id: "c2-drawer", height: 300, zoneType: "drawer" as const },
        { id: "c2-door", height: 525, zoneType: "right_door" as const, shelfEnabled: false },
      ],
    },
  ],
});

const broken: string[] = [];
for (const b of kitchen.boards) {
  const err = solidError(boardFaces(b));
  if (err) broken.push(`${b.id}: ${err}`);
}
assert.deepEqual(broken, [], broken.join("\n"));

const door = kitchen.boards.find((b) => b.id === "c1-door-front-panel");
assert.ok(door);
const cup = door.faces?.find((f) => f.id === "A")?.features.find((f) => f.kind === "hole" && f.for === "hinge");
assert.ok(cup && cup.center && cup.depth);
const doorFaces = boardFaces(door);
const [U, V, T] = door.profilePlane === "XZ" ? ["x", "z", "y"] as const : door.profilePlane === "YZ" ? ["y", "z", "x"] as const : ["x", "y", "z"] as const;
const cupPt: [number, number, number] = [0, 0, 0];
cupPt[U === "x" ? 0 : U === "y" ? 1 : 2] = door[`${U}0`] + cup.center[0];
cupPt[V === "x" ? 0 : V === "y" ? 1 : 2] = door[`${V}0`] + cup.center[1];
const t1 = door[`${T}1`];
cupPt[T === "x" ? 0 : T === "y" ? 1 : 2] = t1 - Math.min(cup.depth / 2, 2);
assert.equal(solidContains(doorFaces, cupPt), false, `hinge cup ${cupPt} on ${door.profilePlane}`);

const b3 = kitchen.boards.find((b) => b.id === "B3");
assert.ok(b3);
{
  const faces = boardFaces(b3);
  const nOf = (loop: [number, number, number][]) => {
    const n = [0, 0, 0];
    for (let i = 0; i < loop.length; i += 1) {
      const a = loop[i]!;
      const c = loop[(i + 1) % loop.length]!;
      n[0] += (a[1] - c[1]) * (a[2] + c[2]);
      n[1] += (a[2] - c[2]) * (a[0] + c[0]);
      n[2] += (a[0] - c[0]) * (a[1] + c[1]);
    }
    const len = Math.hypot(n[0], n[1], n[2]) || 1;
    return n.map((v) => v / len);
  };
  const groups = new Map<string, number[]>();
  faces.forEach((f, i) => {
    for (const loop of f.loops) {
      for (let k = 0; k < loop.length; k += 1) {
        const a = loop[k]!.join(",");
        const b = loop[(k + 1) % loop.length]!.join(",");
        const key = a < b ? `${a}|${b}` : `${b}|${a}`;
        const list = groups.get(key) ?? [];
        list.push(i);
        groups.set(key, list);
      }
    }
  });
  let seams = 0;
  for (const ids of groups.values()) {
    const uniq = [...new Set(ids)];
    if (uniq.length !== 2) continue;
    const n0 = nOf(faces[uniq[0]!]!.loops[0]!);
    const n1 = nOf(faces[uniq[1]!]!.loops[0]!);
    const d = Math.abs(n0[0]! * n1[0]! + n0[1]! * n1[1]! + n0[2]! * n1[2]!);
    if (d > 0.999) seams += 1;
  }
  assert.equal(seams, 0, "B3 still has a line along a flat face");
  const front = faces.flatMap((f) => f.loops).find((loop) => loop.every((p) => Math.abs(p[1] - b3.y0) < 0.05) && loop.length >= 4);
  assert.ok(front, "B3 front edge");
  assert.ok(front.every((p) => Math.abs(p[2] - (b3.z0 + 6.5)) > 0.2), "LED depth still marks B3's front edge");
}

const doorPanel = kitchen.boards.find((b) => b.id === "c1-door-front-panel" || b.id.endsWith("front-panel"));
assert.ok(doorPanel);
{
  const faces = boardFaces(doorPanel);
  const hinge = doorPanel.faces?.flatMap((f) => f.features).find((ft) => ft.kind === "hole" && ft.for === "hinge");
  assert.ok(hinge?.depth);
  const yCut = doorPanel.y1 - hinge.depth;
  const side = faces.flatMap((f) => f.loops).find((loop) => loop.every((p) => Math.abs(p[0] - doorPanel.x0) < 0.05) && loop.length >= 4);
  assert.ok(side, "door edge");
  assert.ok(side.every((p) => Math.abs(p[1] - yCut) > 0.2), "hinge depth still marks the door edge");
}
const ledFt = b3.faces?.flatMap((f) => f.features).find((f) => f.id === "B3_LED_MAIN");
assert.ok(ledFt && ledFt.depth && Number.isFinite(ledFt.u0) && Number.isFinite(ledFt.v0));
const ledPt: [number, number, number] = [
  b3.x0 + ((ledFt.u0 ?? 0) + (ledFt.u1 ?? 0)) / 2,
  b3.y0 + ((ledFt.v0 ?? 0) + (ledFt.v1 ?? 0)) / 2,
  b3.z0 + ledFt.depth / 2,
];
assert.equal(solidContains(boardFaces(b3), ledPt), false, `LED channel ${ledPt}`);

const file = buildStep({ cabinets: [{ id: "cab-k", pose: { x: 0, y: 0, z: 0 }, boards: kitchen.boards }] });
assert.equal(file.ok, true);
assert.equal(file.skipped.length, 0, file.skipped.map((s) => `${s.boardId}: ${s.reason}`).join("\n"));
assert.equal(file.boardCount, kitchen.boards.length);

console.log("step ok");
