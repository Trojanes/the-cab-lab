# panel/ — right-panel editors

One file per editor page, dispatched by the `panel.js` shell from the
selected module's `editor` field. The shell owns the page frame; the
module owns its fields, drag surfaces and readouts.

## The contract

- Editors read resolved geometry from the generator's `result.debug`
  (`columns`, `stack`, `footprint`…) — never recompute it in the panel.
- A drag/field edit mutates `cabinet.params` through the shell's update
  path (undo = one job snapshot per gesture), never mutates meshes.
- Shared widgets (`el`, `numField`, `section`, `frontSection`,
  `cabinetBox`, `outerSizeFields`, `controlPanelRows`, board drawer)
  live in `widgets.js` — import from there; a new shared widget goes
  there too, not copied into your file.
- Neutral helpers come from `fit.js` / `boardSketch.js` — never from
  `interact/*` (check-deps refuses the other direction too: interact
  must not import you).
- Log under your own prefix (`kitchen.cell.*`, `ohc.zone.*`…) and keep
  the `@owns` header in sync — the usage-log decoder routes by it.

## Adding an editor

new file here → `// @module panel @owns render<X> — …` header → wire
`editor` in the shell's dispatch → `npm run module-map` → `npm run verify`.
