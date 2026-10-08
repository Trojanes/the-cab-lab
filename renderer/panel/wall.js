// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { openFloorPlan } from "../floorplan.js";
import { DOOR_CLEAR_DEPTH, OPENING_MIN_WIDTH, OPENING_TYPES, SHEET_LONG_MM, SHEET_SHORT_MM, SLIDING_FLOOR_GAP, SLIDING_GAP, cabinetBlocksOpening, pelmetCover, wallBoards, wallLength, wallOrientation } from "../walls.js";
import { envelopeFootprint, overlaps, statusOf } from "../fit.js";
import { partitionClearance, thickness } from "../materials.js";
import { el, numField, section, kv, panel, drawerChecks, drawerBoards, controlPanelRows } from "./widgets.js";
function doorBlockers(w, s) {
  const out = [];
  for (const o of s.openings) {
    for (const cab of job.getJob().cabinets) {
      const fp = envelopeFootprint(cab, cab.pose);
      const box = { x: [fp.minX, fp.maxX], y: [fp.minY, fp.maxY], z: [fp.z0, fp.z1] };
      if (cabinetBlocksOpening(box, s, o)) out.push(`${cab.id} blocks the ${(OPENING_TYPES[o.type] || "door").toLowerCase()} ${o.id} in ${w.id} (within ${DOOR_CLEAR_DEPTH} mm).`);
    }
  }
  return out;
}

export function renderWall(w) {
  const st = statusOf(w);
  const s = st.solid;
  const cut = wallBoards(w, job.getSpace(), job.getStock());
  const sheetIssues = cut.issues || [];
  const jointWarnings = cut.warnings || [];
  const stock = job.getStock();
  const cl = partitionClearance(stock);
  const blocked = [...(st.warnings || []), ...doorBlockers(w, s)];
  const along = s.along.toUpperCase();
  const across = w.axis.toUpperCase();
  const anchorText = (a) => a || "free";
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Partition wall" }),
      el("div", { class: "panel-sub", text: `${w.id} · ${wallOrientation(w)}${w.hidden ? " · hidden" : ""}` }),
    ]),
    section("Geometry", [
      el("div", { class: "kv" }, [el("span", { text: "Length" }), el("b", { text: `${Math.round(wallLength(w))} mm` })]),
      el("div", { class: "kv" }, [el("span", { text: `From ${along}` }), el("b", { text: `${Math.round(w.u0)}` })]),
      el("div", { class: "kv" }, [el("span", { text: `To ${along}` }), el("b", { text: `${Math.round(w.u1)}` })]),
      el("div", { class: "kv" }, [el("span", { text: `Reference face ${across}` }), el("b", { text: `${Math.round(w.at)} · grows ${w.side > 0 ? "+" : "−"}${across}` })]),
      el("div", { class: "kv" }, [el("span", { text: `Faces ${across}` }), el("b", { text: `${Math.round(w.axis === "x" ? s.x0 : s.y0)} … ${Math.round(w.axis === "x" ? s.x1 : s.y1)}` })]),
      el("div", { class: "kv" }, [el("span", { text: "Rests on" }), el("b", { text: `${anchorText(st.anchors.lo)} / ${anchorText(st.anchors.hi)}` })]),
      cut.split
        ? el("div", { class: "kv" }, [el("span", { text: cut.split.axis === "z" ? "Horizontal cut" : "Vertical cut" }), el("b", { text: `${Math.round(cut.split.at)} mm` })])
        : el("div", { class: "kv" }, [el("span", { text: "Boards" }), el("b", { text: `1 · fits ${SHEET_SHORT_MM} × ${SHEET_LONG_MM}` })]),
      el("div", { class: "empty small", text: cut.split
        ? "Drag the yellow bar on the wall to move the cut. Shift = 1 mm. The two boards butt together. A piece past 1200 × 2400 is marked red."
        : "This wall fits on one 1200 × 2400 board." }),
    ]),
    w.fit ? section("Fit to cabinets", [
      el("div", { class: "kv" }, [el("span", { text: "Overhead" }), el("b", { text: w.fit.overheadId })]),
      el("div", { class: "kv" }, [el("span", { text: "Base" }), el("b", { text: w.fit.kitchenId })]),
      s.fitSteps ? el("div", { class: "kv" }, [el("span", { text: "Overhead depth" }), el("b", { text: `${Math.round(s.fitSteps.overheadDepth)} mm · bottom ${Math.round(s.fitSteps.overheadBottom)}` })]) : null,
      s.fitSteps ? el("div", { class: "kv" }, [el("span", { text: "Neck" }), el("b", { text: `${Math.round(s.fitSteps.neckDepth)} mm deep` })]) : null,
      s.fitSteps ? el("div", { class: "kv" }, [el("span", { text: "Base depth" }), el("b", { text: `${Math.round(s.fitSteps.kitchenDepth)} mm · top ${Math.round(s.fitSteps.kitchenTop)}` })]) : null,
      numField("Corner radius", w.fit.radius ?? 50, (v) => job.setWallFit(w.id, { overheadId: w.fit.overheadId, kitchenId: w.fit.kitchenId, radius: Math.max(0, v) }, "radius"), { step: 1, min: 0 }),
      el("div", { class: "empty small", text: "Upper depth is the overhead plus 20. Its lower edge is 15 mm below the door, and the door hangs 30 mm below the carcass. The gap between the steps is 100 deep. The base step is 50 above the base and 30 deeper than its total depth. The four step corners are real arcs of this radius." }),
      el("button", { class: "tb", text: "Clear cabinet fit", onclick: () => job.setWallFit(w.id, null, "clear") }),
    ].filter(Boolean)) : null,
    section(`Control panels (${(w.controlPanels || []).length})`, controlPanelRows(w.id, w.controlPanels || [], { host: "wall", canAdd: true })),
    section("Stock (from the job catalogue)", [
      el("div", { class: "kv" }, [el("span", { text: "Thickness" }), el("b", { text: `${s.thickness} mm · Partition` })]),
      el("div", { class: "kv" }, [el("span", { text: "Bottom" }), el("b", { text: `${cl.floor} mm above the floor` })]),
      el("div", { class: "kv" }, [el("span", { text: "Top" }), el("b", { text: `${Math.round(s.zTopMin)}${Math.abs(s.z1 - s.zTopMin) > 0.5 ? ` … ${Math.round(s.z1)}` : ""} (roof − ${cl.ceiling})` })]),
      el("div", { class: "empty small", text: "Thickness and clearances follow the Partition stock in the space dialog; every wall changes together." }),
    ]),
    section(`Doors (${(w.openings || []).length})`, [
      ...(w.openings || []).length
        ? s.openings.map((o) => {
            const sliding = o.type === "slidingDoor";
            const leaf = sliding ? (st.parts || []).find((p) => p.opId === o.id && p.part === "leaf") : null;
            const pelmet = sliding ? (st.parts || []).find((p) => p.opId === o.id && p.part === "pelmet") : null;
            const sideName = sliding ? (w.axis === "x" ? (o.side > 0 ? "right" : "left") : (o.side > 0 ? "back" : "front")) : null;
            return el("div", { class: "opening" }, [
              el("div", { class: "opening-head" }, [
                el("b", { text: o.id }),
                el("span", { text: `${OPENING_TYPES[o.type] || "Door"} · ${along} ${Math.round(o.u0)} … ${Math.round(o.u1)} · from the ${o.from === "lo" ? (s.along === "x" ? "left" : "front") : (s.along === "x" ? "right" : "back")} end` }),
                el("button", { class: "icon", text: "×", title: "Remove this door", onclick: () => job.removeOpening(w.id, o.id) }),
              ]),
              numField("Offset from end", o.offset, (v) => job.setOpening(w.id, o.id, { offset: v }), { step: 10, min: 0 }),
              numField("Width", o.width, (v) => job.setOpening(w.id, o.id, { width: v }), { step: 10, min: OPENING_MIN_WIDTH }),
              sliding ? null : numField("Bottom clearance", o.bottom, (v) => job.setOpening(w.id, o.id, { bottom: v }), { step: 10, min: 0 }),
              numField(sliding ? "Top clearance (pelmet height)" : "Top clearance", o.top, (v) => job.setOpening(w.id, o.id, { top: v }), { step: 10, min: 0 }),
              el("div", { class: "kv" }, [el("span", { text: "Hole" }), el("b", { text: `${Math.round(o.zBottom)} … ${Math.round(o.zTop)} high` })]),
              ...(sliding
                ? [
                    numField("Leaf wider by", o.overlap, (v) => job.setOpening(w.id, o.id, { overlap: v }), { step: 10, min: 0 }),
                    numField("Leaf height", o.doorHeight, (v) => job.setOpening(w.id, o.id, { doorHeight: v }), { step: 10, min: 1 }),
                    el("div", { class: "kv" }, [
                      el("span", { text: "Hangs on" }),
                      el("b", { text: `${sideName} side` }),
                      el("button", { class: "tb", text: "Flip", title: "Hang the door on the other face of the wall", onclick: () => job.setOpening(w.id, o.id, { side: -o.side }) }),
                    ]),
                    leaf ? el("div", { class: "kv" }, [el("span", { text: "Leaf" }), el("b", { text: `${Math.round(leaf.length)} × ${Math.round(o.doorHeight)} · ${SLIDING_GAP} off the wall · ${SLIDING_FLOOR_GAP} off the floor` })]) : null,
                    pelmet ? el("div", { class: "kv" }, [el("span", { text: "Pelmet" }), el("b", { text: `${Math.round(pelmet.length)} × ${Math.round(pelmet.height)} · ${pelmet.stoppedBy.lo} → ${pelmet.stoppedBy.hi}` })]) : null,
                    leaf && pelmet ? el("div", { class: "kv" }, [el("span", { text: "Covers the leaf top by" }), el("b", { text: `${Math.round(pelmetCover(leaf, pelmet))} mm` })]) : null,
                    el("div", { class: "empty small", text: "Leaf and pelmet are Partition stock, derived from this record: the hole goes to the floor; the pelmet sits against the roof and runs until the space or another partition stops it." }),
                  ]
                : []),
            ]);
          })
        : [el("div", { class: "empty small", text: "No door yet. In the floor plan pick Shower door (D) or Sliding door (S): click an end of this wall, the door's first edge, its other edge (then the side it hangs on), then the numbers." })],
    ]),
    st.issues.length || sheetIssues.length || blocked.length || jointWarnings.length
      ? el("div", { class: "panel-section" }, [
          el("div", { class: "sec-title", text: "Checks" }),
          ...st.issues.map((m) => el("div", { class: "msg err", text: m })),
          ...sheetIssues.map((m) => el("div", { class: "msg err", text: m })),
          ...blocked.map((m) => el("div", { class: "msg warn", text: m })),
          ...jointWarnings.map((m) => el("div", { class: "msg warn", text: m })),
        ])
      : null,
    el("div", { class: "panel-section" }, [
      el("div", { class: "empty small", text: "Walls and doors are drawn and re-drawn in the floor plan (button at the top right of the 3D view). Delete removes this wall." }),
      el("button", { class: "tb wide", text: "Open floor plan…", onclick: () => openFloorPlan("panel") }),
    ]),
    el("div", { class: "panel-foot" }, [
      el("button", { class: "tb danger", text: "Remove wall", onclick: () => job.removeWall(w.id) }),
    ]),
  ].filter(Boolean));
  const wallErr = [...st.issues, ...sheetIssues];
  const wallWarn = [...blocked, ...jointWarnings];
  drawerChecks.replaceChildren(
    wallErr.length || wallWarn.length
      ? el("div", {}, [...wallErr.map((m) => el("div", { class: "msg err", text: m })), ...wallWarn.map((m) => el("div", { class: "msg warn", text: m }))])
      : el("div", { class: "empty ok", text: "Wall rests on a wall, stays inside the space and overlaps nothing." }),
  );
  drawerBoards.replaceChildren(
    cut.boards.length
      ? el("table", { class: "grid" }, [
          el("thead", {}, [el("tr", {}, ["ID", "Name", "Length", "Height", "Sheet"].map((h) => el("th", { text: h })))]),
          el("tbody", {}, cut.boards.map((b) => el("tr", {}, [
            el("td", { text: b.id }),
            el("td", { text: b.name }),
            el("td", { text: `${Math.round(b.length)}` }),
            el("td", { text: `${Math.round(b.height)}` }),
            el("td", { text: b.fits ? `${SHEET_SHORT_MM} × ${SHEET_LONG_MM}` : "over" }),
          ]))),
        ])
      : el("div", { class: "empty", text: "No boards." }),
  );
}

/** Which page the panel is showing. A board / face pick stays on the same page, so it does not slide. */
