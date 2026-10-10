// Command registry — every operation source is one verb ("domain.verb"),
// the contract in docs/AGENT-COMMANDS.md. `invoke()` wraps every call in the
// shared envelope { ok, verb, effect, validate, diff } so an agent, a CLI
// (`cli.mjs`), and the UI all speak the same protocol. Nothing here touches
// the DOM, THREE, or Electron — the same module runs headless under Node.
import * as job from "./job.js";
import { getModule, MODULES } from "./modules.js";
import { SPACE_KINDS } from "./spaces.js";
import {
  exportFitIssues, poseFits, overlaps, envelopeBox,
  orientFit, sideOfRotZ, poseRotatedTo,
} from "./fit.js";
import { localAxes } from "./pose.js";
import { buildCnjob } from "./gen/cnjob.js";
import { applyYield, declineYield } from "./yield.js";

/* ---------- errors & arg checking ---------- */

export class CommandError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}
const fail = (code, msg, extra) => { throw new CommandError(code, msg, extra); };

const cab = (id) => {
  const c = job.getJob().cabinets.find((x) => x.id === id);
  if (!c) fail("unknown_id", `unknown cabinet '${id}'`);
  return c;
};
const need = (a, k) => (a[k] === undefined || a[k] === null) ? fail("bad_args", `missing argument '${k}'`, { fields: [k] }) : a[k];
const num = (a, k) => {
  const v = Number(need(a, k));
  if (!Number.isFinite(v)) fail("bad_args", `'${k}' must be a number`, { fields: [k] });
  return v;
};
const oneOf = (a, k, list) => {
  const v = need(a, k);
  if (!list.includes(v)) fail("bad_args", `'${k}' must be one of ${list.join("|")} (got '${v}')`, { fields: [k], enum: list });
  return v;
};

/* ---------- shared helpers ---------- */

const clone = (o) => JSON.parse(JSON.stringify(o));
const envelopeOf = (c) => { try { return getModule(c.moduleId).envelope(c.params); } catch { return null; } };

function cabinetResult(c) {
  try { return job.resultFor(c.id) || null; }
  catch (e) { return { boards: [], validation: { errors: [`generate failed: ${e.message}`] }, _crashed: true }; }
}

function cabinetEffect(c) {
  const result = cabinetResult(c);
  return {
    id: c.id, pose: c.pose, envelope: envelopeOf(c),
    boardCount: result?.boards?.length ?? 0,
    errors: result?.validation?.errors || [],
    fits: result ? poseFits(c, c.pose) : undefined,
  };
}

/** Clone params, mutate, hand back through setParams (one history step per call). */
function withParams(id, fn) {
  const c = cab(id);
  const next = clone(c.params);
  const out = fn(next, c) || {};
  job.setParams(id, next);
  return out;
}

/** Field-level diff between two cabinet snapshots (pose + params leaves). */
function leafDiff(a, b, path, out) {
  if (a === b) return;
  const ao = a && typeof a === "object", bo = b && typeof b === "object";
  if (ao && bo && out.length < 200) {
    for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) leafDiff(a[k], b[k], path ? `${path}.${k}` : k, out);
  } else if (JSON.stringify(a) !== JSON.stringify(b)) {
    out.push({ path, from: a, to: b });
  }
}
function cabinetDiff(before, after) {
  const out = [];
  leafDiff(before?.params || {}, after?.params || {}, "params", out);
  leafDiff(before?.pose || {}, after?.pose || {}, "pose", out);
  return out;
}

/** The validation gate every mutating verb carries in its envelope. */
function validateBlock() {
  const fitIssues = exportFitIssues();
  const generatorErrors = [];
  for (const c of job.getJob().cabinets) {
    for (const e of cabinetResult(c)?.validation?.errors || []) generatorErrors.push(`${c.id}: ${e}`);
  }
  return { ok: fitIssues.length === 0 && generatorErrors.length === 0, fitIssues, generatorErrors };
}

/** World-space plane {point, normal} for a target face descriptor. */
function faceWorldOf(t) {
  if (!t || typeof t !== "object") fail("bad_args", "face target must be an object");
  if (t.kind === "cabinet" || (!t.kind && t.id)) {
    const c = cab(t.id);
    const env = envelopeBox(c, job.resultFor(c.id));
    const ax = need(t, "axis"), dir = Math.sign(need(t, "dir") || 1);
    if (ax === "x") return { point: [dir > 0 ? env.x1 : env.x0, (env.y0 + env.y1) / 2, (env.z0 + env.z1) / 2], normal: [dir, 0, 0] };
    if (ax === "y") return { point: [(env.x0 + env.x1) / 2, dir > 0 ? env.y1 : env.y0, (env.z0 + env.z1) / 2], normal: [0, dir, 0] };
    if (ax === "z") return { point: [(env.x0 + env.x1) / 2, (env.y0 + env.y1) / 2, dir > 0 ? env.z1 : env.z0], normal: [0, 0, dir] };
    fail("bad_args", `face axis must be x|y|z`, { fields: ["axis"] });
  }
  if (t.kind === "wall") {
    const w = job.getWall(need(t, "id"));
    if (!w) fail("unknown_id", `unknown wall '${t.id}'`);
    const dir = Math.sign(t.dir || w.side || 1);
    const p = [0, 0, 0];
    p[w.axis === "x" ? 0 : 1] = w.at;
    p[2] = (w.u0 + w.u1) / 2 || 0;
    const n = [0, 0, 0];
    n[w.axis === "x" ? 0 : 1] = dir;
    return { point: p, normal: n };
  }
  if (t.kind === "plane") {
    const pl = job.getPlane(need(t, "id"));
    if (!pl) fail("unknown_id", `unknown plane '${t.id}'`);
    const i = { x: 0, y: 1, z: 2 }[pl.axis];
    const p = [0, 0, 0];
    p[i] = pl.value;
    const n = [0, 0, 0];
    n[i] = Math.sign(t.dir || pl.dir || 1);
    return { point: p, normal: n };
  }
  fail("bad_args", `face kind must be cabinet|wall|plane`, { fields: ["kind"] });
}

/* ---------- zone adapters ---------- */
// Flat stack (tall, small, fridge): params.zones[] {id,type,height,…}.
// Columns (kitchen, ensuite): params.columns[] {id,width,zones:[{id,zoneType,height,…}]}.
// Runs (uohc): params.zones {run: [{id,type,width}]}.
const FLAT_MODULES = ["generalTallCabinet", "tallFridgeCabinet", "smallCabinet", "overheadCabinet", "bedroomEast"];
const COLUMN_MODULES = ["kitchenCabinet", "ensuiteCabinet"];
const RUN_MODULES = ["uShapeOverheadCabinet"];
const DEFAULT_ZONE_TYPE = {
  generalTallCabinet: "open_space", tallFridgeCabinet: null, smallCabinet: "drawer",
  overheadCabinet: "open", kitchenCabinet: "open", ensuiteCabinet: "open",
  uShapeOverheadCabinet: "open", bedroomEast: null,
};
const MIN_ZONE = { overheadCabinet: 150, generalTallCabinet: 60, tallFridgeCabinet: 60, smallCabinet: 60, kitchenCabinet: 60, ensuiteCabinet: 60 };
const sizeKeyOf = (zone) => (zone.height !== undefined ? "height" : zone.width !== undefined ? "width" : "height");
const typeKeyOf = (zone) => (zone.zoneType !== undefined ? "zoneType" : "type");

function zoneListOf(params, c, { column = null, run = null } = {}) {
  if (COLUMN_MODULES.includes(c.moduleId)) {
    const cols = params.columns || [];
    const i = column == null ? null : cols.findIndex((x, ix) => x.id === column || ix === column);
    if (column != null && i < 0) fail("unknown_id", `unknown column '${column}'`);
    return i == null ? cols.flatMap((x) => x.zones || []) : (cols[i].zones || []);
  }
  if (RUN_MODULES.includes(c.moduleId)) {
    const runs = params.zones || {};
    const key = run ?? Object.keys(runs)[0];
    if (!runs[key]) fail("unknown_id", `unknown run '${key}'`, { runs: Object.keys(runs) });
    return runs[key];
  }
  return params.zones || [];
}
function zoneRefOf(list, zone) {
  const i = list.findIndex((z, ix) => z.id === zone || ix === zone);
  if (i < 0) fail("unknown_id", `unknown zone '${zone}'`);
  return i;
}
function zoneScope(c) {
  if (COLUMN_MODULES.includes(c.moduleId)) return "columns";
  if (RUN_MODULES.includes(c.moduleId)) return "runs";
  if (FLAT_MODULES.includes(c.moduleId)) return "flat";
  return null;
}

/* ---------- registry ---------- */

const REG = new Map();
function def(verb, spec) {
  spec.verb = verb;
  spec.category = spec.category || "mutate";
  spec.args = spec.args || [];
  spec.options = spec.options || {};
  REG.set(verb, spec);
}

const M = "mutate", R = "read", META = "meta";

/* ----- meta ----- */
def("help", { category: META, mutates: false, summary: "List all verbs, or one verb's spec", args: [{ name: "verb", req: false }],
  handler(a) {
    if (a.verb) {
      const s = REG.get(a.verb);
      if (!s) fail("unknown_verb", `unknown verb '${a.verb}'`);
      return { verb: s.verb, category: s.category, mutates: !!s.mutates, summary: s.summary, args: s.args, options: s.options };
    }
    return { verbs: [...REG.keys()].sort(), count: REG.size };
  } });
def("schema", { category: META, mutates: false, summary: "Machine-readable spec of one verb", args: [{ name: "verb", req: true }],
  handler(a) {
    const s = REG.get(a.verb);
    if (!s) fail("unknown_verb", `unknown verb '${a.verb}'`);
    return { verb: s.verb, category: s.category, mutates: !!s.mutates, summary: s.summary, args: s.args, options: s.options };
  } });
def("describe", { category: META, mutates: false, summary: "Compact job snapshot for an agent",
  handler() {
    const j = job.getJob();
    return {
      version: j.version,
      space: j.space ? { kind: j.space.kind, params: j.space.params } : null,
      cabinets: j.cabinets.map((c) => ({
        id: c.id, moduleId: c.moduleId, pose: c.pose, envelope: envelopeOf(c),
        boardCount: cabinetResult(c)?.boards?.length ?? 0,
        errors: cabinetResult(c)?.validation?.errors || [],
        selected: c.id === job.getSelectedId(),
      })),
      walls: (j.walls || []).map((w) => ({ id: w.id, axis: w.axis, at: w.at })),
      planes: (j.planes || []).map((p) => ({ id: p.id, axis: p.axis, value: p.value })),
      finish: j.finish, stock: j.stock, dirty: job.isDirty(),
    };
  } });
def("validate", { category: META, mutates: false, summary: "Export gate: fit + generator errors", handler: () => validateBlock() });
def("module.list", { category: R, mutates: false, summary: "Module catalogue with size fields cabinet.add expects",
  handler() {
    return {
      modules: Object.values(MODULES).map((m) => ({
        id: m.id, label: m.label, sub: m.sub, panel: m.panel,
        defaultSize: m.defaultSize || null, minSize: m.minSize || null,
        attach: !!m.attach, noOrient: !!m.noOrient, resizeFaces: m.resizeFaces || [],
      })),
    };
  } });
def("module.schema", { category: R, mutates: false, summary: "One module's defaults / min / resize faces — the params an agent may patch",
  args: [{ name: "moduleId", req: true, enum: Object.keys(MODULES) }],
  handler(a) {
    const m = MODULES[a.moduleId];
    if (!m) fail("unknown_id", `unknown moduleId '${a.moduleId}'`);
    const s = m.defaultSize || {};
    return {
      id: m.id, label: m.label, defaultSize: s, minSize: m.minSize || null,
      defaults: m.defaults ? m.defaults(s.W, s.D, s.H) : null,
      resizeFaces: m.resizeFaces || [], noOrient: !!m.noOrient, attach: !!m.attach,
    };
  } });

/* ----- space ----- */
def("space.kinds", { category: R, mutates: false, summary: "Space kinds defineSpace accepts", handler: () => ({ kinds: Object.keys(SPACE_KINDS) }) });
def("space.get", { category: R, mutates: false, summary: "Resolved space (floor, height, obstacles, bounds)",
  handler() {
    const sp = job.getSpace();
    if (!sp) fail("blocked", "no space defined — run space.define first", { reason: "no_space" });
    return { floor: sp.floor, height: sp.height, obstacles: sp.obstacles, bounds: sp.bounds, walls: sp.walls };
  } });
def("space.define", { category: M, mutates: true, summary: "Define / redefine the space (cabinets do not move; misfits surface in validate)",
  args: [{ name: "kind", req: true, enum: Object.keys(SPACE_KINDS) }],
  options: { params: "object (kind-specific; box: width/depth/height ≥300, walls[])" },
  handler(a) {
    const kind = oneOf(a, "kind", Object.keys(SPACE_KINDS));
    // Params arrive either as a --params object or spread as top-level args
    // (`space.define box width=4000 …` — everything that is not `kind`).
    const params = a.params && typeof a.params === "object"
      ? a.params
      : Object.fromEntries(Object.entries(a).filter(([k]) => !["kind", "params"].includes(k)));
    job.defineSpace(kind, params);
    return { space: job.getJob().space };
  } });

/* ----- cabinet ----- */
def("cabinet.list", { category: R, mutates: false, summary: "Cabinet roster", options: { moduleId: "filter" },
  handler(a) {
    return {
      cabinets: job.getJob().cabinets
        .filter((c) => !a.moduleId || c.moduleId === a.moduleId)
        .map((c) => ({ id: c.id, moduleId: c.moduleId, pose: c.pose, envelope: envelopeOf(c), errors: cabinetResult(c)?.validation?.errors?.length || 0 })),
    };
  } });
def("cabinet.get", { category: R, mutates: false, summary: "One cabinet: pose, params, envelope, issues", args: [{ name: "id", req: true }],
  handler(a) {
    const c = cab(a.id);
    const r = cabinetResult(c);
    return {
      id: c.id, moduleId: c.moduleId, pose: c.pose, params: c.params, colorSlot: c.colorSlot || null,
      hidden: c.hidden || [], envelope: envelopeOf(c), boardCount: r?.boards?.length ?? 0,
      errors: r?.validation?.errors || [],
      grainIssues: (r?.grain?.issues || []).map((i) => i.message),
      millingIssues: (r?.milling?.issues || []).map((i) => i.message),
      fits: r ? poseFits(c, c.pose) : undefined,
    };
  } });
def("cabinet.add", { category: M, mutates: true, summary: "Place + generate a cabinet (semantic result of the place gesture)",
  args: [{ name: "moduleId", req: true, enum: Object.keys(MODULES) }],
  options: { x: "mm", y: "mm", z: "mm", rotZ: "deg (0/90/180/270)", W: "mm", D: "mm", H: "mm", params: "JSON patch merged over module defaults", placeCorner: "{x,y,z}±1 growth anchor" },
  handler(a) {
    const moduleId = need(a, "moduleId");
    if (!MODULES[moduleId]) fail("bad_args", `unknown moduleId '${moduleId}'`, { fields: ["moduleId"], knownModules: Object.keys(MODULES) });
    const size = {};
    for (const k of ["W", "D", "H"]) if (a[k] !== undefined) size[k] = Number(a[k]);
    const pose = {};
    for (const k of ["x", "y", "z", "rotZ"]) if (a[k] !== undefined) pose[k] = Number(a[k]);
    const extra = {};
    if (a.params) extra.params = a.params;
    if (a.placeCorner) extra.placeCorner = a.placeCorner;
    const c = job.addCabinet(moduleId, pose, size, Object.keys(extra).length ? extra : null);
    return cabinetEffect(c);
  } });
def("cabinet.remove", { category: M, mutates: true, summary: "Delete a cabinet", args: [{ name: "id", req: true }],
  handler(a) { job.removeCabinet(need(a, "id")); return {}; } });
def("cabinet.get-params", { category: R, mutates: false, summary: "Raw params object", args: [{ name: "id", req: true }],
  handler(a) { return { params: cab(a.id).params }; } });

function posePatch(id, patch) {
  const c = cab(id);
  if (getModule(c.moduleId).attach) fail("blocked", `${id} is attached to its host — its pose is derived`, { reason: "attached" });
  const next = { ...c.pose };
  if (patch.x !== undefined) next.x = patch.x;
  if (patch.y !== undefined) next.y = patch.y;
  if (patch.z !== undefined) next.z = patch.z;
  if (patch.rotZ !== undefined) next.rotZ = patch.rotZ;
  if (patch.dx) next.x = (next.x || 0) + patch.dx;
  if (patch.dy) next.y = (next.y || 0) + patch.dy;
  if (patch.dz) next.z = (next.z || 0) + patch.dz;
  job.setPose(id, next);
  return { id, pose: cab(id).pose, fits: poseFits(cab(id), cab(id).pose) };
}
def("cabinet.move", { category: M, mutates: true, summary: "Translate / yaw a cabinet (move.free)",
  args: [{ name: "id", req: true }], options: { x: "mm", y: "mm", z: "mm", rotZ: "deg", dx: "mm", dy: "mm", dz: "mm" },
  handler: (a) => posePatch(need(a, "id"), a) });
def("cabinet.rotate", { category: M, mutates: true, summary: "Yaw about world Z through the envelope centre (R key semantics)",
  args: [{ name: "id", req: true }], options: { rotZ: "deg (90 steps)" },
  handler(a) {
    const c = cab(need(a, "id"));
    const mod = getModule(c.moduleId);
    if (mod.attach) fail("blocked", `${c.id} is attached — its pose is derived`, { reason: "attached" });
    if (mod.noOrient) fail("blocked", `${c.moduleId} has a fixed door side`, { reason: "no_orient" });
    const target = a.rotZ !== undefined ? Number(a.rotZ) : (c.pose.rotZ || 0) + 90;
    job.setPose(c.id, poseRotatedTo(c, target, job.snap));
    return { id: c.id, pose: cab(c.id).pose };
  } });
def("cabinet.align-point", { category: M, mutates: true, summary: "Move so one envelope corner lands on a world point (move.point; no rotation)",
  args: [{ name: "id", req: true }, { name: "from", req: true, hint: "{x,y,z} ±1 local corner" }, { name: "to", req: true, hint: "{x,y,z} mm" }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (getModule(c.moduleId).attach) fail("blocked", `${c.id} is attached`, { reason: "attached" });
    const env = envelopeBox(c, job.resultFor(c.id));
    const corner = need(a, "from"), to = need(a, "to");
    const lx = corner.x > 0 ? env.x1 : env.x0, ly = corner.y > 0 ? env.y1 : env.y0, lz = corner.z > 0 ? env.z1 : env.z0;
    const cur = [lx, ly, lz]; // envelopeBox is world-space already
    job.setPose(c.id, {
      x: c.pose.x + (to.x - cur[0]), y: c.pose.y + (to.y - cur[1]), z: (c.pose.z || 0) + (to.z - cur[2]),
    });
    return { id: c.id, pose: cab(c.id).pose, fits: poseFits(cab(c.id), cab(c.id).pose) };
  } });
def("cabinet.align-face", { category: M, mutates: true, summary: "Slide so a cabinet face lies on the target face's plane (move.face / align)",
  args: [{ name: "id", req: true }, { name: "from", req: true, hint: "{axis,dir}" }, { name: "to", req: true, hint: "{kind:cabinet|wall|plane, id, axis, dir}" }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (getModule(c.moduleId).attach) fail("blocked", `${c.id} is attached`, { reason: "attached" });
    const from = need(a, "from");
    const srcPlane = faceWorldOf({ kind: "cabinet", id: c.id, axis: from.axis, dir: from.dir });
    const dstPlane = faceWorldOf(need(a, "to"));
    const n1 = srcPlane.normal, n2 = dstPlane.normal;
    const dot = n1[0] * n2[0] + n1[1] * n2[1] + n1[2] * n2[2];
    if (dot < 0.999) {
      fail("blocked", dot < -0.999 ? "faces look opposite ways" : "faces are not parallel", { reason: "not_parallel", dot });
    }
    const gap = n1[0] * (dstPlane.point[0] - srcPlane.point[0]) + n1[1] * (dstPlane.point[1] - srcPlane.point[1]) + n1[2] * (dstPlane.point[2] - srcPlane.point[2]);
    job.setPose(c.id, { x: c.pose.x + n1[0] * gap, y: c.pose.y + n1[1] * gap, z: (c.pose.z || 0) + n1[2] * gap });
    return { id: c.id, pose: cab(c.id).pose, fits: poseFits(cab(c.id), cab(c.id).pose) };
  } });
def("cabinet.orient", { category: M, mutates: true, summary: "Face command: doors onto a world side; box never moves, W/D swap",
  args: [{ name: "id", req: true }, { name: "axis", req: true, enum: ["x", "y"] }, { name: "dir", req: true, enum: [1, -1] }],
  handler(a) {
    const c = cab(need(a, "id"));
    const mod = getModule(c.moduleId);
    if (mod.attach) fail("blocked", `${c.id} is attached`, { reason: "attached" });
    if (mod.noOrient) fail("blocked", `${c.moduleId} has a fixed door side`, { reason: "no_orient" });
    const side = { axis: a.axis, dir: Math.sign(Number(a.dir)) };
    const fit = orientFit(c, side);
    if (fit.blocked) fail("blocked", "that side is against a wall / neighbour — doors can't open", { reason: "side_blocked", fit: { W: fit.W, D: fit.D } });
    if (fit.small.length) fail("blocked", `under module minimum: ${fit.small.join(", ")}`, { reason: "under_minimum", fit: { W: fit.W, D: fit.D } });
    const same = sideOfRotZ(c.pose.rotZ).axis === side.axis && sideOfRotZ(c.pose.rotZ).dir === side.dir;
    const params = same ? c.params : mod.setEnvelope(c.params, { W: fit.W, D: fit.D });
    const pose = same ? c.pose : fit.pose;
    job.updateCabinet(c.id, (cc) => { cc.params = params; cc.pose = pose; });
    return { id: c.id, pose: cab(c.id).pose, envelope: envelopeOf(cab(c.id)), errors: cabinetResult(cab(c.id))?.validation?.errors || [] };
  } });
def("cabinet.resize-face", { category: M, mutates: true, summary: "Pull one envelope face to a size; far face stays, zones follow the module's resize rules",
  args: [{ name: "id", req: true }, { name: "axis", req: true, enum: ["x", "y", "z"] }, { name: "dir", req: true, enum: [1, -1] }, { name: "to", req: true, hint: "new size along that axis, mm" }],
  handler(a) {
    const c = cab(need(a, "id"));
    const mod = getModule(c.moduleId);
    if (mod.attach) fail("blocked", `${c.id} is attached`, { reason: "attached" });
    const face = { axis: a.axis, dir: Math.sign(Number(a.dir)) };
    const key = `${face.axis}${face.dir > 0 ? "+" : "-"}`;
    if (!(mod.resizeFaces || []).includes(key)) fail("blocked", `${c.moduleId} does not offer face ${key}`, { reason: "no_face", offered: mod.resizeFaces || [] });
    const L = num(a, "to");
    const env = mod.envelope(c.params);
    const dim = { x: "W", y: "D", z: "H" }[face.axis];
    const L0 = env[dim];
    if (L < (mod.minSize?.[dim] ?? 0)) fail("bad_args", `under minimum: ${dim} ${L} < ${mod.minSize[dim]}`, { fields: ["to"], min: mod.minSize[dim] });
    const params = mod.resizeFace ? mod.resizeFace(c.params, face, L) : mod.setEnvelope(c.params, { [dim]: L });
    if (!params) fail("blocked", "a zone would go under its minimum", { reason: "zone_min" });
    const axes = localAxes(c.pose);
    const w = { x: axes[0], y: axes[1], z: axes[2] }[face.axis];
    const shift = face.dir < 0 ? L0 - L : 0;
    const pose = { ...c.pose, x: c.pose.x + w[0] * shift, y: c.pose.y + w[1] * shift, z: (c.pose.z || 0) + w[2] * shift };
    const probe = { ...c, params, pose };
    if (!poseFits(probe, pose)) fail("blocked", "the space boundary stops the pull", { reason: "space" });
    const fresh = overlaps(probe, pose).filter((id) => id !== c.id);
    const before = new Set(overlaps(c, c.pose));
    const added = fresh.filter((id) => !before.has(id));
    if (added.length) fail("conflict", `would overlap ${added[0]}`, { hits: added });
    job.updateCabinet(c.id, (cc) => { cc.pose = pose; });
    job.setParams(c.id, params);
    return cabinetEffect(cab(c.id));
  } });
def("cabinet.copy", { category: M, mutates: true, summary: "Duplicate a cabinet (Ctrl+Enter); offset +50 mm on X so the copy is visible",
  args: [{ name: "id", req: true }], options: { dx: "mm", dy: "mm", dz: "mm" },
  handler(a) {
    const c = cab(need(a, "id"));
    const env = envelopeOf(c) || {};
    const pose = { ...c.pose, x: c.pose.x + (a.dx ?? 50), y: c.pose.y + (a.dy ?? 0), z: (c.pose.z || 0) + (a.dz ?? 0) };
    const n = job.addCabinet(c.moduleId, pose, { W: env.W, D: env.D, H: env.H }, { params: clone(c.params) });
    return { id: c.id, newId: n.id, ...cabinetEffect(n) };
  } });
def("cabinet.set-param", { category: M, mutates: true, summary: "Patch one param key (merged into existing params)",
  args: [{ name: "id", req: true }, { name: "key", req: true }, { name: "value", req: true }],
  handler(a) { return withParams(need(a, "id"), (p) => { p[need(a, "key")] = a.value; }) && cabinetEffect(cab(a.id)); } });
def("cabinet.set-params", { category: M, mutates: true, summary: "Patch several param keys at once (replace:true = full params object)",
  args: [{ name: "id", req: true }], options: { params: "JSON patch object", replace: "set params wholesale (UI parity — keys absent are deleted)" },
  handler(a) {
    const patch = need(a, "params");
    if (typeof patch !== "object") fail("bad_args", "--params must be an object", { fields: ["params"] });
    if (a.replace) job.setParams(a.id, clone(patch));
    else withParams(a.id, (p) => Object.assign(p, patch));
    return cabinetEffect(cab(a.id));
  } });
def("cabinet.set-color-slot", { category: M, mutates: true, summary: "Door colour group (needs a two-colour finish)",
  args: [{ name: "id", req: true }, { name: "slot", req: true, enum: ["A", "B"] }],
  handler(a) {
    const done = job.setColorSlot(need(a, "id"), oneOf(a, "slot", ["A", "B"]));
    if (!done) fail("blocked", "no second colour group in the job finish", { reason: "one_colour" });
    return { id: a.id, colorSlot: a.slot };
  } });
def("cabinet.migrate", { category: M, mutates: true, summary: "Re-open a cabinet as another module (same params schema — tall → fridge)",
  args: [{ name: "id", req: true }, { name: "moduleId", req: true, enum: Object.keys(MODULES) }],
  handler(a) {
    const c = cab(need(a, "id"));
    const to = need(a, "moduleId");
    if (!MODULES[to]) fail("bad_args", `unknown moduleId '${to}'`, { knownModules: Object.keys(MODULES) });
    if (c.moduleId === to) return { id: c.id, moduleId: to, changed: false };
    job.updateCabinet(c.id, (cc) => { cc.moduleId = to; cc.params = { ...cc.params }; });
    return { id: c.id, moduleId: to, changed: true, errors: cabinetResult(cab(c.id))?.validation?.errors || [] };
  } });
def("cabinet.select", { category: M, mutates: true, summary: "Select an object (agent context pointer)",
  args: [{ name: "id", req: true }], options: { sub: "{boardId|regionId, faceId?}" },
  handler(a) {
    const id = need(a, "id");
    const j = job.getJob();
    const known = j.cabinets.some((c) => c.id === id) || (j.walls || []).some((w) => w.id === id) || (j.planes || []).some((p) => p.id === id);
    if (!known) fail("unknown_id", `unknown object '${id}'`);
    job.select(id, a.sub || null);
    return { selected: job.getSelectedId() };
  } });

/* ----- zone / column ----- */
def("zone.list", { category: R, mutates: false, summary: "Zones (and columns) of a cabinet", args: [{ name: "id", req: true }],
  handler(a) {
    const c = cab(a.id);
    const scope = zoneScope(c);
    if (!scope) fail("blocked", `${c.moduleId} has no zone model`, { reason: "no_zones" });
    const p = c.params;
    if (scope === "columns") return { scope, columns: (p.columns || []).map((col) => ({ id: col.id, width: col.width, zones: col.zones || [] })) };
    if (scope === "runs") return { scope, runs: p.zones };
    return { scope, zones: p.zones || [] };
  } });

function zoneMutate(a, fn, label) {
  const c = cab(need(a, "id"));
  const scope = zoneScope(c);
  if (!scope) fail("blocked", `${c.moduleId} has no zone model`, { reason: "no_zones" });
  withParams(c.id, (p) => {
    const list = zoneListOf(p, c, { column: a.column, run: a.run });
    fn(list, p);
  });
  return cabinetEffect(cab(c.id));
}
def("zone.set-type", { category: M, mutates: true, summary: "Change a zone's functional type",
  args: [{ name: "id", req: true }, { name: "zone", req: true }, { name: "type", req: true }],
  options: { column: "column index/id (kitchen)", run: "run key (uohc)" },
  handler(a) {
    return zoneMutate(a, (list) => {
      const z = list[zoneRefOf(list, need(a, "zone"))];
      z[typeKeyOf(z)] = need(a, "type");
    });
  } });
def("zone.set-height", { category: M, mutates: true, summary: "Set a zone's height; the zone below absorbs the difference",
  args: [{ name: "id", req: true }, { name: "zone", req: true }, { name: "height", req: true }],
  options: { column: "kitchen column", run: "uohc run" },
  handler(a) {
    const h = num(a, "height");
    return zoneMutate(a, (list, p) => {
      const i = zoneRefOf(list, need(a, "zone"));
      const z = list[i];
      if (sizeKeyOf(z) !== "height") fail("bad_args", "this zone's size field is width — use zone.set-width", { fields: ["height"] });
      const heir = list[i + 1] || list[i - 1];
      const d = h - z.height;
      if (heir && heir.height !== undefined) heir.height = Math.round((heir.height - d) * 10) / 10;
      z.height = h;
    });
  } });
def("zone.set-width", { category: M, mutates: true, summary: "Set a zone's (or kitchen column's) width; the neighbour absorbs the difference",
  args: [{ name: "id", req: true }, { name: "zone", req: true }, { name: "width", req: true }],
  options: { column: "kitchen column index/id (sets the column width)", run: "uohc run" },
  handler(a) {
    const w = num(a, "width");
    const c = cab(a.id);
    if (COLUMN_MODULES.includes(c.moduleId) && a.column !== undefined && a.zone === undefined) {
      return withParams(c.id, (p) => {
        const cols = p.columns || [];
        const i = cols.findIndex((x, ix) => x.id === a.column || ix === Number(a.column));
        if (i < 0) fail("unknown_id", `unknown column '${a.column}'`);
        const d = w - cols[i].width;
        const heir = cols[i + 1] || cols[i - 1];
        if (heir) heir.width = Math.round((heir.width - d) * 10) / 10;
        cols[i].width = w;
      }) && cabinetEffect(cab(c.id));
    }
    return zoneMutate(a, (list) => {
      const i = zoneRefOf(list, need(a, "zone"));
      const z = list[i];
      const d = w - (z.width ?? z.height);
      const heir = list[i + 1] || list[i - 1];
      if (heir) { const k = sizeKeyOf(heir); heir[k] = Math.round((heir[k] - d) * 10) / 10; }
      z[sizeKeyOf(z)] = w;
    });
  } });
def("zone.drag-boundary", { category: M, mutates: true, summary: "Move the boundary after zone[index]; zone[index] grows/shrinks, its neighbour absorbs",
  args: [{ name: "id", req: true }, { name: "index", req: true }, { name: "to", req: true }],
  options: { column: "kitchen column", run: "uohc run" },
  handler(a) {
    const to = num(a, "to");
    return zoneMutate(a, (list) => {
      const i = Math.trunc(Number(need(a, "index")));
      const z = list[i];
      if (!z) fail("unknown_id", `no zone at index ${i}`);
      const k = sizeKeyOf(z);
      const d = to - z[k];
      const heir = list[i + 1] || list[i - 1];
      if (heir) { const hk = sizeKeyOf(heir); heir[hk] = Math.round((heir[hk] - d) * 10) / 10; }
      z[k] = to;
    });
  } });
def("zone.add", { category: M, mutates: true, summary: "Split a zone off the largest zone (tall takes up to 300 from the tallest)",
  args: [{ name: "id", req: true }],
  options: { from: "donor zone id/index", size: "mm taken (default ≤300)", type: "new zone type", column: "kitchen column", run: "uohc run" },
  handler(a) {
    const c = cab(a.id);
    const defType = a.type || DEFAULT_ZONE_TYPE[c.moduleId];
    if (!defType) fail("blocked", `${c.moduleId} zones are fixed — add is not offered`, { reason: "fixed_zones" });
    const min = MIN_ZONE[c.moduleId] ?? 60;
    return zoneMutate(a, (list) => {
      if (!list.length) fail("blocked", "no zones", { reason: "empty" });
      let di = a.from !== undefined ? zoneRefOf(list, a.from) : list.reduce((bi, z, i, l) => (z[sizeKeyOf(z)] > (l[bi][sizeKeyOf(l[bi])] || 0) ? i : bi), 0);
      const donor = list[di];
      const k = sizeKeyOf(donor);
      const take = Math.min(a.size ?? 300, donor[k] - min);
      if (take < min) fail("blocked", `no zone can give ${min} mm`, { reason: "none_can_give", donor: donor.id, size: donor[k] });
      donor[k] = Math.round((donor[k] - take) * 10) / 10;
      const n = list.reduce((m, z) => Math.max(m, Number(String(z.id).replace(/\D/g, "")) || 0), 0) + 1;
      const z = { id: `zone-${n}` };
      z[typeKeyOf(donor)] = defType;
      z[k] = take;
      list.splice(di + 1, 0, z);
    });
  } });
def("zone.remove", { category: M, mutates: true, summary: "Delete a zone; its size goes to the zone below (else above)",
  args: [{ name: "id", req: true }, { name: "zone", req: true }],
  options: { column: "kitchen column", run: "uohc run" },
  handler(a) {
    return zoneMutate(a, (list) => {
      if (list.length <= 1) fail("blocked", "cannot remove the last zone", { reason: "last_zone" });
      const i = zoneRefOf(list, need(a, "zone"));
      const z = list[i];
      const k = sizeKeyOf(z);
      const heir = list[i + 1] || list[i - 1];
      if (heir) { const hk = sizeKeyOf(heir); heir[hk] = Math.round((heir[hk] + z[k]) * 10) / 10; }
      list.splice(i, 1);
    });
  } });
def("zone.average", { category: M, mutates: true, summary: "Equalize all zone sizes (ohc widths, tall heights)",
  args: [{ name: "id", req: true }], options: { column: "kitchen column", run: "uohc run" },
  handler(a) {
    return zoneMutate(a, (list) => {
      if (!list.length) fail("blocked", "no zones", { reason: "empty" });
      const k = sizeKeyOf(list[0]);
      const total = list.reduce((s, z) => s + (z[k] || 0), 0);
      const each = Math.round((total / list.length) * 10) / 10;
      list.forEach((z, i) => { z[k] = i === list.length - 1 ? Math.round((total - each * (list.length - 1)) * 10) / 10 : each; });
    });
  } });
def("divider.set-x", { category: M, mutates: true, summary: "Vertical divider centreline x inside a zone (tall / fridge)",
  args: [{ name: "id", req: true }, { name: "zone", req: true }, { name: "to", req: true }],
  handler(a) {
    const to = num(a, "to");
    return zoneMutate(a, (list) => {
      const z = list[zoneRefOf(list, need(a, "zone"))];
      z.dividerCenterX = to;
    });
  } });

/* ----- module editors (param patches with whitelists) ----- */
function paramPatchVerb(verb, moduleIds, keys, summary) {
  def(verb, { category: M, mutates: true, summary,
    args: [{ name: "id", req: true }, { name: "key", req: true, enum: keys }, { name: "value", req: true }],
    handler(a) {
      const c = cab(need(a, "id"));
      if (!moduleIds.includes(c.moduleId)) fail("bad_args", `${verb} applies to ${moduleIds.join("|")} (got ${c.moduleId})`, { fields: ["id"] });
      const key = oneOf(a, "key", keys);
      withParams(c.id, (p) => { p[key] = a.value; });
      return cabinetEffect(cab(c.id));
    } });
}
paramPatchVerb("ohc.set", ["overheadCabinet"], ["style", "ledGroove", "topClearanceHeight", "hingeHoleDiameter", "hingeHoleDepth", "hingeHoleFromTop", "hingeHoleFromSide", "clearance", "featureWidth", "rangehoodPreset"], "Overhead option fields");
paramPatchVerb("ohc.rangehood", ["overheadCabinet"], ["rangehoodClearHeight", "rangehoodAlignment", "rangehoodEdgeOffsetX"], "Range-hood insert parameters");
paramPatchVerb("uohc.set", ["uShapeOverheadCabinet"], ["totalWidth", "leftArmLength", "rightArmLength", "cabinetDepth", "style", "ledGroove", "topClearanceHeight"], "U-overhead option fields");
paramPatchVerb("lounge.set", ["loungeGenerator"], ["mainWidth", "mainDepth", "lWidth", "lDepth", "totalWidth", "singleLoungeWidth", "depth"], "Lounge run sizes");
paramPatchVerb("fridge.top", ["tallFridgeCabinet"], ["topType", "topHeight", "topPanel"], "Fridge-cabinet top zone");

def("lounge.style", { category: M, mutates: true, summary: "Lounge silhouette (re-seeds run sizes from the seat depth)",
  args: [{ name: "id", req: true }, { name: "style", req: true, enum: ["I_SHAPE", "L_SHAPE", "U_SHAPE", "PARALLEL"] }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (c.moduleId !== "loungeGenerator") fail("bad_args", "lounge.style applies to loungeGenerator", { fields: ["id"] });
    const style = oneOf(a, "style", ["I_SHAPE", "L_SHAPE", "U_SHAPE", "PARALLEL"]);
    withParams(c.id, (p) => { p.style = style; });
    return cabinetEffect(cab(c.id));
  } });
def("lounge.run-key", { category: M, mutates: true, summary: "Per-run keys (side / lid / midCab / wheel / lFrontAccess)",
  args: [{ name: "id", req: true }, { name: "run", req: true, enum: ["i", "main", "l", "left", "right"] }, { name: "key", req: true }, { name: "value", req: true }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (c.moduleId !== "loungeGenerator") fail("bad_args", "lounge.run-key applies to loungeGenerator", { fields: ["id"] });
    const run = oneOf(a, "run", ["i", "main", "l", "left", "right"]);
    withParams(c.id, (p) => {
      if (!p[run] || typeof p[run] !== "object") p[run] = {};
      p[run][need(a, "key")] = a.value;
    });
    return cabinetEffect(cab(c.id));
  } });

def("tall.side", { category: M, mutates: true, summary: "Exterior side panel: which side, stock finish, thickness",
  args: [{ name: "id", req: true }, { name: "side", req: true, enum: ["left", "right", "none"] }],
  options: { thickness: "mm", finish: "carcass|colour" },
  handler(a) {
    const c = cab(need(a, "id"));
    if (!["generalTallCabinet", "tallFridgeCabinet"].includes(c.moduleId)) fail("bad_args", "tall.side applies to tall cabinets", { fields: ["id"] });
    const side = oneOf(a, "side", ["left", "right", "none"]);
    withParams(c.id, (p) => {
      p.exteriorSide = side;
      if (side !== "none") {
        if (a.thickness !== undefined) p[`${side}SidePanelThickness`] = Number(a.thickness);
        if (a.finish !== undefined) p[`${side}SidePanelFinish`] = a.finish;
      }
    });
    return cabinetEffect(cab(c.id));
  } });
def("tall.zone-appliance", { category: M, mutates: true, summary: "Appliance zone dimensions (open_appliance / fridge zone)",
  args: [{ name: "id", req: true }, { name: "zone", req: true }],
  options: { applianceWidthMm: "mm", applianceHeightMm: "mm", applianceDepthMm: "mm" },
  handler(a) {
    return zoneMutate(a, (list) => {
      const z = list[zoneRefOf(list, need(a, "zone"))];
      for (const k of ["applianceWidthMm", "applianceHeightMm", "applianceDepthMm"]) if (a[k] !== undefined) z[k] = Number(a[k]);
    });
  } });
def("fridge.cutout", { category: M, mutates: true, summary: "Fridge cut-out (the maker's opening — cabinet width follows it)",
  args: [{ name: "id", req: true }, { name: "key", req: true, enum: ["applianceWidthMm", "applianceHeightMm", "applianceDepthMm"] }, { name: "value", req: true }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (c.moduleId !== "tallFridgeCabinet") fail("bad_args", "fridge.cutout applies to tallFridgeCabinet", { fields: ["id"] });
    const key = oneOf(a, "key", ["applianceWidthMm", "applianceHeightMm", "applianceDepthMm"]);
    return zoneMutate(a, (list) => {
      const z = list.find((x) => x.type === "fridge") || list[zoneRefOf(list, a.zone ?? "fridge")];
      z[key] = Number(a.value);
    });
  } });
def("fridge.side", { category: M, mutates: true, summary: "Fridge side panel (single, exteriorSide follows it)",
  args: [{ name: "id", req: true }, { name: "side", req: true, enum: ["left", "right", "none"] }],
  options: { thickness: "mm", finish: "carcass|colour" },
  handler(a) { return REG.get("tall.side").handler(a); } });
def("fridge.above", { category: M, mutates: true, summary: "Zone above the fridge: type and height",
  args: [{ name: "id", req: true }], options: { type: "top_flap|fixed_panel|…", height: "mm" },
  handler(a) {
    const c = cab(need(a, "id"));
    if (c.moduleId !== "tallFridgeCabinet") fail("bad_args", "fridge.above applies to tallFridgeCabinet", { fields: ["id"] });
    return zoneMutate(a, (list) => {
      const fi = list.findIndex((z) => z.type === "fridge");
      const z = fi > 0 ? list[fi - 1] : fi === 0 ? null : list.find((x, i) => x.type !== "fridge" && i > fi);
      if (!z) fail("blocked", "no zone above the fridge", { reason: "no_above" });
      if (a.type !== undefined) z.type = a.type;
      if (a.height !== undefined) z.height = Number(a.height);
    });
  } });
def("fridge.below", { category: M, mutates: true, summary: "Zone below the fridge: type and height",
  args: [{ name: "id", req: true }], options: { type: "bottom_flap|drawer|…", height: "mm" },
  handler(a) {
    const c = cab(need(a, "id"));
    if (c.moduleId !== "tallFridgeCabinet") fail("bad_args", "fridge.below applies to tallFridgeCabinet", { fields: ["id"] });
    return zoneMutate(a, (list) => {
      const fi = list.findIndex((z) => z.type === "fridge");
      const z = fi >= 0 && fi < list.length - 1 ? list[fi + 1] : null;
      if (!z) fail("blocked", "no zone below the fridge", { reason: "no_below" });
      if (a.type !== undefined) z.type = a.type;
      if (a.height !== undefined) z.height = Number(a.height);
    });
  } });

def("kitchen.cell.set", { category: M, mutates: true, summary: "Cell field: zone type/height, column width, shelf, lock",
  args: [{ name: "id", req: true }, { name: "column", req: true }, { name: "zone", req: true }, { name: "key", req: true, enum: ["type", "height", "width", "shelf", "shelfHeight", "lock"] }, { name: "value", req: true }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (!COLUMN_MODULES.includes(c.moduleId)) fail("bad_args", "kitchen.cell.* applies to kitchenCabinet/ensuiteCabinet", { fields: ["id"] });
    const key = oneOf(a, "key", ["type", "height", "width", "shelf", "shelfHeight", "lock"]);
    return zoneMutate(a, (list, p) => {
      const cols = p.columns || [];
      const ci = cols.findIndex((x, ix) => x.id === a.column || ix === Number(a.column));
      if (ci < 0) fail("unknown_id", `unknown column '${a.column}'`);
      if (key === "width") { cols[ci].width = Number(a.value); return; }
      const zl = cols[ci].zones || [];
      const z = zl[zoneRefOf(zl, need(a, "zone"))];
      if (key === "type") z.zoneType = a.value;
      else if (key === "height") z.height = Number(a.value);
      else if (key === "shelf") z.shelfEnabled = !!a.value;
      else if (key === "shelfHeight") z.shelfHeight = Number(a.value);
      else if (key === "lock") z.lockEnabled = !!a.value;
    });
  } });
def("kitchen.column.add", { category: M, mutates: true, summary: "Split a new column off the widest (takes up to half)",
  args: [{ name: "id", req: true }], options: { width: "mm (default half of widest)" },
  handler(a) {
    const c = cab(need(a, "id"));
    if (!COLUMN_MODULES.includes(c.moduleId)) fail("bad_args", "kitchen columns apply to kitchenCabinet/ensuiteCabinet", { fields: ["id"] });
    withParams(c.id, (p) => {
      const cols = p.columns || [];
      if (!cols.length) fail("blocked", "no columns", { reason: "empty" });
      const wi = cols.reduce((bi, x, i) => (x.width > cols[bi].width ? i : bi), 0);
      const donor = cols[wi];
      const take = Math.min(a.width ?? donor.width / 2, donor.width - 60);
      if (take < 60) fail("blocked", "no column can give 60 mm", { reason: "none_can_give" });
      donor.width = Math.round((donor.width - take) * 10) / 10;
      const n = cols.reduce((m, x) => Math.max(m, Number(String(x.id).replace(/\D/g, "")) || 0), 0) + 1;
      const fullH = (donor.zones || []).reduce((s, z) => s + (z.height || 0), 0);
      cols.splice(wi + 1, 0, { id: `col-${n}`, width: take, zones: [{ id: `zone-1`, zoneType: "open", height: fullH }] });
    });
    return cabinetEffect(cab(c.id));
  } });
def("kitchen.column.remove", { category: M, mutates: true, summary: "Delete a column; its width goes to a neighbour",
  args: [{ name: "id", req: true }, { name: "column", req: true }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (!COLUMN_MODULES.includes(c.moduleId)) fail("bad_args", "kitchen columns apply to kitchenCabinet/ensuiteCabinet", { fields: ["id"] });
    withParams(c.id, (p) => {
      const cols = p.columns || [];
      if (cols.length <= 1) fail("blocked", "cannot remove the last column", { reason: "last_column" });
      const i = cols.findIndex((x, ix) => x.id === a.column || ix === Number(a.column));
      if (i < 0) fail("unknown_id", `unknown column '${a.column}'`);
      const heir = cols[i + 1] || cols[i - 1];
      heir.width = Math.round((heir.width + cols[i].width) * 10) / 10;
      cols.splice(i, 1);
    });
    return cabinetEffect(cab(c.id));
  } });
def("kitchen.kick", { category: M, mutates: true, summary: "Kick style: style_1 recessed | style_2 flush",
  args: [{ name: "id", req: true }, { name: "style", req: true, enum: ["style_1", "style_2"] }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (!COLUMN_MODULES.includes(c.moduleId)) fail("bad_args", "kitchen.kick applies to kitchenCabinet/ensuiteCabinet", { fields: ["id"] });
    withParams(c.id, (p) => { p.bottomClearanceStyle = oneOf(a, "style", ["style_1", "style_2"]); });
    return cabinetEffect(cab(c.id));
  } });
def("kitchen.side", { category: M, mutates: true, summary: "End-column side options (panel type, visibility, notch, strip…)",
  args: [{ name: "id", req: true }, { name: "column", req: true }, { name: "side", req: true, enum: ["left", "right"] },
    { name: "key", req: true, enum: ["panelType", "frontVisible", "grooveVisible", "bchNotchEnabled", "extendT2T3B4ToOuterFace", "strengtheningStripEnabled"] }, { name: "value", req: true }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (!COLUMN_MODULES.includes(c.moduleId)) fail("bad_args", "kitchen.side applies to kitchenCabinet/ensuiteCabinet", { fields: ["id"] });
    const optKey = `${a.side}SidePanelOptions`;
    return zoneMutate(a, (list, p) => {
      const cols = p.columns || [];
      const ci = cols.findIndex((x, ix) => x.id === a.column || ix === Number(a.column));
      if (ci < 0) fail("unknown_id", `unknown column '${a.column}'`);
      let touched = 0;
      for (const z of cols[ci].zones || []) {
        if (!z[optKey]) z[optKey] = {};
        z[optKey][need(a, "key")] = a.value;
        touched++;
      }
      if (!touched) fail("blocked", "column has no zones", { reason: "empty" });
    });
  } });
def("kitchen.led", { category: M, mutates: true, summary: "B3 underside LED T-groove (style_1 only)",
  args: [{ name: "id", req: true }, { name: "on", req: true, type: "bool" }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (!COLUMN_MODULES.includes(c.moduleId)) fail("bad_args", "kitchen.led applies to kitchenCabinet/ensuiteCabinet", { fields: ["id"] });
    withParams(c.id, (p) => { p.ledGroove = !!a.on; });
    return cabinetEffect(cab(c.id));
  } });
def("kitchen.wheel", { category: M, mutates: true, summary: "Wheel-arch avoidance: add / edit / remove an {x0,x1,height,depth} box",
  args: [{ name: "id", req: true }, { name: "op", req: true, enum: ["add", "edit", "remove"] }],
  options: { index: "edit/remove target", x0: "mm", x1: "mm", height: "mm", depth: "mm" },
  handler(a) {
    const c = cab(need(a, "id"));
    if (!COLUMN_MODULES.includes(c.moduleId)) fail("bad_args", "kitchen.wheel applies to kitchenCabinet/ensuiteCabinet", { fields: ["id"] });
    const op = oneOf(a, "op", ["add", "edit", "remove"]);
    withParams(c.id, (p) => {
      const list = p.wheelAvoidances || (p.wheelAvoidances = []);
      if (op === "remove") { list.splice(Math.trunc(Number(need(a, "index"))), 1); return; }
      const box = { x0: Number(a.x0 ?? 0), x1: Number(a.x1 ?? 0), height: Number(a.height ?? 0), depth: Number(a.depth ?? 0) };
      if (op === "add") list.push({ id: `wheel-${list.length + 1}`, ...box });
      else Object.assign(list[Math.trunc(Number(need(a, "index")))] || fail("unknown_id", `no avoidance at index ${a.index}`), box);
    });
    return cabinetEffect(cab(c.id));
  } });
def("kitchen.appliance-floor", { category: M, mutates: true, summary: "Ensuite washer plinth (deck behind B3 + two kick supports)",
  args: [{ name: "id", req: true }, { name: "column", req: true }, { name: "zone", req: true }, { name: "on", req: true, type: "bool" }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (c.moduleId !== "ensuiteCabinet") fail("blocked", "appliance floor is ensuite-only", { reason: "kitchen_only" });
    if (c.params.bottomClearanceStyle === "style_2") fail("blocked", "style_2 has no appliance floor", { reason: "style_2" });
    return zoneMutate(a, (list, p) => {
      const cols = p.columns || [];
      const ci = cols.findIndex((x, ix) => x.id === a.column || ix === Number(a.column));
      if (ci < 0) fail("unknown_id", `unknown column '${a.column}'`);
      const zl = cols[ci].zones || [];
      const z = zl[zoneRefOf(zl, need(a, "zone"))];
      z.applianceFloorEnabled = !!a.on;
    });
  } });
def("small.side", { category: M, mutates: true, summary: "Small cabinet: a side face is a door panel",
  args: [{ name: "id", req: true }, { name: "side", req: true, enum: ["left", "right"] }, { name: "on", req: true, type: "bool" }],
  handler(a) {
    const c = cab(need(a, "id"));
    if (c.moduleId !== "smallCabinet") fail("bad_args", "small.side applies to smallCabinet", { fields: ["id"] });
    withParams(c.id, (p) => { p[`${a.side}SideDoorColor`] = !!a.on; });
    return cabinetEffect(cab(c.id));
  } });

/* ----- wall / plane ----- */
def("wall.list", { category: R, mutates: false, summary: "Partition roster", handler: () => ({ walls: job.getWalls() }) });
def("wall.get", { category: R, mutates: false, summary: "One wall incl. openings", args: [{ name: "id", req: true }],
  handler(a) { const w = job.getWall(need(a, "id")); if (!w) fail("unknown_id", `unknown wall '${a.id}'`); return { wall: w }; } });
def("wall.add", { category: M, mutates: true, summary: "Add a partition wall {axis, at, u0, u1, side}",
  args: [{ name: "axis", req: true, enum: ["x", "y"] }, { name: "at", req: true }, { name: "u0", req: true }, { name: "u1", req: true }],
  options: { side: "-1|1 (thickness side)" },
  handler(a) {
    const w = job.addWall({ axis: a.axis, at: num(a, "at"), u0: num(a, "u0"), u1: num(a, "u1"), side: a.side !== undefined ? Math.sign(Number(a.side)) : undefined });
    if (!w) fail("bad_args", "wall failed normalization", { wall: a });
    return { wall: w };
  } });
def("wall.remove", { category: M, mutates: true, summary: "Delete a partition (its openings go with it)", args: [{ name: "id", req: true }],
  handler(a) { job.removeWall(need(a, "id")); return {}; } });
def("wall.set-split", { category: M, mutates: true, summary: "Split segments along a partition", args: [{ name: "id", req: true }, { name: "split", req: true }],
  handler(a) { job.setWallSplit(need(a, "id"), need(a, "split")); return { wall: job.getWall(a.id) }; } });
def("wall.set-fit", { category: M, mutates: true, summary: "Loft a partition against a cabinet (fitPick)", args: [{ name: "id", req: true }, { name: "fit", req: true }],
  options: { how: "ok|flush|…" },
  handler(a) { job.setWallFit(need(a, "id"), need(a, "fit"), a.how || "ok"); return { wall: job.getWall(a.id) }; } });
def("wall.add-opening", { category: M, mutates: true, summary: "Door / window opening in a partition",
  args: [{ name: "id", req: true }, { name: "type", req: true, enum: ["slidingDoor", "showerDoor"] }, { name: "from", req: true, enum: ["lo", "hi"] }, { name: "offset", req: true }, { name: "width", req: true }],
  options: { bottom: "mm", top: "mm", side: "slidingDoor -1|1", overlap: "mm", doorHeight: "mm (def 1880)" },
  handler(a) {
    const op = { type: oneOf(a, "type", ["slidingDoor", "showerDoor"]), from: a.from, offset: num(a, "offset"), width: num(a, "width") };
    for (const k of ["bottom", "top", "side", "overlap", "doorHeight"]) if (a[k] !== undefined) op[k] = Number(a[k]);
    job.addOpening(need(a, "id"), op);
    return { wall: job.getWall(a.id) };
  } });
def("wall.set-opening", { category: M, mutates: true, summary: "Patch an opening", args: [{ name: "id", req: true }, { name: "op", req: true }, { name: "patch", req: true }],
  handler(a) { job.setOpening(need(a, "id"), need(a, "op"), need(a, "patch")); return { wall: job.getWall(a.id) }; } });
def("wall.remove-opening", { category: M, mutates: true, summary: "Delete an opening", args: [{ name: "id", req: true }, { name: "op", req: true }],
  handler(a) { job.removeOpening(need(a, "id"), need(a, "op")); return {}; } });
def("wall.show", { category: M, mutates: true, summary: "Show a partition in 3D", args: [{ name: "id", req: true }],
  handler(a) { if (!job.setWallVisible(need(a, "id"), true)) return { changed: false }; return { changed: true }; } });
def("wall.hide", { category: M, mutates: true, summary: "Hide a partition in 3D (still blocks)", args: [{ name: "id", req: true }],
  handler(a) { if (!job.setWallVisible(need(a, "id"), false)) return { changed: false }; return { changed: true }; } });
def("plane.list", { category: R, mutates: false, summary: "Construction plane roster", handler: () => ({ planes: job.getPlanes() }) });
def("plane.add", { category: M, mutates: true, summary: "Construction plane {axis, value, dir} (+ offset / from wall)",
  args: [{ name: "axis", req: true, enum: ["x", "y", "z"] }, { name: "value", req: true }],
  options: { dir: "-1|1", offset: "mm", from: "face the plane came from" },
  handler(a) {
    const p = job.addPlane({ axis: a.axis, value: num(a, "value"), dir: a.dir !== undefined ? Math.sign(Number(a.dir)) : 1, offset: a.offset !== undefined ? Number(a.offset) : undefined, from: a.from });
    return { plane: p };
  } });
def("plane.remove", { category: M, mutates: true, summary: "Delete a construction plane", args: [{ name: "id", req: true }],
  handler(a) { job.removePlane(need(a, "id")); return {}; } });

/* ----- board ----- */
def("board.set-grooves", { category: M, mutates: true, summary: "Replace a board's user grooves (one undo step)",
  args: [{ name: "id", req: true }, { name: "board", req: true }, { name: "grooves", req: true, hint: "JSON array of {id,face,kind,u0,v0,u1,v1,depth,…}" }],
  handler(a) {
    const done = job.setBoardGrooves(need(a, "id"), need(a, "board"), need(a, "grooves"));
    return { changed: done };
  } });
def("board.hide", { category: M, mutates: true, summary: "Hide boards in 3D (still in the job)", args: [{ name: "id", req: true }], options: { boards: "role ids; omitted = all" },
  handler(a) { return { changed: job.setBoardsVisible(need(a, "id"), false, a.boards) }; } });
def("board.show", { category: M, mutates: true, summary: "Un-hide boards", args: [{ name: "id", req: true }], options: { boards: "role ids; omitted = all" },
  handler(a) { return { changed: job.setBoardsVisible(need(a, "id"), true, a.boards) }; } });
def("board.list", { category: R, mutates: false, summary: "Boards of a cabinet (role ids, materials)", args: [{ name: "id", req: true }],
  handler(a) {
    const r = cabinetResult(cab(need(a, "id")));
    return { boards: (r?.boards || []).map((b) => ({ id: b.id, role: b.role, material: b.material, hidden: job.isBoardHidden(a.id, b.id) })) };
  } });
def("board.nudge", { category: M, mutates: true, summary: "Per-board move override (overrides.boards[roleId].{x,y,z,rot*})",
  args: [{ name: "id", req: true }, { name: "board", req: true }],
  options: { x: "mm", y: "mm", z: "mm", rotX: "deg", rotY: "deg", rotZ: "deg" },
  handler(a) {
    const c = cab(need(a, "id"));
    const boardId = need(a, "board");
    const o = { ...(c.overrides?.boards?.[boardId] || {}) };
    for (const k of ["x", "y", "z", "rotX", "rotY", "rotZ"]) if (a[k] !== undefined) o[k] = Number(a[k]);
    job.updateCabinet(c.id, (cc) => {
      const boards = { ...(cc.overrides?.boards || {}) };
      boards[boardId] = o;
      cc.overrides = { ...(cc.overrides || {}), boards };
      cc.params = { ...cc.params }; // invalidate()
    });
    return { id: c.id, board: boardId, override: cab(c.id).overrides?.boards?.[boardId] || null };
  } });

/* ----- material / yield / history / file ----- */
def("material.set", { category: M, mutates: true, summary: "Job-level finish / stock (a group colour regenerates every cabinet in it)",
  options: { finish: "finish object", stock: "stock object" },
  handler(a) {
    job.setMaterials(a.finish || null, a.stock || null);
    return { finish: job.getFinish(), stock: job.getStock() };
  } });
def("yield.status", { category: R, mutates: false, summary: "Pending neighbour-yield conflict, if any",
  handler() { const c = job.getConflict(); return c ? { conflict: c, ids: job.conflictIds() } : { conflict: null }; } });
def("yield.apply", { category: M, mutates: true, summary: "Accept the yield: neighbours' facing faces push back", handler: () => applyYield() || {} });
def("yield.decline", { category: M, mutates: true, summary: "Decline the yield: overlap stays a red check", handler: () => declineYield() || {} });
def("history.undo", { category: M, mutates: true, summary: "Undo one step", handler: () => { const had = job.canUndo(); if (had) job.undo(); return { applied: had }; } });
def("history.redo", { category: M, mutates: true, summary: "Redo one step", handler: () => { const had = job.canRedo(); if (had) job.redo(); return { applied: had }; } });
def("history.begin", { category: M, mutates: true, summary: "Open an undo group: mutations until history.end are one step",
  handler: () => { job.beginBatch(); return { open: true }; } });
def("history.end", { category: M, mutates: true, summary: "Close the undo group", handler: () => { job.endBatch(); return { open: false }; } });
def("history.can-undo", { category: "read", mutates: false, summary: "Undo stack non-empty", handler: () => ({ value: job.canUndo() }) });
def("history.can-redo", { category: "read", mutates: false, summary: "Redo stack non-empty", handler: () => ({ value: job.canRedo() }) });
def("history.mark", { category: M, mutates: true, summary: "Explicit undo checkpoint (snapshot the current job)", handler: () => { job.pushHistory(); return {}; } });

def("file.new", { category: M, mutates: true, summary: "New empty job", handler: () => { job.resetJob(); return {}; } });
def("file.open", { category: M, mutates: true, summary: "Load a job object (CLI passes --path; the process layer reads the file)",
  args: [{ name: "path", req: false, hint: "file path (host reads it)" }], options: { job: "job object" },
  handler(a) {
    const obj = a.job;
    if (!obj) fail("bad_args", "file.open needs a job object (or --path via the CLI)", { fields: ["job"] });
    job.loadJob(obj, a.path || null);
    return { cabinets: job.getJob().cabinets.length };
  } });
def("file.serialize", { category: R, mutates: false, summary: "job.json text", handler: () => ({ json: job.serialize() }) });
def("file.info", { category: R, mutates: false, summary: "file path + dirty flag", handler: () => ({ path: job.getFilePath(), dirty: job.isDirty() }) });
def("file.export-cnjob", { category: "export", mutates: false, summary: "Manufacturing snapshot via buildCnjob (same inputs as the UI export)",
  args: [{ name: "path", req: false, hint: "host writes the file" }], options: { jobId: "snapshot jobId" },
  handler(a) {
    const cabinets = job.getJob().cabinets.map((c) => {
      const r = cabinetResult(c);
      return {
        id: c.id, moduleId: c.moduleId, params: c.params, boards: r?.boards || [],
        errors: r?.validation?.errors || [],
        grainIssues: (r?.grain?.issues || []).map((i) => i.message),
        millingIssues: (r?.milling?.issues || []).map((i) => i.message),
      };
    });
    const built = buildCnjob({ jobId: a.jobId || "job", cabinets, fitIssues: exportFitIssues() });
    if (!built.ok) fail("contract", "export blocked", { reasons: built.reasons, warnings: built.warnings });
    return { snapshot: built.snapshot, boardCount: built.snapshot.workpieces.length, materialIds: Object.keys(built.snapshot.materials) };
  } });

/* ---------- dispatch ---------- */

export function listVerbs() { return [...REG.keys()].sort(); }
export function verbSpec(verb) { return REG.get(verb) || null; }

/**
 * Invoke one verb. `args` = plain object (the CLI parses "--k v" pairs into it).
 * opts.dryRun → run + validate, then restore the pre-state; nothing persists.
 * Returns the shared envelope; never throws.
 */
export function invoke(verb, args = {}, opts = {}) {
  const spec = REG.get(verb);
  if (!spec) return { ok: false, verb, error: `unknown verb '${verb}'`, code: "unknown_verb", extra: { verbs: listVerbs() } };
  const before = {};
  const snap = spec.mutates && opts.dryRun ? job.snapshotAll() : null;
  try {
    for (const ar of spec.args) if (ar.req && args[ar.name] === undefined) fail("bad_args", `missing argument '${ar.name}'`, { fields: [ar.name] });
    if (spec.mutates && args.id) {
      const c = job.getJob().cabinets.find((x) => x.id === args.id);
      if (c) before.params = clone(c.params), before.pose = clone(c.pose), before.id = c.id;
    }
    const effect = spec.handler(args) ?? {};
    const env = { ok: true, verb, effect };
    if (spec.mutates) {
      env.validate = validateBlock();
      if (before.id) {
        const after = job.getJob().cabinets.find((x) => x.id === before.id);
        env.diff = after ? cabinetDiff(before, { params: after.params, pose: after.pose }) : [{ path: "cabinet", from: "present", to: "removed" }];
      }
      env.undoGroup = job.inBatch() ? "open" : null;
    }
    if (opts.dryRun && spec.mutates) { job.restoreAll(snap); env.dryRun = true; }
    return env;
  } catch (e) {
    if (opts.dryRun && snap) job.restoreAll(snap);
    if (e instanceof CommandError) return { ok: false, verb, error: e.message, code: e.code, extra: e.extra };
    return { ok: false, verb, error: e.message || String(e), code: "internal", extra: { stack: (e.stack || "").split("\n")[1]?.trim() } };
  }
}
