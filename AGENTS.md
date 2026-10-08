# The Cab Lab — agent entry point

Cabinet CAD: parametric generators (`generators/<module>/generator.ts`) →
`job.json` state → 3D renderer. Read `.cursor/rules/` first — it is the
rulebook (`cab-lab-core` contract, `cab-lab-usage-log` event semantics,
`cab-lab-index` file routing).

## Don't read files to find things

Full spec: **`docs/READING-GUIDE.md`** — the routing/index rules all
developers and agents follow. Quick form:

- `docs/MODULE-MAP.md` — every file → exports + `@tags` (regenerate: `npm run module-map`)
- `rg "@owns <logPrefix>"` — which file owns a feature/event
- `rg "@module <area>"` — all files in an area
- Routing table for concepts: `.cursor/rules/cab-lab-index.mdc`

## Invariants

- Z up, mm, front-left floor origin. Never edit `renderer/gen/*` (built).
- `panel/*` ⟂ `interact/*` no cross-imports (`npm run check:deps` enforces).
- Editing = change `job.json`/params then regenerate; undo = snapshots.

## Verify before done

`npm run check:deps && npm run test:job && npm run test:generators` minimum;
`node scripts/e2e-drive.mjs` for real-app pointer/keyboard coverage;
`npm run audit` for generator geometry findings.
