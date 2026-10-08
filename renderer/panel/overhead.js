// @module panel @owns renderOverhead/renderUShape — ohc.* zones/rangehood/split/control panels @reads result.debug.zones
// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { MIN_ZONE_WIDTH, fitZoneWidths, overheadEndPanel } from "../modules.js";
import { sideLabel, sideOfRotZ } from "../fit.js";
import { thickness } from "../materials.js";
import { showControlPanelForm } from "../quickCard.js";
import { el, doorLine, numField, section, frontSection, kv, panel, repaint, gapMode, outerSizeFields, controlPanelRows } from "./widgets.js";
// --- overhead editor ---------------------------------------------------------------
//
// Wide page while an OHC is selected: a zone strip (left → right, drag the
// boundaries, click / Ctrl+click to select), the generator's 2D front view,
// a card for the selected zone, and the cabinet-level fields folded below.
// Every edit is one undo step; a boundary drag commits once on release.

const ohcSel = { cabId: null, indices: [] }; // zone selection, kept across re-renders
let ohcDrag = null; // { cabId, refresh } while a strip boundary is dragged

function ohcSelected(cabId) {
  if (ohcSel.cabId !== cabId) { ohcSel.cabId = cabId; ohcSel.indices = []; }
  return ohcSel.indices;
}
export function ohcSelect(cabId, indices) {
  ohcSel.cabId = cabId;
  ohcSel.indices = indices.slice().sort((a, b) => a - b);
  log("ohc.zone.select", { id: cabId, zones: ohcSel.indices });
}

function ohcTypeShort(mod, type) {
  const t = mod.zoneTypes.find((z) => z.id === type);
  return t ? t.short || t.label : type;
}

function ohcSplitTargets(zones) {
  const out = [];
  let x = 0;
  for (let i = 0; i < zones.length - 1; i += 1) {
    x += Number(zones[i].width) || 0;
    if (zones[i].type === "rangehood_flap" && zones[i + 1].type === "rangehood_flap") continue;
    out.push({ after: i, x });
  }
  return out;
}

function startSplitDrag(e, cab, _mod, total) {
  e.preventDefault();
  e.stopPropagation();
  const handle = e.currentTarget;
  const before = job.snapshot();
  const params0 = cab.params;
  const from = params0.splitAfter ?? null;
  const row = handle.parentElement;
  const rect = row.getBoundingClientRect();
  try { handle.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
  handle.classList.add("active");
  ohcDrag = { cabId: cab.id, refresh: () => {} };
  const move = (ev) => {
    const targets = ohcSplitTargets(params0.zones || []);
    if (!targets.length || !rect.width) return;
    const x = ((ev.clientX - rect.left) / rect.width) * total;
    const hit = targets.reduce((best, t) => (Math.abs(t.x - x) < Math.abs(best.x - x) ? t : best));
    job.setParams(cab.id, { ...params0, splitAfter: hit.after }, { history: false });
  };
  const end = (ev) => {
    handle.removeEventListener("pointermove", move);
    handle.removeEventListener("pointerup", end);
    handle.removeEventListener("pointercancel", end);
    try { handle.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
    ohcDrag = null;
    const changed = job.commitSnapshot(before);
    const now = job.getSelected();
    log("ohc.split.move", {
      id: cab.id, from, to: now ? now.params.splitAfter ?? null : null,
      x: now ? job.resultFor(cab.id)?.debug?.split?.x ?? null : null,
      changed, where: "zone strip",
    });
    repaint();
  };
  e.currentTarget.addEventListener("pointermove", move);
  e.currentTarget.addEventListener("pointerup", end);
  e.currentTarget.addEventListener("pointercancel", end);
}

/**
 * The width a zone shows: clearance (face to face) or centre to centre, whichever the
 * front view's dropdown reads, from the last generation. Falls back to the stored span.
 */
function ohcShownWidths(cab, mod) {
  const zones = job.getSelected()?.id === cab.id ? job.getSelected().params.zones || [] : cab.params.zones || [];
  const read = typeof mod.zoneOpenings === "function" ? mod.zoneOpenings(job.resultFor(cab.id)) : [];
  const ok = read.length === zones.length;
  const out = zones.map((z, i) => (ok && read[i] ? (gapMode === "center" ? read[i].center : read[i].clear) : z.width));
  out.readout = ok; // false: the generator gave no openings (checks failing), so these are the stored spans
  return out;
}

/** The zone strip: proportional cells with draggable boundaries; returns { strip, refresh }. */
function zoneStrip(cab, mod) {
  const p = cab.params;
  const zones = p.zones || [];
  const total = p.cabinetWidth;
  const selected = ohcSelected(cab.id);
  const strip = el("div", { class: "zs-strip" });
  const widthRow = el("div", { class: "zs-row" });
  const cumRow = el("div", { class: "zs-row cum" });

  const cells = zones.map((z, i) => {
    const cell = el("div", { class: `zs-zone t-${z.type}${selected.includes(i) ? " sel" : ""}` }, [
      el("span", { class: "zs-type", text: ohcTypeShort(mod, z.type) }),
      el("span", { class: "zs-w", text: String(Math.round(z.width)) }),
    ]);
    cell.addEventListener("click", (e) => {
      const cur = ohcSelected(cab.id);
      if (e.ctrlKey || e.metaKey) ohcSelect(cab.id, cur.includes(i) ? cur.filter((k) => k !== i) : [...cur, i]);
      else ohcSelect(cab.id, [i]);
      repaint();
    });
    return cell;
  });

  const layout = (zs) => {
    const shown = ohcShownWidths(cab, mod);
    const r1 = (v) => String(Math.round(v * 10) / 10);
    zs.forEach((z, i) => {
      cells[i].style.flexBasis = `${(z.width / total) * 100}%`;
      cells[i].querySelector(".zs-w").textContent = r1(shown[i] ?? z.width);
    });
    widthRow.replaceChildren(...zs.map((z, i) => el("span", { style: `flex-basis:${(z.width / total) * 100}%`, text: r1(shown[i] ?? z.width), title: !shown.readout ? "Stored width (boundary to boundary)" : gapMode === "center" ? "Centre to centre" : "Clearance" })));
    let acc = 0;
    const marks = [];
    zs.slice(0, -1).forEach((z, i) => {
      acc += z.width;
      const on = job.getSelected()?.params?.splitAfter === i;
      const mark = el("span", {
        class: on ? "zs-split" : "",
        style: `left:${(acc / total) * 100}%`,
        text: on ? "↔" : String(Math.round(acc)),
        title: on ? "Drag the split onto a line between zones" : "",
      });
      if (on) mark.addEventListener("pointerdown", (e) => startSplitDrag(e, cab, mod, total));
      marks.push(mark);
    });
    cumRow.replaceChildren(...marks);
  };

  // Boundaries: a grip between neighbouring cells; drag moves the boundary (10 mm steps, Shift = 1 mm).
  for (let i = 0; i < zones.length; i += 1) {
    strip.append(cells[i]);
    if (i === zones.length - 1) break;
    const grip = el("div", { class: "zs-grip", title: "Drag to move the boundary · Shift = 1 mm" });
    grip.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const before = job.snapshot();
      const params0 = job.getSelected().params;
      const result0 = job.resultFor(cab.id);
      const rect = strip.getBoundingClientRect();
      const x0 = params0.zones.slice(0, i + 1).reduce((s, z) => s + z.width, 0);
      const startX = e.clientX;
      try { grip.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
      grip.classList.add("active");
      ohcDrag = { cabId: cab.id, refresh: () => layout(job.getSelected().params.zones) };
      const move = (ev) => {
        const mm = ((ev.clientX - startX) / rect.width) * total;
        const step = ev.shiftKey ? 1 : 10;
        const pos = Math.round((x0 + mm) / step) * step;
        job.setParams(cab.id, mod.setDivider(params0, result0, i, pos), { history: false });
      };
      const end = (ev) => {
        grip.removeEventListener("pointermove", move);
        grip.removeEventListener("pointerup", end);
        grip.removeEventListener("pointercancel", end);
        try { grip.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
        grip.classList.remove("active");
        ohcDrag = null;
        const changed = job.commitSnapshot(before);
        const now = job.getSelected();
        log("ohc.zone.drag", { id: cab.id, boundary: i, changed, widths: now ? now.params.zones.map((z) => z.width) : null });
        repaint();
      };
      grip.addEventListener("pointermove", move);
      grip.addEventListener("pointerup", end);
      grip.addEventListener("pointercancel", end);
    });
    strip.append(grip);
  }
  layout(zones);
  return { strip, widthRow, cumRow, refresh: layout };
}

export function renderUShape(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const fitted = result?.params?.zones || p.zones || {};
  const set = (patch, key, from, to) => {
    job.setParams(cab.id, { ...p, ...patch });
    log("uohc.set", { id: cab.id, key, from, to });
  };
  const runCard = (run, label) => {
    const types = run === "BACK" ? mod.zoneTypes : mod.sideZoneTypes;
    const zones = (p.zones && p.zones[run]) || [{ id: `${run}-1`, type: "up_flap", width: 1 }];
    const shown = fitted[run] || zones;
    return section(label, [
      ...shown.map((z, i) => el("label", { class: "field" }, [
        el("span", { text: `Zone ${i + 1} · ${Math.round(z.width)} mm` }),
        el("select", { onchange: (e) => {
          const next = zones.map((zz) => ({ ...zz }));
          if (next[i]) next[i].type = e.target.value;
          e.target.blur();
          set({ zones: { ...p.zones, [run]: next } }, "zone", zones[i]?.type, e.target.value);
        } }, types.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === (zones[i]?.type || z.type) }))),
      ])),
    ]);
  };
  const hood = ["LEFT", "RIGHT"].some((run) => (fitted[run] || []).some((z) => z.type === "rangehood_flap"));
  const hoodCard = hood ? section("Range hood · NCE", [
    numField("Clear height (mm)", p.rangehoodClearHeight ?? 75, (v) => set({ rangehoodClearHeight: Math.max(1, Math.round(v)) }, "rangehoodClearHeight", p.rangehoodClearHeight ?? 75, Math.max(1, Math.round(v))), { step: 5, min: 1 }),
    el("label", { class: "field" }, [
      el("span", { text: "Opening from" }),
      el("div", { class: "seg-group" }, [["left", "Left"], ["right", "Right"]].map(([id, text]) => el("button", {
        type: "button",
        class: `tb seg${(p.rangehoodAlignment === "right" ? "right" : "left") === id ? " active" : ""}`,
        text,
        onclick: () => { if ((p.rangehoodAlignment === "right" ? "right" : "left") !== id) set({ rangehoodAlignment: id }, "rangehoodAlignment", p.rangehoodAlignment || "left", id); },
      }))),
    ]),
    numField("Offset from that side (mm)", p.rangehoodEdgeOffsetX ?? 40, (v) => set({ rangehoodEdgeOffsetX: Math.max(40, Math.round(v)) }, "rangehoodEdgeOffsetX", p.rangehoodEdgeOffsetX ?? 40, Math.max(40, Math.round(v))), { step: 1, min: 40 }),
    el("div", { class: "empty small", text: "A hood on the back run is turned into an up flap. On a side arm the hood stays outside the corner." }),
  ]) : null;
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "U overhead" }),
      el("div", { class: "panel-sub", text: `${cab.id} · back on the wall` }),
      el("div", { class: "panel-sizes" }, outerSizeFields(cab, mod, env, p, {
        logKind: "uohc.size",
        heightFrom: "top",
        show: { D: false },
        labels: { W: "Width along the wall (mm)" },
      })),
    ]),
    shared.board,
    section("Runs", [
      numField("Left arm (mm)", p.leftArmLength, (v) => set({ leftArmLength: Math.max(0, v) }, "leftArmLength", p.leftArmLength, v), { step: 10, min: 0 }),
      numField("Right arm (mm)", p.rightArmLength, (v) => set({ rightArmLength: Math.max(0, v) }, "rightArmLength", p.rightArmLength, v), { step: 10, min: 0 }),
      numField("Run depth (mm)", p.cabinetDepth, (v) => set({ cabinetDepth: Math.max(150, v) }, "cabinetDepth", p.cabinetDepth, v), { step: 10, min: 150 }),
      el("div", { class: "empty small", text: "The back run owns both corners. Each arm is only the part past that corner. Drawing the box sets both arms to the box depth; change an arm here afterwards." }),
    ]),
    runCard("LEFT", "Left arm"),
    runCard("BACK", "Back"),
    runCard("RIGHT", "Right arm"),
    hoodCard,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

export function renderOverhead(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const zones = p.zones || [];
  const total = p.cabinetWidth;
  const selected = ohcSelected(cab.id).filter((i) => i < zones.length);
  const cpt = p.featureWidth ?? thickness(job.getStock(), "carcass");
  const fpt = p.frontPanelThickness ?? thickness(job.getStock(), "door");
  const setZones = (next, kind, extra = {}) => {
    job.setParams(cab.id, { ...p, zones: next });
    log(`ohc.zone.${kind}`, { id: cab.id, widths: next.map((z) => z.width), types: next.map((z) => z.type), ...extra });
  };

  // A drag in progress: refresh the strip in place, keep the DOM (and the pointer capture) alive.
  if (ohcDrag && ohcDrag.cabId === cab.id && panel.querySelector(".zs-strip")) {
    ohcDrag.refresh();
    const view = panel.querySelector(".ohc-front");
    if (view) view.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneIndex: selected[0] ?? -1, gaps: gapMode }) || "";
    return;
  }

  const { strip, widthRow, cumRow } = zoneStrip(cab, mod);

  // Add / delete follow the selected zone, as in the kitchen: only that zone gives or takes width,
  // zones further right keep theirs. After a delete the split stays when the two zones across it survive.
  const r1 = (v) => Math.round(v * 10) / 10;
  const keepSplit = (patch, next) => {
    if (!Number.isInteger(p.splitAfter)) return patch;
    const leftId = zones[p.splitAfter]?.id;
    const rightId = zones[p.splitAfter + 1]?.id;
    const at = next.findIndex((z, k) => z.id === leftId && next[k + 1]?.id === rightId);
    if (at >= 0) patch.splitAfter = at;
    else delete patch.splitAfter;
    return patch;
  };
  const one = selected.length === 1 ? selected[0] : -1;
  // The add is planned when the page is drawn, so a refused add shows as a greyed button with the reason.
  const addPlan = (() => {
    if (one < 0) return { reason: "Select one zone first. The new zone goes to its right." };
    if (zones[one]?.type === "rangehood_flap" && zones[one + 1]?.type === "rangehood_flap") {
      return { reason: "A zone cannot go inside a range hood group." };
    }
    const next = zones.map((z) => ({ ...z }));
    const host = next[one];
    const take = Math.min(400, r1(host.width / 2));
    if (take < MIN_ZONE_WIDTH || host.width - take < MIN_ZONE_WIDTH) {
      return { reason: `Zone ${one + 1} is ${Math.round(host.width)} wide: it cannot give ${MIN_ZONE_WIDTH} mm and keep ${MIN_ZONE_WIDTH}.` };
    }
    host.width = r1(host.width - take);
    const zone = { id: `zone-${Date.now().toString(36)}`, type: "up_flap", width: take };
    next.splice(one + 1, 0, zone);
    const patch = { ...p, zones: next };
    // The new zone fills up to the old line, so a split on or right of that line moves one index along.
    if (Number.isInteger(p.splitAfter) && p.splitAfter >= one) patch.splitAfter = p.splitAfter + 1;
    // Refuse an add the generator would reject (e.g. a range hood group left narrower than its insert needs).
    const known = new Set(result?.validation?.errors || []);
    let fresh = [];
    try { fresh = (mod.generate(patch)?.validation?.errors || []).filter((m) => !known.has(m)); } catch (_) { fresh = []; }
    if (fresh.length) return { reason: `Not here: ${fresh[0]}` };
    return { patch, next };
  })();
  const addZone = el("button", {
    class: "tb",
    text: "+ Add zone",
    disabled: !!addPlan.reason,
    title: addPlan.reason || "Insert a zone to the right of the selected one. Only that zone gives up width; zones further right keep theirs.",
    onclick: () => {
      if (addPlan.reason) { log("ohc.zone.blocked", { id: cab.id, zone: one, reason: addPlan.reason }); return; }
      const { patch, next } = addPlan;
      // Select first: setParams repaints the panel, and the buttons must see the new selection.
      ohcSelect(cab.id, [one + 1]);
      job.setParams(cab.id, patch);
      log("ohc.zone.add", { id: cab.id, at: one + 1, from: one, widths: next.map((z) => z.width), types: next.map((z) => z.type), splitAfter: patch.splitAfter ?? null });
    },
  });
  const delZone = el("button", {
    class: "tb",
    text: "Delete",
    disabled: !selected.length || zones.length - selected.length < 1,
    title: "Each deleted zone's width goes to the zone on its left (the first zone's to its right). Other zones keep theirs.",
    onclick: () => {
      const next = zones.map((z) => ({ ...z }));
      const gone = new Set(selected.map((i) => next[i].id));
      // Right to left, so a run of deleted zones all pours into the survivor on its left.
      for (let i = next.length - 1; i >= 0; i -= 1) {
        if (!gone.has(next[i].id)) continue;
        let heir = -1;
        for (let k = i - 1; k >= 0; k -= 1) if (!gone.has(next[k].id)) { heir = k; break; }
        if (heir < 0) for (let k = i + 1; k < next.length; k += 1) if (!gone.has(next[k].id)) { heir = k; break; }
        if (heir < 0) return;
        next[heir].width = r1(next[heir].width + next[i].width);
        next[i].width = 0;
      }
      const kept = next.filter((z) => !gone.has(z.id));
      const patch = keepSplit({ ...p, zones: kept }, kept);
      ohcSelect(cab.id, []);
      job.setParams(cab.id, patch);
      log("ohc.zone.remove", { id: cab.id, widths: kept.map((z) => z.width), types: kept.map((z) => z.type), removed: selected, splitAfter: patch.splitAfter ?? null });
    },
  });
  const avgZone = el("button", { class: "tb", text: "Average selected", disabled: selected.length < 2, title: "Give the selected zones equal widths (their total stays)", onclick: () => {
    const next = zones.map((z) => ({ ...z }));
    const sum = selected.reduce((s, i) => s + next[i].width, 0);
    const each = Math.round((sum / selected.length) * 10) / 10;
    selected.forEach((i, k) => { next[i].width = k === selected.length - 1 ? Math.round((sum - each * (selected.length - 1)) * 10) / 10 : each; });
    setZones(next, "average", { zones: selected });
  } });

  const front = el("div", { class: "bedroom-front ohc-front" });
  front.innerHTML = mod.frontView(result, { selectedZoneIndex: selected[0] ?? -1, gaps: gapMode }) || "";
  if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  const openings = typeof mod.zoneOpenings === "function" ? mod.zoneOpenings(result) : [];

  // Shown width (clearance or centre to centre) → stored width: the same delta. The neighbour on the right
  // (on the left for the last zone) takes the difference, so the cabinet keeps its width.
  // `clamp` (the zone card, like the kitchen card): an out-of-range number is cut back to the limit.
  // Without it (the number under the front view, like the kitchen) it is refused.
  const setShownWidth = (i, typed, shown, where, { clamp = false } = {}) => {
    const neighbour = i < zones.length - 1 ? i + 1 : i - 1;
    if (neighbour < 0 || !Number.isFinite(typed) || Math.abs(typed - shown) < 0.05) return;
    const next = zones.map((zz) => ({ ...zz }));
    let delta = r1(typed - shown);
    if (clamp) {
      const lo = MIN_ZONE_WIDTH - next[i].width;
      const hi = next[neighbour].width - MIN_ZONE_WIDTH;
      delta = r1(Math.max(lo, Math.min(hi, delta)));
    }
    const width = r1(next[i].width + delta);
    const other = r1(next[neighbour].width - delta);
    if (width < MIN_ZONE_WIDTH || other < MIN_ZONE_WIDTH || Math.abs(delta) < 0.05) {
      log("ohc.zone.blocked", { id: cab.id, zone: i, reason: `a zone stays at least ${MIN_ZONE_WIDTH} mm`, typed, mode: gapMode, where });
      repaint(); // the field goes back to the value the cabinet still has
      return;
    }
    next[i].width = width;
    next[neighbour].width = other;
    setZones(next, "width", { zone: i, width, mode: gapMode, shown: typed, where });
  };

  const editZoneOpening = (dim) => {
    if (front.querySelector(".col-dim-input")) return;
    const i = Number(dim.getAttribute("data-col"));
    const shown = Number(gapMode === "center" ? dim.dataset.center : dim.dataset.clear);
    if (!Number.isInteger(i) || !Number.isFinite(shown)) return;
    const box = dim.getBoundingClientRect();
    const host = front.getBoundingClientRect();
    const input = document.createElement("input");
    input.type = "number";
    input.className = "col-dim-input";
    input.step = "1";
    input.value = String(shown);
    input.style.left = `${box.left - host.left + box.width / 2}px`;
    input.style.top = `${box.top - host.top}px`;
    front.append(input);
    input.focus();
    input.select();
    let done = false;
    const finish = (apply) => {
      if (done) return;
      done = true;
      const typed = Number(input.value);
      input.remove();
      if (apply) setShownWidth(i, typed, shown, "front view");
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  };

  front.addEventListener("click", (e) => {
    const dim = e.target.closest?.(".col-dim.editable");
    if (dim) {
      e.stopPropagation();
      editZoneOpening(dim);
      return;
    }
    const region = e.target.closest?.("[data-zone-index]");
    if (!region) return;
    const i = Number(region.getAttribute("data-zone-index"));
    const cur = ohcSelected(cab.id);
    if (e.ctrlKey || e.metaKey) ohcSelect(cab.id, cur.includes(i) ? cur.filter((k) => k !== i) : [...cur, i]);
    else ohcSelect(cab.id, cur.length === 1 && cur[0] === i ? [] : [i]);
    repaint();
  });

  // Selected zone card.
  let zoneCard = null;
  if (selected.length === 1) {
    const i = selected[0];
    const z = zones[i];
    const type = el("select", { onchange: (e) => {
      const next = zones.map((zz) => ({ ...zz }));
      next[i].type = e.target.value;
      e.target.blur();
      const patch = { ...p, zones: next };
      // The NCE insert is cabinet-wide. Seed its numbers the first time a zone becomes a hood.
      if (e.target.value === "rangehood_flap") {
        patch.rangehoodPreset = p.rangehoodPreset || "NCE";
        if (p.rangehoodClearHeight == null) patch.rangehoodClearHeight = 75;
        if (p.rangehoodAlignment == null) patch.rangehoodAlignment = "left";
        if (p.rangehoodEdgeOffsetX == null) patch.rangehoodEdgeOffsetX = 40;
      }
      job.setParams(cab.id, patch);
      log("ohc.zone.type", { id: cab.id, widths: next.map((zz) => zz.width), types: next.map((zz) => zz.type), zone: i, type: e.target.value });
    } }, mod.zoneTypes.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.type })));
    const read = openings.length === zones.length ? openings[i] : null;
    const widthShown = read ? (gapMode === "center" ? read.center : read.clear) : z.width;
    const widthLabel = !read ? "Width (mm)" : gapMode === "center" ? "Centre width (mm)" : "Clear width (mm)";
    zoneCard = section(`Zone ${i + 1} of ${zones.length}`, [
      el("label", { class: "field" }, [el("span", { text: "Type" }), type]),
      numField(widthLabel, widthShown, (v) => {
        // The neighbour to the right (or left for the last zone) absorbs the difference.
        setShownWidth(i, Number(v), widthShown, "zone card", { clamp: true });
      }, { step: 1, min: 0, readOnly: zones.length <= 1 ? "The only zone fills the cabinet" : null }),
      el("div", { class: "kv" }, [el("span", { text: "From left" }), el("b", { text: `${Math.round(zones.slice(0, i).reduce((s, zz) => s + zz.width, 0))} – ${Math.round(zones.slice(0, i + 1).reduce((s, zz) => s + zz.width, 0))} mm` })]),
    ]);
  } else if (selected.length > 1) {
    zoneCard = section(`${selected.length} zones selected`, [
      el("div", { class: "empty small", text: `Total ${Math.round(selected.reduce((s, i) => s + zones[i].width, 0))} mm · "Average selected" shares it equally.` }),
    ]);
  }

  // NCE range hood: one insert for every adjacent rangehood_flap. The numbers belong to the cabinet.
  const hoodZones = zones.some((z) => z.type === "rangehood_flap");
  const hoodAlign = p.rangehoodAlignment === "right" ? "right" : "left";
  const setHood = (key, value) => {
    const from = p[key];
    job.setParams(cab.id, {
      ...p,
      rangehoodPreset: "NCE",
      rangehoodClearHeight: p.rangehoodClearHeight ?? 75,
      rangehoodAlignment: hoodAlign,
      rangehoodEdgeOffsetX: p.rangehoodEdgeOffsetX ?? 40,
      [key]: value,
    });
    log("ohc.rangehood", { id: cab.id, key, from: from ?? (key === "rangehoodClearHeight" ? 75 : key === "rangehoodEdgeOffsetX" ? 40 : hoodAlign), to: value });
  };
  const hoodSeg = (now, onPick) => el("div", { class: "seg-group" }, [["left", "Left"], ["right", "Right"]].map(([id, text]) => el("button", {
    type: "button", class: `tb seg${now === id ? " active" : ""}`, text, onclick: () => onPick(id),
  })));
  const hoodCard = hoodZones ? section("Range hood · NCE", [
    numField("Clear height (mm)", p.rangehoodClearHeight ?? 75, (v) => setHood("rangehoodClearHeight", Math.max(1, Math.round(v))), { step: 5, min: 1 }),
    el("label", { class: "field" }, [
      el("span", { text: "Opening from" }),
      hoodSeg(hoodAlign, (side) => { if (side !== hoodAlign) setHood("rangehoodAlignment", side); }),
    ]),
    numField("Offset from that side (mm)", p.rangehoodEdgeOffsetX ?? 40, (v) => setHood("rangehoodEdgeOffsetX", Math.max(40, Math.round(v))), { step: 1, min: 40 }),
    kv("Opening", "555 × 285 mm, through the bottom panel"),
    el("div", { class: "empty small", text: "A top, a front and a back in carcass stock. The top tongues into the dividers on each side of the group, and any divider inside the group stands on that top. Clear height is the gap from the bottom panel's top face up to the insert. The carcass needs 365 mm of depth, and 635 mm clear between those outer dividers. Hood zones that touch are one insert; a flap or a fixed panel between two hoods is refused." }),
  ]) : null;

  // A converted partition: the door-stock end panel and the control panels cut through that end.
  const endPanel = overheadEndPanel(p);
  const endCard = endPanel || (p.controlPanels || []).length ? section("End panel", [
    endPanel
      ? kv("End panel", `${endPanel} · door stock ${fpt} mm · door underside to the top, flush with the door face`)
      : kv("End panel", "none"),
    endPanel ? el("div", { class: "empty small", text: "Right-click the cabinet: Change to partition puts a fitted partition back on this outer face when a kitchen waterfall lines up with it." }) : null,
    ...controlPanelRows(cab.id, p.controlPanels || [], { host: "endPanel", canAdd: !!endPanel }),
  ].filter(Boolean)) : null;

  // Cabinet-level fields, folded.
  const sizes = () => outerSizeFields(cab, mod, env, p, { logKind: "ohc.size", heightFrom: "top", depthPad: fpt });
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D + fpt)} × ${Math.round(env.H)} · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box, doors included)", [
      ...sizes(),
      el("div", { class: "kv" }, [el("span", { text: "Bottom above floor" }), el("b", { text: `${Math.round(cab.pose.z)} mm` })]),
    ]),
    section("Material (job stock)", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: `${p.carcassColorName || "White Stipple"} · ${cpt} mm` })]),
      doorLine(p, fpt),
      el("div", { class: "empty small", text: "Every board except the doors is carcass stock; the doors are door stock. Thicknesses come from the space's catalogue." }),
    ]),
    section("Top", [
      el("label", { class: "field" }, [
        el("span", { text: "Style" }),
        el("div", { class: "seg-group" }, [["style_1", "Style 1"], ["style_2", "Style 2"]].map(([id, text]) => el("button", {
          type: "button",
          class: `tb seg${(p.style || "style_1") === id ? " active" : ""}`,
          text,
          onclick: () => {
            if ((p.style || "style_1") === id) return;
            job.setParams(cab.id, { ...p, style: id });
            log("ohc.option", { id: cab.id, key: "style", from: p.style || "style_1", to: id });
          },
        }))),
      ]),
      el("label", { class: "field check", title: "T3 top face, opening upward. A new overhead starts off. A cabinet with no stored value still has the groove." }, [
        el("span", { text: "T3 LED groove" }),
        el("input", { type: "checkbox", checked: p.ledGroove !== false, onchange: (e) => {
          const to = e.target.checked;
          if ((p.ledGroove !== false) === to && p.ledGroove != null) return;
          job.setParams(cab.id, { ...p, ledGroove: to });
          log("ohc.option", { id: cab.id, key: "ledGroove", from: p.ledGroove !== false, to });
        } }),
      ]),
      numField("Top clearance (mm)", p.topClearanceHeight ?? 40, (v) => {
        const to = Math.max(0, v);
        job.setParams(cab.id, { ...p, topClearanceHeight: to });
        log("ohc.option", { id: cab.id, key: "topClearanceHeight", from: p.topClearanceHeight ?? 40, to });
      }, { step: 5, min: 0 }),
      numField("Hinge cup diameter (mm)", p.hingeHoleDiameter ?? 35, (v) => {
        job.setParams(cab.id, { ...p, hingeHoleDiameter: Math.max(0, v) });
        log("ohc.option", { id: cab.id, key: "hingeHoleDiameter", from: p.hingeHoleDiameter ?? 35, to: Math.max(0, v) });
      }, { step: 0.5, min: 0 }),
      numField("Hinge cup depth (mm)", p.hingeHoleDepth ?? 12, (v) => {
        job.setParams(cab.id, { ...p, hingeHoleDepth: Math.max(0, v) });
        log("ohc.option", { id: cab.id, key: "hingeHoleDepth", from: p.hingeHoleDepth ?? 12, to: Math.max(0, v) });
      }, { step: 0.5, min: 0 }),
      numField("Cup from top (mm)", p.hingeHoleFromTop ?? 22.5, (v) => {
        job.setParams(cab.id, { ...p, hingeHoleFromTop: Math.max(0, v) });
        log("ohc.option", { id: cab.id, key: "hingeHoleFromTop", from: p.hingeHoleFromTop ?? 22.5, to: Math.max(0, v) });
      }, { step: 0.5, min: 0 }),
      numField("Cup from side (mm)", p.hingeHoleFromSide ?? 100, (v) => {
        job.setParams(cab.id, { ...p, hingeHoleFromSide: Math.max(0, v) });
        log("ohc.option", { id: cab.id, key: "hingeHoleFromSide", from: p.hingeHoleFromSide ?? 100, to: Math.max(0, v) });
      }, { step: 1, min: 0 }),
      el("div", { class: "empty small", text: "Style 2 sets the divider's front notch behind the door and the carcass rail (door thickness plus carcass thickness). Style 1 starts that notch 70 mm back from the carcass front. The LED groove is on top of T3 either way. A new overhead stores the groove as off." }),
    ]),
  ]);

  const splitTargets = ohcSplitTargets(zones);
  const splitOn = Number.isInteger(p.splitAfter) && splitTargets.some((t) => t.after === p.splitAfter);
  const splitBtn = el("button", {
    class: `tb${splitOn ? " active" : ""}`,
    text: splitOn ? "Remove split" : "Split",
    disabled: !splitOn && splitTargets.length === 0,
    title: splitTargets.length === 0
      ? "Needs two zones, and the line cannot run through a rangehood."
      : "Two carcasses butted on a zone line. Flaps there each keep half the clearance.",
    onclick: () => {
      if (splitOn) {
        const next = { ...p };
        delete next.splitAfter;
        job.setParams(cab.id, next);
        log("ohc.split", { id: cab.id, on: false, from: p.splitAfter });
        return;
      }
      const mid = total / 2;
      const hit = splitTargets.reduce((best, t) => (Math.abs(t.x - mid) < Math.abs(best.x - mid) ? t : best));
      job.setParams(cab.id, { ...p, splitAfter: hit.after });
      log("ohc.split", { id: cab.id, on: true, after: hit.after, x: hit.x });
    },
  });
  const sheetWarn = (result?.validation?.warnings || []).find((w) => /cannot be cut/.test(w));
  const sheetHint = sheetWarn ? el("div", { class: "zs-hint warn", text: sheetWarn }) : null;

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · doors ${sideLabel(sideOfRotZ(cab.pose.rotZ))} · top on the ceiling` }),
      el("div", { class: "panel-sizes" }, outerSizeFields(cab, mod, env, p, { logKind: "ohc.size", heightFrom: "top", depthPad: fpt })),
    ]),
    shared.board,
    section(`Zones · left → right · ${zones.length} · ${Math.round(total)} mm`, [
      el("div", { class: "zs-tools" }, [addZone, delZone, avgZone, splitBtn, el("span", { class: "zs-hint", text: splitOn ? "Drag the blue ↔ onto a line between zones. Flaps there each keep half the clearance." : "Drag a boundary · click a zone (strip or front view) · Ctrl+click adds to the selection · + Add zone goes right of the selected one" })]),
      sheetHint,
      strip,
      widthRow,
      cumRow,
    ]),
    zoneCard,
    hoodCard,
    frontSection("Front view", [front]),
    endCard,
    fold,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

// controlPanelRows — shared with the wall editor; lives in panel/widgets.js.
