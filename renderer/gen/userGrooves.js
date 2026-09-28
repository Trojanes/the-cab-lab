// Generated from generators/_lib/userGrooves.ts - do not edit.

// generators/_lib/model.ts
function planeAxes(plane) {
  if (plane === "YZ") return ["y", "z", "x"];
  if (plane === "XZ") return ["x", "z", "y"];
  return ["x", "y", "z"];
}

// generators/_lib/milling.ts
var WORK = /* @__PURE__ */ new Set(["groove", "tgroove", "hole", "cutout"]);
var CARCASS = /stipple/i;
var EPS = 0.01;
var partial = (f) => WORK.has(f.kind) && !f.through;
var through = (f) => WORK.has(f.kind) && !!f.through;
function bboxArea(pts) {
  if (!pts || !pts.length) return 0;
  const xs = pts.map((p) => Number(p.x ?? 0));
  const ys = pts.map((p) => Number(p.y ?? 0));
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
}
function slabRebateFace(b) {
  if (!b.slabs || b.slabs.length < 2 || b.thicknessAxis !== "Z") return null;
  const material = (s) => bboxArea(s.outline) - (s.holes ?? []).reduce((a, h) => a + bboxArea(h), 0);
  const bottom = b.slabs.reduce((a, s) => s.z0 < a.z0 ? s : a);
  const top = b.slabs.reduce((a, s) => s.z1 > a.z1 ? s : a);
  if (material(bottom) < material(top) - EPS) return "B";
  if (material(top) < material(bottom) - EPS) return "A";
  return null;
}
function colourFaceOf(b, A, B) {
  if (b.stock?.kind !== "door" || b.stock.sides === 2) return null;
  return [A, B].find((f) => f.visible === true && f.finish?.colour && !CARCASS.test(f.finish.colour)) ?? null;
}
function reportFace(A, B, colour) {
  if (colour) return colour.id === "A" ? "B" : "A";
  const inward = (f) => f.semantic === "inside" || f.semantic === "back" || f.semantic === "wall";
  if (inward(B) && !inward(A)) return "B";
  return "A";
}
function applyMilling(boards) {
  const issues = [];
  for (const b of boards) {
    const A = b.faces?.find((f) => f.id === "A");
    const B = b.faces?.find((f) => f.id === "B");
    if (!A || !B) continue;
    const rebate = slabRebateFace(b);
    const onA = A.features.some(partial) || rebate === "A";
    const onB = B.features.some(partial) || rebate === "B";
    const colour = colourFaceOf(b, A, B);
    let face;
    if (onA && onB) {
      face = reportFace(A, B, colour);
      issues.push({ board: b.id, reason: "both-faces", message: `${b.id} has partial-depth machining on both faces: the CNC cuts from one side only` });
    } else if (onA || onB) {
      face = onA ? "A" : "B";
      if (colour && colour.id === face) {
        issues.push({ board: b.id, reason: "colour-face", message: `${b.id} is single-sided and has partial-depth machining on its colour face (${face})` });
      }
    } else if (colour) {
      face = colour.id === "A" ? "B" : "A";
    } else {
      b.milling = "either";
      continue;
    }
    const [to, from] = face === "A" ? [A, B] : [B, A];
    const moving = from.features.filter(through);
    if (moving.length) {
      from.features = from.features.filter((f) => !through(f));
      to.features.push(...moving);
    }
    b.milling = face;
  }
  return { issues };
}

// generators/_lib/userGrooves.ts
var GROOVE_MIN_FLOOR_MM = 1;
var GROOVE_MIN_WIDTH_MM = 0.5;
function faceSize(b) {
  const [U, V, T] = planeAxes(b.profilePlane);
  const span = (a) => Math.abs(b[`${a}1`] - b[`${a}0`]);
  return { w: span(U), h: span(V), t: span(T) };
}
function grooveProblem(b, g) {
  const { w, h, t } = faceSize(b);
  const u0 = Math.min(g.u0, g.u1);
  const u1 = Math.max(g.u0, g.u1);
  const v0 = Math.min(g.v0, g.v1);
  const v1 = Math.max(g.v0, g.v1);
  if (u1 - u0 < GROOVE_MIN_WIDTH_MM || v1 - v0 < GROOVE_MIN_WIDTH_MM) return "is narrower than 0.5";
  if (u0 < -0.01 || v0 < -0.01 || u1 > w + 0.01 || v1 > h + 0.01) return `runs off the ${Math.round(w)} \xD7 ${Math.round(h)} face`;
  if (!(g.depth > 0)) return "has no depth";
  if (g.depth > t - GROOVE_MIN_FLOOR_MM + 1e-3) return `is ${g.depth} deep in ${t} stock (at most ${t - GROOVE_MIN_FLOOR_MM})`;
  return null;
}
function applyUserGrooves(result, overrides) {
  const byBoard = overrides?.boards;
  if (!result || !result.boards || !byBoard) return result;
  const wanted = Object.entries(byBoard).filter(([, o]) => o && Array.isArray(o.grooves) && o.grooves.length);
  if (!wanted.length) return result;
  const boards = structuredClone(result.boards);
  const warnings = [];
  for (const [roleId, o] of wanted) {
    const b = boards.find((x) => x.id === roleId);
    if (!b) {
      warnings.push(`Groove on ${roleId}: that board is no longer made`);
      continue;
    }
    for (const g of o.grooves) {
      const problem = grooveProblem(b, g);
      if (problem) {
        warnings.push(`Groove ${g.id} on ${roleId} ${problem}: skipped`);
        continue;
      }
      const face = b.faces?.find((f) => f.id === g.face);
      if (!face) {
        warnings.push(`Groove ${g.id} on ${roleId}: face ${g.face} missing`);
        continue;
      }
      const feature = {
        id: `user-${g.id}`,
        kind: g.kind === "tgroove" ? "tgroove" : "groove",
        u0: Math.min(g.u0, g.u1),
        u1: Math.max(g.u0, g.u1),
        v0: Math.min(g.v0, g.v1),
        v1: Math.max(g.v0, g.v1),
        depth: g.depth,
        for: g.group ? `user:${g.group}` : "user",
        source: "user"
      };
      face.features = [...face.features, feature];
    }
  }
  const milling = applyMilling(boards);
  const v = result.validation ?? { errors: [], warnings: [] };
  return {
    ...result,
    boards,
    milling,
    validation: { ...v, warnings: [...v.warnings ?? [], ...warnings] }
  };
}
export {
  GROOVE_MIN_FLOOR_MM,
  GROOVE_MIN_WIDTH_MM,
  applyUserGrooves,
  faceSize,
  grooveProblem
};
