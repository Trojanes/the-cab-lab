// @module panel @owns renderBedSide — bedside drawer, read-only W
// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { el, numField, section, panel, repaint, outerSizeFields } from "./widgets.js";
function bedSideChoice(side, type) {
  if (type === "drawer") return "drawer";
  const towardWall = side === "left" ? "right_door" : "left_door";
  return type === towardWall ? "wall" : "bed";
}
function bedSideType(side, choice) {
  if (choice === "drawer") return "drawer";
  if (choice === "wall") return side === "left" ? "right_door" : "left_door";
  return side === "left" ? "left_door" : "right_door";
}

let bedSideDrag = null; // { cabId, refresh } while the shelf line is dragged in the front view

export function renderBedSide(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const side = p.side === "right" ? "right" : "left";
  const lim = mod.dividers(p, result)[0];
  // A drag in progress: redraw the SVG in place and keep the container (and its listeners) alive.
  if (bedSideDrag && bedSideDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    bedSideDrag.refresh();
    return;
  }
  const setShelf = (z) => {
    job.setParams(cab.id, { ...p, shelfCenter: z });
    log("bedside.shelf", { id: cab.id, side, from: p.shelfCenter, to: z });
  };
  const setZone = (index, choice) => {
    const zones = (p.zones || []).map((z) => ({ ...z }));
    zones[index] = { ...zones[index], type: bedSideType(side, choice) };
    job.setParams(cab.id, { ...p, zones });
    log("bedside.zone", { id: cab.id, side, index, type: zones[index].type });
  };
  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => { front.innerHTML = mod.frontView(job.resultFor(cab.id)) || ""; };
  drawFront();
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    if (!g || !front.querySelector("svg") || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const before = job.snapshot();
    const from = p.shelfCenter;
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    bedSideDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const svg = front.querySelector("svg");
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const k = Number(svg.getAttribute("width")) / rect.width;
      const scale = Number(svg.dataset.scale);
      const oy = Number(svg.dataset.oy);
      const H = Number(svg.dataset.h);
      const z = H - ((ev.clientY - rect.top) * k - oy) / scale;
      const step = ev.shiftKey ? 1 : 10;
      job.setParams(cab.id, mod.setDivider(p, result, 0, Math.round(z / step) * step), { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      bedSideDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("bedside.shelf", { id: cab.id, side, from, to: now ? now.params.shelfCenter : null, changed, where: "front view" });
      repaint();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });
  const zoneSelect = (index, label) => {
    const type = (p.zones && p.zones[index] && p.zones[index].type) || "drawer";
    const choice = bedSideChoice(side, type);
    return el("label", { class: "field" }, [
      el("span", { text: label }),
      el("select", { onchange: (e) => { e.target.blur(); setZone(index, e.target.value); } }, [
        el("option", { value: "drawer", text: "Drawer", selected: choice === "drawer" }),
        el("option", { value: "wall", text: "Door · hinge at the wall", selected: choice === "wall" }),
        el("option", { value: "bed", text: "Door · hinge at the bed", selected: choice === "bed" }),
      ]),
    ]);
  };
  panel.replaceChildren(
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `Bed side · ${side}` }),
      el("div", { class: "panel-sub", text: `${cab.id} · the other table mirrors this · ${result?.boards?.length || 0} boards` }),
    ]),
    shared.board,
    section("Front view", [
      front,
      el("div", { class: "zs-hint", text: "Drag the orange line to move the middle shelf · Shift = 1 mm" }),
    ]),
    section("Layout", [
      numField("Width (mm)", env.W, () => {}, { readOnly: "The body's wardrobe width: the door-stock side panel stands under the colour panel." }),
      ...outerSizeFields(cab, mod, env, p, {
        logKind: "bedside.size",
        show: { W: false },
        labels: { D: "Into the room (mm)", H: "Top (mm)" },
      }),
      numField("Middle shelf centre (mm)", p.shelfCenter, setShelf, { step: 10, min: lim ? lim.min : 0, max: lim ? lim.max : env.H }),
      zoneSelect(0, "Lower"),
      zoneSelect(1, "Upper"),
      el("div", { class: "empty small", text: "No back. Each shelf's tongues go through the carcass sides over the middle third of the depth. The bed-side panel is door stock, under the colour panel; the fronts cover it. Removing one table removes both." }),
    ]),
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  );
}

/** Checks + Boards tabs of the bottom drawer for a generated cabinet. */
