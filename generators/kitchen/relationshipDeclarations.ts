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

export function relationshipDeclarationsForBoards(
  boardIds: ReadonlySet<string>,
): RelationshipDeclaration[] {
  const vs = [...boardIds].filter((id) => /^V\d+$/.test(id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const extra: RelationshipDeclaration[] = [];
  if (boardIds.has("B3")) {
    for (const v of vs) extra.push(D(`kt_${v.toLowerCase()}_b3`, v, "B3"));
    const funcs = [...boardIds].filter((id) => /door-shelf$/.test(id) || /-(bottom)$/.test(id));
    for (const id of funcs) extra.push(D(`kt_b3_${id.replace(/-/g, "_")}`, "B3", id));
  }
  const rails = [...boardIds].filter((id) => /^(T[123]|B4)(-\d+)?$/.test(id));
  const endVs = vs.length ? [vs[0], vs[vs.length - 1]].filter((v, i, a) => a.indexOf(v) === i) : [];
  for (const rail of rails) {
    for (const v of endVs) extra.push(D(`kt_${rail.replace(/-/g, "_")}_${v.toLowerCase()}`, rail, v));
  }
  return [...STATIC, ...extra].filter((d) => present(d, boardIds));
}

export const KITCHEN_RELATIONSHIP_DECLARATIONS = STATIC;
