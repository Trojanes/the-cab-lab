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
- `renderer/snap.js` — feature points (space + cabinet corners) and nearest-point lookup
- `renderer/interact.js` — left-button interaction: point-to-point placement with type-ins, select, resize, dividers, R / F / Del / Esc
- `renderer/panel.js` — right panel (space or selected cabinet) and drawer tables
- `renderer/ui.js` — shell wiring
- `renderer/gen/` — generated ESM bundles of `../modules/*/generator.ts` (do not edit)
- `build-generators.js` — esbuild script producing `renderer/gen`
- `ensure-electron.js` — repairs a missing `electron.exe`
- `create-desktop-shortcut.ps1` — builds `The Cab Lab.exe` + desktop shortcut (`npm run shortcut`)
- `.cursor/rules/cab-lab-core.mdc` — project contract

## Controls

- Hold wheel: orbit · right-drag: pan · scroll: zoom
- Placing: pick a module → hover shows a snap sphere on space / cabinet corners (else 10 mm grid) → click to anchor →
  move to size → `Tab` cycles W / D / H type-ins (typed values lock) → click or `Enter` creates · `Esc` restarts
- Inference: after touching a corner, moving along one of its edges pins that coordinate (dashed axis-coloured line);
  the anchor's own axes infer too · hold `Shift` to keep the current inference line
- The box never leaves the space: rubber band and resize handles stop at the boundary
- Left click: select. There is no drag-to-move (moving will be a dedicated command); use the X / Y fields for now
- Blue cubes: pull W / D / H · orange bars: zone boundaries
- `R` rotate 90° · `F` frame selection (or space) · `Del` remove · `Esc` cancel / deselect
- `Ctrl+N/O/S` new / open / save (`Ctrl+Shift+S` save as) · `Ctrl+Z/Y` undo / redo · `F12` dev tools
