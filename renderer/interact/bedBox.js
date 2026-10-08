// Bed box placement — attached to the Bedroom body: it stands in the mattress
// opening and runs into the room. Width (the body's bed frame) and height
// (boot height) are read from the body — never typed or dragged here. Only the
// length is chosen:
//   length  the box stands on the body face, its room-side face follows the
//           cursor into the room (snaps to cabinet faces / back wall)
//   click / Enter → create (or re-size the existing one), Esc → cancel
// The "bedSide" variant places the pair of side tables: height first (snaps to
// the fixed panel's underside), then depth.
import { canvas, planePointAt } from "../space.js";
import * as job from "../job.js";
import { getModule } from "../modules.js";
import { envelopeFootprint } from "../fit.js";
import { nearestAxisAlign, uiScale, toClient, SNAP_RADIUS_PX } from "../snap.js";
import { showGhost } from "../cabinets3d.js";
import { showTip, hideTip } from "../hud.js";
import { log } from "../log.js";
import { cancelMeasure } from "../measureTool.js";
import {
  host, emitMode, clearPreview, registerMode, stopAll, threePlane,
  dimBox, DIM_ORDER, dimInputs, dimLabels, positionDimInputs, setDimNames,
} from "./shared.js";

let bed = null; // { moduleId, step: depth | height, pair, editId, W, D, H, snapH, locked: {D, H}, snapLabel, clamped, lastClient }

export const bedActive = () => !!bed;
export const bedModuleId = () => (bed ? bed.moduleId : null);

function bedBody() {
  return job.getJob().cabinets.find((c) => c.moduleId === "bedroom") || null;
}
function bedFrame() {
  const sp = job.getSpace();
  const body = bedBody();
  if (!sp || !body) return null;
  const bodyMod = getModule(body.moduleId);
  const bodyD = bodyMod.envelope(body.params).D;
  return { cx: (sp.bounds.minX + sp.bounds.maxX) / 2, y: bodyD, minX: sp.bounds.minX, maxX: sp.bounds.maxX, maxW: sp.bounds.maxX - sp.bounds.minX, maxD: sp.bounds.maxY - bodyD, bodyId: body.id, size: bodyMod.bedBoxSize(body.params), bodyParams: body.params };
}
function bedBoxBox() {
  const f = bedFrame();
  return { x0: f.cx - bed.W / 2, y0: f.y, z0: 0, W: bed.W, D: bed.D, H: bed.H, max: { W: bed.W, D: f.maxD, H: bed.H } };
}

export function startBedBox(moduleId) {
  const mod = getModule(moduleId);
  const f = bedFrame();
  const pair = mod.placement === "bedSide";
  if (!f) { log(pair ? "bedside.blocked" : "bedbox.blocked", { moduleId, reason: "no body" }); return; }
  stopAll();
  host.stopResidents?.();
  cancelMeasure("tool off");
  host.clearPlacement?.();
  const existing = (mod.single || pair) ? job.getJob().cabinets.find((c) => c.moduleId === moduleId) : null;
  const env = existing ? mod.envelope(existing.params) : null;
  const table = pair ? mod.sizeFor(f.bodyParams) : null;
  bed = {
    moduleId, step: pair ? "height" : "depth", pair, editId: existing ? existing.id : null,
    W: table ? table.W : f.size.W, D: env ? env.D : mod.defaultSize.D, H: table ? table.H : f.size.H,
    snapH: table ? table.snapH : null,
    locked: { D: null, H: null }, snapLabel: null, clamped: null, lastClient: null,
  };
  if (env && pair) bed.H = env.H;
  job.select(existing ? existing.id : null);
  canvas.style.cursor = "crosshair";
  setDimNames(["W", "D", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) {
    dimLabels[k].classList.remove("focused", "locked");
    dimLabels[k].classList.toggle("hidden", pair ? k !== "H" : k !== "D");
  }
  drawBedBox(null);
  log(bed.pair ? "bedside.arm" : "bedbox.arm", { moduleId, editId: bed.editId, bodyId: f.bodyId, bodyDepth: f.y, W: bed.W, D: bed.D, H: bed.H, snapH: bed.snapH, pair: bed.pair || undefined, from: bed.pair ? "height first, snaps to the fixed panel bottom, then depth" : "body: bed frame width, bootHeight" });
  emitMode();
}

/** Depth for the cursor (or the lock): snapped, clamped to the space, stopped by other cabinets in the bed's lane. */
function bedDepth(e) {
  const mod = getModule(bed.moduleId);
  const f = bedFrame();
  let D;
  let label = null;
  let clamped = null;
  if (bed.locked.D != null) D = bed.locked.D;
  else if (e) {
    const snap = nearestAxisAlign(e.clientX, e.clientY, { x: f.cx, y: f.y, z: 0 }, "y", +1, { exclude: bed.editId });
    if (snap) { D = snap.value - f.y; label = snap.label; }
    else {
      // The room-side face stands on the floor point under the cursor.
      const hit = planePointAt(e.clientX, e.clientY, threePlane("z", 0));
      D = hit ? hit.y - f.y : bed.D;
    }
  } else D = bed.D;
  if (D > f.maxD) { D = f.maxD; clamped = "back wall"; }
  if (D < mod.minSize.D) { D = mod.minSize.D; clamped = `minimum ${mod.minSize.D}`; }
  const lanes = bed.pair
    ? [[f.minX, f.minX + bed.W], [f.maxX - bed.W, f.maxX]]
    : [[f.cx - bed.W / 2, f.cx + bed.W / 2]];
  for (const c of job.getJob().cabinets) {
    if (c.id === bed.editId || c.id === f.bodyId || c.moduleId === bed.moduleId) continue;
    const fp = envelopeFootprint(c, c.pose);
    if (fp.z0 >= bed.H - 0.5) continue;
    if (!lanes.some(([x0, x1]) => fp.maxX > x0 + 0.5 && fp.minX < x1 - 0.5)) continue;
    const room = fp.minY - f.y;
    if (room >= mod.minSize.D && room < D - 0.5) { D = room; clamped = c.id; label = null; }
  }
  bed.D = D;
  bed.snapLabel = label;
  bed.clamped = clamped;
}

/** Height of the pair, from the floor. The top edge sits on the cursor; it snaps when the cursor is on the fixed panel's underside. */
function bedHeight(e) {
  const mod = getModule(bed.moduleId);
  const f = bedFrame();
  let H;
  let label = null;
  let clamped = null;
  if (bed.locked.H != null) H = bed.locked.H;
  else if (e) {
    // The body's room face, so the top edge of the ghost is the point under the cursor.
    const hit = planePointAt(e.clientX, e.clientY, threePlane("y", f.y));
    H = hit ? Math.max(0, hit.z) : bed.H;
  } else H = bed.H;
  const roof = f.bodyParams.height;
  if (H > roof) { H = roof; clamped = "roof"; }
  if (H < mod.minSize.H) { H = mod.minSize.H; clamped = `minimum ${mod.minSize.H}`; }
  if (bed.locked.H == null && bed.snapH != null && e && nearScreenSeg(e.clientX, e.clientY, { x: f.minX, y: f.y, z: bed.snapH }, { x: f.maxX, y: f.y, z: bed.snapH })) {
    H = bed.snapH;
    label = "fixed panel bottom";
    clamped = null;
  }
  bed.H = H;
  bed.snapLabel = label;
  bed.clamped = clamped;
}

/** Cursor within the snap radius of a segment on screen. */
function nearScreenSeg(clientX, clientY, a, b) {
  const pa = toClient(a.x, a.y, a.z);
  const pb = toClient(b.x, b.y, b.z);
  if (pa.behind || pb.behind) return false;
  const dx = pb.x - pa.x;
  const dy = pb.y - pa.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, ((clientX - pa.x) * dx + (clientY - pa.y) * dy) / len2)) : 0;
  return Math.hypot(clientX - (pa.x + t * dx), clientY - (pa.y + t * dy)) <= SNAP_RADIUS_PX * uiScale();
}

function drawBedBox(e) {
  const f = bedFrame();
  const b = bed.pair
    ? { x0: f.minX, y0: f.y, z0: 0, W: bed.W, D: bed.D, H: bed.H }
    : bedBoxBox();
  const also = bed.pair ? { x0: f.maxX - bed.W, y0: f.y, z0: 0, W: bed.W, D: bed.D, H: bed.H } : null;
  showGhost(b.x0, b.y0, b.z0, b.W, b.D, b.H, { clamped: !!bed.clamped, also });
  const field = bed.pair && bed.step === "height" ? "H" : "D";
  if (document.activeElement !== dimInputs[field]) dimInputs[field].value = Math.round(bed[field]);
  dimLabels[field].classList.toggle("locked", bed.locked[field] != null);
  positionDimInputs(b);
  if (!e) return;
  const lines = [
    bed.pair && bed.step === "height"
      ? `H ${Math.round(bed.H)} · two tables · snaps at the fixed panel bottom ${Math.round(bed.snapH)}`
      : bed.pair
        ? `D ${Math.round(bed.D)} from the body · two tables · H ${Math.round(bed.H)}`
        : `D ${Math.round(bed.D)} from the body · W ${Math.round(bed.W)} (bed frame) × H ${Math.round(bed.H)} (boot)`,
    bed.snapLabel,
    bed.clamped ? `Stopped at ${bed.clamped}` : null,
    bed.pair && bed.step === "height"
      ? "Click or Enter for the depth"
      : bed.editId ? "Click or Enter to apply · Esc cancels" : "Click or Enter to create · Esc cancels",
  ];
  showTip(e.clientX, e.clientY, lines, bed.clamped ? "warn" : bed.locked[field] != null ? "lock" : "");
}

function updateBedBox(e) {
  if (e) bed.lastClient = { x: e.clientX, y: e.clientY };
  if (bed.pair && bed.step === "height") bedHeight(e);
  else bedDepth(e);
  drawBedBox(e);
}

function finishBedBox(how) {
  if (!bed) return;
  if (bed.pair && bed.step === "height") {
    bedHeight(null);
    bed.step = "depth";
    bed.snapLabel = null;
    bed.clamped = null;
    for (const k of DIM_ORDER) dimLabels[k].classList.toggle("hidden", k !== "D");
    log("bedside.height", { H: bed.H, snap: bed.H === bed.snapH ? "fixed panel bottom" : null, how });
    drawBedBox(null);
    emitMode();
    return;
  }
  const b = bed;
  const mod = getModule(b.moduleId);
  bedDepth(null);
  const f = bedFrame();
  bed = null;
  let id = b.editId;
  let changed = true;
  if (b.pair) {
    const poseFor = (side) => side === "left"
      ? { x: f.minX + b.W, y: f.y + b.D, z: 0, rotZ: 180 }
      : { x: f.maxX, y: f.y + b.D, z: 0, rotZ: 180 };
    const existing = job.getJob().cabinets.filter((c) => c.moduleId === b.moduleId);
    if (existing.length) {
      const before = job.snapshot();
      for (const c of existing) job.updateCabinet(c.id, (cab) => { cab.params = mod.setEnvelope(cab.params, { W: b.W, D: b.D, H: b.H }); cab.pose = poseFor(cab.params.side); });
      changed = job.commitSnapshot(before);
      id = existing[0].id;
    } else {
      const left = job.addCabinet(b.moduleId, poseFor("left"), { W: b.W, D: b.D, H: b.H }, { params: { side: "left" } });
      job.addCabinet(b.moduleId, poseFor("right"), { W: b.W, D: b.D, H: b.H }, {
        history: false,
        params: { side: "right", zones: [{ id: "lower", type: "left_door" }, { id: "upper", type: "drawer" }] },
      });
      id = left.id;
    }
  } else {
    const pose = { x: f.cx + b.W / 2, y: f.y + b.D, z: 0, rotZ: 180 };
    if (id) {
      const before = job.snapshot();
      job.updateCabinet(id, (c) => { c.params = mod.setEnvelope(c.params, { W: b.W, D: b.D, H: b.H }); c.pose = pose; });
      changed = job.commitSnapshot(before);
    } else {
      id = job.addCabinet(b.moduleId, pose, { W: b.W, D: b.D, H: b.H }).id;
    }
  }
  const cab = job.getJob().cabinets.find((c) => c.id === id);
  const pose = cab ? cab.pose : null;
  log(b.pair ? "bedside.finish" : "bedbox.finish", { moduleId: b.moduleId, id, how, bodyId: f.bodyId, W: b.W, D: b.D, H: b.H, locked: b.locked, snap: b.snapLabel, clamped: b.clamped, edited: !!b.editId, changed, pair: b.pair || undefined, pose, envelope: cab ? mod.envelope(cab.params) : null });
  clearPreview();
  canvas.style.cursor = "";
  job.select(id);
  emitMode();
}

export function cancelBedBox() {
  if (!bed) return;
  const b = bed;
  bed = null;
  log(b.pair ? "bedside.cancel" : "bedbox.cancel", { moduleId: b.moduleId, editId: b.editId, step: b.step, W: b.W, D: b.D });
  clearPreview();
  canvas.style.cursor = "";
  emitMode();
}

export const MODE = {
  mode: () => (bed ? `bedbox.${bed.step}` : null),
  typing: () => !!bed,
  dims: () => ({
    typable: () => (bed.pair && bed.step === "height" ? ["H"] : ["D"]),
    current: (k) => bed[k] ?? 0,
    max: (k) => {
      if (bed.pair && bed.step === "height" && k === "H") return bedFrame()?.bodyParams.height ?? null;
      return bedBoxBox().max[k] ?? null;
    },
    set: (k, v) => {
      if (bed.pair && bed.step === "height") {
        if (k !== "H") return;
        const min = getModule(bed.moduleId).minSize.H;
        bed.locked.H = v != null && v >= min ? v : null;
        log("bedside.typein", { dim: k, value: dimInputs.H.value, locked: bed.locked.H, step: bed.step });
        bedHeight(null);
        drawBedBox(null);
        return;
      }
      if (k !== "D") return; // W and H come from the body
      const min = getModule(bed.moduleId).minSize.D;
      bed.locked.D = v != null && v >= min ? v : null;
      log(bed.pair ? "bedside.typein" : "bedbox.typein", { dim: k, value: dimInputs.D.value, locked: bed.locked.D, step: bed.step });
      bedDepth(null);
      drawBedBox(null);
    },
  }),
  down(e) {
    if (!bed) return false;
    finishBedBox("click");
    return true;
  },
  hover(e) {
    if (!bed) return false;
    updateBedBox(e);
    return true;
  },
  confirm: (how) => { finishBedBox(how); return true; },
  cancel: () => { cancelBedBox(); return true; },
  leave: () => { if (bed) hideTip(); },
  tick: () => { if (bed) drawBedBox(null); },
  stop: () => cancelBedBox(),
};
registerMode(MODE);
