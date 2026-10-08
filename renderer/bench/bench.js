// Generator bench (docs/bench-spec.md). One tab per generator + preset; the
// 3D view, the board list and the selection panel all read one generator
// result and its `debug.provenance`. The bench writes rules.json, pins in
// presets.json, reports and log events — never geometry.
import * as THREE from "three";
import { scene, camera, controls, canvas, renderer, setView, frame, rayFromClient } from "../space.js";
import { MODULES, moduleIdForGenerator } from "../modules.js";
import { boardMesh } from "../boardGeom.js";
import { doorMaterialFor } from "../doorFinish.js";
import { STIPPLE_WHITE, carcassMat } from "../carcassFinish.js";
import { showTip, hideTip } from "../hud.js";
import { log } from "../log.js";
import { collectPins, pinsForBoard, mergePins, checkPins, countPins } from "../gen/pins.js";
import { renderBoard2D, boardPoints, planeAxes } from "./board2d.js";
import { entryOf, FACES, tree, usesRule, usesParam, affectedByRule, affectedBy, boardsOfKeys, fmt, evaluate, varsFor, flatFormula } from "./provenance.js";
import { planExplode, assemblyOffsets, radialOffsets, explodeUnit, dirLabel, separation } from "./explode.js";
import { nameTable, toDisplay, fromDisplay, stripLeadEquals, FACE_NAMES, SIZE_NAMES, AXIS_NAMES, CORNER_NAMES, withOffset, sizeFormula, addParam, removeParam, formulaPieces } from "./ruleText.js";
import { bindFormulaBar, editingBar, removeChip } from "./formulaBar.js";
import { createDraft, isDirty, commitEdit, undo as undoDraft, redo as redoDraft, discard as discardDraft, rebase, setFace, setRelation, setCorner, setFeatureDepth, diffLayouts, movedBoards, ensureBoard, ensureAxis } from "./draft.js";
import { fridgeFix, fridgeParts, MIN_ZONE_HEIGHT, MIN_ZONE_WIDTH, fitZoneWidths } from "../modules.js";
import { fridgeCabinetWidth } from "../gen/generalTall.js";
import { buildDefaultAnnotations, disposeAnnotations, LabelOverlay } from "./annotate.js";
import { faceAt, faceRegion, overlapArea } from "./faceRegion.js";

const bridge = window.cablab || null;
const bench = bridge && bridge.bench;
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const STATE_KEY = "cablab.bench.v1";

// --- state ---------------------------------------------------------------------------

/** @type {{ tabs: any[], active: number }} */
let state = { tabs: [], active: -1 };
let tabSeq = 0;
const cache = new Map(); // tabId -> { result, prov, boards: Map, presets, rules, moduleId }

function saveState() {
  try {
    const tabs = state.tabs.map((t) => ({ ...t, tryout: null }));
    // This window only. A new Generator Rules window, and the next launch of
    // the app, start from the module just opened — not the last screen.
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ tabs, active: state.active }));
  } catch (_) { /* nothing */ }
}
function loadState() {
  try {
    localStorage.removeItem(STATE_KEY);
    const raw = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null");
    if (raw && Array.isArray(raw.tabs)) {
      state = { tabs: raw.tabs, active: Math.min(raw.active, raw.tabs.length - 1) };
      tabSeq = raw.tabs.reduce((m, t) => Math.max(m, Number(String(t.id).split("-")[1]) || 0), 0);
    }
  } catch (_) { /* fresh */ }
}
function tab() { return state.tabs[state.active] || null; }
function cur() { const t = tab(); return t ? cache.get(t.id) || null : null; }

function newTab(moduleId, { presetId = null, params = null, label = null } = {}) {
  tabSeq += 1;
  return {
    id: `tab-${tabSeq}`,
    moduleId,
    presetId,
    params,
    label,
    view: "3d",
    explode: 0,
    explodeMode: "assembly", // assembly | radial
    step: null,              // null = every board follows the slider; n = n boards are in, the rest wait outside
    trails: true,
    explodeLabels: true,
    opacity: 1,
    cut: { x: 1, y: 1, z: 1 },
    showJoints: true,
    showPoints: false,
    selection: null,   // { kind: "board"|"point"|"joint"|"face", id, key?, keys?, label? }
    l3: null,          // board id being edited
    frame: "local",
    labels: true,
    tryout: null,      // { key, expr, value }
    camera: null,
    draft: null,       // placement-rule draft (draft.js), when the module has layout.json
    mode: null,        // { kind: "default" | "face", board, pick? } — a board's parameter mode
  };
}

// --- data: presets, rules, generation --------------------------------------------------

async function loadPresets(moduleId) {
  if (!bench) return { module: moduleId, presets: [] };
  const res = await bench.readPresets(moduleId);
  if (!res || !res.text) return { module: moduleId, presets: [], path: res && res.path };
  try { return { ...JSON.parse(res.text), path: res.path }; } catch (err) { log("bench.presets.corrupt", { module: moduleId, message: err.message }); return { module: moduleId, presets: [], path: res.path }; }
}
async function loadRules(moduleId) {
  if (!bench) return { rules: {}, path: null };
  const res = await bench.readRules(moduleId);
  if (!res || !res.text) return { rules: {}, path: res && res.path };
  try { return { rules: JSON.parse(res.text), path: res.path }; } catch (_) { return { rules: {}, path: res.path }; }
}

async function loadLayout(moduleId) {
  if (!bench?.readLayout) return null;
  const res = await bench.readLayout(moduleId);
  if (!res || !res.text) return null;
  try { return { layout: JSON.parse(res.text), path: res.path }; } catch (err) { log("bench.layout.corrupt", { module: moduleId, message: err.message }); return null; }
}

function generate(moduleId, params, layout = null) {
  const mod = MODULES[moduleId];
  if (!mod) return { boards: [], features: [], validation: { errors: [`unknown module ${moduleId}`], warnings: [] }, debug: {} };
  try {
    return layout ? mod.generate(params, { layout }) : mod.generate(params);
  } catch (err) {
    log("bench.generate.failed", { module: moduleId, message: err.message, stack: err.stack });
    return { boards: [], features: [], validation: { errors: [`generator threw: ${err.message}`], warnings: [] }, debug: {} };
  }
}

/** (Re)compute the active tab's result and refresh everything. */
async function refresh({ keepCamera = true } = {}) {
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

async function pickModule() {
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

/** Presets this tab should offer. Storage and Fridge share generalTall/presets.json;
 *  each tab only lists the cabinets of its own kind. */
function presetsFor(moduleId, file) {
  const all = file?.presets || [];
  const fridge = (p) => (p.params?.zones || []).some((z) => z.type === "fridge");
  if (moduleId === "tallFridgeCabinet") {
    const hit = all.filter(fridge);
    return hit.length ? hit : all;
  }
  if (moduleId === "generalTallCabinet") {
    const hit = all.filter((p) => !fridge(p));
    return hit.length ? hit : all;
  }
  return all;
}

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
async function writePresets(c) {
  const { path, ...file } = c.presets;
  const res = await bench.writePresets(c.moduleId, `${JSON.stringify(file, null, 2)}\n`);
  if (!res.ok) window.alert(`Could not write presets.json: ${res.error}`);
  return res.ok;
}

// --- params form -----------------------------------------------------------------------

/** Fill `form` with this generator's inputs. Shown on the right, not the left. */
function renderParamsInto(form) {
  const t = tab();
  form.replaceChildren();
  if (!t || !t.params) return;
  const mod = MODULES[t.moduleId];
  if (mod?.benchShape === "base") { renderBaseInputs(form, mod, t); return; }
  if (mod?.benchShape === "tall") { renderTallInputs(form, mod, t); return; }
  if (mod?.benchShape === "fridge") { renderFridgeInputs(form, mod, t); return; }
  if (mod?.benchShape === "lounge") { renderLoungeInputs(form, mod, t); return; }
  if (mod?.benchShape === "bedroom") { renderBedroomInputs(form, mod, t); return; }
  if (mod?.benchShape === "bunk") { renderBunkInputs(form, mod, t); return; }
  if (mod?.benchShape === "bedBox") { renderBedBoxInputs(form, mod, t); return; }
  if (mod?.benchShape === "bedSide") { renderBedSideInputs(form, mod, t); return; }
  if (mod?.benchShape === "small") { renderSmallInputs(form, mod, t); return; }
  if (mod?.benchShape === "uShape") { renderUShapeInputs(form, mod, t); return; }
  if (mod?.benchInputs) { renderInputs(form, mod, t); return; }
  const keys = Object.keys(t.params);
  // Show envelope-ish keys first.
  const order = ["cabinetWidth", "cabinetDepth", "cabinetHeight", "style"];
  keys.sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)) || a.localeCompare(b));
  for (const k of keys) {
    const v = t.params[k];
    const row = document.createElement("label");
    row.className = "field";
    const name = document.createElement("span");
    name.textContent = k;
    name.title = usesParam(cur()?.prov, shortParam(k)).length ? `used by ${usesParam(cur()?.prov, shortParam(k)).length} formulas` : "";
    row.append(name);
    let input;
    if (typeof v === "number") {
      input = document.createElement("input");
      input.type = "number";
      input.step = "0.1";
      input.value = String(v);
      input.addEventListener("change", () => setParam(k, Number(input.value)));
    } else if (typeof v === "boolean") {
      input = document.createElement("input");
      input.type = "checkbox";
      input.checked = v;
      input.addEventListener("change", () => setParam(k, input.checked));
    } else if (typeof v === "string") {
      input = document.createElement("input");
      input.type = "text";
      input.value = v;
      input.addEventListener("change", () => setParam(k, input.value));
    } else {
      row.classList.add("wide");
      input = document.createElement("textarea");
      input.value = JSON.stringify(v, null, 1).replace(/\n\s*/g, " ");
      input.addEventListener("change", () => {
        try { setParam(k, JSON.parse(input.value)); input.classList.remove("bad"); } catch (_) { input.classList.add("bad"); }
      });
    }
    row.append(input);
    form.append(row);
  }
  if (mod?.zoneTypes) {
    const hint = document.createElement("div");
    hint.className = "empty small";
    hint.textContent = `zone types: ${mod.zoneTypes.map((z) => z.id).join(", ")}`;
    form.append(hint);
  }
}
/** Symbol → Chinese name for the active tab's generator (inputs + rules.json labels). */
function names() {
  const t = tab();
  const c = cur();
  return nameTable(MODULES[t?.moduleId]?.benchInputs || [], c?.rules?.rules || {});
}
const ruleValue = (name) => cur()?.rules?.rules?.[name]?.value;

/**
 * Overall inputs (Generator Rules › 整体输入): what this cabinet is, grouped as
 * a cabinetmaker reads it. Changing one re-runs every rule; it never rewrites a rule.
 */
function renderInputs(form, mod, t) {
  const p = t.params;
  const field = (f) => {
    const row = h("label", { class: `field input-field${f.kind === "bool" ? " check" : ""}`, title: f.sym ? `公式里写作 ${f.sym}` : "" });
    const has = p[f.key] != null;
    const fallback = f.rule ? ruleValue(f.rule) : f.default;
    row.append(h("span", { class: "in-label" }, [
      h("span", { text: f.label }),
      f.source ? h("span", { class: `src src-${f.source}`, text: has || !f.rule ? f.source : `${f.source} · 未设`, title: f.rule && !has ? `没有填写：用规则 ${f.rule} = ${fallback}` : "" }) : null,
    ]));
    let input;
    if (f.kind === "bool") {
      input = h("input", { type: "checkbox" });
      input.checked = has ? !!p[f.key] : !!fallback;
      input.addEventListener("change", () => setParam(f.key, input.checked));
    } else if (f.kind === "select") {
      input = h("select", {}, f.options.map(([v, label]) => h("option", { value: v, text: label })));
      input.value = String(p[f.key] ?? f.options[0][0]);
      input.addEventListener("change", () => setParam(f.key, input.value));
    } else {
      input = h("input", { type: "number", step: "0.5" });
      input.value = has ? String(p[f.key]) : "";
      if (!has && fallback != null) input.placeholder = String(fallback);
      input.addEventListener("change", () => {
        const v = Number(input.value);
        if (input.value === "" && f.rule) { const next = { ...t.params }; delete next[f.key]; setParams(next, f.key, p[f.key], null); return; }
        if (!Number.isFinite(v) || v <= 0) { input.classList.add("bad"); return; }
        if (f.key === "cabinetWidth" && mod.setEnvelope) { setParams(mod.setEnvelope(t.params, { W: v }), f.key, p[f.key], v); return; }
        setParam(f.key, v);
      });
    }
    row.append(input);
    return row;
  };
  for (const g of mod.benchInputs) {
    // Overhead draws the zones as a strip above this form.
    if (g.kind === "zones" && mod.id === "overheadCabinet") continue;
    form.append(h("div", { class: "in-group", text: g.group }));
    if (g.kind === "zones") { form.append(zonesEditor(mod, t)); continue; }
    for (const f of g.fields) form.append(field(f));
    if (g.group === "柜体尺寸" && p.cabinetDepth != null) {
      const fpt = p.frontPanelThickness ?? ruleValue("DEFAULT_FRONT_PANEL_THICKNESS_MM") ?? 0;
      form.append(h("div", { class: "empty small", text: `含门总深度 = 柜身深度 + 门板厚 = ${fmt(p.cabinetDepth + fpt)}（主程序面板里填的是这个数）` }));
    }
  }
}

/** Zones left → right: type and width. A width change is absorbed by the next zone (the last by the one before); the total stays the cabinet width. */
function zonesEditor(mod, t) {
  const zones = t.params.zones || [];
  const wrap = h("div", { class: "zones-edit" });
  const total = t.params.cabinetWidth;
  const set = (next, what) => setParams({ ...t.params, zones: next }, `zones.${what}`, null, next.map((z) => z.width));
  zones.forEach((z, i) => {
    const type = h("select", {}, (mod.zoneTypes || []).map((zt) => h("option", { value: zt.id, text: zt.label })));
    type.value = z.type;
    type.addEventListener("change", () => set(zones.map((zz, k) => (k === i ? { ...zz, type: type.value } : zz)), "type"));
    const w = h("input", { type: "number", step: "10" });
    w.value = String(z.width);
    w.addEventListener("change", () => {
      const n = i < zones.length - 1 ? i + 1 : i - 1;
      if (n < 0) { w.value = String(z.width); return; }
      const max = z.width + zones[n].width - MIN_ZONE_WIDTH;
      const v = Math.max(MIN_ZONE_WIDTH, Math.min(max, Math.round(Number(w.value))));
      if (!Number.isFinite(v)) { w.value = String(z.width); return; }
      const next = zones.map((zz) => ({ ...zz }));
      next[n].width = Math.round((next[n].width - (v - next[i].width)) * 10) / 10;
      next[i].width = v;
      set(next, "width");
    });
    const del = h("button", { class: "tb icon", text: "×", title: "删除这个分区（宽度按比例分给其余分区）", disabled: zones.length < 2 ? "" : null });
    del.addEventListener("click", () => set(fitZoneWidths(zones.filter((_, k) => k !== i), total), "remove"));
    wrap.append(h("div", { class: "zone-row" }, [h("span", { class: "muted", text: String(i + 1) }), type, w, del]));
  });
  const add = h("button", { class: "tb", text: "+ 分区" });
  add.addEventListener("click", () => {
    if ((zones.length + 1) * MIN_ZONE_WIDTH > total) return;
    set(fitZoneWidths([...zones, { id: `zone-${Date.now().toString(36)}`, type: "up_flap", width: MIN_ZONE_WIDTH }], total), "add");
  });
  wrap.append(h("div", { class: "zone-foot" }, [add, h("span", { class: "muted", text: `合计 ${fmt(zones.reduce((s, z) => s + z.width, 0))} = 柜宽 ${fmt(total)}` })]));
  return wrap;
}

/** Kitchen / ensuite: edit the parameters the generator already has. Columns trade width; rows in a column trade height. */
function renderBaseInputs(form, mod, t) {
  const p = t.params;
  const gs = p.globalSettings || {};
  const num = (label, value, apply, step = "1") => {
    const input = h("input", { type: "number", step, value: value == null ? "" : String(value) });
    input.addEventListener("change", () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v <= 0) { input.classList.add("bad"); return; }
      apply(v);
    });
    return h("label", { class: "field input-field" }, [h("span", { class: "in-label" }, [h("span", { text: label })]), input]);
  };
  const outer = mod.envelope(p);
  form.append(h("div", { class: "in-group", text: "柜体尺寸" }));
  form.append(num("柜宽", outer.W, (v) => setParams(mod.setEnvelope(p, { W: v }), "globalSettings.length", outer.W, v)));
  form.append(num("柜深（含门）", outer.D, (v) => setParams(mod.setEnvelope(p, { D: v }), "globalSettings.depth", gs.depth, v)));
  form.append(num("柜高", outer.H, (v) => setParams(mod.setEnvelope(p, { H: v }), "globalSettings.height", outer.H, v)));
  form.append(h("div", { class: "in-group", text: "材料" }));
  form.append(num("柜身板厚", p.materialThickness, (v) => setParam("materialThickness", v), "0.5"));
  form.append(num("门板厚", p.frontThickness, (v) => setParam("frontThickness", v), "0.5"));
  form.append(num("门缝", p.frontClearance, (v) => setParam("frontClearance", v), "0.5"));
  form.append(h("div", { class: "in-group", text: "踢脚" }));
  form.append(num("踢脚高度", p.bottomClearanceHeight, (v) => {
    const next = structuredClone(p);
    next.bottomClearanceHeight = v;
    setParams(mod.setEnvelope(next, { H: mod.envelope(next).H }), "bottomClearanceHeight", p.bottomClearanceHeight, v);
  }));
  const kick = h("select", {}, [["style_1", "内凹"], ["style_2", "齐平"]].map(([v, label]) => h("option", { value: v, text: label })));
  kick.value = p.bottomClearanceStyle || "style_1";
  kick.addEventListener("change", () => setParam("bottomClearanceStyle", kick.value));
  form.append(h("label", { class: "field input-field" }, [h("span", { class: "in-label" }, [h("span", { text: "踢脚" })]), kick]));
  form.append(h("div", { class: "in-group", text: "列和行" }));
  form.append(baseColumnsEditor(mod, t));
  if (mod.id === "ensuiteCabinet") form.append(h("div", { class: "empty small", text: "浴室柜没有灶台。列上若已是灶台，生成器会报错，不会把它改成门。" }));
}

function baseColumnsEditor(mod, t) {
  const columns = (t.params.columns || []).map((c) => ({ ...c, zones: (c.zones || []).map((z) => ({ ...z })) }));
  const total = t.params.globalSettings?.length;
  const zoneRoom = Math.round(((t.params.globalSettings?.height || 0) - (t.params.bottomClearanceHeight || 0)) * 10) / 10;
  const wrap = h("div", { class: "zones-edit" });
  const commit = (next, what) => setParams({ ...t.params, columns: next }, `columns.${what}`, null, next.map((c) => c.width));
  const types = mod.zoneTypes || [];
  columns.forEach((col, i) => {
    const w = h("input", { type: "number", step: "10", value: String(col.width) });
    w.addEventListener("change", () => {
      const n = i < columns.length - 1 ? i + 1 : i - 1;
      if (n < 0) { w.value = String(col.width); return; }
      const max = col.width + columns[n].width - MIN_ZONE_WIDTH;
      const v = Math.max(MIN_ZONE_WIDTH, Math.min(max, Math.round(Number(w.value))));
      if (!Number.isFinite(v)) { w.value = String(col.width); return; }
      const next = columns.map((c) => ({ ...c, zones: c.zones.map((z) => ({ ...z })) }));
      next[n].width = Math.round((next[n].width - (v - next[i].width)) * 10) / 10;
      next[i].width = v;
      commit(next, "width");
    });
    const del = h("button", { class: "tb icon", text: "×", title: "删除这一列，宽度分给其余列", disabled: columns.length < 2 ? "" : null });
    del.addEventListener("click", () => commit(fitZoneWidths(columns.filter((_, k) => k !== i), total), "remove"));
    wrap.append(h("div", { class: "zone-row" }, [h("span", { class: "muted", text: `列 ${i + 1}` }), w, del]));
    (col.zones || []).forEach((z, zi) => {
      const type = h("select", {}, types.map((zt) => h("option", { value: zt.id, text: zt.label })));
      type.value = z.zoneType || types[0]?.id;
      type.addEventListener("change", () => {
        const next = columns.map((c) => ({ ...c, zones: c.zones.map((zz) => ({ ...zz })) }));
        next[i].zones[zi].zoneType = type.value;
        commit(next, "type");
      });
      const hgt = h("input", { type: "number", step: "10", value: String(z.height) });
      hgt.addEventListener("change", () => {
        const zones = col.zones;
        const n = zi < zones.length - 1 ? zi + 1 : zi - 1;
        if (n < 0) { hgt.value = String(z.height); return; }
        const max = z.height + zones[n].height - MIN_ZONE_HEIGHT;
        const v = Math.max(MIN_ZONE_HEIGHT, Math.min(max, Math.round(Number(hgt.value))));
        if (!Number.isFinite(v)) { hgt.value = String(z.height); return; }
        const next = columns.map((c) => ({ ...c, zones: c.zones.map((zz) => ({ ...zz })) }));
        next[i].zones[n].height = Math.round((next[i].zones[n].height - (v - next[i].zones[zi].height)) * 10) / 10;
        next[i].zones[zi].height = v;
        commit(next, "height");
      });
      const zd = h("button", { class: "tb icon", text: "×", title: "删除这一行，高度给相邻的行", disabled: (col.zones || []).length < 2 ? "" : null });
      zd.addEventListener("click", () => {
        const next = columns.map((c) => ({ ...c, zones: c.zones.map((zz) => ({ ...zz })) }));
        const zones = next[i].zones;
        const heir = zi < zones.length - 1 ? zi + 1 : zi - 1;
        if (heir < 0) return;
        zones[heir].height = Math.round((zones[heir].height + zones[zi].height) * 10) / 10;
        zones.splice(zi, 1);
        commit(next, "zoneRemove");
      });
      wrap.append(h("div", { class: "zone-row" }, [h("span", { class: "muted", text: `行 ${zi + 1}` }), type, hgt, zd]));
    });
    const addRow = h("button", { class: "tb", text: "+ 行" });
    addRow.addEventListener("click", () => {
      const zones = col.zones || [];
      if (!zones.length || zones.reduce((s, z) => s + z.height, 0) < (zones.length + 1) * MIN_ZONE_HEIGHT) return;
      const next = columns.map((c) => ({ ...c, zones: c.zones.map((zz) => ({ ...zz })) }));
      const zs = next[i].zones;
      let tallest = 0;
      zs.forEach((z, k) => { if (z.height > zs[tallest].height) tallest = k; });
      if (zs[tallest].height < MIN_ZONE_HEIGHT * 2) return;
      const give = Math.min(200, Math.round(zs[tallest].height / 2));
      if (zs[tallest].height - give < MIN_ZONE_HEIGHT) return;
      zs[tallest].height = Math.round((zs[tallest].height - give) * 10) / 10;
      zs.unshift({ id: `z-${Date.now().toString(36)}`, height: give, zoneType: "left_door" });
      commit(next, "zoneAdd");
    });
    wrap.append(h("div", { class: "zone-foot" }, [addRow]));
  });
  const addCol = h("button", { class: "tb", text: "+ 列" });
  addCol.addEventListener("click", () => {
    if ((columns.length + 1) * MIN_ZONE_WIDTH > total) return;
    const zoneH = zoneRoom;
    commit(fitZoneWidths([...columns, { id: `c-${Date.now().toString(36)}`, width: MIN_ZONE_WIDTH, zones: [{ id: "z1", height: zoneH, zoneType: "left_door" }] }], total), "add");
  });
  wrap.append(h("div", { class: "zone-foot" }, [addCol, h("span", { class: "muted", text: `列宽合计应等于柜宽 ${fmt(total)}。每列行高合计应等于柜高减踢脚 ${fmt(zoneRoom)}。` })]));
  return wrap;
}

function carcassDepth(p) {
  const fpt = p.frontPanelThickness ?? p.frontFaceAllowance ?? p.doorPanelThickness ?? 16;
  return Math.round(((p.cabinetDepth ?? 0) - fpt) * 10) / 10;
}

function tallSideMode(p, side) {
  const t = p[side === "left" ? "leftSidePanelThickness" : "rightSidePanelThickness"] ?? 0;
  if (!(t > 0)) return "none";
  return p[side === "left" ? "leftSidePanelFinish" : "rightSidePanelFinish"] === "colour" ? "colour" : "carcass";
}

function withTallSide(p, side, mode) {
  const cpt = p.panelThickness ?? 15;
  const fpt = p.frontPanelThickness ?? 16;
  const t = mode === "none" ? 0 : mode === "colour" ? fpt : cpt;
  const thick = side === "left" ? "leftSidePanelThickness" : "rightSidePanelThickness";
  const fin = side === "left" ? "leftSidePanelFinish" : "rightSidePanelFinish";
  return { ...p, [thick]: t, [fin]: mode === "colour" ? "colour" : "carcass" };
}

function restampTallSides(p) {
  let next = p;
  for (const side of ["left", "right"]) {
    const mode = tallSideMode(p, side);
    if (mode !== "none") next = withTallSide(next, side, mode);
  }
  return next;
}

function segButtons(options, now, onPick) {
  return h("div", { class: "seg-group" }, options.map(([id, text]) => h("button", {
    type: "button", class: `tb seg${now === id ? " active" : ""}`, text, onclick: () => onPick(id),
  })));
}

function renderTallInputs(form, mod, t) {
  const p = t.params;
  const num = (label, value, apply, step = "1") => {
    const input = h("input", { type: "number", step, value: value == null ? "" : String(value) });
    input.addEventListener("change", () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v <= 0) { input.classList.add("bad"); return; }
      apply(v);
    });
    return h("label", { class: "field input-field" }, [h("span", { class: "in-label" }, [h("span", { text: label })]), input]);
  };
  form.append(h("div", { class: "in-group", text: "柜体尺寸" }));
  form.append(num("柜宽", p.cabinetWidth, (v) => setParams(mod.setEnvelope(p, { W: v }), "cabinetWidth", p.cabinetWidth, v)));
  form.append(num("柜身深度（不含门）", carcassDepth(p), (v) => setParams(mod.setEnvelope(p, { D: v }), "cabinetDepth", carcassDepth(p), v)));
  form.append(num("柜高", p.cabinetHeight, (v) => setParams(mod.setEnvelope(p, { H: v }), "cabinetHeight", p.cabinetHeight, v)));
  form.append(h("div", { class: "in-group", text: "材料" }));
  form.append(num("柜身板厚", p.panelThickness, (v) => setParams(restampTallSides({ ...p, panelThickness: v }), "panelThickness", p.panelThickness, v), "0.5"));
  form.append(num("门板厚", p.frontPanelThickness, (v) => setParams(restampTallSides({ ...p, frontPanelThickness: v }), "frontPanelThickness", p.frontPanelThickness, v), "0.5"));
  form.append(h("div", { class: "in-group", text: "侧板" }));
  for (const [side, label] of [["left", "左侧"], ["right", "右侧"]]) {
    form.append(h("div", { class: "field input-field" }, [
      h("span", { class: "in-label" }, [h("span", { text: label })]),
      segButtons([["none", "无"], ["carcass", "柜身"], ["colour", "门板"]], tallSideMode(p, side), (mode) => {
        const next = withTallSide(p, side, mode);
        setParams(next, `${side}Side`, tallSideMode(p, side), mode);
      }),
    ]));
  }
  form.append(h("div", { class: "empty small", text: "柜身侧板用柜身板厚，门板色侧板用门板厚。两边可以同时有。" }));
  form.append(h("div", { class: "in-group", text: "区域（从地面往上）" }));
  form.append(tallZonesEditor(mod, t));
}

function tallZonesEditor(mod, t) {
  const zones = (t.params.zones || []).map((z) => ({ ...z }));
  const wrap = h("div", { class: "zones-edit" });
  const commit = (next, what) => setParams({ ...t.params, zones: next }, `zones.${what}`, null, next.map((z) => z.height));
  const types = mod.zoneTypes || [];
  zones.forEach((z, i) => {
    const type = h("select", {}, types.map((zt) => h("option", { value: zt.id, text: zt.label })));
    type.value = types.some((zt) => zt.id === z.type) ? z.type : (types[0]?.id || z.type);
    type.addEventListener("change", () => {
      const next = zones.map((zz) => ({ ...zz }));
      next[i].type = type.value;
      commit(next, "type");
    });
    const hgt = h("input", { type: "number", step: "10", value: String(z.height) });
    hgt.addEventListener("change", () => {
      const n = i < zones.length - 1 ? i + 1 : i - 1;
      const v = Math.round(Number(hgt.value));
      if (!Number.isFinite(v)) { hgt.value = String(z.height); return; }
      if (n < 0) {
        setParams(mod.setEnvelope(t.params, { H: t.params.cabinetHeight + (v - z.height) }), "zones.height", z.height, v);
        return;
      }
      const max = z.height + zones[n].height - MIN_ZONE_HEIGHT;
      const nextH = Math.max(MIN_ZONE_HEIGHT, Math.min(max, v));
      const next = zones.map((zz) => ({ ...zz }));
      next[n].height = Math.round((next[n].height - (nextH - next[i].height)) * 10) / 10;
      next[i].height = nextH;
      commit(next, "height");
    });
    const del = h("button", { class: "tb icon", text: "×", title: "删掉这一格，高度给下面一格", disabled: zones.length < 2 ? "" : null });
    del.addEventListener("click", () => {
      const next = zones.map((zz) => ({ ...zz }));
      const heir = i > 0 ? i - 1 : 1;
      next[heir].height = Math.round((next[heir].height + next[i].height) * 10) / 10;
      next.splice(i, 1);
      commit(next, "remove");
    });
    wrap.append(h("div", { class: "zone-row" }, [h("span", { class: "muted", text: String(i + 1) }), type, hgt, del]));
  });
  const add = h("button", { class: "tb", text: "+ 区域" });
  add.addEventListener("click", () => {
    if (!zones.length) return;
    let tallest = 0;
    zones.forEach((z, k) => { if (z.height > zones[tallest].height) tallest = k; });
    const give = Math.min(300, Math.round(zones[tallest].height - MIN_ZONE_HEIGHT));
    if (give < MIN_ZONE_HEIGHT) return;
    const next = zones.map((z) => ({ ...z }));
    next[tallest].height = Math.round((next[tallest].height - give) * 10) / 10;
    next.push({ id: `zone-${Date.now().toString(36)}`, type: "open_space", height: give });
    commit(next, "add");
  });
  wrap.append(h("div", { class: "zone-foot" }, [add, h("span", { class: "muted", text: "高度在相邻两格之间腾挪，总高不变。新的一格放在最上面，从最高的一格里最多取 300。" })]));
  return wrap;
}

function renderFridgeInputs(form, mod, t) {
  const p = t.params;
  const parts = fridgeParts(p.zones || []);
  const fridge = parts.fridge;
  const cpt = p.panelThickness ?? 15;
  const sides = (p.leftSidePanelThickness ?? 0) + (p.rightSidePanelThickness ?? 0);
  const outerW = fridge?.applianceWidthMm > 0 ? fridgeCabinetWidth(fridge.applianceWidthMm, sides, cpt) : p.cabinetWidth;
  const num = (label, value, apply, step = "1") => {
    const input = h("input", { type: "number", step, value: value == null ? "" : String(value) });
    input.addEventListener("change", () => {
      const v = Number(input.value);
      if (!Number.isFinite(v) || v <= 0) { input.classList.add("bad"); return; }
      apply(v);
    });
    return h("label", { class: "field input-field" }, [h("span", { class: "in-label" }, [h("span", { text: label })]), input]);
  };
  const fix = (next, key, from, to) => setParams(fridgeFix(next), key, from, to);
  form.append(h("div", { class: "in-group", text: "柜体尺寸" }));
  form.append(h("div", { class: "empty small", text: fridge
    ? `外宽 ${fmt(outerW)} = 开口 ${fmt(fridge.applianceWidthMm)} + 侧板 ${fmt(sides)} + 3 × 板厚 ${fmt(cpt)}`
    : "没有冰箱区域。" }));
  form.append(num("柜身深度（不含门）", carcassDepth(p), (v) => fix(mod.setEnvelope(p, { D: v }), "cabinetDepth", carcassDepth(p), v)));
  form.append(num("柜高", p.cabinetHeight, (v) => fix(mod.setEnvelope(p, { H: v }), "cabinetHeight", p.cabinetHeight, v)));
  form.append(h("div", { class: "in-group", text: "冰箱开口" }));
  if (fridge) {
    const cut = (key, label) => num(label, fridge[key], (v) => {
      const zones = (p.zones || []).map((z) => ({ ...z }));
      const f = zones.find((z) => z.type === "fridge");
      f[key] = Math.round(v);
      if (key === "applianceHeightMm") f.height = f.applianceHeightMm;
      fix({ ...p, zones }, key, fridge[key], f[key]);
    });
    form.append(cut("applianceWidthMm", "开口宽"));
    form.append(cut("applianceHeightMm", "开口高"));
    form.append(cut("applianceDepthMm", "开口深"));
  }
  form.append(h("div", { class: "in-group", text: "材料" }));
  form.append(num("柜身板厚", p.panelThickness, (v) => fix(restampTallSides({ ...p, panelThickness: v }), "panelThickness", p.panelThickness, v), "0.5"));
  form.append(num("门板厚", p.frontPanelThickness, (v) => fix(restampTallSides({ ...p, frontPanelThickness: v }), "frontPanelThickness", p.frontPanelThickness, v), "0.5"));
  const sideNow = (p.leftSidePanelThickness ?? 0) > 0 ? "left" : (p.rightSidePanelThickness ?? 0) > 0 ? "right" : "none";
  const matNow = tallSideMode(p, sideNow === "none" ? "left" : sideNow);
  form.append(h("div", { class: "in-group", text: "侧板（只一边）" }));
  if ((p.leftSidePanelThickness ?? 0) > 0 && (p.rightSidePanelThickness ?? 0) > 0) {
    form.append(h("div", { class: "empty small", text: "现在左右都有侧板。点一次左边或右边，就只留下那一边。" }));
  }
  form.append(h("div", { class: "field input-field" }, [
    h("span", { class: "in-label" }, [h("span", { text: "哪一边" })]),
    segButtons([["none", "无"], ["left", "左"], ["right", "右"]], sideNow, (side) => {
      const mode = side === "none" ? "none" : (matNow === "none" ? "carcass" : matNow);
      let next = { ...p, leftSidePanelThickness: 0, rightSidePanelThickness: 0, leftSidePanelFinish: "carcass", rightSidePanelFinish: "carcass" };
      if (side !== "none") next = withTallSide(next, side, mode);
      fix(next, "side", sideNow, side);
    }),
  ]));
  form.append(h("div", { class: "field input-field" }, [
    h("span", { class: "in-label" }, [h("span", { text: "料" })]),
    segButtons([["carcass", "柜身"], ["colour", "门板"]], sideNow === "none" ? "carcass" : matNow, (mode) => {
      if (sideNow === "none") return;
      fix(withTallSide(p, sideNow, mode), "sideFinish", matNow, mode);
    }),
  ]));
  form.append(h("div", { class: "in-group", text: "冰箱下面（从地面往上）" }));
  form.append(fridgeZoneList(p, parts.below, "below", FRIDGE_BELOW_TYPES, { drawer: "抽屉", bottom_flap: "下翻门" }, (zones) => fix({ ...p, zones }, "below", null, zones.map((z) => z.height))));
  form.append(h("div", { class: "in-group", text: "冰箱上面" }));
  const above = parts.above[0] || null;
  const aboveNow = above ? above.type : "none";
  form.append(segButtons([["none", "无"], ["top_flap", "上翻门"], ["fixed_panel", "固定板"]], aboveNow, (type) => {
    const zi = p.ziThickness ?? 15;
    let zones = (p.zones || []).map((z) => ({ ...z }));
    let H = p.cabinetHeight;
    if (type === "none" && above) {
      H = Math.round((H - above.height - zi) * 10) / 10;
      zones = zones.filter((z) => z.id !== above.id);
    } else if (above) {
      zones = zones.map((z) => (z.id === above.id ? { ...z, type } : z));
    } else if (type !== "none") {
      const zone = { id: `zone-${Date.now().toString(36)}`, type, height: 300 };
      zones = [...zones, zone];
      H = Math.round((H + zone.height + zi) * 10) / 10;
    }
    setParams(fridgeFix({ ...p, zones }, { H }), "above", aboveNow, type);
  }));
  if (above) {
    form.append(num("上面这一格的高度", above.height, (v) => {
      const h = Math.max(MIN_ZONE_HEIGHT, Math.round(v));
      const zones = (p.zones || []).map((z) => (z.id === above.id ? { ...z, height: h } : { ...z }));
      setParams(fridgeFix({ ...p, zones }, { H: Math.round((p.cabinetHeight + h - above.height) * 10) / 10 }), "above.height", above.height, h);
    }));
  }
  form.append(h("div", { class: "empty small", text: "开口是厂家的洞口，不是冰箱外壳。外宽跟着开口、侧板和三块立柱走，不能单独填。" }));
}

function fridgeZoneList(p, list, kind, types, labels, commit) {
  const wrap = h("div", { class: "zones-edit" });
  const all = () => (p.zones || []).map((z) => ({ ...z }));
  list.forEach((z, i) => {
    const type = h("select", {}, types.map((id) => h("option", { value: id, text: labels[id] || id })));
    type.value = types.includes(z.type) ? z.type : types[0];
    type.addEventListener("change", () => {
      const zones = all();
      const hit = zones.find((zz) => zz.id === z.id);
      if (hit) hit.type = type.value;
      commit(zones);
    });
    const hgt = h("input", { type: "number", step: "10", value: String(z.height) });
    hgt.addEventListener("change", () => {
      const v = Math.round(Number(hgt.value));
      if (!Number.isFinite(v) || v < MIN_ZONE_HEIGHT) { hgt.value = String(z.height); return; }
      const zones = all();
      const hit = zones.find((zz) => zz.id === z.id);
      if (hit) hit.height = v;
      setParams(fridgeFix({ ...p, zones }, { except: z.id }), `${kind}.height`, z.height, v);
    });
    const del = h("button", { class: "tb icon", text: "×", title: "删掉这一格" });
    del.addEventListener("click", () => commit(all().filter((zz) => zz.id !== z.id)));
    wrap.append(h("div", { class: "zone-row" }, [h("span", { class: "muted", text: String(i + 1) }), type, hgt, del]));
  });
  const add = h("button", { class: "tb", text: "+ 抽屉" });
  add.addEventListener("click", () => {
    const zones = all();
    zones.unshift({ id: `zone-${Date.now().toString(36)}`, type: "drawer", height: 200, lockPosition: "top" });
    commit(zones);
  });
  wrap.append(h("div", { class: "zone-foot" }, [add]));
  return wrap;
}

function renderLoungeInputs(form, mod, t) {
  const p = t.params;
  const style = p.style || "L_SHAPE";
  const num = (label, value, apply, min, step = "10") => {
    const input = h("input", { type: "number", step, value: value == null ? "" : String(value) });
    input.addEventListener("change", () => {
      const v = Number(input.value);
      if (!Number.isFinite(v)) { input.classList.add("bad"); return; }
      apply(Math.max(min, Math.round(v)));
    });
    return h("label", { class: "field input-field" }, [h("span", { class: "in-label" }, [h("span", { text: label })]), input]);
  };
  const setKey = (key, value) => setParams({ ...p, [key]: value }, key, p[key], value);
  const choice = (label, value, options, apply) => {
    const sel = h("select", {}, options.map(([v, text]) => h("option", { value: v, text })));
    sel.value = value;
    sel.addEventListener("change", () => apply(sel.value));
    return h("label", { class: "field input-field" }, [h("span", { class: "in-label" }, [h("span", { text: label })]), sel]);
  };
  form.append(h("div", { class: "in-group", text: "外形" }));
  form.append(choice("样式", style, [["I_SHAPE", "I"], ["L_SHAPE", "L"], ["PARALLEL", "平行"]], (v) => setParams(mod.setStyle(p, v), "style", style, v)));
  form.append(num("座高", p.height, (v) => setKey("height", v), mod.minSize?.H ?? 300));
  if (style === "I_SHAPE") {
    form.append(num("长度", p.mainWidth, (v) => setKey("mainWidth", v), 800));
    form.append(num("座深", p.mainDepth, (v) => setKey("mainDepth", v), 300));
  } else if (style === "L_SHAPE") {
    form.append(num("沿墙总宽", p.mainWidth, (v) => setKey("mainWidth", v), 800));
    form.append(num("座深", p.mainDepth, (v) => setKey("mainDepth", v), 300));
    form.append(num("翼长", p.lWidth, (v) => setKey("lWidth", v), 400));
    form.append(num("翼座深", p.lDepth, (v) => setKey("lDepth", v), 200));
    form.append(choice("翼在", p.lPosition || "RIGHT", [["RIGHT", "右"], ["LEFT", "左"]], (v) => setKey("lPosition", v)));
    form.append(choice("翼端", p.lFrontAccess === "DRAWER" ? "DRAWER" : "NONE", [["NONE", "座面"], ["DRAWER", "抽屉"]], (v) => setKey("lFrontAccess", v)));
  } else if (style === "PARALLEL") {
    form.append(num("总宽", p.totalWidth, (v) => setKey("totalWidth", v), 1600));
    form.append(num("每边座宽", p.singleLoungeWidth, (v) => setKey("singleLoungeWidth", v), 400));
    form.append(num("进深", p.depth, (v) => setKey("depth", v), 400));
    form.append(choice("过道端", p.aisleAccess === "DRAWER" ? "DRAWER" : "NONE", [["NONE", "座面"], ["DRAWER", "抽屉"]], (v) => setKey("aisleAccess", v)));
    const on = p.hasMiddleCabinet !== false && (p.hasMiddleCabinet === true || (p.totalWidth ?? 0) - 2 * (p.singleLoungeWidth ?? 0) >= 300);
    form.append(choice("中间柜", p.hasMiddleCabinet === false ? "off" : "on", [["on", "有"], ["off", "无"]], (v) => setKey("hasMiddleCabinet", v === "on")));
    if (p.hasMiddleCabinet === true && p.middleCabinet) {
      const mc = p.middleCabinet;
      const setMc = (key, min) => (v) => setParams({ ...p, hasMiddleCabinet: true, middleCabinet: { ...mc, [key]: Math.max(min, v) } }, `middleCabinet.${key}`, mc[key], Math.max(min, v));
      form.append(num("中间柜宽", mc.width, setMc("width", 100), 100));
      form.append(num("中间柜深", mc.depth, setMc("depth", 100), 100));
      form.append(num("中间柜高", mc.height, setMc("height", 100), 100));
    }
  }
  form.append(h("div", { class: "in-group", text: "材料" }));
  form.append(num("板厚", p.partitionPanelThickness ?? 18, (v) => setKey("partitionPanelThickness", Math.max(1, v)), 1, "0.5"));
  form.append(h("div", { class: "empty small", text: "一段盖板超过 1600 会按车间规则切成多块。这个 1600 不在这里改。" }));
}

function benchNum(label, value, apply, min = 0, step = "10") {
  const input = h("input", { type: "number", step, value: value == null ? "" : String(value) });
  input.addEventListener("change", () => {
    const v = Number(input.value);
    if (!Number.isFinite(v)) { input.classList.add("bad"); return; }
    apply(Math.max(min, Math.round(v)));
  });
  return h("label", { class: "field input-field" }, [h("span", { class: "in-label" }, [h("span", { text: label })]), input]);
}

function benchChoice(label, value, options, apply) {
  const sel = h("select", {}, options.map(([v, text]) => h("option", { value: v, text })));
  sel.value = value;
  sel.addEventListener("change", () => apply(sel.value));
  return h("label", { class: "field input-field" }, [h("span", { class: "in-label" }, [h("span", { text: label })]), sel]);
}

function renderBedroomInputs(form, mod, t) {
  const p = t.params;
  const setLayout = (key) => (v) => setParams(mod.setLayout(p, key, v), key, p[key], v);
  form.append(h("div", { class: "empty small", text: `柜宽 ${fmt(p.width)}、柜高 ${fmt(p.height)}、屋顶来自空间，不在这里改。` }));
  form.append(h("div", { class: "in-group", text: "进深" }));
  form.append(benchNum("鼻子进深", p.depth, (v) => setParams(mod.setEnvelope(p, { D: v }), "depth", p.depth, v), mod.minSize?.D ?? 300));
  form.append(h("div", { class: "in-group", text: "布局" }));
  form.append(benchNum("靴箱高度", p.bootHeight, setLayout("bootHeight"), 0, "1"));
  form.append(benchNum("衣柜宽度（两边一起）", p.wardrobeWidth, setLayout("wardrobeWidth"), 0, "1"));
  form.append(benchNum("吊柜门底", p.ohcBottom, setLayout("ohcBottom"), 0, "1"));
  form.append(benchChoice("衣柜样式", p.style || "style1", [["style1", "样式 1"], ["nook", "凹龛"]], (v) => setParams({ ...p, style: v }, "style", p.style, v)));
  if ((p.style || "style1") !== "nook") form.append(benchNum("固定板分界", p.fixedPanelTop, setLayout("fixedPanelTop"), 0, "1"));
  else form.append(h("div", { class: "empty small", text: "凹龛的衣柜底由靴箱高度算出来，没有分界可拖。" }));
  form.append(benchChoice("吊柜分区", String((p.ohcZones || []).length || 2), [["2", "2 扇"], ["3", "3 扇"]], (v) => setParams(mod.setOhcCount(p, Number(v)), "ohcZones", (p.ohcZones || []).length, Number(v))));
  const led = h("input", { type: "checkbox" });
  led.checked = p.ledGroove !== false;
  led.addEventListener("change", () => setParams({ ...p, ledGroove: led.checked }, "ledGroove", p.ledGroove, led.checked));
  form.append(h("label", { class: "field input-field check" }, [h("span", { class: "in-label" }, [h("span", { text: "T3 灯槽" })]), led]));
  form.append(h("div", { class: "in-group", text: "材料" }));
  form.append(benchNum("柜身板厚", p.panelThickness, (v) => setParams({ ...p, panelThickness: v }, "panelThickness", p.panelThickness, v), 1, "0.5"));
  form.append(benchNum("门板厚", p.doorPanelThickness, (v) => setParams({ ...p, doorPanelThickness: v }, "doorPanelThickness", p.doorPanelThickness, v), 1, "0.5"));
}

function renderBunkInputs(form, mod, t) {
  const p = t.params;
  const lim = mod.upperLimits ? mod.upperLimits(p) : { min: 0, max: p.height };
  form.append(h("div", { class: "empty small", text: "开口离侧墙的距离在车间规则里，不在这里改。" }));
  form.append(h("div", { class: "in-group", text: "箱子" }));
  form.append(benchNum("长度（沿后墙）", p.length, (v) => setParams(mod.setEnvelope(p, { W: v }), "length", p.length, v), 600));
  form.append(benchNum("进深", p.depth, (v) => setParams(mod.setEnvelope(p, { D: v }), "depth", p.depth, v), 200));
  form.append(benchNum("顶高", p.height, (v) => setParams(mod.setEnvelope(p, { H: v }), "height", p.height, v), 400));
  form.append(h("div", { class: "in-group", text: "铺位" }));
  form.append(benchNum("甲板顶", p.deckTop, (v) => setParams({ ...p, deckTop: v }, "deckTop", p.deckTop, v), 0, "1"));
  form.append(benchNum("上铺底面", p.upperZ, (v) => {
    const n = Math.max(lim.min, Math.min(lim.max, v));
    setParams({ ...p, upperZ: n }, "upperZ", p.upperZ, n);
  }, lim.min, "1"));
  form.append(h("div", { class: "empty small", text: `上铺底面停在 ${fmt(lim.min)} 和 ${fmt(lim.max)} 之间。相等高度是 ${fmt(lim.equal)}。` }));
  form.append(benchChoice("梯子", p.endSide === "LEFT" ? "LEFT" : "RIGHT", [["RIGHT", "右侧"], ["LEFT", "左侧"]], (v) => setParams({ ...p, endSide: v }, "endSide", p.endSide, v)));
}

function renderBedBoxInputs(form, mod, t) {
  const p = t.params;
  form.append(h("div", { class: "empty small", text: `宽 ${fmt(p.width)}、高 ${fmt(p.height)} 来自床体（床框和靴箱）。板厚 18 是车间规则。这里只改进深。` }));
  form.append(benchNum("进深", p.depth, (v) => setParams(mod.setEnvelope(p, { D: v }), "depth", p.depth, v), mod.minSize?.D ?? 50));
}

function renderBedSideInputs(form, mod, t) {
  const p = t.params;
  form.append(h("div", { class: "empty small", text: `宽 ${fmt(p.width)} 来自衣柜，不在这里改。另一张桌子会镜像这张的进深、高度、层板和门向。` }));
  form.append(benchNum("进深", p.depth, (v) => setParams(mod.setEnvelope(p, { D: v }), "depth", p.depth, v), 40));
  form.append(benchNum("高度", p.height, (v) => setParams(mod.setEnvelope(p, { H: v }), "height", p.height, v), 200));
  form.append(benchNum("层板中线", p.shelfCenter, (v) => setParams({ ...p, shelfCenter: v }, "shelfCenter", p.shelfCenter, v), 0, "1"));
  form.append(benchNum("门缝", p.clearance, (v) => setParams({ ...p, clearance: v }, "clearance", p.clearance, v), 0, "0.5"));
  const types = [["drawer", "抽屉"], ["left_door", "左开门"], ["right_door", "右开门"]];
  const zones = (p.zones || []).map((z) => ({ ...z }));
  ["下格", "上格"].forEach((label, i) => {
    const z = zones[i];
    if (!z) return;
    form.append(benchChoice(label, z.type || "drawer", types, (v) => {
      const next = (p.zones || []).map((zz) => ({ ...zz }));
      if (next[i]) next[i].type = v;
      setParams({ ...p, zones: next }, `zones.${i}`, z.type, v);
    }));
  });
}

function renderSmallInputs(form, mod, t) {
  const p = t.params;
  form.append(h("div", { class: "empty small", text: "小柜的面式子还没逐条记下，右边可能没有公式。这里改的是已有的外形和行。" }));
  form.append(benchNum("柜宽", p.cabinetWidth, (v) => setParams(mod.setEnvelope(p, { W: v }), "cabinetWidth", p.cabinetWidth, v), 120));
  form.append(benchNum("柜深", p.cabinetDepth, (v) => setParams(mod.setEnvelope(p, { D: v }), "cabinetDepth", p.cabinetDepth, v), 100));
  form.append(benchNum("柜高", p.cabinetHeight, (v) => setParams(mod.setEnvelope(p, { H: v }), "cabinetHeight", p.cabinetHeight, v), 120));
  form.append(benchNum("柜身板厚", p.panelThickness, (v) => setParams(mod.setEnvelope({ ...p, panelThickness: v }, { H: p.cabinetHeight }), "panelThickness", p.panelThickness, v), 1, "0.5"));
  form.append(benchNum("门板厚", p.frontPanelThickness, (v) => setParams({ ...p, frontPanelThickness: v }, "frontPanelThickness", p.frontPanelThickness, v), 1, "0.5"));
  form.append(benchNum("门缝", p.frontClearance, (v) => setParams({ ...p, frontClearance: v }, "frontClearance", p.frontClearance, v), 0, "0.5"));
  const zones = (p.zones || []).map((z) => ({ ...z }));
  const types = mod.zoneTypes || [];
  form.append(h("div", { class: "in-group", text: "行（从上往下）" }));
  zones.forEach((z, i) => {
    form.append(benchChoice(`行 ${i + 1}`, z.type || "left_door", types.map((zt) => [zt.id, zt.label]), (v) => {
      const next = zones.map((zz) => ({ ...zz }));
      next[i].type = v;
      setParams({ ...p, zones: next }, "zones.type", z.type, v);
    }));
    form.append(benchNum(`行 ${i + 1} 高`, z.height, (v) => {
      const n = i < zones.length - 1 ? i + 1 : i - 1;
      if (n < 0) return;
      const max = z.height + zones[n].height - MIN_ZONE_HEIGHT;
      const nextH = Math.max(MIN_ZONE_HEIGHT, Math.min(max, v));
      const next = zones.map((zz) => ({ ...zz }));
      next[n].height = Math.round((next[n].height - (nextH - next[i].height)) * 10) / 10;
      next[i].height = nextH;
      setParams({ ...p, zones: next }, "zones.height", z.height, nextH);
    }, MIN_ZONE_HEIGHT));
  });
}

function renderUShapeInputs(form, mod, t) {
  const p = t.params;
  const set = (patch, key, from, to) => setParams({ ...p, ...patch }, key, from, to);
  form.append(h("div", { class: "empty small", text: "三臂各自是一节吊柜。面的式子在每一节里，拼进 U 之后这里不一定还带得出来。臂上的分区宽度是比例，会摊到该臂的可用长度上。" }));
  form.append(benchNum("总宽", p.totalWidth, (v) => set({ totalWidth: v }, "totalWidth", p.totalWidth, v), 1200));
  form.append(benchNum("左臂长", p.leftArmLength, (v) => set({ leftArmLength: v }, "leftArmLength", p.leftArmLength, v), 400));
  form.append(benchNum("右臂长", p.rightArmLength, (v) => set({ rightArmLength: v }, "rightArmLength", p.rightArmLength, v), 400));
  form.append(benchNum("柜深", p.cabinetDepth, (v) => set({ cabinetDepth: v }, "cabinetDepth", p.cabinetDepth, v), 200));
  form.append(benchNum("柜高", p.cabinetHeight, (v) => set({ cabinetHeight: v }, "cabinetHeight", p.cabinetHeight, v), 200));
  form.append(benchNum("柜身板厚", p.featureWidth, (v) => set({ featureWidth: v }, "featureWidth", p.featureWidth, v), 1, "0.5"));
  form.append(benchNum("门板厚", p.frontPanelThickness, (v) => set({ frontPanelThickness: v }, "frontPanelThickness", p.frontPanelThickness, v), 1, "0.5"));
  form.append(benchNum("顶部预留", p.topClearanceHeight, (v) => set({ topClearanceHeight: v }, "topClearanceHeight", p.topClearanceHeight, v), 0, "1"));
  form.append(benchNum("门缝", p.clearance, (v) => set({ clearance: v }, "clearance", p.clearance, v), 0, "0.5"));
  const led = h("input", { type: "checkbox" });
  led.checked = p.ledGroove === true;
  led.addEventListener("change", () => set({ ledGroove: led.checked }, "ledGroove", p.ledGroove, led.checked));
  form.append(h("label", { class: "field input-field check" }, [h("span", { class: "in-label" }, [h("span", { text: "T3 灯槽" })]), led]));
  for (const [arm, label] of [["LEFT", "左臂"], ["BACK", "后背"], ["RIGHT", "右臂"]]) {
    const zones = ((p.zones && p.zones[arm]) || []).map((z) => ({ ...z }));
    form.append(h("div", { class: "in-group", text: label }));
    const types = arm === "BACK" ? (mod.zoneTypes || []) : (mod.sideZoneTypes || mod.zoneTypes || []);
    zones.forEach((z, i) => {
      form.append(benchChoice(`${label} ${i + 1}`, z.type || "up_flap", types.map((zt) => [zt.id, zt.label]), (v) => {
        const next = { ...(p.zones || {}), [arm]: zones.map((zz, k) => (k === i ? { ...zz, type: v } : { ...zz })) };
        set({ zones: next }, `${arm}.type`, z.type, v);
      }));
      form.append(benchNum(`${label} ${i + 1} 宽`, z.width, (v) => {
        const n = i < zones.length - 1 ? i + 1 : i - 1;
        const copy = zones.map((zz) => ({ ...zz }));
        if (n < 0) copy[i].width = Math.max(1, v);
        else {
          const sum = copy[i].width + copy[n].width;
          const w = Math.max(1, Math.min(sum - 1, v));
          copy[n].width = Math.round((sum - w) * 10) / 10;
          copy[i].width = w;
        }
        set({ zones: { ...(p.zones || {}), [arm]: copy } }, `${arm}.width`, z.width, copy[i].width);
      }, 1));
    });
  }
}

function setParams(next, key, from, to) {
  const t = tab();
  t.params = next;
  t.tryout = null;
  log("bench.param", { module: t.moduleId, key, from, to });
  refresh();
}

function safeEnvelope(t) {
  try { return MODULES[t.moduleId].envelope(t.params); } catch (_) { return null; }
}
/** Param names as the generator's `param()` labels them (Cw/Cd/H/TCH…). Best effort. */
function shortParam(k) {
  return { cabinetWidth: "Cw", cabinetDepth: "Cd", cabinetHeight: "H", topClearanceHeight: "TCH", frontPanelThickness: "FPT", featureWidth: "CPT", clearance: "clearance" }[k] || k;
}
function setParam(k, v) {
  const t = tab();
  const from = t.params[k];
  t.params = { ...t.params, [k]: v };
  t.tryout = null;
  log("bench.param", { module: t.moduleId, key: k, from, to: v });
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

function ruleText(axisKey, r) {
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
function tryLayout(next, label, meta = {}) {
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

function draftStep(kind) {
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

// --- board parameter modes: default (position formulas) / face (contact, flush) -------------------
// Right-click any board → 参数调试. A board in layout.json edits its placement rule. A board
// still placed in code shows the formulas it already has; confirming a new box rule is refused
// by the generator when the outline would not follow. The overall inputs stay on the left.

const MODE_GHOST = 0.18;
let modeGroup = null;
const labelOverlay = new LabelOverlay($("#viewport"));
labelOverlay.dragFromFace = () => !!paramDrag?.face;
labelOverlay.onCommit = (key, text) => {
  const t = tab();
  if (!t?.mode || !/^[xyz][01]$/.test(key)) return;
  const res = applyFaceFormula(t.mode.board, key, text);
  if (!res?.ok) {
    t.mode.error = res?.error || "没有采用";
    renderSelection();
    buildModeOverlay();
  }
};
labelOverlay.onChipDrag = (e, payload) => startParamDrag(e, payload);
(function tickOverlay() {
  const t = tab();
  if (t?.mode?.kind === "default") labelOverlay.update(camera, canvas, boardGroups.get(t.mode.board)?.group.position || null);
  requestAnimationFrame(tickOverlay);
})();

/** Camera on one board, room around it for the labels. */
function frameBoard(boardId) {
  const b = cur()?.boards.get(boardId);
  if (!b) return;
  const box = new THREE.Box3(new THREE.Vector3(b.x0, b.y0, b.z0), new THREE.Vector3(b.x1, b.y1, b.z1));
  const s = box.getBoundingSphere(new THREE.Sphere());
  frame(s.center, Math.max(s.radius * 1.35, 250));
  storeCamera();
}

function placementRule(boardId) {
  return tab()?.draft?.layout?.boards?.[boardId] || null;
}
function boardLabel(boardId) {
  return placementRule(boardId)?.label || cur()?.boards.get(boardId)?.name || boardId;
}

function enterMode(kind, boardId) {
  const t = tab();
  if (!t || !cur()?.boards.get(boardId)) return;
  t.placeError = null;
  if (t.l3) exitL3();
  t.mode = { kind, board: boardId, error: null, pick: kind === "face" ? { step: "move" } : null };
  t.selection = { kind: "board", id: boardId };
  log("bench.mode", { module: t.moduleId, mode: kind, board: boardId });
  build3D(true);
  frameBoard(boardId);
  renderSelection();
  renderCrumb();
  saveState();
}
function exitMode() {
  const t = tab();
  if (!t?.mode) return;
  log("bench.mode", { module: t.moduleId, mode: null, board: t.mode.board });
  t.mode = null;
  t.faceMove = false;
  t.nudge = null;
  build3D(true);
  renderSelection();
  renderCrumb();
  saveState();
}

/** The face that is not driving, written as the stored symbols: `x0 + xSize`. */
function drivenText(axis, rule) {
  const drive = `${axis}${rule.from === "lo" ? "0" : "1"}`;
  return `${drive} ${rule.from === "lo" ? "+" : "−"} ${axis}Size`;
}

/** Default-mode label text for one board from its rule and the result. */
function modeLabels(b, rule) {
  const prov = cur().prov;
  const faces = {};
  const sizes = {};
  for (const a of ["x", "y", "z"]) {
    const r = shownCase(rule.axes[a], b.id, a);
    if (!r) {
      const lo = concreteFormula(prov, `${b.id}.${a}0`);
      const hi = concreteFormula(prov, `${b.id}.${a}1`);
      for (const f of [`${a}0`, `${a}1`]) {
        const formula = toDisplay(f.endsWith("0") ? lo : hi);
        faces[f] = { drive: false, editable: true, formula, pieces: formulaPieces(formula), lines: [`${FACE_NAMES[f]} ${fmt(b[f])}`, `= ${formula}`] };
      }
      const sizeText = toDisplay(sizeFormula(lo, hi));
      const sz = b[`${a}1`] - b[`${a}0`];
      sizes[a] = { formula: sizeText, pieces: formulaPieces(sizeText), lines: [`${SIZE_NAMES[`${a}Size`]} ${fmt(sz)}`, `= ${sizeText}`] };
      continue;
    }
    const drive = `${a}${r.from === "lo" ? "0" : "1"}`;
    for (const f of [`${a}0`, `${a}1`]) {
      const isDrive = f === drive;
      const shown = isDrive ? toDisplay(nameCenterlines(r.at)) : drivenText(a, r);
      const second = r.relation && isDrive
        ? `${r.relation.kind === "contact" ? "贴合" : "齐平"} ${toDisplay(r.relation.ref)}`
        : `= ${shown}`;
      const fr = entryOf(prov, `${b.id}.frame.${f}`)?.value;
      const out = fr != null && Math.abs(fr - b[f]) > 1e-6 ? `（定位框 ${fmt(fr)}）` : "";
      faces[f] = { drive: isDrive, editable: true, formula: shown, pieces: formulaPieces(shown, primarySymbols()), lines: [`${FACE_NAMES[f]} ${fmt(b[f])}${out}${isDrive ? "  ●" : ""}`, second] };
    }
    const sz = entryOf(prov, `${b.id}.${a}Size`)?.value ?? b[`${a}1`] - b[`${a}0`];
    const sizeText = toDisplay(nameCenterlines(r.size));
    sizes[a] = { formula: sizeText, pieces: formulaPieces(sizeText), lines: [`${SIZE_NAMES[`${a}Size`]} ${fmt(sz)}`, `= ${sizeText}`] };
  }
  return { faces, sizes };
}

/** Names a placement formula may keep: input symbols and rule-constant ids. */
function formulaNames() {
  const t = tab();
  const c = cur();
  const names = new Set();
  for (const g of MODULES[t?.moduleId]?.benchInputs || []) for (const f of g.fields || []) if (f.sym) names.add(f.sym);
  for (const k of Object.keys(c?.rules?.rules || {})) names.add(k);
  return names;
}

/** Flatten a face formula and replace names the placement rules cannot see (a divider centreline) with their number. */
function concreteFormula(prov, key) {
  const formula = flatFormula(prov, key);
  if (!formula) return "0";
  const allowed = formulaNames();
  const locals = new Map();
  const stack = new Set();
  (function walk(k) {
    const e = entryOf(prov, k);
    if (!e || stack.has(k)) return;
    stack.add(k);
    for (const [name, term] of Object.entries(e.terms || {})) {
      if (term.kind === "ref" && term.ref) walk(term.ref);
      else if (term.kind === "value" && Number.isFinite(term.value)) locals.set(name, term.value);
    }
  })(key);
  let out = formula;
  for (const name of [...locals.keys()].sort((a, b) => b.length - a.length)) {
    if (allowed.has(name)) continue;
    const v = Math.round(locals.get(name) * 1000) / 1000;
    out = out.replace(new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g"), String(v));
  }
  return stripLeadEquals(nameCenterlines(out.replace(/\s+/g, " ").trim()));
}

/** A centre line written as a millimetre value (666.7) is shown as its name (XD1). */
function nameCenterlines(formula) {
  const entries = cur()?.prov?.entries || {};
  const xds = Object.entries(entries)
    .filter(([k]) => /^XD\d+$/.test(k))
    .map(([name, e]) => ({ name, value: e.value }));
  return String(formula).replace(/(?<![\d.])\d+(?:\.\d+)?(?![\d.])/g, (num) => {
    const v = Number(num);
    let best = null;
    for (const xd of xds) {
      const d = Math.abs(xd.value - v);
      if (d < 0.11 && (!best || d < best.d)) best = { name: xd.name, d };
    }
    return best ? best.name : num;
  });
}

function seedAxis(board, prov, axis) {
  const lo = concreteFormula(prov, `${board.id}.${axis}0`);
  const hi = concreteFormula(prov, `${board.id}.${axis}1`);
  return { from: "lo", at: lo, size: sizeFormula(lo, hi) };
}

function seedAxes(board, prov) {
  const axes = {};
  for (const a of ["x", "y", "z"]) {
    const lo = concreteFormula(prov, `${board.id}.${a}0`);
    const hi = concreteFormula(prov, `${board.id}.${a}1`);
    axes[a] = { from: "lo", at: lo, size: sizeFormula(lo, hi) };
  }
  return axes;
}

/** A board whose outline follows its box, so a placement rule can be saved. */
function ruleBoard(boardId) {
  const listed = cur()?.result?.debug?.ruleBoards;
  if (Array.isArray(listed)) return listed.includes(boardId);
  return !!tab()?.draft;
}

/** Six faces of a board that is still placed in generator code. Shown, not edited: a box rule would not be saved. */
function provenanceLabels(b) {
  const prov = cur().prov;
  const canEdit = ruleBoard(b.id);
  const faces = {};
  const sizes = {};
  for (const a of ["x", "y", "z"]) {
    const lo = concreteFormula(prov, `${b.id}.${a}0`);
    const hi = concreteFormula(prov, `${b.id}.${a}1`);
    for (const f of [`${a}0`, `${a}1`]) {
      const formula = toDisplay(f.endsWith("0") ? lo : hi);
      faces[f] = { drive: false, editable: canEdit, formula, pieces: formulaPieces(formula, primarySymbols()), lines: [`${FACE_NAMES[f]} ${fmt(b[f])}`, `= ${formula}`] };
    }
    const sz = toDisplay(sizeFormula(lo, hi));
    sizes[a] = { formula: sz, pieces: formulaPieces(sz), lines: [`${SIZE_NAMES[`${a}Size`]} ${fmt(b[`${a}1`] - b[`${a}0`])}`, `= ${sz}`] };
  }
  return { faces, sizes };
}

function buildModeOverlay() {
  if (modeGroup) { cabRoot.remove(modeGroup); disposeAnnotations(modeGroup); modeGroup = null; }
  clearFacePlanes();
  labelOverlay.set([]);
  const t = tab();
  const c = cur();
  if (!t?.mode || !c) { syncParamTray(); return; }
  const b = c.boards.get(t.mode.board);
  const rule = placementRule(t.mode.board);
  if (!b) { t.mode = null; syncParamTray(); return; }
  if (t.mode.kind === "default") {
    const { group, items } = buildDefaultAnnotations(b, rule ? modeLabels(b, rule) : provenanceLabels(b));
    modeGroup = group;
    labelOverlay.set(items);
  } else {
    modeGroup = buildFaceOverlay(b);
  }
  if (modeGroup) cabRoot.add(modeGroup);
  syncParamTray();
}

/** First-level inputs: the symbols a formula is allowed to gain or lose by dragging. */
function primaryParams() {
  const out = [];
  for (const g of MODULES[tab()?.moduleId]?.benchInputs || []) {
    for (const f of g.fields || []) {
      if (!f.sym || f.kind === "select" || f.kind === "bool") continue;
      out.push({ sym: f.sym, label: f.label });
    }
  }
  return out;
}
function primarySymbols() {
  return primaryParams().map((p) => p.sym);
}

/** The chip currently being dragged. `face` is set when it came out of a formula. */
let paramDrag = null;
const dragGhost = document.createElement("div");
dragGhost.className = "param-chip drag-ghost";
dragGhost.hidden = true;
document.body.append(dragGhost);
const blankDragImage = document.createElement("canvas");
blankDragImage.width = 1;
blankDragImage.height = 1;

function placeDragGhost(e) {
  dragGhost.style.left = `${e.clientX + 14}px`;
  dragGhost.style.top = `${e.clientY + 16}px`;
}

/** Start a chip drag. The native drag image is blank; a chip follows the cursor instead. */
function startParamDrag(e, payload) {
  paramDrag = payload;
  e.dataTransfer.setData("text/plain", payload.sym);
  e.dataTransfer.setData("text/cablab-param", payload.sym);
  if (payload.face) e.dataTransfer.setData("text/cablab-face", payload.face);
  e.dataTransfer.effectAllowed = payload.face ? "move" : "copy";
  e.dataTransfer.setDragImage(blankDragImage, 0, 0);
  dragGhost.textContent = payload.sym;
  dragGhost.hidden = false;
  placeDragGhost(e);
}

function endParamDrag() {
  paramDrag = null;
  dragGhost.hidden = true;
  $("#paramTray").classList.remove("drop");
  document.querySelectorAll(".formula-chips.drop").forEach((el) => el.classList.remove("drop"));
}

function syncParamTray() {
  const tray = $("#paramTray");
  const t = tab();
  const on = t?.mode?.kind === "default";
  tray.classList.toggle("hidden", !on);
  if (!on) { tray.replaceChildren(); return; }
  const seen = new Set();
  const items = [];
  const push = (sym, label) => {
    if (!sym || seen.has(sym)) return;
    seen.add(sym);
    items.push({ sym, label });
  };
  for (const p of primaryParams()) push(p.sym, p.label || p.sym);
  const onBoard = [];
  for (const it of labelOverlay.items) {
    for (const piece of formulaPieces(it.formula || "")) if (piece.kind === "param") onBoard.push(piece.sym);
  }
  t.mode.palette = [...new Set([...(t.mode.palette || []), ...onBoard])];
  for (const sym of t.mode.palette) push(sym, sym);
  const chips = items.map((p) => {
    const chip = h("span", { class: "param-chip", text: p.sym, title: p.label && p.label !== p.sym ? p.label : "拖到蓝色公式上加入", draggable: "true" });
    chip.addEventListener("dragstart", (e) => startParamDrag(e, { sym: p.sym, face: null }));
    return chip;
  });
  tray.replaceChildren(h("span", { class: "tray-label", text: "参数" }), ...(chips.length ? chips : [h("span", { class: "muted", text: "这块板上还没有参数" })]));
}

$("#paramTray").addEventListener("dragover", (e) => {
  if (!paramDrag?.face && ![...e.dataTransfer.types].includes("text/cablab-face")) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = "move";
  $("#paramTray").classList.add("drop");
});
$("#paramTray").addEventListener("dragleave", (e) => {
  if (e.relatedTarget && $("#paramTray").contains(e.relatedTarget)) return;
  $("#paramTray").classList.remove("drop");
});
$("#paramTray").addEventListener("drop", (e) => {
  e.preventDefault();
  $("#paramTray").classList.remove("drop");
  const sym = e.dataTransfer.getData("text/cablab-param") || paramDrag?.sym;
  const face = e.dataTransfer.getData("text/cablab-face") || paramDrag?.face;
  const t = tab();
  const open = editingBar();
  if (open && face && open.dataset.face === face && removeChip(open, sym)) return;
  const it = labelOverlay.items.find((x) => x.key === face);
  if (!t?.mode || !sym || !face || !it) return;
  applyFaceFormula(t.mode.board, face, removeParam(fromDisplay(it.formula, names()), sym));
});
document.addEventListener("dragover", (e) => { if (paramDrag) placeDragGhost(e); });
document.addEventListener("dragend", endParamDrag);

/** One formula. Click a blue one to edit: chips stay whole, operators and numbers are typed. */
function formulaRow(expr, { face, drag }) {
  const id = tab()?.mode?.board;
  if (face && id && !entryOf(cur()?.prov, `${id}.${face}`)?.formula) {
    return h("span", { class: "muted", text: "还没有公式" });
  }
  const row = h("div", { class: "formula-chips" });
  row.append(h("span", { class: "formula-op", text: "= " }));
  const bar = h("div");
  row.append(bar);
  bindFormulaBar(bar, {
    expr,
    edit: drag,
    face,
    dragging: () => !!paramDrag,
    onDragStart: (e, sym) => startParamDrag(e, { sym, face }),
    onCommit: (text) => {
      const res = applyFaceFormula(tab().mode.board, face, text);
      if (!res?.ok && tab()?.mode) {
        tab().mode.error = res?.error || "没有采用";
        renderSelection();
        buildModeOverlay();
      }
    },
  });
  return row;
}

const BLANK_LAYOUT = { module: "draft", version: 1, boards: {} };
let branchMemo = { key: "", hits: {} };

function codeFormula(result, boardId, face) {
  return stripLeadEquals(result?.debug?.provenance?.entries?.[`${boardId}.${face}`]?.formula || "").replace(/\s+/g, " ").trim();
}

function switchValue(key) {
  const sw = (MODULES[tab()?.moduleId]?.benchSwitches || []).find((s) => s.key === key);
  return sw ? sw.get(tab().params) : undefined;
}

/** Switches already on this module that change this axis. Others stay off the tree. */
function faceBranches(boardId, axis) {
  const t = tab();
  const switches = MODULES[t?.moduleId]?.benchSwitches || [];
  if (!t || !switches.length) return [];
  const key = `${t.id}|${JSON.stringify(t.params)}`;
  if (branchMemo.key !== key) branchMemo = { key, hits: {} };
  const slot = `${boardId}.${axis}`;
  if (branchMemo.hits[slot]) return branchMemo.hits[slot];
  const branches = [];
  for (const sw of switches) {
    const cur = sw.get(t.params);
    const leaves = sw.options.map(([id, label]) => {
      const res = generate(t.moduleId, sw.set(structuredClone(t.params), id), BLANK_LAYOUT);
      const faces = {};
      for (const f of [`${axis}0`, `${axis}1`]) faces[f] = codeFormula(res, boardId, f);
      const formula = [`${axis}0`, `${axis}1`].map((f) => faces[f]).join(" | ");
      return { id, label, formula, faces, current: id === cur };
    });
    if (new Set(leaves.map((l) => l.formula)).size > 1) branches.push({ key: sw.key, label: sw.label, leaves });
  }
  branchMemo.hits[slot] = branches;
  return branches;
}

/** `this` writes only the open situation. `all` writes one formula for every situation. */
function editWhen(boardId, face) {
  const t = tab();
  const branches = faceBranches(boardId, face[0]);
  if (!branches.length || t.mode?.caseScope?.[face[0]] === "all") return { universal: true, when: undefined, branches };
  const when = {};
  for (const b of branches) when[b.key] = switchValue(b.key);
  return { universal: false, when, branches };
}

function shownCase(raw, boardId, axis) {
  if (!raw) return null;
  const branches = faceBranches(boardId, axis);
  const now = {};
  for (const b of branches) now[b.key] = switchValue(b.key);
  const list = raw.cases?.length ? raw.cases : [raw];
  const hit = list.filter((c) => !c.when || Object.entries(c.when).every(([k, v]) => now[k] === v));
  hit.sort((a, b) => Object.keys(b.when || {}).length - Object.keys(a.when || {}).length);
  return hit[0] || null;
}

function withAxis(layout, board, face, prov) {
  const spec = editWhen(board.id, face);
  const when = spec.universal ? undefined : spec.when;
  if (!spec.universal || !layout.boards?.[board.id]?.axes?.[face[0]]) layout = ensureAxis(layout, board.id, face[0], seedAxis(board, prov, face[0]), when);
  return { layout, when, universal: spec.universal };
}

function scopeText(branches) {
  if (branches.length === 1) {
    const cur = branches[0].leaves.find((l) => l.current)?.label || "当前";
    return { this: `只改${cur}`, all: `${branches[0].leaves.map((l) => l.label).join("和")}用同一条` };
  }
  return { this: "只改当前这一档", all: "这几档用同一条" };
}

/** The fork under one axis. A switch is a branch only when its leaves disagree. */
function caseTree(boardId, axis, { choose = true } = {}) {
  if (!(MODULES[tab()?.moduleId]?.benchSwitches || []).length) return null;
  const branches = faceBranches(boardId, axis);
  if (!branches.length) return h("div", { class: "tree-plain", text: "这一面不分叉。" });
  const t = tab();
  const scope = t.mode?.caseScope?.[axis] || "this";
  const setScope = (value) => {
    t.mode.caseScope = { ...(t.mode.caseScope || {}), [axis]: value };
    renderSelection();
  };
  const words = scopeText(branches);
  const branchNode = (b) => {
    const show = [`${axis}0`, `${axis}1`].filter((f) => new Set(b.leaves.map((l) => l.faces?.[f])).size > 1);
    return h("li", {}, [
      h("div", { class: "tree-name", text: b.label }),
      h("ul", {}, b.leaves.map((leaf) => h("li", {}, [
        h("div", { class: `tree-name leaf${leaf.current ? " on" : ""}` }, [
          h("span", { text: leaf.label }),
          leaf.current ? h("span", { class: "tree-now", text: "当前" }) : null,
        ]),
        ...show.map((f) => h("div", { class: "tree-formula" }, [
          h("span", { class: "tree-face", text: FACE_NAMES[f] }),
          h("span", { text: leaf.faces?.[f] ? toDisplay(leaf.faces[f]) : "—" }),
        ])),
      ]))),
    ]);
  };
  return h("div", { class: "case-tree" }, [
    h("ul", { class: "tree" }, branches.map(branchNode)),
    ...(choose ? [
      h("div", { class: "tree-note", text: scope === "all" ? "下面的公式写成一条，这几档都用。" : "下面的公式只写到标着「当前」的那一档。另一档仍用原来的公式。" }),
      h("div", { class: "btn-row" }, [
        h("button", { class: `tb${scope === "this" ? " primary" : ""}`, text: words.this, onclick: () => setScope("this") }),
        h("button", { class: `tb${scope === "all" ? " primary" : ""}`, text: words.all, onclick: () => setScope("all") }),
      ]),
    ] : []),
  ]);
}

/** Write one face formula. A board that has no placement rule yet gets one from its current faces, so the edit moves it. */
function applyFaceFormula(boardId, face, text) {
  const t = tab();
  const c = cur();
  const expr = fromDisplay(text, names());
  if (!expr) return { ok: false, error: "公式是空的" };
  if (t.mode) t.mode.error = null;
  let layout = t.draft?.layout;
  if (!layout) return { ok: false, error: "这个生成器还没有放置规则文件" };
  const prep = withAxis(layout, c.boards.get(boardId), face, c.prov);
  let next;
  try { next = setFace(prep.layout, boardId, face, expr, prep.when, prep.universal); } catch (err) { return { ok: false, error: err.message }; }
  return tryLayout(next, `${boardId}.${face} = ${expr}`, { mode: "default", board: boardId, face, when: prep.when || null });
}

/** Default mode for a board whose position was computed in the generator: blue faces are editable, the size is the formula. */
function renderProvenancePanel(panel, id, b) {
  const prov = cur().prov;
  const t = tab();
  const canEdit = ruleBoard(id);
  panel.append(h("div", { class: "panel-head" }, [
    h("div", { class: "panel-title", text: `${id} · ${boardLabel(id)} · 默认模式` }),
    h("div", { class: "panel-sub", text: canEdit
      ? "点蓝色公式再编辑。参数是整颗按钮，退格删掉整颗，字母不能改；运算和数字可以直接改，回车确认。这是草稿，右下角「提交」才写入 layout.json。"
      : t.draft
        ? "这是现在的位置公式，只能看。缺口和槽由代码算，改一条位置不会存上，板还在原来的地方。"
        : "这是现在的位置公式，只能看。这个生成器还没有放置规则文件。" }),
  ]));
  for (const a of ["x", "y", "z"]) {
    const lo = concreteFormula(prov, `${id}.${a}0`);
    const hi = concreteFormula(prov, `${id}.${a}1`);
    const rows = [`${a}0`, `${a}1`].map((f) => {
      const text = toDisplay(f.endsWith("0") ? lo : hi);
      return h("div", { class: "face-row" }, [
        h("span", { class: "fname", text: FACE_NAMES[f] }),
        h("span", { class: "fval", text: fmt(b[f]) }),
        formulaRow(text, { face: f, drag: canEdit }),
      ]);
    });
    const sz = toDisplay(sizeFormula(lo, hi));
    panel.append(h("div", { class: "mode-axis" }, [
      h("div", { class: "axis-title" }, [h("span", { text: `${AXIS_NAMES[a]}（${a.toUpperCase()}）` })]),
      ...rows,
      h("div", { class: "size-row" }, [
        h("span", { text: SIZE_NAMES[`${a}Size`] }),
        h("span", { class: "fval", text: fmt(b[`${a}1`] - b[`${a}0`]) }),
        formulaRow(sz, { drag: false }),
      ]),
      caseTree(id, a, { choose: canEdit }),
    ]));
  }
  if (t.mode.error) panel.append(h("div", { class: "mode-err", text: `没有采用：${t.mode.error}` }));
  panel.append(modeButtons("default"));
}

/** Right panel in default mode: one block per axis, the two faces editable, the size read-only. */
function renderDefaultPanel(panel) {
  const t = tab();
  const c = cur();
  const id = t.mode.board;
  const b = c.boards.get(id);
  const rule = placementRule(id);
  if (!rule) { renderProvenancePanel(panel, id, b); return; }
  panel.append(h("div", { class: "panel-head" }, [
    h("div", { class: "panel-title", text: `${id} · ${boardLabel(id)} · 默认模式` }),
    h("div", { class: "panel-sub", text: "点蓝色公式再编辑。参数是整颗按钮，退格删掉整颗，字母不能改；运算和数字可以直接改，回车确认。整块板沿这条轴平移，尺寸不变。" }),
  ]));
  for (const a of ["x", "y", "z"]) {
    const r = shownCase(rule.axes[a], id, a);
    if (!r) {
      const lo = concreteFormula(c.prov, `${id}.${a}0`);
      const hi = concreteFormula(c.prov, `${id}.${a}1`);
      const rows = [`${a}0`, `${a}1`].map((f) => {
        const text = toDisplay(f.endsWith("0") ? lo : hi);
        return h("div", { class: "face-row" }, [
          h("span", { class: "fname", text: FACE_NAMES[f] }),
          h("span", { class: "fval", text: fmt(b[f]) }),
          formulaRow(text, { face: f, drag: true }),
        ]);
      });
      panel.append(h("div", { class: "mode-axis" }, [
        h("div", { class: "axis-title" }, [h("span", { text: `${AXIS_NAMES[a]}（${a.toUpperCase()}）` })]),
        ...rows,
        h("div", { class: "size-row" }, [
          h("span", { text: SIZE_NAMES[`${a}Size`] }),
          h("span", { class: "fval", text: fmt(b[`${a}1`] - b[`${a}0`]) }),
          formulaRow(sizeFormula(lo, hi), { drag: false }),
        ]),
        caseTree(id, a),
      ]));
      continue;
    }
    const drive = `${a}${r.from === "lo" ? "0" : "1"}`;
    const rows = [`${a}0`, `${a}1`].map((f) => {
      const isDrive = f === drive;
      const text = isDrive ? toDisplay(r.at) : drivenText(a, r);
      return h("div", { class: `face-row${isDrive ? " drive" : ""}` }, [
        h("span", { class: "fname", text: FACE_NAMES[f] }),
        h("span", { class: "fval", text: fmt(b[f]) }),
        formulaRow(text, { face: f, drag: true }),
      ]);
    });
    const sz = entryOf(c.prov, `${id}.${a}Size`)?.value ?? b[`${a}1`] - b[`${a}0`];
    const sticks = [`${a}0`, `${a}1`].map((f) => [f, entryOf(c.prov, `${id}.frame.${f}`)?.value]).filter(([f, v]) => v != null && Math.abs(v - b[f]) > 1e-6);
    panel.append(h("div", { class: "mode-axis" }, [
      h("div", { class: "axis-title" }, [
        h("span", {}, [h("span", { text: `${AXIS_NAMES[a]}（${a.toUpperCase()}）` }), r.relation ? h("span", { class: "rel-chip", text: `${r.relation.kind === "contact" ? "贴合" : "齐平"} ${toDisplay(r.relation.ref)}` }) : null]),
        h("span", { class: "muted", text: "● = 驱动面" }),
      ]),
      ...rows,
      h("div", { class: "size-row", title: "尺寸在板件编辑里改，这里只读" }, [h("span", { text: SIZE_NAMES[`${a}Size`] }), h("span", { class: "fval", text: fmt(sz) }), formulaRow(r.size, { drag: false })]),
      ...(sticks.length ? [h("div", { class: "mode-note", text: `轮廓伸出了定位框：${sticks.map(([f, v]) => `${FACE_NAMES[f]}实际 ${fmt(b[f])}，定位框 ${fmt(v)}`).join("；")}。公式定的是定位框，改它整块板（连同轮廓）一起移。` })] : []),
      caseTree(id, a),
    ]));
  }
  if (t.mode.error) panel.append(h("div", { class: "mode-err", text: `没有采用：${t.mode.error}` }));
  const tied = tiedFeatures(id);
  if (tied.length) {
    panel.append(section("跟着别的板定位的加工", [
      h("div", { class: "mode-note", text: "和已提交的规则比，这块板的位置或外包变了，下面这些孔槽在板上的位置也跟着变了：它们的公式指向别的板或板的另一端，按那条关系定位（§5.6）。要让它们随板走，得改它们的公式。" }),
      ...tied.map((f) => h("div", { class: "kv" }, [h("span", { text: `${f.id} · ${f.kind}` }), h("b", { text: f.formula })])),
    ]));
  }
  panel.append(modeButtons("default"));
}

/**
 * Features on `boardId` that did not follow the board when it moved: their board-local place
 * differs between the committed rules and the draft. Generic — the formula says what they follow.
 */
function tiedFeatures(boardId) {
  const t = tab();
  const c = cur();
  if (!t?.draft || !isDirty(t.draft)) return [];
  const base = generate(t.moduleId, t.params, t.draft.base);
  const a = base.boards?.find((b) => b.id === boardId);
  const b = c.boards.get(boardId);
  if (!a || !b) return [];
  const moved = ["x0", "y0", "z0"].some((f) => Math.abs(a[f] - b[f]) > 1e-6);
  if (!moved) return [];
  const where = (f) => [f.u0 ?? f.center?.[0], f.v0 ?? f.center?.[1]];
  // Outline points generated from other boards (divider notches) stay with those boards too.
  const shape = (x) => {
    const [P, Q] = planeAxes(x.profilePlane);
    const pv = x.profileVector || [];
    if (!pv.length) return "";
    const mp = Math.min(...pv.map((p) => Number(p[P])));
    const mq = Math.min(...pv.map((p) => Number(p[Q])));
    return pv.map((p) => `${Math.round((Number(p[P]) - mp) * 1000)},${Math.round((Number(p[Q]) - mq) * 1000)}`).join(" ");
  };
  const before = new Map(a.faces.flatMap((face) => face.features.map((f) => [`${face.id}.${f.id}`, where(f)])));
  const [U] = planeAxes(b.profilePlane);
  const out = [];
  for (const face of b.faces || []) {
    for (const f of face.features) {
      const was = before.get(`${face.id}.${f.id}`);
      if (!was) continue;
      const now = where(f);
      if (Math.abs((was[0] ?? 0) - (now[0] ?? 0)) < 1e-6 && Math.abs((was[1] ?? 0) - (now[1] ?? 0)) < 1e-6) continue;
      const e = f.key ? entryOf(c.prov, `${f.key}.${U}`) || entryOf(c.prov, `${f.key}.${U}0`) : null;
      out.push({ id: f.id, kind: f.kind, formula: e ? e.formula : "（无公式）" });
    }
  }
  // A corner edit explains its own shape change; otherwise a changed outline is the notches staying put.
  const cornerEdited = diffLayouts(t.draft.base, t.draft.layout).some((d) => d.board === boardId && d.what === "corner");
  if (shape(a) && shape(a) !== shape(b) && !cornerEdited) {
    out.push({ id: "轮廓缺口", kind: "outline", formula: "按分隔板位置生成，留在分隔板处" });
  }
  return out;
}

// Face mode: pick the face to move (on this board), then the reference face (any other board,
// the faint ones too), then contact or flush. The result is the same axis record default mode
// edits — `at` is the reference face — plus the relation, so contact keeps being checked.

const faceName = (board, face) => `${board}.${FACE_NAMES[face]}`;
const pickLabel = (p) => {
  if (!p?.notch) return faceName(p.board, p.face);
  const kind = p.pocket === "groove" ? "半槽" : p.pocket === "cutout" ? "开孔" : "台阶";
  return `${p.board} ${kind} ${p.expr}`;
};

/** A notch plane's recorded formula, else the box face. */
function planeExpr(c, board, f) {
  if (!f.notch) return `${board.id}.${f.face}`;
  let best = null;
  for (const [k, e] of Object.entries(c.prov?.entries || {})) {
    if (!k.startsWith(board.id)) continue;
    if (Math.abs(e.value - f.value) > 0.05) continue;
    const named = !/\[\d+\]/.test(k);
    if (!best || (named && !best.named) || (named === best.named && k.length < best.k.length)) best = { k, named };
  }
  return best ? best.k : String(Math.round(f.value * 1000) / 1000);
}

/** Face mode looks through the faint boards: step ① takes the first hit on this board, ② the first on any other. */
function faceHit(clientX, clientY) {
  const t = tab();
  const ray = rayFromClient(clientX, clientY);
  raycaster.set(ray.origin, ray.direction);
  const hits = raycaster.intersectObjects(Array.from(boardGroups.values()).map((g) => g.mesh), false);
  const wantSelf = !t.mode.pick?.move || t.mode.pick.step === "kind" || t.mode.pick.step === "view";
  return hits.find((h) => (h.object.userData.boardId === t.mode.board) === wantSelf) || hits[0] || null;
}

function facePick(hit) {
  const t = tab();
  const c = cur();
  const m = t.mode;
  m.error = null;
  m.done = null;
  if (!hit || hit.object.userData.kind !== "board") { renderSelection(); return; }
  const id = hit.object.userData.boardId;
  const b = c.boards.get(id);
  const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
  const point = hit.point.clone().sub(boardGroups.get(id)?.group.position || new THREE.Vector3());
  const f = faceAt(b, normal, point);
  if (f.error) { m.error = `${id}：${f.error}`; renderSelection(); return; }
  const picked = {
    board: id, face: f.face, axis: f.axis, expr: planeExpr(c, b, f), notch: !!f.notch, pocket: f.pocket || null,
    value: f.value, along: f.along, span: f.span, cross: f.cross, spanCross: f.spanCross, feature: f.feature || null,
    delta: f.notch ? Math.round((b[f.face] - f.value) * 1000) / 1000 : 0,
  };
  const pick = m.pick;
  if (id === m.board) {
    pick.move = picked;
    pick.ref = null;
    pick.kind = null;
    pick.step = "ref";
  } else if (!pick.move) {
    m.error = `第一个面要选在 ${m.board} 上（要移动的面）`;
  } else if (f.axis !== pick.move.axis && f.axis !== pick.move.face[0]) {
    m.error = `${pickLabel(pick.move)} 和 ${pickLabel(picked)} 不沿同一条轴：一条关系只管一条轴，不旋转板件`;
  } else {
    pick.ref = picked;
    pick.kind = null;
    pick.step = "kind";
  }
  log("bench.face.pick", { module: t.moduleId, board: id, face: f.face, notch: !!f.notch, pocket: f.pocket || null, expr: picked.expr, step: pick.step, error: m.error });
  buildModeOverlay();
  renderSelection();
}

function gapText(gap) {
  const n = Number(gap) || 0;
  return n ? `，间隙 ${n} mm` : "";
}

/** The footprint used for the contact check. A notch, half-slot or opening is that face, not the outer box. */
function pickRegion(c, pick) {
  const b = c.boards.get(pick.board);
  if (!pick.notch) return faceRegion(b, pick.face);
  const axis = pick.axis || pick.face[0];
  const [k1, k2] = ["x", "y", "z"].filter((k) => k !== axis);
  const spanOf = (k) => {
    if (pick.along === k && pick.span) return pick.span;
    if (pick.cross === k && pick.spanCross) return pick.spanCross;
    return [b[`${k}0`], b[`${k}1`]];
  };
  const s1 = spanOf(k1);
  const s2 = spanOf(k2);
  return {
    axis,
    value: pick.value,
    bounds: { [k1]: s1, [k2]: s2 },
    contains(p) {
      return p[k1] >= s1[0] - 0.01 && p[k1] <= s1[1] + 0.01 && p[k2] >= s2[0] - 0.01 && p[k2] <= s2[1] + 0.01;
    },
  };
}

/** What a relation would do, checked by generating with it. */
function relationCandidate(kind) {
  const t = tab();
  const c = cur();
  const { move, ref } = t.mode.pick;
  const refKey = ref.expr || `${ref.board}.${ref.face}`;
  const gap = Number(t.mode.gap) || 0;
  if (kind === "contact" && move.face[1] === ref.face[1] && !move.notch && !ref.notch) {
    return { ok: false, error: `接触要两个面相向：${pickLabel(move)} 和 ${pickLabel(ref)} 朝同一个方向，只能延伸` };
  }
  if (!t?.draft?.layout) return { ok: false, error: "这个生成器还没有放置规则文件" };
  let layout = t.draft.layout;
  const prep = withAxis(layout, c.boards.get(move.board), move.face, c.prov);
  layout = prep.layout;
  let next;
  try { next = setRelation(layout, move.board, move.face, refKey, kind, gap, move.delta || 0, prep.when, prep.universal); } catch (err) { return { ok: false, error: err.message }; }
  const res = generate(t.moduleId, t.params, next);
  if (res.validation?.errors?.length) return { ok: false, error: res.validation.errors.join("；") };
  const nb = res.boards.find((x) => x.id === move.board);
  const rb = res.boards.find((x) => x.id === ref.board);
  const delta = nb[move.face] - c.boards.get(move.board)[move.face];
  let area = null;
  if (kind === "contact") {
    const ra = pickRegion(c, move);
    const rb = pickRegion(c, ref);
    ra.value = rb.value;
    area = overlapArea(ra, rb);
    if (area < 1) return { ok: false, error: `${pickLabel(move)} 移过去后和 ${pickLabel(ref)} 在平面内没有重叠：接触不成立（不会为此改动另外两条轴）` };
  }
  const old = layout.boards[move.board].axes[move.face[0]];
  return { ok: true, next, delta, area, replaced: ruleText(move.face[0], old) };
}

function confirmRelation() {
  const t = tab();
  const { move, ref, kind } = t.mode.pick;
  const cand = relationCandidate(kind);
  if (!cand.ok) { t.mode.error = cand.error; renderSelection(); return; }
  const label = `${pickLabel(move)} ${kind === "contact" ? "接触" : "延伸"}${gapText(t.mode.gap)} ${pickLabel(ref)}`;
  t.mode.error = null;
  const kept = t.nudge;
  t.nudge = null;
  const res = tryLayout(cand.next, label, { mode: "face", board: move.board, face: move.face, ref: `${ref.board}.${ref.face}`, relation: kind });
  if (!res.ok) { t.nudge = kept; t.mode.error = res.error; renderSelection(); return; }
  if (res.unchanged) applyExplode();
  t.mode.pick = { step: "move" };
  const axis = move.face[0];
  t.mode.done = `已建立：${label}。${move.board} 已沿${AXIS_NAMES[axis]}移动 ${cand.delta >= 0 ? "+" : ""}${fmt(cand.delta)} mm。这是草稿，右下角「提交」才写入 layout.json。`;
  log("bench.face.relation", { module: t.moduleId, board: move.board, face: move.face, ref: `${ref.board}.${ref.face}`, relation: kind });
  buildModeOverlay();
  renderSelection();
}

function renderFacePanel(panel) {
  const t = tab();
  const id = t.mode.board;
  const pick = t.mode.pick || { step: "move" };
  const N = names();
  panel.append(h("div", { class: "panel-head" }, [
    h("div", { class: "panel-title", text: `${id} · ${boardLabel(id)} · 面的模式` }),
    h("div", { class: "panel-sub", text: ruleBoard(id)
      ? `先点 ${id} 上要移动的面，再点作为参照的面（其他板是半透明的，也能点）。一条关系只管一条轴：${id} 只沿那个面的法向整体平移，尺寸、朝向和另外两条轴不变，参照板不会被推动。`
      : `${id} 的缺口和槽由代码算。可以点它的面当别的板的参照。给 ${id} 自己建一条位置不会存上，板还在原来的地方。` }),
  ]));
  const nudged = t.nudge && Object.values(t.nudge).some((v) => Math.hypot(v[0], v[1], v[2]) > 0.5);
  panel.append(h("div", { class: "btn-row" }, [
    h("button", { class: `tb${t.faceMove ? " primary" : ""}`, text: "移动 M", title: `只拖 ${id}，把它从叠在一起的面上挪开，再点要选的面。别的板不动。只改画面，不改规则。`, onclick: toggleFaceMove }),
    nudged ? h("button", { class: "tb", text: "放回", title: "每块板回到规则算出的位置", onclick: clearNudge }) : null,
  ]));
  panel.append(
    h("div", { class: `pick-step${pick.step === "move" ? " active" : ""}` }, [h("span", { text: "① 移动面：" }), pick.move ? h("b", { text: pickLabel(pick.move) }) : h("span", { class: "muted", text: `在 3D 里点 ${id} 的一个面，外包面和缺口里的面都可以` })]),
    h("div", { class: `pick-step${pick.step === "ref" ? " active" : ""}` }, [h("span", { text: "② 参照面：" }), pick.ref ? h("b", { text: pickLabel(pick.ref) }) : h("span", { class: "muted", text: "点另一块板上沿同一条轴的面，包括缺口里的台阶" })]),
  );
  if (pick.move?.face) panel.append(caseTree(id, pick.move.face[0]));
  if (pick.step === "kind") {
    const gap = h("input", { type: "number", step: "0.1", value: t.mode.gap ?? "0", title: "正数是留空隙。接触仍要求两边轮廓在这个面上重叠。" });
    gap.addEventListener("input", () => { t.mode.gap = gap.value; });
    panel.append(h("div", { class: "face-row" }, [h("span", { class: "fname", text: "间隙" }), gap, h("span", { class: "muted", text: "mm" })]));
    const kinds = [["contact", "接触", "两个面相对，移过去之后轮廓要重叠。间隙让它们停在碰到之前。"], ["flush", "延伸", "两个面落到同一张延伸平面上，不必碰到，也不必相对。"]];
    panel.append(h("div", { class: "btn-row" }, kinds.map(([k, label, tip]) => h("button", { class: `tb${pick.kind === k ? " primary" : ""}`, text: label, title: tip, onclick: () => { pick.kind = k; t.mode.error = null; buildModeOverlay(); renderSelection(); } }))));
    if (pick.kind) {
      const cand = relationCandidate(pick.kind);
      if (!cand.ok) panel.append(h("div", { class: "mode-err", text: `不能建立：${cand.error}` }));
      else {
        const axis = pick.move.face[0];
        panel.append(section("预览", [
          h("div", { class: "kv" }, [h("span", { text: `${id} 沿${AXIS_NAMES[axis]}方向整体移动` }), h("b", { text: `${cand.delta >= 0 ? "+" : ""}${fmt(cand.delta)} mm（尺寸不变）` })]),
          h("div", { class: "mode-note", text: "确认后这块板立刻移到新位置，不必先返回整体。" }),
          h("div", { class: "kv" }, [h("span", { text: "替换这条轴原来的规则" }), h("b", { text: cand.replaced })]),
          cand.area != null ? h("div", { class: "kv" }, [h("span", { text: "接触面积（按真实轮廓）" }), h("b", { text: `${fmt(cand.area)} mm²` })]) : h("div", { class: "mode-note", text: "齐平只表示位置一致：不是接缝，不会产生加工。" }),
          h("div", { class: "btn-row" }, [
            h("button", { class: "tb primary", text: "确认建立", onclick: confirmRelation }),
            h("button", { class: "tb", text: "重选", onclick: () => { t.mode.pick = { step: "move" }; buildModeOverlay(); renderSelection(); } }),
          ]),
        ]));
      }
    }
  }
  if (t.mode.error) panel.append(h("div", { class: "mode-err", text: t.mode.error }));
  if (t.mode.done) panel.append(h("div", { class: "tag ok", text: t.mode.done }));
  // Relations already on this board: view, or turn back into a plain formula.
  const rule = placementRule(id);
  const rels = rule ? ["x", "y", "z"].filter((a) => rule.axes[a]?.relation) : [];
  panel.append(section(`${id} 上的面关系`, rels.length ? rels.map((a) => {
    const r = rule.axes[a];
    const face = `${a}${r.from === "lo" ? "0" : "1"}`;
    const [rb, rf] = r.relation.ref.split(".");
    return h("div", { class: "kv" }, [
      h("span", { text: `${AXIS_NAMES[a]}：${FACE_NAMES[face]} ${r.relation.kind === "contact" ? "接触" : "延伸"}${r.relation.offset ? `，间隙 ${r.relation.offset} mm` : ""} ${toDisplay(r.relation.ref, N)}` }),
      h("span", { class: "btn-row" }, [
        h("button", { class: "tb", text: "查看", onclick: () => { t.mode.pick = { step: "view", move: { board: id, face }, ref: { board: rb, face: rf }, kind: r.relation.kind }; buildModeOverlay(); renderSelection(); } }),
        h("button", { class: "tb", text: "改成公式", title: "去掉关系标记，位置公式保留（之后在默认模式里改）", onclick: () => {
          t.mode.error = null;
          const res = tryLayout(setFace(t.draft.layout, id, face, r.at), `${id}.${face} relation → formula`, { mode: "face", board: id, face });
          if (!res.ok) { t.mode.error = res.error; renderSelection(); }
        } }),
      ]),
    ]);
  }) : [h("div", { class: "empty small", text: "还没有。" })]));
  panel.append(modeButtons("face"));
}

/** Face highlights parented on the board, so a screen nudge carries the plane with it. */
let facePlanes = [];
function clearFacePlanes() {
  for (const m of facePlanes) {
    m.parent?.remove(m);
    m.geometry?.dispose();
    m.material?.dispose();
  }
  facePlanes = [];
}
function buildFaceOverlay() {
  const t = tab();
  const c = cur();
  const pick = t.mode.pick;
  if (!pick || (!pick.move && !pick.ref)) return null;
  const quad = (picked, color, grow = 0) => {
    const b = c.boards.get(picked.board);
    if (!b) return;
    const face = picked.face;
    const a = picked.axis || face[0];
    const [k1, k2] = ["x", "y", "z"].filter((k) => k !== a);
    const v = (picked.notch ? picked.value : b[face]) + (face[1] === "1" ? 0.6 : -0.6);
    const range = (k) => {
      if (!grow && picked.notch && picked.along === k && picked.span) return picked.span;
      if (!grow && picked.notch && picked.cross === k && picked.spanCross) return picked.spanCross;
      return [b[`${k}0`], b[`${k}1`]];
    };
    const [lo1, hi1] = range(k1).map((n, i) => n + (i ? grow : -grow));
    const [lo2, hi2] = range(k2).map((n, i) => n + (i ? grow : -grow));
    const P = (p, q) => { const o = new THREE.Vector3(); o[a] = v; o[k1] = p; o[k2] = q; return o; };
    const geo = new THREE.BufferGeometry().setFromPoints([P(lo1, lo2), P(hi1, lo2), P(hi1, hi2), P(lo1, lo2), P(hi1, hi2), P(lo1, hi2)]);
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: grow ? 0.12 : 0.55, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
    mesh.renderOrder = 50;
    const host = boardGroups.get(picked.board)?.group;
    (host || cabRoot).add(mesh);
    facePlanes.push(mesh);
  };
  if (pick.move) quad(pick.move, 0xffd166);
  if (pick.ref) {
    quad(pick.ref, 0x5fd4e8);
    if (pick.kind === "flush") quad(pick.ref, 0x5fd4e8, Math.max(150, bbox.getSize(new THREE.Vector3()).length() * 0.25));
  }
  return null;
}

// --- board edit: outline corners and feature depths (layout.json `outline` / `features`) ---------------
// Shape only: the placement frame never moves, a corner may leave it, the box becomes the outline's extent.

function boardEditable(boardId) {
  const r = placementRule(boardId);
  return !!(r && (r.outline || r.features));
}

/** Which corner rule an outline point is (frame-local coordinates match), or null for a generated point. */
function cornerOf(b, p) {
  if (p.corner) return p.corner;
  const rule = placementRule(b.id);
  if (!rule?.outline) return null;
  const prov = cur().prov;
  const [A, B] = planeAxes(b.profilePlane);
  const fa = entryOf(prov, `${b.id}.frame.${A}0`)?.value ?? b[`${A}0`];
  const fb = entryOf(prov, `${b.id}.frame.${B}0`)?.value ?? b[`${B}0`];
  const u = p.local[0] + b[`${A}0`] - fa;
  const v = p.local[1] + b[`${B}0`] - fb;
  for (const k of Object.keys(rule.outline.corners)) {
    const cu = entryOf(prov, `${b.id}.corner.${k}.u`)?.value;
    const cv = entryOf(prov, `${b.id}.corner.${k}.v`)?.value;
    if (Math.abs(cu - u) < 1e-6 && Math.abs(cv - v) < 1e-6) return k;
  }
  return null;
}

function applyCorner(id, k, coords, how) {
  const t = tab();
  let next = t.draft.layout;
  try { for (const [coord, expr] of coords) next = setCorner(next, id, k, coord, expr); } catch (err) { t.l3Error = err.message; renderSelection(); return; }
  t.l3Error = null;
  t.l3Corner = k;
  const res = tryLayout(next, `${id} ${k} ${coords.map(([c2, e]) => `${c2}=${e}`).join(" ")}`, { mode: "board", board: id, corner: k, how });
  t.l3Error = res.ok ? null : res.error;
  t.l3Corner = k;
  if (!res.ok || res.unchanged) renderSelection();
}

function dragPoint(b, p, du, dv) {
  const t = tab();
  const k = cornerOf(b, p);
  if (!k) { t.l3Error = "这个点由分隔板缺口生成，跟着后边走，不能单独拖动。拖四个角点。"; renderSelection(); return; }
  const c = placementRule(b.id).outline.corners[k];
  applyCorner(b.id, k, [["u", withOffset(c.u, du)], ["v", withOffset(c.v, dv)]], "drag");
}

function renderBoardEdit(panel) {
  const t = tab();
  const c = cur();
  const id = t.l3;
  const b = c.boards.get(id);
  const rule = placementRule(id);
  const N = names();
  panel.append(h("div", { class: "panel-head" }, [
    h("div", { class: "panel-title", text: `${id} · ${boardLabel(id)} · 板件编辑` }),
    h("div", { class: "panel-sub", text: "改轮廓点和加工深度。板件位置不变：点可以越出原来的外包，整块板不会被重新归零或挪位。位置在参数调试里改。" }),
  ]));
  if (rule.outline) {
    const [A, B] = planeAxes(b.profilePlane);
    const rows = Object.keys(rule.outline.corners).map((k) => {
      const cr = rule.outline.corners[k];
      const field = (coord) => {
        const text = toDisplay(cr[coord], N);
        const input = h("input", { type: "text", value: text, spellcheck: "false" });
        input.dataset.corner = `${k}.${coord}`;
        const go = () => { if (input.value !== text) applyCorner(id, k, [[coord, fromDisplay(input.value, N)]], "type"); };
        input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") { input.value = text; input.blur(); } });
        input.addEventListener("change", go);
        input.addEventListener("focus", () => { t.l3Corner = k; renderL3(); });
        return input;
      };
      const u = entryOf(c.prov, `${id}.corner.${k}.u`)?.value;
      const v = entryOf(c.prov, `${id}.corner.${k}.v`)?.value;
      return h("div", { class: `corner-row${t.l3Corner === k ? " active" : ""}` }, [
        h("span", { class: "fname", text: CORNER_NAMES[k] || k }),
        h("span", { class: "fval", text: `${fmt(u)}, ${fmt(v)}` }),
        field("u"), field("v"),
      ]);
    });
    panel.append(section(`轮廓控制点（${A}, ${B}，从定位框的起点量）`, [
      h("div", { class: "corner-row head" }, [h("span", {}), h("span", { class: "fval", text: "现在" }), h("span", { text: `横向 ${A}` }), h("span", { text: `纵向 ${B}` })]),
      ...rows,
      h("div", { class: "mode-note", text: "也可以在板件图里直接拖角点：拖完在原公式后面加上偏移（取整到 0.5 mm），公式保留。改一个角只动这个角；同时改左边两个角才是整条左边伸出。后边的分隔板缺口由分隔板位置生成，跟着后边走。" }),
    ]));
  }
  for (const [fid, feat] of Object.entries(rule.features || {})) {
    const group = `${id}.${fid}`;
    const segs = (b.faces || []).flatMap((f) => f.features).filter((f) => f.group === group);
    const value = entryOf(c.prov, `${id}.feat.${fid}.depth`)?.value;
    const text = toDisplay(feat.depth, N);
    const input = h("input", { type: "text", value: text, spellcheck: "false" });
    input.dataset.feature = fid;
    const go = () => {
      if (input.value === text) return;
      let next;
      try { next = setFeatureDepth(t.draft.layout, id, fid, fromDisplay(input.value, N)); } catch (err) { t.l3Error = err.message; renderSelection(); return; }
      t.l3Error = null;
      const res = tryLayout(next, `${group} depth = ${fromDisplay(input.value, N)}`, { mode: "board", board: id, feature: fid });
      t.l3Error = res.ok ? null : res.error;
      if (!res.ok || res.unchanged) renderSelection();
    };
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); if (e.key === "Escape") { input.value = text; input.blur(); } });
    input.addEventListener("change", go);
    input.addEventListener("focus", () => { t.l3Group = group; renderL3(); });
    const warn = (c.result.validation?.warnings || []).filter((w) => w.startsWith(`${id}:`) && /groove|cuts|灯槽|切穿/i.test(w));
    panel.append(section(`加工特征 · ${feat.label || fid}`, [
      h("div", { class: "face-row" }, [h("span", { class: "fname", text: "深度" }), h("span", { class: "fval", text: segs.length ? fmt(value) : "—" }), input]),
      h("div", { class: "mode-note", text: segs.length
        ? `作用范围：整个${feat.label || fid}，${segs.length} 段（${segs.map((s) => s.id.replace(`${id}_`, "")).join("、")}）共用这一条深度。槽口在加工面上不动，只有槽底跟着深度变。从板件图里点任何一段都会回到这里。`
        : "这个生成结果里没有这个特征（例如灯槽开关关着）。规则仍保留。" }),
      ...warn.map((w) => h("div", { class: "tag gap", text: w })),
    ]));
  }
  if (t.l3Error) panel.append(h("div", { class: "mode-err", text: `没有采用：${t.l3Error}` }));
  const sel = t.selection;
  if (sel?.kind === "point" && sel.id === id && !cornerOf(b, { local: sel.local, cabinet: sel.cabinet, keys: sel.keys })) {
    panel.append(pointFormulas(b, sel, c.prov));
  }
  panel.append(section("", [h("div", { class: "btn-row" }, [
    h("button", { class: "tb", text: "参数调试 · 默认模式", onclick: () => enterMode("default", id) }),
    h("button", { class: "tb", text: "面的模式", onclick: () => enterMode("face", id) }),
    h("button", { class: "tb", text: "返回整体", onclick: exitL3 }),
  ])]));
}

/** The two coordinates of one clicked point, each as a formula of params and rule constants. */
function pointFormulas(b, sel, prov) {
  const [A, B] = planeAxes(b.profilePlane);
  const rows = sel.keys.map((key, i) => {
    if (!key) return null;
    const e = entryOf(prov, key);
    const flat = flatFormula(prov, key);
    return h("div", { class: "face-row" }, [
      h("span", { class: "fname", text: i === 0 ? A : B }),
      h("span", { class: "fval", text: fmt(e ? e.value : sel.cabinet[i]) }),
      h("span", { class: "formula", text: flat ? `= ${toDisplay(flat)}` : "—" }),
    ]);
  });
  return h("div", { class: "mode-axis" }, rows);
}

function modeButtons(current) {
  const t = tab();
  const id = t.mode.board;
  return section("", [h("div", { class: "btn-row" }, [
    current !== "default" ? h("button", { class: "tb", text: "默认模式", onclick: () => enterMode("default", id) }) : null,
    current !== "face" ? h("button", { class: "tb", text: "面的模式", onclick: () => enterMode("face", id) }) : null,
    h("button", { class: "tb", text: "板件编辑", onclick: () => { exitMode(); enterL3(id); } }),
    h("button", { class: "tb", text: "返回整体", title: "Esc", onclick: exitMode }),
  ])]);
}

// --- 3D --------------------------------------------------------------------------------

const cabRoot = new THREE.Group();
cabRoot.name = "bench-cabinet";
scene.add(cabRoot);
const frontMat = new THREE.MeshStandardMaterial({ color: 0x9ec5d8, roughness: 0.6 });
const edgeMat = new THREE.LineBasicMaterial({ color: 0x4a4034 });
const pointMat = new THREE.MeshBasicMaterial({ color: 0x4f86e0 });
const pointOutlineMat = new THREE.MeshBasicMaterial({ color: 0xb48be0 });
const pointHoverMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const pointSelMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
const jointMats = { ok: new THREE.LineBasicMaterial({ color: 0x4fc46f }), gap: new THREE.LineBasicMaterial({ color: 0xe0a34f }), bad: new THREE.LineBasicMaterial({ color: 0xd94b4b }) };
const jointDotMats = { ok: new THREE.MeshBasicMaterial({ color: 0x4fc46f }), gap: new THREE.MeshBasicMaterial({ color: 0xe0a34f }), bad: new THREE.MeshBasicMaterial({ color: 0xd94b4b }) };

let boardGroups = new Map(); // boardId -> { group, mesh, edges, mat, center }
let pointMeshes = [];
let jointObjs = [];
let bbox = null;
let hover = null;
let explodePlan = null; // { rels, order, plan } from explode.js for the current result
// Section planes apply to the cabinet's materials only (the grid and axes stay whole).
const clipPlanes = [new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(0, -1, 0), 0), new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)];
renderer.localClippingEnabled = true;
const sharedClipped = [edgeMat, pointMat, pointOutlineMat, pointHoverMat, pointSelMat, ...Object.values(jointMats), ...Object.values(jointDotMats)];

function cabinetBox(boards) {
  const b = new THREE.Box3();
  for (const bd of boards) b.union(new THREE.Box3(new THREE.Vector3(bd.x0, bd.y0, bd.z0), new THREE.Vector3(bd.x1, bd.y1, bd.z1)));
  if (b.isEmpty()) b.set(new THREE.Vector3(0, 0, 0), new THREE.Vector3(1000, 400, 400));
  return b;
}

/** All pickable points of a board in the cabinet frame: outline vertices, corners, hinges. */
function pointsOf(board, prov, features) {
  const [A, B, T] = planeAxes(board.profilePlane);
  const t0 = board[`${T}0`];
  const t1 = board[`${T}1`];
  const out = [];
  for (const p of boardPoints(board, prov, features)) {
    const [a, b] = p.cabinet;
    // Outline points sit on both faces of the plate; corners on both ends of the thickness.
    const ts = p.kind === "feature" ? [t0] : [t0, t1];
    for (const tv of ts) {
      const pos = new THREE.Vector3();
      pos[A] = a; pos[B] = b; pos[T] = tv;
      out.push({ ...p, pos, side: tv === t0 ? 0 : 1 });
    }
  }
  return out;
}

function build3D(keepCamera) {
  const t = tab();
  const c = cur();
  cabRoot.clear();
  boardGroups = new Map();
  pointMeshes = [];
  jointObjs = [];
  hover = null;
  if (!t || !c) return;
  const boards = c.result.boards || [];
  bbox = cabinetBox(boards);
  explodePlan = planExplode(c.result);
  if (t.step != null) t.step = Math.min(t.step, explodePlan.order.length);

  for (const b of boards) {
    const door = doorMaterialFor(b);
    const base = door || (b.category === "front_panel" ? frontMat : carcassMat);
    // Resting tint after a highlight: the material's own colour (white under an image).
    const bodyHex = door ? base.color.getHex() : null;
    const mat = base.clone();
    // clone() drops the shader hook that lays out stipple / flakes / wood.
    mat.onBeforeCompile = base.onBeforeCompile;
    mat.customProgramCacheKey = base.customProgramCacheKey;
    const { mesh, edges } = boardMesh(b, mat, edgeMat);
    mesh.userData = { kind: "board", boardId: b.id };
    const group = new THREE.Group();
    group.add(mesh, edges);
    const coats = [];
    const bc = new THREE.Vector3((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    cabRoot.add(group);
    boardGroups.set(b.id, { group, mesh, edges, mat, coats, bodyHex, center: bc, board: b });
  }
  buildTrails();
  buildLabels();
  buildModeOverlay();
  applyExplode();
  applyCut();
  paintSelection();
  if (!keepCamera || !t.camera) {
    setBenchView(t.view || "3d");
  } else {
    camera.position.fromArray(t.camera.pos);
    controls.target.fromArray(t.camera.target);
    controls.update();
  }
}

function jointStatus(sep) {
  if (sep > 0.01) return "gap";
  if (sep < -0.01) return "bad";
  return "ok";
}

function buildJoints() {
  const t = tab();
  const c = cur();
  for (const j of jointObjs) { cabRoot.remove(j.line, j.dot); j.line.geometry.dispose(); j.dot.geometry.dispose(); }
  jointObjs = [];
  if (!t.showJoints || t.mode) return;
  const decls = c.result.relationshipDeclarations || [];
  decls.forEach((d, index) => {
    const A = boardGroups.get(d.panelAId);
    const B = boardGroups.get(d.panelBId);
    if (!A || !B) return;
    const sep = separation(A.board, B.board);
    const status = jointStatus(sep);
    const pa = A.center.clone().add(A.group.position);
    const pb = B.center.clone().add(B.group.position);
    const geo = new THREE.BufferGeometry().setFromPoints([pa, pb]);
    const line = new THREE.Line(geo, jointMats[status]);
    line.renderOrder = 12;
    const dot = new THREE.Mesh(new THREE.SphereGeometry(Math.max(4, bbox.getSize(new THREE.Vector3()).length() / 180), 10, 10), jointDotMats[status]);
    dot.position.copy(pa).lerp(pb, 0.5);
    dot.userData = { kind: "joint", index, decl: d, sep, status };
    dot.renderOrder = 16;
    cabRoot.add(line, dot);
    jointObjs.push({ line, dot, decl: d, sep, status, index });
  });
}

// --- explode: assembly / radial, steps, trails, labels ------------------------------------------
// Only the groups' positions move (docs/bench-spec.md). Geometry, boards and the result never change.

const GHOST_OPACITY = 0.22;
const STEP_MS = 380;
let explodeAnim = null;

/** Index of a board in the assembly order (-1 when unknown). */
function stepIndex(id) {
  return explodePlan ? explodePlan.order.indexOf(id) : -1;
}
/** In step mode: the board that just went in. */
function stepCurrentId() {
  const t = tab();
  if (!t || t.step == null || !explodePlan || t.step < 1) return null;
  return explodePlan.order[t.step - 1] || null;
}
/** In step mode: still waiting outside (drawn faint, at its exploded position). */
function isWaiting(id) {
  const t = tab();
  return !!(t && t.step != null && stepIndex(id) >= t.step);
}
/** Whether the exploded state is visible at all (something is offset or steps are on). */
function explodeActive() {
  const t = tab();
  return !!(t && (t.explode > 0 || t.step != null));
}

/** Target offset per board for the tab's mode / factor / step. */
function explodeTargets() {
  const t = tab();
  const c = cur();
  const out = new Map();
  if (!t || !c || !explodePlan) return out;
  const boards = c.result.boards || [];
  const factor = t.step != null ? Math.max(t.explode, 0.01) : t.explode;
  const size = bbox.getSize(new THREE.Vector3());
  const raw = t.explodeMode === "radial"
    ? radialOffsets(boards, factor)
    : assemblyOffsets(explodePlan.plan, explodePlan.order, explodeUnit(size), factor);
  for (const b of boards) {
    const o = raw.get(b.id) || [0, 0, 0];
    // Steps: boards already in sit at home; the rest wait at their exploded position.
    const home = t.step != null && stepIndex(b.id) < t.step;
    const at = home ? new THREE.Vector3() : new THREE.Vector3(o[0], o[1], o[2]);
    const n = t.nudge?.[b.id];
    if (n) at.add(new THREE.Vector3(n[0], n[1], n[2]));
    out.set(b.id, at);
  }
  return out;
}

/** Move the boards to their targets — at once (slider) or over STEP_MS (a step). */
function applyExplode({ animate = false } = {}) {
  const t = tab();
  if (!t || !bbox) return;
  const targets = explodeTargets();
  if (explodeAnim) { cancelAnimationFrame(explodeAnim); explodeAnim = null; }
  if (!animate) {
    for (const [id, g] of boardGroups) g.group.position.copy(targets.get(id) || new THREE.Vector3());
    afterExplodeMove();
    return;
  }
  const from = new Map(Array.from(boardGroups, ([id, g]) => [id, g.group.position.clone()]));
  const start = performance.now();
  const tick = (now) => {
    const k = Math.min(1, (now - start) / STEP_MS);
    const e = 1 - (1 - k) ** 3;
    for (const [id, g] of boardGroups) g.group.position.lerpVectors(from.get(id), targets.get(id) || new THREE.Vector3(), e);
    afterExplodeMove();
    explodeAnim = k < 1 ? requestAnimationFrame(tick) : null;
  };
  explodeAnim = requestAnimationFrame(tick);
}
/** Everything that hangs on the boards' positions. */
function afterExplodeMove() {
  buildJoints();
  updateTrails();
  updateLabels();
  applyOpacity();
}

function applyOpacity() {
  const t = tab();
  for (const [id, g] of boardGroups) {
    // Default mode fades the other boards. Face mode keeps them solid so the mating face stays readable.
    const inMode = t.mode?.kind === "default" && id !== t.mode.board;
    const o = inMode ? Math.min(t.opacity, MODE_GHOST) : isWaiting(id) ? Math.min(t.opacity, GHOST_OPACITY) : t.opacity;
    g.mat.transparent = o < 1;
    g.mat.opacity = o;
    g.mat.depthWrite = o >= 1;
    g.mat.needsUpdate = true;
    for (const m of g.coats) {
      m.transparent = o < 1;
      m.opacity = o;
      m.depthWrite = o >= 1;
      m.needsUpdate = true;
    }
    g.edges.material = isWaiting(id) || inMode ? edgeMatGhost : edgeMat;
  }
}

// Trails: a dashed line from where a board sits to where it is drawn; the board that just went in gets the accent.
const trailMat = new THREE.LineDashedMaterial({ color: 0x8a93a0, dashSize: 24, gapSize: 14, transparent: true, opacity: 0.8 });
const trailMatCur = new THREE.LineDashedMaterial({ color: 0xffd166, dashSize: 24, gapSize: 14 });
const edgeMatGhost = new THREE.LineBasicMaterial({ color: 0x4a4034, transparent: true, opacity: 0.3 });
let trails = null; // { all: LineSegments, cur: LineSegments }
function buildTrails() {
  if (trails) { cabRoot.remove(trails.all, trails.cur); trails.all.geometry.dispose(); trails.cur.geometry.dispose(); }
  const mk = (mat) => {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(Math.max(boardGroups.size, 1) * 6), 3));
    const l = new THREE.LineSegments(geo, mat);
    l.renderOrder = 11;
    l.frustumCulled = false;
    cabRoot.add(l);
    return l;
  };
  trails = { all: mk(trailMat), cur: mk(trailMatCur) };
}
function updateTrails() {
  const t = tab();
  if (!trails || !t) return;
  const on = t.trails !== false && explodeActive();
  const curId = stepCurrentId();
  let nAll = 0;
  let nCur = 0;
  const pa = trails.all.geometry.attributes.position;
  const pc = trails.cur.geometry.attributes.position;
  if (on) {
    for (const [id, g] of boardGroups) {
      const off = g.group.position;
      // The board that just went in is home: draw its trail from where it waited.
      const isCur = id === curId;
      if (!isCur && off.lengthSq() < 1) continue;
      const home = g.center;
      const away = isCur ? home.clone().add(explodeTargetsWaiting(id)) : home.clone().add(off);
      const p = isCur ? pc : pa;
      const n = isCur ? nCur : nAll;
      p.setXYZ(n * 2, home.x, home.y, home.z);
      p.setXYZ(n * 2 + 1, away.x, away.y, away.z);
      if (isCur) nCur += 1; else nAll += 1;
    }
  }
  for (const [l, n, p] of [[trails.all, nAll, pa], [trails.cur, nCur, pc]]) {
    p.needsUpdate = true;
    l.geometry.setDrawRange(0, n * 2);
    l.visible = n > 0;
    if (n) { l.computeLineDistances(); l.geometry.computeBoundingSphere(); }
  }
}
/** Where a board would wait if it were still outside (for the current board's trail). */
function explodeTargetsWaiting(id) {
  const t = tab();
  const c = cur();
  const boards = c.result.boards || [];
  const factor = Math.max(t.explode, 0.01);
  const raw = t.explodeMode === "radial" ? radialOffsets(boards, factor) : assemblyOffsets(explodePlan.plan, explodePlan.order, explodeUnit(bbox.getSize(new THREE.Vector3())), factor);
  const o = raw.get(id) || [0, 0, 0];
  return new THREE.Vector3(o[0], o[1], o[2]);
}

// Labels: the board id as a sprite at a constant screen size (the same role id nesting and labels use).
const labelTextures = new Map(); // `${text}|${tone}` -> CanvasTexture
function labelTexture(text, tone) {
  const key = `${text}|${tone}`;
  if (labelTextures.has(key)) return labelTextures.get(key);
  const dpr = 2;
  const cv = document.createElement("canvas");
  const ctx = cv.getContext("2d");
  ctx.font = `600 ${22 * dpr}px "Segoe UI", system-ui, sans-serif`;
  const w = Math.ceil(ctx.measureText(text).width) + 20 * dpr;
  const hgt = 34 * dpr;
  cv.width = w; cv.height = hgt;
  ctx.font = `600 ${22 * dpr}px "Segoe UI", system-ui, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  const r = 8 * dpr;
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, hgt - 2, r);
  ctx.fillStyle = tone === "cur" ? "rgba(255, 209, 102, 0.95)" : "rgba(26, 28, 31, 0.85)";
  ctx.fill();
  ctx.lineWidth = 2 * dpr;
  ctx.strokeStyle = tone === "cur" ? "#ffd166" : tone === "ghost" ? "rgba(138, 147, 160, 0.5)" : "#8a93a0";
  ctx.stroke();
  ctx.fillStyle = tone === "cur" ? "#1a1c1f" : tone === "ghost" ? "rgba(216, 221, 228, 0.55)" : "#d8dde4";
  ctx.fillText(text, w / 2, hgt / 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData = { aspect: w / hgt };
  labelTextures.set(key, tex);
  return tex;
}
let labelSprites = new Map(); // boardId -> Sprite
function buildLabels() {
  for (const s of labelSprites.values()) { cabRoot.remove(s); s.material.dispose(); }
  labelSprites = new Map();
  for (const [id] of boardGroups) {
    const mat = new THREE.SpriteMaterial({ map: labelTexture(id, ""), sizeAttenuation: false, depthTest: false, depthWrite: false, transparent: true });
    const s = new THREE.Sprite(mat);
    s.renderOrder = 40;
    s.visible = false;
    cabRoot.add(s);
    labelSprites.set(id, s);
  }
}
function updateLabels() {
  const t = tab();
  if (!t) return;
  const on = t.explodeLabels !== false && explodeActive();
  const curId = stepCurrentId();
  const hgt = 0.032; // fraction of the view height (× 2·tan(fov/2))
  for (const [id, s] of labelSprites) {
    s.visible = on;
    if (!on) continue;
    const g = boardGroups.get(id);
    const tone = id === curId ? "cur" : isWaiting(id) ? "ghost" : "";
    const tex = labelTexture(id, tone);
    if (s.material.map !== tex) { s.material.map = tex; s.material.needsUpdate = true; }
    s.position.copy(g.center).add(g.group.position);
    s.scale.set(hgt * tex.userData.aspect * camera.aspect, hgt, 1);
  }
}

/** Steps: n boards in. `null` leaves step mode. */
function setStep(n, how) {
  const t = tab();
  if (!t || !explodePlan) return;
  const N = explodePlan.order.length;
  const next = n == null ? null : Math.max(0, Math.min(N, n));
  if (next === t.step) return;
  // Entering steps with the slider at 0 would show nothing moving: give it a working distance.
  if (next != null && t.step == null && t.explode <= 0) { t.explode = 0.6; $("#explode").value = "0.6"; }
  t.step = next;
  applyExplode({ animate: true });
  paintSelection();
  syncToolbar();
  logExplode(how);
  saveState();
}
function logExplode(how) {
  const t = tab();
  if (!t) return;
  log("bench.explode", { module: t.moduleId, mode: t.explodeMode, factor: t.explode, step: t.step, of: explodePlan?.order.length ?? 0, board: stepCurrentId(), order: explodePlan?.order || [], how });
}
function applyCut() {
  const t = tab();
  if (!bbox) return;
  const planes = [];
  const min = bbox.min, max = bbox.max;
  if (t.cut.x < 1) { clipPlanes[0].constant = min.x + (max.x - min.x) * t.cut.x; planes.push(clipPlanes[0]); }
  if (t.cut.y < 1) { clipPlanes[1].constant = min.y + (max.y - min.y) * t.cut.y; planes.push(clipPlanes[1]); }
  if (t.cut.z < 1) { clipPlanes[2].constant = min.z + (max.z - min.z) * t.cut.z; planes.push(clipPlanes[2]); }
  const list = planes.length ? planes : null;
  for (const g of boardGroups.values()) {
    g.mat.clippingPlanes = list;
    for (const m of g.coats) m.clippingPlanes = list;
  }
  for (const m of sharedClipped) m.clippingPlanes = list;
}

function setBenchView(name) {
  const t = tab();
  t.view = name;
  $$("#viewGroup [data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  $("#viewLabel").textContent = name === "3d" ? "3D" : name[0].toUpperCase() + name.slice(1);
  setView(name);
  frameCabinet();
}
function frameCabinet() {
  if (!bbox) return;
  const sphere = bbox.getBoundingSphere(new THREE.Sphere());
  frame(sphere.center, Math.max(sphere.radius, 200));
  storeCamera();
}
function storeCamera() {
  const t = tab();
  if (!t) return;
  t.camera = { pos: camera.position.toArray(), target: controls.target.toArray() };
}

const HL = 0x3a2a00;
function paintSelection() {
  const t = tab();
  const sel = t?.selection;
  const curId = stepCurrentId();
  for (const [id, g] of boardGroups) {
    const on = (sel && (sel.kind === "board" || sel.kind === "face" || sel.kind === "point") && sel.id === id) || id === curId;
    const joint = sel && sel.kind === "joint" && (sel.a === id || sel.b === id);
    const l3 = t.l3 === id;
    g.mat.emissive.setHex(on || joint || l3 ? HL : 0x000000);
    g.mat.emissiveIntensity = on || l3 ? 1.2 : joint ? 0.8 : 0;
    const rest = g.bodyHex != null ? g.bodyHex : g.board.category === "front_panel" ? 0x9ec5d8 : STIPPLE_WHITE;
    g.mat.color.setHex(on || l3 ? 0xffe08a : joint ? 0xe8d7b0 : rest);
  }
  renderExplodeOrder();
  for (const m of pointMeshes) {
    const p = m.userData.point;
    const on = sel && sel.kind === "point" && sel.id === m.userData.boardId && sel.keys && sel.keys.join() === p.keys.join();
    m.material = on ? pointSelMat : p.kind === "outline" ? pointOutlineMat : pointMat;
    m.scale.setScalar(on ? 1.6 : 1);
  }
  for (const j of jointObjs) {
    const on = sel && sel.kind === "joint" && sel.index === j.index;
    j.dot.scale.setScalar(on ? 1.8 : 1);
  }
}

// --- picking -----------------------------------------------------------------------------

const raycaster = new THREE.Raycaster();
function pickAt(clientX, clientY) {
  const t = tab();
  if (!t) return null;
  const ray = rayFromClient(clientX, clientY);
  raycaster.set(ray.origin, ray.direction);
  const order = [];
  if (t.showPoints && pointMeshes.length) order.push(pointMeshes);
  if (t.showJoints && jointObjs.length) order.push(jointObjs.map((j) => j.dot));
  order.push(Array.from(boardGroups.values()).map((g) => g.mesh));
  for (const list of order) {
    const hits = raycaster.intersectObjects(list, false);
    if (hits.length) return hits[0];
  }
  return null;
}

let down = null;
let faceDrag = null;
canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, b: e.button };
  const t = tab();
  if (t?.mode?.kind === "face" && t.faceMove && e.button === 0) {
    const hit = pickAt(e.clientX, e.clientY);
    if (hit?.object.userData.kind === "board" && hit.object.userData.boardId === t.mode.board) faceDrag = { id: t.mode.board, moved: false };
  }
});
canvas.addEventListener("pointerup", (e) => {
  const d = down;
  down = null;
  storeCamera();
  if (faceDrag?.moved) { faceDrag = null; return; }
  faceDrag = null;
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
  const hit = pickAt(e.clientX, e.clientY);
  if (e.button === 2) { if (hit && hit.object.userData.kind === "board") boardCtx(hit.object.userData.boardId, e.clientX, e.clientY); return; }
  if (e.button !== 0) return;
  if (tab()?.mode) { if (tab().mode.kind === "face") facePick(faceHit(e.clientX, e.clientY)); return; }
  if (!hit) { select(null); return; }
  const u = hit.object.userData;
  if (u.kind === "board") select({ kind: "board", id: u.boardId });
  else if (u.kind === "joint") select({ kind: "board", id: u.decl.panelAId });
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
/** Slide one board in the picture, along the screen. Display only. */
function slideBoard(id, dx, dy) {
  const t = tab();
  if (!t || !dx && !dy) return;
  const dist = Math.max(camera.position.distanceTo(controls.target), 200);
  const worldPerPx = (2 * Math.tan((camera.fov * Math.PI) / 360) * dist) / Math.max(canvas.clientHeight, 1);
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
  const cur = t.nudge?.[id] || [0, 0, 0];
  t.nudge = { ...(t.nudge || {}), [id]: [
    cur[0] + right.x * dx * worldPerPx + up.x * -dy * worldPerPx,
    cur[1] + right.y * dx * worldPerPx + up.y * -dy * worldPerPx,
    cur[2] + right.z * dx * worldPerPx + up.z * -dy * worldPerPx,
  ] };
  applyExplode();
}
function toggleFaceMove() {
  const t = tab();
  if (t?.mode?.kind !== "face") return;
  t.faceMove = !t.faceMove;
  log("bench.face.move", { module: t.moduleId, on: !!t.faceMove });
  applyOpacity();
  renderSelection();
}
function clearNudge() {
  const t = tab();
  if (!t) return;
  t.nudge = null;
  applyExplode();
  renderSelection();
}

canvas.addEventListener("pointermove", (e) => {
  if (faceDrag && down) {
    slideBoard(faceDrag.id, e.movementX, e.movementY);
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) faceDrag.moved = true;
    hideTip();
    return;
  }
  if (down) { hideTip(); return; }
  const hit = pickAt(e.clientX, e.clientY);
  const c = cur();
  if (hover && hover !== hit?.object) {
    if (hover.userData.kind === "point") {
      const p = hover.userData.point;
      const tsel = tab().selection;
      const isSel = tsel && tsel.kind === "point" && tsel.keys && tsel.keys.join() === p.keys.join();
      const isHl = highlight && p.keys.some((k) => highlight.keys.has(k));
      hover.material = isSel || isHl ? pointSelMat : p.kind === "outline" ? pointOutlineMat : pointMat;
    }
    hover = null;
  }
  if (!hit) { hideTip(); canvas.style.cursor = ""; return; }
  hover = hit.object;
  canvas.style.cursor = "pointer";
  const u = hover.userData;
  if (u.kind === "point") {
    const tsel = tab().selection;
    const isSel = tsel && tsel.kind === "point" && tsel.keys && tsel.keys.join() === u.point.keys.join();
    if (!isSel) hover.material = pointHoverMat;
    const [A, B] = planeAxes(c.boards.get(u.boardId).profilePlane);
    const lines = [`${u.boardId}`, `${A} ${fmt(u.point.cabinet[0])} · ${B} ${fmt(u.point.cabinet[1])}`];
    u.point.keys.forEach((k, i) => { const flat = flatFormula(c.prov, k); if (flat) lines.push(`${i === 0 ? A : B} = ${flat}`); });
    tip(e.clientX, e.clientY, lines);
  } else if (u.kind === "joint") {
    tip(e.clientX, e.clientY, [`${u.decl.panelAId} ↔ ${u.decl.panelBId}`, `${u.decl.relationshipType} · ${u.status === "ok" ? "touching" : u.status === "gap" ? `gap ${fmt(u.sep)} mm` : `overlap ${fmt(-u.sep)} mm`}`], u.status === "ok" ? "" : "warn");
  } else if (u.kind === "board") {
    const b = c.boards.get(u.boardId);
    tip(e.clientX, e.clientY, [`${b.id} · ${b.name}`, `${fmt(b.x1 - b.x0)} × ${fmt(b.y1 - b.y0)} × ${fmt(b.z1 - b.z0)} · ${b.profilePlane} · t ${fmt(b.materialThickness)}`]);
  }
});
canvas.addEventListener("pointerleave", () => { hideTip(); });
canvas.addEventListener("wheel", () => { storeCamera(); }, { passive: true });

/** Cursor tip positioned for wherever the canvas sits in #bcenter (full view or the L3 inset). */
function tip(clientX, clientY, lines, tone = "") {
  const cr = canvas.getBoundingClientRect();
  const br = $("#bcenter").getBoundingClientRect();
  showTip(clientX + (cr.left - br.left), clientY + (cr.top - br.top), lines, tone);
}

function select(sel) {
  const t = tab();
  t.selection = sel;
  t.tryout = null;
  if (sel) {
    const c = cur();
    const value = sel.kind === "point" ? sel.cabinet : sel.kind === "face" ? entryOf(c.prov, sel.key)?.value : null;
    const formula = sel.kind === "face" ? entryOf(c.prov, sel.key)?.formula : sel.kind === "point" ? sel.keys.map((k) => entryOf(c.prov, k)?.formula).join(" | ") : null;
    log("bench.select", { module: t.moduleId, what: sel.kind, id: sel.id ?? `${sel.a}↔${sel.b}`, key: sel.key || null, keys: sel.keys || null, value, formula });
  }
  const hadError = !!t.placeError;
  if (!sel || sel.kind === "board") t.placeError = null;
  paintSelection();
  // A board click only highlights it. Rebuilding the generator page would throw away the scroll position.
  const keepPage = !t.mode && !t.l3 && !hadError && (!sel || sel.kind === "board");
  if (!keepPage) renderSelection();
  renderBottom();
  renderL3();
  saveState();
}

// --- selection panel ---------------------------------------------------------------------

function h(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) e.append(c);
  return e;
}
function section(title, children) {
  return h("div", { class: "panel-section" }, [h("div", { class: "sec-title", text: title }), ...[].concat(children)]);
}
function termChip(name, term) {
  const label = term.kind === "rule" ? term.name : term.kind === "ref" ? term.ref : term.kind === "param" ? term.name : null;
  const chip = h("span", { class: `term ${term.kind}`, title: term.kind === "rule" ? (term.doc || term.name) : term.kind === "ref" ? `→ ${term.ref}` : term.kind === "param" ? `param ${term.name}` : "local value" }, [
    h("b", { text: name }), h("span", { text: fmt(term.value) }), label && label !== name ? h("span", { class: "muted", text: label }) : null,
  ]);
  if (term.kind === "ref") chip.addEventListener("click", () => selectKey(term.ref));
  if (term.kind === "rule") chip.addEventListener("click", () => highlightKeys(affectedByRule(cur().prov, term.name), `rule ${term.name}`, term.name));
  if (term.kind === "param") chip.addEventListener("click", () => highlightKeys(affectedBy(cur().prov, usesParam(cur().prov, term.name)), `param ${term.name}`));
  return chip;
}
function formulaBlock(prov, key) {
  const e = entryOf(prov, key);
  if (!e) return h("div", { class: "empty small", text: "no provenance for this value" });
  return h("div", {}, [
    h("div", { class: "formula", text: `${fmt(e.value)} = ${e.formula}` }),
    h("div", { class: "terms" }, Object.entries(e.terms).map(([n, t]) => termChip(n, t))),
  ]);
}
function treeBlock(prov, key) {
  const root = tree(prov, key);
  if (!root) return null;
  const li = (node, name) => {
    const kids = node.terms.filter((t) => t.child);
    return h("li", {}, [
      h("div", { class: "node" }, [
        name ? h("span", { class: "muted", text: `${name} =` }) : null,
        h("span", { class: "key", text: node.key, onclick: () => selectKey(node.key) }),
        h("span", { class: "v", text: fmt(node.value) }),
        h("span", { class: "f", text: `= ${node.formula}` }),
        ...node.terms.filter((t) => !t.child).map((t) => termChip(t.name, { kind: t.kind, value: t.value, name: t.rule || t.name, ref: t.ref, doc: t.doc })),
      ]),
      kids.length ? h("ul", {}, kids.map((t) => li(t.child, t.name))) : null,
    ]);
  };
  return h("div", { class: "tree" }, [h("ul", {}, [li(root, null)])]);
}
function legend() {
  return h("div", { class: "legend" }, ["param", "rule", "ref", "value"].map((k) => h("span", {}, [h("i", { class: `sw ${k}` }), k === "value" ? "local" : k])));
}

/** Select a provenance key: a face (`T3.z1`) → face selection; a point component → point selection. */
function selectKey(key) {
  const c = cur();
  const m = /^([A-Za-z][\w-]*)\.(x0|x1|y0|y1|z0|z1)$/.exec(key);
  if (m && c.boards.has(m[1])) { select({ kind: "face", id: m[1], key }); return; }
  const pm = /^([A-Za-z][\w-]*)\.(cut|pv)\[(\d+)\]\.([xyz])$/.exec(key);
  if (pm && c.boards.has(pm[1])) {
    const b = c.boards.get(pm[1]);
    const p = boardPoints(b, c.prov, c.result.features || []).find((q) => q.keys.includes(key));
    if (p) { select({ kind: "point", id: b.id, keys: p.keys, label: p.label, pkind: p.kind, local: p.local, cabinet: p.cabinet }); return; }
  }
  const fm = /^([A-Za-z][\w-]*)\.feat\./.exec(key);
  if (fm && c.boards.has(fm[1])) {
    const b = c.boards.get(fm[1]);
    const p = boardPoints(b, c.prov, c.result.features || []).find((q) => q.keys.includes(key));
    if (p) { select({ kind: "point", id: b.id, keys: p.keys, label: p.label, pkind: p.kind, local: p.local, cabinet: p.cabinet }); return; }
  }
  // An intermediate (D1.cut.frontZ0, FeatureSlotWidth): show it as a bare key.
  select({ kind: "key", key, id: boardsOfKeys([key])[0] || null });
}

let highlight = null; // { keys: Set, label }
function highlightKeys(keys, label, ruleName = null) {
  highlight = { keys: new Set(keys), label, boards: new Set(boardsOfKeys(keys)) };
  $$("#rulesList .rule").forEach((r) => r.classList.toggle("hl", r.dataset.rule === ruleName));
  for (const [id, g] of boardGroups) {
    const on = highlight.boards.has(id);
    g.mat.emissive.setHex(on ? 0x3a2a00 : 0x000000);
    g.mat.emissiveIntensity = on ? 1 : 0;
    const rest = g.bodyHex != null ? g.bodyHex : g.board.category === "front_panel" ? 0x9ec5d8 : STIPPLE_WHITE;
    g.mat.color.setHex(on ? 0xffe08a : rest);
  }
  for (const m of pointMeshes) {
    const on = m.userData.point.keys.some((k) => highlight.keys.has(k));
    m.material = on ? pointSelMat : m.userData.point.kind === "outline" ? pointOutlineMat : pointMat;
    m.scale.setScalar(on ? 1.5 : 1);
  }
  $("#stInfo").textContent = `${label}: ${keys.length} formula(s) · boards ${Array.from(highlight.boards).join(", ") || "—"} · Esc clears`;
  renderL3();
}
function clearHighlight() {
  highlight = null;
  $$("#rulesList .rule.hl").forEach((r) => r.classList.remove("hl"));
  paintSelection();
  renderL3();
}

/** One board's placement, editable here: a face formula moves the whole board and keeps the size. */
function placementBlock(id, b) {
  const t = tab();
  const c = cur();
  const rule = placementRule(id);
  const axes = rule ? rule.axes : seedAxes(b, c.prov);
  const N = names();
  const apply = (face, text, input) => {
    const expr = fromDisplay(text, N);
    if (!expr) return;
    let layout = t.draft?.layout;
    if (!layout) return;
    const prep = withAxis(layout, b, face, c.prov);
    let next;
    try { next = setFace(prep.layout, id, face, expr, prep.when, prep.universal); } catch (err) { t.placeError = { id, message: err.message }; renderSelection(); return; }
    t.placeError = null;
    const res = tryLayout(next, `${id}.${face} = ${expr}`, { mode: "overview", board: id, face });
    if (!res.ok) { t.placeError = { id, message: res.error }; renderSelection(); if (input) input.focus(); }
  };
  const block = h("div", {});
  for (const a of ["x", "y", "z"]) {
    const r = axes[a];
    if (!r) continue;
    const drive = `${a}${r.from === "lo" ? "0" : "1"}`;
    const rows = [`${a}0`, `${a}1`].map((f) => {
      const isDrive = f === drive;
      const text = isDrive ? toDisplay(nameCenterlines(r.at)) : (rule ? drivenText(a, r) : toDisplay(nameCenterlines(concreteFormula(c.prov, `${id}.${f}`))));
      const input = h("input", { type: "text", value: text, spellcheck: "false", title: isDrive ? "这条轴的驱动面" : "输入新公式：这一面成为驱动面，对面跟着移同样的距离" });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && input.value !== text) apply(f, input.value, input); if (e.key === "Escape") { input.value = text; input.blur(); } });
      input.addEventListener("change", () => { if (input.value !== text) apply(f, input.value, input); });
      return h("div", { class: `face-row${isDrive ? " drive" : ""}` }, [h("span", { class: "fname", text: FACE_NAMES[f] }), h("span", { class: "fval", text: fmt(b[f]) }), input]);
    });
    const sz = b[`${a}1`] - b[`${a}0`];
    block.append(h("div", { class: "mode-axis" }, [
      h("div", { class: "axis-title" }, [
        h("span", {}, [h("span", { text: `${AXIS_NAMES[a]}（${a.toUpperCase()}）` }), rule?.axes[a]?.relation ? h("span", { class: "rel-chip", text: `${rule.axes[a].relation.kind === "contact" ? "接触" : "延伸"} ${toDisplay(rule.axes[a].relation.ref, N)}` }) : null]),
      ]),
      ...rows,
      h("div", { class: "size-row" }, [h("span", { text: SIZE_NAMES[`${a}Size`] }), h("span", { class: "fval", text: fmt(sz) }), h("span", { text: `= ${toDisplay(r.size)}` })]),
    ]));
  }
  return block;
}

/** A face's existing formula. Read only: the number changes when a parameter on the left changes. */
function formulaFaces(id, b) {
  const block = h("div", {});
  const prov = cur()?.prov;
  for (const a of ["x", "y", "z"]) {
    const rows = [`${a}0`, `${a}1`].map((f) => {
      const e = entryOf(prov, `${id}.${f}`);
      const formula = e?.formula ? toDisplay(e.formula, names()) : "—";
      return h("div", { class: "face-row" }, [
        h("span", { class: "fname", text: FACE_NAMES[f] }),
        h("span", { class: "fval", text: fmt(b[f]) }),
        h("span", { text: formula === "—" ? "" : `= ${formula}` }),
      ]);
    });
    block.append(h("div", { class: "mode-axis" }, rows));
  }
  return block;
}

/** Regenerate the 3D view from `params` without rebuilding the right-hand page (a zone drag). */
function liveGenerate(params) {
  const t = tab();
  const c = cur();
  if (!t || !c) return;
  t.params = params;
  c.result = generate(t.moduleId, params, t.draft ? t.draft.layout : null);
  c.prov = c.result.debug?.provenance || { entries: {}, rules: {} };
  c.boards = new Map((c.result.boards || []).map((b) => [b.id, b]));
  build3D(true);
  const view = $("#selPanel .ohc-front");
  const mod = MODULES[t.moduleId];
  if (view && mod?.frontView) {
    try { view.innerHTML = mod.frontView(c.result, { selectedZoneIndex: (t.zoneSel || [])[0] ?? -1, gaps: "clear" }) || ""; } catch (_) { /* elevation is optional */ }
  }
}

/** Overhead: the same zone strip and front elevation as the main app, editing this tab's params. */
function overheadEditor(mod, t) {
  const p = t.params;
  const zones = p.zones || [];
  const total = p.cabinetWidth || 1;
  const selected = (t.zoneSel || []).filter((i) => i < zones.length);
  const setZones = (next, what) => setParams({ ...t.params, zones: next }, `zones.${what}`, null, next.map((z) => z.width));
  const box = h("div", { class: "panel-section" });
  const add = h("button", { class: "tb", text: "+ 分区", onclick: () => {
    if ((zones.length + 1) * MIN_ZONE_WIDTH > total) return;
    setZones(fitZoneWidths([...zones, { id: `zone-${Date.now().toString(36)}`, type: "up_flap", width: MIN_ZONE_WIDTH }], total), "add");
  } });
  const del = h("button", { class: "tb", text: "删除", disabled: !selected.length || zones.length - selected.length < 1 ? "" : null, onclick: () => {
    t.zoneSel = [];
    setZones(fitZoneWidths(zones.filter((_, i) => !selected.includes(i)), total), "remove");
  } });
  const avg = h("button", { class: "tb", text: "均分", disabled: selected.length < 2 ? "" : null, title: "选中的分区平分它们的总宽", onclick: () => {
    const next = zones.map((z) => ({ ...z }));
    const sum = selected.reduce((s, i) => s + next[i].width, 0);
    const each = Math.round((sum / selected.length) * 10) / 10;
    selected.forEach((i, k) => { next[i].width = k === selected.length - 1 ? Math.round((sum - each * (selected.length - 1)) * 10) / 10 : each; });
    setZones(next, "average");
  } });
  box.append(h("div", { class: "sec-title", text: `分区 · 从左到右 · ${zones.length} · ${fmt(total)} mm` }));
  box.append(h("div", { class: "zs-tools" }, [add, del, avg, h("span", { class: "zs-hint", text: "拖分界 · 点一个分区 · Ctrl 多选" })]));

  const strip = h("div", { class: "zs-strip" });
  const widthRow = h("div", { class: "zs-row" });
  const cumRow = h("div", { class: "zs-row cum" });
  const short = (type) => mod.zoneTypes?.find((z) => z.id === type)?.short || type;
  const cells = zones.map((z, i) => {
    const cell = h("div", { class: `zs-zone t-${z.type}${selected.includes(i) ? " sel" : ""}` }, [
      h("span", { class: "zs-type", text: short(z.type) }),
      h("span", { class: "zs-w", text: String(Math.round(z.width)) }),
    ]);
    cell.addEventListener("click", (e) => {
      const curSel = (t.zoneSel || []).filter((k) => k < zones.length);
      t.zoneSel = (e.ctrlKey || e.metaKey ? (curSel.includes(i) ? curSel.filter((k) => k !== i) : [...curSel, i]) : [i]).sort((a, b) => a - b);
      renderSelection();
    });
    return cell;
  });
  const layout = (zs) => {
    zs.forEach((z, i) => {
      cells[i].style.flexBasis = `${(z.width / total) * 100}%`;
      cells[i].querySelector(".zs-w").textContent = String(Math.round(z.width));
    });
    widthRow.replaceChildren(...zs.map((z) => h("span", { style: `flex-basis:${(z.width / total) * 100}%`, text: String(Math.round(z.width)) })));
    let acc = 0;
    cumRow.replaceChildren(...zs.slice(0, -1).map((z) => { acc += z.width; return h("span", { style: `left:${(acc / total) * 100}%`, text: String(Math.round(acc)) }); }));
  };
  for (let i = 0; i < zones.length; i += 1) {
    strip.append(cells[i]);
    if (i === zones.length - 1) break;
    const grip = h("div", { class: "zs-grip", title: "拖动分界 · Shift = 1 mm" });
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const params0 = structuredClone(t.params);
      const result0 = cur().result;
      const rect = strip.getBoundingClientRect();
      const x0 = params0.zones.slice(0, i + 1).reduce((s, z) => s + z.width, 0);
      const startX = e.clientX;
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
      grip.classList.add("active");
      let latest = params0;
      const move = (ev) => {
        const mm = ((ev.clientX - startX) / Math.max(rect.width, 1)) * params0.cabinetWidth;
        const step = ev.shiftKey ? 1 : 10;
        const pos = Math.round((x0 + mm) / step) * step;
        latest = mod.setDivider(params0, result0, i, pos);
        layout(latest.zones);
        liveGenerate(latest);
      };
      const end = (ev) => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
        try { grip.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
        grip.classList.remove("active");
        const changed = latest.zones.some((z, k) => z.width !== params0.zones[k].width);
        if (changed) setParams(latest, "zones.width", params0.zones.map((z) => z.width), latest.zones.map((z) => z.width));
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    });
    strip.append(grip);
  }
  layout(zones);
  box.append(strip, widthRow, cumRow);

  if (selected.length === 1) {
    const i = selected[0];
    const z = zones[i];
    const type = h("select", {}, (mod.zoneTypes || []).map((zt) => h("option", { value: zt.id, text: zt.label })));
    type.value = z.type;
    type.addEventListener("change", () => {
      const next = zones.map((zz) => ({ ...zz }));
      next[i].type = type.value;
      const patch = { ...t.params, zones: next };
      if (type.value === "rangehood_flap") {
        patch.rangehoodPreset = p.rangehoodPreset || "NCE";
        if (p.rangehoodClearHeight == null) patch.rangehoodClearHeight = 75;
        if (p.rangehoodAlignment == null) patch.rangehoodAlignment = "left";
        if (p.rangehoodEdgeOffsetX == null) patch.rangehoodEdgeOffsetX = 40;
      }
      setParams(patch, "zones.type", z.type, type.value);
    });
    const n = i < zones.length - 1 ? i + 1 : i - 1;
    const maxW = n >= 0 ? z.width + zones[n].width - MIN_ZONE_WIDTH : total;
    const w = h("input", { type: "number", step: "10", value: String(z.width) });
    w.addEventListener("change", () => {
      if (n < 0) { w.value = String(z.width); return; }
      const v = Math.max(MIN_ZONE_WIDTH, Math.min(maxW, Math.round(Number(w.value))));
      if (!Number.isFinite(v)) { w.value = String(z.width); return; }
      const next = zones.map((zz) => ({ ...zz }));
      next[n].width = Math.round((next[n].width - (v - next[i].width)) * 10) / 10;
      next[i].width = v;
      setZones(next, "width");
    });
    box.append(h("div", { class: "zone-card" }, [
      h("label", { class: "field" }, [h("span", { text: `分区 ${i + 1}` }), type]),
      h("label", { class: "field" }, [h("span", { text: "宽度" }), w]),
    ]));
  }

  box.append(h("div", { class: "sec-title", text: "前视图", style: "margin-top:10px" }));
  const front = h("div", { class: "ohc-front" });
  let svg = null;
  try { svg = mod.frontView(cur().result, { selectedZoneIndex: selected[0] ?? -1, gaps: "clear" }); } catch (_) { svg = null; }
  if (svg) front.innerHTML = svg;
  else front.append(h("div", { class: "empty small", text: "没有前视图。" }));
  box.append(front);
  return box;
}

/** The right-hand page on entry: this generator's own editor. Not a board inspector. */
function renderGenerator(panel) {
  const t = tab();
  const c = cur();
  const mod = MODULES[t.moduleId];
  const env = safeEnvelope(t);
  panel.append(h("div", { class: "panel-head" }, [
    h("div", { class: "panel-title", text: mod?.label || t.moduleId }),
    h("div", { class: "panel-sub", text: env ? `${fmt(env.W)} × ${fmt(env.D)} × ${fmt(env.H)} mm · 改这里，整柜重算` : "改这里，整柜重算" }),
  ]));
  const errs = c.result.validation?.errors || [];
  if (errs.length) panel.append(h("div", { class: "panel-section" }, errs.map((m) => h("div", { class: "msg err", text: m }))));
  if (t.placeError) panel.append(h("div", { class: "mode-err", text: `${t.placeError.id}：${t.placeError.message}` }));
  if (mod?.id === "overheadCabinet") panel.append(overheadEditor(mod, t));
  else if (mod?.frontView) {
    let svg = null;
    try { svg = mod.frontView(c.result, {}); } catch (_) { svg = null; }
    if (svg) {
      const front = h("div", { class: "ohc-front" });
      front.innerHTML = svg;
      panel.append(section("前视图", [front]));
    }
  }
  const form = h("div", { class: "params" });
  renderParamsInto(form);
  panel.append(form);
}

function renderSelection() {
  const t = tab();
  const c = cur();
  const panel = $("#selPanel");
  panel.replaceChildren();
  if (!t || !c) return;
  if (t.mode && c.boards.get(t.mode.board)) {
    if (t.mode.kind === "default") renderDefaultPanel(panel);
    else renderFacePanel(panel);
    return;
  }
  if (t.l3 && c.boards.get(t.l3)) {
    if (boardEditable(t.l3)) renderBoardEdit(panel);
    else renderCodeBoard(panel);
    return;
  }
  renderGenerator(panel);
}

/** 板件编辑 for a board whose outline is still computed in the generator. The 2D view shows its points. */
function renderCodeBoard(panel) {
  const t = tab();
  const c = cur();
  const id = t.l3;
  const b = c.boards.get(id);
  panel.append(h("div", { class: "panel-head" }, [
    h("div", { class: "panel-title", text: `${id} · ${boardLabel(id)} · 板件编辑` }),
    h("div", { class: "panel-sub", text: "轮廓仍由生成器代码算。点在左边的板件图里，公式写在下面。位置公式在参数调试里看。" }),
  ]));
  const sel = t.selection;
  if (sel?.kind === "point" && sel.id === id) panel.append(pointFormulas(b, sel, c.prov));
  panel.append(section("", [h("div", { class: "btn-row" }, [
    h("button", { class: "tb", text: "参数调试 · 默认模式", onclick: () => enterMode("default", id) }),
    h("button", { class: "tb", text: "面的模式", onclick: () => enterMode("face", id) }),
    h("button", { class: "tb", text: "返回整体", onclick: exitL3 }),
  ])]));
}

/** Input to re-evaluate a formula with the same terms. Only this value moves (dashed marker in L3). */
function tryoutBlock(key) {
  const t = tab();
  const c = cur();
  const e = entryOf(c.prov, key);
  if (!e) return h("div", { class: "empty small", text: "—" });
  const input = h("input", { type: "text", value: t.tryout && t.tryout.key === key ? t.tryout.expr : e.formula, spellcheck: "false" });
  const out = h("div", { class: "tryout-out" });
  const run = () => {
    try {
      const v = evaluate(input.value, varsFor(c.prov, key));
      out.className = "tryout-out";
      out.replaceChildren(h("span", { text: `${key} would be ` }), h("b", { text: fmt(v) }), h("span", { text: ` (now ${fmt(e.value)}, Δ ${fmt(v - e.value)}). Only this value moves; dependents do not follow until the code changes.` }));
      t.tryout = { key, expr: input.value, value: v, from: e.value };
      log("bench.tryout", { module: t.moduleId, key, from: e.value, formula: e.formula, expr: input.value, to: v });
      renderL3();
    } catch (err) {
      out.className = "tryout-out err";
      out.textContent = err.message;
    }
  };
  input.addEventListener("keydown", (ev) => { if (ev.key === "Enter") run(); });
  return [
    h("div", { class: "tryout" }, [input, h("button", { class: "tb", text: "Try", onclick: run })]),
    out,
    h("div", { class: "empty small", text: `terms: ${Object.keys(e.terms).join(", ") || "none"} · functions: min max abs floor ceil round sqrt` }),
  ];
}

// --- status counts (errors, warnings, pins) — the footer, not a drawer -------------------

function renderBottom() {
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
function setBadges(s) {
  const row = $("#stBadges");
  row.replaceChildren();
  if (!s) return;
  row.append(h("span", { class: `badge${s.errN ? " err" : " ok"}`, text: s.errN ? `${s.errN} error${s.errN > 1 ? "s" : ""}` : "no errors" }));
  if (s.warnN) row.append(h("span", { class: "badge warn", text: `${s.warnN} to check` }));
  if (s.pins) row.append(h("span", { class: `badge${s.pins.diff ? " warn" : " ok"}`, text: s.pins.diff ? `${s.pins.diff} / ${s.pins.count} pins differ` : `${s.pins.count} pins ok` }));
}

function presetPins() {
  const t = tab();
  const c = cur();
  const p = c?.presets?.presets.find((x) => x.id === t?.presetId);
  return p ? p.pins || {} : null;
}
async function pinBoard(boardId) {
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
async function pinAll() {
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
function togglePane(which) {
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

// --- L3: board editor ----------------------------------------------------------------------------

function enterL3(boardId) {
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
function exitL3() {
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
function renderL3() {
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

function renderCrumb() {
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

// --- context menu ---------------------------------------------------------------------------------

function showCtx(x, y) {
  const menu = $("#ctxMenu");
  menu.classList.remove("hidden");
  const r = menu.getBoundingClientRect();
  menu.style.left = `${Math.min(x, window.innerWidth - r.width - 6)}px`;
  menu.style.top = `${Math.min(y, window.innerHeight - r.height - 6)}px`;
}
function hideCtx() { $("#ctxMenu").classList.add("hidden"); }
window.addEventListener("pointerdown", (e) => { if (!$("#ctxMenu").contains(e.target) && e.target !== $("#tabAdd")) hideCtx(); });
function boardCtx(boardId, x, y) {
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
function renderExplodeOrder() {
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
function syncToolbar() {
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

function renderEmpty() {
  $("#selPanel").replaceChildren(h("div", { class: "panel-head" }, [h("div", { class: "panel-title", text: "Generator bench" }), h("div", { class: "panel-sub", text: "Open a generator with + or from the app's module rail (right-click → Generator rules…)." })]));
  $("#rulesList").replaceChildren();
  $("#stInfo").textContent = "—";
  setBadges(null);
  cabRoot.clear();
  explodePlan = null;
  $("#explodeOrder").replaceChildren();
}

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
