// Change to waterfall / Change to partition.
//
// A partition fitted between a base (kitchen) and an overhead can become the
// kitchen's waterfall (bench stock, floor → bench top) plus the overhead's
// door-stock end panel (door underside → top, flush with the door face), and
// back again. The partition's outer face — the side away from the cabinets —
// stays the outer face of both boards. The thickness differences come from the
// stock, never from a fixed number: the kitchen column beside the partition
// gives (waterfall − partition), the overhead zone beside it gains
// (partition − door). Between the bench top and the overhead nothing is built.
//
// Pure planning: these functions read the job and return what would change;
// job.js applies a plan in one undo step.
import { localAxes, worldOf } from "./pose.js";
import {
  MIN_ZONE_WIDTH, getModule, isBaseCabinet, kitchenBenchOn, kitchenBenchThickness, kitchenWaterfallSide,
  overheadEndPanel, overheadEndPanelThickness,
} from "./modules.js";
import { thickness } from "./materials.js";
import { ABUT_TOLERANCE_MM, FIT_KITCHEN_DEPTH_EXTRA_MM, cabinetOuter, endAgainst, readFit, wallFaces } from "./walls.js";

const PARALLEL = 0.985;
const round1 = (v) => Math.round(v * 10) / 10;

function axisIndex(axis) { return axis === "x" ? 0 : 1; }

function doorThickness(params) {
  const n = Number(params && params.frontPanelThickness);
  return Number.isFinite(n) && n > 0 ? n : 16;
}

/**
 * What "Change to waterfall" would do to the partition `wall`, or why it cannot.
 * { ok, reason?, wall, axis, outer, dirIn, kitchen: { id, side, delta, pose, columns: [{ id, width, ok }] },
 *   overhead: { id, side, delta, pose, zones: [{ id, width, ok }] } }
 * `delta` is the change of the carcass (kitchen) / of the end zone (overhead): negative gives.
 */
export function waterfallPlan(wall, { stock, cabinets }) {
  const refuse = (reason) => ({ ok: false, reason, wall });
  if (!wall) return refuse("no partition");
  if (!wall.fit) return refuse("Fit to cabinets first");
  if ((wall.openings || []).length) return refuse("this partition has a door");
  const fit = readFit(wall);
  if (fit && fit.loungeId) return refuse("a lounge does not become a waterfall");
  if (!fit || !fit.kitchen || !fit.overhead) return refuse((fit && fit.warnings[0]) || "the fit is incomplete");
  if (fit.warnings.length) return refuse(fit.warnings[0]);
  const kit = (cabinets || []).find((c) => c.id === fit.kitchenId);
  const ohc = (cabinets || []).find((c) => c.id === fit.overheadId);
  if (!kit || !ohc) return refuse("the fitted cabinets are missing");
  if (kit.moduleId !== "kitchenCabinet") return refuse("an ensuite has no waterfall");
  if (!kitchenBenchOn(kit.params)) return refuse("the kitchen needs a bench top colour");
  if (kitchenWaterfallSide(kit.params)) return refuse(`${kit.id} already has a waterfall`);
  if (overheadEndPanel(ohc.params)) return refuse(`${ohc.id} already has an end panel`);
  const { lo, hi, t } = wallFaces(wall, stock);
  const kBox = getModule(kit.moduleId).localBox(kit.params);
  const oBox = getModule(ohc.moduleId).localBox(ohc.params);
  const k = endAgainst(kit, kBox, wall.axis, lo, hi);
  if (k.reason) return refuse(k.reason);
  const o = endAgainst(ohc, oBox, wall.axis, lo, hi);
  if (o.reason) return refuse(o.reason);
  if (k.dirIn !== o.dirIn) return refuse("the base and the overhead are on different sides of the partition");
  for (const [cab, e] of [[kit, k], [ohc, o]]) {
    if (Math.abs(e.gap) > ABUT_TOLERANCE_MM) return refuse(`${cab.id} is ${Math.abs(e.gap)} mm ${e.gap > 0 ? "from" : "into"} the partition`);
  }
  const fall = kitchenBenchThickness();
  const fpt = doorThickness(ohc.params);
  const kitchenDelta = round1(k.gap + t - fall);
  const ohcDelta = round1(o.gap + t - fpt);
  const key = wall.axis;
  const columns = (kit.params.columns || []).map((c) => ({ id: c.id, width: c.width, ok: round1(c.width + kitchenDelta) >= MIN_ZONE_WIDTH }));
  const zones = (ohc.params.zones || []).map((z) => ({ id: z.id, width: z.width, ok: round1(z.width + ohcDelta) >= MIN_ZONE_WIDTH }));
  if (!columns.length) return refuse(`${kit.id} has no column`);
  if (!zones.length) return refuse(`${ohc.id} has no zone`);
  if (!columns.some((c) => c.ok)) return refuse(`no column of ${kit.id} can give ${Math.abs(kitchenDelta)} and stay ${MIN_ZONE_WIDTH}`);
  if (!zones.some((z) => z.ok)) return refuse(`no zone of ${ohc.id} can give ${Math.abs(ohcDelta)} and stay ${MIN_ZONE_WIDTH}`);
  return {
    ok: true,
    wall,
    axis: wall.axis,
    outer: round1(k.outer),
    dirIn: k.dirIn,
    partitionThickness: t,
    kitchen: {
      id: kit.id,
      side: k.side,
      delta: kitchenDelta,
      shift: round1(k.gap + t), // how far the box frame moves toward the partition (left end only)
      thickness: fall,
      pose: k.side === "left" ? { ...kit.pose, [key]: round1(k.outer) } : { ...kit.pose },
      columns,
    },
    overhead: {
      id: ohc.id,
      side: o.side,
      delta: ohcDelta,
      thickness: fpt,
      pose: o.side === "left" ? { ...ohc.pose, [key]: round1(k.outer + k.dirIn * fpt) } : { ...ohc.pose },
      zones,
    },
  };
}

/** World position of a cabinet's waterfall / end-panel outer face along its local x, and the inward direction. */
function outerFace(cab, side, thick, boxX0, boxX1) {
  const [ex] = localAxes(cab.pose);
  const axis = Math.abs(ex[0]) >= PARALLEL ? "x" : Math.abs(ex[1]) >= PARALLEL ? "y" : null;
  if (!axis) return null;
  const k = axisIndex(axis);
  const x = side === "left" ? boxX0 : boxX1;
  const outer = worldOf(cab.pose, [x, 0, 0])[k];
  const dirIn = (side === "left" ? 1 : -1) * Math.sign(ex[k]);
  return { axis, outer: round1(outer), dirIn, thick };
}

/** The kitchen's waterfall outer face (null without one). */
export function kitchenWaterfallFace(kit) {
  const side = kitchenWaterfallSide(kit.params);
  if (!side) return null;
  const box = getModule(kit.moduleId).localBox(kit.params);
  return { ...outerFace(kit, side, kitchenBenchThickness(), box.x0, box.x1), side };
}

/** The overhead's end-panel outer face (null without one). */
export function overheadEndPanelFace(ohc) {
  const side = overheadEndPanel(ohc.params);
  if (!side) return null;
  const box = getModule(ohc.moduleId).localBox(ohc.params);
  return { ...outerFace(ohc, side, overheadEndPanelThickness(ohc.params), box.x0, box.x1), side };
}

/**
 * What "Change to partition" would do from `cab` (a kitchen with a waterfall or
 * an overhead with an end panel), or why it cannot. Both boards must exist with
 * their outer faces in one plane. Returns
 * { ok, reason?, wall: { axis, at, side, u0, u1, fit }, kitchen: { id, side, delta, pose, columns }, overhead: { id, side, delta, pose, zones } }
 */
export function partitionPlan(cab, { stock, cabinets }) {
  const refuse = (reason) => ({ ok: false, reason });
  if (!cab) return refuse("nothing selected");
  const list = cabinets || [];
  let kit = null;
  let ohc = null;
  if (isBaseCabinet(cab.moduleId)) {
    if (!kitchenWaterfallSide(cab.params)) return refuse(`${cab.id} has no waterfall`);
    kit = cab;
  } else if (cab.moduleId === "overheadCabinet") {
    if (!overheadEndPanel(cab.params)) return refuse(`${cab.id} has no end panel`);
    ohc = cab;
  } else return refuse("only a kitchen waterfall or an overhead end panel changes to a partition");
  const kFaceOf = (c) => kitchenWaterfallFace(c);
  const oFaceOf = (c) => overheadEndPanelFace(c);
  const same = (a, b) => a && b && a.axis && b.axis && a.axis === b.axis && a.dirIn === b.dirIn && Math.abs(a.outer - b.outer) <= 1;
  if (kit) {
    const kf = kFaceOf(kit);
    if (!kf || !kf.axis) return refuse(`${kit.id} does not run along X or Y`);
    ohc = list.find((c) => c.moduleId === "overheadCabinet" && same(kf, oFaceOf(c))) || null;
    if (!ohc) return refuse("no overhead end panel lies in the same plane as this waterfall");
  } else {
    const of = oFaceOf(ohc);
    if (!of || !of.axis) return refuse(`${ohc.id} does not run along X or Y`);
    kit = list.find((c) => c.moduleId === "kitchenCabinet" && same(of, kFaceOf(c))) || null;
    if (!kit) return refuse("no kitchen waterfall lies in the same plane as this end panel");
  }
  const kf = kFaceOf(kit);
  const of = oFaceOf(ohc);
  const t = thickness(stock, "partition");
  const fall = kf.thick;
  const fpt = of.thick;
  const kitchenDelta = round1(fall - t);
  const ohcDelta = round1(fpt - t);
  const columns = (kit.params.columns || []).map((c) => ({ id: c.id, width: c.width, ok: round1(c.width + kitchenDelta) >= MIN_ZONE_WIDTH }));
  const zones = (ohc.params.zones || []).map((z) => ({ id: z.id, width: z.width, ok: round1(z.width + ohcDelta) >= MIN_ZONE_WIDTH }));
  if (!columns.length) return refuse(`${kit.id} has no column`);
  if (!zones.length) return refuse(`${ohc.id} has no zone`);
  if (!columns.some((c) => c.ok)) return refuse(`no column of ${kit.id} can give ${Math.abs(kitchenDelta)} and stay ${MIN_ZONE_WIDTH}`);
  if (!zones.some((z) => z.ok)) return refuse(`no zone of ${ohc.id} can give ${Math.abs(ohcDelta)} and stay ${MIN_ZONE_WIDTH}`);
  // The new partition: `t` thick from the outer face toward the cabinets, from the
  // base's back to its front step (the fit outline steps to the overhead by itself).
  const key = kf.axis;
  const uIndex = key === "x" ? 1 : 0;
  const k = cabinetOuter(kit);
  const uBack = k.back[uIndex];
  const uFront = k.front[uIndex];
  const uEnd = uFront + Math.sign(uFront - uBack) * FIT_KITCHEN_DEPTH_EXTRA_MM;
  const wall = {
    axis: key,
    at: kf.outer,
    side: kf.dirIn,
    u0: round1(Math.min(uBack, uEnd)),
    u1: round1(Math.max(uBack, uEnd)),
    fit: { overheadId: ohc.id, kitchenId: kit.id },
  };
  const innerAt = round1(kf.outer + kf.dirIn * t);
  return {
    ok: true,
    axis: key,
    outer: kf.outer,
    dirIn: kf.dirIn,
    partitionThickness: t,
    wall,
    kitchen: {
      id: kit.id,
      side: kf.side,
      delta: kitchenDelta,
      thickness: fall,
      pose: kf.side === "left" ? { ...kit.pose, [key]: innerAt } : { ...kit.pose },
      columns,
    },
    overhead: {
      id: ohc.id,
      side: of.side,
      delta: ohcDelta,
      thickness: fpt,
      pose: of.side === "left" ? { ...ohc.pose, [key]: innerAt } : { ...ohc.pose },
      zones,
    },
  };
}
