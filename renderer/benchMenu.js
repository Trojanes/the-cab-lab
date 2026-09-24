// Entry points into the generator bench from the main window: right-click a
// module on the rail → "Generator rules…", right-click a placed cabinet →
// open the bench with that cabinet's params. Developer tool; nothing here
// touches the job.
import * as THREE from "three";
import { canvas, rayFromClient } from "./space.js";
import { pickables } from "./cabinets3d.js";
import { MODULES } from "./modules.js";
import * as job from "./job.js";
import { log } from "./log.js";

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
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
  const ray = rayFromClient(e.clientX, e.clientY);
  const rc = new THREE.Raycaster(ray.origin, ray.direction);
  const hit = rc.intersectObjects(pickables(), false).find((h) => h.object.userData.kind === "board");
  if (!hit) return;
  const cab = job.getJob().cabinets.find((c) => c.id === hit.object.userData.cabId);
  if (!cab) return;
  const mod = MODULES[cab.moduleId];
  showContextMenu(e.clientX, e.clientY, [
    { title: `${cab.id} · ${mod ? mod.label : cab.moduleId}` },
    { label: "Open in bench with these params", run: () => openBench(cab.moduleId, { params: cab.params, cabinetId: cab.id, from: "cabinet" }) },
    { label: "Generator rules…", run: () => openBench(cab.moduleId, { from: "cabinet" }) },
  ]);
});
