// Right panel: shows the space when nothing is selected, otherwise the
// selected cabinet's params. Every edit writes into job.js and regenerates.
// Per-module editors live in ./panel/ — this file is the dispatcher shell.
import * as job from "./job.js";
import { invoke } from "./commands.js";
import { getModule, fitZones, MIN_ZONE_HEIGHT } from "./modules.js";
import { thickness } from "./materials.js";
import { el, numField, dragField, section, kv, boardSection, grainSection, grainIssueLines, doorLine, fillDrawer, panel, wirePanelRepaint, outerSizeFields } from "./panel/widgets.js";
import { renderSpace, spaceFitIssues } from "./panel/space.js";
import { renderOverhead, renderUShape } from "./panel/overhead.js";
import { renderTall } from "./panel/tall.js";
import { renderTallFridge } from "./panel/tallFridge.js";
import { renderKitchen } from "./panel/kitchen.js";
import { renderLounge } from "./panel/lounge.js";
import { renderBedroom } from "./panel/bedroom.js";
import { renderBedroomEast } from "./panel/bedroomEast.js";
import { renderBunk } from "./panel/bunk.js";
import { renderSmall } from "./panel/small.js";
import { renderSketchPanel } from "./panel/sketch.js";
import { renderDrawing } from "./panel/drawing.js";
import { renderBedSide } from "./panel/bedside.js";
import { renderPlane } from "./panel/plane.js";
import { renderWall } from "./panel/wall.js";

export { spaceFitIssues };

function renderCabinet(cab) {
  const mod = getModule(cab.moduleId);
  if (mod.panel === "sketch") {
    renderSketchPanel(cab);
    return;
  }
  const result = job.resultFor(cab.id);
  const env = mod.envelope(cab.params);
  const p = cab.params;
  const cpt = p.panelThickness ?? thickness(job.getStock(), "carcass");
  const interior = Math.round((env.H - 2 * cpt) * 10) / 10;

  const setEnv = (k) => (v) => invoke("cabinet.set-params", { id: cab.id, params: mod.setEnvelope(p, { [k]: Math.max(mod.minSize[k], v) }) , replace: true });
  const setParam = (k, min = 0) => (v) => invoke("cabinet.set-params", { id: cab.id, params: { ...p, [k]: Math.max(min, v) } , replace: true });
  const setPose = (k) => (v) => invoke("cabinet.move", { id: cab.id, ...{ [k]: v } });

  const errors = [...(result?.validation?.errors || []), ...grainIssueLines(result)];
  const warnings = result?.validation?.warnings || [];
  const grain = grainSection(cab, mod, result);

  const checks = errors.length || warnings.length
    ? el("div", { class: "panel-section" }, [
        el("div", { class: "sec-title", text: "Checks" }),
        ...errors.map((m) => el("div", { class: "msg err", text: m })),
        ...warnings.map((m) => el("div", { class: "msg warn", text: m })),
      ])
    : null;
  const remove = el("button", { class: "tb danger", text: "Remove cabinet", onclick: () => invoke("cabinet.remove", { id: cab.id }) });

  // Nose slab (Bedroom): width and height come from the vehicle, only the depth is free;
  // the depth keeps the nose end fixed and moves the room-side face (like its D handle).
  const setNoseDepth = (v) => {
    const D = Math.max(mod.minSize.D, v);
    const shift = env.D - D;
    const a = ((cab.pose.rotZ || 0) * Math.PI) / 180;
    const before = job.snapshot();
    job.updateCabinet(cab.id, (c) => {
      c.params = mod.setEnvelope(c.params, { D });
      c.pose = { ...c.pose, x: c.pose.x - Math.sin(a) * shift, y: c.pose.y + Math.cos(a) * shift };
    });
    job.commitSnapshot(before);
  };
  if (mod.panel === "bedroom") {
    renderBedroom(cab, mod, result, { checks, remove, setNoseDepth, board: boardSection(), grain });
    fillDrawer(result, errors, warnings);
    return;
  }

  const board = boardSection();

  if (mod.panel === "drawing") {
    renderDrawing(cab, mod, result, { checks, remove, board });
    fillDrawer(result, errors, warnings);
    return;
  }

  if (mod.panel === "bedSide") {
    renderBedSide(cab, mod, result, { checks, remove, board, setEnv });
    fillDrawer(result, errors, warnings);
    return;
  }

  // Bed box: stands in the body's mattress opening — W (bed frame) and H (boot) from the body, only the length is free.
  const bedChildren = [
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: mod.label }),
      el("div", { class: "panel-sub", text: `${cab.id} · on the body's room face · centred · ${result?.boards?.length || 0} boards` }),
    ]),
    board,
    section("Size", [
      numField("Width (mm)", env.W, () => {}, { readOnly: "From the Bedroom body: the bed frame's width (queen 1508). Change the body's bed frame." }),
      dragField("Length from body (mm)", env.D, setEnv("D"), cab.id, "D", "Show an arrow at the room end of the box; drag it to change the length"),
      numField("Height (mm)", env.H, () => {}, { readOnly: "From the Bedroom body: its tunnel boot height." }),
    ]),
    section("Boards", [
      el("div", { class: "empty small", text: "Two side panels, an end panel (1 mm wider each side for edge banding), a centre divider notched at both ends, four long rails against the sides and four short rails across the box (one on the floor, one flush with the top; the short rails notched 20 × 20 for the divider — a half-lap). No bottom, no top, no board on the body face: the boot's upright is there. Everything is the bed box stock (18)." }),
      kv("Stock", `${p.panelThickness ?? 18} mm · ${p.carcassColorName || p.carcassColor || "White Stipple"}`),
    ]),
    el("div", { class: "panel-section" }, [
      el("div", { class: "empty small", text: "Follows the Bedroom body: centred on the van, against the body's room-side face, as wide as the bed frame and as high as the boot." }),
    ]),
    checks,
    el("div", { class: "panel-foot" }, [remove]),
  ];
  if (mod.panel === "uShape") {
    renderUShape(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "ohc") {
    renderOverhead(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "tall") {
    renderTall(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "tallFridge") {
    renderTallFridge(cab, mod, result, { remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "kitchen") {
    renderKitchen(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "lounge") {
    renderLounge(cab, mod, result, { checks, remove, board });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "small") {
    renderSmall(cab, mod, result, { checks, remove, board, grain });
    fillDrawer(result, errors, warnings);
    return;
  }
  if (mod.panel === "bedroomEast") { renderBedroomEast(cab, mod, result, { checks, remove, p, env, board }); fillDrawer(result, errors, warnings); return; }
  if (mod.panel === "bunk") { renderBunk(cab, mod, result, { checks, remove, p, env, board }); fillDrawer(result, errors, warnings); return; }

  // Generic fallback page: the only consumer of the zone editor. Built here, not
  // up top — a module may store `params.zones` as a non-array (uShape keeps it
  // per-run: {LEFT, BACK, RIGHT}) and zones.map there crashed every selection.
  const zones = Array.isArray(p.zones) ? p.zones : [];
  const zoneRows = zones.map((z, i) => {
    const type = el("select", {
      onchange: (e) => {
        const next = zones.map((zz) => ({ ...zz }));
        next[i].type = e.target.value;
        e.target.blur();
        invoke("cabinet.set-params", { id: cab.id, params: { ...p, zones: next } , replace: true });
      },
    }, (mod.zoneTypes || []).map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.type })));
    const height = el("input", { type: "number", value: z.height, step: 1, min: 0 });
    height.addEventListener("change", () => {
      const v = Number(height.value);
      if (!Number.isFinite(v) || v <= 0) { height.value = z.height; return; }
      // Changing one zone: the neighbour below (or above for the last) absorbs the difference.
      const next = zones.map((zz) => ({ ...zz }));
      const j = i < next.length - 1 ? i + 1 : i - 1;
      const delta = v - next[i].height;
      if (j >= 0 && next[j].height - delta >= 60) {
        next[i].height = v;
        next[j].height = Math.round((next[j].height - delta) * 10) / 10;
        invoke("cabinet.set-params", { id: cab.id, params: { ...p, zones: next } , replace: true });
      } else {
        height.value = z.height;
      }
    });
    const remove = el("button", { class: "icon", title: "Remove zone", text: "×", disabled: zones.length <= 1,
      onclick: () => {
        const next = zones.filter((_, k) => k !== i);
        invoke("cabinet.set-params", { id: cab.id, params: { ...p, zones: fitZones(next, interior) } , replace: true });
      } });
    return el("div", { class: "zone-row" }, [el("span", { class: "zone-idx", text: String(i + 1) }), type, height, remove]);
  });

  const addZone = el("button", { class: "tb wide", text: "+ Add zone", onclick: () => {
    // New zone takes up to 150 mm from the tallest existing zone.
    const next = zones.map((zz) => ({ ...zz }));
    const tallest = next.reduce((a, b) => (b.height > a.height ? b : a), next[0]);
    const take = Math.min(150, tallest.height - MIN_ZONE_HEIGHT);
    const zone = { id: `zone-${Date.now().toString(36)}`, type: "drawer", height: take };
    if (take >= MIN_ZONE_HEIGHT) {
      tallest.height = Math.round((tallest.height - take) * 10) / 10;
      next.push(zone);
      invoke("cabinet.set-params", { id: cab.id, params: { ...p, zones: next } , replace: true });
    } else {
      next.push({ ...zone, height: MIN_ZONE_HEIGHT });
      invoke("cabinet.set-params", { id: cab.id, params: { ...p, zones: fitZones(next, interior) } , replace: true });
    }
  } });

  const boxChildren = [
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${result?.boards?.length || 0} boards` }),
    ]),
    board,
    section("Outer size (= box)", outerSizeFields(cab, mod, env, p, { logKind: "cabinet.size" })),
    cab.moduleId === "smallCabinet" ? section("Sides", [
      el("label", { class: "field check", title: "Door panel: colour face outward, half groove. Off: carcass side, groove through." }, [
        el("input", { type: "checkbox", checked: !!p.leftSideDoorColor, onchange: (e) => invoke("cabinet.set-params", { id: cab.id, params: { ...p, leftSideDoorColor: e.target.checked } , replace: true }) }),
        el("span", { text: "Left side is a door panel" }),
      ]),
      el("label", { class: "field check", title: "Door panel: colour face outward, half groove. Off: carcass side, groove through." }, [
        el("input", { type: "checkbox", checked: !!p.rightSideDoorColor, onchange: (e) => invoke("cabinet.set-params", { id: cab.id, params: { ...p, rightSideDoorColor: e.target.checked } , replace: true }) }),
        el("span", { text: "Right side is a door panel" }),
      ]),
    ]) : null,
    section(`Zones · top → bottom · interior ${interior} mm`, [
      el("div", { class: "zone-list" }, zoneRows),
      addZone,
    ]),
    section("Position", [
      numField("X (mm)", cab.pose.x, setPose("x"), { min: -1e6 }),
      numField("Y (mm)", cab.pose.y, setPose("y"), { min: -1e6 }),
      numField("Rotation (°)", cab.pose.rotZ || 0, (v) => invoke("cabinet.move", { id: cab.id, ...{ rotZ: ((Math.round(v / 90) * 90) % 360 + 360) % 360 } }), { step: 90, min: -1e6 }),
    ]),
    section("Material", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: p.carcassColorName || p.carcassColor || "White Stipple" })]),
      doorLine(p),
      numField("Carcass thickness", cpt, setParam("panelThickness", 1), { step: 0.5 }),
      numField("Front thickness", p.frontPanelThickness ?? thickness(job.getStock(), "door"), setParam("frontPanelThickness", 1), { step: 0.5 }),
      numField("Front clearance", p.frontClearance ?? 2.5, setParam("frontClearance", 0), { step: 0.5 }),
    ]),
    checks,
    el("div", { class: "panel-foot" }, [remove]),
  ];
  panel.replaceChildren(...(mod.placement === "bedBox" ? bedChildren : boxChildren).filter(Boolean));
  fillDrawer(result, errors, warnings);
}


function panelPage() {
  const sel = job.getSelected();
  if (sel) return `cab:${sel.id}`;
  const pl = job.getSelectedPlane();
  if (pl) return `plane:${pl.id}`;
  const wall = job.getSelectedWall();
  if (wall) return `wall:${wall.id}`;
  return "space";
}

let shownPage = null;
let panelToken = 0;
let panelLeaving = false;

function paintPanel() {
  const sel = job.getSelected();
  // The wide editor page only while an OHC or the Bedroom body is selected; everything else uses the narrow panel.
  const page = sel ? getModule(sel.moduleId).panel : "";
  const wide = ["ohc", "bedroom", "bedroomEast", "bedSide", "tall", "tallFridge", "kitchen", "lounge"].includes(page);
  panel.classList.toggle("wide", wide);
  panel.classList.toggle("kitchen", page === "kitchen");
  panel.classList.toggle("ohc", page === "ohc");
  panel.classList.toggle("fridge", page === "tallFridge");
  panel.classList.toggle("lounge", page === "lounge");
  if (sel) renderCabinet(sel);
  else {
    const pl = job.getSelectedPlane();
    const wall = job.getSelectedWall();
    if (pl) renderPlane(pl);
    else if (wall) renderWall(wall);
    else renderSpace();
  }
}

function slideIn() {
  panel.classList.remove("panel-in");
  void panel.offsetWidth;
  panel.classList.add("panel-in");
}

/**
 * A different page slides out to the right, then the next one slides in.
 * Rewriting the same page (a parameter edit) does not animate.
 */
export function renderPanel() {
  const key = panelPage();
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  // A job edit while the page is leaving waits: the arrival paints whatever is selected then.
  if (panelLeaving) return;
  if (key === shownPage || shownPage === null || reduce) {
    shownPage = key;
    paintPanel();
    return;
  }
  const token = ++panelToken;
  panelLeaving = true;
  panel.classList.remove("panel-in");
  panel.classList.add("panel-out");
  let arrived = false;
  const arrive = () => {
    if (arrived || token !== panelToken) return;
    arrived = true;
    panelLeaving = false;
    panel.removeEventListener("animationend", onEnd);
    shownPage = panelPage();
    panel.classList.remove("panel-out");
    paintPanel();
    slideIn();
  };
  const onEnd = (e) => { if (e.target === panel && e.animationName === "panel-out") arrive(); };
  panel.addEventListener("animationend", onEnd);
  setTimeout(arrive, 400);
}

wirePanelRepaint(renderPanel);
