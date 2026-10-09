# The Cab Lab — agent entry point

Cabinet CAD: parametric generators (`generators/<module>/generator.ts`) →
`job.json` state → 3D renderer. Read `.cursor/rules/` first — it is the
rulebook (`cab-lab-core` contract, `cab-lab-usage-log` event semantics,
`cab-lab-index` file routing, `cab-lab-dev-loop` the verify gate).

## Don't read files to find things

Full spec: **`docs/READING-GUIDE.md`** — the routing/index rules all
developers and agents follow. Quick form:

- `docs/MODULE-MAP.md` — every file → exports + `@tags` (regenerate: `npm run module-map`)
- `rg "@owns <logPrefix>"` — which file owns a feature/event
- `rg "@module <area>"` — all files in an area
- Routing table for concepts: `.cursor/rules/cab-lab-index.mdc`

## Invariants

- Z up, mm, front-left floor origin. Never edit `renderer/gen/*` (built).
- `panel/*` ⟂ `interact/*` no cross-imports; `modules/*` is owned by the
  `modules.js` registry; `bench/*` is a closed window — nothing outside
  `bench/` imports it (`npm run check:deps` enforces all of it).
- Editing = change `job.json`/params then regenerate; undo = snapshots.
- **The layered architecture is frozen**: new features slot into the
  existing layers; reorganising/splitting/renaming only happens on an
  explicit user request. See `docs/DEV-LOOP.md`.

## Verify before done — the gate is mandatory

A change is unfinished until its tier is green
(full spec: **`docs/DEV-LOOP.md`**):

- `npm run verify:quick` — docs/rules/tests only (~3 s)
- `npm run verify` — renderer/panel/interact/bench/modules changes (~15 s)
- `npm run verify:full` — generators, cnjob, job contract, merges (~4 min)

Report which tier you ran and its result. Never regenerate golden
snapshots to make a suite green without reading
`node scripts/diff-snapshots.mjs --regen` first.
