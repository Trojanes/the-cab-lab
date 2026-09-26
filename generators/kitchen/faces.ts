/**
 * Kitchen face layer: slots / hinges / locks on A·B, joints as FaceRefs.
 */
import { dim, ref } from "../_lib/dim.ts";
import { setEdgeBand } from "../_lib/edgeBand.ts";
import { addFeature, annotate, boundaryEdgeFaces, edgeFaces, localRect, planeAxes, type AxisDir, type Board, type Joint } from "../_lib/model.ts";
import { resolveDeclaredJoints } from "../_lib/resolveJoints.ts";
import { relationshipDeclarationsForBoards } from "./relationshipDeclarations.ts";
import { RULES as R } from "./rules.ts";
import type { HingeRecord, LockRecord, NotchRecord, ScrewRecord, SlotRecord } from "./types.ts";

const CARCASS_COLOUR = "White Stipple";

/** World Y of the board's outer front edge (−Y). Null when the board has no front edge. */
function frontWorldY(b: Board): number | null {
  const edges = boundaryEdgeFaces(b, "-Y");
  const edge = edges[0]?.edge;
  if (!edge) return null;
  const [U, V] = planeAxes(b.profilePlane);
  const c = U === "y" ? 0 : V === "y" ? 1 : -1;
  if (c < 0) return null;
  return b.y0 + (edge.from[c] + edge.to[c]) / 2;
}

export function buildKitchenFaces(fb: {
  boards: Board[];
  slots: SlotRecord[];
  screws: ScrewRecord[];
  hinges: HingeRecord[];
  locks: LockRecord[];
  notches: NotchRecord[];
  doorColour: string;
}): Joint[] {
  const B = new Map(fb.boards.map((b) => [b.id, b]));
  for (const b of fb.boards) {
    b.role = b.category;
    const isFront = b.category === "front_panel" || b.boardType === "front_panel" || b.id === "B1";
    if (isFront) {
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, "A", { semantic: "back", visible: false });
    }
  }

  for (const s of fb.slots) {
    const v = B.get(s.vPanelId);
    if (!v) continue;
    const r = localRect(v, { y: [s.y0, s.y1], z: [s.z0, s.z1] });
    const face = s.side === "right" ? "A" : "B";
    const key = `${s.vPanelId}.feat.${s.id}`;
    dim(`${key}.y0`, { y0: s.y0, boardY0: ref(`${s.vPanelId}.y0`) }, (t) => t.y0 - t.boardY0);
    dim(`${key}.z0`, { z0: s.z0, boardZ0: ref(`${s.vPanelId}.z0`) }, (t) => t.z0 - t.boardZ0);
    addFeature(v, face, {
      id: s.id, kind: "groove", ...r, depth: s.depth, through: s.through,
      for: s.forBoard, key, source: "kitchen",
    });
  }

  // Screws for a board that got no slot: through the V from the opposite face into the board's end.
  // Through holes: listed on the board's side; the milling pass moves them to the V's milling face.
  for (const sc of fb.screws) {
    const v = B.get(sc.vPanelId);
    if (!v) continue;
    const key = `${sc.vPanelId}.feat.${sc.id}`;
    const cy = dim(`${key}.y`, { y: sc.y, y0: ref(`${sc.vPanelId}.y0`) }, (t) => t.y - t.y0);
    const cz = dim(`${key}.z`, { z: sc.z, z0: ref(`${sc.vPanelId}.z0`) }, (t) => t.z - t.z0);
    addFeature(v, sc.side === "right" ? "A" : "B", {
      id: sc.id, kind: "hole", center: [cy, cz], diameter: sc.diameter, through: true,
      for: sc.forBoard, key, source: "kitchen.screw",
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
      diameter: h.diameter, depth: h.depth, for: "hinge", key, source: "kitchen",
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
      radius: lock.radius, through: true, for: "lock", key, source: "kitchen",
    });
  }

  for (const n of fb.notches) {
    const p = B.get(n.panelId);
    if (!p || p.profilePlane !== "XY") continue;
    const r = localRect(p, { x: [n.x0, n.x1], y: [n.y0, n.y1] });
    addFeature(p, "A", { id: n.id, kind: "notch", ...r, for: "strip", source: "kitchen" });
  }

  // Outer edges only. A V front that reaches the door face takes the door colour;
  // every other banded edge takes the carcass colour. B1, B2 and the wheel-arch boards stay bare.
  const tape = R.EDGE_BAND_THICKNESS_MM.value;
  const carcass = CARCASS_COLOUR;
  const band = (b: Board, normal: AxisDir, colour: string) => {
    for (const f of boundaryEdgeFaces(b, normal)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour });
  };
  for (const b of fb.boards) {
    if (b.boardType === "front_panel") {
      for (const f of edgeFaces(b)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: fb.doorColour });
      continue;
    }
    if (b.boardType === "vertical_panel") {
      const y = frontWorldY(b);
      band(b, "-Y", y != null && y < -0.5 ? fb.doorColour : carcass);
      continue;
    }
    if (b.boardType === "bottom_deck" || b.boardType === "top_front_rail" || b.boardType === "drawer_divider") {
      band(b, "-Y", carcass);
      band(b, "+Y", carcass);
      continue;
    }
    if (b.boardType === "top_rear_rail" || b.boardType === "full_depth_shelf" || b.boardType === "door_shelf" || b.boardType === "strengthening_strip") {
      band(b, "-Y", carcass);
      continue;
    }
    if (b.boardType === "top_rear_vertical") band(b, "-Z", carcass);
    else if (b.boardType === "bottom_rear_vertical") band(b, "+Z", carcass);
  }

  return resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(new Set(fb.boards.map((b) => b.id))));
}
