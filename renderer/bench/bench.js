// @module bench @owns bench shell — tabs, rules list, draft commit, presets, __bench api, boot
// Generator bench (docs/bench-spec.md). One tab per generator + preset; the
// 3D view, the board list and the selection panel all read one generator
// result and its `debug.provenance`. The bench writes rules.json, pins in
// presets.json, reports and log events — never geometry.
import { $, bench, cache, cur, generate, h, loadLayout, loadPresets, loadRules, loadState, names, newTab, presetsFor, saveState, state, tab, writePresets } from "./core.js";
import { confirmRelation, enterMode, exitMode, facePick, labelOverlay, modeGroup } from "./modes.js";
import { boardGroups, build3D, select, setBenchView, storeCamera } from "./view3d.js";
import { highlightKeys, renderSelection } from "./selection.js";
import { pinAll, renderBottom } from "./statusPane.js";
import { enterL3, renderCrumb, renderL3 } from "./l3.js";
import { boardCtx, hideCtx, renderEmpty, showCtx, syncToolbar } from "./chrome.js";
import * as THREE from "three";
import { camera, canvas } from "../space.js";
import { MODULES, moduleIdForGenerator } from "../modules.js";
import { log } from "../log.js";
import { affectedByRule, boardsOfKeys, fmt, usesRule } from "./provenance.js";
import { AXIS_NAMES, CORNER_NAMES, FACE_NAMES, toDisplay } from "./ruleText.js";
import { commitEdit, createDraft, diffLayouts, discard as discardDraft, isDirty, movedBoards, rebase, redo as redoDraft, setCorner, setFace, setFeatureDepth, setRelation, undo as undoDraft } from "./draft.js";
import { countPins } from "../gen/pins.js";


/** (Re)compute the active tab's result and refresh everything. */
export async function refresh({ keepCamera = true } = {}) {
  const t = tab();
  if (!t) { renderTabs(); renderEmpty(); return; }
  let c = cache.get(t.id);
  if (!c || c.moduleId !== t.moduleId) {
    c = { moduleId: t.moduleId, presets: await loadPresets(t.moduleId), rules: await loadRules(t.moduleId), layoutFile: await loadLayout(t.moduleId) };
    cache.set(t.id, c);
  }
  if (!t.params) {
    const list = presetsFor(t.moduleId, c.presets);
    const preset = list.find((p) => p.id === t.presetId) || list[0];
    if (preset) { t.presetId = preset.id; t.params = structuredClone(preset.params); }
    else t.params = MODULES[t.moduleId]?.defaults?.(1200, 350, 400) || {};
  }
  // The draft starts as the file. A draft saved before the file changed (another commit) starts again from the file.
  if (c.layoutFile && (!t.draft || JSON.stringify(t.draft.base) !== JSON.stringify(c.layoutFile.layout)) && !isDirty(t.draft)) t.draft = createDraft(c.layoutFile.layout);
  if (!c.layoutFile) t.draft = null;
  // Always the file / draft, never the copy baked into the bundle: after a commit the bundle is stale until a reload.
  c.result = generate(t.moduleId, t.params, t.draft ? t.draft.layout : null);
  c.prov = c.result.debug?.provenance || { entries: {}, rules: {} };
  c.boards = new Map((c.result.boards || []).map((b) => [b.id, b]));
  renderTabs();
  renderPresetSelect();
  renderDraftBox();
  renderRules();
  build3D(keepCamera);
  renderBottom();
  renderSelection();
  renderCrumb();
  renderL3();
  $("#stInfo").textContent = `${MODULES[t.moduleId]?.label || t.moduleId} · ${t.presetId || "custom"} · ${c.result.boards.length} boards · ${Object.keys(c.prov.entries).length} formulas · ${c.result.validation?.errors?.length || 0} errors`;
  syncToolbar();
  saveState();
}

// --- tabs ------------------------------------------------------------------------------

function renderTabs() {
  const wrap = $("#tabs");
  wrap.replaceChildren(...state.tabs.map((t, i) => {
    const b = document.createElement("button");
    b.className = `btab${i === state.active ? " active" : ""}`;
    b.title = `${t.moduleId} · ${t.presetId || "custom params"}`;
    const name = document.createElement("span");
    name.textContent = t.label || `${MODULES[t.moduleId]?.label || t.moduleId} · ${t.presetId || "custom"}`;
    const x = document.createElement("span");
    x.className = "x";
    x.textContent = "×";
    x.title = "Close tab";
    x.addEventListener("click", (e) => { e.stopPropagation(); closeTab(i); });
    b.append(name, x);
    b.addEventListener("click", () => activateTab(i));
    return b;
  }));
}
function activateTab(i) {
  if (i === state.active) return;
  storeCamera();
  state.active = i;
  const t = tab();
  log("bench.tab", { module: t.moduleId, preset: t.presetId });
  refresh({ keepCamera: false });
}
function closeTab(i) {
  const t = state.tabs[i];
  if (isDirty(t.draft) && !window.confirm("这个页签有未提交的规则修改，关闭就会丢掉。继续？")) return;
  cache.delete(t.id);
  state.tabs.splice(i, 1);
  if (state.active >= state.tabs.length) state.active = state.tabs.length - 1;
  else if (i < state.active) state.active -= 1;
  refresh({ keepCamera: false });
}
async function openTab(moduleId, opts = {}, from = "tab") {
  // Same module + preset already open → switch to it.
  const existing = state.tabs.findIndex((t) => t.moduleId === moduleId && !opts.params && t.presetId === (opts.presetId || t.presetId) && !t.label);
  if (existing >= 0 && !opts.params) { activateTab(existing); return; }
  storeCamera();
  const t = newTab(moduleId, opts);
  state.tabs.push(t);
  state.active = state.tabs.length - 1;
  await refresh({ keepCamera: false });
  log("bench.open", { module: moduleId, preset: t.presetId, from, custom: !!opts.params });
}

export async function pickModule() {
  const ids = bench ? await bench.modules() : Object.keys(MODULES);
  const usable = ids.filter((id) => MODULES[id]);
  const menu = $("#ctxMenu");
  menu.replaceChildren();
  const title = document.createElement("div");
  title.className = "ctx-title";
  title.textContent = "Open generator";
  menu.append(title);
  for (const id of usable) {
    const b = document.createElement("button");
    b.textContent = `${MODULES[id].label} — ${id}`;
    b.addEventListener("click", () => { hideCtx(); openTab(id, {}, "tab"); });
    menu.append(b);
  }
  for (const id of Object.keys(MODULES).filter((m) => !usable.includes(m))) {
    const b = document.createElement("button");
    b.disabled = true;
    b.textContent = `${MODULES[id].label} — no presets.json yet`;
    menu.append(b);
  }
  const r = $("#tabAdd").getBoundingClientRect();
  showCtx(r.left, r.bottom + 2);
}

// --- presets ---------------------------------------------------------------------------

function renderPresetSelect() {
  const t = tab();
  const c = cur();
  const sel = $("#presetSel");
  sel.replaceChildren();
  for (const p of presetsFor(t?.moduleId, c?.presets)) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${p.label || p.id} · ${countPins(p.pins || {})} pins`;
    sel.append(o);
  }
  const custom = document.createElement("option");
  custom.value = "";
  custom.textContent = t?.presetId ? "— custom (edited) —" : "custom params";
  sel.append(custom);
  sel.value = t?.presetId && presetsFor(t.moduleId, c?.presets).some((p) => p.id === t.presetId) ? t.presetId : "";
}
$("#presetSel").addEventListener("change", (e) => {
  const t = tab();
  const c = cur();
  const preset = c?.presets?.presets.find((p) => p.id === e.target.value);
  if (!preset) return;
  t.presetId = preset.id;
  t.params = structuredClone(preset.params);
  t.selection = null;
  t.tryout = null;
  log("bench.preset", { module: t.moduleId, preset: preset.id });
  refresh();
});
// "Preset ▾": the rare actions, out of the top bar.
$("#presetMenu").addEventListener("click", () => {
  const t = tab();
  const c = cur();
  const menu = $("#ctxMenu");
  menu.replaceChildren(
    h("div", { class: "ctx-title", text: t ? `${MODULES[t.moduleId]?.label} · ${t.presetId || "custom"}` : "Preset" }),
    h("button", { text: "Save current params into this preset", onclick: () => { hideCtx(); savePreset(); } }),
    h("button", { text: "Save as new preset…", onclick: () => { hideCtx(); savePreset(true); } }),
    h("button", { text: "Pin all (declare every current number correct)", onclick: () => { hideCtx(); pinAll(); } }),
    h("button", { text: "Open reports folder", onclick: () => { hideCtx(); bench?.openReports?.(); } }),
  );
  void c;
  const r = $("#presetMenu").getBoundingClientRect();
  showCtx(r.left, r.bottom + 2);
});
async function savePreset(asNew = false) {
  const t = tab();
  const c = cur();
  if (!t || !c || !bench) return;
  let preset = asNew ? null : c.presets.presets.find((p) => p.id === t.presetId);
  if (!preset) {
    const id = window.prompt("New preset id (letters, digits, dashes):", `custom-${Date.now().toString(36)}`);
    if (!id || !/^[\w-]+$/.test(id)) return;
    if (c.presets.presets.some((p) => p.id === id)) { window.alert(`Preset "${id}" exists.`); return; }
    preset = { id, label: window.prompt("Label:", id) || id, params: {}, pins: {} };
    c.presets.presets.push(preset);
    t.presetId = id;
  }
  preset.params = structuredClone(t.params);
  await writePresets(c);
  log("bench.preset.save", { module: t.moduleId, preset: preset.id });
  refresh();
}

// --- rules -----------------------------------------------------------------------------

function renderRules() {
  const t = tab();
  const c = cur();
  const list = $("#rulesList");
  list.replaceChildren();
  $("#rulesFile").textContent = c?.rules?.path ? "rules.json" : "";
  if (!c) return;
  const rules = c.rules.rules || {};
  const used = new Set(Object.keys(c.prov.rules || {}));
  const names = Object.keys(rules).sort((a, b) => (used.has(b) ? 1 : 0) - (used.has(a) ? 1 : 0) || a.localeCompare(b));
  if (!names.length) {
    list.append(Object.assign(document.createElement("div"), { className: "empty small", textContent: "This generator has no rules.json yet." }));
    return;
  }
  for (const name of names) {
    const r = rules[name];
    const row = document.createElement("div");
    row.className = `rule${used.has(name) ? " used" : ""}`;
    row.dataset.rule = name;
    const n = document.createElement("span");
    n.className = "name";
    n.textContent = r.label || name;
    if (r.label) n.append(h("span", { class: "muted sym", text: ` ${name}` }));
    n.title = used.has(name) ? `used by ${usesRule(c.prov, name).length} formulas in this run — click to highlight` : "not used in this run";
    n.addEventListener("click", () => highlightKeys(affectedByRule(c.prov, name), `rule ${name}`));
    const input = document.createElement("input");
    input.type = "number";
    input.step = "0.5";
    input.value = String(r.value);
    input.addEventListener("change", () => askRuleChange(name, r.value, Number(input.value), input));
    const doc = document.createElement("div");
    doc.className = "doc";
    doc.textContent = r.doc || "";
    row.append(n, input, doc);
    list.append(row);
  }
}

let pendingRule = null;
function askRuleChange(name, from, to, input) {
  const t = tab();
  const c = cur();
  if (!Number.isFinite(to) || to === from) { input.value = String(from); return; }
  const affected = affectedByRule(c.prov, name);
  pendingRule = { name, from, to, input, affected };
  $("#ruleSub").textContent = `${name}: ${fmt(from)} → ${fmt(to)} · ${affected.length} formula(s) move · boards: ${boardsOfKeys(affected).join(", ") || "none in this preset"}`;
  $("#ruleAffected").textContent = affected.length ? affected.slice(0, 80).join("\n") + (affected.length > 80 ? `\n… ${affected.length - 80} more` : "") : "(no formula in this run uses it; other presets or styles may)";
  $("#ruleReason").value = "";
  $("#ruleErr").textContent = "";
  $("#ruleDialog").classList.remove("hidden");
  $("#ruleReason").focus();
  void t;
}
$("#ruleDialog [data-cancel]").addEventListener("click", () => {
  if (pendingRule) pendingRule.input.value = String(pendingRule.from);
  pendingRule = null;
  $("#ruleDialog").classList.add("hidden");
});
$("#ruleDialog [data-ok]").addEventListener("click", async () => {
  if (!pendingRule || !bench) return;
  const t = tab();
  const reason = $("#ruleReason").value.trim();
  if (!reason) { $("#ruleErr").textContent = "Write one sentence: the agent learns from it."; return; }
  const { name, from, to, affected } = pendingRule;
  const res = await bench.writeRule(t.moduleId, name, to);
  if (!res.ok) { $("#ruleErr").textContent = res.error || "write failed"; return; }
  log("bench.rule.set", { module: t.moduleId, name, from: res.from, to: res.to, reason, affected, boards: boardsOfKeys(affected), preset: t.presetId, path: res.path });
  $("#ruleErr").textContent = "Rebuilding the generator bundle…";
  const rb = await bench.rebuild(t.moduleId);
  log("bench.rebuild", { module: t.moduleId, ok: rb.ok, ms: rb.ms, error: rb.error || null });
  if (!rb.ok) { $("#ruleErr").textContent = `Rebuild failed: ${rb.error}`; return; }
  pendingRule = null;
  storeCamera();
  saveState();
  // The bundle is a static import: reload to pick it up; tabs come back from sessionStorage.
  location.reload();
});

// --- placement rules: draft, undo, commit ---------------------------------------------------
// The draft (tab.draft) is the editor's working copy of layout.json. Every mode edits it through
// tryLayout(): the generator runs with the candidate first, and a candidate it refuses never
// replaces the last good draft. Commit writes layout.json with a reason; nothing else does.

export function ruleText(axisKey, r) {
  if (!r) return "—";
  const face = FACE_NAMES[`${axisKey}${r.from === "lo" ? "0" : "1"}`];
  const rel = r.relation ? `（${r.relation.kind === "contact" ? "贴合" : "齐平"}）` : "";
  return `${face} = ${toDisplay(r.at, names())}${rel}`;
}
function changeText(ch) {
  const N = names();
  if (ch.what === "axis") return `${ch.board} ${AXIS_NAMES[ch.key]}：${ruleText(ch.key, ch.from)} → ${ruleText(ch.key, ch.to)}`;
  if (ch.what === "corner") {
    const pt = (c) => (c ? `(${toDisplay(c.u, N)}, ${toDisplay(c.v, N)})` : "—");
    return `${ch.board} ${CORNER_NAMES[ch.key] || ch.key}：${pt(ch.from)} → ${pt(ch.to)}`;
  }
  return `${ch.board} ${ch.to?.label || ch.from?.label || ch.key} 深度：${toDisplay(ch.from?.depth ?? "—", N)} → ${toDisplay(ch.to?.depth ?? "—", N)}`;
}

/** Generate with `next`; keep it only if the generator accepts it. Returns { ok, error?, result? }. */
export function tryLayout(next, label, meta = {}) {
  const t = tab();
  const c = cur();
  if (!t?.draft) return { ok: false, error: "这个生成器还没有放置规则文件" };
  const res = generate(t.moduleId, t.params, next);
  const errs = res.validation?.errors || [];
  if (errs.length) {
    log("bench.layout.refused", { module: t.moduleId, label, errors: errs, ...meta });
    return { ok: false, error: errs.join("；") };
  }
  const changes = diffLayouts(t.draft.layout, next);
  if (!changes.length) return { ok: true, result: res, unchanged: true };
  // A display nudge would hide the move until 返回整体. The rule position is the one on screen.
  if (t.mode?.kind === "face") t.nudge = null;
  t.draft = commitEdit(t.draft, next, label);
  log("bench.layout.edit", { module: t.moduleId, label, changes, moved: movedBoards(c.result, res).map((m) => m.id), ...meta });
  refresh();
  return { ok: true, result: res };
}

export function draftStep(kind) {
  const t = tab();
  if (!t?.draft) return;
  const before = t.draft;
  t.draft = kind === "undo" ? undoDraft(t.draft) : redoDraft(t.draft);
  if (t.draft === before) return;
  log(`bench.layout.${kind}`, { module: t.moduleId, changes: diffLayouts(before.layout, t.draft.layout) });
  refresh();
}

function renderDraftBox() {
  const t = tab();
  const c = cur();
  const box = $("#draftBox");
  box.replaceChildren();
  box.classList.toggle("hidden", !t?.draft || !c?.layoutFile);
  if (!t?.draft || !c?.layoutFile) { $("#commitBar").classList.add("hidden"); $("#commitBar").replaceChildren(); return; }
  const changes = diffLayouts(t.draft.base, t.draft.layout);
  box.append(
    h("div", { class: "draft-head" }, [
      h("b", { text: "放置规则" }),
      h("span", { class: `tag ${changes.length ? "gap" : "ok"}`, text: changes.length ? `草稿 · ${changes.length} 处未提交` : "与 layout.json 一致" }),
    ]),
    ...(changes.length ? [h("div", { class: "draft-list" }, changes.map((ch) => h("div", { text: changeText(ch) })))] : []),
    h("div", { class: "btn-row" }, [
      h("button", { class: "tb", text: "撤销", disabled: t.draft.past.length ? null : "", title: "Ctrl+Z", onclick: () => draftStep("undo") }),
      h("button", { class: "tb", text: "重做", disabled: t.draft.future.length ? null : "", title: "Ctrl+Y", onclick: () => draftStep("redo") }),
      h("button", { class: "tb", text: "放弃", disabled: changes.length ? null : "", onclick: () => {
        if (!window.confirm("放弃全部未提交的规则修改？")) return;
        log("bench.layout.discard", { module: t.moduleId, changes });
        t.draft = discardDraft(t.draft);
        refresh();
      } }),
    ]),
  );
  const bar = $("#commitBar");
  bar.replaceChildren();
  bar.classList.remove("hidden");
  const commit = h("button", {
    class: `tb commit-btn${changes.length ? " primary" : ""}`,
    text: changes.length ? `提交 ${changes.length} 处修改…` : "没有待提交的修改",
    disabled: changes.length ? null : "",
    title: "写入 layout.json。要写一句原因。",
    onclick: openLayoutCommit,
  });
  bar.append(commit);
}

function openLayoutCommit() {
  const t = tab();
  const c = cur();
  const changes = diffLayouts(t.draft.base, t.draft.layout);
  const before = generate(t.moduleId, t.params, t.draft.base);
  const moved = movedBoards(before, c.result);
  $("#layoutSub").textContent = `写入 generators/${t.moduleId}/layout.json · 作用范围：生成器模板，之后生成的每一个${MODULES[t.moduleId]?.label || ""}柜都会照新规则算（主程序重新打开后生效）`;
  $("#layoutChanges").textContent = [
    ...changes.map(changeText),
    "",
    `按当前整体输入，位置或尺寸变化的板：${moved.map((m) => m.id).join("、") || "无"}`,
  ].join("\n");
  $("#layoutReason").value = "";
  $("#layoutErr").textContent = "";
  $("#layoutDialog").classList.remove("hidden");
  $("#layoutReason").focus();
}
$("#layoutDialog [data-cancel]").addEventListener("click", () => $("#layoutDialog").classList.add("hidden"));
$("#layoutDialog [data-ok]").addEventListener("click", async () => {
  const t = tab();
  const c = cur();
  const reason = $("#layoutReason").value.trim();
  if (!reason) { $("#layoutErr").textContent = "写一句原因。"; return; }
  if (!bench?.writeLayout) { $("#layoutErr").textContent = "没有文件通道（规则台不在主程序里打开）"; return; }
  const changes = diffLayouts(t.draft.base, t.draft.layout);
  // Someone (another tab, a teammate, the agent) committed since this draft started: do not write over it.
  const onDisk = await loadLayout(t.moduleId);
  if (onDisk && JSON.stringify(onDisk.layout) !== JSON.stringify(t.draft.base)) {
    log("bench.layout.conflict", { module: t.moduleId, changes, theirs: diffLayouts(t.draft.base, onDisk.layout) });
    $("#layoutErr").textContent = `layout.json 在这份草稿开始之后被改过（${diffLayouts(t.draft.base, onDisk.layout).map(changeText).join("；")}）。没有写入：先记下你的修改，放弃草稿后在新的文件上重做。`;
    return;
  }
  const res = await bench.writeLayout(t.moduleId, JSON.stringify(t.draft.layout));
  if (!res.ok) { $("#layoutErr").textContent = res.error || "写入失败"; return; }
  log("bench.layout.commit", { module: t.moduleId, changes, reason, preset: t.presetId, path: res.path });
  $("#layoutErr").textContent = "正在重建生成器包…";
  const rb = await bench.rebuild(t.moduleId);
  log("bench.rebuild", { module: t.moduleId, ok: rb.ok, ms: rb.ms, error: rb.error || null });
  if (!rb.ok) { $("#layoutErr").textContent = `已写入，但重建失败：${rb.error}`; return; }
  c.layoutFile = { ...c.layoutFile, layout: structuredClone(t.draft.layout) };
  t.draft = rebase(t.draft);
  $("#layoutDialog").classList.add("hidden");
  $("#stInfo").textContent = `已写入 ${res.path}`;
  refresh();
});

// --- boot ------------------------------------------------------------------------------------------------

// For agent / CI checks over the debugging port: the same entry points the UI uses.
window.__bench = { tab, cur, select, tryLayout, refresh, setFace, setRelation, setCorner, setFeatureDepth, enterMode, exitMode, enterL3, boardCtx, modeGroup: () => modeGroup, boardGroups: () => boardGroups, labelRects: () => labelOverlay.rects(),
  /** Client coordinates of a world point (to click it through the real raycast). */
  screenOf: (x, y, z) => { const p = new THREE.Vector3(x, y, z).project(camera); const r = canvas.getBoundingClientRect(); return { x: r.left + ((p.x + 1) / 2) * r.width, y: r.top + ((1 - p.y) / 2) * r.height }; },
  /** Face mode pick of a face's centre without a camera that sees it (bottom faces). */
  pickFace: (boardId, face) => {
    const g = boardGroups.get(boardId); const b = cur().boards.get(boardId);
    const a = face[0]; const normal = new THREE.Vector3(); normal[a] = face[1] === "1" ? 1 : -1;
    const point = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2); point[a] = b[face];
    facePick({ object: g.mesh, face: { normal: normal.clone().transformDirection(new THREE.Matrix4().copy(g.mesh.matrixWorld).invert()) }, point: point.add(g.group.position) });
  },
  confirmRelation, setKind: (k) => { tab().mode.pick.kind = k; renderSelection(); }, view: (name) => setBenchView(name) };

window.addEventListener("beforeunload", (e) => {
  if (!state.tabs.some((t) => isDirty(t.draft))) return;
  e.preventDefault();
  e.returnValue = "";
});

loadState();
if (bench) {
  bench.onShow(async (req) => {
    const resolved = moduleIdForGenerator(req.moduleId);
    const moduleId = resolved && MODULES[resolved] ? resolved : "overheadCabinet";
    if (req.params) await openTab(moduleId, { params: structuredClone(req.params), presetId: null, label: `${MODULES[moduleId].label} · ${req.cabinetId || "from job"}` }, req.from || "cabinet");
    else await openTab(moduleId, {}, req.from || "rail");
  });
}
await refresh({ keepCamera: true });
if (!state.tabs.length && !bench) await openTab("overheadCabinet", {}, "standalone");
bench?.ready?.();
