// job.json in memory. Everything visible traces back to this object.
// Undo/redo = whole-job snapshots. Generation results are cached per cabinet
// and rebuilt whenever params change.
import { getModule, isBaseCabinet } from "./modules.js";
import { baseAvoidances, localOverlaps, loungePlanArches } from "./wheelArch.js";
import { resolveSpace } from "./spaces.js";
import { log } from "./log.js";
import { applyCatalogue, colorSlotOf, defaultMaterials, doorColors, normalizeFinish, normalizeStock, withColorSlot } from "./materials.js";
import { normalizeWall, normalizeOpening, normalizeControlPanel, wallSolid, placeSplit, bindCabinets, wallControlPanelsFor } from "./walls.js";
import { applyUserGrooves } from "./gen/userGrooves.js";
import { keepCorner } from "./pose.js";
import { waterfallPlan, partitionPlan } from "./waterfall.js";

const SNAP = 10;
export const snap = (v, s = SNAP) => Math.round(v / s) * s;
bindCabinets(() => job.cabinets);

// A new job has no space yet: defining the space is step one.
function newJob() {
  const materials = defaultMaterials();
  return {
    version: "job.v2",
    units: "mm",
    origin: "front-left floor corner; X right, Y back, Z up",
    space: null, // { kind, params } once defined
    finish: materials.finish, // carcass White Stipple; door { series, mode, colors }
    stock: materials.stock, // carcass / partition / door thicknesses
    cabinets: [],
    planes: [], // construction planes: { id, axis, value, dir, offset, from }
    walls: [], // partition walls: { id, axis, at, u0, u1, side } — see walls.js
  };
}

/** Accept job.v1 files (space as bare W/D/H). */
function migrate(obj) {
  if (obj.version === "job.v1") {
    const s = obj.space || {};
    obj = {
      ...obj,
      version: "job.v2",
      origin: "front-left floor corner; X right, Y back, Z up",
      space: s.width ? { kind: "box", params: { width: s.width, depth: s.depth, height: s.height } } : null,
      planes: Array.isArray(obj.planes) ? obj.planes : [],
    };
  }
  if (!Array.isArray(obj.planes)) obj.planes = [];
  obj.walls = (Array.isArray(obj.walls) ? obj.walls : []).map(normalizeWall).filter(Boolean);
  obj.finish = normalizeFinish(obj.finish);
  obj.stock = normalizeStock(obj.stock);
  // Module-level params repair (e.g. tall zones re-fitted to cabinetHeight).
  obj.cabinets = (Array.isArray(obj.cabinets) ? obj.cabinets : []).map((cab) => {
    // A module that was split (tall → storage / fridge) says which one a saved cabinet now is.
    const moduleId = getModule(cab.moduleId)?.moduleIdFor?.(cab.params || {}) ?? cab.moduleId;
    if (moduleId !== cab.moduleId) {
      log("cabinet.migrate", { id: cab.id, from: cab.moduleId, to: moduleId });
      cab = { ...cab, moduleId };
    }
    const normalize = getModule(cab.moduleId)?.normalizeParams;
    const next = normalize ? { ...cab, params: normalize(cab.params || {}) } : { ...cab };
    const hidden = normalizeHidden(next.hidden);
    if (hidden) next.hidden = hidden;
    else delete next.hidden;
    return next;
  });
  return obj;
}

let job = newJob();
let selectedId = null;
// Cabinets in the current set, primary last. Empty when the selection is a wall, a plane, or nothing.
// A plain click replaces this with one cabinet. Ctrl+click toggles one in or out (`select` extend).
let selectedIds = [];
// Board / face under the selected cabinet (module → board → face). Display only: the
// cabinet stays the selected object; this narrows the highlight and the panel's read-out.
// Only the primary cabinet has one, and only while it is the sole selection.
let subSel = null; // null | { boardId, faceId: null | "A" | "B" | "E<i>" }
let dirty = false;
let filePath = null;
const undoStack = [];
const redoStack = [];
const listeners = new Set();
const results = new Map(); // cabinetId -> generator result

export function onChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit(kind) {
  for (const fn of listeners) fn(kind);
}

export function getJob() { return job; }
export function hasSpace() { return !!job.space; }

let resolvedCache = null;
let resolvedFor = null;
/** Resolved space geometry (floor polygon, height, obstacles); null until defined. */
export function getSpace() {
  if (resolvedFor !== job.space) {
    resolvedFor = job.space;
    resolvedCache = resolveSpace(job.space);
  }
  return resolvedCache;
}
export function getSelectedId() { return selectedId; }
export function getSelected() { return job.cabinets.find((c) => c.id === selectedId) || null; }

function isCabinetId(id) {
  return !!id && job.cabinets.some((c) => c.id === id);
}

/** Cabinets in the selection, primary last. One id after a plain click. */
export function getSelectedIds() {
  const live = new Set(job.cabinets.map((c) => c.id));
  const ids = selectedIds.filter((id) => live.has(id));
  if (selectedId && live.has(selectedId) && ids[ids.length - 1] !== selectedId) {
    return [...ids.filter((id) => id !== selectedId), selectedId];
  }
  return ids;
}
/**
 * The board / face selected inside the selected cabinet, validated against the current
 * generator result (role ids are stable, so a re-sized cabinet keeps its selection; a board
 * that no longer exists drops it). `{ cabId, boardId, faceId, board, face }` or null.
 */
export function getSubSelection() {
  if (!subSel || !selectedId) return null;
  const cab = getSelected();
  if (!cab) return null;
  const board = (resultFor(cab.id)?.boards || []).find((b) => b.id === subSel.boardId);
  if (!board) return null;
  const face = subSel.faceId ? (board.faces || []).find((f) => f.id === subSel.faceId) || null : null;
  if (subSel.faceId && !face) return { cabId: cab.id, boardId: board.id, faceId: null, board, face: null };
  return { cabId: cab.id, boardId: board.id, faceId: face ? face.id : null, board, face };
}
export function getFinish() { return job.finish; }
export function getStock() { return job.stock; }
export function getMaterials() { return { finish: job.finish, stock: job.stock }; }
export function getPlanes() { return job.planes || []; }
export function getPlane(id) { return (job.planes || []).find((p) => p.id === id) || null; }
export function getSelectedPlane() { return getPlane(selectedId); }
export function getWalls() { return job.walls || []; }
export function getWall(id) { return (job.walls || []).find((w) => w.id === id) || null; }
export function getSelectedWall() { return getWall(selectedId); }
export function isDirty() { return dirty; }
export function getFilePath() { return filePath; }
export function canUndo() { return undoStack.length > 0; }
export function canRedo() { return redoStack.length > 0; }

// A cabinet that grew into its neighbours (neighbour yield, renderer/yield.js): not saved with the job.
// `{ sourceId, grow, neighbours: [{ id, face, by, ok, reason }], declined }` or null.
let conflict = null;
export function getConflict() { return conflict; }
export function conflictIds() { return new Set(conflict ? conflict.neighbours.map((n) => n.id) : []); }
export function setConflict(next) {
  if (JSON.stringify(next) === JSON.stringify(conflict)) return;
  conflict = next;
  emit("conflict");
}

export function resultFor(id) {
  if (!results.has(id)) {
    const cab = job.cabinets.find((c) => c.id === id);
    if (!cab) return null;
    const result = applyUserGrooves(getModule(cab.moduleId).generate(cab.params), cab.overrides);
    results.set(id, result);
    if (result?.validation?.errors?.length) log("generator.errors", { id, moduleId: cab.moduleId, errors: result.validation.errors, params: cab.params });
  }
  return results.get(id);
}

function invalidate(id) {
  if (id) results.delete(id);
  else results.clear();
}

/** Drop cached results for these modules so the next draw uses a generator that was just rebuilt. */
export function invalidateModules(moduleIds) {
  const ids = new Set(moduleIds || []);
  let n = 0;
  for (const cab of job.cabinets) {
    if (ids.has(cab.moduleId)) { results.delete(cab.id); n += 1; }
  }
  if (n) emit("job");
  return n;
}

// --- history ---------------------------------------------------------------

/** Call before a committed mutation. Drag previews call commit() once at drag end instead. */
export function pushHistory() {
  undoStack.push(JSON.stringify(job));
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
}

/** Snapshot for a drag: take before previews, commit once at the end if anything changed. */
export function snapshot() {
  return JSON.stringify(job);
}
export function commitSnapshot(before) {
  if (before === JSON.stringify(job)) return false;
  undoStack.push(before);
  if (undoStack.length > 200) undoStack.shift();
  redoStack.length = 0;
  emit("history");
  return true;
}

export function undo() {
  if (!undoStack.length) return;
  log("undo", { depth: undoStack.length });
  redoStack.push(JSON.stringify(job));
  job = JSON.parse(undoStack.pop());
  invalidate();
  pruneSelection();
  dirty = true;
  emit("job");
}

/** Drop ids the job no longer has. A removed primary leaves the previous cabinet selected. */
function pruneSelection() {
  const live = new Set(job.cabinets.map((c) => c.id));
  selectedIds = selectedIds.filter((id) => live.has(id));
  if (selectedId && live.has(selectedId)) {
    if (selectedIds[selectedIds.length - 1] !== selectedId) {
      selectedIds = [...selectedIds.filter((id) => id !== selectedId), selectedId];
    }
    return;
  }
  const object = selectedId && (
    (job.planes || []).some((p) => p.id === selectedId)
    || (job.walls || []).some((w) => w.id === selectedId)
  );
  if (object) { selectedIds = []; return; }
  subSel = null;
  selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
}

export function redo() {
  if (!redoStack.length) return;
  log("redo", { depth: redoStack.length });
  undoStack.push(JSON.stringify(job));
  job = JSON.parse(redoStack.pop());
  invalidate();
  pruneSelection();
  dirty = true;
  emit("job");
}

// --- mutations -------------------------------------------------------------

/**
 * Modules bound to the space (the bedroom follows the roof) re-read it here:
 * `withSpace(params, resolved, pose)` returns new params or the same object.
 */
function bindToSpace(cab) {
  const mod = getModule(cab.moduleId);
  if (!mod.withSpace) return false;
  const next = mod.withSpace(cab.params, getSpace(), cab.pose);
  if (next === cab.params) return false;
  cab.params = next;
  invalidate(cab.id);
  return true;
}
/**
 * Modules attached to another cabinet (the bed box follows the bedroom body)
 * re-read it here: `attach(params, pose, { cabinets, resolved })` returns
 * { params, pose } (same objects when nothing changed) or null.
 */
function bindToJob(cab) {
  const mod = getModule(cab.moduleId);
  if (!mod.attach) return false;
  const next = mod.attach(cab.params, cab.pose, { cabinets: job.cabinets, resolved: getSpace() });
  if (!next) return false;
  let changed = false;
  if (next.params !== cab.params) { cab.params = next.params; invalidate(cab.id); changed = true; }
  if (next.pose !== cab.pose) { cab.pose = next.pose; changed = true; }
  return changed;
}
function bindAllToSpace() {
  for (const cab of job.cabinets) bindToSpace(cab);
  for (const cab of job.cabinets) bindToJob(cab);
}

const PLAN_ARCH = /^wa-\d+-[LR]$/;

/**
 * Step 1 of docking a floor-plan wheel arch to a module: the cabinet's own
 * body touches a box, so this module produces its avoidance. Off (the
 * checkbox) refuses that. A hand-entered arch stays when nothing touches.
 * Which boards then yield is the module's own cut — kitchen the back,
 * lounge only the boards sitting in the overlap.
 */
function syncWheelArch(cab) {
  if (!isBaseCabinet(cab.moduleId)) return false;
  const boxes = getSpace()?.wheelArches || [];
  const prev = cab.params.wheelAvoidances || [];
  const env = getModule(cab.moduleId).envelope(cab.params);
  const door = Number(cab.params.frontThickness);
  const frontThickness = Number.isFinite(door) && door > 0 ? door : (cab.params.frontPanelThickness ?? 16);
  const refused = cab.params.wheelArchAvoidance === false;
  const hits = refused ? [] : localOverlaps(cab.pose, boxes, [
    { x0: 0, x1: env.W, y0: -frontThickness, y1: env.D, z0: 0, z1: env.H },
  ]);
  const fromPlan = hits.length
    ? baseAvoidances({ pose: cab.pose, W: env.W, D: env.D, H: env.H, frontThickness }, boxes)
    : [];
  const hand = prev.filter((a) => !PLAN_ARCH.test(a.id));
  const next = refused || !hits.length ? (refused ? [] : hand) : (fromPlan.length ? fromPlan : hand);
  const flag = refused ? false : (hits.length ? true : cab.params.wheelArchAvoidance);
  const sameList = JSON.stringify(prev) === JSON.stringify(next);
  const norm = (v) => (v === true ? true : v === false ? false : undefined);
  const sameFlag = norm(flag) === norm(cab.params.wheelArchAvoidance);
  if (sameList && sameFlag) return false;
  const params = { ...cab.params, wheelAvoidances: next };
  if (flag === true) params.wheelArchAvoidance = true;
  else if (flag === false) params.wheelArchAvoidance = false;
  else delete params.wheelArchAvoidance;
  cab.params = params;
  invalidate(cab.id);
  return true;
}
/**
 * A general tall takes one cut across its full width, at the back bottom (generator `avoidance`:
 * depth from the back, height from the floor; the side panels follow it). Touching a floor-plan
 * arch turns it on and sets depth / height from the arch (the deepest and highest one it meets);
 * the checkbox off (wheelArchAvoidance false) refuses it. Away from every arch a hand-entered cut stays,
 * a cut that came from the plan is switched off.
 */
function syncTallArch(cab) {
  if (cab.moduleId !== "generalTallCabinet") return false;
  const boxes = getSpace()?.wheelArches || [];
  const p = cab.params;
  const prev = p.avoidance || {};
  const env = getModule(cab.moduleId).envelope(p);
  const door = Number(p.frontPanelThickness) > 0 ? Number(p.frontPanelThickness) : 16;
  const refused = p.wheelArchAvoidance === false;
  const hits = refused || !boxes.length ? [] : localOverlaps(cab.pose, boxes, [
    { x0: 0, x1: env.W, y0: -door, y1: env.D, z0: 0, z1: env.H },
  ]);
  // envelope D stops at the carcass front, so no door thickness to take off here.
  const fromPlan = hits.length ? baseAvoidances({ pose: cab.pose, W: env.W, D: env.D, H: env.H, frontThickness: 0 }, boxes) : [];
  let next = prev;
  let flag = p.wheelArchAvoidance;
  if (refused) {
    next = { ...prev, enabled: false };
  } else if (fromPlan.length) {
    next = {
      enabled: true,
      depth: Math.max(...fromPlan.map((a) => a.depth)),
      height: Math.max(...fromPlan.map((a) => a.height)),
      fromPlan: fromPlan.map((a) => a.id),
    };
    flag = true;
  } else if (prev.fromPlan) {
    next = { enabled: false, depth: prev.depth, height: prev.height };
  }
  const norm = (v) => (v === true ? true : v === false ? false : undefined);
  if (JSON.stringify(prev) === JSON.stringify(next) && norm(flag) === norm(p.wheelArchAvoidance)) return false;
  const params = { ...p, avoidance: next };
  if (flag === true) params.wheelArchAvoidance = true;
  else if (flag === false) params.wheelArchAvoidance = false;
  else delete params.wheelArchAvoidance;
  cab.params = params;
  invalidate(cab.id);
  return true;
}
/** A lounge produces avoidance only for the part of its footprint a box touches. */
function syncLoungeArch(cab) {
  if (cab.moduleId !== "loungeGenerator") return false;
  const world = getSpace()?.wheelArches || [];
  const mod = getModule(cab.moduleId);
  const env = mod.envelope(cab.params);
  const feet = typeof mod.footprintBoxes === "function" ? mod.footprintBoxes(cab.params) : null;
  // The panel's checkbox off (wheelArchAvoidance false) refuses the cut. The hand-entered arch
  // (handWheelArch: depth in from the wall, height from the floor) runs the full width of the lounge
  // and is cut the same way as a plan one.
  const on = cab.params.wheelArchAvoidance !== false;
  const fromPlan = on && world.length ? loungePlanArches(cab.pose, env, world, feet) : [];
  const h = cab.params.handWheelArch;
  const fromHand = on && h && h.enabled === true && h.depth > 0 && h.height > 0
    ? [{ id: "hand", x0: 0, x1: env.W, y0: Math.max(0, env.D - h.depth), y1: env.D, z0: 0, z1: Math.min(h.height, env.H) }]
    : [];
  const next = [...fromPlan, ...fromHand];
  const prev = cab.params.planWheelArches || [];
  if (JSON.stringify(prev) === JSON.stringify(next)) return false;
  const params = { ...cab.params };
  if (next.length) params.planWheelArches = next;
  else delete params.planWheelArches;
  cab.params = params;
  invalidate(cab.id);
  return true;
}
function syncWheelArches() {
  const changed = [];
  for (const cab of job.cabinets) {
    if (syncWheelArch(cab)) changed.push(cab.id);
    if (syncLoungeArch(cab)) changed.push(cab.id);
    if (syncTallArch(cab) && !changed.includes(cab.id)) changed.push(cab.id);
  }
  for (const id of syncControlPanels()) if (!changed.includes(id)) changed.push(id);
  return changed;
}
function bindAttached() {
  for (const cab of job.cabinets) bindToJob(cab);
}

/** Define or redefine the space. Cabinets are never moved; checks report any that no longer fit. */
export function defineSpace(kind, params, { history = true, finish, stock } = {}) {
  if (history) pushHistory();
  const keptArches = params.wheelArches ?? job.space?.params?.wheelArches;
  const keptCavities = params.cavities ?? job.space?.params?.cavities;
  job.space = {
    kind,
    params: { ...params, ...(keptArches ? { wheelArches: keptArches } : {}), ...(keptCavities ? { cavities: keptCavities } : {}) },
  };
  if (finish) job.finish = normalizeFinish(finish);
  if (stock) job.stock = normalizeStock(stock);
  bindAllToSpace();
  syncWheelArches();
  log("space.define", {
    spaceKind: kind,
    params: job.space.params,
    finish: job.finish,
    stock: job.stock,
    cabinets: job.cabinets.length,
  });
  dirty = true;
  emit("job");
}

function nextWheelArchId() {
  const taken = new Set((job.space?.params?.wheelArches || []).map((a) => a.id));
  let n = 1;
  while (taken.has(`wa-${n}`)) n += 1;
  return `wa-${n}`;
}

/** One symmetric pair. `arch` is { yRear, length, width, height } in world mm. */
export function addWheelArch(arch, { how = "ok" } = {}) {
  if (!job.space) return null;
  pushHistory();
  const id = nextWheelArchId();
  const rec = { id, yRear: arch.yRear, length: arch.length, width: arch.width, height: arch.height };
  const list = [...(job.space.params.wheelArches || []), rec];
  job.space = { kind: job.space.kind, params: { ...job.space.params, wheelArches: list } };
  const changed = syncWheelArches();
  log("wheelarch.add", { ...rec, how, changed });
  dirty = true;
  emit("job");
  return rec;
}

export function removeWheelArch(id) {
  if (!job.space) return false;
  const list = job.space.params.wheelArches || [];
  if (!list.some((a) => a.id === id)) return false;
  pushHistory();
  job.space = { kind: job.space.kind, params: { ...job.space.params, wheelArches: list.filter((a) => a.id !== id) } };
  const changed = syncWheelArches();
  log("wheelarch.remove", { id, changed });
  dirty = true;
  emit("job");
  return true;
}

function nextCavityId() {
  const taken = new Set((job.space?.params?.cavities || []).map((c) => c.id));
  let n = 1;
  while (taken.has(`cv-${n}`)) n += 1;
  return `cv-${n}`;
}

/**
 * A cavity kept for an appliance or services (yellow in the floor plan). `cav` is
 * { x0, x1, y0, y1, height } in world mm, standing on the floor. Cabinets do not react to it yet.
 */
export function addCavity(cav, { how = "ok" } = {}) {
  if (!job.space) return null;
  pushHistory();
  const id = nextCavityId();
  const rec = { id, x0: cav.x0, x1: cav.x1, y0: cav.y0, y1: cav.y1, height: cav.height };
  const list = [...(job.space.params.cavities || []), rec];
  job.space = { kind: job.space.kind, params: { ...job.space.params, cavities: list } };
  log("cavity.add", { ...rec, how });
  dirty = true;
  emit("job");
  return rec;
}

export function removeCavity(id) {
  if (!job.space) return false;
  const list = job.space.params.cavities || [];
  if (!list.some((c) => c.id === id)) return false;
  pushHistory();
  job.space = { kind: job.space.kind, params: { ...job.space.params, cavities: list.filter((c) => c.id !== id) } };
  log("cavity.remove", { id });
  dirty = true;
  emit("job");
  return true;
}

/** Replace the job catalogue. Placed cabinets take the new colour for their group. Thicknesses stay as copied. */
export function setMaterials(finish, stock, { history = true } = {}) {
  const nextFinish = normalizeFinish(finish);
  const nextStock = normalizeStock(stock);
  if (JSON.stringify(nextFinish) === JSON.stringify(job.finish) && JSON.stringify(nextStock) === JSON.stringify(job.stock)) return false;
  if (history) pushHistory();
  job.finish = nextFinish;
  job.stock = nextStock;
  const cabinets = [];
  for (const cab of job.cabinets) {
    const next = applyCatalogue(cab.params, job.finish);
    if (next === cab.params) continue;
    cab.params = next;
    invalidate(cab.id);
    cabinets.push(cab.id);
  }
  for (const id of syncControlPanels()) if (!cabinets.includes(id)) cabinets.push(id);
  log("materials.set", { finish: job.finish, stock: job.stock, cabinets });
  dirty = true;
  emit("job");
  return true;
}

let nextIdCounter = 1;
function makeId() {
  let id;
  do {
    id = `cab-${nextIdCounter++}`;
  } while (job.cabinets.some((c) => c.id === id));
  return id;
}

export function addCabinet(moduleId, pose, size, extra) {
  const opts = extra && Object.prototype.hasOwnProperty.call(extra, "history")
    ? extra
    : { history: true, params: extra || null };
  if (opts.history !== false) pushHistory();
  const mod = getModule(moduleId);
  const s = { ...mod.defaultSize, ...size };
  const cab = {
    id: makeId(),
    moduleId,
    pose: { x: 0, y: 0, z: 0, rotZ: 0, ...pose },
    params: { ...mod.defaults(s.W, s.D, s.H, { finish: job.finish, stock: job.stock }), ...(opts.params || {}) },
  };
  // The corner of the local box the user clicked first when drawing it ({x,y,z} each ±1); a size change grows from it.
  if (opts.corner) cab.placeCorner = { ...opts.corner };
  // A width the module decides (the fridge's) keeps the drawn box's anchored side face.
  const drawn = anchoredPose(cab, mod, { ...cab.params, cabinetWidth: s.W }, cab.params);
  if (drawn) cab.pose = drawn;
  bindToSpace(cab);
  syncWheelArch(cab);
  syncLoungeArch(cab);
  syncTallArch(cab);
  job.cabinets.push(cab);
  bindAttached();
  selectedId = cab.id;
  selectedIds = [cab.id];
  subSel = null;
  log("cabinet.add", { id: cab.id, moduleId, pose: cab.pose, size: s, params: cab.params, placeCorner: cab.placeCorner ?? null });
  dirty = true;
  emit("job");
  return cab;
}

let nextPlaneCounter = 1;
function makePlaneId() {
  let id;
  do {
    id = `plane-${nextPlaneCounter++}`;
  } while ((job.planes || []).some((p) => p.id === id));
  return id;
}

/** A construction plane: axis-aligned, world-fixed, offset from a picked face. */
export function addPlane({ axis, value, dir, offset, from }) {
  pushHistory();
  if (!Array.isArray(job.planes)) job.planes = [];
  const plane = { id: makePlaneId(), axis, value, dir, offset, from: from || null };
  job.planes.push(plane);
  selectedId = plane.id;
  selectedIds = [];
  subSel = null;
  log("plane.add", plane);
  dirty = true;
  emit("job");
  return plane;
}

export function removePlane(id) {
  const i = (job.planes || []).findIndex((p) => p.id === id);
  if (i < 0) return;
  pushHistory();
  log("plane.remove", { id });
  job.planes.splice(i, 1);
  if (selectedId === id) { selectedId = null; selectedIds = []; subSel = null; }
  dirty = true;
  emit("job");
}

let nextWallCounter = 1;
function makeWallId() {
  let id;
  do {
    id = `wall-${nextWallCounter++}`;
  } while ((job.walls || []).some((w) => w.id === id));
  return id;
}

/** A partition wall (see walls.js). `wall` = { axis, at, u0, u1, side }; `meta` is logged only. */
export function addWall(wall, meta = {}) {
  const w = normalizeWall({ ...wall, id: "pending" });
  if (!w) return null;
  pushHistory();
  if (!Array.isArray(job.walls)) job.walls = [];
  w.id = makeWallId();
  job.walls.push(w);
  selectedId = w.id;
  selectedIds = [];
  subSel = null;
  syncControlPanels();
  log("wall.add", { ...w, ...meta });
  dirty = true;
  emit("job");
  return w;
}

let nextOpeningCounter = 1;
function makeOpeningId() {
  let id;
  const taken = new Set((job.walls || []).flatMap((w) => (w.openings || []).map((o) => o.id)));
  do {
    id = `op-${nextOpeningCounter++}`;
  } while (taken.has(id));
  return id;
}

/**
 * An opening in a wall: { type, from, offset, width, bottom, top } (+ side /
 * overlap / doorHeight for a slidingDoor — see walls.js). `meta` is logged only.
 */
export function addOpening(wallId, opening, meta = {}) {
  const wall = getWall(wallId);
  const op = normalizeOpening({ ...opening, id: "pending" });
  if (!wall || !op) return null;
  pushHistory();
  op.id = makeOpeningId();
  if (!Array.isArray(wall.openings)) wall.openings = [];
  wall.openings.push(op);
  selectedId = wall.id;
  selectedIds = [];
  subSel = null;
  log("opening.add", { wallId, ...op, ...meta });
  dirty = true;
  emit("job");
  return op;
}

export function setOpening(wallId, opId, patch) {
  const wall = getWall(wallId);
  const i = wall ? (wall.openings || []).findIndex((o) => o.id === opId) : -1;
  if (i < 0) return;
  const next = normalizeOpening({ ...wall.openings[i], ...patch });
  if (!next) return;
  pushHistory();
  wall.openings[i] = next;
  log("opening.set", { wallId, id: opId, patch, opening: next });
  dirty = true;
  emit("job");
}

export function removeOpening(wallId, opId) {
  const wall = getWall(wallId);
  const i = wall ? (wall.openings || []).findIndex((o) => o.id === opId) : -1;
  if (i < 0) return;
  pushHistory();
  log("opening.remove", { wallId, id: opId, opening: wall.openings[i] });
  wall.openings.splice(i, 1);
  dirty = true;
  emit("job");
}

/**
 * Where a partition is cut into two boards. `split` = { axis: "u"|"z", at }.
 * Drag previews pass history: false and commit the snapshot once at the end.
 * The cut is pulled out of a shower-door hole so that hole stays on one board.
 */
export function setWallSplit(id, split, { history = true } = {}) {
  const wall = getWall(id);
  if (!wall || !split) return;
  const solid = wallSolid(wall, getSpace(), getStock());
  const next = placeSplit(solid, split);
  if (wall.split && wall.split.axis === next.axis && Math.abs(wall.split.at - next.at) < 0.05) return;
  if (history) pushHistory();
  wall.split = next;
  dirty = true;
  emit("job");
}

/** Remember which overhead and base (or lounge) a partition follows. `fit` null clears it. */
export function setWallFit(id, fit, how = "ok") {
  const wall = getWall(id);
  if (!wall) return;
  const radius = Number(fit && fit.radius);
  const next = fit && fit.overheadId && (fit.kitchenId || fit.loungeId)
    ? {
      overheadId: String(fit.overheadId),
      ...(fit.loungeId ? { loungeId: String(fit.loungeId) } : { kitchenId: String(fit.kitchenId) }),
      radius: Number.isFinite(radius) && radius >= 0 ? Math.round(radius * 10) / 10 : 50,
    }
    : null;
  if (!next && !wall.fit) return;
  if (next && wall.fit && wall.fit.overheadId === next.overheadId && wall.fit.kitchenId === next.kitchenId && wall.fit.loungeId === next.loungeId && wall.fit.radius === next.radius) return;
  pushHistory();
  if (next) wall.fit = next;
  else delete wall.fit;
  syncControlPanels();
  log(next ? "wall.fit" : "wall.fit.clear", { id, how, overheadId: next && next.overheadId, kitchenId: next && next.kitchenId, loungeId: next && next.loungeId, radius: next && next.radius });
  dirty = true;
  emit("job");
}

export function removeWall(id) {
  const i = (job.walls || []).findIndex((w) => w.id === id);
  if (i < 0) return;
  pushHistory();
  log("wall.remove", { id, wall: job.walls[i] });
  job.walls.splice(i, 1);
  if (selectedId === id) { selectedId = null; selectedIds = []; subSel = null; }
  syncControlPanels();
  dirty = true;
  emit("job");
}

// --- control panels (a screen recessed through a partition / an overhead end) -------------

let nextControlPanelCounter = 1;
function makeControlPanelId() {
  const taken = new Set([
    ...(job.walls || []).flatMap((w) => (w.controlPanels || []).map((p) => p.id)),
    ...job.cabinets.flatMap((c) => (c.params.controlPanels || []).map((p) => p.id)),
  ]);
  let id;
  do {
    id = `cp-${nextControlPanelCounter++}`;
  } while (taken.has(id));
  return id;
}

/**
 * Every overhead takes the control panels of the partitions standing against
 * its ends (`host: "wall"`, derived — the wall is cut by walls.js, the overhead
 * cuts its end divider and adds the backing boards). Its own panels
 * (`host: "endPanel"`) are kept as stored. Returns the cabinets that changed.
 */
function syncControlPanels() {
  const changed = [];
  const walls = (job.walls || []).filter((w) => (w.controlPanels || []).length);
  for (const cab of job.cabinets) {
    if (cab.moduleId !== "overheadCabinet") continue;
    const own = (cab.params.controlPanels || []).filter((p) => p.host !== "wall");
    const derived = walls.flatMap((w) => wallControlPanelsFor(w, cab, getSpace(), job.stock));
    const next = [...own, ...derived];
    if (JSON.stringify(next) === JSON.stringify(cab.params.controlPanels || [])) continue;
    const params = { ...cab.params };
    if (next.length) params.controlPanels = next;
    else delete params.controlPanels;
    cab.params = params;
    invalidate(cab.id);
    changed.push(cab.id);
  }
  return changed;
}

/** Add a control panel to a partition (`host` wall) or to an overhead with an end panel. One undo step. */
export function addControlPanel(target, rec, meta = {}) {
  const panel = normalizeControlPanel({ ...rec, id: "pending" });
  if (!panel) return null;
  const wall = getWall(target);
  const cab = wall ? null : job.cabinets.find((c) => c.id === target);
  if (!wall && !(cab && cab.moduleId === "overheadCabinet" && cab.params.endPanel)) return null;
  pushHistory();
  panel.id = makeControlPanelId();
  if (wall) {
    wall.controlPanels = [...(wall.controlPanels || []), panel];
    const changed = syncControlPanels();
    log("cpanel.add", { host: "wall", id: wall.id, panel, changed, ...meta });
  } else {
    const list = [...(cab.params.controlPanels || []), { ...panel, host: "endPanel" }];
    cab.params = { ...cab.params, controlPanels: list };
    invalidate(cab.id);
    log("cpanel.add", { host: "endPanel", id: cab.id, panel, ...meta });
  }
  dirty = true;
  emit("job");
  return panel;
}

export function setControlPanel(target, panelId, patch) {
  const wall = getWall(target);
  const cab = wall ? null : job.cabinets.find((c) => c.id === target);
  const list = wall ? (wall.controlPanels || []) : (cab && cab.params.controlPanels) || [];
  const i = list.findIndex((p) => p.id === panelId);
  if (i < 0) return false;
  const next = normalizeControlPanel({ ...list[i], ...patch, id: panelId });
  if (!next) return false;
  const kept = wall ? next : { ...next, host: list[i].host || "endPanel", side: list[i].side, wallThickness: list[i].wallThickness, wall: list[i].wall };
  if (JSON.stringify(kept) === JSON.stringify(list[i])) return false;
  pushHistory();
  const from = list[i];
  if (wall) {
    wall.controlPanels = list.map((p, j) => (j === i ? kept : p));
    const changed = syncControlPanels();
    log("cpanel.set", { host: "wall", id: wall.id, panel: panelId, patch, from, to: kept, changed });
  } else {
    cab.params = { ...cab.params, controlPanels: list.map((p, j) => (j === i ? kept : p)) };
    invalidate(cab.id);
    log("cpanel.set", { host: "endPanel", id: cab.id, panel: panelId, patch, from, to: kept });
  }
  dirty = true;
  emit("job");
  return true;
}

export function removeControlPanel(target, panelId) {
  const wall = getWall(target);
  const cab = wall ? null : job.cabinets.find((c) => c.id === target);
  const list = wall ? (wall.controlPanels || []) : (cab && cab.params.controlPanels) || [];
  const i = list.findIndex((p) => p.id === panelId);
  if (i < 0) return false;
  pushHistory();
  const rest = list.filter((_, j) => j !== i);
  if (wall) {
    if (rest.length) wall.controlPanels = rest;
    else delete wall.controlPanels;
    const changed = syncControlPanels();
    log("cpanel.remove", { host: "wall", id: wall.id, panel: list[i], changed });
  } else {
    const params = { ...cab.params };
    if (rest.length) params.controlPanels = rest;
    else delete params.controlPanels;
    cab.params = params;
    invalidate(cab.id);
    log("cpanel.remove", { host: "endPanel", id: cab.id, panel: list[i] });
  }
  dirty = true;
  emit("job");
  return true;
}

// --- partition ↔ waterfall + overhead end panel ----------------------------------------

const r1 = (v) => Math.round(v * 10) / 10;

/** The partition's control panels carried over to the overhead end panel, and back. */
function carryPanels(list, host, extra = {}) {
  return (list || []).filter((p) => p.host !== "wall").map((p) => {
    const rec = normalizeControlPanel(p);
    if (!rec) return null;
    return host === "wall" ? rec : { ...rec, host, ...extra };
  }).filter(Boolean);
}

/**
 * Change to waterfall: `wallId` (fitted to a kitchen and an overhead) is removed;
 * the kitchen gets a waterfall on that end and the overhead a door-stock end
 * panel, both with their outer face where the partition's was. `column` gives
 * the thickness difference on the kitchen, `zone` takes it on the overhead.
 * One undo step. Returns the plan that was applied, or { ok: false, reason }.
 */
export function changeToWaterfall(wallId, { column = 0, zone = 0, how = "menu" } = {}) {
  const wall = getWall(wallId);
  const plan = waterfallPlan(wall, { stock: job.stock, cabinets: job.cabinets });
  if (!plan.ok) { log("wall.waterfall.blocked", { id: wallId, reason: plan.reason }); return plan; }
  const kit = job.cabinets.find((c) => c.id === plan.kitchen.id);
  const ohc = job.cabinets.find((c) => c.id === plan.overhead.id);
  const col = kit.params.columns[column] && plan.kitchen.columns[column]?.ok ? column : plan.kitchen.columns.findIndex((c) => c.ok);
  const zn = ohc.params.zones[zone] && plan.overhead.zones[zone]?.ok ? zone : plan.overhead.zones.findIndex((z) => z.ok);
  pushHistory();
  // Kitchen: the waterfall takes the end; the chosen column gives (waterfall − partition).
  const kp = structuredClone(kit.params);
  kp.waterfall = plan.kitchen.side;
  kp.columns[col].width = r1(kp.columns[col].width + plan.kitchen.delta);
  kp.globalSettings.length = r1(kp.globalSettings.length + plan.kitchen.delta);
  if (plan.kitchen.side === "left") {
    // The box frame moved onto the partition's outer face; hand-drawn arches are world-fixed.
    kp.wheelAvoidances = (kp.wheelAvoidances || []).map((a) => (/^wa-\d+-[LR]$/.test(String(a.id)) ? a : { ...a, x0: r1(a.x0 + plan.kitchen.shift), x1: r1(a.x1 + plan.kitchen.shift) }));
  }
  kit.params = kp;
  kit.pose = plan.kitchen.pose;
  bindToSpace(kit);
  syncWheelArch(kit);
  invalidate(kit.id);
  // Overhead: the end panel; the chosen zone gains (partition − door). The partition's control panels move onto it.
  const op = { ...ohc.params, endPanel: plan.overhead.side, zones: ohc.params.zones.map((z) => ({ ...z })) };
  op.zones[zn].width = r1(op.zones[zn].width + plan.overhead.delta);
  op.cabinetWidth = r1(op.cabinetWidth + plan.overhead.delta);
  const carried = carryPanels(wall.controlPanels, "endPanel", { side: plan.overhead.side });
  const own = (ohc.params.controlPanels || []).filter((p) => p.host !== "wall");
  const panels = [...own, ...carried];
  if (panels.length) op.controlPanels = panels;
  else delete op.controlPanels;
  ohc.params = op;
  ohc.pose = plan.overhead.pose;
  invalidate(ohc.id);
  // The partition goes.
  const i = job.walls.findIndex((w) => w.id === wallId);
  const removed = job.walls[i];
  job.walls.splice(i, 1);
  if (selectedId === wallId) { selectedId = kit.id; selectedIds = [kit.id]; subSel = null; }
  syncControlPanels();
  bindAttached();
  log("wall.waterfall", {
    id: wallId, how, wall: removed, axis: plan.axis, outer: plan.outer,
    kitchen: { id: kit.id, side: plan.kitchen.side, column: col, delta: plan.kitchen.delta, pose: kit.pose, length: kp.globalSettings.length },
    overhead: { id: ohc.id, side: plan.overhead.side, zone: zn, delta: plan.overhead.delta, pose: ohc.pose, cabinetWidth: op.cabinetWidth },
    controlPanels: carried.map((p) => p.id),
  });
  dirty = true;
  emit("job");
  return { ...plan, column: col, zone: zn };
}

/**
 * Change to partition: from a kitchen with a waterfall or an overhead with an
 * end panel whose outer faces lie in one plane. Both boards go; a partition
 * (fitted to the two) stands on that plane. `column` gains (waterfall −
 * partition) on the kitchen, `zone` gives (partition − door) on the overhead.
 */
export function changeToPartition(cabId, { column = 0, zone = 0, how = "menu" } = {}) {
  const cab = job.cabinets.find((c) => c.id === cabId);
  const plan = partitionPlan(cab, { stock: job.stock, cabinets: job.cabinets });
  if (!plan.ok) { log("waterfall.partition.blocked", { id: cabId, reason: plan.reason }); return plan; }
  const kit = job.cabinets.find((c) => c.id === plan.kitchen.id);
  const ohc = job.cabinets.find((c) => c.id === plan.overhead.id);
  const col = kit.params.columns[column] && plan.kitchen.columns[column]?.ok ? column : plan.kitchen.columns.findIndex((c) => c.ok);
  const zn = ohc.params.zones[zone] && plan.overhead.zones[zone]?.ok ? zone : plan.overhead.zones.findIndex((z) => z.ok);
  pushHistory();
  const kp = structuredClone(kit.params);
  delete kp.waterfall;
  kp.columns[col].width = r1(kp.columns[col].width + plan.kitchen.delta);
  kp.globalSettings.length = r1(kp.globalSettings.length + plan.kitchen.delta);
  if (plan.kitchen.side === "left") {
    const shift = -plan.partitionThickness;
    kp.wheelAvoidances = (kp.wheelAvoidances || []).map((a) => (/^wa-\d+-[LR]$/.test(String(a.id)) ? a : { ...a, x0: r1(a.x0 + shift), x1: r1(a.x1 + shift) }));
  }
  kit.params = kp;
  kit.pose = plan.kitchen.pose;
  bindToSpace(kit);
  syncWheelArch(kit);
  invalidate(kit.id);
  const op = { ...ohc.params, zones: ohc.params.zones.map((z) => ({ ...z })) };
  delete op.endPanel;
  op.zones[zn].width = r1(op.zones[zn].width + plan.overhead.delta);
  op.cabinetWidth = r1(op.cabinetWidth + plan.overhead.delta);
  const carried = carryPanels(ohc.params.controlPanels, "wall");
  delete op.controlPanels;
  ohc.params = op;
  ohc.pose = plan.overhead.pose;
  invalidate(ohc.id);
  const w = normalizeWall({ ...plan.wall, id: "pending" });
  w.id = makeWallId();
  if (carried.length) w.controlPanels = carried;
  if (!Array.isArray(job.walls)) job.walls = [];
  job.walls.push(w);
  selectedId = w.id;
  selectedIds = [];
  subSel = null;
  syncControlPanels();
  bindAttached();
  log("waterfall.partition", {
    id: cabId, how, wall: w, axis: plan.axis, outer: plan.outer,
    kitchen: { id: kit.id, side: plan.kitchen.side, column: col, delta: plan.kitchen.delta, pose: kit.pose, length: kp.globalSettings.length },
    overhead: { id: ohc.id, side: plan.overhead.side, zone: zn, delta: plan.overhead.delta, pose: ohc.pose, cabinetWidth: op.cabinetWidth },
    controlPanels: carried.map((p) => p.id),
  });
  dirty = true;
  emit("job");
  return { ...plan, column: col, zone: zn, wallId: w.id };
}

export function removeCabinet(id) {
  const cab = job.cabinets.find((c) => c.id === id);
  if (!cab) return;
  const mod = getModule(cab.moduleId);
  const twin = mod && mod.pair ? job.cabinets.find((c) => c.moduleId === cab.moduleId && c.id !== id) : null;
  pushHistory();
  log("cabinet.remove", { id, moduleId: cab.moduleId, twin: twin ? twin.id : null });
  job.cabinets = job.cabinets.filter((c) => c.id !== id && (!twin || c.id !== twin.id));
  invalidate(id);
  if (twin) invalidate(twin.id);
  dropCabinetsFromSelection([id, twin ? twin.id : null]);
  dirty = true;
  emit("job");
}

/**
 * Remove every cabinet in `ids`, plus a pair's twin when one of the pair is listed.
 * One undo step. The previous cabinet in the set stays selected.
 */
export function removeCabinets(ids) {
  const want = new Set((ids || []).filter(Boolean));
  for (const id of [...want]) {
    const cab = job.cabinets.find((c) => c.id === id);
    if (!cab) { want.delete(id); continue; }
    const mod = getModule(cab.moduleId);
    if (mod && mod.pair) {
      for (const other of job.cabinets) {
        if (other.moduleId === cab.moduleId && other.id !== cab.id) want.add(other.id);
      }
    }
  }
  const removing = job.cabinets.filter((c) => want.has(c.id));
  if (!removing.length) return;
  pushHistory();
  const logged = new Set();
  for (const cab of removing) {
    if (logged.has(cab.id)) continue;
    const mod = getModule(cab.moduleId);
    const twin = mod && mod.pair ? removing.find((c) => c.moduleId === cab.moduleId && c.id !== cab.id) : null;
    log("cabinet.remove", { id: cab.id, moduleId: cab.moduleId, twin: twin ? twin.id : null });
    logged.add(cab.id);
    if (twin) logged.add(twin.id);
  }
  job.cabinets = job.cabinets.filter((c) => !want.has(c.id));
  for (const id of want) invalidate(id);
  dropCabinetsFromSelection([...want]);
  dirty = true;
  emit("job");
}

function dropCabinetsFromSelection(ids) {
  const drop = new Set(ids.filter(Boolean));
  selectedIds = selectedIds.filter((id) => !drop.has(id));
  if (selectedId && drop.has(selectedId)) {
    subSel = null;
    selectedId = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  }
}

/** Apply a preview mutation (no history). Used during drags. */
export function updateCabinet(id, fn) {
  const cab = job.cabinets.find((c) => c.id === id);
  if (!cab) return;
  const before = cab.params;
  fn(cab);
  bindToSpace(cab);
  syncWheelArch(cab);
  syncLoungeArch(cab);
  syncTallArch(cab);
  if (cab.params !== before) invalidate(id);
  bindAttached();
  if (cab.moduleId === "overheadCabinet") syncControlPanels();
  dirty = true;
  emit("job");
}

/**
 * Modules whose size follows other params keep one face where it is when the size changes through
 * setParams. `widthAnchor(params, cab)` = −1 (left, local x = 0) or +1 (right, local x = W): the fridge
 * cabinet (cut-out + side panel), the lounge (its wing end / the corner drawn first).
 * `depthAnchor(params, cab)` = −1 (front, y = 0) or +1 (back, y = D): the lounge keeps its wall.
 * Returns the pose that does it, or null when neither size changed.
 */
function anchoredPose(cab, mod, before, after) {
  if (!mod.widthAnchor && !mod.depthAnchor) return null;
  const e0 = mod.envelope(before);
  const e1 = mod.envelope(after);
  const wMoved = !!mod.widthAnchor && Math.abs(e1.W - e0.W) > 1e-6;
  const dMoved = !!mod.depthAnchor && Math.abs(e1.D - e0.D) > 1e-6;
  if (!wMoved && !dMoved) return null;
  const keep = { x: wMoved ? mod.widthAnchor(after, cab) : -1, y: dMoved ? mod.depthAnchor(after, cab) : -1, z: -1 };
  const box = (e) => ({ x0: 0, x1: e.W, y0: 0, y1: e.D, z0: 0, z1: 0 });
  return keepCorner(cab.pose, box(e0), box(e1), keep);
}

/** Right-click a placed cabinet: use the job's other door colour. One undo step. */
export function setColorSlot(id, slot) {
  const cab = job.cabinets.find((c) => c.id === id);
  if (!cab) return false;
  const colors = doorColors(job.finish);
  if (!colors.two) return false;
  const to = slot === "B" ? "B" : "A";
  const from = colorSlotOf(cab.params, job.finish);
  if (from === to) return false;
  setParams(id, withColorSlot(cab.params, job.finish, to));
  log("cabinet.color", { id, from, to, name: to === "B" ? colors.b.name : colors.a.name });
  return true;
}

export function setParams(id, params, { history = true } = {}) {
  if (history) {
    pushHistory();
    log("cabinet.params", { id, params });
  }
  updateCabinet(id, (cab) => {
    const pose = anchoredPose(cab, getModule(cab.moduleId), cab.params, params);
    cab.params = params;
    if (pose) cab.pose = pose;
  });
  const cab = job.cabinets.find((c) => c.id === id);
  const mod = cab && getModule(cab.moduleId);
  if (cab && mod && mod.pair && mod.mirrorParams) {
    const twin = job.cabinets.find((c) => c.moduleId === cab.moduleId && c.id !== id);
    if (twin) {
      const next = mod.mirrorParams(cab.params, twin.params);
      if (next !== twin.params) updateCabinet(twin.id, (c) => { c.params = next; });
    }
  }
}

/** Grooves the user drew on one board (Groove command): `cabinet.overrides.boards[roleId].grooves`. */
export function boardGrooves(cab, boardId) {
  return cab?.overrides?.boards?.[boardId]?.grooves || [];
}

/**
 * Replace one board's user grooves (one undo step). The board's Move nudge next to them is kept.
 * The cached result is rebuilt: grooves are merged in resultFor, after the generator.
 */
export function setBoardGrooves(id, boardId, grooves) {
  const cab = job.cabinets.find((c) => c.id === id);
  if (!cab) return false;
  const before = JSON.stringify(boardGrooves(cab, boardId));
  if (before === JSON.stringify(grooves || [])) return false;
  pushHistory();
  const boards = { ...(cab.overrides?.boards || {}) };
  const entry = { ...(boards[boardId] || {}) };
  if (grooves && grooves.length) entry.grooves = grooves.map((g) => ({ ...g }));
  else delete entry.grooves;
  if (Object.keys(entry).length) boards[boardId] = entry;
  else delete boards[boardId];
  const rest = { ...(cab.overrides || {}) };
  delete rest.boards;
  if (Object.keys(boards).length) cab.overrides = { ...rest, boards };
  else if (Object.keys(rest).length) cab.overrides = rest;
  else delete cab.overrides;
  invalidate(id);
  dirty = true;
  emit("job");
  return true;
}

/** Board role ids the user has hidden in the 3D view. Unknown ids (a board that no longer exists) are dropped. */
function normalizeHidden(list) {
  if (!Array.isArray(list)) return null;
  const ids = [];
  for (const id of list) {
    if (typeof id === "string" && id && !ids.includes(id)) ids.push(id);
  }
  return ids.length ? ids : null;
}

/** Role ids of this cabinet's boards that are hidden. Ids the generator no longer emits are ignored. */
export function hiddenBoardIds(cab) {
  if (!cab) return [];
  const live = new Set((resultFor(cab.id)?.boards || []).map((b) => b.id));
  return (cab.hidden || []).filter((id) => live.has(id));
}

export function isBoardHidden(cab, boardId) {
  return hiddenBoardIds(cab).includes(boardId);
}

/**
 * Show or hide boards of one cabinet. `boardIds` omitted = every board the generator currently emits.
 * Stored on `cabinet.hidden` (role ids) and saved with the job. The boards still exist; only the 3D view skips them.
 * Returns false when nothing changed.
 */
export function setBoardsVisible(id, visible, boardIds) {
  const cab = job.cabinets.find((c) => c.id === id);
  if (!cab) return false;
  const all = (resultFor(id)?.boards || []).map((b) => b.id);
  const live = new Set(all);
  const targets = (boardIds ? boardIds.filter((b) => live.has(b)) : all);
  if (!targets.length) return false;
  const hidden = new Set((cab.hidden || []).filter((b) => live.has(b)));
  let changed = false;
  for (const b of targets) {
    if (visible && hidden.delete(b)) changed = true;
    else if (!visible && !hidden.has(b)) { hidden.add(b); changed = true; }
  }
  if (!changed) return false;
  pushHistory();
  if (hidden.size) cab.hidden = [...hidden];
  else delete cab.hidden;
  log("board.visibility", { id, boards: targets, visible, hidden: cab.hidden || [] });
  dirty = true;
  emit("job");
  return true;
}

/**
 * V, or the browser eye. One board, or every board when `boardIds` is omitted.
 * A mixed module hides: every targeted board that is still showing goes dark; when they are all hidden, they all come back.
 */
export function toggleBoardsVisible(id, boardIds) {
  const cab = job.cabinets.find((c) => c.id === id);
  if (!cab) return false;
  const all = (resultFor(id)?.boards || []).map((b) => b.id);
  const live = new Set(all);
  const targets = boardIds ? boardIds.filter((b) => live.has(b)) : all;
  if (!targets.length) return false;
  const hidden = new Set(cab.hidden || []);
  return setBoardsVisible(id, targets.every((b) => hidden.has(b)), targets);
}

/**
 * Show or hide one partition in the 3D view. Stored as `wall.hidden` and saved
 * with the job. The wall still exists for the floor plan, snaps and overlap checks.
 */
export function setWallVisible(id, visible) {
  const wall = getWall(id);
  if (!wall) return false;
  if (!!wall.hidden === !visible) return false;
  pushHistory();
  if (visible) delete wall.hidden;
  else wall.hidden = true;
  log("wall.visibility", { id, visible: !!visible });
  dirty = true;
  emit("job");
  return true;
}

export function toggleWallVisible(id) {
  const wall = getWall(id);
  if (!wall) return false;
  return setWallVisible(id, !!wall.hidden);
}

/**
 * V. The selected partition, or the selected board, or every board when the
 * cabinet itself is selected. A face selection toggles its board.
 */
export function toggleSelectionVisible() {
  const wall = getSelectedWall();
  if (wall) return toggleWallVisible(wall.id);
  const cab = getSelected();
  if (!cab) return false;
  const boardId = getSubSelection()?.boardId;
  return toggleBoardsVisible(cab.id, boardId ? [boardId] : null);
}

export function setPose(id, pose, { history = true } = {}) {
  if (history) {
    pushHistory();
    log("cabinet.pose", { id, pose });
  }
  updateCabinet(id, (cab) => { cab.pose = { ...cab.pose, ...pose }; });
}

/**
 * Select a job object (cabinet / wall / plane id, or null) — optionally a board and a face
 * inside a cabinet: `select("cab-1", { boardId: "BP", faceId: "A" })`. Selecting the cabinet
 * alone clears any board / face selection.
 * `{ extend: true }` (Ctrl+click) toggles that cabinet in the set. The last one stays primary:
 * the panel, the handles and Move / Face / Rotate follow it. A plain click keeps only that one.
 */
export function select(id, sub = null, opts = null) {
  if (opts && opts.extend) {
    if (!isCabinetId(id)) return;
    const set = getSelectedIds();
    const next = set.includes(id) ? set.filter((x) => x !== id) : [...set, id];
    selectedIds = next;
    selectedId = next.length ? next[next.length - 1] : null;
    subSel = null;
    log("select", { id: selectedId, ids: next, board: null, face: null, region: null, how: "ctrl" });
    emit("selection");
    return;
  }
  // A region (`{ regionId }`) is the volume-only counterpart of a board: one of the bedroom
  // body's layout regions, selected in the front view or by a second click in 3D.
  const nextSub = id && sub && sub.boardId
    ? { boardId: sub.boardId, faceId: sub.faceId || null }
    : id && sub && sub.regionId ? { regionId: sub.regionId } : null;
  const nextIds = isCabinetId(id) ? [id] : [];
  const same = selectedId === id
    && (subSel?.boardId ?? null) === (nextSub?.boardId ?? null)
    && (subSel?.faceId ?? null) === (nextSub?.faceId ?? null)
    && (subSel?.regionId ?? null) === (nextSub?.regionId ?? null)
    && nextIds.length === selectedIds.length
    && nextIds.every((x, i) => x === selectedIds[i]);
  if (same) return;
  selectedId = id;
  selectedIds = nextIds;
  subSel = nextSub;
  log("select", {
    id,
    ids: nextIds.length ? nextIds : undefined,
    board: nextSub?.boardId ?? null,
    face: nextSub?.faceId ?? null,
    region: nextSub?.regionId ?? null,
  });
  emit("selection");
}

/** The selected region id of the selected cabinet (bedroom body), or null. */
export function getSelectedRegion() {
  if (!subSel || !subSel.regionId || !selectedId) return null;
  const cab = getSelected();
  if (!cab) return null;
  return (resultFor(cab.id)?.zones || []).some((z) => z.id === subSel.regionId) ? subSel.regionId : null;
}

// --- file -----------------------------------------------------------------

export function resetJob() {
  log("file.new", { hadCabinets: job.cabinets.length, dirty });
  job = newJob();
  conflict = null;
  selectedId = null;
  selectedIds = [];
  subSel = null;
  undoStack.length = 0;
  redoStack.length = 0;
  invalidate();
  dirty = false;
  filePath = null;
  emit("job");
}

/** The open job, so a window reload can bring it back. */
export function captureSession() {
  return {
    job: JSON.parse(JSON.stringify(job)),
    path: filePath,
    dirty,
    selectedId,
    selectedIds: [...selectedIds],
    subSel: subSel ? { ...subSel } : null,
  };
}

/** Put a captured job back. The file stays unsaved when it was unsaved. */
export function resumeSession(data) {
  const obj = data && data.job;
  if (!obj || !/^job\.v[12]$/.test(obj.version || "") || !Array.isArray(obj.cabinets)) {
    throw new Error("Not a Cab Lab job");
  }
  job = migrate(obj);
  conflict = null;
  selectedId = data.selectedId || null;
  selectedIds = Array.isArray(data.selectedIds) ? data.selectedIds.filter((id) => typeof id === "string") : [];
  const sub = data.subSel && typeof data.subSel === "object" ? data.subSel : null;
  subSel = sub && (sub.boardId || sub.regionId)
    ? { boardId: sub.boardId, faceId: sub.faceId || null, regionId: sub.regionId }
    : null;
  undoStack.length = 0;
  redoStack.length = 0;
  invalidate();
  bindAllToSpace();
  syncWheelArches();
  pruneSelection();
  dirty = !!data.dirty;
  filePath = typeof data.path === "string" ? data.path : null;
  log("file.refresh", { path: filePath, cabinets: job.cabinets.length, dirty, id: selectedId });
  emit("job");
}

export function loadJob(obj, path) {
  if (!obj || !/^job\.v[12]$/.test(obj.version || "") || !Array.isArray(obj.cabinets)) {
    throw new Error("Not a Cab Lab job file");
  }
  job = migrate(obj);
  conflict = null;
  log("file.open", { path, version: obj.version, cabinets: job.cabinets.length, space: job.space, finish: job.finish, stock: job.stock });
  selectedId = null;
  selectedIds = [];
  subSel = null;
  undoStack.length = 0;
  redoStack.length = 0;
  invalidate();
  bindAllToSpace();
  syncWheelArches();
  dirty = false;
  filePath = path || null;
  emit("job");
}

export function serialize() {
  return JSON.stringify(job, null, 2);
}

export function markSaved(path) {
  log("file.save", { path: path || filePath, cabinets: job.cabinets.length });
  dirty = false;
  if (path) filePath = path;
  emit("file");
}
