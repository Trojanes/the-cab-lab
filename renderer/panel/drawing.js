// @module panel @owns renderDrawing — ensuite "as drawn" fixed cabinet card
// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { el, kv, section, panel } from "./widgets.js";
// --- ensuite "as drawn" -----------------------------------------------------------------
//
// A fixed copy of the Fusion cabinet: nothing to edit. The card says what it is
// and what it holds (board counts, the cavity layout, drawing corrections).

/** Ensuite as drawn: a fixed copy of the Fusion cabinet. Nothing to edit; it says what it is and what it holds. */
export function renderDrawing(cab, mod, result, { checks, remove, board }) {
  const env = mod.envelope(cab.params);
  const rp = result?.params || {};
  const boards = result?.boards || [];
  const count = (kind) => boards.filter((b) => b.stock?.kind === kind).length;
  const about = mod.part === "tall"
    ? "A lid at 383–398 over the cavity (worked out from the other boards: the STEP has no body for it — check it). Above it, 398–697 sits behind a fixed panel with a 427 × 200 R30 access opening; the base top is at 697. All four stiles stand on the lid at 398; below 398 the right side panel keeps only its front strip. The left side has no panel: an 80 filler stands there (the wall side). Two doors above."
    : "Left bay: a lid at 383–398 over the cavity; below it the left side panel keeps only its front strip and the back stile stops at 398. Right bay: open to the floor. Two doors.";
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: mod.label }),
      el("div", { class: "panel-sub", text: `${cab.id} · as drawn · ${boards.length} boards` }),
    ]),
    board,
    section("Size", [
      kv("W × D × H", `${env.W} × ${env.D} × ${env.H} mm`),
      kv("Boards", `${count("carcass")} carcass 15 · ${count("door")} door stock 16`),
    ]),
    section("As drawn", [
      el("div", { class: "empty small", text: about }),
      el("div", { class: "empty small", text: `Copied board by board from ${rp.source || "the Fusion model"} — outlines, notches, openings, hinge cups and grooves. Fixed: it cannot be resized and has no zones. Placed by As drawn → Ensuite sample, where the model has it: back on the rear wall, the tall at the left wall, the lower beside it.` }),
      ...((rp.corrections || []).map((c) => el("div", { class: "msg warn", text: `Drawing fix: ${c}` }))),
    ]),
    checks,
    el("div", { class: "panel-foot" }, [remove]),
  ].filter(Boolean));
}
