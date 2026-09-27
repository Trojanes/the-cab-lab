/**
 * .cnjob snapshot: red checks refuse the file, B-face coordinates are mirrored
 * in v, lock slots keep their corner radius, an LED T-groove is a groove.
 */
import assert from "node:assert/strict";
import { generateBedroom } from "../bedroom/generator.ts";
import { generateGeneralTall } from "../generalTall/generator.ts";
import { generateKitchenCabinet } from "../kitchen/generator.ts";
import { attachFaces, addFeature, type Board } from "./model.ts";
import { buildCnjob, type CnjobCabinet } from "./cnjob.ts";

const job = (cabinets: CnjobCabinet[], fitIssues: string[] = []) =>
  buildCnjob({ jobId: "job", cabinets, fitIssues });

const wp = (out: ReturnType<typeof job>, id: string) => {
  assert.equal(out.ok, true, out.ok ? "" : out.reasons.join("\n"));
  if (!out.ok) throw new Error("blocked");
  const found = (out.snapshot.workpieces as Array<{ workpieceId: string }>).find((w) => w.workpieceId === id);
  assert.ok(found, id);
  return found as {
    workpieceId: string;
    manufacturing: { machiningFace: string };
    grainDirection?: string;
    edgeBands: unknown[];
    material: { materialId: string; colorName: string; grained: boolean; surfaceMode: string };
    geometry: { outerProfile: { points: [number, number][] } };
    faces: Array<{ faceId: string; machiningPermission: string }>;
    features: Array<{ kind: string; through?: boolean; depthMm?: number; geometry: { center?: number[]; diameterMm?: number; widthMm?: number; centerline?: number[][]; profile?: { points: [number, number][] } }; intent?: { purpose: string } }>;
  };
};

function area(pts: [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i += 1) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/* ---- red checks refuse the whole job; a yellow warning does not ---- */
{
  const over = generateGeneralTall({
    cabinetHeight: 2000, cabinetWidth: 600, cabinetDepth: 584,
    panelThickness: 15, frontPanelThickness: 16,
    topSystem: { style: "style_1", frontRailHeight: 40 },
    bottomSystem: { style: "style_1", frontRailHeight: 53 },
    zones: [{ id: "zone-1", type: "side_door", height: 1400 }],
    doorSeries: "hpl", doorColorName: "Chestnut",
  } as never);
  const blocked = job([{
    id: "cab-1", moduleId: "generalTall", params: { doorSeries: "hpl", doorColorName: "Chestnut" },
    boards: over.boards, errors: over.validation.errors,
    grainIssues: over.grain!.issues.map((i) => i.message),
    millingIssues: over.milling!.issues.map((i) => i.message),
  }]);
  assert.equal(blocked.ok, false);
  if (!blocked.ok) assert.ok(blocked.reasons.some((r) => r.includes("1180")), blocked.reasons.join("\n"));

  const fit = job([{ id: "cab-1", moduleId: "kitchen", boards: [], errors: [] }], ["cab-1 overlaps partition wall-1."]);
  assert.equal(fit.ok, false);

  const body = generateBedroom({
    width: 2275, depth: 756, height: 1788,
    roofProfile: [[0, 1788], [177, 1749], [756, 1150]],
    bootHeight: 398, wardrobeWidth: 330, ohcBottom: 1418,
    doorSeries: "acrylic", doorColorName: "Gloss White",
  });
  assert.ok(body.validation.warnings.length > 0, "the oversize rail is a warning");
  const exported = job([{
    id: "bed", moduleId: "bedroom", params: { doorSeries: "acrylic", doorColorName: "Gloss White", doorSides: "single" },
    boards: body.boards, errors: body.validation.errors,
    grainIssues: body.grain!.issues.map((i) => i.message),
    millingIssues: body.milling!.issues.map((i) => i.message),
  }]);
  assert.equal(exported.ok, true, exported.ok ? "" : exported.reasons.join("\n"));
}

/* ---- bedroom door: cups stay 22.5 from the wall edge and 100 from an end; single-sided colour face cannot be milled ---- */
{
  const body = generateBedroom({
    width: 2275, depth: 756, height: 1788,
    roofProfile: [[0, 1788], [177, 1749], [756, 1150]],
    bootHeight: 398, wardrobeWidth: 330, ohcBottom: 1418,
    doorSeries: "acrylic", doorColorName: "Gloss White",
  });
  const out = job([{
    id: "bed", moduleId: "bedroom", params: body.params as never,
    boards: body.boards, errors: body.validation.errors,
    grainIssues: [], millingIssues: [],
  }]);
  const door = body.boards.find((b) => b.id === "WARD_L_DOOR")!;
  assert.equal(door.milling, "A", "the cups are on the back, which is the milling face");
  const part = wp(out, "bed/WARD_L_DOOR");
  assert.equal(part.manufacturing.machiningFace, "A");
  assert.equal(part.material.materialId, "acrylic-gloss-white-1s-16");
  assert.equal(part.material.grained, false);
  assert.equal(part.grainDirection, undefined);
  assert.deepEqual(part.edgeBands, []);
  assert.equal(part.faces.find((f) => f.faceId === "B")!.machiningPermission, "NOT_ALLOWED");
  assert.ok(area(part.geometry.outerProfile.points) > 0, "outer ring is counter-clockwise");
  const cups = part.features.filter((f) => f.intent?.purpose === "hinge");
  assert.equal(cups.length, 3);
  const pts = part.geometry.outerProfile.points;
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const minY = Math.min(...pts.map((p) => p[1]));
  const maxY = Math.max(...pts.map((p) => p[1]));
  for (const cup of cups) {
    const [x, y] = cup.geometry.center!;
    assert.equal(cup.geometry.diameterMm, 35);
    assert.equal(cup.depthMm, 12);
    assert.ok(Math.abs(Math.min(x - minX, maxX - x) - 22.5) < 0.02, `cup x ${x}`);
    const fromEnd = Math.min(Math.abs(y - minY), Math.abs(maxY - y));
    const mid = Math.abs(y - (minY + maxY) / 2);
    assert.ok(Math.abs(fromEnd - 100) < 0.05 || mid < 0.2, `cup y ${y} from end ${fromEnd} mid ${mid}`);
  }
  const led = body.boards.find((b) => (b.faces ?? []).some((f) => f.features.some((ft) => ft.kind === "tgroove")))!;
  const src = led.faces!.flatMap((f) => f.features).find((f) => f.kind === "tgroove")!;
  const ledPart = wp(out, `bed/${led.id}`);
  const groove = ledPart.features.find((f) => f.intent?.purpose === "led" && f.kind === "groove")!;
  assert.ok(groove, "the T-groove is exported as a groove");
  assert.equal(groove.geometry.widthMm, Math.round(Math.min(Math.abs(src.u1! - src.u0!), Math.abs(src.v1! - src.v0!)) * 1000) / 1000);
  assert.equal(groove.through, false);
  assert.ok(groove.depthMm && groove.depthMm > 0);
}

/* ---- milling from B mirrors v; a lock slot keeps its rounded corners ---- */
{
  const door: Board = {
    id: "DOOR", name: "Door", category: "front", boardType: "front_panel", materialThickness: 16,
    profilePlane: "XZ", thicknessAxis: "Y",
    x0: 0, x1: 400, y0: -16, y1: 0, z0: 0, z1: 600,
    stock: { kind: "door", thickness: 16, sides: 1 },
    milling: "B",
  };
  attachFaces([door]);
  const colour = door.faces!.find((f) => f.id === "A")!;
  colour.visible = true;
  colour.finish = { colour: "Gloss White" };
  addFeature(door, "B", { id: "CUP", kind: "hole", center: [22.5, 100], diameter: 35, depth: 12, for: "hinge" });
  addFeature(door, "B", { id: "LOCK", kind: "cutout", u0: 180, u1: 220, v0: 280, v1: 295.5, radius: 7.75, through: true, for: "lock" });
  const out = job([{
    id: "cab", moduleId: "kitchen", params: { doorSeries: "acrylic", doorColorName: "Gloss White", doorSides: "single" },
    boards: [door], errors: [], grainIssues: [], millingIssues: [],
  }]);
  const part = wp(out, "cab/DOOR");
  assert.equal(part.manufacturing.machiningFace, "A", "B is normalised onto snapshot A");
  const cup = part.features.find((f) => f.intent?.purpose === "hinge")!;
  assert.equal(cup.geometry.center![0], 22.5);
  assert.equal(cup.geometry.center![1], 500, "v 100 on a 600 board mirrors to 500");
  const lock = part.features.find((f) => f.intent?.purpose === "lock")!;
  assert.equal(lock.kind, "throughProfile");
  assert.ok(lock.geometry.profile!.points.length > 4, "the corner radius is tessellated");
  assert.ok(area(lock.geometry.profile!.points) < 0, "an opening is clockwise");
  assert.ok(area(part.geometry.outerProfile.points) > 0);
}

/* ---- HPL grain is X/Y; acrylic is not; two cabinets do not share a workpiece id ---- */
{
  const k = generateKitchenCabinet({
    globalSettings: { length: 887, depth: 270, height: 880 },
    materialThickness: 15, frontThickness: 16, bottomClearanceHeight: 70, bottomClearanceStyle: "style_1",
    columns: [{ id: "c1", width: 887, zones: [{ id: "z1", height: 810, zoneType: "left_door" }] }],
    doorSeries: "hpl", doorColorName: "Chestnut", doorSides: "single",
  } as never);
  assert.equal(k.validation.errors.length, 0, k.validation.errors.join("; "));
  const out = job([
    {
      id: "k1", moduleId: "kitchen", params: { doorSeries: "hpl", doorColorName: "Chestnut", doorSides: "single" },
      boards: k.boards, errors: [], grainIssues: [], millingIssues: [],
    },
    {
      id: "k2", moduleId: "kitchen", params: { doorSeries: "hpl", doorColorName: "Chestnut", doorSides: "single" },
      boards: k.boards, errors: [], grainIssues: [], millingIssues: [],
    },
  ]);
  assert.equal(out.ok, true, out.ok ? "" : out.reasons.join("\n"));
  if (out.ok) {
    const ids = (out.snapshot.workpieces as Array<{ workpieceId: string; material: { materialId: string }; grainDirection?: string }>).map((w) => w.workpieceId);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.some((id) => id.startsWith("k1/")) && ids.some((id) => id.startsWith("k2/")));
    const door = (out.snapshot.workpieces as Array<{ material: { materialId: string; grained: boolean }; grainDirection?: string }>).find((w) => w.material.materialId.startsWith("hpl-"));
    assert.equal(door!.material.grained, true);
    assert.ok(door!.grainDirection === "X" || door!.grainDirection === "Y");
    const carcass = (out.snapshot.workpieces as Array<{ material: { materialId: string; grained: boolean }; grainDirection?: string }>).find((w) => w.material.materialId.startsWith("pvc-"));
    assert.equal(carcass!.material.materialId, "pvc-white-stipple-2s-15");
    assert.equal(carcass!.grainDirection, undefined);
  }
}

{
  const empty = job([{ id: "east", moduleId: "bedroomEast", boards: [], errors: [] }]);
  assert.equal(empty.ok, false);
  if (!empty.ok) assert.deepEqual(empty.reasons, ["Nothing to export."]);
}

console.log("cnjob ok");
