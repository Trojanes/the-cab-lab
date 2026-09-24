// Browser (floats over the 3D view, top left, see-through): what
// is in the job, laid out on the three layers of docs/model-spec.md — module (a
// placed cabinet) → board → face — plus partition walls and construction planes.
// It is a browser over
// the generator result (`job.resultFor`), never a second model: nothing here is
// stored. Selecting a board or a face narrows the 3D highlight. Move uses that
// choice: a cabinet row moves the module, a board row moves that board.
import * as job from "./job.js";
import { showContextMenu } from "./benchMenu.js";
import { getModule } from "./modules.js";
import { getSpaceKind } from "./spaces.js";
import { bigFaces, edgeFaces, faceLabel, featureSummary, boardDims } from "./boardModel.js";

const host = document.getElementById("jobTree");
const browser = document.getElementById("browser");

// Expanded rows, by path: "cab-1" · "cab-1/BP" · "cab-1/BP/edges". UI state only, never in the job.
const open = new Set();

// The browser floats over the canvas: its own wheel / pointer events must not reach the 3D view.
for (const type of ["pointerdown", "pointerup", "wheel", "contextmenu", "dblclick"]) {
  browser.addEventListener(type, (e) => {
    e.stopPropagation();
    if (type === "contextmenu") e.preventDefault();
  });
}
browser.querySelector("[data-browser-toggle]").addEventListener("click", (e) => {
  const collapsed = browser.classList.toggle("collapsed");
  e.currentTarget.classList.toggle("open", !collapsed);
});
// The floor plan sheet covers the viewport: step aside while it is open.
const sheet = document.getElementById("floorplan");
if (sheet) {
  const sync = () => browser.classList.toggle("fp-open", !sheet.classList.contains("hidden"));
  new MutationObserver(sync).observe(sheet, { attributes: true, attributeFilter: ["class"] });
  sync();
}

function el(tag, attrs = {}, children = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "text") e.textContent = v;
    else if (k === "style") e.style.cssText = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v === false || v == null) continue;
    else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

/**
 * One row. `depth` indents; `path` (when the row can expand) drives the caret;
 * `selected` marks it; `onpick` runs on a click anywhere but the caret.
 */
function eyeIcon() {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  const outline = document.createElementNS(ns, "path");
  outline.setAttribute("d", "M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z");
  outline.setAttribute("class", "eye-outline");
  const pupil = document.createElementNS(ns, "circle");
  pupil.setAttribute("cx", "8");
  pupil.setAttribute("cy", "8");
  pupil.setAttribute("r", "2");
  pupil.setAttribute("class", "eye-pupil");
  const slash = document.createElementNS(ns, "path");
  slash.setAttribute("d", "M3 13L13 3");
  slash.setAttribute("class", "eye-slash");
  svg.append(outline, pupil, slash);
  return svg;
}

/** Lit = the board is drawn; dark = hidden. The click does not change the selection. */
function eyeButton(shown, onToggle) {
  const b = el("button", {
    class: `tree-eye${shown ? " on" : ""}`,
    title: shown ? "Hide" : "Show",
    onclick: (e) => { e.stopPropagation(); onToggle(); },
  }, [eyeIcon()]);
  return b;
}

function row({ depth, path, hasChildren, label, sub, selected, kind, onpick, title, eye, hidden, oncontextmenu }) {
  const caret = hasChildren
    ? el("button", { class: `tree-caret${open.has(path) ? " open" : ""}`, title: open.has(path) ? "Collapse" : "Expand", onclick: (e) => {
        e.stopPropagation();
        if (open.has(path)) open.delete(path); else open.add(path);
        render();
      } })
    : el("span", { class: "tree-caret none" });
  const r = el("div", {
    class: `tree-row k-${kind}${selected ? " sel" : ""}${hidden ? " is-hidden" : ""}`,
    style: `padding-left:${6 + depth * 12}px`, title, onclick: onpick,
  }, [
    caret,
    eye || null,
    el("span", { class: "tree-label", text: label }),
    sub ? el("span", { class: "tree-sub", text: sub }) : null,
  ]);
  if (oncontextmenu) r.addEventListener("contextmenu", oncontextmenu);
  if (hasChildren) r.addEventListener("dblclick", () => { if (open.has(path)) open.delete(path); else open.add(path); render(); });
  r.dataset.path = path || "";
  return r;
}

function faceRows(cab, b, sub, depth) {
  const out = [];
  const selFace = (f) => sub && sub.boardId === b.id && sub.faceId === f.id;
  for (const f of bigFaces(b)) {
    const bits = [f.id, featureSummary(f), f.visible === false ? "hidden" : null, f.finish?.colour].filter(Boolean);
    out.push(row({
      depth, kind: "face", label: faceLabel(f), sub: bits.join(" · "), selected: selFace(f),
      title: `${b.id}.${f.id} · normal ${typeof f.normal === "string" ? f.normal : "slanted"}`,
      onpick: () => job.select(cab.id, { boardId: b.id, faceId: f.id }),
    }));
  }
  const edges = edgeFaces(b);
  if (edges.length) {
    const tagged = edges.filter((f) => f.features.length);
    const path = `${cab.id}/${b.id}/edges`;
    out.push(row({
      depth, path, hasChildren: true, kind: "edges",
      label: `${edges.length} edges`, sub: tagged.length ? `${tagged.length} tagged` : "",
      selected: sub && sub.boardId === b.id && sub.faceId && sub.faceId.startsWith("E") && !open.has(path),
      onpick: () => { if (!open.has(path)) { open.add(path); render(); } },
    }));
    if (open.has(path)) {
      for (const f of edges) {
        out.push(row({
          depth: depth + 1, kind: "face", label: faceLabel(f),
          sub: [f.id, ...f.features.map((ft) => `${ft.kind}${ft.for ? ` → ${ft.for}` : ""}`)].join(" · "),
          selected: selFace(f), title: `${b.id}.${f.id}`,
          onpick: () => job.select(cab.id, { boardId: b.id, faceId: f.id }),
        }));
      }
    }
  }
  return out;
}

function cabinetRows(cab, selectedId, sub) {
  const mod = getModule(cab.moduleId);
  const result = job.resultFor(cab.id);
  const boards = result?.boards || [];
  const errors = result?.validation?.errors?.length || 0;
  const path = cab.id;
  const isSel = selectedId === cab.id;
  const hiddenIds = new Set(job.hiddenBoardIds(cab));
  const out = [row({
    depth: 1, path, hasChildren: boards.length > 0, kind: "cabinet",
    label: mod.label,
    sub: errors ? `${cab.id} · ${errors} error${errors > 1 ? "s" : ""}` : boards.length ? `${cab.id} · ${boards.length} boards` : `${cab.id} · envelope`,
    selected: isSel && !sub,
    onpick: () => job.select(cab.id),
    oncontextmenu: (e) => {
      e.preventDefault();
      const allHidden = boards.length > 0 && boards.every((b) => hiddenIds.has(b.id));
      const allShown = boards.every((b) => !hiddenIds.has(b.id));
      showContextMenu(e.clientX, e.clientY, [
        { title: mod.label },
        { label: "Show all boards", disabled: !boards.length || allShown, run: () => job.setBoardsVisible(cab.id, true) },
        { label: "Hide all boards", disabled: !boards.length || allHidden, run: () => job.setBoardsVisible(cab.id, false) },
      ]);
    },
  })];
  if (!open.has(path)) return out;
  for (const b of boards) {
    const bpath = `${cab.id}/${b.id}`;
    const d = boardDims(b);
    const faces = b.faces || [];
    const shown = !hiddenIds.has(b.id);
    out.push(row({
      depth: 2, path: bpath, hasChildren: faces.length > 0, kind: "board",
      label: b.name || b.id,
      sub: `${b.id} · ${Math.round(d.L)} × ${Math.round(d.W)} × ${d.T}`,
      selected: isSel && sub && sub.boardId === b.id && !sub.faceId,
      hidden: !shown,
      title: `${b.category} · ${b.boardType} · ${b.stock?.kind || "carcass"} stock`,
      eye: eyeButton(shown, () => job.toggleBoardsVisible(cab.id, [b.id])),
      onpick: () => job.select(cab.id, { boardId: b.id }),
    }));
    if (open.has(bpath)) out.push(...faceRows(cab, b, isSel ? sub : null, 3));
  }
  return out;
}

/** Keep the tree open down to whatever is selected (a click in 3D should be visible here). */
function revealSelection(sub) {
  if (!sub) return;
  open.add(sub.cabId);
  if (sub.faceId) {
    open.add(`${sub.cabId}/${sub.boardId}`);
    if (sub.faceId.startsWith("E")) open.add(`${sub.cabId}/${sub.boardId}/edges`);
  }
}

export function render() {
  if (!host) return;
  const j = job.getJob();
  const selectedId = job.getSelectedId();
  const sub = job.getSubSelection();
  revealSelection(sub);
  const rows = [];

  // No space yet: the viewport shows the "define the space" empty state alone.
  browser.classList.toggle("hidden", !j.space);
  if (!j.space) {
    host.replaceChildren();
  } else {
    const kind = getSpaceKind(j.space.kind);
    rows.push(row({ depth: 0, kind: "space", label: "Space", sub: kind.label, selected: !selectedId, onpick: () => job.select(null) }));
    for (const cab of j.cabinets) rows.push(...cabinetRows(cab, selectedId, sub));
    for (const w of job.getWalls()) {
      const doors = (w.openings || []).length;
      rows.push(row({ depth: 1, kind: "wall", label: "Partition", sub: `${w.id}${doors ? ` · ${doors} door${doors > 1 ? "s" : ""}` : ""}`, selected: selectedId === w.id, onpick: () => job.select(w.id) }));
    }
    for (const p of job.getPlanes()) {
      rows.push(row({ depth: 1, kind: "plane", label: "Plane", sub: `${p.id} · ${p.axis.toUpperCase()} = ${Math.round(p.value)}`, selected: selectedId === p.id, onpick: () => job.select(p.id) }));
    }
    if (!j.cabinets.length && !job.getWalls().length && !job.getPlanes().length) {
      rows.push(el("div", { class: "tree-empty", text: "Nothing placed yet. Pick a module on the left and draw it in the space." }));
    }
  }

  // Rebuild in place, keeping the scroll position; then make sure the selected row is visible.
  const top = host.scrollTop;
  host.replaceChildren(...rows);
  host.scrollTop = top;
  const selKey = `${selectedId || ""}|${sub?.boardId || ""}|${sub?.faceId || ""}`;
  if (selKey !== lastSelKey) {
    lastSelKey = selKey;
    host.querySelector(".tree-row.sel")?.scrollIntoView({ block: "nearest" });
  }
}
let lastSelKey = null;
