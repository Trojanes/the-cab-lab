// job.json in memory. Everything visible traces back to this object.
// Undo/redo = whole-job snapshots. Generation results are cached per cabinet
// and rebuilt whenever params change.
import { getModule } from "./modules.js";

const SNAP = 10;
export const snap = (v, s = SNAP) => Math.round(v / s) * s;

function newJob() {
  return {
    version: "job.v1",
    units: "mm",
    space: { width: 4000, depth: 3000, height: 2400 },
    cabinets: [],
  };
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
    results.set(id, getModule(cab.moduleId).generate(cab.params));
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
  redoStack.push(JSON.stringify(job));
  job = JSON.parse(undoStack.pop());
  invalidate();
  if (selectedId && !job.cabinets.some((c) => c.id === selectedId)) selectedId = null;
  dirty = true;
  emit("job");
}

export function redo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(job));
  job = JSON.parse(redoStack.pop());
  invalidate();
  if (selectedId && !job.cabinets.some((c) => c.id === selectedId)) selectedId = null;
  dirty = true;
  emit("job");
}

// --- mutations -------------------------------------------------------------

export function setSpace(patch, { history = true } = {}) {
  if (history) pushHistory();
  job.space = { ...job.space, ...patch };
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
  dirty = true;
  emit("job");
  return cab;
}

export function removeCabinet(id) {
  const i = job.cabinets.findIndex((c) => c.id === id);
  if (i < 0) return;
  pushHistory();
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
  if (history) pushHistory();
  updateCabinet(id, (cab) => { cab.params = params; });
}

export function setPose(id, pose, { history = true } = {}) {
  if (history) pushHistory();
  updateCabinet(id, (cab) => { cab.pose = { ...cab.pose, ...pose }; });
}

export function select(id) {
  if (selectedId === id) return;
  selectedId = id;
  emit("selection");
}

// --- file -----------------------------------------------------------------

export function resetJob() {
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
  if (!obj || obj.version !== "job.v1" || !obj.space || !Array.isArray(obj.cabinets)) {
    throw new Error("Not a job.v1 file");
  }
  job = obj;
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
  dirty = false;
  if (path) filePath = path;
  emit("file");
}
