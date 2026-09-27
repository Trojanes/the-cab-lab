/**
 * Kitchen FaceRef joints for bench explode.
 * B1↔B2 covers style_2 (B1 sits at y<0 and does not meet B3);
 * V*↔B3 and T/B4 segments↔end V give the carcass a declared graph.
 */
export interface RelationshipDeclaration {
  declarationId: string;
  generator: "kitchen";
  panelAId: string;
  panelBId: string;
  relationshipType: "structural_butt_joint";
  geometryType: "edge_to_surface";
  hostPanelId: string;
  targetPanelId: string;
  ruleId: string;
  allowedHardware: string[];
}

const D = (declarationId: string, host: string, target: string): RelationshipDeclaration => ({
  declarationId,
  generator: "kitchen",
  panelAId: host,
  panelBId: target,
  relationshipType: "structural_butt_joint",
  geometryType: "edge_to_surface",
  hostPanelId: host,
  targetPanelId: target,
  ruleId: `${declarationId}_v1`,
  allowedHardware: ["screw_hole"],
});

const STATIC: RelationshipDeclaration[] = [
  D("kt_b1_b3_bottom_rail_to_deck", "B1", "B3"),
  D("kt_b2_b3_carcass_rail_to_deck", "B2", "B3"),
  D("kt_b1_b2_front_to_carcass_rail", "B1", "B2"),
];

function present(d: RelationshipDeclaration, ids: ReadonlySet<string>): boolean {
  return [d.panelAId, d.panelBId, d.hostPanelId, d.targetPanelId].every((id) => ids.has(id));
}

interface Box {
  id: string;
  x0: number; x1: number; y0: number; y1: number; z0: number; z1: number;
  boardType?: string;
  category?: string;
}

function axisOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - 0.01 && b0 < a1 - 0.01;
}

function axisNear(a0: number, a1: number, b0: number, b1: number): boolean {
  const gap = Math.max(b0 - a1, a0 - b1);
  return gap <= 0.6 && gap >= -0.6;
}

/** Touching, or a notch buried in the other board (the outlines overlap on purpose). */
function meets(a: Box, b: Box): boolean {
  const ox = axisOverlap(a.x0, a.x1, b.x0, b.x1);
  const oy = axisOverlap(a.y0, a.y1, b.y0, b.y1);
  const oz = axisOverlap(a.z0, a.z1, b.z0, b.z1);
  const nx = axisNear(a.x0, a.x1, b.x0, b.x1);
  const ny = axisNear(a.y0, a.y1, b.y0, b.y1);
  const nz = axisNear(a.z0, a.z1, b.z0, b.z1);
  return (ox && oy && oz) || (nx && oy && oz) || (ny && ox && oz) || (nz && ox && oy);
}

const SKIP_FRONT = new Set(["front_panel"]);

function joinRule(a: Box, b: Box): string {
  const types = new Set([a.boardType, b.boardType]);
  if (types.has("vertical_panel") && (types.has("drawer_divider") || types.has("full_depth_shelf") || types.has("door_shelf"))) return "kitchen_v_to_functional_v1";
  if (types.has("vertical_panel") && types.has("strengthening_strip")) return "kitchen_v_to_strengthening_strip_v1";
  if (types.has("vertical_panel") && (types.has("bottom_front") || types.has("bottom_carcass"))) return "kitchen_v_to_bottom_rail_v1";
  if (types.has("vertical_panel") && (types.has("top_front_rail") || types.has("top_rear_rail") || types.has("top_rear_vertical") || types.has("bottom_rear_vertical"))) return "kitchen_v_to_rail_v1";
  if (types.has("top_rear_rail") && types.has("top_rear_vertical")) return "kitchen_t2_meets_t3_v1";
  if (types.has("strengthening_strip") && types.has("door_shelf")) return "kitchen_strip_groove_to_shelf_v1";
  if (types.has("strengthening_strip") && (types.has("bottom_deck") || types.has("top_front_rail"))) return "kitchen_strip_to_rail_v1";
  if (types.has("avoidance_top") || types.has("avoidance_front") || types.has("raised_b4")) return "kitchen_avoidance_v1";
  return "kitchen_butt_v1";
}

export function relationshipDeclarationsForBoards(
  boardsOrIds: ReadonlySet<string> | Box[],
  skipPairs: ReadonlySet<string> = new Set(),
): RelationshipDeclaration[] {
  const boards: Box[] = Array.isArray(boardsOrIds) ? boardsOrIds : [];
  const boardIds = Array.isArray(boardsOrIds) ? new Set(boards.map((b) => b.id)) : boardsOrIds;
  const extra: RelationshipDeclaration[] = [];
  if (boardIds.has("B3")) {
    const vs = [...boardIds].filter((id) => /^V\d+$/.test(id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    for (const v of vs) extra.push(D(`kt_${v.toLowerCase()}_b3`, v, "B3"));
    const funcs = [...boardIds].filter((id) => /door-shelf$/.test(id) || /-(bottom)$/.test(id));
    for (const id of funcs) extra.push(D(`kt_b3_${id.replace(/-/g, "_")}`, "B3", id));
  }
  const rails = [...boardIds].filter((id) => /^(T[123]|B4)(-\d+)?$/.test(id));
  const vs = [...boardIds].filter((id) => /^V\d+$/.test(id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const endVs = vs.length ? [vs[0], vs[vs.length - 1]].filter((v, i, a) => a.indexOf(v) === i) : [];
  for (const rail of rails) {
    for (const v of endVs) extra.push(D(`kt_${rail.replace(/-/g, "_")}_${v.toLowerCase()}`, rail, v));
  }
  const base = [...STATIC, ...extra].filter((d) => present(d, boardIds));
  const seen = new Set(base.map((d) => [d.panelAId, d.panelBId].sort().join("|")));
  const more: RelationshipDeclaration[] = [];
  for (let i = 0; i < boards.length; i += 1) {
    for (let k = i + 1; k < boards.length; k += 1) {
      const a = boards[i];
      const b = boards[k];
      if (SKIP_FRONT.has(a.boardType ?? "") || SKIP_FRONT.has(b.boardType ?? "")) continue;
      if (a.category === "front_panel" || b.category === "front_panel") continue;
      const key = [a.id, b.id].sort().join("|");
      if (seen.has(key) || skipPairs.has(key)) continue;
      if (!meets(a, b)) continue;
      seen.add(key);
      const rule = joinRule(a, b);
      more.push({
        ...D(`kt_${a.id}_${b.id}`.replace(/[^A-Za-z0-9_]/g, "_").toLowerCase(), a.id, b.id),
        ruleId: rule,
      });
    }
  }
  return [...base, ...more];
}

export const KITCHEN_RELATIONSHIP_DECLARATIONS = STATIC;
