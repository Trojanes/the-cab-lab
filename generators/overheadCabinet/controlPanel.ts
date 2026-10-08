/**
 * Overhead end panel and control-panel recesses.
 *
 * End panel (`endPanel: "left" | "right"`): one door-stock board outside the
 * end divider, from the door's underside to the top, front flush with the
 * door's face, back on the wall. The carcass frame does not move: on the left
 * it sits at x −FPT..0.
 *
 * Control panel: an opening through the boards at one end, room face first —
 * the partition (cut by walls.js) or the end panel, then the end divider, then
 * backing dividers added against it (`_lib/controlPanel.ts` decides through /
 * 10 mm half slot / whole). A backing divider is built like an inside divider:
 * BP groove, T3 / T4 notches, screw holes. In a range-hood end it is the short
 * divider standing on RGHD_TOP, which gets the groove for it. The half slot
 * runs from the opening to 0.5 mm past the back edge, so the wiring cut breaks through.
 */
import { dim, param, ref, same } from "../_lib/dim.ts";
import { addFeature, annotate, bigFaceToward, boundaryEdgeFaces, localRect, type AxisDir, type Board } from "../_lib/model.ts";
import { setEdgeBand } from "../_lib/edgeBand.ts";
import { CONTROL_PANEL_EDGE_PAST_MM, CONTROL_PANEL_GROOVE_MM, controlPanelLayers, normalizeControlPanel, type ControlPanelRecord, type LayerCut } from "../_lib/controlPanel.ts";
import {
  DIVIDER_THICKNESS_MM,
  RULES as R,
  bpGroove,
  featureXRange,
  screwHolePositions,
  t3Notch,
  t3TrimmedOutlinePoints,
  t4Notch,
  t4TrimmedOutlinePoints,
  type DividerFeature,
  type OverheadCabinetInputs,
  type OverheadLegacyGeometry,
} from "./geometry.ts";

export type EndSide = "left" | "right";

export interface OverheadControlPanel extends ControlPanelRecord {
  /** endPanel = cut from this cabinet's end panel; wall = a partition in front of the end, already cut. */
  host?: "endPanel" | "wall";
  side?: EndSide;
  /** wall host: the partition's thickness. */
  wallThickness?: number;
  wall?: string;
}

export interface PlannedCut {
  id: string;
  board: string;
  toward: AxisDir;
  kind: "through" | "groove";
  y: [number, number];
  z: [number, number];
  depth?: number;
  panel: string;
}

export interface ControlPanelPlan {
  cuts: PlannedCut[];
  /** Indices into divider_features that stand on RGHD_TOP (no BP groove). */
  suppressed: number[];
  /** rangehood_top_divider_groove records for the short backing dividers. */
  hoodFeatures: Array<Record<string, unknown>>;
}

interface Hood { firstZoneIndex: number; lastZoneIndex: number; clearHeight: number; x0: number; x1: number }

export function endPanelSide(raw: unknown): EndSide | null {
  return raw === "left" || raw === "right" ? raw : null;
}

export function addEndPanel(boards: Board[], inputs: OverheadCabinetInputs, side: EndSide): void {
  const FPT = inputs.frontPanelThickness == null ? R.DEFAULT_FRONT_PANEL_THICKNESS_MM : param({ FPT: inputs.frontPanelThickness }).FPT;
  const fpt = inputs.frontPanelThickness ?? R.DEFAULT_FRONT_PANEL_THICKNESS_MM.value;
  const P = param({ Cw: inputs.cabinetWidth, Cd: inputs.cabinetDepth, H: inputs.cabinetHeight ?? 0 });
  const doorBottom = boards.find((b) => b.category === "front_panel");
  const x0 = side === "left"
    ? dim("END_PANEL.x0", { FPT }, (t) => -t.FPT, { formula: "-FPT" })
    : dim("END_PANEL.x0", { Cw: P.Cw }, (t) => t.Cw, { formula: "Cw" });
  const x1 = side === "left"
    ? dim("END_PANEL.x1", {}, () => 0, { formula: "0" })
    : dim("END_PANEL.x1", { x0: ref("END_PANEL.x0"), FPT }, (t) => t.x0 + t.FPT);
  const y0 = dim("END_PANEL.y0", { FPT }, (t) => -t.FPT, { formula: "-FPT (flush with the door face)" });
  const y1 = dim("END_PANEL.y1", { Cd: P.Cd }, (t) => t.Cd);
  const z0 = doorBottom
    ? same("END_PANEL.z0", `${doorBottom.id}.z0`)
    : dim("END_PANEL.z0", {}, () => -30, { formula: "-30 (door underside)" });
  const z1 = dim("END_PANEL.z1", { H: P.H }, (t) => t.H);
  boards.push({
    id: "END_PANEL",
    name: `End panel (${side})`,
    category: "end_panel",
    boardType: "end_panel",
    materialThickness: fpt,
    profilePlane: "YZ",
    thicknessAxis: "X",
    x0, x1, y0, y1, z0, z1,
    source: "overhead",
    notes: ["Door stock outside the end divider: door underside to the top, flush with the door face."],
  });
}

/** Door stock, colour on the outside, banded on the front and bottom edges. Run after the face layer. */
export function finishEndPanel(boards: Board[], side: EndSide | null, doorColour: string): void {
  const b = boards.find((x) => x.id === "END_PANEL");
  if (!b || !side) return;
  const out = side === "left" ? "B" : "A";
  b.stock = { kind: "door", thickness: b.materialThickness, colour: doorColour };
  annotate(b, out, { semantic: "outside", visible: true, finish: { colour: doorColour } });
  annotate(b, out === "A" ? "B" : "A", { semantic: "inside", visible: false });
  const tape = R.EDGE_BAND_THICKNESS_MM.value;
  for (const n of ["-Y", "-Z"] as const) {
    for (const f of boundaryEdgeFaces(b, n)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: doorColour });
  }
}

function mergeRanges(ranges: [number, number][]): [number, number][] {
  const sorted = ranges.filter(([a, b]) => b - a > 1e-6).sort((p, q) => p[0] - q[0]);
  const out: [number, number][] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r[0] <= last[1] + 1e-6) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

function reoutline(boards: Board[], features: DividerFeature[], slot: number): void {
  for (const kind of ["T3", "T4"] as const) {
    for (const b of boards.filter((x) => x.boardType === kind)) {
      const ranges = mergeRanges(features.map((f) => {
        const [a, c] = featureXRange(f.XDi, slot);
        return [Math.max(a, b.x0) - b.x0, Math.min(c, b.x1) - b.x0] as [number, number];
      }));
      const w = param({ w: b.x1 - b.x0 }).w;
      const pts = kind === "T3"
        ? t3TrimmedOutlinePoints(w, ranges, R.T3_DEPTH_MM, R.T3_NOTCH_DEPTH_MM, `${b.id}.pv`)
        : t4TrimmedOutlinePoints(w, ranges, R.T4_HEIGHT_MM, R.T4_NOTCH_HEIGHT_MM, `${b.id}.pv`);
      b.profileVector = pts.map(([u, v]) => (kind === "T3" ? { x: u + b.x0, y: v } : { x: u + b.x0, z: v })) as Board["profileVector"];
    }
  }
}

/** Panels this cabinet cuts, normalized; a wall panel keeps its side and the partition thickness. */
export function controlPanelsOf(raw: unknown, endSide: EndSide | null): OverheadControlPanel[] {
  if (!Array.isArray(raw)) return [];
  const out: OverheadControlPanel[] = [];
  for (const r of raw) {
    const rec = normalizeControlPanel(r);
    if (!rec) continue;
    const x = r as Record<string, unknown>;
    const host = x.host === "wall" ? "wall" : "endPanel";
    const side = host === "wall" ? endPanelSide(x.side) : endSide;
    if (!side) continue;
    out.push({ ...rec, host, side, wallThickness: Number(x.wallThickness) || 0, wall: x.wall ? String(x.wall) : undefined });
  }
  return out;
}

/**
 * Add the backing dividers and work out every cut. Boards are added before the
 * face layer; the cuts are applied after it (`applyControlPanelCuts`).
 */
export function planControlPanels(
  boards: Board[],
  geometry: OverheadLegacyGeometry,
  inputs: OverheadCabinetInputs,
  panels: OverheadControlPanel[],
  hood: Hood | null,
  hoodDivider: () => { z0: number; cutProfileVector: Array<{ y: number; z: number }> },
  warnings: string[],
): ControlPanelPlan {
  const plan: ControlPanelPlan = { cuts: [], suppressed: [], hoodFeatures: [] };
  if (!panels.length) return plan;
  const cpt = inputs.featureWidth ?? DIVIDER_THICKNESS_MM;
  const Cw = inputs.cabinetWidth;
  const Cd = inputs.cabinetDepth;
  const H = inputs.cabinetHeight ?? 0;
  const tch = inputs.topClearanceHeight ?? R.T1_HEIGHT_MM.value;
  const fpt = inputs.frontPanelThickness ?? R.DEFAULT_FRONT_PANEL_THICKNESS_MM.value;
  const slot = cpt + R.FEATURE_CLEARANCE_MM.value;
  const zones = inputs.zones ?? [];
  const dividers = boards.filter((b) => b.category === "divider").sort((a, b) => a.x0 - b.x0);
  const ends: Record<EndSide, Board | undefined> = { left: dividers[0], right: dividers[dividers.length - 1] };
  const top = H - tch - cpt - 1;

  const sized = panels.map((p) => {
    const cy = Cd - p.fromBack;
    const cz = H - p.fromCeiling;
    const y: [number, number] = [cy - p.width / 2, cy + p.width / 2];
    const z: [number, number] = [cz - p.height / 2, cz + p.height / 2];
    const stack = p.host === "wall" ? [p.wallThickness || 0, cpt] : [fpt, cpt];
    const layers = controlPanelLayers(p.depth, stack, cpt);
    return { p, y, z, layers };
  }).filter(({ p, y, z }) => {
    if (y[0] < -1e-6 || y[1] > Cd + 1e-6 || z[0] < cpt - 1e-6 || z[1] > top + 1e-6) {
      warnings.push(`Control panel ${p.id} runs past the overhead carcass (y 0–${Cd}, z ${cpt}–${Math.round(top * 10) / 10}): not cut.`);
      return false;
    }
    return true;
  });

  for (const side of ["left", "right"] as const) {
    const mine = sized.filter((s) => s.p.side === side);
    const end = ends[side];
    if (!mine.length || !end) continue;
    const zoneIndex = side === "left" ? 0 : zones.length - 1;
    const onHood = !!hood && (side === "left" ? hood.firstZoneIndex === 0 : hood.lastZoneIndex === zones.length - 1);
    const short = onHood ? hoodDivider() : null;
    const need = Math.max(...mine.map((s) => s.layers.added));
    const zoneWidth = Number(zones[zoneIndex]?.width) || Cw;
    if ((need + 1) * cpt > zoneWidth - 50) warnings.push(`Control panel: ${need} backing board(s) at the ${side} end leave the zone too narrow.`);
    const backing: Board[] = [];
    for (let k = 1; k <= need; k += 1) {
      const id = `D_CP_${side === "left" ? "L" : "R"}${k}`;
      const bx0 = side === "left" ? k * cpt : Cw - (k + 1) * cpt;
      const xdi = bx0 + cpt / 2;
      const feature: DividerFeature = {
        id,
        XDi: xdi,
        bp_groove: bpGroove(id, xdi, Cd, slot, inputs.dividerTongueHeight ?? cpt / 2 - 0.5, Cw),
        screw_holes: screwHolePositions(xdi, Cd),
        divider_tongue: { ...geometry.divider_features[0]!.divider_tongue },
        t3_notch: t3Notch(id, xdi, slot, Cw),
        t4_notch: t4Notch(id, xdi, slot, Cw),
      };
      geometry.divider_features.push(feature);
      const index = geometry.divider_features.length - 1;
      for (const part of ["T2", "T3", "T4"] as const) {
        const list = geometry.panel_screw_holes[part];
        const like = list[0];
        if (!like) continue;
        list.push({ ...like, id: `${part}SH_${id}`, for_divider: id, center: [xdi, like.center[1]] });
      }
      dim(`${id}.x0`, { at: bx0 }, (t) => t.at, { formula: side === "left" ? `${k} × CPT (behind the end divider)` : `Cw − ${k + 1} × CPT` });
      dim(`${id}.x1`, { x0: ref(`${id}.x0`), CPT: param({ CPT: cpt }).CPT }, (t) => t.x0 + t.CPT);
      same(`${id}.y0`, `${end.id}.y0`);
      same(`${id}.y1`, `${end.id}.y1`);
      const z0 = short ? dim(`${id}.z0`, { z: short.z0 }, (t) => t.z, { formula: "on RGHD_TOP" }) : same(`${id}.z0`, `${end.id}.z0`);
      const z1 = same(`${id}.z1`, `${end.id}.z1`);
      const board: Board = {
        ...end,
        id,
        name: `Control panel backing ${side} ${k}`,
        x0: bx0,
        x1: bx0 + cpt,
        z0,
        z1,
        cutProfileVector: short ? short.cutProfileVector : end.cutProfileVector,
        profileFeatures: [...(short ? [] : [feature.bp_groove]), feature.divider_tongue, feature.t3_notch, feature.t4_notch],
        notes: [short ? "Backing divider for a control panel; stands on RGHD_TOP." : "Backing divider for a control panel."],
      };
      if (short) {
        plan.suppressed.push(index);
        plan.hoodFeatures.push({
          id: `RGHD_TOP_${id}_GROOVE`,
          type: "rangehood_top_divider_groove",
          targetBoardId: "RGHD_TOP",
          dividerBoardId: id,
          face: "top",
          x: [xdi - slot / 2, xdi + slot / 2],
          y: [Cd / 3, (Cd * 2) / 3],
          depth: cpt / 2,
        });
      }
      boards.push(board);
      backing.push(board);
    }
    if (need) reoutline(boards, geometry.divider_features, slot);

    const toward: AxisDir = side === "left" ? "-X" : "+X";
    for (const { p, y, z, layers } of mine) {
      const stackBoards = [p.host === "wall" ? null : "END_PANEL", end.id, ...backing.map((b) => b.id)];
      layers.cuts.forEach((cut: LayerCut, i) => {
        const board = stackBoards[i];
        if (!board || cut === "none") return;
        if (short && i >= 2 && z[0] < short.z0 - 1e-6) {
          warnings.push(`Control panel ${p.id}: the opening reaches below the short divider on RGHD_TOP.`);
          return;
        }
        if (cut === "through") {
          plan.cuts.push({ id: `CP_${p.id}_${board}`, board, toward, kind: "through", y, z, panel: p.id });
        } else {
          const back = (boards.find((b) => b.id === board)?.y1 ?? Cd) + CONTROL_PANEL_EDGE_PAST_MM;
          plan.cuts.push({ id: `CP_${p.id}_${board}`, board, toward, kind: "groove", y: [y[0], back], z, depth: CONTROL_PANEL_GROOVE_MM, panel: p.id });
        }
      });
      if (p.host === "wall" && layers.cuts[0] !== "through") {
        warnings.push(`Control panel ${p.id}: ${p.depth} mm is not deeper than the 10 mm half slot; the partition is cut through.`);
      }
    }
  }
  return plan;
}

/** Hang the planned cuts on the faces toward the room. */
export function applyControlPanelCuts(boards: Board[], plan: ControlPanelPlan, warnings: string[]): void {
  for (const c of plan.cuts) {
    const b = boards.find((x) => x.id === c.board);
    if (!b) continue;
    const face = bigFaceToward(b, c.toward);
    if (!face) continue;
    const r = localRect(b, { y: c.y, z: c.z });
    const w = b.y1 - b.y0;
    const h = b.z1 - b.z0;
    const past = c.kind === "groove" ? CONTROL_PANEL_EDGE_PAST_MM : 0;
    if (r.u0 < -0.01 || r.u1 > w + past + 0.01 || r.v0 < -0.01 || r.v1 > h + 0.01) {
      warnings.push(`Control panel ${c.panel}: the opening runs off ${b.id}; not cut there.`);
      continue;
    }
    addFeature(b, face.id, c.kind === "through"
      ? { id: c.id, kind: "cutout", ...r, through: true, for: "control_panel", source: "control_panel" }
      : { id: c.id, kind: "groove", ...r, depth: c.depth, for: "control_panel", source: "control_panel" });
  }
}
