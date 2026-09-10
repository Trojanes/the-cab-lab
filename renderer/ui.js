// Shell wiring: top bar, module rail, drawer, status bar, file actions.
import { setView, drawSpace, floorPointAt, canvas } from "./space.js";
import * as job from "./job.js";
import { MODULES, PLANNED_MODULES } from "./modules.js";
import { syncCabinets } from "./cabinets3d.js";
import { armPlacement, disarm, onModeChange, getPlacingModule, getMode, startMove } from "./interact.js";
import { renderPanel } from "./panel.js";
import { openSpaceDialog, isOpen as spaceDialogOpen } from "./spaceDialog.js";
import { log, attachJob } from "./log.js";

attachJob(job);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// --- module rail ---------------------------------------------------------------
const list = $("#moduleList");
for (const mod of Object.values(MODULES)) {
  const btn = document.createElement("button");
  btn.className = "rail-item";
  btn.dataset.module = mod.id;
  btn.innerHTML = `<span class="rail-name"></span><span class="rail-sub"></span>`;
  $(".rail-name", btn).textContent = mod.label;
  $(".rail-sub", btn).textContent = mod.sub;
  btn.addEventListener("click", () => {
    if (getPlacingModule() === mod.id) disarm();
    else armPlacement(mod.id);
  });
  list.append(btn);
}
for (const mod of PLANNED_MODULES) {
  const btn = document.createElement("button");
  btn.className = "rail-item";
  btn.disabled = true;
  btn.title = "Not wired yet";
  btn.innerHTML = `<span class="rail-name"></span><span class="rail-sub"></span>`;
  $(".rail-name", btn).textContent = mod.label;
  $(".rail-sub", btn).textContent = mod.sub;
  list.append(btn);
}
$("[data-space]").addEventListener("click", () => {
  disarm();
  job.select(null);
});

function refreshRail() {
  const placing = getPlacingModule();
  const sel = job.getSelected();
  $$("#leftrail .rail-item").forEach((b) => {
    b.classList.toggle("active", b.dataset.module ? b.dataset.module === placing : (!placing && !sel && b.hasAttribute("data-space")));
  });
  const mode = getMode();
  const HINTS = {
    armed: placing ? `Placing ${MODULES[placing].label} — click a corner to start · Shift+click repeats the last size · digits re-size the last box · Esc to stop` : "",
    face: "Draw the rectangle on this face · Tab / digits type its two sizes · click the opposite corner · Enter creates with the preset depth",
    extrude: "Pull the rectangle off the face (one way only) · snaps to faces and corners · click or Enter to create · Esc to restart",
    "move.grab": "Move — click the point to grab (a corner of the cabinet works best) · Esc to cancel",
    "move.drop": "Move — click the target point · Tab types ΔX ΔY ΔZ · Ctrl+click copies · Esc to cancel",
  };
  $("#modeHint").textContent = HINTS[mode] || "";
}

// --- view buttons ---------------------------------------------------------------
$$("#viewGroup [data-view]").forEach((btn) => {
  btn.addEventListener("click", () => {
    $$("#viewGroup [data-view]").forEach((b) => b.classList.toggle("active", b === btn));
    setView(btn.dataset.view);
    log("view", { view: btn.dataset.view });
    $("#viewLabel").textContent = btn.textContent;
  });
});

// --- drawer ---------------------------------------------------------------------
const drawer = $("#drawer");
$("#drawerToggle").addEventListener("click", () => drawer.classList.toggle("collapsed"));
$$("#drawer .dtab").forEach((tab) => {
  tab.addEventListener("click", () => {
    $$("#drawer .dtab").forEach((t) => t.classList.toggle("active", t === tab));
    $$("#drawer .dpane").forEach((p) => p.classList.toggle("active", p.dataset.dpane === tab.dataset.dtab));
    drawer.classList.remove("collapsed");
  });
});

// --- status bar -------------------------------------------------------------------
const stCursor = $("#stCursor");
canvas.addEventListener("pointermove", (e) => {
  const p = floorPointAt(e.clientX, e.clientY);
  stCursor.textContent = p ? `X ${Math.round(p.x)}  Y ${Math.round(p.y)}` : "X — Y —";
});
canvas.addEventListener("pointerleave", () => { stCursor.textContent = "X — Y —"; });

function refreshStatus() {
  const sel = job.getSelected();
  $("#stSelection").textContent = sel ? `Selection: ${sel.id} (${MODULES[sel.moduleId].label})` : "Selection: —";
  const path = job.getFilePath();
  const name = path ? path.split(/[\\/]/).pop() : "Untitled";
  $("#stFile").textContent = job.isDirty() ? `${name} · unsaved` : name;
  document.title = `${job.isDirty() ? "• " : ""}${name} — The Cab Lab`;
  $('[data-action="undo"]').disabled = !job.canUndo();
  $('[data-action="redo"]').disabled = !job.canRedo();
  $('[data-action="move"]').disabled = !sel;
  $('[data-action="move"]').classList.toggle("active", getMode().startsWith("move"));
}

// --- file actions -------------------------------------------------------------------
const bridge = window.cablab || null;

async function doNew() {
  if (job.isDirty() && !window.confirm("Discard unsaved changes?")) return;
  disarm();
  job.resetJob();
  openSpaceDialog();
}
async function doOpen() {
  if (!bridge) return console.warn("[ui] file bridge unavailable");
  if (job.isDirty() && !window.confirm("Discard unsaved changes?")) return;
  const res = await bridge.openJob();
  if (!res) return;
  try {
    job.loadJob(JSON.parse(res.text), res.path);
  } catch (err) {
    log("file.open.failed", { path: res.path, message: err.message });
    window.alert(`Could not open: ${err.message}`);
  }
}
async function doSave(forceDialog = false) {
  if (!bridge) return console.warn("[ui] file bridge unavailable");
  const path = await bridge.saveJob(forceDialog ? null : job.getFilePath(), job.serialize());
  if (path) job.markSaved(path);
}

const ACTIONS = {
  new: doNew,
  open: doOpen,
  save: () => doSave(false),
  undo: () => job.undo(),
  redo: () => job.redo(),
  move: () => startMove(),
};
$$("#topbar [data-action]").forEach((btn) => {
  btn.addEventListener("click", () => ACTIONS[btn.dataset.action]?.());
});

window.addEventListener("keydown", (e) => {
  if (!e.ctrlKey || spaceDialogOpen()) return;
  const k = e.key.toLowerCase();
  const inField = e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName);
  if (k === "l" && e.shiftKey) { e.preventDefault(); log("logs.open"); bridge?.openLogs?.(); }
  else if (k === "n") { e.preventDefault(); doNew(); }
  else if (k === "o") { e.preventDefault(); doOpen(); }
  else if (k === "s") { e.preventDefault(); doSave(e.shiftKey); }
  else if (k === "z" && !inField) { e.preventDefault(); job.undo(); }
  else if (k === "y" && !inField) { e.preventDefault(); job.redo(); }
});

// --- sync --------------------------------------------------------------------------
let panelPending = false;
const rightpanel = $("#rightpanel");
function maybeRenderPanel() {
  if (rightpanel.contains(document.activeElement)) {
    panelPending = true;
    return;
  }
  panelPending = false;
  renderPanel();
}
rightpanel.addEventListener("focusout", () => {
  // Wait for focus to settle, then re-render if a job change was skipped.
  setTimeout(() => { if (panelPending && !rightpanel.contains(document.activeElement)) maybeRenderPanel(); }, 0);
});

let lastSpace = undefined;
function refreshAll() {
  const resolved = job.getSpace();
  if (resolved !== lastSpace) {
    const firstDefinition = !lastSpace && resolved;
    lastSpace = resolved;
    drawSpace(resolved);
    if (firstDefinition) setView($("#viewGroup .active")?.dataset.view || "3d");
  }
  $("#emptyState").classList.toggle("hidden", job.hasSpace());
  $$("#moduleList .rail-item[data-module]").forEach((b) => { b.disabled = !job.hasSpace(); });
  syncCabinets();
  maybeRenderPanel();
  refreshRail();
  refreshStatus();
}

$("[data-define-space]").addEventListener("click", () => openSpaceDialog());

job.onChange(refreshAll);
onModeChange(() => { refreshRail(); refreshStatus(); });
refreshAll();
setView("3d");
if (!job.hasSpace()) openSpaceDialog();
