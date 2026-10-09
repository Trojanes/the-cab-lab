// @module bench @owns toolbar, context menus, dialogs
// --- context menu ---------------------------------------------------------------------------------
import { draftStep, pickModule } from "./bench.js";
import { $, $$, bench, cur, h, saveState, state, tab } from "./core.js";
import { boardLabel, enterMode, exitMode } from "./modes.js";
import { applyCut, applyExplode, applyOpacity, buildJoints, cabRoot, clearNudge, explodePlan, frameCabinet, jointObjs, logExplode, resetExplodePlan, select, setBenchView, setStep, stepCurrentId, toggleFaceMove, updateLabels, updateTrails } from "./view3d.js";
import { clearHighlight, highlight } from "./selection.js";
import { pinBoard, presetPins, renderBottom, setBadges, togglePane } from "./statusPane.js";
import { enterL3, exitL3 } from "./l3.js";
import { MODULES } from "../modules.js";
import { log } from "../log.js";
import { FACES, entryOf, fmt } from "./provenance.js";
import { planeAxes } from "../gen/pins.js";
import { dirLabel } from "./explode.js";

export function showCtx(x, y) {
  const menu = $("#ctxMenu");
  menu.classList.remove("hidden");
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 6)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 6)}px`;
}
export function hideCtx() { $("#ctxMenu").classList.add("hidden"); }
window.addEventListener("pointerdown", (e) => { if (!$("#ctxMenu").contains(e.target) && e.target !== $("#tabAdd")) hideCtx(); });
export function boardCtx(boardId, x, y) {
  const menu = $("#ctxMenu");
  menu.replaceChildren(
    h("div", { class: "ctx-title", text: `${boardId} · ${boardLabel(boardId)}` }),
    h("button", { text: "参数调试 · 默认模式", onclick: () => { hideCtx(); enterMode("default", boardId); } }),
    h("button", { text: "参数调试 · 面的模式", onclick: () => { hideCtx(); enterMode("face", boardId); } }),
    h("button", { text: "板件编辑", onclick: () => { hideCtx(); exitMode(); enterL3(boardId); } }),
    h("button", { text: "Pin board", onclick: () => { hideCtx(); pinBoard(boardId); } }),
    h("button", { text: "Report…", onclick: () => { hideCtx(); select({ kind: "board", id: boardId }); openReport(); } }),
  );
  showCtx(x, y);
}
$("#tabAdd").addEventListener("click", pickModule);

// --- report ------------------------------------------------------------------------------------------

function openReport() {
  const t = tab();
  const sel = t.selection;
  $("#reportSub").textContent = sel ? `${MODULES[t.moduleId]?.label} · ${t.presetId || "custom"} · ${sel.kind} ${sel.id || `${sel.a}↔${sel.b}`}${sel.key ? ` · ${sel.key}` : ""}` : `${MODULES[t.moduleId]?.label} · ${t.presetId || "custom"} · no selection`;
  $("#reportNote").value = "";
  $("#reportErr").textContent = "";
  $("#reportDialog").classList.remove("hidden");
  $("#reportNote").focus();
}
$("#btnReport").addEventListener("click", openReport);
$("#reportDialog [data-cancel]").addEventListener("click", () => $("#reportDialog").classList.add("hidden"));
$("#reportDialog [data-ok]").addEventListener("click", async () => {
  const note = $("#reportNote").value.trim();
  if (!note) { $("#reportErr").textContent = "Say what is wrong and what it should be."; return; }
  const md = buildReport(note);
  const res = await bench.writeReport(tab().moduleId, md);
  if (!res.ok) { $("#reportErr").textContent = res.error || "write failed"; return; }
  log("bench.report", { module: tab().moduleId, preset: tab().presetId, path: res.path, selection: tab().selection, note });
  $("#reportDialog").classList.add("hidden");
  $("#stInfo").textContent = `Report written: ${res.path}`;
});

function treeText(prov, key, depth = 0, seen = new Set()) {
  const e = entryOf(prov, key);
  if (!e) return `${"  ".repeat(depth)}- ${key}: (no provenance)\n`;
  const terms = Object.entries(e.terms).map(([n, t]) => `${n}=${fmt(t.value)}${t.kind === "rule" ? ` [rule ${t.name}]` : t.kind === "param" ? ` [param ${t.name}]` : t.kind === "ref" ? ` [→ ${t.ref}]` : ""}`).join(", ");
  let out = `${"  ".repeat(depth)}- ${key} = ${fmt(e.value)} = ${e.formula}${terms ? `  (${terms})` : ""}\n`;
  if (depth < 6 && !seen.has(key)) {
    seen.add(key);
    for (const t of Object.values(e.terms)) if (t.kind === "ref" && t.ref) out += treeText(prov, t.ref, depth + 1, seen);
  }
  return out;
}
function buildReport(note) {
  const t = tab();
  const c = cur();
  const sel = t.selection;
  const prov = c.prov;
  const lines = [];
  lines.push(`# Bench report — ${MODULES[t.moduleId]?.label || t.moduleId}`, "");
  lines.push(`- time: ${new Date().toISOString()}`);
  lines.push(`- module: \`${t.moduleId}\` · generator: \`generators/${t.moduleId}/generator.ts\``);
  lines.push(`- preset: \`${t.presetId || "custom"}\` (\`generators/${t.moduleId}/presets.json\`)`);
  lines.push(`- boardFrame: ${c.result.debug?.boardFrame || "—"} · boards: ${c.result.boards.length} · errors: ${c.result.validation?.errors?.length || 0}`, "");
  lines.push("## What the user says", "", note, "");
  if (sel) {
    lines.push("## Selection", "");
    if (sel.kind === "board" || sel.kind === "face") {
      const b = c.boards.get(sel.id);
      lines.push(`Board \`${b.id}\` (${b.name}, ${b.category}, plane ${b.profilePlane}, thickness ${fmt(b.materialThickness)} along ${b.thicknessAxis})`, "");
      lines.push("| face | value | formula | terms |", "|---|---|---|---|");
      for (const f of FACES) {
        const e = entryOf(prov, `${b.id}.${f}`);
        lines.push(`| ${f} | ${fmt(b[f])} | \`${e?.formula || "—"}\` | ${e ? Object.entries(e.terms).map(([n, tm]) => `${n}=${fmt(tm.value)} (${tm.kind}${tm.name ? ` ${tm.name}` : ""}${tm.ref ? ` ${tm.ref}` : ""})`).join(", ") : "—"} |`);
      }
      lines.push("");
      if (sel.kind === "face") { lines.push(`### Dependency tree of \`${sel.key}\``, "", "```", treeText(prov, sel.key).trimEnd(), "```", ""); }
      const pins = presetPins();
      if (pins?.boards?.[b.id]) {
        const diffs = FACES.filter((f) => Math.abs(pins.boards[b.id][f] - b[f]) > 0.01);
        lines.push(diffs.length ? `Pinned values differ: ${diffs.map((f) => `${f} pinned ${fmt(pins.boards[b.id][f])} now ${fmt(b[f])}`).join("; ")}` : "Pinned values match this result.", "");
      }
    } else if (sel.kind === "point") {
      const b = c.boards.get(sel.id);
      const [A, B] = planeAxes(b.profilePlane);
      lines.push(`Point \`${sel.label}\` on \`${b.id}\` (${sel.pkind}) · cabinet ${A} ${fmt(sel.cabinet[0])}, ${B} ${fmt(sel.cabinet[1])} · local ${A} ${fmt(sel.local[0])}, ${B} ${fmt(sel.local[1])}`, "");
      for (const k of sel.keys) if (k) lines.push(`### \`${k}\``, "", "```", treeText(prov, k).trimEnd(), "```", "");
    } else if (sel.kind === "joint") {
      const d = (c.result.relationshipDeclarations || [])[sel.index];
      const j = jointObjs.find((x) => x.index === sel.index);
      lines.push(`Joint \`${d.declarationId}\`: ${d.panelAId} ↔ ${d.panelBId} · ${d.relationshipType} · ${d.geometryType} · rule ${d.ruleId}`);
      if (j) lines.push(`Measured (AABB): ${j.status === "ok" ? "touching" : j.status === "gap" ? `gap ${fmt(j.sep)} mm` : `overlap ${fmt(-j.sep)} mm`}`);
      lines.push("");
    } else if (sel.kind === "key") {
      lines.push(`Quantity \`${sel.key}\``, "", "```", treeText(prov, sel.key).trimEnd(), "```", "");
    }
  }
  if (t.tryout) {
    lines.push("## Tried in the bench", "", `\`${t.tryout.key}\`: \`${entryOf(prov, t.tryout.key)?.formula}\` → \`${t.tryout.expr}\` gives ${fmt(t.tryout.value)} (was ${fmt(t.tryout.from)}).`, "");
  }
  lines.push("## Rules used in this run", "");
  for (const [n, r] of Object.entries(prov.rules || {})) lines.push(`- \`${n}\` = ${fmt(r.value)} — ${r.doc || ""}`);
  lines.push("", "## Params", "", "```json", JSON.stringify(t.params, null, 2), "```", "");
  lines.push("## For the agent", "", "- Read `docs/bench-spec.md` for the provenance keys.", "- Change the formula in the generator, keep the numbers the pins protect, run `node --experimental-strip-types generators/<module>/generator.test.ts`.", "- If a rule constant is the cause, prefer changing it in `rules.json` with a `bench.rule.set` log entry over editing code.", "");
  return lines.join("\n");
}

// --- toolbar --------------------------------------------------------------------------------------------

$$("#viewGroup [data-view]").forEach((btn) => btn.addEventListener("click", () => { setBenchView(btn.dataset.view); log("bench.view", { module: tab()?.moduleId, view: btn.dataset.view }); saveState(); }));
$("#btnFrame").addEventListener("click", frameCabinet);
$("#explode").addEventListener("input", (e) => { tab().explode = Number(e.target.value); applyExplode(); saveState(); });
$("#explode").addEventListener("change", () => logExplode("slider"));
$("#stepPrev").addEventListener("click", () => { const t = tab(); if (!t || !explodePlan) return; setStep(t.step == null ? explodePlan.order.length - 1 : t.step - 1, "step"); });
$("#stepNext").addEventListener("click", () => { const t = tab(); if (!t) return; setStep(t.step == null ? 1 : t.step + 1, "step"); });
$("#stepLabel").addEventListener("click", () => setStep(null, "step"));
$$("#explodeModeGroup [data-mode]").forEach((btn) => btn.addEventListener("click", () => {
  const t = tab();
  if (!t || t.explodeMode === btn.dataset.mode) return;
  t.explodeMode = btn.dataset.mode;
  applyExplode({ animate: true });
  syncToolbar();
  logExplode("mode");
  saveState();
}));
$("#explodeTrails").addEventListener("change", (e) => { tab().trails = e.target.checked; updateTrails(); saveState(); });
$("#explodeLabels").addEventListener("change", (e) => { tab().explodeLabels = e.target.checked; updateLabels(); saveState(); });
/** The order list in the popover: one chip per board, done / current / waiting; click = jump to that step. */
export function renderExplodeOrder() {
  const t = tab();
  const box = $("#explodeOrder");
  box.replaceChildren();
  if (!t || !explodePlan) return;
  explodePlan.order.forEach((id, i) => {
    const p = explodePlan.plan.get(id);
    const state = t.step == null ? "" : i + 1 === t.step ? "cur" : i < t.step ? "done" : "todo";
    box.append(h("button", { class: `chip ${state}`, title: p.fixed ? `${id} · base board` : `${id} slides ${dirLabel(p)} onto ${p.parent}`, onclick: () => setStep(i + 1, "chip") }, [
      h("span", { class: "n", text: String(i + 1) }), h("span", { text: id }), h("span", { class: "dir", text: p.fixed ? "" : dirLabel(p) }),
    ]));
  });
}
$("#opacity").addEventListener("input", (e) => { tab().opacity = Number(e.target.value); applyOpacity(); saveState(); });
for (const ax of ["x", "y", "z"]) {
  $(`#cut${ax.toUpperCase()}`).addEventListener("input", (e) => { tab().cut[ax] = Number(e.target.value); applyCut(); saveState(); });
}
$("#showJoints").addEventListener("change", (e) => { tab().showJoints = e.target.checked; buildJoints(); renderBottom(); saveState(); });
export function syncToolbar() {
  const t = tab();
  if (!t) return;
  $("#explode").value = String(t.explode);
  const N = explodePlan?.order.length ?? 0;
  const curId = stepCurrentId();
  $("#stepLabel").textContent = t.step == null ? "all" : `${t.step} / ${N}${curId ? ` · ${curId}` : ""}`;
  $("#stepLabel").classList.toggle("active", t.step != null);
  $("#stepPrev").disabled = t.step === 0;
  $("#stepNext").disabled = t.step != null && t.step >= N;
  $$("#explodeModeGroup [data-mode]").forEach((b) => b.classList.toggle("active", b.dataset.mode === (t.explodeMode || "assembly")));
  $("#explodeTrails").checked = t.trails !== false;
  $("#explodeLabels").checked = t.explodeLabels !== false;
  renderExplodeOrder();
  $("#opacity").value = String(t.opacity);
  $("#cutX").value = String(t.cut.x); $("#cutY").value = String(t.cut.y); $("#cutZ").value = String(t.cut.z);
  $("#showJoints").checked = t.showJoints;
  $$("#viewGroup [data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === (t.view || "3d")));
}

window.addEventListener("keydown", (e) => {
  if (e.target && (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable)) return;
  if ((e.ctrlKey || e.metaKey) && (e.key === "z" || e.key === "Z")) { e.preventDefault(); draftStep(e.shiftKey ? "redo" : "undo"); return; }
  if ((e.ctrlKey || e.metaKey) && (e.key === "y" || e.key === "Y")) { e.preventDefault(); draftStep("redo"); return; }
  if (e.key === "Escape") {
    if (!$("#reportDialog").classList.contains("hidden")) { $("#reportDialog").classList.add("hidden"); return; }
    if (!$("#ruleDialog").classList.contains("hidden")) { $("#ruleDialog [data-cancel]").click(); return; }
    if (!$("#layoutDialog").classList.contains("hidden")) { $("#layoutDialog").classList.add("hidden"); return; }
    if (highlight) { clearHighlight(); $("#stInfo").textContent = ""; return; }
    if (tab()?.faceMove) { toggleFaceMove(); return; }
    if (tab()?.nudge) { clearNudge(); return; }
    if (tab()?.mode) { exitMode(); return; }
    if (tab()?.selection) { select(null); return; }
    if (tab()?.l3) exitL3();
  }
  if ((e.key === "m" || e.key === "M") && tab()?.mode?.kind === "face") { e.preventDefault(); toggleFaceMove(); return; }
  if (e.key === "f" || e.key === "F") frameCabinet();
  if (e.key === "[") togglePane("left");
  // Assembly steps: ← takes the last board out, → puts the next one in.
  if (e.key === "ArrowRight" && tab() && !tab().l3) { e.preventDefault(); setStep(tab().step == null ? 1 : tab().step + 1, "key"); }
  if (e.key === "ArrowLeft" && tab() && !tab().l3 && explodePlan) { e.preventDefault(); setStep(tab().step == null ? explodePlan.order.length - 1 : tab().step - 1, "key"); }
});

export function renderEmpty() {
  $("#selPanel").replaceChildren(h("div", { class: "panel-head" }, [h("div", { class: "panel-title", text: "Generator bench" }), h("div", { class: "panel-sub", text: "Open a generator with + or from the app's module rail (right-click → Generator rules…)." })]));
  $("#rulesList").replaceChildren();
  $("#stInfo").textContent = "—";
  setBadges(null);
  cabRoot.clear();
  resetExplodePlan();
  $("#explodeOrder").replaceChildren();
}

