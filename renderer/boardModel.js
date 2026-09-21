// Read-only helpers over the generator's board / face layer (docs/model-spec.md)
// for the main window: what to call a face, what is machined into it, which
// face a 3D hit landed on. No geometry is built or changed here.

/** In-plane axes (u, v) then the thickness axis, lowercase (mirrors generators/_lib/model.ts). */
export function planeAxes(plane) {
  if (plane === "YZ") return ["y", "z", "x"];
  if (plane === "XZ") return ["x", "z", "y"];
  return ["x", "y", "z"];
}

/** Cabinet-frame direction → the word a cabinet maker uses (fronts sit at −Y). */
const DIR_NAMES = { "-Y": "front", "+Y": "back", "-X": "left", "+X": "right", "+Z": "top", "-Z": "bottom" };
export function dirName(normal) {
  if (typeof normal === "string") return DIR_NAMES[normal] || normal;
  return "slanted";
}

export function isBigFace(face) { return face.id === "A" || face.id === "B"; }
export function bigFaces(board) { return (board.faces || []).filter(isBigFace); }
export function edgeFaces(board) { return (board.faces || []).filter((f) => f.id.startsWith("E")); }

/** Human label: the module's `semantic` when it gave one, else the direction the face looks. */
export function faceLabel(face) {
  if (face.semantic) return face.semantic;
  return isBigFace(face) ? `${dirName(face.normal)} face` : `${dirName(face.normal)} edge`;
}

const PLURAL = { groove: "grooves", tgroove: "T-grooves", hole: "holes", cutout: "cutouts", tongue: "tongues", notch: "notches" };
/** "2 grooves · 1 cutout" — or "" for a bare face. */
export function featureSummary(face) {
  const counts = new Map();
  for (const f of face.features || []) counts.set(f.kind, (counts.get(f.kind) || 0) + 1);
  return Array.from(counts, ([kind, n]) => `${n} ${n === 1 ? kind : PLURAL[kind] || `${kind}s`}`).join(" · ");
}

/** One line per feature, the way the bench prints them. */
export function featureLine(f) {
  const fmt = (v) => (Math.round(v * 10) / 10).toString();
  const tail = f.through ? " · through" : f.depth != null ? ` · depth ${fmt(f.depth)}` : "";
  const forWhom = f.for ? ` → ${f.for}` : "";
  if (f.center) return `${f.kind} ${f.id}${forWhom} · ⌀${fmt(f.diameter)} at (${fmt(f.center[0])}, ${fmt(f.center[1])})${tail}`;
  if (Number.isFinite(f.u0)) return `${f.kind} ${f.id}${forWhom} · u ${fmt(f.u0)}…${fmt(f.u1)} · v ${fmt(f.v0)}…${fmt(f.v1)}${tail}`;
  return `${f.kind} ${f.id}${forWhom}`;
}

/** Board size as L × W × T (the two in-plane extents, longest first, then the thickness). */
export function boardDims(b) {
  const dx = b.x1 - b.x0, dy = b.y1 - b.y0, dz = b.z1 - b.z0;
  const dims = [dx, dy, dz].filter((_, k) => ["X", "Y", "Z"][k] !== b.thicknessAxis).sort((a, c) => c - a);
  return { L: dims[0], W: dims[1], T: b.materialThickness };
}

function distToSegment(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/**
 * Which face of `board` a ray hit: `normal` and `point` in the cabinet frame.
 * Along the thickness axis → A (+) or B (−); otherwise the edge face closest
 * to the hit point whose outward normal agrees with the hit normal.
 */
export function faceAtHit(board, normal, point) {
  const faces = board.faces || [];
  if (!faces.length) return null;
  const [U, V, T] = planeAxes(board.profilePlane);
  const nT = normal[T];
  if (Math.abs(nT) > 0.7) return nT > 0 ? "A" : "B";
  const p = [point[U] - board[`${U}0`], point[V] - board[`${V}0`]];
  const nu = normal[U], nv = normal[V];
  let best = null;
  for (const f of edgeFaces(board)) {
    if (!f.edge) continue;
    let agree = 0;
    if (typeof f.normal === "string") {
      const axis = f.normal[1].toLowerCase();
      const sign = f.normal[0] === "+" ? 1 : -1;
      agree = Math.max(0, sign * normal[axis]);
    } else {
      const idx = { x: 0, y: 1, z: 2 };
      agree = Math.max(0, f.normal[idx[U]] * nu + f.normal[idx[V]] * nv);
    }
    const score = distToSegment(p, f.edge.from, f.edge.to) + (agree > 0.5 ? 0 : 1e4);
    if (!best || score < best.score) best = { id: f.id, score };
  }
  return best ? best.id : null;
}
