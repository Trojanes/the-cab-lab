/**
 * Turn panel-id declarations into FaceRef joints (docs/model-spec.md).
 * explode.js reads `j.a.board` / `j.b.board`; string ids are silently dropped.
 */
import {
  boundaryEdgeFaces,
  faceRef,
  joint,
  type AxisDir,
  type Board,
  type FaceId,
  type Joint,
} from "./model.ts";

const EPS = 0.6;

export interface JointDeclaration {
  declarationId: string;
  hostPanelId: string;
  targetPanelId: string;
  relationshipType?: string;
  allowedHardware?: string[];
  ruleId?: string;
}

function overlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return a0 < b1 - 0.01 && b0 < a1 - 0.01;
}

function contact(
  a: Board,
  b: Board,
): { axis: "x" | "y" | "z"; aSide: "+" | "-" } | null {
  const axes: Array<{
    axis: "x" | "y" | "z";
    a0: number; a1: number; b0: number; b1: number;
    o1: boolean; o2: boolean;
  }> = [
    { axis: "x", a0: a.x0, a1: a.x1, b0: b.x0, b1: b.x1, o1: overlap(a.y0, a.y1, b.y0, b.y1), o2: overlap(a.z0, a.z1, b.z0, b.z1) },
    { axis: "y", a0: a.y0, a1: a.y1, b0: b.y0, b1: b.y1, o1: overlap(a.x0, a.x1, b.x0, b.x1), o2: overlap(a.z0, a.z1, b.z0, b.z1) },
    { axis: "z", a0: a.z0, a1: a.z1, b0: b.z0, b1: b.z1, o1: overlap(a.x0, a.x1, b.x0, b.x1), o2: overlap(a.y0, a.y1, b.y0, b.y1) },
  ];
  let best: { axis: "x" | "y" | "z"; aSide: "+" | "-"; gap: number } | null = null;
  for (const ax of axes) {
    if (!ax.o1 || !ax.o2) continue;
    const gapRight = ax.b0 - ax.a1;
    const gapLeft = ax.a0 - ax.b1;
    if (gapRight >= -EPS && (best == null || Math.abs(gapRight) < Math.abs(best.gap))) {
      best = { axis: ax.axis, aSide: "+", gap: gapRight };
    }
    if (gapLeft >= -EPS && (best == null || Math.abs(gapLeft) < Math.abs(best.gap))) {
      best = { axis: ax.axis, aSide: "-", gap: gapLeft };
    }
  }
  return best ? { axis: best.axis, aSide: best.aSide } : null;
}

function facesToward(board: Board, axis: "x" | "y" | "z", side: "+" | "-", preferBig: boolean): FaceId[] {
  const dir = `${side}${axis.toUpperCase()}` as AxisDir;
  const thick = board.thicknessAxis.toLowerCase();
  if (thick === axis) return [side === "+" ? "A" : "B"];
  if (preferBig) return [];
  return boundaryEdgeFaces(board, dir).map((f) => f.id);
}

export function resolveDeclaredJoints(boards: Board[], declarations: JointDeclaration[]): Joint[] {
  const B = new Map(boards.map((b) => [b.id, b]));
  const out: Joint[] = [];
  for (const d of declarations) {
    const host = B.get(d.hostPanelId);
    const target = B.get(d.targetPanelId);
    if (!host || !target) continue;
    const c = contact(host, target);
    const faceContact = d.relationshipType === "face_contact";
    const kind = faceContact ? "face_contact" : "butt";
    if (!c) {
      // Overlapping face_contact still names the host's big faces so explode
      // can pull along that thickness axis instead of guessing AABB.
      const hostFaces: FaceId[] = faceContact ? ["A"] : [];
      const targetFaces: FaceId[] = [];
      out.push(joint(d.declarationId, kind, faceRef(host.id, hostFaces), faceRef(target.id, targetFaces), {
        hardware: d.allowedHardware, rule: d.ruleId,
      }));
      continue;
    }
    const hostFaces = facesToward(host, c.axis, c.aSide, faceContact);
    const targetSide = c.aSide === "+" ? "-" : "+";
    const targetFaces = facesToward(target, c.axis, targetSide, faceContact);
    out.push(joint(d.declarationId, kind, faceRef(host.id, hostFaces), faceRef(target.id, targetFaces), {
      hardware: d.allowedHardware, rule: d.ruleId,
    }));
  }
  return out;
}
