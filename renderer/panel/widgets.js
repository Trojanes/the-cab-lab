// Panel widget toolkit + shared DOM anchors, extracted from renderer/panel.js.
// Editors import widgets from here; the shell wires repaint() to its renderPanel.
import * as job from "../job.js";
import { log } from "../log.js";
import { faceLabel, featureSummary, featureLine, boardDims, bigFaces, edgeFaces, dirName } from "../boardModel.js";
import { swatchChipStyle } from "../doorSwatches.js";
import { thickness } from "../materials.js";

/** The right panel element every editor repaints into. */
export const panel = document.getElementById("rightpanel");
const drawerChecks = document.querySelector('[data-dpane="checks"]');
const drawerBoards = document.querySelector('[data-dpane="boards"]');

/** Repaint slot — the shell wires this to renderPanel() at init so widget/editor
 *  callbacks never import the shell (no module cycles). */
export let repaint = () => {};
export function wirePanelRepaint(fn) { repaint = fn; }

export function el(tag, attrs = {}, children = []) {
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

/** "Door" row with a swatch chip in front of the colour name. */
export function doorLine(p, fpt) {
  const name = p.doorColorName || p.doorColor || "—";
  const s = swatchChipStyle(name);
  const chip = el("span", {
    class: `swatch${!s ? " none" : s.finish === "metallic" ? " metallic" : ""}`,
    title: s ? s.title : "No swatch yet",
    style: s ? `background-color: ${s.background}${s.image ? `; background-image: url("${s.image}"); background-size: 400%` : ""}` : "",
  });
  return el("div", { class: "kv" }, [el("span", { text: "Door" }), el("b", {}, [chip, fpt == null ? name : `${name} · ${fpt} mm`])]);
}

// --- wood grain (textured HPL) ---------------------------------------------------------

const GRAIN_DIRS = [["horizontal", "Horizontal ═"], ["vertical", "Vertical ‖"]];
const GRAIN_GROUP_LABEL = {
  generalTallCabinet: { front: "Fronts · T1 / B1", side: "Side panels" },
  tallFridgeCabinet: { front: "Fronts · T1 / B1", side: "Side panel" },
  kitchenCabinet: { front: "Fronts · kick" },
  ensuiteCabinet: { front: "Fronts · kick" },
  overheadCabinet: { front: "Flaps · T1" },
  smallCabinet: { front: "Fronts", side: "Door-panel sides" },
  bedroom: { front: "Doors · overhead", side: "Colour panels" },
};
/** Last refused switch, shown under the toggles until the next change: `{ cabId, text }`. */
let grainNote = null;

/** Board issues from the generator as check lines: HPL sheet size (grain) and CNC milling (one face per board). */
export function grainIssueLines(result) {
  return [...(result?.grain?.issues || []), ...(result?.milling?.issues || [])].map((i) => `${i.message}.`);
}

export function setGrain(cab, mod, result, group, dir) {
  const from = result.grain.groups[group];
  if (from === dir) return;
  const next = { ...cab.params, grain: { ...(cab.params.grain || {}), [group]: dir } };
  const bad = (mod.generate(next).grain?.issues || []).filter((i) => i.group === group);
  if (bad.length) {
    grainNote = { cabId: cab.id, text: `Not switched: ${bad[0].message}${bad.length > 1 ? ` (and ${bad.length - 1} more)` : ""}.` };
    log("grain.blocked", { id: cab.id, group, from, to: dir, boards: bad.map((i) => ({ id: i.board, side: i.side, length: i.length, limit: i.limit })) });
    repaint();
    return;
  }
  grainNote = null;
  job.setParams(cab.id, next);
  log("grain.set", { id: cab.id, group, from, to: dir });
}

/** Horizontal / vertical toggle per group; only for textured HPL, only for groups the cabinet has. */
export function grainSection(cab, mod, result) {
  const g = result?.grain;
  if (!g || !g.checked || !g.present?.length) return null;
  const labels = GRAIN_GROUP_LABEL[cab.moduleId] || {};
  const rows = g.present.map((group) => el("label", { class: "field" }, [
    el("span", { text: labels[group] || group }),
    el("div", { class: "seg-group" }, GRAIN_DIRS.map(([dir, text]) => el("button", {
      type: "button",
      class: `tb seg${g.groups[group] === dir ? " active" : ""}`,
      text,
      onclick: () => setGrain(cab, mod, result, group, dir),
    }))),
  ]));
  const note = grainNote && grainNote.cabId === cab.id ? el("div", { class: "msg err", text: grainNote.text }) : null;
  return section("Wood grain", [
    ...rows,
    note,
    el("div", { class: "empty small", text: "Textured HPL comes on 1200 × 2400 sheets: a board may be at most 1180 across the grain and 2380 along it." }),
  ]);
}

export function numField(label, value, onCommit, opts = {}) {
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

/**
 * A number field with a "drag in 3D" toggle: pressing it arms an on-demand arrow
 * handle on the cabinet (cabinets3d.armHandle) for that dimension; pressing again,
 * Esc or a selection change removes it. Typing still works as usual.
 */
export function dragField(label, value, onCommit, cabId, type, title) {
  const field = numField(label, value, onCommit);
  const armed = armedHandleFor(cabId) === type;
  const btn = el("button", { class: `icon drag${armed ? " active" : ""}`, title, text: "⇕", onclick: (e) => {
    e.preventDefault();
    const now = armHandle(cabId, type);
    log("handle.arm", { id: cabId, handle: type, on: !!now });
    repaint();
  } });
  field.classList.add("with-drag");
  field.append(btn);
  return field;
}

export function section(title, children) {
  return el("div", { class: "panel-section" }, [el("div", { class: "sec-title", text: title }), ...children]);
}

/** One choice for every front elevation: clearance between faces, or centre line to centre line. */
export let gapMode = "clear";
export function gapSelect() {
  return el("select", {
    class: "gap-mode",
    title: "Distance shown between boards",
    onchange: (e) => { gapMode = e.target.value; repaint(); },
  }, [
    el("option", { value: "clear", text: "Clearance", selected: gapMode === "clear" }),
    el("option", { value: "center", text: "Centre to centre", selected: gapMode === "center" }),
  ]);
}
export function frontSection(title, children) {
  return el("div", { class: "panel-section" }, [
    el("div", { class: "sec-head" }, [el("div", { class: "sec-title", text: title }), gapSelect()]),
    ...children,
  ]);
}
export const kv = (label, value) => el("div", { class: "kv" }, [el("span", { text: label }), el("b", { text: value })]);

/**
 * Read-out for the board / face selected inside the cabinet (tree or a second click in 3D).
 * Read only: boards and faces are regenerated from the cabinet's params; nothing here edits them.
 */
export function boardSection() {
  const sub = job.getSubSelection();
  if (!sub) return null;
  const b = sub.board;
  const d = boardDims(b);
  const f = sub.face;
  const back = el("button", { class: "tb", text: f ? `‹ Board ${b.id}` : "‹ Cabinet", title: "Back up one level (Esc)", onclick: () => job.select(sub.cabId, f ? { boardId: b.id } : null) });
  const rows = [
    el("div", { class: "kv" }, [el("span", { text: "Path" }), el("b", { text: `${sub.cabId} › ${b.id}${f ? ` › ${f.id}` : ""}` })]),
    kv("Board", `${b.name} · ${b.id}`),
    kv("Size (L × W × T)", `${Math.round(d.L)} × ${Math.round(d.W)} × ${d.T} mm`),
    kv("Stock", `${b.stock?.kind || b.category}${b.stock?.colour ? ` · ${b.stock.colour}` : ""} · ${b.materialThickness} mm`),
    kv("Lies in", `${b.profilePlane} · thickness along ${b.thicknessAxis}`),
  ];
  if (f) {
    rows.push(
      kv("Face", `${faceLabel(f)} · ${f.id}`),
      kv("Looks", typeof f.normal === "string" ? `${f.normal} (${dirName(f.normal)})` : "slanted"),
      f.visible != null ? kv("After assembly", f.visible ? "visible" : "hidden") : null,
      f.finish?.colour ? kv("Colour", f.finish.colour) : null,
      f.finish?.edgeBand ? kv("Edge band", `${f.finish.edgeBand.thickness} mm${f.finish.edgeBand.colour ? ` · ${f.finish.edgeBand.colour}` : ""}`) : null,
    );
    if (f.features.length) {
      rows.push(el("div", { class: "sec-title", style: "margin-top:8px", text: `Machined into it (${f.features.length})` }));
      for (const ft of f.features) rows.push(el("div", { class: "empty small mono", text: featureLine(ft) }));
    } else {
      rows.push(el("div", { class: "empty small", text: f.id.startsWith("E") ? "Plain edge." : "Nothing machined into this face." }));
    }
  } else {
    const faces = b.faces || [];
    if (faces.length) {
      for (const bf of bigFaces(b)) {
        const bits = [bf.id, featureSummary(bf), bf.finish?.colour].filter(Boolean).join(" · ");
        rows.push(el("div", { class: "kv link", onclick: () => job.select(sub.cabId, { boardId: b.id, faceId: bf.id }) }, [el("span", { text: faceLabel(bf) }), el("b", { text: bits })]));
      }
      const edges = edgeFaces(b);
      const tagged = edges.filter((e) => e.features.length);
      rows.push(kv(`${edges.length} edges`, tagged.length ? tagged.map((e) => `${e.id} ${e.features.map((t) => t.kind).join("/")}`).join(", ") : "plain"));
    } else {
      rows.push(el("div", { class: "empty small", text: "This generator does not describe faces yet." }));
    }
  }
  // Grooves drawn with the Groove command: kept on the cabinet, listed and removable here.
  const cab = job.getJob().cabinets.find((c) => c.id === sub.cabId);
  const mine = job.boardGrooves(cab, b.id).filter((g) => !f || g.face === f.id);
  rows.push(el("div", { class: "sec-title", style: "margin-top:8px", text: `Your grooves (${mine.length})` }));
  for (const g of mine) {
    const w = Math.round((g.u1 - g.u0) * 10) / 10;
    const h = Math.round((g.v1 - g.v0) * 10) / 10;
    rows.push(el("div", { class: "groove-row" }, [
      el("span", { text: `${g.id} · ${g.kind === "tgroove" ? `T groove ${g.group || ""}` : "groove"} · face ${g.face} · ${w} × ${h} · ${g.depth} deep` }),
      el("button", { class: "tb", text: "×", title: "Remove this groove", onclick: () => removeGroove(sub.cabId, b.id, g.id) }),
    ]));
  }
  rows.push(el("button", { class: "tb wide", text: "Add groove… (G)", onclick: () => startGroove() }));
  rows.push(el("div", { class: "empty small", text: "Generated from the cabinet's parameters — change a size or a zone and the board follows. Esc climbs back up." }));
  return el("div", { class: "panel-section sub-sel" }, [
    el("div", { class: "sec-head" }, [el("div", { class: "sec-title", text: f ? "Face" : "Board" }), back]),
    ...rows.filter(Boolean),
  ]);
}

export function fillDrawer(result, errors, warnings) {
  drawerChecks.replaceChildren(
    errors.length || warnings.length
      ? el("div", {}, [
          ...errors.map((m) => el("div", { class: "msg err", text: m })),
          ...warnings.map((m) => el("div", { class: "msg warn", text: m })),
        ])
      : el("div", { class: "empty ok", text: "All checks passed." }),
  );

  const boards = result?.boards || [];
  const sub = job.getSubSelection();
  const cabId = job.getSelectedId();
  drawerBoards.replaceChildren(
    boards.length
      ? el("table", { class: "grid pick" }, [
          el("thead", {}, [el("tr", {}, ["ID", "Name", "Type", "L (mm)", "W (mm)", "T (mm)", "Faces"].map((h) => el("th", { text: h })))]),
          el("tbody", {}, boards.map((b) => {
            const d = boardDims(b);
            const feats = (b.faces || []).reduce((n, f) => n + f.features.length, 0);
            // Same selection as the tree and the 3D view: one click = this board.
            return el("tr", { class: sub && sub.boardId === b.id ? "sel" : "", onclick: () => job.select(cabId, { boardId: b.id }) }, [
              el("td", { text: b.id }), el("td", { text: b.name }), el("td", { text: b.boardType }),
              el("td", { text: d.L.toFixed(1) }), el("td", { text: d.W.toFixed(1) }), el("td", { text: String(d.T) }),
              el("td", { text: b.faces ? `${b.faces.length}${feats ? ` · ${feats} feat.` : ""}` : "—" }),
            ]);
          })),
        ])
      : el("div", { class: "empty", text: "No boards — fix the checks first." }),
  );
}
