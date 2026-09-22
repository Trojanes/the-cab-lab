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

export function relationshipDeclarationsForBoards(
  boardIds: ReadonlySet<string>,
): RelationshipDeclaration[] {
  const extra: RelationshipDeclaration[] = [];
  const vs = ["V1", "V2", "V3", "V4", "V5"].filter((id) => boardIds.has(id));
  const bottoms = [...boardIds].filter((id) => /^H\d+_(bottom|fridge)$/.test(id));
  const deck = boardIds.has("B3") ? "B3" : boardIds.has("BH1") ? "BH1" : null;
  if (deck) {
    for (const v of vs) extra.push(D(`gt_${deck.toLowerCase()}_${v.toLowerCase()}`, deck, v, "face_contact", "surface_to_surface", []));
    for (const h of bottoms) extra.push(D(`gt_${deck.toLowerCase()}_${h.toLowerCase()}`, deck, h, "structural_butt_joint", "edge_to_surface", ["screw_hole"]));
  }
  const seen = new Set<string>();
  return [...GT_RELATIONSHIP_DECLARATIONS, ...extra].filter((d) => {
    if (!present(d, boardIds) || seen.has(d.declarationId)) return false;
    seen.add(d.declarationId);
    return true;
  });
}
