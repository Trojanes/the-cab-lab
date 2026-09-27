/**
 * Tall FaceRef joints: style_1 skeleton, fridge sides, style_2 fronts, T4/T5 at the wall.
 */
export interface RelationshipDeclaration {
  declarationId: string;
  generator: "generalTall";
  panelAId: string;
  panelBId: string;
  relationshipType: "structural_butt_joint" | "face_contact";
  geometryType: "edge_to_surface" | "surface_to_surface";
  hostPanelId: string;
  targetPanelId: string;
  ruleId: string;
  allowedHardware: string[];
}

const D = (
  declarationId: string, a: string, b: string,
  relationshipType: "structural_butt_joint" | "face_contact",
  geometryType: "edge_to_surface" | "surface_to_surface",
  hw: string[],
): RelationshipDeclaration => ({
  declarationId, generator: "generalTall",
  panelAId: a, panelBId: b,
  relationshipType, geometryType,
  hostPanelId: a, targetPanelId: b,
  ruleId: `${declarationId}_v1`,
  allowedHardware: hw,
});

export const GT_RELATIONSHIP_DECLARATIONS: RelationshipDeclaration[] = [
  D("gt_b1_b3_bottom_rail_to_deck", "B1", "B3", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_t1_t3_top_rail_to_insert", "T1", "T3", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_b2_b3_carcass_rail_to_deck", "B2", "B3", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_t2_t3_carcass_rail_to_insert", "T2", "T3", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_sidepanel_l_v1", "SidePanel_L", "V1", "face_contact", "surface_to_surface", []),
  D("gt_sidepanel_r_v2", "SidePanel_R", "V2", "face_contact", "surface_to_surface", []),
  D("gt_v5_v1", "V5", "V1", "face_contact", "surface_to_surface", []),
  D("gt_v5_v2", "V5", "V2", "face_contact", "surface_to_surface", []),
  D("gt_t4_t5_rear_stack", "T4", "T5", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_t5_v3", "T5", "V3", "face_contact", "surface_to_surface", []),
  D("gt_t5_v4", "T5", "V4", "face_contact", "surface_to_surface", []),
  D("gt_th1_fixed_front", "TH1", "TopStyle2FixedFrontPanel", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_bh1_fixed_front", "BH1", "BottomStyle2FixedFrontPanel", "structural_butt_joint", "edge_to_surface", ["screw_hole"]),
  D("gt_th1_v1", "TH1", "V1", "face_contact", "surface_to_surface", []),
  D("gt_bh1_v1", "BH1", "V1", "face_contact", "surface_to_surface", []),
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

function overlaps(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - 0.01 && b0 < a1 - 0.01;
}
function near(a0: number, a1: number, b0: number, b1: number): boolean {
  const gap = Math.max(b0 - a1, a0 - b1);
  return gap <= 0.6 && gap >= -0.6;
}
function meets(a: Box, b: Box): boolean {
  const ox = overlaps(a.x0, a.x1, b.x0, b.x1);
  const oy = overlaps(a.y0, a.y1, b.y0, b.y1);
  const oz = overlaps(a.z0, a.z1, b.z0, b.z1);
  return (ox && oy && oz) || (near(a.x0, a.x1, b.x0, b.x1) && oy && oz) || (near(a.y0, a.y1, b.y0, b.y1) && ox && oz) || (near(a.z0, a.z1, b.z0, b.z1) && ox && oy);
}

function joinRule(a: Box, b: Box): string {
  const types = new Set([a.boardType, b.boardType]);
  if (types.has("vertical_divider") || [...types].some((t) => t?.startsWith("Zi") || t === "full_zi" || t === "half_zi" || t === "shortened_zi")) return "tall_zi_joint_v1";
  if ([...types].some((t) => t?.startsWith("H"))) return "tall_h_support_v1";
  if (types.has("V5")) return "tall_fridge_divider_v1";
  if (types.has("side_panel")) return "tall_side_panel_v1";
  return "tall_butt_v1";
}

export function relationshipDeclarationsForBoards(
  boardsOrIds: ReadonlySet<string> | Box[],
): RelationshipDeclaration[] {
  const boards: Box[] = Array.isArray(boardsOrIds) ? boardsOrIds : [];
  const boardIds = Array.isArray(boardsOrIds) ? new Set(boards.map((b) => b.id)) : boardsOrIds;
  const extra: RelationshipDeclaration[] = [];
  const vs = ["V1", "V2", "V3", "V4", "V5"].filter((id) => boardIds.has(id));
  const bottoms = [...boardIds].filter((id) => /^H\d+_(bottom|fridge)$/.test(id));
  const deck = boardIds.has("B3") ? "B3" : boardIds.has("BH1") ? "BH1" : null;
  if (deck) {
    for (const v of vs) extra.push(D(`gt_${deck.toLowerCase()}_${v.toLowerCase()}`, deck, v, "face_contact", "surface_to_surface", []));
    for (const h of bottoms) extra.push(D(`gt_${deck.toLowerCase()}_${h.toLowerCase()}`, deck, h, "structural_butt_joint", "edge_to_surface", ["screw_hole"]));
  }
  const base = [...GT_RELATIONSHIP_DECLARATIONS, ...extra].filter((d) => present(d, boardIds));
  const seenPairs = new Set(base.map((d) => [d.panelAId, d.panelBId].sort().join("|")));
  const more: RelationshipDeclaration[] = [];
  for (let i = 0; i < boards.length; i += 1) {
    for (let k = i + 1; k < boards.length; k += 1) {
      const a = boards[i];
      const b = boards[k];
      if (a.category === "front_panel" || b.category === "front_panel" || a.boardType === "front_panel" || b.boardType === "front_panel") continue;
      if (a.id === "T4" || b.id === "T4" || a.id === "T5" || b.id === "T5") continue;
      const key = [a.id, b.id].sort().join("|");
      if (seenPairs.has(key) || !meets(a, b)) continue;
      seenPairs.add(key);
      const id = `gt_${a.id}_${b.id}`.replace(/[^A-Za-z0-9_]/g, "_").toLowerCase();
      more.push({ ...D(id, a.id, b.id, "structural_butt_joint", "edge_to_surface", ["screw_hole"]), ruleId: joinRule(a, b) });
    }
  }
  const seen = new Set<string>();
  return [...base, ...more].filter((d) => {
    if (!present(d, boardIds) || seen.has(d.declarationId)) return false;
    seen.add(d.declarationId);
    return true;
  });
}
