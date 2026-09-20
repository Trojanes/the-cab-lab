// Exploded / assembly view of one generator result (docs/bench-spec.md, "Explode").
// Pure data, no Three.js: reads boards, joints and face features, decides an
// assembly order and the direction each board is pulled out along. It never
// changes a board — the bench applies the offsets to the meshes' groups only.
//
//   relations(result)            which boards meet, and through what
//   assemblyOrder(boards, rels)  BFS from the board most others attach to; fronts last
//   pullPlan(boards, rels, order) per board: parent, slide axis, sign, level
//   assemblyOffsets(plan, order, unit, factor)   cumulative offsets along the plan
//   radialOffsets(boards, factor)                the old "away from the centre" view

const AXES = ["x", "y", "z"];
const natural = (a, b) => a.localeCompare(b, undefined, { numeric: true });
const lower = (axis) => String(axis || "Z").toLowerCase();

export function boardCenter(b) {
  return { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, z: (b.z0 + b.z1) / 2 };
}
function volume(b) {
  return Math.max(b.x1 - b.x0, 0.1) * Math.max(b.y1 - b.y0, 0.1) * Math.max(b.z1 - b.z0, 0.1);
}
function cabinetCenter(boards) {
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const b of boards) for (const a of AXES) { min[a] = Math.min(min[a], b[`${a}0`]); max[a] = Math.max(max[a], b[`${a}1`]); }
  return { x: (min.x + max.x) / 2, y: (min.y + max.y) / 2, z: (min.z + max.z) / 2 };
}

/** AABB separation between two boards: > 0 gap, ≈ 0 touching, < 0 overlap (penetration). */
export function separation(a, b) {
  const sx = Math.max(a.x0 - b.x1, b.x0 - a.x1);
  const sy = Math.max(a.y0 - b.y1, b.y0 - a.y1);
  const sz = Math.max(a.z0 - b.z1, b.z0 - a.z1);
  return Math.max(sx, sy, sz);
}
/** The axis two touching / overlapping boards meet along: the one with the least penetration. */
function contactAxis(a, b) {
  const s = { x: Math.max(a.x0 - b.x1, b.x0 - a.x1), y: Math.max(a.y0 - b.y1, b.y0 - a.y1), z: Math.max(a.z0 - b.z1, b.z0 - a.z1) };
  return AXES.reduce((m, ax) => (s[ax] > s[m] ? ax : m), "x");
}
export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * Which boards meet and through what: declared joints, face features made
 * `for` another board (a groove, a tongue tag, a screw pilot) and, failing
 * those, plain AABB contact. `big` lists the boards whose A / B face takes
 * part — that face's normal is the axis the other board slides along.
 * @returns Map<pairKey, { a, b, via: Set<string>, big: Set<boardId> }>
 */
export function relations(result) {
  const boards = result.boards || [];
  const ids = new Set(boards.map((b) => b.id));
  const rels = new Map();
  const add = (a, b, via, bigOn) => {
    if (a === b || !ids.has(a) || !ids.has(b)) return;
    const k = pairKey(a, b);
    let r = rels.get(k);
    if (!r) {
      const [p, q] = k.split("|");
      r = { a: p, b: q, via: new Set(), big: new Set() };
      rels.set(k, r);
    }
    r.via.add(via);
    if (bigOn) r.big.add(bigOn);
  };
  const isBig = (f) => f === "A" || f === "B";
  for (const j of result.joints || []) {
    if (!j.a || !j.b) continue;
    add(j.a.board, j.b.board, j.kind || "joint", (j.a.faces || []).some(isBig) ? j.a.board : null);
    if ((j.b.faces || []).some(isBig)) add(j.a.board, j.b.board, j.kind || "joint", j.b.board);
  }
  for (const b of boards) {
    for (const f of b.faces || []) {
      for (const ft of f.features || []) {
        if (ft.for && ids.has(ft.for)) add(b.id, ft.for, ft.kind, isBig(f.id) ? b.id : null);
      }
    }
  }
  for (let i = 0; i < boards.length; i += 1) {
    for (let k = i + 1; k < boards.length; k += 1) {
      const a = boards[i];
      const b = boards[k];
      if (rels.has(pairKey(a.id, b.id))) continue;
      if (separation(a, b) <= 0.5) add(a.id, b.id, "contact", null);
    }
  }
  return rels;
}

/** A relation backed by a joint or a face feature, not just two boxes touching. */
export function isStrong(r) {
  for (const v of r.via) if (v !== "contact") return true;
  return false;
}
function neighbours(boards, rels) {
  const nb = new Map(boards.map((b) => [b.id, []]));
  for (const r of rels.values()) {
    nb.get(r.a)?.push(r.b);
    nb.get(r.b)?.push(r.a);
  }
  for (const list of nb.values()) list.sort(natural);
  return nb;
}

/**
 * Assembly order: breadth-first from the carcass board most others attach to
 * (a plate over a rail on ties). Declared joints and features are followed
 * first; boards that only touch something come after through that contact;
 * islands after that; and the fronts last — doors go on when the box stands.
 */
export function assemblyOrder(boards, rels) {
  if (!boards.length) return [];
  const nb = neighbours(boards, rels);
  const byId = new Map(boards.map((b) => [b.id, b]));
  const isFront = (b) => b.category === "front_panel";
  const strongDegree = (id) => nb.get(id).filter((n) => isStrong(rels.get(pairKey(id, n)))).length;
  const pool = boards.filter((b) => !isFront(b));
  const root = (pool.length ? pool : boards).slice().sort((p, q) => (strongDegree(q.id) - strongDegree(p.id)) || (nb.get(q.id).length - nb.get(p.id).length) || (volume(q) - volume(p)) || natural(p.id, q.id))[0];
  const order = [];
  const seen = new Set([root.id]);
  const queue = [root.id];
  const deferred = [];
  while (queue.length || deferred.length) {
    if (!queue.length) {
      const n = deferred.shift();
      if (seen.has(n)) continue;
      seen.add(n);
      queue.push(n);
    }
    const id = queue.shift();
    order.push(id);
    for (const n of nb.get(id)) {
      if (seen.has(n)) continue;
      if (!isStrong(rels.get(pairKey(id, n)))) { deferred.push(n); continue; }
      seen.add(n);
      queue.push(n);
    }
  }
  for (const b of boards.slice().sort((p, q) => natural(p.id, q.id))) {
    if (!seen.has(b.id)) { seen.add(b.id); order.push(b.id); }
  }
  return [...order.filter((id) => !isFront(byId.get(id))), ...order.filter((id) => isFront(byId.get(id)))];
}

/**
 * How each board leaves the assembly: `parent` = the earliest-placed board it
 * is joined to (a board it merely touches only when nothing is declared);
 * `axis` = the normal of the big face taking part in that relation
 * (the parent's, else its own), else the axis they touch along; `sign` = which
 * way it sits from the parent. The root is `fixed`.
 * @returns Map<boardId, { parent, axis, sign, level, fixed, via }>
 */
export function pullPlan(boards, rels, order) {
  const byId = new Map(boards.map((b) => [b.id, b]));
  const nb = neighbours(boards, rels);
  const idx = new Map(order.map((id, i) => [id, i]));
  const cab = cabinetCenter(boards);
  const sgn = (v) => (Math.abs(v) < 0.5 ? 0 : v > 0 ? 1 : -1);
  const plan = new Map();
  order.forEach((id, i) => {
    const b = byId.get(id);
    const c = boardCenter(b);
    if (i === 0) { plan.set(id, { parent: null, axis: null, sign: 0, level: 0, fixed: true, via: [] }); return; }
    const strength = (n) => (isStrong(rels.get(pairKey(id, n))) ? 0 : 1);
    const parents = nb.get(id).filter((n) => idx.get(n) < i).sort((p, q) => (strength(p) - strength(q)) || (idx.get(p) - idx.get(q)));
    const parent = parents[0] ?? null;
    if (!parent) {
      const axis = lower(b.thicknessAxis);
      plan.set(id, { parent: null, axis, sign: sgn(c[axis] - cab[axis]) || 1, level: 1, fixed: false, via: [] });
      return;
    }
    const N = byId.get(parent);
    const r = rels.get(pairKey(id, parent));
    let axis;
    if (r.big.has(parent)) axis = lower(N.thicknessAxis);
    else if (r.big.has(id)) axis = lower(b.thicknessAxis);
    else axis = contactAxis(b, N);
    const nc = boardCenter(N);
    const sign = sgn(c[axis] - nc[axis]) || sgn(c[axis] - cab[axis]) || 1;
    plan.set(id, { parent, axis, sign, level: plan.get(parent).level + 1, fixed: false, via: [...r.via] });
  });
  return plan;
}

/** Cumulative offsets: a board moves with its parent, then one `unit × factor` along its own axis. */
export function assemblyOffsets(plan, order, unit, factor) {
  const off = new Map();
  for (const id of order) {
    const p = plan.get(id);
    const base = p.parent && off.has(p.parent) ? off.get(p.parent) : [0, 0, 0];
    const o = base.slice();
    if (!p.fixed && p.axis) o[AXES.indexOf(p.axis)] += p.sign * unit * factor;
    off.set(id, o);
  }
  return off;
}

/** The plain view: every board away from the cabinet centre along its own offset from it. */
export function radialOffsets(boards, factor) {
  const cab = cabinetCenter(boards);
  const off = new Map();
  for (const b of boards) {
    const c = boardCenter(b);
    off.set(b.id, [(c.x - cab.x) * factor * 0.8, (c.y - cab.y) * factor * 0.8, (c.z - cab.z) * factor * 0.8]);
  }
  return off;
}

/** Everything the bench needs for one result. */
export function planExplode(result) {
  const boards = result.boards || [];
  const rels = relations(result);
  const order = assemblyOrder(boards, rels);
  const plan = pullPlan(boards, rels, order);
  return { rels, order, plan };
}

/** One slide distance per level: enough to clear the cabinet's section. */
export function explodeUnit(size) {
  return Math.max(60, 0.6 * Math.max(size.y || 0, size.z || 0));
}

/** "+Z" style label for a plan entry. */
export function dirLabel(p) {
  if (!p || p.fixed || !p.axis) return "stays";
  return `${p.sign > 0 ? "+" : "-"}${p.axis.toUpperCase()}`;
}
