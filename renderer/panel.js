// Right panel: shows the space when nothing is selected, otherwise the
// selected cabinet's params. Every edit writes into job.js and regenerates.
import * as job from "./job.js";
import { getModule, fitZones, MIN_ZONE_HEIGHT, MIN_ZONE_WIDTH, fitZoneWidths } from "./modules.js";
import { getSpaceKind } from "./spaces.js";
import { openSpaceDialog } from "./spaceDialog.js";
import { poseFits } from "./cabinets3d.js";
import { describeMaterials, thickness } from "./materials.js";
import { sideOfRotZ, sideLabel } from "./interact.js";
import { log } from "./log.js";

const panel = document.getElementById("rightpanel");
const app = document.getElementById("app");
const drawerChecks = document.querySelector('[data-dpane="checks"]');
const drawerBoards = document.querySelector('[data-dpane="boards"]');

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "style") e.style.cssText = v; // CSSOM: allowed by the CSP, unlike a style attribute
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === false || v == null) continue;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

function numField(label, value, onCommit, opts = {}) {
  const input = el("input", { type: "number", value, step: opts.step ?? 10, min: opts.min ?? 0 });
  if (opts.readOnly) {
    input.readOnly = true;
    input.title = opts.readOnly;
    return el("label", { class: "field readonly" }, [el("span", { text: label }), input]);
  }
  const commit = () => {
    const v = Number(input.value);
    if (!Number.isFinite(v)) { input.value = value; return; }
    if (v === Number(value)) return;
    onCommit(v);
  };
  input.addEventListener("change", commit);
  input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
  return el("label", { class: "field" }, [el("span", { text: label }), input]);
}

function section(title, children) {
  return el("div", { class: "panel-section" }, [el("div", { class: "sec-title", text: title }), ...children]);
}

// --- space ---------------------------------------------------------------------

/** Cabinets that no longer fit the space (after a space edit, for instance). */
export function spaceFitIssues() {
  const issues = [];
  if (!job.hasSpace()) return issues;
  for (const cab of job.getJob().cabinets) {
    if (!poseFits(cab, cab.pose)) issues.push(`${cab.id} is outside the space or overlaps an obstacle.`);
  }
  return issues;
}

function renderSpace() {
  const space = job.getJob().space;
  const resolved = job.getSpace();
  const count = job.getJob().cabinets.length;

  if (!space) {
    panel.replaceChildren(
      el("div", { class: "panel-head" }, [
        el("div", { class: "panel-title", text: "Space" }),
        el("div", { class: "panel-sub", text: "not defined" }),
      ]),
      section("Step 1", [
        el("div", { class: "empty small", text: "Define the space first: a box room, or a vehicle (box rear + side-profile nose); imported floor plans later." }),
        el("button", { class: "tb primary wide-solid", text: "Define the space", onclick: () => openSpaceDialog() }),
      ]),
    );
    drawerChecks.replaceChildren(el("div", { class: "empty", text: "No space defined." }));
    drawerBoards.replaceChildren(el("div", { class: "empty", text: "No space defined." }));
    return;
  }

  const kind = getSpaceKind(space.kind);
  const issues = spaceFitIssues();
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Space" }),
      el("div", { class: "panel-sub", text: `${kind.label} · ${resolved.summary} · ${count} cabinet(s)` }),
    ]),
    section(kind.label, [
      ...(kind.describe
        ? kind.describe(space.params)
        : kind.fields.filter((f) => !f.type || f.type === "number").map((f) => [f.label, String(space.params[f.key])])
      ).map(([label, value]) => el("div", { class: "kv" }, [el("span", { text: label }), el("b", { text: value })])),
      el("button", { class: "tb wide", text: "Edit space…", onclick: () => openSpaceDialog() }),
    ]),
    section("Cabinets", [
      ...describeMaterials(job.getFinish(), job.getStock()).map(([label, value]) =>
        el("div", { class: "kv" }, [el("span", { text: label }), el("b", { text: value })])),
    ]),
    issues.length
      ? el("div", { class: "panel-section" }, [
          el("div", { class: "sec-title", text: "Checks" }),
          ...issues.map((m) => el("div", { class: "msg err", text: m })),
        ])
      : null,
    el("div", { class: "panel-section muted" }, [
      el("div", { class: "sec-title", text: "Next" }),
      el("div", { class: "empty small", text: "Pick a module on the left, click a corner of the space (or of another cabinet) to start its box, size it with the mouse or Tab-typed numbers, click again to create. Pull the blue faces to change W / D / H, drag the orange bars to move zone boundaries." }),
    ]),
  ].filter(Boolean));
  drawerChecks.replaceChildren(
    issues.length
      ? el("div", {}, issues.map((m) => el("div", { class: "msg err", text: m })))
      : el("div", { class: "empty", text: count ? "All cabinets fit the space. Select one to see its checks." : "Select a cabinet to see its checks." }),
  );
  drawerBoards.replaceChildren(el("div", { class: "empty", text: "Select a cabinet to list its boards." }));
}

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
function ohcSelect(cabId, indices) {
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
      renderPanel();
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
        renderPanel();
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

function renderOverhead(cab, mod, result, shared) {
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
    if (view) view.innerHTML = mod.frontView(result, { selectedZoneIndex: selected[0] ?? -1 }) || "";
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
  front.innerHTML = mod.frontView(result, { selectedZoneIndex: selected[0] ?? -1 }) || "";
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
      setZones(next, "type", { zone: i, type: e.target.value });
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
      el("div", { class: "kv" }, [el("span", { text: "Door" }), el("b", { text: `${p.doorColorName || p.doorColor || "—"} · ${fpt} mm` })]),
      el("div", { class: "empty small", text: "Every board except the doors is carcass stock; the doors are door stock. Thicknesses come from the space's catalogue." }),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · doors ${sideLabel(sideOfRotZ(cab.pose.rotZ))} · ${Math.round(env.W)} × ${Math.round(env.D + fpt)} × ${Math.round(env.H)} mm · top on the ceiling` }),
    ]),
    section(`Zones · left → right · ${zones.length} · ${Math.round(total)} mm`, [
      el("div", { class: "zs-tools" }, [addZone, delZone, avgZone, el("span", { class: "zs-hint", text: "Drag a boundary · click a zone · Ctrl+click adds to the selection" })]),
      strip,
      widthRow,
      cumRow,
    ]),
    zoneCard,
    section("Front view", [front]),
    fold,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}

// --- cabinet ---------------------------------------------------------------------

function renderCabinet(cab) {
  const mod = getModule(cab.moduleId);
  const result = job.resultFor(cab.id);
  const env = mod.envelope(cab.params);
  const p = cab.params;
  const cpt = p.panelThickness ?? thickness(job.getStock(), "carcass");
  const interior = Math.round((env.H - 2 * cpt) * 10) / 10;

  const setEnv = (k) => (v) => job.setParams(cab.id, mod.setEnvelope(p, { [k]: Math.max(mod.minSize[k], v) }));
  const setParam = (k, min = 0) => (v) => job.setParams(cab.id, { ...p, [k]: Math.max(min, v) });
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });

  const zones = p.zones || [];
  const zoneRows = zones.map((z, i) => {
    const type = el("select", {
      onchange: (e) => {
        const next = zones.map((zz) => ({ ...zz }));
        next[i].type = e.target.value;
        e.target.blur();
        job.setParams(cab.id, { ...p, zones: next });
      },
    }, mod.zoneTypes.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.type })));
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
        job.setParams(cab.id, { ...p, zones: next });
      } else {
        height.value = z.height;
      }
    });
    const remove = el("button", { class: "icon", title: "Remove zone", text: "×", disabled: zones.length <= 1,
      onclick: () => {
        const next = zones.filter((_, k) => k !== i);
        job.setParams(cab.id, { ...p, zones: fitZones(next, interior) });
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
      job.setParams(cab.id, { ...p, zones: next });
    } else {
      next.push({ ...zone, height: MIN_ZONE_HEIGHT });
      job.setParams(cab.id, { ...p, zones: fitZones(next, interior) });
    }
  } });

  const errors = result?.validation?.errors || [];
  const warnings = result?.validation?.warnings || [];

  const checks = errors.length || warnings.length
    ? el("div", { class: "panel-section" }, [
        el("div", { class: "sec-title", text: "Checks" }),
        ...errors.map((m) => el("div", { class: "msg err", text: m })),
        ...warnings.map((m) => el("div", { class: "msg warn", text: m })),
      ])
    : null;
  const remove = el("button", { class: "tb danger", text: "Remove cabinet", onclick: () => job.removeCabinet(cab.id) });

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
  const fromSpace = "Set by the vehicle: redefine the space to change it";
  const noseChildren = [
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: mod.label }),
      el("div", { class: "panel-sub", text: `${cab.id} · nose slab · solid volume` }),
    ]),
    section("Outer size (= nose slab)", [
      numField("Width (mm)", env.W, () => {}, { readOnly: fromSpace }),
      numField("From front (mm)", env.D, setNoseDepth),
      numField("Height at room face (mm)", env.H, () => {}, { readOnly: fromSpace }),
    ]),
    el("div", { class: "panel-section" }, [
      el("div", { class: "empty small", text: "One solid volume for now — tunnel boot, robes and overhead are partitioned inside it in a later version." }),
    ]),
    checks,
    el("div", { class: "panel-foot" }, [remove]),
  ];

  // Bed box: glued to the body (centre line, body face); W / D free, height = tunnel boot.
  const bedChildren = [
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: mod.label }),
      el("div", { class: "panel-sub", text: `${cab.id} · on the body's room face · centred · solid volume` }),
    ]),
    section("Size", [
      numField("Width (mm)", env.W, setEnv("W")),
      numField("Length from body (mm)", env.D, setEnv("D")),
      numField("Height (mm)", env.H, () => {}, { readOnly: "Tunnel boot height — set together with the body's boot later" }),
    ]),
    el("div", { class: "panel-section" }, [
      el("div", { class: "empty small", text: "Follows the Bedroom body: always centred on the van and against the body's room-side face. One solid volume for now." }),
    ]),
    checks,
    el("div", { class: "panel-foot" }, [remove]),
  ];

  if (mod.panel === "ohc") {
    renderOverhead(cab, mod, result, { checks, remove });
    fillDrawer(result, errors, warnings);
    return;
  }

  const boxChildren = [
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${result?.boards?.length || 0} boards` }),
    ]),
    section("Outer size (= box)", [
      numField("Width (mm)", env.W, setEnv("W")),
      numField("Depth (mm)", env.D, setEnv("D")),
      numField("Height (mm)", env.H, setEnv("H")),
    ]),
    section(`Zones · top → bottom · interior ${interior} mm`, [
      el("div", { class: "zone-list" }, zoneRows),
      addZone,
    ]),
    section("Position", [
      numField("X (mm)", cab.pose.x, setPose("x"), { min: -1e6 }),
      numField("Y (mm)", cab.pose.y, setPose("y"), { min: -1e6 }),
      numField("Rotation (°)", cab.pose.rotZ || 0, (v) => job.setPose(cab.id, { rotZ: ((Math.round(v / 90) * 90) % 360 + 360) % 360 }), { step: 90, min: -1e6 }),
    ]),
    section("Material", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: p.carcassColorName || p.carcassColor || "White Stipple" })]),
      el("div", { class: "kv" }, [el("span", { text: "Door" }), el("b", { text: p.doorColorName || p.doorColor || "—" })]),
      numField("Carcass thickness", cpt, setParam("panelThickness", 1), { step: 0.5 }),
      numField("Front thickness", p.frontPanelThickness ?? thickness(job.getStock(), "door"), setParam("frontPanelThickness", 1), { step: 0.5 }),
      numField("Front clearance", p.frontClearance ?? 2.5, setParam("frontClearance", 0), { step: 0.5 }),
    ]),
    checks,
    el("div", { class: "panel-foot" }, [remove]),
  ];
  panel.replaceChildren(...(mod.placement === "nose" ? noseChildren : mod.placement === "bedBox" ? bedChildren : boxChildren).filter(Boolean));
  fillDrawer(result, errors, warnings);
}

/** Checks + Boards tabs of the bottom drawer for a generated cabinet. */
function fillDrawer(result, errors, warnings) {
  drawerChecks.replaceChildren(
    errors.length || warnings.length
      ? el("div", {}, [
          ...errors.map((m) => el("div", { class: "msg err", text: m })),
          ...warnings.map((m) => el("div", { class: "msg warn", text: m })),
        ])
      : el("div", { class: "empty ok", text: "All checks passed." }),
  );

  const boards = result?.boards || [];
  drawerBoards.replaceChildren(
    boards.length
      ? el("table", { class: "grid" }, [
          el("thead", {}, [el("tr", {}, ["ID", "Name", "Type", "L (mm)", "W (mm)", "T (mm)"].map((h) => el("th", { text: h })))]),
          el("tbody", {}, boards.map((b) => {
            const dx = b.x1 - b.x0, dy = b.y1 - b.y0, dz = b.z1 - b.z0;
            const dims = [dx, dy, dz].filter((_, k) => ["X", "Y", "Z"][k] !== b.thicknessAxis).sort((a, c) => c - a);
            return el("tr", {}, [
              el("td", { text: b.id }), el("td", { text: b.name }), el("td", { text: b.boardType }),
              el("td", { text: dims[0].toFixed(1) }), el("td", { text: dims[1].toFixed(1) }), el("td", { text: String(b.materialThickness) }),
            ]);
          })),
        ])
      : el("div", { class: "empty", text: "No boards — fix the checks first." }),
  );
}

function renderPlane(pl) {
  const AXIS = { x: "X (width)", y: "Y (depth)", z: "Z (height)" };
  panel.replaceChildren(
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Construction plane" }),
      el("div", { class: "panel-sub", text: pl.id }),
    ]),
    section("Offset", [
      el("div", { class: "kv" }, [el("span", { text: "From" }), el("b", { text: pl.from?.label || "—" })]),
      el("div", { class: "kv" }, [el("span", { text: "Distance" }), el("b", { text: `${Math.round(pl.offset)} mm` })]),
      el("div", { class: "kv" }, [el("span", { text: "Plane" }), el("b", { text: `${AXIS[pl.axis] || pl.axis} = ${Math.round(pl.value)}` })]),
    ]),
    el("div", { class: "panel-section" }, [
      el("div", { class: "empty small", text: "Intersections with walls, floor, ceiling and roof are snap points. Delete removes the plane." }),
    ]),
    el("div", { class: "panel-foot" }, [
      el("button", { class: "tb danger", text: "Remove plane", onclick: () => job.removePlane(pl.id) }),
    ]),
  );
  drawerChecks.replaceChildren(el("div", { class: "empty", text: "A construction plane has no checks." }));
  drawerBoards.replaceChildren(el("div", { class: "empty", text: "A construction plane has no boards." }));
}

export function renderPanel() {
  const sel = job.getSelected();
  // The wide editor page only while an OHC is selected; everything else uses the narrow panel.
  const wide = !!sel && getModule(sel.moduleId).panel === "ohc";
  panel.classList.toggle("wide", wide);
  app.classList.toggle("wide-right", wide);
  if (sel) renderCabinet(sel);
  else {
    const pl = job.getSelectedPlane();
    if (pl) renderPlane(pl);
    else renderSpace();
  }
}
