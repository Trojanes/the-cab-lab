// Entry points into the generator bench from the main window: right-click a
// module on the rail → "Generator rules…", right-click a placed cabinet →
// open the bench with that cabinet's params. Developer tool; nothing here
// touches the job.
import * as THREE from "three";
import { canvas, rayFromClient } from "./space.js";
import { pickables } from "./cabinets3d.js";
import { wallPickables } from "./walls3d.js";
import { MODULES } from "./modules.js";
import { otherDoorColor } from "./materials.js";
import * as job from "./job.js";
import { log } from "./log.js";
import { startFitPick, cancelFitPick, isFitPicking, boardRightClick } from "./interact.js";
import { exportStep } from "./export3d.js";
import { waterfallPlan, partitionPlan } from "./waterfall.js";
import { showChoice, showControlPanelForm } from "./quickCard.js";
import { overheadEndPanel, kitchenWaterfallSide, isBaseCabinet } from "./modules.js";

const bridge = window.cablab || null;

const menu = document.createElement("div");
menu.id = "ctxMenu";
menu.className = "ctx hidden";
document.body.append(menu);

function hide() { menu.classList.add("hidden"); }
/** Shared right-click menu (rail, a placed cabinet, the browser). */
export function showContextMenu(x, y, items) { show(x, y, items); }
function show(x, y, items) {
  menu.replaceChildren(...items.map((it) => {
    if (it.title) {
      const d = document.createElement("div");
      d.className = "ctx-title";
      d.textContent = it.title;
      return d;
    }
    const b = document.createElement("button");
    b.textContent = it.label;
    b.disabled = !!it.disabled;
    if (it.tip) b.title = it.tip;
    if (it.danger) b.classList.add("danger");
    b.addEventListener("click", () => { hide(); it.run(); });
    return b;
  }));
  menu.classList.remove("hidden");
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 6)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 6)}px`;
}
window.addEventListener("pointerdown", (e) => { if (!menu.contains(e.target)) hide(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") hide(); });
window.addEventListener("blur", hide);

/** Open the bench for a module, optionally with a placed cabinet's params. */
export function openBench(moduleId, { params = null, cabinetId = null, from = "rail" } = {}) {
  if (!bridge || !bridge.openBench) { console.warn("[bench] bridge unavailable"); return; }
  log("bench.open.request", { module: moduleId, cabinetId, from });
  bridge.openBench({ moduleId, params, cabinetId, from });
}

/** Delete from the right-click menu. A multi-selection that contains this cabinet goes in one step, same as the Delete key. */
export function deleteCabinetItem(cab, where) {
  return {
    label: "Delete",
    danger: true,
    run: () => {
      const ids = job.getSelectedIds();
      if (ids.length > 1 && ids.includes(cab.id)) {
        log("key.delete", { id: cab.id, ids, how: "menu", where });
        job.removeCabinets(ids);
      } else {
        log("key.delete", { id: cab.id, how: "menu", where });
        job.removeCabinet(cab.id);
      }
    },
  };
}
/** "Use the other door colour", or null when the job has only one. */
export function doorColorMenuItem(cab) {
  const choice = otherDoorColor(cab.params, job.getFinish());
  if (!choice.enabled) return null;
  return {
    label: `Door colour ${choice.other} · ${choice.name}`,
    run: () => job.setColorSlot(cab.id, choice.other),
  };
}

const mm = (v) => `${Math.round(Math.abs(v) * 10) / 10} mm`;

/** Which column / zone takes a thickness difference: asked only when there is a choice. */
async function pickShare(x, y, who, items, delta, noun) {
  const okIdx = items.findIndex((it) => it.ok);
  if (items.length < 2 || Math.abs(delta) < 0.05) return okIdx;
  const verb = delta < 0 ? "gives" : "gains";
  const v = await showChoice(x, y, `${who}: which ${noun} ${verb} ${mm(delta)}?`, items.map((it, i) => ({
    label: `${noun[0].toUpperCase()}${noun.slice(1)} ${i + 1} · ${Math.round(it.width)} mm`,
    value: i,
    disabled: !it.ok,
    title: it.ok ? `${Math.round(it.width)} → ${Math.round(it.width + delta)} mm` : `This ${noun} cannot give ${mm(delta)} and stay at least 150`,
  })));
  return v == null ? null : v;
}

/**
 * Change to waterfall: the fitted partition becomes the kitchen's waterfall and
 * the overhead's end panel. The thickness differences come from the stock; the
 * user picks the column that gives and the zone that gains when there is more than one.
 */
async function runChangeToWaterfall(wall, x, y) {
  const plan = waterfallPlan(wall, { stock: job.getStock(), cabinets: job.getJob().cabinets });
  if (!plan.ok) return;
  const column = await pickShare(x, y, plan.kitchen.id, plan.kitchen.columns, plan.kitchen.delta, "column");
  if (column == null) return;
  const zone = await pickShare(x, y, plan.overhead.id, plan.overhead.zones, plan.overhead.delta, "zone");
  if (zone == null) return;
  job.changeToWaterfall(wall.id, { column, zone, how: "menu" });
}

/** Change to partition: from the kitchen waterfall or the overhead end panel; the other must line up. */
async function runChangeToPartition(cab, x, y) {
  const plan = partitionPlan(cab, { stock: job.getStock(), cabinets: job.getJob().cabinets });
  if (!plan.ok) return;
  const column = await pickShare(x, y, plan.kitchen.id, plan.kitchen.columns, plan.kitchen.delta, "column");
  if (column == null) return;
  const zone = await pickShare(x, y, plan.overhead.id, plan.overhead.zones, plan.overhead.delta, "zone");
  if (zone == null) return;
  job.changeToPartition(cab.id, { column, zone, how: "menu" });
}

/** "Add Control Panel…" on a partition, or on an overhead's end panel. */
async function runAddControlPanel(targetId, title, x, y) {
  const rec = await showControlPanelForm(x, y, { title: `Control panel · ${title}` });
  if (!rec) return;
  job.addControlPanel(targetId, rec, { how: "menu" });
}

/** The partition menu items for the waterfall conversion and the control panel. */
export function wallExtraItems(wall, x, y) {
  const plan = waterfallPlan(wall, { stock: job.getStock(), cabinets: job.getJob().cabinets });
  return [
    { label: "Change to waterfall", disabled: !plan.ok, tip: plan.ok ? "The partition becomes the kitchen's waterfall and the overhead's end panel; its outer face stays." : plan.reason, run: () => runChangeToWaterfall(wall, x, y) },
    { label: "Add Control Panel…", tip: "A screen recessed through this partition and the overhead behind it.", run: () => runAddControlPanel(wall.id, wall.id, x, y) },
  ];
}

/** The cabinet menu items for the reverse conversion and the control panel ([] when the module has neither). */
export function cabinetExtraItems(cab, x, y) {
  const kitchenFall = kitchenWaterfallSide(cab.params);
  const endPanel = cab.moduleId === "overheadCabinet" ? overheadEndPanel(cab.params) : null;
  if (!kitchenFall && !endPanel) return [];
  const plan = partitionPlan(cab, { stock: job.getStock(), cabinets: job.getJob().cabinets });
  const items = [
    { label: "Change to partition", disabled: !plan.ok, tip: plan.ok ? "The waterfall and the end panel become one fitted partition on the same outer face." : plan.reason, run: () => runChangeToPartition(cab, x, y) },
  ];
  if (endPanel) items.push({ label: "Add Control Panel…", tip: "A screen recessed through the end panel, the end divider and backing boards.", run: () => runAddControlPanel(cab.id, `${cab.id} end panel`, x, y) });
  else items.push({ label: "Add Control Panel…", disabled: true, tip: "The waterfall is bench stock mitred to the bench top; a control panel goes on the overhead's end panel or a partition." });
  return items;
}

/** Attach the right-click menu to a rail module button. */
export function railContext(button, moduleId) {
  button.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    const mod = MODULES[moduleId];
    showContextMenu(e.clientX, e.clientY, [
      { title: mod ? mod.label : moduleId },
      { label: "Generator rules…", run: () => openBench(moduleId, { from: "rail" }) },
    ]);
  });
}

// Right-click on a placed cabinet. OrbitControls pans with the right button, so
// only a click without movement opens the menu.
let rightDown = null;
canvas.addEventListener("pointerdown", (e) => { if (e.button === 2) rightDown = { x: e.clientX, y: e.clientY }; });
canvas.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  const d = rightDown;
  rightDown = null;
  if (isFitPicking()) { cancelFitPick("right-click"); return; }
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
  if (boardRightClick()) return;
  const ray = rayFromClient(e.clientX, e.clientY);
  const rc = new THREE.Raycaster(ray.origin, ray.direction);
  const hits = rc.intersectObjects([...pickables(), ...wallPickables()], false);
  const first = hits[0];
  const ud = first && first.object.userData;
  if (ud && (ud.kind === "wall" || ud.wallId)) {
    const wall = job.getWall(ud.wallId);
    if (!wall) return;
    const cabs = job.getJob().cabinets;
    const ready = cabs.some((c) => c.moduleId === "overheadCabinet") && cabs.some((c) => isBaseCabinet(c.moduleId) || c.moduleId === "loungeGenerator");
    const items = [
      { title: wall.id },
      { label: wall.hidden ? "Show" : "Hide", run: () => job.toggleWallVisible(wall.id) },
      { label: "Fit to cabinets", disabled: !ready, run: () => startFitPick(wall.id) },
    ];
    if (wall.fit) items.push({ label: "Clear cabinet fit", run: () => job.setWallFit(wall.id, null, "clear") });
    items.push(...wallExtraItems(wall, e.clientX, e.clientY));
    items.push({
      label: "Delete",
      danger: true,
      run: () => {
        log("key.delete", { id: wall.id, how: "menu", where: "3d" });
        job.removeWall(wall.id);
      },
    });
    showContextMenu(e.clientX, e.clientY, items);
    return;
  }
  const hit = hits.find((h) => h.object.userData.kind === "board");
  if (!hit) return;
  const cab = job.getJob().cabinets.find((c) => c.id === hit.object.userData.cabId);
  if (!cab) return;
  const mod = MODULES[cab.moduleId];
  showContextMenu(e.clientX, e.clientY, [
    { title: `${cab.id} · ${mod ? mod.label : cab.moduleId}` },
    doorColorMenuItem(cab),
    ...cabinetExtraItems(cab, e.clientX, e.clientY),
    { label: "Export 3D as STEP…", run: () => {
      const ids = job.getSelectedIds();
      exportStep(ids.includes(cab.id) ? ids : [cab.id]);
    } },
    { label: "Open in bench with these params", run: () => openBench(cab.moduleId, { params: cab.params, cabinetId: cab.id, from: "cabinet" }) },
    { label: "Generator rules…", run: () => openBench(cab.moduleId, { from: "cabinet" }) },
    deleteCabinetItem(cab, "3d"),
  ].filter(Boolean));
});
