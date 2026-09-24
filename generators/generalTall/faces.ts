/**
 * Tall cabinet face layer: Zi grooves / slots, hinge cups, FaceRef joints.
 */
import { dim, ref } from "../_lib/dim.ts";
import { addFeature, annotate, localRect, type Board, type Joint } from "../_lib/model.ts";
import { resolveDeclaredJoints } from "../_lib/resolveJoints.ts";
import { relationshipDeclarationsForBoards } from "./relationshipDeclarations.ts";
import type { HingeRecord, LockRecord, ZiGrooveRecord, ZiSlotRecord } from "./types.ts";

export function buildTallFaces(fb: {
  boards: Board[];
  ziSlots: ZiSlotRecord[];
  ziGrooves: ZiGrooveRecord[];
  hinges: HingeRecord[];
  locks: LockRecord[];
  doorColour: string;
}): Joint[] {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  for (const b of fb.boards) {
    b.role = b.category;
    const doorLeaf = b.category === "front_panel" || b.boardType === "front_panel" || b.boardType === "style2_fixed_front_panel" || b.id === "T1" || b.id === "B1";
    if (doorLeaf) {
      // Room face is B (−Y): door leaves, Style 2 fixed fronts, and the style-1 front rails T1 / B1.
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, "A", { semantic: "back", visible: false });
    }
  }

  for (const s of fb.ziSlots) {
    const v = B.get(s.vPanelId);
    if (!v) continue;
    const r = localRect(v, { y: [s.y0, s.y1], z: [s.z0, s.z1] });
    const left = s.vPanelId === "V1" || s.vPanelId === "V3";
    addFeature(v, left ? "A" : "B", {
      id: s.id, kind: "groove", ...r, depth: s.depth,
      for: `Zi_${s.boundaryId}`,
      source: "generalTall",
    });
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

  return resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(new Set(fb.boards.map((b) => b.id))));
}
