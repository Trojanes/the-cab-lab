// Application API — the stable, UI-free surface for driving a job.
// Every command returns { ok, ... } | { ok: false, error } so callers
// (tests today, an Agent Tool layer tomorrow) get machine-readable outcomes
// instead of exceptions. Nothing here touches the DOM, THREE, or Electron;
// the same module runs inside the renderer and headless under Node.
import * as job from "./job.js";
import { getModule, MODULES } from "./modules.js";
import { SPACE_KINDS } from "./spaces.js";
import { exportFitIssues, poseFits } from "./fit.js";
import { buildCnjob } from "./gen/cnjob.js";

const ok = (data = {}) => ({ ok: true, ...data });
const fail = (error, extra = {}) => ({ ok: false, error, ...extra });

const cabinetOf = (id) => job.getJob().cabinets.find((c) => c.id === id) || null;

function envelopeOf(cab) {
  try {
    return getModule(cab.moduleId).envelope(cab.params);
  } catch {
    return null;
  }
}

/** Per-cabinet generation result or a structured failure — never throws. */
function cabinetResult(cab) {
  try {
    return job.resultFor(cab.id) || null;
  } catch (e) {
    return { boards: [], validation: { errors: [`generate failed: ${e.message}`] }, _crashed: true };
  }
}

export function createApp() {
  const api = {
    // --- lifecycle ---------------------------------------------------------
    reset() {
      job.resetJob();
      return ok();
    },

    /** Parse + contract-validate + migrate a job.json object (same path as File → Open). */
    loadJob(obj, { filePath = null } = {}) {
      try {
        job.loadJob(obj, filePath);
        return ok({ cabinets: job.getJob().cabinets.length });
      } catch (e) {
        return fail(e.message, { reasons: e.reasons });
      }
    },

    serialize() {
      return job.serialize();
    },

    isDirty() {
      return job.isDirty();
    },

    undo() {
      const had = job.canUndo();
      if (had) job.undo();
      return ok({ applied: had });
    },

    redo() {
      const had = job.canRedo();
      if (had) job.redo();
      return ok({ applied: had });
    },

    // --- reads --------------------------------------------------------------
    /** Compact state for an agent deciding its next call. */
    getJobSummary() {
      const j = job.getJob();
      return {
        version: j.version,
        space: j.space ? { kind: j.space.kind, params: j.space.params } : null,
        cabinets: j.cabinets.map((cab) => {
          const result = cabinetResult(cab);
          return {
            id: cab.id,
            moduleId: cab.moduleId,
            pose: cab.pose,
            envelope: envelopeOf(cab),
            boardCount: result?.boards?.length ?? 0,
            errors: result?.validation?.errors || [],
            selected: cab.id === job.getSelectedId(),
          };
        }),
        walls: (j.walls || []).map((w) => ({ id: w.id, axis: w.axis, at: w.at })),
        planes: (j.planes || []).map((p) => ({ id: p.id, axis: p.axis, value: p.value })),
        finish: j.finish,
        stock: j.stock,
        dirty: job.isDirty(),
      };
    },

    /** Modules an agent may place, with the size fields `addCabinet` expects. */
    listModules() {
      return Object.values(MODULES).map((m) => ({
        id: m.id,
        label: m.label,
        sub: m.sub,
        panel: m.panel,
        defaultSize: m.defaultSize || null,
        minSize: m.minSize || null,
      }));
    },

    /** Space kinds `defineSpace` accepts. */
    listSpaceKinds() {
      return Object.keys(SPACE_KINDS);
    },

    // --- commands -------------------------------------------------------------
    defineSpace(kind, params, { finish, stock } = {}) {
      try {
        job.defineSpace(kind, params, { finish, stock });
        return ok({ space: job.getJob().space });
      } catch (e) {
        return fail(e.message);
      }
    },

    setMaterials(finish, stock) {
      try {
        job.setMaterials(finish, stock);
        return ok({ finish: job.getFinish(), stock: job.getStock() });
      } catch (e) {
        return fail(e.message);
      }
    },

    /** `size` is { W, D, H } in mm; `params` overrides generated defaults. */
    addCabinet(moduleId, { pose = {}, size = {}, params = null } = {}) {
      if (!MODULES[moduleId]) return fail(`unknown moduleId '${moduleId}'`, { knownModules: Object.keys(MODULES) });
      try {
        const cab = job.addCabinet(moduleId, pose, size, params ? { params } : null);
        const result = cabinetResult(cab);
        return ok({
          id: cab.id,
          pose: cab.pose,
          envelope: envelopeOf(cab),
          boardCount: result?.boards?.length ?? 0,
          errors: result?.validation?.errors || [],
          fits: result ? poseFits(cab, cab.pose) : undefined,
        });
      } catch (e) {
        return fail(e.message);
      }
    },

    /** `params` merges into the existing params (job.setParams replaces wholesale — the API patches). */
    updateCabinet(id, { params, pose } = {}) {
      const cab = cabinetOf(id);
      if (!cab) return fail(`unknown cabinet '${id}'`);
      try {
        if (params) job.setParams(id, { ...cab.params, ...params });
        if (pose) job.setPose(id, pose);
        const result = cabinetResult(cab);
        return ok({
          id,
          pose: cab.pose,
          envelope: envelopeOf(cab),
          boardCount: result?.boards?.length ?? 0,
          errors: result?.validation?.errors || [],
          fits: result ? poseFits(cab, cab.pose) : undefined,
        });
      } catch (e) {
        return fail(e.message);
      }
    },

    removeCabinet(id) {
      if (!cabinetOf(id)) return fail(`unknown cabinet '${id}'`);
      try {
        job.removeCabinet(id);
        return ok();
      } catch (e) {
        return fail(e.message);
      }
    },

    // --- generate / validate / export ------------------------------------------
    /** Boards for one cabinet (or every cabinet), exactly as generation produced them. */
    generate(id = null) {
      const cabs = id ? [cabinetOf(id)] : job.getJob().cabinets;
      if (id && !cabs[0]) return fail(`unknown cabinet '${id}'`);
      const results = cabs.map((cab) => {
        const result = cabinetResult(cab);
        return {
          id: cab.id,
          boardCount: result?.boards?.length ?? 0,
          boards: result?.boards?.map((b) => ({ id: b.id, role: b.role, material: b.material })) || [],
          errors: result?.validation?.errors || [],
          grainIssues: (result?.grain?.issues || []).map((i) => i.message),
          millingIssues: (result?.milling?.issues || []).map((i) => i.message),
        };
      });
      return ok(id ? results[0] : { cabinets: results });
    },

    /**
     * Whole-job legality: contract is enforced at load; this reports what the
     * export gate would report — space fit, overlaps, wall legality,
     * generator errors.
     */
    validate() {
      const fitIssues = exportFitIssues();
      const generatorErrors = [];
      for (const cab of job.getJob().cabinets) {
        const result = cabinetResult(cab);
        for (const err of result?.validation?.errors || []) {
          generatorErrors.push(`${cab.id}: ${err}`);
        }
      }
      return { ok: fitIssues.length === 0 && generatorErrors.length === 0, fitIssues, generatorErrors };
    },

    /** Same inputs the UI export button feeds buildCnjob. */
    exportCnjob({ jobId = "job" } = {}) {
      const cabinets = job.getJob().cabinets.map((cab) => {
        const result = cabinetResult(cab);
        return {
          id: cab.id,
          moduleId: cab.moduleId,
          params: cab.params,
          boards: result?.boards || [],
          errors: result?.validation?.errors || [],
          grainIssues: (result?.grain?.issues || []).map((i) => i.message),
          millingIssues: (result?.milling?.issues || []).map((i) => i.message),
        };
      });
      try {
        const built = buildCnjob({ jobId, cabinets, fitIssues: exportFitIssues() });
        return built.ok
          ? ok({ snapshot: built.snapshot, boardCount: built.snapshot.workpieces.length, materialIds: Object.keys(built.snapshot.materials) })
          : fail("export blocked", { reasons: built.reasons, warnings: built.warnings });
      } catch (e) {
        return fail(`export failed: ${e.message}`);
      }
    },
  };

  return api;
}
