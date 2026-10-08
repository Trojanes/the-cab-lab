// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { log } from "../log.js";
import { MIN_ZONE_HEIGHT, MIN_ZONE_WIDTH } from "../modules.js";
import { thickness } from "../materials.js";
import { el, doorLine, numField, section, frontSection, kv, panel, repaint, gapMode, outerSizeFields } from "./widgets.js";
import { kitchenEndBlocked } from "../interact/shared.js";
// --- kitchen base cabinet editor -------------------------------------------------------
//
// Wide page while a kitchen base run is selected: the generator's 2D front
// elevation (columns left → right, zones inside a column top → bottom, over the
// kick). Click a cell to select its zone; drag an orange column boundary to
// trade width with the next column, or an orange zone boundary to trade height
// with the zone below (10 mm steps, Shift = 1 mm). A card edits the selected
// zone and its column. Every edit is one undo step; a drag commits on release.

/** A typed stove opening follows the column. A later width edit rewrites that number to the new gap. */
function syncStoveOpenings(cabId) {
  const cab = job.getJob().cabinets.find((c) => c.id === cabId);
  if (!cab) return;
  const stoves = job.resultFor(cabId)?.debug?.stoves || [];
  const opening = new Map(stoves.map((s) => [s.zoneId, s.openingWidth]));
  let changed = false;
  const columns = (cab.params.columns || []).map((col) => ({
    ...col,
    zones: (col.zones || []).map((z) => {
      if (z.zoneType !== "stove" || !(Number(z.cutoutWidth) > 0)) return z;
      const next = opening.get(z.id);
      if (next == null || Math.abs(next - Number(z.cutoutWidth)) < 0.05) return z;
      changed = true;
      return { ...z, cutoutWidth: next };
    }),
  }));
  if (changed) job.setParams(cabId, { ...cab.params, columns }, { history: false });
}

function bandBoards(boards, axis) {
  const thick = axis === "x" ? "X" : "Z";
  return (boards || []).filter((b) => b.thicknessAxis === thick && b.category !== "front_panel" && b.stock?.kind !== "door");
}

/** The same column reading the elevation draws: clearance between faces, or centre to centre. */
function columnReadout(result, ci) {
  const col = result?.debug?.columns?.[ci];
  if (!col) return null;
  const r1 = (v) => Math.round(v * 10) / 10;
  const width = r1(col.x1 - col.x0);
  const panels = bandBoards(result.boards, "x");
  const left = panels
    .filter((p) => p.x1 <= col.x0 + 0.8 || (p.x0 - 0.2 <= col.x0 && col.x0 <= p.x1 + 0.2))
    .sort((a, b) => (b.x0 + b.x1) - (a.x0 + a.x1))[0];
  const right = panels
    .filter((p) => p.x0 >= col.x1 - 0.8 || (p.x0 - 0.2 <= col.x1 && col.x1 <= p.x1 + 0.2))
    .sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1))[0];
  if (!left || !right) return { width, clear: width, center: width };
  return {
    width,
    clear: r1(right.x0 - left.x1),
    center: r1((right.x0 + right.x1) / 2 - (left.x0 + left.x1) / 2),
  };
}

/** The vertical opening of one zone, measured the same way as the bar drawn on it. */
function zoneReadout(result, ci, zoneId) {
  const col = result?.debug?.columns?.[ci];
  const zone = col?.zones?.find((z) => z.id === zoneId);
  if (!zone) return null;
  const r1 = (v) => Math.round(v * 10) / 10;
  const height = r1(zone.z1 - zone.z0);
  const panels = bandBoards(result.boards, "z").filter((b) => b.x1 > col.x0 + 1 && b.x0 < col.x1 - 1);
  const below = panels
    .filter((p) => p.z1 <= zone.z0 + 0.8 || (p.z0 - 0.2 <= zone.z0 && zone.z0 <= p.z1 + 0.2))
    .sort((a, b) => (b.z0 + b.z1) - (a.z0 + a.z1))[0];
  const above = panels
    .filter((p) => p.z0 >= zone.z1 - 0.8 || (p.z0 - 0.2 <= zone.z1 && zone.z1 <= p.z1 + 0.2))
    .sort((a, b) => (a.z0 + a.z1) - (b.z0 + b.z1))[0];
  if (!below || !above || above.z0 <= below.z1) return { height, clear: height, center: height };
  return {
    height,
    clear: r1(above.z0 - below.z1),
    center: r1((above.z0 + above.z1) / 2 - (below.z0 + below.z1) / 2),
  };
}

const kitchenSel = { cabId: null, col: -1, zoneId: null }; // cell selection, kept across re-renders
let kitchenDrag = null; // { cabId, refresh } while a front-view boundary is dragged

function kitchenSelected(cabId) {
  if (kitchenSel.cabId !== cabId) { kitchenSel.cabId = cabId; kitchenSel.col = -1; kitchenSel.zoneId = null; }
  return kitchenSel;
}

export function renderKitchen(cab, mod, result, shared) {
  const p = cab.params;
  const env = mod.envelope(p);
  const columns = p.columns || [];
  const cpt = p.materialThickness ?? thickness(job.getStock(), "carcass");
  const fpt = p.frontThickness ?? thickness(job.getStock(), "door");
  const bch = p.bottomClearanceHeight ?? 70;
  const sel = kitchenSelected(cab.id);
  const selCol = columns[sel.col];
  const selZone = selCol?.zones?.find((z) => z.id === sel.zoneId) ?? null;
  const selZoneIndex = selZone ? selCol.zones.indexOf(selZone) : -1;
  const resCols = result?.debug?.columns || [];

  const setParams = (next, kind, extra = {}) => {
    job.setParams(cab.id, next);
    log(`kitchen.cell.${kind}`, { id: cab.id, ...extra });
  };

  // A drag in progress: redraw the SVG in place and keep the container (and its pointer capture) alive.
  if (kitchenDrag && kitchenDrag.cabId === cab.id && panel.querySelector(".bedroom-front")) {
    kitchenDrag.refresh();
    return;
  }

  const front = el("div", { class: "bedroom-front" });
  const drawFront = () => {
    const cur = kitchenSelected(cab.id);
    front.innerHTML = mod.frontView(job.resultFor(cab.id), { selectedZoneId: cur.zoneId, selectedCol: cur.col, gaps: gapMode }) || "";
    if (!front.firstChild) front.append(el("div", { class: "empty small", text: "No front view — fix the checks first." }));
  };
  drawFront();

  // The number under a column is the clearance or the centre distance, whichever the dropdown shows.
  // Typing it changes the stored column width by the difference; the neighbour takes the rest.
  const editColumnOpening = (dim) => {
    if (front.querySelector(".col-dim-input")) return;
    const ci = Number(dim.getAttribute("data-col"));
    const shown = Number(gapMode === "center" ? dim.dataset.center : dim.dataset.clear);
    const width = Number(dim.dataset.width);
    if (!Number.isFinite(ci) || !Number.isFinite(shown) || !Number.isFinite(width)) return;
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
      if (!apply || !Number.isFinite(typed) || Math.abs(typed - shown) < 0.05) return;
      const cols = cab.params.columns || [];
      const neighbour = ci < cols.length - 1 ? ci + 1 : ci - 1;
      if (neighbour < 0) return;
      const next = cols.map((c) => ({ ...c, zones: c.zones.map((z) => ({ ...z })) }));
      const delta = Math.round((typed - shown) * 10) / 10;
      const span = Math.round((width + delta) * 10) / 10;
      const other = Math.round((next[neighbour].width - delta) * 10) / 10;
      if (span < MIN_ZONE_WIDTH || other < MIN_ZONE_WIDTH) return;
      next[ci].width = span;
      next[neighbour].width = other;
      setParams({ ...cab.params, columns: next }, "width", {
        column: next[ci].id, width: span, mode: gapMode, shown: typed,
      });
      syncStoveOpenings(cab.id);
    };
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") { ev.preventDefault(); finish(true); }
      else if (ev.key === "Escape") { ev.preventDefault(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  };

  // Cell selection: one click on a zone cell. A number under a column is typed instead.
  front.addEventListener("click", (e) => {
    if (kitchenDrag) return;
    const dim = e.target.closest?.(".col-dim.editable");
    if (dim) {
      e.stopPropagation();
      editColumnOpening(dim);
      return;
    }
    const cellEl = e.target.closest?.("[data-zone]");
    if (!cellEl) return;
    const zid = cellEl.getAttribute("data-zone");
    const ci = Number(cellEl.getAttribute("data-col") || 0);
    const cur = kitchenSelected(cab.id);
    const same = cur.zoneId === zid && cur.col === ci;
    cur.col = same ? -1 : ci;
    cur.zoneId = same ? null : zid;
    log("kitchen.cell.select", { id: cab.id, column: cur.col, zone: cur.zoneId });
    repaint();
  });
  front.addEventListener("pointerdown", (e) => {
    const g = e.target.closest?.("[data-boundary]");
    const svg = front.querySelector("svg");
    if (!g || !svg || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const kind = g.getAttribute("data-boundary"); // "column" | "zone"
    const axis = g.getAttribute("data-axis");
    const index = Number(g.getAttribute("data-index") || 0);
    const ci = Number(g.getAttribute("data-col") || 0);
    const params0 = cab.params;
    const result0 = job.resultFor(cab.id);
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
    const heightLocked = (zn) => zn?.zoneType === "stove" && Number(zn.cutoutHeight) > 0;
    if (kind === "zone") {
      const zs = columns[ci]?.zones || [];
      if (heightLocked(zs[index]) || heightLocked(zs[index + 1])) {
        log("kitchen.cell.blocked", { id: cab.id, reason: "locked by the stove cutout" });
        return;
      }
    }
    try { front.setPointerCapture(e.pointerId); } catch (_) { /* synthetic pointer */ }
    front.classList.add("dragging");
    g.classList.add("active");
    kitchenDrag = { cabId: cab.id, refresh: drawFront };
    const move = (ev) => {
      const step = ev.shiftKey ? 1 : 10;
      const v = Math.round(toMm(ev.clientX, ev.clientY) / step) * step;
      if (kind === "split") {
        const lines = (result0?.debug?.columns || []).slice(0, -1).map((col, i) => ({ after: i, x: col.x1 }));
        if (!lines.length) return;
        const hit = lines.reduce((best, line) => (Math.abs(line.x - v) < Math.abs(best.x - v) ? line : best));
        job.setParams(cab.id, { ...params0, splitAfter: hit.after }, { history: false });
        return;
      }
      const next = kind === "column"
        ? mod.setDivider(params0, result0, index, v)
        : mod.setZoneDivider(params0, result0, ci, index, v);
      job.setParams(cab.id, next, { history: false });
    };
    const end = (ev) => {
      front.removeEventListener("pointermove", move);
      front.removeEventListener("pointerup", end);
      front.removeEventListener("pointercancel", end);
      try { front.releasePointerCapture(ev.pointerId); } catch (_) { /* released */ }
      front.classList.remove("dragging");
      kitchenDrag = null;
      const changed = job.commitSnapshot(before);
      const now = job.getSelected();
      if (kind === "split") {
        log("kitchen.split.move", {
          id: cab.id, from: params0.splitAfter ?? null, to: now ? now.params.splitAfter ?? null : null,
          x: now?.params.splitAfter != null ? job.resultFor(cab.id)?.debug?.split?.x : null,
          changed, where: "front view",
        });
      } else {
        if (kind === "column") syncStoveOpenings(cab.id);
        log("kitchen.cell.drag", {
          id: cab.id, boundary: kind, index, column: kind === "zone" ? ci : undefined,
          to: now ? (kind === "column" ? now.params.columns?.map((c) => c.width) : now.params.columns?.[ci]?.zones?.map((z) => z.height)) : null,
          changed, where: "front view",
        });
      }
      repaint();
    };
    front.addEventListener("pointermove", move);
    front.addEventListener("pointerup", end);
    front.addEventListener("pointercancel", end);
  });

  // Column / zone toolbar. Columns keep the run's length; zones keep the column's height.
  const r1 = (v) => Math.round(v * 10) / 10;
  const zoneAllowsShelf = (t) => ["left_door", "right_door", "double_door", "open", "custom"].includes(t);
  const zoneAllowsLock = (t) => ["left_door", "right_door", "double_door", "drawer", "down_flap"].includes(t);
  const cloneCols = () => columns.map((c) => ({ ...c, zones: c.zones.map((z) => ({ ...z })) }));
  const addColumn = el("button", { class: "tb", text: "+ Column", disabled: !selCol, title: "Insert a column to the right of the selected one. Only that column gives up width; columns further right keep theirs.", onclick: () => {
    if (!selCol) { log("kitchen.cell.blocked", { id: cab.id, reason: "select a column first" }); return; }
    const next = cloneCols();
    const ci = sel.col;
    const host = next[ci];
    const take = Math.min(400, r1((host?.width || 0) / 2));
    if (take < MIN_ZONE_WIDTH || (host.width || 0) - take < MIN_ZONE_WIDTH) { log("kitchen.cell.blocked", { id: cab.id, column: host.id, reason: `column ${host.id} cannot give ${MIN_ZONE_WIDTH} mm` }); return; }
    host.width = r1(host.width - take);
    const stamp = Date.now().toString(36);
    const col = { id: `c${stamp}`, width: take, zones: [{ id: `z${stamp}`, height: r1(env.H - bch), zoneType: "left_door" }] };
    next.splice(ci + 1, 0, col);
    kitchenSel.col = ci + 1;
    kitchenSel.zoneId = col.zones[0].id;
    const patch = { ...p, columns: next };
    if (p.splitAfter != null && p.splitAfter >= ci) patch.splitAfter = p.splitAfter + 1;
    setParams(patch, "add", { column: col.id, from: host.id, at: ci + 1, widths: next.map((c) => c.width) });
    syncStoveOpenings(cab.id);
  } });
  const addZone = el("button", { class: "tb", text: "+ Zone", disabled: !selZone, title: "Split the selected zone: a new drawer above it takes part of its height", onclick: () => {
    const next = cloneCols();
    const zs = next[sel.col].zones;
    const host = zs[selZoneIndex];
    const take = Math.min(200, r1(host.height / 2));
    if (take < MIN_ZONE_HEIGHT || host.height - take < MIN_ZONE_HEIGHT) { log("kitchen.cell.blocked", { id: cab.id, reason: `zone ${host.id} cannot give ${MIN_ZONE_HEIGHT} mm` }); return; }
    host.height = r1(host.height - take);
    const zone = { id: `z${Date.now().toString(36)}`, height: take, zoneType: "drawer" };
    zs.splice(selZoneIndex, 0, zone); // top → bottom: inserting before the host puts it above
    kitchenSel.zoneId = zone.id;
    setParams({ ...p, columns: next }, "zoneAdd", { column: selCol.id, zone: zone.id, from: host.id });
  } });
  const removeZone = el("button", { class: "tb danger", text: "Remove zone", disabled: !selZone || selCol.zones.length <= 1, title: "The zone below (or above) takes its height", onclick: () => {
    const next = cloneCols();
    const zs = next[sel.col].zones;
    const heir = zs[selZoneIndex + 1] ?? zs[selZoneIndex - 1];
    heir.height = r1(heir.height + zs[selZoneIndex].height);
    zs.splice(selZoneIndex, 1);
    kitchenSel.zoneId = heir.id;
    setParams({ ...p, columns: next }, "zoneRemove", { column: selCol.id, removed: selZone.id, heir: heir.id });
  } });
  const removeColumn = el("button", { class: "tb danger", text: "Remove column", disabled: !selCol || columns.length <= 1, title: "The column on the left takes its width. Columns to the right keep theirs.", onclick: () => {
    const next = cloneCols();
    const ci = sel.col;
    const heir = next[ci - 1] ?? next[ci + 1];
    heir.width = r1((heir.width || 0) + (next[ci].width || 0));
    next.splice(ci, 1);
    kitchenSel.col = -1;
    kitchenSel.zoneId = null;
    const patch = { ...p, columns: next };
    if (p.splitAfter != null) {
      const leftId = columns[p.splitAfter]?.id;
      const rightId = columns[p.splitAfter + 1]?.id;
      const at = next.findIndex((c, i) => c.id === leftId && next[i + 1]?.id === rightId);
      if (at >= 0) patch.splitAfter = at;
      else delete patch.splitAfter;
    }
    setParams(patch, "columnRemove", { removed: selCol.id, heir: heir.id });
    syncStoveOpenings(cab.id);
  } });

  // Selected cell card: the zone's fields, then its column.
  let cellCard = null;
  if (selZone && selZoneIndex >= 0) {
    const ci = sel.col;
    const zi = selZoneIndex;
    const z = selZone;
    const col = selCol;
    const res = resCols[ci]?.zones?.find((rz) => rz.id === z.id);
    const setZone = (patch, kind, extra = {}) => {
      const next = cloneCols();
      Object.assign(next[ci].zones[zi], patch);
      setParams({ ...p, columns: next }, kind, { column: col.id, zone: z.id, ...extra });
    };
    const check = (text, on, onChange, title) => el("label", { class: "field check", title }, [
      el("span", { text }),
      el("input", { type: "checkbox", checked: on, onchange: (e) => onChange(e.target.checked) }),
    ]);
    const zoneChoices = mod.zoneTypes.some((t) => t.id === z.zoneType)
      ? mod.zoneTypes
      : [...mod.zoneTypes, { id: z.zoneType, label: z.zoneType === "stove" ? "Stove (not on an ensuite)" : z.zoneType }];
    const type = el("select", { onchange: (e) => { e.target.blur(); setZone({ zoneType: e.target.value }, "type", { type: e.target.value }); } },
      zoneChoices.map((t) => el("option", { value: t.id, text: t.label, selected: t.id === z.zoneType })));

    const neighbour = zi < col.zones.length - 1 ? zi + 1 : zi - 1;
    const colNeighbour = ci < columns.length - 1 ? ci + 1 : ci - 1;
    const stoveInfo = (result?.debug?.stoves || []).find((s) => s.zoneId === z.id);
    const fc = p.frontClearance ?? 2.5;
    const applyCutout = (key, opening) => {
      const next = cloneCols();
      const zone = next[ci].zones[zi];
      if (!(opening > 0)) {
        delete zone[key];
        setParams({ ...p, columns: next }, "cutout", { column: col.id, zone: z.id, key, to: null });
        return;
      }
      if (key === "cutoutWidth") {
        const current = stoveInfo?.openingWidth;
        if (current == null) return;
        const delta = r1(opening - current);
        if (next.length === 1) {
          next[0].width = r1((next[0].width || 0) + delta);
          zone.cutoutWidth = opening;
          setParams({ ...p, globalSettings: { ...p.globalSettings, length: next[0].width }, columns: next }, "cutout", { column: col.id, zone: z.id, key, from: current, to: opening });
          return;
        }
        const free = (candidate) => candidate && !(candidate.zones || []).some((zn) => zn.zoneType === "stove" && Number(zn.cutoutWidth) > 0 && zn.id !== zone.id);
        const absorber = free(next[ci + 1]) ? next[ci + 1] : free(next[ci - 1]) ? next[ci - 1] : null;
        if (!absorber || absorber.width - delta < MIN_ZONE_WIDTH || next[ci].width + delta < MIN_ZONE_WIDTH) {
          log("kitchen.cell.blocked", { id: cab.id, reason: "no column can take the stove opening" });
          repaint();
          return;
        }
        next[ci].width = r1(next[ci].width + delta);
        absorber.width = r1(absorber.width - delta);
        zone.cutoutWidth = opening;
        setParams({ ...p, columns: next }, "cutout", { column: col.id, zone: z.id, key, from: current, to: opening });
        return;
      }
      const nextHeight = r1(Math.max(MIN_ZONE_HEIGHT, opening - cpt + fc));
      const delta = r1(nextHeight - zone.height);
      if (next[ci].zones.length === 1) {
        zone.height = nextHeight;
        zone.cutoutHeight = opening;
        setParams({ ...p, globalSettings: { ...p.globalSettings, height: r1((p.globalSettings?.height ?? env.H) + delta) }, columns: next }, "cutout", { column: col.id, zone: z.id, key, to: opening });
        return;
      }
      const heir = next[ci].zones[zi + 1] || next[ci].zones[zi - 1];
      if (heir.height - delta < MIN_ZONE_HEIGHT) {
        log("kitchen.cell.blocked", { id: cab.id, reason: "the zone below cannot give that stove opening" });
        repaint();
        return;
      }
      heir.height = r1(heir.height - delta);
      zone.height = nextHeight;
      zone.cutoutHeight = opening;
      setParams({ ...p, columns: next }, "cutout", { column: col.id, zone: z.id, key, to: opening });
    };
    const cutoutInput = (label, stored, placeholder, key) => {
      const input = el("input", {
        type: "number", step: "0.1", min: "0",
        placeholder: placeholder == null ? "" : String(placeholder),
        value: stored > 0 ? stored : "",
      });
      const commit = () => {
        const text = String(input.value).trim();
        if (!text) { applyCutout(key, null); return; }
        const v = Number(text);
        if (!Number.isFinite(v) || v <= 0) { input.value = stored > 0 ? stored : ""; return; }
        applyCutout(key, v);
      };
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
      return el("label", { class: "field", title: "Clear the field to drag this size again" }, [el("span", { text: label }), input]);
    };
    const widthRead = columnReadout(result, ci);
    const widthShown = widthRead ? (gapMode === "center" ? widthRead.center : widthRead.clear) : col.width;
    const heightRead = zoneReadout(result, ci, z.id);
    const heightShown = heightRead ? (gapMode === "center" ? heightRead.center : heightRead.clear) : z.height;
    const fields = [
      el("label", { class: "field wide-value" }, [el("span", { text: "Type" }), type]),
      res ? kv("From floor", `${Math.round(res.z0)} – ${Math.round(res.z1)} mm`) : null,
      numField(gapMode === "center" ? "Centre height (mm)" : "Clear height (mm)", heightShown, (v) => {
        if (neighbour < 0) return;
        const next = cloneCols();
        const zs = next[ci].zones;
        const raw = r1(zs[zi].height + (v - heightShown));
        const val = Math.max(MIN_ZONE_HEIGHT, Math.min(r1(zs[zi].height + zs[neighbour].height - MIN_ZONE_HEIGHT), raw));
        zs[neighbour].height = r1(zs[neighbour].height - (val - zs[zi].height));
        zs[zi].height = val;
        setParams({ ...p, columns: next }, "height", { column: col.id, zone: z.id, height: val, mode: gapMode, shown: r1(v) });
      }, { step: 1, min: 0, readOnly: z.zoneType === "stove" && Number(z.cutoutHeight) > 0 ? "Locked by the stove cutout — clear the opening height to drag" : col.zones.length <= 1 ? "The only zone fills the column (height − kick)" : null }),
      z.zoneType === "stove" ? cutoutInput("Opening width (mm)", z.cutoutWidth, stoveInfo?.openingWidth, "cutoutWidth") : null,
      z.zoneType === "stove" ? cutoutInput("Opening height (mm)", z.cutoutHeight, stoveInfo?.openingHeight, "cutoutHeight") : null,
      z.zoneType === "stove" ? el("p", { class: "zs-hint", text: "The opening is the gap between the two 100 mm side panels. Typing it sets this column's width. Dragging the column updates the number." }) : null,
      zoneAllowsShelf(z.zoneType) ? check("Shelf", z.shelfEnabled !== false, (on) => setZone({ shelfEnabled: on }, "shelf", { on })) : null,
      zoneAllowsLock(z.zoneType) ? check("Lock", z.lockEnabled !== false, (on) => setZone({ lockEnabled: on }, "lock", { on }), p.lockEnabled === false ? "Locks are off for the whole cabinet" : undefined) : null,
      (z.zoneType === "left_door" || z.zoneType === "right_door")
        ? check("With sink", z.withSink === true, (on) => setZone({ withSink: on }, "sink", { on }), "A sink in the bench above this door. The upper hinge moves down 130 mm. The lower hinge stays. A sink placed on the bench will turn this on by itself later.")
        : null,
      cab.moduleId === "ensuiteCabinet" && zi === col.zones.length - 1 && (z.zoneType === "left_door" || z.zoneType === "right_door")
        ? check("Washer floor", z.applianceFloorEnabled === true, (on) => setZone({ applianceFloorEnabled: on }, "washer", { on }), "A deck behind B3 and two supports in the kick. Style 1 only. Refused when this column meets a wheel arch, or the carcass is under 450 deep, or the clear width is under 500.")
        : null,
    ];
    const colFields = [
      numField(gapMode === "center" ? "Centre width (mm)" : "Clear width (mm)", widthShown, (v) => {
        if (colNeighbour < 0) return;
        const next = cloneCols();
        const raw = r1(next[ci].width + (v - widthShown));
        const val = Math.max(MIN_ZONE_WIDTH, Math.min(r1(next[ci].width + next[colNeighbour].width - MIN_ZONE_WIDTH), raw));
        next[colNeighbour].width = r1(next[colNeighbour].width - (val - next[ci].width));
        next[ci].width = val;
        setParams({ ...p, columns: next }, "width", { column: col.id, width: val, mode: gapMode, shown: r1(v) });
        syncStoveOpenings(cab.id);
      }, { step: 1, min: 0, readOnly: columns.length <= 1 ? "The only column fills the run" : null }),
      resCols[ci] ? kv("From left", `${Math.round(resCols[ci].x0)} – ${Math.round(resCols[ci].x1)} mm`) : null,
      kv("Zones", `${col.zones.length} · top → bottom`),
    ];
    const SIDE_DEFAULT = {
      panelType: "carcass", frontVisible: false, bchNotchEnabled: true,
      grooveVisible: true, extendT2T3B4ToOuterFace: true, strengtheningStripEnabled: false,
    };
    const isPanelZone = (t) => ["left_door", "right_door", "double_door", "drawer", "down_flap"].includes(t);
    const sideKey = (side) => (side === "left" ? "leftSidePanelOptions" : "rightSidePanelOptions");
    const sideHost = (zones, side) => {
      const key = sideKey(side);
      const indexed = zones.map((zone, index) => ({ zone, index }));
      const withKey = indexed.filter(({ zone }) => zone[key]);
      return withKey.find(({ zone }) => isPanelZone(zone.zoneType))
        || withKey.find(({ zone }) => zone.zoneType === "open" || zone.zoneType === "custom")
        || withKey[0]
        || indexed.find(({ zone }) => isPanelZone(zone.zoneType))
        || indexed.find(({ zone }) => zone.zoneType === "open" || zone.zoneType === "custom")
        || indexed[0];
    };
    const writeSide = (side, patch) => {
      const next = cloneCols();
      const host = sideHost(next[ci].zones, side);
      if (!host) return;
      const key = sideKey(side);
      const from = { ...SIDE_DEFAULT, ...(host.zone[key] || {}) };
      const field = Object.keys(patch)[0];
      next[ci].zones[host.index][key] = { ...from, ...patch };
      setParams({ ...p, columns: next }, "side", { column: col.id, side, key: field, from: from[field], to: patch[field] });
    };
    const sideSection = (side) => {
      const host = sideHost(col.zones, side);
      const opts = { ...SIDE_DEFAULT, ...(host ? host.zone[sideKey(side)] : {}) };
      const hasPanel = col.zones.some((zone) => isPanelZone(zone.zoneType));
      const tick = (text, on, key, title, disabled) => el("label", { class: "field check", title }, [
        el("span", { text }),
        el("input", { type: "checkbox", checked: on, disabled: !!disabled, onchange: (e) => writeSide(side, { [key]: e.target.checked }) }),
      ]);
      return section(side === "left" ? "Left end" : "Right end", [
        el("label", { class: "field" }, [
          el("span", { text: "Stock" }),
          el("div", { class: "seg-group" }, [["carcass", "Carcass"], ["door", "Door"]].map(([id, text]) => el("button", {
            type: "button",
            class: `tb seg${opts.panelType === id ? " active" : ""}`,
            text,
            title: id === "door" ? `Door stock ${fpt} mm, door colour outside` : `Carcass stock ${cpt} mm`,
            onclick: () => { if (opts.panelType !== id) writeSide(side, { panelType: id }); },
          }))),
        ]),
        tick("Front visible", opts.frontVisible, "frontVisible"),
        tick("Groove visible", opts.grooveVisible, "grooveVisible"),
        tick("Kick notch", opts.bchNotchEnabled, "bchNotchEnabled"),
        tick("T2 / T3 / B4 reach the outer face", opts.extendT2T3B4ToOuterFace, "extendT2T3B4ToOuterFace"),
        tick("Strengthening strip", opts.strengtheningStripEnabled, "strengtheningStripEnabled", "Needs a visible front and a door, drawer, or flap in this column", !opts.frontVisible || !hasPanel),
        el("div", { class: "empty small", text: "This end of the run. The strip is cut only when the front is visible and this column has a door, a drawer, or a flap." }),
      ]);
    };
    const sideCards = [];
    if (ci === 0) sideCards.push(sideSection("left"));
    if (ci === columns.length - 1) sideCards.push(sideSection("right"));
    cellCard = [
      section(`Zone ${zi + 1} of ${col.zones.length} · from the top`, fields.filter(Boolean)),
      section(`Column ${ci + 1} of ${columns.length}`, colFields.filter(Boolean)),
      ...sideCards,
    ];
  }

  // Cabinet-level fields, folded.
  const setKick = (v) => {
    const carcassH = p.globalSettings?.height ?? env.H;
    const next = Math.max(0, Math.min(Math.round(carcassH) - 1, Math.round(Number(v))));
    if (!Number.isFinite(next) || next === Math.round(bch)) return;
    job.setParams(cab.id, mod.setEnvelope({ ...p, bottomClearanceHeight: next }, { H: env.H }));
    log("kitchen.cell.kick", { id: cab.id, from: bch, to: next });
  };
  const setPose = (k) => (v) => job.setPose(cab.id, { [k]: v });
  const sizes = () => outerSizeFields(cab, mod, env, p, { logKind: "kitchen.size", columns });
  const benchOn = !!(p.benchTopColorName || p.benchTopColor);
  const fallNow = p.waterfall === "left" || p.waterfall === "right" ? p.waterfall : null;
  const fallT = 25;
  const applyWaterfall = (side, columnIndex) => {
    const next = structuredClone(p);
    const from = next.waterfall === "left" || next.waterfall === "right" ? next.waterfall : null;
    if (side === from) return;
    const r1 = (v) => Math.round(v * 10) / 10;
    if (Boolean(side) !== Boolean(from)) {
      const col = next.columns?.[columnIndex];
      if (!col) return;
      const delta = side ? -fallT : fallT;
      const width = r1(col.width + delta);
      if (width < MIN_ZONE_WIDTH) {
        log("kitchen.waterfall", { id: cab.id, blocked: true, reason: `column ${columnIndex + 1} would be ${width} mm` });
        return;
      }
      col.width = width;
      next.globalSettings.length = r1(next.globalSettings.length + delta);
    }
    if ((side === "left") !== (from === "left")) {
      const shift = side === "left" ? fallT : -fallT;
      next.wheelAvoidances = (next.wheelAvoidances || []).map((a) => ({ ...a, x0: a.x0 + shift, x1: a.x1 + shift }));
    }
    if (side) next.waterfall = side;
    else delete next.waterfall;
    job.setParams(cab.id, next);
    log("kitchen.waterfall", { id: cab.id, from, to: side, column: columnIndex, length: next.globalSettings.length });
  };
  const askFallColumn = (side, host) => {
    if (columns.length < 2) { applyWaterfall(side, 0); return; }
    host.parentElement?.querySelectorAll(".size-pop").forEach((n) => n.remove());
    const gaining = !side;
    const pop = el("div", { class: "size-pop" }, [
      el("span", { text: gaining ? "Which column gains 25?" : "Which column gives 25?" }),
      ...columns.map((col, i) => {
        const tooSmall = !gaining && col.width - fallT < MIN_ZONE_WIDTH;
        return el("button", {
          type: "button", class: "tb", text: `Column ${i + 1}`,
          disabled: tooSmall,
          title: tooSmall ? "This column cannot give 25 mm and stay at least 150" : `${Math.round(col.width)} mm`,
          onclick: () => { pop.remove(); applyWaterfall(side, i); },
        });
      }),
    ]);
    host.after(pop);
  };
  const waterfallSection = () => {
    const endTitle = (side) => {
      if (!benchOn) return "Needs a bench top colour";
      if (kitchenEndBlocked(cab, side)) return "This end is against a wall or another cabinet";
      return side === "left" ? "25 mm drop on the left, mitred 45° to the bench top" : "25 mm drop on the right, mitred 45° to the bench top";
    };
    const choice = (side, label) => {
      const blocked = !benchOn || kitchenEndBlocked(cab, side);
      return el("button", {
        type: "button",
        class: `tb seg${fallNow === side ? " active" : ""}`,
        text: label,
        disabled: blocked && fallNow !== side,
        title: endTitle(side),
        onclick: (e) => {
          if (blocked) return;
          if (fallNow === side) askFallColumn(null, e.currentTarget);
          else if (fallNow) applyWaterfall(side, 0);
          else askFallColumn(side, e.currentTarget);
        },
      });
    };
    return section("Waterfall", [
      el("div", { class: "seg-group" }, [
        el("button", {
          type: "button", class: `tb seg${!fallNow ? " active" : ""}`, text: "Off",
          title: "No drop. The bench top stops at the carcass.",
          onclick: (e) => { if (fallNow) askFallColumn(null, e.currentTarget); },
        }),
        choice("left", "Left"),
        choice("right", "Right"),
      ]),
      el("div", { class: "empty small", text: "Only an end that does not meet a wall. The outer width includes the 25 mm drop, and the columns sit inboard of it. The joint with the bench top is a 45° mitre." }),
    ]);
  };
  const fold = el("details", { class: "panel-fold" }, [
    el("summary", { text: `Cabinet · ${Math.round(env.W)} × ${Math.round(env.D)} × ${Math.round(env.H)} · ${columns.length} columns · ${result?.boards?.length || 0} boards` }),
    section("Outer size (= box)", sizes()),
    section("Kick & fronts", [
      el("label", { class: "field" }, [
        el("span", { text: "Kick" }),
        el("div", { class: "seg-group" }, [["style_1", "Style 1 · recessed"], ["style_2", "Style 2 · flush"]].map(([id, text]) => el("button", {
          type: "button",
          class: `tb seg${(p.bottomClearanceStyle === "style_2" ? "style_2" : "style_1") === id ? " active" : ""}`,
          text,
          title: id === "style_2" ? "Kick face flush with the carcass front" : "Kick face set back from the door",
          onclick: () => {
            const from = p.bottomClearanceStyle === "style_2" ? "style_2" : "style_1";
            if (from === id) return;
            job.setParams(cab.id, { ...p, bottomClearanceStyle: id });
            log("kitchen.cell.kickStyle", { id: cab.id, from, to: id });
          },
        }))),
      ]),
      // A new kick re-fits every column's zones to height − kick (same rule as a height change).
      numField("BCH (mm)", bch, setKick, { step: 1, min: 0 }),
      numField("Front clearance (mm)", p.frontClearance ?? 2.5, (v) => job.setParams(cab.id, { ...p, frontClearance: Math.max(0, v) }), { step: 0.5, min: 0 }),
      el("label", { class: "field check" }, [
        el("span", { text: "Locks" }),
        el("input", { type: "checkbox", checked: p.lockEnabled !== false, onchange: (e) => job.setParams(cab.id, { ...p, lockEnabled: e.target.checked }) }),
      ]),
      p.bottomClearanceStyle === "style_2" ? null : el("label", { class: "field check", title: "On the underside of B3, opening downward. Style 2 has no groove." }, [
        el("span", { text: "B3 LED groove" }),
        el("input", { type: "checkbox", checked: p.ledGroove !== false, onchange: (e) => {
          job.setParams(cab.id, { ...p, ledGroove: e.target.checked });
          log("kitchen.cell.led", { id: cab.id, from: p.ledGroove !== false, to: e.target.checked });
        } }),
      ]),
    ].filter(Boolean)),
    cab.moduleId === "kitchenCabinet" ? waterfallSection() : null,
    section("Position", [
      numField("X (mm)", cab.pose.x, setPose("x"), { min: -1e6 }),
      numField("Y (mm)", cab.pose.y, setPose("y"), { min: -1e6 }),
      numField("Rotation (°)", cab.pose.rotZ || 0, (v) => job.setPose(cab.id, { rotZ: ((Math.round(v / 90) * 90) % 360 + 360) % 360 }), { step: 90, min: -1e6 }),
    ]),
    section("Material (job stock)", [
      el("div", { class: "kv" }, [el("span", { text: "Carcass" }), el("b", { text: `${p.carcassColorName || p.carcassColor || "White Stipple"} · ${cpt} mm` })]),
      doorLine(p, fpt),
    ]),
  ]);

  const splitAfter = Number.isInteger(p.splitAfter) ? p.splitAfter : null;
  const splitX = result?.debug?.split?.x;
  const splitOn = splitAfter != null && Number.isFinite(splitX);
  const nearestSplit = () => {
    const cols = result?.debug?.columns || [];
    let best = 0;
    let dist = Infinity;
    for (let i = 0; i < cols.length - 1; i += 1) {
      const d = Math.abs(cols[i].x1 - env.W / 2);
      if (d < dist) { dist = d; best = i; }
    }
    return best;
  };
  const splitBtn = el("button", {
    class: `tb${splitOn ? " active" : ""}`,
    text: splitOn ? "Remove split" : "Split Kitchen",
    disabled: !splitOn && columns.length < 2,
    title: columns.length < 2
      ? "Needs two columns. The split sits on the line between them."
      : "Two carcasses butted on a column line. Doors and drawers there each keep half the front clearance.",
    onclick: () => {
      if (splitOn) {
        const next = { ...p };
        delete next.splitAfter;
        job.setParams(cab.id, next);
        log("kitchen.split", { id: cab.id, on: false, from: splitAfter });
        return;
      }
      const after = nearestSplit();
      job.setParams(cab.id, { ...p, splitAfter: after });
      log("kitchen.split", { id: cab.id, on: true, after, x: result?.debug?.columns?.[after]?.x1 ?? null });
    },
  });
  const sheetWarn = (result?.validation?.warnings || []).find((w) => /cannot be cut/.test(w));
  const sheetHint = sheetWarn ? el("div", { class: "zs-hint warn", text: sheetWarn }) : null;

  const planArches = job.getSpace()?.wheelArches || [];
  const wheelOn = p.wheelArchAvoidance === true || (p.wheelArchAvoidance !== false && (p.wheelAvoidances || []).length > 0);
  const fullWheel = (height, depth, id = "wheel") => ({
    id, x0: 0, x1: Math.round(env.W), height, depth,
  });
  const setWheelOn = (on) => {
    if (!on) {
      job.setParams(cab.id, { ...p, wheelArchAvoidance: false, wheelAvoidances: [] });
    } else if (planArches.length) {
      job.setParams(cab.id, { ...p, wheelArchAvoidance: true });
    } else {
      const prev = (p.wheelAvoidances || [])[0];
      job.setParams(cab.id, {
        ...p,
        wheelArchAvoidance: true,
        wheelAvoidances: [fullWheel(
          prev?.height > 0 ? prev.height : Math.max(Math.round(bch), 200),
          prev?.depth > 0 ? prev.depth : 200,
          prev?.id || "wheel",
        )],
      });
    }
    log("kitchen.wheel", { id: cab.id, on });
  };
  const handWheel = (p.wheelAvoidances || [])[0];
  const setHandWheel = (patch) => {
    const height = Math.max(0, Math.round(patch.height != null ? patch.height : handWheel?.height || 0));
    const depth = Math.max(0, Math.round(patch.depth != null ? patch.depth : handWheel?.depth || 0));
    const arch = fullWheel(height, depth, handWheel?.id || "wheel");
    job.setParams(cab.id, { ...p, wheelArchAvoidance: true, wheelAvoidances: [arch] });
    log("kitchen.wheel", { id: cab.id, wheel: arch.id, height, depth });
  };
  const wheelSection = section("Wheel arch avoidance", [
    el("label", { class: "field check", title: "Cut this cabinet around a wheel arch. Kitchen and Ensuite. The cut runs the full width." }, [
      el("span", { text: "Wheel arch avoidance" }),
      el("input", { type: "checkbox", checked: wheelOn, onchange: (e) => setWheelOn(e.target.checked) }),
    ]),
    ...(wheelOn ? (
      p.wheelArchAvoidance === true && planArches.length ? [
        el("div", { class: "empty small", text: "From the red pair on the floor plan. The cut follows this cabinet's back." }),
        ...((p.wheelAvoidances || []).length
          ? (p.wheelAvoidances || []).map((w) => el("div", { class: "kv" }, [
            el("span", { text: w.id }),
            el("b", { text: `height ${Math.round(w.height)} · depth ${Math.round(w.depth)}` }),
          ]))
          : [el("div", { class: "empty small", text: "The back of this cabinet is outside the wheel arches." })]),
      ] : [
        numField("Height (mm)", handWheel?.height ?? Math.max(Math.round(bch), 200), (v) => setHandWheel({ height: v }), { step: 10, min: 0 }),
        numField("Depth (mm)", handWheel?.depth ?? 200, (v) => setHandWheel({ depth: v }), { step: 10, min: 0 }),
        el("div", { class: "empty small", text: "The cut runs the full width of this cabinet. Height is from the floor, depth is from the back. A wheel arch on the floor plan sets the width." }),
      ]
    ) : [
      el("div", { class: "empty small", text: "Off. Turn it on to cut the back of this cabinet around a wheel arch." }),
    ]),
  ]);

  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: `${mod.label} cabinet` }),
      el("div", { class: "panel-sub", text: `${cab.id} · ${columns.length} column${columns.length === 1 ? "" : "s"} · kick ${Math.round(bch)} · ${result?.boards?.length || 0} boards` }),
      el("div", { class: "panel-sizes" }, [
        ...outerSizeFields(cab, mod, env, p, { logKind: "kitchen.size", columns }),
        numField("BCH (mm)", bch, setKick, { step: 1, min: 0 }),
        benchOn ? el("div", { class: "empty small", text: "Height includes the bench top. A waterfall's 25 mm is inside the width." }) : null,
      ].filter(Boolean)),
    ]),
    shared.board,
    wheelSection,
    frontSection(`Front view · from the room · ${columns.length} column${columns.length === 1 ? "" : "s"}`, [
      el("div", { class: "zs-tools" }, [addColumn, addZone, removeZone, removeColumn, splitBtn]),
      sheetHint,
      front,
      el("div", { class: "zs-hint", text: splitOn
        ? "Drag the blue arrow onto a line between columns. Doors and drawers on that line each keep half the front clearance. Orange lines still set the column width."
        : "Click a cell to select it · click a number under a column to type it (Clearance or Centre to centre) · drag an orange line · Shift = 1 mm" }),
    ]),
    ...(cellCard || []),
    fold,
    shared.grain,
    shared.checks,
    el("div", { class: "panel-foot" }, [shared.remove]),
  ].filter(Boolean));
}
