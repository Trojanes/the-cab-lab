// L3: one board flattened in its profile plane, as SVG. Every outline vertex,
// bounding-box corner and hinge hole is a pickable point that knows the
// provenance keys of its two coordinates. Display only.
import { boardOutline } from "../boardGeom.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, attrs = {}, children = []) {
  const e = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") e.setAttribute("class", v);
    else if (k === "text") e.textContent = v;
    else e.setAttribute(k, String(v));
  }
  for (const c of children) if (c) e.append(c);
  return e;
}

/** Axis letters for a plane: the two in-plane axes, thickness axis last. */
export function planeAxes(plane) {
  if (plane === "YZ") return ["y", "z", "x"];
  if (plane === "XZ") return ["x", "z", "y"];
  return ["x", "y", "z"];
}

/**
 * Points of a board in both frames.
 *   { kind: "outline"|"corner"|"feature", label, keys: [keyA, keyB], local: [a, b], cabinet: [a, b] }
 * local = the generator's own numbers (cutProfileVector / profileVector as emitted, features as emitted);
 * cabinet = where the point sits in the cabinet frame (what the 3D view draws).
 */
export function boardPoints(board, prov, features = []) {
  const [A, B] = planeAxes(board.profilePlane);
  const id = board.id;
  const pts = [];
  const a0 = board[`${A}0`];
  const b0 = board[`${B}0`];
  const has = (k) => !!(prov && prov.entries && prov.entries[k]);

  if (board.profilePlane === "YZ" && board.cutProfileVector && board.cutProfileVector.length) {
    board.cutProfileVector.forEach((p, i) => {
      pts.push({
        kind: "outline",
        label: `P${i}`,
        keys: [`${id}.cut[${i}].y`, `${id}.cut[${i}].z`],
        local: [p.y, p.z],
        cabinet: [board.y0 + p.y, board.z0 + p.z],
      });
    });
  } else if (board.profileVector && board.profileVector.length) {
    const aligned = boardOutline(board) || [];
    board.profileVector.forEach((p, i) => {
      const q = aligned[i] || {};
      pts.push({
        kind: "outline",
        label: `P${i}`,
        keys: [`${id}.pv[${i}].${A}`, `${id}.pv[${i}].${B}`],
        local: [Number(p[A]), Number(p[B])],
        cabinet: [q[A] != null ? q[A] : a0 + Number(p[A]), q[B] != null ? q[B] : b0 + Number(p[B])],
      });
    });
  }

  // Bounding-box corners: local frame has the board's minimum at the origin
  // (matches cutProfileVector / aligned outlines); cabinet frame is the faces.
  const corners = [
    [`${A}0`, `${B}0`], [`${A}1`, `${B}0`], [`${A}1`, `${B}1`], [`${A}0`, `${B}1`],
  ];
  for (const [fa, fb] of corners) {
    pts.push({
      kind: "corner",
      label: `${fa}·${fb}`,
      keys: [`${id}.${fa}`, `${id}.${fb}`],
      local: [board[fa] - a0, board[fb] - b0],
      cabinet: [board[fa], board[fb]],
    });
  }

  for (const f of features) {
    if (!f) continue;
    if (f.purpose === "hinge" && f.boardId === id && f.center) {
      const n = String(f.id).replace(`${id}_`, "");
      const kx = `${id}.feat.${n}.x`;
      const kz = `${id}.feat.${n}.z`;
      pts.push({
        kind: "feature",
        label: n.replace("HINGE_", "hinge "),
        keys: [has(kx) ? kx : null, has(kz) ? kz : null],
        local: [f.center[0], f.center[1]],
        cabinet: [a0 + f.center[0], b0 + f.center[1]],
        radius: (f.diameter || 35) / 2,
      });
    }
  }

  // Face-layer holes (A / B faces, face-local = board-local): screw pilots, cups not already listed above.
  const seen = new Set(pts.flatMap((p) => p.keys.filter(Boolean)));
  for (const face of board.faces || []) {
    if (face.id !== "A" && face.id !== "B") continue;
    for (const f of face.features) {
      if (f.kind !== "hole" || !f.center) continue;
      const ka = f.key ? `${f.key}.${A}` : null;
      const kb = f.key ? `${f.key}.${B}` : null;
      if ((ka && seen.has(ka)) || pts.some((p) => p.local[0] === f.center[0] && p.local[1] === f.center[1] && p.kind === "feature")) continue;
      pts.push({
        kind: "feature",
        label: `${face.id} · ${f.id.replace(`${id}_`, "")}`,
        keys: [has(ka) ? ka : null, has(kb) ? kb : null],
        local: [f.center[0], f.center[1]],
        cabinet: [a0 + f.center[0], b0 + f.center[1]],
        radius: (f.diameter || 3) / 2,
        face: face.id,
      });
    }
  }
  return pts;
}

/** Rectangles to draw on the board (grooves, cutouts), in the local frame [a0, a1, b0, b1]. */
function featureRects(board, features) {
  const rects = [];
  const id = board.id;
  const [A, B] = planeAxes(board.profilePlane);
  // Face layer first: every groove / T-groove / cutout on A or B is already face-local.
  if (board.faces && board.faces.length) {
    for (const face of board.faces) {
      if (face.id !== "A" && face.id !== "B") continue;
      for (const f of face.features) {
        if (!Number.isFinite(f.u0) || !Number.isFinite(f.v0)) continue;
        rects.push({ label: `${face.id} · ${f.id.replace(`${id}_`, "")}`, a0: f.u0, a1: f.u1, b0: f.v0, b1: f.v1 });
      }
    }
    return rects;
  }
  for (const f of features) {
    if (!f) continue;
    if (f.type === "t3_groove" && f.targetBoardId === id && f.main) {
      rects.push({ label: "LED main", a0: f.main.x0, a1: f.main.x1, b0: f.main.y0, b1: f.main.y1 });
      for (const [i, br] of (f.branches || []).entries()) rects.push({ label: `LED branch ${i + 1}`, a0: br.x0, a1: br.x1, b0: br.y0, b1: br.y1 });
    }
    if (f.type === "rangehood_bp_cutout" && f.targetBoardId === id && f.x && f.y) {
      rects.push({ label: "rangehood cutout", a0: f.x[0] - board.x0, a1: f.x[1] - board.x0, b0: f.y[0] - board.y0, b1: f.y[1] - board.y0 });
    }
    if (f.bp_groove && id === "BP" && f.bp_groove.x && f.bp_groove.y) {
      const g = f.bp_groove;
      rects.push({ label: g.id, a0: g.x[0] - board.x0, a1: g.x[1] - board.x0, b0: g.y[0] - board.y0, b1: g.y[1] - board.y0 });
    }
  }
  void A; void B;
  return rects;
}

/**
 * Render the board into `container`. Options:
 *   frame: "local" | "cabinet"
 *   selectedKey: a provenance key to highlight (any point that owns it)
 *   labels: show point labels
 *   tryout: { key, value } → dashed marker where the point would move
 *   onPick(point)
 */
export function renderBoard2D(container, { board, prov, features = [], frame = "local", selectedKey = null, labels = true, tryout = null, onPick }) {
  container.replaceChildren();
  if (!board) return;
  const [A, B, T] = planeAxes(board.profilePlane);
  const pts = boardPoints(board, prov, features);
  const outline = pts.filter((p) => p.kind === "outline");
  const use = (p) => (frame === "cabinet" ? p.cabinet : p.local);

  // Extent from everything we draw.
  const all = pts.map(use);
  const a0 = board[`${A}0`], a1 = board[`${A}1`], b0 = board[`${B}0`], b1 = board[`${B}1`];
  const bbox = frame === "cabinet" ? [a0, a1, b0, b1] : [0, a1 - a0, 0, b1 - b0];
  all.push([bbox[0], bbox[2]], [bbox[1], bbox[3]]);
  const minA = Math.min(...all.map((p) => p[0]));
  const maxA = Math.max(...all.map((p) => p[0]));
  const minB = Math.min(...all.map((p) => p[1]));
  const maxB = Math.max(...all.map((p) => p[1]));
  const spanA = Math.max(maxA - minA, 1);
  const spanB = Math.max(maxB - minB, 1);
  const pad = Math.max(spanA, spanB) * 0.12 + 20;

  const w = container.clientWidth || 800;
  const h = container.clientHeight || 500;
  const svg = el("svg", { viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: "xMidYMid meet" });
  const scale = Math.min((w - 2 * pad) / spanA, (h - 2 * pad) / spanB);
  const X = (a) => pad + (a - minA) * scale + ((w - 2 * pad) - spanA * scale) / 2;
  const Y = (b) => h - pad - (b - minB) * scale - ((h - 2 * pad) - spanB * scale) / 2;
  const r = Math.max(3.5, Math.min(6, scale * 4));

  // Bounding box (dashed) and outline (filled).
  svg.append(el("rect", {
    class: "b2d-bbox", x: X(bbox[0]), y: Y(bbox[3]), width: (bbox[1] - bbox[0]) * scale, height: (bbox[3] - bbox[2]) * scale,
  }));
  if (outline.length >= 3) {
    const d = outline.map((p, i) => `${i ? "L" : "M"}${X(use(p)[0])} ${Y(use(p)[1])}`).join(" ") + " Z";
    svg.append(el("path", { class: `b2d-outline${board.category === "front_panel" ? " front" : ""}`, d }));
  } else {
    svg.append(el("rect", {
      class: `b2d-outline${board.category === "front_panel" ? " front" : ""}`,
      x: X(bbox[0]), y: Y(bbox[3]), width: (bbox[1] - bbox[0]) * scale, height: (bbox[3] - bbox[2]) * scale,
    }));
  }

  // Feature rectangles.
  const offA = frame === "cabinet" ? a0 : 0;
  const offB = frame === "cabinet" ? b0 : 0;
  for (const rc of featureRects(board, features)) {
    svg.append(el("rect", {
      class: "b2d-bbox", x: X(rc.a0 + offA), y: Y(rc.b1 + offB), width: (rc.a1 - rc.a0) * scale, height: (rc.b1 - rc.b0) * scale,
    }));
    svg.append(el("text", { class: "b2d-lbl", x: X(rc.a0 + offA) + 3, y: Y(rc.b1 + offB) + 10, text: rc.label }));
  }

  // Dimension lines: overall A and B.
  const dimY = Y(bbox[2]) + 22;
  svg.append(el("line", { class: "b2d-dim", x1: X(bbox[0]), y1: dimY, x2: X(bbox[1]), y2: dimY }));
  svg.append(el("text", { class: "b2d-dimtxt", x: (X(bbox[0]) + X(bbox[1])) / 2, y: dimY - 3, "text-anchor": "middle", text: `${fmt(bbox[1] - bbox[0])} (${A})` }));
  const dimX = X(bbox[1]) + 22;
  svg.append(el("line", { class: "b2d-dim", x1: dimX, y1: Y(bbox[2]), x2: dimX, y2: Y(bbox[3]) }));
  svg.append(el("text", {
    class: "b2d-dimtxt", x: dimX + 4, y: (Y(bbox[2]) + Y(bbox[3])) / 2, "text-anchor": "start", "dominant-baseline": "middle", text: `${fmt(bbox[3] - bbox[2])} (${B})`,
  }));
  svg.append(el("text", { class: "b2d-axis", x: 8, y: h - 8, text: `${board.id} · plane ${board.profilePlane} · thickness along ${T.toUpperCase()} = ${fmt(board.materialThickness)} · frame: ${frame}` }));

  // Points.
  for (const p of pts) {
    const [pa, pb] = use(p);
    const sel = selectedKey && p.keys.includes(selectedKey);
    const g = el("g");
    if (p.kind === "feature" && p.radius) {
      g.append(el("circle", { class: "b2d-bbox", cx: X(pa), cy: Y(pb), r: p.radius * scale }));
    }
    const c = el("circle", { class: `b2d-pt ${p.kind}${sel ? " sel" : ""}`, cx: X(pa), cy: Y(pb), r: sel ? r + 1.5 : r });
    c.addEventListener("click", (e) => { e.stopPropagation(); onPick && onPick(p); });
    c.append(el("title", { text: `${p.label}  ${A} ${fmt(pa)} · ${B} ${fmt(pb)}` }));
    g.append(c);
    if (labels && (p.kind !== "corner" || sel)) {
      g.append(el("text", { class: `b2d-lbl${sel ? " sel" : ""}`, x: X(pa) + r + 3, y: Y(pb) - r - 1, text: p.label }));
    }
    svg.append(g);
  }

  // Tryout marker: the point that owns `tryout.key`, moved along that axis.
  if (tryout && Number.isFinite(tryout.value)) {
    const owner = pts.find((p) => p.keys.includes(tryout.key));
    if (owner) {
      const [pa, pb] = use(owner);
      const axisIndex = owner.keys.indexOf(tryout.key);
      // The tryout value is in the frame the key is recorded in (local for cut/pv points, cabinet for faces).
      const delta = tryout.value - (owner.kind === "corner" ? owner.cabinet[axisIndex] : owner.local[axisIndex]);
      const na = axisIndex === 0 ? pa + delta : pa;
      const nb = axisIndex === 1 ? pb + delta : pb;
      svg.append(el("line", { class: "b2d-try", x1: X(pa), y1: Y(pb), x2: X(na), y2: Y(nb) }));
      svg.append(el("circle", { class: "b2d-try", cx: X(na), cy: Y(nb), r: r + 2 }));
      svg.append(el("text", { class: "b2d-lbl sel", x: X(na) + r + 4, y: Y(nb) + 12, text: `try ${fmt(tryout.value)}` }));
    }
  }

  svg.addEventListener("click", () => onPick && onPick(null));
  container.append(svg);
}

function fmt(v) {
  if (!Number.isFinite(v)) return "—";
  const r = Math.round(v * 100) / 100;
  return String(r);
}
