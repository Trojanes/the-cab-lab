/**
 * Middle overhead of the bedroom body.
 *
 * A normal overhead with three differences: no T4, T1/T2 are the body's
 * wall-to-wall rails (not emitted here), and its T3 matches the wardrobe T3s
 * in depth and height. The bays are up flaps only, two or three. Each upright
 * (D0, the internal dividers, DN) tongues into the bottom panel; T3 is notched
 * for those uprights alone — this cabinet is assembled on its own.
 *
 * The bottom panel is a straight cut OHC_BP_OVERSIZE past the y where the roof
 * meets its top face. The uprights stop on that roof line. Trim the panel to
 * the slope on the sliding table saw.
 */

import type { Board, Joint, OhcLayout, OhcZone, ProfilePoint } from "./types.ts";
import { RULES as R } from "./rules.ts";
import { Outline, dim, lit, param, same } from "../_lib/dim.ts";
import { addFeature, annotate, attachFaces, faceRef, joint, localRect, tagEdges } from "../_lib/model.ts";
import { addT3LedChannels } from "./led.ts";

const EPS = 1e-6;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

export interface OhcHost {
  width: number;
  depth: number;
  height: number;
  roofProfile: Array<[number, number]>;
  wardrobeWidth: number;
  ohcBottom: number;
  ohcZones?: OhcZone[];
  panelThickness: number;
  doorPanelThickness: number;
  carcassColor: string;
  doorColor: string;
  /** Roof height at local y. */
  roofAt: (y: number) => number;
  seat: number;
  t3Top: number;
  /** LED channels on this T3's top: the provenance key of T1's front. Null = none. */
  led?: { t1FrontKey: string } | null;
}

/** Two or three bays whose widths sum to `opening`, last one absorbing the remainder. */
export function normalizeOhcZones(raw: OhcZone[] | undefined, opening: number): OhcZone[] {
  const count = raw && (raw.length === 2 || raw.length === 3) ? raw.length : R.OHC_ZONE_COUNT_DEFAULT.value;
  const given = raw && raw.length === count ? raw : [];
  const sum = given.reduce((s, z) => s + (Number.isFinite(z.width) ? z.width : 0), 0);
  const total = round1(Math.max(0, opening));
  if (sum <= EPS) {
    const each = round1(total / count);
    return Array.from({ length: count }, (_, i) => ({
      id: `ohc-${i + 1}`,
      width: i === count - 1 ? round1(total - each * (count - 1)) : each,
    }));
  }
  const scale = total / sum;
  const out = given.map((z, i) => ({ id: z.id || `ohc-${i + 1}`, width: round1(z.width * scale) }));
  const partial = out.slice(0, -1).reduce((s, z) => s + z.width, 0);
  out[out.length - 1]!.width = round1(total - partial);
  return out;
}

/** Move the centreline between bay `index` and the next one to cabinet x. */
export function setOhcBoundary(raw: { width?: number; wardrobeWidth?: number; ohcZones?: OhcZone[] }, index: number, x: number): OhcZone[] | null {
  const W = round1(Number(raw.width) || 0);
  const ww = round1(Number(raw.wardrobeWidth) || 0);
  const x0 = ww;
  const opening = round1(W - 2 * ww);
  const zones = normalizeOhcZones(raw.ohcZones, opening).map((z) => ({ ...z }));
  const left = zones[index];
  const right = zones[index + 1];
  if (!left || !right) return null;
  const start = round1(x0 + zones.slice(0, index).reduce((s, z) => s + z.width, 0));
  const total = round1(left.width + right.width);
  const minW = R.OHC_ZONE_MIN_MM.value;
  const at = round1(Math.max(start + minW, Math.min(start + total - minW, Number(x))));
  left.width = round1(at - start);
  right.width = round1(total - left.width);
  return zones;
}

/** Replace the bays with `count` equal up flaps (2 or 3). */
export function equalOhcZones(opening: number, count: 2 | 3): OhcZone[] {
  return normalizeOhcZones(Array.from({ length: count }, (_, i) => ({ id: `ohc-${i + 1}`, width: 1 })), opening);
}

/** Local y where the roof drops through `z`. The body depth when the roof stays above it. */
export function yWhereRoofMeets(roofAt: (y: number) => number, depth: number, z: number): number {
  if (roofAt(0) <= z + EPS) return 0;
  if (roofAt(depth) >= z - EPS) return round1(depth);
  const steps = 40;
  let lo = 0;
  let hi = depth;
  for (let i = 0; i <= steps; i += 1) {
    const y = (depth * i) / steps;
    if (roofAt(y) <= z) { hi = y; break; }
    lo = y;
  }
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (roofAt(mid) > z) lo = mid;
    else hi = mid;
  }
  return round1(hi);
}

export interface BuiltOhc {
  boards: Board[];
  joints: Joint[];
  info: OhcLayout;
  warnings: string[];
}

export function buildBedroomOhc(host: OhcHost): BuiltOhc {
  const cpt = host.panelThickness;
  const dpt = host.doorPanelThickness;
  const x0 = host.wardrobeWidth;
  const x1 = round1(host.width - host.wardrobeWidth);
  const opening = round1(x1 - x0);
  const zones = normalizeOhcZones(host.ohcZones, opening);
  const bpZ0 = round1(host.ohcBottom + R.OHC_DOOR_DROP_MM.value);
  const bpZ1 = round1(bpZ0 + cpt);
  const uprightBack = yWhereRoofMeets(host.roofAt, host.depth, bpZ1);
  const bpBack = round1(Math.min(host.depth, uprightBack + R.OHC_BP_OVERSIZE_MM.value));
  const seat = host.seat;
  const t3Top = host.t3Top;
  const t3Depth = R.WARDROBE_T3_DEPTH_MM.value;
  const sideClear = R.OHC_T3_NOTCH_SIDE_CLEARANCE_MM.value;
  const notchSlot = round1(cpt + 2 * sideClear);
  const grooveSlot = round1(cpt + R.OHC_FEATURE_CLEARANCE_MM.value);
  // The upright rises above the seat at the lip. The notch comes forward another 5 mm (the T3 tail clearance) so the cutter clears that face too.
  const notchY = round1(R.WARDROBE_T2_BACK_MM.value + R.WARDROBE_T3_LIP_DEPTH_MM.value - R.WARDROBE_T3_TAIL_CLEARANCE_MM.value);
  const tongueH = round1(cpt / 2 - 0.5);
  const grooveDepth = round1(cpt / 2);
  const clearance = R.OHC_FRONT_CLEARANCE_MM.value;

  const placed = zones.map((z, i) => {
    const zx0 = round1(x0 + zones.slice(0, i).reduce((s, q) => s + q.width, 0));
    return { ...z, x0: zx0, x1: round1(zx0 + z.width) };
  });
  const centers = [
    round1(x0 + cpt / 2),
    ...placed.slice(0, -1).map((z) => z.x1),
    round1(x1 - cpt / 2),
  ];

  const warnings: string[] = [];
  if (bpBack > uprightBack + 0.05) {
    warnings.push(`the overhead bottom panel is cut ${R.OHC_BP_OVERSIZE_MM.value} mm past the roof — trim it to the slope on the sliding table saw`);
  }

  const P = param({
    x0, x1, bpZ0, bpZ1, uprightBack, bpBack, seat, t3Top, cpt, dpt, opening,
  });

  // --- bottom panel -----------------------------------------------------------------
  const bp = board("OHC_BP", "Overhead bottom panel", "bottom_panel", "XY", "Z", cpt, {
    x0: dim("OHC_BP.x0", { x0: P.x0 }, (t) => t.x0),
    x1: dim("OHC_BP.x1", { x1: P.x1 }, (t) => t.x1),
    y0: dim("OHC_BP.y0", {}, () => 0, { formula: "0" }),
    y1: dim("OHC_BP.y1", { bpBack: P.bpBack }, (t) => t.bpBack),
    z0: dim("OHC_BP.z0", { bpZ0: P.bpZ0 }, (t) => t.bpZ0),
    z1: dim("OHC_BP.z1", { bpZ1: P.bpZ1 }, (t) => t.bpZ1),
  });
  bp.notes = [`straight back, ${R.OHC_BP_OVERSIZE_MM.value} mm past the uprights — trim to the roof on site`];

  // --- T3, notched at the rear for this cabinet's uprights only ----------------------
  const t3 = board("OHC_T3", "Overhead T3", "top_panel", "XY", "Z", R.WARDROBE_T3_THICKNESS_MM.value, {
    x0: same("OHC_T3.x0", "OHC_BP.x0"),
    x1: same("OHC_T3.x1", "OHC_BP.x1"),
    y0: dim("OHC_T3.y0", {}, () => 0, { formula: "0" }),
    y1: dim("OHC_T3.y1", { T3D: R.WARDROBE_T3_DEPTH_MM }, (t) => t.T3D),
    z0: dim("OHC_T3.z0", { seat: P.seat }, (t) => t.seat),
    z1: dim("OHC_T3.z1", { t3Top: P.t3Top }, (t) => t.t3Top),
  });
  const localNotches = centers.map((c) => {
    const u = c - x0;
    return [round1(Math.max(0, u - notchSlot / 2)), round1(Math.min(opening, u + notchSlot / 2))] as [number, number];
  });
  t3.profileVector = t3Outline(opening, localNotches, t3Depth, notchY).map(([x, y]) => ({ x: round1(x + x0), y: round1(y) }));

  // --- uprights ----------------------------------------------------------------------
  const tongueY0 = round1(uprightBack / 3 + 5);
  const tongueY1 = round1((2 * uprightBack) / 3 - 5);
  const grooveY0 = round1(uprightBack / 3);
  const grooveY1 = round1((2 * uprightBack) / 3);
  const dividers: Board[] = centers.map((center, i) => {
    const id = `OHC_D${i}`;
    const name = i === 0 ? "Overhead side · left" : i === centers.length - 1 ? "Overhead side · right" : `Overhead divider ${i}`;
    const b = board(id, name, "divider", "YZ", "X", cpt, {
      x0: dim(`${id}.x0`, { c: center, cpt }, (t) => round1(t.c - t.cpt / 2)),
      x1: dim(`${id}.x1`, { c: center, cpt }, (t) => round1(t.c + t.cpt / 2)),
      y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
      y1: dim(`${id}.y1`, { uprightBack: P.uprightBack }, (t) => t.uprightBack),
      z0: dim(`${id}.z0`, { bpZ1: P.bpZ1, tongueH }, (t) => round1(t.bpZ1 - t.tongueH)),
      z1: dim(`${id}.z1`, { roof: round1(host.roofAt(R.WARDROBE_T2_BACK_MM.value)) }, (t) => t.roof, { formula: "roof(T2 back)" }),
    });
    b.profileVector = dividerOutline(host, uprightBack, bpZ1, tongueH, tongueY0, tongueY1, seat, t3Top);
    return b;
  });

  // --- up flaps ----------------------------------------------------------------------
  const doors: Board[] = placed.map((zone, i) => {
    const id = `OHC_FP${i}`;
    const leftEdge = i === 0;
    const rightEdge = i === placed.length - 1;
    const dx0 = leftEdge ? round1(zone.x0 + clearance) : round1(zone.x0 + clearance / 2);
    const dx1 = rightEdge ? round1(zone.x1 - clearance) : round1(zone.x1 - clearance / 2);
    return board(id, `Overhead door ${i + 1}`, "front_panel", "XZ", "Y", dpt, {
      x0: dim(`${id}.x0`, { dx0 }, (t) => t.dx0),
      x1: dim(`${id}.x1`, { dx1 }, (t) => t.dx1),
      y0: dim(`${id}.y0`, { dpt }, (t) => -t.dpt),
      y1: dim(`${id}.y1`, {}, () => 0, { formula: "0" }),
      z0: dim(`${id}.z0`, { bottom: host.ohcBottom }, (t) => t.bottom),
      z1: same(`${id}.z1`, "OHC_T3.z1"),
    });
  });

  const boards = [bp, t3, ...dividers, ...doors];
  for (const b of boards) {
    b.role = b.category;
    b.zoneId = "ohc";
    b.source = "bedroom.ohc";
  }
  attachFaces(boards);
  bp.stock = { kind: "carcass", thickness: cpt, colour: host.carcassColor };
  t3.stock = { kind: "carcass", thickness: t3.materialThickness, colour: host.carcassColor };
  for (const d of dividers) d.stock = { kind: "carcass", thickness: cpt, colour: host.carcassColor };
  for (const d of doors) d.stock = { kind: "door", thickness: dpt, colour: host.doorColor };
  annotate(bp, "A", { semantic: "top", visible: false });
  annotate(bp, "B", { semantic: "bottom", visible: true, finish: { colour: host.carcassColor } });
  annotate(t3, "A", { semantic: "top", visible: false });
  annotate(t3, "B", { semantic: "bottom", visible: false });
  for (const d of doors) {
    annotate(d, "A", { semantic: "inside", visible: false });
    annotate(d, "B", { semantic: "front", visible: true, finish: { colour: host.doorColor } });
  }

  // Grooves in the top of the bottom panel, one per upright.
  centers.forEach((center, i) => {
    const id = `OHC_D${i}`;
    const gx0 = round1(Math.max(x0, center - grooveSlot / 2));
    const gx1 = round1(Math.min(x1, center + grooveSlot / 2));
    const r = localRect(bp, { x: [gx0, gx1], y: [grooveY0, grooveY1] });
    addFeature(bp, "A", {
      id: `BG_${id}`,
      kind: "groove",
      ...r,
      depth: grooveDepth,
      for: id,
      key: `OHC_BP.feat.BG_${id}`,
      source: "bedroom.ohc",
    });
    const div = dividers[i]!;
    tagEdges(div, "tongue", {
      u0: tongueY0 - EPS,
      u1: tongueY1 + EPS,
      v0: -EPS,
      v1: tongueH + EPS,
    }, { id: `${id}_TONGUE`, for: "OHC_BP", source: "bedroom.ohc" });
  });

  // Hinge cups on the inside face (A = +Y = y 0).
  const fromTop = R.OHC_HINGE_FROM_TOP_MM.value;
  doors.forEach((door, i) => {
    const h = door.z1 - door.z0;
    const v = round1(h - fromTop);
    const xs = cupXs(door, i, placed.length, x0, x1, placed[i]!);
    const faceA = door.faces!.find((f) => f.id === "A")!;
    xs.forEach((cabX, n) => {
      faceA.features.push({
        id: `${door.id}_HINGE_${n}`,
        kind: "hole",
        center: [round1(cabX - door.x0), v],
        diameter: R.WARDROBE_HINGE_DIAMETER_MM.value,
        depth: R.WARDROBE_HINGE_DEPTH_MM.value,
        through: false,
        for: "hinge",
        key: `${door.id}.feat.HINGE_${n}`,
        source: "bedroom.ohc",
      });
    });
  });

  // LED channels on the T3 top. A feed branch that lands in a notch stops at the notch front.
  if (host.led) {
    addT3LedChannels(t3, {
      t1FrontKey: host.led.t1FrontKey,
      rearAt: (bx0, bx1) => {
        const hit = localNotches.some(([n0, n1]) => bx1 > x0 + n0 - EPS && bx0 < x0 + n1 + EPS);
        return hit ? notchY : t3Depth;
      },
      source: "bedroom.ohc",
    }, warnings);
  }

  const joints: Joint[] = [];
  for (const div of dividers) {
    const tongues = div.faces!.filter((f) => f.features.some((ft) => ft.kind === "tongue"));
    if (!tongues.length) continue;
    joints.push(joint(`${div.id}_BP`, "tongue_groove", faceRef(bp.id, ["A"]), faceRef(div.id, tongues), { hardware: [], rule: "bedroom_ohc_tongue_v1" }));
  }

  return {
    boards,
    joints,
    warnings,
    info: {
      zones: placed,
      centers,
      bpZ0,
      bpZ1,
      uprightBack,
      bpBack,
      oversize: R.OHC_BP_OVERSIZE_MM.value,
    },
  };
}

/** Two-bay cups sit 150 from the outer faces and the centre divider; three-bay cups sit 100 from each door edge. */
function cupXs(door: Board, index: number, count: number, x0: number, x1: number, zone: { x0: number; x1: number }): number[] {
  if (count === 2) {
    const from = R.OHC_HINGE_FROM_SIDE_2_MM.value;
    return index === 0 ? [round1(x0 + from), round1(zone.x1 - from)] : [round1(zone.x0 + from), round1(x1 - from)];
  }
  const from = R.OHC_HINGE_FROM_SIDE_3_MM.value;
  return [round1(door.x0 + from), round1(door.x1 - from)];
}

function t3Outline(width: number, notches: Array<[number, number]>, depth: number, notchY: number): Array<[number, number]> {
  const rear = depth;
  const ranges = [...notches].sort((a, b) => b[0] - a[0]);
  const o = new Outline("OHC_T3.pv", ["x", "y"]);
  o.add(lit(0), lit(0));
  o.add(lit(width), lit(0));
  let guard = 0;
  const pushRear = (x: number) => o.add(lit(x), lit(rear));
  const pushNotch = (x: number) => o.add(lit(x), lit(notchY));
  if (ranges.length && ranges[0]![1] >= width - EPS) {
    const [nx0] = ranges.shift()!;
    pushNotch(width);
    pushNotch(nx0);
    pushRear(nx0);
  } else {
    pushRear(width);
  }
  while (ranges.length && guard < 8) {
    guard += 1;
    const [nx0, nx1] = ranges.shift()!;
    pushRear(nx1);
    pushNotch(nx1);
    pushNotch(nx0);
    if (nx0 <= EPS) {
      o.add(lit(0), lit(notchY));
      o.add(lit(0), lit(0));
      return o.points;
    }
    pushRear(nx0);
  }
  o.add(lit(0), lit(rear));
  o.add(lit(0), lit(0));
  return o.points;
}

function dividerOutline(
  host: OhcHost,
  uprightBack: number,
  bpTop: number,
  tongueH: number,
  tongueY0: number,
  tongueY1: number,
  seat: number,
  t3Top: number,
): ProfilePoint[] {
  const t2Back = R.WARDROBE_T2_BACK_MM.value;
  const lip = round1(t2Back + R.WARDROBE_T3_LIP_DEPTH_MM.value);
  const rail = round1(t3Top + R.WARDROBE_T3_CLEARANCE_MM.value);
  const pts: ProfilePoint[] = [
    { y: 0, z: bpTop },
    { y: tongueY0, z: bpTop },
    { y: tongueY0, z: round1(bpTop - tongueH) },
    { y: tongueY1, z: round1(bpTop - tongueH) },
    { y: tongueY1, z: bpTop },
    { y: uprightBack, z: bpTop },
  ];
  // Above the seat the upright is the wardrobe colour panel's front profile: roof back to the
  // T2 back, down to the pocket, the pocket out to the lip, down to the seat, the seat to the room face.
  const roof = (y: number) => round1(host.roofAt(y));
  pts.push({ y: uprightBack, z: roof(uprightBack) });
  const breaks = (host.roofProfile || []).map((q) => q[0]).filter((y) => y > t2Back + EPS && y < uprightBack - EPS).sort((a, b) => b - a);
  for (const y of breaks) pts.push({ y: round1(y), z: roof(y) });
  if (uprightBack > t2Back + EPS) {
    pts.push({ y: t2Back, z: roof(t2Back) });
    pts.push({ y: t2Back, z: rail });
  }
  if (uprightBack > lip + EPS) pts.push({ y: lip, z: rail });
  pts.push({ y: Math.min(lip, uprightBack), z: seat });
  pts.push({ y: 0, z: seat });
  pts.push({ y: 0, z: bpTop });
  return pts;
}

function board(
  id: string,
  name: string,
  category: string,
  profilePlane: Board["profilePlane"],
  thicknessAxis: Board["thicknessAxis"],
  materialThickness: number,
  f: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number },
): Board {
  return {
    id,
    name,
    category,
    boardType: "panel",
    materialThickness: round1(materialThickness),
    profilePlane,
    thicknessAxis,
    x0: round1(f.x0),
    x1: round1(f.x1),
    y0: round1(f.y0),
    y1: round1(f.y1),
    z0: round1(f.z0),
    z1: round1(f.z1),
    source: "bedroom.ohc",
  };
}
