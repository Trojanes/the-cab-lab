/**
 * Overhead cabinet ??face layer (docs/model-spec.md).
 *
 * Takes the boards in their final pose plus the geometry's feature records and
 * hangs every one of them on the face it is machined into:
 *
 *   BP.A        divider grooves (BG_D<i>), rangehood cutout (through)
 *   D<i>.E*     tongue (into BP), T3 notch, T4 notch ??tags on the outline edges
 *   D<i>.A/B    rangehood side grooves
 *   T2/T3/T4.A  divider screw pilot holes (through)
 *   T3.A        LED T-groove (main + two branches)
 *   FP<i>.A     hinge cups (back face, +Y)
 *   RGHD_TOP.A  internal divider grooves
 *
 * The outline stays the geometric truth; this file never moves a point. Where
 * a feature had no provenance yet (screw holes, LED, rangehood) it records one
 * under `<board>.feat.<featureId>.<field>`.
 */
import { dim, param, ref, type Term } from "../_lib/dim.ts";
import {
  addFeature,
  annotate,
  bigFaceToward,
  boundaryEdgeFaces,
  edgeFaces,
  edgeFacesIn,
  faceOf,
  faceRef,
  joint,
  localRect,
  planeAxes,
  tagEdges,
  type AxisDir,
  type Board,
  type Joint,
} from "../_lib/model.ts";
import { setEdgeBand } from "../_lib/edgeBand.ts";
import { RULES as R, type OverheadCabinetInputs, type OverheadLegacyGeometry } from "./geometry.ts";
import type { RelationshipDeclaration } from "./relationshipDeclarations.ts";

type Rec = Record<string, unknown>;

interface FaceBuildInputs {
  boards: Board[];
  geometry: OverheadLegacyGeometry;
  inputs: OverheadCabinetInputs;
  /** Divider indices whose BP groove is suppressed (they stand on RGHD_TOP). */
  suppressedGrooves: number[];
  ledFeatures: Rec[];
  rangehoodFeatures: Rec[];
  declarations: RelationshipDeclaration[];
  carcassColorName: string;
  doorColour: string;
}

const EPS = 0.01;

function byId(boards: Board[]): Map<string, Board> {
  return new Map(boards.map((b) => [b.id, b]));
}

/** `inputs.x ?? rule` as a term (same convention as geometry.ts). */
function orRule<T extends Term>(v: number | null | undefined, name: string, rule: T): Term {
  return v == null ? rule : param({ [name]: v })[name]!;
}

export function buildOverheadFaces(fb: FaceBuildInputs): Joint[] {
  const { boards, geometry, inputs } = fb;
  const B = byId(boards);
  const cpt = geometry.manufacturing.FGw;
  const CPT = orRule(inputs.featureWidth, "CPT", R.DIVIDER_THICKNESS_MM);
  const TCH = orRule(inputs.topClearanceHeight, "TCH", R.T1_HEIGHT_MM);

  // --- stock + annotations -------------------------------------------------------
  for (const b of boards) {
    b.role = b.category;
    const isFront = b.category === "front_panel" || b.id === "T1";
    b.stock = { kind: isFront ? "door" : "carcass", thickness: b.materialThickness, colour: isFront ? undefined : fb.carcassColorName };
    if (!isFront) {
      annotate(b, "A", { finish: { colour: fb.carcassColorName } });
      annotate(b, "B", { finish: { colour: fb.carcassColorName } });
    }
    if (isFront) {
      // Flap fronts and the T1 front rail: door stock, room face B (-Y).
      b.stock = { kind: "door", thickness: b.materialThickness, colour: fb.doorColour };
      annotate(b, "B", { semantic: "front", visible: true, finish: { colour: fb.doorColour } });
      annotate(b, "A", { semantic: "back", visible: false });
    }
  }
  const bp = B.get("BP");
  if (bp) {
    annotate(bp, "A", { semantic: "inside" });
    annotate(bp, "B", { semantic: "bottom", visible: true });
  }
  const dividers = boards.filter((b) => b.category === "divider");
  if (dividers.length) {
    annotate(dividers[0]!, "B", { semantic: "outside" });
    annotate(dividers[dividers.length - 1]!, "A", { semantic: "outside" });
    for (const d of dividers.slice(1, -1)) {
      annotate(d, "A", { semantic: "inside" });
      annotate(d, "B", { semantic: "inside" });
    }
    annotate(dividers[0]!, "A", { semantic: "inside" });
    annotate(dividers[dividers.length - 1]!, "B", { semantic: "inside" });
  }
  const t3 = B.get("T3");
  if (t3) {
    annotate(t3, "A", { semantic: "top" });
    annotate(t3, "B", { semantic: "bottom" });
  }

  // Visible outer edges only. Notches, tongues and strip ends stay bare.
  // Door leaves take the door colour. Carcass edges that bound the visible
  // interior take the carcass colour. T1, T2 and the rangehood front and
  // back boards have no free edge.
  const tape = R.EDGE_BAND_THICKNESS_MM.value;
  const band = (b: Board | undefined, normal: AxisDir, colour: string) => {
    if (!b) return;
    for (const f of boundaryEdgeFaces(b, normal)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour });
  };
  for (const b of boards) {
    if (b.category !== "front_panel") continue;
    for (const f of edgeFaces(b)) setEdgeBand(b, Number(f.id.slice(1)), { thickness: tape, colour: fb.doorColour });
  }
  band(bp, "-Y", fb.carcassColorName);
  for (const d of dividers) band(d, "-Y", fb.carcassColorName);
  band(t3, "-Y", fb.carcassColorName);
  band(t3, "+Y", fb.carcassColorName);
  band(B.get("T4"), "-Z", fb.carcassColorName);
  band(B.get("RGHD_TOP"), "-Y", fb.carcassColorName);

  // --- BP: divider grooves -------------------------------------------------------
  if (bp) {
    geometry.divider_features.forEach((df, index) => {
      if (fb.suppressedGrooves.includes(index) || !df.bp_groove) return;
      const g = df.bp_groove;
      const r = localRect(bp, { x: g.x, y: g.y });
      addFeature(bp, "A", {
        id: g.id,
        kind: "groove",
        ...r,
        depth: Math.abs(g.z[1] - g.z[0]),
        for: df.id,
        key: `BP.feat.${g.id}`,
        source: "overhead",
      });
    });
  }

  // --- dividers: tongue / notch tags on the outline edges -------------------------
  // Outline shape (dividerSideTrimmedOutlinePoints): tongue below v = 0 between tongueY0..Y1;
  // rear notch u = Cd - slot .. Cd, v = top - (T4_HEIGHT - CPT) .. top; front step u = 0 .. frontStepY1,
  // v = top - TCH - slot .. top - TCH (T3 sits on the lower step).
  const slot = geometry.manufacturing.FeatureSlotWidth;
  const tch = geometry.manufacturing.TCH;
  for (const [index, df] of geometry.divider_features.entries()) {
    const d = B.get(df.id);
    if (!d) continue;
    const onRangehood = fb.suppressedGrooves.includes(index);
    const [tongueY0, tongueY1] = df.divider_tongue.y;
    const tongueH = Math.abs(df.divider_tongue.z[0] - df.divider_tongue.z[1]);
    const zTop = d.z1 - d.z0;
    // Local (u, v) = (y - y0, z - z0); the tongue dips below v = 0.
    tagEdges(d, "tongue", { u0: tongueY0 - d.y0 - EPS, u1: tongueY1 - d.y0 + EPS, v0: -tongueH - EPS, v1: -EPS }, {
      id: `${df.id}_TONGUE`,
      for: onRangehood ? "RGHD_TOP" : "BP",
      source: "overhead",
    });
    if (B.has("T3")) {
      const frontStepY1 = R.FRONT_TOP_NOTCH_Y_OFFSET_MM.value + R.FRONT_TOP_STEP_Y_MM.value;
      tagEdges(d, "notch", { u0: -EPS, u1: frontStepY1 + EPS, v0: zTop - tch - slot - EPS, v1: zTop - tch + EPS }, {
        id: `${df.id}_T3_STEP`,
        for: "T3",
        source: "overhead",
      });
    }
    if (B.has("T4")) {
      const rearNotchH = R.T4_HEIGHT_MM.value - cpt;
      tagEdges(d, "notch", { u0: d.y1 - d.y0 - slot - EPS, u1: d.y1 - d.y0 + EPS, v0: zTop - rearNotchH - EPS, v1: zTop - EPS }, {
        id: `${df.id}_T4_NOTCH`,
        for: "T4",
        source: "overhead",
      });
    }
  }

  // --- T2 / T3 / T4: screw pilot holes into the divider edges --------------------------
  const midlineTerm: Record<string, { terms: Record<string, Term>; fn: (t: Record<string, number>) => number }> = {
    T2: { terms: { TCH }, fn: (t) => t.TCH / 2 },
    T3: { terms: { T3_DEPTH: R.T3_DEPTH_MM }, fn: (t) => t.T3_DEPTH / 2 },
    T4: {
      terms: { T4_NOTCH: R.T4_NOTCH_HEIGHT_MM, CLEAR: R.T4_SCREW_HOLE_NOTCH_CLEARANCE_MM, SHIFT: R.T4_SCREW_HOLE_UP_SHIFT_MM },
      fn: (t) => t.T4_NOTCH + t.CLEAR + t.SHIFT,
    },
  };
  for (const part of ["T2", "T3", "T4"] as const) {
    const board = B.get(part);
    if (!board) continue;
    const [U, V] = planeAxes(board.profilePlane);
    for (const hole of geometry.panel_screw_holes[part]) {
      const K = `${part}.feat.${hole.id}`;
      const df = geometry.divider_features.find((f) => f.id === hole.for_divider);
      const cu = dim(`${K}.${U}`, { XDi: df?.XDi ?? hole.center[0], [`${part}_${U}0`]: ref(`${part}.${U}0`) }, (t) => t.XDi - t[`${part}_${U}0`]!, { formula: `XDi - ${part}.${U}0` });
      const m = midlineTerm[part]!;
      const cv = dim(`${K}.${V}`, m.terms, m.fn);
      addFeature(board, "A", {
        id: hole.id,
        kind: "hole",
        center: [cu, cv],
        diameter: hole.diameter,
        depth: hole.depth,
        through: false,
        for: hole.for_divider,
        key: K,
        source: "overhead",
      });
    }
  }

  // --- fronts: hinge cups on the back face -------------------------------------------
  for (const h of geometry.hinge_holes) {
    const fp = B.get(h.boardId);
    if (!fp) continue;
    const n = h.id.replace(`${h.boardId}_`, "");
    addFeature(fp, "A", {
      id: h.id,
      kind: "hole",
      center: [h.center[0], h.center[1]],
      diameter: h.diameter,
      depth: h.depth,
      through: false,
      for: "hinge",
      key: `${h.boardId}.feat.${n}`,
      source: "overhead",
    });
  }

  // --- T3: LED T-groove on the top face -------------------------------------------------
  for (const led of fb.ledFeatures) {
    if (led.type !== "t3_groove" || !t3) continue;
    const main = led.main as { x0: number; x1: number; y0: number; y1: number };
    const branches = (led.branches as Array<{ x0: number; x1: number; y0: number; y1: number }>) ?? [];
    const depth = Number(led.depth);
    const KM = "T3.feat.LED_MAIN";
    dim(`${KM}.x0`, {}, () => 0, { formula: "0" });
    dim(`${KM}.x1`, { x1: ref("T3.x1"), x0: ref("T3.x0") }, (t) => t.x1 - t.x0);
    dim(`${KM}.y0`, { LAND: R.LED_GROOVE_FRONT_LAND_MM }, (t) => t.LAND);
    dim(`${KM}.y1`, { LAND: R.LED_GROOVE_FRONT_LAND_MM, W: R.LED_GROOVE_WIDTH_MM }, (t) => t.LAND + t.W);
    addFeature(t3, "A", {
      id: "T3_LED_MAIN",
      kind: "tgroove",
      u0: main.x0, u1: main.x1, v0: main.y0, v1: main.y1,
      depth,
      for: "led",
      key: KM,
      source: "T3",
    });
    branches.forEach((br, i) => {
      const KB = `T3.feat.LED_BRANCH_${i + 1}`;
      const x = i === 0
        ? { terms: { INSET: R.LED_GROOVE_BRANCH_END_INSET_MM, W: R.LED_GROOVE_WIDTH_MM }, x0: (t: Record<string, number>) => t.INSET - t.W / 2, x1: (t: Record<string, number>) => t.INSET + t.W / 2 }
        : { terms: { width: ref(`${KM}.x1`), INSET: R.LED_GROOVE_BRANCH_END_INSET_MM, W: R.LED_GROOVE_WIDTH_MM }, x0: (t: Record<string, number>) => t.width - t.INSET - t.W / 2, x1: (t: Record<string, number>) => t.width - t.INSET + t.W / 2 };
      dim(`${KB}.x0`, x.terms, x.x0);
      dim(`${KB}.x1`, x.terms, x.x1);
      dim(`${KB}.y0`, { mainY1: ref(`${KM}.y1`) }, (t) => t.mainY1);
      dim(`${KB}.y1`, { rearY: ref("T3.pv.rearY") }, (t) => t.rearY);
      addFeature(t3, "A", {
        id: `T3_LED_BRANCH_${i + 1}`,
        kind: "tgroove",
        u0: br.x0, u1: br.x1, v0: br.y0, v1: br.y1,
        depth,
        for: "led",
        key: KB,
        source: "T3",
      });
    });
  }

  // --- rangehood -----------------------------------------------------------------------
  for (const f of fb.rangehoodFeatures) {
    const type = String(f.type);
    if (type === "rangehood_bp_cutout" && bp) {
      const r = localRect(bp, { x: f.x as [number, number], y: f.y as [number, number] });
      const K = "BP.feat.RGHD_CUTOUT";
      const Cd = param({ Cd: inputs.cabinetDepth }).Cd;
      const edgeOffsetX = param({ edgeOffsetX: Number(f.edgeOffsetX) }).edgeOffsetX;
      if (String(f.alignment) === "left") {
        dim(`${K}.x0`, { rghdX0: ref("RGHD_FRONT.x0"), edgeOffsetX }, (t) => t.rghdX0 + t.edgeOffsetX);
      } else {
        dim(`${K}.x0`, { rghdX1: ref("RGHD_FRONT.x1"), edgeOffsetX, W: R.RANGEHOOD_CUTOUT_WIDTH_MM }, (t) => t.rghdX1 - t.edgeOffsetX - t.W);
      }
      dim(`${K}.x1`, { x0: ref(`${K}.x0`), W: R.RANGEHOOD_CUTOUT_WIDTH_MM }, (t) => t.x0 + t.W);
      dim(`${K}.y0`, { Cd, D: R.RANGEHOOD_CUTOUT_DEPTH_MM }, (t) => (t.Cd - t.D) / 2);
      dim(`${K}.y1`, { y0: ref(`${K}.y0`), D: R.RANGEHOOD_CUTOUT_DEPTH_MM }, (t) => t.y0 + t.D);
      addFeature(bp, "A", { id: String(f.id), kind: "cutout", ...r, through: true, for: "rangehood", key: K, source: "overhead_rangehood" });
    } else if (type === "rangehood_divider_side_groove") {
      const d = B.get(String(f.targetBoardId));
      if (!d) continue;
      const face = bigFaceToward(d, f.face as "+X" | "-X");
      if (!face) continue;
      const r = localRect(d, { y: f.y as [number, number], z: f.z as [number, number] });
      addFeature(d, face.id, { id: String(f.id), kind: "groove", ...r, depth: Number(f.depth), for: "RGHD_TOP", source: "overhead_rangehood" });
    } else if (type === "rangehood_top_divider_groove") {
      const top = B.get(String(f.targetBoardId));
      if (!top) continue;
      const r = localRect(top, { x: f.x as [number, number], y: f.y as [number, number] });
      addFeature(top, "A", { id: String(f.id), kind: "groove", ...r, depth: Number(f.depth), for: String(f.dividerBoardId), source: "overhead_rangehood" });
    }
  }

  // --- joints: the declared relationships, resolved to faces ----------------------------
  const joints: Joint[] = [];
  for (const decl of fb.declarations) {
    const a = B.get(decl.hostPanelId);
    const b = B.get(decl.targetPanelId);
    if (!a || !b) continue;
    if (decl.relationshipType === "face_contact") {
      // T1 (+Y face) against T2 (-Y face): the big faces that look at each other.
      const fa = faceOf(a, a.y1 <= b.y0 + EPS ? "A" : "B");
      const fbk = faceOf(b, fa.id === "A" ? "B" : "A");
      joints.push(joint(decl.declarationId, "face_contact", faceRef(a.id, [fa]), faceRef(b.id, [fbk]), { hardware: decl.allowedHardware, rule: decl.ruleId }));
      continue;
    }
    // edge_to_surface: target's edge faces meet the host's big face.
    if (a.id === "BP") {
      if (b.category === "divider") {
        // Divider body bottom edges sit on BP.A (the tongue itself is the groove joint).
        const bottom = edgeFacesIn(b, { u0: -EPS, u1: b.y1 - b.y0 + EPS, v0: -EPS, v1: EPS });
        joints.push(joint(decl.declarationId, "tongue_groove", faceRef("BP", ["A"]), faceRef(b.id, bottom), { hardware: decl.allowedHardware, rule: decl.ruleId }));
      } else {
        // Front hangs in front of BP: BP's front edge (-Y) meets the front's back face.
        joints.push(joint(decl.declarationId, "butt", faceRef("BP", boundaryEdgeFaces(a, "-Y")), faceRef(b.id, ["A"]), { hardware: decl.allowedHardware, rule: decl.ruleId }));
      }
      continue;
    }
    if (a.category === "divider" && b.category === "front_panel") {
      joints.push(joint(decl.declarationId, "butt", faceRef(a.id, boundaryEdgeFaces(a, "-Y")), faceRef(b.id, ["A"]), { hardware: decl.allowedHardware, rule: decl.ruleId }));
      continue;
    }
    joints.push(joint(decl.declarationId, "butt", faceRef(a.id, []), faceRef(b.id, []), { hardware: decl.allowedHardware, rule: decl.ruleId }));
  }
  void CPT;
  return joints;
}
