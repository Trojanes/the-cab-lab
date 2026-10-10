// @ts-nocheck
// Semantic diff of two manufacturing snapshots — the report a generator code
// change produces. Not a text diff: entries name what changed at the level
// manufacturing cares about (material / workpiece / feature / leaf field),
// so a reviewer or agent sees "B3_LED_MAIN groove widthMm 14.5 → 16", not
// moved JSON lines.
//
// Compare keys: workpieceId (stable role id, ADR-004), featureId, materialId.
// exportedAt is always ignored; callers may pass ignorePaths for others
// (e.g. jobId / identity.projectId when diffing live output vs fixture).

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Leaf-level diffs between two values: [{ path, before, after }]. */
function leafDiffs(a, b, path = "", out = []) {
  if (same(a, b)) return out;
  if (isObj(a) && isObj(b)) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
      leafDiffs(a[k], b[k], path ? `${path}.${k}` : k, out);
    }
    return out;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) leafDiffs(a[i], b[i], `${path}[${i}]`, out);
    return out;
  }
  out.push({ path, before: a, after: b });
  return out;
}

/** Diff maps keyed by id → added / removed / changed. */
function diffById(beforeMap, afterMap, entryDiff) {
  const added = [], removed = [], changed = [];
  for (const id of Object.keys(afterMap)) {
    if (!(id in beforeMap)) added.push(id);
  }
  for (const id of Object.keys(beforeMap)) {
    if (!(id in afterMap)) removed.push(id);
    else {
      const c = entryDiff(id, beforeMap[id], afterMap[id]);
      if (c) changed.push(c);
    }
  }
  return { added, removed, changed };
}

const byId = (list, key) => Object.fromEntries((list || []).map((e) => [e[key], e]));

/**
 * diffSnapshots(before, after, { ignorePaths }) → semantic report.
 * `ignorePaths`: leaf paths to drop (prefix match, e.g. "exportedAt").
 */
export function diffSnapshots(before, after, { ignorePaths = ["exportedAt"] } = {}) {
  const drop = (d) => !ignorePaths.some((p) => d.path === p || d.path.startsWith(p + ".") || d.path.startsWith(p + "["));

  // materials is an id→material map in the emitted snapshot (accept a list too).
  const matMap = (m) => (Array.isArray(m) ? byId(m, "materialId") : m || {});
  const materials = diffById(matMap(before.materials), matMap(after.materials),
    (id, a, b) => {
      const fields = leafDiffs(a, b).filter(drop);
      return fields.length ? { materialId: id, fields } : null;
    });

  const workpieces = diffById(byId(before.workpieces, "workpieceId"), byId(after.workpieces, "workpieceId"),
    (id, a, b) => {
      const entry = { workpieceId: id, role: b.identity?.role ?? a.identity?.role };
      // Feature list compared element-wise below; lift it out of the leaf pass.
      const fields = leafDiffs({ ...a, features: undefined }, { ...b, features: undefined }).filter(drop);
      const profileChanged = fields.some((f) => f.path.startsWith("geometry.outerProfile") || f.path.startsWith("geometry.nestingPolygon"));
      const features = diffById(byId(a.features, "featureId"), byId(b.features, "featureId"),
        (fid, fa, fb) => {
          const fFields = leafDiffs(fa, fb).filter(drop);
          return fFields.length ? { featureId: fid, kind: fb.kind ?? fa.kind, fields: fFields } : null;
        });
      if (!fields.length && !features.added.length && !features.removed.length && !features.changed.length) return null;
      return { ...entry, fields, profileChanged, features };
    });

  const header = leafDiffs(
    { schema: before.schema, schemaVersion: before.schemaVersion, units: before.units, jobId: before.jobId },
    { schema: after.schema, schemaVersion: after.schemaVersion, units: after.units, jobId: after.jobId },
  ).filter(drop);

  const diagnostics = leafDiffs(before.diagnostics || [], after.diagnostics || [], "diagnostics").filter(drop);
  const relationships = leafDiffs(before.relationships || [], after.relationships || [], "relationships").filter(drop);

  return {
    header, materials, workpieces, diagnostics, relationships,
    summary: {
      materialsChanged: materials.changed.length, materialsAdded: materials.added.length, materialsRemoved: materials.removed.length,
      workpiecesChanged: workpieces.changed.length, workpiecesAdded: workpieces.added.length, workpiecesRemoved: workpieces.removed.length,
      featuresChanged: workpieces.changed.reduce((n, w) => n + w.features.changed.length, 0),
      featuresAdded: workpieces.changed.reduce((n, w) => n + w.features.added.length, 0),
      featuresRemoved: workpieces.changed.reduce((n, w) => n + w.features.removed.length, 0),
      diagnosticsChanged: diagnostics.length,
    },
  };
}

/** True when two snapshots differ only on ignored paths. */
export function snapshotsEqual(before, after, opts) {
  const d = diffSnapshots(before, after, opts);
  return d.header.length === 0 && d.diagnostics.length === 0 && d.relationships.length === 0
    && !d.materials.added.length && !d.materials.removed.length && !d.materials.changed.length
    && !d.workpieces.added.length && !d.workpieces.removed.length && !d.workpieces.changed.length;
}
