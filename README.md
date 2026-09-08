# The Cab Lab

Cabinet CAD workspace. Metric (mm), Z up, right-handed. Electron + Three.js.

Current state: blank space — floor grid (100 mm minor / 1000 mm major), XYZ axes, orbit camera. No cabinets yet.

## Run

First time (installs deps, repairs the Electron binary if needed, creates `The Cab Lab.exe` and a desktop shortcut):

```
TheCabLab.bat
```

After that, use the **The Cab Lab** desktop shortcut, or:

```
npm start
```

## Layout

- `main.js` — Electron window
- `renderer/` — scene (`space.js`), page, styles
- `ensure-electron.js` — repairs a missing `electron.exe`
- `create-desktop-shortcut.ps1` — builds `The Cab Lab.exe` + desktop shortcut (`npm run shortcut`)
- `.cursor/rules/cab-lab-core.mdc` — project contract (single geometry source, units, what the 3D layer may do)

## Controls

Left drag rotate · right drag pan · wheel zoom · F12 dev tools
