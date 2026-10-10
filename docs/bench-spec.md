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

## Placement rules (`layout.json`)

Decided 2026‑10‑03 (Generator Rules editor, phase 1 of `GENERATOR_ROOTS_REQUIREMENTS_V2.md`):
where a board sits is data, so the bench can change it and the change survives
regeneration. Today only OHC `T1`–`T4`; every other board is still placed in code.

```json
"T4": {
  "label": "顶部竖板 T4",
  "axes": {
    "x": { "from": "lo", "at": "0", "size": "Cw" },
    "y": { "from": "hi", "at": "Cd - CPT - clearance", "size": "CPT" },
    "z": { "from": "hi", "at": "H", "size": "T4_HEIGHT_MM" }
  }
}
```

- One rule per axis: `from` names the driving face (`lo` = x0 / y0 / z0, `hi` =
  x1 / y1 / z1), `at` is where it sits, `size` the extent. The other face is the
  driving face ± size, so moving one face moves the whole board along that axis
  and keeps its size (default mode); `at: "T1.y1"` is a face relation (face mode)
  in the same record — the two modes never store two answers.
- Names in `at` / `size`: the generator's inputs (`Cw`, `Cd`, `H`, `CPT`, `FPT`,
  `TCH`, `clearance`), rule constants by name, another placed board's face
  (resolved on demand, file order does not matter) or a value recorded earlier
  (`BP.z1`). Arithmetic and `min max abs floor ceil round sqrt` only
  (`generators/_lib/expr.ts`, no eval).
- Provenance keys: `T4.y1` (driving face, formula = `at`), `T4.ySize` (formula =
  `size`), `T4.y0` (`T4.y1 - T4.ySize`). `debug.placement` lists the rules that
  placed each board; a board not in it is still placed in code and is not editable.
- Refused, as `validation.errors` with no boards: unknown name, a chain that comes
  back to its own axis (`T4.x → T5.x → T4.x goes round in a circle`), size ≤ 0, a
  malformed file. A box that no longer matches the board's outline (outlines are
  still in code) is a `validation.warnings` line.
- `generateOverheadCabinet(params, { layout })` uses a draft instead of the file
  (live preview); the main app never passes one.
- `relation: { kind: "contact" | "flush", ref: "T1.y1" }` on an axis = made in face
  mode; `at` must equal `ref`, on the same axis, not the board itself. Contact is
  re-checked every run (boxes still overlap in the plane, else a warning); flush
  implies nothing (no joint, no machining).
- `outline.corners` `{ FL, FR, RR, RL: { u, v } }` (OHC `T3`): corner points in the
  placement frame (from the frame's low corner). The default rectangle keeps
  geometry.ts's outline point for point; otherwise the outline is rebuilt from the
  corners with the divider notches on the rear edge, the box becomes the outline's
  extent (`T3.frame.*` keeps the frame) and the frame never moves. Crossing /
  inside-out corners are refused.
- `features.<id>.depth` (OHC `T3.LED`): one depth for every segment of the logical
  feature (`group: "T3.LED"`, `depthKey` on each face feature, provenance
  `T3.feat.LED.depth`). Depth = board thickness → warning (cuts through); deeper →
  refused; never cut back silently.
- Only boards placed before the rules run can be referenced: today BP (OHC); the
  dividers come later in code (`D1 is placed in code after these boards`).
- Divider notches in T3 / T4 belong to the dividers: when either board's frame is not
  at the cabinet origin (moved, resized, T4 taller), its outline is rebuilt with the
  notches where the dividers are, not carried along with the board (the screw holes
  into the dividers already behave this way, `XDi - T4.x0`). geometry.ts's outline is
  used only while the frame sits at the origin with its default size.

## Generator Rules editor (bench UI)

Decided 2026‑10‑03 (phases 2–5). Right-click a module → *Generator rules…* opens it.

- **Other generators.** The bench shows the formula a face already has. Editing a
  cabinetmaker parameter (a column width, a row height, a cabinet depth) regenerates
  the whole cabinet. A workshop rule (`rules.json`) needs a reason. A computed face
  shows its formula. A face that comes from the space or from another module
  (bedroom width, bed-box width and height) is shown and is not edited here.
  Every board face must have a provenance entry whose value matches the face
  before that module is listed. Bunk and bed box already do. Bedside covers faces
  and outline points. East-west bedroom records every face; a face that was placed
  as a millimetre keeps that number until its own formula is named. Kitchen and
  ensuite (`benchShape: "base"`) edit column widths, row heights, kick and stock,
  and also share `generators/kitchen/layout.json`. Every generator has a
  `layout.json`. It stays empty until a face is edited. Default
  mode and face mode (接触 / 延伸) write a draft for the board that was edited; the
  generator still builds the cabinet, then moves that board's box and keeps its
  size. The outline follows the box. Notches cut into other boards stay where the
  code put them. An axis may carry `when` (the switches this module already has).
  The bench draws that fork under the axis: a switch is a branch only when flipping it changes that face, and each leaf shows its own formula. The open leaf is marked 当前.
  Saving defaults to the open situation; the other situations keep the code
  formula. "这几档用同一条" stores one rule with no `when`. A board this situation
  does not build is left unused; the other rules still apply. The draft is kept until 提交 writes the file. Ensuite offers no
  stove zone. Storage (`benchShape: "tall"`)
  edits width, carcass depth, height, stock and side panels; zone heights trade
  and the stack stays put. Fridge (`benchShape: "fridge"`) edits the cut-out;
  outer width stays `cut-out + side + 3 CPT` and is not typed. Lounge
  (`benchShape: "lounge"`) edits the style and the run sizes that style already
  uses. A lid longer than 1600 still splits by the workshop rule.
- **生成器界面** (right, the page on entry): the module's `benchInputs` (modules.js)
  grouped as a cabinetmaker reads them, Chinese names, a source tag (柜体 / 材料 /
  规则默认; an unset value shows the rule default as placeholder). Changing one
  re-runs every rule and never rewrites a rule. Zones keep their total (the next
  zone absorbs a change). Overhead also draws the zone strip and the front
  elevation, the same editor the main app uses; a module with `frontView` shows
  that elevation above the fields. The left pane is only the placement draft and
  `rules.json`.
- **放置规则 draft box** (left, top): the working copy of `layout.json`. Every edit
  goes through `tryLayout()`: generated first, refused (with the generator's reason)
  if the generator refuses it — the last good draft stays. 撤销 / 重做 (Ctrl+Z / Y),
  放弃, 提交… (reason required; writes `layout.json`, rebuilds the bundle, logs
  `bench.layout.commit`; scope = the generator template). The rebuild is sent to
  the open Cab Lab window, which loads that bundle at once and regenerates
  cabinets of the module. A face relation confirmed in the bench is only `bench.layout.edit` until
  that commit. Closing Generator Rules, or closing The Cab Lab (which closes
  this window with it), drops an uncommitted draft. The bench asks before it
  closes while a draft is dirty. Opening it again starts from the module just
  chosen, not the previous screen. A reload after 提交 keeps the open tab. A commit is refused (`bench.layout.conflict`) when layout.json changed
  after the draft started (another tab, a teammate, the agent): nothing is overwritten.
  The bench always generates from the file / draft, never the copy baked into its
  bundle.
- Opening the bench shows the generator editor on the right. It does not list
  boards, and it does not draw the pink / blue outline dots. Right-click any
  board: 参数调试 · 默认模式, 面的模式, 板件编辑. Those replace the right page
  until 返回整体. A board in `layout.json` (OHC `T1`–`T4`) edits its placement
  rule: a face formula moves that board and keeps its size. Any other board is
  placed in code and the mode shows the formulas it already has. Confirming a new
  box rule for it is refused (`D2 的缺口和槽由代码算，这条位置没有写上`) because
  the outline would stay behind. It can still be picked as a reference face,
  including a notch or a half-slot.
- Right-click a board: 参数调试 · 默认模式 and 面的模式. Orange dimensions
  are read only and show the size as a formula.
  Blue face labels are editable in place. In default mode a row under the 3D
  view lists the module's first-level parameters (`sym` on `benchInputs`, not
  rule constants). Drag one onto a blue formula to append it; drag a chip in
  a blue formula back onto that row to remove it. Orange sizes do not take a drop.
- Clicking an outline point shows that point's two formulas, expanded the same
  way. The drawing does not label points `P0`, `P1`, …
- **默认模式**: other boards at 18 % opacity; six position labels (blue, ● = driving
  face) and three dimension lines (orange) — labels are an HTML overlay laid out in
  screen space so they never overlap. Panel: per axis, the two faces editable (typing
  a formula on a face makes it the driving face, the size stays: whole-board move),
  the size read-only. Formulas show the stored symbols (`CPT`, `Cw`, `T1.y1`);
  Chinese names still parse if typed (`ruleText.js`).
  Features that did not follow the board are listed with the formula that ties them
  (e.g. T4 screw holes `XDi - T4.x0`).
- **面的模式**: other boards stay solid. **移动 M** drags only the board under
  edit (`bench.face.move`; the highlight plane is parented on that board and
  moves with it; `nudge` is display only, 放回 or leaving the mode puts it back). Then ① a face of this board, ② a face of another board (
  pickable; the raycast looks through them). A notch step, each axis-aligned wall of that notch, a half-slot's walls and floor (groove / T-groove), and a through opening's walls are faces. A slanted edge and a round hole are not: a relation is one axis.
  Then 接触 or 延伸, plus an optional gap in mm (contact still requires the
  outlines to overlap; the gap is how far short of touching they stop). Confirming
  clears the display nudge and the board is already at the new place before 返回整体.
  Preview: the move along
  that one axis, the rule it replaces, the real contact area (`faceRegion.js`: outline
  polygon for big faces, outline edges on the side for edge faces — a notch is not
  solid). Refused: different axes, contact between same-facing faces, contact with
  no overlap, a circle. Relations listed with 查看 / 改成公式.
- **板件编辑** (the board page): corner formulas (u, v), draggable in the 2D view (a
  corner a notch cut away is a dashed handle); a drag appends `+ Δ` (0.5 mm) to the
  formula. Feature depth: one field per logical feature; clicking any segment in 2D
  focuses it and highlights every segment.
- Checks over the debugging port: `window.__bench` (tryLayout, enterMode, pickFace,
  screenOf, labelRects …) — the same entry points the UI uses.

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

- `renderer/bench/index.html` + `bench.css` + the `bench/` module dir
  (`bench.js` shell — tabs/rules list/draft commit/presets/`__bench`/boot;
  siblings own state `core.js`, param forms `paramsForm.js`, board modes
  `modes.js`, 3D `view3d.js`, selection `selection.js`, footer `statusPane.js`,
  L3 `l3.js`, chrome `chrome.js`); same import map,
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
- Status bar: error / warning / pin counts (validation, joint gaps and overlaps,
  undeclared overlaps of two plain plates, pin diffs). Outlined boards meet
  through tongues and notches and are not counted as overlaps.
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
