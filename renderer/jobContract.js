// job.v2 contract — the structural rules a migrated job must satisfy before
// it becomes app state. Companion spec: docs/job.schema.json (this file is
// enforcement; the schema doc is the authority).
//
// Pure functions, no imports: testable without the renderer. loadJob passes
// the implemented space kinds so a file naming a kind the app cannot resolve
// is refused here instead of crashing later in resolveSpace.

const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const fin = (v) => typeof v === "number" && Number.isFinite(v);

/**
 * Pre-migration check: only the fields `migrate()` dereferences. A file that
 * fails here would otherwise crash inside migrate (e.g. getModule on a
 * missing or retired moduleId) with an opaque message — refuse it readably.
 * `moduleIds` = the ids the current build can generate (Object.keys(MODULES)).
 */
export function validateJobInput(obj, { moduleIds = [] } = {}) {
  const issues = [];
  if (!isObj(obj)) return ["job is not an object"];
  if (!/^job\.v[12]$/.test(obj.version || "")) issues.push(`version must be job.v1 or job.v2 (got ${JSON.stringify(obj.version)})`);
  if (!Array.isArray(obj.cabinets)) {
    issues.push("cabinets must be an array");
  } else {
    obj.cabinets.forEach((cab, i) => {
      const where = `cabinets[${i}]`;
      if (!isObj(cab)) { issues.push(`${where} is not an object`); return; }
      if (typeof cab.moduleId !== "string" || !cab.moduleId) issues.push(`${where}.moduleId must be a non-empty string`);
      else if (moduleIds.length && !moduleIds.includes(cab.moduleId)) issues.push(`${where}.moduleId "${cab.moduleId}" is unknown to this build`);
    });
  }
  return issues;
}

/** Returns a list of hard issues; an empty list means the job loads. */
export function validateJobV2(obj, { spaceKinds = [] } = {}) {
  const issues = [];
  if (!isObj(obj)) return ["job is not an object"];
  if (obj.version !== "job.v2") issues.push(`version must be "job.v2" (got ${JSON.stringify(obj.version)})`);
  if (obj.units !== "mm") issues.push(`units must be "mm" (got ${JSON.stringify(obj.units)})`);
  const space = obj.space;
  if (space !== null && space !== undefined) {
    if (!isObj(space)) issues.push("space must be null or { kind, params }");
    else {
      if (typeof space.kind !== "string" || !space.kind) issues.push("space.kind must be a non-empty string");
      else if (spaceKinds.length && !spaceKinds.includes(space.kind)) issues.push(`unknown space kind "${space.kind}"`);
      if (!isObj(space.params)) issues.push("space.params must be an object");
    }
  }
  if (!Array.isArray(obj.cabinets)) {
    issues.push("cabinets must be an array");
  } else {
    obj.cabinets.forEach((cab, i) => {
      const where = `cabinets[${i}]`;
      if (!isObj(cab)) { issues.push(`${where} is not an object`); return; }
      if (typeof cab.moduleId !== "string" || !cab.moduleId) issues.push(`${where}.moduleId must be a non-empty string`);
      if (cab.params !== undefined && cab.params !== null && !isObj(cab.params)) issues.push(`${where}.params must be an object`);
      if (cab.pose !== undefined) {
        const p = cab.pose;
        if (!isObj(p) || !fin(p.x) || !fin(p.y) || !fin(p.z)) issues.push(`${where}.pose must have finite x/y/z`);
        else if (p.rotZ !== undefined && !fin(p.rotZ)) issues.push(`${where}.pose.rotZ must be finite`);
      }
    });
  }
  if (obj.planes !== undefined && !Array.isArray(obj.planes)) issues.push("planes must be an array");
  if (obj.walls !== undefined && !Array.isArray(obj.walls)) issues.push("walls must be an array");
  if (obj.finish !== undefined && !isObj(obj.finish)) issues.push("finish must be an object");
  if (obj.stock !== undefined && !isObj(obj.stock)) issues.push("stock must be an object");
  return issues;
}
