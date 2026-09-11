// Step one: define the space. A modal with the space kinds (Box, Vehicle;
// Floor plan is a placeholder) and the kind's fields. Field types:
//   number   plain mm input
//   walls    Front / Right / Back / Left checkboxes
//   choice   segmented buttons (e.g. how the vehicle nose is defined)
//   nose     side-view preview + feature-point table or DXF import, and
//            "Set current as default" (persisted in settings.json)
// Below the kind fields: job-level catalogue — carcass/partition colour
// (White Stipple), door series (Acrylic / HPL) and one or two door colours,
// plus the three board stocks (carcass / partition / door).
import * as job from "./job.js";
import { SPACE_KINDS, PLANNED_SPACE_KINDS, getSpaceKind, nosePoints, graftNose } from "./spaces.js";
import { noseFromDxf } from "./dxf.js";
import { getSetting, setSetting, settingsPath } from "./settings.js";
import {
  CARCASS_COLOR,
  DOOR_SERIES,
  MATERIALS_SETTINGS_KEY,
  coerceDoorName,
  defaultMaterials,
  doorSeriesId,
  normalizeFinish,
  normalizeStock,
  validateMaterials,
} from "./materials.js";
import { log } from "./log.js";

const overlay = document.getElementById("spaceDialog");
const kindList = overlay.querySelector(".kind-list");
const fieldsEl = overlay.querySelector(".kind-fields");
const materialsEl = overlay.querySelector(".materials-fields");
const errorsEl = overlay.querySelector(".kind-errors");
const titleEl = overlay.querySelector(".modal-title");
const okBtn = overlay.querySelector("[data-ok]");
const cancelBtn = overlay.querySelector("[data-cancel]");
const bridge = window.cablab || null;

let currentKind = "box";
let values = {};
let materials = defaultMaterials();
let mode = "new";
let preview = null; // { canvas, draw } while a nose field is shown
let noteEl = null; // status line under the nose block
let materialsNoteEl = null;

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

function renderKinds() {
  kindList.replaceChildren();
  for (const k of Object.values(SPACE_KINDS)) {
    const b = el("button", { class: "kind-card" + (k.id === currentKind ? " active" : "") }, [
      el("span", { class: "kind-name", text: k.label }),
      el("span", { class: "kind-sub", text: k.sub }),
    ]);
    b.addEventListener("click", () => {
      if (currentKind === k.id) return;
      currentKind = k.id;
      values = k.defaults();
      log("space.dialog.kind", { spaceKind: k.id });
      renderKinds();
      renderFields();
    });
    kindList.append(b);
  }
  for (const k of PLANNED_SPACE_KINDS) {
    kindList.append(el("button", { class: "kind-card", disabled: true, title: "Planned" }, [
      el("span", { class: "kind-name", text: k.label }),
      el("span", { class: "kind-sub", text: k.sub }),
      el("span", { class: "kind-tag", text: "soon" }),
    ]));
  }
}

// --- field renderers -----------------------------------------------------------------

function numberField(f) {
  const input = el("input", { type: "number", step: 10, min: f.min, value: values[f.key] });
  input.addEventListener("input", () => { values[f.key] = Number(input.value); refresh(); });
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
  return el("label", { class: "field" }, [el("span", { text: f.label }), input]);
}

function wallsField(f) {
  if (!Array.isArray(values.walls)) values.walls = [0, 1, 2, 3];
  const names = ["Front", "Right", "Back", "Left"];
  const row = el("div", { class: "wall-toggles" });
  names.forEach((name, i) => {
    const cb = el("input", { type: "checkbox" });
    cb.checked = values.walls.includes(i);
    cb.addEventListener("change", () => {
      const set = new Set(values.walls);
      if (cb.checked) set.add(i); else set.delete(i);
      values.walls = [...set].sort((a, b) => a - b);
      refresh();
    });
    row.append(el("label", { class: "wall-toggle" }, [cb, document.createTextNode(name)]));
  });
  return el("label", { class: "field" }, [el("span", { text: f.label }), row]);
}

function choiceField(f) {
  const seg = el("div", { class: "seg-group" });
  for (const o of f.options) {
    const b = el("button", { type: "button", class: "tb seg" + (values[f.key] === o.id ? " active" : ""), text: o.label });
    b.addEventListener("click", () => {
      if (values[f.key] === o.id) return;
      values[f.key] = o.id;
      log("space.dialog.choice", { spaceKind: currentKind, key: f.key, value: o.id });
      renderFields();
    });
    seg.append(b);
  }
  return el("label", { class: "field" }, [el("span", { text: f.label }), seg]);
}

/** Nose block: preview canvas + (points table | DXF picker) + default buttons. */
function noseField(f) {
  if (!values.front || typeof values.front !== "object") values.front = { points: [], dxf: null };
  if (!Array.isArray(values.front.points)) values.front.points = [];
  const wrap = el("div", { class: "nose" });

  const canvas = el("canvas", { class: "nose-preview", width: 560, height: 180 });
  wrap.append(canvas);
  preview = { canvas };

  if (values.frontMode === "dxf") wrap.append(dxfBlock());
  else wrap.append(pointsBlock());

  const kind = getSpaceKind(currentKind);
  const saved = kind.settingsKey ? getSetting(kind.settingsKey) : undefined;
  const setBtn = el("button", { type: "button", class: "tb", text: "Set current as default", title: "New Vehicle spaces start with these values (saved to settings.json now)" });
  setBtn.dataset.role = "set-default";
  setBtn.addEventListener("click", saveAsDefault);
  const resetBtn = el("button", { type: "button", class: "tb subtle", text: "Reset to built-in", disabled: !saved });
  resetBtn.addEventListener("click", resetDefault);
  noteEl = el("div", { class: "nose-note", text: saved ? "A saved default is in use for new Vehicle spaces." : "" });
  wrap.append(el("div", { class: "nose-actions" }, [setBtn, resetBtn]), noteEl);
  return el("div", { class: "field nose-field" }, [el("span", { text: f.label }), wrap]);
}

function pointsBlock() {
  const pts = values.front.points;
  const list = el("div", { class: "point-list" });
  const rerender = () => renderFields();
  const head = el("div", { class: "point-row head" }, [el("span"), el("span", { text: "Y along (mm)" }), el("span", { text: "Z up (mm)" }), el("span")]);
  list.append(head);
  pts.forEach((p, i) => {
    const y = el("input", { type: "number", step: 1, value: p[0] });
    const z = el("input", { type: "number", step: 1, min: 0, value: p[1] });
    y.addEventListener("input", () => { p[0] = Number(y.value); refresh(); });
    z.addEventListener("input", () => { p[1] = Number(z.value); refresh(); });
    const onKey = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        if (i === pts.length - 1) { addPoint(); rerender(); focusPoint(pts.length - 1, 0); }
        else submit();
      }
    };
    y.addEventListener("keydown", onKey);
    z.addEventListener("keydown", onKey);
    const up = el("button", { type: "button", class: "icon", text: "▲", title: "Move up", disabled: i === 0 });
    up.addEventListener("click", () => { [pts[i - 1], pts[i]] = [pts[i], pts[i - 1]]; rerender(); });
    const down = el("button", { type: "button", class: "icon", text: "▼", title: "Move down", disabled: i === pts.length - 1 });
    down.addEventListener("click", () => { [pts[i + 1], pts[i]] = [pts[i], pts[i + 1]]; rerender(); });
    const del = el("button", { type: "button", class: "icon del", text: "×", title: "Remove point" });
    del.addEventListener("click", () => { pts.splice(i, 1); rerender(); });
    list.append(el("div", { class: "point-row" }, [el("span", { class: "point-idx", text: String(i + 1) }), y, z, el("span", { class: "point-tools" }, [up, down, del])]));
  });
  const add = el("button", { type: "button", class: "tb wide", text: "+ Add point" });
  add.addEventListener("click", () => { addPoint(); rerender(); focusPoint(pts.length - 1, 0); });
  list.append(add);
  return list;
}

function addPoint() {
  const pts = values.front.points;
  const last = pts[pts.length - 1] || [0, 0];
  pts.push([last[0], last[1]]);
}
function focusPoint(i, col) {
  const row = fieldsEl.querySelectorAll(".point-row:not(.head)")[i];
  const input = row && row.querySelectorAll("input")[col];
  if (input) { input.focus(); input.select(); }
}

function dxfBlock() {
  const d = values.front.dxf;
  const pick = el("button", { type: "button", class: "tb primary", text: d ? "Re-import DXF…" : "Choose DXF…" });
  pick.addEventListener("click", importDxf);
  const info = d
    ? el("div", { class: "dxf-info" }, [
        el("b", { text: d.name || "DXF" }),
        el("span", { text: ` · ${d.points.length} points · ${d.units || "mm"}${d.chains > 1 ? ` · ${d.chains} chains (longest used)` : ""}` }),
      ])
    : el("div", { class: "dxf-info muted", text: "A side view of the nose: DXF X along the van, DXF Y up. LINE / POLYLINE / ARC / SPLINE; the longest chain is used." });
  const warn = d && d.warnings && d.warnings.length ? el("div", {}, d.warnings.map((w) => el("div", { class: "msg warn", text: w }))) : null;
  return el("div", { class: "dxf-block" }, [el("div", { class: "dxf-row" }, [pick, info]), warn]);
}

async function importDxf() {
  if (!bridge || !bridge.openDxf) { showNote("DXF import needs the desktop app.", "err"); return; }
  const res = await bridge.openDxf();
  if (!res) return;
  const name = res.path.split(/[\\/]/).pop();
  let out;
  try {
    out = noseFromDxf(res.text);
  } catch (err) {
    out = { error: `Could not read DXF: ${err.message}` };
  }
  if (out.error) {
    log("space.dxf.import", { path: res.path, ok: false, error: out.error, counts: out.counts });
    values.front.dxf = null;
    renderFields();
    showNote(out.error, "err");
    return;
  }
  const ys = out.points.map((p) => p[0]);
  const zs = out.points.map((p) => p[1]);
  values.front.dxf = { name, points: out.points, units: out.units, chains: out.chains, warnings: out.warnings };
  log("space.dxf.import", {
    path: res.path, ok: true, points: out.points.length, chains: out.chains, units: out.units, scale: out.scale, counts: out.counts, warnings: out.warnings,
    range: { y: [Math.min(...ys), Math.max(...ys)], z: [Math.min(...zs), Math.max(...zs)] },
  });
  renderFields();
}

// --- defaults ------------------------------------------------------------------------

async function saveAsDefault() {
  const kind = getSpaceKind(currentKind);
  if (!kind.settingsKey) return;
  const errors = kind.validate(values);
  if (errors.length) { showNote("Fix the errors first; an invalid default is not saved.", "err"); return; }
  const res = await setSetting(kind.settingsKey, values);
  log("space.default.set", { spaceKind: currentKind, ok: !!res.ok, path: res.path, error: res.error || undefined, values });
  if (res.ok) {
    showNote(`Saved as default for new ${kind.label} spaces · ${res.path}`, "ok");
    const reset = fieldsEl.querySelector(".nose-actions .subtle");
    if (reset) reset.disabled = false;
  } else showNote(`Could not save default: ${res.error}`, "err");
}

async function resetDefault() {
  const kind = getSpaceKind(currentKind);
  if (!kind.settingsKey) return;
  const res = await setSetting(kind.settingsKey, undefined);
  log("space.default.reset", { spaceKind: currentKind, ok: !!res.ok, path: res.path, error: res.error || undefined });
  if (!res.ok) { showNote(`Could not reset: ${res.error}`, "err"); return; }
  values = kind.builtInDefaults ? kind.builtInDefaults() : kind.defaults();
  renderFields();
  showNote("Built-in default restored (form reset).", "ok");
}

function showNote(text, tone = "") {
  if (!noteEl) return;
  noteEl.textContent = text;
  noteEl.className = `nose-note ${tone}`;
}

// --- preview -------------------------------------------------------------------------

function drawPreview() {
  if (!preview) return;
  const c = preview.canvas;
  const ctx = c.getContext("2d");
  const W = c.width;
  const H = c.height;
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#1a1c1f";
  ctx.fillRect(0, 0, W, H);

  const pts = nosePoints(values);
  const height = Number(values.height) || 0;
  const rear = Number(values.rearDepth) || 0;
  const g = pts ? graftNose(pts, height) : { error: "no points" };
  const raw = pts && pts.length ? pts.map(([y, z]) => [Number(y) || 0, Number(z) || 0]) : [];

  // Extents: nose (grafted or raw) + rear box.
  const frontLen = g.error ? (raw.length ? Math.max(...raw.map((p) => p[0])) - Math.min(...raw.map((p) => p[0])) : 0) : g.frontLen;
  const totalY = Math.max(1, frontLen + rear);
  const maxZ = Math.max(height, ...(g.error ? raw.map((p) => p[1]) : g.profile.map((p) => p[1])), 1);
  const pad = 28;
  const k = Math.min((W - 2 * pad) / totalY, (H - 2 * pad) / maxZ);
  const ox = pad;
  const oy = H - pad;
  const X = (y) => ox + y * k;
  const Y = (z) => oy - z * k;

  // Floor.
  ctx.strokeStyle = "#4a515c";
  ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(totalY), Y(0)); ctx.stroke();

  // Rear box.
  if (rear > 0 && height > 0) {
    ctx.fillStyle = "rgba(79,134,224,0.10)";
    ctx.fillRect(X(frontLen), Y(height), rear * k, height * k);
    ctx.strokeStyle = "#6b7784";
    ctx.strokeRect(X(frontLen), Y(height), rear * k, height * k);
  }

  if (!g.error) {
    // Nose as grafted.
    ctx.fillStyle = "rgba(79,134,224,0.16)";
    ctx.beginPath();
    ctx.moveTo(X(0), Y(0));
    for (const [y, z] of g.profile) ctx.lineTo(X(y), Y(z));
    ctx.lineTo(X(g.frontLen), Y(0));
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#9ec5d8";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < g.profile.length; i += 1) { const [y, z] = g.profile[i]; if (i === 0) ctx.moveTo(X(y), Y(z)); else ctx.lineTo(X(y), Y(z)); }
    ctx.stroke();
    // Nose tip wall.
    ctx.beginPath(); ctx.moveTo(X(0), Y(0)); ctx.lineTo(X(0), Y(g.noseZ)); ctx.stroke();
    // Seam.
    const scaled = Math.abs(g.scale - 1) > 0.001;
    ctx.strokeStyle = scaled ? "#e0a34f" : "#4f86e0";
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(X(g.frontLen), Y(0)); ctx.lineTo(X(g.frontLen), Y(height)); ctx.stroke();
    // Vertices.
    ctx.fillStyle = "#d8dde4";
    for (const [y, z] of g.profile) { ctx.beginPath(); ctx.arc(X(y), Y(z), 2.5, 0, Math.PI * 2); ctx.fill(); }
    // Labels.
    ctx.fillStyle = "#9aa2ad";
    ctx.font = "11px Segoe UI, system-ui, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("0", X(0), oy + 14);
    ctx.fillText(String(Math.round(g.frontLen)), X(g.frontLen), oy + 14);
    ctx.fillText(String(Math.round(totalY)), X(totalY), oy + 14);
    ctx.textAlign = "left";
    ctx.fillText(`${Math.round(height)}`, X(totalY) + 4, Y(height) + 4);
    if (g.noseZ > 1) ctx.fillText(`${Math.round(g.noseZ)}`, X(0) - 26, Y(g.noseZ) + 4);
    ctx.fillStyle = scaled ? "#f0cf9a" : "#9aa2ad";
    ctx.textAlign = "center";
    ctx.fillText(scaled ? `seam ${Math.round(g.seamZ)} → ×${g.scale.toFixed(3)} to ${Math.round(height)}` : `seam = ${Math.round(height)}`, X(g.frontLen), Y(height) - 8);
  } else if (raw.length) {
    // Raw points, not graftable yet.
    const minY = Math.min(...raw.map((p) => p[0]));
    ctx.strokeStyle = "#d94b4b";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    raw.forEach(([y, z], i) => { if (i === 0) ctx.moveTo(X(y - minY), Y(z)); else ctx.lineTo(X(y - minY), Y(z)); });
    ctx.stroke();
  }
}

// --- cabinet catalogue (job-level, not space geometry) --------------------------------

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
  sel.addEventListener("change", () => onChange(sel.value));
  return sel;
}

function renderMaterials() {
  materialsEl.replaceChildren();
  materialsNoteEl = null;
  const finish = materials.finish;
  const door = finish.door;
  const stock = materials.stock;

  const seriesSeg = el("div", { class: "seg-group" });
  for (const o of Object.values(DOOR_SERIES)) {
    const b = el("button", { type: "button", class: "tb seg" + (door.series === o.id ? " active" : ""), text: o.label });
    b.addEventListener("click", () => {
      if (door.series === o.id) return;
      door.series = o.id;
      for (let i = 0; i < door.colors.length; i += 1) {
        door.colors[i].series = o.id;
        door.colors[i].name = coerceDoorName(o.id, door.colors[i].name, i);
      }
      log("space.dialog.choice", { spaceKind: currentKind, key: "finish.door.series", value: o.id });
      renderMaterials();
      refresh();
    });
    seriesSeg.append(b);
  }

  const modeSeg = el("div", { class: "seg-group" });
  for (const o of [{ id: "one", label: "One" }, { id: "two", label: "Two" }]) {
    const b = el("button", { type: "button", class: "tb seg" + (door.mode === o.id ? " active" : ""), text: o.label });
    b.addEventListener("click", () => {
      if (door.mode === o.id) return;
      door.mode = o.id;
      if (o.id === "two" && !door.colors[1]) {
        door.colors[1] = { id: "B", series: door.series, name: coerceDoorName(door.series, "", 1) };
      }
      if (o.id === "one") door.colors = [door.colors[0]];
      log("space.dialog.choice", { spaceKind: currentKind, key: "finish.door.mode", value: o.id });
      renderMaterials();
      refresh();
    });
    modeSeg.append(b);
  }

  const colorA = doorColorSelect(door.series, door.colors[0].name, (name) => {
    door.colors[0].name = name;
    door.colors[0].series = door.series;
    refresh();
  });

  const block = el("div", { class: "materials" }, [
    el("div", { class: "sec-title", text: "Cabinets" }),
    el("label", { class: "field" }, [el("span", { text: "Carcass / partition" }), el("input", { type: "text", value: CARCASS_COLOR, disabled: true })]),
    el("label", { class: "field" }, [el("span", { text: "Door series" }), seriesSeg]),
    el("label", { class: "field" }, [el("span", { text: "Door colours" }), modeSeg]),
    el("label", { class: "field" }, [el("span", { text: door.mode === "two" ? "Door A" : "Door" }), colorA]),
  ]);

  if (door.mode === "two") {
    const colorB = doorColorSelect(door.series, door.colors[1] ? door.colors[1].name : "", (name) => {
      if (!door.colors[1]) door.colors[1] = { id: "B", series: door.series, name };
      else { door.colors[1].name = name; door.colors[1].series = door.series; }
      refresh();
    });
    block.append(el("label", { class: "field" }, [el("span", { text: "Door B" }), colorB]));
    block.append(el("div", { class: "materials-hint", text: "Which modules use which door colour is set later. New cabinets use door A for now." }));
  }

  const stockRow = el("div", { class: "stock-grid" });
  for (const [key, label] of [["carcass", "Carcass"], ["partition", "Partition"], ["door", "Door"]]) {
    const input = el("input", { type: "number", step: 1, min: 3, max: 50, value: stock[key].thickness });
    input.addEventListener("input", () => { stock[key].thickness = Number(input.value); refresh(); });
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") submit(); });
    stockRow.append(el("label", { class: "stock-field" }, [el("span", { text: `${label} (mm)` }), input]));
  }
  block.append(stockRow);
  block.append(el("div", { class: "materials-hint", text: "Carcass = box · Partition = dividers · Door = fronts" }));

  const saved = getSetting(MATERIALS_SETTINGS_KEY);
  const setBtn = el("button", { type: "button", class: "tb", text: "Set current as default", title: "New jobs start with these colours and thicknesses (saved to settings.json now)" });
  setBtn.dataset.role = "set-materials-default";
  setBtn.addEventListener("click", saveMaterialsDefault);
  const resetBtn = el("button", { type: "button", class: "tb subtle", text: "Reset to built-in", disabled: !saved });
  resetBtn.addEventListener("click", resetMaterialsDefault);
  materialsNoteEl = el("div", { class: "nose-note", text: saved ? "A saved cabinet default is in use for new jobs." : "" });
  block.append(el("div", { class: "nose-actions" }, [setBtn, resetBtn]), materialsNoteEl);
  materialsEl.append(block);
}

async function saveMaterialsDefault() {
  const errors = validateMaterials(materials.finish, materials.stock);
  if (errors.length) { showMaterialsNote("Fix the errors first; an invalid default is not saved.", "err"); return; }
  const payload = { finish: normalizeFinish(materials.finish), stock: normalizeStock(materials.stock) };
  const res = await setSetting(MATERIALS_SETTINGS_KEY, payload);
  log("materials.default.set", { ok: !!res.ok, path: res.path, error: res.error || undefined, ...payload });
  if (res.ok) {
    showMaterialsNote(`Saved as default for new jobs · ${res.path}`, "ok");
    const reset = materialsEl.querySelector(".nose-actions .subtle");
    if (reset) reset.disabled = false;
  } else showMaterialsNote(`Could not save default: ${res.error}`, "err");
}

async function resetMaterialsDefault() {
  const res = await setSetting(MATERIALS_SETTINGS_KEY, undefined);
  log("materials.default.reset", { ok: !!res.ok, path: res.path, error: res.error || undefined });
  if (!res.ok) { showMaterialsNote(`Could not reset: ${res.error}`, "err"); return; }
  materials = defaultMaterials();
  renderMaterials();
  refresh();
  showMaterialsNote("Built-in cabinet default restored (form reset).", "ok");
}

function showMaterialsNote(text, tone = "") {
  if (!materialsNoteEl) return;
  materialsNoteEl.textContent = text;
  materialsNoteEl.className = `nose-note ${tone}`;
}

function dialogPayload() {
  return { spaceKind: currentKind, values, finish: materials.finish, stock: materials.stock };
}

// --- render / validate / submit ---------------------------------------------------------

function renderFields() {
  const kind = getSpaceKind(currentKind);
  fieldsEl.replaceChildren();
  preview = null;
  noteEl = null;
  for (const f of kind.fields) {
    if (f.type === "walls") fieldsEl.append(wallsField(f));
    else if (f.type === "choice") fieldsEl.append(choiceField(f));
    else if (f.type === "nose") fieldsEl.append(noseField(f));
    else fieldsEl.append(numberField(f));
  }
  refresh();
  const first = fieldsEl.querySelector("input");
  if (first && !fieldsEl.contains(document.activeElement)) { first.focus(); first.select(); }
}

function refresh() {
  validate();
  drawPreview();
}

function validate() {
  const errors = [
    ...getSpaceKind(currentKind).validate(values),
    ...validateMaterials(materials.finish, materials.stock),
  ];
  errorsEl.replaceChildren(...errors.map((m) => el("div", { class: "msg err", text: m })));
  okBtn.disabled = errors.length > 0;
  const setBtn = fieldsEl.querySelector('[data-role="set-default"]');
  if (setBtn) setBtn.disabled = getSpaceKind(currentKind).validate(values).length > 0;
  const matBtn = materialsEl.querySelector('[data-role="set-materials-default"]');
  if (matBtn) matBtn.disabled = validateMaterials(materials.finish, materials.stock).length > 0;
  return errors.length === 0;
}

function submit() {
  if (!validate()) return;
  job.defineSpace(currentKind, values, {
    finish: normalizeFinish(materials.finish),
    stock: normalizeStock(materials.stock),
  });
  close();
}

export function openSpaceDialog() {
  const existing = job.getJob().space;
  mode = existing ? "edit" : "new";
  currentKind = existing ? existing.kind : "box";
  values = existing ? JSON.parse(JSON.stringify(existing.params)) : getSpaceKind(currentKind).defaults();
  materials = existing
    ? { finish: normalizeFinish(job.getFinish()), stock: normalizeStock(job.getStock()) }
    : defaultMaterials();
  titleEl.textContent = mode === "edit" ? "Edit space" : "Define the space";
  okBtn.textContent = mode === "edit" ? "Apply" : "Create space";
  cancelBtn.textContent = mode === "edit" ? "Cancel" : "Later";
  renderKinds();
  renderFields();
  renderMaterials();
  refresh();
  log("space.dialog.open", { mode, ...dialogPayload(), settings: settingsPath() });
  overlay.classList.remove("hidden");
}

export function close() {
  if (isOpen()) {
    log("space.dialog.close", {
      mode,
      ...dialogPayload(),
      errors: [
        ...getSpaceKind(currentKind).validate(values),
        ...validateMaterials(materials.finish, materials.stock),
      ],
    });
  }
  overlay.classList.add("hidden");
}

export function isOpen() {
  return !overlay.classList.contains("hidden");
}

okBtn.addEventListener("click", submit);
cancelBtn.addEventListener("click", close);
overlay.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); } });
