// --- board parameter modes: default (position formulas) / face (contact, flush) -------------------
// Right-click any board → 参数调试. A board in layout.json edits its placement rule. A board
// still placed in code shows the formulas it already has; confirming a new box rule is refused
// by the generator when the outline would not follow. The overall inputs stay on the left.
import { ruleText, tryLayout } from "./bench.js";
import { $, cur, generate, h, names, saveState, section, tab } from "./core.js";
import { applyExplode, bbox, boardGroups, build3D, cabRoot, clearNudge, raycaster, storeCamera, tip, toggleFaceMove } from "./view3d.js";
import { renderSelection } from "./selection.js";
import { enterL3, exitL3, renderCrumb, renderL3 } from "./l3.js";
import * as THREE from "three";
import { camera, canvas, frame, rayFromClient } from "../space.js";
import { MODULES } from "../modules.js";
import { log } from "../log.js";
import { entryOf, flatFormula, fmt } from "./provenance.js";
import { AXIS_NAMES, CORNER_NAMES, FACE_NAMES, SIZE_NAMES, formulaPieces, fromDisplay, removeParam, sizeFormula, stripLeadEquals, toDisplay, withOffset } from "./ruleText.js";
import { diffLayouts, ensureAxis, isDirty, setCorner, setFace, setFeatureDepth, setRelation } from "./draft.js";
import { planeAxes } from "../gen/pins.js";
import { bindFormulaBar, editingBar, removeChip } from "./formulaBar.js";
import { LabelOverlay, buildDefaultAnnotations, disposeAnnotations } from "./annotate.js";
import { faceAt, faceRegion, overlapArea } from "./faceRegion.js";

export const MODE_GHOST = 0.18;
export let modeGroup = null;
export const labelOverlay = new LabelOverlay($("#viewport"));
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

export function placementRule(boardId) {
  return tab()?.draft?.layout?.boards?.[boardId] || null;
}
export function boardLabel(boardId) {
  return placementRule(boardId)?.label || cur()?.boards.get(boardId)?.name || boardId;
}

export function enterMode(kind, boardId) {
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
export function exitMode() {
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
export function drivenText(axis, rule) {
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
export function concreteFormula(prov, key) {
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
export function nameCenterlines(formula) {
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

export function seedAxes(board, prov) {
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

export function buildModeOverlay() {
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

export function withAxis(layout, board, face, prov) {
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
export function renderDefaultPanel(panel) {
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
export function faceHit(clientX, clientY) {
  const t = tab();
  const ray = rayFromClient(clientX, clientY);
  raycaster.set(ray.origin, ray.direction);
  const hits = raycaster.intersectObjects(Array.from(boardGroups.values()).map((g) => g.mesh), false);
  const wantSelf = !t.mode.pick?.move || t.mode.pick.step === "kind" || t.mode.pick.step === "view";
  return hits.find((h) => (h.object.userData.boardId === t.mode.board) === wantSelf) || hits[0] || null;
}

export function facePick(hit) {
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

export function confirmRelation() {
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

export function renderFacePanel(panel) {
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

export function boardEditable(boardId) {
  const r = placementRule(boardId);
  return !!(r && (r.outline || r.features));
}

/** Which corner rule an outline point is (frame-local coordinates match), or null for a generated point. */
export function cornerOf(b, p) {
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

export function dragPoint(b, p, du, dv) {
  const t = tab();
  const k = cornerOf(b, p);
  if (!k) { t.l3Error = "这个点由分隔板缺口生成，跟着后边走，不能单独拖动。拖四个角点。"; renderSelection(); return; }
  const c = placementRule(b.id).outline.corners[k];
  applyCorner(b.id, k, [["u", withOffset(c.u, du)], ["v", withOffset(c.v, dv)]], "drag");
}

export function renderBoardEdit(panel) {
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
export function pointFormulas(b, sel, prov) {
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
