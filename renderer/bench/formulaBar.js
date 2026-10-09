// @module bench @owns formula bar — chip editor
// A face formula as an editable bar. Parameter names are atomic chips
// (backspace deletes the whole chip; the letters inside cannot be changed).
// Operators and numbers are ordinary text. Click the bar to edit; Enter commits.
import { formulaPieces, fromDisplay, toDisplay } from "./ruleText.js";

let active = null;

function norm(text) {
  return fromDisplay(String(text ?? "")).replace(/\s+/g, " ").trim();
}

function makeChip(bar, sym) {
  const edit = !!bar._opts?.edit;
  const chip = document.createElement("span");
  chip.className = edit ? "param-chip" : "param-chip locked";
  chip.textContent = sym;
  chip.dataset.sym = sym;
  chip.contentEditable = "false";
  chip.draggable = edit;
  chip.title = edit ? "整颗参数。退格删掉整颗，不能改里面的字母。" : sym;
  if (!edit) return chip;
  chip.addEventListener("pointerdown", (e) => e.stopPropagation());
  chip.addEventListener("dragstart", (e) => {
    chip._dragged = true;
    e.stopPropagation();
    bar._opts.onDragStart?.(e, sym);
  });
  chip.addEventListener("click", (e) => {
    e.stopPropagation();
    if (chip._dragged) { chip._dragged = false; return; }
    begin(bar, false);
    const sel = window.getSelection();
    const range = document.createRange();
    range.setStartAfter(chip);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  });
  return chip;
}

function fill(bar) {
  const expr = toDisplay(bar._opts.expr ?? "");
  bar.replaceChildren();
  for (const piece of formulaPieces(expr)) {
    if (piece.kind === "param") bar.append(makeChip(bar, piece.sym));
    else bar.append(document.createTextNode(piece.text));
  }
}

/** Text of a formula bar. Chips contribute their symbol, never their editable letters. */
export function readFormula(bar) {
  let s = "";
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) { s += node.textContent.replace(/\u00a0/g, " "); return; }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.dataset?.sym) {
      if (s && !/[\s(+\-−*/]$/.test(s)) s += " ";
      s += node.dataset.sym;
      return;
    }
    if (node.tagName === "BR") { s += " "; return; }
    for (const child of node.childNodes) walk(child);
  };
  for (const child of bar.childNodes) walk(child);
  return s.replace(/\s+/g, " ").trim();
}

function placeCaretEnd(bar) {
  const range = document.createRange();
  range.selectNodeContents(bar);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function begin(bar, placeEnd) {
  if (active && active !== bar) commit(active);
  active = bar;
  const was = bar.classList.contains("editing");
  bar.contentEditable = "true";
  bar.classList.add("editing");
  bar._opts.onEdit?.(true);
  if (was) return;
  if (placeEnd) {
    bar.focus();
    placeCaretEnd(bar);
    return;
  }
  setTimeout(() => {
    if (active === bar && document.activeElement !== bar) bar.focus();
  }, 0);
}

function commit(bar) {
  if (!bar.classList.contains("editing")) return;
  bar.classList.remove("editing");
  bar.contentEditable = "false";
  if (active === bar) active = null;
  bar._opts.onEdit?.(false);
  const text = readFormula(bar) || "0";
  if (norm(text) === norm(bar._opts.expr)) { fill(bar); return; }
  bar._opts.onCommit?.(text);
}

function textBeforeCaret(bar) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !bar.contains(sel.anchorNode)) return readFormula(bar);
  const range = sel.getRangeAt(0).cloneRange();
  range.selectNodeContents(bar);
  range.setEnd(sel.anchorNode, sel.anchorOffset);
  const holder = document.createElement("div");
  holder.append(range.cloneContents());
  return readFormula(holder);
}

function insertChip(bar, sym) {
  const chip = makeChip(bar, sym);
  const sel = window.getSelection();
  const before = textBeforeCaret(bar);
  const needsOp = before && !/[+\-−*/(]\s*$/.test(before);
  const put = (range) => {
    if (needsOp) {
      const glue = document.createTextNode(" + ");
      range.insertNode(glue);
      range.setStartAfter(glue);
      range.collapse(true);
    }
    range.insertNode(chip);
    range.setStartAfter(chip);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  };
  if (sel?.rangeCount && bar.contains(sel.anchorNode)) {
    const range = sel.getRangeAt(0);
    range.collapse(true);
    put(range);
    return;
  }
  if (needsOp) bar.append(document.createTextNode(" + "));
  bar.append(chip);
  placeCaretEnd(bar);
}

function adjacentChip(bar, dir) {
  const sel = window.getSelection();
  if (!sel?.rangeCount || !bar.contains(sel.anchorNode)) return null;
  const range = sel.getRangeAt(0);
  if (!range.collapsed) return null;
  const node = range.startContainer;
  const offset = range.startOffset;
  let target = null;
  if (node === bar) target = dir === "back" ? node.childNodes[offset - 1] : node.childNodes[offset];
  else if (node.nodeType === Node.TEXT_NODE) {
    if (dir === "back" && offset === 0) target = node.previousSibling;
    if (dir === "forward" && offset === node.textContent.length) target = node.nextSibling;
  }
  while (target && target.nodeType === Node.TEXT_NODE && !target.textContent) target = dir === "back" ? target.previousSibling : target.nextSibling;
  return target?.dataset?.sym ? target : null;
}

/** The formula bar currently being edited, if any. */
export function editingBar() {
  return active?.classList.contains("editing") ? active : null;
}

/** Take one chip out of an open bar. The bar stays open until Enter. */
export function removeChip(bar, sym) {
  const chip = [...bar.querySelectorAll(".param-chip")].find((c) => c.dataset.sym === sym);
  if (!chip) return false;
  chip.remove();
  return true;
}

/** Drag-over / drop of a tray chip onto a formula, including the blue label around it. */
export function acceptChip(bar, e) {
  if (!bar._opts?.edit) return false;
  const types = [...e.dataTransfer.types];
  if (!types.includes("text/cablab-param") || types.includes("text/cablab-face")) return false;
  e.preventDefault();
  if (e.type === "dragover") {
    e.dataTransfer.dropEffect = "copy";
    bar.classList.add("drop");
    return true;
  }
  bar.classList.remove("drop");
  const sym = e.dataTransfer.getData("text/cablab-param");
  const from = e.dataTransfer.getData("text/cablab-face");
  if (!sym || from) return true;
  const was = bar.classList.contains("editing");
  begin(bar, !was);
  insertChip(bar, sym);
  return true;
}

/**
 * @param bar element that becomes the editable run
 * @param opts.expr displayed formula
 * @param opts.edit false keeps the chips read-only (the orange size)
 * @param opts.face stored on the bar so a tray drop can find it
 * @param opts.onCommit(text) Enter / click outside
 * @param opts.onEdit(on) true while the caret is in the bar
 * @param opts.onDragStart(event, sym)
 * @param opts.dragging() true while a chip is being dragged
 */
export function bindFormulaBar(bar, opts) {
  bar.classList.add("formula-bar");
  bar._opts = opts;
  if (opts.face) bar.dataset.face = opts.face;
  bar.spellcheck = false;
  fill(bar);
  if (!opts.edit) return;
  bar.title = "点击后编辑。参数是整颗按钮，退格删掉整颗；运算和数字可以直接改。回车确认。";
  bar.addEventListener("pointerdown", (e) => {
    if (e.target.closest(".param-chip")) return;
    e.stopPropagation();
    begin(bar, false);
  });
  bar.addEventListener("keydown", (e) => {
    if (!bar.classList.contains("editing")) return;
    e.stopPropagation();
    if (e.key === "Enter") { e.preventDefault(); commit(bar); return; }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      bar.classList.remove("editing");
      bar.contentEditable = "false";
      if (active === bar) active = null;
      bar._opts.onEdit?.(false);
      fill(bar);
      return;
    }
    if (e.key === "Backspace" || e.key === "Delete") {
      e.stopPropagation();
      const chip = adjacentChip(bar, e.key === "Backspace" ? "back" : "forward");
      if (chip) { e.preventDefault(); chip.remove(); }
    }
  });
  bar.addEventListener("dragover", (e) => acceptChip(bar, e));
  bar.addEventListener("dragleave", () => bar.classList.remove("drop"));
  bar.addEventListener("drop", (e) => { e.stopPropagation(); acceptChip(bar, e); });
}

export function beginFormula(bar) {
  if (bar?._opts?.edit) begin(bar, true);
}

document.addEventListener("pointerdown", (e) => {
  if (!active?.classList.contains("editing")) return;
  const host = active.closest(".anno-label, .face-row");
  if (host?.contains(e.target)) return;
  if (active.contains(e.target)) return;
  if (e.target.closest("#paramTray, .param-chip, .formula-bar")) return;
  commit(active);
}, true);
