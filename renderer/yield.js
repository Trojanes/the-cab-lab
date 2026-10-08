// Neighbour yield. A cabinet whose size follows other params (a fridge cabinet
// when its side panel or the fridge changes) may grow into the cabinets beside
// it. It is not refused: the neighbours it now overlaps turn red and the panel
// asks whether each one should give way — the neighbour's face against the
// grown cabinet is pushed back by the overlap, as one Resize push through that
// module's own resizeFace (zones follow its rules), its far face staying put.
// A neighbour whose face is fixed, or that would drop under a minimum, stays
// red with the reason. One undo step for the grow, one for the yield.
import * as job from "./job.js";
import { getModule, DIM_OF_AXIS } from "./modules.js";
import { blockingIssues } from "./interact.js";
import { envelopeFootprint, poseFits, cabinetHits } from "./fit.js";
import { localAxes } from "./pose.js";
import { log } from "./log.js";

const SIDE_LABEL = { "x-": "left side", "x+": "right side", "y-": "front", "y+": "back", "z-": "bottom", "z+": "top" };
const round1 = (v) => Math.round(v * 10) / 10;

const cabinetOf = (id) => job.getJob().cabinets.find((c) => c.id === id) || null;


/** World overlap of two cabinets' boxes along each axis (0 when apart). */
function overlapDepth(a, b) {
  const fa = envelopeFootprint(a, a.pose);
  const fb = envelopeFootprint(b, b.pose);
  const d = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  return { x: d(fa.minX, fa.maxX, fb.minX, fb.maxX), y: d(fa.minY, fa.maxY, fb.minY, fb.maxY), z: d(fa.z0, fa.z1, fb.z0, fb.z1) };
}

/**
 * How `nb` gives way to `src`, which grew along world direction `grow` ([x, y, z], unit, axis-aligned):
 * the neighbour's local face whose outward normal is −grow moves in by the overlap.
 * `{ id, face, label, by, ok, reason, params, pose }` — params / pose only when ok.
 */
export function planYield(nb, src, grow) {
  const mod = getModule(nb.moduleId);
  const axisIdx = grow.findIndex((v) => Math.abs(v) > 0.5);
  const worldAxis = ["x", "y", "z"][axisIdx];
  const by = round1(Math.ceil(overlapDepth(nb, src)[worldAxis] * 10) / 10);
  const axes = localAxes(nb.pose); // +x, −x, +y, −y, +z, −z in world
  const k = axes.findIndex((v) => v[0] * -grow[0] + v[1] * -grow[1] + v[2] * -grow[2] > 0.99);
  const plan = { id: nb.id, moduleId: nb.moduleId, by, ok: false, reason: null, face: null, label: null };
  if (k < 0) return { ...plan, reason: "it is turned at an angle" };
  const face = { axis: ["x", "x", "y", "y", "z", "z"][k], dir: k % 2 === 0 ? 1 : -1 };
  const key = `${face.axis}${face.dir > 0 ? "+" : "-"}`;
  Object.assign(plan, { face, label: SIDE_LABEL[key] });
  if (!(mod.resizeFaces || []).includes(key)) return { ...plan, reason: `its ${SIDE_LABEL[key]} is fixed` };
  const dim = DIM_OF_AXIS[face.axis];
  const L0 = mod.envelope(nb.params)[dim];
  const L = round1(L0 - by);
  if (L < mod.minSize[dim]) return { ...plan, reason: `${dim} would be ${L}, under its minimum ${mod.minSize[dim]}` };
  const params = mod.resizeFace ? mod.resizeFace(nb.params, face, L) : mod.setEnvelope(nb.params, { [dim]: L });
  if (!params) return { ...plan, reason: "a zone would go under its minimum" };
  // The far face stays: moving a negative-side face moves the origin with it.
  const shift = face.dir < 0 ? L0 - L : 0;
  const ax = axes[face.axis === "x" ? 0 : face.axis === "y" ? 2 : 4];
  const pose = { ...nb.pose, x: round1(nb.pose.x + ax[0] * shift), y: round1(nb.pose.y + ax[1] * shift), z: round1((nb.pose.z || 0) + ax[2] * shift) };
  const probe = { ...nb, params, pose };
  if (!poseFits(probe, pose)) return { ...plan, reason: "it would leave the space" };
  const errs = blockingIssues(getModule(nb.moduleId).generate(params));
  if (errs.length > blockingIssues(job.resultFor(nb.id)).length) return { ...plan, reason: errs[0] };
  return { ...plan, ok: true, params, pose };
}

const stripPlan = ({ id, moduleId, face, label, by, ok, reason }) => ({ id, moduleId, face, label, by, ok, reason });

/**
 * After an edit of `src` (overlapping `before` = cabinet ids before it): the neighbours it now overlaps
 * become the conflict, with a plan for each; the prompt logs once. `grow` = world direction it grew.
 */
export function noteGrowth(src, before, grow, why) {
  const fresh = cabinetHits(src).filter((id) => !before.includes(id));
  if (!fresh.length) {
    pruneConflict();
    return null;
  }
  const neighbours = fresh.map((id) => stripPlan(planYield(cabinetOf(id), src, grow)));
  const c = { sourceId: src.id, grow, why, neighbours, declined: false };
  log("yield.prompt", { id: src.id, why, grow, neighbours });
  job.setConflict(c);
  return c;
}

/** Drop neighbours that no longer overlap the source (undo, a move); clears the conflict when none is left. */
export function pruneConflict() {
  const c = job.getConflict();
  if (!c) return;
  const src = cabinetOf(c.sourceId);
  const hits = src ? cabinetHits(src) : [];
  const left = c.neighbours.filter((n) => hits.includes(n.id) && cabinetOf(n.id));
  if (left.length === c.neighbours.length) return;
  job.setConflict(left.length ? { ...c, neighbours: left } : null);
}

// Undo, a move, a removal: re-check once the change has landed (never from inside a render).
job.onChange((kind) => { if (kind === "job") queueMicrotask(pruneConflict); });

/** "Yes": every neighbour that can give way does, in one undo step. The rest stay red with their reason. */
export function applyYield() {
  const c = job.getConflict();
  if (!c) return;
  const src = cabinetOf(c.sourceId);
  if (!src) { job.setConflict(null); return; }
  const before = job.snapshot();
  const done = [];
  const left = [];
  for (const n of c.neighbours) {
    const nb = cabinetOf(n.id);
    const plan = nb && planYield(nb, src, c.grow);
    if (!plan || !plan.ok) { left.push(stripPlan(plan || n)); continue; }
    const mod = getModule(nb.moduleId);
    const from = { envelope: mod.envelope(nb.params), pose: { ...nb.pose } };
    job.updateCabinet(nb.id, (cab) => { cab.params = plan.params; cab.pose = plan.pose; });
    done.push({ id: nb.id, face: plan.face, label: plan.label, by: plan.by, from, to: { envelope: mod.envelope(plan.params), pose: plan.pose } });
  }
  const changed = job.commitSnapshot(before);
  log("yield.apply", { id: c.sourceId, changed, done, left });
  job.setConflict(left.length ? { ...c, neighbours: left, declined: true } : null);
}

/** "No": the neighbours stay red; the checks keep an Auto-fix button. */
export function declineYield() {
  const c = job.getConflict();
  if (!c || c.declined) return;
  log("yield.decline", { id: c.sourceId, neighbours: c.neighbours.map((n) => n.id) });
  job.setConflict({ ...c, declined: true });
}

/** Check lines for the conflict (red; export stays blocked by the overlap check). */
export function conflictLines() {
  const c = job.getConflict();
  if (!c) return [];
  return c.neighbours.map((n) => `${c.sourceId} grew into ${n.id}${n.ok ? ` — its ${n.label} can give way ${n.by} mm` : ` — ${n.reason}`}.`);
}
