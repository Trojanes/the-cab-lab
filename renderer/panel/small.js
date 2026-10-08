// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { MIN_ZONE_HEIGHT } from "../modules.js";
import { el, numField, section, frontSection, panel, repaint } from "./widgets.js";
// --- cabinet ---------------------------------------------------------------------

const smallSel = { cabId: null, zoneId: null };
let smallDrag = null;

function smallSelected(cabId) {
  if (smallSel.cabId !== cabId) { smallSel.cabId = cabId; smallSel.zoneId = null; }
  return smallSel.zoneId;
}

export function renderSmall(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const zones = result?.zones || [];
  const paramsZones = p.zones || [];

  if (smallDrag && smallDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    smallDrag.refresh();
    return;
  }

  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneId: smallSelected(cab.id) }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  };
  drawFront();

  front.addEventListener("click", (e) => {
    if (smallDrag) return;
    const cell = e.target.closest?.("[data-zone]");
    if (!cell) return;
    const zid = cell.getAttribute("data-zone");
    smallSel.zoneId = smallSel.zoneId === zid ? null : zid;
    log("small.zone.select", { id: cab.id, zone: smallSel.zoneId });
    repaint();
  });
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    const svg = front.querySelector("svg");
    if (!g || !svg || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const index = Number(g.getAttribute("data-index") || 0);
    const params0 = cab.params;
    const result0 = job.resultFor(cab.id);
    const before = job.snapshot();
    const toZ = (clientY) => {
      const s = front.querySelector("svg");
      const rect = s.getBoundingClientRect();
      const k = Number(s.getAttribute("width")) / rect.width;
      const scale = Number(s.dataset.scale);
      const oy = Number(s.dataset.oy);
      const H = Number(s.dataset.h);
      return H - ((clientY - rect.top) * k - oy) / scale;
    };
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic */ }
    front.classList.add("dragging");
    smallDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(toZ(ev.clientY) / step) * step;
      job.setParams(cab.id, mod.setDivider(params0, result0, index, v), { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      front.classList.remove("dragging");
      smallDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("small.zone.drag", { id: cab.id, boundary: index, to: now ? now.params.zones?.map((z) => z.height) : null, changed, where: "front view" });
      repaint();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  const selId = smallSelected(cab.id);
  const selIndex = zones.findIndex((z) => z.id === selId);
  const sel = selIndex >= 0 ? zones[selIndex] : null;
  const setZones = (next, kind) => {
    job.setParams(cab.id, { ...p, zones: next });
    log(`small.zone.${kind}`, { id: cab.id, zone: selId, heights: next.map((z) => z.height) });
  };
  const addRow = el("button", { class: "tb", text: "+ Row", onclick: () => {
    const next = paramsZones.map((z) => ({ ...z }));
    const tallest = next.reduce((a, b) => (b.height > a.height ? b : a), next[0]);
    const take = Math.min(150, (tallest?.height || 0) - MIN_ZONE_HEIGHT);
    if (take < MIN_ZONE_HEIGHT) { log("small.zone.blocked", { id: cab.id, reason: `no row can give ${MIN_ZONE_HEIGHT} mm` }); return; }
    tallest.height = Math.round((tallest.height - take) * 10) / 10;
    const zone = { id: `zone-${Date.now().toString(36)}`, type: "drawer", height: take };
    next.push(zone);
    smallSel.zoneId = zone.id;
    setZones(next, "add");
  } });
  const removeRow = el("button", { class: "tb", text: "Remove row", disabled: !sel || paramsZones.length <= 1, onclick: () => {
    const heir = paramsZones[selIndex < paramsZones.length - 1 ? selIndex + 1 : selIndex - 1];
    const next = paramsZones.filter((z) => z.id !== sel.id).map((z) => ({ ...z }));
    const keep = next.find((z) => z.id === heir.id);
    if (keep) keep.height = Math.round((keep.height + sel.height) * 10) / 10;
    smallSel.zoneId = keep?.id ?? null;
    setZones(next, "remove");
  } });
  let card = null;
  if (sel) {
    const type = el("select", { onchange: (e) => {
      const next = paramsZones.map((z) => ({ ...z }));
      const row = next.find((z) => z.id === sel.id);
      if (row) row.type = e.target.value;
      e.target.blur();
      setZones(next, "type");
    } }, mod.zoneTypes.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === sel.type })));
    card = section("Row", [
      type,
      numField("Height (mm)", sel.height, (v) => {
        const next = paramsZones.map((z) => ({ ...z }));
        const i = next.findIndex((z) => z.id === sel.id);
        const j = i < next.length - 1 ? i + 1 : i - 1;
        if (i < 0 || j < 0) return;
        const val = Math.max(MIN_ZONE_HEIGHT, Math.round(v));
        const delta = val - next[i].height;
        if (next[j].height - delta < MIN_ZONE_HEIGHT) return;
        next[i].height = val;
        next[j].height = Math.round((next[j].height - delta) * 10) / 10;
        setZones(next, "height");
      }, { step: 10, min: MIN_ZONE_HEIGHT }),
    ]);
  }

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Small cabinet" }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${zones.length} rows` }),
    ]),
    shared.board,
    el("div", { class: "panel-section" }, [addRow, removeRow]),
    card,
    frontSection("Front view", [front]),
    section("Sides", [
      el("label", { class: "field check", title: "Door panel: colour face outward, half groove. Off: carcass side, groove through." }, [
        el("input", { type: "checkbox", checked: !!p.leftSideDoorColor, onchange: (e) => { job.setParams(cab.id, { ...p, leftSideDoorColor: e.target.checked }); log("small.zone.side", { id: cab.id, side: "left", on: e.target.checked }); } }),
        el("span", { text: "Left side is a door panel" }),
      ]),
      el("label", { class: "field check", title: "Door panel: colour face outward, half groove. Off: carcass side, groove through." }, [
        el("input", { type: "checkbox", checked: !!p.rightSideDoorColor, onchange: (e) => { job.setParams(cab.id, { ...p, rightSideDoorColor: e.target.checked }); log("small.zone.side", { id: cab.id, side: "right", on: e.target.checked }); } }),
        el("span", { text: "Right side is a door panel" }),
      ]),
    ]),
    section("Outer size (= box)", [
      numField("Width (mm)", env.W, (v) => job.setParams(cab.id, mod.setEnvelope(p, { W: Math.max(mod.minSize.W, v) }))),
      numField("Depth (mm)", env.D, (v) => job.setParams(cab.id, mod.setEnvelope(p, { D: Math.max(mod.minSize.D, v) }))),
      numField("Height (mm)", env.H, (v) => job.setParams(cab.id, mod.setEnvelope(p, { H: Math.max(mod.minSize.H, v) }))),
    ]),
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
