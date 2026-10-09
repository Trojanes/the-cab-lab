// --- L3: board editor ----------------------------------------------------------------------------
import { $, $$, cur, h, saveState, tab } from "./core.js";
import { boardEditable, cornerOf, dragPoint, exitMode, placementRule } from "./modes.js";
import { paintSelection, select } from "./view3d.js";
import { highlight, renderSelection } from "./selection.js";
import { MODULES } from "../modules.js";
import { log } from "../log.js";
import { CORNER_NAMES } from "./ruleText.js";
import { entryOf } from "./provenance.js";
import { planeAxes } from "../gen/pins.js";
import { boardPoints, renderBoard2D } from "./board2d.js";

export function enterL3(boardId) {
  const t = tab();
  if (t.mode) exitMode();
  t.l3 = boardId;
  if (!t.selection || t.selection.id !== boardId) t.selection = { kind: "board", id: boardId };
  log("bench.board.open", { module: t.moduleId, id: boardId });
  $("#bcenter").classList.add("l3");
  $("#board2d").classList.remove("hidden");
  paintSelection();
  renderSelection();
  renderCrumb();
  renderL3();
  saveState();
}
export function exitL3() {
  const t = tab();
  if (!t) return;
  t.l3 = null;
  t.tryout = null;
  t.l3Error = null;
  t.l3Group = null;
  t.l3Corner = null;
  $("#bcenter").classList.remove("l3");
  $("#board2d").classList.add("hidden");
  paintSelection();
  renderSelection();
  renderCrumb();
  saveState();
}
export function renderL3() {
  const t = tab();
  const c = cur();
  const on = !!(t && t.l3 && c && c.boards.get(t.l3));
  $("#bcenter").classList.toggle("l3", on);
  $("#board2d").classList.toggle("hidden", !on);
  if (!on) return;
  const b = c.boards.get(t.l3);
  $("#b2dTitle").textContent = `${b.id} · ${b.name} · ${b.profilePlane}`;
  $("#b2dFrame").value = t.frame;
  $("#b2dLabels").checked = t.labels;
  const selKey = t.selection && t.selection.id === b.id
    ? (t.selection.kind === "face" ? t.selection.key : t.selection.kind === "point" ? t.selection.keys[0] : null)
    : null;
  const editable = boardEditable(b.id);
  const marked = new Set();
  const extraPoints = [];
  const rule = placementRule(b.id);
  if (editable && rule?.outline) {
    const found = new Set();
    for (const p of boardPoints(b, c.prov, c.result.features || [])) {
      if (p.kind !== "outline") continue;
      const k = cornerOf(b, p);
      if (k) { found.add(k); p.keys.forEach((key) => key && marked.add(key)); }
    }
    // A corner a notch cut away is still a control point: its own handle at the corner's place.
    const [A, B] = planeAxes(b.profilePlane);
    const fa = entryOf(c.prov, `${b.id}.frame.${A}0`)?.value ?? b[`${A}0`];
    const fb = entryOf(c.prov, `${b.id}.frame.${B}0`)?.value ?? b[`${B}0`];
    for (const k of Object.keys(rule.outline.corners)) {
      if (found.has(k)) continue;
      const u = entryOf(c.prov, `${b.id}.corner.${k}.u`)?.value;
      const v = entryOf(c.prov, `${b.id}.corner.${k}.v`)?.value;
      if (u == null || v == null) continue;
      extraPoints.push({ kind: "control", corner: k, label: `${CORNER_NAMES[k] || k}（被缺口切掉）`, keys: [`${b.id}.corner.${k}.u`, `${b.id}.corner.${k}.v`], local: [fa + u - b[`${A}0`], fb + v - b[`${B}0`]], cabinet: [fa + u, fb + v] });
    }
  }
  renderBoard2D($("#b2dSvg"), {
    board: b, prov: c.prov, features: c.result.features || [], frame: t.frame, selectedKey: highlight ? null : selKey, labels: t.labels,
    tryout: t.tryout && t.tryout.key.startsWith(`${b.id}.`) ? t.tryout : null,
    marked: editable ? marked : null,
    extraPoints,
    highlightGroup: t.l3Group || null,
    onDrag: editable ? (p, du, dv) => dragPoint(b, p, du, dv) : null,
    onPickRect: editable ? (rc) => {
      if (!rc.group) return;
      t.l3Group = rc.group;
      renderL3();
      const fid = rc.group.slice(b.id.length + 1);
      $(`#selPanel input[data-feature="${fid}"]`)?.focus();
    } : null,
    onPick: (p) => {
      if (!p) { select({ kind: "board", id: b.id }); return; }
      if (p.kind === "corner") { select({ kind: "face", id: b.id, key: p.keys[0], corner: p }); return; }
      if (editable && (p.kind === "outline" || p.kind === "control")) t.l3Corner = cornerOf(b, p);
      select({ kind: "point", id: b.id, keys: p.keys, label: p.label, pkind: p.kind, local: p.local, cabinet: p.cabinet });
    },
  });
  if (highlight) {
    // Paint highlighted points in the SVG as selected.
    for (const circle of $$("#b2dSvg .b2d-pt")) circle.classList.remove("sel");
  }
}
$("#b2dBack").addEventListener("click", exitL3);
$("#b2dInset").addEventListener("change", (e) => { $("#bcenter").classList.toggle("no-inset", !e.target.checked); });
$("#b2dFrame").addEventListener("change", (e) => { tab().frame = e.target.value; log("bench.board.frame", { module: tab().moduleId, id: tab().l3, frame: e.target.value }); renderL3(); saveState(); });
$("#b2dLabels").addEventListener("change", (e) => { tab().labels = e.target.checked; renderL3(); saveState(); });
if (typeof ResizeObserver === "function") new ResizeObserver(() => { if (tab()?.l3) renderL3(); }).observe($("#b2dSvg"));

export function renderCrumb() {
  const t = tab();
  const c = cur();
  const el = $("#crumb");
  el.replaceChildren();
  if (!t) return;
  const mod = h("b", { text: MODULES[t.moduleId]?.label || t.moduleId });
  el.append(mod, h("span", { text: " › " }), h("span", { text: t.presetId || "custom" }));
  if (t.l3) {
    const back = h("a", { text: ` › ${t.l3} › 板件编辑`, onclick: exitL3, title: "Back to the assembly" });
    el.append(back);
  }
  if (t.mode) el.append(h("a", { text: ` › ${t.mode.board} › ${t.mode.kind === "default" ? "默认模式" : "面的模式"}`, onclick: exitMode, title: "返回整体（Esc）" }));
  void c;
}
