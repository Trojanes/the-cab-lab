# The Cab Lab

Cabinet CAD workspace. Metric (mm), Z up, right-handed. Electron + Three.js.

Workflow: **step 1 define the space** (Box, or Vehicle = box rear + side-profile nose; Floor plan later) → pick a **module** on the left → drag its **box** on the floor.
The box *is* the generator's outer size. Pull its faces to change W / D / H, drag the orange bars to move
zone boundaries, edit details in the right panel. Boards are always regenerated from `job.json`, never edited.

Current state: Small cabinet and Overhead cabinet wired end to end (place, move, rotate, resize, zones, checks, board table, save / load, undo).
Partition walls (18 / 24 mm Partition stock, floor to roof) are drawn in the **Floor plan** sheet over the 3D view and block cabinets.
Bedroom (the vehicle's nose slab, for now one solid volume) is wired with its own placement flow. Other modules are
listed but not wired yet.

## Run

First time (installs deps, repairs the Electron binary if needed, creates `The Cab Lab.exe` and a desktop shortcut):

```
TheCabLab.bat
```

After that, use the **The Cab Lab** desktop shortcut, or:

```
npm start
```

`npm start` also rebuilds `renderer/gen/*.js` from `generators/`. The bundles are committed so the
desktop shortcut works without a build step; run `npm run build:generators` after changing a generator.

## Layout

- `main.js` — Electron window, open / save dialogs, DXF open, `settings.json` read / atomic write (IPC)
- `preload.js` — exposes `window.cablab.openJob / saveJob / openDxf / readSettings / writeSettings`
- `renderer/space.js` — scene, camera, grid, axes, room (walls and roof follow the resolved profile), picking helpers
- `renderer/job.js` — `job.json` in memory, undo / redo snapshots, generator result cache; `finish` + `stock` are the job cabinet catalogue
- `renderer/materials.js` — carcass/partition colour (White Stipple), door card (Acrylic / HPL, one or two colours), board stocks (carcass 15 / partition 18 / door 16); new cabinets copy these into params
- `renderer/spaces.js` — space kinds (`box`, `vehicle`) → floor polygon, roof profile, height, obstacles; `clearHeightAt`; fit tests
- `renderer/dxf.js` — minimal DXF reader (LINE / LWPOLYLINE / POLYLINE / ARC / SPLINE → chained points) for the vehicle nose
- `renderer/settings.js` — user defaults persisted in `<userData>/settings.json` (loaded before the space dialog opens)
- `renderer/spaceDialog.js` — "Define the space" modal (step 1, also Edit space): kinds, fields, nose preview, points table, DXF import, cabinet colours + board stocks, Set current as default
- `renderer/modules.js` — module registry: generator bundle + envelope (W / D / H) + divider handles; `placement: "nose"`
  modules add `withSpace` (bind width / height / roof profile to the space), `envelopeProfile`, `handles`, `roofAware`
- `renderer/cabinets3d.js` — draws boards, envelope, handles from generator output
- `renderer/walls.js` — partition walls (`job.walls`): record → footprint / roof-cut outline for the current Partition stock + clearances; legality (inside the space, overlaps, rests on a wall)
- `renderer/walls3d.js` — draws the walls in 3D (select + Delete only); `solidBoxes()` = every solid (cabinets + walls) for clamping
- `renderer/features2d.js` — the plan's feature edges (space walls, partition faces / ends, cabinet sides — split where solids meet) and feature points
- `renderer/floorplan.js` — the **Floor plan** sheet over the 3D view where walls are drawn (two ways, see below)
- `renderer/snap.js` — feature points (space + cabinet corners), face planes for alignment, edge / height inference
- `renderer/interact.js` — left-button interaction: three-step placement, Move command, type-ins, select, resize, dividers, keys
- `renderer/presets.js` — per-module starting sizes (preset H today; a settings UI will edit them)
- `renderer/hud.js` — cursor tooltip
- `renderer/panel.js` — right panel (space or selected cabinet, plus the selected board / face read-out) and drawer tables
- `renderer/tree.js` — the **browser** floating over the 3D view (top left, see-through): module → board → face over the generator result (`docs/model-spec.md`); stores nothing
- `renderer/boardModel.js` — read-only helpers over boards / faces (labels, feature summaries, which face a 3D hit landed on)
- `renderer/ui.js` — shell wiring
- `renderer/boardGeom.js` — board solids from generator output (outline extrusion or box); shared by the app and the bench
- `renderer/benchMenu.js` — right-click on a rail module / placed cabinet → opens the generator bench
- `renderer/bench/` — the generator bench window (see below)
- `generators/` — cabinet generators (TypeScript).
- `generators/_lib/dim.ts` — `dim()` provenance: every board face / outline point records its formula and named terms
- `generators/_lib/pins.ts` — pins: expected values per preset, checked by the generator tests
- `generators/<module>/rules.json` + `rules.ts` — rule constants (data + typed wrapper); `presets.json` — golden presets + pins
- `renderer/gen/` — generated ESM bundles of `generators/*/generator.ts` (do not edit)
- `build-generators.js` — esbuild script producing `renderer/gen` (`node build-generators.js <name>` builds one)
- `scripts/pin-presets.ts` — check or re-seed a module's pins from the current output
- `ensure-electron.js` — repairs a missing `electron.exe`
- `create-desktop-shortcut.ps1` — builds `The Cab Lab.exe` + desktop shortcut (`npm run shortcut`)
- `.cursor/rules/cab-lab-core.mdc` — project contract

## Controls

- Hold wheel: orbit · right-drag: pan · scroll: zoom
- Placing, three steps (SketchUp-style): pick a module → hover shows the face under the cursor (floor, ceiling, any
  wall, any face of a cabinet; blue sheet) → click a corner or grid point on it → draw a flat, zero-thickness rectangle
  on that face and click the opposite corner (a corner is shared by up to three faces: drag onto the floor, a side
  wall, or the other wall — the face is not locked until the second click) → pull the rectangle off the face, one way only (away from the wall / floor / cabinet —
  it can't be pulled into them) and click. Side walls are only selectable from the **room inside**; the wall facing the
  camera is ignored until you orbit to its inner face (a corner clicked earlier
  still keeps that wall as a candidate). Floor and ceiling stay pickable from either side. A cabinet top
  flush with the ceiling counts as the ceiling (pull down into the room). A cabinet
  face flush with a wall (no room outward) pulls into the room on that same plane;
  an empty side wall is still not selectable from outside. Only the two in-plane sizes are typed in
  step 2; `Enter` creates with the preset size along the face normal (H on floors, D on front/back walls, W on side
  walls). Boxes are axis-aligned. The door side is chosen when the box is created: never against a wall or a
  neighbour (a blocked side puts the doors opposite); otherwise the long horizontal edge is the door edge, facing the
  middle of the room (ties: front). W is always the edge along the doors, D the edge through them (fronts included in the
  box), H the height — so a box drawn on a side wall becomes a cabinet whose W runs along that wall. After creating you stay armed;
  `Shift+click` repeats the last size at a new corner; typing digits re-sizes the box you just made. `Esc` restarts /
  stops.
- Space dialog: Front / Right / Back / Left wall checkboxes (all on by default). Below the space fields:
  **Cabinets** — carcass / partition colour is **White Stipple**; doors are **Acrylic** or **HPL** (one or two
  colours from that series). Board stocks default to **Carcass 15 mm**, **Partition 18 mm**, **Door 16 mm**.
  **Partition floor / ceiling clearance** (default 2 / 2 mm) is the room left for packers under and over a
  partition wall. These live on the job (`finish` / `stock`), not on the space. New cabinets copy White Stipple
  onto the box, door colour A onto the fronts, and the matching thicknesses. Which modules use door colour B is
  set later. **Set current as default** (in the Cabinets block) saves the catalogue to `settings.json` for new jobs.
- **Floor plan / partition walls** (button at the top right of the 3D view; `Esc` closes): a 2D sheet slides
  over the 3D view — same job, so the 3D underneath already shows every wall when the sheet is closed. Walls come
  first, cabinets after: a partition is a solid for placement, Move, resize handles and the door-side rule, and
  its faces / corners are snap features. A wall is `job.walls[] = { id, axis, at, u0, u1, side }`: `axis` its
  normal (`y` = across the van), `at` the **reference face** the offset was measured to, `side` the way the
  thickness grows, `u0..u1` its span. Thickness and height are never stored — thickness = Partition stock, bottom =
  floor + floor clearance, top = roof − ceiling clearance (a wall along the van follows the nose) — so a catalogue
  change moves every wall. Everything is drawn from **features**: a feature edge is a wall of the space, a face or
  end of a partition, or a side of a cabinet, split wherever another solid touches it (the back wall with two
  partitions against it is three edges); feature points are their ends. One tool, **Wall** (`W`), armed when the
  sheet opens: click the first point on a line (a feature point, a point **in line** with another partition —
  dashed guide — or 10 mm along it) → click the second point on the **same** line (`Enter` = the far end, i.e. the
  whole span) → pull the wall out to **either side** and click or `Enter` (`Offset` = the clear distance to the
  near face; the thickness grows away). A partition is picked as a **body**, not a face: its two faces are one
  line, and the offset is measured from whichever face the cursor is on (pull toward the nose → from the nose
  face). Alignment is **centre line to centre line**: a wall **end** in line with another partition is picked on
  that partition's centre line, and the **offset** in line with a parallel partition puts the new centre on its
  centre (same stock, so the faces coincide). Centre lines are **references only** — **no physical overlap,
  ever**: at the offset step the board is trimmed back onto the **face** of any partition an end was drawn into
  (`stops on wall-1's face (−9)` in the tip; `trimmed` in the log), so a wall that meets another one **rests on
  its face**, never inside it. A **junction** — a partition standing on the line you are drawing from — is **one
  point** on that partition's centre line (not two, 900 and 918): both segments of the line stay live, and the
  direction you pull the second point decides which side of the partition the new wall goes. Next to a partition
  its own face corners yield to its centre line. A cabinet has no centre line: its sides are the alignment. At the second point and at
  the offset, **`Tab`** (or a digit) opens
  the type-in with the live value selected, AutoCAD-style: type `L` / `Offset`, `Enter` or a left-click confirms.
  **Right-click cancels**: the wall in progress goes back to the first point; right-click again leaves the tool
  (`Esc` does the same; a third `Esc` closes the sheet). The preview turns red and cannot be dropped when it
  overlaps a wall or cabinet, leaves the space, or would rest on nothing at either end (a free-standing wall is not
  allowed; one end on the space or on another partition is enough). Pulling past the opposite wall stops there.
  After a drop the tool stays armed — the new wall's faces are the next edges to draw from. Wheel zooms, middle /
  right-**drag** pans, `F` fits. In 3D a wall can only be selected (right panel: length, faces, what it rests on,
  stock, checks) and deleted; drawing and re-drawing happen in the plan.
- **Shower door** (`D` in the floor plan): a rectangular hole in the middle of a partition — not to the floor, not
  to the roof. Click the **end** of the partition to measure from → move along the wall to the door's first edge
  (`Tab` / digits: distance from that end) → pull to the other edge (`Tab` / digits: `W`, no default) → a card asks
  the **bottom / top clearance** (default 100 / 100, the last input is remembered; `top` 0 is allowed) → `Enter` /
  Create cuts the hole; `Esc` / right-click cancels. Stored on the wall as `openings[] = { id, type: "showerDoor",
  from: lo|hi, offset, width, bottom, top }` — measured from the end you picked, so the door follows that end;
  hole bottom = floor + bottom, hole top = wall top − top (under the nose, the lowest roof over the door). The wall
  is drawn as a board in the plane of its face with the hole cut out (`prismXZ` / `prismYZ` with holes). Refused
  when it leaves the wall, overlaps another door, is under 50 wide / high, or another partition meets the wall
  inside it. In the plan the wall is cut over the door (jamb lines, dashed door line); click the door to select it,
  Delete removes just the door; the right panel lists the wall's doors with editable offset / width / clearances.
  Checks warn when a cabinet stands within 600 mm (`DOOR_CLEAR_DEPTH`) in front of or behind a door. Door jambs are
  snap features for cabinets.
- **Sliding door** (`S` in the floor plan): the same tool with one more click and two boards. The hole always goes
  **to the floor** (`bottom` is 0 and not asked); `top` (default 100) is the clearance under the wall top. Click the
  **end** of the partition → the opening's first edge → its other edge (`Tab` / digits as for the shower door) →
  **move to the side of the wall the door hangs on** — the leaf and the pelmet preview follow the cursor (front /
  back for a wall across the van, left / right for one along it), red with the reason when that side does not work
  — click → a card asks **Top** (100), **Leaf wider by** (40) and **Leaf height** (1880) → `Enter` / Create. Stored
  as `openings[] = { type: "slidingDoor", from, offset, width, top, side: ±1, overlap, doorHeight }`; the two boards
  are **derived** from it in `walls.js` (`openingParts`) and never stored, both from the **Partition** stock (`t`):
  the **leaf** is `width + overlap` wide centred on the hole, `doorHeight` high standing 15 above the floor, its
  near face **20 clear** of the wall face on `side`, drawn closed; the **pelmet** (track cover) is `top` high with
  its top on the wall's top line (roof − ceiling clearance, following the nose under a wall along the van) so its
  underside is level with the hole top, **20 clear** of the leaf (i.e. 40 + t off the wall), and runs along the
  wall's direction **until the space or another partition stops it** on that side — the full van width when nothing
  is in the way, shorter when a partition stands behind. The leaf runs up **behind** the pelmet — the pelmet is
  meant to reach down over the leaf top and hide the track (defaults: 15 + 1880 = 1895 leaf top vs. a 1963 wall top
  − 100 = 1863 pelmet underside → 32 mm of cover); when it does not reach, the door is still created with a yellow
  warning (`pelmet stops N above the leaf top`) and the panel shows **Covers the leaf top by**. Refused when the leaf
  runs into the ceiling, runs past what stops the pelmet, has **no room to slide open** (the pelmet must reach
  the hole width minus 100 mm beyond the leaf on one side — the open leaf may stick out 100 mm past the pelmet), or the leaf / pelmet hits a cabinet or another partition; a new partition drawn across a pelmet is
  fine (the pelmet just stops there), across a leaf is an overlap. The right panel lists the door with offset /
  width / top / overlap / leaf height, **Flip** to hang it on the other face, and the derived leaf and pelmet sizes
  with what stops the pelmet. Leaf and pelmet are solids for cabinet placement (boxes stop at them) and their
  corners are snap points.
- **Vehicle space**: width is constant; the rear is a box (Width × Rear depth × Height) and the nose is a side view
  (Y along the van from the nose tip at `Y = 0`, Z up) grafted onto its front. The nose comes either from **Points**
  (a table of feature points joined by straight lines — the built-in default is `(0,0) (0,737) (345,1515) (579,1758)
  (1520,1965) (1520,0)`) or from a **DXF** side view (LINE / POLYLINE / ARC / SPLINE, longest chain, `$INSUNITS`
  respected). The roof at any Y is the highest point of the drawing there, so an open upper edge or a closed outline
  both work. The nose's rearmost edge (the seam) is scaled uniformly to Height; the preview shows the seam in blue when
  it already matches and in orange with the scale factor when it does not. Boxes stop at the sloped roof
  (`H stopped at roof`), the flat rear ceiling stays pickable, the sloped roof is not a working plane yet.
  **Set current as default** saves the whole Vehicle form to `settings.json` immediately (atomic write, survives a
  restart, outside the repo); new Vehicle spaces start from it. **Reset to built-in** removes it. The **Side** view
  looks across the van so the profile reads as drawn.
- **Overhead** (OHC, `generators/overheadCabinet/generator.ts`): hangs from the ceiling with its back on a wall. The
  anchor can only be a feature point on a **ceiling ∩ wall line** (a top corner of the room, an overhead's top-back
  corner, a plane ∩ ceiling corner); other points are refused with a hint. **W runs along that wall**, the doors face
  the room, the top stays on the ceiling (the box only grows down). Three faces take the 2D rectangle: the ceiling
  (W×D, pull H down), the wall itself (W×H, pull D into the room) or a face perpendicular to the wall — a neighbour's
  side, or the adjacent wall at a corner (D×H, pull W). At a corner both walls qualify; the box decides at the end:
  W follows the wall its longer horizontal edge runs along. The type-in labels switch to module terms as soon as the
  wall is known (on the left wall the X field reads `D`). The box is the whole solid — carcass, the 40 mm top
  structure and the door thickness (box depth = `cabinetDepth + door`, exactly like Small); the doors hang 30 mm below
  it by design. Every non-door board is carcass stock, the doors are door stock. **Face and `R` are refused** (one
  possible door side), Move slides it along the ceiling only (ΔZ is 0), the H handle sits on the bottom and pulls it
  down. Selecting an overhead turns the right panel into its **editor page** (wide): a **zone strip** left → right
  (drag a boundary in 10 mm steps, `Shift` = 1 mm; click a zone, `Ctrl+click` adds to the selection; **Add / Delete /
  Average selected**; widths and running positions underneath), the generator's **2D front view** (selected zone
  outlined), a card for the selected zone (type Up flap / Fixed panel / Open, width — the neighbour absorbs the
  difference) and the cabinet-level fields folded below (outer size incl. doors, bottom height, stock). Zones are
  never narrower than 150 mm and always sum to W. Every editor action is one undo step. The orange vertical bars in
  3D are the same boundaries. Boards are emitted in their final assembled pose (fronts at local −Y, top at H).
- **Bedroom** is a rail group: hovering it opens a flyout with **Body** (the nose slab below), **Bed Box** (below) and
  **Bed Side Table** (listed, not wired yet). Groups are declared in `MODULE_GROUPS` in `renderer/modules.js`.
- **Bedroom › Bed Box** (one per vehicle, needs the Body first — the flyout item is disabled until it exists): the bed
  base as **twelve boards**, standing in the Body's mattress opening and running into the room: glued to the Body's
  room-side face, centred on the van, **width = the Body's bed frame (queen 1508), height = the Body's tunnel boot
  height** — both read from the Body, never typed or dragged here. Only the length is its own (default 979, a rule;
  set by hand until mattress presets exist). One step: the box stands on the Body face and its room-side face follows
  the cursor into the room (snaps to cabinet faces, stops at the back wall and at cabinets in its lane), type `D`,
  click or `Enter` creates, `Esc` cancels. Picking Bed Box again selects the existing one and re-runs the length step
  (nothing is duplicated). It follows the Body: change the Body's boot height or bed frame, its depth, redefine the
  space or edit D in the panel and `attach()` re-reads W / H, re-centres it and keeps it against the Body face
  (`bindToJob` in `job.js`); the Body's depth drag ignores cabinets attached to it.
  Boards (all bed-box stock, 18 — `generators/bedBox/rules.json`): `SIDE_L` / `SIDE_R` (room end → Body face),
  `END` (over the side panel ends, 1 mm wider each side for edge banding), `DIVIDER` (centred, notched 19 deep ×
  85 high at both ends top and bottom), `RAIL_L/R_LOW/HIGH` (long rails against the sides, 100 high, on the floor
  and flush with the top, butting the short rails) and `RAIL_END/BODY_LOW/HIGH` (short rails across the box at the
  end panel and 1 mm off the Body face, notched 20 × 20 in the middle — a **half-lap** with the divider). No bottom,
  no top, no board on the Body face (the boot's upright is there). Every face and outline point goes through
  `dim()`; joints: 4 half-laps, 11 butts, 6 face contacts. Pins: `generators/bedBox/presets.json` (`style3-queen`),
  test `generators/bedBox/generator.test.ts`. Generator `generators/bedBox/generator.ts`.
- **Bedroom › Body** (the nose body, one per vehicle — the north-south bedroom): not a free box. Its front is the nose
  cross-section, its width the van's inside width, its height the roof at the room-side face; the only free size is the
  depth **from the front**. Pick the module → the body is already shown at the preset depth (756). Click anywhere → the
  room-side face follows the cursor along the van (snaps to roof breaks, the seam and cabinet faces; stops at the back
  wall and at other cabinets), the single **From front** type-in takes numbers and expressions; click again or `Enter`
  creates it, `Esc` cancels; `Enter` straight away takes the preset. Picking the module again selects the existing body
  and re-enters the same depth drag (nothing is duplicated). The body is posed `rotZ 180` at the nose so the room-side
  face is its front; local Y runs from the room face toward the nose and the roof profile over it is bound into its
  params (`roofProfile`) on create, on every edit and whenever the space is redefined.
  Inside that envelope the body is **laid out in five regions** by three numbers and a choice — **tunnel boot
  height** (the boot deck, wall to wall), **wardrobe width** (side wall → inner face, the same both sides: symmetric
  by rule), **overhead bottom**, and the **bed frame** (queen = 1508, a product size: the opening between the
  wardrobes must take it, so the wardrobes stop at `(W − 1508) / 2`): `boot` · `wardrobe L / R`
  (boot deck → roof, cut to the roof profile) · the **mattress opening** between them (a void — not a part, just what
  the deck, the wardrobe faces and the overhead underside leave free) · `ohc` above it (to the roof). The **tunnel
  boot is boards**: `BOOT_DECK` (18 mm rule stock, wall to wall × full depth, top at the boot height) resting on two
  carcass-stock uprights, `BOOT_BACK` (outer face on the room face) and `BOOT_FRONT` (outer face at the nose end) —
  butt joints, faces annotated, every face through `dim()`. The **wardrobes have their colour panel and top**:
  `WARD_L/R_PANEL` (door stock, colour face into the opening, boot deck → roof) is cut down to the **T3 seat** in
  front of the **T2 back** (`WARDROBE_T2_BACK_MM` 66 — the one fixed Y of the top) and has a pocket behind it for T3's
  tail; the seat is `roof(66) − T2 height (35) − 1 − T3 (15)`, so a steeper or flatter roof moves the whole top and T2
  stays 35 high at its back. `WARD_L/R_T3` (188 deep) sits on the seat, over the panel for its 77 mm tail and notched
  back to the panel's wall side beyond it; `T2` and `T1` run wall to wall on the T3s (+1) — T2 to the roof at its
  back, **T1 20 mm above the roof by design** (flat top for the three-axis router, trimmed on site; reported as a
  warning). The other regions (opening, overhead) are still drawn as blocks from their own roof-cut section
  (`zones[].outlineYZ`); a region that lists `boards` is drawn as those boards. Selecting the body turns the
  right panel into its **editor page** (wide): the generator's **2D front elevation** from the room — click a region to
  select it (a second click in 3D does the same, `Esc` climbs back), **drag an orange boundary** (boot deck, wardrobe
  inner faces, overhead underside; 10 mm steps, `Shift` = 1 mm; one undo step per drag) — the three
  **Layout** fields with the range the other values leave each one, the bed frame select, the derived opening /
  overhead / bed-margin numbers,
  a card for the selected region and the body-level fields folded below. The same boundaries are the orange bars in
  3D on the room face (spanning only their region). Limits and defaults are rules (`generators/bedroom/rules.json`:
  Style 3 = boot 398, wardrobes 330, overhead from 1418, queen frame 1508; minimum opening height 500); every
  region face goes through `dim()`, so the bench can show `wardrobeR.x0 = W − wardrobeWidth`. Pins:
  `generators/bedroom/presets.json` (`style3`, `flat-roof`), test `generators/bedroom/generator.test.ts`.
  Generator: `generators/bedroom/generator.ts`.
- Type-ins: `Tab` or a digit opens W / D / H. Values may be `1110`, `+50`, `-20`, `*2`, `/2`, `max`, or `1110,560,720`
  (comma fills the next fields). Plain numbers apply live; expressions apply on `Tab` / `Enter`.
- Inference: after touching a corner, moving along one of its edges pins that coordinate (dashed axis-coloured line),
  rest on a point of the line for ~0.4 s ("Point kept for the next edge") and a third edge can start from it ·
  vertical faces of walls and cabinets act as guide lines
  ("Flush with cab-1 side", orange dashes) · the extrude step snaps to faces and corners along the normal · hold `Shift` to keep
  the current line. The cursor tooltip always says which rule is active and which dimension was stopped by a wall.
- The box never leaves the space or enters another cabinet: rectangle and extrusion stop at walls and at existing boxes
  (outline turns orange, tooltip names what stopped it, e.g. `H stopped at cab-2`); Move and resize handles stop at the boundary
- Command bar (the icon row under the file bar): **Move** (four-way arrow, `M`), **Face** (cube with a facing side, `O`), **Plane** (two parallels, `P`). Hover for the name.
- Plane (`P` or the Plane icon): click a wall or cabinet face, pull a parallel plane into the room (type Offset), click or `Enter` to leave it. What you see is the plane ∩ the space (including the roof). Its corners become snap points, so a box can start off a wall without starting from a space corner. Planes are stored in `job.planes` and do not follow the source face. Delete removes the selected plane.
- Move (`M` or the Move icon): click a grab point, then a target point; `Tab` types ΔX / ΔY / ΔZ; `Ctrl+click` copies.
  There is no drag-to-move.
- Face (`O` or the Face icon): click a side of a cabinet and its doors move to that side. **The box never moves**:
  W and D swap so the envelope stays exactly where it is (the side goes orange as a preview); click another side to
  change, click elsewhere or `Enter` to confirm (the side flashes green), `Esc` puts it back. Tops and bottoms are never
  door sides, nor is a side flush against a wall or a neighbour, nor one that would leave W or D below the module minimum.
  `R` still rotates the whole cabinet 90° about its centre (that does change the footprint).
  Fronts are drawn light blue, carcass tan, so the door side of every cabinet is visible at a glance.
- Blue cubes: pull W / D / H · orange bars: zone boundaries (horizontal for stacked zones, vertical for zones along W).
  Handles hide while a board / face is selected inside the cabinet. A dimension that is normally typed (the Bed Box
  length) has a ⇕ button next to its field: press it and a blue double arrow appears just outside that face in 3D —
  drag it back and forth; `Esc`, a selection change or pressing ⇕ again removes it.
- **Browser** (floats over the top left of the 3D view, see-through; the small caret folds it): Space → every placed cabinet (plus partitions and planes) → its boards
  (`name · role id · L × W × T`) → its faces (the module's word for them — inside, front, bottom — with what is machined
  into each, and the outline edges folded into one row with their tongue / notch tags). Click a row to select it, the
  caret expands. In 3D the same path is one click per level: cabinet → a board of the selected cabinet → the face under
  the cursor; `Esc` climbs back up. A selected board lights up and its neighbours fade; a selected face gets a yellow
  sheet. The cabinet stays the selected object throughout (Move / Face / `Del` act on it), the right panel adds a
  read-only **Board** / **Face** card, and the drawer's Boards rows select the same way. Nothing in the tree is stored:
  it is a browser over the generator result, re-read after every change.
- `M` move · `O` face · `R` rotate 90° · `F` frame selection (or space) · `Del` remove (cabinet, plane or partition wall) · `Esc` cancel / deselect
- `Ctrl+N/O/S` new / open / save (`Ctrl+Shift+S` save as) · `Ctrl+Z/Y` undo / redo · `F12` dev tools
- `Ctrl+Shift+L` open the usage log folder

## Generator bench

A second window for the people who write generators (`docs/bench-spec.md`). Right-click a module on the rail →
**Generator rules…**, or right-click a placed cabinet → **Open in bench with these params**; `CABLAB_BENCH=1 npm start`
opens it at launch. One tab per generator + preset; `+` opens another generator.

- **L2 · assembly**: the generator's boards in 3D with the app's camera (wheel-drag orbit, right-drag pan). Click a board
  for its six faces, a small sphere for an outline / corner / hinge point, a joint dot for a declared contact. Every value
  shows `value = formula` and its named terms — <span>param</span> (what the preset gave), **rule** (from `rules.json`,
  with its doc), *ref* (another recorded quantity; click to follow) or a local value. Toolbar: views, explode, frame,
  `⋯` (opacity, X/Y/Z section, what is drawn). Bottom: **Boards** and one **Audit** list (errors, warnings, declared
  joints vs measured AABB gap, undeclared plate overlaps, pin diffs — worst first); the status bar shows the counts.
  `[` / `]` hide the parameter pane / the bottom drawer; parameters are folded behind a size summary (presets are the
  usual entry point). **Preset ▾** holds save / save-as / pin all / reports folder.
- **L3 · board**: right-click a board → **Edit board…**: the board flattened in its profile plane, every point labelled,
  board-local / cabinet frames, the dependency tree of each coordinate, and a *Try a formula* box that re-evaluates one
  value with the same terms (dashed marker; nothing else moves until the code changes).
- **Rules**: the left pane lists `rules.json` (● = used in this run). Change a value → say why → the bench writes the
  file, logs `bench.rule.set` (old, new, reason, affected keys), rebuilds the bundle and reloads.
- **Pins**: *Pin board* / *Pin all* write the current numbers into the preset; `generator.test.ts` asserts them
  (`node --experimental-strip-types generators/overheadCabinet/generator.test.ts`). Pinned = protected.
- **Report…**: writes `logs/bench/<time>-<module>.md` with the selection, its provenance chain, the tried formula and
  your note; the agent reads it instead of a verbal description.
- **Faces**: every board is module → board → face (`docs/model-spec.md`). The board panel lists **Faces of &lt;id&gt;**:
  `A` (+thickness side) and `B` (− side) with their colour and what is machined into them (grooves, holes, LED, lock
  slots), plus the outline edges `E<i>` tagged as tongue / notch. L3 draws the A / B features on the flattened board.
  Face features are pinned too (`pins.faceFeatures`).

A generator joins the bench when it uses `dim()` for its faces and
points and ships a `presets.json` (`boardFrame: "final"`, boards only). `CABLAB_BENCH_SNAP=<file.png>` screenshots the bench and quits (for checks).

## Usage log

Every action and every system decision is appended to `logs/usage.jsonl` (git-ignored), one JSON object per line: module armed, anchor point, the last 60 cursor resolutions of a placement (feature / inference / plane, with the world point), typed dimensions, final box, handle drags (envelope before → after), panel edits, space definition, file operations, undo/redo, generator validation errors and uncaught errors (which also write `logs/crash-<time>.json` with the whole job). `logs/latest.json` holds the last action and last error. When something goes wrong, the log is what to read first — see `.cursor/rules/cab-lab-usage-log.mdc`.
