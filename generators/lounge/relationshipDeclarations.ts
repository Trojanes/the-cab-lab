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
  // Frame L: rails drop into slots, supports sit against the panels, lids rest on the frame.
  P("lg_rear_rail_main_end", "back_rail", "main_end"),
  P("lg_rear_rail_l_side", "back_rail", "l_side"),
  P("lg_rear_rail_l_outer", "back_rail", "l_outer_side"),
  P("lg_main_front_to_end", "main_front", "main_end"),
  P("lg_main_front_to_l_side", "main_front", "l_side"),
  P("lg_l_front_to_outer", "l_front", "l_outer_side"),
  P("lg_main_end_support", "main_end_support", "main_end"),
  P("lg_main_l_support", "main_l_support", "l_side"),
  P("lg_rail_back_end", "main_rail_back", "main_end_support"),
  P("lg_rail_back_l", "main_rail_back", "main_l_support"),
  P("lg_rail_front_end", "main_rail_front", "main_end_support"),
  P("lg_rail_front_l", "main_rail_front", "main_l_support"),
  P("lg_l_support_inner", "l_support_inner", "l_side"),
  P("lg_l_support_outer", "l_support_outer", "l_outer_side"),
  P("lg_main_lid_on_rail", "main_lid", "main_rail_back"),
  P("lg_l_lid_on_support", "l_lid", "l_support_inner"),
  // Frame L wing drawer: the strip stands between the sides on the rail, the rail tongues into the supports.
  P("lg_l_strip_to_side", "l_drawer_strip", "l_side"),
  P("lg_l_strip_to_outer", "l_drawer_strip", "l_outer_side"),
  P("lg_l_strip_on_rail", "l_drawer_strip", "l_drawer_rail"),
  P("lg_l_drawer_rail_inner", "l_drawer_rail", "l_support_inner"),
  P("lg_l_drawer_rail_outer", "l_drawer_rail", "l_support_outer"),
  // Frame I: the L main run on its own, an end panel at each end.
  P("lg_i_rear_rail_left", "back_rail", "i_left_end"),
  P("lg_i_rear_rail_right", "back_rail", "i_right_end"),
  P("lg_i_front_to_left", "i_front", "i_left_end"),
  P("lg_i_front_to_right", "i_front", "i_right_end"),
  P("lg_i_left_support", "i_left_support", "i_left_end"),
  P("lg_i_right_support", "i_right_support", "i_right_end"),
  P("lg_i_rail_back_left", "i_rail_back", "i_left_support"),
  P("lg_i_rail_back_right", "i_rail_back", "i_right_support"),
  P("lg_i_rail_front_left", "i_rail_front", "i_left_support"),
  P("lg_i_rail_front_right", "i_rail_front", "i_right_support"),
  P("lg_i_lid_on_rail", "i_lid", "i_rail_back"),
  // Frame parallel: each run like the L wing, the rear rail on the wall in a half slot on the seat front.
  ...(["left", "right"] as const).flatMap((s) => [
    P(`lg_${s}_rear_rail_side`, `${s}_rear_rail`, `${s}_side`),
    P(`lg_${s}_front_to_side`, `${s}_front`, `${s}_side`),
    P(`lg_${s}_inner_support`, `${s}_inner_support`, `${s}_side`),
    P(`lg_${s}_outer_support_front`, `${s}_outer_support`, `${s}_front`),
    P(`lg_${s}_lid_on_support`, `${s}_lid`, `${s}_inner_support`),
    P(`lg_${s}_strip_to_side`, `${s}_drawer_strip`, `${s}_side`),
    P(`lg_${s}_strip_on_rail`, `${s}_drawer_strip`, `${s}_drawer_rail`),
    P(`lg_${s}_drawer_rail_outer`, `${s}_drawer_rail`, `${s}_outer_support`),
    P(`lg_${s}_drawer_rail_inner`, `${s}_drawer_rail`, `${s}_inner_support`),
  ]),
];

/** Frame runs split into several lids: each middle support crosses both rails, each lid rests on the rear rail. */
function frameSplitDeclarations(ids: ReadonlySet<string>): RelationshipDeclaration[] {
  const out: RelationshipDeclaration[] = [];
  for (const id of ids) {
    const mid = /^(main|i|left|right)_mid_support_(\d+)$/.exec(id);
    if (mid) {
      out.push(P(`lg_${mid[1]}_rail_back_mid_${mid[2]}`, `${mid[1]}_rail_back`, id));
      out.push(P(`lg_${mid[1]}_rail_front_mid_${mid[2]}`, `${mid[1]}_rail_front`, id));
    }
    const lid = /^(main|i|left|right)_lid_(\d+)$/.exec(id);
    if (lid) out.push(P(`lg_${id}_on_rail`, id, `${lid[1]}_rail_back`));
  }
  return out;
}

export function relationshipDeclarationsForBoards(ids: ReadonlySet<string>): RelationshipDeclaration[] {
  return [...LOUNGE_RELATIONSHIP_DECLARATIONS, ...frameSplitDeclarations(ids)].filter((d) => ids.has(d.panelAId) && ids.has(d.panelBId));
}
