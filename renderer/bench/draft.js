// Unsaved edits to a generator's placement rules (generators/<module>/layout.json).
// Every editor mode goes through these functions, so default mode and face
// mode write the same record: one rule per axis. Pure, JSON-safe (the draft
// lives in the tab's sessionStorage state); tested in node (rules.test.js).

const FACE = /^(x|y|z)(0|1)$/;
const clone = (v) => JSON.parse(JSON.stringify(v));

export function createDraft(committed) {
  return { base: clone(committed), layout: clone(committed), past: [], future: [] };
}

export function isDirty(draft) {
  return !!draft && JSON.stringify(draft.base) !== JSON.stringify(draft.layout);
}

/** Push a new layout (one undo step). */
export function commitEdit(draft, layout, label) {
  return { ...draft, past: [...draft.past, { layout: draft.layout, label }].slice(-100), layout, future: [] };
}
export function undo(draft) {
  if (!draft.past.length) return draft;
  const last = draft.past[draft.past.length - 1];
  return { ...draft, past: draft.past.slice(0, -1), layout: last.layout, future: [{ layout: draft.layout, label: last.label }, ...draft.future] };
}
export function redo(draft) {
  if (!draft.future.length) return draft;
  const next = draft.future[0];
  return { ...draft, past: [...draft.past, { layout: draft.layout, label: next.label }], layout: next.layout, future: draft.future.slice(1) };
}
export function discard(draft) {
  return createDraft(draft.base);
}
/** After a commit the file holds the draft: it becomes the new base. */
export function rebase(draft) {
  return createDraft(draft.layout);
}

/** Two `when` maps name the same situation. Both empty means the rule applies in every situation. */
export function sameWhen(a, b) {
  const ak = Object.keys(a || {}).sort();
  const bk = Object.keys(b || {}).sort();
  return ak.length === bk.length && ak.every((k, i) => k === bk[i] && a[k] === b[k]);
}

function casesOf(rule) {
  if (!rule) return [];
  if (Array.isArray(rule.cases)) return rule.cases.map((c) => ({ ...c }));
  const { cases, ...one } = rule;
  return [one];
}

function packCases(cases) {
  return cases.length === 1 ? cases[0] : { cases };
}

/** Add one axis, for one situation. Other axes, and other situations of this axis, stay untouched. */
export function ensureAxis(layout, boardId, axis, rule, when) {
  const stamped = { ...rule };
  delete stamped.cases;
  if (when && Object.keys(when).length) stamped.when = when;
  else delete stamped.when;
  const existing = layout.boards?.[boardId]?.axes?.[axis];
  if (existing && casesOf(existing).some((c) => sameWhen(c.when, stamped.when))) return layout;
  const next = clone(layout);
  next.boards = next.boards || {};
  const board = { ...(next.boards[boardId] || {}) };
  const cases = casesOf(existing);
  cases.push(stamped);
  board.axes = { ...(board.axes || {}), [axis]: packCases(cases) };
  next.boards[boardId] = board;
  return next;
}

/** Give a board a placement rule if it does not have one yet. `axes` is `{ x: { from, at, size }, … }`. */
export function ensureBoard(layout, boardId, axes) {
  const have = layout.boards?.[boardId]?.axes;
  if (have?.x && have?.y && have?.z) return layout;
  const next = clone(layout);
  next.boards = next.boards || {};
  next.boards[boardId] = { ...(next.boards[boardId] || {}), axes: { ...axes } };
  return next;
}

function axisOf(face) {
  const m = FACE.exec(face);
  if (!m) throw new Error(`not a box face: ${face}`);
  return { axis: m[1], side: m[2] === "0" ? "lo" : "hi" };
}

/**
 * Put one face of a board at `expr`. The face becomes the axis's driving face;
 * the size stays, so the opposite face moves the same distance (whole board).
 * A face relation on that axis is replaced.
 */
export function setFace(layout, boardId, face, expr, when, universal = false) {
  const { axis, side } = axisOf(face);
  const next = clone(layout);
  const rule = next.boards?.[boardId]?.axes?.[axis];
  if (!rule) throw new Error(`${boardId} has no ${axis} rule`);
  const cases = casesOf(rule);
  if (universal) {
    next.boards[boardId].axes[axis] = { from: side, at: String(expr).trim(), size: cases[0].size };
    return next;
  }
  const hit = cases.find((c) => sameWhen(c.when, when));
  if (!hit) throw new Error(`${boardId} has no ${axis} rule for this situation`);
  hit.from = side;
  hit.at = String(expr).trim();
  delete hit.relation;
  next.boards[boardId].axes[axis] = packCases(cases);
  return next;
}

/**
 * Where a face sits relative to a reference plane.
 * A positive gap leaves that much air: the low face stops past the plane,
 * the high face stops short of it.
 */
export function relationAt(refKey, face, gap = 0, extra = 0) {
  const shift = (face.endsWith("0") ? 1 : -1) * (Number(gap) || 0) + (Number(extra) || 0);
  if (!shift) return refKey;
  const mag = Math.round(Math.abs(shift) * 1000) / 1000;
  return `${refKey} ${shift > 0 ? "+" : "-"} ${mag}`;
}

/** Face mode: `face` of `boardId` sits on `refKey` (`T1.y1` or a notch plane). Contact or flush, plus an optional gap. */
export function setRelation(layout, boardId, face, refKey, kind, gap = 0, extra = 0, when, universal = false) {
  if (kind !== "contact" && kind !== "flush") throw new Error(`unknown relation ${kind}`);
  const next = setFace(layout, boardId, face, relationAt(refKey, face, gap, extra), when, universal);
  const { axis } = axisOf(face);
  const relation = { kind, ref: refKey };
  if (Number(gap)) relation.offset = Number(gap);
  if (Number(extra)) relation.delta = Number(extra);
  const cases = casesOf(next.boards[boardId].axes[axis]);
  const hit = universal ? cases[0] : cases.find((c) => sameWhen(c.when, when));
  if (hit) hit.relation = relation;
  next.boards[boardId].axes[axis] = packCases(cases);
  return next;
}

export function setCorner(layout, boardId, corner, coord, expr) {
  const next = clone(layout);
  const c = next.boards?.[boardId]?.outline?.corners?.[corner];
  if (!c) throw new Error(`${boardId} has no corner ${corner}`);
  c[coord] = String(expr).trim();
  return next;
}

export function setFeatureDepth(layout, boardId, featureId, expr) {
  const next = clone(layout);
  const f = next.boards?.[boardId]?.features?.[featureId];
  if (!f) throw new Error(`${boardId} has no feature ${featureId}`);
  f.depth = String(expr).trim();
  return next;
}

/** What differs between two layouts, one line per rule. */
export function diffLayouts(a, b) {
  const out = [];
  const ids = new Set([...Object.keys(a?.boards || {}), ...Object.keys(b?.boards || {})]);
  for (const id of ids) {
    const A = a?.boards?.[id] || {};
    const B = b?.boards?.[id] || {};
    for (const axis of ["x", "y", "z"]) {
      const ra = A.axes?.[axis];
      const rb = B.axes?.[axis];
      if (JSON.stringify(ra) !== JSON.stringify(rb)) out.push({ board: id, what: "axis", key: axis, from: ra || null, to: rb || null });
    }
    for (const corner of new Set([...Object.keys(A.outline?.corners || {}), ...Object.keys(B.outline?.corners || {})])) {
      const ca = A.outline?.corners?.[corner];
      const cb = B.outline?.corners?.[corner];
      if (JSON.stringify(ca) !== JSON.stringify(cb)) out.push({ board: id, what: "corner", key: corner, from: ca || null, to: cb || null });
    }
    for (const f of new Set([...Object.keys(A.features || {}), ...Object.keys(B.features || {})])) {
      const fa = A.features?.[f];
      const fb = B.features?.[f];
      if (JSON.stringify(fa) !== JSON.stringify(fb)) out.push({ board: id, what: "feature", key: f, from: fa || null, to: fb || null });
    }
  }
  return out;
}

/** Boards whose box moved between two generator results, with the faces that changed. */
export function movedBoards(before, after) {
  const A = new Map((before?.boards || []).map((b) => [b.id, b]));
  const out = [];
  for (const b of after?.boards || []) {
    const a = A.get(b.id);
    if (!a) { out.push({ id: b.id, faces: ["new"] }); continue; }
    const faces = ["x0", "x1", "y0", "y1", "z0", "z1"].filter((f) => Math.abs(a[f] - b[f]) > 1e-6);
    if (faces.length) out.push({ id: b.id, faces, delta: Object.fromEntries(faces.map((f) => [f, b[f] - a[f]])) });
  }
  for (const id of A.keys()) if (!(after?.boards || []).some((b) => b.id === id)) out.push({ id, faces: ["gone"] });
  return out;
}
