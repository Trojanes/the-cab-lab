# The Cab Lab model — module / board / face

Every piece of furniture The Cab Lab produces is described on three layers.
The layers are what make generator output *mean* something downstream: the
renderer, the bench, nesting, CNC, edge‑banding and labels each read exactly
one of them and never guess.

| Layer | 中文 | One record = | Owned by | Persisted? |
|---|---|---|---|---|
| **Module** | 模块层 | one cabinet: `{ id, moduleId, params, pose }` | `job.json`, `renderer/modules.js` | yes — the only layer in `job.json` |
| **Board** | 板件层 | one piece of stock, one nesting part, one label | generator (`boards[]`) | no — regenerated from the module |
| **Face** | 面层 | one side of a board: A, B or an outline edge E<i> | generator (`board.faces[]`) | no — derived from the board |

Shared types and helpers: `generators/_lib/model.ts`. Both bench generators
(`overheadCabinet`, `smallCabinet`) emit this model; their `types.ts` re‑export
the shared `Board` / `Face` / `Joint`.

Decisions taken 2026‑09‑20:

- **Face ids are geometric.** `A` = the face on the `+thicknessAxis` side
  (`x1` / `y1` / `z1`), `B` = the `−` side. Any board tells you where A is from
  its `thicknessAxis` alone. Use names ("front", "outside") are a `semantic`
  annotation the module adds; algorithms, provenance keys, pins and overrides
  never key on them. The user never needs to see A / B.
- **The outline is the truth.** Anything that changes the cut shape — tongue,
  notch, step, roof cut — lives in the board's outline, recorded point by point
  by `dim()` / `Outline`. Edge faces only *tag* which segments belong to it.
  Anything that does not change the outline — groove, hole, T‑groove, through
  cutout — is a `FaceFeature` on A or B in face‑local 2D. The face layer does
  no geometry: no booleans, no "rectangle + edge features → outline".

## Module (模块层)

Answers: what is this, how big, where, how is it divided.

- `job.cabinets[i] = { id, moduleId, params, pose, hidden? }`. Params **are** the
  envelope (`renderer/modules.js` maps W/D/H and divider handles onto them).
  `hidden` is the role ids the user has turned off in the 3D view. It is saved
  with the job; the boards are still generated and still count for fit and
  overlap. Omit the field when every board is shown.
- Decides which boards exist and their **role ids** (`BP`, `T1`, `D0`, `FP0`,
  `SIDE_L`, `MID_1`). Role ids are stable across parameter changes; pins,
  labels and future user overrides anchor on them.
- Owns the joints between boards and the annotation of faces (`semantic`,
  `visible`, `finish`) from the job catalogue (`finish` / `stock`).
- Result contract (both generators):

```ts
{
  params,                 // resolved
  boards: Board[],        // boardFrame "final"; each carries faces
  joints: Joint[],        // face ↔ face
  features: unknown[],    // flat legacy view of the same features — kept for existing consumers
  validation: { errors, warnings },
  debug: { boardFrame: "final", provenance?, ... }
}
```

## Board (板件层)

Answers: which stock, what outline, where it sits assembled.

```ts
interface Board {
  id: string;                       // role id
  name: string;
  category: string;  role?: string; // role === category (model-layer name)
  boardType: string;
  materialThickness: number;
  stock?: { kind: "carcass" | "partition" | "door"; thickness; colour?; sides?: 1 | 2 }; // door: 1 = single-sided (back = carcass colour), 2 = double
  profilePlane: "XY" | "XZ" | "YZ"; thicknessAxis: "X" | "Y" | "Z";
  x0 x1 y0 y1 z0 z1;                // cabinet frame, final pose
  profileVector? / cutProfileVector?; // the outline as emitted (see below)
  faces?: Face[];
  milling?: "A" | "B";              // the face up on the CNC (_lib/milling.ts)
}
```

**Board‑local frame.** `planeAxes(plane)` gives `(u, v, t)`:
`XY → (x, y, z)`, `XZ → (x, z, y)`, `YZ → (y, z, x)`. Local `(u, v)` is
measured from the board's `u0` / `v0` faces. `localOutline(board)` returns the
outline in this frame from whichever field the generator used:
`cutProfileVector` is already local (a divider's tongue dips to `v < 0`),
`profileVector` in XY / XZ is aligned so its minimum meets the box (as
`renderer/boardGeom.js` draws it), `profileVector` in YZ is cabinet‑local and
is shifted by `y0` / `z0`. Boards without an outline are rectangles.

## Face (面层)

Answers: which way, exposed or not, what colour, what is machined into it, what it meets.

```ts
type FaceId = "A" | "B" | `E${number}`;

interface Face {
  id: FaceId;  key: `${boardId}.${FaceId}`;
  normal: "+X" | "-X" | "+Y" | "-Y" | "+Z" | "-Z" | [nx, ny, nz];  // vector only for slanted edges
  planeKey?: string;      // A / B: provenance key of the plane, e.g. "D0.x1"
  segments?: number[];    // E<i>: outline edge indices (edge i runs pt[i] → pt[i+1])
  edge?: { from: [u, v]; to: [u, v] };
  semantic?: string;      // module annotation: front back top bottom inside outside
  visible?: boolean;      // when the module knows (fronts: B visible, A hidden)
  finish?: { colour?: string; edgeBand?: EdgeBand; grain?: "u" | "v" };  // EdgeBand on E<i> only; absent = not banded. grain: board-local axis of the wood grain on a colour face (_lib/grain.ts)
  features: FaceFeature[];
}

interface FaceFeature {
  id: string;
  kind: "groove" | "tgroove" | "hole" | "cutout"   // on A / B, face-local 2D
      | "tongue" | "notch";                          // tags on E<i>, no geometry of their own
  u0? u1? v0? v1?;  center?: [u, v];  diameter?;  radius?;
  depth?: number;   through?: boolean;
  for?: string;     // the board / hardware it exists for ("D0", "BP", "hinge", "led")
  key?: string;     // provenance prefix: `${key}.x0` … / `${key}.x` `.z` exist in debug.provenance
}
```

- Every board has exactly **A, B and one E per outline edge** (a rectangle →
  E0..E3). `facesOf(board)` derives them; generators only *add* features and
  annotations.
- A and B share one `(u, v)` frame (the board‑local frame). A through feature
  reads the same from either side; CNC flips the board, not the numbers. A
  through feature is listed once, on the board's **milling face**.
- **Milling face** (`board.milling`, `generators/_lib/milling.ts`): the CNC cuts
  from above only, so all partial-depth work (groove, T-groove, blind hole, pocket,
  a rebate in stacked slabs) is on one big face. Single-sided door stock is milled
  from the back (the colour face lies on the table); double-sided / carcass stock
  from the face that carries the work, else its inside / back face. Work on both
  faces, or on a single-sided colour face, is a milling issue (`result.milling.issues`:
  red in 3D, listed in the checks). An export milling from B mirrors one in-plane axis.
- Edge normals are outward normals of the outline; `boundaryEdgeFaces(b, "-Y")`
  returns the edges on the outline's front boundary (not a tongue side or a
  step that happens to face the same way).

### Edge banding

Stored on the edge face, not in a second coordinate system. `E<i>.finish.edgeBand`
is `{ thickness, colour? }` (millimetres, catalogue colour name). No `edgeBand`
on that face means the edge is not banded. A and B never carry one. Which
edges get a band is decided later; `setEdgeBand(board, i, band | null)` only writes.

Export is `edgeBandPart(board)` (`generators/_lib/edgeBand.ts`). Web, mobile
and the app read this record and nothing else:

```ts
interface EdgeBandPart {
  id: string;
  axes: { u: "X" | "Y" | "Z"; v: "X" | "Y" | "Z" };  // XY → u=X v=Y; XZ → u=X v=Z; YZ → u=Y v=Z
  outline: [u, v][];   // board-local mm from (u0, v0); same order as localOutline / the SVG path
  edgeBand: { i: number; t: number; colour?: string }[];  // sparse; edge i is outline[i] → outline[(i+1) % n]
}
```

The outline is the whole cut, tongues and notches included. A segment that is
not in `edgeBand` is cut and not banded. Screen Y-down is applied when drawing,
not stored. Pose is not in the record.

### Where each overhead feature lives

| Feature | Face | Kind |
|---|---|---|
| divider groove `BG_D<i>` | `BP.A` | groove, `for: D<i>`, key `BP.feat.BG_D<i>` |
| rangehood cutout | `BP.A` | cutout, through, key `BP.feat.RGHD_CUTOUT` |
| divider tongue | `D<i>.E*` below `v = 0` | tongue tag `for: BP` (or `RGHD_TOP`) |
| divider front step (T3 seat) | `D<i>.E*` | notch tag `D<i>_T3_STEP` |
| divider rear notch (T4) | `D<i>.E*` | notch tag `D<i>_T4_NOTCH` |
| rangehood side grooves | `D<i>.A` (+X) / `.B` (−X) | groove |
| screw pilots `T2SH_D<i>` `T3SH_D<i>` `T4SH_D<i>` | `T2.A` `T3.A` `T4.A` | hole, key `<T>.feat.<id>` |
| LED T‑groove | `T3.A` | tgroove ×3, keys `T3.feat.LED_MAIN` / `LED_BRANCH_<n>` |
| hinge cups | `FP<i>.A` (back, +Y) | hole, key `FP<i>.feat.HINGE_<n>` |
| internal divider grooves | `RGHD_TOP.A` | groove |

Small cabinet: side grooves on `SIDE_L.A` / `SIDE_R.B` (inside faces), tongue
tags on `TOP` / `BOTTOM` / `MID_<i>` / `BACK` edges, door lock slot on
`FP_<i>.B` (room side, through, `radius`).

## Joints

```ts
interface Joint { id; kind: "butt" | "tongue_groove" | "face_contact"; a: FaceRef; b: FaceRef; hardware?; rule? }
interface FaceRef { board: string; faces: FaceId[] }
```

Overhead joints are the `relationshipDeclarations` resolved to faces
(`BP.A ↔ D0 body‑bottom edges`, `D0 front edge ↔ FP0.A`, `T1.A ↔ T2.B`);
small‑cabinet joints are one per tongue (`SIDE_L.A ↔ MID_1 left‑tongue edges`).
`relationshipDeclarations` stays on the result unchanged for the bench's joint view.

## Provenance and pins

- Face planes reuse the box keys (`D0.x1`). Face features record under
  `<board>.feat.<featureId>.<field>` (existing grooves / hinges unchanged; screw
  holes, LED and rangehood cutout gained records in `faces.ts`).
- `presets.json` pins face features as
  `pins.faceFeatures["<board>.<face>.<featureId>"] = { u0, u1, v0, v1, cx, cy, diameter, depth, radius }`.
  `collectPins` / `checkPins` / `pinsForBoard` handle them; tags carry no numbers
  and are not pinned (their outline points already are).

## What reads which layer

| Consumer | Reads |
|---|---|
| main window (`cabinets3d.js`) | boards → boxes / extruded outlines. A board with a colour face is painted all over with that swatch (`doorFinish.js`, flat, no environment reflection) so the face and the edge match; other boards by `category`. Carcass is White Stipple |
| bench L2 | boards, `faces` (Faces section), joints |
| bench L3 (`board2d.js`) | `faces` A / B features as rectangles and hole points; falls back to the flat `features` list when a result has no faces |
| nesting | boards: `stock`, `localOutline`, grain |
| CNC | faces: A / B features, face‑local |
| edge‑banding | `edgeBandPart(board)`: outline + sparse `edgeBand[]`, stored on `E<i>.finish.edgeBand` |
| labels | module → board path |

## Rules for changes

- `job.json` keeps only the module layer. Board / face layers are always
  regenerated. User overrides on a face (planned) go to
  `cabinet.overrides.boards[roleId].faces[faceId]` and are re‑applied by id.
- Never move a point from the face layer. If a face needs a different number,
  change the param, the rule or the outline formula, then regenerate.
- Adding a feature: decide "does it change the outline?" — yes → outline +
  `tagEdges`; no → `addFeature` on A / B with a `dim()` record and a pin.
- New generators: build boards, call `attachFaces(boards)`, add features /
  joints in a `faces.ts`, pin a golden preset, assert in the generator test.
