/**
 * Lounge FaceRef joints for every run that is present (L / I / U / Parallel).
 */
export interface RelationshipDeclaration {
  declarationId: string;
  generator: "lounge";
  panelAId: string;
  panelBId: string;
  hostPanelId: string;
  targetPanelId: string;
}

const P = (declarationId: string, a: string, b: string): RelationshipDeclaration => ({
  declarationId, generator: "lounge", panelAId: a, panelBId: b, hostPanelId: a, targetPanelId: b,
});

export const LOUNGE_RELATIONSHIP_DECLARATIONS: RelationshipDeclaration[] = [
  P("lg_main_front_to_top", "main_front", "main_top"),
  P("lg_l_front_to_side", "l_front", "l_side"),
  P("lg_l_front_to_top", "l_front", "l_top"),
  P("lg_main_left_to_top", "main_left_side", "main_top"),
  P("lg_main_right_to_top", "main_right_side", "main_top"),
  P("lg_l_side_to_top", "l_side", "l_top"),
  P("lg_l_outer_to_top", "l_outer_side", "l_top"),
  P("lg_i_front_to_top", "i_front", "i_top"),
  P("lg_i_left_to_top", "i_left_side", "i_top"),
  P("lg_i_right_to_top", "i_right_side", "i_top"),
  P("lg_left_front_to_top", "left_front", "left_top"),
  P("lg_left_left_to_top", "left_left_side", "left_top"),
  P("lg_left_right_to_top", "left_right_side", "left_top"),
  P("lg_left_side_to_top", "left_side", "left_top"),
  P("lg_left_strip_to_top", "left_support_strip", "left_top"),
  P("lg_back_front_to_top", "back_front", "back_top"),
  P("lg_back_left_to_top", "back_left_side", "back_top"),
  P("lg_back_right_to_top", "back_right_side", "back_top"),
  P("lg_right_front_to_top", "right_front", "right_top"),
  P("lg_right_left_to_top", "right_left_side", "right_top"),
  P("lg_right_right_to_top", "right_right_side", "right_top"),
  P("lg_right_side_to_top", "right_side", "right_top"),
  P("lg_right_strip_to_top", "right_support_strip", "right_top"),
];

export function relationshipDeclarationsForBoards(ids: ReadonlySet<string>): RelationshipDeclaration[] {
  return LOUNGE_RELATIONSHIP_DECLARATIONS.filter((d) => ids.has(d.panelAId) && ids.has(d.panelBId));
}
