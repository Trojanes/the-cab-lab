// @module panel @owns renderBedroomEast — east bedroom card
// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { invoke } from "../commands.js";
import { log } from "../log.js";
import { el, numField, section, kv, panel } from "./widgets.js";
export function renderBedroomEast(cab, mod, result, { checks, remove, p, env, board }) {
    const rp = result?.params || {};
    const setKey = (key, next) => {
      invoke("cabinet.set-params", { id: cab.id, params: next , replace: true });
      log("bedroomEast.layout.set", { id: cab.id, key, from: p[key], to: next[key], how: "type", changed: JSON.stringify(next[key]) !== JSON.stringify(p[key]) });
    };
    const setWard = (v) => setKey("wardrobeWidth", { ...p, wardrobeWidth: Math.max(150, Math.min(mod.envelope(p).W, Math.round(v))) });
    const bays = result?.layout?.ohc?.zones || [];
    const ob = mod.ohcBottomLimits(rp.width ? rp : p);
    const countField = el("label", { class: "field" }, [
      el("span", { text: "Overhead bays" }),
      el("select", { title: "Up flaps only. Bedroom 1 has three.", onchange: (e) => { const n = Number(e.target.value); e.target.blur(); setKey("ohcZones", mod.setOhcCount(p, n)); } }, [
        el("option", { value: "2", text: "2 · up flaps", selected: bays.length === 2 }),
        el("option", { value: "3", text: "3 · up flaps", selected: bays.length !== 2 }),
      ]),
    ]);
    panel.replaceChildren(...[
      el("div", { class: "panel-head" }, [
        el("div", { class: "panel-title", text: "East-west bedroom" }),
        el("div", { class: "panel-sub", text: `${cab.id} · wardrobe left · mattress across the van · ${Math.round(env.W)} wide` }),
      ]),
      board,
      section("Layout", [
        numField("Wardrobe width (mm)", p.wardrobeWidth, setWard, { step: 10, min: 150 }),
        numField("Mattress length (mm)", rp.mattressLength ?? Math.round(env.W - p.wardrobeWidth), () => {}, { readOnly: "Van width minus the wardrobe. A narrower wardrobe makes it longer." }),
        numField("Mattress depth (mm)", rp.mattressDepth, () => {}, { readOnly: "Queen mattress width. Fixed (rules.json MATTRESS_DEPTH_MM)." }),
        numField("Boot / wardrobe depth (mm)", rp.bodyDepth, () => {}, { readOnly: "From the nose. The mattress continues past this into the room (rules.json BODY_DEPTH_MM)." }),
        numField("Boot top (mm)", rp.bootHeight, () => {}, { readOnly: "rules.json BOOT_HEIGHT_MM." }),
        numField("Bed box from (mm)", rp.bedX0, () => {}, { readOnly: "Wardrobe + 65 (rules.json BED_SIDE_GAP_MM)." }),
        el("label", { class: "field check", title: "LED channels on T3's top: a main channel wall to wall and two branches to the rear edge" }, [
          el("input", { type: "checkbox", checked: p.ledGroove !== false, onchange: (e) => setKey("ledGroove", { ...p, ledGroove: e.target.checked }) }),
          el("span", { text: "LED channels" }),
        ]),
      ]),
      section("Overhead", [
        numField("Door underside (mm)", rp.ohcBottom ?? p.ohcBottom, (v) => setKey("ohcBottom", mod.setOhcBottom(p, v)), { step: 10, min: ob.min }),
        kv("Range", `${Math.round(ob.min)} – ${Math.round(ob.max)} · or drag the orange line in 3D`),
        countField,
        kv("Bays", bays.map((b) => Math.round(b.width)).join(" · ") || "—"),
        el("button", { class: "tb", text: "Average", title: "Make the bays equal again", onclick: () => setKey("ohcZones", mod.setOhcCount(p, bays.length === 2 ? 2 : 3)) }),
      ]),
      checks,
      el("div", { class: "panel-foot" }, [remove]),
    ].filter(Boolean));
    }