// Default-mode annotations in the bench's 3D view: a label just outside each
// of the six box faces (position formulas, blue) and a dimension line along
// each axis (size formulas, orange). The dimension lines are 3D; the labels
// are an HTML overlay laid out in screen space every frame, so two labels
// never sit on each other (the two faces of a thin board are a few mm apart).
// Display only: built from the generator result and the placement rule.
import * as THREE from "three";
import { acceptChip, beginFormula, bindFormulaBar } from "./formulaBar.js";

const LINE = { pos: "#4f86e0", drive: "#7fb0ff", size: "#e0a34f" };

function line(points, color) {
  const geo = new THREE.BufferGeometry().setFromPoints(points);
  const l = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
  l.renderOrder = 55;
  return l;
}

/**
 * @param board  generator board (box faces x0..z1)
 * @param labels { faces: { x0: { lines, drive } … }, sizes: { x: { lines } … } }
 * @returns { group: THREE.Group (dimension lines), items: [{ anchor, lines, tone, key }] }
 */
export function buildDefaultAnnotations(board, labels) {
  const group = new THREE.Group();
  group.name = "default-mode-annotations";
  const lo = new THREE.Vector3(board.x0, board.y0, board.z0);
  const hi = new THREE.Vector3(board.x1, board.y1, board.z1);
  const size = hi.clone().sub(lo);
  const center = lo.clone().add(hi).multiplyScalar(0.5);
  const maxDim = Math.max(size.x, size.y, size.z);
  const longest = ["x", "y", "z"].reduce((m, a) => (size[a] > size[m] ? a : m), "x");
  const items = [];
  let n = 0;
  for (const a of ["x", "y", "z"]) {
    for (const side of [0, 1]) {
      const spec = labels.faces[`${a}${side}`];
      if (!spec) continue;
      const anchor = center.clone();
      anchor[a] = side ? hi[a] : lo[a];
      // Faces across the long axis: anchor them at different places along it.
      if (a !== longest) {
        anchor[longest] = lo[longest] + size[longest] * [0.2, 0.8, 0.35, 0.65][n % 4];
        n += 1;
      }
      const out = anchor.clone();
      out[a] += (side ? 1 : -1) * Math.max(60, maxDim * 0.08);
      items.push({ key: `${a}${side}`, anchor, out, lines: spec.lines, tone: spec.drive ? "drive" : "pos", formula: spec.formula || "", editable: spec.editable !== false });
    }
  }
  const gap = Math.max(40, maxDim * 0.07);
  // One dimension per axis, parallel to that axis, offset along a single
  // perpendicular so the line and its two extensions stay axis-aligned.
  // x: in front of the front face. y: out past the left face. z: out past the right face.
  const dims = {
    x: { p0: [lo.x, lo.y - gap, lo.z], p1: [hi.x, lo.y - gap, lo.z], c0: [lo.x, lo.y, lo.z], c1: [hi.x, lo.y, lo.z] },
    y: { p0: [lo.x - gap, lo.y, lo.z], p1: [lo.x - gap, hi.y, lo.z], c0: [lo.x, lo.y, lo.z], c1: [lo.x, hi.y, lo.z] },
    z: { p0: [hi.x + gap, lo.y, lo.z], p1: [hi.x + gap, lo.y, hi.z], c0: [hi.x, lo.y, lo.z], c1: [hi.x, lo.y, hi.z] },
  };
  for (const a of ["x", "y", "z"]) {
    const spec = labels.sizes[a];
    if (!spec) continue;
    const d = dims[a];
    const p0 = new THREE.Vector3(...d.p0);
    const p1 = new THREE.Vector3(...d.p1);
    group.add(line([p0, p1], LINE.size));
    group.add(line([new THREE.Vector3(...d.c0), p0], LINE.size));
    group.add(line([new THREE.Vector3(...d.c1), p1], LINE.size));
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    items.push({ key: `${a}Size`, anchor: mid, out: mid, lines: spec.lines, tone: "size", formula: spec.formula || "", editable: false });
  }
  return { group, items };
}

export function disposeAnnotations(group) {
  if (!group) return;
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) o.material.dispose();
  });
}

const SVG_NS = "http://www.w3.org/2000/svg";

/** The formula line: click the blue label to edit. Chips stay whole; operators are text. */
function formulaLine(overlay, it, edit) {
  const row = document.createElement("div");
  row.className = "l2 formula-chips";
  const eq = document.createElement("span");
  eq.className = "formula-op";
  eq.textContent = "= ";
  const bar = document.createElement("div");
  row.append(eq, bar);
  bindFormulaBar(bar, {
    expr: it.formula || "",
    edit,
    face: it.key,
    dragging: () => !!overlay.dragFromFace?.(),
    onEdit: (on) => { it.editing = on; },
    onDragStart: (e, sym) => overlay.onChipDrag?.(e, { sym, face: it.key }),
    onCommit: (text) => overlay.onCommit?.(it.key, text),
  });
  return row;
}

/** HTML labels over the canvas: placed at their projected point, pushed apart when they collide, leader back to the face. */
export class LabelOverlay {
  constructor(container) {
    this.root = document.createElement("div");
    this.root.className = "anno-overlay";
    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("class", "anno-leaders");
    this.root.append(this.svg);
    container.append(this.root);
    this.items = [];
  }

  set(items) {
    for (const it of this.items) it.el.remove();
    this.svg.replaceChildren();
    this.items = items.map((it) => {
      const el = document.createElement("div");
      el.className = `anno-label ${it.tone}`;
      el.dataset.key = it.key;
      const edit = !!it.editable && it.tone !== "size";
      it.lines.forEach((l, i) => {
        if (i === 1 && it.pieces) {
          el.append(formulaLine(this, it, edit));
          return;
        }
        const d = document.createElement("div");
        d.className = i === 0 ? "l1" : "l2";
        d.textContent = l;
        el.append(d);
      });
      if (edit) {
        el.classList.add("can-edit");
        el.title = "点击编辑这条公式";
        const bar = el.querySelector(".formula-bar");
        el.addEventListener("pointerdown", (e) => {
          if (e.target.closest(".formula-bar, .param-chip")) return;
          e.stopPropagation();
          e.preventDefault();
          beginFormula(bar);
        });
        el.addEventListener("dragover", (e) => acceptChip(bar, e));
        el.addEventListener("dragleave", () => bar.classList.remove("drop"));
        el.addEventListener("drop", (e) => acceptChip(bar, e));
      }
      this.root.append(el);
      const leader = document.createElementNS(SVG_NS, "line");
      leader.setAttribute("class", `anno-leader ${it.tone}`);
      this.svg.append(leader);
      return { ...it, el, leader, w: 0, h: 0 };
    });
    this.root.classList.toggle("hidden", !this.items.length);
  }

  /** @param offset THREE.Vector3 the board group's display offset (explode), added to every anchor */
  update(camera, canvas, offset = null) {
    if (!this.items.length) return;
    const cr = canvas.getBoundingClientRect();
    const pr = this.root.parentElement.getBoundingClientRect();
    const ox = cr.left - pr.left;
    const oy = cr.top - pr.top;
    const W = cr.width;
    const H = cr.height;
    this.svg.setAttribute("width", String(pr.width));
    this.svg.setAttribute("height", String(pr.height));
    const proj = (v) => {
      const p = v.clone();
      if (offset) p.add(offset);
      p.project(camera);
      return { x: ox + ((p.x + 1) / 2) * W, y: oy + ((1 - p.y) / 2) * H, behind: p.z > 1 };
    };
    const boxes = [];
    for (const it of this.items) {
      if (!it.w) { it.w = it.el.offsetWidth; it.h = it.el.offsetHeight; }
      const a = proj(it.anchor);
      const o = proj(it.out);
      // Prefer the label beyond the face (anchor → out direction), its near corner on `out`.
      const dx = o.x - a.x;
      const dy = o.y - a.y;
      let x = dx >= 0 ? o.x + 6 : o.x - it.w - 6;
      let y = dy >= 0 ? o.y + 2 : o.y - it.h - 2;
      if (it.tone === "size") { x = o.x - it.w / 2; y = o.y - it.h / 2; }
      boxes.push({ it, a, x, y });
    }
    // Push apart: top to bottom, each label moves down until it clears the ones already placed.
    boxes.sort((p, q) => p.y - q.y);
    const placed = [];
    for (const b of boxes) {
      if (b.it.tone === "size" || b.it.editing) { placed.push(b); continue; }
      let moved = true;
      let guard = 0;
      while (moved && guard < 40) {
        moved = false;
        guard += 1;
        for (const q of placed) {
          if (b.x < q.x + q.it.w + 4 && b.x + b.it.w + 4 > q.x && b.y < q.y + q.it.h + 3 && b.y + b.it.h + 3 > q.y) {
            b.y = q.y + q.it.h + 3;
            moved = true;
          }
        }
      }
      b.x = Math.max(ox + 2, Math.min(ox + W - b.it.w - 2, b.x));
      b.y = Math.max(oy + 2, Math.min(oy + H - b.it.h - 2, b.y));
      placed.push(b);
    }
    for (const b of placed) {
      const { it, a } = b;
      it.el.style.transform = `translate(${Math.round(b.x)}px, ${Math.round(b.y)}px)`;
      it.el.style.visibility = a.behind ? "hidden" : "visible";
      // Leader from the face to the nearest point of the label box.
      const lx = Math.max(b.x, Math.min(b.x + it.w, a.x));
      const ly = Math.max(b.y, Math.min(b.y + it.h, a.y));
      it.leader.setAttribute("x1", String(a.x));
      it.leader.setAttribute("y1", String(a.y));
      it.leader.setAttribute("x2", String(lx));
      it.leader.setAttribute("y2", String(ly));
      it.leader.style.visibility = a.behind || it.tone === "size" ? "hidden" : "visible";
    }
  }

  /** Label rectangles in overlay pixels (for checks). */
  rects() {
    return this.items.map((it) => {
      const m = /translate\((-?[\d.]+)px, (-?[\d.]+)px\)/.exec(it.el.style.transform) || [0, 0, 0];
      return { key: it.key, x: Number(m[1]), y: Number(m[2]), w: it.w, h: it.h };
    });
  }
}
