// Pose math against Three.js Euler XYZ, and against the old yaw-only centre formula.
import * as THREE from "three";
import { rotationMatrix, rotatePoseAbout, translatePose, translateBoardOverride, worldOf, eulerFromMatrix, boardFaceLocal, worldPlane, alignTranslation, boardCornerLocals } from "./pose.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function near(a, b, eps = 1e-6) {
  assert(Math.abs(a - b) < eps, `${a} != ${b}`);
}

const samples = [
  [0, 0, 0],
  [0, 0, 90],
  [0, 0, -90],
  [30, -20, 45],
  [10, 80, 15],
  [0, 90, 20],
];
for (const [rx, ry, rz] of samples) {
  const e = new THREE.Euler(rx * Math.PI / 180, ry * Math.PI / 180, rz * Math.PI / 180, "XYZ");
  const m = new THREE.Matrix4().makeRotationFromEuler(e);
  const te = m.elements;
  const r = rotationMatrix(rx, ry, rz);
  const got = [r[0][0], r[1][0], r[2][0], r[0][1], r[1][1], r[2][1], r[0][2], r[1][2], r[2][2]];
  const exp = [te[0], te[1], te[2], te[4], te[5], te[6], te[8], te[9], te[10]];
  for (let i = 0; i < 9; i += 1) near(got[i], exp[i], 1e-9);
  const back = eulerFromMatrix(r);
  const e2 = new THREE.Euler().setFromRotationMatrix(m, "XYZ");
  near(back.rotX, e2.x * 180 / Math.PI, 1e-6);
  near(back.rotY, e2.y * 180 / Math.PI, 1e-6);
  near(back.rotZ, e2.z * 180 / Math.PI, 1e-6);
}

// Upright cabinet, +90° about world Z through the envelope centre. Matches the old 2D formula.
const center = [300, 242, 360];
const pose = { x: 1000, y: 800, z: 0, rotZ: 0 };
const next = rotatePoseAbout(pose, "z", 90, center);
const a0 = 0;
const a1 = Math.PI / 2;
const cx = center[0];
const cy = center[1];
const wx = pose.x + cx * Math.cos(a0) - cy * Math.sin(a0);
const wy = pose.y + cx * Math.sin(a0) + cy * Math.cos(a0);
near(next.x, wx - (cx * Math.cos(a1) - cy * Math.sin(a1)));
near(next.y, wy - (cx * Math.sin(a1) + cy * Math.cos(a1)));
near(next.z, 0);
near(next.rotZ, 90);
near(next.rotX, 0);
near(next.rotY, 0);
const before = worldOf(pose, center);
const after = worldOf(next, center);
near(before[0], after[0]);
near(before[1], after[1]);
near(before[2], after[2]);

// A tilted turn still keeps the centre.
const tilted = { x: 100, y: 200, z: 300, rotX: 20, rotY: -15, rotZ: 40 };
const turned = rotatePoseAbout(tilted, "x", 35, center);
const c0 = worldOf(tilted, center);
const c1 = worldOf(turned, center);
near(c0[0], c1[0], 1e-6);
near(c0[1], c1[1], 1e-6);
near(c0[2], c1[2], 1e-6);

const slid = translatePose(pose, "y", 40);
near(slid.y, 840);
near(slid.x, 1000);
near(slid.rotZ, 0);

// Cabinet yawed 90°: a world +X shift is cabinet −Y.
const yawed = { x: 0, y: 0, z: 0, rotZ: 90 };
const nudged = translateBoardOverride(yawed, null, "x", 10);
near(nudged.x, 0, 1e-9);
near(nudged.y, -10, 1e-9);
near(nudged.z, 0, 1e-9);

const board = { profilePlane: "YZ", x0: 0, x1: 16, y0: 0, y1: 500, z0: 0, z1: 700 };
const faceR = { id: "A", normal: "+X" };
const faceL = { id: "B", normal: "-X" };
const upright = { x: 0, y: 0, z: 0, rotZ: 0 };
const right = worldPlane(upright, boardFaceLocal(board, faceR, null));
const other = worldPlane({ x: 400, y: 0, z: 0 }, boardFaceLocal(board, faceR, null));
const fit = alignTranslation(right, other);
assert(fit.ok, "parallel same-way faces align");
near(fit.gap, 400);
near(fit.delta[0], 400);
near(fit.delta[1], 0);
const oppose = alignTranslation(right, worldPlane(upright, boardFaceLocal(board, faceL, null)));
assert(!oppose.ok && oppose.reason === "faces look opposite ways", oppose.reason);

const corners = boardCornerLocals(board, null);
assert(corners.length === 8, `box has 8 corners, got ${corners.length}`);
const hi = corners.find((p) => Math.abs(p[0] - 16) < 1e-6 && Math.abs(p[1] - 500) < 1e-6 && Math.abs(p[2] - 700) < 1e-6);
assert(hi, "missing outer top corner");

console.log("pose ok");
