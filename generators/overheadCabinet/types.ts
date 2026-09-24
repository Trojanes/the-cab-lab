// Board / face / joint records are the shared model (generators/_lib/model.ts, docs/model-spec.md).
export type { Board, Face, FaceFeature, Joint, ProfilePoint } from "../_lib/model.ts";
import type { Joint } from "../_lib/model.ts";
import type { Board } from "../_lib/model.ts";

export interface OverheadCabinetParams {
  style?: "style_1" | "style_2" | string;
  cabinetWidth: number;
  cabinetDepth: number;
  cabinetHeight?: number;
  /** Carcass / structural board colour. Default White Stipple (double-sided). */
  carcassColor?: string;
  carcassColorName?: string;
  /** Door colour name on the flap fronts' room face. Default Gloss White. */
  doorColor?: string;
  doorColorName?: string;
  /** T3 top-face LED T-groove (opens upward). Default on when omitted. */
  ledGroove?: boolean;
  topClearanceHeight?: number;
  frontPanelThickness?: number;
  clearance?: number;
  hingeHoleDiameter?: number;
  hingeHoleDepth?: number;
  hingeHoleFromTop?: number;
  hingeHoleFromSide?: number;
  selectedZoneIndex?: number;
  /** Rangehood carcass insert. Only one contiguous rangehood group is allowed per OHC. */
  rangehoodPreset?: "NCE" | string;
  /** Clear distance from BP top face to RGHD_TOP bottom face. */
  rangehoodClearHeight?: number;
  rangehoodAlignment?: "left" | "right" | string;
  /** Cutout distance from the selected outer D inner face. Minimum 40 mm for NCE. */
  rangehoodEdgeOffsetX?: number;
  // Legacy aliases kept for bridge/backwards compatibility.
  bottomThickness?: number;
  dividerTongueHeight?: number;
  routerDiameter?: number;
  featureWidth?: number;
  internalDividerCenterlines?: number[];
  zones?: Array<{
    id?: string;
    type: "up_flap" | "rangehood_flap" | "fixed_panel" | "open" | string;
    width: number;
  }>;
}

export interface OverheadValidation {
  errors: string[];
  warnings: string[];
}

export interface RelationshipDeclaration {
  declarationId: string;
  generator: "overhead";
  panelAId: string;
  panelBId: string;
  relationshipType: "structural_butt_joint" | "face_contact";
  geometryType: "edge_to_surface" | "surface_to_surface";
  hostPanelId: string;
  targetPanelId: string;
  ruleId: string;
  allowedHardware: string[];
}

import type { Provenance } from "../_lib/dim.ts";

export interface OverheadCabinetResult {
  params: Required<
    Pick<OverheadCabinetParams, "cabinetWidth" | "cabinetDepth"> & {
      cabinetHeight: number;
      style: string;
      topClearanceHeight: number;
      frontPanelThickness: number;
      clearance: number;
              hingeHoleDiameter: number;
              hingeHoleDepth: number;
              hingeHoleFromTop: number;
              hingeHoleFromSide: number;
      bottomThickness: number;
      dividerTongueHeight: number;
      routerDiameter: number;
      featureWidth: number;
      internalDividerCenterlines: number[];
      carcassColor: string;
      carcassColorName: string;
      rangehoodPreset: string;
      rangehoodClearHeight: number;
      rangehoodAlignment: string;
      rangehoodEdgeOffsetX: number;
    }
  >;
  /** Board layer: each board carries its faces (A / B / E<i>) with the features that belong to them. */
  boards: Board[];
  /** Flat legacy view of the same features (grooves, hinge holes, LED, rangehood); kept for existing consumers. */
  features: unknown[];
  /** Face ↔ face joints (the model-layer form of `relationshipDeclarations`). */
  joints: Joint[];
  relationshipDeclarations: RelationshipDeclaration[];
  validation: OverheadValidation;
  debug: {
    phase: "geometry_v1" | "skeleton_v0";
    /** Boards are already in their assembled pose; consumers must not move them. */
    boardFrame: "final";
    dividerCenterlines: number[];
    legacyGeometry?: unknown;
    svgPreview?: string;
    /** Every board face / outline point / feature coordinate with its formula and named terms (see docs/bench-spec.md). */
    provenance?: Provenance;
  };
}
