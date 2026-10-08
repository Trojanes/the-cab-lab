/**
 * Tall cabinet face layer: Zi grooves / slots, hinge cups, FaceRef joints.
 */
import { dim, ref } from "../_lib/dim.ts";
import { setEdgeBand } from "../_lib/edgeBand.ts";
import { addFeature, annotate, boundaryEdgeFaces, edgeFaces, localRect, tagEdges, type AxisDir, type Board, type Joint } from "../_lib/model.ts";
import { resolveDeclaredJoints } from "../_lib/resolveJoints.ts";
import { relationshipDeclarationsForBoards } from "./relationshipDeclarations.ts";
import { RULES as R } from "./rules.ts";
import type { HingeRecord, LockRecord, ZiGrooveRecord, ZiSlotRecord } from "./types.ts";

/** LED T-groove: a main channel along X behind the front land, two branches from it to the rear edge. */
function addLedGroove(b: Board, face: "A" | "B") {
  const K = `${b.id}.feat.LED`;
  const width = dim(`${K}_MAIN.u1`, { x1: ref(`${b.id}.x1`), x0: ref(`${b.id}.x0`) }, (t) => t.x1 - t.x0);
  const v0 = dim(`${K}_MAIN.v0`, { LAND: R.LED_GROOVE_FRONT_LAND_MM }, (t) => t.LAND);
  const v1 = dim(`${K}_MAIN.v1`, { LAND: R.LED_GROOVE_FRONT_LAND_MM, W: R.LED_GROOVE_WIDTH_MM }, (t) => t.LAND + t.W);
  const rear = dim(`${K}.rear`, { y1: ref(`${b.id}.y1`), y0: ref(`${b.id}.y0`) }, (t) => t.y1 - t.y0);
  const depth = R.LED_GROOVE_DEPTH_MM.value;
  addFeature(b, face, { id: `${b.id}_LED_MAIN`, kind: "tgroove", u0: 0, u1: width, v0, v1, depth, for: "led", key: `${K}_MAIN`, source: "generalTall" });
  const centres = [
    dim(`${K}_BRANCH_1.cu`, { INSET: R.LED_GROOVE_BRANCH_END_INSET_MM }, (t) => t.INSET),
    dim(`${K}_BRANCH_2.cu`, { w: ref(`${K}_MAIN.u1`), INSET: R.LED_GROOVE_BRANCH_END_INSET_MM }, (t) => t.w - t.INSET),
  ];
  const half = R.LED_GROOVE_WIDTH_MM.value / 2;
  centres.forEach((cu, i) => {
    addFeature(b, face, {
      id: `${b.id}_LED_BRANCH_${i + 1}`, kind: "tgroove",
      u0: cu - half, u1: cu + half, v0: v1, v1: rear, depth, for: "led", key: `${K}_BRANCH_${i + 1}`, source: "generalTall",
    });
  });
}

export function buildTallFaces(fb: {
  boards: Board[];
  ziSlots: ZiSlotRecord[];
  ziGrooves: ZiGrooveRecord[];
  hinges: HingeRecord[];
  locks: LockRecord[];
  doorColour: string;
  ledGroove: boolean;
  /** z range of the fridge cavity: the appliance hides every edge facing into it. */
  fridgeZ: [number, number] | null;
}): Joint[] {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  if (fb.ledGroove) {
    const t3 = B.get("T3");
    const b3 = B.get("B3");
    if (t3) addLedGroove(t3, "A");
    if (b3) addLedGroove(b3, "B");
  }
  for (const b of fb.boards) {
    b.role = b.category;
    const doorLeaf = b.category === "front_panel" || b.boardType === "front_panel" || b.boardType === "style2_fixed_front_panel" || b.id === "T1" || b.id === "B1";
    if (doorLeaf) {
      // Room face is B (−Y): door leaves, Style 2 fixed fronts, and the style-1 front rails T1 / B1.
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, "A", { semantic: "back", visible: false });
    } else if (b.id.startsWith("SidePanel_") && b.stock?.kind === "door") {
      // Colour side panel: door stock, the outside face carries the door colour (left −X = B, right +X = A).
      const left = b.id === "SidePanel_L";
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, left ? "B" : "A", { semantic: "outside", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, left ? "A" : "B", { semantic: "inside", visible: false });
    }
  }

  for (const s of fb.ziSlots) {
    const v = B.get(s.vPanelId);
    if (!v) continue;
    // The slot runs in from the V board's edge, so it is already cut in the outline:
    // tag those edges (a notch). A face groove here read as 50 mm deep on a 16 mm board
    // and the .cnjob export refused every tall cabinet.
    const r = localRect(v, { y: [s.y0, s.y1], z: [s.z0, s.z1] });
    tagEdges(v, "notch", r, { id: s.id, for: `Zi_${s.boundaryId}`, source: "generalTall" });
  }

  for (const g of fb.ziGrooves) {
    const board = B.get(g.boardId);
    if (!board) continue;
    const r = localRect(board, { x: [g.x0, g.x1], y: [g.y0, g.y1] });
    const vd = g.id.match(/zi_groove_(VD_[^_]+)_/)?.[1];
    addFeature(board, g.face === "top" ? "A" : "B", {
      id: g.id, kind: "groove", ...r, depth: g.depth, for: vd, source: "generalTall",
    });
  }

  for (const h of fb.hinges) {
    const fp = B.get(h.panelId);
    if (!fp) continue;
    const key = `${h.panelId}.feat.${h.id}`;
    const cx = dim(`${key}.x`, { centerX: h.centerX, x0: ref(`${h.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: h.centerZ, z0: ref(`${h.panelId}.z0`) }, (t) => t.centerZ - t.z0);
    addFeature(fp, "A", {
      id: h.id, kind: "hole", center: [cx, cz],
      diameter: h.diameter, depth: h.depth, for: "hinge", key, source: "generalTall",
    });
  }

  for (const lock of fb.locks) {
    const fp = B.get(lock.panelId);
    if (!fp) continue;
    const key = `${lock.panelId}.feat.${lock.id}`;
    const cx = dim(`${key}.x`, { centerX: lock.centerX, x0: ref(`${lock.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: lock.centerZ, z0: ref(`${lock.panelId}.z0`) }, (t) => t.centerZ - t.z0);
    addFeature(fp, "A", {
      id: lock.id, kind: "cutout",
      u0: cx - lock.width / 2, u1: cx + lock.width / 2,
      v0: cz - lock.height / 2, v1: cz + lock.height / 2,
      radius: lock.radius, through: true, for: "lock", key, source: "generalTall",
    });
  }

  bandTallEdges(fb.boards, fb.doorColour, fb.fridgeZ);
  return resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(fb.boards));
}

const CARCASS_COLOUR = "White Stipple";

/**
 * Outer edges only; notches, tongues and edges against a wall / the ceiling / another board stay bare.
 * Door stock edges take the door colour, and so do carcass edges that show flush with the fronts
 * (V1 / V2 / V5 fronts; TH1's front above a fridge infill panel). Other visible carcass edges: carcass colour.
 */
function bandTallEdges(boards: Board[], doorColour: string, fridgeZ: [number, number] | null) {
  const tape = R.EDGE_BAND_THICKNESS_MM.value;
  const band = (b: Board, normal: AxisDir, colour: string) => {
    for (const f of boundaryEdgeFaces(b, normal)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour });
  };
  // H bridges: the ends sit on the stiles; a long edge is banded when it looks into an open zone —
  // not on the floor or at the cabinet top, not against a board (within 1 mm), not inside the fridge cavity.
  const top = Math.max(...boards.map((b) => b.z1));
  const overXY = (a: Board, b: Board) => a.x0 < b.x1 - 0.01 && b.x0 < a.x1 - 0.01 && a.y0 < b.y1 - 0.01 && b.y0 < a.y1 - 0.01;
  const bandH = (b: Board) => {
    for (const [normal, z, dir] of [["+Z", b.z1, 1], ["-Z", b.z0, -1]] as const) {
      if (z <= 0.01 || z >= top - 0.01) continue;
      const covered = boards.some((o) => o !== b && overXY(o, b) && Math.abs((dir > 0 ? o.z0 : o.z1) - z) <= 1);
      const probe = z + dir;
      const inFridge = fridgeZ != null && probe >= fridgeZ[0] && probe <= fridgeZ[1];
      if (!covered && !inFridge) band(b, normal, CARCASS_COLOUR);
    }
  };
  const infill = boards.find((b) => b.id === "TopStyle2FixedFrontPanel" && b.y0 > -0.01);
  // Drawer right under the fridge: its front stops under the fridge floor, so the floor's front and the rail under it show.
  const rail = boards.find((b) => b.id === "FridgeBaseRail");
  const fridgeFloor = rail ? boards.find((b) => b.id.startsWith("Zi_") && Math.abs(b.z0 - rail.z1) < 0.01) : undefined;
  for (const b of boards) {
    const t = b.boardType;
    if (b === rail || b === fridgeFloor) {
      band(b, "-Y", doorColour);
    } else if (t === "front_panel" || (t === "style2_fixed_front_panel" && b !== infill)) {
      for (const f of edgeFaces(b)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: doorColour });
    } else if (b === infill) {
      band(b, "-Z", doorColour); // sides on V1 / V5, top under TH1
    } else if (b.id === "V1" || b.id === "V2") {
      band(b, "-Y", doorColour);
      band(b, "+Y", CARCASS_COLOUR); // rear edge, seen inside the cabinet
    } else if (b.id === "V3" || b.id === "V4") {
      band(b, "-Y", CARCASS_COLOUR); // front edge, seen inside the cabinet
    } else if (b.id.startsWith("SidePanel_") || b.id === "V5") {
      band(b, "-Y", doorColour);
    } else if (b.id === "T1") {
      band(b, "-Z", doorColour);
    } else if (b.id === "B1") {
      band(b, "+Z", doorColour);
    } else if (b.id === "TH1") {
      if (infill) band(b, "-Y", doorColour);
    } else if (b.id === "T3" || b.id === "B3" || t === "half_zi" || t === "shortened_zi") {
      band(b, "-Y", CARCASS_COLOUR);
      band(b, "+Y", CARCASS_COLOUR);
    } else if (t === "full_zi" || b.id.startsWith("DS_") || b.id.startsWith("VD_") || b.id === "T4" || b.id === "avoidance_horizontal") {
      band(b, "-Y", CARCASS_COLOUR);
    } else if (b.id === "T5") {
      band(b, "-Z", CARCASS_COLOUR);
    } else if (/^H(13|24|34)_/.test(b.id)) {
      bandH(b);
    }
  }
}
