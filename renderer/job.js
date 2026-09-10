// job.json in memory. Everything visible traces back to this object.
// Undo/redo = whole-job snapshots. Generation results are cached per cabinet
// and rebuilt whenever params change.
import { getModule } from "./modules.js";
import { resolveSpace } from "./spaces.js";
import { log } from "./log.js";

const SNAP = 10;
export const snap = (v, s = SNAP) => Math.round(v / s) * s;

// A new job has no space yet: defining the space is step one.
function newJob() {
  return {
    version: "job.v2",
    units: "mm",
    origin: "front-left floor corner; X right, Y back, Z up",
    space: null, // { kind, params } once defined
    cabinets: [],
  };
}

/** Accept job.v1 files (space as bare W/D/H). */
function migrate(obj) {
  if (obj.version === "job.v1") {
    const s = obj.space || {};
    return {
      ...obj,
      version: "job.v2",
      origin: "front-left floor corner; X right, Y back, Z up",
      space: s.width ? { kind: "box", params: { width: s.width, depth: s.depth, height: s.height } } : null,
    };
  }
  return obj;
}

let job = newJob();
let selectedId = null;
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
  if (selectedId && !job.cabinets.some((c) => c.id === selectedId)) selectedId = null;
  dirty = true;
  emit("job");
}

export function redo() {
  if (!redoStack.length) return;
  log("redo", { depth: redoStack.length });
  undoStack.push(JSON.stringify(job));
  job = JSON.parse(redoStack.pop());
  invalidate();
  if (selectedId && !job.cabinets.some((c) => c.id === selectedId)) selectedId = null;
  dirty = true;
  emit("job");
}

// --- mutations -------------------------------------------------------------

/** Define or redefine the space. Cabinets are never moved; checks report any that no longer fit. */
export function defineSpace(kind, params, { history = true } = {}) {
  if (history) pushHistory();
  job.space = { kind, params: { ...params } };
  log("space.define", { spaceKind: kind, params: job.space.params, cabinets: job.cabinets.length });
  dirty = true;
  emit("job");
}

let nextIdCounter = 1;
function makeId() {
  let id;
  do {
    id = `cab-${nextIdCounter++}`;
  } while (job.cabinets.some((c) => c.id === id));
  return id;
}

export function addCabinet(moduleId, pose, size) {
  pushHistory();
  const mod = getModule(moduleId);
  const s = { ...mod.defaultSize, ...size };
  const cab = {
    id: makeId(),
    moduleId,
    pose: { x: 0, y: 0, z: 0, rotZ: 0, ...pose },
    params: mod.defaults(s.W, s.D, s.H),
  };
  job.cabinets.push(cab);
  selectedId = cab.id;
  log("cabinet.add", { id: cab.id, moduleId, pose: cab.pose, size: s, params: cab.params });
  dirty = true;
  emit("job");
  return cab;
}

export function removeCabinet(id) {
  const i = job.cabinets.findIndex((c) => c.id === id);
  if (i < 0) return;
  pushHistory();
  log("cabinet.remove", { id, moduleId: job.cabinets[i].moduleId });
  job.cabinets.splice(i, 1);
  invalidate(id);
  if (selectedId === id) selectedId = null;
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
  dirty = true;
  emit("job");
}

export function setParams(id, params, { history = true } = {}) {
  if (history) {
    pushHistory();
    log("cabinet.params", { id, params });
  }
  updateCabinet(id, (cab) => { cab.params = params; });
}

export function setPose(id, pose, { history = true } = {}) {
  if (history) {
    pushHistory();
    log("cabinet.pose", { id, pose });
  }
  updateCabinet(id, (cab) => { cab.pose = { ...cab.pose, ...pose }; });
}

export function select(id) {
  if (selectedId === id) return;
  selectedId = id;
  log("select", { id });
  emit("selection");
}

// --- file -----------------------------------------------------------------

export function resetJob() {
  log("file.new", { hadCabinets: job.cabinets.length, dirty });
  job = newJob();
  selectedId = null;
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
  log("file.open", { path, version: obj.version, cabinets: job.cabinets.length, space: job.space });
  selectedId = null;
  undoStack.length = 0;
  redoStack.length = 0;
  invalidate();
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
