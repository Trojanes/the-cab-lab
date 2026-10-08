// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { outlineSpan } from "../sketchBoard.js";
import { startBoardEdit } from "../interact.js";
import { el, section, kv, boardSection, fillDrawer, panel } from "./widgets.js";
export function renderSketchPanel(cab) {
  const result = job.resultFor(cab.id);
  const p = cab.params;
  const span = outlineSpan(p);
  const stock = p.stock || {};
  const name = stock.kind === "door" ? (stock.colour || "Door") : stock.kind === "partition" ? "Partition" : "Carcass";
  const face = stock.kind !== "door" ? ""
    : p.doorSides === "double" ? "colour on both faces"
      : p.colorFace === "sketch" ? "colour on the sketch face" : "colour on the outer face";
  const errors = [...(result?.validation?.errors || [])];
  const warnings = result?.validation?.warnings || [];
  const checks = errors.length || warnings.length
    ? el("div", { class: "panel-section" }, [
      el("div", { class: "sec-title", text: "Checks" }),
      ...errors.map((m) => el("div", { class: "msg err", text: m })),
      ...warnings.map((m) => el("div", { class: "msg warn", text: m })),
    ])
    : null;
  const edit = el("button", { class: "tb", text: "Edit sketch", title: "Open this board's outline on the sketch", onclick: () => startBoardEdit(cab.id) });
  const remove = el("button", { class: "tb danger", text: "Remove board", onclick: () => job.removeCabinet(cab.id) });
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Board" }),
      el("div", { class: "panel-sub", text: cab.id }),
    ]),
    boardSection(),
    section("Sketch", [
      kv("Size", `${Math.round(span.u)} × ${Math.round(span.v)} mm`),
      kv("Stock", `${name} · ${span.t} mm`),
      face ? kv("Colour", face) : null,
    ].filter(Boolean)),
    checks,
    el("div", { class: "panel-foot" }, [edit, remove]),
  ].filter(Boolean));
  fillDrawer(result, errors, warnings);
}
