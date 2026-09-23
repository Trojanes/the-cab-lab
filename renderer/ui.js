// Shell wiring: top bar, module rail, drawer, status bar, file actions.
import { setView, drawSpace, floorPointAt, canvas } from "./space.js";
import * as job from "./job.js";
import { MODULES, MODULE_GROUPS, PLANNED_MODULES } from "./modules.js";
import { syncCabinets, syncPlanes } from "./cabinets3d.js";
import { syncWalls } from "./walls3d.js";
import "./floorplan.js"; // the 2D sheet over the viewport (button at the top right)
import { armPlacement, disarm, onModeChange, getPlacingModule, getMode, getLoungeStyle, startLounge, startMove, startOrient, startPlane } from "./interact.js";
import { renderPanel } from "./panel.js";
import { render as renderTree } from "./tree.js";
import { faceLabel } from "./boardModel.js";
import { openSpaceDialog, isOpen as spaceDialogOpen } from "./spaceDialog.js";
import { loadSettings } from "./settings.js";
import { log, attachJob } from "./log.js";
import { railContext } from "./benchMenu.js";

attachJob(job);

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// --- module rail ---------------------------------------------------------------
const list = $("#moduleList");
const rail = $("#leftrail");
const grouped = new Set(MODULE_GROUPS.flatMap((g) => g.items.map((i) => i.moduleId).filter(Boolean)));

function moduleButton(mod, label = mod.label, sub = mod.sub, onClick = null) {
  const btn = document.createElement("button");
  btn.className = "rail-item";
  btn.dataset.module = mod.id;
  if (mod.requires) btn.dataset.requires = mod.requires;
  btn.innerHTML = `<span class="rail-name"></span><span class="rail-sub"></span>`;
  $(".rail-name", btn).textContent = label;
  $(".rail-sub", btn).textContent = sub;
  btn.addEventListener("click", onClick || (() => {
    if (getPlacingModule() === mod.id) disarm();
    else armPlacement(mod.id);
  }));
  railContext(btn, mod.id);
  return btn;
}
function plannedButton(label, sub) {
  const btn = document.createElement("button");
  btn.className = "rail-item";
  btn.disabled = true;
  btn.title = "Not wired yet";
  btn.innerHTML = `<span class="rail-name"></span><span class="rail-sub"></span>`;
  $(".rail-name", btn).textContent = label;
  $(".rail-sub", btn).textContent = sub;
  return btn;
}

for (const mod of Object.values(MODULES)) {
  if (!grouped.has(mod.id)) list.append(moduleButton(mod));
}

// Groups: one rail entry; hovering it opens a flyout of sub-modules beside the rail.
let openFlyout = null;
function closeFlyout() {
  if (!openFlyout) return;
  openFlyout.classList.add("hidden");
  openFlyout.parentElement.classList.remove("open");
  openFlyout = null;
}
for (const group of MODULE_GROUPS) {
  const wrap = document.createElement("div");
  wrap.className = "rail-group";
  wrap.dataset.group = group.id;
  const head = document.createElement("button");
  head.className = "rail-item rail-group-head";
  head.dataset.group = group.id;
  head.innerHTML = `<span class="rail-name"></span><span class="rail-sub"></span><span class="rail-caret">›</span>`;
  $(".rail-name", head).textContent = group.label;
  $(".rail-sub", head).textContent = group.sub;
  const fly = document.createElement("div");
  fly.className = "rail-flyout hidden";
  fly.append(Object.assign(document.createElement("div"), { className: "rail-title", textContent: group.label }));
  for (const item of group.items) {
    if (item.lounge && MODULES.loungeGenerator) {
      const btn = moduleButton(MODULES.loungeGenerator, item.label, item.sub, () => {
        if (getLoungeStyle() === item.lounge) disarm();
        else startLounge(item.lounge);
      });
      btn.dataset.lounge = item.lounge;
      fly.append(btn);
    } else if (item.moduleId && MODULES[item.moduleId]) fly.append(moduleButton(MODULES[item.moduleId], item.label, item.sub));
    else fly.append(plannedButton(item.label, item.sub));
  }
  const open = () => {
    if (openFlyout && openFlyout !== fly) closeFlyout();
    const r = head.getBoundingClientRect();
    const rr = rail.getBoundingClientRect();
    fly.style.left = `${rr.right}px`;
    fly.style.top = `${r.top}px`;
    fly.classList.remove("hidden");
    wrap.classList.add("open");
    openFlyout = fly;
    log("rail.group.open", { group: group.id });
  };
  wrap.addEventListener("mouseenter", open);
  wrap.addEventListener("mouseleave", closeFlyout);
  head.addEventListener("click", () => (openFlyout === fly ? closeFlyout() : open()));
  wrap.append(head, fly);
  list.append(wrap);
}
window.addEventListener("resize", closeFlyout);
rail.addEventListener("scroll", closeFlyout);
for (const mod of PLANNED_MODULES) list.append(plannedButton(mod.label, mod.sub));
$("[data-space]").addEventListener("click", () => {
  disarm();
  job.select(null);
});

function refreshRail() {
  const placing = getPlacingModule();
  const sel = job.getSelected();
  $$("#leftrail .rail-item").forEach((b) => {
    if (b.dataset.requires) {
      // Attached modules wait for the cabinet they attach to (Bed Box needs the Bedroom body).
      const has = job.getJob().cabinets.some((c) => c.moduleId === b.dataset.requires);
      b.disabled = !has;
      b.title = has ? "" : `Place the ${MODULES[b.dataset.requires].label} body first`;
    }
    if (b.dataset.lounge) {
      b.classList.toggle("active", getLoungeStyle() === b.dataset.lounge);
      return;
    }
    if (b.dataset.group) {
      const group = MODULE_GROUPS.find((g) => g.id === b.dataset.group);
      b.classList.toggle("active", !!placing && group.items.some((i) => i.moduleId === placing));
      return;
    }
    b.classList.toggle("active", b.dataset.module ? b.dataset.module === placing : (!placing && !sel && b.hasAttribute("data-space")));
  });
  const mode = getMode();
  const loungeStep = mode.startsWith("lounge.") ? mode.slice("lounge.".length) : null;
  const LOUNGE_HINT = {
    corner: "click one corner of the plan · Esc cancels",
    face: "click the opposite corner — that sets length and depth together · type W or D · Esc steps back",
    side: "the lit end gets the side cabinet · click it · Esc steps back",
    width: "pull the side cabinet's width · type W · click or Enter · Esc steps back",
    height: "pull the height · type H · click or Enter creates · Esc steps back",
  };
  const HINTS = {
    armed: placing
      ? MODULES[placing].placement === "ceiling"
        ? `Placing ${MODULES[placing].label} — click a corner where a wall meets the ceiling · W runs along that wall · draw on the ceiling, the wall or a side face · Esc to stop`
        : `Placing ${MODULES[placing].label} — click a corner to start · Shift+click repeats the last size · digits re-size the last box · Esc to stop`
      : "",
    face: "Draw the rectangle on this face · Tab / digits type its two sizes · click the opposite corner · Enter creates with the preset depth",
    extrude: "Pull the rectangle off the face (one way only) · snaps to faces and corners · click or Enter to create · Esc to restart",
    "move": "Move — Free: drag an arrow or a ring · Face: two faces, same direction · Point: a corner onto a point · Module or Panel · Enter confirms · Esc cancels",
    "move.face": "Move · Face — click the face that should move · Esc cancels the whole Move",
    "move.face.target": "Move · Face — click the face it lines up with · same direction · Enter confirms · Esc cancels",
    "move.point": "Move · Point — click the corner that should move · Esc cancels the whole Move",
    "move.point.target": "Move · Point — click the point it lands on · no rotation · Enter confirms · Esc cancels",
    "orient.pick": "Face — click a side of the cabinet; its doors will face that way · Esc to cancel",
    "orient.pending": "Face — orange side is pending · click another side to change · click elsewhere or Enter to confirm · Esc restores",
    "nose.ready": "Bedroom fills the nose at the preset depth — click to drag its room-side face · Enter takes it as shown · digits type the depth · Esc cancels",
    "nose.drag": "Drag the room-side face along the van · snaps to roof breaks, the seam and cabinet faces · type “From front” · click or Enter to create · Esc cancels",
    "bedbox.width": "Bed Box — width: move sideways, the line grows symmetrically from the centre line · type W · click or Enter to lock · Esc cancels",
    "bedbox.depth": "Bed Box — length: pull into the room from the body face · snaps to cabinet faces · type D · click or Enter to create · Esc cancels",
    "plane.pick": "Plane — click a wall or a cabinet face to offset from · Esc cancels",
    "plane.offset": "Plane — pull a parallel copy into the room · type Offset · snaps to faces · click or Enter to place · Esc cancels",
  };
  $("#modeHint").textContent = loungeStep
    ? `Lounge ${getLoungeStyle()} — ${LOUNGE_HINT[loungeStep] || ""}`
    : (HINTS[mode] || "");
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
const DRAWER_H_KEY = "cablab.drawerH";
const DRAWER_MIN = 120;
const savedDrawerH = Number(localStorage.getItem(DRAWER_H_KEY));
if (savedDrawerH >= DRAWER_MIN) {
  document.documentElement.style.setProperty("--drawer-h", `${savedDrawerH}px`);
}
$("#drawerToggle").addEventListener("click", () => drawer.classList.toggle("collapsed"));
$("#drawerResize").addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || drawer.classList.contains("collapsed")) return;
  e.preventDefault();
  const startY = e.clientY;
  const startH = drawer.getBoundingClientRect().height;
  const max = Math.max(DRAWER_MIN, drawer.parentElement.getBoundingClientRect().height - 80);
  drawer.classList.add("resizing");
  e.currentTarget.setPointerCapture(e.pointerId);
  const move = (ev) => {
    const next = Math.min(max, Math.max(DRAWER_MIN, startH + (startY - ev.clientY)));
    document.documentElement.style.setProperty("--drawer-h", `${Math.round(next)}px`);
  };
  const up = (ev) => {
    drawer.classList.remove("resizing");
    try { e.currentTarget.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
    localStorage.setItem(DRAWER_H_KEY, String(Math.round(drawer.getBoundingClientRect().height)));
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
  };
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
});
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
  const sub = job.getSubSelection();
  // module → board → face, e.g. "cab-1 (Overhead) › BP › inside"
  const subPath = sub ? ` › ${sub.boardId}${sub.face ? ` › ${faceLabel(sub.face)} (${sub.face.id})` : ""}` : "";
  $("#stSelection").textContent = sel ? `Selection: ${sel.id} (${MODULES[sel.moduleId].label})${subPath}` : "Selection: —";
  const path = job.getFilePath();
  const name = path ? path.split(/[\\/]/).pop() : "Untitled";
  $("#stFile").textContent = job.isDirty() ? `${name} · unsaved` : name;
  document.title = `${job.isDirty() ? "• " : ""}${name} — The Cab Lab`;
  $('[data-action="undo"]').disabled = !job.canUndo();
  $('[data-action="redo"]').disabled = !job.canRedo();
  $('[data-action="move"]').disabled = !sel;
  $('[data-action="move"]').classList.toggle("active", getMode().startsWith("move"));
  // Face: not for modules with a fixed door side (an overhead's doors always face the room).
  const orientable = job.getJob().cabinets.some((c) => !MODULES[c.moduleId].noOrient);
  $('[data-action="orient"]').disabled = sel ? !!MODULES[sel.moduleId].noOrient : !orientable;
  $('[data-action="orient"]').title = sel && MODULES[sel.moduleId].noOrient
    ? `Face — ${MODULES[sel.moduleId].label} has one door side (toward the room)`
    : "Face (O) — click a side; doors face that way · Enter confirms · Esc restores";
  $('[data-action="orient"]').classList.toggle("active", getMode().startsWith("orient"));
  $('[data-action="plane"]').disabled = !job.hasSpace();
  $('[data-action="plane"]').classList.toggle("active", getMode().startsWith("plane"));
  const pl = job.getSelectedPlane();
  if (pl) $("#stSelection").textContent = `Selection: ${pl.id} (Plane)`;
  const wall = job.getSelectedWall();
  if (wall) $("#stSelection").textContent = `Selection: ${wall.id} (Partition)`;
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
  orient: () => startOrient(),
  plane: () => startPlane(),
};
$$("[data-action]").forEach((btn) => {
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
  syncPlanes();
  syncWalls();
  maybeRenderPanel();
  renderTree();
  refreshRail();
  refreshStatus();
}

$("[data-define-space]").addEventListener("click", () => openSpaceDialog());

job.onChange(refreshAll);
onModeChange(() => { refreshRail(); refreshStatus(); });
refreshAll();
setView("3d");
// User defaults (settings.json) must be in memory before the dialog offers them.
await loadSettings();
if (!job.hasSpace()) openSpaceDialog();
