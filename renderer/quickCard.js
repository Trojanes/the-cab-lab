// Small floating cards opened from a right-click: a one-question choice
// ("Which column gives 7?") and the control panel form (centre from the
// ceiling / the back wall, opening size, depth). One card at a time; Esc or a
// click outside closes it. Nothing here touches the job: the caller gets the answer.
import { CONTROL_PANEL_DEFAULTS, CONTROL_PANEL_EDGE_PAST_MM, CONTROL_PANEL_GROOVE_MM } from "./gen/overheadCabinet.js";

let card = null;

function close() {
  if (!card) return;
  card.remove();
  card = null;
}
window.addEventListener("pointerdown", (e) => { if (card && !card.contains(e.target)) close(); });
window.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

function place(node, x, y) {
  document.body.append(node);
  const r = node.getBoundingClientRect();
  node.style.left = `${Math.max(6, Math.min(x, window.innerWidth - r.width - 6))}px`;
  node.style.top = `${Math.max(6, Math.min(y, window.innerHeight - r.height - 6))}px`;
}

function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on")) n.addEventListener(k.slice(2), v);
    else if (v != null) n.setAttribute(k, v);
  }
  for (const c of children) if (c) n.append(c);
  return n;
}

/**
 * One question, one click. `options`: [{ label, disabled, title, value }].
 * Resolves with the picked value, or null when the card was closed.
 */
export function showChoice(x, y, title, options) {
  close();
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
    card = el("div", { class: "ctx quick-card" }, [
      el("div", { class: "ctx-title", text: title }),
      ...options.map((o) => el("button", {
        type: "button", text: o.label, title: o.title || null, disabled: o.disabled ? "" : null,
        onclick: () => finish(o.value),
      })),
    ]);
    const observer = new MutationObserver(() => { if (!document.body.contains(card)) { observer.disconnect(); finish(null); } });
    observer.observe(document.body, { childList: true });
    place(card, x, y);
  });
}

/**
 * The control panel form. `panel` = an existing record to edit, else the defaults.
 * `hint` is shown under the fields (e.g. what the depth cuts). Resolves with
 * { fromCeiling, fromBack, width, height, depth } or null.
 */
export function showControlPanelForm(x, y, { title = "Control panel", panel = null, hint = "" } = {}) {
  close();
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
    const start = {
      fromCeiling: panel?.fromCeiling ?? 200,
      fromBack: panel?.fromBack ?? 200,
      width: panel?.width ?? CONTROL_PANEL_DEFAULTS.width,
      height: panel?.height ?? CONTROL_PANEL_DEFAULTS.height,
      depth: panel?.depth ?? CONTROL_PANEL_DEFAULTS.depth,
    };
    const inputs = {};
    const field = (key, label, min) => {
      const input = el("input", { type: "number", step: "1", min: String(min), value: String(start[key]) });
      inputs[key] = input;
      return el("label", { class: "field" }, [el("span", { text: label }), input]);
    };
    const read = () => {
      const out = {};
      for (const [k, input] of Object.entries(inputs)) {
        const v = Number(input.value);
        if (!Number.isFinite(v)) return null;
        out[k] = Math.round(v * 10) / 10;
      }
      if (out.width < 1 || out.height < 1 || out.depth < 1) return null;
      return out;
    };
    const ok = el("button", { type: "button", class: "tb", text: panel ? "Apply" : "Add", onclick: () => { const v = read(); if (v) finish(v); } });
    card = el("div", { class: "ctx quick-card form" }, [
      el("div", { class: "ctx-title", text: title }),
      field("fromCeiling", "Centre from ceiling", 0),
      field("fromBack", "Centre from back wall", 0),
      field("width", "Opening width (along the wall)", 1),
      field("height", "Opening height", 1),
      field("depth", "Depth", 1),
      el("div", { class: "empty small", text: hint || `Board by board from the room face: cut through while more than ${CONTROL_PANEL_GROOVE_MM} mm is still needed, a ${CONTROL_PANEL_GROOVE_MM} mm half slot on the last one, run ${CONTROL_PANEL_EDGE_PAST_MM} mm past the wall edge so the wiring cut breaks through.` }),
      el("div", { class: "quick-actions" }, [
        el("button", { type: "button", class: "tb", text: "Cancel", onclick: () => finish(null) }),
        ok,
      ]),
    ]);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ok.click(); } });
    const observer = new MutationObserver(() => { if (!document.body.contains(card)) { observer.disconnect(); finish(null); } });
    observer.observe(document.body, { childList: true });
    place(card, x, y);
    inputs.fromCeiling.focus();
    inputs.fromCeiling.select();
  });
}
