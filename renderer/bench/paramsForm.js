// @module bench @owns the right-side parameter forms (per-module input renderers)
// Parameter forms: renders the generator's inputs for the active tab and
// commits edits through setParam/setParams → core.refresh. Pure UI — writes
// only t.params, never rules.json/layout.json.
import { refresh } from "./bench.js";
import { $, cur, h, tab } from "./core.js";
import { FRIDGE_BELOW_TYPES, MIN_ZONE_HEIGHT, MIN_ZONE_WIDTH, MODULES, fitZoneWidths, fridgeFix, fridgeParts } from "../modules.js";
import { log } from "../log.js";
import { fmt, usesParam } from "./provenance.js";
import { fridgeCabinetWidth } from "../gen/generalTall.js";

const ruleValue = (name) => cur()?.rules?.rules?.[name]?.value;

// --- params form -----------------------------------------------------------------------

/** Fill `form` with this generator's inputs. Shown on the right, not the left. */
export function renderParamsInto(form) {
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

export function setParams(next, key, from, to) {
  const t = tab();
  t.params = next;
  t.tryout = null;
  log("bench.param", { module: t.moduleId, key, from, to });
  refresh();
}

export function safeEnvelope(t) {
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
