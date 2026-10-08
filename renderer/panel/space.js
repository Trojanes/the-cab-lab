// Extracted from renderer/panel.js — behaviour preserved verbatim.
import * as job from "../job.js";
import { getSpaceKind } from "../spaces.js";
import { openSpaceDialog } from "../spaceDialog.js";
import { cabinetHits, overlaps, poseFits, statusOf } from "../fit.js";
import { catalogueFields } from "../catalogueMenu.js";
import { el, grainIssueLines, section, kv, panel, drawerChecks, drawerBoards } from "./widgets.js";
// --- space ---------------------------------------------------------------------

/** Cabinets that no longer fit the space (after a space edit, for instance). */
export function spaceFitIssues() {
  const issues = [];
  if (!job.hasSpace()) return issues;
  const wallIds = new Set(job.getWalls().map((w) => w.id));
  const cabIds = new Set(job.getJob().cabinets.map((c) => c.id));
  for (const cab of job.getJob().cabinets) {
    if (!poseFits(cab, cab.pose)) issues.push(`${cab.id} is outside the space or overlaps an obstacle.`);
    const all = overlaps(cab, cab.pose);
    const hits = all.filter((id) => wallIds.has(id));
    if (hits.length) issues.push(`${cab.id} overlaps partition ${hits.join(", ")}.`);
    const parts = all.filter((id) => !wallIds.has(id) && !cabIds.has(id.split(":")[0])); // "op-1 leaf" / "op-1 pelmet"
    if (parts.length) issues.push(`${cab.id} overlaps the sliding door ${parts.join(", ")}.`);
    const cabs = cabinetHits(cab).filter((id) => id > cab.id);
    if (cabs.length) issues.push(`${cab.id} overlaps cabinet ${cabs.join(", ")}.`);
    issues.push(...grainIssueLines(job.resultFor(cab.id)).map((m) => `${cab.id}: ${m}`));
  }
  for (const w of job.getWalls()) {
    const st = statusOf(w);
    if (!st.ok) issues.push(`${w.id}: ${st.issues.join("; ")}.`);
    issues.push(...(st.warnings || []).map((m) => `${w.id}: ${m}.`), ...doorBlockers(w, st.solid));
  }
  return issues;
}

export function renderSpace() {
  const space = job.getJob().space;
  const resolved = job.getSpace();
  const count = job.getJob().cabinets.length;

  if (!space) {
    panel.replaceChildren(
      el("div", { class: "panel-head" }, [
        el("div", { class: "panel-title", text: "Space" }),
        el("div", { class: "panel-sub", text: "not defined" }),
      ]),
      section("Step 1", [
        el("div", { class: "empty small", text: "Define the space first: a box room, or a vehicle (box rear + side-profile nose); imported floor plans later." }),
        el("button", { class: "tb primary wide-solid", text: "Define the space", onclick: () => openSpaceDialog() }),
      ]),
      section("Cabinets", catalogueFields()),
    );
    drawerChecks.replaceChildren(el("div", { class: "empty", text: "No space defined." }));
    drawerBoards.replaceChildren(el("div", { class: "empty", text: "No space defined." }));
    return;
  }

  const kind = getSpaceKind(space.kind);
  const issues = spaceFitIssues();
  panel.replaceChildren(...[
    el("div", { class: "panel-head" }, [
      el("div", { class: "panel-title", text: "Space" }),
      el("div", { class: "panel-sub", text: `${kind.label} · ${resolved.summary} · ${count} cabinet(s)${job.getWalls().length ? ` · ${job.getWalls().length} partition(s)` : ""}` }),
    ]),
    section(kind.label, [
      ...(kind.describe
        ? kind.describe(space.params)
        : kind.fields.filter((f) => !f.type || f.type === "number").map((f) => [f.label, String(space.params[f.key])])
      ).map(([label, value]) => el("div", { class: "kv" }, [el("span", { text: label }), el("b", { text: value })])),
      el("button", { class: "tb wide", text: "Edit space…", onclick: () => openSpaceDialog() }),
    ]),
    section("Cabinets", catalogueFields()),
    issues.length
      ? el("div", { class: "panel-section" }, [
          el("div", { class: "sec-title", text: "Checks" }),
          ...issues.map((m) => el("div", { class: "msg err", text: m })),
        ])
      : null,
    el("div", { class: "panel-section muted" }, [
      el("div", { class: "sec-title", text: "Next" }),
      el("div", { class: "empty small", text: "Walls first: open the Floor plan (top right of the 3D view) and draw the partition walls from the space's walls. Then pick a module on the left, click a corner of the space (or of a wall / another cabinet) to start its box, size it with the mouse or Tab-typed numbers, click again to create. Pull the blue faces to change W / D / H, drag the orange bars to move zone boundaries." }),
    ]),
  ].filter(Boolean));
  drawerChecks.replaceChildren(
    issues.length
      ? el("div", {}, issues.map((m) => el("div", { class: "msg err", text: m })))
      : el("div", { class: "empty", text: count ? "All cabinets fit the space. Select one to see its checks." : "Select a cabinet to see its checks." }),
  );
  drawerBoards.replaceChildren(el("div", { class: "empty", text: "Select a cabinet to list its boards." }));
}
