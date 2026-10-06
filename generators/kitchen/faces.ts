/**
 * Kitchen face layer: slots / hinges / locks on A·B, joints as FaceRefs.
 */
import { dim, ref, valueOf } from "../_lib/dim.ts";
import { setEdgeBand } from "../_lib/edgeBand.ts";
import { addFeature, annotate, boundaryEdgeFaces, edgeFaces, faceRef, joint, localRect, planeAxes, type AxisDir, type Board, type Joint } from "../_lib/model.ts";
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

/** Style 1 B3 bottom face (−Z). Omitted `on` is the caller's decision. Returns warnings. */
export function addKitchenB3Led(boards: Board[], on: boolean): string[] {
  if (!on) return [];
  const b3 = boards.find((b) => b.id === "B3");
  if (!b3) return ["B3 LED groove skipped: B3 board missing."];
  const width = b3.x1 - b3.x0;
  const rear = b3.y1 - b3.y0;
  const W = R.LED_GROOVE_WIDTH_MM.value;
  const inset = R.LED_GROOVE_BRANCH_END_INSET_MM.value;
  const land = R.LED_GROOVE_FRONT_LAND_MM.value;
  const depth = R.LED_GROOVE_DEPTH_MM.value;
  if (depth >= b3.materialThickness - 1e-9) {
    return [`B3 LED groove skipped: depth ${depth} would cut through the ${b3.materialThickness} mm board.`];
  }
  if (width <= inset * 2 + W) {
    return [`B3 LED groove skipped: board width ${width.toFixed(1)} too narrow for 80 mm end insets.`];
  }
  const v0 = land;
  const v1 = land + W;
  if (v1 > rear + 1e-6) {
    return [`B3 LED groove skipped: main channel leaves board depth ${rear.toFixed(1)}.`];
  }
  if (rear - v1 <= 1e-6) {
    return ["B3 LED groove T-branches skipped: no remaining depth behind the main channel."];
  }
  const KM = "B3.feat.LED_MAIN";
  dim(`${KM}.u0`, {}, () => 0);
  dim(`${KM}.u1`, { w: ref("B3.x1"), x0: ref("B3.x0") }, (t) => t.w - t.x0);
  dim(`${KM}.v0`, { land: R.LED_GROOVE_FRONT_LAND_MM }, (t) => t.land);
  dim(`${KM}.v1`, { land: R.LED_GROOVE_FRONT_LAND_MM, W: R.LED_GROOVE_WIDTH_MM }, (t) => t.land + t.W);
  addFeature(b3, "B", {
    id: "B3_LED_MAIN", kind: "tgroove", u0: 0, u1: width, v0, v1, depth,
    for: "led", key: KM, source: "kitchen", group: "B3.LED",
  });
  [0, 1].forEach((i) => {
    const KB = `B3.feat.LED_BRANCH_${i + 1}`;
    const x0 = i === 0
      ? dim(`${KB}.u0`, { INSET: R.LED_GROOVE_BRANCH_END_INSET_MM, W: R.LED_GROOVE_WIDTH_MM }, (t) => t.INSET - t.W / 2)
      : dim(`${KB}.u0`, { w: ref(`${KM}.u1`), INSET: R.LED_GROOVE_BRANCH_END_INSET_MM, W: R.LED_GROOVE_WIDTH_MM }, (t) => t.w - t.INSET - t.W / 2);
    const x1 = i === 0
      ? dim(`${KB}.u1`, { INSET: R.LED_GROOVE_BRANCH_END_INSET_MM, W: R.LED_GROOVE_WIDTH_MM }, (t) => t.INSET + t.W / 2)
      : dim(`${KB}.u1`, { w: ref(`${KM}.u1`), INSET: R.LED_GROOVE_BRANCH_END_INSET_MM, W: R.LED_GROOVE_WIDTH_MM }, (t) => t.w - t.INSET + t.W / 2);
    dim(`${KB}.v0`, { v: ref(`${KM}.v1`) }, (t) => t.v);
    dim(`${KB}.v1`, { rear: ref("B3.y1"), y0: ref("B3.y0") }, (t) => t.rear - t.y0);
    addFeature(b3, "B", {
      id: `B3_LED_BRANCH_${i + 1}`, kind: "tgroove",
      u0: x0, u1: x1, v0: v1, v1: rear, depth,
      for: "led", key: KB, source: "kitchen", group: "B3.LED",
    });
  });
  return [];
}

export function buildKitchenFaces(fb: {
  boards: Board[];
  slots: SlotRecord[];
  screws: ScrewRecord[];
  hinges: HingeRecord[];
  locks: LockRecord[];
  notches: NotchRecord[];
  doorColour: string;
  /** HPL decor on the bench top. Absent when the cabinet has no bench board. */
  benchColour?: string;
  applianceTongues?: { id: string; vLeft: string; vRight: string; y0: number; y1: number; z0: number; z1: number; depth: number }[];
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
    const slotY0 = Number.isFinite(valueOf(`kitchen.slot.${s.id}.y0`)) ? ref(`kitchen.slot.${s.id}.y0`) : s.y0;
    const slotZ0 = Number.isFinite(valueOf(`kitchen.slot.${s.id}.z0`)) ? ref(`kitchen.slot.${s.id}.z0`) : s.z0;
    dim(`${key}.y0`, { y0: slotY0, boardY0: ref(`${s.vPanelId}.y0`) }, (t) => t.y0 - t.boardY0);
    dim(`${key}.z0`, { z0: slotZ0, boardZ0: ref(`${s.vPanelId}.z0`) }, (t) => t.z0 - t.boardZ0);
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
    const sy = Number.isFinite(valueOf(`kitchen.screw.${sc.id}.y`)) ? ref(`kitchen.screw.${sc.id}.y`) : sc.y;
    const sz = Number.isFinite(valueOf(`kitchen.screw.${sc.id}.z`)) ? ref(`kitchen.screw.${sc.id}.z`) : sc.z;
    const cy = dim(`${key}.y`, { y: sy, y0: ref(`${sc.vPanelId}.y0`) }, (t) => t.y - t.y0);
    const cz = dim(`${key}.z`, { z: sz, z0: ref(`${sc.vPanelId}.z0`) }, (t) => t.z - t.z0);
    addFeature(v, sc.side === "right" ? "A" : "B", {
      id: sc.id, kind: "hole", center: [cy, cz], diameter: sc.diameter, through: true,
      for: sc.forBoard, key, source: "kitchen.screw",
    });
  }

  for (const tongue of fb.applianceTongues ?? []) {
    for (const [boardId, face] of [[tongue.vLeft, "A"], [tongue.vRight, "B"]] as const) {
      const v = B.get(boardId);
      if (!v) continue;
      const r = localRect(v, { y: [tongue.y0, tongue.y1], z: [tongue.z0, tongue.z1] });
      addFeature(v, face, {
        id: `${tongue.id}-${boardId}`, kind: "groove", ...r, depth: tongue.depth,
        for: tongue.id, source: "kitchen.washer",
      });
    }
  }

  for (const h of fb.hinges) {
    const fp = B.get(h.panelId);
    if (!fp) continue;
    const key = `${h.panelId}.feat.${h.id}`;
    const hx = Number.isFinite(valueOf(`kitchen.hinge.${h.id}.x`)) ? ref(`kitchen.hinge.${h.id}.x`) : h.centerX;
    const hz = Number.isFinite(valueOf(`kitchen.hinge.${h.id}.z`)) ? ref(`kitchen.hinge.${h.id}.z`) : h.centerZ;
    const cx = dim(`${key}.x`, { centerX: hx, x0: ref(`${h.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: hz, z0: ref(`${h.panelId}.z0`) }, (t) => t.centerZ - t.z0);
    addFeature(fp, "A", {
      id: h.id, kind: "hole", center: [cx, cz],
      diameter: h.diameter, depth: h.depth, for: "hinge", key, source: "kitchen",
    });
  }

  for (const lock of fb.locks) {
    const fp = B.get(lock.panelId);
    if (!fp) continue;
    const key = `${lock.panelId}.feat.${lock.id}`;
    const lx = Number.isFinite(valueOf(`kitchen.lock.${lock.id}.x`)) ? ref(`kitchen.lock.${lock.id}.x`) : lock.centerX;
    const lz = Number.isFinite(valueOf(`kitchen.lock.${lock.id}.z`)) ? ref(`kitchen.lock.${lock.id}.z`) : lock.centerZ;
    const cx = dim(`${key}.x`, { centerX: lx, x0: ref(`${lock.panelId}.x0`) }, (t) => t.centerX - t.x0);
    const cz = dim(`${key}.z`, { centerZ: lz, z0: ref(`${lock.panelId}.z0`) }, (t) => t.centerZ - t.z0);
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
    if (b.boardType === "bench_top") {
      if (fb.benchColour) {
        annotate(b, "A", { semantic: "top", visible: true, finish: { colour: fb.benchColour, grain: "u" } });
        annotate(b, "B", { semantic: "bottom", visible: true, finish: { colour: carcass } });
        band(b, "-Y", fb.benchColour);
      }
      continue;
    }
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

  const pair = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const skip = new Set<string>();
  const hardware: Joint[] = [];
  for (const s of fb.slots) {
    const key = pair(s.vPanelId, s.forBoard);
    if (skip.has(key)) continue;
    skip.add(key);
    const face = s.side === "right" ? "A" : "B";
    hardware.push(joint(`kt_tongue_${s.id}`, "tongue_groove", faceRef(s.vPanelId, [face]), faceRef(s.forBoard, ["A"]), {
      rule: "kitchen_tongue_in_v_slot_v1",
    }));
  }
  for (const sc of fb.screws) {
    const key = pair(sc.vPanelId, sc.forBoard);
    if (skip.has(key)) continue;
    skip.add(key);
    const face = sc.side === "right" ? "B" : "A";
    hardware.push(joint(`kt_screw_${sc.id}`, "butt", faceRef(sc.vPanelId, [face]), faceRef(sc.forBoard, ["A"]), {
      hardware: ["screw_hole"], rule: "kitchen_screw_through_v_v1",
    }));
  }
  return [
    ...resolveDeclaredJoints(fb.boards, relationshipDeclarationsForBoards(fb.boards, skip)),
    ...hardware,
  ];
}
