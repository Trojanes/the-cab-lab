// @module bench @owns status footer — errors/warnings/pins
// --- status counts (errors, warnings, pins) — the footer, not a drawer -------------------
import { refresh } from "./bench.js";
import { $, bench, cur, h, tab, writePresets } from "./core.js";
import { jointObjs } from "./view3d.js";
import { renderL3 } from "./l3.js";
import { log } from "../log.js";
import { checkPins, collectPins, countPins, mergePins, pinsForBoard } from "../gen/pins.js";
import { separation } from "./explode.js";

export function renderBottom() {
  const t = tab();
  const c = cur();
  if (!t || !c) { setBadges(null); return; }
  const r = c.result;
  let errN = (r.validation?.errors || []).length;
  let warnN = (r.validation?.warnings || []).length;

  const declared = new Set();
  const joints = jointObjs.length ? jointObjs : (r.relationshipDeclarations || []).map((d, index) => ({ decl: d, index, sep: NaN, status: "gap" }));
  for (const j of joints) {
    declared.add([j.decl.panelAId, j.decl.panelBId].sort().join("|"));
    if (j.status === "gap") warnN += 1;
    else if (j.status !== "ok") errN += 1;
  }
  const boards = r.boards;
  for (let i = 0; i < boards.length; i += 1) {
    for (let k = i + 1; k < boards.length; k += 1) {
      const a = boards[i], b = boards[k];
      if (declared.has([a.id, b.id].sort().join("|"))) continue;
      const sep = separation(a, b);
      if (sep > -0.01) continue;
      if (a.category === "front_panel" || b.category === "front_panel") continue;
      const outlined = (x) => (x.cutProfileVector && x.cutProfileVector.length) || (x.profileVector && x.profileVector.length);
      if (outlined(a) || outlined(b)) continue;
      warnN += 1;
    }
  }

  const pins = presetPins();
  let pinCount = 0;
  let pinDiff = 0;
  if (pins) {
    pinDiff = checkPins(r, pins).length;
    pinCount = countPins(pins);
    warnN += pinDiff;
  }
  setBadges({ errN, warnN, pins: pins ? { count: pinCount, diff: pinDiff } : null });
}

/** Status-bar badges: errors / warnings / pins, so nothing needs opening to know the state. */
export function setBadges(s) {
  const row = $("#stBadges");
  row.replaceChildren();
  if (!s) return;
  row.append(h("span", { class: `badge${s.errN ? " err" : " ok"}`, text: s.errN ? `${s.errN} error${s.errN > 1 ? "s" : ""}` : "no errors" }));
  if (s.warnN) row.append(h("span", { class: "badge warn", text: `${s.warnN} to check` }));
  if (s.pins) row.append(h("span", { class: `badge${s.pins.diff ? " warn" : " ok"}`, text: s.pins.diff ? `${s.pins.diff} / ${s.pins.count} pins differ` : `${s.pins.count} pins ok` }));
}

export function presetPins() {
  const t = tab();
  const c = cur();
  const p = c?.presets?.presets.find((x) => x.id === t?.presetId);
  return p ? p.pins || {} : null;
}
export async function pinBoard(boardId) {
  const t = tab();
  const c = cur();
  if (!bench) return;
  const preset = c.presets.presets.find((p) => p.id === t.presetId);
  if (!preset) { window.alert("Pins belong to a preset. Save the params as a preset first."); return; }
  const add = pinsForBoard(c.result, boardId);
  preset.pins = mergePins(preset.pins || {}, add);
  if (await writePresets(c)) {
    log("bench.pin", { module: t.moduleId, preset: preset.id, what: "board", id: boardId, count: countPins(add), faces: add.boards?.[boardId] || null });
    refresh();
  }
}
export async function pinAll() {
  const t = tab();
  const c = cur();
  if (!bench || !t || !c) return;
  const preset = c.presets.presets.find((p) => p.id === t.presetId);
  if (!preset) { window.alert("Pins belong to a preset. Save the params as a preset first."); return; }
  if (!window.confirm(`Pin every face, outline point and hinge of this result into "${preset.id}"? This declares the current numbers correct.`)) return;
  preset.pins = collectPins(c.result);
  if (await writePresets(c)) {
    log("bench.pin", { module: t.moduleId, preset: preset.id, what: "all", count: countPins(preset.pins) });
    refresh();
  }
}

// --- panes: [ hides parameters / rules; remembered ------------------------------------------
const PANES_KEY = "cablab.bench.panes";
let panes = { left: true };
try { panes = { left: JSON.parse(localStorage.getItem(PANES_KEY) || "{}").left !== false }; } catch (_) { /* defaults */ }
function applyPanes() {
  $("#bench").classList.toggle("no-left", !panes.left);
  $("#leftToggle").classList.toggle("active", panes.left);
  try { localStorage.setItem(PANES_KEY, JSON.stringify({ left: panes.left })); } catch (_) { /* not persisted */ }
  if (tab()?.l3) renderL3();
}
export function togglePane(which) {
  panes[which] = !panes[which];
  log("bench.pane", { pane: which, open: panes[which] });
  applyPanes();
}
$("#leftToggle").addEventListener("click", () => togglePane("left"));
applyPanes();

// Popovers: "⋯" (opacity, section planes, what is drawn) and "Explode ▾" (mode, trails, labels, order).
function bindPop(toggleSel, popSel) {
  const toggle = $(toggleSel);
  const pop = $(popSel);
  toggle.addEventListener("click", () => {
    const open = pop.classList.toggle("hidden");
    toggle.classList.toggle("active", !open);
  });
  window.addEventListener("pointerdown", (e) => {
    if (!pop.contains(e.target) && e.target !== toggle && !toggle.contains(e.target)) {
      pop.classList.add("hidden");
      toggle.classList.remove("active");
    }
  });
}
bindPop("#moreToggle", "#morePop");
bindPop("#explodeToggle", "#explodePop");
