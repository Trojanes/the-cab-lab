// Re-type the last created box: armed with a fresh cabinet, typing digits opens
// the W/D/H type-ins against that cabinet's envelope. An overlay on the armed
// placement — getMode has no retype token; the box stays selected.
import { canvas } from "../space.js";
import * as job from "../job.js";
import { getModule } from "../modules.js";
import { envelopeFootprint, poseFits, FRONT_THICKNESS_DEFAULT } from "../fit.js";
import { log } from "../log.js";
import {
  host, registerMode,
  dimBox, DIM_ORDER, dimInputs, dimLabels, setDimNames, positionDimInputs,
} from "./shared.js";

let retype = null; // { id, before, params0 }

export function retypeActive() { return !!retype; }

export function beginRetype(lastCreated) {
  const cab = job.getJob().cabinets.find((c) => c.id === lastCreated);
  if (!cab) return false;
  retype = { id: cab.id, before: job.snapshot(), params0: cab.params };
  setDimNames(["W", "D", "H"]);
  dimBox.classList.remove("hidden");
  for (const k of DIM_ORDER) dimLabels[k].classList.remove("focused", "locked", "hidden");
  updateRetype();
  log("retype.start", { id: cab.id });
  return true;
}
function retypeBox() {
  const cab = job.getJob().cabinets.find((c) => c.id === retype.id);
  const fp = envelopeFootprint(cab, cab.pose);
  const env = getModule(cab.moduleId).envelope(cab.params);
  return { x0: fp.minX, y0: fp.minY, z0: fp.z0, W: env.W, D: env.D + FRONT_THICKNESS_DEFAULT, H: env.H };
}
function updateRetype() {
  const b = retypeBox();
  for (const k of DIM_ORDER) if (document.activeElement !== dimInputs[k]) dimInputs[k].value = Math.round(b[k]);
  positionDimInputs(b);
}
function applyRetype(k, v) {
  const cab = job.getJob().cabinets.find((c) => c.id === retype.id);
  const mod = getModule(cab.moduleId);
  const min = host.minSizeOf(mod);
  if (!(v >= min[k])) return;
  const size = k === "D" ? { D: v - FRONT_THICKNESS_DEFAULT } : { [k]: v };
  const params = mod.setEnvelope(cab.params, size);
  if (!poseFits({ ...cab, params }, cab.pose)) return;
  job.setParams(cab.id, params, { history: false });
  updateRetype();
}
export function endRetype(commit) {
  if (!retype) return;
  const r = retype;
  retype = null;
  if (commit) {
    const changed = job.commitSnapshot(r.before);
    const cab = job.getJob().cabinets.find((c) => c.id === r.id);
    log("retype.end", { id: r.id, changed, envelope: cab ? getModule(cab.moduleId).envelope(cab.params) : null });
  } else {
    job.setParams(r.id, r.params0, { history: false });
    log("retype.cancel", { id: r.id });
  }
  dimBox.classList.add("hidden");
  canvas.focus?.();
}

export const MODE = {
  mode: () => null, // overlay on "armed" — the mode token stays the placement one
  typing: () => !!retype,
  dims: () => ({
    current: (k) => retypeBox()[k],
    set: (k, v) => {
      if (v != null) applyRetype(k, v);
      log("retype.typein", { dim: k, value: dimInputs[k].value });
    },
  }),
  confirm: () => endRetype(true),
  cancel: () => endRetype(false),
  // Yields the dim chrome to a resident mode while one claims (rb mid-draw wins
  // over retype — the same order the old else-if chain had).
  tick() { if (retype && !(host.legacy && host.legacy.claims && host.legacy.claims())) updateRetype(); },
  stop: () => endRetype(false),
};
registerMode(MODE);
