// @module bench/core @owns bench state (tabs/cache), data loading, generate, shared DOM helpers
// Shared bench machinery — every bench/* file builds on this. Holds the tab
// state and cache, preset/rules/layout loading, the generator call, the DOM
// builders h()/section(), and the cross-file hook table (`core.refresh` etc.)
// which the shell binds at boot so module files never import the shell.
import { MODULES } from "../modules.js";
import { log } from "../log.js";
import { nameTable } from "./ruleText.js";


export const bridge = window.cablab || null;
export const bench = bridge && bridge.bench;
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const STATE_KEY = "cablab.bench.v1";

/** DOM builder shared by every bench panel. */
export function h(tag, attrs = {}, children = []) {
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
export function section(title, children) {
  return h("div", { class: "panel-section" }, [h("div", { class: "sec-title", text: title }), ...[].concat(children)]);
}

/** @type {{ tabs: any[], active: number }} */
export let state = { tabs: [], active: -1 };
export let tabSeq = 0;
export const cache = new Map(); // tabId -> { result, prov, boards: Map, presets, rules, moduleId }

export function saveState() {
  try {
    const tabs = state.tabs.map((t) => ({ ...t, tryout: null }));
    // This window only. A new Generator Rules window, and the next launch of
    // the app, start from the module just opened — not the last screen.
    sessionStorage.setItem(STATE_KEY, JSON.stringify({ tabs, active: state.active }));
  } catch (_) { /* nothing */ }
}
export function loadState() {
  try {
    localStorage.removeItem(STATE_KEY);
    const raw = JSON.parse(sessionStorage.getItem(STATE_KEY) || "null");
    if (raw && Array.isArray(raw.tabs)) {
      state = { tabs: raw.tabs, active: Math.min(raw.active, raw.tabs.length - 1) };
      tabSeq = raw.tabs.reduce((m, t) => Math.max(m, Number(String(t.id).split("-")[1]) || 0), 0);
    }
  } catch (_) { /* fresh */ }
}
export function tab() { return state.tabs[state.active] || null; }
export function cur() { const t = tab(); return t ? cache.get(t.id) || null : null; }

export function newTab(moduleId, { presetId = null, params = null, label = null } = {}) {
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

export async function loadPresets(moduleId) {
  if (!bench) return { module: moduleId, presets: [] };
  const res = await bench.readPresets(moduleId);
  if (!res || !res.text) return { module: moduleId, presets: [], path: res && res.path };
  try { return { ...JSON.parse(res.text), path: res.path }; } catch (err) { log("bench.presets.corrupt", { module: moduleId, message: err.message }); return { module: moduleId, presets: [], path: res.path }; }
}
export async function loadRules(moduleId) {
  if (!bench) return { rules: {}, path: null };
  const res = await bench.readRules(moduleId);
  if (!res || !res.text) return { rules: {}, path: res && res.path };
  try { return { rules: JSON.parse(res.text), path: res.path }; } catch (_) { return { rules: {}, path: res.path }; }
}

export async function loadLayout(moduleId) {
  if (!bench?.readLayout) return null;
  const res = await bench.readLayout(moduleId);
  if (!res || !res.text) return null;
  try { return { layout: JSON.parse(res.text), path: res.path }; } catch (err) { log("bench.layout.corrupt", { module: moduleId, message: err.message }); return null; }
}

export function generate(moduleId, params, layout = null) {
  const mod = MODULES[moduleId];
  if (!mod) return { boards: [], features: [], validation: { errors: [`unknown module ${moduleId}`], warnings: [] }, debug: {} };
  try {
    return layout ? mod.generate(params, { layout }) : mod.generate(params);
  } catch (err) {
    log("bench.generate.failed", { module: moduleId, message: err.message, stack: err.stack });
    return { boards: [], features: [], validation: { errors: [`generator threw: ${err.message}`], warnings: [] }, debug: {} };
  }
}

/** Presets this tab should offer. Storage and Fridge share generalTall/presets.json;
 *  each tab only lists the cabinets of its own kind. */
export function presetsFor(moduleId, file) {
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

/** Write the in-memory presets file back through the bridge. */
export async function writePresets(c) {
  const { path, ...file } = c.presets;
  const res = await bench.writePresets(c.moduleId, `${JSON.stringify(file, null, 2)}\n`);
  if (!res.ok) window.alert(`Could not write presets.json: ${res.error}`);
  return res.ok;
}

/** Symbol → Chinese name for the active tab's generator (inputs + rules.json labels). */
export function names() {
  const t = tab();
  const c = cur();
  return nameTable(MODULES[t?.moduleId]?.benchInputs || [], c?.rules?.rules || {});
}
