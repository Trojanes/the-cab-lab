// job.json in memory. Everything visible traces back to this object.
// Undo/redo = whole-job snapshots. Generation results are cached per cabinet
// and rebuilt whenever params change.
import { getModule } from "./modules.js";
import { resolveSpace } from "./spaces.js";
import { log } from "./log.js";
import { defaultMaterials, normalizeFinish, normalizeStock } from "./materials.js";
import { normalizeWall, normalizeOpening } from "./walls.js";

const SNAP = 10;
export const snap = (v, s = SNAP) => Math.round(v / s) * s;

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
  return obj;
}

let job = newJob();
let selectedId = null;
// Board / face under the selected cabinet (module → board → face). Display only: the
// cabinet stays the selected object; this narrows the highlight and the panel's read-out.
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

export function resultFor(id) {
  if (!results.has(id)) {
    const cab = job.cabinets.find((c) => c.id === id);
    if (!cab) return null;
    const result = getModule(cab.moduleId).generate(cab.params);
    results.set(id, result);
    if (result?.validation?.errors?.length) log("generator.errors", { id, moduleId: cab.moduleId, errors: result.validation.errors, params: cab.params });
  }
  return results.get(id);
}

function invalidate(id) {
  if (id) results.delete(id);
  else results.clear();
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
  if (!selectionExists()) { selectedId = null; subSel = null; }
  dirty = true;
  emit("job");
}

function selectionExists() {
  if (!selectedId) return true;
  return job.cabinets.some((c) => c.id === selectedId)
    || (job.planes || []).some((p) => p.id === selectedId)
    || (job.walls || []).some((w) => w.id === selectedId);
}

export function redo() {
  if (!redoStack.length) return;
  log("redo", { depth: redoStack.length });
  undoStack.push(JSON.stringify(job));
  job = JSON.parse(redoStack.pop());
  invalidate();
  if (!selectionExists()) { selectedId = null; subSel = null; }
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
function bindAttached() {
  for (const cab of job.cabinets) bindToJob(cab);
}

/** Define or redefine the space. Cabinets are never moved; checks report any that no longer fit. */
export function defineSpace(kind, params, { history = true, finish, stock } = {}) {
  if (history) pushHistory();
  job.space = { kind, params: { ...params } };
  if (finish) job.finish = normalizeFinish(finish);
  if (stock) job.stock = normalizeStock(stock);
  bindAllToSpace();
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

/** Replace the job catalogue. Existing cabinets keep the thicknesses they already copied. */
export function setMaterials(finish, stock, { history = true } = {}) {
  const nextFinish = normalizeFinish(finish);
  const nextStock = normalizeStock(stock);
  if (JSON.stringify(nextFinish) === JSON.stringify(job.finish) && JSON.stringify(nextStock) === JSON.stringify(job.stock)) return false;
  if (history) pushHistory();
  job.finish = nextFinish;
  job.stock = nextStock;
  log("materials.set", { finish: job.finish, stock: job.stock });
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
  bindToSpace(cab);
  job.cabinets.push(cab);
  bindAttached();
  selectedId = cab.id;
  subSel = null;
  log("cabinet.add", { id: cab.id, moduleId, pose: cab.pose, size: s, params: cab.params });
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
  if (selectedId === id) { selectedId = null; subSel = null; }
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
  subSel = null;
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

export function removeWall(id) {
  const i = (job.walls || []).findIndex((w) => w.id === id);
  if (i < 0) return;
  pushHistory();
  log("wall.remove", { id, wall: job.walls[i] });
  job.walls.splice(i, 1);
  if (selectedId === id) { selectedId = null; subSel = null; }
  dirty = true;
  emit("job");
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
  if (selectedId === id || (twin && selectedId === twin.id)) { selectedId = null; subSel = null; }
  dirty = true;
  emit("job");
}

/** Apply a preview mutation (no history). Used during drags. */
export function updateCabinet(id, fn) {
  const cab = job.cabinets.find((c) => c.id === id);
  if (!cab) return;
  const before = cab.params;
  fn(cab);
  if (cab.params !== before) invalidate(id);
  bindToSpace(cab);
  bindAttached();
  dirty = true;
  emit("job");
}

export function setParams(id, params, { history = true } = {}) {
  if (history) {
    pushHistory();
    log("cabinet.params", { id, params });
  }
  updateCabinet(id, (cab) => { cab.params = params; });
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
 */
export function select(id, sub = null) {
  // A region (`{ regionId }`) is the volume-only counterpart of a board: one of the bedroom
  // body's layout regions, selected in the front view or by a second click in 3D.
  const nextSub = id && sub && sub.boardId
    ? { boardId: sub.boardId, faceId: sub.faceId || null }
    : id && sub && sub.regionId ? { regionId: sub.regionId } : null;
  const same = selectedId === id
    && (subSel?.boardId ?? null) === (nextSub?.boardId ?? null)
    && (subSel?.faceId ?? null) === (nextSub?.faceId ?? null)
    && (subSel?.regionId ?? null) === (nextSub?.regionId ?? null);
  if (same) return;
  selectedId = id;
  subSel = nextSub;
  log("select", { id, board: nextSub?.boardId ?? null, face: nextSub?.faceId ?? null, region: nextSub?.regionId ?? null });
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
  selectedId = null;
  subSel = null;
  undoStack.length = 0;
  redoStack.length = 0;
  invalidate();
  dirty = false;
  filePath = null;
  emit("job");
}

export function loadJob(obj, path) {
  if (!obj || !/^job\.v[12]$/.test(obj.version || "") || !Array.isArray(obj.cabinets)) {
    throw new Error("Not a Cab Lab job file");
  }
  job = migrate(obj);
  log("file.open", { path, version: obj.version, cabinets: job.cabinets.length, space: job.space, finish: job.finish, stock: job.stock });
  selectedId = null;
  subSel = null;
  undoStack.length = 0;
  redoStack.length = 0;
  invalidate();
  bindAllToSpace();
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
