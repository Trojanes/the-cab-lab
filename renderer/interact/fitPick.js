// @module interact @owns wall fit pick — partition to overhead+base
// Fit a partition to an overhead and a base: pick the two cabinets (either
// order), Enter fits the wall. The wall is the job selection while picking.
import * as job from "../job.js";
import { getModule, isBaseCabinet } from "../modules.js";
import { showTip, hideTip } from "../hud.js";
import { log } from "../log.js";
import { cancelBoard } from "../boardSketch.js";
import { cancelMeasure } from "../measureTool.js";
import { host, emitMode, pick, registerMode } from "./shared.js";

let fitPick = null; // { wallId, overheadId, kitchenId, loungeId, radius }

const fitCard = document.createElement("div");
fitCard.id = "fitCard";
fitCard.className = "hidden";
document.getElementById("moveCard").parentElement.append(fitCard);
for (const type of ["pointerdown", "pointerup", "wheel", "contextmenu", "dblclick"]) {
  fitCard.addEventListener(type, (e) => e.stopPropagation());
}

function fitName(id) {
  if (!id) return "click one";
  const cab = job.getJob().cabinets.find((c) => c.id === id);
  const mod = cab ? getModule(cab.moduleId) : null;
  return cab ? `${id} · ${mod ? mod.label : cab.moduleId}` : id;
}

function paintFitCard() {
  if (!fitPick) { fitCard.classList.add("hidden"); return; }
  const ready = !!(fitPick.overheadId && (fitPick.kitchenId || fitPick.loungeId));
  const lower = fitPick.loungeId ? `Lounge — ${fitName(fitPick.loungeId)}` : `Base — ${fitName(fitPick.kitchenId)}`;
  fitCard.replaceChildren(
    elFit("div", "move-card-title", "Fit to cabinets"),
    elFit("div", "move-note", "Click an overhead and a base or a lounge, in either order. Enter fits the wall. Esc cancels."),
    elFit("div", "move-note", `Overhead — ${fitName(fitPick.overheadId)}`),
    elFit("div", "move-note", lower),
  );
  const radiusLabel = document.createElement("label");
  radiusLabel.className = "field";
  radiusLabel.style.display = "flex";
  radiusLabel.style.justifyContent = "space-between";
  radiusLabel.style.alignItems = "center";
  radiusLabel.style.gap = "8px";
  const radiusName = document.createElement("span");
  radiusName.textContent = "Corner radius";
  const radiusInput = document.createElement("input");
  radiusInput.type = "number";
  radiusInput.min = "0";
  radiusInput.step = "1";
  radiusInput.value = String(fitPick.radius);
  radiusInput.style.width = "72px";
  radiusInput.addEventListener("input", () => {
    const v = Number(radiusInput.value);
    if (Number.isFinite(v) && v >= 0) fitPick.radius = v;
  });
  radiusInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); confirmFit("enter"); }
  });
  radiusLabel.append(radiusName, radiusInput);
  fitCard.append(radiusLabel);
  const row = document.createElement("div");
  row.style.display = "flex";
  row.style.gap = "8px";
  const ok = document.createElement("button");
  ok.className = "tb primary";
  ok.textContent = "Fit";
  ok.disabled = !ready;
  ok.addEventListener("click", () => confirmFit("ok"));
  const cancel = document.createElement("button");
  cancel.className = "tb";
  cancel.textContent = "Cancel";
  cancel.addEventListener("click", () => cancelFitPick("cancel"));
  row.append(ok, cancel);
  fitCard.append(row);
  fitCard.classList.remove("hidden");
}

function elFit(tag, cls, text) {
  const n = document.createElement(tag);
  n.className = cls;
  n.textContent = text;
  return n;
}

export function isFitPicking() { return !!fitPick; }

export function startFitPick(wallId) {
  cancelBoard("tool off");
  cancelMeasure("tool off");
  host.stopPlacement?.();
  const existing = job.getWall(wallId);
  const remembered = existing && existing.fit && Number(existing.fit.radius);
  fitPick = { wallId, overheadId: null, kitchenId: null, loungeId: null, radius: Number.isFinite(remembered) && remembered >= 0 ? remembered : 50 };
  job.select(wallId);
  log("wall.fit.start", { id: wallId });
  paintFitCard();
  emitMode();
}

export function cancelFitPick(how = "esc") {
  if (!fitPick) return;
  const id = fitPick.wallId;
  fitPick = null;
  fitCard.classList.add("hidden");
  log("wall.fit.cancel", { id, how });
  hideTip();
  emitMode();
}

function confirmFit(how) {
  if (!fitPick || !fitPick.overheadId || !(fitPick.kitchenId || fitPick.loungeId)) return;
  const picked = fitPick;
  fitPick = null;
  fitCard.classList.add("hidden");
  job.setWallFit(picked.wallId, { overheadId: picked.overheadId, kitchenId: picked.kitchenId, loungeId: picked.loungeId, radius: picked.radius }, how);
  hideTip();
  emitMode();
}

function onFitClick(e) {
  const hit = pick(e.clientX, e.clientY);
  const cabId = hit && hit.object.userData.cabId;
  const cab = cabId ? job.getJob().cabinets.find((c) => c.id === cabId) : null;
  if (!cab) {
    showTip(e.clientX, e.clientY, ["Click an overhead, a base or a lounge"]);
    return;
  }
  if (cab.moduleId === "overheadCabinet") fitPick.overheadId = cab.id;
  else if (isBaseCabinet(cab.moduleId)) { fitPick.kitchenId = cab.id; fitPick.loungeId = null; }
  else if (cab.moduleId === "loungeGenerator") { fitPick.loungeId = cab.id; fitPick.kitchenId = null; }
  else {
    showTip(e.clientX, e.clientY, ["Fit uses an overhead and a base or a lounge"]);
    log("wall.fit.pick", { id: fitPick.wallId, cabinetId: cab.id, moduleId: cab.moduleId, accepted: false });
    return;
  }
  log("wall.fit.pick", { id: fitPick.wallId, cabinetId: cab.id, moduleId: cab.moduleId, accepted: true });
  paintFitCard();
  emitMode();
}

export const MODE = {
  mode: () => (fitPick ? "fit" : null),
  typing: () => false,
  down(e) { if (!fitPick) return false; onFitClick(e); return true; },
  key(e) {
    if (!fitPick) return false;
    if (e.key === "Enter") { e.preventDefault(); confirmFit("enter"); }
    else if (e.key === "Escape") { e.preventDefault(); cancelFitPick("esc"); }
    return true;
  },
  cancel: () => cancelFitPick("esc"),
  // No stop(): cabinet commands did not cancel a fit pick in the old dispatch —
  // board / groove / measure still cancel it through their own stopOthers.
};
registerMode(MODE);
