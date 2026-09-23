/**
 * Bedside table for the north-south bedroom. One table; the placement puts
 * a mirrored pair, one against each wall.
 *
 * No back. Two carcass sides, a top shelf, a bottom shelf, and one middle
 * shelf (two zones, one above the other). Each shelf has a tongue at both
 * ends over the middle third of the depth, the full shelf thickness, through
 * the side to its outer face. Each side has a through slot per shelf: 5 mm
 * past the tongue at each end (ROUTER_DIAMETER), 1 mm taller than the shelf.
 * The middle shelf's slot is a hole in the side (0.5 above and below); the
 * top and bottom slots reach the side's edge, so they are notches in its
 * outline with the extra 1 mm toward the inside.
 *
 * A door-stock panel stands outside the bed-side carcass panel, under the
 * wardrobe's colour panel: carcass + that panel = the wardrobe width. The
 * fronts cover the whole table (shelves and that panel) with one side
 * clearance at every edge and between them.
 *
 * Local: x = 0 at the bed side when `side` is left, at the wall when right.
 * y = 0 at the room face, y = depth against the body. Fronts hang at y −door..0.
 */

import type { BedSideParams, BedSideResult, BedSideZone, BedSideZoneType, Board } from "./types.ts";
import { RULES as R } from "./rules.ts";
import { Outline, beginProvenance, dim, endProvenance, ex, lit, param, ref, same, type Term } from "../_lib/dim.ts";
import { addFeature, annotate, attachFaces, faceRef, joint, localRect, tagEdges, type Joint } from "../_lib/model.ts";

export { RULES } from "./rules.ts";
export { generateBedSideSvg } from "./svgPreview.ts";

const ZONE_TYPES: BedSideZoneType[] = ["drawer", "left_door", "right_door"];
const EPS = 0.01;

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function asNum(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function shelfLimits(raw: { height?: number; clearance?: number; panelThickness?: number }): { min: number; max: number } {
  const H = round1(asNum(raw.height, 0));
  const cl = asNum(raw.clearance, R.CLEARANCE_MM.value);
  // Fronts leave one clearance above the floor, one between them (centred on the shelf line) and one under the top.
  const min = round1(cl + R.ZONE_MIN_MM.value + cl / 2);
  const max = round1(H - cl - R.ZONE_MIN_MM.value - cl / 2);
  return { min, max: Math.max(min, max) };
}

export function normalizeZones(raw: BedSideZone[] | undefined): BedSideZone[] {
  const out: BedSideZone[] = [];
  for (let i = 0; i < 2; i += 1) {
    const z = raw && raw[i];
    const type = z && ZONE_TYPES.includes(z.type) ? z.type : (i === 0 ? "left_door" : "drawer");
    out.push({ id: z?.id || (i === 0 ? "lower" : "upper"), type });
  }
  return out;
}

/** Hinge side flips so a pair hinges toward the wall when the left table is a left door. */
export function mirrorZoneType(type: BedSideZoneType): BedSideZoneType {
  if (type === "left_door") return "right_door";
  if (type === "right_door") return "left_door";
  return "drawer";
}

function resolve(raw: BedSideParams) {
  const height = round1(asNum(raw.height, 0));
  const t = round1(asNum(raw.panelThickness, R.BOARD_THICKNESS_MM.value));
  const lim = shelfLimits({ height, clearance: raw.clearance, panelThickness: t });
  const center = round1(Math.max(lim.min, Math.min(lim.max, asNum(raw.shelfCenter, height / 2))));
  return {
    width: round1(asNum(raw.width, 0)),
    depth: round1(asNum(raw.depth, 0)),
    height,
    side: raw.side === "right" ? "right" as const : "left" as const,
    shelfCenter: center,
    zones: normalizeZones(raw.zones),
    clearance: round1(asNum(raw.clearance, R.CLEARANCE_MM.value)),
    panelThickness: t,
    doorPanelThickness: round1(asNum(raw.doorPanelThickness, R.DOOR_THICKNESS_MM.value)),
    carcassColor: String(raw.carcassColor || "White Stipple"),
    doorColor: String(raw.doorColorName || raw.doorColor || "White Stipple"),
  };
}

export function generateBedSideTable(raw: BedSideParams): BedSideResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const p = resolve(raw);
  const t = p.panelThickness;
  const dpt = p.doorPanelThickness;
  const W = p.width;
  const D = p.depth;
  const H = p.height;
  const bedAtStart = p.side === "left";

  beginProvenance();
  const P = param({ W, D, H, t, dpt, center: p.shelfCenter, cl: p.clearance });
  const BIT = R.ROUTER_DIAMETER_MM;
  const GC = R.GROOVE_CLEARANCE_MM;

  if (W < dpt + 4 * t) errors.push(`width ${W} is too narrow for the show panel and two sides`);
  if (D < 3 * (R.ROUTER_DIAMETER_MM.value + 5)) errors.push(`depth ${D} leaves no room for a tongue in the middle third`);
  if (H < t * 2 + p.clearance * 3 + R.ZONE_MIN_MM.value * 2) errors.push(`height ${H} cannot hold two zones`);

  // The carcass (both sides and the shelves) spans c0..c1; the show panel is outside it on the bed side.
  const c0 = bedAtStart ? dim("carcass.x0", { dpt: P.dpt }, (v) => v.dpt) : dim("carcass.x0", {}, () => 0, { formula: "0" });
  const c1 = bedAtStart ? dim("carcass.x1", { W: P.W }, (v) => v.W) : dim("carcass.x1", { W: P.W, dpt: P.dpt }, (v) => v.W - v.dpt);
  // Joinery along the depth: tongue over the middle third, slot BIT/2 past it at each end.
  const ty0 = dim("joint.tongue.y0", { D: P.D }, (v) => round1(v.D / 3));
  const ty1 = dim("joint.tongue.y1", { D: P.D }, (v) => round1((2 * v.D) / 3));
  const sy0 = dim("joint.slot.y0", { y: ref("joint.tongue.y0"), BIT }, (v) => v.y - v.BIT / 2);
  const sy1 = dim("joint.slot.y1", { y: ref("joint.tongue.y1"), BIT }, (v) => v.y + v.BIT / 2);
  void c0; void c1; void ty0; void ty1; void sy0; void sy1;

  const shelves = [
    {
      id: "SHELF_BOT", name: "Bottom shelf",
      z0: dim("SHELF_BOT.z0", {}, () => 0, { formula: "0" }),
      z1: dim("SHELF_BOT.z1", { t: P.t }, (v) => v.t),
      sz0: dim("slot.SHELF_BOT.z0", {}, () => 0, { formula: "0" }),
      sz1: dim("slot.SHELF_BOT.z1", { t: P.t, GC }, (v) => v.t + v.GC),
    },
    {
      id: "SHELF_MID", name: "Middle shelf",
      z0: dim("SHELF_MID.z0", { center: P.center, t: P.t }, (v) => round1(v.center - v.t / 2)),
      z1: dim("SHELF_MID.z1", { center: P.center, t: P.t }, (v) => round1(v.center + v.t / 2)),
      sz0: dim("slot.SHELF_MID.z0", { center: P.center, t: P.t, GC }, (v) => round1(v.center - (v.t + v.GC) / 2)),
      sz1: dim("slot.SHELF_MID.z1", { center: P.center, t: P.t, GC }, (v) => round1(v.center + (v.t + v.GC) / 2)),
    },
    {
      id: "SHELF_TOP", name: "Top shelf",
      z0: dim("SHELF_TOP.z0", { H: P.H, t: P.t }, (v) => v.H - v.t),
      z1: dim("SHELF_TOP.z1", { H: P.H }, (v) => v.H),
      sz0: dim("slot.SHELF_TOP.z0", { H: P.H, t: P.t, GC }, (v) => v.H - v.t - v.GC),
      sz1: dim("slot.SHELF_TOP.z1", { H: P.H }, (v) => v.H),
    },
  ];

  const boards: Board[] = [];
  const joints: Joint[] = [];
  if (!errors.length) {
    const yz = (id: string) => ({
      y0: dim(`${id}.y0`, {}, () => 0, { formula: "0" }),
      y1: dim(`${id}.y1`, { D: P.D }, (v) => v.D),
      z0: dim(`${id}.z0`, {}, () => 0, { formula: "0" }),
      z1: dim(`${id}.z1`, { H: P.H }, (v) => v.H),
    });
    const show = rect("SHOW", "Bed-side panel · door stock", "side_panel", "YZ", "X", dpt, bedAtStart
      ? { x0: dim("SHOW.x0", {}, () => 0, { formula: "0" }), x1: dim("SHOW.x1", { dpt: P.dpt }, (v) => v.dpt), ...yz("SHOW") }
      : { x0: dim("SHOW.x0", { W: P.W, dpt: P.dpt }, (v) => v.W - v.dpt), x1: dim("SHOW.x1", { W: P.W }, (v) => v.W), ...yz("SHOW") });
    const sideBed = rect("SIDE_BED", "Side · bed", "side_panel", "YZ", "X", t, bedAtStart
      ? { x0: same("SIDE_BED.x0", "carcass.x0"), x1: dim("SIDE_BED.x1", { x: ref("carcass.x0"), t: P.t }, (v) => v.x + v.t), ...yz("SIDE_BED") }
      : { x0: dim("SIDE_BED.x0", { x: ref("carcass.x1"), t: P.t }, (v) => v.x - v.t), x1: same("SIDE_BED.x1", "carcass.x1"), ...yz("SIDE_BED") });
    const sideWall = rect("SIDE_WALL", "Side · wall", "side_panel", "YZ", "X", t, bedAtStart
      ? { x0: dim("SIDE_WALL.x0", { x: ref("carcass.x1"), t: P.t }, (v) => v.x - v.t), x1: same("SIDE_WALL.x1", "carcass.x1"), ...yz("SIDE_WALL") }
      : { x0: same("SIDE_WALL.x0", "carcass.x0"), x1: dim("SIDE_WALL.x1", { x: ref("carcass.x0"), t: P.t }, (v) => v.x + v.t), ...yz("SIDE_WALL") });
    for (const side of [sideBed, sideWall]) side.profileVector = sideOutline(side.id);
    boards.push(show, sideBed, sideWall);

    for (const s of shelves) {
      const b = rect(s.id, s.name, "shelf", "XY", "Z", t, {
        x0: same(`${s.id}.x0`, "carcass.x0"),
        x1: same(`${s.id}.x1`, "carcass.x1"),
        y0: dim(`${s.id}.y0`, {}, () => 0, { formula: "0" }),
        y1: dim(`${s.id}.y1`, { D: P.D }, (v) => v.D),
        z0: s.z0,
        z1: s.z1,
      });
      b.profileVector = shelfOutline(s.id, P.t);
      boards.push(b);
    }

    const spans = [
      {
        id: "FRONT_LO", zone: p.zones[0]!,
        z0: dim("FRONT_LO.z0", { cl: P.cl }, (v) => v.cl),
        z1: dim("FRONT_LO.z1", { center: P.center, cl: P.cl }, (v) => round1(v.center - v.cl / 2)),
      },
      {
        id: "FRONT_HI", zone: p.zones[1]!,
        z0: dim("FRONT_HI.z0", { center: P.center, cl: P.cl }, (v) => round1(v.center + v.cl / 2)),
        z1: dim("FRONT_HI.z1", { H: P.H, cl: P.cl }, (v) => v.H - v.cl),
      },
    ];
    for (const f of spans) {
      if (f.z1 - f.z0 < R.ZONE_MIN_MM.value) errors.push(`${f.zone.id} zone is only ${round1(f.z1 - f.z0)} mm`);
      const door = rect(f.id, f.zone.type === "drawer" ? "Drawer front" : "Door", "front_panel", "XZ", "Y", dpt, {
        x0: dim(`${f.id}.x0`, { cl: P.cl }, (v) => v.cl),
        x1: dim(`${f.id}.x1`, { W: P.W, cl: P.cl }, (v) => v.W - v.cl),
        y0: dim(`${f.id}.y0`, { dpt: P.dpt }, (v) => -v.dpt),
        y1: dim(`${f.id}.y1`, {}, () => 0, { formula: "0" }),
        z0: f.z0,
        z1: f.z1,
      });
      boards.push(door);
    }

    for (const b of boards) b.source = "bedSideTable";
    attachFaces(boards);
    for (const b of boards) {
      const doorish = b.id === "SHOW" || b.category === "front_panel";
      b.stock = { kind: doorish ? "door" : "carcass", thickness: b.materialThickness, colour: doorish ? p.doorColor : p.carcassColor };
    }
    annotate(show, bedAtStart ? "B" : "A", { semantic: "outside", visible: true, finish: { colour: p.doorColor } });

    // Middle slot: a through hole in each side. Top / bottom slots are notches in the outline; tag them.
    const mid = shelves[1]!;
    const bedInner = bedAtStart ? "A" : "B";
    const wallInner = bedAtStart ? "B" : "A";
    for (const [side, faceId] of [[sideBed, bedInner], [sideWall, wallInner]] as const) {
      const r = localRect(side, { y: [sy0, sy1], z: [mid.sz0, mid.sz1] });
      addFeature(side, faceId, {
        id: "SLOT_SHELF_MID",
        kind: "cutout",
        ...r,
        through: true,
        for: "SHELF_MID",
        key: `${side.id}.feat.SLOT_SHELF_MID`,
        source: "bedSideTable",
      });
      for (const s of [shelves[0]!, shelves[2]!]) {
        tagEdges(side, "notch", { u0: sy0 - EPS, u1: sy1 + EPS, v0: s.sz0 - EPS, v1: s.sz1 + EPS }, { id: `SLOT_${s.id}`, for: s.id, key: `${side.id}.pv`, source: "bedSideTable" });
      }
    }
    // Tongues: tag the shelf edges beyond the carcass inner faces, and join them to their slots.
    for (const s of shelves) {
      const shelf = boards.find((b) => b.id === s.id)!;
      const w = shelf.x1 - shelf.x0;
      for (const [side, u0, u1] of [
        [bedAtStart ? sideBed : sideWall, -EPS, t + EPS],
        [bedAtStart ? sideWall : sideBed, w - t - EPS, w + EPS],
      ] as const) {
        const tags = tagEdges(shelf, "tongue", { u0, u1, v0: ty0 - EPS, v1: ty1 + EPS }, { id: `${s.id}_TONGUE_${side.id}`, for: side.id, key: `${s.id}.pv`, source: "bedSideTable" });
        const slotFaces = s.id === "SHELF_MID"
          ? [side.id === sideBed.id ? bedInner : wallInner]
          : side.faces!.filter((f) => f.features.some((ft) => ft.id === `SLOT_${s.id}`)).map((f) => f.id);
        joints.push(joint(`${s.id}_${side.id}`, "tongue_groove", faceRef(side.id, slotFaces as never), faceRef(s.id, tags), { hardware: [], rule: "bedside_through_tongue_v1" }));
      }
    }

    for (const f of spans) {
      const door = boards.find((b) => b.id === f.id)!;
      if (f.zone.type === "drawer") continue;
      const h = door.z1 - door.z0;
      const w = door.x1 - door.x0;
      if (h < R.HINGE_FROM_END_MM.value * 2 + 10) continue;
      const face = door.faces!.find((fc) => fc.id === "A")!;
      const u = f.zone.type === "left_door" ? R.HINGE_FROM_SIDE_MM.value : round1(w - R.HINGE_FROM_SIDE_MM.value);
      for (const [i, v] of [[0, R.HINGE_FROM_END_MM.value], [1, round1(h - R.HINGE_FROM_END_MM.value)]] as const) {
        face.features.push({
          id: `${door.id}_HINGE_${i}`,
          kind: "hole",
          center: [u, v],
          diameter: R.HINGE_DIAMETER_MM.value,
          depth: R.HINGE_DEPTH_MM.value,
          through: false,
          for: "hinge",
          key: `${door.id}.feat.HINGE_${i}`,
          source: "bedSideTable",
        });
      }
    }
  }

  const provenance = endProvenance();
  return {
    params: p,
    boards: errors.length ? [] : boards,
    joints: errors.length ? [] : joints,
    validation: { errors, warnings },
    debug: { boardFrame: "final", provenance },
  };
}

/** Side section (y, z), counter-clockwise: open notches at the bottom and top for those shelves' tongues. */
function sideOutline(id: string): Array<{ y: number; z: number }> {
  const o = new Outline(`${id}.pv`, ["y", "z"]);
  const Y = (k: string) => ex({ y: ref(k) }, (v) => v.y);
  const Z = (k: string) => ex({ z: ref(k) }, (v) => v.z);
  o.add(lit(0), lit(0));
  o.add(Y("joint.slot.y0"), lit(0));
  o.add(Y("joint.slot.y0"), Z("slot.SHELF_BOT.z1"));
  o.add(Y("joint.slot.y1"), Z("slot.SHELF_BOT.z1"));
  o.add(Y("joint.slot.y1"), lit(0));
  o.add(Y(`${id}.y1`), lit(0));
  o.add(Y(`${id}.y1`), Z(`${id}.z1`));
  o.add(Y("joint.slot.y1"), Z(`${id}.z1`));
  o.add(Y("joint.slot.y1"), Z("slot.SHELF_TOP.z0"));
  o.add(Y("joint.slot.y0"), Z("slot.SHELF_TOP.z0"));
  o.add(Y("joint.slot.y0"), Z(`${id}.z1`));
  o.add(lit(0), Z(`${id}.z1`));
  return o.points.map(([y, z]) => ({ y: round1(y), z: round1(z) }));
}

/** Shelf plan (x, y), counter-clockwise: the body between the sides' inner faces, a through tongue at each end over the middle third. */
function shelfOutline(id: string, T: Term): Array<{ x: number; y: number }> {
  const o = new Outline(`${id}.pv`, ["x", "y"]);
  const x0 = () => ex({ x: ref("carcass.x0") }, (v) => v.x);
  const x1 = () => ex({ x: ref("carcass.x1") }, (v) => v.x);
  const in0 = () => ex({ x: ref("carcass.x0"), t: T }, (v) => v.x + v.t);
  const in1 = () => ex({ x: ref("carcass.x1"), t: T }, (v) => v.x - v.t);
  const ty0 = () => ex({ y: ref("joint.tongue.y0") }, (v) => v.y);
  const ty1 = () => ex({ y: ref("joint.tongue.y1") }, (v) => v.y);
  const yD = () => ex({ y: ref(`${id}.y1`) }, (v) => v.y);
  o.add(in0(), lit(0)).add(in1(), lit(0)).add(in1(), ty0()).add(x1(), ty0()).add(x1(), ty1()).add(in1(), ty1());
  o.add(in1(), yD()).add(in0(), yD()).add(in0(), ty1()).add(x0(), ty1()).add(x0(), ty0()).add(in0(), ty0());
  return o.points.map(([x, y]) => ({ x: round1(x), y: round1(y) }));
}

function rect(
  id: string,
  name: string,
  category: string,
  profilePlane: Board["profilePlane"],
  thicknessAxis: Board["thicknessAxis"],
  thickness: number,
  f: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number },
): Board {
  return {
    id, name, category, boardType: "panel",
    materialThickness: round1(thickness),
    profilePlane, thicknessAxis,
    x0: round1(f.x0), x1: round1(f.x1), y0: round1(f.y0), y1: round1(f.y1), z0: round1(f.z0), z1: round1(f.z1),
    source: "bedSideTable",
  };
}
