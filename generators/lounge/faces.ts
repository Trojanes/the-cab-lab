/**
 * Lounge face layer: top openings, lid finger holes, FaceRef joints.
 */
import { dim, ref } from "../_lib/dim.ts";
import { setEdgeBand } from "../_lib/edgeBand.ts";
import { addFeature, annotate, boundaryEdgeFaces, edgeFaces, localRect, type AxisDir, type Board, type Joint } from "../_lib/model.ts";
import { RULES as R } from "./rules.ts";
import { resolveDeclaredJoints } from "../_lib/resolveJoints.ts";
import { relationshipDeclarationsForBoards } from "./relationshipDeclarations.ts";
import type { LoungeGroove, LoungeHinge, LoungeLid, LoungeLock, LoungeOpening } from "./types.ts";

export function buildLoungeFaces(fb: {
  boards: Board[];
  openings: LoungeOpening[];
  lids: LoungeLid[];
  hinges?: LoungeHinge[];
  locks?: LoungeLock[];
  grooves?: LoungeGroove[];
  doorColour: string;
  carcassColour?: string;
}): Joint[] {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  for (const b of fb.boards) {
    b.role = b.category;
    if (b.boardType === "front" || b.category === "front_panel") {
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, "A", { semantic: "back", visible: false });
    }
    if (b.boardType === "top_panel") {
      annotate(b, "A", { semantic: "top", visible: true });
      annotate(b, "B", { semantic: "bottom" });
    }
  }

  for (const op of fb.openings) {
    const topId = `${op.id.replace(/_opening$/, "")}_top`;
    const top = B.get(topId);
    if (!top) continue;
    const r = localRect(top, { x: [op.x0, op.x0 + op.width], y: [op.y0, op.y0 + op.depth] });
    const lidId = `${topId.replace(/_top$/, "")}_lid`;
    addFeature(top, "A", {
      id: op.id, kind: "cutout", ...r, through: true,
      ...(B.has(lidId) ? { for: lidId } : {}),
      source: "lounge",
    });
  }

  for (const lid of fb.lids) {
    const board = B.get(lid.id);
    if (!board) continue;
    const key = `${lid.id}.feat.finger`;
    const cx = dim(`${key}.x`, { width: ref(`${lid.id}.x1`), x0: ref(`${lid.id}.x0`) }, (t) => (t.width - t.x0) / 2);
    const cy = dim(`${key}.y`, { depth: ref(`${lid.id}.y1`), y0: ref(`${lid.id}.y0`) }, (t) => (t.depth - t.y0) / 2);
    addFeature(board, "A", {
      id: `${lid.id}_finger`, kind: "hole", center: [cx, cy],
      diameter: lid.holeDiameter, through: true, for: "finger", key, source: "lounge",
    });
  }

  for (const h of fb.hinges ?? []) {
    const fp = B.get(h.panelId);
    if (!fp) continue;
    const key = `${h.panelId}.feat.${h.id}`;
    const cx = dim(`${key}.x`, { centerX: h.centerX, x0: ref(`${h.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: h.centerZ, z0: ref(`${h.panelId}.z0`) }, (t) => t.centerZ - t.z0);
    addFeature(fp, "A", {
      id: h.id, kind: "hole", center: [cx, cz],
      diameter: h.diameter, depth: h.depth, for: "hinge", key, source: "lounge",
    });
  }
  for (const lock of fb.locks ?? []) {
    const fp = B.get(lock.panelId);
    if (!fp) continue;
    const key = `${lock.panelId}.feat.${lock.id}`;
    const cx = dim(`${key}.x`, { centerX: lock.centerX, x0: ref(`${lock.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: lock.centerZ, z0: ref(`${lock.panelId}.z0`) }, (t) => t.centerZ - t.z0);
    addFeature(fp, "A", {
      id: lock.id, kind: "cutout",
      u0: cx - lock.width / 2, u1: cx + lock.width / 2,
      v0: cz - lock.height / 2, v1: cz + lock.height / 2,
      radius: lock.radius, through: true, for: "lock", key, source: "lounge",
    });
  }
  for (const g of fb.grooves ?? []) {
    const board = B.get(g.boardId);
    if (!board) continue;
    addFeature(board, g.face, {
      id: g.id, kind: "groove", u0: g.u0, u1: g.u1, v0: g.v0, v1: g.v1,
      depth: g.depth, for: g.for ?? "middle_cabinet_mid_divider", source: "lounge",
    });
  }

  if (B.has("back_rail")) bandFrameEdges(fb.boards, fb.carcassColour ?? "White Stipple", fb.doorColour);
  return resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(new Set(fb.boards.map((b) => b.id))));
}

/**
 * Frame L: every edge that shows, in the carcass colour (it is all partition stock). The seat ring's top
 * edges, the wing sides' room-facing ends, the lids all round, and the rail edges that face into the
 * storage. Run ends count as against a wall; edges on the floor, the wall, a slot or another board stay bare.
 * A wing drawer: its front and fixed strip all round, and the wing sides' room ends, in the door colour;
 * with the drawer out, the drawer rail's rear edge and the wing supports' front edges show.
 */
function bandFrameEdges(boards: Board[], colour: string, doorColour: string) {
  const tape = { thickness: R.EDGE_BAND_THICKNESS_MM.value, colour };
  const band = (b: Board | undefined, normal: AxisDir) => {
    if (!b) return;
    for (const f of boundaryEdgeFaces(b, normal)) setEdgeBand(b, Number(f.id.slice(1)), tape);
  };
  const by = (id: string) => boards.find((b) => b.id === id);
  for (const id of ["main_front", "l_front", "main_end", "l_side", "l_outer_side", "back_rail"]) band(by(id), "+Z");
  band(by("l_side"), "-Y");
  band(by("l_outer_side"), "-Y");
  if (by("l_drawer_front")) {
    const doorTape = { thickness: R.EDGE_BAND_THICKNESS_MM.value, colour: doorColour };
    for (const id of ["l_drawer_front", "l_drawer_strip"]) {
      const b = by(id)!;
      for (const f of edgeFaces(b)) setEdgeBand(b, Number(f.id.slice(1)), doorTape);
    }
    // The wing sides' room ends frame the drawer: door colour there.
    for (const id of ["l_side", "l_outer_side"]) {
      const b = by(id)!;
      for (const f of boundaryEdgeFaces(b, "-Y")) setEdgeBand(b, Number(f.id.slice(1)), doorTape);
    }
    band(by("l_drawer_rail"), "+Y");
    band(by("l_support_inner"), "-Y");
    band(by("l_support_outer"), "-Y");
  }
  for (const id of ["main_rail_back", "main_rail_front", "back_rail"]) band(by(id), "-Z");
  for (const id of ["main_lid", "l_lid"]) {
    const lid = by(id);
    if (lid) for (const f of edgeFaces(lid)) setEdgeBand(lid, Number(f.id.slice(1)), tape);
  }
}
