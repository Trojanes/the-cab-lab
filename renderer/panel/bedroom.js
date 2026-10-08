// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { BEDROOM_LAYOUT_LABEL, BEDROOM_WARDROBE_STYLE } from "../modules.js";
import { thickness } from "../materials.js";
import { el, numField, section, frontSection, kv, panel, repaint, gapMode } from "./widgets.js";
// --- bedroom body editor ------------------------------------------------------------
//
// Wide page while the Bedroom body is selected: the generator's 2D front
// elevation (click a region to select it, drag a boundary to move it — boot
// deck, wardrobe inner faces, overhead underside; 10 mm
// steps, Shift = 1 mm), the four layout numbers as fields, a card for the
// selected region, and the body-level fields folded below. Width, depth and
// roof are not edited here: they come from the vehicle and the placement.
// Every edit is one undo step; a boundary drag commits once on release.

let bedroomDrag = null; // { cabId, refresh } while a front-view boundary is dragged

export function renderBedroom(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const valid = !!result && !result.validation.errors.length;
  const rp = valid ? result.params : p;
  const info = valid ? result.layout : null;
  const selectedRegion = job.getSelectedRegion();
  const labelOf = (key) => BEDROOM_LAYOUT_LABEL[key] || key;

  const setLayout = (key, value, how, extra = {}) => {
    const next = mod.setLayout(p, key, value);
    const to = next[key];
    const clamped = Math.round(value) !== Math.round(to) ? mod.layoutLimits(p, key) : null;
    if (next === p) { log("bedroom.layout.set", { id: cab.id, key, from: p[key], to, how, clamped, changed: false, ...extra }); return; }
    job.setParams(cab.id, next);
    log("bedroom.layout.set", { id: cab.id, key, from: p[key], to, how, clamped, changed: true, ...extra });
  };

  // A drag in progress: redraw the SVG in place and keep the container (and its pointer capture) alive.
  if (bedroomDrag && bedroomDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    bedroomDrag.refresh();
    return;
  }

  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    const res = job.resultFor(cab.id);
    front.innerHTML = mod.frontView(res, { selectedRegion: job.getSelectedRegion(), gaps: gapMode }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  };
  drawFront();

  // Region selection: one click on a region. Boundary drag: pointer down on a boundary group.
  front.addEventListener("click", (e) => {
    if (bedroomDrag) return;
    const region = e.target.closest?.("[data-region]");
    if (!region) return;
    const id = region.getAttribute("data-region");
    job.select(cab.id, job.getSelectedRegion() === id ? null : { regionId: id });
  });
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    const svg = front.querySelector("svg");
    if (!g || !svg || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const key = g.getAttribute("data-boundary");
    const axis = g.getAttribute("data-axis");
    const side = Number(g.getAttribute("data-side") || 0);
    const zoneIndex = Number(g.getAttribute("data-index") || 0);
    const params0 = cab.params;
    const from = key === "ohcZone" ? params0.ohcZones : params0[key];
    const before = job.snapshot();
    // mm ↔ px: the SVG carries its own mapping; the container may be scaled to the panel width.
    const toMm = (clientX, clientY) => {
      const s = front.querySelector("svg");
      const rect = s.getBoundingClientRect();
      const k = Number(s.getAttribute("width")) / rect.width;
      const scale = Number(s.dataset.scale);
      const ox = Number(s.dataset.ox);
      const oy = Number(s.dataset.oy);
      const H = Number(s.dataset.h);
      return axis === "x" ? ((clientX - rect.left) * k - ox) / scale : H - ((clientY - rect.top) * k - oy) / scale;
    };
    const W = params0.width;
    const valueAt = (mm) => (key === "wardrobeWidth" ? (side > 0 ? W - mm : mm) : mm);
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    front.classList.add("dragging");
    g.classList.add("active");
    bedroomDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(valueAt(toMm(ev.clientX, ev.clientY)) / step) * step;
      const next = key === "ohcZone" ? mod.setOhcBoundary(params0, zoneIndex, v) : mod.setLayout(params0, key, v);
      job.setParams(cab.id, next, { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      front.classList.remove("dragging");
      bedroomDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      log("bedroom.layout.drag", { id: cab.id, key, side: side || undefined, from, to: now ? (key === "ohcZone" ? now.params.ohcZones : now.params[key]) : null, changed, where: "front view" });
      repaint();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  // Layout fields: the four numbers, each with the range the other three leave it.
  const layoutField = (key, label, hint) => {
    const lim = mod.layoutLimits(p, key);
    const field = numField(`${label} (mm)`, p[key] ?? rp[key], (v) => setLayout(key, v, "type"), { step: 10, min: 0 });
    field.title = `${lim.min} … ${lim.max} mm${hint ? ` · ${hint}` : ""}`;
    return field;
  };
  const layoutSection = section("Layout · symmetric left / right", [
    layoutField("bootHeight", "Tunnel boot height", "top of the boot deck"),
    layoutField("wardrobeWidth", "Wardrobe width, each side", "side wall → inner face"),
    layoutField("ohcBottom", "Overhead door bottom", "up-flap underside; the bottom panel is 30 above"),
    el("label", { class: "field" }, [
      el("span", { text: "Overhead bays" }),
      el("select", { title: "Up flaps only. Two is the Style 3 split; three uses the 100 mm hinge inset.", onchange: (e) => {
        const n = Number(e.target.value);
        e.target.blur();
        const before = info && info.ohc ? info.ohc.zones.length : 2;
        job.setParams(cab.id, mod.setOhcCount(p, n));
        log("bedroom.layout.set", { id: cab.id, key: "ohcZones", from: before, to: n, how: "select", changed: n !== before });
      } }, [
        el("option", { value: "2", text: "2 · up flaps", selected: (info && info.ohc ? info.ohc.zones.length : 2) === 2 }),
        el("option", { value: "3", text: "3 · up flaps", selected: (info && info.ohc ? info.ohc.zones.length : 2) === 3 }),
      ]),
    ]),
    el("label", { class: "field" }, [
      el("span", { text: "Bed frame" }),
      el("select", { title: "A product size: the opening must take it and the bed box is exactly this wide", onchange: (e) => { const v = e.target.value; e.target.blur(); job.setParams(cab.id, { ...p, bedFrame: v }); log("bedroom.layout.set", { id: cab.id, key: "bedFrame", from: p.bedFrame, to: v, how: "select", changed: v !== p.bedFrame }); } },
        [el("option", { value: "queen", text: `Queen · ${info ? Math.round(info.bedFrameWidth) : 1508} wide`, selected: true })]),
    ]),
    el("label", { class: "field" }, [
      el("span", { text: "Wardrobe style" }),
      el("select", { title: "Style 1: door over a fixed panel, the split is draggable. Nook: door over an open nook with a shelf, the shelf underside is draggable.", onchange: (e) => { const v = e.target.value; e.target.blur(); job.setParams(cab.id, { ...p, style: v }); log("bedroom.layout.set", { id: cab.id, key: "style", from: p.style || "style1", to: v, how: "select", changed: v !== (p.style || "style1") }); } },
        Object.entries(BEDROOM_WARDROBE_STYLE).map(([id, s]) => el("option", { value: id, text: s.label, selected: (p.style || "style1") === id }))),
    ]),
    (p.style || "style1") === "nook"
      ? (info && info.front ? kv("Wardrobe bottom", `${Math.round(info.front.nookShelfBottom)} · boot + 401, not dragged`) : null)
      : layoutField("fixedPanelTop", "Fixed panel top", "split: door starts this + 4 mm"),
    el("label", { class: "field check" }, [
      el("span", { text: "LED channels" }),
      el("input", { type: "checkbox", checked: p.ledGroove !== false, title: "14.5 × 6.5 channel along the front of every T3 top (0.5 in front of T1) with a 20 mm feed branch near each end; in the nook style also one under each nook shelf.", onchange: (e) => {
        const on = !!e.target.checked;
        job.setParams(cab.id, { ...p, ledGroove: on });
        log("bedroom.layout.set", { id: cab.id, key: "ledGroove", from: p.ledGroove !== false, to: on, how: "toggle", changed: on !== (p.ledGroove !== false) });
      } }),
    ]),
    info ? kv("Mattress opening", `${Math.round(info.openingWidth)} wide × ${Math.round(info.openingHeight)} high · ${Math.round(info.bedMargin)} beside the bed each side`) : null,
    info ? kv("Overhead at the room face", `${Math.round(info.ohcHeight)} high`) : null,
    info && info.ohc ? kv("Overhead bays", `${info.ohc.zones.map((z) => Math.round(z.width * 10) / 10).join(" + ")} · bottom panel to ${Math.round(info.ohc.bpBack)}`) : null,
    info ? kv("Bed box", `${Math.round(mod.bedBoxSize(rp).W)} wide × ${Math.round(mod.bedBoxSize(rp).H)} high · from the bed frame and the boot`) : null,
    info && info.top ? kv("Wardrobe top", `T3 seat ${Math.round(info.top.seat)} · roof ${Math.round(info.top.roofAtT2)} at the T2 back · T2 ${Math.round(info.top.t2Height)} high`) : null,
    info && info.front ? kv("Wardrobe fronts", info.front.style === "nook"
      ? `door ${Math.round(info.front.doorBottom)}–${Math.round(info.front.doorTop)} · nook open ${Math.round(info.front.floorTop)}–${Math.round(info.front.nookShelfBottom)} · wall gap ${info.front.clearance}`
      : `door ${Math.round(info.front.doorBottom)}–${Math.round(info.front.doorTop)} · fixed panel ${Math.round(info.front.floorTop)}–${Math.round(info.front.fixedPanelTop)} · clearance ${info.front.clearance}`) : null,
    el("div", { class: "empty small", text: `Drag a boundary in the front view (10 mm, Shift = 1 mm) or type here. ${(p.style || "style1") === "nook" ? "Nook: the wardrobe bottom is boot + 401 and does not drag; the door starts there." : "The orange line on each wardrobe is the fixed-panel top — the door starts 4 mm above it."} The wardrobes stop where the opening equals the bed frame. Width, depth and roof come from the vehicle.` }),
  ].filter(Boolean));

  // Selected region card.
  let regionCard = null;
  const zone = valid ? result.zones.find((z) => z.id === selectedRegion) : null;
  if (zone) {
    const drives = zone.id === "boot" ? ["bootHeight"] : zone.id === "ohc" ? ["ohcBottom"] : zone.id === "opening" ? ["bootHeight", "ohcBottom", "wardrobeWidth"] : ["wardrobeWidth"];
    regionCard = section(`${zone.label} · ${zone.kind === "void" ? "opening" : "block"}`, [
      kv("Across (X)", `${Math.round(zone.x0)} – ${Math.round(zone.x1)} · ${Math.round(zone.x1 - zone.x0)} wide`),
      kv("Height (Z)", `${Math.round(zone.z0)} – ${Math.round(zone.z1)}${zone.roofTop ? " at the room face, cut to the roof" : ""}`),
      kv("Depth (Y)", `${Math.round(zone.y1)}${zone.y1 < rp.depth - 0.5 ? ` of ${Math.round(rp.depth)} — the roof cuts it off` : ""}`),
      kv("Set by", drives.map(labelOf).join(", ")),
      zone.boards && zone.boards.length
        ? el("div", { class: "kv" }, [el("span", { text: `Boards (${zone.boards.length})` }), el("b", {}, zone.boards.map((id) =>
            el("a", { class: "link", text: `${id} `, title: "Select this board", onclick: () => job.select(cab.id, { boardId: id }) })))])
        : null,
      el("div", { class: "empty small", text: zone.kind === "void"
        ? "Not a part: what the boot deck, the wardrobe inner faces and the overhead underside leave free. The bed frame stands here and the bed box continues it into the room."
        : zone.id === "boot"
          ? "Made of boards: the deck on top, an upright on the room face and one at the nose, all wall to wall. Click a board id or a board in 3D to read it."
          : zone.id === "ohc"
            ? "Its own bottom panel, side panels and dividers, a T3 notched for those uprights, and up-flap doors. T1 and T2 are the shared rails. No rear T4. The bottom panel is cut long — trim it to the roof."
          : zone.boards && zone.boards.length
            ? ((p.style || "style1") === "nook"
              ? "Wall strip, colour panel, kick and floor, the nook shelf (LED channel underneath) and the door from the shelf underside to T3. The nook under the shelf stays open to the room. T1 / T2 run wall to wall on the T3s."
              : "Wall strip, colour panel, the shelf 10 above the wardrobe floor, T3, the door (hangs in front of the room face) and the fixed panel under it. T1 / T2 run wall to wall on the T3s.")
            : "One block for now — its boards come in a later version, each bounded by this region's faces." }),
    ].filter(Boolean));
  }

  // Body-level fields, folded: depth from the placement, width / roof from the vehicle.
  const fromSpace = "Set by the vehicle: redefine the space to change it";
  const nBoards = result?.boards?.length || 0;
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Body · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${valid ? result.zones.length : 0} regions · ${nBoards} boards` }),
    section("Envelope (= nose body)", [
      numField("Width (mm)", env.W, () => {}, { readOnly: fromSpace }),
      numField("From front (mm)", env.D, shared.setNoseDepth),
      numField("Height at room face (mm)", env.H, () => {}, { readOnly: fromSpace }),
      info ? kv("Roof at the nose", `${Math.round(info.roofMin)} mm`) : null,
    ].filter(Boolean)),
    section("Material (job stock)", [
      kv("Carcass", `${p.carcassColorName || p.carcassColor || "White Stipple"} · ${p.panelThickness ?? thickness(job.getStock(), "carcass")} mm`),
      el("div", { class: "empty small", text: "The boot uprights are carcass stock; the boot deck thickness is a bedroom rule (rules.json). Wardrobes and overhead are still drawn as solids." }),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} body` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} mm · boot ${Math.round(p.bootHeight)} · wardrobes ${Math.round(p.wardrobeWidth)} · overhead from ${Math.round(p.ohcBottom)} · ${nBoards} boards` }),
    ]),
    shared.board,
    frontSection("Front view · from the room", [
      front,
      el("div", { class: "zs-hint", text: "Click a region to select it · drag an orange boundary · Shift = 1 mm" }),
    ]),
    layoutSection,
    regionCard,
    fold,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
