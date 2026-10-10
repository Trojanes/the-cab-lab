// @module panel @owns renderBunk — bunk bed card
// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { invoke } from "../commands.js";
import { log } from "../log.js";
import { el, numField, section, kv, panel } from "./widgets.js";
export function renderBunk(cab, mod, result, { checks, remove, p, env, board }) {
    const lay = result?.layout || {};
    const lim = mod.upperLimits(p);
    const setKey = (key, value, how = "type") => {
      const next = { ...p, [key]: value };
      invoke("cabinet.set-params", { id: cab.id, params: next , replace: true });
      log("bunk.layout.set", { id: cab.id, key, from: p[key], to: value, how, changed: p[key] !== value });
    };
    const endSelect = el("label", { class: "field", title: "Seen from the room, facing the bunk" }, [
      el("span", { text: "Ladder + end cubby" }),
      el("select", { onchange: (e) => { const v = e.target.value; e.target.blur(); setKey("endSide", v, "select"); } }, [
        el("option", { value: "RIGHT", text: "Right", selected: (p.endSide || "RIGHT") === "RIGHT" }),
        el("option", { value: "LEFT", text: "Left", selected: p.endSide === "LEFT" }),
      ]),
    ]);
    panel.replaceChildren(...[
      el("div", { class: "panel-head" }, [
        el("div", { class: "panel-title", text: "Bunk bed · across" }),
        el("div", { class: "panel-sub", text: `${cab.id} · rear wall · wall to wall · ${result?.boards?.length || 0} boards` }),
      ]),
      board,
      section("Size", [
        numField("Length (mm)", env.W, () => {}, { readOnly: "Wall to wall along the rear wall. Redraw the bunk to change it." }),
        numField("Depth (mm)", env.D, () => {}, { readOnly: "Rear wall to the room face of the front partition, partition included. Redraw the bunk to change it." }),
        numField("Top (mm)", env.H, () => {}, { readOnly: "The ceiling minus the partition ceiling clearance from the setup (copied when the bunk was drawn)." }),
        kv("Mattress width", `${lay.mattressWidth ?? "—"} mm · depth minus the partition`),
        kv("Front partition", `${lay.partition?.thickness ?? "—"} thick · ${p.floorClearance ?? 0} above the floor · ${p.ceilingClearance ?? 0} under the ceiling (setup)${lay.partition?.cut != null ? ` · two sheets, cut at ${lay.partition.cut}` : ""}`),
      ]),
      section("Bunks", [
        numField("Deck top (mm)", p.deckTop, (v) => setKey("deckTop", Math.round(v * 10) / 10), { step: 1 }),
        numField("Upper base underside (mm)", p.upperZ, (v) => setKey("upperZ", Math.round(v * 10) / 10), { step: 1 }),
        kv("Range", `${Math.round(lim.min)} – ${Math.round(lim.max)} · equal ${lim.equal}`),
        el("button", { class: "tb", text: "Equal clear height", title: "Put the upper base where both bunks get the same clear height", onclick: () => setKey("upperZ", lim.equal, "equal") }),
        kv("Clear height", `lower ${lay.lowerClear ?? "—"} · upper ${lay.upperClear ?? "—"}`),
        kv("Tunnel boot", `${lay.bootTop ?? "—"} high`),
        endSelect,
      ]),
      checks,
      el("div", { class: "panel-foot" }, [remove]),
    ].filter(Boolean));
    }
