// Rigid poses for Move. Degrees, Three.js Euler order XYZ (applied as Rx then Ry then Rz
// in the rotating frame). A missing angle is 0, so an old pose `{ x, y, z, rotZ }` still
// stands upright and yaws the way it always has.

const DEG = Math.PI / 180;
const AXES = { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] };

export function poseOf(pose) {
  return {
    x: pose?.x || 0,
    y: pose?.y || 0,
    z: pose?.z || 0,
    rotX: pose?.rotX || 0,
    rotY: pose?.rotY || 0,
    rotZ: pose?.rotZ || 0,
  };
}

/** Board nudge stored on the cabinet: a shift (mm) and a rotation (deg) about the board centre, both in the cabinet frame. */
export function boardOverride(raw) {
  return {
    x: raw?.x || 0,
    y: raw?.y || 0,
    z: raw?.z || 0,
    rotX: raw?.rotX || 0,
    rotY: raw?.rotY || 0,
    rotZ: raw?.rotZ || 0,
  };
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

/** Row-major 3×3. Columns are the cabinet's local axes in world space. Matches Three.js Euler XYZ. */
export function rotationMatrix(rotX, rotY, rotZ) {
  const x = (rotX || 0) * DEG;
  const y = (rotY || 0) * DEG;
  const z = (rotZ || 0) * DEG;
  const a = Math.cos(x);
  const b = Math.sin(x);
  const c = Math.cos(y);
  const d = Math.sin(y);
  const e = Math.cos(z);
  const f = Math.sin(z);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    [c * e, -c * f, d],
    [af + be * d, ae - bf * d, -b * c],
    [bf - ae * d, be + af * d, a * c],
  ];
}

export function mulMat(a, b) {
  const o = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (let r = 0; r < 3; r += 1) {
    for (let c = 0; c < 3; c += 1) o[r][c] = a[r][0] * b[0][c] + a[r][1] * b[1][c] + a[r][2] * b[2][c];
  }
  return o;
}

export function mulVec(m, v) {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

export function transpose(m) {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

/** World point of a cabinet-local point. */
export function worldOf(pose, local) {
  const p = poseOf(pose);
  const r = mulVec(rotationMatrix(p.rotX, p.rotY, p.rotZ), local);
  return [p.x + r[0], p.y + r[1], p.z + r[2]];
}

/** Six edge directions leaving a corner: the cabinet's local axes and their opposites, in world space. */
export function localAxes(pose) {
  const p = poseOf(pose);
  const R = rotationMatrix(p.rotX, p.rotY, p.rotZ);
  const col = (c) => [R[0][c], R[1][c], R[2][c]];
  const neg = (v) => [-v[0], -v[1], -v[2]];
  const ex = col(0);
  const ey = col(1);
  const ez = col(2);
  return [ex, neg(ex), ey, neg(ey), ez, neg(ez)];
}

/** Euler XYZ degrees from a row-major rotation. Same decomposition as Three.js. */
export function eulerFromMatrix(m) {
  const sy = clamp(m[0][2], -1, 1);
  const rotY = Math.asin(sy);
  let rotX;
  let rotZ;
  if (Math.abs(sy) < 0.9999999) {
    rotX = Math.atan2(-m[1][2], m[2][2]);
    rotZ = Math.atan2(-m[0][1], m[0][0]);
  } else {
    rotX = Math.atan2(m[2][1], m[1][1]);
    rotZ = 0;
  }
  return { rotX: rotX / DEG, rotY: rotY / DEG, rotZ: rotZ / DEG };
}

function axisAngleMatrix(axis, angle) {
  const [x, y, z] = AXES[axis];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const t = 1 - c;
  return [
    [t * x * x + c, t * x * y - s * z, t * x * z + s * y],
    [t * x * y + s * z, t * y * y + c, t * y * z - s * x],
    [t * x * z - s * y, t * y * z + s * x, t * z * z + c],
  ];
}

/**
 * Pose after turning `angleDeg` about a world axis through `localCenter`.
 * That cabinet-local point stays where it is in the world.
 */
export function rotatePoseAbout(pose, axis, angleDeg, localCenter) {
  const p = poseOf(pose);
  const R = rotationMatrix(p.rotX, p.rotY, p.rotZ);
  const center = worldOf(p, localCenter);
  const R2 = mulMat(axisAngleMatrix(axis, (angleDeg || 0) * DEG), R);
  const e = eulerFromMatrix(R2);
  const rc = mulVec(R2, localCenter);
  return {
    x: center[0] - rc[0],
    y: center[1] - rc[1],
    z: center[2] - rc[2],
    rotX: e.rotX,
    rotY: e.rotY,
    rotZ: e.rotZ,
  };
}

/** Pose after a shift along one world axis. Rotation is unchanged. */
export function translatePose(pose, axis, delta) {
  const p = poseOf(pose);
  p[axis] += delta || 0;
  return p;
}

/**
 * Board override after a world-axis shift. The shift is stored in the cabinet
 * frame, so a later move of the whole cabinet carries the board with it.
 */
export function translateBoardOverride(pose, override, axis, delta) {
  const p = poseOf(pose);
  const local = mulVec(transpose(rotationMatrix(p.rotX, p.rotY, p.rotZ)), [
    axis === "x" ? delta : 0,
    axis === "y" ? delta : 0,
    axis === "z" ? delta : 0,
  ]);
  const o = boardOverride(override);
  return { ...o, x: o.x + local[0], y: o.y + local[1], z: o.z + local[2] };
}

/**
 * Board override after turning `angleDeg` about a world axis through the board's
 * current centre. The centre (and so the shift) stays put.
 */
export function rotateBoardOverride(pose, override, axis, angleDeg) {
  const p = poseOf(pose);
  const Rpose = rotationMatrix(p.rotX, p.rotY, p.rotZ);
  const o = boardOverride(override);
  const Rb = rotationMatrix(o.rotX, o.rotY, o.rotZ);
  const Rw = axisAngleMatrix(axis, (angleDeg || 0) * DEG);
  const Rb2 = mulMat(mulMat(mulMat(transpose(Rpose), Rw), Rpose), Rb);
  const e = eulerFromMatrix(Rb2);
  return { ...o, rotX: e.rotX, rotY: e.rotY, rotZ: e.rotZ };
}

/**
 * Hit point back in the board's nominal cabinet frame (before its override),
 * so face picking still matches the generator's box.
 */
export function nominalBoardPoint(point, center, override) {
  const o = boardOverride(override);
  const d = mulVec(transpose(rotationMatrix(o.rotX, o.rotY, o.rotZ)), [
    point[0] - center[0] - o.x,
    point[1] - center[1] - o.y,
    point[2] - center[2] - o.z,
  ]);
  return [center[0] + d[0], center[1] + d[1], center[2] + d[2]];
}

const FACE_PLANE = { YZ: ["y", "z", "x"], XZ: ["x", "z", "y"], XY: ["x", "y", "z"] };

function vecDot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function vecLen(v) {
  return Math.hypot(v[0], v[1], v[2]) || 1;
}
function vecNorm(v) {
  const l = vecLen(v);
  return [v[0] / l, v[1] / l, v[2] / l];
}
function axisOf(name) {
  return name === "x" ? 0 : name === "y" ? 1 : 2;
}

/** "+X" / "-Y" / a numeric normal → a cabinet-frame vector. */
export function faceNormalVector(normal) {
  if (Array.isArray(normal)) return vecNorm(normal);
  if (typeof normal === "string" && (normal[0] === "+" || normal[0] === "-") && normal.length >= 2) {
    const s = normal[0] === "-" ? -1 : 1;
    const i = axisOf(normal[1].toLowerCase());
    const v = [0, 0, 0];
    v[i] = s;
    return v;
  }
  return [0, 0, 1];
}

/**
 * One board face as a point and a unit normal in the cabinet frame, after the
 * board's Move override. A / B sit on the thickness sides of the box; an edge
 * face sits on the outline edge, midway through the thickness.
 */
export function boardFaceLocal(board, face, override) {
  if (!board || !face) return null;
  const normal = faceNormalVector(face.normal);
  const [U, V, T] = FACE_PLANE[board.profilePlane] || FACE_PLANE.XY;
  let point;
  if (face.edge) {
    const u = (face.edge.from[0] + face.edge.to[0]) / 2;
    const v = (face.edge.from[1] + face.edge.to[1]) / 2;
    point = [0, 0, 0];
    point[axisOf(U)] = board[`${U}0`] + u;
    point[axisOf(V)] = board[`${V}0`] + v;
    point[axisOf(T)] = (board[`${T}0`] + board[`${T}1`]) / 2;
  } else {
    point = [(board.x0 + board.x1) / 2, (board.y0 + board.y1) / 2, (board.z0 + board.z1) / 2];
    const i = normal[0] ? 0 : normal[1] ? 1 : 2;
    const key = ["x", "y", "z"][i];
    point[i] = normal[i] > 0 ? board[`${key}1`] : board[`${key}0`];
  }
  const o = boardOverride(override);
  const c = [(board.x0 + board.x1) / 2, (board.y0 + board.y1) / 2, (board.z0 + board.z1) / 2];
  const R = rotationMatrix(o.rotX, o.rotY, o.rotZ);
  const d = mulVec(R, [point[0] - c[0], point[1] - c[1], point[2] - c[2]]);
  return {
    point: [c[0] + d[0] + o.x, c[1] + d[1] + o.y, c[2] + d[2] + o.z],
    normal: vecNorm(mulVec(R, normal)),
  };
}

/** Cabinet-frame plane → world plane. */
export function worldPlane(pose, local) {
  if (!local) return null;
  const p = poseOf(pose);
  const R = rotationMatrix(p.rotX, p.rotY, p.rotZ);
  return { point: worldOf(p, local.point), normal: vecNorm(mulVec(R, local.normal)) };
}

/**
 * Translation that puts `source` on the same plane as `target`, normals pointing
 * the same way (Inventor flush / 对齐). Opposite or non-parallel faces are refused.
 */
export function alignTranslation(source, target) {
  if (!source || !target) return { ok: false, reason: "missing face" };
  const n1 = vecNorm(source.normal);
  const n2 = vecNorm(target.normal);
  const dot = vecDot(n1, n2);
  if (dot < 0.999) {
    return { ok: false, reason: dot < -0.999 ? "faces look opposite ways" : "faces are not parallel", dot };
  }
  const gap = vecDot(n1, [target.point[0] - source.point[0], target.point[1] - source.point[1], target.point[2] - source.point[2]]);
  return { ok: true, gap, delta: [n1[0] * gap, n1[1] * gap, n1[2] * gap] };
}

/** Pose after a world-space shift. Rotation is unchanged. */
export function translatePoseBy(pose, delta) {
  const p = poseOf(pose);
  return { ...p, x: p.x + (delta[0] || 0), y: p.y + (delta[1] || 0), z: p.z + (delta[2] || 0) };
}

/** Board override after a world-space shift. Stored in the cabinet frame. */
export function translateBoardOverrideBy(pose, override, delta) {
  const p = poseOf(pose);
  const local = mulVec(transpose(rotationMatrix(p.rotX, p.rotY, p.rotZ)), delta);
  const o = boardOverride(override);
  return { ...o, x: o.x + local[0], y: o.y + local[1], z: o.z + local[2] };
}

/**
 * Corner points of a board in the cabinet frame, after its Move override.
 * Outline vertices (or the box rectangle) at both sides of the thickness.
 */
export function boardCornerLocals(board, override) {
  const [U, V, T] = FACE_PLANE[board.profilePlane] || FACE_PLANE.XY;
  const pv = board.profileVector;
  let uv = null;
  if (board.profilePlane === "YZ") {
    if (pv && pv.length >= 4) uv = pv.map((p) => [Number(p.y) - board.y0, Number(p.z) - board.z0]);
    else if (board.cutProfileVector && board.cutProfileVector.length >= 4) uv = board.cutProfileVector.map((p) => [p.y, p.z]);
  } else if (pv && pv.length >= 4) {
    const mu = Math.min(...pv.map((p) => Number(p[U])));
    const mv = Math.min(...pv.map((p) => Number(p[V])));
    uv = pv.map((p) => [Number(p[U]) - mu, Number(p[V]) - mv]);
  }
  if (!uv) {
    const w = board[`${U}1`] - board[`${U}0`];
    const h = board[`${V}1`] - board[`${V}0`];
    uv = [[0, 0], [w, 0], [w, h], [0, h]];
  }
  if (uv.length > 2) {
    const a = uv[0];
    const b = uv[uv.length - 1];
    if (Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6) uv = uv.slice(0, -1);
  }
  const o = boardOverride(override);
  const c = [(board.x0 + board.x1) / 2, (board.y0 + board.y1) / 2, (board.z0 + board.z1) / 2];
  const R = rotationMatrix(o.rotX, o.rotY, o.rotZ);
  const out = [];
  for (const [u, v] of uv) {
    for (const t of [board[`${T}0`], board[`${T}1`]]) {
      const point = [0, 0, 0];
      point[axisOf(U)] = board[`${U}0`] + u;
      point[axisOf(V)] = board[`${V}0`] + v;
      point[axisOf(T)] = t;
      const d = mulVec(R, [point[0] - c[0], point[1] - c[1], point[2] - c[2]]);
      out.push([c[0] + d[0] + o.x, c[1] + d[1] + o.y, c[2] + d[2] + o.z]);
    }
  }
  return out;
}
