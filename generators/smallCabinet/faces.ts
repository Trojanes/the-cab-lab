/**
 * Small cabinet — face layer (docs/model-spec.md).
 *
 *   SIDE_L.A / SIDE_R.B   grooves receiving the shelf / back tongues (inside faces)
 *   TOP/BOTTOM/MID.E*     left / right tongue tags on the outline edges
 *   BACK.E*               left / right tongue tags
 *   FP_<i>.B              door lock slot (through, room side)
 *
 * The outline already carries the tongues (shelfJoinery.ts); this only names
 * the edges and hangs the grooves on the side faces.
 */
import {
  addFeature,
  annotate,
  faceRef,
  joint,
  localRect,
  tagEdges,
  type FaceId,
  type Joint,
} from "../_lib/model.ts";
import type { Board, SmallCabinetFeature, SmallCabinetParams } from "./types.ts";

const EPS = 0.01;

interface FaceBuildInputs {
  boards: Board[];
  features: SmallCabinetFeature[];
  panelThickness: number;
  carcassColorName: string;
  doorColorName?: string;
  params: SmallCabinetParams;
}

export function buildSmallCabinetFaces(fb: FaceBuildInputs): Joint[] {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  const joints: Joint[] = [];

  // --- stock + annotations -------------------------------------------------------
  for (const b of fb.boards) {
    b.role = b.category;
    const isFront = b.category === "front_panel";
    b.stock = { kind: isFront ? "door" : "carcass", thickness: b.materialThickness, colour: isFront ? fb.doorColorName : fb.carcassColorName };
    if (isFront) {
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColorName } });
      annotate(b, "A", { semantic: "back", visible: false, finish: { colour: fb.doorColorName } });
    } else {
      annotate(b, "A", { finish: { colour: fb.carcassColorName } });
      annotate(b, "B", { finish: { colour: fb.carcassColorName } });
    }
  }
  const sideL = B.get("SIDE_L");
  const sideR = B.get("SIDE_R");
  if (sideL) {
    annotate(sideL, "A", { semantic: "inside" });
    annotate(sideL, "B", { semantic: "outside", finish: { colour: sideL.useDoorColor ? fb.doorColorName : fb.carcassColorName } });
  }
  if (sideR) {
    annotate(sideR, "B", { semantic: "inside" });
    annotate(sideR, "A", { semantic: "outside", finish: { colour: sideR.useDoorColor ? fb.doorColorName : fb.carcassColorName } });
  }
  for (const id of ["TOP", "BOTTOM"]) {
    const b = B.get(id);
    if (!b) continue;
    annotate(b, "A", { semantic: id === "TOP" ? "top" : "inside" });
    annotate(b, "B", { semantic: id === "TOP" ? "inside" : "bottom" });
  }
  const back = B.get("BACK");
  if (back) {
    annotate(back, "A", { semantic: "back" });
    annotate(back, "B", { semantic: "inside" });
  }

  // --- side grooves (from the joinery features) -------------------------------------
  for (const f of fb.features) {
    if (f.type !== "side_groove") continue;
    const side = B.get(f.targetBoardId);
    if (!side || f.y0 == null || f.y1 == null || f.z0 == null || f.z1 == null) continue;
    const faceId: FaceId = side.id === "SIDE_L" ? "A" : "B"; // inside face
    const r = localRect(side, { y: [f.y0, f.y1], z: [f.z0, f.z1] });
    addFeature(side, faceId, { id: f.id, kind: "groove", ...r, depth: f.depth, for: f.relatedBoardId, source: f.source });
  }

  // --- tongues: tag the outline edges, then join them to the side grooves ----------------
  const t = fb.panelThickness;
  for (const f of fb.features) {
    if (f.type !== "shelf_tongue" && f.type !== "back_tongue") continue;
    const b = B.get(f.targetBoardId);
    if (!b) continue;
    const width = b.x1 - b.x0;
    const uBox = f.side === "left" ? { u0: -EPS, u1: t - EPS } : { u0: width - t + EPS, u1: width + EPS };
    // Shelf (XY): v = y; back (XZ): v = z. Both local to the board's (y0 | z0).
    const vBox = f.type === "shelf_tongue"
      ? { v0: (f.y0 ?? 0) - b.y0 - EPS, v1: (f.y1 ?? 0) - b.y0 + EPS }
      : { v0: (f.z0 ?? 0) - b.z0 - EPS, v1: (f.z1 ?? 0) - b.z0 + EPS };
    const tagged = tagEdges(b, "tongue", { ...uBox, ...vBox }, { id: f.id, for: f.relatedBoardId, source: f.source });
    const side = f.relatedBoardId ? B.get(f.relatedBoardId) : undefined;
    if (side && tagged.length) {
      joints.push(joint(`${f.id}_joint`, "tongue_groove", faceRef(side.id, [side.id === "SIDE_L" ? "A" : "B"]), faceRef(b.id, tagged), { hardware: [], rule: "small_tongue_groove_v1" }));
    }
  }

  // --- door locks: through slot on the room side ----------------------------------------
  for (const b of fb.boards) {
    if (!b.lockCutout) continue;
    const r = localRect(b, { x: [b.lockCutout.x0, b.lockCutout.x1], z: [b.lockCutout.z0, b.lockCutout.z1] });
    addFeature(b, "B", { id: `${b.id}_door_lock`, kind: "cutout", ...r, radius: b.lockCutout.radius, through: true, for: "door_lock", source: "door_lock" });
  }

  return joints;
}
