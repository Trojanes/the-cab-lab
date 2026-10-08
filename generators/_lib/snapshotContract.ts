/**
 * Runtime check that an emitted manufacturing snapshot satisfies the
 * `cabinetnc.manufacturing-snapshot` v1.1 hard rules — the same conditions
 * OmniCam's `ManufacturingSnapshotImporter` rejects, with the same codes,
 * so a producer-side failure reads identically on the cutting station.
 *
 * This is enforcement, not a second spec: the authority stays
 * `docs/manufacturing-snapshot-v1.*` on the OmniCam side.
 *
 * `errors` mirror importer errors (import refuses); `warnings` mirror
 * importer warnings (import continues).
 */

export interface SnapshotIssue {
  code: string;
  path: string;
  message: string;
}

export interface SnapshotVerdict {
  errors: SnapshotIssue[];
  warnings: SnapshotIssue[];
}

const SUPPORTED_KINDS = new Set(["bore", "groove", "pocket", "throughProfile"]);
const SCHEMA = "cabinetnc.manufacturing-snapshot";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

function readPoints(list: unknown, path: string, errors: SnapshotIssue[], minCount: number): [number, number][] {
  const pts: [number, number][] = [];
  if (Array.isArray(list)) {
    for (let i = 0; i < list.length; i += 1) {
      const p = list[i];
      if (Array.isArray(p) && p.length >= 2 && num(p[0]) !== null && num(p[1]) !== null) {
        pts.push([p[0] as number, p[1] as number]);
      } else {
        errors.push({ code: "point", path: `${path}[${i}]`, message: "point must contain two finite numbers" });
      }
    }
  }
  if (pts.length < minCount) {
    errors.push({ code: "points", path, message: `need at least ${minCount} valid points` });
  }
  return pts;
}

function checkFeature(
  feature: Obj,
  fpath: string,
  thicknessMm: number,
  blindFaces: Set<string>,
  errors: SnapshotIssue[],
  warnings: SnapshotIssue[],
): void {
  const id = str(feature.featureId);
  const kind = str(feature.kind);
  const geom = isObj(feature.geometry) ? feature.geometry : {};
  if (!SUPPORTED_KINDS.has(kind)) {
    warnings.push({
      code: kind ? "feature_kind_unsupported" : "feature_kind_skipped",
      path: `${fpath}.kind`,
      message: kind ? `feature kind ${kind} skipped (not projected for production NC)` : "feature kind missing — skipped",
    });
    return;
  }
  const through = feature.through === true || kind === "throughProfile";
  const sourceFace = str(feature.sourceFace).toUpperCase();
  if (!through && sourceFace !== "A" && sourceFace !== "B") {
    errors.push({ code: "feature_face", path: `${fpath}.sourceFace`, message: "blind feature sourceFace must be A or B" });
    return;
  }
  if (!through) {
    blindFaces.add(sourceFace);
    const depth = num(feature.depthMm);
    if (depth === null || depth <= 0) {
      errors.push({ code: "feature_depth", path: `${fpath}.depthMm`, message: "blind feature depthMm must be > 0" });
    } else if (depth > thicknessMm + 0.01) {
      errors.push({ code: "feature_depth", path: `${fpath}.depthMm`, message: "blind feature depth exceeds workpiece thickness" });
    }
  }
  const asThroughCutout = through && (kind === "groove" || kind === "throughProfile");
  if (kind === "bore") {
    const center = Array.isArray(geom.center) ? geom.center : [];
    const diameter = num(geom.diameterMm);
    if (center.length < 2 || num(center[0]) === null || num(center[1]) === null || diameter === null || diameter <= 0) {
      errors.push({ code: "bore_geometry", path: `${fpath}.geometry`, message: "bore requires center and diameterMm > 0" });
    }
  } else if (asThroughCutout) {
    const ring = isObj(geom.profile) && Array.isArray(geom.profile.points)
      ? (geom.profile.points as unknown[]).filter((p) => Array.isArray(p) && p.length >= 2)
      : [];
    if (ring.length < 3) {
      const centerlineErr: SnapshotIssue[] = [];
      const cl = readPoints(geom.centerline, `${fpath}.geometry.centerline`, centerlineErr, 2);
      const width = num(geom.widthMm) ?? 0;
      // Importer rebuilds a stadium outline from centerline+width; failing that it rejects.
      if (cl.length < 2 || width <= 0) {
        errors.push({ code: "through_cutout_geometry", path: `${fpath}.geometry`, message: "through cutout requires a closed profile (or centerline+width)" });
      }
    }
  } else if (kind === "groove") {
    readPoints(geom.centerline, `${fpath}.geometry.centerline`, errors, 2);
    const width = num(geom.widthMm);
    if (width === null || width <= 0) {
      errors.push({ code: "groove_width", path: `${fpath}.geometry.widthMm`, message: "groove widthMm must be > 0" });
    }
    if (isObj(geom.profile) && Array.isArray(geom.profile.points) && (geom.profile.points as unknown[]).length > 0) {
      readPoints(geom.profile.points, `${fpath}.geometry.profile.points`, errors, 3);
    }
  } else {
    // pocket (and any blind profile kind): closed profile, >= 3 points.
    readPoints(isObj(geom.profile) ? geom.profile.points : [], `${fpath}.geometry.profile.points`, errors, 3);
  }
  void id;
}

export function validateSnapshot(snap: unknown): SnapshotVerdict {
  const errors: SnapshotIssue[] = [];
  const warnings: SnapshotIssue[] = [];
  if (!isObj(snap)) {
    return { errors: [{ code: "root", path: "$", message: "snapshot root must be an object" }], warnings };
  }
  if (str(snap.schema) !== SCHEMA) {
    errors.push({ code: "schema", path: "$.schema", message: `snapshot schema must be ${SCHEMA}` });
  }
  const version = str(snap.schemaVersion);
  if (!/^1\.\d+\.\d+$/.test(version)) {
    errors.push({ code: "schemaVersion", path: "$.schemaVersion", message: `unsupported schemaVersion ${version || "(missing)"}` });
  }
  if (str(snap.units) !== "mm") {
    errors.push({ code: "units", path: "$.units", message: "manufacturing snapshot units must be mm" });
  }
  if (!str(snap.jobId)) {
    errors.push({ code: "jobId", path: "$.jobId", message: "jobId is required" });
  }
  if (Array.isArray(snap.diagnostics)) {
    for (const d of snap.diagnostics) {
      if (isObj(d) && str(d.severity).toLowerCase() === "error") {
        errors.push({
          code: str(d.code) || "source_diagnostic",
          path: str(d.entityId) || "$.diagnostics",
          message: str(d.message) || "source reported an error diagnostic",
        });
      }
    }
  }
  const workpieces = Array.isArray(snap.workpieces) ? snap.workpieces : [];
  if (workpieces.length === 0) {
    errors.push({ code: "workpieces_empty", path: "$.workpieces", message: "need at least one workpiece" });
  }
  for (let i = 0; i < workpieces.length; i += 1) {
    const w = workpieces[i];
    const path = `$.workpieces[${i}]`;
    if (!isObj(w)) {
      errors.push({ code: "workpiece", path, message: "workpiece must be an object" });
      continue;
    }
    if (!str(w.workpieceId)) {
      errors.push({ code: "workpieceId", path: `${path}.workpieceId`, message: "workpieceId is required" });
    }
    if (!str(w.panelId) && !str(w.workpieceId)) {
      errors.push({ code: "panelId", path: `${path}.panelId`, message: "panelId or workpieceId is required" });
    }
    const material = isObj(w.material) ? w.material : {};
    const thickness = num(material.thicknessMm);
    if (!str(material.materialId)) {
      errors.push({ code: "materialId", path: `${path}.material.materialId`, message: "materialId is required" });
    }
    if (thickness === null || thickness <= 0) {
      errors.push({ code: "thickness", path: `${path}.material.thicknessMm`, message: "thicknessMm must be > 0" });
    }
    const geometry = isObj(w.geometry) ? w.geometry : {};
    const quality = str(geometry.quality);
    if (quality !== "exact" && quality !== "tessellated") {
      errors.push({ code: "geometry_quality", path: `${path}.geometry.quality`, message: `production geometry must be exact or tessellated (got ${quality || "(missing)"})` });
    }
    const nesting = Array.isArray(geometry.nestingPolygon) ? geometry.nestingPolygon : [];
    const outerPts = isObj(geometry.outerProfile) ? geometry.outerProfile.points : [];
    const outlineSrc = nesting.length >= 3 ? nesting : outerPts;
    const outline = readPoints(outlineSrc, `${path}.geometry.outerProfile.points`, errors, 3);

    const features = Array.isArray(w.features) ? w.features : [];
    const featureIds = new Set<string>();
    const blindFaces = new Set<string>();
    for (let fi = 0; fi < features.length; fi += 1) {
      const f = features[fi];
      const fpath = `${path}.features[${fi}]`;
      if (!isObj(f)) {
        errors.push({ code: "feature", path: fpath, message: "feature must be an object" });
        continue;
      }
      const fid = str(f.featureId);
      if (!fid) {
        errors.push({ code: "featureId", path: `${fpath}.featureId`, message: "featureId is required" });
        continue;
      }
      const fidKey = fid.toLowerCase();
      if (featureIds.has(fidKey)) {
        errors.push({ code: "featureId_duplicate", path: `${fpath}.featureId`, message: `duplicate featureId ${fid}` });
        continue;
      }
      featureIds.add(fidKey);
      checkFeature(f, fpath, thickness ?? 0, blindFaces, errors, warnings);
    }
    if (blindFaces.size > 1) {
      errors.push({ code: "double_side_unsupported", path: `${path}.features`, message: "blind features exist on both A and B; CabinetNC supports single-side machining only" });
    }
    const machiningFace = blindFaces.size === 1 ? [...blindFaces][0]! : "A";
    const manufacturing = isObj(w.manufacturing) ? w.manufacturing : null;
    if (manufacturing) {
      const mode = str(manufacturing.mode);
      if (mode.toLowerCase() !== "singleside") {
        errors.push({ code: "manufacturing_mode", path: `${path}.manufacturing.mode`, message: "only singleSide manufacturing is supported" });
      }
      const declaredFace = str(manufacturing.machiningFace).toUpperCase();
      if (blindFaces.size === 1 && (declaredFace === "A" || declaredFace === "B") && declaredFace !== machiningFace) {
        errors.push({ code: "machining_face_mismatch", path: `${path}.manufacturing.machiningFace`, message: `declared face ${declaredFace} conflicts with feature face ${machiningFace}` });
      }
      if (declaredFace === "EITHER") {
        const faces = Array.isArray(w.faces) ? w.faces : [];
        const locked = faces.some((f) => isObj(f) && str(f.machiningPermission).toUpperCase() === "NOT_ALLOWED");
        if (blindFaces.size > 0 || locked) {
          warnings.push({
            code: "machining_face_either_ignored",
            path: `${path}.manufacturing.machiningFace`,
            message: blindFaces.size > 0
              ? `EITHER declared but blind features are on ${machiningFace}; the part is milled from that face`
              : "EITHER declared but a face is NOT_ALLOWED; the part is not flipped",
          });
        }
      }
    }
    if ((material.grained === true)
      && !str(w.grainDirection)
      && !str(manufacturing?.grainDirection)
    ) {
      warnings.push({ code: "grain_missing", path: `${path}.grainDirection`, message: `material ${str(material.materialId)} is grained but the part has no grain direction; it may be nested across the grain` });
    }
    if (!Array.isArray(w.faces) || w.faces.length === 0) {
      warnings.push({ code: "faces_missing", path: `${path}.faces`, message: "no A/B finish metadata supplied" });
    }
    const edgeBands = Array.isArray(w.edgeBands) ? w.edgeBands : [];
    const seenEdges = new Set<number>();
    const nEdges = outline.length;
    for (let bi = 0; bi < edgeBands.length; bi += 1) {
      const band = edgeBands[bi];
      const bpath = `${path}.edgeBands[${bi}]`;
      if (!isObj(band)) {
        errors.push({ code: "edge_band_index", path: `${bpath}.i`, message: "edge index i is required" });
        continue;
      }
      const index = band.i;
      if (typeof index !== "number" || !Number.isInteger(index)) {
        errors.push({ code: "edge_band_index", path: `${bpath}.i`, message: "edge index i is required" });
        continue;
      }
      if (index < 0 || index >= nEdges) {
        errors.push({ code: "edge_band_index", path: `${bpath}.i`, message: `edge ${index} is outside the outline (${nEdges} edges)` });
        continue;
      }
      if (seenEdges.has(index)) {
        errors.push({ code: "edge_band_duplicate", path: `${bpath}.i`, message: `edge ${index} is banded twice` });
        continue;
      }
      seenEdges.add(index);
      const bt = num(band.thicknessMm);
      if (bt === null || bt <= 0) {
        errors.push({ code: "edge_band_thickness", path: `${bpath}.thicknessMm`, message: "thicknessMm must be > 0" });
      }
    }
  }
  return { errors, warnings };
}
