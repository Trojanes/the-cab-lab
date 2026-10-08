// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { MIN_ZONE_WIDTH, fitZoneWidths } from "../modules.js";
import { sideLabel, sideOfRotZ } from "../interact.js";
import { thickness } from "../materials.js";
import { el, doorLine, numField, section, frontSection, kv, panel, repaint, gapMode } from "./widgets.js";
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
    let x = 0;
    zs.forEach((z, i) => {
      cells[i].style.flexBasis = `${(z.width / total) * 100}%`;
      cells[i].querySelector(".zs-w").textContent = String(Math.round(z.width));
      x += z.width;
    });
    widthRow.replaceChildren(...zs.map((z) => el("span", { style: `flex-basis:${(z.width / total) * 100}%`, text: String(Math.round(z.width)) })));
    let acc = 0;
    cumRow.replaceChildren(...zs.slice(0, -1).map((z) => { acc += z.width; return el("span", { style: `left:${(acc / total) * 100}%`, text: String(Math.round(acc)) }); }));
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
  const setHeightDown = (v) => {
    const H = Math.max(mod.minSize.H, v);
    const before = job.snapshot();
    job.updateCabinet(cab.id, (c) => {
      c.params = mod.setEnvelope(c.params, { H });
      c.pose = { ...c.pose, z: c.pose.z + (env.H - H) };
    });
    job.commitSnapshot(before);
    log("uohc.set", { id: cab.id, key: "cabinetHeight", from: env.H, to: H });
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
      el("div", { class: "panel-sub", text: `${cab.id} · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} mm · back on the wall` }),
    ]),
    shared.board,
    section("Runs", [
      numField("Width along the wall (mm)", p.totalWidth, (v) => set({ totalWidth: Math.max(mod.minSize.W, v) }, "totalWidth", p.totalWidth, v)),
      numField("Left arm (mm)", p.leftArmLength, (v) => set({ leftArmLength: Math.max(0, v) }, "leftArmLength", p.leftArmLength, v), { step: 10, min: 0 }),
      numField("Right arm (mm)", p.rightArmLength, (v) => set({ rightArmLength: Math.max(0, v) }, "rightArmLength", p.rightArmLength, v), { step: 10, min: 0 }),
      numField("Run depth (mm)", p.cabinetDepth, (v) => set({ cabinetDepth: Math.max(150, v) }, "cabinetDepth", p.cabinetDepth, v), { step: 10, min: 150 }),
      numField("Height (mm)", env.H, setHeightDown),
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
    if (view) view.innerHTML = mod.frontView(result, { selectedZoneIndex: selected[0] ?? -1, gaps: gapMode }) || "";
    return;
  }

  const { strip, widthRow, cumRow } = zoneStrip(cab, mod);

  const addZone = el("button", { class: "tb", text: "+ Add zone", onclick: () => {
    // The new zone takes up to 300 mm from the widest one (or everything is re-fitted).
    const next = zones.map((z) => ({ ...z }));
    const widest = next.reduce((a, b) => (b.width > a.width ? b : a), next[0]);
    const take = Math.min(300, widest.width - MIN_ZONE_WIDTH);
    const zone = { id: `zone-${Date.now().toString(36)}`, type: "up_flap", width: Math.max(MIN_ZONE_WIDTH, take) };
    if (take >= MIN_ZONE_WIDTH) { widest.width = Math.round((widest.width - take) * 10) / 10; next.push(zone); setZones(next, "add"); }
    else if ((next.length + 1) * MIN_ZONE_WIDTH <= total) { next.push(zone); setZones(fitZoneWidths(next, total), "add"); }
    else log("ohc.zone.blocked", { id: cab.id, reason: `no room for another ${MIN_ZONE_WIDTH} mm zone`, total });
    ohcSelect(cab.id, [next.length - 1]);
  } });
  const delZone = el("button", { class: "tb", text: "Delete", disabled: !selected.length || zones.length - selected.length < 1, onclick: () => {
    const next = zones.filter((_, i) => !selected.includes(i)).map((z) => ({ ...z }));
    setZones(fitZoneWidths(next, total), "remove", { removed: selected });
    ohcSelect(cab.id, []);
  } });
  const avgZone = el("button", { class: "tb", text: "Average selected", disabled: selected.length < 2, title: "Give the selected zones equal widths (their total stays)", onclick: () => {
    const next = zones.map((z) => ({ ...z }));
    const sum = selected.reduce((s, i) => s + next[i].width, 0);
    const each = Math.round((sum / selected.length) * 10) / 10;
    selected.forEach((i, k) => { next[i].width = k === selected.length - 1 ? Math.round((sum - each * (selected.length - 1)) * 10) / 10 : each; });
    setZones(next, "average", { zones: selected });
  } });

  const front = el("div", { class: "ohc-front" });
  front.innerHTML = mod.frontView(result, { selectedZoneIndex: selected[0] ?? -1, gaps: gapMode }) || "";
  if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));

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
    const neighbour = i < zones.length - 1 ? i + 1 : i - 1;
    const maxW = neighbour >= 0 ? z.width + zones[neighbour].width - MIN_ZONE_WIDTH : total;
    zoneCard = section(`Zone ${i + 1} of ${zones.length}`, [
      el("label", { class: "field" }, [el("span", { text: "Type" }), type]),
      numField("Width (mm)", z.width, (v) => {
        // The neighbour to the right (or left for the last zone) absorbs the difference.
        const w = Math.max(MIN_ZONE_WIDTH, Math.min(maxW, Math.round(v)));
        if (neighbour < 0) return;
        const next = zones.map((zz) => ({ ...zz }));
        const delta = w - next[i].width;
        next[i].width = w;
        next[neighbour].width = Math.round((next[neighbour].width - delta) * 10) / 10;
        setZones(next, "width", { zone: i, width: w });
      }, { step: 10, min: MIN_ZONE_WIDTH }),
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

  // Cabinet-level fields, folded.
  const setEnv = (k) => (v) => job.setParams(cab.id, mod.setEnvelope(p, { [k]: Math.max(mod.minSize[k], v) }));
  const setHeightDown = (v) => {
    // The top stays on the ceiling: a taller box moves its bottom down.
    const H = Math.max(mod.minSize.H, v);
    const before = job.snapshot();
    job.updateCabinet(cab.id, (c) => { c.params = mod.setEnvelope(c.params, { H }); c.pose = { ...c.pose, z: c.pose.z + (env.H - H) }; });
    job.commitSnapshot(before);
  };
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D + fpt)} × ${Math.round(env.H)} · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box, doors included)", [
      numField("Width (mm)", env.W, setEnv("W")),
      numField("Depth (mm)", env.D + fpt, (v) => setEnv("D")(v - fpt)),
      numField("Height (mm)", env.H, setHeightDown),
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

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · doors ${sideLabel(sideOfRotZ(cab.pose.rotZ))} · ${Math.round(env.W)} × ${Math.round(env.D + fpt)} × ${Math.round(env.H)} mm · top on the ceiling` }),
    ]),
    shared.board,
    section(`Zones · left → right · ${zones.length} · ${Math.round(total)} mm`, [
      el("div", { class: "zs-tools" }, [addZone, delZone, avgZone, el("span", { class: "zs-hint", text: "Drag a boundary · click a zone · Ctrl+click adds to the selection" })]),
      strip,
      widthRow,
      cumRow,
    ]),
    zoneCard,
    hoodCard,
    frontSection("Front view", [front]),
    fold,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
