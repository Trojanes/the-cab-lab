// The Space page (right panel): this job's cabinet catalogue.
// Colours, bench top, the three board thicknesses, and the partition
// clearances. Room size stays in Edit space. New cabinets copy this;
// partition walls read the stock now. Cabinets already placed keep the
// colour and thickness they were given.
import * as job from "./job.js";
import {
  CARCASS_COLOR,
  CLEARANCE_MAX,
  DOOR_SERIES,
  coerceDoorName,
  doorSeriesId,
  normalizeFinish,
  normalizeStock,
  validateMaterials,
} from "./materials.js";
import { swatchChipStyle } from "./doorSwatches.js";

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === false || v == null) continue;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

function commit(finish, stock, note) {
  const errors = validateMaterials(finish, stock);
  if (note) note.textContent = errors[0] || "";
  if (errors.length) return;
  job.setMaterials(normalizeFinish(finish), normalizeStock(stock));
}

function seg(options, current, onPick) {
  const group = el("div", { class: "seg-group" });
  for (const o of options) {
    const b = el("button", {
      type: "button",
      class: "tb seg" + (o.id === current ? " active" : ""),
      text: o.label,
    });
    b.addEventListener("click", () => {
      if (o.id === current) return;
      onPick(o.id);
    });
    group.append(b);
  }
  return group;
}

function doorColorSelect(series, value, onChange) {
  const spec = DOOR_SERIES[doorSeriesId(series)];
  const sel = el("select");
  if (spec.groups) {
    for (const g of spec.groups) {
      const og = el("optgroup", { label: g.label });
      for (const name of g.colors) og.append(el("option", { value: name, text: name }));
      sel.append(og);
    }
  } else {
    for (const name of spec.colors) sel.append(el("option", { value: name, text: name }));
  }
  sel.value = coerceDoorName(series, value);
  const chip = el("span", { class: "swatch" });
  const paintChip = () => {
    const s = swatchChipStyle(sel.value);
    chip.style.backgroundColor = s ? s.background : "transparent";
    chip.style.backgroundImage = s && s.image ? `url("${s.image}")` : "";
    chip.style.backgroundSize = s && s.image ? "400%" : "";
    chip.classList.toggle("metallic", !!s && s.finish === "metallic");
    chip.classList.toggle("none", !s);
    chip.title = s ? s.title : "No swatch yet";
  };
  paintChip();
  sel.addEventListener("change", () => { paintChip(); onChange(sel.value); });
  return el("span", { class: "swatch-select" }, [chip, sel]);
}

/** Fields for the Space page. Reads the job catalogue each time the page is drawn. */
export function catalogueFields() {
  const finish = normalizeFinish(job.getFinish());
  const stock = normalizeStock(job.getStock());
  const door = finish.door;
  const note = el("div", { class: "catalogue-note" });
  const save = () => commit(finish, stock, note);
  const nodes = [
    el("label", { class: "field" }, [
      el("span", { text: "Carcass / partition" }),
      el("input", { type: "text", value: CARCASS_COLOR, disabled: true }),
    ]),
    el("label", { class: "field" }, [
      el("span", { text: "Door series" }),
      seg(Object.values(DOOR_SERIES), door.series, (id) => {
        door.series = id;
        for (let i = 0; i < door.colors.length; i += 1) {
          door.colors[i].series = id;
          door.colors[i].name = coerceDoorName(id, door.colors[i].name, i);
        }
        save();
      }),
    ]),
    el("label", { class: "field" }, [
      el("span", { text: "Door colours" }),
      seg([{ id: "one", label: "One" }, { id: "two", label: "Two" }], door.mode, (id) => {
        door.mode = id;
        if (id === "two" && !door.colors[1]) {
          door.colors[1] = { id: "B", series: door.series, name: coerceDoorName(door.series, "", 1) };
        }
        if (id === "one") door.colors = [door.colors[0]];
        save();
      }),
    ]),
    el("label", { class: "field" }, [
      el("span", { text: "Door sides" }),
      seg([{ id: "single", label: "Single" }, { id: "double", label: "Double" }], door.sides || "single", (id) => {
        door.sides = id;
        save();
      }),
    ]),
    el("label", { class: "field" }, [
      el("span", { text: door.mode === "two" ? "Door A" : "Door" }),
      doorColorSelect(door.series, door.colors[0].name, (name) => {
        door.colors[0].name = name;
        door.colors[0].series = door.series;
        save();
      }),
    ]),
  ];
  if (door.mode === "two") {
    nodes.push(el("label", { class: "field" }, [
      el("span", { text: "Door B" }),
      doorColorSelect(door.series, door.colors[1] ? door.colors[1].name : "", (name) => {
        if (!door.colors[1]) door.colors[1] = { id: "B", series: door.series, name };
        else { door.colors[1].name = name; door.colors[1].series = door.series; }
        save();
      }),
    ]));
  }
  nodes.push(el("label", { class: "field" }, [
    el("span", { text: "Bench top" }),
    doorColorSelect("hpl", finish.benchTop && finish.benchTop.name, (name) => {
      finish.benchTop = { name };
      save();
    }),
  ]));

  const stockRow = el("div", { class: "stock-grid" });
  for (const [key, label] of [["carcass", "Carcass"], ["partition", "Partition"], ["door", "Door"]]) {
    const input = el("input", { type: "number", step: "1", min: "3", max: "50", value: stock[key].thickness });
    const apply = () => {
      const n = Number(input.value);
      if (!Number.isFinite(n)) { input.value = stock[key].thickness; return; }
      stock[key].thickness = n;
      save();
    };
    input.addEventListener("change", apply);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
    stockRow.append(el("label", { class: "stock-field" }, [el("span", { text: `${label} (mm)` }), input]));
  }
  nodes.push(stockRow);

  const clearRow = el("div", { class: "stock-grid" });
  for (const [key, label] of [["floorClearance", "Floor clearance"], ["ceilingClearance", "Ceiling clearance"]]) {
    const input = el("input", { type: "number", step: "1", min: "0", max: String(CLEARANCE_MAX), value: stock.partition[key] });
    const apply = () => {
      const n = Number(input.value);
      if (!Number.isFinite(n)) { input.value = stock.partition[key]; return; }
      stock.partition[key] = n;
      save();
    };
    input.addEventListener("change", apply);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
    clearRow.append(el("label", { class: "stock-field" }, [el("span", { text: label }), input]));
  }
  nodes.push(clearRow);
  nodes.push(el("div", { class: "materials-hint", text: "Placed cabinets take this door colour, the door sides, and the bench top. Their board thickness stays. Partition walls use the thickness and the two clearances now. A new cabinet copies all of it." }));
  nodes.push(note);
  return nodes;
}
