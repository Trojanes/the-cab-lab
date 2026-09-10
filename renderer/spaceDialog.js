// Step one: define the space. A modal with the space kinds (only Box is
// wired; Vehicle and Floor plan are placeholders) and the kind's fields.
import * as job from "./job.js";
import { SPACE_KINDS, PLANNED_SPACE_KINDS, getSpaceKind } from "./spaces.js";
import { log } from "./log.js";

const overlay = document.getElementById("spaceDialog");
const kindList = overlay.querySelector(".kind-list");
const fieldsEl = overlay.querySelector(".kind-fields");
const errorsEl = overlay.querySelector(".kind-errors");
const titleEl = overlay.querySelector(".modal-title");
const okBtn = overlay.querySelector("[data-ok]");
const cancelBtn = overlay.querySelector("[data-cancel]");

let currentKind = "box";
let values = {};
let mode = "new";

function renderKinds() {
  kindList.replaceChildren();
  for (const k of Object.values(SPACE_KINDS)) {
    const b = document.createElement("button");
    b.className = "kind-card" + (k.id === currentKind ? " active" : "");
    b.innerHTML = `<span class="kind-name"></span><span class="kind-sub"></span>`;
    b.querySelector(".kind-name").textContent = k.label;
    b.querySelector(".kind-sub").textContent = k.sub;
    b.addEventListener("click", () => {
      currentKind = k.id;
      values = k.defaults();
      renderKinds();
      renderFields();
    });
    kindList.append(b);
  }
  for (const k of PLANNED_SPACE_KINDS) {
    const b = document.createElement("button");
    b.className = "kind-card";
    b.disabled = true;
    b.title = "Planned";
    b.innerHTML = `<span class="kind-name"></span><span class="kind-sub"></span><span class="kind-tag">soon</span>`;
    b.querySelector(".kind-name").textContent = k.label;
    b.querySelector(".kind-sub").textContent = k.sub;
    kindList.append(b);
  }
}

function renderFields() {
  const kind = getSpaceKind(currentKind);
  fieldsEl.replaceChildren();
  for (const f of kind.fields) {
    const label = document.createElement("label");
    label.className = "field";
    const span = document.createElement("span");
    span.textContent = f.label;
    if (f.type === "walls") {
      if (!Array.isArray(values.walls)) values.walls = [0, 1, 2, 3];
      const names = ["Front", "Right", "Back", "Left"];
      const row = document.createElement("div");
      row.className = "wall-toggles";
      names.forEach((name, i) => {
        const t = document.createElement("label");
        t.className = "wall-toggle";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = values.walls.includes(i);
        cb.addEventListener("change", () => {
          const set = new Set(values.walls);
          if (cb.checked) set.add(i); else set.delete(i);
          values.walls = [...set].sort((a, b) => a - b);
        });
        t.append(cb, document.createTextNode(name));
        row.append(t);
      });
      label.append(span, row);
      fieldsEl.append(label);
      return;
    }
    const input = document.createElement("input");
    input.type = "number";
    input.step = 10;
    input.min = f.min;
    input.value = values[f.key];
    input.addEventListener("input", () => { values[f.key] = Number(input.value); validate(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    label.append(span, input);
    fieldsEl.append(label);
  }
  validate();
  const first = fieldsEl.querySelector("input");
  if (first) { first.focus(); first.select(); }
}

function validate() {
  const errors = getSpaceKind(currentKind).validate(values);
  errorsEl.replaceChildren(...errors.map((m) => { const d = document.createElement("div"); d.className = "msg err"; d.textContent = m; return d; }));
  okBtn.disabled = errors.length > 0;
  return errors.length === 0;
}

function submit() {
  if (!validate()) return;
  job.defineSpace(currentKind, values);
  close();
}

export function openSpaceDialog() {
  const existing = job.getJob().space;
  mode = existing ? "edit" : "new";
  currentKind = existing ? existing.kind : "box";
  values = existing ? { ...existing.params } : getSpaceKind(currentKind).defaults();
  titleEl.textContent = mode === "edit" ? "Edit space" : "Define the space";
  okBtn.textContent = mode === "edit" ? "Apply" : "Create space";
  cancelBtn.textContent = mode === "edit" ? "Cancel" : "Later";
  renderKinds();
  renderFields();
  log("space.dialog.open", { mode, spaceKind: currentKind, values });
  overlay.classList.remove("hidden");
}

export function close() {
  if (isOpen()) log("space.dialog.close", { mode, spaceKind: currentKind, values, errors: getSpaceKind(currentKind).validate(values) });
  overlay.classList.add("hidden");
}

export function isOpen() {
  return !overlay.classList.contains("hidden");
}

okBtn.addEventListener("click", submit);
cancelBtn.addEventListener("click", close);
overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
