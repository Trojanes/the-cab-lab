# The Cab Lab

Cabinet CAD workspace. Metric (mm), Z up, right-handed. Electron + Three.js.

Workflow: **step 1 define the space** (Box today; Vehicle and Floor plan kinds later) → pick a **module** on the left → drag its **box** on the floor.
The box *is* the generator's outer size. Pull its faces to change W / D / H, drag the orange bars to move
zone boundaries, edit details in the right panel. Boards are always regenerated from `job.json`, never edited.

Current state: Small cabinet wired end to end (place, move, rotate, resize, zones, checks, board table, save / load, undo).
Other modules are listed but not wired yet.

## Run

First time (installs deps, repairs the Electron binary if needed, creates `The Cab Lab.exe` and a desktop shortcut):

```
TheCabLab.bat
```

After that, use the **The Cab Lab** desktop shortcut, or:

```
npm start
```

`npm start` also rebuilds `renderer/gen/*.js` from the shared generators. The bundles are committed so the
desktop shortcut works without a build step; run `npm run build:generators` after changing a generator.

## Layout

- `main.js` — Electron window, open / save dialogs (IPC)
- `preload.js` — exposes `window.cablab.openJob / saveJob`
- `renderer/space.js` — scene, camera, grid, axes, room, picking helpers
- `renderer/job.js` — `job.json` in memory, undo / redo snapshots, generator result cache
- `renderer/spaces.js` — space kinds (`box` now) → floor polygon, height, obstacles; fit tests
- `renderer/spaceDialog.js` — "Define the space" modal (step 1, also Edit space)
- `renderer/modules.js` — module registry: generator bundle + envelope (W / D / H) + divider handles
- `renderer/cabinets3d.js` — draws boards, envelope, handles from generator output
- `renderer/snap.js` — feature points (space + cabinet corners), face planes for alignment, edge / height inference
- `renderer/interact.js` — left-button interaction: three-step placement, Move command, type-ins, select, resize, dividers, keys
- `renderer/presets.js` — per-module starting sizes (preset H today; a settings UI will edit them)
- `renderer/hud.js` — cursor tooltip
- `renderer/panel.js` — right panel (space or selected cabinet) and drawer tables
- `renderer/ui.js` — shell wiring
- `renderer/gen/` — generated ESM bundles of `../modules/*/generator.ts` (do not edit)
- `build-generators.js` — esbuild script producing `renderer/gen`
- `ensure-electron.js` — repairs a missing `electron.exe`
- `create-desktop-shortcut.ps1` — builds `The Cab Lab.exe` + desktop shortcut (`npm run shortcut`)
- `.cursor/rules/cab-lab-core.mdc` — project contract

## Controls

- Hold wheel: orbit · right-drag: pan · scroll: zoom
- Placing, three steps (SketchUp-style): pick a module → hover shows the face under the cursor (floor, ceiling, any
  wall, any face of a cabinet; blue sheet) → click a corner or grid point on it → draw a flat, zero-thickness rectangle
  on that face and click the opposite corner (a corner anchor takes the face whose edge you move along first — up from a
  floor corner means the wall; walls are see-through, so this also works for the wall nearest the camera) → pull the rectangle off the
  face, one way only (away from the wall / floor / cabinet — it can't be pulled into them) and click. Only the two
  in-plane sizes are typed in step 2; `Enter` creates with the preset size along the face normal (H on floors, D on
  front/back walls, W on side walls). Boxes are axis-aligned; front / side orientation is not assigned yet. After
  creating you stay armed; `Shift+click` repeats the last size at a new corner; typing digits re-sizes the box you just
  made. `Esc` restarts / stops.
- Type-ins: `Tab` or a digit opens W / D / H. Values may be `1110`, `+50`, `-20`, `*2`, `/2`, `max`, or `1110,560,720`
  (comma fills the next fields). Plain numbers apply live; expressions apply on `Tab` / `Enter`.
- Inference: after touching a corner, moving along one of its edges pins that coordinate (dashed axis-coloured line),
  rest on a point of the line for ~0.4 s ("Point kept for the next edge") and a third edge can start from it ·
  vertical faces of walls and cabinets act as guide lines
  ("Flush with cab-1 side", orange dashes) · the extrude step snaps to faces and corners along the normal · hold `Shift` to keep
  the current line. The cursor tooltip always says which rule is active and which dimension was stopped by a wall.
- The box never leaves the space or enters another cabinet: rectangle and extrusion stop at walls and at existing boxes
  (outline turns orange, tooltip names what stopped it, e.g. `H stopped at cab-2`); Move and resize handles stop at the boundary
- Move (`M` or the Move button): click a grab point, then a target point; `Tab` types ΔX / ΔY / ΔZ; `Ctrl+click` copies.
  There is no drag-to-move.
- Blue cubes: pull W / D / H · orange bars: zone boundaries
- `M` move · `R` rotate 90° · `F` frame selection (or space) · `Del` remove · `Esc` cancel / deselect
- `Ctrl+N/O/S` new / open / save (`Ctrl+Shift+S` save as) · `Ctrl+Z/Y` undo / redo · `F12` dev tools
- `Ctrl+Shift+L` open the usage log folder

## Usage log

Every action and every system decision is appended to `logs/usage.jsonl` (git-ignored), one JSON object per line: module armed, anchor point, the last 60 cursor resolutions of a placement (feature / inference / plane, with the world point), typed dimensions, final box, handle drags (envelope before → after), panel edits, space definition, file operations, undo/redo, generator validation errors and uncaught errors (which also write `logs/crash-<time>.json` with the whole job). `logs/latest.json` holds the last action and last error. When something goes wrong, the log is what to read first — see `.cursor/rules/cab-lab-usage-log.mdc`.
