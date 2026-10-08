// Export 3D: the selected cabinets as one STEP file for Fusion.
// The top bar opens a checklist. A right-click exports the current set when
// the cabinet under the cursor is in it, otherwise just that cabinet.
import * as job from "./job.js";
import { getModule } from "./modules.js";
import { buildStep } from "./gen/step.js";
import { log } from "./log.js";

const bridge = window.cablab || null;

function stem() {
  const current = job.getFilePath();
  return current ? current.replace(/\.json$/i, "") : "job";
}

/** Write `ids` (cabinet ids) to a .stp. Hidden boards are included. CNC checks do not block it. */
export async function exportStep(ids) {
  if (!bridge?.saveStep) { console.warn("[export] file bridge unavailable"); return; }
  const wanted = [...new Set(ids)].filter(Boolean);
  const cabinets = [];
  const empty = [];
  for (const id of wanted) {
    const cab = job.getJob().cabinets.find((c) => c.id === id);
    if (!cab) continue;
    const boards = job.resultFor(cab.id)?.boards || [];
    if (!boards.length) { empty.push(id); continue; }
    cabinets.push({
      id: cab.id,
      pose: cab.pose,
      boards,
      overrides: cab.overrides?.boards,
    });
  }
  if (!cabinets.length) {
    window.alert(empty.length ? `Nothing to export.\n\n${empty.join(", ")} has no boards.` : "Nothing to export.");
    return;
  }
  const built = buildStep({ cabinets });
  if (!built.ok) {
    const why = built.skipped.map((s) => `${s.cabinetId}/${s.boardId}: ${s.reason}`);
    window.alert(`Cannot export:\n\n${why.slice(0, 12).join("\n") || "no solid"}`);
    return;
  }
  const path = await bridge.saveStep(`${stem()}.stp`, built.text);
  if (!path) return;
  log("file.export.step", {
    path,
    cabinets: cabinets.map((c) => c.id),
    boards: built.boardCount,
    skipped: built.skipped.map((s) => `${s.cabinetId}/${s.boardId}`),
  });
  const skip = built.skipped.length
    ? `\n\nSkipped:\n${built.skipped.slice(0, 8).map((s) => `${s.cabinetId}/${s.boardId}: ${s.reason}`).join("\n")}`
    : "";
  const more = built.skipped.length > 8 ? `\n… and ${built.skipped.length - 8} more` : "";
  window.alert(`Exported ${built.boardCount} boards from ${cabinets.length} cabinet${cabinets.length === 1 ? "" : "s"}.${skip}${more}`);
}

/** Checklist of every placed cabinet. The current selection starts ticked; with nothing selected, all of them do. */
export function openExport3d() {
  const cabs = job.getJob().cabinets;
  if (!cabs.length) { window.alert("Nothing placed yet."); return; }
  const selected = new Set(job.getSelectedIds());
  const preset = selected.size ? selected : new Set(cabs.map((c) => c.id));

  const overlay = document.createElement("div");
  overlay.className = "modal";
  const card = document.createElement("div");
  card.className = "modal-card export-card";
  const title = document.createElement("div");
  title.className = "modal-title";
  title.textContent = "Export 3D";
  const sub = document.createElement("div");
  sub.className = "modal-sub";
  sub.textContent = "STEP for Fusion. Hinge cups, grooves and LED channels are already cut. One file.";
  const list = document.createElement("div");
  list.className = "export-list";
  const boxes = [];
  for (const cab of cabs) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = preset.has(cab.id);
    box.dataset.id = cab.id;
    const mod = getModule(cab.moduleId);
    const text = document.createElement("span");
    const n = job.resultFor(cab.id)?.boards?.length || 0;
    text.textContent = `${mod.label} · ${cab.id}${n ? ` · ${n} boards` : " · no boards"}`;
    label.append(box, text);
    list.append(label);
    boxes.push(box);
  }
  const actions = document.createElement("div");
  actions.className = "modal-actions";
  const all = document.createElement("button");
  all.className = "tb";
  all.textContent = "All";
  const none = document.createElement("button");
  none.className = "tb";
  none.textContent = "None";
  const cancel = document.createElement("button");
  cancel.className = "tb";
  cancel.textContent = "Cancel";
  const go = document.createElement("button");
  go.className = "tb";
  go.textContent = "Export";
  actions.append(all, none, cancel, go);
  card.append(title, sub, list, actions);
  overlay.append(card);
  document.body.append(overlay);

  const close = () => overlay.remove();
  const sync = () => { go.disabled = !boxes.some((b) => b.checked); };
  sync();
  all.addEventListener("click", () => { boxes.forEach((b) => { b.checked = true; }); sync(); });
  none.addEventListener("click", () => { boxes.forEach((b) => { b.checked = false; }); sync(); });
  boxes.forEach((b) => b.addEventListener("change", sync));
  cancel.addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { e.stopPropagation(); close(); }
  });
  go.addEventListener("click", () => {
    const ids = boxes.filter((b) => b.checked).map((b) => b.dataset.id);
    close();
    exportStep(ids);
  });
  card.tabIndex = -1;
  card.focus();
}
