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
import { entryOf, FACES, tree, usesRule, usesParam, affectedByRule, affectedBy, boardsOfKeys, fmt, evaluate, varsFor } from "./provenance.js";
import { planExplode, assemblyOffsets, radialOffsets, explodeUnit, dirLabel, separation } from "./explode.js";

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
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ tabs, active: state.active }));
  } catch (_) { /* nothing */ }
}
function loadState() {
  try {
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
    showPoints: true,
    selection: null,   // { kind: "board"|"point"|"joint"|"face", id, key?, keys?, label? }
    l3: null,          // board id being edited
    frame: "local",
    labels: true,
    tryout: null,      // { key, expr, value }
    camera: null,
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

function generate(moduleId, params) {
  const mod = MODULES[moduleId];
  if (!mod) return { boards: [], features: [], validation: { errors: [`unknown module ${moduleId}`], warnings: [] }, debug: {} };
  try {
    return mod.generate(params);
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
    c = { moduleId: t.moduleId, presets: await loadPresets(t.moduleId), rules: await loadRules(t.moduleId) };
    cache.set(t.id, c);
  }
  if (!t.params) {
    const preset = c.presets.presets.find((p) => p.id === t.presetId) || c.presets.presets[0];
    if (preset) { t.presetId = preset.id; t.params = structuredClone(preset.params); }
    else t.params = MODULES[t.moduleId]?.defaults?.(1200, 350, 400) || {};
  }
  c.result = generate(t.moduleId, t.params);
  c.prov = c.result.debug?.provenance || { entries: {}, rules: {} };
  c.boards = new Map((c.result.boards || []).map((b) => [b.id, b]));
  renderTabs();
  renderPresetSelect();
  renderParams();
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

function renderPresetSelect() {
  const t = tab();
  const c = cur();
  const sel = $("#presetSel");
  sel.replaceChildren();
  for (const p of c?.presets?.presets || []) {
    const o = document.createElement("option");
    o.value = p.id;
    o.textContent = `${p.label || p.id} · ${countPins(p.pins || {})} pins`;
    sel.append(o);
  }
  const custom = document.createElement("option");
  custom.value = "";
  custom.textContent = t?.presetId ? "— custom (edited) —" : "custom params";
  sel.append(custom);
  sel.value = t?.presetId && (c?.presets?.presets || []).some((p) => p.id === t.presetId) ? t.presetId : "";
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

// Numbers are folded by default: the preset is the usual entry point.
const PARAMS_OPEN_KEY = "cablab.bench.paramsOpen";
let paramsOpen = false;
try { paramsOpen = localStorage.getItem(PARAMS_OPEN_KEY) === "1"; } catch (_) { /* start folded */ }
function applyParamsFold() {
  $("#paramsForm").classList.toggle("hidden", !paramsOpen);
  $("#paramsFold .fold-caret").textContent = paramsOpen ? "▾" : "▸";
}
$("#paramsFold").addEventListener("click", () => {
  paramsOpen = !paramsOpen;
  try { localStorage.setItem(PARAMS_OPEN_KEY, paramsOpen ? "1" : "0"); } catch (_) { /* not persisted */ }
  applyParamsFold();
});

function renderParams() {
  const t = tab();
  const form = $("#paramsForm");
  form.replaceChildren();
  applyParamsFold();
  const env = t?.params && MODULES[t.moduleId]?.envelope ? safeEnvelope(t) : null;
  $("#paramsSummary").textContent = env ? `${fmt(env.W)} × ${fmt(env.D)} × ${fmt(env.H)}` : "";
  if (!t || !t.params) return;
  const mod = MODULES[t.moduleId];
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
    n.textContent = name;
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
  const span = bbox.getSize(new THREE.Vector3()).length();
  const pr = Math.max(3, span / 260);

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
    if (t.showPoints) {
      for (const p of pointsOf(b, c.prov, c.result.features || [])) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(pr, 10, 10), p.kind === "outline" ? pointOutlineMat : pointMat);
        m.position.copy(p.pos);
        m.userData = { kind: "point", boardId: b.id, point: p };
        m.renderOrder = 15;
        group.add(m);
        pointMeshes.push(m);
      }
    }
    cabRoot.add(group);
    boardGroups.set(b.id, { group, mesh, edges, mat, coats, bodyHex, center: bc, board: b });
  }
  buildTrails();
  buildLabels();
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
  if (!t.showJoints) return;
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
    out.set(b.id, home ? new THREE.Vector3() : new THREE.Vector3(o[0], o[1], o[2]));
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
    const o = isWaiting(id) ? Math.min(t.opacity, GHOST_OPACITY) : t.opacity;
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
    g.edges.material = isWaiting(id) ? edgeMatGhost : edgeMat;
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
canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY, b: e.button }; });
canvas.addEventListener("pointerup", (e) => {
  const d = down;
  down = null;
  storeCamera();
  if (!d || Math.hypot(e.clientX - d.x, e.clientY - d.y) > 4) return;
  const hit = pickAt(e.clientX, e.clientY);
  if (e.button === 2) { if (hit && hit.object.userData.kind === "board") boardCtx(hit.object.userData.boardId, e.clientX, e.clientY); return; }
  if (e.button !== 0) return;
  if (!hit) { select(null); return; }
  const u = hit.object.userData;
  if (u.kind === "board") select({ kind: "board", id: u.boardId });
  else if (u.kind === "point") select({ kind: "point", id: u.boardId, keys: u.point.keys, label: u.point.label, pkind: u.point.kind, local: u.point.local, cabinet: u.point.cabinet });
  else if (u.kind === "joint") select({ kind: "joint", index: u.index, a: u.decl.panelAId, b: u.decl.panelBId });
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener("pointermove", (e) => {
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
    const lines = [`${u.boardId} · ${u.point.label} (${u.point.kind})`, `${A} ${fmt(u.point.cabinet[0])} · ${B} ${fmt(u.point.cabinet[1])}`];
    for (const k of u.point.keys) { const e2 = entryOf(c.prov, k); if (e2) lines.push(`${k.split(".").slice(-1)[0]} = ${e2.formula}`); }
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
  paintSelection();
  renderSelection();
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

function renderSelection() {
  const t = tab();
  const c = cur();
  const panel = $("#selPanel");
  panel.replaceChildren();
  if (!t || !c) return;
  const sel = t.selection;
  const prov = c.prov;
  if (!sel) {
    const r = c.result;
    panel.append(
      h("div", { class: "panel-head" }, [h("div", { class: "panel-title", text: `${MODULES[t.moduleId]?.label || t.moduleId}` }), h("div", { class: "panel-sub", text: `${t.presetId || "custom"} · ${r.boards.length} boards · ${r.boards.reduce((n, b) => n + (b.faces ? b.faces.length : 0), 0)} faces · ${(r.joints || r.relationshipDeclarations || []).length} joints · ${Object.keys(prov.entries).length} formulas` })]),
      section("Nothing selected", [
        h("div", { class: "empty small", text: "Click a board, a point or a joint dot. Right-click a board → Edit board." }),
        legend(),
      ]),
      section("Result", [
        h("div", { class: "kv-list" }, [
          h("span", { text: "boardFrame" }), h("b", { text: String(r.debug?.boardFrame || "—") }),
          h("span", { text: "errors" }), h("b", { text: String(r.validation?.errors?.length || 0) }),
          h("span", { text: "warnings" }), h("b", { text: String(r.validation?.warnings?.length || 0) }),
          h("span", { text: "rules used" }), h("b", { text: Object.keys(prov.rules || {}).join(", ") || "—" }),
        ]),
      ]),
    );
    return;
  }

  if (sel.kind === "board" || sel.kind === "face") {
    const b = c.boards.get(sel.id);
    if (!b) return;
    const pins = presetPins();
    const pinned = pins?.boards?.[b.id];
    const ep = explodePlan?.plan.get(b.id);
    const stepNo = stepIndex(b.id) + 1;
    panel.append(h("div", { class: "panel-head" }, [
      h("div", { class: "panel-title", text: `${b.id} · ${b.name}` }),
      h("div", { class: "panel-sub", text: `${b.category} · ${b.boardType} · plane ${b.profilePlane} · thickness ${fmt(b.materialThickness)} along ${b.thicknessAxis} · ${fmt(b.x1 - b.x0)} × ${fmt(b.y1 - b.y0)} × ${fmt(b.z1 - b.z0)}` }),
      ep ? h("div", { class: "panel-sub assembly-line", title: "Assembly order and pull direction (Explode ▾). Click to show this step.", onclick: () => setStep(stepNo, "panel") }, [
        h("span", { text: `assembly step ${stepNo} of ${explodePlan.order.length} · ` }),
        h("b", { text: ep.fixed ? "base board, stays" : `slides ${dirLabel(ep)}` }),
        h("span", { text: ep.parent ? ` onto ${ep.parent}${ep.via.length ? ` (${ep.via.join(", ")})` : ""}` : "" }),
      ]) : null,
    ]));
    const rows = FACES.map((f) => {
      const key = `${b.id}.${f}`;
      const e = entryOf(prov, key);
      const diff = pinned && Math.abs(pinned[f] - b[f]) > 0.01;
      const tr = h("tr", { class: sel.kind === "face" && sel.key === key ? "sel" : "", onclick: () => select({ kind: "face", id: b.id, key }) }, [
        h("td", { class: "face", text: f }),
        h("td", { class: "val", text: fmt(b[f]) }),
        h("td", {}, e ? [h("div", { class: "formula", text: e.formula }), h("div", { class: "terms" }, Object.entries(e.terms).map(([n, tm]) => termChip(n, tm)))] : h("span", { class: "empty small", text: "—" })),
      ]);
      if (diff) tr.append(h("td", { class: "pin-diff", text: `pin ${fmt(pinned[f])}` }));
      return tr;
    });
    panel.append(section("Faces (cabinet frame)", [h("table", { class: "faces" }, [h("tbody", {}, rows)]), legend()]));
    if (sel.kind === "face") {
      panel.append(section(`Dependency tree · ${sel.key}`, [treeBlock(prov, sel.key) || h("div", { class: "empty small", text: "—" })]));
      panel.append(section("Try a formula", tryoutBlock(sel.key)));
    }
    // Face layer (docs/model-spec.md): A / B / E<i>, each with what is machined into it.
    if (b.faces && b.faces.length) {
      const fmtFeat = (f) => {
        if (f.center) return `${f.kind} ${f.id} · ⌀${fmt(f.diameter)} at (${fmt(f.center[0])}, ${fmt(f.center[1])})${f.through ? " through" : f.depth != null ? ` depth ${fmt(f.depth)}` : ""}`;
        if (Number.isFinite(f.u0)) return `${f.kind} ${f.id} · u ${fmt(f.u0)}..${fmt(f.u1)} · v ${fmt(f.v0)}..${fmt(f.v1)}${f.through ? " through" : f.depth != null ? ` depth ${fmt(f.depth)}` : ""}`;
        return `${f.kind} ${f.id}${f.for ? ` → ${f.for}` : ""}`;
      };
      const big = b.faces.filter((f) => f.id === "A" || f.id === "B");
      const edges = b.faces.filter((f) => f.id.startsWith("E"));
      const tagged = edges.filter((f) => f.features.length);
      const rows = [];
      for (const f of big) {
        const meta = [typeof f.normal === "string" ? f.normal : "slanted", f.semantic, f.visible === true ? "visible" : f.visible === false ? "hidden" : null, f.finish?.colour].filter(Boolean).join(" · ");
        rows.push(h("div", { class: "kv", onclick: () => f.planeKey && select({ kind: "face", id: b.id, key: f.planeKey }) }, [h("span", { text: `${f.id}  ${meta}` }), h("b", { text: f.planeKey || "" })]));
        for (const ft of f.features) rows.push(h("div", { class: "empty small", text: `    ${fmtFeat(ft)}` }));
      }
      rows.push(h("div", { class: "kv" }, [h("span", { text: `${edges.length} edge faces` }), h("b", { text: tagged.length ? `${tagged.length} tagged` : "" })]));
      const byTag = new Map();
      for (const f of tagged) for (const ft of f.features) {
        const k = `${ft.kind} ${ft.id}${ft.for ? ` → ${ft.for}` : ""}`;
        byTag.set(k, [...(byTag.get(k) || []), f.id]);
      }
      for (const [k, ids] of byTag) rows.push(h("div", { class: "empty small", text: `    ${k} · ${ids.join(" ")}` }));
      panel.append(section(`Faces of ${b.id}`, rows));
    }
    const feats = (c.result.features || []).filter((f) => f && (f.targetBoardId === b.id || f.boardId === b.id || (b.id === "BP" && f.bp_groove)));
    if (feats.length && !(b.faces && b.faces.length)) {
      panel.append(section(`Features on ${b.id}`, feats.map((f) => h("div", { class: "kv", }, [h("span", { text: f.type || (f.purpose ? `${f.purpose} hole` : f.bp_groove ? `groove ${f.bp_groove.id}` : f.id) }), h("b", { text: f.id || "" })]))));
    }
    const joints = jointObjs.filter((j) => j.decl.panelAId === b.id || j.decl.panelBId === b.id);
    if (joints.length) {
      panel.append(section("Joints", joints.map((j) => h("div", { class: "kv", onclick: () => select({ kind: "joint", index: j.index, a: j.decl.panelAId, b: j.decl.panelBId }) }, [
        h("span", { text: `${j.decl.panelAId} ↔ ${j.decl.panelBId} · ${j.decl.relationshipType}` }),
        h("span", { class: `tag ${j.status}`, text: j.status === "ok" ? "touching" : j.status === "gap" ? `gap ${fmt(j.sep)}` : `overlap ${fmt(-j.sep)}` }),
      ]))));
    }
    if (b.notes?.length) panel.append(section("Notes", b.notes.map((n) => h("div", { class: "empty small", text: n }))));
    panel.append(section("Actions", [h("div", { class: "btn-row" }, [
      h("button", { class: "tb", text: "Edit board →", onclick: () => enterL3(b.id) }),
      h("button", { class: "tb", text: pinned ? "Re-pin board" : "Pin board", title: "Write this board's faces, outline and hinges into the preset", onclick: () => pinBoard(b.id) }),
      h("button", { class: "tb", text: "Report…", onclick: () => openReport() }),
    ])]));
    return;
  }

  if (sel.kind === "point") {
    const b = c.boards.get(sel.id);
    const [A, B] = planeAxes(b.profilePlane);
    panel.append(h("div", { class: "panel-head" }, [
      h("div", { class: "panel-title", text: `${b.id} · ${sel.label}` }),
      h("div", { class: "panel-sub", text: `${sel.pkind} point · ${A} ${fmt(sel.cabinet[0])} · ${B} ${fmt(sel.cabinet[1])} (cabinet) · ${A} ${fmt(sel.local[0])} · ${B} ${fmt(sel.local[1])} (local)` }),
    ]));
    sel.keys.forEach((key, i) => {
      if (!key) return;
      panel.append(section(`${i === 0 ? A : B} · ${key}`, [formulaBlock(prov, key), treeBlock(prov, key)]));
    });
    panel.append(section("Try a formula", tryoutBlock(sel.keys.find(Boolean))));
    panel.append(section("Actions", [h("div", { class: "btn-row" }, [
      h("button", { class: "tb", text: t.l3 === b.id ? "In board editor" : "Edit board →", onclick: () => enterL3(b.id) }),
      h("button", { class: "tb", text: "Pin board", onclick: () => pinBoard(b.id) }),
      h("button", { class: "tb", text: "Report…", onclick: () => openReport() }),
    ]), legend()]));
    return;
  }

  if (sel.kind === "joint") {
    const j = jointObjs.find((x) => x.index === sel.index) || (c.result.relationshipDeclarations || [])[sel.index] && { decl: c.result.relationshipDeclarations[sel.index], sep: NaN, status: "gap" };
    if (!j) return;
    const d = j.decl;
    const A = c.boards.get(d.panelAId);
    const B = c.boards.get(d.panelBId);
    panel.append(h("div", { class: "panel-head" }, [
      h("div", { class: "panel-title", text: `${d.panelAId} ↔ ${d.panelBId}` }),
      h("div", { class: "panel-sub", text: `${d.relationshipType} · ${d.geometryType} · rule ${d.ruleId}` }),
    ]));
    panel.append(section("Measured", [
      h("div", { class: "kv-list" }, [
        h("span", { text: "status" }), h("span", { class: `tag ${j.status}`, text: j.status === "ok" ? "touching" : j.status === "gap" ? `gap ${fmt(j.sep)} mm` : `overlap ${fmt(-j.sep)} mm` }),
        h("span", { text: "host" }), h("b", { text: d.hostPanelId }),
        h("span", { text: "target" }), h("b", { text: d.targetPanelId }),
        h("span", { text: "hardware" }), h("b", { text: (d.allowedHardware || []).join(", ") || "—" }),
      ]),
    ]));
    if (A && B) {
      // Which faces meet: the axis with the smallest separation.
      const axes = ["x", "y", "z"];
      const seps = axes.map((ax) => ({ ax, s: Math.max(A[`${ax}0`] - B[`${ax}1`], B[`${ax}0`] - A[`${ax}1`]) }));
      const best = seps.reduce((m, s) => (s.s > m.s ? s : m), seps[0]);
      const aFace = A[`${best.ax}0`] - B[`${best.ax}1`] >= B[`${best.ax}0`] - A[`${best.ax}1`] ? [`${A.id}.${best.ax}0`, `${B.id}.${best.ax}1`] : [`${A.id}.${best.ax}1`, `${B.id}.${best.ax}0`];
      panel.append(section(`Meeting faces along ${best.ax.toUpperCase()}`, aFace.map((k) => h("div", { class: "face-block" }, [h("div", { class: "key-link", text: k, onclick: () => selectKey(k) }), formulaBlock(prov, k)]))));
    }
    panel.append(section("Actions", [h("div", { class: "btn-row" }, [h("button", { class: "tb", text: "Report…", onclick: () => openReport() })])]));
    return;
  }

  if (sel.kind === "key") {
    panel.append(h("div", { class: "panel-head" }, [h("div", { class: "panel-title", text: sel.key }), h("div", { class: "panel-sub", text: "intermediate quantity" })]));
    panel.append(section("Formula", [formulaBlock(prov, sel.key), treeBlock(prov, sel.key)]));
    const deps = affectedBy(prov, [sel.key]).filter((k) => k !== sel.key);
    panel.append(section(`Used by (${deps.length})`, [h("div", { class: "tree" }, [h("ul", {}, deps.slice(0, 40).map((k) => h("li", {}, [h("span", { class: "key", text: k, onclick: () => selectKey(k) })])))]), deps.length > 40 ? h("div", { class: "empty small", text: `… ${deps.length - 40} more` }) : null]));
    panel.append(section("Try a formula", tryoutBlock(sel.key)));
  }
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

// --- bottom panes ----------------------------------------------------------------------------

function renderBottom() {
  const t = tab();
  const c = cur();
  const boardsPane = $('[data-dpane="boards"]');
  const auditPane = $('[data-dpane="audit"]');
  if (!t || !c) { boardsPane.replaceChildren(); auditPane.replaceChildren(); setBadges(null); return; }
  const sel = t.selection;
  const r = c.result;

  boardsPane.replaceChildren(h("table", { class: "grid" }, [
    h("thead", {}, [h("tr", {}, ["ID", "Name", "Type", "Plane", "X", "Y", "Z", "T", "pts"].map((x) => h("th", { text: x })))]),
    h("tbody", {}, r.boards.map((b) => h("tr", { class: sel && sel.id === b.id ? "sel" : "", onclick: () => select({ kind: "board", id: b.id }), oncontextmenu: (e) => { e.preventDefault(); boardCtx(b.id, e.clientX, e.clientY); } }, [
      h("td", { text: b.id }), h("td", { text: b.name }), h("td", { text: b.category }), h("td", { text: b.profilePlane }),
      h("td", { class: "num", text: `${fmt(b.x0)}…${fmt(b.x1)}` }), h("td", { class: "num", text: `${fmt(b.y0)}…${fmt(b.y1)}` }), h("td", { class: "num", text: `${fmt(b.z0)}…${fmt(b.z1)}` }),
      h("td", { class: "num", text: fmt(b.materialThickness) }), h("td", { class: "num", text: String((b.cutProfileVector || b.profileVector || []).length) }),
    ]))),
  ]));

  // Audit: one list — validation, joints (declared vs measured), undeclared overlaps, pin diffs — worst first.
  const items = []; // { sev: 0 err | 1 warn | 2 ok, what, msg, num, onclick }
  for (const m of r.validation?.errors || []) items.push({ sev: 0, what: "error", msg: m });
  for (const m of r.validation?.warnings || []) items.push({ sev: 1, what: "warning", msg: m });

  const declared = new Set();
  const joints = jointObjs.length ? jointObjs : (r.relationshipDeclarations || []).map((d, index) => ({ decl: d, index, sep: NaN, status: "gap" }));
  for (const j of joints) {
    declared.add([j.decl.panelAId, j.decl.panelBId].sort().join("|"));
    items.push({
      sev: j.status === "ok" ? 2 : j.status === "gap" ? 1 : 0,
      what: "joint",
      msg: `${j.decl.panelAId} ↔ ${j.decl.panelBId} · ${j.decl.relationshipType} · ${j.decl.ruleId}`,
      tag: j.status, tagText: j.status === "ok" ? "touching" : j.status === "gap" ? `gap ${fmt(j.sep)}` : `overlap ${fmt(-j.sep)}`,
      onclick: () => select({ kind: "joint", index: j.index, a: j.decl.panelAId, b: j.decl.panelBId }),
    });
  }
  const boards = r.boards;
  for (let i = 0; i < boards.length; i += 1) {
    for (let k = i + 1; k < boards.length; k += 1) {
      const a = boards[i], b = boards[k];
      if (declared.has([a.id, b.id].sort().join("|"))) continue;
      const sep = separation(a, b);
      if (sep > -0.01) continue; // apart or merely touching: not a finding
      if (a.category === "front_panel" || b.category === "front_panel") continue; // doors overlap the carcass by design (they hang in front)
      // A board with an outline meets its neighbours through tongues and notches; its bounding box
      // overlaps them by design. Only two plain plates overlapping is a real finding.
      const outlined = (x) => (x.cutProfileVector && x.cutProfileVector.length) || (x.profileVector && x.profileVector.length);
      if (outlined(a) || outlined(b)) continue;
      items.push({ sev: 1, what: "overlap", msg: `${a.id} ↔ ${b.id} undeclared overlap of two plain plates`, tag: "bad", tagText: `${fmt(-sep)} mm`, onclick: () => select({ kind: "board", id: a.id }) });
    }
  }

  const pins = presetPins();
  let pinCount = 0;
  let pinDiff = 0;
  if (pins) {
    const mism = checkPins(r, pins);
    pinCount = countPins(pins);
    pinDiff = mism.length;
    for (const m of mism.slice(0, 200)) {
      items.push({ sev: 1, what: "pin", msg: `${m.path} pinned ${fmt(m.expected)} now ${fmt(m.actual)}`, tag: "gap", tagText: m.expected != null && m.actual != null ? `Δ ${fmt(m.actual - m.expected)}` : "missing", onclick: () => { const k = keyFromPinPath(m.path); if (k) selectKey(k); } });
    }
  }
  items.sort((a, b) => a.sev - b.sev);
  const errN = items.filter((i) => i.sev === 0).length;
  const warnN = items.filter((i) => i.sev === 1).length;
  auditPane.replaceChildren(
    h("table", { class: "audit" }, [h("tbody", {}, items.map((it) => h("tr", { onclick: it.onclick || null }, [
      h("td", { class: "what" }, [h("span", { class: `tag ${it.sev === 0 ? "bad" : it.sev === 1 ? "gap" : "ok"}`, text: it.what })]),
      h("td", { class: "msg", text: it.msg }),
      h("td", { class: "num" }, it.tagText ? [h("span", { class: `tag ${it.tag}`, text: it.tagText })] : []),
    ])))]),
    h("div", { class: "empty small", text: pins ? `${pinCount} pinned values in this preset${pinDiff ? `, ${pinDiff} differ` : ", all reproduced"} · joints measured on bounding boxes; outlined boards (tongues, notches) are not reported as overlaps` : "Custom params: pins belong to a preset (Preset ▾ → Save as new preset)." }),
  );
  $("#auditBadge").textContent = errN ? String(errN) : warnN ? String(warnN) : "";
  $("#auditBadge").className = `badge${errN ? " err" : warnN ? " warn" : ""}`;
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

/** Pin mismatch path → provenance key: `D1.cut[3][1]` → `D1.cut[3].z`, `FP0.HINGE_1.x` → `FP0.feat.HINGE_1.x`, `T3.z1` → itself. */
function keyFromPinPath(path) {
  const c = cur();
  let m = /^([A-Za-z][\w-]*)\.(cut|pv)\[(\d+)\]\[(\d)\]$/.exec(path);
  if (m) {
    const b = c.boards.get(m[1]);
    if (!b) return null;
    const axes = m[2] === "cut" ? ["y", "z"] : planeAxes(b.profilePlane);
    return `${m[1]}.${m[2]}[${m[3]}].${axes[Number(m[4])]}`;
  }
  m = /^([A-Za-z][\w-]*)\.(HINGE_\d+)\.([xz])$/.exec(path);
  if (m) return `${m[1]}.feat.${m[2]}.${m[3]}`;
  if (/^[A-Za-z][\w-]*\.[xyz][01]$/.test(path)) return path;
  return null;
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

$$("#bottom .dtab").forEach((tabBtn) => {
  tabBtn.addEventListener("click", () => {
    $$("#bottom .dtab").forEach((x) => x.classList.toggle("active", x === tabBtn));
    $$("#bottom .dpane").forEach((p) => p.classList.toggle("active", p.dataset.dpane === tabBtn.dataset.dtab));
  });
});

// --- panes: [ hides parameters / rules, ] hides the bottom drawer; remembered ------------------
const PANES_KEY = "cablab.bench.panes";
let panes = { left: true, bottom: true };
try { panes = { ...panes, ...JSON.parse(localStorage.getItem(PANES_KEY) || "{}") }; } catch (_) { /* defaults */ }
function applyPanes() {
  $("#bench").classList.toggle("no-left", !panes.left);
  $("#leftToggle").classList.toggle("active", panes.left);
  $("#bottom").classList.toggle("collapsed", !panes.bottom);
  $("#bcenter").classList.toggle("bottom-collapsed", !panes.bottom);
  $("#bottomToggle").textContent = panes.bottom ? "▾" : "▴";
  try { localStorage.setItem(PANES_KEY, JSON.stringify(panes)); } catch (_) { /* not persisted */ }
  if (tab()?.l3) renderL3();
}
function togglePane(which) {
  panes[which] = !panes[which];
  log("bench.pane", { pane: which, open: panes[which] });
  applyPanes();
}
$("#leftToggle").addEventListener("click", () => togglePane("left"));
$("#bottomToggle").addEventListener("click", () => togglePane("bottom"));
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
  renderBoard2D($("#b2dSvg"), {
    board: b, prov: c.prov, features: c.result.features || [], frame: t.frame, selectedKey: highlight ? null : selKey, labels: t.labels,
    tryout: t.tryout && t.tryout.key.startsWith(`${b.id}.`) ? t.tryout : null,
    onPick: (p) => {
      if (!p) { select({ kind: "board", id: b.id }); return; }
      if (p.kind === "corner") { select({ kind: "face", id: b.id, key: p.keys[0], corner: p }); return; }
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
    const back = h("a", { text: ` › ${t.l3}`, onclick: exitL3, title: "Back to the assembly" });
    el.append(back);
  }
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
    h("div", { class: "ctx-title", text: boardId }),
    h("button", { text: "Edit board…", onclick: () => { hideCtx(); enterL3(boardId); } }),
    h("button", { text: "Select board", onclick: () => { hideCtx(); select({ kind: "board", id: boardId }); } }),
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
$("#showPoints").addEventListener("change", (e) => { tab().showPoints = e.target.checked; build3D(true); saveState(); });
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
  $("#showPoints").checked = t.showPoints;
  $$("#viewGroup [data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === (t.view || "3d")));
}

window.addEventListener("keydown", (e) => {
  if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
  if (e.key === "Escape") {
    if (!$("#reportDialog").classList.contains("hidden")) { $("#reportDialog").classList.add("hidden"); return; }
    if (!$("#ruleDialog").classList.contains("hidden")) { $("#ruleDialog [data-cancel]").click(); return; }
    if (highlight) { clearHighlight(); $("#stInfo").textContent = ""; return; }
    if (tab()?.selection) { select(null); return; }
    if (tab()?.l3) exitL3();
  }
  if (e.key === "f" || e.key === "F") frameCabinet();
  if (e.key === "[") togglePane("left");
  if (e.key === "]") togglePane("bottom");
  // Assembly steps: ← takes the last board out, → puts the next one in.
  if (e.key === "ArrowRight" && tab() && !tab().l3) { e.preventDefault(); setStep(tab().step == null ? 1 : tab().step + 1, "key"); }
  if (e.key === "ArrowLeft" && tab() && !tab().l3 && explodePlan) { e.preventDefault(); setStep(tab().step == null ? explodePlan.order.length - 1 : tab().step - 1, "key"); }
});

function renderEmpty() {
  $("#selPanel").replaceChildren(h("div", { class: "panel-head" }, [h("div", { class: "panel-title", text: "Generator bench" }), h("div", { class: "panel-sub", text: "Open a generator with + or from the app's module rail (right-click → Generator rules…)." })]));
  $("#paramsForm").replaceChildren();
  $("#paramsSummary").textContent = "";
  $("#rulesList").replaceChildren();
  $("#stInfo").textContent = "—";
  setBadges(null);
  cabRoot.clear();
  explodePlan = null;
  $("#explodeOrder").replaceChildren();
}

// --- boot ------------------------------------------------------------------------------------------------

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
