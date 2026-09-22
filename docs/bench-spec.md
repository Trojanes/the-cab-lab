# Generator bench — spec

The bench is a second Electron window that shows **one generator type at a time**
(one tab per generator + preset) and answers, for every board, face, outline
point and joint: *what is its value, which formula produced it, which named
quantities went in*. It is a development tool for the people who write the
generators; it is hidden from shipped builds.

The 3D layer contract does not change: the bench **reads** generator output and
**writes only** rule constants (`rules.json`), pins (`presets.json`), reports
(`logs/bench/`) and log events (`logs/usage.jsonl`). It never edits board
coordinates and never becomes a second source of geometry.

## Layers

| Layer | Opened from | Shows | Unit |
|---|---|---|---|
| L1 main app | — | job, cabinets, placement | cabinet |
| L2 bench · assembly | rail right‑click → *Generator rules…*; cabinet right‑click | boards + joints of one generator run | board / joint / feature point |
| L3 bench · board | L2: right‑click a board → *Edit board…* | one board flattened in its `profilePlane`, every outline / feature point with its formula | point |

Decisions taken 2026‑09‑16:

- Rule constants live in `generators/<module>/rules.json` (data) with a typed
  wrapper `rules.ts`. The bench writes `rules.json` directly, logs the change
  with the reason, rebuilds the bundle (esbuild) and reloads.
- Provenance covers **faces + outline points + feature points** from the first
  version. Named quantities are shown by name; bare literals stay literals
  (`frontStepY1 - (T3_DEPTH_MM - 10)` keeps the `10`).
- OHC `geometry.ts` is refactored to use `dim()`; every number in the existing
  tests must stay identical.
- Pins (expected values) live in `generators/<module>/presets.json` and the
  generator test reads them; hand‑written `box()` asserts are removed.
- Golden OHC preset: **W 2000 × D 400 × H 400**, three equal `up_flap` zones.
- Bench = separate `BrowserWindow`; tabs are independent (no split view).
- Audience: developers only. A generator joins when it uses `boardFrame: "final"` and boards only.
- Reports are files (`logs/bench/<time>-<module>.md`); the agent reads them via
  the usage‑log rule instead of the user pasting text.

## Provenance (`generators/_lib/dim.ts`)

```ts
import { dim, ref, rule, param, beginProvenance, endProvenance } from "../_lib/dim.ts";

const P = param({ H: inputs.cabinetHeight, TCH: inputs.topClearanceHeight });
const t3Top = dim("T3.z1", { H: P.H, TCH: P.TCH }, (t) => t.H - t.TCH - 1);   // → 359
const t3Bottom = dim("T3.z0", { top: ref("T3.z1"), CPT: R.DIVIDER_THICKNESS_MM }, (t) => t.top - t.CPT);
```

- `dim(key, terms, fn)` evaluates `fn(values)` and returns the **number**. It
  records `{ key, value, formula, terms }` in the active collector. `formula`
  is the arrow body of `fn` with the `t.` prefix stripped
  (`"H - TCH - 1"`); pass `{ formula }` as a 4th argument to override.
- A term is one of
  - a plain number → `kind: "value"` (a local intermediate),
  - `param({...}).X` → `kind: "param"` (user input),
  - `RULES.X` → `kind: "rule"` (from `rules.json`, carries `doc`),
  - `ref("other.key")` → `kind: "ref"` (another recorded dim; forms the
    dependency graph).
- `alias(fromPrefix, toPrefix)` copies records so a shared outline template
  (`DividerSide.pt[3].y`) can be exposed per board (`D1.cut[3].y`).
- `beginProvenance()` / `endProvenance()` wrap one generator run. Outside a
  run `dim()` still returns numbers; nothing is kept.

Output on the result: `debug.provenance = { entries: Record<key, Entry>, rules: Record<name, {value, doc}> }`.

### Key conventions

| What | Key |
|---|---|
| board face | `<boardId>.x0` … `<boardId>.z1` |
| `profileVector[i]` component | `<boardId>.pv[i].<x\|y\|z>` (cabinet frame) |
| `cutProfileVector[i]` component | `<boardId>.cut[i].<y\|z>` (board‑local) |
| feature coordinate | `<boardId>.feat.<featureId>.<field>` |
| shared template | `<TemplateName>.pt[i].<c>` (aliased onto boards) |

## Rules (`rules.json` + `rules.ts`)

```json
{
  "T3_DEPTH_MM": { "value": 90, "doc": "Top rear panel depth from the front, mm." }
}
```

`rules.ts`: `export const RULES = defineRules("overheadCabinet", raw)`; each
`RULES.NAME` is `{ name, value, doc, module }` and is accepted as a `dim` term.
Legacy exports (`export const T3_DEPTH_MM = RULES.T3_DEPTH_MM.value`) stay so
nothing else changes. Derived constants (`FEATURE_GROOVE_WIDTH_MM = CPT + 1`)
remain formulas in TS.

Write‑back: main process `bench:rules:write { module, name, value, reason }`
rewrites the JSON, appends `bench.rule.set` to the usage log with
`{ module, name, from, to, reason, affected: [keys] }`, runs esbuild for that
module and answers; the bench reloads and restores its tabs.

## Presets & pins (`presets.json`)

```json
{
  "module": "overheadCabinet",
  "presets": [
    {
      "id": "golden-2000-3",
      "label": "2000 × 400 × 400 · 3 up flaps",
      "params": { "cabinetWidth": 2000, ... },
      "pins": {
        "boards": { "T3": { "x0": 0, "x1": 2000, "y0": 0, "y1": 90, "z0": 344, "z1": 359 } },
        "points": { "D1.cut": [[0, 0], [138.33, 0], ...] },
        "features": { "FP0.HINGE_1": { "x": 100, "z": 366.5 } }
      }
    }
  ]
}
```

- The bench lists presets per tab; **Pin** writes the current value of the
  selected board / point into the active preset.
- `generator.test.ts` iterates presets and asserts every pinned value
  (`assert.deepEqual` at 0.01 mm). Pinned = protected.

## Bench window

- `renderer/bench/index.html` + `bench.js` + `bench.css`; same import map,
  same `space.js` camera (wheel‑drag orbit, right‑drag pan, wheel zoom), same
  board drawing (`renderer/boardGeom.js`, shared with `cabinets3d.js`).
- Tabs: `<module>@<preset>`; `+` lists `MODULES`. Tab state (params, preset,
  selection, camera) is kept in `sessionStorage` across reloads.
- Left (`[` toggles): params folded behind a W × D × H summary (generic form:
  numbers / booleans / strings / JSON for arrays); rules list with docs and
  write‑back, ● = used in this run.
- Centre: 3D. Hover → highlight + tip (id · face/point · value · formula).
  Click board / point / joint. Toolbar: 3D/Top/Front/Side · Explode slider ·
  step nav `◂ n / N · id ▸` · **Explode ▾** · Frame ·
  `⋯` (opacity, X/Y/Z section on the cabinet's materials only, joints / points).
- **Explode** (`renderer/bench/explode.js`, display only — groups move, boards
  never change). Two modes: *assembly* (default) and *radial* (every board away
  from the centre). Assembly reads the result's `joints` and the face features
  made `for` another board (grooves, tongue tags, screw pilots), falls back to
  AABB contact, and derives
  - an **assembly order**: breadth‑first from the carcass board most others are
    joined to (OHC `BP`, small cabinet `SIDE_L`), declared relations before
    bare contact, islands after, fronts last;
  - a **pull direction** per board: the normal of the big face (A / B) taking
    part in its relation with the earliest‑placed board it is joined to (the
    parent's face, else its own), signed by which side of the parent it sits;
    otherwise the axis the two touch along. Offsets are cumulative (a board
    moves with its parent, then one `unit × factor` along its own axis;
    `unit = 0.6 × max(D, H)`), so OHC dividers rise `+Z` off `BP`, `T3` rises
    above them, `T2` / `T1` come forward `-Y`, `T4` back `+Y`, doors `-Y`.
  - **Steps**: `▸` puts the next board in (animated), `◂` takes the last one
    out, `← →` keys do the same; the label (`6 / 12 · T2`) leaves step mode.
    Boards already in sit at home, the one that just went in is highlighted
    with its trail, the rest wait faint at their exploded position.
  - **Trails** (dashed, home → exploded) and **board ids** (sprites, constant
    screen size; the same role ids nesting and labels use) toggle in the
    popover, which also lists the order as clickable chips. The board panel
    shows `assembly step k of N · slides +Z onto BP (groove, tongue)`.
  - Nothing here is a generator contract: order and directions are inferred for
    display; a generator that wants to dictate them will do so through the
    joints it emits.
- Right: selection panel (faces / point / joint) with formula, terms (param
  blue · rule orange · ref purple), dependency tree, *Try a formula*, *Pin*,
  *Edit board*, *Report*.
- Bottom (`]` toggles): **Boards** table; **Audit** — one list, worst first:
  validation errors / warnings, declared joints with measured AABB status,
  undeclared overlaps between two plain plates (outlined boards meet through
  tongues and notches and are skipped), pin diffs. Counts repeat in the status bar.
- Top: tabs · preset select · **Preset ▾** (save, save as, pin all, reports
  folder) · breadcrumb · *Report…*.
- L3: 2D SVG of the board in its plane, point list, local/cabinet toggle,
  tryout box (safe expression evaluator, moves only that point, dashed),
  3D inset.

## Logging (`logs/usage.jsonl`)

`bench.open` `{ module, preset, from: rail|cabinet|env|tab, custom }` · `bench.tab` ·
`bench.preset` · `bench.preset.save` · `bench.param` `{ module, key, from, to }` ·
`bench.select` `{ module, what: board|face|point|joint|key, id, key, keys, value, formula }` ·
`bench.tryout` `{ module, key, formula, expr, from, to }` · `bench.rule.set`
`{ module, name, from, to, reason, affected, boards, preset, path }` ·
`bench.rebuild` `{ module, ok, ms }` · `bench.pin` `{ module, preset, what: board|all, id, count, faces }` ·
`bench.report` `{ module, preset, path, selection, note }` · `bench.board.open` ·
`bench.board.frame` · `bench.view` · `bench.explode`
`{ module, mode: assembly|radial, factor, step (null = all), of, board (the one that just went in), order, how: slider|step|key|chip|panel|mode }`.
(`kind` is reserved for the event name, hence `what`.)

## Running

- `npm run bench` — app + bench (`CABLAB_BENCH=1`, or `=<moduleId>`).
- `npm run test:generators` — Small + Overhead suites, including pins and provenance coverage.
- `npm run pins:check` — compare every preset's pins with the current output;
  `node --experimental-strip-types scripts/pin-presets.ts overheadCabinet --write` re-pins everything (snapshot update; deliberate).
- `node build-generators.js overheadCabinet` — rebuild one bundle (what the bench does after a rule change).
- `CABLAB_BENCH=1 CABLAB_BENCH_SNAP=<file.png>` — screenshot the bench (default view, exploded `-explode.png`,
  six assembly steps in with the Explode popover open `-step.png`, a selected board, the board editor, a selected
  point) and quit; for agent / CI checks without a person at the screen.

## Adding a generator to the bench

1. Faces and outline points through `dim()` / `Outline`; params via `param()`, constants via `RULES`.
2. `rules.json` + `rules.ts` for the workshop constants (with `doc`).
3. `presets.json` with at least one golden preset; seed pins with `scripts/pin-presets.ts <module> --write`.
4. The generator test iterates the presets with `checkPins`.
5. Register the module in `scripts/pin-presets.ts` `GENERATORS`; `build-generators.js` already bundles it.
6. Emit the model layers (`docs/model-spec.md`): `attachFaces(boards)`, then a `faces.ts` that puts every
   feature on its face (`addFeature` on A / B, `tagEdges` on the outline) and resolves `joints`. Pins cover
   `faceFeatures`; the L2 board panel lists **Faces of &lt;id&gt;** and L3 draws A / B features from them.

Reports (`logs/bench/<ISO time>-<module>.md`) contain: module, preset,
params, the selection with its provenance chain, the pinned/expected value,
the user's note, and the affected keys. The agent reads them first when asked
to fix a generator dimension.
