// --- selection panel ---------------------------------------------------------------------
import { tryLayout } from "./bench.js";
import { $, $$, cur, generate, h, names, section, tab } from "./core.js";
import { renderParamsInto, safeEnvelope, setParams } from "./paramsForm.js";
import { boardEditable, boardLabel, concreteFormula, drivenText, enterMode, nameCenterlines, placementRule, pointFormulas, renderBoardEdit, renderDefaultPanel, renderFacePanel, seedAxes, withAxis } from "./modes.js";
import { boardGroups, build3D, paintSelection, pointMat, pointMeshes, select } from "./view3d.js";
import { exitL3, renderL3 } from "./l3.js";
import { MIN_ZONE_WIDTH, MODULES, fitZoneWidths } from "../modules.js";
import { log } from "../log.js";
import { affectedBy, affectedByRule, boardsOfKeys, entryOf, evaluate, fmt, tree, usesParam, varsFor } from "./provenance.js";
import { AXIS_NAMES, FACE_NAMES, SIZE_NAMES, fromDisplay, toDisplay } from "./ruleText.js";
import { setFace } from "./draft.js";
import { STIPPLE_WHITE } from "../carcassFinish.js";
import { boardPoints } from "./board2d.js";

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

export let highlight = null; // { keys: Set, label }
export function highlightKeys(keys, label, ruleName = null) {
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
export function clearHighlight() {
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

export function renderSelection() {
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
